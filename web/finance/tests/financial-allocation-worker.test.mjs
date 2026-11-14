import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {commercialContextFromPrincipal} from '../../cloudflare/src/commercial-context.mjs';
import {EXTERNAL_CASH_SCHEMA,readExternalCashStorageContext} from '../src/external-cash-store.mjs';
import {FINANCIAL_ALLOCATION_PATH,createFinancialAllocationWorker,resolveFinancialAllocationCashRecords} from '../src/financial-allocation-worker.mjs';
import {projectFinancialAllocationResponse} from '../src/financial-allocation-frame.mjs';
const secret='synthetic-router-secret-'.repeat(3),schema='financial_cash_allocation_request_v1';
const ids={transfer:'a'.repeat(64),bankA:'b'.repeat(64),bankB:'c'.repeat(64)};
const selected=(record_id,amount_cents)=>({record_id,amount_cents});
const preview=()=>({schema,operation:'preview',relation:'TRANSFER_DEPOSIT',left:[selected(ids.transfer,4000)],right:[selected(ids.bankA,4000)]});
const req=(body,{method='POST',path=FINANCIAL_ALLOCATION_PATH,headers={}}={})=>new Request('https://auth.brazacommerce.com.br'+path,{method,headers:{'content-type':'application/json','x-braza-finance-router':secret,...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});
async function fixture({seed=true}={}){
 const env={FINANCE_ROUTER_SECRET:secret,FINANCE_DB:new D1(),ADMIN_DB:new D1()};
 if(seed){await env.FINANCE_DB.batch(EXTERNAL_CASH_SCHEMA.map(sql=>env.FINANCE_DB.prepare(sql)));const {tenant}=await readExternalCashStorageContext(env);
 for(const [record_id,source,amount,status] of [[ids.transfer,'SHOPEE',10000,'COMPLETED'],[ids.bankA,'NUBANK',4000,'POSTED'],[ids.bankB,'NUBANK',6000,'POSTED']])await env.FINANCE_DB.prepare("INSERT INTO finance_external_cash_records(tenant,record_id,source,date,amount_cents,currency,external_id,reference,description,reported_status,status,import_id,review_hint,created_at) VALUES(?,?,?,'2026-11-13',?,'BRL',?,'SYNTHETIC_PRIVATE_REFERENCE','SYNTHETIC_PRIVATE_DESCRIPTION',NULL,?,'synthetic-import',0,1)").bind(tenant,record_id,source,amount,'SYNTHETIC_PRIVATE_ID_'+record_id,status).run();}
 return {env,close(){env.FINANCE_DB.db.close();env.ADMIN_DB.db.close();}};
}
test('bounded private route rejects untrusted origin, headers, methods, body scope and unsupported financial actions',async()=>{
 const f=await fixture({seed:false});try{const worker=createFinancialAllocationWorker();
 for(const [request,status] of [[req({schema,operation:'read'},{headers:{'x-braza-finance-router':'wrong'}}),403],[req({schema,operation:'read'},{method:'GET'}),405],[req({schema,operation:'read'},{path:FINANCIAL_ALLOCATION_PATH+'?tenant=other'}),400],[req({...preview(),scope:{organization_id:'other'}}),400],[req({schema,operation:'withdraw',amount_cents:100}),400],[req({schema,operation:'read'},{headers:{'content-length':'32769'}}),413]]){const r=await worker.fetch(request,f.env);assert.equal(r.status,status);assert.equal((await r.json()).schema,'financial_cash_error_v1');}
 assert.equal(f.env.FINANCE_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);
 }finally{f.close();}
});
test('read-only cold workspace has no fabricated bank balance and never initializes finance tables',async()=>{
 const f=await fixture({seed:false});try{const r=await createFinancialAllocationWorker().fetch(req({schema,operation:'read'}),f.env);assert.equal(r.status,200);const body=await r.json();assert.ok(projectFinancialAllocationResponse(body));assert.deepEqual(body.groups,[]);assert.equal(body.scope.organization_id,'legacy-brazacommerce');assert.equal(Object.hasOwn(body,'bank_balance_cents'),false);assert.equal(f.env.FINANCE_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);
 }finally{f.close();}
});
test('server resolver minimizes imported cash evidence and does not promote arbitrary references to automatic identity',async()=>{
 const f=await fixture();try{const scope={organization_id:'legacy-brazacommerce',store_id:'legacy-shopee',currency:'BRL'},records=await resolveFinancialAllocationCashRecords(f.env,[ids.transfer,ids.bankA],{scope});assert.equal(records.length,2);assert.ok(records.every(x=>x.identity_unique===false&&x.native_reference===null));assert.doesNotMatch(JSON.stringify(records),/SYNTHETIC_PRIVATE/);assert.equal(records.find(x=>x.record_id===ids.bankA).account_id,'legacy-nubank-imports');
 }finally{f.close();}
});
test('real handler previews, persists installments, retries exactly and reverses without duplicating revenue',async()=>{
 const f=await fixture();try{const worker=createFinancialAllocationWorker({now:()=>Date.parse('2026-11-13T15:00:00Z')});let r=await worker.fetch(req(preview()),f.env);assert.equal(r.status,200);assert.equal((await r.json()).group.state,'SUGGESTED');
 const body={...preview(),operation:'confirm',request_id:'synthetic-confirm',expected_revision:0,confirmation:{confirmed:true,reason_code:'OPERATOR_VERIFIED'}};r=await worker.fetch(req(body),f.env);assert.equal(r.status,200);const saved=await r.json();assert.ok(projectFinancialAllocationResponse(saved));assert.equal(saved.group.accounting_effect,'SETTLEMENT_ONLY_NO_NEW_REVENUE');assert.equal(r.headers.get('cache-control'),'private, no-store');
 const retry=await(await worker.fetch(req(body),f.env)).json();assert.equal(retry.replayed,true);assert.equal(retry.group_id,saved.group_id);assert.doesNotMatch(JSON.stringify(retry),/SYNTHETIC_PRIVATE/);
 r=await worker.fetch(req({schema,operation:'reverse',request_id:'synthetic-reverse',expected_revision:1,group_id:saved.group_id,reason_code:'OPERATOR_VERIFIED'}),f.env);assert.equal(r.status,200);assert.equal((await r.json()).revision,2);const workspace=await(await worker.fetch(req({schema,operation:'read'}),f.env)).json();assert.equal(workspace.groups[0].state,'REVERSED');assert.ok(projectFinancialAllocationResponse(workspace));
 }finally{f.close();}
});
test('revocation during source resolution prevents persistence and delivery',async()=>{
 const f=await fixture();try{let allowed=true;const worker=createFinancialAllocationWorker({authorize:async()=>allowed,resolveRecords:async({env,ids,scope,storageContext})=>{const values=await resolveFinancialAllocationCashRecords(env,ids,{scope,storageContext});allowed=false;return values;}});const body={...preview(),operation:'confirm',request_id:'synthetic-confirm',expected_revision:0,confirmation:{confirmed:true,reason_code:'OPERATOR_VERIFIED'}};const r=await worker.fetch(req(body),f.env);assert.equal(r.status,403);assert.equal((await r.json()).error,'FINANCIAL_CASH_AUTHORIZATION_REVOKED');assert.equal(f.env.FINANCE_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='finance_financial_cash_groups'").get().n,0);
 }finally{f.close();}
});
test('T05 trusted receivable evidence supports two orders settling one deposit through the real handler',async()=>{
 const f=await fixture({seed:false});try{
 const worker=createFinancialAllocationWorker({resolveRecords:async({ids,scope})=>[['receivable-a','RECEIVABLE',6000,'RELEASED'],['receivable-b','RECEIVABLE',4000,'RELEASED'],['bank-deposit','BANK_TRANSACTION',10000,'POSTED']].filter(([id])=>ids.includes(id)).map(([record_id,kind,amount_cents,status])=>({...scope,record_id,kind,amount_cents,status,revision:1,account_id:kind==='RECEIVABLE'?'synthetic-receivable-account':'synthetic-bank-account',date:'2026-11-13',evidence_id:'synthetic-authorized-evidence',native_reference:null,identity_unique:false}))});
 const command={schema,operation:'confirm',request_id:'synthetic-two-orders',expected_revision:0,relation:'RECEIVABLE_DEPOSIT',left:[selected('receivable-a',6000),selected('receivable-b',4000)],right:[selected('bank-deposit',10000)],confirmation:{confirmed:true,reason_code:'OPERATOR_VERIFIED'}};
 const response=await worker.fetch(req(command),f.env);assert.equal(response.status,200);const frame=await response.json();assert.ok(projectFinancialAllocationResponse(frame));assert.equal(frame.group.left.length,2);assert.equal(frame.group.left_total_cents,10000);assert.equal(frame.group.accounting_effect,'SETTLEMENT_ONLY_NO_NEW_REVENUE');
 }finally{f.close();}
});
test('a commercial context cannot use an unscoped or another tenant database',async()=>{
 const f=await fixture();try{const context=await commercialContextFromPrincipal({kind:'account',userId:'synthetic-user',organizationId:'synthetic-org',storeId:'synthetic-store',sessionId:'synthetic-session',membershipId:'synthetic-member',role:'FINANCE',authorizationRevision:1,capabilities:['bank.read']},{requiredCapability:'bank.read'});f.env.COMMERCIAL_CONTEXT=context;let r=await createFinancialAllocationWorker().fetch(req({schema,operation:'read'}),f.env);assert.equal(r.status,403);
 f.env.COMMERCIAL_CONTEXT={organizationId:'forged-org',storeId:'forged-store',capabilities:['bank.write']};r=await createFinancialAllocationWorker().fetch(req({schema,operation:'read'}),f.env);assert.equal(r.status,403);
 }finally{f.close();}
});
