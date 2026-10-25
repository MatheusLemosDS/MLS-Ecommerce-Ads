import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {collectionFixture} from '../../cloudflare/tests/business-collection-fixture.mjs';
import {runFinanceEscrowReleases} from '../src/escrow-releases.mjs';
import {projectEscrowReleaseFrame} from '../src/escrow-release-frame.mjs';

const month='2026-10',path='/api/v2/payment/get_escrow_list';
async function fixture(t,{count=2,second=0,rows=null,income=null}={}){
 const f=await collectionFixture({allPaid:true,windowCounts:[count,second],paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 if(income)f.state.paymentHook=({index})=>f.provider({order_sn:f.serial(index),return_order_sn_list:[],order_income:{order_sn:f.serial(index),original_cost_of_goods_sold:65.25,escrow_amount:47.51,ads_escrow_top_up_fee_or_technical_support_fee:0,...income,items:[{item_id:f.item(index),model_id:0,line_item_id:index+1,quantity_purchased:1}]}});
 let frame=await f.invoke('start');for(let i=0;frame.status==='RUNNING'&&i<15;i++)frame=await f.invoke('step');assert.equal(frame.status,'COMPLETE');
 const sources=[...new Map(f.calls.financeFrames.filter(frame=>frame.status==='COMPLETE').map(frame=>[frame.run_id,{run_id:frame.run_id,source_revision:frame.revision}])).values()],calls=[];
 const releaseRows=rows??[{order_sn:f.serial(0),payout_amount:47.51,escrow_release_time:f.now()/1000-60}];
 const fetchImpl=async request=>{const url=new URL(request.url);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(url.pathname,path);assert.equal(request.method,'GET');assert.equal(request.headers.has('cookie'),false);calls.push(url);const from=Number(url.searchParams.get('release_time_from')),to=Number(url.searchParams.get('release_time_to'));return f.provider({escrow_list:releaseRows.filter(row=>row.escrow_release_time>=from&&row.escrow_release_time<=to),more:false});};
 const run=(operation='read',options={})=>runFinanceEscrowReleases(f.financeEnv,{operation,month,sources,fetchImpl,now:f.now,...options});
 async function finish(){let value;for(let i=0;i<12;i++){value=await run('step');assert.ok(projectEscrowReleaseFrame(value));if(value.calendar.status==='COMPLETE')return value;}throw Error('fixture calendar did not complete');}
 return {...f,sources,calls,run,finish,releaseRows,baseline:frame};
}

test('the release-date ledger matches exact paid order hashes without replacing the order-creation total or claiming bank receipts',async t=>{
 const f=await fixture(t),before=await f.run();assert.equal(f.calls.length,0);assert.equal(before.calendar.status,'MISSING');assert.equal(before.matching.paid_orders,2);
 const result=await f.finish();assert.equal(result.calendar.observations,1);assert.equal(result.calendar.verified_orders,1);assert.equal(result.calendar.total_release_cents,4751);assert.equal(result.matching.located_paid_orders,1);assert.equal(result.matching.unlocated_paid_orders,1);assert.equal(result.matching.expected_located_cents,4751);assert.equal(result.matching.verified_release_cents,4751);assert.equal(result.matching.comparison_difference_cents,0);assert.equal(result.status,'PARTIAL');assert.ok(result.pending.includes('MATCHING_INCOMPLETE'));assert.ok(result.pending.includes('BANK_RECEIPT_NOT_VERIFIED'));
 assert.equal(f.baseline.expected_repass_cents,9502);assert.equal(Object.hasOwn(result,'net_profit_cents'),false);assert.ok(!JSON.stringify(result).includes('PRIVATE_INTEGRATION_ORDER'));
 const count=f.calls.length;assert.deepEqual(await f.run(),result);assert.equal(f.calls.length,count,'owner reads never recollect the source');
});

test('raw currency and units are not inferred for unmatched, hundred-times, missing or sub-cent payout observations',async t=>{
 for(const amount of [4751,null,47.5101]){
  const f=await fixture(t);if(amount===null)delete f.releaseRows[0].payout_amount;else f.releaseRows[0].payout_amount=amount;
  const result=await f.finish();assert.equal(result.calendar.total_release_cents,null);assert.equal(result.calendar.verified_orders,0);assert.equal(result.matching.expected_located_cents,4751);assert.equal(result.matching.verified_release_cents,null);assert.equal(result.matching.comparison_difference_cents,null);assert.ok(result.pending.includes('RELEASE_AMOUNT_UNVERIFIED'));
 }
 const g=await fixture(t);g.releaseRows[0].order_sn='PRIVATE_OTHER_CREATION_COHORT';const outside=await g.finish();assert.equal(outside.matching.outside_cohort_orders,1);assert.equal(outside.calendar.total_release_cents,null);assert.equal(outside.matching.located_paid_orders,0);assert.equal(outside.matching.unlocated_paid_orders,2);
});

test('two owned observations for one order remain ambiguous even when their amounts and timestamps are identical',async t=>{
 const f=await fixture(t);f.releaseRows.push({...f.releaseRows[0]});const result=await f.finish();assert.equal(result.calendar.observations,2);assert.equal(result.calendar.unique_orders,1);assert.equal(result.calendar.ambiguous_orders,1);assert.equal(result.matching.located_paid_orders,0);assert.equal(result.matching.ambiguous_paid_orders,1);assert.equal(result.matching.unlocated_paid_orders,1);assert.equal(result.calendar.total_release_cents,null);assert.equal(result.matching.known_verified_release_cents,0);assert.ok(result.pending.includes('RELEASE_IDENTITY_AMBIGUOUS'));
});

test('coherent positive adjustments and explicit zero after adjustment remain signed value-match evidence rather than a guessed conversion',async t=>{
 for(const [after,delta,expectedDelta] of [[48.51,1,100],[0,-47.51,-4751]]){
  const f=await fixture(t,{count:1,income:{escrow_amount_after_adjustment:after,total_adjustment_amount:delta}});f.releaseRows[0].payout_amount=after;const result=await f.finish();assert.equal(result.calendar.total_release_cents,Math.round(after*100));assert.equal(result.matching.comparison_difference_cents,expectedDelta);assert.equal(result.matching.expected_located_cents,4751);assert.equal(result.status,'CHECKED');assert.deepEqual(result.pending,['BANK_RECEIPT_NOT_VERIFIED']);
 }
});

test('the immutable matched cohort survives source-run retention cleanup and detects corrupted retained evidence',async t=>{
 const f=await fixture(t,{count:1}),result=await f.finish(),db=f.financeEnv.FINANCE_DB.db;
 for(const table of ['finance_business_order_evidence','finance_business_period_orders','finance_business_period_payment_cache','finance_business_period_cursors','finance_business_period_runs'])db.prepare('DELETE FROM '+table).run();
 assert.deepEqual(await f.run(),result,'already captured membership and source clocks survive independent source GC');
 db.prepare("UPDATE finance_escrow_release_cohort_sources SET payload='{}'").run();await assert.rejects(f.run(),error=>error.code==='FINANCE_ESCROW_RELEASE_COHORT_STORAGE_INVALID');
});

test('missing source membership never blocks collection of release evidence or manufactures a complete cohort',async t=>{
 const f=await fixture(t),missing=[{run_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',source_revision:1}];const before=f.calls.length,result=await f.run('step',{sources:missing});assert.equal(f.calls.length,before+1);assert.equal(result.matching.status,'SOURCE_MISSING');assert.equal(result.matching.paid_orders,null);assert.equal(result.matching.unlocated_paid_orders,null);assert.equal(result.sources[0].status,'MISSING');assert.ok(result.pending.includes('SOURCE_MISSING'));
 for(const selection of [{operation:'read',month,sources:[...f.sources,...f.sources]},{operation:'read',month,sources:f.sources,order_sn:'PRIVATE_ORDER'},{operation:'read',month:'2026-13',sources:f.sources}])await assert.rejects(runFinanceEscrowReleases(f.financeEnv,{...selection,now:f.now,fetchImpl:()=>{throw Error('invalid caller reached provider');}}));
});


test('the same order in two creation windows is unusable membership rather than a second paid sale, while release collection remains available',async t=>{
 const f=await fixture(t,{count:1,second:1}),db=f.financeEnv.FINANCE_DB.db;
 const sources=[...f.sources].sort((a,b)=>db.prepare('SELECT start_date FROM finance_business_period_runs WHERE run_id=?').get(a.run_id).start_date.localeCompare(db.prepare('SELECT start_date FROM finance_business_period_runs WHERE run_id=?').get(b.run_id).start_date));
 const first=sources[0].run_id,second=sources[1].run_id;
 db.prepare('DELETE FROM finance_business_period_orders WHERE run_id=?').run(second);db.prepare('DELETE FROM finance_business_order_evidence WHERE run_id=?').run(second);
 db.prepare('INSERT INTO finance_business_period_orders(run_id,order_hash,bucket,payment_covered,sales_raw,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at) SELECT ?,order_hash,bucket,payment_covered,sales_raw,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at FROM finance_business_period_orders WHERE run_id=?').run(second,first);
 db.prepare('INSERT INTO finance_business_order_evidence(run_id,order_hash,source_hash,checked_at,payload,payload_hash) SELECT ?,order_hash,source_hash,checked_at,payload,payload_hash FROM finance_business_order_evidence WHERE run_id=?').run(second,first);
 const report=await f.finish();assert.equal(report.calendar.status,'COMPLETE');assert.equal(report.calendar.observations,1);assert.equal(report.matching.status,'SOURCE_MISSING');assert.equal(report.matching.paid_orders,null);assert.equal(report.calendar.total_release_cents,null);assert.ok(report.sources.every(source=>source.status==='MISSING'));assert.ok(report.pending.includes('SOURCE_MISSING'));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM finance_escrow_release_cohorts').get().n,0);
});

test('an unavailable third source cannot make duplicate membership in the two known creation windows count as verified release money',async t=>{
 const f=await fixture(t,{count:1,second:1}),db=f.financeEnv.FINANCE_DB.db;
 const ordered=[...f.sources].sort((a,b)=>db.prepare('SELECT start_date FROM finance_business_period_runs WHERE run_id=?').get(a.run_id).start_date.localeCompare(db.prepare('SELECT start_date FROM finance_business_period_runs WHERE run_id=?').get(b.run_id).start_date)),first=ordered[0].run_id,second=ordered[1].run_id;
 db.prepare('DELETE FROM finance_business_period_orders WHERE run_id=?').run(second);db.prepare('DELETE FROM finance_business_order_evidence WHERE run_id=?').run(second);
 db.prepare('INSERT INTO finance_business_period_orders(run_id,order_hash,bucket,payment_covered,sales_raw,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at) SELECT ?,order_hash,bucket,payment_covered,sales_raw,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at FROM finance_business_period_orders WHERE run_id=?').run(second,first);
 db.prepare('INSERT INTO finance_business_order_evidence(run_id,order_hash,source_hash,checked_at,payload,payload_hash) SELECT ?,order_hash,source_hash,checked_at,payload,payload_hash FROM finance_business_order_evidence WHERE run_id=?').run(second,first);
 const sources=[...f.sources,{run_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',source_revision:1}];let report;
 for(let index=0;index<12;index++){report=await f.run('step',{sources});if(report.calendar.status==='COMPLETE')break;}
 assert.equal(report.calendar.status,'COMPLETE');assert.equal(report.calendar.observations,1);assert.equal(report.matching.status,'SOURCE_MISSING');assert.equal(report.matching.paid_orders,null);assert.equal(report.matching.located_paid_orders,0);assert.equal(report.matching.verified_paid_orders,0);assert.equal(report.calendar.verified_orders,0);assert.equal(report.calendar.known_verified_release_cents,0);assert.equal(report.calendar.total_release_cents,null);assert.equal(report.matching.verified_release_cents,null);assert.ok(report.sources.every(source=>source.status==='MISSING'));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM finance_escrow_release_cohorts').get().n,0);
});

test('a failed later refresh preserves the complete release publication and its value-match evidence with original source clocks',async t=>{
 const f=await fixture(t,{count:1}),published=await f.finish();f.clock.time+=600000;
 const failed=await f.run('step',{fetchImpl:async()=>Response.json({error:'error_api_permission',message:'PRIVATE_RELEASE_ERROR'},{status:403})});
 assert.equal(failed.calendar.scan_id,published.calendar.scan_id);assert.equal(failed.calendar.status,'COMPLETE');assert.equal(failed.calendar.total_release_cents,4751);assert.deepEqual(failed.calendar,published.calendar);assert.equal(failed.collection.status,'BLOCKED');assert.equal(failed.status,'PARTIAL');assert.ok(failed.pending.includes('RELEASE_SOURCE_UNAVAILABLE'));assert.equal(failed.sources[0].finance_latest_at,published.sources[0].finance_latest_at);assert.ok(!JSON.stringify(failed).includes('PRIVATE_RELEASE_ERROR'));
});

test('retained private cohort captures are bounded to eight per month and keep the current capture even with tied timestamps',async t=>{
 const f=await fixture(t,{count:1}),db=f.financeEnv.FINANCE_DB.db,first=f.sources.find(source=>db.prepare('SELECT start_date FROM finance_business_period_runs WHERE run_id=?').get(source.run_id).start_date===month+'-01'),second=f.sources.find(source=>source!==first);let latest;
 for(let index=0;index<12;index++){
  const next=randomUUID(),columns=db.prepare('PRAGMA table_info(finance_business_period_runs)').all().map(row=>row.name),select=columns.map(name=>name==='run_id'?'?':name).join(',');
  db.prepare('INSERT INTO finance_business_period_runs('+columns.join(',')+') SELECT '+select+' FROM finance_business_period_runs WHERE run_id=?').run(next,first.run_id);
  db.prepare('INSERT INTO finance_business_period_orders(run_id,order_hash,bucket,payment_covered,sales_raw,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at) SELECT ?,order_hash,bucket,payment_covered,sales_raw,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at FROM finance_business_period_orders WHERE run_id=?').run(next,first.run_id);
  db.prepare('INSERT INTO finance_business_order_evidence(run_id,order_hash,source_hash,checked_at,payload,payload_hash) SELECT ?,order_hash,source_hash,checked_at,payload,payload_hash FROM finance_business_order_evidence WHERE run_id=?').run(next,first.run_id);
  latest=[{run_id:next,source_revision:first.source_revision},second];const report=await f.run('read',{sources:latest});assert.equal(report.matching.status,'AVAILABLE');assert.ok(db.prepare('SELECT COUNT(*) AS n FROM finance_escrow_release_cohorts').get().n<=8);assert.ok(db.prepare('SELECT payload FROM finance_escrow_release_cohorts').all().some(row=>JSON.parse(row.payload).sources.some(source=>source.run_id===next)));
 }
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM finance_escrow_release_cohorts').get().n,8);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM finance_escrow_release_cohort_sources').get().n,16);assert.equal(f.calls.length,0);
 for(const table of ['finance_business_order_evidence','finance_business_period_orders','finance_business_period_payment_cache','finance_business_period_cursors','finance_business_period_runs'])db.prepare('DELETE FROM '+table).run();assert.equal((await f.run('read',{sources:latest})).matching.status,'AVAILABLE');
});
