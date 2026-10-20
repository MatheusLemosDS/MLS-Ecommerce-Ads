import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {D1} from './sqlite-d1.mjs';
import {OBSERVATION_SCHEMA,ObservationError,captureObservation,listObservations,readObservation} from '../src/order-observations.mjs';

const now=new Date('2026-10-15T15:30:00.000Z');
const binding=(item_id='101',model_id='1',male_size='M',female_size='G')=>({item_id,model_id,male_size,female_size,selling_unit:'ONE_MALE_ONE_FEMALE_KIT',operator_confirmed:true});
const settings=()=>({regular_cents:1675,mixed_cents:1910,plus_cents:2070,ad_share_percent:40,hermes_mode:'manual',billing_mode:'subscription',private_extra:'PRIVATE_SETTING'});
function frame(){return {schema:'shop_order_items_v1',shop_id:1178167501,date:'2026-10-15',timezone:'America/Sao_Paulo',through_at:'2026-10-15T12:29:00.123456-03:00',day_partial:true,pagination_complete:true,pages_read:1,orders_in_api_window:2,orders_with_details:2,duplicate_rows:0,catalog_units:3,rows:[{item_id:'101',model_id:'1',order_status:'READY_TO_SHIP',quantity:2,line_count:1},{item_id:'101',model_id:'2',order_status:'UNPAID',quantity:1,line_count:1}],currency_status:'BRL_ALL_CONFIRMED',currency_counts:{BRL:2,OTHER:0,UNKNOWN:0},order_status_verified:true,source:'shopee_get_order_list_and_detail',transport_http:200,api_error:'NO',count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER',order_status_filter:'NONE',dashboard_counter_reconciled:false};}
async function fixture(){
 const env={ADMIN_DB:new D1()};
 await env.ADMIN_DB.batch([
  ...OBSERVATION_SCHEMA.map(sql=>env.ADMIN_DB.prepare(sql)),
  env.ADMIN_DB.prepare('CREATE TABLE admin_settings(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)'),
  env.ADMIN_DB.prepare('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)'),
  env.ADMIN_DB.prepare('CREATE TABLE hermes_jobs(id TEXT PRIMARY KEY)'),
 ]);
 await env.ADMIN_DB.prepare('INSERT INTO admin_settings VALUES(1,7,?,?)').bind(JSON.stringify(settings()),now.toISOString()).run();
 await env.ADMIN_DB.prepare('INSERT INTO variant_bindings_state VALUES(1,4,?,?)').bind(JSON.stringify([binding(),binding('999','0','G1','G3')]),now.toISOString()).run();
 return env;
}
function count(env){return env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM order_observations').get().n;}
async function expectError(promise,status,code){await assert.rejects(promise,error=>error instanceof ObservationError&&error.status===status&&(!code||error.message===code));}
function updateContext(env,{settingsPayload,settingsRevision,bindingsPayload,bindingsRevision}={}){
 if(settingsPayload!==undefined)env.ADMIN_DB.db.prepare('UPDATE admin_settings SET payload=? WHERE id=1').run(settingsPayload);
 if(settingsRevision!==undefined)env.ADMIN_DB.db.prepare('UPDATE admin_settings SET revision=? WHERE id=1').run(settingsRevision);
 if(bindingsPayload!==undefined)env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET payload=? WHERE id=1').run(bindingsPayload);
 if(bindingsRevision!==undefined)env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET revision=? WHERE id=1').run(bindingsRevision);
}
const capture=(env,source=frame(),time=now)=>captureObservation(env,async()=>source,'admin',time);

test('explicit capture projects one complete source and stores only matching confirmed context',async()=>{
 const env=await fixture();let reads=0;
 const raw=frame();raw.access_token='PRIVATE_TOKEN';raw.buyer={name:'PRIVATE_BUYER'};raw.rows[0].order_sn='PRIVATE_ORDER';
 const result=await captureObservation(env,async received=>{assert.equal(received,env);reads++;return raw;},'admin',now);
 assert.equal(reads,1);assert.equal(result.deduplicated,false);assert.equal(count(env),1);
 const value=result.observation;
 assert.match(value.id,/^[a-f0-9]{64}$/);assert.equal(value.saved_at,now.toISOString());
 assert.equal(value.schema,'order_observation_v1');assert.equal(value.coverage,'PARTIAL_DAY_SNAPSHOT');assert.equal(value.ads_execution,'LOCKED');assert.equal(value.economic_status,'UNKNOWN');assert.equal(value.hermes_context,'NOT_ATTACHED');
 assert.equal(value.source_snapshot.status,'AVAILABLE');assert.ok(!Object.hasOwn(value.source_snapshot,'snapshot_age_seconds'));
 assert.deepEqual(value.settings_snapshot,{revision:7,values:{regular_cents:1675,mixed_cents:1910,plus_cents:2070,ad_share_percent:40}});
 assert.deepEqual(value.bindings_snapshot,{revision:4,bindings:[binding()]});
 assert.equal(value.margin_reference.known_subset_cents,3350);assert.equal(value.margin_reference.total_cents,null);assert.equal(value.margin_reference.mapped_quantity,2);assert.equal(value.margin_reference.unmapped_quantity,1);
 assert.equal(value.margin_reference.status_scope,'ALL_RETURNED_STATUSES_REFERENCE_ONLY');assert.equal(value.margin_reference.margin_stage,'AFTER_FEES_AND_PRODUCT_COST_BEFORE_ADS');
 assert.ok(!JSON.stringify(value).includes('PRIVATE'));assert.ok(!JSON.stringify(value).includes('999'));
 assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM hermes_jobs').get().n,0);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT revision FROM admin_settings').get().revision,7);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT revision FROM variant_bindings_state').get().revision,4);
});
test('context is selected in one transactional D1 batch and copied before subsequent edits',async()=>{
 const env=await fixture(),originalBatch=env.ADMIN_DB.batch.bind(env.ADMIN_DB);let batches=0;
 env.ADMIN_DB.batch=async statements=>{batches++;assert.equal(statements.length,2);const result=await originalBatch(statements);updateContext(env,{settingsPayload:JSON.stringify({...settings(),regular_cents:999}),settingsRevision:8,bindingsPayload:'[]',bindingsRevision:5});return result;};
 const {observation}=await capture(env);
 assert.equal(batches,1);assert.equal(observation.settings_snapshot.revision,7);assert.equal(observation.bindings_snapshot.revision,4);assert.equal(observation.margin_reference.known_subset_cents,3350);
});
test('production clock records write time and rejects a midnight transition before persistence',async()=>{
 const env=await fixture(),RealDate=Date;
 let moments=[new RealDate('2026-10-15T15:30:00.000Z'),new RealDate('2026-10-15T15:31:00.000Z')];
 globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[moments.shift().getTime()]));}};
 try{const {observation}=await captureObservation(env,async()=>frame(),'admin');assert.equal(observation.saved_at,'2026-10-15T15:31:00.000Z');}
 finally{globalThis.Date=RealDate;}
 const before=count(env),late={...frame(),through_at:'2026-10-15T23:59:58-03:00'};
 moments=[new RealDate('2026-10-16T02:59:59.000Z'),new RealDate('2026-10-16T03:00:01.000Z')];
 globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[moments.shift().getTime()]));}};
 try{await expectError(captureObservation(env,async()=>late,'admin'),503,'OBSERVATION_SOURCE_UNAVAILABLE');}
 finally{globalThis.Date=RealDate;}
 assert.equal(count(env),before);
});
test('unavailable, stale, incomplete, diagnostic and throwing sources never become zero observations',async()=>{
 const sources=[null,undefined,{...frame(),date:'2026-10-14',through_at:'2026-10-14T12:29:00-03:00'},{...frame(),pagination_complete:false},{...frame(),diagnostic:{stage:'AUTH_TO_GATEWAY',code:'HTTP_STATUS',http:503,secret:'PRIVATE'}}];
 const env=await fixture();for(const source of sources)await expectError(captureObservation(env,async()=>source,'admin',now),503,'OBSERVATION_SOURCE_UNAVAILABLE');
 let reads=0;await expectError(captureObservation(env,async()=>{reads++;throw new Error('PRIVATE_ERROR');},'admin',now),503,'OBSERVATION_SOURCE_UNAVAILABLE');assert.equal(reads,1);
 await expectError(captureObservation(env,null,'admin',now),503,'OBSERVATION_SOURCE_UNAVAILABLE');
 await expectError(captureObservation(env,async()=>frame(),'PRIVATE_ACTOR',now),400,'OBSERVATION_ACTOR_INVALID');
 assert.equal(count(env),0);
});
test('valid empty full pagination is retained as zero without inventing BRL confirmation',async()=>{
 const env=await fixture(),empty={...frame(),orders_in_api_window:0,orders_with_details:0,catalog_units:0,rows:[],currency_counts:{BRL:0,OTHER:0,UNKNOWN:0},currency_status:'MIXED_OR_UNKNOWN'};
 const {observation}=await capture(env,empty);
 assert.equal(observation.source_snapshot.catalog_units,0);assert.equal(observation.source_snapshot.currency_status,'MIXED_OR_UNKNOWN');assert.deepEqual(observation.bindings_snapshot.bindings,[]);assert.equal(observation.margin_reference.total_cents,0);assert.equal(observation.margin_reference.known_subset_cents,0);
});
test('identical content deduplicates despite source row order, binding order, actor omission and later clock',async()=>{
 const env=await fixture(),first=await capture(env);
 const reversed=frame();reversed.rows.reverse();
 updateContext(env,{bindingsPayload:JSON.stringify([binding('999','0','G1','G3'),binding()])});
 const repeated=await captureObservation(env,async()=>reversed,undefined,new Date(now.getTime()+600000));
 assert.equal(repeated.deduplicated,true);assert.deepEqual(repeated.observation,first.observation);assert.equal(count(env),1);
 const row=env.ADMIN_DB.db.prepare('SELECT saved_at FROM order_observations').get();assert.equal(row.saved_at,now.toISOString());
});
test('concurrent identical captures keep one first saved record',async()=>{
 const env=await fixture();
 // Serialize native SELECT batches as D1 does while allowing hash/insert interleaving.
 const batch=env.ADMIN_DB.batch.bind(env.ADMIN_DB);let tail=Promise.resolve();env.ADMIN_DB.batch=statements=>{const result=tail.then(()=>batch(statements));tail=result.catch(()=>{});return result;};
 const results=await Promise.all([capture(env),capture(env),capture(env)]);
 assert.equal(count(env),1);assert.equal(results.filter(value=>!value.deduplicated).length,1);assert.deepEqual(results[0].observation,results[1].observation);
});
test('saved observations stay immutable after margin or binding revisions and across midnight',async()=>{
 const env=await fixture(),first=await capture(env);
 updateContext(env,{settingsPayload:JSON.stringify({...settings(),regular_cents:2222}),settingsRevision:8,bindingsPayload:JSON.stringify([binding('101','1','G1','G2'),binding('101','2','M','GG')]),bindingsRevision:5});
 const second=await capture(env);
 assert.notEqual(second.observation.id,first.observation.id);assert.equal(second.observation.settings_snapshot.revision,8);assert.equal(second.observation.bindings_snapshot.revision,5);assert.equal(second.observation.margin_reference.total_cents,6362);
 // The source date is deliberately independent of the actual test-machine date.
 const retained=await readObservation(env,first.observation.id);assert.deepEqual(retained,first.observation);assert.equal(retained.margin_reference.total_cents,null);assert.equal(retained.margin_reference.known_subset_cents,3350);
 const listing=await listObservations(env,new URLSearchParams());assert.equal(listing.rows.length,2);assert.equal(count(env),2);
});
test('single garment observations retain composition without inheriting kit margins or changing historic kit hashes',async()=>{
 const env=await fixture(),first=await capture(env),retained=env.ADMIN_DB.db.prepare('SELECT payload FROM order_observations WHERE id=?').get(first.observation.id).payload;
 const single=model_id=>({item_id:'101',model_id,size:model_id==='1'?'M':'G2',selling_unit:'SINGLE_GARMENT',operator_confirmed:false,source:'CATALOG_SIZE_AXIS',catalog_fingerprint:'a'.repeat(64)});
 updateContext(env,{bindingsPayload:JSON.stringify([single('1'),single('2')]),bindingsRevision:5});
 const second=await capture(env),value=second.observation;
 assert.notEqual(value.id,first.observation.id);assert.deepEqual(value.bindings_snapshot.bindings,[single('1'),single('2')]);assert.equal(value.margin_reference.total_cents,null);assert.equal(value.margin_reference.known_subset_cents,0);assert.equal(value.margin_reference.mapped_quantity,0);assert.equal(value.margin_reference.unmapped_quantity,3);assert.equal(value.margin_reference.unpriced_quantity,3);
 assert.ok(value.margin_reference.variants.every(row=>row.unit_margin_cents===null&&row.contribution_cents===null));
 assert.deepEqual(await readObservation(env,value.id),value);
 assert.deepEqual(await readObservation(env,first.observation.id),first.observation);assert.equal(env.ADMIN_DB.db.prepare('SELECT payload FROM order_observations WHERE id=?').get(first.observation.id).payload,retained);assert.equal(Object.hasOwn(first.observation.margin_reference,'unpriced_quantity'),false);
 const listed=await listObservations(env);assert.equal(listed.rows.length,2);assert.equal(listed.rows.find(row=>row.id===value.id).known_subset_cents,0);
 const repeated=await capture(env);assert.equal(repeated.deduplicated,true);assert.equal(repeated.observation.id,value.id);
 const tampered={...value,margin_reference:{...value.margin_reference,unpriced_quantity:2}};env.ADMIN_DB.db.prepare('UPDATE order_observations SET payload=? WHERE id=?').run(JSON.stringify(tampered),value.id);
 await expectError(readObservation(env,value.id),503,'OBSERVATION_INVALID_SNAPSHOT');
});
test('saved settings require exact present integer cents and revisions without defaults',async()=>{
 const bad=[null,{},'{',JSON.stringify({...settings(),regular_cents:0}),JSON.stringify({...settings(),mixed_cents:1.5}),JSON.stringify({...settings(),plus_cents:1000001}),JSON.stringify({...settings(),ad_share_percent:0}),JSON.stringify({...settings(),ad_share_percent:101}),JSON.stringify({...settings(),regular_cents:'1675'})];
 for(const raw of bad){const env=await fixture();updateContext(env,{settingsPayload:raw===null?'null':typeof raw==='object'?JSON.stringify(raw):raw});await expectError(capture(env),503);assert.equal(count(env),0);}
 const env=await fixture();updateContext(env,{settingsRevision:0});await expectError(capture(env),503);assert.equal(count(env),0);
});
test('unconfirmed, duplicate, malformed or irrelevant private binding state is rejected as a whole',async()=>{
 const bad=['{','null',JSON.stringify([{...binding(),operator_confirmed:false}]),JSON.stringify([binding(),binding()]),JSON.stringify([binding(),{...binding('999','0'),buyer:'PRIVATE'}])];
 for(const bindingsPayload of bad){const env=await fixture();updateContext(env,{bindingsPayload});await expectError(capture(env),503);assert.equal(count(env),0);}
 const env=await fixture();updateContext(env,{bindingsRevision:0});await expectError(capture(env),503);assert.equal(count(env),0);
});
test('unsafe contribution arithmetic fails without insert',async()=>{
 const env=await fixture(),huge=frame();huge.rows=[{...huge.rows[0],quantity:Number.MAX_SAFE_INTEGER,line_count:2}];huge.catalog_units=Number.MAX_SAFE_INTEGER;
 await expectError(capture(env,huge),503);assert.equal(count(env),0);
});
test('maximum row and binding counts fit the explicit UTF8 bound; oversized DB records are rejected',async()=>{
 const env=await fixture(),large=frame(),rows=[],bindings=[];
 for(let i=0;i<1000;i++){const id=String(10000000000000000000n+BigInt(i));rows.push({item_id:id,model_id:'99999999999999999999',order_status:'INVOICE_PENDING',quantity:1,line_count:1});bindings.push(binding(id,'99999999999999999999','G3','G3'));}
 Object.assign(large,{rows,catalog_units:1000,orders_in_api_window:1000,orders_with_details:1000,pages_read:10,currency_counts:{BRL:1000,OTHER:0,UNKNOWN:0}});updateContext(env,{bindingsPayload:JSON.stringify(bindings)});
 const {observation}=await capture(env,large),row=env.ADMIN_DB.db.prepare('SELECT payload FROM order_observations WHERE id=?').get(observation.id);
 assert.ok(Buffer.byteLength(row.payload,'utf8')<=524288);assert.equal(observation.source_snapshot.rows.length,1000);assert.equal(observation.bindings_snapshot.bindings.length,1000);
 env.ADMIN_DB.db.prepare('UPDATE order_observations SET payload=? WHERE id=?').run(row.payload+' '.repeat(786433-Buffer.byteLength(row.payload,'utf8')),observation.id);
 await expectError(readObservation(env,observation.id),503,'OBSERVATION_INVALID_SNAPSHOT');assert.equal(count(env),1);
});
test('list uses stable keyset pagination with equal timestamps and exact slim metadata',async()=>{
 const env=await fixture();
 for(let i=1;i<=21;i++){const raw=frame();raw.rows[0].quantity=i;raw.catalog_units=i+1;await capture(env,raw);}
 const first=await listObservations(env,new URLSearchParams());assert.equal(first.rows.length,20);assert.ok(first.next_cursor);assert.ok(first.next_cursor.length<=256);
 assert.deepEqual(Object.keys(first.rows[0]).sort(),['id','saved_at','date','through_at','catalog_units','orders_in_api_window','settings_revision','bindings_revision','known_subset_cents','total_cents','unmapped_quantity','mapped_quantity'].sort());
 const next=await listObservations(env,new URLSearchParams({cursor:first.next_cursor}));assert.equal(next.rows.length,1);assert.equal(next.next_cursor,null);
 const all=[...first.rows,...next.rows];assert.equal(new Set(all.map(row=>row.id)).size,21);assert.deepEqual(all.map(row=>row.id),all.map(row=>row.id).sort().reverse());
 assert.equal((await listObservations(env,new URLSearchParams({limit:'2'}))).rows.length,2);
 assert.ok(!JSON.stringify(first.rows).includes('bindings_snapshot'));assert.ok(!JSON.stringify(first.rows).includes('PRIVATE'));
});
test('keyset pagination does not repeat rows after a newer capture is inserted',async()=>{
 const env=await fixture();for(let i=1;i<=3;i++){const raw=frame();raw.rows[0].quantity=i;raw.catalog_units=i+1;await capture(env,raw);}
 const first=await listObservations(env,new URLSearchParams({limit:'2'}));
 const raw=frame();raw.rows[0].quantity=10;raw.catalog_units=11;await capture(env,raw,new Date(now.getTime()+1000));
 const next=await listObservations(env,new URLSearchParams({limit:'2',cursor:first.next_cursor}));assert.equal(next.rows.length,1);assert.ok(!first.rows.some(row=>row.id===next.rows[0].id));assert.equal(next.next_cursor,null);
});
test('query, cursor and ID grammar rejects unknown, duplicate, noncanonical and oversized inputs',async()=>{
 const env=await fixture();
 for(const query of ['unknown=1','limit=0','limit=21','limit=01','limit=1&limit=2','cursor=','cursor=a&cursor=b','cursor=hello+world','cursor='+('x'.repeat(257))])await expectError(listObservations(env,new URLSearchParams(query)),400);
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 for(const value of [{saved_at:now.toISOString(),id:'a'.repeat(64),secret:'PRIVATE'},[now.toISOString(),'a'.repeat(64)],{id:'a'.repeat(64),saved_at:now.toISOString()},{saved_at:'2026-10-15T15:30:00Z',id:'a'.repeat(64)},{saved_at:now.toISOString(),id:'A'.repeat(64)}])await expectError(listObservations(env,new URLSearchParams({cursor:encode(value)})),400,'OBSERVATION_CURSOR_INVALID');
 for(const id of ['',null,'A'.repeat(64),'a'.repeat(63),"' OR 1=1"])await expectError(readObservation(env,id),400,'OBSERVATION_ID_INVALID');
 await expectError(readObservation(env,'a'.repeat(64)),404,'OBSERVATION_NOT_FOUND');
});
test('historic data is independently verified and private DB extras or tampering fail closed',async()=>{
 const env=await fixture(),{observation}=await capture(env),original=env.ADMIN_DB.db.prepare('SELECT * FROM order_observations').get();
 const changes=[value=>value.private='PRIVATE',value=>value.source_snapshot.buyer='PRIVATE',value=>value.source_snapshot.rows[0].order_sn='PRIVATE',value=>value.source_snapshot.catalog_units=99,value=>value.settings_snapshot.values.regular_cents=999,value=>value.bindings_snapshot.bindings.push(binding('999','0')),value=>value.margin_reference.known_subset_cents=100000,value=>value.coverage='FULL_DAY',value=>value.hermes_context='ATTACHED',value=>value.saved_at='2026-10-16T15:30:00.000Z'];
 for(const change of changes){const value=JSON.parse(original.payload);change(value);env.ADMIN_DB.db.prepare('UPDATE order_observations SET payload=? WHERE id=?').run(JSON.stringify(value),original.id);await expectError(readObservation(env,observation.id),503,'OBSERVATION_INVALID_SNAPSHOT');}
 env.ADMIN_DB.db.prepare('UPDATE order_observations SET payload=?,saved_at=? WHERE id=?').run(original.payload,'2026-10-16T15:30:00.000Z',original.id);await expectError(readObservation(env,original.id),503,'OBSERVATION_INVALID_SNAPSHOT');
});
test('list projects only allowlisted scalars and validates their shape without loading full snapshots',async()=>{
 const env=await fixture(),{observation}=await capture(env),original=env.ADMIN_DB.db.prepare('SELECT * FROM order_observations').get();
 const value=JSON.parse(original.payload);value.private='PRIVATE';value.source_snapshot.rows[0].buyer='PRIVATE';env.ADMIN_DB.db.prepare('UPDATE order_observations SET payload=? WHERE id=?').run(JSON.stringify(value),original.id);
 const prepare=env.ADMIN_DB.prepare.bind(env.ADMIN_DB),queries=[];env.ADMIN_DB.prepare=sql=>{queries.push(sql);return prepare(sql);};
 const listed=await listObservations(env);assert.equal(listed.rows[0].id,observation.id);assert.ok(!JSON.stringify(listed).includes('PRIVATE'));assert.equal(queries.length,1);assert.match(queries[0],/json_extract\(payload/);assert.doesNotMatch(queries[0],/SELECT id,saved_at,payload/);
 // Detail performs the separate whole-record hash/shape verification.
 await expectError(readObservation(env,observation.id),503,'OBSERVATION_INVALID_SNAPSHOT');
 const changes=[row=>row.source_snapshot.catalog_units=99,row=>row.settings_snapshot.revision=0,row=>row.margin_reference.known_subset_cents=-1,row=>row.margin_reference.total_cents=1,row=>row.margin_reference.unmapped_quantity=0,row=>row.source_snapshot.date='2026-02-30',row=>row.source_snapshot.through_at='2026-10-15T12:29:00Z',row=>row.ads_execution='UNLOCKED',row=>row.coverage='FULL_DAY',row=>row.hermes_context='ATTACHED'];
 for(const change of changes){const current=JSON.parse(original.payload);change(current);env.ADMIN_DB.db.prepare('UPDATE order_observations SET payload=? WHERE id=?').run(JSON.stringify(current),original.id);await expectError(listObservations(env),503,'OBSERVATION_INVALID_SNAPSHOT');}
 env.ADMIN_DB.db.prepare('UPDATE order_observations SET payload=? WHERE id=?').run('{',original.id);await expectError(listObservations(env),503);
});
test('module has append-only persistence with no updates, deletes, jobs or source writes',()=>{
 const source=readFileSync(new URL('../src/order-observations.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\b(?:UPDATE|DELETE)\s+(?:FROM|order_observations|admin_settings|variant_bindings)/i);
 assert.doesNotMatch(source,/hermes_jobs|\/api\/shopee\//);
 assert.match(source,/INSERT OR IGNORE INTO order_observations/);
});
