import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {PRODUCTION_DTF_SCHEMA} from '../src/production-dtf-store.mjs';
import {OrderOperationsError,ORDER_OPERATIONS_SCHEMA,readOrderOperationsWorkspace,mutateOrderOperationsWorkspace} from '../src/order-operations.mjs';

const at=Date.parse('2026-11-11T15:00:00Z'),stamp=at/1000;
const selection=(change={})=>({start_date:'2026-11-01',end_date:'2026-11-11',status:'ALL',page:1,...change});
const digest=async v=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(typeof v==='string'?v:JSON.stringify(v)))).toString('hex');
async function fixture({source=true,count=1}={}){
 const db=new D1(),actual=db.batch.bind(db);let tail=Promise.resolve();db.batch=statements=>{const p=tail.then(()=>actual(statements));tail=p.catch(()=>{});return p;};
 const env={ADMIN_DB:db},time={value:at},now=()=>time.value;
 if(source)await db.batch(PRODUCTION_DTF_SCHEMA.map(sql=>db.prepare(sql)));
 const seed=async(id='ORDER_1',changes={},lineCount=1)=>{
  const order={order_id:id,status:'READY_TO_SHIP',create_time:stamp-3600,update_time:stamp-100,checked_at:stamp,...changes},evidence=[];
  for(let index=0;index<lineCount;index++){
   const item=String(200+index),line_key=item+':0',payload=JSON.stringify({item_id:item,model_id:'0',sku:'ART_'+item+'-27',quantity:2,model_name:'M',requires_pair:false}),key=await digest([id,line_key]);
   db.db.prepare('INSERT OR REPLACE INTO production_dtf_lines(unit_key,order_id,line_key,payload,source_hash,checked_at,missing) VALUES(?,?,?,?,?,?,0)').run(key,id,line_key,payload,await digest(payload),order.checked_at);
   evidence.push([line_key,await digest([item,'0','ART_'+item+'-27',2,'M'])]);
  }
  order.source_hash=changes.source_hash??await digest({status:order.status,create_time:order.create_time,update_time:order.update_time,lines:evidence.sort((a,b)=>a[0].localeCompare(b[0]))});
  db.db.prepare('INSERT OR REPLACE INTO production_dtf_orders(order_id,status,create_time,update_time,checked_at,source_hash) VALUES(?,?,?,?,?,?)').run(order.order_id,order.status,order.create_time,order.update_time,order.checked_at,order.source_hash);return order;
 };
 for(let i=0;source&&i<count;i++)await seed('ORDER_'+String(i+1).padStart(4,'0'));
 return {env,db,now,time,seed,read:(s=selection())=>readOrderOperationsWorkspace(env,s,{now}),mutate:(body,actor='owner')=>mutateOrderOperationsWorkspace(env,body,actor,{now}),close:()=>db.db.close()};
}
function body(frame,changes={}){const row=frame.orders[0];return {request_id:crypto.randomUUID(),revision:frame.revision,identity:row.identity,source_hash:row.source_hash,from_stage:row.operation.stage,to_stage:row.operation.stage===null?'SEPARATION':({SEPARATION:'PRODUCTION',PRODUCTION:'FINISHING',FINISHING:'READY_TO_SHIP',READY_TO_SHIP:'READY_TO_SHIP'})[row.operation.stage],reason:'Conferido pelo operador',confirmed:true,...changes};}
const rejects=(p,code,status=409)=>assert.rejects(p,e=>e instanceof OrderOperationsError&&e.message==='ORDER_OPERATIONS_'+code&&e.status===status);
const names=f=>f.db.db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'order_operations_%' ORDER BY name").all();
async function observe(f,id,change={}){
 f.time.value+=1000;const checked=Math.floor(f.time.value/1000),order=f.db.db.prepare('SELECT * FROM production_dtf_orders WHERE order_id=?').get(id),active=f.db.db.prepare('SELECT * FROM production_dtf_lines WHERE order_id=? AND missing=0 ORDER BY line_key').all(id);
 if(change.quantity!==undefined||change.model_name!==undefined){const row=active[0],value=JSON.parse(row.payload);if(change.quantity!==undefined)value.quantity=change.quantity;if(change.model_name!==undefined)value.model_name=change.model_name;const payload=JSON.stringify(value);f.db.db.prepare('UPDATE production_dtf_lines SET payload=?,source_hash=? WHERE unit_key=?').run(payload,await digest(payload),row.unit_key);}
 if(change.new_item){const item=change.new_item,line_key=item+':0',payload=JSON.stringify({item_id:item,model_id:'0',sku:'NEW-'+item,quantity:1,model_name:'G',requires_pair:false});f.db.db.prepare('INSERT INTO production_dtf_lines(unit_key,order_id,line_key,payload,source_hash,checked_at,missing) VALUES(?,?,?,?,?,?,0)').run(await digest([id,line_key]),id,line_key,payload,await digest(payload),checked);}
 if(change.remove_first)f.db.db.prepare('UPDATE production_dtf_lines SET missing=1 WHERE unit_key=?').run(active[0].unit_key);
 f.db.db.prepare('UPDATE production_dtf_lines SET checked_at=? WHERE order_id=? AND missing=0').run(checked,id);
 const lines=f.db.db.prepare('SELECT line_key,payload FROM production_dtf_lines WHERE order_id=? AND missing=0').all(id),evidence=await Promise.all(lines.map(async row=>{const v=JSON.parse(row.payload);return [row.line_key,await digest([v.item_id,v.model_id,v.sku,v.quantity,v.model_name])];})),status=change.status??order.status,update=change.checked_only?order.update_time:checked-1,sourceHash=await digest({status,create_time:order.create_time,update_time:update,lines:evidence.sort((a,b)=>a[0].localeCompare(b[0]))});
 f.db.db.prepare('UPDATE production_dtf_orders SET status=?,update_time=?,checked_at=?,source_hash=? WHERE order_id=?').run(status,update,checked,sourceHash,id);
}

test('cold GET is SELECT-only and reports uncaptured source instead of manufacturing or financial facts',async t=>{
 const f=await fixture({source:false});t.after(f.close);const sql=[],prepare=f.db.prepare.bind(f.db);f.db.prepare=q=>{sql.push(q);return prepare(q);};
 const frame=await f.read();assert.equal(frame.coverage.state,'NOT_CAPTURED');assert.equal(frame.coverage.period_complete,false);assert.equal(frame.revision,0);assert.deepEqual(frame.orders,[]);assert.equal(frame.pagination.pages,0);assert.equal(frame.platforms[1].connection,'NOT_CONNECTED');assert.equal(frame.platforms[2].connection,'NOT_CONNECTED');assert.ok(sql.every(q=>/^\s*(SELECT|WITH)\b/i.test(q)));assert.deepEqual(names(f),[]);
 await rejects(f.mutate({request_id:crypto.randomUUID(),revision:0,identity:{platform:'SHOPEE_BR',shop_id:'1178167501',order_id:'UNKNOWN'},source_hash:'a'.repeat(64),from_stage:null,to_stage:'SEPARATION',reason:'Conferido',confirmed:true}),'NOT_FOUND',404);assert.deepEqual(names(f),[]);
});

test('real SQL grouping counts orders beyond the old 1000-line DTF view and pages do not change totals',async t=>{
 const f=await fixture({count:0});t.after(f.close);for(let i=0;i<55;i++)await f.seed('ORDER_'+String(i).padStart(3,'0'),{},21);
 const first=await f.read(),second=await f.read(selection({page:2}));assert.equal(first.totals.orders,55);assert.equal(first.totals.by_stage.NOT_STARTED,55);assert.deepEqual(first.totals,second.totals);assert.equal(first.orders.length,50);assert.equal(second.orders.length,5);assert.equal(first.pagination.pages,2);assert.equal(first.pagination.has_more,true);assert.equal(second.pagination.has_more,false);assert.equal(first.orders[0].lines.length,8);assert.equal(first.orders[0].lines_total,21);assert.equal(first.orders[0].lines_limited,true);assert.equal(first.orders[0].selling_units,42);assert.equal(first.orders[0].can_update,true);assert.equal(first.coverage.state,'PARTIAL');assert.deepEqual(names(f),[]);
});

test('owner stage progression and explicit correction append immutable events without altering source or manufacturing',async t=>{
 const f=await fixture();t.after(f.close);const sourceBefore=f.db.db.prepare('SELECT * FROM production_dtf_orders').all();
 let frame=await f.read();const first=body(frame),receipt=await f.mutate(first);assert.deepEqual(receipt,{schema:'order_operations_mutation_v1',request_id:first.request_id,revision:1,replayed:false});
 for(const stage of ['PRODUCTION','FINISHING','READY_TO_SHIP']){frame=await f.read();await f.mutate(body(frame,{to_stage:stage}));}
 frame=await f.read();assert.equal(frame.orders[0].operation.stage,'READY_TO_SHIP');assert.equal(frame.orders[0].provider.status,'READY_TO_SHIP');assert.equal(frame.totals.by_stage.READY_TO_SHIP,1);
 await f.mutate(body(frame,{to_stage:'SEPARATION',reason:'Correção conferida: voltou para separação'}));frame=await f.read();assert.equal(frame.orders[0].operation.stage,'SEPARATION');assert.equal(frame.revision,5);assert.deepEqual(f.db.db.prepare('SELECT * FROM production_dtf_orders').all(),sourceBefore);assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'incurred_production_%'").get().n,0);
 assert.throws(()=>f.db.db.exec("UPDATE order_operations_events SET reason='change' WHERE revision=1"),/ORDER_OPERATIONS_IMMUTABLE/);assert.throws(()=>f.db.db.exec('DELETE FROM order_operations_events WHERE revision=1'),/ORDER_OPERATIONS_IMMUTABLE/);
});

test('UUID replay precedes revision and current provider checks; reused UUID with different facts is rejected',async t=>{
 const f=await fixture();t.after(f.close);const first=body(await f.read());await f.mutate(first);await f.mutate(body(await f.read()));
 f.db.db.prepare("UPDATE production_dtf_orders SET status='CANCELLED',update_time=update_time+1 WHERE order_id=?").run(first.identity.order_id);f.time.value+=600000;
 assert.deepEqual(await f.mutate(first),{schema:'order_operations_mutation_v1',request_id:first.request_id,revision:1,replayed:true});await rejects(f.mutate({...first,to_stage:'PRODUCTION'}),'CONFLICT');assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM order_operations_events').get().n,2);
});

test('concurrent owners cannot both advance from the same revision and audit failure rolls back the state',async t=>{
 const f=await fixture();t.after(f.close);const frame=await f.read(),a=body(frame),b=body(frame),results=await Promise.allSettled([f.mutate(a),f.mutate(b)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await f.read()).revision,1);assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM order_operations_events').get().n,1);
 f.db.db.exec("CREATE TRIGGER test_audit_fail BEFORE INSERT ON order_operations_events BEGIN SELECT RAISE(ABORT,'fixture'); END");await rejects(f.mutate(body(await f.read())),'UNAVAILABLE',503);assert.equal((await f.read()).revision,1);
});

test('provider cancellation, unpaid, returns and source age block internal progress but preserve prior declarations',async t=>{
 for(const status of ['CANCELLED','IN_CANCEL','UNPAID','TO_RETURN','UNKNOWN','SHIPPED','COMPLETED']){
  const f=await fixture();t.after(f.close);await f.mutate(body(await f.read()));f.db.db.prepare('UPDATE production_dtf_orders SET status=?,update_time=update_time+1').run(status);const frame=await f.read(),row=frame.orders[0];assert.equal(row.can_update,false);assert.ok(row.blocked_reasons.includes('STATUS_NOT_ELIGIBLE'));assert.equal(row.operation.stage,'SEPARATION');await rejects(f.mutate(body(frame)),'STATUS_BLOCKED');
 }
 const f=await fixture();t.after(f.close);f.time.value+=301000;const frame=await f.read();assert.equal(frame.orders[0].provider.stale,true);assert.equal(frame.orders[0].can_update,false);await rejects(f.mutate(body(frame)),'SOURCE_STALE');assert.deepEqual(names(f),[]);
});

test('date, stage, identity and confirmation validation is strict and noninitial transitions cannot skip stages',async t=>{
 const f=await fixture();t.after(f.close);for(const s of [selection({start_date:'2026-02-30'}),selection({end_date:'2026-11-12'}),selection({start_date:'2026-10-01'}),selection({page:'1'}),selection({status:'constructor'}),{...selection(),shop_id:'other'}])await rejects(f.read(s),'REQUEST_INVALID',400);
 const first=body(await f.read());for(const change of [{confirmed:false},{identity:{...first.identity,platform:'MERCADO_LIVRE_BR'}},{identity:{...first.identity,shop_id:'2'}},{reason:''},{request_id:'not-uuid'},{extra:true}])await rejects(f.mutate({...first,...change}),'REQUEST_INVALID',400);
 await rejects(f.mutate({...first,to_stage:'PRODUCTION'}),'TRANSITION_INVALID');assert.deepEqual(names(f),[]);await f.mutate(first);await rejects(f.mutate(body(await f.read(),{to_stage:'READY_TO_SHIP'})),'TRANSITION_INVALID');
});

test('stage and active filters retain full-period counters; period boundaries are Brasilia dates',async t=>{
 const f=await fixture({count:0});t.after(f.close);await f.seed('ON_START',{create_time:Date.parse('2026-11-01T03:00:00Z')/1000});await f.seed('BEFORE',{create_time:Date.parse('2026-11-01T02:59:59Z')/1000});await f.seed('SENT',{status:'SHIPPED'});await f.seed('CANCEL',{status:'CANCELLED'});
 const all=await f.read(),active=await f.read(selection({status:'ACTIVE'})),sent=await f.read(selection({status:'SHIPPED'}));assert.equal(all.totals.orders,3);assert.deepEqual(active.totals,all.totals);assert.equal(active.pagination.total_orders,1);assert.equal(sent.pagination.total_orders,1);assert.equal(sent.orders[0].identity.order_id,'SENT');
});

test('missing source lines, corrupted cache and changing source fail closed before any operation schema is created',async t=>{
 const f=await fixture();t.after(f.close);let frame=await f.read(),request=body(frame);f.db.db.prepare("UPDATE production_dtf_orders SET source_hash=?").run('b'.repeat(64));await rejects(f.mutate(request),'SOURCE_CHANGED');assert.deepEqual(names(f),[]);
 f.db.db.prepare('UPDATE production_dtf_lines SET missing=1').run();frame=await f.read();assert.equal(frame.orders[0].can_update,false);assert.ok(frame.orders[0].blocked_reasons.includes('SOURCE_INCOMPLETE'));await rejects(f.mutate(body(frame)),'SOURCE_CHANGED');
 f.db.db.prepare("UPDATE production_dtf_lines SET missing=0,source_hash=?").run('c'.repeat(64));frame=await f.read();await rejects(f.mutate(body(frame)),'SOURCE_CHANGED');assert.deepEqual(names(f),[]);
});

test('partial or altered audit schema is reported without repair by GET or POST',async t=>{
 const f=await fixture();t.after(f.close);await f.mutate(body(await f.read()));f.db.db.exec('DROP TRIGGER order_operations_events_no_delete');const before=names(f);await rejects(f.read(),'STORAGE_INVALID',503);await rejects(f.mutate({request_id:crypto.randomUUID(),revision:1,identity:{platform:'SHOPEE_BR',shop_id:'1178167501',order_id:'ORDER_0001'},source_hash:'a'.repeat(64),from_stage:'SEPARATION',to_stage:'PRODUCTION',reason:'Conferido',confirmed:true}),'STORAGE_INVALID',503);assert.deepEqual(names(f),before);
 const other=await fixture();t.after(other.close);await other.db.batch([other.db.prepare(ORDER_OPERATIONS_SCHEMA[0])]);await rejects(other.read(),'STORAGE_INVALID',503);
});

test('a provider update racing the atomic write prevents the entire stage event',async t=>{
 const f=await fixture();t.after(f.close);const req=body(await f.read()),batch=f.db.batch.bind(f.db);let once=false;f.db.batch=async statements=>{if(names(f).length===ORDER_OPERATIONS_SCHEMA.length&&!once){once=true;f.db.db.prepare("UPDATE production_dtf_orders SET status='CANCELLED',update_time=update_time+1").run();}return batch(statements);};await rejects(f.mutate(req),'SOURCE_CHANGED');assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM order_operations_events').get().n,0);assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM order_operations_state').get().n,0);
});

test('partially refreshed lines and tampered raw quantities block GET and direct POST without a fabricated subtotal',async t=>{
 const f=await fixture();t.after(f.close);const original=body(await f.read());f.db.db.prepare('UPDATE production_dtf_lines SET checked_at=checked_at-1').run();
 let frame=await f.read();assert.equal(frame.orders[0].can_update,false);assert.equal(frame.orders[0].selling_units,null);assert.ok(frame.orders[0].blocked_reasons.includes('SOURCE_CONFLICT'));await rejects(f.mutate(original),'SOURCE_CHANGED');
 f.db.db.prepare('UPDATE production_dtf_lines SET checked_at=checked_at+1,payload=json_set(payload,\'$.quantity\',7)').run();frame=await f.read();assert.equal(frame.orders[0].can_update,false);assert.equal(frame.orders[0].selling_units,null);await rejects(f.mutate(original),'SOURCE_CHANGED');assert.deepEqual(names(f),[]);
});

test('line overflow is explicit and never presents a truncated quantity as the complete order quantity',async t=>{
 const f=await fixture({count:0});t.after(f.close);await f.seed('LARGE',{},205);const frame=await f.read(),row=frame.orders[0];assert.equal(row.lines_total,205);assert.equal(row.lines.length,8);assert.equal(row.lines_limited,true);assert.equal(row.selling_units,null);assert.equal(row.can_update,false);assert.ok(row.blocked_reasons.includes('SOURCE_INCOMPLETE'));await rejects(f.mutate(body(frame)),'SOURCE_CHANGED');
});

test('inclusive 31-day selections and final midnight boundary use Brasilia without moving dates',async t=>{
 const f=await fixture({count:0});t.after(f.close);await f.seed('END_INCLUDED',{create_time:Date.parse('2026-11-11T02:59:59Z')/1000});await f.seed('AFTER_END',{create_time:Date.parse('2026-11-11T03:00:00Z')/1000});
 const frame=await f.read(selection({start_date:'2026-10-11',end_date:'2026-11-10'}));assert.equal(frame.totals.orders,1);assert.equal(frame.orders[0].identity.order_id,'END_INCLUDED');await rejects(f.read(selection({start_date:'2026-10-10',end_date:'2026-11-10'})),'REQUEST_INVALID',400);
});

test('first and restarted-isolate owner mutations stay below D1 free-tier query budget',async t=>{
 const f=await fixture();t.after(f.close);let calls=0,maxBindings=0;const prepare=f.db.prepare.bind(f.db);f.db.prepare=sql=>{calls++;const statement=prepare(sql),bind=statement.bind.bind(statement);statement.bind=(...args)=>{maxBindings=Math.max(maxBindings,args.length);return bind(...args);};return statement;};
 let req=body(await f.read());calls=0;await f.mutate(req);assert.ok(calls<=20,'first mutation query count '+calls);req=body(await f.read());calls=0;await f.mutate(req);assert.ok(calls<=12,'existing schema mutation query count '+calls);assert.ok(maxBindings<=20);assert.ok(calls<50);
});

test('changed quantities, new items and removed items require review instead of inheriting ready-to-ship confirmation',async t=>{
 for(const change of [{quantity:7},{new_item:'2010'},{remove_first:true}]){
  const f=await fixture({count:0});t.after(f.close);await f.seed('CHANGED',{},2);for(let n=0;n<4;n++)await f.mutate(body(await f.read()));
  const original=f.db.db.prepare('SELECT * FROM order_operations_events WHERE revision=4').get();await observe(f,'CHANGED',change);
  let frame=await f.read(),row=frame.orders[0];assert.equal(row.operation.stage,'READY_TO_SHIP');assert.equal(row.operation.lines_changed,true);assert.equal(row.display_stage,'REVIEW');assert.equal(row.can_update,true);assert.equal(frame.totals.by_stage.READY_TO_SHIP,0);assert.equal(frame.totals.by_stage.REVIEW,1);assert.equal((await f.read(selection({status:'READY_TO_SHIP'}))).pagination.total_orders,0);assert.equal((await f.read(selection({status:'REVIEW'}))).pagination.total_orders,1);
  await f.mutate(body(frame,{to_stage:'READY_TO_SHIP',reason:'Itens e quantidades conferidos novamente'}));frame=await f.read();row=frame.orders[0];assert.equal(row.operation.stage,'READY_TO_SHIP');assert.equal(row.operation.lines_changed,false);assert.equal(row.display_stage,'READY_TO_SHIP');assert.equal(frame.totals.by_stage.READY_TO_SHIP,1);assert.deepEqual(f.db.db.prepare('SELECT * FROM order_operations_events WHERE revision=4').get(),original);assert.notEqual(f.db.db.prepare('SELECT line_fingerprint FROM order_operations_events WHERE revision=5').get().line_fingerprint,original.line_fingerprint);
 }
});

test('provider status and observation clocks do not invalidate the same owner-confirmed set of lines',async t=>{
 const f=await fixture();t.after(f.close);for(let n=0;n<2;n++)await f.mutate(body(await f.read()));const id=(await f.read()).orders[0].identity.order_id;
 await observe(f,id,{status:'PROCESSED'});let row=(await f.read()).orders[0];assert.equal(row.provider.status,'PROCESSED');assert.equal(row.operation.stage,'PRODUCTION');assert.equal(row.operation.lines_changed,false);assert.equal(row.display_stage,'PRODUCTION');assert.equal(row.can_update,true);
 await observe(f,id,{checked_only:true});row=(await f.read()).orders[0];assert.equal(row.operation.lines_changed,false);assert.equal(row.display_stage,'PRODUCTION');
 await observe(f,id,{status:'SHIPPED'});row=(await f.read()).orders[0];assert.equal(row.display_stage,'SHIPPED');assert.equal(row.operation.stage,'PRODUCTION');assert.equal(row.operation.lines_changed,false);assert.equal(row.can_update,false);
});

test('line fingerprints use matching binary key order and exact Unicode/quote representation in SQL totals',async t=>{
 const f=await fixture({count:0});t.after(f.close);await f.seed('UNICODE',{},2);await observe(f,'UNICODE',{new_item:'2010',model_name:'Azul / G · "criança" / 😀'});let frame=await f.read();await f.mutate(body(frame));frame=await f.read();assert.equal(frame.orders[0].operation.lines_changed,false);assert.equal(frame.orders[0].display_stage,'SEPARATION');assert.equal(frame.totals.by_stage.SEPARATION,1);assert.equal(frame.totals.by_stage.REVIEW,0);
});
