import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {mutatePhysicalReturns,readPhysicalReturns} from '../src/physical-returns.mjs';
import {mutateIncurredProduction} from '../src/incurred-production.mjs';
import {readReturnManufacturingLinksWorkspace,mutateReturnManufacturingLinksWorkspace} from '../src/return-manufacturing-links-workspace.mjs';

// Wrangler's locked Miniflare dependency exercises the real workerd D1 binding.
// No account, credentials, provider transport or remote database is used here.
const require=createRequire(import.meta.url);
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const parentTables=['physical_returns_state','physical_returns_cases','physical_returns_audit','physical_returns_guard','incurred_production_state','incurred_production_records','incurred_production_audit','incurred_production_guard'];
const ownTables=['return_manufacturing_links_state','return_manufacturing_links_records','return_manufacturing_links_audit','return_manufacturing_links_guard'];
const stamp=Date.UTC(2026,10,1,21,30),now=()=>stamp,actor='SYNTHETIC-LOCAL-OWNER';
const identity=()=>({artwork:'Synthetic local artwork',color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null});
const partition=()=>({resellable:3,repair:0,damaged:0,mismatch:0,quarantine:0});
const snapshots=async(db,tables)=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,(await db.prepare('SELECT * FROM '+table+' ORDER BY 1').all()).results])));
const ownedObjects=async db=>(await db.prepare("SELECT type,name FROM sqlite_master WHERE name LIKE 'return_manufacturing_links_%' ORDER BY type,name").all()).results;
const expectCode=code=>error=>error?.status===409&&error.message===code;
function tracked(db){
 const batches=[];let beforeFirst=null;
 const wrap=(actual,sql)=>({actual,sql,bind:(...args)=>wrap(actual.bind(...args),sql),all:(...args)=>actual.all(...args),first:(...args)=>actual.first(...args),run:(...args)=>actual.run(...args)});
 return {batches,setBeforeFirst:hook=>{beforeFirst=hook;},db:{prepare(sql){return wrap(db.prepare(sql),sql);},async batch(statements){
  const sql=statements.map(row=>row.sql??'UNTRACKED');
  if(sql.some(value=>/^(INSERT OR IGNORE INTO|UPDATE) return_manufacturing_links_state/.test(value))){batches.push(sql);if(beforeFirst){const hook=beforeFirst;beforeFirst=null;await hook();}}
  return db.batch(statements.map(row=>row.actual??row));
 }}};
}
async function seed(db){
 const env={ADMIN_DB:db},caseHash='a'.repeat(64),orderHash='b'.repeat(64),lineId=crypto.randomUUID(),recordId=crypto.randomUUID();
 let physical=await mutatePhysicalReturns(env,{revision:0,request_id:crypto.randomUUID(),action:'register',case_hash:caseHash,order_hash:orderHash},actor,{now,sourceCase:{case_hash:caseHash,order_hash:orderHash,status:'ACCEPTED',checked_at:stamp/1000-60,month:'2026-10',publication_revision:1}});
 physical=await mutatePhysicalReturns(env,{revision:physical.revision,request_id:crypto.randomUUID(),action:'receive',case_hash:caseHash,line_id:lineId,receipt_ref:'SYNTHETIC-LOCAL-RECEIPT',quantity:3,identity:identity()},actor,{now});
 const production=await mutateIncurredProduction(env,{revision:0,request_id:crypto.randomUUID(),action:'record',record_id:recordId,production_ref:'SYNTHETIC-LOCAL-LOT',replaces_record_id:null,produced_date:'2026-10-31',quantity:4,identity:identity(),source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:1590,reference:null},evidence:'Synthetic local manufacture declaration only',confirmed:true},actor,{now});
 return {env,physical,production,caseHash,lineId,recordId};
}
function linkBody(workspace,ids){return {revision:workspace.ledger.revision,request_id:crypto.randomUUID(),action:'link',link_id:crypto.randomUUID(),case_hash:ids.caseHash,physical_line_id:ids.lineId,production_record_id:ids.recordId,quantity:2,physical_fingerprint:workspace.handles.physical.find(row=>row.line_id===ids.lineId).fingerprint,production_fingerprint:workspace.handles.production.find(row=>row.record_id===ids.recordId).fingerprint,evidence:'Synthetic local origin association, not a real physical fact',confirmed:true};}

test('real workerd D1 atomically installs first-link guards, protects parent history and rolls back a raced first schema',{timeout:60000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'mls-return-manufacturing-d1-'));let mf;
 t.after(async()=>{try{await mf?.dispose();}finally{await rm(directory,{recursive:true,force:true});}});
 mf=new Miniflare(convertV4MiniflareOptions({rootPath:directory,name:'return-manufacturing-links-d1-regression',host:'127.0.0.1',cf:false,telemetry:{enabled:false},resourcePersistencePath:join(directory,'persistence'),resourceTmpPath:join(directory,'runtime'),modules:true,script:"export default {fetch(){return new Response('synthetic-local-only')}}",compatibilityDate:'2026-01-01',d1Databases:{DB:'synthetic-links',RACE:'synthetic-first-write-race'}}));
 const raw=await mf.getD1Database('DB'),main=tracked(raw),db=main.db;

 // 1: The actual binding's cold read creates no schema.
 const empty=await readReturnManufacturingLinksWorkspace({ADMIN_DB:db},{now});assert.equal(empty.ledger.protection.state,'NOT_INITIALIZED');assert.deepEqual(await ownedObjects(raw),[]);
 const ids=await seed(db),env=ids.env;let workspace=await readReturnManufacturingLinksWorkspace(env,{now});assert.equal(workspace.context.state,'READY');assert.equal(workspace.context.physical.length,1);assert.equal(workspace.context.production.length,1);
 const body=linkBody(workspace,ids);workspace=await mutateReturnManufacturingLinksWorkspace(env,body,actor,{now});

 // 2–3: Eleven DDL statements plus the five data statements are one D1 batch;
 // sqlite_master must expose exactly the definitions our readiness check uses.
 assert.equal(main.batches.length,1);assert.equal(main.batches[0].length,16);assert.equal(main.batches[0].filter(sql=>sql.startsWith('CREATE ')).length,11);
 const objects=await ownedObjects(raw);assert.equal(objects.filter(row=>row.type==='table').length,4);assert.equal(objects.filter(row=>row.type==='index').length,3);assert.equal(objects.filter(row=>row.type==='trigger').length,4);
 assert.equal(workspace.ledger.revision,1);assert.equal(workspace.ledger.protection.state,'READY');assert.deepEqual(workspace.ledger.protection.missing,[]);assert.deepEqual(workspace.ledger.summary,{active_links:1,voided_links:0,linked_quantity:2});assert.equal(workspace.context.summary.valid_links,1);assert.equal(workspace.ledger.original_quantities.state,'UNAVAILABLE');assert.equal(workspace.ledger.original_quantities.expected_quantity,null);assert.equal(workspace.ledger.allocated_inventory_value_cents,null);assert.equal(workspace.ledger.financial_integration_allowed,false);

 // 4: Quality inspection remains valid and does not change the origin handle.
 let physical=await readPhysicalReturns(env,{now});const oldFingerprint=workspace.handles.physical[0].fingerprint;
 physical=await mutatePhysicalReturns(env,{revision:physical.revision,request_id:crypto.randomUUID(),action:'inspect',case_hash:ids.caseHash,line_id:ids.lineId,identity:identity(),partition:{resellable:1,repair:1,damaged:1,mismatch:0,quarantine:0},reason:'Synthetic quality-only inspection'},actor,{now});
 workspace=await readReturnManufacturingLinksWorkspace(env,{now});assert.equal(workspace.context.summary.valid_links,1);assert.equal(workspace.handles.physical[0].fingerprint,oldFingerprint);

 // 5–7: Both existing parent mutators must map the real D1 trigger error to a
 // safe conflict, with their preceding CAS/audit/payload work rolled back.
 for(const input of [
  {revision:physical.revision,request_id:crypto.randomUUID(),action:'inspect',case_hash:ids.caseHash,line_id:ids.lineId,identity:{...identity(),color:'Azul'},partition:partition(),reason:'Synthetic forbidden identity change'},
  {revision:physical.revision,request_id:crypto.randomUUID(),action:'void',case_hash:ids.caseHash,line_id:ids.lineId,reason:'Synthetic forbidden linked receipt void'},
 ]){const before=await snapshots(raw,parentTables);await assert.rejects(mutatePhysicalReturns(env,input,actor,{now}),expectCode('PHYSICAL_RETURNS_MANUFACTURING_LINK_ACTIVE'));assert.deepEqual(await snapshots(raw,parentTables),before);}
 {const before=await snapshots(raw,parentTables);await assert.rejects(mutateIncurredProduction(env,{revision:ids.production.revision,request_id:crypto.randomUUID(),action:'void',record_id:ids.recordId,reason:'Synthetic forbidden linked manufacture void'},actor,{now}),expectCode('INCURRED_PRODUCTION_RETURN_LINK_ACTIVE'));assert.deepEqual(await snapshots(raw,parentTables),before);}

 // 8–9: DELETE triggers must also undo an earlier write in the same D1 batch.
 for(const statement of [raw.prepare('DELETE FROM physical_returns_cases WHERE case_hash=?').bind(ids.caseHash),raw.prepare('DELETE FROM incurred_production_records WHERE record_id=?').bind(ids.recordId)]){
  const before=await snapshots(raw,parentTables);await assert.rejects(raw.batch([raw.prepare('UPDATE physical_returns_state SET revision=revision+1 WHERE id=1'),statement]),error=>String(error?.message).includes('MLS_RETURN_MANUFACTURING_LINK_ACTIVE'));assert.deepEqual(await snapshots(raw,parentTables),before);
 }

 // 10: A transport retry must not create another link, audit row or revision.
 {const before=await snapshots(raw,ownTables);await mutateReturnManufacturingLinksWorkspace(env,body,actor,{now});assert.deepEqual(await snapshots(raw,ownTables),before);}

 // 11: An explicit unlink releases both capacities and both parent guards.
 workspace=await mutateReturnManufacturingLinksWorkspace(env,{revision:workspace.ledger.revision,request_id:crypto.randomUUID(),action:'unlink',link_id:body.link_id,reason:'Synthetic explicit unlink'},actor,{now});assert.equal(workspace.ledger.summary.active_links,0);assert.equal(workspace.context.physical[0].remaining_quantity,3);assert.equal(workspace.context.production[0].remaining_quantity,4);
 physical=await mutatePhysicalReturns(env,{revision:physical.revision,request_id:crypto.randomUUID(),action:'void',case_hash:ids.caseHash,line_id:ids.lineId,reason:'Synthetic receipt void after explicit unlink'},actor,{now});const production=await mutateIncurredProduction(env,{revision:ids.production.revision,request_id:crypto.randomUUID(),action:'void',record_id:ids.recordId,reason:'Synthetic manufacture void after explicit unlink'},actor,{now});assert.equal(physical.cases[0].lines[0].status,'VOID');assert.equal(production.records[0].status,'VOID');

 // 12: If an inspection wins immediately before the first link, source_guard
 // must undo the entire batch, including all eleven schema objects.
 const raceRaw=await mf.getD1Database('RACE'),race=tracked(raceRaw),raceIds=await seed(race.db),raceEnv=raceIds.env,beforeRace=await readReturnManufacturingLinksWorkspace(raceEnv,{now}),raceBody=linkBody(beforeRace,raceIds);let winningParents;
 race.setBeforeFirst(async()=>{await mutatePhysicalReturns({ADMIN_DB:raceRaw},{revision:raceIds.physical.revision,request_id:crypto.randomUUID(),action:'inspect',case_hash:raceIds.caseHash,line_id:raceIds.lineId,identity:identity(),partition:partition(),reason:'Synthetic winning inspection racing first association'},actor,{now});winningParents=await snapshots(raceRaw,parentTables);});
 await assert.rejects(mutateReturnManufacturingLinksWorkspace(raceEnv,raceBody,actor,{now}),expectCode('RETURN_MANUFACTURING_LINKS_CONFLICT'));assert.deepEqual(await ownedObjects(raceRaw),[]);assert.deepEqual(await snapshots(raceRaw,parentTables),winningParents);assert.equal(race.batches[0].length,16);

 // 13: A fresh retry can then initialize a single READY revision normally.
 let refreshed=await readReturnManufacturingLinksWorkspace(raceEnv,{now});assert.equal(refreshed.ledger.protection.state,'NOT_INITIALIZED');refreshed=await mutateReturnManufacturingLinksWorkspace(raceEnv,linkBody(refreshed,raceIds),actor,{now});assert.equal(refreshed.ledger.protection.state,'READY');assert.equal(refreshed.context.summary.valid_links,1);assert.equal(refreshed.ledger.revision,1);
});
