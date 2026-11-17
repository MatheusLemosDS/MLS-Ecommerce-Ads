import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {D1} from './sqlite-d1.mjs';
import {PRODUCTION_DTF_SCHEMA} from '../src/production-dtf-store.mjs';
import {ORDER_OPERATIONS_SCHEMA,readOrderOperationsWorkspace} from '../src/order-operations.mjs';
const hash=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const at=Date.parse('2026-11-16T18:00:00Z'),stamp=at/1000;

test('1200-order board skips recipe normalization for absent stages and identical raw snapshots',async t=>{
 const db=new D1(),env={ADMIN_DB:db};t.after(()=>db.db.close());await db.batch([...PRODUCTION_DTF_SCHEMA,...ORDER_OPERATIONS_SCHEMA].map(sql=>db.prepare(sql)));
 const order=db.db.prepare('INSERT INTO production_dtf_orders VALUES(?,?,?,?,?,?)'),line=db.db.prepare('INSERT INTO production_dtf_lines(unit_key,order_id,line_key,payload,source_hash,checked_at,missing) VALUES(?,?,?,?,?,?,0)'),event=db.db.prepare('INSERT INTO order_operations_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)');let staged=0;
 db.db.exec('BEGIN');
 for(let i=0;i<1200;i++){
  const id='ORDER_'+String(i).padStart(4,'0'),item=String(1000+i),lineKey=item+':0',key=hash([id,lineKey]),payload=JSON.stringify({item_id:item,model_id:'0',sku:'front-10',quantity:1,model_name:'Synthetic kit',requires_pair:true}),lineHash=hash(payload),sourceHash=hash({status:'READY_TO_SHIP',create_time:stamp-10800,update_time:stamp-3600,lines:[[lineKey,hash([item,'0','front-10',1,'Synthetic kit'])]]});
  order.run(id,'READY_TO_SHIP',stamp-10800,stamp-3600,stamp,sourceHash);line.run(key,id,lineKey,payload,lineHash,stamp);
  if(i>=600){staged++;const snapshot=JSON.stringify([{unit_key:key,line_key:lineKey,payload,source_hash:lineHash}]);event.run(staged,crypto.randomUUID(),hash(id),'SHOPEE_BR','1178167501',id,sourceHash,hash(snapshot),snapshot,null,'SEPARATION','Synthetic checked stage','synthetic-owner',stamp);}
 }
 db.db.prepare('INSERT INTO order_operations_state VALUES(1,?,?,?)').run(staged,crypto.randomUUID(),stamp);db.db.exec('COMMIT');const before=db.db.prepare('SELECT * FROM order_operations_events ORDER BY revision').all();
 // Instrument the actual emitted SQL, not a second implementation of the
 // normalizer. This UDF has the same result as json_valid for these textual
 // payloads, and counts calls that SQLite evaluates inside the read queries.
 let normalizations=0;db.db.function('observe_recipe_json_valid',value=>{normalizations++;try{JSON.parse(value);return 1;}catch{return 0;}});const prepare=db.prepare.bind(db),queries=[];
 db.prepare=sql=>{queries.push(sql);return prepare(sql.replaceAll('json_valid(','observe_recipe_json_valid('));};
 const read=(page=1)=>readOrderOperationsWorkspace(env,{start_date:'2026-11-16',end_date:'2026-11-16',status:'ALL',page},{now:()=>at});
 const started=performance.now(),first=await read(),elapsed=performance.now()-started;t.diagnostic(JSON.stringify({orders:1200,staged:600,normalizations,elapsed_ms:elapsed}));
 assert.equal(first.pagination.total_orders,1200);assert.equal(first.totals.by_stage.SEPARATION,600);assert.equal(first.totals.by_stage.NOT_STARTED,600);assert.equal(first.totals.by_stage.REVIEW,0);assert.equal(normalizations,0,'neither unstaged orders nor byte-identical snapshots need semantic JSON comparison');
 const row=db.db.prepare("SELECT * FROM production_dtf_lines WHERE order_id='ORDER_1199'").get(),payload={...JSON.parse(row.payload),sku:'front-10+back-10',source_sku:'front-10',recipe_request_id:crypto.randomUUID()},raw=JSON.stringify(payload);db.db.prepare('UPDATE production_dtf_lines SET payload=?,source_hash=? WHERE unit_key=?').run(raw,hash(raw),row.unit_key);
 normalizations=0;const changed=await read(24);t.diagnostic(JSON.stringify({recipe_changes:1,normalizations}));assert.ok(normalizations>0&&normalizations<=32,'only the changed recipe enters the correlated normalizer');assert.equal(changed.totals.by_stage.SEPARATION,600);assert.equal(changed.totals.by_stage.REVIEW,0);assert.equal(changed.orders.find(v=>v.identity.order_id==='ORDER_1199').operation.lines_changed,false);assert.equal(changed.orders.find(v=>v.identity.order_id==='ORDER_1199').can_update,true);assert.deepEqual(db.db.prepare('SELECT * FROM order_operations_events ORDER BY revision').all(),before);
 assert.ok(queries.filter(sql=>sql.includes('json_valid(')).length>=3,'the real board, count and page queries were observed');
});
