import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedCostAudit,costAuditBeforeDay,historicalDayCosts} from '../src/historical-cost-timeline.mjs';

const stamp=(date,hour='12:00:00')=>date+'T'+hour+'.000Z';
const rows=[
 {revision:1,payload:'{"unit":1000}',created_at:stamp('2026-11-01')},
 {revision:2,payload:'{"unit":1200}',created_at:stamp('2026-11-14','17:00:00')},
 {revision:3,payload:'{"unit":1300}',created_at:stamp('2026-11-18','12:00:00')},
];
const state={revision:3,payload:rows[2].payload,updated_at:rows[2].created_at};

test('replay uses old cost before the edit and new cost afterward, not the current rule',()=>{
 const audit=checkedCostAudit(rows,state);
 assert.ok(audit);
 assert.equal(costAuditBeforeDay(audit,'2026-11-13').revision,1);
 assert.equal(costAuditBeforeDay(audit,'2026-11-15').revision,2);
 assert.equal(costAuditBeforeDay(audit,'2026-11-19').revision,3);
 assert.equal(costAuditBeforeDay(audit,'2026-10-31'),null);
});

test('a day containing a mid-day edit cannot be priced from day-aggregated orders',()=>{
 const audit=checkedCostAudit(rows,state);
 assert.equal(costAuditBeforeDay(audit,'2026-11-14'),null);
 assert.equal(costAuditBeforeDay(audit,'2026-11-18'),null);
});

test('cost audit day is interpreted in Sao Paulo, not UTC',()=>{
 const overnight=[{revision:1,payload:'{"unit":1000}',created_at:'2026-11-15T01:45:00.000Z'}];
 const audit=checkedCostAudit(overnight,{revision:1,payload:overnight[0].payload,updated_at:overnight[0].created_at});
 assert.equal(audit[0].day,'2026-11-14');
 assert.equal(costAuditBeforeDay(audit,'2026-11-14'),null);
 assert.equal(costAuditBeforeDay(audit,'2026-11-15').revision,1);
});

test('missing or corrupted revision history cannot invent a historic price',()=>{
 assert.equal(checkedCostAudit([],state),null);
 assert.equal(checkedCostAudit(rows,{...state,payload:'{}'}),null);
 assert.equal(checkedCostAudit([rows[0],rows[2]],state),null);
 assert.equal(checkedCostAudit(rows,{...state,updated_at:stamp('2026-11-19')}),null);
 assert.equal(costAuditBeforeDay(null,'2026-11-15'),null);
 assert.equal(costAuditBeforeDay(checkedCostAudit(rows,state),'2026-11-99'),null);
});

test('day-level totals preserve whole cent amounts across different prices',()=>{
 const items=[{item_id:'100',model_id:'1',quantity:3},{item_id:'100',model_id:'2',quantity:4}];
 const lookup=(id,model)=>model==='1'?1450:1497;
 assert.deepEqual(historicalDayCosts(items,lookup),{
  total_units:7,known_units:7,pending_units:0,known_production_cost_cents:10338,production_cost_cents:10338,
 });
 assert.deepEqual(historicalDayCosts(items,(_,model)=>model==='1'?1450:null),{
  total_units:7,known_units:3,pending_units:4,known_production_cost_cents:4350,production_cost_cents:null,
 });
});

test('unknown values never become zero or negative costs',()=>{
 const items=[{item_id:'1',model_id:'0',quantity:1}];
 assert.equal(historicalDayCosts(items,()=>0),null);
 assert.equal(historicalDayCosts(items,()=>-5),null);
 assert.equal(historicalDayCosts(items,()=>Number.MAX_SAFE_INTEGER),null);
 assert.deepEqual(historicalDayCosts([],()=>null),{total_units:0,known_units:0,pending_units:0,known_production_cost_cents:0,production_cost_cents:0});
});

test('an audit beyond its bounded or observed history cannot be promoted to proof',()=>{
 const many=Array.from({length:129},(_,index)=>({revision:index+1,payload:'{}',created_at:stamp('2026-11-01')}));
 assert.equal(checkedCostAudit(many,{revision:129,payload:'{}',updated_at:many.at(-1).created_at}),null);
 assert.equal(checkedCostAudit(rows,state,{stamp:Date.parse('2026-11-17T23:59:59Z')/1000}),null);
 assert.ok(checkedCostAudit(rows,state,{stamp:Date.parse('2026-11-19T00:00:00Z')/1000}));
});

test('timestamps need an explicit zone and real calendar date without normalization',()=>{
 for(const created_at of ['2026-11-01T12:00:00','2026-02-30T12:00:00Z','2026-11-01T24:00:00Z']){
  const invalid=[{revision:1,payload:'{}',created_at}];
  assert.equal(checkedCostAudit(invalid,{revision:1,payload:'{}',updated_at:created_at}),null);
 }
 const century=[{revision:1,payload:'{}',created_at:'2100-01-01T12:00:00.000Z'}],audit=checkedCostAudit(century,{revision:1,payload:'{}',updated_at:century[0].created_at});
 assert.equal(costAuditBeforeDay(audit,'2100-01-02').revision,1);
});

test('duplicate identities, unsafe products and invalid quantities cannot create a day total',()=>{
 const item={item_id:'1',model_id:'0',quantity:1};
 assert.equal(historicalDayCosts([item,item],()=>1000),null);
 assert.equal(historicalDayCosts([{...item,quantity:Number.MAX_SAFE_INTEGER}],()=>1000),null);
 assert.equal(historicalDayCosts([{...item,item_id:'../private'}],()=>1000),null);
 assert.equal(historicalDayCosts([{...item,quantity:0}],()=>1000),null);
});
