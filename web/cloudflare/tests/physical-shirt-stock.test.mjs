import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {commercialContextFromPrincipal,bindCommercialEnvironment} from '../src/commercial-context.mjs';
import {normalizePhysicalShirtIdentity,physicalShirtIdentityId,applyPhysicalShirtCommand,projectPhysicalShirtStock,readPhysicalShirtStockWorkspace,mutatePhysicalShirtStockWorkspace} from '../src/physical-shirt-stock.mjs';
import {projectPhysicalShirtStockWorkspace} from '../src/physical-shirt-stock-view.mjs';

const now=()=>Date.parse('2026-11-20T18:00:00.000Z'),identity={garment_type:'ADULT',fit:'UNISEX',size:'M',color:'Preto',material:null};
let serial=1;const uuid=()=>`10000000-0000-4000-8000-${(serial++).toString(16).padStart(12,'0')}`;
const movement=(quantity,reference)=>({quantity,effective_date:'2026-11-20',evidence:'Contagem ou movimento físico sintético conferido',reference});
function fixture(t){const db=new D1();t.after(()=>db.db.close());return {env:{ADMIN_DB:db},options:{now},db};}
const legacyScope={organization_id:'legacy-brazacommerce',store_id:'legacy-shopee'};
const body=(operation,variant_id,expected_revision,selection,request_id=uuid())=>({operation,variant_id,expected_revision,selection,request_id,confirmed:true,expected_scope:{...legacyScope}});
async function registered(f,who=identity){return mutatePhysicalShirtStockWorkspace(f.env,body('register',null,0,who),'synthetic-owner',f.options);}
async function initialized(f,count=12){const a=await registered(f);return mutatePhysicalShirtStockWorkspace(f.env,body('initial_count',a.variant.variant_id,a.variant.revision,movement(count,'initial-count')),'synthetic-owner',f.options);}
const project=v=>projectPhysicalShirtStock(v.payload??v);

test('cold read is SELECT-only and does not infer an initial zero or initialize a schema',async t=>{
 const f=fixture(t),view=await readPhysicalShirtStockWorkspace(f.env,{},f.options);
 assert.deepEqual(view.variants,[]);assert.equal(view.selected,null);assert.equal(view.valuation.amount_cents,null);
 assert.equal(view.external_stock_write_allowed,false);assert.equal(view.financial_integration_allowed,false);
 assert.equal(f.db.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n,0);
});
test('registration preserves UNKNOWN until an explicit initial count, including a confirmed zero',async t=>{
 const f=fixture(t),r=await registered(f);assert.equal(r.variant.state,'UNKNOWN');
 for(const key of ['physical_usable_quantity','reserved_quantity','free_quantity'])assert.equal(r.variant[key],null);
 await assert.rejects(mutatePhysicalShirtStockWorkspace(f.env,body('receive',r.variant.variant_id,1,movement(5,'first-invoice')),'synthetic-owner',f.options),/INITIAL_COUNT_REQUIRED/);
 const counted=await mutatePhysicalShirtStockWorkspace(f.env,body('initial_count',r.variant.variant_id,1,movement(0,'initial-zero')),'synthetic-owner',f.options);
 assert.equal(counted.variant.state,'CONFIRMED');assert.equal(counted.variant.physical_usable_quantity,0);assert.equal(counted.variant.free_quantity,0);
 await assert.rejects(mutatePhysicalShirtStockWorkspace(f.env,body('initial_count',r.variant.variant_id,2,movement(2,'second-count')),'synthetic-owner',f.options),/INITIAL_COUNT_ALREADY_RECORDED/);
});
test('physical identity is canonical by color/material and supports actual adult G4/G5 and child sizes',async t=>{
 const f=fixture(t),first=await registered(f,{...identity,size:'G4',color:'Preto  Intenso',material:'Algodão'});
 const duplicate={...identity,size:'G4',color:'preto intenso',material:'ALGODÃO'};
 assert.equal(await physicalShirtIdentityId(first.variant.identity),await physicalShirtIdentityId(duplicate));
 await assert.rejects(registered(f,duplicate),/VARIANT_EXISTS|REVISION_CONFLICT/);
 assert.notEqual(await physicalShirtIdentityId(identity),await physicalShirtIdentityId({...identity,size:'G5'}));
 assert.notEqual(await physicalShirtIdentityId(identity),await physicalShirtIdentityId({...identity,color:'Branco'}));
 assert.equal(normalizePhysicalShirtIdentity({...identity,garment_type:'CHILD',size:'16'}).size,'16');
 assert.throws(()=>normalizePhysicalShirtIdentity({...identity,size:'not-a-size'}),/IDENTITY_INVALID/);
});
test('receipts affect physical quantities once and do not create purchase, payment or financial entries',async t=>{
 const f=fixture(t),a=await initialized(f),id=a.variant.variant_id,command=body('receive',id,2,movement(5,'invoice-line-1'));
 const b=await mutatePhysicalShirtStockWorkspace(f.env,command,'synthetic-owner',f.options),again=await mutatePhysicalShirtStockWorkspace(f.env,command,'synthetic-owner',f.options);
 assert.equal(b.variant.physical_usable_quantity,17);assert.equal(again.variant.physical_usable_quantity,17);assert.equal(again.replayed,true);
 await assert.rejects(mutatePhysicalShirtStockWorkspace(f.env,body('receive',id,3,movement(5,'INVOICE-LINE-1')),'synthetic-owner',f.options),/DUPLICATE_REFERENCE/);
 await assert.rejects(mutatePhysicalShirtStockWorkspace(f.env,{...command,selection:movement(6,'invoice-line-1')},'synthetic-owner',f.options),/REQUEST_CONFLICT/);
 assert.equal(f.db.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND (name LIKE 'financial_%' OR name LIKE '%expense%' OR name LIKE '%production_records%')").get().n,0);
});
test('two sessions cannot reserve the same free quantity, and a demand is not duplicated with a new request id',async t=>{
 const f=fixture(t),a=await initialized(f,5),id=a.variant.variant_id,revision=a.variant.revision;
 const first=await mutatePhysicalShirtStockWorkspace(f.env,body('reserve',id,revision,{quantity:4,demand_ref:'order-a/component-1'}),'synthetic-owner',f.options);
 assert.equal(first.variant.physical_usable_quantity,5);assert.equal(first.variant.reserved_quantity,4);assert.equal(first.variant.free_quantity,1);
 await assert.rejects(mutatePhysicalShirtStockWorkspace(f.env,body('reserve',id,revision,{quantity:4,demand_ref:'order-b/component-1'}),'synthetic-owner',f.options),e=>e.status===409);
 await assert.rejects(mutatePhysicalShirtStockWorkspace(f.env,body('reserve',id,3,{quantity:2,demand_ref:'order-b/component-1'}),'synthetic-owner',f.options),/INSUFFICIENT_FREE_STOCK/);
 await assert.rejects(mutatePhysicalShirtStockWorkspace(f.env,body('reserve',id,3,{quantity:1,demand_ref:'ORDER-A/component-1'}),'synthetic-owner',f.options),/DEMAND_ALREADY_RESERVED/);
});
test('partial release preserves physical stock and partial consumption reduces it exactly once',async t=>{
 const f=fixture(t),a=await initialized(f),id=a.variant.variant_id,reservation=body('reserve',id,2,{quantity:8,demand_ref:'synthetic-demand'});
 await mutatePhysicalShirtStockWorkspace(f.env,reservation,'synthetic-owner',f.options);
 const released=await mutatePhysicalShirtStockWorkspace(f.env,body('release',id,3,{...movement(2,'release-1'),reservation_id:reservation.request_id}),'synthetic-owner',f.options);
 assert.equal(released.variant.physical_usable_quantity,12);assert.equal(released.variant.reserved_quantity,6);assert.equal(released.variant.free_quantity,6);
 const command=body('consume',id,4,{...movement(3,'manufacture-use-1'),reservation_id:reservation.request_id});
 const used=await mutatePhysicalShirtStockWorkspace(f.env,command,'synthetic-owner',f.options);
 assert.equal(used.variant.physical_usable_quantity,9);assert.equal(used.variant.reserved_quantity,3);assert.equal(used.variant.free_quantity,6);
 assert.deepEqual(used.variant.reservations[0],{reservation_id:reservation.request_id,demand_ref:'synthetic-demand',quantity:8,remaining_quantity:3,consumed_quantity:3,released_quantity:2});
 assert.equal((await mutatePhysicalShirtStockWorkspace(f.env,command,'synthetic-owner',f.options)).replayed,true);
 await assert.rejects(mutatePhysicalShirtStockWorkspace(f.env,body('consume',id,5,{...movement(4,'manufacture-use-2'),reservation_id:reservation.request_id}),'synthetic-owner',f.options),/RESERVATION_QUANTITY_EXCEEDED/);
});
test('an adjustment requires evidence and cannot consume reserved pieces or produce negative stock',async t=>{
 const f=fixture(t),a=await initialized(f,6),id=a.variant.variant_id;
 await mutatePhysicalShirtStockWorkspace(f.env,body('reserve',id,2,{quantity:4,demand_ref:'demand-a'}),'synthetic-owner',f.options);
 await assert.rejects(mutatePhysicalShirtStockWorkspace(f.env,body('adjust',id,3,movement(-3,'damage-1')),'synthetic-owner',f.options),/ADJUSTMENT_BELOW_RESERVED_STOCK/);
 const adjusted=await mutatePhysicalShirtStockWorkspace(f.env,body('adjust',id,3,movement(-2,'damage-2')),'synthetic-owner',f.options);
 assert.equal(adjusted.variant.free_quantity,0);assert.equal(adjusted.variant.physical_usable_quantity,4);
 await assert.rejects(mutatePhysicalShirtStockWorkspace(f.env,body('adjust',id,4,{...movement(1,'missing-evidence'),evidence:''}),'synthetic-owner',f.options),/MOVEMENT_INVALID/);
});
test('future facts, facts before the initial date, invalid quantities and overflow fail without mutation',async t=>{
 const f=fixture(t),a=await initialized(f),id=a.variant.variant_id;
 const invalid=[{...movement(1,'future'),effective_date:'2026-11-21'},{...movement(1,'old'),effective_date:'2026-11-19'},movement(-1,'negative'),movement(0,'zero'),movement(0.1,'fraction'),movement(Number.MAX_SAFE_INTEGER,'overflow')];
 for(const selection of invalid)await assert.rejects(mutatePhysicalShirtStockWorkspace(f.env,body('receive',id,2,selection),'synthetic-owner',f.options));
 const read=await readPhysicalShirtStockWorkspace(f.env,{variant_id:id},f.options);assert.equal(read.selected.revision,2);assert.equal(read.selected.physical_usable_quantity,12);
});
test('audit pages beyond thirty events preserve original snapshots and expose no silent truncation',async t=>{
 const f=fixture(t),a=await initialized(f,0),id=a.variant.variant_id;let revision=2;
 for(let n=0;n<37;n++)revision=(await mutatePhysicalShirtStockWorkspace(f.env,body('receive',id,revision,movement(1,'receipt-'+n)),'synthetic-owner',f.options)).variant.revision;
 const first=await readPhysicalShirtStockWorkspace(f.env,{variant_id:id,limit:25},f.options);
 const second=await readPhysicalShirtStockWorkspace(f.env,{variant_id:id,limit:25,history_cursor:first.history.next_cursor},f.options);
 assert.equal(first.history.rows.length,25);assert.equal(second.history.rows.length,14);assert.equal(second.history.next_cursor,null);
 assert.equal(new Set([...first.history.rows,...second.history.rows].map(x=>x.revision)).size,39);
 assert.equal(second.history.rows.at(-1).payload.initialized,false);assert.equal(second.history.rows.at(-2).payload.physical_quantity,0);
 assert.equal(first.selected.physical_usable_quantity,37);
});
test('variant pagination reaches all registered sizes/colors and rejects an audit cursor for another variant',async t=>{
 const f=fixture(t);for(let n=0;n<31;n++)await registered(f,{...identity,color:'Cor sintética '+n});
 const first=await readPhysicalShirtStockWorkspace(f.env,{limit:25},f.options),second=await readPhysicalShirtStockWorkspace(f.env,{cursor:first.next_cursor,limit:25},f.options);
 assert.equal(first.variants.length,25);assert.equal(second.variants.length,6);assert.equal(second.next_cursor,null);
 assert.equal(new Set([...first.variants,...second.variants].map(r=>r.variant_id)).size,31);
 const a=first.variants[0],b=first.variants[1];await mutatePhysicalShirtStockWorkspace(f.env,body('initial_count',a.variant_id,1,movement(1,'count-a')),'synthetic-owner',f.options);
 const history=await readPhysicalShirtStockWorkspace(f.env,{variant_id:a.variant_id,limit:1},f.options);
 await assert.rejects(readPhysicalShirtStockWorkspace(f.env,{variant_id:b.variant_id,history_cursor:history.history.next_cursor},f.options),/CURSOR_INVALID/);
});
test('service uses existing production capabilities and rechecks a revoked authorization',async t=>{
 const f=fixture(t),seen=[];let allowed=true;f.options.assertAuthorized=async input=>{seen.push(input);return allowed;};
 const a=await registered(f);assert.ok(seen.some(x=>x.action==='write'&&x.capability==='production.write'));
 assert.ok(seen.every(x=>x.capability.startsWith('production.')));
 allowed=false;await assert.rejects(readPhysicalShirtStockWorkspace(f.env,{variant_id:a.variant.variant_id},f.options),e=>e.status===403);
 await assert.rejects(mutatePhysicalShirtStockWorkspace(f.env,body('initial_count',a.variant.variant_id,1,movement(1,'denied')),'synthetic-owner',f.options),e=>e.status===403);
});
test('unsafe envelopes, missing physical confirmation and forged server fields are rejected',async t=>{
 const f=fixture(t),registration=body('register',null,0,identity);
 for(const command of [{...registration,confirmed:false},{...registration,scope:{store_id:'another-store'}},{...registration,selection:{...identity,physical_quantity:100}},{...registration,expected_revision:1}])await assert.rejects(mutatePhysicalShirtStockWorkspace(f.env,command,'synthetic-owner',f.options));
 const getter={...identity};Object.defineProperty(getter,'color',{enumerable:true,get(){throw Error('getter must not execute');}});
 assert.throws(()=>normalizePhysicalShirtIdentity(getter),/IDENTITY_INVALID/);
});
test('actual persisted mutation, selected inventory and complete audit frames match the frozen browser contract',async t=>{
 const f=fixture(t);let ticks=now();f.options.now=()=>ticks++;
 const first=await registered(f,{...identity,size:'G5'});
 assert.ok(projectPhysicalShirtStockWorkspace(first));
 const command=body('initial_count',first.variant.variant_id,1,movement(2,'browser-count'));
 const counted=await mutatePhysicalShirtStockWorkspace(f.env,command,'synthetic-owner',f.options);
 assert.ok(projectPhysicalShirtStockWorkspace(counted));
 assert.ok(Date.parse(counted.checked_at)>=Date.parse(counted.variant.last_movement.at));
 const view=await readPhysicalShirtStockWorkspace(f.env,{variant_id:counted.variant.variant_id},f.options);
 assert.ok(projectPhysicalShirtStockWorkspace(view));assert.equal(view.history.rows.length,2);
});
test('a draft from another store cannot mutate an identical variant and revision, and wrong cold scope creates no tables',async t=>{
 const f=fixture(t),principal=store=>({kind:'account',userId:'synthetic-owner',organizationId:'synthetic-org',storeId:store,sessionId:'synthetic-session',membershipId:'synthetic-member',role:'OWNER',authorizationRevision:1,capabilities:['production.read','production.write']});
 const a=await commercialContextFromPrincipal(principal('store-a')),b=await commercialContextFromPrincipal(principal('store-b'));
 const bind=context=>bindCommercialEnvironment({ACCOUNT_DB:f.db},context,{authorizationGuard:()=>({sql:'SELECT 1',bindings:[]})});
 const envA=bind(a),envB=bind(b),scopeA=(await readPhysicalShirtStockWorkspace(envA,{},f.options)).scope,scopeB=(await readPhysicalShirtStockWorkspace(envB,{},f.options)).scope;
 const first=await mutatePhysicalShirtStockWorkspace(envA,{...body('register',null,0,identity),expected_scope:scopeA},'synthetic-owner',f.options);
 const second=await mutatePhysicalShirtStockWorkspace(envB,{...body('register',null,0,identity),expected_scope:scopeB},'synthetic-owner',f.options);
 assert.equal(first.variant.variant_id,second.variant.variant_id);assert.equal(first.variant.revision,second.variant.revision);
 const oldDraft={...body('initial_count',first.variant.variant_id,1,movement(8,'old-store-draft')),expected_scope:scopeA};
 await assert.rejects(mutatePhysicalShirtStockWorkspace(envB,oldDraft,'synthetic-owner',f.options),e=>e.code==='PHYSICAL_SHIRT_STOCK_SCOPE_CHANGED'&&e.status===403);
 const currentB=await readPhysicalShirtStockWorkspace(envB,{variant_id:second.variant.variant_id},f.options);assert.equal(currentB.selected.revision,1);assert.equal(currentB.selected.physical_usable_quantity,null);assert.equal(currentB.history.rows.length,1);
 const countedB=await mutatePhysicalShirtStockWorkspace(envB,{...oldDraft,expected_scope:scopeB,request_id:uuid()},'synthetic-owner',f.options);assert.equal(countedB.variant.physical_usable_quantity,8);
 const cold=fixture(t);await assert.rejects(mutatePhysicalShirtStockWorkspace(cold.env,{...body('register',null,0,identity),expected_scope:scopeA},'synthetic-owner',cold.options),e=>e.status===403);
 assert.equal(cold.db.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n,0);
});
test('a consumption cannot be backdated before the received stock and reservation that made it possible',async t=>{
 const f=fixture(t),first=await registered(f),id=first.variant.variant_id;
 await mutatePhysicalShirtStockWorkspace(f.env,body('initial_count',id,1,{...movement(0,'opening'),effective_date:'2026-11-01'}),'synthetic-owner',f.options);
 await mutatePhysicalShirtStockWorkspace(f.env,body('receive',id,2,movement(10,'received-today')),'synthetic-owner',f.options);
 const reservation=body('reserve',id,3,{quantity:10,demand_ref:'current-demand'});
 await mutatePhysicalShirtStockWorkspace(f.env,reservation,'synthetic-owner',f.options);
 const backdated=body('consume',id,4,{...movement(10,'old-consumption'),effective_date:'2026-11-10',reservation_id:reservation.request_id});
 await assert.rejects(mutatePhysicalShirtStockWorkspace(f.env,backdated,'synthetic-owner',f.options),e=>e.code==='PHYSICAL_SHIRT_STOCK_MOVEMENT_BEFORE_LATEST_MOVEMENT'&&e.status===409);
 const current=await readPhysicalShirtStockWorkspace(f.env,{variant_id:id},f.options);
 assert.equal(current.selected.physical_usable_quantity,10);assert.equal(current.selected.reserved_quantity,10);assert.equal(current.selected.revision,4);assert.equal(current.history.rows.length,4);
});
test('a movement racing the history read leaves selected balance, listed variant and history consistent',async t=>{
 const f=fixture(t),first=await initialized(f),id=first.variant.variant_id,prepare=f.db.prepare.bind(f.db);let armed=true;
 f.db.prepare=sql=>{
  const statement=prepare(sql),all=statement.all.bind(statement);
  statement.all=async()=>{
   if(armed&&sql.startsWith('SELECT * FROM operational_entity_revisions')&&sql.includes('revision<?')){
    armed=false;await mutatePhysicalShirtStockWorkspace(f.env,body('receive',id,2,movement(1,'concurrent-receipt')),'synthetic-owner',f.options);
   }
   return all();
  };
  return statement;
 };
 const view=await readPhysicalShirtStockWorkspace(f.env,{variant_id:id},f.options);
 assert.equal(armed,false);assert.equal(view.selected.revision,3);assert.equal(view.selected.physical_usable_quantity,13);
 assert.deepEqual(view.variants.find(r=>r.variant_id===id),view.selected);assert.equal(view.history.rows[0].revision,3);
 assert.ok(view.history.rows.every(r=>r.revision<=view.selected.revision));assert.ok(projectPhysicalShirtStockWorkspace(view));
});
