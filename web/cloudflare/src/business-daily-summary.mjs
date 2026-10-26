// A presentation over one immutable Finance publication and the exact cost
// snapshot already used by the monthly view. This module never reads a clock,
// database or provider. Only monthly costs are allocated across calendar days.
export function buildDailyBusinessSummary(monthly,frames,auditScope,validators={}){
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
 const array=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(field=>field&&Object.hasOwn(field,'value'));
 const int=(value,signed=false)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&(signed||value>=0);
 const safe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
 const cents=value=>{
  if(typeof value!=='string'||value.length>32)return null;
  const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value);if(!match||match[3]?.endsWith('0'))return null;
  let amount=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));if(match[1]){if(amount===0n)return null;amount=-amount;}return safe(amount);
 };
 const coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
 try{
  if(!exact(validators,['projectMonthly','projectFrame','projectScope'])||!Object.values(validators).every(value=>typeof value==='function')||!array(frames,3))return null;
  const m=validators.projectMonthly(monthly),scope=validators.projectScope(auditScope),periods=frames.map(value=>validators.projectFrame(value));
  if(!m||!scope||periods.some(value=>!value)||m.status!=='COMPLETE'||scope.start_date!==m.start_date||scope.end_date!==m.end_date||periods.length!==scope.sources.length||!exact(m.source_checked_at,['finance_oldest_at','finance_latest_at','ads_at']))return null;
  const totals=Object.fromEntries(coverageKeys.map(key=>[key,0])),quantities=new Map(),money=[0n,0n,0n];let pages=0,capacity=0;
  for(let index=0;index<periods.length;index++){
   const frame=periods[index],source=scope.sources[index];
   if(frame.status!=='COMPLETE'||frame.run_id!==source.run_id||frame.revision!==source.source_revision||frame.start_date!==source.start_date||frame.end_date!==source.end_date||frame.checked_at>m.checked_at)return null;
   for(const key of coverageKeys)totals[key]+=frame.coverage[key];pages+=frame.pages_read;capacity+=frame.pages_read*(frame.page_capacity??5);
   for(const [position,key] of ['known_sales_base_raw','known_expected_repass_raw','known_ads_adjustment_raw'].entries()){const amount=cents(frame[key]);if(amount===null)return null;money[position]+=BigInt(amount);}
   for(const row of frame.items){const key=row.item_id+':'+row.model_id;quantities.set(key,(quantities.get(key)||0n)+BigInt(row.quantity));}
  }
  if(coverageKeys.some(key=>totals[key]!==m.coverage[key])||pages!==m.progress.pages_read||capacity!==(m.progress.order_capacity??pages*5)||!int(m.known_sales_cents)||!int(m.known_expected_repass_cents,true)||money[0]!==BigInt(m.known_sales_cents)||money[1]!==BigInt(m.known_expected_repass_cents)||m.ads_adjustment_cents!==null&&money[2]!==BigInt(m.ads_adjustment_cents))return null;
  const oldest=Math.min(...periods.map(frame=>frame.source_checked_at?.oldest_at??frame.cutoff_at)),latest=Math.max(...periods.map(frame=>frame.source_checked_at?.latest_at??frame.checked_at));
  if(oldest!==m.source_checked_at.finance_oldest_at||latest!==m.source_checked_at.finance_latest_at)return null;
  // The product summary is already priced with current bindings, approved
  // historical variants and cost rules. Never price a second way or average
  // the monthly production total over units, orders or days.
  const unitCosts=new Map();
  if(m.product_summary){
   let cost=0n;for(const product of m.product_summary.products)for(const variant of product.variants){
    const key=product.item_id+':'+variant.model_id;if(unitCosts.has(key)||quantities.get(key)!==BigInt(variant.quantity))return null;
    unitCosts.set(key,variant.unit_cost_cents);if(variant.unit_cost_cents!==null)cost+=BigInt(variant.unit_cost_cents)*BigInt(variant.quantity);
   }
   if(unitCosts.size!==quantities.size||!int(m.known_production_cost_cents)||cost!==BigInt(m.known_production_cost_cents))return null;
  }
  const last=new Date(m.month+'-01T00:00:00Z');last.setUTCMonth(last.getUTCMonth()+1,0);const monthDays=last.getUTCDate(),endDay=Number(m.end_date.slice(8));
  const share=(amount,day)=>amount===null?null:Number(BigInt(amount)*BigInt(day)/BigInt(monthDays)-BigInt(amount)*BigInt(day-1)/BigInt(monthDays));
  const das=m.tax?.status==='DECLARED'&&m.tax.tax_cents===m.invoice_tax_cents&&int(m.invoice_tax_cents)?m.invoice_tax_cents:null;
  const external=int(m.expenses.external_expenses_cents)&&!m.result.pending.includes('EXTERNAL_EXPENSES_REQUIRED')?m.expenses.external_expenses_cents:null;
  const allocated=amount=>amount===null?null:Number(BigInt(amount)*BigInt(endDay)/BigInt(monthDays));
  const allocation={basis:'CALENDAR_MONTH_DAILY_COST_ALLOCATION',days_in_month:monthDays,monthly_das_cents:das,monthly_expenses_cents:external,allocated_das_cents:allocated(das),allocated_expenses_cents:allocated(external),remaining_das_cents:das===null?null:das-allocated(das),remaining_expenses_cents:external===null?null:external-allocated(external)};
  const adsDays=new Map((m.ads?.days||[]).map(row=>[row.date,row])),brt=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}),days=[];
  for(const frame of periods){
   const history=frame.daily_breakdown,reason=!history?'DAILY_HISTORY_PENDING':history.undated.coverage.orders>0?'CREATION_DATE_INCOMPLETE':null;
   for(let day=Number(frame.start_date.slice(8));day<=Number(frame.end_date.slice(8));day++){
    const date=m.month+'-'+String(day).padStart(2,'0'),group=reason===null?history.days[day-Number(frame.start_date.slice(8))]:null,ads=adsDays.get(date),pending=[];
    const row={date,state:'UNAVAILABLE',reason,day_partial:date===brt.format(new Date(frame.cutoff_at*1000)),source_cutoff_at:frame.cutoff_at,coverage:group?{...group.coverage}:null,sales_cents:group&&group.sales_base_raw!==null?cents(group.sales_base_raw):null,base_repass_cents:group&&group.expected_repass_raw!==null?cents(group.expected_repass_raw):null,adjustment_cents:null,after_adjustment_repass_cents:null,payout_basis:'UNAVAILABLE',payout_cents:null,production_cost_cents:null,known_production_cost_cents:null,production_coverage:{total_units:null,known_units:null,pending_units:null},ads_spend_cents:ads?.expense_cents??null,recharge_addback_cents:null,allocated_das_cents:share(das,day),allocated_expenses_cents:share(external,day),operating_balance_cents:null,estimate_cents:null,known_estimate_cents:null,source_checked_at:{finance_oldest_at:group?.source_checked_at.oldest_at??null,finance_latest_at:group?.source_checked_at.latest_at??null,ads_at:m.source_checked_at.ads_at},pending};
    if(reason!==null)pending.push(reason);
    if(row.ads_spend_cents===null)pending.push('ADS_UNAVAILABLE');else if(m.checked_at-m.ads.fetched_at>900)pending.push('ADS_SOURCE_STALE');
    if(das===null)pending.push('TAX_POLICY_REQUIRED');if(external===null)pending.push('EXTERNAL_EXPENSES_REQUIRED');
    if(m.result.pending.includes('FINANCIAL_SOURCE_STALE'))pending.push('FINANCIAL_SOURCE_STALE');if(m.result.pending.includes('SOURCE_UNAVAILABLE'))pending.push('SOURCE_UNAVAILABLE');
    if(group){
     const c=group.coverage,a=group.adjustments;if(c.payment_missing)pending.push('PAYMENT_INCOMPLETE');if(c.cancel_pending+c.other+c.unknown)pending.push('STATUS_REVIEW_REQUIRED');if(c.returns+c.returns_unknown)pending.push('RETURNS_NOT_RECONCILED');
     if(group.sales_base_raw!==null&&row.sales_cents===null||group.expected_repass_raw!==null&&row.base_repass_cents===null)return null;
     if(a.covered_orders===c.paid){
      row.adjustment_cents=cents(a.adjustment_raw);row.after_adjustment_repass_cents=cents(a.after_adjustment_repass_raw);
      if(row.base_repass_cents===null||row.adjustment_cents===null||row.after_adjustment_repass_cents===null||BigInt(row.base_repass_cents)+BigInt(row.adjustment_cents)!==BigInt(row.after_adjustment_repass_cents))return null;
      row.payout_basis='AFTER_ADJUSTMENTS';row.payout_cents=row.after_adjustment_repass_cents;
     }else{
      if(a.missing_orders)pending.push('ADJUSTMENTS_PENDING');if(a.conflict_orders)pending.push('ADJUSTMENT_CONFLICT');
      if(row.base_repass_cents!==null){row.payout_basis='BASE_REPASS';row.payout_cents=row.base_repass_cents;}
     }
     let total=0n,known=0n,cost=0n;
     for(const item of group.items){const amount=BigInt(item.quantity),unit=unitCosts.get(item.item_id+':'+item.model_id);total+=amount;if(unit!==undefined&&unit!==null){known+=amount;cost+=amount*BigInt(unit);}}
     const totalUnits=safe(total),knownUnits=safe(known),knownCost=safe(cost);if(totalUnits===null||knownUnits===null||knownCost===null)return null;
     row.production_coverage={total_units:totalUnits,known_units:knownUnits,pending_units:totalUnits-knownUnits};row.known_production_cost_cents=knownCost;
     if(total===known)row.production_cost_cents=knownCost;else pending.push('PRODUCTION_COST_INCOMPLETE');
     const recharge=group.ads_adjustment_raw===null?null:cents(group.ads_adjustment_raw);
     if(recharge===null||recharge<0)pending.push('ADJUSTMENT_UNAVAILABLE');else if(recharge>0&&m.expenses.recharge_treatment==='UNCONFIRMED')pending.push('RECHARGE_TREATMENT_REQUIRED');else row.recharge_addback_cents=m.expenses.recharge_treatment==='ADS_RECHARGE'?recharge:0;
     if(row.payout_cents!==null&&row.ads_spend_cents!==null&&row.recharge_addback_cents!==null){
      const operating=BigInt(row.payout_cents)+BigInt(row.recharge_addback_cents)-BigInt(row.known_production_cost_cents)-BigInt(row.ads_spend_cents);
      if(safe(operating)===null)return null;if(row.production_cost_cents!==null)row.operating_balance_cents=Number(operating);
      if(row.allocated_das_cents!==null&&row.allocated_expenses_cents!==null){
       const result=safe(operating-BigInt(row.allocated_das_cents)-BigInt(row.allocated_expenses_cents));if(result===null)return null;
       row.known_estimate_cents=result;if(row.production_cost_cents!==null){row.estimate_cents=result;row.state='PROVISIONAL';}else row.state='PARTIAL_COSTS';
      }
     }
    }
    days.push(row);
   }
  }
  const output={schema:'business_daily_summary_v1',month:m.month,start_date:m.start_date,end_date:m.end_date,timezone:'America/Sao_Paulo',basis:'PAID_CREATE_DAY_CALENDAR_ADS_AND_ALLOCATED_MONTHLY_COSTS_ESTIMATE',ads_basis:'CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION',ads_timezone:'UNCONFIRMED',state:days.every(row=>row.estimate_cents!==null)?'AVAILABLE':days.some(row=>row.known_estimate_cents!==null)?'PARTIAL':'UNAVAILABLE',publication_revision:scope.publication_revision,sources:scope.sources.map(row=>({...row})),bindings_revision:m.bindings_revision,costs_revision:m.costs_revision,cost_rules_revision:m.cost_rules_revision??null,classification_revision:m.classification_revision??null,expenses_revision:m.expenses.revision,tax_policy_revision:m.tax?.policy_revision??null,source_checked_at:{...m.source_checked_at},allocation,days,remaining_receivable_cents:null,realized_net_cents:null};
  return projectDailyBusinessSummary(output,m,scope);
 }catch{return null;}
}

// Keep this function self-contained: the owner page embeds .toString(). The
// monthly frame and audit scope have already passed their own strict projectors.
// Unknown daily evidence never becomes an empty day or a guessed zero amount.
export function projectDailyBusinessSummary(value,monthly,auditScope){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const read=(item,key)=>plain(item)?Object.getOwnPropertyDescriptor(item,key)?.value:undefined;
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(field=>field&&Object.hasOwn(field,'value'));
 const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const cent=(item,signed=false)=>item===null||int(item,signed?Number.MIN_SAFE_INTEGER:0);
 const safe=item=>item>=BigInt(Number.MIN_SAFE_INTEGER)&&item<=BigInt(Number.MAX_SAFE_INTEGER)?Number(item):null;
 const date=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
 const timesKeys=['finance_oldest_at','finance_latest_at','ads_at'];
 const codes=['DAILY_HISTORY_PENDING','CREATION_DATE_INCOMPLETE','PAYMENT_INCOMPLETE','PRODUCTION_COST_INCOMPLETE','ADS_UNAVAILABLE','ADS_SOURCE_STALE','EXTERNAL_EXPENSES_REQUIRED','TAX_POLICY_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ADJUSTMENTS_PENDING','ADJUSTMENT_CONFLICT','STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED','FINANCIAL_SOURCE_STALE','SOURCE_UNAVAILABLE','ARITHMETIC_UNSAFE'];
 const keys=['schema','month','start_date','end_date','timezone','basis','ads_basis','ads_timezone','state','publication_revision','sources','bindings_revision','costs_revision','cost_rules_revision','classification_revision','expenses_revision','tax_policy_revision','source_checked_at','allocation','days','remaining_receivable_cents','realized_net_cents'];
 const rowKeys=['date','state','reason','day_partial','source_cutoff_at','coverage','sales_cents','base_repass_cents','adjustment_cents','after_adjustment_repass_cents','payout_basis','payout_cents','production_cost_cents','known_production_cost_cents','production_coverage','ads_spend_cents','recharge_addback_cents','allocated_das_cents','allocated_expenses_cents','operating_balance_cents','estimate_cents','known_estimate_cents','source_checked_at','pending'];
 try{
  if(!exact(value,keys)||value.schema!=='business_daily_summary_v1'||value.timezone!=='America/Sao_Paulo'||value.basis!=='PAID_CREATE_DAY_CALENDAR_ADS_AND_ALLOCATED_MONTHLY_COSTS_ESTIMATE'||value.ads_basis!=='CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION'||value.ads_timezone!=='UNCONFIRMED'||value.remaining_receivable_cents!==null||value.realized_net_cents!==null||!['AVAILABLE','PARTIAL','UNAVAILABLE'].includes(value.state)||typeof value.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||!date(value.start_date)||value.start_date!==value.month+'-01'||value.start_date<'2000-01-01'||!date(value.end_date)||value.end_date.slice(0,7)!==value.month||!array(value.days,31)||value.days.length!==Number(value.end_date.slice(8)))return null;
  if(read(monthly,'schema')!=='business_month_v1'||read(monthly,'status')!=='COMPLETE'||value.month!==read(monthly,'month')||value.start_date!==read(monthly,'start_date')||value.end_date!==read(monthly,'end_date')||!int(read(monthly,'checked_at'),1,9999999999))return null;
  const stamp=read(monthly,'checked_at'),pendingMonthly=read(read(monthly,'result'),'pending'),expenses=read(monthly,'expenses'),tax=read(monthly,'tax'),observed=read(monthly,'source_checked_at'),monthlyCoverage=read(monthly,'coverage');
  if(!array(pendingMonthly,30)||!exact(expenses,['revision','external_expenses_cents','recharge_treatment','updated_at'])||!exact(observed,timesKeys)||!exact(monthlyCoverage,coverageKeys)||!coverageKeys.every(key=>int(monthlyCoverage[key],0,3000)))return null;
  for(const key of ['bindings_revision','costs_revision'])if(!int(value[key],1,2147483647)||value[key]!==read(monthly,key))return null;
  for(const key of ['cost_rules_revision','classification_revision'])if(value[key]!==null&&!int(value[key],1,2147483647)||value[key]!==(read(monthly,key)??null))return null;
  if(!int(value.expenses_revision,0,2147483647)||value.expenses_revision!==expenses.revision||value.tax_policy_revision!==null&&!int(value.tax_policy_revision,0,2147483647)||value.tax_policy_revision!==(read(tax,'policy_revision')??null))return null;
  const scopeKeys=['publication_revision','start_date','end_date','sources'],sourceKeys=['run_id','source_revision','start_date','end_date'];
  if(!exact(auditScope,scopeKeys)||!int(value.publication_revision,1,2147483647)||value.publication_revision!==auditScope.publication_revision||value.start_date!==auditScope.start_date||value.end_date!==auditScope.end_date||!array(value.sources,3)||!array(auditScope.sources,3)||value.sources.length!==Math.ceil(value.days.length/15)||value.sources.length!==auditScope.sources.length)return null;
  const sourceIds=new Set();for(let index=0;index<value.sources.length;index++){
   const row=value.sources[index],source=auditScope.sources[index],start=value.month+'-'+String(index*15+1).padStart(2,'0'),end=value.month+'-'+String(Math.min(index*15+15,value.days.length)).padStart(2,'0');
   if(!exact(row,sourceKeys)||!exact(source,sourceKeys)||sourceKeys.some(key=>row[key]!==source[key])||typeof row.run_id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row.run_id)||sourceIds.has(row.run_id)||!int(row.source_revision,1,2147483647)||row.start_date!==start||row.end_date!==end)return null;sourceIds.add(row.run_id);
  }
  if(!exact(value.source_checked_at,timesKeys)||timesKeys.some(key=>value.source_checked_at[key]!==observed[key]||observed[key]!==null&&!int(observed[key],1,stamp))||observed.finance_oldest_at===null||observed.finance_latest_at===null||observed.finance_oldest_at>observed.finance_latest_at)return null;
  const last=new Date(value.month+'-01T00:00:00Z');last.setUTCMonth(last.getUTCMonth()+1,0);const monthDays=last.getUTCDate(),span=value.days.length;
  const das=read(tax,'status')==='DECLARED'&&read(tax,'regime')==='MEI'&&read(tax,'basis')==='MONTHLY_COMPETENCE_NO_PRORATION'&&read(tax,'tax_cents')===read(monthly,'invoice_tax_cents')&&int(read(monthly,'invoice_tax_cents'))?read(monthly,'invoice_tax_cents'):null;
  const external=int(expenses.external_expenses_cents)&&!pendingMonthly.includes('EXTERNAL_EXPENSES_REQUIRED')?expenses.external_expenses_cents:null;
  const allocated=amount=>amount===null?null:Number(BigInt(amount)*BigInt(span)/BigInt(monthDays));
  const allocation={basis:'CALENDAR_MONTH_DAILY_COST_ALLOCATION',days_in_month:monthDays,monthly_das_cents:das,monthly_expenses_cents:external,allocated_das_cents:allocated(das),allocated_expenses_cents:allocated(external),remaining_das_cents:das===null?null:das-allocated(das),remaining_expenses_cents:external===null?null:external-allocated(external)};
  if(!exact(value.allocation,Object.keys(allocation))||Object.keys(allocation).some(key=>value.allocation[key]!==allocation[key]))return null;
  const share=(amount,day)=>amount===null?null:Number(BigInt(amount)*BigInt(day)/BigInt(monthDays)-BigInt(amount)*BigInt(day-1)/BigInt(monthDays));
  const ads=read(monthly,'ads'),adsRows=read(ads,'days'),adsAt=read(ads,'fetched_at')??null,adsMap=new Map();
  if(ads!==null&&ads!==undefined){
   if(!array(adsRows,31)||read(ads,'source_timezone')!=='UNCONFIRMED'||read(ads,'basis')!=='CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION'||adsAt!==observed.ads_at)return null;
   for(const row of adsRows){const d=read(row,'date'),expense=read(row,'expense_cents');if(!date(d)||adsMap.has(d)||!cent(expense))return null;adsMap.set(d,expense);}
  }else if(observed.ads_at!==null)return null;
  const brt=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}),totals=Object.fromEntries(coverageKeys.map(key=>[key,0])),windows=new Map(),days=[];
  let fullyDated=true,allPayment=true,allRecharge=true,allProduction=true,sales=0n,base=0n,recharge=0n,cost=0n,units=0n,knownUnits=0n,missingUnits=0n;
  for(let index=0;index<value.days.length;index++){
   const row=value.days[index],day=index+1,d=value.month+'-'+String(day).padStart(2,'0'),window=Math.floor(index/15),source=value.sources[window];
   if(!exact(row,rowKeys)||row.date!==d||!['PROVISIONAL','PARTIAL_COSTS','UNAVAILABLE'].includes(row.state)||![null,'DAILY_HISTORY_PENDING','CREATION_DATE_INCOMPLETE'].includes(row.reason)||typeof row.day_partial!=='boolean'||!int(row.source_cutoff_at,1,stamp)||!exact(row.production_coverage,['total_units','known_units','pending_units'])||!exact(row.source_checked_at,timesKeys)||!array(row.pending,codes.length)||new Set(row.pending).size!==row.pending.length||!row.pending.every(code=>codes.includes(code)))return null;
   const p=row.production_coverage;
   const cutoffDay=brt.format(new Date(row.source_cutoff_at*1000));if(source.end_date>cutoffDay||row.day_partial!==(row.date===cutoffDay))return null;
   if(windows.has(window)){const earlier=windows.get(window);if(earlier.reason!==row.reason||earlier.cutoff!==row.source_cutoff_at)return null;}else windows.set(window,{reason:row.reason,cutoff:row.source_cutoff_at});
   for(const key of ['sales_cents','production_cost_cents','known_production_cost_cents','ads_spend_cents','recharge_addback_cents','allocated_das_cents','allocated_expenses_cents'])if(!cent(row[key]))return null;
   for(const key of ['base_repass_cents','adjustment_cents','after_adjustment_repass_cents','payout_cents','operating_balance_cents','estimate_cents','known_estimate_cents'])if(!cent(row[key],true))return null;
   if(row.allocated_das_cents!==share(das,day)||row.allocated_expenses_cents!==share(external,day)||row.ads_spend_cents!==(adsMap.get(d)??null)||row.source_checked_at.ads_at!==observed.ads_at||!['BASE_REPASS','AFTER_ADJUSTMENTS','UNAVAILABLE'].includes(row.payout_basis))return null;
   const has=code=>row.pending.includes(code),requireFlag=(flag,condition)=>has(flag)===Boolean(condition);
   if(!requireFlag('DAILY_HISTORY_PENDING',row.reason==='DAILY_HISTORY_PENDING')||!requireFlag('CREATION_DATE_INCOMPLETE',row.reason==='CREATION_DATE_INCOMPLETE')||!requireFlag('ADS_UNAVAILABLE',row.ads_spend_cents===null)||!requireFlag('ADS_SOURCE_STALE',row.ads_spend_cents!==null&&stamp-adsAt>900)||!requireFlag('TAX_POLICY_REQUIRED',das===null)||!requireFlag('EXTERNAL_EXPENSES_REQUIRED',external===null)||!requireFlag('FINANCIAL_SOURCE_STALE',pendingMonthly.includes('FINANCIAL_SOURCE_STALE'))||!requireFlag('SOURCE_UNAVAILABLE',pendingMonthly.includes('SOURCE_UNAVAILABLE'))||has('ARITHMETIC_UNSAFE'))return null;
   if(row.reason!==null){
    fullyDated=false;
    if(row.coverage!==null||Object.values(p).some(amount=>amount!==null)||['sales_cents','base_repass_cents','adjustment_cents','after_adjustment_repass_cents','payout_cents','production_cost_cents','known_production_cost_cents','recharge_addback_cents','operating_balance_cents','estimate_cents','known_estimate_cents'].some(key=>row[key]!==null)||row.payout_basis!=='UNAVAILABLE'||row.state!=='UNAVAILABLE'||row.source_checked_at.finance_oldest_at!==null||row.source_checked_at.finance_latest_at!==null||['PAYMENT_INCOMPLETE','PRODUCTION_COST_INCOMPLETE','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ADJUSTMENTS_PENDING','ADJUSTMENT_CONFLICT','STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED'].some(has))return null;
   }else{
    const c=row.coverage,t=row.source_checked_at;if(!exact(c,coverageKeys)||!coverageKeys.every(key=>int(c[key],0,1000))||c.orders!==c.paid+c.cancelled+c.cancel_pending+c.unpaid+c.other+c.unknown||c.paid!==c.completed+c.ongoing||c.payment_covered+c.payment_missing!==c.paid||c.returns>c.payment_covered||c.returns_unknown<c.payment_missing||c.returns+c.returns_unknown>c.paid)return null;
    for(const key of coverageKeys){totals[key]+=c[key];if(totals[key]>monthlyCoverage[key])return null;}
    if(c.orders===0){if(t.finance_oldest_at!==null||t.finance_latest_at!==null)return null;}else if(!int(t.finance_oldest_at,Math.max(row.source_cutoff_at,observed.finance_oldest_at),observed.finance_latest_at)||!int(t.finance_latest_at,t.finance_oldest_at,observed.finance_latest_at)||c.orders===1&&t.finance_oldest_at!==t.finance_latest_at)return null;
    if(!requireFlag('PAYMENT_INCOMPLETE',c.payment_missing>0)||!requireFlag('STATUS_REVIEW_REQUIRED',c.cancel_pending+c.other+c.unknown>0)||!requireFlag('RETURNS_NOT_RECONCILED',c.returns+c.returns_unknown>0))return null;
    if(c.payment_missing){allPayment=false;if(row.sales_cents!==null||row.base_repass_cents!==null||row.payout_basis!=='UNAVAILABLE'||!has('ADJUSTMENTS_PENDING'))return null;}else{if(row.sales_cents===null||row.base_repass_cents===null)return null;sales+=BigInt(row.sales_cents);base+=BigInt(row.base_repass_cents);}
    if(c.payment_covered===0&&c.payment_missing===0&&(row.sales_cents!==0||row.base_repass_cents!==0))return null;
    if(row.payout_basis==='AFTER_ADJUSTMENTS'){
     if(row.base_repass_cents===null||row.adjustment_cents===null||row.after_adjustment_repass_cents===null||BigInt(row.base_repass_cents)+BigInt(row.adjustment_cents)!==BigInt(row.after_adjustment_repass_cents)||row.payout_cents!==row.after_adjustment_repass_cents||has('ADJUSTMENTS_PENDING')||has('ADJUSTMENT_CONFLICT')||c.paid===0&&(row.adjustment_cents!==0||row.after_adjustment_repass_cents!==0))return null;
    }else{
     if(row.adjustment_cents!==null||row.after_adjustment_repass_cents!==null||!has('ADJUSTMENTS_PENDING')&&!has('ADJUSTMENT_CONFLICT')||c.paid===0)return null;
     if(row.payout_basis==='BASE_REPASS'){if(row.base_repass_cents===null||row.payout_cents!==row.base_repass_cents)return null;}
     else if(row.payout_basis!=='UNAVAILABLE'||row.payout_cents!==null||row.base_repass_cents!==null)return null;
    }
    if(!Object.values(p).every(amount=>int(amount))||BigInt(p.known_units)+BigInt(p.pending_units)!==BigInt(p.total_units)||p.total_units<c.paid||c.paid===0&&p.total_units!==0||!requireFlag('PRODUCTION_COST_INCOMPLETE',p.pending_units>0)||row.known_production_cost_cents===null||p.known_units===0&&row.known_production_cost_cents!==0||row.production_cost_cents!==(p.pending_units?null:row.known_production_cost_cents))return null;
    units+=BigInt(p.total_units);knownUnits+=BigInt(p.known_units);missingUnits+=BigInt(p.pending_units);cost+=BigInt(row.known_production_cost_cents);if(p.pending_units)allProduction=false;
    if(row.recharge_addback_cents===null){allRecharge=false;if(!has('ADJUSTMENT_UNAVAILABLE')&&!has('RECHARGE_TREATMENT_REQUIRED'))return null;}else{
     if(has('ADJUSTMENT_UNAVAILABLE')||has('RECHARGE_TREATMENT_REQUIRED')||expenses.recharge_treatment!=='ADS_RECHARGE'&&row.recharge_addback_cents!==0||c.paid===0&&row.recharge_addback_cents!==0)return null;recharge+=BigInt(row.recharge_addback_cents);
    }
    if(has('RECHARGE_TREATMENT_REQUIRED')&&expenses.recharge_treatment!=='UNCONFIRMED'||c.payment_missing&&!has('ADJUSTMENT_UNAVAILABLE')||has('ADJUSTMENT_UNAVAILABLE')&&has('RECHARGE_TREATMENT_REQUIRED'))return null;
    let operating=null,knownResult=null,result=null;
    if(row.payout_cents!==null&&row.ads_spend_cents!==null&&row.recharge_addback_cents!==null){
     const amount=BigInt(row.payout_cents)+BigInt(row.recharge_addback_cents)-BigInt(row.known_production_cost_cents)-BigInt(row.ads_spend_cents);if(safe(amount)===null)return null;
     if(row.production_cost_cents!==null)operating=Number(amount);
     if(row.allocated_das_cents!==null&&row.allocated_expenses_cents!==null){knownResult=safe(amount-BigInt(row.allocated_das_cents)-BigInt(row.allocated_expenses_cents));if(knownResult===null)return null;if(row.production_cost_cents!==null)result=knownResult;}
    }
    if(row.operating_balance_cents!==operating||row.known_estimate_cents!==knownResult||row.estimate_cents!==result||row.state!==(result!==null?'PROVISIONAL':knownResult!==null?'PARTIAL_COSTS':'UNAVAILABLE'))return null;
   }
   days.push({...row,coverage:row.coverage===null?null:{...row.coverage},production_coverage:{...p},source_checked_at:{...row.source_checked_at},pending:[...row.pending]});
  }
  if(fullyDated){
   if(coverageKeys.some(key=>totals[key]!==monthlyCoverage[key]))return null;
   if(allPayment&&(!int(read(monthly,'known_sales_cents'))||!int(read(monthly,'known_expected_repass_cents'),Number.MIN_SAFE_INTEGER)||sales!==BigInt(read(monthly,'known_sales_cents'))||base!==BigInt(read(monthly,'known_expected_repass_cents'))))return null;
   if(allRecharge&&expenses.recharge_treatment==='ADS_RECHARGE'&&(read(monthly,'ads_adjustment_cents')===null||recharge!==BigInt(read(monthly,'ads_adjustment_cents'))))return null;
   const products=read(read(monthly,'product_summary'),'products');
   if(products!==undefined){
    if(!array(products,3000))return null;let total=0n,known=0n,knownCost=0n;const seen=new Set();
    for(const product of products){const variants=read(product,'variants'),item=read(product,'item_id');if(!array(variants,3000))return null;for(const variant of variants){const q=read(variant,'quantity'),unit=read(variant,'unit_cost_cents'),key=item+':'+read(variant,'model_id');if(!int(q,1)||!cent(unit)||seen.has(key))return null;seen.add(key);total+=BigInt(q);if(unit!==null){known+=BigInt(q);knownCost+=BigInt(q)*BigInt(unit);}}}
    if(units!==total||knownUnits!==known||missingUnits!==total-known||cost!==knownCost||!int(read(monthly,'known_production_cost_cents'))||cost!==BigInt(read(monthly,'known_production_cost_cents'))||allProduction!==(read(monthly,'production_cost_cents')!==null))return null;
   }else if(knownUnits!==0n||cost!==0n)return null;
  }
  const state=days.every(row=>row.estimate_cents!==null)?'AVAILABLE':days.some(row=>row.known_estimate_cents!==null)?'PARTIAL':'UNAVAILABLE';if(value.state!==state)return null;
  const output={...value,sources:value.sources.map(row=>({...row})),source_checked_at:{...value.source_checked_at},allocation:{...allocation},days};
  if(JSON.stringify(output).length>131072)return null;return output;
 }catch{return null;}
}
