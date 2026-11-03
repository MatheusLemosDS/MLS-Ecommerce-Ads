// Read-only evidence from the canonical saved month. This is a contribution
// against current sales-cost references, never realized profit or reusable stock.
export function buildMlsProductFinancialEvidence(frame,projectMonth){
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
