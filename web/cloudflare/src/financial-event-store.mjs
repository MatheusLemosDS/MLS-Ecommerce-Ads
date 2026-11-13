import {FinancialLedgerError,normalizeFinancialScope,sameFinancialScope,validateFinancialEvent,financialCanonicalJSON,financialDigest,financialEventIdentity,financialEventContentHash,financialPostingDelta,normalizeFinancialTimestamp} from './financial-event-ledger.mjs';
import {isCommercialContext,assertCommercialCapability} from './commercial-context.mjs';
import {TenantInitializationSet,tenantDatabaseHasContext} from './tenant-storage.mjs';

export const FINANCIAL_EVENT_SCHEMA=Object.freeze([
 `CREATE TABLE IF NOT EXISTS financial_ledger_state(scope_key TEXT PRIMARY KEY,scope_payload TEXT NOT NULL,revision INTEGER NOT NULL,mutation_id TEXT NOT NULL,updated_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS financial_event_heads(scope_key TEXT NOT NULL,event_id TEXT NOT NULL,version INTEGER NOT NULL,content_hash TEXT NOT NULL,PRIMARY KEY(scope_key,event_id))`,
 `CREATE TABLE IF NOT EXISTS financial_event_revisions(scope_key TEXT NOT NULL,event_id TEXT NOT NULL,version INTEGER NOT NULL,ledger_revision INTEGER NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=32768),payload_hash TEXT NOT NULL,content_hash TEXT NOT NULL,previous_hash TEXT,delta_payload TEXT NOT NULL,actor TEXT NOT NULL,recorded_at TEXT NOT NULL,PRIMARY KEY(scope_key,event_id,version),UNIQUE(scope_key,ledger_revision))`,
 `CREATE TABLE IF NOT EXISTS financial_event_requests(scope_key TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,event_id TEXT NOT NULL,version INTEGER NOT NULL,ledger_revision INTEGER NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(scope_key,request_id))`,
 `CREATE TABLE IF NOT EXISTS financial_event_batches(scope_key TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,response_payload TEXT NOT NULL,response_hash TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(scope_key,request_id))`,
 `CREATE TABLE IF NOT EXISTS financial_event_guard(id INTEGER PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))`,
 ...['financial_event_revisions','financial_event_requests','financial_event_batches'].flatMap(table=>['UPDATE','DELETE'].map(verb=>`CREATE TRIGGER IF NOT EXISTS ${table}_no_${verb.toLowerCase()} BEFORE ${verb} ON ${table} BEGIN SELECT RAISE(ABORT,'financial_history_immutable'); END`)),
]);
const initialized=new TenantInitializationSet(),int=v=>Number.isSafeInteger(v)&&v>=0&&v<=2147483645&&!Object.is(v,-0),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const fail=(code,status=400)=>{throw new FinancialLedgerError('FINANCIAL_'+code,status);};
export function financialDatabase(env){const db=env?.ADMIN_DB;if(!db?.prepare||!db?.batch)fail('STORAGE_UNAVAILABLE',503);if(env.COMMERCIAL_CONTEXT&&!tenantDatabaseHasContext(db,env.COMMERCIAL_CONTEXT))fail('UNSCOPED_COMMERCIAL_DATABASE',503);return db;}
export async function assertFinancialAccess(env,scope,options,action='read'){
 const selected=normalizeFinancialScope(scope),context=env?.COMMERCIAL_CONTEXT;
 if(context){if(!isCommercialContext(context)||context.organizationId!==selected.organization_id||context.storeId!==selected.store_id)fail('SCOPE_MISMATCH',403);assertCommercialCapability(context,action==='read'?'finance.read':'finance.write');}
 if(typeof options?.assertAuthorized!=='function')fail('AUTHORIZATION_REQUIRED',403);
 if(await options.assertAuthorized({scope:selected,action})===false)fail('AUTHORIZATION_REVOKED',403);return selected;
}
export function financialClock(options={}){const millis=(options.now??Date.now)();if(!Number.isSafeInteger(millis)||millis<1)fail('CLOCK_INVALID',503);return normalizeFinancialTimestamp(new Date(millis).toISOString());}
export async function financialScopeKey(scope){return financialDigest(['financial-book-v1',normalizeFinancialScope(scope)]);}
export async function ensureFinancialEventSchema(env,scope,options){await assertFinancialAccess(env,scope,options,'write');const db=financialDatabase(env);if(!initialized.has(db)){if(options?.schemaReady!==true)await db.batch(FINANCIAL_EVENT_SCHEMA.map(sql=>db.prepare(sql)));initialized.add(db);}return db;}
async function present(db){const r=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='financial_ledger_state'").first();return r?.name==='financial_ledger_state';}
function resultRows(results,length){if(!Array.isArray(results)||results.length!==length||results.some(x=>x?.success===false||!Array.isArray(x?.results)))fail('STORAGE_INVALID',503);return results.map(x=>x.results);}
async function savedEvent(row,scope){
 if(!row||typeof row.payload!=='string'||new TextEncoder().encode(row.payload).byteLength>32768||!hash(row.payload_hash)||!hash(row.content_hash)||!int(row.version)||row.version<1||!int(row.ledger_revision)||row.ledger_revision<1)fail('STORAGE_INVALID',503);
 let parsed;try{parsed=JSON.parse(row.payload);}catch{fail('STORAGE_INVALID',503);}const value=validateFinancialEvent(parsed,{scope});
 if(value.version!==row.version||await financialDigest(value)!==row.payload_hash||await financialEventContentHash(value)!==row.content_hash||value.event_id!==await financialEventIdentity(value.scope,value.source))fail('STORAGE_INVALID',503);return value;
}
async function point(db,key,scope,eventId,requestId){
 const rows=resultRows(await db.batch([
  db.prepare('SELECT scope_payload,revision,mutation_id,updated_at FROM financial_ledger_state WHERE scope_key=?').bind(key),
  db.prepare('SELECT r.payload,r.payload_hash,r.content_hash,r.version,r.ledger_revision FROM financial_event_revisions r JOIN financial_event_heads h ON h.scope_key=r.scope_key AND h.event_id=r.event_id AND h.version=r.version WHERE r.scope_key=? AND r.event_id=?').bind(key,eventId),
  db.prepare('SELECT request_hash,event_id,version,ledger_revision FROM financial_event_requests WHERE scope_key=? AND request_id=?').bind(key,requestId),
 ]),3);
 const state=rows[0][0]??null;if(rows.some(r=>r.length>1)||state&&(!int(state.revision)||state.scope_payload!==financialCanonicalJSON(scope)||!uuid(state.mutation_id)))fail('STORAGE_INVALID',503);
 const event=rows[1][0]?await savedEvent(rows[1][0],scope):null,request=rows[2][0]??null;
 if(request&&(!hash(request.request_hash)||!hash(request.event_id)||!int(request.version)||request.version<1||!int(request.ledger_revision)))fail('STORAGE_INVALID',503);
 return {revision:state?.revision??0,event,row:rows[1][0]??null,request};
}
async function exactRevision(db,key,scope,eventId,version){const row=await db.prepare('SELECT payload,payload_hash,content_hash,version,ledger_revision FROM financial_event_revisions WHERE scope_key=? AND event_id=? AND version=?').bind(key,eventId,version).first();return savedEvent(row,scope);}
const atomicGuard=(db,condition,bindings=[])=>db.prepare('INSERT INTO financial_event_guard(id,ok) SELECT 1,0 WHERE NOT ('+condition+')').bind(...bindings);
function response(event,revision,replayed,changed){return {schema:'financial_event_ingestion_v1',ledger_revision:revision,event,replayed,changed};}
async function replay(db,key,scope,request,requestHash,options,env){if(request.request_hash!==requestHash)fail('REQUEST_CONFLICT',409);const event=await exactRevision(db,key,scope,request.event_id,request.version);await assertFinancialAccess(env,scope,options,'write');return response(event,request.ledger_revision,true,false);}

// Native event identity, rather than the transport/import ID, controls the
// financial fact. Revisions retain previous/delta payloads; readers project only
// the latest fact, never add a whole replacement to the previous amount.
export async function appendFinancialEvent(env,input,options={}){
 financialCanonicalJSON(input);if(!input||Reflect.ownKeys(input).length!==4||!['scope','event','expected_revision','request_id'].every(k=>Object.hasOwn(input,k))||!int(input.expected_revision)||!uuid(input.request_id))fail('REQUEST_INVALID');
 const scope=await assertFinancialAccess(env,input.scope,options,'write'),stamp=financialClock(options),event=validateFinancialEvent(input.event,{scope});
 if(event.observed_at>stamp||event.event_id!==await financialEventIdentity(scope,event.source))fail('EVENT_IDENTITY_INVALID');
 const actor=options.actor;if(typeof actor!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(actor))fail('ACTOR_INVALID');
 const db=await ensureFinancialEventSchema(env,scope,options),key=await financialScopeKey(scope),scopeText=financialCanonicalJSON(scope),contentHash=await financialEventContentHash(event),requestHash=await financialDigest({event_id:event.event_id,content_hash:contentHash,expected_revision:input.expected_revision});
 const observed=await point(db,key,scope,event.event_id,input.request_id);
 if(observed.request)return replay(db,key,scope,observed.request,requestHash,options,env);
 if(observed.event&&observed.row.content_hash===contentHash){
  const rows=[db.prepare('INSERT INTO financial_event_requests(scope_key,request_id,request_hash,event_id,version,ledger_revision,actor,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM financial_event_heads WHERE scope_key=? AND event_id=? AND version=? AND content_hash=?)').bind(key,input.request_id,requestHash,event.event_id,observed.event.version,observed.revision,actor,stamp,key,event.event_id,observed.event.version,contentHash),atomicGuard(db,'EXISTS(SELECT 1 FROM financial_event_requests WHERE scope_key=? AND request_id=? AND request_hash=?)',[key,input.request_id,requestHash])];
  try{await assertFinancialAccess(env,scope,options,'write');await db.batch(rows);}catch(error){if(error?.status===403)throw error;const after=await point(db,key,scope,event.event_id,input.request_id);if(after.request)return replay(db,key,scope,after.request,requestHash,options,env);fail('SOURCE_CHANGED',409);}
  await assertFinancialAccess(env,scope,options,'write');return response(observed.event,observed.revision,true,false);
 }
 if(observed.revision!==input.expected_revision)fail('REVISION_CONFLICT',409);
 if(observed.event&&(event.observed_at<observed.event.observed_at||event.source_updated_at!==null&&observed.event.source_updated_at!==null&&event.source_updated_at<observed.event.source_updated_at))fail('STALE_SOURCE_REVISION',409);
 const version=(observed.event?.version??0)+1,revision=observed.revision+1;if(!int(revision)||!int(version))fail('REVISION_LIMIT',409);
 const next={...event,version},payload=financialCanonicalJSON(next),payloadHash=await financialDigest(next),delta=financialCanonicalJSON(financialPostingDelta(observed.event,next)),mutation=crypto.randomUUID();if(new TextEncoder().encode(payload).byteLength>32768)fail('PAYLOAD_LIMIT');
 const statements=[
  db.prepare('INSERT OR IGNORE INTO financial_ledger_state(scope_key,scope_payload,revision,mutation_id,updated_at) VALUES(?,?,0,?,?)').bind(key,scopeText,crypto.randomUUID(),stamp),
  db.prepare('UPDATE financial_ledger_state SET revision=?,mutation_id=?,updated_at=? WHERE scope_key=? AND revision=? AND scope_payload=?').bind(revision,mutation,stamp,key,observed.revision,scopeText),
  atomicGuard(db,'EXISTS(SELECT 1 FROM financial_ledger_state WHERE scope_key=? AND revision=? AND mutation_id=?)',[key,revision,mutation]),
  db.prepare('INSERT INTO financial_event_revisions(scope_key,event_id,version,ledger_revision,payload,payload_hash,content_hash,previous_hash,delta_payload,actor,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(key,event.event_id,version,revision,payload,payloadHash,contentHash,observed.row?.payload_hash??null,delta,actor,stamp),
  db.prepare('INSERT INTO financial_event_heads(scope_key,event_id,version,content_hash) VALUES(?,?,?,?) ON CONFLICT(scope_key,event_id) DO UPDATE SET version=excluded.version,content_hash=excluded.content_hash').bind(key,event.event_id,version,contentHash),
  db.prepare('INSERT INTO financial_event_requests(scope_key,request_id,request_hash,event_id,version,ledger_revision,actor,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(key,input.request_id,requestHash,event.event_id,version,revision,actor,stamp),
  atomicGuard(db,'EXISTS(SELECT 1 FROM financial_event_revisions WHERE scope_key=? AND event_id=? AND version=? AND payload_hash=?) AND EXISTS(SELECT 1 FROM financial_event_heads WHERE scope_key=? AND event_id=? AND version=? AND content_hash=?) AND EXISTS(SELECT 1 FROM financial_event_requests WHERE scope_key=? AND request_id=? AND request_hash=?)',[key,event.event_id,version,payloadHash,key,event.event_id,version,contentHash,key,input.request_id,requestHash]),
 ];
 try{await assertFinancialAccess(env,scope,options,'write');await db.batch(statements);}catch(error){if(error instanceof FinancialLedgerError||error?.status===403)throw error;const after=await point(db,key,scope,event.event_id,input.request_id);if(after.request)return replay(db,key,scope,after.request,requestHash,options,env);if(after.revision!==observed.revision)fail('REVISION_CONFLICT',409);throw new FinancialLedgerError('FINANCIAL_STORAGE_WRITE_FAILED',503,{cause:error});}
 await assertFinancialAccess(env,scope,options,'write');return response(next,revision,false,true);
}

async function replayBatch(row,requestHash,env,scope,options){
 if(row.request_hash!==requestHash)fail('REQUEST_CONFLICT',409);let value;
 try{value=JSON.parse(row.response_payload);}catch{fail('STORAGE_INVALID',503);}
 if(!hash(row.response_hash)||await financialDigest(value)!==row.response_hash||value.schema!=='financial_event_batch_v1'||!sameFinancialScope(value.scope,scope)||!int(value.ledger_revision)||!int(value.changed_count)||!int(value.unchanged_count)||!Array.isArray(value.event_refs)||value.event_refs.length!==value.changed_count+value.unchanged_count||value.event_refs.some(r=>!hash(r.event_id)||!int(r.version)||r.version<1)||new Set(value.event_refs.map(r=>r.event_id)).size!==value.event_refs.length)fail('STORAGE_INVALID',503);
 await assertFinancialAccess(env,scope,options,'write');return {...value,replayed:true};
}

// A bounded batch reads existing heads once and writes one guarded transaction.
// Stable request semantics omit the observation clock and caller CAS revision;
// a lost acknowledgement can therefore be replayed after a later successful read.
export async function appendFinancialEvents(env,input,options={}){
 if(!input||Reflect.ownKeys(input).length!==4||!['scope','events','expected_revision','request_id'].every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(input,k)||{},'value'))||!Array.isArray(input.events)||input.events.length<1||input.events.length>100||Reflect.ownKeys(input.events).length!==input.events.length+1||!int(input.expected_revision)||!uuid(input.request_id))fail('REQUEST_INVALID');
 const scope=await assertFinancialAccess(env,input.scope,options,'write'),stamp=financialClock(options),actor=options.actor;
 if(typeof actor!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(actor))fail('ACTOR_INVALID');
 const prepared=[],seen=new Set();let bytes=0;
 for(let index=0;index<input.events.length;index++){
  const descriptor=Object.getOwnPropertyDescriptor(input.events,String(index));if(!descriptor||!Object.hasOwn(descriptor,'value'))fail('REQUEST_INVALID');
  const event=validateFinancialEvent(descriptor.value,{scope});if(event.observed_at>stamp||event.event_id!==await financialEventIdentity(scope,event.source)||seen.has(event.event_id))fail('EVENT_IDENTITY_INVALID');seen.add(event.event_id);
  bytes+=new TextEncoder().encode(financialCanonicalJSON(event)).byteLength;if(bytes>1048576)fail('PAYLOAD_LIMIT');prepared.push({event,content_hash:await financialEventContentHash(event)});
 }
 prepared.sort((a,b)=>a.event.event_id.localeCompare(b.event.event_id));
 const requestHash=await financialDigest({events:prepared.map(row=>({event_id:row.event.event_id,content_hash:row.content_hash}))}),db=await ensureFinancialEventSchema(env,scope,options),key=await financialScopeKey(scope),scopeText=financialCanonicalJSON(scope),ids=JSON.stringify(prepared.map(row=>row.event.event_id));
 const [states,heads,requests]=resultRows(await db.batch([
  db.prepare('SELECT revision,scope_payload FROM financial_ledger_state WHERE scope_key=?').bind(key),
  db.prepare('SELECT r.event_id,r.payload,r.payload_hash,r.content_hash,r.version,r.ledger_revision FROM financial_event_heads h JOIN financial_event_revisions r ON r.scope_key=h.scope_key AND r.event_id=h.event_id AND r.version=h.version WHERE h.scope_key=? AND h.event_id IN(SELECT value FROM json_each(?))').bind(key,ids),
  db.prepare('SELECT request_hash,response_payload,response_hash FROM financial_event_batches WHERE scope_key=? AND request_id=?').bind(key,input.request_id),
 ]),3);
 if(states.length>1||requests.length>1||states[0]&&(!int(states[0].revision)||states[0].scope_payload!==scopeText))fail('STORAGE_INVALID',503);
 if(requests[0])return replayBatch(requests[0],requestHash,env,scope,options);
 const revision=states[0]?.revision??0,current=new Map();for(const row of heads){if(current.has(row.event_id)||row.ledger_revision>revision)fail('STORAGE_INVALID',503);current.set(row.event_id,{event:await savedEvent(row,scope),row});}
 let nextRevision=revision;const changes=[],refs=[];
 for(const row of prepared){
  const old=current.get(row.event.event_id),event=row.event;
  if(old?.row.content_hash===row.content_hash){refs.push({event_id:event.event_id,version:old.event.version});continue;}
  if(old&&(event.observed_at<old.event.observed_at||event.source_updated_at!==null&&old.event.source_updated_at!==null&&event.source_updated_at<old.event.source_updated_at))fail('STALE_SOURCE_REVISION',409);
  const version=(old?.event.version??0)+1;nextRevision++;if(!int(nextRevision)||!int(version))fail('REVISION_LIMIT',409);
  const next={...event,version},payload=financialCanonicalJSON(next);if(new TextEncoder().encode(payload).byteLength>32768)fail('PAYLOAD_LIMIT');
  changes.push({event_id:event.event_id,version,ledger_revision:nextRevision,payload,payload_hash:await financialDigest(next),content_hash:row.content_hash,previous_hash:old?.row.payload_hash??null,delta_payload:financialCanonicalJSON(financialPostingDelta(old?.event??null,next))});refs.push({event_id:event.event_id,version});
 }
 if(changes.length&&revision!==input.expected_revision)fail('REVISION_CONFLICT',409);
 const response={schema:'financial_event_batch_v1',scope,ledger_revision:nextRevision,event_refs:refs,changed_count:changes.length,unchanged_count:prepared.length-changes.length,replayed:false},responseText=financialCanonicalJSON(response),responseHash=await financialDigest(response),mutation=crypto.randomUUID(),rows=JSON.stringify(changes);
 if(new TextEncoder().encode(rows).byteLength>1048576)fail('PAYLOAD_LIMIT');
 const statements=[];
 if(changes.length)statements.push(
  db.prepare('INSERT OR IGNORE INTO financial_ledger_state(scope_key,scope_payload,revision,mutation_id,updated_at) VALUES(?,?,0,?,?)').bind(key,scopeText,crypto.randomUUID(),stamp),
  db.prepare('UPDATE financial_ledger_state SET revision=?,mutation_id=?,updated_at=? WHERE scope_key=? AND revision=? AND scope_payload=?').bind(nextRevision,mutation,stamp,key,revision,scopeText),
  atomicGuard(db,'EXISTS(SELECT 1 FROM financial_ledger_state WHERE scope_key=? AND revision=? AND mutation_id=?)',[key,nextRevision,mutation]),
  db.prepare("INSERT INTO financial_event_revisions(scope_key,event_id,version,ledger_revision,payload,payload_hash,content_hash,previous_hash,delta_payload,actor,recorded_at) SELECT ?,json_extract(value,'$.event_id'),json_extract(value,'$.version'),json_extract(value,'$.ledger_revision'),json_extract(value,'$.payload'),json_extract(value,'$.payload_hash'),json_extract(value,'$.content_hash'),json_extract(value,'$.previous_hash'),json_extract(value,'$.delta_payload'),?,? FROM json_each(?)").bind(key,actor,stamp,rows),
  db.prepare("INSERT INTO financial_event_heads(scope_key,event_id,version,content_hash) SELECT ?,json_extract(value,'$.event_id'),json_extract(value,'$.version'),json_extract(value,'$.content_hash') FROM json_each(?) WHERE 1 ON CONFLICT(scope_key,event_id) DO UPDATE SET version=excluded.version,content_hash=excluded.content_hash").bind(key,rows),
  atomicGuard(db,"(SELECT COUNT(*) FROM financial_event_revisions r JOIN json_each(?) j ON r.event_id=json_extract(j.value,'$.event_id') AND r.version=json_extract(j.value,'$.version') AND r.payload_hash=json_extract(j.value,'$.payload_hash') WHERE r.scope_key=?)=? AND (SELECT COUNT(*) FROM financial_event_heads h JOIN json_each(?) j ON h.event_id=json_extract(j.value,'$.event_id') AND h.version=json_extract(j.value,'$.version') AND h.content_hash=json_extract(j.value,'$.content_hash') WHERE h.scope_key=?)=?",[rows,key,changes.length,rows,key,changes.length]),
 );
 else statements.push(atomicGuard(db,'COALESCE((SELECT revision FROM financial_ledger_state WHERE scope_key=?),0)=?',[key,revision]));
 statements.push(db.prepare('INSERT INTO financial_event_batches(scope_key,request_id,request_hash,response_payload,response_hash,actor,created_at) VALUES(?,?,?,?,?,?,?)').bind(key,input.request_id,requestHash,responseText,responseHash,actor,stamp),atomicGuard(db,'EXISTS(SELECT 1 FROM financial_event_batches WHERE scope_key=? AND request_id=? AND request_hash=? AND response_hash=?)',[key,input.request_id,requestHash,responseHash]));
 try{await assertFinancialAccess(env,scope,options,'write');await db.batch(statements);}catch(error){if(error instanceof FinancialLedgerError||error?.status===403)throw error;const request=await db.prepare('SELECT request_hash,response_payload,response_hash FROM financial_event_batches WHERE scope_key=? AND request_id=?').bind(key,input.request_id).first();if(request)return replayBatch(request,requestHash,env,scope,options);const after=await db.prepare('SELECT revision FROM financial_ledger_state WHERE scope_key=?').bind(key).first();if((after?.revision??0)!==revision)fail('REVISION_CONFLICT',409);throw new FinancialLedgerError('FINANCIAL_STORAGE_WRITE_FAILED',503,{cause:error});}
 await assertFinancialAccess(env,scope,options,'write');return response;
}

export async function readFinancialEvents(env,input,options={}){
 financialCanonicalJSON(input);const scope=await assertFinancialAccess(env,input?.scope,options),db=financialDatabase(env),key=await financialScopeKey(scope),limit=input.limit??250,cursor=input.after_event_id??null;
 if(!Number.isSafeInteger(limit)||limit<1||limit>500||cursor!==null&&!hash(cursor)||input.expected_revision!==undefined&&!int(input.expected_revision))fail('REQUEST_INVALID');
 if(!await present(db)){await assertFinancialAccess(env,scope,options);return {schema:'financial_event_page_v1',scope,initialized:false,ledger_revision:0,events:[],next_cursor:null,complete:true};}
 const [before,rows,after]=resultRows(await db.batch([
  db.prepare('SELECT revision,scope_payload FROM financial_ledger_state WHERE scope_key=?').bind(key),
  db.prepare('SELECT r.payload,r.payload_hash,r.content_hash,r.version,r.ledger_revision FROM financial_event_revisions r JOIN financial_event_heads h ON h.scope_key=r.scope_key AND h.event_id=r.event_id AND h.version=r.version WHERE r.scope_key=? AND r.event_id>? ORDER BY r.event_id LIMIT ?').bind(key,cursor??'',limit+1),
  db.prepare('SELECT revision,scope_payload FROM financial_ledger_state WHERE scope_key=?').bind(key),
 ]),3);
 const revision=before[0]?.revision??0;if(before.length>1||after.length>1||!int(revision)||revision!==(after[0]?.revision??0)||before[0]&&before[0].scope_payload!==financialCanonicalJSON(scope)||input.expected_revision!==undefined&&input.expected_revision!==revision)fail('SOURCE_CHANGED',409);
 const events=[];for(const row of rows.slice(0,limit)){if(row.ledger_revision>revision)fail('STORAGE_INVALID',503);events.push(await savedEvent(row,scope));}
 await assertFinancialAccess(env,scope,options);return {schema:'financial_event_page_v1',scope,initialized:before.length===1,ledger_revision:revision,events,next_cursor:rows.length>limit?events.at(-1).event_id:null,complete:rows.length<=limit};
}
export async function readFinancialEventHistory(env,input,options={}){
 financialCanonicalJSON(input);const scope=await assertFinancialAccess(env,input?.scope,options),db=financialDatabase(env),key=await financialScopeKey(scope),limit=input.limit??100,after=input.after_version??0;
 if(!hash(input.event_id)||!int(after)||!Number.isSafeInteger(limit)||limit<1||limit>500)fail('REQUEST_INVALID');
 if(!await present(db)){await assertFinancialAccess(env,scope,options);return {schema:'financial_event_history_v1',scope,event_id:input.event_id,versions:[],next_version:null};}
 const rows=(await db.prepare('SELECT payload,payload_hash,content_hash,version,ledger_revision,previous_hash,delta_payload,actor,recorded_at FROM financial_event_revisions WHERE scope_key=? AND event_id=? AND version>? ORDER BY version LIMIT ?').bind(key,input.event_id,after,limit+1).all()).results;
 if(!Array.isArray(rows))fail('STORAGE_INVALID',503);const versions=[];
 for(const row of rows.slice(0,limit)){const event=await savedEvent(row,scope);let delta;try{delta=JSON.parse(row.delta_payload);}catch{fail('STORAGE_INVALID',503);}if(!Array.isArray(delta)||row.previous_hash!==null&&!hash(row.previous_hash))fail('STORAGE_INVALID',503);versions.push({event,ledger_revision:row.ledger_revision,payload_hash:row.payload_hash,previous_hash:row.previous_hash,delta,actor:row.actor,recorded_at:row.recorded_at});}
 await assertFinancialAccess(env,scope,options);return {schema:'financial_event_history_v1',scope,event_id:input.event_id,versions,next_version:rows.length>limit?versions.at(-1).event.version:null};
}
