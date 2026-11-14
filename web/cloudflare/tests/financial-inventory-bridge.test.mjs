import test from 'node:test';
import assert from 'node:assert/strict';
import {financialDigest} from '../src/financial-event-ledger.mjs';
import {appendFinancialEvent} from '../src/financial-event-store.mjs';
import {readFinancialAutomationState} from '../src/financial-automation-store.mjs';
import {financialAccountingPeriod} from '../src/financial-accounting-schedule.mjs';
import {readFinancialInventoryWorkspace,mutateFinancialInventory,financialInventorySources} from '../src/financial-inventory-bridge.mjs';
import {mutateIncurredProduction,readIncurredProduction} from '../src/incurred-production.mjs';
import {mutatePhysicalReturns,readPhysicalReturns} from '../src/physical-returns.mjs';
import {readReturnManufacturingLinksWorkspace,mutateReturnManufacturingLinksWorkspace} from '../src/return-manufacturing-links-workspace.mjs';
import {financialTestFixture,financialTestScope,financialTestEvent} from './financial-ledger-fixture.mjs';

const uuid=n=>'10000000-0000-4000-8000-'+n.toString(16).padStart(12,'0'),scope=financialTestScope(),order='a'.repeat(64),source='b'.repeat(64),caseHash='c'.repeat(64),period=financialAccountingPeriod({kind:'MONTH',anchor:'2026-10'});
const identity={artwork:'Synthetic shirt',color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:'111',model_id:'222',sku:'synthetic-sku'};
const command=(operation,selection,revision,request=crypto.randomUUID())=>({scope,operation,selection,expected_revision:revision,request_id:request,confirmed:true,reason:'Synthetic operator verified original pieces'});
async function fixture(t){
 const f=financialTestFixture();t.after(()=>f.close());f.setTime('2026-11-13T17:00:00Z');const fixed=f.options.now;
 await mutateIncurredProduction(f.env,{revision:0,request_id:uuid(1),action:'record',record_id:uuid(2),production_ref:'SYNTHETIC-LOT',replaces_record_id:null,produced_date:'2026-10-01',quantity:100,identity,source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:1350,reference:null},evidence:'Synthetic recorded manufacture',confirmed:true},'synthetic-owner',{now:fixed});
 const ledger=await readIncurredProduction(f.env,{now:fixed});f.register=command('register-lot',{production_record_id:uuid(2),production_revision:ledger.revision,production_fingerprint:await financialDigest(ledger.records[0])},0,uuid(3));
 f.proof={scope,run_id:'synthetic-run',order_hash:order,item_id:'111',model_id:'222',quantity:80,source_hash:source,run_revision:1,checked_at:'2026-11-13T17:00:00.000Z'};f.options.resolveOriginalItem=async()=>f.proof;f.options.listOriginalItems=async()=>[f.proof];
 f.sale=await financialTestEvent({scope,source:{provider:'SHOPEE',family:'ORDER_NET_PAYOUT',native_id:order,identity:'NATIVE_ID',identity_key:null},competence_at:'2026-10-10T12:00:00.000Z'});await appendFinancialEvent(f.env,{scope,event:f.sale,expected_revision:0,request_id:uuid(4)},f.options);
 f.allocate=(quantity=80,revision=1,request=uuid(5))=>command('allocate-sale',{lot_id:uuid(2),run_id:'synthetic-run',order_hash:order,item_id:'111',model_id:'222',quantity,pieces_per_selling_unit:1,source_hash:source},revision,request);
 return f;
}
async function received(f){
 const opts={now:f.options.now};let p=await mutatePhysicalReturns(f.env,{revision:0,request_id:uuid(10),action:'register',case_hash:caseHash,order_hash:order},'synthetic-owner',{...opts,sourceCase:{case_hash:caseHash,order_hash:order,status:'ACCEPTED',checked_at:f.options.now()/1000-1,month:'2026-10',publication_revision:1}});
 p=await mutatePhysicalReturns(f.env,{revision:p.revision,request_id:uuid(11),action:'receive',case_hash:caseHash,line_id:uuid(12),receipt_ref:'SYNTHETIC-RECEIPT',quantity:2,identity},'synthetic-owner',opts);
 p=await mutatePhysicalReturns(f.env,{revision:p.revision,request_id:uuid(13),action:'inspect',case_hash:caseHash,line_id:uuid(12),partition:{resellable:1,repair:0,damaged:1,mismatch:0,quarantine:0},identity,reason:'Synthetic receipt inspected'},'synthetic-owner',opts);
 const w=await readReturnManufacturingLinksWorkspace(f.env,opts),selection={revision:0,request_id:uuid(14),action:'link',link_id:uuid(15),case_hash:caseHash,physical_line_id:uuid(12),production_record_id:uuid(2),quantity:2,physical_fingerprint:w.handles.physical[0].fingerprint,production_fingerprint:w.handles.production[0].fingerprint,evidence:'Synthetic original lot identified',confirmed:true};
 const linked=await mutateReturnManufacturingLinksWorkspace(f.env,selection,'synthetic-owner',opts);f.setTime('2026-11-13T17:00:01Z');
 return {original_allocation_id:uuid(5),case_hash:caseHash,physical_line_id:uuid(12),link_id:uuid(15),quantity:1,destination:'RESELLABLE',physical_revision:p.revision,links_revision:linked.ledger.revision};
}

test('persistent inventory uses actual manufacture cost and recognized original sales; manufacture never creates cash or payable',async t=>{
 const f=await fixture(t),choices=await readFinancialInventoryWorkspace(f.env,{scope,month:'2026-10'},f.options);assert.equal(choices.candidates.production.rows.length,1);assert.equal(choices.candidates.sales.rows.length,1);
 const a=await mutateFinancialInventory(f.env,f.register,f.options);assert.equal(a.projection.known_inventory_value_cents,135000);const b=await mutateFinancialInventory(f.env,f.allocate(),f.options);assert.equal(b.projection.remaining_quantity,20);assert.equal(b.projection.known_inventory_value_cents,27000);
 const src=await financialInventorySources(f.env,{scope,period},f.options);assert.equal(src.events.length,1);assert.equal(src.events[0].postings.find(p=>p.account==='COGS').amount_cents,108000);assert.ok(src.events[0].postings.every(p=>!['BANK','ACCOUNTS_PAYABLE'].includes(p.account)));assert.equal(src.coverage[0].state,'PARTIAL');assert.equal(src.inventory.inventory_value_cents,null);
 const stored=await readFinancialAutomationState(f.env,{scope,kind:'INVENTORY',history:true},f.options);assert.equal(stored.history.length,2);assert.equal(stored.history.at(-1).payload.allocations.length,0);assert.equal((await mutateFinancialInventory(f.env,f.register,f.options)).replayed,true);
});

test('source item limits, cost snapshots and product identity cannot be forged by the operator body',async t=>{
 const f=await fixture(t);await mutateFinancialInventory(f.env,f.register,f.options);
 await assert.rejects(mutateFinancialInventory(f.env,f.allocate(81),f.options),/ORIGINAL_COMPONENT_QUANTITY_EXCEEDED/);
 await assert.rejects(mutateFinancialInventory(f.env,{...f.allocate(),selection:{...f.allocate().selection,model_id:'333'}},f.options),/ORIGINAL_COMPONENT_IDENTITY_REQUIRED/);
 await assert.rejects(mutateFinancialInventory(f.env,{...f.allocate(),selection:{...f.allocate().selection,unit_cost_cents:1}},f.options),/REQUEST_INVALID/);
 f.proof={...f.proof,source_hash:'d'.repeat(64)};await assert.rejects(mutateFinancialInventory(f.env,f.allocate(),f.options),/ORIGINAL_ITEM_EVIDENCE_INVALID/);
 assert.equal((await readFinancialInventoryWorkspace(f.env,{scope},f.options)).revision,1);
});

test('an inspected partial return restores only its original component; damaged consumed piece is not charged again',async t=>{
 const f=await fixture(t);await mutateFinancialInventory(f.env,f.register,f.options);await mutateFinancialInventory(f.env,f.allocate(),f.options);const selection=await received(f);
 const before=await readFinancialInventoryWorkspace(f.env,{scope},f.options);assert.equal(before.candidates.returns.rows.length,1);assert.equal(before.candidates.returns.rows[0].resellable,1);assert.equal(before.candidates.returns.rows[0].damaged,1);
 const r=await mutateFinancialInventory(f.env,command('value-return',selection,2,uuid(16)),f.options);assert.equal(r.projection.remaining_quantity,21);assert.equal(r.projection.known_inventory_value_cents,28350);
 await assert.rejects(mutateFinancialInventory(f.env,command('value-return',{...selection,quantity:2},3,uuid(17)),f.options),/RETURN_PARTITION_QUANTITY_EXCEEDED/);
 const loss=await mutateFinancialInventory(f.env,command('value-return',{...selection,destination:'DAMAGED'},3,uuid(18)),f.options);assert.equal(loss.projection.remaining_quantity,21);assert.equal(loss.projection.recognitions.find(x=>x.allocation_id===uuid(18)).amount_cents,0);
 const physical=await readPhysicalReturns(f.env,{now:f.options.now});assert.equal(physical.valuation.amount_cents,null);assert.equal(physical.external_stock_write_allowed,false);
 const src=await financialInventorySources(f.env,{scope,period:financialAccountingPeriod({kind:'MONTH',anchor:'2026-11'})},f.options);assert.equal(src.events.find(e=>e.source.native_id===uuid(16)).postings.find(p=>p.account==='COGS').amount_cents,-1350);
});

test('explicit reversal appends history and restates the original competence without recognizing manufacture cash',async t=>{
 const f=await fixture(t);await mutateFinancialInventory(f.env,f.register,f.options);await mutateFinancialInventory(f.env,f.allocate(),f.options);const original=await readFinancialAutomationState(f.env,{scope,kind:'INVENTORY'},f.options),rev=command('reverse-allocation',{allocation_id:uuid(5)},2,uuid(20));
 const r=await mutateFinancialInventory(f.env,rev,f.options);assert.equal(r.projection.remaining_quantity,100);assert.equal(r.allocations.length,1);assert.equal(r.reversals.length,1);assert.equal((await mutateFinancialInventory(f.env,rev,f.options)).replayed,true);
 const src=await financialInventorySources(f.env,{scope,period},f.options);assert.equal(src.events.reduce((n,e)=>n+e.postings.filter(p=>p.account==='COGS').reduce((a,p)=>a+p.amount_cents,0),0),0);assert.equal(src.events[1].competence_at,f.sale.competence_at);assert.notEqual(src.events[1].event_at,src.events[1].competence_at);
 const history=await readFinancialAutomationState(f.env,{scope,kind:'INVENTORY',history:true},f.options);assert.deepEqual(history.history.find(h=>h.revision===2).payload,original.payload);
});

test('a manufacture source revision racing the commit defeats the same inventory transaction',async t=>{
 const f=await fixture(t),db=f.env.ADMIN_DB,prepare=db.prepare.bind(db),batch=db.batch.bind(db),sqls=new WeakMap();db.prepare=sql=>{const s=prepare(sql);sqls.set(s,sql);return s;};let armed=true;
 db.batch=async statements=>{if(armed&&statements.some(s=>sqls.get(s)?.startsWith('INSERT INTO financial_automation_revisions'))){armed=false;await db.prepare('UPDATE incurred_production_state SET revision=revision+1 WHERE id=1').run();}return batch(statements);};
 await assert.rejects(mutateFinancialInventory(f.env,f.register,f.options),/SOURCE_CHANGED/);assert.equal((await readFinancialAutomationState(f.env,{scope,kind:'INVENTORY'},f.options)).revision,0);
});

test('revocation blocks source processing and a revised sale cannot leave confirmed historical cost posted',async t=>{
 const f=await fixture(t);await mutateFinancialInventory(f.env,f.register,f.options);await mutateFinancialInventory(f.env,f.allocate(),f.options);
 await appendFinancialEvent(f.env,{scope,event:{...f.sale,quality:'REVIEW',postings:[]},expected_revision:1,request_id:uuid(30)},f.options);
 const src=await financialInventorySources(f.env,{scope,period},f.options);assert.equal(src.events[0].quality,'REVIEW');assert.deepEqual(src.events[0].postings,[]);assert.ok(src.pending.includes('INVENTORY_RECOGNITION_SOURCE_REVIEW'));
 f.revoke();await assert.rejects(readFinancialInventoryWorkspace(f.env,{scope},f.options),e=>e.status===403);
});

test('without Returns permission no receipt source is read or disclosed',async t=>{
 const f=await fixture(t);await mutateFinancialInventory(f.env,f.register,f.options);await mutateFinancialInventory(f.env,f.allocate(),f.options);const selection=await received(f);await mutateFinancialInventory(f.env,command('value-return',selection,2,uuid(40)),f.options);
 let physicalReads=0;const options={...f.options,includeReturnCandidates:false,readPhysical:async()=>{physicalReads++;throw Error('must not read');},readLinks:async()=>{physicalReads++;throw Error('must not read');}};
 const workspace=await readFinancialInventoryWorkspace(f.env,{scope},options);assert.equal(physicalReads,0);assert.equal(workspace.candidates.returns.state,'FORBIDDEN');assert.deepEqual(workspace.candidates.returns.rows,[]);assert.equal(workspace.allocations.length,1);assert.doesNotMatch(JSON.stringify(workspace),new RegExp(caseHash));
 const sources=await financialInventorySources(f.env,{scope,period:financialAccountingPeriod({kind:'MONTH',anchor:'2026-11'})},options);assert.equal(physicalReads,0);assert.deepEqual(sources.events,[]);assert.ok(sources.pending.includes('INVENTORY_RETURN_ACCESS_REQUIRED'));
 await assert.rejects(mutateFinancialInventory(f.env,command('value-return',{...selection,destination:'DAMAGED'},3,uuid(41)),options),e=>e.status===403);
});

test('inventory journal pages are bounded and share one source-head lookup instead of one call per sold piece',async t=>{
 const f=await fixture(t);await mutateFinancialInventory(f.env,f.register,f.options);for(let n=0;n<51;n++)await mutateFinancialInventory(f.env,f.allocate(1,n+1,uuid(100+n)),f.options);
 const db=f.env.ADMIN_DB,batch=db.batch.bind(db),prepare=db.prepare.bind(db);let calls=0;db.batch=async statements=>{calls++;return batch(statements);};db.prepare=sql=>{const s=prepare(sql),all=s.all.bind(s),first=s.first.bind(s);s.all=async()=>{calls++;return all();};s.first=async()=>{calls++;return first();};return s;};
 const first=await financialInventorySources(f.env,{scope,period},f.options);assert.equal(first.events.length,50);assert.equal(first.has_more,true);assert.ok(calls<=6,'bounded source calls: '+calls);const second=await financialInventorySources(f.env,{scope,period,checkpoint:first.checkpoint},f.options);assert.equal(second.events.length,1);assert.equal(second.has_more,false);assert.notEqual(first.events[0].event_id,second.events[0].event_id);assert.equal(first.inventory.remaining_quantity,49);
});

test('a later physical inspection cannot silently keep an old resale valuation confirmed',async t=>{
 const f=await fixture(t);await mutateFinancialInventory(f.env,f.register,f.options);await mutateFinancialInventory(f.env,f.allocate(),f.options);const selection=await received(f);await mutateFinancialInventory(f.env,command('value-return',selection,2,uuid(50)),f.options);
 await mutatePhysicalReturns(f.env,{revision:selection.physical_revision,request_id:uuid(51),action:'inspect',case_hash:caseHash,line_id:uuid(12),partition:{resellable:0,repair:0,damaged:2,mismatch:0,quarantine:0},identity,reason:'Synthetic later inspection corrected condition'},'synthetic-owner',{now:f.options.now});
 const src=await financialInventorySources(f.env,{scope,period:financialAccountingPeriod({kind:'MONTH',anchor:'2026-11'})},f.options);assert.equal(src.events[0].quality,'REVIEW');assert.deepEqual(src.events[0].postings,[]);assert.ok(src.pending.includes('INVENTORY_RECOGNITION_SOURCE_REVIEW'));
});
