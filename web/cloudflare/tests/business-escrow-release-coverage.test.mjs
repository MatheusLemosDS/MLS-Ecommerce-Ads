import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {BUSINESS_MONTH_PUBLICATION_SCHEMA,saveCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {BUSINESS_ESCROW_RELEASE_COVERAGE_SCHEMA,projectBusinessEscrowReleaseCoverage,readBusinessEscrowReleaseCoverage,runBusinessEscrowReleaseCoverage} from '../src/business-escrow-release-coverage.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {projectEscrowReleaseCoverageFrame} from '../../finance/src/escrow-release-frame.mjs';

const nowMs=Date.UTC(2026,10,10,15),stamp=nowMs/1000,month='2026-10',through='2026-11';
const uuid=index=>'11111111-1111-4111-8111-'+String(index).padStart(12,'0');
function businessFrame(index,start,end){
 const value={schema:'finance_business_period_v1',run_id:uuid(index+1),revision:2,status:'COMPLETE',start_date:start,end_date:end,cutoff_at:stamp-1000,checked_at:stamp-900,source_checked_at:{oldest_at:stamp-950,latest_at:stamp-940},currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:1,paid:1,completed:1,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'100',sales_base_raw:'100',known_expected_repass_raw:'80',expected_repass_raw:'80',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:0,known_base_raw:'100',known_tax_raw:'2'},items:[{item_id:String(index+1),model_id:'0',quantity:1}],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
 assert.ok(projectBusinessPeriodFrame(value));return value;
}
function coverage(refs,{identity=false}={}){
 const located=identity?3:2,notLocated=3-located;
 const value={schema:'finance_escrow_release_coverage_v1',cohort_month:month,through_month:through,checked_at:stamp,status:identity?'IDENTITY_COMPLETE':'COLLECTING',sources:refs.map((ref,index)=>({run_id:ref.run_id,source_revision:ref.source_revision,start_date:[month+'-01',month+'-16',month+'-31'][index],end_date:[month+'-15',month+'-30',month+'-31'][index],status:'AVAILABLE',orders:1,paid_orders:1,finance_oldest_at:stamp-950,finance_latest_at:stamp-940,expected_repass_cents:8000})),calendars:[{month,status:'COMPLETE',scan_id:uuid(80),cutoff_at:Date.UTC(2026,10,1,3)/1000,source_oldest_at:stamp-800,source_latest_at:stamp-790,observations:2,cohort_observations:2,unique_cohort_orders:2,ambiguous_cohort_orders:0},{month:through,status:identity?'COMPLETE':'MISSING',scan_id:identity?uuid(81):null,cutoff_at:identity?stamp-100:null,source_oldest_at:identity?stamp-700:null,source_latest_at:identity?stamp-690:null,observations:identity?1:0,cohort_observations:identity?1:0,unique_cohort_orders:identity?1:0,ambiguous_cohort_orders:0}],coverage:{paid_orders:3,located_orders:located,not_located_orders:notLocated,ambiguous_orders:0,single_orders:located,calendars_total:2,calendars_complete:identity?2:1,identity_complete_at_cutoff:identity},pending:[...(identity?[]:['CALENDAR_MISSING','ORDER_NOT_LOCATED']),'BANK_RECEIPT_NOT_VERIFIED','RELEASE_CYCLE_SEMANTICS_UNVERIFIED'],basis:'SAVED_RELEASE_CALENDARS_AGAINST_PAID_ORDER_COHORT_NOT_BANK_RECEIPT'};
 assert.ok(projectEscrowReleaseCoverageFrame(value));return value;
}
async function fixture(t){
 const db=new D1(),env={ADMIN_DB:db},now=()=>nowMs;t.after(()=>db.db.close());
 await db.batch(['CREATE TABLE business_month_runs(month TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)',...BUSINESS_MONTH_PUBLICATION_SCHEMA,...BUSINESS_ESCROW_RELEASE_COVERAGE_SCHEMA].map(sql=>db.prepare(sql)));
 const frames=[businessFrame(0,month+'-01',month+'-15'),businessFrame(1,month+'-16',month+'-30'),businessFrame(2,month+'-31',month+'-31')],payload={start_date:month+'-01',end_date:month+'-31',slots:frames.map(frame=>({start_date:frame.start_date,end_date:frame.end_date,frame}))},raw=JSON.stringify(payload),row={revision:7,payload:raw,created_at:stamp-1200,updated_at:stamp-900};
 db.db.prepare('INSERT INTO business_month_runs VALUES(?,?,?,?,?)').run(month,row.revision,row.payload,row.created_at,row.updated_at);assert.ok(await saveCompletedBusinessMonth(env,month,{row,payload,complete:true},{now}));
 return {db,env,now,frames,refs:frames.map(frame=>({run_id:frame.run_id,source_revision:frame.revision}))};
}

test('coverage cron selects one prior cohort, persists it once and then respects its retry deadline',async t=>{
 const f=await fixture(t),calls=[];const source=async(_,input)=>{calls.push(input);return coverage(f.refs);};
 const work=await runBusinessEscrowReleaseCoverage(f.env,source,{through_month:through},{now:f.now});assert.equal(work.cohort_month,month);assert.equal(work.status,'COLLECTING');assert.equal(work.service_reads,1);assert.deepEqual(calls,[{operation:'coverage',cohort_month:month,through_month:through,sources:f.refs}]);
 const saved=await readBusinessEscrowReleaseCoverage(f.env,{month},{now:f.now});assert.equal(saved.status,'AVAILABLE');assert.ok(projectBusinessEscrowReleaseCoverage(saved,projectEscrowReleaseCoverageFrame));assert.equal(saved.report.coverage.not_located_orders,1);assert.ok(saved.report.pending.includes('RELEASE_CYCLE_SEMANTICS_UNVERIFIED'));
 const again=await runBusinessEscrowReleaseCoverage(f.env,async()=>{throw Error('must not run');},{through_month:through},{now:f.now});assert.equal(again.status,'RETRY_WAIT');assert.equal(again.service_reads,0);
});

test('identity-complete cutoff slows refresh and still never becomes settlement or receivable proof',async t=>{
 const f=await fixture(t);const work=await runBusinessEscrowReleaseCoverage(f.env,async()=>coverage(f.refs,{identity:true}),{through_month:through},{now:f.now});assert.equal(work.status,'IDENTITY_COMPLETE');
 const saved=await readBusinessEscrowReleaseCoverage(f.env,{month},{now:f.now});assert.equal(saved.report.coverage.identity_complete_at_cutoff,true);assert.ok(saved.report.pending.includes('RELEASE_CYCLE_SEMANTICS_UNVERIFIED'));assert.ok(saved.report.pending.includes('BANK_RECEIPT_NOT_VERIFIED'));assert.equal(Object.hasOwn(saved.report,'remaining_receivable_cents'),false);
 const row=f.db.db.prepare('SELECT next_attempt_at,last_attempt_at FROM business_escrow_release_coverage WHERE cohort_month=?').get(month);assert.equal(row.next_attempt_at-row.last_attempt_at,21600);
});

test('failed refresh preserves the last valid coverage report and exposes only a finite diagnostic',async t=>{
 const f=await fixture(t);await runBusinessEscrowReleaseCoverage(f.env,async()=>coverage(f.refs),{through_month:through},{now:f.now});f.db.db.prepare('UPDATE business_escrow_release_coverage SET next_attempt_at=? WHERE cohort_month=?').run(stamp,month);
 const work=await runBusinessEscrowReleaseCoverage(f.env,async()=>({status:'UNAVAILABLE',diagnostic:{code:'FINANCE_ESCROW_RELEASES_TIMEOUT',http:null},private:'PRIVATE_TOKEN'}),{through_month:through},{now:f.now});assert.equal(work.status,'UNAVAILABLE');
 const saved=await readBusinessEscrowReleaseCoverage(f.env,{month},{now:f.now});assert.equal(saved.status,'PARTIAL_UNAVAILABLE');assert.equal(saved.report.coverage.not_located_orders,1);assert.equal(saved.attempt.code,'FINANCE_ESCROW_RELEASES_TIMEOUT');assert.doesNotMatch(JSON.stringify(saved),/PRIVATE_TOKEN/);
});
