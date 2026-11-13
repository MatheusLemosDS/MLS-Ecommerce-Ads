// A settlement changes positions of money. It never recognizes another sale.
export class FinancialCashAllocationError extends Error {
  constructor(code,status=400){super('FINANCIAL_CASH_'+code);this.code='FINANCIAL_CASH_'+code;this.status=status;}
}
const fail=(code,status)=>{throw new FinancialCashAllocationError(code,status);};
const own=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>Object.hasOwn(d,'value'));
const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
const money=value=>Number.isSafeInteger(value);
const positive=value=>money(value)&&value>0;
const absolute=value=>Number(BigInt(value)<0n?-BigInt(value):BigInt(value));
const safe=value=>{if(value>BigInt(Number.MAX_SAFE_INTEGER)||value<BigInt(Number.MIN_SAFE_INTEGER))fail('AMOUNT_OVERFLOW');return Number(value);};
const equalScope=(a,b)=>a.organization_id===b.organization_id&&a.store_id===b.store_id&&a.currency===b.currency;
function day(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const t=Date.parse(value+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===value;}
export function financialAllocationScope(value){
  if(!own(value)||!id(value.organization_id)||!id(value.store_id)||value.currency!=='BRL')fail('SCOPE_INVALID');
  return Object.freeze({organization_id:value.organization_id,store_id:value.store_id,currency:'BRL'});
}
const relations=Object.freeze({
  RECEIVABLE_RELEASE:{left:['RECEIVABLE'],right:['WALLET_MOVEMENT'],leftStatus:['RELEASED','SETTLED'],rightStatus:['POSTED'],rightSign:1},
  RECEIVABLE_DEPOSIT:{left:['RECEIVABLE'],right:['BANK_TRANSACTION'],leftStatus:['RELEASED','SETTLED'],rightStatus:['POSTED'],rightSign:1},
  TRANSFER_DEPOSIT:{left:['TRANSFER'],right:['BANK_TRANSACTION'],leftStatus:['COMPLETED'],rightStatus:['POSTED'],rightSign:1},
  OBLIGATION_PAYMENT:{left:['OBLIGATION'],right:['BANK_TRANSACTION'],leftStatus:['OPEN','PAID'],rightStatus:['POSTED'],rightSign:-1},
});
function record(value,scope){
  if(!own(value)||!id(value.record_id)||!id(value.account_id)||!money(value.amount_cents)||!Number.isSafeInteger(value.revision)||value.revision<1||!day(value.date)||!id(value.evidence_id)||typeof value.kind!=='string'||typeof value.status!=='string')fail('RECORD_INVALID');
  if(!equalScope(scope,value))fail('RECORD_SCOPE_MISMATCH',403);
  if(value.native_reference!==null&&value.native_reference!==undefined&&!id(value.native_reference))fail('RECORD_INVALID');
  if(value.legacy_record_id!==null&&value.legacy_record_id!==undefined&&!id(value.legacy_record_id))fail('RECORD_INVALID');
  return {...value,native_reference:value.native_reference??null,identity_unique:value.identity_unique===true,legacy_record_id:value.legacy_record_id??null};
}
function selected(items,side,records,relation){
  if(!Array.isArray(items)||items.length<1||items.length>100)fail('ITEMS_INVALID');
  const seen=new Set();
  return items.map(item=>{
    if(!own(item)||!id(item.record_id)||!positive(item.amount_cents)||seen.has(item.record_id))fail('ITEMS_INVALID');
    seen.add(item.record_id);const r=records.get(item.record_id);if(!r)fail('RECORD_NOT_FOUND',404);
    if(!relation[side].includes(r.kind)||!relation[side+'Status'].includes(r.status)||(side==='right'?Math.sign(r.amount_cents)!==relation.rightSign:r.amount_cents<=0))fail('RECORD_STATUS_INCOMPATIBLE',409);
    return {record_id:r.record_id,record_revision:r.revision,account_id:r.account_id,amount_cents:item.amount_cents,evidence_id:r.evidence_id};
  });
}
/** Server-resolved records and reservations are mandatory; browser rows are not evidence. */
export function projectFinancialAllocation(input,{records,used_cents=new Map()}={}){
  if(!own(input)||!Array.isArray(records)||records.length>1000)fail('REQUEST_INVALID');
  if(!(used_cents instanceof Map)&&!own(used_cents))fail('RESERVATION_INVALID');
  const scope=financialAllocationScope(input.scope),relation=relations[input.relation];if(!relation)fail('RELATION_INVALID');
  const trusted=new Map();for(const value of records){const r=record(value,scope);if(trusted.has(r.record_id))fail('RECORD_ID_AMBIGUOUS',409);trusted.set(r.record_id,r);}
  const left=selected(input.left,'left',trusted,relation),right=selected(input.right,'right',trusted,relation);
  if(input.adjustments!==undefined&&!Array.isArray(input.adjustments)||input.adjustments?.length>20)fail('ADJUSTMENTS_INVALID');
  const adjustments=(input.adjustments??[]).map(item=>{
    if(!own(item)||!id(item.record_id)||!['LEFT','RIGHT'].includes(item.side)||!positive(item.amount_cents))fail('ADJUSTMENTS_INVALID');
    const r=trusted.get(item.record_id);if(!r||r.kind!=='FEE'||r.status!=='CONFIRMED'||r.amount_cents<=0)fail('ADJUSTMENT_EVIDENCE_REQUIRED',409);
    return {record_id:r.record_id,record_revision:r.revision,account_id:r.account_id,side:item.side,kind:'FEE',amount_cents:item.amount_cents,evidence_id:r.evidence_id};
  });
  const seen=new Set(),usage=new Map();
  for(const item of [...left,...right,...adjustments]){
    if(seen.has(item.record_id))fail('RECORD_REUSED_IN_GROUP',409);seen.add(item.record_id);
    const used=used_cents instanceof Map?used_cents.get(item.record_id)??0:own(used_cents)&&Object.hasOwn(used_cents,item.record_id)?used_cents[item.record_id]:0;
    if(!money(used)||used<0)fail('RESERVATION_INVALID');
    const r=trusted.get(item.record_id),capacity=absolute(r.amount_cents);
    if(BigInt(used)+BigInt(item.amount_cents)>BigInt(capacity))fail('ALLOCATION_EXCEEDS_AVAILABLE',409);
    usage.set(item.record_id,{record_id:item.record_id,record_revision:r.revision,legacy_record_id:r.legacy_record_id,capacity_cents:capacity,new_cents:item.amount_cents});
  }
  const sum=items=>safe(items.reduce((n,r)=>n+BigInt(r.amount_cents),0n));
  const leftTotal=safe(BigInt(sum(left))+BigInt(sum(adjustments.filter(r=>r.side==='LEFT'))));
  const rightTotal=safe(BigInt(sum(right))+BigInt(sum(adjustments.filter(r=>r.side==='RIGHT'))));
  if(leftTotal!==rightTotal)fail('GROUP_NOT_BALANCED',409);
  let state='SUGGESTED',confirmation='REVIEW_REQUIRED',ruleId=null;
  if(input.confirmation!==undefined){
    if(!own(input.confirmation)||input.confirmation.confirmed!==true||input.confirmation.reason_code!=='OPERATOR_VERIFIED')fail('CONFIRMATION_INVALID');
    state='CONFIRMED';confirmation='OPERATOR_VERIFIED';
  }else if(input.automatic_rule!==undefined){
    const rule=input.automatic_rule;
    if(!own(rule)||!id(rule.rule_id)||rule.enabled!==true||rule.approved!==true||!id(rule.evidence_id)||!Number.isSafeInteger(rule.revision)||rule.revision<1||!equalScope(scope,rule)||rule.relation!==input.relation)fail('AUTOMATIC_RULE_NOT_AUTHORIZED',403);
    const chosen=[...left,...right].map(item=>trusted.get(item.record_id));
    if(adjustments.length||chosen.some(r=>!r.native_reference||!r.identity_unique)||new Set(chosen.map(r=>r.native_reference)).size!==1)fail('AUTOMATIC_IDENTITY_NOT_PROVEN',409);
    state='CONFIRMED';confirmation='APPROVED_IDENTITY_RULE';ruleId=rule.rule_id;
  }
  return Object.freeze({schema:'financial_cash_allocation_v1',scope,relation:input.relation,state,confirmation,rule_id:ruleId,
    left:Object.freeze(left.map(Object.freeze)),right:Object.freeze(right.map(Object.freeze)),adjustments:Object.freeze(adjustments.map(Object.freeze)),
    left_total_cents:leftTotal,right_total_cents:rightTotal,usage:Object.freeze([...usage.values()].map(Object.freeze)),
    accounting_effect:'SETTLEMENT_ONLY_NO_NEW_REVENUE'});
}

/** Evidence identity is source/account scoped. Amount and date alone cannot deduplicate. */
export function compareFinancialCashIdentity(left,right){
  if(!own(left)||!own(right))fail('IDENTITY_INPUT_INVALID');
  const scope=financialAllocationScope(left);financialAllocationScope(right);
  if(!equalScope(scope,right)||left.account_id!==right.account_id)return {state:'DISTINCT',reason:'DIFFERENT_SCOPE_OR_ACCOUNT'};
  if(!id(left.account_id)||!id(left.source)||!id(right.source)||!money(left.amount_cents)||!money(right.amount_cents)||!day(left.date)||!day(right.date))fail('IDENTITY_INPUT_INVALID');
  if(left.source===right.source&&id(left.native_id)&&left.native_id===right.native_id){
    return left.amount_cents===right.amount_cents&&left.date===right.date?{state:'SAME',reason:'SAME_NATIVE_ID_AND_FACTS'}:{state:'REVIEW',reason:'NATIVE_ID_REVISION_CONFLICT'};
  }
  if(left.source===right.source&&id(left.native_id)&&id(right.native_id)&&left.native_id!==right.native_id)return {state:'DISTINCT',reason:'DISTINCT_NATIVE_IDS'};
  // A bridge must be explicit, native and unique on both sources; shared prose is insufficient.
  if(left.source!==right.source&&id(left.cross_source_native_id)&&left.cross_source_native_id===right.cross_source_native_id&&left.cross_source_identity_verified===true&&right.cross_source_identity_verified===true&&left.amount_cents===right.amount_cents&&left.date===right.date)return {state:'SAME',reason:'VERIFIED_CROSS_SOURCE_NATIVE_ID'};
  if(left.amount_cents===right.amount_cents&&left.date===right.date)return {state:'REVIEW',reason:'AMOUNT_DATE_NOT_IDENTITY'};
  return {state:'DISTINCT',reason:'NO_COMMON_IDENTITY'};
}
