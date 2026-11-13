import {tenantPrepareTechnicalCreate,tenantDatabaseMatchesContext,TenantIsolationError} from './tenant-storage.mjs';
import {isCommercialContext} from './commercial-context.mjs';
import {tenantAuthorizationGuard} from './commercial-authorization.mjs';

export const COMMERCIAL_WORKSPACE_SETUP_VERSION=1;
export const COMMERCIAL_WORKSPACE_DDL_CHUNK=12;
const fail=(code,status=409)=>{throw new TenantIsolationError('COMMERCIAL_WORKSPACE_'+code,status);};
const encoder=new TextEncoder();
async function schemaPlan(schema){
 if(!Array.isArray(schema)||schema.length>1000)fail('SCHEMA_INVALID',503);const named=new Map();
 for(const sql of schema){
  if(typeof sql!=='string')fail('SCHEMA_INVALID',503);if(!/^\s*CREATE\b/i.test(sql))continue;
  const match=/^\s*CREATE\s+(TABLE|(?:UNIQUE\s+)?INDEX|TRIGGER)\s+IF\s+NOT\s+EXISTS\s+([a-z_]+)/i.exec(sql);if(!match)fail('SCHEMA_INVALID',503);
  const name=match[2],canonical=sql.replace(/\s+/g,' ').trim();if(named.has(name)&&named.get(name).canonical!==canonical)fail('SCHEMA_CONFLICT',503);named.set(name,{name,sql,canonical,order:match[1].toUpperCase()==='TABLE'?0:match[1].toUpperCase()==='TRIGGER'?2:1});
 }
 for(const name of ['variant_bindings_state','variant_bindings_audit','production_cost_rules_state','production_cost_rules_audit'])if(!named.has(name))fail('SCHEMA_REQUIRED_TABLE_MISSING',503);
 const statements=[...named.values()].sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name)),bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify([COMMERCIAL_WORKSPACE_SETUP_VERSION,statements.map(s=>s.canonical)])))),hash=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return {statements,hash};
}
function database(scopedEnv,rawEnv,principal){
 const context=scopedEnv?.COMMERCIAL_CONTEXT,db=rawEnv?.ACCOUNT_DB;
 if(!isCommercialContext(context)||!db?.prepare||!db?.batch||!tenantDatabaseMatchesContext(scopedEnv?.ADMIN_DB,context,db)||principal?.kind!=='account'||principal.userId!==context.userId||principal.organizationId!==context.organizationId||principal.storeId!==context.storeId||principal.sessionId!==context.sessionId||principal.authorizationRevision!==context.authorizationRevision||!principal.capabilities?.includes('store.read'))fail('FORBIDDEN',403);
 return db;
}
async function record(db,principal){
 const row=await db.prepare("SELECT revision,payload FROM mls_account_records WHERE kind='workspace_setup' AND scope=? AND id=?").bind(principal.organizationId,principal.storeId).first();if(!row)return null;
 try{const value=JSON.parse(row.payload);if(!Number.isSafeInteger(row.revision)||row.revision<1||value.organization_id!==principal.organizationId||value.store_id!==principal.storeId||!Number.isSafeInteger(value.cursor)||value.cursor<0||!Number.isSafeInteger(value.total)||value.cursor>value.total||!['PREPARING','READY'].includes(value.state)||value.state==='READY'&&value.cursor!==value.total||typeof value.schema_hash!=='string'||! /^[a-f0-9]{64}$/.test(value.schema_hash))throw Error();return {...value,revision:row.revision};}catch{fail('STATE_INVALID',503);}
}
function dto(value,replayed=false){return {schema:'commercial_workspace_setup_v1',version:COMMERCIAL_WORKSPACE_SETUP_VERSION,state:value.state,completed:value.cursor,total:value.total,remaining:value.total-value.cursor,revision:value.revision,replayed};}
function seedStatements(scopedEnv,db,principal,stamp){
 const prefix=scopedEnv.COMMERCIAL_CONTEXT.namespace,table=name=>prefix+name;
 // Empty collections are technical configuration, never financial zero or a
 // historical operator confirmation. Prices, settings, DAS and facts stay absent.
 return [
  db.prepare('INSERT OR IGNORE INTO '+table('variant_bindings_state')+'(id,revision,payload,updated_at) SELECT 1,1,?,? WHERE NOT EXISTS(SELECT 1 FROM '+table('variant_bindings_audit')+')').bind('[]',stamp),
  db.prepare('INSERT INTO '+table('variant_bindings_audit')+'(revision,payload,actor,created_at) SELECT revision,payload,?,updated_at FROM '+table('variant_bindings_state')+' WHERE changes()=1 AND id=1 AND revision=1').bind('workspace-technical-initialization-v1'),
  db.prepare('INSERT OR IGNORE INTO '+table('production_cost_rules_state')+'(id,revision,payload,updated_at) SELECT 1,1,?,? WHERE NOT EXISTS(SELECT 1 FROM '+table('production_cost_rules_audit')+')').bind('{"rules":[]}',stamp),
  db.prepare('INSERT INTO '+table('production_cost_rules_audit')+'(revision,payload,actor,created_at) SELECT revision,payload,?,updated_at FROM '+table('production_cost_rules_state')+' WHERE changes()=1 AND id=1 AND revision=1').bind('workspace-technical-initialization-v1'),
 ];
}
export async function prepareCommercialWorkspace(scopedEnv,rawEnv,principal,schema,{now=()=>Date.now(),cursor=0}={}){
 const db=database(scopedEnv,rawEnv,principal),plan=await schemaPlan(schema);
 if(!Number.isSafeInteger(cursor)||cursor<0||cursor>plan.statements.length)fail('CURSOR_INVALID',400);
 const creates=plan.statements.map(statement=>tenantPrepareTechnicalCreate(scopedEnv.ADMIN_DB,statement.sql,db)),observed=await record(db,principal);
 if(observed&&observed.schema_hash!==plan.hash)fail('SCHEMA_VERSION_REQUIRED');
 if(observed&&(observed.total!==plan.statements.length||observed.state==='PREPARING'&&observed.cursor===observed.total))fail('STATE_INVALID',503);
 if(observed?.state==='READY')return dto(observed,true);
 if((observed?.cursor??0)>cursor)return dto(observed,true);
 if((observed?.cursor??0)<cursor)fail('CURSOR_CONFLICT');
 const offset=observed?.cursor??0,end=Math.min(offset+COMMERCIAL_WORKSPACE_DDL_CHUNK,plan.statements.length),clock=now();if(!Number.isSafeInteger(clock)||clock<1)fail('CLOCK_INVALID',503);
 const value={id:principal.storeId,organization_id:principal.organizationId,store_id:principal.storeId,schema_hash:plan.hash,cursor:end,total:plan.statements.length,state:end===plan.statements.length?'READY':'PREPARING',created_at:observed?.created_at??clock,updated_at:clock},authorization=tenantAuthorizationGuard(principal,'store.read',clock),statements=[db.prepare(authorization.sql).bind(...authorization.bindings),...creates.slice(offset,end)];
 if(value.state==='READY')statements.push(...seedStatements(scopedEnv,db,principal,new Date(clock).toISOString()));
 const raw=JSON.stringify(value);
 statements.push(observed?db.prepare("UPDATE mls_account_records SET revision=revision+1,payload=? WHERE kind='workspace_setup' AND scope=? AND id=? AND revision=?").bind(raw,principal.organizationId,principal.storeId,observed.revision):db.prepare("INSERT OR IGNORE INTO mls_account_records(kind,scope,id,revision,payload) VALUES('workspace_setup',?,?,1,?)").bind(principal.organizationId,principal.storeId,raw));
 statements.push(db.prepare('INSERT INTO mls_account_guard(ok) SELECT 0 WHERE changes()<>1'));
 try{await db.batch(statements);}catch(error){
  const current=await record(db,principal);if(current&&current.schema_hash===plan.hash&&current.cursor>=end)return dto(current,true);
  if(error instanceof TenantIsolationError)throw error;fail('PREPARATION_CONFLICT');
 }
 return dto({...value,revision:(observed?.revision??0)+1});
}
export async function assertCommercialWorkspaceReady(scopedEnv,rawEnv,principal,schema){
 const db=database(scopedEnv,rawEnv,principal),plan=await schemaPlan(schema),current=await record(db,principal);if(!current||current.state!=='READY'||current.schema_hash!==plan.hash||current.cursor!==plan.statements.length)fail('PREPARATION_REQUIRED');return dto(current,true);
}
