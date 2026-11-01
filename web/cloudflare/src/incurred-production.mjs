// Operator-confirmed manufacture facts. This ledger does not write financial
// estimates, prove payment, value recovered inventory or authorize stock IO.
export class IncurredProductionError extends Error{
 constructor(code,status=400,options){super(code,options);this.status=status;}
}
export const INCURRED_PRODUCTION_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS incurred_production_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,mutation_id TEXT NOT NULL,updated_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS incurred_production_records(record_id TEXT PRIMARY KEY,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=8192))`,
 `CREATE TABLE IF NOT EXISTS incurred_production_audit(revision INTEGER PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,record_id TEXT NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=32768),actor TEXT NOT NULL,created_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS incurred_production_guard(id INTEGER PRIMARY KEY CHECK(id=1),ok INTEGER NOT NULL CHECK(ok=1))`,
];

// Self-contained for the frozen browser copy. Every amount is a declared
// manufacture cost, never automatically added to the financial result.
export function projectIncurredProduction(value){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
 const array=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
 const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&v.normalize('NFC')===v&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
 const nullable=(v,max)=>v===null||text(v,max),id=(v,zero=false)=>v===null||typeof v==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(v);
 const date=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
 const dayFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}),encoder=new TextEncoder(),day=stamp=>dayFormatter.format(new Date(stamp*1000));
 const normalized=v=>v.normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
 const identity=v=>exact(v,['artwork','color','size','garment_type','fit','confirmed','item_id','model_id','sku'])&&nullable(v.artwork,120)&&nullable(v.color,80)&&nullable(v.size,16)&&['ADULT','CHILD','UNKNOWN'].includes(v.garment_type)&&['UNISEX','MALE','FEMALE','UNKNOWN'].includes(v.fit)&&typeof v.confirmed==='boolean'&&id(v.item_id)&&id(v.model_id,true)&&nullable(v.sku,128)&&(!v.confirmed||v.artwork!==null&&v.color!==null&&v.size!==null&&v.fit!=='UNKNOWN'&&(v.garment_type==='ADULT'?['P','M','G','GG','G1','G2','G3'].includes(v.size):v.garment_type==='CHILD'&&['2','4','6','8','10','12','14','16'].includes(v.size)));
 const reference=(v,who,amount)=>v===null||exact(v,['kind','revision','mode','unit_cost_cents'])&&['ADULT_REGULAR','ADULT_PLUS'].includes(v.kind)&&int(v.revision,1,2147483647)&&v.mode==='all_inclusive'&&int(v.unit_cost_cents,0,1000000)&&v.unit_cost_cents===amount&&who.garment_type==='ADULT'&&(v.kind==='ADULT_REGULAR'?['P','M','G','GG']:['G1','G2','G3']).includes(who.size);
 const source=(v,stamp)=>exact(v,['kind','key','hash','checked_at','order_hash','order_status','selling_quantity'])&&(v.kind==='MANUAL_LOT'?['key','hash','checked_at','order_hash','order_status','selling_quantity'].every(key=>v[key]===null):v.kind==='SAVED_DTF_ORDER_LINE'&&hash(v.key)&&hash(v.hash)&&int(v.checked_at,1,stamp)&&hash(v.order_hash)&&typeof v.order_status==='string'&&/^[A-Z][A-Z0-9_]{0,39}$/.test(v.order_status)&&int(v.selling_quantity,1,10000));
 const keys=['active_records','voided_records','produced_quantity','known_cost_quantity','unknown_cost_quantity','known_cost_cents','total_cost_cents','state'];
 try{
  if(!exact(value,['schema','checked_at','revision','records','summary','inventory_valuation','financial_integration_allowed','external_stock_write_allowed','basis'])||value.schema!=='incurred_production_v1'||!int(value.checked_at,1,9999999999)||!int(value.revision,0,2147483645)||!array(value.records,1000)||!exact(value.summary,keys)||!exact(value.inventory_valuation,['state','amount_cents'])||value.inventory_valuation.state!=='UNKNOWN'||value.inventory_valuation.amount_cents!==null||value.financial_integration_allowed!==false||value.external_stock_write_allowed!==false||value.basis!=='OPERATOR_CONFIRMED_INCURRED_PRODUCTION_NOT_PAID_CASH_OR_SALES_REFERENCE')return null;
  const rows=new Map(),activeRefs=new Set(),roots=new Set(),replaced=new Set();let active=0,voided=0,quantity=0n,knownQuantity=0n,unknownQuantity=0n,known=0n;
  for(const row of value.records){
   if(!exact(row,['record_id','production_ref','replaces_record_id','produced_date','quantity','identity','source','cost','evidence','status','recorded_at','updated_at','void_reason'])||!uuid(row.record_id)||rows.has(row.record_id)||!text(row.production_ref,120)||row.replaces_record_id!==null&&!uuid(row.replaces_record_id)||!date(row.produced_date)||!int(row.quantity,1,10000)||!identity(row.identity)||!text(row.evidence,240)||!['ACTIVE','VOID'].includes(row.status)||!int(row.recorded_at,1,value.checked_at)||!int(row.updated_at,row.recorded_at,value.checked_at)||row.produced_date>day(row.recorded_at)||!source(row.source,row.recorded_at)||!exact(row.cost,['state','currency','unit_cost_cents','reference','inventory_value_cents'])||row.cost.currency!=='BRL'||row.cost.inventory_value_cents!==null)return null;
   if(row.status==='ACTIVE'?row.void_reason!==null:!text(row.void_reason,240))return null;
   if(row.cost.state==='UNKNOWN'){if(row.cost.unit_cost_cents!==null||row.cost.reference!==null)return null;}
   else if(row.cost.state!=='DECLARED'||!int(row.cost.unit_cost_cents,0,1000000)||!reference(row.cost.reference,row.identity,row.cost.unit_cost_cents))return null;
   const ref=normalized(row.production_ref);
   if(row.replaces_record_id===null){if(roots.has(ref))return null;roots.add(ref);}
   else{if(replaced.has(row.replaces_record_id))return null;replaced.add(row.replaces_record_id);}
   rows.set(row.record_id,row);
   if(row.status==='VOID')voided++;
   else{
    if(activeRefs.has(ref))return null;activeRefs.add(ref);active++;quantity+=BigInt(row.quantity);
    if(row.cost.state==='UNKNOWN')unknownQuantity+=BigInt(row.quantity);
    else{knownQuantity+=BigInt(row.quantity);known+=BigInt(row.quantity)*BigInt(row.cost.unit_cost_cents);}
   }
   if(encoder.encode(JSON.stringify(row)).byteLength>8192)return null;
  }
  for(const row of rows.values())if(row.replaces_record_id!==null){
   const parent=rows.get(row.replaces_record_id);if(!parent||parent.status!=='VOID'||normalized(parent.production_ref)!==normalized(row.production_ref)||parent.updated_at>row.recorded_at)return null;
   const seen=new Set([row.record_id]);let link=row;
   while(link.replaces_record_id!==null){if(seen.has(link.replaces_record_id))return null;seen.add(link.replaces_record_id);link=rows.get(link.replaces_record_id);if(!link)return null;}
  }
  if(quantity>BigInt(Number.MAX_SAFE_INTEGER)||knownQuantity>BigInt(Number.MAX_SAFE_INTEGER)||unknownQuantity>BigInt(Number.MAX_SAFE_INTEGER)||known>BigInt(Number.MAX_SAFE_INTEGER)||value.revision<rows.size||value.revision===0&&rows.size!==0||value.revision>0&&rows.size===0)return null;
  const expected={active_records:active,voided_records:voided,produced_quantity:Number(quantity),known_cost_quantity:Number(knownQuantity),unknown_cost_quantity:Number(unknownQuantity),known_cost_cents:Number(known),total_cost_cents:active===0||unknownQuantity>0n?null:Number(known),state:active===0?'NO_RECORDS':unknownQuantity>0n?'PARTIAL_COSTS':'DECLARED_COSTS'};
  if(!keys.every(key=>value.summary[key]===expected[key])||encoder.encode(JSON.stringify(value)).byteLength>1048576)return null;
  return JSON.parse(JSON.stringify(value));
 }catch{return null;}
}

// Two independent views of the same declared facts. The periods can overlap;
// they are never added together or used to change the financial estimate.
export function incurredProductionPeriods(ledger,selection){
 try{
  const frame=projectIncurredProduction(ledger),plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
  const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
  const date=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  if(!frame||!exact(selection,['month','week_of']))return null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(frame.checked_at*1000)),{month,week_of}=selection;
  if(typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||month>today.slice(0,7)||!date(week_of)||week_of>today)return null;
  const at=new Date(week_of+'T12:00:00Z');at.setUTCDate(at.getUTCDate()-(at.getUTCDay()+6)%7);const weekStart=at.toISOString().slice(0,10);at.setUTCDate(at.getUTCDate()+6);const weekEnd=at.toISOString().slice(0,10),last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0,12)).toISOString().slice(0,10);
  const period=(start_date,end_date)=>{
   let active=0,voided=0,quantity=0n,knownQuantity=0n,unknownQuantity=0n,known=0n;
   for(const row of frame.records){if(row.produced_date<start_date||row.produced_date>end_date)continue;if(row.status==='VOID'){voided++;continue;}active++;quantity+=BigInt(row.quantity);if(row.cost.state==='UNKNOWN')unknownQuantity+=BigInt(row.quantity);else{knownQuantity+=BigInt(row.quantity);known+=BigInt(row.quantity)*BigInt(row.cost.unit_cost_cents);}}
   if([quantity,knownQuantity,unknownQuantity,known].some(v=>v>BigInt(Number.MAX_SAFE_INTEGER)))return null;
   return {start_date,end_date,summary:{active_records:active,voided_records:voided,produced_quantity:Number(quantity),known_cost_quantity:Number(knownQuantity),unknown_cost_quantity:Number(unknownQuantity),known_cost_cents:Number(known),total_cost_cents:active===0||unknownQuantity>0n?null:Number(known),state:active===0?'NO_RECORDS':unknownQuantity>0n?'PARTIAL_COSTS':'DECLARED_COSTS'}};
  };
  const monthly=period(month+'-01',last<today?last:today),weekly=period(weekStart,weekEnd<today?weekEnd:today);if(!monthly||!weekly)return null;
  return {month,week_of,monthly,weekly};
 }catch{return null;}
}

const ready=new WeakSet(),encoder=new TextEncoder(),tables=['incurred_production_state','incurred_production_records','incurred_production_audit','incurred_production_guard'];
const fail=(suffix,status=400)=>{throw new IncurredProductionError('INCURRED_PRODUCTION_'+suffix,status);};
const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&v.normalize('NFC')===v&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
const normalized=v=>v.normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
const manual=()=>({kind:'MANUAL_LOT',key:null,hash:null,checked_at:null,order_hash:null,order_status:null,selling_quantity:null});
function database(env){const db=env?.ADMIN_DB;if(!db?.prepare||!db?.batch)fail('UNAVAILABLE',503);return db;}
function clock(now){let value;try{value=now();}catch{}if(!int(value,1,9999999999999))fail('CLOCK_INVALID',503);return Math.floor(value/1000);}
async function tableNames(db){
 const found=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('incurred_production_state','incurred_production_records','incurred_production_audit','incurred_production_guard')").all();
 if(found?.success===false||!Array.isArray(found?.results))fail('STORAGE_INVALID',503);const names=new Set(found.results.map(row=>row?.name));
 if(names.size!==0&&(names.size!==tables.length||tables.some(name=>!names.has(name))))fail('STORAGE_INVALID',503);return names;
}
async function ensure(db){if(!ready.has(db)){if((await tableNames(db)).size===0)await db.batch(INCURRED_PRODUCTION_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}}
function summary(records){
 let active=0,voided=0,quantity=0n,knownQuantity=0n,unknownQuantity=0n,known=0n;
 for(const row of records){if(row.status==='VOID'){voided++;continue;}active++;quantity+=BigInt(row.quantity);if(row.cost.state==='UNKNOWN')unknownQuantity+=BigInt(row.quantity);else{knownQuantity+=BigInt(row.quantity);known+=BigInt(row.quantity)*BigInt(row.cost.unit_cost_cents);}}
 if([quantity,knownQuantity,unknownQuantity,known].some(v=>v>BigInt(Number.MAX_SAFE_INTEGER)))fail('LIMIT',409);
 return {active_records:active,voided_records:voided,produced_quantity:Number(quantity),known_cost_quantity:Number(knownQuantity),unknown_cost_quantity:Number(unknownQuantity),known_cost_cents:Number(known),total_cost_cents:active===0||unknownQuantity>0n?null:Number(known),state:active===0?'NO_RECORDS':unknownQuantity>0n?'PARTIAL_COSTS':'DECLARED_COSTS'};
}
function view(revision,records,stamp){return {schema:'incurred_production_v1',checked_at:stamp,revision,records,summary:summary(records),inventory_valuation:{state:'UNKNOWN',amount_cents:null},financial_integration_allowed:false,external_stock_write_allowed:false,basis:'OPERATOR_CONFIRMED_INCURRED_PRODUCTION_NOT_PAID_CASH_OR_SALES_REFERENCE'};}
function projected(revision,records,stamp){let value;try{value=projectIncurredProduction(view(revision,records,stamp));}catch{}if(!value)fail('STORAGE_INVALID',503);return value;}
async function snapshot(db,stamp,requestId=null){
 const parts=await db.batch([
  db.prepare('SELECT revision,mutation_id,updated_at FROM incurred_production_state WHERE id=1'),
  db.prepare('SELECT record_id,payload FROM incurred_production_records ORDER BY record_id LIMIT 1001'),
  db.prepare('SELECT request_hash,record_id FROM incurred_production_audit WHERE request_id=?').bind(requestId??''),
  db.prepare('SELECT COUNT(*) AS count,MIN(revision) AS first_revision,MAX(revision) AS last_revision FROM incurred_production_audit'),
 ]);
 if(!Array.isArray(parts)||parts.length!==4||parts.some(part=>part?.success===false||!Array.isArray(part?.results))||parts[0].results.length>1||parts[2].results.length>1||parts[3].results.length!==1)fail('STORAGE_INVALID',503);
 const state=parts[0].results[0]??null,stats=parts[3].results[0],records=[];
 if(state&&(!exact(state,['revision','mutation_id','updated_at'])||!int(state.revision,1,2147483645)||!uuid(state.mutation_id)||!int(state.updated_at,1,stamp)))fail('STORAGE_INVALID',503);
 if(!exact(stats,['count','first_revision','last_revision'])||!int(stats.count)||stats.count!==(state?.revision??0)||stats.count===0&&(stats.first_revision!==null||stats.last_revision!==null)||stats.count>0&&(stats.first_revision!==1||stats.last_revision!==state.revision))fail('STORAGE_INVALID',503);
 for(const row of parts[1].results){let value;try{if(!exact(row,['record_id','payload'])||typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>8192)throw Error();value=JSON.parse(row.payload);}catch{fail('STORAGE_INVALID',503);}if(value?.record_id!==row.record_id)fail('STORAGE_INVALID',503);records.push(value);}
 if(state&&records.some(row=>row.updated_at>state.updated_at))fail('STORAGE_INVALID',503);
 const replay=parts[2].results[0]??null;if(replay&&(!exact(replay,['request_hash','record_id'])||!hash(replay.request_hash)||!uuid(replay.record_id)))fail('STORAGE_INVALID',503);
 return {state,frame:projected(state?.revision??0,records,stamp),replay};
}
export async function readIncurredProduction(env,{now=()=>Date.now()}={}){
 try{const db=database(env),stamp=clock(now);if((await tableNames(db)).size===0)return projected(0,[],stamp);return (await snapshot(db,stamp)).frame;}
 catch(error){if(error instanceof IncurredProductionError)throw error;throw new IncurredProductionError('INCURRED_PRODUCTION_UNAVAILABLE',503,{cause:error});}
}
function request(input,stamp){
 const action=plain(input)?Object.getOwnPropertyDescriptor(input,'action')?.value:null;
 const fields=action==='record'?['production_ref','replaces_record_id','produced_date','quantity','identity','source','cost','evidence','confirmed']:action==='void'?['reason']:null;
 if(!fields||!exact(input,['revision','request_id','action','record_id',...fields])||!int(input.revision,0,2147483644)||!uuid(input.request_id)||!uuid(input.record_id))fail('REQUEST_INVALID');
 if(action==='void'){if(!text(input.reason,240))fail('REQUEST_INVALID');}
 else{
  if(input.confirmed!==true||!text(input.production_ref,120)||!int(input.quantity,1,10000)||!text(input.evidence,240)||!exact(input.source,['kind','key','hash'])||!['MANUAL_LOT','SAVED_DTF_ORDER_LINE'].includes(input.source.kind)||(input.source.kind==='MANUAL_LOT'?input.source.key!==null||input.source.hash!==null:!hash(input.source.key)||!hash(input.source.hash))||!exact(input.cost,['unit_cost_cents','reference'])||input.cost.unit_cost_cents!==null&&!int(input.cost.unit_cost_cents,0,1000000))fail('REQUEST_INVALID');
  const row={record_id:input.record_id,production_ref:input.production_ref,replaces_record_id:input.replaces_record_id,produced_date:input.produced_date,quantity:input.quantity,identity:input.identity,source:manual(),cost:{state:input.cost.unit_cost_cents===null?'UNKNOWN':'DECLARED',currency:'BRL',unit_cost_cents:input.cost.unit_cost_cents,reference:input.cost.reference,inventory_value_cents:null},evidence:input.evidence,status:'ACTIVE',recorded_at:stamp,updated_at:stamp,void_reason:null};
  // A replacement predecessor is checked against the stored history after
  // replay lookup; remove only that link from this standalone shape check.
  if(input.replaces_record_id!==null&&!uuid(input.replaces_record_id))fail('REQUEST_INVALID');
  if(!projectIncurredProduction(view(1,[{...row,replaces_record_id:null}],stamp)))fail('REQUEST_INVALID');
 }
 const canonical=value=>plain(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 return canonical(input);
}
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(value)))),v=>v.toString(16).padStart(2,'0')).join('');}
export async function mutateIncurredProduction(env,input,actor,{now=()=>Date.now(),trustedSource=null,trustedReference=null}={}){
 try{return await mutate(env,input,actor,{now,trustedSource,trustedReference});}
 catch(error){if(error instanceof IncurredProductionError)throw error;throw new IncurredProductionError('INCURRED_PRODUCTION_UNAVAILABLE',503,{cause:error});}
}
async function mutate(env,input,actor,{now,trustedSource,trustedReference}){
 const stamp=clock(now),value=request(input,stamp);if(!text(actor,256))fail('REQUEST_INVALID');
 const db=database(env);await ensure(db);const requestHash=await digest(value),observed=await snapshot(db,stamp,value.request_id);
 if(observed.replay){if(observed.replay.request_hash!==requestHash||observed.replay.record_id!==value.record_id)fail('CONFLICT',409);return observed.frame;}
 if(observed.frame.revision!==value.revision)fail('CONFLICT',409);
 const rows=observed.frame.records,previous=rows.find(row=>row.record_id===value.record_id),before=previous?JSON.parse(JSON.stringify(previous)):null;let changed;
 if(value.action==='record'){
  if(previous)fail('CONFLICT',409);
  const ref=normalized(value.production_ref),sameRef=rows.filter(row=>normalized(row.production_ref)===ref);
  if(sameRef.some(row=>row.status==='ACTIVE'))fail('REFERENCE_CONFLICT',409);
  if(value.replaces_record_id===null){if(sameRef.length)fail('REPLACEMENT_REQUIRED',409);}
  else{
   const predecessor=rows.find(row=>row.record_id===value.replaces_record_id);
   if(!predecessor||predecessor.status!=='VOID'||normalized(predecessor.production_ref)!==ref||rows.some(row=>row.replaces_record_id===predecessor.record_id)||predecessor.updated_at>stamp)fail('REPLACEMENT_INVALID',409);
  }
  let source=manual();
  if(value.source.kind==='SAVED_DTF_ORDER_LINE'){
   if(!exact(trustedSource,['kind','key','hash','checked_at','order_hash','order_status','selling_quantity'])||trustedSource.kind!==value.source.kind||trustedSource.key!==value.source.key||trustedSource.hash!==value.source.hash)fail('SOURCE_CHANGED',409);source=trustedSource;
  }
  if(value.cost.reference!==null&&(!exact(trustedReference,['kind','revision','mode','unit_cost_cents'])||!Object.keys(value.cost.reference).every(key=>value.cost.reference[key]===trustedReference[key])))fail('REFERENCE_CHANGED',409);
  changed={record_id:value.record_id,production_ref:value.production_ref,replaces_record_id:value.replaces_record_id,produced_date:value.produced_date,quantity:value.quantity,identity:value.identity,source,cost:{state:value.cost.unit_cost_cents===null?'UNKNOWN':'DECLARED',currency:'BRL',unit_cost_cents:value.cost.unit_cost_cents,reference:value.cost.reference,inventory_value_cents:null},evidence:value.evidence,status:'ACTIVE',recorded_at:stamp,updated_at:stamp,void_reason:null};
  if(!projectIncurredProduction(view(1,[{...changed,replaces_record_id:null}],stamp)))fail('SOURCE_CHANGED',409);rows.push(changed);
 }else{
  if(!previous)fail('RECORD_NOT_FOUND',404);if(previous.status==='VOID')fail('RECORD_VOID',409);
  changed={...previous,status:'VOID',updated_at:stamp,void_reason:value.reason};rows[rows.indexOf(previous)]=changed;
 }
 if(rows.length>1000||encoder.encode(JSON.stringify(changed)).byteLength>8192)fail('LIMIT',409);
 rows.sort((a,b)=>a.record_id.localeCompare(b.record_id));const next=view(value.revision+1,rows,stamp);
 if(encoder.encode(JSON.stringify(next)).byteLength>1048576)fail('LIMIT',409);if(!projectIncurredProduction(next))fail('STORAGE_INVALID',503);
 const finished=clock(now);if(finished<stamp||finished-stamp>60)fail('CLOCK_INVALID',503);
 const serial=value.revision+1,mutationId=crypto.randomUUID(),payload=JSON.stringify(changed),audit=JSON.stringify({request:value,previous_record:before,new_record:changed});if(encoder.encode(audit).byteLength>32768)fail('LIMIT',409);
 const guard='EXISTS(SELECT 1 FROM incurred_production_state WHERE id=1 AND revision=? AND mutation_id=?)',args=[serial,mutationId];
 const gate=value.revision===0?db.prepare('INSERT OR IGNORE INTO incurred_production_state(id,revision,mutation_id,updated_at) VALUES(1,1,?,?)').bind(mutationId,stamp):db.prepare('UPDATE incurred_production_state SET revision=revision+1,mutation_id=?,updated_at=? WHERE id=1 AND revision=? AND updated_at<=?').bind(mutationId,stamp,value.revision,stamp);
 const write=value.action==='record'?db.prepare('INSERT OR IGNORE INTO incurred_production_records(record_id,payload) SELECT ?,? WHERE '+guard).bind(value.record_id,payload,...args):db.prepare('UPDATE incurred_production_records SET payload=? WHERE record_id=? AND payload=? AND '+guard).bind(payload,value.record_id,JSON.stringify(before),...args);
 const results=await db.batch([
  gate,write,
  db.prepare('INSERT INTO incurred_production_audit(revision,request_id,request_hash,record_id,action,payload,actor,created_at) SELECT ?,?,?,?,?,?,?,? WHERE '+guard).bind(serial,value.request_id,requestHash,value.record_id,value.action,audit,actor,stamp,...args),
  db.prepare('INSERT INTO incurred_production_guard(id,ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM incurred_production_records WHERE record_id=? AND payload=?) AND EXISTS(SELECT 1 FROM incurred_production_audit WHERE revision=? AND request_id=? AND request_hash=?) THEN 1 ELSE 0 END WHERE '+guard+' ON CONFLICT(id) DO UPDATE SET ok=excluded.ok').bind(value.record_id,payload,serial,value.request_id,requestHash,...args),
 ]);
 if(results[0]?.meta?.changes!==1){const replay=await db.prepare('SELECT request_hash,record_id FROM incurred_production_audit WHERE request_id=?').bind(value.request_id).first();if(replay?.request_hash===requestHash&&replay.record_id===value.record_id)return (await snapshot(db,clock(now))).frame;fail('CONFLICT',409);}
 if(results.some(row=>row?.meta?.changes!==1))fail('STORAGE_INVALID',503);
 return (await snapshot(db,clock(now))).frame;
}
