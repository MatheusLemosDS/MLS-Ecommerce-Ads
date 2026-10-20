import {validateVariantBindings} from './variant-bindings.mjs';
import {validateProductionCosts} from './production-costs.mjs';
import {buildStoreSummary,validateStoreAdjustments,StoreSummaryError} from './store-summary.mjs';
import {projectStorePeriodRequest,projectStorePeriodFrame} from '../../finance/src/store-period-frame.mjs';
import {buildStoreProductSummary} from './store-product-summary.mjs';
import {buildStoreReturnsSummary} from './store-returns-summary.mjs';
import {projectAdsPeriod} from './ads-period.mjs';

export const STORE_ADJUSTMENTS_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS store_period_adjustments (run_id TEXT PRIMARY KEY NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS store_period_adjustments_audit (run_id TEXT NOT NULL, revision INTEGER NOT NULL, payload TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(run_id,revision))`,
 `CREATE TABLE IF NOT EXISTS store_period_ads_cache (run_id TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL)`,
];
const storeAdminFail=(code,status=400)=>{throw new StoreSummaryError(code,status);};
const storeAdminExact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
 &&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const storeAdminRevision=value=>Number.isSafeInteger(value)&&value>=0&&value<2147483647;

export function validateStoreAdjustmentBody(body){
 if(!storeAdminExact(body,['run_id','revision','values'])||!projectStorePeriodRequest({operation:'read',run_id:body.run_id})
   ||!storeAdminRevision(body.revision))storeAdminFail('STORE_ADJUSTMENTS_INVALID');
 return {run_id:body.run_id,revision:body.revision,values:validateStoreAdjustments(body.values)};
}

export async function saveStoreAdjustments(env,body,actor,rawFinance=null){
 const value=validateStoreAdjustmentBody(body);
 if(value.values.ads_source==='SHOPEE_PERIOD'){
  const row=await env.ADMIN_DB.prepare('SELECT payload,updated_at FROM store_period_ads_cache WHERE run_id=?').bind(value.run_id).first();
  const finance=projectStorePeriodFrame(rawFinance);
  const report=finance?.run_id===value.run_id?readStoredAdsPeriod(row,finance):null;
  if(!report||report.status!=='AVAILABLE')storeAdminFail('STORE_ADS_PERIOD_REQUIRED',503);
  value.values.ads_spend_cents=report.expense_cents;
 }
 const raw=JSON.stringify(value.values),now=new Date().toISOString();
 const mutation=value.revision===0
  ? env.ADMIN_DB.prepare('INSERT OR IGNORE INTO store_period_adjustments(run_id,revision,payload,updated_at) VALUES(?,1,?,?)').bind(value.run_id,raw,now)
  : env.ADMIN_DB.prepare('UPDATE store_period_adjustments SET revision=revision+1,payload=?,updated_at=? WHERE run_id=? AND revision=?').bind(raw,now,value.run_id,value.revision);
 const result=await env.ADMIN_DB.batch([mutation,
  env.ADMIN_DB.prepare('INSERT INTO store_period_adjustments_audit(run_id,revision,payload,actor,created_at) SELECT run_id,revision,payload,?,updated_at FROM store_period_adjustments WHERE changes()=1 AND run_id=? AND revision=? AND payload=? AND updated_at=?').bind(actor,value.run_id,value.revision+1,raw,now),
 ]);
 if(result[0].meta.changes!==1)storeAdminFail('STORE_ADJUSTMENTS_CHANGED_RELOAD',409);
 if(result[1].meta.changes!==1)storeAdminFail('STORE_ADJUSTMENTS_UNAVAILABLE',503);
}

function readStoredAdsPeriod(row,finance=null,now=Date.now()){
 try{
  if(!row||!Number.isSafeInteger(row.updated_at))return null;
  const report=projectAdsPeriod(JSON.parse(row.payload)),epoch=Math.floor(now/1000);
  if(!report||report.fetched_at!==row.updated_at||report.fetched_at>epoch+5||epoch-report.fetched_at>900)return null;
  if(finance&&(report.start_date!==finance.start_date||report.end_date!==finance.end_date||report.fetched_at<finance.checked_at-5))return null;
  return report;
 }catch{return null;}
}

export async function cacheStoreAdsPeriod(env,rawFinance,rawReport,{now=Date.now()}={}){
 const finance=projectStorePeriodFrame(rawFinance),report=projectAdsPeriod(rawReport);
 if(!finance||finance.status!=='COMPLETE'||!report
   ||!readStoredAdsPeriod({payload:JSON.stringify(report),updated_at:report.fetched_at},finance,now))storeAdminFail('STORE_ADS_PERIOD_INVALID',503);
 await env.ADMIN_DB.prepare('INSERT INTO store_period_ads_cache(run_id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(run_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at WHERE store_period_ads_cache.updated_at<=excluded.updated_at')
  .bind(finance.run_id,JSON.stringify(report),report.fetched_at).run();
}

// Each response reads a coherent saved configuration. Current standard costs
// are identified by revision; they are not presented as historical actual CMV.
export async function storePeriodBundle(env,raw,{now=Date.now()}={}){
 const finance=projectStorePeriodFrame(raw);
 if(!finance)storeAdminFail('STORE_PERIOD_UNAVAILABLE',503);
 const context=await env.ADMIN_DB.batch([
  env.ADMIN_DB.prepare('SELECT revision,payload,updated_at FROM variant_bindings_state WHERE id=1'),
  env.ADMIN_DB.prepare('SELECT revision,payload,updated_at FROM production_costs_state WHERE id=1'),
  env.ADMIN_DB.prepare('SELECT revision,payload,updated_at FROM store_period_adjustments WHERE run_id=?').bind(finance.run_id),
  env.ADMIN_DB.prepare('SELECT payload,updated_at FROM store_period_ads_cache WHERE run_id=?').bind(finance.run_id),
 ]);
 let bindings,costs,adjustments;
 try{
  const b=context[0].results[0],c=context[1].results[0],a=context[2].results[0];
  if(!b||!c||!Number.isSafeInteger(b.revision)||b.revision<1||b.revision>2147483647
    ||!Number.isSafeInteger(c.revision)||c.revision<1||c.revision>2147483647
    ||typeof b.updated_at!=='string'||!Number.isFinite(Date.parse(b.updated_at))
    ||typeof c.updated_at!=='string'||!Number.isFinite(Date.parse(c.updated_at)))throw Error();
  bindings={revision:b.revision,bindings:validateVariantBindings(JSON.parse(b.payload)),updated_at:b.updated_at};
  costs={revision:c.revision,values:validateProductionCosts(JSON.parse(c.payload)),updated_at:c.updated_at};
  if(a){
   if(!Number.isSafeInteger(a.revision)||a.revision<1||a.revision>2147483647
     ||typeof a.updated_at!=='string'||!Number.isFinite(Date.parse(a.updated_at)))throw Error();
   adjustments={revision:a.revision,values:validateStoreAdjustments(JSON.parse(a.payload)),updated_at:a.updated_at};
  }else adjustments={revision:0,values:null,updated_at:null};
 }catch{storeAdminFail('STORE_SUMMARY_COST_INVALID',503);}
 const ads_period=readStoredAdsPeriod(context[3]?.results?.[0],finance,now);
 const automatic=adjustments.values?.ads_source==='SHOPEE_PERIOD';
 const effective=automatic?(ads_period?.status==='AVAILABLE'?{...adjustments.values,ads_spend_cents:ads_period.expense_cents}:null):adjustments.values;
 const result=buildStoreSummary(finance,bindings,costs,effective);
 if(automatic&&!effective)result.pending=result.pending.map(code=>code==='ADJUSTMENTS_REQUIRED'?'ADS_PERIOD_UNAVAILABLE':code);
 return {finance,result,adjustments,product_result:buildStoreProductSummary(finance,bindings,costs),ads_period,
  returns_result:buildStoreReturnsSummary(finance)};
}
