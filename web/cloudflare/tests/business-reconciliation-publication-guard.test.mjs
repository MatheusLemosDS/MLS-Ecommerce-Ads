import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {BUSINESS_MONTH_PUBLICATION_SCHEMA,saveCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {BUSINESS_RECONCILIATION_SCHEMA,BusinessReconciliationError,runBusinessReconciliation,readBusinessReconciliation,readBusinessReconciliationMoney} from '../src/business-reconciliation.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {projectReconciliationFrame,projectReconciliationEvidenceFrame,projectReconciliationMoneyFrame} from '../../finance/src/reconciliation-frame.mjs';

const at=Date.UTC(2026,10,1,14,20),uuid=index=>'11111111-1111-4111-8111-'+String(index).padStart(12,'0');
const localMonth=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000)).slice(0,7);
class GuardD1 extends D1{
 constructor(){super();this.beforeClaim=null;this.afterClaim=null;this.beforeBatch=null;}
 prepare(sql){const result=super.prepare(sql),run=result.run.bind(result);result.run=async()=>{const claim=sql.startsWith('INSERT INTO business_reconciliation_leases');if(claim&&this.beforeClaim){const action=this.beforeClaim;this.beforeClaim=null;await action();}const value=await run();if(claim&&value.meta?.changes===1&&this.afterClaim){const action=this.afterClaim;this.afterClaim=null;await action();}return value;};return result;}
 async batch(rows){if(this.beforeBatch){const action=this.beforeBatch;this.beforeBatch=null;await action();}return super.batch(rows);}
}
function sourceFrame(month,index,checked,{offset=0,lastDay=31,shortCutoff=false}={}){
 const start_date=month+'-'+String(index*15+1).padStart(2,'0'),end_date=month+'-'+String(Math.min(lastDay,index*15+15)).padStart(2,'0'),after=new Date(Date.parse(end_date+'T12:00:00Z')+86400000).toISOString().slice(0,10),end=Date.parse(after+'T03:00:00Z')/1000;
 const cutoff=Math.min(checked-2,end-1)-(shortCutoff?100:0);
 const frame={schema:'finance_business_period_v1',run_id:uuid(index+offset+1),revision:2,status:'COMPLETE',start_date,end_date,cutoff_at:cutoff,checked_at:checked,source_checked_at:{oldest_at:checked-1,latest_at:checked-1},currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:1,paid:1,completed:1,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1,payment_missing:0,returns:1,returns_unknown:0},known_sales_base_raw:'100',sales_base_raw:'100',known_expected_repass_raw:'80',expected_repass_raw:'80',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:0,known_base_raw:'100',known_tax_raw:'2'},items:[{item_id:'100',model_id:'0',quantity:1}],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
 assert.ok(projectBusinessPeriodFrame(frame));return frame;
}
function report(source,checked){
 const result={schema:'finance_reconciliation_v1',run_id:source.run_id,source_revision:source.revision,start_date:source.start_date,end_date:source.end_date,checked_at:checked,status:'CHECKED',source_checked_at:{finance_oldest_at:source.source_checked_at.oldest_at,finance_latest_at:source.source_checked_at.latest_at,returns_oldest_at:checked,returns_latest_at:checked},coverage:{orders:1,evidence_orders:1,missing_evidence_orders:0,paid_orders:1,review_orders:0,return_orders:1,return_unknown_orders:0},adjustments:{reported_orders:1,missing_orders:0,conflicting_orders:0,known_adjustment_cents:100,base_repass_cents:8000,after_adjustment_repass_cents:8100},returns:{reference_count:1,checked_count:1,pending_count:0,known_requested_refund_cents:1000,requested_amount_complete:true,permission:'AVAILABLE'},cases:[{case_hash:'a'.repeat(64),order_hash:'b'.repeat(64),status:'ACCEPTED',requested_refund_cents:1000,checked_at:checked,diagnostic:null}],truncation:{truncated:false,cases_total:1,cases_included:1},pending:['RETURN_VALUES_UNVERIFIED','SETTLEMENT_NOT_RECONCILED'],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};
 assert.ok(projectReconciliationFrame(result));return result;
}
function money(source,checked){
 const value=report(source,checked),review={schema:'finance_review_orders_v1',summary:{orders:0,in_cancel:0,to_return:0,other:0,unknown:0},orders:[],truncation:{truncated:false,orders_total:0,orders_included:0},basis:'REVIEW_ORDERS_OUTSIDE_PAID_COHORT'};
 const statuses=['PENDING','UNKNOWN','REQUESTED','ACCEPTED','CANCELLED','JUDGING','REFUND_PAID','CLOSED','PROCESSING'];
 const groups=['PAID','REVIEW','OTHER'].map(cohort=>({cohort,statuses:statuses.map(status=>({status,cases:cohort==='PAID'&&status==='ACCEPTED'?1:0,amount_known:cohort==='PAID'&&status==='ACCEPTED'?1:0,known_amount_cents:cohort==='PAID'&&status==='ACCEPTED'?1000:0})),source_checked_at:{oldest_at:cohort==='PAID'?checked:null,latest_at:cohort==='PAID'?checked:null}}));
 const result={schema:'finance_reconciliation_v3',report:value,review,money:{schema:'finance_reconciliation_money_v1',currency:'BRL',groups,payouts:[{order_hash:'b'.repeat(64),cohort:'PAID',source_checked_at:source.source_checked_at.oldest_at,reference_count:1,state:'AVAILABLE',base_repass_cents:8000,adjustment_cents:100,after_adjustment_repass_cents:8100}],truncation:{truncated:false,payouts_total:1,payouts_included:1},basis:'SAVED_RETURN_AMOUNTS_AND_PAID_PAYOUT_AFTER_ADJUSTMENTS'}};
 assert.ok(projectReconciliationMoneyFrame(result,projectReconciliationFrame,projectReconciliationEvidenceFrame));return result;
}
async function fixture(t,{month='2026-10',time=at,lastDay=31,shortCutoff=false,leases='both'}={}){
 const db=new GuardD1(),env={ADMIN_DB:db},clock={time},now=()=>clock.time,stamp=time/1000,through=localMonth(stamp);t.after(()=>db.db.close());
 await db.batch(['CREATE TABLE business_month_runs(month TEXT PRIMARY KEY,revision INTEGER,payload TEXT,created_at INTEGER,updated_at INTEGER)',...BUSINESS_MONTH_PUBLICATION_SCHEMA,...BUSINESS_RECONCILIATION_SCHEMA,'CREATE TABLE business_sync_state(id INTEGER PRIMARY KEY,enabled INTEGER)','INSERT INTO business_sync_state VALUES(1,1)','CREATE TABLE financial_audit_turns(month TEXT PRIMARY KEY,revision INTEGER,next_work TEXT,lease_token TEXT,lease_until INTEGER)','CREATE TABLE background_collection_lane_state(id INTEGER PRIMARY KEY,revision INTEGER,next_lane TEXT,auxiliary_index INTEGER,lease_token TEXT,lease_until INTEGER)'].map(sql=>db.prepare(sql)));
 db.db.prepare("INSERT INTO financial_audit_turns VALUES(?,7,'RETURNS',?,?)").run(through,uuid(70),stamp+90);db.db.prepare("INSERT INTO background_collection_lane_state VALUES(1,9,'AUXILIARY',0,?,?)").run(uuid(80),stamp+290);
 let frames;
 const publish=async(revision=10,offset=0)=>{const checked=now()/1000-10;frames=Array.from({length:Math.ceil(lastDay/15)},(_,index)=>sourceFrame(month,index,checked,{lastDay,offset,shortCutoff}));const payload={start_date:month+'-01',end_date:month+'-'+String(lastDay).padStart(2,'0'),slots:frames.map(frame=>({start_date:frame.start_date,end_date:frame.end_date,frame}))},row={revision,payload:JSON.stringify(payload),created_at:now()/1000-300,updated_at:checked};db.db.prepare('INSERT OR REPLACE INTO business_month_runs VALUES(?,?,?,?,?)').run(month,revision,row.payload,row.created_at,row.updated_at);assert.ok(await saveCompletedBusinessMonth(env,month,{row,payload,complete:true},{now}));return frames;};
 await publish();const header=db.db.prepare('SELECT * FROM business_month_publications WHERE month=?').get(month);
 const publicationGuard={calendar_month:month,through_month:through,publication_revision:header.source_revision,publication_write_token:header.write_token,publication_payload:header.payload,audit_revision:leases==='both'?7:null,audit_token:leases==='both'?uuid(70):null,background_revision:leases==='none'?null:9,background_token:leases==='none'?null:uuid(80)};
 return {db,env,clock,now,month,through,publish,publicationGuard,get frames(){return frames;},run:(source,options={})=>runBusinessReconciliation(env,source,{month},{now,publicationGuard,...options})};
}
const records=f=>({reports:f.db.db.prepare('SELECT * FROM business_reconciliation_reports ORDER BY run_id').all(),attempts:f.db.db.prepare('SELECT * FROM business_reconciliation_attempts ORDER BY run_id').all()});
const good=f=>async(_,input)=>report(f.frames.find(source=>source.run_id===input.run_id),f.now()/1000);

test('a previous closed month audits one exact saved slot and ignores a newer partial active collector',async t=>{
 const f=await fixture(t),publication=f.db.db.prepare('SELECT * FROM business_month_publications').get(),calls=[];
 const active={start_date:f.month+'-01',end_date:f.month+'-31',slots:f.frames.map((frame,index)=>({start_date:frame.start_date,end_date:frame.end_date,frame:index===0?frame:null}))};f.db.db.prepare('UPDATE business_month_runs SET revision=11,payload=? WHERE month=?').run(JSON.stringify(active),f.month);
 const result=await f.run(async(_,input)=>{calls.push(input);return report(f.frames[0],f.now()/1000);});assert.equal(result.status,'CHECKED');assert.equal(result.source_reads,1);assert.equal(result.repeat,true);assert.deepEqual(calls,[{operation:'step',run_id:f.frames[0].run_id}]);assert.equal(records(f).reports.length,1);assert.deepEqual(f.db.db.prepare('SELECT * FROM business_month_publications').get(),publication);
 const view=await readBusinessReconciliation(f.env,{month:f.month},{now:f.now});assert.equal(view.source_revision,10);assert.equal(view.reports[0].source_revision,f.frames[0].revision);assert.ok(view.reports[0].pending.includes('SETTLEMENT_NOT_RECONCILED'));
});

test('current partial dates and optional scheduler leases preserve guarded v1 and v3 contracts',async t=>{
 for(const leases of ['both','background','none']){
  const f=await fixture(t,{month:'2026-11',lastDay:1,leases});if(leases==='none')f.db.db.exec('DROP TABLE financial_audit_turns; DROP TABLE background_collection_lane_state');
  const result=await f.run(async()=>money(f.frames[0],f.now()/1000));assert.equal(result.status,'CHECKED');assert.equal(result.source_reads,1);const view=await readBusinessReconciliationMoney(f.env,{month:f.month},{now:f.now});assert.equal(view.report.schema,'business_reconciliation_v1');assert.equal(view.money.length,1);assert.equal(view.money[0].money.payouts[0].after_adjustment_repass_cents,8100);assert.equal(view.report.reports[0].returns.known_requested_refund_cents,1000);
 }
});

test('a prior publication with a short calendar or short COMPLETE cutoff cannot initiate an audit',async t=>{
 for(const options of [{lastDay:25},{shortCutoff:true}]){const f=await fixture(t,options);let calls=0;const result=await f.run(async()=>{calls++;return report(f.frames[0],f.now()/1000);});assert.equal(result.status,'NO_PUBLICATION');assert.equal(result.source_reads,0);assert.equal(calls,0);assert.deepEqual(records(f),{reports:[],attempts:[]});}
});

test('publication changes before and after the target lease prevent the source request',async t=>{
 for(const phase of ['beforeClaim','afterClaim']){
  const f=await fixture(t);f.db[phase]=()=>f.publish(11,10);let calls=0;const result=await f.run(async()=>{calls++;return report(f.frames[0],f.now()/1000);});assert.ok(['PAUSED','LEASED'].includes(result.status));assert.equal(result.source_reads,0);assert.equal(calls,0);assert.deepEqual(records(f),{reports:[],attempts:[]});
 }
});

test('publication replacement during the RPC cannot publish an old report, attempt or monetary sidecar',async t=>{
 const f=await fixture(t),original=f.frames[0];const result=await f.run(async()=>{const old=money(original,f.now()/1000);await f.publish(11,10);return old;});assert.equal(result.status,'PAUSED');assert.equal(result.source_reads,1);assert.deepEqual(records(f),{reports:[],attempts:[]});assert.equal((await readBusinessReconciliationMoney(f.env,{month:f.month},{now:f.now})).money.length,0);
});

test('the final SQL guard closes a publication replacement between post-response checks and the atomic commit',async t=>{
 const f=await fixture(t);const result=await f.run(async()=>{const old=report(f.frames[0],f.now()/1000);f.db.beforeBatch=()=>f.publish(11,10);return old;});assert.equal(result.status,'LEASED');assert.equal(result.source_reads,1);assert.deepEqual(records(f),{reports:[],attempts:[]});
});

test('every part of the publication identity is checked, including payload and write token at equal revision',async t=>{
 for(const change of [guard=>guard.publication_revision++,guard=>guard.publication_write_token=uuid(99),guard=>guard.publication_payload=JSON.stringify({...JSON.parse(guard.publication_payload),end_date:'2026-10-30'})]){
  const f=await fixture(t);change(f.publicationGuard);let calls=0;const result=await f.run(async()=>{calls++;return report(f.frames[0],f.now()/1000);});assert.equal(result.status,'PAUSED');assert.equal(calls,0);assert.deepEqual(records(f),{reports:[],attempts:[]});
 }
});

test('disabled collection or a replaced/expired optional scheduler lease prevents calls and late writes',async t=>{
 for(const stage of ['before','during'])for(const mutation of [f=>f.db.db.prepare('UPDATE business_sync_state SET enabled=0').run(),f=>f.db.db.prepare('UPDATE financial_audit_turns SET lease_token=?').run(uuid(91)),f=>f.db.db.prepare('UPDATE financial_audit_turns SET lease_until=?').run(f.now()/1000),f=>f.db.db.prepare('UPDATE background_collection_lane_state SET revision=revision+1').run(),f=>f.db.db.prepare('UPDATE background_collection_lane_state SET lease_until=?').run(f.now()/1000)]){
  const f=await fixture(t);let calls=0;if(stage==='before')mutation(f);const result=await f.run(async()=>{calls++;const source=report(f.frames[0],f.now()/1000);mutation(f);return source;});assert.equal(result.status,'PAUSED');assert.equal(calls,stage==='before'?0:1);assert.deepEqual(records(f),{reports:[],attempts:[]});
 }
});

test('a stolen own target lease blocks the provider even while all outer guards remain valid',async t=>{
 const f=await fixture(t);f.db.afterClaim=async()=>{f.db.db.prepare('UPDATE business_reconciliation_leases SET lease_token=?').run(uuid(92));};let calls=0;const result=await f.run(async()=>{calls++;return report(f.frames[0],f.now()/1000);});assert.equal(result.status,'PAUSED');assert.equal(calls,0);assert.deepEqual(records(f),{reports:[],attempts:[]});
});

test('a guarded clock that advances then retreats is latched invalid before any source request',async t=>{
 const f=await fixture(t);let checks=0,calls=0;const result=await f.run(async()=>{calls++;return report(f.frames[0],f.now()/1000);},{canRun:async()=>{checks++;f.clock.time=at+(checks===1?40:20)*1000;return true;}});assert.equal(result.status,'PAUSED');assert.equal(calls,0);assert.deepEqual(records(f),{reports:[],attempts:[]});
});

test('expiration, a backwards source clock and a Brasília month rollover cancel the response without advancing evidence',async t=>{
 for(const advance of [91,-1]){const f=await fixture(t);const result=await f.run(async()=>{const value=report(f.frames[0],f.now()/1000);f.clock.time+=advance*1000;return value;});assert.equal(result.status,'PAUSED');assert.equal(result.source_reads,1);assert.deepEqual(records(f),{reports:[],attempts:[]});}
 const edge=Date.UTC(2026,11,1,2,59,30),f=await fixture(t,{month:'2026-10',time:edge});const result=await f.run(async()=>{const value=report(f.frames[0],f.now()/1000);f.clock.time+=61000;return value;});assert.equal(result.status,'PAUSED');assert.deepEqual(records(f),{reports:[],attempts:[]});
});

test('existing per-source retry and permission timers remain in force under the publication guard',async t=>{
 const f=await fixture(t);let calls=0;for(let index=0;index<f.frames.length;index++)assert.equal((await f.run(async(_,input)=>{calls++;return report(f.frames.find(source=>source.run_id===input.run_id),f.now()/1000);})).status,'CHECKED');const before=records(f);assert.equal((await f.run(async()=>{calls++;throw Error('not due');})).status,'RETRY_WAIT');assert.equal(calls,3);assert.deepEqual(records(f),before);
 const denied=await fixture(t);for(let index=0;index<denied.frames.length;index++)await denied.run(async(_,input)=>{
  const value=report(denied.frames.find(source=>source.run_id===input.run_id),denied.now()/1000);value.status='BLOCKED';value.source_checked_at.returns_oldest_at=null;value.source_checked_at.returns_latest_at=null;value.returns={reference_count:1,checked_count:0,pending_count:1,known_requested_refund_cents:0,requested_amount_complete:false,permission:'DENIED'};value.cases=value.cases.map(row=>({...row,status:'PENDING',checked_at:null,requested_refund_cents:null,diagnostic:'PERMISSION_DENIED'}));value.pending=['RETURN_DETAILS_PENDING','RETURN_PERMISSION_REQUIRED','RETURN_VALUES_UNVERIFIED','SETTLEMENT_NOT_RECONCILED'];assert.ok(projectReconciliationFrame(value));return value;
 });assert.ok(records(denied).attempts.every(attempt=>attempt.next_attempt_at===denied.now()/1000+21600));assert.equal((await denied.run(async()=>{throw Error('permission retry not due');})).status,'RETRY_WAIT');
});

test('guarding does not weaken financial scope, paid coverage or base-payout validation',async t=>{
 for(const change of [value=>value.source_revision++,value=>value.source_checked_at.finance_oldest_at--,value=>{value.coverage.orders=2;value.coverage.evidence_orders=2;value.coverage.review_orders=1;},value=>{value.adjustments.base_repass_cents=8100;value.adjustments.after_adjustment_repass_cents=8200;}]){
  const f=await fixture(t);const result=await f.run(async()=>{const value=report(f.frames[0],f.now()/1000);change(value);return value;});assert.equal(result.status,'UNAVAILABLE');assert.equal(result.source_reads,1);assert.equal(records(f).reports.length,0);assert.equal(records(f).attempts[0].code,'FINANCE_RECONCILIATION_SCOPE_MISMATCH');
 }
});

test('invalid internal guard shapes fail explicitly without becoming owner inputs or exposing private strings',async t=>{
 const f=await fixture(t);for(const change of [value=>value.extra='PRIVATE',value=>value.calendar_month='2026-09',value=>value.through_month='2026-10',value=>value.audit_revision=null,value=>value.background_token=null,value=>value.publication_payload='x'.repeat(8193)]){
  const bad=structuredClone(f.publicationGuard);change(bad);await assert.rejects(f.run(good(f),{publicationGuard:bad}),error=>error instanceof BusinessReconciliationError&&error.message==='BUSINESS_RECONCILIATION_CONFIGURATION');
 }
 await assert.rejects(runBusinessReconciliation(f.env,good(f),{month:f.month,publicationGuard:f.publicationGuard},{now:f.now}),error=>error.status===400);
});
