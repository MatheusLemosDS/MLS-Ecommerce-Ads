import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {BUSINESS_RECONCILIATION_CLIENT,BUSINESS_RECONCILIATION_CSS,businessReconciliationBody} from '../src/business-reconciliation-view.mjs';
import {projectBusinessReconciliation} from '../src/business-reconciliation.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';

const clock=Date.UTC(2026,9,25,15),stamp=clock/1000,uuid='11111111-1111-4111-8111-111111111111';
function observation({month='2026-10',denied=false,missing=false}={}){
 const at=stamp-120,start=month+'-01',end=month+'-15';
 const report={schema:'finance_reconciliation_v1',run_id:uuid,source_revision:2,start_date:start,end_date:end,checked_at:at,status:denied?'BLOCKED':missing?'PARTIAL':'CHECKED',source_checked_at:{finance_oldest_at:at-300,finance_latest_at:at-200,returns_oldest_at:denied?null:at-150,returns_latest_at:denied?null:at-150},coverage:{orders:2,evidence_orders:missing?1:2,missing_evidence_orders:missing?1:0,paid_orders:1,review_orders:1,return_orders:1,return_unknown_orders:0},adjustments:{reported_orders:missing?0:1,missing_orders:missing?1:0,conflicting_orders:0,known_adjustment_cents:missing?0:100,base_repass_cents:8000,after_adjustment_repass_cents:missing?null:8100},returns:{reference_count:1,checked_count:denied?0:1,pending_count:denied?1:0,known_requested_refund_cents:denied?0:1000,requested_amount_complete:!denied,permission:denied?'DENIED':'AVAILABLE'},cases:[{case_hash:'a'.repeat(64),order_hash:'b'.repeat(64),status:denied?'PENDING':'CANCELLED',requested_refund_cents:denied?null:1000,checked_at:denied?null:at-150,diagnostic:denied?'PERMISSION_DENIED':null}],truncation:{truncated:false,cases_total:1,cases_included:1},pending:['RETURN_VALUES_UNVERIFIED','SETTLEMENT_NOT_RECONCILED',...(denied?['RETURN_DETAILS_PENDING','RETURN_PERMISSION_REQUIRED']:[]),...(missing?['ORDER_EVIDENCE_MISSING','ADJUSTMENT_FIELDS_UNAVAILABLE']:[])],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};
 const value={schema:'business_reconciliation_v1',month,start_date:start,end_date:end,checked_at:stamp,status:denied||missing?'PARTIAL':'CHECKED',source_revision:7,sources:[{run_id:uuid,source_revision:2,start_date:start,end_date:end}],reports:[report],attempts:[{run_id:uuid,source_revision:2,checked_at:stamp-100,status:'SUCCESS',code:null,next_attempt_at:stamp+600}],pending:denied||missing?['RECONCILIATION_PENDING']:[]};
 assert.ok(projectReconciliationFrame(report));assert.ok(projectBusinessReconciliation(value,projectReconciliationFrame));return value;
}
function browser(value=observation()){
 const ids=[...businessReconciliationBody().matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]),context=vm.createContext({serialized:JSON.stringify(value)});
 vm.runInContext(`let clock=${clock};class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}globalThis.Date=ClockDate;function node(tag='div'){return {tag,textContent:'',className:'',hidden:false,open:false,children:[],append(...values){this.children.push(...values);},replaceChildren(...values){this.textContent='';this.children=[...values];}};}const controls=new Map(${JSON.stringify(ids)}.map(id=>[id,node()]));const document={hidden:false,getElementById:id=>controls.get(id),createElement:tag=>node(tag)};const text=node=>node.textContent+node.children.map(text).join(' '),control=name=>controls.get('businessReconciliation'+name);let current=JSON.parse(serialized),customApi=null;const calls=[];const api=async(path,body)=>{calls.push({path,body});return customApi?customApi(path,body):JSON.parse(JSON.stringify(current));};const financialNet={textContent:'R$ 2.250,13'};`+BUSINESS_RECONCILIATION_CLIENT,context);
 const run=code=>vm.runInContext(code,context);
 return {context,run,text:name=>run('text(control('+JSON.stringify(name)+'))'),calls:()=>JSON.parse(run('JSON.stringify(calls)')),load(value){context.serialized=JSON.stringify(value);run('current=JSON.parse(serialized);');}};
}

test('the evidence section is collapsed, responsive and displays requested refunds separately from the monthly balance',async()=>{
 const body=businessReconciliationBody();assert.match(body,/Conferência de repasses e devoluções/);assert.doesNotMatch(body,/<details[^>]*\bopen\b/);assert.match(BUSINESS_RECONCILIATION_CSS,/@media\(max-width:640px\)/);
 const b=browser();assert.equal(b.run('brazaReconciliation.start({api})'),true);assert.equal(await b.run('brazaReconciliation.observe("2026-10")'),true);
 assert.equal(b.run('control("Details").open'),false);assert.match(b.text('Scope'),/01\/10\/2026 a 15\/10\/2026.*Revisão 7/);assert.match(b.text('Metrics'),/2 de 2.*81,00.*1 de 1/);
 assert.match(b.text('Runs'),/Repasse base informado:.*80,00.*Ajustes informados:.*1,00.*Repasse após ajustes informado:.*81,00/);
 assert.match(b.text('Runs'),/Solicitação cancelada.*não é uma despesa confirmada.*Valor solicitado informado:.*10,00/);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
 assert.equal(b.text('Badge'),'Evidências disponíveis');assert.match(body,/não comprovam pagamento ou recebimento no banco/);assert.deepEqual(b.calls(),[{path:'finance/reconciliation?month=2026-10'}]);
});

test('absent adjusted payout and denied return permission stay unavailable rather than becoming zero or a new deduction',async()=>{
 const b=browser(observation({denied:true,missing:true}));b.run('brazaReconciliation.start({api})');await b.run('brazaReconciliation.observe("2026-10")');
 assert.match(b.text('Metrics'),/Repasse após ajustes informado\s+Não informado/);assert.match(b.text('Runs'),/Ajustes nos pedidos com valores compatíveis: Não informado/);
 assert.match(b.text('Runs'),/Shopee não liberou os detalhes de devoluções.*repasse e anúncios continuam disponíveis/);assert.match(b.text('Runs'),/Valor solicitado informado: Não informado/);assert.doesNotMatch(b.text('Runs'),/Valor solicitado informado:.*0,00/);
 assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');assert.equal(b.calls().length,1);assert.equal(b.run('control("Metrics").hidden'),false);
});

test('same-month observations coalesce and are throttled without an independent timer or any provider fallback',async()=>{
 const b=browser();b.run('brazaReconciliation.start({api});customApi=()=>new Promise(resolve=>globalThis.finish=resolve);globalThis.first=brazaReconciliation.observe("2026-10");globalThis.second=brazaReconciliation.observe("2026-10");');assert.equal(b.run('first===second'),true);
 await Promise.resolve();assert.equal(b.calls().length,1);b.run('finish(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('first'),true);
 for(let i=0;i<3;i++)assert.equal(await b.run('brazaReconciliation.observe("2026-10")'),true);assert.equal(b.calls().length,1);
 b.run('clock+=60000;customApi=async()=>{throw Error("PRIVATE_PROVIDER_TOKEN");};');assert.equal(await b.run('brazaReconciliation.observe("2026-10")'),false);assert.match(b.text('Status'),/evidências salvas e suas datas foram preservadas/);assert.doesNotMatch(b.text('Status'),/PRIVATE_PROVIDER_TOKEN/);assert.match(b.text('Runs'),/81,00/);
 assert.ok(b.calls().every(call=>call.body===undefined&&call.path==='finance/reconciliation?month=2026-10'));assert.equal(b.run('typeof setTimeout'),'undefined');
});

test('a late response from another month cannot replace the selected period or refresh its source timestamps',async()=>{
 const b=browser();b.context.september=JSON.stringify(observation({month:'2026-09'}));b.run('brazaReconciliation.start({api});customApi=(path)=>path.includes("2026-10")?new Promise(resolve=>globalThis.finishOctober=resolve):JSON.parse(september);globalThis.october=brazaReconciliation.observe("2026-10");');await Promise.resolve();assert.equal(await b.run('brazaReconciliation.observe("2026-09")'),true);const visible=b.text('Scope'),sources=b.text('Runs');
 b.run('finishOctober(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('october'),false);assert.equal(b.text('Scope'),visible);assert.equal(b.text('Runs'),sources);assert.match(visible,/01\/09\/2026 a 15\/09\/2026/);
});

test('hidden, stopped and malformed reads never issue or restore financial source work',async()=>{
 const b=browser();b.run('brazaReconciliation.start({api});document.hidden=true;');assert.equal(await b.run('brazaReconciliation.observe("2026-10")'),false);assert.equal(b.calls().length,0);
 b.run('document.hidden=false;customApi=()=>new Promise(resolve=>globalThis.finish=resolve);globalThis.waiting=brazaReconciliation.observe("2026-10");');await Promise.resolve();b.run('brazaReconciliation.stop();finish(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('waiting'),false);assert.equal(b.text('Runs'),'');
 b.run('brazaReconciliation.start({api});customApi=async()=>({...JSON.parse(JSON.stringify(current)),access_token:"PRIVATE"});');assert.equal(await b.run('brazaReconciliation.observe("2026-10")'),false);assert.doesNotMatch(b.text('Runs'),/PRIVATE/);assert.equal(b.calls().length,2);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
});

test('a partial set of monthly windows never exposes one window payout as the full month',async()=>{
 const value=observation();value.end_date='2026-10-25';value.status='PARTIAL';value.pending=['RECONCILIATION_PENDING'];value.sources.push({run_id:'22222222-2222-4222-8222-222222222222',source_revision:3,start_date:'2026-10-16',end_date:'2026-10-25'});assert.ok(projectBusinessReconciliation(value,projectReconciliationFrame));
 const b=browser(value);b.run('brazaReconciliation.start({api})');await b.run('brazaReconciliation.observe("2026-10")');assert.match(b.text('Status'),/1 de 2 intervalo/);assert.match(b.text('Metrics'),/ainda não representa todo o mês/);assert.match(b.text('Metrics'),/Repasse após ajustes informado\s+Não informado/);assert.match(b.text('Runs'),/15\/10\/2026.*81,00/);
});

test('an initial month without a publication shows a pending period and a failed refresh keeps original financial observations',async()=>{
 const empty={schema:'business_reconciliation_v1',month:'2026-10',start_date:'2026-10-01',end_date:null,checked_at:stamp,status:'COLLECTING',source_revision:null,sources:[],reports:[],attempts:[],pending:['PUBLICATION_REQUIRED']};assert.ok(projectBusinessReconciliation(empty,projectReconciliationFrame));
 const b=browser(empty);b.run('brazaReconciliation.start({api})');await b.run('brazaReconciliation.observe("2026-10")');assert.equal(b.run('control("Metrics").hidden'),true);assert.match(b.text('Status'),/Aguardando o resumo completo/);assert.equal(b.text('Runs'),'');
 const saved=observation();saved.checked_at=stamp+60;saved.attempts[0]={...saved.attempts[0],checked_at:stamp+60,status:'UNAVAILABLE',code:'FINANCE_RECONCILIATION_TIMEOUT',next_attempt_at:stamp+360};saved.pending=['SOURCE_UNAVAILABLE'];assert.ok(projectBusinessReconciliation(saved,projectReconciliationFrame));b.load(saved);b.run('clock+=60000;');await b.run('brazaReconciliation.observe("2026-10")');assert.match(b.text('Notice'),/datas originais/);assert.match(b.text('Runs'),new RegExp(new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date((stamp-420)*1000)).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
});

test('a known return with no retained reference is displayed as pending rather than zero total returns',async()=>{
 const value=observation(),report=value.reports[0];value.status='PARTIAL';value.pending=['RECONCILIATION_PENDING'];report.status='PARTIAL';report.source_checked_at.returns_oldest_at=null;report.source_checked_at.returns_latest_at=null;report.returns={reference_count:0,checked_count:0,pending_count:0,known_requested_refund_cents:0,requested_amount_complete:true,permission:'UNKNOWN'};report.cases=[];report.truncation={truncated:false,cases_total:0,cases_included:0};report.pending=['RETURN_REFERENCES_MISSING','SETTLEMENT_NOT_RECONCILED'];assert.ok(projectBusinessReconciliation(value,projectReconciliationFrame));
 const b=browser(value);b.run('brazaReconciliation.start({api})');await b.run('brazaReconciliation.observe("2026-10")');assert.match(b.text('Metrics'),/Solicitações com detalhes consultados Referências pendentes/);assert.doesNotMatch(b.text('Metrics'),/0 de 0/);assert.match(b.text('Runs'),/ocorrências de devolução sem todas as referências/);
});

test('a new cohort in the same month invalidates the cache and ignores an older in-flight observation while unchanged cohorts retain the throttle',async()=>{
 const b=browser(),next=observation();next.source_revision=8;next.sources[0].source_revision=3;next.attempts[0].source_revision=3;next.reports[0].source_revision=3;next.reports[0].coverage.orders=3;next.reports[0].coverage.evidence_orders=3;next.reports[0].coverage.paid_orders=2;next.reports[0].adjustments={reported_orders:2,missing_orders:0,conflicting_orders:0,known_adjustment_cents:200,base_repass_cents:16000,after_adjustment_repass_cents:16200};assert.ok(projectBusinessReconciliation(next,projectReconciliationFrame));b.context.nextObservation=JSON.stringify(next);
 b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10","cohort-1")'),true);assert.match(b.text('Metrics'),/2 de 2.*81,00/);
 for(let index=0;index<3;index++)assert.equal(await b.run('brazaReconciliation.observe("2026-10","cohort-1")'),true);assert.equal(b.calls().length,1);
 b.run('clock+=60000;let refreshCount=0;customApi=()=>new Promise(resolve=>{if(++refreshCount===1)globalThis.finishOldCohort=resolve;else globalThis.finishNewCohort=resolve;});globalThis.oldRequest=brazaReconciliation.observe("2026-10","cohort-1");');await Promise.resolve();assert.equal(b.calls().length,2);
 b.run('globalThis.newRequest=brazaReconciliation.observe("2026-10","cohort-2");globalThis.sameCohortRequest=brazaReconciliation.observe("2026-10","cohort-2");');assert.equal(b.run('newRequest===sameCohortRequest'),true);assert.equal(b.text('Runs'),'','old same-month totals are hidden while the newly selected cohort is observed');await Promise.resolve();assert.equal(b.calls().length,3);
 b.run('finishNewCohort(JSON.parse(nextObservation));');assert.equal(await b.run('newRequest'),true);const metrics=b.text('Metrics'),scope=b.text('Scope');assert.match(metrics,/3 de 3.*162,00/);assert.match(scope,/Revisão 8/);
 b.run('finishOldCohort(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('oldRequest'),false);assert.equal(b.text('Metrics'),metrics);assert.equal(b.text('Scope'),scope);assert.equal(await b.run('brazaReconciliation.observe("2026-10","cohort-2")'),true);assert.equal(b.calls().length,3);assert.ok(b.calls().every(call=>call.body===undefined&&call.path==='finance/reconciliation?month=2026-10'));assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
});
