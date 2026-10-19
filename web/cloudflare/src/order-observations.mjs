import {orderItems} from './order-items.mjs';
import {validateVariantBindings,variantMarginReference} from './variant-bindings.mjs';

// An observation is an explicit partial-day record, never an order ledger or profit claim.
export const OBSERVATION_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS order_observations (id TEXT PRIMARY KEY NOT NULL, saved_at TEXT NOT NULL, payload TEXT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS order_observations_saved_at_id ON order_observations(saved_at DESC,id DESC)`,
];
export class ObservationError extends Error {
 constructor(code,status=400){super(code);this.status=status;}
}
const observationEncoder=new TextEncoder();
const observationMaximumBytes=786432;
const observationIdPattern=/^[a-f0-9]{64}$/;
function observationAssert(condition,code='OBSERVATION_INVALID_SNAPSHOT',status=503){if(!condition)throw new ObservationError(code,status);}
function observationObject(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
function observationKeys(value,keys){return observationObject(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
function observationCanonical(value){
 if(Array.isArray(value))return '['+value.map(observationCanonical).join(',')+']';
 if(observationObject(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+observationCanonical(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
function observationInteger(value,min=0,max=Number.MAX_SAFE_INTEGER){return Number.isSafeInteger(value)&&value>=min&&value<=max;}
function observationUtc(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;}
function observationCompareIds(a,b){return a.length-b.length||(a<b?-1:a>b?1:0);}
function observationSortRows(rows){return [...rows].sort((a,b)=>observationCompareIds(a.item_id,b.item_id)||observationCompareIds(a.model_id,b.model_id)||(a.order_status<b.order_status?-1:a.order_status>b.order_status?1:0));}
function observationFrame(raw,now){
 const frame=orderItems(raw,now);
 observationAssert(frame.status==='AVAILABLE','OBSERVATION_SOURCE_UNAVAILABLE');
 const {snapshot_age_seconds,...snapshot}=frame;
 snapshot.rows=observationSortRows(snapshot.rows);
 return snapshot;
}
function observationSettings(row,exact=false){
 observationAssert(observationObject(row)&&observationInteger(row.revision,1));
 const value=exact?row.values:JSON.parse(row.payload);
 const keys=['regular_cents','mixed_cents','plus_cents','ad_share_percent'];
 observationAssert(observationObject(value)&&(!exact||observationKeys(value,keys))&&keys.every(key=>Object.hasOwn(value,key)));
 for(const key of keys.slice(0,3))observationAssert(observationInteger(value[key],1,1000000));
 observationAssert(observationInteger(value.ad_share_percent,1,100));
 if(exact)observationAssert(observationKeys(row,['revision','values']));
 return {revision:row.revision,values:Object.fromEntries(keys.map(key=>[key,value[key]]))};
}
function observationBindings(row,frame,exact=false){
 observationAssert(observationObject(row)&&observationInteger(row.revision,1));
 if(exact)observationAssert(observationKeys(row,['revision','bindings']));
 const all=validateVariantBindings(exact?row.bindings:JSON.parse(row.payload));
 const relevant=new Set(frame.rows.map(value=>value.item_id+':'+value.model_id));
 const bindings=all.filter(value=>relevant.has(value.item_id+':'+value.model_id));
 if(exact)observationAssert(bindings.length===all.length);
 return {revision:row.revision,bindings};
}
function observationContent(frame,settings,bindings){
 return {schema:'order_observation_v1',source_snapshot:frame,settings_snapshot:settings,bindings_snapshot:bindings,
  margin_reference:variantMarginReference(frame,bindings,settings),coverage:'PARTIAL_DAY_SNAPSHOT',ads_execution:'LOCKED',economic_status:'UNKNOWN',hermes_context:'NOT_ATTACHED'};
}
async function observationHash(content){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',observationEncoder.encode(observationCanonical(content))))].map(value=>value.toString(16).padStart(2,'0')).join('');}
async function observationValidateRow(row){
 try{
  observationAssert(observationObject(row)&&typeof row.payload==='string'&&observationEncoder.encode(row.payload).length<=observationMaximumBytes);
  const value=JSON.parse(row.payload);
  observationAssert(observationKeys(value,['id','schema','saved_at','source_snapshot','settings_snapshot','bindings_snapshot','margin_reference','coverage','ads_execution','economic_status','hermes_context']));
  observationAssert(observationIdPattern.test(value.id)&&value.id===row.id&&observationUtc(value.saved_at)&&value.saved_at===row.saved_at);
  const cutoff=value.source_snapshot?.through_at;
  observationAssert(typeof cutoff==='string'&&Number.isFinite(Date.parse(cutoff)));
  // Validate against the retained source cutoff; today's clock cannot invalidate history.
  const frame=observationFrame(value.source_snapshot,new Date(cutoff));
  observationAssert(observationCanonical(frame)===observationCanonical(value.source_snapshot));
  const saved=new Date(value.saved_at),savedDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(saved);
  observationAssert(frame.date===savedDay&&Date.parse(cutoff)<=saved.getTime()+60000);
  const settings=observationSettings(value.settings_snapshot,true),bindings=observationBindings(value.bindings_snapshot,frame,true);
  const content=observationContent(frame,settings,bindings);
  observationAssert(observationCanonical({...content,id:value.id,saved_at:value.saved_at})===observationCanonical(value));
  observationAssert(await observationHash(content)===value.id);
  return {id:value.id,saved_at:value.saved_at,...content};
 }catch(error){if(error instanceof ObservationError)throw new ObservationError('OBSERVATION_INVALID_SNAPSHOT',503);throw new ObservationError('OBSERVATION_INVALID_SNAPSHOT',503);}
}

export async function captureObservation(env,getOrderItems,actor,now){
 observationAssert(actor===undefined||actor==='admin','OBSERVATION_ACTOR_INVALID',400);
 observationAssert(now===undefined||(now instanceof Date&&Number.isFinite(now.getTime())),'OBSERVATION_SOURCE_UNAVAILABLE');
 let raw;
 try{observationAssert(typeof getOrderItems==='function','OBSERVATION_SOURCE_UNAVAILABLE');raw=await getOrderItems(env);}catch{throw new ObservationError('OBSERVATION_SOURCE_UNAVAILABLE',503);}
 observationAssert(!raw?.diagnostic,'OBSERVATION_SOURCE_UNAVAILABLE');
 const frame=observationFrame(raw,now??new Date());
 try{
  const context=await env.ADMIN_DB.batch([
   env.ADMIN_DB.prepare('SELECT revision,payload FROM admin_settings WHERE id=1'),
   env.ADMIN_DB.prepare('SELECT revision,payload FROM variant_bindings_state WHERE id=1'),
  ]);
  observationAssert(Array.isArray(context)&&context.length===2&&context.every(value=>Array.isArray(value.results)&&value.results.length===1));
  const settings=observationSettings(context[0].results[0]),bindings=observationBindings(context[1].results[0],frame);
  const content=observationContent(frame,settings,bindings),id=await observationHash(content),savedMoment=now??new Date();
  observationAssert(frame.date===new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(savedMoment),'OBSERVATION_SOURCE_UNAVAILABLE');
  const saved_at=savedMoment.toISOString();
  const payload=JSON.stringify({id,saved_at,...content});
  observationAssert(observationEncoder.encode(payload).length<=observationMaximumBytes,'OBSERVATION_TOO_LARGE');
  const result=await env.ADMIN_DB.prepare('INSERT OR IGNORE INTO order_observations(id,saved_at,payload) VALUES(?,?,?)').bind(id,saved_at,payload).run();
  observationAssert(result?.meta?.changes===0||result?.meta?.changes===1);
  return {observation:await readObservation(env,id),deduplicated:result.meta.changes===0};
 }catch(error){if(error instanceof ObservationError)throw error;throw new ObservationError('OBSERVATION_UNAVAILABLE',503);}
}

function observationEncodeCursor(row){return btoa(JSON.stringify({saved_at:row.saved_at,id:row.id})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function observationDecodeCursor(value){
 try{
  observationAssert(typeof value==='string'&&value.length>0&&value.length<=256&&/^[A-Za-z0-9_-]+$/.test(value),'OBSERVATION_CURSOR_INVALID',400);
  const decoded=JSON.parse(atob(value.replaceAll('-','+').replaceAll('_','/')));
  observationAssert(observationKeys(decoded,['saved_at','id'])&&observationUtc(decoded.saved_at)&&observationIdPattern.test(decoded.id)&&observationEncodeCursor(decoded)===value,'OBSERVATION_CURSOR_INVALID',400);
  return decoded;
 }catch{throw new ObservationError('OBSERVATION_CURSOR_INVALID',400);}
}
// SQLite projects only fixed scalar metadata; listing never transfers or hashes full records.
const observationListFields={
 payload_id:'id',payload_saved_at:'saved_at',schema:'schema',coverage:'coverage',ads_execution:'ads_execution',economic_status:'economic_status',hermes_context:'hermes_context',
 source_schema:'source_snapshot.schema',source_status:'source_snapshot.status',shop_id:'source_snapshot.shop_id',timezone:'source_snapshot.timezone',day_partial:'source_snapshot.day_partial',pagination_complete:'source_snapshot.pagination_complete',
 date:'source_snapshot.date',through_at:'source_snapshot.through_at',catalog_units:'source_snapshot.catalog_units',orders_in_api_window:'source_snapshot.orders_in_api_window',
 settings_revision:'settings_snapshot.revision',bindings_revision:'bindings_snapshot.revision',reference_settings_revision:'margin_reference.settings_revision',reference_bindings_revision:'margin_reference.bindings_revision',
 known_subset_cents:'margin_reference.known_subset_cents',total_cents:'margin_reference.total_cents',mapped_quantity:'margin_reference.mapped_quantity',unmapped_quantity:'margin_reference.unmapped_quantity',
 reference_scope:'margin_reference.status_scope',reference_currency:'margin_reference.currency',reference_stage:'margin_reference.margin_stage',reference_economic_status:'margin_reference.economic_status',
};
const observationListSelect='SELECT id,saved_at,length(CAST(payload AS BLOB)) AS payload_bytes,'+Object.entries(observationListFields).map(([key,path])=>`json_extract(payload,'$.${path}') AS ${key}`).join(',')+' FROM order_observations';
function observationListRow(value){
 observationAssert(observationObject(value)&&observationIdPattern.test(value.id)&&value.id===value.payload_id&&observationUtc(value.saved_at)&&value.saved_at===value.payload_saved_at&&observationInteger(value.payload_bytes,1,observationMaximumBytes));
 const expected={schema:'order_observation_v1',coverage:'PARTIAL_DAY_SNAPSHOT',ads_execution:'LOCKED',economic_status:'UNKNOWN',hermes_context:'NOT_ATTACHED',source_schema:'shop_order_items_v1',source_status:'AVAILABLE',shop_id:1178167501,timezone:'America/Sao_Paulo',day_partial:1,pagination_complete:1,reference_scope:'ALL_RETURNED_STATUSES_REFERENCE_ONLY',reference_currency:'BRL',reference_stage:'AFTER_FEES_AND_PRODUCT_COST_BEFORE_ADS',reference_economic_status:'UNKNOWN'};
 observationAssert(Object.entries(expected).every(([key,item])=>value[key]===item));
 observationAssert(typeof value.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value.date)&&Number.isFinite(Date.parse(value.date+'T00:00:00.000Z'))&&new Date(value.date+'T00:00:00.000Z').toISOString().slice(0,10)===value.date);
 observationAssert(typeof value.through_at==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?-03:00$/.test(value.through_at)&&value.through_at.slice(0,10)===value.date&&Number.isFinite(Date.parse(value.through_at))&&Date.parse(value.through_at)<=Date.parse(value.saved_at)+60000);
 observationAssert(new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.saved_at))===value.date);
 observationAssert(observationInteger(value.catalog_units)&&observationInteger(value.orders_in_api_window,0,2000)&&value.catalog_units>=value.orders_in_api_window&&(value.orders_in_api_window!==0||value.catalog_units===0));
 observationAssert(observationInteger(value.settings_revision,1)&&observationInteger(value.bindings_revision,1)&&value.reference_settings_revision===value.settings_revision&&value.reference_bindings_revision===value.bindings_revision);
 observationAssert(['known_subset_cents','mapped_quantity','unmapped_quantity'].every(key=>observationInteger(value[key]))&&value.mapped_quantity+value.unmapped_quantity===value.catalog_units&&Number.isSafeInteger(value.mapped_quantity+value.unmapped_quantity));
 observationAssert((value.mapped_quantity===0?value.known_subset_cents===0:value.known_subset_cents>0)&&(value.unmapped_quantity>0?value.total_cents===null:value.total_cents===value.known_subset_cents));
 const keys=['id','saved_at','date','through_at','catalog_units','orders_in_api_window','settings_revision','bindings_revision','known_subset_cents','total_cents','unmapped_quantity','mapped_quantity'];
 return Object.fromEntries(keys.map(key=>[key,value[key]]));
}
export async function listObservations(env,params=new URLSearchParams()){
 observationAssert(params instanceof URLSearchParams,'OBSERVATION_QUERY_INVALID',400);
 for(const key of params.keys())observationAssert(['cursor','limit'].includes(key)&&params.getAll(key).length===1,'OBSERVATION_QUERY_INVALID',400);
 const limitText=params.get('limit');
 observationAssert(limitText===null||/^(?:[1-9]|1[0-9]|20)$/.test(limitText),'OBSERVATION_QUERY_INVALID',400);
 const limit=limitText===null?20:Number(limitText),cursor=params.has('cursor')?observationDecodeCursor(params.get('cursor')):null;
 try{
  const statement=cursor?env.ADMIN_DB.prepare(observationListSelect+' WHERE saved_at<? OR (saved_at=? AND id<?) ORDER BY saved_at DESC,id DESC LIMIT ?').bind(cursor.saved_at,cursor.saved_at,cursor.id,limit+1):env.ADMIN_DB.prepare(observationListSelect+' ORDER BY saved_at DESC,id DESC LIMIT ?').bind(limit+1);
  const result=await statement.all();
  observationAssert(Array.isArray(result.results)&&result.results.length<=limit+1);
  const entries=result.results.map(observationListRow),rows=entries.slice(0,limit);
  return {rows,next_cursor:entries.length>limit?observationEncodeCursor(rows[rows.length-1]):null};
 }catch(error){if(error instanceof ObservationError)throw error;throw new ObservationError('OBSERVATION_UNAVAILABLE',503);}
}
export async function readObservation(env,id){
 observationAssert(typeof id==='string'&&observationIdPattern.test(id),'OBSERVATION_ID_INVALID',400);
 try{
  const row=await env.ADMIN_DB.prepare('SELECT id,saved_at,payload FROM order_observations WHERE id=?').bind(id).first();
  observationAssert(row,'OBSERVATION_NOT_FOUND',404);
  return await observationValidateRow(row);
 }catch(error){if(error instanceof ObservationError)throw error;throw new ObservationError('OBSERVATION_UNAVAILABLE',503);}
}
