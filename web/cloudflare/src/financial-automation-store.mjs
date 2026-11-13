import {FinancialLedgerError,normalizeFinancialScope,financialCanonicalJSON,financialDigest} from './financial-event-ledger.mjs';
import {assertFinancialAccess,financialDatabase,financialClock,financialScopeKey} from './financial-event-store.mjs';
import {TenantInitializationSet} from './tenant-storage.mjs';

export const FINANCIAL_AUTOMATION_SCHEMA=Object.freeze([
 `CREATE TABLE IF NOT EXISTS financial_automation_heads(scope_key TEXT NOT NULL,kind TEXT NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(scope_key,kind))`,
 `CREATE TABLE IF NOT EXISTS financial_automation_revisions(scope_key TEXT NOT NULL,kind TEXT NOT NULL,version INTEGER NOT NULL,scope_payload TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=196608),payload_hash TEXT NOT NULL,previous_hash TEXT,actor TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(scope_key,kind,version))`,
 `CREATE TABLE IF NOT EXISTS financial_automation_requests(scope_key TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,kind TEXT NOT NULL,version INTEGER NOT NULL,PRIMARY KEY(scope_key,request_id))`,
 `CREATE TABLE IF NOT EXISTS financial_automation_guard(id INTEGER PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))`,
 ...['financial_automation_revisions','financial_automation_requests'].flatMap(table=>['UPDATE','DELETE'].map(verb=>`CREATE TRIGGER IF NOT EXISTS ${table}_no_${verb.toLowerCase()} BEFORE ${verb} ON ${table} BEGIN SELECT RAISE(ABORT,'financial_history_immutable'); END`)),
]);
const ready=new TenantInitializationSet(),integer=v=>Number.isSafeInteger(v)&&v>=0&&v<=2147483645,kind=v=>typeof v==='string'&&/^[A-Z][A-Za-z0-9_.:-]{0,127}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=(code,status=400)=>{throw new FinancialLedgerError('FINANCIAL_AUTOMATION_'+code,status);};
async function present(db){return !!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='financial_automation_heads'").first();}
export async function ensureFinancialAutomationSchema(env,scope,options={}){await assertFinancialAccess(env,scope,options,'write');const db=financialDatabase(env);if(!ready.has(db)){await db.batch(FINANCIAL_AUTOMATION_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}return db;}
async function saved(row,scope){
 if(!row||!integer(row.version)||row.version<1||typeof row.payload!=='string'||!hash(row.payload_hash)||row.previous_hash!==null&&!hash(row.previous_hash)||row.scope_payload!==financialCanonicalJSON(scope))fail('STORAGE_INVALID',503);
 let payload;try{payload=JSON.parse(row.payload);}catch{fail('STORAGE_INVALID',503);}if(await financialDigest(payload)!==row.payload_hash)fail('STORAGE_INVALID',503);
 return {revision:row.version,payload,hash:row.payload_hash,previous_hash:row.previous_hash,actor:row.actor,created_at:row.created_at};
}
async function selected(db,key,scope,type){
 const rows=await db.batch([db.prepare('SELECT version FROM financial_automation_heads WHERE scope_key=? AND kind=?').bind(key,type),db.prepare('SELECT r.* FROM financial_automation_revisions r JOIN financial_automation_heads h ON h.scope_key=r.scope_key AND h.kind=r.kind AND h.version=r.version WHERE r.scope_key=? AND r.kind=?').bind(key,type)]);
 if(!Array.isArray(rows)||rows.length!==2||rows.some(r=>!Array.isArray(r.results)||r.results.length>1)||!!rows[0].results.length!==!!rows[1].results.length)fail('STORAGE_INVALID',503);
 const value=rows[1].results[0]?await saved(rows[1].results[0],scope):null;if(value&&value.revision!==rows[0].results[0].version)fail('SOURCE_CHANGED',409);return value;
}
export async function readFinancialAutomationState(env,input,options={}){
 financialCanonicalJSON(input);if(!kind(input?.kind))fail('REQUEST_INVALID');const scope=await assertFinancialAccess(env,input.scope,options),db=financialDatabase(env),key=await financialScopeKey(scope);
 if(!await present(db)){await assertFinancialAccess(env,scope,options);return {schema:'financial_automation_state_v1',scope,kind:input.kind,revision:0,payload:null,hash:null,history:[]};}
 const current=await selected(db,key,scope,input.kind),history=[];
 if(input.history===true){const rows=(await db.prepare('SELECT * FROM financial_automation_revisions WHERE scope_key=? AND kind=? ORDER BY version DESC LIMIT 1000').bind(key,input.kind).all()).results;if(!Array.isArray(rows))fail('STORAGE_INVALID',503);for(const row of rows)history.push(await saved(row,scope));}
 await assertFinancialAccess(env,scope,options);return {schema:'financial_automation_state_v1',scope,kind:input.kind,revision:current?.revision??0,payload:current?.payload??null,hash:current?.hash??null,history};
}
export async function writeFinancialAutomationState(env,input,options={}){
 financialCanonicalJSON(input);if(!input||Object.keys(input).length!==5||!kind(input.kind)||!integer(input.expected_revision)||!uuid(input.request_id)||!input.payload||typeof input.payload!=='object')fail('REQUEST_INVALID');
 const scope=await assertFinancialAccess(env,input.scope,options,'write'),db=financialDatabase(env),key=await financialScopeKey(scope),stamp=financialClock(options);
 if(typeof options.actor!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(options.actor))fail('ACTOR_INVALID',403);
 await ensureFinancialAutomationSchema(env,scope,options);
 const requestHash=await financialDigest(options.requestIdentity===undefined?input:{scope,kind:input.kind,actor:options.actor,command:options.requestIdentity}),replayed=await db.prepare('SELECT request_hash,kind,version FROM financial_automation_requests WHERE scope_key=? AND request_id=?').bind(key,input.request_id).first();
 if(replayed){if(replayed.request_hash!==requestHash||replayed.kind!==input.kind)fail('REQUEST_CONFLICT',409);const row=await db.prepare('SELECT * FROM financial_automation_revisions WHERE scope_key=? AND kind=? AND version=?').bind(key,input.kind,replayed.version).first();const result=await saved(row,scope);await assertFinancialAccess(env,scope,options,'write');return {schema:'financial_automation_state_mutation_v1',...result,replayed:true};}
 const observed=await selected(db,key,scope,input.kind);if((observed?.revision??0)!==input.expected_revision)fail('REVISION_CONFLICT',409);
 const payload=financialCanonicalJSON(input.payload),payloadHash=await financialDigest(input.payload),version=input.expected_revision+1;if(!integer(version))fail('REVISION_LIMIT',409);
 const guard=(sql,args)=>db.prepare('INSERT INTO financial_automation_guard(id,ok) SELECT 1,0 WHERE NOT ('+sql+')').bind(...args);
 const fences=options.sourceStateFences??[];if(!Array.isArray(fences)||fences.length>3||new Set(fences.map(row=>row?.table)).size!==fences.length||fences.some(row=>!row||Object.keys(row).length!==2||!['incurred_production_state','physical_returns_state','return_manufacturing_links_state'].includes(row.table)||!integer(row.revision)))fail('SOURCE_FENCE_INVALID');
 const statements=[...fences.map(row=>guard('COALESCE((SELECT revision FROM '+row.table+' WHERE id=1),0)=?',[row.revision])),guard('COALESCE((SELECT version FROM financial_automation_heads WHERE scope_key=? AND kind=?),0)=?',[key,input.kind,input.expected_revision]),db.prepare('INSERT INTO financial_automation_revisions(scope_key,kind,version,scope_payload,payload,payload_hash,previous_hash,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(key,input.kind,version,financialCanonicalJSON(scope),payload,payloadHash,observed?.hash??null,options.actor,stamp),db.prepare('INSERT INTO financial_automation_heads(scope_key,kind,version) VALUES(?,?,?) ON CONFLICT(scope_key,kind) DO UPDATE SET version=excluded.version').bind(key,input.kind,version),db.prepare('INSERT INTO financial_automation_requests(scope_key,request_id,request_hash,kind,version) VALUES(?,?,?,?,?)').bind(key,input.request_id,requestHash,input.kind,version),guard('EXISTS(SELECT 1 FROM financial_automation_revisions WHERE scope_key=? AND kind=? AND version=? AND payload_hash=?) AND EXISTS(SELECT 1 FROM financial_automation_heads WHERE scope_key=? AND kind=? AND version=?) AND EXISTS(SELECT 1 FROM financial_automation_requests WHERE scope_key=? AND request_id=? AND request_hash=? AND kind=? AND version=?)',[key,input.kind,version,payloadHash,key,input.kind,version,key,input.request_id,requestHash,input.kind,version])];
 try{await assertFinancialAccess(env,scope,options,'write');await db.batch(statements);}catch(error){if(error?.status===403)throw error;const current=await selected(db,key,scope,input.kind);if((current?.revision??0)!==input.expected_revision)fail('REVISION_CONFLICT',409);if(fences.length)fail('SOURCE_CHANGED',409);throw new FinancialLedgerError('FINANCIAL_AUTOMATION_STORAGE_WRITE_FAILED',503,{cause:error});}
 await assertFinancialAccess(env,scope,options,'write');return {schema:'financial_automation_state_mutation_v1',revision:version,payload:JSON.parse(payload),hash:payloadHash,previous_hash:observed?.hash??null,actor:options.actor,created_at:stamp,replayed:false};
}
