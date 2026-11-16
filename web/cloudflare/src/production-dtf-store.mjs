import {TenantInitializationMap,isTenantDatabase} from './tenant-storage.mjs';
import {createDtfEngine} from './dtf-layout.mjs';
import {projectProductionOrdersFrame,productionOrdersRequestMatches} from '../../finance/src/production-orders-frame.mjs';
import {validateVariantBindings} from './variant-bindings.mjs';
import {CATALOG_CLASSIFICATION_SCHEMA,catalogClassificationQueries,catalogClassificationsFromSnapshot} from './catalog-classification.mjs';

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
const dtfReady=new TenantInitializationMap();
async function dtfSetup(env){
 const db=env?.ADMIN_DB;if(!db?.prepare||!db?.batch)dtfFail('DTF_STORAGE_CONFIGURATION',503);
 if(!dtfReady.has(db))dtfReady.set(db,db.batch([...PRODUCTION_DTF_SCHEMA,...CATALOG_CLASSIFICATION_SCHEMA].map(sql=>db.prepare(env.COMMERCIAL_CONTEXT||isTenantDatabase(db)?sql.replace("'operator-confirmed-film-57cm'","'commercial-film-default-unconfirmed-v1'"):sql))).catch(()=>{dtfReady.delete(db);dtfFail('DTF_STORAGE_UNAVAILABLE',503);}));
 await dtfReady.get(db);return db;
}
function dtfClock(now){let value;try{value=now();}catch{dtfFail('DTF_CLOCK_INVALID',503);}if(!dtfInt(value,1,9999999999999))dtfFail('DTF_CLOCK_INVALID',503);return Math.floor(value/1000);}
function dtfActor(actor){if(typeof actor!=='string'||!actor.trim()||actor.length>256||/[\u0000-\u001f\u007f-\u009f]/.test(actor))dtfFail('DTF_ACTOR_INVALID');return actor;}
async function dtfHash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',dtfEncoder.encode(typeof value==='string'?value:JSON.stringify(value)))),byte=>byte.toString(16).padStart(2,'0')).join('');}
function dtfSettings(row){try{if(!row||!dtfInt(row.revision,1,2147483646)||!dtfInt(row.updated_at,1,9999999999))throw Error();return {revision:row.revision,values:dtfEngine.validateSettings(JSON.parse(row.values_json))};}catch{dtfFail('DTF_SETTINGS_STORAGE_INVALID',503);}}
function dtfEngineCall(method,input){try{return dtfEngine[method](input);}catch(error){if(typeof error?.message==='string'&&/^DTF_[A-Z_]+$/.test(error.message))dtfFail(error.message,400,error.issues);dtfFail('DTF_PLAN_INVALID');}}
// New confirmations use indexed append-only audit rows. No table or historical
// manifest is rewritten. Legacy whole-line confirmations retain their original
// immutable quantity even if the provider later changes its order quantity.
function dtfPrintedSql(key,batch=null){
 const scope="a.id>='DTFU:'||"+key+"||':' AND a.id<'DTFU:'||"+key+"||';'"+(batch?' AND a.batch_id='+batch:'');
 const valid="CASE WHEN json_valid(a.action) THEN ((json_extract(a.action,'$.schema')='dtf_unit_print_v1' AND (SELECT COUNT(*) FROM json_each(a.action))=5) OR (json_extract(a.action,'$.schema')='dtf_unit_print_reversal_v1' AND (SELECT COUNT(*) FROM json_each(a.action))=6 AND length(json_extract(a.action,'$.reverses_request_id'))=36)) AND json_extract(a.action,'$.unit_key')="+key+" AND a.id='DTFU:'||"+key+"||':'||json_extract(a.action,'$.request_id') AND json_type(a.action,'$.quantity')='integer' AND json_extract(a.action,'$.quantity') BETWEEN 1 AND 1000 AND length(json_extract(a.action,'$.source_hash'))=64 ELSE 0 END";
 const quantity="CASE WHEN json_extract(a.action,'$.schema')='dtf_unit_print_reversal_v1' THEN -json_extract(a.action,'$.quantity') ELSE json_extract(a.action,'$.quantity') END";
 return "(SELECT CASE WHEN COALESCE(SUM(CASE WHEN "+valid+" THEN 0 ELSE 1 END),0)=0 THEN COALESCE(SUM(CASE WHEN json_valid(a.action) THEN "+quantity+" ELSE 0 END),0) ELSE -1 END FROM production_dtf_audit a WHERE "+scope+")";
}
const dtfLegacyQuantity="CASE WHEN l.produced_batch_id IS NULL THEN 0 WHEN EXISTS(SELECT 1 FROM production_dtf_audit a WHERE a.id>='DTFH:'||l.produced_batch_id||':' AND a.id<'DTFH:'||l.produced_batch_id||';' AND CASE WHEN json_valid(a.action) THEN json_extract(a.action,'$.action')='confirm_print' ELSE 0 END) THEN CASE WHEN "+dtfPrintedSql('l.unit_key','l.produced_batch_id')+">=0 AND EXISTS(SELECT 1 FROM production_dtf_audit u WHERE u.id>='DTFU:'||l.unit_key||':' AND u.id<'DTFU:'||l.unit_key||';' AND u.batch_id=l.produced_batch_id) THEN 0 ELSE -1 END ELSE (SELECT json_extract(j.value,'$.quantity') FROM production_dtf_batches b,json_each(b.payload,'$.units') j WHERE b.id=l.produced_batch_id AND json_extract(j.value,'$.unit_key')=l.unit_key) END";
const dtfLineSelect=`SELECT l.*,o.status,o.create_time,o.update_time,r.batch_id AS reserved_batch_id,r.source_hash AS reserved_source_hash,${dtfPrintedSql('l.unit_key')} AS printed_quantity,${dtfLegacyQuantity} AS legacy_quantity,(SELECT COALESCE(SUM(CASE WHEN json_valid(a.action) THEN CASE WHEN json_extract(a.action,'$.schema')='dtf_unit_print_reversal_v1' THEN -json_extract(a.action,'$.quantity') ELSE json_extract(a.action,'$.quantity') END ELSE 1 END),0) FROM production_dtf_audit a WHERE a.id>='DTFU:'||l.unit_key||':' AND a.id<'DTFU:'||l.unit_key||';' AND CASE WHEN json_valid(a.action) THEN json_extract(a.action,'$.source_hash')<>l.source_hash ELSE 1 END) AS changed_print_sources,(SELECT json_extract(j.value,'$.source_hash') FROM production_dtf_batches b,json_each(b.payload,'$.units') j WHERE b.id=l.produced_batch_id AND json_extract(j.value,'$.unit_key')=l.unit_key) AS marker_source_hash FROM production_dtf_lines l JOIN production_dtf_orders o ON o.order_id=l.order_id LEFT JOIN production_dtf_reservations r ON r.unit_key=l.unit_key`;
const dtfGuard=(db,condition,...args)=>db.prepare('INSERT INTO production_dtf_guard(id,ok) VALUES(1,CASE WHEN '+condition+' THEN 1 ELSE 0 END) ON CONFLICT(id) DO UPDATE SET ok=excluded.ok').bind(...args);
function dtfLine(row){
 try{const value=JSON.parse(row.payload);if(!dtfExact(value,['item_id','model_id','sku','quantity','model_name','requires_pair'])||!dtfHashText(row.unit_key)||!dtfHashText(row.source_hash)||!dtfInt(row.checked_at,1,9999999999)||!dtfInt(value.quantity,1,10000)||typeof value.requires_pair!=='boolean'||typeof value.sku!=='string'||typeof value.model_name!=='string')throw Error();
 if(!dtfInt(row.printed_quantity)||!dtfInt(row.legacy_quantity))throw Error();
 const printed=row.printed_quantity+row.legacy_quantity,changedReservation=row.reserved_batch_id&&row.reserved_source_hash!==row.source_hash,sourceChanged=row.changed_print_sources>0||row.legacy_quantity>0&&row.marker_source_hash!==row.source_hash,review=sourceChanged||printed>value.quantity,remaining=Math.max(0,value.quantity-printed);
 return {unit_key:row.unit_key,order_id:row.order_id,line_key:row.line_key,...value,quantity:!review&&remaining>0?remaining:value.quantity,ordered_quantity:value.quantity,printed_quantity:printed,remaining_quantity:review?null:remaining,requires_print_review:!!review,status:row.missing?'MISSING_LINE':row.status,production_state:changedReservation||review?'BLOCKED':remaining===0?'PRODUCED':row.missing||!dtfEligible(row.status)||dtfNoPrint(value.sku)?'BLOCKED':row.reserved_batch_id?'RESERVED':'PENDING',last_seen_at:row.checked_at};
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
// Bounded keyset navigation of the existing ledger; pagination never scans the
// provider or changes reservations. Audit growth invalidates an older cursor.
export async function readProductionDtfBatches(env,input={}){
 if(!dtfPlain(input)||Object.keys(input).some(k=>!['status','search','cursor'].includes(k)))dtfFail('DTF_BATCH_PAGE_INVALID');
 const status=input.status??'OPEN',search=input.search??'',cursor=input.cursor??null,scope=env.COMMERCIAL_CONTEXT?.namespace??'legacy-owner';
 if(!['OPEN','ALL','PREPARED','EXPORTED','PRODUCED','VOID'].includes(status)||typeof search!=='string'||search!==search.trim().toLowerCase()||search!==''&&!/^[a-f0-9-]{4,36}$/.test(search)||cursor!==null&&(typeof cursor!=='string'||cursor.length>1200||!/^[-_A-Za-z0-9]+$/.test(cursor)))dtfFail('DTF_BATCH_PAGE_INVALID');
 let anchor=null;if(cursor!==null)try{const value=JSON.parse(atob(cursor.replace(/-/g,'+').replace(/_/g,'/')));if(!dtfExact(value,['v','scope','status','search','generation','last'])||value.v!==1||value.scope!==scope||value.status!==status||value.search!==search||!/^\d+:\d+$/.test(value.generation)||!dtfExact(value.last,['closed','created_at','id'])||![0,1].includes(value.last.closed)||!dtfInt(value.last.created_at,1,9999999999)||!dtfUuid(value.last.id))throw Error();anchor=value;}catch{dtfFail('DTF_BATCH_PAGE_INVALID');}
 const db=await dtfSetup(env),conditions=[],bindings=[];
 if(status==='OPEN')conditions.push("status IN('PREPARED','EXPORTED')");else if(status!=='ALL'){conditions.push('status=?');bindings.push(status);}
 if(search){conditions.push('id LIKE ?');bindings.push(search+'%');}
 const where=conditions.length?' WHERE '+conditions.join(' AND '):'',closed="CASE WHEN status IN('PRODUCED','VOID') THEN 1 ELSE 0 END",pageWhere=anchor?(where?' AND ':' WHERE ')+`(${closed}>? OR (${closed}=? AND (created_at<? OR (created_at=? AND id<?))))`:'';
 const query=db.prepare(`SELECT id,status,created_at,${closed} AS closed,json_extract(payload,'$.layout.print_count') AS print_count,json_array_length(json_extract(payload,'$.layout.sheets')) AS sheet_count FROM production_dtf_batches`+where+pageWhere+` ORDER BY ${closed},created_at DESC,id DESC LIMIT 21`).bind(...bindings,...(anchor?[anchor.last.closed,anchor.last.closed,anchor.last.created_at,anchor.last.created_at,anchor.last.id]:[]));
 const result=await db.batch([db.prepare("SELECT COUNT(*) AS total,COALESCE(SUM(status='PREPARED'),0) AS prepared,COALESCE(SUM(status='EXPORTED'),0) AS exported,COALESCE(SUM(status='PRODUCED'),0) AS produced,COALESCE(SUM(status='VOID'),0) AS void,(SELECT COALESCE(MAX(rowid),0) FROM production_dtf_audit) AS audit_cursor FROM production_dtf_batches"),db.prepare('SELECT COUNT(*) AS total FROM production_dtf_batches'+where).bind(...bindings),query]);
 const counts=result[0].results[0],matched=result[1].results[0].total,generation=counts.total+':'+counts.audit_cursor;
 if(anchor&&anchor.generation!==generation)dtfFail('DTF_BATCH_PAGE_CHANGED',409);
 const rows=result[2].results,items=rows.slice(0,20).map(({closed,...row})=>{if(!dtfUuid(row.id)||!['PREPARED','EXPORTED','PRODUCED','VOID'].includes(row.status)||!dtfInt(row.created_at,1,9999999999)||!dtfInt(row.print_count,1,300)||!dtfInt(row.sheet_count,1,20))dtfFail('DTF_BATCH_STORAGE_INVALID',503);return row;}),last=rows[Math.min(rows.length,20)-1];
 const next=rows.length>20?btoa(JSON.stringify({v:1,scope,status,search,generation,last:{closed:last.closed,created_at:last.created_at,id:last.id}})).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''):null;
 return {schema:'production_dtf_batches_page_v1',selection:{status,search},generation,totals:{all:counts.total,open:counts.prepared+counts.exported,by_status:{PREPARED:counts.prepared,EXPORTED:counts.exported,PRODUCED:counts.produced,VOID:counts.void}},pagination:{page_size:20,matched_total:matched,has_more:next!==null,next_cursor:next},items};
}
export async function readProductionDtfBatch(env,id,before=0){
 if(!dtfUuid(id)||!dtfInt(before,0,2147483646))dtfFail('DTF_BATCH_ID_INVALID');const db=await dtfSetup(env),row=await db.prepare('SELECT * FROM production_dtf_batches WHERE id=?').bind(id).first();if(!row)dtfFail('DTF_BATCH_NOT_FOUND',404);return {schema:'production_dtf_batch_v1',batch:dtfBatch(row),lifecycle:await dtfLifecycleView(db,row,before)};
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
async function dtfBindings(db,frame){
 try{
  const pairs=[...new Map(frame.orders.flatMap(order=>order.lines.map(line=>[line.item_id+':'+line.model_id,{item_id:line.item_id,model_id:line.model_id}]))).values()],queries=[db.prepare('SELECT payload FROM variant_bindings_state WHERE id=1')],sections=[];
  // Every legacy/manual and normalized composition shares one D1 read snapshot.
  // The order source may contain 5,000 lines, so each normalized selector is
  // bounded independently rather than reusing the legacy global array limit.
  for(let index=0;index<pairs.length;index+=1000){const part=pairs.slice(index,index+1000),selection=catalogClassificationQueries(db,[...new Set(part.map(row=>row.item_id))],part);sections.push({start:queries.length,length:selection.length});queries.push(...selection);}
  const snapshot=await db.batch(queries),row=snapshot[0]?.results?.[0];if(!row)dtfFail('DTF_BINDINGS_UNAVAILABLE',503);
  const legacy=new Map(validateVariantBindings(JSON.parse(row.payload)).map(value=>[value.item_id+':'+value.model_id,value])),automatic=new Map(),classified=new Set();
  for(const section of sections){const value=catalogClassificationsFromSnapshot(snapshot.slice(section.start,section.start+section.length));for(const product of value.products)if(dtfHashText(product.catalog_fingerprint)&&dtfInt(product.checked_at,1,9999999999))classified.add(product.item_id);for(const binding of value.bindings)automatic.set(binding.item_id+':'+binding.model_id,binding);}
  return new Map(pairs.map(pair=>{const key=pair.item_id+':'+pair.model_id,manual=legacy.get(key),binding=manual?.operator_confirmed===true?manual:classified.has(pair.item_id)?automatic.get(key):automatic.get(key)||manual;return [key,binding?.selling_unit==='ONE_MALE_ONE_FEMALE_KIT'];}));
 }catch(error){if(error instanceof ProductionDtfError)throw error;dtfFail('DTF_BINDINGS_UNAVAILABLE',503);}
}
async function dtfIngest(db,frame){
 const bindings=await dtfBindings(db,frame),orders=[],lines=[];
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
  // DTF completion is not shipment. Keep every known nonterminal order in the
  // bounded oldest-first review even when all its print lines were produced.
  const old=(await db.prepare("SELECT o.order_id FROM production_dtf_orders o WHERE NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE j.value=o.order_id) AND (o.status NOT IN('COMPLETED','CANCELLED') OR EXISTS(SELECT 1 FROM production_dtf_reservations r JOIN production_dtf_lines l ON l.unit_key=r.unit_key WHERE l.order_id=o.order_id AND l.produced_batch_id IS NULL)) ORDER BY o.checked_at,o.order_id LIMIT 50").bind(observed).all()).results.map(row=>row.order_id);
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
 for(const row of verified){const local=dtfLine(row),live=expected.get(row.order_id+':'+row.line_key),order=liveOrders.get(row.order_id);if(!live||!dtfEligible(live.status)||local.status!==live.status||row.update_time!==order.update_time||row.missing||row.checked_at!==source.checked_at||local.sku!==live.sku||(local.ordered_quantity??local.quantity)!==live.quantity||local.item_id!==live.item_id||local.model_id!==live.model_id)dtfFail('DTF_ORDER_CHANGED_REFRESH',409);}
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
 const reservationRows=JSON.stringify(verified.rows.map(row=>({unit_key:row.unit_key,source_hash:row.source_hash,checked_at:row.checked_at,printed_quantity:dtfLine(row).printed_quantity})));
 statements.push(db.prepare("INSERT INTO production_dtf_reservations(unit_key,batch_id,source_hash) SELECT l.unit_key,?,l.source_hash FROM json_each(?) j JOIN production_dtf_lines l ON l.unit_key=json_extract(j.value,'$.unit_key') JOIN production_dtf_orders o ON o.order_id=l.order_id WHERE l.source_hash=json_extract(j.value,'$.source_hash') AND l.checked_at=json_extract(j.value,'$.checked_at') AND l.missing=0 AND o.status IN('READY_TO_SHIP','PROCESSED','RETRY_SHIP') AND EXISTS(SELECT 1 FROM production_dtf_batches WHERE id=? AND request_hash=?)").bind(input.request_id,reservationRows,input.request_id,requestHash));
 statements.push(dtfGuard(db,'(SELECT COUNT(*) FROM production_dtf_reservations WHERE batch_id=?)=? AND EXISTS(SELECT 1 FROM production_dtf_batches WHERE id=? AND request_hash=?)',input.request_id,units.length,input.request_id,requestHash));
 statements.push(dtfGuard(db,"NOT EXISTS(SELECT 1 FROM json_each(?) j JOIN production_dtf_lines l ON l.unit_key=json_extract(j.value,'$.unit_key') WHERE "+dtfPrintedSql('l.unit_key')+"+("+dtfLegacyQuantity+")<>json_extract(j.value,'$.printed_quantity'))",reservationRows));
 statements.push(db.prepare("INSERT INTO production_dtf_audit(id,batch_id,action,actor,created_at) VALUES(?,?,'PREPARE',?,?)").bind(crypto.randomUUID(),input.request_id,actor,stamp));
 try{await db.batch(statements);}catch{const retry=await db.prepare('SELECT * FROM production_dtf_batches WHERE id=?').bind(input.request_id).first();if(retry?.request_hash===requestHash)return {batch:dtfBatch(retry)};dtfFail('DTF_QUEUE_CHANGED_REFRESH',409);}
 return {batch:dtfBatch(await db.prepare('SELECT * FROM production_dtf_batches WHERE id=?').bind(input.request_id).first())};
}
export async function actProductionDtfBatch(env,body,getSource,actor,{now=()=>Date.now()}={}){
 if(dtfPlain(body)&&['confirm_print','reverse_print','release_remaining','record_reprint','record_loss','export_remaining','export_reprint'].includes(body.action))return dtfLifecycleAction(env,body,getSource,actor,now);
 if(!dtfExact(body,['id','action'])||!dtfUuid(body.id)||!['export','produce','void'].includes(body.action))dtfFail('DTF_BATCH_ACTION_INVALID');dtfActor(actor);const db=await dtfSetup(env),row=await db.prepare('SELECT * FROM production_dtf_batches WHERE id=?').bind(body.id).first();if(!row)dtfFail('DTF_BATCH_NOT_FOUND',404);
 const batch=dtfBatch(row),snapshot=JSON.parse(row.payload),target={export:'EXPORTED',produce:'PRODUCED',void:'VOID'}[body.action];
 if(batch.status===target&&body.action!=='export')return {batch};
 if(body.action==='export'||body.action==='produce'){const life=await dtfLifecycleView(db,row);if(life.confirmed_units>0&&life.managed)dtfFail('DTF_PARTIAL_REVIEW_REQUIRED',409);if(body.action==='produce'&&life.units.some(u=>u.printed_before_batch>0))dtfFail('DTF_PARTIAL_REVIEW_REQUIRED',409);}
 if(body.action==='export'&&!['PREPARED','EXPORTED'].includes(batch.status)||body.action==='produce'&&batch.status!=='EXPORTED'||body.action==='void'&&batch.status!=='PREPARED')dtfFail('DTF_BATCH_STATE_CONFLICT',409);
 let fresh=null;
 if(body.action==='export'){
  fresh=await dtfVerifyRows(env,db,await dtfSelectLines(db,snapshot.units.map(unit=>unit.unit_key)),getSource,now);
  const saved=new Map(snapshot.units.map(unit=>[unit.unit_key,unit]));for(const value of fresh.rows)if(value.reserved_batch_id!==body.id||dtfLine(value).production_state!=='RESERVED'||value.source_hash!==saved.get(value.unit_key).source_hash)dtfFail('DTF_ORDER_CHANGED_REFRESH',409);
 }
 const stamp=dtfClock(now),statements=[db.prepare('UPDATE production_dtf_batches SET status=?,updated_at=? WHERE id=? AND status=? AND payload=?').bind(target,stamp,body.id,row.status,row.payload)];
 statements.push(dtfGuard(db,'changes()=1'));
 if(fresh)statements.push(dtfGuard(db,"(SELECT COUNT(*) FROM json_each(?) j JOIN production_dtf_lines l ON l.unit_key=json_extract(j.value,'$.unit_key') JOIN production_dtf_orders o ON o.order_id=l.order_id JOIN production_dtf_reservations r ON r.unit_key=l.unit_key WHERE r.batch_id=? AND l.source_hash=json_extract(j.value,'$.source_hash') AND l.checked_at=json_extract(j.value,'$.checked_at') AND l.missing=0 AND o.status IN('READY_TO_SHIP','PROCESSED','RETRY_SHIP'))=?",JSON.stringify(fresh.rows.map(value=>({unit_key:value.unit_key,source_hash:value.source_hash,checked_at:value.checked_at}))),body.id,fresh.rows.length));
 if(body.action==='produce'){
  statements.push(db.prepare('UPDATE production_dtf_lines SET produced_batch_id=? WHERE unit_key IN(SELECT unit_key FROM production_dtf_reservations WHERE batch_id=?) AND produced_batch_id IS NULL').bind(body.id,body.id));
  statements.push(dtfGuard(db,'changes()=?',snapshot.units.length));
 }
 if(body.action==='void')statements.push(db.prepare('DELETE FROM production_dtf_reservations WHERE batch_id=?').bind(body.id));
 statements.push(db.prepare('INSERT INTO production_dtf_audit(id,batch_id,action,actor,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),body.id,body.action.toUpperCase(),actor,stamp));
 try{await db.batch(statements);}catch{dtfFail('DTF_BATCH_STATE_CONFLICT',409);}
 return {batch:dtfBatch(await db.prepare('SELECT * FROM production_dtf_batches WHERE id=?').bind(body.id).first())};
}

// Explicit physical printing facts are separate from garment manufacture,
// expenses and payments. Export is never a physical confirmation.
async function dtfLifecycleView(db,row,before=0){
 const batch=dtfBatch(row),saved=JSON.parse(row.payload),prefix='DTFH:'+row.id;
 const revisionQuery=db.prepare(`SELECT COUNT(*) AS revision,COALESCE(MAX(CASE WHEN json_valid(action) THEN json_extract(action,'$.revision') END),0) AS max_revision,COUNT(DISTINCT CASE WHEN json_valid(action) THEN json_extract(action,'$.revision') END) AS unique_revisions FROM production_dtf_audit WHERE id>=? AND id<?`).bind(prefix+':',prefix+';');
 // Indexed identity ranges keep partial-print totals independent of history-page size.
 const unitJson=JSON.stringify(saved.units.map(u=>u.unit_key));
 const queries=[revisionQuery,db.prepare("SELECT j.value AS unit_key,"+dtfPrintedSql('j.value','?')+" AS printed FROM json_each(?) j").bind(row.id,unitJson),db.prepare(dtfLineSelect+" WHERE l.unit_key IN(SELECT value FROM json_each(?))").bind(unitJson),db.prepare("SELECT action,created_at,actor FROM production_dtf_audit WHERE id>=? AND id<? AND (?=0 OR json_extract(action,'$.revision')<?) ORDER BY json_extract(action,'$.revision') DESC LIMIT 21").bind(prefix+':',prefix+';',before,before),db.prepare("SELECT COALESCE(SUM(CASE WHEN json_extract(a.action,'$.action')='record_reprint' THEN (SELECT SUM(json_extract(p.value,'$.quantity')) FROM json_each(a.action,'$.parts') p) ELSE 0 END),0) AS reprinted_prints,COALESCE(SUM(CASE WHEN json_extract(a.action,'$.action')='record_loss' THEN (SELECT SUM(json_extract(p.value,'$.quantity')) FROM json_each(a.action,'$.parts') p) ELSE 0 END),0) AS lost_prints,COALESCE(SUM(json_extract(a.action,'$.cost_cents')),0) AS known_cost_cents,COALESCE(SUM(CASE WHEN json_extract(a.action,'$.cost_cents') IS NOT NULL THEN 1 ELSE 0 END),0) AS known_cost_events,COALESCE(SUM(CASE WHEN json_extract(a.action,'$.action') IN('confirm_print','record_reprint','record_loss') AND json_extract(a.action,'$.cost_cents') IS NULL THEN 1 ELSE 0 END),0) AS unknown_cost_events FROM production_dtf_audit a WHERE a.id>=? AND a.id<?").bind(prefix+':',prefix+';')];
 const result=await db.batch(queries),revision=result[0].results[0]?.revision,counts=new Map(result[1].results.map(u=>[u.unit_key,u.printed])),lines=new Map(result[2].results.map(u=>[u.unit_key,u]));if(!dtfInt(revision)||result[0].results[0].max_revision!==revision||result[0].results[0].unique_revisions!==revision)dtfFail('DTF_LIFECYCLE_STORAGE_INVALID',503);if(before>revision+1)dtfFail('DTF_BATCH_ID_INVALID');
 const events=result[3].results.slice(0,20).map(entry=>{let event;try{event=JSON.parse(entry.action);}catch{dtfFail('DTF_LIFECYCLE_STORAGE_INVALID',503);}if(event.schema!=='dtf_lifecycle_event_v1'||!dtfUuid(event.request_id)||!dtfHashText(event.request_hash)||!['confirm_print','reverse_print','release_remaining','record_reprint','record_loss'].includes(event.action))dtfFail('DTF_LIFECYCLE_STORAGE_INVALID',503);return {...event,actor:entry.actor,created_at:entry.created_at};});
 const units=saved.units.map(unit=>{const recorded=counts.get(unit.unit_key),line=lines.get(unit.unit_key);if(!line||!dtfInt(recorded,0,unit.quantity))dtfFail('DTF_LIFECYCLE_STORAGE_INVALID',503);const legacy=row.status==='PRODUCED'&&recorded===0&&line.produced_batch_id===row.id&&!events.some(e=>e.action==='confirm_print')?unit.quantity:0,printed=recorded+legacy;const current=dtfLine(line);return {unit_key:unit.unit_key,order_id:unit.order_id,sku:unit.sku,model_name:current.model_name,item_id:current.item_id,model_id:current.model_id,quantity:unit.quantity,printed_quantity:printed,remaining_quantity:unit.quantity-printed,printed_before_batch:Math.max(0,current.printed_quantity-printed),source_changed:line.source_hash!==unit.source_hash};});
 if(!Object.values(result[4].results[0]).every(v=>dtfInt(v)))dtfFail('DTF_LIFECYCLE_STORAGE_INVALID',503);
 const confirmed_units=units.reduce((n,u)=>n+u.printed_quantity,0),remaining_units=units.reduce((n,u)=>n+u.remaining_quantity,0),parts=[];
 for(const unit of saved.units)for(const [part_index,part] of dtfEngine.parseSku(unit.sku).entries())parts.push({unit_key:unit.unit_key,part_index,art_key:part.art_key,width_mm:part.width_mm,quantity:unit.quantity});
 return {schema:'dtf_batch_lifecycle_v1',batch_id:row.id,status:row.status,revision,managed:revision>0,confirmed_units,remaining_units,reservation_released:row.status==='VOID',units,parts,events,events_limited:revision>events.length,history:{total:revision,has_more:result[3].results.length>20,next_before:result[3].results.length>20?events.at(-1).revision:null},totals:result[4].results[0],financial_effect:'NONE_AUTOMATIC',manufacturing_confirmed:false};
}
function dtfLifecycleInput(body){
 if(!dtfExact(body,['id','action','request_id','expected_revision','units','parts','reason','confirmed','unprinted_files_will_not_be_used','reverses_request_id','cost_cents'])||!dtfUuid(body.id)||!dtfUuid(body.request_id)||!dtfInt(body.expected_revision,0,2147483645)||body.confirmed!==true||typeof body.unprinted_files_will_not_be_used!=='boolean'||['release_remaining','reverse_print'].includes(body.action)&&!body.unprinted_files_will_not_be_used||!['release_remaining','reverse_print'].includes(body.action)&&body.unprinted_files_will_not_be_used||body.action==='reverse_print'&&!dtfUuid(body.reverses_request_id)||body.action!=='reverse_print'&&body.reverses_request_id!==null||typeof body.reason!=='string'||!body.reason.trim()||body.reason.trim().length>500||/[\u0000-\u001f\u007f-\u009f]/.test(body.reason)||!dtfArray(body.units,100)||!dtfArray(body.parts,300)||body.cost_cents!==null&&!dtfInt(body.cost_cents,0,1000000000))dtfFail('DTF_LIFECYCLE_CONFIRMATION_REQUIRED');
 const units=body.units.map(u=>{if(!dtfExact(u,['unit_key','quantity'])||!dtfHashText(u.unit_key)||!dtfInt(u.quantity,1,1000))dtfFail('DTF_LIFECYCLE_QUANTITY_INVALID');return {...u};}).sort((a,b)=>a.unit_key.localeCompare(b.unit_key));
 const parts=body.parts.map(p=>{if(!dtfExact(p,['unit_key','part_index','quantity'])||!dtfHashText(p.unit_key)||!dtfInt(p.part_index,0,7)||!dtfInt(p.quantity,1,1000))dtfFail('DTF_LIFECYCLE_QUANTITY_INVALID');return {...p};}).sort((a,b)=>a.unit_key.localeCompare(b.unit_key)||a.part_index-b.part_index);
 if(new Set(units.map(u=>u.unit_key)).size!==units.length||new Set(parts.map(p=>p.unit_key+':'+p.part_index)).size!==parts.length)dtfFail('DTF_LIFECYCLE_QUANTITY_INVALID');
 if(['confirm_print','reverse_print'].includes(body.action)&&(!units.length||parts.length)||['record_reprint','record_loss','export_reprint'].includes(body.action)&&(!parts.length||units.length)||['release_remaining','export_remaining'].includes(body.action)&&(units.length||parts.length)||['reverse_print','release_remaining','export_remaining','export_reprint'].includes(body.action)&&body.cost_cents!==null)dtfFail('DTF_LIFECYCLE_QUANTITY_INVALID');
 return {id:body.id,action:body.action,request_id:body.request_id,expected_revision:body.expected_revision,units,parts,reason:body.reason.trim().normalize('NFC'),confirmed:true,unprinted_files_will_not_be_used:body.unprinted_files_will_not_be_used,reverses_request_id:body.reverses_request_id,cost_cents:body.cost_cents};
}
async function dtfLifecycleAction(env,body,getSource,actor,now){
 const input=dtfLifecycleInput(body);dtfActor(actor);const db=await dtfSetup(env),row=await db.prepare('SELECT * FROM production_dtf_batches WHERE id=?').bind(input.id).first();if(!row)dtfFail('DTF_BATCH_NOT_FOUND',404);
 const saved=JSON.parse(row.payload),prefix='DTFH:'+input.id,headerId=prefix+':'+input.request_id,requestHash=await dtfHash(input),previous=await db.prepare('SELECT action FROM production_dtf_audit WHERE id=?').bind(headerId).first();
 if(previous){let event;try{event=JSON.parse(previous.action);}catch{dtfFail('DTF_LIFECYCLE_STORAGE_INVALID',503);}if(event.request_hash!==requestHash)dtfFail('DTF_REQUEST_ID_REUSED',409);return {batch:dtfBatch(row),lifecycle:await dtfLifecycleView(db,row),replayed:true};}
 const life=await dtfLifecycleView(db,row);if(life.revision!==input.expected_revision)dtfFail('DTF_LIFECYCLE_CHANGED_REFRESH',409);
 if(['confirm_print','release_remaining','export_remaining'].includes(input.action)&&row.status!=='EXPORTED'||['reverse_print','record_reprint','record_loss','export_reprint'].includes(input.action)&&!['EXPORTED','PRODUCED','VOID'].includes(row.status))dtfFail('DTF_BATCH_STATE_CONFLICT',409);
 if(input.action==='release_remaining'&&life.remaining_units===0)dtfFail('DTF_BATCH_STATE_CONFLICT',409);
 const unitMap=new Map(life.units.map(u=>[u.unit_key,u])),partMap=new Map(life.parts.map(p=>[p.unit_key+':'+p.part_index,p]));
 if(input.action==='reverse_print'){
  const originalRow=await db.prepare('SELECT action FROM production_dtf_audit WHERE id=? AND batch_id=?').bind(prefix+':'+input.reverses_request_id,input.id).first();let original;try{original=JSON.parse(originalRow?.action);}catch{}if(original?.schema!=='dtf_lifecycle_event_v1'||original.action!=='confirm_print')dtfFail('DTF_REVERSAL_TARGET_INVALID',409);
  for(const unit of input.units){const target=original.units.find(u=>u.unit_key===unit.unit_key);if(!target)dtfFail('DTF_REVERSAL_TARGET_INVALID',409);const keyPrefix='DTFU:'+unit.unit_key,previous=await db.prepare("SELECT COALESCE(SUM(CASE WHEN json_valid(action) THEN json_extract(action,'$.quantity') ELSE 0 END),0) AS quantity FROM production_dtf_audit WHERE id>=? AND id<? AND CASE WHEN json_valid(action) THEN json_extract(action,'$.schema')='dtf_unit_print_reversal_v1' AND json_extract(action,'$.reverses_request_id')=? ELSE 0 END").bind(keyPrefix+':',keyPrefix+';',input.reverses_request_id).first();if(unit.quantity>target.quantity-previous.quantity)dtfFail('DTF_REVERSAL_QUANTITY_INVALID',409);}
 }else for(const unit of input.units){const known=unitMap.get(unit.unit_key);if(!known||known.source_changed||unit.quantity>known.remaining_quantity)dtfFail('DTF_LIFECYCLE_QUANTITY_INVALID',409);}
 for(const part of input.parts){const known=partMap.get(part.unit_key+':'+part.part_index);if(!known||input.action==='export_reprint'&&part.quantity>known.quantity)dtfFail('DTF_LIFECYCLE_QUANTITY_INVALID',409);}
 if(input.action==='export_remaining'||input.action==='export_reprint'){
  const sourceUnits=input.action==='export_remaining'?life.units.filter(u=>u.remaining_quantity>0):life.units.filter(u=>input.parts.some(p=>p.unit_key===u.unit_key));if(!sourceUnits.length)dtfFail('DTF_EMPTY');
  const fresh=await dtfVerifyRows(env,db,await dtfSelectLines(db,sourceUnits.map(u=>u.unit_key)),getSource,now),expected=new Map(saved.units.map(u=>[u.unit_key,u]));for(const r of fresh.rows)if(r.source_hash!==expected.get(r.unit_key).source_hash||input.action==='export_remaining'&&r.reserved_batch_id!==input.id)dtfFail('DTF_ORDER_CHANGED_REFRESH',409);
  const units=input.action==='export_remaining'?saved.units.filter(u=>unitMap.get(u.unit_key).remaining_quantity>0).map(u=>({unit_key:u.unit_key,sku:u.sku,quantity:unitMap.get(u.unit_key).remaining_quantity,requires_pair:u.requires_pair})):input.parts.map(p=>{const known=partMap.get(p.unit_key+':'+p.part_index);return {unit_key:p.unit_key+':part:'+p.part_index,sku:known.art_key+'-'+(known.width_mm/10),quantity:p.quantity,requires_pair:false};});
  const layout=dtfEngineCall('plan',{settings:saved.layout.settings,units,artworks:saved.artworks}),artifact={schema:'dtf_print_artifact_v1',batch_id:input.id,revision:life.revision,kind:input.action==='export_remaining'?'REMAINING':'REPRINT',layout,parts:input.parts,reason:input.reason,source_checked_at:fresh.checked_at,physical_confirmation:false};
  try{await db.batch([dtfGuard(db,'EXISTS(SELECT 1 FROM production_dtf_batches WHERE id=? AND status=? AND payload=?) AND (SELECT COUNT(*) FROM production_dtf_audit WHERE id>=? AND id<?)=?',input.id,row.status,row.payload,prefix+':',prefix+';',life.revision),db.prepare('INSERT INTO production_dtf_audit(id,batch_id,action,actor,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),input.id,input.action.toUpperCase(),actor,dtfClock(now))]);}catch{dtfFail('DTF_LIFECYCLE_CHANGED_REFRESH',409);}
  return {batch:dtfBatch(row),lifecycle:life,artifact};
 }
 const stamp=dtfClock(now),completed=input.action==='confirm_print'&&input.units.reduce((n,u)=>n+u.quantity,0)===life.remaining_units,target=input.action==='release_remaining'||input.action==='reverse_print'&&row.status==='PRODUCED'?'VOID':completed?'PRODUCED':row.status;
 const event={schema:'dtf_lifecycle_event_v1',request_id:input.request_id,request_hash:requestHash,action:input.action,revision:life.revision+1,units:input.units,parts:input.parts,reason:input.reason,cost_cents:input.cost_cents,currency:'BRL',cost_state:input.cost_cents===null?'UNKNOWN':'INFORMED_NOT_RECONCILED',financial_effect:'NONE_AUTOMATIC',confirmed:true,unprinted_files_will_not_be_used:input.unprinted_files_will_not_be_used,reverses_request_id:input.reverses_request_id};
 const statements=[dtfGuard(db,'EXISTS(SELECT 1 FROM production_dtf_batches WHERE id=? AND status=? AND payload=?) AND (SELECT COUNT(*) FROM production_dtf_audit WHERE id>=? AND id<?)=?',input.id,row.status,row.payload,prefix+':',prefix+';',life.revision)];
 if(input.action==='confirm_print'){
  const unitsJson=JSON.stringify(input.units.map(u=>({...u,source_hash:saved.units.find(s=>s.unit_key===u.unit_key).source_hash})));
  statements.push(dtfGuard(db,"(SELECT COUNT(*) FROM json_each(?) j JOIN production_dtf_reservations r ON r.unit_key=json_extract(j.value,'$.unit_key') JOIN production_dtf_lines l ON l.unit_key=r.unit_key WHERE r.batch_id=? AND l.source_hash=json_extract(j.value,'$.source_hash'))=?",unitsJson,input.id,input.units.length));
  statements.push(db.prepare("INSERT INTO production_dtf_audit(id,batch_id,action,actor,created_at) SELECT 'DTFU:'||json_extract(value,'$.unit_key')||':'||?,?,json_object('schema','dtf_unit_print_v1','request_id',?,'unit_key',json_extract(value,'$.unit_key'),'source_hash',json_extract(value,'$.source_hash'),'quantity',json_extract(value,'$.quantity')),?,? FROM json_each(?)").bind(input.request_id,input.id,input.request_id,actor,stamp,unitsJson));
  statements.push(db.prepare("UPDATE production_dtf_lines SET produced_batch_id=COALESCE(produced_batch_id,?) WHERE unit_key IN(SELECT json_extract(value,'$.unit_key') FROM json_each(?))").bind(input.id,unitsJson));
 }
 if(input.action==='reverse_print'){
  const units=JSON.stringify(input.units.map(u=>({...u,source_hash:saved.units.find(s=>s.unit_key===u.unit_key).source_hash})));
  statements.push(db.prepare("INSERT INTO production_dtf_audit(id,batch_id,action,actor,created_at) SELECT 'DTFU:'||json_extract(value,'$.unit_key')||':'||?,?,json_object('schema','dtf_unit_print_reversal_v1','request_id',?,'unit_key',json_extract(value,'$.unit_key'),'source_hash',json_extract(value,'$.source_hash'),'quantity',json_extract(value,'$.quantity'),'reverses_request_id',?),?,? FROM json_each(?)").bind(input.request_id,input.id,input.request_id,input.reverses_request_id,actor,stamp,units));
 }
 statements.push(db.prepare('UPDATE production_dtf_batches SET status=?,updated_at=? WHERE id=?').bind(target,stamp,input.id));
 if(input.action==='release_remaining'||completed)statements.push(db.prepare('DELETE FROM production_dtf_reservations WHERE batch_id=?').bind(input.id));
 statements.push(db.prepare('INSERT INTO production_dtf_audit(id,batch_id,action,actor,created_at) VALUES(?,?,?,?,?)').bind(headerId,input.id,JSON.stringify(event),actor,stamp));
 try{await db.batch(statements);}catch{const replay=await db.prepare('SELECT action FROM production_dtf_audit WHERE id=?').bind(headerId).first();if(replay){let event;try{event=JSON.parse(replay.action);}catch{}if(event?.request_hash===requestHash)return {batch:dtfBatch(await db.prepare('SELECT * FROM production_dtf_batches WHERE id=?').bind(input.id).first()),lifecycle:await dtfLifecycleView(db,await db.prepare('SELECT * FROM production_dtf_batches WHERE id=?').bind(input.id).first()),replayed:true};}dtfFail('DTF_LIFECYCLE_CHANGED_REFRESH',409);}
 const updated=await db.prepare('SELECT * FROM production_dtf_batches WHERE id=?').bind(input.id).first();return {batch:dtfBatch(updated),lifecycle:await dtfLifecycleView(db,updated),replayed:false};
}
