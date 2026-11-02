import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {readIncurredProduction,mutateIncurredProduction,projectIncurredProduction,incurredProductionPeriods,incurredProductionRange} from '../src/incurred-production.mjs';

const identity={artwork:'Arte sintética',color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null};
const source={kind:'SAVED_DTF_ORDER_LINE',key:'a'.repeat(64),hash:'b'.repeat(64),checked_at:Date.parse('2027-01-26T02:59:59Z')/1000-60,order_hash:'c'.repeat(64),order_status:'CANCELLED',selling_quantity:1};
async function fixture(t,{at='2027-01-26T02:59:59Z'}={}){
 const db=new D1(),env={ADMIN_DB:db},clock={value:Date.parse(at)},now=()=>clock.value;let serial=0;
 t.after(()=>db.db.close());
 const uuid=()=>`00000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`;
 const read=()=>readIncurredProduction(env,{now});
 async function record(date,quantity,cost,{linked=false,ref='Lote sintético '+serial}={}){
  const ledger=await read(),record_id=uuid();
  return mutateIncurredProduction(env,{revision:ledger.revision,request_id:uuid(),action:'record',record_id,production_ref:ref,replaces_record_id:null,produced_date:date,quantity,identity:{...identity},source:linked?{kind:source.kind,key:source.key,hash:source.hash}:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:cost,reference:null},evidence:'SIMULADO: fabricação e custo histórico conferidos',confirmed:true},'synthetic-owner',{now,trustedSource:linked?source:null});
 }
 async function voidRecord(record_id){return mutateIncurredProduction(env,{revision:(await read()).revision,request_id:uuid(),action:'void',record_id,reason:'SIMULADO: lançamento corrigido'},'synthetic-owner',{now});}
 return {db,env,clock,read,record,voidRecord};
}

test('manufacture range includes both endpoints and ignores recording day and cancelled selling status',async t=>{
 const f=await fixture(t);await f.record('2027-01-14',1,9999);await f.record('2027-01-15',3,1250,{linked:true});await f.record('2027-01-25',2,1590);const ledger=await f.read(),before=JSON.stringify(ledger);
 const result=incurredProductionRange(ledger,{start_date:'2027-01-15',end_date:'2027-01-25'});
 assert.deepEqual(Object.keys(result),['schema','checked_at','revision','start_date','end_date','timezone','basis','summary','days']);
 assert.equal(result.schema,'incurred_production_range_v1');assert.equal(result.timezone,'America/Sao_Paulo');assert.equal(result.basis,'RECORDED_MANUFACTURE_DATE_NOT_SALES_OR_PAID_CASH');
 assert.deepEqual(result.summary,{active_records:2,voided_records:0,produced_quantity:5,known_cost_quantity:5,unknown_cost_quantity:0,known_cost_cents:6930,total_cost_cents:6930,state:'DECLARED_COSTS'});
 assert.equal(result.days.length,11);assert.equal(result.days[0].date,'2027-01-15');assert.equal(result.days.at(-1).date,'2027-01-25');assert.equal(result.days[0].summary.total_cost_cents,3750);assert.equal(result.days.at(-1).summary.total_cost_cents,3180);
 assert.equal(ledger.records.find(row=>row.produced_date==='2027-01-15').source.order_status,'CANCELLED');assert.equal(JSON.stringify(ledger),before);
 result.summary.total_cost_cents=0;result.days[0].summary.known_cost_cents=0;assert.equal(incurredProductionRange(ledger,{start_date:'2027-01-15',end_date:'2027-01-25'}).summary.total_cost_cents,6930,'the derived DTO cannot mutate stored evidence');
});

test('range distinguishes cold/empty, unknown, explicit zero and voided facts without claiming spent cash',async t=>{
 const f=await fixture(t),cold=await f.read(),range={start_date:'2027-01-15',end_date:'2027-01-25'},before=f.db.db.prepare('SELECT total_changes() AS n').get().n;
 let result=incurredProductionRange(cold,range);assert.equal(result.revision,0);assert.equal(result.summary.state,'NO_RECORDS');assert.equal(result.summary.total_cost_cents,null);assert.equal(result.days[0].summary.total_cost_cents,null);assert.equal(f.db.db.prepare('SELECT total_changes() AS n').get().n,before);
 await f.record('2027-01-15',2,0);let ledger=await f.record('2027-01-20',1,null),unknown=ledger.records.find(row=>row.cost.state==='UNKNOWN');result=incurredProductionRange(ledger,range);assert.equal(result.summary.state,'PARTIAL_COSTS');assert.equal(result.summary.known_cost_quantity,2);assert.equal(result.summary.unknown_cost_quantity,1);assert.equal(result.summary.known_cost_cents,0);assert.equal(result.summary.total_cost_cents,null);
 ledger=await f.voidRecord(unknown.record_id);result=incurredProductionRange(ledger,range);assert.equal(result.summary.state,'DECLARED_COSTS');assert.equal(result.summary.total_cost_cents,0);assert.equal(result.summary.voided_records,1);assert.equal(result.summary.produced_quantity,2);assert.equal(result.days[5].summary.state,'NO_RECORDS');assert.equal(result.days[5].summary.voided_records,1);assert.equal(ledger.financial_integration_allowed,false);
});

test('cross-month/year and leap-day ranges sum each record once and preserve immutable cost snapshots',async t=>{
 const f=await fixture(t,{at:'2028-03-01T18:00:00Z'});await f.record('2027-12-31',2,1250);await f.record('2028-01-01',1,1590);await f.record('2028-02-29',3,2140);const ledger=await f.read(),oldPeriods=incurredProductionPeriods(ledger,{month:'2028-02',week_of:'2028-03-01'});
 const cross=incurredProductionRange(ledger,{start_date:'2027-12-31',end_date:'2028-02-29'});assert.equal(cross.summary.total_cost_cents,10510);assert.equal(cross.summary.produced_quantity,6);assert.equal(cross.days.length,61);assert.equal(cross.days.at(-1).date,'2028-02-29');
 assert.equal(incurredProductionRange(ledger,{start_date:'2028-02-29',end_date:'2028-02-29'}).summary.total_cost_cents,6420);assert.deepEqual(incurredProductionPeriods(ledger,{month:'2028-02',week_of:'2028-03-01'}),oldPeriods,'the opt-in range does not amend the old month/week contract');
});

test('strict dates use the ledger BRT clock, reject future/reversed/367-day spans and never invoke accessors',async t=>{
 const f=await fixture(t),ledger=await f.read();assert.ok(incurredProductionRange(ledger,{start_date:'2026-01-25',end_date:'2027-01-25'}));assert.equal(incurredProductionRange(ledger,{start_date:'2026-01-24',end_date:'2027-01-25'}),null,'maximum is366inclusive');
 for(const selection of [null,[],{start_date:'2027-01-25',end_date:'2027-01-26'},{start_date:'2027-01-25',end_date:'2027-01-24'},{start_date:'2027-02-30',end_date:'2027-03-01'},{start_date:'2027-1-01',end_date:'2027-01-25'},{start_date:'1999-12-31',end_date:'2000-01-01'},{start_date:'2027-01-15',end_date:'2027-01-25',extra:true}])assert.equal(incurredProductionRange(ledger,selection),null);
 let accesses=0;const selection={start_date:'2027-01-15'};Object.defineProperty(selection,'end_date',{enumerable:true,get(){accesses++;throw Error('PRIVATE');}});assert.equal(incurredProductionRange(ledger,selection),null);assert.equal(accesses,0);
 f.clock.value=Date.parse('2027-01-26T03:00:00Z');assert.ok(incurredProductionRange(await f.read(),{start_date:'2027-01-26',end_date:'2027-01-26'}),'a new BRT day is allowed only by a newer saved ledger clock');
});

test('standalone frozen range helper returns the same closed DTO and rejects forged ledger totals',async t=>{
 const f=await fixture(t);const ledger=await f.record('2027-01-15',3,1590),selection={start_date:'2027-01-15',end_date:'2027-01-25'},expected=incurredProductionRange(ledger,selection);
 const context=vm.createContext({ledger:JSON.stringify(ledger),selection:JSON.stringify(selection),TextEncoder});
 vm.runInContext(projectIncurredProduction.toString()+'\n'+incurredProductionRange.toString()+'\nglobalThis.result=incurredProductionRange(JSON.parse(ledger),JSON.parse(selection));',context);assert.deepEqual(JSON.parse(JSON.stringify(context.result)),expected);
 for(const alter of [x=>x.summary.known_cost_cents=0,x=>x.records[0].quantity=4,x=>x.records[0].cost.unit_cost_cents=2140,x=>x.records[0].produced_date='2027-01-26']){const forged=structuredClone(ledger);alter(forged);assert.equal(incurredProductionRange(forged,selection),null);}
});
