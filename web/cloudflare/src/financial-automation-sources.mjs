import {getFinanceFinancialAutomation} from './app-financial-automation.mjs';
import {readBusinessMonthDisplay} from './business-month.mjs';
import {readCompletedBusinessMonth} from './business-month-publication.mjs';
import {readFinancialAutomationSavedAds} from './financial-automation-ads-sources.mjs';
import {readFinancialAutomationCashPage} from './financial-automation-cash-sources.mjs';
import {financialInventorySources} from './financial-inventory-bridge.mjs';
import {readFinancialReturnsTracker} from './financial-returns-tracker.mjs';
import {readExpenseLedger} from './expense-ledger.mjs';
import {readBusinessTaxPolicy} from './business-tax-policy.mjs';
import {FinancialLedgerError,createFinancialEvent,financialDigest,financialSafeSum,normalizeFinancialScope,sameFinancialScope} from './financial-event-ledger.mjs';
import {financialAccountingPeriod} from './financial-accounting-schedule.mjs';

const faSourceFamilies=['ORDERS','COGS','ADS','EXPENSES','TAX','RETURNS','RECEIVABLES','WALLET','PAYOUTS','BANK','INVENTORY','OBLIGATIONS'];
const faSourceIds=['ORDERS','ESCROW','INCOME_OVERVIEW','PENDING','RELEASES','RETURNS','RETURN_DISCOVERY','WALLET','PAYOUTS'];
const faSourceStamp=seconds=>Number.isSafeInteger(seconds)&&seconds>0&&seconds<=9999999999?new Date(seconds*1000).toISOString():null;
const faSourceComponentStamp=value=>typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value?value:null;
const faSourceDay=date=>/^20\d\d-\d\d-\d\d$/.test(date??'')?date+'T03:00:00.000Z':null;
const faSourceMonthEnd=month=>new Date(Date.parse(financialAccountingPeriod({kind:'MONTH',anchor:month}).end_at)-1).toISOString();
const faSourceInside=(value,period)=>value!==null&&value>=period.start_at&&value<period.end_at;
function faSourceCoverage(scope){return faSourceFamilies.map(family=>({family,scope,state:'UNKNOWN',start_at:null,end_at:null,timezone_confirmed:false,comparison:'NOT_COMPARED',account_refs:[],pending:[family+'_SOURCE_NOT_CONFIRMED']}));}
function faSourceSetCoverage(rows,family,period,{complete=false,pending=[]}={}){Object.assign(rows.find(r=>r.family===family),{state:complete?'COMPLETE':'PARTIAL',start_at:period.start_at,end_at:period.end_at,timezone_confirmed:true,pending});}
function faSourceCapabilities(){return faSourceIds.map(source=>({source,state:'UNKNOWN',reason:'CAPABILITY_NOT_VERIFIED',collection_allowed:false,checked_at:null}));}
async function faSourceEvent(scope,{provider,family,id,type,event_at,competence_at=null,source_updated_at=null,observed_at,quality='CONFIRMED',postings=[],evidence}){
 return createFinancialEvent({scope,event_type:type,event_at,competence_at,settlement_at:null,source_updated_at,observed_at,source:{provider,family,native_id:id,identity:'NATIVE_ID',identity_key:null},evidence:[{kind:family,reference:id.slice(0,128),sha256:await financialDigest(evidence)}],causal_event_id:null,quality,postings});
}
async function faSourceOrderEvent(scope,fact,policy,observed){
 if(fact.order_items_hash!==undefined&&fact.order_items_hash!==null&&!(typeof fact.order_items_hash==='string'&&/^[a-f0-9]{64}$/.test(fact.order_items_hash)))throw new FinancialLedgerError('FINANCIAL_AUTOMATION_ORDER_ITEMS_IDENTITY_INVALID',503);
 let valid=false;try{valid=Number.isSafeInteger(fact.after_adjustment_cents)&&Number.isSafeInteger(fact.escrow_amount_cents)&&Number.isSafeInteger(fact.total_adjustment_cents)&&financialSafeSum([fact.escrow_amount_cents,fact.total_adjustment_cents])===fact.after_adjustment_cents;}catch{}
 const paid=['completed','ongoing'].includes(fact.bucket),details=fact.components??null,created=faSourceStamp(fact.create_time),completed=faSourceComponentStamp(details?.dates?.completed_at),updated=faSourceComponentStamp(details?.dates?.updated_at);
 let competence=null;if(policy?.approval?.state==='APPROVED'){
  if(policy.recognition==='PAID_ORDER_CREATE_ESTIMATE')competence=created;
  else if(policy.recognition==='COMPLETED_ORDER'&&fact.bucket==='completed')competence=completed;
 }
 const topupField='ads_escrow_top_up_fee_or_technical_support_fee',topup=details?.amounts?.[topupField+'_cents'],topupObserved=Object.hasOwn(details?.amounts??{},topupField+'_cents')&&Number.isSafeInteger(topup)&&!Object.is(topup,-0)&&!(details?.missing_fields??[]).includes(topupField)&&!(details?.invalid_fields??[]).includes(topupField);
 const pending=paid?[...(!topupObserved?['ORDER_TOPUP_COMPONENT_REQUIRED']:[]),...(valid&&fact.total_adjustment_cents!==0||topupObserved&&topup!==0?['ORDER_ADJUSTMENT_CLASSIFICATION_REQUIRED']:[])]:[];
 const known=paid&&pending.length===0&&policy?.revenue_base==='NET_PAYOUT'&&fact.payment_covered===true&&fact.currency===scope.currency&&valid&&fact.diagnostic===null&&created!==null&&competence!==null&&competence<=observed;
 const amount=known?fact.after_adjustment_cents:0,semanticDetails=details?Object.fromEntries(Object.entries(details).filter(([key])=>!['checked_at','source_hash'].includes(key))):null;
 // Arithmetic equality alone does not classify an adjustment or Ads funding.
 // Only observed zero needs no addback/reclassification; ambiguous money stays
 // in evidence and the legacy estimate, never confirmed revenue or expense.
 return {pending,missing:paid&&(policy?.recognition!=='COMPLETED_ORDER'||fact.bucket==='completed')&&!known,event:await faSourceEvent(scope,{provider:'SHOPEE',family:'ORDER_NET_PAYOUT',id:fact.event_key,type:known?'ORDER_NET_REVENUE':'ORDER_FINANCIAL_REVIEW',event_at:created??faSourceStamp(fact.checked_at)??observed,competence_at:competence,source_updated_at:updated,observed_at:observed,quality:known&&policy.recognition!=='PAID_ORDER_CREATE_ESTIMATE'?'CONFIRMED':'REVIEW',postings:known?[{account:'RECEIVABLE',account_ref:'shopee-receivables',amount_cents:amount},{account:'REVENUE',account_ref:'shopee-net-payout',amount_cents:amount===0?0:-amount}]:[],evidence:{order_hash:fact.event_key,order_items_hash:fact.order_items_hash??null,bucket:fact.bucket,create_time:fact.create_time,currency:fact.currency,escrow_amount_cents:fact.escrow_amount_cents,after_adjustment_cents:fact.after_adjustment_cents,total_adjustment_cents:fact.total_adjustment_cents,return_count:fact.return_count,diagnostic:fact.diagnostic,components:semanticDetails,policy_id:policy?.policy_id??null,policy_revision:policy?.revision??null}})};
}

// Saved observations only: no new Shopee order/wallet/bank provider request.
export function createFinancialAutomationServices(env,services={}){
 const monthRead=services.readFinancialSavedMonth??((month,now)=>readBusinessMonthDisplay(env,{month},{now}));
 const referencesRead=services.readFinancialSavedMonth??(async(month,now)=>{const saved=await readCompletedBusinessMonth(env,month,{now});return {audit_scope:saved?{sources:saved.payload.slots.map(slot=>({run_id:slot.frame.run_id,source_revision:slot.frame.revision,start_date:slot.start_date,end_date:slot.end_date}))}:null};});
 const expensesRead=services.readFinancialSavedExpenses??((month,now)=>readExpenseLedger(env,{month},{now}));
 const privateRead=services.readFinancialPrivate??(input=>getFinanceFinancialAutomation(env,'sources',input));
 const taxRead=async({scope,month})=>{if(scope.currency!=='BRL')return null;try{const row=await readBusinessTaxPolicy(env,Number(month.slice(0,4)));if(!Number.isSafeInteger(row.values?.monthly_das_cents)||row.values.monthly_das_cents<0||row.revision<1)return null;return {regime:row.values.regime,mode:'FIXED_MONTHLY',monthly_cents:row.values.monthly_das_cents,recognition:'MONTH_END',source_ref:'declared-tax-'+month.slice(0,4)+'-r'+row.revision,revision:row.revision};}catch{return null;}};
 const originalPage=async(scope,input)=>{normalizeFinancialScope(scope);const reply=await privateRead({schema:'financial_source_request_v3',operation:'original-items',...input});if(reply?.status!==200)throw new FinancialLedgerError(reply?.status===404?'FINANCIAL_AUTOMATION_ORIGINAL_ITEM_NOT_FOUND':reply?.status===409?'FINANCIAL_AUTOMATION_ORIGINAL_ITEM_SOURCE_CHANGED':'FINANCIAL_AUTOMATION_ORIGINAL_ITEM_SOURCE_UNAVAILABLE',reply?.status===404||reply?.status===409?409:503);const frame=reply.body;if(frame?.schema!=='financial_source_original_items_v3'||!sameFinancialScope(frame.scope,scope)||frame.run.run_id!==input.run_id||!Array.isArray(frame.items)||frame.items.length>input.limit||frame.items.some(row=>!sameFinancialScope(row.scope,scope)||row.run_id!==input.run_id))throw new FinancialLedgerError('FINANCIAL_AUTOMATION_ORIGINAL_ITEM_SCOPE_INVALID',403);return frame;};
 const resolveOriginal=async({scope,run_id,order_hash,item_id,model_id})=>{const frame=await originalPage(scope,{run_id,cursor:null,limit:1,expected_revision:null,order_hash,item_id,model_id});const row=frame.items[0];if(frame.items.length!==1||row.order_hash!==order_hash||row.item_id!==item_id||row.model_id!==model_id)throw new FinancialLedgerError('FINANCIAL_AUTOMATION_ORIGINAL_ITEM_NOT_FOUND',409);return row;};
 const listOriginal=async({scope,month,now=Date.now})=>{if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month??''))return [];const saved=await referencesRead(month,now),runs=[...new Map((saved.audit_scope?.sources??[]).map(row=>[row.run_id,row])).values()];if(runs.length>3)throw new FinancialLedgerError('FINANCIAL_AUTOMATION_SOURCE_PERIOD_LIMIT',503);const items=new Map();for(const ref of runs){const frame=await originalPage(scope,{run_id:ref.run_id,cursor:null,limit:100,expected_revision:ref.source_revision,order_hash:null,item_id:null,model_id:null});for(const row of frame.items){const key=[row.order_hash,row.item_id,row.model_id].join(':'),old=items.get(key);if(!old||old.checked_at<row.checked_at)items.set(key,row);}}return [...items.values()];};
 return {...services,resolveFinancialOriginalItem:services.resolveFinancialOriginalItem??resolveOriginal,listFinancialOriginalItems:services.listFinancialOriginalItems??listOriginal,readFinancialAutomationTaxPolicy:services.readFinancialAutomationTaxPolicy??taxRead,
  readFinancialLegacyEstimate:services.readFinancialLegacyEstimate??(async({month,now})=>{try{const value=await monthRead(month,now);return {schema:'financial_legacy_estimate_reference_v1',month,basis:value.display.result.basis,amount_cents:value.display.result.net_estimate_cents,checked_at:value.display.checked_at,pending:[...value.display.result.pending],source:'EXISTING_BUSINESS_MONTH_NO_CHANGE'};}catch{return null;}}),
  readFinancialAutomationSources:services.readFinancialAutomationSources??faSourceRotate(env,services,(async({scope,period,policy,now=Date.now,checkpoint=null,mode='read'})=>{
   normalizeFinancialScope(scope);const stamp=new Date(now()).toISOString(),coverage=faSourceCoverage(scope),events=[],obligations=[],pending=[];
   const months=[];for(let month=period.start_date.slice(0,7);month<=period.end_date.slice(0,7);){months.push(month);const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);month=date.toISOString().slice(0,7);if(months.length>13)throw Error('FINANCIAL_AUTOMATION_SOURCE_PERIOD_LIMIT');}
   const runs=[];let expenseComplete=true;
   for(const month of months){
    try{const saved=await referencesRead(month,now);for(const ref of saved.audit_scope?.sources??[])if(!runs.some(r=>r.run_id===ref.run_id))runs.push({month,...ref});if(!saved.audit_scope)pending.push('ORDERS_SAVED_PUBLICATION_REQUIRED');}catch{pending.push('ORDERS_SAVED_SOURCE_UNAVAILABLE');}
    try{const expense=await expensesRead(month,now),explicitZero=expense.mode==='MANUAL'&&expense.expenses_revision>0&&expense.current_external_expenses_cents===0;
     expenseComplete&&=(expense.mode==='CONFIRMED'||explicitZero)&&expense.unallocated_cents===0;
     if(expense.unallocated_cents>0)pending.push('EXPENSES_UNALLOCATED_COMPETENCE_REQUIRED');
     for(const row of expense.items??[]){
      const amount=row.status==='CANCELLED'?0:row.amount_cents;if(!Number.isSafeInteger(amount)||amount<0)throw Error();const at=row.created_at??row.updated_at,competence=faSourceMonthEnd(row.competence_month);if(!at||at>stamp)throw Error();
      if(faSourceInside(competence,period)&&competence<=stamp)events.push(await faSourceEvent(scope,{provider:'OPERATOR',family:'EXPENSE_COMPETENCE',id:row.id,type:'EXPENSE_RECOGNIZED',event_at:at,competence_at:competence,source_updated_at:row.updated_at,observed_at:stamp,quality:policy?.approval?.state==='APPROVED'?'CONFIRMED':'REVIEW',postings:[{account:'OPERATING_EXPENSE',account_ref:'declared-expenses',amount_cents:amount},{account:'ACCOUNTS_PAYABLE',account_ref:row.id,amount_cents:amount===0?0:-amount}],evidence:{id:row.id,amount_cents:amount,competence_month:row.competence_month,category:row.category,status:row.status==='CANCELLED'?'CANCELLED':'RECOGNIZED'}}));
      if(competence>stamp&&amount>0)pending.push('EXPENSE_COMPETENCE_NOT_YET_REACHED');
      obligations.push({scope,obligation_id:row.id,kind:'PAYABLE',status:row.status==='CANCELLED'?'CANCELLED':row.status==='PAID'?'SETTLED':'OPEN',amount_cents:amount,due_at:faSourceDay(row.due_date),confidence:'CONFIRMED',evidence_ref:row.id});
     }
    }catch{expenseComplete=false;pending.push('EXPENSE_SOURCE_UNAVAILABLE');}
   }
   faSourceSetCoverage(coverage,'EXPENSES',period,{complete:expenseComplete,pending:expenseComplete?[]:['EXPENSES_CONFIRMATION_REQUIRED']});
   faSourceSetCoverage(coverage,'OBLIGATIONS',period,{pending:['EXTERNAL_OBLIGATIONS_COVERAGE_REQUIRED']});
   const signature=await financialDigest([runs.map(r=>[r.run_id,r.source_revision]),policy?.policy_id??null,policy?.revision??null]);
   const prior=checkpoint?.schema==='financial_saved_source_cursor_v2'&&checkpoint.signature===signature?checkpoint:null;
   let observedCapabilities=null;let progress=prior?{...prior}:{schema:'financial_saved_source_cursor_v2',signature,index:0,cursor:null,expected_revision:null,complete:runs.length>0,missing_required:0,classification_pending:[],checked_at:null,capabilities:faSourceCapabilities()};
   if(mode==='sync'&&runs.length&&progress.index<runs.length){
    const run=runs[progress.index],input={schema:'financial_source_request_v2',operation:'evidence',run_id:run.run_id,cursor:progress.cursor,limit:100,expected_revision:progress.expected_revision??run.source_revision};
    const reply=await privateRead(input);
    if(reply.status===200){const frame=reply.body;if(frame.schema!=='financial_source_evidence_v2'||!sameFinancialScope(frame.scope,scope)||frame.run.run_id!==run.run_id||frame.cursor!==progress.cursor)throw Error('FINANCIAL_AUTOMATION_SOURCE_SCOPE_INVALID');
     const observed=faSourceStamp(frame.run.checked_at);if(observed===null||observed>stamp)throw Error('FINANCIAL_AUTOMATION_SOURCE_DATE_INVALID');
     let missing=0;const classificationPending=[];for(const fact of frame.facts){const result=await faSourceOrderEvent(scope,fact,policy,observed);events.push(result.event);classificationPending.push(...result.pending);if(result.missing)missing++;}
     observedCapabilities=frame.capabilities.sources;const captured=frame.capabilities.sources.map(({source,state,reason,collection_allowed,checked_at})=>({source,state,reason,collection_allowed,checked_at}));
     const sourceComplete=frame.coverage.base_complete===true&&frame.coverage.window_complete===true;
     progress={...progress,cursor:frame.next_cursor,expected_revision:frame.run.revision,complete:progress.complete&&sourceComplete,missing_required:progress.missing_required+missing,classification_pending:[...new Set([...(progress.classification_pending??[]),...classificationPending])],checked_at:progress.checked_at&&progress.checked_at<observed?progress.checked_at:observed,capabilities:captured,last_page:{run_id:frame.run.run_id,revision:frame.run.revision,checked_at:observed,sha256:await financialDigest({run:frame.run,coverage:frame.coverage,facts:frame.facts.map(row=>[row.event_key,row.source_hash,row.checked_at])})}};
     if(frame.has_more===false){progress.index++;progress.cursor=null;progress.expected_revision=null;}
    }else{pending.push(/^FINANCIAL_[A-Z0-9_]+$/.test(reply.body?.error??'')?reply.body.error:'ORDERS_SOURCE_UNAVAILABLE');if(reply.status===409)progress={...progress,index:0,cursor:null,expected_revision:null,complete:true,missing_required:0,classification_pending:[],checked_at:null};}
   }
   const finished=runs.length>0&&progress.index>=runs.length;
   // These existing runs select creation dates. A completed-date policy needs
   // a separately proven cohort covering older orders completed this period.
   const competenceCohort=policy?.recognition==='PAID_ORDER_CREATE_ESTIMATE';
   const ordersComplete=finished&&progress.complete&&progress.missing_required===0&&competenceCohort;
   const orderPending=[...(progress.classification_pending??[]),...(finished&&progress.complete?[]:['ORDER_EVIDENCE_COLLECTION_INCOMPLETE']),...(progress.missing_required?['ORDER_RECOGNITION_EVIDENCE_REQUIRED']:[]),...(!competenceCohort?['ORDERS_COMPETENCE_COHORT_COVERAGE_REQUIRED']:[])];
   faSourceSetCoverage(coverage,'ORDERS',period,{complete:ordersComplete,pending:orderPending});
   if(policy?.revenue_base==='GROSS_COMPONENTS')pending.push('GROSS_COMPONENTS_RECONCILIATION_REQUIRED');
   pending.push(...orderPending,...coverage.filter(r=>r.state==='UNKNOWN').flatMap(r=>r.pending));
   return {events,coverage,balances:[],obligations,reserve:null,...(observedCapabilities?{capabilities:observedCapabilities}:{}),pending:[...new Set(pending)],cutoff_at:progress.checked_at,checkpoint:progress,has_more:runs.length>0&&!finished};
  }))};
}

// Each turn reads one order page, one local Ads calendar, OR one cash page.
// Cursor publication remains the bridge's responsibility after the journal CAS.
function faSourceRotate(env,services,ordersRead){return async args=>{
 const signature=await financialDigest([args.scope,args.period,args.policy?.policy_id??null,args.policy?.revision??null]);
 const saved=args.checkpoint?.schema==='financial_multi_source_cursor_v1'&&args.checkpoint.signature===signature?args.checkpoint:null;
 const progress=saved?structuredClone(saved):{schema:'financial_multi_source_cursor_v1',signature,lane:0,order_checkpoint:null,order_done:false,ads_done:false,inventory_done:false,inventory_checkpoint:null,returns_done:false,cash_index:0,cash_checkpoint:null,coverage:[],pending:{orders:[],ads:[],cash:[]},observations:{},completed:false};
 if(progress.completed){progress.completed=false;progress.lane=0;progress.order_done=false;progress.ads_done=false;progress.inventory_done=false;progress.inventory_checkpoint=null;progress.returns_done=false;progress.cash_index=0;progress.cash_checkpoint=null;}
 const scope=args.scope,period=args.period,events=[],obligations=[];let cutoff=null,inventory=null,observedCapabilities=null;
 const cashTargetCount=period.start_date.slice(0,7)===period.end_date.slice(0,7)?2:4;
 for(let skipped=0;skipped<5;skipped++){const done=progress.lane===0?progress.order_done:progress.lane===1?progress.ads_done:progress.lane===2?progress.cash_index>=cashTargetCount:progress.lane===3?progress.inventory_done:progress.returns_done;if(!done)break;progress.lane=(progress.lane+1)%5;}
 const selectedLane=progress.lane;
 const merge=rows=>{for(const row of rows){const {scope:ignored,...minimal}=row;const index=progress.coverage.findIndex(r=>r.family===row.family);if(index<0)progress.coverage.push(minimal);else progress.coverage[index]=minimal;}};
 if(progress.lane===0){
  const result=await ordersRead({...args,checkpoint:progress.order_checkpoint});events.push(...result.events);obligations.push(...result.obligations);merge(result.coverage.filter(r=>['ORDERS','EXPENSES','OBLIGATIONS'].includes(r.family)));
  observedCapabilities=result.capabilities??null;progress.order_checkpoint=result.checkpoint;progress.order_done=result.has_more===false;progress.pending.orders=result.pending;if(result.checkpoint?.last_page)progress.observations.orders=result.checkpoint.last_page;cutoff=result.cutoff_at;progress.lane=1;
 }else if(progress.lane===1){
  const result=await (services.readFinancialSavedAds??(input=>readFinancialAutomationSavedAds(env,input)))({scope,period,now:args.now});events.push(...result.events);merge(result.coverage);progress.pending.ads=result.pending;progress.ads_done=true;
  progress.observations.ads={known_expense_cents:result.known_expense_cents,covered_days:result.covered_days,missing_days:result.missing_days,partial_days:result.partial_days};progress.lane=2;
 }else if(progress.lane===2){
  const months=[period.start_date.slice(0,7)];if(period.end_date.slice(0,7)!==months[0])months.push(period.end_date.slice(0,7));const targets=months.flatMap(month=>['NUBANK','SHOPEE'].map(source=>({month,source})));
  if(progress.cash_index<targets.length){
   const target=targets[progress.cash_index],cp=progress.cash_checkpoint,result=await (services.readFinancialSavedCash??(input=>readFinancialAutomationCashPage(env,input)))({scope,period,...target,cursor:cp?.cursor??null,expected_revision:cp?.expected_revision??null,limit:100,now:args.now});
   events.push(...result.events);merge(result.coverage);progress.pending.cash=[...new Set([...progress.pending.cash,...result.pending])];
   progress.observations.cash={...(progress.observations.cash??{}),[target.source]:result.counts};progress.cash_checkpoint=result.checkpoint;
   // A missing transport/permission is an observed dependency, not an endless
   // pagination cursor that prevents preparing a provisional close.
   if(result.has_more===false||result.coverage.some(r=>['UNAVAILABLE','FORBIDDEN'].includes(r.state))){progress.cash_index++;progress.cash_checkpoint=null;}
  }
  progress.lane=3;
 }else if(progress.lane===3){
  const result=await (services.readFinancialSavedInventory??(input=>financialInventorySources(env,{scope:input.scope,period:input.period,checkpoint:input.checkpoint},{assertAuthorized:args.assertAuthorized,now:args.now,actor:args.actor})))({scope,period,checkpoint:progress.inventory_checkpoint??null,now:args.now});
  events.push(...result.events);merge(result.coverage);inventory=result.inventory;progress.pending.inventory=result.pending;progress.inventory_checkpoint=result.checkpoint??null;progress.inventory_done=result.has_more!==true;progress.observations.inventory={inventory_revision:result.inventory_revision,state:inventory.state,remaining_quantity:inventory.remaining_quantity,known_inventory_value_cents:inventory.known_inventory_value_cents};progress.lane=4;
 }else{
  const result=await (services.readFinancialSavedReturns??(input=>readFinancialReturnsTracker(env,{scope:input.scope},{assertAuthorized:args.assertAuthorized,now:args.now,actor:args.actor})))({scope,period,now:args.now});
  const codes=[...result.pending,'RETURNS_FINANCIAL_COVERAGE_UNCONFIRMED'];merge([{family:'RETURNS',state:result.counts.known?'PARTIAL':'UNKNOWN',start_at:null,end_at:null,timezone_confirmed:false,comparison:'NOT_COMPARED',account_refs:[],pending:codes}]);progress.pending.returns=codes;progress.returns_done=true;progress.observations.returns={revision:result.revision,checked_at:result.checked_at,state:result.state,counts:result.counts};progress.lane=0;
 }
 progress.completed=progress.order_done&&progress.ads_done&&progress.inventory_done&&progress.returns_done&&progress.cash_index>=cashTargetCount;
 const coverage=faSourceCoverage(scope);for(const row of progress.coverage)Object.assign(coverage.find(r=>r.family===row.family),row,{scope});
 const pending=[...new Set([...Object.values(progress.pending).flat(),...coverage.filter(r=>r.state==='UNKNOWN').flatMap(r=>r.pending)])];
 return {events,coverage,...(selectedLane===0?{obligations}:{}),...(inventory?{inventory}:{}),...(observedCapabilities?{capabilities:observedCapabilities}:{}),pending,observations:progress.observations,cutoff_at:cutoff??progress.order_checkpoint?.checked_at??null,checkpoint:progress,has_more:!progress.completed};
};}
