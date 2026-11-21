import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {collectionFixture} from './business-collection-fixture.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {readBusinessMonthDisplay,projectBusinessMonth} from '../src/business-month.mjs';
import {readBusinessSyncState} from '../src/business-sync.mjs';
import {buildBusinessMonthView,projectBusinessMonthView,projectBusinessMonthAuditScope} from '../src/business-month-view-state.mjs';
import {projectDailyBusinessSummary} from '../src/business-daily-summary.mjs';
import {projectExpenseSchedule} from '../src/expense-schedule.mjs';
import {projectBusinessMonthVariantContributions} from '../src/business-variant-attribution.mjs';
import {readHistoricalDailyBusinessSummary,projectHistoricalDailyBusinessSummary} from '../src/business-daily-history.mjs';
import {adminFetch} from '../src/admin.mjs';

const month='2026-10',origin='https://historical-view.test';
const at=day=>day+'T12:00:00.000Z';
const project=value=>projectBusinessMonthView(value,projectBusinessMonth,projectBusinessMonthAuditScope,projectDailyBusinessSummary,projectExpenseSchedule,projectBusinessMonthVariantContributions,projectHistoricalDailyBusinessSummary);
const row=(summary,date='2026-10-10')=>summary.days.find(item=>item.date===date);
function saveCost(f,revision,cents,date){
 const payload=JSON.stringify({...COST_DEFAULTS,inclusive_regular_cents:cents});
 f.env.ADMIN_DB.db.prepare('INSERT INTO production_costs_audit VALUES(?,?,?)').run(revision,payload,at(date));
 f.env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET revision=?,payload=?,updated_at=?').run(revision,payload,at(date));
}
async function fixture(t){
 const f=await collectionFixture({allPaid:true,daily:true,windowCounts:[2,1],paymentDelayMs:0});
 t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let current=await f.invoke('start');for(let n=0;current.status==='RUNNING'&&n<10;n++)current=await f.invoke('step');assert.equal(current.status,'COMPLETE');await f.invoke('ads');
 const db=f.env.ADMIN_DB.db;
 db.exec('CREATE TABLE IF NOT EXISTS production_costs_audit(revision INTEGER PRIMARY KEY,payload TEXT,created_at TEXT);CREATE TABLE IF NOT EXISTS variant_bindings_audit(revision INTEGER PRIMARY KEY,payload TEXT,created_at TEXT)');
 db.exec('DELETE FROM production_costs_audit;DELETE FROM variant_bindings_audit;DELETE FROM production_cost_rules_audit');
 saveCost(f,1,1000,'2026-10-01');saveCost(f,2,1200,'2026-10-14');
 const bindings=db.prepare('SELECT payload FROM variant_bindings_state').get().payload,rules=JSON.stringify({rules:[]});
 db.prepare('UPDATE variant_bindings_state SET revision=1,updated_at=?').run(at('2026-10-01'));
 db.prepare('INSERT INTO variant_bindings_audit VALUES(1,?,?)').run(bindings,at('2026-10-01'));
 db.prepare('UPDATE production_cost_rules_state SET revision=1,payload=?,updated_at=?').run(rules,at('2026-10-01'));
 db.prepare('INSERT INTO production_cost_rules_audit(revision,payload,actor,created_at) VALUES(1,?,?,?)').run(rules,'synthetic-owner',at('2026-10-01'));
 return f;
}
async function view(f){
 const observed=await readBusinessMonthDisplay(f.env,{month},{now:f.now}),policy=await readBusinessSyncState(f.env);
 const reference=buildBusinessMonthView(observed,policy,{contract:'business-month-view-v5',now:f.now});
 const historical=await readHistoricalDailyBusinessSummary(f.env,observed,reference.daily_summary,{now:f.now});
 const value=buildBusinessMonthView(observed,policy,{contract:'business-month-view-v6',now:f.now,historicalDailySummary:historical});
 assert.ok(project(value));return {observed,policy,reference,historical,value};
}

test('v6 adds a separate audited daily estimate while retaining every v5 current-cost field',async t=>{
 const f=await fixture(t),{reference,value}=await view(f);
 const {schema,historical_daily_summary,...unchanged}=value,{schema:legacySchema,...legacy}=reference;
 assert.equal(schema,'business_month_view_v6');assert.equal(legacySchema,'business_month_view_v5');assert.deepEqual(unchanged,legacy);
 assert.equal(row(reference.daily_summary).production_cost_cents,2400);
 assert.equal(row(historical_daily_summary).production_cost_cents,2000);
 assert.equal(row(historical_daily_summary).estimate_cents,row(reference.daily_summary).estimate_cents+400);
 assert.equal(historical_daily_summary.realized_net_cents,null);
 assert.doesNotMatch(JSON.stringify(value),/order_sn|buyer|access_token|PRIVATE_INTEGRATION/);
});

test('a subsequent current cost reduction changes the legacy reference but leaves the prior historical day stable',async t=>{
 const f=await fixture(t),before=await view(f),calls=structuredClone(f.calls);
 saveCost(f,3,500,'2026-10-24');const after=await view(f);
 assert.equal(row(after.reference.daily_summary).production_cost_cents,1000);
 assert.equal(row(after.reference.daily_summary).estimate_cents,row(before.reference.daily_summary).estimate_cents+1400);
 assert.deepEqual(row(after.historical),row(before.historical));
 assert.deepEqual(f.calls,calls);
});

test('v6 can carry uncaptured history without falling back or altering the older schemas',async t=>{
 const f=await fixture(t),{observed,policy,reference}=await view(f);
 const value=buildBusinessMonthView(observed,policy,{contract:'business-month-view-v6',now:f.now});
 assert.equal(value.historical_daily_summary,null);assert.deepEqual(value.daily_summary,reference.daily_summary);assert.ok(project(value));
 for(let version=1;version<=5;version++){
  const old=buildBusinessMonthView(observed,policy,{contract:'business-month-view-v'+version,now:f.now,historicalDailySummary:{invalid:true}});
  assert.equal(Object.hasOwn(old,'historical_daily_summary'),false);assert.deepEqual(old.display,reference.display);
 }
 const absent=structuredClone(value);delete absent.historical_daily_summary;assert.equal(project(absent),null);
 assert.equal(projectBusinessMonthView(value,projectBusinessMonth,projectBusinessMonthAuditScope,projectDailyBusinessSummary,projectExpenseSchedule,projectBusinessMonthVariantContributions),null);
});

test('historical view validation rejects an altered source, date, amount, private field or accessor',async t=>{
 const {value}=await view(await fixture(t));
 for(const mutate of [
  v=>v.historical_daily_summary.month='2026-09',
  v=>v.historical_daily_summary.publication_revision++,
  v=>row(v.historical_daily_summary).estimate_cents++,
  v=>row(v.historical_daily_summary).date='2026-10-09',
  v=>v.historical_daily_summary.order_sn='must-not-cross-boundary',
 ]){const wrong=structuredClone(value);mutate(wrong);assert.equal(project(wrong),null);}
 let reads=0;const getter=structuredClone(value);Object.defineProperty(getter,'historical_daily_summary',{enumerable:true,get(){reads++;return value.historical_daily_summary;}});assert.equal(project(getter),null);assert.equal(reads,0);
 const serialized=JSON.stringify(value);
 // Other projectors are supplied independently by the browser bundle. This
 // isolates the boundary and its new historical projector from server imports.
 const detached=vm.runInNewContext('('+projectBusinessMonthView.toString()+')(JSON.parse(serialized),value=>value,value=>value,value=>value,value=>value,value=>value,('+projectHistoricalDailyBusinessSummary.toString()+'))',{serialized});
 assert.ok(detached,'the negotiated boundary must have no server closure');assert.equal(JSON.stringify(detached),serialized);
});

async function login(f){
 // The collector fixture intentionally creates only the read-side audit
 // columns; authenticated schema initialization also records the actor.
 f.env.ADMIN_DB.db.exec('ALTER TABLE production_costs_audit ADD COLUMN actor TEXT;ALTER TABLE variant_bindings_audit ADD COLUMN actor TEXT');
 Object.assign(f.env,{ADMIN_SESSION_SECRET:'synthetic-history-session-'+'s'.repeat(40),ADMIN_USERNAME:'history-owner',ADMIN_PASSWORD:'synthetic-history-password-123456789'});
 const response=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:f.env.ADMIN_USERNAME,password:f.env.ADMIN_PASSWORD})}),f.env);
 assert.equal(response.status,303);return response.headers.get('set-cookie').split(';')[0];
}
const route=(f,cookie,contract,method='GET')=>adminFetch(new Request(origin+'/api/admin/finance/business-month-view?month='+month,{method,headers:{cookie,'x-braza-client-contract':contract}}),f.env);

test('owner v6 GET returns historical provenance without new provider reads and preserves the v5 response',async t=>{
 const f=await fixture(t),cookie=await login(f),calls=structuredClone(f.calls);
 const response=await route(f,cookie,'business-month-view-v6');assert.equal(response.status,200,await response.clone().text());
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-braza-client-contract'),'business-month-view-v6');assert.equal(response.headers.get('vary'),'X-Braza-Client-Contract');
 const value=await response.json();assert.ok(project(value));assert.equal(row(value.historical_daily_summary).production_cost_cents,2000);
 const legacy=await route(f,cookie,'business-month-view-v5');assert.equal(legacy.status,200);const old=await legacy.json();assert.equal(old.schema,'business_month_view_v5');assert.equal(Object.hasOwn(old,'historical_daily_summary'),false);
 assert.equal(row(old.daily_summary).production_cost_cents,2400);assert.deepEqual(f.calls,calls);
 for(const method of ['POST','HEAD'])assert.equal((await route(f,cookie,'business-month-view-v6',method)).status,405);
 assert.equal((await route(f,'','business-month-view-v6')).status,401);
 assert.equal((await route(f,cookie,'business-month-view-v7')).status,409);
});
