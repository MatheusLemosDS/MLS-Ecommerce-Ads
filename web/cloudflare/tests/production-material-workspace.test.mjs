import test from 'node:test';
import assert from 'node:assert/strict';
import {materialFixture} from './production-material-fixture.mjs';
import {readMaterialNeedsWorkspace,mutateMaterialNeedsWorkspace} from '../src/production-material-workspace.mjs';
import {mutatePhysicalShirtStockWorkspace} from '../src/physical-shirt-stock.mjs';
import {readIncurredProduction,mutateIncurredProduction} from '../src/incurred-production.mjs';
import {financialDigest,financialCanonicalJSON} from '../src/financial-event-ledger.mjs';
import {commercialContextFromPrincipal,bindCommercialEnvironment} from '../src/commercial-context.mjs';

const amount=(value,variant)=>value.stock.variants.find(r=>r.variant_id===variant.variant_id);
const count=f=>f.db.db.prepare('SELECT COUNT(*) AS n FROM operational_entity_revisions').get().n;
async function prepared(t,{quantity=2,count:stock=10,second=false}={}){
 const f=materialFixture(t),a=await f.seedStock({count:stock}),b=second?await f.seedStock({size:'G',count:stock}):null,order=await f.seedOrder({quantity});
 await f.map(order,[{variant_id:a.variant_id,quantity_per_unit:1},...(b?[{variant_id:b.variant_id,quantity_per_unit:1}]:[])]);return {f,a,b,order};
}
async function supplier(f,variant,patch={}){const supplier_id=crypto.randomUUID(),command=f.command('save_supplier',{supplier_id,name:'Fornecedor sintético',evidence:'Cadastro e orçamento sintéticos conferidos',policies:[{variant_id:variant.variant_id,minimum_quantity:1,multiple_quantity:1,unit_cost_cents:1000,shipping_cents:0,quote_ref:'quote-'+supplier_id,...patch}]});await f.mutate(command);return supplier_id;}
async function purchase(f,supplier_id,lines,patch={}){const purchase_id=crypto.randomUUID();await f.mutate(f.command('save_purchase',{purchase_id,supplier_id,status:'CONFIRMED',expected_on:f.planning_date,reference:'po-'+purchase_id,evidence:'Pedido de compra sintético confirmado pelo fornecedor',shipping_cents:0,lines:lines.map(v=>({variant_id:v.variant_id,quantity:v.quantity,unit_cost_cents:1000})),...patch}));return purchase_id;}
function selected(view,key){return view.orders.find(o=>o.source_key===key);}
async function orderCommand(f,action,key,patch={}){const v=await f.read(),o=selected(v,key);return f.command(action,{source_key:key,source_hash:o.source_hash,fence_hash:v.fence_hash,evidence:'Declaração física sintética conferida',...patch},o.group_revision);}
async function consume(f,key,variant,record,quantity=1){return f.mutate(await orderCommand(f,'consume_order',key,{lines:[{variant_id:variant.variant_id,production_record_id:record,quantity}]}));}
function beforeJournalWrite(f,callback){const prepare=f.db.prepare.bind(f.db),batch=f.db.batch.bind(f.db),sqls=new WeakMap();let armed=true;f.db.prepare=sql=>{const statement=prepare(sql);sqls.set(statement,sql);return statement;};f.db.batch=async statements=>{if(armed&&statements.some(s=>(sqls.get(s)||'').startsWith('INSERT INTO operational_entity_revisions'))){armed=false;await callback();}return batch(statements);};}

test('cold workspace is SELECT-only and never invents initial stock, sources or budget',async t=>{
 const f=materialFixture(t),v=await f.read();assert.equal(f.db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n,0);
 assert.equal(v.schema,'production_material_workspace_v1');assert.equal(v.coverage.orders_complete,false);assert.equal(v.coverage.provider_completeness,'NOT_PROVEN');assert.equal(v.plan,null);assert.deepEqual(v.stock.variants,[]);assert.equal(v.date_basis,'PLANNING_DATE_NOT_SHOPEE_DEADLINE');assert.ok(Object.values(v.effects).every(value=>value===false));
});
test('an unapproved physical composition remains unknown even when selling quantity and PNG SKU exist',async t=>{
 const f=materialFixture(t);await f.seedStock();const order=await f.seedOrder({quantity:4,sku:'KIT-20X30'}),v=await f.read();assert.equal(selected(v,order.source_key).material_state,'UNKNOWN');assert.equal(selected(v,order.source_key).mapping_revision,0);assert.deepEqual(selected(v,order.source_key).components,[]);assert.equal(v.plan.total_estimate_cents,null);assert.ok(v.pending.some(p=>p.code==='PHYSICAL_COMPOSITION_MAPPING_REQUIRED'));
});
test('automatic physical needs multiply approved kit components by commercial quantity and consolidate sizes',async t=>{
 const f=materialFixture(t),a=await f.seedStock({count:12}),b=await f.seedStock({size:'G',count:5}),order=await f.seedOrder({quantity:3});await f.map(order,[{variant_id:a.variant_id,quantity_per_unit:2},{variant_id:b.variant_id,quantity_per_unit:1}]);const v=await f.read(),o=selected(v,order.source_key);
 assert.deepEqual(o.components.map(c=>[c.identity.size,c.required_quantity]),[['M',6],['G',3]]);assert.equal(o.material_state,'AVAILABLE_TO_RESERVE');assert.equal(v.plan.variants.find(r=>r.variant_id===a.variant_id).known_demand_quantity,6);assert.equal(v.plan.variants.find(r=>r.variant_id===b.variant_id).known_demand_quantity,3);
 assert.equal(JSON.stringify(v).includes('SYNTHETIC-ORDER-1'),false,'raw native order IDs are not exposed by this operational DTO');
});
test('a known zero count and an unknown initial count remain distinct and block reservation appropriately',async t=>{
 const f=materialFixture(t),a=await f.seedStock({count:null}),order=await f.seedOrder();await f.map(order,[{variant_id:a.variant_id,quantity_per_unit:1}]);let v=await f.read();assert.equal(amount(v,a).physical_usable_quantity,null);assert.equal(selected(v,order.source_key).material_state,'UNKNOWN');assert.equal(v.plan.variants[0].shortage_quantity,null);
 await assert.rejects(f.reserve(order.source_key),/NOT_RESERVABLE/);
 await mutatePhysicalShirtStockWorkspace(f.env,{operation:'initial_count',variant_id:a.variant_id,expected_revision:1,request_id:crypto.randomUUID(),confirmed:true,expected_scope:f.scope,selection:{quantity:0,effective_date:f.planning_date,evidence:'Contagem explícita zero',reference:'known-zero'}},'synthetic-owner',f.options);
 v=await f.read();assert.equal(amount(v,a).physical_usable_quantity,0);assert.equal(v.plan.variants[0].shortage_quantity,2);assert.equal(selected(v,order.source_key).material_state,'SHORTAGE');
});
test('kit reservation is atomic across variants, preserves physical count and retries exactly once',async t=>{
 const {f,a,b,order}=await prepared(t,{second:true});const command=await orderCommand(f,'reserve_order',order.source_key),before=count(f);const result=await f.mutate(command);assert.equal(result.orders[0].material_state,'RESERVED');assert.equal(amount(result,a).physical_usable_quantity,10);assert.equal(amount(result,b).reserved_quantity,2);
 assert.equal(count(f),before+3,'one group plus two stock revisions');const replay=await f.mutate(command);assert.equal(replay.mutation.replayed,true);assert.equal(count(f),before+3);
 await assert.rejects(f.mutate({...command,request_id:crypto.randomUUID()}),/REVISION_CONFLICT/);
});
test('two competing orders cannot reserve the same free material or duplicate the kit with new request IDs',async t=>{
 const {f,a,order}=await prepared(t,{count:3,quantity:2}),other=await f.seedOrder({order_id:'SYNTHETIC-ORDER-2',quantity:2});const old=await orderCommand(f,'reserve_order',other.source_key);await f.reserve(order.source_key);
 await assert.rejects(f.mutate(old),/PREVIEW_CHANGED/);const v=await f.read();assert.equal(selected(v,other.source_key).material_state,'SHORTAGE');assert.equal(amount(v,a).reserved_quantity,2);assert.equal(amount(v,a).free_quantity,1);
});
test('stock reserved for a demand is deducted from free supply only once in purchasing needs',async t=>{
 const {f,a,order}=await prepared(t,{count:5,quantity:2}),other=await f.seedOrder({order_id:'SYNTHETIC-ORDER-2',quantity:4});await f.reserve(order.source_key);const v=await f.read(),line=v.plan.variants.find(r=>r.variant_id===a.variant_id);assert.equal(line.reserved_quantity,2);assert.equal(line.current_free_quantity,3);assert.equal(line.quantity_unallocated,4);assert.equal(line.shortage_quantity,1);assert.equal(selected(v,other.source_key).components[0].quantity_unallocated,4);
});
test('mapping changes never silently repurpose a reservation or manufacture from a new composition',async t=>{
 const {f,a,b,order}=await prepared(t,{second:true});await f.reserve(order.source_key);await f.mutate(f.command('save_mapping',{item_id:order.item_id,model_id:order.model_id,components:[{variant_id:b.variant_id,quantity_per_unit:2}],evidence:'Composição corrigida exige rever reservas'},1));const v=await f.read();assert.equal(v.orders[0].material_state,'REVIEW');assert.equal(amount(v,a).reserved_quantity,2);await assert.rejects(f.reserve(order.source_key),/NOT_RESERVABLE/);
});
test('after explicit release, a corrected composition can be reserved as a new generation without discarding the old one',async t=>{
 const {f,a,b,order}=await prepared(t,{second:true});await f.reserve(order.source_key);await f.mutate(f.command('save_mapping',{item_id:order.item_id,model_id:order.model_id,components:[{variant_id:b.variant_id,quantity_per_unit:2}],evidence:'Composição física corrigida e conferida'},1));await f.mutate(await orderCommand(f,'release_order',order.source_key));const v=await f.reserve(order.source_key);assert.equal(v.orders[0].material_state,'RESERVED');assert.equal(amount(v,a).reserved_quantity,0);assert.equal(amount(v,b).reserved_quantity,4);const latest=JSON.parse(f.db.db.prepare("SELECT payload FROM operational_entity_revisions WHERE kind='MATERIAL_ORDER_RESERVATION' ORDER BY revision DESC LIMIT 1").get().payload);assert.equal(latest.previous_generations.length,1);assert.equal(latest.previous_generations[0].components.length,2);assert.equal(latest.generation,2);
});
test('unregistered suppliers and unknown prices are not inferred from financial shirt costs',async t=>{
 const {f,a}=await prepared(t,{quantity:4,count:1});let v=await f.read(),p=v.plan.variants[0];assert.equal(p.shortage_quantity,3);assert.equal(p.unit_cost_cents,null);assert.equal(p.total_estimate_cents,null);assert.ok(p.pending.includes('SUPPLIER_UNKNOWN'));
 await supplier(f,a,{unit_cost_cents:null,shipping_cents:null});v=await f.read();p=v.plan.variants[0];assert.equal(p.goods_estimate_cents,null);assert.equal(p.shipping_estimate_cents,null);assert.equal(p.total_estimate_cents,null);
});
test('registered supplier minimum, pack and explicit quote produce a reviewable purchase list without ordering',async t=>{
 const {f,a}=await prepared(t,{quantity:6,count:1});await supplier(f,a,{minimum_quantity:10,multiple_quantity:4,unit_cost_cents:1250,shipping_cents:200});const v=await f.read(),p=v.plan.variants[0];assert.equal(p.shortage_quantity,5);assert.equal(p.suggested_buy_quantity,12);assert.equal(p.goods_estimate_cents,15000);assert.equal(p.total_estimate_cents,15200);assert.equal(v.purchases.length,0);assert.equal(v.effects.external_purchase_allowed,false);
});
test('conflicting supplier choices stay pending instead of choosing a generated or cheapest supplier',async t=>{
 const {f,a}=await prepared(t,{quantity:3,count:1});await supplier(f,a,{unit_cost_cents:900});await supplier(f,a,{unit_cost_cents:800});const v=await f.read();assert.equal(v.plan.variants[0].supplier_id,null);assert.equal(v.plan.variants[0].total_estimate_cents,null);assert.ok(v.pending.some(p=>p.code==='SUPPLIER_CHOICE_REQUIRED'));
});
test('future confirmed receipts count only before the selected need date and never create future physical stock',async t=>{
 const {f,a}=await prepared(t,{quantity:6,count:1}),who=await supplier(f,a);await purchase(f,who,[{variant_id:a.variant_id,quantity:3}],{expected_on:'2026-11-22'});
 let v=await f.read();assert.equal(v.plan.variants[0].shortage_quantity,5);assert.equal(amount(v,a).physical_usable_quantity,1);
 v=await readMaterialNeedsWorkspace(f.env,{planning_date:'2026-11-22'},f.options);assert.equal(v.planning_date,'2026-11-22');assert.equal(v.plan.planning_date,'2026-11-21','plan baseline is actual observation date');assert.equal(v.plan.stock_source.as_of_date,'2026-11-21');assert.equal(v.plan.variants[0].shortage_quantity,2);assert.equal(amount(v,a).physical_usable_quantity,1);
});
test('draft or cancelled purchases are not usable receipts, even when a price is known',async t=>{
 const {f,a}=await prepared(t,{quantity:6,count:1}),who=await supplier(f,a),po=await purchase(f,who,[{variant_id:a.variant_id,quantity:3}],{status:'DRAFT'});let v=await f.read();assert.equal(v.plan.variants[0].shortage_quantity,5);
 await f.mutate(f.command('cancel_purchase',{purchase_id:po,reason:'Cancelamento sintético explícito',evidence:'Fornecedor confirmou cancelamento'},1));v=await f.read();assert.equal(v.purchases[0].status,'CANCELLED');assert.equal(v.plan.variants[0].shortage_quantity,5);
});
test('partial physical receipt updates purchase and stock in one transaction, without double counting future supply',async t=>{
 const {f,a}=await prepared(t,{quantity:6,count:1}),who=await supplier(f,a),po=await purchase(f,who,[{variant_id:a.variant_id,quantity:4}]);let v=await f.read();assert.equal(v.plan.variants[0].shortage_quantity,1);
 const command=f.command('confirm_receipt',{purchase_id:po,receipt_id:crypto.randomUUID(),effective_date:f.planning_date,reference:'synthetic-delivery-1',evidence:'Duas peças lisas recebidas e contadas',lines:[{variant_id:a.variant_id,quantity:2}],fence_hash:v.fence_hash},1),before=count(f);v=await f.mutate(command);
 assert.equal(amount(v,a).physical_usable_quantity,3);assert.equal(v.purchases[0].lines[0].received_quantity,2);assert.equal(v.purchases[0].status,'PARTIALLY_RECEIVED');assert.equal(v.plan.variants[0].shortage_quantity,1,'received and future remaining pieces count once each');assert.equal(count(f),before+2);
 assert.equal((await f.mutate(command)).mutation.replayed,true);assert.equal(count(f),before+2);await assert.rejects(f.mutate({...command,request_id:crypto.randomUUID(),expected_revision:2,fence_hash:v.fence_hash}),/ALREADY_RECORDED/);
});
test('a two-variant delivery fails without any partial physical receipt when one opening count is unknown',async t=>{
 const f=materialFixture(t),a=await f.seedStock({count:1}),b=await f.seedStock({size:'G',count:null}),who=await supplier(f,a),po=await purchase(f,who,[{variant_id:a.variant_id,quantity:2},{variant_id:b.variant_id,quantity:3}]);const v=await f.read(),before=count(f);
 await assert.rejects(f.mutate(f.command('confirm_receipt',{purchase_id:po,receipt_id:crypto.randomUUID(),effective_date:f.planning_date,reference:'failed-delivery',evidence:'Tentativa de entrega sem saldo inicial confirmado',lines:[{variant_id:a.variant_id,quantity:2},{variant_id:b.variant_id,quantity:3}],fence_hash:v.fence_hash},1)),/INITIAL_COUNT_REQUIRED/);
 const after=await f.read();assert.equal(count(f),before);assert.equal(amount(after,a).physical_usable_quantity,1);assert.equal(after.purchases[0].receipts.length,0);assert.equal(after.purchases[0].lines[0].received_quantity,0);
});
test('receipt beyond ordered quantity or in the future is rejected without recording another delivery',async t=>{
 const {f,a}=await prepared(t),who=await supplier(f,a),po=await purchase(f,who,[{variant_id:a.variant_id,quantity:2}]),v=await f.read(),base={purchase_id:po,receipt_id:crypto.randomUUID(),effective_date:f.planning_date,reference:'invalid-delivery',evidence:'Tentativa sintética inválida',lines:[{variant_id:a.variant_id,quantity:3}],fence_hash:v.fence_hash};
 await assert.rejects(f.mutate(f.command('confirm_receipt',base,1)),/EXCEEDS_OPEN_QUANTITY/);await assert.rejects(f.mutate(f.command('confirm_receipt',{...base,effective_date:'2026-11-22'},1)),/REQUEST_INVALID/);
});
test('source changes after a reservation preview are fenced and leave both shirt variants untouched',async t=>{
 const {f,a,b,order}=await prepared(t,{second:true}),command=await orderCommand(f,'reserve_order',order.source_key),before=count(f);
 f.db.db.prepare("UPDATE production_dtf_orders SET status='CANCELLED' WHERE order_id='SYNTHETIC-ORDER-1'").run();await assert.rejects(f.mutate(command),/ORDER_SOURCE_CHANGED|PREVIEW_CHANGED/);const v=await f.read();assert.equal(count(f),before);assert.equal(amount(v,a).reserved_quantity,0);assert.equal(amount(v,b).reserved_quantity,0);
});
test('an order source changed at the final transaction boundary aborts the whole kit reservation',async t=>{
 const {f,a,b,order}=await prepared(t,{second:true}),command=await orderCommand(f,'reserve_order',order.source_key);beforeJournalWrite(f,async()=>{const row=f.db.db.prepare('SELECT payload FROM production_dtf_lines WHERE unit_key=?').get(order.source_key),payload=JSON.stringify({...JSON.parse(row.payload),quantity:3});f.db.db.prepare('UPDATE production_dtf_lines SET payload=?,source_hash=? WHERE unit_key=?').run(payload,await financialDigest(payload),order.source_key);});
 await assert.rejects(f.mutate(command),e=>e.status===409&&/SOURCE_CHANGED/.test(e.message));const v=await f.read();assert.equal(amount(v,a).reserved_quantity,0);assert.equal(amount(v,b).reserved_quantity,0);assert.equal(v.orders[0].group_revision,0);assert.equal(v.orders[0].commercial_quantity,3);
});
test('a new stock entity created after observation invalidates the collection fence without losing that concurrent fact',async t=>{
 const {f,a,b,order}=await prepared(t,{second:true}),command=await orderCommand(f,'reserve_order',order.source_key);beforeJournalWrite(f,()=>f.seedStock({color:'Azul novo',count:0}));await assert.rejects(f.mutate(command),e=>e.status===409&&/SOURCE_CHANGED/.test(e.message));const v=await f.read();assert.equal(v.stock.variants.length,3);assert.equal(amount(v,a).reserved_quantity,0);assert.equal(amount(v,b).reserved_quantity,0);assert.equal(v.orders[0].group_revision,0);
});
test('manufacturing is required for consumption; DTF print/export status alone cannot consume material',async t=>{
 const {f,a,order}=await prepared(t);await f.reserve(order.source_key);const before=count(f);await assert.rejects(consume(f,order.source_key,a,crypto.randomUUID()),/MANUFACTURING_SOURCE_UNAVAILABLE/);const v=await f.read();assert.equal(count(f),before);assert.equal(amount(v,a).physical_usable_quantity,10);assert.equal(amount(v,a).reserved_quantity,2);assert.equal(v.manufacturing_records.length,0);
});
test('a confirmed matching production record consumes reserved physical pieces once without financial deduction',async t=>{
 const {f,a,order}=await prepared(t);await f.reserve(order.source_key);const current=selected(await f.read(),order.source_key),record=await f.seedManufacturing(current,a,{quantity:2}),command=await orderCommand(f,'consume_order',order.source_key,{lines:[{variant_id:a.variant_id,production_record_id:record,quantity:2}]}),before=count(f);let v=await f.mutate(command);
 assert.equal(amount(v,a).physical_usable_quantity,8);assert.equal(amount(v,a).reserved_quantity,0);assert.equal(v.orders[0].material_state,'CONSUMED');assert.equal(v.manufacturing_records[0].available_quantity,0);assert.equal(v.orders[0].consumptions[0].production_record_id,record);assert.equal(v.effects.financial_integration_allowed,false);assert.equal((await f.mutate(command)).mutation.replayed,true);assert.equal(count(f),before+3);
 assert.equal(f.db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND (name LIKE 'financial_%' OR name LIKE '%bank%' OR name LIKE '%expense%')").get().n,0);
});
test('twenty manufacturing links fit the fifty-request Worker budget without splitting the atomic consumption',async t=>{
 const {f,a,order}=await prepared(t,{quantity:20,count:30});await f.reserve(order.source_key);const current=selected(await f.read(),order.source_key),lines=[];for(let n=0;n<20;n++)lines.push({variant_id:a.variant_id,production_record_id:await f.seedManufacturing(current,a),quantity:1});const command=await orderCommand(f,'consume_order',order.source_key,{lines});
 let calls=0;const batch=f.db.batch.bind(f.db),prepare=f.db.prepare.bind(f.db);f.db.batch=async statements=>{calls++;return batch(statements);};f.db.prepare=sql=>{const statement=prepare(sql),first=statement.first.bind(statement),all=statement.all.bind(statement);statement.first=async()=>{calls++;return first();};statement.all=async()=>{calls++;return all();};return statement;};
 const v=await f.mutate(command);assert.ok(calls<=50,'native D1 subrequests '+calls+' exceed the fifty-request Worker budget');assert.equal(v.orders[0].material_state,'CONSUMED');assert.equal(amount(v,a).physical_usable_quantity,10);assert.equal(v.manufacturing_records.filter(r=>r.available_quantity===0).length,20);assert.equal(v.effects.financial_integration_allowed,false);
});
test('a manufacturing record voided at the final transaction boundary cannot be consumed by stale proof',async t=>{
 const {f,a,order}=await prepared(t);await f.reserve(order.source_key);const current=selected(await f.read(),order.source_key),record=await f.seedManufacturing(current,a),command=await orderCommand(f,'consume_order',order.source_key,{lines:[{variant_id:a.variant_id,production_record_id:record,quantity:1}]});
 beforeJournalWrite(f,async()=>{const ledger=await readIncurredProduction(f.env,f.options);await mutateIncurredProduction(f.env,{revision:ledger.revision,request_id:crypto.randomUUID(),action:'void',record_id:record,reason:'Retificação concorrente sintética'},'synthetic-owner',f.options);});
 await assert.rejects(f.mutate(command),e=>e.status===409&&/SOURCE_CHANGED/.test(e.message));const v=await f.read();assert.equal(amount(v,a).physical_usable_quantity,10);assert.equal(amount(v,a).reserved_quantity,2);assert.equal(v.orders[0].consumptions.length,0);assert.equal(v.manufacturing_records.length,0);
});
test('wrong source, variant identity or excess manufacturing quantity cannot be applied as consumption',async t=>{
 const {f,a,b,order}=await prepared(t,{second:true});await f.reserve(order.source_key);const current=selected(await f.read(),order.source_key),record=await f.seedManufacturing(current,a,{quantity:1});await assert.rejects(consume(f,order.source_key,b,record),/UNPROVEN/);await assert.rejects(consume(f,order.source_key,a,record,2),/UNPROVEN/);assert.equal(amount(await f.read(),a).physical_usable_quantity,10);
});
test('active manufacturing links prevent void; an explicit blank-stock correction reverses links and permits a later audited void',async t=>{
 const {f,a,order}=await prepared(t);await f.reserve(order.source_key);const current=selected(await f.read(),order.source_key),record=await f.seedManufacturing(current,a);await consume(f,order.source_key,a,record);let ledger=await readIncurredProduction(f.env,f.options);
 const voidCommand={revision:ledger.revision,request_id:crypto.randomUUID(),action:'void',record_id:record,reason:'Correção sintética documentada'};await assert.rejects(mutateIncurredProduction(f.env,voidCommand,'synthetic-owner',f.options),e=>e.status===409&&/MATERIAL_LINK_ACTIVE/.test(e.message));
 let v=await f.read(),o=selected(v,order.source_key),reverse=await orderCommand(f,'reverse_consumption',order.source_key,{consumption_id:o.consumptions[0].consumption_id,effective_date:f.planning_date,reason:'O consumo foi registrado incorretamente',blank_stock_confirmed:true});
 await assert.rejects(f.mutate({...reverse,blank_stock_confirmed:false}),/BLANK_STOCK_CORRECTION_CONFIRMATION_REQUIRED/);assert.equal(amount(await f.read(),a).physical_usable_quantity,9);
 v=await f.mutate(reverse);assert.equal(amount(v,a).physical_usable_quantity,10);assert.equal(v.orders[0].consumptions[0].status,'REVERSED');assert.equal(v.orders[0].consumptions[0].reversed_effective_date,f.planning_date);assert.equal(v.manufacturing_records[0].available_quantity,1);assert.equal((await f.mutate(reverse)).mutation.replayed,true);
 ledger=await mutateIncurredProduction(f.env,voidCommand,'synthetic-owner',f.options);assert.equal(ledger.records[0].status,'VOID');assert.equal(amount(await f.read(),a).physical_usable_quantity,10,'void itself never restores physical stock');
});
test('after a corrected consumption, reservation tops up only missing pieces using a new audited generation',async t=>{
 const {f,a,order}=await prepared(t);await f.reserve(order.source_key);const current=selected(await f.read(),order.source_key),record=await f.seedManufacturing(current,a);await consume(f,order.source_key,a,record);let v=await f.read();await f.mutate(await orderCommand(f,'reverse_consumption',order.source_key,{consumption_id:v.orders[0].consumptions[0].consumption_id,effective_date:f.planning_date,reason:'Registro incorreto; peças permanecem lisas',blank_stock_confirmed:true}));
 v=await f.reserve(order.source_key);assert.equal(v.orders[0].material_state,'RESERVED');const physical=amount(v,a);assert.equal(physical.physical_usable_quantity,10);assert.equal(physical.reserved_quantity,2);assert.equal(physical.reservations.length,2);assert.deepEqual(physical.reservations.map(r=>r.quantity),[2,1]);
});
test('release is explicit and never consumes or prints garments',async t=>{
 const {f,a,order}=await prepared(t);await f.reserve(order.source_key);const command=await orderCommand(f,'release_order',order.source_key);const v=await f.mutate(command);assert.equal(amount(v,a).physical_usable_quantity,10);assert.equal(amount(v,a).reserved_quantity,0);assert.equal(v.orders[0].material_state,'AVAILABLE_TO_RESERVE');assert.equal(v.manufacturing_records.length,0);assert.equal((await f.mutate(command)).mutation.replayed,true);
});
test('a changed or absent local order remains reviewable and its old reservation can still be released',async t=>{
 const {f,a,order}=await prepared(t);await f.reserve(order.source_key);f.db.db.prepare('DELETE FROM production_dtf_lines WHERE unit_key=?').run(order.source_key);let v=await f.read();assert.equal(v.orders[0].material_state,'REVIEW');assert.equal(v.orders[0].status,'MISSING');v=await f.mutate(await orderCommand(f,'release_order',order.source_key));assert.equal(amount(v,a).reserved_quantity,0);assert.equal(amount(v,a).physical_usable_quantity,10);
});
test('unsafe fields, missing confirmation, money values masquerading as balances and old scoped drafts are rejected',async t=>{
 const f=materialFixture(t),a=await f.seedStock(),order=await f.seedOrder(),body=f.command('save_mapping',{item_id:order.item_id,model_id:order.model_id,components:[{variant_id:a.variant_id,quantity_per_unit:1}],evidence:'Composição sintética'});
 for(const wrong of [{...body,confirmed:false},{...body,physical_quantity:999},{...body,expected_scope:{...f.scope,store_id:'another-store'}},{...body,components:[{variant_id:a.variant_id,quantity_per_unit:0.5}]}])await assert.rejects(f.mutate(wrong));
 const getter={...body};Object.defineProperty(getter,'components',{enumerable:true,get(){throw Error('getter must not execute');}});await assert.rejects(f.mutate(getter),/REQUEST_INVALID/);assert.equal((await f.read()).mappings.length,0);
});
test('read-only commercial capabilities cannot install manufacturing triggers or mutate an operational entity',async t=>{
 const f=materialFixture(t),principal={kind:'account',userId:'synthetic-owner',organizationId:'synthetic-org',storeId:'synthetic-store',sessionId:'synthetic-session',membershipId:'synthetic-member',role:'OWNER',authorizationRevision:1,capabilities:['production.read']},context=await commercialContextFromPrincipal(principal),env=bindCommercialEnvironment({ACCOUNT_DB:f.db},context,{authorizationGuard:()=>({sql:'SELECT 1',bindings:[]})});
 const v=await readMaterialNeedsWorkspace(env,{planning_date:f.planning_date},f.options);assert.equal(v.scope.store_id,'synthetic-store');await assert.rejects(mutateMaterialNeedsWorkspace(env,{...f.command('save_supplier',{supplier_id:crypto.randomUUID(),name:'Forbidden',evidence:'No permission',policies:[]}),expected_scope:v.scope},'synthetic-owner',f.options),e=>e.status===403);assert.equal(f.db.db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table'").get().n,0);
});
test('authorization revoked before schema writes leaves a cold workspace untouched',async t=>{
 const f=materialFixture(t);await assert.rejects(mutateMaterialNeedsWorkspace(f.env,f.command('save_supplier',{supplier_id:crypto.randomUUID(),name:'Supplier',evidence:'Explicit synthetic source',policies:[]}),'synthetic-owner',{...f.options,assertAuthorized:({action})=>action!=='write'}),e=>e.status===403);assert.equal(f.db.db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table'").get().n,0);
});
test('manufacturing created during a GET invalidates the final source vector instead of returning a mixed snapshot',async t=>{
 const {f,a,order}=await prepared(t);const original=f.db.prepare.bind(f.db),batch=f.db.batch.bind(f.db),sqls=new WeakMap();let reads=0,armed=true;f.db.prepare=sql=>{const statement=original(sql);sqls.set(statement,sql);return statement;};f.db.batch=async statements=>{const result=await batch(statements);if(statements.some(s=>(sqls.get(s)||'').includes('FROM production_dtf_lines l JOIN production_dtf_orders o')&&(sqls.get(s)||'').includes('ORDER BY l.unit_key'))){reads++;if(armed&&reads===2){armed=false;await f.seedManufacturing(order,a);}}return result;};
 await assert.rejects(f.read(),e=>e.status===409&&/SOURCE_CHANGED/.test(e.message));
});
test('malformed or changed saved payloads cannot become a valid physical demand',async t=>{
 const {f,order}=await prepared(t);f.db.db.prepare("UPDATE production_dtf_lines SET payload='{}' WHERE unit_key=?").run(order.source_key);const v=await f.read();assert.equal(v.coverage.orders_complete,false);assert.equal(v.orders.length,0);assert.equal(v.plan,null);
});
test('an individually proven order can reserve and consume while another saved order is corrupt; aggregate remains unknown',async t=>{
 const {f,a,order}=await prepared(t),other=await f.seedOrder({order_id:'SYNTHETIC-CORRUPT-OTHER'});f.db.db.prepare("UPDATE production_dtf_lines SET payload='{}' WHERE unit_key=?").run(other.source_key);let v=await f.read();assert.equal(v.coverage.orders_complete,false);assert.equal(v.plan,null);assert.equal(selected(v,order.source_key).material_state,'AVAILABLE_TO_RESERVE');v=await f.reserve(order.source_key);assert.equal(selected(v,order.source_key).material_state,'RESERVED');assert.equal(v.plan,null);
 const current=selected(v,order.source_key),record=await f.seedManufacturing(current,a),result=await consume(f,order.source_key,a,record);assert.equal(amount(result,a).physical_usable_quantity,9);assert.equal(result.coverage.orders_complete,false);assert.equal(result.plan,null);await assert.rejects(f.mutate(f.command('reserve_order',{source_key:other.source_key,source_hash:other.source_hash,fence_hash:result.fence_hash,evidence:'Pedido inválido não pode virar demanda'})),/ORDER_SOURCE_CHANGED/);
});
test('capacity exhaustion is explicit and never projects omitted orders or variants as empty complete inventory',async t=>{
 const f=materialFixture(t);await f.seedStock({count:0});const key=await financialDigest(['operational-journal-v1',f.scope]),stamp='2026-11-21T12:00:00.000Z',head=f.db.db.prepare('INSERT INTO operational_entity_heads VALUES(?,?,?,1)'),row=f.db.db.prepare('INSERT INTO operational_entity_revisions VALUES(?,?,?,1,?,?,NULL,?,?,?)');
 for(let n=0;n<1000;n++){const entity=crypto.randomUUID(),payload=financialCanonicalJSON({schema:'production_material_supplier_v1',supplier_id:entity,name:'Fornecedor sintético '+n,evidence:'Cadastro sintético de capacidade',policies:[],updated_at:stamp});head.run(key,'MATERIAL_SUPPLIER',entity);row.run(key,'MATERIAL_SUPPLIER',entity,payload,await financialDigest(payload),'{}','synthetic-owner',stamp);}
 const v=await f.read();assert.equal(v.coverage.stock_complete,false);assert.equal(v.coverage.suppliers_complete,false);assert.equal(v.plan,null);assert.ok(v.pending.some(p=>p.code==='PLANNING_SELECTION_CAPACITY_REACHED'));assert.equal(v.coverage.provider_completeness,'NOT_PROVEN');assert.equal(v.orders.length,0);assert.equal(v.effects.financial_integration_allowed,false);
});
