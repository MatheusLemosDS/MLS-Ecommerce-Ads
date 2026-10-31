import {projectBusinessMonth} from './business-month.mjs';
import {createMlsAgentLearningReport} from './mls-agent-learning-report.mjs';

export const MLS_AGENT_LEARNING_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS mls_agent_learning_observations(month TEXT NOT NULL,end_date TEXT NOT NULL,publication_revision INTEGER NOT NULL,first_observed_at INTEGER NOT NULL,last_observed_at INTEGER NOT NULL,correction_count INTEGER NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=8192),PRIMARY KEY(month,end_date))`,
];
export class MlsAgentLearningError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const fail=(code,status)=>{throw new MlsAgentLearningError(code,status);};
const {projectObservation,projectReport}=createMlsAgentLearningReport();
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
const stampAt=now=>{let ms;try{ms=now();}catch{fail('MLS_AGENT_LEARNING_CLOCK_INVALID');}if(!integer(ms,1,9999999999999))fail('MLS_AGENT_LEARNING_CLOCK_INVALID');return Math.floor(ms/1000);};
const dbOf=env=>{const db=env?.ADMIN_DB;if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')fail('MLS_AGENT_LEARNING_CONFIGURATION');return db;};
const ready=new WeakMap();
async function setup(db){if(!ready.has(db))ready.set(db,db.batch(MLS_AGENT_LEARNING_SCHEMA.map(sql=>db.prepare(sql))).catch(()=>{ready.delete(db);fail('MLS_AGENT_LEARNING_STORAGE_UNAVAILABLE');}));await ready.get(db);}
const monthAt=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000)).slice(0,7);
function snapshot(frame,publication_revision){
 const products=frame.product_summary?.products;let total=0n,known=0n;
 if(products)for(const product of products)for(const variant of product.variants){total+=BigInt(variant.quantity);if(variant.unit_cost_cents!==null)known+=BigInt(variant.quantity);}
 const coverage=products&&total<=BigInt(Number.MAX_SAFE_INTEGER)?{total_units:Number(total),known_units:Number(known),pending_units:Number(total-known)}:{total_units:null,known_units:null,pending_units:null};
 return projectObservation({schema:'mls_agent_learning_observation_v1',month:frame.month,start_date:frame.start_date,end_date:frame.end_date,publication_revision,checked_at:frame.checked_at,source_checked_at:frame.source_checked_at??{finance_oldest_at:null,finance_latest_at:null,ads_at:frame.ads?.fetched_at??null},revisions:{bindings:frame.bindings_revision,costs:frame.costs_revision,cost_rules:frame.cost_rules_revision??null,classifications:frame.classification_revision??null,expenses:frame.expenses.revision,tax_policy:frame.tax?.policy_revision??null},coverage:{orders:frame.coverage.orders,paid:frame.coverage.paid,cancelled:frame.coverage.cancelled,review_orders:frame.coverage.cancel_pending+frame.coverage.other+frame.coverage.unknown,returns_orders:frame.coverage.returns+frame.coverage.returns_unknown,payment_missing:frame.coverage.payment_missing},production_coverage:coverage,metrics:{sales_cents:frame.sales_cents,payout_cents:frame.expected_repass_cents,production_cents:frame.production_cost_cents,known_production_cents:frame.known_production_cost_cents,ads_spend_cents:frame.ads?.expense_cents??null,net_estimate_cents:frame.result.net_estimate_cents,actual_profit_cents:null},pending:[...frame.result.pending],basis:frame.result.basis});
}

// Caller is an existing scheduled collector, never an owner GET. The frame has
// already been calculated; recording does not reload prices, orders or providers.
export async function recordMlsAgentLearningObservation(env,input,{now=()=>Date.now(),canRun=async()=>true}={}){
 const stamp=stampAt(now),db=dbOf(env);
 if(!exact(input,['frame','publication_revision'])||!integer(input.publication_revision,1,2147483647)||typeof canRun!=='function')fail('MLS_AGENT_LEARNING_INPUT_INVALID',400);
 const frame=projectBusinessMonth(input.frame);
 if(!frame||frame.checked_at>stamp+60)fail('MLS_AGENT_LEARNING_INPUT_INVALID',400);
 if(frame.status!=='COMPLETE')return {schema:'mls_agent_learning_work_v1',status:'WAITING_COMPLETE_PUBLICATION',observations_written:0};
 if(frame.source_checked_at?.finance_oldest_at==null||frame.source_checked_at?.finance_latest_at==null)return {schema:'mls_agent_learning_work_v1',status:'WAITING_SOURCE_IDENTITY',observations_written:0};
 const value=snapshot(frame,input.publication_revision);if(!value)fail('MLS_AGENT_LEARNING_INPUT_INVALID',400);
 if(!await canRun())return {schema:'mls_agent_learning_work_v1',status:'PAUSED',observations_written:0};
 await setup(db);if(!await canRun())return {schema:'mls_agent_learning_work_v1',status:'PAUSED',observations_written:0};
 const payload=JSON.stringify(value),at=stampAt(now);if(new TextEncoder().encode(payload).byteLength>8192)fail('MLS_AGENT_LEARNING_INPUT_INVALID',400);
 const equalRevisions=['bindings','costs','cost_rules','classifications','expenses','tax_policy'].map(key=>"COALESCE(json_extract(excluded.payload,'$.revisions."+key+"'),-1)>=COALESCE(json_extract(mls_agent_learning_observations.payload,'$.revisions."+key+"'),-1)").join(' AND ');
 const currentObservations="json_extract(excluded.payload,'$.checked_at')>=json_extract(mls_agent_learning_observations.payload,'$.checked_at') AND (json_extract(excluded.payload,'$.source_checked_at.ads_at') IS NULL OR json_extract(mls_agent_learning_observations.payload,'$.source_checked_at.ads_at') IS NULL OR json_extract(excluded.payload,'$.source_checked_at.ads_at')>=json_extract(mls_agent_learning_observations.payload,'$.source_checked_at.ads_at'))";
 // The publication CAS rejects a completed frame superseded before this write.
 // Each end-date is ONE cumulative observation. Corrections replace it rather
 // than fabricating additional successful outcomes from repeated refreshes.
 const compatible="EXISTS(SELECT 1 FROM business_sync_state WHERE id=1 AND enabled=1) AND EXISTS(SELECT 1 FROM business_month_publications AS h WHERE h.month=? AND h.source_revision=? AND json_extract(h.payload,'$.start_date')=? AND json_extract(h.payload,'$.end_date')=? AND (SELECT MIN(COALESCE(json_extract(f.payload,'$.source_checked_at.oldest_at'),json_extract(f.payload,'$.cutoff_at'))) FROM business_month_publication_frames AS f WHERE f.month=h.month AND f.write_token=h.write_token)=? AND (SELECT MAX(COALESCE(json_extract(f.payload,'$.source_checked_at.latest_at'),json_extract(f.payload,'$.checked_at'))) FROM business_month_publication_frames AS f WHERE f.month=h.month AND f.write_token=h.write_token)=?)";
 let result;try{result=await db.batch([
  db.prepare('INSERT INTO mls_agent_learning_observations(month,end_date,publication_revision,first_observed_at,last_observed_at,correction_count,payload) SELECT ?,?,?,?,?,0,? WHERE '+compatible+' ON CONFLICT(month,end_date) DO UPDATE SET publication_revision=excluded.publication_revision,last_observed_at=excluded.last_observed_at,correction_count=MIN(1000000,mls_agent_learning_observations.correction_count+CASE WHEN json_remove(mls_agent_learning_observations.payload,\'$.checked_at\',\'$.source_checked_at\',\'$.publication_revision\')<>json_remove(excluded.payload,\'$.checked_at\',\'$.source_checked_at\',\'$.publication_revision\') THEN 1 ELSE 0 END),payload=excluded.payload WHERE excluded.publication_revision>=mls_agent_learning_observations.publication_revision AND excluded.last_observed_at>=mls_agent_learning_observations.last_observed_at AND '+equalRevisions+' AND '+currentObservations+' AND excluded.payload<>mls_agent_learning_observations.payload').bind(value.month,value.end_date,input.publication_revision,at,at,payload,value.month,input.publication_revision,value.start_date,value.end_date,value.source_checked_at.finance_oldest_at,value.source_checked_at.finance_latest_at),
  db.prepare('DELETE FROM mls_agent_learning_observations WHERE rowid NOT IN(SELECT rowid FROM mls_agent_learning_observations ORDER BY end_date DESC,month DESC LIMIT 400) AND changes()=1'),
 ]);}catch{fail('MLS_AGENT_LEARNING_STORAGE_UNAVAILABLE');}
 return {schema:'mls_agent_learning_work_v1',status:result?.[0]?.meta?.changes===1?'RECORDED':'UNCHANGED_OR_SUPERSEDED',observations_written:result?.[0]?.meta?.changes===1?1:0};
}

// An owner read only selects aggregate memory. It never initializes storage,
// refreshes a provider, advances the collector or records an observation.
export async function readMlsAgentLearning(env,input,{now=()=>Date.now()}={}){
 const stamp=stampAt(now),db=dbOf(env);
 if(!exact(input,['month'])||typeof input.month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.month)||input.month>monthAt(stamp))fail('MLS_AGENT_LEARNING_REQUEST_INVALID',400);
 let exists,rows;try{
  exists=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mls_agent_learning_observations'").first();
  rows=exists?(await db.prepare('SELECT payload,first_observed_at,last_observed_at,correction_count FROM mls_agent_learning_observations ORDER BY end_date DESC,month DESC LIMIT 400').all()).results:[];
 }catch{fail('MLS_AGENT_LEARNING_STORAGE_UNAVAILABLE');}
 if(!Array.isArray(rows)||rows.length>400)fail('MLS_AGENT_LEARNING_STORAGE_INVALID');
 const observations=[];try{for(const row of rows){if(typeof row.payload!=='string'||new TextEncoder().encode(row.payload).byteLength>8192)throw Error();observations.push({observation:JSON.parse(row.payload),first_observed_at:row.first_observed_at,last_observed_at:row.last_observed_at,correction_count:row.correction_count});}}catch{fail('MLS_AGENT_LEARNING_STORAGE_INVALID');}
 const report=projectReport({month:input.month,checked_at:stamp,observations});if(!report)fail('MLS_AGENT_LEARNING_STORAGE_INVALID');return report;
}
