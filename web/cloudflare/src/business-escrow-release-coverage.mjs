import {readCompletedBusinessMonth} from './business-month-publication.mjs';
import {projectEscrowReleaseCoverageFrame} from '../../finance/src/escrow-release-frame.mjs';

export const BUSINESS_ESCROW_RELEASE_COVERAGE_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_escrow_release_coverage(cohort_month TEXT PRIMARY KEY NOT NULL,payload TEXT CHECK(payload IS NULL OR length(CAST(payload AS BLOB))<=65536),payload_checked_at INTEGER,last_attempt_at INTEGER NOT NULL,status TEXT NOT NULL,code TEXT,next_attempt_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS business_escrow_release_coverage_leases(cohort_month TEXT PRIMARY KEY NOT NULL,lease_token TEXT NOT NULL,lease_until INTEGER NOT NULL)`,
];
export class BusinessEscrowReleaseCoverageError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const fail=(code,status=503)=>{throw new BusinessEscrowReleaseCoverageError(code,status);};
const encoder=new TextEncoder(),ready=new WeakSet();
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const integer=(value,min=0,max=9999999999)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const month=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&value>='2000-01';
const codes=['UNAVAILABLE','CONFIGURATION','RESPONSE_INVALID','REDIRECT_REJECTED','HTTP_ERROR','CONTENT_TYPE_INVALID','BODY_LIMIT','JSON_INVALID','FRAME_INVALID','SCOPE_MISMATCH','TIMEOUT','NETWORK_ERROR','BODY_READ_ERROR'].map(suffix=>'FINANCE_ESCROW_RELEASES_'+suffix);
function clock(now){let raw;try{raw=now();}catch{fail('BUSINESS_ESCROW_RELEASE_COVERAGE_CLOCK_INVALID');}if(!integer(raw,1,9999999999999))fail('BUSINESS_ESCROW_RELEASE_COVERAGE_CLOCK_INVALID');return Math.floor(raw/1000);}
function previousMonths(current,count=3){const result=[];let value=new Date(current+'-01T12:00:00Z');for(let index=0;index<count;index++){value.setUTCMonth(value.getUTCMonth()-1);result.push(value.toISOString().slice(0,7));}return result;}
async function database(env){const db=env?.ADMIN_DB;if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')fail('BUSINESS_ESCROW_RELEASE_COVERAGE_CONFIGURATION');if(!ready.has(db)){await db.batch(BUSINESS_ESCROW_RELEASE_COVERAGE_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}return db;}
function sourceRefs(published){return published?.payload.slots.map(slot=>({run_id:slot.frame.run_id,source_revision:slot.frame.revision}))??[];}
function sourceMatches(report,published){
 const expected=sourceRefs(published);if(!report||report.cohort_month!==published?.payload.start_date?.slice(0,7)||report.sources.length!==expected.length)return false;
 return expected.every(ref=>report.sources.some(row=>row.run_id===ref.run_id&&row.source_revision===ref.source_revision));
}
export function projectBusinessEscrowReleaseCoverage(value,projectFrame){
 try{
  if(typeof projectFrame!=='function'||!exact(value,['schema','cohort_month','checked_at','status','report','attempt'])||value.schema!=='business_escrow_release_coverage_v1'||!month(value.cohort_month)||!integer(value.checked_at,1)||!['PENDING','AVAILABLE','PARTIAL_UNAVAILABLE','UNAVAILABLE'].includes(value.status))return null;
  let report=null;if(value.report!==null){report=projectFrame(value.report);if(!report||report.cohort_month!==value.cohort_month||report.checked_at>value.checked_at)return null;}
  let attempt=null;if(value.attempt!==null){const row=value.attempt;if(!exact(row,['checked_at','status','code','next_attempt_at'])||!integer(row.checked_at,1,value.checked_at)||!['SUCCESS','UNAVAILABLE'].includes(row.status)||!integer(row.next_attempt_at,row.checked_at)||(row.status==='SUCCESS'?row.code!==null:!codes.includes(row.code)))return null;attempt={...row};}
  const status=report?(attempt?.status==='UNAVAILABLE'?'PARTIAL_UNAVAILABLE':'AVAILABLE'):attempt?.status==='UNAVAILABLE'?'UNAVAILABLE':'PENDING';if(value.status!==status)return null;
  return {schema:value.schema,cohort_month:value.cohort_month,checked_at:value.checked_at,status,report,attempt};
 }catch{return null;}
}
async function rowFor(db,cohortMonth){return (await db.prepare('SELECT payload,payload_checked_at,last_attempt_at,status,code,next_attempt_at FROM business_escrow_release_coverage WHERE cohort_month=?').bind(cohortMonth).all()).results?.[0]??null;}
function parseRow(row,cohortMonth,stamp){
 if(!row)return {report:null,attempt:null};
 if(!integer(row.last_attempt_at,1,stamp+60)||!integer(row.next_attempt_at,row.last_attempt_at)||!['SUCCESS','UNAVAILABLE'].includes(row.status)||(row.status==='SUCCESS'?row.code!==null:!codes.includes(row.code)))fail('BUSINESS_ESCROW_RELEASE_COVERAGE_STORAGE_INVALID');
 let report=null;if(row.payload!==null){try{if(typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>65536)throw Error();report=projectEscrowReleaseCoverageFrame(JSON.parse(row.payload));}catch{}if(!report||report.cohort_month!==cohortMonth||report.checked_at!==row.payload_checked_at||report.checked_at>stamp+60)fail('BUSINESS_ESCROW_RELEASE_COVERAGE_STORAGE_INVALID');}
 else if(row.payload_checked_at!==null)fail('BUSINESS_ESCROW_RELEASE_COVERAGE_STORAGE_INVALID');
 return {report,attempt:{checked_at:row.last_attempt_at,status:row.status,code:row.code,next_attempt_at:row.next_attempt_at}};
}
function view(cohortMonth,stamp,state){stamp=Math.max(stamp,state.report?.checked_at??0,state.attempt?.checked_at??0);const status=state.report?(state.attempt?.status==='UNAVAILABLE'?'PARTIAL_UNAVAILABLE':'AVAILABLE'):state.attempt?.status==='UNAVAILABLE'?'UNAVAILABLE':'PENDING',value={schema:'business_escrow_release_coverage_v1',cohort_month:cohortMonth,checked_at:stamp,status,report:state.report,attempt:state.attempt},projected=projectBusinessEscrowReleaseCoverage(value,projectEscrowReleaseCoverageFrame);if(!projected)fail('BUSINESS_ESCROW_RELEASE_COVERAGE_RESULT_INVALID');return projected;}

export async function readBusinessEscrowReleaseCoverage(env,input,{now=()=>Date.now()}={}){
 const stamp=clock(now),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000)).slice(0,7);
 if(!exact(input,['month'])||!month(input.month)||input.month>today)fail('BUSINESS_ESCROW_RELEASE_COVERAGE_REQUEST_INVALID',400);
 const db=await database(env);return view(input.month,stamp,parseRow(await rowFor(db,input.month),input.month,stamp));
}

export async function runBusinessEscrowReleaseCoverage(env,source,{through_month},{now=()=>Date.now(),canRun=async()=>true}={}){
 const stamp=clock(now),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000)).slice(0,7);
 if(!month(through_month)||through_month!==today||typeof source!=='function'||typeof canRun!=='function')fail('BUSINESS_ESCROW_RELEASE_COVERAGE_REQUEST_INVALID',400);
 const db=await database(env);if(!await canRun())return {schema:'business_escrow_release_coverage_work_v1',cohort_month:null,status:'PAUSED',service_reads:0};
 const candidates=previousMonths(through_month,3),placeholders=candidates.map(()=>'?').join(','),snapshot=await db.batch([
  db.prepare('SELECT month FROM business_month_publications WHERE month IN('+placeholders+') ORDER BY month').bind(...candidates),
  db.prepare('SELECT cohort_month,payload_checked_at,last_attempt_at,status,next_attempt_at FROM business_escrow_release_coverage WHERE cohort_month IN('+placeholders+')').bind(...candidates)
 ]),published=new Set((snapshot[0]?.results??[]).map(row=>row.month)),stored=new Map((snapshot[1]?.results??[]).map(row=>[row.cohort_month,row]));
 const due=candidates.filter(item=>published.has(item)&&(stored.get(item)?.next_attempt_at??0)<=stamp).sort((a,b)=>(stored.get(a)?.last_attempt_at??0)-(stored.get(b)?.last_attempt_at??0)||a.localeCompare(b))[0];
 if(!due)return {schema:'business_escrow_release_coverage_work_v1',cohort_month:null,status:published.size?'RETRY_WAIT':'NO_COHORT',service_reads:0};
 const publication=await readCompletedBusinessMonth(env,due,{now});if(!publication)return {schema:'business_escrow_release_coverage_work_v1',cohort_month:due,status:'NO_COHORT',service_reads:0};
 const token=crypto.randomUUID(),lease=await db.prepare('INSERT INTO business_escrow_release_coverage_leases(cohort_month,lease_token,lease_until) VALUES(?,?,?) ON CONFLICT(cohort_month) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until WHERE business_escrow_release_coverage_leases.lease_until<=?').bind(due,token,stamp+90,stamp).run();if(lease?.meta?.changes!==1)return {schema:'business_escrow_release_coverage_work_v1',cohort_month:due,status:'LEASED',service_reads:0};
 let reads=0;
 try{
  if(!await canRun())return {schema:'business_escrow_release_coverage_work_v1',cohort_month:due,status:'PAUSED',service_reads:0};
  let raw,error;try{reads++;raw=await source(env,{operation:'coverage',cohort_month:due,through_month,sources:sourceRefs(publication)});}catch(value){error=value;}
  const finished=clock(now);if(!await canRun())return {schema:'business_escrow_release_coverage_work_v1',cohort_month:due,status:'PAUSED',service_reads:reads};
  const frame=projectEscrowReleaseCoverageFrame(raw),diagnostic=Object.getOwnPropertyDescriptor(Object.getOwnPropertyDescriptor(raw??{},'diagnostic')?.value??{},'code')?.value??Object.getOwnPropertyDescriptor(error??{},'code')?.value,valid=frame&&sourceMatches(frame,publication)&&frame.through_month===through_month&&frame.checked_at<=finished+60,code=valid?null:codes.includes(diagnostic)?diagnostic:'FINANCE_ESCROW_RELEASES_UNAVAILABLE',next=finished+(valid&&frame.status==='IDENTITY_COMPLETE'?21600:900),payload=valid?JSON.stringify(frame):null;
  if(payload!==null&&encoder.encode(payload).byteLength>65536)fail('BUSINESS_ESCROW_RELEASE_COVERAGE_RESPONSE_LIMIT');
  const guard='EXISTS(SELECT 1 FROM business_escrow_release_coverage_leases WHERE cohort_month=? AND lease_token=? AND lease_until>?)',args=[due,token,finished],previous=parseRow(await rowFor(db,due),due,finished),savedPayload=valid?payload:previous.report?JSON.stringify(previous.report):null,savedChecked=valid?frame.checked_at:previous.report?.checked_at??null;
  const saved=await db.prepare('INSERT INTO business_escrow_release_coverage(cohort_month,payload,payload_checked_at,last_attempt_at,status,code,next_attempt_at) SELECT ?,?,?,?,?,?,? WHERE '+guard+' ON CONFLICT(cohort_month) DO UPDATE SET payload=excluded.payload,payload_checked_at=excluded.payload_checked_at,last_attempt_at=excluded.last_attempt_at,status=excluded.status,code=excluded.code,next_attempt_at=excluded.next_attempt_at WHERE business_escrow_release_coverage.last_attempt_at<=excluded.last_attempt_at').bind(due,savedPayload,savedChecked,finished,valid?'SUCCESS':'UNAVAILABLE',code,next,...args).run();
  if(saved?.meta?.changes!==1)return {schema:'business_escrow_release_coverage_work_v1',cohort_month:due,status:'LEASED',service_reads:reads};
  return {schema:'business_escrow_release_coverage_work_v1',cohort_month:due,status:valid?frame.status:'UNAVAILABLE',service_reads:reads};
 }finally{await db.prepare('DELETE FROM business_escrow_release_coverage_leases WHERE cohort_month=? AND lease_token=?').bind(due,token).run();}
}
