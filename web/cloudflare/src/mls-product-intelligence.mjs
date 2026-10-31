// MLS Commerce OS M3 — exclusively read-only interpretation of an already
// validated monthly product summary. No provider calls, orders, inventory or writes.
export function buildMlsProductIntelligence(frame){
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

// Mathematical what-if, not a marketplace price recommendation. All values
// must be explicitly supplied; rates are basis points of simulated gross sale.
// Tax, freight and other costs are NOT inferred from Shopee's observed payout.
export function simulateMlsPricingScenario(input){
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
