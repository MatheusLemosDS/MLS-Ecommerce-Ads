import {projectBusinessMonth} from './business-month.mjs';
import {projectBusinessMonthAuditScope} from './business-month-view-state.mjs';
import {projectBusinessReconciliation} from './business-reconciliation.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';
import {buildMonthlyFinancialSummary} from './business-month-summary.mjs';
import {buildAdjustedBusinessBalance} from './business-adjusted-balance.mjs';
import {projectBusinessIncomeOverview} from './business-income-overview.mjs';
import {projectBusinessIncomeDetail} from './business-income-detail.mjs';
import {projectIncomeOverviewFrame} from '../../finance/src/income-overview-frame.mjs';
import {projectIncomeDetailFrame} from '../../finance/src/income-detail-frame.mjs';
import {projectIncomeDetailDiagnostic} from '../../finance/src/income-detail-diagnostic.mjs';

// One bounded report over existing saved sources. No collection, writes, order
// identity, new deduction or bank assertion is introduced by this projection.
export function buildBusinessFinancialCloseout(input,{now=()=>Date.now()}={}){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const read=(v,k)=>plain(v)?Object.getOwnPropertyDescriptor(v,k)?.value:undefined;
 const integer=(v,signed=false)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&(signed||v>=0);
 const sum=rows=>{let value=0n;for(const amount of rows){if(!integer(amount,true))return null;value+=BigInt(amount);}return value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;};
 try{
  if(!plain(input)||!Reflect.ownKeys(input).every(k=>['monthly','reconciliation','audit_scope','income_overview','income_detail','income_detail_diagnostic'].includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(input,k)||{},'value')))return null;
  const stamp=Math.floor(now()/1000);if(!integer(stamp)||stamp<1||stamp>9999999999)return null;
  const month=projectBusinessMonth(read(input,'monthly'));if(!month||month.checked_at>stamp+60)return null;
  const scope=projectBusinessMonthAuditScope(read(input,'audit_scope'));
  const report=projectBusinessReconciliation(read(input,'reconciliation'),projectReconciliationFrame);
  const overview=projectBusinessIncomeOverview(read(input,'income_overview'),projectIncomeOverviewFrame);
  const detail=projectBusinessIncomeDetail(read(input,'income_detail'),projectIncomeDetailFrame);
  const sources=month.source_checked_at??{finance_oldest_at:null,finance_latest_at:null,ads_at:null};
  const summary=buildMonthlyFinancialSummary(month),coverage=month.coverage;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
  const lastDay=new Date(Date.UTC(Number(month.month.slice(0,4)),Number(month.month.slice(5)),0)).toISOString().slice(0,10);
  const periodComplete=month.status==='COMPLETE'&&month.end_date===lastDay&&today>lastDay;
  let scopeStatus='WAITING',same=false;
  if(scope&&scope.start_date===month.start_date&&scope.end_date===month.end_date&&report){
   const observed=projectBusinessMonthAuditScope({publication_revision:report.source_revision,start_date:report.start_date,end_date:report.end_date,sources:report.sources});
   same=report.month===month.month&&JSON.stringify(scope)===JSON.stringify(observed)&&report.checked_at<=stamp+60;
   // A matching revision alone cannot mix coverage or timestamps of another cut.
   if(same&&report.reports.length===scope.sources.length){
    const fields={orders:'orders',paid_orders:'paid',return_orders:'returns',return_unknown_orders:'returns_unknown'};
    same=Object.entries(fields).every(([key,monthly])=>sum(report.reports.map(row=>row.coverage[key]))===coverage[monthly])&&sum(report.reports.map(row=>row.coverage.review_orders))===coverage.cancel_pending+coverage.other+coverage.unknown;
    const dated=report.reports.filter(row=>row.source_checked_at.finance_oldest_at!==null);
    if(dated.length)same=same&&Math.min(...dated.map(row=>row.source_checked_at.finance_oldest_at))===sources.finance_oldest_at&&Math.max(...dated.map(row=>row.source_checked_at.finance_latest_at))===sources.finance_latest_at;
   }
   scopeStatus=same?'SAME_PUBLICATION':'MISMATCH';
  }else if(scope&&report)scopeStatus='MISMATCH';
  const matched=same?report:null,complete=!!matched&&matched.reports.length===scope.sources.length;
  const adjusted=buildAdjustedBusinessBalance(month,matched,scope,{projectMonthly:projectBusinessMonth,projectReconciliation:projectBusinessReconciliation,projectFrame:projectReconciliationFrame,projectScope:projectBusinessMonthAuditScope,buildSummary:buildMonthlyFinancialSummary});
  const checks=[],cases=[];
  const freshness=(at,current=false)=>at===null?'UNKNOWN':stamp-at<=900?'FRESH':!current&&month.month<today.slice(0,7)?'HISTORICAL':'STALE';
  const source=(name,at,current=false)=>({name,checked_at:at,freshness:freshness(at,current)});
  const add=(code,agent,count,unit,amount,basis,origin,action,href,state='OPEN',technical=null)=>{if(!cases.some(row=>row.code===code))cases.push({code,agent_id:agent,state,affected_count:count,affected_unit:unit,known_amount_cents:amount,amount_basis:basis,source:origin,next_action:action,href,technical_code:technical,technical_diagnostic:null});};
  const financial=source('MONTHLY_FINANCE',sources.finance_oldest_at);
  const reconciliationSource=source('SAME_PUBLICATION_RECONCILIATION',matched?.reports.length?Math.min(...matched.reports.map(row=>row.checked_at)):null);
  const returnsCount=coverage.returns+coverage.returns_unknown,reviewCount=coverage.cancel_pending+coverage.other+coverage.unknown;
  const knownRefundSubtotal=matched?.reports.length?sum(matched.reports.map(row=>row.returns.known_requested_refund_cents)):null;
  // The source's empty known subtotal is zero even when every amount is
  // unavailable. Expose zero only with a known amount (including a documented
  // zero) or complete evidence that this scope has no returns to quantify.
  const knownRefundAmount=matched?.reports.some(row=>row.cases.some(item=>item.requested_refund_cents!==null)||row.returns.reference_count>0&&row.returns.requested_amount_complete);
  const noRefundsConfirmed=complete&&returnsCount===0&&reviewCount===0&&matched.reports.every(row=>row.status==='CHECKED'&&row.returns.reference_count===0&&row.returns.requested_amount_complete&&!row.pending.includes('RETURN_REFERENCES_MISSING'));
  const returnsAmount=knownRefundSubtotal!==null&&(knownRefundSubtotal!==0||knownRefundAmount||noRefundsConfirmed)?knownRefundSubtotal:null;
  const map={
   COLLECTING:['auditor',null,'SOURCES',month.known_sales_cents,'KNOWN_PAID_SALES',financial,'WAIT_FOR_COLLECTION','#businessMonth','WORKING'],
   PERIOD_LIMIT_REACHED:['auditor',null,'ORDERS',month.known_sales_cents,'KNOWN_PAID_SALES',financial,'REVIEW_COLLECTION_LIMIT','#businessMonth','BLOCKED'],
   SOURCE_UNAVAILABLE:['auditor',null,'SOURCES',month.known_expected_repass_cents,'KNOWN_PAID_REPASS',financial,'RESTORE_SOURCE','#businessMonth','BLOCKED'],
   STATUS_REVIEW_REQUIRED:['returns',reviewCount,'ORDERS',null,'NOT_AVAILABLE',reconciliationSource,'REVIEW_ORDER_STATUS','#businessReconciliation'],
   PAYMENT_INCOMPLETE:['finance',coverage.payment_missing,'ORDERS',month.known_expected_repass_cents,'KNOWN_PAID_REPASS',financial,'COMPLETE_PAYMENT_EVIDENCE','#businessReconciliation'],
   RETURNS_NOT_RECONCILED:['returns',returnsCount,'ORDERS',returnsAmount,'REPORTED_REFUND_ALL_COHORTS_INFORMATION_ONLY',reconciliationSource,'COMPARE_RETURN_OUTCOMES','#businessReconciliation'],
   PRODUCTION_COST_INCOMPLETE:['products',summary.production_coverage.pending_units,'UNITS',summary.known_production_cents,'IDENTIFIED_PRODUCTION_COST',source('SAVED_PRODUCTION_COSTS',month.checked_at),'COMPLETE_VARIANT_COSTS','/admin?tab=products'],
   INVOICE_TAX_UNAVAILABLE:['finance',1,'MONTH',month.invoice_tax_cents,'MONTHLY_TAX',financial,'CONFIRM_MONTHLY_TAX','#businessMonthCalculationDetails'],
   TAX_POLICY_REQUIRED:['finance',1,'MONTH',month.invoice_tax_cents,'MONTHLY_TAX',financial,'CONFIRM_MONTHLY_TAX','#businessMonthCalculationDetails'],
   ADS_UNAVAILABLE:['ads',null,'DAYS',null,'CALENDAR_ADS_SPEND',source('CALENDAR_ADS',sources.ads_at),'WAIT_FOR_ADS_COVERAGE','/dashboard','WORKING'],
   EXTERNAL_EXPENSES_REQUIRED:['finance',1,'MONTH',month.expenses.external_expenses_cents,'DECLARED_EXTERNAL_EXPENSES',source('SAVED_EXPENSES',month.checked_at),'CONFIRM_EXPENSES','#businessMonthExpensesDetails'],
   RECHARGE_TREATMENT_REQUIRED:['finance',1,'MONTH',month.ads_adjustment_cents,'REPORTED_RECHARGE',financial,'CLASSIFY_RECHARGE','#businessMonthExpensesDetails'],
   ADJUSTMENT_UNAVAILABLE:['finance',null,'ORDERS',null,'NOT_AVAILABLE',reconciliationSource,'COMPLETE_ADJUSTMENTS','#businessReconciliation'],
   ARITHMETIC_UNSAFE:['auditor',null,'SOURCES',null,'NOT_AVAILABLE',financial,'REVIEW_ARITHMETIC','#businessMonthCalculationDetails','BLOCKED'],
   FINANCIAL_SOURCE_STALE:['auditor',coverage.paid,'ORDERS',month.known_expected_repass_cents,'KNOWN_PAID_REPASS',financial,'WAIT_FOR_REFRESH','#businessMonth','WORKING']
  };
  for(const code of month.result.pending)if(map[code])add(code,...map[code]);
  if(!same)add('RECONCILIATION_SCOPE_REQUIRED','auditor',null,'SOURCES',null,'NOT_AVAILABLE',reconciliationSource,'WAIT_FOR_MATCHING_PUBLICATION','#businessReconciliation',scopeStatus==='MISMATCH'?'BLOCKED':'WORKING');
  else if(!complete)add('RECONCILIATION_INCOMPLETE','finance',scope.sources.length-matched.reports.length,'SOURCES',null,'NOT_AVAILABLE',reconciliationSource,'WAIT_FOR_RECONCILIATION','#businessReconciliation','WORKING');
  if(complete){
   const missing=sum(matched.reports.map(row=>row.adjustments.missing_orders)),conflicts=sum(matched.reports.map(row=>row.adjustments.conflicting_orders)),pendingReturns=sum(matched.reports.map(row=>row.returns.pending_count));
   if(missing>0)add('ADJUSTMENT_FIELDS_UNAVAILABLE','finance',missing,'ORDERS',null,'NOT_AVAILABLE',reconciliationSource,'COMPLETE_ADJUSTMENTS','#businessReconciliation');
   if(conflicts>0)add('ADJUSTMENT_CONFLICT','auditor',conflicts,'ORDERS',null,'NOT_AVAILABLE',reconciliationSource,'RESOLVE_ADJUSTMENT_CONFLICT','#businessReconciliation','BLOCKED');
   if(pendingReturns>0)add('RETURN_DETAILS_PENDING','returns',pendingReturns,'CASES',returnsAmount,'REPORTED_REFUND_ALL_COHORTS_INFORMATION_ONLY',reconciliationSource,'WAIT_FOR_RETURN_DETAILS','#businessReconciliation','WORKING');
  }
  // Current Pending is a separate snapshot and is never subtracted from, or
  // added to, this month's payout, expenses or provisional result.
  if(overview&&overview.checked_at<=stamp+60&&overview.report?.pending.cents>0){
   const current=source('CURRENT_INCOME_PENDING',overview.report.checked_at,true),detailReport=detail&&detail.checked_at<=stamp+60?detail.report:null;
   if(!detailReport||detail?.attempt?.status==='UNAVAILABLE')add('CURRENT_PENDING_DETAIL_UNAVAILABLE','finance',null,'ORDERS',overview.report.pending.cents,'CURRENT_PROVIDER_PENDING',current,'RESTORE_PENDING_DETAIL','#commandPendingIncomeDetails',detail?.attempt?.status==='UNAVAILABLE'?'BLOCKED':'WORKING',detail?.attempt?.code??null);
   else if(detailReport.has_more)add('CURRENT_PENDING_PARTIAL','finance',detailReport.returned_count,'ROWS',overview.report.pending.cents,'CURRENT_PROVIDER_PENDING',current,'VALIDATE_PENDING_BEFORE_PAGINATION','#commandPendingIncomeDetails','WORKING');
   else if(detailReport.checked_at<overview.report.checked_at)add('CURRENT_PENDING_DETAIL_STALE','finance',detailReport.returned_count,'ROWS',overview.report.pending.cents,'CURRENT_PROVIDER_PENDING',current,'WAIT_FOR_REFRESH','#commandPendingIncomeDetails','WORKING');
  }
  const sidecar=read(input,'income_detail_diagnostic'),cause=projectIncomeDetailDiagnostic(read(sidecar,'diagnostic'));
  if(cause&&read(sidecar,'schema')==='business_income_detail_diagnostic_v1'&&integer(read(sidecar,'checked_at'))&&read(sidecar,'checked_at')<=stamp+60&&read(sidecar,'attempt_checked_at')===detail?.attempt?.checked_at&&detail?.attempt?.status==='UNAVAILABLE'){
   const row=cases.find(row=>row.code==='CURRENT_PENDING_DETAIL_UNAVAILABLE');if(row)row.technical_diagnostic={code:cause.code,stage:cause.stage,http:cause.http,provider_code:cause.provider_code,response_kind:cause.response_kind};
  }
  const pending=new Set(month.result.pending),after=adjusted.state==='UNAVAILABLE'?null:adjusted.after_adjustment_repass_cents;
  const check=(id,state,amount,origin,reason,href)=>checks.push({id,state,known_amount_cents:amount,source:origin,reason,href});
  check('PERIOD',periodComplete?'VERIFIED':'PENDING',null,financial,periodComplete?'FULL_CLOSED_CALENDAR':'MONTH_OR_CUT_STILL_OPEN','#businessMonth');
  check('REPASSES',complete&&adjusted.base_repass_cents!==null&&!pending.has('PAYMENT_INCOMPLETE')&&!pending.has('ADJUSTMENT_UNAVAILABLE')?'VERIFIED':'PENDING',after??month.expected_repass_cents,reconciliationSource,complete?'REPORTED_REPASS_NOT_BANK_RECEIPT':'MATCHING_RECONCILIATION_REQUIRED','#businessReconciliation');
  check('RETURNS',returnsCount===0&&reviewCount===0&&complete?'VERIFIED':'PENDING',returnsAmount,reconciliationSource,returnsCount+reviewCount>0?'OUTCOMES_REQUIRE_COMPARISON':'NO_REVIEW_OR_RETURN_IN_PAID_SCOPE','#businessReconciliation');
  check('PRODUCTION',summary.production_complete?'VERIFIED':'PENDING',summary.known_production_cents,source('SAVED_PRODUCTION_COSTS',month.checked_at),summary.production_complete?'ALL_SOLD_UNITS_COSTED':'MISSING_VARIANT_COSTS','/admin?tab=products');
  check('ADS',month.ads?.status==='AVAILABLE'&&!pending.has('ADS_UNAVAILABLE')?'VERIFIED':'PENDING',month.ads?.status==='AVAILABLE'?month.ads.expense_cents:null,source('CALENDAR_ADS',sources.ads_at),'SAME_CALENDAR_SPEND','/dashboard');
  check('TAX',month.invoice_tax_cents!==null&&!pending.has('INVOICE_TAX_UNAVAILABLE')&&!pending.has('TAX_POLICY_REQUIRED')?'VERIFIED':'PENDING',month.invoice_tax_cents,financial,'MONTHLY_TAX_ONCE','#businessMonthCalculationDetails');
  check('EXPENSES',month.expenses.external_expenses_cents!==null&&!pending.has('EXTERNAL_EXPENSES_REQUIRED')&&!pending.has('RECHARGE_TREATMENT_REQUIRED')?'VERIFIED':'PENDING',month.expenses.external_expenses_cents,source('SAVED_EXPENSES',month.checked_at),'EXPLICIT_SAVED_EXPENSES','#businessMonthExpensesDetails');
  const ready=periodComplete&&scopeStatus==='SAME_PUBLICATION'&&checks.every(row=>row.state==='VERIFIED')&&cases.every(row=>row.source.name==='CURRENT_INCOME_PENDING');
  return projectBusinessFinancialCloseout({schema:'business_financial_closeout_v1',month:month.month,start_date:month.start_date,end_date:month.end_date,checked_at:stamp,publication_revision:scope?.publication_revision??null,scope_status:scopeStatus,status:ready?'READY_FOR_COMPARISON':'PREPARING',period_complete:periodComplete,versions:{bindings:month.bindings_revision,costs:month.costs_revision,cost_rules:month.cost_rules_revision??null,tax_policy:month.tax?.policy_revision??null,expenses:month.expenses.revision,classifications:month.classification_revision??null},totals:{expected_repass_cents:month.expected_repass_cents,after_adjustment_repass_cents:after,known_production_cents:summary.known_production_cents,invoice_tax_cents:month.invoice_tax_cents,ads_spend_cents:month.ads?.status==='AVAILABLE'?month.ads.expense_cents:null,external_expenses_cents:month.expenses.external_expenses_cents,provisional_balance_cents:adjusted.state!=='UNAVAILABLE'?adjusted.balance_cents:summary.balance_cents,reported_refund_information_cents:returnsAmount,realized_profit_cents:null},cases,checks,comparisons:[{id:'SELLER_CENTRE',state:'NOT_COMPARED',expected_cents:after??month.expected_repass_cents,basis:'SAME_PAID_COHORT_REPORTED_REPASS'},{id:'BANK',state:'NOT_COMPARED',expected_cents:null,basis:'BANK_STATEMENT_REQUIRED_SEPARATE_SETTLEMENT_CALENDAR'}],basis:'SAVED_SAME_PUBLICATION_PREPARATION_NOT_CLOSED_MONTH_OR_REALIZED_PROFIT'});
 }catch{return null;}
}

// Strict browser boundary: no free-form source text, order identity, inferred
// external comparison or arbitrary navigation can be restored from a report.
export function projectBusinessFinancialCloseout(value){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
 const array=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const money=v=>v===null||int(v,Number.MIN_SAFE_INTEGER);
 const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const hrefs=['#businessMonth','#businessReconciliation','#businessMonthCalculationDetails','#businessMonthExpensesDetails','#commandPendingIncomeDetails','/admin?tab=products','/dashboard'];
 const sources=['MONTHLY_FINANCE','SAME_PUBLICATION_RECONCILIATION','SAVED_PRODUCTION_COSTS','SAVED_EXPENSES','CALENDAR_ADS','CURRENT_INCOME_PENDING'];
 const source=v=>{if(!exact(v,['name','checked_at','freshness'])||!sources.includes(v.name)||(v.checked_at!==null&&!int(v.checked_at,1,value.checked_at+60)))return false;const currentMonth=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000)).slice(0,7),expected=v.checked_at===null?'UNKNOWN':value.checked_at-v.checked_at<=900?'FRESH':v.name!=='CURRENT_INCOME_PENDING'&&value.month<currentMonth?'HISTORICAL':'STALE';return v.freshness===expected;};
 const codes=['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','TAX_POLICY_REQUIRED','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','FINANCIAL_SOURCE_STALE','RECONCILIATION_SCOPE_REQUIRED','RECONCILIATION_INCOMPLETE','ADJUSTMENT_FIELDS_UNAVAILABLE','ADJUSTMENT_CONFLICT','RETURN_DETAILS_PENDING','CURRENT_PENDING_DETAIL_UNAVAILABLE','CURRENT_PENDING_PARTIAL','CURRENT_PENDING_DETAIL_STALE'];
 const detailCodes=new Set(['CONFIGURATION','SIGNING_CONFIGURATION','UNAVAILABLE','PERMISSION_DENIED','RATE_LIMIT','INVALID_RESPONSE','RESULT_INVALID','TRANSPORT_CONFIGURATION','TRANSPORT_UNAVAILABLE','REQUEST_STALE','TIMEOUT','UPSTREAM_FAILED','UPSTREAM_HTTP','UPSTREAM_BODY_TOO_LARGE','UPSTREAM_INVALID_JSON','UPSTREAM_CONTENT_TYPE'].map(code=>'FINANCE_INCOME_DETAIL_'+code));
 const refreshCodes=new Set(['TRANSPORT_CONFIGURATION','TRANSPORT_UNAVAILABLE','REQUEST_STALE','TIMEOUT','UPSTREAM_FAILED','UPSTREAM_HTTP','UPSTREAM_BODY_TOO_LARGE','UPSTREAM_INVALID_JSON','UPSTREAM_CONTENT_TYPE','REQUEST_INVALID','TOKEN_INVALID','SIGNING_INPUT_INVALID','SIGNING_KEY_CONFIGURATION','SIGNATURE_UNAVAILABLE','API_ERROR','IDENTITY_MISMATCH','RESPONSE_CONTEXT_INVALID','RESPONSE_EXPIRED','RESPONSE_INVALID','TOKEN_NOT_ROTATED'].map(code=>'FINANCE_REFRESH_'+code));
 const authorizationCodes=new Set(['FINANCE_AUTHORIZATION_REQUIRED','FINANCE_AUTHORIZATION_IN_PROGRESS','FINANCE_AUTHORIZATION_CONFLICT','FINANCE_REFRESH_CONFLICT','FINANCE_REFRESH_IN_PROGRESS','FINANCE_REFRESH_FAILED','FINANCE_REFRESH_COORDINATOR_CONFIGURATION','FINANCE_CLOCK_CONFIGURATION','FINANCE_DATABASE_CONFIGURATION','FINANCE_ENCRYPTION_CONFIGURATION','FINANCE_ENCRYPTION_FAILED','FINANCE_ENCRYPTION_KEY_MISMATCH','FINANCE_INVALID_ENCODING','FINANCE_INVALID_LEASE','FINANCE_INVALID_REVISION','FINANCE_INVALID_TOKENS','FINANCE_REVISION_CONFLICT','FINANCE_STORAGE_UNAVAILABLE','FINANCE_TOKEN_DECRYPT_FAILED']);
 const stageFor=code=>refreshCodes.has(code)||authorizationCodes.has(code)?'AUTHORIZATION':code==='FINANCE_INCOME_DETAIL_SIGNING_CONFIGURATION'?'SIGNING':code==='FINANCE_INCOME_DETAIL_CONFIGURATION'?'CONFIGURATION':code==='FINANCE_INCOME_DETAIL_UPSTREAM_HTTP'?'PROVIDER_HTTP':['FINANCE_INCOME_DETAIL_INVALID_RESPONSE','FINANCE_INCOME_DETAIL_PERMISSION_DENIED','FINANCE_INCOME_DETAIL_RATE_LIMIT'].includes(code)?'PROVIDER_RESPONSE':code==='FINANCE_INCOME_DETAIL_RESULT_INVALID'?'PROJECTOR':code==='FINANCE_INCOME_DETAIL_UNAVAILABLE'?'UNKNOWN':'TRANSPORT';
 const stages=['AUTHORIZATION','SIGNING','CONFIGURATION','PROVIDER_HTTP','PROVIDER_RESPONSE','PROJECTOR','UNKNOWN','TRANSPORT'];
 const providerCodes=['error_param','error_auth','error_sign','error_api_permission','error_partner_id','error_ip','error_limit','error_rate_limit','invalid_access_token','error_not_support','error_shop','error_server','error_system'];
 const responseKinds=['JSON_SIGNATURE_REJECTED','JSON_CODE_REJECTED','JSON_PARAMETER_REJECTED','JSON_AUTHORIZATION_REJECTED','JSON_PERMISSION_REJECTED','JSON_PARTNER_REJECTED','JSON_IP_REJECTED','JSON_UNRECOGNIZED','JSON_INVALID','JSON_BODY_TOO_LARGE','HTML_CONTENT_TYPE','OTHER_CONTENT_TYPE','ROOT_INVALID','IDENTITY_MISMATCH','PROVIDER_ERROR','INCOME_CONTAINER_MISSING','INCOME_LIST_INVALID','PAGE_CURSOR_INVALID','PAGE_SIZE_INVALID','ROW_IDENTITY_INVALID','ROW_CURRENCY_INVALID','ROW_AMOUNT_INVALID','ROW_STATUS_INVALID','ROW_TEXT_INVALID'];
 const technical=v=>v===null||exact(v,['code','stage','http','provider_code','response_kind'])&&(detailCodes.has(v.code)||refreshCodes.has(v.code)||authorizationCodes.has(v.code))&&stages.includes(v.stage)&&v.stage===stageFor(v.code)&&(v.http===null||int(v.http,100,599))&&(v.provider_code===null||providerCodes.includes(v.provider_code))&&(v.response_kind===null||responseKinds.includes(v.response_kind));
 const actions=['WAIT_FOR_COLLECTION','REVIEW_COLLECTION_LIMIT','RESTORE_SOURCE','REVIEW_ORDER_STATUS','COMPLETE_PAYMENT_EVIDENCE','COMPARE_RETURN_OUTCOMES','COMPLETE_VARIANT_COSTS','CONFIRM_MONTHLY_TAX','WAIT_FOR_ADS_COVERAGE','CONFIRM_EXPENSES','CLASSIFY_RECHARGE','COMPLETE_ADJUSTMENTS','REVIEW_ARITHMETIC','WAIT_FOR_REFRESH','WAIT_FOR_MATCHING_PUBLICATION','WAIT_FOR_RECONCILIATION','RESOLVE_ADJUSTMENT_CONFLICT','WAIT_FOR_RETURN_DETAILS','RESTORE_PENDING_DETAIL','VALIDATE_PENDING_BEFORE_PAGINATION'];
 const amountBases=['KNOWN_PAID_SALES','KNOWN_PAID_REPASS','NOT_AVAILABLE','REPORTED_REFUND_ALL_COHORTS_INFORMATION_ONLY','IDENTIFIED_PRODUCTION_COST','MONTHLY_TAX','CALENDAR_ADS_SPEND','DECLARED_EXTERNAL_EXPENSES','REPORTED_RECHARGE','CURRENT_PROVIDER_PENDING'];
 const reasons=['FULL_CLOSED_CALENDAR','MONTH_OR_CUT_STILL_OPEN','REPORTED_REPASS_NOT_BANK_RECEIPT','MATCHING_RECONCILIATION_REQUIRED','OUTCOMES_REQUIRE_COMPARISON','NO_REVIEW_OR_RETURN_IN_PAID_SCOPE','ALL_SOLD_UNITS_COSTED','MISSING_VARIANT_COSTS','SAME_CALENDAR_SPEND','MONTHLY_TAX_ONCE','EXPLICIT_SAVED_EXPENSES'];
 try{
  if(!exact(value,['schema','month','start_date','end_date','checked_at','publication_revision','scope_status','status','period_complete','versions','totals','cases','checks','comparisons','basis'])||value.schema!=='business_financial_closeout_v1'||typeof value.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||value.month<'2000-01'||value.start_date!==value.month+'-01'||!day(value.start_date)||!day(value.end_date)||value.end_date.slice(0,7)!==value.month||!int(value.checked_at,1,9999999999)||(value.publication_revision!==null&&!int(value.publication_revision,1,2147483647))||!['WAITING','MISMATCH','SAME_PUBLICATION'].includes(value.scope_status)||!['PREPARING','READY_FOR_COMPARISON'].includes(value.status)||typeof value.period_complete!=='boolean'||value.basis!=='SAVED_SAME_PUBLICATION_PREPARATION_NOT_CLOSED_MONTH_OR_REALIZED_PROFIT')return null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000)),lastDay=new Date(Date.UTC(Number(value.month.slice(0,4)),Number(value.month.slice(5)),0)).toISOString().slice(0,10);
  if(value.end_date>today||value.period_complete&&(value.end_date!==lastDay||today<=lastDay)||value.scope_status==='SAME_PUBLICATION'&&value.publication_revision===null)return null;
  if(!exact(value.versions,['bindings','costs','cost_rules','tax_policy','expenses','classifications'])||!int(value.versions.bindings,1,2147483647)||!int(value.versions.costs,1,2147483647)||!int(value.versions.expenses,0,2147483646)||!['cost_rules','tax_policy','classifications'].every(key=>value.versions[key]===null||int(value.versions[key],key==='tax_policy'?0:1,2147483647)))return null;
  if(!exact(value.totals,['expected_repass_cents','after_adjustment_repass_cents','known_production_cents','invoice_tax_cents','ads_spend_cents','external_expenses_cents','provisional_balance_cents','reported_refund_information_cents','realized_profit_cents'])||!Object.values(value.totals).every(money)||value.totals.realized_profit_cents!==null||['known_production_cents','invoice_tax_cents','ads_spend_cents','external_expenses_cents','reported_refund_information_cents'].some(key=>value.totals[key]!==null&&value.totals[key]<0)||value.scope_status!=='SAME_PUBLICATION'&&(value.totals.after_adjustment_repass_cents!==null||value.totals.reported_refund_information_cents!==null))return null;
  if(!array(value.cases,codes.length)||new Set(value.cases.map(row=>Object.getOwnPropertyDescriptor(row||{},'code')?.value)).size!==value.cases.length)return null;
  for(const row of value.cases){if(!exact(row,['code','agent_id','state','affected_count','affected_unit','known_amount_cents','amount_basis','source','next_action','href','technical_code','technical_diagnostic'])||!codes.includes(row.code)||!['finance','returns','products','ads','auditor'].includes(row.agent_id)||!['OPEN','WORKING','BLOCKED'].includes(row.state)||(row.affected_count!==null&&!int(row.affected_count))||!['ORDERS','UNITS','CASES','DAYS','SOURCES','MONTH','ROWS'].includes(row.affected_unit)||!money(row.known_amount_cents)||!amountBases.includes(row.amount_basis)||!source(row.source)||!actions.includes(row.next_action)||!hrefs.includes(row.href)||!technical(row.technical_diagnostic)||row.technical_diagnostic!==null&&row.code!=='CURRENT_PENDING_DETAIL_UNAVAILABLE'||(row.technical_code!==null&&!['UNAVAILABLE','CONFIGURATION','RESPONSE_INVALID','REDIRECT_REJECTED','HTTP_ERROR','CONTENT_TYPE_INVALID','BODY_LIMIT','JSON_INVALID','FRAME_INVALID','TIMEOUT','NETWORK_ERROR','BODY_READ_ERROR'].some(suffix=>row.technical_code==='FINANCE_INCOME_DETAIL_'+suffix)))return null;}
  const ids=['PERIOD','REPASSES','RETURNS','PRODUCTION','ADS','TAX','EXPENSES'];
  if(!array(value.checks,ids.length)||value.checks.length!==ids.length)return null;
  for(let i=0;i<ids.length;i++){const row=value.checks[i];if(!exact(row,['id','state','known_amount_cents','source','reason','href'])||row.id!==ids[i]||!['VERIFIED','PENDING'].includes(row.state)||!money(row.known_amount_cents)||!source(row.source)||!reasons.includes(row.reason)||!hrefs.includes(row.href))return null;}
  if(value.checks[0].state!==(value.period_complete?'VERIFIED':'PENDING')||value.checks[0].reason!==(value.period_complete?'FULL_CLOSED_CALENDAR':'MONTH_OR_CUT_STILL_OPEN')||value.checks.some(row=>['REPASSES','RETURNS'].includes(row.id)&&row.state==='VERIFIED'&&value.scope_status!=='SAME_PUBLICATION'))return null;
  if(!array(value.comparisons,2)||value.comparisons.length!==2)return null;
  for(let i=0;i<2;i++){const row=value.comparisons[i];if(!exact(row,['id','state','expected_cents','basis'])||row.id!==['SELLER_CENTRE','BANK'][i]||row.state!=='NOT_COMPARED'||!money(row.expected_cents)||row.basis!==['SAME_PAID_COHORT_REPORTED_REPASS','BANK_STATEMENT_REQUIRED_SEPARATE_SETTLEMENT_CALENDAR'][i]||i===1&&row.expected_cents!==null)return null;}
  const ready=value.period_complete&&value.scope_status==='SAME_PUBLICATION'&&value.checks.every(row=>row.state==='VERIFIED')&&value.cases.every(row=>row.source.name==='CURRENT_INCOME_PENDING');
  if(value.status!==(ready?'READY_FOR_COMPARISON':'PREPARING')||JSON.stringify(value).length>32768)return null;
  return JSON.parse(JSON.stringify(value));
 }catch{return null;}
}
