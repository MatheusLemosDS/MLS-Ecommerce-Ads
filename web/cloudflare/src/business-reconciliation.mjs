import {readCompletedBusinessMonth} from './business-month-publication.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';

export const BUSINESS_RECONCILIATION_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_reconciliation_reports(run_id TEXT PRIMARY KEY NOT NULL,source_revision INTEGER NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=1048576),checked_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS business_reconciliation_attempts(run_id TEXT PRIMARY KEY NOT NULL,source_revision INTEGER NOT NULL,checked_at INTEGER NOT NULL,status TEXT NOT NULL,code TEXT,next_attempt_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS business_reconciliation_leases(month TEXT PRIMARY KEY NOT NULL,lease_token TEXT NOT NULL,lease_until INTEGER NOT NULL)`,
];
export class BusinessReconciliationError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const fail=(code,status=503)=>{throw new BusinessReconciliationError(code,status);};
const ready=new WeakSet(),encoder=new TextEncoder();
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const integer=(value,min=0,max=9999999999)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const codes=['UNAVAILABLE','CONFIGURATION','RESPONSE_INVALID','REDIRECT_REJECTED','HTTP_ERROR','CONTENT_TYPE_INVALID','BODY_LIMIT','JSON_INVALID','FRAME_INVALID','SCOPE_MISMATCH','TIMEOUT','NETWORK_ERROR','BODY_READ_ERROR','SOURCE_UNAVAILABLE','PERMISSION_REQUIRED'].map(suffix=>'FINANCE_RECONCILIATION_'+suffix);
function clock(now){let value;try{value=now();}catch{fail('BUSINESS_RECONCILIATION_CLOCK_INVALID');}if(!integer(value,1,9999999999999))fail('BUSINESS_RECONCILIATION_CLOCK_INVALID');return Math.floor(value/1000);}
function selection(input,stamp){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
 if(!exact(input,['month'])||typeof input.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)||input.month<'2000-01'||input.month>today.slice(0,7))fail('BUSINESS_RECONCILIATION_REQUEST_INVALID',400);return input.month;
}
async function database(env){const db=env?.ADMIN_DB;if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')fail('BUSINESS_RECONCILIATION_CONFIGURATION');if(!ready.has(db)){await db.batch(BUSINESS_RECONCILIATION_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}return db;}

// The browser passes its frozen Finance projector. This function captures no
// database, source transport, clock or private identifier.
export function projectBusinessReconciliation(value,projectFrame){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const integer=(item,min=0,max=9999999999)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const uuid=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
 const safeCodes=['UNAVAILABLE','CONFIGURATION','RESPONSE_INVALID','REDIRECT_REJECTED','HTTP_ERROR','CONTENT_TYPE_INVALID','BODY_LIMIT','JSON_INVALID','FRAME_INVALID','SCOPE_MISMATCH','TIMEOUT','NETWORK_ERROR','BODY_READ_ERROR','SOURCE_UNAVAILABLE','PERMISSION_REQUIRED'].map(suffix=>'FINANCE_RECONCILIATION_'+suffix);
 try{
  if(typeof projectFrame!=='function'||!exact(value,['schema','month','start_date','end_date','checked_at','status','source_revision','sources','reports','attempts','pending'])||value.schema!=='business_reconciliation_v1'||typeof value.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||value.month<'2000-01'||value.start_date!==value.month+'-01'||!day(value.start_date)||!integer(value.checked_at,1)||!['COLLECTING','RUNNING','CHECKED','PARTIAL','UNAVAILABLE'].includes(value.status)||!array(value.sources,3)||!array(value.reports,3)||!array(value.attempts,3)||!array(value.pending,3)||new Set(value.pending).size!==value.pending.length||!value.pending.every(code=>['PUBLICATION_REQUIRED','RECONCILIATION_PENDING','SOURCE_UNAVAILABLE'].includes(code)))return null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000));if(value.month>today.slice(0,7))return null;
  if(!value.sources.length){if(value.status!=='COLLECTING'||value.end_date!==null||value.source_revision!==null||value.reports.length||value.attempts.length||JSON.stringify(value.pending)!==JSON.stringify(['PUBLICATION_REQUIRED']))return null;return {...value,sources:[],reports:[],attempts:[],pending:[...value.pending]};}
  if(!day(value.end_date)||value.end_date.slice(0,7)!==value.month||value.end_date>today||!integer(value.source_revision,1,2147483647)||value.sources.length!==Math.ceil(Number(value.end_date.slice(8))/15)||value.status==='COLLECTING'||value.pending.includes('PUBLICATION_REQUIRED'))return null;
  const byId=new Map(),reports=[],attempts=[];
  for(let index=0;index<value.sources.length;index++){const source=value.sources[index],start=value.month+'-'+String(index*15+1).padStart(2,'0'),end=value.month+'-'+String(Math.min(index*15+15,Number(value.end_date.slice(8)))).padStart(2,'0');if(!exact(source,['run_id','source_revision','start_date','end_date'])||!uuid(source.run_id)||byId.has(source.run_id)||!integer(source.source_revision,1,2147483647)||source.start_date!==start||source.end_date!==end)return null;byId.set(source.run_id,source);}
  const seen=new Set();for(const raw of value.reports){const frame=projectFrame(raw),source=frame?byId.get(frame.run_id):null;if(!source||seen.has(frame.run_id)||frame.source_revision!==source.source_revision||frame.start_date!==source.start_date||frame.end_date!==source.end_date||frame.checked_at>value.checked_at)return null;seen.add(frame.run_id);reports.push(frame);}
  const attempted=new Set();for(const row of value.attempts){const source=plain(row)?byId.get(row.run_id):null;if(!source||attempted.has(row.run_id)||!exact(row,['run_id','source_revision','checked_at','status','code','next_attempt_at'])||row.source_revision!==source.source_revision||!integer(row.checked_at,1,value.checked_at)||!integer(row.next_attempt_at,row.checked_at)||!['SUCCESS','UNAVAILABLE'].includes(row.status)||(row.status==='SUCCESS'?row.code!==null:!safeCodes.includes(row.code)))return null;attempted.add(row.run_id);attempts.push({...row});}
  const unavailable=attempts.some(row=>row.status==='UNAVAILABLE'),complete=reports.length===value.sources.length&&reports.every(frame=>frame.status==='CHECKED'),pending=(!complete?['RECONCILIATION_PENDING']:[]).concat(unavailable?['SOURCE_UNAVAILABLE']:[]),status=complete?'CHECKED':reports.length?'PARTIAL':unavailable?'UNAVAILABLE':'RUNNING';
  if(value.status!==status||JSON.stringify(value.pending)!==JSON.stringify(pending))return null;
  return {schema:'business_reconciliation_v1',month:value.month,start_date:value.start_date,end_date:value.end_date,checked_at:value.checked_at,status,source_revision:value.source_revision,sources:value.sources.map(source=>({...source})),reports,attempts,pending};
 }catch{return null;}
}

function matching(frame,source){return frame&&frame.run_id===source.run_id&&frame.source_revision===source.source_revision&&frame.start_date===source.start_date&&frame.end_date===source.end_date;}
function publishedReportMatches(frame,source,published){
 if(!matching(frame,source))return false;
 const original=published.payload.slots.find(slot=>slot.frame.run_id===source.run_id)?.frame,c=original?.coverage;
 if(!c||frame.coverage.orders!==c.orders||frame.coverage.paid_orders!==c.paid||frame.coverage.review_orders!==c.cancel_pending+c.other+c.unknown||frame.coverage.return_orders!==c.returns||frame.coverage.return_unknown_orders!==c.returns_unknown)return false;
 if(c.orders>0&&original.source_checked_at&&(frame.source_checked_at.finance_oldest_at!==original.source_checked_at.oldest_at||frame.source_checked_at.finance_latest_at!==original.source_checked_at.latest_at))return false;
 if(frame.adjustments.base_repass_cents!==null){
  const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(original.known_expected_repass_raw??'');if(!match)return false;
  const amount=(BigInt(match[2])*100n+BigInt((match[3]??'').padEnd(2,'0')))*(match[1]?-1n:1n);
  if(amount!==BigInt(frame.adjustments.base_repass_cents))return false;
 }
 return true;
}
function sourceReferences(published){return published?.payload.slots.map(slot=>({run_id:slot.frame.run_id,source_revision:slot.frame.revision,start_date:slot.start_date,end_date:slot.end_date}))??[];}
async function snapshot(env,month,stamp,now){
 const db=await database(env),published=await readCompletedBusinessMonth(env,month,{now}),sources=sourceReferences(published);
 if(!sources.length)return {db,published,sources,reports:[],attempts:[]};
 const ids=JSON.stringify(sources.map(source=>source.run_id)),rows=await db.batch([db.prepare('SELECT run_id,source_revision,start_date,end_date,payload,checked_at FROM business_reconciliation_reports WHERE run_id IN(SELECT value FROM json_each(?))').bind(ids),db.prepare('SELECT run_id,source_revision,checked_at,status,code,next_attempt_at FROM business_reconciliation_attempts WHERE run_id IN(SELECT value FROM json_each(?))').bind(ids)]),reports=[],attempts=[];
 for(const row of rows[0]?.results??[]){const source=sources.find(source=>source.run_id===row.run_id);if(row.source_revision!==source.source_revision)continue;let report;try{if(typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>1048576)throw Error();report=projectReconciliationFrame(JSON.parse(row.payload));}catch{}if(!publishedReportMatches(report,source,published)||row.checked_at!==report.checked_at||row.start_date!==report.start_date||row.end_date!==report.end_date||report.checked_at>stamp+60)fail('BUSINESS_RECONCILIATION_STORAGE_INVALID');reports.push(report);}
 for(const row of rows[1]?.results??[]){const source=sources.find(source=>source.run_id===row.run_id);if(row.source_revision!==source.source_revision)continue;if(!integer(row.checked_at,1,stamp+60)||!integer(row.next_attempt_at,row.checked_at)||!['SUCCESS','UNAVAILABLE'].includes(row.status)||(row.status==='SUCCESS'?row.code!==null:!codes.includes(row.code)))fail('BUSINESS_RECONCILIATION_STORAGE_INVALID');attempts.push({...row});}
 reports.sort((a,b)=>sources.findIndex(row=>row.run_id===a.run_id)-sources.findIndex(row=>row.run_id===b.run_id));attempts.sort((a,b)=>sources.findIndex(row=>row.run_id===a.run_id)-sources.findIndex(row=>row.run_id===b.run_id));return {db,published,sources,reports,attempts};
}
function view(month,stamp,state){
 stamp=Math.max(stamp,...state.reports.map(row=>row.checked_at),...state.attempts.map(row=>row.checked_at));
 const unavailable=state.attempts.some(row=>row.status==='UNAVAILABLE'),complete=state.sources.length>0&&state.reports.length===state.sources.length&&state.reports.every(row=>row.status==='CHECKED');
 const value={schema:'business_reconciliation_v1',month,start_date:month+'-01',end_date:state.published?.payload.end_date??null,checked_at:stamp,status:!state.sources.length?'COLLECTING':complete?'CHECKED':state.reports.length?'PARTIAL':unavailable?'UNAVAILABLE':'RUNNING',source_revision:state.published?.publication.source_revision??null,sources:state.sources,reports:state.reports,attempts:state.attempts,pending:!state.sources.length?['PUBLICATION_REQUIRED']:[...(!complete?['RECONCILIATION_PENDING']:[]),...(unavailable?['SOURCE_UNAVAILABLE']:[])]};
 const projected=projectBusinessReconciliation(value,projectReconciliationFrame);if(!projected)fail('BUSINESS_RECONCILIATION_RESULT_INVALID');return projected;
}
export async function readBusinessReconciliation(env,input,{now=()=>Date.now()}={}){const stamp=clock(now),month=selection(input,stamp);return view(month,stamp,await snapshot(env,month,stamp,()=>stamp*1000));}

export async function runBusinessReconciliation(env,source,input,{now=()=>Date.now(),canRun=async()=>true}={}){
 const started=clock(now),month=selection(input,started);if(typeof source!=='function'||typeof canRun!=='function')fail('BUSINESS_RECONCILIATION_CONFIGURATION');
 const initial=await snapshot(env,month,started,()=>started*1000),result=(status,reads=0,repeat=false)=>({schema:'business_reconciliation_work_v1',month,status,source_reads:reads,repeat});
 if(!await canRun())return result('PAUSED');if(!initial.sources.length)return result('NO_PUBLICATION');
 let selected=initial.sources.filter(item=>{const attempt=initial.attempts.find(row=>row.run_id===item.run_id);return !attempt||attempt.next_attempt_at<=started;}).sort((a,b)=>(initial.attempts.find(row=>row.run_id===a.run_id)?.checked_at??0)-(initial.attempts.find(row=>row.run_id===b.run_id)?.checked_at??0))[0];
 if(!selected)return result('RETRY_WAIT');
 const token=crypto.randomUUID(),db=initial.db,lease=await db.prepare('INSERT INTO business_reconciliation_leases(month,lease_token,lease_until) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until WHERE business_reconciliation_leases.lease_until<=?').bind(month,token,started+90,started).run();if(lease?.meta?.changes!==1)return result('LEASED');
 let reads=0;
 try{
  if(!await canRun())return result('PAUSED');
  // Another eligible invocation may have finished between our first read and
  // this claim. Re-evaluate due work under the lease instead of duplicating it.
  const current=await snapshot(env,month,clock(now),now);
  selected=current.sources.filter(item=>{const attempt=current.attempts.find(row=>row.run_id===item.run_id);return !attempt||attempt.next_attempt_at<=clock(now);}).sort((a,b)=>(current.attempts.find(row=>row.run_id===a.run_id)?.checked_at??0)-(current.attempts.find(row=>row.run_id===b.run_id)?.checked_at??0))[0];
  if(!selected)return result(current.sources.length?'RETRY_WAIT':'NO_PUBLICATION');
  // The claim is local; only the leased scheduler may send this one bounded
  // private step. Browser observation never calls this function.
  let raw,error;try{reads++;raw=await source(env,{operation:'step',run_id:selected.run_id});}catch(value){error=value;}
  const finished=clock(now);if(!await canRun())return result('PAUSED',reads);
  const frame=projectReconciliationFrame(raw);let code=null;
  if(!frame){const diagnostic=Object.getOwnPropertyDescriptor(Object.getOwnPropertyDescriptor(raw??{},'diagnostic')?.value??{},'code')?.value??Object.getOwnPropertyDescriptor(error??{},'code')?.value;code=codes.includes(diagnostic)?diagnostic:'FINANCE_RECONCILIATION_UNAVAILABLE';}
  else if(!publishedReportMatches(frame,selected,current.published)||frame.checked_at>finished+60)code='FINANCE_RECONCILIATION_SCOPE_MISMATCH';
  const valid=code===null,stamp=valid?Math.max(finished,frame.checked_at):finished,permission=valid&&frame.returns?.permission==='DENIED',pendingCases=valid&&frame.returns?.pending_count>0&&!permission,initialDetails=pendingCases&&frame.cases.some(row=>row.checked_at===null&&row.diagnostic==='DETAILS_PENDING'),next=stamp+(permission?21600:!valid?300:initialDetails?60:pendingCases?300:900),guard='EXISTS(SELECT 1 FROM business_reconciliation_leases WHERE month=? AND lease_token=? AND lease_until>?)',args=[month,token,finished],writes=[];
  if(valid){const payload=JSON.stringify(frame);if(encoder.encode(payload).byteLength>1048576)fail('BUSINESS_RECONCILIATION_RESPONSE_LIMIT');writes.push(db.prepare('INSERT INTO business_reconciliation_reports(run_id,source_revision,start_date,end_date,payload,checked_at) SELECT ?,?,?,?,?,? WHERE '+guard+' ON CONFLICT(run_id) DO UPDATE SET source_revision=excluded.source_revision,start_date=excluded.start_date,end_date=excluded.end_date,payload=excluded.payload,checked_at=excluded.checked_at WHERE business_reconciliation_reports.source_revision=excluded.source_revision AND business_reconciliation_reports.checked_at<=excluded.checked_at').bind(selected.run_id,selected.source_revision,selected.start_date,selected.end_date,payload,frame.checked_at,...args));}
  writes.push(db.prepare('INSERT INTO business_reconciliation_attempts(run_id,source_revision,checked_at,status,code,next_attempt_at) SELECT ?,?,?,?,?,? WHERE '+guard+' ON CONFLICT(run_id) DO UPDATE SET source_revision=excluded.source_revision,checked_at=excluded.checked_at,status=excluded.status,code=excluded.code,next_attempt_at=excluded.next_attempt_at WHERE business_reconciliation_attempts.checked_at<=excluded.checked_at').bind(selected.run_id,selected.source_revision,stamp,valid?'SUCCESS':'UNAVAILABLE',code,next,...args));
  const saved=await db.batch(writes);if(saved.at(-1)?.meta?.changes!==1)return result('LEASED',reads);const otherDue=current.sources.some(item=>item.run_id!==selected.run_id&&(!current.attempts.find(row=>row.run_id===item.run_id)||current.attempts.find(row=>row.run_id===item.run_id).next_attempt_at<=finished));return result(valid?'CHECKED':'UNAVAILABLE',reads,valid&&(otherDue||initialDetails));
 }finally{await db.prepare('DELETE FROM business_reconciliation_leases WHERE month=? AND lease_token=?').bind(month,token).run();}
}
