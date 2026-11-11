import {businessMonthBundle,projectBusinessMonth} from './business-month.mjs';
import {readCompletedBusinessMonth} from './business-month-publication.mjs';
import {buildDailyBusinessSummary} from './business-daily-summary.mjs';
import {projectBusinessMonthAuditScope} from './business-month-view-state.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {projectExternalCashPeriodSummary} from '../../finance/src/external-cash-period-frame.mjs';
import {projectExternalCashError} from '../../finance/src/external-cash-frame.mjs';
import {readProductionCoverageWorkspace} from './production-coverage.mjs';
import {WeeklyOperatingReportError,createWeeklyOperatingReportProtocol} from './weekly-operating-report.mjs';

const encoder=new TextEncoder(),integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const fail=(code,status=503)=>{throw new WeeklyOperatingReportError('WEEKLY_OPERATING_'+code,status);};
const canonical=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):Array.isArray(v)?v.map(canonical):v;
async function digest(v){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(canonical(v))))),n=>n.toString(16).padStart(2,'0')).join('');}

// D1 has a per-invocation query budget. This adapter also makes a write from any
// reused reader impossible. Reserving one statement leaves room for the final
// reference fence, even when a very large catalogue needs too many partitions.
function readOnlyDatabase(db){
 if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')fail('UNAVAILABLE');
 let used=0;const statements=new WeakMap();
 function reserve(n){if(used+n>49)fail('QUERY_BUDGET_EXCEEDED');used+=n;}
 function prepare(sql){
  if(typeof sql!=='string'||!/^\s*SELECT\b/i.test(sql))fail('WRITE_FORBIDDEN');
  let args=[];const statement={bind(...values){args=values;return statement;},async all(){reserve(1);return db.prepare(sql).bind(...args).all();},async first(){reserve(1);return db.prepare(sql).bind(...args).first();},async run(){reserve(1);return db.prepare(sql).bind(...args).all();}};
  statements.set(statement,()=>db.prepare(sql).bind(...args));return statement;
 }
 return {prepare,async batch(rows){if(!Array.isArray(rows)||rows.some(r=>!statements.has(r)))fail('UNAVAILABLE');reserve(rows.length);return db.batch(rows.map(r=>statements.get(r)()));},async fence(sql,args){if(used>=50)fail('QUERY_BUDGET_EXCEEDED');used++;return db.prepare(sql).bind(...args).first();},get queries(){return used;}};
}

// Freeze shared financial reference rows for the two monthly calculations.
// SQL and bound values form the key; different month/variant scopes never share
// a result. A final revision fence rejects a concurrently changed reference.
function referenceSnapshot(db){
 const plans=new WeakMap(),cache=new Map();
 return {cache,prepare(sql){let args=[];const row={bind(...values){args=values;return row;}};plans.set(row,()=>({sql,args,key:JSON.stringify([sql,args])}));return row;},async batch(rows){
  const requested=rows.map(row=>{if(!plans.has(row))fail('UNAVAILABLE');return plans.get(row)();}),missing=[...new Map(requested.filter(p=>!cache.has(p.key)).map(p=>[p.key,p])).values()];
  if(missing.length){const results=await db.batch(missing.map(p=>db.prepare(p.sql).bind(...p.args)));if(!Array.isArray(results)||results.length!==missing.length||results.some(r=>r?.success===false||!Array.isArray(r?.results)))fail('UNAVAILABLE');missing.forEach((p,i)=>cache.set(p.key,results[i]));}
  return requested.map(p=>structuredClone(cache.get(p.key)));
 }};
}

async function sourceTables(db){const result=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('business_month_publications','business_month_publication_frames','incurred_production_state','production_coverage_state','production_weekly_reports')").all();if(!Array.isArray(result?.results)||result.success===false)fail('UNAVAILABLE');return new Set(result.results.map(r=>r.name));}
const savedKeys=['schema','week_end_date','period_start_at','period_end_at','captured_at','source_revision','timing_revision','capture_kind','report_version','content_hash','status','active_records','produced_quantity','known_cost_quantity','unknown_cost_quantity','boundary_pending_records','boundary_pending_quantity','known_cost_cents','total_cost_cents','pending','basis'];
async function savedReferences(db,end,period,stamp,coverage){
 const result=await db.prepare('SELECT week_end_date,version,content_hash,payload,payload_hash,source_revision,timing_revision,captured_at,origin FROM production_weekly_reports WHERE week_end_date=? AND version IN (1,(SELECT MAX(version) FROM production_weekly_reports WHERE week_end_date=?)) ORDER BY version LIMIT 3').bind(end,end).all();
 if(!Array.isArray(result?.results)||result.success===false||result.results.length>2)fail('UNAVAILABLE');if(!result.results.length)return null;
 const values=[];for(const row of result.results){let value;try{if(typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>4096)throw Error();value=JSON.parse(row.payload);}catch{fail('UNAVAILABLE');}
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==savedKeys.length||!savedKeys.every(k=>Object.hasOwn(value,k))||value.schema!=='production_weekly_report_v1'||value.basis!=='CONFIRMED_MANUFACTURE_RECORDS_NOT_ALL_STORE_OR_CASH'||value.week_end_date!==end||row.week_end_date!==end||value.period_start_at!==period.start_at||value.period_end_at!==period.end_at||!integer(value.captured_at,period.end_at,stamp)||value.captured_at!==row.captured_at||row.origin!=='cron'||!integer(value.report_version,1,5000)||value.report_version!==row.version||value.content_hash!==row.content_hash||!/^[a-f0-9]{64}$/.test(value.content_hash)||value.source_revision!==row.source_revision||value.timing_revision!==row.timing_revision||!integer(value.source_revision,0,coverage?.source.ledger_revision??2147483645)||!integer(value.timing_revision,0,coverage?.source.timing_revision??2147483645)||!['RETROSPECTIVE','SCHEDULED','RESTATEMENT'].includes(value.capture_kind)||value.report_version===1&&value.capture_kind==='RESTATEMENT'||value.report_version>1&&value.capture_kind!=='RESTATEMENT')fail('UNAVAILABLE');
  for(const key of ['active_records','produced_quantity','known_cost_quantity','unknown_cost_quantity','boundary_pending_records','boundary_pending_quantity','known_cost_cents'])if(!integer(value[key]))fail('UNAVAILABLE');
  const pending=[];if(value.active_records===0&&value.boundary_pending_records===0)pending.push('NO_PRODUCTION_RECORDS');if(value.unknown_cost_quantity)pending.push('UNKNOWN_UNIT_COST');if(value.boundary_pending_records)pending.push('BOUNDARY_TIME_REQUIRED');
  const status=value.active_records===0&&value.boundary_pending_records===0?'NO_RECORDS':value.unknown_cost_quantity||value.boundary_pending_records?'PENDING':'RECORDED_COSTS';
  if(value.status!==status||JSON.stringify(value.pending)!==JSON.stringify(pending)||value.produced_quantity!==value.known_cost_quantity+value.unknown_cost_quantity||value.active_records>value.produced_quantity||value.boundary_pending_records>value.boundary_pending_quantity||value.known_cost_quantity===0&&value.known_cost_cents!==0||value.total_cost_cents!==(status==='RECORDED_COSTS'?value.known_cost_cents:null)||await digest(value)!==row.payload_hash)fail('UNAVAILABLE');values.push(value);
 }
 const first=values[0],last=values.at(-1);if(first.report_version!==1||last.captured_at<first.captured_at||last.source_revision<first.source_revision||last.timing_revision<first.timing_revision)fail('UNAVAILABLE');return {original_version:first.report_version,latest_version:last.report_version,original_cost_cents:first.total_cost_cents,latest_cost_cents:last.total_cost_cents,captured_at:first.captured_at};
}

async function dailyFromPublication(db,references,month,stamp){
 let published;try{published=await readCompletedBusinessMonth({ADMIN_DB:db},month,{now:()=>stamp*1000});}catch(error){if(error?.message==='WEEKLY_OPERATING_QUERY_BUDGET_EXCEEDED')throw error;fail('MONTH_PUBLICATION_INVALID');}if(!published)return null;
 const range={start_date:published.payload.start_date,end_date:published.payload.end_date,slots:published.payload.slots,current:month===new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000)).slice(0,7)};
 let monthly;try{monthly=await businessMonthBundle(references,month,range,stamp,published);}catch(error){if(error?.message==='WEEKLY_OPERATING_QUERY_BUDGET_EXCEEDED')throw error;fail('MONTH_REFERENCE_UNAVAILABLE');}const scope={publication_revision:published.publication.source_revision,start_date:range.start_date,end_date:range.end_date,sources:published.payload.slots.map(s=>({run_id:s.frame.run_id,source_revision:s.frame.revision,start_date:s.start_date,end_date:s.end_date}))};
 const summary=buildDailyBusinessSummary(monthly,published.payload.slots.map(s=>s.frame),scope,{projectMonthly:projectBusinessMonth,projectFrame:projectBusinessPeriodFrame,projectScope:projectBusinessMonthAuditScope});if(!summary)fail('DAILY_SUMMARY_INVALID');return summary;
}

async function referenceFence(db,references){
 const checks=[],args=[];
 const global=[['variant_bindings_state','revision,payload,updated_at'],['production_costs_state','revision,payload,updated_at'],['production_cost_rules_state','revision,payload,updated_at'],['catalog_classification_state','revision AS classification_revision'],['historical_cost_evidence_state','revision AS historical_cost_evidence_revision']];
 for(const [table,columns] of global){const sql='SELECT '+columns+' FROM '+table+' WHERE id=1',result=references.cache.get(JSON.stringify([sql,[]]));if(!result)continue;const row=result.results[0];if(!row)fail('SOURCE_CHANGED',409);checks.push('(SELECT revision FROM '+table+' WHERE id=1)=?');args.push(row.revision??row.classification_revision??row.historical_cost_evidence_revision);}
 for(const [key,result] of references.cache){const [sql,bound]=JSON.parse(key);if(sql==='SELECT revision,payload,updated_at FROM business_tax_policy_state WHERE year=?'){const row=result.results[0];checks.push(row?'(SELECT revision FROM business_tax_policy_state WHERE year=?)=?':'NOT EXISTS(SELECT 1 FROM business_tax_policy_state WHERE year=?)');args.push(bound[0]);if(row)args.push(row.revision);}}
 if(checks.length){const result=await db.fence('SELECT CASE WHEN '+checks.join(' AND ')+' THEN 1 ELSE 0 END AS ok',args);if(result?.ok!==1)fail('SOURCE_CHANGED',409);}
}

// The only remote service allowed here reads imported cash; no collector,
// schema initializer, mutation, provider call or monthly bootstrap is invoked.
export async function readWeeklyOperatingReport(env,input,services={}, {now=()=>Date.now()}={}){
 try{
 let stamp;try{stamp=now();}catch{}if(!integer(stamp,1,9999999999999))fail('UNAVAILABLE');stamp=Math.floor(stamp/1000);
 const protocol=createWeeklyOperatingReportProtocol({projectCashPeriod:projectExternalCashPeriodSummary}),selection=protocol.projectWeeklyOperatingSelection(input,stamp);if(!selection)fail('REQUEST_INVALID',400);
 const db=readOnlyDatabase(env?.ADMIN_DB),tables=await sourceTables(db),period=protocol.weeklyOperatingPeriod(selection.week_end,stamp),references=referenceSnapshot(db),daily_summaries=[],source_failures={months:[]};
 let coverage=null,saved_report=null,cash=null;
 if(tables.has('incurred_production_state')||tables.has('production_coverage_state'))try{coverage=await readProductionCoverageWorkspace({ADMIN_DB:db},selection,{now:()=>stamp*1000});}catch(error){if(error?.status===409)fail('SOURCE_CHANGED',409);}
 if(tables.has('production_weekly_reports'))try{saved_report=await savedReferences(db,selection.week_end,period.manufacturing_period,stamp,coverage);}catch{source_failures.report='MANUFACTURING_REPORT_INVALID';}
 if(tables.has('business_month_publications')&&tables.has('business_month_publication_frames')){
  const months=[...new Set([period.calendar_period.start_date.slice(0,7),period.calendar_period.end_date.slice(0,7)])];
  for(const month of months)try{const daily=await dailyFromPublication(db,references,month,stamp);if(daily)daily_summaries.push(daily);}catch(error){if(error instanceof WeeklyOperatingReportError&&error.status===409)throw error;const code=error?.message;source_failures.months.push({month,code:['WEEKLY_OPERATING_QUERY_BUDGET_EXCEEDED','WEEKLY_OPERATING_MONTH_PUBLICATION_INVALID','WEEKLY_OPERATING_MONTH_REFERENCE_UNAVAILABLE','WEEKLY_OPERATING_DAILY_SUMMARY_INVALID'].includes(code)?code.slice('WEEKLY_OPERATING_'.length):'MONTH_PUBLICATION_UNAVAILABLE'});}
 }
 // All reference calculations in this response use one request-local snapshot.
 // A changed source aborts rather than mix cost versions across the month edge.
 await referenceFence(db,references);
 if(typeof services?.cashPeriod==='function')try{cash=await services.cashPeriod({start_date:period.calendar_period.start_date,end_date:period.calendar_period.end_date});}catch(error){const cause=projectExternalCashError({schema:'external_cash_error_v1',error:error?.message});if(cause)source_failures.cash=cause.error;}
 const result=protocol.buildWeeklyOperatingReport({checked_at:stamp,week_end:selection.week_end,coverage,saved_report,daily_summaries,cash,source_failures});if(!result)fail('UNAVAILABLE');return result;
 }catch(error){if(error instanceof WeeklyOperatingReportError)throw error;throw new WeeklyOperatingReportError('WEEKLY_OPERATING_UNAVAILABLE',503,{cause:error});}
}
