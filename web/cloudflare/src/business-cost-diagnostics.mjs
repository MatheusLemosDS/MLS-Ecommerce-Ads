import {businessMonthWithCheckpoint,buildBusinessCheckpoint} from './business-checkpoint.mjs';
import {buildMonthlyFinancialSummary} from './business-month-summary.mjs';
import {projectBusinessMonth} from './business-month.mjs';
import {validateVariantBindings} from './variant-bindings.mjs';
import {validateProductionCosts,productionCostReference} from './production-costs.mjs';
import {validateCostRules,costRuleSnapshotQueries,costRuleReferenceFromSnapshot,mergeCatalogCostReference} from './cost-rules.mjs';
import {catalogClassificationQueries,catalogClassificationsFromSnapshot} from './catalog-classification.mjs';
import {projectVariantCatalogFailure} from '../../finance/src/variant-catalog-frame.mjs';
import {historicalCostPairDiagnosticsQueries,historicalCostPairDiagnosticsFromSnapshot,projectHistoricalCostPairDiagnostics} from './historical-cost-evidence.mjs';
import {buildRecordedBusinessBalance,projectRecordedBusinessBalance} from './business-recorded-balance.mjs';

export class BusinessCostDiagnosticsError extends Error {constructor(code,status=503){super(code);this.status=status;}}
const fail=(code,status=503)=>{throw new BusinessCostDiagnosticsError(code,status);};
const encoder=new TextEncoder(),compare=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
const epoch=now=>{let value;try{value=now();}catch{fail('BUSINESS_COST_DIAGNOSTICS_CLOCK_INVALID');}if(!Number.isSafeInteger(value)||value<1||value>9999999999999)fail('BUSINESS_COST_DIAGNOSTICS_CLOCK_INVALID');return Math.floor(value/1000);};

// The client embeds this projector. Keep all validation local and consume only
// own data descriptors; neither accessors nor unknown/private fields survive.
export function projectBusinessCostDiagnostics(value){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const int=(row,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
 const cents=row=>row===null||int(row,Number.MIN_SAFE_INTEGER);
 const text=(row,max)=>typeof row==='string'&&new TextEncoder().encode(row).byteLength<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(row);
 const array=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,i)=>Object.getOwnPropertyDescriptor(rows,String(i))).every(field=>field&&Object.hasOwn(field,'value'));
 const id=(row,zero=false)=>typeof row==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(row);
 const pendingCodes=['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','TAX_POLICY_REQUIRED','FINANCIAL_SOURCE_STALE'];
 const pending=rows=>array(rows,pendingCodes.length)&&new Set(rows).size===rows.length&&rows.every(row=>pendingCodes.includes(row));
 const reasonCodes=['COST_AVAILABLE','METADATA_CHANGED','RULE_DISABLED','RULE_UNAVAILABLE','ASSIGNMENT_PENDING','CONFLICT','NO_CATALOG','MODEL_NOT_IN_CATALOG','OPTION_NOT_RECOGNIZED','AXES_NOT_RECOGNIZED','INDEX_NOT_VALID','NO_MODELS','RULE_NOT_MATCHED','COMPOSITION_PENDING'];
 const jobReasons=['CATALOG_UNAVAILABLE','CATALOG_INVALID','CATALOG_STALE_RESPONSE','CATALOG_CONFLICT','CATALOG_METADATA_CHANGED','CATALOG_SOLD_MODEL_MISSING','UNRECOGNIZED_VARIATION','AXES_NOT_RECOGNIZED','OPTION_NOT_RECOGNIZED','INDEX_NOT_VALID','NO_MODELS','CATALOG_BASE_ITEM_ABSENT','CATALOG_BASE_NAME_UNAVAILABLE','CATALOG_BASE_API_REJECTED','CATALOG_BASE_RESPONSE_INVALID','CATALOG_MODEL_API_REJECTED','CATALOG_MODEL_RESPONSE_INVALID','CATALOG_MODEL_STRUCTURE_INVALID','CATALOG_COST_METADATA_INVALID','CATALOG_RESPONSE_INVALID','CATALOG_RESPONSE_TOO_LARGE','CATALOG_AUTH_REQUIRED','CATALOG_PERMISSION_REQUIRED','CATALOG_RATE_LIMIT','CATALOG_TIMEOUT','CATALOG_HTTP_ERROR','CATALOG_BASE_HTTP_ERROR','CATALOG_MODEL_HTTP_ERROR','CATALOG_TRANSPORT_UNAVAILABLE','CATALOG_SOURCE_UNAVAILABLE'];
 const sourceSuffixes=['REQUEST_INVALID','CONFIGURATION','CLOCK_CONFIGURATION','SIGNING_KEY_CONFIGURATION','AUTHORIZATION_EXPIRED','AUTH_REQUIRED','PERMISSION_REQUIRED','RATE_LIMIT','IDENTITY_MISMATCH','COST_METADATA_UNAVAILABLE','BASE_API_REJECTED','BASE_ITEM_ABSENT','BASE_NAME_UNAVAILABLE','BASE_RESPONSE_INVALID','MODEL_API_REJECTED','MODEL_RESPONSE_INVALID','MODEL_STRUCTURE_INVALID','COST_METADATA_INVALID','RESPONSE_INVALID','API_REJECTED','UNAVAILABLE','TRANSPORT_CONFIGURATION','TRANSPORT_UNAVAILABLE','REQUEST_STALE','TIMEOUT','UPSTREAM_FAILED','UPSTREAM_HTTP','UPSTREAM_BODY_TOO_LARGE','UPSTREAM_INVALID_JSON','UPSTREAM_CONTENT_TYPE','APP_CONFIGURATION','APP_RESPONSE_INVALID','APP_HTTP_ERROR','APP_TIMEOUT','APP_UPSTREAM_FAILED'];
 const coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
 const versionKeys=['bindings','costs','cost_rules','classifications'];
 const totalsKeys=['sales_cents','known_sales_cents','expected_repass_cents','known_expected_repass_cents','production_cost_cents','known_production_cost_cents','invoice_tax_cents','ads_spend_cents','external_expenses_cents','ads_adjustment_cents','recharge_addback_cents','net_estimate_cents','realized_net_cents','summary_balance_cents'];
 try{
  if(!exact(value,['schema','month','start_date','end_date','checked_at','diagnosed_at','consistent','status','pending','coverage','review_counts','source_checked_at','collection','versions','summary','totals','settings','products','truncation'])||value.schema!=='business_cost_diagnostics_v1'||typeof value.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||value.start_date!==value.month+'-01'||typeof value.end_date!=='string'||!value.end_date.startsWith(value.month+'-')||!int(value.checked_at,1,9999999999)||!int(value.diagnosed_at,1,9999999999)||typeof value.consistent!=='boolean'||!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(value.status)||!pending(value.pending))return null;
  const c=value.coverage;if(!exact(c,coverageKeys)||!coverageKeys.every(key=>int(c[key],0,3000))||c.orders!==c.paid+c.cancelled+c.cancel_pending+c.unpaid+c.other+c.unknown||c.paid!==c.completed+c.ongoing||c.payment_covered+c.payment_missing!==c.paid||c.returns+c.returns_unknown>c.paid)return null;
  if(!exact(value.review_counts,['IN_CANCEL','TO_RETURN','UNKNOWN_STATUS'])||value.review_counts.IN_CANCEL!==c.cancel_pending||value.review_counts.TO_RETURN!==c.other||value.review_counts.UNKNOWN_STATUS!==c.unknown)return null;
  if(!exact(value.source_checked_at,['finance_oldest_at','finance_latest_at','ads_at'])||!Object.values(value.source_checked_at).every(at=>at===null||int(at,1,value.checked_at)))return null;
  if(value.collection!==null&&(!exact(value.collection,['schema','state','code','retry_after_seconds'])||value.collection.schema!=='business_month_collection_v1'||!['READY','RETRY_WAIT','BLOCKED'].includes(value.collection.state)||![null,'BUSINESS_PERIOD_CHECKPOINT','BUSINESS_PERIOD_BUSY','BUSINESS_PERIOD_CONFLICT','BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE','BUSINESS_PERIOD_TIMEOUT','BUSINESS_PERIOD_RATE_LIMIT','BUSINESS_PERIOD_AUTH_REQUIRED','BUSINESS_PERIOD_INVALID_SOURCE','BUSINESS_PERIOD_PERMISSION_DENIED'].includes(value.collection.code)||!int(value.collection.retry_after_seconds,0,300)))return null;
  if(!exact(value.versions,['monthly','current'])||!['monthly','current'].every(which=>exact(value.versions[which],versionKeys)&&versionKeys.every(key=>value.versions[which][key]===null||int(value.versions[which][key],1,2147483647)))||value.consistent!==versionKeys.every(key=>value.versions.monthly[key]===value.versions.current[key]))return null;
  const s=value.summary;if(!exact(s,['schema','state','balance_cents','before_production_cents','known_production_cents','production_complete','costs_after_payout_cents','production_coverage','pending','basis'])||s.schema!=='monthly_financial_summary_v1'||!['WAITING','READY','PROVISIONAL','PARTIAL_COSTS'].includes(s.state)||!['balance_cents','before_production_cents','known_production_cents','costs_after_payout_cents'].every(key=>cents(s[key]))||typeof s.production_complete!=='boolean'||!exact(s.production_coverage,['total_units','known_units','pending_units','pending_variants','pending_products'])||!['total_units','known_units'].every(key=>s.production_coverage[key]===null||int(s.production_coverage[key]))||!['pending_units','pending_variants','pending_products'].every(key=>int(s.production_coverage[key]))||!pending(s.pending)||s.basis!=='PAID_MONTH_CURRENT_COSTS_AFTER_ADS_TAX_EXPENSES')return null;
  const signedTotals=['expected_repass_cents','known_expected_repass_cents','ads_adjustment_cents','net_estimate_cents','summary_balance_cents'];
  if(!exact(value.totals,totalsKeys)||!totalsKeys.every(key=>cents(value.totals[key])&&(value.totals[key]===null||signedTotals.includes(key)||value.totals[key]>=0))||value.totals.realized_net_cents!==null||value.totals.summary_balance_cents!==s.balance_cents)return null;
  const settings=value.settings;if(!exact(settings,['mode','inclusive_regular_cents','inclusive_plus_cents','base_regular_cents','base_plus_cents','components','custom_profiles','rules'])||!['all_inclusive','itemized'].includes(settings.mode)||!['inclusive_regular_cents','inclusive_plus_cents'].every(key=>int(settings[key],1,1000000))||!['base_regular_cents','base_plus_cents'].every(key=>settings[key]===null||int(settings[key],1,1000000))||!array(settings.components,20)||!array(settings.custom_profiles,100)||!array(settings.rules,100))return null;
  for(const row of settings.components)if(!exact(row,['id','label','basis','amount_cents'])||!text(row.id,64)||!text(row.label,240)||!['per_piece','per_kit'].includes(row.basis)||!int(row.amount_cents,0,1000000))return null;
  for(const row of settings.custom_profiles)if(!exact(row,['id','label','unit_cost_cents'])||!text(row.id,64)||!text(row.label,240)||!int(row.unit_cost_cents,1,1000000))return null;
  for(const row of settings.rules)if(!exact(row,['id','label','enabled','unit_cost_cents'])||!text(row.id,48)||!text(row.label,180)||typeof row.enabled!=='boolean'||!int(row.unit_cost_cents,1,1000000))return null;
  if(!array(value.products,90))return null;const seenProducts=new Set(),seenPairs=new Set();let count=0;
  for(const product of value.products){
   if(!exact(product,['item_id','product_name','catalog_checked_at','classification','variants'])||!id(product.item_id)||seenProducts.has(product.item_id)||product.product_name!==null&&!text(product.product_name,256)||product.catalog_checked_at!==null&&!int(product.catalog_checked_at,1,9999999999)||!array(product.variants,3000)||!product.variants.length)return null;
   seenProducts.add(product.item_id);const job=product.classification;
   const hasSource=plain(job)&&Object.hasOwn(job,'source_diagnostic');
   if(job!==null&&(!exact(job,['status','reason','checked_at','next_attempt_at','failure_count',...(hasSource?['source_diagnostic']:[])])||!['QUEUED','RUNNING','MATCHED','PARTIAL','REVIEW','RETRY_WAIT'].includes(job.status)||job.reason!==null&&!jobReasons.includes(job.reason)||job.checked_at!==null&&!int(job.checked_at,1,9999999999)||!int(job.next_attempt_at,0,9999999999)||!int(job.failure_count,0,1000000)))return null;
   if(hasSource){const source=job.source_diagnostic;if(!exact(source,['stage','code','http','checked_at'])||!['BASE_INFO','MODELS','RESULT','TRANSPORT','CONFIGURATION','APP','UNKNOWN'].includes(source.stage)||!sourceSuffixes.some(suffix=>source.code==='FINANCE_CATALOG_'+suffix)||source.http!==null&&!int(source.http,100,599)||!int(source.checked_at,1,value.diagnosed_at+60))return null;}
   for(const row of product.variants){
    if(!exact(row,['model_id','quantity','model_name','attributes','reason','recoverable','next_attempt_at','unit_cost_cents','production_cost_cents','assignment'])||!id(row.model_id,true))return null;
    const key=product.item_id+':'+row.model_id;
    if(seenPairs.has(key)||!int(row.quantity,1)||row.model_name!==null&&!text(row.model_name,128)||!array(row.attributes,2)||!reasonCodes.includes(row.reason)||typeof row.recoverable!=='boolean'||row.next_attempt_at!==(job?.next_attempt_at??null)||row.recoverable&&(!value.consistent||!['NO_CATALOG','MODEL_NOT_IN_CATALOG','METADATA_CHANGED'].includes(row.reason)||job?.status==='RUNNING'||job?.status==='RETRY_WAIT'&&job.next_attempt_at>value.diagnosed_at)||!cents(row.unit_cost_cents)||!cents(row.production_cost_cents)||row.unit_cost_cents!==null&&(!int(row.unit_cost_cents,1,420000000)||!int(row.production_cost_cents)||BigInt(row.unit_cost_cents)*BigInt(row.quantity)!==BigInt(row.production_cost_cents))||row.unit_cost_cents===null&&row.production_cost_cents!==null||(row.reason==='COST_AVAILABLE')!==(row.unit_cost_cents!==null))return null;
    for(const attribute of row.attributes)if(!exact(attribute,['name','value'])||!text(attribute.name,256)||!text(attribute.value,256))return null;
    const assignment=row.assignment;if(assignment!==null&&(!exact(assignment,['rule_id','size','scope'])||!text(assignment.rule_id,48)||assignment.size!==null&&!text(assignment.size,256)||!['PRODUCT','VARIANT'].includes(assignment.scope)))return null;
    seenPairs.add(key);count++;
   }
  }
  const t=value.truncation;if(!exact(t,['truncated','products_total','products_included','variants_total','variants_included','reason','text_truncated'])||typeof t.truncated!=='boolean'||typeof t.text_truncated!=='boolean'||!int(t.products_total,0,3000)||t.products_included!==value.products.length||t.products_total<t.products_included||!int(t.variants_total,0,3000)||t.variants_included!==count||t.variants_total<count||count>3000||![null,'PRODUCT_LIMIT','BYTE_LIMIT','PRODUCT_AND_BYTE_LIMIT'].includes(t.reason)||t.truncated!==(t.products_total>t.products_included||t.variants_total>count||t.text_truncated)||t.reason===null&&(t.products_total>t.products_included||t.variants_total>count))return null;
  // Every nested field above has an explicit allowlist before serialization.
  const payload=JSON.stringify(value);if(new TextEncoder().encode(payload).byteLength>65536)return null;return JSON.parse(payload);
 }catch{return null;}
}

// Validators are explicit arguments: the embedded browser function must never
// capture server imports, and an old open tab keeps the unmodified v1 DTO.
export function projectBusinessCostDiagnosticsEvidence(value,validators={}){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const int=(row,signed=false)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&(signed||row>=0);
 try{
  if(!exact(validators,['projectDiagnostic','projectHistory','projectBalance'])||!Object.values(validators).every(fn=>typeof fn==='function')||!exact(value,['schema','diagnostic','history','recorded_balance'])||value.schema!=='business_cost_diagnostics_evidence_v1')return null;
  const diagnostic=validators.projectDiagnostic(value.diagnostic),history=validators.projectHistory(value.history),balance=validators.projectBalance(value.recorded_balance);
  if(!diagnostic||!history||!balance||history.month!==diagnostic.month||history.checked_at!==diagnostic.diagnosed_at||history.truncation.pairs_total!==diagnostic.truncation.variants_total)return null;
  const pairs=new Set(diagnostic.products.flatMap(product=>product.variants.map(variant=>product.item_id+':'+variant.model_id)));
  if(history.pairs.some(pair=>!pairs.has(pair.item_id+':'+pair.model_id)))return null;
  const expectedCounts={known_production_cents:diagnostic.totals.known_production_cost_cents,pending_production_units:diagnostic.summary.production_coverage.pending_units,review_orders:diagnostic.coverage.cancel_pending+diagnostic.coverage.other+diagnostic.coverage.unknown,returns_orders:diagnostic.coverage.returns+diagnostic.coverage.returns_unknown};
  if(Object.keys(expectedCounts).some(key=>balance[key]!==null&&balance[key]!==expectedCounts[key]))return null;
  if(balance.status==='AVAILABLE'){
   const t=diagnostic.totals,keys=['expected_repass_cents','known_production_cost_cents','invoice_tax_cents','ads_spend_cents','external_expenses_cents','recharge_addback_cents'];
   if(!diagnostic.consistent||!keys.every(key=>int(t[key],key==='expected_repass_cents'))||balance.pending.length!==diagnostic.pending.length||!balance.pending.every(code=>diagnostic.pending.includes(code))||Object.keys(balance.source_checked_at).some(key=>balance.source_checked_at[key]!==diagnostic.source_checked_at[key]))return null;
   const amount=BigInt(t.expected_repass_cents)-BigInt(t.known_production_cost_cents)-BigInt(t.invoice_tax_cents)-BigInt(t.ads_spend_cents)-BigInt(t.external_expenses_cents)+BigInt(t.recharge_addback_cents);
   if(amount<BigInt(Number.MIN_SAFE_INTEGER)||amount>BigInt(Number.MAX_SAFE_INTEGER)||amount!==BigInt(balance.amount_cents))return null;
  }
  const projected={schema:'business_cost_diagnostics_evidence_v1',diagnostic,history,recorded_balance:balance};
  return new TextEncoder().encode(JSON.stringify(projected)).byteLength<=196608?projected:null;
 }catch{return null;}
}

export function buildBusinessCostDiagnostics(frame,context,{now=()=>Date.now()}={}){
 const value=projectBusinessMonth(frame),checkpoint=value&&buildBusinessCheckpoint(value);if(!value||!checkpoint)fail('BUSINESS_COST_DIAGNOSTICS_FRAME_INVALID');
 const diagnosedAt=epoch(now),summary=buildMonthlyFinancialSummary(value),{bindings,costs,rules,classifications,catalogs,reference,sourceDiagnostics=[]}=context;
 const currentVersions={bindings:bindings.revision,costs:costs.revision,cost_rules:rules.revision,classifications:classifications.revision},monthlyVersions={bindings:value.bindings_revision,costs:value.costs_revision,cost_rules:value.cost_rules_revision??null,classifications:value.classification_revision??null},consistent=Object.keys(currentVersions).every(key=>currentVersions[key]===monthlyVersions[key]);
 const grouped=new Map();for(const row of value.unmapped_variants){if(!grouped.has(row.item_id))grouped.set(row.item_id,[]);grouped.get(row.item_id).push(row);}
 const ids=[...grouped.keys()].sort(compare).slice(0,90),allowed=new Set(ids),pairs=value.unmapped_variants.filter(row=>allowed.has(row.item_id)),costVariants=new Map();
 for(let index=0;index<pairs.length;index+=1000){const current=productionCostReference({status:'AVAILABLE',rows:pairs.slice(index,index+1000)},bindings,costs,reference);for(const row of current.variants)costVariants.set(row.item_id+':'+row.model_id,row);}
 const jobs=new Map(classifications.products.map(row=>[row.item_id,row])),metadata=new Map(classifications.variants.map(row=>[row.item_id+':'+row.model_id,row])),automatic=new Map(reference.variants.map(row=>[row.item_id+':'+row.model_id,row])),learning=new Map((reference.learning||[]).map(row=>[row.item_id,row])),changed=new Set(reference.metadata_changed_item_ids||[]),ruleMap=new Map(rules.values.rules.map(row=>[row.id,row]));
 const catalogMap=new Map(catalogs.filter(row=>Object.hasOwn(row,'catalog_fingerprint')&&Object.hasOwn(row,'payload')).map(row=>[row.item_id,{...row,catalog:JSON.parse(row.payload)}])),assignmentMap=new Map((rules.values.assignments||[]).map(row=>[row.item_id+':'+(row.model_id??'*'),row]));
 const sources=new Map();for(const row of sourceDiagnostics){const job=jobs.get(row.item_id);if(!job||job.status!=='RETRY_WAIT'||job.failure_count!==row.failure_count)continue;const diagnostic=projectVariantCatalogFailure({schema:'variant_catalog_v1',status:'UNAVAILABLE',diagnostic:JSON.parse(row.diagnostic)})?.diagnostic;if(!diagnostic||!Number.isSafeInteger(row.checked_at)||row.checked_at<1||row.checked_at>diagnosedAt+60)fail('BUSINESS_COST_DIAGNOSTICS_STORAGE_INVALID');sources.set(row.item_id,{...diagnostic,checked_at:row.checked_at});}
 let textTruncated=false;const compact=(text,max)=>{if(text===null||text===undefined)return null;let result='';for(const character of text){if(encoder.encode(result+character).byteLength>max){textTruncated=true;break;}result+=character;}return result;};
 const reasonFor=(itemId,modelId,current,catalog,variant,job,assignment)=>{
  if(current.unit_cost_cents!==null)return 'COST_AVAILABLE';
  if(changed.has(itemId)||variant?.reason==='CATALOG_METADATA_CHANGED'||job?.reason==='CATALOG_METADATA_CHANGED')return 'METADATA_CHANGED';
  const automaticReason=automatic.get(itemId+':'+modelId)?.reason,recognition=learning.get(itemId);
  if(assignment){const rule=ruleMap.get(assignment.rule_id);if(!rule)return 'RULE_UNAVAILABLE';if(!rule.enabled)return 'RULE_DISABLED';if(automaticReason==='RULE_ASSIGNMENT_PENDING'||rule.options.length&&assignment.model_id!==null&&!rule.options.includes(assignment.size))return 'ASSIGNMENT_PENDING';}
  if(automaticReason==='RULE_CONFLICT'||recognition?.status==='CONFLICT'||job?.reason==='CATALOG_CONFLICT')return 'CONFLICT';
  if(!catalog&&!job?.catalog_fingerprint)return 'NO_CATALOG';
  if(!variant&&!catalog?.catalog.variants.some(row=>row.model_id===modelId))return 'MODEL_NOT_IN_CATALOG';
  const sourceReason=variant?.reason??job?.reason;
  if(['OPTION_NOT_RECOGNIZED','AXES_NOT_RECOGNIZED','INDEX_NOT_VALID','NO_MODELS'].includes(sourceReason))return sourceReason;
  if(automaticReason==='RULE_ASSIGNMENT_PENDING')return 'ASSIGNMENT_PENDING';
  if(automaticReason==='RULE_NOT_MATCHED')return 'RULE_NOT_MATCHED';
  return 'COMPOSITION_PENDING';
 };
 const products=ids.map(itemId=>{
  const job=jobs.get(itemId),catalog=catalogMap.get(itemId);
  return {item_id:itemId,product_name:compact(catalog?.catalog.product_name??job?.product_name??null,256),catalog_checked_at:catalog?.checked_at??job?.checked_at??null,classification:job?{status:job.status,reason:job.reason,checked_at:job.checked_at,next_attempt_at:job.next_attempt_at,failure_count:job.failure_count,...(sources.has(itemId)?{source_diagnostic:sources.get(itemId)}:{})}:null,variants:grouped.get(itemId).map(row=>{
   const key=itemId+':'+row.model_id,current=costVariants.get(key),variant=metadata.get(key),catalogVariant=catalog?.catalog.variants.find(entry=>entry.model_id===row.model_id),assignment=assignmentMap.get(key)||assignmentMap.get(itemId+':*');
   const reason=reasonFor(itemId,row.model_id,current,catalog,variant,job,assignment),recoverable=consistent&&['NO_CATALOG','MODEL_NOT_IN_CATALOG','METADATA_CHANGED'].includes(reason)&&job?.status!=='RUNNING'&&!(job?.status==='RETRY_WAIT'&&job.next_attempt_at>diagnosedAt);
   return {model_id:row.model_id,quantity:row.quantity,model_name:compact(variant?.model_name??null,128),attributes:(catalogVariant?.attributes??variant?.attributes??[]).map(attribute=>({...attribute})),reason,recoverable,next_attempt_at:job?.next_attempt_at??null,unit_cost_cents:current.unit_cost_cents,production_cost_cents:current.production_cost_cents,assignment:assignment?{rule_id:assignment.rule_id,size:assignment.size,scope:assignment.model_id===null?'PRODUCT':'VARIANT'}:null};
  })};
 });
 const profileIds=new Set((costs.values.custom_assignments||[]).filter(row=>allowed.has(row.item_id)).map(row=>row.profile_id)),settings={...Object.fromEntries(['mode','inclusive_regular_cents','inclusive_plus_cents','base_regular_cents','base_plus_cents'].map(key=>[key,costs.values[key]])),components:costs.values.components.map(row=>({...row,label:compact(row.label,96)})),custom_profiles:(costs.values.custom_profiles||[]).filter(row=>profileIds.has(row.id)).map(row=>({...row,label:compact(row.label,96)})),rules:rules.values.rules.map(({id,label,enabled,unit_cost_cents})=>({id,label:compact(label,96),enabled,unit_cost_cents}))};
 const result={schema:'business_cost_diagnostics_v1',month:value.month,start_date:value.start_date,end_date:value.end_date,checked_at:value.checked_at,diagnosed_at:diagnosedAt,consistent,status:value.status,pending:[...value.result.pending],coverage:{...value.coverage},review_counts:{IN_CANCEL:value.coverage.cancel_pending,TO_RETURN:value.coverage.other,UNKNOWN_STATUS:value.coverage.unknown},source_checked_at:{...checkpoint.source_checked_at},collection:value.collection?{...value.collection}:null,versions:{monthly:monthlyVersions,current:currentVersions},summary,totals:{sales_cents:value.sales_cents,known_sales_cents:value.known_sales_cents,expected_repass_cents:value.expected_repass_cents,known_expected_repass_cents:value.known_expected_repass_cents,production_cost_cents:value.production_cost_cents,known_production_cost_cents:value.known_production_cost_cents,invoice_tax_cents:value.invoice_tax_cents,ads_spend_cents:value.ads?.status==='AVAILABLE'?value.ads.expense_cents:null,external_expenses_cents:value.expenses.external_expenses_cents,ads_adjustment_cents:value.ads_adjustment_cents,recharge_addback_cents:checkpoint.lines[5].amount_cents,net_estimate_cents:value.result.net_estimate_cents,realized_net_cents:null,summary_balance_cents:summary.balance_cents},settings,products,truncation:{truncated:false,products_total:grouped.size,products_included:products.length,variants_total:value.unmapped_variants.length,variants_included:products.reduce((sum,row)=>sum+row.variants.length,0),reason:grouped.size>90?'PRODUCT_LIMIT':null,text_truncated:textTruncated}};
 // Keep a stable prefix with logarithmically many serializations. Removing a
 // single row at a time makes a 3,000-pair diagnostic quadratic in CPU time.
 const t=result.truncation,totalVariants=t.variants_included;
 const take=(count,byteLimit)=>{let remaining=count;result.products=products.flatMap(product=>{if(!remaining)return [];const selected=product.variants.slice(0,remaining);remaining-=selected.length;return [{...product,variants:selected}];});t.products_included=result.products.length;t.variants_included=count;t.reason=byteLimit?(grouped.size>90?'PRODUCT_AND_BYTE_LIMIT':'BYTE_LIMIT'):grouped.size>90?'PRODUCT_LIMIT':null;t.truncated=t.products_included<t.products_total||count<t.variants_total||t.text_truncated;};
 take(totalVariants,false);
 if(encoder.encode(JSON.stringify(result)).byteLength>65536){let lower=0,upper=totalVariants;while(lower<upper){const middle=Math.ceil((lower+upper)/2);take(middle,true);if(encoder.encode(JSON.stringify(result)).byteLength<=65536)lower=middle;else upper=middle-1;}take(lower,true);}
 const projected=projectBusinessCostDiagnostics(result);if(!projected)fail('BUSINESS_COST_DIAGNOSTICS_RESULT_INVALID');return projected;
}

// No provider capability is passed to the monthly read. All cost evidence is
// then read in one D1 batch, so a concurrent cost edit is visible as a version
// difference rather than being silently mixed with the monthly amounts.
async function readBusinessCostDiagnosticsSnapshot(env,input,{now=()=>Date.now(),evidence=false}={}){
 if(!input||typeof input!=='object'||Reflect.ownKeys(input).length!==1||!Object.hasOwn(Object.getOwnPropertyDescriptor(input,'month')||{},'value')||typeof input.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month))fail('BUSINESS_COST_DIAGNOSTICS_REQUEST_INVALID',400);
 const stamp=epoch(now),clock=()=>stamp*1000;let frame;
 try{frame=await businessMonthWithCheckpoint(env,{operation:'read',month:input.month},{},{now:clock});}catch(error){if(error?.message==='BUSINESS_MONTH_NOT_FOUND')throw error;fail('BUSINESS_COST_DIAGNOSTICS_MONTH_UNAVAILABLE');}
 try{
  const db=env.ADMIN_DB,ids=[...new Set(frame.unmapped_variants.map(row=>row.item_id))].sort(compare).slice(0,90),allowed=new Set(ids),pairs=frame.unmapped_variants.filter(row=>allowed.has(row.item_id)),ruleQueries=costRuleSnapshotQueries(db,ids),classQueries=catalogClassificationQueries(db,ids,pairs),sourceIndex=2+ruleQueries.length+classQueries.length,historyQueries=evidence?historicalCostPairDiagnosticsQueries(db,input.month,pairs.map(({item_id,model_id})=>({item_id,model_id}))):[];
  const snapshot=await db.batch([db.prepare('SELECT revision,payload FROM variant_bindings_state WHERE id=1'),db.prepare('SELECT revision,payload FROM production_costs_state WHERE id=1'),...ruleQueries,...classQueries,db.prepare('SELECT item_id,diagnostic,checked_at,failure_count FROM catalog_classification_source_diagnostics WHERE item_id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(ids)),...historyQueries]);
  const [bindingRow,costRow]=snapshot.slice(0,2).map(row=>row.results[0]),bindings={revision:bindingRow.revision,bindings:validateVariantBindings(JSON.parse(bindingRow.payload))},costs={revision:costRow.revision,values:validateProductionCosts(JSON.parse(costRow.payload))},ruleSnapshot=snapshot.slice(2,2+ruleQueries.length),ruleRow=ruleSnapshot[0].results[0],rules={revision:ruleRow.revision,values:validateCostRules(JSON.parse(ruleRow.payload))},classifications=catalogClassificationsFromSnapshot(snapshot.slice(2+ruleQueries.length,2+ruleQueries.length+classQueries.length)),reference=mergeCatalogCostReference(costRuleReferenceFromSnapshot(ruleSnapshot,{now:clock}),classifications);
  const diagnostic=buildBusinessCostDiagnostics(frame,{bindings,costs,rules,classifications,catalogs:ruleSnapshot.slice(1).flatMap(row=>row.results).filter(row=>Object.hasOwn(row,'catalog_fingerprint')&&Object.hasOwn(row,'payload')),reference,sourceDiagnostics:snapshot[sourceIndex].results},{now:clock});
  if(!evidence)return diagnostic;
  const history=historicalCostPairDiagnosticsFromSnapshot(snapshot.slice(sourceIndex+1,sourceIndex+1+historyQueries.length),{now:clock}),included=new Set(diagnostic.products.flatMap(product=>product.variants.map(variant=>product.item_id+':'+variant.model_id)));
  history.pairs=history.pairs.filter(pair=>included.has(pair.item_id+':'+pair.model_id));history.truncation={truncated:diagnostic.truncation.variants_total>history.pairs.length,pairs_total:diagnostic.truncation.variants_total,pairs_included:history.pairs.length};
  let recorded_balance=buildRecordedBusinessBalance(frame);if(!diagnostic.consistent)recorded_balance={...recorded_balance,status:'UNAVAILABLE',amount_cents:null};
  const result=projectBusinessCostDiagnosticsEvidence({schema:'business_cost_diagnostics_evidence_v1',diagnostic,history,recorded_balance},{projectDiagnostic:projectBusinessCostDiagnostics,projectHistory:projectHistoricalCostPairDiagnostics,projectBalance:projectRecordedBusinessBalance});
  if(!result)fail('BUSINESS_COST_DIAGNOSTICS_RESULT_INVALID');return result;
 }catch(error){if(error instanceof BusinessCostDiagnosticsError)throw error;fail('BUSINESS_COST_DIAGNOSTICS_STORAGE_INVALID');}
}

export async function readBusinessCostDiagnostics(env,input,options={}){return readBusinessCostDiagnosticsSnapshot(env,input,options);}
export async function readBusinessCostDiagnosticsEvidence(env,input,options={}){return readBusinessCostDiagnosticsSnapshot(env,input,{...options,evidence:true});}
