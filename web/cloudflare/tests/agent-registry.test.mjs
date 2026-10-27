import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMlsAgentRegistry} from '../src/agent-registry.mjs';

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
