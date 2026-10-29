import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';

const origin='https://bootstrap.compiled.test';
const fixture=db=>({...(db?{ADMIN_DB:db}:{}),ADMIN_USERNAME:'bootstrap-owner',ADMIN_PASSWORD:'PRIVATE_BOOTSTRAP_PASSWORD_123456',ADMIN_SESSION_SECRET:'PRIVATE_BOOTSTRAP_SESSION_'+ 's'.repeat(40),MLS_V36_OWNER_PREVIEW:'ENABLED'});
async function workerFor(minify){
 const output=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 return (await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'))).default;
}
async function login(worker,env){
 const response=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(response.status,303);return response.headers.get('set-cookie').split(';')[0];
}
const request=(path,cookie,options={})=>new Request(origin+path,{...options,headers:{...(cookie?{cookie}:{}),...options.headers}});

function fullBrowser(html,fetchImpl){
 const nodes=new Map(),timers=new Map(),calls=[];let timerId=0;
 const element=(tag='div')=>({tag,value:'',textContent:'',children:[],dataset:{},hidden:false,disabled:false,open:false,style:{},classList:{toggle(){},add(){},remove(){}},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=[...children];this.textContent='';},setAttribute(){},removeAttribute(){},querySelectorAll(){return [];},querySelector(){return null;},contains(){return false;},scrollIntoView(){},addEventListener(){},get childNodes(){return this.children;}});
 for(const match of html.matchAll(/\bid="([^"]*)"/g))nodes.set(match[1],element());
 const context=vm.createContext({AbortController,URLSearchParams,Intl,Date,Response,TextEncoder,location:{search:'',href:origin+'/admin'},history:{replaceState(){}},setTimeout(callback,delay){const id=++timerId;timers.set(id,{callback,delay});return id;},clearTimeout(id){timers.delete(id);},setInterval(){return 1;},clearInterval(){},document:{hidden:false,visibilityState:'visible',activeElement:null,documentElement:{dataset:{},style:{}},getElementById(id){if(!nodes.has(id))throw Error('UNKNOWN_CONTROL:'+id);return nodes.get(id);},createElement:element,querySelectorAll(){return [];},addEventListener(){}},fetch:async(url,options)=>{
  calls.push({url,options});const response=await fetchImpl(url,options);
  // Native browser response JSON is constructed in the browser realm.
  response.json=async()=>vm.runInContext('JSON.parse',context)(await response.text());return response;
 }});
 vm.runInContext('globalThis.window=globalThis;window.matchMedia=()=>({matches:false,addEventListener(){}});globalThis.addEventListener=()=>{};',context);
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);assert.equal(scripts.length,14);
 for(const [index,script] of scripts.entries())vm.runInContext(script,context,{filename:'owner-script-'+index+'.js'});
 return {nodes,timers,calls,run:source=>vm.runInContext(source,context),stop(){vm.runInContext('startupController.stop();brazaMonthDashboard.stop();',context);timers.clear();}};
}

for(const minify of [false,true]){
 test(`compiled bootstrap authenticates without D1, rejects extra input and exposes only its session contract (minify=${minify})`,async()=>{
  const worker=await workerFor(minify);let databaseCalls=0;
  const env=fixture({prepare(){databaseCalls++;throw Error('PRIVATE_BOOTSTRAP_DB_FAILURE');},batch(){databaseCalls++;throw Error('PRIVATE_BOOTSTRAP_DB_FAILURE');}}),cookie=await login(worker,env),path='/api/admin/bootstrap';
  for(const supplied of ['', 'mls_session=review', cookie+'-invalid'])assert.equal((await worker.fetch(request(path,supplied),env)).status,401);
  const response=await worker.fetch(request(path,cookie),env);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('access-control-allow-origin'),null);
  const value=await response.json();assert.deepEqual(Object.keys(value).sort(),['csrf','schema']);assert.equal(value.schema,'admin_bootstrap_v1');assert.match(value.csrf,/^[a-f0-9]{64}$/);
  for(const field of ['settings','budget','hermes_connected','hermes_finance_ready'])assert.equal(Object.hasOwn(value,field),false);
  for(const marker of ['PRIVATE_BOOTSTRAP_PASSWORD','PRIVATE_BOOTSTRAP_SESSION','PRIVATE_BOOTSTRAP_DB_FAILURE'])assert.equal(JSON.stringify(value).includes(marker),false);
  assert.equal((await worker.fetch(request(path,cookie,{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'}),env)).status,405);
  assert.equal((await worker.fetch(request(path+'?month=2026-10',cookie),env)).status,400);
  assert.equal((await worker.fetch(request(path,cookie),fixture())).status,200,'a valid owner session must not require a database binding');
  assert.equal(databaseCalls,0,'bootstrap must not call schema setup, queries, corrections or provider work');
 });

 test(`all shipped scripts open the overview while the real state route waits for database setup (minify=${minify})`,{timeout:15000},async()=>{
  const worker=await workerFor(minify),db=new D1(),base=fixture(db),cookie=await login(worker,base);
  let release,entered;const gate=new Promise(resolve=>release=resolve),waiting=new Promise(resolve=>entered=resolve),batches=[];
  const delayed={prepare:sql=>db.prepare(sql),async batch(statements){batches.push(statements.length);if(batches.length===1){entered();await gate;}return db.batch(statements);}},env={...base,ADMIN_DB:delayed};
  let browser,stateRead=null,stateFinished=false;
  try{
   // The database already exists; a new binding/isolate still enters setup.
   const previous=await worker.fetch(request('/api/admin/state',cookie),base);assert.equal(previous.status,200);const saved=await previous.json();
   const response=await worker.fetch(request('/admin',cookie),env);assert.equal(response.status,200);assert.deepEqual(batches,[]);
   browser=fullBrowser(await response.text(),async(path,options)=>{
    if(path==='/api/admin/bootstrap')return worker.fetch(request(path,cookie),env);
    if(path==='/api/admin/state'){
     assert.equal(options.method,'GET');stateRead=worker.fetch(request(path,cookie),env).then(value=>{stateFinished=true;return value;});return stateRead;
    }
    return new Promise(()=>{});
   });
   // Worker session verification uses real WebCrypto. Wait for the database
   // operation itself instead of assuming a fixed number of event-loop turns.
   await waiting;assert.ok(stateRead,'optional settings should start independently');
   assert.equal(stateFinished,false);assert.ok(batches[0]>1,'the controlled wait must be inside real database initialization');
   assert.equal(browser.run('startupController.getState().ready'),true,'database initialization must not hold the authenticated session gate');
   assert.equal(browser.run('state'),null,'pending settings must not invent a revision or values');
   assert.equal(browser.nodes.get('startupRetry').hidden,true);assert.equal(browser.nodes.get('message').textContent,'');
   const monthly=browser.calls.filter(call=>call.url.startsWith('/api/admin/finance/business-month-view?month='));assert.equal(monthly.length,1);assert.equal(monthly[0].options.method,'GET');assert.equal(monthly[0].options.headers['X-Braza-Client-Contract'],'business-month-view-v4');assert.equal(monthly[0].options.headers['X-CSRF-Token'],undefined);
   assert.equal(browser.calls.filter(call=>call.url==='/api/admin/bootstrap').length,1);assert.equal(browser.calls.filter(call=>call.url==='/api/admin/state').length,1);assert.equal(browser.calls.some(call=>call.options.method!=='GET'),false,'loading the page must not submit financial, catalog or settings writes');
   const bootstrapCsrf=browser.run('csrf');assert.equal(bootstrapCsrf,saved.csrf);
   const settingsLoaded=browser.run('settingsPromise');assert.equal(typeof settingsLoaded?.then,'function');
   release();assert.equal(await settingsLoaded,true);assert.equal(browser.run('startupController.getState().ready'),true);assert.equal(browser.run('state.revision'),saved.settings.revision);
   const payload={revision:saved.settings.revision,values:{...saved.settings.values,ad_share_percent:saved.settings.values.ad_share_percent===40?41:40}},body=JSON.stringify(payload),write=extra=>worker.fetch(request('/api/admin/settings',cookie,{method:'POST',headers:{origin,'content-type':'application/json',...extra},body}),env);
   for(const extra of [{},{'x-csrf-token':'invalid'},{'x-csrf-token':bootstrapCsrf,origin:'https://other.test'}])assert.equal((await write(extra)).status,403);
   assert.equal(db.db.prepare('SELECT revision FROM admin_settings WHERE id=1').get().revision,saved.settings.revision,'denied writes must not mutate settings');
   assert.equal((await write({'x-csrf-token':bootstrapCsrf})).status,200,'the unchanged session CSRF still authorizes an explicit same-origin settings write');
   assert.equal(db.db.prepare('SELECT revision FROM admin_settings WHERE id=1').get().revision,saved.settings.revision+1);
  }finally{release();if(stateRead)await stateRead;browser?.stop();db.db.close();}
 });
}
