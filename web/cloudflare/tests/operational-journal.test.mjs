import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {commercialContextFromPrincipal} from '../src/commercial-context.mjs';
import {createTenantDatabase} from '../src/tenant-storage.mjs';
import {readOperationalEntity,listOperationalEntities,readOperationalHistory,mutateOperationalEntity} from '../src/operational-journal.mjs';

const now=()=>Date.parse('2026-11-20T23:00:00.000Z');
const kind='PHYSICAL_SHIRTS',identity='a'.repeat(64);
const selected=(patch={})=>({kind,entity_id:identity,...patch});
const command=(patch={})=>({...selected(),expected_revision:0,request_id:crypto.randomUUID(),command:{action:'add',quantity:4},...patch});
const options=(patch={})=>({readCapability:'production.read',writeCapability:'production.write',actor:'owner@example.invalid',now,transition:(payload,command)=>({quantity:(payload?.quantity??0)+command.quantity}),...patch});
const fixture=()=>{const db=new D1();return {db,env:{ADMIN_DB:db},close:()=>db.db.close()};};
const count=(db,table)=>db.db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n;

test('cold entity/list/history reads perform no DDL and unknown inventory remains null',async()=>{
 const f=fixture();try{
  const entity=await readOperationalEntity(f.env,selected(),options());assert.equal(entity.revision,0);assert.equal(entity.payload,null);assert.equal(entity.hash,null);
  assert.deepEqual((await listOperationalEntities(f.env,{kind,cursor:null,limit:25},options())).rows,[]);
  assert.deepEqual((await readOperationalHistory(f.env,{...selected(),cursor:null,limit:25},options())).rows,[]);
  assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);
 }finally{f.close();}
});

test('entity mutation persists original command, author and immutable hash-linked revisions',async()=>{
 const f=fixture();try{
  const first=await mutateOperationalEntity(f.env,command(),options());
  const second=await mutateOperationalEntity(f.env,command({expected_revision:1,command:{action:'add',quantity:3}}),options());
  assert.equal(first.payload.quantity,4);assert.equal(second.payload.quantity,7);assert.equal(second.previous_hash,first.hash);assert.equal(second.actor,'owner@example.invalid');
  assert.deepEqual(await readOperationalEntity(f.env,selected(),options()),second);
  const history=await readOperationalHistory(f.env,{...selected(),cursor:null,limit:25},options());assert.deepEqual(history.rows.map(r=>r.revision),[2,1]);assert.deepEqual(history.rows[0].command,{action:'add',quantity:3});assert.equal(history.rows[0].created_at,'2026-11-20T23:00:00.000Z');
  for(const table of ['operational_entity_revisions','operational_entity_requests'])for(const verb of ['UPDATE','DELETE'])assert.throws(()=>f.db.db.exec(verb==='UPDATE'?`UPDATE ${table} SET revision=99`:`DELETE FROM ${table}`),/operational_history_immutable/);
 }finally{f.close();}
});

test('retry returns its original snapshot before transition or current-revision validation',async()=>{
 const f=fixture();try{
  const body=command(),first=await mutateOperationalEntity(f.env,body,options());await mutateOperationalEntity(f.env,command({expected_revision:1}),options());
  const replay=await mutateOperationalEntity(f.env,body,options({transition:()=>{throw Error('must not run');}}));
  assert.equal(replay.replayed,true);assert.equal(replay.revision,first.revision);assert.deepEqual(replay.payload,first.payload);assert.equal(count(f.db,'operational_entity_revisions'),2);
  for(const changed of [{command:{action:'add',quantity:5}},{expected_revision:1},{entity_id:'other'},{kind:'OTHER_KIND'}])await assert.rejects(mutateOperationalEntity(f.env,{...body,...changed},options()),e=>e.code==='OPERATIONAL_JOURNAL_REQUEST_CONFLICT'&&e.status===409);
  await assert.rejects(mutateOperationalEntity(f.env,body,options({actor:'another-owner'})),/REQUEST_CONFLICT/);
 }finally{f.close();}
});

test('stale expected revision prevents lost updates without partial audit records',async()=>{
 const f=fixture();try{
  await mutateOperationalEntity(f.env,command(),options());await assert.rejects(mutateOperationalEntity(f.env,command(),options()),e=>e.status===409&&/REVISION_CONFLICT/.test(e.code));
  assert.equal((await readOperationalEntity(f.env,selected(),options())).payload.quantity,4);assert.equal(count(f.db,'operational_entity_requests'),1);
 }finally{f.close();}
});

test('transactional CAS defeats a competing mutation between observation and write',async()=>{
 const f=fixture();try{
  const batch=f.db.batch.bind(f.db),prepare=f.db.prepare.bind(f.db),statements=new WeakMap();let armed=true;
  f.db.prepare=sql=>{const value=prepare(sql);statements.set(value,sql);return value;};
  f.db.batch=async values=>{if(armed&&values.some(s=>statements.get(s)?.startsWith('INSERT INTO operational_entity_guard'))){armed=false;await mutateOperationalEntity(f.env,command({command:{action:'add',quantity:9}}),options());}return batch(values);};
  await assert.rejects(mutateOperationalEntity(f.env,command(),options()),e=>e.status===409&&/REVISION_CONFLICT/.test(e.code));
  assert.equal((await readOperationalEntity(f.env,selected(),options())).payload.quantity,9);assert.equal(count(f.db,'operational_entity_revisions'),1);
 }finally{f.close();}
});

test('simultaneous identical retry adopts the winner without a second persisted effect',async()=>{
 const f=fixture();try{
  const batch=f.db.batch.bind(f.db),prepare=f.db.prepare.bind(f.db),statements=new WeakMap(),body=command();let armed=true;
  f.db.prepare=sql=>{const value=prepare(sql);statements.set(value,sql);return value;};
  f.db.batch=async values=>{if(armed&&values.some(s=>statements.get(s)?.startsWith('INSERT INTO operational_entity_guard'))){armed=false;await mutateOperationalEntity(f.env,body,options());}return batch(values);};
  const result=await mutateOperationalEntity(f.env,body,options());assert.equal(result.replayed,true);assert.equal(result.payload.quantity,4);assert.equal(count(f.db,'operational_entity_revisions'),1);assert.equal(count(f.db,'operational_entity_requests'),1);
 }finally{f.close();}
});

test('missing audit insert rolls back the head and snapshot in the same batch',async()=>{
 const f=fixture();try{
  const prepare=f.db.prepare.bind(f.db);let armed=true;
  f.db.prepare=sql=>armed&&sql.startsWith('INSERT INTO operational_entity_requests')?(armed=false,prepare('SELECT 0 AS dropped_audit')):prepare(sql);
  await assert.rejects(mutateOperationalEntity(f.env,command(),options()),e=>e.code==='OPERATIONAL_JOURNAL_STORAGE_WRITE_FAILED'&&e.status===503);
  assert.equal((await readOperationalEntity(f.env,selected(),options())).revision,0);assert.equal(count(f.db,'operational_entity_revisions'),0);assert.equal(count(f.db,'operational_entity_requests'),0);
 }finally{f.close();}
});

test('entity and immutable history pagination are complete and bind their cursors to kind/entity',async()=>{
 const f=fixture();try{
  for(const entity_id of ['a','b','c'])await mutateOperationalEntity(f.env,command({entity_id}),options());
  let next=null,ids=[];do{const page=await listOperationalEntities(f.env,{kind,cursor:next,limit:1},options());ids.push(...page.rows.map(r=>r.entity_id));next=page.next_cursor;}while(next);assert.deepEqual(ids,['a','b','c']);
  const first=await listOperationalEntities(f.env,{kind,cursor:null,limit:1},options());
  await assert.rejects(listOperationalEntities(f.env,{kind:'OTHER_KIND',cursor:first.next_cursor,limit:1},options()),/CURSOR_INVALID/);
  for(let revision=1;revision<=3;revision++)await mutateOperationalEntity(f.env,command({entity_id:'a',expected_revision:revision}),options());
  const history=await readOperationalHistory(f.env,{...selected({entity_id:'a'}),cursor:null,limit:2},options());assert.deepEqual(history.rows.map(r=>r.revision),[4,3]);
  const older=await readOperationalHistory(f.env,{...selected({entity_id:'a'}),cursor:history.next_cursor,limit:2},options());assert.deepEqual(older.rows.map(r=>r.revision),[2,1]);assert.equal(older.next_cursor,null);
  await assert.rejects(readOperationalHistory(f.env,{...selected({entity_id:'b'}),cursor:history.next_cursor,limit:2},options()),/CURSOR_INVALID/);
  await assert.rejects(listOperationalEntities(f.env,{kind,cursor:first.next_cursor+'=',limit:1},options()),/CURSOR_INVALID/);
 }finally{f.close();}
});

test('invalid shapes, malformed clocks, oversized payloads and invalid resolved transitions do not persist facts',async()=>{
 const f=fixture();try{
  const accessor={};Object.defineProperty(accessor,'action',{get(){throw Error('getter must not run');},enumerable:true});
  const bad=[{...command(),unexpected:1},command({entity_id:'../foreign'}),command({expected_revision:-0}),command({request_id:'invalid'}),command({command:accessor})];
  for(const value of bad)await assert.rejects(mutateOperationalEntity(f.env,value,options()));
  await assert.rejects(mutateOperationalEntity(f.env,command(),options({now:()=>NaN})),/CLOCK_INVALID/);
  await assert.rejects(mutateOperationalEntity(f.env,command(),options({transition:()=>({note:'x'.repeat(196609)})})),/PAYLOAD/);
  await assert.rejects(mutateOperationalEntity(f.env,command(),options({transition:async()=>null})),/TRANSITION_INVALID/);
  assert.equal((await readOperationalEntity(f.env,selected(),options())).revision,0);
 }finally{f.close();}
});

test('authorization is rechecked after asynchronous reads and before the atomic write',async()=>{
 const f=fixture();try{
  let calls=0;await assert.rejects(readOperationalEntity(f.env,selected(),options({assertAuthorized:()=>++calls<2})),e=>e.status===403&&/REVOKED/.test(e.code));
  calls=0;await assert.rejects(mutateOperationalEntity(f.env,command(),options({assertAuthorized:()=>++calls<2})),e=>e.status===403&&/REVOKED/.test(e.code));
  assert.equal((await readOperationalEntity(f.env,selected(),options())).revision,0);
 }finally{f.close();}
});

test('commercial permissions and namespace identity cannot be replaced by a forged or foreign context',async()=>{
 const f=fixture();try{
  const principal={kind:'account',userId:'owner-a',organizationId:'org-a',storeId:'store-a',sessionId:'session-a',membershipId:'membership-a',role:'OWNER',authorizationRevision:1,capabilities:['production.read','production.write']};
  const a=await commercialContextFromPrincipal(principal),b=await commercialContextFromPrincipal({...principal,organizationId:'org-b'}),scoped=createTenantDatabase(f.db,a);
  await assert.rejects(readOperationalEntity({ADMIN_DB:scoped,COMMERCIAL_CONTEXT:b},selected(),options()),e=>e.status===403);
  await assert.rejects(readOperationalEntity({ADMIN_DB:f.db,COMMERCIAL_CONTEXT:a},selected(),options()),e=>e.status===403);
  await assert.rejects(readOperationalEntity({ADMIN_DB:scoped},selected(),options()),e=>e.status===403);
  await assert.rejects(readOperationalEntity({ADMIN_DB:scoped,COMMERCIAL_CONTEXT:{...a}},selected(),options()),e=>e.status===403);
  await assert.rejects(mutateOperationalEntity({ADMIN_DB:scoped,COMMERCIAL_CONTEXT:a},command(),options({actor:'another-owner'})),e=>e.status===403&&/ACTOR_MISMATCH/.test(e.code));
  const readonly=await commercialContextFromPrincipal({...principal,capabilities:['production.read']}),readDb=createTenantDatabase(f.db,readonly);
  await assert.rejects(mutateOperationalEntity({ADMIN_DB:readDb,COMMERCIAL_CONTEXT:readonly},command(),options({actor:'owner-a'})),e=>e.status===403);
 }finally{f.close();}
});

test('a corrupted head cannot silently become an empty physical balance',async()=>{
 const f=fixture();try{
  await mutateOperationalEntity(f.env,command(),options());f.db.db.prepare('UPDATE operational_entity_heads SET revision=99').run();
  await assert.rejects(readOperationalEntity(f.env,selected(),options()),e=>e.code==='OPERATIONAL_JOURNAL_STORAGE_INVALID'&&e.status===503);
  await assert.rejects(listOperationalEntities(f.env,{kind,cursor:null,limit:25},options()),e=>e.code==='OPERATIONAL_JOURNAL_STORAGE_INVALID'&&e.status===503);
 }finally{f.close();}
});

test('an older but otherwise valid head cannot hide a later immutable revision',async()=>{
 const f=fixture();try{
  await mutateOperationalEntity(f.env,command(),options());await mutateOperationalEntity(f.env,command({expected_revision:1}),options());f.db.db.prepare('UPDATE operational_entity_heads SET revision=1').run();
  await assert.rejects(readOperationalEntity(f.env,selected(),options()),/STORAGE_INVALID/);
  await assert.rejects(listOperationalEntities(f.env,{kind,cursor:null,limit:25},options()),/STORAGE_INVALID/);
 }finally{f.close();}
});

test('actual commercial namespaces isolate entities, request identities, cursors and lazy tables',async()=>{
 const f=fixture();try{
  const principal={kind:'account',userId:'owner-a',organizationId:'org-a',storeId:'store-a',sessionId:'session-a',membershipId:'membership-a',role:'OWNER',authorizationRevision:1,capabilities:['production.read','production.write']};
  const a=await commercialContextFromPrincipal(principal),b=await commercialContextFromPrincipal({...principal,organizationId:'org-b'});
  let authorized=true;const guard=async()=>{if(!authorized)throw Object.assign(Error('revoked'),{status:403});return {sql:'SELECT 1 AS authorized',bindings:[]};};
  const envA={ADMIN_DB:createTenantDatabase(f.db,a,{authorizationGuard:guard}),COMMERCIAL_CONTEXT:a},envB={ADMIN_DB:createTenantDatabase(f.db,b),COMMERCIAL_CONTEXT:b},settings=options({actor:'owner-a'}),body=command({entity_id:'a'});
  const first=await mutateOperationalEntity(envA,body,settings);await mutateOperationalEntity(envA,command({entity_id:'b'}),settings);
  const other=await mutateOperationalEntity(envB,{...body,command:{action:'add',quantity:9}},settings);
  assert.equal(first.payload.quantity,4);assert.equal(other.payload.quantity,9);assert.equal((await readOperationalEntity(envA,selected({entity_id:'a'}),settings)).payload.quantity,4);
  const page=await listOperationalEntities(envA,{kind,cursor:null,limit:1},settings);assert.ok(page.next_cursor);
  await assert.rejects(listOperationalEntities(envB,{kind,cursor:page.next_cursor,limit:1},settings),/CURSOR_INVALID/);
  assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'mlst_%operational_entity_heads'").get().n,2);
  assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='operational_entity_heads'").get().n,0);
  authorized=false;await assert.rejects(mutateOperationalEntity(envA,command({entity_id:'a',expected_revision:1}),settings),e=>e.status===403);
  assert.equal((await readOperationalEntity(envA,selected({entity_id:'a'}),settings)).revision,1);
 }finally{f.close();}
});

test('history remains accessible beyond one thousand revisions through bounded pages',async()=>{
 const f=fixture();try{
  for(let revision=0;revision<1005;revision++)await mutateOperationalEntity(f.env,command({expected_revision:revision}),options());
  let cursor=null,revisions=[];do{const page=await readOperationalHistory(f.env,{...selected(),cursor,limit:50},options());assert.ok(page.rows.length<=50);revisions.push(...page.rows.map(row=>row.revision));cursor=page.next_cursor;}while(cursor);
  assert.equal(revisions.length,1005);assert.equal(new Set(revisions).size,1005);assert.equal(revisions[0],1005);assert.equal(revisions.at(-1),1);assert.equal((await readOperationalEntity(f.env,selected(),options())).payload.quantity,4020);
 }finally{f.close();}
});

test('caller mutation during authorization cannot change the captured command or audit author',async()=>{
 const f=fixture();try{
  const body=command(),settings=options();settings.assertAuthorized=async()=>{body.command.quantity=99;settings.actor='changed-owner';return true;};
  const result=await mutateOperationalEntity(f.env,body,settings);assert.equal(result.payload.quantity,4);assert.equal(result.actor,'owner@example.invalid');
  const history=await readOperationalHistory(f.env,{...selected(),cursor:null,limit:25},options());assert.equal(history.rows[0].command.quantity,4);
 }finally{f.close();}
});

test('pure asynchronous transition can calculate a hash but still loses a racing revision',async()=>{
 const f=fixture();try{
  const settings=options({transition:async(payload,command)=>{await mutateOperationalEntity(f.env,commandFactory(),options());return {quantity:(payload?.quantity??0)+command.quantity};}});
  const commandFactory=()=>command({command:{action:'add',quantity:9}});
  await assert.rejects(mutateOperationalEntity(f.env,command(),settings),e=>e.code==='OPERATIONAL_JOURNAL_REVISION_CONFLICT'&&e.status===409);
  assert.equal((await readOperationalEntity(f.env,selected(),options())).payload.quantity,9);assert.equal(count(f.db,'operational_entity_revisions'),1);
 }finally{f.close();}
});

test('revocation or a rejected async calculation leaves no operational fact',async()=>{
 const f=fixture();try{
  let authorized=true;
  await assert.rejects(mutateOperationalEntity(f.env,command(),options({assertAuthorized:()=>authorized,transition:async()=>{authorized=false;return {quantity:4};}})),e=>e.status===403);
  await assert.rejects(mutateOperationalEntity(f.env,command(),options({transition:async()=>{throw Error('calculation unavailable');}})),/calculation unavailable/);
  assert.equal((await readOperationalEntity(f.env,selected(),options())).revision,0);assert.equal(count(f.db,'operational_entity_requests'),0);
 }finally{f.close();}
});

test('replacing the environment during an asynchronous transition cannot redirect its write',async()=>{
 const f=fixture(),other=fixture();try{
  await assert.rejects(mutateOperationalEntity(f.env,command(),options({transition:async()=>{f.env.ADMIN_DB=other.db;return {quantity:4};}})),e=>e.code==='OPERATIONAL_JOURNAL_SCOPE_CHANGED'&&e.status===403);
  assert.equal((await readOperationalEntity({ADMIN_DB:f.db},selected(),options())).revision,0);assert.equal((await readOperationalEntity(other.env,selected(),options())).revision,0);
 }finally{f.close();other.close();}
});

test('transition scope is an immutable server-derived copy, independent of client command fields',async()=>{
 const f=fixture();try{
  const body=command({command:{action:'add',quantity:4,scope:{organization_id:'client-org',store_id:'client-store'}}});
  const result=await mutateOperationalEntity(f.env,body,options({transition:(payload,command,context)=>{
   assert.deepEqual(context.scope,{organization_id:'legacy-brazacommerce',store_id:'legacy-shopee'});assert.equal(Object.isFrozen(context.scope),true);
   assert.throws(()=>{context.scope.store_id='changed-store';},TypeError);
   command.scope.store_id='mutated-client';assert.equal(context.scope.store_id,'legacy-shopee');
   return {quantity:command.quantity};
  }}));
  assert.equal(result.payload.quantity,4);assert.deepEqual(result.scope,{organization_id:'legacy-brazacommerce',store_id:'legacy-shopee'});
 }finally{f.close();}
});
