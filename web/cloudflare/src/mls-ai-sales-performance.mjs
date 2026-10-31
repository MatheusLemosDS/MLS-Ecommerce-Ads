import {validateAiSalesPerformance,validateAiSalesEvidence,canonicalAiSalesJson,readAiSalesList} from './mls-ai-sales-contracts.mjs';
import {parseAiSalesCsv,exportAiSalesCsv,parseAiSalesJson,parseAiSalesInteger} from './mls-ai-sales-imports.mjs';

/** Normalized manual observations. No API, provider credential or write action. */
export class AiSalesPerformanceError extends Error{constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new AiSalesPerformanceError(code);};
const SCHEMA='mls_ai_sales_manual_performance_record_v1',MAX=Number.MAX_SAFE_INTEGER;
const PROVIDERS=['SHOPEE_BR','TIKTOK_SHOP_BR'];
const MONEY=['sales_cents','refunds_cents','commission_cents','cost_cents','fees_cents','tax_cents','external_expenses_cents','attributable_ad_spend_cents','adjustment_cents'];
const COUNTS=['views','clicks','attributed_orders'];
const KEYS=['schema','record_id','revision','kind','provider','shop_ref','currency','source','source_evidence','observed_at','period','campaign_ref','creative_ref','product_ref','creator_ref','coverage_status','attribution_status','order_status',...COUNTS,...MONEY];
export const AI_SALES_PERFORMANCE_CSV_HEADERS=Object.freeze([...KEYS]);
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value');});
const ref=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/.test(value)&&!value.includes('..');
const integer=(value,min=0,max=MAX)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const period=value=>exact(value,['start_date','end_date'])&&day(value.start_date)&&day(value.end_date)&&value.start_date<=value.end_date;
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
const clone=value=>JSON.parse(JSON.stringify(value));
const identity=row=>canonicalAiSalesJson([row.provider,row.shop_ref,row.source,row.kind,row.record_id]);
const immutable=row=>canonicalAiSalesJson([row.provider,row.shop_ref,row.source,row.kind,row.currency,row.period,row.campaign_ref,row.creative_ref,row.product_ref,row.creator_ref]);

export function validateAiSalesManualPerformanceRecord(input){
 if(!exact(input,KEYS)||input.schema!==SCHEMA||!ref(input.record_id)||!integer(input.revision,1,2147483647)||!['ORDER','METRICS'].includes(input.kind)||!PROVIDERS.includes(input.provider)||!ref(input.shop_ref)||!ref(input.source)||!period(input.period)||!integer(input.observed_at,1)||!ref(input.campaign_ref)||input.creative_ref!==null&&!ref(input.creative_ref)||typeof input.product_ref!=='string'||input.product_ref.length>400||input.creator_ref!==null&&!ref(input.creator_ref)||!['COMPLETE','PARTIAL','UNKNOWN'].includes(input.coverage_status)||!['SOURCE_REPORTED','UNKNOWN'].includes(input.attribution_status))fail('AI_SALES_PERFORMANCE_RECORD_INVALID');
 if(!COUNTS.every(key=>input[key]===null||integer(input[key]))||!MONEY.every(key=>input[key]===null||integer(input[key],key==='adjustment_cents'?-MAX:0)))fail('AI_SALES_PERFORMANCE_AMOUNT_INVALID');
 if(input.kind==='ORDER'&&(!['PAID','COMPLETED','CANCELLED','REFUNDED'].includes(input.order_status)||COUNTS.some(key=>input[key]!==null))||input.kind==='METRICS'&&input.order_status!==null)fail('AI_SALES_PERFORMANCE_KIND_INVALID');
 const suppliedEvidence=validateAiSalesEvidence(input.source_evidence);
 if(![input.source,'OPERATOR_IMPORTED'].includes(suppliedEvidence.source))fail('AI_SALES_PERFORMANCE_EVIDENCE_SCOPE_INVALID');
 const checked=validateAiSalesPerformance({schema:'mls_ai_sales_performance_v1',source:suppliedEvidence.source,marketplace:input.provider,shop_ref:input.shop_ref,campaign_ref:input.campaign_ref,product_ref:input.product_ref,creator_ref:input.creator_ref,period:input.period,observed_at:input.observed_at,currency:input.currency,views:input.views,clicks:input.clicks,affiliate_orders:input.attributed_orders,confirmed_sales_cents:input.sales_cents,attributable_ad_spend_cents:input.attributable_ad_spend_cents,commission_cents:input.commission_cents,refunds_cents:input.refunds_cents,coverage_status:input.coverage_status,source_evidence:suppliedEvidence});
 const evidence=checked.source_evidence;
 if(evidence.marketplace!==input.provider||evidence.shop_ref!==input.shop_ref||evidence.currency!==input.currency||evidence.observed_at>input.observed_at)fail('AI_SALES_PERFORMANCE_EVIDENCE_SCOPE_INVALID');
 // A local JSON/CSV file cannot certify its own provider verification flag.
 // Keep its named source and figures, but every known manual observation is
 // explicitly operator-declared; UNKNOWN evidence remains unknown.
 return frozen({...clone(input),period:checked.period,source_evidence:{...evidence,source:'OPERATOR_IMPORTED',status:evidence.status==='UNKNOWN'?'UNKNOWN':'DECLARED'}});
}

export function createAiSalesPerformanceLedger(){return frozen({schema:'mls_ai_sales_performance_ledger_v1',revision:0,records:[],last_import_at:null,commercial_writes:false});}
export function validateAiSalesPerformanceLedger(value){
 if(!exact(value,['schema','revision','records','last_import_at','commercial_writes'])||value.schema!=='mls_ai_sales_performance_ledger_v1'||!integer(value.revision,0,2147483647)||!Array.isArray(value.records)||value.records.length>5000||value.last_import_at!==null&&!integer(value.last_import_at,1)||value.commercial_writes!==false)fail('AI_SALES_PERFORMANCE_LEDGER_INVALID');
 const records=readAiSalesList(value.records,5000).map(validateAiSalesManualPerformanceRecord),keys=new Set(records.map(identity));if(keys.size!==records.length)fail('AI_SALES_PERFORMANCE_DUPLICATE_ID');
 return frozen({...clone(value),records});
}
function decodeCsv(text){
 return parseAiSalesCsv(text,AI_SALES_PERFORMANCE_CSV_HEADERS).map(row=>{
  const output={...row};
  for(const key of ['source_evidence','period']){try{output[key]=JSON.parse(row[key]);}catch{fail('AI_SALES_PERFORMANCE_CSV_JSON_INVALID');}}
  for(const key of ['creative_ref','creator_ref','order_status'])if(output[key]==='')output[key]=null;
  for(const key of ['revision','observed_at',...COUNTS,...MONEY])output[key]=parseAiSalesInteger(output[key],{nullable:!['revision','observed_at'].includes(key),signed:key==='adjustment_cents'});
  return output;
 });
}
function rowsFromText(text,format){
 if(format==='csv')return decodeCsv(text);
 if(format!=='json')fail('AI_SALES_PERFORMANCE_FORMAT_INVALID');
 const input=parseAiSalesJson(text);
 if(exact(input,['schema','records'])&&input.schema==='mls_ai_sales_performance_import_v1'&&Array.isArray(input.records))return input.records;
 if(input.schema==='mls_ai_sales_performance_ledger_v1')return validateAiSalesPerformanceLedger(input).records;
 fail('AI_SALES_PERFORMANCE_IMPORT_INVALID');
}

export function importAiSalesPerformance(current,text,{format='json',imported_at}={}){
 const ledger=validateAiSalesPerformanceLedger(current);if(!integer(imported_at,1))fail('AI_SALES_PERFORMANCE_IMPORT_CLOCK_INVALID');
 const raw=rowsFromText(text,format);if(raw.length>5000)fail('AI_SALES_PERFORMANCE_IMPORT_TOO_LARGE');
 const incoming=raw.map(validateAiSalesManualPerformanceRecord),batch=new Map();let duplicate=0;
 if(incoming.some(row=>row.observed_at>imported_at))fail('AI_SALES_PERFORMANCE_FUTURE_OBSERVATION');
 for(const row of incoming){
  const key=identity(row),prior=batch.get(key);
  if(prior){
   if(immutable(prior)!==immutable(row))fail('AI_SALES_PERFORMANCE_SCOPE_CHANGED');
   if(prior.revision===row.revision){if(canonicalAiSalesJson(prior)!==canonicalAiSalesJson(row))fail('AI_SALES_PERFORMANCE_REVISION_CONFLICT');duplicate++;continue;}
   const newer=row.revision>prior.revision?row:prior,older=newer===row?prior:row;
   if(newer.observed_at<older.observed_at)fail('AI_SALES_PERFORMANCE_OBSERVATION_REVERSED');
   batch.set(key,newer);duplicate++;
  }else batch.set(key,row);
 }
 const records=new Map(ledger.records.map(row=>[identity(row),row]));let added=0,updated=0,ignored=0;
 for(const [key,row] of batch){
  const prior=records.get(key);
  if(prior){
   if(immutable(prior)!==immutable(row))fail('AI_SALES_PERFORMANCE_SCOPE_CHANGED');
   if(row.revision===prior.revision){if(canonicalAiSalesJson(prior)!==canonicalAiSalesJson(row))fail('AI_SALES_PERFORMANCE_REVISION_CONFLICT');ignored++;continue;}
   if(row.revision<prior.revision){ignored++;continue;}
   if(row.observed_at<prior.observed_at)fail('AI_SALES_PERFORMANCE_OBSERVATION_REVERSED');updated++;
  }else added++;
  records.set(key,row);
 }
 if(records.size>5000)fail('AI_SALES_PERFORMANCE_IMPORT_TOO_LARGE');
 const changed=added+updated>0;
 const next=changed?validateAiSalesPerformanceLedger({schema:ledger.schema,revision:ledger.revision+1,records:[...records.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,row])=>row),last_import_at:imported_at,commercial_writes:false}):ledger;
 return frozen({ledger:next,summary:{added,updated,ignored,duplicate,changed,manual_import:true,commercial_writes:false}});
}

export function exportAiSalesPerformance(current,{format='json'}={}){
 const ledger=validateAiSalesPerformanceLedger(current);
 if(format==='json')return JSON.stringify(ledger,null,2)+'\n';
 if(format!=='csv')fail('AI_SALES_PERFORMANCE_FORMAT_INVALID');
 return exportAiSalesCsv(ledger.records.map(row=>({...row,source_evidence:JSON.stringify(row.source_evidence),period:JSON.stringify(row.period)})),AI_SALES_PERFORMANCE_CSV_HEADERS);
}

function bounded(value){return value>=-BigInt(MAX)&&value<=BigInt(MAX)?Number(value):null;}
function sum(rows,key){if(rows.some(row=>row[key]===null))return null;return bounded(rows.reduce((total,row)=>total+BigInt(row[key]),0n));}
function ratio(numerator,denominator,multiplier){if(numerator===null||denominator===null||denominator<=0)return null;const n=BigInt(numerator)*BigInt(multiplier),d=BigInt(denominator);return bounded(n/d+(n%d*2n>=d?1n:0n));}
function covers(rows,wanted){
 const intervals=rows.map(row=>row.period).sort((a,b)=>a.start_date.localeCompare(b.start_date));let end=null;
 for(const range of intervals){if(end===null){if(range.start_date!==wanted.start_date)return false;end=range.end_date;}else{const next=new Date(Date.parse(end+'T00:00:00Z')+86400000).toISOString().slice(0,10);if(range.start_date>next)return false;if(range.end_date>end)end=range.end_date;}}
 return end===wanted.end_date;
}
function groupReport(rows,wanted,minSample,crossesSelection=false){
 const first=rows[0],pending=[];
 if(crossesSelection)pending.push('RECORD_PERIOD_CROSSES_SELECTION');
 if(rows.some(row=>row.coverage_status!=='COMPLETE'))pending.push('SOURCE_COVERAGE_INCOMPLETE');
 if(rows.some(row=>row.attribution_status!=='SOURCE_REPORTED'))pending.push('ATTRIBUTION_UNKNOWN');
 const bases=new Set(rows.map(row=>row.source_evidence.basis));
 if(bases.size!==1||bases.has(null))pending.push('SOURCE_BASIS_INCOMPATIBLE');
 if(rows.some(row=>row.source_evidence.status==='UNKNOWN'))pending.push('SOURCE_EVIDENCE_UNKNOWN');
 if(!covers(rows,wanted))pending.push('PERIOD_COVERAGE_INCOMPLETE');
 if(first.kind==='METRICS'){
  const sorted=[...rows].sort((a,b)=>a.period.start_date.localeCompare(b.period.start_date));
  for(let i=1;i<sorted.length;i++)if(sorted[i].period.start_date<=sorted[i-1].period.end_date){pending.push('OVERLAPPING_METRIC_PERIODS');break;}
 }
 const complete=pending.length===0,totals={};
 for(const key of [...COUNTS,...MONEY])totals[key]=sum(rows,key);
 const unsafe=[...COUNTS,...MONEY].some(key=>totals[key]===null&&rows.every(row=>row[key]!==null));if(unsafe)pending.push('ARITHMETIC_UNSAFE');
 const reportedSales=totals.sales_cents,reportedRefunds=totals.refunds_cents;
 let paidOrders=null,cancelledOrders=null,refundedOrders=null;
 if(first.kind==='ORDER'){
  paidOrders=rows.filter(row=>row.order_status!=='CANCELLED').length;cancelledOrders=rows.length-paidOrders;refundedOrders=rows.filter(row=>row.order_status==='REFUNDED').length;
  const recognized=rows.map(row=>({...row,sales_cents:row.order_status==='CANCELLED'?0:row.sales_cents,refunds_cents:row.order_status==='CANCELLED'?0:row.refunds_cents}));
  totals.sales_cents=sum(recognized,'sales_cents');totals.refunds_cents=sum(recognized,'refunds_cents');totals.attributed_orders=paidOrders;
 }
 const overlap=pending.includes('OVERLAPPING_METRIC_PERIODS');
 const amountsComplete=MONEY.every(key=>totals[key]!==null);
 let contribution=null;
 if(complete&&!unsafe&&amountsComplete){const value=BigInt(totals.sales_cents)-BigInt(totals.refunds_cents)-BigInt(totals.commission_cents)-BigInt(totals.cost_cents)-BigInt(totals.fees_cents)-BigInt(totals.tax_cents)-BigInt(totals.external_expenses_cents)-BigInt(totals.attributable_ad_spend_cents)+BigInt(totals.adjustment_cents);contribution=bounded(value);if(contribution===null)pending.push('ARITHMETIC_UNSAFE');}
 if(!amountsComplete)pending.push('COST_OR_AMOUNT_UNKNOWN');
 const eligible=complete&&!unsafe&&!overlap;
 const ctr=eligible?ratio(totals.clicks,totals.views,10000):null,conversion=eligible?ratio(totals.attributed_orders,totals.clicks,10000):null;
 const attributableSales=eligible&&totals.sales_cents!==null&&totals.refunds_cents!==null?bounded(BigInt(totals.sales_cents)-BigInt(totals.refunds_cents)):null;
 const roas=eligible?ratio(totals.sales_cents,totals.attributable_ad_spend_cents,1000000):null;
 const netRoas=eligible&&attributableSales!==null&&attributableSales>=0?ratio(attributableSales,totals.attributable_ad_spend_cents,1000000):null;
 if(eligible&&[[totals.clicks,totals.views,ctr],[totals.attributed_orders,totals.clicks,conversion],[totals.sales_cents,totals.attributable_ad_spend_cents,roas]].some(([n,d,result])=>n!==null&&d!==null&&d>0&&result===null))pending.push('ARITHMETIC_UNSAFE');
 const sample=eligible&&totals.attributed_orders!==null&&totals.attributed_orders>=minSample;
 return frozen({kind:first.kind,campaign_ref:first.campaign_ref,creative_ref:first.creative_ref,product_ref:first.product_ref,creator_ref:first.creator_ref,
  period:clone(wanted),records:rows.length,state:pending.length?'PARTIAL':'DECLARED_COMPLETE',truth_status:'OPERATOR_DECLARED',attribution_status:'SOURCE_REPORTED_NOT_PROVIDER_VERIFIED',pending:[...new Set(pending)],
  observed:overlap?null:totals,reported_sales_cents:overlap?null:reportedSales,reported_refunds_cents:overlap?null:reportedRefunds,paid_orders:paidOrders,cancelled_orders:cancelledOrders,refunded_orders:refundedOrders,
  ctr_bps:ctr,conversion_bps:conversion,roas_micros:roas,net_roas_after_refunds_micros:netRoas,net_sales_after_refunds_cents:attributableSales,contribution_estimate_cents:overlap?null:contribution,net_profit_cents:null,
  sample_sufficient:sample,warnings:[...(!sample?['MINIMUM_SAMPLE_NOT_REACHED']:[]),'NOT_A_RANDOMIZED_EXPERIMENT','MANUAL_SOURCE_NOT_A_PROVIDER_CONNECTION','BANK_PROFIT_UNVERIFIED']});
}

export function buildAiSalesPerformanceReport(current,selection){
 if(!plain(selection)||Reflect.ownKeys(selection).some(key=>!['provider','shop_ref','source','currency','period','min_sample_orders'].includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(selection,key)||{},'value')))fail('AI_SALES_PERFORMANCE_REPORT_SCOPE_INVALID');
 const ledger=validateAiSalesPerformanceLedger(current),options={min_sample_orders:20,...selection};
 if(!exact(options,['provider','shop_ref','source','currency','period','min_sample_orders'])||!PROVIDERS.includes(options.provider)||!ref(options.shop_ref)||!ref(options.source)||typeof options.currency!=='string'||!/^[A-Z]{3}$/.test(options.currency)||!period(options.period)||!integer(options.min_sample_orders,1,10000))fail('AI_SALES_PERFORMANCE_REPORT_SCOPE_INVALID');
 const scopeRows=ledger.records.filter(row=>row.provider===options.provider&&row.shop_ref===options.shop_ref&&row.source===options.source&&row.currency===options.currency),partial=scopeRows.filter(row=>row.period.start_date<=options.period.end_date&&row.period.end_date>=options.period.start_date&&(row.period.start_date<options.period.start_date||row.period.end_date>options.period.end_date));
 const rows=scopeRows.filter(row=>row.period.start_date>=options.period.start_date&&row.period.end_date<=options.period.end_date),groups=new Map();
 for(const row of rows){const key=canonicalAiSalesJson([row.kind,row.campaign_ref,row.creative_ref,row.product_ref,row.creator_ref]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 const reports=[...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,items])=>groupReport(items,options.period,options.min_sample_orders,partial.some(row=>row.kind===items[0].kind&&row.campaign_ref===items[0].campaign_ref&&row.creative_ref===items[0].creative_ref&&row.product_ref===items[0].product_ref&&row.creator_ref===items[0].creator_ref)));
 const recommendations=[];
 for(const group of reports){
  const evidence={campaign_ref:group.campaign_ref,creative_ref:group.creative_ref,period:group.period,records:group.records,roas_micros:group.roas_micros,contribution_estimate_cents:group.contribution_estimate_cents};
  if(group.pending.length)recommendations.push({code:'VERIFY_SOURCE_AND_COSTS',reason_codes:group.pending,evidence});
  else if(!group.sample_sufficient)recommendations.push({code:'COLLECT_MORE_OBSERVATIONS',reason_codes:['MINIMUM_SAMPLE_NOT_REACHED'],evidence});
  else if(group.creative_ref!==null&&group.roas_micros!==null&&group.contribution_estimate_cents!==null&&group.contribution_estimate_cents>0)recommendations.push({code:'VERIFY_REPORTED_PERFORMER',reason_codes:['OPERATOR_REPORTED_NOT_PROVIDER_VERIFIED','OBSERVED_ONLY_NOT_A_PROVEN_WINNER'],evidence});
 }
 const comparisons=[],comparable=new Map();
 for(const group of reports){
  if(group.kind!=='METRICS'||group.state!=='DECLARED_COMPLETE'||!group.sample_sufficient||group.creative_ref===null)continue;
  const key=canonicalAiSalesJson([group.campaign_ref,group.product_ref,group.creator_ref]);if(!comparable.has(key))comparable.set(key,[]);comparable.get(key).push(group);
 }
 for(const group of comparable.values()){
  const [baseline,...others]=group.sort((a,b)=>a.creative_ref.localeCompare(b.creative_ref));
  for(const row of others.slice(0,50)){
   const difference=key=>row[key]===null||baseline[key]===null?null:bounded(BigInt(row[key])-BigInt(baseline[key]));
   comparisons.push({baseline_creative_ref:baseline.creative_ref,creative_ref:row.creative_ref,campaign_ref:row.campaign_ref,product_ref:row.product_ref,period:clone(options.period),ctr_delta_bps:difference('ctr_bps'),conversion_delta_bps:difference('conversion_bps'),roas_delta_micros:difference('roas_micros'),contribution_delta_cents:difference('contribution_estimate_cents'),proven_winner:null,interpretation:'DESCRIPTIVE_SAME_SOURCE_PERIOD_NOT_CAUSAL'});
  }
 }
 return frozen({schema:'mls_ai_sales_performance_report_v1',scope:clone(options),state:reports.length?'OBSERVED':'EMPTY',groups:reports,
  excluded_partial_period_records:partial.length,pending:partial.length?['RECORD_PERIOD_CROSSES_SELECTION']:[],recommendations,comparisons,
  proven_winner:null,net_profit_cents:null,basis:'MANUAL_SOURCE_OBSERVATIONS_ORDER_AND_METRIC_GROUPS_SEPARATE',mode:'OBSERVER',commercial_writes:false});
}
