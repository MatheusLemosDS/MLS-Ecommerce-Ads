import {productionWeeklyPeriod} from './production-weekly-close.mjs';
import {financialDigest} from './financial-event-ledger.mjs';
import {readOperationalEntity,listOperationalEntities,readOperationalHistory,mutateOperationalEntity} from './operational-journal.mjs';

// A declaration and application of a payment already made. This book never
// moves money, posts another expense, changes manufacture or reconciles a bank.
const kind='PRODUCTION_WEEKLY_PAYMENTS',basis='OWNER_DECLARED_WEEKLY_OBLIGATIONS_AND_ALREADY_MADE_PAYMENTS';
const own=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
const exact=(v,keys)=>own(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&v.normalize('NFC')===v&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
const date=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const iso=v=>typeof v==='string'&&/^20\d{2}-/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const array=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
const referenceKey=v=>v.normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
const validScope=v=>exact(v,['organization_id','store_id'])&&text(v.organization_id,160)&&text(v.store_id,160);
const sameScope=(a,b)=>validScope(a)&&validScope(b)&&a.organization_id===b.organization_id&&a.store_id===b.store_id;
const localDate=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp));
export class ProductionWeeklyPaymentsError extends Error{constructor(code,status=400){super('PRODUCTION_WEEKLY_PAYMENTS_'+code);this.code=this.message;this.status=status;}}
const fail=(code,status=400)=>{throw new ProductionWeeklyPaymentsError(code,status);};
function sum(values){const n=values.reduce((a,v)=>a+BigInt(v),0n);if(n>BigInt(Number.MAX_SAFE_INTEGER)||n<0n)fail('AMOUNT_OVERFLOW');return Number(n);}
function stamp(options={}){if(!own(options)||!exact(options,Object.hasOwn(options,'now')?['now']:[])||options.now!==undefined&&typeof options.now!=='function')fail('CONFIGURATION',503);let value;try{value=(options.now??Date.now)();}catch{fail('CLOCK_INVALID',503);}if(!integer(value,1))fail('CLOCK_INVALID',503);let result;try{result=new Date(value).toISOString();}catch{fail('CLOCK_INVALID',503);}if(!iso(result))fail('CLOCK_INVALID',503);return result;}
function period(week){let p;try{p=productionWeeklyPeriod(week);}catch{fail('WEEK_INVALID');}return p;}
const clone=v=>JSON.parse(JSON.stringify(v));
function validateState(value){
 if(!exact(value,['schema','provider_id','name','obligations','payments'])||value.schema!=='production_weekly_payments_state_v1'||!uuid(value.provider_id)||!text(value.name,120)||!array(value.obligations,1000)||!array(value.payments,1000))fail('STORAGE_INVALID',503);
 const obligations=new Map(),references=new Set(),applied=new Map(),payments=new Set(),paymentReferences=new Set();
 for(const r of value.obligations){
  if(!exact(r,['obligation_id','week_end','amount_cents','settled_cents','status','reference','reason','created_at'])||!uuid(r.obligation_id)||obligations.has(r.obligation_id)||!date(r.week_end)||!integer(r.amount_cents,1)||!integer(r.settled_cents,0,r.amount_cents)||!['ACTIVE','CANCELLED'].includes(r.status)||!text(r.reference,120)||r.reason!==null&&!text(r.reason,240)||!iso(r.created_at))fail('STORAGE_INVALID',503);
  try{period(r.week_end);}catch{fail('STORAGE_INVALID',503);}
  if(r.status==='CANCELLED'&&(r.settled_cents!==0||r.reason===null)||r.status==='ACTIVE'&&r.reason!==null)fail('STORAGE_INVALID',503);
  const key=r.week_end+'|'+referenceKey(r.reference);if(r.status==='ACTIVE'){if(references.has(key))fail('STORAGE_INVALID',503);references.add(key);}obligations.set(r.obligation_id,r);applied.set(r.obligation_id,0n);
 }
 for(const r of value.payments){
  if(!exact(r,['payment_id','amount_cents','paid_on','reference','allocations','status','reason','created_at','reversed_at'])||!uuid(r.payment_id)||payments.has(r.payment_id)||!integer(r.amount_cents,1)||!date(r.paid_on)||!text(r.reference,120)||!array(r.allocations,1000)||r.allocations.length===0||!['ACTIVE','REVERSED'].includes(r.status)||r.reason!==null&&!text(r.reason,240)||!iso(r.created_at)||r.reversed_at!==null&&!iso(r.reversed_at))fail('STORAGE_INVALID',503);
  if(r.status==='ACTIVE'&&(r.reason!==null||r.reversed_at!==null)||r.status==='REVERSED'&&(r.reason===null||r.reversed_at===null))fail('STORAGE_INVALID',503);
  const ref=referenceKey(r.reference);if(r.status==='ACTIVE'){if(paymentReferences.has(ref))fail('STORAGE_INVALID',503);paymentReferences.add(ref);}payments.add(r.payment_id);const seen=new Set();
  for(const a of r.allocations){if(!exact(a,['obligation_id','amount_cents'])||!obligations.has(a.obligation_id)||seen.has(a.obligation_id)||!integer(a.amount_cents,1)||obligations.get(a.obligation_id).week_end>r.paid_on)fail('STORAGE_INVALID',503);seen.add(a.obligation_id);if(r.status==='ACTIVE')applied.set(a.obligation_id,applied.get(a.obligation_id)+BigInt(a.amount_cents));}
  if(sum(r.allocations.map(a=>a.amount_cents))!==r.amount_cents)fail('STORAGE_INVALID',503);
 }
 for(const r of value.obligations)if(applied.get(r.obligation_id)!==BigInt(r.settled_cents))fail('STORAGE_INVALID',503);
 sum(value.obligations.filter(r=>r.status==='ACTIVE').map(r=>r.amount_cents));
 return value;
}
function selected(value,revision){
 if(value===null)return null;validateState(value);
 const obligations=value.obligations.map(r=>{const p=period(r.week_end);return {obligation_id:r.obligation_id,week_end:r.week_end,period_start_at:p.start_at,period_end_at:p.end_at,amount_cents:r.amount_cents,settled_cents:r.settled_cents,remaining_cents:r.status==='CANCELLED'?0:r.amount_cents-r.settled_cents,status:r.status==='CANCELLED'?'CANCELLED':r.settled_cents===r.amount_cents?'SETTLED':'OPEN',reference:r.reference};}).sort((a,b)=>a.week_end.localeCompare(b.week_end)||a.obligation_id.localeCompare(b.obligation_id));
 const payments=value.payments.map(r=>({payment_id:r.payment_id,amount_cents:r.amount_cents,paid_on:r.paid_on,reference:r.reference,allocations:clone(r.allocations),status:r.status,reason:r.reason}));
 return {provider_id:value.provider_id,revision,name:value.name,obligations,payments,declared_amount_cents:sum(obligations.filter(r=>r.status!=='CANCELLED').map(r=>r.amount_cents)),outstanding_cents:sum(obligations.map(r=>r.remaining_cents))};
}
// Reuse the same validated ledger projection in operational weekly reads.
// This exposes no new command, money movement, or accounting calculation.
export function projectProductionWeeklyPaymentLedger(value,revision){
 if(!integer(revision,1))fail('REVISION_INVALID');
 return selected(value,revision);
}
function validateQuery(query){
 if(!exact(query,['provider_id','cursor','history_cursor'])||query.provider_id!==null&&!uuid(query.provider_id)||[query.cursor,query.history_cursor].some(c=>c!==null&&(typeof c!=='string'||c.length<1||c.length>2048))||query.provider_id===null&&query.history_cursor!==null)fail('REQUEST_INVALID');return query;
}
const readOptions=(options,expectedScope=null)=>({readCapability:'finance.read',...(options.now?{now:options.now}:{}),...(expectedScope?{assertAuthorized:({scope})=>{if(!sameScope(scope,expectedScope))fail('SCOPE_CHANGED',409);return true;}}:{})});
function workspace(checked_at,list,record,history,mutation){
 if(!validScope(list.scope)||record&&!sameScope(list.scope,record.scope)||history.scope&&!sameScope(list.scope,history.scope))fail('STORAGE_INVALID',503);
 const providers=list.rows.map(row=>{const s=selected(row.payload,row.revision);if(!s||s.provider_id!==row.entity_id)fail('STORAGE_INVALID',503);return {provider_id:s.provider_id,name:s.name,revision:s.revision,declared_amount_cents:s.declared_amount_cents,outstanding_cents:s.outstanding_cents};});
 const current=record?selected(record.payload,record.revision):null;if(current&&current.provider_id!==record.entity_id)fail('STORAGE_INVALID',503);
 if(current){const at=providers.findIndex(row=>row.provider_id===current.provider_id);if(at!==-1)providers[at]={provider_id:current.provider_id,name:current.name,revision:current.revision,declared_amount_cents:current.declared_amount_cents,outstanding_cents:current.outstanding_cents};}
 if(record?.created_at&&Date.parse(record.created_at)>Date.parse(checked_at)||history.rows.some(row=>Date.parse(row.created_at)>Date.parse(checked_at)))fail('CLOCK_INVALID',503);
 return {schema:'production_weekly_payments_workspace_v1',scope:{...list.scope},checked_at,providers,next_cursor:list.next_cursor,selected:current,history:{rows:history.rows,next_cursor:history.next_cursor},money_transfer_allowed:false,bank_reconciliation_confirmed:false,basis,...(mutation?{mutation}:{})};
}
export async function readProductionWeeklyPaymentsWorkspace(env,query,options={}){
 validateQuery(query);stamp(options);const opts=readOptions(options);
 const list=await listOperationalEntities(env,{kind,cursor:query.cursor,limit:25},opts);let record=null,history={rows:[],next_cursor:null};
 if(query.provider_id!==null){history=await readOperationalHistory(env,{kind,entity_id:query.provider_id,cursor:query.history_cursor,limit:25},opts);record=await readOperationalEntity(env,{kind,entity_id:query.provider_id},opts);if(record.payload===null)fail('PROVIDER_NOT_FOUND',404);}
 return workspace(stamp(options),list,record,history);
}
function validateCommand(body,checked_at){
 const base=['action','provider_id','expected_revision','request_id','expected_scope'];
 const extra={save_provider:['name'],add_obligation:['obligation_id','week_end','amount_cents','reference'],cancel_obligation:['obligation_id','reason'],preview_payment:['payment_id','amount_cents','paid_on','reference'],apply_payment:['payment_id','amount_cents','paid_on','reference','preview_hash'],reverse_payment:['payment_id','reason']};
 if(!own(body)||typeof body.action!=='string'||!Object.hasOwn(extra,body.action)||!exact(body,[...base,...extra[body.action]])||!uuid(body.provider_id)||!uuid(body.request_id)||!integer(body.expected_revision,0,2147483644)||!validScope(body.expected_scope))fail('REQUEST_INVALID');
 if(body.action==='save_provider'){if(!text(body.name,120))fail('PROVIDER_INVALID');}
 if(['add_obligation','cancel_obligation'].includes(body.action)&&!uuid(body.obligation_id)||['preview_payment','apply_payment','reverse_payment'].includes(body.action)&&!uuid(body.payment_id))fail('REQUEST_INVALID');
 if(['add_obligation','preview_payment','apply_payment'].includes(body.action)&&(!integer(body.amount_cents,1)||!text(body.reference,120)))fail('AMOUNT_OR_REFERENCE_INVALID');
 if(body.action==='add_obligation'){const p=period(body.week_end);if(p.end_at*1000>Date.parse(checked_at))fail('WEEK_NOT_CLOSED');}
 if(['preview_payment','apply_payment'].includes(body.action)&&(!date(body.paid_on)||body.paid_on>localDate(checked_at)))fail('PAYMENT_DATE_INVALID');
 if(['cancel_obligation','reverse_payment'].includes(body.action)&&!text(body.reason,240))fail('REASON_REQUIRED');
 if(body.action==='apply_payment'&&!hash(body.preview_hash))fail('PREVIEW_INVALID');
 return clone(body);
}
async function preview(value,command,revision,scope){
 if(!validScope(scope))fail('STORAGE_INVALID',503);
 if(value===null)fail('PROVIDER_NOT_FOUND',404);validateState(value);if(value.provider_id!==command.provider_id)fail('PROVIDER_MISMATCH',409);
 if(value.payments.some(r=>r.payment_id===command.payment_id||r.status==='ACTIVE'&&referenceKey(r.reference)===referenceKey(command.reference)))fail('PAYMENT_ALREADY_RECORDED',409);
 const obligations=value.obligations.filter(r=>r.status==='ACTIVE'&&r.settled_cents<r.amount_cents).sort((a,b)=>a.week_end.localeCompare(b.week_end)||a.obligation_id.localeCompare(b.obligation_id)),eligible=obligations.filter(r=>r.week_end<=command.paid_on);
 const before=sum(obligations.map(r=>r.amount_cents-r.settled_cents)),eligibleAmount=sum(eligible.map(r=>r.amount_cents-r.settled_cents));
 if(command.amount_cents>eligibleAmount)fail('PAYMENT_EXCEEDS_OBLIGATIONS',409);
 let left=BigInt(command.amount_cents);const allocations=[];
 for(const row of eligible){if(left===0n)break;const available=BigInt(row.amount_cents-row.settled_cents),amount=left<available?left:available;allocations.push({obligation_id:row.obligation_id,week_end:row.week_end,amount_cents:Number(amount),remaining_cents:Number(available-amount)});left-=amount;}
 if(left!==0n||allocations.length===0)fail('PAYMENT_EXCEEDS_OBLIGATIONS',409);
 const proof={scope,provider_id:value.provider_id,source_revision:revision,state_hash:await financialDigest(value),payment_id:command.payment_id,amount_cents:command.amount_cents,paid_on:command.paid_on,reference:command.reference,allocations};
 return {schema:'production_weekly_payment_preview_v1',scope:{...scope},provider_id:value.provider_id,source_revision:revision,preview_hash:await financialDigest(proof),amount_cents:command.amount_cents,paid_on:command.paid_on,reference:command.reference,allocations,outstanding_before_cents:before,outstanding_after_cents:before-command.amount_cents,money_transfer_allowed:false};
}
export async function applyProductionWeeklyPaymentCommand(current,command,{now,actor,scope}){
 if(!iso(now)||typeof actor!=='string'||actor.length<1)fail('REQUEST_INVALID');validateCommand(command,now);
 if(!sameScope(scope,command.expected_scope))fail('SCOPE_CHANGED',409);
 if(current===null&&command.action!=='save_provider')fail('PROVIDER_NOT_FOUND',404);
 const value=current===null?{schema:'production_weekly_payments_state_v1',provider_id:command.provider_id,name:command.name,obligations:[],payments:[]}:clone(validateState(current));
 if(value.provider_id!==command.provider_id)fail('PROVIDER_MISMATCH',409);
 if(command.action==='save_provider')value.name=command.name;
 else if(command.action==='add_obligation'){
  if(value.obligations.length>=1000)fail('CAPACITY_REACHED',409);
  if(value.obligations.some(r=>r.obligation_id===command.obligation_id||r.status==='ACTIVE'&&r.week_end===command.week_end&&referenceKey(r.reference)===referenceKey(command.reference)))fail('OBLIGATION_ALREADY_RECORDED',409);
  value.obligations.push({obligation_id:command.obligation_id,week_end:command.week_end,amount_cents:command.amount_cents,settled_cents:0,status:'ACTIVE',reference:command.reference,reason:null,created_at:now});
 }else if(command.action==='cancel_obligation'){
  const row=value.obligations.find(r=>r.obligation_id===command.obligation_id);if(!row)fail('OBLIGATION_NOT_FOUND',404);if(row.status!=='ACTIVE'||row.settled_cents!==0)fail('OBLIGATION_NOT_CANCELLABLE',409);row.status='CANCELLED';row.reason=command.reason;
 }else if(command.action==='apply_payment'){
  if(value.payments.length>=1000)fail('CAPACITY_REACHED',409);
  const proposal=await preview(value,command,command.expected_revision,scope);if(proposal.preview_hash!==command.preview_hash)fail('PREVIEW_CHANGED',409);
  for(const a of proposal.allocations)value.obligations.find(r=>r.obligation_id===a.obligation_id).settled_cents=sum([value.obligations.find(r=>r.obligation_id===a.obligation_id).settled_cents,a.amount_cents]);
  value.payments.push({payment_id:command.payment_id,amount_cents:command.amount_cents,paid_on:command.paid_on,reference:command.reference,allocations:proposal.allocations.map(({obligation_id,amount_cents})=>({obligation_id,amount_cents})),status:'ACTIVE',reason:null,created_at:now,reversed_at:null});
 }else if(command.action==='reverse_payment'){
  const row=value.payments.find(r=>r.payment_id===command.payment_id);if(!row)fail('PAYMENT_NOT_FOUND',404);if(row.status!=='ACTIVE')fail('PAYMENT_ALREADY_REVERSED',409);
  for(const a of row.allocations){const obligation=value.obligations.find(r=>r.obligation_id===a.obligation_id);if(!obligation||obligation.settled_cents<a.amount_cents)fail('STORAGE_INVALID',503);obligation.settled_cents-=a.amount_cents;}
  row.status='REVERSED';row.reason=command.reason;row.reversed_at=now;
 }else fail('REQUEST_INVALID');
 if(new TextEncoder().encode(JSON.stringify(value)).byteLength>190000)fail('CAPACITY_REACHED',409);
 return validateState(value);
}
export async function mutateProductionWeeklyPaymentsWorkspace(env,body,actor,options={}){
 const checked_at=stamp(options),command=validateCommand(body,checked_at),opts=readOptions(options,command.expected_scope);
 if(command.action==='preview_payment'){
  const record=await readOperationalEntity(env,{kind,entity_id:command.provider_id},opts);if(record.revision!==command.expected_revision)fail('REVISION_CHANGED',409);return preview(record.payload,command,record.revision,record.scope);
 }
 const saved=await mutateOperationalEntity(env,{kind,entity_id:command.provider_id,expected_revision:command.expected_revision,request_id:command.request_id,command},{...opts,writeCapability:'finance.write',actor:env.COMMERCIAL_CONTEXT?.userId??actor,transition:applyProductionWeeklyPaymentCommand});
 // An immutable replay proves the original outcome, while the workspace must
 // show current balances. Later legitimate declarations must not make a retry
 // combine an old selected revision with a newer, contradictory history page.
 const history=await readOperationalHistory(env,{kind,entity_id:command.provider_id,cursor:null,limit:25},opts),record=await readOperationalEntity(env,{kind,entity_id:command.provider_id},opts);
 if(record.revision<saved.revision)fail('SOURCE_CHANGED',409);
 const list=await listOperationalEntities(env,{kind,cursor:null,limit:25},opts);
 return workspace(stamp(options),list,record,history,{revision:saved.revision,replayed:saved.replayed});
}
