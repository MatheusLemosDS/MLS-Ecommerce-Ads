import {AiSalesContractError,readAiSalesRecord,validateAiSalesProductSnapshot,validateAiSalesEvidence} from './mls-ai-sales-contracts.mjs';

/** Proposed selling-unit contribution, never bank profit or authorization to sell. */
export function evaluateAiSalesProfitability(raw){
 readAiSalesRecord(raw,['product','commission_rate_bps','commission_evidence','extra_cost_cents','extra_cost_evidence','at']);
 const product=validateAiSalesProductSnapshot(raw.product),at=raw.at,reasons=[];
 if(!Number.isSafeInteger(at)||at<=0||at>4102444800)throw new AiSalesContractError('AI_SALES_TIME_INVALID');
 const safe=(v,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=0&&v<=max;
 if(raw.commission_rate_bps!==null&&!safe(raw.commission_rate_bps,10000)||raw.extra_cost_cents!==null&&!safe(raw.extra_cost_cents))throw new AiSalesContractError('AI_SALES_MONEY_INVALID');
 const observations=new Map(product.observations.map(row=>[row.field,row.evidence]));
 const entries=[['PRICE',product.price_cents,observations.get('price_cents')??null],['PRODUCTION',product.cost_cents,observations.get('cost_cents')??null],['FEES',product.fees_cents,observations.get('fees_cents')??null],['COMMISSION',raw.commission_rate_bps,raw.commission_evidence],['EXTRA_COSTS',raw.extra_cost_cents,raw.extra_cost_evidence]];
 let basis=null;
 for(const [name,value,rawEvidence] of entries){
  if(value===null)reasons.push(name+'_UNKNOWN');
  if(rawEvidence===null){reasons.push(name+'_EVIDENCE_MISSING');continue;}
  const e=validateAiSalesEvidence(rawEvidence);
  if(e.status!=='VERIFIED')reasons.push(name+'_NOT_VERIFIED');
  if(e.marketplace!==product.marketplace||e.shop_ref!==product.shop_ref||e.currency!==product.currency)reasons.push(name+'_SCOPE_MISMATCH');
  if(e.basis===null)reasons.push(name+'_BASIS_MISSING');else if(basis===null)basis=e.basis;else if(basis!==e.basis)reasons.push(name+'_BASIS_MISMATCH');
  if(e.observed_at>at||at-e.observed_at>86400)reasons.push(name+'_EVIDENCE_STALE');
 }
 if(product.currency===null)reasons.push('CURRENCY_UNKNOWN');
 let contribution=null,margin=null,commission=null;
 if(!reasons.length){
  const price=BigInt(product.price_cents),rate=BigInt(raw.commission_rate_bps);
  const fee=(price*rate+9999n)/10000n;
  const result=price-BigInt(product.cost_cents)-BigInt(product.fees_cents)-BigInt(raw.extra_cost_cents)-fee;
  const scaled=price===0n?null:result*10000n/price,max=BigInt(Number.MAX_SAFE_INTEGER);
  if(fee>max||result>max||result< -max||scaled!==null&&(scaled>max||scaled< -max))reasons.push('ARITHMETIC_UNSAFE');
  else{commission=Number(fee);contribution=Number(result);margin=scaled===null?null:Number(scaled);if(result<=0n)reasons.push('NON_POSITIVE_CONTRIBUTION');}
 }
 return Object.freeze({schema:'mls_ai_sales_profitability_v1',status:reasons.length?'BLOCKED':'READY',product_key:product.product_key,currency:product.currency,basis,
  contribution_cents:contribution,margin_bps:margin,commission_cents:commission,blocked_reasons:Object.freeze([...new Set(reasons)].sort()),
  interpretation:'PROPOSED_UNIT_CONTRIBUTION_EXCLUDES_TAX_ADS_FIXED_COSTS_RETURNS',commercial_writes:false});
}
