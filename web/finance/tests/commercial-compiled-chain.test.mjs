import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildCommercialFinanceWorker} from '../../../tools/build_commercial_finance_worker.mjs';
import {buildCommercialAuth} from '../../../tools/build_commercial_auth.mjs';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {migrateAccountDatabase,accountCommit,accountChange,accountGet} from '../../cloudflare/src/account-store.mjs';
import {resolveServiceCommercialPrincipal,tenantAuthorizationGuard} from '../../cloudflare/src/account-service.mjs';
import {commercialContextFromPrincipal,bindCommercialEnvironment} from '../../cloudflare/src/commercial-context.mjs';
import {forwardTenantEnvelope,TENANT_ENVELOPE_HEADER} from '../../cloudflare/src/tenant-envelope.mjs';
import {commercialFinanceCapability} from '../../cloudflare/src/commercial-finance-capability.mjs';
import {getFinanceExternalCash} from '../../cloudflare/src/app-external-cash.mjs';
import {getFinanceProductIndex} from '../../cloudflare/src/app-product-index.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {EXTERNAL_CASH_PATH} from '../src/external-cash-frame.mjs';
import {cashPreview,cashRead,cashRequestId} from './external-cash-fixture.mjs';

class ReturningD1 extends D1{
 constructor(){super();this.executed=[];}
 prepare(sql){const statement=super.prepare(sql);for(const method of ['run','first','all']){const execute=statement[method];statement[method]=async(...args)=>{this.executed.push(sql);return execute(...args);};}if(/\bRETURNING\b/i.test(sql))statement.run=()=>statement.all();return statement;}
}
const appSecret='SYNTHETIC-APP-SERVICE-KEY-'.repeat(2),financeSecret='SYNTHETIC-FINANCE-SERVICE-KEY-'.repeat(2);
let compiled;
async function workers(){
 if(!compiled)compiled=(async()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'mls-commercial-chain-')),financeFile=path.join(directory,'finance.mjs'),authFile=path.join(directory,'auth.mjs');
  const financeMeta=await buildCommercialFinanceWorker({outfile:financeFile}),authMeta=await buildCommercialAuth({input:'web/finance/candidate/auth-worker.mjs',output:authFile});
  assert.equal(Object.keys(financeMeta.sources).filter(name=>name.endsWith('/tenant-storage.mjs')).length,1);assert.equal(Object.keys(financeMeta.sources).filter(name=>name.endsWith('/commercial-context.mjs')).length,1);
  assert.ok(financeMeta.bytes<4*1024*1024);assert.doesNotMatch(readFileSync(financeFile,'utf8'),/from\s*['"]node:/);
  return {finance:(await import(pathToFileURL(financeFile).href)).default,auth:(await import(pathToFileURL(authFile).href)).default,financeMeta,authMeta};
 })();return compiled;
}
async function fixture(t){
 const built=await workers(),raw=new ReturningD1(),legacyAdmin=new D1(),legacyFinance=new D1();t.after(()=>{raw.db.close();legacyAdmin.db.close();legacyFinance.db.close();});
 const env={ACCOUNT_DB:raw,ADMIN_DB:legacyAdmin,FINANCE_DB:legacyFinance,APP_INTERNAL_SECRET:appSecret,FINANCE_ROUTER_SECRET:financeSecret,FINANCE_CONNECTION_ENABLED:'true',ADMIN_PASSWORD:'LEGACY-DEPLOYMENT-PASSWORD',SESSION_SECRET:'LEGACY-SESSION-SECRET',SHOPEE_FINANCE_PARTNER_KEY:'LEGACY-PARTNER-KEY'};
 await migrateAccountDatabase(env);const stamp=Math.floor(Date.now()/1000),companies=[],financeQueries=[];let financeCalls=0,revokeAfterFinance=null;
 async function revoke(company){const member=await accountGet(raw,'membership',company.org,company.uid);await accountCommit(raw,[accountChange('membership',company.org,{...member,state:'REMOVED'},member.revision)]);}
 for(const suffix of ['a','b']){
  const uid='compiled-user-'+suffix,org='compiled-org-'+suffix,sid='compiled-session-'+suffix,store='same-store';
  await accountCommit(raw,[accountChange('user','global',{id:uid,name:'Synthetic '+suffix,email:suffix+'@example.invalid',state:'ACTIVE',auth_revision:1,preferences:{theme:'system',language:'pt-BR'}}),accountChange('session','global',{id:sid,user_id:uid,created_at:stamp,last_activity_at:stamp,expires_at:stamp+28800,revoked_at:null,mfa_complete:true,auth_revision:1,reauthenticated_at:stamp,organization_id:org,store_id:store}),accountChange('organization','global',{id:org,name:'Synthetic '+suffix,state:'ACTIVE',currency:'BRL',timezone:'America/Sao_Paulo'}),accountChange('membership',org,{id:uid,user_id:uid,organization_id:org,state:'ACTIVE',role:'OWNER',store_ids:null,capabilities:null}),accountChange('store',org,{id:store,name:'Synthetic local store',organization_id:org,state:'ACTIVE',profile:null})]);
  companies.push({uid,org,sid,store});
 }
 const authEnv={...env,SHOPEE_FINANCE_SERVICE:{async fetch(request){financeCalls++;const before=raw.executed.length,response=await built.finance.fetch(request,env,{});financeQueries.push({path:new URL(request.url).pathname,queries:raw.executed.length-before,creates:raw.executed.slice(before).filter(sql=>/^\s*CREATE\b/i.test(sql)).length});if(revokeAfterFinance){const company=revokeAfterFinance;revokeAfterFinance=null;await revoke(company);}return response;}}};
 async function signed(company,request){const cap=await commercialFinanceCapability(request),principal=await resolveServiceCommercialPrincipal(env,{sub:company.uid,sid:company.sid,mid:company.uid,org:company.org,store:company.store,cap,revision:1}),context=await commercialContextFromPrincipal(principal,{requiredCapability:cap});return forwardTenantEnvelope(request,context,{secret:appSecret,issuer:'app',audience:'auth'});}
 async function app(company,body){return getFinanceExternalCash({APP_INTERNAL_SECRET:appSecret,COMMERCIAL_FETCH:async request=>built.auth.fetch(await signed(company,request),authEnv,{})},body);}
 return {built,raw,env,authEnv,A:companies[0],B:companies[1],app,signed,revoke,financeQueries,get financeCalls(){return financeCalls;},revokeDuringRead(company){revokeAfterFinance=company;}};
}

test('compiled Auth and Finance preserve App cash DTOs and isolate identical requests across two persistent companies',async t=>{
 const f=await fixture(t);
 for(const [company,amount] of [[f.A,11111],[f.B,22222]]){
  assert.equal((await f.app(company,cashRead())).body.revision,0);
  const input=cashPreview();input.rows[0].amount_cents=amount;const preview=await f.app(company,input);assert.equal(preview.status,200);
  const {cursor,limit,...body}=input,command={...body,operation:'import',request_id:cashRequestId,expected_revision:0,preview_hash:preview.body.preview_hash,confirmed:true},saved=await f.app(company,command);assert.equal(saved.status,200);assert.equal(saved.body.revision,1);assert.equal((await f.app(company,command)).body.replayed,true);
 }
 const a=await f.app(f.A,cashRead()),b=await f.app(f.B,cashRead());assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.body.records[0].amount_cents,11111);assert.equal(b.body.records[0].amount_cents,22222);assert.notEqual(a.body.records[0].record_id,b.body.records[0].record_id);assert.ok(f.financeCalls>=10);
 assert.equal(f.env.FINANCE_DB.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n,0);
 assert.ok(f.financeQueries.every(entry=>entry.queries<=50),'each complete Finance invocation includes both fresh authorization reads within the D1 limit: '+JSON.stringify(f.financeQueries));
 assert.equal(f.financeQueries.filter(entry=>entry.creates===31).length,2,'both companies exercised the actual cold schema path');
 t.diagnostic(JSON.stringify({financeBytes:f.built.financeMeta.bytes,financeSha256:f.built.financeMeta.sha256,authBytes:f.built.authMeta.bytes,authSha256:f.built.authMeta.sha256,financeGraphContextCopies:1,financeQueries:f.financeQueries,environment:'LOCAL_SYNTHETIC_SQLITE_COMPILED_CHAIN'}));
});

test('compiled boundaries reject a stale envelope, forged tenant header and revocation in flight without returning another company',async t=>{
 const f=await fixture(t),request=new Request('https://auth.brazacommerce.com.br'+EXTERNAL_CASH_PATH,{method:'POST',headers:{'content-type':'application/json','x-braza-app-key':appSecret,'x-tenant':f.B.org,'x-role':'owner'},body:JSON.stringify(cashRead())}),signed=await f.signed(f.A,request);
 assert.equal((await f.built.auth.fetch(signed.clone(),f.authEnv,{})).status,200);
 await f.revoke(f.A);const before=f.financeCalls,denied=await f.built.auth.fetch(signed.clone(),f.authEnv,{});assert.equal(denied.status,403);assert.equal(f.financeCalls,before);assert.doesNotMatch(await denied.text(),/compiled-org-b|amount_cents|LEGACY-PARTNER-KEY/);
 const forged=new Request(request.url,{method:'POST',body:JSON.stringify(cashRead()),headers:{'content-type':'application/json','x-braza-finance-router':financeSecret,[TENANT_ENVELOPE_HEADER]:'forged.signature'}});assert.equal((await f.built.finance.fetch(forged,f.env,{})).status,403);
 f.revokeDuringRead(f.B);const pending=await f.app(f.B,cashRead());assert.notEqual(pending.status,200);assert.equal(pending.body.schema,'external_cash_error_v1');
});

test('two dynamic profiles and own connector tokens survive both compiled receivers and the App identity projector',async t=>{
 const f=await fixture(t),ownKey='SYNTHETIC_EXPLICIT_CONNECTOR_KEY',entries=[];
 f.env.FINANCE_TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,29).toString('base64');f.env.COMMERCIAL_FINANCE_PROVIDER_KEYS=JSON.stringify({2049333:ownKey});
 for(const [company,shop] of [[f.A,5001],[f.B,6001]]){
  const profile={partner_id:2049333,shop_id:shop,environment:'LIVE',region:'BRAZIL'},record=await accountGet(f.raw,'store',company.org,company.store);
  await accountCommit(f.raw,[accountChange('store',company.org,{...record,profile},record.revision)]);
  const principal=await resolveServiceCommercialPrincipal(f.env,{sub:company.uid,sid:company.sid,mid:company.uid,org:company.org,store:company.store,cap:'store.connect',revision:1}),context=await commercialContextFromPrincipal(principal,{requiredCapability:'store.connect'}),scoped=bindCommercialEnvironment(f.env,context,{authorizationGuard:()=>tenantAuthorizationGuard(context,'store.connect'),providerEnvironment:{SHOPEE_FINANCE_PARTNER_KEY:ownKey}}),store=await createFinanceStore(scoped);
  await store.setup();await store.saveTokens({access_token:'SYNTHETIC_OWN_ACCESS_'+shop,refresh_token:'SYNTHETIC_OWN_REFRESH_'+shop,expires_at:Math.floor(Date.now()/1000)+3600});entries.push({company,shop,context});
 }
 const originalFetch=globalThis.fetch;let calls=0;
 try{
  globalThis.fetch=async request=>{calls++;const url=new URL(request.url),shop=Number(url.searchParams.get('shop_id'));assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(url.pathname,'/api/v2/product/get_item_list');assert.ok([5001,6001].includes(shop));assert.equal(url.searchParams.get('access_token'),'SYNTHETIC_OWN_ACCESS_'+shop);assert.equal(url.searchParams.get('sign'),createHmac('sha256',ownKey).update('2049333'+url.pathname+url.searchParams.get('timestamp')+'SYNTHETIC_OWN_ACCESS_'+shop+shop).digest('hex'));assert.equal(request.headers.get(TENANT_ENVELOPE_HEADER),null);assert.equal(request.headers.get('x-braza-finance-router'),null);return Response.json({error:'',response:{shop_id:shop,item:[{item_id:'101',item_status:'NORMAL',update_time:null}],total_count:1,has_next_page:false,next_offset:0}});};
  for(const {company,shop,context} of entries){
   const result=await getFinanceProductIndex({APP_INTERNAL_SECRET:appSecret,COMMERCIAL_CONTEXT:context,COMMERCIAL_FETCH:async request=>f.built.auth.fetch(await f.signed(company,request),f.authEnv,{})},{offset:0,page_size:2,item_status:'NORMAL'});assert.equal(result.status,'AVAILABLE');assert.equal(result.shop_id,shop);assert.equal(result.items[0].item_id,'101');assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_OWN_ACCESS|SYNTHETIC_EXPLICIT_CONNECTOR_KEY|LEGACY-PARTNER-KEY/);
  }assert.equal(calls,2);
 }finally{globalThis.fetch=originalFetch;}
});
