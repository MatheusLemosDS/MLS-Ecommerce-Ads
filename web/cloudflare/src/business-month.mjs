import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {projectAdsCalendar} from './ads-calendar.mjs';
import {validateVariantBindings} from './variant-bindings.mjs';
import {productionCostReference,validateProductionCosts} from './production-costs.mjs';
import {buildBusinessMonthProducts,projectBusinessMonthProducts} from './business-month-products.mjs';
import {TAX_POLICY_SCHEMA,businessTaxPolicyFromSnapshot,businessMonthTax} from './business-tax-policy.mjs';
import {COST_RULE_SCHEMA,costRuleSnapshotQueries,costRuleReferenceFromSnapshot,mergeCatalogCostReference} from './cost-rules.mjs';
import {catalogClassificationQueries,catalogClassificationsFromSnapshot} from './catalog-classification.mjs';
import {BUSINESS_MONTH_PUBLICATION_SCHEMA,completedBusinessMonthPublicationStatements,saveCompletedBusinessMonth,readCompletedBusinessMonth} from './business-month-publication.mjs';
import {BUSINESS_MONTH_ADS_HISTORY_SCHEMA,businessMonthAdsHistoryQueries,businessMonthAdsHistoryStatements} from './business-month-ads-history.mjs';
import {EXPENSE_LEDGER_SCHEMA} from './expense-ledger.mjs';

export class BusinessMonthError extends Error {
 constructor(code,status=400,diagnostic=null){super(code);this.status=status;if(diagnostic!==null)this.diagnostic=Object.freeze({...diagnostic});}
}

// The input already passed projectBusinessMonth on the server. Keep old open
// tabs on their exact response shape; new clients explicitly request v2.
export function businessMonthClientFrame(frame,contract='business-month-v1'){
 if(contract==='business-month-v2')return frame;
 if(contract!=='business-month-v1')throw new BusinessMonthError('BUSINESS_MONTH_CLIENT_CONTRACT_UNSUPPORTED',409);
 const keys=['schema','month','start_date','end_date','status','checked_at','progress','coverage','sales_cents','known_sales_cents','expected_repass_cents','known_expected_repass_cents','production_cost_cents','known_production_cost_cents','invoice_tax_cents','known_invoice_tax_cents','ads_adjustment_cents','ads','expenses','result','unmapped_variants','bindings_revision','costs_revision','product_summary','tax','source_checked_at','cost_rules_revision','classification_revision'];
 const collection=frame.collection,legacy=Object.fromEntries(keys.filter(key=>Object.hasOwn(frame,key)).map(key=>[key,frame[key]]));
 // Older clients have no retry timer. A busy/yielded page must pause their
 // tight step loop while the cron or another collector retains the lease.
 if(legacy.status==='RUNNING'&&collection?.state==='RETRY_WAIT'&&!legacy.result.pending.includes('SOURCE_UNAVAILABLE'))legacy.result={...legacy.result,pending:[...legacy.result.pending,'SOURCE_UNAVAILABLE']};
 return legacy;
}
export const BUSINESS_MONTH_SCHEMA=[
 ...EXPENSE_LEDGER_SCHEMA,
 ...BUSINESS_MONTH_PUBLICATION_SCHEMA,
 ...BUSINESS_MONTH_ADS_HISTORY_SCHEMA,
 ...TAX_POLICY_SCHEMA,
 ...COST_RULE_SCHEMA,
 `CREATE TABLE IF NOT EXISTS business_month_runs (month TEXT PRIMARY KEY NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS business_month_frames (month TEXT NOT NULL,slot_index INTEGER NOT NULL CHECK(slot_index BETWEEN 0 AND 2),run_id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=1048576),PRIMARY KEY(month,slot_index))`,
 `CREATE TABLE IF NOT EXISTS business_month_ads (month TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS business_month_ads_attempts (month TEXT PRIMARY KEY NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,attempted_at INTEGER NOT NULL,completed_at INTEGER NOT NULL,status TEXT NOT NULL,diagnostic TEXT,payload TEXT CHECK(payload IS NULL OR length(CAST(payload AS BLOB))<=1048576))`,
 `CREATE TABLE IF NOT EXISTS business_month_expenses (month TEXT PRIMARY KEY NOT NULL,revision INTEGER NOT NULL,external_expenses_cents INTEGER NOT NULL,recharge_treatment TEXT NOT NULL,updated_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS business_month_expenses_audit (month TEXT NOT NULL,revision INTEGER NOT NULL,external_expenses_cents INTEGER NOT NULL,recharge_treatment TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(month,revision))`,
];

// The Ads projector is deliberately shared with the browser. Embed it before
// this function when using .toString(); no server configuration is captured.
export function projectBusinessMonth(value){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'));
 const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const cent=(item,signed=false)=>item===null||int(item,signed?Number.MIN_SAFE_INTEGER:0);
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const covKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
 const codes=['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','TAX_POLICY_REQUIRED','FINANCIAL_SOURCE_STALE'];
 const keys=['schema','month','start_date','end_date','status','checked_at','progress','coverage','sales_cents','known_sales_cents','expected_repass_cents','known_expected_repass_cents','production_cost_cents','known_production_cost_cents','invoice_tax_cents','known_invoice_tax_cents','ads_adjustment_cents','ads','expenses','result','unmapped_variants','bindings_revision','costs_revision'];
 const safe=amount=>amount>=BigInt(Number.MIN_SAFE_INTEGER)&&amount<=BigInt(Number.MAX_SAFE_INTEGER)?Number(amount):null;
 try{
  if(plain(value)&&Object.hasOwn(value,'product_summary'))keys.push('product_summary');
  if(plain(value)&&Object.hasOwn(value,'tax'))keys.push('tax');
  if(plain(value)&&Object.hasOwn(value,'source_checked_at'))keys.push('source_checked_at');
  if(plain(value)&&Object.hasOwn(value,'cost_rules_revision'))keys.push('cost_rules_revision');
  if(plain(value)&&Object.hasOwn(value,'classification_revision'))keys.push('classification_revision');
  if(plain(value)&&Object.hasOwn(value,'collection'))keys.push('collection');
  if(!exact(value,keys)||value.schema!=='business_month_v1'||typeof value.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||!day(value.start_date)||value.start_date!==value.month+'-01'||!day(value.end_date)||value.end_date.slice(0,7)!==value.month||!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(value.status)||!int(value.checked_at,1,9999999999)||!int(value.bindings_revision,1,2147483647)||!int(value.costs_revision,1,2147483647)||!plain(value.progress)||!exact(value.coverage,covKeys))return null;
  const span=Number(value.end_date.slice(8)),p=value.progress,c=value.coverage;
  const hasCapacity=Object.hasOwn(p,'order_capacity');
  if(!exact(p,['windows_total','windows_complete','pages_read',...(hasCapacity?['order_capacity']:[])]))return null;
  const capacity=hasCapacity?p.order_capacity:p.pages_read*5;
  if(p.windows_total!==Math.ceil(span/15)||!int(p.windows_complete,0,p.windows_total)||!int(p.pages_read,0,p.windows_total*200)||!int(capacity,p.pages_read*5,p.pages_read*20)||(capacity-p.pages_read*5)%15!==0||!covKeys.every(key=>int(c[key],0,p.windows_total*1000))||c.orders!==c.paid+c.cancelled+c.cancel_pending+c.unpaid+c.other+c.unknown||c.paid!==c.completed+c.ongoing||c.payment_covered+c.payment_missing!==c.paid||c.returns+c.returns_unknown>c.paid||c.orders>capacity||value.status==='COMPLETE'&&p.windows_complete!==p.windows_total||value.status!=='COMPLETE'&&p.windows_complete===p.windows_total)return null;
  const currentDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000));
  if(value.end_date>currentDay)return null;
  if(Object.hasOwn(value,'cost_rules_revision')&&!int(value.cost_rules_revision,1,2147483646))return null;
  if(Object.hasOwn(value,'classification_revision')&&!int(value.classification_revision,1,2147483647))return null;
  let tax=null;
  if(Object.hasOwn(value,'tax')){
   tax=value.tax;
   if(!exact(tax,['schema','regime','year','policy_revision','monthly_das_cents','tax_cents','status','source','basis'])||tax.schema!=='business_month_tax_v1'||tax.regime!=='MEI'||tax.year!==Number(value.month.slice(0,4))||!int(tax.policy_revision,0,2147483647)||tax.basis!=='MONTHLY_COMPETENCE_NO_PRORATION')return null;
   if(tax.status==='DECLARED'){if(tax.source!=='OPERATOR_DECLARED_DAS'||!int(tax.monthly_das_cents,1,1000000)||tax.tax_cents!==tax.monthly_das_cents||tax.policy_revision<1||value.known_invoice_tax_cents!==tax.tax_cents)return null;}
   else if(tax.status!=='PENDING'||tax.source!=='DAS_REQUIRED'||tax.monthly_das_cents!==null||tax.tax_cents!==null||value.known_invoice_tax_cents!==null||value.invoice_tax_cents!==null)return null;
  }
  let sources=null;
  if(Object.hasOwn(value,'source_checked_at')){
   sources=value.source_checked_at;
   if(!exact(sources,['finance_oldest_at','finance_latest_at','ads_at'])||!Object.values(sources).every(at=>at===null||int(at,1,value.checked_at))||(sources.finance_oldest_at===null)!==(sources.finance_latest_at===null)||p.windows_complete>0&&sources.finance_oldest_at===null||sources.finance_oldest_at!==null&&sources.finance_oldest_at>sources.finance_latest_at||sources.ads_at!==(Object.getOwnPropertyDescriptor(value.ads||{},'fetched_at')?.value??null))return null;
  }
  for(const key of ['sales_cents','known_sales_cents','production_cost_cents','known_production_cost_cents','invoice_tax_cents','known_invoice_tax_cents'])if(!cent(value[key]))return null;
  for(const key of ['expected_repass_cents','known_expected_repass_cents','ads_adjustment_cents'])if(!cent(value[key],true))return null;
  if(!exact(value.expenses,['revision','external_expenses_cents','recharge_treatment','updated_at'])||!int(value.expenses.revision,0,2147483646)||!cent(value.expenses.external_expenses_cents)||!['UNCONFIRMED','ADS_RECHARGE','TECH_SUPPORT'].includes(value.expenses.recharge_treatment)||value.expenses.updated_at!==null&&(typeof value.expenses.updated_at!=='string'||!Number.isFinite(Date.parse(value.expenses.updated_at))))return null;
  const expense=value.expenses;
  if(expense.revision===0?(expense.external_expenses_cents!==null||expense.recharge_treatment!=='UNCONFIRMED'||expense.updated_at!==null):(expense.external_expenses_cents===null||expense.updated_at===null))return null;
  let ads=null;if(value.ads!==null){ads=projectAdsCalendar(value.ads);if(!ads||ads.start_date!==value.start_date||ads.end_date!==value.end_date||ads.fetched_at>value.checked_at+5)return null;}
  if(!array(value.unmapped_variants,3000))return null;
  const seen=new Set();for(const row of value.unmapped_variants){if(!exact(row,['item_id','model_id','quantity'])||typeof row.item_id!=='string'||!/^[1-9][0-9]{0,19}$/.test(row.item_id)||typeof row.model_id!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(row.model_id)||!int(row.quantity,1)||seen.has(row.item_id+':'+row.model_id))return null;seen.add(row.item_id+':'+row.model_id);}
  const result=value.result;
  if(!exact(result,['net_estimate_cents','net_profit_cents','net_margin_bps','pending','basis'])||!cent(result.net_estimate_cents,true)||result.net_profit_cents!==null||!cent(result.net_margin_bps,true)||result.basis!=='PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE'||!array(result.pending,codes.length)||new Set(result.pending).size!==result.pending.length||!result.pending.every(code=>codes.includes(code)))return null;
  const pending=result.pending,has=code=>pending.includes(code);
  let collection=null;
  if(Object.hasOwn(value,'collection')){
   collection=value.collection;
   const retryCodes=['BUSINESS_PERIOD_CHECKPOINT','BUSINESS_PERIOD_BUSY','BUSINESS_PERIOD_CONFLICT','BUSINESS_PERIOD_RATE_LIMIT','BUSINESS_PERIOD_TIMEOUT','BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE'],blockedCodes=['BUSINESS_PERIOD_AUTH_REQUIRED','BUSINESS_PERIOD_INVALID_SOURCE','BUSINESS_PERIOD_PERMISSION_DENIED'];
   if(!exact(collection,['schema','state','code','retry_after_seconds'])||collection.schema!=='business_month_collection_v1'||!['READY','RETRY_WAIT','BLOCKED'].includes(collection.state)||!int(collection.retry_after_seconds,0,1800))return null;
   if(collection.state==='READY'?(collection.code!==null||collection.retry_after_seconds!==0):collection.state==='RETRY_WAIT'?(!retryCodes.includes(collection.code)||collection.retry_after_seconds<1):(!blockedCodes.includes(collection.code)||collection.retry_after_seconds!==0))return null;
   const yielded=['BUSINESS_PERIOD_CHECKPOINT','BUSINESS_PERIOD_BUSY','BUSINESS_PERIOD_CONFLICT'].includes(collection.code);
   if(collection.state!=='READY'&&(yielded?has('SOURCE_UNAVAILABLE'):!has('SOURCE_UNAVAILABLE')))return null;
  }
  if(['known_sales_cents','known_expected_repass_cents','known_production_cost_cents',...(tax?.status==='PENDING'?[]:['known_invoice_tax_cents'])].some(key=>value[key]===null)&&!has('ARITHMETIC_UNSAFE'))return null;
  if(tax?.status==='PENDING'&&!has('TAX_POLICY_REQUIRED')||tax?.status!=='PENDING'&&has('TAX_POLICY_REQUIRED'))return null;
  if(sources&&value.month===currentDay.slice(0,7)&&sources.finance_oldest_at!==null&&value.checked_at-sources.finance_oldest_at>900&&!has('FINANCIAL_SOURCE_STALE'))return null;
  if(has('FINANCIAL_SOURCE_STALE')&&(!sources||sources.finance_oldest_at===null||value.month!==currentDay.slice(0,7)||value.checked_at-sources.finance_oldest_at<=900))return null;
  if(ads?.status==='AVAILABLE'&&value.checked_at-ads.fetched_at>900&&!has('ADS_UNAVAILABLE'))return null;
  if(value.status==='RUNNING'&&!has('COLLECTING')||value.status==='LIMIT_REACHED'&&!has('PERIOD_LIMIT_REACHED')||c.cancel_pending+c.other+c.unknown>0&&!has('STATUS_REVIEW_REQUIRED')||c.payment_missing>0&&!has('PAYMENT_INCOMPLETE')||c.returns+c.returns_unknown>0&&!has('RETURNS_NOT_RECONCILED')||value.production_cost_cents===null&&!has('PRODUCTION_COST_INCOMPLETE')||value.invoice_tax_cents===null&&!has('INVOICE_TAX_UNAVAILABLE')||ads?.status!=='AVAILABLE'&&!has('ADS_UNAVAILABLE')||expense.external_expenses_cents===null&&!has('EXTERNAL_EXPENSES_REQUIRED')||(value.ads_adjustment_cents===null||value.ads_adjustment_cents<0)&&!has('ADJUSTMENT_UNAVAILABLE'))return null;
  // Incomplete or unclassified population cannot release any monthly total.
  if(value.status!=='COMPLETE'&&['sales_cents','expected_repass_cents','production_cost_cents','invoice_tax_cents','ads_adjustment_cents'].some(key=>value[key]!==null))return null;
  for(const [total,known] of [['sales_cents','known_sales_cents'],['expected_repass_cents','known_expected_repass_cents'],['production_cost_cents','known_production_cost_cents'],['invoice_tax_cents','known_invoice_tax_cents']])if(value[total]!==null&&value[total]!==value[known])return null;
  if(value.unmapped_variants.length&&value.production_cost_cents!==null||c.payment_missing>0&&['sales_cents','expected_repass_cents',...(tax?[]:['invoice_tax_cents']),'ads_adjustment_cents'].some(key=>value[key]!==null))return null;
  if(value.ads_adjustment_cents>0&&expense.recharge_treatment==='UNCONFIRMED'&&!has('RECHARGE_TREATMENT_REQUIRED'))return null;
  const canCalculate=value.status==='COMPLETE'&&!pending.length&&value.sales_cents!==null&&value.expected_repass_cents!==null&&value.production_cost_cents!==null&&value.invoice_tax_cents!==null&&value.ads_adjustment_cents!==null&&value.ads_adjustment_cents>=0&&ads?.status==='AVAILABLE'&&expense.external_expenses_cents!==null;
  let expected=null,margin=null;
  if(canCalculate){const addBack=expense.recharge_treatment==='ADS_RECHARGE'?value.ads_adjustment_cents:0;expected=safe(BigInt(value.expected_repass_cents)-BigInt(value.production_cost_cents)-BigInt(value.invoice_tax_cents)+BigInt(addBack)-BigInt(ads.expense_cents)-BigInt(expense.external_expenses_cents));if(expected===null)return null;if(value.sales_cents>0)margin=safe(BigInt(expected)*10000n/BigInt(value.sales_cents));}
  if(result.net_estimate_cents!==expected||result.net_margin_bps!==margin)return null;
  let products=null;if(Object.hasOwn(value,'product_summary')&&value.product_summary!==null){products=projectBusinessMonthProducts(value.product_summary,value);if(!products)return null;}
  return Object.fromEntries(keys.map(key=>[key,key==='progress'?{...p}:key==='coverage'?{...c}:key==='expenses'?{...expense}:key==='tax'?{...tax}:key==='source_checked_at'?{...sources}:key==='collection'?{...collection}:key==='ads'?ads:key==='product_summary'?products:key==='result'?{...result,pending:[...pending]}:key==='unmapped_variants'?value.unmapped_variants.map(row=>({...row})):value[key]]));
 }catch{return null;}
}

const businessMonthCoverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
const businessMonthReady=new WeakSet();
const businessMonthFail=(code,status=400)=>{throw new BusinessMonthError(code,status);};
const businessMonthPlain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const businessMonthExact=(value,keys)=>businessMonthPlain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const businessMonthSafe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
function businessMonthCents(raw){
 if(typeof raw!=='string'||raw.length>32)return null;const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(raw);if(!match)return null;
 let amount=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));if(match[1])amount=-amount;return amount;
}
function businessMonthRange(month,stamp){
 if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return null;
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
 if(month>today.slice(0,7)||month<'2000-01')return null;
 const start=month+'-01',last=new Date(Date.parse(start+'T00:00:00Z')+32*86400000);last.setUTCDate(0);
 const end=month===today.slice(0,7)?today:last.toISOString().slice(0,10),slots=[];
 for(let day=1;day<=Number(end.slice(8));day+=15)slots.push({start_date:month+'-'+String(day).padStart(2,'0'),end_date:month+'-'+String(Math.min(day+14,Number(end.slice(8)))).padStart(2,'0'),frame:null});
 return {start_date:start,end_date:end,slots,current:month===today.slice(0,7)};
}

// Each call performs at most one private financial step. The caller can show
// progress between steps without keeping an unbounded Worker request alive.
export async function businessMonth(env,input,services,options={}){
 try{return await businessMonthOperation(env,input,services,options);}
 catch(error){if(error instanceof BusinessMonthError)throw error;throw new BusinessMonthError('BUSINESS_MONTH_UNAVAILABLE',503);}
}

// Owner reads never advance the provider. The published finance cohort owns
// immutable source copies; current costs are applied again on every read.
export async function readBusinessMonthDisplay(env,{month},{now=()=>Date.now()}={}){
 const active=await businessMonth(env,{operation:'read',month},{},{now});
 const stamp=Math.floor(now()/1000),db=env.ADMIN_DB,range=businessMonthRange(month,stamp);
 const observed=await businessMonthLoadRun(db,month,range,stamp);
 let published=await readCompletedBusinessMonth(env,month,{now});
 // Bootstrap a completed pre-publication deployment without waiting for a
 // provider refresh. A concurrent collector cannot publish a stale CAS view.
 if(observed?.complete&&(!published||published.row.revision<observed.row.revision)){
  published=await saveCompletedBusinessMonth(env,month,observed,{now})||await readCompletedBusinessMonth(env,month,{now});
 }
 if(!published)return {display:active,active,display_source:'ACTIVE',audit_scope:null};
 const savedRange={start_date:published.payload.start_date,end_date:published.payload.end_date,slots:published.payload.slots,current:range.current};
 const display=await businessMonthBundle(db,month,savedRange,stamp,published);
 // Carry the exact publication used for the displayed calculation. Aggregated
 // dates, order counts and money can coincide across different source runs.
 const audit_scope={publication_revision:published.publication.source_revision,start_date:published.payload.start_date,end_date:published.payload.end_date,sources:published.payload.slots.map(slot=>({run_id:slot.frame.run_id,source_revision:slot.frame.revision,start_date:slot.start_date,end_date:slot.end_date}))};
 return {display,active,display_source:'PUBLISHED',audit_scope};
}
async function businessMonthOperation(env,input,services,{now=()=>Date.now(),actor='admin',onProductsDiscovered=null}={}){
 let stamp;try{const clock=now();if(!Number.isSafeInteger(clock)||clock<=0)throw Error();stamp=Math.floor(clock/1000);}catch{businessMonthFail('BUSINESS_MONTH_CLOCK',503);}
 if(!env?.ADMIN_DB||typeof env.ADMIN_DB.batch!=='function'||!businessMonthPlain(input)||onProductsDiscovered!==null&&typeof onProductsDiscovered!=='function')businessMonthFail('BUSINESS_MONTH_CONFIGURATION',503);
 const operation=Object.getOwnPropertyDescriptor(input,'operation')?.value;
 const expenseOperation=operation==='expenses';
 if(!businessMonthExact(input,expenseOperation?['operation','month','revision','external_expenses_cents','recharge_treatment']:['operation','month'])||!['start','step','read','ads','expenses'].includes(operation))businessMonthFail('BUSINESS_MONTH_REQUEST_INVALID');
 const range=businessMonthRange(input.month,stamp);if(!range)businessMonthFail('BUSINESS_MONTH_REQUEST_INVALID');
 const db=env.ADMIN_DB;
 if(!businessMonthReady.has(db)){await db.batch(BUSINESS_MONTH_SCHEMA.map(sql=>db.prepare(sql)));businessMonthReady.add(db);}
 if(expenseOperation)await businessMonthSaveExpenses(db,input,actor,stamp);
 let observed=await businessMonthLoadRun(db,input.month,range,stamp,true);
 const legacyProducts=observed?.complete&&observed.payload.slots.some(slot=>!Object.hasOwn(slot.frame,'product_breakdown'));
 if(!observed||observed.payload.end_date!==range.end_date||operation==='start'&&observed.complete&&(legacyProducts||stamp-observed.row.created_at>(range.current?60:900))){
  if(operation!=='start'&&operation!=='read'&&operation!=='ads'&&!expenseOperation)businessMonthFail('BUSINESS_MONTH_START_REQUIRED',409);
  observed=await businessMonthCreateRun(db,input.month,range,stamp,observed);
 }
 let result=null;
 try{
  if(operation==='start'||operation==='step')observed=await businessMonthAdvance(env,db,input.month,range,stamp,observed,services);
  if(operation==='ads')await businessMonthRefreshAds(env,db,input.month,range,stamp,services,now);
  result=await businessMonthBundle(db,input.month,range,stamp,observed);return result;
 }finally{
  // Discovery uses every validated imported item, including already priced
  // products in a partial month. An independent catalogue queue failure must
  // not discard a valid financial result or replace its original source error.
  if(onProductsDiscovered){
   const itemIds=[...new Set(observed.payload.slots.flatMap(slot=>slot.frame?.items.map(row=>row.item_id)||[]))];
   const priorityItemIds=[...new Set((result?.unmapped_variants||[]).map(row=>row.item_id))];
   try{await onProductsDiscovered(itemIds,{priorityItemIds,unmappedVariants:result?.unmapped_variants||[]});}catch{}
  }
 }
}

// Refresh cadence and validity are different: a sixty-second refresh interval
// must not erase a proven Ads amount when a local cost calculation reads it.
function businessMonthAdsRead(cached,attempt,range,stamp){
 let retained=null,latest=null;
 if(cached){try{retained=projectAdsCalendar(JSON.parse(cached.payload));}catch{}if(!retained||retained.fetched_at!==cached.updated_at||retained.fetched_at>stamp+60)businessMonthFail('BUSINESS_MONTH_ADS_CACHE_INVALID',503);}
 if(attempt){
  if(!['AVAILABLE','PARTIAL','UNAVAILABLE','ERROR'].includes(attempt.status)||!Number.isSafeInteger(attempt.attempted_at)||attempt.attempted_at<1||!Number.isSafeInteger(attempt.completed_at)||attempt.completed_at<attempt.attempted_at||attempt.completed_at>stamp+60||!businessMonthRange(attempt.start_date.slice(0,7),stamp)||attempt.start_date.slice(0,7)!==attempt.end_date.slice(0,7)||attempt.diagnostic!==null&&!['ADS_CALENDAR_CONFIGURATION','ADS_CALENDAR_UNAVAILABLE','ADS_CALENDAR_DATE_COVERAGE_PARTIAL','ADS_CALENDAR_EXPENSE_INVALID','ADS_CALENDAR_ARITHMETIC_UNSAFE','BUSINESS_MONTH_ADS_UNAVAILABLE','BUSINESS_MONTH_ADS_INVALID'].includes(attempt.diagnostic))businessMonthFail('BUSINESS_MONTH_ADS_CACHE_INVALID',503);
  if(attempt.payload!==null){try{latest=projectAdsCalendar(JSON.parse(attempt.payload));}catch{}if(!latest||latest.status!==attempt.status||latest.start_date!==attempt.start_date||latest.end_date!==attempt.end_date||latest.fetched_at>attempt.completed_at+60)businessMonthFail('BUSINESS_MONTH_ADS_CACHE_INVALID',503);}
  else if(attempt.status!=='ERROR')businessMonthFail('BUSINESS_MONTH_ADS_CACHE_INVALID',503);
 }
 const matches=report=>report&&report.start_date===range.start_date&&report.end_date===range.end_date;
 const good=retained?.status==='AVAILABLE'?retained:null,matchingGood=matches(good)?good:null,attemptMatches=attempt?.start_date===range.start_date&&attempt.end_date===range.end_date;
 const ads=matchingGood||(matches(latest)?latest:matches(retained)?retained:null);
 const failed=attemptMatches&&attempt.status!=='AVAILABLE'&&(!matchingGood||attempt.attempted_at>=matchingGood.fetched_at);
 const age=ads?Math.max(0,stamp-ads.fetched_at):null,fresh=ads?.status==='AVAILABLE'&&age<=900&&!failed;
 const state=fresh?'FRESH':failed?(attempt.status==='PARTIAL'?'PARTIAL':attempt.status==='UNAVAILABLE'?'UNAVAILABLE':'FAILED'):ads?.status==='AVAILABLE'?'STALE':ads?.status==='PARTIAL'?'PARTIAL':ads?.status==='UNAVAILABLE'?'UNAVAILABLE':retained?'SCOPE_MISMATCH':'MISSING';
 return {ads,fresh,observation:{state,age_seconds:age,last_success_at:good?.fetched_at??null,last_success_scope:good?{start_date:good.start_date,end_date:good.end_date}:null,last_attempt_at:attemptMatches?attempt.completed_at:null,last_attempt_status:attemptMatches?attempt.status:null,diagnostic:failed?attempt.diagnostic:ads?.diagnostic??null}};
}
async function businessMonthRefreshAds(env,db,month,range,stamp,services,now){
 let report=null,status='ERROR',diagnostic='BUSINESS_MONTH_ADS_UNAVAILABLE';
 try{
  if(typeof services?.getAdsCalendar!=='function')throw Error();report=projectAdsCalendar(await services.getAdsCalendar(env,{start_date:range.start_date,end_date:range.end_date}));
  const finished=Math.max(stamp,Math.floor(now()/1000));
  if(!report||report.start_date!==range.start_date||report.end_date!==range.end_date||report.fetched_at>finished+60||finished-report.fetched_at>(range.current?60:900)){report=null;diagnostic='BUSINESS_MONTH_ADS_INVALID';}
  else{status=report.status;diagnostic=report.diagnostic;}
 }catch(error){if(Object.getOwnPropertyDescriptor(error||{},'code')?.value==='BUSINESS_MONTH_ADS_SKIPPED')throw error;report=null;}
 const completed=Math.max(stamp,Math.floor(now()/1000));if(!Number.isSafeInteger(completed)||completed>9999999999)businessMonthFail('BUSINESS_MONTH_CLOCK',503);
 const writes=report?.status==='AVAILABLE'?businessMonthAdsHistoryStatements(db,month,report,completed):[];
 // Keep the last complete amount on failure. A partial report is useful only
 // when a complete report has never been stored for this exact date cohort.
 if(report)writes.push(db.prepare(`INSERT INTO business_month_ads(month,payload,updated_at) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at
 WHERE business_month_ads.updated_at<=excluded.updated_at AND (json_extract(excluded.payload,'$.status')='AVAILABLE' OR json_extract(business_month_ads.payload,'$.status')<>'AVAILABLE')`).bind(month,JSON.stringify(report),report.fetched_at));
 writes.push(db.prepare('INSERT INTO business_month_ads_attempts(month,start_date,end_date,attempted_at,completed_at,status,diagnostic,payload) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(month) DO UPDATE SET start_date=excluded.start_date,end_date=excluded.end_date,attempted_at=excluded.attempted_at,completed_at=excluded.completed_at,status=excluded.status,diagnostic=excluded.diagnostic,payload=excluded.payload WHERE business_month_ads_attempts.attempted_at<=excluded.attempted_at').bind(month,range.start_date,range.end_date,stamp,completed,status,diagnostic,report?JSON.stringify(report):null));
 await db.batch(writes);
}

// Separate finite diagnostics preserve the exact monthly v1/v2 response shape.
// This read never refreshes Ads, orders or payments and never changes source age.
export async function readBusinessMonthAdsState(env,month,{now=()=>Date.now()}={}){
 const value=now(),stamp=Number.isSafeInteger(value)&&value>0?Math.floor(value/1000):null,range=stamp?businessMonthRange(month,stamp):null;
 if(!range)businessMonthFail('BUSINESS_MONTH_REQUEST_INVALID');const db=env?.ADMIN_DB;if(!db?.batch)businessMonthFail('BUSINESS_MONTH_CONFIGURATION',503);
 if(!businessMonthReady.has(db)){await db.batch(BUSINESS_MONTH_SCHEMA.map(sql=>db.prepare(sql)));businessMonthReady.add(db);}
 const rows=await db.batch([db.prepare('SELECT payload,updated_at FROM business_month_ads WHERE month=?').bind(month),db.prepare('SELECT * FROM business_month_ads_attempts WHERE month=?').bind(month)]),state=businessMonthAdsRead(rows[0].results[0],rows[1].results[0],range,stamp);
 return {schema:'business_month_ads_state_v1',month,start_date:range.start_date,end_date:range.end_date,checked_at:stamp,...state.observation,refresh_due:state.observation.age_seconds===null||state.observation.age_seconds>=60||!state.fresh,unit_confirmation:'OPERATOR_CONFIRMED_BRL_2026_10_20'};
}

async function businessMonthSaveExpenses(db,input,actor,stamp){
 if(!Number.isSafeInteger(input.revision)||Object.is(input.revision,-0)||input.revision<0||input.revision>=2147483646||!Number.isSafeInteger(input.external_expenses_cents)||Object.is(input.external_expenses_cents,-0)||input.external_expenses_cents<0||!['UNCONFIRMED','ADS_RECHARGE','TECH_SUPPORT'].includes(input.recharge_treatment)||typeof actor!=='string'||actor.length<1||actor.length>256)businessMonthFail('BUSINESS_MONTH_EXPENSES_INVALID');
 const time=new Date(stamp*1000).toISOString();
 const mutation=input.revision===0?db.prepare('INSERT OR IGNORE INTO business_month_expenses(month,revision,external_expenses_cents,recharge_treatment,updated_at) SELECT ?,1,?,?,? WHERE NOT EXISTS (SELECT 1 FROM business_expense_ledger_months WHERE month=?)').bind(input.month,input.external_expenses_cents,input.recharge_treatment,time,input.month):db.prepare('UPDATE business_month_expenses SET revision=revision+1,external_expenses_cents=?,recharge_treatment=?,updated_at=? WHERE month=? AND revision=? AND NOT EXISTS (SELECT 1 FROM business_expense_ledger_months WHERE month=?)').bind(input.external_expenses_cents,input.recharge_treatment,time,input.month,input.revision,input.month);
 const results=await db.batch([mutation,db.prepare('INSERT INTO business_month_expenses_audit(month,revision,external_expenses_cents,recharge_treatment,actor,created_at) SELECT month,revision,external_expenses_cents,recharge_treatment,?,updated_at FROM business_month_expenses WHERE changes()=1 AND month=? AND revision=? AND external_expenses_cents=? AND recharge_treatment=? AND updated_at=?').bind(actor,input.month,input.revision+1,input.external_expenses_cents,input.recharge_treatment,time)]);
 if(results[0].meta.changes!==1){if(await db.prepare('SELECT 1 AS present FROM business_expense_ledger_months WHERE month=?').bind(input.month).first())businessMonthFail('BUSINESS_MONTH_EXPENSES_MANAGED',409);businessMonthFail('BUSINESS_MONTH_EXPENSES_CHANGED_RELOAD',409);}
 if(results[1].meta.changes!==1)businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);
}

async function businessMonthLoadRun(db,month,range,stamp,allowPreviousScope=false){
 // Stable slot rows and their parent references must share one read snapshot.
 // Otherwise a concurrent step could replace a slot between these two reads.
 const snapshot=await db.batch([
  db.prepare('SELECT revision,payload,created_at,updated_at FROM business_month_runs WHERE month=?').bind(month),
  db.prepare('SELECT slot_index,run_id,revision,payload FROM business_month_frames WHERE month=? ORDER BY slot_index').bind(month),
 ]);
 const row=snapshot[0].results[0];
 if(!row)return null;
 let payload;try{payload=JSON.parse(row.payload);}catch{businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);}
 if(!Number.isSafeInteger(row.revision)||row.revision<1||!Number.isSafeInteger(row.created_at)||row.created_at>stamp+5||!Number.isSafeInteger(row.updated_at)||row.updated_at<row.created_at||!businessMonthExact(payload,['start_date','end_date','slots'])||!Array.isArray(payload.slots)||payload.slots.length>3)businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);
 if(payload.start_date!==range.start_date)return null;
 if(payload.end_date!==range.end_date){
  // Preserve yesterday's completed cohort before creating today's collector.
  // The original read snapshot already contains all of its source frames.
  if(!allowPreviousScope||typeof payload.end_date!=='string'||payload.end_date.slice(0,7)!==month||payload.end_date>=range.end_date||!/^\d{4}-\d{2}-\d{2}$/.test(payload.end_date)||new Date(payload.end_date+'T00:00:00Z').toISOString().slice(0,10)!==payload.end_date)return null;
  const slots=[];for(let day=1;day<=Number(payload.end_date.slice(8));day+=15)slots.push({start_date:month+'-'+String(day).padStart(2,'0'),end_date:month+'-'+String(Math.min(day+14,Number(payload.end_date.slice(8)))).padStart(2,'0'),frame:null});
  range={...range,end_date:payload.end_date,slots};
 }
 const ids=new Set(),storedFrames=new Map(),referenced=new Set();
 if(!Array.isArray(snapshot[1].results)||snapshot[1].results.length>3)businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);
 for(const stored of snapshot[1].results){
  if(!Number.isInteger(stored.slot_index)||stored.slot_index<0||stored.slot_index>2||storedFrames.has(stored.slot_index)||typeof stored.payload!=='string'||new TextEncoder().encode(stored.payload).byteLength>1048576)businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);
  storedFrames.set(stored.slot_index,stored);
 }
 if(payload.slots.length!==range.slots.length)businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);
 const slots=payload.slots.map((slot,index)=>{
  const expected=range.slots[index];
  if(!businessMonthExact(slot,['start_date','end_date','frame'])||slot.start_date!==expected.start_date||slot.end_date!==expected.end_date)businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);
  let source=slot.frame;
  if(businessMonthPlain(source)&&source.schema==='business_month_frame_ref_v1'){
   if(!businessMonthExact(source,['schema','run_id','revision']))businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);
   const stored=storedFrames.get(index);
   if(!stored||stored.run_id!==source.run_id||stored.revision!==source.revision)businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);
   try{source=JSON.parse(stored.payload);}catch{businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);}
   if(source?.run_id!==stored.run_id||source?.revision!==stored.revision)businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);
   referenced.add(index);
  }
  const frame=source===null?null:projectBusinessPeriodFrame(source);
  if(slot.frame!==null&&(!frame||frame.start_date!==slot.start_date||frame.end_date!==slot.end_date||frame.checked_at>stamp+5||ids.has(frame.run_id)))businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);
  if(frame)ids.add(frame.run_id);return {...expected,frame};
 });
 if(referenced.size!==storedFrames.size)businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);
 return {row,storedPayload:payload,payload:{start_date:range.start_date,end_date:range.end_date,slots},complete:slots.every(slot=>slot.frame?.status==='COMPLETE')};
}
async function businessMonthCreateRun(db,month,range,stamp,observed){
 const payload=JSON.stringify({start_date:range.start_date,end_date:range.end_date,slots:range.slots});
 const mutation=observed?db.prepare('UPDATE business_month_runs SET revision=revision+1,payload=?,created_at=?,updated_at=? WHERE month=? AND revision=? AND payload=?').bind(payload,stamp,stamp,month,observed.row.revision,observed.row.payload):db.prepare('INSERT INTO business_month_runs(month,revision,payload,created_at,updated_at) VALUES(?,1,?,?,?) ON CONFLICT(month) DO UPDATE SET revision=business_month_runs.revision+1,payload=excluded.payload,created_at=excluded.created_at,updated_at=excluded.updated_at WHERE business_month_runs.payload NOT LIKE ?').bind(month,payload,stamp,stamp,'%"end_date":"'+range.end_date+'"%');
 await db.batch([...completedBusinessMonthPublicationStatements(db,month,observed,{now:()=>stamp*1000}),mutation,db.prepare('DELETE FROM business_month_frames WHERE month=? AND changes()=1').bind(month)]);
 const latest=await businessMonthLoadRun(db,month,range,stamp);if(!latest)businessMonthFail('BUSINESS_MONTH_CHANGED_RELOAD',409);return latest;
}
async function businessMonthAdvance(env,db,month,range,stamp,observed,services){
 const index=observed.payload.slots.findIndex(slot=>slot.frame===null||slot.frame.status==='RUNNING');
 if(index<0||observed.payload.slots.some(slot=>slot.frame?.status==='LIMIT_REACHED'))return observed;
 if(typeof services?.getFinanceBusinessPeriod!=='function')businessMonthFail('BUSINESS_MONTH_SOURCE_UNAVAILABLE',503);
 const slot=observed.payload.slots[index],selection=slot.frame?{operation:'step',run_id:slot.frame.run_id}:{operation:'start',start_date:slot.start_date,end_date:slot.end_date};
 let source;try{source=await services.getFinanceBusinessPeriod(env,selection);}catch{businessMonthFail('BUSINESS_MONTH_SOURCE_UNAVAILABLE',503);}
 // Only this exact, bounded envelope can turn a private transport failure into
 // an owner-facing code. Provider text and unknown fields never cross here.
 if(businessMonthExact(source,['schema','status','diagnostic'])&&source.schema==='finance_business_period_v1'&&source.status==='UNAVAILABLE'){
  const diagnostic=source.diagnostic,codes=['UNAVAILABLE','CONFIGURATION','NETWORK_ERROR','TIMEOUT','HTTP_ERROR','REDIRECT_REJECTED','CONTENT_TYPE_INVALID','BODY_LIMIT','BODY_READ_ERROR','JSON_INVALID','FRAME_INVALID','SCOPE_MISMATCH','RESPONSE_INVALID'];
  if(businessMonthExact(diagnostic,['code','http'])&&typeof diagnostic.code==='string'&&codes.some(suffix=>diagnostic.code==='FINANCE_BUSINESS_'+suffix)&&(diagnostic.http===null||Number.isInteger(diagnostic.http)&&diagnostic.http>=100&&diagnostic.http<=599)){
   let suffix=diagnostic.code.slice('FINANCE_BUSINESS_'.length);
   if(suffix==='HTTP_ERROR'&&[400,401,403,404,408,409,429,500,502,503,504].includes(diagnostic.http))suffix='HTTP_'+diagnostic.http;
   throw new BusinessMonthError('BUSINESS_MONTH_SOURCE_'+suffix,503,{code:diagnostic.code,http:diagnostic.http});
  }
  businessMonthFail('BUSINESS_MONTH_SOURCE_UNAVAILABLE',503);
 }
 const frame=projectBusinessPeriodFrame(source);
 if(!frame||frame.start_date!==slot.start_date||frame.end_date!==slot.end_date||frame.checked_at>stamp+60||slot.frame&&(frame.run_id!==slot.frame.run_id||frame.revision<slot.frame.revision)||observed.payload.slots.some((entry,position)=>position!==index&&entry.frame?.run_id===frame.run_id))businessMonthFail('BUSINESS_MONTH_SOURCE_INVALID',503);
 const payload={...observed.payload,slots:observed.payload.slots.map((entry,position)=>position===index?{...entry,frame}:entry)};
 // Full frames each fit one bounded row. The parent keeps only three compact
 // references, so a legal month cannot exceed D1's per-value size limit.
 const writes=[],storedPayload={...payload,slots:payload.slots.map((entry,position)=>{
  if(entry.frame===null)return entry;
  const next=entry.frame,reference={schema:'business_month_frame_ref_v1',run_id:next.run_id,revision:next.revision};
  if(position===index||observed.storedPayload.slots[position].frame?.schema!=='business_month_frame_ref_v1'){
   const raw=JSON.stringify(next);if(new TextEncoder().encode(raw).byteLength>1048576)businessMonthFail('BUSINESS_MONTH_SOURCE_INVALID',503);
   writes.push(db.prepare('INSERT INTO business_month_frames(month,slot_index,run_id,revision,payload) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM business_month_runs WHERE month=? AND revision=? AND payload=?) ON CONFLICT(month,slot_index) DO UPDATE SET run_id=excluded.run_id,revision=excluded.revision,payload=excluded.payload').bind(month,position,next.run_id,next.revision,raw,month,observed.row.revision,observed.row.payload));
  }
  return {...entry,frame:reference};
 })};
 const raw=JSON.stringify(storedPayload),updatedAt=Math.max(stamp,frame.checked_at),parentIndex=writes.length;
 writes.push(db.prepare('UPDATE business_month_runs SET revision=revision+1,payload=?,updated_at=? WHERE month=? AND revision=? AND payload=?').bind(raw,updatedAt,month,observed.row.revision,observed.row.payload));
 const next={row:{revision:observed.row.revision+1,payload:raw,created_at:observed.row.created_at,updated_at:updatedAt},storedPayload,payload,complete:payload.slots.every(slot=>slot.frame?.status==='COMPLETE')};
 writes.push(...completedBusinessMonthPublicationStatements(db,month,next,{now:()=>updatedAt*1000}));
 const written=(await db.batch(writes))[parentIndex];
 if(written.meta.changes!==1){const latest=await businessMonthLoadRun(db,month,range,Math.max(stamp,frame.checked_at));if(!latest)businessMonthFail('BUSINESS_MONTH_CHANGED_RELOAD',409);return latest;}
 return businessMonthLoadRun(db,month,range,Math.max(stamp,frame.checked_at));
}

async function businessMonthBundle(db,month,range,stamp,observed){
 const year=Number(month.slice(0,4));
 const sourceItems=observed.payload.slots.flatMap(slot=>slot.frame?.items||[]),itemIds=sourceItems.map(row=>row.item_id);
 const ruleQueries=costRuleSnapshotQueries(db,itemIds),classificationQueries=catalogClassificationQueries(db,itemIds,sourceItems);
 const rows=await db.batch([
  db.prepare('SELECT revision,payload,updated_at FROM variant_bindings_state WHERE id=1'),
  db.prepare('SELECT revision,payload,updated_at FROM production_costs_state WHERE id=1'),
  db.prepare('SELECT saved.revision,saved.external_expenses_cents,saved.recharge_treatment,saved.updated_at,ledger.mode AS ledger_mode FROM (SELECT ? AS month) AS selected LEFT JOIN business_month_expenses AS saved ON saved.month=selected.month LEFT JOIN business_expense_ledger_months AS ledger ON ledger.month=selected.month').bind(month),
  db.prepare('SELECT payload,updated_at FROM business_month_ads WHERE month=?').bind(month),
  ...ruleQueries,...classificationQueries,
  ...businessMonthAdsHistoryQueries(db,month,range),
  db.prepare('SELECT * FROM business_month_ads_attempts WHERE month=?').bind(month),
  db.prepare('SELECT revision,payload,updated_at FROM business_tax_policy_state WHERE year=?').bind(year),
  db.prepare('SELECT revision FROM business_tax_policy_audit WHERE year=? LIMIT 1').bind(year),
 ]);
 let bindings,costs,expense,taxPolicy,ads=null,adsFresh=false,expensesDraft=false;
 try{
  const b=rows[0].results[0],c=rows[1].results[0];if(!b||!c||!Number.isSafeInteger(b.revision)||b.revision<1||!Number.isSafeInteger(c.revision)||c.revision<1)throw Error();
  bindings={revision:b.revision,bindings:validateVariantBindings(JSON.parse(b.payload))};costs={revision:c.revision,values:validateProductionCosts(JSON.parse(c.payload))};
  const expenseRow=rows[2].results[0];expensesDraft=expenseRow?.ledger_mode==='DRAFT';
  if(expenseRow?.ledger_mode!==null&&expenseRow?.ledger_mode!==undefined&&!['DRAFT','CONFIRMED'].includes(expenseRow.ledger_mode))throw Error();
  expense=expenseRow?.revision!==null&&expenseRow?.revision!==undefined?{revision:expenseRow.revision,external_expenses_cents:expenseRow.external_expenses_cents,recharge_treatment:expenseRow.recharge_treatment,updated_at:expenseRow.updated_at}:{revision:0,external_expenses_cents:null,recharge_treatment:'UNCONFIRMED',updated_at:null};
  let observedAds=businessMonthAdsRead(rows[3].results[0],rows.at(-3).results[0],range,stamp);
  const retained=rows[3].results[0]?JSON.parse(rows[3].results[0].payload):null;
  if(rows.at(-4).results[0]&&!(retained?.status==='AVAILABLE'&&retained.start_date===range.start_date&&retained.end_date===range.end_date))observedAds=businessMonthAdsRead(rows.at(-4).results[0],rows.at(-3).results[0],range,stamp);
  ads=observedAds.ads;adsFresh=observedAds.fresh;
  taxPolicy=businessMonthTax(businessTaxPolicyFromSnapshot(rows.at(-2).results[0],rows.at(-1).results[0],year),month);
 }catch{businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);}
 const frames=observed.payload.slots.flatMap(slot=>slot.frame?[slot.frame]:[]),complete=frames.length===range.slots.length&&frames.every(frame=>frame.status==='COMPLETE'),limited=frames.some(frame=>frame.status==='LIMIT_REACHED');
 const coverage=Object.fromEntries(businessMonthCoverageKeys.map(key=>[key,frames.reduce((sum,frame)=>sum+frame.coverage[key],0)]));
 // A held lease or a deliberately bounded checkpoint is normal progress.
 // Only a provider failure blocks this cohort as SOURCE_UNAVAILABLE.
 const waits={BUSINESS_PERIOD_CHECKPOINT:1,BUSINESS_PERIOD_BUSY:2,BUSINESS_PERIOD_CONFLICT:2,BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE:10,BUSINESS_PERIOD_TIMEOUT:5,BUSINESS_PERIOD_RATE_LIMIT:30};
 const blocked=['BUSINESS_PERIOD_AUTH_REQUIRED','BUSINESS_PERIOD_INVALID_SOURCE','BUSINESS_PERIOD_PERMISSION_DENIED'],yielded=['BUSINESS_PERIOD_CHECKPOINT','BUSINESS_PERIOD_BUSY','BUSINESS_PERIOD_CONFLICT'];
 const diagnostics=frames.map(frame=>frame.diagnostic).filter(code=>code!==null);
 const blocking=diagnostics.find(code=>blocked.includes(code)),provider=diagnostics.filter(code=>!yielded.includes(code)),retry=provider.sort((a,b)=>(waits[b]||0)-(waits[a]||0))[0]||diagnostics.sort((a,b)=>(waits[b]||0)-(waits[a]||0))[0];
 const collection=blocking?{schema:'business_month_collection_v1',state:'BLOCKED',code:blocking,retry_after_seconds:0}:retry?{schema:'business_month_collection_v1',state:'RETRY_WAIT',code:retry,retry_after_seconds:waits[retry]}:{schema:'business_month_collection_v1',state:'READY',code:null,retry_after_seconds:0};
 const pending=[];if(!complete)pending.push(limited?'PERIOD_LIMIT_REACHED':'COLLECTING');if(provider.length)pending.push('SOURCE_UNAVAILABLE');if(coverage.cancel_pending+coverage.other+coverage.unknown>0)pending.push('STATUS_REVIEW_REQUIRED');if(coverage.payment_missing>0)pending.push('PAYMENT_INCOMPLETE');if(coverage.returns+coverage.returns_unknown>0)pending.push('RETURNS_NOT_RECONCILED');
 const sum=field=>{let amount=0n;for(const frame of frames){const cents=businessMonthCents(frame[field]);if(cents===null)return null;amount+=cents;}return businessMonthSafe(amount);};
 const knownSales=sum('known_sales_base_raw'),knownPayout=sum('known_expected_repass_raw'),knownAdjustment=sum('known_ads_adjustment_raw');
 // MEI DAS belongs to the month, including a month without sales. The old
 // per-order 2% estimates remain in immutable Finance frames, but are not used.
 const knownTax=taxPolicy.tax_cents;
 const map=new Map();let invalidQuantity=false;
 for(const frame of frames)for(const row of frame.items){const key=row.item_id+':'+row.model_id,previous=map.get(key),quantity=(previous?.quantity||0)+row.quantity;if(!Number.isSafeInteger(quantity))invalidQuantity=true;else map.set(key,{...row,quantity});}
 const items=[...map.values()],unmapped=[],variantReferences=[];let productionKnown=0n,productionComplete=true;
 const automaticCosts=mergeCatalogCostReference(costRuleReferenceFromSnapshot(rows.slice(4,4+ruleQueries.length),{now:()=>stamp*1000}),catalogClassificationsFromSnapshot(rows.slice(4+ruleQueries.length,4+ruleQueries.length+classificationQueries.length)));
 if(invalidQuantity)productionComplete=false;
 // The cost helper is bounded per batch; all batches use the same snapshots.
 try{for(let index=0;index<items.length;index+=1000){const ref=productionCostReference({status:'AVAILABLE',rows:items.slice(index,index+1000)},bindings,costs,automaticCosts);variantReferences.push(...ref.variants);productionKnown+=BigInt(ref.known_subset_cents);if(ref.total_cents===null)productionComplete=false;for(const row of ref.variants)if(row.unit_cost_cents===null)unmapped.push({item_id:row.item_id,model_id:row.model_id,quantity:row.quantity});}}catch{productionComplete=false;invalidQuantity=true;}
 const knownProduction=businessMonthSafe(productionKnown),amountsSafe=[knownSales,knownPayout,knownAdjustment,knownProduction].every(value=>value!==null)&&!invalidQuantity;
 const sales=complete&&coverage.payment_missing===0?knownSales:null,payout=complete&&coverage.payment_missing===0?knownPayout:null,tax=complete?knownTax:null,adjustment=complete&&coverage.payment_missing===0?knownAdjustment:null,production=complete&&productionComplete?knownProduction:null;
 if(production===null)pending.push('PRODUCTION_COST_INCOMPLETE');if(tax===null)pending.push('INVOICE_TAX_UNAVAILABLE');if(!adsFresh)pending.push('ADS_UNAVAILABLE');if(expense.external_expenses_cents===null||expensesDraft)pending.push('EXTERNAL_EXPENSES_REQUIRED');if(adjustment===null||adjustment<0)pending.push('ADJUSTMENT_UNAVAILABLE');else if(adjustment>0&&expense.recharge_treatment==='UNCONFIRMED')pending.push('RECHARGE_TREATMENT_REQUIRED');if(!amountsSafe)pending.push('ARITHMETIC_UNSAFE');
 if(taxPolicy.status==='PENDING')pending.push('TAX_POLICY_REQUIRED');
 // Legacy frames only bound their observations by the import's start/end.
 // A recent final page must never make an earlier page appear freshly read.
 const financialTimes=frames.map(frame=>frame.checked_at),oldestFinancialTimes=frames.map(frame=>frame.source_checked_at?.oldest_at??frame.cutoff_at),latestFinancialTimes=frames.map(frame=>frame.source_checked_at?.latest_at??frame.checked_at),sourceCheckedAt={finance_oldest_at:frames.length?Math.min(...oldestFinancialTimes):null,finance_latest_at:frames.length?Math.max(...latestFinancialTimes):null,ads_at:ads?.fetched_at??null};
 const checkedAt=Math.max(stamp,...financialTimes,ads?.fetched_at||0);
 const checkedMonth=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(checkedAt*1000)).slice(0,7);
 if(month===checkedMonth&&sourceCheckedAt.finance_oldest_at!==null&&checkedAt-sourceCheckedAt.finance_oldest_at>900)pending.push('FINANCIAL_SOURCE_STALE');
 let net=null,margin=null;
 if(!pending.length){const addBack=expense.recharge_treatment==='ADS_RECHARGE'?adjustment:0;net=businessMonthSafe(BigInt(payout)-BigInt(production)-BigInt(tax)+BigInt(addBack)-BigInt(ads.expense_cents)-BigInt(expense.external_expenses_cents));if(net===null)pending.push('ARITHMETIC_UNSAFE');else if(sales>0){margin=businessMonthSafe(BigInt(net)*10000n/BigInt(sales));if(margin===null){net=null;pending.push('ARITHMETIC_UNSAFE');}}}
 const result={schema:'business_month_v1',month,start_date:range.start_date,end_date:range.end_date,status:complete?'COMPLETE':limited?'LIMIT_REACHED':'RUNNING',checked_at:checkedAt,progress:{windows_total:range.slots.length,windows_complete:frames.filter(frame=>frame.status==='COMPLETE').length,pages_read:frames.reduce((sum,frame)=>sum+frame.pages_read,0),order_capacity:frames.reduce((sum,frame)=>sum+frame.pages_read*(frame.page_capacity??5),0)},coverage,sales_cents:sales,known_sales_cents:knownSales,expected_repass_cents:payout,known_expected_repass_cents:knownPayout,production_cost_cents:production,known_production_cost_cents:knownProduction,invoice_tax_cents:tax,known_invoice_tax_cents:knownTax,ads_adjustment_cents:adjustment,ads,expenses:expense,result:{net_estimate_cents:net,net_profit_cents:null,net_margin_bps:margin,pending,basis:'PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE'},unmapped_variants:unmapped,bindings_revision:bindings.revision,costs_revision:costs.revision};
 result.tax=taxPolicy;result.source_checked_at=sourceCheckedAt;result.collection=collection;
 result.cost_rules_revision=automaticCosts.revision;result.classification_revision=automaticCosts.classification_revision;
 result.product_summary=buildBusinessMonthProducts(frames,result,variantReferences,bindings);
 const projected=projectBusinessMonth(result);if(!projected)businessMonthFail('BUSINESS_MONTH_RESULT_INVALID',503);return projected;
}
