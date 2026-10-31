import {readCompletedBusinessMonth} from './business-month-publication.mjs';
import {projectEscrowReleaseCoverageFrame} from '../../finance/src/escrow-release-frame.mjs';

export const BUSINESS_ESCROW_RELEASE_COVERAGE_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_escrow_release_coverage(cohort_month TEXT PRIMARY KEY NOT NULL,payload TEXT CHECK(payload IS NULL OR length(CAST(payload AS BLOB))<=65536),payload_checked_at INTEGER,last_attempt_at INTEGER NOT NULL,status TEXT NOT NULL,code TEXT,next_attempt_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS business_escrow_release_coverage_leases(cohort_month TEXT PRIMARY KEY NOT NULL,lease_token TEXT NOT NULL,lease_until INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS business_escrow_release_coverage_attempt_scopes(cohort_month TEXT PRIMARY KEY NOT NULL,through_month TEXT NOT NULL,publication_revision INTEGER NOT NULL,checked_at INTEGER NOT NULL)`,
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
function dbOf(env){const db=env?.ADMIN_DB;if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')fail('BUSINESS_ESCROW_RELEASE_COVERAGE_CONFIGURATION');return db;}
async function database(env){const db=dbOf(env);if(!ready.has(db)){await db.batch(BUSINESS_ESCROW_RELEASE_COVERAGE_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}return db;}
function exactCents(raw){if(raw===null)return null;if(typeof raw!=='string'||raw.length>40)return null;const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(raw);if(!match)return null;const value=(BigInt(match[2])*100n+BigInt((match[3]??'').padEnd(2,'0')))*(match[1]?-1n:1n);return value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;}
function sourceRefs(published){return published?.payload.slots.map(slot=>({run_id:slot.frame.run_id,source_revision:slot.frame.revision}))??[];}
function sourceMatches(report,published){
 const slots=published?.payload.slots;if(!report||report.cohort_month!==published?.payload.start_date?.slice(0,7)||!slots||report.sources.length!==slots.length)return false;
 return slots.every(({frame})=>{const observed=report.sources.find(row=>row.run_id===frame.run_id);if(!observed||observed.source_revision!==frame.revision)return false;if(observed.status==='MISSING')return true;
  return observed.start_date===frame.start_date&&observed.end_date===frame.end_date&&observed.orders===frame.coverage.orders&&observed.paid_orders===frame.coverage.paid&&observed.expected_repass_cents===exactCents(frame.expected_repass_raw)&&(frame.coverage.orders===0||observed.finance_oldest_at===(frame.source_checked_at?.oldest_at??frame.cutoff_at)&&observed.finance_latest_at===(frame.source_checked_at?.latest_at??frame.checked_at));
 });
}
const currentMonth=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000)).slice(0,7);
function scopeMatches(scope,publication,throughMonth,row){return !!scope&&scope.through_month===throughMonth&&scope.publication_revision===publication.publication.source_revision&&scope.checked_at===row?.last_attempt_at;}
function parseScope(raw,stamp){if(!raw)return null;if(!month(raw.cohort_month)||!month(raw.through_month)||raw.cohort_month>=raw.through_month||!integer(raw.publication_revision,1,2147483647)||!integer(raw.checked_at,1,stamp+60))fail('BUSINESS_ESCROW_RELEASE_COVERAGE_STORAGE_INVALID');return raw;}
export function projectBusinessEscrowReleaseCoverage(value,projectFrame){
 // The owner client embeds this function verbatim. Keep every validator local
 // so minification cannot capture a server-only module closure.
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const integer=(item,min=0,max=9999999999)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const month=item=>typeof item==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(item)&&item>='2000-01';
 const codes=['UNAVAILABLE','CONFIGURATION','RESPONSE_INVALID','REDIRECT_REJECTED','HTTP_ERROR','CONTENT_TYPE_INVALID','BODY_LIMIT','JSON_INVALID','FRAME_INVALID','SCOPE_MISMATCH','TIMEOUT','NETWORK_ERROR','BODY_READ_ERROR'].map(suffix=>'FINANCE_ESCROW_RELEASES_'+suffix);
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
 const stamp=clock(now),today=currentMonth(stamp);
 if(!exact(input,['month'])||!month(input.month)||input.month>today)fail('BUSINESS_ESCROW_RELEASE_COVERAGE_REQUEST_INVALID',400);
 const db=dbOf(env),tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('business_escrow_release_coverage','business_escrow_release_coverage_attempt_scopes','business_month_publications','business_month_publication_frames')").all()).results??[],names=new Set(tables.map(row=>row.name));
 if(!['business_escrow_release_coverage','business_month_publications','business_month_publication_frames'].every(name=>names.has(name)))return view(input.month,stamp,{report:null,attempt:null});
 const row=await rowFor(db,input.month);if(!row)return view(input.month,stamp,{report:null,attempt:null});
 const state=parseRow(row,input.month,stamp),publication=await readCompletedBusinessMonth(env,input.month,{now});
 if(!publication)return view(input.month,stamp,{report:null,attempt:null});
 const report=sourceMatches(state.report,publication)?state.report:null;
 let attempt=state.attempt;
 // A retained report is historical evidence; replacement of its creation
 // cohort cannot make it current just because the owner opens this section.
 if(!report){const scope=names.has('business_escrow_release_coverage_attempt_scopes')?parseScope((await db.prepare('SELECT cohort_month,through_month,publication_revision,checked_at FROM business_escrow_release_coverage_attempt_scopes WHERE cohort_month=?').bind(input.month).all()).results?.[0],stamp):null;if(!scopeMatches(scope,publication,today,row))attempt=null;}
 return view(input.month,stamp,{report,attempt});
}

export async function runBusinessEscrowReleaseCoverage(env,source,input,{now=()=>Date.now(),canRun=async()=>true}={}){
 const stamp=clock(now),today=currentMonth(stamp);
 if(!exact(input,['through_month'])||!month(input.through_month)||input.through_month!==today||typeof source!=='function'||typeof canRun!=='function')fail('BUSINESS_ESCROW_RELEASE_COVERAGE_REQUEST_INVALID',400);
 const through_month=input.through_month,result=(cohort_month,status,service_reads=0)=>({schema:'business_escrow_release_coverage_work_v1',cohort_month,status,service_reads});
 if(!await canRun())return result(null,'PAUSED');
 const db=await database(env),candidates=previousMonths(through_month,3),placeholders=candidates.map(()=>'?').join(','),snapshot=await db.batch([
  db.prepare('SELECT month,source_revision FROM business_month_publications WHERE month IN('+placeholders+') ORDER BY month').bind(...candidates),
  db.prepare('SELECT cohort_month,payload_checked_at,last_attempt_at,status,code,next_attempt_at,payload FROM business_escrow_release_coverage WHERE cohort_month IN('+placeholders+')').bind(...candidates),
  db.prepare('SELECT cohort_month,through_month,publication_revision,checked_at FROM business_escrow_release_coverage_attempt_scopes WHERE cohort_month IN('+placeholders+')').bind(...candidates),
 ]),published=new Map((snapshot[0]?.results??[]).map(row=>[row.month,row])),stored=new Map((snapshot[1]?.results??[]).map(row=>[row.cohort_month,row])),scopes=new Map((snapshot[2]?.results??[]).map(row=>{const scope=parseScope(row,stamp);return [scope.cohort_month,scope];}));
 const due=candidates.filter(item=>{const publication=published.get(item);if(!publication)return false;const row=stored.get(item);if(row)parseRow(row,item,stamp);const scope=scopes.get(item);return !row||row.next_attempt_at<=stamp||!scope||scope.through_month!==through_month||scope.publication_revision!==publication.source_revision||scope.checked_at!==row.last_attempt_at;}).sort((a,b)=>(stored.get(a)?.last_attempt_at??0)-(stored.get(b)?.last_attempt_at??0)||a.localeCompare(b))[0];
 if(!due)return result(null,published.size?'RETRY_WAIT':'NO_COHORT');
 const publication=await readCompletedBusinessMonth(env,due,{now});if(!publication)return result(due,'NO_COHORT');
 // Checking enabled in the same SQL as the write closes a pause between the
 // last asynchronous canRun check and the transaction. Publication CAS also
 // rejects a source that completed after its immutable cohort was replaced.
 const publicationGuard='EXISTS(SELECT 1 FROM business_month_publications WHERE month=? AND source_revision=? AND payload=?)',publicationArgs=[due,publication.publication.source_revision,publication.row.payload],enabled='EXISTS(SELECT 1 FROM business_sync_state WHERE id=1 AND enabled=1)';
 const token=crypto.randomUUID(),lease=await db.prepare('INSERT INTO business_escrow_release_coverage_leases(cohort_month,lease_token,lease_until) SELECT ?,?,? WHERE '+enabled+' AND '+publicationGuard+' ON CONFLICT(cohort_month) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until WHERE business_escrow_release_coverage_leases.lease_until<=?').bind(due,token,stamp+90,...publicationArgs,stamp).run();
 if(lease?.meta?.changes!==1)return result(due,'LEASED');
 let reads=0;
 try{
  if(!await canRun())return result(due,'PAUSED');
  const beforeSource=clock(now);if(beforeSource<stamp||beforeSource>=stamp+90||currentMonth(beforeSource)!==through_month)return result(due,'SUPERSEDED');
  let raw,error;try{reads++;raw=await source(env,{operation:'coverage',cohort_month:due,through_month,sources:sourceRefs(publication)});}catch(value){error=value;}
  if(!await canRun())return result(due,'PAUSED',reads);
  const sourceFinished=clock(now);if(sourceFinished<stamp||sourceFinished>=stamp+90||currentMonth(sourceFinished)!==through_month)return result(due,'SUPERSEDED',reads);
  const previous=parseRow(await rowFor(db,due),due,sourceFinished),finished=clock(now);if(finished<sourceFinished||finished>=stamp+90||currentMonth(finished)!==through_month)return result(due,'SUPERSEDED',reads);
  const frame=projectEscrowReleaseCoverageFrame(raw),diagnostic=Object.getOwnPropertyDescriptor(Object.getOwnPropertyDescriptor(raw??{},'diagnostic')?.value??{},'code')?.value??Object.getOwnPropertyDescriptor(error??{},'code')?.value,valid=frame&&sourceMatches(frame,publication)&&frame.through_month===through_month&&frame.checked_at<=finished+60&&(!previous.report||frame.checked_at>=previous.report.checked_at),code=valid?null:codes.includes(diagnostic)?diagnostic:'FINANCE_ESCROW_RELEASES_UNAVAILABLE',next=finished+(valid&&frame.status==='IDENTITY_COMPLETE'?21600:900),payload=valid?JSON.stringify(frame):previous.report?JSON.stringify(previous.report):null;
  if(payload!==null&&encoder.encode(payload).byteLength>65536)fail('BUSINESS_ESCROW_RELEASE_COVERAGE_RESPONSE_LIMIT');
  const guard='EXISTS(SELECT 1 FROM business_escrow_release_coverage_leases WHERE cohort_month=? AND lease_token=? AND lease_until>?) AND '+enabled+' AND '+publicationGuard,args=[due,token,finished,...publicationArgs],savedChecked=valid?frame.checked_at:previous.report?.checked_at??null;
  const saved=await db.batch([
   db.prepare('INSERT INTO business_escrow_release_coverage(cohort_month,payload,payload_checked_at,last_attempt_at,status,code,next_attempt_at) SELECT ?,?,?,?,?,?,? WHERE '+guard+' ON CONFLICT(cohort_month) DO UPDATE SET payload=excluded.payload,payload_checked_at=excluded.payload_checked_at,last_attempt_at=excluded.last_attempt_at,status=excluded.status,code=excluded.code,next_attempt_at=excluded.next_attempt_at WHERE business_escrow_release_coverage.last_attempt_at<=excluded.last_attempt_at').bind(due,payload,savedChecked,finished,valid?'SUCCESS':'UNAVAILABLE',code,next,...args),
   db.prepare('INSERT INTO business_escrow_release_coverage_attempt_scopes(cohort_month,through_month,publication_revision,checked_at) SELECT ?,?,?,? WHERE changes()=1 ON CONFLICT(cohort_month) DO UPDATE SET through_month=excluded.through_month,publication_revision=excluded.publication_revision,checked_at=excluded.checked_at WHERE business_escrow_release_coverage_attempt_scopes.checked_at<=excluded.checked_at').bind(due,through_month,publication.publication.source_revision,finished),
  ]);
  if(saved?.[0]?.meta?.changes!==1)return result(due,'SUPERSEDED',reads);
  if(saved?.[1]?.meta?.changes!==1)fail('BUSINESS_ESCROW_RELEASE_COVERAGE_STORAGE_INVALID');
  return result(due,valid?frame.status:'UNAVAILABLE',reads);
 }finally{await db.prepare('DELETE FROM business_escrow_release_coverage_leases WHERE cohort_month=? AND lease_token=?').bind(due,token).run();}
}
