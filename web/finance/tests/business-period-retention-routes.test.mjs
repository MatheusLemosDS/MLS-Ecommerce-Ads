import test from 'node:test';
import assert from 'node:assert/strict';
import {createBusinessPeriodRetentionWorker} from '../src/business-period-retention-worker.mjs';
import {FINANCE_BUSINESS_RETENTION_PATH,projectBusinessPeriodRetentionRequest,projectBusinessPeriodRetentionResponse,businessPeriodRetentionResponseMatches} from '../src/business-period-retention-frame.mjs';
import {getFinanceFinancialAutomation} from '../../cloudflare/src/app-financial-automation.mjs';
import {forwardFinancialPrivate} from '../../cloudflare/src/financial-auth-router.mjs';
import {projectFinancialSourceRequest,financialSourceResponseMatches,FINANCIAL_SOURCE_PATH} from '../src/financial-source-frame.mjs';
import {createFinancialSourceWorker,readFinancialSourceEvidence} from '../src/financial-source-worker.mjs';
import {commercialFinanceCapability} from '../../cloudflare/src/commercial-finance-capability.mjs';
const origin='https://auth.brazacommerce.com.br',router='synthetic-retention-router-secret-'.repeat(2),app='synthetic-retention-app-secret-'.repeat(2),at=Date.parse('2026-11-20T12:00:00.000Z'),now=()=>at,id='00000000-0000-4000-8000-000000000001';
const manifest={kind:'PUBLICATION',month:'2026-10',publication_revision:5,slots:[{slot_index:0,run_id:id,revision:2,start_date:'2026-10-01',end_date:'2026-10-15'}]};
const command=(changes={})=>({schema:'finance_business_period_retention_request_v1',operation:'prepare',...structuredClone(manifest),lease_id:null,...changes});
const ack=(q)=>({schema:'finance_business_period_retention_v1',state:q.kind==='PUBLICATION'&&q.operation!=='confirm'?'PREPARED':'RETAINED',kind:q.kind,month:q.month,publication_revision:q.publication_revision,retained_slots:q.slots.length,retained_at:at/1000,lease_id:q.kind==='COHORT'?q.lease_id:null,expires_at:q.kind==='COHORT'?at/1000+900:null});
const request=(value,changes={})=>new Request(origin+(changes.path??FINANCE_BUSINESS_RETENTION_PATH)+(changes.query??''),{method:changes.method??'POST',headers:{'content-type':'application/json','x-braza-finance-router':changes.secret??router},...(changes.method==='GET'?{}:{body:JSON.stringify(value)})});

test('strict retention wire binds prepare, commit and cohort receipts without accepting private or mismatched material',()=>{
 for(const q of [command(),command({operation:'confirm'}),command({kind:'COHORT',operation:'retain',lease_id:id})]){assert.ok(projectBusinessPeriodRetentionRequest(q));assert.ok(projectBusinessPeriodRetentionResponse(ack(q)));assert.equal(businessPeriodRetentionResponseMatches(q,ack(q)),true);assert.equal(businessPeriodRetentionResponseMatches(q,{...ack(q),publication_revision:99}),false);}
 for(const q of [command({kind:'COHORT',lease_id:id}),command({lease_id:id}),command({shop_id:99}),command({slots:[{...manifest.slots[0],end_date:'2026-10-16'}]}),command({slots:[{...manifest.slots[0],slot_index:1}]}),command({slots:[{...manifest.slots[0],run_id:'private-order'}]})])assert.equal(projectBusinessPeriodRetentionRequest(q),null);
 for(const change of [{retained_slots:0},{state:'CONFIRMED'},{month:'2026-13'},{publication_revision:-1},{private_token:'PRIVATE'}])assert.equal(projectBusinessPeriodRetentionResponse({...ack(command()),...change}),null);
});

test('one authenticated App Auth Finance retention exchange strips credentials and never invokes a provider',async()=>{
 const calls=[];const worker=createBusinessPeriodRetentionWorker({now,prepare:async(_env,q)=>{calls.push(q);return ack(command());},confirm:async(_env,q)=>{calls.push(q);return ack(command({operation:'confirm'}));}});
 const env={APP_INTERNAL_SECRET:app};let serviceCalls=0;
 const fetchImpl=request=>forwardFinancialPrivate(request,{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:upstream=>{serviceCalls++;assert.equal(upstream.headers.get('x-braza-app-key'),null);assert.equal(upstream.headers.get('cookie'),null);assert.equal(upstream.headers.get('x-braza-finance-router'),router);return worker.fetch(upstream,{FINANCE_ROUTER_SECRET:router});}}},{validateInternalApp:req=>req.headers.get('x-braza-app-key')===app});
 for(const q of [command(),command({operation:'confirm'})]){const result=await getFinanceFinancialAutomation(env,'retention',q,{fetchImpl});assert.equal(result.status,200);assert.equal(result.body.state,q.operation==='prepare'?'PREPARED':'RETAINED');}
 assert.equal(serviceCalls,2);assert.equal(calls.length,2);assert.deepEqual(calls[0],manifest);assert.equal(await commercialFinanceCapability(request(command())),'finance.read');
});

test('retention authentication and closed selectors fail before any source mutation',async()=>{
 let calls=0;const worker=createBusinessPeriodRetentionWorker({now,prepare:async()=>{calls++;throw Error();}});
 for(const [req,status] of [[request(command(),{secret:'wrong'}),403],[request(command(),{method:'GET'}),405],[request(command(),{query:'?shop_id=99'}),400],[request(command({scope:{organization_id:'other'}})),400],[new Request(origin+FINANCE_BUSINESS_RETENTION_PATH,{method:'POST',headers:{'content-type':'application/json','x-braza-finance-router':router},body:'{'}),400]])assert.equal((await worker.fetch(req,{FINANCE_ROUTER_SECRET:router})).status,status);
 assert.equal(calls,0);
});

test('V4 evidence retains its exact declared cohort before reading, while V2 remains unchanged',async()=>{
 const q={schema:'financial_source_request_v4',operation:'evidence',run_id:id,cursor:null,limit:1,expected_revision:2,retention:{...manifest,kind:'COHORT',lease_id:id}},order=[];
 assert.ok(projectFinancialSourceRequest(q));assert.equal(projectFinancialSourceRequest({...q,expected_revision:3}),null);assert.equal(projectFinancialSourceRequest({...q,retention:{...q.retention,month:'2026-11'}}),null);
 const env={FINANCE_ROUTER_SECRET:router},snapshot={schema:'financial_order_evidence_snapshot_v1',run:{run_id:id,revision:2,status:'COMPLETE',start_date:'2026-10-01',end_date:'2026-10-15',cutoff_at:at/1000-100,checked_at:at/1000},missing_orders:0,invalid_orders:0,orders:[]};
 const worker=createFinancialSourceWorker({now,retainSources:async(_env,value)=>{order.push('retain');assert.deepEqual(value,q.retention);return ack({...q.retention,operation:'retain'});},readEvidence:(env,value,options)=>{order.push('read');return readFinancialSourceEvidence(env,value,{...options,readEvidence:async()=>snapshot,readComponents:async()=>({schema:'financial_order_components_snapshot_v1',run_id:id,source_revision:2,status:'AVAILABLE',missing_orders:0,invalid_orders:0,orders:[]})});}});
 const response=await worker.fetch(request(q,{path:FINANCIAL_SOURCE_PATH}),env),frame=await response.json();assert.equal(response.status,200);assert.equal(frame.schema,'financial_source_evidence_v2');assert.equal(financialSourceResponseMatches(q,frame),true);assert.deepEqual(order,['retain','read']);
 const v2={...q,schema:'financial_source_request_v2'};delete v2.retention;order.length=0;assert.equal((await worker.fetch(request(v2,{path:FINANCIAL_SOURCE_PATH}),env)).status,200);assert.deepEqual(order,['read']);
 for(const [code,status] of [['RUN_NOT_FOUND',404],['LEASE_LIMIT',409]]){order.length=0;const failed=createFinancialSourceWorker({now,retainSources:async()=>{throw Object.assign(Error(),{code:'FINANCE_BUSINESS_RETENTION_'+code,status});},readEvidence:async()=>{order.push('read');throw Error();}}),r=await failed.fetch(request(q,{path:FINANCIAL_SOURCE_PATH}),env);assert.equal(r.status,status);assert.deepEqual(order,[]);assert.equal((await r.json()).error,'FINANCE_BUSINESS_RETENTION_'+code);}
});
