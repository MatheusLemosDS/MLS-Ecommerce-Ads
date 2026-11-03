import {projectBusinessPeriodFrame} from './business-period-frame.mjs';

// These aggregates identify a selling-unit pair only when the entire paid
// order contains that pair. No order identity or allocation crosses this edge.
// The synchronous reader takes an already projected legacy parent and its
// canonical JSON digest. The async envelope reader verifies both at the edge.
export function projectBusinessVariantBreakdown(value,report,reportHash){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const list=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,i)=>Object.hasOwn(Object.getOwnPropertyDescriptor(rows,String(i))||{},'value')).every(Boolean);
 const integer=(n,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&!Object.is(n,-0)&&n>=min&&n<=max;
 const id=(n,zero=false)=>typeof n==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(n);
 const compare=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
 const raw=n=>{const sign=n<0n?'-':'';if(n<0n)n=-n;const fraction=String(n%100n).padStart(2,'0').replace(/0+$/,'');return sign+String(n/100n)+(fraction?'.'+fraction:'');};
 const cents=n=>{if(typeof n!=='string'||n.length>32)return null;const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(n);if(!match)return null;let amount=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));if(match[1])amount=-amount;return amount>=-100000000000000000n&&amount<=100000000000000000n&&raw(amount)===n?amount:null;};
 const counts=['orders','completed','ongoing','payment_covered','payment_missing','returns','returns_unknown'];
 const money=['sales_base','expected_repass','ads_adjustment','invoice_tax'];
 const moneyKeys=money.flatMap(name=>['known_'+name+'_raw',name+'_raw']);
 const groupKeys=['quantity',...counts,...moneyKeys];
 const totals=()=>({counts:Object.fromEntries(counts.map(key=>[key,0])),money:money.map(()=>0n),items:new Map()});
 const add=(sum,group,items)=>{for(const key of counts){sum.counts[key]+=group[key];if(!integer(sum.counts[key],0,1000))throw Error('COUNTS');}money.forEach((name,i)=>sum.money[i]+=cents(group['known_'+name+'_raw']));for(const item of items){const key=item.item_id+':'+item.model_id;sum.items.set(key,(sum.items.get(key)||0n)+BigInt(item.quantity));}};
 function checkGroup(group,keys,minOrders,minimumUnitsPerOrder){
  if(!exact(group,keys)||!counts.every(key=>integer(group[key],0,1000))||group.orders<minOrders||group.orders!==group.completed+group.ongoing||group.orders!==group.payment_covered+group.payment_missing||group.returns>group.payment_covered||group.returns_unknown<group.payment_missing||group.returns+group.returns_unknown>group.orders||!integer(group.quantity,group.orders*minimumUnitsPerOrder)||group.orders===0&&group.quantity!==0)return false;
  const amounts=money.map(name=>cents(group['known_'+name+'_raw'])),bound=BigInt(group.payment_covered)*100000000000000n;
  if(amounts.some(n=>n===null||n< -bound||n>bound)||amounts[0]<0n||amounts[3]<0n||money.some(name=>group[name+'_raw']!==(group.payment_missing?null:group['known_'+name+'_raw'])))return false;
  const taxDifference=amounts[3]*10000n-amounts[0]*200n,n=BigInt(group.payment_covered);
  if(taxDifference< -4999n*n||taxDifference>5000n*n)return false;
  return true;
 }
 try{
  const keys=['schema','run_id','source_revision','start_date','end_date','cutoff_at','checked_at','report_hash','currency','monetary_unit','basis','variants','unallocated_products','mixed'];
  if(!plain(report)||report.schema!=='finance_business_period_v1'||!plain(report.product_breakdown)||!exact(value,keys)||value.schema!=='finance_business_variant_breakdown_v1'||value.basis!=='SINGLE_PAIR_PAID_ORDERS_NO_ALLOCATION_NOT_SETTLED'||value.currency!=='BRL'||value.monetary_unit!=='UNCONFIRMED'||typeof reportHash!=='string'||!/^[a-f0-9]{64}$/.test(reportHash)||value.report_hash!==reportHash||value.run_id!==report.run_id||value.source_revision!==report.revision||value.start_date!==report.start_date||value.end_date!==report.end_date||value.cutoff_at!==report.cutoff_at||value.checked_at!==report.checked_at||!list(value.variants,1000)||!list(value.unallocated_products,1000))return null;
  const overall=totals(),byProduct=new Map(),variantRows=[],unallocated=[],seenPairs=new Set(),seenProducts=new Set();
  let previousPair=null,previousProduct=null,groupCount=0;
  for(const row of value.variants){
   if(!checkGroup(row,['item_id','model_id',...groupKeys],1,1)||!id(row.item_id)||!id(row.model_id,true))return null;
   const key=row.item_id+':'+row.model_id;if(seenPairs.has(key)||previousPair&&(compare(previousPair.item_id,row.item_id)>0||previousPair.item_id===row.item_id&&compare(previousPair.model_id,row.model_id)>=0))return null;
   seenPairs.add(key);previousPair=row;groupCount++;
   const items=[{item_id:row.item_id,model_id:row.model_id,quantity:row.quantity}],sum=byProduct.get(row.item_id)||totals();add(sum,row,items);byProduct.set(row.item_id,sum);add(overall,row,items);
   variantRows.push(Object.fromEntries(['item_id','model_id',...groupKeys].map(key=>[key,row[key]])));
  }
  for(const row of value.unallocated_products){
   if(!checkGroup(row,['item_id',...groupKeys,'items'],1,2)||!id(row.item_id)||seenProducts.has(row.item_id)||previousProduct!==null&&compare(previousProduct,row.item_id)>=0||!list(row.items,1000)||row.items.length<2)return null;
   seenProducts.add(row.item_id);previousProduct=row.item_id;const items=[];let previous=null,quantity=0n;
   for(const item of row.items){if(!exact(item,['model_id','quantity'])||!id(item.model_id,true)||!integer(item.quantity,1,1000000000000)||previous!==null&&compare(previous,item.model_id)>=0)return null;previous=item.model_id;quantity+=BigInt(item.quantity);items.push({item_id:row.item_id,model_id:item.model_id,quantity:item.quantity});}
   if(quantity!==BigInt(row.quantity))return null;groupCount+=items.length;
   const sum=byProduct.get(row.item_id)||totals();add(sum,row,items);byProduct.set(row.item_id,sum);add(overall,row,items);
   unallocated.push({...Object.fromEntries(['item_id',...groupKeys].map(key=>[key,row[key]])),items:items.map(({model_id,quantity})=>({model_id,quantity}))});
  }
  if(groupCount>2000||!checkGroup(value.mixed,[...groupKeys,'items'],0,2)||!list(value.mixed.items,1000))return null;
  const mixed=value.mixed,mixedItems=[],mixedProducts=new Set();let previous=null,mixedQuantity=0n;
  for(const item of mixed.items){if(!exact(item,['item_id','model_id','quantity'])||!id(item.item_id)||!id(item.model_id,true)||!integer(item.quantity,1,1000000000000)||previous&&(compare(previous.item_id,item.item_id)>0||previous.item_id===item.item_id&&compare(previous.model_id,item.model_id)>=0))return null;previous=item;mixedProducts.add(item.item_id);mixedQuantity+=BigInt(item.quantity);mixedItems.push({...item});}
  if(mixedQuantity!==BigInt(mixed.quantity)||(mixed.orders===0?mixedItems.length!==0:mixedProducts.size<2))return null;
  const legacy=report.product_breakdown;
  if(mixed.orders!==legacy.mixed_orders||mixed.payment_covered!==legacy.mixed_payment_covered||mixed.payment_missing!==legacy.mixed_payment_missing||money.some(name=>mixed['known_'+name+'_raw']!==legacy['known_mixed_'+name+'_raw']))return null;
  if(!list(legacy.products,1000))return null;
  const expectedItems=new Map();
  for(const row of legacy.products){
   const sum=byProduct.get(row.item_id)||totals();byProduct.delete(row.item_id);
   const pairs=[['orders','exclusive_orders'],['payment_covered','exclusive_payment_covered'],['payment_missing','exclusive_payment_missing'],['returns','exclusive_returns'],['returns_unknown','exclusive_returns_unknown']];
   if(pairs.some(([key,parent])=>sum.counts[key]!==row[parent])||money.some((name,i)=>sum.money[i]!==cents(row['known_exclusive_'+name+'_raw'])))return null;
   for(const item of row.items){const key=row.item_id+':'+item.model_id;if((sum.items.get(key)||0n)!==BigInt(item.exclusive_quantity))return null;sum.items.delete(key);expectedItems.set(key,{exclusive:BigInt(item.exclusive_quantity),mixed:BigInt(item.mixed_quantity)});}
   if(sum.items.size)return null;
  }
  if(byProduct.size)return null;
  const actualMixed=new Map(mixedItems.map(item=>[item.item_id+':'+item.model_id,BigInt(item.quantity)]));
  for(const [key,item]of expectedItems){if((actualMixed.get(key)||0n)!==item.mixed)return null;actualMixed.delete(key);}if(actualMixed.size)return null;
  add(overall,mixed,mixedItems);
  const coverage=report.coverage;
  if(overall.counts.orders!==coverage.paid||counts.slice(1).some(key=>overall.counts[key]!==coverage[key]))return null;
  const expectedMoney=[report.known_sales_base_raw,report.known_expected_repass_raw,report.known_ads_adjustment_raw,report.invoice_tax.known_tax_raw];if(overall.money.some((amount,i)=>amount!==cents(expectedMoney[i])))return null;
  if(!list(report.items,1000)||overall.items.size!==report.items.length)return null;
  for(const item of report.items)if(overall.items.get(item.item_id+':'+item.model_id)!==BigInt(item.quantity))return null;
  const result={...Object.fromEntries(keys.filter(key=>!['variants','unallocated_products','mixed'].includes(key)).map(key=>[key,value[key]])),variants:variantRows,unallocated_products:unallocated,mixed:{...Object.fromEntries(groupKeys.map(key=>[key,mixed[key]])),items:mixedItems}};
  return new TextEncoder().encode(JSON.stringify(result)).byteLength<=524288?result:null;
 }catch{return null;}
}

// records are the committed snapshot AFTER the collector verifies source_hash;
// the uncommitted Payment cache must never be passed into this projection.
export function buildBusinessVariantBreakdown(report,records,reportHash){
 const counts=['orders','completed','ongoing','payment_covered','payment_missing','returns','returns_unknown'],money=['sales_base','expected_repass','ads_adjustment','invoice_tax'];
 const create=()=>({quantity:0,...Object.fromEntries(counts.map(key=>[key,0])),amounts:money.map(()=>0n),items:new Map()});
 const raw=n=>{const sign=n<0n?'-':'';if(n<0n)n=-n;const fraction=String(n%100n).padStart(2,'0').replace(/0+$/,'');return sign+String(n/100n)+(fraction?'.'+fraction:'');};
 const cents=n=>{const match=typeof n==='string'&&/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(n);if(!match)throw Error('AMOUNT');let value=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));if(match[1])value=-value;if(raw(value)!==n)throw Error('AMOUNT');return value;};
 const compare=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0),pairSort=(a,b)=>compare(a.item_id,b.item_id)||compare(a.model_id,b.model_id);
 const finish=group=>{const {amounts,items,...result}=group;for(const [i,name]of money.entries()){result['known_'+name+'_raw']=raw(amounts[i]);result[name+'_raw']=group.payment_missing?null:result['known_'+name+'_raw'];}return result;};
 try{
  if(!Array.isArray(records)||records.length!==report.coverage.orders||records.length>1000)return null;
  const variants=new Map(),products=new Map(),mixed=create(),seen=new Set();
  for(const record of records){
   if(!record||typeof record.order_hash!=='string'||!/^[a-f0-9]{64}$/.test(record.order_hash)||seen.has(record.order_hash)||typeof record.source_hash!=='string'||!/^[a-f0-9]{64}$/.test(record.source_hash)||!Number.isSafeInteger(record.checked_at)||record.checked_at<report.cutoff_at||record.checked_at>report.checked_at)return null;seen.add(record.order_hash);
   const items=JSON.parse(record.items);
   if(!['completed','ongoing'].includes(record.bucket)){
    if(!['cancelled','cancel_pending','unpaid','other','unknown'].includes(record.bucket)||record.payment_covered!==0||[record.sales_raw,record.escrow_raw,record.ads_raw,record.returns_seen].some(value=>value!==null)||!Array.isArray(items)||items.length)return null;
    continue;
   }
   if(!Array.isArray(items)||!items.length||items.length>1000||items.some(item=>!item||Object.getPrototypeOf(item)!==Object.prototype||Reflect.ownKeys(item).length!==3||!['item_id','model_id','quantity'].every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'))||typeof item.item_id!=='string'||!/^[1-9][0-9]{0,19}$/.test(item.item_id)||typeof item.model_id!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(item.model_id)||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>1000000000000))return null;
   if(JSON.stringify([...items].sort(pairSort))!==record.items)return null;
   const unique=new Set(items.map(item=>item.item_id+':'+item.model_id));if(unique.size!==items.length)return null;
   const sole=items.length===1,oneProduct=new Set(items.map(item=>item.item_id)).size===1;
   let group;if(sole){const item=items[0],key=item.item_id+':'+item.model_id;group=variants.get(key);if(!group){group={item_id:item.item_id,model_id:item.model_id,...create()};variants.set(key,group);}}else if(oneProduct){const item_id=items[0].item_id;group=products.get(item_id);if(!group){group={item_id,...create()};products.set(item_id,group);}}else group=mixed;
   group.orders++;group[record.bucket]++;
   for(const item of items){if(!Number.isSafeInteger(item.quantity)||item.quantity<1)return null;group.quantity+=item.quantity;if(!Number.isSafeInteger(group.quantity))return null;const key=item.item_id+':'+item.model_id,previous=group.items.get(key);group.items.set(key,{...item,quantity:(previous?.quantity||0)+item.quantity});}
   if(record.payment_covered===0){if([record.sales_raw,record.escrow_raw,record.ads_raw,record.returns_seen].some(value=>value!==null))return null;group.payment_missing++;group.returns_unknown++;continue;}
   if(record.payment_covered!==1)return null;group.payment_covered++;
   const sales=cents(record.sales_raw),payout=cents(record.escrow_raw),ads=cents(record.ads_raw);if(sales<0n)return null;const amounts=[sales,payout,ads,(sales*200n+5000n)/10000n];amounts.forEach((value,i)=>group.amounts[i]+=value);
   if(record.returns_seen===null)group.returns_unknown++;else if([0,1].includes(record.returns_seen))group.returns+=record.returns_seen;else return null;
  }
  const candidate={schema:'finance_business_variant_breakdown_v1',run_id:report.run_id,source_revision:report.revision,start_date:report.start_date,end_date:report.end_date,cutoff_at:report.cutoff_at,checked_at:report.checked_at,report_hash:reportHash,currency:'BRL',monetary_unit:'UNCONFIRMED',basis:'SINGLE_PAIR_PAID_ORDERS_NO_ALLOCATION_NOT_SETTLED',variants:[...variants.values()].map(finish).sort(pairSort),unallocated_products:[...products.values()].map(group=>({...finish(group),items:[...group.items.values()].sort(pairSort).map(({model_id,quantity})=>({model_id,quantity}))})).sort((a,b)=>compare(a.item_id,b.item_id)),mixed:{...finish(mixed),items:[...mixed.items.values()].sort(pairSort)}};
  return projectBusinessVariantBreakdown(candidate,report,reportHash);
 }catch{return null;}
}

export async function projectBusinessPeriodVariantsFrame(value){
 try{
  const keys=['schema','report','variant_financials'];
  if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'))||value.schema!=='finance_business_period_variants_v1')return null;
  const report=projectBusinessPeriodFrame(value.report);if(!report||new TextEncoder().encode(JSON.stringify(report)).byteLength>1048576)return null;
  let variant_financials=null;
  if(value.variant_financials!==null){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(report)))),byte=>byte.toString(16).padStart(2,'0')).join('');variant_financials=projectBusinessVariantBreakdown(value.variant_financials,report,hash);if(!variant_financials)return null;}
  const result={schema:value.schema,report,variant_financials};return new TextEncoder().encode(JSON.stringify(result)).byteLength<=2097152?result:null;
 }catch{return null;}
}

export async function buildBusinessPeriodVariantsFrame(frame,records){
 const report=projectBusinessPeriodFrame(frame);if(!report||new TextEncoder().encode(JSON.stringify(report)).byteLength>1048576)return null;
 let variant_financials=null;
 try{const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(report)))),byte=>byte.toString(16).padStart(2,'0')).join('');variant_financials=buildBusinessVariantBreakdown(report,records,hash);}catch{}
 return {schema:'finance_business_period_variants_v1',report,variant_financials};
}
