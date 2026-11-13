import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {snapshotDomainDatabase,validateDomainSnapshot,restoreDomainSnapshot,backfillLegacyTenant,commercialMigrationState} from '../src/tenant-migration.mjs';
import {commercialContextFromPrincipal,bindCommercialEnvironment} from '../src/commercial-context.mjs';
import {TenantIsolationError} from '../src/tenant-storage.mjs';
import {readIncurredProduction,mutateIncurredProduction} from '../src/incurred-production.mjs';
import {PRODUCTION_WEEKLY_SCHEMA} from '../src/production-weekly-store.mjs';
import {previewExternalCashImport,mutateExternalCash,readExternalCashWorkspace} from '../../finance/src/external-cash-store.mjs';
import {cashPreview,cashRead,cashRequestId} from '../../finance/tests/external-cash-fixture.mjs';

const now=()=>Date.parse('2026-11-11T15:00:00Z'),uuid=n=>'10000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
const identity={artwork:'Synthetic',color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null};
async function fixture(t){
 const legacy=new D1(),account=new D1(),restored=new D1();t.after(()=>{legacy.db.close();account.db.close();restored.db.close();});
 const context=await commercialContextFromPrincipal({kind:'account',userId:'explicit-legacy-owner',organizationId:'explicit-legacy-org',storeId:'explicit-legacy-store',sessionId:'explicit-legacy-session',membershipId:'explicit-legacy-owner',role:'OWNER',capabilities:['production.write'],authorizationRevision:1},{requiredCapability:'production.write'});
 legacy.db.exec('CREATE TABLE admin_settings(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER,payload TEXT,updated_at TEXT); CREATE TABLE admin_audit(revision INTEGER PRIMARY KEY,payload TEXT,actor TEXT,created_at TEXT); CREATE TABLE hermes_jobs(id TEXT PRIMARY KEY,result TEXT,lease TEXT); CREATE INDEX jobs_status ON hermes_jobs(id)');
 const payload=' {"immutable_hash":"'+ 'a'.repeat(64)+'","nullable":null,"zero":0,"negative":-25,"revision":8} ';
 await legacy.batch([legacy.prepare('INSERT INTO admin_settings VALUES(1,8,?,?)').bind(payload,'2026-11-11T15:00:00Z'),legacy.prepare('INSERT INTO admin_audit VALUES(8,?,?,?)').bind(payload,'admin','2026-11-11T15:00:00Z'),legacy.prepare('INSERT INTO hermes_jobs VALUES(?,?,?)').bind('same-job',JSON.stringify({original:true,source_hash:'b'.repeat(64)}),'original-lease')]);
 await mutateIncurredProduction({ADMIN_DB:legacy},{revision:0,request_id:uuid(1),action:'record',record_id:uuid(2),production_ref:'SYNTHETIC-LEGACY-LOT',replaces_record_id:null,produced_date:'2026-11-10',quantity:4,identity,source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:1350,reference:null},evidence:'Synthetic local migration',confirmed:true},'admin',{now});
 await legacy.batch(PRODUCTION_WEEKLY_SCHEMA.map(sql=>legacy.prepare(sql)));
 for(const version of [1,2])await legacy.prepare('INSERT INTO production_weekly_reports VALUES(?,?,?,?,?,?,?,?,?)').bind('2026-11-06',version,String(version).repeat(64),JSON.stringify({version,original:version===1,known_cost_cents:version===1?null:5400}),String(version+2).repeat(64),version,version,now()/1000,'cron').run();
 const legacyMapping={cashTenant:'2049333:1178167501:LIVE:BRAZIL:external-cash-v1',kind:'explicit-legacy-owner',userId:context.userId,organizationId:context.organizationId,storeId:context.storeId};
 return {legacy,account,restored,context,legacyMapping,payload,options:{legacyDb:legacy,accountDb:account,context,legacyMapping,confirmed:true,now}};
}

test('verified additive legacy backfill preserves exact values, hashes, counts, revisions and old access; replay preserves new writes',async t=>{
 const {legacy,account,context,options,payload}=await fixture(t),before=await snapshotDomainDatabase(legacy);
 const result=await backfillLegacyTenant(options);assert.equal(result.state,'COMPLETE');assert.equal(result.replayed,false);assert.equal(result.source_digest,before.digest);
 t.diagnostic(JSON.stringify({environment:'LOCAL_SYNTHETIC_SQLITE',domain:'app',backup_sha256:before.digest,tables:before.tables.length,rows:before.tables.reduce((n,table)=>n+table.count,0),counts_verified:result.counts.length}));
 const scoped=bindCommercialEnvironment({ACCOUNT_DB:account,ADMIN_DB:legacy},context,{authorizationGuard:()=>({sql:'SELECT 1',bindings:[]})}),after=await snapshotDomainDatabase(scoped.ADMIN_DB);assert.equal(after.digest,before.digest);assert.equal((await snapshotDomainDatabase(legacy)).digest,before.digest);
 assert.equal((await scoped.ADMIN_DB.prepare('SELECT payload,revision FROM admin_settings WHERE id=1').first()).payload,payload);assert.equal((await scoped.ADMIN_DB.prepare('SELECT payload,revision FROM admin_settings WHERE id=1').first()).revision,8);
 assert.equal((await readIncurredProduction(scoped,{now})).summary.known_cost_cents,5400);
 const reports=(await scoped.ADMIN_DB.prepare('SELECT version,content_hash,payload,payload_hash,source_revision FROM production_weekly_reports ORDER BY version').all()).results;assert.deepEqual(reports,(await legacy.prepare('SELECT version,content_hash,payload,payload_hash,source_revision FROM production_weekly_reports ORDER BY version').all()).results);assert.equal(reports[0].content_hash,'1'.repeat(64));assert.equal(reports[1].source_revision,2);
 await scoped.ADMIN_DB.prepare('INSERT INTO hermes_jobs VALUES(?,?,?)').bind('new-job','new-write','new-lease').run();
 const replay=await backfillLegacyTenant(options);assert.equal(replay.replayed,true);assert.equal((await scoped.ADMIN_DB.prepare('SELECT count(*) AS n FROM hermes_jobs').first()).n,2);
 // Rollback rehearsal: the legacy code still reads its untouched original;
 // restoring the compatible scoped gateway reopens all newer tenant writes.
 assert.equal((await legacy.prepare('SELECT count(*) AS n FROM hermes_jobs').first()).n,1);
 assert.equal((await bindCommercialEnvironment({ACCOUNT_DB:account,ADMIN_DB:legacy},context).ADMIN_DB.prepare('SELECT result FROM hermes_jobs WHERE id=?').bind('new-job').first()).result,'new-write');
 assert.equal((await commercialMigrationState(account,context)).state,'COMPLETE');
});

test('interrupted table copy resumes idempotently, and never assigns legacy facts to an unconfirmed new company',async t=>{
 const {legacy,account,context,options}=await fixture(t);let interruptions=0;
 await assert.rejects(backfillLegacyTenant({...options,afterTable:async()=>{if(++interruptions===2)throw new Error('synthetic-interruption');}}),/synthetic-interruption/);
 assert.equal((await commercialMigrationState(account,context)).state,'COPYING');
 const resumed=await backfillLegacyTenant(options);assert.equal(resumed.state,'COMPLETE');assert.equal(resumed.replayed,false);
 assert.equal((await snapshotDomainDatabase(bindCommercialEnvironment({ACCOUNT_DB:account,ADMIN_DB:legacy},context).ADMIN_DB)).digest,(await snapshotDomainDatabase(legacy)).digest);
 await assert.rejects(backfillLegacyTenant({...options,confirmed:false}),TenantIsolationError);
 await assert.rejects(backfillLegacyTenant({...options,legacyMapping:{...options.legacyMapping,userId:'first-customer'}}),TenantIsolationError);
});

test('snapshot restores into a separate empty SQLite database and refuses corrupt backup or overwriting newer writes',async t=>{
 const {legacy,restored}=await fixture(t),backup=await snapshotDomainDatabase(legacy);await validateDomainSnapshot(backup);
 assert.equal((await restoreDomainSnapshot(restored,backup)).digest,backup.digest);
 const rows=await restored.prepare('SELECT revision,payload,actor FROM admin_audit').all();assert.equal(rows.results[0].actor,'admin');assert.equal(rows.results[0].revision,8);
 await assert.rejects(restoreDomainSnapshot(restored,backup),/TARGET_NOT_EMPTY/);
 const corrupted=structuredClone(backup);corrupted.tables[0].rows[0].revision=999;await assert.rejects(validateDomainSnapshot(corrupted),/BACKUP_INVALID/);
});

test('Finance imported money, idempotency and immutable history survive isolated backfill and verified restore',async t=>{
 const {legacy,account,restored,context,options}=await fixture(t),env={FINANCE_DB:legacy},input=cashPreview(),preview=await previewExternalCashImport(env,input),{cursor,limit,...payload}=input;
 const body={...payload,operation:'import',request_id:cashRequestId,expected_revision:preview.revision,preview_hash:preview.preview_hash,confirmed:true};await mutateExternalCash(env,body,{now});
 await assert.rejects(backfillLegacyTenant({...options,domain:'finance',legacyMapping:{...options.legacyMapping,cashTenant:undefined}}),/EXPLICIT_CASH_ALIAS_REQUIRED/);await assert.rejects(backfillLegacyTenant({...options,domain:'finance',legacyMapping:{...options.legacyMapping,cashTenant:'unrelated-company'}}),/EXPLICIT_CASH_ALIAS_REQUIRED/);
 const backup=await snapshotDomainDatabase(legacy,{domain:'finance'}),result=await backfillLegacyTenant({...options,domain:'finance'});assert.equal(result.source_digest,backup.digest);
 t.diagnostic(JSON.stringify({environment:'LOCAL_SYNTHETIC_SQLITE',domain:'finance',backup_sha256:backup.digest,tables:backup.tables.length,rows:backup.tables.reduce((n,table)=>n+table.count,0),counts_verified:result.counts.length}));
 const migratedContext=await commercialContextFromPrincipal({...context,legacyCashTenant:result.legacyCashTenant},{requiredCapability:context.requiredCapability}),scoped=bindCommercialEnvironment({ACCOUNT_DB:account,ADMIN_DB:legacy},migratedContext,{authorizationGuard:()=>({sql:'SELECT 1',bindings:[]})});assert.equal((await snapshotDomainDatabase(scoped.FINANCE_DB,{domain:'finance'})).digest,backup.digest);
 assert.equal((await readExternalCashWorkspace(scoped,cashRead())).records[0].amount_cents,12345);assert.equal((await mutateExternalCash(scoped,body,{now})).replayed,true);
 await assert.rejects(scoped.FINANCE_DB.prepare('DELETE FROM finance_external_cash_records').run(),/external_cash_immutable/);
 assert.equal((await restoreDomainSnapshot(restored,backup)).digest,backup.digest);await assert.rejects(restored.prepare('DELETE FROM finance_external_cash_records').run(),/external_cash_immutable/);
});
