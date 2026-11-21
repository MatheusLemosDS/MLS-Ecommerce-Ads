import {financialDigest} from './financial-event-ledger.mjs';
import {readOperationalEntity,listOperationalEntities,readOperationalHistory,mutateOperationalEntity} from './operational-journal.mjs';

// Physical blank garments only. This journal neither values inventory nor
// changes COGS, manufacture, orders, bank balances or external stock.
export class PhysicalShirtStockError extends Error {
 constructor(code,status=400){super('PHYSICAL_SHIRT_STOCK_'+code);this.code=this.message;this.status=status;}
}
const fail=(code,status=400)=>{throw new PhysicalShirtStockError(code,status);};
const kind='PHYSICAL_SHIRT_STOCK',readCapability='production.read',writeCapability='production.write';
const own=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const exact=(value,keys)=>own(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&value.trim()===value&&value.normalize('NFC')===value&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);
const canonical=value=>value.normalize('NFKC').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
const date=value=>typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const day=iso=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(iso));
const sum=values=>{const value=values.reduce((a,b)=>a+BigInt(b),0n);if(value<0n||value>BigInt(Number.MAX_SAFE_INTEGER))fail('QUANTITY_OVERFLOW');return Number(value);};
function optionsValue(options){
 if(!own(options)||Reflect.ownKeys(options).some(key=>!['now','assertAuthorized'].includes(key)||typeof options[key]!=='function'))fail('CONFIGURATION_INVALID',503);
 return {...options,readCapability,writeCapability};
}
function checkedTime(options){
 let value;try{value=(options.now??Date.now)();}catch{fail('CLOCK_INVALID',503);}
 if(!integer(value,1))fail('CLOCK_INVALID',503);
 let iso;try{iso=new Date(value).toISOString();}catch{fail('CLOCK_INVALID',503);}
 if(!/^20\d{2}-/.test(iso))fail('CLOCK_INVALID',503);return iso;
}
export function normalizePhysicalShirtIdentity(value){
 if(!exact(value,['garment_type','fit','size','color','material'])||!['ADULT','CHILD'].includes(value.garment_type)||!['UNISEX','MALE','FEMALE'].includes(value.fit)||typeof value.size!=='string'||!text(value.color,80)||value.material!==null&&!text(value.material,80))fail('IDENTITY_INVALID');
 const size=value.size.toUpperCase(),allowed=value.garment_type==='ADULT'?['PP','P','M','G','GG','G1','G2','G3','G4','G5','XG','XXG','XGG'].includes(size):/^(?:[0-9]|1[0-8])$/.test(size);
 if(!allowed||value.size!==size)fail('IDENTITY_INVALID');
 return {...value,color:value.color.replace(/\s+/g,' '),material:value.material===null?null:value.material.replace(/\s+/g,' ')};
}
export async function physicalShirtIdentityId(identity){
 const selected=normalizePhysicalShirtIdentity(identity);
 return financialDigest(['blank-physical-shirt-v1',{...selected,color:canonical(selected.color),material:selected.material===null?null:canonical(selected.material)}]);
}
function state(value){
 if(!exact(value,['schema','variant_id','identity','initialized','initial_date','physical_quantity','reservations','source_refs','last_movement'])||value.schema!=='physical_shirt_stock_state_v1'||!hash(value.variant_id)||typeof value.initialized!=='boolean'||!Array.isArray(value.reservations)||value.reservations.length>1000||!Array.isArray(value.source_refs)||value.source_refs.length>1000||new Set(value.source_refs).size!==value.source_refs.length||value.source_refs.some(v=>!text(v,120)))fail('STORAGE_INVALID',503);
 const identity=normalizePhysicalShirtIdentity(value.identity);if(JSON.stringify(identity)!==JSON.stringify(value.identity))fail('STORAGE_INVALID',503);
 if(value.initialized?!date(value.initial_date)||!integer(value.physical_quantity):value.initial_date!==null||value.physical_quantity!==null||value.reservations.length!==0||value.source_refs.length!==0)fail('STORAGE_INVALID',503);
 const ids=new Set(),refs=new Set();
 for(const row of value.reservations){
  if(!exact(row,['reservation_id','demand_ref','quantity','remaining_quantity','consumed_quantity','released_quantity'])||!uuid(row.reservation_id)||ids.has(row.reservation_id)||!text(row.demand_ref,120)||refs.has(canonical(row.demand_ref))||!integer(row.quantity,1)||![row.remaining_quantity,row.consumed_quantity,row.released_quantity].every(v=>integer(v))||BigInt(row.quantity)!==BigInt(row.remaining_quantity)+BigInt(row.consumed_quantity)+BigInt(row.released_quantity))fail('STORAGE_INVALID',503);
  ids.add(row.reservation_id);refs.add(canonical(row.demand_ref));
 }
 if(value.initialized&&sum(value.reservations.map(r=>r.remaining_quantity))>value.physical_quantity)fail('STORAGE_INVALID',503);
 const movement=value.last_movement;
 if(movement!==null&&(!exact(movement,['operation','effective_date','reference','evidence','quantity','at'])||!['initial_count','receive','adjust','reserve','release','consume'].includes(movement.operation)||!date(movement.effective_date)||!text(movement.reference,120)||!text(movement.evidence,240)||!integer(movement.quantity,-Number.MAX_SAFE_INTEGER)||typeof movement.at!=='string'||!Number.isFinite(Date.parse(movement.at))))fail('STORAGE_INVALID',503);
 return JSON.parse(JSON.stringify(value));
}
export function projectPhysicalShirtStock(value,revision=0){
 const selected=state(value),reserved=selected.initialized?sum(selected.reservations.map(r=>r.remaining_quantity)):null;
 return {variant_id:selected.variant_id,revision,identity:selected.identity,state:selected.initialized?'CONFIRMED':'UNKNOWN',physical_usable_quantity:selected.physical_quantity,reserved_quantity:reserved,free_quantity:selected.initialized?selected.physical_quantity-reserved:null,reservations:selected.reservations,last_movement:selected.last_movement};
}
function movementSelection(selection,operation,now){
 const keys=['quantity','effective_date','evidence','reference'];if(['release','consume'].includes(operation))keys.push('reservation_id');
 if(!exact(selection,keys)||!integer(selection.quantity,operation==='adjust'?-Number.MAX_SAFE_INTEGER:operation==='initial_count'?0:1)||operation==='adjust'&&selection.quantity===0||!date(selection.effective_date)||selection.effective_date>day(now)||!text(selection.evidence,240)||!text(selection.reference,120)||['release','consume'].includes(operation)&&!uuid(selection.reservation_id))fail('MOVEMENT_INVALID');
 return selection;
}
export function applyPhysicalShirtCommand(payload,command,{now}={}){
 if(!exact(command,['operation','variant_id','request_id','selection'])||!hash(command.variant_id)||!uuid(command.request_id)||typeof now!=='string'||!Number.isFinite(Date.parse(now)))fail('COMMAND_INVALID');
 const {operation,selection}=command;
 if(operation==='register'){
  if(payload!==null)fail('VARIANT_EXISTS',409);
  const identity=normalizePhysicalShirtIdentity(selection);
  return {schema:'physical_shirt_stock_state_v1',variant_id:command.variant_id,identity,initialized:false,initial_date:null,physical_quantity:null,reservations:[],source_refs:[],last_movement:null};
 }
 if(payload===null)fail('VARIANT_NOT_FOUND',404);
 const next=state(payload);if(next.variant_id!==command.variant_id)fail('STORAGE_INVALID',503);
 if(operation==='reserve'){
  if(!exact(selection,['quantity','demand_ref'])||!integer(selection.quantity,1)||!text(selection.demand_ref,120))fail('RESERVATION_INVALID');
  if(!next.initialized)fail('INITIAL_COUNT_REQUIRED',409);
  if(next.reservations.some(r=>canonical(r.demand_ref)===canonical(selection.demand_ref)))fail('DEMAND_ALREADY_RESERVED',409);
  const free=next.physical_quantity-sum(next.reservations.map(r=>r.remaining_quantity));if(selection.quantity>free)fail('INSUFFICIENT_FREE_STOCK',409);
  if(next.reservations.length>=1000)fail('CAPACITY_REACHED',409);
  next.reservations.push({reservation_id:command.request_id,demand_ref:selection.demand_ref,quantity:selection.quantity,remaining_quantity:selection.quantity,consumed_quantity:0,released_quantity:0});
  next.last_movement={operation,effective_date:day(now),reference:selection.demand_ref,evidence:'Reserva interna vinculada à demanda declarada',quantity:selection.quantity,at:now};
 }else{
  if(!['initial_count','receive','adjust','release','consume'].includes(operation))fail('OPERATION_INVALID');
  movementSelection(selection,operation,now);
  if(operation==='initial_count'&&next.initialized)fail('INITIAL_COUNT_ALREADY_RECORDED',409);
  if(operation!=='initial_count'&&!next.initialized)fail('INITIAL_COUNT_REQUIRED',409);
  if(next.initial_date!==null&&selection.effective_date<next.initial_date)fail('MOVEMENT_BEFORE_INITIAL_COUNT',409);
  if(next.last_movement!==null&&selection.effective_date<next.last_movement.effective_date)fail('MOVEMENT_BEFORE_LATEST_MOVEMENT',409);
  const source=canonical(selection.reference);if(next.source_refs.includes(source))fail('DUPLICATE_REFERENCE',409);
  if(next.source_refs.length>=1000)fail('CAPACITY_REACHED',409);
  if(operation==='initial_count'){next.initialized=true;next.initial_date=selection.effective_date;next.physical_quantity=selection.quantity;}
  if(operation==='receive')next.physical_quantity=sum([next.physical_quantity,selection.quantity]);
  if(operation==='adjust'){
   const quantity=BigInt(next.physical_quantity)+BigInt(selection.quantity),reserved=BigInt(sum(next.reservations.map(r=>r.remaining_quantity)));
   if(quantity<reserved)fail('ADJUSTMENT_BELOW_RESERVED_STOCK',409);if(quantity>BigInt(Number.MAX_SAFE_INTEGER))fail('QUANTITY_OVERFLOW');next.physical_quantity=Number(quantity);
  }
  if(operation==='release'||operation==='consume'){
   const reservation=next.reservations.find(r=>r.reservation_id===selection.reservation_id);
   if(!reservation||selection.quantity>reservation.remaining_quantity)fail('RESERVATION_QUANTITY_EXCEEDED',409);
   reservation.remaining_quantity-=selection.quantity;
   if(operation==='release')reservation.released_quantity+=selection.quantity;
   else{reservation.consumed_quantity+=selection.quantity;next.physical_quantity-=selection.quantity;}
  }
  next.source_refs.push(source);next.last_movement={operation,effective_date:selection.effective_date,reference:selection.reference,evidence:selection.evidence,quantity:selection.quantity,at:now};
 }
 return state(next);
}
const physicalFlags=Object.freeze({financial_integration_allowed:false,external_stock_write_allowed:false});
function row(record){
 if(!record||record.payload===null)return null;
 if(record.payload.variant_id!==record.entity_id)fail('STORAGE_INVALID',503);
 return projectPhysicalShirtStock(record.payload,record.revision);
}
export async function readPhysicalShirtStockWorkspace(env,query={},options={}){
 const settings=optionsValue(options),checked_at=checkedTime(settings);
 if(!own(query)||Reflect.ownKeys(query).some(k=>!['variant_id','cursor','history_cursor','limit'].includes(k)))fail('QUERY_INVALID');
 const {variant_id=null,cursor=null,history_cursor=null,limit=25}=query;
 if(variant_id!==null&&!hash(variant_id)||!integer(limit,1,50)||cursor!==null&&typeof cursor!=='string'||history_cursor!==null&&typeof history_cursor!=='string'||variant_id===null&&history_cursor!==null)fail('QUERY_INVALID');
 const list=await listOperationalEntities(env,{kind,cursor,limit},settings);
 const history=variant_id===null?{rows:[],next_cursor:null}:await readOperationalHistory(env,{kind,entity_id:variant_id,cursor:history_cursor,limit},settings);
 // History precedes the final entity read, so a concurrent movement cannot
 // make the history newer than the displayed balance. A selected row already
 // listed on this page is replaced with that same final observation.
 const selected=variant_id===null?null:await readOperationalEntity(env,{kind,entity_id:variant_id},settings);
 const sameScope=value=>value&&value.organization_id===list.scope.organization_id&&value.store_id===list.scope.store_id;
 if(selected&&!sameScope(selected.scope)||history.scope&&!sameScope(history.scope))fail('SCOPE_CHANGED',403);
 const chosen=row(selected);
 if(history.rows.some(record=>chosen===null||record.revision>selected.revision))fail('SOURCE_CHANGED',409);
 const variants=list.rows.map(record=>chosen!==null&&record.entity_id===chosen.variant_id?chosen:row(record));
 return {schema:'physical_shirt_stock_workspace_v1',scope:list.scope,variants,next_cursor:list.next_cursor,selected:chosen,history:{rows:history.rows,next_cursor:history.next_cursor},checked_at:checkedTime(settings),valuation:{state:'UNKNOWN',amount_cents:null},...physicalFlags};
}
export async function mutatePhysicalShirtStockWorkspace(env,body,actor,options={}){
 const settings=optionsValue(options),checked_at=checkedTime(settings);
 if(!exact(body,['operation','variant_id','expected_revision','request_id','confirmed','selection','expected_scope'])||!integer(body.expected_revision,0,2147483645)||!uuid(body.request_id)||body.confirmed!==true||!['register','initial_count','receive','adjust','reserve','release','consume'].includes(body.operation)||!exact(body.expected_scope,['organization_id','store_id'])||!text(body.expected_scope.organization_id,160)||!text(body.expected_scope.store_id,160))fail('REQUEST_INVALID');
 const expectedScope={...body.expected_scope},authorize=settings.assertAuthorized;
 const scopedSettings={...settings,assertAuthorized:async access=>{
  // This is a precondition from the last valid workspace, not an authority to
  // select a tenant. The journal derives the actual scope from the server and
  // checks this callback before DDL and again around asynchronous operations.
  if(access.scope.organization_id!==expectedScope.organization_id||access.scope.store_id!==expectedScope.store_id)fail('SCOPE_CHANGED',403);
  return authorize?await authorize(access):true;
 }};
 let variant_id=body.variant_id;
 if(body.operation==='register'){
  if(variant_id!==null||body.expected_revision!==0)fail('REQUEST_INVALID');variant_id=await physicalShirtIdentityId(body.selection);
 }else if(!hash(variant_id))fail('REQUEST_INVALID');
 const command={operation:body.operation,variant_id,request_id:body.request_id,selection:body.selection};
 // Validation before any DDL; the journal repeats the actual transition only
 // after checking persistent replay and the entity's optimistic revision.
 if(body.operation!=='register'&&body.operation!=='reserve')movementSelection(body.selection,body.operation,checked_at);
 const result=await mutateOperationalEntity(env,{kind,entity_id:variant_id,expected_revision:body.expected_revision,request_id:body.request_id,command},{...scopedSettings,actor:env.COMMERCIAL_CONTEXT?.userId??actor,transition:applyPhysicalShirtCommand});
 return {schema:'physical_shirt_stock_mutation_v1',scope:result.scope,variant:row(result),replayed:result.replayed,checked_at:checkedTime(settings),...physicalFlags};
}
