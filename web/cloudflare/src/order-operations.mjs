// Internal order stages are owner declarations, separate from provider status,
// DTF printing, manufacturing facts, inventory and financial recognition.
export class OrderOperationsError extends Error {
 constructor(code,status=400,options){super(code,options);this.status=status;}
}
const ooStages=['SEPARATION','PRODUCTION','FINISHING','READY_TO_SHIP'];
const ooDisplay=['NOT_STARTED',...ooStages,'SHIPPED','COMPLETED','CANCELLED','UNPAID','REVIEW'];
const ooStatuses=['UNPAID','READY_TO_SHIP','PROCESSED','RETRY_SHIP','SHIPPED','TO_CONFIRM_RECEIVE','COMPLETED','IN_CANCEL','CANCELLED','INVOICE_PENDING','TO_RETURN','UNKNOWN'];
const ooEligible=['READY_TO_SHIP','PROCESSED','RETRY_SHIP'];
const ooShop='1178167501',ooPlatform='SHOPEE_BR',ooEncoder=new TextEncoder();
const ooPlain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const ooExact=(v,keys)=>ooPlain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
const ooInt=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const ooHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const ooUuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const ooSerial=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const ooId=(v,zero=false)=>typeof v==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(v);
const ooText=(v,max,empty=false)=>typeof v==='string'&&(empty||v.length>0)&&ooEncoder.encode(v).byteLength<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
const ooDate=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const ooFail=(suffix,status=503)=>{throw new OrderOperationsError('ORDER_OPERATIONS_'+suffix,status);};
function ooClock(now){let v;try{v=Math.floor(now()/1000);}catch{}if(!ooInt(v,1,9999999999))ooFail('UNAVAILABLE');return v;}
const ooDay=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
function ooSelection(input,stamp){
 if(!ooExact(input,['start_date','end_date','status','page'])||!ooDate(input.start_date)||!ooDate(input.end_date)||input.end_date>ooDay(stamp)||!['ALL','ACTIVE',...ooDisplay].includes(input.status)||!ooInt(input.page,1,1000000))ooFail('REQUEST_INVALID',400);
 const days=(Date.parse(input.end_date)-Date.parse(input.start_date))/86400000;
 if(days<0||days>30)ooFail('REQUEST_INVALID',400);return {...input};
}
// The SQL representation uses the same field order and binary key ordering as
// ooLinesCanonical. It excludes observation/status clocks, so refreshing an
// unchanged order does not invalidate an owner's declaration. Keeping the
// immutable representation beside its SHA permits period-wide SQL counters
// and filters without loading all historical lines into the Worker.
const ooSQLLines="(SELECT json_group_array(json_object('unit_key',l.unit_key,'line_key',l.line_key,'payload',l.payload,'source_hash',l.source_hash)) FROM (SELECT unit_key,line_key,payload,source_hash FROM production_dtf_lines WHERE order_id=o.order_id AND missing=0 ORDER BY line_key,unit_key) l)";
const ooSQLChanged='(e.to_stage IS NOT NULL AND e.lines_json<>'+ooSQLLines+')';
const ooSQLStage="CASE WHEN o.status IN('SHIPPED','TO_CONFIRM_RECEIVE') THEN 'SHIPPED' WHEN o.status='COMPLETED' THEN 'COMPLETED' WHEN o.status='CANCELLED' THEN 'CANCELLED' WHEN o.status='UNPAID' THEN 'UNPAID' WHEN o.status NOT IN('READY_TO_SHIP','PROCESSED','RETRY_SHIP') OR o.source_hash='0000000000000000000000000000000000000000000000000000000000000000' OR "+ooSQLChanged+" THEN 'REVIEW' ELSE COALESCE(e.to_stage,'NOT_STARTED') END";

export const ORDER_OPERATIONS_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS order_operations_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 2147483645),mutation_id TEXT NOT NULL,updated_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS order_operations_events(revision INTEGER PRIMARY KEY CHECK(revision BETWEEN 1 AND 2147483645),request_id TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,platform TEXT NOT NULL CHECK(platform='SHOPEE_BR'),shop_id TEXT NOT NULL CHECK(shop_id='1178167501'),order_id TEXT NOT NULL,source_hash TEXT NOT NULL,line_fingerprint TEXT NOT NULL CHECK(length(line_fingerprint)=64),lines_json TEXT NOT NULL CHECK(length(CAST(lines_json AS BLOB))<=1048576),from_stage TEXT,to_stage TEXT NOT NULL CHECK(to_stage IN('SEPARATION','PRODUCTION','FINISHING','READY_TO_SHIP')),reason TEXT NOT NULL,actor TEXT NOT NULL,created_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS order_operations_guard(id INTEGER PRIMARY KEY CHECK(id=1),ok INTEGER NOT NULL CONSTRAINT order_operations_atomic_guard CHECK(ok=1))`,
 `CREATE INDEX IF NOT EXISTS order_operations_identity ON order_operations_events(platform,shop_id,order_id,revision DESC)`,
 `CREATE TRIGGER IF NOT EXISTS order_operations_events_no_update BEFORE UPDATE ON order_operations_events BEGIN SELECT RAISE(ABORT,'ORDER_OPERATIONS_IMMUTABLE'); END`,
 `CREATE TRIGGER IF NOT EXISTS order_operations_events_no_delete BEFORE DELETE ON order_operations_events BEGIN SELECT RAISE(ABORT,'ORDER_OPERATIONS_IMMUTABLE'); END`,
];
const ooNormalizeSQL=v=>v.replace(/IF NOT EXISTS /gi,'').replace(/\s+/g,' ').trim();
const ooObjects=ORDER_OPERATIONS_SCHEMA.map(sql=>({sql,name:/CREATE (?:TABLE|INDEX|TRIGGER) IF NOT EXISTS ([a-z_]+)/.exec(sql)[1]}));
function ooDB(env){const db=env?.ADMIN_DB;if(!db?.prepare||!db?.batch)ooFail('UNAVAILABLE');return db;}
function ooResults(value){if(value?.success===false||!Array.isArray(value?.results))ooFail('STORAGE_INVALID');return value.results;}
async function ooProbe(db){
 const rows=ooResults(await db.prepare("SELECT name,type,sql FROM sqlite_master WHERE name LIKE 'order_operations_%' OR (type='table' AND name IN('production_dtf_orders','production_dtf_lines','production_dtf_sync_state'))").all());
 const own=rows.filter(v=>v.name.startsWith('order_operations_'));
 if(own.length&&(own.length!==ooObjects.length||ooObjects.some(v=>!own.some(row=>row.name===v.name&&typeof row.sql==='string'&&ooNormalizeSQL(row.sql)===ooNormalizeSQL(v.sql)))))ooFail('STORAGE_INVALID');
 const sourceNames=rows.filter(v=>v.type==='table'&&v.name.startsWith('production_dtf_')).map(v=>v.name),source=sourceNames.includes('production_dtf_orders')&&sourceNames.includes('production_dtf_lines');
 if(sourceNames.some(v=>['production_dtf_orders','production_dtf_lines'].includes(v))&&!source)ooFail('STORAGE_INVALID');
 return {store:own.length>0,source,sync:sourceNames.includes('production_dtf_sync_state')};
}
async function ooState(db,present){
 if(!present)return {revision:0,updated_at:null};
 const rows=ooResults(await db.prepare('SELECT (SELECT COUNT(*) FROM order_operations_state) AS states,(SELECT revision FROM order_operations_state WHERE id=1) AS revision,(SELECT mutation_id FROM order_operations_state WHERE id=1) AS mutation_id,(SELECT updated_at FROM order_operations_state WHERE id=1) AS updated_at,COUNT(*) AS events,MIN(revision) AS first_revision,MAX(revision) AS last_revision,MAX(created_at) AS last_created_at FROM order_operations_events').all());
 if(rows.length!==1)ooFail('STORAGE_INVALID');const r=rows[0];
 if(r.states===0&&r.events===0&&r.revision===null)return {revision:0,updated_at:null};
 if(r.states!==1||!ooInt(r.revision,1,2147483645)||!ooUuid(r.mutation_id)||!ooInt(r.updated_at,1,9999999999)||r.events!==r.revision||r.first_revision!==1||r.last_revision!==r.revision||r.last_created_at!==r.updated_at)ooFail('STORAGE_INVALID');
 return {revision:r.revision,updated_at:r.updated_at};
}
function ooJoin(store){return store?" LEFT JOIN order_operations_events e ON e.revision=(SELECT MAX(x.revision) FROM order_operations_events x WHERE x.platform='SHOPEE_BR' AND x.shop_id='1178167501' AND x.order_id=o.order_id) ":" LEFT JOIN (SELECT NULL AS revision,NULL AS order_id,NULL AS to_stage,NULL AS reason,NULL AS created_at,NULL AS line_fingerprint,NULL AS lines_json) e ON 0 ";}
function ooWhere(selected){return {sql:'o.create_time>=? AND o.create_time<?',args:[Date.parse(selected.start_date+'T00:00:00-03:00')/1000,Date.parse(selected.end_date+'T00:00:00-03:00')/1000+86400]};}
function ooFilter(status){return status==='ALL'?'1':status==='ACTIVE'?"stage IN('NOT_STARTED','SEPARATION','PRODUCTION','FINISHING','READY_TO_SHIP')":'stage=?';}
function ooOrderRow(row,stamp){
 if(!ooSerial(row.order_id)||!ooStatuses.includes(row.status)||!ooInt(row.create_time,1,stamp+60)||!ooInt(row.update_time,row.create_time,stamp+60)||!ooInt(row.checked_at,1,stamp+60)||!ooHash(row.source_hash)||row.local_stage!==null&&!ooStages.includes(row.local_stage)||row.local_stage!==null&&(!ooText(row.local_reason,240)||!ooInt(row.local_updated_at,1,stamp)||!ooHash(row.local_line_fingerprint)||typeof row.local_lines_json!=='string'||ooEncoder.encode(row.local_lines_json).byteLength>1048576))ooFail('STORAGE_INVALID');
 return row;
}
function ooLine(row){
 try{
  if(!ooSerial(row.order_id)||!ooHash(row.unit_key)||!ooHash(row.source_hash)||!ooInt(row.checked_at,1,9999999999)||typeof row.payload!=='string'||ooEncoder.encode(row.payload).byteLength>4096||row.missing!==0)throw Error();
  const v=JSON.parse(row.payload);if(!ooExact(v,['item_id','model_id','sku','quantity','model_name','requires_pair'])||!ooId(v.item_id)||!ooId(v.model_id,true)||row.line_key!==v.item_id+':'+v.model_id||!ooText(v.sku,128,true)||!ooText(v.model_name,256,true)||!ooInt(v.quantity,1,10000)||typeof v.requires_pair!=='boolean')throw Error();
  return {item_id:v.item_id,model_id:v.model_id,sku:v.sku,quantity:v.quantity,model_name:v.model_name,missing:false};
 }catch{return null;}
}
async function ooSourceIntegrity(row,lines){
 if(lines.length===0||lines.length>200||row.line_count!==undefined&&row.line_count!==lines.length)return false;
 const evidence=await Promise.all(lines.map(async line=>{
  const value=ooLine(line);if(!value||line.checked_at!==row.checked_at||await ooDigest(line.payload)!==line.source_hash||await ooDigest([line.order_id,line.line_key])!==line.unit_key)return null;
  return [line.line_key,await ooDigest([value.item_id,value.model_id,value.sku,value.quantity,value.model_name])];
 }));
 if(evidence.some(v=>v===null))return false;evidence.sort((a,b)=>a[0].localeCompare(b[0]));
 return row.source_hash===await ooDigest({status:row.status,create_time:row.create_time,update_time:row.update_time,lines:evidence});
}
function ooLinesCanonical(lines){return JSON.stringify([...lines].sort((a,b)=>a.line_key<b.line_key?-1:a.line_key>b.line_key?1:a.unit_key<b.unit_key?-1:a.unit_key>b.unit_key?1:0).map(v=>({unit_key:v.unit_key,line_key:v.line_key,payload:v.payload,source_hash:v.source_hash})));}
async function ooHistoricalIntegrity(row){if(row.local_stage!==null&&await ooDigest(row.local_lines_json)!==row.local_line_fingerprint)ooFail('STORAGE_INVALID');}
function ooProjectedOrder(row,rawLines,stamp,integrity){
 ooOrderRow(row,stamp);const active=rawLines.filter(v=>v.order_id===row.order_id),good=active.map(v=>ooLine(v)),stale=stamp-row.checked_at>300,blocked=[];
 if(stale)blocked.push('SOURCE_STALE');if(!ooEligible.includes(row.status))blocked.push('STATUS_NOT_ELIGIBLE');
 if(!integrity)blocked.push('SOURCE_CONFLICT');
 if(active.length===0||active.length>200)blocked.push('SOURCE_INCOMPLETE');
 const lines=good.filter(Boolean),selling_units=integrity?lines.reduce((n,v)=>n+v.quantity,0):null;
 return {identity:{platform:ooPlatform,shop_id:ooShop,order_id:row.order_id},source_hash:row.source_hash,provider:{status:row.status,created_at:row.create_time,updated_at:row.update_time,checked_at:row.checked_at,age_seconds:Math.max(0,stamp-row.checked_at),stale},operation:{stage:row.local_stage,updated_at:row.local_updated_at,reason:row.local_reason,lines_changed:row.local_stage!==null&&row.local_lines_json!==ooLinesCanonical(active)},display_stage:row.stage,can_update:blocked.length===0,blocked_reasons:blocked,lines:lines.slice(0,8),lines_total:row.line_count,lines_limited:row.line_count>8,selling_units};
}
function ooEmpty(selected,stamp,revision,source=false){return {schema:'order_operations_workspace_v1',checked_at:stamp,revision,selection:selected,pagination:{page:selected.page,page_size:50,total_orders:0,pages:0,has_more:false},coverage:{state:source?'PARTIAL':'NOT_CAPTURED',source:'SAVED_SHOPEE_DTF_CACHE',period_complete:false,orders_in_period:0,oldest_checked_at:null,latest_checked_at:null,last_sync_at:null,history_next_date:null},platforms:[{platform:ooPlatform,shop_id:ooShop,connection:source?'SAVED_SOURCE':'NOT_CAPTURED'},{platform:'MERCADO_LIVRE_BR',shop_id:null,connection:'NOT_CONNECTED'},{platform:'TIKTOK_SHOP_BR',shop_id:null,connection:'NOT_CONNECTED'}],totals:{orders:0,by_stage:Object.fromEntries(ooDisplay.map(v=>[v,0]))},orders:[]};}
export async function readOrderOperationsWorkspace(env,input,{now=()=>Date.now()}={}){
 try{
  const stamp=ooClock(now),selected=ooSelection(input,stamp),db=ooDB(env),probe=await ooProbe(db),state=await ooState(db,probe.store),empty=ooEmpty(selected,stamp,state.revision,probe.source);if(!probe.source)return empty;
  const where=ooWhere(selected),join=ooJoin(probe.store),base='SELECT o.order_id,o.status,o.create_time,o.update_time,o.checked_at,o.source_hash,e.to_stage AS local_stage,e.reason AS local_reason,e.created_at AS local_updated_at,e.line_fingerprint AS local_line_fingerprint,e.lines_json AS local_lines_json,'+ooSQLStage+' AS stage FROM production_dtf_orders o'+join+' WHERE '+where.sql,filter=ooFilter(selected.status),filterArgs=['ALL','ACTIVE'].includes(selected.status)?[]:[selected.status];
  const result=await db.batch([
   db.prepare('SELECT stage,COUNT(*) AS orders,MIN(checked_at) AS oldest,MAX(checked_at) AS latest FROM ('+base+') orders GROUP BY stage').bind(...where.args),
   db.prepare('SELECT COUNT(*) AS total FROM ('+base+') orders WHERE '+filter).bind(...where.args,...filterArgs),
   db.prepare('SELECT orders.*,(SELECT COUNT(*) FROM production_dtf_lines l WHERE l.order_id=orders.order_id AND l.missing=0) AS line_count FROM ('+base+') orders WHERE '+filter+' ORDER BY create_time DESC,order_id LIMIT 50 OFFSET ?').bind(...where.args,...filterArgs,(selected.page-1)*50),
   ...(probe.sync?[db.prepare('SELECT last_sync_at,history_next_date FROM production_dtf_sync_state WHERE id=1')]:[]),
  ]);
  const grouped=ooResults(result[0]),counts=ooResults(result[1]),rows=ooResults(result[2]);if(counts.length!==1||!ooInt(counts[0].total)||rows.length>50)ooFail('STORAGE_INVALID');
  let total=0,oldest=null,latest=null;const stages={...empty.totals.by_stage};for(const row of grouped){if(!ooDisplay.includes(row.stage)||!ooInt(row.orders,1)||!ooInt(row.oldest,1,stamp+60)||!ooInt(row.latest,row.oldest,stamp+60))ooFail('STORAGE_INVALID');stages[row.stage]=row.orders;total+=row.orders;oldest=Math.min(oldest??row.oldest,row.oldest);latest=Math.max(latest??row.latest,row.latest);}
  if(!ooInt(total)||counts[0].total>total)ooFail('STORAGE_INVALID');
  const ids=JSON.stringify(rows.map(r=>r.order_id)),rawLines=rows.length?ooResults(await db.prepare('SELECT * FROM (SELECT l.unit_key,l.order_id,l.line_key,l.payload,l.source_hash,l.checked_at,l.missing,ROW_NUMBER() OVER(PARTITION BY l.order_id ORDER BY l.line_key) AS row_number FROM production_dtf_lines l WHERE l.missing=0 AND l.order_id IN(SELECT value FROM json_each(?))) WHERE row_number<=201 ORDER BY order_id,line_key').bind(ids).all()):[];
  const orders=await Promise.all(rows.map(async row=>{ooOrderRow(row,stamp);await ooHistoricalIntegrity(row);return ooProjectedOrder(row,rawLines,stamp,await ooSourceIntegrity(row,rawLines.filter(v=>v.order_id===row.order_id)));}));
  let last_sync_at=null,history_next_date=null;if(probe.sync){const sync=ooResults(result[3]);if(sync.length>1)ooFail('STORAGE_INVALID');if(sync.length){({last_sync_at,history_next_date}=sync[0]);if(last_sync_at!==null&&!ooInt(last_sync_at,1,stamp+60)||history_next_date!==null&&!ooDate(history_next_date))ooFail('STORAGE_INVALID');}}
  // An independent page read is never labelled as full provider coverage. The
  // global revision fence prevents a concurrently changed stage from being
  // paired with old counters; the next GET can retry without changing facts.
  if((await ooState(db,(await ooProbe(db)).store)).revision!==state.revision)ooFail('CONFLICT',409);
  const value={...empty,pagination:{page:selected.page,page_size:50,total_orders:counts[0].total,pages:Math.ceil(counts[0].total/50),has_more:selected.page*50<counts[0].total},coverage:{...empty.coverage,orders_in_period:total,oldest_checked_at:oldest,latest_checked_at:latest,last_sync_at,history_next_date},totals:{orders:total,by_stage:stages},orders};
  if(ooEncoder.encode(JSON.stringify(value)).byteLength>1048576)ooFail('LIMIT',409);return value;
 }catch(error){if(error instanceof OrderOperationsError)throw error;throw new OrderOperationsError('ORDER_OPERATIONS_UNAVAILABLE',503,{cause:error});}
}
async function ooDigest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',ooEncoder.encode(typeof value==='string'?value:JSON.stringify(value)))),v=>v.toString(16).padStart(2,'0')).join('');}
function ooRequest(v){
 if(!ooExact(v,['request_id','revision','identity','source_hash','from_stage','to_stage','reason','confirmed'])||!ooUuid(v.request_id)||!ooInt(v.revision,0,2147483644)||!ooExact(v.identity,['platform','shop_id','order_id'])||v.identity.platform!==ooPlatform||v.identity.shop_id!==ooShop||!ooSerial(v.identity.order_id)||!ooHash(v.source_hash)||v.from_stage!==null&&!ooStages.includes(v.from_stage)||!ooStages.includes(v.to_stage)||!ooText(v.reason,240)||v.reason.trim()!==v.reason||v.confirmed!==true)ooFail('REQUEST_INVALID',400);
 return {request_id:v.request_id,revision:v.revision,identity:{platform:ooPlatform,shop_id:ooShop,order_id:v.identity.order_id},source_hash:v.source_hash,from_stage:v.from_stage,to_stage:v.to_stage,reason:v.reason,confirmed:true};
}
async function ooReplay(db,probe,body,requestHash){
 if(!probe.store)return null;const row=await db.prepare('SELECT revision,request_hash,platform,shop_id,order_id,to_stage FROM order_operations_events WHERE request_id=?').bind(body.request_id).first();
 if(!row)return null;if(row.request_hash!==requestHash||row.platform!==ooPlatform||row.shop_id!==ooShop||row.order_id!==body.identity.order_id||row.to_stage!==body.to_stage||!ooInt(row.revision,1,2147483645))ooFail('CONFLICT',409);
 return {schema:'order_operations_mutation_v1',request_id:body.request_id,revision:row.revision,replayed:true};
}
function ooGuardSource(db,source,lines){
 const data=JSON.stringify(lines.map(v=>({unit_key:v.unit_key,line_key:v.line_key,payload:v.payload,source_hash:v.source_hash,checked_at:v.checked_at,missing:v.missing}))),sql="EXISTS(SELECT 1 FROM production_dtf_orders WHERE order_id=? AND status=? AND create_time=? AND update_time=? AND checked_at=? AND source_hash=?) AND (SELECT COUNT(*) FROM production_dtf_lines WHERE order_id=? AND missing=0)=? AND NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN production_dtf_lines l ON l.unit_key=json_extract(j.value,'$.unit_key') WHERE l.unit_key IS NULL OR l.order_id<>? OR l.line_key<>json_extract(j.value,'$.line_key') OR l.payload<>json_extract(j.value,'$.payload') OR l.source_hash<>json_extract(j.value,'$.source_hash') OR l.checked_at<>json_extract(j.value,'$.checked_at') OR l.missing<>0)";
 return {sql,args:[source.order_id,source.status,source.create_time,source.update_time,source.checked_at,source.source_hash,source.order_id,lines.length,data,source.order_id]};
}
export async function mutateOrderOperationsWorkspace(env,input,actor,{now=()=>Date.now()}={}){
 try{
  const stamp=ooClock(now),body=ooRequest(input);if(!ooText(actor,256)||actor.trim()!==actor)ooFail('REQUEST_INVALID',400);
  const db=ooDB(env),probe=await ooProbe(db),requestHash=await ooDigest(body),state=await ooState(db,probe.store),replay=await ooReplay(db,probe,body,requestHash);if(replay)return replay;
  if(state.revision!==body.revision)ooFail('CONFLICT',409);if(!probe.source)ooFail('NOT_FOUND',404);
  const source=await db.prepare('SELECT o.order_id,o.status,o.create_time,o.update_time,o.checked_at,o.source_hash,e.to_stage AS local_stage,e.reason AS local_reason,e.created_at AS local_updated_at,e.line_fingerprint AS local_line_fingerprint,e.lines_json AS local_lines_json FROM production_dtf_orders o'+ooJoin(probe.store)+' WHERE o.order_id=?').bind(body.identity.order_id).first();
  if(!source)ooFail('NOT_FOUND',404);ooOrderRow(source,stamp);if(source.source_hash!==body.source_hash)ooFail('SOURCE_CHANGED',409);if(stamp-source.checked_at>300)ooFail('SOURCE_STALE',409);if(!ooEligible.includes(source.status)||source.source_hash==='0'.repeat(64))ooFail('STATUS_BLOCKED',409);
  const lines=ooResults(await db.prepare('SELECT unit_key,order_id,line_key,payload,source_hash,checked_at,missing FROM production_dtf_lines WHERE order_id=? AND missing=0 ORDER BY line_key LIMIT 201').bind(source.order_id).all());
  if(!await ooSourceIntegrity(source,lines))ooFail('SOURCE_CHANGED',409);await ooHistoricalIntegrity(source);
  const linesJson=ooLinesCanonical(lines),lineFingerprint=await ooDigest(linesJson);if(ooEncoder.encode(linesJson).byteLength>1048576)ooFail('LIMIT',409);
  if(source.local_stage!==body.from_stage)ooFail('CONFLICT',409);const previous=ooStages.indexOf(body.from_stage),next=ooStages.indexOf(body.to_stage);if(next>previous+1)ooFail('TRANSITION_INVALID',409);
  if(!probe.store){await db.batch(ORDER_OPERATIONS_SCHEMA.map(sql=>db.prepare(sql)));await ooProbe(db);}
  const finished=ooClock(now);if(finished<stamp||finished-stamp>60)ooFail('SOURCE_CHANGED',409);
  const revision=body.revision+1,mutation=crypto.randomUUID(),guard=ooGuardSource(db,source,lines),claim='EXISTS(SELECT 1 FROM order_operations_state WHERE id=1 AND revision=? AND mutation_id=?)',claimArgs=[revision,mutation],gate=body.revision===0?db.prepare('INSERT OR IGNORE INTO order_operations_state(id,revision,mutation_id,updated_at) SELECT 1,1,?,? WHERE '+guard.sql).bind(mutation,stamp,...guard.args):db.prepare('UPDATE order_operations_state SET revision=revision+1,mutation_id=?,updated_at=? WHERE id=1 AND revision=? AND updated_at<=? AND '+guard.sql).bind(mutation,stamp,body.revision,stamp,...guard.args);
  const result=await db.batch([
   gate,
   db.prepare('INSERT INTO order_operations_events(revision,request_id,request_hash,platform,shop_id,order_id,source_hash,line_fingerprint,lines_json,from_stage,to_stage,reason,actor,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE '+claim).bind(revision,body.request_id,requestHash,ooPlatform,ooShop,source.order_id,source.source_hash,lineFingerprint,linesJson,body.from_stage,body.to_stage,body.reason,actor,stamp,...claimArgs),
   db.prepare('INSERT INTO order_operations_guard(id,ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM order_operations_events WHERE revision=? AND request_id=? AND request_hash=?) THEN 1 ELSE 0 END WHERE '+claim+' ON CONFLICT(id) DO UPDATE SET ok=excluded.ok').bind(revision,body.request_id,requestHash,...claimArgs),
  ]);
  if(result[0]?.meta?.changes!==1){const checked=await ooReplay(db,{store:true},body,requestHash);if(checked)return checked;ooFail('SOURCE_CHANGED',409);}
  if(result.some(v=>v?.success===false||v?.meta?.changes!==1))ooFail('STORAGE_INVALID');
  return {schema:'order_operations_mutation_v1',request_id:body.request_id,revision,replayed:false};
 }catch(error){if(error instanceof OrderOperationsError)throw error;throw new OrderOperationsError('ORDER_OPERATIONS_UNAVAILABLE',503,{cause:error});}
}
