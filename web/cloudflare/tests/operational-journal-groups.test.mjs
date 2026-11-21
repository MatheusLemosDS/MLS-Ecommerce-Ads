import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {financialCanonicalJSON,financialDigest} from '../src/financial-event-ledger.mjs';
import {commercialContextFromPrincipal} from '../src/commercial-context.mjs';
import {createTenantDatabase} from '../src/tenant-storage.mjs';
import {readOperationalEntity,mutateOperationalEntity,mutateOperationalGroup,readOperationalCollectionSnapshot} from '../src/operational-journal.mjs';

const now=()=>Date.parse('2026-11-21T14:00:00.000Z'),readOptions={readCapability:'production.read',now};
const stock='PHYSICAL_SHIRT_STOCK',groupKind='MATERIAL_RESERVATION_GROUP';
const options=transitionGroup=>({...readOptions,writeCapability:'production.write',actor:'synthetic-owner',transitionGroup});
const request=(patch={})=>({kind:groupKind,entity_id:'order-a',expected_revision:0,request_id:crypto.randomUUID(),command:{action:'reserve',quantity:2},...patch});
const member=(entity_id,expected_revision,payload)=>({kind:stock,entity_id,expected_revision,payload,command:{action:'synthetic-physical-reservation'}});
const transition=(mutations,guards=[])=>async(payload,command)=>({payload:{action:command.action,quantity:command.quantity},mutations,guards});
function fixture(t){const db=new D1();t.after(()=>db.db.close());return {db,env:{ADMIN_DB:db}};}
async function seed(f,id='shirt-m',quantity=5){return mutateOperationalEntity(f.env,{kind:stock,entity_id:id,expected_revision:0,request_id:crypto.randomUUID(),command:{quantity}},{...readOptions,writeCapability:'production.write',actor:'synthetic-owner',transition:(_value,command)=>({quantity:command.quantity,reserved:0})});}
const selected=(f,id='shirt-m')=>readOperationalEntity(f.env,{kind:stock,entity_id:id},readOptions);
const count=(f,name)=>f.db.db.prepare('SELECT COUNT(*) AS n FROM '+name).get().n;

test('collection cold read creates no tables and its empty source fence has an explicit scope',async t=>{
 const f=fixture(t),frame=await readOperationalCollectionSnapshot(f.env,{kinds:[stock,groupKind]},readOptions);
 assert.equal(frame.schema,'operational_collection_snapshot_v1');assert.deepEqual(frame.records,[]);assert.deepEqual(frame.heads,[]);assert.equal(frame.complete,true);assert.equal(frame.total_count,0);assert.match(frame.fence_hash,/^[a-f0-9]{64}$/);
 assert.deepEqual(frame.scope,{organization_id:'legacy-brazacommerce',store_id:'legacy-shopee'});
 assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);
});

test('one kit group commits both physical variants and one global replay receipt',async t=>{
 const f=fixture(t);await seed(f);await seed(f,'shirt-g',7);
 const body=request(),result=await mutateOperationalGroup(f.env,body,options(transition([member('shirt-m',1,{quantity:5,reserved:2}),member('shirt-g',1,{quantity:7,reserved:2})])));
 assert.equal(result.revision,1);assert.equal(result.replayed,false);assert.deepEqual((await selected(f)).payload,{quantity:5,reserved:2});assert.deepEqual((await selected(f,'shirt-g')).payload,{quantity:7,reserved:2});
 assert.equal(count(f,'operational_entity_revisions'),5);assert.equal(count(f,'operational_entity_requests'),3);
 const frame=await readOperationalCollectionSnapshot(f.env,{kinds:[stock,groupKind]},readOptions);
 assert.equal(frame.complete,true);assert.equal(frame.total_count,3);assert.equal(frame.records.length,3);assert.equal(frame.heads.length,3);assert.equal(new Set(frame.heads.map(row=>row.kind+':'+row.entity_id)).size,3);
 const key=await financialDigest(['operational-journal-v1',frame.scope]);
 for(const head of frame.heads){const persisted=f.db.db.prepare('SELECT previous_hash,payload_hash FROM operational_entity_revisions WHERE scope_key=? AND kind=? AND entity_id=? AND revision=?').get(key,head.kind,head.entity_id,head.revision);assert.equal(persisted.payload_hash,head.hash);if(head.kind===stock)assert.match(persisted.previous_hash,/^[a-f0-9]{64}$/);}
});

test('one stale member prevents every member and group from being written',async t=>{
 const f=fixture(t);await seed(f);await seed(f,'shirt-g',7);
 await assert.rejects(mutateOperationalGroup(f.env,request(),options(transition([member('shirt-m',1,{quantity:5,reserved:2}),member('shirt-g',0,{quantity:7,reserved:2})]))),e=>e.status===409&&e.code==='OPERATIONAL_JOURNAL_REVISION_CONFLICT');
 assert.equal((await selected(f)).revision,1);assert.equal((await selected(f,'shirt-g')).revision,1);assert.equal(count(f,'operational_entity_revisions'),2);assert.equal(count(f,'operational_entity_requests'),2);
 assert.equal((await readOperationalEntity(f.env,{kind:groupKind,entity_id:'order-a'},readOptions)).revision,0);
});

test('a revision race immediately before the atomic batch rolls back all earlier member writes',async t=>{
 const f=fixture(t);await seed(f);await seed(f,'shirt-g',7);
 const batch=f.db.batch.bind(f.db);let armed=true;
 f.db.batch=async statements=>{
  // The members have already been observed when the write batch arrives.
  if(armed&&statements.length>10){armed=false;await mutateOperationalEntity(f.env,{kind:stock,entity_id:'shirt-g',expected_revision:1,request_id:crypto.randomUUID(),command:{quantity:7}},{...readOptions,writeCapability:'production.write',actor:'synthetic-owner',transition:()=>({quantity:7,reserved:5})});}
  return batch(statements);
 };
 await assert.rejects(mutateOperationalGroup(f.env,request(),options(transition([member('shirt-m',1,{quantity:5,reserved:2}),member('shirt-g',1,{quantity:7,reserved:2})]))),e=>e.status===409);
 assert.equal((await selected(f)).revision,1);assert.equal((await selected(f)).payload.reserved,0);assert.equal((await selected(f,'shirt-g')).revision,2);assert.equal((await selected(f,'shirt-g')).payload.reserved,5);assert.equal(count(f,'operational_entity_revisions'),3);
});

test('a source fence losing a newly created entity rejects the kit without partial reservations',async t=>{
 const f=fixture(t);await seed(f);const snapshot=await readOperationalCollectionSnapshot(f.env,{kinds:[stock]},readOptions),key=await financialDigest(['operational-journal-v1',snapshot.scope]);
 const guards=[{sql:'SELECT 1 WHERE (SELECT COUNT(*) FROM operational_entity_heads WHERE scope_key=? AND kind=?)=?',bindings:[key,stock,snapshot.total_count]}];
 await seed(f,'shirt-g',7);
 await assert.rejects(mutateOperationalGroup(f.env,request(),options(transition([member('shirt-m',1,{quantity:5,reserved:2})],guards))),e=>e.status===409&&e.code==='OPERATIONAL_JOURNAL_SOURCE_CHANGED');
 assert.equal((await selected(f)).revision,1);assert.equal(count(f,'operational_entity_requests'),2);assert.equal(count(f,'operational_entity_revisions'),2);
});

test('request replay precedes transition and stale revision checks even after later group and stock writes',async t=>{
 const f=fixture(t);await seed(f);const body=request(),settings=options(transition([member('shirt-m',1,{quantity:5,reserved:2})])),first=await mutateOperationalGroup(f.env,body,settings);
 await mutateOperationalGroup(f.env,request({expected_revision:1,command:{action:'release',quantity:1}}),options(transition([member('shirt-m',2,{quantity:5,reserved:1})])));
 const replay=await mutateOperationalGroup(f.env,body,options(()=>{throw Error('replay must not calculate or consult live sources');}));
 assert.equal(replay.replayed,true);assert.equal(replay.revision,1);assert.deepEqual(replay.payload,first.payload);assert.equal((await selected(f)).payload.reserved,1);assert.equal(count(f,'operational_entity_requests'),3);
 for(const patch of [{expected_revision:1},{entity_id:'order-b'},{command:{action:'reserve',quantity:3}}])await assert.rejects(mutateOperationalGroup(f.env,{...body,...patch},settings),e=>e.code==='OPERATIONAL_JOURNAL_REQUEST_CONFLICT'&&e.status===409);
});

test('group mutations cannot repeat an entity or include their own control entity',async t=>{
 const f=fixture(t);await seed(f);
 for(const mutations of [[member('shirt-m',1,{reserved:2}),member('shirt-m',1,{reserved:3})],[{kind:groupKind,entity_id:'order-a',expected_revision:0,payload:{reserved:2},command:{action:'same-group'}}]])await assert.rejects(mutateOperationalGroup(f.env,request(),options(transition(mutations))),/GROUP_MUTATION_DUPLICATE/);
 assert.equal((await selected(f)).revision,1);assert.equal(count(f,'operational_entity_revisions'),1);
});

test('trusted source guards accept only bounded SELECT preconditions, never statement injection',async t=>{
 const f=fixture(t);await seed(f);
 for(const sql of ['DELETE FROM operational_entity_heads','SELECT 1; DELETE FROM operational_entity_heads','SELECT 1 -- comment','SELECT 1 /* comment */','PRAGMA writable_schema=1'])await assert.rejects(mutateOperationalGroup(f.env,request(),options(transition([],[{sql,bindings:[]}]))),/GROUP_GUARD_INVALID/);
 assert.equal((await selected(f)).revision,1);assert.equal(count(f,'operational_entity_revisions'),1);
});

test('late authorization revocation or redirected runtime prevents grouped writes',async t=>{
 const f=fixture(t),other=fixture(t);await seed(f);let authorized=true;
 const settings={...options(async()=>{authorized=false;return {payload:{done:true},mutations:[member('shirt-m',1,{quantity:5,reserved:2})],guards:[]};}),assertAuthorized:()=>authorized};
 await assert.rejects(mutateOperationalGroup(f.env,request(),settings),e=>e.status===403);assert.equal((await selected(f)).revision,1);
 await assert.rejects(mutateOperationalGroup(f.env,request(),options(async()=>{f.env.ADMIN_DB=other.db;return {payload:{done:true},mutations:[member('shirt-m',1,{quantity:5,reserved:2})],guards:[]};})),e=>e.status===403);
 assert.equal((await selected({env:{ADMIN_DB:f.db}})).revision,1);assert.equal(other.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);
});

test('real tenant wrappers isolate grouped entities and reject a foreign context before creating tables',async t=>{
 const f=fixture(t),principal={kind:'account',userId:'owner-a',organizationId:'org-a',storeId:'store-a',sessionId:'session-a',membershipId:'member-a',role:'OWNER',authorizationRevision:1,capabilities:['production.read','production.write']};
 const a=await commercialContextFromPrincipal(principal),b=await commercialContextFromPrincipal({...principal,storeId:'store-b'}),guard=()=>({sql:'SELECT 1',bindings:[]});
 const envA={ADMIN_DB:createTenantDatabase(f.db,a,{authorizationGuard:guard}),COMMERCIAL_CONTEXT:a},envB={ADMIN_DB:createTenantDatabase(f.db,b,{authorizationGuard:guard}),COMMERCIAL_CONTEXT:b},body=request(),settings={...options(transition([member('shirt-m',0,{quantity:5,reserved:2})])),actor:'owner-a'};
 const aa=await mutateOperationalGroup(envA,body,settings),bb=await mutateOperationalGroup(envB,{...body,command:{action:'reserve',quantity:4}},{...settings,transitionGroup:transition([member('shirt-m',0,{quantity:5,reserved:4})])});
 assert.notDeepEqual(aa.scope,bb.scope);assert.equal((await readOperationalCollectionSnapshot(envA,{kinds:[stock]},readOptions)).records[0].payload.reserved,2);assert.equal((await readOperationalCollectionSnapshot(envB,{kinds:[stock]},readOptions)).records[0].payload.reserved,4);
 await assert.rejects(mutateOperationalGroup({...envA,COMMERCIAL_CONTEXT:b},request({entity_id:'mismatched'}),settings),e=>e.status===403);
 assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='operational_entity_heads'").get().n,0);
});

test('collection snapshot detects a new entity created during its asynchronous read',async t=>{
 const f=fixture(t);await seed(f);let armed=true;
 await assert.rejects(readOperationalCollectionSnapshot(f.env,{kinds:[stock]},{...readOptions,assertAuthorized:async()=>{if(armed&&count(f,'operational_entity_revisions')===1){armed=false;queueMicrotask(()=>{});return true;}if(!armed&&count(f,'operational_entity_revisions')===1){await seed(f,'shirt-g',7);}return true;}}),e=>e.code==='OPERATIONAL_JOURNAL_SOURCE_CHANGED'&&e.status===409);
});

test('collection snapshot rejects a lowered head that hides an immutable later revision',async t=>{
 const f=fixture(t);await seed(f);await mutateOperationalGroup(f.env,request(),options(transition([member('shirt-m',1,{quantity:5,reserved:2})])));
 f.db.db.prepare('UPDATE operational_entity_heads SET revision=1 WHERE kind=?').run(stock);
 await assert.rejects(readOperationalCollectionSnapshot(f.env,{kinds:[stock]},readOptions),e=>e.code==='OPERATIONAL_JOURNAL_STORAGE_INVALID'&&e.status===503);
});

test('large existing collections are explicitly partial instead of silently declaring complete coverage',async t=>{
 const f=fixture(t);await seed(f);const record=await selected(f),scope_key=await financialDigest(['operational-journal-v1',record.scope]);
 const payload=financialCanonicalJSON({quantity:1,reserved:0}),payload_hash=await financialDigest(payload),command=financialCanonicalJSON({action:'synthetic-seed'});
 const head=f.db.db.prepare('INSERT INTO operational_entity_heads(scope_key,kind,entity_id,revision) VALUES(?,?,?,1)'),revision=f.db.db.prepare('INSERT INTO operational_entity_revisions(scope_key,kind,entity_id,revision,payload,payload_hash,previous_hash,command,actor,created_at) VALUES(?,?,?,1,?,?,NULL,?,?,?)');
 f.db.db.exec('BEGIN');for(let n=0;n<1001;n++){const id='synthetic-'+String(n).padStart(4,'0');head.run(scope_key,stock,id);revision.run(scope_key,stock,id,payload,payload_hash,command,'synthetic-owner',new Date(now()).toISOString());}f.db.db.exec('COMMIT');
 const frame=await readOperationalCollectionSnapshot(f.env,{kinds:[stock]},readOptions);assert.equal(frame.complete,false);assert.equal(frame.total_count,1002);assert.equal(frame.records.length,1000);assert.equal(frame.heads.length,1000);
});

test('throwing nested accessors are rejected without executing their code',async t=>{
 const f=fixture(t),body=request();let called=false;Object.defineProperty(body.command,'quantity',{enumerable:true,get(){called=true;throw Error('must not execute');}});
 await assert.rejects(mutateOperationalGroup(f.env,body,options(transition([]))),/PAYLOAD_INVALID/);assert.equal(called,false);assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);
});

test('member and control payloads are captured before any asynchronous member observation',async t=>{
 const f=fixture(t);await seed(f);await seed(f,'shirt-g',7);const output={payload:{done:true},mutations:[member('shirt-m',1,{quantity:5,reserved:2}),member('shirt-g',1,{quantity:7,reserved:2})],guards:[]},batch=f.db.batch.bind(f.db);let armed=false;
 f.db.batch=async statements=>{if(armed&&statements.length===6){armed=false;output.payload.done=false;output.mutations[1].payload.reserved=7;}return batch(statements);};
 const result=await mutateOperationalGroup(f.env,request(),options(async()=>{armed=true;return output;}));
 assert.equal(result.payload.done,true);assert.equal((await selected(f,'shirt-g')).payload.reserved,2);
});

test('the final collection fence cannot return data through a redirected runtime or revoked read grant',async t=>{
 const f=fixture(t),other=fixture(t);await seed(f);let reads=0;
 await assert.rejects(readOperationalCollectionSnapshot(f.env,{kinds:[stock]},{...readOptions,assertAuthorized:()=>++reads<2}),e=>e.status===403);
 const batch=f.db.batch.bind(f.db);let calls=0;
 f.db.batch=async statements=>{const result=await batch(statements);if(++calls===2)f.env.ADMIN_DB=other.db;return result;};
 await assert.rejects(readOperationalCollectionSnapshot(f.env,{kinds:[stock]},readOptions),e=>e.status===403&&e.code==='OPERATIONAL_JOURNAL_SCOPE_CHANGED');
});

test('native binding call count for a grouped mutation is constant as its members increase',async t=>{
 async function observedCalls(memberCount){
  const f=fixture(t),members=[];for(let n=0;n<memberCount;n++){const id='shirt-'+n;await seed(f,id,5);members.push(member(id,1,{quantity:5,reserved:2}));}
  const prepare=f.db.prepare.bind(f.db),batch=f.db.batch.bind(f.db),calls={batch:0,first:0,all:0,run:0};let depth=0;
  f.db.prepare=sql=>{const statement=prepare(sql);for(const method of ['first','all','run']){const original=statement[method].bind(statement);statement[method]=async(...args)=>{if(depth===0)calls[method]++;return original(...args);};}return statement;};
  f.db.batch=async statements=>{calls.batch++;depth++;try{return await batch(statements);}finally{depth--;}};
  await mutateOperationalGroup(f.env,request(),options(transition(members)));
  return calls;
 }
 const one=await observedCalls(1),many=await observedCalls(28);
 assert.deepEqual(many,one);assert.deepEqual(many,{batch:3,first:1,all:0,run:0});
});
