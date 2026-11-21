import test from 'node:test';
import assert from 'node:assert/strict';
import {projectProductionMaterialWeek,ProductionMaterialWeekError} from '../src/production-material-week.mjs';
import {projectProductionMaterialWeekWorkspace} from '../src/production-material-week-view.mjs';

const materials=()=>({schema:'production_material_workspace_v1',coverage:{source_integrity_verified:true,orders_complete:true,stock_complete:true,purchases_complete:true,manufacturing_complete:true},purchases:[],orders:[]});
const receipt=(id,date,quantity)=>({purchase_id:'purchase-'+id,receipts:[{receipt_id:id,effective_date:date,reference:'synthetic-'+id,lines:[{quantity}]}]});
const consumption=(id,date,quantity,extra={})=>({source_key:'synthetic-order',consumptions:[{consumption_id:id,production_record_id:'production-'+id,variant_id:'variant-'+id,effective_date:date,quantity,status:'ACTIVE',reversed_at:null,reversed_effective_date:null,...extra}]});
const project=(frame,providers=[],extra={})=>projectProductionMaterialWeek({materials:frame,providers,providers_complete:true,week_end:'2026-11-13',...extra});

test('weekly material quantities use declared dates and leave Friday cutoff unresolved',()=>{
 const m=materials();m.purchases=[receipt('inside','2026-11-11',3),receipt('friday','2026-11-13',10)];m.orders=[consumption('used','2026-11-11',2)];
 const r=project(m);
 assert.equal(r.period.start_date,'2026-11-06');assert.equal(r.period.end_date,'2026-11-13');assert.equal(r.period.timezone,'America/Sao_Paulo');
 assert.equal(r.quantities.received_known_interior_pieces,3);assert.equal(r.quantities.received_week_pieces,null);assert.equal(r.quantities.consumed_week_pieces,2);
 assert.ok(r.pending.includes('FRIDAY_TIME_OR_ALLOCATION_REQUIRED'));
 assert.equal(r.receipts[1].friday_cutoff_pending,true);
});

test('receipt and linked-consumption coverage remain independent from missing Shopee orders and other physical movements',()=>{
 const m=materials();m.coverage.orders_complete=false;m.purchases=[receipt('received','2026-11-10',7)];
 const r=project(m);assert.equal(r.quantities.received_week_pieces,7);assert.equal(r.coverage.other_physical_movements_included,false);assert.equal(r.financial_close_approved,false);
 m.coverage.purchases_complete=false;const partial=project(m);assert.equal(partial.quantities.received_week_pieces,null);assert.equal(partial.quantities.received_known_interior_pieces,7);
});

test('weekly obligation allocations remain separate from cash dates and never become another deduction',()=>{
 const m=materials(),providers=[{provider_id:'provider',name:'Prestador sintético',revision:4,obligations:[{obligation_id:'one',week_end:'2026-11-06',amount_cents:100000,settled_cents:100000,remaining_cents:0,status:'SETTLED'},{obligation_id:'two',week_end:'2026-11-13',amount_cents:80000,settled_cents:20000,remaining_cents:60000,status:'OPEN'}],payments:[{payment_id:'payment',paid_on:'2026-11-20',status:'ACTIVE',allocations:[{obligation_id:'one',amount_cents:100000},{obligation_id:'two',amount_cents:20000}]}]}];
 const r=project(m,providers);assert.equal(r.weekly_obligations.declared_cents,80000);assert.equal(r.weekly_obligations.settled_cents,20000);assert.equal(r.weekly_obligations.outstanding_cents,60000);assert.deepEqual(r.obligations[0].allocations,[{payment_id:'payment',paid_on:'2026-11-20',status:'ACTIVE',amount_cents:20000}]);
 assert.deepEqual(r.accounting_effects,{new_expense_cents:0,new_cogs_cents:0,new_bank_movement_cents:0});assert.equal(r.money_transfer_allowed,false);assert.equal(r.external_purchase_allowed,false);assert.equal(r.financial_close_approved,false);
 const partial=project(m,providers,{providers_complete:false});assert.equal(partial.weekly_obligations.outstanding_cents,null);
});

test('a later correction preserves the original consumption and the declared correction date across weeks',()=>{
 const m=materials();m.orders=[consumption('corrected','2026-11-11',2,{status:'REVERSED',reversed_effective_date:'2026-11-17',reversed_at:'2026-11-21T10:00:00.000Z'})];
 const original=project(m),later=project(m,[],{week_end:'2026-11-20'});
 for(const r of [original,later]){assert.equal(r.reversed_consumptions.length,1);assert.equal(r.reversed_consumptions[0].effective_date,'2026-11-11');assert.equal(r.reversed_consumptions[0].reversed_effective_date,'2026-11-17');assert.equal(r.quantities.consumed_week_pieces,null);assert.ok(r.pending.includes('CONSUMPTION_CORRECTIONS_REQUIRE_ORIGINAL_AND_CORRECTION_DATE_REVIEW'));}
 assert.equal(later.receipts.length,0,'a consumption correction is not another supplier receipt');
});

test('duplicate or malformed material facts and unsafe totals fail rather than manufacture known zeros',()=>{
 const m=materials();m.purchases=[receipt('same','2026-11-11',1),receipt('same','2026-11-11',1)];assert.throws(()=>project(m),ProductionMaterialWeekError);
 m.purchases=[receipt('bad','2026-02-31',1)];assert.throws(()=>project(m),/RECEIPT_DATE_INVALID/);
 m.purchases=[receipt('large','2026-11-11',Number.MAX_SAFE_INTEGER),receipt('more','2026-11-11',1)];assert.throws(()=>project(m),/ARITHMETIC_UNSAFE/);
 m.purchases=[];m.coverage.source_integrity_verified=false;assert.throws(()=>project(m),/SOURCE_INVALID/);
});

test('weekly browser projection rejects financial authority and preserves unknown quantities',()=>{
 const frame={schema:'production_material_week_workspace_v1',scope:{organization_id:'synthetic',store_id:'synthetic'},checked_at:'2026-11-21T10:00:00.000Z',source_vector:{material_fence:'a'.repeat(64),payment_heads:'b'.repeat(64)},fence_hash:'c'.repeat(64),joint_financial_snapshot:false,report:project(materials())};
 assert.ok(projectProductionMaterialWeekWorkspace(frame));
 const unsafe=structuredClone(frame);unsafe.report.accounting_effects.new_expense_cents=100;assert.equal(projectProductionMaterialWeekWorkspace(unsafe),null);
 const close=structuredClone(frame);close.joint_financial_snapshot=true;assert.equal(projectProductionMaterialWeekWorkspace(close),null);
});
