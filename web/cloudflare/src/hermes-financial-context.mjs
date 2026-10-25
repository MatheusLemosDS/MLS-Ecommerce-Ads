import {businessMonth,projectBusinessMonth} from './business-month.mjs';
import {buildMonthlyFinancialSummary} from './business-month-summary.mjs';
import {buildAccountDiagnosis} from './account-diagnosis.mjs';
import {buildBusinessCheckpoint} from './business-checkpoint.mjs';

export const HERMES_FINANCIAL_CONTEXT_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS hermes_financial_contexts(job_id TEXT PRIMARY KEY NOT NULL,analysis_date TEXT NOT NULL,captured_at INTEGER NOT NULL,fingerprint TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=12288))`,
];
export class HermesFinancialContextError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const fail=(code,status=503)=>{throw new HermesFinancialContextError(code,status);};
const ready=new WeakMap();
const encoder=new TextEncoder();
const jobIdentity=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;

// The owner page embeds this function alone. It accepts no provider response,
// customer identity, token or free-form assistant text.
export function projectHermesFinancialContext(value){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const array=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,i)=>Object.getOwnPropertyDescriptor(rows,String(i))).every(field=>field&&Object.hasOwn(field,'value'));
 const integer=(row,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
 const money=(row,signed=false)=>row===null||integer(row,signed?Number.MIN_SAFE_INTEGER:0);
 const date=row=>typeof row==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row)&&Number.isFinite(Date.parse(row+'T00:00:00Z'))&&new Date(row+'T00:00:00Z').toISOString().slice(0,10)===row;
 const text=(row,max)=>typeof row==='string'&&row.trim()===row&&row.length>0&&row.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(row);
 const utf8Length=raw=>{let size=0;for(let i=0;i<raw.length;i++){const c=raw.charCodeAt(i);if(c<128)size++;else if(c<2048)size+=2;else if(c>=55296&&c<=56319&&i+1<raw.length&&raw.charCodeAt(i+1)>=56320&&raw.charCodeAt(i+1)<=57343){size+=4;i++;}else size+=3;}return size;};
 const pendingCodes=['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','TAX_POLICY_REQUIRED','FINANCIAL_SOURCE_STALE'];
 const totalKeys=['sales_cents','known_sales_cents','expected_repass_cents','production_cost_cents','known_production_cost_cents','invoice_tax_cents','ads_spend_cents','external_expenses_cents','recharge_addback_cents','net_estimate_cents','net_profit_cents','ads_attributed_gmv_cents','ads_calculated_roas_raw','tacos_bps'];
 const actions=['COMPLETE_PRODUCTION_COSTS','RECONCILE_RETURNS','COMPLETE_PAYMENT_COVERAGE','REFRESH_FINANCIAL_SOURCE','RESTORE_FINANCIAL_SOURCE','DECLARE_MONTHLY_DAS','DECLARE_EXTERNAL_EXPENSES','CONFIRM_RECHARGE_TREATMENT','RECONCILE_PAYMENT_ADJUSTMENTS','RECONCILE_ORDER_STATUS','COMPLETE_MONTH_COLLECTION','REVIEW_PERIOD_COVERAGE','REFRESH_CALENDAR_ADS','REVIEW_ARITHMETIC','REVIEW_MONTHLY_LOSS','REVIEW_BREAK_EVEN','CHECK_STOCK_AND_CAMPAIGN'];
 try{
  if(!exact(value,['schema','analysis_date','captured_at','available','unavailable_code','monthly'])||value.schema!=='hermes_financial_context_v1'||!date(value.analysis_date)||!integer(value.captured_at,1,9999999999)||typeof value.available!=='boolean')return null;
  const captureDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.captured_at*1000));if(value.analysis_date>captureDay)return null;
  if(!value.available){if(value.monthly!==null||!['MONTHLY_SOURCE_UNAVAILABLE','MONTHLY_FRAME_INVALID','LEGACY_CONTEXT_MISSING'].includes(value.unavailable_code))return null;}
  else{
   const month=value.monthly;
   if(value.unavailable_code!==null||!exact(month,['month','start_date','end_date','checked_at','status','summary','totals','order_coverage','pending','source_checked_at','versions','top_actions','product_references','actual_profit_cents','execution'])||month.month!==value.analysis_date.slice(0,7)||month.start_date!==month.month+'-01'||!date(month.end_date)||month.end_date.slice(0,7)!==month.month||!integer(month.checked_at,1,value.captured_at+60)||month.end_date>captureDay||!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(month.status)||month.actual_profit_cents!==null||month.execution!=='READ_ONLY')return null;
   if(!array(month.pending,pendingCodes.length)||new Set(month.pending).size!==month.pending.length||!month.pending.every(code=>pendingCodes.includes(code)))return null;
   const c=month.order_coverage,coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
   if(!exact(c,coverageKeys)||!coverageKeys.every(key=>integer(c[key],0,3000))||c.orders!==c.paid+c.cancelled+c.cancel_pending+c.unpaid+c.other+c.unknown||c.paid!==c.completed+c.ongoing||c.payment_covered+c.payment_missing!==c.paid||c.returns+c.returns_unknown>c.paid)return null;
   const t=month.totals;if(!exact(t,totalKeys)||!totalKeys.filter(key=>!['ads_calculated_roas_raw','tacos_bps'].includes(key)).every(key=>money(t[key],['expected_repass_cents','net_estimate_cents'].includes(key)))||t.net_profit_cents!==null||t.ads_calculated_roas_raw!==null&&(typeof t.ads_calculated_roas_raw!=='string'||t.ads_calculated_roas_raw.length>64||!/^(0|[1-9][0-9]*)\.[0-9]{6}$/.test(t.ads_calculated_roas_raw))||t.tacos_bps!==null&&!integer(t.tacos_bps))return null;
   if(t.sales_cents!==null&&t.sales_cents!==t.known_sales_cents||t.production_cost_cents!==null&&t.production_cost_cents!==t.known_production_cost_cents)return null;
   const tacos=t.sales_cents===null||t.sales_cents===0||t.ads_spend_cents===null?null:BigInt(t.ads_spend_cents)*10000n/BigInt(t.sales_cents);if(tacos===null?t.tacos_bps!==null:t.tacos_bps===null||BigInt(t.tacos_bps)!==tacos)return null;
   let roas=null;if(t.ads_attributed_gmv_cents!==null&&t.ads_spend_cents!==null&&t.ads_spend_cents>0){const numerator=BigInt(t.ads_attributed_gmv_cents)*1000000n,denominator=BigInt(t.ads_spend_cents);let rounded=numerator/denominator;if(numerator%denominator*2n>=denominator)rounded++;roas=(rounded/1000000n).toString()+'.'+(rounded%1000000n).toString().padStart(6,'0');}if(t.ads_calculated_roas_raw!==roas)return null;
   if(t.net_estimate_cents!==null&&(month.status!=='COMPLETE'||month.pending.length))return null;
   if(month.status!=='COMPLETE'&&['sales_cents','expected_repass_cents','production_cost_cents','invoice_tax_cents'].some(key=>t[key]!==null))return null;
   const sources=month.source_checked_at;if(!exact(sources,['finance_oldest_at','finance_latest_at','ads_at'])||!Object.values(sources).every(at=>at===null||integer(at,1,month.checked_at))||(sources.finance_oldest_at===null)!==(sources.finance_latest_at===null)||sources.finance_oldest_at!==null&&sources.finance_oldest_at>sources.finance_latest_at)return null;
   const versions=month.versions;if(!exact(versions,['bindings','costs','cost_rules','tax_policy','expenses','classifications'])||!integer(versions.bindings,1,2147483647)||!integer(versions.costs,1,2147483647)||!integer(versions.expenses,0,2147483646)||!['cost_rules','tax_policy','classifications'].every(key=>versions[key]===null||integer(versions[key],key==='tax_policy'?0:1,2147483647)))return null;
   const has=code=>month.pending.includes(code);
   if(month.status==='RUNNING'&&!has('COLLECTING')||month.status==='LIMIT_REACHED'&&!has('PERIOD_LIMIT_REACHED')||c.cancel_pending+c.other+c.unknown>0&&!has('STATUS_REVIEW_REQUIRED')||c.payment_missing>0&&!has('PAYMENT_INCOMPLETE')||c.returns+c.returns_unknown>0&&!has('RETURNS_NOT_RECONCILED')||t.production_cost_cents===null&&!has('PRODUCTION_COST_INCOMPLETE')||t.invoice_tax_cents===null&&!has('INVOICE_TAX_UNAVAILABLE')||t.ads_spend_cents===null&&!has('ADS_UNAVAILABLE')||t.external_expenses_cents===null&&!has('EXTERNAL_EXPENSES_REQUIRED')||t.recharge_addback_cents===null&&!has('ADJUSTMENT_UNAVAILABLE')&&!has('RECHARGE_TREATMENT_REQUIRED')||versions.tax_policy===0&&!has('TAX_POLICY_REQUIRED'))return null;
   if(c.payment_missing>0&&(t.sales_cents!==null||t.expected_repass_cents!==null)||[t.known_sales_cents,t.known_production_cost_cents].some(amount=>amount===null)&&!has('ARITHMETIC_UNSAFE'))return null;
   if((month.status==='COMPLETE'||c.orders>0)&&sources.finance_oldest_at===null||[t.ads_spend_cents,t.ads_attributed_gmv_cents,t.ads_calculated_roas_raw].some(amount=>amount!==null)&&sources.ads_at===null)return null;
   const checkedDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(month.checked_at*1000)),stale=month.month===checkedDay.slice(0,7)&&sources.finance_oldest_at!==null&&month.checked_at-sources.finance_oldest_at>900;
   if(stale!==has('FINANCIAL_SOURCE_STALE'))return null;
   const summary=month.summary;if(!exact(summary,['schema','state','balance_cents','before_production_cents','known_production_cents','production_complete','costs_after_payout_cents','production_coverage','pending','basis'])||summary.schema!=='monthly_financial_summary_v1'||!['WAITING','READY','PROVISIONAL','PARTIAL_COSTS'].includes(summary.state)||typeof summary.production_complete!=='boolean'||!money(summary.balance_cents,true)||!money(summary.before_production_cents,true)||!money(summary.known_production_cents)||!money(summary.costs_after_payout_cents)||summary.known_production_cents!==t.known_production_cost_cents||summary.basis!=='PAID_MONTH_CURRENT_COSTS_AFTER_ADS_TAX_EXPENSES'||!array(summary.pending,pendingCodes.length)||summary.pending.length!==month.pending.length||!summary.pending.every((code,index)=>code===month.pending[index]))return null;
   const pc=summary.production_coverage;if(!exact(pc,['total_units','known_units','pending_units','pending_variants','pending_products'])||!money(pc.total_units)||!money(pc.known_units)||!integer(pc.pending_units)||!integer(pc.pending_variants,0,Math.min(3000,pc.pending_units))||!integer(pc.pending_products,0,pc.pending_variants)||(pc.total_units===null)!==(pc.known_units===null)||pc.total_units!==null&&BigInt(pc.known_units)+BigInt(pc.pending_units)!==BigInt(pc.total_units)||summary.production_complete&&(pc.pending_units!==0||t.production_cost_cents===null))return null;
   if(summary.state==='WAITING'?[summary.balance_cents,summary.before_production_cents,summary.costs_after_payout_cents].some(amount=>amount!==null):[summary.balance_cents,summary.before_production_cents,summary.costs_after_payout_cents].some(amount=>amount===null))return null;
   if(summary.state==='READY'&&(t.net_estimate_cents===null||summary.balance_cents!==t.net_estimate_cents)||summary.state!=='READY'&&t.net_estimate_cents!==null)return null;
   if(summary.production_complete!==(month.status==='COMPLETE'&&t.production_cost_cents!==null&&pc.pending_units===0)||summary.state==='PROVISIONAL'&&!summary.production_complete||summary.state==='PARTIAL_COSTS'&&summary.production_complete)return null;
   if(summary.state!=='WAITING'){
    if(['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','PAYMENT_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','TAX_POLICY_REQUIRED'].some(has))return null;
    if(['expected_repass_cents','known_production_cost_cents','invoice_tax_cents','ads_spend_cents','external_expenses_cents','recharge_addback_cents'].some(key=>t[key]===null))return null;
    const before=BigInt(t.expected_repass_cents)+BigInt(t.recharge_addback_cents)-BigInt(t.invoice_tax_cents)-BigInt(t.ads_spend_cents)-BigInt(t.external_expenses_cents),costs=BigInt(t.known_production_cost_cents)+BigInt(t.invoice_tax_cents)+BigInt(t.ads_spend_cents)+BigInt(t.external_expenses_cents);
    if(BigInt(summary.before_production_cents)!==before||BigInt(summary.balance_cents)!==before-BigInt(t.known_production_cost_cents)||BigInt(summary.costs_after_payout_cents)!==costs)return null;
   }
   if(!array(month.top_actions,3)||new Set(month.top_actions.map(row=>Object.getOwnPropertyDescriptor(row||{},'code')?.value)).size!==month.top_actions.length)return null;
   for(const action of month.top_actions)if(!exact(action,['code','priority','label','detail','metric_refs'])||!actions.includes(action.code)||!['HIGH','MEDIUM','LOW'].includes(action.priority)||!text(action.label,120)||!text(action.detail,700)||!array(action.metric_refs,4)||new Set(action.metric_refs).size!==action.metric_refs.length||!action.metric_refs.every(key=>totalKeys.includes(key)))return null;
   if(!array(month.product_references,3))return null;const seen=new Set();
   for(const product of month.product_references){if(!exact(product,['item_id','units','exclusive_repass_cents','exclusive_production_cents','exclusive_contribution_cents','mixed_orders','basis'])||typeof product.item_id!=='string'||!/^[1-9][0-9]{0,19}$/.test(product.item_id)||seen.has(product.item_id)||!integer(product.units,1)||!money(product.exclusive_repass_cents,true)||!money(product.exclusive_production_cents)||!money(product.exclusive_contribution_cents,true)||!integer(product.mixed_orders,0,c.paid)||product.basis!=='EXCLUSIVE_BEFORE_ADS_DAS')return null;
    if(product.exclusive_contribution_cents!==null&&(versions.tax_policy===null||product.exclusive_repass_cents===null||product.exclusive_production_cents===null||BigInt(product.exclusive_contribution_cents)!==BigInt(product.exclusive_repass_cents)-BigInt(product.exclusive_production_cents)))return null;
    seen.add(product.item_id);
   }
  }
  const raw=JSON.stringify(value);if(utf8Length(raw)>12288)return null;return JSON.parse(raw);
 }catch{return null;}
}

export function buildHermesFinancialContext(frame,options={}){
 const descriptors=Object.getOwnPropertyDescriptors(options||{}),analysisDate=descriptors.analysisDate?.value,capturedAt=descriptors.capturedAt?.value;
 const base={schema:'hermes_financial_context_v1',analysis_date:analysisDate,captured_at:capturedAt,available:false,unavailable_code:frame===null?'MONTHLY_SOURCE_UNAVAILABLE':'MONTHLY_FRAME_INVALID',monthly:null};
 try{
  if(!day(analysisDate)||!Number.isSafeInteger(capturedAt)||capturedAt<1||Reflect.ownKeys(options).length!==2||!descriptors.analysisDate||!Object.hasOwn(descriptors.analysisDate,'value')||!descriptors.capturedAt||!Object.hasOwn(descriptors.capturedAt,'value'))return null;
  const month=projectBusinessMonth(frame);if(!month||month.month!==analysisDate.slice(0,7))return projectHermesFinancialContext(base);
  const presentation=buildMonthlyFinancialSummary(month),diagnosis=buildAccountDiagnosis(month),checkpoint=buildBusinessCheckpoint(month);if(!presentation||!diagnosis||!checkpoint)return projectHermesFinancialContext(base);
  // The v1 bridge predates the owner's provisional balance over paid orders
  // with separate status exclusions. Preserve its original waiting contract;
  // the known amounts, complete cost coverage and review actions remain intact.
  const summary=month.result.pending.includes('STATUS_REVIEW_REQUIRED')?{...presentation,state:'WAITING',balance_cents:null,before_production_cents:null,costs_after_payout_cents:null}:presentation;
  const refs={COMPLETE_PRODUCTION_COSTS:['production_cost_cents','known_production_cost_cents'],RECONCILE_RETURNS:['expected_repass_cents','net_estimate_cents'],COMPLETE_PAYMENT_COVERAGE:['sales_cents','expected_repass_cents'],REFRESH_FINANCIAL_SOURCE:['known_sales_cents','expected_repass_cents'],RESTORE_FINANCIAL_SOURCE:['known_sales_cents','expected_repass_cents'],DECLARE_MONTHLY_DAS:['invoice_tax_cents'],DECLARE_EXTERNAL_EXPENSES:['external_expenses_cents'],CONFIRM_RECHARGE_TREATMENT:['recharge_addback_cents'],RECONCILE_PAYMENT_ADJUSTMENTS:['recharge_addback_cents'],RECONCILE_ORDER_STATUS:['sales_cents'],COMPLETE_MONTH_COLLECTION:['known_sales_cents'],REVIEW_PERIOD_COVERAGE:['known_sales_cents'],REFRESH_CALENDAR_ADS:['ads_spend_cents','ads_calculated_roas_raw'],REVIEW_ARITHMETIC:['net_estimate_cents'],REVIEW_MONTHLY_LOSS:['net_estimate_cents','ads_spend_cents'],REVIEW_BREAK_EVEN:['net_estimate_cents'],CHECK_STOCK_AND_CAMPAIGN:['net_estimate_cents','ads_calculated_roas_raw']};
  const products=[...(month.product_summary?.products||[])].sort((a,b)=>b.quantity-a.quantity||a.item_id.length-b.item_id.length||(a.item_id<b.item_id?-1:1)).slice(0,3).map(row=>({item_id:row.item_id,units:row.quantity,exclusive_repass_cents:row.exclusive_repass_cents,exclusive_production_cents:row.exclusive_production_cost_cents,exclusive_contribution_cents:month.tax?.regime==='MEI'?row.exclusive_after_costs_cents:null,mixed_orders:row.mixed_orders,basis:'EXCLUSIVE_BEFORE_ADS_DAS'}));
  const value={...base,available:true,unavailable_code:null,monthly:{month:month.month,start_date:month.start_date,end_date:month.end_date,checked_at:month.checked_at,status:month.status,summary,totals:{sales_cents:month.sales_cents,known_sales_cents:month.known_sales_cents,expected_repass_cents:month.expected_repass_cents,production_cost_cents:month.production_cost_cents,known_production_cost_cents:month.known_production_cost_cents,invoice_tax_cents:month.invoice_tax_cents,ads_spend_cents:month.ads?.status==='AVAILABLE'?month.ads.expense_cents:null,external_expenses_cents:month.expenses.external_expenses_cents,recharge_addback_cents:diagnosis.metrics.recharge_addback_cents,net_estimate_cents:month.result.net_estimate_cents,net_profit_cents:null,ads_attributed_gmv_cents:month.ads?.totals.broad.gmv_cents??null,ads_calculated_roas_raw:month.ads?.totals.broad.calculated_roas_raw??null,tacos_bps:diagnosis.metrics.tacos_bps},order_coverage:{...month.coverage},pending:[...month.result.pending],source_checked_at:{...checkpoint.source_checked_at},versions:{bindings:checkpoint.versions.bindings,costs:checkpoint.versions.costs,cost_rules:checkpoint.versions.cost_rules,tax_policy:checkpoint.versions.tax_policy,expenses:checkpoint.versions.expenses,classifications:checkpoint.versions.classifications??null},top_actions:diagnosis.tasks.slice(0,3).map(row=>({...row,metric_refs:[...(refs[row.code]||[])]})),product_references:products,actual_profit_cents:null,execution:'READ_ONLY'}};
  return projectHermesFinancialContext(value)||projectHermesFinancialContext(base);
 }catch{return projectHermesFinancialContext(base);}
}

async function setup(env){const db=env?.ADMIN_DB;if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function')fail('HERMES_CONTEXT_CONFIGURATION');if(!ready.has(db))ready.set(db,db.batch(HERMES_FINANCIAL_CONTEXT_SCHEMA.map(sql=>db.prepare(sql))).catch(()=>{ready.delete(db);fail('HERMES_CONTEXT_STORAGE_UNAVAILABLE');}));await ready.get(db);return db;}
function epoch(now){let value;try{value=now();}catch{fail('HERMES_CONTEXT_CLOCK_INVALID');}if(!Number.isSafeInteger(value)||value<1||Math.floor(value/1000)>9999999999)fail('HERMES_CONTEXT_CLOCK_INVALID');return Math.floor(value/1000);}
async function fingerprint(jobId,payload){const raw='{"job_id":'+JSON.stringify(jobId)+',"context":'+payload+'}',hash=await crypto.subtle.digest('SHA-256',encoder.encode(raw));return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
function taskDate(raw){try{if(typeof raw!=='string'||encoder.encode(raw).byteLength>2048)return null;const task=JSON.parse(raw),keys=['type','shop_id','start_date','end_date','ads_execution'];if(!task||typeof task!=='object'||Array.isArray(task)||Object.keys(task).length!==keys.length||!keys.every(key=>Object.hasOwn(task,key))||task.type!=='daily_review'||task.shop_id!=='1178167501'||task.ads_execution!=='LOCKED'||!day(task.start_date)||task.end_date!==task.start_date)return null;return task.start_date;}catch{return null;}}

export async function prepareHermesFinancialContext(env,jobId,analysisDate,{now=()=>Date.now(),taskRaw}={}){
 if(!jobIdentity(jobId)||!day(analysisDate)||taskDate(taskRaw)!==analysisDate||typeof now!=='function')fail('HERMES_CONTEXT_REQUEST_INVALID',400);
 const db=await setup(env);epoch(now);let frame=null;try{frame=await businessMonth(env,{operation:'read',month:analysisDate.slice(0,7)},{},{now,actor:'hermes-context'});}catch{}
 const context=buildHermesFinancialContext(frame,{analysisDate,capturedAt:epoch(now)});if(!context)fail('HERMES_CONTEXT_INVALID');
 const payload=JSON.stringify(context);if(encoder.encode(payload).byteLength>12288)fail('HERMES_CONTEXT_INVALID');const hash=await fingerprint(jobId,payload);
 const statement=db.prepare('INSERT INTO hermes_financial_contexts(job_id,analysis_date,captured_at,fingerprint,payload) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM hermes_jobs WHERE id=? AND task=?) ON CONFLICT(job_id) DO NOTHING').bind(jobId,analysisDate,context.captured_at,hash,payload,jobId,taskRaw);
 return {context,fingerprint:hash,statement};
}

export async function readHermesFinancialContext(env,jobId){
 if(!jobIdentity(jobId))fail('HERMES_CONTEXT_REQUEST_INVALID',400);const db=await setup(env);let data;
 try{data=await db.batch([db.prepare('SELECT job_id,analysis_date,captured_at,fingerprint,payload FROM hermes_financial_contexts WHERE job_id=?').bind(jobId),db.prepare('SELECT id,task,created_at FROM hermes_jobs WHERE id=?').bind(jobId)]);}catch{fail('HERMES_CONTEXT_STORAGE_UNAVAILABLE');}
 const row=data[0]?.results?.[0],job=data[1]?.results?.[0];if(!job)fail('HERMES_CONTEXT_NOT_FOUND',404);
 const analysisDate=taskDate(job.task);if(!analysisDate)fail('HERMES_CONTEXT_STORAGE_INVALID');
 if(!row){const capturedAt=Math.floor(Date.parse(job.created_at)/1000),context=projectHermesFinancialContext({schema:'hermes_financial_context_v1',analysis_date:analysisDate,captured_at:capturedAt,available:false,unavailable_code:'LEGACY_CONTEXT_MISSING',monthly:null});if(!context)fail('HERMES_CONTEXT_STORAGE_INVALID');const payload=JSON.stringify(context);return {job_id:jobId,fingerprint:await fingerprint(jobId,payload),context,payload,persisted:false};}
 let context;try{if(row.job_id!==jobId||row.analysis_date!==analysisDate||typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>12288||typeof row.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(row.fingerprint))throw Error();context=projectHermesFinancialContext(JSON.parse(row.payload));if(!context||context.analysis_date!==row.analysis_date||context.captured_at!==row.captured_at||await fingerprint(jobId,row.payload)!==row.fingerprint)throw Error();}catch{fail('HERMES_CONTEXT_STORAGE_INVALID');}
 return {job_id:jobId,fingerprint:row.fingerprint,context,payload:row.payload,persisted:true};
}
