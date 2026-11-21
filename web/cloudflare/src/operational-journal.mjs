import {financialCanonicalJSON,financialDigest} from './financial-event-ledger.mjs';
import {isCommercialContext,assertCommercialCapability} from './commercial-context.mjs';
import {TenantInitializationMap,isTenantDatabase,tenantDatabaseHasContext} from './tenant-storage.mjs';

// An operational declaration is not a bank instruction or an accounting entry.
// Each entity has one CAS head and an append-only history; reads never create it.
export class OperationalJournalError extends Error {
 constructor(code,status=400,options){super(code,options);this.name='OperationalJournalError';this.code=code;this.status=status;}
}
export const OPERATIONAL_JOURNAL_SCHEMA=Object.freeze([
 `CREATE TABLE IF NOT EXISTS operational_entity_heads(scope_key TEXT NOT NULL,kind TEXT NOT NULL,entity_id TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(scope_key,kind,entity_id))`,
 `CREATE TABLE IF NOT EXISTS operational_entity_revisions(scope_key TEXT NOT NULL,kind TEXT NOT NULL,entity_id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=196608),payload_hash TEXT NOT NULL,previous_hash TEXT,command TEXT NOT NULL CHECK(length(CAST(command AS BLOB))<=16384),actor TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(scope_key,kind,entity_id,revision))`,
 `CREATE TABLE IF NOT EXISTS operational_entity_requests(scope_key TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,kind TEXT NOT NULL,entity_id TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(scope_key,request_id))`,
 `CREATE TABLE IF NOT EXISTS operational_entity_guard(id INTEGER PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))`,
 ...['operational_entity_revisions','operational_entity_requests'].flatMap(table=>['UPDATE','DELETE'].map(verb=>`CREATE TRIGGER IF NOT EXISTS ${table}_no_${verb.toLowerCase()} BEFORE ${verb} ON ${table} BEGIN SELECT RAISE(ABORT,'operational_history_immutable'); END`)),
]);
const initialized=new TenantInitializationMap(),encoder=new TextEncoder();
const fail=(code,status=400,options)=>{throw new OperationalJournalError('OPERATIONAL_JOURNAL_'+code,status,options);};
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const token=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
const kind=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(value);
const integer=(value,min=0,max=2147483645)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const actor=value=>typeof value==='string'&&value.length>0&&value.length<=256&&value.trim()===value&&value.normalize('NFC')===value&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);
const capability=value=>typeof value==='string'&&/^[a-z][a-z0-9_.:-]{1,79}$/.test(value);
const iso=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(Date.parse(value)).toISOString()===value;
function canonical(value,max=196608){let text;try{text=financialCanonicalJSON(value);}catch{fail('PAYLOAD_INVALID');}if(encoder.encode(text).byteLength>max)fail('PAYLOAD_LIMIT');return text;}
function configuration(options,write=false){
 if(!plain(options)||Reflect.ownKeys(options).some(key=>typeof key!=='string'||!['readCapability','writeCapability','actor','transition','now','assertAuthorized'].includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(options,key)||{},'value'))||!capability(options.readCapability)||options.now!==undefined&&typeof options.now!=='function'||options.assertAuthorized!==undefined&&typeof options.assertAuthorized!=='function'||write&&(!capability(options.writeCapability)||typeof options.transition!=='function'||!actor(options.actor)))fail('CONFIGURATION_INVALID',503);
 return {...options};
}
function clock(options){let millis;try{millis=(options.now??Date.now)();}catch{fail('CLOCK_INVALID',503);}if(!Number.isSafeInteger(millis)||millis<1)fail('CLOCK_INVALID',503);let value;try{value=new Date(millis).toISOString();}catch{fail('CLOCK_INVALID',503);}if(!iso(value))fail('CLOCK_INVALID',503);return value;}
async function access(env,options,write=false,expected=null){
 const context=env?.COMMERCIAL_CONTEXT,db=env?.ADMIN_DB;
 if(!db?.prepare||!db?.batch)fail('STORAGE_UNAVAILABLE',503);
 if(context!==undefined&&context!==null){
  if(!isCommercialContext(context)||!tenantDatabaseHasContext(db,context))fail('SCOPE_MISMATCH',403);
  assertCommercialCapability(context,options.readCapability);
  if(write){assertCommercialCapability(context,options.writeCapability);if(options.actor!==context.userId)fail('ACTOR_MISMATCH',403);}
 }else if(isTenantDatabase(db))fail('SCOPE_MISMATCH',403);
 const scope={organization_id:context?.organizationId??'legacy-brazacommerce',store_id:context?.storeId??'legacy-shopee'};
 if(options.assertAuthorized&&await options.assertAuthorized({scope,action:write?'write':'read',capability:write?options.writeCapability:options.readCapability})===false)fail('AUTHORIZATION_REVOKED',403);
 const key=await financialDigest(['operational-journal-v1',scope]);
 if(env.ADMIN_DB!==db||env.COMMERCIAL_CONTEXT!==context||expected&&(expected.db!==db||expected.key!==key||expected.context!==context))fail('SCOPE_CHANGED',403);
 return {db,scope,key,context};
}
async function present(db){return !!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='operational_entity_heads'").first();}
async function ensure(db){
 if(!initialized.has(db)){
  const pending=db.batch(OPERATIONAL_JOURNAL_SCHEMA.map(sql=>db.prepare(sql)));initialized.set(db,pending);
  try{await pending;}catch(error){initialized.delete(db);throw error;}
 }else await initialized.get(db);
}
function selection(input,history=false){
 if(!exact(input,history?['kind','entity_id','cursor','limit']:['kind','entity_id'])||!kind(input.kind)||!token(input.entity_id)||history&&(!integer(input.limit,1,50)||input.cursor!==null&&typeof input.cursor!=='string'))fail('REQUEST_INVALID');
 return input;
}
function empty(scope,input){return {schema:'operational_entity_v1',scope,kind:input.kind,entity_id:input.entity_id,revision:0,payload:null,hash:null,previous_hash:null,actor:null,created_at:null,replayed:false};}
async function saved(row,scope,{includeCommand=false}={}){
 if(!row||!kind(row.kind)||!token(row.entity_id)||!integer(row.revision,1)||!hash(row.payload_hash)||(row.revision===1)!==(row.previous_hash===null)||row.previous_hash!==null&&!hash(row.previous_hash)||!actor(row.actor)||!iso(row.created_at)||typeof row.payload!=='string'||typeof row.command!=='string')fail('STORAGE_INVALID',503);
 let payload,command;try{payload=JSON.parse(row.payload);command=JSON.parse(row.command);}catch{fail('STORAGE_INVALID',503);}
 try{if(!plain(payload)||!plain(command)||canonical(payload)!==row.payload||canonical(command,16384)!==row.command||await financialDigest(payload)!==row.payload_hash)throw Error();}catch{fail('STORAGE_INVALID',503);}
 return {schema:'operational_entity_v1',scope,kind:row.kind,entity_id:row.entity_id,revision:row.revision,payload,hash:row.payload_hash,previous_hash:row.previous_hash,actor:row.actor,created_at:row.created_at,replayed:false,...(includeCommand?{command}:{})};
}
async function current(db,key,scope,input){
 const results=await db.batch([
  db.prepare('SELECT revision FROM operational_entity_heads WHERE scope_key=? AND kind=? AND entity_id=?').bind(key,input.kind,input.entity_id),
  db.prepare('SELECT r.* FROM operational_entity_revisions r JOIN operational_entity_heads h ON h.scope_key=r.scope_key AND h.kind=r.kind AND h.entity_id=r.entity_id AND h.revision=r.revision WHERE r.scope_key=? AND r.kind=? AND r.entity_id=?').bind(key,input.kind,input.entity_id),
  db.prepare('SELECT MAX(revision) AS latest_revision FROM operational_entity_revisions WHERE scope_key=? AND kind=? AND entity_id=?').bind(key,input.kind,input.entity_id),
 ]);
 if(!Array.isArray(results)||results.length!==3||results.some(r=>r?.success===false||!Array.isArray(r.results)||r.results.length>1)||!!results[0].results.length!==!!results[1].results.length)fail('STORAGE_INVALID',503);
 const value=results[1].results[0]?await saved(results[1].results[0],scope):empty(scope,input);
 if(value.revision!==(results[0].results[0]?.revision??0)||value.revision!==(results[2].results[0]?.latest_revision??0))fail('STORAGE_INVALID',503);return value;
}
function encodeCursor(frame){return btoa(JSON.stringify(frame)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function decodeCursor(value,base,field){
 if(value===null)return null;
 if(typeof value!=='string'||value.length>1024||!/^[A-Za-z0-9_-]+$/.test(value))fail('CURSOR_INVALID');
 let frame;try{frame=JSON.parse(atob(value.replaceAll('-','+').replaceAll('_','/')));}catch{fail('CURSOR_INVALID');}
 if(!exact(frame,[...Object.keys(base),field])||canonical(Object.fromEntries(Object.keys(base).map(k=>[k,frame[k]])))!==canonical(base)||encodeCursor({...base,[field]:frame[field]})!==value)fail('CURSOR_INVALID');
 if(field==='last_revision'?!integer(frame[field],1):!token(frame[field]))fail('CURSOR_INVALID');return frame[field];
}
export async function readOperationalEntity(env,input,options={}){
 selection(input);input={...input};options=configuration(options);const {db,scope,key,context}=await access(env,options);
 const result=await present(db)?await current(db,key,scope,input):empty(scope,input);
 await access(env,options,false,{db,key,context});return result;
}
export async function listOperationalEntities(env,input,options={}){
 if(!exact(input,['kind','cursor','limit'])||!kind(input.kind)||!integer(input.limit,1,50))fail('REQUEST_INVALID');input={...input};options=configuration(options);
 const {db,scope,key,context}=await access(env,options),base={v:1,scope_key:key,kind:input.kind},last=decodeCursor(input.cursor,base,'last_entity_id');
 const rows=[];let more=false;
 if(await present(db)){
  const found=(await db.prepare('SELECT r.* FROM operational_entity_heads h LEFT JOIN operational_entity_revisions r ON r.scope_key=h.scope_key AND r.kind=h.kind AND r.entity_id=h.entity_id AND r.revision=h.revision AND r.revision=(SELECT MAX(v.revision) FROM operational_entity_revisions v WHERE v.scope_key=h.scope_key AND v.kind=h.kind AND v.entity_id=h.entity_id) WHERE h.scope_key=? AND h.kind=? AND h.entity_id>? ORDER BY h.entity_id LIMIT ?').bind(key,input.kind,last??'',input.limit+1).all()).results;
  if(!Array.isArray(found)||found.length>input.limit+1)fail('STORAGE_INVALID',503);more=found.length>input.limit;
  for(const row of found.slice(0,input.limit))rows.push(await saved(row,scope));
 }
 await access(env,options,false,{db,key,context});return {schema:'operational_entity_list_v1',scope,kind:input.kind,rows,next_cursor:more?encodeCursor({...base,last_entity_id:rows.at(-1).entity_id}):null};
}
export async function readOperationalHistory(env,input,options={}){
 selection(input,true);input={...input};options=configuration(options);const {db,scope,key,context}=await access(env,options),base={v:1,scope_key:key,kind:input.kind,entity_id:input.entity_id},before=decodeCursor(input.cursor,base,'last_revision');
 const rows=[];let more=false;
 if(await present(db)){
  const found=(await db.prepare('SELECT * FROM operational_entity_revisions WHERE scope_key=? AND kind=? AND entity_id=? AND revision<? ORDER BY revision DESC LIMIT ?').bind(key,input.kind,input.entity_id,before??2147483646,input.limit+1).all()).results;
  if(!Array.isArray(found)||found.length>input.limit+1)fail('STORAGE_INVALID',503);more=found.length>input.limit;
  for(const row of found.slice(0,input.limit))rows.push(await saved(row,scope,{includeCommand:true}));
 }
 await access(env,options,false,{db,key,context});return {schema:'operational_entity_history_v1',scope,kind:input.kind,entity_id:input.entity_id,rows,next_cursor:more?encodeCursor({...base,last_revision:rows.at(-1).revision}):null};
}
async function replay(db,key,scope,input,requestHash){
 const request=await db.prepare('SELECT request_hash,kind,entity_id,revision FROM operational_entity_requests WHERE scope_key=? AND request_id=?').bind(key,input.request_id).first();
 if(!request)return null;
 if(request.request_hash!==requestHash||request.kind!==input.kind||request.entity_id!==input.entity_id)fail('REQUEST_CONFLICT',409);
 const row=await db.prepare('SELECT * FROM operational_entity_revisions WHERE scope_key=? AND kind=? AND entity_id=? AND revision=?').bind(key,input.kind,input.entity_id,request.revision).first();
 return {...await saved(row,scope),replayed:true};
}
export async function mutateOperationalEntity(env,input,options={}){
 if(!exact(input,['kind','entity_id','expected_revision','request_id','command'])||!kind(input.kind)||!token(input.entity_id)||!integer(input.expected_revision)||!uuid(input.request_id)||!plain(input.command))fail('REQUEST_INVALID');
 options=configuration(options,true);input=JSON.parse(canonical(input));const commandText=canonical(input.command,16384),{db,scope,key,context}=await access(env,options,true),stamp=clock(options);
 const requestHash=await financialDigest(['operational-request-v1',scope,input.kind,input.entity_id,input.expected_revision,options.actor,input.command]);
 await access(env,options,true,{db,key,context});await ensure(db);
 const prior=await replay(db,key,scope,input,requestHash);if(prior){await access(env,options,true,{db,key,context});return prior;}
 const observed=await current(db,key,scope,input);if(observed.revision!==input.expected_revision)fail('REVISION_CONFLICT',409);
 // The transition receives copies, so it cannot alter the immutable observation
 // or a command used for request identity. Async pure calculations are allowed;
 // authorization and the transaction's revision fence still run afterwards.
 const payload=await options.transition(JSON.parse(JSON.stringify(observed.payload)),JSON.parse(commandText),{now:stamp,actor:options.actor,scope:Object.freeze({...scope})});
 if(!plain(payload))fail('TRANSITION_INVALID',503);
 const payloadText=canonical(payload),payloadHash=await financialDigest(payload),revision=input.expected_revision+1;if(!integer(revision,1))fail('REVISION_LIMIT',409);
 const guard=(condition,args)=>db.prepare('INSERT INTO operational_entity_guard(id,ok) SELECT 1,0 WHERE NOT ('+condition+')').bind(...args);
 const statements=[
  guard('COALESCE((SELECT revision FROM operational_entity_heads WHERE scope_key=? AND kind=? AND entity_id=?),0)=?',[key,input.kind,input.entity_id,input.expected_revision]),
  db.prepare('INSERT INTO operational_entity_revisions(scope_key,kind,entity_id,revision,payload,payload_hash,previous_hash,command,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(key,input.kind,input.entity_id,revision,payloadText,payloadHash,observed.hash,commandText,options.actor,stamp),
  db.prepare('INSERT INTO operational_entity_heads(scope_key,kind,entity_id,revision) VALUES(?,?,?,?) ON CONFLICT(scope_key,kind,entity_id) DO UPDATE SET revision=excluded.revision').bind(key,input.kind,input.entity_id,revision),
  db.prepare('INSERT INTO operational_entity_requests(scope_key,request_id,request_hash,kind,entity_id,revision) VALUES(?,?,?,?,?,?)').bind(key,input.request_id,requestHash,input.kind,input.entity_id,revision),
  guard('EXISTS(SELECT 1 FROM operational_entity_heads WHERE scope_key=? AND kind=? AND entity_id=? AND revision=?) AND EXISTS(SELECT 1 FROM operational_entity_revisions WHERE scope_key=? AND kind=? AND entity_id=? AND revision=? AND payload_hash=?) AND EXISTS(SELECT 1 FROM operational_entity_requests WHERE scope_key=? AND request_id=? AND request_hash=? AND kind=? AND entity_id=? AND revision=?)',[key,input.kind,input.entity_id,revision,key,input.kind,input.entity_id,revision,payloadHash,key,input.request_id,requestHash,input.kind,input.entity_id,revision]),
 ];
 try{await access(env,options,true,{db,key,context});await db.batch(statements);}catch(error){
  if(error?.status===403)throw error;
  const raced=await replay(db,key,scope,input,requestHash);if(raced){await access(env,options,true,{db,key,context});return raced;}
  if((await current(db,key,scope,input)).revision!==input.expected_revision)fail('REVISION_CONFLICT',409);
  fail('STORAGE_WRITE_FAILED',503,{cause:error});
 }
 await access(env,options,true,{db,key,context});
 return {schema:'operational_entity_v1',scope,kind:input.kind,entity_id:input.entity_id,revision,payload:JSON.parse(payloadText),hash:payloadHash,previous_hash:observed.hash,actor:options.actor,created_at:stamp,replayed:false};
}
