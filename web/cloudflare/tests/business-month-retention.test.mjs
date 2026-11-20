import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFixture} from './business-collection-fixture.mjs';
import {readBusinessMonthDisplay} from '../src/business-month.mjs';
import {readCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {getFinanceBusinessPeriod} from '../src/app-business-period.mjs';
import {forwardFinancePaymentSample} from '../../finance/src/auth-router.mjs';
import {createFinanceWorker} from '../../finance/src/connection-worker.mjs';
import {runFinanceBusinessPeriod} from '../../finance/src/business-period.mjs';
import {retainFinanceBusinessPeriodPublication} from '../../finance/src/business-period-retention.mjs';
const month='2026-10';
async function fixture(t){const f=await collectionFixture({allPaid:true,daily:true,windowCounts:[1,1],paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});return f;}
async function complete(f){let value=await f.invoke('start');for(let i=0;value.status==='RUNNING'&&i<12;i++)value=await f.invoke('step');assert.equal(value.status,'COMPLETE');return value;}
const published=f=>readCompletedBusinessMonth(f.env,month,{now:f.now});
const parent=f=>f.env.ADMIN_DB.db.prepare('SELECT * FROM business_month_runs WHERE month=?').get(month);
const storedFrames=f=>f.env.ADMIN_DB.db.prepare('SELECT * FROM business_month_frames WHERE month=? ORDER BY slot_index').all(month);
const financialPins=f=>f.financeEnv.FINANCE_DB.db.prepare('SELECT * FROM finance_business_period_retentions ORDER BY reference_key').all();
const providerCalls=f=>f.calls.list.length+f.calls.detail.length+f.calls.payment.length;
async function prefix(f){f.clock.time+=901000;assert.equal((await f.invoke('start')).status,'RUNNING');assert.equal((await f.invoke('step')).status,'RUNNING');const frames=storedFrames(f);assert.equal(frames.length,1);assert.equal(JSON.parse(frames[0].payload).status,'COMPLETE');return frames[0];}

test('cold legacy complete GET remains visible without publishing or pinning; the next collector POST prepares and confirms it',async t=>{
 const f=await fixture(t);await complete(f);const original=await published(f),db=f.env.ADMIN_DB.db;
 db.exec('DELETE FROM business_month_publication_frames;DELETE FROM business_month_publications');const changes=db.prepare('SELECT total_changes() n').get().n,pins=financialPins(f),calls=f.calls.retention.length,providers=providerCalls(f);
 const view=await readBusinessMonthDisplay(f.env,{month},{now:f.now});assert.equal(view.display_source,'ACTIVE');assert.equal(view.display.status,'COMPLETE');assert.equal(view.audit_scope,null);assert.equal(db.prepare('SELECT total_changes() n').get().n,changes);assert.equal(f.calls.retention.length,calls);assert.deepEqual(financialPins(f),pins);assert.equal(providerCalls(f),providers);
 await f.invoke('step');const restored=await published(f);assert.deepEqual(restored.payload,original.payload);assert.equal(restored.row.revision,original.row.revision);assert.equal(providerCalls(f),providers);assert.equal(f.calls.retention.at(-1).operation,'confirm');
});

test('a lost post-CAS confirmation leaves a durable prepared source and the next POST confirms the actual App outbox',async t=>{
 const f=await fixture(t);await complete(f);const old=await published(f);await prefix(f);const real=f.services.retainFinanceBusinessPeriodPublication;let lost=false;
 f.services.retainFinanceBusinessPeriodPublication=async(...args)=>{const q=args[1];if(!lost&&q.operation==='confirm'&&q.publication_revision>old.row.revision){lost=true;throw Error('synthetic lost commit acknowledgement');}return real(...args);};
 let failed=false;for(let i=0;i<8&&!failed;i++){try{await f.invoke('step');}catch(error){assert.equal(error.message,'BUSINESS_MONTH_UNAVAILABLE');failed=true;}}
 assert.equal(failed,true);const actual=await published(f);assert.ok(actual.row.revision>old.row.revision);let pins=financialPins(f);assert.equal(pins.find(row=>row.kind==='PUBLICATION').publication_revision,old.row.revision);assert.ok(pins.some(row=>row.kind==='PENDING'&&row.publication_revision===actual.row.revision));
 const providers=providerCalls(f);await f.invoke('step');pins=financialPins(f);assert.equal(pins.find(row=>row.kind==='PUBLICATION').publication_revision,actual.row.revision);assert.equal(pins.filter(row=>row.kind==='PENDING'&&row.publication_revision<=actual.row.revision).length,0);assert.equal(providerCalls(f),providers);assert.deepEqual((await published(f)).payload,actual.payload);
});

test('an App CAS loser never confirms its prepared candidate or replaces the displayed publication',async t=>{
 const f=await fixture(t);await complete(f);const old=await published(f);await prefix(f);const real=f.services.retainFinanceBusinessPeriodPublication;let candidate=null;
 f.services.retainFinanceBusinessPeriodPublication=async(...args)=>{const q=args[1],result=await real(...args);if(candidate===null&&q.operation==='prepare'&&q.publication_revision>old.row.revision){candidate=q.publication_revision;f.env.ADMIN_DB.db.prepare('UPDATE business_month_runs SET revision=revision+1 WHERE month=?').run(month);}return result;};
 for(let i=0;i<8&&candidate===null;i++)await f.invoke('step');assert.ok(candidate!==null);assert.deepEqual(await published(f),old);assert.equal(financialPins(f).find(row=>row.kind==='PUBLICATION').publication_revision,old.row.revision);assert.ok(financialPins(f).some(row=>row.kind==='PENDING'&&row.publication_revision===candidate));assert.equal(f.calls.retention.some(q=>q.operation==='confirm'&&q.publication_revision===candidate),false);
});

test('a completed prefix renews inside the next collector request and survives sixty-run pressure while the month remains incomplete',async t=>{
 const f=await fixture(t);await f.invoke('start');await f.invoke('step');const first=storedFrames(f)[0],id=first.run_id,db=f.financeEnv.FINANCE_DB.db,originalStamp=f.now()/1000;
 const before=Object.fromEntries(['finance_business_period_orders','finance_business_order_evidence','finance_financial_order_components'].map(table=>[table,db.prepare('SELECT * FROM '+table+' WHERE run_id=?').all(id)]));
 for(let i=0;i<60;i++)db.prepare("INSERT INTO finance_business_period_runs SELECT ?,partner_id,shop_id,revision,status,start_date,end_date,time_from,time_to,?,checked_at,?,'',0,0,NULL,NULL,NULL FROM finance_business_period_runs WHERE run_id=?").run(crypto.randomUUID(),originalStamp,originalStamp+1,id);
 f.clock.time+=901000;const value=await f.invoke('step');assert.equal(value.status,'RUNNING');assert.ok(db.prepare('SELECT run_id FROM finance_business_period_runs WHERE run_id=?').get(id));
 for(const [table,rows] of Object.entries(before))assert.deepEqual(db.prepare('SELECT * FROM '+table+' WHERE run_id=?').all(id),rows);
 assert.equal(storedFrames(f)[0].payload,first.payload);assert.ok(financialPins(f).some(row=>row.kind==='COHORT'&&row.lease_id===id&&row.expires_at>f.now()/1000));assert.ok(f.calls.retentionInline.length>0);assert.equal(await published(f),null);
});

test('only a closed retention 404 queues an audited successor cohort; GET and the old publication remain unchanged',async t=>{
 const f=await fixture(t);await complete(f);const old=await published(f),first=await prefix(f),originalParent=parent(f),originalFrames=storedFrames(f),db=f.financeEnv.FINANCE_DB.db;
 for(const table of ['finance_financial_order_components','finance_business_order_evidence','finance_business_period_orders','finance_business_period_cursors','finance_business_period_payment_cache','finance_business_period_runs'])db.prepare('DELETE FROM '+table+' WHERE run_id=?').run(first.run_id);
 const real=f.services.getFinanceBusinessPeriod;f.services.getFinanceBusinessPeriod=async()=>({schema:'finance_business_period_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_BUSINESS_HTTP_ERROR',http:404}});await assert.rejects(()=>f.invoke('step'));assert.equal(f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM business_month_cohort_source_recoveries').get().n,0);f.services.getFinanceBusinessPeriod=real;
 const router='synthetic-prefix-router-'.repeat(3),app='synthetic-prefix-app-'.repeat(3),worker=createFinanceWorker({businessPeriod:runFinanceBusinessPeriod,businessRetention:retainFinanceBusinessPeriodPublication,fetchImpl:f.fetchImpl,now:f.now});
 f.services.getFinanceBusinessPeriod=(_env,input,options={})=>getFinanceBusinessPeriod({APP_INTERNAL_SECRET:app},input,{...options,fetchImpl:request=>forwardFinancePaymentSample(request,{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:upstream=>worker.fetch(upstream,{...f.financeEnv,FINANCE_ROUTER_SECRET:router})}},{validateInternalApp:request=>request.headers.get('x-braza-app-key')===app})});
 await assert.rejects(()=>f.invoke('step'),{message:'BUSINESS_MONTH_SOURCE_RETENTION_RUN_NOT_FOUND'});assert.deepEqual(parent(f),originalParent);assert.deepEqual(storedFrames(f),originalFrames);assert.deepEqual(await published(f),old);
 const audit=f.env.ADMIN_DB.db.prepare('SELECT * FROM business_month_cohort_source_recoveries').get();assert.equal(audit.original_frame,first.payload);assert.equal(audit.parent_payload,originalParent.payload);assert.equal(audit.replacement_parent_revision,null);
 const retentionCalls=f.calls.retention.length;await f.invoke('read');assert.equal(f.calls.retention.length,retentionCalls);assert.deepEqual(parent(f),originalParent);
 assert.equal((await f.invoke('step')).status,'RUNNING');const replaced=f.env.ADMIN_DB.db.prepare('SELECT * FROM business_month_cohort_source_recoveries').get();assert.equal(replaced.replacement_parent_revision,originalParent.revision+1);assert.equal(replaced.original_frame,audit.original_frame);assert.notEqual(storedFrames(f)[0].run_id,first.run_id);assert.deepEqual(await published(f),old);
 let result;for(let i=0;i<12;i++){result=await f.invoke('step');if(result.status==='COMPLETE')break;}assert.equal(result.status,'COMPLETE');assert.ok((await published(f)).row.revision>old.row.revision);
});
