import test from 'node:test';
import assert from 'node:assert/strict';
import {projectIncurredProduction} from '../src/incurred-production.mjs';
import {productionWeeklyPeriod,productionWeeklyNextClose,productionWeeklyEndDates,productionWeeklyRecordHash,prepareProductionWeeklySource,buildProductionWeeklyReport,buildProductionWeeklyReportFromSource} from '../src/production-weekly-close.mjs';

const checked=Math.floor(Date.parse('2026-10-25T15:00:00Z')/1000);
const identity={artwork:null,color:null,size:null,garment_type:'UNKNOWN',fit:'UNKNOWN',confirmed:false,item_id:null,model_id:null,sku:null};
function row(index,produced_date,quantity,amount,status='ACTIVE'){
 return {record_id:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(index).padStart(12,'0'),production_ref:'Lote sintético '+index,replaces_record_id:null,produced_date,quantity,identity:{...identity},source:{kind:'MANUAL_LOT',key:null,hash:null,checked_at:null,order_hash:null,order_status:null,selling_quantity:null},cost:{state:amount===null?'UNKNOWN':'DECLARED',currency:'BRL',unit_cost_cents:amount,reference:null,inventory_value_cents:null},evidence:'Produção sintética confirmada',status,recorded_at:checked-60,updated_at:checked-60,void_reason:status==='VOID'?'Correção sintética':null};
}
function ledger(rows,revision=rows.length){
 const active=rows.filter(row=>row.status==='ACTIVE'),known=active.filter(row=>row.cost.state==='DECLARED'),unknown=active.filter(row=>row.cost.state==='UNKNOWN'),sum=(values,pick)=>values.reduce((n,row)=>n+pick(row),0),quantity=sum(active,row=>row.quantity),unknownQuantity=sum(unknown,row=>row.quantity),knownCost=sum(known,row=>row.quantity*row.cost.unit_cost_cents);
 const value={schema:'incurred_production_v1',checked_at:checked,revision,records:rows,summary:{active_records:active.length,voided_records:rows.length-active.length,produced_quantity:quantity,known_cost_quantity:quantity-unknownQuantity,unknown_cost_quantity:unknownQuantity,known_cost_cents:knownCost,total_cost_cents:active.length===0||unknownQuantity?null:knownCost,state:active.length===0?'NO_RECORDS':unknownQuantity?'PARTIAL_COSTS':'DECLARED_COSTS'},inventory_valuation:{state:'UNKNOWN',amount_cents:null},financial_integration_allowed:false,external_stock_write_allowed:false,basis:'OPERATOR_CONFIRMED_INCURRED_PRODUCTION_NOT_PAID_CASH_OR_SALES_REFERENCE'};
 assert.ok(projectIncurredProduction(value));return value;
}

test('Friday13h civil boundaries include weekends and preserve historical Brazilian DST',()=>{
 const normal=productionWeeklyPeriod('2026-10-23');assert.equal(new Date(normal.start_at*1000).toISOString(),'2026-10-16T16:00:00.000Z');assert.equal(new Date(normal.end_at*1000).toISOString(),'2026-10-23T16:00:00.000Z');
 const spring=productionWeeklyPeriod('2018-11-09');assert.equal(new Date(spring.start_at*1000).toISOString(),'2018-11-02T16:00:00.000Z');assert.equal(new Date(spring.end_at*1000).toISOString(),'2018-11-09T15:00:00.000Z');assert.equal(spring.end_at-spring.start_at,167*3600);
 const autumn=productionWeeklyPeriod('2019-02-22');assert.equal(autumn.end_at-autumn.start_at,169*3600);
 assert.throws(()=>productionWeeklyPeriod('2026-10-22'));assert.throws(()=>productionWeeklyPeriod('2026-02-30'));
});

test('an event exactly at13h belongs to the next week and month history crosses year boundaries',()=>{
 const cutoff=Date.parse('2026-10-23T16:00:00Z')/1000;
 assert.equal(productionWeeklyNextClose(cutoff-1).end_date,'2026-10-23');assert.equal(productionWeeklyNextClose(cutoff).end_date,'2026-10-30');
 assert.deepEqual(productionWeeklyEndDates('2026-11',Date.parse('2026-11-03T15:00:00Z')/1000),['2026-11-06']);
 assert.deepEqual(productionWeeklyEndDates('2026-12',Date.parse('2026-12-31T15:00:00Z')/1000),['2027-01-01','2026-12-25','2026-12-18','2026-12-11','2026-12-04']);
 assert.throws(()=>productionWeeklyEndDates('2027-01',checked));
});

test('Friday ambiguity blocks both adjacent totals; confirmed partitions conserve physical pieces and cost',async()=>{
 const friday=row(1,'2026-10-16',4,1000),saturday=row(2,'2026-10-17',2,1500),endFriday=row(3,'2026-10-23',2,500),frame=ledger([friday,saturday,endFriday]);
 const pending=await buildProductionWeeklyReport(frame,[],'2026-10-23');assert.equal(pending.known_cost_cents,3000);assert.equal(pending.total_cost_cents,null);assert.equal(pending.boundary_pending_quantity,6);assert.deepEqual(pending.pending,['BOUNDARY_TIME_REQUIRED']);
 const choices=[{record_id:friday.record_id,record_hash:await productionWeeklyRecordHash(friday),before13_quantity:1,at_or_after13_quantity:3},{record_id:endFriday.record_id,record_hash:await productionWeeklyRecordHash(endFriday),before13_quantity:2,at_or_after13_quantity:0}];
 const closed=await buildProductionWeeklyReport(frame,choices,'2026-10-23'),prior=await buildProductionWeeklyReport(frame,choices,'2026-10-16');
 assert.equal(closed.status,'RECORDED_COSTS');assert.equal(closed.total_cost_cents,7000);assert.equal(closed.produced_quantity,7);assert.equal(prior.total_cost_cents,1000);assert.equal(closed.total_cost_cents+prior.total_cost_cents,8000);
 const stale=await buildProductionWeeklyReport(frame,[{...choices[0],record_hash:'f'.repeat(64)},choices[1]],'2026-10-23');assert.equal(stale.total_cost_cents,null);assert.equal(stale.boundary_pending_quantity,4);
});

test('unknown cost and no records remain unknown while explicitly declared zero is a real zero',async()=>{
 const zero=await buildProductionWeeklyReport(ledger([row(1,'2026-10-20',1,0)]),[],'2026-10-23');assert.equal(zero.status,'RECORDED_COSTS');assert.equal(zero.total_cost_cents,0);
 const unknown=await buildProductionWeeklyReport(ledger([row(1,'2026-10-20',2,1590),row(2,'2026-10-21',3,null)]),[],'2026-10-23');assert.equal(unknown.known_cost_cents,3180);assert.equal(unknown.unknown_cost_quantity,3);assert.equal(unknown.total_cost_cents,null);
 const empty=await buildProductionWeeklyReport(ledger([]),[],'2026-10-23'),voided=await buildProductionWeeklyReport(ledger([row(1,'2026-10-20',1,1590,'VOID')],2),[],'2026-10-23');
 for(const value of [empty,voided]){assert.equal(value.status,'NO_RECORDS');assert.equal(value.total_cost_cents,null);assert.deepEqual(value.pending,['NO_PRODUCTION_RECORDS']);}
});

test('semantic fingerprints ignore unrelated revisions and prepared sources cannot be changed by caller mutations',async()=>{
 const first=row(1,'2026-10-20',2,1590),frame=ledger([first]),source=await prepareProductionWeeklySource(frame,[]),one=await buildProductionWeeklyReportFromSource(source,'2026-10-23');
 frame.records[0].cost.unit_cost_cents=9999;frame.summary.known_cost_cents=19998;frame.summary.total_cost_cents=19998;
 assert.equal((await buildProductionWeeklyReportFromSource(source,'2026-10-23')).total_cost_cents,3180);
 const two=await buildProductionWeeklyReport(ledger([row(1,'2026-10-20',2,1590),row(2,'2026-10-01',1,500)],8),[],'2026-10-23');assert.equal(one.content_hash,two.content_hash);assert.notEqual(one.source_revision,two.source_revision);
 await assert.rejects(buildProductionWeeklyReportFromSource({},'2026-10-23'));
 const open=await buildProductionWeeklyReport(ledger([row(1,'2026-10-24',1,1000)]),[],'2026-10-30');assert.equal(open.status,'OPEN');assert.equal(open.total_cost_cents,null);assert.equal(open.known_cost_cents,1000);
});
