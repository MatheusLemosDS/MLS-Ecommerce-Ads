// Owner-confirmed physical pieces. Provider status never receives or restocks
// merchandise, and this ledger has no financial or marketplace write authority.
export class PhysicalReturnsError extends Error{
 constructor(code,status=400,options){super(code,options);this.status=status;}
}
export const PHYSICAL_RETURNS_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS physical_returns_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,mutation_id TEXT NOT NULL,updated_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS physical_returns_cases(case_hash TEXT PRIMARY KEY,order_hash TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=65536))`,
 `CREATE TABLE IF NOT EXISTS physical_returns_audit(revision INTEGER PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,case_hash TEXT NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=8192),actor TEXT NOT NULL,created_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS physical_returns_guard(id INTEGER PRIMARY KEY CHECK(id=1),ok INTEGER NOT NULL CHECK(ok=1))`,
];

// Self-contained for the owner's frozen browser copy. All physical availability
// is an inspected count, never a monetary valuation or an external stock grant.
export function projectPhysicalReturns(value){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
 const array=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
 const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&v.normalize('NFC')===v&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
 const nullable=(v,max)=>v===null||text(v,max),id=(v,zero=false)=>v===null||typeof v==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(v);
 const statuses=['PENDING','UNKNOWN','REQUESTED','ACCEPTED','CANCELLED','JUDGING','REFUND_PAID','CLOSED','PROCESSING'];
 const partitionKeys=['resellable','repair','damaged','mismatch','quarantine'];
 const summaryKeys=['cases','lines','received_quantity','active_quantity','voided_quantity','resellable_quantity','repair_quantity','damaged_quantity','mismatch_quantity','quarantine_quantity','physically_available_quantity'];
 const identity=v=>exact(v,['artwork','color','size','garment_type','fit','confirmed','item_id','model_id','sku'])&&nullable(v.artwork,120)&&nullable(v.color,80)&&nullable(v.size,16)&&['ADULT','CHILD','UNKNOWN'].includes(v.garment_type)&&['UNISEX','MALE','FEMALE','UNKNOWN'].includes(v.fit)&&typeof v.confirmed==='boolean'&&id(v.item_id)&&id(v.model_id,true)&&nullable(v.sku,128)&&(!v.confirmed||v.artwork!==null&&v.color!==null&&v.size!==null&&v.fit!=='UNKNOWN'&&(v.garment_type==='ADULT'?['P','M','G','GG','G1','G2','G3'].includes(v.size):v.garment_type==='CHILD'&&['2','4','6','8','10','12','14','16'].includes(v.size)));
 try{
  if(!exact(value,['schema','checked_at','revision','cases','summary','valuation','external_stock_write_allowed','basis'])||value.schema!=='physical_returns_v1'||!int(value.checked_at,1,9999999999)||!int(value.revision,0,2147483645)||!array(value.cases,100)||!exact(value.summary,summaryKeys)||!exact(value.valuation,['state','amount_cents'])||value.valuation.state!=='UNKNOWN'||value.valuation.amount_cents!==null||value.external_stock_write_allowed!==false||value.basis!=='OPERATOR_CONFIRMED_PHYSICAL_RETURNS_NOT_PROVIDER_RESTOCK_OR_FINANCIAL_PROFIT')return null;
  const counts=Object.fromEntries(summaryKeys.map(key=>[key,0])),cases=new Set(),lines=new Set();
  for(const record of value.cases){
   if(!exact(record,['case_hash','order_hash','source','registered_at','updated_at','lines'])||!hash(record.case_hash)||cases.has(record.case_hash)||!hash(record.order_hash)||!int(record.registered_at,1,value.checked_at)||!int(record.updated_at,record.registered_at,value.checked_at)||!array(record.lines,50))return null;
   const source=record.source;
   if(!exact(source,['month','publication_revision','status','checked_at'])||typeof source.month!=='string'||!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(source.month)||!int(source.publication_revision,1,2147483647)||!statuses.includes(source.status)||(source.checked_at===null?source.status!=='PENDING':!int(source.checked_at,1,record.registered_at)||source.status==='PENDING'))return null;
   cases.add(record.case_hash);counts.cases++;const receiptRefs=new Set();
   for(const line of record.lines){
    if(!exact(line,['line_id','receipt_ref','quantity','status','identity','partition','received_at','updated_at','reason','valuation_state','carrying_value_cents'])||!uuid(line.line_id)||!text(line.receipt_ref,120)||lines.has(line.line_id)||!int(line.quantity,1,10000)||!['QUARANTINE','INSPECTED','VOID'].includes(line.status)||!identity(line.identity)||!exact(line.partition,partitionKeys)||!int(line.received_at,record.registered_at,record.updated_at)||!int(line.updated_at,line.received_at,record.updated_at)||line.reason!==null&&!text(line.reason,240)||line.valuation_state!=='UNKNOWN'||line.carrying_value_cents!==null)return null;
    const receiptKey=line.receipt_ref.normalize('NFKC').toLowerCase().replace(/\s+/g,' ');if(line.status!=='VOID'){if(receiptRefs.has(receiptKey))return null;receiptRefs.add(receiptKey);}
    if(!partitionKeys.every(key=>int(line.partition[key],0,line.quantity))||partitionKeys.reduce((sum,key)=>sum+line.partition[key],0)!==line.quantity||line.partition.resellable>0&&!line.identity.confirmed)return null;
    if(line.status==='QUARANTINE'&&(line.reason!==null||line.partition.quarantine!==line.quantity)||line.status!=='QUARANTINE'&&line.reason===null)return null;
    lines.add(line.line_id);counts.lines++;counts.received_quantity+=line.quantity;
    if(line.status==='VOID')counts.voided_quantity+=line.quantity;
    else{counts.active_quantity+=line.quantity;for(const key of partitionKeys)counts[key+'_quantity']+=line.partition[key];}
   }
   if(new TextEncoder().encode(JSON.stringify(record)).byteLength>65536)return null;
  }
  counts.physically_available_quantity=counts.resellable_quantity;
  if(counts.lines>1000||value.revision===0&&counts.cases!==0||value.revision<counts.cases||!summaryKeys.every(key=>int(value.summary[key])&&value.summary[key]===counts[key])||new TextEncoder().encode(JSON.stringify(value)).byteLength>524288)return null;
  return JSON.parse(JSON.stringify(value));
 }catch{return null;}
}

const ready=new WeakSet(),encoder=new TextEncoder(),tables=['physical_returns_state','physical_returns_cases','physical_returns_audit','physical_returns_guard'];
const fail=(suffix,status=400)=>{throw new PhysicalReturnsError('PHYSICAL_RETURNS_'+suffix,status);};
const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&v.normalize('NFC')===v&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
const partitionKeys=['resellable','repair','damaged','mismatch','quarantine'];
function database(env){const db=env?.ADMIN_DB;if(!db?.prepare||!db?.batch)fail('UNAVAILABLE',503);return db;}
function clock(now){let value;try{value=now();}catch{}if(!int(value,1,9999999999999))fail('CLOCK_INVALID',503);return Math.floor(value/1000);}
async function ensure(db){if(!ready.has(db)){await db.batch(PHYSICAL_RETURNS_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}}
function view(revision,cases,stamp){
 const summary={cases:cases.length,lines:0,received_quantity:0,active_quantity:0,voided_quantity:0,resellable_quantity:0,repair_quantity:0,damaged_quantity:0,mismatch_quantity:0,quarantine_quantity:0,physically_available_quantity:0};
 for(const record of cases)for(const line of record.lines){summary.lines++;summary.received_quantity+=line.quantity;if(line.status==='VOID')summary.voided_quantity+=line.quantity;else{summary.active_quantity+=line.quantity;for(const key of partitionKeys)summary[key+'_quantity']+=line.partition[key];}}
 summary.physically_available_quantity=summary.resellable_quantity;
 return {schema:'physical_returns_v1',checked_at:stamp,revision,cases,summary,valuation:{state:'UNKNOWN',amount_cents:null},external_stock_write_allowed:false,basis:'OPERATOR_CONFIRMED_PHYSICAL_RETURNS_NOT_PROVIDER_RESTOCK_OR_FINANCIAL_PROFIT'};
}
function projected(revision,cases,stamp){const result=projectPhysicalReturns(view(revision,cases,stamp));if(!result)fail('STORAGE_INVALID',503);return result;}
async function snapshot(db,stamp,requestId=null){
 const rows=await db.batch([
  db.prepare('SELECT revision,mutation_id,updated_at FROM physical_returns_state WHERE id=1'),
  db.prepare('SELECT case_hash,order_hash,payload FROM physical_returns_cases ORDER BY case_hash LIMIT 101'),
  db.prepare('SELECT request_hash,case_hash FROM physical_returns_audit WHERE request_id=?').bind(requestId??''),
 ]),state=rows[0]?.results?.[0]??null,cases=[];
 if(state&&(!int(state.revision,1,2147483645)||!uuid(state.mutation_id)||!int(state.updated_at,1,stamp)))fail('STORAGE_INVALID',503);
 for(const row of rows[1]?.results??[]){let value;try{if(typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>65536)throw Error();value=JSON.parse(row.payload);}catch{fail('STORAGE_INVALID',503);}if(value?.case_hash!==row.case_hash||value?.order_hash!==row.order_hash)fail('STORAGE_INVALID',503);cases.push(value);}
 if(state&&cases.some(record=>record.updated_at>state.updated_at))fail('STORAGE_INVALID',503);
 const result=projected(state?.revision??0,cases,stamp);return {state,frame:result,replay:rows[2]?.results?.[0]??null};
}
export async function readPhysicalReturns(env,{now=()=>Date.now()}={}){
 try{
  const db=database(env),stamp=clock(now),found=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('physical_returns_state','physical_returns_cases','physical_returns_audit','physical_returns_guard')").all();
  const names=new Set((found?.results??[]).map(row=>row.name));if(names.size===0)return projected(0,[],stamp);if(names.size!==tables.length||tables.some(name=>!names.has(name)))fail('STORAGE_INVALID',503);
  return (await snapshot(db,stamp)).frame;
 }catch(error){if(error instanceof PhysicalReturnsError)throw error;throw new PhysicalReturnsError('PHYSICAL_RETURNS_UNAVAILABLE',503,{cause:error});}
}
function request(input){
 const action=plain(input)?Object.getOwnPropertyDescriptor(input,'action')?.value:null;
 const fields=action==='register'?['order_hash']:action==='receive'?['line_id','receipt_ref','quantity','identity']:action==='inspect'?['line_id','partition','identity','reason']:action==='void'?['line_id','reason']:null;
 if(!fields||!exact(input,['revision','request_id','action','case_hash',...fields])||!int(input.revision,0,2147483644)||!uuid(input.request_id)||!hash(input.case_hash)||action==='register'&&!hash(input.order_hash)||action!=='register'&&!uuid(input.line_id)||['inspect','void'].includes(action)&&!text(input.reason,240))fail('REQUEST_INVALID');
 if(action==='receive'&&(!int(input.quantity,1,10000)||!text(input.receipt_ref,120)))fail('REQUEST_INVALID');
 // Reuse the closed browser contract to validate identities and partitions.
 if(['receive','inspect'].includes(action)){
  const quantity=action==='receive'?input.quantity:partitionKeys.reduce((sum,key)=>sum+(exact(input.partition,partitionKeys)&&int(input.partition[key],0,10000)?input.partition[key]:10001),0);
  const line={line_id:input.line_id,receipt_ref:action==='receive'?input.receipt_ref:'inspection',quantity,status:action==='receive'?'QUARANTINE':'INSPECTED',identity:input.identity,partition:action==='receive'?{resellable:0,repair:0,damaged:0,mismatch:0,quarantine:quantity}:input.partition,received_at:1,updated_at:1,reason:action==='receive'?null:input.reason,valuation_state:'UNKNOWN',carrying_value_cents:null};
  const sample={case_hash:input.case_hash,order_hash:'0'.repeat(64),source:{month:'2000-01',publication_revision:1,status:'PENDING',checked_at:null},registered_at:1,updated_at:1,lines:[line]};
  if(!projectPhysicalReturns(view(1,[sample],1)))fail('REQUEST_INVALID');
 }
 const canonical=value=>plain(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 return canonical(input);
}
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(value)))),v=>v.toString(16).padStart(2,'0')).join('');}
export async function mutatePhysicalReturns(env,input,actor,{now=()=>Date.now(),sourceCase=null}={}){
 try{return await mutate(env,input,actor,{now,sourceCase});}catch(error){if(typeof error?.message==='string'&&error.message.includes('MLS_RETURN_MANUFACTURING_LINK_ACTIVE'))throw new PhysicalReturnsError('PHYSICAL_RETURNS_MANUFACTURING_LINK_ACTIVE',409);if(error instanceof PhysicalReturnsError)throw error;throw new PhysicalReturnsError('PHYSICAL_RETURNS_UNAVAILABLE',503,{cause:error});}
}
async function mutate(env,input,actor,{now,sourceCase}){
 const stamp=clock(now),value=request(input);if(!text(actor,256))fail('REQUEST_INVALID');
 const db=database(env);await ensure(db);const requestHash=await digest(value),observed=await snapshot(db,stamp,value.request_id);
 if(observed.replay){if(observed.replay.request_hash!==requestHash||observed.replay.case_hash!==value.case_hash)fail('CONFLICT',409);return observed.frame;}
 if(observed.frame.revision!==value.revision)fail('CONFLICT',409);
 const cases=observed.frame.cases,record=cases.find(row=>row.case_hash===value.case_hash),previousUpdatedAt=record?.updated_at??null,previousLine=['inspect','void'].includes(value.action)?record?.lines.find(row=>row.line_id===value.line_id)??null:null,beforeLine=previousLine?JSON.parse(JSON.stringify(previousLine)):null;let changed=record;
 if(value.action==='register'){
  if(record){if(record.order_hash!==value.order_hash)fail('IDENTITY_CONFLICT',409);return observed.frame;}
  if(!exact(sourceCase,['case_hash','order_hash','status','checked_at','month','publication_revision'])||sourceCase.case_hash!==value.case_hash||sourceCase.order_hash!==value.order_hash)fail('SOURCE_REQUIRED',409);
  changed={case_hash:value.case_hash,order_hash:value.order_hash,source:{month:sourceCase.month,publication_revision:sourceCase.publication_revision,status:sourceCase.status,checked_at:sourceCase.checked_at},registered_at:stamp,updated_at:stamp,lines:[]};
  if(!projectPhysicalReturns(view(1,[changed],stamp)))fail('SOURCE_REQUIRED',409);cases.push(changed);
 }else{
  if(!record)fail('CASE_NOT_FOUND',404);if(stamp<record.updated_at)fail('CLOCK_INVALID',503);
  if(value.action==='receive'){
   if(cases.some(row=>row.lines.some(line=>line.line_id===value.line_id)))fail('CONFLICT',409);
   const ref=value.receipt_ref.normalize('NFKC').toLowerCase().replace(/\s+/g,' ');if(record.lines.some(line=>line.status!=='VOID'&&line.receipt_ref.normalize('NFKC').toLowerCase().replace(/\s+/g,' ')===ref))fail('RECEIPT_REFERENCE_CONFLICT',409);
   record.lines.push({line_id:value.line_id,receipt_ref:value.receipt_ref,quantity:value.quantity,status:'QUARANTINE',identity:value.identity,partition:{resellable:0,repair:0,damaged:0,mismatch:0,quarantine:value.quantity},received_at:stamp,updated_at:stamp,reason:null,valuation_state:'UNKNOWN',carrying_value_cents:null});
  }else{
   const line=record.lines.find(row=>row.line_id===value.line_id);if(!line)fail('LINE_NOT_FOUND',404);if(line.status==='VOID')fail('LINE_VOID',409);
   if(value.action==='inspect'){if(partitionKeys.reduce((sum,key)=>sum+value.partition[key],0)!==line.quantity)fail('QUANTITY_MISMATCH',409);line.identity=value.identity;line.partition=value.partition;line.status='INSPECTED';}
   else line.status='VOID';
   line.reason=value.reason;line.updated_at=stamp;
  }
  record.updated_at=stamp;
 }
 if(cases.length>100||cases.some(row=>row.lines.length>50)||cases.reduce((count,row)=>count+row.lines.length,0)>1000)fail('LIMIT',409);
 cases.sort((a,b)=>a.case_hash.localeCompare(b.case_hash));
 const next=view(value.revision+1,cases,stamp);if(encoder.encode(JSON.stringify(next)).byteLength>524288||encoder.encode(JSON.stringify(changed)).byteLength>65536)fail('LIMIT',409);if(!projectPhysicalReturns(next))fail('REQUEST_INVALID');
 const finished=clock(now);if(finished<stamp||finished-stamp>60)fail('CLOCK_INVALID',503);
 const serial=value.revision+1,mutationId=crypto.randomUUID(),payload=JSON.stringify(changed),audit=JSON.stringify({request:value,previous_updated_at:previousUpdatedAt,previous_line:beforeLine,source:value.action==='register'?changed.source:null});
 if(encoder.encode(audit).byteLength>8192)fail('LIMIT',409);
 const guard='EXISTS(SELECT 1 FROM physical_returns_state WHERE id=1 AND revision=? AND mutation_id=?)',args=[serial,mutationId];
 const gate=value.revision===0?db.prepare('INSERT OR IGNORE INTO physical_returns_state(id,revision,mutation_id,updated_at) VALUES(1,1,?,?)').bind(mutationId,stamp):db.prepare('UPDATE physical_returns_state SET revision=revision+1,mutation_id=?,updated_at=? WHERE id=1 AND revision=? AND updated_at<=?').bind(mutationId,stamp,value.revision,stamp);
 const results=await db.batch([
  gate,
  db.prepare('INSERT INTO physical_returns_cases(case_hash,order_hash,payload) SELECT ?,?,? WHERE '+guard+' ON CONFLICT(case_hash) DO UPDATE SET payload=excluded.payload WHERE physical_returns_cases.order_hash=excluded.order_hash').bind(value.case_hash,changed.order_hash,payload,...args),
  db.prepare('INSERT INTO physical_returns_audit(revision,request_id,request_hash,case_hash,action,payload,actor,created_at) SELECT ?,?,?,?,?,?,?,? WHERE '+guard).bind(serial,value.request_id,requestHash,value.case_hash,value.action,audit,actor,stamp,...args),
  db.prepare('INSERT INTO physical_returns_guard(id,ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM physical_returns_cases WHERE case_hash=? AND order_hash=? AND payload=?) AND EXISTS(SELECT 1 FROM physical_returns_audit WHERE revision=? AND request_id=? AND request_hash=?) THEN 1 ELSE 0 END WHERE '+guard+' ON CONFLICT(id) DO UPDATE SET ok=excluded.ok').bind(value.case_hash,changed.order_hash,payload,serial,value.request_id,requestHash,...args),
 ]);
 if(results[0]?.meta?.changes!==1){const replay=await db.prepare('SELECT request_hash,case_hash FROM physical_returns_audit WHERE request_id=?').bind(value.request_id).first();if(replay?.request_hash===requestHash&&replay.case_hash===value.case_hash)return (await snapshot(db,clock(now))).frame;fail('CONFLICT',409);}
 if(results.some(row=>row?.meta?.changes!==1))fail('STORAGE_INVALID',503);
 return (await snapshot(db,clock(now))).frame;
}
