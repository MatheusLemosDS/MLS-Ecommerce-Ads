import {FinancialLedgerError,normalizeFinancialScope,sameFinancialScope,validateFinancialEvent,createFinancialEvent,financialCanonicalJSON,financialDigest,financialEventContentHash,financialEventIdentity} from './financial-event-ledger.mjs';
import {assertFinancialAccess,financialClock,financialScopeKey,financialDatabase,appendFinancialEvents,readFinancialEvents} from './financial-event-store.mjs';
import {FINANCIAL_ACCOUNTING_COVERAGE_FAMILIES} from './financial-accounting-projection.mjs';
import {readFinancialAutomationState,writeFinancialAutomationState} from './financial-automation-store.mjs';
import {financialAccountingTaxRecognitions} from './financial-accounting-policy.mjs';
import {financialAccountingPeriod,financialAccountingLocalDate} from './financial-accounting-schedule.mjs';

const fail=(code,status=400)=>{throw new FinancialLedgerError('FINANCIAL_AUTOMATION_'+code,status);};
const code=v=>typeof v==='string'&&/^[A-Z][A-Z0-9_]{1,100}$/.test(v),iso=v=>typeof v==='string'&&new Date(v).toISOString()===v;
export async function financialAutomationRequestId(value){const h=await financialDigest(value);return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32);}
export function financialAutomationSourceKind(period){return 'SOURCES:'+period.kind+':'+period.start_date+':'+period.calendar;}
export function financialAutomationUnknownCoverage(scope){return FINANCIAL_ACCOUNTING_COVERAGE_FAMILIES.map(family=>({family,scope:{...scope},state:'UNKNOWN',start_at:null,end_at:null,timezone_confirmed:false,comparison:'NOT_COMPARED',account_refs:[],pending:[family+'_SOURCE_NOT_OBSERVED']}));}
export function financialAutomationUnknownCapabilities(){return ['ORDERS','ESCROW','INCOME_OVERVIEW','PENDING','RELEASES','RETURNS','RETURN_DISCOVERY','WALLET','PAYOUTS','BANK'].map(source=>({source,state:'UNKNOWN',reason:'CAPABILITY_NOT_VERIFIED',collection_allowed:false,checked_at:null}));}
export async function readFinancialAutomationLedger(env,scope,options={}){
 if(options.period){
  await assertFinancialAccess(env,scope,options);const db=financialDatabase(env),key=await financialScopeKey(scope),period=options.period;
  if(!await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='financial_ledger_state'").first())return {events:[],ledger_revision:0,complete:true,next_cursor:null};
  const result=await db.batch([db.prepare('SELECT revision,scope_payload FROM financial_ledger_state WHERE scope_key=?').bind(key),db.prepare("SELECT r.payload,r.payload_hash,r.content_hash,r.version FROM financial_event_revisions r JOIN financial_event_heads h ON h.scope_key=r.scope_key AND h.event_id=r.event_id AND h.version=r.version WHERE r.scope_key=? AND ((json_extract(r.payload,'$.competence_at')>=? AND json_extract(r.payload,'$.competence_at')<?) OR (json_extract(r.payload,'$.settlement_at')>=? AND json_extract(r.payload,'$.settlement_at')<?) OR (json_extract(r.payload,'$.event_at')>=? AND json_extract(r.payload,'$.event_at')<?)) ORDER BY r.event_id LIMIT 2001").bind(key,period.start_at,period.end_at,period.start_at,period.end_at,period.start_at,period.end_at),db.prepare('SELECT revision,scope_payload FROM financial_ledger_state WHERE scope_key=?').bind(key)]);
  if(!Array.isArray(result)||result.length!==3||result.some(r=>!Array.isArray(r.results))||result[0].results.length>1||result[2].results.length>1)fail('STORAGE_INVALID',503);
  const state=result[0].results[0],after=result[2].results[0];if((state?.revision??0)!==(after?.revision??0)||state&&state.scope_payload!==financialCanonicalJSON(scope))fail('SOURCE_CHANGED',409);
  const events=[];for(const row of result[1].results.slice(0,2000)){let event;try{event=validateFinancialEvent(JSON.parse(row.payload),{scope});}catch{fail('STORAGE_INVALID',503);}if(event.version!==row.version||await financialDigest(event)!==row.payload_hash||await financialEventContentHash(event)!==row.content_hash||await financialEventIdentity(scope,event.source)!==event.event_id)fail('STORAGE_INVALID',503);events.push(event);}
  await assertFinancialAccess(env,scope,options);return {events,ledger_revision:state?.revision??0,complete:result[1].results.length<=2000,next_cursor:result[1].results.length>2000?events.at(-1).event_id:null};
 }
 let cursor=null,revision,events=[],complete=false;
 for(let page=0;page<4;page++){
  const value=await readFinancialEvents(env,{scope,limit:500,...(cursor?{after_event_id:cursor}:{}),...(revision===undefined?{}:{expected_revision:revision})},options);
  revision=value.ledger_revision;events.push(...value.events);cursor=value.next_cursor;if(value.complete){complete=true;break;}
 }
 return {events,ledger_revision:revision??0,complete,next_cursor:cursor};
}
function normalizeSources(value,scope,period,stamp,previous=null){
 if(value===null||typeof value!=='object'||Array.isArray(value))fail('SOURCE_INVALID',503);const metadata={...value};delete metadata.events;financialCanonicalJSON(metadata);
 const events=value.events??[];if(!Array.isArray(events)||events.length>10000)fail('SOURCE_INVALID',503);
 const seen=new Set(),normalized=events.map(input=>{const event=validateFinancialEvent(input,{scope});if(seen.has(event.event_id)||event.observed_at>stamp)fail('SOURCE_INVALID',503);seen.add(event.event_id);return event;});
 const supplied=value.coverage??[];if(!Array.isArray(supplied)||supplied.length>32)fail('SOURCE_INVALID',503);
 const coverage=financialAutomationUnknownCoverage(scope),families=new Set();
 for(const row of supplied){if(!row||!FINANCIAL_ACCOUNTING_COVERAGE_FAMILIES.includes(row.family)||families.has(row.family)||!sameFinancialScope(row.scope,scope))fail('SOURCE_SCOPE_INVALID',403);families.add(row.family);coverage[coverage.findIndex(x=>x.family===row.family)]=JSON.parse(financialCanonicalJSON(row));}
 const pending=value.pending??[];if(!Array.isArray(pending)||pending.some(x=>!code(x)))fail('SOURCE_INVALID',503);
 const capabilities=value.capabilities??previous?.capabilities??financialAutomationUnknownCapabilities();if(!Array.isArray(capabilities)||capabilities.length>32||capabilities.some(x=>!x||!code(x.source)||!['AVAILABLE','NO_PERMISSION','UNSUPPORTED','PARTIAL','UNKNOWN'].includes(x.state)||typeof x.collection_allowed!=='boolean'||x.state!=='AVAILABLE'&&x.collection_allowed))fail('CAPABILITY_INVALID',503);
 const cutoff=value.cutoff_at??null;if(cutoff!==null&&(!iso(cutoff)||cutoff>stamp))fail('SOURCE_CUTOFF_INVALID',503);
 if(value.has_more!==undefined&&typeof value.has_more!=='boolean')fail('SOURCE_INVALID',503);
 const checkpoint=value.checkpoint??null;if(new TextEncoder().encode(financialCanonicalJSON(checkpoint)).byteLength>8192)fail('SOURCE_CHECKPOINT_INVALID',503);
 return {events:normalized,coverage,balances:value.balances??previous?.balances??[],obligations:value.obligations??previous?.obligations??[],reserve:value.reserve??previous?.reserve??null,inventory:value.inventory??previous?.inventory??null,observations:value.observations??null,capabilities:JSON.parse(financialCanonicalJSON(capabilities)),pending:[...new Set(pending)],cutoff_at:cutoff,checkpoint,has_more:value.has_more!==false};
}
async function addApprovedTax(sources,scope,period,policy,stamp){
 if(!policy||policy.approval?.state!=='APPROVED'||policy.tax?.mode!=='FIXED_MONTHLY')return;
 const expected=financialAccountingTaxRecognitions(policy,period,{scope});if(expected.state!=='READY')return;
 let allObserved=true;const policyHash=await financialDigest(policy);
 for(const row of expected.events){
  const month=financialAccountingPeriod({kind:'MONTH',anchor:row.month}),at=new Date(Date.parse(month.end_at)-1).toISOString();
  if(at>stamp){allObserved=false;continue;}
  if(sources.events.some(event=>event.quality==='CONFIRMED'&&event.competence_at&&financialAccountingLocalDate(event.competence_at).slice(0,7)===row.month&&event.postings.some(p=>p.account==='TAX_EXPENSE')))continue;
  sources.events.push(await createFinancialEvent({scope,event_type:'TAX_RECOGNIZED',event_at:at,competence_at:at,settlement_at:null,source_updated_at:policy.approval.at,observed_at:stamp,source:{provider:'SYSTEM',family:'APPROVED_TAX_MONTH',native_id:policy.policy_id+':'+row.month,identity:'NATIVE_ID',identity_key:null},evidence:[{kind:'APPROVED_TAX_POLICY',reference:policy.policy_id+':r'+policy.revision,sha256:policyHash}],causal_event_id:null,quality:'CONFIRMED',postings:[{account:'TAX_EXPENSE',account_ref:'tax-obligation',amount_cents:row.amount_cents},{account:'TAX_PAYABLE',account_ref:'tax-obligation',amount_cents:row.amount_cents===0?0:-row.amount_cents}]}));
 }
 const index=sources.coverage.findIndex(row=>row.family==='TAX');if(index>=0&&allObserved)sources.coverage[index]={family:'TAX',scope:{...scope},state:'COMPLETE',start_at:period.start_at,end_at:period.end_at,timezone_confirmed:true,comparison:'MATCHED',account_refs:['tax-obligation'],pending:[]};
}

// Only trusted normalized source callbacks can supply journal facts. This
// boundary neither guesses journal entries from a total nor calls a provider.
export async function ingestFinancialAutomationSources(env,{scope,period,maximum_events=100},options={}){
 scope=normalizeFinancialScope(scope);await assertFinancialAccess(env,scope,options,'write');
 if(!Number.isSafeInteger(maximum_events)||maximum_events<1||maximum_events>100)fail('INGESTION_BUDGET_INVALID');
 const kind=financialAutomationSourceKind(period),previous=await readFinancialAutomationState(env,{scope,kind},options);
 if(typeof options.services?.readFinancialAutomationSources!=='function')return {schema:'financial_automation_sync_v1',scope,ingested:0,replayed:0,complete:false,pending:['FINANCIAL_SOURCE_ADAPTER_NOT_CONFIGURED'],source_revision:previous.revision};
 const raw=await options.services.readFinancialAutomationSources({scope,period,policy:options.policy??null,now:options.now??Date.now,assertAuthorized:options.assertAuthorized,actor:options.actor,mode:'sync',checkpoint:previous.payload?.checkpoint??null});await assertFinancialAccess(env,scope,options,'write');
 // Sources can observe the clock after asynchronous cache reads. Validate them
 // against collection completion while retaining strict rejection of the future.
 const stamp=financialClock(options);
 const sources=normalizeSources(raw,scope,period,stamp,previous.payload);await addApprovedTax(sources,scope,period,options.policy??null,stamp);
 const fingerprints=[];for(const event of sources.events)fingerprints.push([event.event_id,await financialEventContentHash(event)]);
 const pageFingerprint=await financialDigest(fingerprints),oldIngestion=previous.payload?.ingestion,offset=oldIngestion?.page_fingerprint===pageFingerprint&&Number.isSafeInteger(oldIngestion.pending_offset)?oldIngestion.pending_offset:0;
 if(offset<0||offset>sources.events.length)fail('SOURCE_CHECKPOINT_INVALID',503);
 const ledger=await readFinancialEvents(env,{scope,limit:1},options),batch=sources.events.slice(offset,offset+maximum_events),remaining=sources.events.length-offset-batch.length;
 let revision=ledger.ledger_revision,ingested=0,replayed=0;
 if(batch.length){const selected=fingerprints.slice(offset,offset+batch.length).sort((a,b)=>a[0].localeCompare(b[0]));const result=await appendFinancialEvents(env,{scope,events:batch,expected_revision:revision,request_id:await financialAutomationRequestId(['source-batch-v1',scope,selected])},options);revision=result.ledger_revision;ingested=result.replayed?0:result.changed_count;replayed=result.replayed?batch.length:result.unchanged_count;}
 const pageComplete=remaining===0,complete=pageComplete&&!sources.has_more,pending=[...sources.pending,...(remaining?['FINANCIAL_EVENT_INGESTION_INCOMPLETE']:[]),...(sources.has_more?['FINANCIAL_SOURCE_MORE_PAGES']:[])];
 const coverage=sources.coverage.map(row=>complete?row:{...row,state:row.state==='COMPLETE'?'PARTIAL':row.state,pending:[...new Set([...(row.pending??[]),'FINANCIAL_EVENT_INGESTION_INCOMPLETE'])]});
 const material={schema:'financial_automation_source_snapshot_v1',scope,period,coverage,balances:sources.balances,obligations:sources.obligations,reserve:sources.reserve,inventory:sources.inventory,observations:sources.observations,capabilities:sources.capabilities,pending:[...new Set(pending)],cutoff_at:sources.cutoff_at,checkpoint:pageComplete?sources.checkpoint:previous.payload?.checkpoint??null,ingestion:{complete,page_complete:pageComplete,remaining,ledger_revision:revision,pending_offset:pageComplete?0:offset+batch.length,page_fingerprint:pageFingerprint}};
 // Preserve the last complete observation while retaining the new collection
 // status. Neither a failed/partial refresh nor an empty page erases facts.
 const old=previous.payload,lastComplete=complete?null:old?.ingestion?.complete?old:old?.last_complete??null;
 const comparable=old?Object.fromEntries(Object.entries(old).filter(([key])=>!['checked_at','last_complete'].includes(key))):null;
 let source_revision=previous.revision;
 if(!comparable||financialCanonicalJSON(comparable)!==financialCanonicalJSON(material)){
  const payload={...material,checked_at:stamp,...(lastComplete?{last_complete:lastComplete}:{} )};
  const result=await writeFinancialAutomationState(env,{scope,kind,payload,expected_revision:previous.revision,request_id:await financialAutomationRequestId(['source-snapshot-v1',scope,kind,await financialDigest(payload),previous.revision])},options);source_revision=result.revision;
 }
 return {schema:'financial_automation_sync_v1',scope,ingested,replayed,complete,pending:[...new Set(pending)],source_revision,ledger_revision:revision};
}
