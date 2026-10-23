import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {D1} from './sqlite-d1.mjs';

const origin='https://app.example.test';
const compiledWorkers=new Map();
function compiledWorker(minify){
 if(!compiledWorkers.has(minify))compiledWorkers.set(minify,(async()=>{
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
  return (await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'))).default;
 })());
 return compiledWorkers.get(minify);
}
function environment(){return {ADMIN_DB:new D1(),ADMIN_USERNAME:'owner-fixture',ADMIN_PASSWORD:'owner-password-fixture-123456',ADMIN_SESSION_SECRET:'owner-session-fixture-'+'o'.repeat(40),REVIEW_USERNAME:'review-fixture',REVIEW_PASSWORD:'review-password-fixture-123456',SESSION_SECRET:'review-session-fixture-'+'r'.repeat(40),APP_INTERNAL_SECRET:'internal-test-fixture-'+'i'.repeat(40)};}
const request=(path,{cookie,method='GET',body,headers={}}={})=>new Request(origin+path,{method,headers:{...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body})});
const cookie=(response,name)=>{
 const value=response.headers.getSetCookie().find(value=>value.startsWith(name+'=')&&!value.startsWith(name+'=;'));
 assert.ok(value,'the login must issue '+name);return value.split(';')[0];
};
const cleared=(response,name)=>response.headers.getSetCookie().some(value=>value.startsWith(name+'=;')&&value.includes('Max-Age=0'));
const login=(worker,env,role='owner',path='/login')=>worker.fetch(request(path,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:role==='owner'?env.ADMIN_USERNAME:env.REVIEW_USERNAME,password:role==='owner'?env.ADMIN_PASSWORD:env.REVIEW_PASSWORD})}),env);
const legacyReview=(env,changes={})=>{
 const payload=Buffer.from(JSON.stringify({user:env.REVIEW_USERNAME,exp:Math.floor(Date.now()/1000)+3600,...changes})).toString('base64url');
 return 'mls_session='+payload+'.'+createHmac('sha256',env.SESSION_SECRET).update(payload).digest('base64url');
};
const legacyOwner=(env,changes={})=>{
 const payload=Buffer.from(JSON.stringify({role:'admin',user:'admin',exp:Math.floor(Date.now()/1000)+3600,nonce:randomUUID(),...changes})).toString('base64url');
 return 'braza_admin='+payload+'.'+createHmac('sha256',env.ADMIN_SESSION_SECRET).update('admin:'+payload).digest('hex');
};
async function fixture(minify,run){
 const worker=await compiledWorker(minify),env=environment(),previousFetch=globalThis.fetch,calls=[];
 globalThis.fetch=async(value,options={})=>{
  const upstream=value instanceof Request?value:new Request(value,options),url=new URL(upstream.url);calls.push({path:url.pathname,method:upstream.method});
  assert.equal(url.origin,'https://auth.brazacommerce.com.br');assert.equal(upstream.method,'GET','page rendering must remain read-only');assert.equal(upstream.headers.get('x-braza-app-key'),env.APP_INTERNAL_SECRET);
  if(url.pathname==='/internal/shopee/status')return Response.json({connections:[{principal_type:'shop',principal_id:1178167501}]});
  if(url.pathname==='/internal/shopee/ads/summary'){
   const iso=value=>value?.split('-').reverse().join('-'),start=iso(url.searchParams.get('start_date')),end=iso(url.searchParams.get('end_date')),daily=[];
   if(start&&end)for(let stamp=Date.parse(start+'T00:00:00Z');stamp<=Date.parse(end+'T00:00:00Z');stamp+=86400000)daily.push({date:new Date(stamp).toISOString().slice(0,10),expense:'1.00',broad_gmv:'10.00',broad_order:1,broad_roas:'10.00',direct_gmv:'5.00',direct_order:1,direct_roas:'5.00'});
   return Response.json({status:'ok',connected:true,shop:{id:1178167501},period:{start_date:start,end_date:end},balance:'10.00',daily});
  }
  if(url.pathname==='/internal/shopee/ads/campaigns')return Response.json({connected:true,shop:{id:1178167501},summary:{},campaigns:[]});
  if(url.pathname==='/internal/shopee/ads/gms-items')return Response.json({connected:true,shop:{id:1178167501},summary:{},items:[]});
  if(url.pathname==='/internal/shopee/ads/opportunities')return Response.json({connected:true,shop:{id:1178167501},summary:{},items:[],products:[]});
  throw Error('UNEXPECTED_PRIVATE_READ:'+url.pathname);
 };
 try{return await run({worker,env,calls});}finally{globalThis.fetch=previousFetch;env.ADMIN_DB.db.close();}
}

for(const minify of [false,true]){
 test(`compiled app has one login entry and an owner session opens management and Ads (minify=${minify})`,()=>fixture(minify,async({worker,env,calls})=>{
  for(const path of ['/','/admin/login']){const response=await worker.fetch(request(path),env);assert.equal(response.status,303);assert.equal(new URL(response.headers.get('location'),origin).pathname,'/login');}
  const entry=await worker.fetch(request('/login'),env);assert.equal(entry.status,200);const entryHtml=await entry.text();assert.match(entryHtml,/<form[^>]+action="\/login"/);assert.doesNotMatch(entryHtml,/<form[^>]+action="\/admin\/login"/);
  const authenticated=await login(worker,env);assert.equal(authenticated.status,303);assert.equal(authenticated.headers.get('location'),'/admin?tab=overview');const owner=cookie(authenticated,'braza_admin');assert.ok(cleared(authenticated,'mls_session'));
  for(const path of ['/admin','/dashboard','/campaigns']){
   const response=await worker.fetch(request(path,{cookie:owner}),env);assert.equal(response.status,200,path+' must accept the same owner session');const html=await response.text();
   for(const href of ['/admin?tab=overview','/admin?tab=products','/dashboard','/admin?tab=margins','/optimization'])assert.ok(html.includes('href="'+href+'"'),path+' must use the common owner navigation: '+href);
   assert.doesNotMatch(html,/<form[^>]+action="\/(?:admin\/)?login"/,'an authenticated route cannot show a second login');
  }
  const current=await worker.fetch(request('/api/admin/state',{cookie:owner}),env);assert.equal(current.status,200);assert.equal(typeof (await current.json()).csrf,'string');
  const home=await worker.fetch(request('/',{cookie:owner}),env);assert.equal(home.headers.get('location'),'/admin?tab=overview');
  assert.ok(calls.some(call=>call.path==='/internal/shopee/ads/summary'));assert.ok(calls.some(call=>call.path==='/internal/shopee/ads/campaigns'));assert.ok(calls.every(call=>!call.path.includes('/finance/')));
 }));

 test(`compiled review access stays read-only and cannot enter financial management (minify=${minify})`,()=>fixture(minify,async({worker,env,calls})=>{
  const authenticated=await login(worker,env,'review');assert.equal(authenticated.status,303);assert.equal(authenticated.headers.get('location'),'/dashboard');const review=cookie(authenticated,'mls_session');assert.ok(cleared(authenticated,'braza_admin'));
  const ownerLinks=[];
  for(const path of ['/dashboard','/campaigns','/optimization','/integrations']){const response=await worker.fetch(request(path,{cookie:review}),env);assert.equal(response.status,200,path);for(const anchor of (await response.text()).match(/<a\b[^>]*href="\/admin(?:[?\/][^"]*)?"[^>]*>/g)||[])ownerLinks.push({path,anchor});}
  const before=calls.length;
  const html=await worker.fetch(request('/admin',{cookie:review}),env);assert.equal(html.status,303);assert.equal(new URL(html.headers.get('location'),origin).pathname,'/login');
  for(const path of ['/api/admin/state','/api/admin/live'])assert.equal((await worker.fetch(request(path,{cookie:review}),env)).status,401);
  const denied=await worker.fetch(request('/api/admin/finance/business-month',{cookie:review,method:'POST',headers:{origin,'content-type':'application/json','x-csrf-token':'wrong'},body:JSON.stringify({operation:'start',month:'2026-10'})}),env);assert.equal(denied.status,401);assert.equal(calls.length,before);
  assert.equal(env.ADMIN_DB.db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table'").get().count,0,'review access cannot initialize or read management state');
  assert.deepEqual(ownerLinks,[],'review routes must not advertise privileged management destinations');
 }));

 test(`compiled routes reject unsigned, expired, substituted and duplicate sessions before source reads (minify=${minify})`,()=>fixture(minify,async({worker,env,calls})=>{
  const valid=legacyReview(env),tampered=valid.slice(0,-1)+(valid.endsWith('a')?'b':'a');
  const cases=[undefined,'braza_admin=unsigned',tampered,legacyReview(env,{exp:Math.floor(Date.now()/1000)-1}),legacyReview(env,{user:'previous-review-user'}),legacyReview(env,{exp:Math.floor(Date.now()/1000)+86400}),valid+'; '+valid,legacyOwner(env,{user:'review'}),legacyOwner(env,{role:'review'}),legacyOwner(env,{exp:Math.floor(Date.now()/1000)-1})];
  for(const value of cases){const response=await worker.fetch(request('/dashboard',{cookie:value}),env);assert.ok([302,303].includes(response.status));assert.equal(new URL(response.headers.get('location'),origin).pathname,'/login');}
  assert.equal(calls.length,0);
  assert.equal((await worker.fetch(request('/dashboard',{cookie:legacyReview(env)}),env)).status,200,'existing correctly signed review sessions remain valid');
  assert.equal((await worker.fetch(request('/admin',{cookie:legacyOwner(env)}),env)).status,200,'existing correctly signed owner sessions remain valid');
 }));

 test(`compiled logout requires owner CSRF and clears both session types through the single entry (minify=${minify})`,()=>fixture(minify,async({worker,env,calls})=>{
  const authenticated=await login(worker,env),owner=cookie(authenticated,'braza_admin');
  const confirmation=await worker.fetch(request('/logout',{cookie:owner}),env);assert.equal(confirmation.status,200);assert.equal(confirmation.headers.getSetCookie().length,0,'GET only confirms logout');const confirmationHtml=await confirmation.text();assert.match(confirmationHtml,/action="\/logout" method="post"/);
  assert.equal((await worker.fetch(request('/admin',{cookie:owner}),env)).status,200);
  const forbidden=await worker.fetch(request('/logout',{cookie:owner,method:'POST',headers:{origin,'x-csrf-token':'wrong'}}),env);assert.equal(forbidden.status,403);assert.equal(forbidden.headers.getSetCookie().length,0);
  const csrf=(await (await worker.fetch(request('/api/admin/state',{cookie:owner}),env)).json()).csrf;
  const crossSite=await worker.fetch(request('/logout',{cookie:owner,method:'POST',headers:{origin:'https://other.example.test','x-csrf-token':csrf}}),env);assert.equal(crossSite.status,403);
  const exited=await worker.fetch(request('/logout',{cookie:owner,method:'POST',headers:{origin,'x-csrf-token':csrf}}),env);assert.equal(exited.status,303);assert.equal(exited.headers.get('location'),'/login');assert.ok(cleared(exited,'braza_admin'));assert.ok(cleared(exited,'mls_session'));
  assert.equal(calls.length,0,'login, owner state and logout do not consult provider data');
 }));
}
