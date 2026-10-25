// Presentation arithmetic over an already validated monthly frame. It never
// changes the strict financial result or claims that cash has been reconciled.
// Keep every helper local: this function is embedded in the owner page.
export function buildMonthlyFinancialSummary(frame){
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
  if(status!=='COMPLETE'||!plain(orders)||read(orders,'payment_missing')!==0||['SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','ARITHMETIC_UNSAFE'].some(code=>pending.includes(code))||read(collection,'state')==='BLOCKED')return output;
  if(['cancel_pending','other','unknown'].some(key=>!int(read(orders,key))||read(orders,key)!==0))return output;
  const payout=read(frame,'expected_repass_cents'),sales=read(frame,'sales_cents'),tax=read(frame,'invoice_tax_cents'),ads=read(frame,'ads'),expenses=read(frame,'expenses'),adjustment=read(frame,'ads_adjustment_cents'),treatment=read(expenses,'recharge_treatment'),external=read(expenses,'external_expenses_cents'),spend=read(ads,'expense_cents');
  if(!int(payout,true)||!int(sales)||!int(tax)||!int(knownProduction)||read(ads,'status')!=='AVAILABLE'||!int(spend)||read(ads,'start_date')!==read(frame,'start_date')||read(ads,'end_date')!==read(frame,'end_date')||!int(external)||!int(adjustment)||!['UNCONFIRMED','ADS_RECHARGE','TECH_SUPPORT'].includes(treatment)||adjustment>0&&treatment==='UNCONFIRMED')return output;
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
