import {FinancialSourceError,financialSourceScope,financialSourceSameScope,financialSourceTimestamp,FINANCIAL_SOURCE_IDS,assertFinancialSourceCollectionCapability} from './financial-source-capabilities.mjs';
import {projectFinancialSourceEvents} from './financial-source-events.mjs';

const fail=(code,status=400)=>{throw new FinancialSourceError('FINANCIAL_SOURCE_'+code,status);};
const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const cursor=v=>v===null||typeof v==='string'&&v.length>0&&v.length<=512&&!/[\u0000-\u0020\u007f]/.test(v);
const states=['IDLE','RUNNING','RETRY_WAIT','BLOCKED','COMPLETE','LIMIT_REACHED'];
function at(now){const n=typeof now==='function'?now():now;if(!int(n,1))fail('CLOCK_INVALID',503);return new Date(n).toISOString();}
function window(value){if(!plain(value))fail('WINDOW_INVALID');const start_at=financialSourceTimestamp(value.start_at),end_at=financialSourceTimestamp(value.end_at);if(start_at>=end_at)fail('WINDOW_INVALID');return {start_at,end_at};}
function lastComplete(value,selected){if(value===null)return null;if(!plain(value)||!financialSourceSameScope(value.scope,selected)||!int(value.pages_read,1)||!int(value.events_count)||typeof value.evidence_ref!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.evidence_ref))fail('CHECKPOINT_INVALID');return {scope:{...selected},window:window(value.window),pages_read:value.pages_read,events_count:value.events_count,checked_at:financialSourceTimestamp(value.checked_at),watermark:financialSourceTimestamp(value.watermark,{nullable:true}),evidence_ref:value.evidence_ref};}
export function createFinancialSourceCheckpoint({scope,source,window:range,now=Date.now}={}){if(!FINANCIAL_SOURCE_IDS.includes(source))fail('SOURCE_INVALID');return {schema:'financial_source_checkpoint_v1',scope:financialSourceScope(scope),source,revision:0,state:'IDLE',window:window(range),cursor:null,pages_read:0,events_count:0,failure_count:0,next_attempt_at:null,lease:null,watermark:null,last_complete:null,last_error:null,updated_at:at(now)};}
export function projectFinancialSourceCheckpoint(value,{scope,source}={}){
 if(!plain(value)||value.schema!=='financial_source_checkpoint_v1'||!financialSourceSameScope(value.scope,scope)||value.source!==source||!FINANCIAL_SOURCE_IDS.includes(source)||!int(value.revision,0,2147483645)||!states.includes(value.state)||!cursor(value.cursor)||!int(value.pages_read,0,1000000)||!int(value.events_count,0,1000000000)||!int(value.failure_count,0,1000000)||value.last_error!==null&&(typeof value.last_error!=='string'||! /^[A-Z][A-Z0-9_]{1,99}$/.test(value.last_error)))fail('CHECKPOINT_INVALID');
 const selected=financialSourceScope(scope),range=window(value.window),updated_at=financialSourceTimestamp(value.updated_at),watermark=financialSourceTimestamp(value.watermark,{nullable:true}),next_attempt_at=financialSourceTimestamp(value.next_attempt_at,{nullable:true});let lease=null;
 if(value.lease!==null){if(!plain(value.lease)||typeof value.lease.id!=='string'||! /^[a-f0-9-]{36}$/.test(value.lease.id))fail('CHECKPOINT_INVALID');lease={id:value.lease.id,expires_at:financialSourceTimestamp(value.lease.expires_at)};}
 const complete=lastComplete(value.last_complete,selected);if(value.state==='COMPLETE'&&(value.cursor!==null||complete===null||complete.window.start_at!==range.start_at||complete.window.end_at!==range.end_at))fail('CHECKPOINT_INVALID');
 return {schema:value.schema,scope:selected,source,revision:value.revision,state:value.state,window:range,cursor:value.cursor,pages_read:value.pages_read,events_count:value.events_count,failure_count:value.failure_count,next_attempt_at,lease,watermark,last_complete:complete,last_error:value.last_error,updated_at};
}
async function access(authorize,scope,action){if(typeof authorize!=='function'||await authorize(scope,action)!==true)fail('FORBIDDEN',403);}
async function persist(fn,command,{scope,source,expectedRevision,recordsRequired=false}={}){
 const result=await fn(command);if(!plain(result)||typeof result.applied!=='boolean')fail('PERSISTENCE_CONTRACT_INVALID',503);if(!result.applied)return null;
 const cp=projectFinancialSourceCheckpoint(result.checkpoint,{scope,source});if(cp.revision!==expectedRevision+1||recordsRequired&&result.records_committed!==true)fail('PERSISTENCE_CONTRACT_INVALID',503);return cp;
}
// The store must atomically CAS the checkpoint together with all source facts.
// A claim is persisted before one provider read. A lease is never an in-memory
// lock, and failure leaves the previous complete observation intact.
export async function collectFinancialSourceStep({scope,source,capability,checkpoint=null,window:range,readPage,persistCheckpoint,authorize,now=Date.now,budget={}}={}){
 const selected=financialSourceScope(scope),stamp=at(now);await access(authorize,selected,'read');
 const cp=checkpoint===null?createFinancialSourceCheckpoint({scope:selected,source,window:range,now}):projectFinancialSourceCheckpoint(checkpoint,{scope:selected,source});
 let allowed;try{allowed=assertFinancialSourceCollectionCapability(capability,{scope:selected,source,now});}catch(e){if(e?.status===409)return {schema:'financial_source_step_v1',scope:selected,source,state:'BLOCKED',code:'CAPABILITY_UNCONFIRMED',checkpoint:cp,provider_reads:0,facts:[]};throw e;}
 if(typeof readPage!=='function'||typeof persistCheckpoint!=='function')fail('PERSISTENCE_REQUIRED',503);
 const maximumPages=budget.maximum_pages??200,timeoutMs=budget.timeout_ms??15000,leaseSeconds=budget.lease_seconds??45;
 if(!int(maximumPages,1,1000)||!int(timeoutMs,100,45000)||!int(leaseSeconds,5,120))fail('BUDGET_INVALID');
 if(cp.lease!==null&&cp.lease.expires_at>stamp)return {schema:'financial_source_step_v1',scope:selected,source,state:'BUSY',code:'LEASE_HELD',checkpoint:cp,provider_reads:0,facts:[]};
 if(cp.next_attempt_at!==null&&cp.next_attempt_at>stamp)return {schema:'financial_source_step_v1',scope:selected,source,state:'RETRY_WAIT',code:cp.last_error,checkpoint:cp,provider_reads:0,facts:[]};
 if(cp.state==='BLOCKED'&&(allowed.grant.checked_at===null||allowed.grant.checked_at<=cp.updated_at))return {schema:'financial_source_step_v1',scope:selected,source,state:'BLOCKED',code:cp.last_error,checkpoint:cp,provider_reads:0,facts:[]};
 if(cp.state==='COMPLETE')return {schema:'financial_source_step_v1',scope:selected,source,state:'COMPLETE',code:null,checkpoint:cp,provider_reads:0,facts:[]};
 if(cp.pages_read>=maximumPages)return {schema:'financial_source_step_v1',scope:selected,source,state:'LIMIT_REACHED',code:'WINDOW_PARTITION_REQUIRED',checkpoint:cp,provider_reads:0,facts:[]};
 await access(authorize,selected,'write');
 const lease={id:crypto.randomUUID(),expires_at:new Date(Date.parse(stamp)+leaseSeconds*1000).toISOString()};
 const claim={...cp,state:'RUNNING',lease,updated_at:stamp,next_attempt_at:null,last_error:null,revision:cp.revision+1};
 const claimed=await persist(persistCheckpoint,{operation:'claim',scope:selected,source,expected_revision:cp.revision,lease_id:lease.id,checkpoint:claim},{scope:selected,source,expectedRevision:cp.revision});
 if(claimed===null)return {schema:'financial_source_step_v1',scope:selected,source,state:'BUSY',code:'CHECKPOINT_CONFLICT',checkpoint:cp,provider_reads:0,facts:[]};
 if(claimed.lease?.id!==lease.id||claimed.state!=='RUNNING')fail('PERSISTENCE_CONTRACT_INVALID',503);
 await access(authorize,selected,'read');
 let page,timer,errorCode=null,retryAfter=0;const controller=new AbortController();
 try{page=await Promise.race([readPage({scope:selected,source,method:allowed.method,path:allowed.path,window:{...claimed.window},cursor:claimed.cursor,limit:allowed.documentation.pagination.maximum_page_size,signal:controller.signal}),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new FinancialSourceError('FINANCIAL_SOURCE_TIMEOUT',504));},timeoutMs);})]);}
 catch(e){errorCode=e instanceof FinancialSourceError&&e.code==='FINANCIAL_SOURCE_TIMEOUT'?'TIMEOUT':'PROVIDER_UNAVAILABLE';}finally{clearTimeout(timer);}
 // Revocation prevents delivery and checkpoint/fact mutation. Its lease expires
 // naturally; another principal cannot process this tenant's work meanwhile.
 await access(authorize,selected,'read');
 if(page?.schema==='financial_source_error_v1'&&['RATE_LIMITED','TOKEN_EXPIRED','PERMISSION_DENIED','UNSUPPORTED','UNAVAILABLE'].includes(page.error)){errorCode=page.error;retryAfter=int(page.retry_after_seconds,0,3600)?page.retry_after_seconds:0;}
 let projected=null,terminal=false,nextCursor=claimed.cursor,watermark=claimed.watermark,evidenceRef=null;
 if(errorCode===null){try{
  if(!plain(page)||page.schema!=='financial_source_page_v1'||!financialSourceSameScope(page.scope,selected)||page.source!==source||typeof page.has_more!=='boolean'||typeof page.terminal!=='boolean'||!cursor(page.next_cursor)||!plain(page.coverage))fail('PAGE_INVALID');
  if(page.has_more&&(page.next_cursor===null||page.next_cursor===claimed.cursor)||!page.has_more&&page.next_cursor!==null)fail('PAGE_CURSOR_INVALID');
  const cover=page.coverage;if(cover.start_at!==claimed.window.start_at||cover.end_at!==claimed.window.end_at)fail('PAGE_WINDOW_MISMATCH');
  projected=await projectFinancialSourceEvents({scope:selected,source,records:page.records,coverage:cover,observed_at:at(now)});
  terminal=page.has_more===false&&page.terminal===true&&cover.complete===true&&cover.state==='COMPLETE'&&cover.timezone_confirmed===true&&claimed.window.end_at<=at(now);
  if(page.terminal&&page.has_more)fail('PAGE_TERMINAL_INVALID');
  if(!page.has_more&&!terminal)errorCode='TERMINAL_EVIDENCE_REQUIRED';
  nextCursor=page.has_more?page.next_cursor:terminal?null:claimed.cursor;
  watermark=financialSourceTimestamp(page.watermark??claimed.watermark,{nullable:true});if(watermark!==null&&(watermark>at(now)||claimed.watermark!==null&&watermark<claimed.watermark))fail('PAGE_WATERMARK_INVALID');
  evidenceRef=cover.evidence_ref;
 }catch{errorCode='PAGE_INVALID';projected=null;}}
 // A page without its terminal/date contract cannot advance any count or
 // delivery. Retrying that same cursor must not increment the event total.
 if(errorCode!==null){projected=null;terminal=false;nextCursor=claimed.cursor;watermark=claimed.watermark;}
 const after=at(now),failure_count=errorCode===null?0:Math.min(1000000,claimed.failure_count+1);
 const backoff=Math.min(3600,Math.max(retryAfter,15*2**Math.min(failure_count,8))),blocked=['TOKEN_EXPIRED','PERMISSION_DENIED','UNSUPPORTED'].includes(errorCode);
 const next={...claimed,revision:claimed.revision+1,state:terminal&&errorCode===null?'COMPLETE':blocked?'BLOCKED':errorCode?'RETRY_WAIT':'RUNNING',cursor:nextCursor,pages_read:claimed.pages_read+(projected!==null?1:0),events_count:claimed.events_count+(projected?.facts.length??0),failure_count,next_attempt_at:errorCode===null||blocked?null:new Date(Date.parse(after)+backoff*1000).toISOString(),lease:null,watermark,last_error:errorCode,updated_at:after};
 if(terminal&&errorCode===null)next.last_complete={scope:selected,window:{...claimed.window},pages_read:next.pages_read,events_count:next.events_count,checked_at:after,watermark,evidence_ref:evidenceRef};
 await access(authorize,selected,'write');
 const saved=await persist(persistCheckpoint,{operation:'commit',scope:selected,source,expected_revision:claimed.revision,lease_id:lease.id,checkpoint:next,facts:projected?.facts??[],coverage:projected?.coverage??null,atomic_records_required:true},{scope:selected,source,expectedRevision:claimed.revision,recordsRequired:true});
 if(saved===null)fail('CHECKPOINT_CONFLICT',409);await access(authorize,selected,'read');
 return {schema:'financial_source_step_v1',scope:selected,source,state:saved.state,code:errorCode,checkpoint:saved,provider_reads:1,facts:projected?.facts??[]};
}
export function partitionFinancialSourceWindow(value,maximumSeconds){const selected=window(value);if(!int(maximumSeconds,1,366*86400))fail('WINDOW_LIMIT_INVALID');const result=[];let start=Date.parse(selected.start_at),end=Date.parse(selected.end_at);if(Math.ceil((end-start)/(maximumSeconds*1000))>1000)fail('WINDOW_LIMIT_INVALID');while(start<end){const next=Math.min(end,start+maximumSeconds*1000);result.push({start_at:new Date(start).toISOString(),end_at:new Date(next).toISOString()});start=next;}return result;}
// Persist the returned lane and chosen item's last_attempt_at with its claim.
// Historical open cases receive at least every second available turn, even
// when current-month collection is permanently busy or partial.
export function selectFinancialSourceWork({scope,current=[],historical=[],last_lane=null,now=Date.now}={}){
 const selected=financialSourceScope(scope),stamp=at(now),eligible=rows=>{if(!Array.isArray(rows)||rows.length>10000)fail('WORK_QUEUE_INVALID');return rows.filter(r=>{if(!plain(r)||!financialSourceSameScope(r.scope,selected))fail('WORK_QUEUE_SCOPE_INVALID',403);if(typeof r.id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(r.id)||!['OPEN','DISPUTE','RETRY_WAIT','RESOLVED'].includes(r.state))fail('WORK_QUEUE_INVALID');if(r.last_attempt_at!==null)financialSourceTimestamp(r.last_attempt_at);if(r.next_attempt_at!==null)financialSourceTimestamp(r.next_attempt_at);return r.state!=='RESOLVED'&&(r.next_attempt_at===null||r.next_attempt_at<=stamp);}).sort((a,b)=>(a.last_attempt_at??'').localeCompare(b.last_attempt_at??'')||a.id.localeCompare(b.id));};
 if(![null,'CURRENT','HISTORICAL'].includes(last_lane))fail('WORK_QUEUE_INVALID');const c=eligible(current),h=eligible(historical),lane=h.length&&(last_lane!=='HISTORICAL'||!c.length)?'HISTORICAL':c.length?'CURRENT':h.length?'HISTORICAL':null;return lane===null?null:{scope:selected,lane,item:{...(lane==='HISTORICAL'?h[0]:c[0])},attempted_at:stamp};
}
