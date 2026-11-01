import {projectPhysicalReturns} from './physical-returns.mjs';
import {projectIncurredProduction} from './incurred-production.mjs';

export class ReturnManufacturingLinksError extends Error{
 constructor(code,status=400,options){super(code,options);this.status=status;}
}
export const RETURN_MANUFACTURING_LINKS_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS return_manufacturing_links_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,mutation_id TEXT NOT NULL,updated_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS return_manufacturing_links_records(link_id TEXT PRIMARY KEY,case_hash TEXT NOT NULL,physical_line_id TEXT NOT NULL,production_record_id TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10000),status TEXT NOT NULL CHECK(status IN('ACTIVE','VOID')),payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=16384))`,
 `CREATE TABLE IF NOT EXISTS return_manufacturing_links_audit(revision INTEGER PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,link_id TEXT NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=65536),actor TEXT NOT NULL,created_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS return_manufacturing_links_guard(id INTEGER PRIMARY KEY CHECK(id=1),ok INTEGER NOT NULL CONSTRAINT return_manufacturing_links_atomic_guard CHECK(ok=1),source_ok INTEGER NOT NULL CONSTRAINT return_manufacturing_links_source_guard CHECK(source_ok=1))`,
 `CREATE INDEX IF NOT EXISTS return_manufacturing_links_physical_active ON return_manufacturing_links_records(case_hash,physical_line_id) WHERE status='ACTIVE'`,
 `CREATE INDEX IF NOT EXISTS return_manufacturing_links_production_active ON return_manufacturing_links_records(production_record_id) WHERE status='ACTIVE'`,
 `CREATE UNIQUE INDEX IF NOT EXISTS return_manufacturing_links_pair_active ON return_manufacturing_links_records(case_hash,physical_line_id,production_record_id) WHERE status='ACTIVE'`,
];
// Physical quality may change without changing the origin of a received piece.
// These guards freeze origin/quantity, not inspection partition or condition.
export const RETURN_MANUFACTURING_LINKS_TRIGGERS=[
 `CREATE TRIGGER IF NOT EXISTS return_manufacturing_links_physical_update BEFORE UPDATE OF payload,case_hash,order_hash ON physical_returns_cases WHEN EXISTS(SELECT 1 FROM return_manufacturing_links_records a WHERE a.case_hash=OLD.case_hash AND a.status='ACTIVE' AND (NEW.case_hash IS NOT OLD.case_hash OR NEW.order_hash IS NOT OLD.order_hash OR json_extract(NEW.payload,'$.case_hash') IS NOT json_extract(OLD.payload,'$.case_hash') OR json_extract(NEW.payload,'$.order_hash') IS NOT json_extract(OLD.payload,'$.order_hash') OR NOT EXISTS(SELECT 1 FROM json_each(OLD.payload,'$.lines') oldline JOIN json_each(NEW.payload,'$.lines') newline ON json_extract(oldline.value,'$.line_id')=json_extract(newline.value,'$.line_id') WHERE json_extract(oldline.value,'$.line_id')=a.physical_line_id AND json_extract(newline.value,'$.status')<>'VOID' AND json_extract(newline.value,'$.quantity') IS json_extract(oldline.value,'$.quantity') AND json_extract(newline.value,'$.received_at') IS json_extract(oldline.value,'$.received_at') AND json_type(newline.value,'$.identity')='object' AND (SELECT COUNT(DISTINCT key) FROM json_each(newline.value,'$.identity'))=9 AND NOT EXISTS(SELECT 1 FROM json_each(newline.value,'$.identity') WHERE key NOT IN('artwork','color','size','garment_type','fit','confirmed','item_id','model_id','sku')) AND json_extract(newline.value,'$.identity.artwork') IS json_extract(oldline.value,'$.identity.artwork') AND json_extract(newline.value,'$.identity.color') IS json_extract(oldline.value,'$.identity.color') AND json_extract(newline.value,'$.identity.size') IS json_extract(oldline.value,'$.identity.size') AND json_extract(newline.value,'$.identity.garment_type') IS json_extract(oldline.value,'$.identity.garment_type') AND json_extract(newline.value,'$.identity.fit') IS json_extract(oldline.value,'$.identity.fit') AND json_extract(newline.value,'$.identity.confirmed') IS json_extract(oldline.value,'$.identity.confirmed') AND json_extract(newline.value,'$.identity.item_id') IS json_extract(oldline.value,'$.identity.item_id') AND json_extract(newline.value,'$.identity.model_id') IS json_extract(oldline.value,'$.identity.model_id') AND json_extract(newline.value,'$.identity.sku') IS json_extract(oldline.value,'$.identity.sku')))) BEGIN SELECT RAISE(ABORT,'MLS_RETURN_MANUFACTURING_LINK_ACTIVE'); END`,
 `CREATE TRIGGER IF NOT EXISTS return_manufacturing_links_physical_delete BEFORE DELETE ON physical_returns_cases WHEN EXISTS(SELECT 1 FROM return_manufacturing_links_records a WHERE a.case_hash=OLD.case_hash AND a.status='ACTIVE') BEGIN SELECT RAISE(ABORT,'MLS_RETURN_MANUFACTURING_LINK_ACTIVE'); END`,
 `CREATE TRIGGER IF NOT EXISTS return_manufacturing_links_production_update BEFORE UPDATE OF payload,record_id ON incurred_production_records WHEN EXISTS(SELECT 1 FROM return_manufacturing_links_records a WHERE a.production_record_id=OLD.record_id AND a.status='ACTIVE') AND (NEW.record_id IS NOT OLD.record_id OR NEW.payload IS NOT OLD.payload) BEGIN SELECT RAISE(ABORT,'MLS_RETURN_MANUFACTURING_LINK_ACTIVE'); END`,
 `CREATE TRIGGER IF NOT EXISTS return_manufacturing_links_production_delete BEFORE DELETE ON incurred_production_records WHEN EXISTS(SELECT 1 FROM return_manufacturing_links_records a WHERE a.production_record_id=OLD.record_id AND a.status='ACTIVE') BEGIN SELECT RAISE(ABORT,'MLS_RETURN_MANUFACTURING_LINK_ACTIVE'); END`,
];

// Self-contained browser projection. Quantities remain operator declarations;
// a link grants neither recovered inventory value nor a verified order count.
export function projectReturnManufacturingLinks(value){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
 const array=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
 const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&v.normalize('NFC')===v&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
 const id=(v,zero=false)=>v===null||typeof v==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(v),nullable=(v,max)=>v===null||text(v,max),norm=v=>v.normalize('NFKC').toLowerCase().replace(/\s+/g,' '),stable=v=>plain(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,stable(v[key])])):v;
 const identity=v=>exact(v,['artwork','color','size','garment_type','fit','confirmed','item_id','model_id','sku'])&&text(v.artwork,120)&&text(v.color,80)&&text(v.size,16)&&v.confirmed===true&&['ADULT','CHILD'].includes(v.garment_type)&&['UNISEX','MALE','FEMALE'].includes(v.fit)&&id(v.item_id)&&id(v.model_id,true)&&nullable(v.sku,128)&&(v.garment_type==='ADULT'?['P','M','G','GG','G1','G2','G3']:['2','4','6','8','10','12','14','16']).includes(v.size);
 const equal=(a,b)=>['artwork','color','size','garment_type','fit'].every(key=>norm(a[key])===norm(b[key]))&&['item_id','model_id'].every(key=>a[key]===null||b[key]===null||a[key]===b[key])&&(a.sku===null||b.sku===null||norm(a.sku)===norm(b.sku));
 const date=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
 const formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}),encoder=new TextEncoder();
 const protectionNames=['return_manufacturing_links_physical_active','return_manufacturing_links_production_active','return_manufacturing_links_pair_active','return_manufacturing_links_physical_update','return_manufacturing_links_physical_delete','return_manufacturing_links_production_update','return_manufacturing_links_production_delete'];
 try{
  if(!exact(value,['schema','checked_at','revision','links','protection','summary','original_quantities','allocated_inventory_value_cents','financial_integration_allowed','external_stock_write_allowed','basis'])||value.schema!=='return_manufacturing_links_v1'||!int(value.checked_at,1,9999999999)||!int(value.revision,0,2147483645)||!array(value.links,1000)||!exact(value.protection,['state','missing'])||!['NOT_INITIALIZED','READY','INCOMPLETE'].includes(value.protection.state)||!array(value.protection.missing,7)||!value.protection.missing.every(name=>protectionNames.includes(name))||new Set(value.protection.missing).size!==value.protection.missing.length||((value.protection.state==='INCOMPLETE')!==!!value.protection.missing.length)||!exact(value.summary,['active_links','voided_links','linked_quantity'])||!exact(value.original_quantities,['state','expected_quantity','verified_quantity'])||value.original_quantities.state!=='UNAVAILABLE'||value.original_quantities.expected_quantity!==null||value.original_quantities.verified_quantity!==null||value.allocated_inventory_value_cents!==null||value.financial_integration_allowed!==false||value.external_stock_write_allowed!==false||value.basis!=='OPERATOR_DECLARED_RETURN_MANUFACTURING_ASSOCIATIONS_NOT_VERIFIED_ORIGINAL_QUANTITY_OR_STOCK_VALUE')return null;
  const ids=new Set(),pairs=new Set(),physical=new Map(),production=new Map();let active=0,voided=0,quantity=0;
  for(const row of value.links){
   if(!exact(row,['link_id','case_hash','physical_line_id','production_record_id','quantity','physical_snapshot','production_snapshot','match_basis','evidence','status','created_at','updated_at','void_reason'])||!uuid(row.link_id)||ids.has(row.link_id)||!hash(row.case_hash)||!uuid(row.physical_line_id)||!uuid(row.production_record_id)||!int(row.quantity,1,10000)||!text(row.evidence,240)||!['ACTIVE','VOID'].includes(row.status)||!int(row.created_at,1,value.checked_at)||!int(row.updated_at,row.created_at,value.checked_at)||(row.status==='ACTIVE'?row.void_reason!==null:!text(row.void_reason,240)))return null;
   const a=row.physical_snapshot,b=row.production_snapshot;
   if(!exact(a,['fingerprint','order_hash','received_at','quantity','identity'])||!hash(a.fingerprint)||!hash(a.order_hash)||!int(a.received_at,1,row.created_at)||!int(a.quantity,row.quantity,10000)||!identity(a.identity)||!exact(b,['fingerprint','order_hash','produced_date','quantity','identity'])||!hash(b.fingerprint)||b.order_hash!==null&&!hash(b.order_hash)||!date(b.produced_date)||b.produced_date>formatter.format(new Date(a.received_at*1000))||!int(b.quantity,row.quantity,10000)||!identity(b.identity)||!equal(a.identity,b.identity)||b.order_hash!==null&&b.order_hash!==a.order_hash||row.match_basis!==(b.order_hash===null?'DECLARED_WITH_UNKNOWN_PRODUCTION_ORDER':'DECLARED_SAME_SAVED_ORDER'))return null;
   ids.add(row.link_id);
   if(row.status==='VOID')voided++;
   else{
    active++;quantity+=row.quantity;const pk=row.case_hash+':'+row.physical_line_id,pair=pk+':'+row.production_record_id;if(pairs.has(pair))return null;pairs.add(pair);
    for(const [map,key,snapshot] of [[physical,pk,a],[production,row.production_record_id,b]]){const old=map.get(key);if(old&&JSON.stringify(stable(old.snapshot))!==JSON.stringify(stable(snapshot)))return null;const sum=(old?.quantity??0)+row.quantity;if(sum>snapshot.quantity)return null;map.set(key,{snapshot,quantity:sum});}
   }
   if(encoder.encode(JSON.stringify(row)).byteLength>16384)return null;
  }
  if(!int(quantity)||value.revision<ids.size||value.revision===0&&ids.size!==0||value.revision>0&&ids.size===0||value.protection.state==='NOT_INITIALIZED'&&(value.revision!==0||ids.size!==0)||value.summary.active_links!==active||value.summary.voided_links!==voided||value.summary.linked_quantity!==quantity||encoder.encode(JSON.stringify(value)).byteLength>1048576)return null;
  return JSON.parse(JSON.stringify(value));
 }catch{return null;}
}

export function assessReturnManufacturingLink(context,selection){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v)),exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
 const array=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
 const identity=v=>exact(v,['artwork','color','size','garment_type','fit','confirmed','item_id','model_id','sku']);
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
 const blocked=reason=>({state:'BLOCKED',reason,match_basis:null}),norm=v=>v.normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
 try{
  if(!exact(selection,['case_hash','physical_line_id','production_record_id','quantity','physical_fingerprint','production_fingerprint'])||!hash(selection.case_hash)||!uuid(selection.physical_line_id)||!uuid(selection.production_record_id)||!Number.isSafeInteger(selection.quantity)||selection.quantity<1||selection.quantity>10000||!hash(selection.physical_fingerprint)||!hash(selection.production_fingerprint))return blocked('REQUEST_INVALID');
  if(!exact(context,['state','pending','physical','production','links','summary','original_quantities','allocated_inventory_value_cents','financial_integration_allowed','external_stock_write_allowed'])||context.state!=='READY'||!array(context.physical,1000)||!array(context.production,1000)||!array(context.links,1000))return blocked('CONTEXT_BLOCKED');
  if(context.physical.some(row=>!exact(row,['case_hash','line_id','fingerprint','order_hash','received_at','quantity','identity','status','linked_quantity','remaining_quantity'])||!identity(row.identity))||context.production.some(row=>!exact(row,['record_id','fingerprint','order_hash','produced_date','quantity','identity','status','linked_quantity','remaining_quantity'])||!identity(row.identity))||context.links.some(row=>!exact(row,['link_id','case_hash','physical_line_id','production_record_id','quantity','state','reason'])))return blocked('REQUEST_INVALID');
  const a=context.physical.find(row=>row.case_hash===selection.case_hash&&row.line_id===selection.physical_line_id),b=context.production.find(row=>row.record_id===selection.production_record_id);
  if(!a||!b)return blocked('PARENT_MISSING');if(a.fingerprint!==selection.physical_fingerprint||b.fingerprint!==selection.production_fingerprint)return blocked('PARENT_CHANGED');if(a.status==='VOID'||b.status!=='ACTIVE')return blocked('PARENT_VOID');
  if(a.identity.confirmed!==true||b.identity.confirmed!==true)return blocked('IDENTITY_UNCONFIRMED');
  if(!['artwork','color','size','garment_type','fit'].every(key=>typeof a.identity[key]==='string'&&typeof b.identity[key]==='string'&&norm(a.identity[key])===norm(b.identity[key]))||!['item_id','model_id'].every(key=>a.identity[key]===null||b.identity[key]===null||a.identity[key]===b.identity[key])||a.identity.sku!==null&&b.identity.sku!==null&&norm(a.identity.sku)!==norm(b.identity.sku))return blocked('IDENTITY_MISMATCH');
  if(b.order_hash!==null&&a.order_hash!==b.order_hash)return blocked('ORDER_MISMATCH');
  if(b.produced_date>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(a.received_at*1000)))return blocked('DATE_MISMATCH');
  if(context.links.some(row=>row.state!=='HISTORICAL'&&row.case_hash===a.case_hash&&row.physical_line_id===a.line_id&&row.production_record_id===b.record_id))return blocked('PAIR_EXISTS');
  if(selection.quantity>a.remaining_quantity||selection.quantity>b.remaining_quantity)return blocked('QUANTITY_EXCEEDED');
  return {state:'READY',reason:null,match_basis:b.order_hash===null?'DECLARED_WITH_UNKNOWN_PRODUCTION_ORDER':'DECLARED_SAME_SAVED_ORDER'};
 }catch{return blocked('REQUEST_INVALID');}
}

export function deriveReturnManufacturingLinkContext(ledger,physical,production,handles){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v)),exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
 const array=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),norm=v=>v.normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
 try{
  const frame=projectReturnManufacturingLinks(ledger),pf=physical===null?null:projectPhysicalReturns(physical),mf=production===null?null:projectIncurredProduction(production);
  if(!frame||physical!==null&&!pf||production!==null&&!mf||!exact(handles,['physical','production'])||!array(handles.physical,1000)||!array(handles.production,1000))return null;
  const ph=new Map(),mh=new Map();
  for(const h of handles.physical){if(!exact(h,['case_hash','line_id','fingerprint'])||!hash(h.case_hash)||typeof h.line_id!=='string'||!hash(h.fingerprint))return null;const key=h.case_hash+':'+h.line_id;if(ph.has(key))return null;ph.set(key,h.fingerprint);}
  for(const h of handles.production){if(!exact(h,['record_id','fingerprint'])||typeof h.record_id!=='string'||!hash(h.fingerprint)||mh.has(h.record_id))return null;mh.set(h.record_id,h.fingerprint);}
  const pheld=new Map(),mheld=new Map();let held_quantity=0;
  for(const row of frame.links)if(row.status==='ACTIVE'){const key=row.case_hash+':'+row.physical_line_id;pheld.set(key,(pheld.get(key)??0)+row.quantity);mheld.set(row.production_record_id,(mheld.get(row.production_record_id)??0)+row.quantity);held_quantity+=row.quantity;}
  const physicalRows=[],productionRows=[],pm=new Map(),mm=new Map();
  if(pf)for(const c of pf.cases)for(const line of c.lines){const key=c.case_hash+':'+line.line_id,fingerprint=ph.get(key);if(!fingerprint)return null;const linked_quantity=pheld.get(key)??0,row={case_hash:c.case_hash,line_id:line.line_id,fingerprint,order_hash:c.order_hash,received_at:line.received_at,quantity:line.quantity,identity:line.identity,status:line.status,linked_quantity,remaining_quantity:Math.max(0,line.quantity-linked_quantity)};physicalRows.push(row);pm.set(key,row);}
  if(mf)for(const record of mf.records){const fingerprint=mh.get(record.record_id);if(!fingerprint)return null;const linked_quantity=mheld.get(record.record_id)??0,row={record_id:record.record_id,fingerprint,order_hash:record.source.order_hash,produced_date:record.produced_date,quantity:record.quantity,identity:record.identity,status:record.status,linked_quantity,remaining_quantity:Math.max(0,record.quantity-linked_quantity)};productionRows.push(row);mm.set(row.record_id,row);}
  if(ph.size!==physicalRows.length||mh.size!==productionRows.length)return null;
  const summary={valid_links:0,conflict_links:0,unavailable_links:0,valid_quantity:0,held_quantity},links=[],formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'});
  for(const link of frame.links){
   let state='HISTORICAL',reason=null;
   if(link.status==='ACTIVE'){
    const a=pm.get(link.case_hash+':'+link.physical_line_id),b=mm.get(link.production_record_id);
    if(!pf||!mf){state='UNAVAILABLE';reason='PARENTS_UNAVAILABLE';}
    else if(!a||!b){state='CONFLICT';reason='PARENT_MISSING';}
    else if(a.linked_quantity>a.quantity||b.linked_quantity>b.quantity){state='CONFLICT';reason='CAPACITY_EXCEEDED';}
    else if(a.status==='VOID'||b.status!=='ACTIVE'||a.fingerprint!==link.physical_snapshot.fingerprint||b.fingerprint!==link.production_snapshot.fingerprint||a.identity.confirmed!==true||b.identity.confirmed!==true||!['artwork','color','size','garment_type','fit'].every(key=>typeof a.identity[key]==='string'&&typeof b.identity[key]==='string'&&norm(a.identity[key])===norm(b.identity[key]))||!['item_id','model_id'].every(key=>a.identity[key]===null||b.identity[key]===null||a.identity[key]===b.identity[key])||a.identity.sku!==null&&b.identity.sku!==null&&norm(a.identity.sku)!==norm(b.identity.sku)||b.order_hash!==null&&a.order_hash!==b.order_hash||b.produced_date>formatter.format(new Date(a.received_at*1000))){state='CONFLICT';reason='PARENT_CHANGED';}
    else{state='VALID';summary.valid_links++;summary.valid_quantity+=link.quantity;}
    if(state==='CONFLICT')summary.conflict_links++;if(state==='UNAVAILABLE')summary.unavailable_links++;
   }
   links.push({link_id:link.link_id,case_hash:link.case_hash,physical_line_id:link.physical_line_id,production_record_id:link.production_record_id,quantity:link.quantity,state,reason});
  }
  const pending=[];if(!pf||!mf)pending.push('PARENTS_UNAVAILABLE');if(frame.protection.state==='INCOMPLETE')pending.push('PROTECTION_INCOMPLETE');if(summary.conflict_links)pending.push('ACTIVE_LINK_CONFLICT');
  return {state:pending.length?'BLOCKED':'READY',pending,physical:physicalRows,production:productionRows,links,summary,original_quantities:{state:'UNAVAILABLE',expected_quantity:null,verified_quantity:null},allocated_inventory_value_cents:null,financial_integration_allowed:false,external_stock_write_allowed:false};
 }catch{return null;}
}

const encoder=new TextEncoder(),tableNames=['return_manufacturing_links_state','return_manufacturing_links_records','return_manufacturing_links_audit','return_manufacturing_links_guard'];
const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v)),exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&v.normalize('NFC')===v&&!/[\u0000-\u001f\u007f-\u009f]/.test(v),fail=(suffix,status=400)=>{throw new ReturnManufacturingLinksError('RETURN_MANUFACTURING_LINKS_'+suffix,status);};
const canonical=v=>plain(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,canonical(v[key])])):Array.isArray(v)?v.map(canonical):v;
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(canonical(value))))),v=>v.toString(16).padStart(2,'0')).join('');}
export async function returnManufacturingLinkHandles(physical,production){
 const pf=physical===null?null:projectPhysicalReturns(physical),mf=production===null?null:projectIncurredProduction(production),handles={physical:[],production:[]};
 if(pf)for(const c of pf.cases)for(const line of c.lines)handles.physical.push({case_hash:c.case_hash,line_id:line.line_id,fingerprint:await digest({case_hash:c.case_hash,order_hash:c.order_hash,line_id:line.line_id,quantity:line.quantity,identity:line.identity,received_at:line.received_at})});
 if(mf)for(const row of mf.records)handles.production.push({record_id:row.record_id,fingerprint:await digest(row)});
 return handles;
}

function clock(now){let stamp;try{stamp=now();}catch{}if(!int(stamp,1,9999999999999))fail('CLOCK_INVALID',503);return Math.floor(stamp/1000);}
function database(env){const db=env?.ADMIN_DB;if(!db?.prepare||!db?.batch)fail('UNAVAILABLE',503);return db;}
const objectName=sql=>/^CREATE (?:UNIQUE )?(?:INDEX|TRIGGER) IF NOT EXISTS ([a-z_]+)/.exec(sql)?.[1];
const protectionSql=[...RETURN_MANUFACTURING_LINKS_SCHEMA.slice(4),...RETURN_MANUFACTURING_LINKS_TRIGGERS],protectionNames=protectionSql.map(objectName),ownedNames=[...tableNames,...protectionNames];
const normalizedSql=sql=>typeof sql==='string'?sql.replace(/^(CREATE (?:UNIQUE )?(?:INDEX|TRIGGER)) IF NOT EXISTS /,'$1 ').replace(/\s+/g,' ').trim():null;
async function protection(db){
 const result=await db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name IN ('"+ownedNames.join("','")+"')").all();
 if(result?.success===false||!Array.isArray(result?.results))fail('STORAGE_INVALID',503);
 const objects=new Map();for(const row of result.results){if(!exact(row,['type','name','sql'])||objects.has(row.name))fail('STORAGE_INVALID',503);objects.set(row.name,row);}
 if(objects.size===0)return {state:'NOT_INITIALIZED',missing:[]};
 if(tableNames.some(name=>objects.get(name)?.type!=='table'))fail('STORAGE_INVALID',503);
 const missing=protectionNames.filter((name,index)=>!['index','trigger'].includes(objects.get(name)?.type)||normalizedSql(objects.get(name)?.sql)!==normalizedSql(protectionSql[index]));
 return {state:missing.length?'INCOMPLETE':'READY',missing};
}
function frame(revision,links,stamp,guard){let active_links=0,voided_links=0,linked_quantity=0;for(const row of links)if(row.status==='ACTIVE'){active_links++;linked_quantity+=row.quantity;}else voided_links++;return {schema:'return_manufacturing_links_v1',checked_at:stamp,revision,links,protection:guard,summary:{active_links,voided_links,linked_quantity},original_quantities:{state:'UNAVAILABLE',expected_quantity:null,verified_quantity:null},allocated_inventory_value_cents:null,financial_integration_allowed:false,external_stock_write_allowed:false,basis:'OPERATOR_DECLARED_RETURN_MANUFACTURING_ASSOCIATIONS_NOT_VERIFIED_ORIGINAL_QUANTITY_OR_STOCK_VALUE'};}
function projected(revision,links,stamp,guard){let result;try{result=projectReturnManufacturingLinks(frame(revision,links,stamp,guard));}catch{}if(!result)fail('STORAGE_INVALID',503);return result;}
async function snapshot(db,stamp,requestId=null){
 const guarded=await protection(db);if(guarded.state==='NOT_INITIALIZED')return {state:null,frame:projected(0,[],stamp,guarded),replay:null};
 const parts=await db.batch([
  db.prepare('SELECT revision,mutation_id,updated_at FROM return_manufacturing_links_state WHERE id=1'),
  db.prepare('SELECT link_id,case_hash,physical_line_id,production_record_id,quantity,status,payload FROM return_manufacturing_links_records ORDER BY link_id LIMIT 1001'),
  db.prepare('SELECT request_hash,link_id FROM return_manufacturing_links_audit WHERE request_id=?').bind(requestId??''),
  db.prepare('SELECT COUNT(*) AS count,MIN(revision) AS first_revision,MAX(revision) AS last_revision FROM return_manufacturing_links_audit'),
 ]);
 if(!Array.isArray(parts)||parts.length!==4||parts.some(part=>part?.success===false||!Array.isArray(part?.results))||parts[0].results.length>1||parts[2].results.length>1||parts[3].results.length!==1)fail('STORAGE_INVALID',503);
 const state=parts[0].results[0]??null,stats=parts[3].results[0],links=[];
 if(state&&(!exact(state,['revision','mutation_id','updated_at'])||!int(state.revision,1,2147483645)||!uuid(state.mutation_id)||!int(state.updated_at,1,stamp)))fail('STORAGE_INVALID',503);
 if(!exact(stats,['count','first_revision','last_revision'])||!int(stats.count)||stats.count!==(state?.revision??0)||stats.count===0&&(stats.first_revision!==null||stats.last_revision!==null)||stats.count>0&&(stats.first_revision!==1||stats.last_revision!==state.revision))fail('STORAGE_INVALID',503);
 for(const row of parts[1].results){
  let value;try{if(!exact(row,['link_id','case_hash','physical_line_id','production_record_id','quantity','status','payload'])||typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>16384)throw Error();value=JSON.parse(row.payload);}catch{fail('STORAGE_INVALID',503);}
  if(!['link_id','case_hash','physical_line_id','production_record_id','quantity','status'].every(key=>value?.[key]===row[key]))fail('STORAGE_INVALID',503);links.push(value);
 }
 if(state&&links.some(row=>row.updated_at>state.updated_at))fail('STORAGE_INVALID',503);
 const replay=parts[2].results[0]??null;if(replay&&(!exact(replay,['request_hash','link_id'])||!hash(replay.request_hash)||!uuid(replay.link_id)))fail('STORAGE_INVALID',503);
 return {state,frame:projected(state?.revision??0,links,stamp,guarded),replay};
}
export async function readReturnManufacturingLinks(env,{now=()=>Date.now()}={}){
 try{return (await snapshot(database(env),clock(now))).frame;}
 catch(error){if(error instanceof ReturnManufacturingLinksError)throw error;throw new ReturnManufacturingLinksError('RETURN_MANUFACTURING_LINKS_UNAVAILABLE',503,{cause:error});}
}
function request(input){
 const action=plain(input)?Object.getOwnPropertyDescriptor(input,'action')?.value:null;
 const fields=action==='link'?['case_hash','physical_line_id','production_record_id','quantity','physical_fingerprint','production_fingerprint','evidence','confirmed']:action==='unlink'?['reason']:null;
 if(!fields||!exact(input,['revision','request_id','action','link_id',...fields])||!int(input.revision,0,2147483644)||!uuid(input.request_id)||!uuid(input.link_id))fail('REQUEST_INVALID');
 if(action==='link'){if(!hash(input.case_hash)||!uuid(input.physical_line_id)||!uuid(input.production_record_id)||!int(input.quantity,1,10000)||!hash(input.physical_fingerprint)||!hash(input.production_fingerprint)||!text(input.evidence,240)||input.confirmed!==true)fail('REQUEST_INVALID');}
 else if(!text(input.reason,240))fail('REQUEST_INVALID');
 return canonical(input);
}
function sourceFailure(error){let current=error;for(let i=0;i<4&&current;i++,current=current.cause)if(typeof current.message==='string'&&current.message.includes('return_manufacturing_links_source_guard'))return true;return false;}
export async function mutateReturnManufacturingLinks(env,input,actor,{now=()=>Date.now(),physical=null,production=null}={}){
 try{return await mutate(env,input,actor,{now,physical,production});}
 catch(error){if(error instanceof ReturnManufacturingLinksError)throw error;if(sourceFailure(error))throw new ReturnManufacturingLinksError('RETURN_MANUFACTURING_LINKS_CONFLICT',409,{cause:error});throw new ReturnManufacturingLinksError('RETURN_MANUFACTURING_LINKS_UNAVAILABLE',503,{cause:error});}
}
async function mutate(env,input,actor,{now,physical,production}){
 const stamp=clock(now),value=request(input);if(!text(actor,256))fail('REQUEST_INVALID');const db=database(env),requestHash=await digest(value),observed=await snapshot(db,stamp,value.request_id);
 if(observed.replay){if(observed.replay.request_hash!==requestHash||observed.replay.link_id!==value.link_id)fail('CONFLICT',409);return observed.frame;}
 if(value.revision!==observed.frame.revision)fail('CONFLICT',409);
 const links=observed.frame.links,previous=links.find(row=>row.link_id===value.link_id),before=previous?JSON.parse(JSON.stringify(previous)):null;let changed,parents=null;
 if(value.action==='link'){
  if(previous)fail('CONFLICT',409);if(observed.frame.protection.state==='INCOMPLETE')fail('PROTECTION_INCOMPLETE',409);
  const pf=projectPhysicalReturns(physical),mf=projectIncurredProduction(production);if(!pf||!mf||pf.checked_at>stamp||mf.checked_at>stamp)fail('PARENTS_UNAVAILABLE',409);
  const handles=await returnManufacturingLinkHandles(pf,mf),context=deriveReturnManufacturingLinkContext(observed.frame,pf,mf,handles),selected={case_hash:value.case_hash,physical_line_id:value.physical_line_id,production_record_id:value.production_record_id,quantity:value.quantity,physical_fingerprint:value.physical_fingerprint,production_fingerprint:value.production_fingerprint},assessment=assessReturnManufacturingLink(context,selected);
  if(assessment.state!=='READY')fail(assessment.reason,409);
  const c=pf.cases.find(row=>row.case_hash===value.case_hash),line=c.lines.find(row=>row.line_id===value.physical_line_id),record=mf.records.find(row=>row.record_id===value.production_record_id);
  if(line.received_at>stamp||record.recorded_at>stamp)fail('CLOCK_INVALID',503);
  changed={link_id:value.link_id,case_hash:c.case_hash,physical_line_id:line.line_id,production_record_id:record.record_id,quantity:value.quantity,physical_snapshot:{fingerprint:value.physical_fingerprint,order_hash:c.order_hash,received_at:line.received_at,quantity:line.quantity,identity:line.identity},production_snapshot:{fingerprint:value.production_fingerprint,order_hash:record.source.order_hash,produced_date:record.produced_date,quantity:record.quantity,identity:record.identity},match_basis:assessment.match_basis,evidence:value.evidence,status:'ACTIVE',created_at:stamp,updated_at:stamp,void_reason:null};
  parents={casePayload:JSON.stringify(c),productionPayload:JSON.stringify(record),physicalCapacity:line.quantity,productionCapacity:record.quantity};links.push(changed);
 }else{
  if(!previous)fail('LINK_NOT_FOUND',404);if(previous.status==='VOID')fail('LINK_VOID',409);
  changed={...previous,status:'VOID',updated_at:stamp,void_reason:value.reason};links[links.indexOf(previous)]=changed;
 }
 if(links.length>1000||encoder.encode(JSON.stringify(changed)).byteLength>16384)fail('LIMIT',409);
 links.sort((a,b)=>a.link_id.localeCompare(b.link_id));const next=frame(value.revision+1,links,stamp,observed.frame.protection.state==='NOT_INITIALIZED'?{state:'READY',missing:[]}:observed.frame.protection);
 if(encoder.encode(JSON.stringify(next)).byteLength>1048576)fail('LIMIT',409);if(!projectReturnManufacturingLinks(next))fail('STORAGE_INVALID',503);
 const finished=clock(now);if(finished<stamp||finished-stamp>60)fail('CLOCK_INVALID',503);
 const serial=value.revision+1,mutationId=crypto.randomUUID(),payload=JSON.stringify(changed),audit=JSON.stringify({request:value,previous_link:before,new_link:changed});if(encoder.encode(audit).byteLength>65536)fail('LIMIT',409);
 const guard='EXISTS(SELECT 1 FROM return_manufacturing_links_state WHERE id=1 AND revision=? AND mutation_id=?)',args=[serial,mutationId],statements=[];
 if(observed.frame.protection.state==='NOT_INITIALIZED')statements.push(...RETURN_MANUFACTURING_LINKS_SCHEMA.map(sql=>db.prepare(sql)),...RETURN_MANUFACTURING_LINKS_TRIGGERS.map(sql=>db.prepare(sql)));
 const offset=statements.length;
 statements.push(value.revision===0?db.prepare('INSERT OR IGNORE INTO return_manufacturing_links_state(id,revision,mutation_id,updated_at) VALUES(1,1,?,?)').bind(mutationId,stamp):db.prepare('UPDATE return_manufacturing_links_state SET revision=revision+1,mutation_id=?,updated_at=? WHERE id=1 AND revision=? AND updated_at<=?').bind(mutationId,stamp,value.revision,stamp));
 if(parents){
  const condition="EXISTS(SELECT 1 FROM physical_returns_cases WHERE case_hash=? AND order_hash=? AND payload=?) AND EXISTS(SELECT 1 FROM incurred_production_records WHERE record_id=? AND payload=?) AND (SELECT COALESCE(SUM(quantity),0) FROM return_manufacturing_links_records WHERE case_hash=? AND physical_line_id=? AND status='ACTIVE')+?<=? AND (SELECT COALESCE(SUM(quantity),0) FROM return_manufacturing_links_records WHERE production_record_id=? AND status='ACTIVE')+?<=? AND NOT EXISTS(SELECT 1 FROM return_manufacturing_links_records WHERE case_hash=? AND physical_line_id=? AND production_record_id=? AND status='ACTIVE')";
  statements.push(db.prepare('INSERT INTO return_manufacturing_links_guard(id,ok,source_ok) SELECT 1,1,CASE WHEN '+condition+' THEN 1 ELSE 0 END WHERE '+guard+' ON CONFLICT(id) DO UPDATE SET ok=excluded.ok,source_ok=excluded.source_ok').bind(changed.case_hash,changed.physical_snapshot.order_hash,parents.casePayload,changed.production_record_id,parents.productionPayload,changed.case_hash,changed.physical_line_id,changed.quantity,parents.physicalCapacity,changed.production_record_id,changed.quantity,parents.productionCapacity,changed.case_hash,changed.physical_line_id,changed.production_record_id,...args));
  statements.push(db.prepare('INSERT OR IGNORE INTO return_manufacturing_links_records(link_id,case_hash,physical_line_id,production_record_id,quantity,status,payload) SELECT ?,?,?,?,?,?,? WHERE '+guard).bind(changed.link_id,changed.case_hash,changed.physical_line_id,changed.production_record_id,changed.quantity,changed.status,payload,...args));
 }else statements.push(db.prepare('UPDATE return_manufacturing_links_records SET status=?,payload=? WHERE link_id=? AND payload=? AND '+guard).bind(changed.status,payload,changed.link_id,JSON.stringify(before),...args));
 statements.push(
  db.prepare('INSERT INTO return_manufacturing_links_audit(revision,request_id,request_hash,link_id,action,payload,actor,created_at) SELECT ?,?,?,?,?,?,?,? WHERE '+guard).bind(serial,value.request_id,requestHash,changed.link_id,value.action,audit,actor,stamp,...args),
  db.prepare('INSERT INTO return_manufacturing_links_guard(id,ok,source_ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM return_manufacturing_links_records WHERE link_id=? AND case_hash=? AND physical_line_id=? AND production_record_id=? AND quantity=? AND status=? AND payload=?) AND EXISTS(SELECT 1 FROM return_manufacturing_links_audit WHERE revision=? AND request_id=? AND request_hash=?) THEN 1 ELSE 0 END,1 WHERE '+guard+' ON CONFLICT(id) DO UPDATE SET ok=excluded.ok,source_ok=excluded.source_ok').bind(changed.link_id,changed.case_hash,changed.physical_line_id,changed.production_record_id,changed.quantity,changed.status,payload,serial,value.request_id,requestHash,...args),
 );
 const results=await db.batch(statements);
 if(results[offset]?.meta?.changes!==1){const replay=await db.prepare('SELECT request_hash,link_id FROM return_manufacturing_links_audit WHERE request_id=?').bind(value.request_id).first();if(replay?.request_hash===requestHash&&replay.link_id===value.link_id)return (await snapshot(db,clock(now))).frame;fail('CONFLICT',409);}
 if(results.slice(offset).some(row=>row?.meta?.changes!==1))fail('STORAGE_INVALID',503);
 return (await snapshot(db,clock(now))).frame;
}
