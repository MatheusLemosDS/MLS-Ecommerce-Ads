import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {adminFetch} from '../src/admin.mjs';
import {projectAdsPeriod} from '../src/ads-period.mjs';
import {cacheStoreAdsPeriod,storePeriodBundle} from '../src/store-admin.mjs';

const origin='https://app.example.test';
const run='11111111-1111-4111-8111-111111111111';
const foreign='22222222-2222-4222-8222-222222222222';
const now=()=>Math.floor(Date.now()/1000);
const localDate=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
const day=offset=>new Date(Date.parse(localDate(now())+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
const dates=()=>({start_date:day(-2),end_date:day(-1)});
const frame=changes=>({schema:'finance_store_period_v1',run_id:run,revision:3,status:'COMPLETE',...dates(),cutoff_at:now()-60,checked_at:now()-30,currency:'BRL',monetary_unit:'UNCONFIRMED',order_count:1,pages_read:1,duplicate_orders:0,returns_orders:0,escrow_amount_raw:'50',ads_recharge_or_support_raw:'0',items:[{item_id:'201',model_id:'0',quantity:2}],diagnostic:null,...changes});
const ads=changes=>({schema:'ads_period_v1',status:'AVAILABLE',...dates(),fetched_at:now(),covered_days:2,total_days:2,missing_dates:[],expense_cents:123,days:[{date:day(-2),expense_cents:100},{date:day(-1),expense_cents:23}],day_partial:false,unit_confirmation:'OPERATOR_CONFIRMED_BRL_2026_10_20',source_timezone:'UNCONFIRMED',basis:'CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION',diagnostic:null,...changes});
const declaration=(revision=0,changes={})=>({run_id:run,revision,values:{ads_spend_cents:999999,external_expenses_cents:200,recharge_treatment:'UNCONFIRMED',ads_source:'SHOPEE_PERIOD',...changes}});
const taxFrame=changes=>frame({invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,
 basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:0,
 known_base_raw:'100',known_tax_raw:'2'},...changes});
async function login(){
 const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'fixture-store-ads-session-secret-1234567890',ADMIN_USERNAME:'fixture-store-ads-admin',ADMIN_PASSWORD:'fixture-store-ads-password-1234567890'};
 const response=await adminFetch(new Request(origin+'/admin/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(response.status,303);
 const cookie=response.headers.get('set-cookie').split(';')[0];
 const state=await(await adminFetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
 const auth={env,cookie,csrf:state.csrf};
 const saved=await adminFetch(request(auth,'/api/admin/variant-bindings',{revision:1,bindings:[{item_id:'201',model_id:'0',size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}]}),env);assert.equal(saved.status,200);
 return auth;
}
function request(auth,path,body,options={}){
 const method=options.method||'POST';
 return new Request(origin+path,{method,headers:{cookie:options.cookie??auth.cookie,origin:options.origin??origin,'x-csrf-token':options.csrf??auth.csrf,'content-type':'application/json'},body:['GET','HEAD'].includes(method)?undefined:options.raw??JSON.stringify(body)});
}
function services(financial=frame(),report=ads()){
 const calls={finance:[],ads:[]};
 return {calls,getFinanceStorePeriod:async(env,selection)=>{calls.finance.push(selection);return structuredClone(financial);},getAdsPeriod:async(env,selection)=>{calls.ads.push(selection);return structuredClone(report);}};
}
const state=auth=>({adjustments:auth.env.ADMIN_DB.db.prepare('SELECT * FROM store_period_adjustments ORDER BY run_id').all(),audit:auth.env.ADMIN_DB.db.prepare('SELECT * FROM store_period_adjustments_audit ORDER BY run_id,revision').all()});
const call=(auth,path,body,source,options)=>adminFetch(request(auth,path,body,options),auth.env,source);

test('period Ads route requires admin, exact Origin/CSRF, POST and one canonical run ID before provider calls',async()=>{
 const auth=await login(),source=services();
 for(const [options,status] of [[{cookie:''},401],[{cookie:'mls_session=review'},401],[{origin:'https://foreign.invalid'},403],[{csrf:''},403],[{method:'GET'},405]]){
  assert.equal((await call(auth,'/api/admin/finance/ads-period',{run_id:run},source,options)).status,status);
 }
 for(const body of [{},null,[],{run_id:'bad'},{run_id:run,extra:true},{run_id:run,start_date:day(-2),end_date:day(-1)}])assert.equal((await call(auth,'/api/admin/finance/ads-period',body,source)).status,400);
 assert.equal((await call(auth,'/api/admin/finance/ads-period?run_id='+run,{run_id:run},source)).status,400);
 assert.equal((await call(auth,'/api/admin/finance/ads-period',{run_id:run},source,{raw:' '.repeat(129)+JSON.stringify({run_id:run})})).status,413);
 assert.equal(source.calls.finance.length,0);assert.equal(source.calls.ads.length,0);
});

test('Ads query derives dates only from verified complete financial run and bundle reads reuse cache without provider calls',async()=>{
 const auth=await login(),source=services();assert.ok(projectAdsPeriod(ads()));
 const response=await call(auth,'/api/admin/finance/ads-period',{run_id:run},source);assert.equal(response.status,200);
 const bundle=await response.json();assert.equal(bundle.finance.run_id,run);assert.equal(bundle.ads_period.expense_cents,123);assert.equal(bundle.ads_period.status,'AVAILABLE');
 assert.deepEqual(source.calls.finance,[{operation:'read',run_id:run}]);assert.deepEqual(source.calls.ads,[dates()]);
 for(let index=0;index<3;index++){
  const read=await call(auth,'/api/admin/finance/store-period',{operation:'read',run_id:run},source);assert.equal(read.status,200);assert.equal((await read.json()).ads_period.expense_cents,123);
 }
 assert.equal(source.calls.ads.length,1);assert.equal(state(auth).adjustments.length,0);assert.equal(state(auth).audit.length,0);
});

test('fresh automatic Ads is cached separately without inventing cohort attribution or saving expenses on read',async()=>{
 const auth=await login(),source=services(taxFrame());
 const first=await call(auth,'/api/admin/finance/store-period',{operation:'read',run_id:run},source);
 assert.equal(first.status,200);assert.equal((await first.json()).result.known_cost_result_cents,null);
 const response=await call(auth,'/api/admin/finance/ads-period',{run_id:run},source);assert.equal(response.status,200);
 const bundle=await response.json();assert.equal(bundle.result.invoice_tax.base_cents,10000);
 assert.equal(bundle.result.invoice_tax.tax_cents,200);assert.equal(bundle.result.expected_after_tax_cents,1620);
 assert.equal(bundle.result.known_cost_result_cents,null);assert.equal(bundle.result.net_estimate_cents,null);
 assert.ok(bundle.result.pending.includes('ADJUSTMENTS_REQUIRED'));assert.ok(bundle.result.pending.includes('ADS_COHORT_NOT_RECONCILED'));
 assert.equal(bundle.ads_period.expense_cents,123);assert.equal(bundle.ads_period.basis,'CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION');
 assert.deepEqual(state(auth),{adjustments:[],audit:[]});
 const beforeCache=auth.env.ADMIN_DB.db.prepare('SELECT * FROM store_period_ads_cache WHERE run_id=?').get(run);
 const cached=await call(auth,'/api/admin/finance/store-period',{operation:'read',run_id:run},source);
 const reread=await cached.json();assert.equal(reread.result.known_cost_result_cents,null);assert.equal(reread.result.expected_after_tax_cents,1620);
 assert.ok(reread.result.pending.includes('ADS_COHORT_NOT_RECONCILED'));assert.equal(source.calls.ads.length,1);
 assert.deepEqual(auth.env.ADMIN_DB.db.prepare('SELECT * FROM store_period_ads_cache WHERE run_id=?').get(run),beforeCache);
});

test('explicit zero other expenses preserves its exact audit but does not prove store net attribution',async()=>{
 const auth=await login(),source=services(taxFrame());await call(auth,'/api/admin/finance/ads-period',{run_id:run},source);
 const response=await call(auth,'/api/admin/finance/store-adjustments',declaration(0,{external_expenses_cents:0,external_expenses_basis:'EXCLUDES_INVOICE_TAX'}),source);
 assert.equal(response.status,200);const bundle=await response.json();assert.equal(bundle.result.net_estimate_cents,null);
 assert.equal(bundle.result.known_cost_result_cents,null);assert.equal(bundle.result.net_profit_cents,null);
 assert.equal(bundle.result.expected_after_tax_cents,1620);assert.ok(bundle.result.pending.includes('ADS_COHORT_NOT_RECONCILED'));
 const saved=state(auth);assert.equal(saved.adjustments.length,1);assert.equal(saved.audit.length,1);
 assert.equal(saved.adjustments[0].payload,saved.audit[0].payload);
 const values=JSON.parse(saved.audit[0].payload);assert.equal(values.ads_spend_cents,123);
 assert.equal(values.external_expenses_cents,0);assert.equal(values.external_expenses_basis,'EXCLUDES_INVOICE_TAX');
 const reread=await call(auth,'/api/admin/finance/store-period',{operation:'read',run_id:run},source);
 const retained=await reread.json();assert.deepEqual(retained.adjustments,bundle.adjustments);
 assert.equal(retained.result.net_estimate_cents,null);assert.ok(retained.result.pending.includes('ADS_COHORT_NOT_RECONCILED'));
 assert.deepEqual(state(auth),saved);assert.equal(source.calls.ads.length,1);
});

test('old expenses that may already contain tax are preserved until explicit review instead of being deducted twice',async()=>{
 const auth=await login(),source=services(taxFrame());await call(auth,'/api/admin/finance/ads-period',{run_id:run},source);
 const legacy=await call(auth,'/api/admin/finance/store-adjustments',declaration(),source);assert.equal(legacy.status,200);
 const blocked=await legacy.json();assert.equal(blocked.result.net_estimate_cents,null);
 assert.equal(blocked.result.known_cost_result_cents,null);assert.ok(blocked.result.pending.includes('EXTERNAL_EXPENSES_REVIEW_REQUIRED'));
 assert.equal(blocked.adjustments.values.external_expenses_cents,200);
 const before=state(auth),read=await call(auth,'/api/admin/finance/store-period',{operation:'read',run_id:run},source);
 assert.equal((await read.json()).result.net_estimate_cents,null);assert.deepEqual(state(auth),before);
 const reviewed=await call(auth,'/api/admin/finance/store-adjustments',declaration(1,{external_expenses_cents:50,external_expenses_basis:'EXCLUDES_INVOICE_TAX'}),source);
 assert.equal(reviewed.status,200);assert.equal((await reviewed.json()).result.net_estimate_cents,null);
 assert.equal(state(auth).audit.length,2);assert.equal(JSON.parse(state(auth).audit[0].payload).external_expenses_cents,200);
});

test('unsupported external-expense tax bases and forged invoice tax frames cannot save financial declarations',async()=>{
 const auth=await login(),source=services(taxFrame()),before=state(auth);
 for(const basis of ['INCLUDES_INVOICE_TAX','',false,null]){
  assert.equal((await call(auth,'/api/admin/finance/store-adjustments',declaration(0,{external_expenses_basis:basis}),source)).status,400);
 }
 const wrong=taxFrame();wrong.invoice_tax.rate_bps=100;
 const rejected=await call(auth,'/api/admin/finance/store-period',{operation:'read',run_id:run},services(wrong));
 assert.equal(rejected.status,503);assert.deepEqual(state(auth),before);
});

test('foreign or incomplete financial runs prevent Ads calls and cached report association',async()=>{
 for(const financial of [frame({run_id:foreign}),frame({status:'RUNNING'}),{...frame(),access_token:'PRIVATE_FINANCE_TOKEN'},null]){
  const auth=await login(),source=services(financial);const response=await call(auth,'/api/admin/finance/ads-period',{run_id:run},source);
  assert.ok(response.status>=400);assert.equal(source.calls.ads.length,0);assert.ok(!(await response.text()).includes('PRIVATE'));assert.deepEqual(state(auth),{adjustments:[],audit:[]});
 }
});

test('forged Ads dates, provenance, totals and private output fields are rejected before an available cache can be replaced',async()=>{
 const auth=await login();assert.equal((await call(auth,'/api/admin/finance/ads-period',{run_id:run},services())).status,200);
 for(const report of [ads({start_date:day(-3)}),ads({end_date:day(-3)}),ads({unit_confirmation:'UNCONFIRMED'}),ads({source_timezone:'UTC'}),ads({basis:'ORDER_ATTRIBUTED'}),ads({expense_cents:999999}),ads({fetched_at:now()+3600}),{...ads(),access_token:'PRIVATE_ADS_TOKEN'},null]){
  const response=await call(auth,'/api/admin/finance/ads-period',{run_id:run},services(frame(),report));assert.equal(response.status,503);assert.ok(!(await response.text()).includes('PRIVATE'));
  const good=await call(auth,'/api/admin/finance/store-period',{operation:'read',run_id:run},services());assert.equal(good.status,200);assert.equal((await good.json()).ads_period.expense_cents,123);
 }
});

test('automatic expense declarations use fresh cached provider cents instead of client-supplied amounts and record matching audit',async()=>{
 const auth=await login(),source=services();await call(auth,'/api/admin/finance/ads-period',{run_id:run},source);
 const response=await call(auth,'/api/admin/finance/store-adjustments',declaration(),source);assert.equal(response.status,200);
 const bundle=await response.json();assert.equal(bundle.adjustments.values.ads_source,'SHOPEE_PERIOD');assert.equal(bundle.adjustments.values.ads_spend_cents,123);assert.equal(bundle.adjustments.values.external_expenses_cents,200);assert.equal(bundle.result.net_estimate_cents,null);assert.equal(bundle.result.net_profit_cents,null);
 const stored=state(auth);assert.equal(stored.adjustments.length,1);assert.equal(stored.audit.length,1);assert.equal(stored.adjustments[0].payload,stored.audit[0].payload);assert.equal(JSON.parse(stored.audit[0].payload).ads_spend_cents,123);assert.ok(!stored.audit[0].payload.includes('999999'));assert.equal(source.calls.ads.length,1);
});

test('missing, stale, partial or unavailable period Ads never become zero or permit automatic adjustment mutation',async()=>{
 const cases=[null,ads({fetched_at:now()-3600}),ads({status:'PARTIAL',covered_days:1,missing_dates:[day(-1)],expense_cents:null,days:[{date:day(-2),expense_cents:100},{date:day(-1),expense_cents:null}],diagnostic:'ADS_PERIOD_DATE_COVERAGE_PARTIAL'}),ads({status:'UNAVAILABLE',covered_days:0,missing_dates:[day(-2),day(-1)],expense_cents:null,days:[],diagnostic:'ADS_PERIOD_UNAVAILABLE'})];
 for(const report of cases){
  const auth=await login(),source=services(frame(),report);if(report)await call(auth,'/api/admin/finance/ads-period',{run_id:run},source);
  const before=state(auth),response=await call(auth,'/api/admin/finance/store-adjustments',declaration(),source);assert.equal(response.status,503);assert.deepEqual(state(auth),before);
 }
});

test('expired automatic provenance across Brasilia midnight remains pending without mutating declarations or refetching Ads',async t=>{
 // Moving a source observation across midnight also changes whether its final
 // date was still partial. Keep the stale fixture internally coherent.
 t.mock.timers.enable({apis:['Date'],now:Date.UTC(2026,9,25,3,30)});
 const auth=await login(),source=services();await call(auth,'/api/admin/finance/ads-period',{run_id:run},source);assert.equal((await call(auth,'/api/admin/finance/store-adjustments',declaration(),source)).status,200);
 const record=auth.env.ADMIN_DB.db.prepare('SELECT payload FROM store_period_ads_cache WHERE run_id=?').get(run);const report=JSON.parse(record.payload);report.fetched_at=now()-3600;
 report.day_partial=report.end_date===localDate(report.fetched_at);
 assert.ok(projectAdsPeriod(report));
 auth.env.ADMIN_DB.db.prepare('UPDATE store_period_ads_cache SET payload=?,updated_at=? WHERE run_id=?').run(JSON.stringify(report),now()-3600,run);
 const before=state(auth),response=await call(auth,'/api/admin/finance/store-period',{operation:'read',run_id:run},source);assert.equal(response.status,200);
 const bundle=await response.json();assert.equal(bundle.result.net_estimate_cents,null);assert.ok(bundle.result.pending.includes('ADS_PERIOD_UNAVAILABLE'));
 assert.ok(bundle.result.pending.includes('ADS_COHORT_NOT_RECONCILED'));assert.deepEqual(state(auth),before);assert.equal(source.calls.ads.length,1);
});

test('legacy manual declarations keep their original shape and manual amount without requiring Ads availability',async()=>{
 const auth=await login(),source=services(),values={ads_spend_cents:100,external_expenses_cents:200,recharge_treatment:'UNCONFIRMED'};
 const response=await call(auth,'/api/admin/finance/store-adjustments',{run_id:run,revision:0,values},source);assert.equal(response.status,200);const bundle=await response.json();assert.deepEqual(bundle.adjustments.values,values);assert.equal(bundle.result.net_estimate_cents,null);assert.equal(source.calls.ads.length,0);
 assert.equal(bundle.result.expected_after_production_cents,1820);assert.ok(bundle.result.pending.includes('ADS_COHORT_NOT_RECONCILED'));
 const before=state(auth);assert.equal((await call(auth,'/api/admin/finance/store-adjustments',declaration(0),source)).status,503);assert.deepEqual(state(auth),before);
});

test('explicit manual provenance does not consume cached Ads and unsupported source tags fail before finance reads',async()=>{
 const auth=await login(),source=services(),manual=declaration(0,{ads_source:'MANUAL',ads_spend_cents:0});
 const response=await call(auth,'/api/admin/finance/store-adjustments',manual,source);assert.equal(response.status,200);const bundle=await response.json();assert.equal(bundle.adjustments.values.ads_source,'MANUAL');assert.equal(bundle.adjustments.values.ads_spend_cents,0);assert.equal(bundle.result.net_estimate_cents,null);assert.equal(source.calls.ads.length,0);
 assert.equal(bundle.result.expected_after_production_cents,1820);assert.ok(bundle.result.pending.includes('ADS_COHORT_NOT_RECONCILED'));
 const count=source.calls.finance.length,before=state(auth);const rejected=await call(auth,'/api/admin/finance/store-adjustments',declaration(1,{ads_source:'PRIVATE_FORGED_SOURCE'}),source);assert.equal(rejected.status,400);assert.equal(source.calls.finance.length,count);assert.deepEqual(state(auth),before);assert.ok(!(await rejected.text()).includes('PRIVATE'));
});

test('foreign financial identity returned after cached Ads never authorizes an adjustment mutation',async()=>{
 const auth=await login();await call(auth,'/api/admin/finance/ads-period',{run_id:run},services());const before=state(auth),source=services(frame({run_id:foreign}));
 const response=await call(auth,'/api/admin/finance/store-adjustments',declaration(),source);assert.equal(response.status,503);assert.deepEqual(state(auth),before);assert.equal(source.calls.ads.length,0);
 assert.equal(auth.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM hermes_jobs').get().n,0);
});

test('provider exceptions expose a finite unavailable response without caching private data or changing declarations',async()=>{
 const auth=await login(),source=services(),before=state(auth);source.getAdsPeriod=async()=>{throw Error('PRIVATE_UPSTREAM_CREDENTIAL');};
 const response=await call(auth,'/api/admin/finance/ads-period',{run_id:run},source);assert.equal(response.status,503);assert.ok(!(await response.text()).includes('PRIVATE'));assert.deepEqual(state(auth),before);assert.equal(auth.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM store_period_ads_cache').get().n,0);
});

test('automatic reads use refreshed source cents while preserving saved audit and older late reports cannot downgrade cache',async()=>{
 const auth=await login(),source=services();await call(auth,'/api/admin/finance/ads-period',{run_id:run},source);await call(auth,'/api/admin/finance/store-adjustments',declaration(),source);const before=state(auth);
 const refreshed=ads({expense_cents:223,days:[{date:day(-2),expense_cents:200},{date:day(-1),expense_cents:23}]});
 const update=await call(auth,'/api/admin/finance/ads-period',{run_id:run},services(frame(),refreshed));assert.equal(update.status,200);const latest=await update.json();assert.equal(latest.result.net_estimate_cents,null);assert.equal(latest.ads_period.expense_cents,223);assert.equal(latest.adjustments.values.ads_spend_cents,123);assert.deepEqual(state(auth),before);
 const late=await call(auth,'/api/admin/finance/ads-period',{run_id:run},services(frame(),ads({fetched_at:now()-10})));assert.equal(late.status,200);const retained=await late.json();assert.equal(retained.ads_period.expense_cents,223);assert.equal(retained.result.net_estimate_cents,null);assert.deepEqual(state(auth),before);
});

test('today Ads expires after sixty seconds while closed-period reads keep their fifteen-minute cache',async()=>{
 const stamp=Math.floor(Date.parse(day(0)+'T15:00:00Z')/1000);
 for(const current of [true,false]){
  const auth=await login(),selection=current?{start_date:day(0),end_date:day(0)}:dates();
  const financial=frame({...selection,cutoff_at:stamp-60,checked_at:stamp-30});
  const report=current?ads({...selection,fetched_at:stamp,covered_days:1,total_days:1,expense_cents:5261,days:[{date:day(0),expense_cents:5261}],day_partial:true}):ads({fetched_at:stamp});
  await cacheStoreAdsPeriod(auth.env,financial,report,{now:stamp*1000});
  const before=state(auth),cached=auth.env.ADMIN_DB.db.prepare('SELECT * FROM store_period_ads_cache').all();
  assert.ok((await storePeriodBundle(auth.env,financial,{now:(stamp+59)*1000})).ads_period);
  const afterMinute=await storePeriodBundle(auth.env,financial,{now:(stamp+61)*1000});
  assert.equal(afterMinute.ads_period===null,current);
  assert.equal((await storePeriodBundle(auth.env,financial,{now:(stamp+901)*1000})).ads_period,null);
  assert.deepEqual(state(auth),before);assert.deepEqual(auth.env.ADMIN_DB.db.prepare('SELECT * FROM store_period_ads_cache').all(),cached);
 }
});
