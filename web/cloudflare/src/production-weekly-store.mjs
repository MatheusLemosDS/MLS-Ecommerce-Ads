import {readIncurredProduction} from './incurred-production.mjs';
import {productionWeeklyPeriod,productionWeeklyNextClose,productionWeeklyEndDates,productionWeeklyAffectedEnds,productionWeeklyRecordHash,prepareProductionWeeklySource,buildProductionWeeklyReportFromSource} from './production-weekly-close.mjs';

export class ProductionWeeklyClosingError extends Error{constructor(code,status=400,options){super(code,options);this.status=status;}}
export const PRODUCTION_WEEKLY_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS production_weekly_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,mutation_id TEXT NOT NULL,updated_at INTEGER NOT NULL,activated_at INTEGER NOT NULL,last_tick_at INTEGER,last_success_at INTEGER,next_close_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS production_weekly_assignments(record_id TEXT PRIMARY KEY,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=4096))`,
 `CREATE TABLE IF NOT EXISTS production_weekly_audit(request_id TEXT PRIMARY KEY,request_hash TEXT NOT NULL,revision INTEGER NOT NULL UNIQUE,record_id TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=16384),actor TEXT NOT NULL,created_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS production_weekly_reports(week_end_date TEXT NOT NULL,version INTEGER NOT NULL,content_hash TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=4096),payload_hash TEXT NOT NULL,source_revision INTEGER NOT NULL,timing_revision INTEGER NOT NULL,captured_at INTEGER NOT NULL,origin TEXT NOT NULL CHECK(origin='cron'),PRIMARY KEY(week_end_date,version))`,
 `CREATE TABLE IF NOT EXISTS production_weekly_guard(id INTEGER PRIMARY KEY CHECK(id=1),ok INTEGER NOT NULL CONSTRAINT production_weekly_atomic_guard CHECK(ok=1))`,
];
const names=['production_weekly_state','production_weekly_assignments','production_weekly_audit','production_weekly_reports','production_weekly_guard'],encoder=new TextEncoder();
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&value.trim()===value&&value.normalize('NFC')===value&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);
const fail=(code,status=503)=>{throw new ProductionWeeklyClosingError('PRODUCTION_WEEKLY_'+code,status);};
const canonical=value=>plain(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):Array.isArray(value)?value.map(canonical):value;
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(canonical(value))))),byte=>byte.toString(16).padStart(2,'0')).join('');}
function database(env){const db=env?.ADMIN_DB;if(!db?.prepare||!db?.batch)fail('UNAVAILABLE');return db;}
function clock(now){let value;try{value=now();}catch{}if(!integer(value,1,9999999999999))fail('CLOCK_INVALID');return Math.floor(value/1000);}
function selectedMonth(value,stamp){try{if(!exact(value,['month']))throw Error();productionWeeklyEndDates(value.month,stamp);return value.month;}catch{fail('REQUEST_INVALID',400);}}
async function tableNames(db){
 const rows=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('production_weekly_state','production_weekly_assignments','production_weekly_audit','production_weekly_reports','production_weekly_guard','incurred_production_state')").all();
 if(rows?.success===false||!Array.isArray(rows?.results))fail('STORAGE_INVALID');const found=new Set(rows.results.map(row=>row?.name)),count=names.filter(name=>found.has(name)).length;
 if(count!==0&&count!==names.length)fail('STORAGE_INVALID');return found;
}
async function ensure(db,stamp){
 if(!(await tableNames(db)).has(names[0]))await db.batch(PRODUCTION_WEEKLY_SCHEMA.map(sql=>db.prepare(sql)));
 await db.prepare('INSERT OR IGNORE INTO production_weekly_state(id,revision,mutation_id,updated_at,activated_at,last_tick_at,last_success_at,next_close_at) VALUES(1,0,?,?,?,NULL,NULL,?)').bind(crypto.randomUUID(),stamp,stamp,productionWeeklyNextClose(stamp).end_at).run();
}
const reportKeys=['schema','week_end_date','period_start_at','period_end_at','captured_at','source_revision','timing_revision','capture_kind','report_version','content_hash','status','active_records','produced_quantity','known_cost_quantity','unknown_cost_quantity','boundary_pending_records','boundary_pending_quantity','known_cost_cents','total_cost_cents','pending','basis'];
function storedReport(value,stamp){
 if(!exact(value,reportKeys)||value.schema!=='production_weekly_report_v1'||value.basis!=='CONFIRMED_MANUFACTURE_RECORDS_NOT_ALL_STORE_OR_CASH'||!hash(value.content_hash)||!integer(value.captured_at,1,stamp)||!integer(value.source_revision,0,2147483645)||!integer(value.timing_revision,0,2147483645)||!integer(value.report_version,1,5000)||!['RETROSPECTIVE','SCHEDULED','RESTATEMENT'].includes(value.capture_kind)||!['NO_RECORDS','PENDING','RECORDED_COSTS'].includes(value.status))fail('STORAGE_INVALID');
 const period=productionWeeklyPeriod(value.week_end_date);if(value.period_start_at!==period.start_at||value.period_end_at!==period.end_at||value.period_end_at>value.captured_at||(value.report_version===1?value.capture_kind==='RESTATEMENT':value.capture_kind!=='RESTATEMENT'))fail('STORAGE_INVALID');
 for(const key of ['active_records','produced_quantity','known_cost_quantity','unknown_cost_quantity','boundary_pending_records','boundary_pending_quantity','known_cost_cents'])if(!integer(value[key]))fail('STORAGE_INVALID');
 if(value.produced_quantity!==value.known_cost_quantity+value.unknown_cost_quantity||value.active_records>value.produced_quantity||value.boundary_pending_records>value.boundary_pending_quantity||value.known_cost_quantity===0&&value.known_cost_cents!==0)fail('STORAGE_INVALID');
 const pending=[];if(value.active_records===0&&value.boundary_pending_records===0)pending.push('NO_PRODUCTION_RECORDS');if(value.unknown_cost_quantity>0)pending.push('UNKNOWN_UNIT_COST');if(value.boundary_pending_records>0)pending.push('BOUNDARY_TIME_REQUIRED');
 const status=value.active_records===0&&value.boundary_pending_records===0?'NO_RECORDS':value.unknown_cost_quantity>0||value.boundary_pending_records>0?'PENDING':'RECORDED_COSTS';
 if(value.status!==status||JSON.stringify(value.pending)!==JSON.stringify(pending)||(status==='RECORDED_COSTS'?value.total_cost_cents!==value.known_cost_cents:value.total_cost_cents!==null))fail('STORAGE_INVALID');
 return value;
}
function assignment(value,stamp){
 if(!exact(value,['record_id','record_hash','before13_quantity','at_or_after13_quantity','confirmed_at','reason'])||!uuid(value.record_id)||!hash(value.record_hash)||!integer(value.before13_quantity,0,10000)||!integer(value.at_or_after13_quantity,0,10000)||!integer(value.before13_quantity+value.at_or_after13_quantity,1,10000)||!integer(value.confirmed_at,1,stamp)||!text(value.reason,240))fail('STORAGE_INVALID');return value;
}
const stateKeys=['revision','mutation_id','updated_at','activated_at','last_tick_at','last_success_at','next_close_at'];
async function snapshot(env,stamp,requestId=''){
 const db=database(env);
 for(let attempt=0;attempt<3;attempt++){
  const ledger=await readIncurredProduction(env,{now:()=>stamp*1000}),found=await tableNames(db),physical=found.has('incurred_production_state'),sourceQuery=physical?'SELECT revision FROM incurred_production_state WHERE id=1':'SELECT 0 AS revision';
  if(!found.has(names[0])){
   const source=await db.prepare(sourceQuery).all();if(source?.success===false||!Array.isArray(source?.results)||source.results.length>1)fail('STORAGE_INVALID');
   if((source.results[0]?.revision??0)!==ledger.revision)continue;
   return {ledger,state:null,assignments:[],reports:[],replay:null,physical};
  }
  const values=await db.batch([
   db.prepare('SELECT revision,mutation_id,updated_at,activated_at,last_tick_at,last_success_at,next_close_at FROM production_weekly_state WHERE id=1'),
   db.prepare('SELECT record_id,payload FROM production_weekly_assignments ORDER BY record_id LIMIT 1001'),
   db.prepare('SELECT week_end_date,version,content_hash,payload,payload_hash,source_revision,timing_revision,captured_at,origin FROM production_weekly_reports ORDER BY week_end_date,version LIMIT 5001'),
   db.prepare('SELECT COUNT(*) AS count,MIN(revision) AS first_revision,MAX(revision) AS last_revision FROM production_weekly_audit'),
   db.prepare('SELECT request_hash,record_id FROM production_weekly_audit WHERE request_id=?').bind(requestId),
   db.prepare(sourceQuery),
  ]);
  if(!Array.isArray(values)||values.length!==6||values.some(value=>value?.success===false||!Array.isArray(value?.results))||values[0].results.length!==1||values[1].results.length>1000||values[2].results.length>5000||values[3].results.length!==1||values[4].results.length>1||values[5].results.length>1)fail('STORAGE_INVALID');
  if((values[5].results[0]?.revision??0)!==ledger.revision)continue;
  const state=values[0].results[0],stats=values[3].results[0],assignments=[],reports=[];
  if(!exact(state,stateKeys)||!integer(state.revision,0,2147483645)||!uuid(state.mutation_id)||!integer(state.activated_at,1,stamp)||!integer(state.updated_at,state.activated_at,stamp)||!integer(state.next_close_at,1,9999999999)||![state.last_tick_at,state.last_success_at].every(value=>value===null||integer(value,state.activated_at,stamp))||state.last_success_at!==null&&(state.last_tick_at===null||state.last_success_at>state.last_tick_at)||!exact(stats,['count','first_revision','last_revision'])||stats.count!==state.revision||(state.revision===0?stats.first_revision!==null||stats.last_revision!==null:stats.first_revision!==1||stats.last_revision!==state.revision))fail('STORAGE_INVALID');
  for(const row of values[1].results){let value;try{if(!exact(row,['record_id','payload'])||typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>4096)throw Error();value=JSON.parse(row.payload);}catch{fail('STORAGE_INVALID');}assignment(value,stamp);if(value.record_id!==row.record_id)fail('STORAGE_INVALID');assignments.push(value);}
  const versions=new Map();
  for(const row of values[2].results){
   if(!exact(row,['week_end_date','version','content_hash','payload','payload_hash','source_revision','timing_revision','captured_at','origin'])||row.origin!=='cron'||typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>4096||!hash(row.payload_hash))fail('STORAGE_INVALID');
   let value;try{value=storedReport(JSON.parse(row.payload),stamp);}catch{fail('STORAGE_INVALID');}
   if(await digest(value)!==row.payload_hash||value.week_end_date!==row.week_end_date||value.report_version!==row.version||value.content_hash!==row.content_hash||value.source_revision!==row.source_revision||value.timing_revision!==row.timing_revision||value.captured_at!==row.captured_at||value.source_revision>ledger.revision||value.timing_revision>state.revision)fail('STORAGE_INVALID');
   const previous=versions.get(value.week_end_date);
   if(value.report_version!==(previous?.report_version??0)+1||previous&&(value.captured_at<previous.captured_at||value.source_revision<previous.source_revision||value.timing_revision<previous.timing_revision||value.content_hash===previous.content_hash))fail('STORAGE_INVALID');
   versions.set(value.week_end_date,value);reports.push(value);
  }
  const replay=values[4].results[0]??null;if(replay&&(!exact(replay,['request_hash','record_id'])||!hash(replay.request_hash)||!uuid(replay.record_id)))fail('STORAGE_INVALID');
  return {ledger,state,assignments,reports,replay,physical};
 }
 fail('SOURCE_CHANGED',409);
}
// Narrow read adapter for coverage attestations. It validates physical facts and
// Friday partitions without scanning or rewriting immutable weekly reports.
export async function readProductionCoverageSource(env,{now=()=>Date.now()}={}){
 const stamp=clock(now),db=database(env);
 for(let attempt=0;attempt<3;attempt++){
  const ledger=await readIncurredProduction(env,{now:()=>stamp*1000}),found=await tableNames(db),physical=found.has('incurred_production_state'),timing_present=found.has(names[0]);
  const ledgerSql=physical?'SELECT revision FROM incurred_production_state WHERE id=1':'SELECT 0 AS revision',queries=[];
  if(timing_present)queries.push(db.prepare('SELECT revision,mutation_id,updated_at,activated_at,last_tick_at,last_success_at,next_close_at FROM production_weekly_state WHERE id=1'),db.prepare('SELECT record_id,payload FROM production_weekly_assignments ORDER BY record_id LIMIT 1001'),db.prepare('SELECT COUNT(*) AS count,MIN(revision) AS first_revision,MAX(revision) AS last_revision FROM production_weekly_audit'));
  queries.push(db.prepare(ledgerSql),db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('production_weekly_state','incurred_production_state')"));
  const values=await db.batch(queries),offset=timing_present?3:0;
  if(!Array.isArray(values)||values.length!==queries.length||values.some(v=>v?.success===false||!Array.isArray(v?.results))||values[offset].results.length>1)fail('STORAGE_INVALID');
  const present=new Set(values[offset+1].results.map(v=>v.name));if(present.has('production_weekly_state')!==timing_present||present.has('incurred_production_state')!==physical||(values[offset].results[0]?.revision??0)!==ledger.revision)continue;
  let timing_revision=0;const assignments=[];
  if(timing_present){
   if(values[0].results.length!==1||values[1].results.length>1000||values[2].results.length!==1)fail('STORAGE_INVALID');
   const state=values[0].results[0],stats=values[2].results[0];
   if(!exact(state,stateKeys)||!integer(state.revision,0,2147483645)||!uuid(state.mutation_id)||!integer(state.activated_at,1,stamp)||!integer(state.updated_at,state.activated_at,stamp)||!integer(state.next_close_at,1,9999999999)||![state.last_tick_at,state.last_success_at].every(v=>v===null||integer(v,state.activated_at,stamp))||state.last_success_at!==null&&(state.last_tick_at===null||state.last_success_at>state.last_tick_at)||!exact(stats,['count','first_revision','last_revision'])||stats.count!==state.revision||(state.revision===0?stats.first_revision!==null||stats.last_revision!==null:stats.first_revision!==1||stats.last_revision!==state.revision))fail('STORAGE_INVALID');
   timing_revision=state.revision;
   for(const row of values[1].results){let value;try{if(!exact(row,['record_id','payload'])||typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>4096)throw Error();value=JSON.parse(row.payload);}catch{fail('STORAGE_INVALID');}assignment(value,stamp);if(value.record_id!==row.record_id)fail('STORAGE_INVALID');assignments.push(value);}
  }
  return {ledger,assignments,ledger_revision:ledger.revision,timing_revision,physical,timing_present};
 }
 fail('SOURCE_CHANGED',409);
}
async function workspace(observed,month,stamp){
 const {ledger,state,assignments,reports}=observed,revision=state?.revision??0,ends=productionWeeklyEndDates(month,stamp),allowed=new Set(ends),prepared=await prepareProductionWeeklySource(ledger,assignments),weeks=[],boundary_records=[],timing=new Map(assignments.map(row=>[row.record_id,row]));
 for(const end_date of ends){
  const current={...await buildProductionWeeklyReportFromSource(prepared,end_date),timing_revision:revision},history=reports.filter(row=>row.week_end_date===end_date),original=history[0]??null,latest=history.at(-1)??null;
  weeks.push({end_date,current,original,latest,versions_count:history.length,delta_cents:original?.total_cost_cents!==null&&original?.total_cost_cents!==undefined&&latest?.total_cost_cents!==null&&latest?.total_cost_cents!==undefined?latest.total_cost_cents-original.total_cost_cents:null,needs_restatement:latest!==null&&current.content_hash!==latest.content_hash});
 }
 for(const row of ledger.records){
  if(row.status!=='ACTIVE')continue;const affected_end_dates=productionWeeklyAffectedEnds(row.produced_date);if(affected_end_dates.length!==2||!affected_end_dates.some(end=>allowed.has(end)))continue;
  const record_hash=await productionWeeklyRecordHash(row),choice=timing.get(row.record_id),valid=!!choice&&choice.record_hash===record_hash&&choice.before13_quantity+choice.at_or_after13_quantity===row.quantity;
  boundary_records.push({record_id:row.record_id,record_hash,production_ref:row.production_ref,produced_date:row.produced_date,quantity:row.quantity,unit_cost_cents:row.cost.state==='DECLARED'?row.cost.unit_cost_cents:null,before13_quantity:valid?choice.before13_quantity:null,at_or_after13_quantity:valid?choice.at_or_after13_quantity:null,assignment_status:valid?'CONFIRMED':choice?'STALE':'PENDING',affected_end_dates});
 }
 return {schema:'production_weekly_closing_workspace_v1',checked_at:stamp,month,timezone:'America/Sao_Paulo',revision,source:{ledger_revision:ledger.revision,checked_at:ledger.checked_at},policy:{enabled:true,weekday:5,hour:13,minute:0,next_close_at:productionWeeklyNextClose(stamp).end_at},weeks,boundary_records,basis:'OPERATOR_CONFIRMED_MANUFACTURE_WEEK_NOT_SALES_OR_PAID_CASH',financial_integration_allowed:false};
}
export async function readProductionWeeklyClosingWorkspace(env,input,{now=()=>Date.now()}={}){
 try{const stamp=clock(now),month=selectedMonth(input,stamp);return workspace(await snapshot(env,stamp),month,stamp);}catch(error){if(error instanceof ProductionWeeklyClosingError)throw error;throw new ProductionWeeklyClosingError('PRODUCTION_WEEKLY_UNAVAILABLE',503,{cause:error});}
}
function request(body,stamp){
 const keys=['action','month','request_id','revision','ledger_revision','record_id','record_hash','before13_quantity','at_or_after13_quantity','confirmed','reason'];
 if(!exact(body,keys)||body.action!=='assign_boundary'||!uuid(body.request_id)||!uuid(body.record_id)||!hash(body.record_hash)||!integer(body.revision,0,2147483644)||!integer(body.ledger_revision,0,2147483645)||!integer(body.before13_quantity,0,10000)||!integer(body.at_or_after13_quantity,0,10000)||!integer(body.before13_quantity+body.at_or_after13_quantity,1,10000)||body.confirmed!==true||!text(body.reason,240))fail('REQUEST_INVALID',400);
 selectedMonth({month:body.month},stamp);return canonical(body);
}
function ledgerGuard(observed){return observed.physical?{sql:'COALESCE((SELECT revision FROM incurred_production_state WHERE id=1),0)=?',args:[observed.ledger.revision]}:{sql:"NOT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='incurred_production_state')",args:[]};}
export async function mutateProductionWeeklyClosingWorkspace(env,input,actor,{now=()=>Date.now()}={}){
 try{
  const stamp=clock(now),body=request(input,stamp);if(!text(actor,256))fail('REQUEST_INVALID',400);
  const db=database(env);await ensure(db,stamp);const observed=await snapshot(env,stamp,body.request_id),request_hash=await digest(body);
  if(observed.replay){if(observed.replay.request_hash!==request_hash||observed.replay.record_id!==body.record_id)fail('CONFLICT',409);return workspace(observed,body.month,stamp);}
  if(observed.state.revision!==body.revision)fail('CONFLICT',409);if(observed.ledger.revision!==body.ledger_revision)fail('SOURCE_CHANGED',409);
  const record=observed.ledger.records.find(row=>row.record_id===body.record_id);
  if(!record||record.status!=='ACTIVE'||productionWeeklyAffectedEnds(record.produced_date).length!==2||await productionWeeklyRecordHash(record)!==body.record_hash||body.before13_quantity+body.at_or_after13_quantity!==record.quantity)fail('SOURCE_CHANGED',409);
  const serial=body.revision+1,mutation=crypto.randomUUID(),previous=observed.assignments.find(row=>row.record_id===body.record_id)??null,changed={record_id:body.record_id,record_hash:body.record_hash,before13_quantity:body.before13_quantity,at_or_after13_quantity:body.at_or_after13_quantity,confirmed_at:stamp,reason:body.reason},payload=JSON.stringify(changed),source=ledgerGuard(observed),claim='EXISTS(SELECT 1 FROM production_weekly_state WHERE id=1 AND revision=? AND mutation_id=?)',claimArgs=[serial,mutation];
  const results=await db.batch([
   db.prepare('UPDATE production_weekly_state SET revision=revision+1,mutation_id=?,updated_at=? WHERE id=1 AND revision=? AND updated_at<=? AND '+source.sql+' AND EXISTS(SELECT 1 FROM incurred_production_records WHERE record_id=? AND payload=?)').bind(mutation,stamp,body.revision,stamp,...source.args,record.record_id,JSON.stringify(record)),
   db.prepare('INSERT INTO production_weekly_assignments(record_id,payload) SELECT ?,? WHERE '+claim+' ON CONFLICT(record_id) DO UPDATE SET payload=excluded.payload').bind(body.record_id,payload,...claimArgs),
   db.prepare('INSERT INTO production_weekly_audit(request_id,request_hash,revision,record_id,payload,actor,created_at) SELECT ?,?,?,?,?,?,? WHERE '+claim).bind(body.request_id,request_hash,serial,body.record_id,JSON.stringify({request:body,previous_assignment:previous,new_assignment:changed}),actor,stamp,...claimArgs),
   db.prepare('INSERT INTO production_weekly_guard(id,ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM production_weekly_assignments WHERE record_id=? AND payload=?) AND EXISTS(SELECT 1 FROM production_weekly_audit WHERE request_id=? AND request_hash=? AND revision=?) THEN 1 ELSE 0 END WHERE '+claim+' ON CONFLICT(id) DO UPDATE SET ok=excluded.ok').bind(body.record_id,payload,body.request_id,request_hash,serial,...claimArgs),
  ]);
  if(results[0]?.meta?.changes!==1){const replay=await db.prepare('SELECT request_hash,record_id FROM production_weekly_audit WHERE request_id=?').bind(body.request_id).first();if(replay?.request_hash!==request_hash||replay?.record_id!==body.record_id)fail('CONFLICT',409);}
  else if(results.some(row=>row?.success===false||row?.meta?.changes!==1))fail('STORAGE_INVALID');
  return readProductionWeeklyClosingWorkspace(env,{month:body.month},{now});
 }catch(error){if(error instanceof ProductionWeeklyClosingError)throw error;throw new ProductionWeeklyClosingError('PRODUCTION_WEEKLY_UNAVAILABLE',503,{cause:error});}
}
export async function runProductionWeeklyClosing(env,{now=()=>Date.now()}={}){
 try{
  const stamp=clock(now),next=productionWeeklyNextClose(stamp);
  // Reserve a local-maintenance invocation every ten minutes. Friday13:00 is
  // included; other minute ticks retain their full existing collection budget.
  // This clock-only gate runs before even inspecting the database binding.
  if(new Date(stamp*1000).getUTCMinutes()%10!==0)return {status:'NOT_DUE',worked:false,reports_written:0,checked_at:stamp,next_close_at:next.end_at};
  const db=database(env);await ensure(db,stamp);
  await db.prepare('UPDATE production_weekly_state SET last_tick_at=?,next_close_at=? WHERE id=1 AND (last_tick_at IS NULL OR last_tick_at<=?)').bind(stamp,next.end_at,stamp).run();
  const observed=await snapshot(env,stamp),prepared=await prepareProductionWeeklySource(observed.ledger,observed.assignments),latestClosed=productionWeeklyPeriod(next.start_date),ends=new Set(),histories=new Map();
  for(let i=0;i<12;i++){const day=new Date(Date.parse(latestClosed.end_date+'T12:00:00Z')-i*604800000).toISOString().slice(0,10);ends.add(day);}
  for(const row of observed.ledger.records)for(const end of productionWeeklyAffectedEnds(row.produced_date))if(productionWeeklyPeriod(end).end_at<=stamp)ends.add(end);
  for(const row of observed.reports){ends.add(row.week_end_date);const rows=histories.get(row.week_end_date)??[];rows.push(row);histories.set(row.week_end_date,rows);}
  const work=[];
  for(const end of [...ends].sort().reverse()){
   const current={...await buildProductionWeeklyReportFromSource(prepared,end),timing_revision:observed.state.revision},history=histories.get(end)??[],latest=history.at(-1)??null;
   if(current.status!=='OPEN'&&latest?.content_hash!==current.content_hash)work.push({current,history,priority:end===latestClosed.end_date?0:latest?1:observed.ledger.records.some(row=>productionWeeklyAffectedEnds(row.produced_date).includes(end))?2:3});
  }
  work.sort((a,b)=>a.priority-b.priority||b.current.week_end_date.localeCompare(a.current.week_end_date));let written=0;
  for(const item of work.slice(0,2)){
   const {current,history}=item,last=history.at(-1)??null,value={...current,report_version:history.length+1,capture_kind:history.length?'RESTATEMENT':current.period_end_at<observed.state.activated_at?'RETROSPECTIVE':'SCHEDULED'};storedReport(value,stamp);
   const source=ledgerGuard(observed),sourceSql=source.sql+' AND EXISTS(SELECT 1 FROM production_weekly_state WHERE id=1 AND revision=? AND mutation_id=?) AND COALESCE((SELECT MAX(version) FROM production_weekly_reports WHERE week_end_date=?),0)=? AND (SELECT COUNT(*) FROM production_weekly_reports)<5000';
   const result=await db.prepare("INSERT OR IGNORE INTO production_weekly_reports(week_end_date,version,content_hash,payload,payload_hash,source_revision,timing_revision,captured_at,origin) SELECT ?,?,?,?,?,?,?,?,'cron' WHERE "+sourceSql).bind(value.week_end_date,value.report_version,value.content_hash,JSON.stringify(value),await digest(value),value.source_revision,value.timing_revision,stamp,...source.args,observed.state.revision,observed.state.mutation_id,value.week_end_date,last?.report_version??0).run();
   if(result?.meta?.changes!==1)return {status:'SOURCE_CHANGED',worked:true,reports_written:written,checked_at:stamp,next_close_at:next.end_at};written++;
  }
  await db.prepare('UPDATE production_weekly_state SET last_success_at=? WHERE id=1 AND last_tick_at=?').bind(stamp,stamp).run();
  return {status:'COMPLETE',worked:true,reports_written:written,checked_at:stamp,next_close_at:next.end_at};
 }catch(error){if(error instanceof ProductionWeeklyClosingError)throw error;throw new ProductionWeeklyClosingError('PRODUCTION_WEEKLY_UNAVAILABLE',503,{cause:error});}
}
