import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {syncCostRuleCatalog} from '../src/cost-rules.mjs';
import {readProductionDtf,saveProductionDtfSettings,syncProductionDtf,prepareProductionDtfBatch,actProductionDtfBatch,ProductionDtfError} from '../src/production-dtf-store.mjs';

const base=Date.UTC(2026,9,24,12),id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const art=()=>({art_key:'vivaosanos80',sha256:'a'.repeat(64),pixel_width:4000,pixel_height:4000});
function order(order_id='ORDER_1',changes={}){return {order_id,status:'READY_TO_SHIP',create_time:base/1000-3600,update_time:base/1000-100,lines:[{line_key:'201:0',item_id:'201',model_id:'0',sku:'vivaosanos80-27',quantity:2,model_name:'M'}],...changes};}
async function fixture(orders=[order()]){
 const ADMIN_DB=new D1(),realBatch=ADMIN_DB.batch.bind(ADMIN_DB);let tail=Promise.resolve();ADMIN_DB.batch=statements=>{const pending=tail.then(()=>realBatch(statements));tail=pending.catch(()=>{});return pending;};
 ADMIN_DB.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);INSERT INTO variant_bindings_state VALUES(1,1,\'[]\',\'2026-10-24T12:00:00Z\');CREATE TABLE hermes_jobs(id TEXT)');
 const env={ADMIN_DB},state={time:base,orders:structuredClone(orders),calls:[]},now=()=>state.time;
 const source=async(_,input)=>{state.calls.push(structuredClone(input));const selected=input.operation==='verify'?state.orders.filter(row=>input.order_ids.includes(row.order_id)):state.orders.filter(row=>row.create_time>=Date.parse(input.start_date+'T00:00:00-03:00')/1000&&row.create_time<Date.parse(input.end_date+'T00:00:00-03:00')/1000+86400);return {schema:'production_orders_v1',shop_id:1178167501,checked_at:Math.floor(state.time/1000),start_date:input.operation==='scan'?input.start_date:null,end_date:input.operation==='scan'?input.end_date:null,complete:true,orders:structuredClone(selected)};};
 const read=()=>readProductionDtf(env),sync=(extra={})=>syncProductionDtf(env,source,{now,force:true,...extra});
 await read();return {env,state,now,source,read,sync,prepare:body=>prepareProductionDtfBatch(env,body,source,'admin',{now}),action:(action,batch_id=id)=>actProductionDtfBatch(env,{id:batch_id,action},source,'admin',{now})};
}
const request=(lines,request_id=id)=>({request_id,unit_keys:lines.map(row=>row.unit_key),artworks:[art()]});
const rejects=(promise,code,status=409)=>assert.rejects(promise,error=>error instanceof ProductionDtfError&&error.message===code&&error.status===status);
const count=(f,table)=>f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM '+table).get().n;

test('confirmed 57cm defaults, private queue and exact SKU produce a frozen versioned lot without changing financial bindings',async()=>{
 const f=await fixture(),initial=await f.read();assert.equal(initial.settings.values.film_width_mm,570);assert.equal(initial.lines.length,0);
 const before=f.env.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_state').all(),view=await f.sync();assert.equal(view.lines.length,1);assert.equal(view.lines[0].production_state,'PENDING');assert.equal(view.last_sync_at,base/1000);assert.equal(view.sync_status,'IDLE');assert.equal(view.queue_limited,false);
 assert.deepEqual(f.state.calls[0],{operation:'scan',start_date:'2026-10-24',end_date:'2026-10-24'});assert.deepEqual(f.state.calls[1],{operation:'scan',start_date:'2026-10-23',end_date:'2026-10-23'});
 const {batch}=await f.prepare(request(view.lines));assert.equal(batch.status,'PREPARED');assert.equal(batch.layout.print_count,2);assert.equal(batch.layout.sheets[0].width_mm,570);assert.equal(batch.layout.sheets[0].placements[0].width_mm,270);assert.equal(batch.layout.sheets[0].placements[0].height_mm,270);
 assert.equal((await f.read()).lines[0].production_state,'RESERVED');assert.deepEqual(f.state.calls.at(-1),{operation:'verify',order_ids:['ORDER_1']});assert.equal(count(f,'production_dtf_audit'),1);
 assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_state').all(),before);assert.equal(count(f,'hermes_jobs'),0);
});

test('prepare request identity and active-line uniqueness prevent duplicate prints across retries and concurrent owners',async()=>{
 const f=await fixture(),view=await f.sync(),body=request(view.lines);
 const [first,second]=await Promise.all([f.prepare(body),f.prepare({...body,request_id:other})].map(promise=>promise.then(value=>({value}),error=>({error}))));
 assert.equal([first,second].filter(row=>row.value).length,1);assert.equal(count(f,'production_dtf_batches'),1);assert.equal(count(f,'production_dtf_reservations'),1);
 const winner=[first,second].find(row=>row.value).value.batch,again=await f.prepare({...body,request_id:winner.id});assert.equal(again.batch.id,winner.id);assert.equal(count(f,'production_dtf_audit'),1);
 await rejects(f.prepare({...body,request_id:winner.id,artworks:[{...art(),sha256:'b'.repeat(64)}]}),'DTF_REQUEST_ID_REUSED');
});

test('export rechecks cancellation and a cancelled prepared lot can be voided without releasing an exported lot',async()=>{
 const f=await fixture(),view=await f.sync();await f.prepare(request(view.lines));f.state.time+=1000;f.state.orders[0].status='CANCELLED';f.state.orders[0].update_time++;
 await rejects(f.action('export'),'DTF_ORDER_CHANGED_REFRESH');let current=await f.read();assert.equal(current.batches[0].status,'PREPARED');assert.equal(current.lines[0].production_state,'BLOCKED');
 assert.equal((await f.action('void')).batch.status,'VOID');assert.equal(count(f,'production_dtf_reservations'),0);
 const second=await fixture(),eligible=await second.sync();await second.prepare(request(eligible.lines));assert.equal((await second.action('export')).batch.status,'EXPORTED');await rejects(second.action('void'),'DTF_BATCH_STATE_CONFLICT');
 assert.equal((await second.action('produce')).batch.status,'PRODUCED');assert.equal((await second.read()).lines[0].production_state,'PRODUCED');assert.equal(count(second,'production_dtf_reservations'),1);await rejects(second.prepare({...request(eligible.lines),request_id:other}),'DTF_QUEUE_CHANGED_REFRESH');
 second.state.time+=1000;second.state.orders[0].update_time++;second.state.orders[0].lines[0].quantity=3;await second.sync();assert.equal((await second.read()).lines[0].production_state,'BLOCKED','a later quantity increase is not falsely labelled as already produced');assert.equal(count(second,'production_dtf_reservations'),1);
});

test('SKU and quantity changes stop stale preparation and absent provider lines cannot export retained artwork',async()=>{
 for(const change of [row=>{row.lines[0].sku='outra-27';},row=>{row.lines[0].quantity=3;}]){
  const f=await fixture(),view=await f.sync(),original=f.source;
  const changed=async(...args)=>{f.state.time+=1000;f.state.orders[0].update_time++;change(f.state.orders[0]);return original(...args);};
  await rejects(prepareProductionDtfBatch(f.env,request(view.lines),changed,'admin',{now:f.now}),'DTF_ORDER_CHANGED_REFRESH');assert.equal(count(f,'production_dtf_batches'),0);assert.equal(count(f,'production_dtf_reservations'),0);
 }
 const f=await fixture(),view=await f.sync();await f.prepare(request(view.lines));f.state.time+=1000;f.state.orders[0].lines=[];f.state.orders[0].update_time++;
 await rejects(f.action('export'),'DTF_ORDER_CHANGED_REFRESH');assert.equal((await f.read()).lines[0].status,'MISSING_LINE');
});

test('stale status versions and conflicting same-provider-time replies never resurrect cancelled work',async()=>{
 const f=await fixture(),view=await f.sync();f.state.time+=1000;f.state.orders[0].status='CANCELLED';f.state.orders[0].update_time+=2;await f.sync();
 f.state.time+=1000;f.state.orders[0].status='READY_TO_SHIP';f.state.orders[0].update_time--;await f.sync();assert.equal((await f.read()).lines[0].status,'CANCELLED');
 f.state.time+=1000;f.state.orders[0].update_time++;await f.sync();assert.equal((await f.read()).lines[0].status,'UNKNOWN');await rejects(f.prepare(request(view.lines)),'DTF_QUEUE_CHANGED_REFRESH');
 f.state.time+=1000;f.state.orders[0].update_time++;await f.sync();assert.equal((await f.read()).lines[0].status,'READY_TO_SHIP');
});

test('settings CAS, concurrent edits and an audit conflict never leave a partially reserved lot',async()=>{
 const f=await fixture(),view=await f.sync(),values={...view.settings.values,gap_mm:8};
 const settings=await saveProductionDtfSettings(f.env,{revision:1,values},'admin',{now:f.now});assert.equal(settings.revision,2);await rejects(saveProductionDtfSettings(f.env,{revision:1,values},'admin',{now:f.now}),'DTF_SETTINGS_CHANGED_RELOAD');
 const original=f.source,mutate=async(...args)=>{await saveProductionDtfSettings(f.env,{revision:2,values:{...values,gap_mm:9}},'admin',{now:f.now});return original(...args);};
 await rejects(prepareProductionDtfBatch(f.env,request(view.lines),mutate,'admin',{now:f.now}),'DTF_QUEUE_CHANGED_REFRESH');assert.equal(count(f,'production_dtf_batches'),0);assert.equal(count(f,'production_dtf_reservations'),0);
 const fresh=await f.read();f.env.ADMIN_DB.db.exec("CREATE TRIGGER audit_failure BEFORE INSERT ON production_dtf_audit BEGIN SELECT RAISE(ABORT,'fixture audit unavailable'); END");
 await rejects(f.prepare(request(fresh.lines)),'DTF_QUEUE_CHANGED_REFRESH');assert.equal(count(f,'production_dtf_batches'),0);assert.equal(count(f,'production_dtf_reservations'),0);
});

test('a local composition correction updates the print requirement without inventing a provider status conflict',async()=>{
 const f=await fixture();await f.sync();
 const kit={item_id:'201',model_id:'0',male_size:'M',female_size:'P',selling_unit:'ONE_MALE_ONE_FEMALE_KIT',operator_confirmed:true};
 f.env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET payload=? WHERE id=1').run(JSON.stringify([kit]));f.state.time+=1000;
 const view=await f.sync();assert.equal(view.lines[0].status,'READY_TO_SHIP');assert.equal(view.lines[0].requires_pair,true);assert.equal(view.lines[0].production_state,'PENDING');
 await rejects(f.prepare(request(view.lines)),'DTF_PLAN_PENDING',400);assert.equal(count(f,'production_dtf_batches'),0);
});

test('kits need explicit parts, sem-estampa remains outside the print queue and private or stale source replies fail closed',async()=>{
 const f=await fixture([order(),order('NO_PRINT',{lines:[{line_key:'202:0',item_id:'202',model_id:'0',sku:'sem-estampa',quantity:1,model_name:'M'}]})]);
 const kit={item_id:'201',model_id:'0',male_size:'M',female_size:'P',selling_unit:'ONE_MALE_ONE_FEMALE_KIT',operator_confirmed:true};f.env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET payload=? WHERE id=1').run(JSON.stringify([kit]));
 const view=await f.sync();assert.equal(view.lines.find(row=>row.order_id==='NO_PRINT').production_state,'BLOCKED');const line=view.lines.find(row=>row.order_id==='ORDER_1');assert.equal(line.requires_pair,true);await rejects(f.prepare(request([line])),'DTF_PLAN_PENDING',400);assert.equal(count(f,'production_dtf_batches'),0);
 await rejects(syncProductionDtf(f.env,async()=>({...(await f.source(f.env,{operation:'verify',order_ids:['ORDER_1']})),buyer:'PRIVATE'}),{now:f.now,force:true}),'DTF_SOURCE_UNAVAILABLE',503);
 const before=await f.read();await rejects(syncProductionDtf(f.env,async()=>({...await f.source(f.env,{operation:'scan',start_date:'2026-10-10',end_date:'2026-10-24'}),checked_at:base/1000-61}),{now:f.now,force:true}),'DTF_SOURCE_UNAVAILABLE',503);assert.equal((await f.read()).lines.length,before.lines.length);
});

test('sync is leased and cached, refreshes older pending orders and uses a bounded bulk SQL import',async()=>{
 const old=order('OLD',{create_time:base/1000-20*86400,update_time:base/1000-19*86400}),f=await fixture([old,order()]);
 // Seed an older order once using an exact historic scan so future scans must
 // verify it explicitly rather than abandoning it outside the rolling window.
 f.state.time=base-19*86400000;f.state.orders=[{...old,update_time:f.state.time/1000-10}];await f.sync();f.state.time=base;f.state.orders=[old,order()];await f.sync();assert.ok(f.state.calls.some(row=>row.operation==='verify'&&row.order_ids.includes('OLD')));
 const before=f.state.calls.length;await f.sync({force:false});assert.equal(f.state.calls.length,before);
 let release,entered;const blocked=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;}),source=async(...args)=>{entered();await blocked;return f.source(...args);};
 f.state.time+=61000;const pending=syncProductionDtf(f.env,source,{now:f.now,force:true});await started;const concurrent=await f.sync();assert.equal(concurrent.sync_status,'RUNNING');release();await pending;
 const batches=[],actual=f.env.ADMIN_DB.batch.bind(f.env.ADMIN_DB);f.env.ADMIN_DB.batch=statements=>{batches.push(statements.length);return actual(statements);};f.state.time+=1000;f.state.orders=[old,...Array.from({length:100},(_,index)=>order('ORDER_'+index))];await f.sync();assert.ok(batches.includes(3));assert.ok(Math.max(...batches)<=5);assert.equal((await f.read()).queue_total,101);
});

test('a busy rolling history never blocks today and older known orders are rechecked while backfill advances',async()=>{
 const history=Array.from({length:12},(_,day)=>Array.from({length:100},(_,index)=>order('OLD'+String(day).padStart(2,'0')+'_'+String(index).padStart(3,'0'),{create_time:base/1000-(day+1)*86400-3600}))).flat();
 const f=await fixture([order('TODAY'),...history]),first=await f.sync();assert.equal(first.queue_total,101);assert.ok(first.lines.some(row=>row.order_id==='TODAY'));assert.equal(first.history_next_date,'2026-10-22');
 f.state.time+=61000;f.state.orders.find(row=>row.order_id==='OLD00_000').status='CANCELLED';f.state.orders.find(row=>row.order_id==='OLD00_000').update_time++;
 const second=await f.sync({force:false});assert.equal(second.queue_total,201);assert.equal(second.history_next_date,'2026-10-21');assert.equal(second.lines.find(row=>row.order_id==='OLD00_000').production_state,'BLOCKED');
 assert.ok(f.state.calls.every(input=>input.operation!=='scan'||input.start_date===input.end_date));assert.ok(f.state.calls.some(input=>input.operation==='verify'&&input.order_ids.includes('OLD00_000')));
});


test('a newly classified couple kit reaches the DTF queue without writing a legacy binding and keeps manual composition priority',async()=>{
 const f=await fixture(),before=f.env.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_state').all();
 const catalogue=(model_id='0')=>({schema:'variant_catalog_v1',checked_at:Math.floor(f.state.time/1000),products:[{item_id:'201',catalog_fingerprint:'d'.repeat(64),selling_unit:'ONE_MALE_ONE_FEMALE_KIT',bindings:[{item_id:'201',model_id,male_size:'M',female_size:'P'}],unresolved_count:0,cost_catalog:{schema:'product_cost_catalog_v1',product_name:'Kit Camiseta Casal',variants:[{model_id,attributes:[{name:'Tamanho Masculino',value:'HOMEM M'},{name:'Tamanho Feminino',value:'MULHER P'}]}]}}]});
 await syncCostRuleCatalog(f.env,['201'],async()=>catalogue(),{now:f.now});
 let view=await f.sync();assert.equal(view.lines[0].requires_pair,true);assert.equal(view.lines[0].status,'READY_TO_SHIP');assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_state').all(),before);
 await rejects(f.prepare(request(view.lines)),'DTF_PLAN_PENDING',400);
 const manual={item_id:'201',model_id:'0',selling_unit:'SINGLE_GARMENT',size:'M',operator_confirmed:true};f.env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET payload=?').run(JSON.stringify([manual]));f.state.time+=1000;
 view=await f.sync();assert.equal(view.lines[0].requires_pair,false,'a saved manual composition still wins over the catalogue');assert.equal(view.lines[0].status,'READY_TO_SHIP');
 const old={item_id:'201',model_id:'0',selling_unit:'ONE_MALE_ONE_FEMALE_KIT',male_size:'M',female_size:'P',operator_confirmed:false,source:'CATALOG_VARIATION_AXES',catalog_fingerprint:'d'.repeat(64)};f.env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET payload=?').run(JSON.stringify([old]));f.state.time+=1000;
 await syncCostRuleCatalog(f.env,['201'],async()=>catalogue('1'),{now:f.now,force:true});
 view=await f.sync();assert.equal(view.lines[0].requires_pair,false,'a model removed from the new catalogue cannot revive an obsolete automatic kit binding');
});
