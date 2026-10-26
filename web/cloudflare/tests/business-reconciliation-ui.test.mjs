import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {BUSINESS_RECONCILIATION_CLIENT,BUSINESS_RECONCILIATION_CSS,businessReconciliationBody} from '../src/business-reconciliation-view.mjs';
import {projectBusinessReconciliation,projectBusinessReconciliationEvidence,projectBusinessReconciliationMoney} from '../src/business-reconciliation.mjs';
import {projectReconciliationFrame,projectReconciliationEvidenceFrame,projectReconciliationMoneyFrame} from '../../finance/src/reconciliation-frame.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';

const clock=Date.UTC(2026,9,25,15),stamp=clock/1000,uuid='11111111-1111-4111-8111-111111111111';
function observation({month='2026-10',denied=false,missing=false}={}){
 const at=stamp-120,start=month+'-01',end=month+'-15';
 const report={schema:'finance_reconciliation_v1',run_id:uuid,source_revision:2,start_date:start,end_date:end,checked_at:at,status:denied?'BLOCKED':missing?'PARTIAL':'CHECKED',source_checked_at:{finance_oldest_at:at-300,finance_latest_at:at-200,returns_oldest_at:denied?null:at-150,returns_latest_at:denied?null:at-150},coverage:{orders:2,evidence_orders:missing?1:2,missing_evidence_orders:missing?1:0,paid_orders:1,review_orders:1,return_orders:1,return_unknown_orders:0},adjustments:{reported_orders:missing?0:1,missing_orders:missing?1:0,conflicting_orders:0,known_adjustment_cents:missing?0:100,base_repass_cents:8000,after_adjustment_repass_cents:missing?null:8100},returns:{reference_count:1,checked_count:denied?0:1,pending_count:denied?1:0,known_requested_refund_cents:denied?0:1000,requested_amount_complete:!denied,permission:denied?'DENIED':'AVAILABLE'},cases:[{case_hash:'a'.repeat(64),order_hash:'b'.repeat(64),status:denied?'PENDING':'CANCELLED',requested_refund_cents:denied?null:1000,checked_at:denied?null:at-150,diagnostic:denied?'PERMISSION_DENIED':null}],truncation:{truncated:false,cases_total:1,cases_included:1},pending:['RETURN_VALUES_UNVERIFIED','SETTLEMENT_NOT_RECONCILED',...(denied?['RETURN_DETAILS_PENDING','RETURN_PERMISSION_REQUIRED']:[]),...(missing?['ORDER_EVIDENCE_MISSING','ADJUSTMENT_FIELDS_UNAVAILABLE']:[])],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};
 const value={schema:'business_reconciliation_v1',month,start_date:start,end_date:end,checked_at:stamp,status:denied||missing?'PARTIAL':'CHECKED',source_revision:7,sources:[{run_id:uuid,source_revision:2,start_date:start,end_date:end}],reports:[report],attempts:[{run_id:uuid,source_revision:2,checked_at:stamp-100,status:'SUCCESS',code:null,next_attempt_at:stamp+600}],pending:denied||missing?['RECONCILIATION_PENDING']:[]};
 assert.ok(projectReconciliationFrame(report));assert.ok(projectBusinessReconciliation(value,projectReconciliationFrame));return value;
}
function auditScope(value){value=['business_reconciliation_v2','business_reconciliation_v3'].includes(value.schema)?value.report:value;return value.sources.length?{publication_revision:value.source_revision,start_date:value.start_date,end_date:value.end_date,sources:value.sources.map(({run_id,source_revision,start_date,end_date})=>({run_id,source_revision,start_date,end_date}))}:null;}
const validators={projectBusiness:projectBusinessReconciliation,projectFrame:projectReconciliationFrame,projectEvidenceFrame:projectReconciliationEvidenceFrame};
const moneyValidators={...validators,projectMoneyFrame:projectReconciliationMoneyFrame};
const moneyStatuses=['PENDING','UNKNOWN','REQUESTED','ACCEPTED','CANCELLED','JUDGING','REFUND_PAID','CLOSED','PROCESSING'];
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
function moneyObservation(){
 const old=reviewObservation(),report=old.report.reports[0],statuses=['ACCEPTED','REFUND_PAID','CANCELLED','CLOSED','ACCEPTED','UNKNOWN'],amounts=[1000,2000,3000,0,4000,null];
 report.status='PARTIAL';old.report.status='PARTIAL';old.report.pending=['RECONCILIATION_PENDING'];report.pending.push('RETURN_STATUS_UNRECOGNIZED');
 report.cases.forEach((row,index)=>Object.assign(row,{status:statuses[index],requested_refund_cents:amounts[index],diagnostic:statuses[index]==='UNKNOWN'?'UNKNOWN_STATUS':null}));report.returns.known_requested_refund_cents=10000;report.returns.requested_amount_complete=false;
 const groups=['PAID','REVIEW','OTHER'].map(cohort=>{const cases=cohort==='PAID'?report.cases.slice(0,4):cohort==='REVIEW'?report.cases.slice(4):[];return {cohort,statuses:moneyStatuses.map(status=>{const rows=cases.filter(row=>row.status===status),known=rows.filter(row=>row.requested_refund_cents!==null);return {status,cases:rows.length,amount_known:known.length,known_amount_cents:known.reduce((sum,row)=>sum+row.requested_refund_cents,0)};}),source_checked_at:{oldest_at:cases.length?stamp-270:null,latest_at:cases.length?stamp-270:null}};});
 const payouts=report.cases.map((row,index)=>({order_hash:row.order_hash,cohort:index<4?'PAID':'REVIEW',source_checked_at:stamp-400,reference_count:1,state:index<4?'AVAILABLE':'NOT_IN_PAID_COHORT',base_repass_cents:index<4?8000:null,adjustment_cents:index<4?100:null,after_adjustment_repass_cents:index<4?8100:null}));
 const money={schema:'finance_reconciliation_money_v1',currency:'BRL',groups,payouts,truncation:{truncated:false,payouts_total:6,payouts_included:6},basis:'SAVED_RETURN_AMOUNTS_AND_PAID_PAYOUT_AFTER_ADJUSTMENTS'},value={schema:'business_reconciliation_v3',report:old.report,reviews:old.reviews,money:[{run_id:report.run_id,source_revision:report.source_revision,money}]};
 assert.ok(projectBusinessReconciliationMoney(value,moneyValidators));return value;
}
function monthlyObservation(value=moneyObservation()){
 const report=value.report.reports[0],selection={start_date:report.start_date,end_date:report.end_date},daily=Array.from({length:Number(report.end_date.slice(8))},(_,index)=>({date:report.start_date.slice(0,8)+String(index+1).padStart(2,'0'),expense:index===0?'10':'0',broad_gmv:index===0?'200':'0',broad_order:index===0?5:0,broad_roas:20,direct_gmv:0,direct_order:0,direct_roas:0}));
 const ads=buildAdsCalendar([buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:selection,balance:0,daily},selection,stamp-60)],selection,stamp-60);
 const c=report.coverage,frame={schema:'business_month_v1',month:value.report.month,start_date:report.start_date,end_date:report.end_date,status:'COMPLETE',checked_at:stamp,progress:{windows_total:1,windows_complete:1,pages_read:Math.ceil(c.orders/5)},coverage:{orders:c.orders,paid:c.paid_orders,completed:c.paid_orders,ongoing:0,cancelled:c.orders-c.paid_orders-c.review_orders,cancel_pending:0,unpaid:0,other:c.review_orders,unknown:0,payment_covered:c.paid_orders,payment_missing:0,returns:c.return_orders,returns_unknown:c.return_unknown_orders},sales_cents:40000,known_sales_cents:40000,expected_repass_cents:report.adjustments.base_repass_cents,known_expected_repass_cents:report.adjustments.base_repass_cents,production_cost_cents:4000,known_production_cost_cents:4000,invoice_tax_cents:800,known_invoice_tax_cents:800,ads_adjustment_cents:0,ads,expenses:{revision:1,external_expenses_cents:500,recharge_treatment:'UNCONFIRMED',updated_at:new Date(clock).toISOString()},result:{net_estimate_cents:null,net_profit_cents:null,net_margin_bps:null,pending:['STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED'],basis:'PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE'},unmapped_variants:[],bindings_revision:2,costs_revision:3,source_checked_at:{finance_oldest_at:report.source_checked_at.finance_oldest_at,finance_latest_at:report.source_checked_at.finance_latest_at,ads_at:ads.fetched_at}};
 assert.ok(projectBusinessMonth(frame));return frame;
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
 assert.match(b.text('Runs'),/Solicitação cancelada.*não é uma despesa confirmada.*Valor de reembolso informado:.*10,00/);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
 assert.equal(b.text('Badge'),'Evidências disponíveis');assert.match(body,/não comprovam pagamento ou recebimento no banco/);assert.deepEqual(b.calls(),[{path:'finance/reconciliation?month=2026-10&evidence=refunds-v1'}]);
});

test('absent adjusted payout and denied return permission stay unavailable rather than becoming zero or a new deduction',async()=>{
 const b=browser(observation({denied:true,missing:true}));b.run('brazaReconciliation.start({api})');await b.run('brazaReconciliation.observe("2026-10",selectedScope)');
 assert.match(b.text('Metrics'),/Repasse após ajustes informado\s+Não informado/);assert.match(b.text('Runs'),/Ajustes nos pedidos com valores compatíveis: Não informado/);
 assert.match(b.text('Runs'),/Shopee não liberou os detalhes de devoluções.*repasse e anúncios continuam disponíveis/);assert.match(b.text('Runs'),/Valor de reembolso informado: Não informado/);assert.doesNotMatch(b.text('Runs'),/Valor de reembolso informado:.*0,00/);
 assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');assert.equal(b.calls().length,1);assert.equal(b.run('control("Metrics").hidden'),false);
});

test('same-month observations coalesce and are throttled without an independent timer or any provider fallback',async()=>{
 const b=browser();b.run('brazaReconciliation.start({api});customApi=()=>new Promise(resolve=>globalThis.finish=resolve);globalThis.first=brazaReconciliation.observe("2026-10",selectedScope);globalThis.second=brazaReconciliation.observe("2026-10",selectedScope);');assert.equal(b.run('first===second'),true);
 await Promise.resolve();assert.equal(b.calls().length,1);b.run('finish(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('first'),true);
 for(let i=0;i<3;i++)assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);assert.equal(b.calls().length,1);
 b.run('clock+=60000;customApi=async()=>{throw Error("PRIVATE_PROVIDER_TOKEN");};');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),false);assert.match(b.text('Status'),/evidências salvas e suas datas foram preservadas/);assert.doesNotMatch(b.text('Status'),/PRIVATE_PROVIDER_TOKEN/);assert.match(b.text('Runs'),/81,00/);
 assert.ok(b.calls().every(call=>call.body===undefined&&call.path==='finance/reconciliation?month=2026-10&evidence=refunds-v1'));assert.equal(b.run('typeof setTimeout'),'undefined');
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
 b.run('finishOldCohort(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('oldRequest'),false);assert.equal(b.text('Metrics'),metrics);assert.equal(b.text('Scope'),scope);assert.equal(await b.run('brazaReconciliation.observe("2026-10",auditScope(JSON.parse(nextObservation)))'),true);assert.equal(b.calls().length,3);assert.ok(b.calls().every(call=>call.body===undefined&&call.path==='finance/reconciliation?month=2026-10&evidence=refunds-v1'));assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
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
 assert.deepEqual(b.calls(),[{path:'finance/reconciliation?month=2026-10&evidence=refunds-v1'}]);assert.equal(b.run('control("Details").open'),false);
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

test('refund amounts remain separated by situation and cohort while the adjusted balance uses the provided payout only once',async()=>{
 const value=moneyObservation(),b=browser(value);b.context.monthly=JSON.stringify(monthlyObservation(value));b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope,JSON.parse(monthly))'),true);
 const groups=JSON.parse(b.run('JSON.stringify(control("Money").children[0].children.filter(node=>node.tag==="section").map(text))'));
 assert.match(groups[0],/Pedidos pagos.*Solicitações aceitas.*10,00.*Status de reembolso pago informado.*20,00/);assert.doesNotMatch(groups[0],/40,00/);
 assert.match(groups[1],/Pedidos em revisão.*fora dos valores pagos.*Solicitações aceitas.*40,00/);assert.match(groups[1],/Situação não reconhecida.*Não informado.*0 de 1 com valor informado/);
 assert.match(groups[0],/Solicitação cancelada.*despesa confirmada.*30,00/);assert.match(groups[0],/Solicitação encerrada.*não define sozinho.*0,00.*1 de 1 com valor informado/);
 assert.doesNotMatch(b.text('Money')+' '+b.text('Runs'),/Pagamento do reembolso ainda não confirmado|Pagamento ainda não confirmado|lucro realizado:/);
 assert.match(b.text('Runs'),/Repasse base informado:.*80,00.*Ajuste com sinal: \+.*1,00.*Repasse após ajustes informado:.*81,00/);assert.match(b.text('Runs'),/Pedido fora dos valores pagos.*repasse deste pedido não está disponível/);
 assert.match(b.text('AdjustedBalance'),/Saldo após ajustes informados.*261,00.*Saldo provisório/);assert.match(b.text('AdjustedBalance'),/Repasse após ajustes informado.*324,00.*Custos após o repasse.*63,00/);assert.match(b.text('AdjustedBalance'),/Ajuste com sinal aplicado ao repasse: \+.*4,00/);assert.match(b.text('AdjustedBalance'),/Valor ainda a liberar: indisponível/);assert.doesNotMatch(b.text('AdjustedBalance'),/161,00/);
 assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');assert.deepEqual(b.calls(),[{path:'finance/reconciliation?month=2026-10&evidence=refunds-v1'}]);assert.equal(b.run('typeof setTimeout'),'undefined');
 const calls=b.calls().length;b.run('brazaReconciliation.open()');assert.equal(b.calls().length,calls);
});

test('known state totals remain complete beyond the visible case limit without summing the forty displayed rows',async()=>{
 const value=moneyObservation(),report=value.report.reports[0],money=value.money[0].money;
 const extra=Array.from({length:40},(_,index)=>({case_hash:internalHash(index+100),order_hash:internalHash(1),status:'REFUND_PAID',requested_refund_cents:100,checked_at:stamp-270,diagnostic:null}));
 report.cases=[...report.cases,...extra].slice(0,40);Object.assign(report.returns,{reference_count:46,checked_count:46,known_requested_refund_cents:14000});report.truncation={truncated:true,cases_total:46,cases_included:40};
 Object.assign(money.groups[0].statuses.find(row=>row.status==='REFUND_PAID'),{cases:41,amount_known:41,known_amount_cents:6000});money.payouts[0].reference_count=41;assert.ok(projectBusinessReconciliationMoney(value,moneyValidators));
 const b=browser(value);b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);assert.match(b.text('Money'),/Status de reembolso pago informado.*41.*60,00.*41 de 41 com valor informado/);assert.match(b.text('Money'),/mesmo quando a lista de pedidos é limitada/);assert.match(b.text('Runs'),/40 de 46 solicitações exibidas/);assert.equal(b.calls().length,1);
});

test('denied or missing amounts and conflicting payouts stay unavailable while explicit zero stays visible',async()=>{
 const value=moneyObservation(),report=value.report.reports[0],money=value.money[0].money;
 report.status='BLOCKED';report.returns.permission='DENIED';report.returns.checked_count=5;report.returns.pending_count=1;report.returns.known_requested_refund_cents=9000;report.pending.push('RETURN_DETAILS_PENDING','RETURN_PERMISSION_REQUIRED','ADJUSTMENT_CONFLICT');
 Object.assign(report.cases[0],{status:'PENDING',requested_refund_cents:null,checked_at:null,diagnostic:'PERMISSION_DENIED'});Object.assign(money.groups[0].statuses.find(row=>row.status==='ACCEPTED'),{cases:0,amount_known:0,known_amount_cents:0});money.groups[0].statuses.find(row=>row.status==='PENDING').cases=1;
 Object.assign(report.adjustments,{reported_orders:3,conflicting_orders:1,known_adjustment_cents:300,after_adjustment_repass_cents:null});Object.assign(money.payouts[0],{state:'CONFLICT',adjustment_cents:null,after_adjustment_repass_cents:null});assert.ok(projectBusinessReconciliationMoney(value,moneyValidators));
 const b=browser(value);b.context.monthly=JSON.stringify(monthlyObservation(value));b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope,JSON.parse(monthly))'),true);
 assert.match(b.text('Money'),/Detalhes pendentes.*Não informado.*0 de 1 com valor informado/);assert.match(b.text('Money'),/Solicitação encerrada.*0,00/);assert.match(b.text('Runs'),/valores informados não são compatíveis/);assert.match(b.text('Runs'),/Shopee não liberou os detalhes de devoluções/);assert.match(b.text('AdjustedBalance'),/Em conferência.*repasses ou ajustes sem valores compatíveis/);assert.doesNotMatch(b.text('AdjustedBalance'),/Saldo provisório|0,00/);
});

test('legacy or mixed evidence keeps refund aggregates unavailable and never fabricates them from visible cases',async()=>{
 for(const value of [observation(),reviewObservation(),{...moneyObservation(),money:[]}]){
  const b=browser(value);b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);assert.match(b.text('Money'),/valores por situação ainda não estão disponíveis/);assert.doesNotMatch(b.text('Money'),/Solicitações aceitas|Status de reembolso pago informado/);assert.equal(b.calls().length,1);assert.match(b.text('Runs'),/Valor de reembolso informado/);
 }
 const value=moneyObservation();value.report.end_date='2026-10-25';value.report.sources.push({run_id:'22222222-2222-4222-8222-222222222222',source_revision:3,start_date:'2026-10-16',end_date:'2026-10-25'});assert.ok(projectBusinessReconciliationMoney(value,moneyValidators));const b=browser(value);b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);assert.match(b.text('Money'),/1 de 2 intervalo.*somente os intervalos com este detalhe disponível/);assert.match(b.text('Metrics'),/Repasse após ajustes informado Não informado/);
});

test('same-publication cost changes recalculate the adjusted balance locally and a pending response uses the latest costs',async()=>{
 const value=moneyObservation(),b=browser(value);b.context.monthly=JSON.stringify(monthlyObservation(value));b.run('let currentMonthly=JSON.parse(monthly);brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope,currentMonthly)'),true);assert.match(b.text('AdjustedBalance'),/261,00/);
 b.run('currentMonthly.expenses.external_expenses_cents=1500;currentMonthly.expenses.revision++;');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope,currentMonthly)'),true);assert.match(b.text('AdjustedBalance'),/251,00/);assert.equal(b.calls().length,1);
 b.run('clock+=60000;customApi=()=>new Promise(resolve=>globalThis.finish=resolve);globalThis.waiting=brazaReconciliation.observe("2026-10",selectedScope,currentMonthly);');await Promise.resolve();assert.equal(b.calls().length,2);
 b.run('currentMonthly.expenses.external_expenses_cents=2500;currentMonthly.expenses.revision++;globalThis.updated=brazaReconciliation.observe("2026-10",selectedScope,currentMonthly);');assert.equal(b.run('waiting===updated'),true);assert.match(b.text('AdjustedBalance'),/241,00/);assert.equal(b.calls().length,2);
 b.run('finish(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('waiting'),true);assert.match(b.text('AdjustedBalance'),/241,00/);assert.doesNotMatch(b.text('AdjustedBalance'),/261,00|251,00/);
 b.run('currentMonthly.source_checked_at.finance_latest_at--;');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope,currentMonthly)'),true);assert.match(b.text('AdjustedBalance'),/Em conferência.*mesmos pedidos e à mesma publicação/);assert.doesNotMatch(b.text('AdjustedBalance'),/241,00/);assert.equal(b.calls().length,2);
});

test('negative signed adjustments and incomplete production remain provisional without changing the strict monthly result',async()=>{
 const value=moneyObservation(),report=value.report.reports[0];report.adjustments.known_adjustment_cents=-400;report.adjustments.after_adjustment_repass_cents=31600;value.money[0].money.payouts.filter(row=>row.cohort==='PAID').forEach(row=>Object.assign(row,{adjustment_cents:-100,after_adjustment_repass_cents:7900}));assert.ok(projectBusinessReconciliationMoney(value,moneyValidators));
 const monthly=monthlyObservation(value);monthly.production_cost_cents=null;monthly.known_production_cost_cents=3000;monthly.unmapped_variants=[{item_id:'200',model_id:'300',quantity:1}];monthly.result.pending.push('PRODUCTION_COST_INCOMPLETE');assert.ok(projectBusinessMonth(monthly));
 const b=browser(value);b.context.monthly=JSON.stringify(monthly);b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope,JSON.parse(monthly))'),true);assert.match(b.text('AdjustedBalance'),/263,00.*custos de produção já identificados.*produtos sem custo completo/);assert.match(b.text('AdjustedBalance'),/Ajuste com sinal aplicado ao repasse: -.*4,00/);assert.match(b.text('Runs'),/Ajuste com sinal: -.*1,00.*Repasse após ajustes informado:.*79,00/);assert.equal(monthly.result.net_estimate_cents,null);assert.equal(b.run('financialNet.textContent'),'R$ 2.250,13');
});

test('a money sidecar from another source or an inconsistent total cannot replace verified amounts',async()=>{
 const value=moneyObservation(),b=browser(value);b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);const shown=b.text('Money'),details=b.text('Runs');
 for(const mutate of [v=>v.money[0].source_revision++,v=>v.money[0].money.groups[0].statuses.find(row=>row.status==='ACCEPTED').known_amount_cents++,v=>{v.money[0].money.payouts[0].order_sn='PRIVATE_ORDER';}]){
  const malformed=structuredClone(value);mutate(malformed);b.load(malformed);b.run('clock+=60000');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),false);assert.equal(b.text('Money'),shown);assert.equal(b.text('Runs'),details);assert.doesNotMatch(b.text('Runs'),/PRIVATE_ORDER/);
 }
});

test('affected orders without a visible case still display their saved payout evidence and reference uncertainty',async()=>{
 const value=moneyObservation(),report=value.report.reports[0],money=value.money[0].money,review=value.reviews[0].review;
 report.cases.splice(4,1);Object.assign(report.returns,{reference_count:5,checked_count:5,known_requested_refund_cents:6000});report.truncation={truncated:false,cases_total:5,cases_included:5};Object.assign(review.orders[0],{reference_state:'KNOWN_EMPTY',reference_count:0,checked_cases:0});money.payouts[4].reference_count=0;Object.assign(money.groups[1].statuses.find(row=>row.status==='ACCEPTED'),{cases:0,amount_known:0,known_amount_cents:0});assert.ok(projectBusinessReconciliationMoney(value,moneyValidators));
 const b=browser(value);b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope)'),true);
 const detail=b.run('control("Runs").children[0].children.find(node=>node.id?.endsWith("'+internalHash(5)+'"))');assert.ok(detail);assert.match(b.run('text(control("Runs").children[0].children.find(node=>node.id?.endsWith("'+internalHash(5)+'")))'),/Pedido interno.*Pedido fora dos valores pagos.*repasse deste pedido não está disponível.*Nenhuma solicitação identificada.*não confirma o encerramento/);assert.equal(b.calls().length,1);
});

test('a replaced publication clears money and balance together and a late response cannot restore either',async()=>{
 const value=moneyObservation(),next=moneyObservation();next.report.source_revision++;for(const row of [next.report.sources[0],next.report.reports[0],next.report.attempts[0],next.reviews[0],next.money[0]])row.source_revision++;
 next.report.reports[0].cases[0].requested_refund_cents=1500;next.report.reports[0].returns.known_requested_refund_cents+=500;next.money[0].money.groups[0].statuses.find(row=>row.status==='ACCEPTED').known_amount_cents=1500;assert.ok(projectBusinessReconciliationMoney(next,moneyValidators));
 const monthly=monthlyObservation(value),nextMonthly=monthlyObservation(next);nextMonthly.expenses.external_expenses_cents=1500;assert.ok(projectBusinessMonth(nextMonthly));
 const b=browser(value);Object.assign(b.context,{monthly:JSON.stringify(monthly),nextMonthly:JSON.stringify(nextMonthly),nextObservation:JSON.stringify(next)});b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope,JSON.parse(monthly))'),true);
 b.run('clock+=60000;let attempts=0;customApi=()=>new Promise(resolve=>{if(++attempts===1)globalThis.finishOld=resolve;else globalThis.finishNew=resolve;});globalThis.oldRequest=brazaReconciliation.observe("2026-10",selectedScope,JSON.parse(monthly));');await Promise.resolve();
 b.run('globalThis.newRequest=brazaReconciliation.observe("2026-10",auditScope(JSON.parse(nextObservation)),JSON.parse(nextMonthly));');assert.equal(b.text('Money'),'');assert.equal(b.text('AdjustedBalance'),'');await Promise.resolve();assert.equal(b.calls().length,3);
 b.run('finishNew(JSON.parse(nextObservation));');assert.equal(await b.run('newRequest'),true);const money=b.text('Money'),balance=b.text('AdjustedBalance');assert.match(money,/Solicitações aceitas.*15,00/);assert.match(balance,/251,00/);
 b.run('finishOld(JSON.parse(JSON.stringify(current)));');assert.equal(await b.run('oldRequest'),false);assert.equal(b.text('Money'),money);assert.equal(b.text('AdjustedBalance'),balance);assert.equal(await b.run('brazaReconciliation.observe("2026-10",null,null)'),false);assert.equal(b.text('Money'),'');assert.equal(b.text('AdjustedBalance'),'');assert.equal(b.calls().length,3);
});

test('dated financial evidence stays visible with its stale-source warning in the adjusted balance',async()=>{
 const value=moneyObservation(),monthly=monthlyObservation(value);monthly.checked_at+=600;monthly.result.pending.push('FINANCIAL_SOURCE_STALE');assert.ok(projectBusinessMonth(monthly));const b=browser(value);b.context.monthly=JSON.stringify(monthly);b.run('brazaReconciliation.start({api})');assert.equal(await b.run('brazaReconciliation.observe("2026-10",selectedScope,JSON.parse(monthly))'),true);
 assert.match(b.text('AdjustedBalance'),/261,00.*Financeiro consultado de.*anúncios em.*leitura financeira precisa ser atualizada.*valores e as datas salvos/);assert.equal(b.calls().length,1);assert.equal(monthly.result.net_estimate_cents,null);
});
