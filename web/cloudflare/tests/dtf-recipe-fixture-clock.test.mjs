import test from 'node:test';
import assert from 'node:assert/strict';
import {dtfRecipeFixture} from './dtf-recipe-fixture.mjs';
for(const [at,day,start] of [[Date.UTC(2027,0,2,3,0,15),'2027-01-02',Date.UTC(2027,0,2,3)],[Date.UTC(2027,0,2,2,59,15),'2027-01-01',Date.UTC(2027,0,1,3)]])test('native DTF synthetic source follows the requested Brasilia day across midnight '+day,async()=>{
 const f=await dtfRecipeFixture({count:1,at});try{
  const result=await f.source(null,{operation:'scan',start_date:day,end_date:day});assert.equal(result.orders.length,1);assert.ok(result.orders[0].create_time>=start/1000);assert.ok(result.orders[0].update_time>=result.orders[0].create_time);assert.ok(result.orders[0].update_time<=Math.floor(at/1000));assert.equal((await f.read()).lines.length,1,'initial sync and subsequent browser source use the same date');
  assert.equal((await f.source(null,{operation:'scan',start_date:'2026-11-16',end_date:'2026-11-16'})).orders.length,0,'source cannot silently revert to the old hard-coded browser date');
 }finally{f.close();}
});
