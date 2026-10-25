import {projectBusinessMonth} from './business-month.mjs';

export class BusinessMonthViewError extends Error {
 constructor(code,status=503){super(code);this.status=status;}
}

// Only publication and source identities cross this boundary. The function is
// also frozen into browser code, so it must not capture server dependencies.
export function projectBusinessMonthAuditScope(value){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const revision=item=>Number.isSafeInteger(item)&&item>=1&&item<=2147483647;
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const uuid=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
 try{
  if(!exact(value,['publication_revision','start_date','end_date','sources'])||!revision(value.publication_revision)||!day(value.start_date)||!day(value.end_date)||value.start_date<'2000-01-01'||value.start_date.slice(8)!=='01'||value.start_date.slice(0,7)!==value.end_date.slice(0,7))return null;
  const month=value.start_date.slice(0,7),last=Number(value.end_date.slice(8)),rows=value.sources;
  if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype||rows.length!==Math.ceil(last/15)||Reflect.ownKeys(rows).length!==rows.length+1)return null;
  const sources=[],seen=new Set();
  for(let index=0;index<rows.length;index++){
   const descriptor=Object.getOwnPropertyDescriptor(rows,String(index));if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;
   const source=descriptor.value,start_date=month+'-'+String(index*15+1).padStart(2,'0'),end_date=month+'-'+String(Math.min(index*15+15,last)).padStart(2,'0');
   if(!exact(source,['run_id','source_revision','start_date','end_date'])||!uuid(source.run_id)||seen.has(source.run_id)||!revision(source.source_revision)||source.start_date!==start_date||source.end_date!==end_date)return null;
   seen.add(source.run_id);sources.push({run_id:source.run_id,source_revision:source.source_revision,start_date,end_date});
  }
  return {publication_revision:value.publication_revision,start_date:value.start_date,end_date:value.end_date,sources};
 }catch{return null;}
}

// The browser supplies its frozen projectors. No server state, clock,
// database binding or source transport is captured by this function.
export function projectBusinessMonthView(value,projectMonthlyFrame,projectAuditScope){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const integer=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 try{
  const schema=Object.getOwnPropertyDescriptor(value||{},'schema')?.value,scoped=schema==='business_month_view_v2';
  if(typeof projectMonthlyFrame!=='function'||!exact(value,['schema','month','display','display_source','collection','automatic',...(scoped?['audit_scope']:[])])||!['business_month_view_v1','business_month_view_v2'].includes(schema)||typeof value.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||!['PUBLISHED','ACTIVE'].includes(value.display_source))return null;
  const display=projectMonthlyFrame(value.display),collection=value.collection,automatic=value.automatic;
  if(!display||display.month!==value.month||value.display_source==='PUBLISHED'&&display.status!=='COMPLETE'||!exact(collection,['status','start_date','end_date','checked_at','progress','coverage','source_checked_at','collection']))return null;
  let auditScope=null;
  if(scoped){
   if(typeof projectAuditScope!=='function')return null;
   if(value.display_source==='ACTIVE'){if(value.audit_scope!==null)return null;}
   else{auditScope=projectAuditScope(value.audit_scope);if(!auditScope||auditScope.start_date!==display.start_date||auditScope.end_date!==display.end_date)return null;}
  }
  if(!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(collection.status)||collection.start_date!==value.month+'-01'||!day(collection.start_date)||!day(collection.end_date)||collection.end_date.slice(0,7)!==value.month||!integer(collection.checked_at,1,9999999999)||collection.end_date<display.end_date)return null;
  const p=collection.progress,c=collection.coverage,capacityPresent=plain(p)&&Object.hasOwn(p,'order_capacity');
  const coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
  if(!exact(p,['windows_total','windows_complete','pages_read',...(capacityPresent?['order_capacity']:[])])||!exact(c,coverageKeys))return null;
  const capacity=capacityPresent?p.order_capacity:p.pages_read*5;
  if(p.windows_total!==Math.ceil(Number(collection.end_date.slice(8))/15)||!integer(p.windows_complete,0,p.windows_total)||!integer(p.pages_read,0,p.windows_total*200)||!integer(capacity,p.pages_read*5,p.pages_read*20)||(capacity-p.pages_read*5)%15!==0||!coverageKeys.every(key=>integer(c[key],0,p.windows_total*1000))||c.orders!==c.paid+c.cancelled+c.cancel_pending+c.unpaid+c.other+c.unknown||c.paid!==c.completed+c.ongoing||c.payment_covered+c.payment_missing!==c.paid||c.returns+c.returns_unknown>c.paid||c.orders>capacity||collection.status==='COMPLETE'&&p.windows_complete!==p.windows_total||collection.status!=='COMPLETE'&&p.windows_complete===p.windows_total)return null;
  const observedDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(collection.checked_at*1000));
  if(collection.end_date>observedDay)return null;
  const sources=collection.source_checked_at;
  if(sources!==null&&(!exact(sources,['finance_oldest_at','finance_latest_at','ads_at'])||!Object.values(sources).every(at=>at===null||integer(at,1,collection.checked_at))||(sources.finance_oldest_at===null)!==(sources.finance_latest_at===null)||p.windows_complete>0&&sources.finance_oldest_at===null||sources.finance_oldest_at!==null&&sources.finance_oldest_at>sources.finance_latest_at))return null;
  const wait=collection.collection;
  if(wait!==null){
   const retry=['BUSINESS_PERIOD_CHECKPOINT','BUSINESS_PERIOD_BUSY','BUSINESS_PERIOD_CONFLICT','BUSINESS_PERIOD_RATE_LIMIT','BUSINESS_PERIOD_TIMEOUT','BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE'],blocked=['BUSINESS_PERIOD_AUTH_REQUIRED','BUSINESS_PERIOD_INVALID_SOURCE','BUSINESS_PERIOD_PERMISSION_DENIED'];
   if(!exact(wait,['schema','state','code','retry_after_seconds'])||wait.schema!=='business_month_collection_v1'||!integer(wait.retry_after_seconds,0,1800)||!['READY','RETRY_WAIT','BLOCKED'].includes(wait.state)||(wait.state==='READY'?(wait.code!==null||wait.retry_after_seconds!==0):wait.state==='RETRY_WAIT'?(!retry.includes(wait.code)||wait.retry_after_seconds<1):(!blocked.includes(wait.code)||wait.retry_after_seconds!==0)))return null;
  }
  if(!exact(automatic,['enabled','applicable','status','next_run_at','last_attempt_at'])||typeof automatic.enabled!=='boolean'||typeof automatic.applicable!=='boolean'||!['IDLE','RUNNING','COMPLETE','PARTIAL','LIMIT_REACHED','ERROR','PAUSED'].includes(automatic.status)||!integer(automatic.next_run_at,0,9999999999)||automatic.last_attempt_at!==null&&!integer(automatic.last_attempt_at,1,9999999999))return null;
  if(value.display_source==='ACTIVE'&&(display.status!==collection.status||display.start_date!==collection.start_date||display.end_date!==collection.end_date||display.checked_at!==collection.checked_at||JSON.stringify(display.progress)!==JSON.stringify(p)||JSON.stringify(display.coverage)!==JSON.stringify(c)||JSON.stringify(display.source_checked_at??null)!==JSON.stringify(sources)||JSON.stringify(display.collection??null)!==JSON.stringify(wait)))return null;
  return {schema,month:value.month,display,display_source:value.display_source,collection:{status:collection.status,start_date:collection.start_date,end_date:collection.end_date,checked_at:collection.checked_at,progress:{...p},coverage:{...c},source_checked_at:sources===null?null:{...sources},collection:wait===null?null:{...wait}},automatic:{...automatic},...(scoped?{audit_scope:auditScope}:{})};
 }catch{return null;}
}

export function buildBusinessMonthView(observed,syncState,{now=()=>Date.now(),contract='business-month-view-v1'}={}){
 if(!['business-month-view-v1','business-month-view-v2'].includes(contract))throw new BusinessMonthViewError('BUSINESS_MONTH_VIEW_CONTRACT_UNSUPPORTED',409);
 let stamp;try{const clock=now();if(!Number.isSafeInteger(clock)||clock<=0)throw Error();stamp=Math.floor(clock/1000);if(stamp>9999999999)throw Error();}catch{throw new BusinessMonthViewError('BUSINESS_MONTH_VIEW_CLOCK_INVALID');}
 const active=projectBusinessMonth(observed?.active),display=projectBusinessMonth(observed?.display);
 if(!active||!display||active.month!==display.month)throw new BusinessMonthViewError('BUSINESS_MONTH_VIEW_INVALID');
 const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000)).slice(0,7);
 const scoped=contract==='business-month-view-v2';
 const result=projectBusinessMonthView({schema:scoped?'business_month_view_v2':'business_month_view_v1',month:active.month,display,display_source:observed.display_source,collection:{status:active.status,start_date:active.start_date,end_date:active.end_date,checked_at:active.checked_at,progress:active.progress,coverage:active.coverage,source_checked_at:active.source_checked_at??null,collection:active.collection??null},automatic:{enabled:syncState?.enabled,applicable:active.month===month,status:syncState?.status,next_run_at:syncState?.next_run_at,last_attempt_at:syncState?.last_attempt_at},...(scoped?{audit_scope:observed.audit_scope??null}:{})},projectBusinessMonth,projectBusinessMonthAuditScope);
 if(!result)throw new BusinessMonthViewError('BUSINESS_MONTH_VIEW_INVALID');return result;
}

// Owner requests only move an eligible App-local schedule forward. The worker
// that already owns a lease remains the sole collector; a failed provider's
// deadline and a paused policy are never reset by a browser refresh.
export async function requestBusinessMonthRefresh(env,input,{now=()=>Date.now()}={}){
 let stamp;try{const clock=now();if(!Number.isSafeInteger(clock)||clock<=0)throw Error();stamp=Math.floor(clock/1000);if(stamp>9999999999)throw Error();}catch{throw new BusinessMonthViewError('BUSINESS_MONTH_VIEW_CLOCK_INVALID');}
 const descriptor=input&&Object.getOwnPropertyDescriptor(input,'month'),keys=input&&Reflect.ownKeys(input),month=descriptor?.value;
 const current=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000)).slice(0,7);
 if(!input||![Object.prototype,null].includes(Object.getPrototypeOf(input))||keys.length!==1||keys[0]!=='month'||!descriptor||!Object.hasOwn(descriptor,'value')||month!==current)throw new BusinessMonthViewError('BUSINESS_MONTH_REFRESH_REQUEST_INVALID',400);
 const db=env?.ADMIN_DB;if(typeof db?.batch!=='function'||typeof db?.prepare!=='function')throw new BusinessMonthViewError('BUSINESS_MONTH_VIEW_CONFIGURATION');
 let row;
 try{const rows=await db.batch([
  db.prepare('UPDATE business_sync_state SET next_run_at=MIN(next_run_at,?) WHERE id=1 AND enabled=1 AND last_error IS NULL AND (lease_token IS NULL OR lease_expires_at<=?)').bind(stamp,stamp),
  db.prepare('SELECT enabled,status,next_run_at,last_error,lease_token,lease_expires_at FROM business_sync_state WHERE id=1'),
 ]);row=rows[1]?.results?.[0];}catch{throw new BusinessMonthViewError('BUSINESS_MONTH_VIEW_STORAGE_UNAVAILABLE');}
 const integer=(item,min=0,max=9999999999)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 if(!row||![0,1].includes(row.enabled)||!['IDLE','RUNNING','COMPLETE','PARTIAL','LIMIT_REACHED','ERROR','PAUSED'].includes(row.status)||!integer(row.next_run_at)||row.last_error!==null&&(typeof row.last_error!=='string'||!/^BUSINESS_SYNC_[A-Z_]{1,64}$/.test(row.last_error))||row.lease_expires_at!==null&&!integer(row.lease_expires_at,1)||(row.lease_token===null)!==(row.lease_expires_at===null)||row.lease_token!==null&&(typeof row.lease_token!=='string'||!/^[a-f0-9-]{36}$/.test(row.lease_token)))throw new BusinessMonthViewError('BUSINESS_MONTH_VIEW_STORAGE_INVALID');
 const active=row.lease_expires_at!==null&&row.lease_expires_at>stamp,status=row.enabled===0?'PAUSED':active?'RUNNING':row.last_error!==null?'RETRY_WAIT':'QUEUED';
 return {schema:'business_month_refresh_request_v1',month,status,next_run_at:row.next_run_at,lease_expires_at:active?row.lease_expires_at:null};
}
