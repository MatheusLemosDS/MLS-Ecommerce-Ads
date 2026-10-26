import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch} from '../src/admin.mjs';
import {businessMonth} from '../src/business-month.mjs';
import {projectBusinessMonthView,projectBusinessMonthAuditScope} from '../src/business-month-view-state.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {projectDailyBusinessSummary} from '../src/business-daily-summary.mjs';
import {D1} from './sqlite-d1.mjs';

const origin='https://app.example.test';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
const month=()=>today().slice(0,7),stamp=()=>Math.floor(Date.now()/1000);
function previousMonth(){const day=new Date(month()+'-01T12:00:00Z');day.setUTCMonth(day.getUTCMonth()-1);return day.toISOString().slice(0,7);}
async function login(t){
 const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'fixture-view-session-'+'s'.repeat(40),ADMIN_USERNAME:'view-owner',ADMIN_PASSWORD:'fixture-view-password-123456789',REVIEW_USERNAME:'view-review',REVIEW_PASSWORD:'fixture-review-password-123456789',SESSION_SECRET:'fixture-review-session-'+'r'.repeat(40)};
 t.after(()=>env.ADMIN_DB.db.close());
 const response=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(response.status,303);const cookie=response.headers.get('set-cookie').split(';')[0],stateResponse=await adminFetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env);assert.equal(stateResponse.status,200);const state=await stateResponse.json();
 const review=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.REVIEW_USERNAME,password:env.REVIEW_PASSWORD})}),env);assert.equal(review.status,303);
 const reviewCookie=review.headers.getSetCookie().find(value=>value.startsWith('mls_session=')&&!value.startsWith('mls_session=;')).split(';')[0];
 return {env,cookie,csrf:state.csrf,reviewCookie};
}
function invoke(auth,path,{method='GET',body,raw,cookie=auth.cookie,csrf=auth.csrf,requestOrigin=origin,contract}={},services={}){
 return adminFetch(new Request(origin+path,{method,headers:{cookie,origin:requestOrigin,'x-csrf-token':csrf,'content-type':'application/json',...(contract===undefined?{}:{'x-braza-client-contract':contract})},body:body===undefined&&raw===undefined?undefined:raw??JSON.stringify(body)}),auth.env,services);
}
const viewPath=()=>'/api/admin/finance/business-month-view?month='+month();
const priorityPath='/api/admin/finance/business-month-request';
const state=auth=>({...auth.env.ADMIN_DB.db.prepare('SELECT * FROM business_sync_state WHERE id=1').get()});
function sources(){
 const calls={finance:0,ads:0};return {calls,getFinanceBusinessPeriod:async(_,{operation,start_date,end_date})=>{
  calls.finance++;assert.equal(operation,'start');const at=stamp();
  return {schema:'finance_business_period_v1',run_id:crypto.randomUUID(),revision:1,status:'COMPLETE',start_date,end_date,cutoff_at:at-1,checked_at:at,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:0,paid:0,completed:0,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:0,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'0',sales_base_raw:'0',known_expected_repass_raw:'0',expected_repass_raw:'0',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:0,unavailable_orders:0,known_base_raw:'0',known_tax_raw:'0'},items:[],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
 },getAdsCalendar:async()=>{calls.ads++;throw Error('test did not authorize Ads');}};
}

test('the negotiated daily overview is owner-only and reads the published month without new source calls',async t=>{
 const auth=await login(t),source=sources(),options={contract:'business-month-view-v3'};
 for(const cookie of ['',auth.reviewCookie])assert.equal((await invoke(auth,viewPath(),{...options,cookie},source)).status,401);
 const initial=await invoke(auth,viewPath(),options,source),empty=await initial.json();
 assert.equal(initial.status,200);assert.equal(initial.headers.get('x-braza-client-contract'),options.contract);assert.equal(initial.headers.get('cache-control'),'no-store');
 assert.equal(empty.schema,'business_month_view_v3');assert.equal(empty.daily_summary,null);assert.equal(empty.audit_scope,null);
 assert.ok(projectBusinessMonthView(empty,projectBusinessMonth,projectBusinessMonthAuditScope,projectDailyBusinessSummary));assert.deepEqual(source.calls,{finance:0,ads:0});
 let frame=await businessMonth(auth.env,{operation:'start',month:month()},source);
 while(frame.status==='RUNNING')frame=await businessMonth(auth.env,{operation:'step',month:month()},source);
 const before={...source.calls},response=await invoke(auth,viewPath(),options,source),value=await response.json();
 assert.equal(response.status,200);assert.equal(value.display_source,'PUBLISHED');assert.ok(value.daily_summary);
 assert.ok(value.daily_summary.days.every(row=>row.reason==='DAILY_HISTORY_PENDING'&&row.estimate_cents===null));
 assert.ok(projectBusinessMonthView(value,projectBusinessMonth,projectBusinessMonthAuditScope,projectDailyBusinessSummary));
 assert.equal(Object.hasOwn(value,'source_frames'),false);assert.doesNotMatch(JSON.stringify(value),/order_sn|daily_breakdown|payload_hash|source_hash/);
 const older=await (await invoke(auth,viewPath(),{contract:'business-month-view-v2'},source)).json();
 assert.deepEqual(older.display,value.display);assert.deepEqual(older.audit_scope,value.audit_scope);assert.equal(Object.hasOwn(older,'daily_summary'),false);assert.deepEqual(source.calls,before);
});

test('monthly view and priority are owner-only; the GET is local and validates scope/methods',async t=>{
 const auth=await login(t),source=sources(),before=state(auth);
 for(const cookie of ['',auth.reviewCookie,'braza_admin=forged']){
  assert.equal((await invoke(auth,viewPath(),{cookie},source)).status,401);
  assert.equal((await invoke(auth,priorityPath,{method:'POST',body:{month:month()},cookie},source)).status,401);
 }
 const response=await invoke(auth,viewPath(),{},source);assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('access-control-allow-origin'),null);
 const value=await response.json();assert.ok(projectBusinessMonthView(value,projectBusinessMonth));assert.equal(value.display_source,'ACTIVE');assert.equal(value.collection.status,'RUNNING');assert.equal(value.collection.progress.pages_read,0);assert.equal(value.automatic.applicable,true);assert.equal(value.automatic.enabled,true);assert.equal(value.display.result.net_profit_cents,null);
 for(let i=0;i<3;i++)assert.equal((await invoke(auth,viewPath(),{},source)).status,200);
 for(const search of ['', '?month=', '?month=2026-13', '?month='+month()+'&month='+month(), '?month='+month()+'&shop_id=1178167501'])assert.equal((await invoke(auth,'/api/admin/finance/business-month-view'+search,{},source)).status,400,search);
 assert.equal((await invoke(auth,viewPath(),{method:'HEAD'},source)).status,405);assert.equal((await invoke(auth,viewPath(),{method:'POST',body:{month:month()}},source)).status,405);assert.equal((await invoke(auth,priorityPath,{},source)).status,405);
 assert.deepEqual(source.calls,{finance:0,ads:0});assert.deepEqual(state(auth),before);assert.equal(auth.env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM hermes_jobs').get().n,0);
});

test('priority requires same-origin CSRF and an exact bounded current-month body before changing a local deadline',async t=>{
 const auth=await login(t),source=sources(),db=auth.env.ADMIN_DB.db;db.prepare('UPDATE business_sync_state SET next_run_at=?').run(stamp()+300);const before=state(auth),body={month:month()};
 for(const [options,status] of [[{requestOrigin:'https://foreign.example'},403],[{csrf:''},403],[{csrf:'forged'},403],[{body:{month:previousMonth()}},400],[{body:{...body,shop_id:1178167501}},400],[{body:{}},400],[{raw:' '.repeat(129)+JSON.stringify(body)},413]]){
  const response=await invoke(auth,priorityPath,{method:'POST',body,...options},source);assert.equal(response.status,status,await response.clone().text());assert.deepEqual(state(auth),before);
 }
 assert.equal((await invoke(auth,priorityPath+'?month='+month(),{method:'POST',body},source)).status,400);
 const response=await invoke(auth,priorityPath,{method:'POST',body},source);assert.equal(response.status,200);const value=await response.json();assert.equal(value.schema,'business_month_refresh_request_v1');assert.equal(value.month,month());assert.equal(value.status,'QUEUED');assert.ok(value.next_run_at>=before.next_run_at-300&&value.next_run_at<=stamp());
 assert.deepEqual(state(auth),{...before,next_run_at:value.next_run_at});assert.deepEqual(source.calls,{finance:0,ads:0});
});

test('priority joins active work and preserves a paused policy and real source retry deadline',async t=>{
 const auth=await login(t),db=auth.env.ADMIN_DB.db,source=sources(),body={month:month()};
 for(const kind of ['LEASE','PAUSED','BACKOFF']){
  db.prepare("UPDATE business_sync_state SET enabled=1,status='IDLE',lease_token=NULL,lease_expires_at=NULL,last_error=NULL,failure_count=0,next_run_at=?").run(stamp()+300);
  if(kind==='LEASE')db.prepare("UPDATE business_sync_state SET status='RUNNING',lease_token='11111111-1111-4111-8111-111111111111',lease_expires_at=?").run(stamp()+120);
  if(kind==='PAUSED')db.prepare("UPDATE business_sync_state SET enabled=0,status='PAUSED'").run();
  if(kind==='BACKOFF')db.prepare("UPDATE business_sync_state SET status='ERROR',last_error='BUSINESS_SYNC_SOURCE_TIMEOUT',failure_count=2").run();
  const before=state(auth),response=await invoke(auth,priorityPath,{method:'POST',body},source);assert.equal(response.status,200);assert.equal((await response.json()).status,({LEASE:'RUNNING',PAUSED:'PAUSED',BACKOFF:'RETRY_WAIT'})[kind]);assert.deepEqual(state(auth),before);
 }
 assert.deepEqual(source.calls,{finance:0,ads:0});
});

test('enabled current-month legacy start/step cannot bypass the background collector',async t=>{
 const auth=await login(t),source=sources(),db=auth.env.ADMIN_DB.db;db.prepare('UPDATE business_sync_state SET next_run_at=?').run(stamp()+300);
 for(const operation of ['start','step']){
  const response=await invoke(auth,'/api/admin/finance/business-month',{method:'POST',body:{operation,month:month()}},source);assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:'BUSINESS_MONTH_BACKGROUND_OWNED'});
 }
 assert.deepEqual(source.calls,{finance:0,ads:0});assert.equal(state(auth).revision,1);assert.ok(state(auth).next_run_at<=stamp());
 const malformed=await invoke(auth,'/api/admin/finance/business-month',{method:'POST',body:{operation:'start',month:month(),untrusted:true}},source);assert.equal(malformed.status,400);assert.deepEqual(source.calls,{finance:0,ads:0});
 const historical=await invoke(auth,'/api/admin/finance/business-month',{method:'POST',body:{operation:'start',month:previousMonth()}},source);assert.equal(historical.status,200,await historical.clone().text());assert.equal(source.calls.finance,1);
 db.prepare("UPDATE business_sync_state SET enabled=0,status='PAUSED'").run();
 const manual=await invoke(auth,'/api/admin/finance/business-month',{method:'POST',body:{operation:'start',month:month()}},source);assert.equal(manual.status,200,await manual.clone().text());assert.equal(source.calls.finance,2);
 const observed=await invoke(auth,viewPath(),{},source);assert.equal(observed.status,200);const value=await observed.json();assert.equal(value.automatic.enabled,false);assert.equal(value.automatic.applicable,true);assert.equal(source.calls.finance,2);
});

test('published view survives a fresh active import while owner GET never advances that import',async t=>{
 const auth=await login(t),source=sources(),selected=month();let result=await businessMonth(auth.env,{operation:'start',month:selected},source);
 while(result.status==='RUNNING')result=await businessMonth(auth.env,{operation:'step',month:selected},source);
 const initial=await invoke(auth,viewPath(),{},source);assert.equal(initial.status,200,await initial.clone().text());assert.equal((await initial.json()).display_source,'PUBLISHED');
 // Age only the App wrapper, then create a genuinely different in-progress
 // source cohort. Published money must remain attached to its complete frames.
 auth.env.ADMIN_DB.db.prepare('UPDATE business_month_runs SET created_at=created_at-61 WHERE month=?').run(selected);
 const original=source.getFinanceBusinessPeriod;source.getFinanceBusinessPeriod=async(...args)=>{const frame=await original(...args);return {...frame,status:'RUNNING',pages_read:0};};
 const active=await businessMonth(auth.env,{operation:'start',month:selected},source);assert.equal(active.status,'RUNNING');const calls={...source.calls};
 const response=await invoke(auth,viewPath(),{},source);assert.equal(response.status,200,await response.clone().text());const value=await response.json();assert.equal(value.display_source,'PUBLISHED');assert.equal(value.display.status,'COMPLETE');assert.equal(value.collection.status,'RUNNING');assert.equal(value.display.production_cost_cents,0);assert.equal(active.production_cost_cents,null);assert.deepEqual(source.calls,calls);
});

test('view negotiation preserves old tabs and binds audit identities to the displayed publication during replacement',async t=>{
 const auth=await login(t),source=sources(),selected=month(),options={contract:'business-month-view-v2'};
 const activeResponse=await invoke(auth,viewPath(),options,source),active=await activeResponse.json();
 assert.equal(activeResponse.status,200);assert.equal(activeResponse.headers.get('x-braza-client-contract'),options.contract);assert.equal(activeResponse.headers.get('vary'),'X-Braza-Client-Contract');assert.equal(activeResponse.headers.get('cache-control'),'no-store');
 assert.equal(active.schema,'business_month_view_v2');assert.equal(active.audit_scope,null);assert.ok(projectBusinessMonthView(active,projectBusinessMonth,projectBusinessMonthAuditScope));
 for(const contract of ['business-month-v2','business-month-view-v4',''])assert.equal((await invoke(auth,viewPath(),{contract},source)).status,409);
 assert.deepEqual(source.calls,{finance:0,ads:0});
 let result=await businessMonth(auth.env,{operation:'start',month:selected},source);
 while(result.status==='RUNNING')result=await businessMonth(auth.env,{operation:'step',month:selected},source);
 const response=await invoke(auth,viewPath(),options,source),published=await response.json();assert.equal(response.status,200);assert.ok(projectBusinessMonthView(published,projectBusinessMonth,projectBusinessMonthAuditScope));
 const db=auth.env.ADMIN_DB.db,header=db.prepare('SELECT source_revision FROM business_month_publications WHERE month=?').get(selected),frames=db.prepare('SELECT run_id,revision,payload FROM business_month_publication_frames WHERE month=? ORDER BY slot_index').all(selected);
 assert.equal(published.audit_scope.publication_revision,header.source_revision);
 assert.deepEqual(published.audit_scope.sources,frames.map(row=>{const frame=JSON.parse(row.payload);return {run_id:row.run_id,source_revision:row.revision,start_date:frame.start_date,end_date:frame.end_date};}));
 const legacyResponse=await invoke(auth,viewPath(),{},source),legacy=await legacyResponse.json();assert.equal(legacy.schema,'business_month_view_v1');assert.equal(Object.hasOwn(legacy,'audit_scope'),false);assert.equal(legacyResponse.headers.get('x-braza-client-contract'),'business-month-view-v1');
 db.prepare('UPDATE business_month_runs SET created_at=created_at-61 WHERE month=?').run(selected);
 const original=source.getFinanceBusinessPeriod;source.getFinanceBusinessPeriod=async(...args)=>({...await original(...args),status:'RUNNING',pages_read:0});
 await businessMonth(auth.env,{operation:'start',month:selected},source);const calls={...source.calls};
 const refreshing=await (await invoke(auth,viewPath(),options,source)).json();assert.equal(refreshing.collection.status,'RUNNING');assert.equal(refreshing.display_source,'PUBLISHED');assert.deepEqual(refreshing.audit_scope,published.audit_scope);assert.deepEqual(source.calls,calls);
});
