import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {BUSINESS_SYNC_SCHEMA,readBusinessSyncState} from '../src/business-sync.mjs';
import {buildBusinessMonthView,projectBusinessMonthView,projectBusinessMonthAuditScope,requestBusinessMonthRefresh,BusinessMonthViewError} from '../src/business-month-view-state.mjs';
import {projectExpenseSchedule} from '../src/expense-schedule.mjs';

const clock=Date.UTC(2026,9,25,15),stamp=clock/1000,now=()=>clock;
function monthly({complete=false,month='2026-10',at=stamp}={}){
 const end=month==='2026-10'?'2026-10-25':'2026-09-30',windows=Math.ceil(Number(end.slice(8))/15);
 const value={schema:'business_month_v1',month,start_date:month+'-01',end_date:end,status:complete?'COMPLETE':'RUNNING',checked_at:at,progress:{windows_total:windows,windows_complete:complete?windows:0,pages_read:complete?windows:0,order_capacity:complete?windows*20:0},coverage:{orders:0,paid:0,completed:0,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:0,payment_missing:0,returns:0,returns_unknown:0},sales_cents:complete?0:null,known_sales_cents:0,expected_repass_cents:complete?0:null,known_expected_repass_cents:0,production_cost_cents:complete?0:null,known_production_cost_cents:0,invoice_tax_cents:complete?0:null,known_invoice_tax_cents:0,ads_adjustment_cents:complete?0:null,ads:null,expenses:{revision:0,external_expenses_cents:null,recharge_treatment:'UNCONFIRMED',updated_at:null},result:{net_estimate_cents:null,net_profit_cents:null,net_margin_bps:null,pending:[...(complete?[]:['COLLECTING','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADJUSTMENT_UNAVAILABLE']),'ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED'],basis:'PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE'},unmapped_variants:[],bindings_revision:1,costs_revision:1,source_checked_at:{finance_oldest_at:complete?at-5:null,finance_latest_at:complete?at-2:null,ads_at:null},collection:{schema:'business_month_collection_v1',state:'READY',code:null,retry_after_seconds:0}};
 assert.ok(projectBusinessMonth(value));return value;
}
function policy(changes={}){return {enabled:true,status:'RUNNING',next_run_at:stamp+60,last_attempt_at:stamp-5,...changes};}
function environment(){const ADMIN_DB=new D1();for(const sql of BUSINESS_SYNC_SCHEMA)ADMIN_DB.db.exec(sql);return {ADMIN_DB};}
const stored=env=>({...env.ADMIN_DB.db.prepare('SELECT * FROM business_sync_state WHERE id=1').get()});
const view=(display,active=display,display_source='ACTIVE',sync=policy(),options={now})=>buildBusinessMonthView({display,active,display_source},sync,options);

test('a published monthly result stays separate from active collection coverage and original source clocks',()=>{
 const display=monthly({complete:true,at:stamp-40}),active=monthly(),value=view(display,active,'PUBLISHED');
 assert.equal(value.display_source,'PUBLISHED');assert.equal(value.display.status,'COMPLETE');assert.equal(value.display.production_cost_cents,0);assert.equal(value.display.checked_at,stamp-40);
 assert.equal(value.collection.status,'RUNNING');assert.equal(value.collection.progress.pages_read,0);assert.equal(value.collection.checked_at,stamp);assert.equal(value.collection.source_checked_at.finance_oldest_at,null);assert.equal(value.automatic.applicable,true);
 assert.equal(value.display.result.net_profit_cents,null);assert.equal(value.display.result.net_estimate_cents,null);
 value.collection.coverage.orders=19;value.display.source_checked_at.finance_oldest_at=1;assert.equal(active.coverage.orders,0);assert.equal(display.source_checked_at.finance_oldest_at,stamp-45);
 assert.ok(projectBusinessMonthView(view(display,active,'PUBLISHED'),projectBusinessMonth));
});

test('an empty active month is valid without a source call and historical/BRT selection stays explicit',()=>{
 const active=monthly(),value=view(active);assert.equal(value.display_source,'ACTIVE');assert.equal(value.display.status,'RUNNING');assert.equal(value.collection.progress.pages_read,0);assert.equal(value.automatic.applicable,true);
 const old=monthly({month:'2026-09',complete:true});assert.equal(view(old).automatic.applicable,false);
 // UTC has entered November while the store is still on October 31 in Brasilia.
 const brt=()=>Date.UTC(2026,10,1,1);assert.equal(view(active,active,'ACTIVE',policy(),{now:brt}).automatic.applicable,true);
});

test('the embedded projector is self-contained and rejects mismatched active metadata, extra fields and getters',()=>{
 const value=view(monthly()),sandbox={serialized:JSON.stringify(value)};
 const detached=vm.runInNewContext('('+projectBusinessMonthView.toString()+')(JSON.parse(serialized), value=>value)',sandbox);
 assert.deepEqual(JSON.parse(JSON.stringify(detached)),value);
 const invalid=structuredClone(value);invalid.collection.coverage.orders=1;assert.equal(projectBusinessMonthView(invalid,projectBusinessMonth),null);
 const invalidDisplay=structuredClone(value);invalidDisplay.display_source='PUBLISHED';assert.equal(projectBusinessMonthView(invalidDisplay,projectBusinessMonth),null);
 const customer=structuredClone(value);customer.collection.order_sn='private';assert.equal(projectBusinessMonthView(customer,projectBusinessMonth),null);
 let reads=0;const accessor={...value};Object.defineProperty(accessor,'display',{enumerable:true,get(){reads++;return value.display;}});assert.equal(projectBusinessMonthView(accessor,projectBusinessMonth),null);assert.equal(reads,0);
 assert.throws(()=>view(monthly(),monthly(),'PUBLISHED'),error=>error instanceof BusinessMonthViewError&&error.message==='BUSINESS_MONTH_VIEW_INVALID');
});

function publishedScope(display){
 const month=display.month,last=Number(display.end_date.slice(8));
 return {publication_revision:7,start_date:display.start_date,end_date:display.end_date,sources:Array.from({length:Math.ceil(last/15)},(_,index)=>({run_id:String(index+1).repeat(8)+'-1111-4111-8111-111111111111',source_revision:index+2,start_date:month+'-'+String(index*15+1).padStart(2,'0'),end_date:month+'-'+String(Math.min(index*15+15,last)).padStart(2,'0')}))};
}

test('negotiated view carries the exact published identities and keeps the previous view contract unchanged',()=>{
 const display=monthly({complete:true}),active=monthly(),audit_scope=publishedScope(display),observed={display,active,display_source:'PUBLISHED',audit_scope};
 const legacy=buildBusinessMonthView(observed,policy(),{now});
 assert.equal(legacy.schema,'business_month_view_v1');assert.equal(Object.hasOwn(legacy,'audit_scope'),false);
 assert.deepEqual(Object.keys(legacy),['schema','month','display','display_source','collection','automatic']);
 const value=buildBusinessMonthView(observed,policy(),{now,contract:'business-month-view-v2'});
 assert.equal(value.schema,'business_month_view_v2');assert.deepEqual(value.audit_scope,audit_scope);assert.deepEqual(value.display,legacy.display);
 const detached=vm.runInNewContext('('+projectBusinessMonthView.toString()+')(JSON.parse(serialized),value=>value,('+projectBusinessMonthAuditScope.toString()+'))',{serialized:JSON.stringify(value)});
 assert.deepEqual(JSON.parse(JSON.stringify(detached)),value);
 value.audit_scope.sources[0].source_revision=99;assert.equal(audit_scope.sources[0].source_revision,2);
 // Matching totals, dates and source clocks cannot identify a publication.
 const next=structuredClone(observed);next.audit_scope.publication_revision++;next.audit_scope.sources[0].run_id='99999999-9999-4999-8999-999999999999';
 const updated=buildBusinessMonthView(next,policy(),{now,contract:'business-month-view-v2'});
 assert.deepEqual(updated.display,legacy.display);assert.notDeepEqual(updated.audit_scope,audit_scope);
});

test('v4 carries an expense due schedule only for the same published month and preserves v1-v3 shapes',()=>{
 const display=monthly({complete:true}),active=monthly(),audit_scope=publishedScope(display),expense_schedule={schema:'expense_schedule_v1',month:'2026-10',today:'2026-10-25',status:'AVAILABLE',mode:'CONFIRMED',open_count:2,open_cents:30000,overdue_count:1,overdue_cents:10000,due_today_count:0,due_today_cents:0,due_next_7_days_count:1,due_next_7_days_cents:20000,next_due_date:'2026-10-27',next_due_count:1,next_due_cents:20000,upcoming:[{id:'11111111-1111-4111-8111-111111111111',category:'BILL',description:'Conta de energia',amount_cents:20000,due_date:'2026-10-27',installment_number:1,installments:1}],basis:'OWNER_DECLARED_DUE_DATES_NOT_BANK_SETTLEMENT'};
 const observed={display,active,display_source:'PUBLISHED',audit_scope,source_frames:[],expense_schedule};
 const v3=buildBusinessMonthView(observed,policy(),{now,contract:'business-month-view-v3'});assert.equal(Object.hasOwn(v3,'expense_schedule'),false);
 const v4=buildBusinessMonthView(observed,policy(),{now,contract:'business-month-view-v4'});assert.equal(v4.schema,'business_month_view_v4');assert.deepEqual(v4.expense_schedule,expense_schedule);assert.deepEqual(v4.audit_scope,audit_scope);assert.ok(Object.hasOwn(v4,'daily_summary'));
 assert.deepEqual(projectBusinessMonthView(v4,projectBusinessMonth,projectBusinessMonthAuditScope,value=>value,projectExpenseSchedule),v4);
 const wrong=structuredClone(v4);wrong.expense_schedule.month='2026-09';assert.equal(projectBusinessMonthView(wrong,projectBusinessMonth,projectBusinessMonthAuditScope,value=>value,projectExpenseSchedule),null);
 const activeV4=buildBusinessMonthView({display:active,active,display_source:'ACTIVE',audit_scope:null,source_frames:null,expense_schedule:null},policy(),{now,contract:'business-month-view-v4'});assert.equal(activeV4.expense_schedule,null);
});

test('active or unscoped views cannot claim a published audit cohort',()=>{
 const active=monthly(),display=monthly({complete:true}),options={now,contract:'business-month-view-v2'};
 const value=buildBusinessMonthView({display:active,active,display_source:'ACTIVE',audit_scope:null},policy(),options);
 assert.equal(value.audit_scope,null);assert.ok(projectBusinessMonthView(value,projectBusinessMonth,projectBusinessMonthAuditScope));
 assert.equal(projectBusinessMonthView(value,projectBusinessMonth),null);
 assert.throws(()=>buildBusinessMonthView({display,active,display_source:'PUBLISHED'},policy(),options),{message:'BUSINESS_MONTH_VIEW_INVALID'});
 assert.throws(()=>buildBusinessMonthView({display:active,active,display_source:'ACTIVE',audit_scope:publishedScope(display)},policy(),options),{message:'BUSINESS_MONTH_VIEW_INVALID'});
 assert.throws(()=>buildBusinessMonthView({display,active,display_source:'PUBLISHED',audit_scope:publishedScope(display)},policy(),{now,contract:'future'}),error=>error.status===409);
});

test('audit identities reject wrong dates, overlapping windows, duplicate runs and unsafe values without invoking getters',()=>{
 const scope=publishedScope(monthly({complete:true}));
 assert.ok(projectBusinessMonthAuditScope(scope));
 for(const mutate of [value=>value.publication_revision=0,value=>value.publication_revision=2147483648,value=>value.start_date='2026-10-02',value=>value.end_date='2026-10-32',value=>value.sources.pop(),value=>value.sources[0].source_revision=0,value=>value.sources[0].order_sn='private',value=>value.sources[0].run_id='not-a-run',value=>value.sources[0].end_date='2026-10-16',value=>value.sources[1].run_id=value.sources[0].run_id,value=>value.sources.reverse()]){
  const invalid=structuredClone(scope);mutate(invalid);assert.equal(projectBusinessMonthAuditScope(invalid),null);
 }
 let reads=0;const getter=structuredClone(scope);Object.defineProperty(getter.sources,'0',{enumerable:true,get(){reads++;return scope.sources[0];}});assert.equal(projectBusinessMonthAuditScope(getter),null);assert.equal(reads,0);
 const display=monthly({complete:true}),valid=buildBusinessMonthView({display,active:monthly(),display_source:'PUBLISHED',audit_scope:scope},policy(),{now,contract:'business-month-view-v2'}),wrongMonth=structuredClone(valid);
 wrongMonth.audit_scope=publishedScope(monthly({month:'2026-09',complete:true}));assert.equal(projectBusinessMonthView(wrongMonth,projectBusinessMonth,projectBusinessMonthAuditScope),null);
});

test('a priority request changes only the local eligible due time in one batch and never reads source bindings',async()=>{
 const env=environment(),db=env.ADMIN_DB;db.db.prepare("UPDATE business_sync_state SET status='COMPLETE',next_run_at=?,month='2026-10',last_success_at=?,summary=NULL").run(stamp+300,stamp-5);
 Object.defineProperty(env,'getFinanceBusinessPeriod',{get(){throw Error('provider must not be read');}});
 const before=stored(env),batch=db.batch.bind(db),calls=[];db.batch=async statements=>{calls.push(statements.length);return batch(statements);};
 const result=await requestBusinessMonthRefresh(env,{month:'2026-10'},{now});
 assert.deepEqual(result,{schema:'business_month_refresh_request_v1',month:'2026-10',status:'QUEUED',next_run_at:stamp,lease_expires_at:null});assert.deepEqual(calls,[2]);
 assert.deepEqual(stored(env),{...before,next_run_at:stamp});assert.equal((await readBusinessSyncState(env)).revision,1);
});

test('priority joins a concurrent lease and preserves paused policy, genuine provider backoff and already-due work',async()=>{
 for(const kind of ['LEASE','PAUSED','BACKOFF','ALREADY_DUE']){
  const env=environment(),db=env.ADMIN_DB;db.db.prepare('UPDATE business_sync_state SET next_run_at=?').run(kind==='ALREADY_DUE'?stamp-50:stamp+300);
  if(kind==='LEASE')db.db.prepare("UPDATE business_sync_state SET status='RUNNING',lease_token='11111111-1111-4111-8111-111111111111',lease_expires_at=?").run(stamp+120);
  if(kind==='PAUSED')db.db.prepare("UPDATE business_sync_state SET enabled=0,status='PAUSED'").run();
  if(kind==='BACKOFF')db.db.prepare("UPDATE business_sync_state SET status='ERROR',failure_count=3,last_error='BUSINESS_SYNC_SOURCE_RATE_LIMIT'").run();
  const before=stored(env),result=await requestBusinessMonthRefresh(env,{month:'2026-10'},{now});
  assert.equal(result.status,({LEASE:'RUNNING',PAUSED:'PAUSED',BACKOFF:'RETRY_WAIT',ALREADY_DUE:'QUEUED'})[kind]);assert.deepEqual(stored(env),before);
 }
 const env=environment(),batch=env.ADMIN_DB.batch.bind(env.ADMIN_DB);env.ADMIN_DB.batch=async statements=>{env.ADMIN_DB.db.prepare("UPDATE business_sync_state SET enabled=0,status='PAUSED',next_run_at=?").run(stamp+300);return batch(statements);};
 assert.equal((await requestBusinessMonthRefresh(env,{month:'2026-10'},{now})).status,'PAUSED');assert.equal(stored(env).next_run_at,stamp+300);
});

test('priority rejects historical/invalid input and missing storage without initializing tables or leaking errors',async()=>{
 const env=environment(),before=stored(env);let reads=0;
 const accessor={};Object.defineProperty(accessor,'month',{enumerable:true,get(){reads++;return '2026-10';}});
 for(const input of [{month:'2026-09'},{month:'2026-11'},{month:'2026-10',operation:'start'},accessor])await assert.rejects(requestBusinessMonthRefresh(env,input,{now}),error=>error instanceof BusinessMonthViewError&&error.status===400);
 assert.equal(reads,0);assert.deepEqual(stored(env),before);
 const empty={ADMIN_DB:new D1()};await assert.rejects(requestBusinessMonthRefresh(empty,{month:'2026-10'},{now}),error=>error instanceof BusinessMonthViewError&&error.message==='BUSINESS_MONTH_VIEW_STORAGE_UNAVAILABLE');assert.deepEqual(empty.ADMIN_DB.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(),[]);
});
