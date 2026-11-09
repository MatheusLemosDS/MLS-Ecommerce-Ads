import {readProductionCoverageSource} from './production-weekly-store.mjs';
import {productionWeeklyPeriod,productionWeeklyNextClose,productionWeeklyRecordHash} from './production-weekly-close.mjs';

export class ProductionCoverageError extends Error{constructor(code,status=503,options){super('PRODUCTION_COVERAGE_'+code,options);this.status=status;}}
const fail=(code,status=503)=>{throw new ProductionCoverageError(code,status);},encoder=new TextEncoder();
const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&v.normalize('NFC')===v&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
const canonical=v=>plain(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):Array.isArray(v)?v.map(canonical):v;
const digest=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(canonical(v))))),b=>b.toString(16).padStart(2,'0')).join('');
const clock=now=>{let n;try{n=now();}catch{}if(!int(n,1,9999999999999))fail('CLOCK_INVALID');return Math.floor(n/1000);};
const day=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const shift=(v,n)=>new Date(Date.parse(v+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
function selected(input,stamp){try{if(!exact(input,['week_end'])||!day(input.week_end)||input.week_end>productionWeeklyNextClose(stamp).end_date)throw Error();const p=productionWeeklyPeriod(input.week_end);if(p.start_date<'2000-01-01')throw Error();return input.week_end;}catch{fail('REQUEST_INVALID',400);}}
function intervals(end){
 const p=productionWeeklyPeriod(end),civil=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
 // Find the first instant of each civil day; midnight can be skipped by old DST.
 const start=date=>{const mid=Date.parse(date+'T12:00:00Z')/1000;let lo=mid-129600,hi=mid+129600;while(lo<hi){const at=Math.floor((lo+hi)/2);if(civil.format(new Date(at*1000))<date)lo=at+1;else hi=at;}if(civil.format(new Date(lo*1000))!==date)fail('CLOCK_INVALID');return lo;};
 const rows=[{date:p.start_date,part:'AT_OR_AFTER_13',start_at:p.start_at,end_at:start(shift(p.start_date,1))}];
 for(let n=1;n<7;n++){const date=shift(p.start_date,n);rows.push({date,part:'DAY',start_at:start(date),end_at:start(shift(date,1))});}
 rows.push({date:end,part:'BEFORE_13',start_at:start(end),end_at:p.end_at});return rows.map(r=>({key:r.date+':'+r.part,...r}));
}

export function projectProductionCoverageWorkspace(value){
 try{
  const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v)),exact=(v,ks)=>plain(v)&&Reflect.ownKeys(v).length===ks.length&&ks.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
  const int=(v,a=0,b=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=a&&v<=b,hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),date=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  const text=v=>typeof v==='string'&&v.length>0&&v.length<=240&&v.trim()===v&&v.normalize('NFC')===v&&!/[\u0000-\u001f\u007f-\u009f]/.test(v),dense=(v,n)=>Array.isArray(v)&&v.length===n&&Reflect.ownKeys(v).length===n+1&&Array.from({length:n},(_,i)=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(i))||{},'value')).every(Boolean);
  if(!exact(value,['schema','checked_at','week_end','revision','source','period','intervals','summary','basis'])||value.schema!=='production_coverage_workspace_v1'||value.basis!=='OWNER_CONFIRMED_MANUFACTURING_COMPLETENESS_NOT_CASH_OR_SALES'||!int(value.checked_at,1,9999999999)||!date(value.week_end)||new Date(value.week_end+'T12:00:00Z').getUTCDay()!==5||!int(value.revision,0,2147483645)||!exact(value.source,['ledger_revision','timing_revision'])||!int(value.source.ledger_revision,0,2147483645)||!int(value.source.timing_revision,0,2147483645)||!exact(value.period,['start_at','end_at','timezone'])||value.period.timezone!=='America/Sao_Paulo'||!dense(value.intervals,8))return null;
  const shift=(v,n)=>new Date(Date.parse(v+'T12:00:00Z')+n*86400000).toISOString().slice(0,10),civil=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}),parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const start=d=>{const mid=Date.parse(d+'T12:00:00Z')/1000;let lo=mid-129600,hi=mid+129600;while(lo<hi){const at=Math.floor((lo+hi)/2);if(civil.format(new Date(at*1000))<d)lo=at+1;else hi=at;}return civil.format(new Date(lo*1000))===d?lo:null;},close=d=>{const target=Date.parse(d+'T13:00:00Z');let at=target;for(let n=0;n<4;n++){const p=Object.fromEntries(parts.formatToParts(new Date(at)).filter(v=>v.type!=='literal').map(v=>[v.type,Number(v.value)])),diff=target-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);if(!diff)return at/1000;at+=diff;}return null;};
  const first=shift(value.week_end,-7),today=civil.format(new Date(value.checked_at*1000));let next=shift(today,(5-new Date(today+'T12:00:00Z').getUTCDay()+7)%7);if(close(next)<=value.checked_at)next=shift(next,7);
  if(!date(first)||value.week_end>next||value.period.start_at!==close(first)||value.period.end_at!==close(value.week_end))return null;
  let quantity=0n,known=0n,unknown=0n,pending=0,confirmed=0,minimumRevision=0;
  for(let i=0;i<8;i++){
   const row=value.intervals[i],d=i===7?value.week_end:shift(first,i),part=i===0?'AT_OR_AFTER_13':i===7?'BEFORE_13':'DAY',a=i===0?value.period.start_at:start(d),b=i===7?value.period.end_at:start(shift(d,1));
   if(!exact(row,['key','date','part','start_at','end_at','source_hash','state','recorded','attestation','can_confirm','can_revoke'])||row.key!==d+':'+part||row.date!==d||row.part!==part||row.start_at!==a||row.end_at!==b||!int(a,1)||!int(b,a+1)||!hash(row.source_hash)||!exact(row.recorded,['records','quantity','known_quantity','unknown_quantity','known_cost_cents','boundary_pending_records']))return null;
   const m=row.recorded;for(const k of ['records','quantity','known_quantity','unknown_quantity','known_cost_cents','boundary_pending_records'])if(!int(m[k]))return null;
   if(m.records>m.quantity||m.known_quantity+m.unknown_quantity!==m.quantity||BigInt(m.known_cost_cents)>BigInt(m.known_quantity)*1000000n||part==='DAY'&&m.boundary_pending_records!==0)return null;
   const att=row.attestation;if(att!==null&&(!exact(att,['mode','source_hash','confirmed_at','revoked_at','reason'])||!['ALL_RECORDED','NO_MANUFACTURING'].includes(att.mode)||!hash(att.source_hash)||!int(att.confirmed_at,b,value.checked_at)||att.revoked_at!==null&&!int(att.revoked_at,att.confirmed_at,value.checked_at)||!text(att.reason)))return null;
   if(att!==null)minimumRevision+=att.revoked_at===null?1:2;
   const active=att!==null&&att.revoked_at===null,valid=active&&att.source_hash===row.source_hash;
   if(valid&&(m.boundary_pending_records>0||(att.mode==='NO_MANUFACTURING'?m.quantity!==0:m.quantity===0)))return null;
   const state=b>value.checked_at?'OPEN':m.boundary_pending_records>0?'BOUNDARY_REQUIRED':att?.revoked_at!==null&&att!==null?'REVOKED':active?valid?'CONFIRMED':'STALE':'UNCONFIRMED';
   if(row.state!==state||row.can_confirm!==(b<=value.checked_at&&m.boundary_pending_records===0)||row.can_revoke!==active)return null;
   quantity+=BigInt(m.quantity);known+=BigInt(m.known_cost_cents);unknown+=BigInt(m.unknown_quantity);pending+=m.boundary_pending_records;if(state==='CONFIRMED')confirmed++;
  }
  if(minimumRevision>value.revision||quantity>0n&&value.source.ledger_revision===0||[quantity,known,unknown].some(v=>v>BigInt(Number.MAX_SAFE_INTEGER))||!Number.isSafeInteger(pending)||!exact(value.summary,['state','confirmed_intervals','intervals_total','recorded_quantity','known_cost_cents','total_cost_cents','unknown_cost_quantity','boundary_pending_records']))return null;
  const state=value.period.end_at>value.checked_at?'OPEN':confirmed===8&&unknown===0n&&pending===0?'CONFIRMED':'PENDING',expected={state,confirmed_intervals:confirmed,intervals_total:8,recorded_quantity:Number(quantity),known_cost_cents:Number(known),total_cost_cents:state==='CONFIRMED'?Number(known):null,unknown_cost_quantity:Number(unknown),boundary_pending_records:pending};
  if(Object.keys(expected).some(k=>value.summary[k]!==expected[k]))return null;return JSON.parse(JSON.stringify(value));
 }catch{return null;}
}

const names=['production_coverage_state','production_coverage_intervals','production_coverage_audit','production_coverage_guard'];
export const PRODUCTION_COVERAGE_SCHEMA=[
 'CREATE TABLE IF NOT EXISTS production_coverage_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,mutation_id TEXT NOT NULL,updated_at INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS production_coverage_intervals(interval_key TEXT PRIMARY KEY,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=4096))',
 'CREATE TABLE IF NOT EXISTS production_coverage_audit(request_id TEXT PRIMARY KEY,request_hash TEXT NOT NULL,revision INTEGER NOT NULL UNIQUE,interval_key TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=16384),actor TEXT NOT NULL,created_at INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS production_coverage_guard(id INTEGER PRIMARY KEY CHECK(id=1),ok INTEGER NOT NULL CONSTRAINT production_coverage_atomic_guard CHECK(ok=1))',
];
function database(env){const db=env?.ADMIN_DB;if(!db?.prepare||!db?.batch)fail('UNAVAILABLE');return db;}
async function foundTables(db){const v=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('production_coverage_state','production_coverage_intervals','production_coverage_audit','production_coverage_guard')").all();if(v?.success===false||!Array.isArray(v?.results))fail('STORAGE_INVALID');const found=new Set(v.results.map(v=>v.name));if(found.size!==0&&(found.size!==4||names.some(n=>!found.has(n))))fail('STORAGE_INVALID');return found;}
function attestation(v,stamp){if(!exact(v,['mode','source_hash','confirmed_at','revoked_at','reason'])||!['ALL_RECORDED','NO_MANUFACTURING'].includes(v.mode)||!hash(v.source_hash)||!int(v.confirmed_at,1,stamp)||v.revoked_at!==null&&!int(v.revoked_at,v.confirmed_at,stamp)||!text(v.reason,240))fail('STORAGE_INVALID');return v;}
async function snapshotOnce(env,stamp,requestId,end){
 const db=database(env),source=await readProductionCoverageSource(env,{now:()=>stamp*1000});
 if((await foundTables(db)).size===0)return {source,state:null,rows:new Map(),replay:null,intervals_count:0};
 const values=await db.batch([db.prepare('SELECT revision,mutation_id,updated_at FROM production_coverage_state WHERE id=1'),db.prepare('SELECT interval_key,payload FROM production_coverage_intervals WHERE interval_key IN (?,?,?,?,?,?,?,?) ORDER BY interval_key LIMIT 9').bind(...intervals(end).map(r=>r.key)),db.prepare('SELECT COUNT(*) AS count,MIN(revision) AS first_revision,MAX(revision) AS last_revision,(SELECT COUNT(*) FROM production_coverage_intervals) AS intervals_count FROM production_coverage_audit'),db.prepare('SELECT request_hash,interval_key FROM production_coverage_audit WHERE request_id=?').bind(requestId)]);
 if(!Array.isArray(values)||values.length!==4||values.some(v=>v?.success===false||!Array.isArray(v?.results))||values[0].results.length>1||values[1].results.length>8||values[2].results.length!==1||values[3].results.length>1)fail('STORAGE_INVALID');
 const state=values[0].results[0]??null,stats=values[2].results[0];if(state&&(!exact(state,['revision','mutation_id','updated_at'])||!int(state.revision,1,2147483645)||!uuid(state.mutation_id)||!int(state.updated_at,1,stamp)))fail('STORAGE_INVALID');
 if(!exact(stats,['count','first_revision','last_revision','intervals_count'])||stats.count!==(state?.revision??0)||!int(stats.intervals_count,0,5000)||stats.intervals_count>(state?.revision??0)||state!==null&&stats.intervals_count===0||(state?stats.first_revision!==1||stats.last_revision!==state.revision:stats.first_revision!==null||stats.last_revision!==null))fail('STORAGE_INVALID');
 const rows=new Map();for(const row of values[1].results){let parsed;try{if(!exact(row,['interval_key','payload'])||typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>4096)throw Error();parsed=JSON.parse(row.payload);}catch{fail('STORAGE_INVALID');}attestation(parsed,stamp);if(typeof row.interval_key!=='string'||!/^20\d{2}-\d{2}-\d{2}:(DAY|BEFORE_13|AT_OR_AFTER_13)$/.test(row.interval_key)||rows.has(row.interval_key))fail('STORAGE_INVALID');rows.set(row.interval_key,parsed);}
 if(rows.size>(state?.revision??0)||[...rows.values()].some(v=>(v.revoked_at??v.confirmed_at)>(state?.updated_at??0)))fail('STORAGE_INVALID');
 const replay=values[3].results[0]??null;if(replay&&(!exact(replay,['request_hash','interval_key'])||!hash(replay.request_hash)||typeof replay.interval_key!=='string'))fail('STORAGE_INVALID');return {source,state,rows,replay,intervals_count:stats.intervals_count};
}
async function snapshot(env,stamp,requestId,end){
 for(let attempt=0;attempt<3;attempt++){const observed=await snapshotOnce(env,stamp,requestId,end),guard=sourceGuard(observed.source),fence=await database(env).prepare('SELECT CASE WHEN '+guard.sql+' THEN 1 ELSE 0 END AS ok').bind(...guard.args).first();if(fence?.ok===1)return observed;}fail('SOURCE_CHANGED',409);
}
async function build(observed,end,stamp){
 const {source,rows}=observed,timing=new Map(source.assignments.map(v=>[v.record_id,v])),physical=[];
 for(const row of source.ledger.records)if(row.status==='ACTIVE')physical.push({row,record_hash:await productionWeeklyRecordHash(row)});
 const projected=[];
 for(const spec of intervals(end)){
  const m={records:0,quantity:0,known_quantity:0,unknown_quantity:0,known_cost_cents:0,boundary_pending_records:0},evidence=[];
  for(const {row,record_hash} of physical){if(row.produced_date!==spec.date)continue;let count=row.quantity;
   if(spec.part!=='DAY'){const choice=timing.get(row.record_id),valid=!!choice&&choice.record_hash===record_hash&&choice.before13_quantity+choice.at_or_after13_quantity===row.quantity;evidence.push({record_id:row.record_id,record_hash,before13_quantity:valid?choice.before13_quantity:null,at_or_after13_quantity:valid?choice.at_or_after13_quantity:null});if(!valid){m.boundary_pending_records++;continue;}count=spec.part==='BEFORE_13'?choice.before13_quantity:choice.at_or_after13_quantity;}
   else evidence.push({record_id:row.record_id,record_hash});
   if(count===0)continue;m.records++;m.quantity+=count;if(row.cost.state==='UNKNOWN')m.unknown_quantity+=count;else{m.known_quantity+=count;m.known_cost_cents+=count*row.cost.unit_cost_cents;}
  }
  if(Object.values(m).some(v=>!int(v)))fail('LIMIT',409);evidence.sort((a,b)=>a.record_id.localeCompare(b.record_id));
  const source_hash=await digest({key:spec.key,start_at:spec.start_at,end_at:spec.end_at,evidence}),att=rows.get(spec.key)??null,active=att!==null&&att.revoked_at===null;
  const state=spec.end_at>stamp?'OPEN':m.boundary_pending_records>0?'BOUNDARY_REQUIRED':att?.revoked_at!==null&&att!==null?'REVOKED':active?att.source_hash===source_hash?'CONFIRMED':'STALE':'UNCONFIRMED';
  projected.push({...spec,source_hash,state,recorded:m,attestation:att,can_confirm:spec.end_at<=stamp&&m.boundary_pending_records===0,can_revoke:active});
 }
 const known=projected.reduce((n,r)=>n+BigInt(r.recorded.known_cost_cents),0n),quantity=projected.reduce((n,r)=>n+BigInt(r.recorded.quantity),0n),unknown=projected.reduce((n,r)=>n+BigInt(r.recorded.unknown_quantity),0n),pending=projected.reduce((n,r)=>n+r.recorded.boundary_pending_records,0),confirmed=projected.filter(r=>r.state==='CONFIRMED').length,p=productionWeeklyPeriod(end),state=p.end_at>stamp?'OPEN':confirmed===8&&unknown===0n&&pending===0?'CONFIRMED':'PENDING';
 if([known,quantity,unknown].some(v=>v>BigInt(Number.MAX_SAFE_INTEGER)))fail('LIMIT',409);
 const value={schema:'production_coverage_workspace_v1',checked_at:stamp,week_end:end,revision:observed.state?.revision??0,source:{ledger_revision:source.ledger_revision,timing_revision:source.timing_revision},period:{start_at:p.start_at,end_at:p.end_at,timezone:'America/Sao_Paulo'},intervals:projected,summary:{state,confirmed_intervals:confirmed,intervals_total:8,recorded_quantity:Number(quantity),known_cost_cents:Number(known),total_cost_cents:state==='CONFIRMED'?Number(known):null,unknown_cost_quantity:Number(unknown),boundary_pending_records:pending},basis:'OWNER_CONFIRMED_MANUFACTURING_COMPLETENESS_NOT_CASH_OR_SALES'};
 const result=projectProductionCoverageWorkspace(value);if(!result)fail('STORAGE_INVALID');return result;
}
export async function readProductionCoverageWorkspace(env,input,{now=()=>Date.now()}={}){try{const stamp=clock(now),end=selected(input,stamp);return build(await snapshot(env,stamp,'',end),end,stamp);}catch(e){if(e instanceof ProductionCoverageError)throw e;throw new ProductionCoverageError('UNAVAILABLE',503,{cause:e});}}
function request(v,stamp){
 const keys=['action','week_end','interval_key','source_hash','revision','ledger_revision','timing_revision','request_id','mode','reason','confirmed'];
 if(!exact(v,keys)||!['confirm','revoke'].includes(v.action)||!uuid(v.request_id)||!hash(v.source_hash)||!int(v.revision,0,2147483644)||!int(v.ledger_revision,0,2147483645)||!int(v.timing_revision,0,2147483645)||!text(v.reason,240)||v.confirmed!==true||(v.action==='confirm'?!['ALL_RECORDED','NO_MANUFACTURING'].includes(v.mode):v.mode!==null))fail('REQUEST_INVALID',400);
 selected({week_end:v.week_end},stamp);if(!intervals(v.week_end).some(r=>r.key===v.interval_key))fail('REQUEST_INVALID',400);return canonical(v);
}
function sourceGuard(source){const parts=[],args=[];for(const [present,table,revision] of [[source.physical,'incurred_production_state',source.ledger_revision],[source.timing_present,'production_weekly_state',source.timing_revision]]){parts.push(present?'COALESCE((SELECT revision FROM '+table+' WHERE id=1),0)=?':"NOT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='"+table+"')");if(present)args.push(revision);}return {sql:parts.join(' AND '),args};}
export async function mutateProductionCoverageWorkspace(env,input,actor,{now=()=>Date.now()}={}){
 try{
  const stamp=clock(now),body=request(input,stamp);if(!text(actor,256))fail('REQUEST_INVALID',400);const db=database(env),before=await snapshot(env,stamp,body.request_id,body.week_end),request_hash=await digest(body);
  if(before.replay){if(before.replay.request_hash!==request_hash||before.replay.interval_key!==body.interval_key)fail('CONFLICT',409);return build(before,body.week_end,stamp);}
  if((before.state?.revision??0)!==body.revision)fail('CONFLICT',409);
  if(before.source.ledger_revision!==body.ledger_revision||before.source.timing_revision!==body.timing_revision)fail('SOURCE_CHANGED',409);
  const frame=await build(before,body.week_end,stamp),row=frame.intervals.find(r=>r.key===body.interval_key);if(row.source_hash!==body.source_hash)fail('SOURCE_CHANGED',409);
  const previous=before.rows.get(row.key)??null;let changed;
  if(body.action==='confirm'){
   if(row.end_at>stamp)fail('PERIOD_OPEN',409);if(row.recorded.boundary_pending_records)fail('BOUNDARY_REQUIRED',409);
   if(body.mode==='NO_MANUFACTURING'?row.recorded.quantity!==0:row.recorded.quantity===0)fail('MODE_INVALID',409);
   changed={mode:body.mode,source_hash:row.source_hash,confirmed_at:stamp,revoked_at:null,reason:body.reason};
  }else{if(!previous||previous.revoked_at!==null)fail('ATTESTATION_UNAVAILABLE',409);changed={...previous,revoked_at:stamp,reason:body.reason};}
  if(before.intervals_count>=5000&&!before.rows.has(row.key))fail('LIMIT',409);
  if((await foundTables(db)).size===0)await db.batch(PRODUCTION_COVERAGE_SCHEMA.map(sql=>db.prepare(sql)));
  const finished=clock(now);if(finished<stamp||finished-stamp>60)fail('CLOCK_INVALID');
  const serial=body.revision+1,mutation=crypto.randomUUID(),guard=sourceGuard(before.source),claim='EXISTS(SELECT 1 FROM production_coverage_state WHERE id=1 AND revision=? AND mutation_id=?)',claimArgs=[serial,mutation],payload=JSON.stringify(changed),audit=JSON.stringify({request:body,previous,new_attestation:changed});
  const gate=body.revision===0?db.prepare('INSERT OR IGNORE INTO production_coverage_state(id,revision,mutation_id,updated_at) SELECT 1,1,?,? WHERE '+guard.sql).bind(mutation,stamp,...guard.args):db.prepare('UPDATE production_coverage_state SET revision=revision+1,mutation_id=?,updated_at=? WHERE id=1 AND revision=? AND updated_at<=? AND '+guard.sql).bind(mutation,stamp,body.revision,stamp,...guard.args);
  const results=await db.batch([gate,db.prepare('INSERT INTO production_coverage_intervals(interval_key,payload) SELECT ?,? WHERE '+claim+' ON CONFLICT(interval_key) DO UPDATE SET payload=excluded.payload').bind(row.key,payload,...claimArgs),db.prepare('INSERT INTO production_coverage_audit(request_id,request_hash,revision,interval_key,payload,actor,created_at) SELECT ?,?,?,?,?,?,? WHERE '+claim).bind(body.request_id,request_hash,serial,row.key,audit,actor,stamp,...claimArgs),db.prepare('INSERT INTO production_coverage_guard(id,ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM production_coverage_intervals WHERE interval_key=? AND payload=?) AND EXISTS(SELECT 1 FROM production_coverage_audit WHERE request_id=? AND request_hash=? AND revision=?) THEN 1 ELSE 0 END WHERE '+claim+' ON CONFLICT(id) DO UPDATE SET ok=excluded.ok').bind(row.key,payload,body.request_id,request_hash,serial,...claimArgs)]);
  if(results[0]?.meta?.changes!==1){const replay=await db.prepare('SELECT request_hash,interval_key FROM production_coverage_audit WHERE request_id=?').bind(body.request_id).first();if(replay?.request_hash!==request_hash||replay?.interval_key!==body.interval_key)fail('CONFLICT',409);}
  else if(results.some(v=>v?.success===false||v?.meta?.changes!==1))fail('STORAGE_INVALID');
  return readProductionCoverageWorkspace(env,{week_end:body.week_end},{now});
 }catch(e){if(e instanceof ProductionCoverageError)throw e;throw new ProductionCoverageError('UNAVAILABLE',503,{cause:e});}
}
