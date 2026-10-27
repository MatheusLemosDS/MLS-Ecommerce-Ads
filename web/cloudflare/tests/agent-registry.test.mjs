import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMlsAgentRegistry} from '../src/agent-registry.mjs';
import {AGENT_REGISTRY_CLIENT,commandCenterBody} from '../src/agent-registry-view.mjs';

const day=(overrides={})=>({
 schema:'mls_day_snapshot_v1',
 date:'2026-10-27',
 state:'READY',
 net_cents:25000,
 net_basis:'ESTIMATE',
 sales_cents:100000,
 ads_spend_cents:10000,
 paid_orders:20,
 pending:[],
 ...overrides
});
const month=(overrides={})=>({
 schema:'mls_month_snapshot_v1',
 month:'2026-10',
 status:'COMPLETE',
 checked_at:1793070000,
 balance_cents:240000,
 pending:[],
 coverage:{orders:300,paid:250,completed:110,ongoing:140,cancelled:45,cancel_pending:0,unpaid:5,other:0,unknown:0,returns:0,returns_unknown:0},
 production_coverage:{total_units:270,known_units:270,pending_units:0},
 ads_spend_cents:135000,
 product_count:24,
 collection:{schema:'business_month_collection_v1',state:'READY',code:null,retry_after_seconds:0},
 ...overrides
});
const releases=(overrides={})=>({
 schema:'mls_escrow_releases_snapshot_v1',
 month:'2026-10',
 scope_key:'scope',
 report:{report:{pending:['BANK_RECEIPT_NOT_VERIFIED']}},
 orders:{summary:{known_paid_orders:250,located_orders:200,ambiguous_orders:0,verified_orders:198,unverified_orders:2,not_located_orders:50,adjusted_orders:4,after_adjustment_known_orders:250,known_after_adjustment_cents:1000000,not_located_after_adjustment_known_orders:50,known_not_located_after_adjustment_cents:200000},rows:[],truncation:{truncated:true,orders_total:250,orders_included:40}},
 ...overrides
});
const reconciliation=(payouts=[])=>({
 schema:'mls_reconciliation_snapshot_v1',
 month:'2026-10',
 scope_key:'scope',
 report:{reports:[]},
 reviews:[],
 money:[{run_id:'11111111-1111-4111-8111-111111111111',source_revision:1,money:{payouts}}]
});
const expenseSchedule=(overrides={})=>({
 schema:'mls_expense_schedule_snapshot_v1',
 checked_at:1793080000,
 today:'2026-10-27',
 open:{count:3,cents:90000},
 overdue:{count:1,cents:30000},
 due_today:{count:1,cents:20000},
 due_next_7_days:{count:1,cents:40000},
 next_due:{date:'2026-10-27',count:1,cents:20000},
 scheduled_months:2,
 has_unallocated_due_dates:false,
 ...overrides
});


test('healthy snapshots create one observer registry with the executive day metrics and no invented actions',()=>{
 const value=buildMlsAgentRegistry({day:day(),month:month(),now:1793070100});
 assert.equal(value.schema,'mls_agent_registry_v1');
 assert.equal(value.mode,'OBSERVER');
 assert.equal(value.health,'HEALTHY');
 assert.deepEqual(value.day,{date:'2026-10-27',net_cents:25000,net_basis:'ESTIMATE',sales_cents:100000,ads_spend_cents:10000,paid_orders:20,margin_bps:2500});
 assert.equal(value.month.balance_cents,240000);
 assert.equal(value.priorities.length,0);
 assert.equal(value.hermes.status,'HEALTHY');
 assert.equal(value.agents.length,6);
 assert.ok(value.agents.every(agent=>agent.mode==='OBSERVER'));
 assert.ok(value.agents.every(agent=>agent.status==='HEALTHY'));
});

test('financial, returns and production pendencies become bounded priorities owned by the matching agents',()=>{
 const value=buildMlsAgentRegistry({
  day:day({pending:['RETURNS_NOT_RECONCILED']}),
  month:month({
   pending:['STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','FINANCIAL_SOURCE_STALE','EXTERNAL_EXPENSES_REQUIRED'],
   coverage:{...month().coverage,returns:4,other:5},
   production_coverage:{total_units:270,known_units:269,pending_units:1}
  }),
  now:1793070100
 });
 assert.equal(value.health,'ATTENTION');
 const codes=value.priorities.map(item=>item.code);
 for(const code of ['STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','FINANCIAL_SOURCE_STALE','EXTERNAL_EXPENSES_REQUIRED'])assert.ok(codes.includes(code),code);
 const agents=Object.fromEntries(value.agents.map(agent=>[agent.id,agent]));
 assert.equal(agents.finance.status,'ATTENTION');
 assert.equal(agents.products.status,'ATTENTION');
 assert.equal(agents.production.status,'ATTENTION');
 assert.equal(agents.returns.status,'ATTENTION');
 assert.equal(agents.auditor.status,'ATTENTION');
 assert.match(agents.returns.message,/4 pedido\(s\) pagos com devolução e 5 em revisão/);
 assert.equal(value.hermes.status,'ATTENTION');
});

test('partial daily profit remains explicitly based on known costs and never masquerades as a complete margin',()=>{
 const value=buildMlsAgentRegistry({day:day({state:'PARTIAL_COSTS',net_cents:18000,net_basis:'KNOWN_COSTS',pending:['PRODUCTION_COST_INCOMPLETE']}),month:month({pending:['PRODUCTION_COST_INCOMPLETE'],production_coverage:{total_units:270,known_units:260,pending_units:10}})});
 assert.equal(value.day.net_basis,'KNOWN_COSTS');
 assert.equal(value.day.margin_bps,1800);
 assert.equal(value.agents.find(agent=>agent.id==='production').status,'ATTENTION');
 assert.equal(value.hermes.status,'ATTENTION');
});

test('unsafe arithmetic or unavailable source blocks the auditor and Hermes without fabricating money',()=>{
 const value=buildMlsAgentRegistry({day:day({net_cents:null,sales_cents:null,ads_spend_cents:null,paid_orders:null}),month:month({balance_cents:null,pending:['ARITHMETIC_UNSAFE','SOURCE_UNAVAILABLE']})});
 assert.equal(value.health,'BLOCKED');
 assert.equal(value.day.net_cents,null);
 assert.equal(value.day.margin_bps,null);
 assert.equal(value.agents.find(agent=>agent.id==='auditor').status,'BLOCKED');
 assert.equal(value.hermes.status,'BLOCKED');
 assert.ok(value.priorities.every(item=>['BLOCKED','ATTENTION','WORKING'].includes(item.severity)));
});

test('running collection is working rather than healthy and creates no provider-side action',()=>{
 const value=buildMlsAgentRegistry({day:day(),month:month({status:'RUNNING',pending:['COLLECTING']})});
 assert.equal(value.health,'WORKING');
 assert.equal(value.hermes.status,'WORKING');
 assert.ok(value.priorities.some(item=>item.code==='COLLECTING'&&item.severity==='WORKING'));
 assert.ok(value.agents.every(agent=>['WORKING','HEALTHY'].includes(agent.status)));
});


test('command center is read-only, renders the initial agent surfaces and adds no timer or provider request',()=>{
 const html=commandCenterBody();
 for(const id of ['commandCenter','commandCenterNet','commandCenterPriorities','commandCenterAgents','commandAgents'])assert.match(html,new RegExp('id="'+id+'"'));
 for(const label of ['Central de Comando','MLS Hermes','Agentes em modo Observador'])assert.match(html,new RegExp(label));
 assert.doesNotMatch(AGENT_REGISTRY_CLIENT,/\bfetch\s*\(|setInterval\s*\(|\/api\//);
 assert.match(AGENT_REGISTRY_CLIENT,/MutationObserver/);
 assert.match(AGENT_REGISTRY_CLIENT,/brazaDayDashboard/);
 assert.match(AGENT_REGISTRY_CLIENT,/brazaMonthDashboard/);assert.match(AGENT_REGISTRY_CLIENT,/brazaReconciliation/);assert.match(AGENT_REGISTRY_CLIENT,/brazaEscrowReleases/);assert.match(AGENT_REGISTRY_CLIENT,/brazaIncomeOverview/);assert.match(AGENT_REGISTRY_CLIENT,/brazaExpenseSchedule/);
});

test('release matching becomes Finance work without calling an unlocated order unpaid or received',()=>{
 const value=buildMlsAgentRegistry({day:day(),month:month(),releases:releases(),reconciliation:reconciliation(),now:1793070100});
 assert.equal(value.settlement.release_orders_known,250);assert.equal(value.settlement.releases_verified,198);assert.equal(value.settlement.releases_not_located,50);
 assert.ok(value.priorities.some(item=>item.code==='RELEASES_NOT_LOCATED'&&item.severity==='WORKING')||value.priorities.some(item=>item.code==='MATCHING_INCOMPLETE'));
 const finance=value.agents.find(agent=>agent.id==='finance');assert.match(finance.message,/198 liberação/);assert.match(finance.message,/50 pedido/);assert.doesNotMatch(finance.message,/não recebido|não pago|a receber/i);
});

test('ambiguous and unverified releases create attention tasks owned by MLS Finance',()=>{
 const value=buildMlsAgentRegistry({day:day(),month:month(),releases:releases({report:{report:{pending:['RELEASE_IDENTITY_AMBIGUOUS','RELEASE_AMOUNT_UNVERIFIED','BANK_RECEIPT_NOT_VERIFIED']}},orders:{...releases().orders,summary:{...releases().orders.summary,ambiguous_orders:1,unverified_orders:2}}}),now:1793070100});
 assert.equal(value.health,'ATTENTION');
 for(const code of ['RELEASE_IDENTITY_AMBIGUOUS','RELEASE_AMOUNT_UNVERIFIED'])assert.ok(value.priorities.some(item=>item.code===code&&item.agent_id==='finance'),code);
 assert.equal(value.agents.find(agent=>agent.id==='finance').status,'ATTENTION');
});

test('conflicting after-adjustment payout evidence blocks Auditor and Hermes instead of choosing one source',()=>{
 const hash='a'.repeat(64),release=releases({orders:{...releases().orders,summary:{...releases().orders.summary,known_paid_orders:1,located_orders:1,verified_orders:1,unverified_orders:0,not_located_orders:0,adjusted_orders:1,after_adjustment_known_orders:1,known_after_adjustment_cents:8000,not_located_after_adjustment_known_orders:0,known_not_located_after_adjustment_cents:0},rows:[{order_hash:hash,state:'VERIFIED',after_adjustment_repass_cents:8000}],truncation:{truncated:false,orders_total:1,orders_included:1}}});
 const value=buildMlsAgentRegistry({day:day(),month:month(),releases:release,reconciliation:reconciliation([{order_hash:hash,after_adjustment_repass_cents:7900}]),now:1793070100});
 assert.equal(value.health,'BLOCKED');assert.equal(value.settlement.evidence_conflicts,1);
 assert.ok(value.priorities.some(item=>item.code==='SETTLEMENT_EVIDENCE_CONFLICT'&&item.severity==='BLOCKED'));
 assert.equal(value.agents.find(agent=>agent.id==='auditor').status,'BLOCKED');assert.equal(value.hermes.status,'BLOCKED');
});


test('current Shopee Pending stays separate from the month balance and is exposed only as a secondary Finance metric',()=>{
 const incomeOverview={schema:'mls_income_overview_snapshot_v1',checked_at:1793080000,status:'AVAILABLE',pending_cents:32145,released_cents:99999,currency_basis:'FIXED_BRAZIL_SHOP_PROFILE',basis:'CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'};
 const value=buildMlsAgentRegistry({day:day(),month:month(),incomeOverview,now:1793080100}),finance=value.agents.find(agent=>agent.id==='finance');
 assert.equal(finance.metric,240000);assert.equal(finance.metric_kind,'money');assert.equal(finance.secondary_metric,32145);assert.equal(finance.secondary_metric_kind,'money');assert.equal(finance.secondary_metric_label,'Pendente atual na Shopee');
 assert.equal(value.income.current_pending_cents,32145);assert.equal(value.income.status,'AVAILABLE');assert.match(value.income.basis,/NOT_BANK_RECEIPT/);
 assert.notEqual(value.month.balance_cents,value.income.current_pending_cents);
});

test('missing current income never becomes zero or changes the Finance month result',()=>{
 const value=buildMlsAgentRegistry({day:day(),month:month(),incomeOverview:{schema:'mls_income_overview_snapshot_v1',checked_at:1793080000,status:'AVAILABLE',pending_cents:null,released_cents:null,currency_basis:'FIXED_BRAZIL_SHOP_PROFILE',basis:'CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'}});
 const finance=value.agents.find(agent=>agent.id==='finance');assert.equal(finance.metric,240000);assert.equal(finance.secondary_metric,null);assert.equal(value.income.current_pending_cents,null);
});


test('overdue and due-today expenses become Finance priorities without changing the monthly result',()=>{
 const value=buildMlsAgentRegistry({day:day(),month:month(),expenseSchedule:expenseSchedule(),now:1793080100}),finance=value.agents.find(agent=>agent.id==='finance');
 assert.equal(value.month.balance_cents,240000);assert.equal(value.expense_schedule.overdue_count,1);assert.equal(value.expense_schedule.overdue_cents,30000);assert.equal(value.expense_schedule.due_today_count,1);assert.equal(value.expense_schedule.next_due_date,'2026-10-27');
 assert.ok(value.priorities.some(item=>item.code==='EXPENSES_OVERDUE'&&item.agent_id==='finance'&&item.severity==='ATTENTION'));
 assert.ok(value.priorities.some(item=>item.code==='EXPENSES_DUE_TODAY'&&item.agent_id==='finance'&&item.severity==='ATTENTION'));
 assert.equal(finance.status,'ATTENTION');assert.match(finance.message,/1 conta\(s\) atrasada/);
});

test('next payment appears in Finance context without creating a warning when nothing is overdue or due today',()=>{
 const schedule=expenseSchedule({overdue:{count:0,cents:0},due_today:{count:0,cents:0},next_due:{date:'2026-10-29',count:2,cents:40000}});
 const value=buildMlsAgentRegistry({day:day(),month:month(),expenseSchedule:schedule,now:1793080100}),finance=value.agents.find(agent=>agent.id==='finance');
 assert.equal(finance.status,'HEALTHY');assert.match(finance.message,/Próximo vencimento cadastrado: 2026-10-29/);assert.equal(value.expense_schedule.next_due_count,2);assert.equal(value.expense_schedule.next_due_cents,40000);
 assert.ok(!value.priorities.some(item=>item.code.startsWith('EXPENSES_')));
});
