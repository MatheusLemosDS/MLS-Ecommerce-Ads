import test from 'node:test';
import assert from 'node:assert/strict';
import {readHistoricalCostSchedule} from '../src/business-cost-history.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';

// Synthetic D1 audit only: no accounts, orders, cash or provider calls.
const when=(day,hour='12:00:00')=>day+'T'+hour+'.000Z';
const history=entries=>entries.map((entry,index)=>({revision:index+1,payload:JSON.stringify(entry.payload),created_at:entry.at}));
const costAt=(amount)=>({...COST_DEFAULTS,inclusive_regular_cents:amount});
const costs=history([{at:when('2026-11-01'),payload:costAt(1000)},{at:when('2026-11-14','17:00:00'),payload:costAt(1200)}]);
const rules=history([{at:when('2026-11-01'),payload:{rules:[]}}]);
const bindings=history([{at:when('2026-11-01'),payload:[{item_id:'123',model_id:'1',size:'M',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}]}]);
const current=(prices=costs)=>({
 costs:{revision:prices.length,payload:prices.at(-1).payload,updated_at:prices.at(-1).created_at},
 rules:{revision:1,payload:rules[0].payload,updated_at:rules[0].created_at},
 bindings:{revision:1,payload:bindings[0].payload,updated_at:bindings[0].created_at},
});
const db=(costRows=costs)=>({
 prepare:sql=>({sql}),
 batch:async statements=>statements.map(({sql})=>({results:sql.includes('production_costs_audit')?costRows:sql.includes('production_cost_rules_audit')?rules:bindings})),
});
const line=()=>({item_id:'123',model_id:'1',quantity:1});
const day=date=>({date,items:[line()]});
const options=(dates,costRows=costs)=>({
 month:null,
 stamp:Date.parse('2026-11-19T18:00:00Z')/1000,
 frames:[{end_date:dates.at(-1),daily_breakdown:{days:dates.map(day),undated:{coverage:{orders:0}}}}],
 items:[{item_id:'123',model_id:'1',quantity:dates.length}],
 current:current(costRows),
 ruleSnapshot:[{results:[{revision:1,payload:rules[0].payload,updated_at:rules[0].created_at}]}],
 classification:{revision:1,bindings:[],products:[],variants:[]},
});

test('same SKU is correctly valued before and after a rate change',async()=>{
 const value=await readHistoricalCostSchedule(db(),options(['2026-11-13','2026-11-15']));
 assert.equal(value.state,'AVAILABLE');
 assert.deepEqual(value.days.map(row=>row.production_cost_cents),[1000,1200]);
 assert.equal(value.production_cost_cents,2200);
 assert.equal(value.known_production_cost_cents,2200);
 assert.deepEqual(value.unmapped_variants,[]);
});

test('ambiguous change day stays pending; do not fabricate its price',async()=>{
 const value=await readHistoricalCostSchedule(db(),options(['2026-11-13','2026-11-14','2026-11-15']));
 assert.equal(value.state,'AVAILABLE');
 assert.deepEqual(value.days.map(row=>row.production_cost_cents),[1000,null,1200]);
 assert.equal(value.days[1].pending_units,1);
 assert.equal(value.known_production_cost_cents,2200);
 assert.equal(value.production_cost_cents,null);
 assert.deepEqual(value.unmapped_variants,[{item_id:'123',model_id:'1',quantity:1}]);
});

test('broken audited history returns unavailable instead of newest cost',async()=>{
 const missing=[costs[1]];
 const value=await readHistoricalCostSchedule(db(missing),options(['2026-11-13','2026-11-15']));
 assert.equal(value.state,'UNAVAILABLE');
});

test('missing initial prior revision remains unknown',async()=>{
 const value=await readHistoricalCostSchedule(db(),options(['2026-10-01','2026-11-13']));
 assert.equal(value.state,'AVAILABLE');
 assert.equal(value.days[0].production_cost_cents,null);
 assert.equal(value.days[1].production_cost_cents,1000);
});
