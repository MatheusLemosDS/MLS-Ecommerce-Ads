// Presentation of an already validated daily row. Missing costs remain missing
// in the financial DTO: this helper only names a separate, explicitly bounded
// subtotal. Keep self-contained for the browser's frozen .toString() copy.
export function projectDailyProfitPresentation(row){
 try{
  const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
  const read=(value,key)=>plain(value)?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
  const fields=['state','reason','coverage','payout_basis','payout_cents','production_cost_cents','known_production_cost_cents','production_coverage','ads_spend_cents','recharge_addback_cents','allocated_das_cents','allocated_expenses_cents','operating_balance_cents','estimate_cents','known_estimate_cents','pending'];
  if(!plain(row)||!fields.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value')))return null;
  const int=(value,signed=false)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&(signed||value>=0);
  const cents=(value,signed=false)=>value===null||int(value,signed);
  const safe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
  const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
  const codes=['DAILY_HISTORY_PENDING','CREATION_DATE_INCOMPLETE','PAYMENT_INCOMPLETE','PRODUCTION_COST_INCOMPLETE','ADS_UNAVAILABLE','ADS_SOURCE_STALE','EXTERNAL_EXPENSES_REQUIRED','TAX_POLICY_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ADJUSTMENTS_PENDING','ADJUSTMENT_CONFLICT','STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED','FINANCIAL_SOURCE_STALE','SOURCE_UNAVAILABLE','ARITHMETIC_UNSAFE'];
  const pending=read(row,'pending');
  if(!Array.isArray(pending)||Object.getPrototypeOf(pending)!==Array.prototype||pending.length>codes.length||Reflect.ownKeys(pending).length!==pending.length+1||!Array.from({length:pending.length},(_,index)=>Object.hasOwn(Object.getOwnPropertyDescriptor(pending,String(index))||{},'value')).every(Boolean)||new Set(pending).size!==pending.length||!pending.every(code=>codes.includes(code))||pending.includes('ARITHMETIC_UNSAFE'))return null;
  const state=read(row,'state'),reason=read(row,'reason');if(!['PROVISIONAL','PARTIAL_COSTS','UNAVAILABLE'].includes(state)||![null,'DAILY_HISTORY_PENDING','CREATION_DATE_INCOMPLETE'].includes(reason))return null;
  const flag=code=>pending.includes(code),has=(code,condition)=>flag(code)===Boolean(condition);
  const das=read(row,'allocated_das_cents'),expenses=read(row,'allocated_expenses_cents'),ads=read(row,'ads_spend_cents'),payout=read(row,'payout_cents'),recharge=read(row,'recharge_addback_cents'),production=read(row,'production_cost_cents'),knownProduction=read(row,'known_production_cost_cents'),operating=read(row,'operating_balance_cents'),estimate=read(row,'estimate_cents'),knownEstimate=read(row,'known_estimate_cents'),p=read(row,'production_coverage'),coverage=read(row,'coverage'),payoutBasis=read(row,'payout_basis');
  if(![das,expenses,ads,recharge,production,knownProduction].every(value=>cents(value))||![payout,operating,estimate,knownEstimate].every(value=>cents(value,true))||!exact(p,['total_units','known_units','pending_units'])||!['BASE_REPASS','AFTER_ADJUSTMENTS','UNAVAILABLE'].includes(payoutBasis)||!has('TAX_POLICY_REQUIRED',das===null)||!has('EXTERNAL_EXPENSES_REQUIRED',expenses===null)||!has('ADS_UNAVAILABLE',ads===null)||!has('DAILY_HISTORY_PENDING',reason==='DAILY_HISTORY_PENDING')||!has('CREATION_DATE_INCOMPLETE',reason==='CREATION_DATE_INCOMPLETE'))return null;
  const missing=[];if(das===null)missing.push('TAX_POLICY_REQUIRED');if(expenses===null)missing.push('EXTERNAL_EXPENSES_REQUIRED');
  const result=(presentation,basis,amount=null)=>({schema:'daily_profit_presentation_v1',state:presentation,basis,amount_cents:amount,monthly_costs_missing:[...missing],das_included:amount!==null&&das!==null,expenses_included:amount!==null&&expenses!==null});
  if(reason!==null){
   if(state!=='UNAVAILABLE'||coverage!==null||Object.values(p).some(value=>value!==null)||[payout,production,knownProduction,recharge,operating,estimate,knownEstimate].some(value=>value!==null)||payoutBasis!=='UNAVAILABLE')return null;
   return result('UNAVAILABLE','UNAVAILABLE');
  }
  if(!plain(coverage)||!int(read(coverage,'paid'))||!int(read(coverage,'payment_missing'))||!Object.values(p).every(value=>int(value))||BigInt(p.known_units)+BigInt(p.pending_units)!==BigInt(p.total_units)||p.total_units<read(coverage,'paid')||read(coverage,'paid')===0&&p.total_units!==0||!has('PAYMENT_INCOMPLETE',read(coverage,'payment_missing')>0)||!has('PRODUCTION_COST_INCOMPLETE',p.pending_units>0)||knownProduction===null||p.known_units===0&&knownProduction!==0||production!==(p.pending_units>0?null:knownProduction))return null;
  if(payout===null?payoutBasis!=='UNAVAILABLE':payoutBasis==='UNAVAILABLE')return null;
  if(read(coverage,'payment_missing')>0&&payout!==null)return null;
  if(recharge===null?(!flag('RECHARGE_TREATMENT_REQUIRED')&&!flag('ADJUSTMENT_UNAVAILABLE')):flag('RECHARGE_TREATMENT_REQUIRED')||flag('ADJUSTMENT_UNAVAILABLE'))return null;
  let knownOperating=null,expectedOperating=null,expectedKnown=null,expectedEstimate=null;
  if(payout!==null&&recharge!==null&&ads!==null){
   knownOperating=safe(BigInt(payout)+BigInt(recharge)-BigInt(knownProduction)-BigInt(ads));if(knownOperating===null)return null;
   if(production!==null)expectedOperating=knownOperating;
   if(das!==null&&expenses!==null){expectedKnown=safe(BigInt(knownOperating)-BigInt(das)-BigInt(expenses));if(expectedKnown===null)return null;if(production!==null)expectedEstimate=expectedKnown;}
  }
  if(operating!==expectedOperating||knownEstimate!==expectedKnown||estimate!==expectedEstimate||state!==(expectedEstimate!==null?'PROVISIONAL':expectedKnown!==null?'PARTIAL_COSTS':'UNAVAILABLE'))return null;
  if(expectedEstimate!==null)return result('ESTIMATE','AFTER_DAILY_AND_ALLOCATED_MONTHLY_COSTS',expectedEstimate);
  if(expectedKnown!==null)return result('KNOWN_COSTS','AFTER_IDENTIFIED_PRODUCTION_AND_MONTHLY_COSTS',expectedKnown);
  if(expectedOperating!==null&&missing.length){
   let subtotal=BigInt(expectedOperating);if(das!==null)subtotal-=BigInt(das);if(expenses!==null)subtotal-=BigInt(expenses);const amount=safe(subtotal);if(amount===null)return null;
   const basis=das===null&&expenses===null?'BEFORE_UNCONFIRMED_DAS_AND_EXPENSES':das===null?'BEFORE_UNCONFIRMED_DAS':'BEFORE_UNCONFIRMED_EXPENSES';
   return result('BEFORE_MONTHLY_COSTS',basis,amount);
  }
  return result('UNAVAILABLE','UNAVAILABLE');
 }catch{return null;}
}
