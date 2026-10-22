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
 try {
  if(!exact(value,keys)||value.schema!=='finance_business_period_v1'||!run(value.run_id)||!integer(value.revision,1,2147483647)||!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(value.status)||!day(value.start_date)||!day(value.end_date)||!integer(value.cutoff_at,1,9999999999)||!integer(value.checked_at,value.cutoff_at,9999999999)||value.currency!=='BRL'||value.monetary_unit!=='UNCONFIRMED'||value.basis!=='CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'||!integer(value.pages_read,0,200)||!integer(value.duplicate_orders,0,1000)||!exact(value.coverage,coverageKeys)||!exact(value.invoice_tax,invoiceKeys)||!array(value.items,1000)||![null,'BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE','BUSINESS_PERIOD_CONFLICT'].includes(value.diagnostic))return null;
  const days=(Date.parse(value.end_date+'T00:00:00Z')-Date.parse(value.start_date+'T00:00:00Z'))/86400000+1;
  if(days<1||days>15||value.status==='COMPLETE'&&value.pages_read===0||value.status!=='RUNNING'&&value.diagnostic!==null)return null;
  const c=value.coverage;
  if(!coverageKeys.every(key=>integer(c[key],0,1000))||c.orders!==c.paid+c.cancelled+c.cancel_pending+c.unpaid+c.other+c.unknown||c.paid!==c.completed+c.ongoing||c.payment_covered+c.payment_missing!==c.paid||c.returns>c.payment_covered||c.returns_unknown<c.payment_missing||c.returns+c.returns_unknown>c.paid||c.orders+value.duplicate_orders>value.pages_read*5)return null;
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
  return Object.fromEntries(keys.map(key=>[key,key==='coverage'?Object.fromEntries(coverageKeys.map(name=>[name,c[name]])):key==='invoice_tax'?Object.fromEntries(invoiceKeys.map(name=>[name,tax[name]])):key==='items'?items:value[key]]));
 }catch{return null;}
}
