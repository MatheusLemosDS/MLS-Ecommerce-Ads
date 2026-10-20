// Shared private contract for a bounded cohort of completed orders. Monetary
// values retain Shopee's original units until the operator verifies the scale.
const storePlain = value => value !== null && typeof value === 'object'
  && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const storeExact = (value,keys) => storePlain(value) && Reflect.ownKeys(value).length===keys.length
  && keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const storeArray = (value,max) => Array.isArray(value) && Object.getPrototypeOf(value)===Array.prototype
  && value.length<=max && Reflect.ownKeys(value).length===value.length+1
  && Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index)))
    .every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'));
const storeInteger = (value,min=0,max=Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value)&&value>=min&&value<=max;
const storeId = (value,zero=false) => typeof value==='string'
  && (zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(value);
const storeRunId = value => typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const storeDay = value => typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const storeIdOrder = (a,b) => a.length-b.length||(a<b?-1:a>b?1:0);
const STORE_SCALE = 1000000000000n;

// Parse decimal/exponent notation with integer arithmetic; reject excess
// precision instead of rounding values into a plausible monetary total.
function storeScaled(value,maximum='1000000000000000') {
  if(typeof value==='number') {
    if(!Number.isFinite(value))return null;
    value=String(value);
  }
  if(typeof value!=='string'||value.length>96)return null;
  const match=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(value);
  if(!match)return null;
  let digits=(match[2]+(match[3]||'')).replace(/^0+/,'')||'0';
  let scale=(match[3]||'').length-Number(match[4]||0);
  while(scale>0&&digits.endsWith('0')){digits=digits.slice(0,-1)||'0';scale--;}
  if(scale>12||scale< -24||digits.length>40)return null;
  if(scale<0){digits+='0'.repeat(-scale);scale=0;}
  if(digits.length>40)return null;
  let result=BigInt(digits)*10n**BigInt(12-scale);
  if(match[1])result=-result;
  const bound=BigInt(maximum)*STORE_SCALE;
  return result< -bound||result>bound?null:result;
}
function storeUnscale(value) {
  const negative=value<0n;
  if(negative)value=-value;
  const whole=value/STORE_SCALE,fraction=(value%STORE_SCALE).toString().padStart(12,'0').replace(/0+$/,'');
  return (negative?'-':'')+whole+(fraction?'.'+fraction:'');
}
export function normalizeStoreDecimal(value,maximum='1000000000000000') {
  try{const scaled=storeScaled(value,maximum);return scaled===null?null:storeUnscale(scaled);}catch{return null;}
}
export function addStoreDecimals(values) {
  try{
    if(!storeArray(values,1000))return null;
    let total=0n;
    for(const value of values){const next=storeScaled(value);if(next===null)return null;total+=next;}
    const bound=1000000000000000n*STORE_SCALE;
    return total< -bound||total>bound?null:storeUnscale(total);
  }catch{return null;}
}

export function projectStorePeriodRequest(value) {
  try{
    if(!storePlain(value))return null;
    const operation=Object.getOwnPropertyDescriptor(value,'operation')?.value;
    if(operation==='start'){
      if(!storeExact(value,['operation','start_date','end_date'])||!storeDay(value.start_date)||!storeDay(value.end_date))return null;
      const days=(Date.parse(value.end_date+'T00:00:00Z')-Date.parse(value.start_date+'T00:00:00Z'))/86400000+1;
      return days>=1&&days<=15?{operation:'start',start_date:value.start_date,end_date:value.end_date}:null;
    }
    if(!['step','read'].includes(operation)||!storeExact(value,['operation','run_id'])||!storeRunId(value.run_id))return null;
    return {operation:value.operation,run_id:value.run_id};
  }catch{return null;}
}

// Only orders containing one distinct product can have their whole expected
// payout attributed without a fee-allocation rule. Mixed orders stay separate.
function storeProductBreakdown(value,frame,items) {
  if(!storeExact(value,['schema','exclusive_order_count','mixed_order_count','exclusive_payout_raw','mixed_payout_raw','products'])
    ||value.schema!=='store_product_breakdown_v1'||!storeInteger(value.exclusive_order_count,0,frame.order_count)
    ||!storeInteger(value.mixed_order_count,0,frame.order_count)
    ||value.exclusive_order_count+value.mixed_order_count!==frame.order_count||!storeArray(value.products,1000))return null;
  const money=value=>value===null||typeof value==='string'&&normalizeStoreDecimal(value)===value;
  for(const kind of ['exclusive','mixed']){
    if(!money(value[kind+'_payout_raw'])||value[kind+'_order_count']===0&&value[kind+'_payout_raw']!=='0')return null;
  }
  if((frame.escrow_amount_raw===null)!==(value.exclusive_payout_raw===null||value.mixed_payout_raw===null))return null;
  if(frame.escrow_amount_raw!==null&&addStoreDecimals([value.exclusive_payout_raw,value.mixed_payout_raw])!==frame.escrow_amount_raw)return null;
  const quantities=new Map();
  for(const row of items)quantities.set(row.item_id,(quantities.get(row.item_id)||0)+row.quantity);
  if(value.products.length!==quantities.size)return null;
  const products=[],seen=new Set(),exclusivePayouts=[];
  let exclusiveOrders=0,mixedMemberships=0,returnsMemberships=0,unknownExclusive=false,unknownReturns=false;
  for(const row of value.products){
    if(!storeExact(row,['item_id','order_count','exclusive_order_count','mixed_order_count','exclusive_payout_raw','returns_orders'])
      ||!storeId(row.item_id)||!quantities.has(row.item_id)||seen.has(row.item_id)
      ||!storeInteger(row.order_count,1,frame.order_count)||row.order_count>quantities.get(row.item_id)
      ||!storeInteger(row.exclusive_order_count,0,value.exclusive_order_count)
      ||!storeInteger(row.mixed_order_count,0,value.mixed_order_count)
      ||row.order_count!==row.exclusive_order_count+row.mixed_order_count
      ||!money(row.exclusive_payout_raw)||row.exclusive_order_count===0&&row.exclusive_payout_raw!=='0'
      ||row.returns_orders!==null&&!storeInteger(row.returns_orders,0,row.order_count))return null;
    seen.add(row.item_id);exclusiveOrders+=row.exclusive_order_count;mixedMemberships+=row.mixed_order_count;
    if(row.exclusive_payout_raw===null)unknownExclusive=true;else exclusivePayouts.push(row.exclusive_payout_raw);
    if(row.returns_orders===null)unknownReturns=true;
    else {returnsMemberships+=row.returns_orders;if(frame.returns_orders!==null&&row.returns_orders>frame.returns_orders)return null;}
    products.push({item_id:row.item_id,order_count:row.order_count,exclusive_order_count:row.exclusive_order_count,
      mixed_order_count:row.mixed_order_count,exclusive_payout_raw:row.exclusive_payout_raw,returns_orders:row.returns_orders});
  }
  if(exclusiveOrders!==value.exclusive_order_count||mixedMemberships<value.mixed_order_count*2
    ||mixedMemberships>value.mixed_order_count*products.length
    ||(value.exclusive_payout_raw===null)!==unknownExclusive
    ||!unknownExclusive&&addStoreDecimals(exclusivePayouts)!==value.exclusive_payout_raw
    ||(frame.returns_orders===null)!==unknownReturns
    ||frame.returns_orders!==null&&(returnsMemberships<frame.returns_orders||returnsMemberships>frame.returns_orders*products.length))return null;
  products.sort((a,b)=>storeIdOrder(a.item_id,b.item_id));
  return {schema:'store_product_breakdown_v1',exclusive_order_count:value.exclusive_order_count,mixed_order_count:value.mixed_order_count,
    exclusive_payout_raw:value.exclusive_payout_raw,mixed_payout_raw:value.mixed_payout_raw,products};
}

// Return references identify whole orders. An occurrence does not identify the
// affected product, its refund amount, or whether any payment has been settled.
function storeReturnsBreakdown(value,frame,items,productBreakdown) {
  const kinds=['with_return','without_reported_return','unknown'];
  if(!storeExact(value,['schema',...kinds,'products'])||value.schema!=='store_returns_breakdown_v1'
    ||!storeArray(value.products,1000))return null;
  const money=value=>value===null||typeof value==='string'&&normalizeStoreDecimal(value)===value;
  const groups={},payouts=[];
  let count=0,unknownMoney=false;
  for(const kind of kinds){
    const group=value[kind];
    if(!storeExact(group,['order_count','payout_raw'])||!storeInteger(group.order_count,0,frame.order_count)
      ||!money(group.payout_raw)||group.order_count===0&&group.payout_raw!=='0')return null;
    groups[kind]={order_count:group.order_count,payout_raw:group.payout_raw};count+=group.order_count;
    if(group.payout_raw===null)unknownMoney=true;else payouts.push(group.payout_raw);
  }
  if(count!==frame.order_count||frame.returns_orders!==(groups.unknown.order_count>0?null:groups.with_return.order_count)
    ||(frame.escrow_amount_raw===null)!==unknownMoney
    ||!unknownMoney&&addStoreDecimals(payouts)!==frame.escrow_amount_raw)return null;
  const quantities=new Map();
  for(const row of items)quantities.set(row.item_id,(quantities.get(row.item_id)||0)+row.quantity);
  if(value.products.length!==quantities.size)return null;
  const sourceProducts=productBreakdown?new Map(productBreakdown.products.map(row=>[row.item_id,row])):null;
  const products=[],seen=new Set(),memberships=Object.fromEntries(kinds.map(kind=>[kind,0]));
  for(const row of value.products){
    if(!storeExact(row,['item_id','order_count','with_return_orders','without_reported_return_orders','unknown_orders'])
      ||!storeId(row.item_id)||!quantities.has(row.item_id)||seen.has(row.item_id)
      ||!storeInteger(row.order_count,1,frame.order_count)||row.order_count>quantities.get(row.item_id))return null;
    let total=0;
    for(const kind of kinds){
      const next=row[kind+'_orders'];
      if(!storeInteger(next,0,groups[kind].order_count))return null;
      memberships[kind]+=next;total+=next;
    }
    if(total!==row.order_count)return null;
    if(sourceProducts){
      const source=sourceProducts.get(row.item_id);
      if(!source||source.order_count!==row.order_count
        ||source.returns_orders!==(row.unknown_orders>0?null:row.with_return_orders))return null;
    }
    seen.add(row.item_id);
    products.push({item_id:row.item_id,order_count:row.order_count,with_return_orders:row.with_return_orders,
      without_reported_return_orders:row.without_reported_return_orders,unknown_orders:row.unknown_orders});
  }
  for(const kind of kinds)if(memberships[kind]<groups[kind].order_count
    ||memberships[kind]>groups[kind].order_count*products.length)return null;
  products.sort((a,b)=>storeIdOrder(a.item_id,b.item_id));
  return {schema:'store_returns_breakdown_v1',...groups,products};
}

export function projectStorePeriodFrame(value) {
  try{
    const hasBreakdown=storePlain(value)&&Object.hasOwn(value,'product_breakdown');
    const hasReturns=storePlain(value)&&Object.hasOwn(value,'returns_breakdown');
    const keys=['schema','run_id','revision','status','start_date','end_date','cutoff_at','checked_at','currency','monetary_unit',
      'order_count','pages_read','duplicate_orders','returns_orders','escrow_amount_raw','ads_recharge_or_support_raw','items','diagnostic',...(hasBreakdown?['product_breakdown']:[]),...(hasReturns?['returns_breakdown']:[])];
    if(!storeExact(value,keys)||value.schema!=='finance_store_period_v1'||!storeRunId(value.run_id)
      ||!storeInteger(value.revision,1,2147483647)||!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(value.status)
      ||!projectStorePeriodRequest({operation:'start',start_date:value.start_date,end_date:value.end_date})
      ||!storeInteger(value.cutoff_at,1,9999999999)||!storeInteger(value.checked_at,value.cutoff_at,9999999999)
      ||value.currency!=='BRL'||value.monetary_unit!=='UNCONFIRMED'||!storeInteger(value.order_count,0,1000)
      ||!storeInteger(value.pages_read,0,200)||!storeInteger(value.duplicate_orders,0,1000)
      ||value.order_count+value.duplicate_orders>value.pages_read*5
      ||value.returns_orders!==null&&!storeInteger(value.returns_orders,0,value.order_count)
      ||!storeArray(value.items,1000)||![null,'STORE_PERIOD_UPSTREAM_UNAVAILABLE','STORE_PERIOD_CONFLICT'].includes(value.diagnostic))return null;
    if(value.status==='COMPLETE'&&(value.pages_read===0||value.diagnostic!==null))return null;
    for(const name of ['escrow_amount_raw','ads_recharge_or_support_raw']){
      if(value[name]!==null&&(typeof value[name]!=='string'||normalizeStoreDecimal(value[name])!==value[name]))return null;
    }
    const seen=new Set(),items=[];
    for(const row of value.items){
      if(!storeExact(row,['item_id','model_id','quantity'])||!storeId(row.item_id)||!storeId(row.model_id,true)
        ||!storeInteger(row.quantity,1,1000000000000)||seen.has(row.item_id+':'+row.model_id))return null;
      seen.add(row.item_id+':'+row.model_id);items.push({item_id:row.item_id,model_id:row.model_id,quantity:row.quantity});
    }
    if(value.order_count===0&&(items.length||value.returns_orders!==0||value.escrow_amount_raw!=='0'||value.ads_recharge_or_support_raw!=='0'))return null;
    if(value.order_count>0&&!items.length)return null;
    items.sort((a,b)=>storeIdOrder(a.item_id,b.item_id)||storeIdOrder(a.model_id,b.model_id));
    const breakdown=hasBreakdown?storeProductBreakdown(value.product_breakdown,value,items):undefined;
    if(hasBreakdown&&!breakdown)return null;
    const returns=hasReturns?storeReturnsBreakdown(value.returns_breakdown,value,items,breakdown):undefined;
    if(hasReturns&&!returns)return null;
    return Object.fromEntries(keys.map(key=>[key,key==='items'?items:key==='product_breakdown'?breakdown:key==='returns_breakdown'?returns:value[key]]));
  }catch{return null;}
}
