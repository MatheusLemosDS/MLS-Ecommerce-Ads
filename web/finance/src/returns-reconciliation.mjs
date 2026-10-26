import {FINANCE_PROFILE,FinanceConnectionError} from './connection-store.mjs';
import {ensureFinanceAccessToken} from './refresh-coordinator.mjs';
import {requestFinanceAuthJson} from './auth-json-transport.mjs';
import {readFinancialOrderEvidence} from './financial-order-evidence.mjs';
import {projectReconciliationRequest,projectReconciliationFrame,projectReconciliationEvidenceFrame} from './reconciliation-frame.mjs';

// Return amounts are observations of requests, never additional deductions
// from escrow and never proof of a paid refund or a bank settlement.
export const RETURNS_RECONCILIATION_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS finance_returns_reconciliation_runs(run_id TEXT PRIMARY KEY,partner_id INTEGER NOT NULL,shop_id INTEGER NOT NULL,revision INTEGER NOT NULL,permission TEXT NOT NULL,checked_at INTEGER NOT NULL,next_attempt_at INTEGER NOT NULL,last_error TEXT,lease_owner TEXT,lease_until INTEGER)`,
 `CREATE TABLE IF NOT EXISTS finance_returns_reconciliation_cases(case_hash TEXT PRIMARY KEY,partner_id INTEGER NOT NULL,shop_id INTEGER NOT NULL,order_hash TEXT NOT NULL,order_sn TEXT NOT NULL,return_sn TEXT NOT NULL,payload TEXT,payload_hash TEXT,diagnostic TEXT,failure_count INTEGER NOT NULL,next_attempt_at INTEGER NOT NULL,lease_owner TEXT,lease_until INTEGER)`,
 `CREATE TABLE IF NOT EXISTS finance_returns_reconciliation_probes(order_hash TEXT PRIMARY KEY,partner_id INTEGER NOT NULL,shop_id INTEGER NOT NULL,order_sn TEXT NOT NULL,source_hash TEXT NOT NULL,payload TEXT,payload_hash TEXT,diagnostic TEXT,failure_count INTEGER NOT NULL,next_attempt_at INTEGER NOT NULL,lease_owner TEXT,lease_until INTEGER)`,
];
const origin='https://partner.shopeemobile.com',path='/api/v2/returns/get_return_detail',paymentPath='/api/v2/payment/get_escrow_detail',encoder=new TextEncoder(),ready=new WeakSet();
const fail=(suffix,status=503)=>{throw new FinanceConnectionError('FINANCE_RECONCILIATION_'+suffix,status);};
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
const identity=[FINANCE_PROFILE.partner_id,FINANCE_PROFILE.shop_id],paid=row=>['completed','ongoing'].includes(row.bucket),review=row=>['cancel_pending','other','unknown'].includes(row.bucket);
const caseStatuses=['REQUESTED','ACCEPTED','CANCELLED','JUDGING','REFUND_PAID','CLOSED','PROCESSING'];
const diagnostics=[null,'DETAILS_PENDING','PERMISSION_DENIED','RATE_LIMIT','TIMEOUT','UNAVAILABLE','INVALID_RESPONSE','UNKNOWN_STATUS','CURRENCY_MISMATCH'];
const serial=value=>typeof value==='string'&&value.length>0&&value.length<=128&&!/[^\x21-\x7e]|,/.test(value);
function rawCents(value){
 if(typeof value!=='string'||value.length>40)return null;const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value);if(!match)return null;
 let cents=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));if(match[1])cents=-cents;return cents;
}
const safe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
function providerCents(value){
 if(typeof value!=='number'||!Number.isFinite(value)||Object.is(value,-0)||value<0||value>1000000000000)return null;
 // JSON numbers must already have exact cents. Binary artefacts, scientific
 // sub-cent notation and negative refunds are rejected rather than rounded.
 const parsed=rawCents(String(value));return parsed===null?null:safe(parsed);
}
const storedHash=(row,payload)=>hash(JSON.stringify({partner_id:row.partner_id,shop_id:row.shop_id,case_hash:row.case_hash,order_hash:row.order_hash,order_sn:row.order_sn,return_sn:row.return_sn,payload}));
function envelope(value){
 if(!plain(value)||typeof value.error!=='string')fail('INVALID_RESPONSE',502);
 for(const item of [value,plain(value.response)?value.response:{}])for(const key of ['partner_id','shop_id'])if(Object.hasOwn(item,key)&&item[key]!==FINANCE_PROFILE[key])fail('INVALID_RESPONSE',502);
 if(value.error!=='')fail(['error_perm','error_api_permission','error_auth','error_sign','error_partner_id','error_ip'].includes(value.error)?'PERMISSION_DENIED':['error_rate_limit','error_limit'].includes(value.error)?'RATE_LIMIT':'UNAVAILABLE',502);
 if(!plain(value.response))fail('INVALID_RESPONSE',502);return value.response;
}
function classifyError(error){
 const code=error instanceof FinanceConnectionError?error.code:'';
 if(code==='FINANCE_RECONCILIATION_PERMISSION_DENIED'||error?.upstream_status===403&&['JSON_PERMISSION_REJECTED','JSON_AUTHORIZATION_REJECTED','JSON_SIGNATURE_REJECTED','JSON_PARTNER_REJECTED','JSON_IP_REJECTED'].includes(error?.upstream_diagnostic))return 'PERMISSION_DENIED';
 if(code==='FINANCE_RECONCILIATION_RATE_LIMIT'||error?.upstream_status===429)return 'RATE_LIMIT';
 if(code.endsWith('_TIMEOUT')||[408,504].includes(error?.upstream_status))return 'TIMEOUT';
 if(code==='FINANCE_RECONCILIATION_CURRENCY_MISMATCH')return 'CURRENCY_MISMATCH';
 if(['FINANCE_RECONCILIATION_INVALID_RESPONSE','FINANCE_RECONCILIATION_UPSTREAM_INVALID_JSON','FINANCE_RECONCILIATION_UPSTREAM_CONTENT_TYPE','FINANCE_RECONCILIATION_UPSTREAM_BODY_TOO_LARGE'].includes(code))return 'INVALID_RESPONSE';
 return 'UNAVAILABLE';
}
const reviewCandidates=source=>source.orders.filter(row=>review(row)&&row.evidence?.order_status==='TO_RETURN'&&row.evidence.return_order_sn_list===null);
const effectiveReferences=(row,probes)=>row.evidence?.return_order_sn_list??(row.evidence?.order_status==='TO_RETURN'?probes.get(row.order_hash)?.observation?.return_order_sn_list:null)??null;
// A probe is reusable across source runs only for this exact private order and
// profile. source_hash records its requesting cohort; its checked_at never
// replaces the immutable financial cohort's observation time or amounts.
const probeHash=(row,payload)=>hash(JSON.stringify({partner_id:row.partner_id,shop_id:row.shop_id,order_hash:row.order_hash,order_sn:row.order_sn,payload}));
async function readProbes(db,candidates,stamp){
 const values=await db.prepare('SELECT * FROM finance_returns_reconciliation_probes WHERE order_hash IN(SELECT value FROM json_each(?))').bind(JSON.stringify(candidates.map(row=>row.order_hash))).all(),map=new Map(),expected=new Map(candidates.map(row=>[row.order_hash,row]));
 for(const row of values?.results??[]){const source=expected.get(row.order_hash);
  if(!source||row.partner_id!==identity[0]||row.shop_id!==identity[1]||row.order_sn!==source.evidence.order_sn||!integer(row.failure_count,0,1000000)||!integer(row.next_attempt_at,0,9999999999)||!diagnostics.includes(row.diagnostic)||(row.lease_owner===null)!==(row.lease_until===null))fail('STORAGE_INVALID');
  let observation=null;if(row.payload!==null){try{observation=JSON.parse(row.payload);}catch{fail('STORAGE_INVALID');}
   const refs=observation?.return_order_sn_list;
   if(!exact(observation,['return_order_sn_list','checked_at'])||!Array.isArray(refs)||refs.length>100||!refs.every(serial)||new Set(refs).size!==refs.length||!integer(observation.checked_at,1,stamp+60)||await probeHash(row,observation)!==row.payload_hash)fail('STORAGE_INVALID');
  }else if(row.payload_hash!==null)fail('STORAGE_INVALID');
  map.set(row.order_hash,{row,observation});
 }
 return map;
}
async function references(source,probes){
 const entries=[],seen=new Map();let total=0,conflict=false;
 for(const row of source.orders){const evidence=row.evidence,returns=effectiveReferences(row,probes);if(!evidence||!Array.isArray(returns))continue;
  for(const serial of returns){const old=seen.get(serial);if(old){if(old!==row.order_hash)conflict=true;continue;}seen.set(serial,row.order_hash);total++;
   // Bounded source work remains explicitly partial above this queue limit.
   if(entries.length<2000)entries.push({order_hash:row.order_hash,order_sn:evidence.order_sn,return_sn:serial});
  }
 }
 await Promise.all(entries.map(async row=>{row.case_hash=await hash(row.return_sn);}));return {entries,total,conflict};
}
async function rows(db,runId,refs,stamp){
 const result=await db.batch([db.prepare('SELECT * FROM finance_returns_reconciliation_runs WHERE run_id=? AND partner_id=? AND shop_id=?').bind(runId,...identity),db.prepare('SELECT * FROM finance_returns_reconciliation_cases WHERE case_hash IN(SELECT value FROM json_each(?))').bind(JSON.stringify(refs.entries.map(row=>row.case_hash)))]);
 const state=result[0]?.results?.[0]??null,map=new Map(),referencesByHash=new Map(refs.entries.map(row=>[row.case_hash,row]));
 if(state&&(!integer(state.revision,1)||!['UNKNOWN','AVAILABLE','DENIED'].includes(state.permission)||!integer(state.checked_at,0,stamp+60)||!integer(state.next_attempt_at,0,9999999999)||!diagnostics.includes(state.last_error)||(state.lease_owner===null)!==(state.lease_until===null)))fail('STORAGE_INVALID');
 for(const row of result[1]?.results??[]){
  const reference=referencesByHash.get(row.case_hash);
  if(!reference||row.partner_id!==identity[0]||row.shop_id!==identity[1]||row.order_hash!==reference.order_hash||row.order_sn!==reference.order_sn||row.return_sn!==reference.return_sn||!integer(row.failure_count,0,1000000)||!integer(row.next_attempt_at,0,9999999999)||!diagnostics.includes(row.diagnostic)||(row.lease_owner===null)!==(row.lease_until===null))fail('STORAGE_INVALID');
  let observation=null;if(row.payload!==null){try{observation=JSON.parse(row.payload);}catch{fail('STORAGE_INVALID');}
   if(!exact(observation,['status','requested_refund_cents','checked_at','diagnostic'])||!caseStatuses.includes(observation.status)&&observation.status!=='UNKNOWN'||observation.requested_refund_cents!==null&&!integer(observation.requested_refund_cents)||!integer(observation.checked_at,1,stamp+60)||!(observation.diagnostic===null||observation.status==='UNKNOWN'&&observation.diagnostic==='UNKNOWN_STATUS')||await storedHash(row,observation)!==row.payload_hash)fail('STORAGE_INVALID');
  }else if(row.payload_hash!==null)fail('STORAGE_INVALID');
  map.set(row.case_hash,{row,observation});
 }
 return {state,map};
}
function dueCases(refs,snapshot,stamp){
 return refs.entries.filter(row=>{const item=snapshot.map.get(row.case_hash);return (!item?.observation||stamp-item.observation.checked_at>=300)&&(!item?.row.next_attempt_at||item.row.next_attempt_at<=stamp)&&(!item?.row.lease_until||item.row.lease_until<=stamp);}).sort((a,b)=>{
  const left=snapshot.map.get(a.case_hash),right=snapshot.map.get(b.case_hash),first=left?.observation,last=right?.observation;
  if(Boolean(first)!==Boolean(last))return first?1:-1;
  return first?first.checked_at-last.checked_at:(left?.row.failure_count??0)-(right?.row.failure_count??0);
 }).slice(0,2);
}
function reviewEvidence(source,refs,snapshot,stamp,probes){
 const selected=source.orders.filter(review),summary={orders:selected.length,in_cancel:0,to_return:0,other:0,unknown:0},orders=[];
 for(const row of selected){
  const observed=row.evidence?.order_status,status=observed==='TO_RETURN'?'TO_RETURN':observed==='IN_CANCEL'?'IN_CANCEL':!observed||row.bucket==='unknown'?'UNKNOWN_STATUS':'OTHER_STATUS';
  summary[{TO_RETURN:'to_return',IN_CANCEL:'in_cancel',UNKNOWN_STATUS:'unknown',OTHER_STATUS:'other'}[status]]++;
  if(orders.length>=40)continue;
  const probe=status==='TO_RETURN'?probes.get(row.order_hash):null,list=effectiveReferences(row,probes),known=Array.isArray(list),linked=refs.entries.filter(reference=>reference.order_hash===row.order_hash),checked=linked.filter(reference=>snapshot.map.get(reference.case_hash)?.observation).length;
  const diagnostic=probe?.row.diagnostic??null,next=probe?.row.next_attempt_at>0?probe.row.next_attempt_at:null;
  orders.push({order_hash:row.order_hash,status,source_checked_at:row.checked_at,reference_state:known?(list.length?'AVAILABLE':'KNOWN_EMPTY'):status!=='TO_RETURN'?'NOT_APPLICABLE':diagnostic!==null&&diagnostic!=='DETAILS_PENDING'&&next>stamp?'RETRY_WAIT':'PENDING',reference_count:known?list.length:null,references_checked_at:known?(row.evidence?.return_order_sn_list!==null?row.checked_at:probe?.observation?.checked_at??null):null,reference_diagnostic:status==='TO_RETURN'?diagnostic:null,next_attempt_at:status==='TO_RETURN'?next:null,checked_cases:known?checked:null,pending_cases:known?list.length-checked:null});
 }
 return {schema:'finance_review_orders_v1',summary,orders,truncation:{truncated:selected.length>orders.length,orders_total:selected.length,orders_included:orders.length},basis:'REVIEW_ORDERS_OUTSIDE_PAID_COHORT'};
}
function report(source,refs,snapshot,stamp,probes,includeReview=false){
 const orders=source.orders,coverage={orders:orders.length,evidence_orders:orders.filter(row=>row.evidence!==null).length,missing_evidence_orders:orders.filter(row=>row.evidence===null).length,paid_orders:orders.filter(paid).length,review_orders:orders.filter(review).length,return_orders:orders.filter(row=>paid(row)&&row.returns_seen===1).length,return_unknown_orders:orders.filter(row=>paid(row)&&row.returns_seen===null).length};
 const adjustments={reported_orders:0,missing_orders:0,conflicting_orders:0,known_adjustment_cents:0,base_repass_cents:null,after_adjustment_repass_cents:null};let base=0n,baseKnown=true,delta=0n;
 for(const row of orders.filter(paid)){
  const value=rawCents(row.escrow_raw);if(row.payment_covered!==1||value===null)baseKnown=false;else base+=value;
  const evidence=row.evidence,amounts=evidence?.amounts;
  if(evidence?.diagnostic==='INVALID'||evidence?.diagnostic==='ADJUSTMENT_MISMATCH'||evidence?.currency!==undefined&&evidence.currency!==null&&evidence.currency!=='BRL'){adjustments.conflicting_orders++;continue;}
  const before=rawCents(amounts?.escrow_amount_raw),after=rawCents(amounts?.escrow_amount_after_adjustment_raw),difference=rawCents(amounts?.total_adjustment_amount_raw);
  if(before===null||after===null||difference===null||evidence?.currency!=='BRL'){adjustments.missing_orders++;continue;}
  if(value!==before||after-before!==difference){adjustments.conflicting_orders++;continue;}adjustments.reported_orders++;delta+=difference;
 }
 adjustments.known_adjustment_cents=safe(delta);adjustments.base_repass_cents=baseKnown?safe(base):null;
 if(adjustments.known_adjustment_cents===null)fail('ARITHMETIC_UNSAFE');
 if(adjustments.missing_orders===0&&adjustments.conflicting_orders===0&&adjustments.base_repass_cents!==null)adjustments.after_adjustment_repass_cents=safe(base+delta);
 if(baseKnown&&adjustments.base_repass_cents===null||adjustments.missing_orders===0&&adjustments.conflicting_orders===0&&baseKnown&&adjustments.after_adjustment_repass_cents===null)fail('ARITHMETIC_UNSAFE');
 const cases=[],times=[];let checked=0,requested=0n,complete=refs.total<=refs.entries.length,unknown=false;
 for(const reference of refs.entries){const stored=snapshot.map.get(reference.case_hash),value=stored?.observation;
  if(value){checked++;times.push(value.checked_at);if(value.requested_refund_cents===null)complete=false;else requested+=BigInt(value.requested_refund_cents);if(value.diagnostic==='UNKNOWN_STATUS')unknown=true;}
  else complete=false;
  if(cases.length<40)cases.push({case_hash:reference.case_hash,order_hash:reference.order_hash,status:value?.status??'PENDING',requested_refund_cents:value?.requested_refund_cents??null,checked_at:value?.checked_at??null,diagnostic:value?value.diagnostic:stored?.row.diagnostic??'DETAILS_PENDING'});
 }
 const caseFailures=[...snapshot.map.values()].filter(item=>item.row.diagnostic!==null&&item.row.diagnostic!=='DETAILS_PENDING');
 const permission=snapshot.state?.permission==='DENIED'||caseFailures.some(item=>item.row.diagnostic==='PERMISSION_DENIED')?'DENIED':snapshot.state?.permission==='AVAILABLE'||checked>0?'AVAILABLE':'UNKNOWN',pending=['SETTLEMENT_NOT_RECONCILED'];
 if(source.run.status!=='COMPLETE')pending.unshift('SOURCE_COLLECTING');
 if(coverage.missing_evidence_orders||source.invalid_orders)pending.push('ORDER_EVIDENCE_MISSING');
 if(adjustments.missing_orders)pending.push('ADJUSTMENT_FIELDS_UNAVAILABLE');if(adjustments.conflicting_orders)pending.push('ADJUSTMENT_CONFLICT');
 if(coverage.return_unknown_orders>0||refs.total<coverage.return_orders||orders.some(row=>(paid(row)||review(row)&&row.evidence?.order_status==='TO_RETURN')&&effectiveReferences(row,probes)===null)||refs.conflict)pending.push('RETURN_REFERENCES_MISSING');
 if(checked<refs.total||!complete||(snapshot.state?.last_error||caseFailures.length>0)&&permission!=='DENIED')pending.push('RETURN_DETAILS_PENDING');
 if(permission==='DENIED')pending.push('RETURN_PERMISSION_REQUIRED');if(refs.total)pending.push('RETURN_VALUES_UNVERIFIED');if(unknown)pending.push('RETURN_STATUS_UNRECOGNIZED');
 const blocked=permission==='DENIED',status=blocked?'BLOCKED':source.run.status!=='COMPLETE'?'COLLECTING':pending.some(code=>!['SETTLEMENT_NOT_RECONCILED','RETURN_VALUES_UNVERIFIED'].includes(code))?'PARTIAL':'CHECKED';
 const frame={schema:'finance_reconciliation_v1',run_id:source.run.run_id,source_revision:source.run.revision,start_date:source.run.start_date,end_date:source.run.end_date,checked_at:stamp,status,source_checked_at:{finance_oldest_at:source.run.source_checked_at.oldest_at,finance_latest_at:source.run.source_checked_at.latest_at,returns_oldest_at:times.length?Math.min(...times):null,returns_latest_at:times.length?Math.max(...times):null},coverage,adjustments,returns:{reference_count:refs.total,checked_count:checked,pending_count:refs.total-checked,known_requested_refund_cents:safe(requested),requested_amount_complete:complete&&checked===refs.total,permission},cases,truncation:{truncated:refs.total>cases.length,cases_total:refs.total,cases_included:cases.length},pending,basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};
 const projected=projectReconciliationFrame(frame);if(!projected)fail('RESULT_INVALID');
 // Contradictory reference ownership has no safe per-order association. Keep
 // its existing partial report instead of guessing or failing the whole read.
 if(!includeReview||refs.conflict)return projected;
 const evidence=projectReconciliationEvidenceFrame({schema:'finance_reconciliation_v2',report:projected,review:reviewEvidence(source,refs,snapshot,stamp,probes)},projectReconciliationFrame);if(!evidence)fail('RESULT_INVALID');return evidence;
}

export async function runFinanceReturnsReconciliation(env,options={}){
 if(!plain(options)||Reflect.ownKeys(options).some(key=>!['operation','run_id','fetchImpl','now','timeoutMs','includeReview'].includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(options,key)||{},'value'))||Object.hasOwn(options,'includeReview')&&typeof options.includeReview!=='boolean')fail('REQUEST_INVALID',400);
 const selection=projectReconciliationRequest({operation:options.operation,run_id:options.run_id});if(!selection)fail('REQUEST_INVALID',400);
 const {fetchImpl,now=()=>Date.now(),timeoutMs=5000,includeReview=false}=options,epoch=()=>{let value;try{value=now();}catch{fail('CLOCK_INVALID');}if(!integer(value,1,9999999999999))fail('CLOCK_INVALID');return Math.floor(value/1000);};
 const stamp=epoch(),db=env?.FINANCE_DB;if(env?.FINANCE_CONNECTION_ENABLED!=='true'||typeof db?.batch!=='function'||typeof db?.prepare!=='function')fail('CONFIGURATION');
 if(!ready.has(db)){await db.batch(RETURNS_RECONCILIATION_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}
 const source=await readFinancialOrderEvidence(env,{run_id:selection.run_id},{now}),candidates=reviewCandidates(source);
 let probes=await readProbes(db,candidates,stamp),refs=await references(source,probes);
 let snapshot=await rows(db,selection.run_id,refs,stamp);
 if(selection.operation==='read'||refs.conflict||!refs.entries.length&&!candidates.length)return report(source,refs,snapshot,stamp,probes,includeReview);
 if(typeof fetchImpl!=='function'||!integer(timeoutMs,5,5000))fail('CONFIGURATION');
 if(snapshot.state?.next_attempt_at>stamp||snapshot.state?.lease_until>stamp)return report(source,refs,snapshot,stamp,probes,includeReview);
 const probeDue=candidates.filter(row=>{const item=probes.get(row.order_hash);return (!item?.observation||stamp-item.observation.checked_at>=300)&&(!item?.row.next_attempt_at||item.row.next_attempt_at<=stamp)&&(!item?.row.lease_until||item.row.lease_until<=stamp);}).sort((a,b)=>{
  const left=probes.get(a.order_hash),right=probes.get(b.order_hash),first=left?.observation,last=right?.observation;
  if(Boolean(first)!==Boolean(last))return first?1:-1;
  return first?first.checked_at-last.checked_at:(left?.row.failure_count??0)-(right?.row.failure_count??0);
 })[0];
 if(!dueCases(refs,snapshot,stamp).length&&!probeDue)return report(source,refs,snapshot,stamp,probes,includeReview);
 const owner=crypto.randomUUID(),leaseUntil=stamp+45;
 await db.batch([db.prepare('INSERT OR IGNORE INTO finance_returns_reconciliation_runs(run_id,partner_id,shop_id,revision,permission,checked_at,next_attempt_at,last_error,lease_owner,lease_until) SELECT ?,?,?,1,\'UNKNOWN\',0,0,NULL,NULL,NULL WHERE EXISTS(SELECT 1 FROM finance_business_period_runs WHERE run_id=? AND partner_id=? AND shop_id=?)').bind(selection.run_id,...identity,selection.run_id,...identity)]);
 const lease=await db.prepare('UPDATE finance_returns_reconciliation_runs SET lease_owner=?,lease_until=? WHERE run_id=? AND partner_id=? AND shop_id=? AND next_attempt_at<=? AND (lease_owner IS NULL OR lease_until<=?)').bind(owner,leaseUntil,selection.run_id,...identity,stamp,stamp).run();
 if(lease?.meta?.changes!==1)return report(source,refs,await rows(db,selection.run_id,refs,epoch()),epoch(),probes,includeReview);
 let permission=snapshot.state?.permission??'UNKNOWN',lastError=null,nextAttempt=stamp;
 try{
  const partnerKey=env.SHOPEE_FINANCE_PARTNER_KEY;if(typeof partnerKey!=='string'||!partnerKey.length||partnerKey.length>4096||/[\u0000-\u001f\u007f]/.test(partnerKey))fail('SIGNING_CONFIGURATION');
  const bytes=encoder.encode(partnerKey);let key;try{key=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);}finally{bytes.fill(0);}
  let sourceCalls=0;const boundedFetch=async request=>{if(sourceCalls>=2)fail('READ_BUDGET');sourceCalls++;return fetchImpl(request);};
  const tokens=await ensureFinanceAccessToken(env,{fetchImpl:boundedFetch,now,timeoutMs});
  const get=async(target,query)=>{
   const timestamp=epoch();if(tokens.expires_at<=timestamp)fail('AUTHORIZATION_EXPIRED',409);
   return requestFinanceAuthJson({input:{timestamp},options:{fetchImpl:boundedFetch,now,timeoutMs},prefix:'FINANCE_RECONCILIATION',maximumBodyBytes:1048576,buildRequest:async()=>{
    const base=String(identity[0])+target+timestamp+tokens.access_token+identity[1],signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(base))),byte=>byte.toString(16).padStart(2,'0')).join('');
    const url=new URL(target,origin);for(const [name,value] of Object.entries({partner_id:identity[0],timestamp,access_token:tokens.access_token,shop_id:identity[1],sign:signature,...query}))url.searchParams.set(name,String(value));
    return new Request(url,{method:'GET',redirect:'manual',headers:{Accept:'application/json'}});
   },normalizeResponse:envelope});
  };
  // TO_RETURN is deliberately outside the paid bucket. Resolve its references
  // through a separate audited read, without rewriting the original cohort.
  if(probeDue&&sourceCalls<2){
   const start=epoch(),reference={...probeDue,order_sn:probeDue.evidence.order_sn};
   await db.batch([db.prepare('INSERT OR IGNORE INTO finance_returns_reconciliation_probes(order_hash,partner_id,shop_id,order_sn,source_hash,payload,payload_hash,diagnostic,failure_count,next_attempt_at,lease_owner,lease_until) VALUES(?,?,?,?,?,NULL,NULL,\'DETAILS_PENDING\',0,0,NULL,NULL)').bind(reference.order_hash,...identity,reference.order_sn,reference.source_hash)]);
   const claimed=await db.prepare('UPDATE finance_returns_reconciliation_probes SET lease_owner=?,lease_until=?,source_hash=? WHERE order_hash=? AND partner_id=? AND shop_id=? AND order_sn=? AND next_attempt_at<=? AND (lease_owner IS NULL OR lease_until<=?) AND EXISTS(SELECT 1 FROM finance_returns_reconciliation_runs WHERE run_id=? AND lease_owner=? AND lease_until>?)').bind(owner,leaseUntil,reference.source_hash,reference.order_hash,...identity,reference.order_sn,start,start,selection.run_id,owner,start).run();
   if(claimed?.meta?.changes===1){
    try{
     const response=await get(paymentPath,{order_sn:reference.order_sn}),returns=response.return_order_sn_list;
     if(response.order_sn!==reference.order_sn||!Array.isArray(returns)||returns.length>100||!returns.every(serial)||new Set(returns).size!==returns.length)fail('INVALID_RESPONSE',502);
     for(const item of [response,...(plain(response.order_income)?[response.order_income]:[])]){
      for(const field of ['partner_id','shop_id','order_sn'])if(Object.hasOwn(item,field)&&item[field]!==(['partner_id','shop_id'].includes(field)?FINANCE_PROFILE[field]:reference.order_sn))fail('INVALID_RESPONSE',502);
      if(Object.hasOwn(item,'currency')&&item.currency!=='BRL')fail('CURRENCY_MISMATCH',502);
     }
     const checkedAt=epoch(),observation={return_order_sn_list:[...returns],checked_at:checkedAt},bound={...reference,partner_id:identity[0],shop_id:identity[1]},digest=await probeHash(bound,observation);
     await db.prepare('UPDATE finance_returns_reconciliation_probes SET payload=?,payload_hash=?,diagnostic=NULL,failure_count=0,next_attempt_at=?,lease_owner=NULL,lease_until=NULL WHERE order_hash=? AND lease_owner=? AND lease_until>?').bind(JSON.stringify(observation),digest,checkedAt+300,reference.order_hash,owner,checkedAt).run();
    }catch(error){
     const failure=classifyError(error),diagnostic=failure==='PERMISSION_DENIED'?'UNAVAILABLE':failure,finished=epoch(),count=Math.min((probes.get(reference.order_hash)?.row.failure_count??0)+1,1000000),delay=diagnostic==='RATE_LIMIT'?60:[300,600,1200,1800][Math.min(count-1,3)];
     await db.prepare('UPDATE finance_returns_reconciliation_probes SET diagnostic=?,failure_count=?,next_attempt_at=?,lease_owner=NULL,lease_until=NULL WHERE order_hash=? AND lease_owner=?').bind(diagnostic,count,finished+delay,reference.order_hash,owner).run();lastError=diagnostic;nextAttempt=finished+delay;
    }
   }
   probes=await readProbes(db,candidates,epoch());refs=await references(source,probes);snapshot=await rows(db,selection.run_id,refs,epoch());
  }
  for(const reference of refs.conflict?[]:dueCases(refs,snapshot,epoch())){
   const start=epoch();if(start>=leaseUntil-5||sourceCalls>=2)break;
   await db.batch([db.prepare('INSERT OR IGNORE INTO finance_returns_reconciliation_cases(case_hash,partner_id,shop_id,order_hash,order_sn,return_sn,payload,payload_hash,diagnostic,failure_count,next_attempt_at,lease_owner,lease_until) VALUES(?,?,?,?,?,?,NULL,NULL,\'DETAILS_PENDING\',0,0,NULL,NULL)').bind(reference.case_hash,...identity,reference.order_hash,reference.order_sn,reference.return_sn)]);
   const claimed=await db.prepare('UPDATE finance_returns_reconciliation_cases SET lease_owner=?,lease_until=? WHERE case_hash=? AND partner_id=? AND shop_id=? AND order_hash=? AND order_sn=? AND return_sn=? AND next_attempt_at<=? AND (lease_owner IS NULL OR lease_until<=?) AND EXISTS(SELECT 1 FROM finance_returns_reconciliation_runs WHERE run_id=? AND lease_owner=? AND lease_until>?)').bind(owner,leaseUntil,reference.case_hash,...identity,reference.order_hash,reference.order_sn,reference.return_sn,start,start,selection.run_id,owner,start).run();
   if(claimed?.meta?.changes!==1)continue;
   try{
    const response=await get(path,{return_sn:reference.return_sn});
    if(response.return_sn!==reference.return_sn||response.order_sn!==reference.order_sn||typeof response.status!=='string'||!/^[A-Z][A-Z0-9_]{0,63}$/.test(response.status))fail('INVALID_RESPONSE',502);
    if(response.currency!=='BRL')fail('CURRENCY_MISMATCH',502);
    const amount=Object.hasOwn(response,'refund_amount')&&response.refund_amount!==null?providerCents(response.refund_amount):null;
    if(Object.hasOwn(response,'refund_amount')&&response.refund_amount!==null&&amount===null)fail('INVALID_RESPONSE',502);
    const checkedAt=epoch(),observation={status:caseStatuses.includes(response.status)?response.status:'UNKNOWN',requested_refund_cents:amount,checked_at:checkedAt,diagnostic:caseStatuses.includes(response.status)?null:'UNKNOWN_STATUS'},bound={...reference,partner_id:identity[0],shop_id:identity[1]};
    const digest=await storedHash(bound,observation);
    const written=await db.prepare('UPDATE finance_returns_reconciliation_cases SET payload=?,payload_hash=?,diagnostic=NULL,failure_count=0,next_attempt_at=?,lease_owner=NULL,lease_until=NULL WHERE case_hash=? AND lease_owner=? AND lease_until>?').bind(JSON.stringify(observation),digest,checkedAt+300,reference.case_hash,owner,checkedAt).run();
    if(written?.meta?.changes===1)permission='AVAILABLE';
   }catch(error){
    const diagnostic=classifyError(error),finished=epoch(),prior=snapshot.map.get(reference.case_hash)?.row.failure_count??0,count=Math.min(prior+1,1000000),delay=diagnostic==='PERMISSION_DENIED'?3600:diagnostic==='RATE_LIMIT'?60:[300,600,1200,1800][Math.min(count-1,3)];
    await db.prepare('UPDATE finance_returns_reconciliation_cases SET diagnostic=?,failure_count=?,next_attempt_at=?,lease_owner=NULL,lease_until=NULL WHERE case_hash=? AND lease_owner=?').bind(diagnostic,count,finished+delay,reference.case_hash,owner).run();
    lastError=diagnostic;nextAttempt=finished+delay;if(diagnostic==='PERMISSION_DENIED'){permission='DENIED';break;}if(!['INVALID_RESPONSE','CURRENCY_MISMATCH'].includes(diagnostic))break;
   }
  }
 }catch(error){lastError=classifyError(error);nextAttempt=epoch()+300;}
 finally{
  const finished=epoch();await db.prepare('UPDATE finance_returns_reconciliation_runs SET revision=revision+1,permission=?,checked_at=?,next_attempt_at=?,last_error=?,lease_owner=NULL,lease_until=NULL WHERE run_id=? AND lease_owner=?').bind(permission,finished,nextAttempt,lastError,selection.run_id,owner).run();
 }
 snapshot=await rows(db,selection.run_id,refs,epoch());return report(source,refs,snapshot,epoch(),probes,includeReview);
}
