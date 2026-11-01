import {projectPendingIncomeScanFrame} from '../../finance/src/pending-income-frame.mjs';

// Current account Pending is global. Neither this cache nor its retry clock is
// keyed to a month, and owner reads never create tables or consult the source.
export const BUSINESS_PENDING_INCOME_SCAN_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_pending_income_scan(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT CHECK(payload IS NULL OR length(CAST(payload AS BLOB))<=1048576),payload_checked_at INTEGER,last_attempt_at INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN('RUNNING','COMPLETE','UNAVAILABLE')),code TEXT,next_attempt_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS business_pending_income_scan_lease(id INTEGER PRIMARY KEY CHECK(id=1),lease_token TEXT NOT NULL,lease_until INTEGER NOT NULL)`,
];
export class BusinessPendingIncomeScanError extends Error{constructor(code,status=503){super(code);this.code=code;this.status=status;}}
const fail=(suffix,status=503)=>{throw new BusinessPendingIncomeScanError('BUSINESS_PENDING_INCOME_SCAN_'+suffix,status);};
const ready=new WeakSet(),encoder=new TextEncoder();
const integer=(value,min=0,max=9999999999)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const codes=['UNAVAILABLE','CONFIGURATION','RESPONSE_INVALID','REDIRECT_REJECTED','HTTP_ERROR','CONTENT_TYPE_INVALID','BODY_LIMIT','JSON_INVALID','FRAME_INVALID','TIMEOUT','NETWORK_ERROR','BODY_READ_ERROR','PERMISSION_DENIED','RATE_LIMIT','INVALID_RESPONSE','REPEATED_CURSOR','REPEATED_PAGE','EMPTY_CONTINUATION','LIMIT_REACHED','SCAN_EXPIRED'].map(suffix=>'FINANCE_PENDING_INCOME_SCAN_'+suffix);
function clock(now){let value;try{value=now();}catch{fail('CLOCK_INVALID');}if(!integer(value,1,9999999999999))fail('CLOCK_INVALID');return Math.floor(value/1000);}
function database(env){const db=env?.ADMIN_DB;if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')fail('CONFIGURATION');return db;}
async function setup(db){if(!ready.has(db)){await db.batch(BUSINESS_PENDING_INCOME_SCAN_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}return db;}
const stateOf=frame=>frame?.scan?.state==='RUNNING'?'RUNNING':!frame?.scan&&frame?.report||frame?.scan?.state==='COMPLETE'?'COMPLETE':frame?.scan?'UNAVAILABLE':'RUNNING';

// Deliberately self-contained so the same exact DTO validator can be frozen
// into the browser. The Finance projector is supplied explicitly there.
export function projectBusinessPendingIncomeScan(value,projectFrame){
 try{
  const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
  const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
  const stamp=(item,min=0,max=9999999999)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
  const allowed=['UNAVAILABLE','CONFIGURATION','RESPONSE_INVALID','REDIRECT_REJECTED','HTTP_ERROR','CONTENT_TYPE_INVALID','BODY_LIMIT','JSON_INVALID','FRAME_INVALID','TIMEOUT','NETWORK_ERROR','BODY_READ_ERROR','PERMISSION_DENIED','RATE_LIMIT','INVALID_RESPONSE','REPEATED_CURSOR','REPEATED_PAGE','EMPTY_CONTINUATION','LIMIT_REACHED','SCAN_EXPIRED'].map(suffix=>'FINANCE_PENDING_INCOME_SCAN_'+suffix);
  if(typeof projectFrame!=='function'||!exact(value,['schema','checked_at','status','frame','attempt'])||value.schema!=='business_pending_income_scan_v1'||!stamp(value.checked_at,1)||!['PENDING','AVAILABLE','COLLECTING','PARTIAL_UNAVAILABLE','UNAVAILABLE'].includes(value.status))return null;
  let frame=null,attempt=null;
  if(value.frame!==null){frame=projectFrame(value.frame);if(!frame||frame.checked_at>value.checked_at)return null;}
  if(value.attempt!==null){const a=value.attempt;if(!exact(a,['checked_at','status','code','next_attempt_at'])||!stamp(a.checked_at,1,value.checked_at)||!['SUCCESS','UNAVAILABLE'].includes(a.status)||!stamp(a.next_attempt_at,a.checked_at)||a.status==='SUCCESS'&&a.code!==null||a.status==='UNAVAILABLE'&&!allowed.includes(a.code))return null;attempt={...a};}
  if(frame&&!attempt||attempt?.status==='SUCCESS'&&!frame)return null;
  if(attempt?.status==='SUCCESS'&&frame.scan&&['RETRY_WAIT','ERROR','LIMIT_REACHED'].includes(frame.scan.state))return null;
  const status=attempt?.status==='UNAVAILABLE'?(frame?'PARTIAL_UNAVAILABLE':'UNAVAILABLE'):frame?.scan?.state==='RUNNING'?'COLLECTING':frame?.report?'AVAILABLE':'PENDING';
  if(value.status!==status)return null;
  return {schema:value.schema,checked_at:value.checked_at,status,frame,attempt};
 }catch{return null;}
}
async function storedRow(db){return (await db.prepare('SELECT payload,payload_checked_at,last_attempt_at,status,code,next_attempt_at FROM business_pending_income_scan WHERE id=1').all()).results?.[0]??null;}
function parse(stored,stamp){
 if(!stored)return {frame:null,attempt:null};
 if(!integer(stored.last_attempt_at,1,stamp+60)||!integer(stored.next_attempt_at,stored.last_attempt_at)||!['RUNNING','COMPLETE','UNAVAILABLE'].includes(stored.status)||(stored.status==='UNAVAILABLE'?!codes.includes(stored.code):stored.code!==null))fail('STORAGE_INVALID');
 let frame=null;
 if(stored.payload!==null){try{if(typeof stored.payload!=='string'||encoder.encode(stored.payload).byteLength>1048576)throw Error();frame=projectPendingIncomeScanFrame(JSON.parse(stored.payload));}catch{}if(!frame||frame.checked_at!==stored.payload_checked_at||frame.checked_at>stamp+60)fail('STORAGE_INVALID');}else if(stored.payload_checked_at!==null)fail('STORAGE_INVALID');
 if(stored.status!=='UNAVAILABLE'&&(!frame||stateOf(frame)!==stored.status))fail('STORAGE_INVALID');
 return {frame,attempt:{checked_at:stored.last_attempt_at,status:stored.status==='UNAVAILABLE'?'UNAVAILABLE':'SUCCESS',code:stored.code,next_attempt_at:stored.next_attempt_at}};
}
function view(stamp,state){
 stamp=Math.max(stamp,state.frame?.checked_at??0,state.attempt?.checked_at??0);
 const status=state.attempt?.status==='UNAVAILABLE'?(state.frame?'PARTIAL_UNAVAILABLE':'UNAVAILABLE'):state.frame?.scan?.state==='RUNNING'?'COLLECTING':state.frame?.report?'AVAILABLE':'PENDING';
 const value=projectBusinessPendingIncomeScan({schema:'business_pending_income_scan_v1',checked_at:stamp,status,frame:state.frame,attempt:state.attempt},projectPendingIncomeScanFrame);if(!value)fail('RESULT_INVALID');return value;
}
export async function readBusinessPendingIncomeScan(env,{now=()=>Date.now()}={}){
 const stamp=clock(now),db=database(env),tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='business_pending_income_scan'").all()).results??[];
 return view(stamp,parse(tables.length?await storedRow(db):null,stamp));
}
function sourceCode(raw,error){
 try{const read=(value,name)=>value!==null&&typeof value==='object'?Object.getOwnPropertyDescriptor(value,name)?.value:undefined;
 const diagnostic=read(raw,'diagnostic'),candidate=read(diagnostic,'code')??read(error,'code');
 return codes.includes(candidate)?candidate:'FINANCE_PENDING_INCOME_SCAN_UNAVAILABLE';}catch{return 'FINANCE_PENDING_INCOME_SCAN_UNAVAILABLE';}
}
function preservePublication(frame,previous){
 const old=previous?.report;if(!old)return frame;
 if(frame.report&&frame.report.completed_at>=old.completed_at)return frame;
 // A new active scan must not make a completed publication disappear. If the
 // replacement is internally incompatible, reject the refresh and keep all of
 // the previous frame rather than manufacturing a valid-looking publication.
 return projectPendingIncomeScanFrame({...frame,report:old});
}
export async function runBusinessPendingIncomeScan(env,source,{now=()=>Date.now(),canRun=async()=>true}={}){
 const started=clock(now),result=(status,source_reads=0,repeat=false)=>({schema:'business_pending_income_scan_work_v1',status,source_reads,repeat});
 if(typeof source!=='function'||typeof canRun!=='function')fail('CONFIGURATION');if(!await canRun())return result('PAUSED');
 const db=await setup(database(env)),initial=parse(await storedRow(db),started);if(initial.attempt?.next_attempt_at>started)return result('RETRY_WAIT');
 const token=crypto.randomUUID(),leased=await db.prepare('INSERT INTO business_pending_income_scan_lease(id,lease_token,lease_until) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until WHERE business_pending_income_scan_lease.lease_until<=?').bind(token,started+90,started).run();if(leased?.meta?.changes!==1)return result('LEASED');
 let reads=0;
 try{
  if(!await canRun())return result('PAUSED');let raw,error;try{reads++;raw=await source(env);}catch(value){error=value;}
  const finished=clock(now);if(finished<started)fail('CLOCK_INVALID');if(!await canRun())return result('PAUSED',reads);
  const previous=parse(await storedRow(db),finished);let frame=projectPendingIncomeScanFrame(raw);if(frame&&frame.checked_at>finished+60)frame=null;if(frame)frame=preservePublication(frame,previous.frame);
  const valid=frame!==null,kind=valid?stateOf(frame):'UNAVAILABLE',code=kind==='UNAVAILABLE'?(valid?'FINANCE_PENDING_INCOME_SCAN_'+frame.scan.error:sourceCode(raw,error)):null;
  const payload=valid?JSON.stringify(frame):previous.frame?JSON.stringify(previous.frame):null,checked=valid?frame.checked_at:previous.frame?.checked_at??null;
  const delay=kind==='RUNNING'?60:kind==='COMPLETE'?900:300,next=Math.max(finished+delay,valid?frame.scan?.next_attempt_at??0:0);
  if(!integer(next,finished))fail('CLOCK_INVALID');if(payload!==null&&encoder.encode(payload).byteLength>1048576)fail('RESPONSE_LIMIT');
  if(!await canRun())return result('PAUSED',reads);
  const guard='EXISTS(SELECT 1 FROM business_pending_income_scan_lease WHERE id=1 AND lease_token=? AND lease_until>?)';
  const saved=await db.prepare('INSERT INTO business_pending_income_scan(id,payload,payload_checked_at,last_attempt_at,status,code,next_attempt_at) SELECT 1,?,?,?,?,?,? WHERE '+guard+' ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,payload_checked_at=excluded.payload_checked_at,last_attempt_at=excluded.last_attempt_at,status=excluded.status,code=excluded.code,next_attempt_at=excluded.next_attempt_at WHERE business_pending_income_scan.last_attempt_at<=excluded.last_attempt_at').bind(payload,checked,finished,kind,code,next,token,finished).run();
  if(saved?.meta?.changes!==1)return result('LEASED',reads);return result(kind==='RUNNING'?'RUNNING':kind==='COMPLETE'?'CHECKED':'UNAVAILABLE',reads,kind==='RUNNING');
 }finally{await db.prepare('DELETE FROM business_pending_income_scan_lease WHERE id=1 AND lease_token=?').bind(token).run();}
}
