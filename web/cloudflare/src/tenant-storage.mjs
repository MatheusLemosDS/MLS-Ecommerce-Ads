import {TENANT_APP_TABLES,TENANT_FINANCE_TABLES,TENANT_SCHEMA_OBJECTS} from './tenant-schema-manifest.mjs';

// These adapters are server-only. Callers must first resolve the account,
// membership, store and action. The raw ACCOUNT_DB is never given to a domain.
export class TenantIsolationError extends Error {
 constructor(code,status=403){super(code);this.name='TenantIsolationError';this.code=code;this.status=status;}
}
const fail=(code,status)=>{throw new TenantIsolationError('TENANT_'+code,status);};
const encoder=new TextEncoder(),wrappers=new WeakMap(),ownedStatements=new WeakMap(),storageIdentities=new WeakMap(),identityByRawDatabase=new WeakMap(),storageDetails=new WeakMap();
// Initialization/cache identity is stable across request-specific permission
// fences. It contains no database handle, principal or mutable authorization.
export function tenantStorageIdentity(database){return storageIdentities.get(database)??database;}
export function isTenantDatabase(database){return storageIdentities.has(database);}
export function tenantDatabaseHasContext(database,context,{domain='app'}={}){const details=storageDetails.get(database);return !!details&&details.namespace===context?.namespace&&details.domain===domain;}
export function tenantDatabaseMatchesContext(database,context,rawDatabase){const details=storageDetails.get(database);return !!details&&details.namespace===context?.namespace&&details.rawDb===rawDatabase&&details.domain==='app';}
// Private technical provisioner bridge. Only validated, namespaced CREATE
// statements can join the account-record CAS and authorization transaction.
export function tenantPrepareTechnicalCreate(database,sql,expectedRawDatabase){
 const details=storageDetails.get(database);if(!details||details.rawDb!==expectedRawDatabase||!/^\s*CREATE\s+(?:(?:UNIQUE\s+)?INDEX|TABLE|TRIGGER)\s+IF\s+NOT\s+EXISTS\b/i.test(sql))fail('TECHNICAL_CREATE_FORBIDDEN');
 return details.rawDb.prepare(rewrite(sql,details.namespace,details.domain).sql);
}
export class TenantInitializationMap {
 constructor(){this.cache=new WeakMap();}
 has(db){return this.cache.has(tenantStorageIdentity(db));}
 get(db){return this.cache.get(tenantStorageIdentity(db));}
 set(db,value){this.cache.set(tenantStorageIdentity(db),value);return this;}
 delete(db){return this.cache.delete(tenantStorageIdentity(db));}
}
export class TenantInitializationSet {
 constructor(){this.cache=new WeakSet();}
 has(db){return this.cache.has(tenantStorageIdentity(db));}
 add(db){this.cache.add(tenantStorageIdentity(db));return this;}
 delete(db){return this.cache.delete(tenantStorageIdentity(db));}
}
const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
export async function tenantNamespace(organizationId,storeId){
 if(!id(organizationId)||!id(storeId))fail('CONTEXT_INVALID');
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(['mls-domain-v1',organizationId,storeId]))));
 return 'mlst_'+Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('')+'_';
}
// A lexer, rather than a global string replacement: quoted values, JSON,
// hashes, comments and historical payloads are never rewritten.
function lex(sql){
 if(typeof sql!=='string'||!sql.trim()||sql.length>1048576)fail('SQL_INVALID',400);
 const result=[];let at=0;
 while(at<sql.length){
  const start=at,c=sql[at];
  if(/\s/.test(c)){while(at<sql.length&&/\s/.test(sql[at]))at++;result.push({kind:'space',raw:sql.slice(start,at)});continue;}
  if(sql.slice(at,at+2)==='--'){at=sql.indexOf('\n',at);if(at<0)at=sql.length;result.push({kind:'comment',raw:sql.slice(start,at)});continue;}
  if(sql.slice(at,at+2)==='/*'){at=sql.indexOf('*/',at+2);if(at<0)fail('SQL_INVALID',400);at+=2;result.push({kind:'comment',raw:sql.slice(start,at)});continue;}
  if(c==="'"||c==='"'||c==='`'||c==='['){
   const end=c==='['?']':c;at++;let value='',closed=false;
   while(at<sql.length){if(sql[at]===end){if(sql[at+1]===end){value+=end;at+=2;continue;}at++;closed=true;break;}value+=sql[at++];}
   if(!closed)fail('SQL_INVALID',400);result.push({kind:c==="'"?'string':'identifier',raw:sql.slice(start,at),value,quote:c});continue;
  }
  if(/[A-Za-z_]/.test(c)){at++;while(at<sql.length&&/[A-Za-z0-9_$]/.test(sql[at]))at++;const raw=sql.slice(start,at);result.push({kind:'identifier',raw,value:raw});continue;}
  at++;result.push({kind:'symbol',raw:c,value:c});
 }
 return result;
}
const quoted=(value,quote)=>quote==="'"?"'"+value.replaceAll("'","''")+"'":quote==='['?'['+value.replaceAll(']',']]')+']':quote?quote+value.replaceAll(quote,quote+quote)+quote:value;
function rewrite(sql,namespace,domain){
 const tokens=lex(sql),significant=tokens.filter(t=>!['space','comment'].includes(t.kind));
 const tables=new Set(domain==='finance'?TENANT_FINANCE_TABLES:TENANT_APP_TABLES);
 const objectNames=new Set(TENANT_SCHEMA_OBJECTS.filter(name=>tables.has(name)||!TENANT_APP_TABLES.includes(name)&&!TENANT_FINANCE_TABLES.includes(name)&&(name.startsWith('finance_')===(domain==='finance'))));
 const upper=t=>t?.kind==='identifier'?t.value.toUpperCase():t?.value;
 if(!['SELECT','INSERT','UPDATE','DELETE','CREATE','WITH'].includes(upper(significant[0])))fail('SQL_FORBIDDEN');
 const ctes=[],depthAt=[];let nesting=0;
 for(let i=0;i<significant.length;i++){depthAt.push(nesting);if(significant[i].value==='(')nesting++;if(significant[i].value===')')nesting--;}
 const skipGroup=index=>{let depth=0;for(let j=index;j<significant.length;j++){if(significant[j].value==='(')depth++;if(significant[j].value===')'&&--depth===0)return j+1;}fail('SQL_INVALID',400);};
 for(let i=0;i<significant.length;i++)if(upper(significant[i])==='WITH'){
  let end=significant.length;for(let k=i+1;k<significant.length;k++)if(depthAt[k]===depthAt[i]&&[')', ';'].includes(significant[k].value)){end=k;break;}
  let j=i+1;if(upper(significant[j])==='RECURSIVE')j++;
  while(significant[j]?.kind==='identifier'){
   const name=significant[j++].value.toLowerCase();if(significant[j]?.value==='(')j=skipGroup(j);
   if(upper(significant[j++])!=='AS')break;
   if(upper(significant[j])==='NOT')j++;if(upper(significant[j])==='MATERIALIZED')j++;
   if(significant[j]?.value!=='(')break;ctes.push({name,start:i,end});j=skipGroup(j);if(significant[j]?.value!==',')break;j++;
  }
 }
 const checkRelation=index=>{
  const next=significant[index],name=next?.value?.toLowerCase();
  if(next?.value==='(')return;
  if(!next||next.kind!=='identifier'||significant[index+1]?.value==='.'||!tables.has(name)&&name!=='sqlite_master'&&!ctes.some(c=>c.name===name&&index>c.start&&index<c.end)&&!(['json_each','json_tree'].includes(name)&&significant[index+1]?.value==='('))fail('SQL_TABLE_FORBIDDEN');
 };
 let depth=0,checkedDdlTarget=false;const fromDepths=new Set();
 for(let i=0;i<significant.length;i++){
  const t=significant[i],word=t.kind==='identifier'?t.value.toLowerCase():'';
  if(t.kind==='identifier'&&(/^(mlst_|mls_account_|mls_tenant_)/i.test(word)||['attach','detach','vacuum','writable_schema','sqlite_schema','sqlite_temp_master','load_extension','readfile','writefile','pragma','alter','drop','virtual','temp','temporary'].includes(word)))fail('SQL_FORBIDDEN');
  if(t.value==='(')depth++;
  if(t.value===')'){fromDepths.delete(depth);depth--;}
  if(['where','group','having','order','limit','union','except','intersect','returning','set','values'].includes(word))fromDepths.delete(depth);
  if(word==='from')fromDepths.add(depth);
  if(t.value===','&&fromDepths.has(depth))checkRelation(i+1);
  if(['from','join','into','update','references'].includes(word)){
   const next=significant[i+1],name=next?.value?.toLowerCase();
   // UPDATE inside a trigger is followed by ON; ON CONFLICT DO UPDATE
   // introduces SET. Table-valued JSON functions and local CTEs are allowed.
   if(['on','set','of'].includes(name))continue;
   checkRelation(i+1);
  }
  if(word==='on'&&!checkedDdlTarget&&significant.slice(0,i).some(x=>['INDEX','TRIGGER'].includes(upper(x)))&&upper(significant[i+1])!=='CONFLICT'){checkRelation(i+1);checkedDdlTarget=true;}
  if(['table','index','trigger','view'].includes(word)&&['CREATE','DROP','ALTER','UNIQUE','EXISTS','TEMP','TEMPORARY'].includes(upper(significant[i-1]))){
   let j=i+1;while(['IF','NOT','EXISTS'].includes(upper(significant[j])))j++;
   if(!objectNames.has(significant[j]?.value?.toLowerCase())||word==='view')fail('SQL_TABLE_FORBIDDEN');
  }
 }
 const physicalNames=[...objectNames].map(name=>"'"+namespace+name+"'").join(',');
 for(const t of tokens){
  const name=t.value?.toLowerCase();
  if(t.kind==='identifier'&&name==='sqlite_master')t.raw="(SELECT type,substr(name,"+(namespace.length+1)+") AS name,substr(tbl_name,"+(namespace.length+1)+") AS tbl_name,rootpage,replace(sql,'"+namespace+"','') AS sql FROM sqlite_master WHERE name IN ("+physicalNames+'))';
  else if(t.kind==='identifier'&&objectNames.has(name))t.raw=quoted(namespace+name,t.quote);
 }
 const effectiveVerb=significant.find((token,index)=>depthAt[index]===0&&token.kind==='identifier'&&['SELECT','INSERT','UPDATE','DELETE','CREATE'].includes(token.value.toUpperCase()))?.value.toUpperCase();
 return {sql:tokens.map(t=>t.raw).join(''),mutates:effectiveVerb!=='SELECT'};
}
export function createTenantDatabase(rawDb,context,{domain='app',authorizationGuard=null}={}){
 if(!rawDb?.prepare||!rawDb?.batch||!['app','finance'].includes(domain)||!id(context?.organizationId)||!id(context?.storeId)||!/^mlst_[a-f0-9]{64}_$/.test(context?.namespace))fail('STORAGE_CONFIGURATION',503);
 if(authorizationGuard!==null&&typeof authorizationGuard!=='function')fail('STORAGE_CONFIGURATION',503);
 // Guarded wrappers are request-specific. Unguarded wrappers can safely share
 // initialization promises by physical namespace, never by marketplace ID.
 let cache=wrappers.get(rawDb);if(!cache){cache=new Map();wrappers.set(rawDb,cache);}
 const cacheKey=domain+context.namespace;if(!authorizationGuard&&cache.has(cacheKey))return cache.get(cacheKey);
 const guard=async()=>{if(!authorizationGuard)return null;const value=await authorizationGuard();if(!value||typeof value.sql!=='string'||!Array.isArray(value.bindings))fail('AUTHORIZATION_REVOKED');return rawDb.prepare(value.sql).bind(...value.bindings);};
 let scoped;
 const prepare=sql=>{
  const transformed=rewrite(sql,context.namespace,domain);let values=[];
  const build=()=>rawDb.prepare(transformed.sql).bind(...values);
  const statement={
   bind(...input){values=input;return statement;},
   async first(column){let row;if(transformed.mutates){const result=await statement.all();row=result.results?.[0]??null;}else row=await build().first();return column?row?.[column]??null:row;},
   async all(){if(transformed.mutates){const check=await guard();if(check)return (await rawDb.batch([check,build()]))[1];}return build().all();},
   async run(){const check=await guard();if(check){const results=await rawDb.batch([check,build()]);return results[1];}return build().run();},
   async raw(options){const rows=await statement.all(),keys=Object.keys(rows.results?.[0]||{});return options?.columnNames?[keys,...rows.results.map(row=>keys.map(key=>row[key]))]:rows.results.map(row=>keys.map(key=>row[key]));},
  };
  ownedStatements.set(statement,{owner:scoped,build,mutates:transformed.mutates});return statement;
 };
 scoped=Object.freeze({prepare,async batch(statements){
  if(!Array.isArray(statements)||!statements.length)fail('SQL_INVALID',400);
  const data=statements.map(s=>ownedStatements.get(s));if(data.some(s=>!s||s.owner!==scoped))fail('STATEMENT_SCOPE_MISMATCH');
  const check=data.some(s=>s.mutates)?await guard():null,results=await rawDb.batch([...(check?[check]:[]),...data.map(s=>s.build())]);
  return results.slice(check?1:0);
 },async exec(){fail('SQL_EXEC_UNSUPPORTED');},async dump(){fail('SQL_EXPORT_FORBIDDEN');},withSession(){return scoped;}});
 let identities=identityByRawDatabase.get(rawDb);if(!identities){identities=new Map();identityByRawDatabase.set(rawDb,identities);}if(!identities.has(cacheKey))identities.set(cacheKey,Object.freeze({}));storageIdentities.set(scoped,identities.get(cacheKey));
 storageDetails.set(scoped,{rawDb,namespace:context.namespace,domain});
 if(!authorizationGuard)cache.set(cacheKey,scoped);return scoped;
}

export function createTenantKeyValue(raw,context){
 if(!raw?.get||!raw?.put||!context?.namespace)fail('KV_CONFIGURATION',503);
 const key=value=>{if(typeof value!=='string'||value.length>1024)fail('KV_KEY_INVALID',400);return context.namespace+value;};
 return Object.freeze({get:(k,...args)=>raw.get(key(k),...args),getWithMetadata:(k,...args)=>raw.getWithMetadata(key(k),...args),put:(k,...args)=>raw.put(key(k),...args),delete:k=>raw.delete(key(k)),async list(options={}){const prefix=context.namespace+(options.prefix||'');const result=await raw.list({...options,prefix});if(!Array.isArray(result?.keys)||result.keys.some(item=>typeof item?.name!=='string'||!item.name.startsWith(prefix)))fail('KV_RESULT_SCOPE_MISMATCH');return {...result,keys:result.keys.map(item=>({...item,name:item.name.slice(context.namespace.length)}))};}});
}
