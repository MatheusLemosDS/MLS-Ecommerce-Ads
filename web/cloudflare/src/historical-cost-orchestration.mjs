import {syncHistoricalCostEvidence} from './historical-cost-evidence.mjs';
import {runBusinessFinancialAudits} from './financial-audit-orchestration.mjs';
import {runBusinessReconciliation} from './business-reconciliation.mjs';
import {runBusinessIncomeDetail} from './business-income-detail.mjs';

// One cron invocation owns one lane. A published cohort can be audited without
// mixing it with an active import; one auxiliary opportunity follows four due
// Finance invocations at most once per five minutes while that import is busy.
export const BACKGROUND_LANE_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS background_collection_lane_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,next_lane TEXT NOT NULL,auxiliary_index INTEGER NOT NULL,analysis_attempt_day TEXT,lease_token TEXT,lease_until INTEGER)`,
 `INSERT OR IGNORE INTO background_collection_lane_state(id,revision,next_lane,auxiliary_index) VALUES(1,1,'FINANCE',0)`,
 `CREATE TABLE IF NOT EXISTS background_history_fairness_state(id INTEGER PRIMARY KEY CHECK(id=1),finance_since_audit INTEGER NOT NULL CHECK(finance_since_audit BETWEEN 0 AND 4),last_auxiliary_at INTEGER,returns_retry_at INTEGER NOT NULL,reserved_returns_streak INTEGER NOT NULL CHECK(reserved_returns_streak BETWEEN 0 AND 2),next_history_work TEXT NOT NULL CHECK(next_history_work IN('COST','AUDIT')))`,
 `INSERT OR IGNORE INTO background_history_fairness_state(id,finance_since_audit,returns_retry_at,reserved_returns_streak,next_history_work) VALUES(1,0,0,0,'COST')`,
 `CREATE TABLE IF NOT EXISTS background_coverage_bootstrap_attempts(month TEXT PRIMARY KEY,last_attempt_at INTEGER NOT NULL,next_attempt_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS background_pending_income_recovery_attempts(id INTEGER PRIMARY KEY CHECK(id=1),month TEXT NOT NULL,last_attempt_at INTEGER NOT NULL,next_attempt_at INTEGER NOT NULL)`,
];
export class HistoricalCostOrchestrationError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const fail=(code,status=503)=>{throw new HistoricalCostOrchestrationError(code,status);};
const auxiliaries=['HISTORY','CATALOG','REGISTRY','PRODUCTION','COSTS'];
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const identifier=value=>typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value);
const clock=now=>{let value;try{value=now();}catch{fail('BACKGROUND_LANE_CLOCK_INVALID');}if(!integer(value,1,9999999999999))fail('BACKGROUND_LANE_CLOCK_INVALID');return Math.floor(value/1000);};
const database=env=>{if(!env?.ADMIN_DB?.prepare)fail('BACKGROUND_LANE_CONFIGURATION');return env.ADMIN_DB;};
// Identity/due checks only select work. The existing reconciliation runner still
// validates the immutable publication and complete source/report contracts.
const missingReturnsSql=`EXISTS(SELECT 1 FROM business_month_publications p,json_each(p.payload,'$.slots') s WHERE p.month=?
 AND NOT EXISTS(SELECT 1 FROM business_reconciliation_reports r WHERE r.run_id=json_extract(s.value,'$.frame.run_id') AND r.source_revision=json_extract(s.value,'$.frame.revision') AND r.start_date=json_extract(s.value,'$.start_date') AND r.end_date=json_extract(s.value,'$.end_date'))
 AND NOT EXISTS(SELECT 1 FROM business_reconciliation_attempts a WHERE a.run_id=json_extract(s.value,'$.frame.run_id') AND a.source_revision=json_extract(s.value,'$.frame.revision') AND typeof(a.next_attempt_at)='integer' AND a.next_attempt_at BETWEEN 0 AND 9999999999 AND a.next_attempt_at>?))`;

export async function acquireBackgroundLane(env,{month},{now=()=>Date.now(),bootstrapCoverage=false,pendingIncomeRecovery=false}={}){
 const stamp=clock(now);if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||typeof bootstrapCoverage!=='boolean'||typeof pendingIncomeRecovery!=='boolean')fail('BACKGROUND_LANE_REQUEST_INVALID',400);
 const db=database(env),token=crypto.randomUUID(),date=new Date(stamp*1000),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(date),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(date));let row;
 if((bootstrapCoverage||pendingIncomeRecovery)&&month!==today.slice(0,7))fail('BACKGROUND_LANE_REQUEST_INVALID',400);
 const earliest=new Date(month+'-01T12:00:00Z');earliest.setUTCMonth(earliest.getUTCMonth()-3);
 // Only the production caller enables this cue after schema initialization.
 // Default standalone/legacy callers do not reference the additive table.
 const bootstrapSql=bootstrapCoverage?'EXISTS(SELECT 1 FROM business_month_publications WHERE month>=? AND month<?) AND NOT EXISTS(SELECT 1 FROM financial_audit_coverage_turns WHERE month=?) AND NOT EXISTS(SELECT 1 FROM background_coverage_bootstrap_attempts WHERE month=? AND next_attempt_at>?)':'0',bootstrapArgs=bootstrapCoverage?[earliest.toISOString().slice(0,7),month,month,month,stamp]:[];
 // First Pending page and failed refresh recovery are global, not tied to a
 // publication revision. Failed refreshes wait fifteen minutes;
 // a durable cooldown also fences missing service/blocked attempts with no RPC.
 const pendingSql=pendingIncomeRecovery?`EXISTS(SELECT 1 FROM business_income_overview o WHERE o.id=1 AND o.status IN('SUCCESS','UNAVAILABLE') AND o.payload_checked_at<=? AND CASE WHEN json_valid(o.payload) THEN json_extract(o.payload,'$.schema')='finance_income_overview_v1' AND json_type(o.payload,'$.pending.cents')='integer' AND json_extract(o.payload,'$.pending.cents')>0 ELSE 0 END)
 AND (NOT EXISTS(SELECT 1 FROM business_income_detail WHERE id=1) OR EXISTS(SELECT 1 FROM business_income_detail d WHERE d.id=1 AND d.status='UNAVAILABLE' AND d.last_attempt_at<=? AND d.next_attempt_at<=?))
 AND NOT EXISTS(SELECT 1 FROM background_pending_income_recovery_attempts WHERE id=1 AND next_attempt_at>?)`:'0';
 const pendingArgs=pendingIncomeRecovery?[stamp,stamp-900,stamp,stamp]:[];
 try{row=(await db.prepare(`UPDATE background_collection_lane_state SET revision=revision+1,lease_token=?,lease_until=? WHERE id=1 AND revision<2147483646 AND (lease_token IS NULL OR lease_until<=?) RETURNING revision,next_lane,auxiliary_index,analysis_attempt_day,(SELECT enabled FROM business_sync_state WHERE id=1) AS enabled,(SELECT next_run_at FROM business_sync_state WHERE id=1) AS finance_due_at,(SELECT summary FROM business_sync_state WHERE id=1) AS finance_summary,(SELECT json_extract(payload,'$.hermes_mode') FROM admin_settings WHERE id=1) AS hermes_mode,(SELECT json_extract(payload,'$.daily_hour') FROM admin_settings WHERE id=1) AS daily_hour,EXISTS(SELECT 1 FROM hermes_jobs WHERE dedupe_key=?) AS analysis_queued,EXISTS(SELECT 1 FROM hermes_agent_capabilities c JOIN hermes_agent a ON a.id=c.id WHERE c.id=1 AND c.protocol='hermes-finance-v1' AND c.maintenance_until<=? AND (julianday(?)-julianday(c.updated_at))*86400 BETWEEN 0 AND 90 AND (julianday(?)-julianday(a.heartbeat))*86400 BETWEEN 0 AND 90) AS bridge_ready,(SELECT finance_since_audit FROM background_history_fairness_state WHERE id=1) AS finance_since_audit,(SELECT last_auxiliary_at FROM background_history_fairness_state WHERE id=1) AS last_auxiliary_at,(SELECT returns_retry_at FROM background_history_fairness_state WHERE id=1) AS returns_retry_at,(SELECT reserved_returns_streak FROM background_history_fairness_state WHERE id=1) AS reserved_returns_streak,(SELECT next_history_work FROM background_history_fairness_state WHERE id=1) AS next_history_work,EXISTS(SELECT 1 FROM business_month_publications WHERE month=?) AS has_publication,${missingReturnsSql} AS returns_due,${bootstrapSql} AS coverage_bootstrap_due,${pendingSql} AS pending_income_recovery_due`).bind(token,stamp+290,stamp,'daily:'+today,stamp*1000,date.toISOString(),date.toISOString(),month,month,stamp,...bootstrapArgs,...pendingArgs).all()).results[0];}catch{fail('BACKGROUND_LANE_STORAGE_UNAVAILABLE');}
 if(!row)return {schema:'background_lane_v1',lane:'LEASED',token:null,revision:null,auxiliary_index:null};
 if(!integer(row.revision,1,2147483646)||!['FINANCE','AUXILIARY'].includes(row.next_lane)||!integer(row.auxiliary_index,0,4)||![0,1].includes(row.enabled)||!integer(row.finance_due_at))fail('BACKGROUND_LANE_STORAGE_INVALID');
 let importing=false;try{const summary=row.finance_summary===null?null:JSON.parse(row.finance_summary);importing=summary?.month===month&&summary.status==='RUNNING'&&row.finance_due_at<=stamp;}catch{fail('BACKGROUND_LANE_STORAGE_INVALID');}
 const analysisDue=row.hermes_mode==='scheduled'&&integer(row.daily_hour,0,23)&&hour>=row.daily_hour&&row.analysis_queued===0&&row.bridge_ready===1&&row.analysis_attempt_day!==today;
 if(!integer(row.finance_since_audit,0,4)||row.last_auxiliary_at!==null&&!integer(row.last_auxiliary_at,1,9999999999)||!integer(row.returns_retry_at)||!integer(row.reserved_returns_streak,0,2)||!['COST','AUDIT'].includes(row.next_history_work)||![0,1].includes(row.has_publication)||![0,1].includes(row.returns_due)||![0,1].includes(row.coverage_bootstrap_due)||![0,1].includes(row.pending_income_recovery_due))fail('BACKGROUND_LANE_STORAGE_INVALID');
 const auxiliaryDue=(row.has_publication===1||row.coverage_bootstrap_due===1)&&row.finance_since_audit>=4&&(row.last_auxiliary_at===null||stamp-row.last_auxiliary_at>=300);
 const pendingRecovery=row.pending_income_recovery_due===1&&row.next_lane==='AUXILIARY'&&(row.last_auxiliary_at===null||stamp-row.last_auxiliary_at>=300)&&(!importing||auxiliaryDue);
 const reserved=!pendingRecovery&&row.returns_due===1&&row.reserved_returns_streak<2&&row.returns_retry_at<=stamp&&(row.finance_due_at>stamp||importing&&row.next_lane==='AUXILIARY'&&auxiliaryDue);
 // A bootstrap cannot repeatedly overtake other auxiliary work if its audit
 // fails before initializing the monthly marker: share the two-reservation
 // burst limit and its own five-minute retry gap. Ordinary auxiliary activity
 // cannot postpone the first attempt or extend a failed bootstrap's cooldown.
 // Busy Finance imports still retain their existing 4/5 auxiliary fairness.
 const bootstrap=!pendingRecovery&&!reserved&&row.coverage_bootstrap_due===1&&row.reserved_returns_streak<2&&(row.finance_due_at>stamp||importing&&row.next_lane==='AUXILIARY'&&auxiliaryDue);
 const lane=row.enabled===0?'PAUSED':pendingRecovery||reserved||bootstrap?'HISTORY':row.next_lane==='FINANCE'||importing&&!auxiliaryDue?'FINANCE':analysisDue?'ANALYSIS':auxiliaries[row.auxiliary_index];
 return {schema:'background_lane_v1',lane,token,revision:row.revision,auxiliary_index:row.auxiliary_index,reserved_returns:row.enabled===1&&reserved,coverage_bootstrap:row.enabled===1&&bootstrap,...(row.enabled===1&&bootstrap?{coverage_bootstrap_month:month}:{}),history_turn:row.next_history_work,...(row.enabled===1&&pendingRecovery?{pending_income_recovery:true,pending_income_recovery_month:month}:{})};
}

export async function finishBackgroundLane(env,lease,{now=()=>Date.now(),repeatHistory=false,auditSourceReads=0,historyNextWork=null}={}){
 const stamp=clock(now);if(!lease?.token)return false;
 const reserved=lease.reserved_returns??false,bootstrap=lease.coverage_bootstrap??false,pendingRecovery=lease.pending_income_recovery??false,priority=reserved||bootstrap||pendingRecovery;
 if(typeof lease.token!=='string'||!/^[a-f0-9-]{36}$/.test(lease.token)||!integer(lease.revision,1,2147483646)||!integer(lease.auxiliary_index,0,4)||!['FINANCE','PAUSED','ANALYSIS',...auxiliaries].includes(lease.lane)||typeof repeatHistory!=='boolean'||typeof reserved!=='boolean'||typeof bootstrap!=='boolean'||typeof pendingRecovery!=='boolean'||pendingRecovery&&(reserved||bootstrap||typeof lease.pending_income_recovery_month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(lease.pending_income_recovery_month))||priority&&lease.lane!=='HISTORY'||reserved&&bootstrap||bootstrap&&(typeof lease.coverage_bootstrap_month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(lease.coverage_bootstrap_month))||!integer(auditSourceReads,0,1)||![null,'COST','AUDIT'].includes(historyNextWork))fail('BACKGROUND_LANE_REQUEST_INVALID',400);
 const auxiliary=auxiliaries.includes(lease.lane),index=auxiliary&&!priority&&!(lease.lane==='HISTORY'&&repeatHistory)?(lease.auxiliary_index+1)%auxiliaries.length:lease.auxiliary_index;
 const analysisDay=lease.lane==='ANALYSIS'?new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000)):null;
 const enabled='(SELECT enabled FROM business_sync_state WHERE id=1)=1';
 try{
  const statements=[
   database(env).prepare('UPDATE background_collection_lane_state SET next_lane=CASE WHEN ? OR NOT '+enabled+' THEN next_lane ELSE ? END,auxiliary_index=CASE WHEN '+enabled+' THEN ? ELSE auxiliary_index END,analysis_attempt_day=CASE WHEN '+enabled+' THEN COALESCE(?,analysis_attempt_day) ELSE analysis_attempt_day END,lease_token=NULL,lease_until=NULL WHERE id=1 AND revision=? AND lease_token=? AND lease_until>?').bind(Number(lease.lane==='PAUSED'),lease.lane==='FINANCE'?'AUXILIARY':'FINANCE',index,analysisDay,lease.revision,lease.token,stamp),
   database(env).prepare('UPDATE background_history_fairness_state SET finance_since_audit=CASE WHEN ? THEN MIN(4,finance_since_audit+1) WHEN ? THEN 0 ELSE finance_since_audit END,last_auxiliary_at=CASE WHEN ? THEN ? ELSE last_auxiliary_at END,returns_retry_at=CASE WHEN ? THEN ? WHEN ? THEN 0 ELSE returns_retry_at END,reserved_returns_streak=CASE WHEN ? THEN MIN(2,reserved_returns_streak+1) WHEN ? THEN 0 ELSE reserved_returns_streak END,next_history_work=COALESCE(?,next_history_work) WHERE id=1 AND changes()=1 AND '+enabled).bind(Number(lease.lane==='FINANCE'),auditSourceReads,Number(auxiliary||lease.lane==='ANALYSIS'),stamp,Number(reserved&&auditSourceReads===0),stamp+300,Number(reserved&&auditSourceReads===1),Number(reserved||bootstrap),Number((auxiliary||lease.lane==='ANALYSIS')&&!priority),historyNextWork),
  ];
  // The new statement is absent for legacy/default leases: SQLite resolves
  // even WHERE-false table names, so optional schema must not be referenced.
  if(bootstrap)statements.push(database(env).prepare('INSERT INTO background_coverage_bootstrap_attempts(month,last_attempt_at,next_attempt_at) SELECT ?,?,? WHERE changes()=1 AND '+enabled+' ON CONFLICT(month) DO UPDATE SET last_attempt_at=excluded.last_attempt_at,next_attempt_at=excluded.next_attempt_at').bind(lease.coverage_bootstrap_month,stamp,stamp+300));
  if(pendingRecovery)statements.push(database(env).prepare('INSERT INTO background_pending_income_recovery_attempts(id,month,last_attempt_at,next_attempt_at) SELECT 1,?,?,? WHERE changes()=1 AND '+enabled+' ON CONFLICT(id) DO UPDATE SET month=excluded.month,last_attempt_at=excluded.last_attempt_at,next_attempt_at=excluded.next_attempt_at').bind(lease.pending_income_recovery_month,stamp,stamp+900));
  const writes=await database(env).batch(statements);
  return writes[0]?.meta?.changes===1;
 }catch{fail('BACKGROUND_LANE_STORAGE_UNAVAILABLE');}
}

// Exactly one private source across cost history and the financial audit ring.
// The reservation handles missing reports for the frozen publication before a
// local cost gap can monopolize HISTORY; normal HISTORY alternates both kinds.
export async function runBackgroundHistoryWork(env,services,{month,lease},{now=()=>Date.now(),readCandidates=readHistoricalCostCandidates,runCost=syncHistoricalCostEvidence,runAudits=runBusinessFinancialAudits,runReturns=runBusinessReconciliation,runIncomeDetail=runBusinessIncomeDetail}={}){
 const started=clock(now),db=database(env),reserved=lease?.reserved_returns===true,bootstrap=lease?.coverage_bootstrap===true,pendingRecovery=lease?.pending_income_recovery===true;
 if(!lease||lease.lane!=='HISTORY'||reserved&&bootstrap||pendingRecovery&&(reserved||bootstrap||lease.pending_income_recovery_month!==month)||lease.pending_income_recovery!==undefined&&typeof lease.pending_income_recovery!=='boolean'||lease.coverage_bootstrap!==undefined&&typeof lease.coverage_bootstrap!=='boolean'||typeof lease.token!=='string'||!integer(lease.revision,1,2147483646)||!['COST','AUDIT'].includes(lease.history_turn)||typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||![readCandidates,runCost,runAudits,runReturns,runIncomeDetail].every(v=>typeof v==='function'))fail('BACKGROUND_HISTORY_REQUEST_INVALID',400);
 let sourceReads=0,auditReads=0;
 const result={history:'DEFERRED',reconciliation:'DEFERRED',releases:'DEFERRED',income:'DEFERRED',income_detail:'DEFERRED',release_coverage:'DEFERRED',source_reads:0,audit_source_reads:0,repeatHistory:false,historyNextWork:null};
 const canRun=async()=>{
  const stamp=clock(now);if(stamp<started||stamp>=started+240)return false;
  const row=await db.prepare('SELECT revision,lease_token,lease_until,(SELECT enabled FROM business_sync_state WHERE id=1) AS enabled FROM background_collection_lane_state WHERE id=1').first();
  const checked=clock(now);return checked>=stamp&&checked<started+240&&(!(bootstrap||pendingRecovery)||new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(checked*1000)).slice(0,7)===month)&&row?.enabled===1&&row.revision===lease.revision&&row.lease_token===lease.token&&row.lease_until>checked;
 };
 const bounded=name=>typeof services?.[name]!=='function'?undefined:async(...args)=>{
  if(sourceReads>=1)fail('BACKGROUND_HISTORY_READ_BUDGET');
  if(!await canRun())fail('BACKGROUND_HISTORY_LEASE_EXPIRED');
  sourceReads++;if(name!=='getFinanceHistoricalVariantEvidence')auditReads++;
  return services[name](...args);
 };
 const finish=()=>({...result,source_reads:sourceReads,audit_source_reads:auditReads});
 const audit=async()=>{
  const sources=Object.fromEntries(['getFinanceReconciliation','getFinanceEscrowReleases','getFinanceEscrowReleaseCoverage','getFinanceIncomeOverview','getFinanceIncomeDetail'].map(name=>[name,bounded(name)]));
  const work=await runAudits(env,sources,{month},{now,canRun,historicalCalendars:true,backgroundLease:{token:lease.token,revision:lease.revision}});
  result.reconciliation=work.returns_status;result.releases=work.releases_status;result.income=work.income_status;result.income_detail=work.income_detail_status;result.release_coverage=work.coverage_status??'DEFERRED';
  // A cost continuation may hold one HISTORY slot for the next audit turn.
  // The audit itself always releases that hold so other auxiliary lanes run.
  result.repeatHistory=false;
 };
 try{
  if(!await canRun()){result.history='PAUSED';return finish();}
  if(pendingRecovery){
   const source=bounded('getFinanceIncomeDetail');
   result.income_detail=source?(await runIncomeDetail(env,source,{now,canRun})).status:'NO_SOURCE';
  }else if(reserved){
   const source=bounded('getFinanceReconciliation');
   result.reconciliation=source?(await runReturns(env,source,{month},{now,canRun})).status:'NO_SOURCE';
  }else if(bootstrap){
   // One initial audit reaches the new tracker before a persistent cost gap.
   // Keep the normal history turn and auxiliary index for the next opportunity.
   await audit();
  }else if(lease.history_turn==='AUDIT'){
   result.historyNextWork='COST';await audit();
  }else{
   result.historyNextWork='AUDIT';
   const selection=await readCandidates(env,month,{now});result.history=selection.status;
   if(selection.ready){
    const source=bounded('getFinanceHistoricalVariantEvidence');
    if(source){const work=await runCost(env,{month,item_ids:selection.item_ids},source,{now,canRun});result.history=work.work;result.repeatHistory=work.work==='PROGRESSED'&&!work.scan.complete;}
    else result.history='UNAVAILABLE';
   }else{result.historyNextWork='COST';await audit();}
  }
  if(!await canRun()){result.history='PAUSED';result.repeatHistory=false;}
 }catch{result.history='ERROR';result.repeatHistory=false;}
 return finish();
}

// This query returns identifiers from the saved, validated financial cohort,
// not caller-supplied products or the broad current product index. It resolves
// normalized frame references only when their run/revision still agree.
const candidatesSql=`WITH
 selected_run AS(SELECT payload FROM business_month_runs WHERE month=?),
 slots AS(SELECT CAST(s.key AS INTEGER) AS slot_index,s.value AS slot FROM selected_run r,json_each(r.payload,'$.slots') s),
 frames AS(SELECT json_extract(slot,'$.start_date') AS start_date,json_extract(slot,'$.end_date') AS end_date,
  CASE WHEN json_extract(slot,'$.frame.schema')='business_month_frame_ref_v1' AND f.run_id=json_extract(slot,'$.frame.run_id') AND f.revision=json_extract(slot,'$.frame.revision') THEN f.payload
       WHEN json_extract(slot,'$.frame.schema')='finance_business_period_v1' THEN json_extract(slot,'$.frame') ELSE NULL END AS payload
  FROM slots LEFT JOIN business_month_frames f ON f.month=? AND f.slot_index=slots.slot_index),
 observed AS(SELECT DISTINCT json_extract(i.value,'$.item_id') AS item_id,json_extract(i.value,'$.model_id') AS model_id FROM frames f,json_each(f.payload,'$.items') i
  WHERE json_extract(f.payload,'$.schema')='finance_business_period_v1' AND json_extract(f.payload,'$.start_date')=f.start_date AND json_extract(f.payload,'$.end_date')=f.end_date AND substr(f.start_date,1,7)=?
  AND json_extract(f.payload,'$.currency')='BRL' AND json_extract(f.payload,'$.basis')='CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'
  AND json_type(i.value,'$.item_id')='text' AND json_type(i.value,'$.model_id')='text' AND json_type(i.value,'$.quantity')='integer' AND json_extract(i.value,'$.quantity')>0),
 gaps AS(SELECT o.item_id,o.model_id FROM observed o
  WHERE NOT EXISTS(SELECT 1 FROM catalog_classification_variants v WHERE v.item_id=o.item_id AND v.model_id=o.model_id)
  AND NOT EXISTS(SELECT 1 FROM production_cost_catalog c,json_each(c.payload,'$.variants') v WHERE c.item_id=o.item_id AND json_extract(v.value,'$.model_id')=o.model_id)
  AND (? IS NULL OR o.item_id IN(SELECT value FROM json_each(?)))
  AND NOT EXISTS(SELECT 1 FROM historical_cost_evidence_names h WHERE h.item_id=o.item_id AND h.model_id=o.model_id AND h.approved=1 AND json_extract(h.payload,'$.conflict')=0 AND json_extract(h.payload,'$.overflow')=0 AND json_extract(h.payload,'$.missing_item_name')=0 AND json_extract(h.payload,'$.missing_model_name')=0 AND json_array_length(h.payload,'$.item_names')=1 AND json_array_length(h.payload,'$.model_names')=1)
  AND NOT EXISTS(SELECT 1 FROM historical_cost_evidence_runs r,json_each(r.item_ids) a WHERE r.month=? AND r.status='COMPLETE' AND r.last_success_at>? AND a.value=o.item_id)
  AND NOT EXISTS(SELECT 1 FROM variant_bindings_state b,json_each(b.payload) v WHERE json_extract(v.value,'$.item_id')=o.item_id AND json_extract(v.value,'$.model_id')=o.model_id AND json_extract(v.value,'$.operator_confirmed')=1)
  AND NOT EXISTS(SELECT 1 FROM production_costs_state p,json_each(p.payload,'$.custom_assignments') a WHERE json_extract(a.value,'$.item_id')=o.item_id AND (json_extract(a.value,'$.model_id') IS NULL OR json_extract(a.value,'$.model_id')=o.model_id))
  AND NOT EXISTS(SELECT 1 FROM production_costs_state p,json_each(p.payload,'$.composition_assignments') a WHERE json_extract(a.value,'$.item_id')=o.item_id AND json_extract(a.value,'$.model_id')=o.model_id)
  AND NOT EXISTS(SELECT 1 FROM production_cost_rules_state p,json_each(p.payload,'$.assignments') a WHERE json_extract(a.value,'$.item_id')=o.item_id AND (json_extract(a.value,'$.model_id') IS NULL OR json_extract(a.value,'$.model_id')=o.model_id))),
 active AS(SELECT r.item_ids,r.next_run_at,r.lease_until FROM historical_cost_evidence_runs r WHERE r.month=? AND r.status IN('RUNNING','RETRY_WAIT')
  AND EXISTS(SELECT 1 FROM json_each(r.item_ids) a JOIN gaps g ON g.item_id=a.value)
  AND NOT EXISTS(SELECT 1 FROM json_each(r.item_ids) a WHERE NOT EXISTS(SELECT 1 FROM observed o WHERE o.item_id=a.value))
  ORDER BY COALESCE(r.last_attempt_at,0),r.scope_key LIMIT 1),
 selected_gaps AS(SELECT DISTINCT g.item_id,(SELECT MAX(r.last_success_at) FROM historical_cost_evidence_runs r,json_each(r.item_ids) a WHERE r.month=? AND r.status='COMPLETE' AND a.value=g.item_id) AS last_completed FROM gaps g ORDER BY last_completed IS NOT NULL,COALESCE(last_completed,0),length(g.item_id),g.item_id LIMIT 5)
 SELECT (SELECT enabled FROM business_sync_state WHERE id=1) AS enabled,
 (SELECT item_ids FROM active) AS active_ids,(SELECT next_run_at FROM active) AS next_run_at,(SELECT lease_until FROM active) AS lease_until,
 (SELECT json_group_array(item_id) FROM selected_gaps) AS candidate_ids`;

export async function readHistoricalCostCandidates(env,input,{now=()=>Date.now(),itemIds=null}={}){
 const month=typeof input==='string'?input:input?.month;
 const stamp=clock(now);if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))fail('HISTORICAL_COST_CANDIDATES_REQUEST_INVALID',400);
 if(itemIds!==null&&(!Array.isArray(itemIds)||itemIds.length>90||!itemIds.every(identifier)||new Set(itemIds).size!==itemIds.length))fail('HISTORICAL_COST_CANDIDATES_REQUEST_INVALID',400);
 const allowed=itemIds===null?null:JSON.stringify(itemIds);
 let row;try{row=await database(env).prepare(candidatesSql).bind(month,month,month,allowed,allowed,month,stamp-900,month,month).first();}catch{fail('HISTORICAL_COST_CANDIDATES_UNAVAILABLE');}
 if(!row||![0,1].includes(row.enabled))fail('HISTORICAL_COST_CANDIDATES_INVALID');
 let ids;try{ids=JSON.parse(row.active_ids??row.candidate_ids??'[]');}catch{fail('HISTORICAL_COST_CANDIDATES_INVALID');}
 if(!Array.isArray(ids)||ids.length>5||!ids.every(identifier)||new Set(ids).size!==ids.length||row.next_run_at!==null&&!integer(row.next_run_at)||row.lease_until!==null&&!integer(row.lease_until,1,9999999999))fail('HISTORICAL_COST_CANDIDATES_INVALID');
 const waiting=Math.max(row.next_run_at??0,row.lease_until??0)>stamp;
 return {schema:'historical_cost_candidates_v1',month,item_ids:ids,ready:row.enabled===1&&ids.length>0&&!waiting,status:row.enabled!==1?'PAUSED':!ids.length?'IDLE':row.lease_until>stamp?'LEASED':waiting?'RETRY_WAIT':'READY'};
}
