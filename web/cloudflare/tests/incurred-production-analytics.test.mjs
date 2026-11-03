import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {readIncurredProduction,mutateIncurredProduction,projectIncurredProduction,incurredProductionRange} from '../src/incurred-production.mjs';
import {buildIncurredProductionAnalytics} from '../src/incurred-production-analytics.mjs';

const identity={artwork:'Arte sintética',color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null};
async function fixture(t,{at='2026-11-03T15:40:00Z'}={}){
 const db=new D1(),env={ADMIN_DB:db},clock={value:Date.parse(at)},now=()=>clock.value;let serial=0;
 t.after(()=>db.db.close());
 const uuid=()=>`00000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`;
 const read=()=>readIncurredProduction(env,{now});
 async function record(produced_date,quantity,unit_cost_cents,{cancelled=false}={}){
  const record_id=uuid(),trustedSource=cancelled?{kind:'SAVED_DTF_ORDER_LINE',key:'a'.repeat(64),hash:'b'.repeat(64),checked_at:Math.floor(now()/1000)-60,order_hash:'c'.repeat(64),order_status:'CANCELLED',selling_quantity:1}:null;
  const ledger=await mutateIncurredProduction(env,{revision:(await read()).revision,request_id:uuid(),action:'record',record_id,production_ref:'Lote sintético '+serial,replaces_record_id:null,produced_date,quantity,identity:{...identity},source:trustedSource?{kind:trustedSource.kind,key:trustedSource.key,hash:trustedSource.hash}:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents,reference:null},evidence:'SIMULADO: data e custo histórico da fabricação conferidos',confirmed:true},'synthetic-owner',{now,trustedSource});
  return {ledger,record_id};
 }
 const voidRecord=async record_id=>mutateIncurredProduction(env,{revision:(await read()).revision,request_id:uuid(),action:'void',record_id,reason:'SIMULADO: correção auditada'},'synthetic-owner',{now});
 return {db,clock,read,record,voidRecord};
}

test('daily history uses manufacture dates and frozen unit costs, with tied peaks and a genuine selected zero-cost day',async t=>{
 const f=await fixture(t);await f.record('2026-10-31',2,1590);await f.record('2026-11-01',2,1250,{cancelled:true});await f.record('2026-11-02',1,2500);await f.record('2026-11-03',1,0);
 const ledger=await f.read(),before=JSON.stringify(ledger),writes=f.db.db.prepare('SELECT total_changes() n').get().n;
 const value=buildIncurredProductionAnalytics(ledger,{month:'2026-11',selected_date:'2026-11-03'});
 assert.equal(value.schema,'incurred_production_analytics_v1');assert.equal(value.timezone,'America/Sao_Paulo');assert.equal(value.start_date,'2026-11-01');assert.equal(value.end_date,'2026-11-03');assert.equal(value.days.length,3);
 assert.deepEqual(value.history_months,['2026-11','2026-10']);assert.equal(value.summary.produced_quantity,4);assert.equal(value.summary.total_cost_cents,5000);
 assert.deepEqual(value.highest_cost,{state:'AVAILABLE',amount_cents:2500,dates:['2026-11-01','2026-11-02']});assert.deepEqual(value.highest_quantity,{state:'AVAILABLE',produced_quantity:2,dates:['2026-11-01']});
 assert.equal(value.selected_day.date,'2026-11-03');assert.equal(value.selected_day.summary.state,'DECLARED_COSTS');assert.equal(value.selected_day.summary.total_cost_cents,0);
 const october=buildIncurredProductionAnalytics(ledger,{month:'2026-10',selected_date:'2026-10-31'});assert.equal(october.days.length,31);assert.equal(october.summary.total_cost_cents,3180);assert.equal(october.days[0].summary.total_cost_cents,null);
 assert.equal(value.financial_integration_allowed,false);assert.equal(value.actual_profit_cents,null);assert.equal(JSON.stringify(ledger),before);assert.equal(f.db.db.prepare('SELECT total_changes() n').get().n,writes);
 value.summary.total_cost_cents=1;value.selected_day.summary.total_cost_cents=9;value.days[0].summary.known_cost_cents=8;
 assert.equal(buildIncurredProductionAnalytics(ledger,{month:'2026-11',selected_date:'2026-11-01'}).selected_day.summary.total_cost_cents,2500);
});

test('unknown costs block the cost peak while quantity stays usable; voids preserve audit history without manufactured totals',async t=>{
 const f=await fixture(t);let value=buildIncurredProductionAnalytics(await f.read(),{month:'2026-11',selected_date:'2026-11-02'});
 assert.equal(value.summary.state,'NO_RECORDS');assert.equal(value.summary.total_cost_cents,null);assert.equal(value.selected_day.summary.total_cost_cents,null);assert.deepEqual(value.history_months,[]);assert.deepEqual(value.highest_cost,{state:'NO_RECORDS',amount_cents:null,dates:[]});assert.deepEqual(value.highest_quantity,{state:'NO_RECORDS',produced_quantity:null,dates:[]});
 await f.record('2026-11-01',1,1590);const unknown=await f.record('2026-11-02',2,null);await f.record('2026-11-02',1,9999);await f.record('2026-11-03',1,0);
 value=buildIncurredProductionAnalytics(await f.read(),{month:'2026-11',selected_date:'2026-11-02'});
 assert.equal(value.summary.state,'PARTIAL_COSTS');assert.equal(value.summary.known_cost_cents,11589);assert.equal(value.summary.total_cost_cents,null);assert.equal(value.selected_day.summary.known_cost_cents,9999);assert.equal(value.selected_day.summary.total_cost_cents,null);
 assert.deepEqual(value.highest_cost,{state:'UNKNOWN_COSTS',amount_cents:null,dates:[]});assert.deepEqual(value.highest_quantity,{state:'AVAILABLE',produced_quantity:3,dates:['2026-11-02']});
 await f.voidRecord(unknown.record_id);value=buildIncurredProductionAnalytics(await f.read(),{month:'2026-11',selected_date:'2026-11-02'});
 assert.equal(value.summary.state,'DECLARED_COSTS');assert.equal(value.summary.total_cost_cents,11589);assert.equal(value.selected_day.summary.voided_records,1);assert.equal(value.selected_day.summary.produced_quantity,1);assert.deepEqual(value.highest_cost,{state:'AVAILABLE',amount_cents:9999,dates:['2026-11-02']});assert.deepEqual(value.highest_quantity,{state:'AVAILABLE',produced_quantity:1,dates:['2026-11-01','2026-11-02','2026-11-03']});
 const october=await f.record('2026-10-15',1,1250);await f.voidRecord(october.record_id);const voidedMonth=buildIncurredProductionAnalytics(await f.read(),{month:'2026-10',selected_date:'2026-10-15'});
 assert.equal(voidedMonth.summary.state,'NO_RECORDS');assert.equal(voidedMonth.summary.total_cost_cents,null);assert.equal(voidedMonth.summary.voided_records,1);assert.deepEqual(voidedMonth.history_months,['2026-11','2026-10']);assert.equal(voidedMonth.highest_cost.state,'NO_RECORDS');
});

test('calendar selection follows the saved Brasilia clock, clips only the open month and includes leap-day history',async t=>{
 const f=await fixture(t,{at:'2028-03-01T02:59:59Z'});await f.record('2028-02-01',1,1590);await f.record('2028-02-29',1,2140);
 const ledger=await f.read(),february=buildIncurredProductionAnalytics(ledger,{month:'2028-02',selected_date:'2028-02-29'});
 assert.equal(february.days.length,29);assert.equal(february.end_date,'2028-02-29');assert.equal(february.summary.total_cost_cents,3730);assert.equal(buildIncurredProductionAnalytics(ledger,{month:'2028-03',selected_date:'2028-03-01'}),null);
 f.clock.value=Date.parse('2028-03-01T03:00:00Z');const march=buildIncurredProductionAnalytics(await f.read(),{month:'2028-03',selected_date:'2028-03-01'});assert.equal(march.days.length,1);assert.equal(march.selected_day.summary.state,'NO_RECORDS');assert.equal(march.selected_day.summary.total_cost_cents,null);assert.deepEqual(march.history_months,['2028-02']);
});

test('the browser helper is detached, rejects mismatched inputs and never reads getters or accepts forged ledger totals',async t=>{
 const f=await fixture(t),{ledger}=await f.record('2026-11-02',2,1590),selection={month:'2026-11',selected_date:'2026-11-02'},expected=buildIncurredProductionAnalytics(ledger,selection);
 const context=vm.createContext({ledger:JSON.stringify(ledger),selection:JSON.stringify(selection),TextEncoder});
 vm.runInContext(projectIncurredProduction.toString()+'\n'+incurredProductionRange.toString()+'\n'+buildIncurredProductionAnalytics.toString()+'\nglobalThis.result=buildIncurredProductionAnalytics(JSON.parse(ledger),JSON.parse(selection));',context);
 assert.deepEqual(JSON.parse(JSON.stringify(context.result)),expected);
 for(const input of [null,[],{month:'2026-11',selected_date:'2026-10-31'},{month:'2026-11',selected_date:'2026-11-04'},{month:'2026-02',selected_date:'2026-02-30'},{month:'2026-11',selected_date:'2026-11-02',extra:true},{month:'2026-1',selected_date:'2026-01-02'}])assert.equal(buildIncurredProductionAnalytics(ledger,input),null);
 let reads=0;const getter={month:'2026-11'};Object.defineProperty(getter,'selected_date',{enumerable:true,get(){reads++;return selection.selected_date;}});assert.equal(buildIncurredProductionAnalytics(ledger,getter),null);assert.equal(reads,0);
 for(const mutate of [row=>row.summary.known_cost_cents++,row=>row.records[0].quantity++,row=>row.records[0].cost.unit_cost_cents++,row=>row.records[0].order_sn='PRIVATE_SHOULD_NOT_CROSS']){const forged=structuredClone(ledger);mutate(forged);assert.equal(buildIncurredProductionAnalytics(forged,selection),null);}
 const ledgerGetter={...ledger};Object.defineProperty(ledgerGetter,'records',{enumerable:true,get(){reads++;return ledger.records;}});assert.equal(buildIncurredProductionAnalytics(ledgerGetter,selection),null);assert.equal(reads,0);
});
