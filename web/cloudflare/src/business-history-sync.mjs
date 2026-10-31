import {readBusinessSyncState} from './business-sync.mjs';
import {businessMonthWithCheckpoint} from './business-checkpoint.mjs';
import {projectBusinessMonth} from './business-month.mjs';
import {readCompletedBusinessMonth} from './business-month-publication.mjs';

// A bounded status refresh, not a new accounting source. Only the immediately
// previous creation month is revisited, and only while it has open statuses or
// its saved publication does not yet include the final calendar day. Current
// month work always wins; a persistently busy current collector can defer this
// best-effort maintenance. Older months still require an explicit refresh.
// COMPLETE here describes the order collection only. Closing an incomplete
// month can leave Ads pending until that exact calendar scope is refreshed.
export const BUSINESS_HISTORY_SYNC_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_history_sync_state(month TEXT PRIMARY KEY NOT NULL,status TEXT NOT NULL,next_run_at INTEGER NOT NULL,failure_count INTEGER NOT NULL,last_attempt_at INTEGER NOT NULL,last_success_at INTEGER,last_error TEXT)`,
];
export class BusinessHistorySyncError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const fail=code=>{throw new BusinessHistorySyncError(code);};
const ready=new WeakMap(),open=['ongoing','cancel_pending','unpaid','other','unknown','payment_missing'];
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const localMonth=ms=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(ms)).slice(0,7);
function clock(now){let value;try{value=now();}catch{fail('BUSINESS_HISTORY_CLOCK_INVALID');}if(!integer(value,1,9999999999999))fail('BUSINESS_HISTORY_CLOCK_INVALID');return value;}
async function setup(env){
 const db=env?.ADMIN_DB;if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')fail('BUSINESS_HISTORY_CONFIGURATION');
 if(!ready.has(db))ready.set(db,db.batch(BUSINESS_HISTORY_SYNC_SCHEMA.map(sql=>db.prepare(sql))).catch(()=>{ready.delete(db);fail('BUSINESS_HISTORY_STORAGE_UNAVAILABLE');}));
 await ready.get(db);return db;
}
function stored(row,month){
 if(row===null)return null;
 if(!row||row.month!==month||!['RUNNING','COMPLETE','ERROR','LIMIT_REACHED'].includes(row.status)||!integer(row.next_run_at)||!integer(row.failure_count,0,1000000)||!integer(row.last_attempt_at,1,9999999999)||row.last_success_at!==null&&!integer(row.last_success_at,1,9999999999)||![null,'BUSINESS_HISTORY_COLLECTION_UNAVAILABLE','BUSINESS_HISTORY_RESULT_INVALID','BUSINESS_HISTORY_LIMIT_REACHED'].includes(row.last_error))fail('BUSINESS_HISTORY_STATE_INVALID');
 return row;
}

export async function runBusinessHistorySync(env,services,{now=()=>Date.now(),currentStatus}={}){
 const result=(status,month=null,finance_steps=0)=>({status,month,finance_steps});
 // The scheduled caller must have given this invocation to current Finance
 // first. Neither a failed current run nor a newly completed run adds work.
 if(currentStatus!=='NOT_DUE')return result('DEFERRED');
 const startedMs=clock(now),started=Math.floor(startedMs/1000),currentMonth=localMonth(startedMs),state=await readBusinessSyncState(env);
 if(!state.enabled)return result('PAUSED');
 if(state.lease_expires_at!==null&&state.lease_expires_at>started)return result('LEASED');
 if(state.month!==currentMonth||state.summary?.month!==currentMonth||state.summary.status!=='COMPLETE'||!['COMPLETE','PARTIAL'].includes(state.status)||state.last_error!==null||state.failure_count!==0||state.summary.pending.includes('SOURCE_UNAVAILABLE')||state.next_run_at<=started+50)return result('DEFERRED');
 const last=new Date(currentMonth+'-01T00:00:00Z');last.setUTCDate(0);const finalDay=last.toISOString().slice(0,10),month=finalDay.slice(0,7);
 if(month<'2000-01')return result('IDLE',month);
 const db=await setup(env);
 let previous,exists;
 try{
  exists=await db.prepare('SELECT month FROM business_month_runs WHERE month=?').bind(month).first();
  if(!exists)return result('IDLE',month);
  previous=stored(await db.prepare('SELECT * FROM business_history_sync_state WHERE month=?').bind(month).first(),month);
 }catch(error){if(error instanceof BusinessHistorySyncError)throw error;fail('BUSINESS_HISTORY_STORAGE_UNAVAILABLE');}
 if(previous&&previous.next_run_at>started)return result('NOT_DUE',month);
 const published=await readCompletedBusinessMonth(env,month,{now});
 if(published&&published.payload.end_date===finalDay&&!published.payload.slots.some(slot=>open.some(key=>slot.frame.coverage[key]>0)))return result('IDLE',month);
 const token=crypto.randomUUID();let acquired;
 // Match the primary collector's lease: the 45-second source deadline does
 // not bound the subsequent App/D1 commit. Release it as soon as that finishes.
 try{acquired=await db.prepare("UPDATE business_sync_state SET lease_token=?,lease_expires_at=? WHERE id=1 AND enabled=1 AND revision=? AND month=? AND status IN('COMPLETE','PARTIAL') AND last_error IS NULL AND failure_count=0 AND next_run_at>? AND (lease_token IS NULL OR lease_expires_at<=?)").bind(token,started+300,state.revision,currentMonth,started+50,started).run();}catch{fail('BUSINESS_HISTORY_STORAGE_UNAVAILABLE');}
 if(acquired?.meta?.changes!==1)return result('LEASED',month);
 let released=false,financeSteps=0,interrupted=null;
 const allowed=async(budget=0)=>{
  const ms=clock(now),stamp=Math.floor(ms/1000),row=await db.prepare('SELECT enabled,lease_token,lease_expires_at,next_run_at FROM business_sync_state WHERE id=1').first();
  if(!row||row.lease_token!==token){interrupted='LEASED';return false;}
  if(!row.enabled){interrupted='PAUSED';return false;}
  if(localMonth(ms)!==currentMonth||ms<startedMs||ms+budget>=startedMs+50000||row.lease_expires_at<=stamp||row.next_run_at*1000<=ms+budget){interrupted='DEFERRED';return false;}
  return true;
 };
 try{
  let frame=null,status='RUNNING',errorCode=null;
  try{
   frame=projectBusinessMonth(await businessMonthWithCheckpoint(env,{operation:'start',month},{getFinanceBusinessPeriod:async(binding,input)=>{
    if(financeSteps!==0||typeof services?.getFinanceBusinessPeriod!=='function')throw Error();
    if(!await allowed(45000))throw Error();financeSteps++;
    const value=await services.getFinanceBusinessPeriod(binding,input,{timeoutMs:45000});
    // A late response must not advance the App cohort after a pause, month
    // rollover, timeout or replacement of our lease. No detached request race.
    if(!await allowed())throw Error();return value;
   }},{now,actor:'business-history-sync'}));
   if(!frame||frame.month!==month||frame.start_date!==month+'-01'||frame.end_date!==finalDay){status='ERROR';errorCode='BUSINESS_HISTORY_RESULT_INVALID';}
   else if(frame.status==='LIMIT_REACHED'){status='LIMIT_REACHED';errorCode='BUSINESS_HISTORY_LIMIT_REACHED';}
   else if(frame.result.pending.includes('SOURCE_UNAVAILABLE')){status='ERROR';errorCode='BUSINESS_HISTORY_COLLECTION_UNAVAILABLE';}
   else if(frame.status==='COMPLETE')status='COMPLETE';
  }catch{if(!interrupted){status='ERROR';errorCode='BUSINESS_HISTORY_COLLECTION_UNAVAILABLE';}}
  if(interrupted||!await allowed())return result(interrupted||'DEFERRED',month,financeSteps);
  const finished=Math.floor(clock(now)/1000),failures=errorCode?Math.min((previous?.failure_count||0)+1,1000000):0;
  const delay=errorCode?[300,600,1200,1800][Math.min(failures-1,3)]:status==='COMPLETE'?900:Math.max(60,frame?.collection?.retry_after_seconds||0);
  let writes;
  try{writes=await db.batch([
   db.prepare("INSERT INTO business_history_sync_state(month,status,next_run_at,failure_count,last_attempt_at,last_success_at,last_error) SELECT ?,?,?,?,?,?,? FROM business_sync_state WHERE id=1 AND enabled=1 AND lease_token=? AND lease_expires_at>? ON CONFLICT(month) DO UPDATE SET status=excluded.status,next_run_at=excluded.next_run_at,failure_count=excluded.failure_count,last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,last_error=excluded.last_error").bind(month,status,finished+delay,failures,started,status==='COMPLETE'?finished:previous?.last_success_at??null,errorCode,token,finished),
   db.prepare('UPDATE business_sync_state SET lease_token=NULL,lease_expires_at=NULL WHERE id=1 AND lease_token=?').bind(token),
  ]);}catch{fail('BUSINESS_HISTORY_STORAGE_UNAVAILABLE');}
  released=writes[1]?.meta?.changes===1;
  if(writes[0]?.meta?.changes!==1)return result((await readBusinessSyncState(env)).enabled?'LEASED':'PAUSED',month,financeSteps);
  return result(status,month,financeSteps);
 }finally{
  if(!released){try{await db.prepare('UPDATE business_sync_state SET lease_token=NULL,lease_expires_at=NULL WHERE id=1 AND lease_token=?').bind(token).run();}catch{fail('BUSINESS_HISTORY_STORAGE_UNAVAILABLE');}}
 }
}
