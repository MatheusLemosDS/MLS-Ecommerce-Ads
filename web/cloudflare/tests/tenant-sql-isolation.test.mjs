import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {D1} from './sqlite-d1.mjs';
import {createTenantDatabase,tenantNamespace,TenantIsolationError,tenantStorageIdentity,TenantInitializationMap,TenantInitializationSet} from '../src/tenant-storage.mjs';
import {TENANT_APP_TABLES,TENANT_FINANCE_TABLES,TENANT_SCHEMA_OBJECTS} from '../src/tenant-schema-manifest.mjs';
import {readIncurredProduction,mutateIncurredProduction} from '../src/incurred-production.mjs';
import {readPhysicalReturns,mutatePhysicalReturns} from '../src/physical-returns.mjs';
import {readReturnManufacturingLinksWorkspace,mutateReturnManufacturingLinksWorkspace} from '../src/return-manufacturing-links-workspace.mjs';
import {previewExternalCashImport,mutateExternalCash,readExternalCashWorkspace} from '../../finance/src/external-cash-store.mjs';
import {cashPreview,cashRead,cashRequestId} from '../../finance/tests/external-cash-fixture.mjs';

// This suite runs real SQLite statements and the original ledger services.
// All identities, bank rows and manufacturing declarations are synthetic/local.
const now=()=>Date.parse('2026-11-11T15:00:00Z');
const uuid=n=>'10000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
const identity=()=>({artwork:'Synthetic local artwork',color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null});
const isolation=error=>error instanceof TenantIsolationError;
async function fixture(t,domain='app'){
 const raw=new D1();t.after(()=>raw.db.close());
 const a={organizationId:'synthetic-org-a',storeId:'same-store-id',namespace:await tenantNamespace('synthetic-org-a','same-store-id')};
 const b={organizationId:'synthetic-org-b',storeId:'same-store-id',namespace:await tenantNamespace('synthetic-org-b','same-store-id')};
 return {raw,a,b,A:createTenantDatabase(raw,a,{domain}),B:createTenantDatabase(raw,b,{domain})};
}
const normalize=sql=>sql.replace(/\bIF NOT EXISTS\s+/i,'').replace(/\s+/g,' ').trim().replace(/;$/,'');
const objectName=sql=>/^CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)/i.exec(sql)?.[1];
async function schemaStatements(domain){
 const inventory=JSON.parse(await readFile(new URL('../../../docs/v4/TENANT_STORAGE_INVENTORY.json',import.meta.url),'utf8'));
 const paths=Object.keys(inventory.sources).filter(path=>path.startsWith(domain==='app'?'web/cloudflare/':'web/finance/'));
 const statements=[];
 for(const path of paths){
  const file=new URL('../../../'+path,import.meta.url),module=await import(file);
  for(const value of Object.values(module))if(Array.isArray(value))for(const sql of value)if(typeof sql==='string'&&/^CREATE\s+(?:TABLE|INDEX|UNIQUE INDEX|TRIGGER)\b/i.test(sql))statements.push(sql);
  // admin and Finance connection/period stores also keep inline DDL private.
  // Generated cash trigger templates are covered by their evaluated export.
  for(const match of (await readFile(file,'utf8')).matchAll(/`(CREATE (?:TABLE|INDEX|UNIQUE INDEX|TRIGGER)[^`]+)`/g))if(!match[1].includes('${'))statements.push(match[1]);
  for(const match of (await readFile(file,'utf8')).matchAll(/'(CREATE TABLE[^'\n]+)'/g))statements.push(match[1]);
 }
 const unique=[...new Map(statements.map(sql=>[objectName(sql),sql])).values()];
 return unique.sort((a,b)=>Number(!/^CREATE TABLE/i.test(a))-Number(!/^CREATE TABLE/i.test(b)));
}

test('every inventoried App/Finance table, index and trigger installs independently in two real SQLite namespaces',async t=>{
 const covered=new Set();
 for(const domain of ['app','finance']){
  const {raw,A,B,a,b}=await fixture(t,domain),ddl=await schemaStatements(domain);
  for(const db of [A,B])for(let start=0;start<ddl.length;start+=30)await db.batch(ddl.slice(start,start+30).map(sql=>{let statement;assert.doesNotThrow(()=>{statement=db.prepare(sql);},objectName(sql));return statement;}));
  const names=domain==='app'?TENANT_APP_TABLES:TENANT_FINANCE_TABLES;
  for(const db of [A,B]){
   const rows=(await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY name").all()).results;
   assert.deepEqual(rows.filter(row=>row.type==='table').map(row=>row.name).sort(),[...names].sort());
   for(const sql of ddl){const name=objectName(sql),row=rows.find(row=>row.name===name);assert.ok(row,name);assert.equal(normalize(row.sql),normalize(sql),name);covered.add(name);}
   assert.ok(rows.every(row=>!row.name.startsWith('mlst_')&&!row.tbl_name.startsWith('mlst_')));
  }
  assert.ok(raw.db.prepare('SELECT name FROM sqlite_master WHERE name NOT LIKE ? AND name NOT LIKE ? AND name NOT LIKE ?').all(a.namespace+'%',b.namespace+'%','sqlite_%').length===0);
 }
 assert.deepEqual([...covered].sort(),[...TENANT_SCHEMA_OBJECTS].sort());
});

test('same month, singleton, revision and request IDs persist independently, including joins and immutable schema metadata',async t=>{
 const {A,B}=await fixture(t),ddl=[
  'CREATE TABLE IF NOT EXISTS admin_settings(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS business_month_expenses(month TEXT PRIMARY KEY,revision INTEGER,external_expenses_cents INTEGER,recharge_treatment TEXT,updated_at TEXT)',
  'CREATE TABLE IF NOT EXISTS business_expense_ledger_audit(revision INTEGER PRIMARY KEY,request_id TEXT UNIQUE,payload TEXT)',
 ];
 for(const db of [A,B])await db.batch(ddl.map(sql=>db.prepare(sql)));
 for(const [db,amount] of [[A,111],[B,999]])await db.batch([
  db.prepare('INSERT INTO admin_settings VALUES(1,1,?,?)').bind(JSON.stringify({amount,marker:'admin_settings'}),'2026-11-11'),
  db.prepare('INSERT INTO business_month_expenses VALUES(?,1,?,?,?)').bind('2026-11',amount,'UNCONFIRMED','2026-11-11'),
  db.prepare('INSERT INTO business_expense_ledger_audit VALUES(1,?,?)').bind(uuid(1),JSON.stringify({amount})),
 ]);
 assert.equal((await A.prepare('SELECT e.external_expenses_cents FROM business_month_expenses AS e JOIN admin_settings AS s ON s.id=e.revision WHERE e.month=?').bind('2026-11').first()).external_expenses_cents,111);
 assert.equal((await B.prepare('SELECT business_month_expenses.external_expenses_cents FROM business_month_expenses WHERE month=?').bind('2026-11').first()).external_expenses_cents,999);
 await A.prepare("UPDATE admin_settings SET revision=revision+1 WHERE id=1 AND EXISTS(SELECT 1 FROM sqlite_master WHERE name='admin_settings')").run();
 assert.equal((await B.prepare('SELECT revision FROM admin_settings WHERE id=1').first()).revision,1);
 assert.equal((await A.prepare('SELECT revision FROM admin_settings WHERE id=1').first()).revision,2);
});

test('domain string values and bound payloads remain unchanged in mixed schema guards',async t=>{
 const {A}=await fixture(t);await A.prepare('CREATE TABLE admin_settings(id INTEGER PRIMARY KEY,payload TEXT)').run();
 await A.prepare('INSERT INTO admin_settings VALUES(1,?)').bind('admin_settings').run();
 assert.equal((await A.prepare("SELECT payload FROM admin_settings WHERE payload='admin_settings' AND EXISTS(SELECT 1 FROM sqlite_master WHERE name='admin_settings')").first())?.payload,'admin_settings');
 assert.equal((await A.prepare("SELECT payload FROM admin_settings WHERE payload=? AND EXISTS(SELECT 1 FROM sqlite_master WHERE name='admin_settings')").bind('admin_settings').first())?.payload,'admin_settings');
});

test('actual incurred production replays equal IDs separately and parent link triggers protect only their namespace',async t=>{
 const {A,B}=await fixture(t),a={ADMIN_DB:A},b={ADMIN_DB:B},recordId=uuid(2),lineId=uuid(3),caseHash='a'.repeat(64),orderHash='b'.repeat(64);
 const body={revision:0,request_id:uuid(4),action:'record',record_id:recordId,production_ref:'SYNTHETIC-SAME-LOT',replaces_record_id:null,produced_date:'2026-11-10',quantity:3,identity:identity(),source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:1500,reference:null},evidence:'Synthetic local production',confirmed:true};
 await mutateIncurredProduction(a,body,'synthetic-a',{now});
 assert.equal((await readIncurredProduction(b,{now})).revision,0);
 await mutateIncurredProduction(b,{...body,cost:{unit_cost_cents:2500,reference:null}},'synthetic-b',{now});
 assert.equal((await mutateIncurredProduction(a,body,'synthetic-a',{now})).revision,1);
 assert.equal((await readIncurredProduction(a,{now})).summary.known_cost_cents,4500);
 assert.equal((await readIncurredProduction(b,{now})).summary.known_cost_cents,7500);
 let p=await mutatePhysicalReturns(a,{revision:0,request_id:uuid(5),action:'register',case_hash:caseHash,order_hash:orderHash},'synthetic-a',{now,sourceCase:{case_hash:caseHash,order_hash:orderHash,status:'ACCEPTED',checked_at:now()/1000-60,month:'2026-11',publication_revision:1}});
 p=await mutatePhysicalReturns(a,{revision:p.revision,request_id:uuid(6),action:'receive',case_hash:caseHash,line_id:lineId,receipt_ref:'SYNTHETIC-SAME-RECEIPT',quantity:3,identity:identity()},'synthetic-a',{now});
 let workspace=await readReturnManufacturingLinksWorkspace(a,{now});
 const link={revision:0,request_id:uuid(7),action:'link',link_id:uuid(8),case_hash:caseHash,physical_line_id:lineId,production_record_id:recordId,quantity:2,physical_fingerprint:workspace.handles.physical[0].fingerprint,production_fingerprint:workspace.handles.production[0].fingerprint,evidence:'Synthetic origin association',confirmed:true};
 await assert.rejects(mutateReturnManufacturingLinksWorkspace(b,link,'synthetic-b',{now}),/RETURN_MANUFACTURING_LINKS_PARENT_MISSING/);
 workspace=await mutateReturnManufacturingLinksWorkspace(a,link,'synthetic-a',{now});
 assert.equal(workspace.ledger.protection.state,'READY');
 await assert.rejects(A.prepare('DELETE FROM incurred_production_records WHERE record_id=?').bind(recordId).run(),/MLS_RETURN_MANUFACTURING_LINK_ACTIVE/);
 await B.prepare('DELETE FROM incurred_production_records WHERE record_id=?').bind(recordId).run();
 assert.equal((await A.prepare('SELECT count(*) AS n FROM incurred_production_records').first()).n,1);
 const other=await readReturnManufacturingLinksWorkspace(b,{now});assert.equal(other.ledger.protection.state,'NOT_INITIALIZED');
 assert.equal((await readPhysicalReturns(b,{now})).cases.length,0);
});

test('actual cash import and idempotency are isolated for equal document, external and request IDs; history triggers stay immutable',async t=>{
 const {raw,A,B}=await fixture(t,'finance'),a={FINANCE_DB:A,ADMIN_DB:raw},b={FINANCE_DB:B,ADMIN_DB:raw};
 const importInto=async(env,amount)=>{
  const input=cashPreview();input.rows[0].amount_cents=amount;const preview=await previewExternalCashImport(env,input),{cursor,limit,...payload}=input;
  return {body:{...payload,operation:'import',request_id:cashRequestId,expected_revision:preview.revision,preview_hash:preview.preview_hash,confirmed:true},env};
 };
 const first=await importInto(a,12345);await mutateExternalCash(a,first.body,{now});
 assert.equal((await readExternalCashWorkspace(b,cashRead())).revision,0);
 const second=await importInto(b,54321);await mutateExternalCash(b,second.body,{now});
 assert.equal((await mutateExternalCash(a,first.body,{now})).replayed,true);
 assert.equal((await readExternalCashWorkspace(a,cashRead())).records[0].amount_cents,12345);
 assert.equal((await readExternalCashWorkspace(b,cashRead())).records[0].amount_cents,54321);
 for(const db of [A,B])await assert.rejects(db.prepare('DELETE FROM finance_external_cash_records').run(),/external_cash_immutable/);
 const metadata=(await A.prepare('SELECT type,name,sql FROM sqlite_master WHERE name LIKE ?').bind('finance_external_cash_%').all()).results;
 assert.equal(metadata.filter(row=>row.type==='trigger').length,16);
});

test('a batch rejects foreign scoped and raw D1 statements before any write',async t=>{
 const {raw,A,B}=await fixture(t);for(const db of [A,B])await db.prepare('CREATE TABLE admin_settings(id INTEGER PRIMARY KEY,payload TEXT)').run();
 for(const bad of [B.prepare('INSERT INTO admin_settings VALUES(1,?)').bind('other'),raw.prepare('SELECT 1')])await assert.rejects(A.batch([A.prepare('INSERT INTO admin_settings VALUES(1,?)').bind('own'),bad]),isolation);
 assert.equal((await A.prepare('SELECT count(*) AS n FROM admin_settings').first()).n,0);
});

test('hostile SQL cannot read identity tables, another namespace, unknown tables or SQLite control surfaces',async t=>{
 const {raw,A,b}=await fixture(t);raw.db.exec("CREATE TABLE mls_account_records(secret TEXT); INSERT INTO mls_account_records VALUES('synthetic-account-secret'); CREATE TABLE private_records(secret TEXT); INSERT INTO private_records VALUES('synthetic-private-secret')");
 await A.prepare('CREATE TABLE admin_settings(id INTEGER PRIMARY KEY,payload TEXT)').run();
 for(const sql of [
  'SELECT * FROM mls_account_records',"SELECT * FROM 'mls_account_records'",'SELECT * FROM "mls_account_records"','SELECT * FROM [mls_account_records]',
  'SELECT * FROM private_records',"SELECT * FROM 'private_records'",'SELECT private_records.* FROM admin_settings,private_records',
  'SELECT * FROM private_records UNION ALL SELECT * FROM (WITH private_records AS (SELECT 1) SELECT 1)',
  'SELECT * FROM main.private_records','SELECT * FROM '+b.namespace+'admin_settings','PRAGMA table_info(admin_settings)',
  'ANALYZE private_records','REINDEX private_records','SELECT * FROM json_each','SELECT * FROM json_tree',
  "ATTACH DATABASE ':memory:' AS other",'SELECT * FROM sqlite_schema','SELECT * FROM pragma_table_list',
  'CREATE INDEX order_operations_identity ON private_records(secret)',
  "CREATE TRIGGER order_operations_events_no_delete BEFORE DELETE ON private_records BEGIN SELECT 1; END",
 ])await assert.rejects(async()=>A.prepare(sql).all(),isolation,sql);
});

test('local and nested CTEs, quoted logical tables and qualified column references keep working',async t=>{
 const {A,B}=await fixture(t);for(const [db,payload] of [[A,'synthetic-a'],[B,'synthetic-b']]){
  await db.prepare('CREATE TABLE admin_settings(id INTEGER PRIMARY KEY,payload TEXT)').run();await db.prepare('INSERT INTO admin_settings VALUES(1,?)').bind(payload).run();
 }
 const sql='WITH saved AS (SELECT "admin_settings".payload FROM "admin_settings" WHERE id=1), nested AS (SELECT payload FROM saved) SELECT nested.payload FROM nested';
 assert.equal((await A.prepare(sql).first()).payload,'synthetic-a');assert.equal((await B.prepare(sql).first()).payload,'synthetic-b');
});

test('App and Finance adapters on the same account database expose only their own tables and schema metadata',async t=>{
 const {raw,A,a}=await fixture(t),finance=createTenantDatabase(raw,a,{domain:'finance'});
 await A.prepare('CREATE TABLE admin_settings(id INTEGER PRIMARY KEY,payload TEXT)').run();
 await finance.prepare('CREATE TABLE finance_external_cash_records(tenant TEXT,record_id TEXT,date TEXT,amount_cents INTEGER)').run();
 await finance.prepare('CREATE INDEX finance_external_cash_records_date ON finance_external_cash_records(tenant,date)').run();
 const appObjects=(await A.prepare('SELECT name FROM sqlite_master').all()).results.map(row=>row.name);assert.deepEqual(appObjects,['admin_settings']);
 const financeObjects=(await finance.prepare('SELECT name FROM sqlite_master').all()).results.map(row=>row.name);assert.ok(financeObjects.every(name=>name.startsWith('finance_')));
 await assert.rejects(async()=>A.prepare('SELECT * FROM finance_external_cash_records').all(),isolation);
 await assert.rejects(async()=>A.prepare('CREATE TABLE finance_external_cash_guard(id INTEGER)').run(),isolation);
 await assert.rejects(async()=>finance.prepare('SELECT * FROM admin_settings').all(),isolation);
});

test('write authorization is rechecked before mutation and a revoked guard cannot change persisted data',async t=>{
 const {raw,A,a}=await fixture(t);await A.prepare('CREATE TABLE admin_settings(id INTEGER PRIMARY KEY,payload TEXT)').run();await A.prepare('INSERT INTO admin_settings VALUES(1,?)').bind('synthetic-tenant-value').run();
 let active=true,checks=0;
 const guarded=createTenantDatabase(raw,a,{authorizationGuard:async()=>{checks++;if(!active)return null;return {sql:'SELECT 1',bindings:[]};}});
 const otherRequest=createTenantDatabase(raw,a,{authorizationGuard:()=>({sql:'SELECT 1',bindings:[]})}),initialized=new TenantInitializationMap(),ready=new TenantInitializationSet();
 assert.notEqual(guarded,otherRequest);assert.equal(tenantStorageIdentity(guarded),tenantStorageIdentity(otherRequest));initialized.set(guarded,'schema-ready');ready.add(guarded);assert.equal(initialized.get(otherRequest),'schema-ready');assert.equal(ready.has(otherRequest),true);
 await guarded.prepare('UPDATE admin_settings SET payload=? WHERE id=1').bind('synthetic-updated-value').run();assert.ok(checks>0);
 active=false;
 for(const write of [()=>guarded.prepare('UPDATE admin_settings SET payload=? WHERE id=1').bind('forbidden').run(),()=>guarded.batch([guarded.prepare('UPDATE admin_settings SET payload=? WHERE id=1').bind('forbidden')])])await assert.rejects(write,isolation);
 assert.equal((await A.prepare('SELECT payload FROM admin_settings WHERE id=1').first()).payload,'synthetic-updated-value');
 await otherRequest.prepare('UPDATE admin_settings SET payload=? WHERE id=1').bind('another-authorized-request').run();
 await assert.rejects(guarded.prepare('UPDATE admin_settings SET payload=? WHERE id=1').bind('revoked-request-cannot-borrow-guard').run(),isolation);
 assert.equal((await A.prepare('SELECT payload FROM admin_settings WHERE id=1').first()).payload,'another-authorized-request');
});
