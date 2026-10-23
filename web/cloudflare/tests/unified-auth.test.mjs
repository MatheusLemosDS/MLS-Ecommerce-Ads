import test from 'node:test';
import assert from 'node:assert/strict';
import {readOwnerSession,readWorkspaceSession,handleWorkspaceAuth,WorkspaceAuthError} from '../src/unified-auth.mjs';
import {adminFetch} from '../src/admin.mjs';
import {D1} from './sqlite-d1.mjs';

const origin='https://app.example.test',clock=Date.UTC(2026,9,23,15),stamp=clock/1000,now=()=>clock;
const renderLogin=error=>new Response('<main><h1>Entrar na BrazaCommerce</h1>'+(error?'<p>Acesso não autorizado.</p>':'')+'</main>',{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
const env=()=>({ADMIN_DB:new D1(),ADMIN_USERNAME:'owner-fixture',ADMIN_PASSWORD:'owner-password-fixture-123456',ADMIN_SESSION_SECRET:'owner-session-fixture-'+'o'.repeat(40),REVIEW_USERNAME:'review-fixture',REVIEW_PASSWORD:'review-password-fixture-123456',SESSION_SECRET:'review-session-fixture-'+'r'.repeat(40)});
const request=(path='/login',options={})=>new Request(origin+path,{method:options.method||'GET',headers:options.headers,body:options.body});
const handle=(req,e)=>handleWorkspaceAuth(req,e,{renderLogin,now});
function post(e,role='owner',changes={}){return request(changes.path||'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded',...changes.headers},body:changes.body??new URLSearchParams({username:role==='owner'?e.ADMIN_USERNAME:e.REVIEW_USERNAME,password:role==='owner'?e.ADMIN_PASSWORD:e.REVIEW_PASSWORD})});}
const activeCookie=response=>response.headers.getSetCookie().find(cookie=>cookie.includes('Max-Age=28800')).split(';')[0];
const withCookie=(cookie,path='/dashboard')=>request(path,{headers:{cookie}});
const bytesTo64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
async function signed(e,data,owner=true){const payload=bytesTo64(new TextEncoder().encode(JSON.stringify(data))),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(owner?e.ADMIN_SESSION_SECRET:e.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']),bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(owner?'admin:'+payload:payload))),signature=owner?[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join(''):bytesTo64(bytes);return (owner?'braza_admin':'mls_session')+'='+payload+'.'+signature;}

test('one canonical login page serves anonymous entry and both authenticated roles have their own landing page',async()=>{
 const e=env();for(const path of ['/','/admin/login']){const response=await handle(request(path),e);assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/login');}
 const page=await handle(request('/login'),e);assert.equal(page.status,200);assert.match(await page.text(),/Entrar na BrazaCommerce/);assert.equal(page.headers.get('cache-control'),'no-store');
 for(const [role,landing] of [['owner','/admin?tab=overview'],['review','/dashboard']]){const response=await handle(post(e,role),e),cookie=activeCookie(response);assert.equal(response.status,303);assert.equal(response.headers.get('location'),landing);for(const path of ['/','/login','/admin/login'])assert.equal((await handle(withCookie(cookie,path),e)).headers.get('location'),landing);}
 assert.equal(await handle(request('/campaigns'),e),null);
});

test('one owner login supplies the existing owner cookie, CSRF and administration access without any review credentials',async()=>{
 const e=env();delete e.REVIEW_USERNAME;delete e.REVIEW_PASSWORD;delete e.SESSION_SECRET;
 // Use the live clock for the real Admin integration, which does not receive a
 // test clock or a second credential exchange.
 const response=await handleWorkspaceAuth(post(e),e,{renderLogin}),cookie=activeCookie(response);
 const current=await readOwnerSession(withCookie(cookie),e);assert.equal(current.role,'owner');assert.equal(current.user,'admin');assert.match(current.csrf,/^[a-f0-9]{64}$/);
 assert.equal((await readWorkspaceSession(withCookie(cookie),e)).role,'owner');
 const state=await adminFetch(withCookie(cookie,'/api/admin/state'),e);assert.equal(state.status,200);assert.equal((await state.json()).csrf,current.csrf);
 const cookies=response.headers.getSetCookie();assert.match(cookies[0],/^braza_admin=.*; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800$/);assert.match(cookies[1],/^mls_session=;.*Max-Age=0$/);
 const again=await handleWorkspaceAuth(post(e),e,{renderLogin});assert.notEqual(activeCookie(again),cookie,'owner login rotates its signed nonce');
});

test('review login remains read-only and never supplies an owner session or reaches administrative storage',async()=>{
 const e=env(),response=await handleWorkspaceAuth(post(e,'review'),e,{renderLogin}),cookie=activeCookie(response);
 assert.match(cookie,/^mls_session=/);assert.equal(await readOwnerSession(withCookie(cookie),e),null);assert.equal((await readWorkspaceSession(withCookie(cookie),e)).role,'review');
 for(const path of ['/api/admin/state','/api/admin/finance/business-month','/api/admin/jobs']){const denied=await adminFetch(withCookie(cookie,path),e);assert.equal(denied.status,401);}
 assert.equal(e.ADMIN_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);
 assert.match(response.headers.getSetCookie()[1],/^braza_admin=;.*Max-Age=0$/);
 const alias=await handleWorkspaceAuth(post(e,'review',{path:'/admin/login'}),e,{renderLogin});assert.equal(alias.status,303);assert.equal(alias.headers.get('location'),'/dashboard');
});

test('login rejects foreign origins, malformed/duplicate fields, unsupported bodies and more than 4096 bytes',async()=>{
 const e=env();
 const cases=[
  [{headers:{origin:'https://foreign.example'}},403],
  [{headers:{origin:''}},403],
  [{headers:{'content-type':'application/json'},body:'{}'},415],
  [{body:'username=x&username=y&password=z'},400],
  [{body:'username=x&password=y&role=admin'},400],
  [{body:'username=x'},400],
  [{body:'username='+ 'x'.repeat(101)+'&password=x'},400],
  [{body:'username=x&password='+ 'x'.repeat(201)},400],
  [{headers:{'content-length':'4097'},body:'username=x&password=y'},413],
  [{headers:{'content-length':'invalid'},body:'username=x&password=y'},413],
  [{headers:{'content-length':'3'},body:'username=x&password='+ 'x'.repeat(4096)},413],
 ];
 for(const [changes,status] of cases){const response=await handle(post(e,'owner',changes),e);assert.equal(response.status,status);assert.equal(response.headers.has('set-cookie'),false);}
 assert.equal((await handle(post(e,'owner',{path:'/login?next=https://foreign.example'}),e)).status,400);
 assert.equal((await handle(request('/',{method:'POST'}),e)).status,405);
});

test('invalid credentials use the same generic login error and cannot disclose or reflect submitted values',async()=>{
 const e=env();for(const username of [e.ADMIN_USERNAME,e.REVIEW_USERNAME,'<script>PRIVATE_INPUT</script>']){const response=await handle(post(e,'owner',{body:new URLSearchParams({username,password:'wrong-password'})}),e);assert.equal(response.status,401);assert.equal(response.headers.has('set-cookie'),false);const body=await response.text();assert.match(body,/Acesso não autorizado/);assert.ok(!body.includes(username));assert.ok(!body.includes('wrong-password'));}
 const missing=await handle(post({},'owner',{body:'username=&password='}),{});assert.equal(missing.status,503);assert.equal(missing.headers.has('set-cookie'),false);
});

test('legacy signed owner sessions remain valid while tampering, duplicate cookies and invalid signed payloads fail closed',async()=>{
 const e=env(),data={role:'admin',user:'admin',exp:stamp+28800,nonce:'11111111-1111-4111-8111-111111111111'},cookie=await signed(e,data);
 assert.equal((await readOwnerSession(withCookie(cookie),e,{now})).role,'owner');
 assert.equal(await readOwnerSession(withCookie(cookie+'; '+cookie),e,{now}),null);
 assert.equal(await readOwnerSession(withCookie(cookie.slice(0,-1)+(cookie.endsWith('0')?'1':'0')),e,{now}),null);
 for(const changes of [{role:'review'},{user:'other'},{exp:stamp},{exp:stamp+28801},{exp:stamp+0.5},{nonce:'invalid'},{extra:'PRIVATE'}])assert.equal(await readOwnerSession(withCookie(await signed(e,{...data,...changes})),e,{now}),null);
 const missingNonce={...data};delete missingNonce.nonce;assert.equal(await readOwnerSession(withCookie(await signed(e,missingNonce)),e,{now}),null);
});

test('legacy review signatures preserve their original scope and cannot be relabelled as owner cookies',async()=>{
 const e=env(),cookie=await signed(e,{user:e.REVIEW_USERNAME,exp:stamp+28800},false);
 assert.equal((await readWorkspaceSession(withCookie(cookie),e,{now})).role,'review');
 assert.equal(await readOwnerSession(withCookie(cookie.replace('mls_session=','braza_admin=')),e,{now}),null);
 for(const data of [{user:e.REVIEW_USERNAME,exp:stamp+28801},{user:e.REVIEW_USERNAME,exp:stamp},{user:'other',exp:stamp+1},{user:e.REVIEW_USERNAME,exp:stamp+1,role:'admin'}])assert.equal(await readWorkspaceSession(withCookie(await signed(e,data,false)),e,{now}),null);
 assert.equal(await readWorkspaceSession(withCookie(cookie),{...e,REVIEW_USERNAME:'rotated-user'},{now}),null);
 const owner=activeCookie(await handle(post(e),e));assert.equal((await readWorkspaceSession(withCookie(cookie+'; '+owner),e,{now})).role,'owner');
});

test('GET logout only confirms; same-origin POST and the exact role CSRF clear both cookies',async()=>{
 const e=env();for(const role of ['owner','review']){
  const cookie=activeCookie(await handle(post(e,role),e)),current=await readWorkspaceSession(withCookie(cookie),e,{now});
  const page=await handle(withCookie(cookie,'/logout'),e);assert.equal(page.status,200);assert.equal(page.headers.has('set-cookie'),false);assert.match(await page.text(),/Sair da sua conta/);assert.ok(await readWorkspaceSession(withCookie(cookie),e,{now}));
  for(const headers of [{cookie,origin},{cookie,origin,'x-csrf-token':'wrong'},{cookie,origin:'https://foreign.example','x-csrf-token':current.csrf}])assert.equal((await handle(request('/logout',{method:'POST',headers}),e)).status,403);
  const response=await handle(request('/logout',{method:'POST',headers:{cookie,origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrf:current.csrf})}),e);
  assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/login');assert.equal(response.headers.getSetCookie().length,2);for(const name of ['braza_admin','mls_session'])assert.ok(response.headers.getSetCookie().some(value=>value.startsWith(name+'=;')&&value.includes('Max-Age=0')));
 }
});

test('the old owner logout endpoint preserves 204 and denies review sessions before any clearing',async()=>{
 const e=env(),owner=activeCookie(await handle(post(e),e)),current=await readOwnerSession(withCookie(owner),e,{now}),review=activeCookie(await handle(post(e,'review'),e));
 assert.equal((await handle(withCookie(owner,'/admin/logout'),e)).status,405);
 const response=await handle(request('/admin/logout',{method:'POST',headers:{cookie:owner,origin,'x-csrf-token':current.csrf}}),e);assert.equal(response.status,204);assert.equal(response.headers.getSetCookie().length,2);
 const denied=await handle(request('/admin/logout',{method:'POST',headers:{cookie:review,origin,'x-csrf-token':current.csrf}}),e);assert.equal(denied.status,401);assert.equal(denied.headers.has('set-cookie'),false);
});

test('missing or weak signing configuration cannot authenticate either role or silently use an empty secret',async()=>{
 const e=env();assert.equal((await handle(post({...e,ADMIN_SESSION_SECRET:''}),{...e,ADMIN_SESSION_SECRET:'',REVIEW_USERNAME:''})).status,503);
 assert.equal(await readOwnerSession(withCookie('braza_admin=x.y'),{}, {now}),null);
 await assert.rejects(readOwnerSession(request('/admin'),{}, {requireSetup:true,now}),error=>error instanceof WorkspaceAuthError&&error.status===503);
 const reviewCookie=await signed(e,{user:e.REVIEW_USERNAME,exp:stamp+1},false);assert.equal(await readWorkspaceSession(withCookie(reviewCookie),{...e,SESSION_SECRET:'short'},{now}),null);
 const unicode={...e,REVIEW_USERNAME:'revisão-fixture'},response=await handle(post(unicode,'review'),unicode),cookie=activeCookie(response);assert.equal((await readWorkspaceSession(withCookie(cookie),unicode,{now})).user,'revisão-fixture');
 const existingShortReview={...e,REVIEW_PASSWORD:'legacy-review'},legacy=await handle(post(existingShortReview,'review'),existingShortReview);assert.equal(legacy.status,303);assert.equal((await readWorkspaceSession(withCookie(activeCookie(legacy)),existingShortReview,{now})).role,'review');
});
