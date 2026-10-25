import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';

for(const minify of [false,true])test(`deployable DTF reads in the background and preserves SKU dimensions after compilation (minify=${minify})`,async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const origin='https://app.compiled.test',env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'compiled-production-secret-12345678901234567890',ADMIN_USERNAME:'compiled-production-owner',ADMIN_PASSWORD:'compiled-production-password-123456',APP_INTERNAL_SECRET:'fixture-private-production-key'},calls=[];
 const savedFetch=globalThis.fetch;
 globalThis.fetch=async request=>{
  const url=new URL(request.url);if(url.pathname!=='/internal/shopee/finance/production-orders')return Response.json({error:'UNAVAILABLE'},{status:503});
  assert.equal(url.origin,'https://auth.brazacommerce.com.br');assert.equal(request.headers.get('x-braza-app-key'),env.APP_INTERNAL_SECRET);assert.equal(request.headers.has('cookie'),false);
  const input=await request.json();calls.push(input);const stamp=Math.floor(Date.now()/1000);
  return Response.json({schema:'production_orders_v1',shop_id:1178167501,checked_at:stamp,start_date:input.operation==='scan'?input.start_date:null,end_date:input.operation==='scan'?input.end_date:null,complete:true,orders:input.operation==='scan'&&input.end_date<new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000))?[]:[{order_id:'COMPILED01',status:'READY_TO_SHIP',create_time:stamp-300,update_time:stamp-1,lines:[{line_key:'101:0',item_id:'101',model_id:'0',sku:'vivaosanos80-27',quantity:2,model_name:'M'}]}]});
 };
 try{
  // DTF and weekly costs advance on their own bounded background lanes.
  for(let tick=0;tick<12&&calls.length<3;tick++){const tasks=[];await worker.scheduled({},env,{waitUntil(task){tasks.push(task);}});await Promise.all(tasks);}
  const today=calls[0]?.end_date,previous=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10),monday=new Date(today+'T12:00:00Z');monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
  const expectedScans=[{operation:'scan',start_date:today,end_date:today},{operation:'scan',start_date:previous,end_date:previous},{operation:'scan',start_date:monday.toISOString().slice(0,10),end_date:today}];
  assert.deepEqual(calls,expectedScans,'the background task reads the DTF day, one DTF history day and the exact current-week cost cohort');
  assert.equal((await worker.fetch(new Request(origin+'/api/admin/production'),env)).status,401);
  const login=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
  const queue=await(await worker.fetch(new Request(origin+'/api/admin/production',{headers:{cookie}}),env)).json();assert.equal(queue.lines[0].sku,'vivaosanos80-27');assert.equal(queue.lines[0].quantity,2);assert.equal(queue.settings.values.film_width_mm,570);
  const page=await worker.fetch(new Request(origin+'/admin?tab=production',{headers:{cookie}}),env),html=await page.text(),scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);assert.equal((html.match(/id="production"/g)||[]).length,1);
  const engine=scripts.find(script=>script.includes('globalThis.brazaDtfEngine='));assert.ok(engine);const context=vm.createContext();new vm.Script(engine).runInContext(context);const parts=new vm.Script("brazaDtfEngine.parseSku('vivaosanos80-27')").runInContext(context);assert.equal(parts[0].width_mm,270);assert.equal(parts[0].art_key,'vivaosanos80');
  const policy=await(await worker.fetch(new Request(origin+'/api/admin/finance/sync-state',{headers:{cookie}}),env)).json(),state=await(await worker.fetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
  const paused=await worker.fetch(new Request(origin+'/api/admin/finance/sync-policy',{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-csrf-token':state.csrf},body:JSON.stringify({revision:policy.revision,enabled:false})}),env);assert.equal(paused.status,200);
  const after=[];await worker.scheduled({},env,{waitUntil(task){after.push(task);}});await Promise.all(after);assert.deepEqual(calls,expectedScans,'pausing automatic collection prevents further DTF and weekly production reads');
 }finally{globalThis.fetch=savedFetch;env.ADMIN_DB.db.close();}
});
