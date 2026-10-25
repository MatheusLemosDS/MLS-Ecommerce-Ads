// Private aggregate contract for every order created in a bounded period.
// Paid and completed orders share a creation-time cohort. Payment gaps remain
// explicit, so a completed import never implies complete financial coverage.
export function projectBusinessPeriodRequest(value) {
 try {
  const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
  const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
  const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
  const run=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
  if(!plain(value))return null;
  const operation=Object.getOwnPropertyDescriptor(value,'operation')?.value;
  if(operation==='start'){
   if(!exact(value,['operation','start_date','end_date'])||!day(value.start_date)||!day(value.end_date))return null;
   const days=(Date.parse(value.end_date+'T00:00:00Z')-Date.parse(value.start_date+'T00:00:00Z'))/86400000+1;
   return days>=1&&days<=15?{operation,start_date:value.start_date,end_date:value.end_date}:null;
  }
  if(!['read','step'].includes(operation)||!exact(value,['operation','run_id'])||!run(value.run_id))return null;
  return {operation,run_id:value.run_id};
 }catch{return null;}
}

// Keep every helper inside this function: the browser embeds .toString() and
// rechecks the same source contract without access to a module-level closure.
export function projectBusinessPeriodFrame(value) {
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'));
 const integer=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const id=(item,zero=false)=>typeof item==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(item);
 const run=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
 const cents=raw=>{
  if(typeof raw!=='string'||raw.length>32)return null;
  const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(raw);
  if(!match||match[3]?.endsWith('0'))return null;
  let amount=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));
  if(match[1]){if(amount===0n)return null;amount=-amount;}
  return amount< -100000000000000000n||amount>100000000000000000n?null:amount;
 };
 const order=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
 const keys=['schema','run_id','revision','status','start_date','end_date','cutoff_at','checked_at','currency','monetary_unit','pages_read','duplicate_orders','coverage','known_sales_base_raw','sales_base_raw','known_expected_repass_raw','expected_repass_raw','known_ads_adjustment_raw','ads_adjustment_raw','invoice_tax','items','diagnostic','basis'];
 const coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
 const invoiceKeys=['schema','rate_bps','basis','rounding','covered_orders','unavailable_orders','known_base_raw','known_tax_raw'];
 // The sidecar describes the collected paid population. Mixed-product money
 // stays in one unallocated bucket; only quantities are associated to products.
 function productBreakdown(source,coverage,items){
  const names=['schema','mixed_orders','mixed_payment_covered','mixed_payment_missing','known_mixed_sales_base_raw','known_mixed_expected_repass_raw','known_mixed_ads_adjustment_raw','known_mixed_invoice_tax_raw','products'];
  const productNames=['item_id','quantity','orders','exclusive_orders','mixed_orders','exclusive_payment_covered','exclusive_payment_missing','exclusive_returns','exclusive_returns_unknown','known_exclusive_sales_base_raw','exclusive_sales_base_raw','known_exclusive_expected_repass_raw','exclusive_expected_repass_raw','known_exclusive_ads_adjustment_raw','exclusive_ads_adjustment_raw','known_exclusive_invoice_tax_raw','exclusive_invoice_tax_raw','items'];
  const amounts=['sales_base','expected_repass','ads_adjustment','invoice_tax'];
  const validTax=(base,tax,count)=>{
   const n=BigInt(count),difference=tax*10000n-base*200n;
   return base>=0n&&tax>=0n&&base<=n*100000000000000n&&(count!==0||tax===0n)&&tax<=base/25n&&difference>=-4999n*n&&difference<=5000n*n;
  };
  const boundedMoney=(money,count)=>money.every(amount=>amount!==null&&amount>=-BigInt(count)*100000000000000n&&amount<=BigInt(count)*100000000000000n);
  if(!exact(source,names)||source.schema!=='business_product_breakdown_v1'||!array(source.products,1000)||!['mixed_orders','mixed_payment_covered','mixed_payment_missing'].every(key=>integer(source[key],0,1000))||source.mixed_payment_covered+source.mixed_payment_missing!==source.mixed_orders)return null;
  const totals=amounts.map(name=>cents(source['known_mixed_'+name+'_raw']));
  if(!boundedMoney(totals,source.mixed_payment_covered)||!validTax(totals[0],totals[3],source.mixed_payment_covered))return null;
  const variants=new Map(items.map(row=>[row.item_id+':'+row.model_id,row.quantity])),productIds=new Set(items.map(row=>row.item_id)),seenProducts=new Set(),seenVariants=new Set(),products=[];
  let exclusiveOrders=0,covered=0,missing=0,returns=0,unknownReturns=0,mixedReferences=0;
  for(const product of source.products){
   if(!exact(product,productNames)||!id(product.item_id)||!productIds.has(product.item_id)||seenProducts.has(product.item_id)||!integer(product.quantity,1)||!['orders','exclusive_orders','mixed_orders','exclusive_payment_covered','exclusive_payment_missing','exclusive_returns','exclusive_returns_unknown'].every(key=>integer(product[key],0,1000))||product.orders!==product.exclusive_orders+product.mixed_orders||product.orders===0||product.exclusive_payment_covered+product.exclusive_payment_missing!==product.exclusive_orders||product.exclusive_returns>product.exclusive_payment_covered||product.exclusive_returns_unknown<product.exclusive_payment_missing||product.exclusive_returns+product.exclusive_returns_unknown>product.exclusive_orders||product.mixed_orders>source.mixed_orders||!array(product.items,1000)||product.items.length===0)return null;
   seenProducts.add(product.item_id);
   const money=amounts.map(name=>cents(product['known_exclusive_'+name+'_raw']));
   if(!boundedMoney(money,product.exclusive_payment_covered)||!validTax(money[0],money[3],product.exclusive_payment_covered))return null;
   for(let index=0;index<amounts.length;index++){
    if(product['exclusive_'+amounts[index]+'_raw']!==(product.exclusive_payment_missing?null:product['known_exclusive_'+amounts[index]+'_raw']))return null;
    totals[index]+=money[index];
   }
   const projectedItems=[];let exclusiveQuantity=0n,mixedQuantity=0n;
   for(const row of product.items){
    if(!exact(row,['model_id','exclusive_quantity','mixed_quantity'])||!id(row.model_id,true)||!integer(row.exclusive_quantity,0,1000000000000)||!integer(row.mixed_quantity,0,1000000000000))return null;
    const key=product.item_id+':'+row.model_id,total=BigInt(row.exclusive_quantity)+BigInt(row.mixed_quantity);
    if(seenVariants.has(key)||!variants.has(key)||total!==BigInt(variants.get(key)))return null;
    seenVariants.add(key);exclusiveQuantity+=BigInt(row.exclusive_quantity);mixedQuantity+=BigInt(row.mixed_quantity);
    projectedItems.push({model_id:row.model_id,exclusive_quantity:row.exclusive_quantity,mixed_quantity:row.mixed_quantity});
   }
   if(exclusiveQuantity+mixedQuantity!==BigInt(product.quantity)||(product.exclusive_orders===0?exclusiveQuantity!==0n:exclusiveQuantity<BigInt(product.exclusive_orders))||(product.mixed_orders===0?mixedQuantity!==0n:mixedQuantity<BigInt(product.mixed_orders)))return null;
   projectedItems.sort((a,b)=>order(a.model_id,b.model_id));
   products.push(Object.fromEntries(productNames.map(key=>[key,key==='items'?projectedItems:product[key]])));
   exclusiveOrders+=product.exclusive_orders;covered+=product.exclusive_payment_covered;missing+=product.exclusive_payment_missing;returns+=product.exclusive_returns;unknownReturns+=product.exclusive_returns_unknown;mixedReferences+=product.mixed_orders;
  }
  const mixedReturns=coverage.returns-returns,mixedUnknownReturns=coverage.returns_unknown-unknownReturns;
  if(seenProducts.size!==productIds.size||seenVariants.size!==variants.size||exclusiveOrders+source.mixed_orders!==coverage.paid||covered+source.mixed_payment_covered!==coverage.payment_covered||missing+source.mixed_payment_missing!==coverage.payment_missing||mixedReturns<0||mixedReturns>source.mixed_payment_covered||mixedUnknownReturns<source.mixed_payment_missing||mixedReturns+mixedUnknownReturns>source.mixed_orders||(source.mixed_orders===0?mixedReferences!==0:mixedReferences<source.mixed_orders*2||mixedReferences>source.mixed_orders*products.length))return null;
  const global=[value.known_sales_base_raw,value.known_expected_repass_raw,value.known_ads_adjustment_raw,value.invoice_tax.known_tax_raw].map(cents);
  if(totals.some((amount,index)=>amount!==global[index]))return null;
  products.sort((a,b)=>order(a.item_id,b.item_id));
  return Object.fromEntries(names.map(key=>[key,key==='products'?products:source[key]]));
 }
 try {
  const hasProducts=plain(value)&&Object.hasOwn(value,'product_breakdown'),hasTimes=plain(value)&&Object.hasOwn(value,'source_checked_at'),hasCapacity=plain(value)&&Object.hasOwn(value,'page_capacity'),frameKeys=[...keys,...(hasProducts?['product_breakdown']:[]),...(hasTimes?['source_checked_at']:[]),...(hasCapacity?['page_capacity']:[])];
  if(!exact(value,frameKeys)||value.schema!=='finance_business_period_v1'||!run(value.run_id)||!integer(value.revision,1,2147483647)||!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(value.status)||!day(value.start_date)||!day(value.end_date)||!integer(value.cutoff_at,1,9999999999)||!integer(value.checked_at,value.cutoff_at,9999999999)||value.currency!=='BRL'||value.monetary_unit!=='UNCONFIRMED'||value.basis!=='CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'||!integer(value.pages_read,0,200)||!integer(value.duplicate_orders,0,1000)||!exact(value.coverage,coverageKeys)||!exact(value.invoice_tax,invoiceKeys)||!array(value.items,1000)||![null,'BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE','BUSINESS_PERIOD_CONFLICT','BUSINESS_PERIOD_CHECKPOINT','BUSINESS_PERIOD_BUSY','BUSINESS_PERIOD_RATE_LIMIT','BUSINESS_PERIOD_TIMEOUT','BUSINESS_PERIOD_AUTH_REQUIRED','BUSINESS_PERIOD_INVALID_SOURCE'].includes(value.diagnostic))return null;
  const days=(Date.parse(value.end_date+'T00:00:00Z')-Date.parse(value.start_date+'T00:00:00Z'))/86400000+1;
  if(days<1||days>15||value.status==='COMPLETE'&&value.pages_read===0||value.status!=='RUNNING'&&value.diagnostic!==null)return null;
  if(hasCapacity&&value.page_capacity!==20)return null;
  const c=value.coverage,capacity=hasCapacity?value.page_capacity:5;
  if(!coverageKeys.every(key=>integer(c[key],0,1000))||c.orders!==c.paid+c.cancelled+c.cancel_pending+c.unpaid+c.other+c.unknown||c.paid!==c.completed+c.ongoing||c.payment_covered+c.payment_missing!==c.paid||c.returns>c.payment_covered||c.returns_unknown<c.payment_missing||c.returns+c.returns_unknown>c.paid||c.orders+value.duplicate_orders>value.pages_read*capacity)return null;
  let sourceTimes=null;
  if(hasTimes){
   sourceTimes=value.source_checked_at;
   if(!exact(sourceTimes,['oldest_at','latest_at'])||!integer(sourceTimes.oldest_at,value.cutoff_at,value.checked_at)||!integer(sourceTimes.latest_at,sourceTimes.oldest_at,value.checked_at)||c.orders===1&&sourceTimes.oldest_at!==sourceTimes.latest_at||c.orders===0&&(sourceTimes.oldest_at!==value.cutoff_at||sourceTimes.latest_at!==value.checked_at))return null;
  }
  const money=[];
  for(const [known,total] of [['known_sales_base_raw','sales_base_raw'],['known_expected_repass_raw','expected_repass_raw'],['known_ads_adjustment_raw','ads_adjustment_raw']]){
   const amount=cents(value[known]);
   if(amount===null||c.payment_covered===0&&amount!==0n||value[total]!== (c.payment_missing>0?null:value[known]))return null;
   money.push(amount);
  }
  if(money[0]<0n)return null;
  const tax=value.invoice_tax,base=cents(tax.known_base_raw),amount=cents(tax.known_tax_raw),covered=BigInt(c.payment_covered);
  if(tax.schema!=='store_invoice_tax_v1'||tax.rate_bps!==200||tax.basis!=='PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE'||tax.rounding!=='HALF_UP_PER_ORDER'||tax.covered_orders!==c.payment_covered||tax.unavailable_orders!==c.payment_missing||base===null||amount===null||base!==money[0]||amount<0n||base>covered*100000000000000n||covered===0n&&amount!==0n||base===0n&&amount!==0n||amount>base/25n)return null;
  // Each invoice was rounded HALF_UP independently. The aggregate may differ
  // from rounding the sum, but only within one half-cent per covered invoice.
  const difference=amount*10000n-base*200n;
  if(difference< -4999n*covered||difference>5000n*covered)return null;
  const items=[],seen=new Set();let quantity=0n;
  for(const row of value.items){
   if(!exact(row,['item_id','model_id','quantity'])||!id(row.item_id)||!id(row.model_id,true)||!integer(row.quantity,1,1000000000000)||seen.has(row.item_id+':'+row.model_id))return null;
   seen.add(row.item_id+':'+row.model_id);quantity+=BigInt(row.quantity);
   items.push({item_id:row.item_id,model_id:row.model_id,quantity:row.quantity});
  }
  if(c.paid===0?items.length!==0:items.length===0||quantity<BigInt(c.paid))return null;
  items.sort((a,b)=>order(a.item_id,b.item_id)||order(a.model_id,b.model_id));
  const products=hasProducts?productBreakdown(value.product_breakdown,c,items):null;if(hasProducts&&!products)return null;
  return Object.fromEntries(frameKeys.map(key=>[key,key==='coverage'?Object.fromEntries(coverageKeys.map(name=>[name,c[name]])):key==='invoice_tax'?Object.fromEntries(invoiceKeys.map(name=>[name,tax[name]])):key==='items'?items:key==='product_breakdown'?products:key==='source_checked_at'?{...sourceTimes}:value[key]]));
 }catch{return null;}
}
