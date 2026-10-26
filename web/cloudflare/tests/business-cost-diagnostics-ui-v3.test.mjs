import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHEMA} from '../src/admin.mjs';
import {collectionFixture} from './business-collection-fixture.mjs';
import {workspaceBrowser} from './monthly-workspace-browser-fixture.mjs';
import {readBusinessMonthDisplay,projectBusinessMonth} from '../src/business-month.mjs';
import {buildBusinessMonthView,projectBusinessMonthView,projectBusinessMonthAuditScope} from '../src/business-month-view-state.mjs';
import {projectDailyBusinessSummary} from '../src/business-daily-summary.mjs';
import {readBusinessCostDiagnosticsEvidenceV3} from '../src/business-cost-diagnostics.mjs';
import {mutateExpenseLedger} from '../src/expense-ledger.mjs';

const month='2026-10',clone=value=>structuredClone(value);
const sourceCalls=f=>Object.fromEntries(['finance','ads','list','detail','payment'].map(key=>[key,f.calls[key].length]));
const projectView=value=>projectBusinessMonthView(value,projectBusinessMonth,projectBusinessMonthAuditScope,projectDailyBusinessSummary);
function viewFor(f,observed){
 // Daily data is deliberately absent in this fixture: the monthly publication
 // still carries its exact identity, independently of that optional extension.
 const value=buildBusinessMonthView({...observed,source_frames:null},{enabled:true,status:'COMPLETE',next_run_at:f.now()/1000+300,last_attempt_at:f.now()/1000-5},{now:f.now,contract:'business-month-view-v3'});
 assert.equal(value.daily_summary,null);assert.ok(projectView(value));return value;
}
async function fixture(t){
 const f=await collectionFixture({allPaid:true,windowCounts:[2,0],paymentDelayMs:0});
 t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 await f.env.ADMIN_DB.batch(SCHEMA.map(sql=>f.env.ADMIN_DB.prepare(sql)));
 let monthly=await f.invoke('start');for(let index=0;monthly.status==='RUNNING'&&index<10;index++)monthly=await f.invoke('step');
 assert.equal(monthly.status,'COMPLETE');await f.invoke('ads');
 f.env.ADMIN_DB.db.prepare("UPDATE variant_bindings_state SET revision=revision+1,payload='[]' WHERE id=1").run();
 const observed=await readBusinessMonthDisplay(f.env,{month},{now:f.now}),evidence=await readBusinessCostDiagnosticsEvidenceV3(f.env,{month},{now:f.now});
 assert.equal(evidence.diagnostic.summary.production_coverage.pending_units,2);
 assert.ok(evidence.diagnostic.products.some(product=>product.variants.some(variant=>variant.recoverable)));
 return {...f,observed,evidence,view:viewFor(f,observed)};
}
async function browser(t,f,{view=f.view,evidence=f.evidence}={}){
 const b=workspaceBrowser(view);b.context.initialClock=f.now();b.context.evidenceSeed=JSON.stringify(evidence);
 b.run(`clock=initialClock;let diagnosticJSON=evidenceSeed,recoveryJSON=null,holdDiagnostic=false,holdView=false,failView=false;
  globalThis.copies=[];globalThis.navigator={clipboard:{writeText:async value=>{copies.push(value);}}};
  customApi=async(path,body)=>{
   if(path.startsWith('finance/business-month-view?')){if(failView)throw Object.assign(Error('PRIVATE_VIEW_FAILURE'),{status:503});if(holdView)return new Promise(resolve=>globalThis.finishView=resolve);return JSON.parse(JSON.stringify(currentView));}
   if(path==='finance/cost-diagnostics?month=2026-10&evidence=history-v3'){if(holdDiagnostic)return new Promise(resolve=>globalThis.finishDiagnostic=resolve);return JSON.parse(diagnosticJSON);}
   if(path==='finance/cost-recovery?evidence=history-v3'){if(recoveryJSON===null)throw Error('UNEXPECTED_RECOVERY');return JSON.parse(recoveryJSON);}
   throw Error('UNEXPECTED_REQUEST:'+path);
  };`);
 t.after(()=>b.run('brazaMonthDashboard.stop()'));
 assert.equal(await b.run('brazaMonthDashboard.start({api})'),true);
 return b;
}
const check=b=>b.run('control("CostCheck").onclick()');
const recover=b=>b.run('control("CostRecover").onclick()');
function setEvidence(b,value){b.context.nextEvidence=JSON.stringify(value);b.run('diagnosticJSON=nextEvidence;');}
function setRecovery(b,value){b.context.nextRecovery=JSON.stringify(value);b.run('recoveryJSON=nextRecovery;');}
function differentPublication(view){const result=clone(view);result.audit_scope.publication_revision++;for(const source of result.audit_scope.sources)source.run_id=crypto.randomUUID();assert.ok(projectView(result));return result;}
function assertHidden(b){assert.equal(b.run('control("CostDiagnosticBody").hidden'),true);assert.equal(b.text('CostDiagnosticBody'),'');assert.equal(b.run('control("CostCopy").disabled'),true);}
function assertLocal(b,{recoveries=0}={}){
 const calls=b.calls();assert.ok(calls.every(row=>row.path.startsWith('finance/business-month-view?')||row.path==='finance/cost-diagnostics?month=2026-10&evidence=history-v3'||row.path==='finance/cost-recovery?evidence=history-v3'));
 assert.equal(calls.filter(row=>row.body!==undefined).length,recoveries);
 assert.ok(calls.filter(row=>row.body!==undefined).every(row=>row.path==='finance/cost-recovery?evidence=history-v3'&&JSON.stringify(row.body)===JSON.stringify({month})));
}
async function waitFor(b,expression){for(let index=0;index<15;index++){if(b.run(expression))return;await new Promise(resolve=>setImmediate(resolve));}assert.fail('The expected local asynchronous checkpoint was not reached: '+expression);}
async function resolvedCosts(f){
 f.env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET revision=revision+1,payload=? WHERE id=1').run(f.immutable.bindings[0].payload);
 const observed=await readBusinessMonthDisplay(f.env,{month},{now:f.now}),evidence=await readBusinessCostDiagnosticsEvidenceV3(f.env,{month},{now:f.now});
 assert.deepEqual(observed.audit_scope,f.observed.audit_scope);assert.equal(evidence.diagnostic.summary.production_coverage.pending_units,0);
 return {view:viewFor(f,observed),evidence,response:{schema:'business_cost_recovery_v1',month,diagnostic:evidence,work:{status:'PROGRESSED',processed:['1000','1001'],failed:[]}}};
}

test('a matching v3 diagnostic is shown and copied exactly once without changing monthly cards or requesting provider work',async t=>{
 const f=await fixture(t),before=sourceCalls(f),b=await browser(t,f),net=b.text('Net');
 assertHidden(b);assert.equal(b.calls().length,1);assert.equal(await check(b),true);
 assert.equal(b.run('control("CostDiagnosticBody").hidden'),false);assert.match(b.text('CostDiagnosticBody'),/2 unidade.*2 variação.*2 produto/);
 assert.match(b.text('CostDiagnosticBody'),/vinculada à atualização financeira exibida/);assert.equal(b.text('Net'),net);
 assert.equal(await b.run('control("CostCopy").onclick()'),true);assert.deepEqual(JSON.parse(b.run('copies[0]')),f.evidence);
 assert.equal(b.calls().length,2);assertLocal(b);assert.deepEqual(sourceCalls(f),before);
});

test('an in-flight monthly read invalidates a displayed A diagnostic when publication B arrives with identical numbers while hidden',async t=>{
 const f=await fixture(t),b=await browser(t,f);assert.equal(await check(b),true);
 const next=differentPublication(f.view),net=b.text('Net');b.load(next);b.run('holdView=true;globalThis.loading=brazaMonthDashboard.refreshCosts();');
 await waitFor(b,'typeof finishView==="function"');b.run('document.hidden=true;document.handlers.visibilitychange();finishView(JSON.parse(JSON.stringify(currentView)));');
 assert.equal(await b.run('loading'),true);assert.equal(b.text('Net'),net);assertHidden(b);
 assert.match(b.text('CostDiagnosticStatus'),/resumo ou suas referências mudaram/);
 assert.equal(await b.run('control("CostCopy").onclick()'),false);assert.equal(b.run('copies.length'),0);
 assert.equal(b.calls().filter(row=>row.path.includes('cost-diagnostics')).length,1,'a new publication does not automatically request another diagnostic');assertLocal(b);
});

test('a late A diagnostic cannot populate or enable copy after a same-month B publication is displayed',async t=>{
 const f=await fixture(t),b=await browser(t,f);b.run('holdDiagnostic=true;globalThis.checking=control("CostCheck").onclick();');
 await waitFor(b,'typeof finishDiagnostic==="function"');b.load(differentPublication(f.view));assert.equal(await b.run('brazaMonthDashboard.refreshCosts()'),true);
 b.run('finishDiagnostic(JSON.parse(diagnosticJSON));');assert.equal(await b.run('checking'),false);assertHidden(b);
 assert.match(b.text('CostDiagnosticStatus'),/outra atualização ou referência de custos/);assert.equal(b.calls().length,3);assertLocal(b);
});

test('cost, classification, expense and tax reference changes invalidate evidence even when the publication and amounts stay equal',async t=>{
 const f=await fixture(t);
 const changes=[['bindings_revision',view=>view.display.bindings_revision++],['costs_revision',view=>view.display.costs_revision++],['cost_rules_revision',view=>view.display.cost_rules_revision++],['classification_revision',view=>view.display.classification_revision++],['expenses_revision',view=>view.display.expenses.revision++],['tax_policy_revision',view=>view.display.tax.policy_revision++]];
 for(const [label,mutate] of changes){
  const b=await browser(t,f);assert.equal(await check(b),true,label);const next=clone(f.view);mutate(next);assert.ok(projectView(next),label);b.load(next);
  assert.equal(await b.run('brazaMonthDashboard.refreshCosts()'),true,label);assertHidden(b);assert.equal(await b.run('control("CostCopy").onclick()'),false,label);
  assert.equal(b.calls().filter(row=>row.path.includes('cost-diagnostics')).length,1,label);assertLocal(b);b.run('brazaMonthDashboard.stop()');
 }
});

test('a real expense draft invalidates the old diagnostic and readiness without changing the retained expense total or source identity',async t=>{
 const f=await fixture(t),b=await browser(t,f),before=sourceCalls(f);assert.equal(await check(b),true);
 const ledger=await mutateExpenseLedger(f.env,{action:'save',month,revision:0,request_id:crypto.randomUUID(),installments:1,entry:{id:null,category:'RENT',description:'Aluguel de teste',amount_cents:50000,competence_month:month,due_date:'2026-10-25',status:'OPEN',paid_date:null}},'fixture-owner',{now:f.now});assert.equal(ledger.mode,'DRAFT');
 const observed=await readBusinessMonthDisplay(f.env,{month},{now:f.now});assert.deepEqual(observed.audit_scope,f.observed.audit_scope);assert.deepEqual(observed.display.expenses,f.observed.display.expenses);
 b.load(viewFor(f,observed));assert.equal(await b.run('brazaMonthDashboard.refreshCosts()'),true);assertHidden(b);
 assert.match(b.run('text(control("Readiness").children.find(row=>text(row).startsWith("Outras despesas")))'),/Pendente/);
 assert.equal(await check(b),false,'the retained pre-draft response cannot attest to the displayed month');assertHidden(b);
 const draft=await readBusinessCostDiagnosticsEvidenceV3(f.env,{month},{now:f.now});setEvidence(b,draft);assert.equal(await check(b),true);
 assert.equal(await b.run('control("CostCopy").onclick()'),true);assert.deepEqual(JSON.parse(b.run('copies[0]')),draft);
 assert.equal(draft.recorded_balance.amount_cents,null);assert.ok(draft.diagnostic.pending.includes('EXTERNAL_EXPENSES_REQUIRED'));assertLocal(b);assert.deepEqual(sourceCalls(f),before);
});

test('malformed v3 and valid older envelopes never downgrade into an unscoped diagnostic on a scoped monthly view',async t=>{
 const f=await fixture(t),cases=[];
 for(const mutate of [value=>{value.audit_scope=null;},value=>{value.audit_scope.sources[0].source_revision++;},value=>{value.versions.expenses++;},value=>{value.private_data='PRIVATE';}]){const value=clone(f.evidence);mutate(value);cases.push(value);}
 cases.push({schema:'business_cost_diagnostics_evidence_v2',...Object.fromEntries(['diagnostic','history','recorded_balance','background'].map(key=>[key,clone(f.evidence[key])]))});
 for(const evidence of cases){const b=await browser(t,f,{evidence});assert.equal(await check(b),false);assertHidden(b);assert.equal(await b.run('control("CostCopy").onclick()'),false);assert.equal(b.calls().length,2);assertLocal(b);assert.doesNotMatch(b.text('CostDiagnosticStatus'),/PRIVATE/);b.run('brazaMonthDashboard.stop()');}
});

test('recovery keeps its changed-cost candidate private until the same published monthly cards have been reread',async t=>{
 const f=await fixture(t),b=await browser(t,f),net=b.text('Net'),before=sourceCalls(f),resolved=await resolvedCosts(f);setRecovery(b,resolved.response);
 b.run('holdView=true;globalThis.recovering=control("CostRecover").onclick();');await waitFor(b,'typeof finishView==="function"');
 assertHidden(b);assert.equal(b.text('Net'),net);assert.equal(b.run('copies.length'),0);
 b.load(resolved.view);b.run('finishView(JSON.parse(JSON.stringify(currentView)));');assert.equal(await b.run('recovering'),true);
 assert.match(b.text('CostDiagnosticBody'),/0 unidade.*0 variação.*0 produto/);assert.match(b.text('CostDiagnosticBody'),/Não há produtos sem custo/);
 assert.equal(await b.run('control("CostCopy").onclick()'),true);assert.deepEqual(JSON.parse(b.run('copies[0]')),resolved.evidence);
 assert.equal(b.calls().length,4);assertLocal(b,{recoveries:1});assert.deepEqual(sourceCalls(f),before);
});

test('a failed monthly reread cannot expose or copy a newer recovery candidate',async t=>{
 const f=await fixture(t),b=await browser(t,f),net=b.text('Net'),resolved=await resolvedCosts(f);setRecovery(b,resolved.response);b.run('failView=true;');
 assert.equal(await recover(b),false);assertHidden(b);assert.equal(b.text('Net'),net);
 assert.match(b.text('CostDiagnosticStatus'),/resumo mensal não pôde ser relido/);assert.doesNotMatch(b.text('CostDiagnosticStatus'),/PRIVATE/);
 assert.equal(await b.run('control("CostCopy").onclick()'),false);assert.equal(b.calls().length,4);assertLocal(b,{recoveries:1});
});

test('a different publication returned after recovery leaves the candidate unshown and does not start an automatic retry loop',async t=>{
 const f=await fixture(t),b=await browser(t,f),resolved=await resolvedCosts(f);setRecovery(b,resolved.response);b.load(differentPublication(resolved.view));
 assert.equal(await recover(b),false);assertHidden(b);assert.match(b.text('CostDiagnosticStatus'),/resumo e o diagnóstico ainda têm referências diferentes/);
 assert.equal(await b.run('control("CostCopy").onclick()'),false);assert.equal(b.calls().length,4);assertLocal(b,{recoveries:1});
});
