import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {BUSINESS_RECONCILIATION_CLIENT,BUSINESS_RECONCILIATION_CSS,businessReconciliationBody} from '../src/business-reconciliation-view.mjs';
import {projectBusinessReconciliation,projectBusinessReconciliationEvidence} from '../src/business-reconciliation.mjs';
import {projectReconciliationFrame,projectReconciliationEvidenceFrame} from '../../finance/src/reconciliation-frame.mjs';

const clock=Date.UTC(2026,9,25,15),stamp=clock/1000,uuid='11111111-1111-4111-8111-111111111111';
function observation({month='2026-10',denied=false,missing=false}={}){
 const at=stamp-120,start=month+'-01',end=month+'-15';
 const report={schema:'finance_reconciliation_v1',run_id:uuid,source_revision:2,start_date:start,end_date:end,checked_at:at,status:denied?'BLOCKED':missing?'PARTIAL':'CHECKED',source_checked_at:{finance_oldest_at:at-300,finance_latest_at:at-200,returns_oldest_at:denied?null:at-150,returns_latest_at:denied?null:at-150},coverage:{orders:2,evidence_orders:missing?1:2,missing_evidence_orders:missing?1:0,paid_orders:1,review_orders:1,return_orders:1,return_unknown_orders:0},adjustments:{reported_orders:missing?0:1,missing_orders:missing?1:0,conflicting_orders:0,known_adjustment_cents:missing?0:100,base_repass_cents:8000,after_adjustment_repass_cents:missing?null:8100},returns:{reference_count:1,checked_count:denied?0:1,pending_count:denied?1:0,known_requested_refund_cents:denied?0:1000,requested_amount_complete:!denied,permission:denied?'DENIED':'AVAILABLE'},cases:[{case_hash:'a'.repeat(64),order_hash:'b'.repeat(64),status:denied?'PENDING':'CANCELLED',requested_refund_cents:denied?null:1000,checked_at:denied?null:at-150,diagnostic:denied?'PERMISSION_DENIED':null}],truncation:{truncated:false,cases_total:1,cases_included:1},pending:['RETURN_VALUES_UNVERIFIED','SETTLEMENT_NOT_RECONCILED',...(denied?['RETURN_DETAILS_PENDING','RETURN_PERMISSION_REQUIRED']:[]),...(missing?['ORDER_EVIDENCE_MISSING','ADJUSTMENT_FIELDS_UNAVAILABLE']:[])],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};
 const value={schema:'business_reconciliation_v1',month,start_date:start,end_date:end,checked_at:stamp,status:denied||missing?'PARTIAL':'CHECKED',source_revision:7,sources:[{run_id:uuid,source_revision:2,start_date:start,end_date:end}],reports:[report],attempts:[{run_id:uuid,source_revision:2,checked_at:stamp-100,status:'SUCCESS',code:null,next_attempt_at:stamp+600}],pending:denied||missing?['RECONCILIATION_PENDING']:[]};
 assert.ok(projectReconciliationFrame(report));assert.ok(projectBusinessReconciliation(value,projectReconciliationFrame));return value;
}
function auditScope(value){value=value.schema==='business_reconciliation_v2'?value.report:value;return value.sources.length?{publication_revision:value.source_revision,start_date:value.start_date,end_date:value.end_date,sources:value.sources.map(({run_id,source_revision,start_date,end_date})=>({run_id,source_revision,start_date,end_date}))}:null;}
const validators={projectBusiness:projectBusinessReconciliation,projectFrame:projectReconciliationFrame,projectEvidenceFrame:projectReconciliationEvidenceFrame};
const internalHash=index=>String(index).padEnd(64,'a');
function reviewObservation(){
 const value=observation(),report=value.reports[0];
 report.coverage={orders:6,evidence_orders:6,missing_evidence_orders:0,paid_orders:4,review_orders:2,return_orders:4,return_unknown_orders:0};
 report.adjustments={reported_orders:4,missing_orders:0,conflicting_orders:0,known_adjustment_cents:400,base_repass_cents:32000,after_adjustment_repass_cents:32400};
 report.cases=Array.from({length:6},(_,index)=>({case_hash:internalHash(index+11),order_hash:internalHash(index+1),status:'REQUESTED',requested_refund_cents:1000,checked_at:stamp-270,diagnostic:null}));
 report.returns={reference_count:6,checked_count:6,pending_count:0,known_requested_refund_cents:6000,requested_amount_complete:true,permission:'AVAILABLE'};
 report.truncation={truncated:false,cases_total:6,cases_included:6};
 const review={schema:'finance_review_orders_v1',summary:{orders:2,in_cancel:0,to_return:2,other:0,unknown:0},orders:[5,6].map(index=>({order_hash:internalHash(index),status:'TO_RETURN',source_checked_at:stamp-400,reference_state:'AVAILABLE',reference_count:1,references_checked_at:stamp-300,reference_diagnostic:null,next_attempt_at:null,checked_cases:1,pending_cases:0})),truncation:{truncated:false,orders_total:2,orders_included:2},basis:'REVIEW_ORDERS_OUTSIDE_PAID_COHORT'};
 const wrapper={schema:'business_reconciliation_v2',report:value,reviews:[{run_id:report.run_id,source_revision:report.source_revision,review}]};assert.ok(projectBusinessReconciliationEvidence(wrapper,validators));return wrapper;
}
function browser(value=observation()){
 const ids=[...businessReconciliationBody().matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]),context=vm.createContext({serialized:JSON.stringify(value),TextEncoder});
 vm.runInContext(`${auditScope.toString()}let clock=${clock};class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}globalThis.Date=ClockDate;function node(tag='div'){return {tag,textContent:'',className:'',hidden:false,open:false,children:[],append(...values){this.children.push(...values);},replaceChildren(...values){this.textContent='';this.children=[...values];},scrollIntoView(){this.scrolled=true;},focus(){this.focused=true;}};}const controls=new Map(${JSON.stringify(ids)}.map(id=>[id,node()]));const document={hidden:false,getElementById:id=>controls.get(id),createElement:tag=>node(tag)};const text=node=>node.textContent+node.children.map(text).join(' '),control=name=>controls.get('businessReconciliation'+name);let current=JSON.parse(serialized),selectedScope=auditScope(current),customApi=null;const calls=[];const api=async(path,body)=>{calls.push({path,body});return customApi?customApi(path,body):JSON.parse(JSON.stringify(current));};const financialNet={textContent:'R$ 2.250,13'};`+BUSINESS_RECONCILIATION_CLIENT,context);
 const run=code=>vm.runInContext(code,context);
 return {context,run,text:name=>run('text(control('+JSON.stringify(name)+'))'),calls:()=>JSON.parse(run('JSON.stringify(calls)')),load(value){context.serialized=JSON.stringify(value);run('current=JSON.parse(serialized);');}};
}

test('the evidence section is collapsed, responsive and displays requested refunds separately from the monthly balance',async()=>{
 const body=businessReconciliationBody();assert.match(body,/Conferência de repasses e devoluções/);assert.doesNotMatch(body,/<details[^>]*\bopen\b/);assert.match(BUSINESS_RECONCILIATION_CSS,/@media\(max-width:640px\)/);
 const b=browser();assert.equal(b.run('brazaReconciliation.start({api})'),true);assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);
 assert.equal(b.run('control("Details").open'),false);assert.match(b.text('Scope'),/01\/10\/2026 a 15\/10\/2026.*Revisão 7/);assert.match(b.text('Metrics'),/2 de 2.*81,00.*1 de 1/);
 assert.match(b.text('Runs'),/Repasse base informado:.*80,00.*Ajustes informados:.*1,00.*Repasse após ajustes informado:.*81,00/);
 assert.match(b.text('Runs'),/Solicitação cancelada.*não é uma despesa confirmada.*Valor solicitado informado:.*10,00/);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
 assert.equal(b.text('Badge'),'Evidências disponíveis');assert.match(body,/não comprovam pagamento ou recebimento no banco/);assert.deepEqual(b.calls(),[{path:'finance/reconciliation?month=2026-10&evidence=review-v1'}]);
});

test('absent adjusted payout and denied return permission stay unavailable rather than becoming zero or a new deduction',async()=>{
 const b=browser(observation({denied:true,missing:true}));b.run('brazaReconciliation.start({api})');await b.run('brazaReconciliation.observe("2026-10",selectedScope)');
 assert.match(b.text('Metrics'),/Repasse após ajustes informado\s+Não informado/);assert.match(b.text('Runs'),/Ajustes nos pedidos com valores compatíveis: Não informado/);
 assert.match(b.text('Runs'),/Shopee não liberou os detalhes de devoluções.*repasse e anúncios continuam disponíveis/);assert.match(b.text('Runs'),/Valor solicitado informado: Não informado/);assert.doesNotMatch(b.text('Runs'),/Valor solicitado informado:.*0,00/);
 assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');assert.equal(b.calls().length,1);assert.equal(b.run('control("Metrics").hidden'),false);
});

test('same-month observations coalesce and are throttled without an independent timer or any provider fallback',async()=>{
 const b=browser();b.run('brazaReconciliation.start({api});customApi=()=>new Promise(resolve=>globalThis.finish=resolve);globalThis.first=brazaReconciliation.observe("2026-10",selectedScope);globalThis.second=brazaReconciliation.observe("2026-10",selectedScope);');assert.equal(b.run('first===second'),true);
 await Promise.resolve();assert.equal(b.calls().length,1);b.run('finish(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('first'),true);
 for(let i=0;i<3;i++)assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);assert.equal(b.calls().length,1);
 b.run('clock+=60000;customApi=async()=>{throw Error("PRIVATE_PROVIDER_TOKEN");};');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),false);assert.match(b.text('Status'),/evidências salvas e suas datas foram preservadas/);assert.doesNotMatch(b.text('Status'),/PRIVATE_PROVIDER_TOKEN/);assert.match(b.text('Runs'),/81,00/);
 assert.ok(b.calls().every(call=>call.body===undefined&&call.path==='finance/reconciliation?month=2026-10&evidence=review-v1'));assert.equal(b.run('typeof setTimeout'),'undefined');
});

test('a late response from another month cannot replace the selected period or refresh its source timestamps',async()=>{
 const b=browser();b.context.september=JSON.stringify(observation({month:'2026-09'}));b.run('brazaReconciliation.start({api});customApi=(path)=>path.includes("2026-10")?new Promise(resolve=>globalThis.finishOctober=resolve):JSON.parse(september);globalThis.october=brazaReconciliation.observe("2026-10",selectedScope);');await Promise.resolve();assert.equal(await b.run('brazaReconciliation.observe("2026-09",auditScope(JSON.parse(september)))'),true);const visible=b.text('Scope'),sources=b.text('Runs');
 b.run('finishOctober(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('october'),false);assert.equal(b.text('Scope'),visible);assert.equal(b.text('Runs'),sources);assert.match(visible,/01\/09\/2026 a 15\/09\/2026/);
});

test('hidden, stopped and malformed reads never issue or restore financial source work',async()=>{
 const b=browser();b.run('brazaReconciliation.start({api});document.hidden=true;');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),false);assert.equal(b.calls().length,0);
 b.run('document.hidden=false;customApi=()=>new Promise(resolve=>globalThis.finish=resolve);globalThis.waiting=brazaReconciliation.observe("2026-10",selectedScope);');await Promise.resolve();b.run('brazaReconciliation.stop();finish(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('waiting'),false);assert.equal(b.text('Runs'),'');
 b.run('brazaReconciliation.start({api});customApi=async()=>({...JSON.parse(JSON.stringify(current)),access_token:"PRIVATE"});');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),false);assert.doesNotMatch(b.text('Runs'),/PRIVATE/);assert.equal(b.calls().length,2);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
});

test('a partial set of monthly windows never exposes one window payout as the full month',async()=>{
 const value=observation();value.end_date='2026-10-25';value.status='PARTIAL';value.pending=['RECONCILIATION_PENDING'];value.sources.push({run_id:'22222222-2222-4222-8222-222222222222',source_revision:3,start_date:'2026-10-16',end_date:'2026-10-25'});assert.ok(projectBusinessReconciliation(value,projectReconciliationFrame));
 const b=browser(value);b.run('brazaReconciliation.start({api})');await b.run('brazaReconciliation.observe("2026-10",selectedScope)');assert.match(b.text('Status'),/1 de 2 intervalo/);assert.match(b.text('Metrics'),/ainda não representa todo o mês/);assert.match(b.text('Metrics'),/Repasse após ajustes informado\s+Não informado/);assert.match(b.text('Runs'),/15\/10\/2026.*81,00/);
});

test('an initial month without a publication shows a pending period and a failed refresh keeps original financial observations',async()=>{
 const empty={schema:'business_reconciliation_v1',month:'2026-10',start_date:'2026-10-01',end_date:null,checked_at:stamp,status:'COLLECTING',source_revision:null,sources:[],reports:[],attempts:[],pending:['PUBLICATION_REQUIRED']};assert.ok(projectBusinessReconciliation(empty,projectReconciliationFrame));
 const b=browser(empty);b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),false);assert.equal(b.run('control("Metrics").hidden'),true);assert.match(b.text('Status'),/Aguardando um resumo publicado/);assert.equal(b.text('Runs'),'');assert.equal(b.calls().length,0);
 const saved=observation();saved.checked_at=stamp+60;saved.attempts[0]={...saved.attempts[0],checked_at:stamp+60,status:'UNAVAILABLE',code:'FINANCE_RECONCILIATION_TIMEOUT',next_attempt_at:stamp+360};saved.pending=['SOURCE_UNAVAILABLE'];assert.ok(projectBusinessReconciliation(saved,projectReconciliationFrame));b.load(saved);b.run('clock+=60000;selectedScope=auditScope(current);');await b.run('brazaReconciliation.observe("2026-10",selectedScope)');assert.match(b.text('Notice'),/datas originais/);assert.match(b.text('Runs'),new RegExp(new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date((stamp-420)*1000)).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
});

test('a known return with no retained reference is displayed as pending rather than zero total returns',async()=>{
 const value=observation(),report=value.reports[0];value.status='PARTIAL';value.pending=['RECONCILIATION_PENDING'];report.status='PARTIAL';report.source_checked_at.returns_oldest_at=null;report.source_checked_at.returns_latest_at=null;report.returns={reference_count:0,checked_count:0,pending_count:0,known_requested_refund_cents:0,requested_amount_complete:true,permission:'UNKNOWN'};report.cases=[];report.truncation={truncated:false,cases_total:0,cases_included:0};report.pending=['RETURN_REFERENCES_MISSING','SETTLEMENT_NOT_RECONCILED'];assert.ok(projectBusinessReconciliation(value,projectReconciliationFrame));
 const b=browser(value);b.run('brazaReconciliation.start({api})');await b.run('brazaReconciliation.observe("2026-10",selectedScope)');assert.match(b.text('Metrics'),/Solicitações com detalhes consultados Referências pendentes/);assert.doesNotMatch(b.text('Metrics'),/0 de 0/);assert.match(b.text('Runs'),/ocorrências de devolução sem todas as referências/);
});

test('a new cohort in the same month invalidates the cache and ignores an older in-flight observation while unchanged cohorts retain the throttle',async()=>{
 const b=browser(),next=observation();next.source_revision=8;next.sources[0].source_revision=3;next.attempts[0].source_revision=3;next.reports[0].source_revision=3;next.reports[0].coverage.orders=3;next.reports[0].coverage.evidence_orders=3;next.reports[0].coverage.paid_orders=2;next.reports[0].adjustments={reported_orders:2,missing_orders:0,conflicting_orders:0,known_adjustment_cents:200,base_repass_cents:16000,after_adjustment_repass_cents:16200};assert.ok(projectBusinessReconciliation(next,projectReconciliationFrame));b.context.nextObservation=JSON.stringify(next);
 b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);assert.match(b.text('Metrics'),/2 de 2.*81,00/);
 for(let index=0;index<3;index++)assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);assert.equal(b.calls().length,1);
 b.run('clock+=60000;let refreshCount=0;customApi=()=>new Promise(resolve=>{if(++refreshCount===1)globalThis.finishOldCohort=resolve;else globalThis.finishNewCohort=resolve;});globalThis.oldRequest=brazaReconciliation.observe("2026-10",selectedScope);');await Promise.resolve();assert.equal(b.calls().length,2);
 b.run('globalThis.newRequest=brazaReconciliation.observe("2026-10",auditScope(JSON.parse(nextObservation)));globalThis.sameCohortRequest=brazaReconciliation.observe("2026-10",auditScope(JSON.parse(nextObservation)));');assert.equal(b.run('newRequest===sameCohortRequest'),true);assert.equal(b.text('Runs'),'','old same-month totals are hidden while the newly selected cohort is observed');await Promise.resolve();assert.equal(b.calls().length,3);
 b.run('finishNewCohort(JSON.parse(nextObservation));');assert.equal(await b.run('newRequest'),true);const metrics=b.text('Metrics'),scope=b.text('Scope');assert.match(metrics,/3 de 3.*162,00/);assert.match(scope,/Revisão 8/);
 b.run('finishOldCohort(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('oldRequest'),false);assert.equal(b.text('Metrics'),metrics);assert.equal(b.text('Scope'),scope);assert.equal(await b.run('brazaReconciliation.observe("2026-10",auditScope(JSON.parse(nextObservation)))'),true);assert.equal(b.calls().length,3);assert.ok(b.calls().every(call=>call.body===undefined&&call.path==='finance/reconciliation?month=2026-10&evidence=review-v1'));assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
});

test('a valid reconciliation from another publication or source cannot pass solely because its dates, counts and amounts match',async()=>{
 for(const change of ['publication','run','revision']){
  const expected=observation(),received=structuredClone(expected);
  if(change==='publication')received.source_revision++;
  if(change==='run')for(const item of [received.sources[0],received.reports[0],received.attempts[0]])item.run_id='44444444-4444-4444-8444-444444444444';
  if(change==='revision')for(const item of [received.sources[0],received.reports[0],received.attempts[0]])item.source_revision++;
  assert.ok(projectBusinessReconciliation(received,projectReconciliationFrame));
  const b=browser(expected);b.load(received);b.run('brazaReconciliation.start({api})');
  assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),false,change);assert.equal(b.text('Runs'),'');assert.equal(b.run('control("Metrics").hidden'),true);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');assert.equal(b.calls().length,1);
 }
});

test('an unpublished or malformed scope suspends reconciliation, invalidates in-flight work and resumes with the exact publication',async()=>{
 const b=browser();b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);assert.match(b.text('Metrics'),/81,00/);
 b.run('clock+=60000;customApi=()=>new Promise(resolve=>globalThis.finishPending=resolve);globalThis.waiting=brazaReconciliation.observe("2026-10",selectedScope);');await Promise.resolve();const requests=b.calls().length;
 assert.equal(await b.run('brazaReconciliation.observe("2026-10",null)'),false);assert.equal(b.text('Runs'),'');assert.equal(b.run('control("Metrics").hidden'),true);assert.match(b.text('Status'),/Aguardando um resumo publicado/);
 b.run('finishPending(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('waiting'),false);assert.equal(b.text('Runs'),'');
 for(const scope of ['undefined','{}','"cohort-1"','{...selectedScope,publication_revision:0}','{...selectedScope,private_token:"PRIVATE"}'])assert.equal(await b.run('brazaReconciliation.observe("2026-10",'+scope+')'),false);
 assert.equal(b.calls().length,requests);b.run('customApi=null;');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);assert.match(b.text('Metrics'),/81,00/);assert.equal(b.calls().length,requests+1);
});

test('hidden tabs invalidate replaced or suspended publications before an older response can finish',async()=>{
 for(const change of ['replacement','suspension']){
  const b=browser(),next=observation();next.source_revision++;
  b.context.nextObservation=JSON.stringify(next);b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);
  b.run('clock+=60000;customApi=()=>new Promise(resolve=>globalThis.finishOld=resolve);globalThis.waiting=brazaReconciliation.observe("2026-10",selectedScope);');await Promise.resolve();assert.equal(b.calls().length,2);
  b.run('document.hidden=true;');assert.equal(await b.run('brazaReconciliation.observe("2026-10",'+(change==='replacement'?'auditScope(JSON.parse(nextObservation))':'null')+')'),false);
  assert.equal(b.text('Runs'),'');assert.equal(b.run('control("Metrics").hidden'),true);assert.equal(b.calls().length,2);
  b.run('finishOld(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('waiting'),false,change);assert.equal(b.text('Runs'),'');
  b.run('document.hidden=false;customApi=null;'+(change==='replacement'?'current=JSON.parse(nextObservation);selectedScope=auditScope(current);':''));
  assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);assert.match(b.text('Metrics'),/81,00/);assert.equal(b.calls().length,3);
 }
});

test('review evidence distinguishes two excluded TO_RETURN orders from four paid orders with returns and groups their cases',async()=>{
 const value=reviewObservation(),b=browser(value);b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);
 assert.match(b.text('Metrics'),/Pedidos em revisão 2/);assert.match(b.text('Metrics'),/Pedidos pagos com devolução identificada 4/);assert.match(b.text('Metrics'),/6 de 6/);
 assert.match(b.text('Runs'),/2 pedido\(s\) fora dos valores dos pedidos pagos.*4 pedido\(s\) pagos com devolução/);assert.match(b.text('Runs'),/2 em devolução/);assert.match(b.text('Runs'),/Devolução em andamento.*situação observada.*Referências consultadas/);
 assert.match(b.text('Runs'),/Solicitações do pedido interno/);assert.match(b.text('Runs'),/Ver solicitações deste pedido/);assert.match(b.text('Runs'),/referências abaixo são internas.*não são os números dos pedidos na Shopee/);assert.match(b.text('Runs'),/reembolso efetivo continua sem conciliação/);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
 assert.deepEqual(b.calls(),[{path:'finance/reconciliation?month=2026-10&evidence=review-v1'}]);assert.equal(b.run('control("Details").open'),false);
 const calls=b.calls().length;assert.equal(b.run('brazaReconciliation.open()'),true);assert.equal(b.run('control("Details").open'),true);assert.equal(b.run('control("Details").scrolled'),true);assert.equal(b.run('control("Summary").focused'),true);assert.equal(b.calls().length,calls,'opening the saved queue does not query a source or the App');
});

test('legacy reports and evidence envelopes without sidecars preserve counts and explicitly report unavailable individual detail',async()=>{
 for(const value of [observation(),{schema:'business_reconciliation_v2',report:observation(),reviews:[]}]){
  const b=browser(value);b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);assert.match(b.text('Runs'),/detalhe individual ainda não está disponível.*total em revisão continua preservado/);assert.match(b.text('Metrics'),/Pedidos em revisão 1/);assert.doesNotMatch(b.text('Runs'),/Devolução em andamento|Cancelamento em andamento/);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
 }
});

test('missing references, source denial and cached-reference failures retain unknowns and separate their original timestamps',async()=>{
 const value=reviewObservation(),report=value.report.reports[0],orders=value.reviews[0].review.orders;
 report.status='BLOCKED';value.report.status='PARTIAL';value.report.pending=['RECONCILIATION_PENDING'];report.pending.push('RETURN_REFERENCES_MISSING','RETURN_PERMISSION_REQUIRED');
 report.cases.pop();Object.assign(report.returns,{reference_count:5,checked_count:5,known_requested_refund_cents:5000,permission:'DENIED'});report.truncation={truncated:false,cases_total:5,cases_included:5};
 Object.assign(orders[0],{reference_diagnostic:'TIMEOUT',next_attempt_at:stamp+300});Object.assign(orders[1],{reference_state:'RETRY_WAIT',reference_count:null,references_checked_at:null,reference_diagnostic:'PERMISSION_DENIED',next_attempt_at:stamp+600,checked_cases:null,pending_cases:null});
 assert.ok(projectBusinessReconciliationEvidence(value,validators));const b=browser(value);b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);
 const text=b.text('Runs');assert.match(text,/referências anteriores foram preservadas/);assert.match(text,/não recebeu permissão/);assert.match(text,/consulta das referências precisa ser repetida/);assert.match(text,/Nova consulta permitida a partir de/);assert.match(text,/Obter as referências.*antes de conferir os valores/);assert.match(text,/Shopee não liberou os detalhes de devoluções/);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
 for(const at of [stamp-400,stamp-300])assert.ok(text.includes(new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(at*1000))));
});

test('unrecognized situations, empty references and truncation do not imply resolved orders or a complete displayed list',async()=>{
 const value=reviewObservation(),report=value.report.reports[0],review=value.reviews[0].review;
 report.coverage={...report.coverage,orders:45,evidence_orders:45,review_orders:41};report.cases=report.cases.slice(0,4);Object.assign(report.returns,{reference_count:4,checked_count:4,known_requested_refund_cents:4000});report.truncation={truncated:false,cases_total:4,cases_included:4};
 review.summary={orders:41,in_cancel:1,to_return:1,other:1,unknown:38};review.orders=Array.from({length:40},(_,index)=>({order_hash:internalHash(index+100),status:index===0?'IN_CANCEL':index===1?'TO_RETURN':index===2?'OTHER_STATUS':'UNKNOWN_STATUS',source_checked_at:stamp-400,reference_state:index===1?'KNOWN_EMPTY':'NOT_APPLICABLE',reference_count:index===1?0:null,references_checked_at:index===1?stamp-300:null,reference_diagnostic:null,next_attempt_at:null,checked_cases:index===1?0:null,pending_cases:index===1?0:null}));review.truncation={truncated:true,orders_total:41,orders_included:40};
 assert.ok(projectBusinessReconciliationEvidence(value,validators));const b=browser(value);b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);const text=b.text('Runs');
 assert.match(text,/Cancelamento em andamento/);assert.match(text,/Situação não identificada/);assert.match(text,/Outro estado em revisão/);assert.match(text,/Nenhuma referência.*não confirma o encerramento/);assert.match(text,/40 de 41 pedidos em revisão exibidos/);assert.match(b.text('Metrics'),/Pedidos em revisão 41/);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
});

test('sidecars from a different source or malformed private fields cannot overwrite a verified queue',async()=>{
 const value=reviewObservation(),b=browser(value);b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);const text=b.text('Runs');
 for(const mutate of [v=>{v.reviews[0].source_revision++;},v=>{v.reviews[0].review.orders[0].order_sn='PRIVATE_SERIAL';},v=>{v.reviews[0].review.orders[0].reference_count++;}]){
  const malformed=structuredClone(value);mutate(malformed);b.load(malformed);b.run('clock+=60000;');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),false);assert.equal(b.text('Runs'),text);assert.doesNotMatch(b.text('Runs'),/PRIVATE_SERIAL/);
 }
});
