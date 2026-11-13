import {FinancialLedgerError,normalizeFinancialScope,sameFinancialScope,financialCanonicalJSON,financialDigest} from './financial-event-ledger.mjs';
import {readFinancialInventoryWorkspace,mutateFinancialInventory} from './financial-inventory-bridge.mjs';
import {isCommercialContext,assertCommercialCapability} from './commercial-context.mjs';
import {financialClock,financialScopeKey,assertFinancialAccess,financialDatabase} from './financial-event-store.mjs';
import {readFinancialClose,mutateFinancialClose,financialCloseIdentity,financialCloseGates} from './financial-close-store.mjs';
import {validateFinancialAccountingPolicy,projectFinancialAccountingPolicy} from './financial-accounting-policy.mjs';
import {financialAccountingPeriod,financialAccountingLocalDate} from './financial-accounting-schedule.mjs';
import {projectFinancialAccounting,buildFinancialAccountingSnapshot} from './financial-accounting-projection.mjs';
import {ensureFinancialAutomationSchema,readFinancialAutomationState,writeFinancialAutomationState} from './financial-automation-store.mjs';
import {financialAutomationRequestId,financialAutomationSourceKind,financialAutomationUnknownCoverage,financialAutomationUnknownCapabilities,readFinancialAutomationLedger,ingestFinancialAutomationSources} from './financial-automation-bridge.mjs';

const path='/api/admin/finance/automation',integer=v=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=0,uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=(code,status=400)=>{throw new FinancialLedgerError('FINANCIAL_AUTOMATION_'+code,status);};
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const reason=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=240&&!/[\u0000-\u001f\u007f]/.test(value);
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','vary':'Cookie','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-braza-client-contract':'financial-automation-v1'}});

// The legacy binding names one existing deployment. It is never inferred from
// the first registered customer, a browser field, or a selected company name.
export function financialAutomationScope(env,current){
 const context=env?.COMMERCIAL_CONTEXT;
 if(context){if(!isCommercialContext(context)||current?.kind!=='account'||current.userId!==context.userId||current.organizationId!==context.organizationId||current.storeId!==context.storeId)fail('SCOPE_REJECTED',403);assertCommercialCapability(context,'finance.read');return normalizeFinancialScope({organization_id:context.organizationId,store_id:context.storeId,account_id:'operating-book',currency:'BRL'});}
 if(current?.role!=='owner'||current.kind!==undefined&&current.kind!=='legacy')fail('AUTHORIZATION_REQUIRED',403);
 return normalizeFinancialScope({organization_id:'legacy-brazacommerce',store_id:'legacy-shopee',account_id:'operating-book',currency:'BRL'});
}
export function financialAutomationPermissions(env,current){
 const context=env?.COMMERCIAL_CONTEXT;
 if(context){const grants=new Set(context.capabilities);const read=grants.has('finance.read')&&grants.has('bank.read')&&grants.has('costs.read');const write=read&&grants.has('finance.write');return {financial_read:read,financial_export:read,financial_configure:write,financial_close:write,financial_sync:write,financial_obligation_register:write&&grants.has('bank.write'),financial_reconcile:read&&grants.has('bank.write'),financial_inventory_read:read&&grants.has('production.read')&&grants.has('orders.read'),financial_inventory_write:write&&grants.has('costs.write')&&grants.has('production.read')&&grants.has('orders.read'),financial_inventory_returns_read:read&&grants.has('returns.read')};}
 const owner=current?.role==='owner'&&(current.kind===undefined||current.kind==='legacy');return {financial_read:owner,financial_export:owner,financial_configure:owner,financial_close:owner,financial_sync:owner,financial_obligation_register:owner,financial_reconcile:owner,financial_inventory_read:owner,financial_inventory_write:owner,financial_inventory_returns_read:owner};
}
export function financialAutomationClosePeriod(period){return {kind:period.kind==='MONTH'?'MONTH':'WEEK',start_at:period.start_at,end_at:period.end_at,timezone:period.timezone,calendar_id:period.calendar};}
function modelPeriod(period){return financialAccountingPeriod({kind:period.kind==='MONTH'?'MONTH':'CIVIL_WEEK',anchor:period.start_at,week_starts_on:period.calendar_id==='CIVIL_MONDAY_SUNDAY'?'MONDAY':'FRIDAY'});}
async function configuration(env,scope,options){const value=await readFinancialAutomationState(env,{scope,kind:'CONFIG',history:true},options);if(value.payload!==null){if(value.payload.schema!=='financial_automation_configuration_v1'||typeof value.payload.auto_close!=='boolean'||!projectFinancialAccountingPolicy(value.payload.policy,{scope}))fail('CONFIGURATION_INVALID',503);}return value;}
export async function readFinancialAutomationConfiguration(env,scope,options={}){return configuration(env,scope,options);}
function policyForPeriod(config,period){
 const entries=config.history.length?config.history:[{payload:config.payload}];
 for(const entry of entries){const policy=projectFinancialAccountingPolicy(entry.payload?.policy);if(policy&&period.start_date>=policy.effective_from&&(policy.effective_to===null||period.end_date<=policy.effective_to))return policy;}
 return config.payload?.policy??null;
}
export function financialAutomationPolicyForPeriod(config,period){return policyForPeriod(config,period);}
async function proposal(scope,month,config,options){
 let tax=config.payload?.policy?.tax??{regime:null,mode:'UNCONFIGURED',monthly_cents:null,recognition:null,source_ref:null,revision:0};
 if(typeof options.services?.readFinancialAutomationTaxPolicy==='function'){
  try{const observed=await options.services.readFinancialAutomationTaxPolicy({scope,month});if(observed)tax=observed;}catch{ /* the proposal stays explicitly unconfigured */ }
 }
 const policy={schema:'financial_accounting_policy_v1',policy_id:config.payload?.policy?.policy_id??'policy-'+(await financialDigest(scope)).slice(0,32),revision:(config.payload?.policy?.revision??0)+1,scope,effective_from:month+'-01',effective_to:null,recognition:'COMPLETED_ORDER',revenue_base:'NET_PAYOUT',cost_basis:'HISTORICAL_ALLOCATED_PIECES',financial_week:config.payload?.policy?.financial_week??'CIVIL_FRIDAY_THURSDAY',timezone:'America/Sao_Paulo',late_event_policy:'RESTATEMENT_REQUIRED',tax,approval:{state:'DRAFT',actor_ref:null,at:null,evidence_ref:null}};
 try{return validateFinancialAccountingPolicy(policy,{scope});}catch{policy.tax={regime:null,mode:'UNCONFIGURED',monthly_cents:null,recognition:null,source_ref:null,revision:0};return validateFinancialAccountingPolicy(policy,{scope});}
}
function publicClose(value){
 const stored=value?.close??value;if(!stored)return null;const range=modelPeriod(stored.period),metric=stored.basis==='BANK_CASH'?stored.snapshot.projection?.positions?.bank:stored.snapshot.projection?.result;
 return {close_id:stored.close_id,version:stored.version,status:stored.status,basis:stored.basis,period:{type:range.kind,start_date:range.start_date,end_date:range.end_date,timezone:range.timezone},amount_cents:metric?.amount_cents??null,hash:stored.snapshot_hash,created_at:stored.created_at,previous_version:stored.previous_version,pending:stored.snapshot.projection?.close_readiness?.[stored.basis]?.pending??[],cutoff_at:stored.snapshot.source_cutoff_at??stored.snapshot.projection?.checked_at??null};
}
async function closingHistory(env,scope,range,options){
 const db=financialDatabase(env);if(!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='financial_close_heads'").first())return {items:[],complete:true};
 const key=await financialScopeKey(scope),rows=(await db.prepare("SELECT payload,payload_hash,snapshot_hash,version,status FROM financial_close_revisions WHERE scope_key=? AND json_extract(payload,'$.period.start_at')<? AND json_extract(payload,'$.period.end_at')>? ORDER BY created_at DESC,version DESC LIMIT 101").bind(key,range.end_at,range.start_at).all()).results;
 if(!Array.isArray(rows))fail('STORAGE_INVALID',503);const items=[];
 for(const row of rows.slice(0,100)){let value;try{value=JSON.parse(row.payload);}catch{fail('CLOSED_SNAPSHOT_INVALID',503);}if(!sameFinancialScope(value.scope,scope)||value.schema!=='financial_close_version_v1'||value.version!==row.version||value.status!==row.status||await financialDigest(value)!==row.payload_hash||value.snapshot_hash!==row.snapshot_hash||await financialDigest(value.snapshot)!==row.snapshot_hash||await financialCloseIdentity(scope,value.period,value.basis)!==value.close_id)fail('CLOSED_SNAPSHOT_INVALID',503);financialCloseGates(value.gates,value.basis);items.push(value);}
 await assertFinancialAccess(env,scope,options);return {items,complete:rows.length<=100};
}
function thawProjection(value){
 const copy=JSON.parse(financialCanonicalJSON(value));const refs=copy.events;
 const visit=node=>{if(!node||typeof node!=='object')return;if(!Array.isArray(node)&&Array.isArray(node.event_indices)){node.event_refs=node.event_indices.map(index=>{if(!integer(index)||!refs[index])fail('CLOSED_SNAPSHOT_INVALID',503);return {...refs[index]};});delete node.event_indices;}for(const child of Object.values(node))visit(child);};visit(copy);copy.schema='financial_accounting_projection_v1';return copy;
}
function selectedMonth(month,stamp){if(typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||month>financialAccountingLocalDate(stamp).slice(0,7))fail('PERIOD_INVALID');return month;}
export async function readFinancialAutomationWorkspace(env,input,options={}){
 const scope=await assertFinancialAccess(env,input.scope,options),observedAt=financialClock(options),month=selectedMonth(input.month,observedAt),config=await configuration(env,scope,options);
 const range=input.period??financialAccountingPeriod({kind:'MONTH',anchor:month}),policy=policyForPeriod(config,range),source=await readFinancialAutomationState(env,{scope,kind:financialAutomationSourceKind(range)},options),ledger=await readFinancialAutomationLedger(env,scope,{...options,period:range});
 const jobState=await readFinancialAutomationState(env,{scope,kind:'JOB:'+await financialDigest([range.kind,range.calendar,range.start_at,range.end_at])},options),job=jobState.payload;
 const saved=source.payload;let checkedAt=saved?.checked_at??config.payload?.policy?.approval.at??observedAt;for(const event of ledger.events)if(event.observed_at>checkedAt)checkedAt=event.observed_at;if(checkedAt>observedAt)fail('SOURCE_DATE_INVALID',503);
 let coverage=saved?.coverage??financialAutomationUnknownCoverage(scope);if(!ledger.complete)coverage=coverage.map(row=>({...row,state:row.state==='COMPLETE'?'PARTIAL':row.state,pending:[...new Set([...(row.pending??[]),'FINANCIAL_LEDGER_PAGINATION_INCOMPLETE'])]}));
 const projection=projectFinancialAccounting({scope,period:range,policy,events:ledger.events,coverage,balances:saved?.balances??[],obligations:saved?.obligations??[],reserve:config.payload?.reserve??saved?.reserve??null,inventory:saved?.inventory??null,checked_at:checkedAt});
 const closePeriod=financialAutomationClosePeriod(range),history=await closingHistory(env,scope,range,options),versionMap=new Map(history.items.map(item=>[item.close_id+':'+item.version,publicClose(item)]));let accrualClosed=null;
 for(const basis of ['ACCRUAL','BANK_CASH']){const closed=await readFinancialClose(env,{scope,period:closePeriod,basis},options);for(const item of [closed.current,closed.closed].filter(Boolean))versionMap.set(item.close_id+':'+item.version,publicClose(item));if(basis==='ACCRUAL')accrualClosed=closed.closed;}
 const versions=[...versionMap.values()];
 let displayed=projection,projectionSource={kind:'CURRENT_JOURNAL',ledger_revision:ledger.ledger_revision},pending=[...projection.pending,...(saved?.pending??[]),...(!ledger.complete?['FINANCIAL_LEDGER_PAGINATION_INCOMPLETE']:[]),...(!history.complete?['FINANCIAL_CLOSE_HISTORY_LIMIT']:[])];
 if(job?.status==='RETRY_WAIT')pending.push('FINANCIAL_AUTOMATION_COLLECTION_RETRY_REQUIRED',...(job.pending??[]));
 if(accrualClosed?.snapshot?.projection){displayed=thawProjection(accrualClosed.snapshot.projection);projectionSource={kind:'CLOSED_VERSION',close_id:accrualClosed.close_id,version:accrualClosed.version,hash:accrualClosed.snapshot_hash};if(financialCanonicalJSON(displayed.events)!==financialCanonicalJSON(projection.events)||financialCanonicalJSON(displayed.policy)!==financialCanonicalJSON(projection.policy))pending.push('FINANCIAL_LATE_EVENTS_REQUIRE_RECTIFICATION');}
 displayed.close_readiness={...displayed.close_readiness,RESULT:displayed.close_readiness.ACCRUAL,CASH:displayed.close_readiness.BANK_CASH};
 let legacy=null;if(typeof options.services?.readFinancialLegacyEstimate==='function'){try{legacy=await options.services.readFinancialLegacyEstimate({scope,month,now:options.now??Date.now});}catch{pending.push('LEGACY_ESTIMATE_UNAVAILABLE');}}
 await assertFinancialAccess(env,scope,options);
 return {schema:'financial_automation_workspace_v1',month,scope,period:range,observed_at:observedAt,projection:displayed,projection_source:projectionSource,capabilities:saved?.capabilities??financialAutomationUnknownCapabilities(),coverage:displayed.coverage,pending:[...new Set(pending)].sort(),closings:versions.sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.version-a.version),permissions:options.permissions??{financial_read:true,financial_export:true,financial_configure:false,financial_close:false,financial_sync:false},configuration:{revision:config.revision,policy:config.payload?.policy??null,proposed_policy:await proposal(scope,month,config,options),auto_close:config.payload?.auto_close??false,reserve:config.payload?.reserve??null,can_configure:options.permissions?.financial_configure===true},collection:job?{state:job.status,phase:job.phase??null,last_attempt_at:job.finished_at??job.started_at,retry_at:job.next_run_at,pending:job.pending??[]}:null,source_quality:{initialized:source.revision>0,checked_at:saved?.checked_at??null,cutoff_at:saved?.cutoff_at??null,ingestion_complete:saved?.ingestion?.complete===true,last_complete_available:!!saved?.last_complete,ledger_revision:ledger.ledger_revision,ledger_complete:ledger.complete},source_observations:saved?.observations??null,legacy_estimate:legacy};
}
export async function buildFinancialAutomationCloseSnapshot(env,{scope,period,basis},options={}){
 const range=modelPeriod(period);
 // Building a correction always uses current immutable facts, not the display
 // copy of an existing closed version.
 const config=await configuration(env,scope,options),source=await readFinancialAutomationState(env,{scope,kind:financialAutomationSourceKind(range)},options),ledger=await readFinancialAutomationLedger(env,scope,{...options,period:range}),policy=policyForPeriod(config,range),stamp=source.payload?.checked_at??financialClock(options);
 const checkedAt=ledger.events.reduce((at,event)=>event.observed_at>at?event.observed_at:at,stamp),coverage=source.payload?.coverage??financialAutomationUnknownCoverage(scope);
 const projection=projectFinancialAccounting({scope,period:range,policy,events:ledger.events,coverage:ledger.complete?coverage:coverage.map(row=>({...row,state:row.state==='COMPLETE'?'PARTIAL':row.state,pending:[...(row.pending??[]),'FINANCIAL_LEDGER_PAGINATION_INCOMPLETE']})),balances:source.payload?.balances??[],obligations:source.payload?.obligations??[],reserve:config.payload?.reserve??source.payload?.reserve??null,inventory:source.payload?.inventory??null,checked_at:checkedAt});
 const readiness=projection.close_readiness[basis];if(!readiness)fail('BASIS_INVALID');
 const gates={...readiness.gates};if(options.requireAutomaticApproval===true&&config.payload?.auto_close!==true)gates.policy_complete=false;
 return {ledger_revision:ledger.ledger_revision,snapshot:{scope,period,basis,projection:buildFinancialAccountingSnapshot(projection),configuration_revision:config.revision,source_revision:source.revision,source_cutoff_at:source.payload?.cutoff_at??null,source_hash:source.hash,policy_ref:policy?{policy_id:policy.policy_id,revision:policy.revision}:null,automation_state_fences:[{kind:'CONFIG',revision:config.revision},{kind:financialAutomationSourceKind(range),revision:source.revision},...(Number.isSafeInteger(source.payload?.observations?.inventory?.inventory_revision)?[{kind:'INVENTORY',revision:source.payload.observations.inventory.inventory_revision}]:[])]},gates};
}
export async function mutateFinancialAutomationClose(env,input,options={}){
 await ensureFinancialAutomationSchema(env,input.scope,options);
 return mutateFinancialClose(env,input,{...options,buildSnapshot:selection=>buildFinancialAutomationCloseSnapshot(env,selection,options)});
}
async function bodyOf(request){
 if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))fail('CONTENT_TYPE_INVALID');
 const reader=request.body?.getReader();if(!reader)fail('REQUEST_INVALID');const chunks=[];let size=0;try{for(;;){const row=await reader.read();if(row.done)break;size+=row.value.byteLength;if(size>16384)fail('BODY_TOO_LARGE',413);chunks.push(row.value);}}finally{try{void reader.cancel().catch(()=>{});reader.releaseLock();}catch{}}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));financialCanonicalJSON(value);}catch{fail('REQUEST_INVALID');}return value;
}
async function csrf(request,current){const url=new URL(request.url),supplied=request.headers.get('x-csrf-token')??'',expected=current?.csrf;if(request.headers.get('origin')!==url.origin||typeof expected!=='string'||!expected||supplied.length!==expected.length)fail('CSRF_REJECTED',403);let delta=0;for(let i=0;i<expected.length;i++)delta|=expected.charCodeAt(i)^supplied.charCodeAt(i);if(delta!==0)fail('CSRF_REJECTED',403);}
export async function handleFinancialAutomation(request,env,{current,services={},assertAuthorized,now=Date.now}={}){
 const url=new URL(request.url);if(url.pathname!==path&&!url.pathname.startsWith(path+'/'))return null;
 try{
  const scope=financialAutomationScope(env,current),permissions=financialAutomationPermissions(env,current),actor=env.COMMERCIAL_CONTEXT?.userId??'legacy-owner',options={current,services,assertAuthorized,now,actor,permissions};
  if(!permissions.financial_read)fail('FORBIDDEN',403);await assertFinancialAccess(env,scope,options);
  if(url.pathname===path&&request.method==='GET'){const entries=[...url.searchParams];if(entries.length!==1||entries[0][0]!=='month')fail('REQUEST_INVALID');return json(await readFinancialAutomationWorkspace(env,{scope,month:entries[0][1]},options));}
  if(url.pathname===path+'/inventory'&&request.method==='GET'){
   const entries=[...url.searchParams];if(entries.length!==1||entries[0][0]!=='month')fail('REQUEST_INVALID');const month=selectedMonth(entries[0][1],financialClock(options));
   if(env.COMMERCIAL_CONTEXT)for(const capability of ['production.read','orders.read'])assertCommercialCapability(env.COMMERCIAL_CONTEXT,capability);
   return json(await readFinancialInventoryWorkspace(env,{scope,month},{...options,listOriginalItems:services.listFinancialOriginalItems?(command=>services.listFinancialOriginalItems({...command,now:options.now??Date.now})):services.listOriginalItems,includeReturnCandidates:permissions.financial_inventory_returns_read}));
  }
  if(request.method!=='POST')fail('METHOD_NOT_ALLOWED',405);if(url.search)fail('REQUEST_INVALID');if(!permissions.financial_configure)fail('FORBIDDEN',403);await csrf(request,current);const body=await bodyOf(request),stamp=financialClock(options);
  if(url.pathname===path+'/inventory'){
   if(!exact(body,['operation','expected_revision','request_id','confirmed','reason','selection']))fail('REQUEST_INVALID');
   if(env.COMMERCIAL_CONTEXT)for(const capability of ['production.read','orders.read','costs.write',...(body.operation==='value-return'?['returns.read']:[])])assertCommercialCapability(env.COMMERCIAL_CONTEXT,capability);
   return json(await mutateFinancialInventory(env,{scope,...body},{...options,resolveOriginalItem:services.resolveFinancialOriginalItem??services.resolveOriginalItem,includeReturnCandidates:permissions.financial_inventory_returns_read}));
  }
  if(url.pathname===path+'/policy'){
   const keys=['month','expected_revision','request_id','effective_from','financial_week','auto_close','reason','confirmed'];if(!exact(body,[...keys,...(Object.hasOwn(body??{},'reserve_cents')?['reserve_cents']:[]),...(Object.hasOwn(body??{},'tax_declaration')?['tax_declaration']:[])])||body.confirmed!==true||!integer(body.expected_revision)||!uuid(body.request_id)||typeof body.auto_close!=='boolean'||!reason(body.reason)||!['CIVIL_FRIDAY_THURSDAY','CIVIL_MONDAY_SUNDAY'].includes(body.financial_week)||Object.hasOwn(body,'reserve_cents')&&body.reserve_cents!==null&&!integer(body.reserve_cents))fail('REQUEST_INVALID');
   const month=selectedMonth(body.month,stamp),config=await configuration(env,scope,options),draft=await proposal(scope,month,config,options);
   let tax=draft.tax;if(Object.hasOwn(body,'tax_declaration')){const declaration=body.tax_declaration;if(!exact(declaration,['regime','mode','monthly_cents'])||!['FIXED_MONTHLY','EXPLICIT_EVENTS','UNCONFIGURED'].includes(declaration.mode))fail('TAX_DECLARATION_INVALID');
    if(declaration.mode==='UNCONFIGURED'){if(declaration.regime!==null||declaration.monthly_cents!==null)fail('TAX_DECLARATION_INVALID');tax={regime:null,mode:'UNCONFIGURED',monthly_cents:null,recognition:null,source_ref:null,revision:0};}
    else{if(typeof declaration.regime!=='string'||!declaration.regime.trim()||declaration.regime!==declaration.regime.trim()||declaration.regime.length>40||/[\u0000-\u001f\u007f]/.test(declaration.regime)||declaration.mode==='FIXED_MONTHLY'&&!integer(declaration.monthly_cents)||declaration.mode==='EXPLICIT_EVENTS'&&declaration.monthly_cents!==null)fail('TAX_DECLARATION_INVALID');tax={...declaration,recognition:declaration.mode==='FIXED_MONTHLY'?'MONTH_END':'SOURCE_COMPETENCE',source_ref:'policy-tax-'+body.request_id,revision:(config.payload?.policy?.tax?.revision??0)+1};}
   }
   const policy=validateFinancialAccountingPolicy({...draft,tax,effective_from:body.effective_from,financial_week:body.financial_week,approval:{state:'APPROVED',actor_ref:actor,at:stamp,evidence_ref:'policy-'+body.request_id}},{scope});
   const reserve=Object.hasOwn(body,'reserve_cents')?(body.reserve_cents===null?null:{scope,amount_cents:body.reserve_cents,confirmed:true,evidence_ref:'reserve-'+body.request_id}):config.payload?.reserve??null;
   const result=await writeFinancialAutomationState(env,{scope,kind:'CONFIG',payload:{schema:'financial_automation_configuration_v1',policy,auto_close:body.auto_close,reserve,approval_reason:body.reason},expected_revision:body.expected_revision,request_id:body.request_id},{...options,requestIdentity:{operation:'approve-policy',body}});return json({schema:'financial_automation_configuration_mutation_v1',scope,revision:result.revision,policy:result.payload.policy,auto_close:result.payload.auto_close,reserve:result.payload.reserve,replayed:result.replayed});
  }
  if(url.pathname===path+'/sync'){
   if(!exact(body,['month','request_id','confirmed'])||!uuid(body.request_id)||body.confirmed!==true)fail('REQUEST_INVALID');const month=selectedMonth(body.month,stamp),config=await configuration(env,scope,options),period=financialAccountingPeriod({kind:'MONTH',anchor:month});return json(await ingestFinancialAutomationSources(env,{scope,period},{...options,policy:policyForPeriod(config,period)}));
  }
  if(url.pathname===path+'/close'){
   if(!exact(body,['operation','kind','anchor','basis','close_id','expected_revision','request_id','reason','confirmed'])||!['prepare','finalize','rectify'].includes(body.operation)||!['MONTH','CIVIL_WEEK'].includes(body.kind)||!['ACCRUAL','BANK_CASH'].includes(body.basis)||body.close_id!==null&&!hash(body.close_id)||!integer(body.expected_revision)||!uuid(body.request_id)||!reason(body.reason)||body.confirmed!==true)fail('REQUEST_INVALID');
   const config=await configuration(env,scope,options),period=financialAccountingPeriod({kind:body.kind,anchor:body.anchor,week_starts_on:config.payload?.policy?.financial_week==='CIVIL_MONDAY_SUNDAY'?'MONDAY':'FRIDAY'}),selected=financialAutomationClosePeriod(period),existing=await readFinancialClose(env,{scope,period:selected,basis:body.basis},options);if(body.close_id!==null&&body.close_id!==existing.close_id)fail('CLOSE_SCOPE_REJECTED',403);
   const result=await mutateFinancialAutomationClose(env,{scope,period:selected,basis:body.basis,action:body.operation,expected_version:body.expected_revision,request_id:body.request_id,reason:body.reason},options);return json({...result,summary:publicClose(result)});
  }
  fail('NOT_FOUND',404);
 }catch(error){const status=Number.isInteger(error?.status)&&error.status>=400&&error.status<=599?error.status:503,code=typeof error?.code==='string'&&/^FINANCIAL_[A-Z0-9_]{1,120}$/.test(error.code)?error.code:'FINANCIAL_AUTOMATION_UNAVAILABLE';return json({schema:'financial_automation_error_v1',error:code},status);}
}
