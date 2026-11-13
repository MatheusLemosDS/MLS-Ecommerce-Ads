// Closed, minimized contract shared by App, Auth and the Finance sidecar.
export const FINANCIAL_ALLOCATION_PATH='/internal/finance/financial-allocation-v1';
export const FINANCIAL_ALLOCATION_REQUEST_MAXIMUM=32768;
export const FINANCIAL_ALLOCATION_RESPONSE_MAXIMUM=262144;
export const FINANCIAL_ALLOCATION_RESPONSE_SCHEMAS=Object.freeze(['financial_cash_allocation_workspace_v1','financial_cash_allocation_preview_v1','financial_cash_allocation_mutation_v1']);
const own=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
const exact=(v,required,optional=[])=>own(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const token=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v);
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const list=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
const relation=v=>['RECEIVABLE_RELEASE','RECEIVABLE_DEPOSIT','TRANSFER_DEPOSIT','OBLIGATION_PAYMENT'].includes(v);
const scope=v=>exact(v,['organization_id','store_id','currency'])&&token(v.organization_id)&&token(v.store_id)&&v.currency==='BRL';
const equalScope=(a,b)=>a.organization_id===b.organization_id&&a.store_id===b.store_id&&a.currency===b.currency;
const selected=v=>list(v,100)&&v.length>0&&v.every(x=>exact(x,['record_id','amount_cents'])&&token(x.record_id)&&integer(x.amount_cents,1));
const adjustment=v=>list(v,20)&&v.every(x=>exact(x,['record_id','side','amount_cents'])&&token(x.record_id)&&['LEFT','RIGHT'].includes(x.side)&&integer(x.amount_cents,1));
const confirmation=v=>exact(v,['confirmed','reason_code'])&&v.confirmed===true&&v.reason_code==='OPERATOR_VERIFIED';
const cursor=v=>v===null||typeof v==='string'&&/^\d{1,16}:[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v)&&Number.isSafeInteger(Number(v.slice(0,v.indexOf(':'))));
export function projectFinancialAllocationRequest(value){
 try{
  if(!own(value)||value.schema!=='financial_cash_allocation_request_v1'||!['read','preview','confirm','reverse'].includes(value.operation))return null;
  const base=['schema','operation'];
  if(value.operation==='read'){
   if(!exact(value,base,['limit','cursor'])||value.limit!==undefined&&!integer(value.limit,1)||value.limit>100||value.cursor!==undefined&&!cursor(value.cursor))return null;
   return {schema:value.schema,operation:'read',limit:value.limit??50,cursor:value.cursor??null};
  }
  if(value.operation==='reverse'){
   if(!exact(value,[...base,'request_id','expected_revision','group_id','reason_code'])||!token(value.request_id)||!integer(value.expected_revision)||value.expected_revision>=Number.MAX_SAFE_INTEGER||!token(value.group_id)||value.reason_code!=='OPERATOR_VERIFIED')return null;
   return {...value};
  }
  const mutation=value.operation==='confirm',required=[...base,'relation','left','right',...(mutation?['request_id','expected_revision']:[])],optional=['adjustments',...(mutation?['confirmation','rule_id']:[])];
  if(!exact(value,required,optional)||!relation(value.relation)||!selected(value.left)||!selected(value.right)||value.adjustments!==undefined&&!adjustment(value.adjustments))return null;
  if(mutation&&(!token(value.request_id)||!integer(value.expected_revision)||value.expected_revision>=Number.MAX_SAFE_INTEGER||value.confirmation!==undefined&&!confirmation(value.confirmation)||value.rule_id!==undefined&&!token(value.rule_id)||value.confirmation!==undefined&&value.rule_id!==undefined))return null;
  return {...value,left:value.left.map(x=>({...x})),right:value.right.map(x=>({...x})),adjustments:(value.adjustments??[]).map(x=>({...x}))};
 }catch{return null;}
}
function group(value,expectedScope){
 if(!exact(value,['schema','scope','relation','state','confirmation','rule_id','left','right','adjustments','left_total_cents','right_total_cents','usage','accounting_effect'],['group_id','revision','confirmed_at','actor_id','reversed_at','reversal_reason_code'])||value.schema!=='financial_cash_allocation_v1'||!scope(value.scope)||!equalScope(value.scope,expectedScope)||!relation(value.relation)||!['SUGGESTED','CONFIRMED','REVERSED'].includes(value.state)||!['REVIEW_REQUIRED','OPERATOR_VERIFIED','APPROVED_IDENTITY_RULE'].includes(value.confirmation)||value.accounting_effect!=='SETTLEMENT_ONLY_NO_NEW_REVENUE'||value.rule_id!==null&&!token(value.rule_id)||!integer(value.left_total_cents,1)||value.left_total_cents!==value.right_total_cents)return null;
 const item=x=>exact(x,['record_id','record_revision','account_id','amount_cents','evidence_id'])&&token(x.record_id)&&token(x.account_id)&&token(x.evidence_id)&&integer(x.record_revision,1)&&integer(x.amount_cents,1);
 if(!list(value.left,100)||value.left.length===0||!value.left.every(item)||!list(value.right,100)||value.right.length===0||!value.right.every(item)||!list(value.adjustments,20)||!value.adjustments.every(x=>exact(x,['record_id','record_revision','account_id','amount_cents','evidence_id','side','kind'])&&item(Object.fromEntries(['record_id','record_revision','account_id','amount_cents','evidence_id'].map(k=>[k,x[k]])))&&x.kind==='FEE'&&['LEFT','RIGHT'].includes(x.side)))return null;
 const all=[...value.left,...value.right,...value.adjustments];if(new Set(all.map(x=>x.record_id)).size!==all.length)return null;
 const total=side=>value[side].reduce((n,x)=>n+BigInt(x.amount_cents),0n)+value.adjustments.filter(x=>x.side===side.toUpperCase()).reduce((n,x)=>n+BigInt(x.amount_cents),0n);
 if(total('left')!==BigInt(value.left_total_cents)||total('right')!==BigInt(value.right_total_cents)||!list(value.usage,220)||value.usage.length!==all.length)return null;
 const usage=new Map();for(const x of value.usage){if(!exact(x,['record_id','record_revision','legacy_record_id','capacity_cents','new_cents'])||!token(x.record_id)||usage.has(x.record_id)||!integer(x.record_revision,1)||x.legacy_record_id!==null&&!token(x.legacy_record_id)||!integer(x.new_cents,1)||!integer(x.capacity_cents,x.new_cents))return null;usage.set(x.record_id,x);}
 if(all.some(x=>usage.get(x.record_id)?.new_cents!==x.amount_cents||usage.get(x.record_id)?.record_revision!==x.record_revision))return null;
 const persisted=['group_id','revision','confirmed_at','actor_id'].some(k=>Object.hasOwn(value,k));
 if(persisted&&(!['group_id','revision','confirmed_at','actor_id'].every(k=>Object.hasOwn(value,k))||!token(value.group_id)||!integer(value.revision,1)||!integer(value.confirmed_at,1,9999999999)||!token(value.actor_id)))return null;
 if(value.state==='SUGGESTED'&&(persisted||value.confirmation!=='REVIEW_REQUIRED')||value.state!=='SUGGESTED'&&value.confirmation==='REVIEW_REQUIRED'||value.confirmation==='APPROVED_IDENTITY_RULE'&&!token(value.rule_id)||value.confirmation!=='APPROVED_IDENTITY_RULE'&&value.rule_id!==null)return null;
 if(value.state==='REVERSED'&&(!persisted||!integer(value.reversed_at,value.confirmed_at,9999999999)||value.reversal_reason_code!=='OPERATOR_VERIFIED')||value.state!=='REVERSED'&&['reversed_at','reversal_reason_code'].some(k=>Object.hasOwn(value,k)))return null;
 return {...value,scope:{...value.scope},left:value.left.map(x=>({...x})),right:value.right.map(x=>({...x})),adjustments:value.adjustments.map(x=>({...x})),usage:value.usage.map(x=>({...x}))};
}
export function projectFinancialAllocationResponse(value){
 try{
  if(!own(value)||!FINANCIAL_ALLOCATION_RESPONSE_SCHEMAS.includes(value.schema)||!scope(value.scope)||!integer(value.revision))return null;
  if(value.schema==='financial_cash_allocation_workspace_v1'){
   if(!exact(value,['schema','scope','revision','groups','next_cursor'])||!list(value.groups,100)||!cursor(value.next_cursor)||value.next_cursor!==null&&Number(value.next_cursor.slice(0,value.next_cursor.indexOf(':')))!==value.revision)return null;
   const groups=value.groups.map(x=>group(x,value.scope));if(groups.some(x=>!x?.group_id)||new Set(groups.map(x=>x.group_id)).size!==groups.length||groups.some(x=>x.revision>value.revision))return null;return {...value,scope:{...value.scope},groups};
  }
  if(value.schema==='financial_cash_allocation_preview_v1'){
   if(!exact(value,['schema','scope','revision','group']))return null;const projected=group(value.group,value.scope);return projected?{...value,scope:{...value.scope},group:projected}:null;
  }
  if(!['confirm','reverse'].includes(value.operation)||!exact(value,['schema','operation','scope','request_id','group_id','revision','replayed'],value.operation==='confirm'?['group']:[])||!token(value.request_id)||!token(value.group_id)||!integer(value.revision,1)||typeof value.replayed!=='boolean')return null;
  if(value.operation==='reverse')return {...value,scope:{...value.scope}};
  const projected=group(value.group,value.scope);return projected?.state==='CONFIRMED'&&projected.group_id===value.group_id&&projected.revision===value.revision?{...value,scope:{...value.scope},group:projected}:null;
 }catch{return null;}
}
export function financialAllocationResponseMatches(input,response){
 const command=projectFinancialAllocationRequest(input),frame=projectFinancialAllocationResponse(response);if(!command||!frame)return false;
 if(command.operation==='read')return frame.schema==='financial_cash_allocation_workspace_v1';
 if(command.operation==='preview')return frame.schema==='financial_cash_allocation_preview_v1'&&frame.group.relation===command.relation;
 return frame.schema==='financial_cash_allocation_mutation_v1'&&frame.operation===command.operation&&frame.request_id===command.request_id&&frame.revision===command.expected_revision+1&&(command.operation!=='reverse'||frame.group_id===command.group_id);
}
