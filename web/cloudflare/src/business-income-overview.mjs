import {projectIncomeOverviewFrame} from '../../finance/src/income-overview-frame.mjs';

export const BUSINESS_INCOME_OVERVIEW_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_income_overview(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT CHECK(payload IS NULL OR length(CAST(payload AS BLOB))<=65536),payload_checked_at INTEGER,last_attempt_at INTEGER NOT NULL,status TEXT NOT NULL,code TEXT,next_attempt_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS business_income_overview_lease(id INTEGER PRIMARY KEY CHECK(id=1),lease_token TEXT NOT NULL,lease_until INTEGER NOT NULL)`,
];
export class BusinessIncomeOverviewError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const fail=(code,status=503)=>{throw new BusinessIncomeOverviewError(code,status);},ready=new WeakSet(),encoder=new TextEncoder();
const integer=(v,min=0,max=9999999999)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const codes=['UNAVAILABLE','CONFIGURATION','RESPONSE_INVALID','REDIRECT_REJECTED','HTTP_ERROR','CONTENT_TYPE_INVALID','BODY_LIMIT','JSON_INVALID','FRAME_INVALID','TIMEOUT','NETWORK_ERROR','BODY_READ_ERROR'].map(s=>'FINANCE_INCOME_OVERVIEW_'+s);
function clock(now){let raw;try{raw=now();}catch{fail('BUSINESS_INCOME_OVERVIEW_CLOCK_INVALID');}if(!integer(raw,1,9999999999999))fail('BUSINESS_INCOME_OVERVIEW_CLOCK_INVALID');return Math.floor(raw/1000);}
async function database(env){const db=env?.ADMIN_DB;if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')fail('BUSINESS_INCOME_OVERVIEW_CONFIGURATION');if(!ready.has(db)){await db.batch(BUSINESS_INCOME_OVERVIEW_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}return db;}
export function projectBusinessIncomeOverview(value,projectFrame){
 try{
  const integer=(v,min=0,max=9999999999)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
  const codes=['UNAVAILABLE','CONFIGURATION','RESPONSE_INVALID','REDIRECT_REJECTED','HTTP_ERROR','CONTENT_TYPE_INVALID','BODY_LIMIT','JSON_INVALID','FRAME_INVALID','TIMEOUT','NETWORK_ERROR','BODY_READ_ERROR'].map(s=>'FINANCE_INCOME_OVERVIEW_'+s);

  if(typeof projectFrame!=='function'||!value||typeof value!=='object'||Array.isArray(value)||Reflect.ownKeys(value).length!==5||value.schema!=='business_income_overview_v1'||!integer(value.checked_at,1)||!['PENDING','AVAILABLE','PARTIAL_UNAVAILABLE','UNAVAILABLE'].includes(value.status))return null;
  let report=null;if(value.report!==null){report=projectFrame(value.report);if(!report||report.checked_at>value.checked_at)return null;}
  let attempt=null;if(value.attempt!==null){const a=value.attempt;if(!a||typeof a!=='object'||Array.isArray(a)||Reflect.ownKeys(a).length!==4||!integer(a.checked_at,1,value.checked_at)||!['SUCCESS','UNAVAILABLE'].includes(a.status)||!integer(a.next_attempt_at,a.checked_at)||(a.status==='SUCCESS'?a.code!==null:!codes.includes(a.code)))return null;attempt={...a};}
  const status=report?(attempt?.status==='UNAVAILABLE'?'PARTIAL_UNAVAILABLE':'AVAILABLE'):attempt?.status==='UNAVAILABLE'?'UNAVAILABLE':'PENDING';if(status!==value.status)return null;
  return {schema:value.schema,checked_at:value.checked_at,status,report,attempt};
 }catch{return null;}
}
async function row(db){return (await db.prepare('SELECT payload,payload_checked_at,last_attempt_at,status,code,next_attempt_at FROM business_income_overview WHERE id=1').all()).results?.[0]??null;}
function parse(stored,stamp){
 if(!stored)return {report:null,attempt:null};
 if(!integer(stored.last_attempt_at,1,stamp+60)||!integer(stored.next_attempt_at,stored.last_attempt_at)||!['SUCCESS','UNAVAILABLE'].includes(stored.status)||(stored.status==='SUCCESS'?stored.code!==null:!codes.includes(stored.code)))fail('BUSINESS_INCOME_OVERVIEW_STORAGE_INVALID');
 let report=null;if(stored.payload!==null){try{if(typeof stored.payload!=='string'||encoder.encode(stored.payload).byteLength>65536)throw Error();report=projectIncomeOverviewFrame(JSON.parse(stored.payload));}catch{}if(!report||report.checked_at!==stored.payload_checked_at||report.checked_at>stamp+60)fail('BUSINESS_INCOME_OVERVIEW_STORAGE_INVALID');}
 else if(stored.payload_checked_at!==null)fail('BUSINESS_INCOME_OVERVIEW_STORAGE_INVALID');
 return {report,attempt:{checked_at:stored.last_attempt_at,status:stored.status,code:stored.code,next_attempt_at:stored.next_attempt_at}};
}
function view(stamp,state){stamp=Math.max(stamp,state.report?.checked_at??0,state.attempt?.checked_at??0);const status=state.report?(state.attempt?.status==='UNAVAILABLE'?'PARTIAL_UNAVAILABLE':'AVAILABLE'):state.attempt?.status==='UNAVAILABLE'?'UNAVAILABLE':'PENDING',value={schema:'business_income_overview_v1',checked_at:stamp,status,report:state.report,attempt:state.attempt},projected=projectBusinessIncomeOverview(value,projectIncomeOverviewFrame);if(!projected)fail('BUSINESS_INCOME_OVERVIEW_RESULT_INVALID');return projected;}
export async function readBusinessIncomeOverview(env,{now=()=>Date.now()}={}){const stamp=clock(now),db=await database(env);return view(stamp,parse(await row(db),stamp));}
export async function runBusinessIncomeOverview(env,source,{now=()=>Date.now(),canRun=async()=>true}={}){
 const started=clock(now),db=await database(env),initial=parse(await row(db),started),result=(status,reads=0)=>({schema:'business_income_overview_work_v1',status,source_reads:reads});
 if(typeof source!=='function'||typeof canRun!=='function')fail('BUSINESS_INCOME_OVERVIEW_CONFIGURATION');if(!await canRun())return result('PAUSED');if(initial.attempt?.next_attempt_at>started)return result('RETRY_WAIT');
 const token=crypto.randomUUID(),lease=await db.prepare('INSERT INTO business_income_overview_lease(id,lease_token,lease_until) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until WHERE business_income_overview_lease.lease_until<=?').bind(token,started+90,started).run();if(lease?.meta?.changes!==1)return result('LEASED');
 let reads=0;try{
  if(!await canRun())return result('PAUSED');let raw,error;try{reads++;raw=await source(env);}catch(value){error=value;}const finished=clock(now);if(!await canRun())return result('PAUSED',reads);
  const frame=projectIncomeOverviewFrame(raw),diagnostic=Object.getOwnPropertyDescriptor(Object.getOwnPropertyDescriptor(raw??{},'diagnostic')?.value??{},'code')?.value??Object.getOwnPropertyDescriptor(error??{},'code')?.value,valid=frame&&frame.checked_at<=finished+60,code=valid?null:codes.includes(diagnostic)?diagnostic:'FINANCE_INCOME_OVERVIEW_UNAVAILABLE',previous=parse(await row(db),finished),payload=valid?JSON.stringify(frame):previous.report?JSON.stringify(previous.report):null,checked=valid?frame.checked_at:previous.report?.checked_at??null,next=finished+(valid?900:300);
  if(payload!==null&&encoder.encode(payload).byteLength>65536)fail('BUSINESS_INCOME_OVERVIEW_RESPONSE_LIMIT');
  const guard='EXISTS(SELECT 1 FROM business_income_overview_lease WHERE id=1 AND lease_token=? AND lease_until>?)',saved=await db.prepare('INSERT INTO business_income_overview(id,payload,payload_checked_at,last_attempt_at,status,code,next_attempt_at) SELECT 1,?,?,?,?,?,? WHERE '+guard+' ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,payload_checked_at=excluded.payload_checked_at,last_attempt_at=excluded.last_attempt_at,status=excluded.status,code=excluded.code,next_attempt_at=excluded.next_attempt_at WHERE business_income_overview.last_attempt_at<=excluded.last_attempt_at').bind(payload,checked,finished,valid?'SUCCESS':'UNAVAILABLE',code,next,token,finished).run();
  if(saved?.meta?.changes!==1)return result('LEASED',reads);return result(valid?'CHECKED':'UNAVAILABLE',reads);
 }finally{await db.prepare('DELETE FROM business_income_overview_lease WHERE id=1 AND lease_token=?').bind(token).run();}
}
