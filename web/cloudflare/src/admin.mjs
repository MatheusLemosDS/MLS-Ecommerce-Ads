import {shopDailyOrders} from './daily-shop-orders.mjs';
import {orderItems} from './order-items.mjs';
import {VariantBindingError,validateVariantBindings,readVariantBindings,saveVariantBindings,saveAutomaticVariantBindings,variantMarginReference} from './variant-bindings.mjs';
import {projectVariantCatalog,projectVariantCatalogRequest} from '../../finance/src/variant-catalog-frame.mjs';
import {OBSERVATION_SCHEMA,ObservationError,captureObservation,listObservations,readObservation} from './order-observations.mjs';
import {COST_DEFAULTS,COST_SCHEMA,ProductionCostError,validateProductionCosts,readProductionCosts,saveProductionCosts,productionCostReference,readProductionCostAudit} from './production-costs.mjs';
import {adsToday} from './admin-ads-today.mjs';
import {shopOrders} from './shop-orders.mjs';
import {safeOrdersDiagnostic} from './orders-diagnostic.mjs';
import {CSS,adminBody,loginBody} from './admin-view.mjs';
import {CLIENT} from './admin-client.mjs';
import {BUSINESS_MONTH_CLIENT} from './business-month-client.mjs';
import {AGENT_REGISTRY_CLIENT} from './agent-registry-view.mjs';
import {MISSION_CLIENT,MISSION_TRENDS_CLIENT} from './mission-control.mjs';
import {INCOME_OVERVIEW_CLIENT} from './income-overview-client.mjs';
import {BUSINESS_MONTH_CSS} from './business-month-view.mjs';
import {BUSINESS_ESCROW_RELEASES_SCHEMA,BusinessEscrowReleasesError,readBusinessEscrowReleases,readBusinessEscrowReleaseEvidence} from './business-escrow-releases.mjs';
import {BUSINESS_ESCROW_RELEASE_COVERAGE_SCHEMA,BusinessEscrowReleaseCoverageError,readBusinessEscrowReleaseCoverage,runBusinessEscrowReleaseCoverage} from './business-escrow-release-coverage.mjs';
import {FINANCIAL_AUDIT_SCHEMA,FinancialAuditOrchestrationError,runBusinessFinancialAudits} from './financial-audit-orchestration.mjs';
import {BUSINESS_INCOME_OVERVIEW_SCHEMA,BusinessIncomeOverviewError,readBusinessIncomeOverview} from './business-income-overview.mjs';
import {BUSINESS_INCOME_DETAIL_SCHEMA,BusinessIncomeDetailError,readBusinessIncomeDetail} from './business-income-detail.mjs';
import {BUSINESS_RECONCILIATION_SCHEMA,BusinessReconciliationError,readBusinessReconciliation,readBusinessReconciliationEvidence,readBusinessReconciliationMoney,runBusinessReconciliation} from './business-reconciliation.mjs';
import {BUSINESS_MONTH_SCHEMA,BusinessMonthError,businessMonthClientFrame,readBusinessMonthAdsState,readBusinessMonthDisplay} from './business-month.mjs';
import {ExpenseLedgerError,readExpenseLedger,mutateExpenseLedger} from './expense-ledger.mjs';
import {BusinessMonthViewError,buildBusinessMonthView,requestBusinessMonthRefresh} from './business-month-view-state.mjs';
import {BUSINESS_CHECKPOINT_SCHEMA,businessMonthWithCheckpoint,readBusinessCheckpoints,BusinessCheckpointError} from './business-checkpoint.mjs';
import {CATALOG_CLASSIFICATION_SCHEMA,enqueueCatalogClassifications,enqueueSoldCatalogGaps,runCatalogClassifications,readCatalogClassificationState,catalogClassificationQueries,catalogClassificationsFromSnapshot,CatalogClassificationError} from './catalog-classification.mjs';
import {readBusinessTaxPolicy,saveBusinessTaxPolicy,readBusinessTaxPolicyAudit,BusinessTaxPolicyError} from './business-tax-policy.mjs';
import {BUSINESS_SYNC_SCHEMA,runBusinessSync,readBusinessSyncState,saveBusinessSyncPolicy,BusinessSyncError} from './business-sync.mjs';
import {AUTOMATION_WORKSPACE_CSS,automationWorkspaceBody,AUTOMATION_WORKSPACE_CLIENT} from './automation-workspace.mjs';
import {projectFinanceSample} from './finance-sample-frame.mjs';
import {projectAdminFinancePreview} from './app-finance-sample.mjs';
import {projectStorePeriodRequest,projectStorePeriodFrame} from '../../finance/src/store-period-frame.mjs';
import {STORE_ADJUSTMENTS_SCHEMA,validateStoreAdjustmentBody,saveStoreAdjustments,storePeriodBundle,cacheStoreAdsPeriod} from './store-admin.mjs';
import {StoreSummaryError} from './store-summary.mjs';
import {syncVariantBindings} from './variant-sync.mjs';
import {BRAZA_THEME_HEAD,BRAZA_THEME_CSS} from './theme.mjs';
import {readOwnerSession,handleWorkspaceAuth} from './unified-auth.mjs';
import {readCostRules,saveCostRules,assignCostRules,readCostRuleReference,syncCostRuleCatalog,costRuleSnapshotQueries,costRuleReferenceFromSnapshot,mergeCatalogCostReference,CostRuleError} from './cost-rules.mjs';
import {COST_RULE_CSS,costRulesBody,COST_RULE_CLIENT} from './cost-rules-view.mjs';
import {PRODUCTION_DTF_SCHEMA,ProductionDtfError,readProductionDtf,saveProductionDtfSettings,syncProductionDtf,prepareProductionDtfBatch,actProductionDtfBatch} from './production-dtf-store.mjs';
import {DTF_CSS,dtfBody,DTF_CLIENT} from './dtf-view.mjs';
import {DTF_ENGINE_CLIENT} from './dtf-layout.mjs';
import {HERMES_FINANCIAL_CONTEXT_SCHEMA,HermesFinancialContextError,prepareHermesFinancialContext,readHermesFinancialContext} from './hermes-financial-context.mjs';
import {SAVED_ORDER_ITEMS_SCHEMA,SavedOrderItemsError,saveOrderItemsSnapshot,readOrderItemsSnapshot} from './saved-order-items.mjs';
import {PRODUCT_REGISTRY_SCHEMA,ProductRegistryError,readProductRegistry,runProductRegistry} from './product-registry.mjs';
import {PRODUCTION_COST_PERIODS_SCHEMA,ProductionCostPeriodsError,productionCostPeriods,captureProductionCostMonth} from './production-cost-periods.mjs';
import {PRODUCTION_COST_PERIODS_CSS,productionCostPeriodsBody,PRODUCTION_COST_PERIODS_CLIENT} from './production-cost-periods-view.mjs';
import {SAVED_CATALOG_CSS,savedCatalogBody,SAVED_CATALOG_CLIENT} from './saved-catalog-view.mjs';
import {BusinessCostDiagnosticsError,readBusinessCostDiagnostics,readBusinessCostDiagnosticsEvidence,readBusinessCostDiagnosticsEvidenceV2,readBusinessCostDiagnosticsEvidenceV3} from './business-cost-diagnostics.mjs';
import {HISTORICAL_COST_EVIDENCE_SCHEMA,HistoricalCostEvidenceError,readHistoricalCostEvidence,syncHistoricalCostEvidence} from './historical-cost-evidence.mjs';
import {OPERATOR_COST_CORRECTIONS_SCHEMA,OperatorCostCorrectionError,applyConfirmedOperatorCostCorrections} from './operator-cost-corrections.mjs';
import {BACKGROUND_LANE_SCHEMA,HistoricalCostOrchestrationError,acquireBackgroundLane,finishBackgroundLane,readHistoricalCostCandidates} from './historical-cost-orchestration.mjs';
// BrazaCommerce administration. No Shopee write operations.
const DEFAULTS = {regular_cents:1675,mixed_cents:1910,plus_cents:2070,ad_share_percent:40,hermes_mode:'manual',daily_hour:9,monthly_budget_cents:2000,run_reserve_cents:100,billing_mode:'unverified',monthly_run_limit:30};
const SCHEMA = [...new Set([
...COST_SCHEMA,
...STORE_ADJUSTMENTS_SCHEMA,
...BUSINESS_MONTH_SCHEMA,
...BUSINESS_RECONCILIATION_SCHEMA,
...BUSINESS_ESCROW_RELEASES_SCHEMA,
...FINANCIAL_AUDIT_SCHEMA,
...BUSINESS_CHECKPOINT_SCHEMA,
...CATALOG_CLASSIFICATION_SCHEMA,
...BUSINESS_SYNC_SCHEMA,
...PRODUCTION_DTF_SCHEMA,
...OBSERVATION_SCHEMA,
...HERMES_FINANCIAL_CONTEXT_SCHEMA,
...SAVED_ORDER_ITEMS_SCHEMA,
...PRODUCT_REGISTRY_SCHEMA,
...PRODUCTION_COST_PERIODS_SCHEMA,
...OPERATOR_COST_CORRECTIONS_SCHEMA,
...HISTORICAL_COST_EVIDENCE_SCHEMA,
...BACKGROUND_LANE_SCHEMA,
`CREATE TABLE IF NOT EXISTS variant_bindings_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS variant_bindings_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, revision INTEGER UNIQUE NOT NULL, payload TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS admin_settings (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS admin_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, revision INTEGER UNIQUE NOT NULL, payload TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS hermes_agent (id INTEGER PRIMARY KEY CHECK(id=1), heartbeat TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS hermes_agent_capabilities (id INTEGER PRIMARY KEY CHECK(id=1), protocol TEXT NOT NULL, updated_at TEXT NOT NULL, maintenance_until INTEGER NOT NULL DEFAULT 0)`,
`CREATE TABLE IF NOT EXISTS hermes_jobs (id TEXT PRIMARY KEY, trigger_type TEXT NOT NULL, dedupe_key TEXT UNIQUE, status TEXT NOT NULL, task TEXT NOT NULL, settings_revision INTEGER NOT NULL, settings_snapshot TEXT NOT NULL, reserve_cents INTEGER NOT NULL, cost_cents INTEGER, result TEXT, failure TEXT, cost_source TEXT, lease TEXT, created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT)`,
`CREATE TABLE IF NOT EXISTS hermes_cost_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, previous_cents INTEGER, cost_cents INTEGER NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL)`])];
const enc = new TextEncoder();
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
function businessMonthResponse(request,frame){
 const contract=request.headers.get('x-braza-client-contract')||'business-month-v1';
 const response=json(businessMonthClientFrame(frame,contract));
 response.headers.set('x-braza-client-contract',contract);response.headers.set('vary','X-Braza-Client-Contract');return response;
}
class AdminError extends Error {constructor(code,status=400){super(code);this.status=status;}}
function isD1DailyLimitError(error){
 const endings=["Your account has exceeded D1's free tier daily row read limit.","Your account has exceeded D1's free tier daily row write limit."];
 const guidance=' Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.';
 const suffixes=['',guidance,guidance+' See https://developers.cloudflare.com/d1/platform/limits/ for more details.'];
 const seen=new Set();let current=error,d1=false;
 // D1 used cause.message in older bindings. Inspect only bounded, own data
 // properties; provider details stay on the server and are never serialized.
 for(let depth=0;depth<4;depth++){
  if(current===null||typeof current!=='object'||seen.has(current))return false;seen.add(current);
  let message,cause;try{message=Object.getOwnPropertyDescriptor(current,'message')?.value;cause=Object.getOwnPropertyDescriptor(current,'cause')?.value;}catch{return false;}
  if(typeof message==='string'&&message.length<=1024){
   let detail=message;
   if(message==='D1_ERROR'){d1=true;detail='';}
   else if(message.startsWith('D1_ERROR: ')){d1=true;detail=message.slice(10);}
   if(d1&&endings.some(ending=>suffixes.some(suffix=>detail===ending+suffix)))return true;
  }
  current=cause;
 }
 return false;
}
function assert(condition,code,status=400){if(!condition)throw new AdminError(code,status);}
async function digest(value,secret){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function equal(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(a)));const y=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(b)));let difference=0;for(let i=0;i<x.length;i++)difference|=x[i]^y[i];return difference===0;}
function secure(env){assert(typeof env.ADMIN_SESSION_SECRET==='string'&&env.ADMIN_SESSION_SECRET.length>=32,'ADMIN_SESSION_SETUP_REQUIRED',503);}
async function session(request,env){secure(env);return readOwnerSession(request,env);}
function sameOrigin(request){assert(request.headers.get('origin')===new URL(request.url).origin,'ORIGIN_REJECTED',403);}
async function readBody(request,maximum){const reader=request.body?.getReader();assert(reader,'BODY_REQUIRED');const pieces=[];let length=0;try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;assert(length<=maximum,'BODY_TOO_LARGE',413);pieces.push(value);}}finally{await reader.cancel();}const raw=new Uint8Array(length);let offset=0;for(const piece of pieces){raw.set(piece,offset);offset+=piece.length;}return new TextDecoder().decode(raw);}
async function input(request,maximum=16384){assert((request.headers.get('content-type')||'').split(';')[0]==='application/json','JSON_REQUIRED',415);const raw=await readBody(request,maximum);try{const value=JSON.parse(raw);assert(value&&typeof value==='object'&&!Array.isArray(value),'BODY_INVALID');return value;}catch(error){if(error instanceof AdminError)throw error;throw new AdminError('BODY_INVALID');}}
const INITIALIZED_DB=new WeakMap();
const MAINTENANCE_PENDING=new WeakSet();
async function setup(env){
 assert(env.ADMIN_DB&&typeof env.ADMIN_DB.prepare==='function','ADMIN_DB_SETUP_REQUIRED',503);if(INITIALIZED_DB.has(env.ADMIN_DB))return INITIALIZED_DB.get(env.ADMIN_DB);
 const ready=(async()=>{const db=env.ADMIN_DB,now=new Date().toISOString();
  const initialized=await db.batch([...SCHEMA.map(sql=>db.prepare(sql)),
   db.prepare('INSERT OR IGNORE INTO production_costs_state(id,revision,payload,updated_at) VALUES(1,1,?,?)').bind(JSON.stringify(COST_DEFAULTS),now),
   db.prepare('INSERT OR IGNORE INTO production_costs_audit(revision,payload,actor,created_at) SELECT revision,payload,?,updated_at FROM production_costs_state WHERE id=1 AND revision=1').bind('operator-confirmed-2026-10-16'),
   db.prepare('INSERT OR IGNORE INTO variant_bindings_state(id,revision,payload,updated_at) VALUES(1,1,?,?)').bind('[]',now),
   db.prepare('INSERT OR IGNORE INTO variant_bindings_audit(revision,payload,actor,created_at) SELECT revision,payload,?,updated_at FROM variant_bindings_state WHERE id=1 AND revision=1').bind('initial'),
   db.prepare('INSERT OR IGNORE INTO admin_settings(id,revision,payload,updated_at) VALUES(1,1,?,?)').bind(JSON.stringify(DEFAULTS),now),
   db.prepare('INSERT OR IGNORE INTO admin_audit(revision,payload,actor,created_at) VALUES(1,?,?,?)').bind(JSON.stringify(DEFAULTS),'initial',now),
   db.prepare("SELECT COUNT(*) AS n FROM operator_cost_corrections WHERE shop_id=1178167501 AND correction_id IN('adult-22199878767-remove-child-rule-v1','child-size-2-1250-v1','adult-triple-58271140523-149796059126-v1')"),
  ]);
  const maintenanceApplied=initialized.at(-1).results[0].n<3;await applyConfirmedOperatorCostCorrections(env);if(maintenanceApplied)MAINTENANCE_PENDING.add(db);return {maintenanceApplied};
 })();INITIALIZED_DB.set(env.ADMIN_DB,ready);try{return await ready;}catch(error){INITIALIZED_DB.delete(env.ADMIN_DB);throw error;}
}
function validateSettings(value){assert(value&&typeof value==='object'&&!Array.isArray(value),'SETTINGS_INVALID');assert(Object.keys(value).length===Object.keys(DEFAULTS).length&&Object.keys(DEFAULTS).every(key=>Object.hasOwn(value,key)),'SETTINGS_INVALID');for(const key of ['regular_cents','mixed_cents','plus_cents'])assert(Number.isInteger(value[key])&&value[key]>0&&value[key]<=1000000,'MARGIN_INVALID');assert(Number.isInteger(value.ad_share_percent)&&value.ad_share_percent>=1&&value.ad_share_percent<=100,'AD_SHARE_INVALID');assert(['manual','scheduled','paused'].includes(value.hermes_mode),'MODE_INVALID');assert(Number.isInteger(value.daily_hour)&&value.daily_hour>=0&&value.daily_hour<=23,'HOUR_INVALID');for(const key of ['monthly_budget_cents','run_reserve_cents'])assert(Number.isInteger(value[key])&&value[key]>=1&&value[key]<=1000000,'BUDGET_INVALID');assert(value.run_reserve_cents<=value.monthly_budget_cents,'RESERVE_EXCEEDS_BUDGET');assert(['unverified','subscription','api'].includes(value.billing_mode),'BILLING_MODE_INVALID');assert(Number.isInteger(value.monthly_run_limit)&&value.monthly_run_limit>=1&&value.monthly_run_limit<=1000,'RUN_LIMIT_INVALID');return value;}
async function settings(env){const row=await env.ADMIN_DB.prepare('SELECT revision,payload,updated_at FROM admin_settings WHERE id=1').first();return {revision:row.revision,values:{...DEFAULTS,...JSON.parse(row.payload)},updated_at:row.updated_at};}
async function saveSettings(env,body,actor){assert(Number.isInteger(body.revision)&&body.revision>=1&&Object.keys(body).length===2,'REVISION_REQUIRED');const value=validateSettings(body.values),raw=JSON.stringify(value),now=new Date().toISOString();const results=await env.ADMIN_DB.batch([
 env.ADMIN_DB.prepare('UPDATE admin_settings SET revision=revision+1,payload=?,updated_at=? WHERE id=1 AND revision=?').bind(raw,now,body.revision),
 env.ADMIN_DB.prepare('INSERT INTO admin_audit(revision,payload,actor,created_at) SELECT revision,payload,?,updated_at FROM admin_settings WHERE id=1 AND revision=? AND updated_at=? AND NOT EXISTS(SELECT 1 FROM admin_audit WHERE revision=?)').bind(actor,body.revision+1,now,body.revision+1)]);assert(results[0].meta.changes===1,'SETTINGS_CHANGED_RELOAD',409);return settings(env);}
function localDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function yesterday(){return localDay(new Date(Date.now()-86400000));}
async function connected(env){const row=await env.ADMIN_DB.prepare('SELECT heartbeat FROM hermes_agent WHERE id=1').first();return !!row&&Date.now()-Date.parse(row.heartbeat)<90000;}
const HERMES_FINANCE_PROTOCOL='hermes-finance-v1';
async function financeBridgeReady(env){const row=await env.ADMIN_DB.prepare('SELECT protocol,updated_at,maintenance_until FROM hermes_agent_capabilities WHERE id=1').first();const age=row?Date.now()-Date.parse(row.updated_at):NaN;return !!row&&row.protocol===HERMES_FINANCE_PROTOCOL&&age>=0&&age<90000&&row.maintenance_until<=Date.now();}
async function heartbeat(env,body){
 const keys=Object.keys(body),modern=body.protocol===HERMES_FINANCE_PROTOCOL;
 assert(keys.length===0||modern&&keys.every(key=>['protocol','drain'].includes(key))&&(!Object.hasOwn(body,'drain')||typeof body.drain==='boolean'),'HERMES_PROTOCOL_INVALID');
 const now=new Date().toISOString(),statements=[env.ADMIN_DB.prepare('INSERT INTO hermes_agent(id,heartbeat) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET heartbeat=excluded.heartbeat').bind(now)];
 if(modern)statements.push(env.ADMIN_DB.prepare('INSERT INTO hermes_agent_capabilities(id,protocol,updated_at,maintenance_until) VALUES(1,?,?,0) ON CONFLICT(id) DO UPDATE SET protocol=excluded.protocol,updated_at=excluded.updated_at').bind(HERMES_FINANCE_PROTOCOL,now));
 if(Object.hasOwn(body,'drain'))statements.push(env.ADMIN_DB.prepare('UPDATE hermes_agent_capabilities SET maintenance_until=? WHERE id=1').bind(body.drain?Date.now()+120000:0));
 await env.ADMIN_DB.batch(statements);
 if(Object.hasOwn(body,'drain')){const row=await env.ADMIN_DB.prepare("SELECT COUNT(*) AS n FROM hermes_jobs WHERE status='running'").first();return {ok:true,protocol:HERMES_FINANCE_PROTOCOL,draining:body.drain,safe_to_restart:row.n===0};}
 return modern?{ok:true,protocol:HERMES_FINANCE_PROTOCOL}:{ok:true};
}
async function budget(env){const month=new Date().toISOString().slice(0,7);return env.ADMIN_DB.prepare(`SELECT COALESCE(SUM(CASE WHEN COALESCE(json_extract(settings_snapshot,'$.billing_mode'),'unverified')='subscription' THEN 0 WHEN status IN ('queued','running') THEN reserve_cents WHEN status='completed' AND (cost_cents>0 OR (cost_cents=0 AND cost_source='operator_confirmed')) THEN cost_cents WHEN status IN ('completed','failed') THEN reserve_cents ELSE 0 END),0) AS committed_cents, SUM(CASE WHEN status='completed' AND COALESCE(json_extract(settings_snapshot,'$.billing_mode'),'unverified')<>'subscription' AND (cost_cents IS NULL OR (cost_cents=0 AND COALESCE(cost_source,'')<>'operator_confirmed')) THEN 1 ELSE 0 END) AS unknown_cost_runs,COUNT(CASE WHEN status<>'cancelled' THEN 1 END) AS total_runs FROM hermes_jobs WHERE substr(created_at,1,7)=?`).bind(month).first();}
async function enqueue(env,trigger='manual',dedupe=null){
 const state=await settings(env);assert(state.values.hermes_mode!=='paused','HERMES_PAUSED',409);assert(await connected(env),'HERMES_DISCONNECTED',503);assert(await financeBridgeReady(env),'HERMES_FINANCE_UPGRADE_REQUIRED',409);
 const date=yesterday(),task={type:'daily_review',shop_id:'1178167501',start_date:date,end_date:date,ads_execution:'LOCKED'},taskRaw=JSON.stringify(task);
 const id=crypto.randomUUID(),now=new Date().toISOString(),month=now.slice(0,7);
 const snapshot=await prepareHermesFinancialContext(env,id,date,{taskRaw});
 const statement=env.ADMIN_DB.prepare(`INSERT OR IGNORE INTO hermes_jobs(id,trigger_type,dedupe_key,status,task,settings_revision,settings_snapshot,reserve_cents,created_at)
 SELECT ?,?,?,'queued',?,?,?,?,?
 WHERE NOT EXISTS(SELECT 1 FROM hermes_jobs WHERE status IN ('queued','running'))
 AND (?='subscription' OR (
 NOT EXISTS(SELECT 1 FROM hermes_jobs WHERE status='completed' AND COALESCE(json_extract(settings_snapshot,'$.billing_mode'),'unverified')<>'subscription' AND (cost_cents IS NULL OR (cost_cents=0 AND COALESCE(cost_source,'')<>'operator_confirmed')) AND substr(created_at,1,7)=?)
 AND (SELECT COALESCE(SUM(CASE WHEN COALESCE(json_extract(settings_snapshot,'$.billing_mode'),'unverified')='subscription' THEN 0 WHEN status IN ('queued','running') THEN reserve_cents WHEN status='completed' AND (cost_cents>0 OR (cost_cents=0 AND cost_source='operator_confirmed')) THEN cost_cents WHEN status IN ('completed','failed') THEN reserve_cents ELSE 0 END),0) FROM hermes_jobs WHERE substr(created_at,1,7)=?)+?<=?))
 AND (SELECT COUNT(*) FROM hermes_jobs WHERE substr(created_at,1,7)=? AND status<>'cancelled')<?
 AND EXISTS(SELECT 1 FROM admin_settings WHERE id=1 AND revision=?)
 AND EXISTS(SELECT 1 FROM hermes_agent_capabilities WHERE id=1 AND protocol=? AND maintenance_until<=?)`).bind(id,trigger,dedupe,taskRaw,state.revision,JSON.stringify(state.values),state.values.run_reserve_cents,now,state.values.billing_mode,month,month,state.values.run_reserve_cents,state.values.monthly_budget_cents,month,state.values.monthly_run_limit,state.revision,HERMES_FINANCE_PROTOCOL,Date.now());
 const results=await env.ADMIN_DB.batch([statement,snapshot.statement]);
 assert(results[0].meta.changes===1,'RUN_BLOCKED_CHECK_BUDGET_COST_OR_ACTIVE_JOB',409);assert(results[1].meta.changes===1,'HERMES_CONTEXT_STORAGE_INVALID',503);return {id,status:'queued'};
}
function access(values,isConnected,account,rows,financeReady){
 let reason=null;
 if(!isConnected)reason='disconnected';else if(values.hermes_mode==='paused')reason='paused';else if(!financeReady)reason='bridge_upgrade_required';else if(rows.some(job=>['queued','running'].includes(job.status)))reason='active';else if(account.total_runs>=values.monthly_run_limit)reason='run_limit';else if(values.billing_mode!=='subscription'&&account.unknown_cost_runs>0)reason='cost_unconfirmed';else if(values.billing_mode!=='subscription'&&account.committed_cents+values.run_reserve_cents>values.monthly_budget_cents)reason='budget';
 return {allowed:reason===null,reason};
}
async function live(env){const cfg=await settings(env),isConnected=await connected(env),financeReady=await financeBridgeReady(env),account=await budget(env),rows=(await env.ADMIN_DB.prepare(`SELECT id,json_extract(task,'$.start_date') AS start_date,json_extract(task,'$.end_date') AS end_date,trigger_type,status,settings_revision,reserve_cents,cost_cents,cost_source,result,failure,created_at,started_at,completed_at FROM hermes_jobs ORDER BY created_at DESC LIMIT 30`).all()).results;return {store_orders:{status:'ON_DEMAND_SOURCE',date:localDay(),timezone:'America/Sao_Paulo',total:null},hermes_connected:isConnected,hermes_finance_ready:financeReady,mode:cfg.values.hermes_mode,billing_mode:cfg.values.billing_mode,monthly_run_limit:cfg.values.monthly_run_limit,budget:account,rows,execution_access:access(cfg.values,isConnected,account,rows,financeReady)};}

async function claim(env){
 const cfg=await settings(env);if(cfg.values.hermes_mode==='paused')return null;
 const queued=await env.ADMIN_DB.prepare("SELECT id,task,created_at FROM hermes_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1").first();if(!queued)return null;
 // Read and validate the immutable snapshot before acquiring a paid execution.
 const snapshot=await readHermesFinancialContext(env,queued.id),lease=crypto.randomUUID(),now=new Date().toISOString();
 const contextGuard=snapshot.persisted?'EXISTS(SELECT 1 FROM hermes_financial_contexts WHERE job_id=? AND fingerprint=? AND payload=?)':'NOT EXISTS(SELECT 1 FROM hermes_financial_contexts WHERE job_id=?)';
 const bindings=[lease,now,queued.id,queued.task,queued.created_at,Date.now(),...(snapshot.persisted?[queued.id,snapshot.fingerprint,snapshot.payload]:[queued.id])];
 const job=await env.ADMIN_DB.prepare(`UPDATE hermes_jobs SET status='running',lease=?,started_at=? WHERE id=? AND task=? AND created_at=? AND status='queued'
 AND (SELECT json_extract(payload,'$.hermes_mode') FROM admin_settings WHERE id=1)<>'paused'
 AND COALESCE((SELECT maintenance_until FROM hermes_agent_capabilities WHERE id=1),0)<=?
 AND ${contextGuard} RETURNING id,task,settings_revision,settings_snapshot,lease`).bind(...bindings).first();
 return job?{...job,financial_context:snapshot.payload,financial_context_fingerprint:snapshot.fingerprint}:null;
}
async function finish(env,body){
 assert(typeof body.id==='string'&&typeof body.lease==='string','JOB_INVALID');assert(['completed','failed'].includes(body.status),'JOB_STATUS_INVALID');
 assert(body.cost_cents===null||(Number.isInteger(body.cost_cents)&&body.cost_cents>=0&&body.cost_cents<=100000000),'COST_INVALID');
 assert(body.status!=='failed'||body.failure==='EXECUTION_FAILED','FAILURE_INVALID');assert(body.status!=='completed'||(typeof body.result==='string'&&body.result.length<=12000),'RESULT_INVALID');
 const running=await env.ADMIN_DB.prepare("SELECT id,task,created_at FROM hermes_jobs WHERE id=? AND status='running' AND lease=?").bind(body.id,body.lease).first();assert(running,'JOB_LEASE_REJECTED',409);
 const snapshot=await readHermesFinancialContext(env,body.id);
 if(snapshot.persisted||Object.hasOwn(body,'financial_context_fingerprint'))assert(body.financial_context_fingerprint===snapshot.fingerprint,'HERMES_CONTEXT_FINGERPRINT_MISMATCH',409);
 const contextGuard=snapshot.persisted?'EXISTS(SELECT 1 FROM hermes_financial_contexts WHERE job_id=? AND fingerprint=? AND payload=?)':'NOT EXISTS(SELECT 1 FROM hermes_financial_contexts WHERE job_id=?)';
 const bindings=[body.status,body.cost_cents,body.status==='completed'?body.result:null,body.status==='failed'?'EXECUTION_FAILED':null,new Date().toISOString(),body.cost_cents===null?null:'agent_estimate',body.id,body.lease,running.task,running.created_at,...(snapshot.persisted?[body.id,snapshot.fingerprint,snapshot.payload]:[body.id])];
 const result=await env.ADMIN_DB.prepare(`UPDATE hermes_jobs SET status=?,cost_cents=?,result=?,failure=?,completed_at=?,cost_source=?,lease=NULL WHERE id=? AND status='running' AND lease=? AND task=? AND created_at=? AND ${contextGuard}`).bind(...bindings).run();
 assert(result.meta.changes===1,'JOB_LEASE_REJECTED',409);return {ok:true};
}
async function correctCost(env,body,actor){assert(Object.keys(body).length===2&&typeof body.id==='string'&&Number.isInteger(body.cost_cents)&&body.cost_cents>=0&&body.cost_cents<=100000000,'COST_INVALID');const now=new Date().toISOString();const results=await env.ADMIN_DB.batch([env.ADMIN_DB.prepare("INSERT INTO hermes_cost_audit(job_id,previous_cents,cost_cents,actor,created_at) SELECT id,cost_cents,?,?,? FROM hermes_jobs WHERE id=? AND status IN ('completed','failed')").bind(body.cost_cents,actor,now,body.id),env.ADMIN_DB.prepare("UPDATE hermes_jobs SET cost_cents=?,cost_source='operator_confirmed' WHERE id=? AND status IN ('completed','failed')").bind(body.cost_cents,body.id)]);assert(results[1].meta.changes===1,'COST_JOB_NOT_COMPLETED',409);return {ok:true};}
async function schedule(env,now=new Date()){await setup(env);const cfg=await settings(env);if(cfg.values.hermes_mode!=='scheduled')return;const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(now));if(hour<cfg.values.daily_hour)return;try{await enqueue(env,'scheduled','daily:'+localDay(now));}catch(error){if(!(error instanceof AdminError))throw error;}}
function page(body,title='MLS Commerce OS · Gestão da loja'){return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>${BRAZA_THEME_HEAD}<style>${BRAZA_THEME_CSS}\n${CSS}</style></head><body>${body}</body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' blob: data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'same-origin'}});}
function loginPage(error=''){return page(loginBody(error));}

function panelDiagnosticsPage(){return page("\n<style>\n.mls-diag{max-width:780px;margin:28px auto;padding:24px;background:var(--surface,#fff);border:1px solid var(--line,#ddd);border-radius:16px;color:var(--text,#222);box-sizing:border-box}\n.mls-diag h1{font-size:22px;margin:4px 0 12px}.mls-diag p{font-size:13px;line-height:1.65}\n.mls-diag .mls-diag-tools{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}\n.mls-diag button,.mls-diag a.mls-diag-back{padding:10px 14px;border:1px solid var(--line,#ddd);border-radius:9px;font-size:12px;background:var(--surface-raised,#eee);color:var(--text,#222);text-decoration:none;cursor:pointer}\n.mls-diag textarea{box-sizing:border-box;width:100%;min-height:255px;padding:12px;resize:vertical;font:12px/1.6 monospace;background:var(--surface,#fff);color:var(--text,#222);border:1px solid var(--line,#ddd);border-radius:10px}\n</style>\n<main class=\"mls-diag\"><span class=\"eyebrow\">MLS COMMERCE OS</span>\n<h1>Diagnóstico seguro do painel</h1>\n<p>Esta tela funciona separadamente da Central de Comando. Verifica a sessão, uma leitura simples do D1 e o resumo mensal já existente. Não altera campanhas, pedidos, custos ou configurações.</p>\n<p id=\"mlsDiagStatus\" role=\"status\" aria-live=\"polite\">Verificando as três etapas…</p>\n<div class=\"mls-diag-tools\"><button id=\"mlsDiagRetry\" type=\"button\">Verificar novamente</button><button id=\"mlsDiagCopy\" type=\"button\">Copiar diagnóstico</button><a class=\"mls-diag-back\" href=\"/admin?tab=overview\">Voltar à Central</a></div>\n<label for=\"mlsDiagOutput\">Resultado seguro para compartilhar (sem credenciais e sem dados de pedidos)</label>\n<textarea id=\"mlsDiagOutput\" readonly spellcheck=\"false\">Preparando diagnóstico…</textarea>\n<p>Se o resumo mensal falhar mas a leitura simples do D1 funcionar, o problema pode estar na inicialização ou no contrato financeiro. Não envie senhas, cookies, tokens nem capturas da aba de requisições completas.</p></main>\n<script>\n(()=>{\n const out=document.getElementById('mlsDiagOutput'),status=document.getElementById('mlsDiagStatus'),retry=document.getElementById('mlsDiagRetry'),copy=document.getElementById('mlsDiagCopy');\n const release='p1-diagnostics-20261027-v1';\n let busy=false;\n const nowMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);\n const code=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{2,79}$/.test(value)?value:null;\n const schema=value=>typeof value==='string'&&/^[a-z][a-z0-9_]{2,79}$/.test(value)?value:null;\n async function request(path,ms,headers={}){\n  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),ms),start=Date.now();\n  try{\n   const response=await fetch(path,{method:'GET',credentials:'same-origin',cache:'no-store',headers,signal:controller.signal});\n   const contentType=response.headers.get('content-type')||'';\n   const data=contentType.includes('application/json')?await response.json().catch(()=>null):null;\n   return {http:response.status,elapsed_ms:Math.min(60000,Date.now()-start),error:code(data?.error),schema:schema(data?.schema),d1:code(data?.d1_probe),release:code(data?.release)};\n  }catch(error){return {http:null,elapsed_ms:Math.min(60000,Date.now()-start),error:controller.signal.aborted?'TIMEOUT':'NETWORK_FAILURE'};}\n  finally{clearTimeout(timer);}\n }\n async function markup(){\n  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000),start=Date.now();\n  try{\n   const response=await fetch('/admin?tab=overview',{credentials:'same-origin',cache:'no-store',signal:controller.signal});\n   if(!response.ok)return {http:response.status,error:'HTTP_ERROR'};\n   const html=await response.text();\n   return {http:response.status,elapsed_ms:Math.min(60000,Date.now()-start),command_center:html.includes('id=\"commandCenter\"'),agent_cards:html.includes('data-agent-placeholder=\"true\"'),startup_retry:html.includes('id=\"startupRetry\"'),diagnostic_link:html.includes('href=\"/admin/diagnostics\"')};\n  }catch(error){return {http:null,error:controller.signal.aborted?'TIMEOUT':'NETWORK_FAILURE'};}\n  finally{clearTimeout(timer);}\n }\n async function run(){\n  if(busy)return;\n  busy=true;retry.disabled=true;status.textContent='Verificando autenticação e banco…';\n  const report={schema:'mls_owner_panel_report_v1',release,checked_at:new Date().toISOString(),month:nowMonth(),owner_probe:null,admin_markup:null,finance_month:null};\n  try{\n   report.owner_probe=await request('/api/admin/diagnostics',8000);\n   status.textContent='Verificando a estrutura da Central…';\n   report.admin_markup=await markup();\n   status.textContent='Verificando consulta financeira salva…';\n   report.finance_month=await request('/api/admin/finance/business-month-view?month='+encodeURIComponent(report.month),20000,{'X-Braza-Client-Contract':'business-month-view-v4'});\n   status.textContent='Diagnóstico concluído. Use Copiar diagnóstico para compartilhar apenas os códigos.';\n  }catch{status.textContent='Não foi possível concluir todos os testes. Copie as etapas disponíveis.';}\n  finally{out.value=JSON.stringify(report,null,2);busy=false;retry.disabled=false;}\n }\n retry.addEventListener('click',run);\n copy.addEventListener('click',async()=>{\n  try{\n   if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');\n   await navigator.clipboard.writeText(out.value);status.textContent='Diagnóstico copiado. Não contém dados de pedidos ou credenciais.';\n  }catch{out.focus();out.select();status.textContent='Selecione o texto do diagnóstico e copie manualmente.';}\n });\n run();\n})();\n</script>\n",'MLS Commerce OS · Diagnóstico seguro');}
async function panelD1Probe(env){
 const start=Date.now();
 if(!env.ADMIN_DB||typeof env.ADMIN_DB.prepare!=='function')return {schema:'mls_owner_diagnostic_v1',release:'P1_DIAGNOSTICS_20261027_V1',owner_session:'VALID',d1_probe:'BINDING_MISSING',duration_ms:0};
 let timer;
 const deadline=new Promise(resolve=>{timer=setTimeout(()=>resolve({state:'TIMEOUT'}),3500);});
 const database=Promise.resolve().then(()=>env.ADMIN_DB.prepare('SELECT 1 AS ok').first())
  .then(value=>({state:value?.ok===1?'READY':'INVALID_RESULT'}))
  .catch(error=>({state:isD1DailyLimitError(error)?'DAILY_LIMIT':'QUERY_FAILED'}));
 try{
  const value=await Promise.race([deadline,database]);
  return {schema:'mls_owner_diagnostic_v1',release:'P1_DIAGNOSTICS_20261027_V1',owner_session:'VALID',d1_probe:value.state,duration_ms:Math.max(0,Math.min(3500,Date.now()-start))};
 }finally{clearTimeout(timer);}
}

async function scheduledWork(env,services,now=()=>Date.now()){
 await setup(env);
 const output={analysis:'DEFERRED',collection:'DEFERRED',classification:'DEFERRED',production:'DEFERRED',registry:'DEFERRED',costs:'DEFERRED',history:'DEFERRED',reconciliation:'DEFERRED',releases:'DEFERRED',income:'DEFERRED',income_detail:'DEFERRED',lane:'MAINTENANCE'};
 // First-time corrections can themselves consume the invocation budget. The
 // marker is consumed once even if an owner request initialized this isolate.
 if(MAINTENANCE_PENDING.delete(env.ADMIN_DB)){output.collection='MAINTENANCE';return output;}
 const month=localDay(new Date(now())).slice(0,7),lease=await acquireBackgroundLane(env,{month},{now});output.lane=lease.lane;
 if(lease.lane==='LEASED')return {...output,collection:'LEASED'};
 let repeatHistory=false;const canRun=async()=>(await readBusinessSyncState(env)).enabled;
 const productionSource=async(...args)=>{if(!await canRun())throw Error('BACKGROUND_COLLECTION_PAUSED');return services.getFinanceProductionOrders(...args);};
 try{
  if(lease.lane==='PAUSED'){for(const key of ['collection','classification','production','registry','costs','history','reconciliation','releases','income','income_detail'])output[key]='PAUSED';return output;}
  if(lease.lane==='FINANCE'){
   // Retain the previous complete creation-date cohort before opening a day.
   try{await captureProductionCostMonth(env,month,{now});}catch{}
   try{output.collection=(await runBusinessSync(env,services,{now})).status;}catch{output.collection='ERROR';}
  }else if(lease.lane==='HISTORY'){
   try{const selection=await readHistoricalCostCandidates(env,month,{now});output.history=selection.status;
    if(selection.ready&&typeof services?.getFinanceHistoricalVariantEvidence==='function'){
     const historical=await syncHistoricalCostEvidence(env,{month,item_ids:selection.item_ids},services.getFinanceHistoricalVariantEvidence,{now,canRun});output.history=historical.work;repeatHistory=historical.work==='PROGRESSED'&&!historical.scan.complete;
    }else if(selection.ready)output.history='UNAVAILABLE';
    if(!selection.ready&&(typeof services?.getFinanceReconciliation==='function'||typeof services?.getFinanceEscrowReleases==='function'||typeof services?.getFinanceIncomeOverview==='function'||typeof services?.getFinanceIncomeDetail==='function')){
     const audit=await runBusinessFinancialAudits(env,services,{month},{now,canRun});
     output.reconciliation=audit.returns_status;output.releases=audit.releases_status;output.income=audit.income_status;output.income_detail=audit.income_detail_status;repeatHistory=audit.repeat;
    }
   }catch{output.history='ERROR';}
  }else if(lease.lane==='CATALOG'){
   if(typeof services?.getFinanceVariantCatalog!=='function')output.classification='UNAVAILABLE';
   else try{const classification=await runCatalogClassifications(env,services.getFinanceVariantCatalog,{now,maxProducts:3,canRun});output.classification=classification.status;
    if(classification.processed.length)await businessMonthWithCheckpoint(env,{operation:'read',month},{},{now,actor:'catalog-classification'});
   }catch{output.classification='ERROR';}
  }else if(lease.lane==='REGISTRY'){
   if(typeof services?.getFinanceProductIndex!=='function')output.registry='UNAVAILABLE';
   else try{output.registry=(await runProductRegistry(env,services.getFinanceProductIndex,{now,canRun})).status;}catch{output.registry='ERROR';}
  }else if(lease.lane==='PRODUCTION'){
   if(typeof services?.getFinanceProductionOrders!=='function')output.production='UNAVAILABLE';
   else try{if(!await canRun())output.production='PAUSED';else{await syncProductionDtf(env,productionSource,{now});output.production='CHECKED';}}catch{output.production='ERROR';}
  }else if(lease.lane==='COSTS'){
   if(typeof services?.getFinanceProductionOrders!=='function')output.costs='UNAVAILABLE';
   else try{if(!await canRun())output.costs='PAUSED';else output.costs=(await productionCostPeriods(env,{operation:'sync',month},{...services,getFinanceProductionOrders:productionSource},{now})).weekly.state;}catch{output.costs='ERROR';}
  }else if(lease.lane==='ANALYSIS'){
   try{await schedule(env,new Date(now()));output.analysis='CHECKED';}catch{output.analysis='UNAVAILABLE';}
  }
  return output;
 }finally{try{await finishBackgroundLane(env,lease,{now,repeatHistory});}catch{}}
}
async function workspaceAuthFetch(request,env){return handleWorkspaceAuth(request,env,{renderLogin:loginPage,renderLogout:current=>page('<main class="login card"><div class="brand"><span class="brand-mark">MLS</span><div>MLS Commerce OS<small>Sua conta</small></div></div><h1>Sair da sua conta?</h1><p class="muted">Você precisará entrar novamente para acessar o painel.</p><form action="/logout" method="post"><input type="hidden" name="csrf" value="'+current.csrf+'"><button type="submit">Sair</button></form><p><a href="'+(current.role==='owner'?'/admin':'/dashboard')+'">Continuar no painel</a></p></main>')});}
function costDiagnosticsSelection(url,{recovery=false}={}){
 const entries=[...url.searchParams],seen=new Set();let month,evidence=false;
 for(const [key,value] of entries){assert(!seen.has(key)&&(['evidence',...(recovery?[]:['month'])].includes(key)),'BUSINESS_COST_DIAGNOSTICS_REQUEST_INVALID');seen.add(key);if(key==='evidence'){assert(['history-v1','history-v2','history-v3'].includes(value),'BUSINESS_COST_DIAGNOSTICS_REQUEST_INVALID');evidence=value;}else month=value;}
 assert(recovery||seen.has('month'),'BUSINESS_COST_DIAGNOSTICS_REQUEST_INVALID');return {month,evidence};
}
async function stableCostDiagnostics(env,month,{evidence=false}={}){const read=evidence==='history-v3'?readBusinessCostDiagnosticsEvidenceV3:evidence==='history-v2'?readBusinessCostDiagnosticsEvidenceV2:evidence?readBusinessCostDiagnosticsEvidence:readBusinessCostDiagnostics;let value=await read(env,{month});if(!(evidence?value.diagnostic:value).consistent)value=await read(env,{month});return value;}
function historicalRecoveryCandidates(diagnostic){return diagnostic.products.filter(product=>product.variants.some(variant=>['NO_CATALOG','MODEL_NOT_IN_CATALOG'].includes(variant.reason))).map(product=>product.item_id);}
async function recoverMonthlyCosts(env,month,services,{evidence=false}={}){
 let snapshot;const read=async()=>{snapshot=await stableCostDiagnostics(env,month,{evidence});return evidence?snapshot.diagnostic:snapshot;};
 let diagnostic=await read();const work={status:'IDLE',processed:[],failed:[]},response=()=>({schema:'business_cost_recovery_v1',month,diagnostic:evidence?snapshot:diagnostic,work});
 if(!(await readBusinessSyncState(env)).enabled){work.status='PAUSED';return response();}if(!diagnostic.consistent)return response();
 // Current catalogues cannot name a deleted variation. Read one bounded page
 // of the original order metadata before repeating the same catalogue request.
 const historicalIds=historicalRecoveryCandidates(diagnostic);
 if(historicalIds.length&&typeof services.getFinanceHistoricalVariantEvidence==='function'){
  const selected=await readHistoricalCostCandidates(env,month,{itemIds:historicalIds});
  if(['PAUSED','LEASED','RETRY_WAIT'].includes(selected.status)){work.status=selected.status;return response();}
  const historical=selected.item_ids.length?await syncHistoricalCostEvidence(env,{month,item_ids:selected.item_ids},services.getFinanceHistoricalVariantEvidence,{canRun:async()=>(await readBusinessSyncState(env)).enabled}):{work:'IDLE'};
  if(historical.work!=='COMPLETE'&&historical.work!=='IDLE'){
   work.status=historical.work==='ERROR'?'RETRY_WAIT':historical.work;
   if(historical.work==='PROGRESSED')work.processed=selected.item_ids;
   if(historical.work==='ERROR')work.failed=selected.item_ids;
   diagnostic=await read();return response();
  }
 }
 const missing=diagnostic.products.flatMap(product=>product.variants.filter(variant=>variant.recoverable).map(variant=>({item_id:product.item_id,model_id:variant.model_id,quantity:variant.quantity})));
 if(missing.length)await enqueueSoldCatalogGaps(env,missing);
 diagnostic=await read();if(!diagnostic.consistent)return response();
 const related=diagnostic.products.filter(product=>product.variants.some(variant=>['NO_CATALOG','MODEL_NOT_IN_CATALOG','METADATA_CHANGED'].includes(variant.reason))),ids=related.filter(product=>product.variants.some(variant=>variant.recoverable)).map(product=>product.item_id);
 if(ids.length){assert(typeof services.getFinanceVariantCatalog==='function','BUSINESS_COST_RECOVERY_SOURCE_UNAVAILABLE',503);const result=await runCatalogClassifications(env,services.getFinanceVariantCatalog,{maxProducts:1,itemIds:ids,canRun:async()=>(await readBusinessSyncState(env)).enabled});work.status=result.status;work.processed=result.processed;work.failed=result.failed;diagnostic=await read();}
 if(work.status==='IDLE'){if(related.some(product=>product.classification?.status==='RUNNING'))work.status='LEASED';else if(related.some(product=>product.classification?.status==='RETRY_WAIT'&&product.classification.next_attempt_at>diagnostic.diagnosed_at))work.status='RETRY_WAIT';}
 return response();
}
async function catalogStateForOwner(env,state){
 const enabled=(await readBusinessSyncState(env)).enabled;
 if(!state.products.length)return {...state,enabled};
 const itemIds=state.products.map(row=>row.item_id);
 const [reference,costs,bindings]=await Promise.all([readCostRuleReference(env,itemIds),readProductionCosts(env),readVariantBindings(env)]);
 const rows=state.products.flatMap(product=>product.variants.map(variant=>({item_id:product.item_id,model_id:variant.model_id,quantity:1}))),priced=new Map();
 for(let offset=0;offset<rows.length;offset+=1000){const result=productionCostReference({status:'AVAILABLE',rows:rows.slice(offset,offset+1000)},bindings,costs,reference);for(const row of result.variants)priced.set(row.item_id+':'+row.model_id,row.unit_cost_cents);}
 const ruleReasons=new Map(reference.variants.map(row=>[row.item_id+':'+row.model_id,row.reason]));
 const products=state.products.map(product=>{
  const variants=product.variants.map(variant=>{
   const key=product.item_id+':'+variant.model_id,known=priced.get(key)!==null&&priced.has(key);
   return {...variant,reason:known?null:ruleReasons.get(key)||variant.reason||'NO_COST_REGISTERED'};
  });
  if(!product.variants_complete||['QUEUED','RUNNING','RETRY_WAIT'].includes(product.status))return {...product,variants};
  const resolved=variants.filter(row=>row.reason===null).length;
  return {...product,variants,resolved_count:resolved,status:resolved===product.model_count&&resolved>0?'MATCHED':resolved?'PARTIAL':'REVIEW',reason:resolved===product.model_count&&resolved>0?null:variants.find(row=>row.reason!==null)?.reason||product.reason};
 });
 return {...state,products,enabled};
}
function dashboard(){
 const markup='<style>'+BUSINESS_MONTH_CSS+AUTOMATION_WORKSPACE_CSS+COST_RULE_CSS+DTF_CSS+PRODUCTION_COST_PERIODS_CSS+SAVED_CATALOG_CSS+'</style>'+adminBody().replace('<div id="missionHermesTools"></div>','<div id="missionHermesTools">'+automationWorkspaceBody()+'</div>').replace('<section id="margins" hidden>','<section id="margins" hidden>'+productionCostPeriodsBody()+costRulesBody()).replace('<section id="products" hidden>',dtfBody()+'<section id="products" hidden>'+savedCatalogBody())+'<script>'+DTF_ENGINE_CLIENT+'</script><script>'+DTF_CLIENT+'</script><script>'+COST_RULE_CLIENT+'</script><script>'+AUTOMATION_WORKSPACE_CLIENT+'</script><script>'+BUSINESS_MONTH_CLIENT+'</script><script>'+INCOME_OVERVIEW_CLIENT+'</script><script>'+AGENT_REGISTRY_CLIENT+'</script><script>'+MISSION_CLIENT+'</script><script>'+MISSION_TRENDS_CLIENT+'</script><script>'+PRODUCTION_COST_PERIODS_CLIENT+'</script><script>'+SAVED_CATALOG_CLIENT+'</script><script>'+CLIENT+'</script>';
 // Raw control bytes inside inlined JavaScript are changed by the HTML
 // tokenizer (U+0000 becomes U+FFFD), which can invalidate a regex character
 // class before any client initializer runs. Encode these bytes as JavaScript
 // unicode escapes before sending the document; preserve normal whitespace.
 const safe=markup.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
  character=>'\\u'+character.charCodeAt(0).toString(16).padStart(4,'0'));
 return page(safe);
}

async function adminFetch(request,env,services={}){const url=new URL(request.url),path=url.pathname;try{
 if(path.startsWith('/api/hermes/')){
  assert(typeof env.HERMES_BRIDGE_SECRET==='string'&&env.HERMES_BRIDGE_SECRET.length>=32,'HERMES_BRIDGE_SETUP_REQUIRED',503);
  assert(await equal(request.headers.get('authorization')||'','Bearer '+env.HERMES_BRIDGE_SECRET),'UNAUTHORIZED',401);assert(request.method==='POST','METHOD_NOT_ALLOWED',405);
  assert(!url.search,'HERMES_QUERY_INVALID');assert(['/api/hermes/heartbeat','/api/hermes/claim','/api/hermes/finish'].includes(path),'NOT_FOUND',404);
  await setup(env);const body=await input(request,path==='/api/hermes/finish'?65536:1024);
  if(path==='/api/hermes/heartbeat')return json(await heartbeat(env,body));
  if(path==='/api/hermes/claim'){
   if(Object.keys(body).length===0)return json({job:null,reason:'HERMES_BRIDGE_UPGRADE_REQUIRED'});
   assert(Object.keys(body).length===1&&body.protocol===HERMES_FINANCE_PROTOCOL,'HERMES_PROTOCOL_INVALID');return json({job:await claim(env)});
  }
  return json(await finish(env,body));
 }
 if(['/','/login','/admin/login','/logout','/admin/logout'].includes(path))return workspaceAuthFetch(request,env);
 const current=await session(request,env);if(!current)return path.startsWith('/api/')?json({error:'UNAUTHORIZED'},401):Response.redirect(url.origin+'/login',303);
 if(path==='/admin/diagnostics'){assert(request.method==='GET','METHOD_NOT_ALLOWED',405);assert(!url.search,'ADMIN_DIAGNOSTICS_REQUEST_INVALID');return panelDiagnosticsPage();}
 if(path==='/api/admin/diagnostics'){assert(request.method==='GET','METHOD_NOT_ALLOWED',405);assert(!url.search,'ADMIN_DIAGNOSTICS_REQUEST_INVALID');return json(await panelD1Probe(env));}
 if(path==='/admin'){assert(request.method==='GET','METHOD_NOT_ALLOWED',405);return dashboard();}
 // Session confirmation must remain independent of storage initialization,
 // financial collection and optional settings or assistant status reads.
 if(path==='/api/admin/bootstrap'){
  assert(request.method==='GET','METHOD_NOT_ALLOWED',405);assert(!url.search,'ADMIN_BOOTSTRAP_REQUEST_INVALID');
  return json({schema:'admin_bootstrap_v1',csrf:current.csrf});
 }
 assert(path.startsWith('/api/admin/'),'NOT_FOUND',404);await setup(env);
 if(path==='/api/admin/finance/expense-ledger'){
  assert(['GET','POST'].includes(request.method),'METHOD_NOT_ALLOWED',405);
  if(request.method==='GET'){const entries=[...url.searchParams];assert(entries.length===1&&entries[0][0]==='month','EXPENSE_LEDGER_REQUEST_INVALID');return json(await readExpenseLedger(env,{month:entries[0][1]}));}
  assert(!url.search,'EXPENSE_LEDGER_REQUEST_INVALID');sameOrigin(request);assert(await equal(request.headers.get('x-csrf-token')||'',current.csrf),'CSRF_REJECTED',403);
  return json(await mutateExpenseLedger(env,await input(request,4096),current.user));
 }
 if(path==='/api/admin/production-costs/confirmed-references'){
  assert(request.method==='GET','METHOD_NOT_ALLOWED',405);assert(!url.search,'OPERATOR_COST_CORRECTION_REQUEST_INVALID');return json(await applyConfirmedOperatorCostCorrections(env));
 }
 if(path==='/api/admin/finance/business-month-ads-state'){
  assert(request.method==='GET','METHOD_NOT_ALLOWED',405);const entries=[...url.searchParams];assert(entries.length===1&&entries[0][0]==='month','BUSINESS_MONTH_REQUEST_INVALID');return json(await readBusinessMonthAdsState(env,entries[0][1]));
 }
 if(path==='/api/admin/finance/cost-diagnostics'){
  assert(request.method==='GET','METHOD_NOT_ALLOWED',405);const selection=costDiagnosticsSelection(url);return json(await stableCostDiagnostics(env,selection.month,{evidence:selection.evidence}));
 }
 if(path==='/api/admin/finance/cost-recovery'){
  assert(request.method==='POST','METHOD_NOT_ALLOWED',405);const selection=costDiagnosticsSelection(url,{recovery:true});sameOrigin(request);assert(await equal(request.headers.get('x-csrf-token')||'',current.csrf),'CSRF_REJECTED',403);const body=await input(request,128);assert(Object.keys(body).length===1&&Object.hasOwn(body,'month'),'BUSINESS_COST_DIAGNOSTICS_REQUEST_INVALID');return json(await recoverMonthlyCosts(env,body.month,services,{evidence:selection.evidence}));
 }
 if(path==='/api/admin/product-registry'){
  assert(request.method==='GET','METHOD_NOT_ALLOWED',405);const selection={},seen=new Set();
  for(const [key,value] of url.searchParams){assert(!seen.has(key)&&['limit','offset','search','item_status','item_id','variant_limit','variant_offset'].includes(key),'PRODUCT_REGISTRY_REQUEST_INVALID');seen.add(key);if(['limit','offset','variant_limit','variant_offset'].includes(key)){assert(/^(0|[1-9][0-9]{0,6})$/.test(value),'PRODUCT_REGISTRY_REQUEST_INVALID');selection[key]=Number(value);}else selection[key]=value;}
  return json(await readProductRegistry(env,selection));
 }
 if(path==='/api/admin/product-registry/sync'){
  assert(request.method==='POST','METHOD_NOT_ALLOWED',405);assert(!url.search,'PRODUCT_REGISTRY_REQUEST_INVALID');sameOrigin(request);assert(await equal(request.headers.get('x-csrf-token')||'',current.csrf),'CSRF_REJECTED',403);
  assert(Object.keys(await input(request,128)).length===0,'PRODUCT_REGISTRY_REQUEST_INVALID');return json(await runProductRegistry(env,services.getFinanceProductIndex,{canRun:async()=>(await readBusinessSyncState(env)).enabled,returnState:true}));
 }
 if(path==='/api/admin/production-costs/periods'){
  assert(['GET','POST'].includes(request.method),'METHOD_NOT_ALLOWED',405);
  if(request.method==='GET'){assert([...url.searchParams].length===1&&url.searchParams.has('month'),'PRODUCTION_COST_PERIODS_REQUEST_INVALID');return json(await productionCostPeriods(env,{operation:'read',month:url.searchParams.get('month')},{}));}
  assert(!url.search,'PRODUCTION_COST_PERIODS_REQUEST_INVALID');sameOrigin(request);assert(await equal(request.headers.get('x-csrf-token')||'',current.csrf),'CSRF_REJECTED',403);
  const body=await input(request,256);return json(await productionCostPeriods(env,body,services));
 }
 if(path==='/api/admin/catalog-classification'){
  assert(request.method==='GET','METHOD_NOT_ALLOWED',405);
  const entries=[...url.searchParams],keys=entries.map(([key])=>key);
  assert(new Set(keys).size===keys.length&&keys.every(key=>['item_ids','limit','offset'].includes(key)),'CATALOG_CLASSIFICATION_REQUEST_INVALID');
  const selection={};
  for(const name of ['limit','offset'])if(url.searchParams.has(name)){
   const value=url.searchParams.get(name);assert(/^(0|[1-9][0-9]{0,4})$/.test(value),'CATALOG_CLASSIFICATION_REQUEST_INVALID');selection[name]=Number(value);
  }
  if(url.searchParams.has('item_ids')){const ids=url.searchParams.get('item_ids').split(',');assert(ids.length>=1&&ids.length<=90&&new Set(ids).size===ids.length&&ids.every(id=>/^[1-9][0-9]{0,19}$/.test(id)),'CATALOG_CLASSIFICATION_REQUEST_INVALID');selection.item_ids=ids;}
  const state=await readCatalogClassificationState(env,selection);
  return json(await catalogStateForOwner(env,state));
 }
 if(path==='/api/admin/catalog-classification/sync'){
  assert(request.method==='POST','METHOD_NOT_ALLOWED',405);assert(!url.search,'CATALOG_CLASSIFICATION_REQUEST_INVALID');sameOrigin(request);assert(await equal(request.headers.get('x-csrf-token')||'',current.csrf),'CSRF_REJECTED',403);
  const body=await input(request,128);assert(Object.keys(body).length===0,'CATALOG_CLASSIFICATION_REQUEST_INVALID');
  const result=await runCatalogClassifications(env,services.getFinanceVariantCatalog,{maxProducts:1,canRun:async()=>(await readBusinessSyncState(env)).enabled});
  return json({...result,state:await catalogStateForOwner(env,result.state)});
 }
 if(path==='/api/admin/catalog-classification/enqueue'){
  assert(request.method==='POST','METHOD_NOT_ALLOWED',405);assert(!url.search,'CATALOG_CLASSIFICATION_REQUEST_INVALID');sameOrigin(request);assert(await equal(request.headers.get('x-csrf-token')||'',current.csrf),'CSRF_REJECTED',403);
  const body=await input(request,131072);assert(Object.keys(body).length===1&&Object.hasOwn(body,'item_ids'),'CATALOG_CLASSIFICATION_REQUEST_INVALID');
  const state=await enqueueCatalogClassifications(env,body.item_ids);
  return json(await catalogStateForOwner(env,state));
 }
 if(path==='/api/admin/production'||path.startsWith('/api/admin/production/')){
  assert(!url.search,'PRODUCTION_REQUEST_INVALID');
  if(path==='/api/admin/production'){assert(request.method==='GET','METHOD_NOT_ALLOWED',405);return json(await readProductionDtf(env));}
  assert(['settings','sync','batches','batches/action'].some(action=>path==='/api/admin/production/'+action),'NOT_FOUND',404);
  assert(request.method==='POST','METHOD_NOT_ALLOWED',405);sameOrigin(request);assert(await equal(request.headers.get('x-csrf-token')||'',current.csrf),'CSRF_REJECTED',403);
  const body=await input(request,path.endsWith('/batches')?131072:2048);
  if(path.endsWith('/settings'))return json(await saveProductionDtfSettings(env,body,current.user));
  if(path.endsWith('/sync')){assert(Object.keys(body).length===0,'PRODUCTION_REQUEST_INVALID');return json(await syncProductionDtf(env,services.getFinanceProductionOrders,{force:true}));}
  if(path.endsWith('/batches/action'))return json(await actProductionDtfBatch(env,body,services.getFinanceProductionOrders,current.user));
  return json(await prepareProductionDtfBatch(env,body,services.getFinanceProductionOrders,current.user));
 }
 if(path==='/api/admin/finance/escrow-releases'){
  assert(request.method==='GET','METHOD_NOT_ALLOWED',405);
  const entries=[...url.searchParams],keys=entries.map(([key])=>key),evidence=url.searchParams.get('evidence');assert(entries.length>=1&&entries.length<=2&&new Set(keys).size===keys.length&&keys.includes('month')&&keys.every(key=>['month','evidence'].includes(key))&&(evidence===null||evidence==='orders-v1'),'BUSINESS_ESCROW_RELEASES_REQUEST_INVALID');
  const month=url.searchParams.get('month');return json(await(evidence==='orders-v1'?readBusinessEscrowReleaseEvidence(env,{month}):readBusinessEscrowReleases(env,{month})));
 }
 if(path==='/api/admin/finance/escrow-release-coverage'){
  assert(request.method==='GET','METHOD_NOT_ALLOWED',405);const entries=[...url.searchParams];assert(entries.length===1&&entries[0][0]==='month','BUSINESS_ESCROW_RELEASE_COVERAGE_REQUEST_INVALID');return json(await readBusinessEscrowReleaseCoverage(env,{month:entries[0][1]}));
 }
 if(path==='/api/admin/finance/income-overview'){
  assert(request.method==='GET','METHOD_NOT_ALLOWED',405);assert([...url.searchParams].length===0,'BUSINESS_INCOME_OVERVIEW_REQUEST_INVALID');return json(await readBusinessIncomeOverview(env));
 }
 if(path==='/api/admin/finance/income-detail'){
  assert(request.method==='GET','METHOD_NOT_ALLOWED',405);assert([...url.searchParams].length===0,'BUSINESS_INCOME_DETAIL_REQUEST_INVALID');return json(await readBusinessIncomeDetail(env));
 }
 if(path==='/api/admin/finance/reconciliation'){
  assert(request.method==='GET','METHOD_NOT_ALLOWED',405);
  const entries=[...url.searchParams],keys=entries.map(([key])=>key),contract=url.searchParams.get('evidence');assert(entries.length>=1&&entries.length<=2&&new Set(keys).size===keys.length&&keys.includes('month')&&keys.every(key=>['month','evidence'].includes(key))&&(contract===null||['review-v1','refunds-v1'].includes(contract)),'BUSINESS_RECONCILIATION_REQUEST_INVALID');
  const read=contract==='refunds-v1'?readBusinessReconciliationMoney:contract==='review-v1'?readBusinessReconciliationEvidence:readBusinessReconciliation;
  return json(await read(env,{month:url.searchParams.get('month')}));
 }
 if(path==='/api/admin/finance/business-month-view'){
  assert(request.method==='GET','METHOD_NOT_ALLOWED',405);
  const entries=[...url.searchParams];assert(entries.length===1&&entries[0][0]==='month','BUSINESS_MONTH_REQUEST_INVALID');
  const contract=request.headers.get('x-braza-client-contract')??'business-month-view-v1';
  assert(['business-month-view-v1','business-month-view-v2','business-month-view-v3','business-month-view-v4'].includes(contract),'BUSINESS_MONTH_VIEW_CONTRACT_UNSUPPORTED',409);
  const observed=await readBusinessMonthDisplay(env,{month:entries[0][1]});
  const response=json(buildBusinessMonthView(observed,await readBusinessSyncState(env),{contract}));
  response.headers.set('x-braza-client-contract',contract);response.headers.set('vary','X-Braza-Client-Contract');return response;
 }
 if(path==='/api/admin/finance/business-month-request'){
  assert(request.method==='POST','METHOD_NOT_ALLOWED',405);sameOrigin(request);assert(await equal(request.headers.get('x-csrf-token')||'',current.csrf),'CSRF_REJECTED',403);assert(!url.search,'BUSINESS_MONTH_REQUEST_INVALID');
  return json(await requestBusinessMonthRefresh(env,await input(request,128)));
 }
 if(path==='/api/admin/finance/business-month'){
  const contract=request.headers.get('x-braza-client-contract');
  assert(contract===null||['business-month-v1','business-month-v2'].includes(contract),'BUSINESS_MONTH_CLIENT_CONTRACT_UNSUPPORTED',409);
  if(request.method==='GET'){
   const entries=[...url.searchParams];
   assert(entries.length===1&&entries[0][0]==='month'&&/^[2-9][0-9]{3}-(?:0[1-9]|1[0-2])$/.test(entries[0][1]),'BUSINESS_MONTH_REQUEST_INVALID');
   return businessMonthResponse(request,await businessMonthWithCheckpoint(env,{operation:'read',month:entries[0][1]},services,{actor:current.user}));
  }
  assert(request.method==='POST','METHOD_NOT_ALLOWED',405);
 }
 if(path==='/api/admin/finance/checkpoints'){
  assert(request.method==='GET','METHOD_NOT_ALLOWED',405);
  const entries=[...url.searchParams],keys=entries.map(([key])=>key);
  assert(entries.length>=1&&entries.length<=2&&new Set(keys).size===keys.length&&keys.every(key=>['month','limit'].includes(key))&&url.searchParams.has('month'),'BUSINESS_CHECKPOINT_REQUEST_INVALID');
  const rawLimit=url.searchParams.get('limit');
  assert(rawLimit===null||/^(?:[1-9]|1[0-9]|20)$/.test(rawLimit),'BUSINESS_CHECKPOINT_REQUEST_INVALID');
  return json(await readBusinessCheckpoints(env,{month:url.searchParams.get('month'),limit:rawLimit===null?10:Number(rawLimit)}));
 }
 if((path==='/api/admin/cost-rules'||path==='/api/admin/cost-rules/sync'||path==='/api/admin/cost-rules/assignments')&&request.method==='POST'){
  sameOrigin(request);assert(await equal(request.headers.get('x-csrf-token')||'',current.csrf),'CSRF_REJECTED',403);assert(!url.search,'COST_RULE_REQUEST_INVALID');
  const body=await input(request,path.endsWith('/sync')?512:131072);
  if(path.endsWith('/assignments'))return json(await assignCostRules(env,body,current.user));
  if(path.endsWith('/sync')){assert(Object.keys(body).length===2&&Object.hasOwn(body,'item_ids')&&Object.hasOwn(body,'force')&&typeof body.force==='boolean','COST_RULE_REQUEST_INVALID');return json(await syncCostRuleCatalog(env,body.item_ids,services.getFinanceVariantCatalog,{force:body.force}));}
  return json(await saveCostRules(env,body,current.user));
 }
 if(path==='/api/admin/finance/sync-policy'){
  assert(request.method==='POST','METHOD_NOT_ALLOWED',405);sameOrigin(request);assert(await equal(request.headers.get('x-csrf-token')||'',current.csrf),'CSRF_REJECTED',403);assert(!url.search,'BUSINESS_SYNC_REQUEST_INVALID');
  return json(await saveBusinessSyncPolicy(env,await input(request,512),current.user));
 }
 if(request.method==='POST'){sameOrigin(request);assert(await equal(request.headers.get('x-csrf-token')||'',current.csrf),'CSRF_REJECTED',403);const body=await input(request,path==='/api/admin/finance/business-month'?512:['/api/admin/finance/payment-sample','/api/admin/finance/payment-preview','/api/admin/finance/ads-period'].includes(path)?128:path==='/api/admin/production-costs'?196608:path==='/api/admin/variant-bindings'?393216:path==='/api/admin/variant-bindings/sync'?131072:path==='/api/admin/variant-bindings/automate'?256:16384);if(path==='/api/admin/finance/business-month'){assert(!url.search,'BUSINESS_MONTH_REQUEST_INVALID');
 if(Object.keys(body).length===2&&['start','step'].includes(body.operation)&&body.month===localDay().slice(0,7)&&(await readBusinessSyncState(env)).enabled){
  await requestBusinessMonthRefresh(env,{month:body.month});
  throw new BusinessMonthViewError('BUSINESS_MONTH_BACKGROUND_OWNED',409);
 }
 return businessMonthResponse(request,await businessMonthWithCheckpoint(env,body,services,{actor:current.user}));}if(path==='/api/admin/finance/ads-period'){
 assert(!url.search&&Object.keys(body).length===1&&Object.hasOwn(body,'run_id'),'STORE_ADS_REQUEST_INVALID');
 const selection=projectStorePeriodRequest({operation:'read',run_id:body.run_id});
 assert(selection,'STORE_ADS_REQUEST_INVALID');
 let raw;try{if(typeof services.getFinanceStorePeriod==='function')raw=await services.getFinanceStorePeriod(env,selection);}catch{}
 const frame=projectStorePeriodFrame(raw);
 assert(frame&&frame.run_id===selection.run_id,'STORE_PERIOD_UNAVAILABLE',503);
 assert(frame.status==='COMPLETE','STORE_ADS_PERIOD_NOT_READY',409);
 let report;try{if(typeof services.getAdsPeriod==='function')report=await services.getAdsPeriod(env,{start_date:frame.start_date,end_date:frame.end_date});}catch{}
 await cacheStoreAdsPeriod(env,frame,report);
 return json(await storePeriodBundle(env,frame));
 }if(path==='/api/admin/finance/store-period'||path==='/api/admin/finance/store-adjustments'){
 assert(!url.search,'STORE_PERIOD_REQUEST_INVALID');
 const adjustment=path==='/api/admin/finance/store-adjustments'?validateStoreAdjustmentBody(body):null;
 const selection=adjustment?{operation:'read',run_id:adjustment.run_id}:projectStorePeriodRequest(body);
 assert(selection,'STORE_PERIOD_REQUEST_INVALID');
 let raw;try{if(typeof services.getFinanceStorePeriod==='function')raw=await services.getFinanceStorePeriod(env,selection);}catch{}
 const frame=projectStorePeriodFrame(raw);
 assert(frame&&(selection.operation==='start'?frame.start_date===selection.start_date&&frame.end_date===selection.end_date:frame.run_id===selection.run_id),'STORE_PERIOD_UNAVAILABLE',503);
 if(adjustment)await saveStoreAdjustments(env,adjustment,current.user,frame);
 return json(await storePeriodBundle(env,frame));
 }if(path==='/api/admin/variant-bindings/sync'){
 assert(!url.search,'VARIANT_CATALOG_REQUEST_INVALID');
 return json(await syncVariantBindings(env,body,current.user,services.getFinanceVariantCatalog));
 }if(path==='/api/admin/finance/payment-preview'){assert(!url.search&&Object.keys(body).length===0,'FINANCE_SAMPLE_REQUEST_INVALID');let result;try{if(typeof services.getFinancePaymentPreview==='function')result=await services.getFinancePaymentPreview(env);}catch{}return json(projectAdminFinancePreview(result));}if(path==='/api/admin/finance/payment-sample'){assert(!url.search&&Object.keys(body).length===0,'FINANCE_SAMPLE_REQUEST_INVALID');let result;try{if(typeof services.getFinancePaymentSample==='function')result=await services.getFinancePaymentSample(env);}catch{}return json(projectFinanceSample(result));}if(path==='/api/admin/production-costs'){assert(!url.search,'COSTS_QUERY_INVALID');return json(await saveProductionCosts(env,body,current.user));}if(path==='/api/admin/variant-bindings/automate'){
 assert(!url.search&&Object.hasOwn(body,'revision')&&Object.hasOwn(body,'item_ids')&&Object.keys(body).length===(Object.hasOwn(body,'selling_unit')?3:2)&&Object.keys(body).every(key=>['revision','item_ids','selling_unit'].includes(key)),'VARIANT_CATALOG_REQUEST_INVALID');
 const selection=projectVariantCatalogRequest({item_ids:body.item_ids,...(Object.hasOwn(body,'selling_unit')?{selling_unit:body.selling_unit}:{})});
 assert(selection&&Number.isSafeInteger(body.revision)&&body.revision>=1&&body.revision<2147483647,'VARIANT_CATALOG_REQUEST_INVALID');
 const before=await readVariantBindings(env);
 assert(before.revision===body.revision,'VARIANT_BINDINGS_CHANGED_RELOAD',409);
 const unit=selection.selling_unit||'ONE_MALE_ONE_FEMALE_KIT';
 assert(unit==='AUTO'||!before.bindings.some(binding=>selection.item_ids.includes(binding.item_id)&&binding.operator_confirmed&&binding.selling_unit!==unit),'VARIANT_BINDING_COMPOSITION_CONFLICT',409);
 let raw;try{if(typeof services.getFinanceVariantCatalog==='function')raw=await services.getFinanceVariantCatalog(env,selection);}catch{}
 const catalog=projectVariantCatalog(raw);
 assert(catalog&&catalog.products.length===selection.item_ids.length&&catalog.products.every(product=>selection.item_ids.includes(product.item_id)&&(unit==='AUTO'||(product.selling_unit||'ONE_MALE_ONE_FEMALE_KIT')===unit)),'VARIANT_CATALOG_UNAVAILABLE',503);
 const saved=await saveAutomaticVariantBindings(env,body,{...catalog,products:catalog.products.map(({diagnostic,...product})=>product)},current.user);
 return json({...saved,...(catalog.products.some(product=>product.diagnostic)?{catalog_review:catalog}:{})});
 }if(path==='/api/admin/tax-policy'){assert(!url.search,'BUSINESS_TAX_POLICY_QUERY_INVALID');return json(await saveBusinessTaxPolicy(env,body,current.user));}if(path==='/api/admin/variant-bindings')return json(await saveVariantBindings(env,body,current.user));if(path==='/api/admin/order-observations'){assert(Object.keys(body).length===0,'OBSERVATION_BODY_INVALID');assert(!url.search,'OBSERVATION_QUERY_INVALID');return json(await captureObservation(env,services.getOrderItems,current.user));}if(path==='/api/admin/settings')return json(await saveSettings(env,body,current.user));if(path==='/api/admin/jobs'){assert(Object.keys(body).length===0,'TASK_NOT_ALLOWED');return json(await enqueue(env),202);}if(path==='/api/admin/jobs/cost')return json(await correctCost(env,body,current.user));throw new AdminError('NOT_FOUND',404);}
 assert(request.method==='GET','METHOD_NOT_ALLOWED',405);
 if(path==='/api/admin/cost-rules'){assert(!url.search,'COST_RULE_REQUEST_INVALID');return json(await readCostRules(env));}
 if(path==='/api/admin/cost-rules/sync'||path==='/api/admin/cost-rules/assignments')throw new AdminError('METHOD_NOT_ALLOWED',405);
 if(path==='/api/admin/finance/sync-state'){assert(!url.search,'BUSINESS_SYNC_REQUEST_INVALID');return json(await readBusinessSyncState(env));}
 if(['/api/admin/finance/payment-sample','/api/admin/finance/payment-preview','/api/admin/variant-bindings/automate','/api/admin/variant-bindings/sync','/api/admin/finance/store-period','/api/admin/finance/store-adjustments','/api/admin/finance/ads-period'].includes(path))throw new AdminError('METHOD_NOT_ALLOWED',405);
 if(path==='/api/admin/production-costs'){assert(!url.search,'COSTS_QUERY_INVALID');return json(await readProductionCosts(env));}
 if(path==='/api/admin/production-costs/audit'){assert(!url.search,'COSTS_QUERY_INVALID');return json(await readProductionCostAudit(env));}
 if(path==='/api/admin/tax-policy'||path==='/api/admin/tax-policy/audit'){
  const query=[...url.searchParams];assert(query.length===1&&query[0][0]==='year'&&/^[2-9][0-9]{3}$/.test(query[0][1]),'BUSINESS_TAX_POLICY_QUERY_INVALID');
  const year=Number(query[0][1]);return json(path.endsWith('/audit')?await readBusinessTaxPolicyAudit(env,year):await readBusinessTaxPolicy(env,year));
 }
 if(path==='/api/admin/variant-bindings')return json(await readVariantBindings(env));
 if(path==='/api/admin/variant-bindings/audit')return json({rows:(await env.ADMIN_DB.prepare('SELECT revision,payload,actor,created_at FROM variant_bindings_audit ORDER BY revision DESC LIMIT 30').all()).results});
 if(path==='/api/admin/order-observations')return json(await listObservations(env,url.searchParams));
 if(path.startsWith('/api/admin/order-observations/')){assert(!url.search,'OBSERVATION_QUERY_INVALID');return json(await readObservation(env,path.slice('/api/admin/order-observations/'.length)));}
 if(path==='/api/admin/order-items'){
  assert(!url.search||url.search==='?source=saved','SAVED_ITEMS_REQUEST_INVALID');
  let raw=null,diagnostic=null;
  const saved=url.searchParams.get('source')==='saved';
  if(saved)raw=await readOrderItemsSnapshot(env);
  else try{if(typeof services.getOrderItems==='function')raw=await services.getOrderItems(env);}catch{diagnostic={stage:'APP_TO_AUTH',code:'INTERNAL_ERROR',http:null};}
  diagnostic=diagnostic||safeOrdersDiagnostic(raw?.diagnostic);
  const frame=saved?raw:orderItems(diagnostic?null:raw);
  if(!saved&&frame.status==='AVAILABLE')await saveOrderItemsSnapshot(env,frame);
  if(!diagnostic&&['INVALID_RESPONSE','STALE_DATE'].includes(frame.status))diagnostic={stage:'APP_VALIDATION',code:frame.status,http:200,validation:frame.status};
  const itemIds=(frame.rows||[]).map(row=>row.item_id),ruleQueries=costRuleSnapshotQueries(env.ADMIN_DB,itemIds),classQueries=catalogClassificationQueries(env.ADMIN_DB,itemIds);
  const snapshot=await env.ADMIN_DB.batch([
   env.ADMIN_DB.prepare('SELECT revision,payload FROM variant_bindings_state WHERE id=1'),env.ADMIN_DB.prepare('SELECT revision,payload FROM admin_settings WHERE id=1'),env.ADMIN_DB.prepare('SELECT revision,payload FROM production_costs_state WHERE id=1'),...ruleQueries,...classQueries,
  ]);
  let bindings,cfg,costs,automatic;
  try{const [b,c,p]=snapshot.slice(0,3).map(result=>result.results[0]);if(![b,c,p].every(row=>Number.isSafeInteger(row?.revision)&&row.revision>=1))throw Error();bindings={revision:b.revision,bindings:validateVariantBindings(JSON.parse(b.payload))};cfg={revision:c.revision,values:validateSettings({...DEFAULTS,...JSON.parse(c.payload)})};costs={revision:p.revision,values:validateProductionCosts(JSON.parse(p.payload))};automatic=mergeCatalogCostReference(costRuleReferenceFromSnapshot(snapshot.slice(3,3+ruleQueries.length)),catalogClassificationsFromSnapshot(snapshot.slice(3+ruleQueries.length)));}catch{throw new AdminError('SAVED_ITEMS_COST_CONTEXT_INVALID',503);}
  const productionReference=productionCostReference(frame,bindings,costs,automatic);
  return json({...frame,...(diagnostic?{diagnostic}:{}),source_mode:saved?'SAVED':'LIVE',cost_rules_revision:automatic.revision,margin_reference:variantMarginReference(frame,bindings,cfg,productionReference),production_cost_reference:productionReference,fetched_at:new Date().toISOString()});
 }
 if(path==='/api/admin/ads-today'){const day=localDay(),summary=typeof services.getAdsSummary==='function'?await services.getAdsSummary(env,{start_date:day,end_date:day}):null;return json({...adsToday(summary,day),fetched_at:new Date().toISOString()});}
 if(path==='/api/admin/shop-orders'){
  let summary=null,diagnostic=null;
  try{if(typeof services.getShopOrders==='function')summary=await services.getShopOrders(env);}catch{diagnostic={stage:'APP_TO_AUTH',code:'INTERNAL_ERROR',http:null};}
  diagnostic=diagnostic||safeOrdersDiagnostic(summary?.diagnostic);
  const value=summary?.schema==='shop_daily_sales_v1'?shopDailyOrders(diagnostic?null:summary):shopOrders(diagnostic?null:summary);
  if(!diagnostic&&['INVALID_RESPONSE','STALE_DATE'].includes(value.status))diagnostic={stage:'APP_VALIDATION',code:value.status,http:200,validation:value.status};
  return json({...value,...(diagnostic?{diagnostic}:{}),fetched_at:new Date().toISOString()});
 }
 const financialJob=path.match(/^\/api\/admin\/jobs\/([a-f0-9-]{36})\/financial-context$/);
 if(financialJob){assert(request.method==='GET','METHOD_NOT_ALLOWED',405);assert(!url.search,'HERMES_CONTEXT_QUERY_INVALID');const value=await readHermesFinancialContext(env,financialJob[1]);return json({job_id:value.job_id,fingerprint:value.fingerprint,context:value.context});}
 if(path==='/api/admin/live')return json(await live(env));
 if(path==='/api/admin/state')return json({settings:await settings(env),csrf:current.csrf,hermes_connected:await connected(env),hermes_finance_ready:await financeBridgeReady(env),budget:await budget(env),ads_execution:'LOCKED'});
 if(path==='/api/admin/jobs')return json({rows:(await env.ADMIN_DB.prepare(`SELECT id,json_extract(task,'$.start_date') AS start_date,json_extract(task,'$.end_date') AS end_date,trigger_type,status,settings_revision,reserve_cents,cost_cents,cost_source,result,failure,created_at,started_at,completed_at FROM hermes_jobs ORDER BY created_at DESC LIMIT 30`).all()).results});
 if(path==='/api/admin/audit')return json({rows:(await env.ADMIN_DB.prepare('SELECT revision,payload,actor,created_at FROM admin_audit ORDER BY revision DESC LIMIT 30').all()).results});
 return json({error:'NOT_FOUND'},404);
 }catch(error){if(isD1DailyLimitError(error))return json({error:'ADMIN_DB_DAILY_LIMIT_EXCEEDED'},503);return json({error:error instanceof ExpenseLedgerError||error instanceof HistoricalCostOrchestrationError||error instanceof HistoricalCostEvidenceError||error instanceof OperatorCostCorrectionError||error instanceof BusinessCostDiagnosticsError||error instanceof ProductRegistryError||error instanceof ProductionCostPeriodsError||error instanceof SavedOrderItemsError||error instanceof HermesFinancialContextError||error instanceof AdminError||error instanceof VariantBindingError||error instanceof ObservationError||error instanceof ProductionCostError||error instanceof StoreSummaryError||error instanceof FinancialAuditOrchestrationError||error instanceof BusinessIncomeOverviewError||error instanceof BusinessIncomeDetailError||error instanceof BusinessEscrowReleaseCoverageError||error instanceof BusinessEscrowReleasesError||error instanceof BusinessReconciliationError||error instanceof BusinessMonthViewError||error instanceof BusinessMonthError||error instanceof BusinessCheckpointError||error instanceof BusinessTaxPolicyError||error instanceof BusinessSyncError||error instanceof CostRuleError||error instanceof CatalogClassificationError||error instanceof ProductionDtfError?error.message:'ADMIN_UNAVAILABLE'},error instanceof ExpenseLedgerError||error instanceof HistoricalCostOrchestrationError||error instanceof HistoricalCostEvidenceError||error instanceof OperatorCostCorrectionError||error instanceof BusinessCostDiagnosticsError||error instanceof ProductRegistryError||error instanceof ProductionCostPeriodsError||error instanceof SavedOrderItemsError||error instanceof HermesFinancialContextError||error instanceof AdminError||error instanceof VariantBindingError||error instanceof ObservationError||error instanceof ProductionCostError||error instanceof StoreSummaryError||error instanceof FinancialAuditOrchestrationError||error instanceof BusinessIncomeOverviewError||error instanceof BusinessEscrowReleaseCoverageError||error instanceof BusinessEscrowReleasesError||error instanceof BusinessReconciliationError||error instanceof BusinessMonthViewError||error instanceof BusinessMonthError||error instanceof BusinessCheckpointError||error instanceof BusinessTaxPolicyError||error instanceof BusinessSyncError||error instanceof CostRuleError||error instanceof CatalogClassificationError||error instanceof ProductionDtfError?error.status:503);}}
export {adminFetch,schedule,scheduledWork,DEFAULTS,SCHEMA,validateSettings,workspaceAuthFetch};
