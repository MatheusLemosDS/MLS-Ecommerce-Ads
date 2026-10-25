// Local evidence of application work, not a Cloudflare control-plane query.
// This reader never initializes tables, advances a collector or refreshes a
// source timestamp. Trigger configuration remains explicitly unobserved.
export class BackgroundCollectionDiagnosticsError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const fail=(code,status=503)=>{throw new BackgroundCollectionDiagnosticsError(code,status);};

// Embedded in the diagnostic UI: all validators must remain inside this body.
export function projectBackgroundCollectionDiagnostics(value){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const integer=(row,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
 const array=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,i)=>Object.getOwnPropertyDescriptor(rows,String(i))).every(field=>field&&Object.hasOwn(field,'value'));
 const month=row=>typeof row==='string'&&/^(?:[2-9][0-9]{3})-(0[1-9]|1[0-2])$/.test(row);
 const day=row=>typeof row==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row)&&Number.isFinite(Date.parse(row+'T00:00:00Z'))&&new Date(row+'T00:00:00Z').toISOString().slice(0,10)===row;
 const nullableTime=(row,max=9999999999)=>row===null||integer(row,1,max);
 const statuses=['IDLE','RUNNING','COMPLETE','PARTIAL','LIMIT_REACHED','ERROR','PAUSED'];
 const errors=['BUSINESS_SYNC_COLLECTION_UNAVAILABLE','BUSINESS_SYNC_RESULT_INVALID','BUSINESS_SYNC_ADS_INCOMPLETE','BUSINESS_SYNC_PERIOD_LIMIT_REACHED','BUSINESS_SYNC_SOURCE_RATE_LIMIT','BUSINESS_SYNC_SOURCE_TIMEOUT','BUSINESS_SYNC_SOURCE_AUTH_REQUIRED','BUSINESS_SYNC_SOURCE_INVALID','BUSINESS_SYNC_SOURCE_PERMISSION_DENIED'];
 const codes=['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','TAX_POLICY_REQUIRED','FINANCIAL_SOURCE_STALE'];
 const watermark=(row,at)=>exact(row,['finance_oldest_at','finance_latest_at','ads_at'])&&Object.values(row).every(value=>nullableTime(value,at+60))&&(row.finance_oldest_at===null)===(row.finance_latest_at===null)&&(row.finance_oldest_at===null||row.finance_oldest_at<=row.finance_latest_at);
 try{
  if(!exact(value,['schema','month','checked_at','planned','trigger_observation','sync','lane','cohort','recent_finance_runs'])||value.schema!=='background_collection_diagnostic_v1'||!month(value.month)||!integer(value.checked_at,1,9999999999)||value.trigger_observation!=='NOT_RECORDED'||!exact(value.planned,['cron','running_interval_seconds','complete_interval_seconds','financial_freshness_seconds'])||value.planned.cron!=='* * * * *'||value.planned.running_interval_seconds!==60||value.planned.complete_interval_seconds!==300||value.planned.financial_freshness_seconds!==900)return null;
  const sync=value.sync;
  if(sync!==null){
   if(!exact(sync,['enabled','status','month','next_run_at','last_attempt_at','last_success_at','failure_count','last_error','lease_active','lease_expires_at','summary'])||typeof sync.enabled!=='boolean'||!statuses.includes(sync.status)||sync.month!==null&&!month(sync.month)||!integer(sync.next_run_at,0,9999999999)||!nullableTime(sync.last_attempt_at,value.checked_at+60)||!nullableTime(sync.last_success_at,value.checked_at+60)||!integer(sync.failure_count,0,1000000)||sync.last_error!==null&&!errors.includes(sync.last_error)||typeof sync.lease_active!=='boolean'||!nullableTime(sync.lease_expires_at)||sync.lease_active!==(sync.lease_expires_at!==null&&sync.lease_expires_at>value.checked_at))return null;
   const summary=sync.summary;
   if(summary!==null){
    if(!exact(summary,['status','checked_at','source_checked_at','progress','pending'])||!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(summary.status)||!integer(summary.checked_at,1,value.checked_at+60)||!watermark(summary.source_checked_at,summary.checked_at)||!exact(summary.progress,['windows_total','windows_complete','pages_read','order_capacity'])||!integer(summary.progress.windows_total,1,3)||!integer(summary.progress.windows_complete,0,summary.progress.windows_total)||!integer(summary.progress.pages_read,0,600)||!integer(summary.progress.order_capacity,summary.progress.pages_read*5,summary.progress.pages_read*20)||(summary.progress.order_capacity-summary.progress.pages_read*5)%15!==0||!array(summary.pending,codes.length)||new Set(summary.pending).size!==summary.pending.length||!summary.pending.every(code=>codes.includes(code)))return null;
   }
  }
  const lane=value.lane;
  if(lane!==null&&(!exact(lane,['revision','next_group','next_auxiliary','lease_active','lease_expires_at','analysis_attempt_day'])||!integer(lane.revision,1,2147483646)||!['FINANCE','AUXILIARY'].includes(lane.next_group)||!['HISTORY','CATALOG','REGISTRY','PRODUCTION','COSTS'].includes(lane.next_auxiliary)||typeof lane.lease_active!=='boolean'||!nullableTime(lane.lease_expires_at)||lane.lease_active!==(lane.lease_expires_at!==null&&lane.lease_expires_at>value.checked_at)||lane.analysis_attempt_day!==null&&!day(lane.analysis_attempt_day)))return null;
  const cohort=value.cohort;
  if(cohort!==null&&(!exact(cohort,['revision','start_date','end_date','app_created_at','app_updated_at','source_oldest_at','source_latest_at'])||!integer(cohort.revision,1,2147483647)||!day(cohort.start_date)||cohort.start_date!==value.month+'-01'||!day(cohort.end_date)||!cohort.end_date.startsWith(value.month+'-')||!integer(cohort.app_created_at,1,value.checked_at+60)||!integer(cohort.app_updated_at,cohort.app_created_at,value.checked_at+60)||!nullableTime(cohort.source_oldest_at,value.checked_at+60)||!nullableTime(cohort.source_latest_at,value.checked_at+60)||(cohort.source_oldest_at===null)!==(cohort.source_latest_at===null)||cohort.source_oldest_at!==null&&cohort.source_oldest_at>cohort.source_latest_at))return null;
  if(!array(value.recent_finance_runs,8))return null;let previous=Number.MAX_SAFE_INTEGER;
  for(const run of value.recent_finance_runs){
   if(!exact(run,['status','started_at','finished_at','finance_steps','ads_reads','error_code','pages_read','orders_seen'])||!statuses.includes(run.status)||!integer(run.started_at,1,value.checked_at+60)||!integer(run.finished_at,run.started_at,value.checked_at+60)||run.started_at>previous||!integer(run.finance_steps,0,4)||!integer(run.ads_reads,0,1)||run.error_code!==null&&!errors.includes(run.error_code)||run.pages_read!==null&&!integer(run.pages_read,0,600)||run.orders_seen!==null&&!integer(run.orders_seen,0,3000))return null;previous=run.started_at;
  }
  const payload=JSON.stringify(value);if(new TextEncoder().encode(payload).byteLength>14*1024)return null;return JSON.parse(payload);
 }catch{return null;}
}

// Only compact source watermarks are selected. A normalized frame is eligible
// only if its App reference still names the same Finance run and revision.
const sourceTimesSql=`SELECT json_extract(source_payload,'$.cutoff_at') AS cutoff_at,json_extract(source_payload,'$.checked_at') AS checked_at,
 COALESCE(json_extract(source_payload,'$.source_checked_at.oldest_at'),json_extract(source_payload,'$.cutoff_at')) AS oldest_at,
 COALESCE(json_extract(source_payload,'$.source_checked_at.latest_at'),json_extract(source_payload,'$.checked_at')) AS latest_at
 FROM(SELECT json_extract(s.value,'$.start_date') AS start_date,json_extract(s.value,'$.end_date') AS end_date,
 CASE WHEN json_extract(s.value,'$.frame.schema')='business_month_frame_ref_v1' AND f.run_id=json_extract(s.value,'$.frame.run_id') AND f.revision=json_extract(s.value,'$.frame.revision') THEN f.payload
 WHEN json_extract(s.value,'$.frame.schema')='finance_business_period_v1' THEN json_extract(s.value,'$.frame') ELSE NULL END AS source_payload
 FROM business_month_runs r,json_each(r.payload,'$.slots') s LEFT JOIN business_month_frames f ON f.month=r.month AND f.slot_index=CAST(s.key AS INTEGER) WHERE r.month=?)
 WHERE source_payload IS NOT NULL AND json_extract(source_payload,'$.schema')='finance_business_period_v1'
 AND json_extract(source_payload,'$.start_date')=start_date AND json_extract(source_payload,'$.end_date')=end_date LIMIT 4`;

export async function readBackgroundCollectionDiagnostics(env,input,{now=()=>Date.now()}={}){
 if(!input||typeof input!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(input))||Reflect.ownKeys(input).length!==1||!Object.hasOwn(Object.getOwnPropertyDescriptor(input,'month')||{},'value')||typeof input.month!=='string'||!/^(?:[2-9][0-9]{3})-(0[1-9]|1[0-2])$/.test(input.month))fail('BACKGROUND_DIAGNOSTICS_REQUEST_INVALID',400);
 let millis;try{millis=now();}catch{fail('BACKGROUND_DIAGNOSTICS_CLOCK_INVALID');}if(!Number.isSafeInteger(millis)||millis<1||millis>9999999999999)fail('BACKGROUND_DIAGNOSTICS_CLOCK_INVALID');
 const stamp=Math.floor(millis/1000),month=input.month,db=env?.ADMIN_DB;if(!db?.batch||!db?.prepare)fail('BACKGROUND_DIAGNOSTICS_CONFIGURATION');let snapshot;
 try{snapshot=await db.batch([
  db.prepare('SELECT enabled,status,month,next_run_at,last_attempt_at,last_success_at,failure_count,last_error,lease_expires_at,summary FROM business_sync_state WHERE id=1'),
  db.prepare('SELECT revision,next_lane,auxiliary_index,lease_until,analysis_attempt_day FROM background_collection_lane_state WHERE id=1'),
  db.prepare("SELECT revision,created_at,updated_at,json_extract(payload,'$.start_date') AS start_date,json_extract(payload,'$.end_date') AS end_date FROM business_month_runs WHERE month=?").bind(month),
  db.prepare(sourceTimesSql).bind(month),
  db.prepare("SELECT status,started_at,finished_at,finance_steps,ads_reads,error_code,CASE WHEN json_valid(summary) THEN json_extract(summary,'$.progress.pages_read') ELSE NULL END AS pages_read,CASE WHEN json_valid(summary) THEN json_extract(summary,'$.coverage.orders') ELSE NULL END AS orders_seen FROM business_sync_audit WHERE kind='RUN' AND month=? ORDER BY started_at DESC,finished_at DESC LIMIT 8").bind(month),
 ]);}catch{fail('BACKGROUND_DIAGNOSTICS_STORAGE_UNAVAILABLE');}
 try{
  const [syncRow,laneRow,cohortRow]=snapshot.slice(0,3).map(result=>result.results[0]),times=snapshot[3].results;if(!Array.isArray(times)||times.length>3)fail('BACKGROUND_DIAGNOSTICS_STORAGE_INVALID');
  let summary=null;if(syncRow?.summary!==null&&syncRow?.summary!==undefined){const raw=JSON.parse(syncRow.summary);summary={status:raw.status,checked_at:raw.checked_at,source_checked_at:{...raw.source_checked_at},progress:{windows_total:raw.progress.windows_total,windows_complete:raw.progress.windows_complete,pages_read:raw.progress.pages_read,order_capacity:raw.progress.order_capacity??raw.progress.pages_read*5},pending:[...raw.pending]};}
  const sync=syncRow?{enabled:syncRow.enabled===1,status:syncRow.status,month:syncRow.month,next_run_at:syncRow.next_run_at,last_attempt_at:syncRow.last_attempt_at,last_success_at:syncRow.last_success_at,failure_count:syncRow.failure_count,last_error:syncRow.last_error,lease_active:syncRow.lease_expires_at!==null&&syncRow.lease_expires_at>stamp,lease_expires_at:syncRow.lease_expires_at,summary}:null;
  if(syncRow&&![0,1].includes(syncRow.enabled))fail('BACKGROUND_DIAGNOSTICS_STORAGE_INVALID');
  const auxiliaries=['HISTORY','CATALOG','REGISTRY','PRODUCTION','COSTS'],lane=laneRow?{revision:laneRow.revision,next_group:laneRow.next_lane,next_auxiliary:auxiliaries[laneRow.auxiliary_index],lease_active:laneRow.lease_until!==null&&laneRow.lease_until>stamp,lease_expires_at:laneRow.lease_until,analysis_attempt_day:laneRow.analysis_attempt_day}:null;
  for(const row of times)if(!Number.isSafeInteger(row.cutoff_at)||row.cutoff_at<1||!Number.isSafeInteger(row.checked_at)||row.checked_at<row.cutoff_at||row.checked_at>stamp+60||!Number.isSafeInteger(row.oldest_at)||row.oldest_at<row.cutoff_at||!Number.isSafeInteger(row.latest_at)||row.latest_at<row.oldest_at||row.latest_at>row.checked_at)fail('BACKGROUND_DIAGNOSTICS_STORAGE_INVALID');
  const cohort=cohortRow?{revision:cohortRow.revision,start_date:cohortRow.start_date,end_date:cohortRow.end_date,app_created_at:cohortRow.created_at,app_updated_at:cohortRow.updated_at,source_oldest_at:times.length?Math.min(...times.map(row=>row.oldest_at)):null,source_latest_at:times.length?Math.max(...times.map(row=>row.latest_at)):null}:null;
  const result=projectBackgroundCollectionDiagnostics({schema:'background_collection_diagnostic_v1',month,checked_at:stamp,planned:{cron:'* * * * *',running_interval_seconds:60,complete_interval_seconds:300,financial_freshness_seconds:900},trigger_observation:'NOT_RECORDED',sync,lane,cohort,recent_finance_runs:snapshot[4].results.map(row=>({...row}))});if(!result)fail('BACKGROUND_DIAGNOSTICS_STORAGE_INVALID');return result;
 }catch(error){if(error instanceof BackgroundCollectionDiagnosticsError)throw error;fail('BACKGROUND_DIAGNOSTICS_STORAGE_INVALID');}
}
