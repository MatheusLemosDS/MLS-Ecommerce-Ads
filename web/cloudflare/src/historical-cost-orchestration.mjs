// One cron invocation owns one lane. Financial imports retain priority while
// running; auxiliary work never accumulates catalogue, DTF and history costs.
export const BACKGROUND_LANE_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS background_collection_lane_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,next_lane TEXT NOT NULL,auxiliary_index INTEGER NOT NULL,analysis_attempt_day TEXT,lease_token TEXT,lease_until INTEGER)`,
 `INSERT OR IGNORE INTO background_collection_lane_state(id,revision,next_lane,auxiliary_index) VALUES(1,1,'FINANCE',0)`,
];
export class HistoricalCostOrchestrationError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const fail=(code,status=503)=>{throw new HistoricalCostOrchestrationError(code,status);};
const auxiliaries=['HISTORY','CATALOG','REGISTRY','PRODUCTION','COSTS'];
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const identifier=value=>typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value);
const clock=now=>{let value;try{value=now();}catch{fail('BACKGROUND_LANE_CLOCK_INVALID');}if(!integer(value,1,9999999999999))fail('BACKGROUND_LANE_CLOCK_INVALID');return Math.floor(value/1000);};
const database=env=>{if(!env?.ADMIN_DB?.prepare)fail('BACKGROUND_LANE_CONFIGURATION');return env.ADMIN_DB;};

export async function acquireBackgroundLane(env,{month},{now=()=>Date.now()}={}){
 const stamp=clock(now);if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))fail('BACKGROUND_LANE_REQUEST_INVALID',400);
 const db=database(env),token=crypto.randomUUID(),date=new Date(stamp*1000),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(date),hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(date));let row;
 try{row=(await db.prepare(`UPDATE background_collection_lane_state SET revision=revision+1,lease_token=?,lease_until=? WHERE id=1 AND revision<2147483646 AND (lease_token IS NULL OR lease_until<=?) RETURNING revision,next_lane,auxiliary_index,analysis_attempt_day,(SELECT enabled FROM business_sync_state WHERE id=1) AS enabled,(SELECT next_run_at FROM business_sync_state WHERE id=1) AS finance_due_at,(SELECT summary FROM business_sync_state WHERE id=1) AS finance_summary,(SELECT json_extract(payload,'$.hermes_mode') FROM admin_settings WHERE id=1) AS hermes_mode,(SELECT json_extract(payload,'$.daily_hour') FROM admin_settings WHERE id=1) AS daily_hour,EXISTS(SELECT 1 FROM hermes_jobs WHERE dedupe_key=?) AS analysis_queued,EXISTS(SELECT 1 FROM hermes_agent_capabilities c JOIN hermes_agent a ON a.id=c.id WHERE c.id=1 AND c.protocol='hermes-finance-v1' AND c.maintenance_until<=? AND (julianday(?)-julianday(c.updated_at))*86400 BETWEEN 0 AND 90 AND (julianday(?)-julianday(a.heartbeat))*86400 BETWEEN 0 AND 90) AS bridge_ready`).bind(token,stamp+290,stamp,'daily:'+today,stamp*1000,date.toISOString(),date.toISOString()).all()).results[0];}catch{fail('BACKGROUND_LANE_STORAGE_UNAVAILABLE');}
 if(!row)return {schema:'background_lane_v1',lane:'LEASED',token:null,revision:null,auxiliary_index:null};
 if(!integer(row.revision,1,2147483646)||!['FINANCE','AUXILIARY'].includes(row.next_lane)||!integer(row.auxiliary_index,0,4)||![0,1].includes(row.enabled)||!integer(row.finance_due_at))fail('BACKGROUND_LANE_STORAGE_INVALID');
 let importing=false;try{const summary=row.finance_summary===null?null:JSON.parse(row.finance_summary);importing=summary?.month===month&&summary.status==='RUNNING'&&row.finance_due_at<=stamp;}catch{fail('BACKGROUND_LANE_STORAGE_INVALID');}
 const analysisDue=row.hermes_mode==='scheduled'&&integer(row.daily_hour,0,23)&&hour>=row.daily_hour&&row.analysis_queued===0&&row.bridge_ready===1&&row.analysis_attempt_day!==today;
 return {schema:'background_lane_v1',lane:row.enabled===0?'PAUSED':row.next_lane==='FINANCE'||importing?'FINANCE':analysisDue?'ANALYSIS':auxiliaries[row.auxiliary_index],token,revision:row.revision,auxiliary_index:row.auxiliary_index};
}

export async function finishBackgroundLane(env,lease,{now=()=>Date.now(),repeatHistory=false}={}){
 const stamp=clock(now);if(!lease?.token)return false;
 if(typeof lease.token!=='string'||!/^[a-f0-9-]{36}$/.test(lease.token)||!integer(lease.revision,1,2147483646)||!integer(lease.auxiliary_index,0,4)||!['FINANCE','PAUSED','ANALYSIS',...auxiliaries].includes(lease.lane)||typeof repeatHistory!=='boolean')fail('BACKGROUND_LANE_REQUEST_INVALID',400);
 const auxiliary=auxiliaries.includes(lease.lane),index=auxiliary&&!(lease.lane==='HISTORY'&&repeatHistory)?(lease.auxiliary_index+1)%auxiliaries.length:lease.auxiliary_index;
 const analysisDay=lease.lane==='ANALYSIS'?new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000)):null;
 try{return (await database(env).prepare('UPDATE background_collection_lane_state SET next_lane=CASE WHEN ? THEN next_lane ELSE ? END,auxiliary_index=?,analysis_attempt_day=COALESCE(?,analysis_attempt_day),lease_token=NULL,lease_until=NULL WHERE id=1 AND revision=? AND lease_token=? AND lease_until>?').bind(Number(lease.lane==='PAUSED'),lease.lane==='FINANCE'?'AUXILIARY':'FINANCE',index,analysisDay,lease.revision,lease.token,stamp).run()).meta.changes===1;}catch{fail('BACKGROUND_LANE_STORAGE_UNAVAILABLE');}
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
