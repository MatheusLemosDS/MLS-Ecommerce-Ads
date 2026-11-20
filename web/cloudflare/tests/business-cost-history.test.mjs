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

// All added scenarios are deterministic synthetic snapshots. They never read
// the owner's account or interpret these prices as physical manufacturing.
const fixture=(dates,{costRows=costs,ruleRows=rules,bindingRows=bindings,groups=dates.map(day)}={})=>{
 const tip=rows=>({revision:rows.at(-1).revision,payload:rows.at(-1).payload,updated_at:rows.at(-1).created_at});
 const totals=new Map();
 for(const group of groups)for(const item of group.items){const id=item.item_id+':'+item.model_id,old=totals.get(id);totals.set(id,{...item,quantity:(old?.quantity||0)+item.quantity});}
 const queries=[],input={month:null,stamp:Date.parse('2026-11-19T18:00:00Z')/1000,frames:[{end_date:dates.at(-1),daily_breakdown:{days:groups,undated:{coverage:{orders:0}}}}],items:[...totals.values()],current:{costs:tip(costRows),rules:tip(ruleRows),bindings:tip(bindingRows)}};
 const database={prepare:sql=>{queries.push(sql);return {sql};},batch:async statements=>statements.map(({sql})=>({results:sql.includes('production_costs_audit')?costRows:sql.includes('production_cost_rules_audit')?ruleRows:bindingRows}))};
 return {input,database,queries};
};

test('a single audited revision proves only days after its first timestamp',async()=>{
 const f=fixture(['2026-10-31','2026-11-01','2026-11-02'],{costRows:[costs[0]]});
 const value=await readHistoricalCostSchedule(f.database,f.input);
 assert.equal(value.state,'AVAILABLE');
 assert.deepEqual(value.days.map(row=>row.production_cost_cents),[null,null,1000]);
 assert.equal(value.production_cost_cents,null);
 assert.deepEqual(value.day_evidence.map(row=>row.pending),[['AUDIT_PRIOR_MISSING'],['AUDIT_DAY_AMBIGUOUS'],[]]);
 assert.deepEqual(value.audit_scope,{costs_revision:1,cost_rules_revision:1,bindings_revision:1});
});

test('missing audit access or rows at revision one never fall back to current costs',async()=>{
 const f=fixture(['2026-11-13'],{costRows:[costs[0]]});
 const denied={prepare:sql=>({sql}),batch:async()=>{throw Error('synthetic-read-denied');}};
 assert.deepEqual(await readHistoricalCostSchedule(denied,f.input),{state:'UNAVAILABLE',reason:'AUDIT_UNAVAILABLE'});
 const empty={prepare:sql=>({sql}),batch:async statements=>statements.map(()=>({results:[]}))};
 assert.deepEqual(await readHistoricalCostSchedule(empty,f.input),{state:'UNAVAILABLE',reason:'AUDIT_INVALID'});
});

test('current catalogue and classification cannot supply an unaudited past identity',async()=>{
 const emptyBindings=history([{at:when('2026-11-01'),payload:[]}]),f=fixture(['2026-11-13'],{bindingRows:emptyBindings});
 Object.defineProperty(f.input,'classification',{get:()=>{throw Error('current classification must not be consulted');}});
 Object.defineProperty(f.input,'ruleSnapshot',{get:()=>{throw Error('current catalogue must not be consulted');}});
 const value=await readHistoricalCostSchedule(f.database,f.input);
 assert.equal(value.state,'AVAILABLE');assert.equal(value.production_cost_cents,null);
 assert.equal(value.known_production_cost_cents,0);assert.equal(value.days[0].pending_units,1);
 assert.deepEqual(value.day_evidence[0].pending,['IDENTITY_OR_COST_UNPROVEN']);
});

test('an automatic binding without dated manual confirmation is not historical identity proof',async()=>{
 const bindingRows=history([{at:when('2026-11-01'),payload:[{item_id:'123',model_id:'1',size:'M',selling_unit:'SINGLE_GARMENT',operator_confirmed:false,source:'CATALOG_SIZE_AXIS',catalog_fingerprint:'a'.repeat(64)}]}]);
 const f=fixture(['2026-11-13'],{bindingRows}),value=await readHistoricalCostSchedule(f.database,f.input);
 assert.equal(value.production_cost_cents,null);assert.equal(value.days[0].known_units,0);assert.equal(value.days[0].pending_units,1);
});

test('audited explicit child assignments replay their rule price without current catalogue inference',async()=>{
 const values=unit=>({rules:[{id:'infantil',label:'Camiseta infantil',enabled:true,unit_cost_cents:unit,name_patterns:['infantil'],exclude_terms:[],axis_names:['Tamanho'],options:['4','6']}],assignments:[{item_id:'123',model_id:'1',rule_id:'infantil',size:'4'}]});
 const ruleRows=history([{at:when('2026-11-01'),payload:values(1350)},{at:when('2026-11-14','17:00:00'),payload:values(1300)}]);
 const f=fixture(['2026-11-13','2026-11-14','2026-11-15'],{costRows:[costs[0]],ruleRows,bindingRows:history([{at:when('2026-11-01'),payload:[]}])});
 const value=await readHistoricalCostSchedule(f.database,f.input);
 assert.deepEqual(value.days.map(row=>row.production_cost_cents),[1350,null,1300]);
 assert.equal(value.known_production_cost_cents,2650);assert.equal(value.mixed_variants,1);
 assert.deepEqual(value.day_evidence.map(row=>row.cost_rules_revision),[1,null,2]);
});

test('audited custom profiles retain exact day prices instead of a fictitious monthly unit average',async()=>{
 const prices=unit=>({...costAt(1000),custom_profiles:[{id:'calca',label:'Calça',unit_cost_cents:unit}],custom_assignments:[{item_id:'123',model_id:'1',profile_id:'calca'}]});
 const costRows=history([{at:when('2026-11-01'),payload:prices(1447)},{at:when('2026-11-14','17:00:00'),payload:prices(1497)}]);
 const f=fixture(['2026-11-13','2026-11-15'],{costRows,bindingRows:history([{at:when('2026-11-01'),payload:[]}])}),value=await readHistoricalCostSchedule(f.database,f.input);
 assert.deepEqual(value.days.map(row=>row.production_cost_cents),[1447,1497]);
 assert.equal(value.production_cost_cents,2944);assert.equal(value.mixed_variants,1);
 assert.ok(value.days.every(row=>!Object.hasOwn(row,'unit_cost_cents')));
});

test('a valid kit retains the full selling-unit cost above the individual component limit',async()=>{
 const costRows=history([{at:when('2026-11-01'),payload:costAt(1000000)}]),bindingRows=history([{at:when('2026-11-01'),payload:[{item_id:'123',model_id:'1',male_size:'P',female_size:'M',selling_unit:'ONE_MALE_ONE_FEMALE_KIT',operator_confirmed:true}]}]);
 const f=fixture(['2026-11-13'],{costRows,bindingRows}),value=await readHistoricalCostSchedule(f.database,f.input);
 assert.equal(value.production_cost_cents,2000000);assert.equal(value.days[0].known_units,1);assert.deepEqual(value.unmapped_variants,[]);
});

test('a monthly schedule conserves per-day cents, units, pending units and the input snapshot',async()=>{
 const dates=Array.from({length:17},(_,index)=>'2026-11-'+String(index+1).padStart(2,'0')),counts={13:3,14:2,15:4,16:1,17:2};
 const groups=dates.map(date=>({date,items:counts[Number(date.slice(8))]?[{...line(),quantity:counts[Number(date.slice(8))]}]:[]}));
 const f=fixture(dates,{groups});f.input.month='2026-11';const before=JSON.stringify(f.input);
 const value=await readHistoricalCostSchedule(f.database,f.input);
 assert.equal(JSON.stringify(f.input),before);assert.equal(value.days.length,17);
 assert.equal(value.production_cost_cents,null);assert.equal(value.known_production_cost_cents,11400);
 assert.equal(value.days.reduce((n,row)=>n+row.total_units,0),12);assert.equal(value.days.reduce((n,row)=>n+row.known_units,0),10);assert.equal(value.days.reduce((n,row)=>n+row.pending_units,0),2);
 assert.equal(value.days.reduce((n,row)=>n+row.known_production_cost_cents,0),value.known_production_cost_cents);
 assert.deepEqual(value.unmapped_variants,[{item_id:'123',model_id:'1',quantity:2}]);
 assert.equal(f.queries.length,3);assert.ok(f.queries.every(sql=>/^SELECT /.test(sql)&&/ORDER BY revision ASC LIMIT 129$/.test(sql)));
});

test('the actual recorded edit day, rather than an assumed earlier date, controls ambiguity',async()=>{
 const costRows=history([{at:when('2026-11-01'),payload:costAt(1000)},{at:when('2026-11-17','16:10:00'),payload:costAt(1200)}]);
 const f=fixture(['2026-11-13','2026-11-14','2026-11-15','2026-11-16','2026-11-17','2026-11-18'],{costRows}),value=await readHistoricalCostSchedule(f.database,f.input);
 assert.deepEqual(value.days.map(row=>row.production_cost_cents),[1000,1000,1000,1000,null,1200]);
 assert.deepEqual(value.day_evidence[4].pending,['AUDIT_DAY_AMBIGUOUS']);
});

test('day quantities must reconcile with the exact requested cohort, without undated or duplicate sources',async()=>{
 for(const mutate of [
  f=>f.input.items[0].quantity++,
  f=>f.input.frames[0].daily_breakdown.days.push(structuredClone(f.input.frames[0].daily_breakdown.days[0])),
  f=>f.input.frames[0].daily_breakdown.undated.coverage.orders=1,
  f=>f.input.frames[0].daily_breakdown.days[0].date='2026-11-31',
  f=>f.input.frames[0].daily_breakdown.days[0].date='2026-11-20',
  f=>f.input.month='2026-11',
 ]){
  const f=fixture(['2026-11-13']);mutate(f);assert.equal((await readHistoricalCostSchedule(f.database,f.input)).state,'UNAVAILABLE');
 }
});

const wideFixture=lastQuantity=>{
 const costRows=history([{at:when('2026-11-01'),payload:{...costAt(1000),custom_profiles:[{id:'uniforme',label:'Uniforme',unit_cost_cents:1000}],custom_assignments:[{item_id:'123',model_id:null,profile_id:'uniforme'}]}}]);
 const lines=Array.from({length:1001},(_,index)=>({item_id:'123',model_id:String(index),quantity:index===1000?lastQuantity:1}));
 return fixture(['2026-11-13'],{costRows,groups:[{date:'2026-11-13',items:lines}]});
};

test('more than one thousand variants use every audited pricing chunk without a current-cost fallback',async()=>{
 const f=wideFixture(1),value=await readHistoricalCostSchedule(f.database,f.input);
 assert.equal(value.production_cost_cents,1001000);assert.equal(value.days[0].known_units,1001);assert.deepEqual(value.unmapped_variants,[]);
});

test('a later pricing chunk failure cannot leak amounts priced from an incomplete replay',async()=>{
 const f=wideFixture(Math.floor(Number.MAX_SAFE_INTEGER/1000)+1),value=await readHistoricalCostSchedule(f.database,f.input);
 assert.equal(value.state,'AVAILABLE');assert.equal(value.production_cost_cents,null);
 assert.equal(value.known_production_cost_cents,0);assert.equal(value.days[0].known_units,0);
 assert.equal(value.days[0].pending_units,value.days[0].total_units);
 assert.deepEqual(value.day_evidence[0].pending,['AUDIT_PAYLOAD_INVALID']);
});
