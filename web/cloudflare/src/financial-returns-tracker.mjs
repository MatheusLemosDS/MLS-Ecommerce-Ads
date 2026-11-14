import {normalizeFinancialScope,sameFinancialScope,normalizeFinancialTimestamp,financialCanonicalJSON,financialDigest,FinancialLedgerError,validateFinancialEvent,financialEventIdentity} from './financial-event-ledger.mjs';
import {assertFinancialAccess,financialDatabase,financialClock} from './financial-event-store.mjs';
import {readFinancialAutomationState,writeFinancialAutomationState} from './financial-automation-store.mjs';
import {projectReconciliationFrame,projectReconciliationEvidenceFrame,projectReconciliationMoneyFrame} from '../../finance/src/reconciliation-frame.mjs';
import {assertFinancialSourceCollectionCapability} from '../../finance/src/financial-source-capabilities.mjs';

export const FINANCIAL_RETURNS_TRACKER_KIND='RETURN_QUEUE';
const maximum=200,encoder=new TextEncoder(),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),token=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v),int=(v,min=0,max=2147483645)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const statuses=['PENDING','UNKNOWN','REQUESTED','ACCEPTED','CANCELLED','JUDGING','REFUND_PAID','CLOSED','PROCESSING'];
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const fail=(suffix,status=400)=>{throw new FinancialLedgerError('FINANCIAL_RETURNS_'+suffix,status);};
const add=(stamp,seconds)=>new Date(Date.parse(stamp)+seconds*1000).toISOString();
const nullableStamp=v=>v===null||normalizeFinancialTimestamp(v)===v;
const clone=v=>JSON.parse(financialCanonicalJSON(v));
function empty(scope,stamp){return {schema:'financial_returns_queue_v1',scope,turn:0,checked_at:stamp,lease:null,discovery:{state:'UNKNOWN',cursor:null,last_checked_at:null,rounds:0,next_due_at:stamp,failure_count:0,last_error:null,limited:false},cases:[]};}
function queue(value,scope,stamp){
 if(value===null)return empty(scope,stamp);financialCanonicalJSON(value);
 if(!exact(value,['schema','scope','turn','checked_at','lease','discovery','cases'])||value.schema!=='financial_returns_queue_v1'||!sameFinancialScope(value.scope,scope)||!int(value.turn)||!Array.isArray(value.cases)||value.cases.length>maximum||!nullableStamp(value.checked_at)||value.checked_at===null||value.checked_at>stamp)fail('STATE_INVALID',503);
 const d=value.discovery;if(!exact(d,['state','cursor','last_checked_at','rounds','next_due_at','failure_count','last_error','limited'])||!['UNKNOWN','PARTIAL','AVAILABLE','BLOCKED','RETRY_WAIT'].includes(d.state)||d.cursor!==null&&!uuid(d.cursor)||!nullableStamp(d.last_checked_at)||!nullableStamp(d.next_due_at)||!int(d.rounds)||!int(d.failure_count)||typeof d.limited!=='boolean'||d.last_error!==null&&!token(d.last_error))fail('STATE_INVALID',503);
 if(value.lease!==null&&(!exact(value.lease,['id','expires_at'])||!uuid(value.lease.id)||value.lease.expires_at===null||!nullableStamp(value.lease.expires_at)))fail('STATE_INVALID',503);
 const seen=new Set();for(const c of value.cases){if(!exact(c,['case_id','source_origin_key','last_revision','source_checked_at','status','case_status','known_requested_cents','economic_event_id','economic_version','economic_checked_at','opened_at','last_attempt_at','next_due_at','failure_count','last_error'])||!hash(c.case_id)||seen.has(c.case_id)||!token(c.source_origin_key)||!int(c.last_revision,1)||!statuses.includes(c.case_status)||!['OPEN','RESOLVED','RETRY_WAIT'].includes(c.status)||c.known_requested_cents!==null&&!int(c.known_requested_cents,0,Number.MAX_SAFE_INTEGER)||c.economic_event_id!==null&&!hash(c.economic_event_id)||!int(c.economic_version)||!int(c.failure_count)||c.last_error!==null&&!token(c.last_error)||!['source_checked_at','opened_at','last_attempt_at','next_due_at','economic_checked_at'].every(k=>nullableStamp(c[k]))||c.source_checked_at===null||c.opened_at===null||c.source_checked_at>stamp||c.opened_at>stamp||c.economic_checked_at!==null&&c.economic_checked_at>stamp||c.status==='RESOLVED'&&(c.economic_event_id===null||c.economic_version<1||c.economic_checked_at===null||c.next_due_at!==null))fail('STATE_INVALID',503);seen.add(c.case_id);}
 return clone(value);
}
async function observation(value,scope,stamp){
 financialCanonicalJSON(value);
 const keys=['schema','scope','case_id','source_origin_key','source_revision','source_checked_at','case_status','known_requested_cents','resolution_event'];
 if(!value||Object.keys(value).sort().join(',')!==keys.sort().join(',')||value.schema!=='financial_return_case_observation_v1'||!sameFinancialScope(value.scope,scope)||!hash(value.case_id)||!token(value.source_origin_key)||!int(value.source_revision,1)||!statuses.includes(value.case_status)||value.known_requested_cents!==null&&!int(value.known_requested_cents,0,Number.MAX_SAFE_INTEGER)||!nullableStamp(value.source_checked_at)||value.source_checked_at===null||value.source_checked_at>stamp)fail('OBSERVATION_INVALID',503);
 let economic=null;
 if(value.resolution_event!==null){const e=validateFinancialEvent(value.resolution_event,{scope});if(e.quality!=='CONFIRMED'||e.source.provider!=='SHOPEE'||e.source.family!=='RETURN_ECONOMIC'||e.source.native_id!==value.case_id||!['REFUND_SETTLED','REFUND_REVERSED','RETURN_NO_ECONOMIC_LIABILITY'].includes(e.event_type)||!['CLOSED','REFUND_PAID','CANCELLED'].includes(value.case_status)||e.observed_at>stamp||e.observed_at<value.source_checked_at||e.event_id!==await financialEventIdentity(scope,e.source)||e.event_type!=='RETURN_NO_ECONOMIC_LIABILITY'&&(!e.settlement_at||!e.postings.some(p=>p.account==='SALES_RETURNS'))||e.event_type==='RETURN_NO_ECONOMIC_LIABILITY'&&e.postings.some(p=>p.amount_cents!==0))fail('ECONOMIC_EVIDENCE_INVALID',503);economic=e;}
 return {...value,resolution_event:economic};
}
async function merge(q,rows,scope,stamp){
 if(!Array.isArray(rows)||rows.length>40)fail('DISCOVERY_INVALID',503);const normalized=[];for(const row of rows)normalized.push(await observation(row,scope,stamp));
 const seen=new Set();for(const row of normalized){if(seen.has(row.case_id))fail('DISCOVERY_INVALID',503);seen.add(row.case_id);const prior=q.cases.find(c=>c.case_id===row.case_id);
  if(prior&&(row.source_checked_at<prior.source_checked_at||row.source_checked_at===prior.source_checked_at&&row.source_origin_key===prior.source_origin_key&&row.source_revision<prior.last_revision))continue;
  if(prior?.status==='RESOLVED'&&row.resolution_event===null&&row.source_checked_at<=prior.economic_checked_at)continue;
  if(!prior&&q.cases.length>=maximum)fail('QUEUE_CAPACITY',503);
  const changed=prior&&(row.case_status!==prior.case_status||row.known_requested_cents!==prior.known_requested_cents),proof=row.resolution_event,proved=proof!==null&&(prior?.economic_event_id!==proof.event_id||proof.version>=(prior?.economic_version??0)),resolved=proved||prior?.status==='RESOLVED'&&!changed;
  const next={case_id:row.case_id,source_origin_key:row.source_origin_key,last_revision:row.source_revision,source_checked_at:row.source_checked_at,status:resolved?'RESOLVED':'OPEN',case_status:row.case_status,known_requested_cents:row.known_requested_cents,economic_event_id:proved?proof.event_id:prior?.economic_event_id??null,economic_version:proved?proof.version:prior?.economic_version??0,economic_checked_at:proved?proof.observed_at:prior?.economic_checked_at??null,opened_at:prior?.opened_at??stamp,last_attempt_at:prior?.last_attempt_at??null,next_due_at:resolved?null:changed||!prior?stamp:prior.next_due_at??stamp,failure_count:0,last_error:null};
  if(prior)q.cases[q.cases.indexOf(prior)]=next;else q.cases.push(next);
 }
 q.cases.sort((a,b)=>a.case_id.localeCompare(b.case_id));
}
function view(saved,q,stamp,extra={}){
 const open=q.cases.filter(c=>c.status!=='RESOLVED'),pending=[...(open.length?['RETURNS_HISTORICAL_CASES_PENDING']:[]),...(q.discovery.state!=='AVAILABLE'?['RETURNS_CACHED_DISCOVERY_INCOMPLETE']:[]),'RETURNS_PROVIDER_DISCOVERY_UNVERIFIED'];
 if(q.discovery.last_error)pending.push(q.discovery.last_error);for(const c of open)if(c.last_error)pending.push(c.last_error);
 return {schema:'financial_returns_tracker_v1',scope:clone(q.scope),revision:saved.revision,checked_at:q.checked_at,state:open.length?'PARTIAL':q.cases.length?'READY':'UNKNOWN',counts:{known:q.cases.length,open:open.length,resolved:q.cases.length-open.length,retry_wait:open.filter(c=>c.status==='RETRY_WAIT').length,due:open.filter(c=>c.next_due_at===null||c.next_due_at<=stamp).length},discovery:Object.fromEntries(['state','cursor','last_checked_at','rounds','next_due_at'].map(k=>[k,q.discovery[k]])),cases:q.cases.map(c=>({...c})),pending:[...new Set(pending)],...extra};
}
export async function readFinancialReturnsTracker(env,{scope},options={}){const selected=normalizeFinancialScope(scope),stamp=financialClock(options),saved=await readFinancialAutomationState(env,{scope:selected,kind:FINANCIAL_RETURNS_TRACKER_KIND},options),q=queue(saved.payload,selected,stamp);return view(saved,q,stamp);}
async function save(env,scope,payload,revision,options){const digest=await financialDigest(['return-tracker-v1',scope,revision,payload]),request_id=digest.slice(0,8)+'-'+digest.slice(8,12)+'-'+digest.slice(12,16)+'-'+digest.slice(16,20)+'-'+digest.slice(20,32);return writeFinancialAutomationState(env,{scope,kind:FINANCIAL_RETURNS_TRACKER_KIND,payload,expected_revision:revision,request_id},options);}
function unpack(row,stamp){
 if(!row||typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>1048576||!int(row.checked_at,1,9999999999))fail('CACHE_INVALID',503);let raw;try{raw=JSON.parse(row.payload);}catch{fail('CACHE_INVALID',503);}
 const money=projectReconciliationMoneyFrame(raw,projectReconciliationFrame,projectReconciliationEvidenceFrame),evidence=money??projectReconciliationEvidenceFrame(raw,projectReconciliationFrame),report=evidence?.report??projectReconciliationFrame(raw);
 if(!report||row.run_id!==report.run_id||row.source_revision!==report.source_revision||row.start_date!==report.start_date||row.end_date!==report.end_date||row.checked_at!==report.checked_at||report.checked_at*1000>Date.parse(stamp))fail('CACHE_INVALID',503);return report;
}
function cachedObservation(scope,report,c){return {schema:'financial_return_case_observation_v1',scope,case_id:c.case_hash,source_origin_key:report.run_id,source_revision:report.source_revision,source_checked_at:new Date((c.checked_at??report.checked_at)*1000).toISOString(),case_status:c.status,known_requested_cents:c.requested_refund_cents,resolution_event:null};}
async function localDiscovery(env,{scope,cursor,now}){
 const db=financialDatabase(env);if(!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='business_reconciliation_reports'").first())return {schema:'financial_return_discovery_page_v1',scope,observations:[],next_cursor:null,complete:false,limited:false};
 const result=(await db.prepare('SELECT run_id,source_revision,start_date,end_date,payload,checked_at FROM business_reconciliation_reports WHERE run_id>? ORDER BY run_id LIMIT 2').bind(cursor??'').all()).results;if(!Array.isArray(result)||result.length>2)fail('CACHE_INVALID',503);
 if(!result.length)return {schema:'financial_return_discovery_page_v1',scope,observations:[],next_cursor:null,complete:true,limited:false};const r=unpack(result[0],clockStamp(now));return {schema:'financial_return_discovery_page_v1',scope,observations:r.cases.map(c=>cachedObservation(scope,r,c)),next_cursor:result.length>1?r.run_id:null,complete:result.length===1,limited:r.truncation.truncated};
}
const clockStamp=now=>normalizeFinancialTimestamp(new Date(now()).toISOString());
async function localCase(env,{scope,case_id,source_origin_key,now}){if(!uuid(source_origin_key))fail('CASE_ORIGIN_UNAVAILABLE',503);const row=await financialDatabase(env).prepare('SELECT run_id,source_revision,start_date,end_date,payload,checked_at FROM business_reconciliation_reports WHERE run_id=?').bind(source_origin_key).first(),report=unpack(row,clockStamp(now)),c=report.cases.find(v=>v.case_hash===case_id);if(!c)fail('CASE_EVIDENCE_UNAVAILABLE',503);return cachedObservation(scope,report,c);}
async function adapterAllowed(adapter,scope,source,now){if(!adapter||!token(adapter.id)||typeof adapter.read!=='function'||!['LOCAL_CACHE','PROVIDER'].includes(adapter.transport))fail('ADAPTER_INVALID',503);if(adapter.transport==='PROVIDER'){try{assertFinancialSourceCollectionCapability(adapter.capability,{scope,source,now});}catch{fail('CAPABILITY_UNCONFIRMED',409);}}return adapter;}

// A durable CAS claim serializes one discovery page OR one due historical case.
// The default adapters read only saved, minimized reports. Provider adapters
// require their own verified capability and never inherit a grant from a cache.
export async function runFinancialReturnsTracker(env,{scope,services={},assertAuthorized,now=Date.now,actor=env?.COMMERCIAL_CONTEXT?.userId??'financial-returns-tracker'}={}){
 const selected=normalizeFinancialScope(scope),options={assertAuthorized,now,actor},stamp=financialClock(options);await assertFinancialAccess(env,selected,options,'write');
 const saved=await readFinancialAutomationState(env,{scope:selected,kind:FINANCIAL_RETURNS_TRACKER_KIND},options),q=queue(saved.payload,selected,stamp);
 if(q.lease!==null&&q.lease.expires_at>stamp)return view(saved,q,stamp,{status:'BUSY',provider_reads:0});
 const due=q.cases.filter(c=>c.status!=='RESOLVED'&&(c.next_due_at===null||c.next_due_at<=stamp)).sort((a,b)=>(a.last_attempt_at??'').localeCompare(b.last_attempt_at??'')||a.opened_at.localeCompare(b.opened_at)||a.case_id.localeCompare(b.case_id)),discover=q.discovery.next_due_at===null||q.discovery.next_due_at<=stamp;
 if(!due.length&&!discover)return view(saved,q,stamp,{status:'NOT_DUE',provider_reads:0});
 const lane=discover&&(!due.length||q.turn%2===0)?'DISCOVERY':'CASE',claim={...q,lease:{id:crypto.randomUUID(),expires_at:add(stamp,90)},checked_at:stamp};let claimed;
 try{claimed=await save(env,selected,claim,saved.revision,options);}catch(e){if(e.status===409)return view(saved,q,stamp,{status:'BUSY',provider_reads:0});throw e;}
 let provider_reads=0,status='OBSERVED';const next=clone(claim);
 try{
  await assertFinancialAccess(env,selected,options,'write');
  if(lane==='DISCOVERY'){
   const adapter=await adapterAllowed(services.financialReturnsDiscoveryAdapter??{id:'CACHED_RECONCILIATION',transport:'LOCAL_CACHE',read:input=>localDiscovery(env,input)},selected,'RETURN_DISCOVERY',now);if(adapter.transport==='PROVIDER')provider_reads++;
   const page=await adapter.read({scope:selected,cursor:q.discovery.cursor,now});await assertFinancialAccess(env,selected,options,'write');
   if(page?.schema!=='financial_return_discovery_page_v1'||!sameFinancialScope(page.scope,selected)||typeof page.complete!=='boolean'||typeof page.limited!=='boolean'||page.next_cursor!==null&&!uuid(page.next_cursor)||page.complete&&page.next_cursor!==null||!page.complete&&page.next_cursor===q.discovery.cursor&&page.next_cursor!==null)fail('DISCOVERY_INVALID',503);
   const limited=page.limited||q.discovery.cursor!==null&&q.discovery.limited;await merge(next,page.observations,selected,financialClock(options));next.discovery={state:page.complete&&!limited?'AVAILABLE':'PARTIAL',cursor:page.next_cursor,last_checked_at:stamp,rounds:page.complete?Math.min(2147483645,q.discovery.rounds+1):q.discovery.rounds,next_due_at:add(stamp,page.complete?3600:60),failure_count:0,last_error:limited?'FINANCIAL_RETURNS_CACHED_CASES_TRUNCATED':null,limited};
  }else{
   const target=due[0],adapter=await adapterAllowed(services.financialReturnsCaseAdapter??{id:'CACHED_RETURN_CASE',transport:'LOCAL_CACHE',read:input=>localCase(env,input)},selected,'RETURNS',now);if(adapter.transport==='PROVIDER')provider_reads++;
   const result=await adapter.read({scope:selected,case_id:target.case_id,source_origin_key:target.source_origin_key,now});await assertFinancialAccess(env,selected,options,'write');if(result?.case_id!==target.case_id)fail('CASE_SCOPE_INVALID',403);await merge(next,[result],selected,financialClock(options));const row=next.cases.find(c=>c.case_id===target.case_id);row.last_attempt_at=stamp;if(row.status!=='RESOLVED')row.next_due_at=add(stamp,900);
  }
 }catch(e){if(e.status===403)throw e;const code=typeof e.code==='string'&&/^FINANCIAL_RETURNS_[A-Z_]+$/.test(e.code)?e.code:'FINANCIAL_RETURNS_SOURCE_UNAVAILABLE';status='RETRY_WAIT';if(lane==='DISCOVERY'){const count=Math.min(2147483645,q.discovery.failure_count+1);next.discovery={...q.discovery,state:code==='FINANCIAL_RETURNS_CAPABILITY_UNCONFIRMED'?'BLOCKED':'RETRY_WAIT',failure_count:count,last_error:code,next_due_at:add(stamp,Math.min(21600,60*2**Math.min(count,8)))};}else{const c=next.cases.find(c=>c.case_id===due[0].case_id),count=Math.min(2147483645,c.failure_count+1);Object.assign(c,{status:'RETRY_WAIT',failure_count:count,last_error:code,last_attempt_at:stamp,next_due_at:add(stamp,Math.min(21600,60*2**Math.min(count,8)))});}}
 const done=financialClock(options);next.lease=null;next.checked_at=done;next.turn=q.turn===2147483645?0:q.turn+1;queue(next,selected,done);const result=await save(env,selected,next,claimed.revision,options);await assertFinancialAccess(env,selected,options,'write');return view(result,next,done,{status,lane,provider_reads});
}
