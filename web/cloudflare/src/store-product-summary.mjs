import {productionCostReference} from './production-costs.mjs';
import {projectStorePeriodFrame} from '../../finance/src/store-period-frame.mjs';
import {StoreSummaryError} from './store-summary.mjs';

const productSummaryMoneyBound=100000000000000n;
const productSummarySafeNumber=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)
 &&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;

// Payment's BRL scale was confirmed by the operator. Accept exact cents only;
// a canonical upstream sub-cent amount remains unknown instead of being rounded.
function productSummaryMoney(value){
 if(typeof value!=='string'||value.length>32)return null;
 const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value);
 if(!match)return null;
 let amount=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));
 if(match[1]){if(amount===0n)return null;amount=-amount;}
 return amount< -productSummaryMoneyBound||amount>productSummaryMoneyBound?null:Number(amount);
}

// Only an order containing one product can attribute its entire expected
// repass without an invented fee allocation. A mixed order's repass remains
// unallocated; the known exclusive subset never pays for every order's costs.
export function buildStoreProductSummary(frame,bindings,costs){
 const source=projectStorePeriodFrame(frame);
 if(!source)throw new StoreSummaryError('STORE_PRODUCT_FRAME_INVALID',502);
 if(!Object.hasOwn(source,'product_breakdown'))return null;
 const breakdown=source.product_breakdown;
 let reference;
 try{reference=productionCostReference({status:'AVAILABLE',rows:source.items.map(row=>({...row}))},bindings,costs);}
 catch{throw new StoreSummaryError('STORE_PRODUCT_COST_INVALID',503);}
 const complete=source.status==='COMPLETE'&&source.diagnostic===null,grouped=new Map();
 for(const variant of reference.variants){
  const group=grouped.get(variant.item_id)||{quantity:0n,knownCost:0n,costMissing:false};
  group.quantity+=BigInt(variant.quantity);
  if(variant.production_cost_cents===null)group.costMissing=true;
  else group.knownCost+=BigInt(variant.production_cost_cents);
  grouped.set(variant.item_id,group);
 }
 const products=breakdown.products.map(product=>{
  const group=grouped.get(product.item_id);
  if(!group)throw new StoreSummaryError('STORE_PRODUCT_COST_INVALID',503);
  const quantity=productSummarySafeNumber(group.quantity),knownCost=productSummarySafeNumber(group.knownCost);
  if(quantity===null||knownCost===null)throw new StoreSummaryError('STORE_PRODUCT_COST_INVALID',503);
  const knownPayout=productSummaryMoney(product.exclusive_payout_raw),pending=[];
  if(source.status==='RUNNING')pending.push('COLLECTING');
  if(source.status==='LIMIT_REACHED')pending.push('PERIOD_LIMIT_REACHED');
  if(source.diagnostic!==null)pending.push('PERIOD_DIAGNOSTIC');
  if(product.mixed_order_count>0)pending.push('MIXED_PRODUCT_ORDERS');
  if(knownPayout===null)pending.push('MONEY_UNAVAILABLE');
  if(group.costMissing)pending.push('PRODUCTION_COST_INCOMPLETE');
  if(product.returns_orders!==0)pending.push('RETURNS_NOT_RECONCILED');
  const expected=complete&&product.mixed_order_count===0?knownPayout:null;
  const production=complete&&!group.costMissing?knownCost:null;
  let afterProduction=null;
  if(expected!==null&&production!==null){
   afterProduction=productSummarySafeNumber(BigInt(expected)-BigInt(production));
   if(afterProduction===null&&!pending.includes('MONEY_UNAVAILABLE'))pending.push('MONEY_UNAVAILABLE');
  }
  pending.push('SETTLEMENT_NOT_RECONCILED');
  return {item_id:product.item_id,quantity,order_count:product.order_count,
   exclusive_order_count:product.exclusive_order_count,mixed_order_count:product.mixed_order_count,
   known_exclusive_payout_cents:knownPayout,expected_repass_cents:expected,
   known_production_cost_cents:knownCost,production_cost_cents:production,
   expected_after_production_cents:afterProduction,returns_orders:product.returns_orders,
   net_profit_cents:null,pending};
 });
 return {schema:'store_product_result_v1',run_id:source.run_id,revision:source.revision,
  start_date:source.start_date,end_date:source.end_date,complete,currency:'BRL',
  bindings_revision:reference.bindings_revision,costs_revision:reference.costs_revision,
  exclusive_order_count:breakdown.exclusive_order_count,mixed_order_count:breakdown.mixed_order_count,
  exclusive_payout_cents:complete?productSummaryMoney(breakdown.exclusive_payout_raw):null,
  mixed_payout_cents:complete?productSummaryMoney(breakdown.mixed_payout_raw):null,products};
}
