import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStoreReturnsSummary} from '../src/store-returns-summary.mjs';
import {StoreSummaryError} from '../src/store-summary.mjs';

const runId='a'.repeat(8)+'-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const group=(order_count,payout_raw)=>({order_count,payout_raw});
const product=(item_id,order_count,with_return_orders,without_reported_return_orders,unknown_orders)=>({item_id,order_count,with_return_orders,without_reported_return_orders,unknown_orders});
const frame=changes=>({schema:'finance_store_period_v1',run_id:runId,revision:3,status:'COMPLETE',
 start_date:'2026-10-13',end_date:'2026-10-20',cutoff_at:1792510000,checked_at:1792510100,
 currency:'BRL',monetary_unit:'UNCONFIRMED',order_count:2,pages_read:1,duplicate_orders:0,returns_orders:1,
 escrow_amount_raw:'150.35',ads_recharge_or_support_raw:'0',
 items:[{item_id:'101',model_id:'1',quantity:1},{item_id:'201',model_id:'0',quantity:1}],diagnostic:null,
 returns_breakdown:{schema:'store_returns_breakdown_v1',with_return:group(1,'100.25'),
  without_reported_return:group(1,'50.1'),unknown:group(0,'0'),
  products:[product('101',1,1,0,0),product('201',1,0,1,0)]},...changes});

test('complete groups retain original expected repasses and occurrence counts without claiming refund values or profit',()=>{
 const value=buildStoreReturnsSummary(frame());
 assert.deepEqual(Object.keys(value),['schema','run_id','revision','start_date','end_date','complete','currency','with_return','without_reported_return','unknown','products','refund_amount_cents','net_profit_cents','basis']);
 assert.equal(value.schema,'store_returns_result_v1');assert.equal(value.run_id,runId);assert.equal(value.revision,3);assert.equal(value.complete,true);assert.equal(value.currency,'BRL');
 assert.deepEqual(value.with_return,{order_count:1,known_expected_repass_cents:10025,expected_repass_cents:10025});
 assert.deepEqual(value.without_reported_return,{order_count:1,known_expected_repass_cents:5010,expected_repass_cents:5010});
 assert.deepEqual(value.unknown,{order_count:0,known_expected_repass_cents:0,expected_repass_cents:0});
 assert.equal(value.refund_amount_cents,null);assert.equal(value.net_profit_cents,null);
 assert.equal(value.basis,'ORDER_RETURN_OCCURRENCE_NOT_REFUND_OR_SETTLEMENT');
});

test('unknown return coverage stays in its own group instead of being treated as without returns',()=>{
 const source=frame({returns_orders:null});source.returns_breakdown.without_reported_return=group(0,'0');source.returns_breakdown.unknown=group(1,'50.1');source.returns_breakdown.products[1]=product('201',1,0,0,1);
 const value=buildStoreReturnsSummary(source);assert.deepEqual(value.unknown,{order_count:1,known_expected_repass_cents:5010,expected_repass_cents:5010});
 assert.equal(value.without_reported_return.order_count,0);assert.equal(value.products[1].unknown_orders,1);assert.equal(value.refund_amount_cents,null);
});

test('one mixed-product order may involve several products without multiplying the group payout or store count',()=>{
 const source=frame({items:[{item_id:'101',model_id:'1',quantity:2},{item_id:'201',model_id:'0',quantity:1}]});
 source.returns_breakdown.products=[product('101',2,1,1,0),product('201',1,1,0,0)];
 const value=buildStoreReturnsSummary(source);
 assert.equal(value.with_return.order_count,1);assert.equal(value.with_return.expected_repass_cents,10025);
 assert.equal(value.products.reduce((sum,row)=>sum+row.with_return_orders,0),2);
 assert.equal(value.with_return.order_count+value.without_reported_return.order_count+value.unknown.order_count,2);
});

test('running, limited and diagnostic cohorts expose known collected references but no full-period group totals',()=>{
 for(const change of [{status:'RUNNING'},{status:'LIMIT_REACHED',pages_read:200},{status:'RUNNING',diagnostic:'STORE_PERIOD_UPSTREAM_UNAVAILABLE'}]){
  const value=buildStoreReturnsSummary(frame(change));assert.equal(value.complete,false);
  for(const name of ['with_return','without_reported_return','unknown']){assert.notEqual(value[name].known_expected_repass_cents,null);assert.equal(value[name].expected_repass_cents,null);}
  assert.equal(value.refund_amount_cents,null);assert.equal(value.net_profit_cents,null);
 }
});

test('a missing monetary field makes its entire group unknown while independent groups remain exact',()=>{
 const source=frame({escrow_amount_raw:null});source.returns_breakdown.with_return.payout_raw=null;
 const value=buildStoreReturnsSummary(source);assert.equal(value.with_return.known_expected_repass_cents,null);assert.equal(value.with_return.expected_repass_cents,null);
 assert.equal(value.without_reported_return.expected_repass_cents,5010);assert.equal(value.unknown.expected_repass_cents,0);
});

test('canonical sub-cent amounts and values beyond the BRL cent bound are unknown instead of rounded or truncated',()=>{
 for(const [raw,total] of [['100.251','150.351'],['1000000000001','1000000000051.1']]){
  const source=frame({escrow_amount_raw:total});source.returns_breakdown.with_return.payout_raw=raw;
  const value=buildStoreReturnsSummary(source);assert.equal(value.with_return.known_expected_repass_cents,null);assert.equal(value.with_return.expected_repass_cents,null);assert.equal(value.without_reported_return.expected_repass_cents,5010);
 }
});

test('exact cents preserve negative expected repasses, genuine zero and the accepted monetary bound',()=>{
 for(const [raw,total,cents] of [['0','50.1',0],['0.01','50.11',1],['0.1','50.2',10],['-0.01','50.09',-1],['-80.5','-30.4',-8050],['1000000000000','1000000000050.1',100000000000000]]){
  const source=frame({escrow_amount_raw:total});source.returns_breakdown.with_return.payout_raw=raw;
  const value=buildStoreReturnsSummary(source);assert.equal(value.with_return.known_expected_repass_cents,cents);assert.equal(value.with_return.expected_repass_cents,cents);assert.equal(value.refund_amount_cents,null);
 }
});

test('an empty complete cohort has explicit zero groups and no product occurrences',()=>{
 const source=frame({order_count:0,items:[],returns_orders:0,escrow_amount_raw:'0',returns_breakdown:{schema:'store_returns_breakdown_v1',with_return:group(0,'0'),without_reported_return:group(0,'0'),unknown:group(0,'0'),products:[]}});
 const value=buildStoreReturnsSummary(source);assert.deepEqual(value.products,[]);for(const name of ['with_return','without_reported_return','unknown'])assert.deepEqual(value[name],{order_count:0,known_expected_repass_cents:0,expected_repass_cents:0});
});

test('valid legacy frames without a breakdown remain compatible, but invalid frames fail before legacy fallback',()=>{
 const legacy=frame();delete legacy.returns_breakdown;assert.equal(buildStoreReturnsSummary(legacy),null);
 for(const source of [null,{},frame({private_order_sn:'PRIVATE'}),{...legacy,currency:'USD'},{...legacy,escrow_amount_raw:'150.350'}]){
  assert.throws(()=>buildStoreReturnsSummary(source),error=>error instanceof StoreSummaryError&&error.message==='STORE_RETURNS_FRAME_INVALID'&&error.status===502);
 }
});

test('poisoned counts, identities, extra fields and noncanonical money cannot become plausible return summaries',()=>{
 const invalid=[];
 for(const raw of ['100.250','+100.25','01','1e2',100.25]){const source=frame();source.returns_breakdown.with_return.payout_raw=raw;invalid.push(source);}
 const extra=frame();extra.returns_breakdown.refund_amount=999;invalid.push(extra);
 const wrongCount=frame();wrongCount.returns_breakdown.with_return.order_count=2;invalid.push(wrongCount);
 const wrongId=frame();wrongId.returns_breakdown.products[0].item_id='999';invalid.push(wrongId);
 const duplicate=frame();duplicate.returns_breakdown.products[1]=structuredClone(duplicate.returns_breakdown.products[0]);invalid.push(duplicate);
 for(const source of invalid)assert.throws(()=>buildStoreReturnsSummary(source),error=>error instanceof StoreSummaryError&&error.message==='STORE_RETURNS_FRAME_INVALID');
});

test('returned groups and product rows cannot mutate inputs or expose private financial record identities',()=>{
 const source=frame(),before=structuredClone(source),value=buildStoreReturnsSummary(source);
 value.with_return.order_count=999;value.products[0].unknown_orders=999;value.products.push(product('999',1,1,0,0));
 assert.deepEqual(source,before);
 for(const name of ['order_hash','order_sn','source_hash','access_token','refresh_token','ads_spend_cents','production_cost_cents'])assert.equal(Object.hasOwn(value,name),false);
});
