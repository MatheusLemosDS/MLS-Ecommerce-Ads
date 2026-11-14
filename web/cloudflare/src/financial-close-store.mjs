import {FinancialLedgerError,normalizeFinancialScope,sameFinancialScope,normalizeFinancialTimestamp,financialCanonicalJSON,financialDigest} from './financial-event-ledger.mjs';
import {assertFinancialAccess,financialDatabase,financialClock,financialScopeKey,ensureFinancialEventSchema} from './financial-event-store.mjs';
import {TenantInitializationSet} from './tenant-storage.mjs';

export const FINANCIAL_CLOSE_SCHEMA=Object.freeze([
 `CREATE TABLE IF NOT EXISTS financial_close_heads(scope_key TEXT NOT NULL,close_id TEXT NOT NULL,version INTEGER NOT NULL,closed_version INTEGER NOT NULL,status TEXT NOT NULL,PRIMARY KEY(scope_key,close_id))`,
 `CREATE TABLE IF NOT EXISTS financial_close_revisions(scope_key TEXT NOT NULL,close_id TEXT NOT NULL,version INTEGER NOT NULL,status TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=196608),payload_hash TEXT NOT NULL,snapshot_hash TEXT NOT NULL,previous_hash TEXT,ledger_revision INTEGER NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(scope_key,close_id,version))`,
 `CREATE TABLE IF NOT EXISTS financial_close_requests(scope_key TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,close_id TEXT NOT NULL,version INTEGER NOT NULL,needs_rectification INTEGER NOT NULL DEFAULT 0 CHECK(needs_rectification IN(0,1)),actor TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(scope_key,request_id))`,
 `CREATE TABLE IF NOT EXISTS financial_close_guard(id INTEGER PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))`,
 ...['financial_close_revisions','financial_close_requests'].flatMap(table=>['UPDATE','DELETE'].map(verb=>`CREATE TRIGGER IF NOT EXISTS ${table}_no_${verb.toLowerCase()} BEFORE ${verb} ON ${table} BEGIN SELECT RAISE(ABORT,'financial_history_immutable'); END`)),
]);
export const FINANCIAL_CLOSE_STATUSES=Object.freeze(['ABERTO','EM_CONCILIACAO','PROVISORIO','PRONTO','FECHADO','RETIFICADO']);
const ready=new TenantInitializationSet(),integer=v=>Number.isSafeInteger(v)&&v>=0&&v<=2147483645&&!Object.is(v,-0),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const fail=(code,status=400)=>{throw new FinancialLedgerError('FINANCIAL_CLOSE_'+code,status);};
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function normalizeFinancialPeriod(value){
 financialCanonicalJSON(value);if(!exact(value,['kind','start_at','end_at','timezone','calendar_id'])||!['WEEK','MONTH'].includes(value.kind)||value.timezone!=='America/Sao_Paulo'||typeof value.calendar_id!=='string'||!/^[A-Z][A-Z0-9_]{1,63}$/.test(value.calendar_id))fail('PERIOD_INVALID');
 const start_at=normalizeFinancialTimestamp(value.start_at),end_at=normalizeFinancialTimestamp(value.end_at),duration=Date.parse(end_at)-Date.parse(start_at);if(duration<=0||duration>32*86400000||!start_at.endsWith('.000Z')||!end_at.endsWith('.000Z'))fail('PERIOD_INVALID');
 const parts=stamp=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:value.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(stamp)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)])),a=parts(start_at),b=parts(end_at);
 if(value.kind==='MONTH'&&(a.day!==1||b.day!==1||[a.hour,a.minute,a.second,b.hour,b.minute,b.second].some(n=>n!==0)||b.year*12+b.month!==a.year*12+a.month+1))fail('PERIOD_INVALID');
 if(value.kind==='WEEK'&&(Date.UTC(b.year,b.month-1,b.day)-Date.UTC(a.year,a.month-1,a.day)!==7*86400000||a.hour!==b.hour||a.minute!==b.minute||a.second!==b.second))fail('PERIOD_INVALID');
 if(value.kind==='MONTH'&&!['CIVIL_MONTH','MONTH_CIVIL'].includes(value.calendar_id))fail('PERIOD_INVALID');
 if(value.kind==='WEEK'){
  const weekday=new Date(Date.UTC(a.year,a.month-1,a.day)).getUTCDay(),wanted=value.calendar_id==='CIVIL_FRIDAY_THURSDAY'?5:value.calendar_id==='CIVIL_MONDAY_SUNDAY'?1:null;
  if(wanted===null||weekday!==wanted||[a.hour,a.minute,a.second,b.hour,b.minute,b.second].some(n=>n!==0))fail('PERIOD_INVALID');
 }
 return {kind:value.kind,start_at,end_at,timezone:value.timezone,calendar_id:value.calendar_id==='MONTH_CIVIL'?'CIVIL_MONTH':value.calendar_id};
}
export async function financialCloseIdentity(scope,period,basis){if(!['ACCRUAL','BANK_CASH'].includes(basis))fail('BASIS_INVALID');return financialDigest(['financial-close-v1',normalizeFinancialScope(scope),normalizeFinancialPeriod(period),basis]);}
const gateKeys=['coverage_complete','consistent','costs_complete','taxes_complete','policy_complete','comparisons_complete','blocking_pending_count','receivables_verified','cash_verified'];
export function financialCloseGates(value,basis){
 financialCanonicalJSON(value);if(!exact(value,gateKeys)||gateKeys.filter(k=>k!=='blocking_pending_count').some(k=>typeof value[k]!=='boolean')||!integer(value.blocking_pending_count)||!['ACCRUAL','BANK_CASH'].includes(basis))fail('GATES_INVALID');
 const common=value.coverage_complete&&value.consistent&&value.policy_complete&&value.comparisons_complete&&value.blocking_pending_count===0;
 return {ready:!!(common&&(basis==='ACCRUAL'?value.costs_complete&&value.taxes_complete&&value.receivables_verified:value.cash_verified)),gates:{...value}};
}
async function ensure(env,scope,options){const db=await ensureFinancialEventSchema(env,scope,options);if(!ready.has(db)){await db.batch(FINANCIAL_CLOSE_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}return db;}
async function present(db){return !!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='financial_close_heads'").first();}
async function saved(row,scope,id){
 if(!row||typeof row.payload!=='string'||!hash(row.payload_hash)||!hash(row.snapshot_hash)||!integer(row.version)||row.version<1||!integer(row.ledger_revision)||!FINANCIAL_CLOSE_STATUSES.includes(row.status)||row.previous_hash!==null&&!hash(row.previous_hash))fail('STORAGE_INVALID',503);
 let value;try{value=JSON.parse(row.payload);}catch{fail('STORAGE_INVALID',503);}
 if(value?.schema!=='financial_close_version_v1'||!sameFinancialScope(scope,value.scope)||value.close_id!==id||value.version!==row.version||value.status!==row.status||value.ledger_revision!==row.ledger_revision||await financialDigest(value)!==row.payload_hash||await financialDigest(value.snapshot)!==row.snapshot_hash||value.snapshot_hash!==row.snapshot_hash||await financialCloseIdentity(value.scope,value.period,value.basis)!==id)fail('STORAGE_INVALID',503);
 financialCloseGates(value.gates,value.basis);if(['FECHADO','RETIFICADO'].includes(value.status)&&!financialCloseGates(value.gates,value.basis).ready)fail('STORAGE_INVALID',503);return value;
}
async function exactVersion(db,key,scope,id,version){const row=await db.prepare('SELECT payload,payload_hash,snapshot_hash,previous_hash,version,status,ledger_revision FROM financial_close_revisions WHERE scope_key=? AND close_id=? AND version=?').bind(key,id,version).first();return {value:await saved(row,scope,id),row};}
async function point(db,key,scope,id,requestId){
 const results=await db.batch([
  db.prepare('SELECT version,closed_version,status FROM financial_close_heads WHERE scope_key=? AND close_id=?').bind(key,id),
  db.prepare('SELECT request_hash,close_id,version,needs_rectification FROM financial_close_requests WHERE scope_key=? AND request_id=?').bind(key,requestId??''),
 ]);if(!Array.isArray(results)||results.length!==2||results.some(r=>!Array.isArray(r.results)||r.results.length>1))fail('STORAGE_INVALID',503);
 const head=results[0].results[0]??null,request=results[1].results[0]??null;
 if(head&&(!integer(head.version)||head.version<1||!integer(head.closed_version)||head.closed_version>head.version||!FINANCIAL_CLOSE_STATUSES.includes(head.status)))fail('STORAGE_INVALID',503);
 if(request&&(!hash(request.request_hash)||!hash(request.close_id)||!integer(request.version)||request.version<1||![0,1].includes(request.needs_rectification)))fail('STORAGE_INVALID',503);
 const current=head?await exactVersion(db,key,scope,id,head.version):null;if(current&&current.value.status!==head.status)fail('STORAGE_INVALID',503);
 const closed=head?.closed_version?await exactVersion(db,key,scope,id,head.closed_version):null;if(closed&&!['FECHADO','RETIFICADO'].includes(closed.value.status))fail('STORAGE_INVALID',503);return {head,current,closed,request};
}
function result(value,{replayed=false,changed=false,needs_rectification=false}={}){return {schema:'financial_close_mutation_v1',close:value,replayed,changed,needs_rectification};}
function stateFences(snapshot){
 const rows=snapshot.automation_state_fences??[];if(!Array.isArray(rows)||rows.length>8)fail('SNAPSHOT_INVALID',503);const seen=new Set();
 return rows.map(row=>{if(!exact(row,['kind','revision'])||typeof row.kind!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(row.kind)||seen.has(row.kind)||!integer(row.revision))fail('SNAPSHOT_INVALID',503);seen.add(row.kind);return {...row};});
}
function stateFenceGuards(db,key,snapshot,guard){return stateFences(snapshot).map(row=>guard('COALESCE((SELECT version FROM financial_automation_heads WHERE scope_key=? AND kind=?),0)=?',[key,row.kind,row.revision]));}
async function stateFenceChanged(db,key,snapshot){
 const fences=stateFences(snapshot);if(!fences.length)return false;
 const rows=(await db.prepare('SELECT kind,version FROM financial_automation_heads WHERE scope_key=? AND kind IN(SELECT value FROM json_each(?))').bind(key,JSON.stringify(fences.map(r=>r.kind))).all()).results;
 if(!Array.isArray(rows)||rows.some(r=>!integer(r.version)))fail('STORAGE_INVALID',503);return fences.some(f=>(rows.find(r=>r.kind===f.kind)?.version??0)!==f.revision);
}
async function replay(db,key,scope,id,request,requestHash,env,options){if(request.request_hash!==requestHash||request.close_id!==id)fail('REQUEST_CONFLICT',409);const {value}=await exactVersion(db,key,scope,id,request.version);await assertFinancialAccess(env,scope,options,'write');return result(value,{replayed:true,needs_rectification:request.needs_rectification===1});}
async function rememberUnchanged(env,db,key,scope,id,input,requestHash,observed,built,options,{needs_rectification=false}={}){
 const current=observed.current.value,guard=(condition,args)=>db.prepare('INSERT INTO financial_close_guard(id,ok) SELECT 1,0 WHERE NOT ('+condition+')').bind(...args);
 const statements=[
  guard('COALESCE((SELECT revision FROM financial_ledger_state WHERE scope_key=?),0)=?',[key,built.ledger_revision]),
  ...stateFenceGuards(db,key,built.snapshot,guard),
  guard('EXISTS(SELECT 1 FROM financial_close_heads WHERE scope_key=? AND close_id=? AND version=? AND closed_version=?)',[key,id,observed.head.version,observed.head.closed_version]),
  db.prepare('INSERT INTO financial_close_requests(scope_key,request_id,request_hash,close_id,version,needs_rectification,actor,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(key,input.request_id,requestHash,id,current.version,Number(needs_rectification),options.actor,financialClock(options)),
  guard('EXISTS(SELECT 1 FROM financial_close_requests WHERE scope_key=? AND request_id=? AND request_hash=?)',[key,input.request_id,requestHash]),
 ];
 try{await assertFinancialAccess(env,scope,options,'write');await db.batch(statements);}catch(error){if(error?.status===403)throw error;const after=await point(db,key,scope,id,input.request_id);if(after.request)return replay(db,key,scope,id,after.request,requestHash,env,options);fail('SOURCE_CHANGED',409);}
 await assertFinancialAccess(env,scope,options,'write');return result(current,{replayed:true,needs_rectification});
}

// Poll metadata remains in the immutable proof hash, but observing the same
// facts again is not a new economic event or a reason to restate a closed book.
export async function financialCloseEconomicDigest(snapshot){
 if(!snapshot.projection)return financialDigest(snapshot);
 const projection=JSON.parse(financialCanonicalJSON(snapshot.projection));delete projection.checked_at;
 if(projection.positions?.inventory?.physical)delete projection.positions.inventory.physical.as_of;
 return financialDigest({scope:snapshot.scope,period:snapshot.period,basis:snapshot.basis,policy_ref:snapshot.policy_ref??null,projection});
}

// All figures/gates are built on the server by a trusted callback. Neither UI
// totals nor a client-supplied "ready" flag are accepted by this mutation API.
export async function mutateFinancialClose(env,input,options={}){
 financialCanonicalJSON(input);if(!exact(input,['scope','period','basis','action','expected_version','request_id','reason'])||!['prepare','reconcile','finalize','rectify'].includes(input.action)||!integer(input.expected_version)||!uuid(input.request_id)||typeof input.reason!=='string'||input.reason.length>240||input.reason.trim()!==input.reason||/[\u0000-\u001f\u007f]/.test(input.reason)||input.action==='rectify'&&!input.reason)fail('REQUEST_INVALID');
 const scope=await assertFinancialAccess(env,input.scope,options,'write'),period=normalizeFinancialPeriod(input.period),id=await financialCloseIdentity(scope,period,input.basis),key=await financialScopeKey(scope),stamp=financialClock(options);
 if(typeof options.buildSnapshot!=='function'||typeof options.actor!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(options.actor))fail('SERVER_CONTEXT_REQUIRED',403);
 const db=await ensure(env,scope,options),requestHash=await financialDigest(input),observed=await point(db,key,scope,id,input.request_id);
 if(observed.request)return replay(db,key,scope,id,observed.request,requestHash,env,options);
 if((observed.head?.version??0)!==input.expected_version)fail('VERSION_CONFLICT',409);
 const built=await options.buildSnapshot({scope,period,basis:input.basis});financialCanonicalJSON(built);
 if(!exact(built,['ledger_revision','snapshot','gates'])||!integer(built.ledger_revision)||!built.snapshot||typeof built.snapshot!=='object')fail('SNAPSHOT_INVALID',503);
 if(!sameFinancialScope(built.snapshot.scope,scope)||built.snapshot.basis!==input.basis||financialCanonicalJSON(normalizeFinancialPeriod(built.snapshot.period))!==financialCanonicalJSON(period))fail('SNAPSHOT_SCOPE_MISMATCH',403);
 stateFences(built.snapshot);
 const {ready:canClose,gates}=financialCloseGates(built.gates,input.basis),snapshotHash=await financialDigest(built.snapshot),current=observed.current?.value??null,isClosed=current&&['FECHADO','RETIFICADO'].includes(current.status);
 if(isClosed&&input.action!=='rectify')return rememberUnchanged(env,db,key,scope,id,input,requestHash,observed,built,options,{needs_rectification:await financialCloseEconomicDigest(built.snapshot)!==await financialCloseEconomicDigest(current.snapshot)});
 if(input.action==='rectify'&&!observed.closed)fail('ORIGINAL_CLOSE_REQUIRED',409);
 if(input.action==='finalize'&&(!current||current.status!=='PRONTO'||!canClose||period.end_at>stamp))fail('NOT_READY',409);
 let status=input.action==='reconcile'?'EM_CONCILIACAO':period.end_at>stamp?'ABERTO':canClose?'PRONTO':'PROVISORIO';
 if(input.action==='finalize')status=observed.head.closed_version?'RETIFICADO':'FECHADO';
 if(input.action==='rectify'&&canClose&&period.end_at<=stamp)status='RETIFICADO';
 if(current&&!isClosed&&current.snapshot_hash===snapshotHash&&current.status===status&&current.ledger_revision===built.ledger_revision)return rememberUnchanged(env,db,key,scope,id,input,requestHash,observed,built,options);
 const version=(observed.head?.version??0)+1;if(!integer(version))fail('VERSION_LIMIT',409);
 const value={schema:'financial_close_version_v1',scope,close_id:id,version,status,period,basis:input.basis,ledger_revision:built.ledger_revision,snapshot_hash:snapshotHash,snapshot:built.snapshot,gates,previous_version:observed.head?.version??null,replaces_closed_version:observed.head?.closed_version||null,reason:input.reason,actor:options.actor,created_at:stamp},payload=financialCanonicalJSON(value),payloadHash=await financialDigest(value),closedVersion=['FECHADO','RETIFICADO'].includes(status)?version:observed.head?.closed_version??0;
 const guard=(sql,args)=>db.prepare('INSERT INTO financial_close_guard(id,ok) SELECT 1,0 WHERE NOT ('+sql+')').bind(...args);
 const statements=[
  guard('COALESCE((SELECT revision FROM financial_ledger_state WHERE scope_key=?),0)=?',[key,built.ledger_revision]),
  ...stateFenceGuards(db,key,built.snapshot,guard),
  ...(observed.head?[guard('EXISTS(SELECT 1 FROM financial_close_heads WHERE scope_key=? AND close_id=? AND version=? AND closed_version=?)',[key,id,observed.head.version,observed.head.closed_version])]:[guard('NOT EXISTS(SELECT 1 FROM financial_close_heads WHERE scope_key=? AND close_id=?)',[key,id])]),
  db.prepare('INSERT INTO financial_close_revisions(scope_key,close_id,version,status,payload,payload_hash,snapshot_hash,previous_hash,ledger_revision,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(key,id,version,status,payload,payloadHash,snapshotHash,observed.current?.row.payload_hash??null,built.ledger_revision,options.actor,stamp),
  db.prepare('INSERT INTO financial_close_heads(scope_key,close_id,version,closed_version,status) VALUES(?,?,?,?,?) ON CONFLICT(scope_key,close_id) DO UPDATE SET version=excluded.version,closed_version=excluded.closed_version,status=excluded.status').bind(key,id,version,closedVersion,status),
  db.prepare('INSERT INTO financial_close_requests(scope_key,request_id,request_hash,close_id,version,actor,created_at) VALUES(?,?,?,?,?,?,?)').bind(key,input.request_id,requestHash,id,version,options.actor,stamp),
  guard('EXISTS(SELECT 1 FROM financial_close_revisions WHERE scope_key=? AND close_id=? AND version=? AND payload_hash=?) AND EXISTS(SELECT 1 FROM financial_close_heads WHERE scope_key=? AND close_id=? AND version=? AND closed_version=? AND status=?) AND EXISTS(SELECT 1 FROM financial_close_requests WHERE scope_key=? AND request_id=? AND request_hash=?)',[key,id,version,payloadHash,key,id,version,closedVersion,status,key,input.request_id,requestHash]),
 ];
 try{await assertFinancialAccess(env,scope,options,'write');await db.batch(statements);}catch(error){if(error instanceof FinancialLedgerError||error?.status===403)throw error;const after=await point(db,key,scope,id,input.request_id);if(after.request)return replay(db,key,scope,id,after.request,requestHash,env,options);if((after.head?.version??0)!==input.expected_version)fail('VERSION_CONFLICT',409);const source=await db.prepare('SELECT revision FROM financial_ledger_state WHERE scope_key=?').bind(key).first();if((source?.revision??0)!==built.ledger_revision||await stateFenceChanged(db,key,built.snapshot))fail('SOURCE_CHANGED',409);throw new FinancialLedgerError('FINANCIAL_CLOSE_STORAGE_WRITE_FAILED',503,{cause:error});}
 await assertFinancialAccess(env,scope,options,'write');return result(value,{changed:true});
}
export async function readFinancialClose(env,input,options={}){
 financialCanonicalJSON(input);const scope=await assertFinancialAccess(env,input?.scope,options),period=normalizeFinancialPeriod(input.period),id=await financialCloseIdentity(scope,period,input.basis),key=await financialScopeKey(scope),db=financialDatabase(env);
 if(!await present(db)){await assertFinancialAccess(env,scope,options);return {schema:'financial_close_workspace_v1',scope,period,basis:input.basis,close_id:id,current:null,closed:null,versions:[],next_version:null};}
 const limit=input.limit??50,after=input.after_version??0;if(!integer(after)||!Number.isSafeInteger(limit)||limit<1||limit>100)fail('REQUEST_INVALID');
 const observed=await point(db,key,scope,id,null),rows=(await db.prepare('SELECT payload,payload_hash,snapshot_hash,previous_hash,version,status,ledger_revision FROM financial_close_revisions WHERE scope_key=? AND close_id=? AND version>? ORDER BY version LIMIT ?').bind(key,id,after,limit+1).all()).results;
 if(!Array.isArray(rows))fail('STORAGE_INVALID',503);const versions=[];for(const row of rows.slice(0,limit))versions.push(await saved(row,scope,id));
 const fence=await db.prepare('SELECT version FROM financial_close_heads WHERE scope_key=? AND close_id=?').bind(key,id).first();if((fence?.version??0)!==(observed.head?.version??0))fail('SOURCE_CHANGED',409);
 await assertFinancialAccess(env,scope,options);return {schema:'financial_close_workspace_v1',scope,period,basis:input.basis,close_id:id,current:observed.current?.value??null,closed:observed.closed?.value??null,versions,next_version:rows.length>limit?versions.at(-1).version:null};
}
