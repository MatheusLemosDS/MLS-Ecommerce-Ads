import {TENANT_APP_TABLES,TENANT_FINANCE_TABLES,TENANT_SCHEMA_OBJECTS} from './tenant-schema-manifest.mjs';
import {TenantIsolationError,createTenantDatabase} from './tenant-storage.mjs';
import {isCommercialContext} from './commercial-context.mjs';

export const TENANT_DOMAIN_MIGRATION_VERSION=1;
const fail=code=>{throw new TenantIsolationError('TENANT_MIGRATION_'+code,409);};
const encoder=new TextEncoder();
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(canonical(value)))),b=>b.toString(16).padStart(2,'0')).join('');
const pack=value=>value instanceof Uint8Array?{$blob:Array.from(value)}:typeof value==='bigint'?{$integer:String(value)}:value;
const unpack=value=>value&&typeof value==='object'&&Object.keys(value).length===1&&Array.isArray(value.$blob)?new Uint8Array(value.$blob):value&&typeof value==='object'&&Object.keys(value).length===1&&typeof value.$integer==='string'?BigInt(value.$integer):value;
const tableNames=domain=>domain==='app'?TENANT_APP_TABLES:domain==='finance'?TENANT_FINANCE_TABLES:fail('DOMAIN_INVALID');
const quoted=value=>'"'+value.replaceAll('"','""')+'"';
function snapshotContent(snapshot){return {version:snapshot.version,domain:snapshot.domain,objects:snapshot.objects,tables:snapshot.tables};}
export async function snapshotDomainDatabase(db,{domain='app'}={}){
 const names=tableNames(domain),objects=(await db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL').all()).results.filter(row=>TENANT_SCHEMA_OBJECTS.includes(row.name)&&names.includes(row.tbl_name)).sort((a,b)=>a.name.localeCompare(b.name));
 const tables=[];
 for(const object of objects.filter(row=>row.type==='table')){
  const rows=(await db.prepare('SELECT * FROM '+quoted(object.name)).all()).results.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,pack(value)]))).sort((a,b)=>canonical(a).localeCompare(canonical(b)));
  tables.push({name:object.name,rows,count:rows.length,digest:await hash(rows)});
 }
 const snapshot={version:1,domain,objects,tables};return {...snapshot,digest:await hash(snapshotContent(snapshot))};
}
export async function validateDomainSnapshot(snapshot){
 if(!snapshot||snapshot.version!==1||!['app','finance'].includes(snapshot.domain)||!Array.isArray(snapshot.objects)||!Array.isArray(snapshot.tables)||snapshot.digest!==await hash(snapshotContent(snapshot)))fail('BACKUP_INVALID');
 const tables=tableNames(snapshot.domain),seen=new Set();
 for(const object of snapshot.objects){if(!object||!TENANT_SCHEMA_OBJECTS.includes(object.name)||!tables.includes(object.tbl_name)||!['table','index','trigger'].includes(object.type)||typeof object.sql!=='string'||seen.has(object.name))fail('BACKUP_INVALID');const declaration=/^CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|TRIGGER)\s+(?:IF\s+NOT\s+EXISTS\s+)?["`\[]?([a-z_]+)/i.exec(object.sql);if(declaration?.[1].toLowerCase()!==object.type||declaration?.[2]!==object.name)fail('BACKUP_INVALID');seen.add(object.name);}
 for(const table of snapshot.tables)if(!tables.includes(table.name)||!Array.isArray(table.rows)||table.count!==table.rows.length||table.digest!==await hash(table.rows)||!snapshot.objects.some(o=>o.type==='table'&&o.name===table.name))fail('BACKUP_INVALID');
 return snapshot;
}
export async function restoreDomainSnapshot(db,snapshot,{batchSize=20}={}){
 await validateDomainSnapshot(snapshot);if(!Number.isInteger(batchSize)||batchSize<1||batchSize>40)fail('BATCH_INVALID');
 // Restore is additive and refuses any nonempty target. Never truncate or
 // overwrite a database that may contain writes made after the backup.
 const existing=await snapshotDomainDatabase(db,{domain:snapshot.domain});
 if(existing.tables.some(table=>table.count>0))fail('RESTORE_TARGET_NOT_EMPTY');
 for(const object of snapshot.objects.filter(o=>o.type==='table'))await db.prepare(object.sql.replace(/^CREATE TABLE /i,'CREATE TABLE IF NOT EXISTS ')).run();
 for(const table of snapshot.tables){
  for(let at=0;at<table.rows.length;at+=batchSize){const statements=table.rows.slice(at,at+batchSize).map(row=>{const columns=Object.keys(row);return db.prepare('INSERT INTO '+quoted(table.name)+'('+columns.map(quoted).join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').bind(...columns.map(key=>unpack(row[key])));});await db.batch(statements);}
 }
 for(const object of snapshot.objects.filter(o=>o.type!=='table'))await db.prepare(object.sql.replace(/^CREATE (INDEX|TRIGGER) /i,'CREATE $1 IF NOT EXISTS ')).run();
 const restored=await snapshotDomainDatabase(db,{domain:snapshot.domain});if(restored.digest!==snapshot.digest)fail('RESTORE_VERIFICATION_FAILED');return restored;
}
const migrationSchema=[
 'CREATE TABLE IF NOT EXISTS mls_tenant_migrations(organization_id TEXT NOT NULL,store_id TEXT NOT NULL,domain TEXT NOT NULL,migration_version INTEGER NOT NULL DEFAULT 1,source_digest TEXT NOT NULL,owner_user_id TEXT NOT NULL,state TEXT NOT NULL,legacy_cash_tenant TEXT,completed_at INTEGER,PRIMARY KEY(organization_id,store_id,domain))',
 'CREATE TABLE IF NOT EXISTS mls_tenant_migration_tables(organization_id TEXT NOT NULL,store_id TEXT NOT NULL,domain TEXT NOT NULL,table_name TEXT NOT NULL,source_digest TEXT NOT NULL,row_count INTEGER NOT NULL,PRIMARY KEY(organization_id,store_id,domain,table_name))',
];
export async function backfillLegacyTenant({legacyDb,accountDb,context,domain='app',confirmed=false,legacyMapping,now=()=>Date.now(),afterTable=async()=>{}}={}){
 if(confirmed!==true||!isCommercialContext(context)||legacyMapping?.kind!=='explicit-legacy-owner'||legacyMapping.organizationId!==context.organizationId||legacyMapping.storeId!==context.storeId||legacyMapping.userId!==context.userId||legacyDb===accountDb||!accountDb?.batch)fail('EXPLICIT_MAPPING_REQUIRED');
 const snapshot=await snapshotDomainDatabase(legacyDb,{domain});await validateDomainSnapshot(snapshot);
 const cashStates=domain==='finance'?snapshot.tables.find(table=>table.name==='finance_external_cash_state')?.rows??[]:[];
 const legacyCashTenant=cashStates.length?legacyMapping.cashTenant??null:null;
 if(cashStates.length&&(typeof legacyCashTenant!=='string'||! /^[A-Za-z0-9:_-]{1,256}$/.test(legacyCashTenant)||!cashStates.some(row=>row.tenant===legacyCashTenant)))fail('EXPLICIT_CASH_ALIAS_REQUIRED');
 await accountDb.batch(migrationSchema.map(sql=>accountDb.prepare(sql)));
 const scope=[context.organizationId,context.storeId,domain],prior=await accountDb.prepare('SELECT source_digest,state,migration_version,legacy_cash_tenant FROM mls_tenant_migrations WHERE organization_id=? AND store_id=? AND domain=?').bind(...scope).first();
 if(prior&&prior.migration_version!==TENANT_DOMAIN_MIGRATION_VERSION)fail('VERSION_UNSUPPORTED');
 if(prior?.source_digest!==undefined&&prior.source_digest!==snapshot.digest)fail('SOURCE_CHANGED');
 if(prior&&prior.legacy_cash_tenant!==legacyCashTenant)fail('CASH_ALIAS_CHANGED');
 if(prior?.state==='COMPLETE')return {version:TENANT_DOMAIN_MIGRATION_VERSION,state:'COMPLETE',replayed:true,legacyCashTenant,source_digest:snapshot.digest,counts:snapshot.tables.map(t=>({name:t.name,count:t.count,digest:t.digest}))};
 const scoped=createTenantDatabase(accountDb,context,{domain});
 if(!prior){const target=await snapshotDomainDatabase(scoped,{domain});if(target.tables.some(t=>t.count))fail('TARGET_NOT_EMPTY');await accountDb.prepare("INSERT INTO mls_tenant_migrations(organization_id,store_id,domain,source_digest,owner_user_id,state,legacy_cash_tenant) VALUES(?,?,?,?,?,'COPYING',?)").bind(...scope,snapshot.digest,context.userId,legacyCashTenant).run();}
 for(const object of snapshot.objects.filter(o=>o.type==='table'))await scoped.prepare(object.sql.replace(/^CREATE TABLE /i,'CREATE TABLE IF NOT EXISTS ')).run();
 for(const table of snapshot.tables){
  const checkpoint=await accountDb.prepare('SELECT source_digest FROM mls_tenant_migration_tables WHERE organization_id=? AND store_id=? AND domain=? AND table_name=?').bind(...scope,table.name).first();
  if(checkpoint){if(checkpoint.source_digest!==table.digest)fail('CHECKPOINT_INVALID');continue;}
  // Per-table atomic copies make interruption/resume deterministic. No fact,
  // JSON field, historical actor, source hash or revision is modified.
  const statements=[];
  for(const row of table.rows){const columns=Object.keys(row);statements.push(scoped.prepare('INSERT OR IGNORE INTO '+quoted(table.name)+'('+columns.map(quoted).join(',')+') VALUES('+columns.map(()=>'?').join(',')+')').bind(...columns.map(key=>unpack(row[key]))));}
  for(let at=0;at<statements.length;at+=20)await scoped.batch(statements.slice(at,at+20));
  const copied=(await snapshotDomainDatabase(scoped,{domain})).tables.find(t=>t.name===table.name);if(!copied||copied.digest!==table.digest)fail('TABLE_VERIFICATION_FAILED');
  await accountDb.prepare('INSERT INTO mls_tenant_migration_tables(organization_id,store_id,domain,table_name,source_digest,row_count) VALUES(?,?,?,?,?,?)').bind(...scope,table.name,table.digest,table.count).run();
  await afterTable(table.name);
 }
 for(const object of snapshot.objects.filter(o=>o.type!=='table'))await scoped.prepare(object.sql.replace(/^CREATE (INDEX|TRIGGER) /i,'CREATE $1 IF NOT EXISTS ')).run();
 const copied=await snapshotDomainDatabase(scoped,{domain}),original=await snapshotDomainDatabase(legacyDb,{domain});if(copied.digest!==snapshot.digest||original.digest!==snapshot.digest)fail('VERIFICATION_FAILED');
 await accountDb.prepare("UPDATE mls_tenant_migrations SET state='COMPLETE',completed_at=? WHERE organization_id=? AND store_id=? AND domain=? AND source_digest=?").bind(Math.floor(now()/1000),...scope,snapshot.digest).run();
 return {version:TENANT_DOMAIN_MIGRATION_VERSION,state:'COMPLETE',replayed:false,legacyCashTenant,source_digest:snapshot.digest,counts:snapshot.tables.map(t=>({name:t.name,count:t.count,digest:t.digest}))};
}
export async function commercialMigrationState(accountDb,context,domain='app'){
 if(!isCommercialContext(context))fail('CONTEXT_INVALID');
 const schema=await accountDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mls_tenant_migrations'").first();if(!schema)return null;
 return accountDb.prepare('SELECT state,source_digest,completed_at,migration_version,legacy_cash_tenant FROM mls_tenant_migrations WHERE organization_id=? AND store_id=? AND domain=?').bind(context.organizationId,context.storeId,domain).first();
}
