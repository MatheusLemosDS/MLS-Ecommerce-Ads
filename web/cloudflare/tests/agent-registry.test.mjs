import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPendingIncomeAudit,buildMlsAgentRegistry as buildRegistry} from '../src/agent-registry.mjs';
import {projectMlsSettlementEvidence} from '../src/mls-settlement-evidence.mjs';
import {settlementFixture} from './mls-settlement-fixture.mjs';
import {AGENT_REGISTRY_CLIENT,commandCenterBody,pendingIncomeBody} from '../src/agent-registry-view.mjs';
import {CLIENT as ADMIN_CLIENT} from '../src/admin-client.mjs';
const buildMlsAgentRegistry=input=>buildRegistry(input,{projectSettlementEvidence:projectMlsSettlementEvidence});

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
 audit_scope:settlementFixture().month.audit_scope,
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
const releases=(overrides={})=>{
 const proof=settlementFixture().releases,value={
 schema:'mls_escrow_releases_snapshot_v1',
 month:'2026-10',
 scope_key:proof.scope_key,
 report:{report:{pending:['BANK_RECEIPT_NOT_VERIFIED']}},
 orders:{summary:{known_paid_orders:250,located_orders:200,ambiguous_orders:0,verified_orders:198,unverified_orders:2,not_located_orders:50,adjusted_orders:4,after_adjustment_known_orders:250,known_after_adjustment_cents:1000000,not_located_after_adjustment_known_orders:50,known_not_located_after_adjustment_cents:200000},rows:[],truncation:{truncated:true,orders_total:250,orders_included:40}},
 ...overrides
 };
 value.report={...proof.report,...value.report,report:{...proof.report.report,...value.report.report}};
 value.orders={...value.orders,rows:value.orders.rows.map(row=>({...proof.orders.rows[0],...row,adjustment_cents:row.after_adjustment_repass_cents-proof.orders.rows[0].base_repass_cents}))};
 return value;
};
const reconciliation=(payouts=[])=>{
 const proof=settlementFixture().reconciliation;
 return {
 schema:'mls_reconciliation_snapshot_v1',
 month:'2026-10',
 scope_key:proof.scope_key,
 report:proof.report,
 reviews:[],
 money:[{...proof.money[0],money:{...proof.money[0].money,payouts:payouts.map(row=>({...proof.money[0].money.payouts[0],...row,adjustment_cents:row.after_adjustment_repass_cents-proof.money[0].money.payouts[0].base_repass_cents}))}}]
 };
};


test('healthy snapshots create one observer registry with the executive day metrics and no invented actions',()=>{
 const value=buildMlsAgentRegistry({day:day(),month:month(),now:1793070100});
 assert.equal(value.schema,'mls_agent_registry_v1');
 assert.equal(value.mode,'OBSERVER');
 assert.equal(value.health,'HEALTHY');
 assert.deepEqual(value.day,{date:'2026-10-27',net_cents:25000,net_basis:'ESTIMATE',pending:[],presentation:null,sales_cents:100000,ads_spend_cents:10000,paid_orders:20,margin_bps:2500});
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
 assert.match(AGENT_REGISTRY_CLIENT,/brazaMonthDashboard/);assert.match(AGENT_REGISTRY_CLIENT,/brazaReconciliation/);assert.match(AGENT_REGISTRY_CLIENT,/brazaEscrowReleases/);assert.match(AGENT_REGISTRY_CLIENT,/brazaIncomeOverview/);assert.match(AGENT_REGISTRY_CLIENT,/buildPendingIncomeAudit/);
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

test('different or missing published scopes create waiting work instead of a false payout conflict',()=>{
 for(const mutate of [
  input=>input.releases.scope_key='',
  input=>delete input.month.audit_scope,
  input=>input.month.audit_scope.publication_revision++,
  input=>input.releases.report.cohort.sources[0].finance_oldest_at--,
  input=>input.reconciliation.report.reports[0].source_revision++
 ]){
  const input={...settlementFixture(),day:day(),month:month()};
  Object.assign(input.reconciliation.money[0].money.payouts[0],{adjustment_cents:-100,after_adjustment_repass_cents:7900});mutate(input);
  const result=buildMlsAgentRegistry(input);
  assert.equal(result.settlement.evidence_state,'WAITING_SCOPE');assert.equal(result.settlement.evidence_conflicts,0);
  assert.ok(result.priorities.some(row=>row.code==='SETTLEMENT_PUBLICATION_WAITING'&&row.severity==='WORKING'));
  assert.ok(!result.priorities.some(row=>row.code==='SETTLEMENT_EVIDENCE_CONFLICT'));
  assert.notEqual(result.hermes.status,'BLOCKED');assert.equal(result.agents.find(row=>row.id==='auditor').status,'WORKING');
 }
});

test('same-publication duplicate contradictions block without overwriting saved evidence',()=>{
 const input={...settlementFixture(),day:day(),month:month()},rows=input.reconciliation.money[0].money.payouts;
 rows.push({...rows[0],adjustment_cents:-100,after_adjustment_repass_cents:7900});
 const result=buildMlsAgentRegistry(input);
 assert.equal(result.settlement.evidence_state,'CONFLICT');assert.equal(result.settlement.duplicate_conflicts,1);assert.equal(result.settlement.evidence_conflicts,1);
 assert.equal(result.health,'BLOCKED');assert.equal(result.hermes.status,'BLOCKED');
 assert.match(result.settlement.basis,/NOT_BANK_RECEIPT/);
});

test('release counts and pending flags are fenced to the current publication even before Returns loads',()=>{
 const release=releases({report:{report:{pending:['RELEASE_IDENTITY_AMBIGUOUS','RELEASE_AMOUNT_UNVERIFIED']}}});
 for(const current of [month({audit_scope:null}),month({audit_scope:{...month().audit_scope,publication_revision:5}})]){
  const result=buildMlsAgentRegistry({day:day(),month:current,releases:release});
  assert.equal(result.settlement.evidence_state,'WAITING_SCOPE');assert.equal(result.settlement.release_orders_known,null);assert.equal(result.settlement.releases_verified,null);
  assert.ok(!result.priorities.some(row=>['RELEASE_IDENTITY_AMBIGUOUS','RELEASE_AMOUNT_UNVERIFIED','RELEASES_NOT_LOCATED'].includes(row.code)));
  assert.ok(result.priorities.some(row=>row.code==='SETTLEMENT_PUBLICATION_WAITING'));
 }
 const valid=buildMlsAgentRegistry({day:day(),month:month(),releases:release});
 assert.equal(valid.settlement.release_orders_known,250);assert.equal(valid.settlement.releases_verified,198);
 assert.ok(valid.priorities.some(row=>row.code==='RELEASE_IDENTITY_AMBIGUOUS'));
});


test('overdue and due-today owner expenses become MLS Finance attention without changing the month balance',()=>{
 const expense_schedule={schema:'expense_schedule_v1',month:'2026-10',today:'2026-10-27',status:'AVAILABLE',mode:'CONFIRMED',open_count:4,open_cents:100000,overdue_count:2,overdue_cents:50000,due_today_count:1,due_today_cents:20000,due_next_7_days_count:1,due_next_7_days_cents:30000,next_due_date:'2026-10-27',next_due_count:1,next_due_cents:20000,upcoming:[],basis:'OWNER_DECLARED_DUE_DATES_NOT_BANK_SETTLEMENT'};
 const value=buildMlsAgentRegistry({day:day(),month:month({expense_schedule}),now:1793080100}),finance=value.agents.find(agent=>agent.id==='finance');
 assert.equal(value.health,'ATTENTION');assert.equal(finance.status,'ATTENTION');assert.equal(finance.metric,240000);
 assert.ok(value.priorities.some(item=>item.code==='EXPENSES_OVERDUE'&&item.agent_id==='finance'));
 assert.ok(value.priorities.some(item=>item.code==='EXPENSES_DUE_TODAY'&&item.agent_id==='finance'));
 assert.equal(value.expenses.overdue_cents,50000);assert.equal(value.expenses.due_today_cents,20000);assert.equal(value.expenses.next_due_date,'2026-10-27');assert.match(value.expenses.basis,/NOT_BANK_SETTLEMENT/);
 assert.match(finance.message,/2 conta\(s\) atrasada/);assert.notEqual(value.month.balance_cents,value.expenses.overdue_cents);
});

test('upcoming expenses are working state, while an unknown schedule never fabricates zero',()=>{
 const schedule={schema:'expense_schedule_v1',month:'2026-10',today:'2026-10-27',status:'AVAILABLE',mode:'CONFIRMED',open_count:1,open_cents:30000,overdue_count:0,overdue_cents:0,due_today_count:0,due_today_cents:0,due_next_7_days_count:1,due_next_7_days_cents:30000,next_due_date:'2026-10-30',next_due_count:1,next_due_cents:30000,upcoming:[],basis:'OWNER_DECLARED_DUE_DATES_NOT_BANK_SETTLEMENT'};
 const working=buildMlsAgentRegistry({day:day(),month:month({expense_schedule:schedule})});assert.equal(working.health,'WORKING');assert.equal(working.agents.find(agent=>agent.id==='finance').status,'WORKING');assert.ok(working.priorities.some(item=>item.code==='EXPENSES_DUE_SOON'));
 const unknown=buildMlsAgentRegistry({day:day(),month:month({expense_schedule:null})});assert.equal(unknown.expenses.open_cents,null);assert.equal(unknown.expenses.overdue_count,null);assert.equal(unknown.expenses.next_due_date,null);
});

test('Pending audit stays passive until the local detail is opened and never fabricates a receivable total',()=>{
 const overview={schema:'mls_income_overview_snapshot_v1',checked_at:1793080000,status:'AVAILABLE',pending_cents:32145,released_cents:99999,currency_basis:'FIXED_BRAZIL_SHOP_PROFILE',basis:'CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'};
 const audit=buildPendingIncomeAudit({overview,detail:null,detailLoaded:false});
 assert.equal(audit.state,'DETAIL_NOT_LOADED');assert.equal(audit.pending_cents,32145);assert.equal(audit.visible_estimated_cents,null);assert.equal(audit.comparable,false);assert.match(audit.basis,/DESCRIPTIVE_ONLY/);
 const value=buildMlsAgentRegistry({day:day(),month:month(),incomeOverview:overview,pendingAudit:audit,now:1793080100});
 assert.ok(!value.priorities.some(item=>item.code.startsWith('PENDING_DETAIL_')),'closed optional detail cannot create D1-driven work');
 assert.equal(value.income.audit.state,'DETAIL_NOT_LOADED');
});

test('Pending audit marks has_more as partial and keeps the visible subtotal separate from the Overview amount',()=>{
 const overview={schema:'mls_income_overview_snapshot_v1',checked_at:1793080000,status:'AVAILABLE',pending_cents:10000,released_cents:0,currency_basis:'FIXED_BRAZIL_SHOP_PROFILE',basis:'CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'};
 const detail={schema:'mls_income_detail_snapshot_v1',checked_at:1793080060,status:'AVAILABLE',returned_count:2,has_more:true,rows:[
  {order_hash:'a'.repeat(64),estimated_escrow_cents:4751},
  {order_hash:'b'.repeat(64),estimated_escrow_cents:2500}
 ],basis:'CURRENT_PENDING_PROVIDER_INCOME_DETAIL_NOT_MONTH_OR_BANK_RECEIPT'};
 const audit=buildPendingIncomeAudit({overview,detail,detailLoaded:true});assert.equal(audit.state,'PARTIAL_PAGE');assert.equal(audit.returned_count,2);assert.equal(audit.unique_orders,2);assert.equal(audit.visible_estimated_cents,7251);assert.equal(audit.difference_cents,null);assert.equal(audit.comparable,false);
 const value=buildMlsAgentRegistry({day:day(),month:month(),incomeOverview:overview,pendingAudit:audit});assert.equal(value.health,'WORKING');assert.ok(value.priorities.some(item=>item.code==='PENDING_DETAIL_PARTIAL'&&item.agent_id==='finance'));assert.notEqual(value.month.balance_cents,audit.visible_estimated_cents);
});

test('complete Pending snapshots can describe match or difference without calling either one a monthly balance',()=>{
 const overview={schema:'mls_income_overview_snapshot_v1',checked_at:1793080000,status:'AVAILABLE',pending_cents:10000,released_cents:0,currency_basis:'FIXED_BRAZIL_SHOP_PROFILE',basis:'CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'};
 const base={schema:'mls_income_detail_snapshot_v1',checked_at:1793080060,status:'AVAILABLE',returned_count:2,has_more:false,rows:[
  {order_hash:'a'.repeat(64),estimated_escrow_cents:6000},
  {order_hash:'b'.repeat(64),estimated_escrow_cents:4000}
 ],basis:'CURRENT_PENDING_PROVIDER_INCOME_DETAIL_NOT_MONTH_OR_BANK_RECEIPT'};
 const match=buildPendingIncomeAudit({overview,detail:base,detailLoaded:true});assert.equal(match.state,'OBSERVED_MATCH');assert.equal(match.visible_estimated_cents,10000);assert.equal(match.difference_cents,0);assert.equal(match.comparable,true);
 const different=buildPendingIncomeAudit({overview,detail:{...base,rows:[base.rows[0],{...base.rows[1],estimated_escrow_cents:3500}]},detailLoaded:true});assert.equal(different.state,'OBSERVED_DIFFERENT');assert.equal(different.visible_estimated_cents,9500);assert.equal(different.difference_cents,-500);assert.equal(different.comparable,true);
 const value=buildMlsAgentRegistry({day:day(),month:month(),incomeOverview:overview,pendingAudit:different});assert.equal(value.health,'WORKING');assert.ok(value.priorities.some(item=>item.code==='PENDING_BASES_DIFFER'&&item.severity==='WORKING'));assert.match(value.priorities.find(item=>item.code==='PENDING_BASES_DIFFER').detail,/não erro contábil nem saldo mensal/i);
});

test('older or non-convertible Pending detail suspends monetary comparison instead of forcing zero or rounding',()=>{
 const overview={schema:'mls_income_overview_snapshot_v1',checked_at:1793080100,status:'AVAILABLE',pending_cents:10000,released_cents:0,currency_basis:'FIXED_BRAZIL_SHOP_PROFILE',basis:'CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'};
 const stale=buildPendingIncomeAudit({overview,detail:{schema:'mls_income_detail_snapshot_v1',checked_at:1793080000,status:'AVAILABLE',returned_count:1,has_more:false,rows:[{order_hash:'a'.repeat(64),estimated_escrow_cents:10000}],basis:'CURRENT_PENDING_PROVIDER_INCOME_DETAIL_NOT_MONTH_OR_BANK_RECEIPT'},detailLoaded:true});
 assert.equal(stale.state,'DETAIL_OLDER_THAN_OVERVIEW');assert.equal(stale.comparable,false);assert.equal(stale.difference_cents,null);
 const partial=buildPendingIncomeAudit({overview,detail:{schema:'mls_income_detail_snapshot_v1',checked_at:1793080200,status:'AVAILABLE',returned_count:1,has_more:false,rows:[{order_hash:'a'.repeat(64),estimated_escrow_cents:null}],basis:'CURRENT_PENDING_PROVIDER_INCOME_DETAIL_NOT_MONTH_OR_BANK_RECEIPT'},detailLoaded:true});
 assert.equal(partial.state,'AMOUNT_PARTIAL');assert.equal(partial.known_amount_rows,0);assert.equal(partial.unknown_amount_rows,1);assert.equal(partial.visible_estimated_cents,0);assert.equal(partial.comparable,false);
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

test('command center has six static observer cards even when hydration scripts do not run',()=>{
 const html=commandCenterBody();
 const cards=[...html.matchAll(/data-agent-placeholder="true"/g)];
 assert.equal(cards.length,6);
 for(const name of ['MLS Hermes','MLS Finance','MLS Ads','MLS Products','MLS Production','MLS Returns'])assert.match(html,new RegExp('<h4>'+name+'</h4>'));
 assert.match(html,/Aguardando dados/);
 assert.match(html,/Nenhum valor é presumido/);
 assert.doesNotMatch(html,/R\\$ [1-9]\\d*,\\d{2}/);
});

test('agent registry starts from null month without accessing expense_schedule or hiding observer cards',()=>{
 const noData=buildMlsAgentRegistry();
 assert.equal(noData.schema,'mls_agent_registry_v1');
 assert.equal(noData.mode,'OBSERVER');
 assert.equal(noData.month.balance_cents,null);
 assert.equal(noData.expenses.status,null);
 assert.equal(noData.health,'WORKING');
 assert.equal(noData.agents.length,6);
 assert.equal(noData.hermes.status,'WORKING');
 for(const agent of noData.agents)assert.equal(agent.status,'WORKING');
 assert.equal(noData.day.net_cents,null);
 const dayOnly=buildMlsAgentRegistry({day:day()});
 assert.equal(dayOnly.day.net_cents,25000);
 assert.equal(dayOnly.expenses.open_cents,null);
 assert.equal(dayOnly.agents.find(agent=>agent.id==='finance').status,'WORKING');
 const emptyMonth=buildMlsAgentRegistry({month:month({expense_schedule:null})});
 assert.equal(emptyMonth.expenses.status,null);
 assert.equal(emptyMonth.agents.length,6);
});

test('Pending detail moves to Finance while overview only provides dedicated panel links',()=>{
 const home=commandCenterBody(),details=pendingIncomeBody();
 assert.doesNotMatch(home,/id="commandPendingIncomeDetails"/);
 assert.match(details,/id="commandPendingIncomeDetails"/);
 for(const id of ['finance','ads','products','production','returns','auditor'])assert.match(home,new RegExp('href="/admin\\?tab=agent-'+id+'"'));
 assert.match(AGENT_REGISTRY_CLIENT,/data|missionOpen/);
 assert.doesNotMatch(AGENT_REGISTRY_CLIENT,/\bfetch\s*\(/);
});


test('catalog and DTF adapters update observer registry without borrowing financial quantities',()=>{
 const catalog={schema:'mls_agent_catalog_snapshot_v1',total:294,indexed:275,pending_catalog:19,checked_at:1793200000,discovery_status:'RUNNING'};
 const productionPeriod={schema:'mls_agent_production_period_v1',reference_month:'2026-10',state:'PARTIAL',eligible_orders:63,total_units:137,known_units:120,pending_units:17,known_cost_cents:185000,cost_cents:null,checked_at:1793200000,source_checked_at:1793199000};
 const dtfQueue={schema:'mls_agent_dtf_queue_v1',line_count:14,pending_lines:5,reserved_lines:3,produced_lines:4,blocked_lines:2,batch_count:2};
 const result=buildMlsAgentRegistry({day:day(),month:month(),catalog,productionPeriod,dtfQueue});
 assert.equal(result.sources.catalog.total,294);
 assert.equal(result.sources.catalog.pending_catalog,19);
 assert.equal(result.sources.production_period.eligible_orders,63);
 assert.equal(result.sources.production_period.known_cost_cents,185000);
 assert.equal(result.sources.dtf_queue.pending_lines,5);
 assert.equal(result.agents.find(item=>item.id==='products').secondary_metric,294);
 assert.equal(result.agents.find(item=>item.id==='production').secondary_metric,5);
 assert.equal(result.agents.find(item=>item.id==='production').secondary_metric_kind,'lines');
 assert.equal(result.agents.find(item=>item.id==='production').metric,month().production_coverage.known_units);
});
test('invalid and mismatched source snapshots cannot cross fiscal month or invent available data',()=>{
 const result=buildMlsAgentRegistry({month:month(),catalog:{schema:'untrusted',total:999},productionPeriod:{schema:'mls_agent_production_period_v1',reference_month:'2026-09',eligible_orders:100},dtfQueue:{schema:'wrong',pending_lines:100}});
 assert.equal(result.sources.catalog,null);
 assert.equal(result.sources.production_period,null);
 assert.equal(result.sources.dtf_queue,null);
 assert.equal(result.agents.find(item=>item.id==='products').secondary_metric,null);
});
test('registry browser reads existing specialist caches and supports no-network change notification',()=>{
 for(const token of ['brazaSavedCatalog?.getSnapshot','brazaProductionCostPeriods?.getSnapshot','brazaDtfWorkspace?.getSnapshot','notify:queue'])assert.ok(AGENT_REGISTRY_CLIENT.includes(token),token);
 assert.equal(AGENT_REGISTRY_CLIENT.includes('fetch('),false);
 assert.equal(AGENT_REGISTRY_CLIENT.includes('setInterval('),false);
});


test('an unloaded monthly placeholder cannot mark agents healthy or report zero returns',()=>{
 const empty={schema:'mls_month_snapshot_v1',month:'2026-10',status:null,checked_at:null,balance_cents:null,pending:[],coverage:null,production_coverage:null};
 const result=buildMlsAgentRegistry({month:empty});
 assert.equal(result.health,'WORKING');
 assert.equal(result.hermes.status,'WORKING');
 assert.ok(result.agents.every(agent=>agent.status!=='HEALTHY'));
 assert.equal(result.agents.find(agent=>agent.id==='returns').metric,null);
 assert.match(result.agents.find(agent=>agent.id==='returns').message,/Aguardando a base mensal validada/);
});
test('overview reports a source-state panel rather than treating unknown sales as zero',()=>{
 const html=commandCenterBody();
 for(const id of ['missionSourceState','missionSourceTitle','missionSourceDescription','missionSourceRetry'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(AGENT_REGISTRY_CLIENT,/paintSourceState/);
 assert.match(AGENT_REGISTRY_CLIENT,/selectMonth/);
 assert.doesNotMatch(AGENT_REGISTRY_CLIENT,/\bfetch\s*\(|setInterval\s*\(/);
});

test('daily subtotal before unconfirmed expenses remains separate from profit, margin and monthly balance',()=>{
 const presentation={schema:'daily_profit_presentation_v1',state:'BEFORE_MONTHLY_COSTS',basis:'BEFORE_UNCONFIRMED_EXPENSES',amount_cents:9947,monthly_costs_missing:['EXTERNAL_EXPENSES_REQUIRED'],das_included:true,expenses_included:false};
 const input={day:day({date:'2026-11-01',net_cents:null,net_basis:null,sales_cents:58939,ads_spend_cents:2845,paid_orders:9,pending:['EXTERNAL_EXPENSES_REQUIRED'],presentation}),month:month({month:'2026-11',balance_cents:null,pending:['EXTERNAL_EXPENSES_REQUIRED']})};
 const value=buildMlsAgentRegistry(input);
 assert.equal(value.day.net_cents,null);assert.equal(value.day.margin_bps,null);assert.equal(value.month.balance_cents,null);
 assert.equal(value.day.presentation.amount_cents,9947);assert.deepEqual(value.day.pending,['EXTERNAL_EXPENSES_REQUIRED']);
 assert.ok(Object.isFrozen(value.day.presentation)&&Object.isFrozen(value.day.presentation.monthly_costs_missing));
 for(const change of [{basis:'AFTER_DAILY_AND_ALLOCATED_MONTHLY_COSTS'},{monthly_costs_missing:[]},{expenses_included:true},{amount_cents:Infinity},{state:'ESTIMATE'}]){
  assert.equal(buildMlsAgentRegistry({...input,day:{...input.day,presentation:{...presentation,...change}}}).day.presentation,null,'invalid local presentation metadata must fail closed');
 }
 assert.equal(buildMlsAgentRegistry({...input,day:{...input.day,pending:[]}}).day.presentation,null,'a subtotal must retain its missing-expense reason');
});

test('validated month without an observed selected day does not imply current-day agent health',()=>{
 const pendingDay={schema:'mls_day_snapshot_v1',date:'2026-10-28',state:'PENDING',net_cents:null,net_basis:null,sales_cents:null,ads_spend_cents:null,paid_orders:null,pending:[]};
 const result=buildMlsAgentRegistry({day:pendingDay,month:month()});
 assert.equal(result.health,'WORKING');
 assert.equal(result.agents.find(agent=>agent.id==='finance').status,'WORKING');
 assert.equal(result.agents.find(agent=>agent.id==='ads').status,'WORKING');
 assert.equal(result.hermes.status,'WORKING');
 assert.equal(result.day.net_cents,null);
});

test('finance authorization recovery is visible only for the exact validated auth error and never refreshes tokens implicitly',()=>{
 const html=commandCenterBody();
 assert.match(html,/id="missionFinanceAuthRecovery" hidden/);
 assert.match(html,/https:\/\/auth\.brazacommerce\.com\.br\/shopee\/finance\/status/);
 assert.match(html,/https:\/\/auth\.brazacommerce\.com\.br\/shopee\/finance\/connect/);
 assert.match(html,/target="_blank" rel="noopener noreferrer"/);
 assert.match(AGENT_REGISTRY_CLIENT,/coverage\?\.collection_code!=='BUSINESS_PERIOD_AUTH_REQUIRED'/);
 assert.doesNotMatch(AGENT_REGISTRY_CLIENT,/\bfetch\s*\(|\bsetInterval\s*\(|\/api\/admin\/finance\/auth/);
});

test('owner on-demand finance diagnostic stays in signed same-origin client, never reads at startup or leaks tokens',()=>{
 const html=commandCenterBody();
 for(const id of ['missionSourceInspect','missionInlineDiagnostic','missionInlineDiagnosticResult','missionInlineDiagnosticLogin'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(ADMIN_CLIENT,/mlsFinanceSyncInspector=Object\.freeze/);
 assert.match(ADMIN_CLIENT,/adminRequest\('finance\/sync-state',undefined,\{timeoutMs:15000\}\)/);
 assert.match(ADMIN_CLIENT,/schema:'mls_owner_finance_sync_diagnostic_v1'/);
 assert.match(AGENT_REGISTRY_CLIENT,/inspect\.onclick=async\(\)=>/);
 assert.match(AGENT_REGISTRY_CLIENT,/error\?\.status===401/);
 assert.match(AGENT_REGISTRY_CLIENT,/diagnosticLogin\.hidden=false/);
 assert.doesNotMatch(AGENT_REGISTRY_CLIENT,/\bfetch\s*\(|\bsetInterval\s*\(/);
 assert.doesNotMatch(ADMIN_CLIENT.slice(ADMIN_CLIENT.indexOf('mlsFinanceSyncInspector'),ADMIN_CLIENT.indexOf('function notice')),/access_token|refresh_token|FINANCE_TOKEN_ENCRYPTION_KEY|FINANCE_ROUTER_SECRET/);
});
