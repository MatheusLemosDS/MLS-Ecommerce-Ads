import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {readIncurredProduction,mutateIncurredProduction,projectIncurredProduction,incurredProductionPeriods} from '../src/incurred-production.mjs';

const base=Date.UTC(2026,10,1,14),stamp=base/1000;
const identity=()=>({artwork:'Retrô 80',color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null});
const manual=()=>({kind:'MANUAL_LOT',key:null,hash:null});
const saved=()=>({kind:'SAVED_DTF_ORDER_LINE',key:'a'.repeat(64),hash:'b'.repeat(64),checked_at:stamp-60,order_hash:'c'.repeat(64),order_status:'READY_TO_SHIP',selling_quantity:1});
const reference=()=>({kind:'ADULT_REGULAR',revision:6,mode:'all_inclusive',unit_cost_cents:1590});
async function fixture(t){
 const db=new D1();t.after(()=>db.db.close());const env={ADMIN_DB:db},clock={time:base},now=()=>clock.time;let sequence=1;
 const uuid=()=>('00000000-0000-4000-8000-'+String(sequence++).padStart(12,'0'));
 const read=()=>readIncurredProduction(env,{now});
 const body=async overrides=>({revision:(await read()).revision,request_id:uuid(),action:'record',record_id:uuid(),production_ref:'Lote físico '+sequence,replaces_record_id:null,produced_date:'2026-10-31',quantity:3,identity:identity(),source:manual(),cost:{unit_cost_cents:1590,reference:null},evidence:'SIMULADO: conferência manual das peças produzidas',confirmed:true,...overrides});
 const mutate=(request,options={})=>mutateIncurredProduction(env,request,'synthetic-owner',{now,...options});
 const record=async(overrides={},options={})=>{const request=await body(overrides);return {request,ledger:await mutate(request,options)};};
 const voidRecord=async recordId=>mutate({revision:(await read()).revision,request_id:uuid(),action:'void',record_id:recordId,reason:'SIMULADO: declaração anterior corrigida com histórico preservado'});
 return {db,env,clock,now,uuid,read,body,mutate,record,voidRecord,advance:seconds=>clock.time+=seconds*1000};
}

test('replacement history remains one linear normalized-reference chain after repeated voids',async t=>{
 const f=await fixture(t),first=await f.record({production_ref:'Lote A',quantity:2});f.advance(1);await f.voidRecord(first.request.record_id);f.advance(1);
 const before=await f.read(),unlinked=await f.body({production_ref:'ＬＯＴＥ A',quantity:1});
 await assert.rejects(f.mutate(unlinked),error=>error.message==='INCURRED_PRODUCTION_REPLACEMENT_REQUIRED');assert.deepEqual(await f.read(),before);
 const second=await f.record({production_ref:'ＬＯＴＥ A',replaces_record_id:first.request.record_id,quantity:1,produced_date:'2026-11-01',cost:{unit_cost_cents:2000,reference:null}});f.advance(1);await f.voidRecord(second.request.record_id);f.advance(1);
 const allVoid=await f.read();assert.equal(allVoid.summary.state,'NO_RECORDS');assert.equal(allVoid.summary.total_cost_cents,null);assert.equal(allVoid.summary.voided_records,2);
 const branch=await f.body({production_ref:'lote a',replaces_record_id:first.request.record_id});await assert.rejects(f.mutate(branch),error=>error.message==='INCURRED_PRODUCTION_REPLACEMENT_INVALID');assert.deepEqual(await f.read(),allVoid);
 const third=await f.record({production_ref:'lote a',replaces_record_id:second.request.record_id,quantity:3,produced_date:'2026-11-01',cost:{unit_cost_cents:2500,reference:null}});
 assert.equal(third.ledger.records.length,3);assert.equal(third.ledger.summary.active_records,1);assert.equal(third.ledger.summary.voided_records,2);assert.equal(third.ledger.summary.produced_quantity,3);assert.equal(third.ledger.summary.total_cost_cents,7500);assert.ok(projectIncurredProduction(third.ledger));
 const originals=third.ledger.records.find(row=>row.record_id===first.request.record_id);assert.equal(originals.cost.unit_cost_cents,1590);assert.equal(originals.quantity,2);assert.equal(originals.produced_date,'2026-10-31');
});

test('the detached projector rejects branches, cycles, missing predecessors and mismatched reference history',async t=>{
 const f=await fixture(t),a=await f.record({production_ref:'Lote cadeia'});f.advance(1);await f.voidRecord(a.request.record_id);f.advance(1);
 const b=await f.record({production_ref:'Lote cadeia',replaces_record_id:a.request.record_id});f.advance(1);await f.voidRecord(b.request.record_id);f.advance(1);
 const c=await f.record({production_ref:'Lote cadeia',replaces_record_id:b.request.record_id});f.advance(1);const ledger=await f.voidRecord(c.request.record_id);
 assert.equal(ledger.summary.state,'NO_RECORDS');assert.ok(projectIncurredProduction(ledger));
 for(const alter of [
  rows=>rows.find(row=>row.record_id===b.request.record_id).replaces_record_id=b.request.record_id,
  rows=>rows.find(row=>row.record_id===c.request.record_id).replaces_record_id=a.request.record_id,
  rows=>rows.find(row=>row.record_id===a.request.record_id).replaces_record_id=c.request.record_id,
  rows=>rows.find(row=>row.record_id===c.request.record_id).replaces_record_id='ffffffff-ffff-4fff-8fff-ffffffffffff',
  rows=>rows.find(row=>row.record_id===c.request.record_id).production_ref='Outra fabricação',
  rows=>rows.find(row=>row.record_id===c.request.record_id).replaces_record_id=null,
 ]){const forged=structuredClone(ledger);alter(forged.records);assert.equal(projectIncurredProduction(forged),null);}
});

test('source selling units and later cancellation never rewrite confirmed physical quantity or the historical unit cost',async t=>{
 const f=await fixture(t),source=saved(),ref=reference(),linked={kind:source.kind,key:source.key,hash:source.hash};
 const {request,ledger}=await f.record({production_ref:'Lote fonte histórica',quantity:3,source:linked,cost:{unit_cost_cents:1590,reference:ref}},{trustedSource:source,trustedReference:ref});
 const original=structuredClone(ledger.records[0]),committedRequest=structuredClone(request);assert.equal(original.source.selling_quantity,1);assert.equal(original.quantity,3);assert.equal(ledger.summary.total_cost_cents,4770);
 f.db.db.exec('CREATE TABLE synthetic_saved_order_context(order_hash TEXT PRIMARY KEY,payload TEXT NOT NULL);CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)');
 f.db.db.prepare('INSERT INTO synthetic_saved_order_context VALUES(?,?)').run(source.order_hash,JSON.stringify(source));
 f.db.db.prepare('INSERT INTO production_costs_state VALUES(1,?,?,?)').run(6,JSON.stringify({mode:'all_inclusive',inclusive_regular_cents:1590}),new Date(base).toISOString());
 for(const status of ['CANCELLED','TO_RETURN','REFUND_PAID']){
  f.advance(1);source.order_status=status;source.selling_quantity=9;source.hash='d'.repeat(64);ref.revision=7;ref.unit_cost_cents=9900;
  f.db.db.prepare('UPDATE synthetic_saved_order_context SET payload=?').run(JSON.stringify(source));f.db.db.prepare('UPDATE production_costs_state SET revision=7,payload=?').run(JSON.stringify({mode:'all_inclusive',inclusive_regular_cents:9900}));
  const reread=await f.read();assert.deepEqual(reread.records[0],original);assert.equal(reread.summary.produced_quantity,3);assert.equal(reread.summary.total_cost_cents,4770);assert.equal(reread.inventory_valuation.amount_cents,null);assert.equal(reread.financial_integration_allowed,false);assert.equal(reread.external_stock_write_allowed,false);
 }
 f.db.db.exec('DELETE FROM synthetic_saved_order_context;DELETE FROM production_costs_state');const afterDeletion=await f.read();assert.deepEqual(afterDeletion.records[0],original);
 const replay=await f.mutate(committedRequest);assert.deepEqual(replay.records[0],original,'the identical committed request remains replayable without current source or cost reference');
});

test('unknown cost cannot be backfilled by later settings, and a reference snapshot cannot silently change amount',async t=>{
 const f=await fixture(t),unknown=await f.record({production_ref:'Lote custo não comprovado',cost:{unit_cost_cents:null,reference:null}}),frozen=structuredClone(unknown.ledger.records[0]);
 f.db.db.exec('CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)');f.db.db.prepare('INSERT INTO production_costs_state VALUES(1,?,?,?)').run(99,JSON.stringify({mode:'all_inclusive',inclusive_regular_cents:7777}),new Date(base).toISOString());f.advance(1);
 const reread=await f.read();assert.deepEqual(reread.records[0],frozen);assert.equal(reread.records[0].cost.state,'UNKNOWN');assert.equal(reread.summary.known_cost_quantity,0);assert.equal(reread.summary.unknown_cost_quantity,3);assert.equal(reread.summary.total_cost_cents,null);
 const known=await f.record({production_ref:'Lote valor confirmado',cost:{unit_cost_cents:1590,reference:reference()}},{trustedReference:reference()});
 for(const alter of [
  row=>row.cost.unit_cost_cents=2140,
  row=>row.cost.reference.unit_cost_cents=2140,
  row=>{row.cost.state='UNKNOWN';row.cost.unit_cost_cents=0;},
  row=>row.cost.inventory_value_cents=1590,
 ]){const forged=structuredClone(known.ledger),row=forged.records.find(item=>item.record_id===known.request.record_id);alter(row);assert.equal(projectIncurredProduction(forged),null);}
});

test('periods distinguish no records, confirmed zero and unknown cost using manufacture date instead of recording date',async t=>{
 const f=await fixture(t),empty=await f.read();assert.equal(empty.summary.state,'NO_RECORDS');assert.equal(empty.summary.known_cost_cents,0);assert.equal(empty.summary.total_cost_cents,null);
 const zero=await f.record({production_ref:'Lote zero explicitamente confirmado',produced_date:'2026-10-31',quantity:2,cost:{unit_cost_cents:0,reference:null}});assert.equal(zero.ledger.summary.state,'DECLARED_COSTS');assert.equal(zero.ledger.summary.total_cost_cents,0);assert.equal(zero.ledger.summary.known_cost_quantity,2);f.advance(1);
 const mixed=await f.record({production_ref:'Lote novembro custo desconhecido',produced_date:'2026-11-01',quantity:3,cost:{unit_cost_cents:null,reference:null}});assert.equal(mixed.ledger.summary.state,'PARTIAL_COSTS');assert.equal(mixed.ledger.summary.total_cost_cents,null);
 const october=incurredProductionPeriods(mixed.ledger,{month:'2026-10',week_of:'2026-11-01'});assert.deepEqual([october.monthly.start_date,october.monthly.end_date],['2026-10-01','2026-10-31']);assert.equal(october.monthly.summary.state,'DECLARED_COSTS');assert.equal(october.monthly.summary.total_cost_cents,0);assert.equal(october.monthly.summary.produced_quantity,2);
 assert.deepEqual([october.weekly.start_date,october.weekly.end_date],['2026-10-26','2026-11-01']);assert.equal(october.weekly.summary.produced_quantity,5);assert.equal(october.weekly.summary.known_cost_quantity,2);assert.equal(october.weekly.summary.unknown_cost_quantity,3);assert.equal(october.weekly.summary.total_cost_cents,null);
 const september=incurredProductionPeriods(mixed.ledger,{month:'2026-09',week_of:'2026-11-01'});assert.equal(september.monthly.summary.state,'NO_RECORDS');assert.equal(september.monthly.summary.total_cost_cents,null);assert.equal(september.monthly.summary.known_cost_cents,0);
 f.advance(1);const voided=await f.voidRecord(zero.request.record_id),afterVoid=incurredProductionPeriods(voided,{month:'2026-10',week_of:'2026-11-01'});assert.equal(afterVoid.monthly.summary.state,'NO_RECORDS');assert.equal(afterVoid.monthly.summary.voided_records,1);assert.equal(afterVoid.monthly.summary.total_cost_cents,null);
});

test('void and replacement audits preserve the full older manufacture fact rather than the corrected value',async t=>{
 const f=await fixture(t),source=saved(),ref=reference(),first=await f.record({production_ref:'Lote correção auditável',quantity:2,source:{kind:source.kind,key:source.key,hash:source.hash},cost:{unit_cost_cents:1590,reference:ref}},{trustedSource:source,trustedReference:ref}),before=structuredClone(first.ledger.records[0]);f.advance(1);
 const voided=await f.voidRecord(first.request.record_id),old=voided.records[0];assert.equal(old.status,'VOID');assert.deepEqual({...old,status:'ACTIVE',updated_at:before.updated_at,void_reason:null},before);f.advance(1);
 const replacement=await f.record({production_ref:'Lote correção auditável',replaces_record_id:before.record_id,produced_date:'2026-11-01',quantity:1,cost:{unit_cost_cents:2000,reference:null}});
 const audits=f.db.db.prepare('SELECT action,payload FROM incurred_production_audit ORDER BY revision').all().map(row=>({action:row.action,...JSON.parse(row.payload)}));assert.deepEqual(audits[1].previous_record,before);assert.equal(audits[1].new_record.status,'VOID');assert.equal(audits[1].new_record.cost.unit_cost_cents,1590);assert.equal(audits[2].previous_record,null);assert.equal(audits[2].new_record.replaces_record_id,before.record_id);assert.equal(audits[2].new_record.cost.unit_cost_cents,2000);
 assert.equal(replacement.ledger.summary.total_cost_cents,2000);assert.equal(replacement.ledger.records.length,2);assert.equal(replacement.ledger.inventory_valuation.state,'UNKNOWN');
});
