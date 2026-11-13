import {FinancialLedgerError,normalizeFinancialScope,financialDigest} from './financial-event-ledger.mjs';
import {assertFinancialAccess,financialClock,financialDatabase,financialScopeKey} from './financial-event-store.mjs';
import {financialAccountingPeriod,financialAccountingDuePeriods,projectFinancialAccountingPeriod} from './financial-accounting-schedule.mjs';
import {readFinancialClose} from './financial-close-store.mjs';
import {readFinancialAutomationState,writeFinancialAutomationState,ensureFinancialAutomationSchema} from './financial-automation-store.mjs';
import {financialAutomationRequestId,ingestFinancialAutomationSources} from './financial-automation-bridge.mjs';
import {financialAutomationScope,financialAutomationClosePeriod,readFinancialAutomationConfiguration,financialAutomationPolicyForPeriod,mutateFinancialAutomationClose} from './financial-automation-service.mjs';

const fail=(code,status=400)=>{throw new FinancialLedgerError('FINANCIAL_AUTOMATION_JOB_'+code,status);};
const addSeconds=(stamp,seconds)=>new Date(Date.parse(stamp)+seconds*1000).toISOString();
const jobKind=async period=>'JOB:'+await financialDigest([period.kind,period.calendar,period.start_at,period.end_at]);
async function queued(env,scope,stamp,options,excludedKind){
 const db=financialDatabase(env),key=await financialScopeKey(scope),rows=(await db.prepare("SELECT h.kind FROM financial_automation_heads h JOIN financial_automation_revisions r ON r.scope_key=h.scope_key AND r.kind=h.kind AND r.version=h.version WHERE h.scope_key=? AND h.kind LIKE 'JOB:%' AND h.kind<>? AND json_extract(r.payload,'$.next_run_at')<=? AND json_extract(r.payload,'$.status')<>'COMPLETE' ORDER BY json_extract(r.payload,'$.next_run_at'),r.created_at,h.kind LIMIT 8").bind(key,excludedKind,stamp).all()).results;
 if(!Array.isArray(rows))fail('STORAGE_INVALID',503);for(const row of rows){const saved=await readFinancialAutomationState(env,{scope,kind:row.kind},options),payload=saved.payload;if(payload?.schema==='financial_automation_job_v1'&&projectFinancialAccountingPeriod(payload.period))return payload.period;}return null;
}
async function recordTarget(env,scope,period,options){
 const kind=await jobKind(period),state=await readFinancialAutomationState(env,{scope,kind},options);return {kind,state,period};
}
async function writeJob(env,scope,kind,payload,revision,options){return writeFinancialAutomationState(env,{scope,kind,payload,expected_revision:revision,request_id:await financialAutomationRequestId(['automation-job-state-v1',scope,kind,revision,payload])},options);}

// One scope and one bounded source page per job. Old unfinished targets remain
// durable rows and receive a reserved fair turn; a clock is never a close gate.
export async function runFinancialAutomationJobs(env,{current=null,scope=null,services={},assertAuthorized,now=Date.now,maximum=1}={}){
 if(!Number.isSafeInteger(maximum)||maximum!==1)fail('BUDGET_INVALID');
 const selected=scope===null?financialAutomationScope(env,current):normalizeFinancialScope(scope),options={services,assertAuthorized,now,actor:env.COMMERCIAL_CONTEXT?.userId??'financial-automation-job'};
 await assertFinancialAccess(env,selected,options,'write');await ensureFinancialAutomationSchema(env,selected,options);
 const stamp=financialClock(options),config=await readFinancialAutomationConfiguration(env,selected,options),weekStart=config.payload?.policy?.financial_week==='CIVIL_MONDAY_SUNDAY'?'MONDAY':'FRIDAY',due=financialAccountingDuePeriods(stamp,{week_starts_on:weekStart}),month=financialAccountingPeriod({kind:'MONTH',anchor:stamp}),turn=await readFinancialAutomationState(env,{scope:selected,kind:'JOB_TURN'},options),counter=turn.payload?.counter??0;
 if(!Number.isSafeInteger(counter)||counter<0)fail('STATE_INVALID',503);
 const primary=await recordTarget(env,selected,month,options),bootstrap=primary.state.payload?.bootstrap_completed!==true||primary.state.payload?.configuration_revision!==config.revision;
 let target;if(bootstrap&&counter%8!==7)target=month;else if(bootstrap){const historic=Math.floor(counter/8)%3;target=historic===1?due.monthly:historic===2?due.weekly:await queued(env,selected,stamp,options,primary.kind)??due.monthly;}else target=counter%4===0?month:counter%4===2?due.monthly:counter%4===3?due.weekly:await queued(env,selected,stamp,options,primary.kind)??due.weekly;
 const targets=[];for(const period of [target,...(maximum===2?[due.monthly]:[])])if(!targets.some(p=>p.id===period.id))targets.push(period);
 try{await writeFinancialAutomationState(env,{scope:selected,kind:'JOB_TURN',payload:{schema:'financial_automation_turn_v1',counter:counter===2147483644?0:counter+1,checked_at:stamp},expected_revision:turn.revision,request_id:await financialAutomationRequestId(['automation-turn-v1',selected,turn.revision,counter])},options);}catch(error){if(error?.status===409)return {schema:'financial_automation_job_run_v1',scope:selected,status:'CONCURRENT_TURN',results:[],checked_at:stamp};throw error;}
 const results=[];
 for(const period of targets){
  const entry=period.id===month.id?primary:await recordTarget(env,selected,period,options),prior=entry.state.payload;
  if(prior?.status==='RUNNING'&&prior.lease_expires_at>stamp||prior?.next_run_at>stamp){results.push({period:period.id,status:'NOT_DUE'});continue;}
  const lease=crypto.randomUUID(),job={schema:'financial_automation_job_v1',period,status:'RUNNING',lease,lease_expires_at:addSeconds(stamp,120),next_run_at:stamp,started_at:stamp,finished_at:null,close_refs:prior?.close_refs??[],phase:prior?.phase??'COLLECT',source_revision:prior?.source_revision??null,configuration_revision:config.revision,bootstrap_completed:prior?.bootstrap_completed===true&&prior?.configuration_revision===config.revision,pending:[]};
  let claim;try{claim=await writeJob(env,selected,entry.kind,job,entry.state.revision,options);}catch(error){if(error?.status===409){results.push({period:period.id,status:'CONCURRENT_JOB'});continue;}throw error;}
  // The claim CAS serializes this target. Every journal, source and close
  // mutation has its own atomic revision guard; the final job write guards
  // claim.revision. Authorization is rechecked by each store before/after IO.
  const jobOptions=options;
  try{
   let phase=job.phase,refs=[...job.close_refs],pending=[],ingested=0,sourceRevision=job.source_revision,status='PREPARING';
   // A source page OR one close mutation per invocation, never both. This
   // keeps the actual D1 subrequests/SQL below the platform worker budget.
   if(phase==='COLLECT'){
    const policy=financialAutomationPolicyForPeriod(config,period),sync=await ingestFinancialAutomationSources(env,{scope:selected,period,maximum_events:100},{...jobOptions,policy});
    ingested=sync.ingested;sourceRevision=sync.source_revision;pending.push(...sync.pending);phase=sync.complete?'PREPARE_ACCRUAL':'COLLECT';status=sync.complete?'COLLECTED':'COLLECTING';
   }else{
    const basis=phase.endsWith('BANK_CASH')?'BANK_CASH':'ACCRUAL',finalize=phase.startsWith('FINALIZE_'),closePeriod=financialAutomationClosePeriod(period);
    const previous=await readFinancialClose(env,{scope:selected,period:closePeriod,basis},jobOptions);
    if(finalize&&(config.payload?.auto_close!==true||previous.current?.status!=='PRONTO')){phase='PREPARE_'+basis;pending.push('AUTOMATIC_CLOSE_GATES_CHANGED');}
    else{
     const action=finalize?'finalize':'prepare',result=await mutateFinancialAutomationClose(env,{scope:selected,period:closePeriod,basis,action,expected_version:previous.current?.version??0,request_id:await financialAutomationRequestId(['auto-'+action+'-v2',selected,period.id,basis,previous.current?.version??0,sourceRevision,config.revision]),reason:finalize?'APPROVED_AUTOMATIC_CLOSE_WITH_VERIFIED_GATES':'AUTOMATIC_PERIOD_PREPARATION'},{...jobOptions,requireAutomaticApproval:finalize});
     const closed=result.close;refs=refs.filter(row=>row.basis!==basis);refs.push({basis,close_id:closed.close_id,version:closed.version,status:closed.status});
     if(result.needs_rectification)pending.push('FINANCIAL_LATE_EVENTS_REQUIRE_RECTIFICATION');
     if(!['FECHADO','RETIFICADO'].includes(closed.status))pending.push(...(closed.snapshot.projection?.close_readiness?.[basis]?.pending??[]));
     if(!finalize&&closed.status==='PRONTO'&&config.payload?.auto_close===true)phase='FINALIZE_'+basis;
     else if(basis==='ACCRUAL')phase='PREPARE_BANK_CASH';else phase='COLLECT';
    }
    if(phase==='COLLECT')status=refs.length===2&&refs.every(row=>['FECHADO','RETIFICADO'].includes(row.status))&&!pending.includes('FINANCIAL_LATE_EVENTS_REQUIRE_RECTIFICATION')?'COMPLETE':'PROVISIONAL';
   }
   const done=financialClock(options),payload={...job,phase,source_revision:sourceRevision,status,bootstrap_completed:job.bootstrap_completed||['COMPLETE','PROVISIONAL'].includes(status),lease_expires_at:done,next_run_at:addSeconds(done,status==='COMPLETE'?86400:status==='PROVISIONAL'?300:60),finished_at:done,close_refs:refs,pending:[...new Set(pending)].sort()};
   await writeJob(env,selected,entry.kind,payload,claim.revision,options);results.push({period:period.id,phase,status:payload.status,close_refs:refs,pending:payload.pending,ingested,remaining:status==='COLLECTING'?null:0});
  }catch(error){
   if(error?.status===403)throw error;const errorCode=typeof error?.code==='string'&&/^FINANCIAL_[A-Z0-9_]+$/.test(error.code)?error.code:'FINANCIAL_AUTOMATION_JOB_UNAVAILABLE',done=financialClock(options),payload={...job,status:'RETRY_WAIT',lease_expires_at:done,next_run_at:addSeconds(done,300),finished_at:done,pending:[errorCode]};
   try{await writeJob(env,selected,entry.kind,payload,claim.revision,options);}catch(conflict){if(conflict?.status!==409)throw conflict;}results.push({period:period.id,status:'RETRY_WAIT',pending:[errorCode]});
  }
 }
 await assertFinancialAccess(env,selected,options,'write');return {schema:'financial_automation_job_run_v1',scope:selected,status:'PROCESSED',checked_at:stamp,results};
}
