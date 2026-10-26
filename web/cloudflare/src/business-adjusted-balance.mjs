// Presentation of the same paid cohort with Shopee's compatible signed
// adjustments. Refund amounts are explanatory evidence, never a second debit.
// Dependencies are explicit so this exact function can run in the owner page.
export function buildAdjustedBusinessBalance(monthly,reconciliation,auditScope,validators={}){
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
 const int=(value,signed=false)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&(signed||value>=0);
 const safe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
 const output={schema:'adjusted_business_balance_v1',state:'UNAVAILABLE',reason:'SOURCE_MISMATCH',base_repass_cents:null,reported_adjustment_cents:null,after_adjustment_repass_cents:null,known_production_cents:null,costs_after_payout_cents:null,recharge_addback_cents:null,balance_cents:null,production_complete:false,source_checked_at:{finance_oldest_at:null,finance_latest_at:null,ads_at:null},pending:[],remaining_receivable_cents:null,realized_net_cents:null,basis:'PAID_MONTH_AFTER_REPORTED_ADJUSTMENTS_AND_IDENTIFIED_COSTS'};
 try{
  if(!exact(validators,['projectMonthly','projectReconciliation','projectFrame','projectScope','buildSummary'])||!Object.values(validators).every(fn=>typeof fn==='function'))return output;
  const frame=validators.projectMonthly(monthly),report=validators.projectReconciliation(reconciliation,validators.projectFrame),scope=validators.projectScope(auditScope);
  if(!frame||!report||!scope||frame.status!=='COMPLETE'||report.month!==frame.month||report.start_date!==frame.start_date||report.end_date!==frame.end_date||scope.start_date!==frame.start_date||scope.end_date!==frame.end_date)return output;
  const observedScope=validators.projectScope({publication_revision:report.source_revision,start_date:report.start_date,end_date:report.end_date,sources:report.sources});
  if(!observedScope||JSON.stringify(observedScope)!==JSON.stringify(scope))return output;
  output.pending=[...frame.result.pending];
  if(frame.source_checked_at)output.source_checked_at={...frame.source_checked_at};
  if(report.reports.length!==scope.sources.length){output.reason='RECONCILIATION_INCOMPLETE';return output;}
  const counts={orders:0,paid_orders:0,review_orders:0,return_orders:0,return_unknown_orders:0};
  for(const row of report.reports)for(const key of Object.keys(counts))counts[key]+=row.coverage[key];
  const c=frame.coverage;
  if(counts.orders!==c.orders||counts.paid_orders!==c.paid||counts.review_orders!==c.cancel_pending+c.other+c.unknown||counts.return_orders!==c.returns||counts.return_unknown_orders!==c.returns_unknown)return output;
  const dated=report.reports.filter(row=>row.source_checked_at.finance_oldest_at!==null);
  if(dated.length&&(!frame.source_checked_at||Math.min(...dated.map(row=>row.source_checked_at.finance_oldest_at))!==frame.source_checked_at.finance_oldest_at||Math.max(...dated.map(row=>row.source_checked_at.finance_latest_at))!==frame.source_checked_at.finance_latest_at))return output;
  if(report.reports.some(row=>row.adjustments.base_repass_cents===null||row.adjustments.after_adjustment_repass_cents===null)){output.reason='ADJUSTMENT_VALUES_UNAVAILABLE';return output;}
  const base=report.reports.reduce((sum,row)=>sum+BigInt(row.adjustments.base_repass_cents),0n),adjustment=report.reports.reduce((sum,row)=>sum+BigInt(row.adjustments.known_adjustment_cents),0n),after=report.reports.reduce((sum,row)=>sum+BigInt(row.adjustments.after_adjustment_repass_cents),0n);
  if(!int(frame.expected_repass_cents,true)||frame.expected_repass_cents!==frame.known_expected_repass_cents||base!==BigInt(frame.expected_repass_cents)||base+adjustment!==after)return output;
  const amounts=[safe(base),safe(adjustment),safe(after)];if(amounts.some(value=>value===null)){output.reason='ARITHMETIC_UNSAFE';return output;}
  [output.base_repass_cents,output.reported_adjustment_cents,output.after_adjustment_repass_cents]=amounts;
  const summary=validators.buildSummary(frame);
  if(!summary||!int(summary.balance_cents,true)||!int(summary.costs_after_payout_cents)||!int(summary.known_production_cents)||typeof summary.production_complete!=='boolean'){output.reason='MONTHLY_COSTS_UNAVAILABLE';return output;}
  const recharge=frame.expenses.recharge_treatment==='ADS_RECHARGE'?frame.ads_adjustment_cents:0;
  if(!int(recharge)){output.reason='MONTHLY_COSTS_UNAVAILABLE';return output;}
  const costs=BigInt(summary.costs_after_payout_cents),balance=after-costs+BigInt(recharge),known=BigInt(summary.balance_cents)+adjustment;
  if(balance!==known)return output;
  const result=safe(balance);if(result===null){output.reason='ARITHMETIC_UNSAFE';return output;}
  output.known_production_cents=summary.known_production_cents;output.costs_after_payout_cents=summary.costs_after_payout_cents;output.recharge_addback_cents=recharge;output.balance_cents=result;output.production_complete=summary.production_complete;
  output.state=summary.production_complete?'PROVISIONAL':'PARTIAL_COSTS';output.reason=null;return output;
 }catch{return output;}
}
