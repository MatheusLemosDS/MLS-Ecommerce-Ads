import {financialCanonicalJSON,financialDigest} from './financial-event-ledger.mjs';
import {readOperationalCollectionSnapshot,mutateOperationalGroup} from './operational-journal.mjs';
import {applyPhysicalShirtCommand,projectPhysicalShirtStock} from './physical-shirt-stock.mjs';
import {planPhysicalShirtPurchaseNeeds} from './physical-shirt-purchase-needs.mjs';
import {readIncurredProduction} from './incurred-production.mjs';
import {assertCommercialCapability} from './commercial-context.mjs';

// Shared, scoped operational facts. A quote is not an external purchase, a
// receipt is not a payment and a physical movement is not another COGS posting.
export class MaterialNeedsWorkspaceError extends Error{
 constructor(code,status=400,options){super('MATERIAL_NEEDS_'+code,options);this.code=this.message;this.status=status;}
}
const fail=(code,status=400,options)=>{throw new MaterialNeedsWorkspaceError(code,status,options);};
const kinds=Object.freeze({stock:'PHYSICAL_SHIRT_STOCK',mapping:'MATERIAL_VARIANT_MAPPING',supplier:'MATERIAL_SUPPLIER',purchase:'MATERIAL_PURCHASE',order:'MATERIAL_ORDER_RESERVATION',link:'MATERIAL_PRODUCTION_CONSUMPTION_LINK'});
const selectedKinds=Object.freeze(Object.values(kinds));
const effects=Object.freeze({external_purchase_allowed:false,financial_integration_allowed:false,money_transfer_allowed:false,automatic_stock_writes:false,financial_writes_allowed:false});
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const id=(v,zero=false)=>typeof v==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(v);
const text=(v,max=160)=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&v.normalize('NFC')===v&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
const date=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const array=(v,max=1000)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(i))||{},'value')).every(Boolean);
const clone=v=>JSON.parse(financialCanonicalJSON(v));
const normalized=v=>v.normalize('NFKC').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
const same=(a,b)=>financialCanonicalJSON(a)===financialCanonicalJSON(b);
const eligible=status=>['READY_TO_SHIP','PROCESSED','RETRY_SHIP'].includes(status);
const sum=values=>{const n=values.reduce((a,b)=>a+BigInt(b),0n);if(n<0n||n>BigInt(Number.MAX_SAFE_INTEGER))fail('QUANTITY_OVERFLOW');return Number(n);};
const product=(a,b)=>{const n=BigInt(a)*BigInt(b);if(n>BigInt(Number.MAX_SAFE_INTEGER))fail('QUANTITY_OVERFLOW');return Number(n);};
const today=iso=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(iso));
function settings(options={}){
 if(!plain(options)||Reflect.ownKeys(options).some(k=>!['now','assertAuthorized'].includes(k)||!Object.hasOwn(Object.getOwnPropertyDescriptor(options,k)||{},'value')||typeof options[k]!=='function'))fail('CONFIGURATION_INVALID',503);
 return {readCapability:'production.read',...options};
}
function clock(options){let n,iso;try{n=(options.now??Date.now)();if(integer(n,1))iso=new Date(n).toISOString();}catch{fail('CLOCK_INVALID',503);}if(!iso||!/^20\d{2}-/.test(iso))fail('CLOCK_INVALID',503);return iso;}
const scopeValid=v=>exact(v,['organization_id','store_id'])&&text(v.organization_id)&&text(v.store_id);
const scopeEqual=(a,b)=>scopeValid(a)&&scopeValid(b)&&a.organization_id===b.organization_id&&a.store_id===b.store_id;
const queryValue=(q,now)=>{if(!exact(q,['planning_date'])||!date(q.planning_date)||q.planning_date<today(now))fail('PLANNING_DATE_INVALID');return {...q};};
const split=collection=>Object.fromEntries(Object.entries(kinds).map(([name,kind])=>[name,collection.records.filter(r=>r.kind===kind)]));
const projectedStock=r=>{const v=projectPhysicalShirtStock(r.payload,r.revision);if(v.variant_id!==r.entity_id)fail('STORAGE_INVALID',503);return v;};
const recordBy=(records,id)=>records.find(r=>r.entity_id===id)??null;
const revision=r=>r?.revision??0;
const optionsScope=(options,expected)=>({...options,assertAuthorized:async value=>{
 if(!scopeEqual(value.scope,expected))fail('SCOPE_CHANGED',403);
 return options.assertAuthorized?await options.assertAuthorized(value):true;
}});
async function tokenUUID(value){const h=await financialDigest(value);return h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-8'+h.slice(17,20)+'-'+h.slice(20,32);}

function mappingState(value,entity){
 if(!exact(value,['schema','item_id','model_id','components','evidence','updated_at'])||value.schema!=='production_material_mapping_v1'||!id(value.item_id)||!id(value.model_id,true)||!array(value.components,8)||!value.components.length||!text(value.evidence,240)||!text(value.updated_at,30))fail('MAPPING_INVALID');
 const seen=new Set();for(const row of value.components){if(!exact(row,['variant_id','quantity_per_unit'])||!hash(row.variant_id)||seen.has(row.variant_id)||!integer(row.quantity_per_unit,1,20))fail('MAPPING_COMPONENT_INVALID');seen.add(row.variant_id);}
 return {...clone(value),mapping_id:entity.entity_id,revision:entity.revision};
}
function supplierState(value,entity){
 if(!exact(value,['schema','supplier_id','name','evidence','policies','updated_at'])||value.schema!=='production_material_supplier_v1'||!uuid(value.supplier_id)||value.supplier_id!==entity.entity_id||!text(value.name,120)||!text(value.evidence,240)||!array(value.policies,50)||!text(value.updated_at,30))fail('SUPPLIER_INVALID');
 const variants=new Set(),quotes=new Set();for(const p of value.policies){if(!exact(p,['variant_id','minimum_quantity','multiple_quantity','unit_cost_cents','shipping_cents','quote_ref'])||!hash(p.variant_id)||variants.has(p.variant_id)||p.minimum_quantity!==null&&!integer(p.minimum_quantity)||p.multiple_quantity!==null&&!integer(p.multiple_quantity,1)||p.unit_cost_cents!==null&&!integer(p.unit_cost_cents)||p.shipping_cents!==null&&!integer(p.shipping_cents)||!text(p.quote_ref,120)||quotes.has(normalized(p.quote_ref)))fail('SUPPLIER_POLICY_INVALID');variants.add(p.variant_id);quotes.add(normalized(p.quote_ref));}
 return {...clone(value),revision:entity.revision};
}
function purchaseState(value,entity){
 if(!exact(value,['schema','purchase_id','supplier_id','status','expected_on','reference','evidence','shipping_cents','lines','receipts','updated_at'])||value.schema!=='production_material_purchase_v1'||!uuid(value.purchase_id)||value.purchase_id!==entity.entity_id||!uuid(value.supplier_id)||!['DRAFT','CONFIRMED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED'].includes(value.status)||value.expected_on!==null&&!date(value.expected_on)||!text(value.reference,120)||!text(value.evidence,240)||value.shipping_cents!==null&&!integer(value.shipping_cents)||!array(value.lines,20)||!value.lines.length||!array(value.receipts,200)||!text(value.updated_at,30))fail('PURCHASE_INVALID');
 const variants=new Set();for(const l of value.lines){if(!exact(l,['variant_id','quantity','unit_cost_cents','received_quantity','cancelled_quantity'])||!hash(l.variant_id)||variants.has(l.variant_id)||!integer(l.quantity,1)||l.unit_cost_cents!==null&&!integer(l.unit_cost_cents)||!integer(l.received_quantity)||!integer(l.cancelled_quantity)||BigInt(l.received_quantity)+BigInt(l.cancelled_quantity)>BigInt(l.quantity))fail('PURCHASE_LINE_INVALID');variants.add(l.variant_id);}
 const ids=new Set(),refs=new Set(),received=new Map(value.lines.map(l=>[l.variant_id,0]));
 for(const r of value.receipts){if(!exact(r,['receipt_id','effective_date','reference','evidence','lines','recorded_at'])||!uuid(r.receipt_id)||ids.has(r.receipt_id)||!date(r.effective_date)||!text(r.reference,120)||refs.has(normalized(r.reference))||!text(r.evidence,240)||!array(r.lines,20)||!r.lines.length||!text(r.recorded_at,30))fail('RECEIPT_INVALID');ids.add(r.receipt_id);refs.add(normalized(r.reference));const seen=new Set();for(const l of r.lines){if(!exact(l,['variant_id','quantity'])||!variants.has(l.variant_id)||seen.has(l.variant_id)||!integer(l.quantity,1))fail('RECEIPT_INVALID');seen.add(l.variant_id);received.set(l.variant_id,sum([received.get(l.variant_id),l.quantity]));}}
 if(value.lines.some(l=>l.received_quantity!==received.get(l.variant_id)))fail('PURCHASE_RECEIPT_CONSERVATION_INVALID',503);
 const goods=value.lines.every(l=>l.unit_cost_cents!==null)?sum(value.lines.map(l=>product(l.quantity,l.unit_cost_cents))):null;
 return {...clone(value),revision:entity.revision,goods_estimate_cents:goods,total_estimate_cents:goods!==null&&value.shipping_cents!==null?sum([goods,value.shipping_cents]):null};
}
function orderState(value,entity){
 const keys=['schema','source_key','source_hash','line_source_hash','source_context','mapping_revision','components','generation','reservations','consumptions','previous_generations','updated_at'];
 if(!exact(value,keys)||value.schema!=='production_material_reservations_v1'||!hash(value.source_key)||value.source_key!==entity.entity_id||!hash(value.source_hash)||!hash(value.line_source_hash)||!exact(value.source_context,['item_id','model_id','commercial_quantity','order_hash'])||!id(value.source_context.item_id)||!id(value.source_context.model_id,true)||!integer(value.source_context.commercial_quantity,1,10000)||!hash(value.source_context.order_hash)||!integer(value.mapping_revision,1)||!array(value.components,8)||!value.components.length||!integer(value.generation,1)||!array(value.reservations,200)||!array(value.consumptions,200)||!array(value.previous_generations,20)||!text(value.updated_at,30))fail('RESERVATION_STORAGE_INVALID',503);
 const variants=new Set();for(const c of value.components){if(!exact(c,['variant_id','quantity_per_unit','required_quantity'])||!hash(c.variant_id)||variants.has(c.variant_id)||!integer(c.quantity_per_unit,1,20)||c.required_quantity!==product(value.source_context.commercial_quantity,c.quantity_per_unit))fail('RESERVATION_STORAGE_INVALID',503);variants.add(c.variant_id);}
 const reservations=new Set();for(const r of value.reservations){if(!exact(r,['variant_id','reservation_id','demand_ref','quantity'])||!variants.has(r.variant_id)||!uuid(r.reservation_id)||reservations.has(r.reservation_id)||!text(r.demand_ref,120)||!integer(r.quantity,1))fail('RESERVATION_STORAGE_INVALID',503);reservations.add(r.reservation_id);}
 const ids=new Set();for(const c of value.consumptions){if(!exact(c,['consumption_id','production_record_id','variant_id','quantity','effective_date','evidence','status','recorded_at','reversed_at','reversed_effective_date','reverse_reason','reverse_reference'])||!uuid(c.consumption_id)||ids.has(c.consumption_id)||!uuid(c.production_record_id)||!variants.has(c.variant_id)||!integer(c.quantity,1)||!date(c.effective_date)||!text(c.evidence,240)||!['ACTIVE','REVERSED'].includes(c.status)||!text(c.recorded_at,30)||(c.status==='ACTIVE'?(c.reversed_at!==null||c.reversed_effective_date!==null||c.reverse_reason!==null||c.reverse_reference!==null):!text(c.reversed_at,30)||!date(c.reversed_effective_date)||c.reversed_effective_date<c.effective_date||c.reversed_effective_date>today(c.reversed_at)||!text(c.reverse_reason,240)||!text(c.reverse_reference,120)))fail('CONSUMPTION_STORAGE_INVALID',503);ids.add(c.consumption_id);}
 for(const previous of value.previous_generations){if(!exact(previous,keys.filter(k=>k!=='previous_generations'))||previous.generation>=value.generation||previous.consumptions?.some(c=>c.status==='ACTIVE'))fail('RESERVATION_HISTORY_INVALID',503);orderState({...previous,previous_generations:[]},entity);}
 return {...clone(value),revision:entity.revision};
}
function linkState(value,entity){
 if(!exact(value,['schema','production_record_id','source_key','variant_id','consumptions','updated_at'])||value.schema!=='production_material_manufacturing_link_v1'||!uuid(value.production_record_id)||value.production_record_id!==entity.entity_id||!hash(value.source_key)||!hash(value.variant_id)||!array(value.consumptions,200)||!text(value.updated_at,30))fail('MANUFACTURING_LINK_INVALID',503);
 const seen=new Set();for(const c of value.consumptions){if(!exact(c,['consumption_id','quantity','status'])||!uuid(c.consumption_id)||seen.has(c.consumption_id)||!integer(c.quantity,1)||!['ACTIVE','REVERSED'].includes(c.status))fail('MANUFACTURING_LINK_INVALID',503);seen.add(c.consumption_id);}
 return {...clone(value),revision:entity.revision,active_quantity:sum(value.consumptions.filter(c=>c.status==='ACTIVE').map(c=>c.quantity))};
}

const sourceSelect="SELECT l.unit_key,l.order_id,l.line_key,l.payload,l.source_hash AS line_source_hash,l.checked_at AS line_checked_at,l.missing,o.status AS order_status,o.checked_at AS order_checked_at,o.source_hash AS order_source_hash FROM production_dtf_lines l JOIN production_dtf_orders o ON o.order_id=l.order_id ";
const sourceWhere="WHERE (o.status IN ('READY_TO_SHIP','PROCESSED','RETRY_SHIP') OR l.unit_key IN (SELECT value FROM json_each(?))) ";
async function sourceValue(row,stamp){
 if(!plain(row)||!hash(row.unit_key)||!text(row.order_id,80)||!text(row.line_key,100)||!hash(row.line_source_hash)||!hash(row.order_source_hash)||!integer(row.line_checked_at,1,stamp)||!integer(row.order_checked_at,1,stamp)||![0,1].includes(row.missing)||!text(row.order_status,40)||!/^[A-Z][A-Z0-9_]{0,39}$/.test(row.order_status)||typeof row.payload!=='string'||new TextEncoder().encode(row.payload).byteLength>8192)fail('ORDER_SOURCE_INVALID',503);
 let p;try{p=JSON.parse(row.payload);}catch{fail('ORDER_SOURCE_INVALID',503);}
 const recipe=exact(p,['item_id','model_id','sku','quantity','model_name','requires_pair','source_sku','recipe_request_id']);
 if(!(recipe||exact(p,['item_id','model_id','sku','quantity','model_name','requires_pair']))||!id(p.item_id)||!id(p.model_id,true)||!integer(p.quantity,1,10000)||p.sku!==null&&!text(p.sku,recipe?256:128)||p.model_name!==null&&!text(p.model_name,160)||typeof p.requires_pair!=='boolean'||recipe&&(!p.requires_pair||!text(p.source_sku,128)||!uuid(p.recipe_request_id))||await financialDigest(row.payload)!==row.line_source_hash||await financialDigest(JSON.stringify([row.order_id,row.line_key]))!==row.unit_key)fail('ORDER_SOURCE_INVALID',503);
 const source_hash=await financialDigest(JSON.stringify({key:row.unit_key,line:row.line_source_hash,order:row.order_source_hash,status:row.order_status,missing:row.missing}));
 return {source_key:row.unit_key,source_hash,line_source_hash:row.line_source_hash,order_hash:await financialDigest(row.order_id),item_id:p.item_id,model_id:p.model_id,sku:recipe?p.source_sku:p.sku,model_name:p.model_name,status:row.missing?'MISSING':row.order_status,commercial_quantity:p.quantity,source_checked_at:new Date(Math.max(row.line_checked_at,row.order_checked_at)*1000).toISOString()};
}
async function sources(env,groups,now,names){
 const ids=JSON.stringify(groups.map(r=>r.entity_id).sort()),db=env.ADMIN_DB;
 if(!names.has('production_dtf_lines')||!names.has('production_dtf_orders'))return {rows:[],raw:[],ids,complete:false,total:0,available:false};
 const response=await db.batch([db.prepare(sourceSelect+sourceWhere+'ORDER BY l.unit_key LIMIT 501').bind(ids),db.prepare('SELECT COUNT(*) AS count FROM production_dtf_lines l JOIN production_dtf_orders o ON o.order_id=l.order_id '+sourceWhere).bind(ids)]);
 if(!Array.isArray(response)||response.length!==2||response.some(r=>r?.success===false||!Array.isArray(r?.results))||!integer(response[1].results[0]?.count)||response[0].results.length>501)fail('ORDER_SOURCE_INVALID',503);
 const raw=[],rows=[];let bytes=0;for(const row of response[0].results.slice(0,500)){const length=new TextEncoder().encode(JSON.stringify(row)).byteLength;if(bytes+length>524288)break;raw.push(row);bytes+=length;}
 let complete=response[1].results[0].count===raw.length;
 for(const row of raw){try{rows.push(await sourceValue(row,Math.floor(Date.parse(now)/1000)));}catch{complete=false;}}
 return {rows,raw,ids,complete,total:response[1].results[0].count,available:true};
}
async function manufacturing(env,now,names){
 if(!names.has('incurred_production_state'))return {frame:null,state:null,complete:true};
 const first=await env.ADMIN_DB.prepare('SELECT revision,mutation_id,updated_at FROM incurred_production_state WHERE id=1').first();
 const frame=await readIncurredProduction(env,{now:()=>Date.parse(now)});
 const second=await env.ADMIN_DB.prepare('SELECT revision,mutation_id,updated_at FROM incurred_production_state WHERE id=1').first();
 if(!same(first,second)||frame.revision!==(first?.revision??0))fail('SOURCE_CHANGED',409);
 return {frame,state:first,complete:true};
}
async function snapshot(env,query,options){
 const initialDb=env.ADMIN_DB,initialContext=env.COMMERCIAL_CONTEXT,now=clock(options),selected=queryValue(query,now),before=await readOperationalCollectionSnapshot(env,{kinds:selectedKinds},options),rows=split(before);
 for(const mapping of rows.mapping){if(mapping.entity_id!==await financialDigest(['material-mapping-v1',mapping.payload?.item_id,mapping.payload?.model_id]))fail('MAPPING_SOURCE_INVALID',503);}
 const names=new Set((await env.ADMIN_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('production_dtf_lines','production_dtf_orders','incurred_production_state','incurred_production_records','incurred_production_audit','incurred_production_guard')").all()).results?.map(r=>r.name)??[]);
 const source=await sources(env,rows.order,now,names),manufacture=await manufacturing(env,now,names);
 const after=await readOperationalCollectionSnapshot(env,{kinds:selectedKinds},options);
 if(!scopeEqual(before.scope,after.scope)||before.fence_hash!==after.fence_hash)fail('SOURCE_CHANGED',409);
 const sourceAgain=await sources(env,rows.order,now,names);if(!same(source.raw,sourceAgain.raw)||source.total!==sourceAgain.total||source.available!==sourceAgain.available)fail('SOURCE_CHANGED',409);
 const finalNames=new Set((await env.ADMIN_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('incurred_production_state','incurred_production_records','incurred_production_audit','incurred_production_guard')").all()).results?.map(r=>r.name)??[]);
 if(finalNames.has('incurred_production_state')!==names.has('incurred_production_state'))fail('SOURCE_CHANGED',409);
 if(finalNames.has('incurred_production_state')){const finalManufacturing=await env.ADMIN_DB.prepare('SELECT revision,mutation_id,updated_at FROM incurred_production_state WHERE id=1').first();if(!same(finalManufacturing,manufacture.state))fail('SOURCE_CHANGED',409);}
 const vector={schema:'production_material_source_vector_v1',orders_hash:await financialDigest(JSON.stringify({rows:source.raw,total:source.total,available:source.available})),operational_heads_hash:before.fence_hash,manufacturing_hash:await financialDigest(JSON.stringify({state:manufacture.state,records:manufacture.frame?.records??[]}))},fence_hash=await financialDigest([before.scope,selected.planning_date,vector]);
 if(options.assertAuthorized&&await options.assertAuthorized({scope:before.scope,action:'read',capability:'production.read'})===false)fail('AUTHORIZATION_REVOKED',403);
 if(env.ADMIN_DB!==initialDb||env.COMMERCIAL_CONTEXT!==initialContext)fail('SCOPE_CHANGED',403);if(initialContext)assertCommercialCapability(initialContext,'production.read');
 return {scope:before.scope,planning_date:selected.planning_date,now,collection:before,rows,source,manufacture,names,source_vector:vector,fence_hash};
}
function derived(s){
 const stock=s.rows.stock.map(projectedStock),stockMap=new Map(stock.map(v=>[v.variant_id,v]));
 if(!s.collection.complete)return {stock,stockMap,mappings:[],suppliers:[],purchases:[],groups:[],links:[],orders:[],plan:null,pending:[{code:'OPERATIONAL_RECORDS_PARTIAL'},{code:'PLANNING_SELECTION_CAPACITY_REACHED'}],manufacturing_records:[]};
 const mappings=s.rows.mapping.map(r=>mappingState(r.payload,r)),suppliers=s.rows.supplier.map(r=>supplierState(r.payload,r)),purchases=s.rows.purchase.map(r=>purchaseState(r.payload,r)),groups=s.rows.order.map(r=>orderState(r.payload,r)),links=s.rows.link.map(r=>linkState(r.payload,r));
 for(const m of mappings)if(m.components.some(c=>!stockMap.has(c.variant_id)))fail('MAPPING_VARIANT_MISSING',503);
 const orders=[],used=new Set(),pending=[];
 for(const source of s.source.rows){
  used.add(source.source_key);const mapping=mappings.find(m=>m.item_id===source.item_id&&m.model_id===source.model_id)??null,group=groups.find(g=>g.source_key===source.source_key)??null,codes=[];
  if(!eligible(source.status))codes.push('ORDER_NOT_ELIGIBLE');if(!mapping)codes.push('PHYSICAL_COMPOSITION_MAPPING_REQUIRED');
  const activeReservation=group?.reservations.some(r=>stockMap.get(r.variant_id)?.reservations.find(v=>v.reservation_id===r.reservation_id)?.remaining_quantity>0),activeConsumption=group?.consumptions.some(c=>c.status==='ACTIVE');
  const changed=group&&(group.line_source_hash!==source.line_source_hash||group.mapping_revision!==mapping?.revision||group.source_context.commercial_quantity!==source.commercial_quantity)&&(activeReservation||activeConsumption);
  if(changed)codes.push('SOURCE_OR_MAPPING_CHANGED_REVIEW_REQUIRED');
  const selected=changed?group.components:mapping?.components??[],components=selected.map(c=>{
   const variant=stockMap.get(c.variant_id),required=product(source.commercial_quantity,c.quantity_per_unit),refs=group?.reservations.filter(r=>r.variant_id===c.variant_id)??[],records=refs.map(r=>variant?.reservations.find(v=>v.reservation_id===r.reservation_id));
   if(records.some((r,i)=>!r||r.demand_ref!==refs[i].demand_ref||r.quantity!==refs[i].quantity))fail('RESERVATION_SOURCE_INVALID',503);
   const reserved=sum(records.map(r=>r.remaining_quantity)),consumed=sum(group?.consumptions.filter(r=>r.variant_id===c.variant_id&&r.status==='ACTIVE').map(r=>r.quantity)??[]),unallocated=required>=sum([reserved,consumed])?required-reserved-consumed:null,part=[];
   if(!variant||variant.state!=='CONFIRMED')part.push('INITIAL_STOCK_UNKNOWN');if(unallocated===null)part.push('CONSUMPTION_OR_RESERVATION_EXCEEDS_DEMAND');if(changed)part.push('SOURCE_OR_MAPPING_CHANGED_REVIEW_REQUIRED');
   return {variant_id:c.variant_id,identity:variant?.identity??null,quantity_per_unit:c.quantity_per_unit,required_quantity:required,reserved_quantity:reserved,consumed_quantity:consumed,free_quantity:variant?.free_quantity??null,shortage_quantity:unallocated!==null&&variant?.free_quantity!==null?Math.max(0,unallocated-(variant?.free_quantity??0)):null,quantity_unallocated:unallocated,pending:part};
  });
  codes.push(...components.flatMap(c=>c.pending));let material_state='UNKNOWN';
  if(!eligible(source.status))material_state='INELIGIBLE';else if(changed||components.some(c=>c.quantity_unallocated===null))material_state='REVIEW';else if(!mapping||components.some(c=>c.pending.length))material_state='UNKNOWN';else if(components.every(c=>c.consumed_quantity===c.required_quantity))material_state='CONSUMED';else if(components.every(c=>c.reserved_quantity+c.consumed_quantity===c.required_quantity))material_state='RESERVED';else if(components.every(c=>c.quantity_unallocated<=c.free_quantity))material_state='AVAILABLE_TO_RESERVE';else material_state='SHORTAGE';
  const unique=[...new Set(codes)].sort();pending.push(...unique.map(code=>({source_key:source.source_key,code})));
  orders.push({...source,mapping_revision:mapping?.revision??0,group_revision:group?.revision??0,material_state,components,consumptions:group?[...group.previous_generations.flatMap(g=>g.consumptions),...group.consumptions]:[],pending:unique,evidence_refs:[{kind:'SAVED_ORDER_LINE',reference:source.source_key,sha256:source.source_hash},...(mapping?[{kind:'APPROVED_PHYSICAL_MAPPING',reference:mapping.mapping_id,revision:mapping.revision}]:[])]});
 }
 for(const group of groups)if(!used.has(group.source_key)){
  const components=group.components.map(c=>{const v=stockMap.get(c.variant_id),refs=group.reservations.filter(r=>r.variant_id===c.variant_id),rs=refs.map(r=>v?.reservations.find(x=>x.reservation_id===r.reservation_id));if(rs.some(r=>!r))fail('RESERVATION_SOURCE_INVALID',503);return {variant_id:c.variant_id,identity:v?.identity??null,quantity_per_unit:c.quantity_per_unit,required_quantity:c.required_quantity,reserved_quantity:sum(rs.map(r=>r.remaining_quantity)),consumed_quantity:sum(group.consumptions.filter(r=>r.variant_id===c.variant_id&&r.status==='ACTIVE').map(r=>r.quantity)),free_quantity:v?.free_quantity??null,shortage_quantity:null,quantity_unallocated:null,pending:['SAVED_ORDER_SOURCE_UNAVAILABLE']};});
  orders.push({source_key:group.source_key,source_hash:group.source_hash,line_source_hash:group.line_source_hash,order_hash:group.source_context.order_hash,item_id:group.source_context.item_id,model_id:group.source_context.model_id,sku:null,model_name:null,status:'MISSING',commercial_quantity:group.source_context.commercial_quantity,source_checked_at:null,mapping_revision:group.mapping_revision,group_revision:group.revision,material_state:'REVIEW',components,consumptions:[...group.previous_generations.flatMap(g=>g.consumptions),...group.consumptions],pending:['SAVED_ORDER_SOURCE_UNAVAILABLE'],evidence_refs:[{kind:'SAVED_RESERVATION_GROUP',reference:group.source_key,revision:group.revision}]});
 }
 const allPolicies=new Map(),quoteUses=new Map();for(const supplier of suppliers)for(const p of supplier.policies){const list=allPolicies.get(p.variant_id)??[];list.push({supplier,p});allPolicies.set(p.variant_id,list);const quotes=quoteUses.get(normalized(p.quote_ref))??[];quotes.push(p.variant_id);quoteUses.set(normalized(p.quote_ref),quotes);}
 const scope={...s.scope,currency:'BRL'},policies=[];
 for(const [variant_id,list]of allPolicies){if(list.length!==1){pending.push({variant_id,code:'SUPPLIER_CHOICE_REQUIRED'});continue;}const {supplier,p}=list[0];if(quoteUses.get(normalized(p.quote_ref)).length!==1){pending.push({variant_id,code:'SHIPPING_QUOTE_ALLOCATION_REQUIRED'});continue;}policies.push({scope,variant_id,supplier_id:supplier.supplier_id,minimum_quantity:p.minimum_quantity,multiple_quantity:p.multiple_quantity,unit_cost_cents:p.unit_cost_cents,shipping_cents:p.shipping_cents,quote_ref:p.quote_ref,source_revision:supplier.revision,evidence_ref:'supplier:'+supplier.supplier_id});}
 const demands=orders.filter(o=>eligible(o.status)).flatMap(o=>o.components.map((c,i)=>({scope,demand_ref:o.source_key,component_ref:'component-'+(i+1),composition_revision:o.mapping_revision||1,variant_id:c.variant_id,quantity_unallocated:o.material_state==='REVIEW'?null:c.quantity_unallocated,needed_on:s.planning_date,source_revision:o.mapping_revision||1,evidence_ref:'order:'+o.source_key+':'+o.source_hash}))),receipts=[];
 for(const purchase of purchases)for(const line of purchase.lines)receipts.push({scope,receipt_ref:purchase.purchase_id+':'+line.variant_id,variant_id:line.variant_id,supplier_id:purchase.supplier_id,status:purchase.status,ordered_quantity:line.quantity,received_quantity:line.received_quantity,cancelled_quantity:line.cancelled_quantity,committed_quantity:0,expected_on:purchase.expected_on,source_revision:purchase.revision,evidence_ref:'purchase:'+purchase.purchase_id});
 const demandComplete=s.source.available&&s.source.complete&&s.collection.complete&&orders.filter(o=>eligible(o.status)).every(o=>o.mapping_revision>0&&o.components.length>0),bounded=demands.length<=1000&&receipts.length<=1000&&stock.length<=1000&&policies.length<=1000;
 // The stock snapshot was observed today, never in the future. A selected
 // planning date is the needed-on date of these demands, not a future count.
 const asOf=today(s.now),plan=bounded&&s.source.available&&s.source.complete?planPhysicalShirtPurchaseNeeds({schema:'physical_shirt_purchase_needs_input_v1',scope,planning_date:asOf,stock:{scope,as_of_date:asOf,evidence_ref:s.collection.fence_hash,coverage_complete:s.collection.complete,variants:stock.map(v=>({variant_id:v.variant_id,state:v.state,physical_usable_quantity:v.physical_usable_quantity,reserved_quantity:v.reserved_quantity,source_revision:v.revision,evidence_ref:'stock:'+v.variant_id+':'+v.revision}))},demand_coverage_complete:demandComplete,receipt_coverage_complete:s.collection.complete,demands,receipts,policies}):null;
 if(!bounded)pending.push({code:'PLANNING_SELECTION_CAPACITY_REACHED'});if(!s.source.available)pending.push({code:'SAVED_ORDER_SOURCE_UNAVAILABLE'});if(!s.source.complete)pending.push({code:'SAVED_ORDER_COVERAGE_PARTIAL'});if(!s.collection.complete)pending.push({code:'OPERATIONAL_RECORDS_PARTIAL'});
 const manufacturing_records=(s.manufacture.frame?.records??[]).filter(r=>r.status==='ACTIVE').map(r=>{const linked=links.find(l=>l.production_record_id===r.record_id),used=linked?.active_quantity??0;if(used>r.quantity)fail('MANUFACTURING_LINK_QUANTITY_INVALID',503);return {record_id:r.record_id,source_key:r.source.kind==='SAVED_DTF_ORDER_LINE'?r.source.key:null,source_hash:r.source.kind==='SAVED_DTF_ORDER_LINE'?r.source.hash:null,produced_date:r.produced_date,quantity:r.quantity,available_quantity:r.quantity-used,identity:r.identity,status:r.status};});
 return {stock,stockMap,mappings,suppliers,purchases,groups,links,orders,plan,pending,manufacturing_records};
}
function envelope(s,d,mutation){return {schema:'production_material_workspace_v1',scope:{...s.scope},planning_date:s.planning_date,date_basis:'PLANNING_DATE_NOT_SHOPEE_DEADLINE',checked_at:s.now,fence_hash:s.fence_hash,source_vector:s.source_vector,coverage:{orders_complete:s.source.available&&s.source.complete,stock_complete:s.collection.complete,suppliers_complete:s.collection.complete,purchases_complete:s.collection.complete,manufacturing_complete:s.manufacture.complete,source_integrity_verified:true,provider_completeness:'NOT_PROVEN',basis:'SAVED_LOCAL_SOURCES_ONLY'},orders:d.orders,stock:{variants:d.stock},mappings:d.mappings,suppliers:d.suppliers,purchases:d.purchases,manufacturing_records:d.manufacturing_records,plan:d.plan,pending:d.pending,effects:{...effects},...(mutation?{mutation}:{})};}
export async function readMaterialNeedsWorkspace(env,query,options={}){const opts=settings(options),s=await snapshot(env,query,opts);return envelope(s,derived(s));}

const actionFields=Object.freeze({save_mapping:['item_id','model_id','components','evidence'],save_supplier:['supplier_id','name','evidence','policies'],save_purchase:['purchase_id','supplier_id','status','expected_on','reference','evidence','shipping_cents','lines'],cancel_purchase:['purchase_id','reason','evidence'],confirm_receipt:['purchase_id','receipt_id','effective_date','reference','evidence','lines','fence_hash'],reserve_order:['source_key','source_hash','fence_hash','evidence'],release_order:['source_key','source_hash','fence_hash','evidence'],consume_order:['source_key','source_hash','fence_hash','evidence','lines'],reverse_consumption:['source_key','source_hash','fence_hash','consumption_id','effective_date','reason','evidence','blank_stock_confirmed']});
function request(body,now){
 const action=plain(body)?Object.getOwnPropertyDescriptor(body,'action')?.value:undefined;
 if(typeof action!=='string'||!Object.hasOwn(actionFields,action)||!exact(body,['action','request_id','expected_scope','expected_revision','confirmed','planning_date',...actionFields[action]])||!uuid(body.request_id)||!scopeValid(body.expected_scope)||!integer(body.expected_revision,0,2147483644)||body.confirmed!==true)fail('REQUEST_INVALID');
 const b=clone(body);queryValue({planning_date:b.planning_date},now);
 if('evidence'in b&&!text(b.evidence,240)||'reason'in b&&!text(b.reason,240)||'fence_hash'in b&&!hash(b.fence_hash)||'source_key'in b&&(!hash(b.source_key)||!hash(b.source_hash))||'effective_date'in b&&(!date(b.effective_date)||b.effective_date>today(now)))fail('REQUEST_INVALID');
 if(b.action==='reverse_consumption'&&(b.blank_stock_confirmed!==true||!uuid(b.consumption_id)))fail('BLANK_STOCK_CORRECTION_CONFIRMATION_REQUIRED');
 return b;
}
function headsGuard(s,key){
 const heads=s.collection.heads.map(r=>({kind:r.kind,entity_id:r.entity_id,revision:r.revision})),types=JSON.stringify(selectedKinds),expected=JSON.stringify(heads);
 return {sql:'SELECT 1 WHERE (SELECT COUNT(*) FROM operational_entity_heads WHERE scope_key=? AND kind IN (SELECT value FROM json_each(?)))=? AND NOT EXISTS(SELECT 1 FROM operational_entity_heads h WHERE h.scope_key=? AND h.kind IN (SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE json_extract(j.value,\'$.kind\')=h.kind AND json_extract(j.value,\'$.entity_id\')=h.entity_id AND json_extract(j.value,\'$.revision\')=h.revision))',bindings:[key,types,heads.length,key,types,expected]};
}
function sourceGuard(s){
 if(!s.source.available)return null;
 const expected=JSON.stringify(s.source.raw);
 return {sql:'SELECT 1 WHERE (SELECT COUNT(*) FROM production_dtf_lines l JOIN production_dtf_orders o ON o.order_id=l.order_id '+sourceWhere+')=? AND NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN production_dtf_lines l ON l.unit_key=json_extract(j.value,\'$.unit_key\') LEFT JOIN production_dtf_orders o ON o.order_id=l.order_id WHERE l.unit_key IS NULL OR l.order_id IS NOT json_extract(j.value,\'$.order_id\') OR l.line_key IS NOT json_extract(j.value,\'$.line_key\') OR l.payload IS NOT json_extract(j.value,\'$.payload\') OR l.source_hash IS NOT json_extract(j.value,\'$.line_source_hash\') OR l.checked_at IS NOT json_extract(j.value,\'$.line_checked_at\') OR l.missing IS NOT json_extract(j.value,\'$.missing\') OR o.status IS NOT json_extract(j.value,\'$.order_status\') OR o.source_hash IS NOT json_extract(j.value,\'$.order_source_hash\') OR o.checked_at IS NOT json_extract(j.value,\'$.order_checked_at\'))',bindings:[s.source.ids,s.source.total,expected]};
}
const mutation=(kind,entity_id,old,payload,command)=>({kind,entity_id,expected_revision:revision(old),payload,command});
function cleanProjection(value,keys){const v=clone(value);for(const k of keys)delete v[k];return v;}
function stockMutation(s,d,variant_id,operations){
 const old=recordBy(s.rows.stock,variant_id);if(!old)fail('VARIANT_NOT_FOUND',404);let payload=old.payload;const commands=[];
 for(const operation of operations){payload=applyPhysicalShirtCommand(payload,operation,{now:s.now});commands.push(operation);}
 return mutation(kinds.stock,variant_id,old,payload,{schema:'production_material_stock_commands_v1',commands});
}
function sourceFor(d,b){const value=d.orders.find(o=>o.source_key===b.source_key);if(!value||value.source_hash!==b.source_hash)fail('ORDER_SOURCE_CHANGED',409);return value;}
function requireFence(s,b){if(b.fence_hash!==s.fence_hash)fail('PREVIEW_CHANGED',409);if(!s.collection.complete)fail('SOURCE_COVERAGE_INCOMPLETE',409);}
function physicalMatch(identity,variant){return identity?.confirmed===true&&identity.garment_type===variant.identity.garment_type&&identity.fit===variant.identity.fit&&identity.size===variant.identity.size&&typeof identity.color==='string'&&normalized(identity.color)===normalized(variant.identity.color);}

const productionProtection=[
 `CREATE TRIGGER IF NOT EXISTS material_consumption_production_update BEFORE UPDATE OF payload,record_id ON incurred_production_records WHEN EXISTS(SELECT 1 FROM operational_entity_heads h JOIN operational_entity_revisions r ON r.scope_key=h.scope_key AND r.kind=h.kind AND r.entity_id=h.entity_id AND r.revision=h.revision WHERE h.kind='MATERIAL_PRODUCTION_CONSUMPTION_LINK' AND h.entity_id=OLD.record_id AND json_valid(r.payload) AND EXISTS(SELECT 1 FROM json_each(r.payload,'$.consumptions') c WHERE json_extract(c.value,'$.status')='ACTIVE')) AND (NEW.record_id IS NOT OLD.record_id OR NEW.payload IS NOT OLD.payload) BEGIN SELECT RAISE(ABORT,'MLS_MATERIAL_PRODUCTION_LINK_ACTIVE'); END`,
 `CREATE TRIGGER IF NOT EXISTS material_consumption_production_delete BEFORE DELETE ON incurred_production_records WHEN EXISTS(SELECT 1 FROM operational_entity_heads h JOIN operational_entity_revisions r ON r.scope_key=h.scope_key AND r.kind=h.kind AND r.entity_id=h.entity_id AND r.revision=h.revision WHERE h.kind='MATERIAL_PRODUCTION_CONSUMPTION_LINK' AND h.entity_id=OLD.record_id AND json_valid(r.payload) AND EXISTS(SELECT 1 FROM json_each(r.payload,'$.consumptions') c WHERE json_extract(c.value,'$.status')='ACTIVE')) BEGIN SELECT RAISE(ABORT,'MLS_MATERIAL_PRODUCTION_LINK_ACTIVE'); END`,
];
async function transition(env,b,s,d,current){
 const key=await financialDigest(['operational-journal-v1',s.scope]),guards=[headsGuard(s,key)],mutations=[];const source=sourceGuard(s);if(source&&['reserve_order','consume_order','release_order','reverse_consumption'].includes(b.action))guards.push(source);
 if('fence_hash'in b){
  if(s.names.has('incurred_production_state'))guards.push({sql:'SELECT 1 WHERE COALESCE((SELECT revision FROM incurred_production_state WHERE id=1),0)=? AND COALESCE((SELECT mutation_id FROM incurred_production_state WHERE id=1),\'\')=?',bindings:[s.manufacture.state?.revision??0,s.manufacture.state?.mutation_id??'']});
  else guards.push({sql:"SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='incurred_production_state')",bindings:[]});
 }
 const base={payload:null,mutations,guards};
 if(b.action==='save_mapping'){
  const value={schema:'production_material_mapping_v1',item_id:b.item_id,model_id:b.model_id,components:b.components,evidence:b.evidence,updated_at:s.now};mappingState(value,{entity_id:'mapping',revision:1});if(value.components.some(c=>!d.stockMap.has(c.variant_id)))fail('VARIANT_NOT_FOUND',404);base.payload=value;return base;
 }
 if(b.action==='save_supplier'){
  const value={schema:'production_material_supplier_v1',supplier_id:b.supplier_id,name:b.name,evidence:b.evidence,policies:b.policies,updated_at:s.now};supplierState(value,{entity_id:b.supplier_id,revision:1});if(value.policies.some(c=>!d.stockMap.has(c.variant_id)))fail('VARIANT_NOT_FOUND',404);base.payload=value;return base;
 }
 if(b.action==='save_purchase'){
  if(!uuid(b.purchase_id)||!uuid(b.supplier_id)||!['DRAFT','CONFIRMED'].includes(b.status)||b.expected_on!==null&&!date(b.expected_on)||!text(b.reference,120)||b.shipping_cents!==null&&!integer(b.shipping_cents)||!array(b.lines,20)||!b.lines.length)fail('PURCHASE_INVALID');
  if(!d.suppliers.some(v=>v.supplier_id===b.supplier_id))fail('SUPPLIER_NOT_FOUND',404);
  if(d.purchases.some(p=>p.purchase_id!==b.purchase_id&&normalized(p.reference)===normalized(b.reference)))fail('PURCHASE_REFERENCE_DUPLICATE',409);
  const old=current?purchaseState(current,{entity_id:b.purchase_id,revision:b.expected_revision}):null;if(old?.status==='CANCELLED')fail('PURCHASE_CANCELLED',409);if(old?.receipts.length&&b.status==='DRAFT')fail('RECEIVED_PURCHASE_CANNOT_BE_DRAFT',409);
  const lines=b.lines.map(l=>{if(!exact(l,['variant_id','quantity','unit_cost_cents'])||!d.stockMap.has(l.variant_id)||!integer(l.quantity,1)||l.unit_cost_cents!==null&&!integer(l.unit_cost_cents))fail('PURCHASE_LINE_INVALID');const previous=old?.lines.find(x=>x.variant_id===l.variant_id);return {...l,received_quantity:previous?.received_quantity??0,cancelled_quantity:previous?.cancelled_quantity??0};});
  if(old?.lines.some(l=>l.received_quantity>0&&!lines.some(n=>n.variant_id===l.variant_id)))fail('RECEIVED_LINE_CANNOT_BE_REMOVED',409);
  const status=lines.every(l=>l.received_quantity+l.cancelled_quantity===l.quantity)?'RECEIVED':lines.some(l=>l.received_quantity>0)?'PARTIALLY_RECEIVED':b.status;
  const value={schema:'production_material_purchase_v1',purchase_id:b.purchase_id,supplier_id:b.supplier_id,status,expected_on:b.expected_on,reference:b.reference,evidence:b.evidence,shipping_cents:b.shipping_cents,lines,receipts:old?.receipts??[],updated_at:s.now};purchaseState(value,{entity_id:b.purchase_id,revision:b.expected_revision+1});base.payload=value;return base;
 }
 if(b.action==='cancel_purchase'){
  if(!current)fail('PURCHASE_NOT_FOUND',404);const p=cleanProjection(purchaseState(current,{entity_id:b.purchase_id,revision:b.expected_revision}),['revision','goods_estimate_cents','total_estimate_cents']);if(p.status==='CANCELLED')fail('PURCHASE_ALREADY_CANCELLED',409);
  for(const l of p.lines)l.cancelled_quantity=l.quantity-l.received_quantity;p.status='CANCELLED';p.evidence=b.evidence+' — '+b.reason;p.updated_at=s.now;if(p.evidence.length>240)fail('EVIDENCE_TOO_LONG');base.payload=p;return base;
 }
 if(b.action==='confirm_receipt'){
  requireFence(s,b);if(!current)fail('PURCHASE_NOT_FOUND',404);const p=cleanProjection(purchaseState(current,{entity_id:b.purchase_id,revision:b.expected_revision}),['revision','goods_estimate_cents','total_estimate_cents']);
  if(!uuid(b.receipt_id)||!text(b.reference,120)||!array(b.lines,20)||!b.lines.length||!['CONFIRMED','PARTIALLY_RECEIVED'].includes(p.status))fail('RECEIPT_INVALID');
  if(d.purchases.some(p=>p.receipts.some(r=>r.receipt_id===b.receipt_id||normalized(r.reference)===normalized(b.reference))))fail('RECEIPT_ALREADY_RECORDED',409);
  const seen=new Set();for(const l of b.lines){if(!exact(l,['variant_id','quantity'])||seen.has(l.variant_id)||!integer(l.quantity,1))fail('RECEIPT_INVALID');seen.add(l.variant_id);const line=p.lines.find(n=>n.variant_id===l.variant_id);if(!line||l.quantity>line.quantity-line.received_quantity-line.cancelled_quantity)fail('RECEIPT_EXCEEDS_OPEN_QUANTITY',409);line.received_quantity+=l.quantity;
   const command={operation:'receive',variant_id:l.variant_id,request_id:await tokenUUID([b.request_id,l.variant_id]),selection:{quantity:l.quantity,effective_date:b.effective_date,evidence:b.evidence,reference:'material-receipt:'+b.receipt_id+':'+l.variant_id.slice(0,32)}};mutations.push(stockMutation(s,d,l.variant_id,[command]));
  }
  p.receipts.push({receipt_id:b.receipt_id,effective_date:b.effective_date,reference:b.reference,evidence:b.evidence,lines:b.lines,recorded_at:s.now});p.status=p.lines.every(l=>l.received_quantity+l.cancelled_quantity===l.quantity)?'RECEIVED':'PARTIALLY_RECEIVED';p.updated_at=s.now;base.payload=p;return base;
 }
 const order=sourceFor(d,b),old=current?cleanProjection(orderState(current,{entity_id:b.source_key,revision:b.expected_revision}),['revision']):null;
 if(b.action==='reserve_order'){
  requireFence(s,b);if(!eligible(order.status)||!['AVAILABLE_TO_RESERVE','RESERVED'].includes(order.material_state))fail('ORDER_MATERIALS_NOT_RESERVABLE',409);
  if(order.material_state==='RESERVED')fail('ORDER_ALREADY_RESERVED',409);
  const newGroup=()=>({schema:'production_material_reservations_v1',source_key:order.source_key,source_hash:order.source_hash,line_source_hash:order.line_source_hash,source_context:{item_id:order.item_id,model_id:order.model_id,commercial_quantity:order.commercial_quantity,order_hash:order.order_hash},mapping_revision:order.mapping_revision,components:order.components.map(c=>({variant_id:c.variant_id,quantity_per_unit:c.quantity_per_unit,required_quantity:c.required_quantity})),generation:0,reservations:[],consumptions:[],previous_generations:[],updated_at:s.now});
  let g=old??newGroup();
  if(old&&(old.line_source_hash!==order.line_source_hash||old.mapping_revision!==order.mapping_revision||old.source_context.commercial_quantity!==order.commercial_quantity)){
   if(old.consumptions.some(c=>c.status==='ACTIVE')||old.reservations.some(r=>d.stockMap.get(r.variant_id)?.reservations.find(v=>v.reservation_id===r.reservation_id)?.remaining_quantity>0))fail('SOURCE_OR_MAPPING_CHANGED_REVIEW_REQUIRED',409);
   const previous=clone(old);delete previous.previous_generations;g=newGroup();g.generation=old.generation;g.previous_generations=[...old.previous_generations,previous];if(g.previous_generations.length>20)fail('RESERVATION_HISTORY_CAPACITY_REACHED',409);
  }
  g.generation++;g.source_hash=order.source_hash;g.updated_at=s.now;
  for(const c of order.components){if(c.quantity_unallocated===0)continue;const request_id=await tokenUUID([b.request_id,c.variant_id]),demand_ref='material:'+order.source_key+':g'+g.generation,command={operation:'reserve',variant_id:c.variant_id,request_id,selection:{quantity:c.quantity_unallocated,demand_ref}};mutations.push(stockMutation(s,d,c.variant_id,[command]));g.reservations.push({variant_id:c.variant_id,reservation_id:request_id,demand_ref,quantity:c.quantity_unallocated});}
  if(!mutations.length)fail('ORDER_ALREADY_RESERVED',409);base.payload=g;return base;
 }
 if(!old)fail('RESERVATION_NOT_FOUND',404);
 if(b.action==='release_order'){
  if(b.fence_hash!==s.fence_hash)fail('PREVIEW_CHANGED',409);let changed=false;
  for(const c of old.components){const variant=d.stockMap.get(c.variant_id),operations=[];for(const r of old.reservations.filter(v=>v.variant_id===c.variant_id)){const reservation=variant.reservations.find(v=>v.reservation_id===r.reservation_id);if(!reservation)fail('RESERVATION_SOURCE_INVALID',503);if(reservation.remaining_quantity>0){changed=true;operations.push({operation:'release',variant_id:c.variant_id,request_id:await tokenUUID([b.request_id,r.reservation_id]),selection:{quantity:reservation.remaining_quantity,effective_date:today(s.now),evidence:b.evidence,reference:'material-release:'+b.request_id+':'+r.reservation_id.slice(0,8),reservation_id:r.reservation_id}});}}if(operations.length)mutations.push(stockMutation(s,d,c.variant_id,operations));}
  if(!changed)fail('NO_RESERVED_QUANTITY',409);old.updated_at=s.now;base.payload=old;return base;
 }
 if(b.action==='consume_order'){
  requireFence(s,b);if(order.material_state!=='RESERVED'||!array(b.lines,20)||!b.lines.length)fail('CONSUMPTION_NOT_AVAILABLE',409);
  const stockOps=new Map(),linkChanges=new Map(),seen=new Set(),productionSnapshots=[];
  for(const l of b.lines){if(!exact(l,['variant_id','production_record_id','quantity'])||!hash(l.variant_id)||!uuid(l.production_record_id)||!integer(l.quantity,1)||seen.has(l.production_record_id))fail('CONSUMPTION_INVALID');seen.add(l.production_record_id);
   const variant=d.stockMap.get(l.variant_id),production=s.manufacture.frame?.records.find(r=>r.record_id===l.production_record_id),known=d.manufacturing_records.find(r=>r.record_id===l.production_record_id),component=order.components.find(c=>c.variant_id===l.variant_id);
   if(!component||!production||production.status!=='ACTIVE'||production.source.kind!=='SAVED_DTF_ORDER_LINE'||production.source.key!==old.source_key||![old.source_hash,order.source_hash].includes(production.source.hash)||!physicalMatch(production.identity,variant)||production.identity.item_id!==order.item_id||production.identity.model_id!==order.model_id||!known||l.quantity>known.available_quantity)fail('MANUFACTURING_SOURCE_OR_QUANTITY_UNPROVEN',409);
   const consumption_id=await tokenUUID([b.request_id,l.production_record_id,l.variant_id]),prior=recordBy(s.rows.link,l.production_record_id),priorLink=prior?cleanProjection(linkState(prior.payload,prior),['revision','active_quantity']):{schema:'production_material_manufacturing_link_v1',production_record_id:l.production_record_id,source_key:old.source_key,variant_id:l.variant_id,consumptions:[],updated_at:s.now};
   if(priorLink.source_key!==old.source_key||priorLink.variant_id!==l.variant_id)fail('MANUFACTURING_ALREADY_LINKED_ELSEWHERE',409);
   let needed=l.quantity,operations=stockOps.get(l.variant_id)??[];
   for(const r of old.reservations.filter(r=>r.variant_id===l.variant_id)){const physical=variant.reservations.find(v=>v.reservation_id===r.reservation_id),already=operations.filter(o=>o.selection.reservation_id===r.reservation_id).reduce((n,o)=>n+o.selection.quantity,0),available=physical.remaining_quantity-already,quantity=Math.min(available,needed);if(quantity>0){operations.push({operation:'consume',variant_id:l.variant_id,request_id:await tokenUUID([b.request_id,l.production_record_id,r.reservation_id]),selection:{quantity,effective_date:production.produced_date,evidence:b.evidence,reference:'material-consume:'+consumption_id+':'+r.reservation_id.slice(0,8),reservation_id:r.reservation_id}});needed-=quantity;}if(needed===0)break;}
   if(needed!==0)fail('CONSUMPTION_EXCEEDS_RESERVED_QUANTITY',409);stockOps.set(l.variant_id,operations);
   priorLink.consumptions.push({consumption_id,quantity:l.quantity,status:'ACTIVE'});priorLink.updated_at=s.now;linkChanges.set(l.production_record_id,mutation(kinds.link,l.production_record_id,prior,priorLink,{schema:'material_manufacturing_consumption_v1',request_id:b.request_id,consumption_id,quantity:l.quantity}));
   old.consumptions.push({consumption_id,production_record_id:l.production_record_id,variant_id:l.variant_id,quantity:l.quantity,effective_date:production.produced_date,evidence:b.evidence,status:'ACTIVE',recorded_at:s.now,reversed_at:null,reversed_effective_date:null,reverse_reason:null,reverse_reference:null});
   productionSnapshots.push({record_id:production.record_id,payload:JSON.stringify(production)});
  }
  guards.push({sql:'SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN incurred_production_records p ON p.record_id=json_extract(j.value,\'$.record_id\') WHERE p.record_id IS NULL OR p.payload IS NOT json_extract(j.value,\'$.payload\'))',bindings:[JSON.stringify(productionSnapshots)]});
  for(const [variant,operations]of stockOps)mutations.push(stockMutation(s,d,variant,operations.sort((a,b)=>a.selection.effective_date.localeCompare(b.selection.effective_date))));mutations.push(...linkChanges.values());old.updated_at=s.now;base.payload=old;return base;
 }
 if(b.action==='reverse_consumption'){
  requireFence(s,b);const c=old.consumptions.find(c=>c.consumption_id===b.consumption_id);if(!c||c.status!=='ACTIVE')fail('CONSUMPTION_NOT_ACTIVE',409);if(b.effective_date<c.effective_date)fail('REVERSAL_BEFORE_CONSUMPTION',409);
  const prior=recordBy(s.rows.link,c.production_record_id);if(!prior)fail('MANUFACTURING_LINK_INVALID',503);const linked=cleanProjection(linkState(prior.payload,prior),['revision','active_quantity']),entry=linked.consumptions.find(v=>v.consumption_id===c.consumption_id);if(!entry||entry.status!=='ACTIVE'||entry.quantity!==c.quantity||linked.source_key!==old.source_key||linked.variant_id!==c.variant_id)fail('MANUFACTURING_LINK_INVALID',503);
  const reference='material-correction:'+c.consumption_id;mutations.push(stockMutation(s,d,c.variant_id,[{operation:'receive',variant_id:c.variant_id,request_id:await tokenUUID([b.request_id,c.variant_id]),selection:{quantity:c.quantity,effective_date:b.effective_date,evidence:b.evidence,reference}}]));
  entry.status='REVERSED';linked.updated_at=s.now;mutations.push(mutation(kinds.link,c.production_record_id,prior,linked,{schema:'material_manufacturing_consumption_reversal_v1',consumption_id:c.consumption_id,reason:b.reason,blank_stock_confirmed:true}));
  c.status='REVERSED';c.reversed_at=s.now;c.reversed_effective_date=b.effective_date;c.reverse_reason=b.reason;c.reverse_reference=reference;old.updated_at=s.now;base.payload=old;return base;
 }
 fail('ACTION_INVALID');
}
export async function mutateMaterialNeedsWorkspace(env,body,actor,options={}){
 const opts=settings(options),b=request(body,clock(opts)),scoped=optionsScope(opts,b.expected_scope);
 let kind,entity_id;if(b.action==='save_mapping'){if(!id(b.item_id)||!id(b.model_id,true))fail('MAPPING_INVALID');kind=kinds.mapping;entity_id=await financialDigest(['material-mapping-v1',b.item_id,b.model_id]);}
 else if(b.action==='save_supplier'){if(!uuid(b.supplier_id))fail('SUPPLIER_INVALID');kind=kinds.supplier;entity_id=b.supplier_id;}
 else if(['save_purchase','cancel_purchase','confirm_receipt'].includes(b.action)){if(!uuid(b.purchase_id))fail('PURCHASE_INVALID');kind=kinds.purchase;entity_id=b.purchase_id;}
 else{kind=kinds.order;entity_id=b.source_key;}
 // This read verifies scope before any additive trigger installation. Replay
 // itself remains the journal's first decision and never re-applies a receipt.
 const initial=await readOperationalCollectionSnapshot(env,{kinds:selectedKinds},scoped),initialDb=env.ADMIN_DB,initialContext=env.COMMERCIAL_CONTEXT;
 if(initialContext)assertCommercialCapability(initialContext,'production.write');
 if(scoped.assertAuthorized&&await scoped.assertAuthorized({scope:initial.scope,action:'write',capability:'production.write'})===false)fail('AUTHORIZATION_REVOKED',403);
 if(env.ADMIN_DB!==initialDb||env.COMMERCIAL_CONTEXT!==initialContext)fail('SCOPE_CHANGED',403);
 if(b.action==='consume_order'){
  const present=await env.ADMIN_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='incurred_production_records'").first();if(!present)fail('MANUFACTURING_SOURCE_UNAVAILABLE',409);
  await env.ADMIN_DB.batch(productionProtection.map(sql=>env.ADMIN_DB.prepare(sql)));
 }
 const saved=await mutateOperationalGroup(env,{kind,entity_id,expected_revision:b.expected_revision,request_id:b.request_id,command:b},{...scoped,writeCapability:'production.write',actor:env.COMMERCIAL_CONTEXT?.userId??actor,transitionGroup:async(current,command)=>{
  const s=await snapshot(env,{planning_date:command.planning_date},scoped);if(!scopeEqual(s.scope,initial.scope))fail('SCOPE_CHANGED',403);return transition(env,command,s,derived(s),current);
 }});
 const final=await snapshot(env,{planning_date:b.planning_date},scoped);return envelope(final,derived(final),{action:b.action,replayed:saved.replayed,revision:saved.revision});
}
