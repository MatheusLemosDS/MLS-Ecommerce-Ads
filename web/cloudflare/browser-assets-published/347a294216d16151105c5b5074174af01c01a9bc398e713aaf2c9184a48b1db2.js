
(()=>{
 function projectDailyBusinessSummary(value,monthly,auditScope){
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
 const financialBars=(function createMlsFinancialBars(document){
 const safe=value=>Number.isSafeInteger(value)&&!Object.is(value,-0);
 const project=(rows,{title='Componentes financeiros',basis='',complete=false}={})=>{
  if(typeof title!=='string'||title.length>160||typeof basis!=='string'||basis.length>400||typeof complete!=='boolean'||!Array.isArray(rows)||!rows.length||rows.length>24)return null;
  const seen=new Set(),segments=[];
  for(const row of rows){if(!row||typeof row.label!=='string'||!row.label.trim()||row.label.length>120||seen.has(row.label)||row.value!==null&&!safe(row.value)||!['START','DEDUCTION','ADJUSTMENT','RESULT','CONTEXT'].includes(row.role))return null;seen.add(row.label);segments.push({label:row.label,value:row.value,role:row.role});}
  return {schema:'mls_signed_financial_bars_v1',unit:'BRL_CENTS',type:'signedBar',status:complete&&segments.every(row=>row.value!==null)?'READY':'PARTIAL',title,basis,segments};
 };
 const money=value=>{if(value===null)return 'Pendente';const n=BigInt(value),abs=n<0n?-n:n;return (n<0n?'− ':'')+'R$ '+new Intl.NumberFormat('pt-BR').format(abs/100n)+','+String(abs%100n).padStart(2,'0');};
 function draw(host,rows,options){
  if(!host)return false;host.replaceChildren();const model=project(rows,options);if(!model){host.textContent='Os componentes financeiros aguardam uma fonte válida.';return false;}
  const make=(tag,text,cls)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(cls)item.className=cls;return item;};
  host.className='mls-financial-bars';host.dataset.chartUnit=model.unit;host.dataset.chartStatus=model.status;
  host.append(make('h4',model.title),make('p',model.basis+(model.status==='PARTIAL'?' Componentes conhecidos e pendências; não formam uma conta fechada.':' Valores assinados da mesma base.')));
  const max=Math.max(1,...model.segments.filter(row=>row.value!==null).map(row=>Math.abs(row.value))),list=make('div',undefined,'mls-financial-bar-list'),readout=make('p','Selecione um componente para conferir o valor e a função na composição.','mls-financial-bar-readout'),buttons=[];
  readout.setAttribute('aria-live','polite');
  const roles={START:'Base de entrada',DEDUCTION:'Dedução',ADJUSTMENT:'Ajuste',RESULT:'Resultado da base indicada',CONTEXT:'Contexto; não é nova dedução'};
  for(const row of model.segments){
   const button=make('button',undefined,'mls-financial-bar-point');button.type='button';button.dataset.sign=row.value===null?'unknown':row.value<0?'negative':'positive';button.dataset.role=row.role;button.setAttribute('aria-pressed','false');const description=row.label+': '+money(row.value)+' · '+roles[row.role]+(model.status==='PARTIAL'?' · base parcial':'');button.setAttribute('aria-label',description);
   const label=make('span',row.label),track=make('span',undefined,'mls-financial-bar-track'),bar=make('i'),amount=make('strong',money(row.value));track.setAttribute('aria-hidden','true');
   // Absolute magnitude is only geometric; negative values retain their signed
   // amount and extend left of the visible zero axis.
   if(row.value!==null){const width=Math.abs(row.value)/max*50;bar.style.width=width+'%';bar.style.left=(row.value<0?50-width:50)+'%';track.append(bar);}else track.append(make('span','—'));button.append(label,track,amount);
   const select=()=>{for(const peer of buttons)peer.setAttribute('aria-pressed',String(peer===button));readout.textContent=description;};button.onclick=select;button.onfocus=select;buttons.push(button);list.append(button);
  }
  buttons.forEach((button,index)=>button.onkeydown=event=>{const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'||event.key==='ArrowRight'?Math.min(buttons.length-1,index+1):event.key==='ArrowUp'||event.key==='ArrowLeft'?Math.max(0,index-1):-1;if(event.key==='Escape'){for(const peer of buttons)peer.setAttribute('aria-pressed','false');readout.textContent='Seleção fechada. Os valores permanecem na lista equivalente.';}else if(next>=0){event.preventDefault?.();buttons[next].focus?.();buttons[next].onclick();}});
  host.append(list,readout);return true;
 }
 return Object.freeze({project,draw});
})(document);
 const projectDailyProfitPresentation=function projectDailyProfitPresentation(row){
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
  // This ratio retains the subtotal's basis; it is not the financial net margin.
  const sales=read(row,'sales_cents');
  const margin=amount=>amount!==null&&int(sales)&&sales>0?safe(BigInt(amount)*10000n/BigInt(sales)):null;
  const result=(presentation,basis,amount=null)=>({schema:'daily_profit_presentation_v1',state:presentation,basis,amount_cents:amount,margin_bps:margin(amount),monthly_costs_missing:[...missing],das_included:amount!==null&&das!==null,expenses_included:amount!==null&&expenses!==null});
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
};
 const projectMissionDailyTrend=function projectMissionDailyTrend(summary, selected){
 const safe=value=>Number.isSafeInteger(value)&&!Object.is(value,-0);
 const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);
 if(!summary||summary.schema!=='business_daily_summary_v1'||!validDate(selected)||selected.slice(0,7)!==summary.month||!Array.isArray(summary.days))return null;
 const forbidden=new Set(['SOURCE_UNAVAILABLE','ARITHMETIC_UNSAFE','FINANCIAL_SOURCE_STALE','PAYMENT_INCOMPLETE','ADS_SOURCE_STALE']);
 const all=summary.days.filter(row=>validDate(row?.date)&&row.date<=selected).slice(-14);
 if(!all.length)return null;
 const points=all.map(row=>{
  // The validated financial daily projector emits PROVISIONAL, while the
  // read-only chart contract names the equivalent available state OPERATIONAL.
  // Without this translation, real days are incorrectly rendered as missing.
  const state=row.state==='PROVISIONAL'||row.state==='OPERATIONAL'?'OPERATIONAL':row.state==='PARTIAL_COSTS'?'PARTIAL_COSTS':'UNAVAILABLE';
  const partial=Boolean(row.day_partial),basis=state==='PARTIAL_COSTS'?'KNOWN_COSTS':state==='OPERATIONAL'?'ESTIMATE':null;
  const unknown=state==='UNAVAILABLE',net=unknown?null:state==='PARTIAL_COSTS'?row.known_estimate_cents:row.estimate_cents;
  const pending=Array.isArray(row.pending)?row.pending:[];
  const comparable=!partial&&state==='OPERATIONAL'&&!pending.some(code=>forbidden.has(code));
  return Object.freeze({
   date:row.date,state,partial,net_basis:basis,
   net_cents:safe(net)?net:null,
   sales_cents:!unknown&&safe(row.sales_cents)?row.sales_cents:null,
   ads_spend_cents:!unknown&&safe(row.ads_spend_cents)?row.ads_spend_cents:null,
   paid_orders:!unknown&&safe(row.coverage?.paid)&&row.coverage.paid>=0?row.coverage.paid:null,
   comparable
  });
 });
 return Object.freeze({schema:'mls_mission_daily_trend_v1',month:summary.month,selected_date:selected,basis:'PAID_CREATE_DAY_AND_CALENDAR_ADS_OPERATIONAL_ESTIMATE',points:Object.freeze(points)});
};
 const projectProductionDailyFinance=function projectProductionDailyFinance(summary,selection){
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
 const list=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,String(index))||{},'value')).every(Boolean);
 const int=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
 const money=(value,signed=false)=>value===null||int(value,signed?Number.MIN_SAFE_INTEGER:0);
 const date=value=>typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 const times=['finance_oldest_at','finance_latest_at','ads_at'];
 const validTimes=value=>exact(value,times)&&times.every(key=>value[key]===null||int(value[key],1,9999999999))&&(value.finance_oldest_at===null)===(value.finance_latest_at===null)&&(value.finance_oldest_at===null||value.finance_oldest_at<=value.finance_latest_at);
 const codes=['DAILY_HISTORY_PENDING','CREATION_DATE_INCOMPLETE','PAYMENT_INCOMPLETE','PRODUCTION_COST_INCOMPLETE','ADS_UNAVAILABLE','ADS_SOURCE_STALE','EXTERNAL_EXPENSES_REQUIRED','TAX_POLICY_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ADJUSTMENTS_PENDING','ADJUSTMENT_CONFLICT','STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED','FINANCIAL_SOURCE_STALE','SOURCE_UNAVAILABLE','ARITHMETIC_UNSAFE'];
 const coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
 const topKeys=['schema','month','start_date','end_date','timezone','basis','ads_basis','ads_timezone','state','publication_revision','sources','bindings_revision','costs_revision','cost_rules_revision','classification_revision','expenses_revision','tax_policy_revision','source_checked_at','allocation','days','remaining_receivable_cents','realized_net_cents'];
 const rowKeys=['date','state','reason','day_partial','source_cutoff_at','coverage','sales_cents','base_repass_cents','adjustment_cents','after_adjustment_repass_cents','payout_basis','payout_cents','production_cost_cents','known_production_cost_cents','production_coverage','ads_spend_cents','recharge_addback_cents','allocated_das_cents','allocated_expenses_cents','operating_balance_cents','estimate_cents','known_estimate_cents','source_checked_at','pending'];
 try{
  if(!exact(selection,['month','selected_date'])||!date(selection.selected_date)||selection.selected_date.slice(0,7)!==selection.month||!exact(summary,topKeys)||summary.schema!=='business_daily_summary_v1'||summary.month!==selection.month||summary.start_date!==summary.month+'-01'||!date(summary.start_date)||!date(summary.end_date)||summary.end_date.slice(0,7)!==summary.month||summary.timezone!=='America/Sao_Paulo'||summary.basis!=='PAID_CREATE_DAY_CALENDAR_ADS_AND_ALLOCATED_MONTHLY_COSTS_ESTIMATE'||summary.ads_basis!=='CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION'||summary.ads_timezone!=='UNCONFIRMED'||!['AVAILABLE','PARTIAL','UNAVAILABLE'].includes(summary.state)||!int(summary.publication_revision,1,2147483647)||!int(summary.costs_revision,1,2147483647)||!validTimes(summary.source_checked_at)||!list(summary.days,31)||summary.days.length!==Number(summary.end_date.slice(8))||summary.remaining_receivable_cents!==null||summary.realized_net_cents!==null)return null;
  const days=[];
  for(let index=0;index<summary.days.length;index++){
   const row=summary.days[index],expected=summary.month+'-'+String(index+1).padStart(2,'0');
   if(!exact(row,rowKeys)||row.date!==expected||!date(row.date)||!['PROVISIONAL','PARTIAL_COSTS','UNAVAILABLE'].includes(row.state)||![null,'DAILY_HISTORY_PENDING','CREATION_DATE_INCOMPLETE'].includes(row.reason)||typeof row.day_partial!=='boolean'||!int(row.source_cutoff_at,1,9999999999)||!validTimes(row.source_checked_at)||!list(row.pending,codes.length)||new Set(row.pending).size!==row.pending.length||row.pending.some(code=>!codes.includes(code)))return null;
   for(const key of ['sales_cents','production_cost_cents','known_production_cost_cents','ads_spend_cents','recharge_addback_cents','allocated_das_cents','allocated_expenses_cents'])if(!money(row[key]))return null;
   for(const key of ['base_repass_cents','adjustment_cents','after_adjustment_repass_cents','payout_cents','operating_balance_cents','estimate_cents','known_estimate_cents'])if(!money(row[key],true))return null;
   if(!['BASE_REPASS','AFTER_ADJUSTMENTS','UNAVAILABLE'].includes(row.payout_basis)||!exact(row.production_coverage,['total_units','known_units','pending_units'])||!Object.values(row.production_coverage).every(value=>value===null||int(value)))return null;
   const c=row.coverage,p=row.production_coverage;
   if(c!==null&&(!exact(c,coverageKeys)||coverageKeys.some(key=>!int(c[key],0,3000))||c.orders!==c.paid+c.cancelled+c.cancel_pending+c.unpaid+c.other+c.unknown||c.paid!==c.completed+c.ongoing||c.payment_covered+c.payment_missing!==c.paid||c.returns+c.returns_unknown>c.paid))return null;
   if(p.total_units!==null&&p.known_units!==null&&p.pending_units!==null&&BigInt(p.known_units)+BigInt(p.pending_units)!==BigInt(p.total_units))return null;
   if(row.production_cost_cents!==null&&row.production_cost_cents!==row.known_production_cost_cents)return null;
   if(row.estimate_cents!==null){
    const fields=['payout_cents','production_cost_cents','ads_spend_cents','recharge_addback_cents','allocated_das_cents','allocated_expenses_cents'];
    if(row.state!=='PROVISIONAL'||row.reason!==null||c===null||fields.some(key=>row[key]===null)||p.pending_units!==0||BigInt(row.estimate_cents)!==BigInt(row.payout_cents)+BigInt(row.recharge_addback_cents)-BigInt(row.production_cost_cents)-BigInt(row.ads_spend_cents)-BigInt(row.allocated_das_cents)-BigInt(row.allocated_expenses_cents))return null;
   }
   const comparable=row.estimate_cents!==null&&!row.day_partial&&row.pending.length===0&&row.reason===null&&c!==null&&c.payment_missing===0&&c.cancel_pending+c.other+c.unknown+c.returns+c.returns_unknown===0&&p.pending_units===0;
   days.push({date:row.date,estimate_cents:row.estimate_cents,reference_production_cost_cents:row.production_cost_cents,known_reference_production_cost_cents:row.known_production_cost_cents,state:comparable?'COMPARABLE':row.estimate_cents!==null?'PARTIAL':'UNAVAILABLE',day_partial:row.day_partial,pending:[...row.pending]});
  }
  const eligible=days.filter(row=>row.state==='COMPARABLE'),amount=eligible.length?Math.max(...eligible.map(row=>row.estimate_cents)):null;
  const value={schema:'production_daily_finance_v1',month:summary.month,selected_date:selection.selected_date,start_date:summary.start_date,end_date:summary.end_date,timezone:'America/Sao_Paulo',currency:'BRL',basis:'PAID_CREATE_DAY_CALENDAR_ADS_ALLOCATED_MONTHLY_ESTIMATE',publication_revision:summary.publication_revision,costs_revision:summary.costs_revision,source_checked_at:{...summary.source_checked_at},coverage:{total_days:days.length,known_estimate_days:days.filter(row=>row.estimate_cents!==null).length,comparable_days:eligible.length,pending_days:days.filter(row=>row.state!=='COMPARABLE').length},days,selected_day:days.find(row=>row.date===selection.selected_date)??null,best_day:{state:eligible.length?'AVAILABLE':'NO_COMPARABLE_DAYS',amount_cents:amount,dates:eligible.filter(row=>row.estimate_cents===amount).map(row=>row.date)},actual_profit_cents:null,manufacturing_cost_subtracted:false};
  const freeze=object=>{if(object&&typeof object==='object'){for(const item of Object.values(object))freeze(item);Object.freeze(object);}return object;};return freeze(value);
 }catch{return null;}
};
 const el=name=>document.getElementById('businessDay'+name),node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
 const money=value=>{if(!Number.isSafeInteger(value))return 'Não informado';const cents=BigInt(value),absolute=cents<0n?-cents:cents,fraction=String(absolute%100n).padStart(2,'0');const text=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).formatToParts(absolute/100n).map(part=>part.type==='fraction'?fraction:part.value).join('');return (cents<0n?'-':'')+text;};
 const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'—';
 const time=value=>Number.isSafeInteger(value)&&value>0?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value*1000)):'Não consultado';
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
 function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'2000-01-01'||value>today())return false;const parsed=new Date(value+'T12:00:00Z');return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;}
 function validMonth(value){return typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&value>='2000-01'&&value<=today().slice(0,7);}
 function previousDay(){const value=new Date(today()+'T12:00:00Z');value.setUTCDate(value.getUTCDate()-1);return value.toISOString().slice(0,10);}
 const failures={TIMEOUT:'A consulta demorou mais que o esperado. Tente novamente.',NETWORK:'Não foi possível conectar ao painel. Verifique sua conexão e tente novamente.',SESSION:'Sua sessão expirou. Entre novamente.',QUOTA:'O painel está indisponível porque o limite diário do banco de dados foi atingido. A cota é renovada todos os dias às 21h (horário de Brasília).',UNAVAILABLE:'O painel está temporariamente indisponível. Tente novamente em alguns instantes.',INVALID:'Não foi possível abrir o painel. Tente novamente.'};
 const pendingMessages={DAILY_HISTORY_PENDING:'Os pedidos salvos ainda precisam do detalhamento por data de criação.',CREATION_DATE_INCOMPLETE:'Faltam datas de criação em parte dos pedidos; esses valores não foram distribuídos entre os dias.',PAYMENT_INCOMPLETE:'Há pedidos sem todos os valores de repasse.',PRODUCTION_COST_INCOMPLETE:'Ainda faltam custos de produção. O subtotal conhecido pode diminuir.',ADS_UNAVAILABLE:'O consumo de anúncios desta data ainda não está disponível.',ADS_SOURCE_STALE:'A leitura de anúncios precisa ser atualizada.',EXTERNAL_EXPENSES_REQUIRED:'Confirme as despesas do mês para incluir a parcela diária.',TAX_POLICY_REQUIRED:'A regra do DAS mensal ainda precisa ser confirmada.',RECHARGE_TREATMENT_REQUIRED:'Um ajuste de anúncios ainda precisa ser classificado como recarga ou suporte.',ADJUSTMENT_UNAVAILABLE:'Falta conferir o tratamento de um ajuste de anúncios.',ADJUSTMENTS_PENDING:'O cálculo usa o repasse base informado; os ajustes ainda estão em conferência.',ADJUSTMENT_CONFLICT:'Os valores de ajuste do repasse não são compatíveis e precisam de conferência.',STATUS_REVIEW_REQUIRED:'Pedidos com situação em revisão ficam fora dos valores pagos.',RETURNS_NOT_RECONCILED:'Devoluções e reembolsos ainda podem alterar esta estimativa.',FINANCIAL_SOURCE_STALE:'A leitura financeira precisa ser atualizada; os horários originais foram preservados.',SOURCE_UNAVAILABLE:'Parte dos dados financeiros ainda não está disponível.',ARITHMETIC_UNSAFE:'Um valor não pôde ser calculado com segurança.'};
 let prepared=false,active=false,stopped=false,phase='LOADING',failureKind='INVALID',selected='',followToday=false,contextMonth='',loadedMonth=null,summary=null,pendingMonth=null,pendingRequest=null,invalidSummary=false,selectionFailed=false;
 function status(message,error=false){el('Status').textContent=message;el('Status').dataset.error=String(error);}
 function controls(){el('Date').max=today();el('Date').value=selected;for(const name of ['Date','Today','Yesterday'])el(name).disabled=!active||stopped;el('Today').setAttribute('aria-pressed',String(selected===today()));el('Yesterday').setAttribute('aria-pressed',String(selected===previousDay()));}
 function saveSelection(){try{if(!globalThis.location?.href||typeof globalThis.history?.replaceState!=='function')return;const url=new URL(globalThis.location.href);if(followToday)url.searchParams.delete('date');else url.searchParams.set('date',selected);url.searchParams.set('month',selected.slice(0,7));globalThis.history.replaceState(globalThis.history.state??{},'',url.pathname+url.search+url.hash);}catch{}}
 function clearValues(){el('Returns').textContent='Aguardando a leitura de devoluções do dia.';el('Result').dataset.state='waiting';el('Result').dataset.negative='false';el('Net').textContent='Em apuração';el('NetLabel').textContent='Estimativa após os custos do dia.';el('Badge').textContent='Em apuração';for(const name of ['Sales','Ads','Paid'])el(name).textContent='—';el('SalesHelp').textContent='Valores informados pela Shopee.';el('Coverage').textContent='Aguardando a leitura salva.';el('Waterfall').replaceChildren();el('CompositionChart')?.replaceChildren();el('Pending').replaceChildren();el('Sources').textContent='Os horários das fontes serão mostrados após a leitura.';el('Allocation').textContent='DAS e despesas mensais entram como uma parcela diária, distribuída pelos dias do mês. A conta mensal mantém o valor completo.';}
 function render(){
  try{globalThis.brazaProductionDailyFinance?.refresh?.();}catch{}
  if(!el(''))return;controls();clearValues();el('Period').textContent=(selected===today()?'Hoje · ':selected===previousDay()?'Ontem · ':'')+day(selected);
  if(stopped){el('Help').textContent='Entre novamente para consultar os valores salvos.';status('Sessão encerrada.');return;}
  if(!active){el('Help').textContent='O resultado aparece quando os pedidos, anúncios e custos deste dia estiverem disponíveis.';status(phase==='FAILED'?failures[failureKind]:phase==='RETRYING'?'Tentando conectar ao painel novamente…':'Conectando ao painel da loja…',phase==='FAILED');return;}
  if(!summary||summary.month!==selected.slice(0,7)){
   el('Help').textContent=invalidSummary?'O detalhamento diário ainda não pôde ser conferido. O resumo mensal continua disponível abaixo.':'Aguardando o detalhamento dos pedidos desta data na coleta salva.';
   status(selectionFailed?'Não foi possível abrir o mês escolhido. Selecione a data para tentar novamente.':pendingMonth?'Consultando o resumo salvo de '+pendingMonth.slice(5)+'/'+pendingMonth.slice(0,4)+'…':invalidSummary?'Os dados diários recebidos ainda precisam de conferência.':'O resultado diário será preenchido quando houver dados compatíveis deste mês.',selectionFailed||invalidSummary);return;
  }
  const item=summary.days.find(row=>row.date===selected);
  if(!item){el('Help').textContent='A coleta salva ainda não cobre esta data. Nenhum valor foi tratado como zero.';status('Leitura disponível até '+day(summary.end_date)+'. A data escolhida aguarda os dados da coleta.');return;}
  const partial=item.state==='PARTIAL_COSTS',presentation=projectDailyProfitPresentation(item),monthlyPartial=presentation?.state==='BEFORE_MONTHLY_COSTS',amount=monthlyPartial?presentation.amount_cents:partial?item.known_estimate_cents:item.estimate_cents,known=Number.isSafeInteger(amount);
  const monthlyLabel=monthlyPartial?presentation.basis==='BEFORE_UNCONFIRMED_EXPENSES'?'Saldo parcial antes das despesas mensais':presentation.basis==='BEFORE_UNCONFIRMED_DAS'?'Saldo parcial antes do DAS mensal':'Saldo parcial antes do DAS e das despesas mensais':null;
  el('Result').dataset.state=monthlyPartial?'partial':known?'available':'waiting';el('Result').dataset.negative=String(known&&amount<0);el('Net').textContent=known?money(amount):'Em apuração';el('NetLabel').textContent=monthlyPartial?monthlyLabel:partial?'Saldo após custos conhecidos':item.payout_basis==='BASE_REPASS'?'Estimativa com repasse base informado':'Estimativa após os custos do dia.';
  el('Badge').textContent=monthlyPartial?'Custos mensais pendentes':partial?'Custos incompletos':!known?'Em apuração':item.pending.length?'Em conferência':item.day_partial?'Leitura parcial do dia':'Estimativa';
  if(monthlyPartial)el('Help').textContent='Produção e anúncios considerados.'+(presentation.das_included?' A parcela diária do DAS já foi descontada.':'')+(presentation.expenses_included?' A parcela diária das despesas já foi descontada.':'')+' '+presentation.monthly_costs_missing.map(code=>pendingMessages[code]).join(' ')+' Este subtotal pode diminuir e não representa o lucro completo do dia.';
  else if(partial)el('Help').textContent=(Number.isSafeInteger(item.production_coverage.pending_units)?'Falta identificar o custo de '+item.production_coverage.pending_units+' unidade(s). ':'Há custos de produção pendentes. ')+'Este subtotal pode diminuir e não representa o lucro completo do dia.';
  else if(known)el('Help').textContent='Produção, anúncios e parcela diária de DAS e despesas mensais considerados.'+(item.day_partial?' A leitura cobre somente parte deste dia.':'');
  else el('Help').textContent=item.reason==='DAILY_HISTORY_PENDING'?'Os pedidos salvos ainda não têm detalhamento por dia. A próxima coleta compatível preencherá esta seção.':item.reason==='CREATION_DATE_INCOMPLETE'?'A origem não trouxe a data de criação de todos os pedidos. O resultado diário aguarda essa informação.':item.pending.map(code=>pendingMessages[code]).filter(Boolean).slice(0,2).join(' ')||'Ainda faltam valores para calcular esta data.';
  const returnsNotice=[];
  if(item.coverage){const c=item.coverage;returnsNotice.push(c.returns?c.returns+' pedido(s) com devolução informada nesta leitura.':c.returns_unknown?'':'Nenhuma devolução informada nesta leitura.');if(c.returns_unknown)returnsNotice.push('A leitura de devoluções está pendente em '+c.returns_unknown+' pedido(s).');}
  else returnsNotice.push('Aguardando a leitura de devoluções do dia.');
  if(item.payout_basis==='AFTER_ADJUSTMENTS')returnsNotice.push('Repasse após os ajustes informados pela Shopee.');
  else if(item.payout_basis==='BASE_REPASS')returnsNotice.push(item.pending.some(code=>code==='ADJUSTMENTS_PENDING'||code==='ADJUSTMENT_CONFLICT')?'Repasse base; ajustes ainda em conferência.':'Repasse base informado pela Shopee.');
  if(item.pending.includes('RETURNS_NOT_RECONCILED'))returnsNotice.push('Devoluções e reembolsos ainda podem alterar a estimativa.');
  el('Returns').textContent=returnsNotice.filter(Boolean).join(' ');
  el('Sales').textContent=money(item.sales_cents);el('Ads').textContent=money(item.ads_spend_cents);el('Paid').textContent=item.coverage===null?'—':new Intl.NumberFormat('pt-BR').format(item.coverage.paid);
  const coverage=item.production_coverage;el('Coverage').textContent=Number.isSafeInteger(coverage.known_units)&&Number.isSafeInteger(coverage.total_units)?coverage.known_units+' de '+coverage.total_units+' unidades com custo':'Cobertura dos custos ainda indisponível.';
  const row=(label,value,prefix='')=>{const group=node('div');group.append(node('dt',label),node('dd',Number.isSafeInteger(value)?prefix+money(value):'Não informado'));el('Waterfall').append(group);};
  row('Vendas dos pedidos pagos',item.sales_cents);row(item.payout_basis==='AFTER_ADJUSTMENTS'?'Repasse após ajustes informados':'Repasse base informado',item.payout_cents);row(partial?'Produção com custo identificado':'Custo de produção',partial?item.known_production_cost_cents:item.production_cost_cents,'− ');row('Anúncios na data informada pela Shopee',item.ads_spend_cents,'− ');row('Parcela diária do DAS',item.allocated_das_cents,'− ');row('Parcela diária das despesas mensais',item.allocated_expenses_cents,'− ');if(item.recharge_addback_cents!==0)row('Recarga de anúncios reposta',item.recharge_addback_cents,'+ ');row(monthlyPartial?monthlyLabel:partial?'Saldo após custos conhecidos':'Lucro estimado do dia',amount);
  const negative=value=>Number.isSafeInteger(value)?value===0?0:-value:null;
  financialBars.draw(el('CompositionChart'),[{label:'Vendas dos pedidos pagos · contexto',value:item.sales_cents,role:'CONTEXT'},{label:'Repasse informado',value:item.payout_cents,role:'START'},{label:partial?'Produção identificada · referência parcial':'Produção de referência das vendas',value:negative(partial?item.known_production_cost_cents:item.production_cost_cents),role:'DEDUCTION'},{label:'Ads da data',value:negative(item.ads_spend_cents),role:'DEDUCTION'},{label:'DAS alocado',value:negative(item.allocated_das_cents),role:'DEDUCTION'},{label:'Despesas alocadas',value:negative(item.allocated_expenses_cents),role:'DEDUCTION'},{label:'Recarga reposta',value:item.recharge_addback_cents,role:'ADJUSTMENT'},{label:monthlyPartial?monthlyLabel:partial?'Saldo com custos conhecidos':'Resultado estimado',value:amount,role:'RESULT'}],{title:'Componentes do dia · valores assinados',basis:day(item.date)+' · pedidos pagos e calendário Ads. Fabricação física separada; vendas são contexto.',complete:known&&!partial&&!monthlyPartial&&!item.day_partial&&item.pending.length===0});
  const allocation=summary.allocation;el('Allocation').textContent='DAS e despesas são distribuídos pelos '+allocation.days_in_month+' dias deste mês, com centavos preservados no total. DAS mensal: '+money(allocation.monthly_das_cents)+'. Despesas mensais: '+money(allocation.monthly_expenses_cents)+'. A conta mensal desconta o valor completo, por isso não equivale à soma parcial dos dias já coletados.';
  for(const code of item.pending)el('Pending').append(node('li',pendingMessages[code]||'Parte dos dados ainda precisa de conferência.'));
  el('Pending').append(node('li','Os anúncios seguem a data informada pela Shopee, cujo fuso ainda não foi confirmado. O gasto não identifica quais pedidos foram atribuídos aos anúncios.'));
  const times=item.source_checked_at,empty=item.coverage?.orders===0;el('Sources').textContent=(empty?'Nenhum pedido nesta data. Corte da consulta: '+time(item.source_cutoff_at)+'.':'Financeiro consultado de '+time(times.finance_oldest_at)+' a '+time(times.finance_latest_at)+'. Corte original dos pedidos: '+time(item.source_cutoff_at)+'.')+' Anúncios consultados em '+time(times.ads_at)+'.';
  status((item.day_partial?'Leitura parcial. ':'')+(item.pending.includes('FINANCIAL_SOURCE_STALE')?'A fonte financeira precisa de atualização. ':item.pending.includes('ADS_SOURCE_STALE')?'A fonte de anúncios precisa de atualização. ':'')+(empty?'Nenhum pedido nesta data. Corte da consulta: '+time(item.source_cutoff_at)+'.':'Dados financeiros: '+time(times.finance_latest_at)+'.')+' Estimativa, sem confirmar recebimento em banco.');
 }
 function prepare(){
  if(stopped||!el(''))return false;if(prepared)return true;
  let date=null,month=null,tab='overview';try{const params=new URLSearchParams(globalThis.location?.search||'');date=params.getAll('date').length===1?params.get('date'):null;month=params.getAll('month').length===1?params.get('month'):null;if(params.getAll('tab').length===1)tab=params.get('tab');}catch{}
  const explicitDate=validDate(date),pinnedMonth=tab!=='overview'&&validMonth(month),historicalMonth=pinnedMonth&&month!==today().slice(0,7);
  selected=explicitDate?date:historicalMonth?month+'-01':today();followToday=!explicitDate&&!pinnedMonth;contextMonth=selected.slice(0,7);prepared=true;
  el('Today').onclick=()=>selectDate(today(),{trackToday:true});el('Yesterday').onclick=()=>selectDate(previousDay());el('Date').onchange=()=>selectDate(el('Date').value);render();return true;
 }
 function syncTodaySelection(){
  if(!prepared||stopped||!followToday||selected===today())return false;
  selected=today();contextMonth=selected.slice(0,7);if(loadedMonth!==contextMonth)loadedMonth=null;
  pendingMonth=null;pendingRequest=null;invalidSummary=false;selectionFailed=false;saveSelection();render();return true;
 }
 function bootstrapState(options={}){
  if(stopped||!['LOADING','RETRYING','FAILED','READY'].includes(options.phase)||active&&options.phase!=='READY')return false;if(!prepare())return false;phase=options.phase;
  if(phase==='FAILED'){const descriptor=Object.getOwnPropertyDescriptor(options,'failureKind'),kind=descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:null;failureKind=typeof kind==='string'&&Object.hasOwn(failures,kind)?kind:'INVALID';}
  if(phase==='READY')active=true;render();return true;
 }
 function selectDate(value,{trackToday=false}={}){
  if(!active||stopped||!validDate(value)){if(prepared){el('Date').value=selected;if(active&&!stopped)status('Escolha uma data válida, até hoje em Brasília.',true);}return Promise.resolve(false);}
  selected=value;followToday=trackToday&&value===today();saveSelection();const month=selected.slice(0,7);
  if(pendingRequest?.month===month){render();return pendingRequest.promise??Promise.resolve(true);}
  if(loadedMonth===month&&pendingRequest===null&&!selectionFailed){render();return Promise.resolve(true);}
  const request={month,promise:null};pendingRequest=request;pendingMonth=month;selectionFailed=false;render();
  const finish=success=>{if(stopped||pendingRequest!==request)return false;pendingRequest=null;pendingMonth=null;selectionFailed=success===false;render();return !selectionFailed;};
  let result;try{if(typeof globalThis.brazaMonthDashboard?.selectMonth!=='function')throw Error();result=globalThis.brazaMonthDashboard.selectMonth(month);}catch{return Promise.resolve(finish(false));}
  request.promise=Promise.resolve(result).then(success=>finish(success!==false),()=>finish(false));return request.promise;
 }
 function setContext(value,context={}){
  if(stopped||!prepare())return false;const month=context.month??context.monthly?.month;if(!validMonth(month))return false;
  if(pendingRequest!==null&&month!==pendingRequest.month||pendingRequest===null&&month!==contextMonth)return false;
  if(selected.slice(0,7)!==month){followToday=month===today().slice(0,7);selected=followToday?today():month+'-01';saveSelection();}
  contextMonth=month;loadedMonth=month;pendingMonth=null;selectionFailed=false;let checked=null;try{checked=value===null?null:projectDailyBusinessSummary(value,context.monthly,context.scope);}catch{}
  summary=checked;invalidSummary=value!==null&&checked===null;render();return checked!==null;
 }
 function reset(options={}){
  if(stopped||!prepare())return false;const month=options.month;if(validMonth(month)){if(pendingRequest!==null&&pendingRequest.month!==month){pendingMonth=null;pendingRequest=null;}contextMonth=month;if(selected.slice(0,7)!==month){followToday=month===today().slice(0,7);selected=followToday?today():month+'-01';saveSelection();}}loadedMonth=null;summary=null;invalidSummary=false;selectionFailed=false;render();return true;
 }
 function snapshot(){
  if(!prepared)prepare();syncTodaySelection();const item=summary?.days?.find?.(row=>row.date===selected)??null;
  if(!item)return Object.freeze({schema:'mls_day_snapshot_v1',date:selected,state:'PENDING',net_cents:null,net_basis:null,sales_cents:null,ads_spend_cents:null,paid_orders:null,pending:[],presentation:null});
  const partial=item.state==='PARTIAL_COSTS',amount=partial?item.known_estimate_cents:item.estimate_cents,coverage=item.coverage,production=item.production_coverage;
  const presentation=projectDailyProfitPresentation(item),safePresentation=presentation?Object.freeze({...presentation,monthly_costs_missing:Object.freeze([...presentation.monthly_costs_missing])}):null;
  return Object.freeze({schema:'mls_day_snapshot_v1',date:selected,state:item.state,net_cents:Number.isSafeInteger(amount)?amount:null,net_basis:Number.isSafeInteger(amount)?partial?'KNOWN_COSTS':'ESTIMATE':null,sales_cents:Number.isSafeInteger(item.sales_cents)?item.sales_cents:null,ads_spend_cents:Number.isSafeInteger(item.ads_spend_cents)?item.ads_spend_cents:null,paid_orders:Number.isSafeInteger(coverage?.paid)?coverage.paid:null,pending:Array.isArray(item.pending)?[...item.pending]:[],presentation:safePresentation,production_coverage:production?Object.freeze({known_units:Number.isSafeInteger(production.known_units)?production.known_units:null,total_units:Number.isSafeInteger(production.total_units)?production.total_units:null,pending_units:Number.isSafeInteger(production.pending_units)?production.pending_units:null}):null});
 }
 function stop(){stopped=true;active=false;summary=null;pendingMonth=null;pendingRequest=null;loadedMonth=null;render();}
 globalThis.brazaDayDashboard=Object.freeze({prepare,bootstrapState,setContext,reset,stop,selectDate,getSelection:()=>{if(!prepared)prepare();syncTodaySelection();return selected;},getSnapshot:snapshot,getMonthAnalytics:()=>active&&!stopped&&!pendingRequest&&!selectionFailed&&summary?.month===contextMonth?projectProductionDailyFinance(summary,{month:contextMonth,selected_date:selected}):null,getTrend:()=>{syncTodaySelection();return projectMissionDailyTrend(summary,selected);}});
})();

(()=>{
 const financialBars=(function createMlsFinancialBars(document){
 const safe=value=>Number.isSafeInteger(value)&&!Object.is(value,-0);
 const project=(rows,{title='Componentes financeiros',basis='',complete=false}={})=>{
  if(typeof title!=='string'||title.length>160||typeof basis!=='string'||basis.length>400||typeof complete!=='boolean'||!Array.isArray(rows)||!rows.length||rows.length>24)return null;
  const seen=new Set(),segments=[];
  for(const row of rows){if(!row||typeof row.label!=='string'||!row.label.trim()||row.label.length>120||seen.has(row.label)||row.value!==null&&!safe(row.value)||!['START','DEDUCTION','ADJUSTMENT','RESULT','CONTEXT'].includes(row.role))return null;seen.add(row.label);segments.push({label:row.label,value:row.value,role:row.role});}
  return {schema:'mls_signed_financial_bars_v1',unit:'BRL_CENTS',type:'signedBar',status:complete&&segments.every(row=>row.value!==null)?'READY':'PARTIAL',title,basis,segments};
 };
 const money=value=>{if(value===null)return 'Pendente';const n=BigInt(value),abs=n<0n?-n:n;return (n<0n?'− ':'')+'R$ '+new Intl.NumberFormat('pt-BR').format(abs/100n)+','+String(abs%100n).padStart(2,'0');};
 function draw(host,rows,options){
  if(!host)return false;host.replaceChildren();const model=project(rows,options);if(!model){host.textContent='Os componentes financeiros aguardam uma fonte válida.';return false;}
  const make=(tag,text,cls)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(cls)item.className=cls;return item;};
  host.className='mls-financial-bars';host.dataset.chartUnit=model.unit;host.dataset.chartStatus=model.status;
  host.append(make('h4',model.title),make('p',model.basis+(model.status==='PARTIAL'?' Componentes conhecidos e pendências; não formam uma conta fechada.':' Valores assinados da mesma base.')));
  const max=Math.max(1,...model.segments.filter(row=>row.value!==null).map(row=>Math.abs(row.value))),list=make('div',undefined,'mls-financial-bar-list'),readout=make('p','Selecione um componente para conferir o valor e a função na composição.','mls-financial-bar-readout'),buttons=[];
  readout.setAttribute('aria-live','polite');
  const roles={START:'Base de entrada',DEDUCTION:'Dedução',ADJUSTMENT:'Ajuste',RESULT:'Resultado da base indicada',CONTEXT:'Contexto; não é nova dedução'};
  for(const row of model.segments){
   const button=make('button',undefined,'mls-financial-bar-point');button.type='button';button.dataset.sign=row.value===null?'unknown':row.value<0?'negative':'positive';button.dataset.role=row.role;button.setAttribute('aria-pressed','false');const description=row.label+': '+money(row.value)+' · '+roles[row.role]+(model.status==='PARTIAL'?' · base parcial':'');button.setAttribute('aria-label',description);
   const label=make('span',row.label),track=make('span',undefined,'mls-financial-bar-track'),bar=make('i'),amount=make('strong',money(row.value));track.setAttribute('aria-hidden','true');
   // Absolute magnitude is only geometric; negative values retain their signed
   // amount and extend left of the visible zero axis.
   if(row.value!==null){const width=Math.abs(row.value)/max*50;bar.style.width=width+'%';bar.style.left=(row.value<0?50-width:50)+'%';track.append(bar);}else track.append(make('span','—'));button.append(label,track,amount);
   const select=()=>{for(const peer of buttons)peer.setAttribute('aria-pressed',String(peer===button));readout.textContent=description;};button.onclick=select;button.onfocus=select;buttons.push(button);list.append(button);
  }
  buttons.forEach((button,index)=>button.onkeydown=event=>{const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'||event.key==='ArrowRight'?Math.min(buttons.length-1,index+1):event.key==='ArrowUp'||event.key==='ArrowLeft'?Math.max(0,index-1):-1;if(event.key==='Escape'){for(const peer of buttons)peer.setAttribute('aria-pressed','false');readout.textContent='Seleção fechada. Os valores permanecem na lista equivalente.';}else if(next>=0){event.preventDefault?.();buttons[next].focus?.();buttons[next].onclick();}});
  host.append(list,readout);return true;
 }
 return Object.freeze({project,draw});
})(document);
 function projectMissionAdsSnapshot(frame){
 const safe=value=>Number.isSafeInteger(value)&&value>=0&&!Object.is(value,-0);
 const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 const ratio=(sales,expense)=>{if(sales===null||expense===null||expense===0)return null;const n=BigInt(sales)*1000000n,d=BigInt(expense);let value=n/d;if(n%d*2n>=d)value++;return String(value/1000000n)+'.'+String(value%1000000n).padStart(6,'0');};
 try{
  if(frame?.schema!=='business_month_v1'||typeof frame.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(frame.month)||frame.start_date!==frame.month+'-01'||!date(frame.end_date)||frame.end_date.slice(0,7)!==frame.month||!safe(frame.checked_at)||frame.checked_at===0)return null;
  const ads=frame.ads;
  if(!ads)return null;
  if(ads.schema!=='ads_calendar_v1'||!['AVAILABLE','PARTIAL','UNAVAILABLE'].includes(ads.status)||ads.start_date!==frame.start_date||ads.end_date!==frame.end_date||!safe(ads.fetched_at)||ads.fetched_at===0||ads.fetched_at>frame.checked_at+5||ads.unit_confirmation!=='OPERATOR_CONFIRMED_BRL_2026_10_20'||ads.source_timezone!=='UNCONFIRMED'||ads.basis!=='CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION'||typeof ads.day_partial!=='boolean')return null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(ads.fetched_at*1000));
  if(ads.end_date>today||ads.day_partial!==(ads.end_date===today))return null;
  const total=Number(ads.end_date.slice(8));
  if(ads.total_days!==total||!safe(ads.covered_days)||ads.covered_days>total||!Array.isArray(ads.days)||ads.days.length>31)return null;
  const broad=ads.totals?.broad;
  if(!broad||broad.gmv_cents!==null&&!safe(broad.gmv_cents)||ads.expense_cents!==null&&!safe(ads.expense_cents)||broad.calculated_roas_raw!==ratio(broad.gmv_cents,ads.expense_cents))return null;
  const days=[];let covered=0,expense=0n,sales=0n,salesComplete=true;
  if(ads.status==='UNAVAILABLE'){
   if(ads.days.length||ads.covered_days!==0||ads.expense_cents!==null||broad.gmv_cents!==null||broad.calculated_roas_raw!==null)return null;
  }else{
   if(ads.days.length!==total)return null;
   for(const [index,day] of ads.days.entries()){
    const expected=frame.month+'-'+String(index+1).padStart(2,'0'),gmv=day?.broad?.gmv_cents;
    if(day?.date!==expected||day.expense_cents!==null&&!safe(day.expense_cents)||gmv!==null&&!safe(gmv)||day.broad.calculated_roas_raw!==ratio(gmv,day.expense_cents))return null;
    if(day.expense_cents!==null){covered++;expense+=BigInt(day.expense_cents);}
    if(gmv===null)salesComplete=false;else sales+=BigInt(gmv);
    days.push(Object.freeze({date:expected,expense_cents:day.expense_cents,attributed_sales_cents:gmv,calculated_roas_raw:day.broad.calculated_roas_raw,partial:ads.day_partial&&expected===ads.end_date}));
   }
   if(covered!==ads.covered_days||expense>BigInt(Number.MAX_SAFE_INTEGER)||sales>BigInt(Number.MAX_SAFE_INTEGER)||ads.status==='AVAILABLE'&&(covered!==total||ads.expense_cents!==Number(expense))||ads.status==='PARTIAL'&&(covered===total||ads.expense_cents!==null)||broad.gmv_cents!==(salesComplete?Number(sales):null))return null;
  }
  return Object.freeze({schema:'mls_month_ads_snapshot_v1',month:frame.month,start_date:frame.start_date,end_date:frame.end_date,status:ads.status,checked_at:ads.fetched_at,expense_cents:ads.expense_cents,attributed_sales_cents:broad.gmv_cents,calculated_roas_raw:broad.calculated_roas_raw,covered_days:ads.covered_days,total_days:total,day_partial:ads.day_partial,source_timezone:'UNCONFIRMED',attribution:'BROAD',basis:'CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION',days:Object.freeze(days)});
 }catch{return null;}
}
 function buildMlsProductIntelligence(frame){
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
 const signed=value=>integer(value,Number.MIN_SAFE_INTEGER);
 const id=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(value);
 const safe=value=>value<=BigInt(Number.MAX_SAFE_INTEGER)&&value>=BigInt(Number.MIN_SAFE_INTEGER)?Number(value):null;
 const data=(value,keys)=>keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
 try{
  if(!plain(frame)||!data(frame,['status','month','product_summary','result'])||frame.status!=='COMPLETE'||typeof frame.month!=='string'||
     !/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(frame.month))return null;
  if(!plain(frame.result)||!data(frame.result,['pending'])||!Array.isArray(frame.result.pending)||
   frame.result.pending.length>30||frame.result.pending.some(code=>typeof code!=='string'||code.length>80))return null;
  const sourcePending=frame.result.pending;
  const financialBlocked=sourcePending.some(code=>['SOURCE_UNAVAILABLE','FINANCIAL_SOURCE_STALE',
   'PAYMENT_INCOMPLETE','STATUS_REVIEW_REQUIRED'].includes(code));
  const report=frame.product_summary;
  if(!plain(report)||!data(report,['schema','mixed_orders','products'])||report.schema!=='business_month_products_v1'||!integer(report.mixed_orders,0,3000)||
     !Array.isArray(report.products)||report.products.length>3000)return null;
  const seen=new Set(),variants=[],products=[];let volume=0n,covered=0,coveredBalance=0n;
  for(const row of report.products){
   if(!plain(row)||!data(row,['item_id','quantity','orders','exclusive_orders','mixed_orders','pending','variants',
      'exclusive_sales_cents','exclusive_after_costs_cents','exclusive_margin_bps'])||!id(row.item_id)||row.item_id==='0'||seen.has(row.item_id)||!integer(row.quantity,1)||
      !integer(row.exclusive_orders,0,3000)||!integer(row.mixed_orders,0,3000)||
      !integer(row.orders,1,3000)||row.orders!==row.exclusive_orders+row.mixed_orders||
      !Array.isArray(row.pending)||row.pending.length>12||row.pending.some(code=>typeof code!=='string'||code.length>80)||
      !Array.isArray(row.variants)||row.variants.length>3000||
      row.exclusive_sales_cents!==null&&!integer(row.exclusive_sales_cents)||
      row.exclusive_after_costs_cents!==null&&!signed(row.exclusive_after_costs_cents)||
      row.exclusive_margin_bps!==null&&!signed(row.exclusive_margin_bps))return null;
   seen.add(row.item_id);volume+=BigInt(row.quantity);
   if(volume>BigInt(Number.MAX_SAFE_INTEGER))return null;
   const contributionReady=!financialBlocked&&row.pending.length===0&&row.exclusive_orders>0&&
      signed(row.exclusive_after_costs_cents)&&integer(row.exclusive_sales_cents,1);
   const contribution=contributionReady?row.exclusive_after_costs_cents:null;
   if(contribution!==null){covered++;coveredBalance+=BigInt(contribution);}
   const variantSeen=new Set();let variantQuantity=0n;
   for(const v of row.variants){
    if(!plain(v)||!data(v,['model_id','quantity','unit_cost_cents'])||!id(v.model_id)||variantSeen.has(v.model_id)||!integer(v.quantity,1)||
       v.unit_cost_cents!==null&&!integer(v.unit_cost_cents,0,100000000))return null;
    variantSeen.add(v.model_id);
    variantQuantity+=BigInt(v.quantity);
    variants.push({item_id:row.item_id,model_id:v.model_id,quantity:v.quantity,
      unit_cost_cents:v.unit_cost_cents});
    if(variants.length>3000)return null;
   }
   if(variantQuantity!==BigInt(row.quantity))return null;
   products.push({item_id:row.item_id,quantity:row.quantity,orders:row.orders,
    exclusive_orders:row.exclusive_orders,mixed_orders:row.mixed_orders,
    exclusive_sales_cents:row.exclusive_sales_cents,
    exclusive_after_costs_cents:contribution,
    exclusive_margin_bps:contributionReady?row.exclusive_margin_bps:null,
    pending:[...row.pending]});
  }
  const totalUnits=safe(volume),knownBalance=safe(coveredBalance);
  if(totalUnits===null||knownBalance===null)return null;
  const order=(a,b)=>a.item_id.length-b.item_id.length||(a.item_id<b.item_id?-1:a.item_id>b.item_id?1:0);
  const ranked=[...products].sort((a,b)=>b.quantity-a.quantity||order(a,b));
  let running=0n;
  for(const item of ranked){
   item.abc_units=volume===0n?null:running*100n<volume*80n?'A':running*100n<volume*95n?'B':'C';
   running+=BigInt(item.quantity);
  }
  const revenueReady=report.mixed_orders===0&&!financialBlocked&&products.every(row=>
    row.pending.length===0&&row.exclusive_orders>0&&integer(row.exclusive_sales_cents));
  let revenueRanks=null;
  if(revenueReady&&products.length){
   const total=products.reduce((sum,row)=>sum+BigInt(row.exclusive_sales_cents),0n);
   if(total>0n&&safe(total)!==null){
    let before=0n;
    revenueRanks=[...products].sort((a,b)=>b.exclusive_sales_cents-a.exclusive_sales_cents||order(a,b))
      .map(row=>{
       const band=before*100n<total*80n?'A':before*100n<total*95n?'B':'C';
       before+=BigInt(row.exclusive_sales_cents);
       return {item_id:row.item_id,abc_revenue:band,exclusive_sales_cents:row.exclusive_sales_cents};
      });
   }
  }
  const revenueById=new Map((revenueRanks||[]).map(row=>[row.item_id,row.abc_revenue]));
  for(const row of ranked)row.abc_revenue=revenueById.get(row.item_id)??null;
  return {
   schema:'mls_product_intelligence_shadow_v1',mode:'OBSERVER',month:frame.month,
   source:'VALIDATED_MONTH_PRODUCT_SUMMARY',units_abc_basis:'SOLD_UNITS_NOT_INVENTORY',
   total_products:products.length,total_units:totalUnits,
   exclusive_balance_covered_products:covered,
   exclusive_balance_unverified_products:products.length-covered,
   covered_exclusive_balance_cents:knownBalance,
   exclusive_balance_basis:'EXCLUSIVE_ORDERS_BEFORE_ADS_OTHER_EXPENSES_AND_POSSIBLE_MEI_DAS',
   revenue_abc_status:revenueRanks?'AVAILABLE':'BLOCKED_INCOMPLETE_OR_MIXED_ORDERS',
   revenue_abc_basis:revenueRanks?'PAID_EXCLUSIVE_ORDER_PRODUCT_SALES_ONLY':null,
   safe_sku_net_profit_cents:null,safe_price_cents:null,inventory_verified:false,
   execution_allowed:false,
   blockers:['M2_RECONCILIATION_NOT_VERIFIED','OFFICIAL_FEE_CONTRACT_NOT_VERIFIED',
    'ADS_ATTRIBUTION_NOT_VERIFIED','INVENTORY_NOT_VERIFIED'],
   products:ranked,variants
  };
 }catch{return null;}
}
 function simulateMlsPricingScenario(input){
 const integer=(v,min,max)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 try{
  if(input===null||typeof input!=='object'||Object.getPrototypeOf(input)!==Object.prototype||
     !['unit_cost_cents','extra_cost_cents','fee_bps','ads_bps','target_margin_bps']
      .every(k=>Object.hasOwn(input,k))||Reflect.ownKeys(input).length!==5)return null;
  if(!integer(input.unit_cost_cents,1,100000000)||!integer(input.extra_cost_cents,0,100000000)||
     !integer(input.fee_bps,0,9000)||!integer(input.ads_bps,0,9000)||
     !integer(input.target_margin_bps,0,9000))return null;
  const rates=input.fee_bps+input.ads_bps+input.target_margin_bps;
  if(rates>=10000)return null;
  const denominator=BigInt(10000-rates);
  const base=BigInt(input.unit_cost_cents)+BigInt(input.extra_cost_cents);
  const scenario=(base*10000n+denominator-1n)/denominator;
  if(scenario>BigInt(Number.MAX_SAFE_INTEGER))return null;
  return {
   schema:'mls_pricing_simulation_v1',status:'SIMULATION_ONLY',mode:'OBSERVER',
   calculated_scenario_price_cents:Number(scenario),
   supplied_cost_base_cents:Number(base),
   operator_assumptions:{fee_bps:input.fee_bps,ads_bps:input.ads_bps,
    target_margin_bps:input.target_margin_bps,extra_cost_cents:input.extra_cost_cents},
   not_a_safe_price:true,may_publish:false,may_modify_ads:false,
   warnings:['PERCENTAGES_ARE_ASSUMPTIONS','NO_PROOF_OF_TAX_FREIGHT_OR_FIXED_EXPENSE_COVERAGE',
    'NO_VALIDATED_ADS_SKU_ATTRIBUTION','INVENTORY_NOT_VERIFIED','M2_NOT_CLOSED']
  };
 }catch{return null;}
}
 function buildMlsProductWorkbench(report,catalog=[]){
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
 const list=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'));
 const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
 const signed=value=>integer(value,Number.MIN_SAFE_INTEGER);
 const id=(value,zero=false)=>typeof value==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(value);
 const safe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
 const order=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
 const codes=(value,max)=>list(value,max)&&new Set(value).size===value.length&&value.every(code=>typeof code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(code));
 const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
 const label=value=>typeof value==='string'&&value.length<=1024&&!/[\u0000-\u001f\u007f-\u009f]/.test(value)&&value.trim()?value.trim().normalize('NFC'):null;
 const metadata=()=>{
  const products=new Map(),seen=new Set(),ambiguous=new Set();let variants=0,characters=0;
  try{
   if(!list(catalog,3000))return products;
   for(const item of catalog){
    if(!exact(item,['item_id','product_name','variants'])||!id(item.item_id))continue;
    if(ambiguous.has(item.item_id))continue;
    if(seen.has(item.item_id)){products.delete(item.item_id);ambiguous.add(item.item_id);continue;}
    seen.add(item.item_id);
    if(item.product_name!==null&&label(item.product_name)===null||!list(item.variants,3000))continue;
    variants+=item.variants.length;if(variants>3000)return new Map();
    const name=item.product_name===null?null:label(item.product_name),models=new Map(),modelSeen=new Set(),duplicates=new Set();
    characters+=name?.length||0;if(characters>1048576)return new Map();
    for(const variant of item.variants){
     if(!exact(variant,['model_id','model_name','attributes'])||!id(variant.model_id,true))continue;
     if(duplicates.has(variant.model_id))continue;
     if(modelSeen.has(variant.model_id)){models.delete(variant.model_id);duplicates.add(variant.model_id);continue;}
     modelSeen.add(variant.model_id);
     const modelName=variant.model_name===null?null:label(variant.model_name);
     if(variant.model_name!==null&&modelName===null||!list(variant.attributes,10))continue;
     const attributes=[],axes=new Set();let valid=true;
     for(const attribute of variant.attributes){
      if(!exact(attribute,['name','value'])){valid=false;break;}
      const axis=label(attribute.name),value=label(attribute.value);
      if(axis===null||value===null||axes.has(axis.toLowerCase())){valid=false;break;}
      axes.add(axis.toLowerCase());attributes.push({name:axis,value});characters+=axis.length+value.length;if(characters>1048576)return new Map();
     }
     if(!valid)continue;
     characters+=modelName?.length||0;if(characters>1048576)return new Map();models.set(variant.model_id,{model_name:modelName,attributes});
    }
    if(characters>1048576)return new Map();
    products.set(item.item_id,{product_name:name,variants:models});
   }
  }catch{return new Map();}
  return products;
 };
 try{
  const reportKeys=['schema','mode','month','source','units_abc_basis','total_products','total_units','exclusive_balance_covered_products','exclusive_balance_unverified_products','covered_exclusive_balance_cents','exclusive_balance_basis','revenue_abc_status','revenue_abc_basis','safe_sku_net_profit_cents','safe_price_cents','inventory_verified','execution_allowed','blockers','products','variants'];
  const productKeys=['item_id','quantity','orders','exclusive_orders','mixed_orders','exclusive_sales_cents','exclusive_after_costs_cents','exclusive_margin_bps','pending','abc_units','abc_revenue'];
  if(!exact(report,reportKeys)||report.schema!=='mls_product_intelligence_shadow_v1'||report.mode!=='OBSERVER'||typeof report.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(report.month)||report.source!=='VALIDATED_MONTH_PRODUCT_SUMMARY'||report.units_abc_basis!=='SOLD_UNITS_NOT_INVENTORY'||report.exclusive_balance_basis!=='EXCLUSIVE_ORDERS_BEFORE_ADS_OTHER_EXPENSES_AND_POSSIBLE_MEI_DAS'||report.safe_sku_net_profit_cents!==null||report.safe_price_cents!==null||report.inventory_verified!==false||report.execution_allowed!==false||!integer(report.total_products,0,3000)||!integer(report.total_units)||!integer(report.exclusive_balance_covered_products,0,3000)||!integer(report.exclusive_balance_unverified_products,0,3000)||!signed(report.covered_exclusive_balance_cents)||!codes(report.blockers,30)||!list(report.products,3000)||!list(report.variants,3000)||report.products.length!==report.total_products)return null;
  const requiredBlockers=['M2_RECONCILIATION_NOT_VERIFIED','OFFICIAL_FEE_CONTRACT_NOT_VERIFIED','ADS_ATTRIBUTION_NOT_VERIFIED','INVENTORY_NOT_VERIFIED'];
  if(!requiredBlockers.every(code=>report.blockers.includes(code))||!['AVAILABLE','BLOCKED_INCOMPLETE_OR_MIXED_ORDERS'].includes(report.revenue_abc_status)||report.revenue_abc_basis!==(report.revenue_abc_status==='AVAILABLE'?'PAID_EXCLUSIVE_ORDER_PRODUCT_SALES_ONLY':null))return null;
  const products=new Map();let totalUnits=0n,covered=0,coveredBalance=0n;
  for(const row of report.products){
   if(!exact(row,productKeys)||!id(row.item_id)||products.has(row.item_id)||!integer(row.quantity,1)||!integer(row.orders,1,3000)||!integer(row.exclusive_orders,0,3000)||!integer(row.mixed_orders,0,3000)||row.orders!==row.exclusive_orders+row.mixed_orders||row.quantity<row.orders||row.exclusive_sales_cents!==null&&!integer(row.exclusive_sales_cents)||row.exclusive_after_costs_cents!==null&&!signed(row.exclusive_after_costs_cents)||row.exclusive_margin_bps!==null&&!signed(row.exclusive_margin_bps)||!codes(row.pending,12)||!['A','B','C'].includes(row.abc_units)||![null,'A','B','C'].includes(row.abc_revenue))return null;
   if(row.exclusive_after_costs_cents!==null){
    if(!integer(row.exclusive_sales_cents,1)||!row.exclusive_orders||row.pending.length)return null;
    const margin=safe(BigInt(row.exclusive_after_costs_cents)*10000n/BigInt(row.exclusive_sales_cents));if(margin===null||row.exclusive_margin_bps!==margin)return null;
    covered++;coveredBalance+=BigInt(row.exclusive_after_costs_cents);
   }else if(row.exclusive_margin_bps!==null)return null;
   const copy=Object.fromEntries(productKeys.map(key=>[key,row[key]]));copy.pending=[...row.pending];copy.variants=[];
   products.set(row.item_id,copy);totalUnits+=BigInt(row.quantity);
  }
  if(safe(totalUnits)!==report.total_units||safe(coveredBalance)!==report.covered_exclusive_balance_cents||covered!==report.exclusive_balance_covered_products||products.size-covered!==report.exclusive_balance_unverified_products)return null;
  const pairs=new Set();
  for(const variant of report.variants){
   if(!exact(variant,['item_id','model_id','quantity','unit_cost_cents'])||!id(variant.item_id)||!id(variant.model_id,true)||!products.has(variant.item_id)||pairs.has(variant.item_id+':'+variant.model_id)||!integer(variant.quantity,1)||variant.unit_cost_cents!==null&&!integer(variant.unit_cost_cents,0,100000000))return null;
   pairs.add(variant.item_id+':'+variant.model_id);products.get(variant.item_id).variants.push({item_id:variant.item_id,model_id:variant.model_id,quantity:variant.quantity,unit_cost_cents:variant.unit_cost_cents});
  }
  const ranked=[...products.values()].sort((a,b)=>b.quantity-a.quantity||order(a.item_id,b.item_id));
  const band=(before,total)=>before*100n<total*80n?'A':before*100n<total*95n?'B':'C';
  if(report.revenue_abc_status==='AVAILABLE'){
   if(!ranked.length||ranked.some(row=>row.pending.length||!row.exclusive_orders||row.mixed_orders||!integer(row.exclusive_sales_cents)))return null;
   const total=ranked.reduce((sum,row)=>sum+BigInt(row.exclusive_sales_cents),0n);if(total<=0n||safe(total)===null)return null;
   let before=0n;for(const row of [...ranked].sort((a,b)=>b.exclusive_sales_cents-a.exclusive_sales_cents||order(a.item_id,b.item_id))){if(row.abc_revenue!==band(before,total))return null;before+=BigInt(row.exclusive_sales_cents);}
  }else if(ranked.some(row=>row.abc_revenue!==null))return null;
  const names=metadata(),coverage={total_units:report.total_units,total_variants:report.variants.length,known_units:0,pending_units:0,known_variants:0,pending_variants:0,known_production_cost_cents:0,production_complete:true};
  const ranking={basis:'SOLD_UNITS',abc_a_products:0,abc_b_products:0,abc_c_products:0,revenue_abc_status:report.revenue_abc_status,revenue_abc_basis:report.revenue_abc_basis};
  let running=0n,allKnownCost=0n;
  for(const row of ranked){
   if(!row.variants.length||row.abc_units!==band(running,totalUnits))return null;
   running+=BigInt(row.quantity);
   const reference=names.get(row.item_id),costs={total_units:row.quantity,total_variants:row.variants.length,known_units:0,pending_units:0,known_variants:0,pending_variants:0,known_production_cost_cents:0,production_complete:true};
   let quantity=0n,knownCost=0n;
   row.variants.sort((a,b)=>order(a.model_id,b.model_id));
   row.variants=row.variants.map(variant=>{
    quantity+=BigInt(variant.quantity);const known=variant.unit_cost_cents!==null;
    const amount=known?safe(BigInt(variant.quantity)*BigInt(variant.unit_cost_cents)):null;
    if(known&&amount===null)throw Error('UNSAFE_REFERENCE_COST');
    costs[known?'known_units':'pending_units']+=variant.quantity;costs[known?'known_variants':'pending_variants']++;
    if(known)knownCost+=BigInt(amount);
    const model=reference?.variants.get(variant.model_id);
    return {...variant,model_name:model?.model_name??null,attributes:model?.attributes.map(attribute=>({...attribute}))??[],production_cost_cents:amount,margin_bps:null,net_profit_cents:null,safe_price_cents:null};
   });
   if(quantity!==BigInt(row.quantity)||!integer(costs.known_units)||!integer(costs.pending_units)||safe(knownCost)===null)return null;
   costs.known_production_cost_cents=Number(knownCost);costs.production_complete=costs.pending_variants===0;
   row.product_name=reference?.product_name??null;row.quantity_share_bps=totalUnits?safe(BigInt(row.quantity)*10000n/totalUnits):null;row.cumulative_quantity_bps=totalUnits?safe(running*10000n/totalUnits):null;
   row.pending_reasons=[...row.pending];if(!costs.production_complete&&!row.pending_reasons.includes('PRODUCTION_COST_INCOMPLETE'))row.pending_reasons.push('PRODUCTION_COST_INCOMPLETE');
   row.known_production_cost_cents=costs.known_production_cost_cents;row.production_cost_cents=costs.production_complete?costs.known_production_cost_cents:null;row.cost_coverage=costs;
   coverage.known_units+=costs.known_units;coverage.pending_units+=costs.pending_units;coverage.known_variants+=costs.known_variants;coverage.pending_variants+=costs.pending_variants;allKnownCost+=knownCost;
   ranking['abc_'+row.abc_units.toLowerCase()+'_products']++;
  }
  if(safe(allKnownCost)===null||!integer(coverage.known_units)||!integer(coverage.pending_units)||BigInt(coverage.known_units)+BigInt(coverage.pending_units)!==totalUnits)return null;
  coverage.known_production_cost_cents=Number(allKnownCost);coverage.production_complete=coverage.pending_variants===0;
  return freeze({schema:'mls_product_workbench_v1',mode:'OBSERVER',month:report.month,source:report.source,units_abc_basis:report.units_abc_basis,cost_basis:'SAVED_CURRENT_REFERENCE_NOT_MANUFACTURING_LEDGER',metadata_basis:'CURRENT_CATALOG_LABELS_NOT_HISTORICAL_PROOF',total_products:report.total_products,total_variants:report.variants.length,total_units:report.total_units,exclusive_balance_covered_products:report.exclusive_balance_covered_products,exclusive_balance_unverified_products:report.exclusive_balance_unverified_products,covered_exclusive_balance_cents:report.covered_exclusive_balance_cents,exclusive_balance_basis:report.exclusive_balance_basis,ranking,coverage,inventory_verified:false,execution_allowed:false,safe_price_cents:null,safe_sku_net_profit_cents:null,blockers:[...report.blockers],products:ranked});
 }catch{return null;}
}
 function buildMlsProductFinancialEvidence(frame,projectMonth){
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const data=(value,keys)=>plain(value)&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
 const exact=(value,keys)=>data(value,keys)&&Reflect.ownKeys(value).length===keys.length;
 const list=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,i)=>Object.getOwnPropertyDescriptor(value,String(i))).every(row=>row&&Object.hasOwn(row,'value'));
 const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
 const signed=value=>integer(value,Number.MIN_SAFE_INTEGER);
 const id=(value,zero=false)=>typeof value==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(value);
 const safe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
 const codes=value=>list(value,30)&&new Set(value).size===value.length&&value.every(code=>typeof code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(code));
 const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
 const compare=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
 try{
  if(typeof projectMonth!=='function')return null;
  const month=projectMonth(frame);
  if(!data(month,['schema','month','status','start_date','end_date','checked_at','bindings_revision','costs_revision','result','product_summary'])||month.schema!=='business_month_v1'||month.status!=='COMPLETE'||typeof month.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month.month)||month.start_date!==month.month+'-01'||typeof month.end_date!=='string'||!new RegExp('^'+month.month+'-(0[1-9]|[12][0-9]|3[01])$').test(month.end_date)||!integer(month.checked_at,1,9999999999)||!integer(month.bindings_revision,1,2147483647)||!integer(month.costs_revision,1,2147483647)||!data(month.result,['pending'])||!codes(month.result.pending))return null;
  const optional=(key,max=2147483647)=>{const descriptor=Object.getOwnPropertyDescriptor(month,key);if(!descriptor)return null;if(!Object.hasOwn(descriptor,'value')||!integer(descriptor.value,1,max))throw Error('INVALID_REVISION');return descriptor.value;};
  const costRules=optional('cost_rules_revision',2147483646),classifications=optional('classification_revision');
  const sourceDescriptor=Object.getOwnPropertyDescriptor(month,'source_checked_at');let oldest=null,latest=null;
  if(sourceDescriptor){
   if(!Object.hasOwn(sourceDescriptor,'value')||!exact(sourceDescriptor.value,['finance_oldest_at','finance_latest_at','ads_at']))return null;
   const times=sourceDescriptor.value;oldest=times.finance_oldest_at;latest=times.finance_latest_at;
   if((oldest===null)!==(latest===null)||oldest!==null&&(!integer(oldest,1,month.checked_at)||!integer(latest,oldest,month.checked_at)))return null;
  }
  const report=month.product_summary,hasTax=plain(report)&&Object.hasOwn(report,'tax_treatment');
  if(!exact(report,['schema','mixed_orders','known_mixed_sales_cents','known_mixed_repass_cents','known_mixed_tax_cents','known_mixed_ads_adjustment_cents','products',...(hasTax?['tax_treatment']:[])])||report.schema!=='business_month_products_v1'||!integer(report.mixed_orders,0,3000)||!list(report.products,3000)||hasTax&&report.tax_treatment!=='MONTHLY_DAS_NOT_ALLOCATED')return null;
  const moneyNames=['sales','repass','production_cost','tax','ads_adjustment','contribution'],componentKeys=moneyNames.map(name=>name+'_cents');
  const rowKeys=['item_id','quantity','orders','exclusive_orders','mixed_orders','exclusive_payment_covered','exclusive_payment_missing','exclusive_returns','exclusive_returns_unknown','known_exclusive_sales_cents','exclusive_sales_cents','known_exclusive_repass_cents','exclusive_repass_cents','known_exclusive_tax_cents','exclusive_tax_cents','known_exclusive_ads_adjustment_cents','exclusive_ads_adjustment_cents','known_production_cost_cents','production_cost_cents','known_exclusive_production_cost_cents','exclusive_production_cost_cents','exclusive_after_costs_cents','exclusive_margin_bps','pending','variants'];
  const variantKeys=['model_id','quantity','exclusive_quantity','mixed_quantity','unit_cost_cents','production_cost_cents','exclusive_production_cost_cents','selling_unit','size','male_size','female_size'];
  const globalPending=[...month.result.pending],globalBlocked=globalPending.filter(code=>['SOURCE_UNAVAILABLE','FINANCIAL_SOURCE_STALE','PAYMENT_INCOMPLETE','STATUS_REVIEW_REQUIRED','ARITHMETIC_UNSAFE','COLLECTING','PERIOD_LIMIT_REACHED'].includes(code));
  const coverage={total_products:report.products.length,strict_products:0,recorded_subtotal_products:0,attributed_variants:0},products=[],seen=new Set();let variantCount=0;
  for(const row of report.products){
   const knownDescriptor=Object.getOwnPropertyDescriptor(row||{},'known_exclusive_after_costs_cents'),hasKnown=knownDescriptor!==undefined;
   if(!exact(row,[...rowKeys,...(hasKnown?['known_exclusive_after_costs_cents']:[])])||!id(row.item_id)||seen.has(row.item_id)||!integer(row.quantity,1)||!integer(row.orders,1,3000)||!['exclusive_orders','mixed_orders','exclusive_payment_covered','exclusive_payment_missing','exclusive_returns','exclusive_returns_unknown'].every(key=>integer(row[key],0,3000))||row.orders!==row.exclusive_orders+row.mixed_orders||row.exclusive_payment_covered+row.exclusive_payment_missing!==row.exclusive_orders||row.exclusive_returns+row.exclusive_returns_unknown>row.exclusive_orders||!codes(row.pending)||!list(row.variants,3000)||!row.variants.length)return null;
   seen.add(row.item_id);variantCount+=row.variants.length;if(variantCount>3000)return null;
   const models=new Set();let exclusive=0n,mixed=0n,knownCost=0n,exclusiveReady=true,totalKnownCost=0n,totalReady=true;
   for(const variant of row.variants){
    const custom=Object.getOwnPropertyDescriptor(variant||{},'selling_unit')?.value==='CUSTOM_PRODUCT';
    if(!exact(variant,[...variantKeys,...(custom?['cost_profile_id','cost_profile_label']:[])])||!id(variant.model_id,true)||models.has(variant.model_id)||!integer(variant.quantity,1)||!integer(variant.exclusive_quantity)||!integer(variant.mixed_quantity)||BigInt(variant.quantity)!==BigInt(variant.exclusive_quantity)+BigInt(variant.mixed_quantity)||variant.unit_cost_cents!==null&&!integer(variant.unit_cost_cents))return null;
    models.add(variant.model_id);exclusive+=BigInt(variant.exclusive_quantity);mixed+=BigInt(variant.mixed_quantity);
    const cost=variant.exclusive_quantity===0?0:variant.unit_cost_cents===null?null:safe(BigInt(variant.exclusive_quantity)*BigInt(variant.unit_cost_cents));
    const total=variant.unit_cost_cents===null?null:safe(BigInt(variant.quantity)*BigInt(variant.unit_cost_cents));
    if(variant.unit_cost_cents!==null&&(cost===null||total===null)||variant.exclusive_production_cost_cents!==cost||variant.production_cost_cents!==total)return null;
    if(cost===null)exclusiveReady=false;else knownCost+=BigInt(cost);if(total===null)totalReady=false;else totalKnownCost+=BigInt(total);
   }
   const exclusiveQuantity=safe(exclusive),mixedQuantity=safe(mixed),knownProduction=safe(knownCost),allKnownProduction=safe(totalKnownCost);
   if(exclusiveQuantity===null||mixedQuantity===null||knownProduction===null||allKnownProduction===null||exclusive+mixed!==BigInt(row.quantity)||row.exclusive_orders===0&&exclusive!==0n||row.exclusive_orders>0&&exclusive<BigInt(row.exclusive_orders)||row.mixed_orders===0&&mixed!==0n||row.mixed_orders>0&&mixed<BigInt(row.mixed_orders)||row.known_exclusive_production_cost_cents!==knownProduction||row.exclusive_production_cost_cents!==(exclusiveReady?knownProduction:null)||row.known_production_cost_cents!==allKnownProduction||row.production_cost_cents!==(totalReady?allKnownProduction:null))return null;
   for(const name of ['sales','repass','tax','ads_adjustment']){
    const known=row['known_exclusive_'+name+'_cents'],strict=row['exclusive_'+name+'_cents'];
    if(!(['repass','ads_adjustment'].includes(name)?signed(known):integer(known))||strict!==(row.exclusive_payment_missing?null:known)||row.exclusive_payment_covered===0&&known!==0)return null;
   }
   const knownContribution=hasKnown?knownDescriptor.value:null;
   if(knownContribution!==null&&!signed(knownContribution)||row.exclusive_after_costs_cents!==null&&!signed(row.exclusive_after_costs_cents)||row.exclusive_margin_bps!==null&&!signed(row.exclusive_margin_bps))return null;
   const contributionExpected=row.exclusive_orders>0&&row.exclusive_payment_missing===0&&exclusiveReady&&row.exclusive_returns+row.exclusive_returns_unknown===0?safe(BigInt(row.exclusive_repass_cents)-knownCost-BigInt(row.exclusive_tax_cents)):null;
   if(hasKnown&&knownContribution!==contributionExpected)return null;
   const knownDifference=safe(BigInt(row.known_exclusive_sales_cents)-BigInt(row.known_exclusive_repass_cents));if(knownDifference===null)return null;
   const recorded={sales_cents:row.known_exclusive_sales_cents,repass_cents:row.known_exclusive_repass_cents,sales_minus_repass_cents:knownDifference,production_cost_cents:knownProduction,tax_cents:row.known_exclusive_tax_cents,ads_adjustment_cents:row.known_exclusive_ads_adjustment_cents,contribution_cents:knownContribution};
   const pending=[...new Set([...row.pending,...globalBlocked])];
   if(!row.exclusive_orders&&!pending.includes('NO_EXCLUSIVE_ORDERS'))pending.push('NO_EXCLUSIVE_ORDERS');
   if(row.exclusive_payment_missing&&!pending.includes('PAYMENT_INCOMPLETE'))pending.push('PAYMENT_INCOMPLETE');
   if(!exclusiveReady&&!pending.includes('PRODUCTION_COST_INCOMPLETE'))pending.push('PRODUCTION_COST_INCOMPLETE');
   if(row.exclusive_returns+row.exclusive_returns_unknown&&!pending.includes('RETURNS_NOT_RECONCILED'))pending.push('RETURNS_NOT_RECONCILED');
   const ready=pending.length===0&&contributionExpected!==null;
   const expectedMargin=ready&&row.exclusive_sales_cents>0?safe(BigInt(contributionExpected)*10000n/BigInt(row.exclusive_sales_cents)):null;
   if(ready&&(row.exclusive_after_costs_cents!==contributionExpected||row.exclusive_margin_bps!==expectedMargin||row.exclusive_sales_cents>0&&expectedMargin===null))return null;
   const strict={state:ready?'AVAILABLE':'BLOCKED',...Object.fromEntries(componentKeys.map(key=>[key,null])),sales_minus_repass_cents:null,margin_bps:null};
   if(ready){strict.sales_cents=row.exclusive_sales_cents;strict.repass_cents=row.exclusive_repass_cents;strict.sales_minus_repass_cents=knownDifference;strict.production_cost_cents=row.exclusive_production_cost_cents;strict.tax_cents=row.exclusive_tax_cents;strict.ads_adjustment_cents=row.exclusive_ads_adjustment_cents;strict.contribution_cents=contributionExpected;strict.margin_bps=expectedMargin;coverage.strict_products++;}
   if(knownContribution!==null)coverage.recorded_subtotal_products++;
   const sole=row.variants.length===1,attributed=sole&&ready,attribution={state:!row.exclusive_orders?'NO_EXCLUSIVE_ORDERS':!sole?'MULTIPLE_SOLD_VARIANTS':attributed?'ATTRIBUTED':'BLOCKED',model_id:sole?row.variants[0].model_id:null,exclusive_quantity:sole?exclusiveQuantity:null,exclusive_orders:sole?row.exclusive_orders:null,contribution_cents:attributed?strict.contribution_cents:null,margin_bps:attributed?strict.margin_bps:null,basis:'ONLY_SOLD_VARIANT_EXCLUSIVE_ORDERS'};
   if(attributed)coverage.attributed_variants++;
   products.push({item_id:row.item_id,scope:{quantity:row.quantity,exclusive_quantity:exclusiveQuantity,mixed_quantity:mixedQuantity,orders:row.orders,exclusive_orders:row.exclusive_orders,mixed_orders:row.mixed_orders,payment_covered_orders:row.exclusive_payment_covered,payment_missing_orders:row.exclusive_payment_missing,returns_orders:row.exclusive_returns,returns_unknown_orders:row.exclusive_returns_unknown,sold_variants:row.variants.length},pending,recorded,strict,attribution});
  }
  products.sort((a,b)=>compare(a.item_id,b.item_id));
  return freeze({schema:'mls_product_financial_evidence_v1',mode:'OBSERVER',month:month.month,source:{start_date:month.start_date,end_date:month.end_date,checked_at:month.checked_at,finance_oldest_at:oldest,finance_latest_at:latest,bindings_revision:month.bindings_revision,costs_revision:month.costs_revision,cost_rules_revision:costRules,classification_revision:classifications},basis:'PAID_CREATE_MONTH_EXCLUSIVE_ORDERS_CURRENT_REFERENCE_COST',cost_basis:'CURRENT_REFERENCE_NOT_MANUFACTURING_OR_REUSE_LEDGER',tax_basis:hasTax?'MONTHLY_DAS_NOT_ALLOCATED':'LEGACY_ORDER_TAX_REFERENCE_NOT_OFFICIAL_TAX',difference_basis:'SALES_MINUS_REPASS_NOT_OFFICIAL_FEES',global_pending:globalPending,coverage,execution_allowed:false,net_profit_cents:null,safe_price_cents:null,products});
 }catch{return null;}
}
 function simulateMlsPricingWorkbench(input,simulate){
 const integer=(value,min,max)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
 const exact=(value,keys)=>value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
 const keys=['unit_cost_cents','extra_cost_cents','fee_bps','ads_bps','target_margin_bps'];
 try{
  if(typeof simulate!=='function'||!exact(input,keys)||!integer(input.unit_cost_cents,1,100000000)||!integer(input.extra_cost_cents,0,100000000)||!['fee_bps','ads_bps','target_margin_bps'].every(key=>integer(input[key],0,9000))||input.fee_bps+input.ads_bps+input.target_margin_bps>=10000)return null;
  const base=BigInt(input.unit_cost_cents)+BigInt(input.extra_cost_cents),warnings=['PERCENTAGES_ARE_ASSUMPTIONS','NO_PROOF_OF_TAX_FREIGHT_OR_FIXED_EXPENSE_COVERAGE','NO_VALIDATED_ADS_SKU_ATTRIBUTION','INVENTORY_NOT_VERIFIED','M2_NOT_CLOSED'];
  const assumptions={fee_bps:input.fee_bps,ads_bps:input.ads_bps,target_margin_bps:input.target_margin_bps,extra_cost_cents:input.extra_cost_cents};
  const call=margin=>{
   const supplied={unit_cost_cents:input.unit_cost_cents,extra_cost_cents:input.extra_cost_cents,fee_bps:input.fee_bps,ads_bps:input.ads_bps,target_margin_bps:margin};
   const value=simulate(Object.freeze(supplied));
   if(!exact(value,['schema','status','mode','calculated_scenario_price_cents','supplied_cost_base_cents','operator_assumptions','not_a_safe_price','may_publish','may_modify_ads','warnings'])||value.schema!=='mls_pricing_simulation_v1'||value.status!=='SIMULATION_ONLY'||value.mode!=='OBSERVER'||value.not_a_safe_price!==true||value.may_publish!==false||value.may_modify_ads!==false||value.supplied_cost_base_cents!==Number(base)||!integer(value.calculated_scenario_price_cents,1,Number.MAX_SAFE_INTEGER)||!exact(value.operator_assumptions,['fee_bps','ads_bps','target_margin_bps','extra_cost_cents'])||value.operator_assumptions.fee_bps!==input.fee_bps||value.operator_assumptions.ads_bps!==input.ads_bps||value.operator_assumptions.target_margin_bps!==margin||value.operator_assumptions.extra_cost_cents!==input.extra_cost_cents||!Array.isArray(value.warnings)||Object.getPrototypeOf(value.warnings)!==Array.prototype||Reflect.ownKeys(value.warnings).length!==warnings.length+1||value.warnings.length!==warnings.length||!warnings.every((warning,index)=>Object.hasOwn(Object.getOwnPropertyDescriptor(value.warnings,String(index))||{},'value')&&value.warnings[index]===warning))return null;
   const denominator=BigInt(10000-input.fee_bps-input.ads_bps-margin),expected=(base*10000n+denominator-1n)/denominator;
   return BigInt(value.calculated_scenario_price_cents)===expected?value.calculated_scenario_price_cents:null;
  };
  const equilibrium=call(0),target=call(input.target_margin_bps);if(equilibrium===null||target===null||target<equilibrium)return null;
  return Object.freeze({schema:'mls_pricing_workbench_simulation_v1',status:'SIMULATION_ONLY',mode:'OBSERVER',equilibrium_price_cents:equilibrium,target_price_cents:target,supplied_cost_base_cents:Number(base),unit_cost_cents:input.unit_cost_cents,operator_assumptions:Object.freeze(assumptions),not_a_safe_price:true,safe_price_cents:null,may_publish:false,may_modify_ads:false,warnings:Object.freeze([...warnings])});
 }catch{return null;}
}
 function createMlsProductWorkbenchView(options={}){
 const doc=options.document??globalThis.document;
 const byId=name=>doc?.getElementById?.('businessMonthPricing'+name);
 const make=(tag,text,cls)=>{const value=doc.createElement(tag);if(text!==undefined)value.textContent=String(text);if(cls)value.className=cls;return value;};
 const money=value=>{const cents=BigInt(value),absolute=cents<0n?-cents:cents;return (cents<0n?'-':'')+'R$\u00a0'+new Intl.NumberFormat('pt-BR').format(absolute/100n)+','+String(absolute%100n).padStart(2,'0');};
 const count=value=>new Intl.NumberFormat('pt-BR').format(value);
 const percent=value=>{const points=BigInt(value),absolute=points<0n?-points:points;return (points<0n?'-':'')+count(absolute/100n)+','+String(absolute%100n).padStart(2,'0')+'%';};
 const amount=value=>Number.isSafeInteger(value)?money(value):'Em conferência';
 const reasons={PRODUCTION_COST_INCOMPLETE:'Custos de produção incompletos',PAYMENT_INCOMPLETE:'Valores de pagamento incompletos',RETURNS_NOT_RECONCILED:'Devolução ou reembolso em conferência',STATUS_REVIEW_REQUIRED:'Há situações de pedidos em revisão',SOURCE_UNAVAILABLE:'Fonte financeira em conferência',FINANCIAL_SOURCE_STALE:'A leitura financeira precisa ser atualizada',NO_EXCLUSIVE_ORDERS:'Não há pedidos exclusivos neste recorte',ARITHMETIC_UNSAFE:'Valor fora do limite de cálculo',VARIANT_CAPTURE_INCOMPLETE:'Parte da evidência por pedido ainda não foi capturada',VARIANT_CAPTURE_INVALID:'A captura por pedido não corresponde à fonte atual',NO_SINGLE_PAIR_ORDERS:'Não há pedidos com um único par produto/variação neste recorte'};
 const pendingText=codes=>[...new Set((codes??[]).map(code=>reasons[code]??'Evidência financeira pendente'))].join(' · ');
 const sign=value=>value<0?'negative':value>0?'positive':'neutral';
 const signedLabel=value=>value<0?'▼ Saldo negativo':value>0?'▲ Saldo positivo':'— Saldo zerado';
 const normalized=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
 const sourceName=row=>row.product_name||'Produto #'+row.item_id;
 let selectedProduct=null,selectedTrigger=null;
 let report=null,financialEvidence=null,evidenceProducts=new Map(),variantEvidence=null,variantOrderPairs=new Map(),state={month:null,query:'',abc:'all',sort:'quantity_desc',page:1,page_size:20,abc_metric:'units'},initialized=false;
 const contribution=row=>{const evidence=evidenceProducts.get(row.item_id);return evidence?evidence.strict.state==='AVAILABLE'&&Number.isSafeInteger(evidence.strict.contribution_cents)?evidence.strict.contribution_cents:null:row.exclusive_after_costs_cents;};
 const margin=row=>{const evidence=evidenceProducts.get(row.item_id);return evidence?evidence.strict.state==='AVAILABLE'&&Number.isSafeInteger(evidence.strict.margin_bps)?evidence.strict.margin_bps:null:row.exclusive_margin_bps;};
 const metric=(row,key)=>key==='exclusive_after_costs_cents'?contribution(row):key==='exclusive_margin_bps'?margin(row):row[key];
 const drafts=new Map();
 const remember=()=>{if(state.month){drafts.delete(state.month);drafts.set(state.month,{...state});while(drafts.size>12)drafts.delete(drafts.keys().next().value);}};
 const currentRows=()=>{
  const query=normalized(state.query.trim());
  const rows=(report?.products??[]).filter(row=>(state.abc==='all'||row.abc_units===state.abc)&&(!query||normalized([sourceName(row),row.item_id,...row.variants.flatMap(v=>[v.model_id,v.model_name,...(v.attributes??[]).flatMap(a=>[a.name,a.value])])].join(' ')).includes(query)));
  const identifier=(a,b)=>a.item_id.length-b.item_id.length||(a.item_id<b.item_id?-1:a.item_id>b.item_id?1:0);
  const nullable=(a,b,key,ascending=false)=>{const left=metric(a,key),right=metric(b,key);return left===null?right===null?identifier(a,b):1:right===null?-1:(left===right?identifier(a,b):left<right?(ascending?-1:1):(ascending?1:-1));};
  rows.sort(state.sort==='contribution_desc'||state.sort==='contribution_asc'?(a,b)=>nullable(a,b,'exclusive_after_costs_cents',state.sort==='contribution_asc'):state.sort==='margin_asc'||state.sort==='margin_desc'?(a,b)=>nullable(a,b,'exclusive_margin_bps',state.sort==='margin_asc'):state.sort==='cost_desc'?(a,b)=>nullable(a,b,'known_production_cost_cents'):state.sort==='name_asc'?(a,b)=>sourceName(a).localeCompare(sourceName(b),'pt-BR')||identifier(a,b):(a,b)=>b.quantity-a.quantity||identifier(a,b));
  return rows;
 };
 function evidenceBody(product,host,evidence){
  host.className='m3-financial-evidence';host.dataset.m3ProductEvidence=product.item_id;
  host.append(make('h4','Pedidos exclusivos: de onde vem o saldo'));
  if(!evidence){host.append(make('p','O saldo conferido aparece na tabela. Os componentes financeiros deste produto aguardam uma evidência do mesmo mês. Nenhum valor foi distribuído entre variações.'));return;}
  const scope=evidence.scope,strict=evidence.strict.state==='AVAILABLE',values=strict?evidence.strict:evidence.recorded;
  host.dataset.state=strict?'AVAILABLE':'RECORDED';
  host.append(make('p',count(scope.exclusive_orders)+' pedido(s) exclusivo(s) · '+count(scope.exclusive_quantity)+' unidade(s) exclusiva(s). '+count(scope.mixed_orders)+' pedido(s) misto(s) e '+count(scope.mixed_quantity)+' unidade(s) mista(s) ficam fora deste saldo.'));
  if(!strict)host.append(make('p','Valores informados na leitura salva. Vendas, repasse e tributos cobrem '+count(scope.payment_covered_orders)+' de '+count(scope.exclusive_orders)+' pedido(s) exclusivo(s). A produção reúne as referências conhecidas das unidades exclusivas e pode ter outra cobertura. Os componentes podem estar incompletos e não formam uma conta de subtração nem autorizam um resultado final.','m3-evidence-caption'));
  const context=make('p');context.append(make('span','Vendas exclusivas: '));const sales=make('span',amount(values.sales_cents));sales.dataset.m3Money='sales';context.append(sales,make('span',' · diferença entre vendas e repasse: '));const difference=make('span',amount(values.sales_minus_repass_cents));difference.dataset.m3Money='sales-minus-repass';context.append(difference,make('span','. Essa diferença é informativa, não é uma taxa oficial e não será descontada novamente.'));host.append(context);
  const list=make('dl',undefined,'m3-waterfall');
  const line=(key,label,value,deduct=false)=>{const title=make('dt',label),figure=make('dd',Number.isSafeInteger(value)?(deduct&&value>=0?'− ':'')+money(value):'Em conferência');figure.dataset.m3Money=key;list.append(title,figure);};
  line('repass',strict?'Repasse · deduções da plataforma já consideradas':'Repasse informado · pagamentos cobertos '+count(scope.payment_covered_orders)+' / '+count(scope.exclusive_orders),values.repass_cents);
  line('production',strict?'Produção das unidades exclusivas':'Produção exclusiva identificada · referência pode ser parcial',values.production_cost_cents,strict);
  line('tax',(financialEvidence.tax_basis==='MONTHLY_DAS_NOT_ALLOCATED'?'Tributo dos pedidos · DAS-MEI mensal fora deste saldo':'Tributo de referência nos pedidos · estimativa de 2%')+(strict?'':' · pagamentos cobertos '+count(scope.payment_covered_orders)+' / '+count(scope.exclusive_orders)),values.tax_cents,strict);
  line('contribution',strict?'Saldo dos pedidos exclusivos':'Subtotal registrado · sujeito à revisão',values.contribution_cents);
  host.append(list);
  if(options.financialBars){const chart=make('div'),negative=value=>Number.isSafeInteger(value)?value===0?0:-value:null;options.financialBars.draw(chart,[{label:'Repasse dos pedidos exclusivos',value:values.repass_cents,role:'START'},{label:'Produção de referência exclusiva',value:negative(values.production_cost_cents),role:'DEDUCTION'},{label:'Tributo dos pedidos',value:negative(values.tax_cents),role:'DEDUCTION'},{label:strict?'Contribuição estrita':'Subtotal registrado',value:values.contribution_cents,role:'RESULT'}],{title:'Contribuição exclusiva · valores assinados',basis:report.month+' · Ads, despesas e DAS mensal fora deste saldo. Referência atual; não é lucro líquido por SKU.',complete:strict});host.append(chart);}
  if(Number.isSafeInteger(values.contribution_cents)){const label=make('p',(strict?'':'Subtotal registrado · ')+signedLabel(values.contribution_cents));label.dataset.tone=sign(values.contribution_cents);host.append(label);}
  if(strict&&Number.isSafeInteger(values.margin_bps)){const margin=make('p','Margem exclusiva sobre as vendas deste recorte: '+percent(values.margin_bps)+'. Não é margem líquida do SKU.');margin.dataset.m3Money='margin';host.append(margin);}
  if(Number.isSafeInteger(values.ads_adjustment_cents)&&values.ads_adjustment_cents!==0){const adjustment=make('p','Ajuste retido de anúncios já considerado no repasse: '+money(values.ads_adjustment_cents)+' · informativo; não foi descontado nem reposto novamente neste saldo.');adjustment.dataset.m3Money='adjustment';host.append(adjustment);}
  if(!strict&&values.contribution_cents===null)host.append(make('p','O subtotal não foi calculado: a fonte não confirmou um conjunto compatível de valores. Não somamos componentes parciais.'));
  if(evidence.pending.length)host.append(make('p','Pendente: '+pendingText(evidence.pending)));
  host.append(make('small',financialEvidence.tax_basis==='MONTHLY_DAS_NOT_ALLOCATED'?'O DAS-MEI é mensal e fica fora deste saldo. O gasto de Ads do calendário e outras despesas não foram rateados neste saldo.':'Tributos dos pedidos seguem a referência do financeiro. O gasto de Ads do calendário e outras despesas não foram rateados neste saldo.'));
  const source=financialEvidence.source,time=value=>{try{return Number.isSafeInteger(value)&&value>0?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value*1000)):null;}catch{return null;}};
  const checked=time(source.finance_oldest_at??source.checked_at);
  host.append(make('small','Fonte: pedidos criados de '+source.start_date+' a '+source.end_date+(checked?' · leitura financeira '+checked:'')+'. Custos atuais de referência; não é o gasto real por data de fabricação nem uma baixa de estoque.'));
 }
 function checkedVariantEvidence(value){
  try{
   if(!financialEvidence||!value||value.schema!=='business_month_variant_contributions_v1'||value.month!==report.month||value.start_date!==financialEvidence.source.start_date||value.end_date!==financialEvidence.source.end_date||value.checked_at!==financialEvidence.source.checked_at||!['AVAILABLE','PARTIAL','NOT_CAPTURED'].includes(value.state)||value.basis!=='SINGLE_PAIR_PAID_ORDERS_CURRENT_REFERENCE_NOT_SETTLED'||value.cost_basis!=='CURRENT_REFERENCE_NOT_MANUFACTURING_OR_REUSE_LEDGER'||value.tax_basis!==financialEvidence.tax_basis||value.execution_allowed!==false||value.net_profit_cents!==null||value.safe_price_cents!==null||!Array.isArray(value.variants)||value.variants.length!==report.total_variants||!Array.isArray(value.windows)||value.windows.length<1||value.windows.length>3)return null;
   const source=value.source,expected=financialEvidence.source;
   if(!source||!Number.isSafeInteger(source.publication_revision)||source.publication_revision<1||!['bindings_revision','costs_revision','cost_rules_revision','classification_revision'].every(key=>source[key]===expected[key]))return null;
   const current=new Map(report.products.flatMap(product=>product.variants.map(variant=>[product.item_id+':'+variant.model_id,variant]))),seen=new Set(),moneyKeys=['sales_cents','repass_cents','tax_cents','ads_adjustment_cents','production_cost_cents','contribution_cents'];
   const integer=(number,min=0)=>Number.isSafeInteger(number)&&!Object.is(number,-0)&&number>=min,moneyValue=number=>number===null||integer(number,Number.MIN_SAFE_INTEGER),pending=codes=>Array.isArray(codes)&&codes.length<=30&&codes.every(code=>typeof code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(code));
   const safe=number=>number>=BigInt(Number.MIN_SAFE_INTEGER)&&number<=BigInt(Number.MAX_SAFE_INTEGER)?Number(number):null;
   let units=0n,attributed=0n,unattributed=0n,available=0;
   for(const row of value.variants){
    const key=row.item_id+':'+row.model_id,variant=current.get(key);
    if(!variant||seen.has(key)||row.total_quantity!==variant.quantity||row.unit_cost_cents!==variant.unit_cost_cents||!['attributed_quantity','unattributed_quantity','orders','completed','ongoing','payment_covered','payment_missing','returns','returns_unknown'].every(name=>integer(row[name]))||BigInt(row.attributed_quantity)+BigInt(row.unattributed_quantity)!==BigInt(row.total_quantity)||row.completed+row.ongoing!==row.orders||row.payment_covered+row.payment_missing!==row.orders||row.returns+row.returns_unknown>row.orders||(row.orders===0?row.attributed_quantity!==0:row.attributed_quantity<row.orders)||!pending(row.pending))return null;
    seen.add(key);units+=BigInt(row.total_quantity);attributed+=BigInt(row.attributed_quantity);unattributed+=BigInt(row.unattributed_quantity);
    if(!row.recorded||!row.strict||!moneyKeys.every(name=>moneyValue(row.recorded[name])&&moneyValue(row.strict[name]))||['sales_cents','tax_cents','production_cost_cents'].some(name=>row.recorded[name]!==null&&!integer(row.recorded[name]))||!moneyValue(row.strict.margin_bps)||!['AVAILABLE','BLOCKED'].includes(row.strict.state))return null;
    if(row.strict.state==='BLOCKED'){if(moneyKeys.some(name=>row.strict[name]!==null)||row.strict.margin_bps!==null)return null;continue;}
    if(value.state!=='AVAILABLE'||!row.orders||row.payment_missing||row.returns||row.returns_unknown||row.unit_cost_cents===null||row.pending.length||!moneyKeys.every(name=>integer(row.strict[name],['repass_cents','ads_adjustment_cents','contribution_cents'].includes(name)?Number.MIN_SAFE_INTEGER:0))||moneyKeys.some(name=>row.strict[name]!==row.recorded[name]))return null;
    const cost=safe(BigInt(row.attributed_quantity)*BigInt(row.unit_cost_cents)),balance=cost===null?null:safe(BigInt(row.strict.repass_cents)-BigInt(cost)-BigInt(row.strict.tax_cents)),margin=balance!==null&&row.strict.sales_cents>0?safe(BigInt(balance)*10000n/BigInt(row.strict.sales_cents)):null;
    if(cost===null||row.strict.production_cost_cents!==cost||row.strict.contribution_cents!==balance||row.strict.margin_bps!==margin)return null;
    available++;
   }
   const coverage=value.coverage,captured=value.windows.filter(window=>window.state==='CAPTURED').length;
   if(!coverage||coverage.total_units!==report.total_units||coverage.total_variants!==report.total_variants||coverage.total_units!==safe(units)||coverage.single_pair_units!==safe(attributed)||coverage.unattributed_units!==safe(unattributed)||coverage.strict_variants!==available||coverage.windows_total!==value.windows.length||coverage.windows_captured!==captured||value.windows.some(window=>!['CAPTURED','NOT_CAPTURED','INVALID'].includes(window.state))||value.state==='AVAILABLE'&&captured!==value.windows.length||!pending(value.pending))return null;
   return value;
  }catch{return null;}
 }
 function variantOrderBody(product,variant,card){
  const row=variantOrderPairs.get(product.item_id+':'+variant.model_id);if(!row)return false;
  const available=row.strict.state==='AVAILABLE',legacy=evidenceProducts.get(product.item_id);
  // The original whole-month proof remains independently useful when capture
  // of the new per-order source is incomplete. Never add the two contributions.
  if(!available&&legacy?.strict.state==='AVAILABLE'&&legacy.attribution?.state==='ATTRIBUTED'&&legacy.attribution.model_id===variant.model_id)return false;
  const values=available?row.strict:row.recorded,detail=make('div',undefined,'m3-attribution'),key=product.item_id+':'+variant.model_id;
  detail.dataset.m3VariantOrderContribution=key;detail.dataset.proofSource='SINGLE_PAIR_ORDERS';detail.dataset.state=available?'AVAILABLE':variantEvidence.state==='NOT_CAPTURED'?'NOT_CAPTURED':'BLOCKED';
  if(available)detail.dataset.m3VariantAttribution=key;
  detail.append(make('strong',available?'Contribuição dos pedidos atribuídos a esta variação':'Atribuição por pedido em conferência'));
  detail.append(make('p',count(row.orders)+' pedido(s) com um único par produto/variação · '+count(row.attributed_quantity)+' de '+count(row.total_quantity)+' unidade(s) com atribuição comprovada.'));
  detail.append(make('small',count(row.unattributed_quantity)+' unidade(s) sem atribuição comprovada. Podem pertencer a pedidos com vários pares ou a fontes ainda não capturadas; nenhum repasse foi rateado.'));
  if(!available)detail.append(make('p','Leitura registrada: pagamentos cobertos em '+count(row.payment_covered)+' de '+count(row.orders)+' pedido(s) atribuídos. A referência de produção considera as unidades atribuídas com custo conhecido. Componentes parciais não formam uma subtração.'));
  const list=make('dl',undefined,'m3-waterfall'),line=(field,label,deduct=false)=>{const dt=make('dt',label),value=values[field],dd=make('dd',Number.isSafeInteger(value)?(deduct&&value>=0?'− ':'')+money(value):'Em conferência');dd.dataset.m3VariantMoney=field.replace(/_cents$/,'').replace('production_cost','production');list.append(dt,dd);};
  line('sales_cents',available?'Vendas dos pedidos atribuídos':'Vendas informadas · pagamentos cobertos');
  line('repass_cents',available?'Repasse · deduções já consideradas':'Repasse informado · pagamentos cobertos');
  line('production_cost_cents',available?'Produção das unidades atribuídas':'Produção identificada · referência pode ser parcial',available);
  line('tax_cents',variantEvidence.tax_basis==='MONTHLY_DAS_NOT_ALLOCATED'?'Tributo dos pedidos · DAS mensal fora deste saldo':'Tributo de referência · estimativa por pedido',available);
  line('contribution_cents',available?'Contribuição dos pedidos atribuídos':'Subtotal registrado · sujeito à revisão');
  detail.append(list);
  if(options.financialBars){const chart=make('div'),negative=value=>Number.isSafeInteger(value)?value===0?0:-value:null;options.financialBars.draw(chart,[{label:'Repasse atribuído à variação',value:values.repass_cents,role:'START'},{label:'Produção das unidades atribuídas',value:negative(values.production_cost_cents),role:'DEDUCTION'},{label:'Tributo dos pedidos atribuídos',value:negative(values.tax_cents),role:'DEDUCTION'},{label:available?'Contribuição estrita da variação':'Subtotal registrado',value:values.contribution_cents,role:'RESULT'}],{title:'Composição atribuída · valores assinados',basis:report.month+' · pedidos com um único par produto/variação. Ads, despesas e DAS mensal ficam fora.',complete:available});detail.append(chart);}
  if(Number.isSafeInteger(values.contribution_cents)){const label=make('p',signedLabel(values.contribution_cents));label.dataset.tone=sign(values.contribution_cents);detail.append(label);}
  if(available&&Number.isSafeInteger(values.margin_bps)){const label=make('small',percent(values.margin_bps)+' sobre as vendas atribuídas');label.dataset.m3VariantMoney='margin';detail.append(label);}
  if(Number.isSafeInteger(values.ads_adjustment_cents)&&values.ads_adjustment_cents!==0){const label=make('small','Ajuste retido já considerado no repasse: '+money(values.ads_adjustment_cents)+' · informativo, sem nova soma ou desconto.');label.dataset.m3VariantMoney='adjustment';detail.append(label);}
  if(!available&&values.contribution_cents===null)detail.append(make('small','Contribuição pendente: não calculamos saldo a partir de componentes parciais.'));
  if(row.pending.length)detail.append(make('p','Pendente: '+pendingText(row.pending)));
  detail.append(make('small','Fonte por pedido: '+count(variantEvidence.coverage.windows_captured)+' de '+count(variantEvidence.coverage.windows_total)+' intervalo(s) capturado(s), de '+variantEvidence.start_date+' a '+variantEvidence.end_date+'. Custo atual de referência; não é fabricação incorrida ou consumo de peça reaproveitada.'));
  detail.append(make('small','Ads, despesas e DAS mensal ficam fora desta contribuição. Não é lucro líquido total da variação.'));
  card.append(detail);return true;
 }
 function variantsBody(product,host){
  let offset=0;
  const render=()=>{
   host.replaceChildren();
   host.append(make('p','Custo por unidade vendida do anúncio ou kit. Margem líquida total por variação aguarda receitas e despesas atribuídas.'));
   const list=make('div',undefined,'m3-variant-list');
   for(const variant of product.variants.slice(offset,offset+50)){
    const card=make('div',undefined,'m3-variant');card.dataset.m3Variant=product.item_id+':'+variant.model_id;
    card.append(make('strong',variant.model_name||'Variação #'+variant.model_id));
    if(variant.attributes?.length)card.append(make('p',variant.attributes.map(a=>a.name+': '+a.value).join(' · ')));
    card.append(make('small','Variação #'+variant.model_id+' · '+count(variant.quantity)+' unidade(s) vendida(s)'));
    card.append(make('p',variant.unit_cost_cents===null?'Custo unitário pendente':money(variant.unit_cost_cents)+' por unidade vendida'));
    card.append(make('small',variant.production_cost_cents===null?'Total desta variação em conferência':'Referência das vendas: '+money(variant.production_cost_cents)));
    const evidence=evidenceProducts.get(product.item_id),attribution=evidence?.attribution;
    const orderProofShown=variantOrderBody(product,variant,card);
    if(!orderProofShown&&attribution?.state==='ATTRIBUTED'&&evidence.strict.state==='AVAILABLE'&&attribution.model_id===variant.model_id&&Number.isSafeInteger(attribution.contribution_cents)){
     const detail=make('div',undefined,'m3-attribution');detail.dataset.m3VariantAttribution=product.item_id+':'+variant.model_id;detail.dataset.state='ATTRIBUTED';
     detail.append(make('strong','Saldo dos pedidos exclusivos atribuídos a esta variação'),make('p',money(attribution.contribution_cents)));
     if(Number.isSafeInteger(attribution.margin_bps))detail.append(make('small',percent(attribution.margin_bps)+' sobre as vendas exclusivas'));
     detail.append(make('small','Prova: uma única variação vendida no produto. '+count(attribution.exclusive_orders)+' pedido(s) exclusivo(s) · '+count(attribution.exclusive_quantity)+' unidade(s) exclusiva(s). '+count(evidence.scope.mixed_quantity)+' unidade(s) mista(s) ficam fora. Não é lucro líquido total da variação.'));
     card.append(detail);
    }else if(!orderProofShown&&attribution?.state==='MULTIPLE_SOLD_VARIANTS')card.append(make('small','Saldo por variação indisponível: há mais de uma variação vendida. Nenhum repasse foi rateado.'));
    const button=make('button','Usar custo no cenário','button-secondary');button.type='button';button.dataset.m3UseVariant=product.item_id+':'+variant.model_id;button.disabled=!(Number.isSafeInteger(variant.unit_cost_cents)&&variant.unit_cost_cents>0);
    button.onclick=()=>{if(!button.disabled&&typeof options.onSelectVariant==='function')options.onSelectVariant(product.item_id+':'+variant.model_id);};card.append(button);list.append(card);
   }
   host.append(list);
   if(product.variants.length>50){
    const pager=make('div',undefined,'m3-pager-actions'),prev=make('button','Variações anteriores','button-secondary'),next=make('button','Próximas variações','button-secondary');prev.type=next.type='button';prev.disabled=offset===0;next.disabled=offset+50>=product.variants.length;prev.onclick=()=>{offset=Math.max(0,offset-50);render();};next.onclick=()=>{offset+=50;render();};pager.append(prev,next);host.append(make('small',count(offset+1)+'–'+count(Math.min(offset+50,product.variants.length))+' de '+count(product.variants.length)+' variações'),pager);
   }
  };render();
 }
 function drawRows(){
  const target=byId('Rows');if(!target)return;
  target.replaceChildren();const filtered=currentRows(),pages=Math.max(1,Math.ceil(filtered.length/state.page_size));state.page=Math.min(Math.max(1,state.page),pages);
  const begin=(state.page-1)*state.page_size;
  for(const row of filtered.slice(begin,begin+state.page_size)){
   const tr=make('tr');tr.dataset.m3Product=row.item_id;
   const name=make('td');name.append(make('strong',sourceName(row)),make('small','Produto #'+row.item_id));
   if(row.variants.length){
    const detail=make('details'),summary=make('summary','Detalhes financeiros e variações ('+count(row.variants.length)+')');detail.append(summary);let detailRow=null;
    detail.ontoggle=()=>{
     if(tr.parentNode!==target)return;
     if(detail.open&&!detailRow){
      detailRow=make('tr',undefined,'m3-detail-row');detailRow.dataset.m3DetailFor=row.item_id;detailRow.id='businessMonthPricingDetail-'+report.month+'-'+row.item_id;summary.setAttribute('aria-controls',detailRow.id);
      const cell=make('td'),facts=make('section'),variants=make('div');cell.colSpan=5;
      evidenceBody(row,facts,evidenceProducts.get(row.item_id));variantsBody(row,variants);cell.append(facts,variants);detailRow.append(cell);target.insertBefore(detailRow,tr.nextSibling);
     }
     if(detailRow)detailRow.hidden=!detail.open;
     if(detail.open){const wrap=target.closest?.('.m3-table-wrap');if(wrap)wrap.scrollLeft=0;}
    };name.append(detail);
   }
   const abc=make('td',row.abc_units||'—');
   const units=make('td',count(row.quantity));
   const value=contribution(row),marginValue=margin(row),balance=make('td',value===null?'Em conferência':money(value));
   if(value!==null){balance.dataset.tone=sign(value);balance.append(make('small',signedLabel(value)));if(Number.isSafeInteger(marginValue)){const label=make('small',percent(marginValue)+' sobre vendas exclusivas');label.dataset.m3ExclusiveMargin=row.item_id;balance.append(label);}}
   balance.append(make('small',count(row.exclusive_orders)+' pedido(s) exclusivo(s) · '+count(row.mixed_orders)+' misto(s)'));
   const pending=evidenceProducts.get(row.item_id)?.pending??row.pending;
   if(value===null&&pending?.length)balance.append(make('small',pendingText(pending)));
   const cost=make('td',row.production_cost_cents===null?row.cost_coverage.known_units?money(row.known_production_cost_cents)+' conhecido':'Em conferência':money(row.production_cost_cents));cost.append(make('small',count(row.cost_coverage.known_units)+' / '+count(row.quantity)+' unidades com custo'));
   if(row.pending_reasons?.length)cost.append(make('small','Confira as pendências e a cobertura deste produto.'));
   tr.append(name,abc,units,balance,cost);target.append(tr);
  }
  if(!filtered.length){const tr=make('tr'),td=make('td',report?.products.length?'Nenhum produto corresponde aos filtros.':'Nenhuma venda foi confirmada nos dados completos deste mês.');td.colSpan=5;tr.append(td);target.append(tr);}
  const label=byId('Page');if(label)label.textContent=filtered.length?'Mostrando '+count(begin+1)+'–'+count(Math.min(begin+state.page_size,filtered.length))+' de '+count(filtered.length)+' produtos · página '+count(state.page)+' de '+count(pages):'Nenhum produto para exibir.';
  if(byId('Previous'))byId('Previous').disabled=!report||state.page<=1;
  if(byId('Next'))byId('Next').disabled=!report||state.page>=pages;
  remember();
 }
 function bar(host,label,quantity,maximum,description,select=null,currency=false){
  const row=make(select?'button':'div'),heading=make('div',undefined,'m3-bar-label');heading.append(make('span',label),make('strong',currency?money(quantity):count(quantity)));const track=make('progress');track.max=10000;track.value=maximum>0?Number(BigInt(quantity)*10000n/BigInt(maximum)):0;track.setAttribute('aria-label',label+': '+(currency?money(quantity)+' de receita exclusiva coberta':count(quantity)+' unidade(s) vendida(s)'));if(select){row.type='button';row.className='m3-ranking-pick';row.setAttribute('aria-label','Conferir '+label+' · '+count(quantity)+' unidades do mês completo');row.onclick=()=>select(row);}row.append(heading,track);if(description)row.append(make('small',description));host.append(row);
 }
 function drawOverview(){
  const stats=byId('Stats'),chart=byId('Chart'),abc=byId('ABCBars');stats?.replaceChildren();chart?.replaceChildren();abc?.replaceChildren();
  const add=(label,value)=>{const entry=make('div');entry.append(make('small',label),make('strong',value));stats?.append(entry);};
  const contributions=report.products.map(contribution),covered=contributions.filter(value=>value!==null),sum=covered.reduce((total,value)=>total+BigInt(value),0n);
  add('Produtos vendidos',count(report.total_products));add('Unidades do anúncio ou kit',count(report.total_units));add('Unidades com custo',count(report.coverage.known_units)+' / '+count(report.total_units));add('Saldo exclusivo identificado',covered.length?money(sum):'Em conferência');
  if(byId('CostCoverage'))byId('CostCoverage').textContent='Referência atual de produção: '+(report.coverage.known_units?money(report.coverage.known_production_cost_cents):'nenhum custo identificado')+' · '+count(report.coverage.pending_units)+' unidade(s) com custo pendente. Saldos exclusivos conferidos em '+count(covered.length)+' de '+count(report.total_products)+' produtos: '+count(covered.filter(value=>value>0).length)+' positivos, '+count(covered.filter(value=>value<0).length)+' negativos e '+count(covered.filter(value=>value===0).length)+' zerados. As setas mostram o sinal do saldo, não uma comparação entre períodos. Não é o gasto real por data de fabricação.';
  if(!report.products.length){chart?.append(make('p','Nenhuma venda confirmada para montar o gráfico.','m3-empty'));abc?.append(make('p','A distribuição ABC precisa de unidades vendidas confirmadas.','m3-empty'));return;}
  const ranked=[...report.products].sort((a,b)=>b.quantity-a.quantity),maximum=ranked[0].quantity;
  for(const row of ranked.slice(0,8))if(chart)bar(chart,sourceName(row),row.quantity,maximum,'Classe '+row.abc_units+' · '+count(row.quantity_share_bps/100)+'% do volume',trigger=>selectProduct(row.item_id,trigger));
  const revenue=state.abc_metric==='revenue',available=report.ranking.revenue_abc_status==='AVAILABLE',note=byId('ABCState');
  abc?.setAttribute('aria-label',revenue?'Distribuição da receita exclusiva coberta nas classes ABC':'Distribuição de unidades nas classes ABC');
  if(byId('ABCMetric'))byId('ABCMetric').value=state.abc_metric||'units';
  if(note)note.textContent=revenue?available?'Receita dos pedidos exclusivos cobertos do mês completo. Os filtros da tabela não mudam esta base.':'ABC por receita indisponível: há cobertura incompleta, pendências ou pedidos mistos. Confira as evidências dos produtos abaixo.':'Unidades comerciais do mês completo. Não são peças ou contagem de produtos; os filtros da tabela não alteram a distribuição.';
  if(revenue&&!available){abc?.append(make('p','A receita exclusiva deste mês ainda não possui uma base completa. A distribuição por unidades continua disponível.','m3-empty'));return;}
  const total=revenue?report.products.reduce((sum,row)=>sum+BigInt(row.exclusive_sales_cents),0n):BigInt(report.total_units);
  for(const band of ['A','B','C']){const rows=report.products.filter(row=>(revenue?row.abc_revenue:row.abc_units)===band),quantity=rows.reduce((sum,row)=>sum+BigInt(revenue?row.exclusive_sales_cents:row.quantity),0n);if(abc)bar(abc,'Classe '+band,quantity,total,count(rows.length)+' produto(s)',null,revenue);}
 }
 function selectProduct(itemId,trigger=null){
  const product=report?.products.find(row=>row.item_id===itemId),host=byId('SelectedProduct');if(!product||!host)return false;
  selectedProduct=itemId;if(trigger)selectedTrigger=trigger;host.replaceChildren();host.hidden=false;host.dataset.selectedItemId=itemId;host.append(make('h4',sourceName(product)),make('p','Produto #'+itemId+' · mês '+report.month+'. A seleção do gráfico abre este detalhe; os filtros e a página da tabela foram preservados.'));
  const back=make('button','Voltar ao ranking','button-secondary');back.type='button';back.onclick=()=>{selectedProduct=null;host.hidden=true;host.replaceChildren();selectedTrigger?.focus?.();};host.append(back);const facts=make('section'),variants=make('div');evidenceBody(product,facts,evidenceProducts.get(itemId));variantsBody(product,variants);host.append(facts,variants);if(trigger){host.setAttribute('tabindex','-1');host.focus?.();host.scrollIntoView?.({block:'nearest'});}return true;
 }
 function initialize(){
  if(initialized)return;initialized=true;if(byId('ABCMetric'))byId('ABCMetric').onchange=()=>{state.abc_metric=byId('ABCMetric').value==='revenue'?'revenue':'units';remember();drawOverview();};
  for(const [name,key] of [['Search','query'],['ABC','abc'],['Sort','sort'],['PageSize','page_size']]){const input=byId(name);if(!input)continue;input[name==='Search'?'oninput':'onchange']=()=>{state[key]=name==='PageSize'?([20,50].includes(Number(input.value))?Number(input.value):20):input.value;if(key==='query')state.query=state.query.slice(0,120);if(key==='abc'&&!['all','A','B','C'].includes(state.abc))state.abc='all';if(key==='sort'&&!['quantity_desc','contribution_desc','contribution_asc','margin_asc','margin_desc','cost_desc','name_asc'].includes(state.sort))state.sort='quantity_desc';state.page=1;drawRows();};}
  if(byId('Previous'))byId('Previous').onclick=()=>{state.page--;drawRows();};if(byId('Next'))byId('Next').onclick=()=>{state.page++;drawRows();};
 }
 function clear(){
  selectedProduct=null;selectedTrigger=null;if(byId('SelectedProduct')){byId('SelectedProduct').hidden=true;byId('SelectedProduct').replaceChildren();}report=null;financialEvidence=null;evidenceProducts=new Map();variantEvidence=null;variantOrderPairs=new Map();for(const name of ['Stats','Rows','Chart','ABCBars'])byId(name)?.replaceChildren();if(byId('CostCoverage'))byId('CostCoverage').textContent='Aguardando a cobertura de custos do mês salvo.';if(byId('Page'))byId('Page').textContent='Sem fonte mensal completa.';for(const name of ['Previous','Next'])if(byId(name))byId(name).disabled=true;
 }
 function render(value,evidence=null,orderEvidence=null){
  if(!byId('Rows')||!value||value.schema!=='mls_product_workbench_v1'||value.mode!=='OBSERVER'||!Array.isArray(value.products)||value.products.length>3000){clear();return false;}
  initialize();remember();if(state.month!==value.month){selectedProduct=null;if(byId('SelectedProduct'))byId('SelectedProduct').hidden=true;state=drafts.has(value.month)?{...drafts.get(value.month)}:{month:value.month,query:'',abc:'all',sort:'quantity_desc',page:1,page_size:20,abc_metric:'units'};}
  report=value;
  const cohort=new Map(value.products.map(product=>[product.item_id,product]));
  financialEvidence=evidence?.schema==='mls_product_financial_evidence_v1'&&evidence.mode==='OBSERVER'&&evidence.month===value.month&&evidence.execution_allowed===false&&Array.isArray(evidence.products)&&evidence.products.length===value.products.length&&new Set(evidence.products.map(product=>product.item_id)).size===value.products.length&&evidence.products.every(product=>{const row=cohort.get(product.item_id);return row&&product.scope?.quantity===row.quantity&&product.scope.exclusive_orders===row.exclusive_orders&&product.scope.mixed_orders===row.mixed_orders&&product.scope.sold_variants===row.variants.length;})?evidence:null;
  evidenceProducts=new Map((financialEvidence?.products??[]).map(product=>[product.item_id,product]));
  variantEvidence=checkedVariantEvidence(orderEvidence);variantOrderPairs=new Map((variantEvidence?.variants??[]).map(row=>[row.item_id+':'+row.model_id,row]));
  for(const [name,key] of [['Search','query'],['ABC','abc'],['Sort','sort'],['PageSize','page_size']])if(byId(name))byId(name).value=String(state[key]);
  drawOverview();drawRows();if(selectedProduct)selectProduct(selectedProduct);return true;
 }
 return Object.freeze({render,clear,getState(){return {...state,filtered_products:report?currentRows().length:0};}});
}
 function projectAdsCalendar(value) {
  // Keep helpers local: the client embeds this function via .toString().
  const keys = ['schema', 'status', 'start_date', 'end_date', 'fetched_at', 'covered_days', 'total_days', 'missing_dates', 'expense_cents', 'known_expense_cents', 'balance_cents', 'days', 'day_partial', 'unit_confirmation', 'source_timezone', 'basis', 'diagnostic', 'totals'];
  const metrics = ['gmv_cents', 'orders', 'reported_roas_raw', 'calculated_roas_raw'];
  const isPlain = item => item !== null && typeof item === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(item));
  const isExact = (item, names) => isPlain(item) && Reflect.ownKeys(item).length === names.length && names.every(name => Object.hasOwn(Object.getOwnPropertyDescriptor(item, name) || {}, 'value'));
  const isArray = (item, max) => Array.isArray(item) && Object.getPrototypeOf(item) === Array.prototype && item.length <= max && Reflect.ownKeys(item).length === item.length + 1 && Array.from({length: item.length}, (_, index) => Object.getOwnPropertyDescriptor(item, String(index))).every(descriptor => descriptor && Object.hasOwn(descriptor, 'value'));
  const isInteger = (item, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(item) && item >= 0 && item <= max && !Object.is(item, -0);
  const isDay = item => typeof item === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item) && Number.isFinite(Date.parse(item + 'T00:00:00Z')) && new Date(item + 'T00:00:00Z').toISOString().slice(0, 10) === item;
  const currentDay = stamp => new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/Sao_Paulo'}).format(new Date(stamp * 1000));
  const validReported = item => item === null || typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 1000000000000 && !Object.is(item, -0) || typeof item === 'string' && item.length <= 96 && /^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(item) && Number(item) <= 1000000000000;
  const calculated = (gmv, expense) => {
    if (gmv === null || expense === null || expense === 0) return null;
    const numerator = BigInt(gmv) * 1000000n, denominator = BigInt(expense);
    let rounded = numerator / denominator;
    if (numerator % denominator * 2n >= denominator) rounded++;
    return (rounded / 1000000n).toString() + '.' + (rounded % 1000000n).toString().padStart(6, '0');
  };
  const metricValid = (item, expense) => isExact(item, metrics) && (item.gmv_cents === null || isInteger(item.gmv_cents)) && (item.orders === null || isInteger(item.orders)) && validReported(item.reported_roas_raw) && item.calculated_roas_raw === calculated(item.gmv_cents, expense);
  const metricEmpty = item => metrics.every(key => item[key] === null);
  const equalDates = (left, right) => left.length === right.length && left.every((date, index) => date === right[index]);
  const diagnostics = ['ADS_CALENDAR_CONFIGURATION', 'ADS_CALENDAR_UNAVAILABLE', 'ADS_CALENDAR_DATE_COVERAGE_PARTIAL', 'ADS_CALENDAR_EXPENSE_INVALID', 'ADS_CALENDAR_ARITHMETIC_UNSAFE'];
  try {
    if (!isExact(value, keys) || value.schema !== 'ads_calendar_v1' || !['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'].includes(value.status) || !isInteger(value.fetched_at, 9999999999) || !isInteger(value.covered_days, 31) || !isInteger(value.total_days, 31) || !isArray(value.missing_dates, 31) || !value.missing_dates.every(isDay) || !isArray(value.days, 31) || typeof value.day_partial !== 'boolean' || value.unit_confirmation !== 'OPERATOR_CONFIRMED_BRL_2026_10_20' || value.source_timezone !== 'UNCONFIRMED' || value.basis !== 'CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION' || value.diagnostic !== null && !diagnostics.includes(value.diagnostic) || !isInteger(value.known_expense_cents) || value.expense_cents !== null && !isInteger(value.expense_cents) || value.balance_cents !== null && !isInteger(value.balance_cents) || !isExact(value.totals, ['direct', 'broad'])) return null;
    let dates = [];
    if (isDay(value.start_date) && isDay(value.end_date)) {
      const length = (Date.parse(value.end_date + 'T00:00:00Z') - Date.parse(value.start_date + 'T00:00:00Z')) / 86400000 + 1;
      if (length < 1 || length > 31 || value.fetched_at === 0 || value.end_date > currentDay(value.fetched_at)) return null;
      dates = Array.from({length}, (_, index) => new Date(Date.parse(value.start_date + 'T00:00:00Z') + index * 86400000).toISOString().slice(0, 10));
    } else if (value.start_date !== null || value.end_date !== null || value.diagnostic !== 'ADS_CALENDAR_CONFIGURATION') return null;
    if (value.total_days !== dates.length || value.day_partial !== (dates.length > 0 && value.end_date === currentDay(value.fetched_at))) return null;
    if (value.status === 'UNAVAILABLE') {
      if (value.covered_days !== 0 || value.days.length || value.expense_cents !== null || value.known_expense_cents !== 0 || value.balance_cents !== null || !equalDates(value.missing_dates, dates) || !['ADS_CALENDAR_CONFIGURATION', 'ADS_CALENDAR_UNAVAILABLE', 'ADS_CALENDAR_ARITHMETIC_UNSAFE'].includes(value.diagnostic)) return null;
      for (const attribution of ['direct', 'broad']) if (!metricValid(value.totals[attribution], null) || !metricEmpty(value.totals[attribution])) return null;
    } else {
      if (!dates.length || value.days.length !== dates.length) return null;
      let total = 0n;
      const missing = [];
      for (let index = 0; index < dates.length; index++) {
        const day = value.days[index];
        if (!isExact(day, ['date', 'expense_cents', 'direct', 'broad']) || day.date !== dates[index] || day.expense_cents !== null && !isInteger(day.expense_cents) || !metricValid(day.direct, day.expense_cents) || !metricValid(day.broad, day.expense_cents)) return null;
        if (day.expense_cents === null) missing.push(day.date); else total += BigInt(day.expense_cents);
      }
      if (total > BigInt(Number.MAX_SAFE_INTEGER) || value.covered_days !== dates.length - missing.length || !equalDates(value.missing_dates, missing) || value.known_expense_cents !== Number(total)) return null;
      if (value.status === 'AVAILABLE' ? missing.length !== 0 || value.expense_cents !== Number(total) || value.diagnostic !== null : missing.length === 0 || value.expense_cents !== null || !['ADS_CALENDAR_DATE_COVERAGE_PARTIAL', 'ADS_CALENDAR_EXPENSE_INVALID'].includes(value.diagnostic)) return null;
      for (const attribution of ['direct', 'broad']) {
        const aggregate = value.totals[attribution];
        if (!metricValid(aggregate, value.expense_cents)) return null;
        for (const field of ['gmv_cents', 'orders']) {
          const amounts = value.days.map(day => day[attribution][field]);
          const sum = amounts.some(amount => amount === null) ? null : amounts.reduce((sum, amount) => sum + BigInt(amount), 0n);
          if (sum !== null && sum > BigInt(Number.MAX_SAFE_INTEGER) || aggregate[field] !== (sum === null ? null : Number(sum))) return null;
        }
        if (aggregate.reported_roas_raw !== (dates.length === 1 ? value.days[0][attribution].reported_roas_raw : null)) return null;
      }
    }
    return Object.fromEntries(keys.map(key => [key, key === 'days' ? value.days.map(day => ({date: day.date, expense_cents: day.expense_cents, direct: {...day.direct}, broad: {...day.broad}})) : key === 'missing_dates' ? [...value.missing_dates] : key === 'totals' ? {direct: {...value.totals.direct}, broad: {...value.totals.broad}} : value[key]]));
  } catch { return null; }
}
 function projectBusinessMonthProducts(value,frame){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'));
 const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const cents=(item,signed=false)=>int(item,signed?Number.MIN_SAFE_INTEGER:0);
 const safe=item=>item>=BigInt(Number.MIN_SAFE_INTEGER)&&item<=BigInt(Number.MAX_SAFE_INTEGER)?Number(item):null;
 const id=(item,zero=false)=>typeof item==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(item);
 const sorted=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
 const keys=['schema','mixed_orders','known_mixed_sales_cents','known_mixed_repass_cents','known_mixed_tax_cents','known_mixed_ads_adjustment_cents','products'];
 const rowKeys=['item_id','quantity','orders','exclusive_orders','mixed_orders','exclusive_payment_covered','exclusive_payment_missing','exclusive_returns','exclusive_returns_unknown','known_exclusive_sales_cents','exclusive_sales_cents','known_exclusive_repass_cents','exclusive_repass_cents','known_exclusive_tax_cents','exclusive_tax_cents','known_exclusive_ads_adjustment_cents','exclusive_ads_adjustment_cents','known_production_cost_cents','production_cost_cents','known_exclusive_production_cost_cents','exclusive_production_cost_cents','exclusive_after_costs_cents','exclusive_margin_bps','pending','variants'];
 const variantKeys=['model_id','quantity','exclusive_quantity','mixed_quantity','unit_cost_cents','production_cost_cents','exclusive_production_cost_cents','selling_unit','size','male_size','female_size'];
 const coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
 const frameKeys=['status','progress','coverage','known_sales_cents','known_expected_repass_cents','known_invoice_tax_cents','known_production_cost_cents','production_cost_cents','ads_adjustment_cents','result','unmapped_variants'];
 const counts=['orders','exclusive_orders','mixed_orders','exclusive_payment_covered','exclusive_payment_missing','exclusive_returns','exclusive_returns_unknown'];
 const moneyNames=['sales','repass','tax','ads_adjustment'];
 const sizes=['P','M','G','GG','G1','G2','G3'];
 const codes=['PAYMENT_INCOMPLETE','PRODUCTION_COST_INCOMPLETE','RETURNS_NOT_RECONCILED','STATUS_REVIEW_REQUIRED','SOURCE_UNAVAILABLE','NO_EXCLUSIVE_ORDERS','ARITHMETIC_UNSAFE'];
 try{
  const progress=Object.getOwnPropertyDescriptor(frame||{},'progress')?.value,hasCapacity=plain(progress)&&Object.hasOwn(progress,'order_capacity');
  if(!plain(frame)||!frameKeys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(frame,key)||{},'value'))||frame.status!=='COMPLETE'||!exact(frame.progress,['windows_total','windows_complete','pages_read',...(hasCapacity?['order_capacity']:[])])||!int(frame.progress.windows_total,1,3)||frame.progress.windows_complete!==frame.progress.windows_total||!exact(frame.coverage,coverageKeys)||!coverageKeys.every(key=>int(frame.coverage[key],0,3000))||!plain(frame.result)||!Object.hasOwn(Object.getOwnPropertyDescriptor(frame.result,'pending')||{},'value')||!array(frame.result.pending,15)||!array(frame.unmapped_variants,3000))return null;
  // Current imports may mix legacy five-order pages and new twenty-order
  // pages. Their explicit aggregate capacity must bound the observed cohort.
  if(hasCapacity&&(!int(progress.pages_read,0,progress.windows_total*200)||!int(progress.order_capacity,progress.pages_read*5,progress.pages_read*20)||progress.order_capacity<frame.coverage.orders))return null;
  const taxDescriptor=Object.getOwnPropertyDescriptor(frame,'tax'),mei=taxDescriptor!==undefined;
  if(mei){
   if(!Object.hasOwn(taxDescriptor,'value'))return null;
   const tax=taxDescriptor.value;
   if(!exact(tax,['schema','regime','year','policy_revision','monthly_das_cents','tax_cents','status','source','basis'])||tax.schema!=='business_month_tax_v1'||tax.regime!=='MEI'||!int(tax.year,2000,9999)||!int(tax.policy_revision,0,2147483647)||tax.basis!=='MONTHLY_COMPETENCE_NO_PRORATION')return null;
   if(tax.status==='DECLARED'){
    if(tax.source!=='OPERATOR_DECLARED_DAS'||tax.policy_revision===0||!int(tax.monthly_das_cents,1,1000000)||tax.tax_cents!==tax.monthly_das_cents||frame.known_invoice_tax_cents!==tax.tax_cents)return null;
   }else if(tax.status!=='PENDING'||tax.source!=='DAS_REQUIRED'||tax.monthly_das_cents!==null||tax.tax_cents!==null||frame.known_invoice_tax_cents!==null)return null;
   keys.push('tax_treatment');
  }
  const taxValid=(base,tax,count)=>{if(mei)return tax===0;const n=BigInt(count),difference=BigInt(tax)*10000n-BigInt(base)*200n;return base>=0&&tax>=0&&(count!==0||base===0&&tax===0)&&difference>=-4999n*n&&difference<=5000n*n;};
  if(!['known_sales_cents','known_expected_repass_cents','known_production_cost_cents'].every(key=>cents(frame[key],key==='known_expected_repass_cents'))||!mei&&!cents(frame.known_invoice_tax_cents))return null;
  if(!exact(value,keys)||value.schema!=='business_month_products_v1'||!int(value.mixed_orders,0,3000)||!array(value.products,3000))return null;
  if(mei&&value.tax_treatment!=='MONTHLY_DAS_NOT_ALLOCATED')return null;
  for(const name of moneyNames)if(!cents(value['known_mixed_'+name+'_cents'],['repass','ads_adjustment'].includes(name)))return null;
  const unmapped=new Map();for(const row of frame.unmapped_variants){if(!exact(row,['item_id','model_id','quantity'])||!id(row.item_id)||!id(row.model_id,true)||!int(row.quantity,1)||unmapped.has(row.item_id+':'+row.model_id))return null;unmapped.set(row.item_id+':'+row.model_id,row.quantity);}
  const totals=moneyNames.map(name=>BigInt(value['known_mixed_'+name+'_cents'])),products=[],seen=new Set(),seenUnmapped=new Set();
  let exclusiveOrders=0,covered=0,missing=0,returns=0,unknownReturns=0,mixedReferences=0,variantCount=0,allKnownCost=0n,allCompleteCost=true;
  for(const row of value.products){
   const hasKnown=plain(row)&&Object.hasOwn(row,'known_exclusive_after_costs_cents'),projectedRowKeys=[...rowKeys,...(hasKnown?['known_exclusive_after_costs_cents']:[])];
   if(!exact(row,projectedRowKeys)||!id(row.item_id)||seen.has(row.item_id)||!int(row.quantity,1)||!counts.every(key=>int(row[key],0,3000))||row.orders!==row.exclusive_orders+row.mixed_orders||row.orders===0||row.exclusive_payment_covered+row.exclusive_payment_missing!==row.exclusive_orders||row.exclusive_returns>row.exclusive_payment_covered||row.exclusive_returns_unknown<row.exclusive_payment_missing||row.exclusive_returns+row.exclusive_returns_unknown>row.exclusive_orders||row.mixed_orders>value.mixed_orders||!array(row.variants,3000)||!row.variants.length||!array(row.pending,codes.length)||new Set(row.pending).size!==row.pending.length||!row.pending.every(code=>codes.includes(code)))return null;
   seen.add(row.item_id);variantCount+=row.variants.length;if(variantCount>3000)return null;
   for(let index=0;index<moneyNames.length;index++){
    const name=moneyNames[index],known=row['known_exclusive_'+name+'_cents'],total=row['exclusive_'+name+'_cents'];
    if(!cents(known,['repass','ads_adjustment'].includes(name))||total!==(row.exclusive_payment_missing?null:known)||row.exclusive_payment_covered===0&&known!==0)return null;
    totals[index]+=BigInt(known);
   }
   if(!taxValid(row.known_exclusive_sales_cents,row.known_exclusive_tax_cents,row.exclusive_payment_covered))return null;
   const variants=[],models=new Set();let quantity=0n,exclusiveQuantity=0n,mixedQuantity=0n,knownCost=0n,exclusiveCost=0n,costReady=true,exclusiveReady=true;
   for(const variant of row.variants){
    const custom=Object.getOwnPropertyDescriptor(variant||{},'selling_unit')?.value==='CUSTOM_PRODUCT';
    if(!exact(variant,[...variantKeys,...(custom?['cost_profile_id','cost_profile_label']:[])])||!id(variant.model_id,true)||models.has(variant.model_id)||!int(variant.quantity,1)||!int(variant.exclusive_quantity)||!int(variant.mixed_quantity)||BigInt(variant.quantity)!==BigInt(variant.exclusive_quantity)+BigInt(variant.mixed_quantity)||variant.unit_cost_cents!==null&&!cents(variant.unit_cost_cents))return null;
    models.add(variant.model_id);
    if(custom){if(!int(variant.unit_cost_cents,1,1000000)||typeof variant.cost_profile_id!=='string'||!/^[a-z0-9-]{1,64}$/.test(variant.cost_profile_id)||typeof variant.cost_profile_label!=='string'||variant.cost_profile_label!==variant.cost_profile_label.trim()||variant.cost_profile_label.length<1||variant.cost_profile_label.length>60||/[\u0000-\u001f\u007f-\u009f]/.test(variant.cost_profile_label)||[variant.size,variant.male_size,variant.female_size].some(item=>item!==null))return null;}
    else if(variant.unit_cost_cents===null){if([variant.selling_unit,variant.size,variant.male_size,variant.female_size].some(item=>item!==null))return null;const key=row.item_id+':'+variant.model_id;if(unmapped.get(key)!==variant.quantity)return null;seenUnmapped.add(key);}
    else if(variant.selling_unit==='SINGLE_GARMENT'){if(!sizes.includes(variant.size)||variant.male_size!==null||variant.female_size!==null)return null;}
    else if(variant.selling_unit==='ONE_MALE_ONE_FEMALE_KIT'){if(variant.size!==null||!sizes.includes(variant.male_size)||!sizes.includes(variant.female_size))return null;}
    else return null;
    const expected=variant.unit_cost_cents===null?null:safe(BigInt(variant.unit_cost_cents)*BigInt(variant.quantity));
    const exclusive=variant.exclusive_quantity===0?0:variant.unit_cost_cents===null?null:safe(BigInt(variant.unit_cost_cents)*BigInt(variant.exclusive_quantity));
    if(variant.unit_cost_cents!==null&&expected===null||variant.unit_cost_cents!==null&&exclusive===null||variant.production_cost_cents!==expected||variant.exclusive_production_cost_cents!==exclusive)return null;
    quantity+=BigInt(variant.quantity);exclusiveQuantity+=BigInt(variant.exclusive_quantity);mixedQuantity+=BigInt(variant.mixed_quantity);
    if(expected===null)costReady=false;else knownCost+=BigInt(expected);
    if(exclusive===null)exclusiveReady=false;else exclusiveCost+=BigInt(exclusive);
    variants.push({...variant});
   }
   if(quantity!==BigInt(row.quantity)||(row.exclusive_orders===0?exclusiveQuantity!==0n:exclusiveQuantity<BigInt(row.exclusive_orders))||(row.mixed_orders===0?mixedQuantity!==0n:mixedQuantity<BigInt(row.mixed_orders))||safe(knownCost)===null||safe(exclusiveCost)===null||row.known_production_cost_cents!==Number(knownCost)||row.production_cost_cents!==(costReady?Number(knownCost):null)||row.known_exclusive_production_cost_cents!==Number(exclusiveCost)||row.exclusive_production_cost_cents!==(exclusiveReady?Number(exclusiveCost):null))return null;
   const expectedPending=[];
   if(row.exclusive_payment_missing)expectedPending.push('PAYMENT_INCOMPLETE');
   if(!exclusiveReady)expectedPending.push('PRODUCTION_COST_INCOMPLETE');
   if(row.exclusive_returns+row.exclusive_returns_unknown)expectedPending.push('RETURNS_NOT_RECONCILED');
   if(frame.coverage.cancel_pending+frame.coverage.other+frame.coverage.unknown)expectedPending.push('STATUS_REVIEW_REQUIRED');
   if(frame.result.pending.includes('SOURCE_UNAVAILABLE')||frame.result.pending.includes('FINANCIAL_SOURCE_STALE'))expectedPending.push('SOURCE_UNAVAILABLE');
   if(!row.exclusive_orders)expectedPending.push('NO_EXCLUSIVE_ORDERS');
   let after=null,margin=null;
   if(!expectedPending.length){after=safe(BigInt(row.exclusive_repass_cents)-exclusiveCost-BigInt(row.exclusive_tax_cents));if(after!==null&&row.exclusive_sales_cents>0)margin=safe(BigInt(after)*10000n/BigInt(row.exclusive_sales_cents));if(after===null||row.exclusive_sales_cents>0&&margin===null){after=null;margin=null;expectedPending.push('ARITHMETIC_UNSAFE');}}
   // This is only the fully covered exclusive subset. It remains an observed
   // subtotal when another order or an older period source blocks the result.
   const knownAfter=row.exclusive_orders>0&&row.exclusive_payment_missing===0&&exclusiveReady&&row.exclusive_returns+row.exclusive_returns_unknown===0?safe(BigInt(row.exclusive_repass_cents)-exclusiveCost-BigInt(row.exclusive_tax_cents)):null;
   if(hasKnown&&(row.known_exclusive_after_costs_cents!==null&&!cents(row.known_exclusive_after_costs_cents,true)||row.known_exclusive_after_costs_cents!==knownAfter))return null;
   if(row.exclusive_after_costs_cents!==after||row.exclusive_margin_bps!==margin||row.pending.length!==expectedPending.length||!expectedPending.every(code=>row.pending.includes(code)))return null;
   variants.sort((a,b)=>sorted(a.model_id,b.model_id));products.push(Object.fromEntries(projectedRowKeys.map(key=>[key,key==='variants'?variants:key==='pending'?[...expectedPending]:row[key]])));
   exclusiveOrders+=row.exclusive_orders;covered+=row.exclusive_payment_covered;missing+=row.exclusive_payment_missing;returns+=row.exclusive_returns;unknownReturns+=row.exclusive_returns_unknown;mixedReferences+=row.mixed_orders;allKnownCost+=knownCost;allCompleteCost&&=costReady;
  }
  const mixedCovered=frame.coverage.payment_covered-covered,mixedMissing=frame.coverage.payment_missing-missing,mixedReturns=frame.coverage.returns-returns,mixedUnknownReturns=frame.coverage.returns_unknown-unknownReturns;
  if(exclusiveOrders+value.mixed_orders!==frame.coverage.paid||mixedCovered<0||mixedMissing<0||mixedCovered+mixedMissing!==value.mixed_orders||mixedReturns<0||mixedReturns>mixedCovered||mixedUnknownReturns<mixedMissing||mixedReturns+mixedUnknownReturns>value.mixed_orders||(value.mixed_orders===0?mixedReferences!==0:mixedReferences<value.mixed_orders*2||mixedReferences>value.mixed_orders*products.length)||seenUnmapped.size!==unmapped.size)return null;
  if(mixedCovered===0&&moneyNames.some(name=>value['known_mixed_'+name+'_cents']!==0)||!taxValid(value.known_mixed_sales_cents,value.known_mixed_tax_cents,mixedCovered))return null;
  if(totals[0]!==BigInt(frame.known_sales_cents)||totals[1]!==BigInt(frame.known_expected_repass_cents)||totals[2]!==(mei?0n:BigInt(frame.known_invoice_tax_cents))||frame.ads_adjustment_cents!==null&&totals[3]!==BigInt(frame.ads_adjustment_cents)||allKnownCost!==BigInt(frame.known_production_cost_cents)||frame.production_cost_cents!==(allCompleteCost?frame.known_production_cost_cents:null))return null;
  products.sort((a,b)=>sorted(a.item_id,b.item_id));return Object.fromEntries(keys.map(key=>[key,key==='products'?products:value[key]]));
 }catch{return null;}
}
 function projectBusinessMonth(value){
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
 function projectBusinessMonthAuditScope(value){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const revision=item=>Number.isSafeInteger(item)&&item>=1&&item<=2147483647;
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const uuid=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
 try{
  if(!exact(value,['publication_revision','start_date','end_date','sources'])||!revision(value.publication_revision)||!day(value.start_date)||!day(value.end_date)||value.start_date<'2000-01-01'||value.start_date.slice(8)!=='01'||value.start_date.slice(0,7)!==value.end_date.slice(0,7))return null;
  const month=value.start_date.slice(0,7),last=Number(value.end_date.slice(8)),rows=value.sources;
  if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype||rows.length!==Math.ceil(last/15)||Reflect.ownKeys(rows).length!==rows.length+1)return null;
  const sources=[],seen=new Set();
  for(let index=0;index<rows.length;index++){
   const descriptor=Object.getOwnPropertyDescriptor(rows,String(index));if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;
   const source=descriptor.value,start_date=month+'-'+String(index*15+1).padStart(2,'0'),end_date=month+'-'+String(Math.min(index*15+15,last)).padStart(2,'0');
   if(!exact(source,['run_id','source_revision','start_date','end_date'])||!uuid(source.run_id)||seen.has(source.run_id)||!revision(source.source_revision)||source.start_date!==start_date||source.end_date!==end_date)return null;
   seen.add(source.run_id);sources.push({run_id:source.run_id,source_revision:source.source_revision,start_date,end_date});
  }
  return {publication_revision:value.publication_revision,start_date:value.start_date,end_date:value.end_date,sources};
 }catch{return null;}
}
 function projectDailyBusinessSummary(value,monthly,auditScope){
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
 function projectBusinessMonthVariantContributions(value,monthlyFrame,auditScope){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const data=(v,keys)=>plain(v)&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
 const exact=(v,keys)=>data(v,keys)&&Reflect.ownKeys(v).length===keys.length;
 const list=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(i))||{},'value')).every(Boolean);
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const signed=v=>int(v,Number.MIN_SAFE_INTEGER),safe=v=>v>=BigInt(Number.MIN_SAFE_INTEGER)&&v<=BigInt(Number.MAX_SAFE_INTEGER)?Number(v):null;
 const id=(v,zero=false)=>typeof v==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(v);
 const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
 const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};
 const compare=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
 const codes=['VARIANT_CAPTURE_INCOMPLETE','VARIANT_CAPTURE_INVALID','SOURCE_UNAVAILABLE','FINANCIAL_SOURCE_STALE','PAYMENT_INCOMPLETE','STATUS_REVIEW_REQUIRED','ARITHMETIC_UNSAFE','COLLECTING','PERIOD_LIMIT_REACHED','NO_SINGLE_PAIR_ORDERS','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE'];
 const validCodes=v=>list(v,codes.length)&&new Set(v).size===v.length&&v.every(code=>codes.includes(code));
 const sameCodes=(a,b)=>validCodes(a)&&a.length===b.length&&b.every(code=>a.includes(code));
 const money=['sales_cents','repass_cents','tax_cents','ads_adjustment_cents','production_cost_cents','contribution_cents'];
 try{
  if(!data(monthlyFrame,['schema','month','start_date','end_date','checked_at','status','product_summary','result','bindings_revision','costs_revision'])||monthlyFrame.schema!=='business_month_v1'||monthlyFrame.status!=='COMPLETE'||!int(monthlyFrame.checked_at,1,9999999999)||!data(monthlyFrame.result,['pending'])||!list(monthlyFrame.result.pending,30)||!data(monthlyFrame.product_summary,['products'])||!list(monthlyFrame.product_summary.products,3000))return null;
  const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  if(!exact(auditScope,['publication_revision','start_date','end_date','sources'])||!int(auditScope.publication_revision,1,2147483647)||!day(auditScope.start_date)||!day(auditScope.end_date)||auditScope.start_date.slice(8)!=='01'||auditScope.start_date.slice(0,7)!==monthlyFrame.month||auditScope.end_date.slice(0,7)!==monthlyFrame.month||auditScope.start_date!==monthlyFrame.start_date||auditScope.end_date!==monthlyFrame.end_date||!list(auditScope.sources,3)||auditScope.sources.length!==Math.ceil(Number(auditScope.end_date.slice(8))/15))return null;
  for(const key of ['cost_rules_revision','classification_revision','tax']){const descriptor=Object.getOwnPropertyDescriptor(monthlyFrame,key);if(descriptor&&!Object.hasOwn(descriptor,'value'))return null;}
  const sourceKeys=['publication_revision','bindings_revision','costs_revision','cost_rules_revision','classification_revision'],expectedSource={publication_revision:auditScope.publication_revision,bindings_revision:monthlyFrame.bindings_revision,costs_revision:monthlyFrame.costs_revision,cost_rules_revision:Object.getOwnPropertyDescriptor(monthlyFrame,'cost_rules_revision')?.value??null,classification_revision:Object.getOwnPropertyDescriptor(monthlyFrame,'classification_revision')?.value??null};
  const keys=['schema','month','start_date','end_date','checked_at','state','basis','cost_basis','tax_basis','source','windows','coverage','variants','pending','execution_allowed','net_profit_cents','safe_price_cents'];
  const mei=Object.getOwnPropertyDescriptor(monthlyFrame,'tax')?.value?.regime==='MEI';
  if(!exact(value,keys)||value.schema!=='business_month_variant_contributions_v1'||value.month!==monthlyFrame.month||value.start_date!==monthlyFrame.start_date||value.end_date!==monthlyFrame.end_date||value.checked_at!==monthlyFrame.checked_at||value.basis!=='SINGLE_PAIR_PAID_ORDERS_CURRENT_REFERENCE_NOT_SETTLED'||value.cost_basis!=='CURRENT_REFERENCE_NOT_MANUFACTURING_OR_REUSE_LEDGER'||value.tax_basis!==(mei?'MONTHLY_DAS_NOT_ALLOCATED':'LEGACY_ORDER_TAX_REFERENCE_NOT_OFFICIAL_TAX')||value.execution_allowed!==false||value.net_profit_cents!==null||value.safe_price_cents!==null||!exact(value.source,sourceKeys)||sourceKeys.some(key=>value.source[key]!==expectedSource[key])||!list(value.windows,3)||value.windows.length!==auditScope.sources.length||!list(value.variants,3000))return null;
  const windows=[],seenSources=new Set();let captured=0;
  for(let i=0;i<value.windows.length;i++){
   const row=value.windows[i],source=auditScope.sources[i];
   const expectedStart=monthlyFrame.month+'-'+String(i*15+1).padStart(2,'0'),expectedEnd=monthlyFrame.month+'-'+String(Math.min(i*15+15,Number(auditScope.end_date.slice(8)))).padStart(2,'0');
   if(!exact(source,['run_id','source_revision','start_date','end_date'])||!uuid(source.run_id)||seenSources.has(source.run_id)||!int(source.source_revision,1,2147483647)||source.start_date!==expectedStart||source.end_date!==expectedEnd||!exact(row,['run_id','source_revision','start_date','end_date','checked_at','report_hash','capture_revision','state'])||row.run_id!==source.run_id||row.source_revision!==source.source_revision||row.start_date!==source.start_date||row.end_date!==source.end_date||!['CAPTURED','NOT_CAPTURED','INVALID'].includes(row.state))return null;
   seenSources.add(source.run_id);
   if(row.state==='CAPTURED'){if(!int(row.checked_at,1,value.checked_at)||!digest(row.report_hash)||!int(row.capture_revision,1,auditScope.publication_revision))return null;captured++;}
   else if([row.checked_at,row.report_hash,row.capture_revision].some(v=>v!==null))return null;
   windows.push({...row});
  }
  const complete=captured===windows.length,global=monthlyFrame.result.pending.filter(code=>['SOURCE_UNAVAILABLE','FINANCIAL_SOURCE_STALE','PAYMENT_INCOMPLETE','STATUS_REVIEW_REQUIRED','ARITHMETIC_UNSAFE','COLLECTING','PERIOD_LIMIT_REACHED'].includes(code)),basePending=[...(!complete?['VARIANT_CAPTURE_INCOMPLETE']:[]),...(windows.some(row=>row.state==='INVALID')?['VARIANT_CAPTURE_INVALID']:[]),...global];
  const expected=new Map();let total=0n;
  for(const product of monthlyFrame.product_summary.products){
   if(!data(product,['item_id','variants'])||!id(product.item_id)||!list(product.variants,3000))return null;
   for(const variant of product.variants){if(!data(variant,['model_id','quantity','unit_cost_cents'])||!id(variant.model_id,true)||!int(variant.quantity,1)||variant.unit_cost_cents!==null&&!int(variant.unit_cost_cents))return null;const key=product.item_id+':'+variant.model_id;if(expected.has(key))return null;expected.set(key,{item_id:product.item_id,model_id:variant.model_id,quantity:variant.quantity,unit_cost_cents:variant.unit_cost_cents});total+=BigInt(variant.quantity);}
  }
  if(expected.size>3000||expected.size!==value.variants.length||safe(total)===null)return null;
  const rows=[],seen=new Set(),allPending=new Set(basePending),countNames=['orders','completed','ongoing','payment_covered','payment_missing','returns','returns_unknown'],counts=Object.fromEntries(countNames.map(key=>[key,0]));let assigned=0n,strictCount=0,previous=null,knownSales=0n,knownTax=0n;
  const rowKeys=['item_id','model_id','total_quantity','attributed_quantity','unattributed_quantity','unit_cost_cents','orders','completed','ongoing','payment_covered','payment_missing','returns','returns_unknown','recorded','strict','pending'];
  for(const row of value.variants){
   if(!exact(row,rowKeys)||!id(row.item_id)||!id(row.model_id,true)||previous&&(compare(previous.item_id,row.item_id)>0||previous.item_id===row.item_id&&compare(previous.model_id,row.model_id)>=0))return null;previous=row;
   const key=row.item_id+':'+row.model_id,reference=expected.get(key);if(!reference||seen.has(key)||row.total_quantity!==reference.quantity||row.unit_cost_cents!==reference.unit_cost_cents||!int(row.attributed_quantity,0,row.total_quantity)||row.unattributed_quantity!==row.total_quantity-row.attributed_quantity||!['orders','completed','ongoing','payment_covered','payment_missing','returns','returns_unknown'].every(key=>int(row[key],0,3000))||row.orders!==row.completed+row.ongoing||row.orders!==row.payment_covered+row.payment_missing||row.orders>row.attributed_quantity||row.orders===0&&row.attributed_quantity!==0||row.returns>row.payment_covered||row.returns_unknown<row.payment_missing||row.returns+row.returns_unknown>row.orders||!exact(row.recorded,money)||!exact(row.strict,['state',...money,'margin_bps']))return null;seen.add(key);assigned+=BigInt(row.attributed_quantity);
   const registered=row.recorded;
   for(const name of money)if(registered[name]!==null&&!(['repass_cents','ads_adjustment_cents','contribution_cents'].includes(name)?signed(registered[name]):int(registered[name])))return null;
   if(!captured&&(money.some(name=>registered[name]!==null)||row.attributed_quantity!==0||countNames.some(key=>row[key]!==0))||captured&&['sales_cents','repass_cents','tax_cents','ads_adjustment_cents'].some(name=>registered[name]===null)||captured&&mei&&registered.tax_cents!==0||captured&&row.payment_covered===0&&['sales_cents','repass_cents','tax_cents','ads_adjustment_cents'].some(name=>registered[name]!==0))return null;
   if(captured){
    const n=BigInt(row.payment_covered),bound=n*100000000000000n;
    if(['sales_cents','repass_cents','tax_cents','ads_adjustment_cents'].some(key=>BigInt(registered[key])< -bound||BigInt(registered[key])>bound))return null;
    const difference=BigInt(registered.tax_cents)*10000n-BigInt(registered.sales_cents)*200n;if(!mei&&(difference< -4999n*n||difference>5000n*n))return null;
    knownSales+=BigInt(registered.sales_cents);knownTax+=BigInt(registered.tax_cents);
   }
   for(const key of countNames){counts[key]+=row[key];if(!int(counts[key],0,3000))return null;}
   const production=captured&&row.unit_cost_cents!==null?safe(BigInt(row.attributed_quantity)*BigInt(row.unit_cost_cents)):null;
   if(captured&&row.unit_cost_cents!==null&&production===null||registered.production_cost_cents!==production)return null;
   const coherent=complete&&row.orders>0&&row.payment_missing===0&&row.returns===0&&row.returns_unknown===0&&production!==null;
   const contribution=coherent?safe(BigInt(registered.repass_cents)-BigInt(production)-BigInt(registered.tax_cents)):null;
   if(registered.contribution_cents!==contribution)return null;
   const pending=[...basePending];if(!row.orders)pending.push('NO_SINGLE_PAIR_ORDERS');if(row.payment_missing)pending.push('PAYMENT_INCOMPLETE');if(row.returns+row.returns_unknown)pending.push('RETURNS_NOT_RECONCILED');if(row.unit_cost_cents===null)pending.push('PRODUCTION_COST_INCOMPLETE');if(coherent&&contribution===null)pending.push('ARITHMETIC_UNSAFE');
   let unique=[...new Set(pending)],ready=unique.length===0&&contribution!==null,margin=ready&&registered.sales_cents>0?safe(BigInt(contribution)*10000n/BigInt(registered.sales_cents)):null;
   if(ready&&registered.sales_cents>0&&margin===null){unique.push('ARITHMETIC_UNSAFE');ready=false;}
   if(row.strict.state!==(ready?'AVAILABLE':'BLOCKED')||!sameCodes(row.pending,unique)||money.some(name=>row.strict[name]!==(ready?registered[name]:null))||row.strict.margin_bps!==margin)return null;
   if(ready)strictCount++;for(const code of unique)allPending.add(code);
   rows.push({...Object.fromEntries(rowKeys.filter(key=>!['recorded','strict','pending'].includes(key)).map(key=>[key,row[key]])),recorded:{...registered},strict:{...row.strict},pending:unique});
  }
  if(!data(monthlyFrame,['coverage','known_sales_cents','known_invoice_tax_cents'])||!data(monthlyFrame.coverage,['paid',...countNames.slice(1)])||counts.orders>monthlyFrame.coverage.paid||countNames.slice(1).some(key=>counts[key]>monthlyFrame.coverage[key])||!int(monthlyFrame.known_sales_cents)||knownSales>BigInt(monthlyFrame.known_sales_cents)||!mei&&(!int(monthlyFrame.known_invoice_tax_cents)||knownTax>BigInt(monthlyFrame.known_invoice_tax_cents)))return null;
  const coverage={total_units:Number(total),single_pair_units:safe(assigned),unattributed_units:safe(total-assigned),total_variants:rows.length,strict_variants:strictCount,windows_total:windows.length,windows_captured:captured};
  if(coverage.single_pair_units===null||coverage.unattributed_units===null||!exact(value.coverage,Object.keys(coverage))||Object.keys(coverage).some(key=>value.coverage[key]!==coverage[key])||value.state!==(complete?'AVAILABLE':captured?'PARTIAL':'NOT_CAPTURED')||!sameCodes(value.pending,[...allPending]))return null;
  const output={...Object.fromEntries(keys.filter(key=>!['source','windows','coverage','variants','pending'].includes(key)).map(key=>[key,value[key]])),source:{...expectedSource},windows,coverage,variants:rows,pending:[...allPending]};
  return new TextEncoder().encode(JSON.stringify(output)).byteLength<=2097152?freeze(output):null;
 }catch{return null;}
}
 function projectBusinessMonthView(value,projectMonthlyFrame,projectAuditScope,projectDailySummary,projectExpenseScheduleFrame,projectVariantContributionsFrame){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const integer=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 try{
  const schema=Object.getOwnPropertyDescriptor(value||{},'schema')?.value,variantsAware=schema==='business_month_view_v5',expenseAware=variantsAware||schema==='business_month_view_v4',daily=expenseAware||schema==='business_month_view_v3',scoped=daily||schema==='business_month_view_v2';
  if(typeof projectMonthlyFrame!=='function'||!exact(value,['schema','month','display','display_source','collection','automatic',...(scoped?['audit_scope']:[]),...(daily?['daily_summary']:[]),...(expenseAware?['expense_schedule']:[]),...(variantsAware?['variant_contributions']:[])])||!['business_month_view_v1','business_month_view_v2','business_month_view_v3','business_month_view_v4','business_month_view_v5'].includes(schema)||typeof value.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||!['PUBLISHED','ACTIVE'].includes(value.display_source))return null;
  const display=projectMonthlyFrame(value.display),collection=value.collection,automatic=value.automatic;
  if(!display||display.month!==value.month||value.display_source==='PUBLISHED'&&display.status!=='COMPLETE'||!exact(collection,['status','start_date','end_date','checked_at','progress','coverage','source_checked_at','collection']))return null;
  let auditScope=null;
  if(scoped){
   if(typeof projectAuditScope!=='function')return null;
   if(value.display_source==='ACTIVE'){if(value.audit_scope!==null)return null;}
   else{auditScope=projectAuditScope(value.audit_scope);if(!auditScope||auditScope.start_date!==display.start_date||auditScope.end_date!==display.end_date)return null;}
  }
  let dailySummary=null,expenseSchedule=null;
  if(daily){
   if(typeof projectDailySummary!=='function')return null;
   if(value.daily_summary!==null){
    if(value.display_source!=='PUBLISHED')return null;
    dailySummary=projectDailySummary(value.daily_summary,display,auditScope);if(!dailySummary)return null;
   }
  }
  if(expenseAware){
   if(typeof projectExpenseScheduleFrame!=='function')return null;
   if(value.expense_schedule!==null){expenseSchedule=projectExpenseScheduleFrame(value.expense_schedule);if(!expenseSchedule||expenseSchedule.month!==value.month)return null;}
   if(value.display_source==='ACTIVE'&&expenseSchedule!==null)return null;
  }
  let variantContributions=null;
  if(variantsAware){
   if(typeof projectVariantContributionsFrame!=='function')return null;
   if(value.variant_contributions!==null){
    if(value.display_source!=='PUBLISHED')return null;
    variantContributions=projectVariantContributionsFrame(value.variant_contributions,display,auditScope);if(!variantContributions)return null;
   }
  }
  if(!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(collection.status)||collection.start_date!==value.month+'-01'||!day(collection.start_date)||!day(collection.end_date)||collection.end_date.slice(0,7)!==value.month||!integer(collection.checked_at,1,9999999999)||collection.end_date<display.end_date)return null;
  const p=collection.progress,c=collection.coverage,capacityPresent=plain(p)&&Object.hasOwn(p,'order_capacity');
  const coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
  if(!exact(p,['windows_total','windows_complete','pages_read',...(capacityPresent?['order_capacity']:[])])||!exact(c,coverageKeys))return null;
  const capacity=capacityPresent?p.order_capacity:p.pages_read*5;
  if(p.windows_total!==Math.ceil(Number(collection.end_date.slice(8))/15)||!integer(p.windows_complete,0,p.windows_total)||!integer(p.pages_read,0,p.windows_total*200)||!integer(capacity,p.pages_read*5,p.pages_read*20)||(capacity-p.pages_read*5)%15!==0||!coverageKeys.every(key=>integer(c[key],0,p.windows_total*1000))||c.orders!==c.paid+c.cancelled+c.cancel_pending+c.unpaid+c.other+c.unknown||c.paid!==c.completed+c.ongoing||c.payment_covered+c.payment_missing!==c.paid||c.returns+c.returns_unknown>c.paid||c.orders>capacity||collection.status==='COMPLETE'&&p.windows_complete!==p.windows_total||collection.status!=='COMPLETE'&&p.windows_complete===p.windows_total)return null;
  const observedDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(collection.checked_at*1000));
  if(collection.end_date>observedDay)return null;
  const sources=collection.source_checked_at;
  if(sources!==null&&(!exact(sources,['finance_oldest_at','finance_latest_at','ads_at'])||!Object.values(sources).every(at=>at===null||integer(at,1,collection.checked_at))||(sources.finance_oldest_at===null)!==(sources.finance_latest_at===null)||p.windows_complete>0&&sources.finance_oldest_at===null||sources.finance_oldest_at!==null&&sources.finance_oldest_at>sources.finance_latest_at))return null;
  const wait=collection.collection;
  if(wait!==null){
   const retry=['BUSINESS_PERIOD_CHECKPOINT','BUSINESS_PERIOD_BUSY','BUSINESS_PERIOD_CONFLICT','BUSINESS_PERIOD_RATE_LIMIT','BUSINESS_PERIOD_TIMEOUT','BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE'],blocked=['BUSINESS_PERIOD_AUTH_REQUIRED','BUSINESS_PERIOD_INVALID_SOURCE','BUSINESS_PERIOD_PERMISSION_DENIED'];
   if(!exact(wait,['schema','state','code','retry_after_seconds'])||wait.schema!=='business_month_collection_v1'||!integer(wait.retry_after_seconds,0,1800)||!['READY','RETRY_WAIT','BLOCKED'].includes(wait.state)||(wait.state==='READY'?(wait.code!==null||wait.retry_after_seconds!==0):wait.state==='RETRY_WAIT'?(!retry.includes(wait.code)||wait.retry_after_seconds<1):(!blocked.includes(wait.code)||wait.retry_after_seconds!==0)))return null;
  }
  if(!exact(automatic,['enabled','applicable','status','next_run_at','last_attempt_at'])||typeof automatic.enabled!=='boolean'||typeof automatic.applicable!=='boolean'||!['IDLE','RUNNING','COMPLETE','PARTIAL','LIMIT_REACHED','ERROR','PAUSED'].includes(automatic.status)||!integer(automatic.next_run_at,0,9999999999)||automatic.last_attempt_at!==null&&!integer(automatic.last_attempt_at,1,9999999999))return null;
  if(value.display_source==='ACTIVE'&&(display.status!==collection.status||display.start_date!==collection.start_date||display.end_date!==collection.end_date||display.checked_at!==collection.checked_at||JSON.stringify(display.progress)!==JSON.stringify(p)||JSON.stringify(display.coverage)!==JSON.stringify(c)||JSON.stringify(display.source_checked_at??null)!==JSON.stringify(sources)||JSON.stringify(display.collection??null)!==JSON.stringify(wait)))return null;
  return {schema,month:value.month,display,display_source:value.display_source,collection:{status:collection.status,start_date:collection.start_date,end_date:collection.end_date,checked_at:collection.checked_at,progress:{...p},coverage:{...c},source_checked_at:sources===null?null:{...sources},collection:wait===null?null:{...wait}},automatic:{...automatic},...(scoped?{audit_scope:auditScope}:{}),...(daily?{daily_summary:dailySummary}:{}),...(expenseAware?{expense_schedule:expenseSchedule}:{}),...(variantsAware?{variant_contributions:variantContributions}:{})};
 }catch{return null;}
}
 function projectExpenseSchedule(value){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const month=v=>typeof v==='string'&&/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
 const day=v=>typeof v==='string'&&/^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const arr=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
 const keys=['schema','month','today','status','mode','open_count','open_cents','overdue_count','overdue_cents','due_today_count','due_today_cents','due_next_7_days_count','due_next_7_days_cents','next_due_date','next_due_count','next_due_cents','upcoming','basis'];
 const itemKeys=['id','category','description','amount_cents','due_date','installment_number','installments'];
 try{
  if(!exact(value,keys)||value.schema!=='expense_schedule_v1'||!month(value.month)||!day(value.today)||!['NOT_ITEMIZED','AVAILABLE'].includes(value.status)||value.mode!==null&&!['DRAFT','CONFIRMED'].includes(value.mode)||value.basis!=='OWNER_DECLARED_DUE_DATES_NOT_BANK_SETTLEMENT'||!arr(value.upcoming,5))return null;
  const countKeys=['open_count','overdue_count','due_today_count','due_next_7_days_count','next_due_count'],moneyKeys=['open_cents','overdue_cents','due_today_cents','due_next_7_days_cents','next_due_cents'];
  if(value.status==='NOT_ITEMIZED'){
   if(value.mode!==null||value.next_due_date!==null||value.upcoming.length||[...countKeys,...moneyKeys].some(key=>value[key]!==null))return null;
   return {...value,upcoming:[]};
  }
  if(value.mode===null||!countKeys.every(key=>int(value[key],0,200))||!moneyKeys.every(key=>int(value[key]))||value.overdue_count+value.due_today_count+value.due_next_7_days_count>value.open_count||value.next_due_date!==null&&!day(value.next_due_date))return null;
  if(value.open_count===0){
   if(value.open_cents!==0||value.overdue_count!==0||value.overdue_cents!==0||value.due_today_count!==0||value.due_today_cents!==0||value.due_next_7_days_count!==0||value.due_next_7_days_cents!==0||value.next_due_date!==null||value.next_due_count!==0||value.next_due_cents!==0||value.upcoming.length)return null;
  }else if(value.next_due_date===null){
   if(value.next_due_count!==0||value.next_due_cents!==0||value.upcoming.length)return null;
  }else if(value.next_due_date<value.today||value.next_due_count<1||value.next_due_cents<1)return null;
  let previous=null,visibleNext=0,visibleNextMoney=0n;
  for(const item of value.upcoming){
   if(!exact(item,itemKeys)||typeof item.id!=='string'||!/^[a-f0-9-]{36}$/.test(item.id)||!['RENT','EMPLOYEES','BILL','OTHER'].includes(item.category)||typeof item.description!=='string'||item.description.length<1||item.description.length>160||item.description.trim()!==item.description||/[\u0000-\u001f\u007f]/.test(item.description)||!int(item.amount_cents,1)||!day(item.due_date)||item.due_date<value.today||!int(item.installment_number,1,120)||!int(item.installments,item.installment_number,120))return null;
   if(previous!==null&&(item.due_date<previous.due_date||item.due_date===previous.due_date&&item.id<=previous.id))return null;previous=item;
   if(item.due_date===value.next_due_date){visibleNext++;visibleNextMoney+=BigInt(item.amount_cents);}
  }
  const futureCount=value.open_count-value.overdue_count;if(futureCount<0||value.upcoming.length!==Math.min(5,futureCount))return null;
  if(value.upcoming.length&&value.upcoming[0].due_date!==value.next_due_date||visibleNext>value.next_due_count||visibleNextMoney>BigInt(value.next_due_cents))return null;
  if(futureCount<=5){
   const futureMoney=value.upcoming.reduce((sum,item)=>sum+BigInt(item.amount_cents),0n);if(futureMoney!==BigInt(value.open_cents)-BigInt(value.overdue_cents)||visibleNext!==value.next_due_count||visibleNextMoney!==BigInt(value.next_due_cents))return null;
   const todayRows=value.upcoming.filter(item=>item.due_date===value.today),horizon=new Date(Date.parse(value.today+'T12:00:00Z')+7*86400000).toISOString().slice(0,10),nextRows=value.upcoming.filter(item=>item.due_date>value.today&&item.due_date<=horizon);
   if(todayRows.length!==value.due_today_count||todayRows.reduce((sum,item)=>sum+BigInt(item.amount_cents),0n)!==BigInt(value.due_today_cents)||nextRows.length!==value.due_next_7_days_count||nextRows.reduce((sum,item)=>sum+BigInt(item.amount_cents),0n)!==BigInt(value.due_next_7_days_cents))return null;
  }
  return {...value,upcoming:value.upcoming.map(item=>({...item}))};
 }catch{return null;}
}
 function buildBusinessCheckpoint(frame){
 try{
  const value=projectBusinessMonth(frame);if(!value)return null;
  const adjustment=value.ads_adjustment_cents;
  const restore=adjustment===null||adjustment<0?null:adjustment===0||value.expenses.recharge_treatment==='TECH_SUPPORT'?0:value.expenses.recharge_treatment==='ADS_RECHARGE'?adjustment:null;
  return {
   schema:'business_checkpoint_v1',month:value.month,start_date:value.start_date,end_date:value.end_date,checked_at:value.checked_at,
   status:value.result.net_estimate_cents===null?'PENDING':'EXPECTED_READY',coverage:{...value.coverage},pending:[...value.result.pending],
   result:{expected_net_cents:value.result.net_estimate_cents,realized_net_cents:null,realization:'UNVERIFIED'},
   lines:[
    {code:'EXPECTED_PAYOUT',sign:1,amount_cents:value.expected_repass_cents},
    {code:'PRODUCTION',sign:-1,amount_cents:value.production_cost_cents},
    {code:'TAX',sign:-1,amount_cents:value.invoice_tax_cents},
    {code:'ADS_CONSUMPTION',sign:-1,amount_cents:value.ads?.status==='AVAILABLE'?value.ads.expense_cents:null},
    {code:'OTHER_EXPENSES',sign:-1,amount_cents:value.expenses.external_expenses_cents},
    {code:'ADS_RECHARGE_RESTORE',sign:1,amount_cents:restore},
   ],
   sales_cents:value.sales_cents,
   versions:{bindings:value.bindings_revision,costs:value.costs_revision,cost_rules:value.cost_rules_revision??null,tax_policy:value.tax?.policy_revision??null,expenses:value.expenses.revision,...(value.classification_revision===undefined?{}:{classifications:value.classification_revision})},
   source_checked_at:value.source_checked_at?{...value.source_checked_at}:{finance_oldest_at:null,finance_latest_at:null,ads_at:value.ads?.fetched_at??null},
   tax_regime:value.tax?.regime==='MEI'?'MEI':'LEGACY_ESTIMATE',recharge_treatment:value.expenses.recharge_treatment,
  };
 }catch{return null;}
}
 function buildAccountDiagnosis(frame){
 const safe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
 try{
  const month=projectBusinessMonth(frame);
  if(!month)return null;
  const conditions=[...month.result.pending];
  const block=code=>{if(!conditions.includes(code))conditions.push(code);};
  const hasMonthlyDas=month.tax?.regime==='MEI'&&month.tax.status==='DECLARED';
  if(!hasMonthlyDas)block('TAX_POLICY_REQUIRED');
  if(!month.source_checked_at)block('FINANCIAL_SOURCE_TIMESTAMPS_REQUIRED');
  const ratio=(numerator,denominator)=>{
   if(numerator===null||denominator===null||denominator===0)return null;
   const value=safe(BigInt(numerator)*10000n/BigInt(denominator));
   if(value===null)block('ARITHMETIC_UNSAFE');
   return value;
  };
  const adsSpend=month.ads?.status==='AVAILABLE'?month.ads.expense_cents:null;
  // TACOS compares actual calendar spend with all paid store sales for exactly
  // the same selection; neither attributed Ads GMV nor average ROAS is used.
  const tacos=ratio(adsSpend,month.sales_cents);
  let totalQuantity=null,costedQuantity=null,costCoverage=null;
  if(month.product_summary){
   let total=0n,costed=0n;
   for(const row of month.product_summary.products)for(const variant of row.variants){
    total+=BigInt(variant.quantity);
    if(variant.unit_cost_cents!==null)costed+=BigInt(variant.quantity);
   }
   totalQuantity=safe(total);costedQuantity=safe(costed);
   if(totalQuantity===null||costedQuantity===null)block('ARITHMETIC_UNSAFE');
   else costCoverage=ratio(costedQuantity,totalQuantity);
  }
  const adjustment=month.ads_adjustment_cents;
  const rechargeAddback=adjustment===null||adjustment<0||adjustment>0&&month.expenses.recharge_treatment==='UNCONFIRMED'?null:month.expenses.recharge_treatment==='ADS_RECHARGE'?adjustment:0;
  let beforeAds=null;
  if(conditions.every(code=>code==='ADS_UNAVAILABLE')&&hasMonthlyDas&&month.expected_repass_cents!==null&&month.production_cost_cents!==null&&month.invoice_tax_cents!==null&&month.expenses.external_expenses_cents!==null&&rechargeAddback!==null){
   // Recharge is already deducted from the expected payout. Add back only its
   // confirmed Ads classification, then deduct actual Ads spend once below.
   beforeAds=safe(BigInt(month.expected_repass_cents)+BigInt(rechargeAddback)-BigInt(month.production_cost_cents)-BigInt(month.tax.tax_cents)-BigInt(month.expenses.external_expenses_cents));
   if(beforeAds===null)block('ARITHMETIC_UNSAFE');
  }
  const net=conditions.length===0&&beforeAds!==null?month.result.net_estimate_cents:null;
  const tasks=[];
  const addTask=(code,priority,label,detail)=>{if(!tasks.some(task=>task.code===code))tasks.push({code,priority,label,detail});};
  const pendingTasks=[
   ['PRODUCTION_COST_INCOMPLETE','COMPLETE_PRODUCTION_COSTS','Cadastrar custos das unidades vendidas','Confirme o vínculo de cada variação e o custo de produção; quantidade sem custo não equivale a custo zero.'],
   ['RETURNS_NOT_RECONCILED','RECONCILE_RETURNS','Conciliar devoluções e reembolsos','Confirme os valores efetivos de devolução e reembolso antes de liberar a estimativa mensal.'],
   ['PAYMENT_INCOMPLETE','COMPLETE_PAYMENT_COVERAGE','Completar os dados de pagamento','Releia os pagamentos dos pedidos pagos sem cobertura; subtotal conhecido não representa o total do mês.'],
   ['FINANCIAL_SOURCE_STALE','REFRESH_FINANCIAL_SOURCE','Atualizar a leitura financeira','Atualize os dados financeiros do mês e confirme os horários das fontes.'],
   ['FINANCIAL_SOURCE_TIMESTAMPS_REQUIRED','REFRESH_FINANCIAL_SOURCE','Atualizar a leitura financeira','Atualize os dados financeiros do mês e confirme os horários das fontes.'],
   ['SOURCE_UNAVAILABLE','RESTORE_FINANCIAL_SOURCE','Restabelecer a fonte financeira','Conclua uma leitura válida da fonte financeira antes de revisar o resultado do mês.'],
   ['TAX_POLICY_REQUIRED','DECLARE_MONTHLY_DAS','Confirmar o DAS mensal do MEI','Declare o DAS da competência; o imposto mensal não deve ser substituído por uma porcentagem das vendas.'],
   ['INVOICE_TAX_UNAVAILABLE','DECLARE_MONTHLY_DAS','Confirmar o DAS mensal do MEI','Declare o DAS da competência; o imposto mensal não deve ser substituído por uma porcentagem das vendas.'],
   ['EXTERNAL_EXPENSES_REQUIRED','DECLARE_EXTERNAL_EXPENSES','Declarar despesas externas','Confirme o total de despesas externas, inclusive quando o valor for explicitamente zero.'],
   ['RECHARGE_TREATMENT_REQUIRED','CONFIRM_RECHARGE_TREATMENT','Classificar os ajustes de recarga','Confirme se o desconto no repasse foi recarga de Ads ou suporte técnico para evitar dupla contabilização.'],
   ['ADJUSTMENT_UNAVAILABLE','RECONCILE_PAYMENT_ADJUSTMENTS','Conciliar os ajustes do repasse','Obtenha os ajustes completos dos pagamentos e revise eventuais valores negativos antes de calcular o saldo.'],
   ['STATUS_REVIEW_REQUIRED','RECONCILE_ORDER_STATUS','Revisar situações dos pedidos','Concilie cancelamentos pendentes e situações desconhecidas antes de liberar a estimativa.'],
   ['COLLECTING','COMPLETE_MONTH_COLLECTION','Concluir a coleta do mês','Conclua todas as janelas do período; valores parciais não representam o mês completo.'],
   ['PERIOD_LIMIT_REACHED','REVIEW_PERIOD_COVERAGE','Revisar a cobertura do período','Resolva o limite de coleta antes de usar os subtotais como resultado mensal.'],
   ['ADS_UNAVAILABLE','REFRESH_CALENDAR_ADS','Completar o gasto real de Ads','Leia todos os dias do mesmo período financeiro; dias ausentes não equivalem a gasto zero.'],
   ['ARITHMETIC_UNSAFE','REVIEW_ARITHMETIC','Revisar os limites dos valores','O cálculo excedeu a representação monetária segura; revise a origem dos valores.'],
  ];
  for(const [pending,code,label,detail] of pendingTasks)if(conditions.includes(pending))addTask(code,'HIGH',label,detail);
  if(net!==null&&net<0)addTask('REVIEW_MONTHLY_LOSS','HIGH','Revisar a perda mensal estimada','Revise custos, repasses, despesas e gasto de Ads antes de propor qualquer aumento de investimento.');
  if(net===0)addTask('REVIEW_BREAK_EVEN','MEDIUM','Revisar o ponto de equilíbrio','A estimativa está no ponto de equilíbrio; confirme os dados e a margem antes de propor investimento adicional.');
  addTask('CHECK_STOCK_AND_CAMPAIGN',net>0?'MEDIUM':'LOW','Conferir estoque e campanhas antes de decidir','Valide estoque disponível, atribuição por produto e campanha e limites próprios de Ads. Este diagnóstico não autoriza execução nem aumento de orçamento.');
  const gaps=[
   'O repasse é esperado; recebimentos liquidados e reembolsos efetivos ainda precisam de conciliação.',
   'O gasto de Ads é do calendário; não há atribuição validada por SKU e campanha neste diagnóstico.',
   'Estoque disponível e limites de investimento em Ads ainda precisam de validação.',
  ];
  if(!month.product_summary)gaps.push('A cobertura de custos por quantidade vendida depende do resumo validado de produtos.');
  else if(month.product_summary.mixed_orders>0)gaps.push('Pedidos com vários produtos não permitem atribuir repasse ou margem individual sem conciliação.');
  return {
   schema:'account_diagnosis_v1',month:month.month,start_date:month.start_date,end_date:month.end_date,checked_at:month.checked_at,
   status:conditions.length===0&&net!==null?'READY_FOR_REVIEW':'BLOCKED',actual_profit_cents:null,execution:'READ_ONLY',basis:month.result.basis,
   metrics:{paid_store_sales_cents:month.sales_cents,ads_spend_cents:adsSpend,tacos_bps:tacos,available_before_ads_cents:beforeAds,net_estimate_cents:net,net_margin_bps:net!==null?month.result.net_margin_bps:null,recharge_addback_cents:rechargeAddback,paid_orders:month.coverage.paid,payment_covered_orders:month.coverage.payment_covered,payment_missing_orders:month.coverage.payment_missing,returns_pending_orders:month.coverage.returns+month.coverage.returns_unknown,costed_quantity:costedQuantity,total_quantity:totalQuantity,cost_coverage_bps:costCoverage},
   conditions,tasks:tasks.slice(0,15),
   limits:[
    'Somente leitura: nenhuma alteração em orçamento, ROAS alvo, campanha ou anúncio.',
    'Os limites de análises do assistente não são limites de investimento em Ads.',
    'A estimativa combina pedidos pagos do mês de criação e Ads do calendário; não representa lucro realizado.',
   ],gaps,
  };
 }catch{return null;}
}
 function buildMonthlyFinancialSummary(frame){
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const read=(value,key)=>plain(value)?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
 const int=(value,signed=false)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&(signed||value>=0);
 const array=value=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=3000&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(field=>field&&Object.hasOwn(field,'value'));
 const safe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
 const codes=['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','TAX_POLICY_REQUIRED','FINANCIAL_SOURCE_STALE'];
 const output={schema:'monthly_financial_summary_v1',state:'WAITING',balance_cents:null,before_production_cents:null,known_production_cents:null,production_complete:false,costs_after_payout_cents:null,production_coverage:{total_units:null,known_units:null,pending_units:0,pending_variants:0,pending_products:0},pending:[],basis:'PAID_MONTH_CURRENT_COSTS_AFTER_ADS_TAX_EXPENSES'};
 const arithmetic=()=>{if(!output.pending.includes('ARITHMETIC_UNSAFE'))output.pending.push('ARITHMETIC_UNSAFE');output.balance_cents=output.before_production_cents=output.costs_after_payout_cents=null;output.state='WAITING';return output;};
 try{
  if(!plain(frame))return output;
  const result=read(frame,'result'),pending=read(result,'pending'),knownProduction=read(frame,'known_production_cost_cents'),production=read(frame,'production_cost_cents');
  if(!array(pending)||pending.length>codes.length||new Set(pending).size!==pending.length||!pending.every(code=>codes.includes(code)))return output;
  output.pending=[...pending];output.known_production_cents=int(knownProduction)?knownProduction:null;
  const unmapped=read(frame,'unmapped_variants');if(!array(unmapped))return output;
  const products=new Set(),variants=new Set();let missing=0n;
  for(const row of unmapped){
   const quantity=read(row,'quantity'),item=read(row,'item_id'),model=read(row,'model_id');
   if(!int(quantity)||quantity<1||typeof item!=='string'||!/^[1-9][0-9]{0,19}$/.test(item)||typeof model!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(model)||variants.has(item+':'+model))return arithmetic();
   missing+=BigInt(quantity);products.add(item);variants.add(item+':'+model);
  }
  const missingUnits=safe(missing);if(missingUnits===null)return arithmetic();
  const coverage=output.production_coverage;coverage.pending_units=missingUnits;coverage.pending_variants=variants.size;coverage.pending_products=products.size;
  const summary=read(frame,'product_summary'),rows=read(summary,'products');
  if(rows!==undefined&&rows!==null){
   if(!array(rows))return arithmetic();let total=0n;const identities=new Set();
   for(const row of rows){const quantity=read(row,'quantity'),item=read(row,'item_id');if(!int(quantity)||quantity<1||typeof item!=='string'||identities.has(item))return arithmetic();total+=BigInt(quantity);identities.add(item);}
   const units=safe(total);if(units===null||missing>total)return arithmetic();coverage.total_units=units;coverage.known_units=units-missingUnits;
  }
  const status=read(frame,'status'),orders=read(frame,'coverage'),collection=read(frame,'collection');
  output.production_complete=status==='COMPLETE'&&int(production)&&production===knownProduction&&missingUnits===0;
  if(production!==null&&(!int(production)||production!==knownProduction||missingUnits>0))return arithmetic();
  if(status!=='COMPLETE'||!plain(orders)||read(orders,'payment_missing')!==0||['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','ARITHMETIC_UNSAFE'].some(code=>pending.includes(code))||read(collection,'state')==='BLOCKED')return output;
  const countKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
  if(countKeys.some(key=>!int(read(orders,key))||read(orders,key)>3000))return output;
  const c=Object.fromEntries(countKeys.map(key=>[key,read(orders,key)])),review=c.cancel_pending+c.other+c.unknown;
  if(c.orders!==c.paid+c.cancelled+review+c.unpaid||c.paid!==c.completed+c.ongoing||c.payment_covered!==c.paid||c.returns+c.returns_unknown>c.paid||review>0&&!pending.includes('STATUS_REVIEW_REQUIRED')||(c.returns+c.returns_unknown)>0&&!pending.includes('RETURNS_NOT_RECONCILED'))return output;
  const payout=read(frame,'expected_repass_cents'),sales=read(frame,'sales_cents'),tax=read(frame,'invoice_tax_cents'),ads=read(frame,'ads'),expenses=read(frame,'expenses'),adjustment=read(frame,'ads_adjustment_cents'),treatment=read(expenses,'recharge_treatment'),external=read(expenses,'external_expenses_cents'),spend=read(ads,'expense_cents');
  if(!int(payout,true)||payout!==read(frame,'known_expected_repass_cents')||!int(sales)||sales!==read(frame,'known_sales_cents')||!int(tax)||!int(knownProduction)||read(ads,'status')!=='AVAILABLE'||!int(spend)||read(ads,'start_date')!==read(frame,'start_date')||read(ads,'end_date')!==read(frame,'end_date')||!int(external)||!int(adjustment)||!['UNCONFIRMED','ADS_RECHARGE','TECH_SUPPORT'].includes(treatment)||adjustment>0&&treatment==='UNCONFIRMED')return output;
  if(['PAYMENT_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','TAX_POLICY_REQUIRED','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE'].some(code=>pending.includes(code)))return output;
  const policy=read(frame,'tax');if(read(policy,'regime')==='MEI'&&(read(policy,'status')!=='DECLARED'||read(policy,'tax_cents')!==tax||read(policy,'monthly_das_cents')!==tax))return output;
  const restore=treatment==='ADS_RECHARGE'?adjustment:0;
  const before=BigInt(payout)+BigInt(restore)-BigInt(tax)-BigInt(spend)-BigInt(external),balance=before-BigInt(knownProduction),costs=BigInt(knownProduction)+BigInt(tax)+BigInt(spend)+BigInt(external);
  const amounts=[safe(before),safe(balance),safe(costs)];if(amounts.some(value=>value===null))return arithmetic();
  const strict=read(result,'net_estimate_cents');if(strict!==null&&(!int(strict,true)||strict!==amounts[1]||!output.production_complete||pending.length))return arithmetic();
  output.before_production_cents=amounts[0];output.balance_cents=amounts[1];output.costs_after_payout_cents=amounts[2];
  output.state=strict!==null?'READY':output.production_complete?'PROVISIONAL':'PARTIAL_COSTS';return output;
 }catch{return arithmetic();}
}
 function projectMonthlyProfitPresentation(frame,projectMonthlyFrame,buildSummary){
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
 function projectMonthlyProfitPresentationValue(value){
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
 function projectBusinessCostDiagnostics(value){
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
 function projectBusinessCostDiagnosticsEvidence(value,validators={}){
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
 function projectBusinessCostDiagnosticsEvidenceV2(value,validators={}){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const int=(row,signed=false)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&(signed||row>=0);
 try{
  if(!exact(validators,['projectDiagnostic','projectHistory','projectBalance','projectBackground'])||!Object.values(validators).every(fn=>typeof fn==='function')||!exact(value,['schema','diagnostic','history','recorded_balance','background'])||value.schema!=='business_cost_diagnostics_evidence_v2')return null;
  const diagnostic=validators.projectDiagnostic(value.diagnostic),history=validators.projectHistory(value.history),balance=validators.projectBalance(value.recorded_balance),background=validators.projectBackground(value.background);
  if(!diagnostic||!history||!balance||!background||history.schema!=='historical_cost_pair_diagnostics_v2'||background.month!==diagnostic.month||background.checked_at!==diagnostic.diagnosed_at||history.month!==diagnostic.month||history.checked_at!==diagnostic.diagnosed_at||history.truncation.pairs_total!==diagnostic.truncation.variants_total)return null;
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
  const projected={schema:'business_cost_diagnostics_evidence_v2',diagnostic,history,recorded_balance:balance,background};
  return new TextEncoder().encode(JSON.stringify(projected)).byteLength<=262144?projected:null;
 }catch{return null;}
}
 function projectBusinessCostDiagnosticsEvidenceV3(value,validators={},expected=null){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const read=(row,key)=>plain(row)?Object.getOwnPropertyDescriptor(row,key)?.value:undefined;
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const array=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,i)=>Object.getOwnPropertyDescriptor(rows,String(i))).every(field=>field&&Object.hasOwn(field,'value'));
 const int=(row,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
 const id=(row,zero=false)=>typeof row==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(row);
 const versionKeys=['bindings','costs','cost_rules','classifications','expenses','tax_policy'];
 const coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
 const sourceKeys=['finance_oldest_at','finance_latest_at','ads_at'];
 try{
  if(!exact(validators,['projectEvidenceV2','projectScope'])||!Object.values(validators).every(fn=>typeof fn==='function')||!exact(value,['schema','diagnostic','history','recorded_balance','background','display_source','audit_scope','versions'])||value.schema!=='business_cost_diagnostics_evidence_v3'||!['PUBLISHED','ACTIVE'].includes(value.display_source)||!exact(value.versions,versionKeys))return null;
  const evidence=validators.projectEvidenceV2({schema:'business_cost_diagnostics_evidence_v2',diagnostic:value.diagnostic,history:value.history,recorded_balance:value.recorded_balance,background:value.background});if(!evidence)return null;
  const diagnostic=evidence.diagnostic,versions=value.versions,summary=diagnostic.summary,totals=diagnostic.totals;
  // A later read may change availability, but it must never change the
  // arithmetic of a subtotal that this particular snapshot does expose.
  const hasAmounts=summary.balance_cents!==null,amountFields=['balance_cents','before_production_cents','costs_after_payout_cents'];
  if(amountFields.some(key=>(summary[key]!==null)!==hasAmounts)||hasAmounts!==(summary.state!=='WAITING')||summary.known_production_cents!==totals.known_production_cost_cents)return null;
  if(hasAmounts){
   const keys=['expected_repass_cents','known_production_cost_cents','invoice_tax_cents','ads_spend_cents','external_expenses_cents','recharge_addback_cents'];
   if(!keys.every(key=>int(totals[key],key==='expected_repass_cents'?Number.MIN_SAFE_INTEGER:0))||diagnostic.status!=='COMPLETE'||diagnostic.coverage.payment_missing!==0||diagnostic.collection?.state==='BLOCKED'||['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','PAYMENT_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','TAX_POLICY_REQUIRED','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE'].some(code=>diagnostic.pending.includes(code))||summary.pending.length!==diagnostic.pending.length||!summary.pending.every(code=>diagnostic.pending.includes(code)))return null;
   const costs=BigInt(totals.known_production_cost_cents)+BigInt(totals.invoice_tax_cents)+BigInt(totals.ads_spend_cents)+BigInt(totals.external_expenses_cents),before=BigInt(totals.expected_repass_cents)+BigInt(totals.recharge_addback_cents)-costs+BigInt(totals.known_production_cost_cents);
   if(BigInt(summary.before_production_cents)!==before||BigInt(summary.balance_cents)!==before-BigInt(totals.known_production_cost_cents)||BigInt(summary.costs_after_payout_cents)!==costs||summary.state!==(totals.net_estimate_cents!==null?'READY':summary.production_complete?'PROVISIONAL':'PARTIAL_COSTS'))return null;
  }
  if(totals.net_estimate_cents!==null&&(!hasAmounts||summary.state!=='READY'||!summary.production_complete||diagnostic.pending.length!==0||totals.net_estimate_cents!==summary.balance_cents))return null;
  for(const key of ['bindings','costs'])if(!int(versions[key],1,2147483647))return null;
  for(const key of ['cost_rules','classifications'])if(versions[key]!==null&&!int(versions[key],1,2147483647))return null;
  if(!int(versions.expenses,0,2147483646)||versions.tax_policy!==null&&!int(versions.tax_policy,0,2147483647)||['bindings','costs','cost_rules','classifications'].some(key=>versions[key]!==diagnostic.versions.monthly[key]))return null;
  let scope=null;
  if(value.display_source==='PUBLISHED'){
   scope=validators.projectScope(value.audit_scope);
   if(!scope||diagnostic.status!=='COMPLETE'||scope.start_date!==diagnostic.start_date||scope.end_date!==diagnostic.end_date)return null;
  }else if(value.audit_scope!==null)return null;
  if(expected!==null){
   if(!exact(expected,['monthly','audit_scope']))return null;
   const monthly=expected.monthly,expenses=read(monthly,'expenses'),tax=read(monthly,'tax'),coverage=read(monthly,'coverage'),sources=read(monthly,'source_checked_at'),result=read(monthly,'result'),pending=read(result,'pending');
   if(read(monthly,'schema')!=='business_month_v1'||!['month','start_date','end_date','status'].every(key=>read(monthly,key)===diagnostic[key])||!exact(expenses,['revision','external_expenses_cents','recharge_treatment','updated_at'])||!exact(coverage,coverageKeys)||!array(pending,20)||pending.some(code=>typeof code!=='string')||new Set(pending).size!==pending.length)return null;
   const expectedVersions={bindings:read(monthly,'bindings_revision'),costs:read(monthly,'costs_revision'),cost_rules:read(monthly,'cost_rules_revision')??null,classifications:read(monthly,'classification_revision')??null,expenses:expenses.revision,tax_policy:read(tax,'policy_revision')??null};
   if(versionKeys.some(key=>versions[key]!==expectedVersions[key])||coverageKeys.some(key=>coverage[key]!==diagnostic.coverage[key]))return null;
   if(scope===null){if(expected.audit_scope!==null)return null;}
   else{
    const expectedScope=validators.projectScope(expected.audit_scope);
    if(!expectedScope||JSON.stringify(scope)!==JSON.stringify(expectedScope))return null;
   }
   // The check time may advance while all source observations remain the
   // same. Preserve every substantive pending condition, including a ledger
   // draft that keeps the old aggregate amount and expense revision intact.
   const relevant=rows=>rows.filter(code=>code!=='FINANCIAL_SOURCE_STALE').sort(),left=relevant(pending),right=relevant(diagnostic.pending);
   if(left.length!==right.length||left.some((code,index)=>code!==right[index]))return null;
   const ads=read(monthly,'ads'),expectedSources=sources===undefined?{finance_oldest_at:null,finance_latest_at:null,ads_at:read(ads,'fetched_at')??null}:sources;
   if(!exact(expectedSources,sourceKeys)||sourceKeys.some(key=>expectedSources[key]!==diagnostic.source_checked_at[key]))return null;
   const fields=['sales_cents','known_sales_cents','expected_repass_cents','known_expected_repass_cents','production_cost_cents','known_production_cost_cents','invoice_tax_cents','ads_adjustment_cents'];
   if(fields.some(key=>read(monthly,key)!==diagnostic.totals[key])||diagnostic.totals.external_expenses_cents!==expenses.external_expenses_cents||diagnostic.totals.ads_spend_cents!==(read(ads,'status')==='AVAILABLE'?read(ads,'expense_cents'):null))return null;
   const adjustment=read(monthly,'ads_adjustment_cents'),restore=adjustment===null||adjustment<0?null:adjustment===0||expenses.recharge_treatment==='TECH_SUPPORT'?0:expenses.recharge_treatment==='ADS_RECHARGE'?adjustment:null;
   if(diagnostic.totals.recharge_addback_cents!==restore||diagnostic.summary.known_production_cents!==read(monthly,'known_production_cost_cents'))return null;
   const unmapped=read(monthly,'unmapped_variants');if(!array(unmapped,3000))return null;
   const pairs=new Map(),products=new Set();let missing=0n;
   for(const row of unmapped){
    if(!exact(row,['item_id','model_id','quantity'])||!id(row.item_id)||!id(row.model_id,true)||!int(row.quantity,1))return null;
    const key=row.item_id+':'+row.model_id;if(pairs.has(key))return null;pairs.set(key,row.quantity);products.add(row.item_id);missing+=BigInt(row.quantity);
   }
   if(missing>BigInt(Number.MAX_SAFE_INTEGER)||diagnostic.truncation.variants_total!==pairs.size||diagnostic.truncation.products_total!==products.size||diagnostic.summary.production_coverage.pending_units!==Number(missing)||diagnostic.summary.production_coverage.pending_variants!==pairs.size||diagnostic.summary.production_coverage.pending_products!==products.size||diagnostic.products.some(product=>product.variants.some(variant=>pairs.get(product.item_id+':'+variant.model_id)!==variant.quantity)))return null;
   const rows=read(read(monthly,'product_summary'),'products');let total=null,known=null;
   if(rows!==undefined){
    if(!array(rows,3000))return null;let units=0n;const seen=new Set();
    for(const row of rows){const item=read(row,'item_id'),quantity=read(row,'quantity');if(!id(item)||!int(quantity,1)||seen.has(item))return null;seen.add(item);units+=BigInt(quantity);}
    if(units>BigInt(Number.MAX_SAFE_INTEGER)||units<missing)return null;total=Number(units);known=Number(units-missing);
   }
   if(diagnostic.summary.production_coverage.total_units!==total||diagnostic.summary.production_coverage.known_units!==known||diagnostic.summary.production_complete!==(diagnostic.status==='COMPLETE'&&read(monthly,'production_cost_cents')!==null&&missing===0n))return null;
  }
  const projected={schema:'business_cost_diagnostics_evidence_v3',diagnostic,history:evidence.history,recorded_balance:evidence.recorded_balance,background:evidence.background,display_source:value.display_source,audit_scope:scope,versions:{...versions}};
  return new TextEncoder().encode(JSON.stringify(projected)).byteLength<=262144?projected:null;
 }catch{return null;}
}
 function projectHistoricalCostPairDiagnosticsEvidence(value,{deriveComposition,projectLegacy}={}){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row)),exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const array=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,index)=>Object.getOwnPropertyDescriptor(rows,String(index))).every(field=>field&&Object.hasOwn(field,'value'));
 const string=(row,max)=>typeof row==='string'&&row.trim().length>0&&new TextEncoder().encode(row).byteLength<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(row),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),clip=(input,max)=>{let result='';for(const character of input){if(new TextEncoder().encode(result+character).byteLength>max)break;result+=character;}return result;};
 const composition=row=>{const adult=['P','M','G','GG','G1','G2','G3'];return exact(row,['kind','size','male_size','female_size','child_size'])&&(row.kind==='ADULT_SINGLE'&&adult.includes(row.size)&&row.male_size===null&&row.female_size===null&&row.child_size===null||row.kind==='CHILD_SINGLE'&&['2','4','6','8','10','12','14','16'].includes(row.child_size)&&row.size===null&&row.male_size===null&&row.female_size===null||row.kind==='EXPLICIT_COUPLE_KIT'&&adult.includes(row.male_size)&&adult.includes(row.female_size)&&row.size===null&&row.child_size===null);};
 const descriptor=row=>Object.fromEntries(['kind','size','male_size','female_size','child_size'].map(key=>[key,row[key]]));
 try{
  if(typeof deriveComposition!=='function'||typeof projectLegacy!=='function'||!exact(value,['schema','month','checked_at','pairs','truncation'])||value.schema!=='historical_cost_pair_diagnostics_v2'||!array(value.pairs,90))return null;
  const legacyPairs=[];
  for(const row of value.pairs){
   const oldKeys=['item_id','model_id','state','reason','approved','provenance','item_name','model_name','name_flags','composition','first_checked_at','last_checked_at','scan'];
   if(!exact(row,[...oldKeys,'item_names','model_names','resolution'])||!array(row.item_names,5)||!array(row.model_names,5)||!row.item_names.every(name=>string(name,1024))||!row.model_names.every(name=>string(name,512))||new Set(row.item_names).size!==row.item_names.length||new Set(row.model_names).size!==row.model_names.length||!exact(row.name_flags,['missing_item_name','missing_model_name','conflict','overflow'])||!Object.values(row.name_flags).every(flag=>typeof flag==='boolean'))return null;
   const n=row.name_flags,r=row.resolution;
   if(!exact(r,['kind','compositions','combinations','reason'])||!['EXACT_COMPOSITION','COST_CANDIDATES','CONFLICT'].includes(r.kind)||!array(r.compositions,25)||!r.compositions.every(composition)||!Number.isSafeInteger(r.combinations)||r.combinations<0||r.combinations>25||!['EXACT_NAMES','SEMANTIC_COMPOSITION_CONSENSUS','DIFFERENT_COMPOSITIONS','UNSUPPORTED_ALTERNATIVE','INCOMPLETE_METADATA','UNAPPROVED_SCAN','NO_OBSERVATION'].includes(r.reason))return null;
   if(row.item_name!==(row.item_names.length===1?clip(row.item_names[0],256):null)||row.model_name!==(row.model_names.length===1?clip(row.model_names[0],128):null)||!n.conflict&&(row.item_names.length>1||row.model_names.length>1||n.overflow))return null;
   const incomplete=n.overflow||n.missing_item_name||n.missing_model_name||!row.item_names.length||!row.model_names.length||n.conflict&&row.item_names.length===1&&row.model_names.length===1,combinations=row.item_names.length*row.model_names.length,found=new Map();let invalid=false;
   if(!incomplete)for(const title of row.item_names)for(const label of row.model_names){const parsed=deriveComposition(title,label);if(!composition(parsed)){invalid=true;continue;}const candidate=descriptor(parsed);found.set(JSON.stringify(candidate),candidate);}
   const candidates=[...found.values()].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));if(new Set(candidates.map(candidate=>candidate.kind)).size>1)invalid=true;
   if(r.kind==='CONFLICT'){
    if(row.approved||r.compositions.length||!['UNSUPPORTED_ALTERNATIVE','INCOMPLETE_METADATA','UNAPPROVED_SCAN','NO_OBSERVATION'].includes(r.reason))return null;
    if(r.reason==='NO_OBSERVATION'&&(row.provenance!==null||row.item_names.length||row.model_names.length||r.combinations!==0)||r.reason==='UNAPPROVED_SCAN'&&(row.provenance!=='HISTORICAL_ORDER_EVIDENCE'||r.combinations!==0)||r.reason==='INCOMPLETE_METADATA'&&(!incomplete||r.combinations!==0)||r.reason==='UNSUPPORTED_ALTERNATIVE'&&(incomplete||!invalid||r.combinations!==combinations))return null;
   }else{
    if(incomplete||invalid||!candidates.length||!row.approved||row.provenance!=='HISTORICAL_ORDER_EVIDENCE'||r.combinations!==combinations||!same(r.compositions,candidates))return null;
    if(r.kind==='EXACT_COMPOSITION'&&(candidates.length!==1||row.state!=='APPROVED'||!same(row.composition,candidates[0])||r.reason!==(combinations===1?'EXACT_NAMES':'SEMANTIC_COMPOSITION_CONSENSUS')||row.reason!==(combinations===1?'UNANIMOUS_SUPPORTED_NAMES':'SEMANTIC_COMPOSITION_CONSENSUS')))return null;
    if(r.kind==='COST_CANDIDATES'&&(candidates.length<2||row.state!=='COST_CANDIDATES'||row.reason!=='DIFFERENT_SUPPORTED_COMPOSITIONS'||row.composition!==null||r.reason!=='DIFFERENT_COMPOSITIONS'))return null;
   }
   const legacy=Object.fromEntries(oldKeys.map(key=>[key,row[key]]));
   if(row.state==='COST_CANDIDATES'||row.state==='APPROVED'&&n.conflict)Object.assign(legacy,{state:'CONFLICT',reason:'RECORDED_NAMES_CONFLICT',approved:false,composition:null});
   legacyPairs.push(legacy);
  }
  if(!projectLegacy({...value,schema:'historical_cost_pair_diagnostics_v1',pairs:legacyPairs})||new TextEncoder().encode(JSON.stringify(value)).byteLength>65536)return null;
  return JSON.parse(JSON.stringify(value));
 }catch{return null;}
}
 function deriveHistoricalCostComposition(itemName,modelName){
 const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&new TextEncoder().encode(value).byteLength<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);
 const normalize=value=>value.normalize('NFKD').replace(/\p{M}/gu,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim(),adultSizes=new Set(['P','M','G','GG','G1','G2','G3']),childSizes=new Set(['2','4','6','8','10','12','14','16']);
 if(!text(itemName,1024)||!text(modelName,512))return null;
 const title=normalize(itemName),model=normalize(modelName),words=new Set(title.split(' ')),labels=model.split(' '),sizes=labels.filter(word=>adultSizes.has(word)),numbers=labels.filter(word=>/^\d+$/.test(word));
 // A split plus-size label must never fall back to regular G. Without a
 // structured size axis, G + a separate digit remains ambiguous evidence.
 if(/\bG\s+[123]\b/.test(model))return null;
 const shirt=['CAMISETA','CAMISETAS'].some(word=>words.has(word)),forbidden=['CALCA','CALCAS','BAGGY','SHORT','SHORTS','BERMUDA','BERMUDAS','MOLETOM','MOLETONS','VESTIDO','BODY','REGATA','PET','PETS','CACHORRO','GATO','CANINO','FELINO','BONECA','BONECAS','PACK','PACOTE','LOTE','TRIO','FAMILIA'];
 if(!shirt||forbidden.some(word=>words.has(word)||labels.includes(word)))return null;
 const child=['INFANTIL','INFANTIS','KIDS','CRIANCA','CRIANCAS','INFANTO'].some(word=>words.has(word)),kit=['KIT','KITS','COMBO','COMBOS','CONJUNTO','CONJUNTOS','CASAL','CASAIS','DUPLA','PAR'].some(word=>words.has(word));
 const countNames={DUAS:2,DOIS:2,TRES:3,QUATRO:4,CINCO:5,SEIS:6,SETE:7,OITO:8,NOVE:9,DEZ:10,VINTE:20},counts=[...((title+' '+model).matchAll(/\b(\d+|DUAS|DOIS|TRES|QUATRO|CINCO|SEIS|SETE|OITO|NOVE|DEZ|VINTE)\s+(?:CAMISETAS?|PECAS?|UNIDADES?)\b/g))].map(match=>countNames[match[1]]??Number(match[1]));
 if(counts.some(count=>!Number.isSafeInteger(count)||count>=2&&(!kit||count!==2))||!kit&&words.has('CAMISETAS'))return null;
 const empty={size:null,male_size:null,female_size:null,child_size:null};
 if(child){
  if(kit||words.has('ADULTO')||words.has('ADULTA')||sizes.length||numbers.length!==1||!childSizes.has(numbers[0])||['ADULTO','ADULTA','PET','KIT','COMBO'].some(word=>labels.includes(word)))return null;
  return {kind:'CHILD_SINGLE',...empty,child_size:numbers[0]};
 }
 if(['BEBE','BEBES','BABY','JUVENIL'].some(word=>words.has(word)))return null;
 if(['INFANTIL','INFANTIS','KIDS','CRIANCA','CRIANCAS','BEBE','BEBES','INFANTO'].some(word=>labels.includes(word)))return null;
 if(kit){
  const explicitTitle=(words.has('CASAL')||words.has('CASAIS')||['MASCULINO','MASCULINA','HOMEM'].some(word=>words.has(word))&&['FEMININO','FEMININA','MULHER'].some(word=>words.has(word)))&&['KIT','KITS','COMBO','COMBOS','CONJUNTO','CONJUNTOS'].some(word=>words.has(word));
  if(!explicitTitle||sizes.length!==2||numbers.some(number=>number!=='2')||/\b[3-9]\s+(?:CAMISETAS?|PECAS?|UNIDADES?)\b/.test(title))return null;
  const male=[...model.matchAll(/\b(?:HOMEM|MASCULINO|MASCULINA|MASC)\s+(?:(?:TAMANHO|TAM)\s+)?(G[123]|GG|P|M|G)\b/g)],female=[...model.matchAll(/\b(?:MULHER|FEMININO|FEMININA|FEM)\s+(?:(?:TAMANHO|TAM)\s+)?(G[123]|GG|P|M|G)\b/g)];
  if(male.length!==1||female.length!==1)return null;
  return {kind:'EXPLICIT_COUPLE_KIT',...empty,male_size:male[0][1],female_size:female[0][1]};
 }
 if(sizes.length!==1||numbers.some(number=>childSizes.has(number))||/\b(?:2|3|4|5|6|7|8|9)\s+(?:CAMISETAS?|PECAS?|UNIDADES?)\b/.test(title))return null;
 return {kind:'ADULT_SINGLE',...empty,size:sizes[0]};
}
 function projectBackgroundCollectionDiagnostics(value){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const integer=(row,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
 const array=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,i)=>Object.getOwnPropertyDescriptor(rows,String(i))).every(field=>field&&Object.hasOwn(field,'value'));
 const month=row=>typeof row==='string'&&/^(?:[2-9][0-9]{3})-(0[1-9]|1[0-2])$/.test(row);
 const day=row=>typeof row==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row)&&Number.isFinite(Date.parse(row+'T00:00:00Z'))&&new Date(row+'T00:00:00Z').toISOString().slice(0,10)===row;
 const nullableTime=(row,max=9999999999)=>row===null||integer(row,1,max);
 const statuses=['IDLE','RUNNING','COMPLETE','PARTIAL','LIMIT_REACHED','ERROR','PAUSED'];
 const errors=['BUSINESS_SYNC_COLLECTION_UNAVAILABLE','BUSINESS_SYNC_RESULT_INVALID','BUSINESS_SYNC_ADS_INCOMPLETE','BUSINESS_SYNC_PERIOD_LIMIT_REACHED','BUSINESS_SYNC_SOURCE_RATE_LIMIT','BUSINESS_SYNC_SOURCE_TIMEOUT','BUSINESS_SYNC_SOURCE_AUTH_REQUIRED','BUSINESS_SYNC_SOURCE_INVALID','BUSINESS_SYNC_SOURCE_PERMISSION_DENIED'];
 const codes=['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','TAX_POLICY_REQUIRED','FINANCIAL_SOURCE_STALE'];
 const watermark=(row,at)=>exact(row,['finance_oldest_at','finance_latest_at','ads_at'])&&Object.values(row).every(value=>nullableTime(value,at+60))&&(row.finance_oldest_at===null)===(row.finance_latest_at===null)&&(row.finance_oldest_at===null||row.finance_oldest_at<=row.finance_latest_at);
 try{
  if(!exact(value,['schema','month','checked_at','planned','trigger_observation','sync','lane','cohort','recent_finance_runs'])||value.schema!=='background_collection_diagnostic_v1'||!month(value.month)||!integer(value.checked_at,1,9999999999)||value.trigger_observation!=='NOT_RECORDED'||!exact(value.planned,['cron','running_interval_seconds','complete_interval_seconds','financial_freshness_seconds'])||value.planned.cron!=='* * * * *'||value.planned.running_interval_seconds!==60||value.planned.complete_interval_seconds!==300||value.planned.financial_freshness_seconds!==900)return null;
  const sync=value.sync;
  if(sync!==null){
   if(!exact(sync,['enabled','status','month','next_run_at','last_attempt_at','last_success_at','failure_count','last_error','lease_active','lease_expires_at','summary'])||typeof sync.enabled!=='boolean'||!statuses.includes(sync.status)||sync.month!==null&&!month(sync.month)||!integer(sync.next_run_at,0,9999999999)||!nullableTime(sync.last_attempt_at,value.checked_at+60)||!nullableTime(sync.last_success_at,value.checked_at+60)||!integer(sync.failure_count,0,1000000)||sync.last_error!==null&&!errors.includes(sync.last_error)||typeof sync.lease_active!=='boolean'||!nullableTime(sync.lease_expires_at)||sync.lease_active!==(sync.lease_expires_at!==null&&sync.lease_expires_at>value.checked_at))return null;
   const summary=sync.summary;
   if(summary!==null){
    if(!exact(summary,['status','checked_at','source_checked_at','progress','pending'])||!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(summary.status)||!integer(summary.checked_at,1,value.checked_at+60)||!watermark(summary.source_checked_at,summary.checked_at)||!exact(summary.progress,['windows_total','windows_complete','pages_read','order_capacity'])||!integer(summary.progress.windows_total,1,3)||!integer(summary.progress.windows_complete,0,summary.progress.windows_total)||!integer(summary.progress.pages_read,0,600)||!integer(summary.progress.order_capacity,summary.progress.pages_read*5,summary.progress.pages_read*20)||(summary.progress.order_capacity-summary.progress.pages_read*5)%15!==0||!array(summary.pending,codes.length)||new Set(summary.pending).size!==summary.pending.length||!summary.pending.every(code=>codes.includes(code)))return null;
   }
  }
  const lane=value.lane;
  if(lane!==null&&(!exact(lane,['revision','next_group','next_auxiliary','lease_active','lease_expires_at','analysis_attempt_day'])||!integer(lane.revision,1,2147483646)||!['FINANCE','AUXILIARY'].includes(lane.next_group)||!['HISTORY','CATALOG','REGISTRY','PRODUCTION','COSTS'].includes(lane.next_auxiliary)||typeof lane.lease_active!=='boolean'||!nullableTime(lane.lease_expires_at)||lane.lease_active!==(lane.lease_expires_at!==null&&lane.lease_expires_at>value.checked_at)||lane.analysis_attempt_day!==null&&!day(lane.analysis_attempt_day)))return null;
  const cohort=value.cohort;
  if(cohort!==null&&(!exact(cohort,['revision','start_date','end_date','app_created_at','app_updated_at','source_oldest_at','source_latest_at'])||!integer(cohort.revision,1,2147483647)||!day(cohort.start_date)||cohort.start_date!==value.month+'-01'||!day(cohort.end_date)||!cohort.end_date.startsWith(value.month+'-')||!integer(cohort.app_created_at,1,value.checked_at+60)||!integer(cohort.app_updated_at,cohort.app_created_at,value.checked_at+60)||!nullableTime(cohort.source_oldest_at,value.checked_at+60)||!nullableTime(cohort.source_latest_at,value.checked_at+60)||(cohort.source_oldest_at===null)!==(cohort.source_latest_at===null)||cohort.source_oldest_at!==null&&cohort.source_oldest_at>cohort.source_latest_at))return null;
  if(!array(value.recent_finance_runs,8))return null;let previous=Number.MAX_SAFE_INTEGER;
  for(const run of value.recent_finance_runs){
   if(!exact(run,['status','started_at','finished_at','finance_steps','ads_reads','error_code','pages_read','orders_seen'])||!statuses.includes(run.status)||!integer(run.started_at,1,value.checked_at+60)||!integer(run.finished_at,run.started_at,value.checked_at+60)||run.started_at>previous||!integer(run.finance_steps,0,4)||!integer(run.ads_reads,0,1)||run.error_code!==null&&!errors.includes(run.error_code)||run.pages_read!==null&&!integer(run.pages_read,0,600)||run.orders_seen!==null&&!integer(run.orders_seen,0,3000))return null;previous=run.started_at;
  }
  const payload=JSON.stringify(value);if(new TextEncoder().encode(payload).byteLength>14*1024)return null;return JSON.parse(payload);
 }catch{return null;}
}
 function projectHistoricalCostPairDiagnostics(value){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const int=(row,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
 const array=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,index)=>Object.getOwnPropertyDescriptor(rows,String(index))).every(field=>field&&Object.hasOwn(field,'value'));
 const identifier=(row,zero=false)=>typeof row==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(row);
 const text=(row,max)=>row===null||typeof row==='string'&&new TextEncoder().encode(row).byteLength<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(row);
 const time=row=>row===null||int(row,1,value.checked_at+60),states=['NO_SCAN','SCANNING','NOT_FOUND','NAME_MISSING','CONFLICT','COMPOSITION_REJECTED','APPROVED'],reasons=['NO_MATCHING_MONTH_SCAN','SCAN_NOT_COMPLETE','EXACT_PAIR_NOT_IN_COMPLETED_SCAN','RECORDED_NAMES_MISSING','RECORDED_NAMES_CONFLICT','RECORDED_NAMES_NOT_SUPPORTED','UNANIMOUS_SUPPORTED_NAMES','APPROVAL_PENDING','OBSERVATION_OUTSIDE_COMPLETED_SCAN'];
 try{
  if(!exact(value,['schema','month','checked_at','pairs','truncation'])||value.schema!=='historical_cost_pair_diagnostics_v1'||typeof value.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||!int(value.checked_at,1,9999999999)||!array(value.pairs,90))return null;
  const seen=new Set();for(const row of value.pairs){
   if(!exact(row,['item_id','model_id','state','reason','approved','provenance','item_name','model_name','name_flags','composition','first_checked_at','last_checked_at','scan'])||!identifier(row.item_id)||!identifier(row.model_id,true)||seen.has(row.item_id+':'+row.model_id)||!states.includes(row.state)||!reasons.includes(row.reason)||typeof row.approved!=='boolean'||![null,'HISTORICAL_ORDER_EVIDENCE'].includes(row.provenance)||!text(row.item_name,256)||!text(row.model_name,128)||!exact(row.name_flags,['missing_item_name','missing_model_name','conflict','overflow'])||!Object.values(row.name_flags).every(flag=>typeof flag==='boolean')||!time(row.first_checked_at)||!time(row.last_checked_at)||(row.first_checked_at===null)!==(row.last_checked_at===null)||row.first_checked_at!==null&&row.first_checked_at>row.last_checked_at)return null;
   const c=row.composition;if(c!==null){const adult=['P','M','G','GG','G1','G2','G3'];if(!exact(c,['kind','size','male_size','female_size','child_size'])||!['ADULT_SINGLE','CHILD_SINGLE','EXPLICIT_COUPLE_KIT'].includes(c.kind)||![c.size,c.male_size,c.female_size].every(size=>size===null||adult.includes(size))||c.child_size!==null&&!['2','4','6','8','10','12','14','16'].includes(c.child_size)||c.kind==='ADULT_SINGLE'&&(!adult.includes(c.size)||[c.male_size,c.female_size,c.child_size].some(size=>size!==null))||c.kind==='CHILD_SINGLE'&&(c.child_size===null||[c.size,c.male_size,c.female_size].some(size=>size!==null))||c.kind==='EXPLICIT_COUPLE_KIT'&&(!adult.includes(c.male_size)||!adult.includes(c.female_size)||c.size!==null||c.child_size!==null))return null;}
   if(row.approved!==(row.state==='APPROVED')||row.approved!==(c!==null)||row.approved&&(row.provenance!=='HISTORICAL_ORDER_EVIDENCE'||row.item_name===null||row.model_name===null||Object.values(row.name_flags).some(Boolean)))return null;
   const s=row.scan;if(s!==null&&(!exact(s,['status','start_date','end_date','window_index','windows_total','pages_read','checked_at','retry_after_seconds','running','observed_pair'])||!['RUNNING','COMPLETE','RETRY_WAIT','LIMIT_REACHED'].includes(s.status)||s.start_date!==value.month+'-01'||typeof s.end_date!=='string'||!new RegExp('^'+value.month+'-(0[1-9]|[12][0-9]|3[01])$').test(s.end_date)||!int(s.windows_total,1,3)||!int(s.window_index,0,s.windows_total)||!int(s.pages_read,0,600)||!time(s.checked_at)||!int(s.retry_after_seconds,0,1800)||typeof s.running!=='boolean'||typeof s.observed_pair!=='boolean'))return null;
   if(row.state==='NOT_FOUND'&&(s?.status!=='COMPLETE'||s.observed_pair||row.provenance!==null))return null;seen.add(row.item_id+':'+row.model_id);
  }
  const t=value.truncation;if(!exact(t,['truncated','pairs_total','pairs_included'])||typeof t.truncated!=='boolean'||!int(t.pairs_total,0,3000)||t.pairs_included!==value.pairs.length||t.pairs_total<t.pairs_included||t.truncated!==(t.pairs_total>t.pairs_included))return null;
  return new TextEncoder().encode(JSON.stringify(value)).byteLength<=65536?JSON.parse(JSON.stringify(value)):null;
 }catch{return null;}
}
 function projectRecordedBusinessBalance(value){
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
 function buildRecordedBusinessBalance(frame){
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
 const clientContract='business-month-v2';
 const el=id=>document.getElementById('businessMonth'+id);
 const node=(tag,text,cls)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(cls)value.className=cls;return value;};
 function openDetails(details,focus=null){if(!details)return false;details.open=true;details.scrollIntoView?.({behavior:'smooth',block:'start'});(focus||details.querySelector?.('summary'))?.focus?.({preventScroll:true});return true;}
 function openExpenses(){if(typeof globalThis.brazaExpenseLedger?.open==='function')return globalThis.brazaExpenseLedger.open(month);openDetails(el('ExpensesDetails'));return globalThis.brazaExpenseLedger?.refresh?.()??false;}
 function openCollectionStatus(){const target=!el('CollectionState')?.hidden?el('CollectionState'):el('RefreshHelp');if(!target)return false;target.setAttribute('tabindex','-1');target.scrollIntoView?.({behavior:'smooth',block:'center'});target.focus?.({preventScroll:true});return true;}
 function pendingAction(code){
  if(['EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED'].includes(code))return ['Conferir despesas',openExpenses];
  if(code==='PRODUCTION_COST_INCOMPLETE')return ['Ver produtos com pendências',()=>{el('ProductSearch').value='';el('ProductFilter').value='pending';productPage=1;drawProducts();return openDetails(el('ProductsDetails'),el('ProductFilter'));}];
  if(['STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED','ADJUSTMENT_UNAVAILABLE'].includes(code))return ['Conferir pedidos e devoluções',()=>globalThis.brazaReconciliation?.open?.()??false];
  if(['TAX_POLICY_REQUIRED','INVOICE_TAX_UNAVAILABLE'].includes(code))return ['Ver regra do imposto',()=>{openDetails(el('CalculationDetails'));const target=el('TaxSummary');target?.setAttribute('tabindex','-1');target?.scrollIntoView?.({behavior:'smooth',block:'center'});target?.focus?.({preventScroll:true});return !!target;}];
  if(['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','PAYMENT_INCOMPLETE','FINANCIAL_SOURCE_STALE','ADS_UNAVAILABLE'].includes(code))return ['Ver andamento da coleta',openCollectionStatus];
  if(code==='ARITHMETIC_UNSAFE')return ['Conferir dados salvos',()=>checkCostDiagnostic()];
  return null;
 }
 function drawPending(warnings,ads){
  const target=el('PendingList'),selected=month,shownActions=new Set();target.replaceChildren();
  for(const code of warnings){const item=node('li',undefined,'month-pending-task');item.dataset.pending=code;item.append(node('span',code==='ADS_UNAVAILABLE'&&ads?.status==='AVAILABLE'?savedAdsHelp(ads):pendingMessages[code]||'Parte dos dados ainda precisa ser conferida.'));
   if(['SOURCE_UNAVAILABLE','PAYMENT_INCOMPLETE','FINANCIAL_SOURCE_STALE','ADS_UNAVAILABLE'].includes(code)&&cronOwnsCollection()&&workspaceView?.collection.status==='RUNNING')item.append(node('small','Há uma coleta automática em andamento. Os dados salvos mantêm seus horários até a conclusão.','month-pending-progress'));
   const action=pendingAction(code);if(action&&!shownActions.has(action[0])){shownActions.add(action[0]);const button=node('button',action[0],'button-link month-pending-action');button.type='button';button.disabled=busy||adsBusy||saving;button.onclick=()=>started&&selected===month&&frame?action[1]():false;item.append(button);}target.append(item);
  }
 }
 const pendingMessages={COLLECTING:'A consulta dos pedidos do mês ainda está em andamento.',PERIOD_LIMIT_REACHED:'A quantidade de pedidos ultrapassou o limite desta consulta. O mês permanece parcial.',SOURCE_UNAVAILABLE:'A Shopee não concluiu parte da leitura. Atualize o mês para retomar.',STATUS_REVIEW_REQUIRED:'Há pedidos em cancelamento, em devolução ou com uma situação que ainda precisa ser conferida.',PAYMENT_INCOMPLETE:'A Shopee ainda não informou todos os valores financeiros dos pedidos pagos. Esses pedidos não são tratados como valor zero.',RETURNS_NOT_RECONCILED:'Há devoluções ou pedidos sem informação suficiente de devolução. Falta conciliar seus valores.',PRODUCTION_COST_INCOMPLETE:'Há produtos sem composição ou custo completo. A identificação automática preserva os vínculos já salvos.',INVOICE_TAX_UNAVAILABLE:'O valor do imposto ainda não está disponível para concluir o mês.',TAX_POLICY_REQUIRED:'O DAS-MEI deste ano ainda não está cadastrado. O imposto permanece pendente, sem usar 2% por nota.',FINANCIAL_SOURCE_STALE:'Os pedidos e repasses precisam de uma nova leitura. O resultado permanece em conferência até a atualização financeira.',ADS_UNAVAILABLE:'O gasto de anúncios ainda não foi confirmado para todos os dias do mês.',EXTERNAL_EXPENSES_REQUIRED:'Confira as despesas deste mês em “Despesas” e confirme o total para usá-lo no resultado.',RECHARGE_TREATMENT_REQUIRED:'Confira se o ajuste financeiro corresponde a recarga de anúncios ou taxa de suporte.',ADJUSTMENT_UNAVAILABLE:'O ajuste financeiro de anúncios ou suporte ainda não foi informado por completo.',ARITHMETIC_UNSAFE:'Um valor excedeu o limite seguro de cálculo e não será apresentado como resultado.'};
 const money=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100):'Pendente';
 const ratio=value=>value===null||value===undefined?'Pendente':new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value))+'x';
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
 const validMonth=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&value>='2000-01'&&value<=today().slice(0,7);
 const monthName=value=>validMonth(value)?new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T12:00:00Z')):'mês selecionado';
 const sourceAge=value=>{if(!Number.isSafeInteger(value)||value<=0)return 'pendente';const minutes=Math.max(0,Math.floor((Date.now()-value*1000)/60000));return minutes<1?'há menos de 1 minuto':minutes<60?'há '+minutes+' minuto(s)':minutes<1440?'há '+Math.floor(minutes/60)+' hora(s)':'há '+Math.floor(minutes/1440)+' dia(s)';};
 const snapshotListeners=new Set();
 let presentationFrame=null,presentationCache=null,monthlyPartialAction=null;
 let api=null,syncVariants=null,onCatalogChanged=null,frame=null,month='',generation=0,busy=false,adsBusy=false,saving=false,started=false,paused=false,dirty=false,editSequence=0,draftRevision=0,timer=null,message='',failed=false;
 let bootstrapPrepared=false,bootstrapCompleted=false,bootstrapPhase='LOADING',bootstrapRetry=null,bootstrapRetryPending=false,bootstrapFailureKind='INVALID';
 const bootstrapFailureMessages={TIMEOUT:'A consulta demorou mais que o esperado. Tente novamente.',NETWORK:'Não foi possível conectar ao painel. Verifique a conexão e tente novamente.',SESSION:'Sua sessão expirou. Entre novamente.',QUOTA:'O painel está indisponível porque o limite diário do banco de dados foi atingido. A cota é renovada todos os dias às 21h (horário de Brasília).',UNAVAILABLE:'O painel está temporariamente indisponível. Tente novamente em alguns instantes.',INVALID:'Não foi possível abrir o painel. Tente novamente.'};
 let productPage=1,productMonth='';
 let workspaceView=null,variantContributionContext=null,viewRequest=0,viewPromise=null,viewFailures=0,manualCollection=false,priorityPromise=null;
 const cronOwnsCollection=()=>workspaceView?.automatic.applicable===true&&workspaceView.automatic.enabled===true;
 const financeRefreshInterval=300000;
 let lastFinancialRefreshAt=0,automaticBlocked=false,resumeOnVisible=false,adsFailures=0,adsRetryAt=0;
 let collectionFailure=null,collectionRecovery=null;
 const productOpen=new Set();
 let catalogState=null,catalogBusy=false,catalogTimer=null,catalogRequest=0,catalogNeedsRead=true,catalogError='',catalogPaused=false,catalogProductsChanged=false,catalogVisibleIds=[],catalogSignature='';
 const catalogProducts=new Map();
 let costDiagnosticContext=null,costDiagnostic=null,costDiagnosticEvidence=null,costDiagnosticRaw='',costDiagnosticBusy=false,costDiagnosticRequest=0,costDiagnosticPromise=null;
 const catalogFeature=()=>Number.isSafeInteger(frame?.classification_revision);
 const catalogMessages={CATALOG_NOT_READ:'Aguardando a consulta automática do catálogo.',CATALOG_UNAVAILABLE:'A consulta falhou; a fila tentará este produto novamente.',CATALOG_REQUEST_FAILED:'A consulta falhou; os outros produtos continuam na fila.',UNRECOGNIZED_TYPE:'O tipo deste produto ainda não foi reconhecido com segurança.',SIZE_AMBIGUOUS:'O tamanho da variação precisa de conferência.',RULE_CONFLICT:'Mais de uma regra de custo corresponde a esta variação.',NO_COST_REGISTERED:'Falta cadastrar um custo para este tipo de produto.',RULE_NOT_MATCHED:'Nenhuma regra de custo reconhece este tipo e tamanho com segurança.',RULE_ASSIGNMENT_PENDING:'A regra de custo informada precisa de conferência de tamanho ou disponibilidade.',UNRECOGNIZED_VARIATION:'O catálogo não identificou o tipo e o tamanho desta variação com segurança.',INDEX_NOT_VALID:'A combinação de opções desta variação precisa ser conferida no catálogo.',NO_MODELS:'O catálogo não retornou variações para este produto.',CATALOG_CONFLICT:'Outra atualização está conferindo este produto; a fila continuará automaticamente.',CATALOG_STALE_RESPONSE:'Uma resposta antiga foi descartada. A fila consultará novamente.',AXES_NOT_RECOGNIZED:'Os eixos de variação não identificam a composição com segurança.',OPTION_NOT_RECOGNIZED:'O tamanho retornado pelo catálogo ainda não foi reconhecido.',CATALOG_INVALID:'Os dados do catálogo não passaram na conferência.',CATALOG_STALE:'A classificação salva está preservada enquanto o catálogo é atualizado.'};
 function catalogReason(reason,status){return catalogMessages[reason]||(status==='QUEUED'||status==='RUNNING'?'A identificação automática está na fila.':status==='RETRY_WAIT'?'A consulta será repetida automaticamente, sem impedir os outros produtos.':'O catálogo precisa de uma conferência de tipo ou tamanho.');}
 const costDiagnosticReasons={COST_AVAILABLE:'O custo já está disponível na versão atual.',NO_CATALOG:'O catálogo deste produto ainda não foi consultado.',MODEL_NOT_IN_CATALOG:'A variação vendida ainda não consta no catálogo salvo.',METADATA_CHANGED:'O produto mudou na Shopee e precisa de uma nova conferência.',RULE_DISABLED:'A regra de custo associada está desativada.',RULE_UNAVAILABLE:'A regra de custo associada não está disponível.',ASSIGNMENT_PENDING:'O tipo ou tamanho associado precisa de correção.',CONFLICT:'Há regras ou composições conflitantes.',OPTION_NOT_RECOGNIZED:'O tamanho do catálogo ainda não foi reconhecido.',AXES_NOT_RECOGNIZED:'As opções do produto não identificam a composição com segurança.',INDEX_NOT_VALID:'A combinação de opções precisa ser conferida.',NO_MODELS:'O catálogo não retornou as variações deste produto.',RULE_NOT_MATCHED:'Nenhuma regra de custo corresponde ao tipo e tamanho.',COMPOSITION_PENDING:'Falta identificar a composição e o custo deste produto.'};
 function costHistoryEvidence(itemId,variant){
  const history=costDiagnosticEvidence?.history;if(!history)return null;
  const pair=history.pairs.find(row=>row.item_id===itemId&&row.model_id===variant.model_id),entry=node('div',undefined,'month-detail-help');
  if(!pair){entry.append(node('p',history.truncation.truncated?'O histórico desta variação não foi incluído neste diagnóstico parcial.':'Não há evidência histórica incluída para esta variação.'));return entry;}
  const labels={NO_SCAN:'O histórico desta variação ainda não foi conferido.',SCANNING:'A conferência do histórico desta variação está em andamento.',NOT_FOUND:'Esta variação não apareceu no intervalo de pedidos já conferido.',NAME_MISSING:'O pedido antigo não contém todos os nomes necessários para identificar a composição.',CONFLICT:'Os nomes encontrados nos pedidos antigos divergem. O custo permanece pendente.',COMPOSITION_REJECTED:'Os nomes dos pedidos antigos não identificam uma composição aceita com segurança.',COST_CANDIDATES:'Foram encontrados tamanhos diferentes. O custo só pode ser aplicado automaticamente quando todas as opções têm o mesmo custo cadastrado, sem escolher um tamanho.',APPROVED:'A composição foi identificada pelos nomes dos pedidos antigos.'};
  const reasons={OBSERVATION_OUTSIDE_COMPLETED_SCAN:'Os nomes salvos vieram de outra conferência e ainda precisam ser verificados neste intervalo.',APPROVAL_PENDING:'A variação apareceu nos pedidos, mas falta concluir a conferência dos nomes.'};entry.append(node('p','Histórico · '+(reasons[pair.reason]||labels[pair.state])));
  if(Array.isArray(pair.item_names)&&Array.isArray(pair.model_names)){
   for(const [label,names] of [['Nomes do produto registrados',pair.item_names],['Nomes da variação registrados',pair.model_names]]){entry.append(node('p',label+':'));if(names.length){const alternatives=node('ul');for(const name of names)alternatives.append(node('li',name));entry.append(alternatives);}else entry.append(node('p','Não informado nos pedidos conferidos.'));}
   if(pair.resolution?.reason==='SEMANTIC_COMPOSITION_CONSENSUS')entry.append(node('p','As diferenças de escrita identificam a mesma composição. Os nomes originais foram preservados.'));
  }else if(pair.item_name||pair.model_name)entry.append(node('p',[pair.item_name,pair.model_name].filter(Boolean).join(' · ')));
  if(pair.approved&&variant.unit_cost_cents===null)entry.append(node('p','A evidência foi encontrada, mas o custo ainda depende das referências e regras atuais. Nenhum preço foi presumido.'));
  if(pair.scan){const scan=pair.scan;entry.append(node('p','Pedidos de '+scan.start_date+' a '+scan.end_date+' · '+scan.window_index+' de '+scan.windows_total+' intervalo(s) · '+scan.pages_read+' página(s) conferida(s).'+(scan.status==='RETRY_WAIT'?' Nova tentativa em até '+scan.retry_after_seconds+' segundo(s).':scan.running?' A leitura continuará automaticamente.':scan.status==='LIMIT_REACHED'?' A leitura atingiu o limite e permanece parcial.':'')+' Leitura: '+checkpointTime(scan.checked_at)+'.'));}
  return entry;
 }
 function costBackgroundEvidence(){
  const value=costDiagnosticEvidence?.background;if(!value)return null;
  const detail=node('details',undefined,'month-detail-help');detail.append(node('summary','Acompanhamento automático'));
  detail.append(node('p','A agenda prevê consultas a cada minuto durante a coleta e a cada cinco minutos após a conclusão. Os registros abaixo mostram tentativas locais; não confirmam os disparos da agenda externa.'));
  if(value.sync){const sync=value.sync,states={IDLE:'Aguardando próxima leitura',RUNNING:'Leitura em andamento',COMPLETE:'Última coleta concluída',PARTIAL:'Coleta parcial',LIMIT_REACHED:'Limite desta leitura atingido',ERROR:'Uma tentativa precisa ser repetida',PAUSED:'Coleta pausada'};detail.append(node('p','Mês da coleta automática: '+(sync.month||'não definido')+'. '+(sync.enabled?'Coleta automática ativa. ':'Coleta automática pausada. ')+(states[sync.status]||'Estado em conferência')+'. Última tentativa: '+checkpointTime(sync.last_attempt_at)+' · último avanço concluído: '+checkpointTime(sync.last_success_at)+' · próxima consulta prevista: '+checkpointTime(sync.next_run_at)+'.'));if(sync.lease_active)detail.append(node('p','Outra consulta possui uma reserva ativa até '+checkpointTime(sync.lease_expires_at)+'.'));}else detail.append(node('p','Não há estado local de coleta disponível para esta conferência.'));
  if(value.lane){const fronts={HISTORY:'nomes de pedidos antigos',CATALOG:'variações dos produtos',REGISTRY:'listagem de produtos',PRODUCTION:'produção',COSTS:'referências de custo'};detail.append(node('p','Próxima frente prevista: '+(value.lane.next_group==='FINANCE'?'financeiro':fronts[value.lane.next_auxiliary])+'.'+(value.lane.lease_active?' Uma consulta possui reserva ativa até '+checkpointTime(value.lane.lease_expires_at)+'.':'')));}
  if(value.cohort){const cohort=value.cohort;detail.append(node('p','Leitura atual iniciada em '+checkpointTime(cohort.app_created_at)+' · intervalo '+cohort.start_date+' a '+cohort.end_date+'. Primeira fonte financeira: '+checkpointTime(cohort.source_oldest_at)+' · última fonte: '+checkpointTime(cohort.source_latest_at)+'.'));
  }
  if(value.recent_finance_runs.length){const list=node('ul');for(const run of value.recent_finance_runs)list.append(node('li','Tentativa em '+checkpointTime(run.started_at)+' · '+(run.status==='COMPLETE'?'concluída':run.status==='RUNNING'?'em andamento':'em conferência')+' · '+run.finance_steps+' etapa(s) financeira(s) · '+run.ads_reads+' leitura(s) de anúncios · '+(run.pages_read===null?'':run.pages_read)+(run.pages_read===null?' páginas não informadas':' página(s)')+' · '+(run.orders_seen===null?'quantidade de pedidos não informada':run.orders_seen+' pedido(s) observados')+'.'));detail.append(list);}
  detail.append(node('p','Estado local conferido em '+checkpointTime(value.checked_at)+'.'));return detail;
 }
 function costDiagnosticHasDue(value){return value?.consistent===true&&value.products.some(product=>product.variants.some(variant=>variant.recoverable||['NO_CATALOG','MODEL_NOT_IN_CATALOG'].includes(variant.reason)));}
 function drawCostDiagnostic(){
  const value=costDiagnostic,target=el('CostDiagnosticBody');if(!value||value.month!==month){target.hidden=true;return;}target.hidden=false;const coverage=value.summary.production_coverage,out=[node('p',value.status==='COMPLETE'?coverage.pending_units+' unidade(s) sem custo · '+coverage.pending_variants+' variação(ões) · '+coverage.pending_products+' produto(s).':'Consulta mensal parcial · '+value.coverage.paid+' pedido(s) pagos já lidos · produção identificada '+money(value.totals.known_production_cost_cents)+'. As quantidades finais dependem da conclusão do período.','month-detail-help')];
  if(costDiagnosticEvidence?.schema==='business_cost_diagnostics_evidence_v3')out.push(node('p',costDiagnosticEvidence.display_source==='PUBLISHED'?'Conferência vinculada à atualização financeira exibida, com suas referências de custos e despesas.':'Conferência de uma coleta ainda sem publicação concluída. A conclusão do período continua pendente.','month-detail-help'));else out.push(node('p','Formato anterior de diagnóstico: não contém uma identidade verificável da publicação financeira.','month-detail-help'));
  const counts=node('div',undefined,'month-cost-diagnostic-counts');for(const [key,label] of [['IN_CANCEL','Em cancelamento'],['TO_RETURN','Em devolução'],['UNKNOWN_STATUS','Situação desconhecida']])counts.append(node('span',label+': '+value.review_counts[key]));out.push(counts);
  if(!value.consistent)out.push(node('p','Os custos mudaram durante a conferência. As versões abaixo foram preservadas; recalcule novamente antes de concluir.','month-detail-help'));
  for(const product of value.products){const card=node('article',undefined,'month-cost-diagnostic-product');card.append(node('h4',product.product_name||'Produto #'+product.item_id),node('p','#'+product.item_id+' · catálogo: '+checkpointTime(product.catalog_checked_at)));const classification=product.classification,labels={QUEUED:'Na fila',RUNNING:'Em consulta',MATCHED:'Catálogo identificado',PARTIAL:'Identificação parcial',REVIEW:'Tipo ou tamanho em conferência',RETRY_WAIT:'Aguardando nova tentativa'};
   card.append(node('p',classification?labels[classification.status]+(classification.status==='RETRY_WAIT'?' · próxima tentativa: '+checkpointTime(classification.next_attempt_at):classification.status==='RUNNING'?' · aguarde a consulta em andamento.':''):'Aguardando a primeira consulta do catálogo.'));
   const groups=new Map();for(const variant of product.variants){if(!groups.has(variant.reason))groups.set(variant.reason,[]);groups.get(variant.reason).push(variant);}for(const [reason,variants] of groups){const quantity=variants.reduce((sum,row)=>sum+BigInt(row.quantity),0n),list=node('ul');card.append(node('p',new Intl.NumberFormat('pt-BR').format(quantity)+' unidade(s) · '+variants.length+' variação(ões) · '+costDiagnosticReasons[reason]));for(const variant of variants){const label=variant.model_name||'Variação #'+variant.model_id,attributes=variant.attributes.map(row=>row.name+': '+row.value).join(' · '),item=node('li',label+' · '+variant.quantity+' unidade(s)'+(attributes?' · '+attributes:'')+(variant.unit_cost_cents!==null?' · custo unitário '+money(variant.unit_cost_cents):''));if(variant.assignment)item.append(node('span',' · regra '+variant.assignment.rule_id+(variant.assignment.size?' · tamanho '+variant.assignment.size:'')));const history=costHistoryEvidence(product.item_id,variant);if(history)item.append(history);list.append(item);}card.append(list);}
   if(product.variants.some(variant=>variant.recoverable))card.append(node('p','Há dados de catálogo que podem ser consultados pela conferência automática.'));else if(value.consistent&&product.variants.some(variant=>['NO_CATALOG','MODEL_NOT_IN_CATALOG'].includes(variant.reason)))card.append(node('p','O histórico de pedidos pode confirmar esta variação sem repetir o catálogo em espera.'));else if(product.variants.some(variant=>variant.reason!=='COST_AVAILABLE')&&classification?.status!=='RUNNING'&&classification?.status!=='RETRY_WAIT')card.append(node('p','Confira o tipo, o tamanho ou o custo cadastrado. Repetir uma consulta não resolve uma composição ambígua.'));out.push(card);
  }
  const background=costBackgroundEvidence();if(background)out.push(background);
  if(!value.products.length)out.push(node('p',value.status==='COMPLETE'?'Não há produtos sem custo neste diagnóstico. As outras pendências do período continuam identificadas acima.':'Nenhum produto sem custo entre os itens já lidos. O mês permanece parcial enquanto a coleta continua.','month-detail-help'));
  const versionText=versions=>'custos v'+(versions.costs??'—')+' · regras v'+(versions.cost_rules??'—')+' · vínculos v'+(versions.bindings??'—')+' · catálogo v'+(versions.classifications??'—');out.push(node('p','Conferência: '+checkpointTime(value.diagnosed_at)+' · financeiro: '+checkpointTime(value.source_checked_at.finance_oldest_at)+' · anúncios: '+checkpointTime(value.source_checked_at.ads_at)+' · referências atuais: '+versionText(value.versions.current)+'.'+(value.consistent?'':' Referências do mês: '+versionText(value.versions.monthly)+'.'),'month-cost-diagnostic-sources'));
  if(value.truncation.truncated)out.push(node('p','Diagnóstico parcial: '+value.truncation.products_included+' de '+value.truncation.products_total+' produto(s) e '+value.truncation.variants_included+' de '+value.truncation.variants_total+' variação(ões) incluídos. Nenhuma ausência foi tratada como custo zero.','month-detail-help'));target.replaceChildren(...out);
 }
 function costDiagnosticControls(){const unavailable=!started||!frame||busy||adsBusy||saving||costDiagnosticBusy;el('CostCheck').disabled=unavailable;el('CostRecover').disabled=unavailable||!frame?.unmapped_variants.length;el('CostCopy').disabled=!started||costDiagnosticBusy||!costDiagnosticRaw;el('CostRecover').textContent=costDiagnosticBusy?'Conferindo custos…':'Conferir custos automaticamente';}
 function clearCostDiagnostic(message='Confira todos os produtos sem custo e as situações dos pedidos em uma única consulta aos dados salvos.'){costDiagnostic=null;costDiagnosticEvidence=null;costDiagnosticRaw='';el('CostDiagnosticBody').replaceChildren();el('CostDiagnosticBody').hidden=true;el('CostDiagnosticStatus').textContent=message;el('CostCopy').disabled=true;}
 function resetCostDiagnostic({clear=false}={}){costDiagnosticRequest++;costDiagnosticBusy=false;costDiagnosticPromise=null;if(clear){costDiagnosticContext=null;clearCostDiagnostic();}}
 function projectCostEvidenceV2(value){return projectBusinessCostDiagnosticsEvidenceV2(value,{projectDiagnostic:projectBusinessCostDiagnostics,projectHistory:row=>projectHistoricalCostPairDiagnosticsEvidence(row,{deriveComposition:deriveHistoricalCostComposition,projectLegacy:projectHistoricalCostPairDiagnostics}),projectBalance:projectRecordedBusinessBalance,projectBackground:projectBackgroundCollectionDiagnostics});}
 function projectCostEvidenceV3(value,expected=null){return projectBusinessCostDiagnosticsEvidenceV3(value,{projectEvidenceV2:projectCostEvidenceV2,projectScope:projectBusinessMonthAuditScope},expected);}
 function currentCostEvidence(evidence){return !!costDiagnosticContext&&evidence?.schema==='business_cost_diagnostics_evidence_v3'&&projectCostEvidenceV3(evidence,costDiagnosticContext)!==null;}
 function revalidateCostDiagnostic(){
  if(!costDiagnosticRaw)return;
  if(costDiagnosticEvidence?.schema==='business_cost_diagnostics_evidence_v3'?currentCostEvidence(costDiagnosticEvidence):workspaceView?.schema==='business_month_view_v1'&&!manualCollection)return;
  clearCostDiagnostic('O resumo ou suas referências mudaram. Confira novamente as pendências para usar a mesma atualização financeira.');
 }
 function takeCostDiagnostic(raw,selected,{defer=false}={}){
  const schema=Object.getOwnPropertyDescriptor(raw||{},'schema')?.value,evidence=schema==='business_cost_diagnostics_evidence_v3'?projectCostEvidenceV3(raw):schema==='business_cost_diagnostics_evidence_v2'?projectCostEvidenceV2(raw):schema==='business_cost_diagnostics_evidence_v1'?projectBusinessCostDiagnosticsEvidence(raw,{projectDiagnostic:projectBusinessCostDiagnostics,projectHistory:projectHistoricalCostPairDiagnostics,projectBalance:projectRecordedBusinessBalance}):null,checked=evidence?evidence.diagnostic:projectBusinessCostDiagnostics(raw);
  if(!checked||checked.month!==selected)throw Error('COST_DIAGNOSTIC_INVALID');
  if(defer)return checked;
  const bound=schema==='business_cost_diagnostics_evidence_v3'?currentCostEvidence(evidence):workspaceView?.schema==='business_month_view_v1'&&!manualCollection;
  if(!bound)throw Error('COST_DIAGNOSTIC_CONTEXT_CHANGED');
  costDiagnostic=checked;costDiagnosticEvidence=evidence;costDiagnosticRaw=JSON.stringify(raw,null,2);drawCostDiagnostic();return checked;
 }
 function checkedCostRecovery(raw,selected){const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row)),exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value')),ids=rows=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=90&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,index)=>Object.getOwnPropertyDescriptor(rows,String(index))).every(d=>d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&/^[1-9][0-9]{0,19}$/.test(d.value))&&new Set(rows).size===rows.length;if(!exact(raw,['schema','month','diagnostic','work'])||raw.schema!=='business_cost_recovery_v1'||raw.month!==selected||!exact(raw.work,['status','processed','failed'])||!['PROGRESSED','IDLE','PAUSED','LEASED','RETRY_WAIT'].includes(raw.work.status)||!ids(raw.work.processed)||!ids(raw.work.failed)||raw.work.processed.some(id=>raw.work.failed.includes(id)))throw Error('COST_RECOVERY_INVALID');return {work:raw.work,diagnostic:takeCostDiagnostic(raw.diagnostic,selected,{defer:true}),evidence:raw.diagnostic};}
 async function copyCostDiagnostic(){if(!started||!costDiagnosticRaw)return false;revalidateCostDiagnostic();if(!costDiagnosticRaw)return false;const serialized=costDiagnosticRaw,selected=month,token=generation,current=()=>started&&month===selected&&token===generation&&serialized===costDiagnosticRaw;try{if(typeof globalThis.navigator?.clipboard?.writeText!=='function')throw Error();await globalThis.navigator.clipboard.writeText(serialized);if(current())el('CostDiagnosticStatus').textContent=costDiagnosticEvidence?.schema==='business_cost_diagnostics_evidence_v3'?'Diagnóstico copiado com as referências da atualização financeira exibida.':'Diagnóstico legado copiado, sem identidade verificável da publicação.';return true;}catch{if(current())el('CostDiagnosticStatus').textContent='Não foi possível copiar automaticamente. O diagnóstico continua disponível; tente novamente em uma conexão segura.';return false;}}
 function checkCostDiagnostic({recover=false}={}){
  if(costDiagnosticPromise)return costDiagnosticPromise;if(!started||!frame||busy||adsBusy||saving||!validMonth(month))return Promise.resolve(false);const token=generation,selected=month,requestId=++costDiagnosticRequest,start=Date.now(),current=()=>started&&token===generation&&selected===month&&requestId===costDiagnosticRequest;
  costDiagnosticBusy=true;catalogRequest++;catalogBusy=false;clearTimeout(catalogTimer);catalogTimer=null;clearTimeout(timer);timer=null;controls();el('CostDiagnosticStatus').textContent=recover?'Conferindo os custos salvos e as consultas necessárias…':'Conferindo todas as pendências nos dados salvos…';
  const task=(async()=>{let requests=0,lastStatus=null,localReadFailed=false,contextChanged=false,candidate=null,diagnostic=null;try{
   candidate=await api('finance/cost-diagnostics?month='+encodeURIComponent(selected)+'&evidence=history-v3');if(!current())return false;diagnostic=takeCostDiagnostic(candidate,selected,{defer:recover});
   if(recover){
    for(;requests<8&&Date.now()-start<120000&&!document.hidden;){
     if(!costDiagnosticHasDue(diagnostic))break;el('CostDiagnosticStatus').textContent='Conferindo custos automaticamente · etapa '+(requests+1)+' de até 8. Vínculos manuais são preservados.';
     const result=await api('finance/cost-recovery?evidence=history-v3',{month:selected},{timeoutMs:Math.max(1,Math.min(60000,120000-(Date.now()-start)))});requests++;if(!current())return false;const checked=checkedCostRecovery(result,selected);lastStatus=checked.work.status;diagnostic=checked.diagnostic;candidate=checked.evidence;if(lastStatus!=='PROGRESSED')break;
    }
    if(!current())return false;
    try{const updated=await request('read',selected);if(!current())return false;apply(updated,selected);catalogNeedsRead=true;}catch{if(!current())return false;localReadFailed=true;}
    // Recovery may legitimately change costs. Its result is shown only after
    // the displayed month confirms the same publication and cost references.
    if(!localReadFailed){try{takeCostDiagnostic(candidate,selected);}catch(error){if(error?.message!=='COST_DIAGNOSTIC_CONTEXT_CHANGED')throw error;contextChanged=true;}}
   }
   if(!current())return false;
   el('CostDiagnosticStatus').textContent=contextChanged?'A conferência avançou, mas o resumo e o diagnóstico ainda têm referências diferentes. Recalcule o resumo e confira novamente as pendências.':lastStatus==='PAUSED'?'A conferência automática está pausada nas configurações. Os custos salvos foram preservados.':lastStatus==='LEASED'?'Outra conferência está em andamento. Aguarde alguns segundos; os custos salvos foram preservados.':lastStatus==='RETRY_WAIT'?'Uma fonte precisa aguardar. Confira abaixo o horário da próxima tentativa.':localReadFailed?'A conferência foi concluída, mas o resumo mensal não pôde ser relido. Use Recalcular custos antes de exibir ou copiar o novo diagnóstico.':recover&&document.hidden?'Conferência interrompida porque o painel ficou em segundo plano. Os avanços foram preservados.':recover&&(requests===8||Date.now()-start>=120000)&&costDiagnosticHasDue(diagnostic)?'Esta rodada atingiu o limite de conferências. Os avanços foram preservados e as pendências continuam identificadas abaixo.':recover?'Conferência concluída nesta tentativa. Veja os custos identificados e as pendências que ainda exigem conferência.':costDiagnosticEvidence?.schema==='business_cost_diagnostics_evidence_v3'?'Pendências conferidas com as referências do resumo exibido. Copie o diagnóstico para reunir todos os motivos em uma única mensagem.':'Diagnóstico legado disponível, sem vínculo verificável com uma publicação financeira.';return !contextChanged&&!localReadFailed;
  }catch(error){if(current())el('CostDiagnosticStatus').textContent=error?.message==='COST_DIAGNOSTIC_CONTEXT_CHANGED'?'O diagnóstico pertence a outra atualização ou referência de custos. Recalcule o resumo e confira novamente; os valores exibidos foram preservados.':'Não foi possível concluir esta conferência. Os valores, o diagnóstico anterior e seus rascunhos foram preservados; tente novamente.';return false;}finally{if(current()){costDiagnosticBusy=false;costDiagnosticPromise=null;controls();schedule();scheduleCatalog();}}})();costDiagnosticPromise=task;return task;
 }
 function checkedCatalogState(value){
  const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
  const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
  const array=(row,max)=>Array.isArray(row)&&Object.getPrototypeOf(row)===Array.prototype&&row.length<=max&&Reflect.ownKeys(row).length===row.length+1&&Array.from({length:row.length},(_,index)=>Object.getOwnPropertyDescriptor(row,String(index))).every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'));
  const int=(row,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
  const text=(row,max)=>typeof row==='string'&&row.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(row);
  const reason=row=>row===null||typeof row==='string'&&/^[A-Z][A-Z0-9_]{0,95}$/.test(row);
  const id=(row,zero=false)=>typeof row==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(row);
  const keys=['schema','revision','counts','products','limit','offset','more','next_due_at'];
  if(plain(value)&&Object.hasOwn(value,'enabled'))keys.push('enabled');
  if(plain(value)&&Object.hasOwn(value,'variants_limit_reached'))keys.push('variants_limit_reached');
  const counts=['total','queued','running','matched','partial','review','retry_wait','due'];
  if(!exact(value,keys)||value.schema!=='catalog_classification_state_v1'||!int(value.revision,1,2147483647)||!exact(value.counts,counts)||!counts.every(key=>int(value.counts[key],0,3000000))||value.counts.total!==counts.slice(1,-1).reduce((sum,key)=>sum+value.counts[key],0)||value.counts.due>value.counts.total||!array(value.products,100)||!int(value.limit,1,100)||!int(value.offset,0,3000000)||typeof value.more!=='boolean'||value.next_due_at!==null&&!int(value.next_due_at,0,9999999999)||Object.hasOwn(value,'enabled')&&typeof value.enabled!=='boolean'||Object.hasOwn(value,'variants_limit_reached')&&typeof value.variants_limit_reached!=='boolean')throw Error('CATALOG_STATE_INVALID');
  const seen=new Set();let variantCount=0;
  for(const product of value.products){
   if(!exact(product,['item_id','product_name','status','reason','checked_at','catalog_fingerprint','model_count','resolved_count','next_attempt_at','failure_count','variants','variants_complete'])||!id(product.item_id)||seen.has(product.item_id)||product.product_name!==null&&!text(product.product_name,1024)||!['QUEUED','RUNNING','MATCHED','PARTIAL','REVIEW','RETRY_WAIT'].includes(product.status)||!reason(product.reason)||product.checked_at!==null&&!int(product.checked_at,1,Math.floor(Date.now()/1000)+60)||product.catalog_fingerprint!==null&&(typeof product.catalog_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(product.catalog_fingerprint))||!int(product.model_count,0,1000)||!int(product.resolved_count,0,product.model_count)||product.next_attempt_at!==null&&!int(product.next_attempt_at,0,9999999999)||!int(product.failure_count,0,1000000)||!array(product.variants,1000)||typeof product.variants_complete!=='boolean')throw Error('CATALOG_STATE_INVALID');
   seen.add(product.item_id);variantCount+=product.variants.length;if(variantCount>1000)throw Error('CATALOG_STATE_INVALID');const models=new Set();
   for(const variant of product.variants){if(!exact(variant,['model_id','model_name','reason','attributes'])||!id(variant.model_id,true)||models.has(variant.model_id)||!text(variant.model_name,1024)||!reason(variant.reason)||!array(variant.attributes,10))throw Error('CATALOG_STATE_INVALID');models.add(variant.model_id);for(const attribute of variant.attributes)if(!exact(attribute,['name','value'])||!text(attribute.name,1024)||!text(attribute.value,1024))throw Error('CATALOG_STATE_INVALID');}
  }
  return value;
 }
 function checkedCatalogRun(value){
  const keys=['status','processed','failed','state'];if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'))||!['PAUSED','LEASED','PROGRESSED','IDLE'].includes(value.status))throw Error('CATALOG_STATE_INVALID');
  for(const key of ['processed','failed']){const rows=value[key];if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype||rows.length>3||Reflect.ownKeys(rows).length!==rows.length+1||!Array.from({length:rows.length},(_,index)=>Object.getOwnPropertyDescriptor(rows,String(index))).every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'))||!rows.every(id=>typeof id==='string'&&/^[1-9][0-9]{0,19}$/.test(id))||new Set(rows).size!==rows.length)throw Error('CATALOG_STATE_INVALID');}
  checkedCatalogState(value.state);return value;
 }
 function takeCatalogState(value,{metadataOnly=false}={}){const checked=checkedCatalogState(value);if(!metadataOnly){catalogState=checked;catalogPaused=checked.enabled===false;}else if(checked.enabled===false)catalogPaused=true;for(const product of checked.products)catalogProducts.set(product.item_id,product);while(catalogProducts.size>3000)catalogProducts.delete(catalogProducts.keys().next().value);catalogError='';}
 function drawCatalogStatus(){
  const target=el('CatalogStatus');target.hidden=!catalogFeature();if(target.hidden)return;
  if(catalogError){target.textContent=catalogError;return;}
  if(catalogPaused){target.textContent='Identificação automática pausada nas configurações da coleta. Os custos já cadastrados foram preservados.';return;}
  const remaining=frame?.unmapped_variants.length||0;
  if(catalogBusy)target.textContent='Identificando automaticamente tipos e tamanhos. Os outros produtos continuam na fila se uma consulta falhar.';
  else if(catalogState)target.textContent=remaining?remaining+' variação(ões) vendida(s) ainda sem custo completo. '+catalogState.counts.queued+' produto(s) na fila · '+catalogState.counts.running+' em consulta · '+catalogState.counts.retry_wait+' aguardando nova tentativa.':'Custos dos produtos vendidos identificados. O catálogo continua sendo conferido automaticamente.';
  else target.textContent='Consultando a identificação automática dos produtos vendidos…';
 }
 function canClassify(){return started&&catalogFeature()&&!document.hidden&&!busy&&!adsBusy&&!saving&&!dirty&&!paused&&!costDiagnosticBusy;}
 function scheduleCatalog(delay=0){
  clearTimeout(catalogTimer);catalogTimer=null;if(!canClassify()||catalogBusy)return;
  catalogTimer=setTimeout(()=>{catalogTimer=null;return updateCatalog();},Math.max(0,delay));
 }
 async function loadCatalogMetadata(token,selected){
  const globalState=await api('catalog-classification?limit=1&offset=0');if(token!==catalogRequest||selected!==month||!started)return false;takeCatalogState(globalState);
  // Reuse this bounded metadata read for the M3 month as well as the visible Finance page.
  const visible=catalogVisibleIds.length?catalogVisibleIds:(frame?.unmapped_variants||[]).map(row=>row.item_id);
  const workbenchIds=(frame?.product_summary?.products||[]).slice(0,90).map(row=>row.item_id);
  const ids=[...new Set([...visible,...workbenchIds])].slice(0,90);
  const chunks=ids.length?Array.from({length:Math.ceil(ids.length/90)},(_,index)=>ids.slice(index*90,index*90+90)):[[]];
  for(const chunk of chunks){
   const raw=await api('catalog-classification?limit=100&offset=0'+(chunk.length?'&item_ids='+encodeURIComponent(chunk.join(',')):''));
   if(token!==catalogRequest||selected!==month||!started)return false;takeCatalogState(raw,{metadataOnly:true});
  }
  catalogNeedsRead=false;return true;
 }
 async function updateCatalog({process=true}={}){
  if(cronOwnsCollection())process=false;
  if(!canClassify()||catalogBusy)return false;
  const token=++catalogRequest,selected=month;catalogBusy=true;drawCatalogStatus();let delay=60000;
  try{
   if(catalogNeedsRead||!catalogState){if(!await loadCatalogMetadata(token,selected))return false;}
   if(token!==catalogRequest||selected!==month||!canClassify())return false;
   if(process&&!catalogPaused&&catalogState.counts.due>0){
    const response=await api('catalog-classification/sync',{});
    if(token!==catalogRequest||selected!==month||!started)return false;
    const raw=checkedCatalogRun(response);
    takeCatalogState(raw.state);catalogPaused=catalogPaused||raw.status==='PAUSED';catalogNeedsRead=raw.processed.length+raw.failed.length>0;if(raw.processed.length)catalogProductsChanged=true;if(!canClassify())return false;
    if(raw.processed.length){const reread=await request('read',selected);if(token!==catalogRequest||selected!==month||!started)return false;apply(reread,selected);if(token!==catalogRequest||selected!==month||!canClassify())return false;if(!await loadCatalogMetadata(token,selected))return false;}else if(raw.failed.length&&!await loadCatalogMetadata(token,selected))return false;
    delay=raw.status==='LEASED'?5000:(raw.processed.length+raw.failed.length)>0&&catalogState.counts.due>0?750:60000;
   }
   if(token!==catalogRequest||selected!==month||!canClassify())return false;
   if(catalogState.revision!==frame.classification_revision){const reread=await request('read',selected);if(token!==catalogRequest||selected!==month||!canClassify())return false;apply(reread,selected);}
   if(catalogProductsChanged&&typeof onCatalogChanged==='function'){try{await onCatalogChanged();catalogProductsChanged=false;}catch{}if(token!==catalogRequest||selected!==month||!canClassify())return false;}
   drawProducts();return true;
  }catch{if(token===catalogRequest&&selected===month){catalogError='A consulta do catálogo está indisponível agora. Os custos conhecidos foram preservados; a coleta automática continuará tentando.';catalogNeedsRead=true;}return false;}
  finally{if(token===catalogRequest&&selected===month){catalogBusy=false;drawCatalogStatus();if(catalogPaused)delay=300000;else if(catalogState?.counts.due===0&&catalogState.next_due_at!==null)delay=Math.max(60000,Math.min(300000,catalogState.next_due_at*1000-Date.now()));catalogNeedsRead=true;scheduleCatalog(delay);}}
 }
 async function syncCatalogCandidates(rows){
  if(!catalogFeature())return null;if(!Array.isArray(rows)||rows.length>3000)return false;
  const ids=[...new Set(rows.map(row=>row?.item_id).filter(value=>typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value)))];
  if(!ids.length)return true;
  const token=generation,selected=month,current=()=>!globalThis.mlsCommercialWorkspace||started&&token===generation&&selected===month;
  try{const raw=await api('catalog-classification/enqueue',{item_ids:ids});if(!current())return false;takeCatalogState(raw);catalogNeedsRead=true;drawCatalogStatus();scheduleCatalog();return true;}
  catch{if(current()){catalogError='A fila não pôde ser atualizada agora. Os custos e ajustes salvos foram preservados.';drawCatalogStatus();}return false;}
 }
 let checkpointHistory=null,checkpointHistoryMonth='',checkpointHistoryBusy=false,checkpointHistoryError='',checkpointHistoryStale=false,checkpointHistoryRequest=0;
 const checkpointHistoryOpen=new Set();
 const checkpointVersions=report=>'Custos v'+report.versions.costs+' · vínculos v'+report.versions.bindings+' · regras '+(report.versions.cost_rules===null?'pendentes':'v'+report.versions.cost_rules)+' · '+(report.tax_regime==='MEI'?'DAS-MEI':'imposto anterior')+' '+(report.versions.tax_policy===null?'sem versão':'v'+report.versions.tax_policy)+' · despesas v'+report.versions.expenses+(Number.isSafeInteger(report.versions.classifications)?' · classificações v'+report.versions.classifications:'');
 const checkpointTime=value=>Number.isSafeInteger(value)&&value>0?new Date(value*1000).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Pendente';
 function invalidateCheckpointHistory(){
  checkpointHistoryRequest++;checkpointHistoryBusy=false;checkpointHistoryError='';
  checkpointHistoryStale=!!checkpointHistory;
  if(checkpointHistoryMonth!==month){checkpointHistory=null;checkpointHistoryMonth='';checkpointHistoryStale=false;checkpointHistoryOpen.clear();}
 }
 function drawCheckpoint(){
  const report=frame?buildBusinessCheckpoint(frame):null,target=el('CheckpointEvidence');target.replaceChildren();
  el('CheckpointStatus').textContent=!report?'Aguardando os dados do mês':report.status==='EXPECTED_READY'?'Previsão completa':'Previsão com pendências';
  if(report){
   const entries=[
    ['Resultado previsto',money(report.result.expected_net_cents)],
    ['Pedidos considerados',report.coverage.paid+' pago(s), dos quais '+report.coverage.completed+' concluído(s) e '+report.coverage.ongoing+' em andamento'],
    ['Pedidos excluídos',report.coverage.cancelled+' cancelado(s) e '+report.coverage.unpaid+' não pago(s)'],
    ['Situações em conferência',report.coverage.cancel_pending+' em cancelamento e '+(report.coverage.other+report.coverage.unknown)+' com situação não confirmada'],
    ['Cobertura dos valores financeiros',report.coverage.payment_covered+' de '+report.coverage.paid+' pedido(s) pago(s) · '+report.coverage.payment_missing+' com valores pendentes'],
    ['Devoluções a conferir',report.coverage.returns+' com devolução e '+report.coverage.returns_unknown+' sem informação suficiente'],
    ['Primeira leitura financeira usada',checkpointTime(report.source_checked_at.finance_oldest_at)],
    ['Última leitura financeira usada',checkpointTime(report.source_checked_at.finance_latest_at)],
    ['Gasto dos anúncios consultado em',checkpointTime(report.source_checked_at.ads_at)],
    ['Referências usadas',checkpointVersions(report)],
   ];
   for(const [label,value] of entries){const row=node('div');row.append(node('dt',label),node('dd',value));target.append(row);}
  }
  const list=el('CheckpointHistory');list.replaceChildren();
  el('CheckpointHistoryRefresh').disabled=!frame||checkpointHistoryBusy;
  el('CheckpointHistoryRefresh').textContent=checkpointHistoryBusy?'Consultando…':'Atualizar histórico';
  let historyState='O histórico é consultado quando você abre esta conferência.';
  if(checkpointHistoryBusy)historyState='Consultando os registros deste mês…';
  else if(checkpointHistoryError)historyState=checkpointHistoryError;
  else if(checkpointHistoryStale)historyState='Há uma nova leitura do resumo. Atualize o histórico para conferir os registros mais recentes.';
  else if(checkpointHistory)historyState='Últimas '+checkpointHistory.checkpoints.length+' versão(ões) registradas automaticamente. Até 128 versões são preservadas por mês.';
  el('CheckpointHistoryState').textContent=historyState;
  if(checkpointHistory&&checkpointHistoryMonth===month){
   if(!checkpointHistory.checkpoints.length)list.append(node('li','Ainda não há uma versão registrada para este mês.'));
   for(const entry of checkpointHistory.checkpoints){
    const saved=entry.checkpoint,item=node('li'),details=node('details',undefined,'month-checkpoint-version'),summary=node('summary'),amounts=node('dl',undefined,'month-checkpoint-evidence'),references=node('dl',undefined,'month-checkpoint-evidence');
    summary.append(node('strong','Versão '+entry.revision+' · '+checkpointTime(saved.checked_at)),node('span',saved.status==='EXPECTED_READY'?'Previsão: '+money(saved.result.expected_net_cents):'Previsão em conferência · valores pendentes'));
    const key=saved.month+':'+entry.revision;details.open=checkpointHistoryOpen.has(key);details.ontoggle=()=>{if(details.open)checkpointHistoryOpen.add(key);else checkpointHistoryOpen.delete(key);};
    const labels={EXPECTED_PAYOUT:'Repasse previsto',PRODUCTION:'Custo de produção',TAX:saved.tax_regime==='MEI'?'DAS-MEI mensal':'Imposto estimado',ADS_CONSUMPTION:'Gasto em anúncios',OTHER_EXPENSES:'Outras despesas',ADS_RECHARGE_RESTORE:'Recarga de anúncios reposta'};
    for(const line of saved.lines){const row=node('div'),sign=line.sign===-1?'− ':line.code==='ADS_RECHARGE_RESTORE'?'+ ':'';row.append(node('dt',labels[line.code]),node('dd',line.amount_cents===null?'Pendente':sign+money(line.amount_cents)));amounts.append(row);}
    const resultRow=node('div');resultRow.append(node('dt','Resultado previsto desta versão'),node('dd',money(saved.result.expected_net_cents)));amounts.append(resultRow);
    const evidence=[['Pedidos pagos',saved.coverage.paid+' · '+saved.coverage.completed+' concluído(s) e '+saved.coverage.ongoing+' em andamento'],['Pedidos excluídos',saved.coverage.cancelled+' cancelado(s) e '+saved.coverage.unpaid+' não pago(s)'],['Referências usadas',checkpointVersions(saved)],['Primeira leitura financeira usada',checkpointTime(saved.source_checked_at.finance_oldest_at)],['Última leitura financeira usada',checkpointTime(saved.source_checked_at.finance_latest_at)],['Anúncios consultados em',checkpointTime(saved.source_checked_at.ads_at)]];
    for(const [label,value] of evidence){const row=node('div');row.append(node('dt',label),node('dd',value));references.append(row);}
    details.append(summary,node('p','Valores registrados nesta versão. As deduções da Shopee já estão incluídas no repasse.','month-detail-help'),amounts,references);
    if(saved.pending.length){const pending=node('ul',undefined,'month-checkpoint-version-pending');for(const code of saved.pending)pending.append(node('li',pendingMessages[code]));details.append(pending);}
    else details.append(node('p','Previsão completa com as informações disponíveis nessa leitura. Recebimentos e reembolsos não conciliados.','month-detail-help'));
    item.append(details);list.append(item);
   }
  }
 }
 function checkedCheckpointHistory(value,selected){
  const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
  const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
  const array=(row,max)=>Array.isArray(row)&&Object.getPrototypeOf(row)===Array.prototype&&row.length<=max&&Reflect.ownKeys(row).length===row.length+1&&Array.from({length:row.length},(_,index)=>Object.getOwnPropertyDescriptor(row,String(index))).every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'));
  const int=(row,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
  const amount=(row,signed=false)=>row===null||int(row,signed?Number.MIN_SAFE_INTEGER:0);
  const day=row=>typeof row==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row)&&Number.isFinite(Date.parse(row+'T00:00:00Z'))&&new Date(row+'T00:00:00Z').toISOString().slice(0,10)===row;
  const coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
  const lineCodes=['EXPECTED_PAYOUT','PRODUCTION','TAX','ADS_CONSUMPTION','OTHER_EXPENSES','ADS_RECHARGE_RESTORE'];
  if(!exact(value,['schema','month','retention_limit','checkpoints'])||value.schema!=='business_checkpoint_history_v1'||value.month!==selected||value.retention_limit!==128||!array(value.checkpoints,10))throw Error();
  let previous=Infinity;
  for(const entry of value.checkpoints){
   if(!exact(entry,['revision','fingerprint','checkpoint'])||!int(entry.revision,1,2147483647)||entry.revision>=previous||typeof entry.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(entry.fingerprint))throw Error();
   const report=entry.checkpoint;
   if(!exact(report,['schema','month','start_date','end_date','checked_at','status','coverage','pending','result','lines','sales_cents','versions','source_checked_at','tax_regime','recharge_treatment'])||report.schema!=='business_checkpoint_v1'||report.month!==selected||report.start_date!==selected+'-01'||!day(report.start_date)||!day(report.end_date)||report.end_date.slice(0,7)!==selected||!int(report.checked_at,1,Math.floor(Date.now()/1000)+60)||!['EXPECTED_READY','PENDING'].includes(report.status))throw Error();
   const checkedDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(report.checked_at*1000)),c=report.coverage;
   if(report.end_date>checkedDay||!exact(c,coverageKeys)||!coverageKeys.every(key=>int(c[key],0,3000))||c.orders!==c.paid+c.cancelled+c.cancel_pending+c.unpaid+c.other+c.unknown||c.paid!==c.completed+c.ongoing||c.payment_covered+c.payment_missing!==c.paid||c.returns+c.returns_unknown>c.paid)throw Error();
   if(!array(report.pending,Object.keys(pendingMessages).length)||!report.pending.every(code=>typeof code==='string'&&Object.hasOwn(pendingMessages,code))||new Set(report.pending).size!==report.pending.length||!exact(report.result,['expected_net_cents','realized_net_cents','realization'])||!amount(report.result.expected_net_cents,true)||report.result.realized_net_cents!==null||report.result.realization!=='UNVERIFIED'||!amount(report.sales_cents)||!array(report.lines,6)||report.lines.length!==6)throw Error();
   for(let index=0;index<6;index++){const line=report.lines[index];if(!exact(line,['code','sign','amount_cents'])||line.code!==lineCodes[index]||line.sign!==(index===0||index===5?1:-1)||!amount(line.amount_cents,index===0))throw Error();}
   const versions=report.versions,sources=report.source_checked_at;
   if(!exact(versions,['bindings','costs','cost_rules','tax_policy','expenses',...(Object.hasOwn(versions,'classifications')?['classifications']:[])])||Object.hasOwn(versions,'classifications')&&!int(versions.classifications,1,2147483647)||!int(versions.bindings,1,2147483647)||!int(versions.costs,1,2147483647)||versions.cost_rules!==null&&!int(versions.cost_rules,1,2147483646)||versions.tax_policy!==null&&!int(versions.tax_policy,0,2147483647)||!int(versions.expenses,0,2147483646)||!exact(sources,['finance_oldest_at','finance_latest_at','ads_at'])||!Object.values(sources).every(at=>at===null||int(at,1,report.checked_at))||(sources.finance_oldest_at===null)!==(sources.finance_latest_at===null)||sources.finance_oldest_at!==null&&sources.finance_oldest_at>sources.finance_latest_at)throw Error();
   if(!['MEI','LEGACY_ESTIMATE'].includes(report.tax_regime)||!['UNCONFIRMED','ADS_RECHARGE','TECH_SUPPORT'].includes(report.recharge_treatment)||report.tax_regime==='MEI'&&versions.tax_policy===null||report.tax_regime==='LEGACY_ESTIMATE'&&versions.tax_policy!==null||report.recharge_treatment!=='ADS_RECHARGE'&&report.lines[5].amount_cents!==null&&report.lines[5].amount_cents!==0)throw Error();
   const has=code=>report.pending.includes(code);
   if(c.cancel_pending+c.other+c.unknown>0&&!has('STATUS_REVIEW_REQUIRED')||c.payment_missing>0&&!has('PAYMENT_INCOMPLETE')||c.returns+c.returns_unknown>0&&!has('RETURNS_NOT_RECONCILED')||report.lines[1].amount_cents===null&&!has('PRODUCTION_COST_INCOMPLETE')||report.lines[2].amount_cents===null&&!has('INVOICE_TAX_UNAVAILABLE')||report.lines[3].amount_cents===null&&!has('ADS_UNAVAILABLE')||report.lines[4].amount_cents===null&&!has('EXTERNAL_EXPENSES_REQUIRED')||report.lines[5].amount_cents===null&&!has('ADJUSTMENT_UNAVAILABLE')&&!has('RECHARGE_TREATMENT_REQUIRED')||report.tax_regime==='MEI'&&versions.tax_policy===0&&!has('TAX_POLICY_REQUIRED'))throw Error();
   const stale=report.month===checkedDay.slice(0,7)&&sources.finance_oldest_at!==null&&report.checked_at-sources.finance_oldest_at>900;
   const ready=report.result.expected_net_cents!==null;
   if(stale!==has('FINANCIAL_SOURCE_STALE')||(report.status==='EXPECTED_READY')!==ready||ready&&(report.pending.length||report.sales_cents===null||report.lines.some(line=>line.amount_cents===null))||!ready&&!report.pending.length)throw Error();
   if(ready&&report.lines.reduce((total,line)=>total+BigInt(line.sign)*BigInt(line.amount_cents),0n)!==BigInt(report.result.expected_net_cents))throw Error();
   previous=entry.revision;
  }
  return value;
 }
 async function loadCheckpointHistory(){
  if(!started||!api||!frame||!el('CheckpointDetails').open||checkpointHistoryBusy)return false;
  if(checkpointHistory&&!checkpointHistoryStale&&checkpointHistoryMonth===month)return true;
  const selected=month,token=++checkpointHistoryRequest;checkpointHistoryBusy=true;checkpointHistoryError='';drawCheckpoint();
  try{
   const raw=await api('finance/checkpoints?month='+encodeURIComponent(selected)+'&limit=10');
   if(token!==checkpointHistoryRequest||selected!==month||!started)return false;
   checkpointHistory=checkedCheckpointHistory(raw,selected);checkpointHistoryMonth=selected;checkpointHistoryStale=false;return true;
  }catch{
   if(token===checkpointHistoryRequest&&selected===month)checkpointHistoryError='Não foi possível conferir o histórico. Os valores do resumo foram preservados; tente atualizar o histórico novamente.';
   return false;
  }finally{if(token===checkpointHistoryRequest&&selected===month){checkpointHistoryBusy=false;drawCheckpoint();}}
 }
 function setMetric(key,value,help){const target=el(key),card=el(key+'Card');target.textContent=value===null?'Pendente':value;card.dataset.status=value===null?'pending':'available';el(key+'Help').textContent=help;}
 function collectionDiagnostic(operation,error){
  const field=key=>{try{return Object.getOwnPropertyDescriptor(error||{},key)?.value;}catch{return undefined;}};
  const sourceCode=field('code'),sourceApiCode=field('apiCode'),sourceStatus=field('status');
  const transportCodes=['ADMIN_API_NETWORK_ERROR','ADMIN_API_TIMEOUT','ADMIN_API_HTTP_ERROR','ADMIN_API_RESPONSE_INVALID','ADMIN_API_CONFIGURATION','ADMIN_API_REQUEST_INVALID','BUSINESS_MONTH_SOURCE_UNAVAILABLE'];
  return {client_contract:clientContract,operation:['start','step','read','ads'].includes(operation)?operation:'read',code:transportCodes.includes(sourceCode)?sourceCode:'BUSINESS_MONTH_REQUEST_FAILED',api_code:typeof sourceApiCode==='string'&&/^BUSINESS_MONTH_[A-Z0-9_]{1,64}$/.test(sourceApiCode)?sourceApiCode:null,http:Number.isInteger(sourceStatus)&&sourceStatus>=100&&sourceStatus<=599?sourceStatus:null};
 }
 function status(text,error=false){
  message=text;failed=error;const target=el('Status');target.replaceChildren();target.textContent=text;target.dataset.status=error?'error':'normal';
  if(!collectionFailure)return;
  const report=node('span',undefined,'month-detail-help'),serialized=JSON.stringify(collectionFailure,null,2),code=node('code',serialized),copy=node('button','Copiar diagnóstico','button-link');
  report.setAttribute('style','display:block;overflow-wrap:anywhere');code.setAttribute('style','white-space:pre-wrap;overflow-wrap:anywhere');copy.type='button';
  copy.onclick=async()=>{try{if(typeof globalThis.navigator?.clipboard?.writeText!=='function')throw Error();await globalThis.navigator.clipboard.writeText(serialized);copy.textContent='Diagnóstico copiado';}catch{copy.textContent='Selecione e copie o diagnóstico';}};
  report.append(node('span','Diagnóstico da coleta: '),code,copy);target.append(report);
 }
 function paintBootstrap(){
  if(started||bootstrapCompleted||!el('Select'))return false;
  const failure=bootstrapPhase==='FAILED';
  el('Select').disabled=true;el('Previous').disabled=true;el('SourceRefresh').disabled=true;el('Pause').hidden=true;
  el('Refresh').disabled=!failure||bootstrapRetryPending;el('Refresh').textContent=failure?'Tentar novamente':'Conectando…';
  status(failure?bootstrapFailureMessages[bootstrapFailureKind]:bootstrapPhase==='RETRYING'?'Tentando conectar ao painel novamente…':'Conectando ao painel da loja…',failure);
  return true;
 }
 async function retryBootstrap(){
  if(started||bootstrapPhase!=='FAILED'||bootstrapRetryPending||typeof bootstrapRetry!=='function')return false;
  bootstrapRetryPending=true;bootstrapPhase='RETRYING';paintBootstrap();
  try{const result=await bootstrapRetry();if(result===false&&!started)bootstrapPhase='FAILED';return result;}
  catch{if(!started)bootstrapPhase='FAILED';return false;}
  finally{bootstrapRetryPending=false;if(!started)paintBootstrap();}
 }
 function prepare(options={}){
  if(started||bootstrapCompleted||!el('Select'))return false;
  if(typeof options.retry==='function')bootstrapRetry=options.retry;
  let selected;try{const params=new URLSearchParams(globalThis.location?.search||'');selected=params.getAll('month').length===1?params.get('month'):null;}catch{}try{const dailyMonth=globalThis.brazaDayDashboard?.getSelection?.()?.slice(0,7);if(validMonth(dailyMonth))selected=dailyMonth;}catch{}
  const control=el('Select');control.max=today().slice(0,7);control.value=validMonth(selected)?selected:bootstrapPrepared&&validMonth(control.value)?control.value:today().slice(0,7);
  bootstrapPrepared=true;if(!frame)render();
  el('Refresh').onclick=retryBootstrap;paintBootstrap();return true;
 }
 function bootstrapState(options={}){
  if(started||bootstrapCompleted||!['LOADING','RETRYING','FAILED','READY'].includes(options.phase))return false;
  if(!bootstrapPrepared&&!prepare())return false;
  // Only a bounded public category selects copy. Never reflect provider text
  // or invoke an accessor while choosing the reason shown in the overview.
  bootstrapPhase=options.phase;
  if(bootstrapPhase==='FAILED'){
   const descriptor=Object.getOwnPropertyDescriptor(options,'failureKind'),kind=descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:null;
   bootstrapFailureKind=typeof kind==='string'&&Object.hasOwn(bootstrapFailureMessages,kind)?kind:'INVALID';
  }
  return paintBootstrap();
 }
 function controls(){
  notifySnapshot();
  if(bootstrapPrepared&&!bootstrapCompleted&&!started){paintBootstrap();return;}
  el('Refresh').disabled=busy||adsBusy||saving;el('Refresh').textContent=busy?'Consultando…':collectionRecovery?.waiting&&!paused?'Atualizar agora':paused||frame?.status==='RUNNING'?'Continuar consulta':frame?.status==='COMPLETE'?'Recalcular custos':'Atualizar mês';el('SourceRefresh').disabled=busy||adsBusy||saving;el('SourceRefresh').textContent='Atualizar vendas';el('Pause').hidden=!busy&&!collectionRecovery?.waiting;el('Pause').disabled=paused;el('Previous').disabled=saving;el('Select').disabled=saving;
  const conflict=!!frame&&dirty&&draftRevision!==frame.expenses.revision;
  el('ExpensesSave').disabled=!frame||busy||adsBusy||saving||conflict;
  el('ExpensesZero').disabled=!frame||busy||adsBusy||saving||conflict;
  el('ExpensesReload').hidden=!dirty;
  el('Identify').disabled=busy||adsBusy||saving;
  if(!manualCollection){el('Pause').hidden=true;el('Refresh').textContent=busy?'Conferindo…':'Recalcular custos';el('SourceRefresh').disabled=busy||adsBusy||saving||!!priorityPromise;}
  costDiagnosticControls();
 }
 function balanceLabel(summary,presentation=null){if(summary?.balance_cents===null&&Number.isSafeInteger(presentation?.amount_cents)){if(presentation.state==='BEFORE_MONTHLY_COSTS')return presentation.basis==='BEFORE_UNCONFIRMED_EXPENSES'?'Saldo parcial antes de outras despesas':presentation.basis==='BEFORE_UNCONFIRMED_DAS'?'Saldo parcial antes do DAS':'Saldo parcial antes de DAS e despesas';return presentation.ads_pending?'Saldo parcial · anúncios em conferência':'Saldo com custos identificados';}return summary?.state==='PARTIAL_COSTS'?'Saldo com custos identificados':summary?.state==='PROVISIONAL'?'Resultado líquido previsto · em conferência':'Resultado líquido previsto';}
 function summaryCount(value,singular,plural){return new Intl.NumberFormat('pt-BR').format(value)+' '+(value===1?singular:plural);}
 function missingProductionText(summary){const coverage=summary?.production_coverage;if(coverage?.pending_units>0)return 'Ainda falta descontar a produção de '+summaryCount(coverage.pending_units,'unidade','unidades')+', em '+summaryCount(coverage.pending_variants,'variação','variações')+' de '+summaryCount(coverage.pending_products,'produto','produtos')+'.';return 'Ainda há custos de produção pendentes. Eles não foram tratados como zero.';}
 function summaryBalanceHelp(summary,presentation=null){
  if(summary?.balance_cents===null&&Number.isSafeInteger(presentation?.amount_cents))return partialMonthHelp(presentation,summary);
  if(!summary)return 'Os valores faltantes estão identificados abaixo.';
  const mei=frame?.tax?.regime==='MEI',deductions='Produção, '+(mei?'DAS-MEI mensal':'imposto')+', anúncios e outras despesas já descontados.';
  if(summary.state==='READY')return deductions+' É uma previsão, não o valor recebido em banco.';
  const reviewed=frame?frame.coverage.cancel_pending+frame.coverage.other+frame.coverage.unknown:0,returned=frame?frame.coverage.returns+frame.coverage.returns_unknown:0;
  const review=summary.pending.includes('STATUS_REVIEW_REQUIRED')?' '+(reviewed>0?summaryCount(reviewed,'pedido com situação em revisão está excluído','pedidos com situação em revisão estão excluídos')+' dos valores dos pedidos pagos.':'Há situações de pedidos em revisão; a previsão considera somente os pedidos pagos identificados.'):'';
  const returns=summary.pending.includes('RETURNS_NOT_RECONCILED')?' '+(returned>0?summaryCount(returned,'devolução ainda precisa','devoluções ainda precisam'):'Devoluções e reembolsos ainda precisam')+' de conciliação. O valor pode mudar após reembolsos e ajustes.':'';
  const stale=summary.pending.includes('FINANCIAL_SOURCE_STALE')?' Saldo da última leitura financeira, consultada '+sourceAge(frame?.source_checked_at?.finance_oldest_at??frame?.checked_at)+'.':'';
  if(summary.state==='PARTIAL_COSTS')return 'Repasse após os custos identificados, '+(mei?'DAS-MEI mensal':'imposto')+', anúncios e outras despesas. '+missingProductionText(summary)+' O saldo pode diminuir; não é lucro líquido final.'+review+returns+stale;
  if(summary.state==='PROVISIONAL')return deductions+review+returns+' Este resultado previsto não é lucro líquido final nem recebimento confirmado.'+stale;
  const blockers=['COLLECTING','PERIOD_LIMIT_REACHED','PAYMENT_INCOMPLETE','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','ADS_UNAVAILABLE','INVOICE_TAX_UNAVAILABLE','TAX_POLICY_REQUIRED','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE'];
  const reasons=summary.pending.filter(code=>blockers.includes(code)).slice(0,2).map(code=>pendingMessages[code]);return reasons.length?reasons.join(' '):'Os valores faltantes estão identificados abaixo. Custos conhecidos não representam o total de todos os custos.';
 }
 function monthlyPresentation(){
  if(frame!==presentationFrame){presentationFrame=frame;presentationCache=frame?projectMonthlyProfitPresentationValue(projectMonthlyProfitPresentation(frame,projectBusinessMonth,buildMonthlyFinancialSummary)):null;}
  return presentationCache;
 }
 function partialMonthHelp(presentation,summary){
  const missing=presentation.monthly_costs_missing,parts=['Saldo parcial dos pedidos pagos, após a produção '+(summary?.production_complete?'completa':'identificada')+' e os anúncios da leitura salva.'];
  if(presentation.das_included)parts.push(frame?.tax?.regime==='MEI'?'DAS-MEI mensal já descontado uma vez.':'Imposto conhecido já descontado.');
  if(presentation.expenses_included)parts.push('Outras despesas declaradas já descontadas.');
  if(missing.includes('TAX_POLICY_REQUIRED'))parts.push('Ainda falta descontar o DAS mensal não confirmado.');
  if(missing.includes('EXTERNAL_EXPENSES_REQUIRED'))parts.push('Ainda falta descontar as despesas não declaradas. Elas continuam desconhecidas, sem assumir valor zero.');
  if(!summary?.production_complete)parts.push(missingProductionText(summary));
  if(presentation.ads_pending)parts.push('Anúncios em conferência: usada a leitura salva de '+checkpointTime(presentation.ads_checked_at)+' (Brasília).');
  else if(presentation.ads_checked_at!==null)parts.push('Anúncios consultados em '+checkpointTime(presentation.ads_checked_at)+' (Brasília).');
  if(presentation.ads_day_partial)parts.push('O último dia dessa leitura de anúncios ainda era parcial.');
  if(summary?.pending.includes('STATUS_REVIEW_REQUIRED'))parts.push('Pedidos em revisão de situação continuam excluídos da base paga.');
  if(summary?.pending.includes('RETURNS_NOT_RECONCILED'))parts.push('Devoluções e reembolsos ainda dependem de conciliação.');
  if(summary?.pending.includes('FINANCIAL_SOURCE_STALE'))parts.push('A leitura financeira também precisa de atualização.');
  parts.push('Este saldo pode mudar; não é lucro líquido final nem recebimento bancário confirmado.');
  return parts.join(' ');
 }
 function drawMonthlyPartialAction(presentation){
  const code=presentation?.state==='BEFORE_MONTHLY_COSTS'?presentation.monthly_costs_missing.includes('EXTERNAL_EXPENSES_REQUIRED')?'EXTERNAL_EXPENSES_REQUIRED':'TAX_POLICY_REQUIRED':null;
  if(!monthlyPartialAction&&code){monthlyPartialAction=node('button',undefined,'button-link month-pending-action');monthlyPartialAction.type='button';monthlyPartialAction.id='businessMonthPartialAction';el('NetCard').append(monthlyPartialAction);}
  if(!monthlyPartialAction)return;monthlyPartialAction.hidden=!code;monthlyPartialAction.disabled=busy||adsBusy||saving;
  if(code){monthlyPartialAction.textContent=code==='EXTERNAL_EXPENSES_REQUIRED'?'Conferir despesas deste mês':'Conferir DAS mensal';const selected=month;monthlyPartialAction.onclick=()=>started&&selected===month?pendingAction(code)?.[1]():false;}
 }
 function notifySnapshot(){if(!snapshotListeners.size)return;const value=snapshot();for(const listener of [...snapshotListeners])try{listener(value);}catch{}}
 function subscribe(listener){if(typeof listener!=='function')return ()=>{};snapshotListeners.add(listener);try{listener(snapshot());}catch{}return ()=>snapshotListeners.delete(listener);}
 function monthChangeBlocked(){return dirty||saving;}
 function refuseMonthChange(){el('Select').value=month;status('Salve as despesas em edição ou carregue os valores salvos antes de trocar o mês. Seus rascunhos foram preservados.',true);notifySnapshot();return false;}
 function drawCostOverview(summary){
  const target=el('CostOverview');target.replaceChildren();target.hidden=!frame||!summary;if(target.hidden)return;
  const item=(label,value,help)=>{const entry=node('article',undefined,'month-cost-overview-item');entry.append(node('small',label),node('strong',value),node('p',help,'month-detail-help'));target.append(entry);};
  const coverage=summary.production_coverage,recorded=buildRecordedBusinessBalance(frame);
  if(summary.balance_cents===null&&recorded.status==='AVAILABLE'){
   const exclusions=[];if(recorded.pending_production_units>0)exclusions.push('Falta descontar a produção de '+recorded.pending_production_units+' unidade(s).');if(recorded.review_orders>0)exclusions.push(recorded.review_orders+' pedido(s) com situação em revisão.');if(recorded.returns_orders>0)exclusions.push(recorded.returns_orders+' devolução(ões) ainda sem conciliação.');if(recorded.pending.includes('FINANCIAL_SOURCE_STALE'))exclusions.push('A leitura financeira precisa de atualização.');
   item('Subtotal com custos identificados',money(recorded.amount_cents),'Repasse menos produção identificada, DAS-MEI, anúncios e despesas salvas, com recarga de anúncios reposta quando confirmada. '+exclusions.join(' ')+' Não é lucro final nem confirma recebimento. Financeiro: '+checkpointTime(recorded.source_checked_at.finance_oldest_at)+'.');
  }
  item(summary.production_complete?'Produção total do mês':'Produção com custo identificado',money(summary.known_production_cents),summary.production_complete?'Custo cadastrado aplicado às unidades vendidas, incluindo os pedidos com vários produtos.':missingProductionText(summary)+' A produção total permanece pendente.');
  item(summary.production_complete?'Custos após o repasse':'Custos identificados após o repasse',money(summary.costs_after_payout_cents),'Produção '+(summary.production_complete?'total':'identificada')+', '+(frame.tax?.regime==='MEI'?'DAS-MEI':'imposto')+', anúncios e outras despesas. '+(summary.costs_after_payout_cents===null?'Algum valor ainda não foi confirmado.':'As deduções já incluídas no repasse da Shopee não são cobradas novamente.'));
  const counted=coverage.total_units!==null&&coverage.known_units!==null;
  item('Cobertura do custo de produção',counted?coverage.total_units===0?'Sem unidades vendidas':new Intl.NumberFormat('pt-BR').format(coverage.known_units)+' de '+new Intl.NumberFormat('pt-BR').format(coverage.total_units)+' unidades':'Quantidade ainda não disponível',coverage.pending_units>0?summaryCount(coverage.pending_units,'unidade','unidades')+' sem custo · '+summaryCount(coverage.pending_variants,'variação','variações')+' · '+summaryCount(coverage.pending_products,'produto','produtos')+'.':counted?'Todas as unidades deste recorte têm custo identificado.':'A quantidade depende do detalhamento validado dos produtos; ela não é calculada pela quantidade de pedidos.');
 }
 function drawWaterfall(summary=frame?buildMonthlyFinancialSummary(frame):null,presentation=monthlyPresentation()){
  const target=el('Waterfall');target.replaceChildren();el('CompositionChart')?.replaceChildren();if(!frame)return;
  const row=(label,amount,sign='')=>{const entry=node('div',undefined,'month-waterfall-row');entry.append(node('dt',label),node('dd',amount===null?'Pendente':sign+money(amount)));target.append(entry);};
  const mei=frame.tax?.regime==='MEI';
  row('Vendas dos produtos',frame.sales_cents);
  const difference=Number.isSafeInteger(frame.sales_cents)&&Number.isSafeInteger(frame.expected_repass_cents)?BigInt(frame.sales_cents)-BigInt(frame.expected_repass_cents):null;
  const adjustment=difference!==null&&difference>=BigInt(Number.MIN_SAFE_INTEGER)&&difference<=BigInt(Number.MAX_SAFE_INTEGER)?Number(difference):null;
  row('Diferença líquida entre vendas e repasse',adjustment);
  row('Repasse previsto · deduções da Shopee já consideradas',frame.expected_repass_cents);
  row(summary?.production_complete?'Produção total':'Produção com custo identificado',summary?.known_production_cents??null,'− ');row(mei?'DAS-MEI mensal · uma vez no mês':'Imposto previsto · 2%',frame.invoice_tax_cents,'− ');
  if(frame.ads_adjustment_cents>0){
   if(frame.expenses.recharge_treatment==='ADS_RECHARGE')row('Recarga de anúncios reposta',frame.ads_adjustment_cents,'+ ');
   else if(frame.expenses.recharge_treatment==='UNCONFIRMED')row('Recarga ou suporte · tratamento a conferir',null);
  }
  row('Gasto com anúncios',frame.ads?.status==='AVAILABLE'?frame.ads.expense_cents:null,'− ');
  const expensesConfirmed=!frame.result.pending.includes('EXTERNAL_EXPENSES_REQUIRED');
  row(expensesConfirmed?'Outras despesas do mês':'Outras despesas do mês · não declaradas',expensesConfirmed?frame.expenses.external_expenses_cents:null,'− ');
  row(balanceLabel(summary,presentation),summary?.balance_cents??presentation?.amount_cents??null);
  const negative=value=>Number.isSafeInteger(value)?value===0?0:-value:null;
  financialBars.draw(el('CompositionChart'),[{label:'Vendas dos produtos · contexto',value:frame.sales_cents,role:'CONTEXT'},{label:'Diferença vendas e repasse · informativa',value:adjustment,role:'CONTEXT'},{label:'Repasse previsto',value:frame.expected_repass_cents,role:'START'},{label:summary?.production_complete?'Produção de referência':'Produção identificada · parcial',value:negative(summary?.known_production_cents??null),role:'DEDUCTION'},{label:mei?'DAS mensal':'Imposto previsto',value:negative(frame.invoice_tax_cents),role:'DEDUCTION'},{label:'Recarga classificada reposta',value:frame.ads_adjustment_cents>0?(frame.expenses.recharge_treatment==='ADS_RECHARGE'?frame.ads_adjustment_cents:frame.expenses.recharge_treatment==='UNCONFIRMED'?null:0):0,role:'ADJUSTMENT'},{label:'Gasto com Ads',value:negative(frame.ads?.status==='AVAILABLE'?frame.ads.expense_cents:null),role:'DEDUCTION'},{label:'Outras despesas',value:negative(expensesConfirmed?frame.expenses.external_expenses_cents:null),role:'DEDUCTION'},{label:balanceLabel(summary,presentation),value:summary?.balance_cents??presentation?.amount_cents??null,role:'RESULT'}],{title:'Componentes do mês · valores assinados',basis:frame.month+' · referência comercial atual. Contexto não é deduzido outra vez; fabricação física separada.',complete:summary?.state==='READY'});
  el('CalculationHelp').textContent=Number.isSafeInteger(presentation?.amount_cents)||summary?.state==='PARTIAL_COSTS'||summary?.state==='PROVISIONAL'?summaryBalanceHelp(summary,presentation):'A previsão usa os custos de produção atuais. Recebimentos bancários ainda não estão conciliados.';
 }
 function drawTaxAndExpenses(summary=frame?buildMonthlyFinancialSummary(frame):null){
  const mei=frame?.tax?.regime==='MEI';
  el('TotalExpensesLabel').textContent=summary&&!summary.production_complete?'Custos identificados após o repasse':'Custos após o repasse';
  el('TotalExpensesHelp').textContent='Produção'+(summary&&!summary.production_complete?' identificada':'')+', '+(mei?'DAS-MEI mensal':'imposto')+', anúncios e outras despesas. '+(summary&&!summary.production_complete?'O custo de produção pendente ainda não está neste total. ':'')+'A diferença entre vendas e repasse pode incluir taxas, frete e outros ajustes da Shopee; ela já está considerada no repasse e não é descontada novamente.';
  el('TotalExpenses').textContent=money(summary?.costs_after_payout_cents??null);
  if(!frame){el('TaxSummary').textContent='Consultando a regra fiscal';el('TaxHelp').textContent='O imposto aparece quando a regra fiscal do mês puder ser conferida.';return;}
  if(mei){
   const tax=frame.tax,declared=tax.status==='DECLARED'&&Number.isSafeInteger(tax.tax_cents);
   el('TaxSummary').textContent=declared?'DAS-MEI · '+money(tax.tax_cents)+' por mês · '+tax.year+' · automático':'DAS-MEI pendente para '+tax.year;
   el('TaxHelp').textContent=declared?'Valor mensal informado por você, versão '+tax.policy_revision+'. Descontado uma única vez na competência do mês, mesmo sem vendas. Não é multiplicado pelas notas ou pelos pedidos e não é rateado entre os produtos.':'Falta o valor mensal do DAS-MEI deste ano. O sistema não substitui esse valor por 2% de cada nota nem assume imposto zero.';
  }else{
   el('TaxSummary').textContent='Regra anterior · estimativa de 2% sobre os produtos';
   el('TaxHelp').textContent='Esta leitura usa a regra fiscal anterior registrada no mês. Ela não representa o DAS-MEI mensal. Atualize o mês para conferir a regra atual.';
  }
 }
 function drawReadiness(){
  const target=el('Readiness');target.replaceChildren();if(!frame)return;
  const c=frame.coverage,complete=frame.status==='COMPLETE',pending=(...codes)=>codes.some(code=>frame.result.pending.includes(code));
  for(const [label,ready] of [['Pedidos e valores financeiros',complete&&c.payment_missing===0&&c.cancel_pending===0&&c.other===0&&c.unknown===0&&!pending('SOURCE_UNAVAILABLE','FINANCIAL_SOURCE_STALE','PAYMENT_INCOMPLETE','STATUS_REVIEW_REQUIRED')],['Custos de produção',complete&&frame.production_cost_cents!==null&&!pending('PRODUCTION_COST_INCOMPLETE')],[frame.tax?.regime==='MEI'?'DAS-MEI mensal':'Imposto de 2%',complete&&frame.invoice_tax_cents!==null&&!pending('TAX_POLICY_REQUIRED','INVOICE_TAX_UNAVAILABLE')],['Gasto dos anúncios',frame.ads?.status==='AVAILABLE'&&!pending('ADS_UNAVAILABLE')],['Outras despesas',frame.expenses.external_expenses_cents!==null&&!pending('EXTERNAL_EXPENSES_REQUIRED')],['Devoluções e ajustes',complete&&c.returns===0&&c.returns_unknown===0&&!pending('STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED','ADJUSTMENT_UNAVAILABLE','RECHARGE_TREATMENT_REQUIRED')]]){
   const item=node('li');item.dataset.ready=String(!!ready);item.append(node('span',label),node('strong',ready?'Conferido':'Pendente'));target.append(item);
  }
  el('ReadinessStatus').textContent=frame.result.net_estimate_cents===null?'Complete as pendências para comparar a previsão de lucro do mês.':frame.result.net_estimate_cents<=0?'A previsão do mês ainda não tem lucro positivo. Confira custos e desempenho antes de aumentar o investimento.':'A previsão financeira do mês está completa. Próximo passo: conferir margem por produto, estoque e campanhas antes de escalar.';
 }
 function fillExpenses({force=false}={}){
  if(!frame)return;if(dirty&&!force)return;
  const saved=frame.expenses;el('ExpensesValue').value=saved.external_expenses_cents===null?'':(saved.external_expenses_cents/100).toFixed(2);el('Recharge').value=saved.recharge_treatment;draftRevision=saved.revision;dirty=false;
 }
 let m3PricingEvidenceKey='',m3WorkbenchView=null,m3PricingDraftKey=null;
 const m3PricingDrafts=new Map(),m3PricingSelections=new Map();
 const m3PricingFields=['Extra','Fee','Ads','Margin'];
 function rememberPricingDraft(){
  if(!m3PricingDraftKey)return;
  const draft=Object.fromEntries(m3PricingFields.map(name=>[name,String(el('Pricing'+name)?.value??'').slice(0,40)]));
  m3PricingDrafts.delete(m3PricingDraftKey);m3PricingDrafts.set(m3PricingDraftKey,draft);
  while(m3PricingDrafts.size>256)m3PricingDrafts.delete(m3PricingDrafts.keys().next().value);
 }
 function selectPricingDraft(key){
  if(m3PricingDraftKey===key)return;
  rememberPricingDraft();m3PricingDraftKey=key;
  const draft=m3PricingDrafts.get(key);
  for(const name of m3PricingFields)if(el('Pricing'+name))el('Pricing'+name).value=draft?.[name]??'';
 }
 function drawPricingObserver(){
  const host=el('PricingObserver'),scope=el('PricingScope'),selector=el('PricingVariant'),
   calculate=el('PricingCalculate'),outcome=el('PricingResult');
  if(!host||!scope||!selector||!calculate||!outcome)return;
  const report=frame?.month===month?buildMlsProductIntelligence(frame):null;
  const soldModels=new Map();for(const variant of report?.variants??[]){if(!soldModels.has(variant.item_id))soldModels.set(variant.item_id,new Set());soldModels.get(variant.item_id).add(variant.model_id);}
  const catalog=(report?.products??[]).flatMap(row=>{const product=catalogProducts.get(row.item_id);if(!product)return [];return [{item_id:product.item_id,
   product_name:product.product_name,variants:(product.variants??[]).filter(variant=>soldModels.get(row.item_id)?.has(variant.model_id)).map(variant=>({
    model_id:variant.model_id,model_name:variant.model_name,
    attributes:(variant.attributes??[]).map(attribute=>({name:attribute.name,value:attribute.value}))
   }))}];});
  const workbench=report?buildMlsProductWorkbench(report,catalog):null;
  if(!m3WorkbenchView)m3WorkbenchView=createMlsProductWorkbenchView({document,financialBars,onSelectVariant:key=>{
   const control=el('PricingVariant');if(!control||control.disabled)return;
   const available=[...(control.options??control.children??[])].some(option=>option.value===key);if(!available)return;
   control.value=key;control.onchange?.();
   el('PricingSimulation')?.scrollIntoView?.({behavior:'smooth',block:'start'});control.focus?.({preventScroll:true});
  }});
  rememberPricingDraft();
  const evidenceKey=workbench?workbench.month+':'+String(frame?.checked_at??'')+':'+
   workbench.total_products+':'+workbench.total_units+':'+workbench.covered_exclusive_balance_cents+':'+
   report.variants.map(v=>v.item_id+':'+v.model_id+':'+String(v.unit_cost_cents)).join('|'):'unavailable:'+String(month??'');
  if(evidenceKey!==m3PricingEvidenceKey){m3PricingEvidenceKey=evidenceKey;outcome.textContent='Escolha uma variação e preencha todas as hipóteses antes de simular.';}
  const previous=selector.value;selector.replaceChildren();
  const blank=node('option','Escolher variação');blank.value='';selector.append(blank);calculate.onclick=null;
  for(const name of m3PricingFields)el('Pricing'+name).disabled=!workbench;
  if(!workbench){
   m3WorkbenchView.clear();host.dataset.sourceReady='false';
   scope.textContent='M3 Observador: aguardando um mês completo e o resumo de produtos validado. Os traços não significam zero, estoque ou lucro.';
   selector.disabled=true;calculate.disabled=true;outcome.textContent='Sem fonte mensal completa. Nenhuma simulação ou sugestão foi gerada.';return;
  }
  const financialEvidence=buildMlsProductFinancialEvidence(frame,projectBusinessMonth);
  host.dataset.sourceReady='true';m3WorkbenchView.render(workbench,financialEvidence,!manualCollection&&variantContributionContext?.month===frame?.month?variantContributionContext:null);
  const humanDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'data em conferência';
  scope.textContent='Fonte: recorte salvo de '+humanDate(frame.start_date)+' a '+humanDate(frame.end_date)+' · mês '+report.month+'. ABC A/B/C por QUANTIDADE vendida, não por estoque. '+
   (report.revenue_abc_status==='AVAILABLE'?'ABC da receita bruta dos pedidos exclusivos também disponível, sem representar lucro.':'ABC por receita indisponível enquanto houver pedidos mistos ou situações sem valores completos.')+
   ' Nomes do catálogo atual. Pricing não publica preços, não altera Ads e não autoriza escala.';
  const metadata=new Map(workbench.products.flatMap(product=>product.variants.map(variant=>[product.item_id+':'+variant.model_id,{product,variant}])));
  const available=report.variants.filter(variant=>Number.isSafeInteger(variant.unit_cost_cents)&&variant.unit_cost_cents>0);
  for(const variant of available){
   const named=metadata.get(variant.item_id+':'+variant.model_id),option=node('option',
    (named?.product.product_name||'Produto #'+variant.item_id)+' · '+(named?.variant.model_name||'variação #'+variant.model_id)+' · custo '+money(variant.unit_cost_cents));
   option.value=variant.item_id+':'+variant.model_id;selector.append(option);
  }
  const oldMonth=m3PricingDraftKey?.slice(0,7),wanted=oldMonth===report.month&&previous?previous:(m3PricingSelections.get(report.month)??'');
  if(available.some(variant=>variant.item_id+':'+variant.model_id===wanted))selector.value=wanted;
  selectPricingDraft(report.month+':'+selector.value);
  selector.disabled=!available.length;calculate.disabled=!available.length;
  if(!available.length)outcome.textContent='Nenhuma variação possui custo unitário confirmado acima de zero. A simulação permanece bloqueada.';
  selector.onchange=()=>{
   selectPricingDraft(report.month+':'+selector.value);m3PricingSelections.delete(report.month);m3PricingSelections.set(report.month,selector.value);
   while(m3PricingSelections.size>12)m3PricingSelections.delete(m3PricingSelections.keys().next().value);
   outcome.textContent='Hipóteses alteradas. Calcule novamente para conferir o cenário com os valores atuais.';
  };
  const assumptionsChanged=()=>{m3PricingDraftKey=report.month+':'+selector.value;rememberPricingDraft();m3PricingSelections.delete(report.month);m3PricingSelections.set(report.month,selector.value);while(m3PricingSelections.size>12)m3PricingSelections.delete(m3PricingSelections.keys().next().value);outcome.textContent='Hipóteses alteradas. Calcule novamente para conferir o cenário com os valores atuais.';};
  for(const name of m3PricingFields)el('Pricing'+name).oninput=assumptionsChanged;
  const inputCents=value=>{const match=/^(0|[1-9][0-9]{0,6})(?:[.,]([0-9]{1,2}))?$/.exec(String(value??'').trim());if(!match)return null;const cents=BigInt(match[1])*100n+BigInt((match[2]||'').padEnd(2,'0'));return cents<=100000000n?Number(cents):null;};
  const inputBps=value=>{const match=/^(0|[1-9][0-9]?)(?:[.,]([0-9]{1,2}))?$/.exec(String(value??'').trim());if(!match)return null;const bps=Number(match[1])*100+Number((match[2]||'').padEnd(2,'0'));return bps<=9000?bps:null;};
  calculate.onclick=()=>{
   if(!started||busy||adsBusy||saving||frame?.month!==report.month||month!==report.month){outcome.textContent='Aguarde a leitura do período atual antes de calcular um novo cenário.';return;}
   const selected=available.find(variant=>variant.item_id+':'+variant.model_id===selector.value),
    extra=inputCents(el('PricingExtra').value),fee=inputBps(el('PricingFee').value),
    ads=inputBps(el('PricingAds').value),margin=inputBps(el('PricingMargin').value);
   if(!selected||extra===null||fee===null||ads===null||margin===null){outcome.textContent='Informe a variação, custos adicionais (mesmo zero) e os três percentuais do cenário. Nenhum valor é presumido.';return;}
   m3PricingDraftKey=report.month+':'+selector.value;rememberPricingDraft();
   const scenario=simulateMlsPricingWorkbench({unit_cost_cents:selected.unit_cost_cents,extra_cost_cents:extra,
    fee_bps:fee,ads_bps:ads,target_margin_bps:margin},simulateMlsPricingScenario);
   if(!scenario){outcome.textContent='Cenário inválido: o total de taxas, Ads e margem precisa ser menor que 100%, e os valores devem respeitar os limites.';return;}
   outcome.textContent='Equilíbrio matemático do cenário: '+money(scenario.equilibrium_price_cents)+
    '\nPreço matemático do cenário, com a margem informada: '+money(scenario.target_price_cents)+
    '\nCusto base informado: '+money(scenario.supplied_cost_base_cents)+
    '. SIMULAÇÃO, NÃO É PREÇO SEGURO NEM RECOMENDAÇÃO PARA PUBLICAR. Taxas oficiais, impostos, frete, devoluções, atribuição Ads, estoque e fechamento M2 seguem sem comprovação automática.';
  };
 }

 function drawProducts(){
  const target=el('ProductRows'),report=frame?.product_summary,mei=frame?.tax?.regime==='MEI';
  drawPricingObserver();drawCatalogStatus();const periodCodes=frame?.result.pending.filter(code=>['STATUS_REVIEW_REQUIRED','SOURCE_UNAVAILABLE','FINANCIAL_SOURCE_STALE'].includes(code))||[];el('ProductPeriodNotice').hidden=!periodCodes.length;el('ProductPeriodNotice').textContent=periodCodes.length?'Avisos do período: '+periodCodes.map(code=>pendingMessages[code]).join(' ')+' Os subtotais abaixo cobrem somente os pedidos já conferidos de cada produto.':'';
  el('ProductBalanceHeading').textContent=mei?'Saldo após produção':'Saldo após produção e imposto';
  el('ProductTaxHelp').textContent=mei?'O saldo por produto usa o repasse da Shopee, menos produção dos pedidos exclusivos. O DAS-MEI é mensal e está descontado uma única vez no resultado geral, sem rateio por produto. Anúncios e outras despesas ainda não foram conciliados por produto. Este saldo não é lucro líquido por produto.':'O saldo por produto usa o repasse da Shopee, menos produção e imposto de 2% dos pedidos exclusivos. Anúncios e outras despesas ainda não foram conciliados por produto. Este saldo não é lucro líquido por produto.';
  if(month!==productMonth){productMonth=month;productPage=1;productOpen.clear();el('ProductSearch').value='';el('ProductFilter').value='all';el('ProductSort').value='quantity_desc';el('ProductPageSize').value='20';}
  target.replaceChildren();
  for(const name of ['ProductSearch','ProductFilter','ProductSort','ProductPageSize'])el(name).disabled=!report;
  el('ProductPrevious').disabled=true;el('ProductNext').disabled=true;
  if(!report){
   const text=!frame||frame.status!=='COMPLETE'?'Os produtos aparecem quando a consulta dos pedidos do mês terminar.':'A leitura anterior ainda não trouxe os produtos. Use Atualizar mês para conferir os dados.';
   el('ProductSummary').textContent=text;el('ProductPageStatus').textContent='Produtos ainda não disponíveis.';
   const row=node('tr'),cell=node('td',text,'month-products-empty');cell.setAttribute('colspan','4');row.append(cell);target.append(row);return;
  }
  const orderId=(left,right)=>left.length-right.length||(left<right?-1:left>right?1:0);
  const query=el('ProductSearch').value.trim().replace(/^#/,'').toLowerCase().split(/\s+/).filter(Boolean),filter=el('ProductFilter').value,sort=el('ProductSort').value;
  const numberOrder=(left,right)=>left===null?(right===null?0:1):right===null?-1:left>right?-1:left<right?1:0;
  const rows=report.products.filter(product=>query.every(term=>[product.item_id,...product.variants.map(variant=>variant.model_id),catalogProducts.get(product.item_id)?.product_name||'',...(catalogProducts.get(product.item_id)?.variants||[]).flatMap(variant=>[variant.model_name,...variant.attributes.map(attribute=>attribute.value)])].some(value=>value.toLowerCase().includes(term)))&&(filter==='ready'?product.exclusive_after_costs_cents!==null:filter==='known'?Number.isSafeInteger(product.known_exclusive_after_costs_cents):filter==='pending'?(product.pending.length>0||product.production_cost_cents===null):filter==='mixed'?product.mixed_orders>0:true)).sort((left,right)=>(sort==='contribution_desc'?numberOrder(left.exclusive_after_costs_cents??left.known_exclusive_after_costs_cents??null,right.exclusive_after_costs_cents??right.known_exclusive_after_costs_cents??null):sort==='cost_desc'?numberOrder(left.production_cost_cents,right.production_cost_cents):sort==='item_asc'?0:numberOrder(left.quantity,right.quantity))||orderId(left.item_id,right.item_id));
  const pageSize=[20,50,100].includes(Number(el('ProductPageSize').value))?Number(el('ProductPageSize').value):20,pages=Math.max(1,Math.ceil(rows.length/pageSize));
  productPage=Math.max(1,Math.min(productPage,pages));const offset=(productPage-1)*pageSize;
  const ready=report.products.filter(product=>product.exclusive_after_costs_cents!==null).length;
  el('ProductSummary').textContent=report.products.length+' produto(s) vendido(s) · '+ready+' com saldo dos pedidos exclusivos conferido · '+report.mixed_orders+' pedido(s) com produtos diferentes, sem rateio financeiro.';
  if(report.mixed_orders>0)el('ProductSummary').textContent+=' Valores já informados nesses pedidos: produtos '+money(report.known_mixed_sales_cents)+', repasse '+money(report.known_mixed_repass_cents)+'. Eles fazem parte do total da loja.';
  const productMessages={PAYMENT_INCOMPLETE:'Faltam valores financeiros de pedidos exclusivos.',PRODUCTION_COST_INCOMPLETE:'Há variações com custo de produção pendente.',RETURNS_NOT_RECONCILED:'Devoluções dos pedidos exclusivos precisam de conciliação.',STATUS_REVIEW_REQUIRED:'Há situações de pedidos do mês ainda em revisão.',SOURCE_UNAVAILABLE:'Parte da leitura financeira ainda está pendente.',NO_EXCLUSIVE_ORDERS:'Este produto só aparece em pedidos com outros produtos; os valores não foram rateados.',ARITHMETIC_UNSAFE:'Um valor excedeu o limite seguro de cálculo.'};
  const stat=(label,amount,help)=>{const cell=node('td');cell.append(node('span',label,'month-product-mobile-label'),node('strong',amount),node('small',help));return cell;};
  const visible=rows.slice(offset,offset+pageSize);catalogVisibleIds=visible.map(product=>product.item_id);const signature=month+':'+catalogVisibleIds.join(',');if(signature!==catalogSignature){catalogSignature=signature;catalogNeedsRead=true;}
  for(const product of visible){
   const metadata=catalogProducts.get(product.item_id),row=node('tr'),identity=node('td');identity.append(node('strong',metadata?.product_name||'Produto #'+product.item_id));if(metadata?.product_name)identity.append(node('small','Produto #'+product.item_id,'month-product-identity-code'));identity.append(node('small',product.orders+' pedido(s) · '+product.exclusive_orders+' exclusivo(s) · '+product.mixed_orders+' com outros produtos'));
   const badge=node('span',product.exclusive_after_costs_cents===null?'Saldo em conferência':'Saldo de pedidos exclusivos conferido','month-product-badge');badge.dataset.ready=String(product.exclusive_after_costs_cents!==null);identity.append(badge);
   const details=node('details',undefined,'month-product-variants'),summary=node('summary',product.variants.length+' variação(ões) vendida(s)'),variants=node('ul',undefined,'month-product-variant-list');
   details.append(summary,variants);details.open=productOpen.has(product.item_id);
   const fill=()=>{variants.replaceChildren();if(!details.open)return;for(const variant of product.variants){const composition=variant.selling_unit==='CUSTOM_PRODUCT'?'Custo personalizado · '+variant.cost_profile_label:variant.selling_unit==='SINGLE_GARMENT'?'Camiseta '+variant.size:variant.selling_unit==='ONE_MALE_ONE_FEMALE_KIT'?'Kit · masculino '+variant.male_size+' / feminino '+variant.female_size:'Composição pendente';const catalogueVariant=metadata?.variants.find(row=>row.model_id===variant.model_id),label=catalogueVariant?.model_name||catalogueVariant?.attributes.map(attribute=>attribute.name+': '+attribute.value).join(' · ')||'Variação #'+variant.model_id,entry=node('li',label+' · '+composition+' · '+variant.quantity+' unidade(s) · '+money(variant.unit_cost_cents)+' por unidade vendida · '+variant.exclusive_quantity+' em pedidos exclusivos / '+variant.mixed_quantity+' com outros produtos.');if(catalogueVariant?.model_name)entry.append(node('small','Variação #'+variant.model_id));if(variant.unit_cost_cents===null)entry.append(node('small',catalogReason(catalogueVariant?.reason||metadata?.reason,metadata?.status)));variants.append(entry);}};
   details.ontoggle=()=>{if(details.open)productOpen.add(product.item_id);else productOpen.delete(product.item_id);fill();};fill();identity.append(details);
   const localPending=product.pending.filter(code=>!['STATUS_REVIEW_REQUIRED','SOURCE_UNAVAILABLE'].includes(code));if(localPending.length){const pending=node('ul',undefined,'month-product-pending');pending.append(node('li','Pendências deste produto:'));for(const code of localPending)pending.append(node('li',productMessages[code]||'Parte dos dados ainda precisa ser conferida.'));identity.append(pending);}
   const units=stat('Unidades vendidas',new Intl.NumberFormat('pt-BR').format(product.quantity),'Unidades do anúncio, conforme a composição ou o perfil de custo cadastrado.');
   const production=stat('Produção total',money(product.production_cost_cents),product.production_cost_cents===null?'Já identificado: '+money(product.known_production_cost_cents)+'. Falta conferir as variações pendentes.':'Custo de todas as unidades deste produto no mês.');
   const contribution=stat(mei?'Saldo após produção':'Saldo após produção e imposto',product.exclusive_orders===0?'Sem pedido exclusivo':money(product.exclusive_after_costs_cents),product.exclusive_orders+' pedido(s) só deste produto. '+(mei?'Repasse informado pela Shopee, após produção. O DAS-MEI está no resultado geral da loja, sem rateio entre produtos.':'Repasse informado pela Shopee, após produção e imposto de 2%.')+' Anúncios e outras despesas ainda não foram conciliados por produto.');
   if(product.exclusive_after_costs_cents===null&&Number.isSafeInteger(product.known_exclusive_after_costs_cents)){const stale=frame.result.pending.includes('FINANCIAL_SOURCE_STALE'),partial=node('div',undefined,'month-product-partial');partial.append(node('small',stale?'Subtotal da última leitura':'Subtotal dos pedidos já conferidos'),node('strong',money(product.known_exclusive_after_costs_cents)),node('small','Após produção'+(mei?'':' e imposto')+', antes de anúncios, outras despesas'+(mei?' e DAS-MEI mensal':'')+'. O saldo final continua em conferência.'));if(stale)partial.append(node('small','Leitura financeira: '+checkpointTime(frame.source_checked_at?.finance_oldest_at??frame.checked_at)+'.'));contribution.append(partial);}
   if(product.exclusive_after_costs_cents!==null&&product.exclusive_after_costs_cents<0)contribution.children[1].className='month-product-negative';
   if(product.exclusive_orders>0)contribution.append(node('small','Nestes pedidos: repasse '+money(product.exclusive_repass_cents)+' · produção '+money(product.exclusive_production_cost_cents)+(mei?'. DAS-MEI contabilizado no resultado mensal.':' · imposto '+money(product.exclusive_tax_cents)+'.')));
   if(product.exclusive_margin_bps!==null)contribution.append(node('small','Percentual sobre as vendas exclusivas: '+new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}).format(product.exclusive_margin_bps/100)+'%.'));
   if(product.mixed_orders>0)contribution.append(node('small',product.mixed_orders+' pedido(s) com outros produtos não estão neste saldo.'));
   row.append(identity,units,production,contribution);target.append(row);
  }
  if(!rows.length){const row=node('tr'),cell=node('td',report.products.length?'Nenhum produto corresponde à busca ou ao filtro.':'Nenhum produto em pedido pago neste mês.','month-products-empty');cell.setAttribute('colspan','4');row.append(cell);target.append(row);}
  el('ProductPageStatus').textContent=(rows.length?offset+1:0)+'–'+Math.min(offset+pageSize,rows.length)+' de '+rows.length+' produto(s) · página '+productPage+'/'+pages+' · '+pageSize+' por página';
  el('ProductPrevious').disabled=productPage<=1;el('ProductNext').disabled=productPage>=pages;
 }
 function render(){
  notifySnapshot();
  try{globalThis.brazaExpenseLedger?.observe(month);}catch{}
  globalThis.brazaAutomationWorkspace?.render(frame?buildAccountDiagnosis(frame):null);drawCheckpoint();
  if(!frame){
   for(const key of ['Sales','Ads','Roas']){el(key).textContent=busy?'Consultando':'Pendente';el(key+'Card').dataset.status='pending';}el('NetLabel').textContent='Resultado líquido previsto';el('Net').textContent='Em apuração';el('NetHelp').textContent='O resultado aparece após conferir os pedidos, anúncios e custos do mês.';el('NetCard').dataset.status='pending';drawMonthlyPartialAction(null);el('Margin').textContent='';el('Coverage').replaceChildren();el('Waterfall').replaceChildren();el('CompositionChart')?.replaceChildren();el('Readiness').replaceChildren();el('Pending').hidden=true;el('Badge').textContent=collectionRecovery?.waiting&&!paused&&!document.hidden?'Aguardando retomada automática':busy?'Consultando':collectionFailure?'Consulta interrompida':'Aguardando consulta';drawCostOverview(null);drawTaxAndExpenses();drawProducts();drawWorkspaceCollection();controls();return;
  }
  const c=frame.coverage,ads=frame.ads,broad=ads?.totals.broad,net=frame.result.net_estimate_cents,summary=buildMonthlyFinancialSummary(frame),presentation=monthlyPresentation(),balance=summary?.balance_cents??presentation?.amount_cents??null;
  setMetric('Sales',frame.sales_cents===null?null:money(frame.sales_cents),frame.sales_cents===null?'Já informado: '+money(frame.known_sales_cents)+'. Falta conferir parte dos pedidos pagos.':'Produtos dos '+c.paid+' pedido(s) pagos criados nas datas do mês.');
  setMetric('Ads',ads?.status==='AVAILABLE'?money(ads.expense_cents):null,savedAdsHelp(ads));
  if(ads?.status==='AVAILABLE'&&frame.result.pending.includes('ADS_UNAVAILABLE'))el('AdsCard').dataset.status='provisional';
  setMetric('Roas',broad?.calculated_roas_raw===null||broad?.calculated_roas_raw===undefined?null:ratio(broad.calculated_roas_raw),broad?.gmv_cents===null||broad?.gmv_cents===undefined?'Vendas atribuídas aos anúncios ainda pendentes.':'Vendas atribuídas aos anúncios: '+money(broad.gmv_cents)+'. Este valor difere das vendas totais da loja.');
  if(ads?.status==='AVAILABLE'&&ads.expense_cents===0&&broad?.calculated_roas_raw===null){el('Roas').textContent='Sem investimento';el('RoasCard').dataset.status='available';}
  el('NetLabel').textContent=balanceLabel(summary,presentation);setMetric('Net',balance===null?null:money(balance),summaryBalanceHelp(summary,presentation));drawMonthlyPartialAction(presentation);
  if(balance===null)el('Net').textContent=frame.status==='RUNNING'?'Em apuração':'Em conciliação';
  else if(summary.state!=='READY')el('NetCard').dataset.status='provisional';
  el('NetCard').dataset.negative=String(balance!==null&&balance<0);
  el('Margin').textContent=frame.result.net_margin_bps===null?'':'Margem prevista: '+new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}).format(frame.result.net_margin_bps/100)+'%';
  el('Badge').textContent=collectionRecovery?.waiting&&!paused&&!document.hidden?'Aguardando retomada automática':frame.status==='RUNNING'?(busy&&!paused&&!document.hidden?'Consultando':paused||resumeOnVisible||document.hidden?'Consulta pausada':frame.collection?.state==='BLOCKED'?'Consulta requer atenção':'Consulta interrompida'):frame.status==='LIMIT_REACHED'?'Mês parcial':net===null?'Há pendências':'Previsão completa';
  el('Coverage').replaceChildren();for(const text of [c.paid+' pedido(s) pagos',c.completed+' concluído(s)',c.ongoing+' em andamento',c.cancelled+' cancelado(s) excluído(s)',c.unpaid+' não pago(s) excluído(s)'])el('Coverage').append(node('span',text));
  if(c.cancel_pending)el('Coverage').append(node('span',c.cancel_pending+' em cancelamento · em revisão'));
  if(c.other+c.unknown)el('Coverage').append(node('span',(c.other+c.unknown)+' com situação a conferir'));
  const warnings=frame.result.pending.filter(code=>code!=='COLLECTING');el('Pending').hidden=!warnings.length;el('PendingTitle').textContent=warnings.length===1?'Falta uma conferência para concluir o resultado':'O que falta para concluir o resultado';el('OpenReconciliation').hidden=true;drawPending(warnings,ads);
  el('Identify').hidden=true;
  if(warnings.includes('EXTERNAL_EXPENSES_REQUIRED')&&warnings.length===1)el('ExpensesDetails').open=true;
  el('RechargeField').hidden=!(frame.ads_adjustment_cents>0||warnings.includes('RECHARGE_TREATMENT_REQUIRED'));
  drawCostOverview(summary);drawWaterfall(summary);drawTaxAndExpenses(summary);drawReadiness();drawProducts();fillExpenses();
  if(dirty){el('ExpenseState').textContent=draftRevision!==frame.expenses.revision?'As despesas foram alteradas em outra sessão. Sua edição foi preservada; carregue os valores salvos antes de salvar novamente.':'Há uma edição de despesas ainda não salva.';}
  else el('ExpenseState').textContent=frame.expenses.external_expenses_cents===null?'Outras despesas ainda não informadas. Informe o valor ou confirme que não há despesas.':'Despesas salvas para '+monthName(frame.month)+' · versão '+frame.expenses.revision+'.';
  const progress=frame.progress;el('Progress').hidden=!busy;el('Progress').value=progress.windows_total?Math.round(progress.windows_complete/progress.windows_total*100):0;
  const formatTime=value=>Number.isSafeInteger(value)&&value>0?new Date(value*1000).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'pendente',sources=frame.source_checked_at;
  const consultation=sources?'Pedidos e financeiro: leitura mais antiga '+formatTime(sources.finance_oldest_at)+'; mais recente '+formatTime(sources.finance_latest_at)+'. Anúncios consultados em '+formatTime(sources.ads_at)+'. Idade do financeiro: '+sourceAge(sources.finance_oldest_at)+'; idade dos anúncios: '+sourceAge(sources.ads_at)+'.':'Horário informado pela leitura anterior: '+formatTime(frame.checked_at)+'. Idade da leitura: '+sourceAge(frame.checked_at)+'. Essa leitura não separa os horários do financeiro e dos anúncios.';
  el('Scope').textContent='Pedidos pagos criados de '+frame.start_date.split('-').reverse().join('/')+' a '+frame.end_date.split('-').reverse().join('/')+' e anúncios nas mesmas datas. Custos atuais de produção. '+consultation+' Brasília. Recebimentos bancários ainda não conciliados.';
  for(const key of ['AdsLink','DetailsLink'])el(key).href='/dashboard?month='+encodeURIComponent(frame.month);
  drawWorkspaceCollection();controls();
 }
 function drawWorkspaceCollection(){
  const target=el('CollectionState');if(!target)return;target.hidden=!workspaceView;if(!workspaceView)return;
  const value=workspaceView,current=value.collection,automatic=value.automatic,published=value.display_source==='PUBLISHED',collecting=current.status==='RUNNING';
  const displayTime=checkpointTime(frame?.source_checked_at?.finance_latest_at??frame?.checked_at),activeTime=checkpointTime(current.source_checked_at?.finance_latest_at??current.checked_at);
  let text=published?'Resumo concluído de '+frame.start_date+' a '+frame.end_date+' · financeiro de '+displayTime+'. ':'Resumo parcial dos pedidos de '+frame.start_date+' a '+frame.end_date+' · financeiro de '+displayTime+'. ';
  if(collecting)text+='Nova coleta de '+current.start_date+' a '+current.end_date+' em andamento: '+current.progress.windows_complete+' de '+current.progress.windows_total+' intervalo(s), '+current.coverage.orders+' pedido(s) observados · leitura de '+activeTime+'. Os valores desta coleta só substituem o resumo concluído após a conferência do período.';
  else if(current.status==='LIMIT_REACHED')text+='A nova coleta atingiu o limite e permanece parcial.';
  else text+='A leitura dos pedidos deste período está concluída.';
  if(!automatic.enabled)text+=' Coleta automática pausada. Atualizar vendas inicia uma consulta manual.';
  else if(!automatic.applicable)text+=' Mês histórico: use Atualizar vendas para uma nova consulta manual.';
  else text+=' A coleta continua automaticamente mesmo com o painel fechado.';
  target.textContent=text;
  if(collecting){el('Badge').textContent=!automatic.enabled?'Leitura parcial · coleta pausada':!automatic.applicable?'Leitura parcial do mês histórico':published?'Atualizando · resumo anterior preservado':'Coleta automática em andamento';el('Progress').hidden=false;el('Progress').value=current.progress.windows_total?Math.round(current.progress.windows_complete/current.progress.windows_total*100):0;}
  el('RefreshHelp').textContent=automatic.applicable&&automatic.enabled?'Recalcular custos usa os pedidos salvos. Atualizar vendas prioriza a próxima coleta automática, que continua com o painel fechado.':'Recalcular custos usa os pedidos salvos. Atualizar vendas inicia uma consulta manual à Shopee para este período.';
 }
 async function fetchWorkspaceView(selected){
  const path='finance/business-month-view?month='+encodeURIComponent(selected);let raw;
  try{raw=await api(path,undefined,{monthlyViewContract:'business-month-view-v5'});}
  catch(error){if(error?.status!==409||error.apiCode!=='BUSINESS_MONTH_VIEW_CONTRACT_UNSUPPORTED')throw error;raw=await api(path);}
  const checked=projectBusinessMonthView(raw,projectBusinessMonth,projectBusinessMonthAuditScope,projectDailyBusinessSummary,projectExpenseSchedule,projectBusinessMonthVariantContributions);if(!checked||checked.month!==selected)throw Error('BUSINESS_MONTH_VIEW_INVALID');return checked;
 }
 function readWorkspaceView({selected=el('Select').value,background=false}={}){
  if(!started||saving||!validMonth(selected)||background&&(document.hidden||costDiagnosticBusy||manualCollection||busy))return Promise.resolve(false);
  if(viewPromise?.month===selected)return viewPromise.task;
  const changed=selected!==month;if(changed&&monthChangeBlocked())return Promise.resolve(refuseMonthChange());if(changed){resetCostDiagnostic({clear:true});generation++;month=selected;frame=null;workspaceView=null;variantContributionContext=null;observeAudits(selected);try{globalThis.brazaDayDashboard?.reset?.({month:selected});}catch{}collectionRecovery=null;collectionFailure=null;manualCollection=false;priorityPromise=null;paused=false;automaticBlocked=false;catalogRequest++;catalogBusy=false;catalogState=null;catalogProducts.clear();catalogSignature='';catalogNeedsRead=true;dirty=false;editSequence++;draftRevision=0;el('ExpensesValue').value='';el('Recharge').value='UNCONFIRMED';invalidateCheckpointHistory();}
  const token=generation,requestId=++viewRequest,current=()=>started&&token===generation&&month===selected&&requestId===viewRequest;
  if(!background){busy=true;clearTimeout(timer);timer=null;status('Conferindo o resumo salvo e o andamento da coleta…');render();}
  const task=(async()=>{try{const value=await fetchWorkspaceView(selected);if(!current())return false;workspaceView=value;manualCollection=false;collectionRecovery=null;collectionFailure=null;automaticBlocked=false;viewFailures=0;apply(value.display,selected);if(!background)status(value.collection.status==='RUNNING'?(value.display_source==='PUBLISHED'?'Atualização em andamento no servidor; o último resumo concluído está identificado abaixo.':value.automatic.enabled&&value.automatic.applicable?'A coleta automática está em andamento. O resultado do período aparece após sua conclusão.':'Há uma leitura parcial salva. Use Atualizar vendas para continuar manualmente.'):'Resumo recalculado com os pedidos, anúncios e custos salvos.');return true;}catch(error){if(current()){viewFailures=Math.min(4,viewFailures+1);status(error?.status===401?'Entre novamente para acompanhar os dados da loja.':'Não foi possível conferir o andamento agora. O último resumo e seus rascunhos foram preservados; tentaremos novamente.',true);}return false;}finally{if(current()){if(!background)busy=false;viewPromise=null;render();schedule();scheduleCatalog();}}})();viewPromise={month:selected,task};return task;
 }
 function checkedRefreshRequest(value,selected){
  const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row)),keys=['schema','month','status','next_run_at','lease_expires_at'];
  if(!plain(value)||Reflect.ownKeys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'))||value.schema!=='business_month_refresh_request_v1'||value.month!==selected||!['QUEUED','RUNNING','PAUSED','RETRY_WAIT'].includes(value.status)||!Number.isSafeInteger(value.next_run_at)||value.next_run_at<0||value.next_run_at>9999999999||value.lease_expires_at!==null&&(!Number.isSafeInteger(value.lease_expires_at)||value.lease_expires_at<1||value.lease_expires_at>9999999999))throw Error('BUSINESS_MONTH_REFRESH_REQUEST_INVALID');return value;
 }
 function requestSalesUpdate(){
  if(priorityPromise)return priorityPromise;if(!started||busy||adsBusy||saving||!validMonth(month))return Promise.resolve(false);
  if(!workspaceView)return readWorkspaceView();
  if(!cronOwnsCollection()){manualCollection=true;workspaceView=null;variantContributionContext=null;viewRequest++;viewPromise=null;observeAudits(month);return refresh();}
  const selected=month,token=generation,current=()=>started&&month===selected&&token===generation;
  const task=(async()=>{try{const value=checkedRefreshRequest(await api('finance/business-month-request',{month:selected}),selected);if(!current())return false;await readWorkspaceView({selected,background:true});if(!current())return false;status(value.status==='PAUSED'?'A coleta automática foi pausada. Os valores salvos foram preservados.':value.status==='RETRY_WAIT'?'A fonte precisa aguardar antes da próxima tentativa. O resumo salvo foi preservado.':value.status==='RUNNING'?'A coleta já está em andamento. O painel acompanhará os avanços automaticamente.':'Atualização priorizada. A coleta será executada automaticamente; você pode manter o painel fechado.');return true;}catch{if(current())status('Não foi possível priorizar a atualização agora. O resumo salvo foi preservado.',true);return false;}finally{if(current()){priorityPromise=null;controls();schedule();}}})();priorityPromise=task;controls();return task;
 }
 function checkedFrame(value,expectedMonth){const checked=projectBusinessMonth(value);if(!checked||checked.month!==expectedMonth)throw Error('Os dados mensais não puderam ser conferidos. Atualize o mês para tentar novamente.');return checked;}
 function observeAudits(selected,scope=null,monthly=null){for(const observe of [()=>globalThis.brazaReconciliation?.observe(selected,scope,monthly),()=>globalThis.brazaFinancialCloseout?.observe(selected,scope),()=>globalThis.brazaEscrowReleases?.observe(selected,scope),()=>globalThis.brazaIncomeOverview?.observe?.()]){try{observe();}catch{}}}
 function apply(value,expectedMonth){const previous=frame?.classification_revision;frame=checkedFrame(value,expectedMonth);variantContributionContext=!manualCollection&&workspaceView?.schema==='business_month_view_v5'&&workspaceView.display===value?workspaceView.variant_contributions:null;if(previous!==frame.classification_revision){catalogNeedsRead=true;if(previous!==undefined)catalogProductsChanged=true;}invalidateCheckpointHistory();const auditScope=!manualCollection&&workspaceView?.display===value&&['business_month_view_v2','business_month_view_v3','business_month_view_v4','business_month_view_v5'].includes(workspaceView.schema)&&workspaceView.display_source==='PUBLISHED'?workspaceView.audit_scope:null;costDiagnosticContext={monthly:frame,audit_scope:auditScope};revalidateCostDiagnostic();render();observeAudits(expectedMonth,auditScope,auditScope===null?null:frame);try{globalThis.brazaDayDashboard?.setContext?.(auditScope===null?null:workspaceView.daily_summary??null,{monthly:frame,scope:auditScope,month:expectedMonth});}catch{}return frame;}
 function collectionProgress(value){return [value.progress.pages_read,value.coverage.orders,value.progress.windows_complete];}
 function trackCollection(value){
  if(!value.collection)return null;
  const progress=collectionProgress(value);
  if(!collectionRecovery)collectionRecovery={value,progress,highWater:[...progress],attempts:0,readFailures:0,firstAdsAttempted:false,waiting:false,observing:false,retryAt:0,waitKey:null};
  else{
   // A restarted job can briefly report lower counters. Only progress beyond
   // this visit's high-water marks releases another bounded set of retries.
   if(progress.some((count,index)=>count>collectionRecovery.highWater[index])){collectionRecovery.attempts=0;collectionRecovery.waitKey=null;}
   collectionRecovery.highWater=progress.map((count,index)=>Math.max(count,collectionRecovery.highWater[index]));
   collectionRecovery.value=value;collectionRecovery.progress=progress;
  }
  return collectionRecovery;
 }
 function recoverableFailure(error){
  const diagnostic=collectionDiagnostic('read',error),http=diagnostic.http;
  if(http!==null&&http>=300&&![408,429,500,502,503,504].includes(http))return false;
  return ['ADMIN_API_NETWORK_ERROR','ADMIN_API_TIMEOUT'].includes(diagnostic.code)||diagnostic.code==='ADMIN_API_HTTP_ERROR'&&[408,429,500,502,503,504].includes(http);
 }
 function recoveryDelay(attempt){return Math.min(60000,Math.ceil(Math.min(55000,1000*2**Math.min(attempt,6))*(1.03+Math.random()*.07)));}
 function waitForUnknownCollection(){
  collectionRecovery={value:null,progress:[0,0,0],highWater:[0,0,0],attempts:0,readFailures:0,firstAdsAttempted:false,waiting:true,observing:false,retryAt:Date.now()+recoveryDelay(0),waitKey:'NETWORK|UNKNOWN'};
  automaticBlocked=false;resumeOnVisible=false;
  status('Não recebemos a confirmação da coleta. Vamos conferir os dados salvos antes de retomar.');
 }
 function waitForCollection(value,{error=false}={}){
  const recovery=trackCollection(value);if(!recovery)return false;
  if(value.collection.state==='BLOCKED'){
   collectionRecovery=null;automaticBlocked=true;
   status(value.collection.code==='BUSINESS_PERIOD_AUTH_REQUIRED'?'A conexão financeira precisa ser autorizada novamente nas integrações. Os valores já consultados foram preservados.':value.collection.code==='BUSINESS_PERIOD_PERMISSION_DENIED'?'A Shopee recusou a permissão para esta consulta. Confira a conexão financeira nas integrações; os valores já consultados foram preservados.':'Parte da resposta financeira não passou na conferência. Os valores já consultados foram preservados; confira a conexão antes de retomar.',true);
   return true;
  }
  recovery.waiting=true;automaticBlocked=false;resumeOnVisible=false;
  const key=(error?'NETWORK':value.collection.code||'READY')+'|'+recovery.progress.join(':');
  if(recovery.waitKey!==key){recovery.waitKey=key;recovery.retryAt=Date.now()+Math.max(error?0:value.collection.retry_after_seconds*1000,recoveryDelay(recovery.attempts));}
  status(recovery.attempts>=8?'A coleta automática está aguardando avanço da Shopee. Continuaremos conferindo os dados salvos, sem repetir consultas em sequência.':'Aguardando retomada automática da consulta. Os valores já consultados foram preservados.');return true;
 }
 function canRecover(){return manualCollection&&started&&collectionRecovery?.waiting&&!document.hidden&&!busy&&!adsBusy&&!saving&&!dirty&&!paused&&!automaticBlocked&&!costDiagnosticBusy;}
 async function observeCollection(){
  if(!canRecover()||collectionRecovery.observing)return false;
  const recovery=collectionRecovery,selected=month,token=generation;recovery.observing=true;
  const current=()=>started&&token===generation&&selected===month&&collectionRecovery===recovery;
  try{
   const raw=await api('finance/business-month?month='+encodeURIComponent(selected));if(!current())return false;
   const value=checkedFrame(raw,selected);recovery.readFailures=0;
   // A legacy response cannot authorize a new collector request after an
   // ambiguous failure. Only the durable collection contract can resume it.
   if(!value.collection){collectionRecovery=null;automaticBlocked=true;status('Os dados salvos foram preservados. Use Atualizar mês para retomar a consulta.',true);return false;}
   trackCollection(value);apply(value,selected);
   if(value.collection.state==='BLOCKED'){waitForCollection(value);return false;}
   if(value.status!=='RUNNING'){
    const firstAds=value.status==='COMPLETE'&&!value.result.pending.includes('SOURCE_UNAVAILABLE')&&value.ads?.status!=='AVAILABLE'&&!recovery.firstAdsAttempted;
    // This is the first Ads read after an interrupted financial request, never
    // a replay of an Ads submission. Wait for a foreground, unedited workspace.
    if(firstAds&&!canRecover()){recovery.retryAt=0;return true;}
    if(firstAds){
     recovery.firstAdsAttempted=true;collectionRecovery=null;collectionFailure=null;lastFinancialRefreshAt=Date.now();automaticBlocked=false;
     status('A consulta financeira foi concluída. Conferindo os anúncios nas mesmas datas…');
     const refreshed=await refreshAds();
     if(started&&token===generation&&selected===month&&refreshed)status(frame.ads?.status==='AVAILABLE'?'Dados do mês atualizados. Confira o resultado e as pendências abaixo.':'A consulta financeira foi concluída, mas o gasto de anúncios ainda está pendente. O resultado líquido continua em conciliação.');
     return refreshed;
    }
    collectionRecovery=null;collectionFailure=null;lastFinancialRefreshAt=Date.now();automaticBlocked=value.result.pending.includes('SOURCE_UNAVAILABLE');if(value.ads?.status==='AVAILABLE'&&!value.result.pending.includes('ADS_UNAVAILABLE'))adsSuccess();else adsFailure();
    status(value.status==='COMPLETE'?(value.ads?.status==='AVAILABLE'?'A consulta financeira foi concluída. Os dados salvos e as pendências do mês foram atualizados.':'A consulta financeira foi concluída, mas o gasto de anúncios ainda está pendente. O resultado líquido continua em conciliação. A atualização dos anúncios será tentada novamente automaticamente, com uma espera entre tentativas.'):'O mês está parcial porque o limite de pedidos foi atingido. Os totais pendentes não são estimados como zero.');return true;
   }
   if(value.collection.state==='RETRY_WAIT')waitForCollection(value);
   else recovery.retryAt=0;
   if(!canRecover())return false;
   if(recovery.attempts>=8||Date.now()<recovery.retryAt){render();return true;}
   recovery.waiting=false;recovery.observing=false;recovery.attempts++;collectionFailure=null;
   return refresh({automatic:true,observed:value});
  }catch(error){
   if(current()){
    collectionFailure=collectionDiagnostic('read',error);
    if(recoverableFailure(error)){recovery.readFailures++;recovery.retryAt=Date.now()+recoveryDelay(recovery.readFailures);status('A consulta está temporariamente indisponível. Continuaremos conferindo os dados salvos antes de retomar.');}
    else{collectionRecovery=null;automaticBlocked=true;status('Não foi possível conferir o estado da consulta. Os dados salvos foram preservados; confira a conexão financeira antes de retomar.',true);}
   }return false;
  }finally{if(current()){recovery.observing=false;render();schedule();scheduleCatalog();}else if(started&&token===generation&&selected===month){render();schedule();scheduleCatalog();}}
 }
 function adsFailure(){adsFailures=Math.min(adsFailures+1,3);adsRetryAt=Date.now()+[60000,120000,300000][adsFailures-1];}
 function adsSuccess(){adsFailures=0;adsRetryAt=0;}
 function savedAdsHelp(value){
  if(!value)return 'O gasto de anúncios ainda não foi coletado para estas datas. A atualização automática continuará tentando.';
  if(value.status!=='AVAILABLE')return 'Consulta parcial: '+value.covered_days+' de '+value.total_days+' dia(s), sem completar os dias ausentes com zero.';
  const old=Date.now()-value.fetched_at*1000>900000,unconfirmed=frame.result.pending.includes('ADS_UNAVAILABLE');
  return (old?'Último gasto salvo; leitura antiga. ':unconfirmed?'Último gasto confirmado; a atualização ainda está pendente. ':'Gasto confirmado em '+value.covered_days+' de '+value.total_days+' dia(s). ')+
   'Consultado '+sourceAge(value.fetched_at)+'.'+(unconfirmed?' O líquido aguarda uma atualização de anúncios.':'');
 }
 function schedule(){
  clearTimeout(timer);timer=null;
  if(!manualCollection){if(!started||document.hidden||busy||saving||costDiagnosticBusy||viewPromise)return;const delay=viewFailures?Math.min(300000,15000*2**viewFailures):workspaceView?.collection.status==='RUNNING'?15000:60000;timer=setTimeout(()=>{timer=null;let selected=month;try{const dailyMonth=globalThis.brazaDayDashboard?.getSelection?.()?.slice(0,7);if(!dirty&&validMonth(dailyMonth))selected=dailyMonth;}catch{}if(selected!==month)el('Select').value=selected;return readWorkspaceView({selected,background:true});},delay);return;}
  if(collectionRecovery?.waiting){if(!canRecover()||collectionRecovery.observing)return;const delay=collectionRecovery.attempts>=8?60000:Math.min(60000,Math.max(0,collectionRecovery.retryAt-Date.now()));timer=setTimeout(()=>{timer=null;return observeCollection();},delay);return;}
  if(!started||document.hidden||busy||adsBusy||saving||dirty||paused||automaticBlocked||costDiagnosticBusy||frame?.status!=='COMPLETE'&&!resumeOnVisible||month!==today().slice(0,7))return;
  // Ads updates never advance the financial clock: orders, cancellations and
  // payouts must be imported again even while Ads continues to update.
  const financialDue=resumeOnVisible?Date.now():lastFinancialRefreshAt+financeRefreshInterval;
  const delay=Math.min(60000,Math.max(0,financialDue-Date.now()));
  timer=setTimeout(()=>{timer=null;if(document.hidden||dirty||paused||automaticBlocked)return;return Date.now()>=financialDue?refresh({automatic:true}):refreshAds();},delay);
 }
 async function request(operation,selected=month){if(!manualCollection){if(operation!=='read')throw Error('A coleta automática é acompanhada pelos dados salvos.');const token=generation,value=await fetchWorkspaceView(selected);if(started&&selected===month&&token===generation)workspaceView=value;return value.display;}return api('finance/business-month',{operation,month:selected});}
 async function refresh({automatic=false,observed=null,cacheFirst=false}={}){
  if(!manualCollection)return readWorkspaceView({background:automatic});
  if(!started||saving||automatic&&(dirty||paused||automaticBlocked||document.hidden||adsBusy))return false;
  const selected=el('Select').value;if(!validMonth(selected)){status('Escolha um mês válido até o mês atual.',true);return false;}
  const changed=selected!==month;if(changed&&monthChangeBlocked())return refuseMonthChange();if(busy&&!changed)return false;
  resetCostDiagnostic({clear:true});const token=++generation;catalogRequest++;catalogBusy=false;clearTimeout(catalogTimer);catalogTimer=null;month=selected;paused=false;automaticBlocked=false;resumeOnVisible=false;collectionFailure=null;if(!observed)collectionRecovery=null;busy=true;adsBusy=false;clearTimeout(timer);timer=null;
  if(changed){adsSuccess();frame=null;observeAudits(selected);catalogState=null;catalogPaused=false;catalogProducts.clear();catalogSignature='';catalogNeedsRead=true;invalidateCheckpointHistory();dirty=false;editSequence++;draftRevision=0;el('ExpensesValue').value='';el('Recharge').value='UNCONFIRMED';}
  status(automatic?'Atualizando vendas, cancelamentos e anúncios de '+monthName(month)+'…':'Consultando os pedidos de '+monthName(month)+'…');render();
  const current=()=>token===generation&&month===selected;
  let operation='read';
  try{
   let value=!changed&&frame?.status==='COMPLETE'?frame:null;
   if(changed){
    let cached,readSucceeded=false;
    try{cached=await request('read',selected);readSucceeded=true;}catch{}
    if(!current())return false;
    // A successful but invalid cache response must fail validation, rather than
    // being treated as a network miss or displaying unverified totals.
    if(readSucceeded){value=apply(cached,selected);if(value.status==='COMPLETE')status('Mostrando a última leitura salva. Atualizando os pedidos e anúncios de '+monthName(selected)+'…');}
   }
   if(paused||document.hidden){
    resumeOnVisible=!paused;
    status(paused?'Consulta pausada após a última resposta. Use Continuar consulta para retomar.':'A atualização continua automaticamente quando este painel voltar à tela.');return true;
   }
   // Opening a recent saved month must not restart its order/payment import.
   // Only provider observation times govern freshness; a local cost read does
   // not make old orders, cancellations or Ads newer.
   const financeAt=value?.source_checked_at?.finance_oldest_at;
   if(cacheFirst&&value?.status==='COMPLETE'&&Number.isSafeInteger(financeAt)&&financeAt>0&&financeAt*1000<=Date.now()&&Date.now()-financeAt*1000<financeRefreshInterval&&!value.result.pending.some(code=>['SOURCE_UNAVAILABLE','FINANCIAL_SOURCE_STALE'].includes(code))){
    lastFinancialRefreshAt=financeAt*1000;
    status('Custos recalculados com os pedidos salvos. Leitura financeira '+sourceAge(financeAt)+'. Use Atualizar vendas para buscar mudanças na Shopee.');
    return true;
   }
   const keepCached=value?.status==='COMPLETE';
   if(keepCached)status('Mostrando a última leitura salva. Atualizando os pedidos e anúncios de '+monthName(selected)+'…');
   const update=raw=>{const checked=checkedFrame(raw,selected);trackCollection(checked);if(!keepCached||checked.status!=='RUNNING'){frame=checked;invalidateCheckpointHistory();render();}return checked;};
   if(observed)value=update(observed);
   else{operation='start';const initial=await request('start',selected);if(!current())return false;value=update(initial);}
   let steps=0,resumeDue=!!observed;
   while(value.status==='RUNNING'&&value.collection?.state!=='BLOCKED'&&(resumeDue||value.collection?.state!=='RETRY_WAIT')&&!paused&&!document.hidden&&steps<610){
    resumeDue=false;
    status((keepCached?'Mostrando a última leitura salva. ':'')+'Conferindo os pedidos do mês… '+value.coverage.orders+' pedido(s) consultado(s).');
    operation='step';const raw=await request('step',selected);if(!current())return false;value=update(raw);steps++;
    if(value.result.pending.includes('SOURCE_UNAVAILABLE')||value.collection?.state==='RETRY_WAIT'||value.collection?.state==='BLOCKED')break;
   }
   if(!current())return false;
   if(value.collection?.state==='RETRY_WAIT'||value.collection?.state==='BLOCKED')waitForCollection(value);
   else if(value.result.pending.includes('SOURCE_UNAVAILABLE')){automaticBlocked=true;collectionRecovery=null;collectionFailure=collectionDiagnostic(operation,{code:'BUSINESS_MONTH_SOURCE_UNAVAILABLE'});}
   if(document.hidden&&!paused){if(value.collection&&value.status==='RUNNING')waitForCollection(value);else resumeOnVisible=!automaticBlocked;status('A atualização continua automaticamente quando este painel voltar à tela.');}
   else if(collectionRecovery?.waiting||automaticBlocked&&value.collection?.state==='BLOCKED'){}
   else if(value.status==='COMPLETE'&&!paused){
    collectionRecovery=null;lastFinancialRefreshAt=Date.now();
    let catalogueFailed=false;
    if(!catalogFeature()&&value.unmapped_variants.length&&typeof syncVariants==='function'){
     status('Associando automaticamente os custos dos produtos vendidos…');
     try{catalogueFailed=await syncVariants(value.unmapped_variants)===false;}catch{catalogueFailed=true;}
     if(!current())return false;operation='read';const reread=await request('read',selected);if(!current())return false;apply(reread,selected);
    }
    if(automatic&&Date.now()<adsRetryAt){status('Vendas atualizadas. A consulta de anúncios aguarda a próxima tentativa automática; o último gasto salvo mantém seu horário.');return true;}
    if(!current())return false;status('Conferindo os anúncios nas mesmas datas…');
    operation='ads';const raw=await request('ads',selected);if(!current())return false;value=apply(raw,selected);
    if(value.ads?.status==='AVAILABLE'&&!value.result.pending.includes('ADS_UNAVAILABLE'))adsSuccess();else adsFailure();
    status(catalogueFailed?'Valores mensais atualizados. Há produtos com identificação pendente; confira os motivos abaixo.':'Dados do mês atualizados. Confira o resultado e as pendências abaixo.');
   }else if(paused)status('Consulta pausada após a última resposta. Use Continuar consulta para retomar.');
   else if(value.status==='LIMIT_REACHED')status('O mês está parcial porque o limite de pedidos foi atingido. Os totais pendentes não são estimados como zero.');
   else status('Parte da consulta ficou pendente. Use Atualizar mês para retomar a leitura.');
   return true;
  }catch(error){if(current()&&error?.code==='BUSINESS_MONTH_BACKGROUND_OWNED'){manualCollection=false;collectionRecovery=null;automaticBlocked=false;busy=false;return readWorkspaceView({selected});}if(current()){collectionFailure=collectionDiagnostic(operation,error);const recoverableValue=collectionRecovery?.value||frame;if(['start','step'].includes(operation)&&recoverableFailure(error)&&(recoverableValue?.collection||!recoverableValue)){if(recoverableValue)waitForCollection(recoverableValue,{error:true});else waitForUnknownCollection();}else{if(operation==='ads')adsFailure();else automaticBlocked=true;collectionRecovery=null;status(operation==='ads'?'Não foi possível atualizar os anúncios. O último gasto salvo mantém sua data; tentaremos novamente automaticamente.':error?.message||'Não foi possível atualizar o mês. Tente novamente.',true);}render();}return false;}
  finally{if(current()){busy=false;if(frame?.status==='COMPLETE'&&!collectionRecovery?.waiting)manualCollection=false;render();schedule();scheduleCatalog();}}
 }
 async function refreshAds(){
  if(!manualCollection)return readWorkspaceView({background:true});
  if(!started||!frame||busy||adsBusy||saving||dirty||document.hidden)return false;
  if(Date.now()<adsRetryAt){schedule();return false;}
  if(frame.ads?.status==='AVAILABLE'&&!frame.result.pending.includes('ADS_UNAVAILABLE')&&Date.now()-frame.ads.fetched_at*1000<60000){schedule();return false;}
  const token=generation,selected=month;adsBusy=true;controls();
  try{
   const raw=await request('ads',selected);if(token!==generation||selected!==month)return false;apply(raw,selected);
   if(frame.ads?.status==='AVAILABLE'&&!frame.result.pending.includes('ADS_UNAVAILABLE')){adsSuccess();if(collectionFailure?.operation==='ads')collectionFailure=null;}
   else{adsFailure();status('A atualização dos anúncios ficou pendente. O último gasto salvo mantém seu horário; a consulta será repetida automaticamente.');}
   return true;
  }catch(error){if(token===generation){adsFailure();collectionFailure=collectionDiagnostic('ads',error);status('Não foi possível atualizar os anúncios. O último gasto salvo mantém seu horário; tentaremos novamente automaticamente.',true);}return false;}
  finally{if(token===generation){adsBusy=false;render();schedule();scheduleCatalog();}}
 }
 async function refreshCosts(){
  if(!manualCollection)return readWorkspaceView();
  if(!started||!frame||busy||adsBusy||saving)return false;
  resetCostDiagnostic();const token=++generation,selected=month;busy=true;catalogRequest++;catalogBusy=false;clearTimeout(catalogTimer);catalogTimer=null;clearTimeout(timer);timer=null;controls();
  status('Recalculando os custos com os pedidos e produtos salvos…');
  try{
   const raw=await request('read',selected);if(token!==generation||selected!==month)return false;apply(raw,selected);
   status('Custos recalculados com os dados salvos. Pedidos consultados '+sourceAge(frame.source_checked_at?.finance_oldest_at??frame.checked_at)+'. Use Atualizar vendas para buscar mudanças na Shopee.');return true;
  }catch(error){if(token===generation){collectionFailure=collectionDiagnostic('read',error);status('Os custos foram preservados, mas não foi possível recalcular os dados salvos. Tente novamente ou use Atualizar vendas.',true);}return false;}
  finally{if(token===generation){busy=false;render();schedule();scheduleCatalog();}}
 }
 function expenseChanged(){dirty=true;editSequence++;clearTimeout(timer);timer=null;render();}
 function expenseAmount(){const raw=el('ExpensesValue').value.trim().replace(',','.');if(!/^(0|[1-9][0-9]{0,10})(?:\.[0-9]{1,2})?$/.test(raw))throw Error('Informe as despesas em reais, com até duas casas decimais, inclusive se forem zero.');const [whole,fraction='']=raw.split('.'),cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));if(cents>BigInt(Number.MAX_SAFE_INTEGER))throw Error('O valor das despesas excede o limite seguro.');return Number(cents);}
 async function saveExpenses({zero=false}={}){
  if(!frame||busy||adsBusy||saving||dirty&&draftRevision!==frame.expenses.revision)return false;
  if(zero){el('ExpensesValue').value='0.00';expenseChanged();}
  let amount;try{amount=expenseAmount();}catch(error){el('ExpenseState').textContent=error.message;return false;}
  const selected=month,token=generation,submitted=editSequence,revision=draftRevision,treatment=el('Recharge').value;let saved=false;saving=true;controls();el('ExpenseState').textContent='Salvando as despesas deste mês…';
  try{
   const raw=await api('finance/business-month',{operation:'expenses',month:selected,revision,external_expenses_cents:amount,recharge_treatment:treatment});
   if(token!==generation||selected!==month)return false;
   const result=projectBusinessMonth(raw);if(!result||result.month!==selected)throw Error('As despesas foram enviadas, mas o resultado não pôde ser conferido. Atualize o mês.');
   frame=result;costDiagnosticContext=null;revalidateCostDiagnostic();observeAudits(selected);try{const dailyMonth=globalThis.brazaDayDashboard?.getSelection?.()?.slice(0,7);if(!dailyMonth||dailyMonth===selected)globalThis.brazaDayDashboard?.reset?.({month:selected});}catch{}invalidateCheckpointHistory();draftRevision=result.expenses.revision;
   if(submitted===editSequence){dirty=false;fillExpenses({force:true});}
   saved=true;render();status('Despesas do mês salvas. Produção, imposto e anúncios continuam contabilizados separadamente.');return true;
  }catch(error){
   if(token===generation){
    el('ExpenseState').textContent=error.status===409?'As despesas mudaram em outra sessão. Sua edição foi preservada; carregue os valores salvos antes de salvar.':(error.message||'Não foi possível salvar. Sua edição foi preservada.');
    if(error.status===409){try{const raw=await request('read',selected);if(token===generation)apply(raw,selected);}catch{}}
   }return false;
  }finally{if(token===generation){saving=false;controls();if(saved&&!manualCollection)await readWorkspaceView({selected,background:true});else{schedule();scheduleCatalog();}}}
 }
 async function identify(){
  if(catalogFeature()){catalogNeedsRead=true;return updateCatalog();}
  if(!frame||busy||adsBusy||saving||!frame.unmapped_variants.length||typeof syncVariants!=='function')return;
  const token=generation,selected=month;busy=true;controls();status('Atualizando a identificação dos produtos vendidos…');
  try{await syncVariants(frame.unmapped_variants);if(token!==generation)return;const raw=await request('read',selected);if(token!==generation)return;apply(raw,selected);status('Custos do mês atualizados. Vínculos manuais foram preservados.');}
  catch{if(token===generation)status('A identificação automática ficou pendente. Confira os produtos e custos; os vínculos salvos foram preservados.',true);}
  finally{if(token===generation){busy=false;render();schedule();}}
 }
 function visibilityChanged(){if(!started)return;if(document.hidden){clearTimeout(timer);timer=null;clearTimeout(catalogTimer);catalogTimer=null;}else{schedule();scheduleCatalog();}}
 async function start(options={}){
  if(globalThis.mlsCommercialWorkspace?.isActive?.()===false)return false;
  if(started)return false;if(typeof options.api!=='function'||!el('Select'))return false;
  api=options.api;for(const initialize of [()=>globalThis.brazaExpenseLedger?.start({api,onChanged:async selected=>{if(started&&selected===month)return refreshCosts();}}),()=>globalThis.brazaReconciliation?.start({api}),()=>globalThis.brazaFinancialCloseout?.start({api}),()=>globalThis.brazaEscrowReleases?.start({api}),()=>globalThis.brazaIncomeOverview?.start?.({api})]){try{initialize();}catch{}}syncVariants=options.syncVariants;onCatalogChanged=options.onCatalogChanged;bootstrapPhase='READY';bootstrapCompleted=true;started=true;
  let selected;try{const params=new URLSearchParams(globalThis.location?.search||'');selected=params.getAll('month').length===1?params.get('month'):null;}catch{}try{const dailyMonth=globalThis.brazaDayDashboard?.getSelection?.()?.slice(0,7);if(validMonth(dailyMonth))selected=dailyMonth;}catch{}
  el('Select').max=today().slice(0,7);el('Select').value=validMonth(selected)?selected:bootstrapPrepared&&validMonth(el('Select').value)?el('Select').value:today().slice(0,7);
  el('Refresh').onclick=()=>frame?.status==='COMPLETE'&&!paused&&!collectionRecovery?.waiting?refreshCosts():refresh();el('SourceRefresh').onclick=requestSalesUpdate;el('Select').onchange=()=>readWorkspaceView();
  el('Previous').onclick=()=>{const basis=validMonth(el('Select').value)?el('Select').value:today().slice(0,7),date=new Date(basis+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()-1);el('Select').value=date.toISOString().slice(0,7);readWorkspaceView();};
  el('Pause').onclick=()=>{paused=true;clearTimeout(timer);timer=null;el('Pause').disabled=true;status(busy?'A consulta será pausada após a resposta em andamento.':'Consulta pausada. Use Continuar consulta para retomar.');render();};
  el('ExpensesForm').onsubmit=event=>{event.preventDefault();saveExpenses();};el('ExpensesValue').oninput=expenseChanged;el('Recharge').onchange=expenseChanged;
  el('OpenReconciliation').onclick=()=>globalThis.brazaReconciliation?.open?.()??false;
  el('OpenExpenses').onclick=openExpenses;
  if(el('OpenCalculation'))el('OpenCalculation').onclick=()=>openDetails(el('CalculationDetails'));
  if(el('OpenProducts'))el('OpenProducts').onclick=()=>openDetails(el('ProductsDetails'),el('ProductSearch'));
  if(el('OpenRefunds'))el('OpenRefunds').onclick=()=>globalThis.brazaReconciliation?.open?.()??false;
  if(el('OpenReleases'))el('OpenReleases').onclick=()=>openDetails(document.getElementById('businessEscrowReleasesDetails'));
  el('ExpensesZero').onclick=()=>saveExpenses({zero:true});el('ExpensesReload').onclick=()=>{dirty=false;editSequence++;fillExpenses({force:true});render();schedule();scheduleCatalog();};el('Identify').onclick=identify;
  el('CostCheck').onclick=()=>checkCostDiagnostic();el('CostRecover').onclick=()=>checkCostDiagnostic({recover:true});el('CostCopy').onclick=copyCostDiagnostic;
  el('CheckpointDetails').ontoggle=()=>{if(el('CheckpointDetails').open)loadCheckpointHistory();};
  el('CheckpointHistoryRefresh').onclick=()=>{checkpointHistoryStale=true;return loadCheckpointHistory();};
  for(const name of ['ProductSearch','ProductFilter','ProductSort','ProductPageSize'])el(name)[name==='ProductSearch'?'oninput':'onchange']=()=>{productPage=1;drawProducts();scheduleCatalog();};
  el('ProductPrevious').onclick=()=>{productPage--;drawProducts();scheduleCatalog();};el('ProductNext').onclick=()=>{productPage++;drawProducts();scheduleCatalog();};
  document.addEventListener('visibilitychange',visibilityChanged);
  manualCollection=false;return readWorkspaceView();
 }
 function snapshot(){
  if(!frame)return Object.freeze({schema:'mls_month_snapshot_v1',month,status:null,checked_at:null,balance_cents:null,presentation:null,period_loading:started&&busy,period_change_blocked:monthChangeBlocked(),pending:[],coverage:null,production_coverage:null,ads_spend_cents:null,ads_checked_at:null,ads_pending:null,product_count:null,collection:null,audit_scope:null});
  const summary=buildMonthlyFinancialSummary(frame),coverage=frame.coverage,production=summary?.production_coverage,ads=frame.ads;
  const adsMatches=ads?.status==='AVAILABLE'&&ads.start_date===frame.start_date&&ads.end_date===frame.end_date;
  const scope=costDiagnosticContext?.monthly===frame?projectBusinessMonthAuditScope(costDiagnosticContext.audit_scope):null;
  const auditScope=scope?Object.freeze({...scope,sources:Object.freeze(scope.sources.map(row=>Object.freeze({...row})))}):null;
  return Object.freeze({schema:'mls_month_snapshot_v1',month:frame.month,audit_scope:auditScope,status:frame.status,checked_at:Number.isSafeInteger(frame.checked_at)?frame.checked_at:null,balance_cents:Number.isSafeInteger(summary?.balance_cents)?summary.balance_cents:null,presentation:monthlyPresentation()?Object.freeze({...monthlyPresentation(),monthly_costs_missing:Object.freeze([...monthlyPresentation().monthly_costs_missing])}):null,period_loading:busy,period_change_blocked:monthChangeBlocked(),pending:Array.isArray(frame.result?.pending)?[...frame.result.pending]:[],coverage:coverage?Object.freeze({orders:coverage.orders,paid:coverage.paid,completed:coverage.completed,ongoing:coverage.ongoing,cancelled:coverage.cancelled,cancel_pending:coverage.cancel_pending,unpaid:coverage.unpaid,other:coverage.other,unknown:coverage.unknown,returns:coverage.returns,returns_unknown:coverage.returns_unknown}):null,production_coverage:production?Object.freeze({total_units:production.total_units,known_units:production.known_units,pending_units:production.pending_units}):null,ads_spend_cents:adsMatches&&Number.isSafeInteger(ads.expense_cents)?ads.expense_cents:null,ads_checked_at:adsMatches&&Number.isSafeInteger(ads.fetched_at)?ads.fetched_at:null,ads_pending:frame.result.pending.includes('ADS_UNAVAILABLE'),product_count:Array.isArray(frame.product_summary?.products)?frame.product_summary.products.length:null,collection:frame.collection?Object.freeze({...frame.collection}):null,expense_schedule:['business_month_view_v4','business_month_view_v5'].includes(workspaceView?.schema)&&workspaceView.expense_schedule?Object.freeze({...workspaceView.expense_schedule,upcoming:Object.freeze((workspaceView.expense_schedule.upcoming??[]).map(item=>Object.freeze({...item})))}):null});
 }
 function stop(){for(const shutdown of [()=>globalThis.brazaExpenseLedger?.stop(),()=>globalThis.brazaReconciliation?.stop(),()=>globalThis.brazaFinancialCloseout?.stop(),()=>globalThis.brazaEscrowReleases?.stop(),()=>globalThis.brazaIncomeOverview?.stop?.()]){try{shutdown();}catch{}}started=false;viewRequest++;viewPromise=null;priorityPromise=null;manualCollection=false;resetCostDiagnostic();catalogRequest++;catalogBusy=false;clearTimeout(catalogTimer);catalogTimer=null;paused=true;resumeOnVisible=false;collectionRecovery=null;generation++;checkpointHistoryRequest++;checkpointHistoryBusy=false;busy=false;adsBusy=false;clearTimeout(timer);timer=null;
  if(!globalThis.mlsCommercialWorkspace){controls();return;}
  frame=null;workspaceView=null;variantContributionContext=null;presentationFrame=null;presentationCache=null;month='';saving=false;dirty=false;editSequence++;draftRevision=0;message='';failed=false;
  collectionFailure=null;lastFinancialRefreshAt=0;automaticBlocked=true;adsFailures=0;adsRetryAt=0;viewFailures=0;
  catalogState=null;catalogProducts.clear();catalogVisibleIds=[];catalogSignature='';catalogNeedsRead=true;catalogError='';catalogPaused=false;catalogProductsChanged=false;
  costDiagnosticContext=null;costDiagnostic=null;costDiagnosticEvidence=null;costDiagnosticRaw='';checkpointHistory=null;checkpointHistoryMonth='';checkpointHistoryError='';checkpointHistoryStale=false;checkpointHistoryOpen.clear();productOpen.clear();productPage=1;productMonth='';
  try{m3WorkbenchView?.clear();}catch{}m3WorkbenchView=null;m3PricingDrafts.clear();m3PricingSelections.clear();m3PricingDraftKey=null;m3PricingEvidenceKey='';
  snapshotListeners.clear();document.removeEventListener?.('visibilitychange',visibilityChanged);api=null;syncVariants=null;onCatalogChanged=null;bootstrapRetry=null;bootstrapRetryPending=false;bootstrapPrepared=false;bootstrapCompleted=true;
  for(const value of document.querySelectorAll?.('[id^="businessMonth"],#businessMonth *,#businessMonthPricingObserver *')??[]){if('value'in value)value.value='';if('checked'in value)value.checked=false;value.disabled=true;for(const handler of ['onclick','oninput','onchange','onsubmit','ontoggle','onkeydown','onfocus'])value[handler]=null;value.replaceChildren?.();value.textContent='';}
  monthlyPartialAction=null;
 }
 function selectMonth(selected){if(!started||!validMonth(selected))return Promise.resolve(false);if(selected!==month&&monthChangeBlocked())return Promise.resolve(refuseMonthChange());if(saving)return Promise.resolve(false);el('Select').value=selected;return readWorkspaceView({selected});}

 // Read-only source coverage for the operator; no additional D1 or provider reads.
 // A COMPLETE saved month may end before the selected day.
 function getSourceStatus(){
  const validMonth=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  const validDate=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value);
  const published=workspaceView?.display_source==='PUBLISHED'&&frame?.status==='COMPLETE';
  const daily=workspaceView?.daily_summary?.schema==='business_daily_summary_v1'?workspaceView.daily_summary:null;
  const collection=workspaceView?.collection,automatic=workspaceView?.automatic;
  return Object.freeze({
   schema:'mls_finance_source_coverage_v1',
   month:validMonth(frame?.month)?frame.month:null,
   published_through:published&&validDate(frame?.end_date)?frame.end_date:null,
   published_checked_at:published&&Number.isSafeInteger(frame?.checked_at)?frame.checked_at:null,
   display_source:['PUBLISHED','ACTIVE'].includes(workspaceView?.display_source)?workspaceView.display_source:null,
   daily_summary_state:daily&&['AVAILABLE','PARTIAL','UNAVAILABLE'].includes(daily.state)?daily.state:null,
   daily_summary_present:daily!==null,
   collection_status:typeof collection?.status==='string'&&['RUNNING','COMPLETE','PARTIAL','LIMIT_REACHED','ERROR','PAUSED'].includes(collection.status)?collection.status:null,
   automatic_enabled:typeof automatic?.enabled==='boolean'?automatic.enabled:null,
   automatic_status:typeof automatic?.status==='string'&&['IDLE','RUNNING','COMPLETE','PARTIAL','LIMIT_REACHED','ERROR','PAUSED'].includes(automatic.status)?automatic.status:null,
   // Each value is already included in the validated owner monthly-view response.
   // No second provider/database query and no exposed tokens, order IDs or money.
   windows_complete:Number.isSafeInteger(collection?.progress?.windows_complete)?collection.progress.windows_complete:null,
   windows_total:Number.isSafeInteger(collection?.progress?.windows_total)?collection.progress.windows_total:null,
   pages_read:Number.isSafeInteger(collection?.progress?.pages_read)?collection.progress.pages_read:null,
   collection_checked_at:Number.isSafeInteger(collection?.checked_at)?collection.checked_at:null,
   collection_phase:['READY','RETRY_WAIT','BLOCKED'].includes(collection?.collection?.state)?collection.collection.state:null,
   collection_code:typeof collection?.collection?.code==='string'&&/^BUSINESS_PERIOD_[A-Z_]{3,55}$/.test(collection.collection.code)?collection.collection.code:null,
   retry_after_seconds:Number.isSafeInteger(collection?.collection?.retry_after_seconds)?collection.collection.retry_after_seconds:null,
   automatic_applicable:typeof automatic?.applicable==='boolean'?automatic.applicable:null,
   automatic_next_run_at:Number.isSafeInteger(automatic?.next_run_at)?automatic.next_run_at:null,
   automatic_last_attempt_at:Number.isSafeInteger(automatic?.last_attempt_at)?automatic.last_attempt_at:null
  });
 }

 // Only an explicit owner interaction may prioritize an existing eligible
 // automatic run. This reuses the Finance workbench's validated request and
 // cannot fall back to a manual provider collection from the overview.
 function prioritizeCurrentMonth(){
  if(!started||!workspaceView||!validMonth(month)||month!==today().slice(0,7)||!cronOwnsCollection()||priorityPromise)return Promise.resolve(false);
  return requestSalesUpdate();
 }
 globalThis.brazaMonthDashboard={clientContract,prepare,bootstrapState,start,refresh,refreshCosts,selectMonth,subscribe,openExpenses:()=>started?openExpenses():false,prioritizeCurrentMonth,stop,supportsCatalogQueue:catalogFeature,syncCatalogCandidates,refreshCatalog:()=>{catalogNeedsRead=true;return updateCatalog();},catalogMetadata:item=>catalogProducts.get(item)||null,getSnapshot:snapshot,getAdsSnapshot:()=>projectMissionAdsSnapshot(frame),getSourceStatus};
})();

(()=>{
 const projectExpenseLedger=function projectExpenseLedger(value){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
 const month=v=>typeof v==='string'&&/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
 const day=v=>typeof v==='string'&&/^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const iso=v=>typeof v==='string'&&/^20[0-9]{2}-/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
 const arr=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=200&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
 const keys=['schema','month','revision','mode','expenses_revision','current_external_expenses_cents','recharge_treatment','unallocated_cents','items_total_cents','total_cents','open_cents','paid_cents','overdue_cents','today','items','updated_at'];
 const itemKeys=['id','category','description','amount_cents','competence_month','due_date','status','paid_date','series_id','installment_number','installments','created_at','updated_at'];
 try{
  if(!exact(value,keys)||value.schema!=='expense_ledger_v1'||!month(value.month)||!int(value.revision,0,2147483645)||!['MANUAL','DRAFT','CONFIRMED'].includes(value.mode)||!int(value.expenses_revision,0,2147483646)||!['UNCONFIRMED','ADS_RECHARGE','TECH_SUPPORT'].includes(value.recharge_treatment)||!day(value.today)||!arr(value.items)||value.updated_at!==null&&!iso(value.updated_at))return null;
  if(value.current_external_expenses_cents!==null&&!int(value.current_external_expenses_cents)||(value.expenses_revision===0?(value.current_external_expenses_cents!==null||value.recharge_treatment!=='UNCONFIRMED'):value.current_external_expenses_cents===null))return null;
  for(const key of ['unallocated_cents','items_total_cents','total_cents','open_cents','paid_cents','overdue_cents'])if(!int(value[key]))return null;
  if(value.mode==='MANUAL'?(value.items.length!==0||value.updated_at!==null||value.unallocated_cents!==(value.current_external_expenses_cents??0)):(value.revision<1||value.updated_at===null))return null;
  const ids=new Set();let items=0n,open=0n,paid=0n,overdue=0n;
  for(const item of value.items){
   if(!exact(item,itemKeys)||!uuid(item.id)||ids.has(item.id)||!uuid(item.series_id)||!['RENT','EMPLOYEES','BILL','OTHER'].includes(item.category)||typeof item.description!=='string'||item.description.length<1||item.description.length>160||item.description.trim()!==item.description||/[\u0000-\u001f\u007f]/.test(item.description)||!int(item.amount_cents,1)||item.competence_month!==value.month||!day(item.due_date)||!['OPEN','PAID','CANCELLED'].includes(item.status)||item.paid_date!==null&&(!day(item.paid_date)||item.paid_date>value.today)||item.status==='PAID'&&item.paid_date===null||item.status==='OPEN'&&item.paid_date!==null||!int(item.installments,1,120)||!int(item.installment_number,1,item.installments)||!iso(item.created_at)||!iso(item.updated_at)||item.updated_at<item.created_at)return null;
   ids.add(item.id);if(item.status==='CANCELLED')continue;const amount=BigInt(item.amount_cents);items+=amount;if(item.status==='PAID')paid+=amount;else{open+=amount;if(item.due_date<value.today)overdue+=amount;}
  }
  const total=items+BigInt(value.unallocated_cents);
  if(total>BigInt(Number.MAX_SAFE_INTEGER)||items!==BigInt(value.items_total_cents)||total!==BigInt(value.total_cents)||open!==BigInt(value.open_cents)||paid!==BigInt(value.paid_cents)||overdue!==BigInt(value.overdue_cents)||value.mode==='CONFIRMED'&&value.current_external_expenses_cents!==value.total_cents)return null;
  return {...value,items:value.items.map(item=>({...item}))};
 }catch{return null;}
};
 const el=name=>document.getElementById('businessMonthExpenseLedger'+name);
 const node=(tag,text,cls)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(cls)value.className=cls;return value;};
 const money=value=>{if(!Number.isSafeInteger(value))return 'Não informado';const cents=BigInt(value),fraction=String(cents%100n).padStart(2,'0');return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).formatToParts(cents/100n).map(part=>part.type==='fraction'?fraction:part.value).join('');};
 const inputMoney=value=>{const cents=BigInt(value);return String(cents/100n)+','+String(cents%100n).padStart(2,'0');};
 const validMonth=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&value>='2000-01'&&value<='2099-12';
 const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='2000-01-01'&&value<='2099-12-31'&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 const day=value=>validDay(value)?value.slice(8)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'Não informado';
 const monthLabel=value=>validMonth(value)?value.slice(5)+'/'+value.slice(0,4):'mês selecionado';
 const localToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
 const categories={RENT:'Aluguel do barracão',EMPLOYEES:'Funcionários',BILL:'Boleto / conta a pagar',OTHER:'Outras despesas'};
 const fields=['Description','Category','Amount','Competence','Due','Payment','PaidDate','Installments'];
 let api=null,onChanged=null,started=false,dashboardMonth='',month='',value=null,generation=0,loading=false,busy=false,pending=null,pendingDashboardMonth=null,mutationKey=null,editId=null,draftDirty=false,draftRevision=0,draftSequence=0,reviewDirty=false,reviewRevision=0,reviewExpensesRevision=0,cancelId=null,skipOpeningToggle=false;
 const drafts=new Map(),managed=new Map();
 function status(message,error=false,target='Status'){if(!el(target))return;el(target).textContent=message;el(target).dataset.error=String(error);}
 function hasConflict(){return !!value&&(draftDirty&&draftRevision!==value.revision||reviewDirty&&(reviewRevision!==value.revision||reviewExpensesRevision!==value.expenses_revision));}
 function syncLegacy(){const form=document.getElementById('businessMonthExpensesForm');if(form)form.hidden=managed.has(dashboardMonth)&&managed.get(dashboardMonth)!=='MANUAL';}
 function controls(){
  if(!el(''))return;const unavailable=!started||loading||busy||!value,conflict=hasConflict();
  el('Month').disabled=busy;el('Refresh').disabled=loading||busy;el('Refresh').textContent=loading?'Consultando…':'Consultar despesas';
  for(const key of fields)el(key).disabled=unavailable||key==='Competence'||key==='Installments'&&editId!==null;
  el('Remainder').disabled=unavailable;el('Recharge').disabled=unavailable;el('Confirmed').disabled=unavailable||conflict;
  el('Save').disabled=unavailable||conflict;el('Save').textContent=busy?'Salvando…':editId?'Salvar esta despesa':'Adicionar despesa';
  const confirmation=drawConfirmationPreview();el('Confirm').disabled=unavailable||conflict||!el('Confirmed').checked||!confirmation?.valid;el('CancelEdit').disabled=busy;el('CancelEdit').hidden=!editId&&!draftDirty;el('CancelEdit').textContent=editId?'Cancelar edição':'Descartar rascunho';el('ReloadDraft').hidden=!conflict;el('ReloadDraft').disabled=loading||busy;
  el('PaidDateField').hidden=el('Payment').value!=='PAID';el('InstallmentsField').hidden=editId!==null;syncLegacy();
 }
 function clearDraft(){editId=null;draftDirty=false;draftRevision=value?.revision??0;draftSequence++;el('Description').value='';el('Category').value='RENT';el('Amount').value='';el('Competence').value=month;el('Due').value=month?month+'-01':'';el('Payment').value='OPEN';el('PaidDate').value=value?.today??localToday();el('Installments').value='1';el('EditorTitle').textContent='Adicionar despesa';status('',false,'FormStatus');preview();}
 function rememberDraft(){if(!month||!el(''))return;drafts.set(month,{mutationKey,editId,draftDirty,draftRevision,draftSequence,reviewDirty,reviewRevision,reviewExpensesRevision,fields:Object.fromEntries(fields.map(key=>[key,el(key).value])),remainder:el('Remainder').value,recharge:el('Recharge').value});}
 function restoreDraft(){const saved=drafts.get(month);clearDraft();reviewDirty=false;reviewRevision=0;reviewExpensesRevision=0;el('Remainder').value='';el('Recharge').value='UNCONFIRMED';el('Confirmed').checked=false;if(!saved)return;({mutationKey,editId,draftDirty,draftRevision,draftSequence,reviewDirty,reviewRevision,reviewExpensesRevision}=saved);for(const key of fields)el(key).value=saved.fields[key];el('Remainder').value=saved.remainder;el('Recharge').value=saved.recharge;el('EditorTitle').textContent=editId?'Editar esta despesa':'Adicionar despesa';preview();}
 function amount(name,{zero=false}={}){const raw=el(name).value.trim().replace(',','.');if(!/^(0|[1-9][0-9]{0,13})(?:\.[0-9]{1,2})?$/.test(raw))throw Error('Informe um valor em reais, com até duas casas decimais.');const [whole,fraction='']=raw.split('.'),cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));if(cents>BigInt(Number.MAX_SAFE_INTEGER)||!zero&&cents===0n)throw Error(zero?'O valor excede o limite seguro.':'O valor da despesa precisa ser maior que zero e estar dentro do limite seguro.');return Number(cents);}
 function confirmationAmounts(){
  if(!value)return null;let remaining;try{remaining=amount('Remainder',{zero:true});}catch{return {valid:false,reason:'REMAINDER_INVALID'};}
  const total=BigInt(value.items_total_cents)+BigInt(remaining);if(total>BigInt(Number.MAX_SAFE_INTEGER))return {valid:false,reason:'TOTAL_UNSAFE'};
  const previous=value.current_external_expenses_cents;return {valid:true,items:value.items_total_cents,remaining,total:Number(total),previous,difference:previous===null?null:Number(total-BigInt(previous))};
 }
 function drawConfirmationPreview(){
  const preview=confirmationAmounts();el('ConfirmationPreview').hidden=!value;if(!value)return preview;
  el('ConfirmationPreview').dataset.valid=String(preview.valid);el('ConfirmationPrevious').textContent=value.current_external_expenses_cents===null?'Total anterior: ainda não informado.':'Total anterior informado: '+money(value.current_external_expenses_cents)+'.';
  if(!preview.valid){el('ConfirmationEquation').textContent='Total a conferir';el('ConfirmationDifference').textContent='Diferença: aguardando um total válido.';el('ConfirmationPreviewStatus').textContent=preview.reason==='TOTAL_UNSAFE'?'A soma dos lançamentos com o restante excede o limite seguro. Confira os valores antes de confirmar.':'Informe o restante em reais, inclusive zero, com até duas casas decimais.';el('ConfirmationPreviewStatus').dataset.error='true';return preview;}
  el('ConfirmationEquation').textContent=money(preview.items)+' + '+money(preview.remaining)+' = '+money(preview.total);
  el('ConfirmationDifference').textContent=preview.difference===null?'Diferença: não disponível sem um total anterior.':preview.difference===0?'Diferença: '+money(0)+'. O valor da despesa mensal permanece igual.':'Diferença: '+(preview.difference>0?'+ ':'− ')+money(Math.abs(preview.difference))+'. A despesa mensal '+(preview.difference>0?'aumenta':'diminui')+' nesse valor.';
  el('ConfirmationPreviewStatus').textContent='Prévia de '+monthLabel(month)+', com os lançamentos já salvos. Só “Usar este total no resultado” confirma a substituição do total anterior.';el('ConfirmationPreviewStatus').dataset.error='false';return preview;
 }
 function installmentCount(){const raw=el('Installments').value.trim();if(!/^[1-9][0-9]{0,2}$/.test(raw)||Number(raw)>120)throw Error('Informe de 1 a 120 parcelas mensais.');return editId?1:Number(raw);}
 function preview(){
  if(!el(''))return;let count=1;try{count=installmentCount();}catch{}
  el('AmountLabel').textContent=count>1?'Valor de cada parcela':'Valor da despesa';
  if(editId){el('InstallmentHelp').textContent='A edição altera somente esta despesa ou parcela. As outras parcelas são preservadas.';return;}
  if(count===1){el('InstallmentHelp').textContent='Use 1 para uma despesa única. Para aluguel ou salários repetidos, informe quantos meses deseja cadastrar.';return;}
  let text=count+' parcelas mensais. O valor informado é o de cada parcela, não o total da compra.';try{const total=BigInt(amount('Amount'))*BigInt(count);if(total<=BigInt(Number.MAX_SAFE_INTEGER))text+=' Total programado: '+money(Number(total))+'.';}catch{}
  if(el('Payment').value==='PAID')text+=' Apenas a primeira ficará marcada como paga; as demais ficarão em aberto.';text+=' Cada mês precisa ter suas despesas conferidas.';el('InstallmentHelp').textContent=text;
 }
 function changed(){if(!draftDirty)draftRevision=value?.revision??0;draftDirty=true;draftSequence++;status('',false,'FormStatus');preview();controls();}
 function reviewChanged(){if(!reviewDirty){reviewRevision=value?.revision??0;reviewExpensesRevision=value?.expenses_revision??0;}reviewDirty=true;el('Confirmed').checked=false;controls();}
 function confirmChanged(){if(el('Confirmed').checked&&!reviewDirty){reviewDirty=true;reviewRevision=value?.revision??0;reviewExpensesRevision=value?.expenses_revision??0;}controls();}
 function refillReview(){reviewDirty=false;reviewRevision=value?.revision??0;reviewExpensesRevision=value?.expenses_revision??0;el('Remainder').value=value?inputMoney(value.unallocated_cents):'';el('Recharge').value=value?.recharge_treatment??'UNCONFIRMED';el('Confirmed').checked=false;}
 function render(){
  if(!el(''))return;el('Summary').hidden=!value;el('Form').hidden=!value;el('ConfirmSection').hidden=!value;el('Legacy').hidden=true;el('List').replaceChildren();
  if(!value){controls();return;}
  el('Total').textContent=money(value.items_total_cents);el('Open').textContent=money(value.open_cents);el('Paid').textContent=money(value.paid_cents);
  const overdue=value.overdue_cents>0?' Há '+money(value.overdue_cents)+' em aberto com vencimento anterior a '+day(value.today)+'.':'';
  el('Coverage').textContent=(value.mode==='CONFIRMED'?'Despesas conferidas: '+money(value.total_cents)+' em '+monthLabel(month)+', incluindo '+money(value.unallocated_cents)+' sem detalhamento. Pagas e em aberto entram uma única vez no mês de competência.':value.mode==='DRAFT'?'O cadastro está em conferência. Revise o restante sem detalhamento e confirme o total para concluir as despesas deste mês.':'O mês ainda usa o total informado manualmente. Ao cadastrar despesas, confira o restante antes de usar o novo total.')+overdue;
  if(value.mode!=='CONFIRMED'&&value.current_external_expenses_cents!==null){el('Legacy').hidden=false;el('Legacy').textContent='Total anterior preservado: '+money(value.current_external_expenses_cents)+'. Ele foi mantido como referência sem detalhamento. Se os lançamentos abaixo já estavam nesse valor, reduza o campo “Outras despesas ainda sem detalhamento” antes de confirmar, para contar cada despesa uma só vez.';}
  el('ConfirmHelp').textContent='Lançamentos ativos de '+monthLabel(month)+': '+money(value.items_total_cents)+'. Some apenas as despesas que ainda faltam detalhar. '+(value.mode==='CONFIRMED'?'Edições e cancelamentos dos lançamentos já atualizam este total.':'O cadastro só conclui as despesas do mês após esta conferência.');
  if(!value.items.length)el('List').append(node('p','Nenhuma despesa detalhada neste mês.'));
  for(const entry of value.items){
   const card=node('article',undefined,'expense-ledger-item');card.dataset.cancelled=String(entry.status==='CANCELLED');const heading=node('div',undefined,'expense-ledger-item-heading');heading.append(node('strong',entry.description),node('b',money(entry.amount_cents)));card.append(heading);
   const part=entry.installments>1?' · parcela '+entry.installment_number+'/'+entry.installments:'';card.append(node('p',categories[entry.category]+part+' · competência '+monthLabel(entry.competence_month)+' · vence '+day(entry.due_date)));
   card.append(node('p',entry.status==='CANCELLED'?'Cancelada · preservada no histórico, fora do total.':entry.status==='PAID'?'Pagamento informado em '+day(entry.paid_date)+'.':entry.due_date<value.today?'Em aberto · vencida.':'Em aberto.'));
   if(entry.status!=='CANCELLED'){
    const actions=node('div',undefined,'expense-ledger-actions');const button=(label,handler)=>{const result=node('button',label,'button-secondary');result.type='button';result.disabled=busy||loading;result.onclick=handler;actions.append(result);return result;};
    button('Editar',()=>edit(entry.id));if(entry.status==='OPEN')button('Informar pagamento',()=>edit(entry.id,{paid:true}));
    if(cancelId===entry.id){card.append(node('p','Cancelar esta despesa de '+money(entry.amount_cents)+'? O registro será mantido e seu valor sairá do total.'));button('Confirmar cancelamento',()=>cancel(entry.id));button('Manter despesa',()=>{cancelId=null;render();});}
    else button('Cancelar lançamento',()=>{cancelId=entry.id;render();});card.append(actions);
   }
   el('List').append(card);
  }
  if(hasConflict())status('As despesas mudaram em outra sessão. Sua edição foi preservada. Confira a lista atual e escolha “Carregar valores salvos” antes de salvar novamente.',true,'FormStatus');controls();
 }
 function accept(raw,selected){const result=projectExpenseLedger(raw);if(!result||result.month!==selected)throw Error('INVALID_EXPENSE_RESPONSE');value=result;managed.set(selected,result.mode);if(!draftDirty){draftRevision=result.revision;if(editId&&!result.items.some(entry=>entry.id===editId&&entry.status!=='CANCELLED'))clearDraft();}if(!reviewDirty)refillReview();el('PaidDate').max=result.today;render();return result;}
 function refresh(){
  if(!started||!validMonth(month)||busy)return Promise.resolve(false);if(pending)return pending;
  const selected=month,token=generation;loading=true;controls();status('Consultando despesas de '+monthLabel(selected)+'…');
  const task=(async()=>{try{const raw=await api('finance/expense-ledger?month='+encodeURIComponent(selected));if(!started||token!==generation||selected!==month)return false;accept(raw,selected);status('Despesas salvas de '+monthLabel(selected)+'.'+(hasConflict()?' Há um rascunho que precisa ser revisto.':''));return true;}catch(error){if(started&&token===generation)status(error.status===401?'Entre novamente para consultar as despesas.':'Não foi possível consultar. Os valores já carregados e seus rascunhos foram preservados.',true);return false;}finally{if(token===generation){loading=false;pending=null;controls();}}})();pending=task;return task;
 }
 function selectMonth(selected,{read=true}={}){if(!started||!validMonth(selected)||busy){el('Month').value=month;return Promise.resolve(false);}if(selected!==month){rememberDraft();generation++;month=selected;value=null;pending=null;loading=false;cancelId=null;mutationKey=null;el('Month').value=month;restoreDraft();render();}return read?refresh():Promise.resolve(true);}
 function open(selected=dashboardMonth){if(!started||!validMonth(selected)||busy)return Promise.resolve(false);skipOpeningToggle=true;const details=document.getElementById('businessMonthExpensesDetails');if(details)details.open=true;return selectMonth(selected);}
 function observe(selected){if(!started||!validMonth(selected))return false;if(busy){pendingDashboardMonth=selected===dashboardMonth?null:selected;return true;}if(dashboardMonth!==selected){dashboardMonth=selected;selectMonth(selected,{read:document.getElementById('businessMonthExpensesDetails')?.open===true});}syncLegacy();return true;}
 function edit(id,{paid=false}={}){if(busy||loading||!value)return false;const entry=value.items.find(row=>row.id===id&&row.status!=='CANCELLED');if(!entry)return false;if(draftDirty){status('Salve ou descarte a edição atual antes de abrir outra despesa ou informar um pagamento.',true,'FormStatus');el('Description').focus?.();return false;}editId=id;draftDirty=true;draftRevision=value.revision;draftSequence++;el('Description').value=entry.description;el('Category').value=entry.category;el('Amount').value=inputMoney(entry.amount_cents);el('Competence').value=entry.competence_month;el('Due').value=entry.due_date;el('Payment').value=paid?'PAID':entry.status;el('PaidDate').value=entry.paid_date??value.today;el('Installments').value='1';el('EditorTitle').textContent='Editar esta despesa';status('',false,'FormStatus');if(paid)changed();preview();controls();el('Description').focus?.();return true;}
 function requestId(payload){const signature=JSON.stringify(payload);if(mutationKey?.signature===signature)return mutationKey.id;const id=globalThis.crypto?.randomUUID?.();if(!id)throw Error('REQUEST_ID_UNAVAILABLE');mutationKey={signature,id};return id;}
 async function mutate(payload,success,{clearEditor=false}={}){
  if(!started||!value||busy||loading||hasConflict())return false;const selected=month,token=generation,sequence=draftSequence,before=value;
  let body;try{body={...payload,request_id:requestId(payload)};}catch{status('Não foi possível preparar o cadastro neste navegador. Atualize a página e tente novamente.',true);return false;}
  busy=true;cancelId=null;render();status('Salvando despesas…');
  try{const raw=await api('finance/expense-ledger',body);if(!started||token!==generation||selected!==month)return false;const result=projectExpenseLedger(raw);if(!result||result.month!==selected)throw Error('INVALID_EXPENSE_RESPONSE');const ownRevision=result.revision===payload.revision||result.revision===payload.revision+1,sameDraft=editId===null||JSON.stringify(before.items.find(entry=>entry.id===editId))===JSON.stringify(result.items.find(entry=>entry.id===editId)),sameReview=before.unallocated_cents===result.unallocated_cents&&before.recharge_treatment===result.recharge_treatment;value=result;if(clearEditor&&sequence===draftSequence&&ownRevision||payload.action==='cancel'&&editId===payload.id)clearDraft();else if(draftDirty&&ownRevision&&sameDraft)draftRevision=result.revision;if(payload.action==='confirm'&&ownRevision)reviewDirty=false;else if(reviewDirty&&ownRevision&&sameReview){reviewRevision=result.revision;reviewExpensesRevision=result.expenses_revision;el('Confirmed').checked=false;}accept(result,selected);mutationKey=null;drafts.delete(selected);const notice=success+(ownRevision?'':' Outra sessão alterou as despesas em seguida. Confira os valores salvos antes de continuar.');status(notice);try{const refreshed=await onChanged?.(selected,result);if(refreshed===false)status(notice+' Recalcule o resumo para atualizar os valores exibidos.');}catch{status(notice+' Recalcule o resumo para atualizar os valores exibidos.');}return true;}
  catch(error){if(started&&token===generation){const conflict=error.status===409,code=error.code??error.apiCode;status(code==='EXPENSE_LEDGER_LIMIT'?'O limite de lançamentos foi atingido. Revise a quantidade de parcelas. Seu rascunho foi preservado.':conflict?'As despesas foram alteradas em outra sessão. Seu rascunho foi preservado; consulte os valores atuais antes de salvar.':error.status===401?'Entre novamente para salvar. Seu rascunho foi preservado.':'Não foi possível confirmar o salvamento. Seu rascunho foi preservado; repetir o mesmo envio não cria outra despesa.',true);if(conflict&&code!=='EXPENSE_LEDGER_LIMIT'){try{const raw=await api('finance/expense-ledger?month='+encodeURIComponent(selected));if(started&&token===generation)accept(raw,selected);}catch{}}}return false;}
  finally{if(token===generation){busy=false;render();const selected=pendingDashboardMonth;pendingDashboardMonth=null;if(selected)observe(selected);}}
 }
 function save(){
  if(!value||busy||loading||hasConflict())return Promise.resolve(false);let entry,count;try{const description=el('Description').value.trim();if(!description||description.length>160)throw Error('Descreva a despesa com até 160 caracteres.');const category=el('Category').value;if(!Object.hasOwn(categories,category))throw Error('Escolha a categoria da despesa.');const due=el('Due').value,payment=el('Payment').value,paid=el('PaidDate').value;if(!validDay(due))throw Error('Informe um vencimento válido.');if(!['OPEN','PAID'].includes(payment))throw Error('Escolha a situação do pagamento.');if(payment==='PAID'&&(!validDay(paid)||paid>value.today))throw Error('Informe a data do pagamento, até '+day(value.today)+'.');count=installmentCount();entry={id:editId,category,description,amount_cents:amount('Amount'),competence_month:month,due_date:due,status:payment,paid_date:payment==='PAID'?paid:null};}catch(error){status(error.message,true,'FormStatus');return Promise.resolve(false);}
  return mutate({action:'save',month,revision:value.revision,entry,installments:count},count>1?count+' parcelas mensais cadastradas. Consulte os próximos meses para conferir seus totais.':'Despesa salva. '+(value.mode==='CONFIRMED'?'O total conferido foi atualizado.':'Confira o total do mês para usá-lo no resultado.'),{clearEditor:true});
 }
 function cancel(id){if(!value||cancelId!==id)return Promise.resolve(false);return mutate({action:'cancel',month,revision:value.revision,id},'Despesa cancelada e preservada no histórico.');}
 function confirm(){if(!value||!el('Confirmed').checked||hasConflict())return Promise.resolve(false);const preview=drawConfirmationPreview();if(!preview?.valid){controls();return Promise.resolve(false);}const treatment=el('Recharge').value;if(!['UNCONFIRMED','ADS_RECHARGE','TECH_SUPPORT'].includes(treatment)){status('Confira a classificação do ajuste de anúncios.',true);return Promise.resolve(false);}return mutate({action:'confirm',month,revision:value.revision,unallocated_cents:preview.remaining,expenses_revision:value.expenses_revision,recharge_treatment:treatment},'Total de despesas confirmado para '+monthLabel(month)+'. O resultado mensal considera este valor uma única vez.');}
 function start(options={}){
  if(started||typeof options.api!=='function'||!el(''))return false;api=options.api;onChanged=options.onChanged;started=true;
  el('Refresh').onclick=()=>selectMonth(el('Month').value);el('Month').onchange=()=>selectMonth(el('Month').value);el('Form').onsubmit=event=>{event.preventDefault();return save();};
  for(const key of fields)el(key)[['Category','Payment','Competence','Due','PaidDate'].includes(key)?'onchange':'oninput']=changed;
  el('Remainder').oninput=reviewChanged;el('Recharge').onchange=reviewChanged;el('Confirmed').onchange=confirmChanged;el('Confirm').onclick=confirm;
  el('CancelEdit').onclick=()=>{clearDraft();controls();};el('ReloadDraft').onclick=()=>{const id=editId;clearDraft();if(id)edit(id);refillReview();render();status('Valores salvos carregados. Confira sua edição antes de enviar.');};
  const details=document.getElementById('businessMonthExpensesDetails');if(details)details.ontoggle=()=>{if(!details.open){skipOpeningToggle=false;return Promise.resolve(false);}if(skipOpeningToggle){skipOpeningToggle=false;return Promise.resolve(false);}return !value&&!pending?refresh():Promise.resolve(false);};
  controls();return true;
 }
 function stop(){rememberDraft();started=false;generation++;pending=null;pendingDashboardMonth=null;loading=false;busy=false;skipOpeningToggle=false;controls();}
 globalThis.brazaExpenseLedger={start,observe,refresh,open,stop};
})();

(()=>{
 function projectReconciliationFrame(value){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const cents=(item,signed=false)=>item===null||int(item,signed?Number.MIN_SAFE_INTEGER:0);
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const hash=item=>typeof item==='string'&&/^[a-f0-9]{64}$/.test(item);
 const pendingCodes=['SOURCE_COLLECTING','ORDER_EVIDENCE_MISSING','ADJUSTMENT_FIELDS_UNAVAILABLE','ADJUSTMENT_CONFLICT','RETURN_REFERENCES_MISSING','RETURN_DETAILS_PENDING','RETURN_PERMISSION_REQUIRED','RETURN_VALUES_UNVERIFIED','RETURN_STATUS_UNRECOGNIZED','SETTLEMENT_NOT_RECONCILED'];
 const caseStatuses=['PENDING','UNKNOWN','REQUESTED','ACCEPTED','CANCELLED','JUDGING','REFUND_PAID','CLOSED','PROCESSING'];
 const caseDiagnostics=['DETAILS_PENDING','PERMISSION_DENIED','RATE_LIMIT','TIMEOUT','UNAVAILABLE','INVALID_RESPONSE','UNKNOWN_STATUS','CURRENCY_MISMATCH'];
 try{
  const keys=['schema','run_id','source_revision','start_date','end_date','checked_at','status','source_checked_at','coverage','adjustments','returns','cases','truncation','pending','basis'];
  if(!exact(value,keys)||value.schema!=='finance_reconciliation_v1'||typeof value.run_id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.run_id)||!int(value.source_revision,1,2147483647)||!day(value.start_date)||!day(value.end_date)||value.start_date<'2000-01-01'||value.end_date<value.start_date||(Date.parse(value.end_date)-Date.parse(value.start_date))/86400000>14||!int(value.checked_at,1,9999999999)||!['CHECKED','PARTIAL','COLLECTING','BLOCKED'].includes(value.status)||value.basis!=='SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT')return null;
  if(value.end_date>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000)))return null;
  const c=value.coverage,a=value.adjustments,r=value.returns,s=value.source_checked_at,t=value.truncation,p=value.pending;
  const coverageKeys=['orders','evidence_orders','missing_evidence_orders','paid_orders','review_orders','return_orders','return_unknown_orders'];
  if(!exact(c,coverageKeys)||!coverageKeys.every(key=>int(c[key],0,1000))||c.evidence_orders+c.missing_evidence_orders!==c.orders||c.paid_orders+c.review_orders>c.orders||c.return_orders+c.return_unknown_orders>c.paid_orders)return null;
  if(!exact(a,['reported_orders','missing_orders','conflicting_orders','known_adjustment_cents','base_repass_cents','after_adjustment_repass_cents'])||!['reported_orders','missing_orders','conflicting_orders'].every(key=>int(a[key],0,c.paid_orders))||a.reported_orders+a.missing_orders+a.conflicting_orders!==c.paid_orders||!int(a.known_adjustment_cents,Number.MIN_SAFE_INTEGER)||!cents(a.base_repass_cents,true)||!cents(a.after_adjustment_repass_cents,true)||a.reported_orders===0&&a.known_adjustment_cents!==0)return null;
  if(a.after_adjustment_repass_cents!==null&&(a.reported_orders!==c.paid_orders||a.missing_orders!==0||a.conflicting_orders!==0||a.base_repass_cents===null||BigInt(a.base_repass_cents)+BigInt(a.known_adjustment_cents)!==BigInt(a.after_adjustment_repass_cents)))return null;
  if(!exact(r,['reference_count','checked_count','pending_count','known_requested_refund_cents','requested_amount_complete','permission'])||!['reference_count','checked_count','pending_count'].every(key=>int(r[key],0,100000))||r.checked_count+r.pending_count!==r.reference_count||!int(r.known_requested_refund_cents)||typeof r.requested_amount_complete!=='boolean'||!['UNKNOWN','AVAILABLE','DENIED'].includes(r.permission)||r.checked_count===0&&r.known_requested_refund_cents!==0||r.requested_amount_complete&&r.pending_count!==0||r.reference_count===0&&!r.requested_amount_complete)return null;
  if(!exact(s,['finance_oldest_at','finance_latest_at','returns_oldest_at','returns_latest_at']))return null;
  for(const scope of ['finance','returns']){
   const oldest=s[scope+'_oldest_at'],latest=s[scope+'_latest_at'];
   if((oldest===null)!==(latest===null)||oldest!==null&&(!int(oldest,1,value.checked_at)||!int(latest,oldest,value.checked_at)))return null;
  }
  if(c.orders>0&&s.finance_oldest_at===null||(r.checked_count===0)!==(s.returns_oldest_at===null))return null;
  if(!array(value.cases,40)||!exact(t,['truncated','cases_total','cases_included'])||typeof t.truncated!=='boolean'||t.cases_total!==r.reference_count||t.cases_included!==value.cases.length||t.cases_included>t.cases_total||t.truncated!==(t.cases_included<t.cases_total))return null;
  const seen=new Set(),cases=[];let visibleChecked=0,visibleKnown=0n,visibleMissingAmount=false,visibleUnknown=false;
  for(const item of value.cases){
   if(!exact(item,['case_hash','order_hash','status','requested_refund_cents','checked_at','diagnostic'])||!hash(item.case_hash)||!hash(item.order_hash)||seen.has(item.case_hash)||!caseStatuses.includes(item.status)||!cents(item.requested_refund_cents)||item.diagnostic!==null&&!caseDiagnostics.includes(item.diagnostic))return null;
   seen.add(item.case_hash);
   if(item.checked_at===null){
    if(item.status!=='PENDING'||item.requested_refund_cents!==null||item.diagnostic===null||item.diagnostic==='UNKNOWN_STATUS')return null;
   }else{
    if(!int(item.checked_at,1,value.checked_at)||item.status==='PENDING'||![null,'UNKNOWN_STATUS'].includes(item.diagnostic)||item.checked_at<s.returns_oldest_at||item.checked_at>s.returns_latest_at||(item.status==='UNKNOWN')!==(item.diagnostic==='UNKNOWN_STATUS'))return null;
    visibleChecked++;
    if(item.requested_refund_cents===null)visibleMissingAmount=true;else visibleKnown+=BigInt(item.requested_refund_cents);
    if(item.status==='UNKNOWN')visibleUnknown=true;
   }
   cases.push({...item});
  }
  if(visibleChecked>r.checked_count||visibleKnown>BigInt(r.known_requested_refund_cents)||r.requested_amount_complete&&visibleMissingAmount)return null;
  if(!t.truncated&&(visibleChecked!==r.checked_count||visibleKnown!==BigInt(r.known_requested_refund_cents)||r.requested_amount_complete!==(r.pending_count===0&&!visibleMissingAmount)))return null;
  if(!array(p,pendingCodes.length)||new Set(p).size!==p.length||!p.every(code=>pendingCodes.includes(code))||!p.includes('SETTLEMENT_NOT_RECONCILED'))return null;
  const required=[...(c.missing_evidence_orders>0?['ORDER_EVIDENCE_MISSING']:[]),...(a.missing_orders>0?['ADJUSTMENT_FIELDS_UNAVAILABLE']:[]),...(a.conflicting_orders>0?['ADJUSTMENT_CONFLICT']:[]),...(c.return_unknown_orders>0||r.reference_count<c.return_orders?['RETURN_REFERENCES_MISSING']:[]),...(r.pending_count>0?['RETURN_DETAILS_PENDING']:[]),...(r.permission==='DENIED'?['RETURN_PERMISSION_REQUIRED']:[]),...(r.reference_count>0?['RETURN_VALUES_UNVERIFIED']:[]),...(visibleUnknown?['RETURN_STATUS_UNRECOGNIZED']:[])];
  if(!required.every(code=>p.includes(code))||value.status==='COLLECTING'&&!p.includes('SOURCE_COLLECTING')||value.status==='BLOCKED'&&!p.includes('RETURN_PERMISSION_REQUIRED'))return null;
  if(value.status==='CHECKED'&&(p.some(code=>!['SETTLEMENT_NOT_RECONCILED','RETURN_VALUES_UNVERIFIED'].includes(code))||a.base_repass_cents===null||a.after_adjustment_repass_cents===null))return null;
  return {schema:value.schema,run_id:value.run_id,source_revision:value.source_revision,start_date:value.start_date,end_date:value.end_date,checked_at:value.checked_at,status:value.status,source_checked_at:{...s},coverage:{...c},adjustments:{...a},returns:{...r},cases,truncation:{...t},pending:[...p],basis:value.basis};
 }catch{return null;}
}
 function projectReconciliationEvidenceFrame(value,projectLegacy){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const hash=item=>typeof item==='string'&&/^[a-f0-9]{64}$/.test(item);
 const states=['NOT_APPLICABLE','PENDING','RETRY_WAIT','KNOWN_EMPTY','AVAILABLE'],categories={IN_CANCEL:'in_cancel',TO_RETURN:'to_return',OTHER_STATUS:'other',UNKNOWN_STATUS:'unknown'},diagnostics=['DETAILS_PENDING','PERMISSION_DENIED','RATE_LIMIT','TIMEOUT','UNAVAILABLE','INVALID_RESPONSE','UNKNOWN_STATUS','CURRENCY_MISMATCH'];
 try{
  if(typeof projectLegacy!=='function'||!exact(value,['schema','report','review'])||value.schema!=='finance_reconciliation_v2')return null;
  const report=projectLegacy(value.report),r=value.review;if(!report||!exact(r,['schema','summary','orders','truncation','basis'])||r.schema!=='finance_review_orders_v1'||r.basis!=='REVIEW_ORDERS_OUTSIDE_PAID_COHORT'||!exact(r.summary,['orders','in_cancel','to_return','other','unknown'])||!Object.values(r.summary).every(count=>int(count,0,1000))||r.summary.orders!==report.coverage.review_orders||r.summary.in_cancel+r.summary.to_return+r.summary.other+r.summary.unknown!==r.summary.orders||!array(r.orders,40))return null;
  const t=r.truncation;if(!exact(t,['truncated','orders_total','orders_included'])||typeof t.truncated!=='boolean'||t.orders_total!==r.summary.orders||t.orders_included!==r.orders.length||t.orders_included!==Math.min(40,t.orders_total)||t.truncated!==(t.orders_included<t.orders_total))return null;
  const seen=new Set(),orders=[],counts={in_cancel:0,to_return:0,other:0,unknown:0};let references=0,checked=0,pending=0;
  for(const row of r.orders){
   if(!exact(row,['order_hash','status','source_checked_at','reference_state','reference_count','references_checked_at','reference_diagnostic','next_attempt_at','checked_cases','pending_cases'])||!hash(row.order_hash)||seen.has(row.order_hash)||!Object.hasOwn(categories,row.status)||!int(row.source_checked_at,report.source_checked_at.finance_oldest_at??1,report.source_checked_at.finance_latest_at??0)||!states.includes(row.reference_state)||row.reference_diagnostic!==null&&!diagnostics.includes(row.reference_diagnostic)||row.next_attempt_at!==null&&!int(row.next_attempt_at,1,9999999999))return null;
   seen.add(row.order_hash);counts[categories[row.status]]++;
   const known=['KNOWN_EMPTY','AVAILABLE'].includes(row.reference_state),cases=report.cases.filter(item=>item.order_hash===row.order_hash),visibleChecked=cases.filter(item=>item.checked_at!==null).length;
   if(known){
    if(!int(row.reference_count,0,100)||!int(row.checked_cases,0,row.reference_count)||!int(row.pending_cases,0,row.reference_count)||row.checked_cases+row.pending_cases!==row.reference_count||!int(row.references_checked_at,1,report.checked_at)||(row.reference_state==='KNOWN_EMPTY')!==(row.reference_count===0)||row.reference_diagnostic==='DETAILS_PENDING'||visibleChecked>row.checked_cases||cases.length-visibleChecked>row.pending_cases)return null;
    if(!report.truncation.truncated&&(cases.length!==row.reference_count||visibleChecked!==row.checked_cases))return null;
    references+=row.reference_count;checked+=row.checked_cases;pending+=row.pending_cases;
   }else{
    if(row.reference_count!==null||row.references_checked_at!==null||row.checked_cases!==null||row.pending_cases!==null||cases.length)return null;
    if(row.reference_state==='NOT_APPLICABLE'){if(row.status==='TO_RETURN'||row.reference_diagnostic!==null||row.next_attempt_at!==null)return null;}
    else if(row.status!=='TO_RETURN')return null;
    if(row.reference_state==='RETRY_WAIT'&&(row.next_attempt_at===null||row.next_attempt_at<=report.checked_at||row.reference_diagnostic===null||row.reference_diagnostic==='DETAILS_PENDING'))return null;
    if(row.reference_state==='PENDING'&&row.reference_diagnostic!==null&&row.reference_diagnostic!=='DETAILS_PENDING'&&row.next_attempt_at!==null&&row.next_attempt_at>report.checked_at)return null;
   }
   orders.push({...row});
  }
  if(Object.entries(counts).some(([key,count])=>count>r.summary[key]||!t.truncated&&count!==r.summary[key])||references>report.returns.reference_count||checked>report.returns.checked_count||pending>report.returns.pending_count)return null;
  if(!t.truncated&&report.coverage.orders===report.coverage.review_orders&&report.cases.some(row=>!seen.has(row.order_hash)))return null;
  const result={schema:'finance_reconciliation_v2',report,review:{schema:r.schema,summary:{...r.summary},orders,truncation:{...t},basis:r.basis}};
  // Every surviving string is an ASCII identifier, date or allowlisted enum.
  return JSON.stringify(result).length<=65536?result:null;
 }catch{return null;}
}
 function projectReconciliationMoneyFrame(value,projectLegacy,projectReview){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const cent=item=>item===null||int(item,Number.MIN_SAFE_INTEGER);
 const hash=item=>typeof item==='string'&&/^[a-f0-9]{64}$/.test(item);
 const cohorts=['PAID','REVIEW','OTHER'],statuses=['PENDING','UNKNOWN','REQUESTED','ACCEPTED','CANCELLED','JUDGING','REFUND_PAID','CLOSED','PROCESSING'];
 try{
  if(typeof projectLegacy!=='function'||typeof projectReview!=='function'||!exact(value,['schema','report','review','money'])||value.schema!=='finance_reconciliation_v3')return null;
  const evidence=projectReview({schema:'finance_reconciliation_v2',report:value.report,review:value.review},projectLegacy),m=value.money;
  if(!evidence||!exact(m,['schema','currency','groups','payouts','truncation','basis'])||m.schema!=='finance_reconciliation_money_v1'||m.currency!=='BRL'||m.basis!=='SAVED_RETURN_AMOUNTS_AND_PAID_PAYOUT_AFTER_ADJUSTMENTS'||!array(m.groups,3)||m.groups.length!==3||!array(m.payouts,40))return null;
  const report=evidence.report,review=evidence.review,groups=[],byCohort=new Map(),sourceTimes=[],cohortLimits={PAID:report.coverage.paid_orders,REVIEW:report.coverage.review_orders,OTHER:report.coverage.orders-report.coverage.paid_orders-report.coverage.review_orders};
  let allCases=0,allChecked=0,allKnown=0,allAmount=0n,unknown=0;
  for(let groupIndex=0;groupIndex<cohorts.length;groupIndex++){
   const row=m.groups[groupIndex];if(!exact(row,['cohort','statuses','source_checked_at'])||row.cohort!==cohorts[groupIndex]||!array(row.statuses,statuses.length)||row.statuses.length!==statuses.length||!exact(row.source_checked_at,['oldest_at','latest_at']))return null;
   let cases=0,observed=0;const checkedStatuses=[];
   for(let index=0;index<statuses.length;index++){
    const item=row.statuses[index];if(!exact(item,['status','cases','amount_known','known_amount_cents'])||item.status!==statuses[index]||!int(item.cases,0,100000)||!int(item.amount_known,0,item.cases)||!int(item.known_amount_cents)||item.amount_known===0&&item.known_amount_cents!==0||item.status==='PENDING'&&(item.amount_known!==0||item.known_amount_cents!==0))return null;
    cases+=item.cases;if(item.status!=='PENDING')observed+=item.cases;if(item.status==='UNKNOWN')unknown+=item.cases;allKnown+=item.amount_known;allAmount+=BigInt(item.known_amount_cents);checkedStatuses.push({...item});
   }
   if(cohortLimits[row.cohort]===0&&cases!==0)return null;
   const s=row.source_checked_at;
   if(observed===0){if(s.oldest_at!==null||s.latest_at!==null)return null;}
   else{if(!int(s.oldest_at,report.source_checked_at.returns_oldest_at??1,report.source_checked_at.returns_latest_at??0)||!int(s.latest_at,s.oldest_at,report.source_checked_at.returns_latest_at??0))return null;sourceTimes.push(s.oldest_at,s.latest_at);}
   const projected={cohort:row.cohort,statuses:checkedStatuses,source_checked_at:{...s}};groups.push(projected);byCohort.set(row.cohort,{value:projected,cases,observed,visible:statuses.map(status=>({status,cases:0,amount_known:0,known_amount_cents:0n})),visibleTimes:[],payoutReferences:0,payoutCount:0});allCases+=cases;allChecked+=observed;
  }
  if(allCases!==report.returns.reference_count||allChecked!==report.returns.checked_count||allCases-allChecked!==report.returns.pending_count||allAmount!==BigInt(report.returns.known_requested_refund_cents)||report.returns.requested_amount_complete!==(allKnown===allCases)||unknown>0&&!report.pending.includes('RETURN_STATUS_UNRECOGNIZED'))return null;
  if(sourceTimes.length?(Math.min(...sourceTimes)!==report.source_checked_at.returns_oldest_at||Math.max(...sourceTimes)!==report.source_checked_at.returns_latest_at):report.source_checked_at.returns_oldest_at!==null)return null;
  const t=m.truncation;if(!exact(t,['truncated','payouts_total','payouts_included'])||typeof t.truncated!=='boolean'||!int(t.payouts_total,report.coverage.return_orders+review.summary.to_return,report.coverage.orders)||t.payouts_included!==m.payouts.length||t.payouts_included!==Math.min(40,t.payouts_total)||t.truncated!==(t.payouts_included<t.payouts_total))return null;
  const payouts=[],byHash=new Map(),reviewByHash=new Map(review.orders.map(row=>[row.order_hash,row])),paidStates={AVAILABLE:0,MISSING:0,CONFLICT:0};let paidBase=0n,paidBaseKnown=true,paidDelta=0n,paidAfter=0n;
  for(const row of m.payouts){
   if(!exact(row,['order_hash','cohort','source_checked_at','reference_count','state','base_repass_cents','adjustment_cents','after_adjustment_repass_cents'])||!hash(row.order_hash)||byHash.has(row.order_hash)||!cohorts.includes(row.cohort)||!int(row.source_checked_at,report.source_checked_at.finance_oldest_at??1,report.source_checked_at.finance_latest_at??0)||row.reference_count!==null&&!int(row.reference_count,0,100)||!['AVAILABLE','MISSING','CONFLICT','NOT_IN_PAID_COHORT'].includes(row.state)||!cent(row.base_repass_cents)||!cent(row.adjustment_cents)||!cent(row.after_adjustment_repass_cents))return null;
   const group=byCohort.get(row.cohort),linked=reviewByHash.get(row.order_hash);group.payoutCount++;group.payoutReferences+=row.reference_count??0;
   if(group.payoutCount>cohortLimits[row.cohort]||linked&&(row.cohort!=='REVIEW'||row.source_checked_at!==linked.source_checked_at||row.reference_count!==linked.reference_count)||row.cohort==='REVIEW'&&!review.truncation.truncated&&!linked)return null;
   if(row.cohort!=='PAID'){
    if(row.state!=='NOT_IN_PAID_COHORT'||row.base_repass_cents!==null||row.adjustment_cents!==null||row.after_adjustment_repass_cents!==null)return null;
   }else{
    if(row.state==='NOT_IN_PAID_COHORT'||report.adjustments.base_repass_cents!==null&&row.base_repass_cents===null)return null;
    paidStates[row.state]++;if(row.base_repass_cents===null)paidBaseKnown=false;else paidBase+=BigInt(row.base_repass_cents);
    if(row.state==='AVAILABLE'){
     if(row.base_repass_cents===null||row.adjustment_cents===null||row.after_adjustment_repass_cents===null||BigInt(row.base_repass_cents)+BigInt(row.adjustment_cents)!==BigInt(row.after_adjustment_repass_cents))return null;
     paidDelta+=BigInt(row.adjustment_cents);paidAfter+=BigInt(row.after_adjustment_repass_cents);
    }else if(row.adjustment_cents!==null||row.after_adjustment_repass_cents!==null)return null;
   }
   const cases=report.cases.filter(item=>item.order_hash===row.order_hash);
   if(cases.length>(row.reference_count??0)||!report.truncation.truncated&&row.reference_count!==null&&cases.length!==row.reference_count)return null;
   const projected={...row};payouts.push(projected);byHash.set(row.order_hash,projected);
  }
  if(paidStates.AVAILABLE>report.adjustments.reported_orders||paidStates.MISSING>report.adjustments.missing_orders||paidStates.CONFLICT>report.adjustments.conflicting_orders)return null;
  if(paidStates.AVAILABLE===report.adjustments.reported_orders&&paidDelta!==BigInt(report.adjustments.known_adjustment_cents))return null;
  if(byCohort.get('PAID').payoutCount===report.coverage.paid_orders){
   if(paidStates.AVAILABLE!==report.adjustments.reported_orders||paidStates.MISSING!==report.adjustments.missing_orders||paidStates.CONFLICT!==report.adjustments.conflicting_orders||paidBaseKnown!==(report.adjustments.base_repass_cents!==null)||paidBaseKnown&&paidBase!==BigInt(report.adjustments.base_repass_cents)||report.adjustments.after_adjustment_repass_cents!==null&&paidAfter!==BigInt(report.adjustments.after_adjustment_repass_cents))return null;
  }
  for(const item of report.cases){
   const payout=byHash.get(item.order_hash);if(!payout)return null;const group=byCohort.get(payout.cohort),visible=group.visible[statuses.indexOf(item.status)];visible.cases++;
   if(item.requested_refund_cents!==null){visible.amount_known++;visible.known_amount_cents+=BigInt(item.requested_refund_cents);}
   if(item.checked_at!==null){if(item.checked_at<group.value.source_checked_at.oldest_at||item.checked_at>group.value.source_checked_at.latest_at)return null;group.visibleTimes.push(item.checked_at);}
  }
  for(const group of byCohort.values()){
   if(group.payoutReferences>group.cases||!t.truncated&&group.payoutReferences!==group.cases)return null;
   for(let index=0;index<statuses.length;index++){const full=group.value.statuses[index],seen=group.visible[index];if(seen.cases>full.cases||seen.amount_known>full.amount_known||seen.known_amount_cents>BigInt(full.known_amount_cents)||!report.truncation.truncated&&(seen.cases!==full.cases||seen.amount_known!==full.amount_known||seen.known_amount_cents!==BigInt(full.known_amount_cents)))return null;}
   if(!report.truncation.truncated&&group.visibleTimes.length&&(Math.min(...group.visibleTimes)!==group.value.source_checked_at.oldest_at||Math.max(...group.visibleTimes)!==group.value.source_checked_at.latest_at))return null;
  }
  if(!review.truncation.truncated&&review.orders.reduce((count,row)=>count+(row.reference_count??0),0)!==byCohort.get('REVIEW').cases)return null;
  const result={schema:'finance_reconciliation_v3',report,review,money:{schema:m.schema,currency:m.currency,groups,payouts,truncation:{...t},basis:m.basis}};
  // All projected strings are ASCII identifiers or fixed allowlisted labels.
  return JSON.stringify(result).length<=65536?result:null;
 }catch{return null;}
}
 function projectBusinessReconciliation(value,projectFrame){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const integer=(item,min=0,max=9999999999)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const uuid=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
 const safeCodes=['UNAVAILABLE','CONFIGURATION','RESPONSE_INVALID','REDIRECT_REJECTED','HTTP_ERROR','CONTENT_TYPE_INVALID','BODY_LIMIT','JSON_INVALID','FRAME_INVALID','SCOPE_MISMATCH','TIMEOUT','NETWORK_ERROR','BODY_READ_ERROR','SOURCE_UNAVAILABLE','PERMISSION_REQUIRED'].map(suffix=>'FINANCE_RECONCILIATION_'+suffix);
 try{
  if(typeof projectFrame!=='function'||!exact(value,['schema','month','start_date','end_date','checked_at','status','source_revision','sources','reports','attempts','pending'])||value.schema!=='business_reconciliation_v1'||typeof value.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||value.month<'2000-01'||value.start_date!==value.month+'-01'||!day(value.start_date)||!integer(value.checked_at,1)||!['COLLECTING','RUNNING','CHECKED','PARTIAL','UNAVAILABLE'].includes(value.status)||!array(value.sources,3)||!array(value.reports,3)||!array(value.attempts,3)||!array(value.pending,3)||new Set(value.pending).size!==value.pending.length||!value.pending.every(code=>['PUBLICATION_REQUIRED','RECONCILIATION_PENDING','SOURCE_UNAVAILABLE'].includes(code)))return null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000));if(value.month>today.slice(0,7))return null;
  if(!value.sources.length){if(value.status!=='COLLECTING'||value.end_date!==null||value.source_revision!==null||value.reports.length||value.attempts.length||JSON.stringify(value.pending)!==JSON.stringify(['PUBLICATION_REQUIRED']))return null;return {...value,sources:[],reports:[],attempts:[],pending:[...value.pending]};}
  if(!day(value.end_date)||value.end_date.slice(0,7)!==value.month||value.end_date>today||!integer(value.source_revision,1,2147483647)||value.sources.length!==Math.ceil(Number(value.end_date.slice(8))/15)||value.status==='COLLECTING'||value.pending.includes('PUBLICATION_REQUIRED'))return null;
  const byId=new Map(),reports=[],attempts=[];
  for(let index=0;index<value.sources.length;index++){const source=value.sources[index],start=value.month+'-'+String(index*15+1).padStart(2,'0'),end=value.month+'-'+String(Math.min(index*15+15,Number(value.end_date.slice(8)))).padStart(2,'0');if(!exact(source,['run_id','source_revision','start_date','end_date'])||!uuid(source.run_id)||byId.has(source.run_id)||!integer(source.source_revision,1,2147483647)||source.start_date!==start||source.end_date!==end)return null;byId.set(source.run_id,source);}
  const seen=new Set();for(const raw of value.reports){const frame=projectFrame(raw),source=frame?byId.get(frame.run_id):null;if(!source||seen.has(frame.run_id)||frame.source_revision!==source.source_revision||frame.start_date!==source.start_date||frame.end_date!==source.end_date||frame.checked_at>value.checked_at)return null;seen.add(frame.run_id);reports.push(frame);}
  const attempted=new Set();for(const row of value.attempts){const source=plain(row)?byId.get(row.run_id):null;if(!source||attempted.has(row.run_id)||!exact(row,['run_id','source_revision','checked_at','status','code','next_attempt_at'])||row.source_revision!==source.source_revision||!integer(row.checked_at,1,value.checked_at)||!integer(row.next_attempt_at,row.checked_at)||!['SUCCESS','UNAVAILABLE'].includes(row.status)||(row.status==='SUCCESS'?row.code!==null:!safeCodes.includes(row.code)))return null;attempted.add(row.run_id);attempts.push({...row});}
  const unavailable=attempts.some(row=>row.status==='UNAVAILABLE'),complete=reports.length===value.sources.length&&reports.every(frame=>frame.status==='CHECKED'),pending=(!complete?['RECONCILIATION_PENDING']:[]).concat(unavailable?['SOURCE_UNAVAILABLE']:[]),status=complete?'CHECKED':reports.length?'PARTIAL':unavailable?'UNAVAILABLE':'RUNNING';
  if(value.status!==status||JSON.stringify(value.pending)!==JSON.stringify(pending))return null;
  return {schema:'business_reconciliation_v1',month:value.month,start_date:value.start_date,end_date:value.end_date,checked_at:value.checked_at,status,source_revision:value.source_revision,sources:value.sources.map(source=>({...source})),reports,attempts,pending};
 }catch{return null;}
}
 function projectBusinessReconciliationEvidence(value,validators={}){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 try{
  if(!exact(validators,['projectBusiness','projectFrame','projectEvidenceFrame'])||!Object.values(validators).every(fn=>typeof fn==='function')||!exact(value,['schema','report','reviews'])||value.schema!=='business_reconciliation_v2'||!array(value.reviews,3))return null;
  const report=validators.projectBusiness(value.report,validators.projectFrame);if(!report)return null;
  const byId=new Map(report.reports.map(row=>[row.run_id,row])),seen=new Set(),reviews=[];
  for(const row of value.reviews){
   if(!exact(row,['run_id','source_revision','review'])||typeof row.run_id!=='string'||seen.has(row.run_id))return null;
   const source=byId.get(row.run_id);if(!source||row.source_revision!==source.source_revision)return null;
   const checked=validators.projectEvidenceFrame({schema:'finance_reconciliation_v2',report:source,review:row.review},validators.projectFrame);if(!checked)return null;
   seen.add(row.run_id);reviews.push({run_id:row.run_id,source_revision:row.source_revision,review:checked.review});
  }
  const result={schema:'business_reconciliation_v2',report,reviews};return new TextEncoder().encode(JSON.stringify(result)).byteLength<=262144?result:null;
 }catch{return null;}
}
 function projectBusinessReconciliationMoney(value,validators={}){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 try{
  if(!exact(validators,['projectBusiness','projectFrame','projectEvidenceFrame','projectMoneyFrame'])||!Object.values(validators).every(fn=>typeof fn==='function')||!exact(value,['schema','report','reviews','money'])||value.schema!=='business_reconciliation_v3'||!array(value.reviews,3)||!array(value.money,3))return null;
  const report=validators.projectBusiness(value.report,validators.projectFrame);if(!report)return null;
  const byId=new Map(report.reports.map(row=>[row.run_id,row])),reviews=[],seenReviews=new Set(),money=[],seenMoney=new Set();
  for(const row of value.reviews){
   if(!exact(row,['run_id','source_revision','review'])||typeof row.run_id!=='string'||seenReviews.has(row.run_id))return null;
   const source=byId.get(row.run_id);if(!source||row.source_revision!==source.source_revision)return null;
   const checked=validators.projectEvidenceFrame({schema:'finance_reconciliation_v2',report:source,review:row.review},validators.projectFrame);if(!checked)return null;
   seenReviews.add(row.run_id);reviews.push({run_id:row.run_id,source_revision:row.source_revision,review:checked.review});
  }
  for(const row of value.money){
   if(!exact(row,['run_id','source_revision','money'])||typeof row.run_id!=='string'||seenMoney.has(row.run_id))return null;
   const source=byId.get(row.run_id),review=reviews.find(item=>item.run_id===row.run_id);if(!source||!review||row.source_revision!==source.source_revision)return null;
   const checked=validators.projectMoneyFrame({schema:'finance_reconciliation_v3',report:source,review:review.review,money:row.money},validators.projectFrame,validators.projectEvidenceFrame);if(!checked)return null;
   seenMoney.add(row.run_id);money.push({run_id:row.run_id,source_revision:row.source_revision,money:checked.money});
  }
  const result={schema:'business_reconciliation_v3',report,reviews,money};return new TextEncoder().encode(JSON.stringify(result)).byteLength<=262144?result:null;
 }catch{return null;}
}
 function projectBusinessMonthAuditScope(value){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const revision=item=>Number.isSafeInteger(item)&&item>=1&&item<=2147483647;
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const uuid=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
 try{
  if(!exact(value,['publication_revision','start_date','end_date','sources'])||!revision(value.publication_revision)||!day(value.start_date)||!day(value.end_date)||value.start_date<'2000-01-01'||value.start_date.slice(8)!=='01'||value.start_date.slice(0,7)!==value.end_date.slice(0,7))return null;
  const month=value.start_date.slice(0,7),last=Number(value.end_date.slice(8)),rows=value.sources;
  if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype||rows.length!==Math.ceil(last/15)||Reflect.ownKeys(rows).length!==rows.length+1)return null;
  const sources=[],seen=new Set();
  for(let index=0;index<rows.length;index++){
   const descriptor=Object.getOwnPropertyDescriptor(rows,String(index));if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;
   const source=descriptor.value,start_date=month+'-'+String(index*15+1).padStart(2,'0'),end_date=month+'-'+String(Math.min(index*15+15,last)).padStart(2,'0');
   if(!exact(source,['run_id','source_revision','start_date','end_date'])||!uuid(source.run_id)||seen.has(source.run_id)||!revision(source.source_revision)||source.start_date!==start_date||source.end_date!==end_date)return null;
   seen.add(source.run_id);sources.push({run_id:source.run_id,source_revision:source.source_revision,start_date,end_date});
  }
  return {publication_revision:value.publication_revision,start_date:value.start_date,end_date:value.end_date,sources};
 }catch{return null;}
}
 function projectAdsCalendar(value) {
  // Keep helpers local: the client embeds this function via .toString().
  const keys = ['schema', 'status', 'start_date', 'end_date', 'fetched_at', 'covered_days', 'total_days', 'missing_dates', 'expense_cents', 'known_expense_cents', 'balance_cents', 'days', 'day_partial', 'unit_confirmation', 'source_timezone', 'basis', 'diagnostic', 'totals'];
  const metrics = ['gmv_cents', 'orders', 'reported_roas_raw', 'calculated_roas_raw'];
  const isPlain = item => item !== null && typeof item === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(item));
  const isExact = (item, names) => isPlain(item) && Reflect.ownKeys(item).length === names.length && names.every(name => Object.hasOwn(Object.getOwnPropertyDescriptor(item, name) || {}, 'value'));
  const isArray = (item, max) => Array.isArray(item) && Object.getPrototypeOf(item) === Array.prototype && item.length <= max && Reflect.ownKeys(item).length === item.length + 1 && Array.from({length: item.length}, (_, index) => Object.getOwnPropertyDescriptor(item, String(index))).every(descriptor => descriptor && Object.hasOwn(descriptor, 'value'));
  const isInteger = (item, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(item) && item >= 0 && item <= max && !Object.is(item, -0);
  const isDay = item => typeof item === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item) && Number.isFinite(Date.parse(item + 'T00:00:00Z')) && new Date(item + 'T00:00:00Z').toISOString().slice(0, 10) === item;
  const currentDay = stamp => new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/Sao_Paulo'}).format(new Date(stamp * 1000));
  const validReported = item => item === null || typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 1000000000000 && !Object.is(item, -0) || typeof item === 'string' && item.length <= 96 && /^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(item) && Number(item) <= 1000000000000;
  const calculated = (gmv, expense) => {
    if (gmv === null || expense === null || expense === 0) return null;
    const numerator = BigInt(gmv) * 1000000n, denominator = BigInt(expense);
    let rounded = numerator / denominator;
    if (numerator % denominator * 2n >= denominator) rounded++;
    return (rounded / 1000000n).toString() + '.' + (rounded % 1000000n).toString().padStart(6, '0');
  };
  const metricValid = (item, expense) => isExact(item, metrics) && (item.gmv_cents === null || isInteger(item.gmv_cents)) && (item.orders === null || isInteger(item.orders)) && validReported(item.reported_roas_raw) && item.calculated_roas_raw === calculated(item.gmv_cents, expense);
  const metricEmpty = item => metrics.every(key => item[key] === null);
  const equalDates = (left, right) => left.length === right.length && left.every((date, index) => date === right[index]);
  const diagnostics = ['ADS_CALENDAR_CONFIGURATION', 'ADS_CALENDAR_UNAVAILABLE', 'ADS_CALENDAR_DATE_COVERAGE_PARTIAL', 'ADS_CALENDAR_EXPENSE_INVALID', 'ADS_CALENDAR_ARITHMETIC_UNSAFE'];
  try {
    if (!isExact(value, keys) || value.schema !== 'ads_calendar_v1' || !['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'].includes(value.status) || !isInteger(value.fetched_at, 9999999999) || !isInteger(value.covered_days, 31) || !isInteger(value.total_days, 31) || !isArray(value.missing_dates, 31) || !value.missing_dates.every(isDay) || !isArray(value.days, 31) || typeof value.day_partial !== 'boolean' || value.unit_confirmation !== 'OPERATOR_CONFIRMED_BRL_2026_10_20' || value.source_timezone !== 'UNCONFIRMED' || value.basis !== 'CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION' || value.diagnostic !== null && !diagnostics.includes(value.diagnostic) || !isInteger(value.known_expense_cents) || value.expense_cents !== null && !isInteger(value.expense_cents) || value.balance_cents !== null && !isInteger(value.balance_cents) || !isExact(value.totals, ['direct', 'broad'])) return null;
    let dates = [];
    if (isDay(value.start_date) && isDay(value.end_date)) {
      const length = (Date.parse(value.end_date + 'T00:00:00Z') - Date.parse(value.start_date + 'T00:00:00Z')) / 86400000 + 1;
      if (length < 1 || length > 31 || value.fetched_at === 0 || value.end_date > currentDay(value.fetched_at)) return null;
      dates = Array.from({length}, (_, index) => new Date(Date.parse(value.start_date + 'T00:00:00Z') + index * 86400000).toISOString().slice(0, 10));
    } else if (value.start_date !== null || value.end_date !== null || value.diagnostic !== 'ADS_CALENDAR_CONFIGURATION') return null;
    if (value.total_days !== dates.length || value.day_partial !== (dates.length > 0 && value.end_date === currentDay(value.fetched_at))) return null;
    if (value.status === 'UNAVAILABLE') {
      if (value.covered_days !== 0 || value.days.length || value.expense_cents !== null || value.known_expense_cents !== 0 || value.balance_cents !== null || !equalDates(value.missing_dates, dates) || !['ADS_CALENDAR_CONFIGURATION', 'ADS_CALENDAR_UNAVAILABLE', 'ADS_CALENDAR_ARITHMETIC_UNSAFE'].includes(value.diagnostic)) return null;
      for (const attribution of ['direct', 'broad']) if (!metricValid(value.totals[attribution], null) || !metricEmpty(value.totals[attribution])) return null;
    } else {
      if (!dates.length || value.days.length !== dates.length) return null;
      let total = 0n;
      const missing = [];
      for (let index = 0; index < dates.length; index++) {
        const day = value.days[index];
        if (!isExact(day, ['date', 'expense_cents', 'direct', 'broad']) || day.date !== dates[index] || day.expense_cents !== null && !isInteger(day.expense_cents) || !metricValid(day.direct, day.expense_cents) || !metricValid(day.broad, day.expense_cents)) return null;
        if (day.expense_cents === null) missing.push(day.date); else total += BigInt(day.expense_cents);
      }
      if (total > BigInt(Number.MAX_SAFE_INTEGER) || value.covered_days !== dates.length - missing.length || !equalDates(value.missing_dates, missing) || value.known_expense_cents !== Number(total)) return null;
      if (value.status === 'AVAILABLE' ? missing.length !== 0 || value.expense_cents !== Number(total) || value.diagnostic !== null : missing.length === 0 || value.expense_cents !== null || !['ADS_CALENDAR_DATE_COVERAGE_PARTIAL', 'ADS_CALENDAR_EXPENSE_INVALID'].includes(value.diagnostic)) return null;
      for (const attribution of ['direct', 'broad']) {
        const aggregate = value.totals[attribution];
        if (!metricValid(aggregate, value.expense_cents)) return null;
        for (const field of ['gmv_cents', 'orders']) {
          const amounts = value.days.map(day => day[attribution][field]);
          const sum = amounts.some(amount => amount === null) ? null : amounts.reduce((sum, amount) => sum + BigInt(amount), 0n);
          if (sum !== null && sum > BigInt(Number.MAX_SAFE_INTEGER) || aggregate[field] !== (sum === null ? null : Number(sum))) return null;
        }
        if (aggregate.reported_roas_raw !== (dates.length === 1 ? value.days[0][attribution].reported_roas_raw : null)) return null;
      }
    }
    return Object.fromEntries(keys.map(key => [key, key === 'days' ? value.days.map(day => ({date: day.date, expense_cents: day.expense_cents, direct: {...day.direct}, broad: {...day.broad}})) : key === 'missing_dates' ? [...value.missing_dates] : key === 'totals' ? {direct: {...value.totals.direct}, broad: {...value.totals.broad}} : value[key]]));
  } catch { return null; }
}
 function projectBusinessMonthProducts(value,frame){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'));
 const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const cents=(item,signed=false)=>int(item,signed?Number.MIN_SAFE_INTEGER:0);
 const safe=item=>item>=BigInt(Number.MIN_SAFE_INTEGER)&&item<=BigInt(Number.MAX_SAFE_INTEGER)?Number(item):null;
 const id=(item,zero=false)=>typeof item==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(item);
 const sorted=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
 const keys=['schema','mixed_orders','known_mixed_sales_cents','known_mixed_repass_cents','known_mixed_tax_cents','known_mixed_ads_adjustment_cents','products'];
 const rowKeys=['item_id','quantity','orders','exclusive_orders','mixed_orders','exclusive_payment_covered','exclusive_payment_missing','exclusive_returns','exclusive_returns_unknown','known_exclusive_sales_cents','exclusive_sales_cents','known_exclusive_repass_cents','exclusive_repass_cents','known_exclusive_tax_cents','exclusive_tax_cents','known_exclusive_ads_adjustment_cents','exclusive_ads_adjustment_cents','known_production_cost_cents','production_cost_cents','known_exclusive_production_cost_cents','exclusive_production_cost_cents','exclusive_after_costs_cents','exclusive_margin_bps','pending','variants'];
 const variantKeys=['model_id','quantity','exclusive_quantity','mixed_quantity','unit_cost_cents','production_cost_cents','exclusive_production_cost_cents','selling_unit','size','male_size','female_size'];
 const coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
 const frameKeys=['status','progress','coverage','known_sales_cents','known_expected_repass_cents','known_invoice_tax_cents','known_production_cost_cents','production_cost_cents','ads_adjustment_cents','result','unmapped_variants'];
 const counts=['orders','exclusive_orders','mixed_orders','exclusive_payment_covered','exclusive_payment_missing','exclusive_returns','exclusive_returns_unknown'];
 const moneyNames=['sales','repass','tax','ads_adjustment'];
 const sizes=['P','M','G','GG','G1','G2','G3'];
 const codes=['PAYMENT_INCOMPLETE','PRODUCTION_COST_INCOMPLETE','RETURNS_NOT_RECONCILED','STATUS_REVIEW_REQUIRED','SOURCE_UNAVAILABLE','NO_EXCLUSIVE_ORDERS','ARITHMETIC_UNSAFE'];
 try{
  const progress=Object.getOwnPropertyDescriptor(frame||{},'progress')?.value,hasCapacity=plain(progress)&&Object.hasOwn(progress,'order_capacity');
  if(!plain(frame)||!frameKeys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(frame,key)||{},'value'))||frame.status!=='COMPLETE'||!exact(frame.progress,['windows_total','windows_complete','pages_read',...(hasCapacity?['order_capacity']:[])])||!int(frame.progress.windows_total,1,3)||frame.progress.windows_complete!==frame.progress.windows_total||!exact(frame.coverage,coverageKeys)||!coverageKeys.every(key=>int(frame.coverage[key],0,3000))||!plain(frame.result)||!Object.hasOwn(Object.getOwnPropertyDescriptor(frame.result,'pending')||{},'value')||!array(frame.result.pending,15)||!array(frame.unmapped_variants,3000))return null;
  // Current imports may mix legacy five-order pages and new twenty-order
  // pages. Their explicit aggregate capacity must bound the observed cohort.
  if(hasCapacity&&(!int(progress.pages_read,0,progress.windows_total*200)||!int(progress.order_capacity,progress.pages_read*5,progress.pages_read*20)||progress.order_capacity<frame.coverage.orders))return null;
  const taxDescriptor=Object.getOwnPropertyDescriptor(frame,'tax'),mei=taxDescriptor!==undefined;
  if(mei){
   if(!Object.hasOwn(taxDescriptor,'value'))return null;
   const tax=taxDescriptor.value;
   if(!exact(tax,['schema','regime','year','policy_revision','monthly_das_cents','tax_cents','status','source','basis'])||tax.schema!=='business_month_tax_v1'||tax.regime!=='MEI'||!int(tax.year,2000,9999)||!int(tax.policy_revision,0,2147483647)||tax.basis!=='MONTHLY_COMPETENCE_NO_PRORATION')return null;
   if(tax.status==='DECLARED'){
    if(tax.source!=='OPERATOR_DECLARED_DAS'||tax.policy_revision===0||!int(tax.monthly_das_cents,1,1000000)||tax.tax_cents!==tax.monthly_das_cents||frame.known_invoice_tax_cents!==tax.tax_cents)return null;
   }else if(tax.status!=='PENDING'||tax.source!=='DAS_REQUIRED'||tax.monthly_das_cents!==null||tax.tax_cents!==null||frame.known_invoice_tax_cents!==null)return null;
   keys.push('tax_treatment');
  }
  const taxValid=(base,tax,count)=>{if(mei)return tax===0;const n=BigInt(count),difference=BigInt(tax)*10000n-BigInt(base)*200n;return base>=0&&tax>=0&&(count!==0||base===0&&tax===0)&&difference>=-4999n*n&&difference<=5000n*n;};
  if(!['known_sales_cents','known_expected_repass_cents','known_production_cost_cents'].every(key=>cents(frame[key],key==='known_expected_repass_cents'))||!mei&&!cents(frame.known_invoice_tax_cents))return null;
  if(!exact(value,keys)||value.schema!=='business_month_products_v1'||!int(value.mixed_orders,0,3000)||!array(value.products,3000))return null;
  if(mei&&value.tax_treatment!=='MONTHLY_DAS_NOT_ALLOCATED')return null;
  for(const name of moneyNames)if(!cents(value['known_mixed_'+name+'_cents'],['repass','ads_adjustment'].includes(name)))return null;
  const unmapped=new Map();for(const row of frame.unmapped_variants){if(!exact(row,['item_id','model_id','quantity'])||!id(row.item_id)||!id(row.model_id,true)||!int(row.quantity,1)||unmapped.has(row.item_id+':'+row.model_id))return null;unmapped.set(row.item_id+':'+row.model_id,row.quantity);}
  const totals=moneyNames.map(name=>BigInt(value['known_mixed_'+name+'_cents'])),products=[],seen=new Set(),seenUnmapped=new Set();
  let exclusiveOrders=0,covered=0,missing=0,returns=0,unknownReturns=0,mixedReferences=0,variantCount=0,allKnownCost=0n,allCompleteCost=true;
  for(const row of value.products){
   const hasKnown=plain(row)&&Object.hasOwn(row,'known_exclusive_after_costs_cents'),projectedRowKeys=[...rowKeys,...(hasKnown?['known_exclusive_after_costs_cents']:[])];
   if(!exact(row,projectedRowKeys)||!id(row.item_id)||seen.has(row.item_id)||!int(row.quantity,1)||!counts.every(key=>int(row[key],0,3000))||row.orders!==row.exclusive_orders+row.mixed_orders||row.orders===0||row.exclusive_payment_covered+row.exclusive_payment_missing!==row.exclusive_orders||row.exclusive_returns>row.exclusive_payment_covered||row.exclusive_returns_unknown<row.exclusive_payment_missing||row.exclusive_returns+row.exclusive_returns_unknown>row.exclusive_orders||row.mixed_orders>value.mixed_orders||!array(row.variants,3000)||!row.variants.length||!array(row.pending,codes.length)||new Set(row.pending).size!==row.pending.length||!row.pending.every(code=>codes.includes(code)))return null;
   seen.add(row.item_id);variantCount+=row.variants.length;if(variantCount>3000)return null;
   for(let index=0;index<moneyNames.length;index++){
    const name=moneyNames[index],known=row['known_exclusive_'+name+'_cents'],total=row['exclusive_'+name+'_cents'];
    if(!cents(known,['repass','ads_adjustment'].includes(name))||total!==(row.exclusive_payment_missing?null:known)||row.exclusive_payment_covered===0&&known!==0)return null;
    totals[index]+=BigInt(known);
   }
   if(!taxValid(row.known_exclusive_sales_cents,row.known_exclusive_tax_cents,row.exclusive_payment_covered))return null;
   const variants=[],models=new Set();let quantity=0n,exclusiveQuantity=0n,mixedQuantity=0n,knownCost=0n,exclusiveCost=0n,costReady=true,exclusiveReady=true;
   for(const variant of row.variants){
    const custom=Object.getOwnPropertyDescriptor(variant||{},'selling_unit')?.value==='CUSTOM_PRODUCT';
    if(!exact(variant,[...variantKeys,...(custom?['cost_profile_id','cost_profile_label']:[])])||!id(variant.model_id,true)||models.has(variant.model_id)||!int(variant.quantity,1)||!int(variant.exclusive_quantity)||!int(variant.mixed_quantity)||BigInt(variant.quantity)!==BigInt(variant.exclusive_quantity)+BigInt(variant.mixed_quantity)||variant.unit_cost_cents!==null&&!cents(variant.unit_cost_cents))return null;
    models.add(variant.model_id);
    if(custom){if(!int(variant.unit_cost_cents,1,1000000)||typeof variant.cost_profile_id!=='string'||!/^[a-z0-9-]{1,64}$/.test(variant.cost_profile_id)||typeof variant.cost_profile_label!=='string'||variant.cost_profile_label!==variant.cost_profile_label.trim()||variant.cost_profile_label.length<1||variant.cost_profile_label.length>60||/[\u0000-\u001f\u007f-\u009f]/.test(variant.cost_profile_label)||[variant.size,variant.male_size,variant.female_size].some(item=>item!==null))return null;}
    else if(variant.unit_cost_cents===null){if([variant.selling_unit,variant.size,variant.male_size,variant.female_size].some(item=>item!==null))return null;const key=row.item_id+':'+variant.model_id;if(unmapped.get(key)!==variant.quantity)return null;seenUnmapped.add(key);}
    else if(variant.selling_unit==='SINGLE_GARMENT'){if(!sizes.includes(variant.size)||variant.male_size!==null||variant.female_size!==null)return null;}
    else if(variant.selling_unit==='ONE_MALE_ONE_FEMALE_KIT'){if(variant.size!==null||!sizes.includes(variant.male_size)||!sizes.includes(variant.female_size))return null;}
    else return null;
    const expected=variant.unit_cost_cents===null?null:safe(BigInt(variant.unit_cost_cents)*BigInt(variant.quantity));
    const exclusive=variant.exclusive_quantity===0?0:variant.unit_cost_cents===null?null:safe(BigInt(variant.unit_cost_cents)*BigInt(variant.exclusive_quantity));
    if(variant.unit_cost_cents!==null&&expected===null||variant.unit_cost_cents!==null&&exclusive===null||variant.production_cost_cents!==expected||variant.exclusive_production_cost_cents!==exclusive)return null;
    quantity+=BigInt(variant.quantity);exclusiveQuantity+=BigInt(variant.exclusive_quantity);mixedQuantity+=BigInt(variant.mixed_quantity);
    if(expected===null)costReady=false;else knownCost+=BigInt(expected);
    if(exclusive===null)exclusiveReady=false;else exclusiveCost+=BigInt(exclusive);
    variants.push({...variant});
   }
   if(quantity!==BigInt(row.quantity)||(row.exclusive_orders===0?exclusiveQuantity!==0n:exclusiveQuantity<BigInt(row.exclusive_orders))||(row.mixed_orders===0?mixedQuantity!==0n:mixedQuantity<BigInt(row.mixed_orders))||safe(knownCost)===null||safe(exclusiveCost)===null||row.known_production_cost_cents!==Number(knownCost)||row.production_cost_cents!==(costReady?Number(knownCost):null)||row.known_exclusive_production_cost_cents!==Number(exclusiveCost)||row.exclusive_production_cost_cents!==(exclusiveReady?Number(exclusiveCost):null))return null;
   const expectedPending=[];
   if(row.exclusive_payment_missing)expectedPending.push('PAYMENT_INCOMPLETE');
   if(!exclusiveReady)expectedPending.push('PRODUCTION_COST_INCOMPLETE');
   if(row.exclusive_returns+row.exclusive_returns_unknown)expectedPending.push('RETURNS_NOT_RECONCILED');
   if(frame.coverage.cancel_pending+frame.coverage.other+frame.coverage.unknown)expectedPending.push('STATUS_REVIEW_REQUIRED');
   if(frame.result.pending.includes('SOURCE_UNAVAILABLE')||frame.result.pending.includes('FINANCIAL_SOURCE_STALE'))expectedPending.push('SOURCE_UNAVAILABLE');
   if(!row.exclusive_orders)expectedPending.push('NO_EXCLUSIVE_ORDERS');
   let after=null,margin=null;
   if(!expectedPending.length){after=safe(BigInt(row.exclusive_repass_cents)-exclusiveCost-BigInt(row.exclusive_tax_cents));if(after!==null&&row.exclusive_sales_cents>0)margin=safe(BigInt(after)*10000n/BigInt(row.exclusive_sales_cents));if(after===null||row.exclusive_sales_cents>0&&margin===null){after=null;margin=null;expectedPending.push('ARITHMETIC_UNSAFE');}}
   // This is only the fully covered exclusive subset. It remains an observed
   // subtotal when another order or an older period source blocks the result.
   const knownAfter=row.exclusive_orders>0&&row.exclusive_payment_missing===0&&exclusiveReady&&row.exclusive_returns+row.exclusive_returns_unknown===0?safe(BigInt(row.exclusive_repass_cents)-exclusiveCost-BigInt(row.exclusive_tax_cents)):null;
   if(hasKnown&&(row.known_exclusive_after_costs_cents!==null&&!cents(row.known_exclusive_after_costs_cents,true)||row.known_exclusive_after_costs_cents!==knownAfter))return null;
   if(row.exclusive_after_costs_cents!==after||row.exclusive_margin_bps!==margin||row.pending.length!==expectedPending.length||!expectedPending.every(code=>row.pending.includes(code)))return null;
   variants.sort((a,b)=>sorted(a.model_id,b.model_id));products.push(Object.fromEntries(projectedRowKeys.map(key=>[key,key==='variants'?variants:key==='pending'?[...expectedPending]:row[key]])));
   exclusiveOrders+=row.exclusive_orders;covered+=row.exclusive_payment_covered;missing+=row.exclusive_payment_missing;returns+=row.exclusive_returns;unknownReturns+=row.exclusive_returns_unknown;mixedReferences+=row.mixed_orders;allKnownCost+=knownCost;allCompleteCost&&=costReady;
  }
  const mixedCovered=frame.coverage.payment_covered-covered,mixedMissing=frame.coverage.payment_missing-missing,mixedReturns=frame.coverage.returns-returns,mixedUnknownReturns=frame.coverage.returns_unknown-unknownReturns;
  if(exclusiveOrders+value.mixed_orders!==frame.coverage.paid||mixedCovered<0||mixedMissing<0||mixedCovered+mixedMissing!==value.mixed_orders||mixedReturns<0||mixedReturns>mixedCovered||mixedUnknownReturns<mixedMissing||mixedReturns+mixedUnknownReturns>value.mixed_orders||(value.mixed_orders===0?mixedReferences!==0:mixedReferences<value.mixed_orders*2||mixedReferences>value.mixed_orders*products.length)||seenUnmapped.size!==unmapped.size)return null;
  if(mixedCovered===0&&moneyNames.some(name=>value['known_mixed_'+name+'_cents']!==0)||!taxValid(value.known_mixed_sales_cents,value.known_mixed_tax_cents,mixedCovered))return null;
  if(totals[0]!==BigInt(frame.known_sales_cents)||totals[1]!==BigInt(frame.known_expected_repass_cents)||totals[2]!==(mei?0n:BigInt(frame.known_invoice_tax_cents))||frame.ads_adjustment_cents!==null&&totals[3]!==BigInt(frame.ads_adjustment_cents)||allKnownCost!==BigInt(frame.known_production_cost_cents)||frame.production_cost_cents!==(allCompleteCost?frame.known_production_cost_cents:null))return null;
  products.sort((a,b)=>sorted(a.item_id,b.item_id));return Object.fromEntries(keys.map(key=>[key,key==='products'?products:value[key]]));
 }catch{return null;}
}
 function projectBusinessMonth(value){
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
 function buildMonthlyFinancialSummary(frame){
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const read=(value,key)=>plain(value)?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
 const int=(value,signed=false)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&(signed||value>=0);
 const array=value=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=3000&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(field=>field&&Object.hasOwn(field,'value'));
 const safe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
 const codes=['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','TAX_POLICY_REQUIRED','FINANCIAL_SOURCE_STALE'];
 const output={schema:'monthly_financial_summary_v1',state:'WAITING',balance_cents:null,before_production_cents:null,known_production_cents:null,production_complete:false,costs_after_payout_cents:null,production_coverage:{total_units:null,known_units:null,pending_units:0,pending_variants:0,pending_products:0},pending:[],basis:'PAID_MONTH_CURRENT_COSTS_AFTER_ADS_TAX_EXPENSES'};
 const arithmetic=()=>{if(!output.pending.includes('ARITHMETIC_UNSAFE'))output.pending.push('ARITHMETIC_UNSAFE');output.balance_cents=output.before_production_cents=output.costs_after_payout_cents=null;output.state='WAITING';return output;};
 try{
  if(!plain(frame))return output;
  const result=read(frame,'result'),pending=read(result,'pending'),knownProduction=read(frame,'known_production_cost_cents'),production=read(frame,'production_cost_cents');
  if(!array(pending)||pending.length>codes.length||new Set(pending).size!==pending.length||!pending.every(code=>codes.includes(code)))return output;
  output.pending=[...pending];output.known_production_cents=int(knownProduction)?knownProduction:null;
  const unmapped=read(frame,'unmapped_variants');if(!array(unmapped))return output;
  const products=new Set(),variants=new Set();let missing=0n;
  for(const row of unmapped){
   const quantity=read(row,'quantity'),item=read(row,'item_id'),model=read(row,'model_id');
   if(!int(quantity)||quantity<1||typeof item!=='string'||!/^[1-9][0-9]{0,19}$/.test(item)||typeof model!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(model)||variants.has(item+':'+model))return arithmetic();
   missing+=BigInt(quantity);products.add(item);variants.add(item+':'+model);
  }
  const missingUnits=safe(missing);if(missingUnits===null)return arithmetic();
  const coverage=output.production_coverage;coverage.pending_units=missingUnits;coverage.pending_variants=variants.size;coverage.pending_products=products.size;
  const summary=read(frame,'product_summary'),rows=read(summary,'products');
  if(rows!==undefined&&rows!==null){
   if(!array(rows))return arithmetic();let total=0n;const identities=new Set();
   for(const row of rows){const quantity=read(row,'quantity'),item=read(row,'item_id');if(!int(quantity)||quantity<1||typeof item!=='string'||identities.has(item))return arithmetic();total+=BigInt(quantity);identities.add(item);}
   const units=safe(total);if(units===null||missing>total)return arithmetic();coverage.total_units=units;coverage.known_units=units-missingUnits;
  }
  const status=read(frame,'status'),orders=read(frame,'coverage'),collection=read(frame,'collection');
  output.production_complete=status==='COMPLETE'&&int(production)&&production===knownProduction&&missingUnits===0;
  if(production!==null&&(!int(production)||production!==knownProduction||missingUnits>0))return arithmetic();
  if(status!=='COMPLETE'||!plain(orders)||read(orders,'payment_missing')!==0||['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','ARITHMETIC_UNSAFE'].some(code=>pending.includes(code))||read(collection,'state')==='BLOCKED')return output;
  const countKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
  if(countKeys.some(key=>!int(read(orders,key))||read(orders,key)>3000))return output;
  const c=Object.fromEntries(countKeys.map(key=>[key,read(orders,key)])),review=c.cancel_pending+c.other+c.unknown;
  if(c.orders!==c.paid+c.cancelled+review+c.unpaid||c.paid!==c.completed+c.ongoing||c.payment_covered!==c.paid||c.returns+c.returns_unknown>c.paid||review>0&&!pending.includes('STATUS_REVIEW_REQUIRED')||(c.returns+c.returns_unknown)>0&&!pending.includes('RETURNS_NOT_RECONCILED'))return output;
  const payout=read(frame,'expected_repass_cents'),sales=read(frame,'sales_cents'),tax=read(frame,'invoice_tax_cents'),ads=read(frame,'ads'),expenses=read(frame,'expenses'),adjustment=read(frame,'ads_adjustment_cents'),treatment=read(expenses,'recharge_treatment'),external=read(expenses,'external_expenses_cents'),spend=read(ads,'expense_cents');
  if(!int(payout,true)||payout!==read(frame,'known_expected_repass_cents')||!int(sales)||sales!==read(frame,'known_sales_cents')||!int(tax)||!int(knownProduction)||read(ads,'status')!=='AVAILABLE'||!int(spend)||read(ads,'start_date')!==read(frame,'start_date')||read(ads,'end_date')!==read(frame,'end_date')||!int(external)||!int(adjustment)||!['UNCONFIRMED','ADS_RECHARGE','TECH_SUPPORT'].includes(treatment)||adjustment>0&&treatment==='UNCONFIRMED')return output;
  if(['PAYMENT_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','TAX_POLICY_REQUIRED','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE'].some(code=>pending.includes(code)))return output;
  const policy=read(frame,'tax');if(read(policy,'regime')==='MEI'&&(read(policy,'status')!=='DECLARED'||read(policy,'tax_cents')!==tax||read(policy,'monthly_das_cents')!==tax))return output;
  const restore=treatment==='ADS_RECHARGE'?adjustment:0;
  const before=BigInt(payout)+BigInt(restore)-BigInt(tax)-BigInt(spend)-BigInt(external),balance=before-BigInt(knownProduction),costs=BigInt(knownProduction)+BigInt(tax)+BigInt(spend)+BigInt(external);
  const amounts=[safe(before),safe(balance),safe(costs)];if(amounts.some(value=>value===null))return arithmetic();
  const strict=read(result,'net_estimate_cents');if(strict!==null&&(!int(strict,true)||strict!==amounts[1]||!output.production_complete||pending.length))return arithmetic();
  output.before_production_cents=amounts[0];output.balance_cents=amounts[1];output.costs_after_payout_cents=amounts[2];
  output.state=strict!==null?'READY':output.production_complete?'PROVISIONAL':'PARTIAL_COSTS';return output;
 }catch{return arithmetic();}
}
 function buildAdjustedBusinessBalance(monthly,reconciliation,auditScope,validators={}){
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
 const el=name=>document.getElementById('businessReconciliation'+name);
 const node=(tag,text,cls)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;if(cls)result.className=cls;return result;};
 const money=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100):'Não informado';
 const signedMoney=value=>Number.isSafeInteger(value)&&value>0?'+'+money(value):money(value);
 const time=value=>Number.isSafeInteger(value)&&value>0?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value*1000)):'Não consultado';
 const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'—';
 const sum=values=>{let total=0n;for(const value of values){if(!Number.isSafeInteger(value))return null;total+=BigInt(value);}return total>=BigInt(Number.MIN_SAFE_INTEGER)&&total<=BigInt(Number.MAX_SAFE_INTEGER)?Number(total):null;};
 const caseLabels={PENDING:'Detalhes pendentes',UNKNOWN:'Situação não reconhecida',REQUESTED:'Solicitação aberta',ACCEPTED:'Solicitação aceita',CANCELLED:'Solicitação cancelada',JUDGING:'Em análise',REFUND_PAID:'Reembolso informado pela Shopee',CLOSED:'Solicitação encerrada',PROCESSING:'Em processamento'};
 const moneyLabels={...caseLabels,ACCEPTED:'Solicitações aceitas',REFUND_PAID:'Status de reembolso pago informado'};
 const moneyCohorts={PAID:'Pedidos pagos',REVIEW:'Pedidos em revisão',OTHER:'Outros pedidos'};
 const moneyStatuses=['PENDING','UNKNOWN','REQUESTED','ACCEPTED','CANCELLED','JUDGING','REFUND_PAID','CLOSED','PROCESSING'];
 const reviewLabels={IN_CANCEL:'Cancelamento em andamento',TO_RETURN:'Devolução em andamento',OTHER_STATUS:'Outro estado em revisão',UNKNOWN_STATUS:'Situação não identificada'};
 const referenceMessages={DETAILS_PENDING:'As referências ainda precisam ser consultadas.',PERMISSION_DENIED:'A integração não recebeu permissão para consultar estas referências.',RATE_LIMIT:'A fonte limitou as consultas. A próxima tentativa deve respeitar a espera indicada.',TIMEOUT:'A fonte não respondeu dentro do prazo.',UNAVAILABLE:'A fonte das referências está indisponível.',INVALID_RESPONSE:'A resposta da fonte não pôde ser confirmada.',UNKNOWN_STATUS:'A situação informada pela fonte ainda não é reconhecida.',CURRENCY_MISMATCH:'A moeda informada pela fonte não corresponde ao real.'};
 let api=null,started=false,month='',scopeKey='',generation=0,pending=null,value=null,reviews=[],amounts=[],monthlyContext=null,auditScopeContext=null;
 const cache=new Map(),attempted=new Map();
 function validMonth(selected){try{return typeof selected==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)&&selected>='2000-01'&&selected<=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7);}catch{return false;}}
 function showMessage(text,badge='Em conferência'){if(el('Status'))el('Status').textContent=text;if(el('Badge'))el('Badge').textContent=badge;}
 const orderTarget=(report,hash)=>'business-reconciliation-order-'+report.run_id+'-'+hash;
 function renderAdjustedBalance(){
  const target=el('AdjustedBalance');target.replaceChildren();target.hidden=!value;if(target.hidden)return;
  const balance=buildAdjustedBusinessBalance(monthlyContext,value,auditScopeContext,{projectMonthly:projectBusinessMonth,projectReconciliation:projectBusinessReconciliation,projectFrame:projectReconciliationFrame,projectScope:projectBusinessMonthAuditScope,buildSummary:buildMonthlyFinancialSummary});
  const section=node('section',undefined,'business-reconciliation-adjusted');section.append(node('h4','Saldo após ajustes informados'));
  if(!balance||balance.state==='UNAVAILABLE'){
   section.append(node('strong','Em conferência'));
   const reasons={SOURCE_MISMATCH:'A conferência precisa corresponder aos mesmos pedidos e à mesma publicação do resumo mensal.',RECONCILIATION_INCOMPLETE:'Ainda faltam intervalos da conferência para calcular o saldo do mês.',ADJUSTMENT_VALUES_UNAVAILABLE:'Há repasses ou ajustes sem valores compatíveis; eles não são tratados como zero.',MONTHLY_COSTS_UNAVAILABLE:'Ainda faltam valores de anúncios, impostos ou outras despesas para calcular o saldo.',ARITHMETIC_UNSAFE:'Um valor excedeu o limite seguro do cálculo.'};
   section.append(node('p',reasons[balance?.reason]||'Aguardando o resumo mensal e os ajustes compatíveis dos mesmos pedidos.'));
  }else{
   section.append(node('strong',money(balance.balance_cents)),node('p',balance.state==='PARTIAL_COSTS'?'Saldo provisório com os custos de produção já identificados. Ainda há produtos sem custo completo.':'Saldo provisório dos pedidos pagos, após os ajustes informados e os custos do mesmo resumo.'));
   const parts=node('dl');for(const [label,amount] of [['Repasse após ajustes informado',balance.after_adjustment_repass_cents],['Custos após o repasse',balance.costs_after_payout_cents]])parts.append(node('dt',label),node('dd',money(amount)));
   if(balance.recharge_addback_cents!==0)parts.append(node('dt','Recarga de anúncios reposta'),node('dd',money(balance.recharge_addback_cents)));
   section.append(parts,node('p','Ajuste com sinal aplicado ao repasse: '+signedMoney(balance.reported_adjustment_cents)+'. Os valores das solicitações de reembolso não são descontados novamente.'));
   const times=balance.source_checked_at;section.append(node('p','Financeiro consultado de '+time(times.finance_oldest_at)+' a '+time(times.finance_latest_at)+' · anúncios em '+time(times.ads_at)+'.'));
   if(balance.pending.includes('FINANCIAL_SOURCE_STALE'))section.append(node('p','A leitura financeira precisa ser atualizada. Este saldo mantém os valores e as datas salvos.'));
   if(balance.pending.includes('RETURNS_NOT_RECONCILED')||balance.pending.includes('STATUS_REVIEW_REQUIRED'))section.append(node('p','Devoluções e situações de pedidos ainda precisam de conferência; os pedidos em revisão continuam fora da base paga.'));
  }
  section.append(node('p','Valor ainda a liberar: indisponível. O repasse informado pode incluir valores já liberados. Este saldo não comprova recebimento em banco nem lucro realizado.'));target.append(section);
 }
 function renderMoney(){
  const target=el('Money');target.replaceChildren();target.hidden=!value;if(target.hidden)return;
  const section=node('section',undefined,'business-reconciliation-money');section.append(node('h4','Valores das devoluções por situação'));
  const complete=amounts.length===value.sources.length&&value.sources.length>0;
  section.append(node('p',amounts.length+' de '+value.sources.length+' intervalo(s) com valores por situação. '+(complete?'As contagens incluem todas as solicitações identificadas nesses intervalos, mesmo quando a lista de pedidos é limitada.':'Os valores abaixo cobrem somente os intervalos com este detalhe disponível.')));
  if(!amounts.length){section.append(node('p','Os valores por situação ainda não estão disponíveis nesta leitura salva. Os detalhes individuais e o repasse informado permanecem na conferência abaixo.'));target.append(section);return;}
  section.append(node('p','Aceita é a situação registrada no fluxo da Shopee; não determina sozinha uma movimentação bancária ou uma dedução adicional do vendedor. Os valores abaixo são os reembolsos informados nas solicitações.'));
  if(value.reports.some(report=>report.pending.includes('RETURN_REFERENCES_MISSING')))section.append(node('p','Ainda faltam referências de devolução. Este quadro cobre as solicitações já identificadas; não confirma o total de todas as devoluções do mês.'));
  for(const cohort of ['PAID','REVIEW','OTHER']){
   const groups=amounts.map(item=>item.money.groups.find(group=>group.cohort===cohort)),group=node('section');group.append(node('h5',moneyCohorts[cohort]));
   group.append(node('p',cohort==='PAID'?'Pedidos incluídos nos valores pagos do resumo.':'Pedidos fora dos valores pagos do resumo. Os valores de reembolso deste grupo não são descontados da base paga.'));
   const oldest=groups.map(item=>item.source_checked_at.oldest_at).filter(at=>at!==null),latest=groups.map(item=>item.source_checked_at.latest_at).filter(at=>at!==null);
   group.append(node('p',oldest.length?'Devoluções consultadas de '+time(Math.min(...oldest))+' a '+time(Math.max(...latest))+'.':'Detalhes de devolução ainda não consultados neste grupo.'));
   const rows=moneyStatuses.map(status=>{const found=groups.map(item=>item.statuses.find(row=>row.status===status));return {status,cases:sum(found.map(item=>item.cases)),known:sum(found.map(item=>item.amount_known)),amount:sum(found.map(item=>item.known_amount_cents))};}).filter(item=>item.cases>0);
   if(!rows.length){group.append(node('p','Nenhuma solicitação identificada neste grupo nas evidências disponíveis.'));section.append(group);continue;}
   const wrap=node('div',undefined,'business-reconciliation-money-table'),table=node('table'),head=node('thead'),headers=node('tr');for(const label of ['Situação informada','Solicitações','Valor de reembolso informado'])headers.append(node('th',label));head.append(headers);table.append(head);const body=node('tbody');
   for(const item of rows){
    const row=node('tr',undefined,['ACCEPTED','REFUND_PAID'].includes(item.status)?'status-highlight':undefined),label=node('td',moneyLabels[item.status]),amount=node('td',item.known>0?money(item.amount):'Não informado');
    if(item.status==='ACCEPTED')label.append(node('span','Valor informado em solicitações aceitas; sem concluir o recebimento no banco.'));
    if(item.status==='REFUND_PAID')label.append(node('span','Estado de pagamento informado pela Shopee; sem comprovação bancária nesta conferência.'));
    if(item.status==='CANCELLED')label.append(node('span','O valor da solicitação cancelada não é uma despesa confirmada.'));
    if(item.status==='CLOSED')label.append(node('span','Encerramento da solicitação não define sozinho o valor pago.'));
    amount.append(node('span',item.known+' de '+item.cases+' com valor informado'+(item.known<item.cases?' · soma parcial dos valores conhecidos.':'.')));row.append(label,node('td',String(item.cases)),amount);body.append(row);
   }
   table.append(body);wrap.append(table);group.append(wrap);section.append(group);
  }
  target.append(section);
 }
 function renderPayout(payout){
  const section=node('div',undefined,'business-reconciliation-payout');
  if(!payout){section.append(node('span','Repasse por pedido ainda não disponível nesta leitura salva.'));return section;}
  section.append(node('span',moneyCohorts[payout.cohort]+' · financeiro observado em '+time(payout.source_checked_at)+'.'));
  if(payout.state==='NOT_IN_PAID_COHORT'){section.append(node('span','Pedido fora dos valores pagos do resumo. O repasse deste pedido não está disponível nesta conferência.'));return section;}
  section.append(node('span','Repasse base informado: '+money(payout.base_repass_cents)+'.'));
  if(payout.state==='AVAILABLE')section.append(node('span','Ajuste com sinal: '+signedMoney(payout.adjustment_cents)+'.'),node('span','Repasse após ajustes informado: '+money(payout.after_adjustment_repass_cents)+'.'),node('span','O valor da devolução não é descontado novamente desse repasse.'));
  else section.append(node('span',payout.state==='CONFLICT'?'Repasse após ajustes em conferência: os valores informados não são compatíveis.':'Repasse após ajustes não informado por completo. Ausência de informação não é valor zero.'));
  return section;
 }
 function renderReview(report,review){
  const section=node('section',undefined,'business-reconciliation-review');section.append(node('h5','Pedidos em revisão'));
  section.append(node('p',report.coverage.review_orders+' pedido(s) fora dos valores dos pedidos pagos. São acompanhados separadamente dos '+report.coverage.return_orders+' pedido(s) pagos com devolução identificada.'));
  if(!review){section.append(node('p','O detalhe individual ainda não está disponível nesta leitura salva. O total em revisão continua preservado. A conferência de cada pedido depende de evidências compatíveis com este resumo.'));return section;}
  const counts=review.summary,types=[];for(const [key,label] of [['to_return','em devolução'],['in_cancel','em cancelamento'],['other','em outro estado'],['unknown','sem situação identificada']])if(counts[key])types.push(counts[key]+' '+label);
  section.append(node('p',types.join(' · ')+'. As referências abaixo são internas do BrazaCommerce; não são os números dos pedidos na Shopee.'));
  for(const item of review.orders){
   const row=node('article',undefined,'business-reconciliation-review-order');row.append(node('strong','Pedido interno '+item.order_hash.slice(0,12)+' · '+reviewLabels[item.status]),node('span','Fora dos valores dos pedidos pagos · situação observada em '+time(item.source_checked_at)+'.'));
   let step;
   if(item.reference_state==='NOT_APPLICABLE'){row.append(node('span','Esta situação não usa a busca de referências de devolução nesta conferência.'));step='Acompanhar a próxima atualização da situação do pedido.';}
   else if(item.reference_state==='PENDING'||item.reference_state==='RETRY_WAIT'){row.append(node('span',item.reference_state==='PENDING'?'Referências de devolução ainda não disponíveis.':'A consulta das referências precisa ser repetida.'));step='Obter as referências de devolução antes de conferir os valores.';}
   else if(item.reference_state==='KNOWN_EMPTY'){row.append(node('span','Nenhuma referência de devolução encontrada na consulta registrada. Isso não confirma o encerramento da situação.'));step='Conferir novamente as referências quando a situação for atualizada.';}
   else{row.append(node('span',item.reference_count+' solicitação(ões) identificada(s) · '+item.checked_cases+' com detalhes consultados · '+item.pending_cases+' aguardando detalhes.'));step=item.pending_cases>0?'Consultar os detalhes das solicitações pendentes.':'Conferir a situação e os valores solicitados; o reembolso efetivo continua sem conciliação.';}
   if(item.references_checked_at!==null)row.append(node('span','Referências consultadas em '+time(item.references_checked_at)+'.'));
   if(item.reference_diagnostic!==null){if(item.reference_count!==null)row.append(node('span','A última atualização das referências não foi concluída. As referências anteriores foram preservadas.'));row.append(node('span',referenceMessages[item.reference_diagnostic]));}
   if(item.next_attempt_at>0)row.append(node('span','Nova consulta permitida a partir de '+time(item.next_attempt_at)+'.'));
   row.append(node('span','Próxima conferência: '+step));
   if(report.cases.some(entry=>entry.order_hash===item.order_hash)){const link=node('a','Ver solicitações deste pedido');link.href='#'+orderTarget(report,item.order_hash);row.append(link);}
   section.append(row);
  }
  if(review.truncation.truncated)section.append(node('p',review.truncation.orders_included+' de '+review.truncation.orders_total+' pedidos em revisão exibidos. As contagens acima incluem todos os pedidos deste intervalo.'));
  return section;
 }
 function renderCase(item){
  const row=node('article',undefined,'business-reconciliation-case'),description=node('div');description.append(node('strong','Solicitação '+item.case_hash.slice(0,8)+' · '+caseLabels[item.status]),node('span',item.checked_at===null?'Detalhes ainda não consultados.':'Consultada em '+time(item.checked_at)+'.'));if(item.status==='CANCELLED')description.append(node('span','Cancelamento da solicitação; este valor não é uma despesa confirmada.'));if(item.status==='ACCEPTED')description.append(node('span','Valor informado em uma solicitação aceita; a situação não comprova recebimento em banco.'));if(item.status==='CLOSED')description.append(node('span','Solicitação encerrada; este estado não define sozinho o valor pago.'));row.append(description,node('span','Valor de reembolso informado: '+money(item.requested_refund_cents)));return row;
 }
 function renderRun(report,review,amount){
  const section=node('section',undefined,'business-reconciliation-run');
  section.append(node('h4',day(report.start_date)+' a '+day(report.end_date)),node('p','Financeiro: '+time(report.source_checked_at.finance_oldest_at)+' a '+time(report.source_checked_at.finance_latest_at)+' · revisão '+report.source_revision+'.'));
  const coverage=report.coverage,adjustments=report.adjustments,returns=report.returns;
  section.append(node('p',coverage.evidence_orders+' de '+coverage.orders+' pedido(s) deste intervalo com evidência preservada. '+coverage.review_orders+' pedido(s) com situação em revisão.'));
  if(coverage.review_orders>0)section.append(renderReview(report,review));
  const values=node('ul');values.append(node('li','Repasse base informado: '+money(adjustments.base_repass_cents)+'.'));
  values.append(node('li',(adjustments.missing_orders+adjustments.conflicting_orders>0?'Ajustes nos pedidos com valores compatíveis: ':'Ajustes informados: ')+(adjustments.reported_orders>0||coverage.paid_orders===0?money(adjustments.known_adjustment_cents):'Não informado')+'.'));
  values.append(node('li','Repasse após ajustes informado: '+money(adjustments.after_adjustment_repass_cents)+'. Esses valores não alteram a previsão líquida durante esta conferência.'));section.append(values);
  const notes=[];
  if(coverage.missing_evidence_orders>0)notes.push(coverage.missing_evidence_orders+' pedido(s) ainda sem evidência preservada. A coleta automática poderá completar as próximas leituras.');
  if(adjustments.conflicting_orders>0)notes.push(adjustments.conflicting_orders+' pedido(s) com diferença entre o repasse e os ajustes informados. Esses valores continuam em conferência.');
  if(adjustments.missing_orders>0)notes.push('O repasse após ajustes ainda não foi informado para '+adjustments.missing_orders+' pedido(s). Ausência de informação não é valor zero.');
  if(report.pending.includes('RETURN_REFERENCES_MISSING'))notes.push('Há ocorrências de devolução sem todas as referências necessárias para consultar seus detalhes.');
  if(returns.permission==='DENIED')notes.push('A Shopee não liberou os detalhes de devoluções nesta integração. As consultas de repasse e anúncios continuam disponíveis.');
  else if(returns.pending_count>0)notes.push(returns.pending_count+' solicitação(ões) aguardando detalhes. A conferência continua pelo servidor.');
  if(returns.checked_count>0)section.append(node('p','Detalhes de devolução: '+time(report.source_checked_at.returns_oldest_at)+' a '+time(report.source_checked_at.returns_latest_at)+'. Valores abaixo são os reembolsos informados nas solicitações da Shopee.'));
  if(notes.length){const list=node('ul');for(const text of notes)list.append(node('li',text));section.append(list);}
  const groups=new Map();for(const item of report.cases){if(!groups.has(item.order_hash))groups.set(item.order_hash,[]);groups.get(item.order_hash).push(item);}for(const payout of amount?.payouts??[])if(!groups.has(payout.order_hash))groups.set(payout.order_hash,[]);
  for(const [hash,items] of groups){const payout=amount?.payouts.find(item=>item.order_hash===hash),group=node('section',undefined,'business-reconciliation-order-group');group.id=orderTarget(report,hash);group.append(node('h5',(items.length?'Solicitações do pedido interno ':'Pedido interno ')+hash.slice(0,12)));if(review?.orders.some(item=>item.order_hash===hash))group.append(node('p','Este pedido está em revisão e fora dos valores dos pedidos pagos.'));group.append(renderPayout(payout));for(const item of items)group.append(renderCase(item));if(!items.length)group.append(node('p',payout.reference_count===null?'Referências de devolução ainda não disponíveis; os valores de reembolso permanecem sem detalhamento.':payout.reference_count===0?'Nenhuma solicitação identificada na consulta registrada. Isso não confirma o encerramento da situação.':'As solicitações deste pedido estão fora do limite da lista exibida. Os totais por situação incluem suas evidências.'));section.append(group);}
  if(amount?.truncation.truncated)section.append(node('p',amount.truncation.payouts_included+' de '+amount.truncation.payouts_total+' pedidos com devolução têm o detalhe de repasse exibido. Os totais por situação incluem todas as solicitações identificadas.'));
  if(report.truncation.truncated)section.append(node('p',report.truncation.cases_included+' de '+report.truncation.cases_total+' solicitações exibidas. A cobertura informada acima considera o intervalo completo.'));
  return section;
 }
 function render(){
  if(!el(''))return;
  const metrics=el('Metrics'),runs=el('Runs'),notice=el('Notice');metrics.replaceChildren();runs.replaceChildren();notice.hidden=true;notice.textContent='';
  if(!value){metrics.hidden=true;renderAdjustedBalance();renderMoney();el('Scope').textContent=month?'Mês de referência: '+month.slice(5)+'/'+month.slice(0,4)+' · Brasília.':'A consulta acompanha as mesmas datas do resumo concluído.';return;}
  el('Scope').textContent=value.end_date===null?'Mês de referência: '+value.month.slice(5)+'/'+value.month.slice(0,4)+'. Aguardando a conclusão de um período financeiro.':'Período desta conferência: '+day(value.start_date)+' a '+day(value.end_date)+' · Brasília. Revisão '+value.source_revision+'.';
  const reports=value.reports,covered=reports.length,complete=covered===value.sources.length&&value.sources.length>0;
  showMessage(value.status==='COLLECTING'?'Aguardando o resumo completo para conferir as mesmas datas.':covered+' de '+value.sources.length+' intervalo(s) com evidências consultadas. A conferência continua automaticamente.',value.status==='CHECKED'?'Evidências disponíveis':value.status==='UNAVAILABLE'?'Fonte indisponível':'Em conferência');
  metrics.hidden=reports.length===0;
  const metric=(label,amount,help)=>{const card=node('article',undefined,'business-reconciliation-metric');card.append(node('small',label),node('strong',amount),node('span',help));metrics.append(card);};
  if(reports.length){
   const knownOrders=sum(reports.map(report=>report.coverage.evidence_orders)),totalOrders=sum(reports.map(report=>report.coverage.orders));
   metric('Pedidos com evidência preservada',knownOrders+' de '+totalOrders,complete?'Nos mesmos intervalos do resumo salvo.':'Cobertura dos intervalos já consultados; ainda não representa todo o mês.');
   const after=complete?sum(reports.map(report=>report.adjustments.after_adjustment_repass_cents)):null;
   metric('Repasse após ajustes informado',money(after),'Valor informado pela Shopee, separado da previsão líquida. Não comprova recebimento.');
   const checked=sum(reports.map(report=>report.returns.checked_count)),references=sum(reports.map(report=>report.returns.reference_count));
   const missingReferences=reports.some(report=>report.pending.includes('RETURN_REFERENCES_MISSING'));
   metric('Solicitações com detalhes consultados',missingReferences&&references===0?'Referências pendentes':checked+' de '+references,missingReferences?'Há referências de devolução ainda ausentes.':'As solicitações e seus valores não são descontados novamente.');
   const reviewCount=sum(reports.map(report=>report.coverage.review_orders)),paidReturns=sum(reports.map(report=>report.coverage.return_orders)),unknownReturns=sum(reports.map(report=>report.coverage.return_unknown_orders));
   metric('Pedidos em revisão',String(reviewCount),'Fora dos valores dos pedidos pagos.'+(complete?'':' Contagem dos intervalos já consultados.'));
   metric('Pedidos pagos com devolução identificada',String(paidReturns),'Não inclui os pedidos em revisão.'+(unknownReturns>0?' Há ainda '+unknownReturns+' pedido(s) pago(s) sem confirmação de devolução.':'')+(complete?'':' Contagem dos intervalos já consultados.'));
   for(const report of reports)runs.append(renderRun(report,reviews.find(row=>row.run_id===report.run_id&&row.source_revision===report.source_revision)?.review??null,amounts.find(row=>row.run_id===report.run_id&&row.source_revision===report.source_revision)?.money??null));
  }
  renderAdjustedBalance();renderMoney();
  const failed=value.attempts.some(attempt=>attempt.status==='UNAVAILABLE');
  if(failed||value.pending.includes('SOURCE_UNAVAILABLE')){notice.hidden=false;notice.textContent='Parte da fonte não pôde ser consultada. As evidências salvas mantêm suas datas originais; o servidor tentará novamente.';}
  else if(!reports.length&&value.status!=='COLLECTING'){notice.hidden=false;notice.textContent='A conferência será preenchida pela coleta do servidor. Não é necessário consultar a Shopee manualmente.';}
 }
 function observe(selected,selectedScope=null,monthly=null){
  if(!started||!validMonth(selected))return Promise.resolve(false);
  const projectedScope=projectBusinessMonthAuditScope(selectedScope),scope=projectedScope?.start_date===selected+'-01'?projectedScope:null,selectedScopeKey=scope===null?'':JSON.stringify(scope);
  monthlyContext=scope===null?null:monthly;auditScopeContext=scope;
  const changedMonth=selected!==month,changedScope=selectedScopeKey!==scopeKey;
  if(changedMonth||changedScope){
   generation++;month=selected;scopeKey=selectedScopeKey;pending=null;
   const saved=cache.get(selected),reuse=changedMonth&&saved?.scopeKey===selectedScopeKey;
   value=reuse?saved.value:null;reviews=reuse?saved.reviews:[];amounts=reuse?saved.amounts:[];
   if(!reuse){cache.delete(selected);attempted.delete(selected);}
   render();showMessage(value?'Mostrando as últimas evidências salvas deste mês.':'Conferindo as evidências salvas deste mês…');
  }else renderAdjustedBalance();
  if(scope===null){value=null;reviews=[];amounts=[];render();showMessage('Aguardando um resumo publicado para conferir os mesmos pedidos.','Aguardando resumo');return Promise.resolve(false);}
  if(document.hidden)return Promise.resolve(false);
  if(pending?.month===selected&&pending.scopeKey===selectedScopeKey)return pending.task;
  const stamp=Date.now(),last=attempted.get(selected);if(last?.scopeKey===selectedScopeKey&&stamp>=last.at&&stamp-last.at<60000)return Promise.resolve(value!==null);
  attempted.set(selected,{scopeKey:selectedScopeKey,at:stamp});while(attempted.size>12){const first=attempted.keys().next().value;attempted.delete(first);cache.delete(first);}const token=generation,current=()=>started&&generation===token&&month===selected&&scopeKey===selectedScopeKey;
  const task=(async()=>{
   await Promise.resolve();
   try{const raw=await api('finance/reconciliation?month='+encodeURIComponent(selected)+'&evidence=refunds-v1');if(!current())return false;const moneyEvidence=projectBusinessReconciliationMoney(raw,{projectBusiness:projectBusinessReconciliation,projectFrame:projectReconciliationFrame,projectEvidenceFrame:projectReconciliationEvidenceFrame,projectMoneyFrame:projectReconciliationMoneyFrame}),evidence=moneyEvidence??projectBusinessReconciliationEvidence(raw,{projectBusiness:projectBusinessReconciliation,projectFrame:projectReconciliationFrame,projectEvidenceFrame:projectReconciliationEvidenceFrame}),checked=evidence?.report??projectBusinessReconciliation(raw,projectReconciliationFrame);if(!checked||checked.month!==selected)throw Error('INVALID_RECONCILIATION');const receivedScope=projectBusinessMonthAuditScope({publication_revision:checked.source_revision,start_date:checked.start_date,end_date:checked.end_date,sources:checked.sources});if(receivedScope===null||JSON.stringify(receivedScope)!==selectedScopeKey)throw Error('RECONCILIATION_SCOPE_MISMATCH');value=checked;reviews=evidence?.reviews??[];amounts=moneyEvidence?.money??[];cache.set(selected,{scopeKey:selectedScopeKey,value:checked,reviews,amounts});while(cache.size>12){const first=cache.keys().next().value;cache.delete(first);attempted.delete(first);}render();try{globalThis.brazaEscrowReleases?.refreshJoin?.();globalThis.mlsAgentRegistry?.refresh?.();}catch{}return true;}
   catch{if(current())showMessage(value?'Não foi possível atualizar a conferência agora. As evidências salvas e suas datas foram preservadas.':'A conferência ainda não pôde ser carregada. A coleta do servidor continua e tentaremos novamente.','Em conferência');return false;}
   finally{if(current()&&pending?.task===task)pending=null;}
  })();
  pending={month:selected,scopeKey:selectedScopeKey,task};return task;
 }
 function snapshot(){return started&&value?{schema:'mls_reconciliation_snapshot_v1',month,scope_key:scopeKey,report:value,reviews:reviews.map(row=>({run_id:row.run_id,source_revision:row.source_revision,review:row.review})),money:amounts.map(row=>({run_id:row.run_id,source_revision:row.source_revision,money:row.money}))}:null;}
 function start(options){if(!el('')||typeof options?.api!=='function')return false;if(started&&api===options.api)return true;generation++;api=options.api;started=true;month='';scopeKey='';pending=null;value=null;reviews=[];amounts=[];monthlyContext=null;auditScopeContext=null;cache.clear();attempted.clear();render();showMessage('Aguardando o resumo salvo do mês.');return true;}
 function stop(){started=false;generation++;api=null;pending=null;}
 function open(){const details=el('Details');if(!started||!details)return false;details.open=true;details.scrollIntoView?.({behavior:'smooth',block:'start'});el('Summary')?.focus?.({preventScroll:true});return true;}
 globalThis.brazaReconciliation={start,observe,stop,open,getSnapshot:snapshot};
})();

(()=>{
 function projectBusinessFinancialCloseout(value){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
 const array=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const money=v=>v===null||int(v,Number.MIN_SAFE_INTEGER);
 const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const hrefs=['#businessMonth','#businessReconciliation','#businessMonthCalculationDetails','#businessMonthExpensesDetails','#commandPendingIncomeDetails','/admin?tab=products','/dashboard'];
 const sources=['MONTHLY_FINANCE','SAME_PUBLICATION_RECONCILIATION','SAVED_PRODUCTION_COSTS','SAVED_EXPENSES','CALENDAR_ADS','CURRENT_INCOME_PENDING'];
 const source=v=>{if(!exact(v,['name','checked_at','freshness'])||!sources.includes(v.name)||(v.checked_at!==null&&!int(v.checked_at,1,value.checked_at+60)))return false;const currentMonth=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000)).slice(0,7),expected=v.checked_at===null?'UNKNOWN':value.checked_at-v.checked_at<=900?'FRESH':v.name!=='CURRENT_INCOME_PENDING'&&value.month<currentMonth?'HISTORICAL':'STALE';return v.freshness===expected;};
 const codes=['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','TAX_POLICY_REQUIRED','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','FINANCIAL_SOURCE_STALE','RECONCILIATION_SCOPE_REQUIRED','RECONCILIATION_INCOMPLETE','ADJUSTMENT_FIELDS_UNAVAILABLE','ADJUSTMENT_CONFLICT','RETURN_DETAILS_PENDING','CURRENT_PENDING_DETAIL_UNAVAILABLE','CURRENT_PENDING_PARTIAL','CURRENT_PENDING_DETAIL_STALE','CURRENT_PENDING_CONFLICT','CURRENT_PENDING_AMOUNT_UNVERIFIED','CURRENT_PENDING_EMPTY_MISMATCH'];
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
  for(const row of value.cases){if(!exact(row,['code','agent_id','state','affected_count','affected_unit','known_amount_cents','amount_basis','source','next_action','href','technical_code','technical_diagnostic'])||!codes.includes(row.code)||!['finance','returns','products','ads','auditor'].includes(row.agent_id)||!['OPEN','WORKING','BLOCKED'].includes(row.state)||(row.affected_count!==null&&!int(row.affected_count))||!['ORDERS','UNITS','CASES','DAYS','SOURCES','MONTH','ROWS'].includes(row.affected_unit)||!money(row.known_amount_cents)||!amountBases.includes(row.amount_basis)||!source(row.source)||!actions.includes(row.next_action)||!hrefs.includes(row.href)||!technical(row.technical_diagnostic)||row.technical_diagnostic!==null&&row.code!=='CURRENT_PENDING_DETAIL_UNAVAILABLE'||(row.technical_code!==null&&!['UNAVAILABLE','CONFIGURATION','RESPONSE_INVALID','REDIRECT_REJECTED','HTTP_ERROR','CONTENT_TYPE_INVALID','BODY_LIMIT','JSON_INVALID','FRAME_INVALID','TIMEOUT','NETWORK_ERROR','BODY_READ_ERROR'].some(suffix=>row.technical_code==='FINANCE_INCOME_DETAIL_'+suffix)))return null;
   if(['CURRENT_PENDING_CONFLICT','CURRENT_PENDING_AMOUNT_UNVERIFIED','CURRENT_PENDING_EMPTY_MISMATCH'].includes(row.code)){
    if(row.source.name!=='CURRENT_INCOME_PENDING'||row.agent_id!=='finance'||row.state!=='BLOCKED'||row.href!=='#commandPendingIncomeDetails'||row.technical_code!==null||row.technical_diagnostic!==null)return null;
    if(row.code==='CURRENT_PENDING_EMPTY_MISMATCH'?(row.affected_count!==0||row.affected_unit!=='ROWS'||!int(row.known_amount_cents,1)||row.amount_basis!=='CURRENT_PROVIDER_PENDING'||row.next_action!=='REVIEW_ARITHMETIC'):(!int(row.affected_count,1)||row.affected_unit!==(row.code==='CURRENT_PENDING_CONFLICT'?'ORDERS':'ROWS')||row.known_amount_cents!==null||row.amount_basis!=='NOT_AVAILABLE'||row.next_action!==(row.code==='CURRENT_PENDING_CONFLICT'?'RESOLVE_ADJUSTMENT_CONFLICT':'REVIEW_ARITHMETIC')))return null;
   }
  }
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
 function projectBusinessMonthAuditScope(value){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const revision=item=>Number.isSafeInteger(item)&&item>=1&&item<=2147483647;
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const uuid=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
 try{
  if(!exact(value,['publication_revision','start_date','end_date','sources'])||!revision(value.publication_revision)||!day(value.start_date)||!day(value.end_date)||value.start_date<'2000-01-01'||value.start_date.slice(8)!=='01'||value.start_date.slice(0,7)!==value.end_date.slice(0,7))return null;
  const month=value.start_date.slice(0,7),last=Number(value.end_date.slice(8)),rows=value.sources;
  if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype||rows.length!==Math.ceil(last/15)||Reflect.ownKeys(rows).length!==rows.length+1)return null;
  const sources=[],seen=new Set();
  for(let index=0;index<rows.length;index++){
   const descriptor=Object.getOwnPropertyDescriptor(rows,String(index));if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;
   const source=descriptor.value,start_date=month+'-'+String(index*15+1).padStart(2,'0'),end_date=month+'-'+String(Math.min(index*15+15,last)).padStart(2,'0');
   if(!exact(source,['run_id','source_revision','start_date','end_date'])||!uuid(source.run_id)||seen.has(source.run_id)||!revision(source.source_revision)||source.start_date!==start_date||source.end_date!==end_date)return null;
   seen.add(source.run_id);sources.push({run_id:source.run_id,source_revision:source.source_revision,start_date,end_date});
  }
  return {publication_revision:value.publication_revision,start_date:value.start_date,end_date:value.end_date,sources};
 }catch{return null;}
}
 const el=name=>document.getElementById('businessFinancialCloseout'+name);
 const node=(tag,text,cls)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(cls)value.className=cls;return value;};
 const money=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100):'Não informado';
 const time=value=>Number.isSafeInteger(value)?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value*1000)):'Sem leitura confirmada';
 const titles={COLLECTING:'Coleta mensal em andamento',PERIOD_LIMIT_REACHED:'Cobertura parcial do período',SOURCE_UNAVAILABLE:'Fonte financeira indisponível',STATUS_REVIEW_REQUIRED:'Pedidos fora da base paga em revisão',PAYMENT_INCOMPLETE:'Pagamentos sem evidência completa',RETURNS_NOT_RECONCILED:'Devoluções e reembolsos a conferir',PRODUCTION_COST_INCOMPLETE:'Unidades sem custo completo',INVOICE_TAX_UNAVAILABLE:'Imposto mensal pendente',TAX_POLICY_REQUIRED:'Regra fiscal pendente',ADS_UNAVAILABLE:'Gasto de anúncios pendente',EXTERNAL_EXPENSES_REQUIRED:'Despesas externas não confirmadas',RECHARGE_TREATMENT_REQUIRED:'Ajuste de anúncios sem classificação',ADJUSTMENT_UNAVAILABLE:'Ajustes do repasse pendentes',ARITHMETIC_UNSAFE:'Valores fora do limite seguro',FINANCIAL_SOURCE_STALE:'Leitura financeira antiga',RECONCILIATION_SCOPE_REQUIRED:'Conferência precisa corresponder à publicação',RECONCILIATION_INCOMPLETE:'Intervalos de conferência pendentes',ADJUSTMENT_FIELDS_UNAVAILABLE:'Ajustes sem valores compatíveis',ADJUSTMENT_CONFLICT:'Divergência nos ajustes informados',RETURN_DETAILS_PENDING:'Detalhes de devolução em consulta',CURRENT_PENDING_DETAIL_UNAVAILABLE:'Detalhamento do Pending atual indisponível',CURRENT_PENDING_PARTIAL:'Pending atual com cobertura parcial',CURRENT_PENDING_DETAIL_STALE:'Detalhamento do Pending precisa de atualização',CURRENT_PENDING_CONFLICT:'Pending atual com valores conflitantes para o mesmo pedido',CURRENT_PENDING_AMOUNT_UNVERIFIED:'Pending atual com valores ainda não confirmados',CURRENT_PENDING_EMPTY_MISMATCH:'Pending atual tem saldo informado, mas a lista veio vazia'};
 const actions={WAIT_FOR_COLLECTION:'Acompanhar coleta automática',REVIEW_COLLECTION_LIMIT:'Revisar cobertura da coleta',RESTORE_SOURCE:'Conferir disponibilidade da fonte',REVIEW_ORDER_STATUS:'Conferir situações dos pedidos',COMPLETE_PAYMENT_EVIDENCE:'Conferir pagamentos',COMPARE_RETURN_OUTCOMES:'Comparar devoluções com o Seller Centre',COMPLETE_VARIANT_COSTS:'Conferir custos por variação',CONFIRM_MONTHLY_TAX:'Conferir imposto mensal',WAIT_FOR_ADS_COVERAGE:'Acompanhar gasto dos anúncios',CONFIRM_EXPENSES:'Confirmar despesas do mês',CLASSIFY_RECHARGE:'Classificar ajuste de recarga',COMPLETE_ADJUSTMENTS:'Conferir ajustes do repasse',REVIEW_ARITHMETIC:'Conferir origem dos valores',WAIT_FOR_REFRESH:'Acompanhar atualização automática',WAIT_FOR_MATCHING_PUBLICATION:'Aguardar evidências da mesma publicação',WAIT_FOR_RECONCILIATION:'Acompanhar conferência automática',RESOLVE_ADJUSTMENT_CONFLICT:'Comparar evidências divergentes',WAIT_FOR_RETURN_DETAILS:'Acompanhar detalhes de devolução',RESTORE_PENDING_DETAIL:'Conferir diagnóstico do Pending',VALIDATE_PENDING_BEFORE_PAGINATION:'Validar lista antes de ampliar a coleta'};
 const sourceNames={MONTHLY_FINANCE:'Financeiro mensal',SAME_PUBLICATION_RECONCILIATION:'Conferência da mesma publicação',SAVED_PRODUCTION_COSTS:'Custos salvos',SAVED_EXPENSES:'Despesas salvas',CALENDAR_ADS:'Anúncios no calendário',CURRENT_INCOME_PENDING:'Pending atual da Shopee'};
 const amounts={KNOWN_PAID_SALES:'Vendas pagas já conhecidas',KNOWN_PAID_REPASS:'Repasse pago já conhecido',NOT_AVAILABLE:'Valor afetado ainda desconhecido',REPORTED_REFUND_ALL_COHORTS_INFORMATION_ONLY:'Reembolsos informados nos grupos consultados; sem novo desconto',IDENTIFIED_PRODUCTION_COST:'Produção já identificada',MONTHLY_TAX:'Imposto mensal',CALENDAR_ADS_SPEND:'Gasto dos anúncios',DECLARED_EXTERNAL_EXPENSES:'Despesas externas declaradas',REPORTED_RECHARGE:'Ajuste de recarga informado',CURRENT_PROVIDER_PENDING:'Pending atual; separado do resultado mensal'};
 const units={ORDERS:'pedido(s)',UNITS:'unidade(s)',CASES:'solicitação(ões)',DAYS:'dia(s)',SOURCES:'intervalo(s)',MONTH:'mês',ROWS:'registro(s)'};
 const owners={finance:'MLS Finance',returns:'MLS Returns',products:'MLS Products',ads:'MLS Ads',auditor:'MLS Auditor'};
 const freshness={FRESH:'leitura recente',STALE:'leitura antiga',HISTORICAL:'fonte histórica',UNKNOWN:'fonte pendente'};
 const checks={PERIOD:'Período completo',REPASSES:'Repasses e ajustes',RETURNS:'Devoluções e situações',PRODUCTION:'Produção',ADS:'Anúncios',TAX:'Imposto',EXPENSES:'Despesas externas'};
 let started=false,api=null,value=null,month='',scopeKey='',generation=0,pending=null,lastAttempt=0;
 function clear(message){value=null;if(el('Checks'))el('Checks').replaceChildren();if(el('Cases'))el('Cases').replaceChildren();if(el('Scope'))el('Scope').textContent='';if(el('Status'))el('Status').textContent=message;if(el('Copy'))el('Copy').disabled=true;}
 function render(){
  if(!value||!el(''))return;el('Checks').replaceChildren();el('Cases').replaceChildren();
  el('Status').textContent=value.status==='READY_FOR_COMPARISON'?'Base mensal preparada para comparação externa. '+value.cases.length+' pendência(s) de acompanhamento separadas. O fechamento exige conferência no Seller Centre e no banco.':value.cases.length+' pendência(s) consolidadas para o Hermes. '+(value.period_complete?'Calendário mensal completo.':'O mês ou o recorte ainda está aberto.');
  el('Scope').textContent='Mês '+value.month.slice(5)+'/'+value.month.slice(0,4)+' · corte até '+value.end_date.slice(8)+'/'+value.end_date.slice(5,7)+' · publicação '+(value.publication_revision??'pendente')+' · preparado em '+time(value.checked_at)+'.';
  for(const check of value.checks){const item=node('li'),link=node('a',checks[check.id]);link.href=check.href;item.append(link,node('strong',check.state==='VERIFIED'?'Evidência interna disponível':'Em conferência'),node('span',money(check.known_amount_cents)));el('Checks').append(item);}
  for(const row of value.cases){
   const article=node('article',undefined,'financial-closeout-case');article.append(node('h5',titles[row.code]));const facts=node('dl');
   for(const [label,description] of [['Responsável',owners[row.agent_id]],['Quantidade afetada',row.affected_count===null?'Ainda não confirmada':String(row.affected_count)+' '+units[row.affected_unit]],['Valor conhecido',money(row.known_amount_cents)+' · '+amounts[row.amount_basis]],['Fonte',sourceNames[row.source.name]+' · '+time(row.source.checked_at)+' · '+freshness[row.source.freshness]],['Próxima ação',actions[row.next_action]]])facts.append(node('dt',label),node('dd',description));
   if(row.technical_code)facts.append(node('dt','Motivo técnico'),node('dd',row.technical_code));
   if(row.technical_diagnostic){const technical=row.technical_diagnostic;facts.append(node('dt','Falha da fonte'),node('dd',[technical.code,technical.stage,technical.http===null?null:'HTTP '+technical.http,technical.provider_code,technical.response_kind].filter(Boolean).join(' · ')));}
   const link=node('a','Abrir conferência');link.href=row.href;article.append(facts,link);el('Cases').append(article);
  }
  if(!value.cases.length)el('Cases').append(node('p','Nenhuma pendência interna foi sinalizada nesta preparação. As comparações externas continuam obrigatórias.'));
  el('Copy').disabled=false;
  try{globalThis.mlsAgentRegistry?.refresh?.();}catch{}
 }
 function observe(selected,selectedScope=null){
  if(!started||!el('')||document.hidden||typeof selected!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected))return Promise.resolve(false);
  const scope=projectBusinessMonthAuditScope(selectedScope),key=scope===null?'':JSON.stringify(scope),changed=month!==selected||scopeKey!==key;
  if(changed){generation++;month=selected;scopeKey=key;pending=null;lastAttempt=0;clear('Conferindo as evidências salvas desta publicação.');}
  if(pending)return pending;const now=Date.now();if(lastAttempt&&now>=lastAttempt&&now-lastAttempt<60000)return Promise.resolve(value!==null);lastAttempt=now;const token=generation;
  pending=(async()=>{try{const raw=await api('finance/closeout?month='+encodeURIComponent(selected)),checked=projectBusinessFinancialCloseout(raw);if(!started||token!==generation)return false;if(!checked||checked.month!==selected||scope&&(checked.publication_revision!==scope.publication_revision||checked.start_date!==scope.start_date||checked.end_date!==scope.end_date)||scope===null&&checked.publication_revision!==null)throw Error();value=checked;render();return true;}catch{if(started&&token===generation&&!value)clear('A preparação desta publicação ainda não está disponível. As evidências salvas dos outros painéis permanecem disponíveis.');return false;}finally{if(token===generation)pending=null;}})();return pending;
 }
 function start(options){if(typeof options?.api!=='function'||!el(''))return false;if(started&&api===options.api)return true;started=true;api=options.api;generation++;month='';scopeKey='';lastAttempt=0;pending=null;clear('Aguardando as evidências salvas do mesmo mês.');const copy=el('Copy');if(copy&&!copy.dataset.financialCloseoutBound){copy.dataset.financialCloseoutBound='true';copy.addEventListener('click',async()=>{if(!value)return;try{await navigator.clipboard.writeText(JSON.stringify(value,null,2));el('Status').textContent='Relatório copiado com fontes e pendências. Nenhuma comparação externa foi confirmada.';}catch{el('Status').textContent='Não foi possível copiar neste navegador. O relatório continua disponível nesta seção.';}});}return true;}
 function stop(){started=false;generation++;api=null;pending=null;month='';scopeKey='';lastAttempt=0;clear('Aguardando as evidências salvas do mesmo mês.');}
 globalThis.brazaFinancialCloseout=Object.freeze({start,observe,stop,getSnapshot:()=>value?projectBusinessFinancialCloseout(value):null});
})();

(()=>{
 function projectEscrowReleaseFrame(value){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const cent=item=>item===null||int(item,Number.MIN_SAFE_INTEGER);
 const uuid=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
 const date=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const time=item=>int(item,1,9999999999);
 const midnight=day=>{
  const target=Date.parse(day+'T00:00:00Z'),formatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',timeZoneName:'longOffset'});let result=target;
  for(let index=0;index<2;index++){const label=formatter.formatToParts(new Date(result)).find(part=>part.type==='timeZoneName')?.value,match=/^GMT([+-])(\d{2}):(\d{2})$/.exec(label||'');if(!match)return null;result=target-(Number(match[2])*3600+Number(match[3])*60)*(match[1]==='+'?1:-1)*1000;}
  return result/1000;
 };
 const pendingCodes=['SOURCE_COLLECTING','SOURCE_MISSING','RELEASES_COLLECTING','RELEASE_IDENTITY_AMBIGUOUS','RELEASE_AMOUNT_UNVERIFIED','RELEASE_SOURCE_UNAVAILABLE','MATCHING_INCOMPLETE','FINANCIAL_EVIDENCE_MISSING','BANK_RECEIPT_NOT_VERIFIED'];
 const diagnostics=['PERMISSION_DENIED','RATE_LIMIT','TIMEOUT','UNAVAILABLE','INVALID_RESPONSE','REPEATED_PAGE','LIMIT_REACHED'];
 try{
  if(!exact(value,['schema','month','checked_at','status','sources','calendar','collection','matching','pending','basis'])||value.schema!=='finance_escrow_releases_v1'||typeof value.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||value.month<'2000-01'||!time(value.checked_at)||!['COLLECTING','PARTIAL','CHECKED','BLOCKED','LIMIT_REACHED'].includes(value.status)||value.basis!=='RELEASE_CALENDAR_AND_ORDER_CREATE_COHORT_NOT_BANK_RECEIPT'||!array(value.sources,3))return null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000));if(value.month>today.slice(0,7))return null;
  const next=new Date(value.month+'-01T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);const from=midnight(value.month+'-01'),end=midnight(next.toISOString().slice(0,10));if(!time(from)||!time(end))return null;
  const sources=[],seen=new Set();let paid=0,allSources=value.sources.length>0,allExpected=true,expected=0n;
  for(const item of value.sources){
   if(!exact(item,['run_id','source_revision','start_date','end_date','status','orders','paid_orders','finance_oldest_at','finance_latest_at','expected_repass_cents'])||!uuid(item.run_id)||seen.has(item.run_id)||!int(item.source_revision,1,2147483647)||!['AVAILABLE','MISSING'].includes(item.status))return null;seen.add(item.run_id);
   if(item.status==='MISSING'){
    if(['start_date','end_date','orders','paid_orders','finance_oldest_at','finance_latest_at','expected_repass_cents'].some(key=>item[key]!==null))return null;allSources=false;allExpected=false;
   }else{
    if(!date(item.start_date)||!date(item.end_date)||item.start_date.slice(0,7)!==value.month||item.end_date.slice(0,7)!==value.month||item.end_date<item.start_date||item.end_date>today||(Date.parse(item.end_date)-Date.parse(item.start_date))/86400000>14||!int(item.orders,0,1000)||!int(item.paid_orders,0,item.orders)||!cent(item.expected_repass_cents))return null;
    if((item.finance_oldest_at===null)!==(item.finance_latest_at===null)||item.finance_oldest_at!==null&&(!time(item.finance_oldest_at)||!int(item.finance_latest_at,item.finance_oldest_at,value.checked_at))||item.orders>0&&item.finance_oldest_at===null||item.paid_orders===0&&item.expected_repass_cents!==0)return null;
    if(sources.some(previous=>previous.status==='AVAILABLE'&&previous.start_date<=item.end_date&&item.start_date<=previous.end_date))return null;
    paid+=item.paid_orders;if(item.expected_repass_cents===null)allExpected=false;else expected+=BigInt(item.expected_repass_cents);
   }
   sources.push({...item});
  }
  const c=value.calendar,w=value.collection,m=value.matching,p=value.pending;
  if(!exact(c,['scan_id','status','from_at','end_before_at','cutoff_at','source_oldest_at','source_latest_at','observations','unique_orders','ambiguous_orders','verified_orders','unverified_orders','known_verified_release_cents','total_release_cents'])||!['MISSING','RUNNING','COMPLETE','LIMIT_REACHED'].includes(c.status)||!['observations','unique_orders','ambiguous_orders','verified_orders','unverified_orders'].every(key=>int(c[key],0,10000))||c.unique_orders>c.observations||c.ambiguous_orders>Math.min(c.unique_orders,c.observations-c.unique_orders)||c.verified_orders+c.unverified_orders!==c.unique_orders||c.verified_orders>c.unique_orders-c.ambiguous_orders||!int(c.known_verified_release_cents,Number.MIN_SAFE_INTEGER)||!cent(c.total_release_cents)||c.verified_orders===0&&c.known_verified_release_cents!==0)return null;
  if(c.status==='MISSING'){
   if(['scan_id','from_at','end_before_at','cutoff_at','source_oldest_at','source_latest_at','total_release_cents'].some(key=>c[key]!==null)||['observations','unique_orders','ambiguous_orders','verified_orders','unverified_orders','known_verified_release_cents'].some(key=>c[key]!==0))return null;
  }else{
   if(!uuid(c.scan_id)||c.from_at!==from||!int(c.cutoff_at,from+1,Math.min(end,value.checked_at))||c.end_before_at!==c.cutoff_at||(c.source_oldest_at===null)!==(c.source_latest_at===null)||c.source_oldest_at!==null&&(!time(c.source_oldest_at)||!int(c.source_latest_at,c.source_oldest_at,value.checked_at))||c.observations>0&&c.source_oldest_at===null||c.status==='COMPLETE'&&c.source_oldest_at===null)return null;
   const completeMoney=c.status==='COMPLETE'&&c.ambiguous_orders===0&&c.verified_orders===c.unique_orders;
   if(completeMoney?c.total_release_cents!==c.known_verified_release_cents:c.total_release_cents!==null)return null;
  }
  if(!exact(w,['scan_id','status','cutoff_at','windows_total','windows_complete','pages_read','observations','next_attempt_at','diagnostic'])||!['MISSING','RUNNING','COMPLETE','LIMIT_REACHED','RETRY_WAIT','BLOCKED'].includes(w.status)||!int(w.windows_total,0,6)||!int(w.windows_complete,0,w.windows_total)||!int(w.pages_read,0,1200)||!int(w.observations,0,10000)||!int(w.next_attempt_at,0,9999999999)||w.diagnostic!==null&&!diagnostics.includes(w.diagnostic))return null;
  if(w.status==='MISSING'){
   if(w.scan_id!==null||w.cutoff_at!==null||w.diagnostic!==null||['windows_total','windows_complete','pages_read','observations','next_attempt_at'].some(key=>w[key]!==0)||c.status!=='MISSING')return null;
  }else{
   const windows=cutoff=>{const lastDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date((cutoff-1)*1000));return Math.ceil(((Date.parse(lastDay+'T00:00:00Z')-Date.parse(value.month+'-01T00:00:00Z'))/86400000+1)/7);};
   if(!uuid(w.scan_id)||!int(w.cutoff_at,from+1,Math.min(end,value.checked_at))||w.windows_total<1||w.windows_total!==windows(w.cutoff_at)||w.windows_complete>w.pages_read||w.status==='COMPLETE'&&(w.windows_complete!==w.windows_total||w.diagnostic!==null)||w.status!=='COMPLETE'&&w.windows_complete===w.windows_total||w.status==='RUNNING'&&w.diagnostic!==null||['RETRY_WAIT','BLOCKED','LIMIT_REACHED'].includes(w.status)&&w.diagnostic===null||w.status==='BLOCKED'&&w.diagnostic!=='PERMISSION_DENIED')return null;
   if(c.status==='MISSING'||w.cutoff_at<c.cutoff_at)return null;
   if(w.scan_id===c.scan_id){if(w.cutoff_at!==c.cutoff_at||w.observations!==c.observations||c.status==='COMPLETE'&&w.status!=='COMPLETE'||c.status==='RUNNING'&&!['RUNNING','RETRY_WAIT','BLOCKED'].includes(w.status)||c.status==='LIMIT_REACHED'&&w.status!=='LIMIT_REACHED')return null;}
   else if(c.status!=='COMPLETE'||w.status==='COMPLETE')return null;
  }
  const moneyKeys=['known_expected_located_cents','expected_located_cents','known_verified_release_cents','verified_release_cents','comparison_difference_cents'];
  if(!exact(m,['status','paid_orders','located_paid_orders','unlocated_paid_orders','ambiguous_paid_orders','verified_paid_orders',...moneyKeys,'outside_cohort_orders'])||!['AVAILABLE','SOURCE_MISSING'].includes(m.status)||!['located_paid_orders','ambiguous_paid_orders','verified_paid_orders'].every(key=>int(m[key],0,3000))||m.verified_paid_orders>m.located_paid_orders||m.located_paid_orders+m.ambiguous_paid_orders>c.unique_orders||m.ambiguous_paid_orders>c.ambiguous_orders||m.verified_paid_orders!==c.verified_orders||!moneyKeys.every(key=>cent(m[key]))||m.known_expected_located_cents===null||m.known_verified_release_cents===null||m.known_verified_release_cents!==c.known_verified_release_cents||m.located_paid_orders===0&&m.known_expected_located_cents!==0||m.verified_paid_orders===0&&m.known_verified_release_cents!==0)return null;
  if(m.status==='SOURCE_MISSING'){
   if(allSources||['paid_orders','unlocated_paid_orders','outside_cohort_orders','expected_located_cents','verified_release_cents','comparison_difference_cents'].some(key=>m[key]!==null))return null;
  }else{
   if(!allSources||!int(m.paid_orders,0,3000)||m.paid_orders!==paid||!int(m.unlocated_paid_orders,0,paid)||m.located_paid_orders+m.ambiguous_paid_orders+m.unlocated_paid_orders!==paid||!int(m.outside_cohort_orders,0,10000)||m.outside_cohort_orders!==c.unique_orders-m.located_paid_orders-m.ambiguous_paid_orders||m.expected_located_cents!==null&&m.expected_located_cents!==m.known_expected_located_cents||m.located_paid_orders===0&&m.expected_located_cents!==0)return null;
   const verified=c.status==='COMPLETE'&&m.verified_paid_orders===m.located_paid_orders;
   if(verified?m.verified_release_cents!==m.known_verified_release_cents:m.verified_release_cents!==null)return null;
   const comparable=m.verified_release_cents!==null&&m.expected_located_cents!==null;
   if(comparable){const difference=BigInt(m.verified_release_cents)-BigInt(m.expected_located_cents);if(difference<BigInt(Number.MIN_SAFE_INTEGER)||difference>BigInt(Number.MAX_SAFE_INTEGER)||BigInt(m.comparison_difference_cents??Number.MAX_SAFE_INTEGER)!==difference||m.comparison_difference_cents===null)return null;}
   else if(m.comparison_difference_cents!==null)return null;
   if(allExpected&&m.unlocated_paid_orders===0&&m.ambiguous_paid_orders===0&&(expected<BigInt(Number.MIN_SAFE_INTEGER)||expected>BigInt(Number.MAX_SAFE_INTEGER)||m.expected_located_cents===null||BigInt(m.expected_located_cents)!==expected))return null;
  }
  if(!array(p,pendingCodes.length)||new Set(p).size!==p.length||!p.every(code=>pendingCodes.includes(code))||!p.includes('BANK_RECEIPT_NOT_VERIFIED'))return null;
  const unavailable=w.diagnostic!==null&&w.diagnostic!=='LIMIT_REACHED';
  const required=[...(m.status==='SOURCE_MISSING'?['SOURCE_MISSING','MATCHING_INCOMPLETE']:[]),...(c.status!=='COMPLETE'?['RELEASES_COLLECTING']:[]),...(c.ambiguous_orders>0?['RELEASE_IDENTITY_AMBIGUOUS']:[]),...(c.unverified_orders>0?['RELEASE_AMOUNT_UNVERIFIED']:[]),...(unavailable?['RELEASE_SOURCE_UNAVAILABLE']:[]),...(m.status==='AVAILABLE'&&(m.unlocated_paid_orders>0||m.ambiguous_paid_orders>0||m.verified_paid_orders<m.located_paid_orders)?['MATCHING_INCOMPLETE']:[]),...(sources.some(row=>row.status==='AVAILABLE'&&row.expected_repass_cents===null)||m.status==='AVAILABLE'&&m.expected_located_cents===null?['FINANCIAL_EVIDENCE_MISSING']:[])];
  if(!required.every(code=>p.includes(code))||value.status==='CHECKED'&&(c.status!=='COMPLETE'||m.status!=='AVAILABLE'||c.unverified_orders>0||c.ambiguous_orders>0||p.some(code=>code!=='BANK_RECEIPT_NOT_VERIFIED'))||value.status==='BLOCKED'&&w.status!=='BLOCKED'||value.status==='LIMIT_REACHED'&&w.status!=='LIMIT_REACHED'&&c.status!=='LIMIT_REACHED'||value.status==='COLLECTING'&&!['MISSING','RUNNING'].includes(c.status))return null;
  return {schema:value.schema,month:value.month,checked_at:value.checked_at,status:value.status,sources,calendar:{...c},collection:{...w},matching:{...m},pending:[...p],basis:value.basis};
 }catch{return null;}
}
 function projectEscrowReleaseEvidenceFrame(value,projectLegacy){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const cent=item=>item===null||int(item,Number.MIN_SAFE_INTEGER);
 const hash=item=>typeof item==='string'&&/^[a-f0-9]{64}$/.test(item);
 const time=item=>item===null||int(item,1,9999999999);
 try{
  if(typeof projectLegacy!=='function'||!exact(value,['schema','report','orders'])||value.schema!=='finance_escrow_releases_v2')return null;
  const report=projectLegacy(value.report),o=value.orders;if(!report||!exact(o,['schema','summary','rows','truncation','basis'])||o.schema!=='finance_escrow_release_orders_v1'||o.basis!=='PAID_ORDER_COHORT_RELEASE_MATCHING_NOT_BANK_RECEIPT'||!array(o.rows,40))return null;
  const s=o.summary,t=o.truncation;
  const summaryKeys=['known_paid_orders','located_orders','ambiguous_orders','verified_orders','unverified_orders','not_located_orders','adjusted_orders','after_adjustment_known_orders','known_after_adjustment_cents','not_located_after_adjustment_known_orders','known_not_located_after_adjustment_cents'],countKeys=['known_paid_orders','located_orders','ambiguous_orders','verified_orders','unverified_orders','not_located_orders','adjusted_orders','after_adjustment_known_orders','not_located_after_adjustment_known_orders'];
  if(!exact(s,summaryKeys)||!countKeys.every(key=>int(s[key],0,100000))||!int(s.known_after_adjustment_cents,Number.MIN_SAFE_INTEGER)||!int(s.known_not_located_after_adjustment_cents,Number.MIN_SAFE_INTEGER))return null;
  if(s.located_orders+s.ambiguous_orders+s.not_located_orders!==s.known_paid_orders||s.verified_orders+s.unverified_orders!==s.located_orders||s.after_adjustment_known_orders>s.known_paid_orders||s.adjusted_orders>s.after_adjustment_known_orders||s.not_located_after_adjustment_known_orders>s.not_located_orders||s.after_adjustment_known_orders===0&&s.known_after_adjustment_cents!==0||s.not_located_after_adjustment_known_orders===0&&s.known_not_located_after_adjustment_cents!==0)return null;
  const matching=report.matching;if(matching.status==='AVAILABLE'&&(s.known_paid_orders!==matching.paid_orders||s.located_orders!==matching.located_paid_orders||s.ambiguous_orders!==matching.ambiguous_paid_orders||s.verified_orders!==matching.verified_paid_orders||s.unverified_orders!==matching.located_paid_orders-matching.verified_paid_orders||s.not_located_orders!==matching.unlocated_paid_orders))return null;
  if(!exact(t,['truncated','orders_total','orders_included'])||typeof t.truncated!=='boolean'||t.orders_total!==s.known_paid_orders||!int(t.orders_included,0,Math.min(40,t.orders_total))||t.orders_included!==o.rows.length||t.truncated!==(t.orders_included<t.orders_total))return null;
  const states=['NOT_LOCATED','AMBIGUOUS','LOCATED_UNVERIFIED','VERIFIED'],bases=['BASE_REPASS','AFTER_ADJUSTMENT'],seen=new Set(),visible={NOT_LOCATED:0,AMBIGUOUS:0,LOCATED_UNVERIFIED:0,VERIFIED:0};let visibleAdjusted=0,visibleAfterKnown=0,visibleAfter=0n,visibleNotLocatedKnown=0,visibleNotLocated=0n;
  for(const row of o.rows){
   const keys=['order_hash','state','reference_count','release_time','financial_checked_at','release_checked_at','base_repass_cents','adjustment_cents','after_adjustment_repass_cents','release_cents','comparison_basis','difference_from_base_cents'];
   if(!exact(row,keys)||!hash(row.order_hash)||seen.has(row.order_hash)||!states.includes(row.state)||!int(row.reference_count,0,100)||!time(row.release_time)||!int(row.financial_checked_at,1,report.checked_at)||!time(row.release_checked_at)||!cent(row.base_repass_cents)||!cent(row.adjustment_cents)||!cent(row.after_adjustment_repass_cents)||!cent(row.release_cents)||row.comparison_basis!==null&&!bases.includes(row.comparison_basis)||!cent(row.difference_from_base_cents))return null;
   seen.add(row.order_hash);visible[row.state]++;
   const adjusted=row.adjustment_cents!==null&&row.after_adjustment_repass_cents!==null;
   if(adjusted){if(row.base_repass_cents===null||BigInt(row.base_repass_cents)+BigInt(row.adjustment_cents)!==BigInt(row.after_adjustment_repass_cents))return null;visibleAfterKnown++;visibleAfter+=BigInt(row.after_adjustment_repass_cents);if(row.adjustment_cents!==0)visibleAdjusted++;}
   else if(row.adjustment_cents!==null||row.after_adjustment_repass_cents!==null)return null;
   if(row.state==='NOT_LOCATED'){
    if(row.reference_count!==0||row.release_time!==null||row.release_checked_at!==null||row.release_cents!==null||row.comparison_basis!==null||row.difference_from_base_cents!==null)return null;
    if(adjusted){visibleNotLocatedKnown++;visibleNotLocated+=BigInt(row.after_adjustment_repass_cents);}
   }else if(row.state==='AMBIGUOUS'){
    if(row.reference_count<2||row.release_time!==null||row.release_checked_at!==null||row.release_cents!==null||row.comparison_basis!==null||row.difference_from_base_cents!==null)return null;
   }else{
    if(row.reference_count!==1||row.release_time===null||row.release_checked_at===null)return null;
    if(row.state==='LOCATED_UNVERIFIED'){
     if(row.release_cents!==null||row.comparison_basis!==null||row.difference_from_base_cents!==null)return null;
    }else{
     if(row.release_cents===null||row.base_repass_cents===null||row.comparison_basis===null||row.difference_from_base_cents===null||BigInt(row.release_cents)-BigInt(row.base_repass_cents)!==BigInt(row.difference_from_base_cents))return null;
     if(row.comparison_basis==='BASE_REPASS'&&row.release_cents!==row.base_repass_cents||row.comparison_basis==='AFTER_ADJUSTMENT'&&(!adjusted||row.release_cents!==row.after_adjustment_repass_cents))return null;
    }
   }
  }
  if(!t.truncated){
   if(visible.NOT_LOCATED!==s.not_located_orders||visible.AMBIGUOUS!==s.ambiguous_orders||visible.VERIFIED!==s.verified_orders||visible.LOCATED_UNVERIFIED!==s.unverified_orders||visibleAdjusted!==s.adjusted_orders||visibleAfterKnown!==s.after_adjustment_known_orders||visibleAfter!==BigInt(s.known_after_adjustment_cents)||visibleNotLocatedKnown!==s.not_located_after_adjustment_known_orders||visibleNotLocated!==BigInt(s.known_not_located_after_adjustment_cents))return null;
  }else if(visible.NOT_LOCATED>s.not_located_orders||visible.AMBIGUOUS>s.ambiguous_orders||visible.VERIFIED>s.verified_orders||visible.LOCATED_UNVERIFIED>s.unverified_orders||visibleAdjusted>s.adjusted_orders||visibleAfterKnown>s.after_adjustment_known_orders||visibleAfter>BigInt(s.known_after_adjustment_cents)||visibleNotLocatedKnown>s.not_located_after_adjustment_known_orders||visibleNotLocated>BigInt(s.known_not_located_after_adjustment_cents))return null;
  const result={schema:'finance_escrow_releases_v2',report,orders:{schema:o.schema,summary:{...s},rows:o.rows.map(row=>({...row})),truncation:{...t},basis:o.basis}};
  return new TextEncoder().encode(JSON.stringify(result)).byteLength<=65536?result:null;
 }catch{return null;}
}
 function projectEscrowReleaseCoverageFrame(value){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const month=item=>typeof item==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(item)&&item>='2000-01';
 const monthIndex=item=>Number(item.slice(0,4))*12+Number(item.slice(5,7))-1;
 const nextMonth=item=>{const date=new Date(item+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);return date.toISOString().slice(0,7);};
 const uuid=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const cents=item=>item===null||int(item,Number.MIN_SAFE_INTEGER);
 const time=item=>item===null||int(item,1,9999999999);
 const allowedPending=['SOURCE_MISSING','CALENDAR_MISSING','CALENDAR_PARTIAL','ORDER_NOT_LOCATED','RELEASE_IDENTITY_AMBIGUOUS','BANK_RECEIPT_NOT_VERIFIED','RELEASE_CYCLE_SEMANTICS_UNVERIFIED'];
 try{
  if(!exact(value,['schema','cohort_month','through_month','checked_at','status','sources','calendars','coverage','pending','basis'])||value.schema!=='finance_escrow_release_coverage_v1'||!month(value.cohort_month)||!month(value.through_month)||value.cohort_month>value.through_month||monthIndex(value.through_month)-monthIndex(value.cohort_month)>5||!int(value.checked_at,1,9999999999)||!['COLLECTING','PARTIAL','IDENTITY_COMPLETE'].includes(value.status)||value.basis!=='SAVED_RELEASE_CALENDARS_AGAINST_PAID_ORDER_COHORT_NOT_BANK_RECEIPT'||!array(value.sources,3))return null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000)).slice(0,7);if(value.through_month>today)return null;
  const sources=[],seen=new Set();let paid=0,allSources=value.sources.length>0;
  for(const item of value.sources){
   if(!exact(item,['run_id','source_revision','start_date','end_date','status','orders','paid_orders','finance_oldest_at','finance_latest_at','expected_repass_cents'])||!uuid(item.run_id)||seen.has(item.run_id)||!int(item.source_revision,1,2147483647)||!['AVAILABLE','MISSING'].includes(item.status))return null;seen.add(item.run_id);
   if(item.status==='MISSING'){
    if(['start_date','end_date','orders','paid_orders','finance_oldest_at','finance_latest_at','expected_repass_cents'].some(key=>item[key]!==null))return null;allSources=false;
   }else{
    if(!day(item.start_date)||!day(item.end_date)||item.start_date.slice(0,7)!==value.cohort_month||item.end_date.slice(0,7)!==value.cohort_month||item.end_date<item.start_date||(Date.parse(item.end_date)-Date.parse(item.start_date))/86400000>14||!int(item.orders,0,1000)||!int(item.paid_orders,0,item.orders)||!cents(item.expected_repass_cents)||!int(item.finance_oldest_at,1,value.checked_at)||!int(item.finance_latest_at,item.finance_oldest_at,value.checked_at))return null;
    paid+=item.paid_orders;
   }
   sources.push({...item});
  }
  const months=monthIndex(value.through_month)-monthIndex(value.cohort_month)+1;if(!array(value.calendars,6)||value.calendars.length!==months)return null;
  const calendars=[];let expected=value.cohort_month,completeCalendars=0,hasMissing=false,hasPartial=false;
  for(const item of value.calendars){
   if(!exact(item,['month','status','scan_id','cutoff_at','source_oldest_at','source_latest_at','observations','cohort_observations','unique_cohort_orders','ambiguous_cohort_orders'])||item.month!==expected||!['MISSING','PARTIAL','COMPLETE'].includes(item.status)||!int(item.observations,0,10000)||!int(item.cohort_observations,0,item.observations)||!int(item.unique_cohort_orders,0,item.cohort_observations)||!int(item.ambiguous_cohort_orders,0,item.unique_cohort_orders))return null;
   if(item.status==='MISSING'){
    if(item.scan_id!==null||item.cutoff_at!==null||item.source_oldest_at!==null||item.source_latest_at!==null||item.observations!==0||item.cohort_observations!==0||item.unique_cohort_orders!==0||item.ambiguous_cohort_orders!==0)return null;hasMissing=true;
   }else{
    if(!uuid(item.scan_id)||!int(item.cutoff_at,1,value.checked_at)||(item.source_oldest_at===null)!==(item.source_latest_at===null)||item.source_oldest_at!==null&&(!int(item.source_oldest_at,1,value.checked_at)||!int(item.source_latest_at,item.source_oldest_at,value.checked_at))||item.observations>0&&item.source_oldest_at===null)return null;
    if(item.status==='COMPLETE')completeCalendars++;else hasPartial=true;
   }
   calendars.push({...item});expected=nextMonth(expected);
  }
  const coverage=value.coverage;if(!exact(coverage,['paid_orders','located_orders','not_located_orders','ambiguous_orders','single_orders','calendars_total','calendars_complete','identity_complete_at_cutoff'])||coverage.paid_orders!==null&&!int(coverage.paid_orders,0,3000)||!int(coverage.located_orders,0,3000)||coverage.not_located_orders!==null&&!int(coverage.not_located_orders,0,3000)||!int(coverage.ambiguous_orders,0,coverage.located_orders)||!int(coverage.single_orders,0,coverage.located_orders)||coverage.single_orders+coverage.ambiguous_orders!==coverage.located_orders||coverage.calendars_total!==calendars.length||coverage.calendars_complete!==completeCalendars||typeof coverage.identity_complete_at_cutoff!=='boolean')return null;
  if(allSources){
   if(coverage.paid_orders!==paid||coverage.not_located_orders!==paid-coverage.located_orders||coverage.located_orders>paid)return null;
  }else if(coverage.paid_orders!==null||coverage.not_located_orders!==null)return null;
  const identity=allSources&&!hasMissing&&!hasPartial&&coverage.not_located_orders===0&&coverage.ambiguous_orders===0;
  if(coverage.identity_complete_at_cutoff!==identity)return null;
  if(!array(value.pending,allowedPending.length)||new Set(value.pending).size!==value.pending.length||!value.pending.every(code=>allowedPending.includes(code))||!value.pending.includes('BANK_RECEIPT_NOT_VERIFIED')||!value.pending.includes('RELEASE_CYCLE_SEMANTICS_UNVERIFIED'))return null;
  const required=[...(!allSources?['SOURCE_MISSING']:[]),...(hasMissing?['CALENDAR_MISSING']:[]),...(hasPartial?['CALENDAR_PARTIAL']:[]),...(allSources&&coverage.not_located_orders>0?['ORDER_NOT_LOCATED']:[]),...(coverage.ambiguous_orders>0?['RELEASE_IDENTITY_AMBIGUOUS']:[])];
  if(!required.every(code=>value.pending.includes(code)))return null;
  const status=!allSources||hasMissing||hasPartial?'COLLECTING':identity?'IDENTITY_COMPLETE':'PARTIAL';if(value.status!==status)return null;
  return {schema:value.schema,cohort_month:value.cohort_month,through_month:value.through_month,checked_at:value.checked_at,status,sources,calendars,coverage:{...coverage},pending:[...value.pending],basis:value.basis};
 }catch{return null;}
}
 function projectBusinessEscrowReleases(value,projectFrame){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const integer=(item,min=0,max=9999999999)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const cents=item=>item===null||integer(item,Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER);
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const uuid=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
 const safeCodes=['UNAVAILABLE','CONFIGURATION','RESPONSE_INVALID','REDIRECT_REJECTED','HTTP_ERROR','CONTENT_TYPE_INVALID','BODY_LIMIT','JSON_INVALID','FRAME_INVALID','SCOPE_MISMATCH','TIMEOUT','NETWORK_ERROR','BODY_READ_ERROR','SOURCE_UNAVAILABLE','PERMISSION_REQUIRED'].map(suffix=>'FINANCE_ESCROW_RELEASES_'+suffix);
 try{
  if(typeof projectFrame!=='function'||!exact(value,['schema','month','checked_at','status','cohort','report','attempt'])||value.schema!=='business_escrow_releases_v1'||typeof value.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||value.month<'2000-01'||!integer(value.checked_at,1)||!['COLLECTING','RUNNING','CHECKED','PARTIAL','UNAVAILABLE'].includes(value.status))return null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000));if(value.month>today.slice(0,7))return null;
  let cohort=null;
  if(value.cohort!==null){const c=value.cohort;if(!exact(c,['publication_revision','start_date','end_date','sources'])||!integer(c.publication_revision,1,2147483647)||c.start_date!==value.month+'-01'||!day(c.start_date)||!day(c.end_date)||c.end_date.slice(0,7)!==value.month||c.end_date>today||!array(c.sources,3)||c.sources.length!==Math.ceil(Number(c.end_date.slice(8))/15))return null;
   const ids=new Set(),sources=[];
   for(let index=0;index<c.sources.length;index++){const source=c.sources[index],start=value.month+'-'+String(index*15+1).padStart(2,'0'),end=value.month+'-'+String(Math.min(index*15+15,Number(c.end_date.slice(8)))).padStart(2,'0');
    if(!exact(source,['run_id','source_revision','start_date','end_date','finance_oldest_at','finance_latest_at','orders','paid_orders','expected_repass_cents'])||!uuid(source.run_id)||ids.has(source.run_id)||!integer(source.source_revision,1,2147483647)||source.start_date!==start||source.end_date!==end||!integer(source.orders,0,1000)||!integer(source.paid_orders,0,source.orders)||!cents(source.expected_repass_cents)||(source.finance_oldest_at===null)!==(source.finance_latest_at===null)||source.orders>0&&source.finance_oldest_at===null||source.finance_oldest_at!==null&&(!integer(source.finance_oldest_at,1,value.checked_at)||!integer(source.finance_latest_at,source.finance_oldest_at,value.checked_at)))return null;
    ids.add(source.run_id);sources.push({...source});
   }
   cohort={publication_revision:c.publication_revision,start_date:c.start_date,end_date:c.end_date,sources};
  }
  let report=null;if(value.report!==null){report=projectFrame(value.report);const sources=cohort?.sources??[];if(!report||report.month!==value.month||report.checked_at>value.checked_at||report.sources.length!==sources.length)return null;
   for(const source of sources){const observed=report.sources.find(row=>row.run_id===source.run_id);if(!observed||observed.source_revision!==source.source_revision)return null;if(observed.status==='AVAILABLE'&&(observed.start_date!==source.start_date||observed.end_date!==source.end_date||observed.orders!==source.orders||observed.paid_orders!==source.paid_orders||observed.expected_repass_cents!==source.expected_repass_cents||source.orders>0&&(observed.finance_oldest_at!==source.finance_oldest_at||observed.finance_latest_at!==source.finance_latest_at)))return null;}
  }
  let attempt=null;if(value.attempt!==null){const a=value.attempt;if(!exact(a,['checked_at','status','code','next_attempt_at'])||!integer(a.checked_at,1,value.checked_at)||!integer(a.next_attempt_at,a.checked_at)||!['SUCCESS','UNAVAILABLE'].includes(a.status)||(a.status==='SUCCESS'?a.code!==null:!safeCodes.includes(a.code)))return null;attempt={...a};}
  const unavailable=attempt?.status==='UNAVAILABLE',status=report?(report.status==='CHECKED'&&!unavailable?'CHECKED':report.status==='COLLECTING'&&!unavailable?'RUNNING':'PARTIAL'):unavailable?'UNAVAILABLE':'COLLECTING';
  if(value.status!==status||attempt?.status==='SUCCESS'&&report===null)return null;
  return {schema:'business_escrow_releases_v1',month:value.month,checked_at:value.checked_at,status,cohort,report,attempt};
 }catch{return null;}
}
 function projectBusinessEscrowReleaseEvidence(value,validators={}){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 try{
  if(!exact(validators,['projectBusiness','projectFrame','projectEvidenceFrame'])||!Object.values(validators).every(fn=>typeof fn==='function')||!exact(value,['schema','report','orders'])||value.schema!=='business_escrow_releases_v2')return null;
  const report=validators.projectBusiness(value.report,validators.projectFrame);if(!report||report.report===null)return null;
  const evidence=validators.projectEvidenceFrame({schema:'finance_escrow_releases_v2',report:report.report,orders:value.orders},validators.projectFrame);if(!evidence)return null;
  const result={schema:'business_escrow_releases_v2',report,orders:evidence.orders};return new TextEncoder().encode(JSON.stringify(result)).byteLength<=262144?result:null;
 }catch{return null;}
}
 function projectBusinessEscrowReleaseCoverage(value,projectFrame){
 // The owner client embeds this function verbatim. Keep every validator local
 // so minification cannot capture a server-only module closure.
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const integer=(item,min=0,max=9999999999)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const month=item=>typeof item==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(item)&&item>='2000-01';
 const codes=['UNAVAILABLE','CONFIGURATION','RESPONSE_INVALID','REDIRECT_REJECTED','HTTP_ERROR','CONTENT_TYPE_INVALID','BODY_LIMIT','JSON_INVALID','FRAME_INVALID','SCOPE_MISMATCH','TIMEOUT','NETWORK_ERROR','BODY_READ_ERROR'].map(suffix=>'FINANCE_ESCROW_RELEASES_'+suffix);
 try{
  if(typeof projectFrame!=='function'||!exact(value,['schema','cohort_month','checked_at','status','report','attempt'])||value.schema!=='business_escrow_release_coverage_v1'||!month(value.cohort_month)||!integer(value.checked_at,1)||!['PENDING','AVAILABLE','PARTIAL_UNAVAILABLE','UNAVAILABLE'].includes(value.status))return null;
  let report=null;if(value.report!==null){report=projectFrame(value.report);if(!report||report.cohort_month!==value.cohort_month||report.checked_at>value.checked_at)return null;}
  let attempt=null;if(value.attempt!==null){const row=value.attempt;if(!exact(row,['checked_at','status','code','next_attempt_at'])||!integer(row.checked_at,1,value.checked_at)||!['SUCCESS','UNAVAILABLE'].includes(row.status)||!integer(row.next_attempt_at,row.checked_at)||(row.status==='SUCCESS'?row.code!==null:!codes.includes(row.code)))return null;attempt={...row};}
  const status=report?(attempt?.status==='UNAVAILABLE'?'PARTIAL_UNAVAILABLE':'AVAILABLE'):attempt?.status==='UNAVAILABLE'?'UNAVAILABLE':'PENDING';if(value.status!==status)return null;
  return {schema:value.schema,cohort_month:value.cohort_month,checked_at:value.checked_at,status,report,attempt};
 }catch{return null;}
}
 function projectMlsReleaseCoverageFollowup(value,selection,projectCoverage,projectFrame){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
 const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const month=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v)&&v>='2000-01';
 const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
 const waiting=reason=>{let selected=null;try{const descriptor=Object.getOwnPropertyDescriptor(selection??{},'month');if(descriptor&&Object.hasOwn(descriptor,'value')&&month(descriptor.value))selected=descriptor.value;}catch{}return {schema:'mls_release_coverage_followup_v1',state:'WAITING',reason,scope_compatible:false,month:selected,period:null,through_month:null,checked_at:null,attempt:null,coverage:null,calendars:[]};};
 try{
  if(!exact(selection,['month','scope','currentMonth','cohortSources','checkedAt'])||!integer(selection.checkedAt,1,9999999999)||!month(selection.month)||!month(selection.currentMonth)||selection.month>selection.currentMonth)return waiting('SELECTION_INVALID');
  if(selection.month===selection.currentMonth)return {...waiting('CURRENT_MONTH'),state:'CURRENT_MONTH'};
  const scope=selection.scope;
  if(!exact(scope,['publication_revision','start_date','end_date','sources'])||!integer(scope.publication_revision,1,2147483647)||scope.start_date!==selection.month+'-01'||!day(scope.end_date)||scope.end_date.slice(0,7)!==selection.month||!Array.isArray(scope.sources)||scope.sources.length!==Math.ceil(Number(scope.end_date.slice(8))/15)||!Array.isArray(selection.cohortSources)||selection.cohortSources.length!==scope.sources.length)return waiting('PUBLICATION_SCOPE_REQUIRED');
  const expected=new Map(),published=new Map();
  for(const [index,source] of scope.sources.entries()){
   if(!exact(source,['run_id','source_revision','start_date','end_date'])||!uuid(source.run_id)||expected.has(source.run_id)||!integer(source.source_revision,1,2147483647)||source.start_date!==selection.month+'-'+String(index*15+1).padStart(2,'0')||source.end_date!==selection.month+'-'+String(Math.min(index*15+15,Number(scope.end_date.slice(8)))).padStart(2,'0'))return waiting('PUBLICATION_SCOPE_REQUIRED');
   expected.set(source.run_id,source);
  }
  for(const source of selection.cohortSources){
   const ref=expected.get(source?.run_id);
   if(!ref||published.has(source.run_id)||source.source_revision!==ref.source_revision||source.start_date!==ref.start_date||source.end_date!==ref.end_date||!integer(source.orders,0,1000)||!integer(source.paid_orders,0,source.orders)||source.expected_repass_cents!==null&&!integer(source.expected_repass_cents,Number.MIN_SAFE_INTEGER)||(source.finance_oldest_at===null)!==(source.finance_latest_at===null)||source.orders>0&&source.finance_oldest_at===null||source.finance_oldest_at!==null&&(!integer(source.finance_oldest_at,1,selection.checkedAt+60)||!integer(source.finance_latest_at,source.finance_oldest_at,selection.checkedAt+60)))return waiting('PUBLICATION_SCOPE_REQUIRED');
   published.set(source.run_id,source);
  }
  if(typeof projectCoverage!=='function'||typeof projectFrame!=='function')return waiting('VALIDATOR_REQUIRED');
  const observed=projectCoverage(value,projectFrame);
  if(!observed||observed.cohort_month!==selection.month||observed.checked_at>selection.checkedAt+60)return waiting('SAVED_EVIDENCE_NOT_LOADED');
  if(!observed.report)return {...waiting(observed.status==='UNAVAILABLE'?'SOURCE_UNAVAILABLE':'AWAITING_AUTOMATIC_CHECK'),attempt:observed.attempt?{...observed.attempt}:null};
  const report=observed.report;
  if(report.cohort_month!==selection.month||report.through_month>selection.currentMonth||report.sources.length!==expected.size)return waiting('PUBLICATION_MISMATCH');
  const seen=new Set();
  for(const source of report.sources){
   const ref=expected.get(source.run_id),saved=published.get(source.run_id);
   if(!ref||seen.has(source.run_id)||source.source_revision!==ref.source_revision)return waiting('PUBLICATION_MISMATCH');
   if(source.status==='AVAILABLE'&&(source.start_date!==ref.start_date||source.end_date!==ref.end_date||source.orders!==saved.orders||source.paid_orders!==saved.paid_orders||source.expected_repass_cents!==saved.expected_repass_cents||saved.orders>0&&(source.finance_oldest_at!==saved.finance_oldest_at||source.finance_latest_at!==saved.finance_latest_at)))return waiting('PUBLICATION_MISMATCH');
   seen.add(source.run_id);
  }
  const historical=report.through_month<selection.currentMonth;
  return {schema:'mls_release_coverage_followup_v1',state:historical?'HISTORICAL':observed.status==='PARTIAL_UNAVAILABLE'?'RETRY_WAIT':'CURRENT',reason:historical?'LATER_CALENDAR_PENDING':observed.status==='PARTIAL_UNAVAILABLE'?'SOURCE_REFRESH_FAILED':null,scope_compatible:true,month:selection.month,period:{start_date:scope.start_date,end_date:scope.end_date},through_month:report.through_month,checked_at:report.checked_at,attempt:observed.attempt?{...observed.attempt}:null,coverage:{...report.coverage},calendars:report.calendars.map(row=>({...row}))};
 }catch{return waiting('INVALID_EVIDENCE');}
}
 function projectBusinessMonthAuditScope(value){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const revision=item=>Number.isSafeInteger(item)&&item>=1&&item<=2147483647;
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const uuid=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
 try{
  if(!exact(value,['publication_revision','start_date','end_date','sources'])||!revision(value.publication_revision)||!day(value.start_date)||!day(value.end_date)||value.start_date<'2000-01-01'||value.start_date.slice(8)!=='01'||value.start_date.slice(0,7)!==value.end_date.slice(0,7))return null;
  const month=value.start_date.slice(0,7),last=Number(value.end_date.slice(8)),rows=value.sources;
  if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype||rows.length!==Math.ceil(last/15)||Reflect.ownKeys(rows).length!==rows.length+1)return null;
  const sources=[],seen=new Set();
  for(let index=0;index<rows.length;index++){
   const descriptor=Object.getOwnPropertyDescriptor(rows,String(index));if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;
   const source=descriptor.value,start_date=month+'-'+String(index*15+1).padStart(2,'0'),end_date=month+'-'+String(Math.min(index*15+15,last)).padStart(2,'0');
   if(!exact(source,['run_id','source_revision','start_date','end_date'])||!uuid(source.run_id)||seen.has(source.run_id)||!revision(source.source_revision)||source.start_date!==start_date||source.end_date!==end_date)return null;
   seen.add(source.run_id);sources.push({run_id:source.run_id,source_revision:source.source_revision,start_date,end_date});
  }
  return {publication_revision:value.publication_revision,start_date:value.start_date,end_date:value.end_date,sources};
 }catch{return null;}
}
 const el=name=>document.getElementById('businessEscrowReleases'+name);
 const node=(tag,text,cls)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;if(cls)result.className=cls;return result;};
 const money=value=>{if(!Number.isSafeInteger(value))return 'Não informado';const cents=BigInt(value),absolute=cents<0n?-cents:cents,fraction=String(absolute%100n).padStart(2,'0');const text=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).formatToParts(absolute/100n).map(part=>part.type==='fraction'?fraction:part.value).join('');return (cents<0n?'-':'')+text;};
 const time=value=>Number.isSafeInteger(value)&&value>0?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value*1000)):'Não consultado';
 const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'—';
 let api=null,started=false,month='',scopeKey='',generation=0,pending=null,value=null,orders=null,coverage=null,coveragePending=null,coverageFailed=false,coverageDetails=null;
 const cache=new Map(),attempted=new Map(),coverageAttempted=new Map();
 function validMonth(selected){try{return typeof selected==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)&&selected>='2000-01'&&selected<=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7);}catch{return false;}}
 function showMessage(text,badge='Em conferência'){if(el('Status'))el('Status').textContent=text;if(el('Badge'))el('Badge').textContent=badge;}
 function render(){
  if(!el(''))return;
  const metrics=el('Metrics'),matching=el('Matching'),notice=el('Notice'),orderTarget=el('Orders'),coverageTarget=el('Coverage');metrics.replaceChildren();matching.replaceChildren();notice.hidden=true;notice.textContent='';orderTarget.replaceChildren();orderTarget.hidden=true;coverageTarget.replaceChildren();
  if(!value){metrics.hidden=true;el('Scope').textContent=month?'Mês das liberações: '+month.slice(5)+'/'+month.slice(0,4)+' · Brasília.':'As liberações são consultadas pela data em que a Shopee as informou.';el('Cohort').textContent='O vínculo usa os pedidos pagos do resumo salvo, pela data de criação.';renderCoverage(coverageTarget);return;}
  renderEvidence(value,metrics,matching,notice);renderCoverage(coverageTarget);renderOrders(orderTarget);
 }
 function renderEvidence(observation,metrics,matching,notice){
  // Scope, coverage and monetary completeness are supplied by the shared
  // defensive projector; a partial response never turns unknown values to zero.
  const report=observation.report;
  if(!report){metrics.hidden=true;showMessage('A coleta do servidor preencherá as liberações deste mês.','Aguardando consulta');el('Scope').textContent='Mês das liberações: '+observation.month.slice(5)+'/'+observation.month.slice(0,4)+' · Brasília.';return;}
  renderReport(observation,report,metrics,matching,notice);
 }
 function renderReport(observation,report,metrics,matching,notice){
  const calendar=report.calendar,collection=report.collection,link=report.matching,cohort=observation.cohort;
  const collecting=collection.status==='RUNNING'||collection.status==='RETRY_WAIT',saved=calendar.status==='COMPLETE';
  el('Scope').textContent=calendar.scan_id===null?'Mês das liberações: '+observation.month.slice(5)+'/'+observation.month.slice(0,4)+' · Brasília. Aguardando a consulta.':'Liberações de '+time(calendar.from_at)+' até '+time(calendar.end_before_at-1)+' · Brasília. Fonte consultada de '+time(calendar.source_oldest_at)+' a '+time(calendar.source_latest_at)+'.';
  if(cohort){
   const oldest=cohort.sources.map(source=>source.finance_oldest_at).filter(at=>Number.isSafeInteger(at)&&at>0),latest=cohort.sources.map(source=>source.finance_latest_at).filter(at=>Number.isSafeInteger(at)&&at>0);
   el('Cohort').textContent='Pedidos criados de '+day(cohort.start_date)+' a '+day(cohort.end_date)+' no resumo salvo. Financeiro consultado de '+time(oldest.length?Math.min(...oldest):null)+' a '+time(latest.length?Math.max(...latest):null)+'.';
  }else el('Cohort').textContent='Aguardando o resumo financeiro completo para localizar as liberações dos mesmos pedidos.';
  const progress=collecting?' Nova consulta em andamento: '+collection.windows_complete+' de '+collection.windows_total+' intervalo(s) conferidos.':collection.status==='LIMIT_REACHED'?' A consulta atingiu o limite e continua parcial.':'';
  showMessage((saved?'Mostrando a última consulta completa deste calendário.':calendar.scan_id===null?'A coleta automática preencherá as liberações deste mês.':'Mostrando as liberações já consultadas; o calendário ainda está parcial.')+progress,collection.status==='BLOCKED'?'Fonte indisponível':saved?'Consulta disponível':calendar.scan_id===null?'Aguardando consulta':'Em conferência');
  metrics.hidden=calendar.scan_id===null;if(calendar.scan_id===null)return;
  const metric=(label,amount,help)=>{const card=node('article',undefined,'escrow-releases-metric');card.append(node('small',label),node('strong',amount),node('span',help));metrics.append(card);};
  metric('Pedidos com liberação localizada',String(calendar.unique_orders),saved?'No intervalo de liberação identificado acima.':'Contagem dos registros já consultados; ainda não representa o calendário completo.');
  if(calendar.total_release_cents!==null)metric('Valor liberado conferido',money(calendar.total_release_cents),'Valor compatível com os pedidos em todas as liberações deste corte. Não comprova depósito no banco.');
  else if(calendar.verified_orders>0)metric('Valor conferido de '+calendar.verified_orders+' pedido(s)',money(calendar.known_verified_release_cents),'Valor parcial. As demais liberações permanecem em conferência.');
  else metric('Valor liberado conferido','Em conferência',calendar.unique_orders>0?'Falta conferir os valores com os respectivos pedidos. Nenhum valor ausente foi tratado como zero.':'A conclusão da consulta determina se houve liberações neste calendário.');
  metric('Liberações únicas vinculadas ao resumo',link.paid_orders===null?'Vínculo pendente':link.paid_orders===0?'Nenhum pedido pago':link.located_paid_orders+' de '+link.paid_orders,'O vínculo considera os pedidos pagos do resumo, pela data de criação.');
  const list=node('ul');
  const expected=calendar.status==='COMPLETE'||link.located_paid_orders>0?money(link.expected_located_cents):'Aguardando a localização dos pedidos';
  list.append(node('li','Repasse previsto dos pedidos localizados: '+expected+'. Esse é o repasse previsto dos mesmos pedidos, separado do valor de liberação.'));
  const compatible=link.verified_release_cents!==null?money(link.verified_release_cents):link.verified_paid_orders>0?money(link.known_verified_release_cents)+' — parcial, em '+link.verified_paid_orders+' pedido(s)':'Em conferência';
  list.append(node('li','Liberações com valor compatível: '+compatible+'. Somente pedidos com uma única liberação conferida.'));
  if(link.located_paid_orders>0&&link.comparison_difference_cents!==null)list.append(node('li','Diferença no conjunto comparável: '+money(link.comparison_difference_cents)+'. Comparação dos mesmos pedidos, sem alterar o resultado líquido previsto.'));
  list.append(node('li','Sem liberação localizada neste período: '+(link.unlocated_paid_orders===null?'Vínculo ainda incompleto':link.unlocated_paid_orders+' pedido(s)')+'. Isso não comprova ausência de recebimento fora deste intervalo.'));
  list.append(node('li','Fora do conjunto de pedidos pagos deste resumo: '+(link.outside_cohort_orders===null?'Vínculo ainda incompleto':link.outside_cohort_orders+' pedido(s)')+'.'));
  if(link.ambiguous_paid_orders>0)list.append(node('li',link.ambiguous_paid_orders+' pedido(s) do resumo com mais de uma ocorrência de liberação aguardam conferência.'));
  matching.append(list);
  const notes=[];
  if(calendar.ambiguous_orders>0)notes.push(calendar.ambiguous_orders+' pedido(s) têm mais de uma ocorrência de liberação. O total permanece em conferência para evitar somas repetidas.');
  if(calendar.unverified_orders>0)notes.push('Os valores de '+calendar.unverified_orders+' pedido(s) ainda não foram confirmados com a evidência financeira correspondente.');
  if(link.status==='SOURCE_MISSING')notes.push('Falta recuperar parte da evidência dos pedidos do resumo para concluir o vínculo.');
  if(observation.attempt?.status==='UNAVAILABLE'||report.pending.includes('RELEASE_SOURCE_UNAVAILABLE')||collection.status==='BLOCKED'||collection.status==='RETRY_WAIT')notes.push('Parte da fonte não pôde ser consultada. Os valores salvos mantêm suas datas originais e o servidor retomará a conferência.');
  if(notes.length){notice.hidden=false;notice.textContent=notes.join(' ');}
 }
 function currentMonth(){try{return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7);}catch{return '';}}
 function coveragePresentation(){
  let scope=null;try{scope=JSON.parse(scopeKey);}catch{}
  return projectMlsReleaseCoverageFollowup(coverage,{month,scope,currentMonth:currentMonth(),cohortSources:value?.cohort?.sources??null,checkedAt:Math.floor(Date.now()/1000)},projectBusinessEscrowReleaseCoverage,projectEscrowReleaseCoverageFrame);
 }
 function renderCoverage(target){
  const head=node('div',undefined,'escrow-release-coverage-head');head.append(node('h4','Acompanhamento automático dos repasses'));
  if(month&&month<currentMonth()){
   const refresh=node('button','Conferir acompanhamento');refresh.type='button';refresh.disabled=coveragePending!==null||!value?.cohort||!scopeKey;refresh.onclick=()=>loadCoverage({force:true});head.append(refresh);
  }
  target.append(head);
  if(!month){target.append(node('p','Selecione um mês para acompanhar os mesmos pedidos pagos nos calendários posteriores.'));return;}
  const followup=coveragePresentation();target.dataset.state=followup.state;
  if(followup.state==='CURRENT_MONTH'){target.append(node('p','Este ainda é o mês corrente. O acompanhamento dos repasses em meses posteriores começa após a virada do mês; a conferência acima continua usando o corte atual.'));return;}
  const attempt=followup.attempt;
  if(coveragePending)target.append(node('p','Conferindo o acompanhamento já salvo pelo servidor…'));
  if(!followup.coverage){
   const message=followup.reason==='PUBLICATION_MISMATCH'?'A publicação dos pedidos mudou. Aguardando o acompanhamento automático conferir exatamente este recorte.':followup.reason==='SOURCE_UNAVAILABLE'?'O acompanhamento ainda não pôde ser atualizado. O servidor tentará novamente no horário agendado.':'Aguardando a rotina automática cruzar estes pedidos com os calendários de liberação salvos dos meses seguintes.';
   target.append(node('p',message));
  }else{
   const summary=followup.coverage,grid=node('div',undefined,'escrow-release-coverage-grid'),cell=(label,value)=>{const box=node('div');box.append(node('small',label),node('strong',value));grid.append(box);};
   target.append(node('p','Pedidos criados de '+day(followup.period.start_date)+' a '+day(followup.period.end_date)+'. Último cruzamento salvo: '+time(followup.checked_at)+'.'));
   if(followup.state==='HISTORICAL')target.append(node('p','Este é um corte histórico até '+followup.through_month.slice(5)+'/'+followup.through_month.slice(0,4)+'. O calendário de '+currentMonth().slice(5)+'/'+currentMonth().slice(0,4)+' ainda precisa entrar no acompanhamento.'));
   else if(followup.state==='RETRY_WAIT')target.append(node('p','Mostrando o último cruzamento válido. A tentativa mais recente não pôde atualizar a fonte; as datas originais foram preservadas.'));
   cell('Calendários conferidos',summary.calendars_complete+' de '+summary.calendars_total);cell('Pedidos localizados',summary.paid_orders===null?String(summary.located_orders)+' conhecidos':summary.located_orders+' de '+summary.paid_orders);cell('Ainda não localizados',summary.not_located_orders===null?'Coorte incompleta':String(summary.not_located_orders));cell('Identidade ambígua',String(summary.ambiguous_orders));target.append(grid);
   const through=followup.through_month.slice(5)+'/'+followup.through_month.slice(0,4);
   target.append(node('p',summary.identity_complete_at_cutoff?'No corte salvo até '+through+', todos os pedidos pagos conhecidos aparecem exatamente uma vez. Isso confirma somente a identidade nesse recorte; o ciclo de liberação e o recebimento bancário continuam em conferência.':'A cobertura do corte salvo até '+through+' ainda está incompleta. Um pedido sem ocorrência significa apenas que não apareceu nos calendários salvos acompanhados.'));
   const list=node('ul',undefined,'escrow-release-calendar-list'),labels={COMPLETE:'conferido no corte salvo',PARTIAL:'consulta parcial',MISSING:'calendário ainda sem snapshot completo'};
   for(const item of followup.calendars)list.append(node('li',item.month.slice(5)+'/'+item.month.slice(0,4)+' · '+labels[item.status]+(item.cohort_observations?' · '+item.cohort_observations+' ocorrência(s) dos pedidos acompanhados':'')));
   target.append(list);
  }
  if(attempt)target.append(node('p','Última tentativa automática: '+time(attempt.checked_at)+' · '+(attempt.status==='SUCCESS'?'cruzamento salvo':'fonte indisponível')+'. Próxima conferência programada: '+time(attempt.next_attempt_at)+'. O horário é uma previsão; a fila respeita pausas e tarefas em andamento.','escrow-release-coverage-attempt'));
  if(coverageFailed)target.append(node('p','Não foi possível conferir o acompanhamento salvo agora. Use Conferir acompanhamento para tentar novamente; as datas e evidências anteriores foram preservadas.'));
  target.append(node('p','A rotina funciona em segundo plano. Abrir esta seção apenas lê os registros salvos. Valores a receber, valores não informados e lucro realizado não são deduzidos dessas contagens.'));
 }
 function loadCoverage({force=false}={}){
  if(!started||!month||month>=currentMonth()||!value?.cohort||!scopeKey||document.hidden||!el('Details')?.open)return Promise.resolve(false);
  const selected=month,selectedScopeKey=scopeKey,selectedThrough=currentMonth(),key=selected+'|'+selectedScopeKey+'|'+selectedThrough;
  if(coveragePending?.key===key)return coveragePending.task;
  const stamp=Date.now(),last=coverageAttempted.get(key);if(!force&&last!==undefined&&stamp>=last&&stamp-last<60000)return Promise.resolve(coverage!==null);
  coverageAttempted.set(key,stamp);while(coverageAttempted.size>12)coverageAttempted.delete(coverageAttempted.keys().next().value);
  const token=generation,current=()=>started&&generation===token&&month===selected&&scopeKey===selectedScopeKey&&currentMonth()===selectedThrough;
  const task=(async()=>{
   await Promise.resolve();
   try{
    const raw=await api('finance/escrow-release-coverage?month='+encodeURIComponent(selected));if(!current())return false;
    const checked=projectBusinessEscrowReleaseCoverage(raw,projectEscrowReleaseCoverageFrame);if(!checked||checked.cohort_month!==selected)throw Error('INVALID_COVERAGE');
    coverage=checked;coverageFailed=false;const saved=cache.get(selected);if(saved?.scopeKey===selectedScopeKey)saved.coverage=coverage;render();return coveragePresentation().scope_compatible;
   }catch{if(current()){coverageFailed=true;render();}return false;}
   finally{if(coveragePending?.task===task){coveragePending=null;if(started)render();}}
  })();
  coveragePending={key,task};render();return task;
 }
 function reconciliationIndex(){
  let snapshot=null;try{snapshot=globalThis.brazaReconciliation?.getSnapshot?.()??null;}catch{}if(!snapshot||snapshot.month!==month||snapshot.scope_key!==scopeKey)return null;
  const cases=[],payouts=new Map();for(const report of snapshot.report?.reports??[])for(const item of report.cases??[])cases.push(item);
  for(const row of snapshot.money??[])for(const payout of row.money?.payouts??[])payouts.set(payout.order_hash,payout);
  return {cases,payouts,truncated:(snapshot.report?.reports??[]).some(report=>report.truncation?.truncated)};
 }
 function renderOrders(target){
  if(!orders)return;target.hidden=false;const s=orders.summary,reconciliation=reconciliationIndex();
  target.append(node('h4','Conciliação por pedido'),node('p','Cada referência abaixo usa apenas o hash interno do pedido. “Sem liberação localizada” significa somente que o pedido não apareceu neste calendário de liberações até o corte consultado; não significa falta de pagamento nem saldo ainda a receber.'));
  const summary=node('div',undefined,'escrow-order-summary'),metric=(label,value,help)=>{const card=node('article');card.append(node('small',label),node('strong',value),node('span',help));summary.append(card);};
  metric('Pedidos pagos conhecidos',String(s.known_paid_orders),'Na coorte financeira disponível.');
  metric('Liberação conferida',String(s.verified_orders),'Uma ocorrência com valor compatível.');
  metric('Sem liberação localizada',String(s.not_located_orders),'Apenas neste calendário consultado.');
  metric('Repasse após ajustes sem liberação localizada',s.not_located_after_adjustment_known_orders?money(s.known_not_located_after_adjustment_cents):'Não informado',s.not_located_after_adjustment_known_orders+' de '+s.not_located_orders+' pedido(s) com valor após ajuste conhecido. Não é “valor a receber”.');
  target.append(summary);
  const list=node('div',undefined,'escrow-order-list'),labels={VERIFIED:'Liberação conferida',LOCATED_UNVERIFIED:'Liberação localizada · valor em conferência',AMBIGUOUS:'Mais de uma ocorrência de liberação',NOT_LOCATED:'Sem liberação localizada neste calendário'};
  for(const row of orders.rows){
   const card=node('article',undefined,'escrow-order-card');card.dataset.state=row.state;const head=node('div',undefined,'escrow-order-head'),ref='Pedido interno '+row.order_hash.slice(0,10)+'…';head.append(node('strong',ref),node('span',labels[row.state]||row.state));card.append(head);
   const values=node('div',undefined,'escrow-order-values'),cell=(label,value,help)=>{const box=node('div');box.append(node('small',label),node('b',value),node('span',help));values.append(box);};
   cell('Repasse-base',money(row.base_repass_cents),'Evidência financeira do pedido.');
   cell('Ajuste informado',row.adjustment_cents===null?'Não informado':(row.adjustment_cents>0?'+':'')+money(row.adjustment_cents),'Sem atribuir o ajuste a uma devolução específica.');
   cell('Repasse após ajuste',money(row.after_adjustment_repass_cents),'Somente quando base + ajuste = após ajuste.');
   cell('Valor liberado conferido',money(row.release_cents),row.release_time===null?'Sem data de liberação única.':'Liberação informada em '+time(row.release_time)+'.');
   card.append(values);
   if(row.difference_from_base_cents!==null&&row.difference_from_base_cents!==0)card.append(node('div','Diferença entre a liberação conferida e o repasse-base: '+(row.difference_from_base_cents>0?'+':'')+money(row.difference_from_base_cents)+'. Quando o valor coincide com o repasse após ajustes, essa diferença já está incorporada e não deve ser descontada novamente.','escrow-order-warning'));
   const related=(reconciliation?.cases??[]).filter(item=>item.order_hash===row.order_hash),payout=reconciliation?.payouts.get(row.order_hash);
   if(related.length){
    const statuses=[...new Set(related.map(item=>item.status))].join(', '),known=related.filter(item=>Number.isSafeInteger(item.requested_refund_cents)),sum=known.reduce((total,item)=>total+item.requested_refund_cents,0);
    card.append(node('p','Devolução/reembolso na evidência salva: '+statuses+'. '+(known.length?known.length+' de '+related.length+' valor(es) informado(s), subtotal '+money(sum)+'.':'Valor de reembolso não informado neste recorte.')+(payout?.after_adjustment_repass_cents!==null&&Number.isSafeInteger(payout?.after_adjustment_repass_cents)?' Repasse após ajuste na conferência de devoluções: '+money(payout.after_adjustment_repass_cents)+'.':''),'escrow-order-return'));
   }else if(reconciliation)card.append(node('p',reconciliation.truncated?'Nenhuma solicitação de devolução aparece nas linhas visíveis deste recorte; a lista de casos está truncada.':'Nenhuma solicitação de devolução aparece nas evidências consultadas para este pedido.','escrow-order-return'));
   list.append(card);
  }
  target.append(list);
  if(orders.truncation.truncated)target.append(node('p','Mostrando '+orders.truncation.orders_included+' de '+orders.truncation.orders_total+' pedido(s). O resumo acima considera a coorte conhecida completa; a lista prioriza ajustes e divergências.','escrow-order-warning'));
  target.append(node('p','O valor ainda a liberar permanece indisponível como saldo financeiro geral: pedidos podem ser liberados fora deste calendário e liberação na Shopee não comprova crédito bancário.','escrow-order-warning'));
 }
 function observe(selected,selectedScope=null){
  if(!started||!validMonth(selected))return Promise.resolve(false);
  const projectedScope=projectBusinessMonthAuditScope(selectedScope),scope=projectedScope?.start_date===selected+'-01'?projectedScope:null,selectedScopeKey=scope===null?'':JSON.stringify(scope);
  const changedMonth=selected!==month,changedScope=selectedScopeKey!==scopeKey;
  if(changedMonth||changedScope){
   generation++;month=selected;scopeKey=selectedScopeKey;pending=null;coveragePending=null;coverageFailed=false;
   const saved=cache.get(selected),reuse=changedMonth&&saved?.scopeKey===selectedScopeKey;
   value=reuse?saved.value:null;orders=reuse?saved.orders:null;coverage=reuse?saved.coverage:null;
   if(!reuse){cache.delete(selected);attempted.delete(selected);}
   render();showMessage(value?'Mostrando as últimas liberações salvas deste mês.':'Conferindo as liberações salvas deste mês…');
  }
  if(scope===null){value=null;orders=null;coverage=null;render();showMessage('Aguardando um resumo publicado para conferir os mesmos pedidos.','Aguardando resumo');return Promise.resolve(false);}
  if(document.hidden)return Promise.resolve(false);
  if(pending?.month===selected&&pending.scopeKey===selectedScopeKey)return pending.task;
  const stamp=Date.now(),last=attempted.get(selected);if(last?.scopeKey===selectedScopeKey&&stamp>=last.at&&stamp-last.at<60000){if(value?.cohort&&el('Details')?.open){const selectedGeneration=generation;return loadCoverage().then(()=>started&&generation===selectedGeneration&&month===selected&&scopeKey===selectedScopeKey&&value!==null);}return Promise.resolve(value!==null);}
  attempted.set(selected,{scopeKey:selectedScopeKey,at:stamp});while(attempted.size>12){const first=attempted.keys().next().value;attempted.delete(first);cache.delete(first);}const token=generation,current=()=>started&&generation===token&&month===selected&&scopeKey===selectedScopeKey;
  const task=(async()=>{
   await Promise.resolve();
   try{const raw=await api('finance/escrow-releases?month='+encodeURIComponent(selected)+'&evidence=orders-v1'),evidence=projectBusinessEscrowReleaseEvidence(raw,{projectBusiness:projectBusinessEscrowReleases,projectFrame:projectEscrowReleaseFrame,projectEvidenceFrame:projectEscrowReleaseEvidenceFrame}),checked=evidence?.report??projectBusinessEscrowReleases(raw,projectEscrowReleaseFrame);if(!current())return false;if(!checked||checked.month!==selected)throw Error('INVALID_RECONCILIATION');const receivedScope=projectBusinessMonthAuditScope(checked.cohort===null?null:{publication_revision:checked.cohort.publication_revision,start_date:checked.cohort.start_date,end_date:checked.cohort.end_date,sources:checked.cohort.sources.map(({run_id,source_revision,start_date,end_date})=>({run_id,source_revision,start_date,end_date}))});if(receivedScope===null||JSON.stringify(receivedScope)!==selectedScopeKey)throw Error('RECONCILIATION_SCOPE_MISMATCH');value=checked;orders=evidence?.orders??null;if(selected<currentMonth()&&el('Details')?.open)await loadCoverage();if(!current())return false;cache.set(selected,{scopeKey:selectedScopeKey,value:checked,orders,coverage});while(cache.size>12){const first=cache.keys().next().value;cache.delete(first);attempted.delete(first);}render();try{globalThis.mlsAgentRegistry?.refresh?.();}catch{}return true;}
   catch{if(current())showMessage(value?'Não foi possível atualizar as liberações agora. Os valores conferidos e suas datas foram preservados.':'As liberações ainda não puderam ser carregadas. A coleta do servidor continua e tentaremos novamente.','Em conferência');return false;}
   finally{if(current()&&pending?.task===task)pending=null;}
  })();
  pending={month:selected,scopeKey:selectedScopeKey,task};return task;
 }
 function snapshot(){return started&&value?{schema:'mls_escrow_releases_snapshot_v1',month,scope_key:scopeKey,report:value,orders,coverage:coveragePresentation().scope_compatible?coverage:null}:null;}
 function onCoverageToggle(){if(coverageDetails?.open)void loadCoverage();}
 function start(options){if(!el('')||typeof options?.api!=='function')return false;if(started&&api===options.api)return true;generation++;api=options.api;started=true;month='';scopeKey='';pending=null;value=null;orders=null;coverage=null;coveragePending=null;coverageFailed=false;cache.clear();attempted.clear();coverageAttempted.clear();
  // This module is embedded alongside other financial panels. Bind only after
  // its own DOM exists, and keep one stable handler across stop/start cycles.
  const details=el('Details');if(details!==coverageDetails){
   if(typeof coverageDetails?.removeEventListener==='function')coverageDetails.removeEventListener('toggle',onCoverageToggle);
   coverageDetails=details;if(typeof details?.addEventListener==='function')details.addEventListener('toggle',onCoverageToggle);
  }
  render();showMessage('Aguardando a consulta salva do mês.');return true;}
 function stop(){started=false;generation++;api=null;pending=null;orders=null;coverage=null;coveragePending=null;coverageFailed=false;coverageAttempted.clear();}
 globalThis.brazaEscrowReleases={start,observe,stop,getSnapshot:snapshot,refreshJoin:render,refreshCoverage:()=>loadCoverage({force:true})};
})();
