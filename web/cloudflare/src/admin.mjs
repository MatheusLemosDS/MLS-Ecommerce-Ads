import {shopDailyOrders} from './daily-shop-orders.mjs';
import {orderItems} from './order-items.mjs';
import {VariantBindingError,readVariantBindings,saveVariantBindings,saveAutomaticVariantBindings,variantMarginReference} from './variant-bindings.mjs';
import {projectVariantCatalog,projectVariantCatalogRequest} from '../../finance/src/variant-catalog-frame.mjs';
import {OBSERVATION_SCHEMA,ObservationError,captureObservation,listObservations,readObservation} from './order-observations.mjs';
import {COST_DEFAULTS,COST_SCHEMA,ProductionCostError,readProductionCosts,saveProductionCosts,productionCostReference,readProductionCostAudit} from './production-costs.mjs';
import {adsToday} from './admin-ads-today.mjs';
import {shopOrders} from './shop-orders.mjs';
import {safeOrdersDiagnostic} from './orders-diagnostic.mjs';
import {CSS,adminBody,loginBody} from './admin-view.mjs';
import {CLIENT} from './admin-client.mjs';
import {BUSINESS_MONTH_CLIENT} from './business-month-client.mjs';
import {BUSINESS_MONTH_CSS} from './business-month-view.mjs';
import {BUSINESS_MONTH_SCHEMA,businessMonth,BusinessMonthError} from './business-month.mjs';
import {readBusinessTaxPolicy,saveBusinessTaxPolicy,readBusinessTaxPolicyAudit,BusinessTaxPolicyError} from './business-tax-policy.mjs';
import {projectFinanceSample} from './finance-sample-frame.mjs';
import {projectAdminFinancePreview} from './app-finance-sample.mjs';
import {projectStorePeriodRequest,projectStorePeriodFrame} from '../../finance/src/store-period-frame.mjs';
import {STORE_ADJUSTMENTS_SCHEMA,validateStoreAdjustmentBody,saveStoreAdjustments,storePeriodBundle,cacheStoreAdsPeriod} from './store-admin.mjs';
import {StoreSummaryError} from './store-summary.mjs';
import {syncVariantBindings} from './variant-sync.mjs';
import {BRAZA_THEME_HEAD,BRAZA_THEME_CSS} from './theme.mjs';
import {readOwnerSession,handleWorkspaceAuth} from './unified-auth.mjs';
// BrazaCommerce administration. No Shopee write operations.
const DEFAULTS = {regular_cents:1675,mixed_cents:1910,plus_cents:2070,ad_share_percent:40,hermes_mode:'manual',daily_hour:9,monthly_budget_cents:2000,run_reserve_cents:100,billing_mode:'unverified',monthly_run_limit:30};
const SCHEMA = [
...COST_SCHEMA,
...STORE_ADJUSTMENTS_SCHEMA,
...BUSINESS_MONTH_SCHEMA,
...OBSERVATION_SCHEMA,
`CREATE TABLE IF NOT EXISTS variant_bindings_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS variant_bindings_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, revision INTEGER UNIQUE NOT NULL, payload TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS admin_settings (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS admin_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, revision INTEGER UNIQUE NOT NULL, payload TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS hermes_agent (id INTEGER PRIMARY KEY CHECK(id=1), heartbeat TEXT NOT NULL)`,
`CREATE TABLE IF NOT EXISTS hermes_jobs (id TEXT PRIMARY KEY, trigger_type TEXT NOT NULL, dedupe_key TEXT UNIQUE, status TEXT NOT NULL, task TEXT NOT NULL, settings_revision INTEGER NOT NULL, settings_snapshot TEXT NOT NULL, reserve_cents INTEGER NOT NULL, cost_cents INTEGER, result TEXT, failure TEXT, cost_source TEXT, lease TEXT, created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT)`,
`CREATE TABLE IF NOT EXISTS hermes_cost_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, previous_cents INTEGER, cost_cents INTEGER NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL)`];
const enc = new TextEncoder();
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
class AdminError extends Error {constructor(code,status=400){super(code);this.status=status;}}
function assert(condition,code,status=400){if(!condition)throw new AdminError(code,status);}
async function digest(value,secret){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
async function equal(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(a)));const y=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(b)));let difference=0;for(let i=0;i<x.length;i++)difference|=x[i]^y[i];return difference===0;}
function secure(env){assert(typeof env.ADMIN_SESSION_SECRET==='string'&&env.ADMIN_SESSION_SECRET.length>=32,'ADMIN_SESSION_SETUP_REQUIRED',503);}
async function session(request,env){secure(env);return readOwnerSession(request,env);}
function sameOrigin(request){assert(request.headers.get('origin')===new URL(request.url).origin,'ORIGIN_REJECTED',403);}
async function readBody(request,maximum){const reader=request.body?.getReader();assert(reader,'BODY_REQUIRED');const pieces=[];let length=0;try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;assert(length<=maximum,'BODY_TOO_LARGE',413);pieces.push(value);}}finally{await reader.cancel();}const raw=new Uint8Array(length);let offset=0;for(const piece of pieces){raw.set(piece,offset);offset+=piece.length;}return new TextDecoder().decode(raw);}
async function input(request,maximum=16384){assert((request.headers.get('content-type')||'').split(';')[0]==='application/json','JSON_REQUIRED',415);const raw=await readBody(request,maximum);try{const value=JSON.parse(raw);assert(value&&typeof value==='object'&&!Array.isArray(value),'BODY_INVALID');return value;}catch(error){if(error instanceof AdminError)throw error;throw new AdminError('BODY_INVALID');}}
const INITIALIZED_DB=new WeakMap();
async function setup(env){assert(env.ADMIN_DB&&typeof env.ADMIN_DB.prepare==='function','ADMIN_DB_SETUP_REQUIRED',503);if(INITIALIZED_DB.has(env.ADMIN_DB))return INITIALIZED_DB.get(env.ADMIN_DB);const ready=(async()=>{await env.ADMIN_DB.batch(SCHEMA.map(sql=>env.ADMIN_DB.prepare(sql)));const now=new Date().toISOString();await env.ADMIN_DB.prepare('INSERT OR IGNORE INTO production_costs_state(id,revision,payload,updated_at) VALUES(1,1,?,?)').bind(JSON.stringify(COST_DEFAULTS),now).run();await env.ADMIN_DB.prepare('INSERT OR IGNORE INTO production_costs_audit(revision,payload,actor,created_at) SELECT revision,payload,?,updated_at FROM production_costs_state WHERE id=1 AND revision=1').bind('operator-confirmed-2026-10-16').run();await env.ADMIN_DB.prepare('INSERT OR IGNORE INTO variant_bindings_state(id,revision,payload,updated_at) VALUES(1,1,?,?)').bind('[]',now).run();await env.ADMIN_DB.prepare('INSERT OR IGNORE INTO variant_bindings_audit(revision,payload,actor,created_at) SELECT revision,payload,?,updated_at FROM variant_bindings_state WHERE id=1 AND revision=1').bind('initial').run();await env.ADMIN_DB.prepare('INSERT OR IGNORE INTO admin_settings(id,revision,payload,updated_at) VALUES(1,1,?,?)').bind(JSON.stringify(DEFAULTS),now).run();await env.ADMIN_DB.prepare('INSERT OR IGNORE INTO admin_audit(revision,payload,actor,created_at) VALUES(1,?,?,?)').bind(JSON.stringify(DEFAULTS),'initial',now).run();})();INITIALIZED_DB.set(env.ADMIN_DB,ready);try{return await ready;}catch(error){INITIALIZED_DB.delete(env.ADMIN_DB);throw error;}}
function validateSettings(value){assert(value&&typeof value==='object'&&!Array.isArray(value),'SETTINGS_INVALID');assert(Object.keys(value).length===Object.keys(DEFAULTS).length&&Object.keys(DEFAULTS).every(key=>Object.hasOwn(value,key)),'SETTINGS_INVALID');for(const key of ['regular_cents','mixed_cents','plus_cents'])assert(Number.isInteger(value[key])&&value[key]>0&&value[key]<=1000000,'MARGIN_INVALID');assert(Number.isInteger(value.ad_share_percent)&&value.ad_share_percent>=1&&value.ad_share_percent<=100,'AD_SHARE_INVALID');assert(['manual','scheduled','paused'].includes(value.hermes_mode),'MODE_INVALID');assert(Number.isInteger(value.daily_hour)&&value.daily_hour>=0&&value.daily_hour<=23,'HOUR_INVALID');for(const key of ['monthly_budget_cents','run_reserve_cents'])assert(Number.isInteger(value[key])&&value[key]>=1&&value[key]<=1000000,'BUDGET_INVALID');assert(value.run_reserve_cents<=value.monthly_budget_cents,'RESERVE_EXCEEDS_BUDGET');assert(['unverified','subscription','api'].includes(value.billing_mode),'BILLING_MODE_INVALID');assert(Number.isInteger(value.monthly_run_limit)&&value.monthly_run_limit>=1&&value.monthly_run_limit<=1000,'RUN_LIMIT_INVALID');return value;}
async function settings(env){const row=await env.ADMIN_DB.prepare('SELECT revision,payload,updated_at FROM admin_settings WHERE id=1').first();return {revision:row.revision,values:{...DEFAULTS,...JSON.parse(row.payload)},updated_at:row.updated_at};}
async function saveSettings(env,body,actor){assert(Number.isInteger(body.revision)&&body.revision>=1&&Object.keys(body).length===2,'REVISION_REQUIRED');const value=validateSettings(body.values),raw=JSON.stringify(value),now=new Date().toISOString();const results=await env.ADMIN_DB.batch([
 env.ADMIN_DB.prepare('UPDATE admin_settings SET revision=revision+1,payload=?,updated_at=? WHERE id=1 AND revision=?').bind(raw,now,body.revision),
 env.ADMIN_DB.prepare('INSERT INTO admin_audit(revision,payload,actor,created_at) SELECT revision,payload,?,updated_at FROM admin_settings WHERE id=1 AND revision=? AND updated_at=? AND NOT EXISTS(SELECT 1 FROM admin_audit WHERE revision=?)').bind(actor,body.revision+1,now,body.revision+1)]);assert(results[0].meta.changes===1,'SETTINGS_CHANGED_RELOAD',409);return settings(env);}
function localDay(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function yesterday(){return localDay(new Date(Date.now()-86400000));}
async function connected(env){const row=await env.ADMIN_DB.prepare('SELECT heartbeat FROM hermes_agent WHERE id=1').first();return !!row&&Date.now()-Date.parse(row.heartbeat)<90000;}
async function budget(env){const month=new Date().toISOString().slice(0,7);return env.ADMIN_DB.prepare(`SELECT COALESCE(SUM(CASE WHEN COALESCE(json_extract(settings_snapshot,'$.billing_mode'),'unverified')='subscription' THEN 0 WHEN status IN ('queued','running') THEN reserve_cents WHEN status='completed' AND (cost_cents>0 OR (cost_cents=0 AND cost_source='operator_confirmed')) THEN cost_cents WHEN status IN ('completed','failed') THEN reserve_cents ELSE 0 END),0) AS committed_cents, SUM(CASE WHEN status='completed' AND COALESCE(json_extract(settings_snapshot,'$.billing_mode'),'unverified')<>'subscription' AND (cost_cents IS NULL OR (cost_cents=0 AND COALESCE(cost_source,'')<>'operator_confirmed')) THEN 1 ELSE 0 END) AS unknown_cost_runs,COUNT(CASE WHEN status<>'cancelled' THEN 1 END) AS total_runs FROM hermes_jobs WHERE substr(created_at,1,7)=?`).bind(month).first();}
async function enqueue(env,trigger='manual',dedupe=null){
 const state=await settings(env);assert(state.values.hermes_mode!=='paused','HERMES_PAUSED',409);assert(await connected(env),'HERMES_DISCONNECTED',503);
 const task={type:'daily_review',shop_id:'1178167501',start_date:yesterday(),end_date:yesterday(),ads_execution:'LOCKED'};
 const id=crypto.randomUUID(),now=new Date().toISOString(),month=now.slice(0,7);
 const result=await env.ADMIN_DB.prepare(`INSERT OR IGNORE INTO hermes_jobs(id,trigger_type,dedupe_key,status,task,settings_revision,settings_snapshot,reserve_cents,created_at)
 SELECT ?,?,?,'queued',?,?,?,?,?
 WHERE NOT EXISTS(SELECT 1 FROM hermes_jobs WHERE status IN ('queued','running'))
 AND (?='subscription' OR (
 NOT EXISTS(SELECT 1 FROM hermes_jobs WHERE status='completed' AND COALESCE(json_extract(settings_snapshot,'$.billing_mode'),'unverified')<>'subscription' AND (cost_cents IS NULL OR (cost_cents=0 AND COALESCE(cost_source,'')<>'operator_confirmed')) AND substr(created_at,1,7)=?)
 AND (SELECT COALESCE(SUM(CASE WHEN COALESCE(json_extract(settings_snapshot,'$.billing_mode'),'unverified')='subscription' THEN 0 WHEN status IN ('queued','running') THEN reserve_cents WHEN status='completed' AND (cost_cents>0 OR (cost_cents=0 AND cost_source='operator_confirmed')) THEN cost_cents WHEN status IN ('completed','failed') THEN reserve_cents ELSE 0 END),0) FROM hermes_jobs WHERE substr(created_at,1,7)=?)+?<=?))
 AND (SELECT COUNT(*) FROM hermes_jobs WHERE substr(created_at,1,7)=? AND status<>'cancelled')<?
 AND EXISTS(SELECT 1 FROM admin_settings WHERE id=1 AND revision=?)`).bind(id,trigger,dedupe,JSON.stringify(task),state.revision,JSON.stringify(state.values),state.values.run_reserve_cents,now,state.values.billing_mode,month,month,state.values.run_reserve_cents,state.values.monthly_budget_cents,month,state.values.monthly_run_limit,state.revision).run();
 assert(result.meta.changes===1,'RUN_BLOCKED_CHECK_BUDGET_COST_OR_ACTIVE_JOB',409);return {id,status:'queued'};
}
function access(values,isConnected,account,rows){
 let reason=null;
 if(!isConnected)reason='disconnected';else if(values.hermes_mode==='paused')reason='paused';else if(rows.some(job=>['queued','running'].includes(job.status)))reason='active';else if(account.total_runs>=values.monthly_run_limit)reason='run_limit';else if(values.billing_mode!=='subscription'&&account.unknown_cost_runs>0)reason='cost_unconfirmed';else if(values.billing_mode!=='subscription'&&account.committed_cents+values.run_reserve_cents>values.monthly_budget_cents)reason='budget';
 return {allowed:reason===null,reason};
}
async function live(env){const cfg=await settings(env),isConnected=await connected(env),account=await budget(env),rows=(await env.ADMIN_DB.prepare(`SELECT id,json_extract(task,'$.start_date') AS start_date,json_extract(task,'$.end_date') AS end_date,trigger_type,status,settings_revision,reserve_cents,cost_cents,cost_source,result,failure,created_at,started_at,completed_at FROM hermes_jobs ORDER BY created_at DESC LIMIT 30`).all()).results;return {store_orders:{status:'ON_DEMAND_SOURCE',date:localDay(),timezone:'America/Sao_Paulo',total:null},hermes_connected:isConnected,mode:cfg.values.hermes_mode,billing_mode:cfg.values.billing_mode,monthly_run_limit:cfg.values.monthly_run_limit,budget:account,rows,execution_access:access(cfg.values,isConnected,account,rows)};}

async function claim(env){const cfg=await settings(env);if(cfg.values.hermes_mode==='paused')return null;const lease=crypto.randomUUID(),now=new Date().toISOString();return env.ADMIN_DB.prepare(`UPDATE hermes_jobs SET status='running',lease=?,started_at=? WHERE id=(SELECT id FROM hermes_jobs WHERE status='queued' ORDER BY created_at LIMIT 1) AND status='queued' AND (SELECT json_extract(payload,'$.hermes_mode') FROM admin_settings WHERE id=1)<>'paused' RETURNING id,task,settings_revision,settings_snapshot,lease`).bind(lease,now).first();}
async function finish(env,body){assert(typeof body.id==='string'&&typeof body.lease==='string','JOB_INVALID');assert(['completed','failed'].includes(body.status),'JOB_STATUS_INVALID');assert(body.cost_cents===null||(Number.isInteger(body.cost_cents)&&body.cost_cents>=0&&body.cost_cents<=100000000),'COST_INVALID');assert(body.status!=='failed'||body.failure==='EXECUTION_FAILED','FAILURE_INVALID');assert(body.status!=='completed'||(typeof body.result==='string'&&body.result.length<=12000),'RESULT_INVALID');const result=await env.ADMIN_DB.prepare(`UPDATE hermes_jobs SET status=?,cost_cents=?,result=?,failure=?,completed_at=?,cost_source=?,lease=NULL WHERE id=? AND status='running' AND lease=?`).bind(body.status,body.cost_cents,body.status==='completed'?body.result:null,body.status==='failed'?'EXECUTION_FAILED':null,new Date().toISOString(),body.cost_cents===null?null:'agent_estimate',body.id,body.lease).run();assert(result.meta.changes===1,'JOB_LEASE_REJECTED',409);return {ok:true};}
async function correctCost(env,body,actor){assert(Object.keys(body).length===2&&typeof body.id==='string'&&Number.isInteger(body.cost_cents)&&body.cost_cents>=0&&body.cost_cents<=100000000,'COST_INVALID');const now=new Date().toISOString();const results=await env.ADMIN_DB.batch([env.ADMIN_DB.prepare("INSERT INTO hermes_cost_audit(job_id,previous_cents,cost_cents,actor,created_at) SELECT id,cost_cents,?,?,? FROM hermes_jobs WHERE id=? AND status IN ('completed','failed')").bind(body.cost_cents,actor,now,body.id),env.ADMIN_DB.prepare("UPDATE hermes_jobs SET cost_cents=?,cost_source='operator_confirmed' WHERE id=? AND status IN ('completed','failed')").bind(body.cost_cents,body.id)]);assert(results[1].meta.changes===1,'COST_JOB_NOT_COMPLETED',409);return {ok:true};}
async function schedule(env,now=new Date()){await setup(env);const cfg=await settings(env);if(cfg.values.hermes_mode!=='scheduled')return;const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(now));if(hour!==cfg.values.daily_hour)return;try{await enqueue(env,'scheduled','daily:'+localDay(now));}catch(error){if(!(error instanceof AdminError))throw error;}}
function page(body,title='BrazaCommerce · Gestão da loja'){return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>${BRAZA_THEME_HEAD}<style>${BRAZA_THEME_CSS}\n${CSS}</style></head><body>${body}</body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'same-origin'}});}
function loginPage(error=''){return page(loginBody(error));}
async function workspaceAuthFetch(request,env){return handleWorkspaceAuth(request,env,{renderLogin:loginPage,renderLogout:current=>page('<main class="login card"><div class="brand"><span class="brand-mark">B</span><div>BrazaCommerce<small>Sua conta</small></div></div><h1>Sair da sua conta?</h1><p class="muted">Você precisará entrar novamente para acessar o painel.</p><form action="/logout" method="post"><input type="hidden" name="csrf" value="'+current.csrf+'"><button type="submit">Sair</button></form><p><a href="'+(current.role==='owner'?'/admin':'/dashboard')+'">Continuar no painel</a></p></main>')});}
function dashboard(){return page('<style>'+BUSINESS_MONTH_CSS+'</style>'+adminBody()+'<script>'+BUSINESS_MONTH_CLIENT+'</script><script>'+CLIENT+'</script>');}

async function adminFetch(request,env,services={}){const url=new URL(request.url),path=url.pathname;try{
 if(path.startsWith('/api/hermes/')){assert(typeof env.HERMES_BRIDGE_SECRET==='string'&&env.HERMES_BRIDGE_SECRET.length>=32,'HERMES_BRIDGE_SETUP_REQUIRED',503);assert(await equal(request.headers.get('authorization')||'','Bearer '+env.HERMES_BRIDGE_SECRET),'UNAUTHORIZED',401);assert(request.method==='POST','METHOD_NOT_ALLOWED',405);await setup(env);const body=await input(request);if(path==='/api/hermes/heartbeat'){await env.ADMIN_DB.prepare('INSERT INTO hermes_agent(id,heartbeat) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET heartbeat=excluded.heartbeat').bind(new Date().toISOString()).run();return json({ok:true});}if(path==='/api/hermes/claim')return json({job:await claim(env)});if(path==='/api/hermes/finish')return json(await finish(env,body));return json({error:'NOT_FOUND'},404);}
 if(['/','/login','/admin/login','/logout','/admin/logout'].includes(path))return workspaceAuthFetch(request,env);
 const current=await session(request,env);if(!current)return path.startsWith('/api/')?json({error:'UNAUTHORIZED'},401):Response.redirect(url.origin+'/login',303);
 if(path==='/admin'){assert(request.method==='GET','METHOD_NOT_ALLOWED',405);return dashboard();}
 assert(path.startsWith('/api/admin/'),'NOT_FOUND',404);await setup(env);
 if(path==='/api/admin/finance/business-month'&&request.method!=='POST')throw new AdminError('METHOD_NOT_ALLOWED',405);
 if(request.method==='POST'){sameOrigin(request);assert(await equal(request.headers.get('x-csrf-token')||'',current.csrf),'CSRF_REJECTED',403);const body=await input(request,path==='/api/admin/finance/business-month'?512:['/api/admin/finance/payment-sample','/api/admin/finance/payment-preview','/api/admin/finance/ads-period'].includes(path)?128:path==='/api/admin/production-costs'?196608:path==='/api/admin/variant-bindings'?393216:path==='/api/admin/variant-bindings/sync'?131072:path==='/api/admin/variant-bindings/automate'?256:16384);if(path==='/api/admin/finance/business-month'){assert(!url.search,'BUSINESS_MONTH_REQUEST_INVALID');return json(await businessMonth(env,body,services,{actor:current.user}));}if(path==='/api/admin/finance/ads-period'){
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
  let raw=null,diagnostic=null;
  try{if(typeof services.getOrderItems==='function')raw=await services.getOrderItems(env);}catch{diagnostic={stage:'APP_TO_AUTH',code:'INTERNAL_ERROR',http:null};}
  diagnostic=diagnostic||safeOrdersDiagnostic(raw?.diagnostic);
  const frame=orderItems(diagnostic?null:raw);
  if(!diagnostic&&['INVALID_RESPONSE','STALE_DATE'].includes(frame.status))diagnostic={stage:'APP_VALIDATION',code:frame.status,http:200,validation:frame.status};
  const bindings=await readVariantBindings(env),cfg=await settings(env),costs=await readProductionCosts(env);
  const productionReference=productionCostReference(frame,bindings,costs);
  return json({...frame,...(diagnostic?{diagnostic}:{}),margin_reference:variantMarginReference(frame,bindings,cfg,productionReference),production_cost_reference:productionReference,fetched_at:new Date().toISOString()});
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
 if(path==='/api/admin/live')return json(await live(env));
 if(path==='/api/admin/state')return json({settings:await settings(env),csrf:current.csrf,hermes_connected:await connected(env),budget:await budget(env),ads_execution:'LOCKED'});
 if(path==='/api/admin/jobs')return json({rows:(await env.ADMIN_DB.prepare(`SELECT id,json_extract(task,'$.start_date') AS start_date,json_extract(task,'$.end_date') AS end_date,trigger_type,status,settings_revision,reserve_cents,cost_cents,cost_source,result,failure,created_at,started_at,completed_at FROM hermes_jobs ORDER BY created_at DESC LIMIT 30`).all()).results});
 if(path==='/api/admin/audit')return json({rows:(await env.ADMIN_DB.prepare('SELECT revision,payload,actor,created_at FROM admin_audit ORDER BY revision DESC LIMIT 30').all()).results});
 return json({error:'NOT_FOUND'},404);
 }catch(error){return json({error:error instanceof AdminError||error instanceof VariantBindingError||error instanceof ObservationError||error instanceof ProductionCostError||error instanceof StoreSummaryError||error instanceof BusinessMonthError||error instanceof BusinessTaxPolicyError?error.message:'ADMIN_UNAVAILABLE'},error instanceof AdminError||error instanceof VariantBindingError||error instanceof ObservationError||error instanceof ProductionCostError||error instanceof StoreSummaryError||error instanceof BusinessMonthError||error instanceof BusinessTaxPolicyError?error.status:503);}}
export {adminFetch,schedule,DEFAULTS,SCHEMA,validateSettings,workspaceAuthFetch};
