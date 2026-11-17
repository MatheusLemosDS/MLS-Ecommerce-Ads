import test from 'node:test';
import assert from 'node:assert/strict';
import {MONTHLY_THROUGHPUT_WINDOWS,monthlySourceThroughputFixture} from './monthly-source-throughput-fixture.mjs';

test('a 308-order historical source at 50-minute steps is evicted by the existing 60-run cleanup before its 16th page',async t=>{
 const f=await monthlySourceThroughputFixture(t),window=MONTHLY_THROUGHPUT_WINDOWS[1];let frame=await f.at(0,{operation:'start',start_date:window.start_date,end_date:window.end_date});const run_id=frame.run_id;
 for(let page=1;page<=15;page++){frame=await f.at(page*50,{operation:'step',run_id});assert.equal(frame.status,'RUNNING');assert.equal(frame.pages_read,page);assert.equal(frame.coverage.orders,page*20);}
 assert.equal(f.exists(run_id),true);assert.equal(frame.coverage.orders,300);
 await f.advanceTo(780);assert.equal(f.exists(run_id),false,'the60th new control source evicts the oldest unleased historical run at13h in this explicit synthetic turnover case');
 assert.equal(f.metrics.control_runs_created,60);assert.equal(f.metrics.max_run_count,60);
 await assert.rejects(()=>f.at(800,{operation:'step',run_id}),error=>error.code==='FINANCE_BUSINESS_RUN_NOT_FOUND'&&error.status===404);
 assert.equal(f.calls.payment,0);assert.equal(f.calls.external,0);assert.equal(f.calls.list,15);assert.equal(f.calls.detail,15);
});

for(const cadence of [18,24])test('a three-window synthetic cohort completes with retained real Finance sources and unchanged cap at '+cadence+'-minute source turns',async t=>{
 const f=await monthlySourceThroughputFixture(t),completed=[];let elapsed=0,turns=0;
 for(const window of MONTHLY_THROUGHPUT_WINDOWS){
  let frame=await f.at(elapsed,{operation:'start',start_date:window.start_date,end_date:window.end_date});turns++;
  while(frame.status==='RUNNING'){elapsed+=cadence;frame=await f.at(elapsed,{operation:'step',run_id:frame.run_id});turns++;assert.ok(turns<=26,'the no-retry fixture completes with the exact bounded26 source turns');}
  assert.equal(frame.status,'COMPLETE');assert.equal(frame.coverage.orders,window.orders);assert.equal(frame.pages_read,Math.max(1,Math.ceil(window.orders/20)));completed.push(frame);elapsed+=cadence;
 }
 const finished=elapsed-cadence;assert.equal(turns,26);assert.equal(finished,25*cadence);assert.ok(finished<780);assert.ok(completed.every(frame=>f.exists(frame.run_id)),'all three exact sources still exist when the coherent synthetic cohort finishes');assert.equal(completed.reduce((sum,frame)=>sum+frame.coverage.orders,0),421);assert.ok(f.metrics.max_run_count<=60);assert.equal(f.calls.list,23);assert.equal(f.calls.detail,22);assert.equal(f.calls.payment,0);assert.equal(f.calls.external,0);
});
