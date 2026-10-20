import {projectStorePeriodFrame} from '../../finance/src/store-period-frame.mjs';
import {StoreSummaryError} from './store-summary.mjs';

const returnsSummaryMoneyBound=100000000000000n;

// These are original expected Payment repasses grouped by whether the order
// reported a return. The group is not a refund amount or settled cash flow.
function returnsSummaryMoney(value){
 if(typeof value!=='string'||value.length>32)return null;
 const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value);
 if(!match)return null;
 let amount=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));
 if(match[1]){if(amount===0n)return null;amount=-amount;}
 return amount< -returnsSummaryMoneyBound||amount>returnsSummaryMoneyBound?null:Number(amount);
}

export function buildStoreReturnsSummary(frame){
 const source=projectStorePeriodFrame(frame);
 if(!source)throw new StoreSummaryError('STORE_RETURNS_FRAME_INVALID',502);
 if(!Object.hasOwn(source,'returns_breakdown'))return null;
 const breakdown=source.returns_breakdown,complete=source.status==='COMPLETE'&&source.diagnostic===null;
 const group=value=>{
  const known=returnsSummaryMoney(value.payout_raw);
  return {order_count:value.order_count,known_expected_repass_cents:known,
   expected_repass_cents:complete?known:null};
 };
 return {schema:'store_returns_result_v1',run_id:source.run_id,revision:source.revision,
  start_date:source.start_date,end_date:source.end_date,complete,currency:'BRL',
  with_return:group(breakdown.with_return),without_reported_return:group(breakdown.without_reported_return),
  unknown:group(breakdown.unknown),products:breakdown.products.map(product=>({...product})),
  refund_amount_cents:null,net_profit_cents:null,basis:'ORDER_RETURN_OCCURRENCE_NOT_REFUND_OR_SETTLEMENT'};
}
