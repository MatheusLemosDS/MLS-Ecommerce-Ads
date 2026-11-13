import test from 'node:test';
import assert from 'node:assert/strict';
import {ACCOUNT_BRIDGE_PATH,projectAccountBridgeRequest,projectAccountBridgeResponse} from '../src/commercial-account-frame.mjs';
import {accountBridgeCall,hasCommercialAccountCookie,forwardCommercialAccount,resolveAccountViaGateway} from '../src/commercial-account-gateway.mjs';

const origin='https://app.brazacommerce.com.br';
const env={APP_INTERNAL_SECRET:'synthetic-internal-secret-'.repeat(3)};
const frame=(overrides={})=>({schema:'mls_account_bridge_request_v1',operation:'forward',origin,path:'/api/account/login',method:'POST',headers:{origin,'content-type':'application/json'},body:'{}',selection:null,...overrides});
const reply=(body,status=200,headers={})=>new Response(JSON.stringify({schema:'mls_account_bridge_response_v1',status,headers:{'content-type':'application/json; charset=utf-8',...headers},body:JSON.stringify(body)}),{headers:{'content-type':'application/json'}});

test('account bridge closed frame rejects authority fields, destination injection and mismatched origins',()=>{
 assert.ok(projectAccountBridgeRequest(frame()));
 for(const input of [frame({role:'owner'}),frame({origin:'https://other.example'}),frame({path:'//other.example/api/account/login'}),frame({path:'/api/account/../admin'}),frame({path:'/api/account/%2fadmin'}),frame({headers:{...frame().headers,'x-role':'OWNER'}}),frame({selection:{role:'OWNER'}})])assert.equal(projectAccountBridgeRequest(input),null);
 assert.equal(projectAccountBridgeRequest(frame({origin:'http://127.0.0.1:4311',headers:{}})),null);
 assert.ok(projectAccountBridgeRequest(frame({origin:'http://127.0.0.1:4311',headers:{}}),{local:true}));
});

test('resolve transport keeps selection untrusted and never accepts a client role',()=>{
 const value=frame({operation:'resolve',path:'/api/admin/reports/weekly?week_end=2026-11-06',method:'GET',body:null,selection:{organizationId:'synthetic-org-a',storeId:'synthetic-store-a',capability:'reports.read'}});
 assert.ok(projectAccountBridgeRequest(value));
 assert.equal(projectAccountBridgeRequest({...value,selection:{...value.selection,role:'OWNER'}}),null);
 assert.equal(projectAccountBridgeRequest({...value,selection:{...value.selection,capability:'*'}}),null);
 assert.equal(projectAccountBridgeRequest({...value,selection:{...value.selection,organizationId:'../org-b'}}),null);
});

test('account response cannot set arbitrary headers, send token to another host or inject cookies',()=>{
 const value={schema:'mls_account_bridge_response_v1',status:200,headers:{'content-type':'application/json'},body:'{}'};
 assert.ok(projectAccountBridgeResponse(value));
 for(const headers of [{'x-unreviewed':'yes'},{location:'https://other.example/'},{location:'//other.example/'},{'set-cookie':'secret=bad\r\nx-other: yes'}])assert.equal(projectAccountBridgeResponse({...value,headers}),null);
 assert.equal(projectAccountBridgeResponse({...value,status:101}),null);
 assert.equal(projectAccountBridgeResponse({...value,tenant:'another-company'}),null);
});

test('public account mutation rejects cross-origin before reading body or contacting Auth',async()=>{
 let calls=0;const request=new Request(origin+'/api/account/profile',{method:'PATCH',headers:{origin:'https://other.example','content-type':'application/json'},body:'{}'});
 const response=await accountBridgeCall(request,env,{fetchImpl:async()=>{calls++;return reply({});}});
 assert.equal(response.status,403);assert.equal(calls,0);assert.equal(request.bodyUsed,false);
});

test('App forwards only reviewed metadata to one fixed Auth destination and preserves server session cookie',async()=>{
 let calls=0,seen;const request=new Request(origin+'/api/account/login',{method:'POST',headers:{origin,'content-type':'application/json','x-role':'OWNER','x-tenant':'other-company'},body:JSON.stringify({email:'person@example.test',password:'synthetic passphrase for test'})});
 const response=await forwardCommercialAccount(request,env,{fetchImpl:async upstream=>{
  calls++;assert.equal(upstream.url,'https://auth.brazacommerce.com.br'+ACCOUNT_BRIDGE_PATH);assert.equal(upstream.method,'POST');assert.equal(upstream.redirect,'manual');assert.equal(upstream.headers.get('x-braza-app-key'),env.APP_INTERNAL_SECRET);seen=await upstream.json();
  return reply({authenticated:true},200,{'set-cookie':'__Host-mls_account=synthetic; Path=/; HttpOnly; Secure; SameSite=Strict'});
 }});
 assert.equal(calls,1);assert.equal(seen.headers['x-role'],undefined);assert.equal(seen.headers['x-tenant'],undefined);assert.equal(seen.selection,null);assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.deepEqual(await response.json(),{authenticated:true});
});

test('resolving authorization does not consume or truncate a valid larger operational request',async()=>{
 const text='x'.repeat(1024*1024),request=new Request(origin+'/api/admin/ai-sales/workspace',{method:'POST',headers:{origin,'content-type':'application/json','content-length':String(text.length),cookie:'__Host-mls_account=opaque'},body:text});
 let received;const principal={kind:'account',userId:'person-a',organizationId:'org-a',storeId:'store-a'};
 const result=await resolveAccountViaGateway(request,env,{organizationId:'org-a',storeId:'store-a',capability:'catalog.read'},{fetchImpl:async upstream=>{received=await upstream.json();return reply({schema:'commercial_principal_v1',principal});}});
 assert.deepEqual(result,principal);assert.equal(received.body,null);assert.equal(request.bodyUsed,false);assert.equal((await request.text()).length,text.length);
});

test('unavailable or redirected Auth is a failure, not an account session or replay',async()=>{
 for(const upstream of [new Response(null,{status:302,headers:{location:'https://other.example'}}),new Response('{}',{headers:{'content-type':'text/html'}}),reply({},{})]){
  let calls=0;const response=await accountBridgeCall(new Request(origin+'/api/account/session'),env,{fetchImpl:async()=>{calls++;return upstream;}});assert.equal(response.status,503);assert.equal(calls,1);
 }
});

test('timeout performs one account POST and does not announce success or retry',async()=>{
 let calls=0;const request=new Request(origin+'/api/account/register',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});
 const response=await accountBridgeCall(request,env,{timeoutMs:10,fetchImpl:async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,35));return reply({accepted:true});}});
 assert.equal(response.status,503);assert.equal((await response.json()).error,'ACCOUNT_SERVICE_TIMEOUT');assert.equal(calls,1);
});

test('malformed account cookie selects account boundary instead of falling through to legacy owner',()=>{
 assert.equal(hasCommercialAccountCookie(new Request(origin,{headers:{cookie:'braza_admin=legacy; __Host-mls_account=malformed'}})),true);
 assert.equal(hasCommercialAccountCookie(new Request(origin,{headers:{cookie:'braza_admin=legacy'}})),false);
});
