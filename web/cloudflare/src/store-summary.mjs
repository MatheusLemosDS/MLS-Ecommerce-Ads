import {productionCostReference} from './production-costs.mjs';
import {projectStorePeriodFrame} from '../../finance/src/store-period-frame.mjs';

export class StoreSummaryError extends Error {
  constructor(code,status=400){super(code);this.status=status;}
}

const summaryPlain=value=>value!==null&&typeof value==='object'
  && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const summaryExact=(value,keys)=>summaryPlain(value)&&Reflect.ownKeys(value).length===keys.length
  && keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const summarySafeInteger=value=>Number.isSafeInteger(value)&&value>=0;
const summarySafeNumber=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
const summaryUnitConfirmation='OPERATOR_CONFIRMED_BRL_2026_10_20';
const summaryMoneyBound=100000000000000n;

// The operator compared Shopee's original values with the same BRL order.
// Only exact cent amounts are accepted: no float multiplication or rounding.
function summaryMoney(value){
  if(typeof value!=='string'||value.length>32)return null;
  const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value);
  if(!match)return null;
  let amount=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));
  if(match[1]){if(amount===0n)return null;amount=-amount;}
  if(amount< -summaryMoneyBound||amount>summaryMoneyBound)return null;
  return Number(amount);
}

export function validateStoreAdjustments(value){
  const hasSource=summaryPlain(value)&&Object.hasOwn(value,'ads_source');
  if(!summaryExact(value,['ads_spend_cents','external_expenses_cents','recharge_treatment',...(hasSource?['ads_source']:[])])
    ||!summarySafeInteger(value.ads_spend_cents)||!summarySafeInteger(value.external_expenses_cents)
    ||hasSource&&!['MANUAL','SHOPEE_PERIOD'].includes(value.ads_source)
    ||!['UNCONFIRMED','ADS_RECHARGE','TECH_SUPPORT'].includes(value.recharge_treatment)){
    throw new StoreSummaryError('STORE_ADJUSTMENTS_INVALID');
  }
  return {ads_spend_cents:value.ads_spend_cents,external_expenses_cents:value.external_expenses_cents,
    recharge_treatment:value.recharge_treatment,...(hasSource?{ads_source:value.ads_source}:{})};
}

// Expected repass already incorporates Shopee's fees. Do not subtract fee fields
// again or use Shopee's original_cost_of_goods_sold as our manufacturing cost.
export function buildStoreSummary(frame,bindings,costs,adjustments=null){
  const source=projectStorePeriodFrame(frame);
  if(!source)throw new StoreSummaryError('STORE_SUMMARY_FRAME_INVALID',502);
  const declared=adjustments===null?null:validateStoreAdjustments(adjustments);
  let reference;
  try{
    reference=productionCostReference({status:'AVAILABLE',rows:source.items.map(row=>({...row}))},bindings,costs);
  }catch{throw new StoreSummaryError('STORE_SUMMARY_COST_INVALID',503);}
  const complete=source.status==='COMPLETE'&&source.diagnostic===null;
  const payout=summaryMoney(source.escrow_amount_raw),combined=summaryMoney(source.ads_recharge_or_support_raw);
  const pending=[];
  if(source.status==='RUNNING')pending.push('COLLECTING');
  if(source.status==='LIMIT_REACHED')pending.push('PERIOD_LIMIT_REACHED');
  if(source.diagnostic!==null)pending.push('PERIOD_DIAGNOSTIC');
  if(payout===null)pending.push('MONEY_UNAVAILABLE');
  if(reference.total_cents===null)pending.push('PRODUCTION_COST_INCOMPLETE');
  if(source.returns_orders!==0)pending.push('RETURNS_NOT_RECONCILED');
  if(!declared)pending.push('ADJUSTMENTS_REQUIRED');
  if(combined===null||combined<0)pending.push('RECHARGE_COMPONENT_UNAVAILABLE');
  if(combined!==null&&combined>0&&declared?.recharge_treatment==='UNCONFIRMED')pending.push('RECHARGE_TREATMENT_REQUIRED');

  const expected=complete?payout:null,production=complete?reference.total_cents:null;
  let afterProduction=null,estimate=null;
  if(expected!==null&&production!==null){
    afterProduction=summarySafeNumber(BigInt(expected)-BigInt(production));
    if(afterProduction===null)pending.push('ARITHMETIC_UNSAFE');
  }
  if(afterProduction!==null&&source.returns_orders===0&&declared&&combined!==null&&combined>=0
    &&(combined===0||declared.recharge_treatment!=='UNCONFIRMED')){
    const addBack=combined>0&&declared.recharge_treatment==='ADS_RECHARGE'?BigInt(combined):0n;
    estimate=summarySafeNumber(BigInt(afterProduction)+addBack-BigInt(declared.ads_spend_cents)-BigInt(declared.external_expenses_cents));
    if(estimate===null&&!pending.includes('ARITHMETIC_UNSAFE'))pending.push('ARITHMETIC_UNSAFE');
  }
  pending.push('SETTLEMENT_NOT_RECONCILED');
  return {schema:'store_result_v1',run_id:source.run_id,revision:source.revision,status:source.status,
    start_date:source.start_date,end_date:source.end_date,cutoff_at:source.cutoff_at,checked_at:source.checked_at,
    currency:'BRL',unit_confirmation:summaryUnitConfirmation,order_count:source.order_count,pages_read:source.pages_read,
    returns_orders:source.returns_orders,complete,bindings_revision:reference.bindings_revision,costs_revision:reference.costs_revision,
    known_expected_repass_cents:payout,expected_repass_cents:expected,
    known_production_cost_cents:reference.known_subset_cents,production_cost_cents:production,
    expected_after_production_cents:afterProduction,ads_recharge_or_support_cents:complete?combined:null,
    net_estimate_cents:estimate,net_profit_cents:null,pending,
    unmapped_variants:reference.variants.filter(row=>row.unit_cost_cents===null)
      .map(({item_id,model_id,quantity})=>({item_id,model_id,quantity})),
    net_basis:'EXPECTED_REPASS_CURRENT_STANDARD_COSTS_NOT_SETTLED'};
}
