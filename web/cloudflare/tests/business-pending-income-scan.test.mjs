import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {projectIncomeDetailFrame} from '../../finance/src/income-detail-frame.mjs';
import {projectPendingIncomeScanFrame} from '../../finance/src/pending-income-frame.mjs';
import {BUSINESS_PENDING_INCOME_SCAN_SCHEMA,BusinessPendingIncomeScanError,projectBusinessPendingIncomeScan,readBusinessPendingIncomeScan,runBusinessPendingIncomeScan} from '../src/business-pending-income-scan.mjs';

const at=Date.UTC(2026,9,31,18),stamp=at/1000,basis='CURRENT_PENDING_PAGINATED_MUTABLE_SOURCE_NOT_MONTH_OR_BANK_RECEIPT';
const firstId='11111111-1111-4111-8111-111111111111',secondId='22222222-2222-4222-8222-222222222222';
const row=(entry='a',order='b',raw='47.51',cents=4751)=>({entry_hash:entry.repeat(64),order_hash:order.repeat(64),currency:'BRL',status:'Pendente',description:'Order Income',payment_method:'PIX',estimated_escrow_raw:raw,estimated_escrow_cents:cents,estimated_payout_time:stamp+86400,creation_time:stamp-3600});
function report({completed=stamp,started=stamp,id=firstId,rows=[row()],pages=1,duplicates=0}={}){
 const orders=new Map();let unknown=0,total=0n;for(const r of rows){orders.set(r.order_hash,(orders.get(r.order_hash)||0)+1);if(r.estimated_escrow_cents===null)unknown++;else total+=BigInt(r.estimated_escrow_cents);}const conflicts=[...orders.values()].filter(n=>n>1).length,complete=unknown===0&&conflicts===0&&total>=BigInt(Number.MIN_SAFE_INTEGER)&&total<=BigInt(Number.MAX_SAFE_INTEGER);
 return {scan_id:id,started_at:started,completed_at:completed,source_oldest_at:started,source_latest_at:completed,pages_read:pages,rows,unique_orders:orders.size,duplicate_entries:duplicates,conflicting_orders:conflicts,known_amount_cents:complete?Number(total):null,unknown_amount_count:unknown,amount_complete:complete,basis};
}
function frame({checked=stamp,state='RUNNING',publication=null,id=firstId,started=stamp,next=null,error=null,pages=1}={}){
 const dateTo=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(started*1000)),dateFrom=new Date(Date.parse(dateTo+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 const scan={scan_id:id,state,started_at:started,updated_at:checked,completed_at:state==='COMPLETE'?checked:null,date_from:dateFrom,date_to:dateTo,pages_read:pages,unique_entries:1,unique_orders:1,duplicate_entries:0,conflicting_orders:0,next_attempt_at:next??checked+(state==='COMPLETE'?900:state==='RUNNING'?60:300),error};
 if(state==='COMPLETE'){publication??=report({completed:checked,started,id,pages});Object.assign(scan,{unique_entries:publication.rows.length,unique_orders:publication.unique_orders,duplicate_entries:publication.duplicate_entries,conflicting_orders:publication.conflicting_orders});}
 const value={schema:'finance_pending_income_scan_v1',checked_at:checked,scan,report:publication,basis};assert.ok(projectPendingIncomeScanFrame(value),'fixture must satisfy the actual Finance projector');return value;
}
async function fixture(t){const db=new D1();t.after(()=>db.db.close());const env={ADMIN_DB:db},clock={time:at},now=()=>clock.time;return {db,env,clock,now,advance:seconds=>clock.time+=seconds*1000};}
const saved=db=>db.db.prepare('SELECT * FROM business_pending_income_scan WHERE id=1').get();

test('owner Pending scan reads are local and do not create schema when no collection has run',async t=>{
 const f=await fixture(t);const before=f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n;
 const value=await readBusinessPendingIncomeScan(f.env,{now:f.now});assert.deepEqual(value,{schema:'business_pending_income_scan_v1',checked_at:stamp,status:'PENDING',frame:null,attempt:null});assert.ok(projectBusinessPendingIncomeScan(value,projectPendingIncomeScanFrame));assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,before);
});

test('one background call stores collection progress and owner reloads never call a source or alter the cache',async t=>{
 const f=await fixture(t);let calls=0;const source=async()=>{calls++;return frame();};const work=await runBusinessPendingIncomeScan(f.env,source,{now:f.now});assert.deepEqual(work,{schema:'business_pending_income_scan_work_v1',status:'RUNNING',source_reads:1,repeat:true});
 const original=saved(f.db),view=await readBusinessPendingIncomeScan(f.env,{now:f.now});assert.equal(view.status,'COLLECTING');assert.equal(view.frame.scan.pages_read,1);assert.equal(view.attempt.next_attempt_at,stamp+60);assert.equal(original.status,'RUNNING');assert.equal(calls,1);
 assert.equal((await runBusinessPendingIncomeScan(f.env,source,{now:f.now})).status,'RETRY_WAIT');await readBusinessPendingIncomeScan(f.env,{now:f.now});assert.deepEqual(saved(f.db),original);assert.equal(calls,1);
 assert.deepEqual(f.db.db.prepare("SELECT name FROM sqlite_master WHERE name='business_income_detail'").all(),[],'legacy first-page state is independent');
});

test('completion is cached for fifteen minutes and a later transport failure preserves every published row and source time',async t=>{
 const f=await fixture(t),complete=frame({state:'COMPLETE'});let calls=0;
 assert.equal((await runBusinessPendingIncomeScan(f.env,async()=>{calls++;return complete;},{now:f.now})).status,'CHECKED');let view=await readBusinessPendingIncomeScan(f.env,{now:f.now});assert.equal(view.status,'AVAILABLE');assert.equal(view.frame.report.known_amount_cents,4751);assert.equal(view.attempt.next_attempt_at,stamp+900);
 f.advance(899);assert.equal((await runBusinessPendingIncomeScan(f.env,async()=>{calls++;throw Error('not due');},{now:f.now})).source_reads,0);f.advance(2);
 const failed=await runBusinessPendingIncomeScan(f.env,async()=>{calls++;return {diagnostic:{code:'FINANCE_PENDING_INCOME_SCAN_TIMEOUT'},message:'PRIVATE_PROVIDER_BODY',access_token:'PRIVATE_ACCESS'};},{now:f.now});assert.equal(failed.status,'UNAVAILABLE');assert.equal(failed.repeat,false);
 view=await readBusinessPendingIncomeScan(f.env,{now:f.now});assert.equal(view.status,'PARTIAL_UNAVAILABLE');assert.deepEqual(view.frame,complete);assert.equal(view.attempt.code,'FINANCE_PENDING_INCOME_SCAN_TIMEOUT');assert.equal(view.attempt.next_attempt_at,stamp+1201);assert.doesNotMatch(JSON.stringify(view),/PRIVATE_|access_token|message/);assert.equal(calls,2);
});

test('a replacement active scan cannot erase the last completed publication or regress it to an older completion',async t=>{
 const f=await fixture(t),old=frame({state:'COMPLETE'});await runBusinessPendingIncomeScan(f.env,async()=>old,{now:f.now});f.advance(901);
 const active=frame({checked:f.now()/1000,id:secondId,started:f.now()/1000});await runBusinessPendingIncomeScan(f.env,async()=>active,{now:f.now});let view=await readBusinessPendingIncomeScan(f.env,{now:f.now});assert.equal(view.status,'COLLECTING');assert.equal(view.frame.scan.scan_id,secondId);assert.deepEqual(view.frame.report,old.report);
 f.advance(61);const regressed=frame({checked:stamp-50,state:'COMPLETE',started:stamp-100,publication:report({started:stamp-100,completed:stamp-50})});regressed.checked_at=f.now()/1000;regressed.scan.updated_at=f.now()/1000;regressed.scan.next_attempt_at=f.now()/1000+900;
 assert.ok(projectPendingIncomeScanFrame(regressed));await runBusinessPendingIncomeScan(f.env,async()=>regressed,{now:f.now});view=await readBusinessPendingIncomeScan(f.env,{now:f.now});assert.equal(view.status,'PARTIAL_UNAVAILABLE');assert.deepEqual(view.frame.report,old.report);assert.equal(view.frame.scan.scan_id,secondId);
});

test('saved Pending collection remains global and survives the Brazilian month rollover without restarting its scan identity',async t=>{
 const f=await fixture(t);f.clock.time=Date.UTC(2026,10,1,2,59,30);const start=f.now()/1000;
 await runBusinessPendingIncomeScan(f.env,async()=>frame({checked:start,started:start}),{now:f.now});f.advance(61);
 const completed=frame({checked:f.now()/1000,started:start,state:'COMPLETE',pages:2});const work=await runBusinessPendingIncomeScan(f.env,async()=>completed,{now:f.now});assert.equal(work.status,'CHECKED');const view=await readBusinessPendingIncomeScan(f.env,{now:f.now});assert.equal(view.frame.scan.scan_id,firstId);assert.equal(view.frame.scan.started_at,start);assert.equal(view.frame.scan.date_to,'2026-10-31');assert.equal(view.frame.report.pages_read,2);
 assert.equal(Object.hasOwn(saved(f.db),'month'),false);
});

test('provider retry, terminal errors and limit states retain bounded safe causes with their own due clocks',async t=>{
 for(const [state,error] of [['RETRY_WAIT','RATE_LIMIT'],['ERROR','REPEATED_CURSOR'],['LIMIT_REACHED','LIMIT_REACHED']]){
  const f=await fixture(t),source=frame({state,error,next:stamp+1000});const work=await runBusinessPendingIncomeScan(f.env,async()=>source,{now:f.now});assert.equal(work.status,'UNAVAILABLE');assert.equal(work.repeat,false);
  const view=await readBusinessPendingIncomeScan(f.env,{now:f.now});assert.equal(view.attempt.status,'UNAVAILABLE');assert.equal(view.attempt.code,'FINANCE_PENDING_INCOME_SCAN_'+error);assert.equal(view.attempt.next_attempt_at,stamp+1000);assert.equal(saved(f.db).status,'UNAVAILABLE');assert.equal(view.frame.scan.state,state);
 }
});

test('unknown sub-cent and conflicting-order totals stay unknown while a proven zero stays zero',async t=>{
 for(const [rows,expected] of [[[row('a','b','10.123',null)],null],[[row(),row('c','b','48',4800)],null],[[row('a','b','0',0)],0]]){
  const f=await fixture(t);await runBusinessPendingIncomeScan(f.env,async()=>frame({state:'COMPLETE',publication:report({rows})}),{now:f.now});const view=await readBusinessPendingIncomeScan(f.env,{now:f.now});assert.equal(view.frame.report.known_amount_cents,expected);assert.equal(view.frame.report.amount_complete,expected!==null);
 }
});

test('lease contention admits only one source call and an expired lease cannot publish late results',async t=>{
 const f=await fixture(t);let enter,release,calls=0;const entered=new Promise(resolve=>enter=resolve),wait=new Promise(resolve=>release=resolve);
 const pending=runBusinessPendingIncomeScan(f.env,async()=>{calls++;enter();await wait;return frame();},{now:f.now});await entered;
 assert.equal((await runBusinessPendingIncomeScan(f.env,async()=>{calls++;return frame();},{now:f.now})).status,'LEASED');assert.equal(calls,1);f.advance(91);release();assert.equal((await pending).status,'LEASED');assert.equal(saved(f.db),undefined);assert.equal((await readBusinessPendingIncomeScan(f.env,{now:f.now})).status,'PENDING');
});

test('pause before a run or after its response prevents persistence and preserves the prior completed frame',async t=>{
 const f=await fixture(t);let calls=0;assert.equal((await runBusinessPendingIncomeScan(f.env,async()=>{calls++;return frame();},{now:f.now,canRun:async()=>false})).status,'PAUSED');assert.equal(calls,0);assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='business_pending_income_scan'").get().n,0);
 const old=frame({state:'COMPLETE'});await runBusinessPendingIncomeScan(f.env,async()=>old,{now:f.now});const before=saved(f.db);f.advance(901);let allowed=true;
 const result=await runBusinessPendingIncomeScan(f.env,async()=>{calls++;allowed=false;return frame({checked:f.now()/1000,started:f.now()/1000,id:secondId});},{now:f.now,canRun:async()=>allowed});assert.equal(result.status,'PAUSED');assert.equal(result.source_reads,1);assert.deepEqual(saved(f.db),before);assert.deepEqual((await readBusinessPendingIncomeScan(f.env,{now:f.now})).frame,old);
});

test('untrusted failure strings, getters and invalid/future frames cannot leak or replace saved evidence',async t=>{
 const f=await fixture(t);const old=frame({state:'COMPLETE'});await runBusinessPendingIncomeScan(f.env,async()=>old,{now:f.now});
 for(const source of [async()=>{throw Object.assign(Error('PRIVATE_THROW'),{code:'PRIVATE_TOKEN'});},async()=>new Proxy({},{getOwnPropertyDescriptor(){throw Error('PRIVATE_PROXY');}}),async()=>frame({checked:f.now()/1000+61,started:f.now()/1000}),async()=>({...frame({checked:f.now()/1000,started:f.now()/1000}),extra:'PRIVATE_VALUE'}),async()=>({diagnostic:{get code(){throw Error('PRIVATE_GETTER');}}})]){
  f.advance(901);await runBusinessPendingIncomeScan(f.env,source,{now:f.now});const value=await readBusinessPendingIncomeScan(f.env,{now:f.now});assert.equal(value.attempt.code,'FINANCE_PENDING_INCOME_SCAN_UNAVAILABLE');assert.deepEqual(value.frame,old);assert.doesNotMatch(JSON.stringify(value),/PRIVATE_|message|order_sn|next_cursor/);
 }
});

test('strict browser-frozen projection accepts the same saved DTO and rejects accessors, unsafe fields and inconsistent statuses',async t=>{
 const f=await fixture(t);await runBusinessPendingIncomeScan(f.env,async()=>frame({state:'COMPLETE'}),{now:f.now});const value=await readBusinessPendingIncomeScan(f.env,{now:f.now});
 const context=vm.createContext({serialized:JSON.stringify(value),TextEncoder});vm.runInContext(projectIncomeDetailFrame.toString()+'\n'+projectPendingIncomeScanFrame.toString()+'\n'+projectBusinessPendingIncomeScan.toString()+'\nglobalThis.result=projectBusinessPendingIncomeScan(JSON.parse(serialized),projectPendingIncomeScanFrame);',context);assert.deepEqual(JSON.parse(JSON.stringify(context.result)),value);
 for(const invalid of [{...value,extra:'PRIVATE'},{...value,status:'PENDING'},{...value,attempt:{...value.attempt,code:'PRIVATE'}},{...value,attempt:null},{...value,frame:null}])assert.equal(projectBusinessPendingIncomeScan(invalid,projectPendingIncomeScanFrame),null);
 let getterCalls=0;const accessor={...value};Object.defineProperty(accessor,'frame',{get(){getterCalls++;return value.frame;}});assert.equal(projectBusinessPendingIncomeScan(accessor,projectPendingIncomeScanFrame),null);assert.equal(getterCalls,0);
});

test('corrupted persisted frames and clocks fail explicitly without invoking a source',async t=>{
 const f=await fixture(t);await f.db.batch(BUSINESS_PENDING_INCOME_SCAN_SCHEMA.map(sql=>f.db.prepare(sql)));
 f.db.db.prepare("INSERT INTO business_pending_income_scan(id,payload,payload_checked_at,last_attempt_at,status,code,next_attempt_at) VALUES(1,'{}',?,?, 'COMPLETE',NULL,?)").run(stamp,stamp,stamp+900);
 await assert.rejects(readBusinessPendingIncomeScan(f.env,{now:f.now}),error=>error instanceof BusinessPendingIncomeScanError&&error.code==='BUSINESS_PENDING_INCOME_SCAN_STORAGE_INVALID');
 for(const invalid of [()=>0,()=>NaN,()=>{throw Error('PRIVATE_CLOCK');}])await assert.rejects(readBusinessPendingIncomeScan(f.env,{now:invalid}),error=>error.code==='BUSINESS_PENDING_INCOME_SCAN_CLOCK_INVALID');
});
