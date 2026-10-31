import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {collectionFixture} from './business-collection-fixture.mjs';
import {readCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {projectBusinessReconciliation} from '../src/business-reconciliation.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';
import {buildBusinessFinancialCloseout,projectBusinessFinancialCloseout} from '../src/business-financial-closeout.mjs';
import {FINANCIAL_CLOSEOUT_CLIENT,FINANCIAL_CLOSEOUT_CSS,financialCloseoutBody} from '../src/financial-closeout-view.mjs';

async function fixture(t){
 const f=await collectionFixture({returns:true,allPaid:true,windowCounts:[3,1],paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let monthly=await f.invoke('start');while(monthly.status==='RUNNING')monthly=await f.invoke('step');monthly=await f.invoke('ads');assert.equal(monthly.status,'COMPLETE');
 const published=await readCompletedBusinessMonth(f.env,'2026-10',{now:f.now}),stamp=f.now()/1000;
 const sources=published.payload.slots.map(slot=>({run_id:slot.frame.run_id,source_revision:slot.frame.revision,start_date:slot.start_date,end_date:slot.end_date}));
 const reports=published.payload.slots.map((slot,index)=>{
  const c=slot.frame.coverage,base=Math.round(Number(slot.frame.known_expected_repass_raw)*100),delta=index===0?-1000:100;
  const cases=index===0?[{case_hash:'1'.repeat(64),order_hash:'a'.repeat(64),status:'ACCEPTED',requested_refund_cents:1000,checked_at:stamp,diagnostic:null}]:[];
  return {schema:'finance_reconciliation_v1',...sources[index],checked_at:stamp,status:'CHECKED',source_checked_at:{finance_oldest_at:slot.frame.source_checked_at.oldest_at,finance_latest_at:slot.frame.source_checked_at.latest_at,returns_oldest_at:cases.length?stamp:null,returns_latest_at:cases.length?stamp:null},coverage:{orders:c.orders,evidence_orders:c.orders,missing_evidence_orders:0,paid_orders:c.paid,review_orders:0,return_orders:c.returns,return_unknown_orders:c.returns_unknown},adjustments:{reported_orders:c.paid,missing_orders:0,conflicting_orders:0,known_adjustment_cents:delta,base_repass_cents:base,after_adjustment_repass_cents:base+delta},returns:{reference_count:cases.length,checked_count:cases.length,pending_count:0,known_requested_refund_cents:index===0?1000:0,requested_amount_complete:true,permission:cases.length?'AVAILABLE':'UNKNOWN'},cases,truncation:{truncated:false,cases_total:cases.length,cases_included:cases.length},pending:[...(cases.length?['RETURN_VALUES_UNVERIFIED']:[]),'SETTLEMENT_NOT_RECONCILED'],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};
 });
 const reconciliation={schema:'business_reconciliation_v1',month:'2026-10',start_date:monthly.start_date,end_date:monthly.end_date,checked_at:stamp,status:'CHECKED',source_revision:published.publication.source_revision,sources,reports,attempts:[],pending:[]};
 const audit_scope={publication_revision:reconciliation.source_revision,start_date:reconciliation.start_date,end_date:reconciliation.end_date,sources};
 assert.ok(projectBusinessReconciliation(reconciliation,projectReconciliationFrame));
 const input={monthly,reconciliation,audit_scope,income_overview:null,income_detail:null};
 return {...f,input,calculate:(value=input)=>buildBusinessFinancialCloseout(value,{now:f.now})};
}

function pendingInput(base,stamp){
 const input=structuredClone(base);
 input.income_overview={schema:'business_income_overview_v1',checked_at:stamp,status:'AVAILABLE',attempt:null,report:{schema:'finance_income_overview_v1',checked_at:stamp,region:'BRAZIL',shop_type:'LOCAL',currency_basis:'FIXED_BRAZIL_SHOP_PROFILE',pending:{status:'PENDING',raw:'123.45',cents:12345},released:{status:'RELEASED',raw:'0.00',cents:0},to_release:{status:'TO_RELEASE_NOT_APPLICABLE_LOCAL',raw:null,cents:null},basis:'CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'}};
 input.income_detail={schema:'business_income_detail_v1',checked_at:stamp,status:'UNAVAILABLE',report:null,attempt:{checked_at:stamp,status:'UNAVAILABLE',code:'FINANCE_INCOME_DETAIL_HTTP_ERROR',next_attempt_at:stamp+300}};
 input.income_detail_diagnostic={schema:'business_income_detail_diagnostic_v1',checked_at:stamp,attempt_checked_at:stamp,diagnostic:{schema:'finance_income_detail_diagnostic_v1',source:'SHOPEE_FINANCE_INCOME_DETAIL',stage:'PROVIDER_HTTP',code:'FINANCE_INCOME_DETAIL_UPSTREAM_HTTP',http:403,provider_code:'error_api_permission',response_kind:'JSON_PERMISSION_REJECTED'}};
 return input;
}

test('one saved monthly publication prepares seven checks and quantifies reasons without asserting an external close',async t=>{
 const f=await fixture(t),calls=structuredClone(f.calls),report=f.calculate();assert.ok(report);assert.equal(report.scope_status,'SAME_PUBLICATION');assert.equal(report.checks.length,7);assert.equal(report.period_complete,false);assert.equal(report.status,'PREPARING');assert.equal(report.totals.realized_profit_cents,null);assert.deepEqual(report.comparisons.map(row=>row.state),['NOT_COMPARED','NOT_COMPARED']);assert.equal(report.comparisons[1].expected_cents,null);assert.equal(report.totals.after_adjustment_repass_cents,f.input.monthly.expected_repass_cents-900);assert.ok(report.cases.every(row=>row.source&&row.next_action&&row.agent_id));assert.deepEqual(f.calls,calls,'preparing a close performs no collection');assert.doesNotMatch(JSON.stringify(report),/order_hash|case_hash|run_id|order_sn|buyer|access_token/);
});

test('a mismatched publication cannot expose adjustments or refund amounts from that other cut',async t=>{
 const f=await fixture(t),input=structuredClone(f.input);input.audit_scope.publication_revision++;const report=f.calculate(input);assert.ok(report);assert.equal(report.scope_status,'MISMATCH');assert.equal(report.totals.after_adjustment_repass_cents,null);assert.equal(report.totals.reported_refund_information_cents,null);assert.equal(report.cases.find(row=>row.code==='RECONCILIATION_SCOPE_REQUIRED').state,'BLOCKED');
 const changed=structuredClone(f.input);for(const row of changed.reconciliation.reports){row.source_checked_at.finance_oldest_at--;row.source_checked_at.finance_latest_at--;}assert.equal(f.calculate(changed).scope_status,'MISMATCH');
});

test('reported refund values remain informational and never create a second deduction',async t=>{
 const f=await fixture(t),initial=f.calculate(),input=structuredClone(f.input);input.reconciliation.reports[0].cases[0].requested_refund_cents=9000;input.reconciliation.reports[0].returns.known_requested_refund_cents=9000;const changed=f.calculate(input);assert.ok(changed);assert.equal(changed.totals.reported_refund_information_cents,9000);assert.equal(changed.totals.provisional_balance_cents,initial.totals.provisional_balance_cents);
});

test('current Pending and its exact failed-attempt diagnostic stay separate from monthly amounts',async t=>{
 const f=await fixture(t),input=pendingInput(f.input,f.now()/1000),report=f.calculate(input),row=report.cases.find(row=>row.code==='CURRENT_PENDING_DETAIL_UNAVAILABLE');assert.ok(row);assert.equal(row.known_amount_cents,12345);assert.equal(row.affected_count,null);assert.equal(row.amount_basis,'CURRENT_PROVIDER_PENDING');assert.equal(row.technical_diagnostic.http,403);assert.equal(row.technical_diagnostic.stage,'PROVIDER_HTTP');assert.equal(report.totals.provisional_balance_cents,f.calculate().totals.provisional_balance_cents);
 input.income_detail_diagnostic.attempt_checked_at--;assert.equal(f.calculate(input).cases.find(row=>row.code==='CURRENT_PENDING_DETAIL_UNAVAILABLE').technical_diagnostic,null,'a previous error cannot be attached to the latest attempt');
 input.income_detail_diagnostic.attempt_checked_at++;input.income_detail_diagnostic.diagnostic.provider_code='PRIVATE_UNKNOWN';assert.equal(f.calculate(input).cases.find(row=>row.code==='CURRENT_PENDING_DETAIL_UNAVAILABLE').technical_diagnostic,null);
});

test('strict public projection rejects forged completion, hidden identities, unsafe routes and accessors',async t=>{
 const f=await fixture(t),original=f.calculate();
 for(const mutate of [r=>r.status='READY_FOR_COMPARISON',r=>r.comparisons[1].state='VERIFIED',r=>r.totals.realized_profit_cents=100,r=>r.order_sn='PRIVATE',r=>r.cases.push({...r.cases[0],code:'CURRENT_PENDING_DETAIL_UNAVAILABLE',href:'https://external.invalid'}),r=>r.checks[0].source.token='PRIVATE',r=>r.checks[0].state='VERIFIED']){const value=structuredClone(original);mutate(value);assert.equal(projectBusinessFinancialCloseout(value),null);}
 let invoked=false;const poison={...original};Object.defineProperty(poison,'month',{enumerable:true,get(){invoked=true;return '2026-10';}});assert.equal(projectBusinessFinancialCloseout(poison),null);assert.equal(invoked,false);
 const context=vm.createContext({serialized:JSON.stringify(original)});vm.runInContext(projectBusinessFinancialCloseout.toString()+';globalThis.report=projectBusinessFinancialCloseout(JSON.parse(serialized));',context);assert.deepEqual(JSON.parse(JSON.stringify(context.report)),original);
});

function browser(report,scope){
 const context=vm.createContext({serialized:JSON.stringify(report),scopeRaw:JSON.stringify(scope)}),ids=[...financialCloseoutBody().matchAll(/\bid="([^"]+)"/g)].map(row=>row[1]);
 vm.runInContext(`const nodes=new Map();function node(tag='div'){return {tag,textContent:'',children:[],hidden:false,dataset:{},disabled:false,events:{},append(...rows){this.children.push(...rows);},replaceChildren(...rows){this.children=[...rows];this.textContent='';},addEventListener(name,fn){this.events[name]=fn;}};}for(const id of ${JSON.stringify(ids)})nodes.set(id,node());const document={hidden:false,getElementById:id=>nodes.get(id),createElement:node};const text=n=>n.textContent+n.children.map(text).join(' '),control=n=>nodes.get('businessFinancialCloseout'+n);let current=JSON.parse(serialized),scope=JSON.parse(scopeRaw),customApi=null,copied='';const calls=[],navigator={clipboard:{writeText:async value=>{copied=value;}}};const api=async path=>{calls.push(path);return customApi?customApi(path):JSON.parse(JSON.stringify(current));};`+FINANCIAL_CLOSEOUT_CLIENT,context);
 return {run:code=>vm.runInContext(code,context)};
}

test('existing-panel client renders sources, affected quantities and next actions using saved reads only',async t=>{
 const f=await fixture(t),report=f.calculate(pendingInput(f.input,f.now()/1000)),b=browser(report,f.input.audit_scope);assert.equal(b.run('brazaFinancialCloseout.start({api})'),true);assert.equal(await b.run('brazaFinancialCloseout.observe("2026-10",scope)'),true);assert.match(b.run('text(control("Cases"))'),/Pending atual.*Quantidade afetada.*Ainda não confirmada.*Fonte.*Próxima ação.*HTTP 403/s);assert.equal(b.run('calls.length'),1);await b.run('control("Copy").events.click()');assert.deepEqual(JSON.parse(b.run('copied')),report);assert.match(financialCloseoutBody(),/Seller Centre: comparação não registrada.*Banco: extrato ainda não conciliado/);assert.match(FINANCIAL_CLOSEOUT_CSS,/min-height:44px/);assert.match(FINANCIAL_CLOSEOUT_CSS,/@media\(max-width:640px\)/);
});

test('month switches, stop and publication mismatches cannot restore a stale closeout report',async t=>{
 const f=await fixture(t),report=f.calculate(),b=browser(report,f.input.audit_scope);b.run('brazaFinancialCloseout.start({api});customApi=()=>new Promise(resolve=>globalThis.finish=resolve);globalThis.waiting=brazaFinancialCloseout.observe("2026-10",scope);');await Promise.resolve();b.run('brazaFinancialCloseout.stop();finish(current);');assert.equal(await b.run('waiting'),false);assert.equal(b.run('brazaFinancialCloseout.getSnapshot()'),null);b.run('brazaFinancialCloseout.start({api});customApi=async()=>current;scope.publication_revision++;');assert.equal(await b.run('brazaFinancialCloseout.observe("2026-10",scope)'),false);assert.equal(b.run('brazaFinancialCloseout.getSnapshot()'),null);
});


test('partial report windows expose only known information and never certify the monthly repass',async t=>{
 const f=await fixture(t),input=structuredClone(f.input);input.reconciliation.reports.pop();input.reconciliation.status='PARTIAL';input.reconciliation.pending=['RECONCILIATION_PENDING'];const report=f.calculate(input);assert.ok(report);assert.equal(report.scope_status,'SAME_PUBLICATION');assert.equal(report.totals.after_adjustment_repass_cents,null);assert.equal(report.checks.find(row=>row.id==='REPASSES').state,'PENDING');assert.equal(report.cases.find(row=>row.code==='RECONCILIATION_INCOMPLETE').affected_count,1);
});

test('an old short cut remains open across month rollover and preserves historical evidence dates',async t=>{
 const f=await fixture(t);f.clock.time=Date.UTC(2026,10,1,12);const report=f.calculate();assert.ok(report);assert.equal(report.period_complete,false,'October 24 is not a full October month even after rollover');assert.equal(report.status,'PREPARING');assert.equal(report.checks[0].source.freshness,'HISTORICAL');const changed=structuredClone(report);changed.checks[0].source.freshness='FRESH';assert.equal(projectBusinessFinancialCloseout(changed),null);
});

test('incomplete costs identify missing units and preserve identified production without inventing total costs',async t=>{
 const f=await fixture(t);f.env.ADMIN_DB.db.prepare("UPDATE variant_bindings_state SET payload='[]',revision=revision+1").run();const monthly=await f.invoke('read'),report=f.calculate({...f.input,monthly}),row=report.cases.find(row=>row.code==='PRODUCTION_COST_INCOMPLETE');assert.ok(report);assert.ok(row.affected_count>0);assert.equal(row.affected_unit,'UNITS');assert.equal(row.amount_basis,'IDENTIFIED_PRODUCTION_COST');assert.equal(report.checks.find(row=>row.id==='PRODUCTION').state,'PENDING');assert.equal(report.versions.bindings,monthly.bindings_revision);
});
