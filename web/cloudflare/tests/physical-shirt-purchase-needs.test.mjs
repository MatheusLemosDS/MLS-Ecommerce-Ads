import test from 'node:test';
import assert from 'node:assert/strict';
import {planPhysicalShirtPurchaseNeeds as plan,PhysicalShirtPurchaseNeedsError} from '../src/physical-shirt-purchase-needs.mjs';

const A='a'.repeat(64),B='b'.repeat(64),scope={organization_id:'synthetic-org',store_id:'synthetic-store',currency:'BRL'};
const source=(ref='synthetic-evidence')=>({scope:{...scope},source_revision:3,evidence_ref:ref});
const demand=(ref,quantity=20,date='2026-11-25',variant=A)=>({...source('composition-'+ref),demand_ref:ref,component_ref:'physical-shirt-1',composition_revision:7,variant_id:variant,quantity_unallocated:quantity,needed_on:date});
const receipt=(ref='incoming-1',changes={})=>({...source('supplier-confirmation-'+ref),receipt_ref:ref,variant_id:A,supplier_id:'supplier-1',status:'CONFIRMED',ordered_quantity:5,received_quantity:0,cancelled_quantity:0,committed_quantity:0,expected_on:'2026-11-24',...changes});
const policy=(variant=A,changes={})=>({...source('policy-'+variant),variant_id:variant,supplier_id:'supplier-1',minimum_quantity:1,multiple_quantity:1,unit_cost_cents:100,shipping_cents:0,quote_ref:'per-variant-quote-'+variant,...changes});
function input(){return {schema:'physical_shirt_purchase_needs_input_v1',scope:{...scope},planning_date:'2026-11-21',demand_coverage_complete:true,receipt_coverage_complete:true,stock:{scope:{...scope},evidence_ref:'physical-counts',as_of_date:'2026-11-21',coverage_complete:true,variants:[{variant_id:A,state:'CONFIRMED',physical_usable_quantity:12,reserved_quantity:3,source_revision:4,evidence_ref:'initial-count-and-reservations'}]},demands:[demand('order-a')],receipts:[receipt()],policies:[policy()]};}
const row=value=>plan(value).variants[0];
const rejected=(value,code)=>assert.throws(()=>plan(value),error=>error instanceof PhysicalShirtPurchaseNeedsError&&error.code==='PHYSICAL_SHIRT_PURCHASE_NEEDS_'+code);
const sum=values=>values.reduce((a,b)=>a+b,0);

test('explicit unallocated20 uses physical12 minus reserved3 once and firm5 on time: shortage6',()=>{
 const view=plan(input()),value=view.variants[0];
 assert.equal(value.current_free_quantity,9);assert.equal(value.shortage_quantity,6);assert.equal(value.suggested_buy_quantity,6);
 assert.equal(value.allocations[0].from_current_free_quantity,9);assert.equal(value.allocations[0].incoming[0].quantity,5);assert.equal(value.allocations[0].shortage_quantity,6);
 assert.equal(value.goods_estimate_cents,600);assert.equal(view.total_estimate_cents,600);
 assert.equal(value.allocations[0].composition_revision,7);assert.equal(value.allocations[0].evidence_ref,'composition-order-a');
 assert.equal(value.stock_source.evidence_ref,'initial-count-and-reservations');assert.equal(value.policy_source.quote_ref,'per-variant-quote-'+A);
 assert.equal(view.external_orders_allowed,false);assert.equal(view.financial_writes_allowed,false);assert.equal(view.stock_reservations_written,false);
});
test('the same5 arriving after the deadline cannot reduce shortage11',()=>{
 const value=input();value.receipts[0].expected_on='2026-11-26';const result=row(value);
 assert.equal(result.shortage_quantity,11);assert.equal(result.allocations[0].incoming.length,0);assert.equal(result.incoming[0].used_quantity,0);assert.equal(result.incoming[0].remaining_uncommitted_quantity,5);
});
test('dated demands share one stock and receipt pool; every unit is assigned at most once',()=>{
 const value=input();value.demands.push(demand('order-b',8,'2026-11-30'));const result=row(value),allocations=result.allocations;
 assert.equal(result.known_demand_quantity,28);assert.equal(result.shortage_quantity,14);
 assert.equal(sum(allocations.map(a=>a.from_current_free_quantity)),9);
 assert.equal(sum(allocations.flatMap(a=>a.incoming.map(r=>r.quantity))),5);
 assert.equal(sum(allocations.map(a=>a.shortage_quantity)),14);
 assert.equal(result.known_demand_quantity,9+5+14);assert.equal(result.incoming[0].remaining_uncommitted_quantity,0);
});
test('allocation order is deterministic by need date and stable component identity, independent of input order',()=>{
 const value=input();value.demands=[demand('z',10,'2026-11-25'),demand('a',10,'2026-11-25'),demand('earlier',2,'2026-11-22')];value.receipts.push(receipt('incoming-2',{ordered_quantity:2,expected_on:'2026-11-23'}));
 const expected=plan(value),permuted=structuredClone(value);permuted.demands.reverse();permuted.receipts.reverse();permuted.policies.reverse();permuted.stock.variants.reverse();
 assert.deepEqual(plan(permuted),expected);assert.deepEqual(expected.variants[0].allocations.map(a=>a.demand_ref),['earlier','a','z']);
 assert.equal(expected.variants[0].allocations[0].from_current_free_quantity,2);
});
test('a partially received purchase supplies only ordered-received-cancelled-committed remaining units',()=>{
 const value=input();value.receipts=[receipt('partially-received',{status:'PARTIALLY_RECEIVED',ordered_quantity:20,received_quantity:7,cancelled_quantity:3,committed_quantity:4})];const result=row(value);
 assert.equal(result.incoming[0].quantity,6);assert.equal(result.incoming[0].used_quantity,6);assert.equal(result.shortage_quantity,5);
 assert.equal(result.allocations[0].from_current_free_quantity,9,'received pieces are already represented by the physical snapshot, not added again');
});
test('draft, already received and cancelled documents do not act as future stock',()=>{
 for(const changes of [{status:'DRAFT'},{status:'RECEIVED',received_quantity:5},{status:'CANCELLED',cancelled_quantity:5}]){
  const value=input();value.receipts=[receipt('ignored',changes)];const result=plan(value);
  assert.equal(result.variants[0].shortage_quantity,11);assert.equal(result.variants[0].incoming.length,0);assert.equal(result.ignored_receipts.length,1);
 }
});
test('supplier-confirmed but undated, overdue or unknown remaining quantities cannot create guaranteed supply',()=>{
 for(const [change,code]of [[{expected_on:null},'FIRM_RECEIPT_DATE_UNKNOWN'],[{expected_on:'2026-11-20'},'OVERDUE_RECEIPT_REQUIRES_RECONFIRMATION'],[{ordered_quantity:null},'FIRM_RECEIPT_QUANTITY_UNKNOWN']]){
  const value=input();value.receipts=[receipt('uncertain',change)];const result=row(value);
  assert.equal(result.state,'PARTIAL');assert.equal(result.shortage_quantity,null);assert.equal(result.suggested_buy_quantity,null);assert.equal(result.total_estimate_cents,null);assert.ok(result.pending.includes(code));
 }
});
test('initial stock UNKNOWN is distinct from a confirmed physical zero',()=>{
 const value=input();Object.assign(value.stock.variants[0],{state:'UNKNOWN',physical_usable_quantity:null,reserved_quantity:null});
 let result=row(value);assert.equal(result.current_free_quantity,null);assert.equal(result.shortage_quantity,null);assert.equal(result.known_demand_quantity,20);assert.equal(result.allocations[0].from_current_free_quantity,null);
 Object.assign(value.stock.variants[0],{state:'CONFIRMED',physical_usable_quantity:0,reserved_quantity:0});result=row(value);assert.equal(result.current_free_quantity,0);assert.equal(result.shortage_quantity,15);
});
test('unknown demand keeps its whole variant unresolved while independent known variants remain calculable',()=>{
 const value=input();value.demands.push(demand('unknown-order',null,'2026-11-25',B));value.stock.variants.push({variant_id:B,state:'CONFIRMED',physical_usable_quantity:2,reserved_quantity:0,source_revision:1,evidence_ref:'variant-b-count'});value.policies.push(policy(B));
 const result=plan(value);assert.equal(result.state,'PARTIAL');assert.equal(result.variants[0].shortage_quantity,6);assert.equal(result.variants[1].known_demand_quantity,null);assert.equal(result.variants[1].quantity_unallocated,null);assert.equal(result.variants[1].shortage_quantity,null);assert.equal(result.total_estimate_cents,null);assert.equal(result.known_estimate_cents,600);
});
test('missing, stale or incomplete physical evidence does not infer a zero balance',()=>{
 const absent=input();absent.stock.variants=[];assert.equal(row(absent).shortage_quantity,null);
 const stale=input();stale.stock.as_of_date='2026-11-20';assert.ok(row(stale).pending.includes('STOCK_SNAPSHOT_STALE'));
 const partial=input();partial.stock.coverage_complete=false;assert.ok(row(partial).pending.includes('STOCK_COVERAGE_PARTIAL'));
 const future=input();future.stock.as_of_date='2026-11-22';rejected(future,'STOCK_INVALID');
});
test('minimum and purchase multiples adjust the consolidated shortage and explicitly explain overbuy',()=>{
 const value=input();value.policies=[policy(A,{minimum_quantity:10,multiple_quantity:4})];const result=row(value);
 assert.equal(result.shortage_quantity,6);assert.equal(result.suggested_buy_quantity,12);assert.equal(result.overbuy_quantity,6);assert.deepEqual(result.quantity_policy,{minimum_quantity:10,multiple_quantity:4});assert.equal(result.unit_cost_cents,100);assert.equal(result.goods_estimate_cents,1200);
});
test('zero shortage creates no order or shipping charge even when minimum or price is unknown',()=>{
 const value=input();value.demands=[demand('already-allocated',0)];value.policies=[];const result=row(value);
 assert.equal(result.quantity_unallocated,0);assert.equal(result.shortage_quantity,0);assert.equal(result.suggested_buy_quantity,0);assert.equal(result.goods_estimate_cents,0);assert.equal(result.shipping_estimate_cents,0);assert.equal(result.total_estimate_cents,0);
});
test('unknown minimum/multiple never assumes a supplier pack of one',()=>{
 const value=input();value.policies=[policy(A,{multiple_quantity:null})];const result=row(value);
 assert.equal(result.shortage_quantity,6);assert.equal(result.suggested_buy_quantity,null);assert.equal(result.overbuy_quantity,null);assert.equal(result.total_estimate_cents,null);assert.ok(result.pending.includes('SUPPLIER_QUANTITY_POLICY_UNKNOWN'));
});
test('goods and freight remain distinct; an unknown freight or unit cost cannot become a final amount',()=>{
 const value=input();value.policies=[policy(A,{minimum_quantity:10,multiple_quantity:4,shipping_cents:null})];let result=row(value);
 assert.equal(result.goods_estimate_cents,1200);assert.equal(result.shipping_estimate_cents,null);assert.equal(result.total_estimate_cents,null);assert.ok(result.pending.includes('SHIPPING_UNKNOWN'));
 value.policies[0].shipping_cents=0;value.policies[0].unit_cost_cents=null;result=row(value);assert.equal(result.goods_estimate_cents,null);assert.equal(result.shipping_estimate_cents,0);assert.equal(result.total_estimate_cents,null);
 value.policies[0].unit_cost_cents=0;result=row(value);assert.equal(result.total_estimate_cents,0,'an explicit zero quote is distinct from missing cost');
});
test('a freight quote cannot be counted twice across different variant proposals',()=>{
 const value=input();value.policies.push(policy(B,{quote_ref:value.policies[0].quote_ref}));rejected(value,'POLICY_INVALID');
});
test('duplicate incoming evidence or old/new versions of the same demand component are rejected',()=>{
 const value=input();value.receipts.push({...value.receipts[0],source_revision:4});rejected(value,'RECEIPT_INVALID');
 const demandValue=input();demandValue.demands.push({...demandValue.demands[0],composition_revision:8,variant_id:B});rejected(demandValue,'DEMAND_DUPLICATE');
});
test('each evidence family is scoped to the requested organization, store and BRL currency',()=>{
 for(const path of ['stock','demand','receipt','policy']){
  const value=input(),selected=path==='stock'?value.stock:path==='demand'?value.demands[0]:path==='receipt'?value.receipts[0]:value.policies[0];selected.scope.store_id='other-synthetic-store';rejected(value,'SCOPE_MISMATCH');
 }
 const value=input();value.scope.currency='USD';rejected(value,'SCOPE_INVALID');
});
test('negative, fractional and overcommitted input quantities fail instead of being clamped',()=>{
 for(const quantity of [-1,1.5,Number.MAX_SAFE_INTEGER+1,-0]){const value=input();value.demands[0].quantity_unallocated=quantity;rejected(value,'DEMAND_INVALID');}
 const value=input();value.receipts[0].committed_quantity=6;rejected(value,'RECEIPT_QUANTITY_INVALID');
 const multiple=input();multiple.policies[0].multiple_quantity=0;rejected(multiple,'POLICY_INVALID');
});
test('quantity addition, pack rounding and monetary multiplication preserve safe integer limits',()=>{
 const demandOverflow=input();demandOverflow.demands=[demand('huge',Number.MAX_SAFE_INTEGER),demand('extra',1)];rejected(demandOverflow,'QUANTITY_OVERFLOW');
 const rounded=input();rounded.stock.variants[0].physical_usable_quantity=0;rounded.stock.variants[0].reserved_quantity=0;rounded.receipts=[];rounded.demands=[demand('huge',Number.MAX_SAFE_INTEGER)];rounded.policies=[policy(A,{multiple_quantity:2,unit_cost_cents:0})];rejected(rounded,'QUANTITY_OVERFLOW');
 const money=input();money.policies[0].unit_cost_cents=Number.MAX_SAFE_INTEGER;rejected(money,'AMOUNT_OVERFLOW');
});
test('all input is immutable evidence; no environment, database or external capability is consulted',()=>{
 const value=input(),original=structuredClone(value);const freeze=x=>{if(x&&typeof x==='object'){Object.freeze(x);for(const v of Object.values(x))freeze(v);}};freeze(value);
 const first=plan(value);assert.deepEqual(value,original);first.variants[0].allocations[0].incoming[0].quantity=999;
 const second=plan(value);assert.equal(second.variants[0].allocations[0].incoming[0].quantity,5);assert.deepEqual(value,original);
});
test('getters, sparse arrays, unexpected sales fields and excessive input volume are rejected without evaluation',()=>{
 const getter=input();let reads=0;Object.defineProperty(getter,'planning_date',{get(){reads++;return '2026-11-21';},enumerable:true});rejected(getter,'INPUT_INVALID');assert.equal(reads,0);
 const sparse=input();sparse.demands=new Array(1);rejected(sparse,'INPUT_INVALID');
 const sales=input();sales.demands[0].selling_quantity=2;rejected(sales,'DEMAND_INVALID');
 const tooMany=input();tooMany.demands=Array.from({length:1001},(_,i)=>demand('order-'+i));rejected(tooMany,'INPUT_INVALID');
});
test('overdue demand is identified as a planning backlog, not reconstructed historical availability',()=>{
 const value=input();value.demands=[demand('late',20,'2026-11-20')];const result=row(value);
 assert.equal(result.allocations[0].overdue,true);assert.equal(result.allocations[0].from_current_free_quantity,9);assert.equal(result.shortage_quantity,11);assert.equal(result.allocations[0].incoming.length,0);
});

 test('partial demand or receipt pages cannot claim a complete empty set or guaranteed shortage',()=>{
 const complete=input();complete.demands=[];const completeResult=plan(complete);assert.equal(completeResult.known_estimate_cents,0);assert.equal(completeResult.total_estimate_cents,0);
 const empty=input();empty.demands=[];empty.demand_coverage_complete=false;const missing=plan(empty);assert.equal(missing.state,'PARTIAL');assert.equal(missing.total_estimate_cents,null);assert.equal(missing.known_estimate_cents,null);assert.deepEqual(missing.variants,[]);assert.ok(missing.pending.some(row=>row.code==='DEMAND_COVERAGE_PARTIAL'));
 const receipts=input();receipts.receipt_coverage_complete=false;const value=row(receipts);assert.equal(value.shortage_quantity,null);assert.equal(value.suggested_buy_quantity,null);assert.equal(value.known_demand_quantity,20);assert.ok(value.pending.includes('RECEIPT_COVERAGE_PARTIAL'));
});
