import {createDtfEngine} from './dtf-layout.mjs';
import {projectProductionOrdersFrame,productionOrdersRequestMatches} from '../../finance/src/production-orders-frame.mjs';
import {validateVariantBindings} from './variant-bindings.mjs';

// Production is a private operational ledger. It never mutates a Shopee order
// and never feeds image consumption back into a full-unit manufacturing cost.
export class ProductionDtfError extends Error {
 constructor(code,status=400,issues){super(code);this.status=status;if(issues)this.issues=issues;}
}
const dtfFail=(code,status=400,issues)=>{throw new ProductionDtfError(code,status,issues);};
const dtfEngine=createDtfEngine();
const dtfPlain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const dtfExact=(value,keys)=>dtfPlain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const dtfArray=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,i)=>Object.getOwnPropertyDescriptor(value,String(i))).every(row=>row&&Object.hasOwn(row,'value'));
const dtfInt=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const dtfHashText=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const dtfUuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const dtfEligible=status=>['READY_TO_SHIP','PROCESSED','RETRY_SHIP'].includes(status);
const dtfNoPrint=sku=>/^sem[-_ ]estampa$/i.test(sku.normalize('NFC'));
const dtfEncoder=new TextEncoder();
const dtfDefaults={film_width_mm:570,max_length_mm:500,gap_mm:5,margin_mm:5,dpi:300,allow_rotate:false};
export const PRODUCTION_DTF_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS production_dtf_settings(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,values_json TEXT NOT NULL,updated_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS production_dtf_settings_audit(revision INTEGER PRIMARY KEY,values_json TEXT NOT NULL,actor TEXT NOT NULL,created_at INTEGER NOT NULL)`,
 `INSERT OR IGNORE INTO production_dtf_settings(id,revision,values_json,updated_at) SELECT 1,1,'${JSON.stringify(dtfDefaults)}',CAST(strftime('%s','now') AS INTEGER) WHERE NOT EXISTS(SELECT 1 FROM production_dtf_settings_audit)`,
 `INSERT INTO production_dtf_settings_audit(revision,values_json,actor,created_at) SELECT revision,values_json,'operator-confirmed-film-57cm',updated_at FROM production_dtf_settings WHERE changes()=1 AND id=1`,
 `CREATE TABLE IF NOT EXISTS production_dtf_orders(order_id TEXT PRIMARY KEY,status TEXT NOT NULL,create_time INTEGER NOT NULL,update_time INTEGER NOT NULL,checked_at INTEGER NOT NULL,source_hash TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS production_dtf_lines(unit_key TEXT PRIMARY KEY,order_id TEXT NOT NULL,line_key TEXT NOT NULL,payload TEXT NOT NULL,source_hash TEXT NOT NULL,checked_at INTEGER NOT NULL,missing INTEGER NOT NULL DEFAULT 0 CHECK(missing IN(0,1)),produced_batch_id TEXT,UNIQUE(order_id,line_key))`,
 `CREATE INDEX IF NOT EXISTS production_dtf_lines_order ON production_dtf_lines(order_id)`,
 `CREATE TABLE IF NOT EXISTS production_dtf_batches(id TEXT PRIMARY KEY,request_hash TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN('PREPARED','EXPORTED','PRODUCED','VOID')),payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=1048576),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,actor TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS production_dtf_reservations(unit_key TEXT PRIMARY KEY,batch_id TEXT NOT NULL,source_hash TEXT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS production_dtf_reservations_batch ON production_dtf_reservations(batch_id)`,
 `CREATE TABLE IF NOT EXISTS production_dtf_audit(id TEXT PRIMARY KEY,batch_id TEXT NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,created_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS production_dtf_guard(id INTEGER PRIMARY KEY CHECK(id=1),ok INTEGER NOT NULL CHECK(ok=1))`,
 `INSERT OR IGNORE INTO production_dtf_guard(id,ok) VALUES(1,1)`,
 `CREATE TABLE IF NOT EXISTS production_dtf_sync_state(id INTEGER PRIMARY KEY CHECK(id=1),lease_token TEXT,lease_expires_at INTEGER,last_sync_at INTEGER,history_next_date TEXT)`,
 `INSERT OR IGNORE INTO production_dtf_sync_state(id) VALUES(1)`,
];
const dtfReady=new WeakMap();
async function dtfSetup(env){
 const db=env?.ADMIN_DB;if(!db?.prepare||!db?.batch)dtfFail('DTF_STORAGE_CONFIGURATION',503);
 if(!dtfReady.has(db))dtfReady.set(db,db.batch(PRODUCTION_DTF_SCHEMA.map(sql=>db.prepare(sql))).catch(()=>{dtfReady.delete(db);dtfFail('DTF_STORAGE_UNAVAILABLE',503);}));
 await dtfReady.get(db);return db;
}
function dtfClock(now){let value;try{value=now();}catch{dtfFail('DTF_CLOCK_INVALID',503);}if(!dtfInt(value,1,9999999999999))dtfFail('DTF_CLOCK_INVALID',503);return Math.floor(value/1000);}
function dtfActor(actor){if(typeof actor!=='string'||!actor.trim()||actor.length>256||/[\u0000-\u001f\u007f-\u009f]/.test(actor))dtfFail('DTF_ACTOR_INVALID');return actor;}
async function dtfHash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',dtfEncoder.encode(typeof value==='string'?value:JSON.stringify(value)))),byte=>byte.toString(16).padStart(2,'0')).join('');}
function dtfSettings(row){try{if(!row||!dtfInt(row.revision,1,2147483646)||!dtfInt(row.updated_at,1,9999999999))throw Error();return {revision:row.revision,values:dtfEngine.validateSettings(JSON.parse(row.values_json))};}catch{dtfFail('DTF_SETTINGS_STORAGE_INVALID',503);}}
function dtfEngineCall(method,input){try{return dtfEngine[method](input);}catch(error){if(typeof error?.message==='string'&&/^DTF_[A-Z_]+$/.test(error.message))dtfFail(error.message,400,error.issues);dtfFail('DTF_PLAN_INVALID');}}
const dtfLineSelect=`SELECT l.*,o.status,o.create_time,o.update_time,r.batch_id AS reserved_batch_id,r.source_hash AS reserved_source_hash FROM production_dtf_lines l JOIN production_dtf_orders o ON o.order_id=l.order_id LEFT JOIN production_dtf_reservations r ON r.unit_key=l.unit_key`;
const dtfGuard=(db,condition,...args)=>db.prepare('INSERT INTO production_dtf_guard(id,ok) VALUES(1,CASE WHEN '+condition+' THEN 1 ELSE 0 END) ON CONFLICT(id) DO UPDATE SET ok=excluded.ok').bind(...args);
function dtfLine(row){
 try{const value=JSON.parse(row.payload);if(!dtfExact(value,['item_id','model_id','sku','quantity','model_name','requires_pair'])||!dtfHashText(row.unit_key)||!dtfHashText(row.source_hash)||!dtfInt(row.checked_at,1,9999999999)||!dtfInt(value.quantity,1,10000)||typeof value.requires_pair!=='boolean'||typeof value.sku!=='string'||typeof value.model_name!=='string')throw Error();
 const changedReservation=row.reserved_batch_id&&row.reserved_source_hash!==row.source_hash;
 return {unit_key:row.unit_key,order_id:row.order_id,line_key:row.line_key,...value,status:row.missing?'MISSING_LINE':row.status,production_state:changedReservation?'BLOCKED':row.produced_batch_id?'PRODUCED':row.missing||!dtfEligible(row.status)||dtfNoPrint(value.sku)?'BLOCKED':row.reserved_batch_id?'RESERVED':'PENDING',last_seen_at:row.checked_at};
 }catch{dtfFail('DTF_QUEUE_STORAGE_INVALID',503);}
}
function dtfBatch(row){
 try{const payload=JSON.parse(row.payload);if(!dtfUuid(row.id)||!['PREPARED','EXPORTED','PRODUCED','VOID'].includes(row.status)||!dtfInt(row.created_at,1,9999999999)||!dtfExact(payload,['layout','source_checked_at','settings_revision','units','artworks'])||!dtfInt(payload.source_checked_at,1,9999999999)||!dtfArray(payload.units,100)||!payload.units.length||!dtfArray(payload.artworks,300))throw Error();
 const plan=dtfEngine.plan({settings:payload.layout.settings,units:payload.units.map(({unit_key,sku,quantity,requires_pair})=>({unit_key,sku,quantity,requires_pair})),artworks:payload.artworks});
 if(JSON.stringify(plan)!==JSON.stringify(payload.layout))throw Error();return {id:row.id,status:row.status,created_at:row.created_at,layout:plan,source_checked_at:payload.source_checked_at};
 }catch{dtfFail('DTF_BATCH_STORAGE_INVALID',503);}
}
export async function readProductionDtf(env){
 const db=await dtfSetup(env),context=await db.batch([
 db.prepare('SELECT * FROM production_dtf_settings WHERE id=1'),
 db.prepare(dtfLineSelect+" ORDER BY (l.produced_batch_id IS NOT NULL),CASE WHEN r.batch_id IS NOT NULL THEN 0 WHEN l.missing=0 AND o.status IN('READY_TO_SHIP','PROCESSED','RETRY_SHIP') THEN 1 ELSE 2 END,o.create_time,l.unit_key LIMIT 1001"),
 db.prepare("SELECT * FROM production_dtf_batches ORDER BY (status IN('PRODUCED','VOID')),created_at DESC,id DESC LIMIT 101"),
 db.prepare('SELECT * FROM production_dtf_sync_state WHERE id=1'),
 db.prepare('SELECT COUNT(*) AS total FROM production_dtf_lines'),
 ]);
 const lines=context[1].results,allBatches=context[2].results,state=context[3].results[0];if(!state)dtfFail('DTF_STORAGE_UNAVAILABLE',503);
 // Explicit counters disclose a bounded read instead of silently losing work.
 return {settings:dtfSettings(context[0].results[0]),lines:lines.slice(0,1000).map(dtfLine),batches:allBatches.slice(0,100).map(dtfBatch),last_sync_at:state.last_sync_at,history_next_date:state.history_next_date,sync_status:state.lease_token?'RUNNING':'IDLE',queue_total:context[4].results[0].total,queue_limited:lines.length>1000,batches_limited:allBatches.length>100};
}
export async function saveProductionDtfSettings(env,body,actor,{now=()=>Date.now()}={}){
 if(!dtfExact(body,['revision','values'])||!dtfInt(body.revision,1,2147483645))dtfFail('DTF_SETTINGS_REVISION_REQUIRED');dtfActor(actor);
 const values=dtfEngineCall('validateSettings',body.values),db=await dtfSetup(env),stamp=dtfClock(now),raw=JSON.stringify(values);
 try{const saved=await db.batch([
  db.prepare('UPDATE production_dtf_settings SET revision=revision+1,values_json=?,updated_at=? WHERE id=1 AND revision=?').bind(raw,stamp,body.revision),
  db.prepare('INSERT INTO production_dtf_settings_audit(revision,values_json,actor,created_at) SELECT revision,values_json,?,updated_at FROM production_dtf_settings WHERE changes()=1 AND id=1 AND revision=?').bind(actor,body.revision+1),
 ]);if(saved[0].meta.changes!==1)dtfFail('DTF_SETTINGS_CHANGED_RELOAD',409);if(saved[1].meta.changes!==1)dtfFail('DTF_STORAGE_UNAVAILABLE',503);}catch(error){if(error instanceof ProductionDtfError)throw error;dtfFail('DTF_STORAGE_UNAVAILABLE',503);}
 return dtfSettings(await db.prepare('SELECT * FROM production_dtf_settings WHERE id=1').first());
}
async function dtfSource(env,getSource,input,now){
 if(typeof getSource!=='function')dtfFail('DTF_SOURCE_UNAVAILABLE',503);
 let raw;try{raw=await getSource(env,input);}catch{dtfFail('DTF_SOURCE_UNAVAILABLE',503);}
 const frame=projectProductionOrdersFrame(raw),stamp=dtfClock(now);
 if(!frame||!productionOrdersRequestMatches(input,frame)||frame.checked_at>stamp+10||stamp-frame.checked_at>60)dtfFail('DTF_SOURCE_UNAVAILABLE',503);return frame;
}
async function dtfBindings(db){
 try{const row=await db.prepare('SELECT payload FROM variant_bindings_state WHERE id=1').first();if(!row)dtfFail('DTF_BINDINGS_UNAVAILABLE',503);return new Map(validateVariantBindings(JSON.parse(row.payload)).map(value=>[value.item_id+':'+value.model_id,value.selling_unit==='ONE_MALE_ONE_FEMALE_KIT']));}
 catch(error){if(error instanceof ProductionDtfError)throw error;dtfFail('DTF_BINDINGS_UNAVAILABLE',503);}
}
async function dtfIngest(db,frame){
 const bindings=await dtfBindings(db),orders=[],lines=[];
 for(const order of frame.orders){
  const values=await Promise.all(order.lines.map(async line=>{const payload={item_id:line.item_id,model_id:line.model_id,sku:line.sku,quantity:line.quantity,model_name:line.model_name,requires_pair:bindings.get(line.line_key)===true};return {unit_key:await dtfHash([order.order_id,line.line_key]),line_key:line.line_key,payload:JSON.stringify(payload),source_hash:await dtfHash(payload),provider_hash:await dtfHash([line.item_id,line.model_id,line.sku,line.quantity,line.model_name])};}));
  // Local composition rules may change without any provider order update.
  // They invalidate an old batch through its line hash, not the provider clock.
  const sourceHash=await dtfHash({status:order.status,create_time:order.create_time,update_time:order.update_time,lines:values.map(value=>[value.line_key,value.provider_hash]).sort((a,b)=>a[0].localeCompare(b[0]))});
  // A later observed version cannot be replaced by an older response. A tie
  // with changed data remains at its first snapshot and blocks an export.
  orders.push({order_id:order.order_id,status:order.status,create_time:order.create_time,update_time:order.update_time,source_hash:sourceHash});
  lines.push(...values.map(value=>({...value,order_id:order.order_id,order_source_hash:sourceHash})));
 }
 if(!orders.length)return;
 const orderJson=JSON.stringify(orders),lineJson=JSON.stringify(lines);
 if(dtfEncoder.encode(lineJson).byteLength>1900000)dtfFail('DTF_QUEUE_IMPORT_LIMIT',409);
 // JSON rowsets keep a full thousand-order scan at three D1 statements, rather
 // than consuming one query per product or exceeding the binding limit.
 try{await db.batch([
  db.prepare("INSERT INTO production_dtf_orders(order_id,status,create_time,update_time,checked_at,source_hash) SELECT json_extract(value,'$.order_id'),json_extract(value,'$.status'),json_extract(value,'$.create_time'),json_extract(value,'$.update_time'),?,json_extract(value,'$.source_hash') FROM json_each(?) WHERE true ON CONFLICT(order_id) DO UPDATE SET status=CASE WHEN excluded.update_time=production_dtf_orders.update_time AND excluded.source_hash<>production_dtf_orders.source_hash THEN 'UNKNOWN' ELSE excluded.status END,create_time=excluded.create_time,update_time=excluded.update_time,checked_at=excluded.checked_at,source_hash=CASE WHEN excluded.update_time=production_dtf_orders.update_time AND excluded.source_hash<>production_dtf_orders.source_hash THEN '0000000000000000000000000000000000000000000000000000000000000000' ELSE excluded.source_hash END WHERE excluded.update_time>=production_dtf_orders.update_time AND excluded.checked_at>=production_dtf_orders.checked_at").bind(frame.checked_at,orderJson),
  db.prepare("UPDATE production_dtf_lines SET missing=1,checked_at=? WHERE EXISTS(SELECT 1 FROM json_each(?) j JOIN production_dtf_orders o ON o.order_id=json_extract(j.value,'$.order_id') WHERE production_dtf_lines.order_id=o.order_id AND o.checked_at=? AND o.source_hash=json_extract(j.value,'$.source_hash'))").bind(frame.checked_at,orderJson,frame.checked_at),
  db.prepare("INSERT INTO production_dtf_lines(unit_key,order_id,line_key,payload,source_hash,checked_at,missing) SELECT json_extract(j.value,'$.unit_key'),o.order_id,json_extract(j.value,'$.line_key'),json_extract(j.value,'$.payload'),json_extract(j.value,'$.source_hash'),?,0 FROM json_each(?) j JOIN production_dtf_orders o ON o.order_id=json_extract(j.value,'$.order_id') WHERE o.checked_at=? AND o.source_hash=json_extract(j.value,'$.order_source_hash') ON CONFLICT(unit_key) DO UPDATE SET payload=excluded.payload,source_hash=excluded.source_hash,checked_at=excluded.checked_at,missing=0 WHERE excluded.checked_at>=production_dtf_lines.checked_at").bind(frame.checked_at,lineJson,frame.checked_at),
 ]);}catch{dtfFail('DTF_STORAGE_UNAVAILABLE',503);}
}
export async function syncProductionDtf(env,getSource,{now=()=>Date.now(),force=false}={}){
 if(typeof force!=='boolean')dtfFail('DTF_SYNC_INVALID');const db=await dtfSetup(env),stamp=dtfClock(now),state=await db.prepare('SELECT * FROM production_dtf_sync_state WHERE id=1').first();
 if(!state)dtfFail('DTF_STORAGE_UNAVAILABLE',503);if(!force&&state.last_sync_at!==null&&stamp-state.last_sync_at<60)return readProductionDtf(env);
 const token=crypto.randomUUID(),lease=await db.prepare('UPDATE production_dtf_sync_state SET lease_token=?,lease_expires_at=? WHERE id=1 AND (lease_token IS NULL OR lease_expires_at<=?)').bind(token,stamp+180,stamp).run();
 if(lease.meta.changes!==1)return readProductionDtf(env);
 try{
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000)),dayBefore=date=>new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10),yesterday=dayBefore(today),oldest=new Date(Date.parse(today+'T00:00:00Z')-14*86400000).toISOString().slice(0,10);
  // Read today first. Backfill one older day per tick so a busy 15-day period
  // cannot exhaust the provider page limit before today's work is available.
  const scan=await dtfSource(env,getSource,{operation:'scan',start_date:today,end_date:today},now);await dtfIngest(db,scan);
  const history=typeof state.history_next_date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(state.history_next_date)&&state.history_next_date>=oldest&&state.history_next_date<=yesterday?state.history_next_date:yesterday;
  const historical=await dtfSource(env,getSource,{operation:'scan',start_date:history,end_date:history},now);await dtfIngest(db,historical);
  const observed=JSON.stringify([...new Set([...scan.orders,...historical.orders].map(order=>order.order_id))]);
  const old=(await db.prepare("SELECT o.order_id FROM production_dtf_orders o WHERE NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE j.value=o.order_id) AND (o.status IN('READY_TO_SHIP','PROCESSED','RETRY_SHIP') OR EXISTS(SELECT 1 FROM production_dtf_reservations r JOIN production_dtf_lines l ON l.unit_key=r.unit_key WHERE l.order_id=o.order_id)) AND EXISTS(SELECT 1 FROM production_dtf_lines l WHERE l.order_id=o.order_id AND l.produced_batch_id IS NULL) ORDER BY o.checked_at,o.order_id LIMIT 50").bind(observed).all()).results.map(row=>row.order_id);
  if(old.length)await dtfIngest(db,await dtfSource(env,getSource,{operation:'verify',order_ids:old},now));
  await db.prepare('UPDATE production_dtf_sync_state SET last_sync_at=?,history_next_date=? WHERE id=1 AND lease_token=?').bind(dtfClock(now),history===oldest?yesterday:dayBefore(history),token).run();
 }finally{await db.prepare('UPDATE production_dtf_sync_state SET lease_token=NULL,lease_expires_at=NULL WHERE id=1 AND lease_token=?').bind(token).run();}
 return readProductionDtf(env);
}
function dtfPrepareBody(body){
 if(!dtfExact(body,['request_id','unit_keys','artworks'])||!dtfUuid(body.request_id)||!dtfArray(body.unit_keys,100)||!body.unit_keys.length||!body.unit_keys.every(dtfHashText)||new Set(body.unit_keys).size!==body.unit_keys.length||!dtfArray(body.artworks,300))dtfFail('DTF_BATCH_REQUEST_INVALID');
 const artworks=[];for(const row of body.artworks){if(!dtfExact(row,['art_key','sha256','pixel_width','pixel_height'])||typeof row.art_key!=='string'||!dtfHashText(row.sha256)||!dtfInt(row.pixel_width,1,32767)||!dtfInt(row.pixel_height,1,32767))dtfFail('DTF_ARTWORK_INVALID');artworks.push({...row});}
 return {request_id:body.request_id,unit_keys:[...body.unit_keys].sort(),artworks:artworks.sort((a,b)=>a.art_key.localeCompare(b.art_key,'en'))};
}
async function dtfSelectLines(db,keys){const result=await db.prepare(dtfLineSelect+' WHERE l.unit_key IN ('+keys.map(()=>'?').join(',')+') ORDER BY l.unit_key').bind(...keys).all();if(result.results.length!==keys.length)dtfFail('DTF_QUEUE_CHANGED_REFRESH',409);return result.results;}
async function dtfVerifyRows(env,db,rows,getSource,now){
 const order_ids=[...new Set(rows.map(row=>row.order_id))].sort();if(order_ids.length>50)dtfFail('DTF_BATCH_ORDER_LIMIT');
 const source=await dtfSource(env,getSource,{operation:'verify',order_ids},now);await dtfIngest(db,source);
 const verified=await dtfSelectLines(db,rows.map(row=>row.unit_key));
 const expected=new Map(source.orders.flatMap(order=>order.lines.map(line=>[order.order_id+':'+line.line_key,{...line,status:order.status}])));
 const liveOrders=new Map(source.orders.map(order=>[order.order_id,order]));
 for(const row of verified){const local=dtfLine(row),live=expected.get(row.order_id+':'+row.line_key),order=liveOrders.get(row.order_id);if(!live||!dtfEligible(live.status)||local.status!==live.status||row.update_time!==order.update_time||row.missing||row.checked_at!==source.checked_at||local.sku!==live.sku||local.quantity!==live.quantity||local.item_id!==live.item_id||local.model_id!==live.model_id)dtfFail('DTF_ORDER_CHANGED_REFRESH',409);}
 return {rows:verified,checked_at:source.checked_at};
}
export async function prepareProductionDtfBatch(env,body,getSource,actor,{now=()=>Date.now()}={}){
 const input=dtfPrepareBody(body);dtfActor(actor);const db=await dtfSetup(env),requestHash=await dtfHash({unit_keys:input.unit_keys,artworks:input.artworks}),previous=await db.prepare('SELECT * FROM production_dtf_batches WHERE id=?').bind(input.request_id).first();
 if(previous){if(previous.request_hash!==requestHash)dtfFail('DTF_REQUEST_ID_REUSED',409);return {batch:dtfBatch(previous)};}
 const selected=await dtfSelectLines(db,input.unit_keys);for(const row of selected)if(dtfLine(row).production_state!=='PENDING')dtfFail('DTF_QUEUE_CHANGED_REFRESH',409);
 const settings=dtfSettings(await db.prepare('SELECT * FROM production_dtf_settings WHERE id=1').first()),verified=await dtfVerifyRows(env,db,selected,getSource,now);
 for(let index=0;index<selected.length;index++)if(selected[index].source_hash!==verified.rows[index].source_hash||dtfLine(verified.rows[index]).production_state!=='PENDING')dtfFail('DTF_ORDER_CHANGED_REFRESH',409);
 const units=verified.rows.map(row=>{const line=dtfLine(row);return {unit_key:line.unit_key,order_id:line.order_id,sku:line.sku,quantity:line.quantity,requires_pair:line.requires_pair,source_hash:row.source_hash};});
 const layout=dtfEngineCall('plan',{settings:settings.values,units:units.map(({unit_key,sku,quantity,requires_pair})=>({unit_key,sku,quantity,requires_pair})),artworks:input.artworks}),payload=JSON.stringify({layout,source_checked_at:verified.checked_at,settings_revision:settings.revision,units,artworks:input.artworks}),stamp=dtfClock(now);
 if(dtfEncoder.encode(payload).byteLength>1048576)dtfFail('DTF_BATCH_TOO_LARGE');
 const statements=[db.prepare('INSERT INTO production_dtf_batches(id,request_hash,status,payload,created_at,updated_at,actor) SELECT ?,?,\'PREPARED\',?,?,?,? WHERE EXISTS(SELECT 1 FROM production_dtf_settings WHERE id=1 AND revision=?)').bind(input.request_id,requestHash,payload,stamp,stamp,actor,settings.revision)];
 const reservationRows=JSON.stringify(verified.rows.map(row=>({unit_key:row.unit_key,source_hash:row.source_hash,checked_at:row.checked_at})));
 statements.push(db.prepare("INSERT INTO production_dtf_reservations(unit_key,batch_id,source_hash) SELECT l.unit_key,?,l.source_hash FROM json_each(?) j JOIN production_dtf_lines l ON l.unit_key=json_extract(j.value,'$.unit_key') JOIN production_dtf_orders o ON o.order_id=l.order_id WHERE l.source_hash=json_extract(j.value,'$.source_hash') AND l.checked_at=json_extract(j.value,'$.checked_at') AND l.missing=0 AND l.produced_batch_id IS NULL AND o.status IN('READY_TO_SHIP','PROCESSED','RETRY_SHIP') AND EXISTS(SELECT 1 FROM production_dtf_batches WHERE id=? AND request_hash=?)").bind(input.request_id,reservationRows,input.request_id,requestHash));
 statements.push(dtfGuard(db,'(SELECT COUNT(*) FROM production_dtf_reservations WHERE batch_id=?)=? AND EXISTS(SELECT 1 FROM production_dtf_batches WHERE id=? AND request_hash=?)',input.request_id,units.length,input.request_id,requestHash));
 statements.push(db.prepare("INSERT INTO production_dtf_audit(id,batch_id,action,actor,created_at) VALUES(?,?,'PREPARE',?,?)").bind(crypto.randomUUID(),input.request_id,actor,stamp));
 try{await db.batch(statements);}catch{const retry=await db.prepare('SELECT * FROM production_dtf_batches WHERE id=?').bind(input.request_id).first();if(retry?.request_hash===requestHash)return {batch:dtfBatch(retry)};dtfFail('DTF_QUEUE_CHANGED_REFRESH',409);}
 return {batch:dtfBatch(await db.prepare('SELECT * FROM production_dtf_batches WHERE id=?').bind(input.request_id).first())};
}
export async function actProductionDtfBatch(env,body,getSource,actor,{now=()=>Date.now()}={}){
 if(!dtfExact(body,['id','action'])||!dtfUuid(body.id)||!['export','produce','void'].includes(body.action))dtfFail('DTF_BATCH_ACTION_INVALID');dtfActor(actor);const db=await dtfSetup(env),row=await db.prepare('SELECT * FROM production_dtf_batches WHERE id=?').bind(body.id).first();if(!row)dtfFail('DTF_BATCH_NOT_FOUND',404);
 const batch=dtfBatch(row),snapshot=JSON.parse(row.payload),target={export:'EXPORTED',produce:'PRODUCED',void:'VOID'}[body.action];
 if(batch.status===target&&body.action!=='export')return {batch};
 if(body.action==='export'&&!['PREPARED','EXPORTED'].includes(batch.status)||body.action==='produce'&&batch.status!=='EXPORTED'||body.action==='void'&&batch.status!=='PREPARED')dtfFail('DTF_BATCH_STATE_CONFLICT',409);
 let fresh=null;
 if(body.action==='export'){
  fresh=await dtfVerifyRows(env,db,await dtfSelectLines(db,snapshot.units.map(unit=>unit.unit_key)),getSource,now);
  const saved=new Map(snapshot.units.map(unit=>[unit.unit_key,unit]));for(const value of fresh.rows)if(value.reserved_batch_id!==body.id||value.produced_batch_id||value.source_hash!==saved.get(value.unit_key).source_hash)dtfFail('DTF_ORDER_CHANGED_REFRESH',409);
 }
 const stamp=dtfClock(now),statements=[db.prepare('UPDATE production_dtf_batches SET status=?,updated_at=? WHERE id=? AND status=? AND payload=?').bind(target,stamp,body.id,row.status,row.payload)];
 statements.push(dtfGuard(db,'changes()=1'));
 if(fresh)statements.push(dtfGuard(db,"(SELECT COUNT(*) FROM json_each(?) j JOIN production_dtf_lines l ON l.unit_key=json_extract(j.value,'$.unit_key') JOIN production_dtf_orders o ON o.order_id=l.order_id JOIN production_dtf_reservations r ON r.unit_key=l.unit_key WHERE r.batch_id=? AND l.source_hash=json_extract(j.value,'$.source_hash') AND l.checked_at=json_extract(j.value,'$.checked_at') AND l.missing=0 AND l.produced_batch_id IS NULL AND o.status IN('READY_TO_SHIP','PROCESSED','RETRY_SHIP'))=?",JSON.stringify(fresh.rows.map(value=>({unit_key:value.unit_key,source_hash:value.source_hash,checked_at:value.checked_at}))),body.id,fresh.rows.length));
 if(body.action==='produce'){
  statements.push(db.prepare('UPDATE production_dtf_lines SET produced_batch_id=? WHERE unit_key IN(SELECT unit_key FROM production_dtf_reservations WHERE batch_id=?) AND produced_batch_id IS NULL').bind(body.id,body.id));
  statements.push(dtfGuard(db,'changes()=?',snapshot.units.length));
 }
 if(body.action==='void')statements.push(db.prepare('DELETE FROM production_dtf_reservations WHERE batch_id=?').bind(body.id));
 statements.push(db.prepare('INSERT INTO production_dtf_audit(id,batch_id,action,actor,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),body.id,body.action.toUpperCase(),actor,stamp));
 try{await db.batch(statements);}catch{dtfFail('DTF_BATCH_STATE_CONFLICT',409);}
 return {batch:dtfBatch(await db.prepare('SELECT * FROM production_dtf_batches WHERE id=?').bind(body.id).first())};
}
