import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFixture} from './business-collection-fixture.mjs';
import {compiledOwnerReportPage,ownerReportBrowser} from './owner-report-browser-fixture.mjs';
import {readBusinessCostDiagnostics} from '../src/business-cost-diagnostics.mjs';

for(const minify of [false,true])test('compiled monthly '+(minify?'minified':'normal')+' client shows and copies one real local cost diagnostic without reimporting finance or Ads',async t=>{
 const f=await collectionFixture({allPaid:true,windowCounts:[2,0],paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let frame=await f.invoke('start');for(let i=0;frame.status==='RUNNING'&&i<8;i++)frame=await f.invoke('step');assert.equal(frame.status,'COMPLETE');await f.invoke('ads');f.env.ADMIN_DB.db.prepare("UPDATE variant_bindings_state SET revision=revision+1,payload='[]' WHERE id=1").run();frame=await f.invoke('read');assert.equal(frame.unmapped_variants.length,2);
 const before={finance:f.calls.finance.length,ads:f.calls.ads.length},diagnostic=await readBusinessCostDiagnostics(f.env,{month:'2026-10'},{now:f.now});assert.equal(diagnostic.products.length,2);assert.equal(diagnostic.summary.production_coverage.pending_units,2);
 const {html}=await compiledOwnerReportPage(minify),b=ownerReportBrowser(html,{scriptIncludes:'globalThis.brazaMonthDashboard=',respond:async(url,options)=>{
  if(url.startsWith('/api/admin/finance/cost-diagnostics?'))return {body:diagnostic};
  if(url==='/api/admin/finance/cost-recovery'){assert.deepEqual(JSON.parse(options.body),{month:'2026-10'});return {body:{schema:'business_cost_recovery_v1',month:'2026-10',diagnostic,work:{status:'RETRY_WAIT',processed:[],failed:[]}}};}
  assert.equal(url,'/api/admin/finance/business-month');assert.equal(JSON.parse(options.body).operation,'read');return {body:frame};
 }});
 b.context.clock=f.now();b.run(`class CostClock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}globalThis.Date=CostClock;async function compiledCostsApi(path,body){const response=await fetch('/api/admin/'+path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)});if(!response.ok)throw Error('safe');return response.json();}globalThis.copiedDiagnostic=null;globalThis.navigator={clipboard:{writeText:async value=>{copiedDiagnostic=value;}}};`);
 assert.equal(await b.run('brazaMonthDashboard.start({api:compiledCostsApi})'),true);const oldNet=b.nodes.get('businessMonthNet').textContent;
 assert.equal(await b.nodes.get('businessMonthCostCheck').onclick(),true);assert.match(b.nodes.get('businessMonthCostDiagnosticBody').textContent,/2 unidade.*2 variação.*2 produto/);assert.match(b.nodes.get('businessMonthCostDiagnosticBody').textContent,/Em cancelamento: 0.*Em devolução: 0.*Situação desconhecida: 0/);assert.equal(b.nodes.get('businessMonthNet').textContent,oldNet);
 assert.equal(await b.nodes.get('businessMonthCostCopy').onclick(),true);assert.deepEqual(JSON.parse(b.run('copiedDiagnostic')),diagnostic);
 assert.equal(await b.nodes.get('businessMonthCostRecover').onclick(),true);assert.equal(b.calls.filter(call=>call.url==='/api/admin/finance/cost-recovery').length,1);assert.match(b.nodes.get('businessMonthCostDiagnosticStatus').textContent,/pediu uma espera/);assert.equal(f.calls.finance.length,before.finance);assert.equal(f.calls.ads.length,before.ads);assert.doesNotMatch(b.run('copiedDiagnostic'),/PRIVATE_|access_token|order_sn|source_hash/);b.run('brazaMonthDashboard.stop()');
});
