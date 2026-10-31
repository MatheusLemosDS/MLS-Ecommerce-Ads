import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {collectionFixture} from './business-collection-fixture.mjs';
import {readCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {projectBusinessFinancialCloseout} from '../src/business-financial-closeout.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';

async function compiled(minify){
 const source=await readFile(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),seam='return {adminFetch,schedule,scheduledWork,workspaceAuthFetch};';
 assert.equal(source.split(seam).length,2);
 const contents=source.replace(seam,'return {adminFetch,schedule,scheduledWork,workspaceAuthFetch,buildBusinessFinancialCloseout,projectBusinessFinancialCloseout,runBusinessReconciliation,readBusinessReconciliation,readBusinessMonthDisplay};')+'\nexport {brazaAdmin as closeoutSmoke};';
 const result=await build({stdin:{contents,loader:'js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}

async function fixture(t){
 const f=await collectionFixture({allPaid:true,windowCounts:[3,1],paymentDelayMs:0});
 const SavedDate=globalThis.Date,savedFetch=globalThis.fetch,origin='https://financial-closeout.compiled.test';
 globalThis.Date=class extends SavedDate{constructor(...args){super(...(args.length?args:[f.clock.time]));}static now(){return f.clock.time;}};
 t.after(()=>{globalThis.Date=SavedDate;globalThis.fetch=savedFetch;f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let month=await f.invoke('start');for(let n=0;n<12&&month.status==='RUNNING';n++)month=await f.invoke('step');assert.equal(month.status,'COMPLETE');month=await f.invoke('ads');
 const published=await readCompletedBusinessMonth(f.env,'2026-10',{now:f.now});assert.ok(published);
 const sources=published.payload.slots.map(slot=>({run_id:slot.frame.run_id,source_revision:slot.frame.revision,start_date:slot.start_date,end_date:slot.end_date}));
 const reports=published.payload.slots.map((slot,index)=>{
  const c=slot.frame.coverage,base=Math.round(Number(slot.frame.known_expected_repass_raw)*100),adjustment=index===0?-150:0,stamp=f.now()/1000;
  const report={schema:'finance_reconciliation_v1',...sources[index],checked_at:stamp,status:'CHECKED',source_checked_at:{finance_oldest_at:slot.frame.source_checked_at.oldest_at,finance_latest_at:slot.frame.source_checked_at.latest_at,returns_oldest_at:null,returns_latest_at:null},coverage:{orders:c.orders,evidence_orders:c.orders,missing_evidence_orders:0,paid_orders:c.paid,review_orders:0,return_orders:0,return_unknown_orders:0},adjustments:{reported_orders:c.paid,missing_orders:0,conflicting_orders:0,known_adjustment_cents:adjustment,base_repass_cents:base,after_adjustment_repass_cents:base+adjustment},returns:{reference_count:0,checked_count:0,pending_count:0,known_requested_refund_cents:0,requested_amount_complete:true,permission:'UNKNOWN'},cases:[],truncation:{truncated:false,cases_total:0,cases_included:0},pending:['SETTLEMENT_NOT_RECONCILED'],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};
  assert.ok(projectReconciliationFrame(report));return report;
 });
 const env={...f.env,ADMIN_USERNAME:'closeout-owner',ADMIN_PASSWORD:'synthetic-closeout-password-123456',ADMIN_SESSION_SECRET:'SYNTHETIC_CLOSEOUT_SESSION_'+'s'.repeat(40)},network={calls:0};
 globalThis.fetch=async()=>{network.calls++;throw Error('SYNTHETIC_FORBIDDEN_CLOSEOUT_NETWORK_READ');};
 return {...f,env,origin,network,month,published,sources,reports};
}

for(const minify of [false,true])test(`generated owner closeout reads only saved same-publication evidence and embeds the strict browser report (minify=${minify})`,async t=>{
 const worker=await compiled(minify),api=worker.closeoutSmoke,f=await fixture(t);
 const login=await worker.default.fetch(new Request(f.origin+'/login',{method:'POST',headers:{origin:f.origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:f.env.ADMIN_USERNAME,password:f.env.ADMIN_PASSWORD})}),f.env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
 const endpoint=f.origin+'/api/admin/finance/closeout?month=2026-10',get=()=>worker.default.fetch(new Request(endpoint,{headers:{cookie}}),f.env);
 assert.equal((await worker.default.fetch(new Request(endpoint),f.env)).status,401);
 const beforeCalls=structuredClone(f.calls),firstResponse=await get();assert.equal(firstResponse.status,200,await firstResponse.clone().text());assert.equal(firstResponse.headers.get('cache-control'),'no-store');const first=await firstResponse.json();assert.ok(projectBusinessFinancialCloseout(first));assert.equal(first.scope_status,'SAME_PUBLICATION');assert.equal(first.publication_revision,f.published.publication.source_revision);assert.equal(first.totals.after_adjustment_repass_cents,null);assert.equal(first.checks.find(row=>row.id==='REPASSES').state,'PENDING');assert.equal(first.cases.find(row=>row.code==='RECONCILIATION_INCOMPLETE').affected_count,2);
 const sourceCalls=[];
 for(let n=0;n<2;n++){const result=await api.runBusinessReconciliation(f.env,async (_env,input)=>{sourceCalls.push({...input});return f.reports.find(row=>row.run_id===input.run_id);},{month:'2026-10'},{now:f.now});assert.equal(result.source_reads,1);assert.equal(result.status,'CHECKED');}
 assert.equal(sourceCalls.length,2);assert.deepEqual(sourceCalls.map(row=>row.run_id),f.sources.map(row=>row.run_id));
 const response=await get();assert.equal(response.status,200,await response.clone().text());const report=await response.json();assert.ok(projectBusinessFinancialCloseout(report));assert.equal(report.scope_status,'SAME_PUBLICATION');assert.equal(report.totals.expected_repass_cents,f.month.expected_repass_cents);assert.equal(report.totals.after_adjustment_repass_cents,f.month.expected_repass_cents-150);assert.equal(report.totals.realized_profit_cents,null);assert.deepEqual(report.comparisons.map(row=>row.state),['NOT_COMPARED','NOT_COMPARED']);assert.equal(report.comparisons[1].expected_cents,null);assert.equal(report.status,'PREPARING');assert.equal(report.period_complete,false);
 const observed=await api.readBusinessMonthDisplay(f.env,{month:'2026-10'},{now:f.now}),reconciliation=await api.readBusinessReconciliation(f.env,{month:'2026-10'},{now:f.now});assert.deepEqual(api.buildBusinessFinancialCloseout({monthly:observed.display,audit_scope:observed.audit_scope,reconciliation},{now:f.now}),report);
 const badScope=structuredClone(observed.audit_scope);badScope.publication_revision++;const rejected=api.buildBusinessFinancialCloseout({monthly:observed.display,audit_scope:badScope,reconciliation},{now:f.now});assert.equal(rejected.scope_status,'MISMATCH');assert.equal(rejected.totals.after_adjustment_repass_cents,null);
 for(const query of ['', '?month=2026-10&cursor=unsafe','?month=2026-10&month=2026-09','?month=invalid','?month=2026-13']){const r=await worker.default.fetch(new Request(f.origin+'/api/admin/finance/closeout'+query,{headers:{cookie}}),f.env);assert.equal(r.status,400,query);}
 const post=await worker.default.fetch(new Request(endpoint,{method:'POST',headers:{cookie}}),f.env);assert.equal(post.status,405);
 const html=await(await worker.default.fetch(new Request(f.origin+'/admin',{headers:{cookie}}),f.env)).text();assert.match(html,/id="businessFinancialCloseout"/);assert.match(html,/Pendências e preparação do fechamento/);assert.match(html,/Seller Centre: comparação não registrada.*Banco: extrato ainda não conciliado/);
 const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]).find(raw=>raw.includes('globalThis.brazaFinancialCloseout='));assert.ok(script);const end=script.indexOf(" const el=name=>document.getElementById('businessFinancialCloseout'+name);"),start=script.lastIndexOf('(()=>{',end);assert.ok(start>=0&&end>start);const context=vm.createContext({serialized:JSON.stringify(report)});vm.runInContext(script.slice(start+6,end)+'\nglobalThis.report=projectBusinessFinancialCloseout(JSON.parse(serialized));',context);assert.deepEqual(JSON.parse(JSON.stringify(context.report)),report);
 const exposed=JSON.stringify(report)+html;assert.doesNotMatch(exposed,/SYNTHETIC_CLOSEOUT_SESSION_|PRIVATE_INTEGRATION_ORDER_|PRIVATE_INTEGRATION_KEY|PRIVATE_INTEGRATION_ACCESS|"order_sn"/);assert.equal(f.network.calls,0,'owner closeout and invalid requests never call any provider');assert.deepEqual(f.calls,beforeCalls,'cached closeout does not collect orders, payments or Ads');
});
