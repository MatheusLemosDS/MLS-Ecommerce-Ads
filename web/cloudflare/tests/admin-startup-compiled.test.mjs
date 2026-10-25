import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';

async function ownerHtml(minify){
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const origin='https://app.startup.test',env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'startup-compiled-session-'+ 's'.repeat(32),ADMIN_USERNAME:'startup-owner',ADMIN_PASSWORD:'startup-fixture-password-123456'};
 try{
  const login=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
  const session=await(await worker.fetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
  return {html:await(await worker.fetch(new Request(origin+'/admin',{headers:{cookie}}),env)).text(),session};
 }finally{env.ADMIN_DB.db.close();}
}

function browser(html,session,{sessionFails=false,auditFails=false,unauthorized=false}={}){
 const ids=[...html.matchAll(/\bid="([^"]*)"/g)].map(match=>match[1]),nodes=new Map(),timers=new Map(),calls=[];let nextTimer=0,failed=sessionFails,logoutMode='network';
 const element=(tag='div')=>({tag,value:'',textContent:'',children:[],dataset:{},hidden:false,disabled:false,open:false,style:{},classList:{toggle(){},add(){},remove(){}},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=[...children];this.textContent='';},setAttribute(){},removeAttribute(){},querySelectorAll(){return [];},querySelector(){return null;},contains(){return false;},scrollIntoView(){},get childNodes(){return this.children;}});
 for(const id of ids)nodes.set(id,element());
 const context=vm.createContext({AbortController,URLSearchParams,Intl,Date,Response,TextEncoder,location:{search:'',href:'https://app.startup.test/admin'},history:{replaceState(){}},setTimeout(callback,delay){const id=++nextTimer;timers.set(id,{callback,delay});return id;},clearTimeout(id){timers.delete(id);},setInterval(){return 1;},clearInterval(){},document:{hidden:false,activeElement:null,documentElement:{dataset:{}},getElementById(id){if(!nodes.has(id))throw Error('UNKNOWN_CONTROL:'+id);return nodes.get(id);},createElement:element,querySelectorAll(){return [];},addEventListener(){}},fetch:async(url,options)=>{
  calls.push({url,options});
  if(url==='/admin/logout'){
   if(logoutMode==='network')throw new TypeError('Failed to fetch PRIVATE_LOGOUT_DETAIL');
   if(logoutMode==='forbidden')return new Response(null,{status:403});
   if(logoutMode==='success')return new Response(null,{status:204});
   return new Promise(()=>{});
  }
  if(url==='/api/admin/state'){
   if(unauthorized)return Response.json({error:'UNAUTHORIZED'},{status:401});
   if(failed)throw new TypeError('Failed to fetch PRIVATE_NETWORK_DETAIL');
   return Response.json(session);
  }
  if(url==='/api/admin/audit'&&auditFails)throw new TypeError('Failed to fetch PRIVATE_AUDIT_DETAIL');
  // Simulate Ads and other optional sources never completing. The overview
  // must already have its month, handlers and independent financial request.
  return new Promise(()=>{});
 }});
 vm.runInContext("globalThis.window=globalThis;window.matchMedia=()=>({matches:false});globalThis.addEventListener=()=>{};",context);
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
 const monthly=scripts.find(script=>script.includes('globalThis.brazaMonthDashboard=')),admin=scripts.find(script=>script.includes('let renderedReportKey='));assert.ok(monthly&&admin);
 vm.runInContext(monthly,context);vm.runInContext(admin,context);
 const flush=async()=>{for(let index=0;index<5;index++)await new Promise(resolve=>setImmediate(resolve));};
 return {nodes,timers,calls,context,flush,recover(){failed=false;},setLogout(mode){logoutMode=mode;},run:source=>vm.runInContext(source,context),stop(){vm.runInContext('startupController.stop();brazaMonthDashboard.stop();',context);timers.clear();}};
}

for(const minify of [false,true]){
 test(`the deployed owner script opens the month while audit fails and secondary reads hang (minify=${minify})`,async()=>{
  const {html,session}=await ownerHtml(minify),b=browser(html,session,{auditFails:true});
  try{await b.flush();assert.equal(b.run('startupController.getState().ready'),true);
   assert.equal(b.nodes.get('businessMonthSelect').value,new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7));
   const reads=b.calls.filter(call=>call.url==='/api/admin/finance/business-month');assert.equal(reads.length,1);assert.equal(JSON.parse(reads[0].options.body).operation,'read');assert.equal(reads[0].options.headers['X-CSRF-Token'],session.csrf);
   assert.equal(typeof b.nodes.get('businessMonthRefresh').onclick,'function');assert.match(b.nodes.get('audit').children[0].textContent,/histórico está indisponível/);assert.doesNotMatch(b.nodes.get('message').textContent,/Failed to fetch|PRIVATE/);
  }finally{b.stop();}
 });
 test(`the deployed owner script prepares the month offline and a manual retry safely restores initialization (minify=${minify})`,async()=>{
  const {html,session}=await ownerHtml(minify),b=browser(html,session,{sessionFails:true});
  try{await b.flush();const retry=[...b.timers.values()].find(timer=>timer.delay===750);assert.ok(retry);retry.callback();await b.flush();
   assert.equal(b.calls.filter(call=>call.url==='/api/admin/state').length,2);assert.equal(b.calls.filter(call=>call.url==='/api/admin/finance/business-month').length,0);assert.match(b.nodes.get('businessMonthSelect').value,/^\d{4}-\d{2}$/);assert.equal(b.nodes.get('startupRetry').hidden,false);assert.match(b.nodes.get('message').textContent,/Não foi possível conectar/);assert.doesNotMatch(b.nodes.get('message').textContent,/Failed to fetch|PRIVATE/);
   b.recover();await b.nodes.get('startupRetry').onclick();await b.flush();assert.equal(b.run('startupController.getState().ready'),true);assert.equal(b.calls.filter(call=>call.url==='/api/admin/state').length,3);assert.equal(b.calls.filter(call=>call.url==='/api/admin/finance/business-month').length,1);assert.equal(b.nodes.get('startupRetry').hidden,true);
  }finally{b.stop();}
 });
 test(`an expired session offers login without replaying financial requests (minify=${minify})`,async()=>{
  const {html,session}=await ownerHtml(minify),b=browser(html,session,{unauthorized:true});
  try{await b.flush();assert.equal(b.calls.length,1);assert.equal(b.nodes.get('startupLogin').hidden,false);assert.match(b.nodes.get('message').textContent,/sessão expirou/);assert.equal(b.run('startupController.getState().ready'),false);}
  finally{b.stop();}
 });
 test(`optional settings rendering cannot gate the financial overview (minify=${minify})`,async()=>{
  const {html,session}=await ownerHtml(minify),b=browser(html,session);b.nodes.delete('regular');
  try{await b.flush();assert.equal(b.run('startupController.getState().ready'),true);assert.equal(b.calls.filter(call=>call.url==='/api/admin/finance/business-month').length,1);assert.match(b.nodes.get('simulation').textContent,/configurações não puderam ser carregadas/);}
  finally{b.stop();}
 });
 test(`failed or timed-out logout preserves startup and only a confirmed exit stops the workspace (minify=${minify})`,async()=>{
  const {html,session}=await ownerHtml(minify),b=browser(html,session);
  try{await b.flush();b.run('let monthlyStops=0;const originalMonthlyStop=brazaMonthDashboard.stop;brazaMonthDashboard.stop=()=>{monthlyStops++;return originalMonthlyStop();};');
   assert.equal(await b.nodes.get('logout').onsubmit({preventDefault(){}}),false);assert.equal(b.run('startupController.getState().ready'),true);assert.equal(b.run('monthlyStops'),0);assert.doesNotMatch(b.nodes.get('message').textContent,/Failed to fetch|PRIVATE/);
   b.setLogout('forbidden');assert.equal(await b.nodes.get('logout').onsubmit({preventDefault(){}}),false);assert.equal(b.run('startupController.getState().ready'),true);assert.equal(b.run('monthlyStops'),0);
   b.setLogout('hang');const pending=b.nodes.get('logout').onsubmit({preventDefault(){}}),timeout=[...b.timers.values()].find(timer=>timer.delay===15000);assert.ok(timeout);timeout.callback();assert.equal(await pending,false);assert.equal(b.run('startupController.getState().ready'),true);assert.equal(b.run('monthlyStops'),0);
   b.setLogout('success');assert.equal(await b.nodes.get('logout').onsubmit({preventDefault(){}}),true);assert.equal(b.run('startupController.getState().phase'),'STOPPED');assert.equal(b.run('monthlyStops'),1);assert.equal(b.context.location.href,'/login');
   assert.equal(b.calls.filter(call=>call.url==='/admin/logout').length,4,'each user request issues one POST without automatic replay');
  }finally{b.stop();}
 });
}
