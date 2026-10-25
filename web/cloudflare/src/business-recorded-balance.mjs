// A subtotal of recorded inputs, never a replacement for the strict monthly
// result or evidence that the payout was received. Keep every helper local:
// this pure function is also embedded in the browser with .toString().
export function buildRecordedBusinessBalance(frame){
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const read=(value,key)=>plain(value)?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
 const own=(value,keys)=>plain(value)&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
 const int=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
 const array=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(field=>field&&Object.hasOwn(field,'value'));
 const day=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 const safe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
 const knownCodes=['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','TAX_POLICY_REQUIRED','FINANCIAL_SOURCE_STALE'];
 const allowedCodes=['PRODUCTION_COST_INCOMPLETE','RETURNS_NOT_RECONCILED','STATUS_REVIEW_REQUIRED','FINANCIAL_SOURCE_STALE'];
 const output={schema:'recorded_business_balance_v1',status:'UNAVAILABLE',amount_cents:null,known_production_cents:null,pending_production_units:null,review_orders:null,returns_orders:null,source_checked_at:{finance_oldest_at:null,finance_latest_at:null,ads_at:null},pending:[],basis:'RECORDED_PAYOUT_MINUS_IDENTIFIED_COSTS_NOT_FINAL_PROFIT'};
 const unsafe=()=>{if(!output.pending.includes('ARITHMETIC_UNSAFE'))output.pending.push('ARITHMETIC_UNSAFE');return output;};
 try{
  if(!own(frame,['schema','month','start_date','end_date','status','checked_at','progress','coverage','sales_cents','known_sales_cents','expected_repass_cents','known_expected_repass_cents','production_cost_cents','known_production_cost_cents','invoice_tax_cents','known_invoice_tax_cents','ads_adjustment_cents','ads','expenses','result','unmapped_variants','tax','source_checked_at'])||read(frame,'schema')!=='business_month_v1')return output;
  const result=read(frame,'result'),pending=read(result,'pending');
  if(!own(result,['pending','net_estimate_cents','net_profit_cents','basis'])||!array(pending,knownCodes.length)||new Set(pending).size!==pending.length||!pending.every(code=>knownCodes.includes(code))||read(result,'net_profit_cents')!==null||read(result,'basis')!=='PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE')return output;
  output.pending=[...pending];
  const knownProduction=read(frame,'known_production_cost_cents');if(int(knownProduction))output.known_production_cents=knownProduction;
  const month=read(frame,'month'),start=read(frame,'start_date'),end=read(frame,'end_date'),checked=read(frame,'checked_at');
  if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!day(start)||!day(end)||start!==month+'-01'||end.slice(0,7)!==month||!int(checked,1,9999999999))return output;
  const checkedDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(checked*1000));if(end>checkedDay)return output;
  const coverage=read(frame,'coverage'),counts=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
  if(!own(coverage,counts)||!counts.every(key=>int(read(coverage,key),0,3000)))return output;
  const c=Object.fromEntries(counts.map(key=>[key,read(coverage,key)]));
  if(c.orders!==c.paid+c.cancelled+c.cancel_pending+c.unpaid+c.other+c.unknown||c.paid!==c.completed+c.ongoing||c.payment_covered+c.payment_missing!==c.paid||c.returns+c.returns_unknown>c.paid||c.returns>c.payment_covered||c.returns_unknown<c.payment_missing)return output;
  output.review_orders=c.cancel_pending+c.other+c.unknown;output.returns_orders=c.returns+c.returns_unknown;
  const unmapped=read(frame,'unmapped_variants');if(!array(unmapped,3000))return output;
  const variants=new Set();let missing=0n;
  for(const row of unmapped){
   const item=read(row,'item_id'),model=read(row,'model_id'),quantity=read(row,'quantity');
   if(!own(row,['item_id','model_id','quantity'])||typeof item!=='string'||!/^[1-9][0-9]{0,19}$/.test(item)||typeof model!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(model)||!int(quantity,1)||variants.has(item+':'+model))return output;
   variants.add(item+':'+model);missing+=BigInt(quantity);
  }
  const missingUnits=safe(missing);if(missingUnits===null)return unsafe();output.pending_production_units=missingUnits;
  const production=read(frame,'production_cost_cents');
  if(!int(knownProduction)||production!==null&&(!int(production)||production!==knownProduction))return output;
  if(missingUnits>0?(production!==null||!pending.includes('PRODUCTION_COST_INCOMPLETE')):production===null)return output;
  if(missingUnits===0&&pending.includes('PRODUCTION_COST_INCOMPLETE')||output.review_orders>0&&!pending.includes('STATUS_REVIEW_REQUIRED')||output.returns_orders>0&&!pending.includes('RETURNS_NOT_RECONCILED'))return output;
  const progress=read(frame,'progress'),windowCount=Math.ceil(Number(end.slice(8))/15),capacityDescriptor=plain(progress)?Object.getOwnPropertyDescriptor(progress,'order_capacity'):null;
  if(capacityDescriptor&&!Object.hasOwn(capacityDescriptor,'value'))return output;
  const capacity=capacityDescriptor?capacityDescriptor.value:read(progress,'pages_read')*5;
  if(read(frame,'status')!=='COMPLETE'||!own(progress,['windows_total','windows_complete','pages_read'])||read(progress,'windows_total')!==windowCount||read(progress,'windows_complete')!==windowCount||!int(read(progress,'pages_read'),0,windowCount*200)||!int(capacity,read(progress,'pages_read')*5,read(progress,'pages_read')*20)||(capacity-read(progress,'pages_read')*5)%15!==0||c.orders>capacity||c.payment_missing!==0||pending.some(code=>!allowedCodes.includes(code)))return output;
  const collectionDescriptor=Object.getOwnPropertyDescriptor(frame,'collection');
  if(collectionDescriptor){if(!Object.hasOwn(collectionDescriptor,'value'))return output;const collection=collectionDescriptor.value;if(!own(collection,['schema','state','code','retry_after_seconds'])||read(collection,'schema')!=='business_month_collection_v1'||read(collection,'state')!=='READY'||read(collection,'code')!==null||read(collection,'retry_after_seconds')!==0)return output;}
  const sales=read(frame,'sales_cents'),payout=read(frame,'expected_repass_cents');
  if(!int(sales)||sales!==read(frame,'known_sales_cents')||!int(payout,Number.MIN_SAFE_INTEGER)||payout!==read(frame,'known_expected_repass_cents'))return output;
  const tax=read(frame,'tax'),taxCents=read(frame,'invoice_tax_cents');
  if(!own(tax,['schema','regime','year','policy_revision','monthly_das_cents','tax_cents','status','source','basis'])||read(tax,'schema')!=='business_month_tax_v1'||read(tax,'regime')!=='MEI'||read(tax,'year')!==Number(month.slice(0,4))||!int(read(tax,'policy_revision'),1,2147483647)||read(tax,'status')!=='DECLARED'||read(tax,'source')!=='OPERATOR_DECLARED_DAS'||read(tax,'basis')!=='MONTHLY_COMPETENCE_NO_PRORATION'||!int(taxCents,1,1000000)||taxCents!==read(tax,'monthly_das_cents')||taxCents!==read(tax,'tax_cents')||taxCents!==read(frame,'known_invoice_tax_cents'))return output;
  const ads=read(frame,'ads'),spend=read(ads,'expense_cents'),adsAt=read(ads,'fetched_at'),totalDays=(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000+1,days=read(ads,'days');
  if(!own(ads,['schema','status','start_date','end_date','fetched_at','total_days','covered_days','missing_dates','expense_cents','known_expense_cents','days','unit_confirmation','basis','diagnostic'])||read(ads,'schema')!=='ads_calendar_v1'||read(ads,'status')!=='AVAILABLE'||read(ads,'start_date')!==start||read(ads,'end_date')!==end||!int(adsAt,1,checked)||checked-adsAt>900||read(ads,'total_days')!==totalDays||read(ads,'covered_days')!==totalDays||!array(read(ads,'missing_dates'),31)||read(ads,'missing_dates').length!==0||!int(spend)||spend!==read(ads,'known_expense_cents')||!array(days,31)||days.length!==totalDays||read(ads,'unit_confirmation')!=='OPERATOR_CONFIRMED_BRL_2026_10_20'||read(ads,'basis')!=='CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION'||read(ads,'diagnostic')!==null)return output;
  let dailySpend=0n;for(let index=0;index<days.length;index++){const row=days[index],date=new Date(Date.parse(start+'T00:00:00Z')+index*86400000).toISOString().slice(0,10),amount=read(row,'expense_cents');if(!own(row,['date','expense_cents'])||read(row,'date')!==date||!int(amount))return output;dailySpend+=BigInt(amount);}if(dailySpend!==BigInt(spend))return output;
  const expenses=read(frame,'expenses'),external=read(expenses,'external_expenses_cents'),treatment=read(expenses,'recharge_treatment'),updated=read(expenses,'updated_at'),adjustment=read(frame,'ads_adjustment_cents');
  if(!own(expenses,['revision','external_expenses_cents','recharge_treatment','updated_at'])||!int(read(expenses,'revision'),1,2147483646)||!int(external)||!['UNCONFIRMED','ADS_RECHARGE','TECH_SUPPORT'].includes(treatment)||typeof updated!=='string'||!Number.isFinite(Date.parse(updated))||Date.parse(updated)>checked*1000+60000||!int(adjustment)||adjustment>0&&treatment==='UNCONFIRMED')return output;
  const sources=read(frame,'source_checked_at'),sourceKeys=['finance_oldest_at','finance_latest_at','ads_at'];
  if(!own(sources,sourceKeys)||!sourceKeys.every(key=>int(read(sources,key),1,checked))||read(sources,'finance_oldest_at')>read(sources,'finance_latest_at')||read(sources,'ads_at')!==adsAt)return output;
  output.source_checked_at=Object.fromEntries(sourceKeys.map(key=>[key,read(sources,key)]));
  const stale=month===checkedDay.slice(0,7)&&checked-read(sources,'finance_oldest_at')>900;if(stale!==pending.includes('FINANCIAL_SOURCE_STALE'))return output;
  const restore=treatment==='ADS_RECHARGE'?adjustment:0,amount=safe(BigInt(payout)-BigInt(knownProduction)-BigInt(taxCents)-BigInt(spend)-BigInt(external)+BigInt(restore));if(amount===null)return unsafe();
  const strict=read(result,'net_estimate_cents');if(strict!==null&&(!int(strict,Number.MIN_SAFE_INTEGER)||strict!==amount||pending.length||missingUnits!==0))return output;
  output.amount_cents=amount;output.status='AVAILABLE';return output;
 }catch{return output;}
}

// Strict DTO projection for the opt-in view. No financial inputs are recovered
// from this object: provenance and unresolved coverage remain visible.
export function projectRecordedBusinessBalance(value){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const int=(row,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
 const nullable=row=>row===null||int(row);
 const array=rows=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=16&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,index)=>Object.getOwnPropertyDescriptor(rows,String(index))).every(field=>field&&Object.hasOwn(field,'value'));
 const codes=['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','TAX_POLICY_REQUIRED','FINANCIAL_SOURCE_STALE'];
 const allowed=['PRODUCTION_COST_INCOMPLETE','RETURNS_NOT_RECONCILED','STATUS_REVIEW_REQUIRED','FINANCIAL_SOURCE_STALE'];
 try{
  if(!exact(value,['schema','status','amount_cents','known_production_cents','pending_production_units','review_orders','returns_orders','source_checked_at','pending','basis'])||value.schema!=='recorded_business_balance_v1'||!['AVAILABLE','UNAVAILABLE'].includes(value.status)||value.basis!=='RECORDED_PAYOUT_MINUS_IDENTIFIED_COSTS_NOT_FINAL_PROFIT'||!nullable(value.known_production_cents)||!nullable(value.pending_production_units)||!nullable(value.review_orders)||!nullable(value.returns_orders)||value.review_orders!==null&&!int(value.review_orders,0,3000)||value.returns_orders!==null&&!int(value.returns_orders,0,3000)||!array(value.pending)||new Set(value.pending).size!==value.pending.length||!value.pending.every(code=>codes.includes(code)))return null;
  const sources=value.source_checked_at,keys=['finance_oldest_at','finance_latest_at','ads_at'];
  if(!exact(sources,keys)||!keys.every(key=>sources[key]===null||int(sources[key],1,9999999999))||keys.some(key=>sources[key]===null)&&!keys.every(key=>sources[key]===null)||sources.finance_oldest_at!==null&&sources.finance_oldest_at>sources.finance_latest_at)return null;
  if(value.status==='UNAVAILABLE'){if(value.amount_cents!==null)return null;}
  else if(!int(value.amount_cents,Number.MIN_SAFE_INTEGER)||value.known_production_cents===null||value.pending_production_units===null||value.review_orders===null||value.returns_orders===null||sources.finance_oldest_at===null||value.pending.some(code=>!allowed.includes(code))||value.pending_production_units>0&&!value.pending.includes('PRODUCTION_COST_INCOMPLETE')||value.pending_production_units===0&&value.pending.includes('PRODUCTION_COST_INCOMPLETE')||value.review_orders>0&&!value.pending.includes('STATUS_REVIEW_REQUIRED')||value.returns_orders>0&&!value.pending.includes('RETURNS_NOT_RECONCILED'))return null;
  return {...value,source_checked_at:{...sources},pending:[...value.pending]};
 }catch{return null;}
}
