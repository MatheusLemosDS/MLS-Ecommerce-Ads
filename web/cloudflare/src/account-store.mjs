// Additive account storage. ACCOUNT_DB is deliberately never ADMIN_DB.
import {ACCOUNT_POLICY} from './account-policy.mjs';
export const ACCOUNT_MIGRATION_VERSION=2;
export const ACCOUNT_SCHEMA=Object.freeze([
 `CREATE TABLE IF NOT EXISTS mls_account_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS mls_account_records(kind TEXT NOT NULL,scope TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=1048576),PRIMARY KEY(kind,scope,id))`,
 `CREATE TABLE IF NOT EXISTS mls_account_emails(email TEXT PRIMARY KEY COLLATE BINARY,user_id TEXT NOT NULL UNIQUE)`,
 `CREATE TABLE IF NOT EXISTS mls_account_guard(ok INTEGER NOT NULL CHECK(ok=1))`,
 `CREATE TABLE IF NOT EXISTS mls_account_limits(action TEXT NOT NULL,dimension TEXT NOT NULL,key_hash TEXT NOT NULL,window_start INTEGER NOT NULL,count INTEGER NOT NULL CHECK(count>0),PRIMARY KEY(action,dimension,key_hash,window_start))`,
 `CREATE INDEX IF NOT EXISTS mls_account_records_scope ON mls_account_records(scope,kind,id)`,
 // An empty receipt registry makes authorization snapshots one atomic SELECT.
 // Only the explicit tenant migration writer may populate these receipts.
 `CREATE TABLE IF NOT EXISTS mls_tenant_migrations(organization_id TEXT NOT NULL,store_id TEXT NOT NULL,domain TEXT NOT NULL,migration_version INTEGER NOT NULL DEFAULT 1,source_digest TEXT NOT NULL,owner_user_id TEXT NOT NULL,state TEXT NOT NULL,legacy_cash_tenant TEXT,completed_at INTEGER,PRIMARY KEY(organization_id,store_id,domain))`,
]);
export class AccountError extends Error{constructor(code,status=400){super(code);this.name='AccountError';this.code=code;this.status=status;}}
export function accountFail(code,status=400){throw new AccountError(code,status);}
const ready=new WeakMap();
export function accountDatabase(env){const db=env?.ACCOUNT_DB;if(!db||db===env?.ADMIN_DB||typeof db.prepare!=='function'||typeof db.batch!=='function')accountFail('ACCOUNT_DATABASE_CONFIGURATION',503);return db;}
const schemaObjectsWhere="name NOT LIKE 'sqlite_%' AND (name LIKE 'mls_account_%' OR tbl_name LIKE 'mls_account_%' OR name='mls_tenant_migrations' OR tbl_name='mls_tenant_migrations')";
const schemaObjectsSelect="SELECT json_group_array(json_object('name',name,'type',type,'sql',sql)) FROM sqlite_master WHERE "+schemaObjectsWhere;
const normalizeAccountSchema=sql=>String(sql).replace(/\bIF\s+NOT\s+EXISTS\b/gi,'').replace(/\s+/g,'').toLowerCase();
const expectedAccountObjects=new Map(ACCOUNT_SCHEMA.map(sql=>{const match=/^CREATE (TABLE|INDEX) IF NOT EXISTS ([a-z_]+)/.exec(sql);return [match[2],{type:match[1].toLowerCase(),sql:normalizeAccountSchema(sql)}];}));
async function accountSchemaProbe(db){
 let row;try{row=await db.prepare('SELECT COALESCE(MAX(version),0) AS version,COUNT(*) AS migration_count,('+schemaObjectsSelect+') AS objects FROM mls_account_migrations').first();}
 catch(error){if(!/no such table.*mls_account_migrations/i.test(String(error?.message)))accountFail('ACCOUNT_SCHEMA_DRIFT',503);try{row={version:0,migration_count:0,...await db.prepare('SELECT ('+schemaObjectsSelect+') AS objects').first()};}catch{accountFail('ACCOUNT_STORAGE_UNAVAILABLE',503);}}
 let objects;try{objects=JSON.parse(row.objects);if(!Array.isArray(objects))throw Error();}catch{accountFail('ACCOUNT_SCHEMA_DRIFT',503);}
 if(!Number.isSafeInteger(row.version)||row.version<0||row.version>ACCOUNT_MIGRATION_VERSION||row.version===0&&row.migration_count!==0)accountFail('ACCOUNT_MIGRATION_VERSION_UNSUPPORTED',503);
 const names=new Set();for(const object of objects){const expected=expectedAccountObjects.get(object.name);if(!expected||names.has(object.name)||object.type!==expected.type||typeof object.sql!=='string'||normalizeAccountSchema(object.sql)!==expected.sql)accountFail('ACCOUNT_SCHEMA_DRIFT',503);names.add(object.name);}
 if(row.version>=1)for(const name of expectedAccountObjects.keys())if((row.version>=2||name!=='mls_tenant_migrations')&&!names.has(name))accountFail('ACCOUNT_SCHEMA_DRIFT',503);
 if(row.version===0){const dataTables=['mls_account_records','mls_account_emails','mls_account_guard','mls_account_limits'].filter(name=>names.has(name));if(dataTables.length){const counts=dataTables.map(name=>'(SELECT COUNT(*) FROM '+name+')').join('+');if((await db.prepare('SELECT '+counts+' AS total').first()).total!==0)accountFail('ACCOUNT_SCHEMA_DRIFT',503);}}
 return row.version;
}
export async function migrateAccountDatabase(env,{now=()=>Date.now()}={}){
 const db=accountDatabase(env);if(ready.has(db))return ready.get(db);
 const work=(async()=>{const version=await accountSchemaProbe(db);if(version===ACCOUNT_MIGRATION_VERSION)return db;const clock=now();if(!Number.isSafeInteger(clock)||clock<1000)accountFail('ACCOUNT_CLOCK_CONFIGURATION',503);const stamp=Math.floor(clock/1000),schema=version===1?[ACCOUNT_SCHEMA.at(-1)]:ACCOUNT_SCHEMA,versions=version===1?[2]:[1,2];await db.batch([...schema.map(sql=>db.prepare(sql)),...versions.map(value=>db.prepare('INSERT OR IGNORE INTO mls_account_migrations(version,applied_at) VALUES(?,?)').bind(value,stamp))]);return db;})();ready.set(db,work);
 try{return await work;}catch(error){if(error instanceof AccountError)throw error;accountFail('ACCOUNT_STORAGE_UNAVAILABLE',503);}finally{ready.delete(db);}
}
function decoded(row){if(!row)return null;try{return {...JSON.parse(row.payload),revision:row.revision};}catch{accountFail('ACCOUNT_STORAGE_INVALID',503);}}
export async function accountGet(db,kind,scope,id){try{return decoded(await db.prepare('SELECT revision,payload FROM mls_account_records WHERE kind=? AND scope=? AND id=?').bind(kind,scope,id).first());}catch(error){if(error instanceof AccountError)throw error;accountFail('ACCOUNT_STORAGE_UNAVAILABLE',503);}}
export async function accountList(db,kind,scope,{limit=1000}={}){try{const rows=(await db.prepare('SELECT revision,payload FROM mls_account_records WHERE kind=? AND scope=? ORDER BY id LIMIT ?').bind(kind,scope,limit+1).all()).results;if(rows.length>limit)accountFail('ACCOUNT_RESULT_LIMIT',413);return rows.map(decoded);}catch(error){if(error instanceof AccountError)throw error;accountFail('ACCOUNT_STORAGE_UNAVAILABLE',503);}}
export async function accountFindEmail(db,email){try{return (await db.prepare('SELECT user_id FROM mls_account_emails WHERE email=?').bind(email).first())?.user_id??null;}catch{accountFail('ACCOUNT_STORAGE_UNAVAILABLE',503);}}
export function accountChange(kind,scope,value,expectedRevision=null){return {kind,scope,id:value.id,expectedRevision,value};}
export function accountCheck(kind,scope,id,expectedRevision){return {kind,scope,id,expectedRevision,check:true};}
export function accountRevokeSessions(userId,at,exceptId=null){return {operation:'REVOKE_SESSIONS',userId,at,exceptId};}
export function accountRevokeTokens(userId,purpose,at){return {operation:'REVOKE_TOKENS',userId,purpose,at};}
export function accountRevokeInvitationTokens(organizationId,invitationId,at){return {operation:'REVOKE_INVITATION_TOKENS',organizationId,invitationId,at};}
export function accountConsumeRecoveryCodes(userId,at){return {operation:'CONSUME_RECOVERY_CODES',userId,at};}
export function accountCheckTokenCooldown(userId,purpose,at,cooldown){return {operation:'CHECK_TOKEN_COOLDOWN',userId,purpose,at,cooldown};}
const accountScopeId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
const accountTokenPurpose=value=>['EMAIL_VERIFICATION','EMAIL_CHANGE','PASSWORD_RESET','INVITATION'].includes(value);
export async function accountCommit(db,changes,{emailClaims=[],emailChanges=[]}={}){
 const statements=[],guard=sql=>db.prepare('INSERT INTO mls_account_guard(ok) SELECT CASE WHEN '+sql+' THEN 1 ELSE 0 END');
 for(const c of changes){
  if(c.operation){
   if(!Number.isSafeInteger(c.at)||c.at<1)accountFail('ACCOUNT_TRANSACTION_INVALID',503);
   if(c.operation==='REVOKE_SESSIONS'){
    if(!accountScopeId(c.userId)||c.exceptId!==null&&!accountScopeId(c.exceptId))accountFail('ACCOUNT_TRANSACTION_INVALID',503);
    statements.push(db.prepare("UPDATE mls_account_records SET revision=revision+1,payload=json_set(payload,'$.revoked_at',?) WHERE kind='session' AND scope='global' AND json_extract(payload,'$.user_id')=? AND json_extract(payload,'$.revoked_at') IS NULL AND (? IS NULL OR id<>?)").bind(c.at,c.userId,c.exceptId,c.exceptId));
   }else if(c.operation==='REVOKE_TOKENS'){
    if(!accountScopeId(c.userId)||!accountTokenPurpose(c.purpose))accountFail('ACCOUNT_TRANSACTION_INVALID',503);
    statements.push(db.prepare("UPDATE mls_account_records SET revision=revision+1,payload=json_set(payload,'$.revoked_at',?) WHERE kind='token' AND scope='global' AND json_extract(payload,'$.user_id')=? AND json_extract(payload,'$.purpose')=? AND json_extract(payload,'$.revoked_at') IS NULL AND json_extract(payload,'$.consumed_at') IS NULL").bind(c.at,c.userId,c.purpose));
   }else if(c.operation==='REVOKE_INVITATION_TOKENS'){
    if(!accountScopeId(c.organizationId)||!accountScopeId(c.invitationId))accountFail('ACCOUNT_TRANSACTION_INVALID',503);
    statements.push(db.prepare("UPDATE mls_account_records SET revision=revision+1,payload=json_set(payload,'$.revoked_at',?) WHERE kind='token' AND scope='global' AND json_extract(payload,'$.purpose')='INVITATION' AND json_extract(payload,'$.organization_id')=? AND json_extract(payload,'$.invitation_id')=? AND json_extract(payload,'$.revoked_at') IS NULL AND json_extract(payload,'$.consumed_at') IS NULL").bind(c.at,c.organizationId,c.invitationId));
   }else if(c.operation==='CONSUME_RECOVERY_CODES'){
    if(!accountScopeId(c.userId))accountFail('ACCOUNT_TRANSACTION_INVALID',503);
    statements.push(db.prepare("UPDATE mls_account_records SET revision=revision+1,payload=json_set(payload,'$.consumed_at',?) WHERE kind='recovery' AND scope=? AND json_extract(payload,'$.consumed_at') IS NULL").bind(c.at,c.userId));
   }else if(c.operation==='CHECK_TOKEN_COOLDOWN'){
    if(!accountScopeId(c.userId)||!accountTokenPurpose(c.purpose)||!Number.isSafeInteger(c.cooldown)||c.cooldown<1)accountFail('ACCOUNT_TRANSACTION_INVALID',503);
    statements.push(db.prepare("INSERT INTO mls_account_guard(ok) SELECT 0 WHERE EXISTS(SELECT 1 FROM mls_account_records WHERE kind='token' AND scope='global' AND json_extract(payload,'$.user_id')=? AND json_extract(payload,'$.purpose')=? AND json_extract(payload,'$.revoked_at') IS NULL AND json_extract(payload,'$.consumed_at') IS NULL AND json_extract(payload,'$.created_at')>?)").bind(c.userId,c.purpose,c.at-c.cooldown));
   }else accountFail('ACCOUNT_TRANSACTION_INVALID',503);
   continue;
  }
  if(c.check){statements.push(db.prepare('INSERT INTO mls_account_guard(ok) SELECT CASE WHEN EXISTS(SELECT 1 FROM mls_account_records WHERE kind=? AND scope=? AND id=? AND revision=?) THEN 1 ELSE 0 END').bind(c.kind,c.scope,c.id,c.expectedRevision));continue;}
  const payload={...c.value};delete payload.revision;const raw=JSON.stringify(payload);if(new TextEncoder().encode(raw).length>1048576)accountFail('ACCOUNT_RECORD_TOO_LARGE',413);
  if(c.expectedRevision===null)statements.push(db.prepare('INSERT OR IGNORE INTO mls_account_records(kind,scope,id,revision,payload) VALUES(?,?,?,1,?)').bind(c.kind,c.scope,c.id,raw));
  else statements.push(db.prepare('UPDATE mls_account_records SET revision=revision+1,payload=? WHERE kind=? AND scope=? AND id=? AND revision=?').bind(raw,c.kind,c.scope,c.id,c.expectedRevision));
  statements.push(guard('changes()=1'));
 }
 for(const {email,userId} of emailClaims){statements.push(db.prepare('INSERT INTO mls_account_emails(email,user_id) VALUES(?,?)').bind(email,userId));}
 for(const {oldEmail,email,userId} of emailChanges){statements.push(db.prepare('UPDATE mls_account_emails SET email=? WHERE email=? AND user_id=?').bind(email,oldEmail,userId),guard('changes()=1'));}
 statements.push(db.prepare('DELETE FROM mls_account_guard'));
 try{await db.batch(statements);}catch{accountFail('ACCOUNT_REVISION_CONFLICT',409);}
}
export async function accountListUserSessions(db,userId,{limit=1000}={}){
 if(!accountScopeId(userId)||!Number.isSafeInteger(limit)||limit<1||limit>1000)accountFail('ACCOUNT_TRANSACTION_INVALID',503);
 try{const rows=(await db.prepare("SELECT revision,payload FROM mls_account_records WHERE kind='session' AND scope='global' AND json_extract(payload,'$.user_id')=? ORDER BY id LIMIT ?").bind(userId,limit+1).all()).results;if(rows.length>limit)accountFail('ACCOUNT_RESULT_LIMIT',413);return rows.map(decoded);}catch(error){if(error instanceof AccountError)throw error;accountFail('ACCOUNT_STORAGE_UNAVAILABLE',503);}
}
export async function accountLatestActiveToken(db,userId,purpose){
 if(!accountScopeId(userId)||!accountTokenPurpose(purpose))accountFail('ACCOUNT_TRANSACTION_INVALID',503);
 try{return decoded(await db.prepare("SELECT revision,payload FROM mls_account_records WHERE kind='token' AND scope='global' AND json_extract(payload,'$.user_id')=? AND json_extract(payload,'$.purpose')=? AND json_extract(payload,'$.revoked_at') IS NULL AND json_extract(payload,'$.consumed_at') IS NULL ORDER BY json_extract(payload,'$.created_at') DESC,id DESC LIMIT 1").bind(userId,purpose).first());}catch(error){if(error instanceof AccountError)throw error;accountFail('ACCOUNT_STORAGE_UNAVAILABLE',503);}
}
export async function accountRateLimit(db,action,keys,{now,windowSeconds=ACCOUNT_POLICY.abuse.windowSeconds,limits={account:ACCOUNT_POLICY.abuse.account,origin:ACCOUNT_POLICY.abuse.origin,global:ACCOUNT_POLICY.abuse.global}}={}){
 const stamp=Math.floor(now/1000),window=Math.floor(stamp/windowSeconds)*windowSeconds,changes=[];
 if(!Number.isSafeInteger(stamp)||!Number.isSafeInteger(windowSeconds)||windowSeconds<1||windowSeconds>86400||Object.values(limits).some(v=>!Number.isSafeInteger(v)||v<1||v>100000))accountFail('ACCOUNT_ABUSE_CONFIGURATION',503);
 changes.push(db.prepare('DELETE FROM mls_account_limits WHERE window_start<?').bind(stamp-172800));
 for(const [dimension,keyHash] of Object.entries(keys)){if(!limits[dimension])continue;changes.push(db.prepare('INSERT INTO mls_account_limits(action,dimension,key_hash,window_start,count) VALUES(?,?,?,?,1) ON CONFLICT(action,dimension,key_hash,window_start) DO UPDATE SET count=count+1').bind(action,dimension,keyHash,window));}
 try{await db.batch(changes);for(const [dimension,keyHash] of Object.entries(keys)){if(!limits[dimension])continue;const row=await db.prepare('SELECT count FROM mls_account_limits WHERE action=? AND dimension=? AND key_hash=? AND window_start=?').bind(action,dimension,keyHash,window).first();if(row.count>limits[dimension])accountFail('ACCOUNT_RATE_LIMITED',429);}}catch(error){if(error instanceof AccountError)throw error;accountFail('ACCOUNT_STORAGE_UNAVAILABLE',503);}
}
export async function accountSecurityEvent(db,{userId,organizationId=null,action,result='SUCCESS',at,targetId=null}){
 const id=crypto.randomUUID(),value={id,user_id:userId,organization_id:organizationId,action,result,at,target_id:targetId};
 await accountCommit(db,[accountChange('security',userId,value),...(organizationId?[accountChange('audit',organizationId,value)]:[])]);return value;
}
