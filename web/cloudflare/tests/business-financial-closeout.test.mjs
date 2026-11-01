import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {incomeDetailFailureDiagnostic} from '../../finance/src/income-detail-diagnostic.mjs';
import {projectPendingIncomeScanFrame} from '../../finance/src/pending-income-frame.mjs';
import {projectBusinessPendingIncomeScan} from '../src/business-pending-income-scan.mjs';
import {collectionFixture} from './business-collection-fixture.mjs';
import {readCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {projectBusinessReconciliation} from '../src/business-reconciliation.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';
import {buildBusinessFinancialCloseout,projectBusinessFinancialCloseout} from '../src/business-financial-closeout.mjs';
import {FINANCIAL_CLOSEOUT_CLIENT,FINANCIAL_CLOSEOUT_CSS,financialCloseoutBody} from '../src/financial-closeout-view.mjs';

async function fixture(t,{returns=true}={}){
 const f=await collectionFixture({returns,allPaid:true,windowCounts:[3,1],paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let monthly=await f.invoke('start');while(monthly.status==='RUNNING')monthly=await f.invoke('step');monthly=await f.invoke('ads');assert.equal(monthly.status,'COMPLETE');
 const published=await readCompletedBusinessMonth(f.env,'2026-10',{now:f.now}),stamp=f.now()/1000;
 const sources=published.payload.slots.map(slot=>({run_id:slot.frame.run_id,source_revision:slot.frame.revision,start_date:slot.start_date,end_date:slot.end_date}));
 const reports=published.payload.slots.map((slot,index)=>{
  const c=slot.frame.coverage,base=Math.round(Number(slot.frame.known_expected_repass_raw)*100),delta=index===0?-1000:100;
  const cases=returns&&index===0?[{case_hash:'1'.repeat(64),order_hash:'a'.repeat(64),status:'ACCEPTED',requested_refund_cents:1000,checked_at:stamp,diagnostic:null}]:[];
  return {schema:'finance_reconciliation_v1',...sources[index],checked_at:stamp,status:'CHECKED',source_checked_at:{finance_oldest_at:slot.frame.source_checked_at.oldest_at,finance_latest_at:slot.frame.source_checked_at.latest_at,returns_oldest_at:cases.length?stamp:null,returns_latest_at:cases.length?stamp:null},coverage:{orders:c.orders,evidence_orders:c.orders,missing_evidence_orders:0,paid_orders:c.paid,review_orders:0,return_orders:c.returns,return_unknown_orders:c.returns_unknown},adjustments:{reported_orders:c.paid,missing_orders:0,conflicting_orders:0,known_adjustment_cents:delta,base_repass_cents:base,after_adjustment_repass_cents:base+delta},returns:{reference_count:cases.length,checked_count:cases.length,pending_count:0,known_requested_refund_cents:cases.length?1000:0,requested_amount_complete:true,permission:cases.length?'AVAILABLE':'UNKNOWN'},cases,truncation:{truncated:false,cases_total:cases.length,cases_included:cases.length},pending:[...(cases.length?['RETURN_VALUES_UNVERIFIED']:[]),'SETTLEMENT_NOT_RECONCILED'],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};
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


test('denied or missing refund amounts stay unknown while documented zero remains a known subtotal',async t=>{
 const f=await fixture(t);
 for(const denied of [true,false]){
  const input=structuredClone(f.input),row=input.reconciliation.reports[0];row.status=denied?'BLOCKED':'PARTIAL';row.cases[0].status='PENDING';row.cases[0].requested_refund_cents=null;row.cases[0].checked_at=null;row.cases[0].diagnostic=denied?'PERMISSION_DENIED':'DETAILS_PENDING';row.source_checked_at.returns_oldest_at=null;row.source_checked_at.returns_latest_at=null;row.returns={reference_count:1,checked_count:0,pending_count:1,known_requested_refund_cents:0,requested_amount_complete:false,permission:denied?'DENIED':'UNKNOWN'};row.pending=['RETURN_VALUES_UNVERIFIED','SETTLEMENT_NOT_RECONCILED','RETURN_DETAILS_PENDING',...(denied?['RETURN_PERMISSION_REQUIRED']:[])];input.reconciliation.status='PARTIAL';input.reconciliation.pending=['RECONCILIATION_PENDING'];assert.ok(projectBusinessReconciliation(input.reconciliation,projectReconciliationFrame));
  const report=f.calculate(input);assert.ok(report);assert.equal(report.totals.reported_refund_information_cents,null);assert.equal(report.cases.find(row=>row.code==='RETURNS_NOT_RECONCILED').known_amount_cents,null);assert.equal(report.checks.find(row=>row.id==='RETURNS').known_amount_cents,null);assert.equal(report.totals.provisional_balance_cents,f.calculate().totals.provisional_balance_cents,'missing informational refunds never create a new debit');
 }
 const zero=structuredClone(f.input),row=zero.reconciliation.reports[0];row.cases[0].requested_refund_cents=0;row.returns.known_requested_refund_cents=0;assert.ok(projectBusinessReconciliation(zero.reconciliation,projectReconciliationFrame));const known=f.calculate(zero);assert.equal(known.totals.reported_refund_information_cents,0);assert.equal(known.cases.find(row=>row.code==='RETURNS_NOT_RECONCILED').known_amount_cents,0);assert.equal(known.checks.find(row=>row.id==='RETURNS').known_amount_cents,0);
});

test('complete no-return evidence permits an explicit zero without inventing a refund amount',async t=>{
 const f=await fixture(t,{returns:false}),report=f.calculate();assert.ok(report);assert.equal(report.totals.reported_refund_information_cents,0);assert.equal(report.checks.find(row=>row.id==='RETURNS').state,'VERIFIED');assert.equal(report.checks.find(row=>row.id==='RETURNS').known_amount_cents,0);assert.equal(report.cases.some(row=>row.code==='RETURNS_NOT_RECONCILED'),false);
});

test('partial refund evidence preserves a known positive or documented-zero subtotal',async t=>{
 const f=await fixture(t);
 for(const amount of [1000,0]){
  const input=structuredClone(f.input),row=input.reconciliation.reports[0];row.status='PARTIAL';row.cases[0].requested_refund_cents=amount;row.cases.push({case_hash:'2'.repeat(64),order_hash:'a'.repeat(64),status:'PENDING',requested_refund_cents:null,checked_at:null,diagnostic:'DETAILS_PENDING'});row.returns={reference_count:2,checked_count:1,pending_count:1,known_requested_refund_cents:amount,requested_amount_complete:false,permission:'AVAILABLE'};row.truncation={truncated:false,cases_total:2,cases_included:2};row.pending.push('RETURN_DETAILS_PENDING');input.reconciliation.status='PARTIAL';input.reconciliation.pending=['RECONCILIATION_PENDING'];assert.ok(projectBusinessReconciliation(input.reconciliation,projectReconciliationFrame));const report=f.calculate(input);assert.ok(report);assert.equal(report.totals.reported_refund_information_cents,amount);assert.equal(report.cases.find(row=>row.code==='RETURNS_NOT_RECONCILED').known_amount_cents,amount);
 }
});


test('the exact Finance timeout cause survives closeout, frozen browser projection and rendered detail',async t=>{
 const f=await fixture(t),input=pendingInput(f.input,f.now()/1000);input.income_detail_diagnostic.diagnostic=incomeDetailFailureDiagnostic({code:'FINANCE_INCOME_DETAIL_TIMEOUT'});const report=f.calculate(input),row=report.cases.find(row=>row.code==='CURRENT_PENDING_DETAIL_UNAVAILABLE');assert.equal(row.technical_code,'FINANCE_INCOME_DETAIL_HTTP_ERROR');assert.equal(row.technical_diagnostic.code,'FINANCE_INCOME_DETAIL_TIMEOUT');assert.equal(row.technical_diagnostic.stage,'TRANSPORT');
 const context=vm.createContext({serialized:JSON.stringify(report)});vm.runInContext(projectBusinessFinancialCloseout.toString()+';globalThis.report=projectBusinessFinancialCloseout(JSON.parse(serialized));',context);assert.deepEqual(JSON.parse(JSON.stringify(context.report)),report);
 const b=browser(report,f.input.audit_scope);b.run('brazaFinancialCloseout.start({api})');assert.equal(await b.run('brazaFinancialCloseout.observe("2026-10",scope)'),true);assert.match(b.run('text(control("Cases"))'),/FINANCE_INCOME_DETAIL_HTTP_ERROR.*FINANCE_INCOME_DETAIL_TIMEOUT.*TRANSPORT/);
 const unknown=structuredClone(report);unknown.cases.find(row=>row.technical_diagnostic).technical_diagnostic.code='PRIVATE_ARBITRARY_SOURCE_TEXT';assert.equal(projectBusinessFinancialCloseout(unknown),null);const wrongStage=structuredClone(report);wrongStage.cases.find(row=>row.technical_diagnostic).technical_diagnostic.stage='AUTHORIZATION';assert.equal(projectBusinessFinancialCloseout(wrongStage),null);
});

test('closeout browser diagnostic vocabulary matches every closed Finance code, provider code and response kind',async t=>{
 const f=await fixture(t),input=pendingInput(f.input,f.now()/1000),source=readFileSync(new URL('../../finance/src/income-detail-diagnostic.mjs',import.meta.url),'utf8');
 const vocabulary=name=>{const match=source.match(new RegExp('const '+name+'=new Set\\((\\[[^\\]]+\\])'));assert.ok(match,name);return JSON.parse(match[1].replaceAll("'",'"'));};
 const detail=vocabulary('detailCodes').map(code=>'FINANCE_INCOME_DETAIL_'+code),refresh=vocabulary('refreshCodes').map(code=>'FINANCE_REFRESH_'+code),authorization=vocabulary('authorizationCodes');
 for(const code of [...detail,...refresh,...authorization]){input.income_detail_diagnostic.diagnostic=incomeDetailFailureDiagnostic({code});assert.equal(input.income_detail_diagnostic.diagnostic.code,code);const report=f.calculate(input);assert.ok(report,code);assert.equal(report.cases.find(row=>row.technical_diagnostic).technical_diagnostic.code,code);}
 for(const [name,key,rawKey] of [['providerCodes','provider_code','provider_code'],['responseKinds','response_kind','upstream_diagnostic']])for(const value of vocabulary(name)){input.income_detail_diagnostic.diagnostic=incomeDetailFailureDiagnostic({code:'FINANCE_INCOME_DETAIL_UPSTREAM_HTTP',[rawKey]:value});const report=f.calculate(input);assert.ok(report,value);assert.equal(report.cases.find(row=>row.technical_diagnostic).technical_diagnostic[key],value);}
 const report=f.calculate(input);report.cases.find(row=>row.technical_diagnostic).technical_diagnostic.message='PRIVATE_SOURCE_BODY';assert.equal(projectBusinessFinancialCloseout(report),null);
});


const pendingBasis='CURRENT_PENDING_PAGINATED_MUTABLE_SOURCE_NOT_MONTH_OR_BANK_RECEIPT';
const pendingRow=(index,amount=1590)=>({entry_hash:(index+1).toString(16).padStart(64,'0'),order_hash:(index+1001).toString(16).padStart(64,'0'),currency:'BRL',status:'Pendente',description:null,payment_method:null,estimated_escrow_raw:(amount/100).toFixed(2),estimated_escrow_cents:amount,estimated_payout_time:null,creation_time:null});
function pendingPublication(rows,stamp,id='00000000-0000-4000-8000-000000000001'){
 const counts=new Map();let total=0n,unknown=0;
 for(const row of rows){counts.set(row.order_hash,(counts.get(row.order_hash)||0)+1);if(row.estimated_escrow_cents===null)unknown++;else total+=BigInt(row.estimated_escrow_cents);}
 const conflicting_orders=[...counts.values()].filter(count=>count>1).length,safe=total>=BigInt(Number.MIN_SAFE_INTEGER)&&total<=BigInt(Number.MAX_SAFE_INTEGER),amount_complete=unknown===0&&conflicting_orders===0&&safe;
 return {scan_id:id,started_at:stamp-20,completed_at:stamp,source_oldest_at:stamp-5,source_latest_at:stamp,pages_read:Math.max(1,Math.ceil(rows.length/100)),rows,unique_orders:counts.size,duplicate_entries:0,conflicting_orders,known_amount_cents:amount_complete?Number(total):null,unknown_amount_count:unknown,amount_complete,basis:pendingBasis};
}
function paginatedPending(input,stamp,{state='COMPLETE',rows=[pendingRow(0)],retained=null,conflicts=0}={}){
 const publication=state==='COMPLETE'?pendingPublication(rows,stamp):retained;
 const scan={scan_id:'00000000-0000-4000-8000-000000000001',state,started_at:stamp-20,updated_at:stamp,completed_at:state==='COMPLETE'?stamp:null,date_from:'2026-10-23',date_to:'2026-10-24',pages_read:state==='COMPLETE'?publication.pages_read:1,unique_entries:state==='COMPLETE'?publication.rows.length:100,unique_orders:state==='COMPLETE'?publication.unique_orders:100,duplicate_entries:0,conflicting_orders:state==='COMPLETE'?publication.conflicting_orders:conflicts,next_attempt_at:stamp+(state==='COMPLETE'?900:60),error:state==='RETRY_WAIT'?'TIMEOUT':state==='ERROR'?'REPEATED_CURSOR':state==='LIMIT_REACHED'?'LIMIT_REACHED':null};
 const frame={schema:'finance_pending_income_scan_v1',checked_at:stamp,scan,report:publication,basis:pendingBasis};assert.ok(projectPendingIncomeScanFrame(frame),'synthetic paginated Finance frame must satisfy the shared contract');
 const failed=['RETRY_WAIT','ERROR','LIMIT_REACHED'].includes(state),value={schema:'business_pending_income_scan_v1',checked_at:stamp,status:failed?'PARTIAL_UNAVAILABLE':state==='RUNNING'?'COLLECTING':'AVAILABLE',frame,attempt:{checked_at:stamp,status:failed?'UNAVAILABLE':'SUCCESS',code:failed?'FINANCE_PENDING_INCOME_SCAN_'+scan.error:null,next_attempt_at:scan.next_attempt_at}};assert.ok(projectBusinessPendingIncomeScan(value,projectPendingIncomeScanFrame),'synthetic App envelope must satisfy the same browser contract');
 return {...structuredClone(input),pending_income_scan:value};
}
function assertMonthlyUnchanged(actual,baseline){assert.deepEqual(actual.totals,baseline.totals);assert.deepEqual(actual.checks,baseline.checks);assert.deepEqual(actual.comparisons,baseline.comparisons);assert.deepEqual(actual.cases.filter(row=>row.source.name!=='CURRENT_INCOME_PENDING'),baseline.cases.filter(row=>row.source.name!=='CURRENT_INCOME_PENDING'));assert.equal(actual.totals.realized_profit_cents,null);}

test('absent and not-yet-created paginated snapshots preserve the exact legacy closeout report',async t=>{
 const f=await fixture(t),stamp=f.now()/1000,input=pendingInput(f.input,stamp),legacy=f.calculate(input);
 for(const value of [null,undefined,{schema:'business_pending_income_scan_v1',checked_at:stamp,status:'PENDING',frame:null,attempt:null}])assert.deepEqual(f.calculate({...input,pending_income_scan:value}),legacy);
});

test('a complete multi-page Pending publication supersedes a legacy first-page warning without changing monthly money',async t=>{
 const f=await fixture(t),stamp=f.now()/1000,baseline=f.calculate(),input=pendingInput(f.input,stamp),rows=Array.from({length:201},(_,index)=>pendingRow(index));
 for(const legacyFailure of [true,false]){
  const source=structuredClone(input);
  if(!legacyFailure)source.income_detail={schema:'business_income_detail_v1',checked_at:stamp,status:'AVAILABLE',attempt:null,report:{schema:'finance_income_detail_v1',checked_at:stamp,region:'BRAZIL',shop_type:'LOCAL',income_status:'PENDING',page_size:100,returned_count:100,has_more:true,next_cursor_present:true,rows:rows.slice(0,100),basis:'CURRENT_PENDING_PROVIDER_INCOME_DETAIL_NOT_MONTH_OR_BANK_RECEIPT'}};
  const report=f.calculate(paginatedPending(source,stamp,{rows}));assert.ok(report);assert.equal(report.cases.some(row=>row.source.name==='CURRENT_INCOME_PENDING'),false,'completed source traversal replaces stale v1 errors and has_more; different timestamp/basis totals are never forced equal');assertMonthlyUnchanged(report,baseline);assert.doesNotMatch(JSON.stringify(report),/entry_hash|order_hash|scan_id|CURRENT_PENDING_PAGINATED/);
 }
});

test('running and retrying scans remain explicitly partial while a previous completed publication stays informational',async t=>{
 const f=await fixture(t),stamp=f.now()/1000,baseline=f.calculate(),input=pendingInput(f.input,stamp),retained=pendingPublication([pendingRow(9)],stamp-80,'00000000-0000-4000-8000-000000000002');
 for(const state of ['RUNNING','RETRY_WAIT']){
  const report=f.calculate(paginatedPending(input,stamp,{state,retained})),row=report.cases.find(row=>row.code==='CURRENT_PENDING_PARTIAL');assert.ok(report);assert.equal(row.state,'WORKING');assert.equal(row.affected_count,100);assert.equal(row.next_action,'WAIT_FOR_REFRESH');assert.equal(row.known_amount_cents,12345);assert.equal(report.cases.some(row=>row.technical_diagnostic!==null),false,'an old v1 failure cannot become a new scan diagnostic');assertMonthlyUnchanged(report,baseline);
 }
});

test('source errors and bounded scan limits remain blocked even with retained completed evidence',async t=>{
 const f=await fixture(t),stamp=f.now()/1000,baseline=f.calculate(),input=pendingInput(f.input,stamp),retained=pendingPublication([pendingRow(8)],stamp-80,'00000000-0000-4000-8000-000000000002');
 for(const state of ['ERROR','LIMIT_REACHED']){
  const report=f.calculate(paginatedPending(input,stamp,{state,retained})),row=report.cases.find(row=>row.source.name==='CURRENT_INCOME_PENDING');assert.ok(row);assert.equal(row.state,'BLOCKED');assert.equal(row.next_action,state==='LIMIT_REACHED'?'REVIEW_COLLECTION_LIMIT':'RESTORE_PENDING_DETAIL');assertMonthlyUnchanged(report,baseline);
 }
 const failed=paginatedPending(input,stamp);failed.pending_income_scan.status='PARTIAL_UNAVAILABLE';failed.pending_income_scan.attempt={checked_at:stamp,status:'UNAVAILABLE',code:'FINANCE_PENDING_INCOME_SCAN_TIMEOUT',next_attempt_at:stamp+300};assert.ok(projectBusinessPendingIncomeScan(failed.pending_income_scan,projectPendingIncomeScanFrame));const report=f.calculate(failed);assert.equal(report.cases.find(row=>row.source.name==='CURRENT_INCOME_PENDING').code,'CURRENT_PENDING_DETAIL_UNAVAILABLE');assertMonthlyUnchanged(report,baseline);
});

test('conflicting and unknown Pending amounts stay review cases instead of complete or zero',async t=>{
 const f=await fixture(t),stamp=f.now()/1000,baseline=f.calculate(),input=pendingInput(f.input,stamp),conflictRows=[pendingRow(0),pendingRow(1,2140)];conflictRows[1].order_hash=conflictRows[0].order_hash;
 const conflict=f.calculate(paginatedPending(input,stamp,{rows:conflictRows})),row=conflict.cases.find(row=>row.code==='CURRENT_PENDING_CONFLICT');assert.ok(row);assert.equal(row.state,'BLOCKED');assert.equal(row.affected_count,1);assert.equal(row.affected_unit,'ORDERS');assert.equal(row.known_amount_cents,null);assertMonthlyUnchanged(conflict,baseline);
 const unknownRows=[pendingRow(0)];unknownRows[0].estimated_escrow_raw='10.123';unknownRows[0].estimated_escrow_cents=null;const unknown=f.calculate(paginatedPending(input,stamp,{rows:unknownRows})),unknownCase=unknown.cases.find(row=>row.code==='CURRENT_PENDING_AMOUNT_UNVERIFIED');assert.ok(unknownCase);assert.equal(unknownCase.state,'BLOCKED');assert.equal(unknownCase.known_amount_cents,null);assert.equal(unknownCase.affected_count,1);assertMonthlyUnchanged(unknown,baseline);
 const overflowRows=Array.from({length:100},(_,index)=>({...pendingRow(index),estimated_escrow_raw:'1000000000000',estimated_escrow_cents:100000000000000})),overflow=f.calculate(paginatedPending(input,stamp,{rows:overflowRows}));assert.equal(overflow.cases.find(row=>row.code==='CURRENT_PENDING_AMOUNT_UNVERIFIED').affected_count,100);assertMonthlyUnchanged(overflow,baseline);
 const running=f.calculate(paginatedPending(input,stamp,{state:'RUNNING',conflicts:1}));assert.equal(running.cases.find(row=>row.code==='CURRENT_PENDING_CONFLICT').affected_count,1);assert.equal(running.cases.find(row=>row.code==='CURRENT_PENDING_PARTIAL').state,'WORKING');
});

test('an exhausted but empty Pending scan cannot clear a positive Overview or certify bank receipt',async t=>{
 const f=await fixture(t),stamp=f.now()/1000,baseline=f.calculate(),input=pendingInput(f.input,stamp),value=paginatedPending(input,stamp,{rows:[]}),report=f.calculate(value),row=report.cases.find(row=>row.code==='CURRENT_PENDING_EMPTY_MISMATCH');assert.ok(row);assert.equal(row.state,'BLOCKED');assert.equal(row.affected_count,0);assert.equal(row.known_amount_cents,12345);assertMonthlyUnchanged(report,baseline);
 value.income_overview.report.pending.raw='0';value.income_overview.report.pending.cents=0;assert.equal(f.calculate(value).cases.some(row=>row.source.name==='CURRENT_INCOME_PENDING'),false,'a documented empty traversal with a zero Overview is not a manufactured discrepancy');
 value.income_overview=null;assert.equal(f.calculate(value).cases.some(row=>row.source.name==='CURRENT_INCOME_PENDING'),false);
});

test('malformed or future paginated snapshots fail closed and cannot inherit a legacy diagnostic',async t=>{
 const f=await fixture(t),stamp=f.now()/1000,baseline=f.calculate(),input=pendingInput(f.input,stamp);
 for(const mutate of [v=>v.pending_income_scan.frame.report.known_amount_cents=0,v=>v.pending_income_scan.checked_at=stamp+61,v=>v.pending_income_scan.frame.report.order_sn='PRIVATE_ORDER_ID']){
  const value=paginatedPending(input,stamp);mutate(value);const report=f.calculate(value),row=report.cases.find(row=>row.code==='CURRENT_PENDING_DETAIL_UNAVAILABLE');assert.ok(report);assert.equal(row.state,'BLOCKED');assert.equal(row.technical_diagnostic,null);assertMonthlyUnchanged(report,baseline);assert.doesNotMatch(JSON.stringify(report),/PRIVATE_ORDER_ID/);
 }
});

test('new Pending review cases survive the frozen browser projection with clear titles and strict provenance',async t=>{
 const f=await fixture(t),stamp=f.now()/1000,input=pendingInput(f.input,stamp),conflictRows=[pendingRow(0),pendingRow(1,2140)];conflictRows[1].order_hash=conflictRows[0].order_hash;const unknownRows=[{...pendingRow(0),estimated_escrow_raw:'10.123',estimated_escrow_cents:null}];
 for(const [rows,code,title] of [[conflictRows,'CURRENT_PENDING_CONFLICT',/Pending atual com valores conflitantes para o mesmo pedido/],[unknownRows,'CURRENT_PENDING_AMOUNT_UNVERIFIED',/Pending atual com valores ainda não confirmados/],[[],'CURRENT_PENDING_EMPTY_MISMATCH',/Pending atual tem saldo informado, mas a lista veio vazia/]]){
  const report=f.calculate(paginatedPending(input,stamp,{rows})),b=browser(report,f.input.audit_scope);assert.ok(projectBusinessFinancialCloseout(report));b.run('brazaFinancialCloseout.start({api})');assert.equal(await b.run('brazaFinancialCloseout.observe("2026-10",scope)'),true);assert.match(b.run('text(control("Cases"))'),title);
  const row=report.cases.find(row=>row.code===code);assert.ok(row);
  for(const change of [r=>r.source.name='MONTHLY_FINANCE',r=>r.state='WORKING',r=>r.next_action='WAIT_FOR_REFRESH']){const poisoned=structuredClone(report);change(poisoned.cases.find(r=>r.code===code));assert.equal(projectBusinessFinancialCloseout(poisoned),null);}
 }
});
