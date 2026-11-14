import {getFinanceExternalCash} from './app-external-cash.mjs';
import {getFinanceFinancialAutomation} from './app-financial-automation.mjs';
import {isCommercialContext} from './commercial-context.mjs';
import {projectExternalCashRequest,projectExternalCashResponse,externalCashResponseMatches} from '../../finance/src/external-cash-frame.mjs';
import {projectFinancialAllocationResponse} from '../../finance/src/financial-allocation-frame.mjs';
import {FinancialLedgerError,normalizeFinancialScope,createFinancialEvent,financialDigest,financialSafeSum,normalizeFinancialTimestamp} from './financial-event-ledger.mjs';
import {projectFinancialAccountingPeriod} from './financial-accounting-schedule.mjs';

const fail=(code,status=400)=>{throw new FinancialLedgerError('FINANCIAL_CASH_SOURCE_'+code,status);};
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,required,optional=[])=>plain(value)&&Reflect.ownKeys(value).every(key=>[...required,...optional].includes(key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'))&&required.every(key=>Object.hasOwn(value,key));
const integer=value=>Number.isSafeInteger(value)&&value>=0&&!Object.is(value,-0);
const sameBook=(left,right)=>left.organization_id===right.organization_id&&left.store_id===right.store_id&&left.currency===right.currency;
const opposite=value=>value===0?0:-value;
const stamp=seconds=>new Date(seconds*1000).toISOString();
const inPeriod=(at,period)=>at>=period.start_at&&at<period.end_at;
const sourceAccount=source=>source==='NUBANK'?'legacy-nubank-imports':'shopee-transfer-imports';
const postingAccount=source=>source==='NUBANK'?'unverified-nubank-imports':'unverified-shopee-transfer-imports';

function selectedInput(env,input){
  if(!exact(input,['scope','period','month','source'],['cursor','expected_revision','limit','now']))fail('REQUEST_INVALID');
  const scope=normalizeFinancialScope(input.scope),period=projectFinancialAccountingPeriod(input.period);
  if(!period||scope.currency!=='BRL'||!['NUBANK','SHOPEE'].includes(input.source)||input.expected_revision!==undefined&&input.expected_revision!==null&&!integer(input.expected_revision))fail('REQUEST_INVALID');
  if(period.kind==='MANUFACTURE_WEEK')fail('DATE_ONLY_PERIOD_UNSUPPORTED');
  const command=projectExternalCashRequest({schema:'external_cash_request_v1',operation:'read',month:input.month,source:input.source,cursor:input.cursor??null,limit:input.limit??100});
  if(!command||command.month<period.start_date.slice(0,7)||command.month>period.end_date.slice(0,7))fail('REQUEST_INVALID');
  const context=env?.COMMERCIAL_CONTEXT;
  if(context!==undefined&&context!==null&&!isCommercialContext(context))fail('SCOPE_MISMATCH',403);
  const expected=context?{organization_id:context.organizationId,store_id:context.storeId,currency:'BRL'}:{organization_id:'legacy-brazacommerce',store_id:'legacy-shopee',currency:'BRL'};
  if(!sameBook(scope,expected))fail('SCOPE_MISMATCH',403);
  const now=input.now??Date.now;if(typeof now!=='function')fail('REQUEST_INVALID');
  let millis;try{millis=now();}catch{fail('CLOCK_INVALID',503);}
  if(!Number.isSafeInteger(millis)||millis<1)fail('CLOCK_INVALID',503);
  let observed;try{observed=normalizeFinancialTimestamp(new Date(millis).toISOString());}catch{fail('CLOCK_INVALID',503);}
  return {scope,period,command,observed,expectedRevision:input.expected_revision??null};
}
function coverage(scope,source,state,pending){
  return [{family:source==='NUBANK'?'BANK':'PAYOUTS',scope:{...scope},state,start_at:null,end_at:null,timezone_confirmed:false,comparison:'NOT_COMPARED',account_refs:[postingAccount(source)],pending:[...pending]}];
}
function partialResult(selected,{pending,state='PARTIAL',checkpoint=null,revision=null,has_more=true}={}){
  return {events:[],coverage:coverage(selected.scope,selected.command.source,state,pending),balances:[],pending,
    checkpoint:checkpoint??{schema:'financial_cash_source_cursor_v1',month:selected.command.month,source:selected.command.source,cursor:selected.command.cursor,expected_revision:selected.expectedRevision},
    has_more,source_revision:revision,counts:{records_read:0,event_count:0,review_records:0,operator_links:0,allocation_page_complete:false,suggestions_ignored:0,observed_net_movement_cents:null}};
}
async function groupEvidence(group){
  // Import/operator identifiers are hashed; account references, reasons,
  // actor IDs, bank descriptions and external transaction IDs stay private.
  const rows=async values=>Promise.all(values.map(async row=>({record_hash:await financialDigest(row.record_id),amount_cents:row.amount_cents,record_revision:row.record_revision})));
  const value={group_hash:await financialDigest(group.group_id),revision:group.revision,relation:group.relation,state:group.state,confirmation:group.confirmation,confirmed_at:group.confirmed_at,reversed_at:group.reversed_at??null,left:await rows(group.left),right:await rows(group.right),adjustments:await rows(group.adjustments),accounting_effect:group.accounting_effect};
  return {kind:'OPERATOR_CASH_ALLOCATION',reference:'allocation-'+value.group_hash,sha256:await financialDigest(value)};
}
function associatedGroup(group,row){
  const items=[...group.left,...group.right,...group.adjustments],item=items.find(value=>value.record_id===row.record_id);
  if(!item)return null;
  const usage=group.usage.find(value=>value.record_id===row.record_id);
  if(item.record_revision!==1||item.account_id!==sourceAccount(row.source)||item.evidence_id!=='cash-evidence:'+row.record_id||usage?.legacy_record_id!==row.record_id||usage.capacity_cents!==Math.abs(row.amount_cents))return {valid:false,group};
  return {valid:true,group,item};
}

/**
 * One saved-cash page and, when nonempty, one saved-allocation page. No loop,
 * write, bank request or provider request occurs here. These file contracts do
 * not prove physical account identity, complete intervals or native identity.
 * Every observation therefore remains CONSERVATIVE/REVIEW, including operator
 * links. Proposed position postings never become new revenue or counted cash.
 */
export async function readFinancialAutomationCashPage(env,input,options={}){
  const selected=selectedInput(env,input),{scope,period,command,observed,expectedRevision}=selected;
  if(!exact(options,[],['readCash','readAllocations'])||options.readCash!==undefined&&typeof options.readCash!=='function'||options.readAllocations!==undefined&&typeof options.readAllocations!=='function')fail('CONFIGURATION',503);
  const readCash=options.readCash??(value=>getFinanceExternalCash(env,value)),readAllocations=options.readAllocations??(value=>getFinanceFinancialAutomation(env,'allocations',value));
  let reply;try{reply=await readCash(command);}catch{return partialResult(selected,{pending:['IMPORTED_CASH_SOURCE_UNAVAILABLE'],state:'UNAVAILABLE'});}
  if(reply?.status!==200){
    const stale=reply?.status===409,pending=[stale?'IMPORTED_CASH_CURSOR_STALE':reply?.status===403?'IMPORTED_CASH_READ_FORBIDDEN':'IMPORTED_CASH_SOURCE_UNAVAILABLE'];
    return partialResult(selected,{pending,state:reply?.status===403?'FORBIDDEN':'UNAVAILABLE',...(stale?{checkpoint:{schema:'financial_cash_source_cursor_v1',month:command.month,source:command.source,cursor:null,expected_revision:null}}:{})});
  }
  const frame=projectExternalCashResponse(reply.body);
  if(!frame||!externalCashResponseMatches(command,frame))fail('RESPONSE_INVALID',502);
  if(expectedRevision!==null&&frame.revision!==expectedRevision)return partialResult(selected,{pending:['IMPORTED_CASH_CURSOR_STALE'],revision:frame.revision,checkpoint:{schema:'financial_cash_source_cursor_v1',month:command.month,source:command.source,cursor:null,expected_revision:null}});
  const pending=new Set(['IMPORTED_CASH_CONSERVATIVE_IDENTITY','IMPORTED_CASH_DATE_ONLY_TIMEZONE_UNCONFIRMED',command.source==='NUBANK'?'BANK_PHYSICAL_ACCOUNT_UNCONFIRMED':'PAYOUT_WALLET_CAUSALITY_UNCONFIRMED',command.source==='NUBANK'?'BANK_OPENING_AND_CLOSING_BALANCES_REQUIRED':'PAYOUT_SOURCE_COVERAGE_UNCONFIRMED']);
  let groups=[],allocationComplete=frame.records.length===0;
  if(frame.records.length){
    let allocationReply;try{allocationReply=await readAllocations({schema:'financial_cash_allocation_request_v1',operation:'read',limit:100,cursor:null});}catch{}
    if(allocationReply?.status===200){
      const allocation=projectFinancialAllocationResponse(allocationReply.body);
      if(!allocation||allocation.schema!=='financial_cash_allocation_workspace_v1')fail('ALLOCATION_RESPONSE_INVALID',502);
      if(!sameBook(scope,allocation.scope))fail('SCOPE_MISMATCH',403);
      groups=allocation.groups;allocationComplete=allocation.next_cursor===null;
      if(!allocationComplete)pending.add('IMPORTED_CASH_ALLOCATION_PAGE_INCOMPLETE');
    }else pending.add(allocationReply?.status===403?'IMPORTED_CASH_ALLOCATION_READ_FORBIDDEN':'IMPORTED_CASH_ALLOCATION_SOURCE_UNAVAILABLE');
  }
  const events=[],amounts=[];let links=0;
  for(const row of frame.records){
    // This is a display anchor for a date-only observation, not a claim that
    // the bank transaction happened at 00h Brasília or at a weekly 13h cut.
    const at=row.date+'T03:00:00.000Z';
    if(at>observed){pending.add('IMPORTED_CASH_DATE_NOT_OBSERVED');continue;}
    if(!inPeriod(at,period))continue;
    amounts.push(row.amount_cents);
    const body={record_hash:await financialDigest(row.record_id),source:row.source,date:row.date,amount_cents:row.amount_cents,currency:row.currency,import_hash:await financialDigest(row.import_id),review:row.review,date_precision:'DATE_ONLY',timestamp_basis:'DISPLAY_ANCHOR_NOT_SOURCE_TIME',physical_account_confirmed:false};
    const evidence=[{kind:'IMPORTED_CASH_ROW',reference:'cash-'+body.record_hash,sha256:await financialDigest(body)}];
    const activeMatches=frame.matches.filter(match=>match.bank_record_id===row.record_id||match.transfer_record_id===row.record_id);
    let classified=0,classifiedPayment=0,classificationConflict=false;
    for(const match of activeMatches){
      if(stamp(match.confirmed_at)>observed){pending.add('IMPORTED_CASH_OPERATOR_EVIDENCE_IN_FUTURE');continue;}
      const link={match_hash:await financialDigest(match.match_id),bank_hash:await financialDigest(match.bank_record_id),transfer_hash:await financialDigest(match.transfer_record_id),confirmed_at:match.confirmed_at};
      evidence.push({kind:'OPERATOR_CASH_MATCH',reference:'match-'+link.match_hash,sha256:await financialDigest(link)});links++;
      if(row.source==='NUBANK'&&row.amount_cents>0)classified=row.amount_cents;
    }
    for(const group of groups){
      const association=associatedGroup(group,row);if(!association)continue;
      if(!association.valid){pending.add('IMPORTED_CASH_ALLOCATION_RECORD_MISMATCH');continue;}
      if(stamp(group.reversed_at??group.confirmed_at)>observed){pending.add('IMPORTED_CASH_OPERATOR_EVIDENCE_IN_FUTURE');continue;}
      if(evidence.length>=32){pending.add('IMPORTED_CASH_OPERATOR_EVIDENCE_LIMIT');continue;}
      evidence.push(await groupEvidence(group));links++;
      if(row.source==='NUBANK'&&row.amount_cents>0&&group.state==='CONFIRMED'&&group.relation==='TRANSFER_DEPOSIT'&&group.right.some(item=>item.record_id===row.record_id)){
        try{classified=financialSafeSum([classified,association.item.amount_cents]);}catch{classificationConflict=true;pending.add('IMPORTED_CASH_ALLOCATION_CAPACITY_CONFLICT');}
      }
      if(row.source==='NUBANK'&&row.amount_cents<0&&group.state==='CONFIRMED'&&group.relation==='OBLIGATION_PAYMENT'&&group.right.some(item=>item.record_id===row.record_id)){
        try{classifiedPayment=financialSafeSum([classifiedPayment,association.item.amount_cents]);}catch{classificationConflict=true;pending.add('IMPORTED_CASH_ALLOCATION_CAPACITY_CONFLICT');}
      }
    }
    const postings=[];
    if(row.source==='SHOPEE'&&row.amount_cents>0){
      postings.push({account:'TRANSFER_IN_TRANSIT',account_ref:'unverified-shopee-transfer-imports',amount_cents:row.amount_cents},{account:'WALLET_AVAILABLE',account_ref:'unverified-shopee-wallet-imports',amount_cents:opposite(row.amount_cents)});
    }else if(row.source==='NUBANK'&&!classificationConflict&&classified>0&&classified<=row.amount_cents){
      postings.push({account:'BANK',account_ref:'unverified-nubank-imports',amount_cents:classified},{account:'TRANSFER_IN_TRANSIT',account_ref:'unverified-shopee-transfer-imports',amount_cents:opposite(classified)});
      if(classified<row.amount_cents)pending.add('BANK_MOVEMENT_CLASSIFICATION_INCOMPLETE');
    }else if(row.source==='NUBANK'&&!classificationConflict&&classifiedPayment>0&&classifiedPayment<=-row.amount_cents){
      postings.push({account:'ACCOUNTS_PAYABLE',account_ref:'declared-expense-payments',amount_cents:classifiedPayment},{account:'BANK',account_ref:'unverified-nubank-imports',amount_cents:opposite(classifiedPayment)});
      if(classifiedPayment< -row.amount_cents)pending.add('BANK_MOVEMENT_CLASSIFICATION_INCOMPLETE');
    }else if(row.source==='NUBANK')pending.add(classified>row.amount_cents&&classified>0?'IMPORTED_CASH_ALLOCATION_CAPACITY_CONFLICT':'BANK_MOVEMENT_CLASSIFICATION_REQUIRED');
    else pending.add('PAYOUT_MOVEMENT_DIRECTION_REQUIRES_REVIEW');
    if(row.review)pending.add('IMPORTED_CASH_ROW_REQUIRES_REVIEW');
    events.push(await createFinancialEvent({scope,event_type:row.source==='NUBANK'?'IMPORTED_BANK_MOVEMENT_REVIEW':'IMPORTED_PAYOUT_REVIEW',event_at:at,competence_at:null,settlement_at:null,source_updated_at:null,observed_at:observed,source:{provider:row.source==='NUBANK'?'BANK':'SHOPEE',family:row.source==='NUBANK'?'IMPORTED_BANK_MOVEMENT':'IMPORTED_PAYOUT',native_id:null,identity:'CONSERVATIVE',identity_key:await financialDigest(['imported-cash-record-v1',row.source,row.record_id])},evidence,causal_event_id:null,quality:'REVIEW',postings}));
  }
  let total=null;try{if(amounts.length)total=financialSafeSum(amounts);}catch{pending.add('IMPORTED_CASH_PAGE_TOTAL_OUT_OF_RANGE');}
  if(frame.next_cursor!==null)pending.add('IMPORTED_CASH_MORE_PAGES');
  const codes=[...pending].sort();
  return {events,coverage:coverage(scope,command.source,frame.records.length?'PARTIAL':'UNKNOWN',codes),balances:[],pending:codes,
    checkpoint:{schema:'financial_cash_source_cursor_v1',month:command.month,source:command.source,cursor:frame.next_cursor,expected_revision:frame.revision},
    has_more:frame.next_cursor!==null,source_revision:frame.revision,
    counts:{records_read:frame.records.length,event_count:events.length,review_records:events.length,operator_links:links,allocation_page_complete:allocationComplete,suggestions_ignored:frame.suggestions.length,observed_net_movement_cents:total}};
}
