import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';
import {collectionFixture} from './business-collection-fixture.mjs';
import {adminFetch} from '../src/admin.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {BUSINESS_COST_HISTORY_CONTRACT,readBusinessCostHistoryReport} from '../src/business-cost-history-report.mjs';
import {BUSINESS_COST_HISTORY_DATED_CONTRACT,readBusinessCostHistoryDatedReport} from '../src/business-cost-history-report.mjs';
import {startDatedCostScan,stepDatedCostScan,readDatedCostEvidence,reviewDatedCostEvidence} from '../src/dated-cost-evidence.mjs';

const origin='https://cost-history.test',month='2026-10';
const stamp=day=>day+'T12:00:00.000Z';
const saved=db=>JSON.stringify(db.db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(row=>({name:row.name,sql:row.sql,rows:db.db.prepare('SELECT * FROM "'+row.name.replaceAll('"','""')+'"').all()})));
function onlyReads(db){const prepare=db.prepare.bind(db),sql=[];db.prepare=value=>{assert.match(value,/^\s*SELECT\b/i,'historical report must be SELECT-only');sql.push(value);return prepare(value);};return {sql,restore:()=>{db.prepare=prepare;}};}
async function fixture(t){
 const f=await collectionFixture({allPaid:true,daily:true,windowCounts:[2,1],paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let current=await f.invoke('start');for(let n=0;current.status==='RUNNING'&&n<10;n++)current=await f.invoke('step');assert.equal(current.status,'COMPLETE');
 const db=f.env.ADMIN_DB;
 db.db.exec('CREATE TABLE IF NOT EXISTS production_costs_audit(revision INTEGER PRIMARY KEY,payload TEXT,created_at TEXT);CREATE TABLE IF NOT EXISTS variant_bindings_audit(revision INTEGER PRIMARY KEY,payload TEXT,created_at TEXT)');
 const costs=[{revision:1,payload:JSON.stringify({...COST_DEFAULTS,inclusive_regular_cents:1000}),at:stamp('2026-10-01')},{revision:2,payload:JSON.stringify({...COST_DEFAULTS,inclusive_regular_cents:1200}),at:stamp('2026-10-14')}],bindings=db.db.prepare('SELECT payload FROM variant_bindings_state').get().payload,rules=JSON.stringify({rules:[]});
 db.db.exec('DELETE FROM production_costs_audit;DELETE FROM variant_bindings_audit;DELETE FROM production_cost_rules_audit');
 for(const row of costs)db.db.prepare('INSERT INTO production_costs_audit VALUES(?,?,?)').run(row.revision,row.payload,row.at);
 db.db.prepare('UPDATE production_costs_state SET revision=2,payload=?,updated_at=?').run(costs[1].payload,costs[1].at);
 db.db.prepare('UPDATE variant_bindings_state SET revision=1,updated_at=?').run(stamp('2026-10-01'));
 db.db.prepare('INSERT INTO variant_bindings_audit VALUES(1,?,?)').run(bindings,stamp('2026-10-01'));
 db.db.prepare('UPDATE production_cost_rules_state SET revision=1,payload=?,updated_at=?').run(rules,stamp('2026-10-01'));
 db.db.prepare('INSERT INTO production_cost_rules_audit(revision,payload,actor,created_at) VALUES(1,?,?,?)').run(rules,'synthetic-owner',stamp('2026-10-01'));
 return f;
}

test('explicit historical report reconciles dated cents without repricing legacy monthly or changing any stored fact',async t=>{
 const f=await fixture(t),legacy=await f.invoke('read'),before=saved(f.env.ADMIN_DB),calls=structuredClone(f.calls),read=onlyReads(f.env.ADMIN_DB);
 const value=await readBusinessCostHistoryReport(f.env,{month},{now:f.now});read.restore();
 assert.equal(value.schema,'business_cost_history_v1');assert.equal(value.basis,'HISTORICAL_AUDITED_COSTS_PAID_CREATE_DATE');
 assert.equal(value.state,'COMPLETE');assert.equal(value.known_production_cost_cents,3200);assert.equal(value.production_cost_cents,3200);
 assert.deepEqual(value.coverage,{total_units:3,known_units:3,pending_units:0,pending_variants:0});
 assert.equal(value.days.find(row=>row.date==='2026-10-10').production_cost_cents,2000);assert.equal(value.days.find(row=>row.date==='2026-10-20').production_cost_cents,1200);
 assert.equal(value.days.reduce((total,row)=>total+row.known_production_cost_cents,0),3200);
 assert.equal(legacy.production_cost_cents,3600);assert.equal((await f.invoke('read')).production_cost_cents,3600);
 assert.equal(saved(f.env.ADMIN_DB),before);assert.deepEqual(f.calls,calls);
 assert.equal(read.sql.length,8);assert.ok(read.sql.every(sql=>!sql.includes('business_month_runs')));
 assert.equal(value.source.end_date,'2026-10-24');assert.deepEqual(value.source.finance_checked_at,{oldest_at:legacy.source_checked_at.finance_oldest_at,latest_at:legacy.source_checked_at.finance_latest_at});
 assert.deepEqual(value.audit_scope,{costs_revision:2,cost_rules_revision:1,bindings_revision:1});
 assert.equal(value.day_evidence.find(row=>row.date==='2026-10-10').costs_revision,1);assert.equal(value.day_evidence.find(row=>row.date==='2026-10-20').costs_revision,2);
 assert.doesNotMatch(JSON.stringify(value),/order_sn|buyer|payload|run_id|actor|access_token|net_estimate|realized_net/);
});

test('a narrower published range stays partial when read after its cutoff, retaining known costs and provenance',async t=>{
 const f=await fixture(t),later=Date.parse('2026-11-20T12:00:00Z'),value=await readBusinessCostHistoryReport(f.env,{month},{now:()=>later});
 assert.equal(value.state,'PARTIAL');assert.deepEqual(value.pending,['PERIOD_INCOMPLETE']);assert.equal(value.production_cost_cents,null);assert.equal(value.known_production_cost_cents,3200);assert.equal(value.source.end_date,'2026-10-24');
});

test('missing or corrupted audits never fall back to the valid current registered cost',async t=>{
 const f=await fixture(t);assert.equal((await f.invoke('read')).production_cost_cents,3600);
 f.env.ADMIN_DB.db.exec('DELETE FROM production_costs_audit WHERE revision=1');const before=saved(f.env.ADMIN_DB),read=onlyReads(f.env.ADMIN_DB);
 const value=await readBusinessCostHistoryReport(f.env,{month},{now:f.now});read.restore();
 assert.equal(value.state,'UNAVAILABLE');assert.equal(value.production_cost_cents,null);assert.equal(value.known_production_cost_cents,null);assert.equal(value.coverage.total_units,3);assert.equal(value.coverage.known_units,null);assert.deepEqual(value.pending,['AUDIT_INVALID']);assert.deepEqual(value.days,[]);assert.equal(saved(f.env.ADMIN_DB),before);
});

test('cold storage and invalid requests cannot initialize cost or financial tables',async t=>{
 const db=new D1();t.after(()=>db.db.close());const env={ADMIN_DB:db},before=saved(db),read=onlyReads(db),now=()=>Date.parse('2026-11-20T12:00:00Z');
 const value=await readBusinessCostHistoryReport(env,{month},{now});assert.equal(value.state,'UNAVAILABLE');assert.equal(value.production_cost_cents,null);assert.equal(value.known_production_cost_cents,null);assert.equal(saved(db),before);
 for(const input of [null,{},[],{month,force:true},{month:1},{month:'2026-13'},{month:'2026-12'},{month:'1999-12'}])await assert.rejects(readBusinessCostHistoryReport(env,input,{now}),error=>error.message==='BUSINESS_COST_HISTORY_REQUEST_INVALID'&&error.status===400);
 read.restore();assert.equal(saved(db),before);
});

async function owner(t,handle=adminFetch,existing=null){
 const env=Object.assign(existing??{ADMIN_DB:new D1()},{ADMIN_SESSION_SECRET:'cost-history-session-secret-12345678901234567890',ADMIN_USERNAME:'cost-history-owner',ADMIN_PASSWORD:'cost-history-test-password'});if(!existing)t.after(()=>env.ADMIN_DB.db.close());
 const login=await handle(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env,{});assert.equal(login.status,303);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const call=(query='?month='+month,{contract=BUSINESS_COST_HISTORY_CONTRACT,method='GET',session=cookie}={})=>handle(new Request(origin+'/api/admin/finance/business-cost-history'+query,{method,headers:{cookie:session,...(contract===null?{}:{'x-braza-client-contract':contract})}}),env,{});
 return {env,call};
}

test('owner route requires exact negotiation, session, method and selector before any business read',async t=>{
 const f=await owner(t),before=saved(f.env.ADMIN_DB),read=onlyReads(f.env.ADMIN_DB);
 for(const session of ['', 'mls_session=invalid'])assert.equal((await f.call(undefined,{session})).status,401);
 for(const contract of [null,'business-month-v1','business-cost-history-v2'])assert.equal((await f.call(undefined,{contract})).status,409);
 for(const method of ['POST','PUT','DELETE'])assert.equal((await f.call(undefined,{method})).status,405);
 for(const query of ['', '?month='+month+'&month='+month,'?month='+month+'&force=true','?period='+month,'?month=2026-13'])assert.equal((await f.call(query)).status,400);
 assert.equal(read.sql.length,0);assert.equal(saved(f.env.ADMIN_DB),before);
 const response=await f.call();assert.equal(response.status,200);assert.equal(response.headers.get('x-braza-client-contract'),BUSINESS_COST_HISTORY_CONTRACT);assert.equal(response.headers.get('vary'),'X-Braza-Client-Contract');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).state,'UNAVAILABLE');assert.equal(saved(f.env.ADMIN_DB),before);read.restore();
});

for(const minify of [false,true])test(`bundled owner route preserves read-only fail-closed historical contract (minify=${minify})`,async t=>{
 const output=await build({entryPoints:[fileURLToPath(new URL('../src/admin.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const module=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64')),f=await owner(t,module.adminFetch),before=saved(f.env.ADMIN_DB),read=onlyReads(f.env.ADMIN_DB);
 const response=await f.call(),value=await response.json();assert.equal(response.status,200);assert.equal(value.schema,'business_cost_history_v1');assert.equal(value.state,'UNAVAILABLE');assert.equal(value.production_cost_cents,null);assert.equal(value.known_production_cost_cents,null);assert.equal(value.basis,'HISTORICAL_AUDITED_COSTS_PAID_CREATE_DATE');assert.equal((await f.call(undefined,{session:''})).status,401);assert.equal((await f.call(undefined,{contract:null})).status,409);assert.equal(saved(f.env.ADMIN_DB),before);read.restore();
});

for(const minify of [false,true])test(`generated App Worker keeps audited history read-only and session protected (minify=${minify})`,async t=>{
 const output=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify}),worker=(await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'))).default;
 const beforeFetch=globalThis.fetch;let providerCalls=0;globalThis.fetch=async()=>{providerCalls++;throw Error('UNEXPECTED_PRIVATE_PROVIDER');};t.after(()=>{globalThis.fetch=beforeFetch;});
 const f=await owner(t,(request,env)=>worker.fetch(request,env)),before=saved(f.env.ADMIN_DB),read=onlyReads(f.env.ADMIN_DB),response=await f.call(),value=await response.json();
 assert.equal(response.status,200);assert.equal(value.schema,'business_cost_history_v1');assert.equal(value.state,'UNAVAILABLE');assert.equal(value.production_cost_cents,null);assert.equal(value.known_production_cost_cents,null);assert.equal((await f.call(undefined,{session:''})).status,401);assert.equal((await f.call(undefined,{contract:null})).status,409);assert.equal((await f.call(undefined,{method:'POST'})).status,405);assert.equal(saved(f.env.ADMIN_DB),before);assert.equal(providerCalls,0);read.restore();
 const populated=await fixture(t),hot=await owner(t,(request,env)=>worker.fetch(request,env),populated.env),stored=saved(hot.env.ADMIN_DB),readHot=onlyReads(hot.env.ADMIN_DB),known=await hot.call(),report=await known.json();
 assert.equal(known.status,200);assert.equal(report.state,'PARTIAL');assert.deepEqual(report.pending,['PERIOD_INCOMPLETE']);assert.equal(report.production_cost_cents,null);assert.equal(report.known_production_cost_cents,3200);assert.equal(report.days.find(row=>row.date==='2026-10-10').production_cost_cents,2000);assert.equal(report.days.find(row=>row.date==='2026-10-20').production_cost_cents,1200);assert.deepEqual(report.audit_scope,{costs_revision:2,cost_rules_revision:1,bindings_revision:1});assert.equal(report.day_evidence.find(row=>row.date==='2026-10-10').costs_revision,1);assert.equal(saved(hot.env.ADMIN_DB),stored);assert.equal(providerCalls,0);readHot.restore();
});

test('separate dated report uses human-approved exact scoped names and prior audited prices, preserving v1 and legacy estimates',async t=>{
 const f=await fixture(t),db=f.env.ADMIN_DB;db.db.prepare("UPDATE variant_bindings_state SET payload='[]'").run();db.db.prepare("UPDATE variant_bindings_audit SET payload='[]'").run();
 const legacy=await f.invoke('read'),before=await readBusinessCostHistoryReport(f.env,{month},{now:f.now});assert.equal(before.coverage.pending_units,3);assert.equal(before.known_production_cost_cents,0);
 let scan=await startDatedCostScan(f.env,{month,end_date:'2026-10-24',item_ids:['1000','1001','1060']},{now:f.now});
 const getPage=request=>({schema:'historical_variant_evidence_v1',shop_id:1178167501,checked_at:Math.floor(f.now()/1000),...request,has_more:false,next_cursor:null,coverage:{orders_seen:3,target_orders:3,target_lines:3,target_units:3},evidence_complete:true,products:request.item_ids.map(item_id=>({item_id,variants:[{model_id:'0',line_count:1,quantity:1,item_names:['Camiseta adulta'],model_names:['M'],missing_item_name_lines:0,missing_model_name_lines:0,status_counts:[{status:'COMPLETED',line_count:1,quantity:1}],conflict:false}]})),omitted:{target_lines:0,target_units:0}});
 for(let n=0;scan.status==='RUNNING'&&n<3;n++)scan=await stepDatedCostScan(f.env,{scan_id:scan.scan_id,revision:scan.revision},getPage,{now:f.now});
 const proposed=await readBusinessCostHistoryDatedReport(f.env,{month},{now:f.now});assert.equal(proposed.coverage.pending_units,3);assert.equal(proposed.identity_evidence.approved_pairs,0);
 const proposal=(await readDatedCostEvidence(f.env,{month,end_date:'2026-10-24'},{now:f.now})).publications[0],review={scan_id:proposal.scan_id,revision:0,publication_sha256:proposal.publication_sha256,decision:'APPROVE'};
 await reviewDatedCostEvidence(f.env,review,'synthetic-owner',{now:f.now});const stored=saved(db),calls=structuredClone(f.calls),read=onlyReads(db),value=await readBusinessCostHistoryDatedReport(f.env,{month},{now:f.now});read.restore();
 assert.equal(BUSINESS_COST_HISTORY_DATED_CONTRACT,'business-cost-history-dated-v1');assert.equal(value.schema,'business_cost_history_dated_v1');assert.equal(value.state,'COMPLETE');assert.equal(value.production_cost_cents,3200);assert.equal(value.identity_evidence.approved_pairs,3);assert.equal(value.identity_evidence.publications[0].review_revision,1);assert.equal(value.days.find(row=>row.date==='2026-10-10').production_cost_cents,2000);assert.equal(value.days.find(row=>row.date==='2026-10-20').production_cost_cents,1200);assert.equal(saved(db),stored);assert.deepEqual(f.calls,calls);
 assert.deepEqual(await readBusinessCostHistoryReport(f.env,{month},{now:f.now}),before);assert.equal((await f.invoke('read')).production_cost_cents,legacy.production_cost_cents);
 await reviewDatedCostEvidence(f.env,{...review,revision:1,decision:'WITHDRAW'},'synthetic-owner',{now:f.now});assert.equal((await readBusinessCostHistoryDatedReport(f.env,{month},{now:f.now})).coverage.pending_units,3);
 assert.doesNotMatch(JSON.stringify(value),/item_id|model_id|item_names|model_names|order_sn|buyer|actor|payload/);
});
