// A separate presentation of a canonical monthly frame. Financial results,
// pending reasons and unknown deductions are never rewritten. Dependencies are
// explicit so this function can be frozen into the browser without closures.
export function projectMonthlyProfitPresentation(frame,projectMonthlyFrame,buildSummary){
 try{
  if(typeof projectMonthlyFrame!=='function'||typeof buildSummary!=='function')return null;
  const checked=projectMonthlyFrame(frame);if(!checked)return null;
  const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
  const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
  const int=(value,signed=false)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&(signed||value>=0);
  const safe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
  const summary=buildSummary(checked),summaryKeys=['schema','state','balance_cents','before_production_cents','known_production_cents','production_complete','costs_after_payout_cents','production_coverage','pending','basis'];
  if(!exact(summary,summaryKeys)||summary.schema!=='monthly_financial_summary_v1'||!['WAITING','READY','PROVISIONAL','PARTIAL_COSTS'].includes(summary.state)||!Array.isArray(summary.pending)||typeof summary.production_complete!=='boolean')return null;
  const pending=checked.result.pending,ads=checked.ads,tax=checked.tax;
  // A numeric saved expense can still be an unfinished declaration. The
  // original pending flag takes precedence over the saved amount.
  const taxMissing=pending.includes('INVOICE_TAX_UNAVAILABLE')||pending.includes('TAX_POLICY_REQUIRED')||checked.invoice_tax_cents===null;
  const expensesMissing=pending.includes('EXTERNAL_EXPENSES_REQUIRED')||checked.expenses.external_expenses_cents===null;
  const missing=[];if(taxMissing)missing.push('TAX_POLICY_REQUIRED');if(expensesMissing)missing.push('EXTERNAL_EXPENSES_REQUIRED');
  const fullAds=ads?.status==='AVAILABLE'&&ads.start_date===checked.start_date&&ads.end_date===checked.end_date&&ads.covered_days===ads.total_days&&ads.missing_dates.length===0&&int(ads.expense_cents)&&ads.expense_cents===ads.known_expense_cents;
  const adsPending=pending.includes('ADS_UNAVAILABLE'),adsAt=fullAds?ads.fetched_at:null,adsPartial=fullAds?ads.day_partial:null;
  const margin=amount=>amount!==null&&int(checked.sales_cents)&&checked.sales_cents>0?safe(BigInt(amount)*10000n/BigInt(checked.sales_cents)):null;
  const result=(state,basis,amount=null)=>({schema:'monthly_profit_presentation_v1',state,basis,amount_cents:amount,margin_bps:margin(amount),monthly_costs_missing:[...missing],das_included:amount!==null&&!taxMissing,expenses_included:amount!==null&&!expensesMissing,ads_pending:adsPending,ads_checked_at:adsAt,ads_day_partial:adsPartial});
  const unavailable=()=>result('UNAVAILABLE','UNAVAILABLE');
  if(summary.state!=='WAITING'){
   if(!int(summary.balance_cents,true)||missing.length||adsPending||!fullAds)return null;
   return summary.state==='PARTIAL_COSTS'?result('KNOWN_COSTS','AFTER_IDENTIFIED_PRODUCTION_AND_MONTHLY_COSTS',summary.balance_cents):result('ESTIMATE','AFTER_PRODUCTION_ADS_AND_MONTHLY_COSTS',summary.balance_cents);
  }
  const allowed=['STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','TAX_POLICY_REQUIRED','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','FINANCIAL_SOURCE_STALE'];
  if(checked.status!=='COMPLETE'||checked.coverage.payment_missing!==0||pending.some(code=>!allowed.includes(code))||summary.pending.includes('ARITHMETIC_UNSAFE')||checked.collection?.state==='BLOCKED'||!fullAds)return unavailable();
  if(!int(checked.expected_repass_cents,true)||checked.expected_repass_cents!==checked.known_expected_repass_cents||!int(checked.sales_cents)||checked.sales_cents!==checked.known_sales_cents||!int(summary.known_production_cents)||summary.known_production_cents!==checked.known_production_cost_cents)return unavailable();
  const adjustment=checked.ads_adjustment_cents,treatment=checked.expenses.recharge_treatment;
  if(!int(adjustment)||!['UNCONFIRMED','ADS_RECHARGE','TECH_SUPPORT'].includes(treatment)||adjustment>0&&treatment==='UNCONFIRMED')return unavailable();
  // Unknown fixed costs and unknown production do not acquire a combined
  // subtotal. Existing identified-production summaries remain unchanged.
  if(missing.length&&!summary.production_complete)return unavailable();
  if(taxMissing){
   if(tax?.regime!=='MEI'||tax.status!=='PENDING'||tax.tax_cents!==null||tax.monthly_das_cents!==null||checked.invoice_tax_cents!==null)return unavailable();
  }else if(!int(checked.invoice_tax_cents)||tax?.regime==='MEI'&&(tax.status!=='DECLARED'||tax.tax_cents!==checked.invoice_tax_cents||tax.monthly_das_cents!==checked.invoice_tax_cents))return unavailable();
  if(!expensesMissing&&!int(checked.expenses.external_expenses_cents))return unavailable();
  // Only actual observed components enter this bounded subtotal. Missing
  // monthly deductions stay null in the source and are named in its basis.
  let amount=BigInt(checked.expected_repass_cents)-BigInt(summary.known_production_cents)-BigInt(ads.expense_cents);
  if(treatment==='ADS_RECHARGE')amount+=BigInt(adjustment);
  if(!taxMissing)amount-=BigInt(checked.invoice_tax_cents);
  if(!expensesMissing)amount-=BigInt(checked.expenses.external_expenses_cents);
  const subtotal=safe(amount);if(subtotal===null)return unavailable();
  if(missing.length){
   const basis=taxMissing&&expensesMissing?'BEFORE_UNCONFIRMED_DAS_AND_EXPENSES':taxMissing?'BEFORE_UNCONFIRMED_DAS':'BEFORE_UNCONFIRMED_EXPENSES';
   return result('BEFORE_MONTHLY_COSTS',basis,subtotal);
  }
  // A complete but unconfirmed Ads calendar is a saved-value subtotal, never
  // a fresh estimate or a reason to clear the financial source's warning.
  return adsPending?result('KNOWN_COSTS','AFTER_IDENTIFIED_PRODUCTION_AND_MONTHLY_COSTS',subtotal):unavailable();
 }catch{return null;}
}

// Exact transport projection for browser snapshots and the Agent Registry.
// It validates this presentation DTO; financial proof remains in its canonical
// source frame. Keep standalone for the browser's frozen .toString() copy.
export function projectMonthlyProfitPresentationValue(value){
 try{
  const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
  const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
  const int=(row,signed=false)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&(signed||row>=0);
  const keys=['schema','state','basis','amount_cents','margin_bps','monthly_costs_missing','das_included','expenses_included','ads_pending','ads_checked_at','ads_day_partial'];
  if(!exact(value,keys)||value.schema!=='monthly_profit_presentation_v1'||!['ESTIMATE','KNOWN_COSTS','BEFORE_MONTHLY_COSTS','UNAVAILABLE'].includes(value.state)||typeof value.das_included!=='boolean'||typeof value.expenses_included!=='boolean'||typeof value.ads_pending!=='boolean')return null;
  const missing=value.monthly_costs_missing,codes=['TAX_POLICY_REQUIRED','EXTERNAL_EXPENSES_REQUIRED'];
  if(!Array.isArray(missing)||Object.getPrototypeOf(missing)!==Array.prototype||missing.length>2||Reflect.ownKeys(missing).length!==missing.length+1||!Array.from({length:missing.length},(_,index)=>Object.hasOwn(Object.getOwnPropertyDescriptor(missing,String(index))||{},'value')).every(Boolean)||!missing.every(code=>codes.includes(code))||new Set(missing).size!==missing.length||missing.some((code,index)=>code!==codes.filter(code=>missing.includes(code))[index]))return null;
  if(value.amount_cents!==null&&!int(value.amount_cents,true)||value.margin_bps!==null&&!int(value.margin_bps,true)||value.ads_checked_at!==null&&(!int(value.ads_checked_at)||value.ads_checked_at<1||value.ads_checked_at>9999999999)||(value.ads_checked_at===null?value.ads_day_partial!==null:typeof value.ads_day_partial!=='boolean'))return null;
  if(value.state==='UNAVAILABLE'){
   if(value.basis!=='UNAVAILABLE'||value.amount_cents!==null||value.margin_bps!==null||value.das_included||value.expenses_included)return null;
  }else{
   if(!int(value.amount_cents,true)||value.ads_checked_at===null||value.das_included===missing.includes('TAX_POLICY_REQUIRED')||value.expenses_included===missing.includes('EXTERNAL_EXPENSES_REQUIRED'))return null;
   if(value.state==='BEFORE_MONTHLY_COSTS'){
    const basis=missing.length===2?'BEFORE_UNCONFIRMED_DAS_AND_EXPENSES':missing[0]==='TAX_POLICY_REQUIRED'?'BEFORE_UNCONFIRMED_DAS':'BEFORE_UNCONFIRMED_EXPENSES';
    if(!missing.length||value.basis!==basis)return null;
   }else{
    if(missing.length)return null;
    if(value.state==='ESTIMATE'?(value.basis!=='AFTER_PRODUCTION_ADS_AND_MONTHLY_COSTS'||value.ads_pending):value.basis!=='AFTER_IDENTIFIED_PRODUCTION_AND_MONTHLY_COSTS')return null;
   }
  }
  return Object.fromEntries(keys.map(key=>[key,key==='monthly_costs_missing'?[...missing]:value[key]]));
 }catch{return null;}
}
