// Owner-declared operating expenses. Entries are recognized by competence;
// marking an entry paid never makes a bank transfer or deducts it a second time.
export class ExpenseLedgerError extends Error {
 constructor(code,status=400,options){super(code,options);this.status=status;}
}

export const EXPENSE_LEDGER_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_expense_ledger_state (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,mutation_id TEXT NOT NULL,updated_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS business_expense_ledger_months (month TEXT PRIMARY KEY NOT NULL,mode TEXT NOT NULL CHECK(mode IN ('DRAFT','CONFIRMED')),unallocated_cents INTEGER NOT NULL CHECK(unallocated_cents>=0),payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=262144),updated_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS business_expense_ledger_audit (revision INTEGER PRIMARY KEY NOT NULL,request_id TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,action TEXT NOT NULL,month TEXT NOT NULL,payload TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL)`,
];

// Self-contained because the owner browser embeds this projector with toString.
export function projectExpenseLedger(value){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
 const month=v=>typeof v==='string'&&/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
 const day=v=>typeof v==='string'&&/^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const iso=v=>typeof v==='string'&&/^20[0-9]{2}-/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
 const arr=v=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=200&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
 const keys=['schema','month','revision','mode','expenses_revision','current_external_expenses_cents','recharge_treatment','unallocated_cents','items_total_cents','total_cents','open_cents','paid_cents','overdue_cents','today','items','updated_at'];
 const itemKeys=['id','category','description','amount_cents','competence_month','due_date','status','paid_date','series_id','installment_number','installments','created_at','updated_at'];
 try{
  if(!exact(value,keys)||value.schema!=='expense_ledger_v1'||!month(value.month)||!int(value.revision,0,2147483645)||!['MANUAL','DRAFT','CONFIRMED'].includes(value.mode)||!int(value.expenses_revision,0,2147483646)||!['UNCONFIRMED','ADS_RECHARGE','TECH_SUPPORT'].includes(value.recharge_treatment)||!day(value.today)||!arr(value.items)||value.updated_at!==null&&!iso(value.updated_at))return null;
  if(value.current_external_expenses_cents!==null&&!int(value.current_external_expenses_cents)||(value.expenses_revision===0?(value.current_external_expenses_cents!==null||value.recharge_treatment!=='UNCONFIRMED'):value.current_external_expenses_cents===null))return null;
  for(const key of ['unallocated_cents','items_total_cents','total_cents','open_cents','paid_cents','overdue_cents'])if(!int(value[key]))return null;
  if(value.mode==='MANUAL'?(value.items.length!==0||value.updated_at!==null||value.unallocated_cents!==(value.current_external_expenses_cents??0)):(value.revision<1||value.updated_at===null))return null;
  const ids=new Set();let items=0n,open=0n,paid=0n,overdue=0n;
  for(const item of value.items){
   if(!exact(item,itemKeys)||!uuid(item.id)||ids.has(item.id)||!uuid(item.series_id)||!['RENT','EMPLOYEES','BILL','OTHER'].includes(item.category)||typeof item.description!=='string'||item.description.length<1||item.description.length>160||item.description.trim()!==item.description||/[\u0000-\u001f\u007f]/.test(item.description)||!int(item.amount_cents,1)||item.competence_month!==value.month||!day(item.due_date)||!['OPEN','PAID','CANCELLED'].includes(item.status)||item.paid_date!==null&&(!day(item.paid_date)||item.paid_date>value.today)||item.status==='PAID'&&item.paid_date===null||item.status==='OPEN'&&item.paid_date!==null||!int(item.installments,1,120)||!int(item.installment_number,1,item.installments)||!iso(item.created_at)||!iso(item.updated_at)||item.updated_at<item.created_at)return null;
   ids.add(item.id);if(item.status==='CANCELLED')continue;const amount=BigInt(item.amount_cents);items+=amount;if(item.status==='PAID')paid+=amount;else{open+=amount;if(item.due_date<value.today)overdue+=amount;}
  }
  const total=items+BigInt(value.unallocated_cents);
  if(total>BigInt(Number.MAX_SAFE_INTEGER)||items!==BigInt(value.items_total_cents)||total!==BigInt(value.total_cents)||open!==BigInt(value.open_cents)||paid!==BigInt(value.paid_cents)||overdue!==BigInt(value.overdue_cents)||value.mode==='CONFIRMED'&&value.current_external_expenses_cents!==value.total_cents)return null;
  return {...value,items:value.items.map(item=>({...item}))};
 }catch{return null;}
}

const ready=new WeakSet();
const fail=(code,status=400)=>{throw new ExpenseLedgerError(code,status);};
const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const validMonth=v=>typeof v==='string'&&/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const day=v=>typeof v==='string'&&/^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const treatments=['UNCONFIRMED','ADS_RECHARGE','TECH_SUPPORT'];
const safe=v=>{if(v<0n||v>BigInt(Number.MAX_SAFE_INTEGER))fail('EXPENSE_LEDGER_AMOUNT_INVALID');return Number(v);};
const totalOf=(items,balance)=>safe(items.reduce((sum,item)=>sum+(item.status==='CANCELLED'?0n:BigInt(item.amount_cents)),BigInt(balance)));
function clockValue(now){let clock;try{clock=now();}catch{}if(!integer(clock,1))fail('EXPENSE_LEDGER_UNAVAILABLE',503);const time=new Date(clock).toISOString(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(clock));if(!day(today))fail('EXPENSE_LEDGER_UNAVAILABLE',503);return {time,today};}
function database(env){if(!env?.ADMIN_DB||typeof env.ADMIN_DB.batch!=='function')fail('EXPENSE_LEDGER_UNAVAILABLE',503);return env.ADMIN_DB;}
async function ensure(db){if(!ready.has(db)){await db.batch(EXPENSE_LEDGER_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}}
const expenseDefault=()=>({revision:0,external_expenses_cents:null,recharge_treatment:'UNCONFIRMED',updated_at:null});
function fromRows(month,revision,ledger,expense,today){
 const items=ledger?JSON.parse(ledger.payload):[],unallocated=ledger?.unallocated_cents??expense.external_expenses_cents??0;
 const active=items.filter(item=>item.status!=='CANCELLED'),sum=rows=>safe(rows.reduce((amount,item)=>amount+BigInt(item.amount_cents),0n));
 const result={schema:'expense_ledger_v1',month,revision,mode:ledger?.mode??'MANUAL',expenses_revision:expense.revision,current_external_expenses_cents:expense.external_expenses_cents,recharge_treatment:expense.recharge_treatment,unallocated_cents:unallocated,items_total_cents:sum(active),total_cents:totalOf(items,unallocated),open_cents:sum(active.filter(item=>item.status==='OPEN')),paid_cents:sum(active.filter(item=>item.status==='PAID')),overdue_cents:sum(active.filter(item=>item.status==='OPEN'&&item.due_date<today)),today,items,updated_at:ledger?.updated_at??null};
 const projected=projectExpenseLedger(result);if(!projected)fail('EXPENSE_LEDGER_STORAGE_INVALID',503);return projected;
}
async function snapshot(db,months,requestId=null){
 const serialized=JSON.stringify(months),rows=await db.batch([
  db.prepare('SELECT revision FROM business_expense_ledger_state WHERE id=1'),
  db.prepare('SELECT month,mode,unallocated_cents,payload,updated_at FROM business_expense_ledger_months WHERE month IN (SELECT value FROM json_each(?))').bind(serialized),
  db.prepare('SELECT month,revision,external_expenses_cents,recharge_treatment,updated_at FROM business_month_expenses WHERE month IN (SELECT value FROM json_each(?))').bind(serialized),
  db.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(json_array_length(payload)),0) AS entries FROM business_expense_ledger_months'),
  db.prepare('SELECT request_hash,month FROM business_expense_ledger_audit WHERE request_id=?').bind(requestId??''),
 ]);
 const revision=rows[0].results[0]?.revision??0;if(!integer(revision,0,2147483645))fail('EXPENSE_LEDGER_STORAGE_INVALID',503);
 return {revision,months:new Map(rows[1].results.map(row=>[row.month,row])),expenses:new Map(rows[2].results.map(row=>[row.month,row])),count:rows[3].results[0],replay:rows[4].results[0]??null};
}
export async function readExpenseLedger(env,{month},{now=()=>Date.now()}={}){
 try{
  if(!validMonth(month))fail('EXPENSE_LEDGER_REQUEST_INVALID');const {today}=clockValue(now),db=database(env);await ensure(db);
  // A normal read touches only this month's two rows and the global revision.
  const rows=await db.batch([db.prepare('SELECT revision FROM business_expense_ledger_state WHERE id=1'),db.prepare('SELECT mode,unallocated_cents,payload,updated_at FROM business_expense_ledger_months WHERE month=?').bind(month),db.prepare('SELECT revision,external_expenses_cents,recharge_treatment,updated_at FROM business_month_expenses WHERE month=?').bind(month)]);
  return fromRows(month,rows[0].results[0]?.revision??0,rows[1].results[0],rows[2].results[0]??expenseDefault(),today);
 }catch(error){if(error instanceof ExpenseLedgerError)throw error;throw new ExpenseLedgerError('EXPENSE_LEDGER_UNAVAILABLE',503,{cause:error});}
}
function addMonths(value,count,withDay=false){
 const [year,month,date]=value.split('-').map(Number),target=new Date(Date.UTC(year,month-1+count,1));
 if(withDay){const end=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();target.setUTCDate(Math.min(date,end));}
 return target.toISOString().slice(0,withDay?10:7);
}
function validate(input,today){
 if(!plain(input))fail('EXPENSE_LEDGER_REQUEST_INVALID');
 const action=Object.getOwnPropertyDescriptor(input??{},'action')?.value;
 const fields=action==='save'?['entry','installments']:action==='cancel'?['id']:action==='confirm'?['unallocated_cents','expenses_revision','recharge_treatment']:null;
 if(!fields||!exact(input,['action','month','revision','request_id',...fields])||!validMonth(input.month)||!integer(input.revision,0,2147483644)||!uuid(input.request_id))fail('EXPENSE_LEDGER_REQUEST_INVALID');
 const value={action,month:input.month,revision:input.revision,request_id:input.request_id};
 if(action==='save'){
  const item=input.entry;if(!exact(item,['id','category','description','amount_cents','competence_month','due_date','status','paid_date'])||item.id!==null&&!uuid(item.id)||!['RENT','EMPLOYEES','BILL','OTHER'].includes(item.category)||typeof item.description!=='string'||item.description.length<1||item.description.length>160||item.description.trim()!==item.description||/[\u0000-\u001f\u007f]/.test(item.description)||!integer(item.amount_cents,1)||item.competence_month!==input.month||!day(item.due_date)||!['OPEN','PAID'].includes(item.status)||item.status==='PAID'&&(!day(item.paid_date)||item.paid_date>today)||item.status==='OPEN'&&item.paid_date!==null||!integer(input.installments,1,120)||item.id!==null&&input.installments!==1||!validMonth(addMonths(input.month,input.installments-1))||!day(addMonths(item.due_date,input.installments-1,true)))fail('EXPENSE_LEDGER_REQUEST_INVALID');
  value.entry={id:item.id,category:item.category,description:item.description,amount_cents:item.amount_cents,competence_month:item.competence_month,due_date:item.due_date,status:item.status,paid_date:item.paid_date};value.installments=input.installments;
 }else if(action==='cancel'){if(!uuid(input.id))fail('EXPENSE_LEDGER_REQUEST_INVALID');value.id=input.id;}
 else{if(!integer(input.unallocated_cents)||!integer(input.expenses_revision,0,2147483645)||!treatments.includes(input.recharge_treatment))fail('EXPENSE_LEDGER_REQUEST_INVALID');Object.assign(value,{unallocated_cents:input.unallocated_cents,expenses_revision:input.expenses_revision,recharge_treatment:input.recharge_treatment});}
 return value;
}
async function hash(input){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(input)))),v=>v.toString(16).padStart(2,'0')).join('');}

export async function mutateExpenseLedger(env,input,actor,{now=()=>Date.now()}={}){
 try{return await mutate(env,input,actor,{now});}
 catch(error){if(error instanceof ExpenseLedgerError)throw error;throw new ExpenseLedgerError('EXPENSE_LEDGER_UNAVAILABLE',503,{cause:error});}
}
async function mutate(env,input,actor,{now}){
 const {time,today}=clockValue(now),value=validate(input,today);if(typeof actor!=='string'||actor.length<1||actor.length>256)fail('EXPENSE_LEDGER_REQUEST_INVALID');
 const db=database(env);await ensure(db);const digest=await hash(value),months=value.action==='save'&&value.entry.id===null?Array.from({length:value.installments},(_,index)=>addMonths(value.month,index)):[value.month],observed=await snapshot(db,months,value.request_id);
 if(observed.replay){if(observed.replay.request_hash!==digest||observed.replay.month!==value.month)fail('EXPENSE_LEDGER_CONFLICT',409);return readExpenseLedger(env,{month:value.month},{now});}
 if(observed.revision!==value.revision)fail('EXPENSE_LEDGER_CONFLICT',409);
 if(!integer(observed.count?.count,0,1200)||!integer(observed.count?.entries,0,2000))fail('EXPENSE_LEDGER_STORAGE_INVALID',503);
 const updates=new Map();for(const month of months){
  const previous=observed.months.get(month),expense=observed.expenses.get(month)??expenseDefault();
  const frame=fromRows(month,observed.revision,previous,expense,today);
  updates.set(month,{month,mode:previous?.mode??'DRAFT',unallocated_cents:frame.unallocated_cents,items:frame.items,expense,updated_at:time});
 }
 const current=updates.get(value.month);let added=0;
 if(value.action==='save'){
  if(value.entry.id===null){
   const series=crypto.randomUUID();for(let index=0;index<months.length;index++){
    const target=updates.get(months[index]);target.items.push({...value.entry,id:crypto.randomUUID(),competence_month:months[index],due_date:addMonths(value.entry.due_date,index,true),status:index===0?value.entry.status:'OPEN',paid_date:index===0?value.entry.paid_date:null,series_id:series,installment_number:index+1,installments:value.installments,created_at:time,updated_at:time});added++;
   }
  }else{
   const index=current.items.findIndex(item=>item.id===value.entry.id);if(index<0||current.items[index].status==='CANCELLED')fail('EXPENSE_LEDGER_ITEM_NOT_FOUND',409);
   const before=current.items[index],after={...before,...value.entry,updated_at:time};
   if(Object.keys(value.entry).every(key=>before[key]===value.entry[key]))return readExpenseLedger(env,{month:value.month},{now});
   current.items[index]=after;
  }
 }else if(value.action==='cancel'){
  const item=current.items.find(item=>item.id===value.id);if(!item)fail('EXPENSE_LEDGER_ITEM_NOT_FOUND',409);if(item.status==='CANCELLED')return readExpenseLedger(env,{month:value.month},{now});item.status='CANCELLED';item.updated_at=time;
 }else{
  if(current.expense.revision!==value.expenses_revision)fail('EXPENSE_LEDGER_CONFLICT',409);
  if(current.mode==='CONFIRMED'&&current.unallocated_cents===value.unallocated_cents&&current.expense.recharge_treatment===value.recharge_treatment)return readExpenseLedger(env,{month:value.month},{now});
  current.unallocated_cents=value.unallocated_cents;current.mode='CONFIRMED';current.treatment=value.recharge_treatment;
 }
 if(observed.count.entries+added>2000||observed.count.count+months.filter(month=>!observed.months.has(month)).length>1200||[...updates.values()].some(row=>row.items.length>200))fail('EXPENSE_LEDGER_LIMIT',409);
 const serial=observed.revision+1,mutationId=crypto.randomUUID(),guard='EXISTS (SELECT 1 FROM business_expense_ledger_state WHERE id=1 AND revision=? AND mutation_id=?)',guardArgs=[serial,mutationId];
 // Match every affected aggregate in the same transaction, including a legacy
 // tab racing the very first migration. Once a month exists in the ledger,
 // legacy writes are guarded against it at the SQL boundary.
 const expected=JSON.stringify(months.map(month=>({month,revision:observed.expenses.get(month)?.revision??0}))),unchanged=`NOT EXISTS (SELECT 1 FROM json_each(?) AS expected LEFT JOIN business_month_expenses AS saved ON saved.month=json_extract(expected.value,'$.month') WHERE COALESCE(saved.revision,0)<>json_extract(expected.value,'$.revision'))`;
 const gate=observed.revision===0?db.prepare(`INSERT OR IGNORE INTO business_expense_ledger_state(id,revision,mutation_id,updated_at) SELECT 1,1,?,? WHERE ${unchanged}`).bind(mutationId,time,expected):db.prepare(`UPDATE business_expense_ledger_state SET revision=revision+1,mutation_id=?,updated_at=? WHERE id=1 AND revision=? AND ${unchanged}`).bind(mutationId,time,observed.revision,expected);
 const statements=[gate];
 for(const row of updates.values()){
  const total=totalOf(row.items,row.unallocated_cents),payload=JSON.stringify(row.items);if(new TextEncoder().encode(payload).byteLength>262144)fail('EXPENSE_LEDGER_LIMIT',409);
  statements.push(db.prepare(`INSERT INTO business_expense_ledger_months(month,mode,unallocated_cents,payload,updated_at) SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(month) DO UPDATE SET mode=excluded.mode,unallocated_cents=excluded.unallocated_cents,payload=excluded.payload,updated_at=excluded.updated_at`).bind(row.month,row.mode,row.unallocated_cents,payload,time,...guardArgs));
  if(row.mode!=='CONFIRMED')continue;
  const treatment=row.treatment??row.expense.recharge_treatment;
  if(row.expense.external_expenses_cents===total&&row.expense.recharge_treatment===treatment)continue;
  if(row.expense.revision>=2147483646)fail('EXPENSE_LEDGER_LIMIT',409);
  statements.push(db.prepare(`INSERT INTO business_month_expenses(month,revision,external_expenses_cents,recharge_treatment,updated_at) SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(month) DO UPDATE SET revision=excluded.revision,external_expenses_cents=excluded.external_expenses_cents,recharge_treatment=excluded.recharge_treatment,updated_at=excluded.updated_at`).bind(row.month,row.expense.revision+1,total,treatment,time,...guardArgs));
  statements.push(db.prepare(`INSERT INTO business_month_expenses_audit(month,revision,external_expenses_cents,recharge_treatment,actor,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`).bind(row.month,row.expense.revision+1,total,treatment,actor,time,...guardArgs));
 }
 // The audit retains all submitted fields and series identity, including
 // cancellations; expense descriptions are never sent to external services.
 const audit={...value,affected_months:months,created_ids:value.action==='save'&&value.entry.id===null?[...updates.values()].flatMap(row=>row.items.filter(item=>item.created_at===time&&item.series_id===updates.get(value.month).items.at(-1)?.series_id).map(item=>item.id)):[]};
 statements.push(db.prepare(`INSERT INTO business_expense_ledger_audit(revision,request_id,request_hash,action,month,payload,actor,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`).bind(serial,value.request_id,digest,value.action,value.month,JSON.stringify(audit),actor,time,...guardArgs));
 const results=await db.batch(statements);
 if(results[0].meta.changes!==1){
  const replay=await db.prepare('SELECT request_hash,month FROM business_expense_ledger_audit WHERE request_id=?').bind(value.request_id).first();
  if(replay?.request_hash===digest&&replay.month===value.month)return readExpenseLedger(env,{month:value.month},{now});
  fail('EXPENSE_LEDGER_CONFLICT',409);
 }
 if(results.some(result=>result.meta.changes!==1))fail('EXPENSE_LEDGER_STORAGE_INVALID',503);
 return readExpenseLedger(env,{month:value.month},{now});
}
