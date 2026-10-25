import {projectBusinessMonth} from './business-month.mjs';
import {businessMonthWithCheckpoint} from './business-checkpoint.mjs';

// This job only advances the existing read-only collectors. Financial frames,
// expenses, declared DAS and cost rules remain owned by their existing stores.
export const BUSINESS_SYNC_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_sync_state (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),status TEXT NOT NULL,month TEXT,lease_token TEXT,lease_expires_at INTEGER,next_run_at INTEGER NOT NULL,failure_count INTEGER NOT NULL,last_attempt_at INTEGER,last_success_at INTEGER,last_error TEXT,summary TEXT CHECK(summary IS NULL OR length(CAST(summary AS BLOB))<=16384))`,
 `CREATE TABLE IF NOT EXISTS business_sync_audit (id TEXT PRIMARY KEY NOT NULL,kind TEXT NOT NULL,month TEXT,status TEXT NOT NULL,started_at INTEGER NOT NULL,finished_at INTEGER NOT NULL,finance_steps INTEGER NOT NULL,ads_reads INTEGER NOT NULL,error_code TEXT,policy_revision INTEGER NOT NULL,actor TEXT NOT NULL,summary TEXT CHECK(summary IS NULL OR length(CAST(summary AS BLOB))<=16384))`,
 `INSERT OR IGNORE INTO business_sync_state(id,revision,enabled,status,next_run_at,failure_count) SELECT 1,1,1,'IDLE',0,0 WHERE NOT EXISTS(SELECT 1 FROM business_sync_audit)`,
];

export class BusinessSyncError extends Error {
 constructor(code,status=400){super(code);this.status=status;}
}
const syncFail=(code,status=503)=>{throw new BusinessSyncError(code,status);};
const syncReady=new WeakMap();
const syncStatuses=['IDLE','RUNNING','COMPLETE','PARTIAL','LIMIT_REACHED','ERROR','PAUSED'];
const syncErrors=['BUSINESS_SYNC_COLLECTION_UNAVAILABLE','BUSINESS_SYNC_RESULT_INVALID','BUSINESS_SYNC_ADS_INCOMPLETE','BUSINESS_SYNC_PERIOD_LIMIT_REACHED'];
const syncPlain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const syncExact=(value,keys)=>syncPlain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const syncInteger=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
function syncClock(now){let value;try{value=now();}catch{syncFail('BUSINESS_SYNC_CLOCK_INVALID');}if(!syncInteger(value,1,9999999999999))syncFail('BUSINESS_SYNC_CLOCK_INVALID');return value;}
const syncMonth=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(ms)).slice(0,7);
async function syncSetup(env){
 const db=env?.ADMIN_DB;if(!db||typeof db.batch!=='function'||typeof db.prepare!=='function')syncFail('BUSINESS_SYNC_CONFIGURATION');
 if(!syncReady.has(db))syncReady.set(db,db.batch(BUSINESS_SYNC_SCHEMA.map(sql=>db.prepare(sql))).catch(()=>{syncReady.delete(db);syncFail('BUSINESS_SYNC_STORAGE_UNAVAILABLE');}));
 await syncReady.get(db);return db;
}
function syncSummary(frame){
 return {schema:'business_sync_summary_v1',month:frame.month,start_date:frame.start_date,end_date:frame.end_date,status:frame.status,checked_at:frame.checked_at,source_checked_at:frame.source_checked_at?{...frame.source_checked_at}:{finance_oldest_at:null,finance_latest_at:null,ads_at:frame.ads?.fetched_at??null},progress:{...frame.progress},coverage:{...frame.coverage},pending:[...frame.result.pending],bindings_revision:frame.bindings_revision,costs_revision:frame.costs_revision,expenses_revision:frame.expenses.revision,tax_policy_revision:frame.tax?.policy_revision??null,ads_status:frame.ads?.status??null,ads_covered_days:frame.ads?.covered_days??0,ads_total_days:frame.ads?.total_days??0,net_estimate_cents:frame.result.net_estimate_cents,net_profit_cents:null,basis:frame.result.basis};
}
function syncStoredSummary(raw){
 if(raw===null)return null;
 try{
  if(typeof raw!=='string'||new TextEncoder().encode(raw).byteLength>16384)throw Error();
  const value=JSON.parse(raw),coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
  const keys=['schema','month','start_date','end_date','status','checked_at','source_checked_at','progress','coverage','pending','bindings_revision','costs_revision','expenses_revision','tax_policy_revision','ads_status','ads_covered_days','ads_total_days','net_estimate_cents','net_profit_cents','basis'];
  const pendingCodes=['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','TAX_POLICY_REQUIRED','FINANCIAL_SOURCE_STALE'];
  if(!syncExact(value,keys)||value.schema!=='business_sync_summary_v1'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||value.start_date!==value.month+'-01'||typeof value.end_date!=='string'||!new RegExp('^'+value.month+'-(0[1-9]|[12][0-9]|3[01])$').test(value.end_date)||!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(value.status)||!syncInteger(value.checked_at,1,9999999999)||!syncExact(value.source_checked_at,['finance_oldest_at','finance_latest_at','ads_at'])||!Object.values(value.source_checked_at).every(at=>at===null||syncInteger(at,1,value.checked_at))||!syncExact(value.progress,['windows_total','windows_complete','pages_read'])||!syncInteger(value.progress.windows_total,1,3)||!syncInteger(value.progress.windows_complete,0,value.progress.windows_total)||!syncInteger(value.progress.pages_read,0,600)||!syncExact(value.coverage,coverageKeys)||!coverageKeys.every(key=>syncInteger(value.coverage[key],0,3000))||!Array.isArray(value.pending)||value.pending.length>pendingCodes.length||new Set(value.pending).size!==value.pending.length||!value.pending.every(code=>pendingCodes.includes(code))||!syncInteger(value.bindings_revision,1,2147483647)||!syncInteger(value.costs_revision,1,2147483647)||!syncInteger(value.expenses_revision,0,2147483646)||value.tax_policy_revision!==null&&!syncInteger(value.tax_policy_revision,0,2147483647)||![null,'AVAILABLE','PARTIAL','UNAVAILABLE'].includes(value.ads_status)||!syncInteger(value.ads_covered_days,0,31)||!syncInteger(value.ads_total_days,0,31)||value.ads_covered_days>value.ads_total_days||value.net_estimate_cents!==null&&!syncInteger(value.net_estimate_cents,Number.MIN_SAFE_INTEGER)||value.net_profit_cents!==null||value.basis!=='PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE'||value.status!=='COMPLETE'&&value.net_estimate_cents!==null||value.pending.length&&value.net_estimate_cents!==null)throw Error();
  return value;
 }catch{syncFail('BUSINESS_SYNC_STATE_INVALID');}
}
function syncStored(row){
 if(!row||!syncInteger(row.revision,1,2147483647)||![0,1].includes(row.enabled)||!syncStatuses.includes(row.status)||row.month!==null&&(typeof row.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month))||!syncInteger(row.next_run_at)||!syncInteger(row.failure_count,0,1000000)||![row.last_attempt_at,row.last_success_at,row.lease_expires_at].every(at=>at===null||syncInteger(at,1,9999999999))||row.last_error!==null&&!syncErrors.includes(row.last_error)||row.lease_token!==null&&(typeof row.lease_token!=='string'||!/^[a-f0-9-]{36}$/.test(row.lease_token))||(row.lease_token===null)!==(row.lease_expires_at===null))syncFail('BUSINESS_SYNC_STATE_INVALID');
 return {schema:'business_sync_state_v1',revision:row.revision,enabled:row.enabled===1,mode:'READ_ONLY',status:row.status,month:row.month,next_run_at:row.next_run_at,lease_expires_at:row.lease_expires_at,failure_count:row.failure_count,last_attempt_at:row.last_attempt_at,last_success_at:row.last_success_at,last_error:row.last_error,summary:syncStoredSummary(row.summary)};
}
const syncRead=async db=>{let row;try{row=await db.prepare('SELECT * FROM business_sync_state WHERE id=1').first();}catch{syncFail('BUSINESS_SYNC_STORAGE_UNAVAILABLE');}return {row,state:syncStored(row)};};

export async function readBusinessSyncState(env){return (await syncRead(await syncSetup(env))).state;}

export async function saveBusinessSyncPolicy(env,input,actor='admin',{now=()=>Date.now()}={}){
 if(!syncExact(input,['revision','enabled'])||!syncInteger(input.revision,1,2147483646)||typeof input.enabled!=='boolean')syncFail('BUSINESS_SYNC_POLICY_INVALID',400);
 if(typeof actor!=='string'||!actor.trim()||actor.length>256||/[\u0000-\u001f\u007f-\u009f]/.test(actor))syncFail('BUSINESS_SYNC_ACTOR_INVALID',400);
 const db=await syncSetup(env),stamp=Math.floor(syncClock(now)/1000),current=await syncRead(db);
 if(current.state.revision!==input.revision)syncFail('BUSINESS_SYNC_CHANGED_RELOAD',409);
 if(current.state.enabled===input.enabled)return current.state;
 let results;try{results=await db.batch([
  db.prepare("UPDATE business_sync_state SET revision=revision+1,enabled=?,status=CASE WHEN ?=0 THEN 'PAUSED' WHEN lease_expires_at>? THEN 'RUNNING' ELSE 'IDLE' END,next_run_at=? WHERE id=1 AND revision=?").bind(Number(input.enabled),Number(input.enabled),stamp,input.enabled?0:current.state.next_run_at,input.revision),
  db.prepare("INSERT INTO business_sync_audit(id,kind,month,status,started_at,finished_at,finance_steps,ads_reads,error_code,policy_revision,actor,summary) SELECT ?,'POLICY',month,status,?,?,0,0,NULL,revision,?,NULL FROM business_sync_state WHERE changes()=1 AND id=1 AND revision=?").bind(crypto.randomUUID(),stamp,stamp,actor,input.revision+1),
 ]);}catch{syncFail('BUSINESS_SYNC_STORAGE_UNAVAILABLE');}
 if(results[0]?.meta?.changes!==1)syncFail('BUSINESS_SYNC_CHANGED_RELOAD',409);
 if(results[1]?.meta?.changes!==1)syncFail('BUSINESS_SYNC_STORAGE_UNAVAILABLE');
 return (await syncRead(db)).state;
}

// A run fits inside one five-minute cron interval, including the existing
// transport timeouts. Never detach a stateful request with Promise.race: a
// timed-out caller must not release its lease while that request still writes.
export async function runBusinessSync(env,services,{now=()=>Date.now(),maxSteps=4}={}){
 if(typeof now!=='function'||!syncInteger(maxSteps,1,4))syncFail('BUSINESS_SYNC_OPTIONS_INVALID',400);
 const db=await syncSetup(env),startedMs=syncClock(now),started=Math.floor(startedMs/1000),deadline=startedMs+270000,token=crypto.randomUUID(),month=syncMonth(startedMs);
 let {state}=await syncRead(db);const result=(status,finance_steps=0,ads_reads=0)=>({status,finance_steps,ads_reads,state});
 if(!state.enabled)return result('PAUSED');
 if(state.lease_expires_at!==null&&state.lease_expires_at>started)return result('LEASED');
 if(state.next_run_at>started)return result('NOT_DUE');
 let acquired;try{acquired=await db.prepare("UPDATE business_sync_state SET lease_token=?,lease_expires_at=?,status='RUNNING',month=?,last_attempt_at=? WHERE id=1 AND enabled=1 AND next_run_at<=? AND (lease_token IS NULL OR lease_expires_at<=?)").bind(token,started+300,month,started,started,started).run();}catch{syncFail('BUSINESS_SYNC_STORAGE_UNAVAILABLE');}
 if(acquired?.meta?.changes!==1){state=(await syncRead(db)).state;return result(!state.enabled?'PAUSED':state.lease_expires_at>started?'LEASED':'NOT_DUE');}
 let frame=null,financeSteps=0,adsReads=0,status='RUNNING',errorCode=null,stopped=false,yielded=false;
 const canCall=async budget=>{
  const clock=syncClock(now);if(clock<startedMs||clock+budget+5000>deadline||syncMonth(clock)!==month)return false;
  const latest=await syncRead(db);return latest.state.enabled&&latest.row.lease_token===token&&latest.row.lease_expires_at>Math.floor(clock/1000);
 };
 const collectors={
  getFinanceBusinessPeriod:async(binding,input)=>{if(typeof services?.getFinanceBusinessPeriod!=='function')throw Error();if(!await canCall(45000)){stopped=yielded=true;throw Error();}financeSteps++;return services.getFinanceBusinessPeriod(binding,input,{timeoutMs:45000});},
  getAdsCalendar:async(binding,input)=>{if(typeof services?.getAdsCalendar!=='function')throw Error();if(!await canCall(60000)){stopped=yielded=true;throw Error();}adsReads++;return services.getAdsCalendar(binding,input,{now,timeoutMs:10000});},
 };
 try{
  for(let step=0;step<maxSteps;step++){
   if(!await canCall(45000)){stopped=true;break;}
   frame=projectBusinessMonth(await businessMonthWithCheckpoint(env,{operation:step===0?'start':'step',month},collectors,{now,actor:'business-sync'}));
   if(!frame||frame.month!==month)throw new BusinessSyncError('BUSINESS_SYNC_RESULT_INVALID');
   if(frame.status!=='RUNNING')break;
  }
  if(frame?.status==='COMPLETE'&&await canCall(60000)){
   if(await canCall(60000)){
    frame=projectBusinessMonth(await businessMonthWithCheckpoint(env,{operation:'ads',month},collectors,{now,actor:'business-sync'}));
    if(!frame||frame.month!==month)throw new BusinessSyncError('BUSINESS_SYNC_RESULT_INVALID');
   }
  }
  if(frame?.result.pending.some(code=>['SOURCE_UNAVAILABLE','FINANCIAL_SOURCE_STALE'].includes(code))){status='ERROR';errorCode='BUSINESS_SYNC_COLLECTION_UNAVAILABLE';}
  else if(frame?.status==='LIMIT_REACHED'){status='LIMIT_REACHED';errorCode='BUSINESS_SYNC_PERIOD_LIMIT_REACHED';}
  else if(frame?.status==='COMPLETE'){
   status=frame.ads?.status==='AVAILABLE'?'COMPLETE':'PARTIAL';
   if(status==='PARTIAL')errorCode='BUSINESS_SYNC_ADS_INCOMPLETE';
  }
 }catch(error){if(!yielded){status='ERROR';errorCode=error instanceof BusinessSyncError&&error.message==='BUSINESS_SYNC_RESULT_INVALID'?error.message:'BUSINESS_SYNC_COLLECTION_UNAVAILABLE';}}
 const finished=Math.max(started,Math.floor(syncClock(now)/1000)),latest=await syncRead(db);
 if(latest.row.lease_token!==token){state=latest.state;return result('LEASED',financeSteps,adsReads);}
 if(!latest.state.enabled)status='PAUSED';
 const failure=errorCode!==null,failureCount=failure?Math.min(latest.state.failure_count+1,1000000):0;
 const delay=failure?[300,600,1200,1800][Math.min(failureCount-1,3)]:300;
 const summary=frame?JSON.stringify(syncSummary(frame)):latest.state.summary?.month===month?latest.row.summary:null;
 const next=stopped&&syncMonth(finished*1000)!==month?finished:finished+delay;
 let writes;try{writes=await db.batch([
  db.prepare('UPDATE business_sync_state SET status=?,lease_token=NULL,lease_expires_at=NULL,next_run_at=?,failure_count=?,last_success_at=?,last_error=?,summary=? WHERE id=1 AND lease_token=?').bind(status,next,failureCount,status==='COMPLETE'?finished:latest.state.last_success_at,errorCode,summary,token),
  db.prepare("INSERT INTO business_sync_audit(id,kind,month,status,started_at,finished_at,finance_steps,ads_reads,error_code,policy_revision,actor,summary) SELECT ?,'RUN',month,status,?,?,?,?,?,revision,'business-sync',summary FROM business_sync_state WHERE changes()=1 AND id=1 AND lease_token IS NULL AND last_attempt_at=?").bind(token,started,finished,financeSteps,adsReads,errorCode,started),
 ]);}catch{syncFail('BUSINESS_SYNC_STORAGE_UNAVAILABLE');}
 if(writes[0]?.meta?.changes!==1){state=(await syncRead(db)).state;return result(state.enabled?'LEASED':'PAUSED',financeSteps,adsReads);}
 if(writes[1]?.meta?.changes!==1)syncFail('BUSINESS_SYNC_STORAGE_UNAVAILABLE');
 state=(await syncRead(db)).state;return result(status,financeSteps,adsReads);
}
