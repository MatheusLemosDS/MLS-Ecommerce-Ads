import {FinancialSourceError,financialSourceScope,financialSourceSameScope,financialSourceTimestamp,FINANCIAL_SOURCE_IDS} from './financial-source-capabilities.mjs';

const fail=(code,status=400)=>{throw new FinancialSourceError('FINANCIAL_SOURCE_'+code,status);};
const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const token=(v,max=256)=>typeof v==='string'&&v.length<=max&&/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(v);
const integer=v=>Number.isSafeInteger(v)&&!Object.is(v,-0),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const encoder=new TextEncoder();
export async function financialSourceDigest(value){const bytes=encoder.encode(typeof value==='string'?value:JSON.stringify(value));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function financialSourceMoneyCents(value){
 if(value===null||value===undefined)return null;
 if(typeof value==='number'){if(!Number.isFinite(value)||Object.is(value,-0))fail('MONEY_INVALID');value=String(value);}
 if(typeof value!=='string'||value.length>80)fail('MONEY_INVALID');
 const m=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(value);if(!m)fail('MONEY_INVALID');
 let decimals=(m[3]||'').replace(/0+$/,'');if(decimals.length>2)fail('MONEY_PRECISION_UNSUPPORTED');
 let n=BigInt(m[2])*100n+BigInt(decimals.padEnd(2,'0'));if(m[1])n=-n;
 if(n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER)||m[1]&&n===0n)fail('MONEY_INVALID');return Number(n);
}
export const FINANCIAL_SOURCE_COMPONENTS=Object.freeze(['sales_cents','base_payout_cents','adjusted_payout_cents','adjustment_cents','commission_cents','service_fee_cents','seller_discount_cents','platform_discount_cents','buyer_shipping_cents','seller_shipping_cents','shipping_reimbursement_cents','subsidy_cents','retention_cents','refund_cents','reverse_shipping_cents','compensation_cents','payout_fee_cents']);
export const FINANCIAL_SOURCE_FACT_KINDS=Object.freeze(['ORDER_PAYOUT','RECEIVABLE_RELEASE','WALLET_CREDIT','WALLET_DEBIT','WALLET_HELD','WALLET_RELEASE','PAYOUT_REQUESTED','PAYOUT_PROCESSING','PAYOUT_COMPLETED','PAYOUT_FAILED','PAYOUT_REVERSED','REFUND_REQUEST','REFUND_SETTLED','REFUND_REVERSED','FEE','ADJUSTMENT','COMPENSATION','UNKNOWN']);
function components(value){if(value===null||value===undefined)return Object.fromEntries(FINANCIAL_SOURCE_COMPONENTS.map(k=>[k,null]));if(!plain(value)||Object.keys(value).some(k=>!FINANCIAL_SOURCE_COMPONENTS.includes(k)))fail('COMPONENTS_INVALID');return Object.fromEntries(FINANCIAL_SOURCE_COMPONENTS.map(k=>{const v=value[k]??null;if(v!==null&&!integer(v))fail('MONEY_INVALID');return [k,v];}));}
function date(value,observed_at){const result=financialSourceTimestamp(value??null,{nullable:true});if(result!==null&&result>observed_at)fail('SOURCE_DATE_IN_FUTURE');return result;}
function sourceCoverage(value){
 if(value===null||value===undefined)return {state:'UNKNOWN',complete:false,start_at:null,end_at:null,timezone_confirmed:false,evidence_ref:null};
 if(!plain(value)||!['COMPLETE','PARTIAL','UNKNOWN','UNAVAILABLE','FORBIDDEN'].includes(value.state)||typeof value.complete!=='boolean'||typeof value.timezone_confirmed!=='boolean')fail('COVERAGE_INVALID');
 const start_at=financialSourceTimestamp(value.start_at??null,{nullable:true}),end_at=financialSourceTimestamp(value.end_at??null,{nullable:true});
 if(value.complete&&(value.state!=='COMPLETE'||start_at===null||end_at===null||start_at>=end_at||!token(value.evidence_ref,128)))fail('COVERAGE_INVALID');
 return {state:value.state,complete:value.complete,start_at,end_at,timezone_confirmed:value.timezone_confirmed,evidence_ref:token(value.evidence_ref,128)?value.evidence_ref:null};
}
export async function projectFinancialSourceEvents({scope,source,records=[],coverage=null,observed_at}={}){
 const selected=financialSourceScope(scope),stamp=financialSourceTimestamp(observed_at),seen=new Set(),facts=[];
 if(!FINANCIAL_SOURCE_IDS.includes(source)||!Array.isArray(records)||records.length>1000)fail('RECORDS_INVALID');
 for(const row of records){
  if(!plain(row)||row.schema!=='financial_source_record_v1'||!financialSourceSameScope(row.scope,selected)||row.source!==source||row.currency!==selected.currency)fail('RECORD_SCOPE_INVALID',403);
  if(row.native_id!==null&&!token(row.native_id)||!token(row.evidence_ref,128)||!hash(row.evidence_hash)||row.causal_native_id!==null&&!token(row.causal_native_id)||!FINANCIAL_SOURCE_FACT_KINDS.includes(row.kind)||row.status!==null&&!token(row.status,64)||row.amount_cents!==null&&!integer(row.amount_cents)||!['OBSERVED','REVIEW'].includes(row.quality))fail('RECORD_INVALID');
  const native_id_hash=row.native_id===null?null:await financialSourceDigest(['native-reference-v1',selected,source,row.native_id]);
  const evidence_ref=await financialSourceDigest(['source-evidence-reference-v1',selected,source,row.evidence_ref]);
  const identity=native_id_hash===null?'CONSERVATIVE':'NATIVE_ID',fact_id=await financialSourceDigest(['financial-source-fact-v1',selected,source,identity,native_id_hash??evidence_ref]);
  if(seen.has(fact_id))fail('DUPLICATE_SOURCE_IDENTITY');seen.add(fact_id);
  const money=components(row.components),pending=[];
  const dates={event_at:date(row.event_at,stamp),competence_at:date(row.competence_at,stamp),settlement_at:date(row.settlement_at,stamp),source_updated_at:date(row.source_updated_at,stamp)};
  if(native_id_hash===null)pending.push('NATIVE_IDENTITY_UNCONFIRMED');if(dates.event_at===null)pending.push('SOURCE_EVENT_DATE_MISSING');if(row.amount_cents===null)pending.push('SOURCE_AMOUNT_MISSING');if(row.kind==='UNKNOWN')pending.push('MOVEMENT_CLASSIFICATION_REQUIRED');
  let adjustment_consistent=null;
  if([money.base_payout_cents,money.adjustment_cents,money.adjusted_payout_cents].every(v=>v!==null)){const n=BigInt(money.base_payout_cents)+BigInt(money.adjustment_cents);adjustment_consistent=n===BigInt(money.adjusted_payout_cents);if(!adjustment_consistent)pending.push('PAYOUT_ADJUSTMENT_MISMATCH');}
  let monetary_basis='UNCLASSIFIED';if(row.kind==='ORDER_PAYOUT'){
   if(money.adjusted_payout_cents!==null&&row.amount_cents===money.adjusted_payout_cents&&adjustment_consistent!==false)monetary_basis='NET_AFTER_ADJUSTMENT';
   else if(money.base_payout_cents!==null&&row.amount_cents===money.base_payout_cents)monetary_basis='BASE_PAYOUT';
   else pending.push('PAYOUT_BASIS_UNCONFIRMED');
  }
  const requires_review=row.quality==='REVIEW'||pending.length>0;
  facts.push({schema:'financial_source_fact_v1',scope:{...selected},source,fact_id,native_id_hash,identity,kind:row.kind,status:row.status,currency:selected.currency,amount_cents:row.amount_cents,components:money,...dates,observed_at:stamp,causal_ref:row.causal_native_id===null?null:await financialSourceDigest(['native-reference-v1',selected,row.causal_source??source,row.causal_native_id]),evidence:{reference:evidence_ref,sha256:row.evidence_hash},quality:requires_review?'REVIEW':'OBSERVED',requires_review,pending,adjustment_consistent,monetary_basis,embedded_components:monetary_basis==='NET_AFTER_ADJUSTMENT'?FINANCIAL_SOURCE_COMPONENTS.filter(k=>!['sales_cents','adjusted_payout_cents','base_payout_cents'].includes(k)&&money[k]!==null):[]});
 }
 return {schema:'financial_source_facts_v1',scope:selected,source,observed_at:stamp,coverage:sourceCoverage(coverage),facts,review_count:facts.filter(f=>f.requires_review).length};
}
function epoch(value){if(value===null||value===undefined)return null;if(!Number.isSafeInteger(value)||value<946684800||value>4102444799)fail('TIMESTAMP_INVALID');return new Date(value*1000).toISOString();}
// Only consumes the existing validated private evidence snapshot. It exposes no
// raw order/return ID, buyer field or provider payload, and never calls Shopee.
export async function financialSourceRecordsFromOrderEvidence({scope,snapshot,observed_at}={}){
 const selected=financialSourceScope(scope),stamp=financialSourceTimestamp(observed_at);
 if(!plain(snapshot)||snapshot.schema!=='financial_order_evidence_snapshot_v1'||!plain(snapshot.run)||!Array.isArray(snapshot.orders)||snapshot.orders.length>1000||!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(snapshot.run.status)||!Number.isSafeInteger(snapshot.missing_orders)||!Number.isSafeInteger(snapshot.invalid_orders))fail('ORDER_SNAPSHOT_INVALID');
 const records=[],seen=new Set();
 for(const row of snapshot.orders){
  if(!plain(row)||!hash(row.order_hash)||seen.has(row.order_hash)||!hash(row.source_hash))fail('ORDER_SNAPSHOT_INVALID');seen.add(row.order_hash);
  if(!['completed','ongoing'].includes(row.bucket))continue;
  const e=row.evidence;if(e===null||e===undefined)continue;
  if(!plain(e)||!['financial_order_evidence_v1','financial_order_evidence_v2'].includes(e.schema)||!token(e.order_sn)||await financialSourceDigest(e.order_sn)!==row.order_hash||e.currency!==selected.currency||!plain(e.amounts))fail('ORDER_SNAPSHOT_INVALID');
  const money={base_payout_cents:financialSourceMoneyCents(e.amounts.escrow_amount_raw),adjusted_payout_cents:financialSourceMoneyCents(e.amounts.escrow_amount_after_adjustment_raw),adjustment_cents:financialSourceMoneyCents(e.amounts.total_adjustment_amount_raw)};
  const created=e.schema==='financial_order_evidence_v2'?epoch(e.create_time):null;
  const event_at=epoch(row.checked_at);if(event_at===null||event_at>stamp||created!==null&&created>stamp)fail('SOURCE_DATE_IN_FUTURE');
  records.push({schema:'financial_source_record_v1',scope:{...selected},source:'ESCROW',native_id:e.order_sn,causal_native_id:null,kind:'ORDER_PAYOUT',currency:selected.currency,status:e.order_status??null,amount_cents:money.adjusted_payout_cents??money.base_payout_cents,components:money,event_at:created,competence_at:created,settlement_at:null,source_updated_at:null,evidence_ref:row.source_hash,evidence_hash:row.source_hash,quality:e.diagnostic===null&&row.payment_covered===1&&row.bucket==='completed'?'OBSERVED':'REVIEW'});
 }
 const run=snapshot.run,complete=run.status==='COMPLETE'&&snapshot.missing_orders===0&&snapshot.invalid_orders===0;
 // Calendar bounds use their declared source offset; unknown source timezone is
 // retained. Midnight UTC is not silently substituted for a local date range.
 return {schema:'financial_source_order_records_v1',scope:selected,source:'ESCROW',observed_at:stamp,records,coverage:{state:'PARTIAL',complete:false,window_complete:complete,start_date:run.start_date,end_date:run.end_date,start_at:null,end_at:null,timezone_confirmed:false,evidence_ref:hash(run.run_id)?run.run_id:null},source_run:{run_id_hash:await financialSourceDigest(['source-run-v1',selected,run.run_id]),revision:run.revision,status:run.status}};
}
