import {test} from 'node:test';
import assert from 'node:assert/strict';
import {forwardFinanceConnection} from '../src/auth-router.mjs';
const base='https://auth.brazacommerce.com.br';
const secret='fixture-finance-router-secret-only-12345678';
function configuration(handler){return {FINANCE_ROUTER_SECRET:secret,SHOPEE_FINANCE_SERVICE:{fetch:handler}};}
test('routes and host are confined to the financial prefix',async()=>{
 let calls=0;const env=configuration(()=>{calls++;throw Error('must not reach');});
 for(const path of ['/shopee/connect','/shopee/callback','/shopee/finance/unknown','/internal/shopee/orders/items'])assert.equal((await forwardFinanceConnection(new Request(base+path),env)).status,404);
 assert.equal((await forwardFinanceConnection(new Request('https://other.invalid/shopee/finance/status'),env)).status,404);
 assert.equal((await forwardFinanceConnection(new Request(base+'/shopee/finance/connect',{method:'POST'}),env)).status,405);
 assert.equal(calls,0);
});
test('missing configuration never uses an Ads binding or caller supplied secret',async()=>{
 let calls=0;const req=new Request(base+'/shopee/finance/status',{headers:{'X-Braza-Finance-Router':secret}});
 for(const env of [{},{SHOPEE_FINANCE_SERVICE:{fetch(){calls++;}}},{FINANCE_ROUTER_SECRET:'short',SHOPEE_FINANCE_SERVICE:{fetch(){calls++;}}},{FINANCE_ROUTER_SECRET:secret,GATEWAY_SHARED_SECRET:secret}])assert.equal((await forwardFinanceConnection(req,env)).status,503);
 assert.equal(calls,0);
});
test('service binding receives only its own secret and financial cookie',async()=>{
 const response=await forwardFinanceConnection(new Request(base+'/shopee/finance/callback?code=fixture-code&state=fixture-state&shop_id=1178167501',{headers:{cookie:'mls_session=PRIVATE_ADS; braza_admin=PRIVATE_ADMIN; braza_finance_oauth=fixture-browser','authorization':'Bearer PRIVATE_CALLER','X-Braza-Finance-Router':'attacker'}}),configuration(request=>{
  assert.equal(request.method,'GET');assert.equal(request.headers.get('X-Braza-Finance-Router'),secret);
  assert.equal(request.headers.get('cookie'),'braza_finance_oauth=fixture-browser');assert.equal(request.headers.get('authorization'),null);
  assert.ok(!JSON.stringify([...request.headers]).includes('PRIVATE_'));
  return new Response('connected',{headers:{'content-type':'text/html; charset=utf-8','set-cookie':'braza_finance_oauth=; Path=/shopee/finance; Secure; HttpOnly; Max-Age=0'}});
 }));
 assert.equal(response.status,200);assert.equal(await response.text(),'connected');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('cache-control'),'no-store');
});
test('unavailable service errors do not disclose upstream exception contents',async()=>{
 const response=await forwardFinanceConnection(new Request(base+'/shopee/finance/status'),configuration(()=>{throw Error('PRIVATE_TOKEN_OR_URL');}));
 assert.equal(response.status,502);assert.ok(!(await response.text()).includes('PRIVATE'));
});
test('redirect responses allow official HTTPS destinations and refuse unsafe alternatives',async()=>{
 const run=location=>forwardFinanceConnection(new Request(base+'/shopee/finance/connect'),configuration(()=>new Response(null,{status:302,headers:{location}})));
 for(const target of ['https://open.shopee.com.br/auth?partner_id=2049333','https://openplatform.shopee.com.br/api/v2/shop/auth_partner?state=fixture',base+'/shopee/finance/status'])assert.equal((await run(target)).status,302);
 for(const target of ['http://open.shopee.com.br/auth','https://open.shopee.com.br.attacker.invalid/auth','https://user:password@open.shopee.com.br/auth','https://open.shopee.com.br:444/auth',base+'/shopee/connect',base+'/shopee/finance/status?token=private','https://open.shopee.com.br/auth#fragment'])assert.equal((await run(target)).status,502);
});
test('a backend cannot overwrite other cookies or broaden the cookie domain/path',async()=>{
 for(const cookie of ['mls_session=changed; Path=/shopee/finance','braza_finance_oauth=fixture; Domain=brazacommerce.com.br; Path=/shopee/finance','braza_finance_oauth=fixture; Path=/']){
  const result=await forwardFinanceConnection(new Request(base+'/shopee/finance/status'),configuration(()=>new Response('invalid cookie',{headers:{'set-cookie':cookie}})));
  assert.equal(result.status,502);assert.equal(result.headers.get('set-cookie'),null);
 }
});
test('oversized URL is refused without contacting the service',async()=>{
 let called=false;const result=await forwardFinanceConnection(new Request(base+'/shopee/finance/callback?code='+('x'.repeat(8200))),configuration(()=>{called=true;}));assert.equal(result.status,400);assert.equal(called,false);
});
