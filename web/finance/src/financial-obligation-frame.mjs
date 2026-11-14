// A closed transport for server-observed App expenses. No bank description,
// expense description, browser-provided classification or payment authority.
export const FINANCIAL_OBLIGATION_PATH='/internal/finance/financial-obligations-v1';
export const FINANCIAL_OBLIGATION_REQUEST_MAXIMUM=131072;
export const FINANCIAL_OBLIGATION_RESPONSE_MAXIMUM=131072;
export const FINANCIAL_OBLIGATION_FRESHNESS_SECONDS=300;
export const FINANCIAL_OBLIGATION_RESPONSE_SCHEMAS=Object.freeze(['financial_obligation_workspace_v1','financial_obligation_registration_v1']);
const encoder=new TextEncoder();
const own=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const exact=(value,required,optional=[])=>own(value)&&required.every(key=>Object.hasOwn(value,key))&&Reflect.ownKeys(value).every(key=>required.includes(key)||optional.includes(key));
const token=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const month=value=>typeof value==='string'&&/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(value);
const day=value=>typeof value==='string'&&/^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const iso=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const list=(value,maximum)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=maximum&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'));
const scope=value=>exact(value,['organization_id','store_id','currency'])&&token(value.organization_id)&&token(value.store_id)&&value.currency==='BRL';
const sameScope=(left,right)=>left.organization_id===right.organization_id&&left.store_id===right.store_id&&left.currency===right.currency;
const revision=value=>integer(value,0,2147483645);
const cursor=value=>value===null||typeof value==='string'&&/^(?:0|[1-9]\d{0,15}):[a-f0-9-]{36}$/.test(value)&&integer(Number(value.slice(0,value.indexOf(':'))))&&uuid(value.slice(value.indexOf(':')+1));
const fresh=(captured,until)=>iso(captured)&&iso(until)&&Date.parse(until)-Date.parse(captured)===FINANCIAL_OBLIGATION_FRESHNESS_SECONDS*1000;
const localDay=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value));
const snapshotItemKeys=['expense_id','amount_cents','status','competence_month','due_date','paid_date','updated_at'];
function validExpense(value,expectedMonth,captured){
  return exact(value,snapshotItemKeys)&&uuid(value.expense_id)&&integer(value.amount_cents,1)&&['OPEN','PAID','CANCELLED'].includes(value.status)&&value.competence_month===expectedMonth&&day(value.due_date)&&(value.paid_date===null||day(value.paid_date)&&value.paid_date<=localDay(captured))&&(value.status!=='OPEN'||value.paid_date===null)&&(value.status!=='PAID'||value.paid_date!==null)&&iso(value.updated_at)&&value.updated_at<=captured;
}
export function projectFinancialObligationSnapshot(value){
  try{
    if(!exact(value,['schema','scope','month','ledger_revision','mode','captured_at','source_hash','items'])||value.schema!=='app_expense_observation_v1'||!scope(value.scope)||!month(value.month)||!revision(value.ledger_revision)||!['MANUAL','DRAFT','CONFIRMED'].includes(value.mode)||!iso(value.captured_at)||!hash(value.source_hash)||!list(value.items,200))return null;
    if(value.mode==='MANUAL'&&value.items.length!==0||value.ledger_revision===0&&(value.mode!=='MANUAL'||value.items.length!==0)||value.mode!=='MANUAL'&&value.ledger_revision===0)return null;
    const seen=new Set(),items=[];
    for(const item of value.items){if(!validExpense(item,value.month,value.captured_at)||seen.has(item.expense_id))return null;seen.add(item.expense_id);items.push(Object.fromEntries(snapshotItemKeys.map(key=>[key,item[key]])));}
    return {...value,scope:{...value.scope},items};
  }catch{return null;}
}
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value!==null&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
export async function financialObligationSnapshotHash(value){
  const snapshot=projectFinancialObligationSnapshot(value);
  if(!snapshot)throw new TypeError('FINANCIAL_OBLIGATION_SNAPSHOT_INVALID');
  const {captured_at,source_hash,...material}=snapshot;
  material.items.sort((left,right)=>left.expense_id.localeCompare(right.expense_id));
  const digest=await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(canonical(material))));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function projectFinancialObligationRequest(value){
  try{
    if(!own(value)||value.schema!=='financial_obligation_source_request_v1')return null;
    if(value.operation==='read'){
      if(!exact(value,['schema','operation','month'],['limit','cursor'])||!month(value.month)||value.limit!==undefined&&!integer(value.limit,1,100)||value.cursor!==undefined&&!cursor(value.cursor))return null;
      return {schema:value.schema,operation:'read',month:value.month,limit:value.limit??100,cursor:value.cursor??null};
    }
    if(value.operation!=='register'||!exact(value,['schema','operation','request_id','expected_revision','snapshot'])||!token(value.request_id)||!integer(value.expected_revision,0,Number.MAX_SAFE_INTEGER-1))return null;
    const snapshot=projectFinancialObligationSnapshot(value.snapshot);if(!snapshot)return null;
    const result={schema:value.schema,operation:'register',request_id:value.request_id,expected_revision:value.expected_revision,snapshot};
    return encoder.encode(JSON.stringify(result)).byteLength<=FINANCIAL_OBLIGATION_REQUEST_MAXIMUM?result:null;
  }catch{return null;}
}
function publicItem(value,frame){
  const keys=['record_id','expense_id','revision','amount_cents','status','competence_month','due_date','paid_date','source_updated_at','evidence_id','source_hash','snapshot_id','quality','account_id'];
  if(!exact(value,keys)||!uuid(value.expense_id)||value.record_id!=='obligation:'+value.expense_id||value.revision!==frame.source_revision||!integer(value.revision,1,2147483645)||!integer(value.amount_cents,1)||!['OPEN','PAID','CANCELLED'].includes(value.status)||value.competence_month!==frame.month||!day(value.due_date)||value.paid_date!==null&&(!day(value.paid_date)||value.paid_date>localDay(frame.captured_at))||value.status==='OPEN'&&value.paid_date!==null||value.status==='PAID'&&value.paid_date===null||!iso(value.source_updated_at)||value.source_updated_at>frame.captured_at||value.source_hash!==frame.source_hash||value.snapshot_id!==frame.snapshot_id||value.evidence_id!=='expense-evidence:'+frame.snapshot_id||value.quality!=='REVIEW'||value.account_id!=='app-expense-ledger')return null;
  return {...value};
}
export function projectFinancialObligationResponse(value){
  try{
    if(!own(value)||!FINANCIAL_OBLIGATION_RESPONSE_SCHEMAS.includes(value.schema)||!scope(value.scope)||!integer(value.revision))return null;
    if(value.schema==='financial_obligation_workspace_v1'){
      const keys=['schema','scope','revision','month','source_revision','source_hash','snapshot_id','captured_at','fresh_until','state','items','next_cursor'];
      if(!exact(value,keys)||!month(value.month)||!['NOT_CAPTURED','STALE','AVAILABLE'].includes(value.state)||!list(value.items,100)||!cursor(value.next_cursor)||value.next_cursor!==null&&Number(value.next_cursor.slice(0,value.next_cursor.indexOf(':')))!==value.revision)return null;
      if(value.state==='NOT_CAPTURED')return value.source_revision===null&&value.source_hash===null&&value.snapshot_id===null&&value.captured_at===null&&value.fresh_until===null&&value.items.length===0&&value.next_cursor===null?{...value,scope:{...value.scope},items:[]}:null;
      if(!revision(value.source_revision)||!hash(value.source_hash)||!hash(value.snapshot_id)||!fresh(value.captured_at,value.fresh_until))return null;
      const seen=new Set(),items=[];
      for(const row of value.items){const item=publicItem(row,value);if(!item||seen.has(item.record_id))return null;seen.add(item.record_id);items.push(item);}
      if(value.source_revision===0&&(items.length!==0||value.next_cursor!==null))return null;
      return {...value,scope:{...value.scope},items};
    }
    if(!exact(value,['schema','scope','request_id','revision','snapshot_id','source_hash','source_revision','captured_at','fresh_until','replayed','quality'])||!token(value.request_id)||value.revision<1||!hash(value.snapshot_id)||!hash(value.source_hash)||!revision(value.source_revision)||!fresh(value.captured_at,value.fresh_until)||typeof value.replayed!=='boolean'||value.quality!=='REVIEW')return null;
    return {...value,scope:{...value.scope}};
  }catch{return null;}
}
export function financialObligationResponseMatches(input,response){
  const command=projectFinancialObligationRequest(input),frame=projectFinancialObligationResponse(response);if(!command||!frame)return false;
  if(command.operation==='read')return frame.schema==='financial_obligation_workspace_v1'&&frame.month===command.month;
  return frame.schema==='financial_obligation_registration_v1'&&frame.request_id===command.request_id&&frame.revision===command.expected_revision+1&&sameScope(frame.scope,command.snapshot.scope)&&frame.source_hash===command.snapshot.source_hash&&frame.source_revision===command.snapshot.ledger_revision&&frame.captured_at===command.snapshot.captured_at;
}
