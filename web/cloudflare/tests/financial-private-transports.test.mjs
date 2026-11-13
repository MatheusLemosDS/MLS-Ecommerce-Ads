import test from 'node:test';
import assert from 'node:assert/strict';
import {forwardFinancialPrivate} from '../src/financial-auth-router.mjs';
import {getFinanceFinancialAutomation} from '../src/app-financial-automation.mjs';
import {createCommercialAuthWorker} from '../src/commercial-auth-worker.mjs';
import {beginCommercialAdminRequest} from '../src/commercial-admin-runtime.mjs';
import {createAccountService,readLocalAccountOutbox,resolveAccountSession,resolveCommercialPrincipal,resolveServiceCommercialPrincipal} from '../src/account-service.mjs';
import {handleAccountRequest} from '../src/account-worker.mjs';
import {accountGet,accountChange,accountCommit} from '../src/account-store.mjs';
import {accountToken} from '../src/account-crypto.mjs';
import {commercialContextFromPrincipal} from '../src/commercial-context.mjs';
import {forwardTenantEnvelope,verifyTenantEnvelope,TENANT_ENVELOPE_HEADER} from '../src/tenant-envelope.mjs';
import {commercialFinanceCapability} from '../src/commercial-finance-capability.mjs';
import {D1} from './sqlite-d1.mjs';
import {createFinancialSourceWorker} from '../../finance/src/financial-source-worker.mjs';
import {sourceCommand,sourceFrame,privateScope,privateJson} from '../../finance/tests/financial-private-fixture.mjs';

const origin='https://auth.brazacommerce.com.br',appOrigin='https://app.brazacommerce.com.br',path='/internal/finance/financial-sources-v1';
const appSecret='synthetic-app-private-secret-'.repeat(2),routerSecret='synthetic-finance-private-secret-'.repeat(2);
const validateInternalApp=async(r,e)=>r.headers.get('x-braza-app-key')===e.APP_INTERNAL_SECRET;
const request=(body=sourceCommand(),patch={})=>new Request(patch.url??origin+path,{method:patch.method??'POST',headers:{'content-type':'application/json','x-braza-app-key':appSecret,...patch.headers},...(patch.method==='GET'?{}:{body:patch.raw?body:JSON.stringify(body)})});
const environment=send=>({APP_INTERNAL_SECRET:appSecret,FINANCE_ROUTER_SECRET:routerSecret,SHOPEE_FINANCE_SERVICE:{fetch:send}});

test('Auth private router rejects origin, route, method, suffix and authentication before body/provider reads',async()=>{
 let calls=0;const env=environment(async()=>{calls++;throw Error('must not forward');});
 for(const [patch,status] of [[{url:'https://other.example'+path},404],[{url:origin+path+'/'},404],[{method:'GET'},405],[{url:origin+path+'?store=other'},400],[{url:origin+path+'#other'},400],[{headers:{'x-braza-app-key':'wrong'}},401]]){const req=request(sourceCommand(),patch),response=await forwardFinancialPrivate(req,env,{validateInternalApp});assert.equal(response.status,status);assert.equal(req.bodyUsed,false);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('set-cookie'),null);}
 assert.equal(calls,0);
});

test('Auth router requires a bounded printable router secret and configured service binding',async()=>{
 let calls=0;const base=environment(async()=>{calls++;return privateJson(sourceFrame());});
 for(const secret of ['', 'short', 'x'.repeat(257), 'x'.repeat(40)+'\n', null])assert.equal((await forwardFinancialPrivate(request(),{...base,FINANCE_ROUTER_SECRET:secret},{validateInternalApp})).status,503);
 assert.equal((await forwardFinancialPrivate(request(),{...base,SHOPEE_FINANCE_SERVICE:{}},{validateInternalApp})).status,503);assert.equal(calls,0);
});

test('Auth router rejects malformed JSON, body size overflow and caller-authority fields without forwarding',async()=>{
 let calls=0;const env=environment(async()=>{calls++;return privateJson(sourceFrame());});
 for(const req of [request('{',{raw:true}),request(' '.repeat(4097),{raw:true}),request(sourceCommand(),{headers:{'content-length':'4097'}}),request(sourceCommand(),{headers:{'content-type':'text/plain'}}),request({...sourceCommand(),scope:privateScope})])assert.equal((await forwardFinancialPrivate(req,env,{validateInternalApp})).status,400);
 assert.equal(calls,0);
});

test('App to Auth to Finance sends only reviewed secrets and minimized fixed command; cookies never transit',async()=>{
 let seen;const env=environment(async upstream=>{seen=upstream;assert.equal(upstream.headers.get('x-braza-finance-router'),routerSecret);assert.equal(upstream.headers.get('x-braza-app-key'),null);assert.equal(upstream.headers.get('cookie'),null);assert.equal(upstream.headers.get('x-tenant'),null);assert.equal(upstream.redirect,'manual');assert.deepEqual(await upstream.clone().json(),sourceCommand());return privateJson(sourceFrame(),200,{'set-cookie':'synthetic=unsafe','x-private-debug':'synthetic-secret'});});
 const authResponse=await forwardFinancialPrivate(request(sourceCommand(),{headers:{cookie:'synthetic-private-cookie','x-tenant':'foreign','x-mls-context':'untrusted'}}),env,{validateInternalApp});assert.equal(authResponse.status,200);assert.equal(authResponse.headers.get('set-cookie'),null);assert.equal(authResponse.headers.get('x-private-debug'),null);
 const result=await getFinanceFinancialAutomation(env,'sources',sourceCommand(),{fetchImpl:async upstream=>{assert.equal(upstream.url,origin+path);assert.equal(upstream.headers.get('x-braza-app-key'),appSecret);assert.equal(upstream.headers.get('cookie'),null);return forwardFinancialPrivate(upstream,env,{validateInternalApp});}});assert.equal(result.status,200);assert.ok(seen);assert.doesNotMatch(JSON.stringify(result),/cookie|synthetic-private|access_token|order_sn/);
});

test('App validates organization, store, operating book and BRL currency before returning a source frame',async()=>{
 let calls=0;const env=environment(async()=>{throw Error('unused');});
 for(const patch of [{organization_id:'foreign-org'},{store_id:'foreign-store'},{account_id:'foreign-book'},{currency:'USD'}]){const scope={...privateScope,...patch},response=await getFinanceFinancialAutomation(env,'sources',sourceCommand(),{fetchImpl:async()=>{calls++;return privateJson(sourceFrame({scope}));}});assert.equal(response.status,502);assert.equal(response.body.error,'FINANCIAL_PRIVATE_SCOPE_MISMATCH');assert.deepEqual(Object.keys(response.body).sort(),['error','schema']);}
 const commercial={...env,COMMERCIAL_CONTEXT:{organizationId:'commercial-org',storeId:'commercial-store'}};assert.equal((await getFinanceFinancialAutomation(commercial,'sources',sourceCommand(),{fetchImpl:async()=>privateJson(sourceFrame())})).status,502);
 const correct={...privateScope,organization_id:'commercial-org',store_id:'commercial-store'};assert.equal((await getFinanceFinancialAutomation(commercial,'sources',sourceCommand(),{fetchImpl:async()=>privateJson(sourceFrame({scope:correct}))})).status,200);assert.equal(calls,4);
});

test('App/Auth propagate bounded malformed response and timeout failures without retry or cookie',async()=>{
 let calls=0;const malformed=await getFinanceFinancialAutomation({APP_INTERNAL_SECRET:appSecret},'sources',sourceCommand(),{fetchImpl:async()=>{calls++;return privateJson({...sourceFrame(),access_token:'SYNTHETIC_SECRET'});}});assert.equal(malformed.status,502);assert.doesNotMatch(JSON.stringify(malformed),/SYNTHETIC/);assert.equal(calls,1);
 const env=environment(async()=>{calls++;return new Promise(()=>{});});const timeout=await forwardFinancialPrivate(request(),env,{validateInternalApp,timeoutMs:10});assert.equal(timeout.status,504);assert.equal(timeout.headers.get('set-cookie'),null);assert.equal(calls,2);
 for(const args of [[{},'sources'],[{APP_INTERNAL_SECRET:appSecret},'unknown']])assert.equal((await getFinanceFinancialAutomation(args[0],args[1],sourceCommand(),{fetchImpl:async()=>{calls++;throw Error();}})).status,503);assert.equal(calls,2);
});

async function commercialFixture(t){
 const env={ACCOUNT_DB:new D1(),ADMIN_DB:new D1(),FINANCE_DB:new D1(),APP_INTERNAL_SECRET:appSecret,FINANCE_ROUTER_SECRET:routerSecret,ACCOUNT_ENCRYPTION_KEY:accountToken(),ACCOUNT_MAIL_MODE:'LOCAL_TEST_ONLY'},options={local:true,test:true,passwordIterations:1000},service=await createAccountService(env,options),password='Synthetic financial transport passphrase 8261';
 t.after(()=>{for(const key of ['ACCOUNT_DB','ADMIN_DB','FINANCE_DB'])env[key].db.close();});
 await service.register({name:'Pessoa sintética',email:'financial-transport@example.test',password},'synthetic-origin');const verification=(await readLocalAccountOutbox(env,options)).find(o=>o.purpose==='EMAIL_VERIFICATION');await service.confirmVerification({token:verification.message.token});
 const login=await service.login({email:'financial-transport@example.test',password},'synthetic-origin'),cookie='__Host-mls_account='+login.token,session=await resolveAccountSession(new Request(appOrigin,{headers:{cookie}}),env,options);
 const create=async(url,body)=>{const response=await handleAccountRequest(new Request(appOrigin+url,{method:'POST',headers:{origin:appOrigin,'content-type':'application/json',cookie,'x-csrf-token':session.csrf},body:JSON.stringify(body)}),env,options);assert.ok(response.ok,await response.clone().text());return response.json();};
 const company=(await create('/api/companies',{name:'Empresa financeira sintética',confirmed:true,request_id:crypto.randomUUID()})).organization,store=(await create('/api/companies/'+company.id+'/stores',{name:'Loja sem conexão',platform:'SHOPEE',confirmed:true,request_id:crypto.randomUUID()})).store;
 const principal=await resolveCommercialPrincipal(new Request(appOrigin,{headers:{cookie}}),env,{...options,organizationId:company.id,storeId:store.id,capability:'finance.read'});
 return {env,options,cookie,principal,scope:{...privateScope,organization_id:company.id,store_id:store.id}};
}

test('real commercial App/Auth wrappers preserve and freshly authorize the two signed envelope boundaries',async t=>{
 const f=await commercialFixture(t);let financeCalls=0,legacyCalls=0,appToken,financeToken,seenContext;
 f.env.SHOPEE_FINANCE_SERVICE={fetch:async actual=>{financeCalls++;financeToken=actual.headers.get(TENANT_ENVELOPE_HEADER);seenContext=await verifyTenantEnvelope(actual,{secret:routerSecret,issuer:'auth',audience:'finance',resolvePrincipal:claims=>resolveServiceCommercialPrincipal(f.env,claims,f.options)});assert.equal(actual.headers.get('cookie'),null);assert.equal(actual.headers.get('x-braza-app-key'),null);assert.equal(actual.headers.get('x-braza-finance-router'),routerSecret);assert.equal(seenContext.organizationId,f.principal.organizationId);assert.equal(seenContext.storeId,f.principal.storeId);assert.equal(seenContext.requiredCapability,'finance.read');assert.deepEqual(await actual.clone().json(),sourceCommand());return privateJson(sourceFrame({scope:f.scope}),200,{'set-cookie':'synthetic=unsafe'});}};
 const auth=createCommercialAuthWorker({fetch:async()=>{legacyCalls++;throw Error('new route must not use legacy provider');}},{...f.options,validateInternalApp});
 const publicRequest=new Request(appOrigin+'/api/admin/finance/automation?month=2026-11&company='+f.principal.organizationId+'&store='+f.principal.storeId,{headers:{cookie:f.cookie}});
 const runtime=await beginCommercialAdminRequest(publicRequest,f.env,{fetchImpl:async actual=>{if(new URL(actual.url).pathname===path)appToken=actual.headers.get(TENANT_ENVELOPE_HEADER);return auth.fetch(actual,f.env);}});assert.ok(runtime.env.COMMERCIAL_FETCH);assert.equal(runtime.env.ACCOUNT_DB,undefined);
 const result=await getFinanceFinancialAutomation(runtime.env,'sources',sourceCommand());assert.equal(result.status,200,JSON.stringify(result));assert.equal(financeCalls,1);assert.equal(legacyCalls,0);assert.ok(appToken);assert.ok(financeToken);assert.notEqual(appToken,financeToken);
 const claims=token=>JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString());assert.equal(claims(appToken).iss,'app');assert.equal(claims(appToken).aud,'auth');assert.equal(claims(financeToken).iss,'auth');assert.equal(claims(financeToken).aud,'finance');assert.equal(claims(financeToken).body_hash,claims(appToken).body_hash);assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC|cookie|x-mls-context|sessionId|membershipId/);
 const finished=await runtime.finish(privateJson(result.body));assert.equal(finished.status,200);assert.equal(finished.headers.get('cache-control'),'private, no-store');assert.equal(finished.headers.get('set-cookie'),null);
});

test('commercial route capability cannot be weakened and revoked session cannot reuse a signed request',async t=>{
 const f=await commercialFixture(t);let calls=0;f.env.SHOPEE_FINANCE_SERVICE={fetch:async()=>{calls++;return privateJson(sourceFrame({scope:f.scope}));}};const auth=createCommercialAuthWorker({fetch:async()=>{throw Error('no fallback');}},{...f.options,validateInternalApp});
 const signed=async cap=>forwardTenantEnvelope(request(),await commercialContextFromPrincipal(f.principal,{requiredCapability:cap}),{secret:appSecret,issuer:'app',audience:'auth'});
 assert.equal(await commercialFinanceCapability(request()),'finance.read');assert.equal((await auth.fetch(await signed('bank.read'),f.env)).status,403);assert.equal(calls,0);
 const valid=await signed('finance.read'),session=await accountGet(f.env.ACCOUNT_DB,'session','global',f.principal.sessionId);await accountCommit(f.env.ACCOUNT_DB,[accountChange('session','global',{...session,revoked_at:Math.floor(Date.now()/1000)},session.revision)]);assert.equal((await auth.fetch(valid,f.env)).status,403);assert.equal(calls,0);
 const missing=new Request(origin+path,{method:'POST',headers:{'content-type':'application/json','x-braza-app-key':appSecret,cookie:f.cookie},body:JSON.stringify(sourceCommand())});assert.equal((await auth.fetch(missing,f.env)).status,403);assert.equal(calls,0);
});

test('capability calls through App/Auth stay UNKNOWN and make zero cached-order or provider requests',async t=>{
 const provider=t.mock.method(globalThis,'fetch',async()=>{throw Error('unverified source must not use the provider');});
 let financeCalls=0,sourceReads=0;const worker=createFinancialSourceWorker({readEvidence:async()=>{sourceReads++;throw Error('capability must not read cached evidence');}}),env=environment(async actual=>{financeCalls++;const input=await actual.clone().json();assert.equal(input.operation,'capabilities');return worker.fetch(actual,env);});
 const result=await getFinanceFinancialAutomation(env,'sources',{schema:'financial_source_request_v1',operation:'capabilities'},{fetchImpl:r=>forwardFinancialPrivate(r,env,{validateInternalApp})});assert.equal(result.status,200);assert.equal(result.body.sources.every(s=>s.grant.state==='UNKNOWN'&&!s.collection_allowed),true);assert.equal(financeCalls,1);assert.equal(sourceReads,0);assert.equal(provider.mock.callCount(),0);
});
