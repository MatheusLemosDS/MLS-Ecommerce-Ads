// Product contribution uses only orders containing one product. Money from a
// mixed-product order remains in a separate bucket; its production quantities
// can still receive the same current cost reference as the monthly summary.
export function projectBusinessMonthProducts(value,frame){
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
  if(!plain(frame)||!frameKeys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(frame,key)||{},'value'))||frame.status!=='COMPLETE'||!exact(frame.progress,['windows_total','windows_complete','pages_read'])||!int(frame.progress.windows_total,1,3)||frame.progress.windows_complete!==frame.progress.windows_total||!exact(frame.coverage,coverageKeys)||!coverageKeys.every(key=>int(frame.coverage[key],0,3000))||!plain(frame.result)||!Object.hasOwn(Object.getOwnPropertyDescriptor(frame.result,'pending')||{},'value')||!array(frame.result.pending,15)||!array(frame.unmapped_variants,3000))return null;
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
   if(!exact(row,rowKeys)||!id(row.item_id)||seen.has(row.item_id)||!int(row.quantity,1)||!counts.every(key=>int(row[key],0,3000))||row.orders!==row.exclusive_orders+row.mixed_orders||row.orders===0||row.exclusive_payment_covered+row.exclusive_payment_missing!==row.exclusive_orders||row.exclusive_returns>row.exclusive_payment_covered||row.exclusive_returns_unknown<row.exclusive_payment_missing||row.exclusive_returns+row.exclusive_returns_unknown>row.exclusive_orders||row.mixed_orders>value.mixed_orders||!array(row.variants,3000)||!row.variants.length||!array(row.pending,codes.length)||new Set(row.pending).size!==row.pending.length||!row.pending.every(code=>codes.includes(code)))return null;
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
   if(row.exclusive_after_costs_cents!==after||row.exclusive_margin_bps!==margin||row.pending.length!==expectedPending.length||!expectedPending.every(code=>row.pending.includes(code)))return null;
   variants.sort((a,b)=>sorted(a.model_id,b.model_id));products.push(Object.fromEntries(rowKeys.map(key=>[key,key==='variants'?variants:key==='pending'?[...expectedPending]:row[key]])));
   exclusiveOrders+=row.exclusive_orders;covered+=row.exclusive_payment_covered;missing+=row.exclusive_payment_missing;returns+=row.exclusive_returns;unknownReturns+=row.exclusive_returns_unknown;mixedReferences+=row.mixed_orders;allKnownCost+=knownCost;allCompleteCost&&=costReady;
  }
  const mixedCovered=frame.coverage.payment_covered-covered,mixedMissing=frame.coverage.payment_missing-missing,mixedReturns=frame.coverage.returns-returns,mixedUnknownReturns=frame.coverage.returns_unknown-unknownReturns;
  if(exclusiveOrders+value.mixed_orders!==frame.coverage.paid||mixedCovered<0||mixedMissing<0||mixedCovered+mixedMissing!==value.mixed_orders||mixedReturns<0||mixedReturns>mixedCovered||mixedUnknownReturns<mixedMissing||mixedReturns+mixedUnknownReturns>value.mixed_orders||(value.mixed_orders===0?mixedReferences!==0:mixedReferences<value.mixed_orders*2||mixedReferences>value.mixed_orders*products.length)||seenUnmapped.size!==unmapped.size)return null;
  if(mixedCovered===0&&moneyNames.some(name=>value['known_mixed_'+name+'_cents']!==0)||!taxValid(value.known_mixed_sales_cents,value.known_mixed_tax_cents,mixedCovered))return null;
  if(totals[0]!==BigInt(frame.known_sales_cents)||totals[1]!==BigInt(frame.known_expected_repass_cents)||totals[2]!==(mei?0n:BigInt(frame.known_invoice_tax_cents))||frame.ads_adjustment_cents!==null&&totals[3]!==BigInt(frame.ads_adjustment_cents)||allKnownCost!==BigInt(frame.known_production_cost_cents)||frame.production_cost_cents!==(allCompleteCost?frame.known_production_cost_cents:null))return null;
  products.sort((a,b)=>sorted(a.item_id,b.item_id));return Object.fromEntries(keys.map(key=>[key,key==='products'?products:value[key]]));
 }catch{return null;}
}

export function buildBusinessMonthProducts(frames,monthFrame,variantReferences,bindings){
 const safe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
 const rawCents=value=>{const match=typeof value==='string'&&/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value);if(!match)return null;const amount=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));return match[1]?-amount:amount;};
 const names=['sales','repass','tax','ads_adjustment'],rawNames=['sales_base','expected_repass','invoice_tax','ads_adjustment'];
 try{
  if(monthFrame?.status!=='COMPLETE'||!Array.isArray(frames)||frames.length!==monthFrame.progress.windows_total||frames.some(frame=>frame.status!=='COMPLETE'||!frame.product_breakdown)||!Array.isArray(variantReferences)||!Array.isArray(bindings?.bindings)||bindings.revision!==monthFrame.bindings_revision)return null;
  const taxDescriptor=Object.getOwnPropertyDescriptor(monthFrame,'tax'),mei=taxDescriptor!==undefined;
  if(mei&&(!Object.hasOwn(taxDescriptor,'value')||Object.getOwnPropertyDescriptor(taxDescriptor.value||{},'regime')?.value!=='MEI'))return null;
  const references=new Map(variantReferences.map(row=>[row.item_id+':'+row.model_id,row]));if(references.size!==variantReferences.length)return null;
  const mapped=new Map(bindings.bindings.map(row=>[row.item_id+':'+row.model_id,row])),rows=new Map(),mixed=names.map(()=>0n);let mixedOrders=0;
  for(const frame of frames){
   const breakdown=frame.product_breakdown;mixedOrders+=breakdown.mixed_orders;
   for(let index=0;index<names.length;index++){const amount=rawCents(breakdown['known_mixed_'+rawNames[index]+'_raw']);if(amount===null)return null;mixed[index]+=mei&&names[index]==='tax'?0n:amount;}
   for(const row of breakdown.products){
    let current=rows.get(row.item_id);
    if(!current){current={item_id:row.item_id,quantity:0,orders:0,exclusive_orders:0,mixed_orders:0,exclusive_payment_covered:0,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,money:names.map(()=>0n),items:new Map()};rows.set(row.item_id,current);}
    for(const key of ['quantity','orders','exclusive_orders','mixed_orders','exclusive_payment_covered','exclusive_payment_missing','exclusive_returns','exclusive_returns_unknown']){current[key]+=row[key];if(!Number.isSafeInteger(current[key]))return null;}
    for(let index=0;index<names.length;index++){const amount=rawCents(row['known_exclusive_'+rawNames[index]+'_raw']);if(amount===null)return null;current.money[index]+=mei&&names[index]==='tax'?0n:amount;}
    for(const item of row.items){const old=current.items.get(item.model_id)||{model_id:item.model_id,exclusive_quantity:0,mixed_quantity:0};old.exclusive_quantity+=item.exclusive_quantity;old.mixed_quantity+=item.mixed_quantity;if(!Number.isSafeInteger(old.exclusive_quantity)||!Number.isSafeInteger(old.mixed_quantity))return null;current.items.set(item.model_id,old);}
   }
  }
  const result={schema:'business_month_products_v1',mixed_orders:mixedOrders,known_mixed_sales_cents:safe(mixed[0]),known_mixed_repass_cents:safe(mixed[1]),known_mixed_tax_cents:safe(mixed[2]),known_mixed_ads_adjustment_cents:safe(mixed[3]),products:[]};
  // MEI DAS belongs to the month, including months with no sales. It must not
  // inherit the importer’s old per-order estimate or be allocated to products.
  if(mei)result.tax_treatment='MONTHLY_DAS_NOT_ALLOCATED';
  for(const row of rows.values()){
   const out=Object.fromEntries(['item_id','quantity','orders','exclusive_orders','mixed_orders','exclusive_payment_covered','exclusive_payment_missing','exclusive_returns','exclusive_returns_unknown'].map(key=>[key,row[key]]));
   for(let index=0;index<names.length;index++){const amount=safe(row.money[index]);if(amount===null)return null;out['known_exclusive_'+names[index]+'_cents']=amount;out['exclusive_'+names[index]+'_cents']=row.exclusive_payment_missing?null:amount;}
   let known=0n,exclusive=0n,ready=true,exclusiveReady=true;out.variants=[];
   for(const item of row.items.values()){
    const key=row.item_id+':'+item.model_id,quantity=item.exclusive_quantity+item.mixed_quantity,reference=references.get(key),binding=mapped.get(key);
    if(!reference||reference.quantity!==quantity||!Number.isSafeInteger(quantity))return null;
    const custom=reference.cost_source==='CUSTOM_PROFILE';
    const unit=reference.unit_cost_cents,total=unit===null?null:safe(BigInt(unit)*BigInt(quantity)),exclusiveTotal=item.exclusive_quantity===0?0:unit===null?null:safe(BigInt(unit)*BigInt(item.exclusive_quantity));
    if(unit!==null&&(total===null||exclusiveTotal===null)||total!==reference.production_cost_cents||unit!==null&&!binding&&!custom||custom&&unit===null)return null;
    if(total===null)ready=false;else known+=BigInt(total);if(exclusiveTotal===null)exclusiveReady=false;else exclusive+=BigInt(exclusiveTotal);
    const single=binding?.selling_unit==='SINGLE_GARMENT';
    out.variants.push({...item,quantity,unit_cost_cents:unit,production_cost_cents:total,exclusive_production_cost_cents:exclusiveTotal,selling_unit:unit===null?null:custom?'CUSTOM_PRODUCT':single?'SINGLE_GARMENT':'ONE_MALE_ONE_FEMALE_KIT',size:unit!==null&&!custom&&single?binding.size:null,male_size:unit!==null&&!custom&&!single?binding.male_size:null,female_size:unit!==null&&!custom&&!single?binding.female_size:null,...(custom?{cost_profile_id:reference.cost_profile_id,cost_profile_label:reference.cost_profile_label}:{})});
   }
   const knownCost=safe(known),exclusiveCost=safe(exclusive);if(knownCost===null||exclusiveCost===null)return null;
   out.known_production_cost_cents=knownCost;out.production_cost_cents=ready?knownCost:null;out.known_exclusive_production_cost_cents=exclusiveCost;out.exclusive_production_cost_cents=exclusiveReady?exclusiveCost:null;
   out.pending=[];
   if(row.exclusive_payment_missing)out.pending.push('PAYMENT_INCOMPLETE');if(!exclusiveReady)out.pending.push('PRODUCTION_COST_INCOMPLETE');if(row.exclusive_returns+row.exclusive_returns_unknown)out.pending.push('RETURNS_NOT_RECONCILED');if(monthFrame.coverage.cancel_pending+monthFrame.coverage.other+monthFrame.coverage.unknown)out.pending.push('STATUS_REVIEW_REQUIRED');if(monthFrame.result.pending.includes('SOURCE_UNAVAILABLE')||monthFrame.result.pending.includes('FINANCIAL_SOURCE_STALE'))out.pending.push('SOURCE_UNAVAILABLE');if(!row.exclusive_orders)out.pending.push('NO_EXCLUSIVE_ORDERS');
   let after=null,margin=null;
   if(!out.pending.length){after=safe(BigInt(out.exclusive_repass_cents)-exclusive-BigInt(out.exclusive_tax_cents));if(after!==null&&out.exclusive_sales_cents>0)margin=safe(BigInt(after)*10000n/BigInt(out.exclusive_sales_cents));if(after===null||out.exclusive_sales_cents>0&&margin===null){after=null;margin=null;out.pending.push('ARITHMETIC_UNSAFE');}}
   out.exclusive_after_costs_cents=after;out.exclusive_margin_bps=margin;result.products.push(out);
  }
  if(references.size!==result.products.reduce((count,row)=>count+row.variants.length,0))return null;
  return projectBusinessMonthProducts(result,monthFrame);
 }catch{return null;}
}
