import {projectVariantCatalog,projectVariantCatalogFailure} from '../../finance/src/variant-catalog-frame.mjs';
import {validateVariantBindings} from './variant-bindings.mjs';

// A catalogue interpretation is a registered composition, not a live price.
// This store never writes manual links, Shopee listings, credentials or orders.
export const CATALOG_CLASSIFICATION_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS catalog_classification_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,lease_token TEXT,lease_until INTEGER)`,
 `CREATE TABLE IF NOT EXISTS catalog_classification_jobs(item_id TEXT PRIMARY KEY,status TEXT NOT NULL,product_name TEXT,reason TEXT,checked_at INTEGER,catalog_fingerprint TEXT,source_hash TEXT,model_count INTEGER NOT NULL DEFAULT 0,resolved_count INTEGER NOT NULL DEFAULT 0,last_attempt_at INTEGER,next_attempt_at INTEGER NOT NULL,failure_count INTEGER NOT NULL DEFAULT 0,lease_token TEXT,lease_until INTEGER,write_token TEXT)`,
 `CREATE INDEX IF NOT EXISTS catalog_classification_due ON catalog_classification_jobs(next_attempt_at,last_attempt_at)`,
 `CREATE TABLE IF NOT EXISTS catalog_classification_variants(item_id TEXT NOT NULL,model_id TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=4096),PRIMARY KEY(item_id,model_id))`,
 `CREATE TABLE IF NOT EXISTS catalog_classification_changes(item_id TEXT PRIMARY KEY,change_token TEXT NOT NULL,changed_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS catalog_classification_sold_gaps(item_id TEXT NOT NULL,evidence_hash TEXT NOT NULL,catalog_fingerprint TEXT,model_ids_json TEXT NOT NULL CHECK(length(CAST(model_ids_json AS BLOB))<=65536),scheduled_at INTEGER NOT NULL,PRIMARY KEY(item_id,evidence_hash))`,
 `CREATE TABLE IF NOT EXISTS catalog_classification_source_diagnostics(item_id TEXT PRIMARY KEY,diagnostic TEXT NOT NULL CHECK(length(CAST(diagnostic AS BLOB))<=512),checked_at INTEGER NOT NULL,failure_count INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS catalog_classification_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,item_id TEXT NOT NULL,checked_at INTEGER NOT NULL,outcome TEXT NOT NULL,reason TEXT,revision INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS production_cost_catalog(item_id TEXT PRIMARY KEY,catalog_fingerprint TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=1048576),checked_at INTEGER NOT NULL)`,
 `INSERT OR IGNORE INTO catalog_classification_state(id,revision) SELECT 1,1 WHERE NOT EXISTS(SELECT 1 FROM catalog_classification_variants) AND NOT EXISTS(SELECT 1 FROM catalog_classification_audit) AND NOT EXISTS(SELECT 1 FROM catalog_classification_jobs WHERE checked_at IS NOT NULL)`,
];
export class CatalogClassificationError extends Error {constructor(code,status=503){super(code);this.status=status;}}
const fail=(code,status=503)=>{throw new CatalogClassificationError(code,status);};
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const array=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,i)=>Object.getOwnPropertyDescriptor(value,String(i))).every(row=>row&&Object.hasOwn(row,'value'));
const id=(value,zero=false)=>typeof value==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(value);
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&new TextEncoder().encode(value).length<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);
const compare=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
const statuses=['QUEUED','RUNNING','MATCHED','PARTIAL','REVIEW','RETRY_WAIT'];
const reasons=['CATALOG_UNAVAILABLE','CATALOG_INVALID','CATALOG_STALE_RESPONSE','CATALOG_CONFLICT','CATALOG_METADATA_CHANGED','CATALOG_SOLD_MODEL_MISSING','UNRECOGNIZED_VARIATION','AXES_NOT_RECOGNIZED','OPTION_NOT_RECOGNIZED','INDEX_NOT_VALID','NO_MODELS','CATALOG_BASE_ITEM_ABSENT','CATALOG_BASE_NAME_UNAVAILABLE','CATALOG_BASE_API_REJECTED','CATALOG_BASE_RESPONSE_INVALID','CATALOG_MODEL_API_REJECTED','CATALOG_MODEL_RESPONSE_INVALID','CATALOG_MODEL_STRUCTURE_INVALID','CATALOG_COST_METADATA_INVALID','CATALOG_RESPONSE_INVALID','CATALOG_RESPONSE_TOO_LARGE','CATALOG_AUTH_REQUIRED','CATALOG_PERMISSION_REQUIRED','CATALOG_RATE_LIMIT','CATALOG_TIMEOUT','CATALOG_HTTP_ERROR','CATALOG_BASE_HTTP_ERROR','CATALOG_MODEL_HTTP_ERROR','CATALOG_TRANSPORT_UNAVAILABLE','CATALOG_SOURCE_UNAVAILABLE'];
function sourceFailureReason(failure){
 const {code,stage,http}=failure.diagnostic,prefix='FINANCE_CATALOG_';
 const direct=['BASE_ITEM_ABSENT','BASE_NAME_UNAVAILABLE','BASE_API_REJECTED','BASE_RESPONSE_INVALID','MODEL_API_REJECTED','MODEL_RESPONSE_INVALID','MODEL_STRUCTURE_INVALID','COST_METADATA_INVALID'];
 for(const suffix of direct)if(code===prefix+suffix)return 'CATALOG_'+suffix;
 if(code===prefix+'AUTH_REQUIRED'||code===prefix+'AUTHORIZATION_EXPIRED')return 'CATALOG_AUTH_REQUIRED';
 if(code===prefix+'PERMISSION_REQUIRED')return 'CATALOG_PERMISSION_REQUIRED';
 if(code===prefix+'RATE_LIMIT'||http===429)return 'CATALOG_RATE_LIMIT';
 if(code.endsWith('_TIMEOUT')||[408,504].includes(http))return 'CATALOG_TIMEOUT';
 if(code===prefix+'UPSTREAM_HTTP'||code===prefix+'APP_HTTP_ERROR')return stage==='BASE_INFO'?'CATALOG_BASE_HTTP_ERROR':stage==='MODELS'?'CATALOG_MODEL_HTTP_ERROR':'CATALOG_HTTP_ERROR';
 if(code===prefix+'UPSTREAM_BODY_TOO_LARGE')return 'CATALOG_RESPONSE_TOO_LARGE';
 if(['RESPONSE_INVALID','APP_RESPONSE_INVALID','UPSTREAM_INVALID_JSON','UPSTREAM_CONTENT_TYPE','IDENTITY_MISMATCH'].some(suffix=>code===prefix+suffix))return 'CATALOG_RESPONSE_INVALID';
 if(['TRANSPORT_UNAVAILABLE','UPSTREAM_FAILED','APP_UPSTREAM_FAILED'].some(suffix=>code===prefix+suffix))return 'CATALOG_TRANSPORT_UNAVAILABLE';
 return 'CATALOG_SOURCE_UNAVAILABLE';
}
const ready=new WeakMap();
function clock(now){let value;try{value=now();}catch{fail('CATALOG_CLASSIFICATION_CLOCK_INVALID');}if(!integer(value,1,9999999999999))fail('CATALOG_CLASSIFICATION_CLOCK_INVALID');return Math.floor(value/1000);}
function idsInput(values){if(!array(values,3000)||!values.every(value=>id(value)))fail('CATALOG_CLASSIFICATION_REQUEST_INVALID',400);return [...new Set(values)].sort(compare);}
async function setup(env){const db=env?.ADMIN_DB;if(!db||typeof db.batch!=='function'||typeof db.prepare!=='function')fail('CATALOG_CLASSIFICATION_CONFIGURATION');if(!ready.has(db)){const promise=db.batch(CATALOG_CLASSIFICATION_SCHEMA.map(sql=>db.prepare(sql))).then(async()=>{const state=await db.prepare('SELECT * FROM catalog_classification_state WHERE id=1').first();if(!state||!integer(state.revision,1,2147483646)||state.lease_token!==null&&(typeof state.lease_token!=='string'||!/^[a-f0-9-]{36}$/.test(state.lease_token))||state.lease_until!==null&&!integer(state.lease_until,1,9999999999)||(state.lease_token===null)!==(state.lease_until===null))fail('CATALOG_CLASSIFICATION_STORAGE_INVALID');}).catch(error=>{ready.delete(db);if(error instanceof CatalogClassificationError)throw error;fail('CATALOG_CLASSIFICATION_UNAVAILABLE');});ready.set(db,promise);}await ready.get(db);return db;}
async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
function checkedJob(row){
 if(!row||!id(row.item_id)||!statuses.includes(row.status)||row.product_name!==null&&!text(row.product_name,1024)||row.reason!==null&&!reasons.includes(row.reason)||row.checked_at!==null&&!integer(row.checked_at,1,9999999999)||row.catalog_fingerprint!==null&&!hash(row.catalog_fingerprint)||row.source_hash!==null&&!hash(row.source_hash)||!integer(row.model_count,0,1000)||!integer(row.resolved_count,0,row.model_count)||!integer(row.next_attempt_at,0,9999999999)||!integer(row.failure_count,0,1000000)||row.last_attempt_at!==null&&!integer(row.last_attempt_at,1,9999999999)||row.lease_token!==null&&(typeof row.lease_token!=='string'||!/^[a-f0-9-]{36}$/.test(row.lease_token))||row.lease_until!==null&&!integer(row.lease_until,1,9999999999)||(row.lease_token===null)!==(row.lease_until===null))fail('CATALOG_CLASSIFICATION_STORAGE_INVALID');
 if(row.checked_at===null?(row.catalog_fingerprint!==null||row.source_hash!==null||row.product_name!==null||row.model_count!==0||row.resolved_count!==0):(row.catalog_fingerprint===null||row.source_hash===null||row.product_name===null))fail('CATALOG_CLASSIFICATION_STORAGE_INVALID');
 return row;
}
function checkedVariant(row,job){
 if(!id(row.item_id)||!id(row.model_id,true)||typeof row.payload!=='string'||new TextEncoder().encode(row.payload).length>4096)fail('CATALOG_CLASSIFICATION_STORAGE_INVALID');
 let value;try{value=JSON.parse(row.payload);}catch{fail('CATALOG_CLASSIFICATION_STORAGE_INVALID');}
 if(!exact(value,['model_name','attributes','reason','binding'])||!text(value.model_name,512)||!array(value.attributes,2)||value.reason!==null&&!reasons.includes(value.reason))fail('CATALOG_CLASSIFICATION_STORAGE_INVALID');
 const names=new Set();for(const attribute of value.attributes){if(!exact(attribute,['name','value'])||!text(attribute.name,64)||!text(attribute.value,64)||names.has(attribute.name))fail('CATALOG_CLASSIFICATION_STORAGE_INVALID');names.add(attribute.name);}
 if(value.binding!==null){try{const normalized=validateVariantBindings([value.binding]);if(normalized[0].item_id!==row.item_id||normalized[0].model_id!==row.model_id||normalized[0].operator_confirmed!==false||job&&normalized[0].catalog_fingerprint!==job.catalog_fingerprint||!bindingMatchesAttributes(normalized[0],value.attributes))throw Error();value.binding=normalized[0];}catch{fail('CATALOG_CLASSIFICATION_STORAGE_INVALID');}}
 return {...value,item_id:row.item_id,model_id:row.model_id,attributes:value.attributes.map(value=>({...value}))};
}
function productMetadata(row){const value=checkedJob(row);return {item_id:value.item_id,product_name:value.product_name,status:value.status,reason:row.metadata_changed_at!==null&&row.metadata_changed_at!==undefined?'CATALOG_METADATA_CHANGED':value.reason,checked_at:value.checked_at,catalog_fingerprint:value.catalog_fingerprint,model_count:value.model_count,resolved_count:value.resolved_count,next_attempt_at:value.next_attempt_at,failure_count:value.failure_count};}
function bindingMatchesAttributes(binding,attributes){
 const label=value=>value.normalize('NFKD').replace(/\p{M}/gu,'').trim().toLowerCase().replace(/[.]/g,'').replace(/\s+/g,' ');
 const axes=attributes.map(row=>({name:label(row.name),value:row.value.trim().toUpperCase()}));
 if(binding.selling_unit==='SINGLE_GARMENT'){
  const sizes=axes.filter(row=>['tamanho','tamanhos','tam','size','sizes','shirt size','garment size'].includes(row.name));
  return sizes.length===1&&sizes[0].value===binding.size&&axes.every(row=>row===sizes[0]||['cor','color','colour','estampa'].includes(row.name));
 }
 if(axes.length!==2)return false;
 const genders={male_size:['masculino','masculina','tamanho masculino','tamanho masculina','tam masculino','tam masculina','tam masc','tamanho masc','masc','male','men','mens','male size','men size',"men's size"],female_size:['feminino','feminina','tamanho feminino','tamanho feminina','tam feminino','tam feminina','tam fem','tamanho fem','fem','female','women','womens','female size','women size',"women's size"]};
 return Object.keys(genders).every(gender=>{const matches=axes.filter(axis=>genders[gender].includes(axis.name));if(matches.length!==1)return false;const value=matches[0].value,prefixed=/^(MULHER|HOMEM) +(P|M|G|GG|G1|G2|G3)$/.exec(value);return value===binding[gender]||prefixed?.[1]===({male_size:'HOMEM',female_size:'MULHER'})[gender]&&prefixed[2]===binding[gender];});
}

export function catalogClassificationQueries(db,itemIds,sourceItems=null){
 const ids=idsInput(itemIds),queries=[db.prepare('SELECT revision AS classification_revision FROM catalog_classification_state WHERE id=1')];
 if(sourceItems!==null){
  if(!array(sourceItems,3000)||!sourceItems.every(row=>plain(row)&&id(Object.getOwnPropertyDescriptor(row,'item_id')?.value)&&id(Object.getOwnPropertyDescriptor(row,'model_id')?.value,true)))fail('CATALOG_CLASSIFICATION_REQUEST_INVALID',400);
  const allowed=new Set(ids),seen=new Set(),pairs=[];for(const row of sourceItems){const key=row.item_id+':'+row.model_id;if(allowed.has(row.item_id)&&!seen.has(key)){seen.add(key);pairs.push({item_id:row.item_id,model_id:row.model_id});}}
  for(let i=0;i<pairs.length;i+=90)queries.push(db.prepare("SELECT item_id,model_id,payload FROM catalog_classification_variants WHERE (item_id,model_id) IN (SELECT json_extract(value,'$.item_id'),json_extract(value,'$.model_id') FROM json_each(?))").bind(JSON.stringify(pairs.slice(i,i+90))));
 }else for(let i=0;i<ids.length;i+=90){const part=ids.slice(i,i+90);queries.push(db.prepare('SELECT item_id,model_id,payload FROM catalog_classification_variants WHERE item_id IN ('+part.map(()=>'?').join(',')+')').bind(...part));}
 for(let i=0;i<ids.length;i+=90){const part=ids.slice(i,i+90);queries.push(db.prepare('SELECT * FROM catalog_classification_jobs WHERE item_id IN ('+part.map(()=>'?').join(',')+')').bind(...part));}
 for(let i=0;i<ids.length;i+=90){const part=ids.slice(i,i+90);queries.push(db.prepare('SELECT item_id,change_token,changed_at FROM catalog_classification_changes WHERE item_id IN ('+part.map(()=>'?').join(',')+')').bind(...part));}
 return queries;
}
export function catalogClassificationsFromSnapshot(results){
 if(!Array.isArray(results)||!integer(results[0]?.results?.[0]?.classification_revision,1,2147483647))fail('CATALOG_CLASSIFICATION_STORAGE_INVALID');
 const raw=results.slice(1).flatMap(row=>row.results||[]),jobs=new Map(),rows=[],changed=new Map();
 for(const row of raw){if(Object.hasOwn(row,'changed_at')){if(!id(row.item_id)||!integer(row.changed_at,1,9999999999)||typeof row.change_token!=='string'||!/^[a-f0-9-]{36}$/.test(row.change_token)||changed.has(row.item_id))fail('CATALOG_CLASSIFICATION_STORAGE_INVALID');changed.set(row.item_id,row.changed_at);}else if(Object.hasOwn(row,'status')){if(jobs.has(row.item_id))fail('CATALOG_CLASSIFICATION_STORAGE_INVALID');jobs.set(row.item_id,checkedJob(row));}else rows.push(row);}
 for(const [itemId,at]of changed){const job=jobs.get(itemId);if(job)job.metadata_changed_at=at;}
 const bindings=[],variants=[],seen=new Set();for(const row of rows){const job=jobs.get(row.item_id),key=row.item_id+':'+row.model_id;if(!job||seen.has(key))fail('CATALOG_CLASSIFICATION_STORAGE_INVALID');seen.add(key);const value=checkedVariant(row,job);if(value.binding&&!changed.has(row.item_id)&&job.reason!=='CATALOG_METADATA_CHANGED')bindings.push(value.binding);const {binding,...metadata}=value;variants.push({...metadata,...(changed.has(row.item_id)||job.reason==='CATALOG_METADATA_CHANGED'?{reason:'CATALOG_METADATA_CHANGED'}:{})});}
 bindings.sort((a,b)=>compare(a.item_id,b.item_id)||compare(a.model_id,b.model_id));variants.sort((a,b)=>compare(a.item_id,b.item_id)||compare(a.model_id,b.model_id));
 return {revision:results[0].results[0].classification_revision,bindings,products:[...jobs.values()].map(productMetadata).sort((a,b)=>compare(a.item_id,b.item_id)),variants};
}

export async function enqueueCatalogClassifications(env,itemIds,{now=()=>Date.now(),returnState=true,priorityItemIds=[]}={}){
 if(typeof returnState!=='boolean')fail('CATALOG_CLASSIFICATION_REQUEST_INVALID',400);
 const ids=idsInput(itemIds),priority=new Set(idsInput(priorityItemIds)),allowed=new Set(ids);if([...priority].some(item=>!allowed.has(item)))fail('CATALOG_CLASSIFICATION_REQUEST_INVALID',400);
 const stamp=clock(now),db=await setup(env);
 // A missing production cost should not wait behind already priced products.
 // Only an untouched queued job can move forward; failed and leased jobs keep
 // their provider backoff and ownership even when another month rediscovers it.
 // Rediscovering an already prioritized job must not rewrite the same row.
 const writes=[];for(let i=0;i<ids.length;i+=90)writes.push(db.prepare("INSERT OR IGNORE INTO catalog_classification_jobs(item_id,status,next_attempt_at) SELECT json_extract(value,'$.item_id'),'QUEUED',CASE WHEN json_extract(value,'$.priority')=1 THEN 0 ELSE ? END FROM json_each(?) WHERE 1 ON CONFLICT(item_id) DO UPDATE SET next_attempt_at=0 WHERE excluded.next_attempt_at=0 AND catalog_classification_jobs.next_attempt_at<>0 AND catalog_classification_jobs.status='QUEUED' AND catalog_classification_jobs.checked_at IS NULL AND catalog_classification_jobs.last_attempt_at IS NULL AND catalog_classification_jobs.failure_count=0 AND catalog_classification_jobs.lease_token IS NULL AND catalog_classification_jobs.lease_until IS NULL").bind(stamp,JSON.stringify(ids.slice(i,i+90).map(item_id=>({item_id,priority:priority.has(item_id)?1:0})))));
 if(writes.length)await db.batch(writes);
 return returnState?readCatalogClassificationState(env,{}, {now}):null;
}

// A newly sold model is evidence that the cached catalogue may be incomplete,
// even when the product index has no newer update_time. Check that exact gap
// once per model set and catalogue fingerprint; quantity changes are not new
// evidence. Known models and existing production references remain usable.
export async function enqueueSoldCatalogGaps(env,variants,{now=()=>Date.now()}={}){
 if(!array(variants,3000))fail('CATALOG_CLASSIFICATION_REQUEST_INVALID',400);
 const seen=new Set();for(const row of variants){if(!exact(row,['item_id','model_id','quantity'])||!id(row.item_id)||!id(row.model_id,true)||!integer(row.quantity,1)||seen.has(row.item_id+':'+row.model_id))fail('CATALOG_CLASSIFICATION_REQUEST_INVALID',400);seen.add(row.item_id+':'+row.model_id);}
 const stamp=clock(now),db=await setup(env),products=new Map(),scheduled=[];
 const queries=[];for(let index=0;index<variants.length;index+=90)queries.push(db.prepare("SELECT json_extract(g.value,'$.item_id') AS item_id,json_extract(g.value,'$.model_id') AS model_id,j.status,j.reason,j.checked_at,j.catalog_fingerprint,j.write_token,j.lease_token,j.lease_until,j.next_attempt_at,j.failure_count,p.catalog_fingerprint AS cost_catalog_fingerprint,p.checked_at AS cost_catalog_checked_at,EXISTS(SELECT 1 FROM catalog_classification_variants v WHERE v.item_id=json_extract(g.value,'$.item_id') AND v.model_id=json_extract(g.value,'$.model_id')) AS classification_model_exists,EXISTS(SELECT 1 FROM json_each(p.payload,'$.variants') v WHERE json_extract(v.value,'$.model_id')=json_extract(g.value,'$.model_id')) AS cost_model_exists,EXISTS(SELECT 1 FROM catalog_classification_changes x WHERE x.item_id=json_extract(g.value,'$.item_id')) AS metadata_changed FROM json_each(?) g LEFT JOIN catalog_classification_jobs j ON j.item_id=json_extract(g.value,'$.item_id') LEFT JOIN production_cost_catalog p ON p.item_id=json_extract(g.value,'$.item_id')").bind(JSON.stringify(variants.slice(index,index+90))));
 const snapshots=queries.length?await db.batch(queries):[];
 for(const row of snapshots.flatMap(result=>result.results)){
  if(row.classification_model_exists||row.cost_model_exists)continue;
  if(!id(row.item_id)||!id(row.model_id,true)||[row.catalog_fingerprint,row.cost_catalog_fingerprint].some(value=>value!==null&&!hash(value)))fail('CATALOG_CLASSIFICATION_STORAGE_INVALID');
  let product=products.get(row.item_id);if(!product){product={...row,model_ids:[]};products.set(row.item_id,product);}product.model_ids.push(row.model_id);
 }
 if(products.size)await enqueueCatalogClassifications(env,[...products.keys()],{now,returnState:false,priorityItemIds:[...products.keys()]});
 const output=[];
 for(const product of [...products.values()].sort((a,b)=>compare(a.item_id,b.item_id))){
  const models=product.model_ids.sort(compare),evidence=await digest({model_ids:models,catalog_fingerprint:product.catalog_fingerprint,cost_catalog_fingerprint:product.cost_catalog_fingerprint}),modelJson=JSON.stringify(models);
  const eligible=!product.metadata_changed&&(product.lease_token===null||product.lease_until<=stamp)&&(product.status!=='RETRY_WAIT'||product.next_attempt_at<=stamp);
  let accepted=false;
  if(eligible){
   const writes=await db.batch([
    db.prepare("UPDATE catalog_classification_jobs SET reason='CATALOG_SOLD_MODEL_MISSING',next_attempt_at=0 WHERE item_id=? AND write_token IS ? AND catalog_fingerprint IS ? AND checked_at IS ? AND (lease_token IS NULL OR lease_until<=?) AND (status<>'RETRY_WAIT' OR next_attempt_at<=?) AND NOT EXISTS(SELECT 1 FROM catalog_classification_changes WHERE item_id=?) AND (SELECT catalog_fingerprint FROM production_cost_catalog WHERE item_id=?) IS ? AND (SELECT checked_at FROM production_cost_catalog WHERE item_id=?) IS ? AND NOT EXISTS(SELECT 1 FROM catalog_classification_sold_gaps WHERE item_id=? AND evidence_hash=?)").bind(product.item_id,product.write_token,product.catalog_fingerprint,product.checked_at,stamp,stamp,product.item_id,product.item_id,product.cost_catalog_fingerprint,product.item_id,product.cost_catalog_checked_at,product.item_id,evidence),
    db.prepare('INSERT INTO catalog_classification_sold_gaps(item_id,evidence_hash,catalog_fingerprint,model_ids_json,scheduled_at) SELECT ?,?,?,?,? WHERE changes()=1').bind(product.item_id,evidence,product.cost_catalog_fingerprint??product.catalog_fingerprint,modelJson,stamp),
   ]);accepted=writes[0]?.meta?.changes===1&&writes[1]?.meta?.changes===1;if(accepted)scheduled.push(product.item_id);
  }
  output.push({item_id:product.item_id,reason:product.catalog_fingerprint===null&&product.cost_catalog_fingerprint===null?'CATALOG_NOT_READ':'CATALOG_MODEL_MISSING',model_ids:[...models],scheduled:accepted});
 }
 return {schema:'catalog_sold_gaps_v1',products:output,scheduled_item_ids:scheduled};
}

// The product index calls this only after persisting a strictly newer provider
// update_time. Keep the registered composition usable while checking changes;
// an active owner or a provider backoff is never displaced by discovery.
export async function refreshKnownCatalogClassifications(env,itemIds,{now=()=>Date.now()}={}){
 const ids=idsInput(itemIds),stamp=clock(now),db=await setup(env),refreshed=[];
 if(ids.length)await db.batch([
  db.prepare('INSERT OR IGNORE INTO catalog_classification_changes(item_id,change_token,changed_at) SELECT item_id,?,? FROM catalog_classification_jobs WHERE item_id IN (SELECT value FROM json_each(?)) AND checked_at IS NOT NULL').bind(crypto.randomUUID(),stamp,JSON.stringify(ids)),
  db.prepare('UPDATE catalog_classification_state SET revision=revision+1 WHERE id=1 AND changes()>0 AND revision<2147483646'),
 ]);
 for(let index=0;index<ids.length;index+=90){
  const chunk=ids.slice(index,index+90),rows=await db.prepare("UPDATE catalog_classification_jobs SET reason='CATALOG_METADATA_CHANGED',next_attempt_at=? WHERE item_id IN (SELECT value FROM json_each(?)) AND checked_at IS NOT NULL AND (lease_token IS NULL OR lease_until<=?) AND (status<>'RETRY_WAIT' OR next_attempt_at<=?) RETURNING item_id").bind(stamp,JSON.stringify(chunk),stamp,stamp).all();
  refreshed.push(...rows.results.map(row=>row.item_id));
 }
 if(refreshed.length)await db.prepare('UPDATE catalog_classification_state SET revision=revision+1 WHERE id=1 AND revision<2147483646').run();
 return refreshed;
}

export async function readCatalogClassificationFence(env,itemIds){
 const ids=idsInput(itemIds);if(ids.length>3)fail('CATALOG_CLASSIFICATION_REQUEST_INVALID',400);
 const db=await setup(env),rows=ids.length?(await db.prepare('SELECT item_id,write_token FROM catalog_classification_jobs WHERE item_id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all()).results:[],map=new Map(rows.map(row=>[row.item_id,row.write_token]));
 return ids.map(item_id=>({item_id,write_token:map.get(item_id)??null}));
}
async function storeFrame(env,raw,{now=()=>Date.now(),token=null,itemId=null,fence=null,changeToken=null}={}){
 const frame=projectVariantCatalog(raw),stamp=clock(now);if(!frame||frame.checked_at>stamp+60||stamp-frame.checked_at>60||frame.products.some(row=>!row.cost_catalog)||itemId!==null&&(frame.products.length!==1||frame.products[0].item_id!==itemId))fail('CATALOG_CLASSIFICATION_INVALID',503);
 let fenced=null;
 if(fence!==null){if(!array(fence,3)||fence.length!==frame.products.length)fail('CATALOG_CLASSIFICATION_REQUEST_INVALID',400);fenced=new Map();for(const row of fence){if(!exact(row,['item_id','write_token'])||!id(row.item_id)||fenced.has(row.item_id)||!frame.products.some(product=>product.item_id===row.item_id)||row.write_token!==null&&(typeof row.write_token!=='string'||!/^[a-f0-9-]{36}$/.test(row.write_token)))fail('CATALOG_CLASSIFICATION_REQUEST_INVALID',400);fenced.set(row.item_id,row.write_token);}}
 const db=await setup(env),stored=[];
 for(const product of frame.products){
  const sourceHash=await digest(product),single=product.selling_unit==='SINGLE_GARMENT',bindings=new Map(product.bindings.map(row=>[row.model_id,{...row,selling_unit:single?'SINGLE_GARMENT':'ONE_MALE_ONE_FEMALE_KIT',operator_confirmed:false,source:single?'CATALOG_SIZE_AXIS':'CATALOG_VARIATION_AXES',catalog_fingerprint:product.catalog_fingerprint}]));
  const unresolvedReason=product.diagnostic?.reasons?.length===1?product.diagnostic.reasons[0].code:'UNRECOGNIZED_VARIATION';
  const variants=product.cost_catalog.variants.map(row=>({model_id:row.model_id,payload:JSON.stringify({model_name:row.attributes.map(value=>value.value).join(' / ')||'Variação '+row.model_id,attributes:row.attributes,reason:bindings.has(row.model_id)?null:unresolvedReason,binding:bindings.get(row.model_id)||null})}));
  if(variants.some(row=>new TextEncoder().encode(row.payload).length>4096)||product.bindings.some(row=>{const variant=product.cost_catalog.variants.find(variant=>variant.model_id===row.model_id);return !variant||!bindingMatchesAttributes(bindings.get(row.model_id),variant.attributes);}))fail('CATALOG_CLASSIFICATION_INVALID');
  for(let attempt=0;attempt<4;attempt++){
   const current=await db.prepare('SELECT * FROM catalog_classification_jobs WHERE item_id=?').bind(product.item_id).first();if(current)checkedJob(current);
   if(fenced&&(current?.write_token??null)!==fenced.get(product.item_id))fail('CATALOG_CLASSIFICATION_CHANGED_RETRY',409);
   if(current?.checked_at>frame.checked_at)break;
   if(current?.checked_at===frame.checked_at&&current.source_hash!==sourceHash&&token===null&&!fenced)fail('CATALOG_CLASSIFICATION_CONFLICT',409);
   if(token===null&&current?.lease_token!==null&&current?.lease_token!==undefined&&current.lease_until>stamp)fail('CATALOG_CLASSIFICATION_LEASED',409);
   if(token!==null&&(current?.lease_token!==token||current.lease_until<=stamp))fail('CATALOG_CLASSIFICATION_LEASE_LOST',409);
   const changed=!current||current.source_hash!==sourceHash||changeToken!==null,status=product.bindings.length===variants.length&&variants.length?'MATCHED':product.bindings.length?'PARTIAL':'REVIEW',reason=status==='MATCHED'?null:unresolvedReason;
   const guard=current?'item_id=? AND checked_at IS ? AND source_hash IS ? AND lease_token IS ? AND write_token IS ?':'item_id=?';
   const guardArgs=current?[product.item_id,current.checked_at,current.source_hash,current.lease_token,current.write_token]:[product.item_id];
   if(!current){await db.prepare("INSERT OR IGNORE INTO catalog_classification_jobs(item_id,status,next_attempt_at) VALUES(?,'QUEUED',?)").bind(product.item_id,stamp).run();continue;}
   const writeToken=crypto.randomUUID();
   const mutation=db.prepare('UPDATE catalog_classification_jobs SET status=?,product_name=?,reason=?,checked_at=?,catalog_fingerprint=?,source_hash=?,model_count=?,resolved_count=?,next_attempt_at=?,failure_count=0,lease_token=NULL,lease_until=NULL,write_token=? WHERE '+guard+' AND NOT EXISTS(SELECT 1 FROM production_cost_catalog WHERE item_id=? AND checked_at>?) AND EXISTS(SELECT 1 FROM catalog_classification_state WHERE id=1 AND revision+?<=2147483646)'+(token!==null?' AND EXISTS(SELECT 1 FROM catalog_classification_state WHERE id=1 AND lease_token=? AND lease_until>?)':'')).bind(status,product.cost_catalog.product_name,reason,frame.checked_at,product.catalog_fingerprint,sourceHash,variants.length,product.bindings.length,frame.checked_at+86400,writeToken,...guardArgs,product.item_id,frame.checked_at,Number(changed),...(token!==null?[token,stamp]:[]));
   const proof='EXISTS(SELECT 1 FROM catalog_classification_jobs WHERE item_id=? AND checked_at=? AND source_hash=? AND write_token=? AND lease_token IS NULL)',proofArgs=[product.item_id,frame.checked_at,sourceHash,writeToken];
   const statements=[mutation,
    db.prepare('UPDATE catalog_classification_state SET revision=revision+? WHERE id=1 AND changes()=1 AND revision<2147483647').bind(Number(changed)),
    db.prepare('DELETE FROM catalog_classification_variants WHERE item_id=? AND '+proof).bind(product.item_id,...proofArgs),
    db.prepare("INSERT INTO catalog_classification_variants(item_id,model_id,payload) SELECT ?,json_extract(value,'$.model_id'),json_extract(value,'$.payload') FROM json_each(?) WHERE "+proof).bind(product.item_id,JSON.stringify(variants),...proofArgs),
    db.prepare('INSERT INTO production_cost_catalog(item_id,catalog_fingerprint,payload,checked_at) SELECT ?,?,?,? WHERE '+proof+' ON CONFLICT(item_id) DO UPDATE SET catalog_fingerprint=excluded.catalog_fingerprint,payload=excluded.payload,checked_at=excluded.checked_at WHERE production_cost_catalog.checked_at<=excluded.checked_at').bind(product.item_id,product.catalog_fingerprint,JSON.stringify(product.cost_catalog),frame.checked_at,...proofArgs),
    db.prepare('DELETE FROM catalog_classification_source_diagnostics WHERE item_id=? AND '+proof).bind(product.item_id,...proofArgs),
    db.prepare('DELETE FROM catalog_classification_changes WHERE item_id=? AND change_token=? AND '+proof).bind(product.item_id,changeToken,...proofArgs),
    db.prepare('INSERT INTO catalog_classification_audit(item_id,checked_at,outcome,reason,revision) SELECT ?,?,?,?,revision FROM catalog_classification_state WHERE id=1 AND '+proof).bind(product.item_id,stamp,status,reason,...proofArgs),
    db.prepare('DELETE FROM catalog_classification_audit WHERE id NOT IN (SELECT id FROM catalog_classification_audit ORDER BY id DESC LIMIT 1000)'),
   ];
   const result=await db.batch(statements);if(result[0]?.meta?.changes===1){stored.push(product.item_id);break;}
   if(fenced)fail('CATALOG_CLASSIFICATION_CHANGED_RETRY',409);
   if(attempt===3)fail('CATALOG_CLASSIFICATION_CHANGED_RETRY',409);
  }
 }
 return {processed:stored};
}
export async function storeCatalogClassificationFrame(env,frame,options={}){try{return await storeFrame(env,frame,options);}catch(error){if(error instanceof CatalogClassificationError)throw error;fail('CATALOG_CLASSIFICATION_UNAVAILABLE');}}

export async function runCatalogClassifications(env,getCatalog,{now=()=>Date.now(),maxProducts=3,canRun=async()=>true,itemIds=null}={}){
 if(typeof getCatalog!=='function'||typeof now!=='function'||typeof canRun!=='function'||!integer(maxProducts,1,3)||itemIds!==null&&(!array(itemIds,90)||!itemIds.every(value=>id(value))||new Set(itemIds).size!==itemIds.length))fail('CATALOG_CLASSIFICATION_OPTIONS_INVALID',400);
 const db=await setup(env),start=clock(now),deadline=start+150,token=crypto.randomUUID(),processed=[],failed=[];
 const output=async status=>({status,processed,failed,state:await readCatalogClassificationState(env,{}, {now})});
 if(!await canRun())return output('PAUSED');
 const locked=await db.prepare('UPDATE catalog_classification_state SET lease_token=?,lease_until=? WHERE id=1 AND (lease_token IS NULL OR lease_until<=?)').bind(token,start+180,start).run();
 if(locked?.meta?.changes!==1)return output('LEASED');
 let status='IDLE';
 try{
  for(let step=0;step<maxProducts;step++){
   const at=clock(now);if(at+45>deadline)break;if(!await canRun()){status='PAUSED';break;}
   const row=await db.prepare("SELECT * FROM catalog_classification_jobs WHERE next_attempt_at<=? AND (lease_token IS NULL OR lease_until<=?)"+(itemIds!==null?' AND item_id IN (SELECT value FROM json_each(?))':'')+" ORDER BY CASE WHEN reason='CATALOG_SOLD_MODEL_MISSING' THEN 0 WHEN last_attempt_at IS NULL THEN 1 ELSE 2 END,next_attempt_at,length(item_id),item_id LIMIT 1").bind(at,at,...(itemIds!==null?[JSON.stringify(itemIds)]:[])).first();if(!row)break;checkedJob(row);
   const claimed=await db.prepare("UPDATE catalog_classification_jobs SET status='RUNNING',last_attempt_at=?,lease_token=?,lease_until=? WHERE item_id=? AND next_attempt_at<=? AND (lease_token IS NULL OR lease_until<=?) AND EXISTS(SELECT 1 FROM catalog_classification_state WHERE id=1 AND lease_token=? AND lease_until>?)").bind(at,token,start+180,row.item_id,at,at,token,at).run();if(claimed?.meta?.changes!==1)continue;
   try{
    const change=await db.prepare('SELECT change_token FROM catalog_classification_changes WHERE item_id=?').bind(row.item_id).first();
    const frame=await getCatalog(env,{item_ids:[row.item_id],selling_unit:'AUTO',include_cost_catalog:true},{timeoutMs:45000});
    const unavailable=projectVariantCatalogFailure(frame);
    if(unavailable)throw Object.assign(new CatalogClassificationError('CATALOG_CLASSIFICATION_SOURCE_UNAVAILABLE'),{catalog_reason:sourceFailureReason(unavailable),catalog_diagnostic:unavailable.diagnostic});
    const result=await storeFrame(env,frame,{now,token,itemId:row.item_id,changeToken:change?.change_token??null});if(result.processed.length)processed.push(row.item_id);else fail('CATALOG_CLASSIFICATION_STALE_RESPONSE');
   }catch(error){
    const sourceReason=Object.getOwnPropertyDescriptor(error||{},'catalog_reason')?.value;
    const finish=clock(now),failureCount=Math.min(row.failure_count+1,1000000),reason=error instanceof CatalogClassificationError&&error.message==='CATALOG_CLASSIFICATION_SOURCE_UNAVAILABLE'&&reasons.includes(sourceReason)?sourceReason:error instanceof CatalogClassificationError&&error.message==='CATALOG_CLASSIFICATION_CONFLICT'?'CATALOG_CONFLICT':error instanceof CatalogClassificationError&&error.message==='CATALOG_CLASSIFICATION_INVALID'?'CATALOG_INVALID':error instanceof CatalogClassificationError&&error.message==='CATALOG_CLASSIFICATION_STALE_RESPONSE'?'CATALOG_STALE_RESPONSE':'CATALOG_UNAVAILABLE';
    const sourceDiagnostic=projectVariantCatalogFailure({schema:'variant_catalog_v1',status:'UNAVAILABLE',diagnostic:Object.getOwnPropertyDescriptor(error||{},'catalog_diagnostic')?.value})?.diagnostic;
    const diagnosticGuard="EXISTS(SELECT 1 FROM catalog_classification_jobs WHERE item_id=? AND status='RETRY_WAIT' AND reason=? AND failure_count=? AND last_attempt_at=? AND lease_token IS NULL) AND EXISTS(SELECT 1 FROM catalog_classification_state WHERE id=1 AND lease_token=?)",diagnosticArgs=[row.item_id,reason,failureCount,at,token];
    const result=await db.batch([
     db.prepare("UPDATE catalog_classification_jobs SET status='RETRY_WAIT',reason=?,failure_count=?,next_attempt_at=?,lease_token=NULL,lease_until=NULL WHERE item_id=? AND lease_token=? AND EXISTS(SELECT 1 FROM catalog_classification_state WHERE id=1 AND lease_token=?)").bind(reason,failureCount,finish+Math.min(1800,300*2**Math.min(failureCount-1,3)),row.item_id,token,token),
     db.prepare("INSERT INTO catalog_classification_audit(item_id,checked_at,outcome,reason,revision) SELECT ?,?,'RETRY_WAIT',?,revision FROM catalog_classification_state WHERE id=1 AND changes()=1").bind(row.item_id,finish,reason),
     db.prepare('DELETE FROM catalog_classification_source_diagnostics WHERE item_id=? AND '+diagnosticGuard).bind(row.item_id,...diagnosticArgs),
     ...(sourceDiagnostic?[db.prepare('INSERT INTO catalog_classification_source_diagnostics(item_id,diagnostic,checked_at,failure_count) SELECT ?,?,?,? WHERE '+diagnosticGuard).bind(row.item_id,JSON.stringify(sourceDiagnostic),finish,failureCount,...diagnosticArgs)]:[]),
     db.prepare('DELETE FROM catalog_classification_audit WHERE id NOT IN (SELECT id FROM catalog_classification_audit ORDER BY id DESC LIMIT 1000)'),
    ]);if(result[0]?.meta?.changes===1)failed.push(row.item_id);
   }
   status='PROGRESSED';
  }
 }finally{await db.prepare('UPDATE catalog_classification_state SET lease_token=NULL,lease_until=NULL WHERE id=1 AND lease_token=?').bind(token).run();}
 return output(status);
}

export async function readCatalogClassificationState(env,input={}, {now=()=>Date.now()}={}){
 if(!plain(input)||Reflect.ownKeys(input).some(key=>!['item_ids','limit','offset'].includes(key))||!Reflect.ownKeys(input).every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(input,key)||{},'value')))fail('CATALOG_CLASSIFICATION_REQUEST_INVALID',400);
 const ids=Object.hasOwn(input,'item_ids')?idsInput(input.item_ids):null,limit=input.limit??20,offset=input.offset??0,stamp=clock(now);if(!integer(limit,1,100)||!integer(offset,0,3000))fail('CATALOG_CLASSIFICATION_REQUEST_INVALID',400);
 const db=await setup(env),filter=ids!==null?' WHERE item_id IN (SELECT value FROM json_each(?))':'',args=ids!==null?[JSON.stringify(ids)]:[];
 const result=await db.batch([
  db.prepare('SELECT revision FROM catalog_classification_state WHERE id=1'),
  db.prepare("SELECT COUNT(*) AS total,SUM(status='QUEUED') AS queued,SUM(status='RUNNING') AS running,SUM(status='MATCHED') AS matched,SUM(status='PARTIAL') AS partial,SUM(status='REVIEW') AS review,SUM(status='RETRY_WAIT') AS retry_wait,SUM(next_attempt_at<=? AND (lease_token IS NULL OR lease_until<=?)) AS due,MIN(next_attempt_at) AS next_due_at FROM catalog_classification_jobs"+filter).bind(stamp,stamp,...args),
  db.prepare('SELECT *,(SELECT changed_at FROM catalog_classification_changes x WHERE x.item_id=catalog_classification_jobs.item_id) AS metadata_changed_at FROM catalog_classification_jobs'+filter+' ORDER BY length(item_id),item_id LIMIT ? OFFSET ?').bind(...args,limit,offset),
  db.prepare('SELECT item_id,model_id,payload FROM catalog_classification_variants WHERE item_id IN (SELECT item_id FROM catalog_classification_jobs'+filter+' ORDER BY length(item_id),item_id LIMIT ? OFFSET ?) ORDER BY length(item_id),item_id,length(model_id),model_id LIMIT 1001').bind(...args,limit,offset),
 ]);
 const revision=result[0]?.results?.[0]?.revision;if(!integer(revision,1,2147483647))fail('CATALOG_CLASSIFICATION_STORAGE_INVALID');const aggregate=result[1]?.results?.[0];if(!aggregate||!integer(aggregate.total,0))fail('CATALOG_CLASSIFICATION_STORAGE_INVALID');
 const counts=Object.fromEntries(['total','queued','running','matched','partial','review','retry_wait','due'].map(key=>[key,aggregate[key]??0]));if(Object.values(counts).some(value=>!integer(value,0))||['queued','running','matched','partial','review','retry_wait'].reduce((sum,key)=>sum+counts[key],0)!==counts.total||counts.due>counts.total)fail('CATALOG_CLASSIFICATION_STORAGE_INVALID');
 const products=result[2].results.map(row=>({...productMetadata(row),variants:[],variants_complete:row.model_count===0})),byId=new Map(products.map(row=>[row.item_id,row]));let limited=false;
 if(products.length){
  const data=result[3];
  limited=data.results.length>1000;const jobs=new Map(result[2].results.map(row=>[row.item_id,row]));for(const row of data.results.slice(0,1000)){const value=checkedVariant(row,jobs.get(row.item_id)),{item_id,binding,...variant}=value;byId.get(item_id).variants.push(variant);}
  for(const product of products)product.variants_complete=product.variants.length===product.model_count;
 }
 return {schema:'catalog_classification_state_v1',revision,counts,products,limit,offset,more:offset+products.length<counts.total,next_due_at:aggregate.next_due_at??null,variants_limit_reached:limited};
}
