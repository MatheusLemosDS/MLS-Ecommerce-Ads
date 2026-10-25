import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CLIENT} from '../src/admin-client.mjs';
import {CSS} from '../src/admin-view.mjs';
import {buildHermesFinancialContext,projectHermesFinancialContext} from '../src/hermes-financial-context.mjs';
import {collectionFixture} from './business-collection-fixture.mjs';
import {compiledOwnerReportPage,ownerReportBrowser} from './owner-report-browser-fixture.mjs';

const firstId='11111111-1111-4111-8111-111111111111',secondId='22222222-2222-4222-8222-222222222222';
const job=(id=firstId)=>({id,status:'completed',start_date:'2026-10-23',end_date:'2026-10-23',settings_revision:1,reserve_cents:0,cost_cents:1,cost_source:'operator_confirmed',failure:null,created_at:'2026-10-24T12:00:00Z',started_at:'2026-10-24T12:00:01Z',completed_at:'2026-10-24T12:00:02Z',result:'Análise de 2026-10-23\nInvestimento: 52.77\nCliques: 123\nImpressões: 2000\nROAS 12.5 19.28\nPedidos 9 15\nStatus econômico: UNKNOWN\nRecomendação: OBSERVE\nQualidade e limitações\nAnúncios não alterados.'});
const live=(rows,changes={})=>({rows,billing_mode:'subscription',mode:'manual',monthly_run_limit:100,hermes_connected:true,hermes_finance_ready:true,budget:{total_runs:rows.length,committed_cents:0,unknown_cost_runs:0},execution_access:{allowed:true,reason:null},...changes});
const envelope=(id,context)=>({job_id:id,fingerprint:createHash('sha256').update(JSON.stringify({job_id:id,context})).digest('hex'),context});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
let contextPromise;
async function financialContext(){
 if(!contextPromise)contextPromise=(async()=>{
  const f=await collectionFixture({allPaid:true,windowCounts:[10,0],paymentDelayMs:0});
  try{let frame=await f.invoke('start');while(frame.status==='RUNNING')frame=await f.invoke('step');frame=await f.invoke('ads');const value=buildHermesFinancialContext(frame,{analysisDate:'2026-10-23',capturedAt:f.now()/1000});assert.ok(projectHermesFinancialContext(value));assert.equal(value.available,true);return value;}
  finally{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();}
 })();return contextPromise;
}
const pages=new Map();
async function page(minify){if(!pages.has(minify))pages.set(minify,compiledOwnerReportPage(minify));return pages.get(minify);}
async function browser(t,{minify=false,source=false,respond}={}){
 let {html}=await page(minify);if(source)html=html.replace(/<script>([\s\S]*?)<\/script>/g,(tag,script)=>script.includes('let renderedReportKey=')?'<script>'+CLIENT+'</script>':tag);
 const b=ownerReportBrowser(html,{respond});t.after(()=>b.stop());return b;
}
function choose(b,rows,id=rows[0].id){b.context.jobRows=JSON.stringify(rows);b.context.selectedId=id;b.run("rows=JSON.parse(jobRows);selectedJobId=selectedId;activeBilling='subscription';renderJobs();");}
const details=b=>b.nodes.get('analysisView').querySelector('.job-financial-context');
const text=b=>b.nodes.get('analysisView').textContent;
const requests=b=>b.calls.filter(call=>/\/jobs\/[a-f0-9-]+\/financial-context$/.test(call.url));

for(const mode of [{source:true,minify:false},{source:false,minify:false},{source:false,minify:true}]){
 const suffix=mode.source?'source':'compiled minify='+mode.minify;
 test('financial evidence is loaded once on opening and keeps monthly balances separate from daily Ads ('+suffix+')',async t=>{
  const context=await financialContext(),row=job(),history=[row,...Array.from({length:29},(_,index)=>job('33333333-3333-4333-8333-'+String(index+1).padStart(12,'0')))],b=await browser(t,{...mode,respond:async url=>url==='/api/admin/live'?{body:live(history)}:url.endsWith('/financial-context')?{body:envelope(firstId,context)}:null});choose(b,history);
  assert.equal(details(b).open,false);assert.equal(requests(b).length,0);assert.match(text(b),/Anúncios do dia 23\/10\/2026/);
  details(b).open=true;await Promise.all([details(b).ontoggle(),details(b).ontoggle()]);
  assert.equal(requests(b).length,1);assert.match(text(b),/Financeiro da loja · 10\/2026/);assert.match(text(b),/Investimento em anúncios no mês/);assert.match(text(b),/187,71/);assert.match(text(b),/52.77/);assert.match(text(b),/Versões: vínculos 3 · custos 7/);assert.match(text(b),/Conferir fontes e versões/);assert.match(text(b),/Somente análise/);
  assert.equal(b.nodes.get('analysisView').querySelector('.job-financial-actions').children.length,context.monthly.top_actions.length);
  await b.run('pollLive()');await b.run('pollLive()');assert.equal(requests(b).length,1,'polling does not reread every saved financial context');
  b.context.updated=JSON.stringify({...row,result:row.result+'\nLeitura concluída.'});b.run('rows=[JSON.parse(updated)];renderJobs();');await b.flush();assert.equal(requests(b).length,1,'a report repaint uses the immutable saved evidence');
 });

 test('late financial replies cannot replace a different selected job and selecting back uses the cached context ('+suffix+')',async t=>{
  const context=await financialContext(),first=deferred(),b=await browser(t,{...mode,respond:async url=>url.includes(firstId)&&url.endsWith('/financial-context')?first.promise:url.includes(secondId)&&url.endsWith('/financial-context')?{body:envelope(secondId,context)}:null});choose(b,[job(),job(secondId)]);
  details(b).open=true;const pending=details(b).ontoggle();await b.flush();choose(b,[job(),job(secondId)],secondId);details(b).open=true;await details(b).ontoggle();assert.match(text(b),new RegExp(envelope(secondId,context).fingerprint));
  first.resolve({body:envelope(firstId,context)});await pending;assert.doesNotMatch(text(b),new RegExp(envelope(firstId,context).fingerprint));assert.match(text(b),new RegExp(envelope(secondId,context).fingerprint));
  choose(b,[job(),job(secondId)],firstId);await b.flush();assert.equal(requests(b).length,2);assert.match(text(b),new RegExp(envelope(firstId,context).fingerprint));
 });

 test('invalid context replies retain the report and allow an explicit retry without rendering private error details ('+suffix+')',async t=>{
  const context=await financialContext();let failed=true;const b=await browser(t,{...mode,respond:async url=>url.endsWith('/financial-context')?{body:failed?{...envelope(firstId,context),access_token:'PRIVATE_FINANCIAL_TOKEN'}:envelope(firstId,context)}:null});choose(b,[job()]);details(b).open=true;await details(b).ontoggle();
  assert.match(text(b),/Não foi possível conferir o registro financeiro/);assert.match(text(b),/52.77/);assert.doesNotMatch(text(b),/PRIVATE_FINANCIAL_TOKEN/);assert.equal(requests(b).length,1);
  failed=false;const retry=b.nodes.get('analysisView').querySelector('.job-financial-body').querySelector('button');assert.ok(retry);await retry.onclick();assert.equal(requests(b).length,2);assert.match(text(b),/187,71/);
 });

 test('old analyses explain missing historical evidence and an outdated assistant cannot request financial analyses ('+suffix+')',async t=>{
  const context={schema:'hermes_financial_context_v1',analysis_date:'2026-10-23',captured_at:Date.UTC(2026,9,24,12)/1000,available:false,unavailable_code:'LEGACY_CONTEXT_MISSING',monthly:null};assert.ok(projectHermesFinancialContext(context));
  const b=await browser(t,{...mode,respond:async url=>url.endsWith('/financial-context')?{body:envelope(firstId,context)}:url==='/api/admin/live'?{body:live([job()],{hermes_finance_ready:false,bridge_protocol:'LEGACY',execution_access:{allowed:false,reason:'bridge_upgrade_required'}})}:null});choose(b,[job()]);details(b).open=true;await details(b).ontoggle();
  assert.match(text(b),/análise é anterior ao registro financeiro integrado/);assert.doesNotMatch(text(b),/Saldo estimado da loja/);assert.match(text(b),/52.77/);await b.run('pollLive()');
  assert.equal(b.nodes.get('run').disabled,true);assert.match(b.nodes.get('setup').textContent,/Atualização do assistente pendente/);assert.match(b.nodes.get('runReason').textContent,/Atualização do assistente pendente/);assert.doesNotMatch(b.nodes.get('runReason').textContent,/bridge_|protocol|SSH/);assert.equal(requests(b).length,1);
 });
}

test('the financial evidence layout preserves mobile wrapping and an accessible collapsed disclosure',()=>{
 assert.match(CSS,/job-financial-context>summary:focus-visible/);assert.match(CSS,/job-financial-fingerprint\{overflow-wrap:anywhere/);assert.match(CSS,/@media\(max-width:700px\).*job-financial-metrics\{grid-template-columns:minmax\(0,1fr\)/);
});

test('an enqueue racing the assistant status update explains the required update without exposing an API code',async t=>{
 const b=await browser(t,{source:true,respond:async url=>url==='/api/admin/jobs'?{status:409,body:{error:'HERMES_FINANCE_UPGRADE_REQUIRED'}}:null});
 await assert.rejects(b.run("api('jobs',{})"),error=>error.status===409&&error.apiCode==='HERMES_FINANCE_UPGRADE_REQUIRED'&&/Atualização do assistente pendente/.test(error.message)&&!/HERMES_|bridge|protocol/.test(error.message));
});
