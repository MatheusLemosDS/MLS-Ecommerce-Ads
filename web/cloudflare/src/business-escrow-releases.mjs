import {readCompletedBusinessMonth} from './business-month-publication.mjs';
import {projectEscrowReleaseFrame} from '../../finance/src/escrow-release-frame.mjs';

export const BUSINESS_ESCROW_RELEASES_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_escrow_release_reports(month TEXT NOT NULL,cohort_key TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=65536),checked_at INTEGER NOT NULL,PRIMARY KEY(month,cohort_key))`,
 `CREATE TABLE IF NOT EXISTS business_escrow_release_attempts(month TEXT NOT NULL,cohort_key TEXT NOT NULL,checked_at INTEGER NOT NULL,status TEXT NOT NULL,code TEXT,next_attempt_at INTEGER NOT NULL,PRIMARY KEY(month,cohort_key))`,
 `CREATE TABLE IF NOT EXISTS business_escrow_release_leases(month TEXT PRIMARY KEY NOT NULL,lease_token TEXT NOT NULL,lease_until INTEGER NOT NULL)`,
];
export class BusinessEscrowReleasesError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const fail=(code,status=503)=>{throw new BusinessEscrowReleasesError(code,status);};
const ready=new WeakSet(),encoder=new TextEncoder();
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const integer=(value,min=0,max=9999999999)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const codes=['UNAVAILABLE','CONFIGURATION','RESPONSE_INVALID','REDIRECT_REJECTED','HTTP_ERROR','CONTENT_TYPE_INVALID','BODY_LIMIT','JSON_INVALID','FRAME_INVALID','SCOPE_MISMATCH','TIMEOUT','NETWORK_ERROR','BODY_READ_ERROR','SOURCE_UNAVAILABLE','PERMISSION_REQUIRED'].map(suffix=>'FINANCE_ESCROW_RELEASES_'+suffix);
function clock(now){let value;try{value=now();}catch{fail('BUSINESS_ESCROW_RELEASES_CLOCK_INVALID');}if(!integer(value,1,9999999999999))fail('BUSINESS_ESCROW_RELEASES_CLOCK_INVALID');return Math.floor(value/1000);}
function selection(input,stamp){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
 if(!exact(input,['month'])||typeof input.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)||input.month<'2000-01'||input.month>today.slice(0,7))fail('BUSINESS_ESCROW_RELEASES_REQUEST_INVALID',400);return input.month;
}
async function database(env){const db=env?.ADMIN_DB;if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')fail('BUSINESS_ESCROW_RELEASES_CONFIGURATION');if(!ready.has(db)){await db.batch(BUSINESS_ESCROW_RELEASES_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}return db;}
function exactCents(raw){if(raw===null)return null;if(typeof raw!=='string'||raw.length>40)return null;const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(raw);if(!match)return null;const value=(BigInt(match[2])*100n+BigInt((match[3]??'').padEnd(2,'0')))*(match[1]?-1n:1n);return value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;}
function cohortOf(published){
 if(!published)return null;
 return {publication_revision:published.publication.source_revision,start_date:published.payload.start_date,end_date:published.payload.end_date,sources:published.payload.slots.map(({frame})=>({run_id:frame.run_id,source_revision:frame.revision,start_date:frame.start_date,end_date:frame.end_date,finance_oldest_at:frame.source_checked_at?.oldest_at??frame.cutoff_at,finance_latest_at:frame.source_checked_at?.latest_at??frame.checked_at,orders:frame.coverage.orders,paid_orders:frame.coverage.paid,expected_repass_cents:exactCents(frame.expected_repass_raw)}))};
}
function reportMatches(frame,cohort,month){
 if(!frame||frame.month!==month)return false;const sources=cohort?.sources??[];
 if(frame.sources.length!==sources.length)return false;
 return sources.every(source=>{const observed=frame.sources.find(row=>row.run_id===source.run_id);if(!observed||observed.source_revision!==source.source_revision)return false;if(observed.status==='MISSING')return true;
  return observed.start_date===source.start_date&&observed.end_date===source.end_date&&observed.orders===source.orders&&observed.paid_orders===source.paid_orders&&observed.expected_repass_cents===source.expected_repass_cents&&(source.orders===0||observed.finance_oldest_at===source.finance_oldest_at&&observed.finance_latest_at===source.finance_latest_at);
 });
}

// The owner page supplies its frozen Finance projector. Calendar cutoffs and
// the published order-creation cohort remain two distinct, explicit scopes.
export function projectBusinessEscrowReleases(value,projectFrame){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const integer=(item,min=0,max=9999999999)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const cents=item=>item===null||integer(item,Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER);
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const uuid=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
 const safeCodes=['UNAVAILABLE','CONFIGURATION','RESPONSE_INVALID','REDIRECT_REJECTED','HTTP_ERROR','CONTENT_TYPE_INVALID','BODY_LIMIT','JSON_INVALID','FRAME_INVALID','SCOPE_MISMATCH','TIMEOUT','NETWORK_ERROR','BODY_READ_ERROR','SOURCE_UNAVAILABLE','PERMISSION_REQUIRED'].map(suffix=>'FINANCE_ESCROW_RELEASES_'+suffix);
 try{
  if(typeof projectFrame!=='function'||!exact(value,['schema','month','checked_at','status','cohort','report','attempt'])||value.schema!=='business_escrow_releases_v1'||typeof value.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||value.month<'2000-01'||!integer(value.checked_at,1)||!['COLLECTING','RUNNING','CHECKED','PARTIAL','UNAVAILABLE'].includes(value.status))return null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000));if(value.month>today.slice(0,7))return null;
  let cohort=null;
  if(value.cohort!==null){const c=value.cohort;if(!exact(c,['publication_revision','start_date','end_date','sources'])||!integer(c.publication_revision,1,2147483647)||c.start_date!==value.month+'-01'||!day(c.start_date)||!day(c.end_date)||c.end_date.slice(0,7)!==value.month||c.end_date>today||!array(c.sources,3)||c.sources.length!==Math.ceil(Number(c.end_date.slice(8))/15))return null;
   const ids=new Set(),sources=[];
   for(let index=0;index<c.sources.length;index++){const source=c.sources[index],start=value.month+'-'+String(index*15+1).padStart(2,'0'),end=value.month+'-'+String(Math.min(index*15+15,Number(c.end_date.slice(8)))).padStart(2,'0');
    if(!exact(source,['run_id','source_revision','start_date','end_date','finance_oldest_at','finance_latest_at','orders','paid_orders','expected_repass_cents'])||!uuid(source.run_id)||ids.has(source.run_id)||!integer(source.source_revision,1,2147483647)||source.start_date!==start||source.end_date!==end||!integer(source.orders,0,1000)||!integer(source.paid_orders,0,source.orders)||!cents(source.expected_repass_cents)||(source.finance_oldest_at===null)!==(source.finance_latest_at===null)||source.orders>0&&source.finance_oldest_at===null||source.finance_oldest_at!==null&&(!integer(source.finance_oldest_at,1,value.checked_at)||!integer(source.finance_latest_at,source.finance_oldest_at,value.checked_at)))return null;
    ids.add(source.run_id);sources.push({...source});
   }
   cohort={publication_revision:c.publication_revision,start_date:c.start_date,end_date:c.end_date,sources};
  }
  let report=null;if(value.report!==null){report=projectFrame(value.report);const sources=cohort?.sources??[];if(!report||report.month!==value.month||report.checked_at>value.checked_at||report.sources.length!==sources.length)return null;
   for(const source of sources){const observed=report.sources.find(row=>row.run_id===source.run_id);if(!observed||observed.source_revision!==source.source_revision)return null;if(observed.status==='AVAILABLE'&&(observed.start_date!==source.start_date||observed.end_date!==source.end_date||observed.orders!==source.orders||observed.paid_orders!==source.paid_orders||observed.expected_repass_cents!==source.expected_repass_cents||source.orders>0&&(observed.finance_oldest_at!==source.finance_oldest_at||observed.finance_latest_at!==source.finance_latest_at)))return null;}
  }
  let attempt=null;if(value.attempt!==null){const a=value.attempt;if(!exact(a,['checked_at','status','code','next_attempt_at'])||!integer(a.checked_at,1,value.checked_at)||!integer(a.next_attempt_at,a.checked_at)||!['SUCCESS','UNAVAILABLE'].includes(a.status)||(a.status==='SUCCESS'?a.code!==null:!safeCodes.includes(a.code)))return null;attempt={...a};}
  const unavailable=attempt?.status==='UNAVAILABLE',status=report?(report.status==='CHECKED'&&!unavailable?'CHECKED':report.status==='COLLECTING'&&!unavailable?'RUNNING':'PARTIAL'):unavailable?'UNAVAILABLE':'COLLECTING';
  if(value.status!==status||attempt?.status==='SUCCESS'&&report===null)return null;
  return {schema:'business_escrow_releases_v1',month:value.month,checked_at:value.checked_at,status,cohort,report,attempt};
 }catch{return null;}
}

async function snapshot(env,month,stamp,now){
 const db=await database(env),published=await readCompletedBusinessMonth(env,month,{now}),cohort=cohortOf(published),requestSources=(cohort?.sources??[]).map(({run_id,source_revision})=>({run_id,source_revision})),key=JSON.stringify(requestSources);
 const rows=await db.batch([db.prepare('SELECT payload,checked_at FROM business_escrow_release_reports WHERE month=? AND cohort_key=?').bind(month,key),db.prepare('SELECT checked_at,status,code,next_attempt_at FROM business_escrow_release_attempts WHERE month=? AND cohort_key=?').bind(month,key)]);
 let report=null;const stored=rows[0]?.results?.[0];if(stored){try{if(typeof stored.payload!=='string'||encoder.encode(stored.payload).byteLength>65536)throw Error();report=projectEscrowReleaseFrame(JSON.parse(stored.payload));}catch{}if(!reportMatches(report,cohort,month)||report.checked_at!==stored.checked_at||report.checked_at>stamp+60)fail('BUSINESS_ESCROW_RELEASES_STORAGE_INVALID');}
 const attempt=rows[1]?.results?.[0]??null;if(attempt&&(!integer(attempt.checked_at,1,stamp+60)||!integer(attempt.next_attempt_at,attempt.checked_at)||!['SUCCESS','UNAVAILABLE'].includes(attempt.status)||(attempt.status==='SUCCESS'?attempt.code!==null:!codes.includes(attempt.code))))fail('BUSINESS_ESCROW_RELEASES_STORAGE_INVALID');
 return {db,cohort,requestSources,key,report,attempt};
}
function view(month,stamp,state){
 stamp=Math.max(stamp,state.report?.checked_at??0,state.attempt?.checked_at??0);const unavailable=state.attempt?.status==='UNAVAILABLE',status=state.report?(state.report.status==='CHECKED'&&!unavailable?'CHECKED':state.report.status==='COLLECTING'&&!unavailable?'RUNNING':'PARTIAL'):unavailable?'UNAVAILABLE':'COLLECTING';
 const projected=projectBusinessEscrowReleases({schema:'business_escrow_releases_v1',month,checked_at:stamp,status,cohort:state.cohort,report:state.report,attempt:state.attempt},projectEscrowReleaseFrame);if(!projected)fail('BUSINESS_ESCROW_RELEASES_RESULT_INVALID');return projected;
}
export async function readBusinessEscrowReleases(env,input,{now=()=>Date.now()}={}){const stamp=clock(now),month=selection(input,stamp);return view(month,stamp,await snapshot(env,month,stamp,()=>stamp*1000));}

export async function runBusinessEscrowReleases(env,source,input,{now=()=>Date.now(),canRun=async()=>true}={}){
 const started=clock(now),month=selection(input,started);if(typeof source!=='function'||typeof canRun!=='function')fail('BUSINESS_ESCROW_RELEASES_CONFIGURATION');
 const initial=await snapshot(env,month,started,()=>started*1000),result=(status,reads=0,repeat=false)=>({schema:'business_escrow_releases_work_v1',month,status,source_reads:reads,repeat});
 if(!await canRun())return result('PAUSED');if(initial.attempt?.next_attempt_at>started)return result('RETRY_WAIT');
 const token=crypto.randomUUID(),db=initial.db,lease=await db.prepare('INSERT INTO business_escrow_release_leases(month,lease_token,lease_until) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until WHERE business_escrow_release_leases.lease_until<=?').bind(month,token,started+90,started).run();if(lease?.meta?.changes!==1)return result('LEASED');
 let reads=0;
 try{
  if(!await canRun())return result('PAUSED');const current=await snapshot(env,month,clock(now),now);if(current.attempt?.next_attempt_at>clock(now))return result('RETRY_WAIT');
  let raw,error;try{reads++;raw=await source(env,{operation:'step',month,sources:current.requestSources});}catch(value){error=value;}
  const finished=clock(now);if(!await canRun())return result('PAUSED',reads);
  const frame=projectEscrowReleaseFrame(raw);let code=null;
  if(!frame){const diagnostic=Object.getOwnPropertyDescriptor(Object.getOwnPropertyDescriptor(raw??{},'diagnostic')?.value??{},'code')?.value??Object.getOwnPropertyDescriptor(error??{},'code')?.value;code=codes.includes(diagnostic)?diagnostic:'FINANCE_ESCROW_RELEASES_UNAVAILABLE';}
  else if(!reportMatches(frame,current.cohort,month)||frame.checked_at>finished+60)code='FINANCE_ESCROW_RELEASES_SCOPE_MISMATCH';
  const valid=code===null,stamp=valid?Math.max(finished,frame.checked_at):finished,collection=valid?frame.collection:null,progress=valid&&collection.status==='RUNNING'&&collection.diagnostic===null,blocked=valid&&collection.status==='BLOCKED',next=valid?Math.max(stamp+(blocked?21600:progress?60:collection.status==='RETRY_WAIT'?60:900),collection.next_attempt_at):stamp+300,repeat=progress&&next<=stamp+60,guard='EXISTS(SELECT 1 FROM business_escrow_release_leases WHERE month=? AND lease_token=? AND lease_until>?)',args=[month,token,finished],writes=[];
  if(valid){const payload=JSON.stringify(frame);if(encoder.encode(payload).byteLength>65536)fail('BUSINESS_ESCROW_RELEASES_RESPONSE_LIMIT');writes.push(db.prepare('INSERT INTO business_escrow_release_reports(month,cohort_key,payload,checked_at) SELECT ?,?,?,? WHERE '+guard+' ON CONFLICT(month,cohort_key) DO UPDATE SET payload=excluded.payload,checked_at=excluded.checked_at WHERE business_escrow_release_reports.checked_at<=excluded.checked_at').bind(month,current.key,payload,frame.checked_at,...args));}
  writes.push(db.prepare('INSERT INTO business_escrow_release_attempts(month,cohort_key,checked_at,status,code,next_attempt_at) SELECT ?,?,?,?,?,? WHERE '+guard+' ON CONFLICT(month,cohort_key) DO UPDATE SET checked_at=excluded.checked_at,status=excluded.status,code=excluded.code,next_attempt_at=excluded.next_attempt_at WHERE business_escrow_release_attempts.checked_at<=excluded.checked_at').bind(month,current.key,stamp,valid?'SUCCESS':'UNAVAILABLE',code,next,...args));
  const attemptIndex=writes.length-1;
  // These are inaccessible presentation-cache signatures, not financial
  // history. Keep this exact scope and the seven newest other scopes per month
  // in the same leased transaction; no extra binding request is introduced.
  const retained='SELECT cohort_key FROM (SELECT cohort_key,MAX(checked_at) AS latest_at FROM (SELECT cohort_key,checked_at FROM business_escrow_release_reports WHERE month=? UNION ALL SELECT cohort_key,checked_at FROM business_escrow_release_attempts WHERE month=?) WHERE cohort_key<>? GROUP BY cohort_key ORDER BY latest_at DESC,cohort_key DESC LIMIT 7)';
  for(const table of ['business_escrow_release_reports','business_escrow_release_attempts'])writes.push(db.prepare('DELETE FROM '+table+' WHERE month=? AND cohort_key<>? AND cohort_key NOT IN('+retained+') AND '+guard).bind(month,current.key,month,month,current.key,...args));
  const saved=await db.batch(writes);if(saved[attemptIndex]?.meta?.changes!==1)return result('LEASED',reads);return result(valid?'CHECKED':'UNAVAILABLE',reads,repeat);
 }finally{await db.prepare('DELETE FROM business_escrow_release_leases WHERE month=? AND lease_token=?').bind(month,token).run();}
}
