import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const workerPath=fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url));

async function compiledWorker(){
 const compiled=await build({entryPoints:[workerPath],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 return (await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'))).default;
}
async function chromeDump(url){
 const args=['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking',
 '--no-first-run','--no-default-browser-check','--disable-extensions','--window-size=420,950',
 '--virtual-time-budget=2800','--dump-dom',url];
 return new Promise((resolve,reject)=>{
  const child=spawn(chrome,args,{stdio:['ignore','pipe','pipe']});
  const chunks=[];let size=0;
  child.stdout.on('data',data=>{size+=data.length;if(size<12*1024*1024)chunks.push(data);});
  let stderr='';
  child.stderr.on('data',data=>{if(stderr.length<8192)stderr+=data.toString().slice(0,500);});
  const watchdog=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Chrome timeout'));},25000);
  child.on('error',error=>{clearTimeout(watchdog);reject(error);});
  child.on('close',(status)=>{clearTimeout(watchdog);if(status!==0)return reject(Error('Chrome exited '+status+': '+stderr.slice(0,400)));resolve(Buffer.concat(chunks).toString());});
 });
}

test('real Chromium hydrates owner agent cards even when finance API is unavailable',{timeout:40000},async t=>{
 if(!chrome)return t.skip('Chrome executable not installed on CI runner');
 const worker=await compiledWorker();
 const env={ADMIN_USERNAME:'owner-browser-test',ADMIN_PASSWORD:'owner-browser-test-password',
  ADMIN_SESSION_SECRET:'owner-browser-test-session-'+ 'x'.repeat(40)};
 const login=await worker.fetch(new Request('https://app.browser.fixture/login',{method:'POST',
  headers:{origin:'https://app.browser.fixture','content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(login.status,303);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const admin=await worker.fetch(new Request('https://app.browser.fixture/admin',{headers:{cookie}}),env);
 assert.equal(admin.status,200);
 let html=await admin.text();
 const errorScript='<script>document.documentElement.setAttribute("data-mls-early","YES");window.__mlsErrors=[];window.addEventListener("error",e=>window.__mlsErrors.push(String(e.message||"ERROR").slice(0,250)));window.addEventListener("unhandledrejection",e=>window.__mlsErrors.push(String(e.reason?.message||e.reason||"REJECTION").slice(0,250)));setTimeout(()=>document.documentElement.setAttribute("data-mls-runtime-errors",JSON.stringify(window.__mlsErrors)),2200);</script>';
 const snapshotScript='<script>document.documentElement.setAttribute("data-mls-late","YES");try{(()=>{function snapshot(){const root=document.getElementById("commandCenterAgents");const trace={registry:typeof globalThis.mlsAgentRegistry,agent_count:root?.children.length||0,fallback_count:root?.querySelectorAll("[data-agent-placeholder=true]").length||0,registry_status:globalThis.mlsAgentRegistry?.getSnapshot?.()?.schema||"MISSING",net_value:(document.getElementById("commandCenterNet")?.textContent||"").slice(0,25),bootstrap_status:(document.getElementById("message")?.textContent||"").slice(0,100),visual:{hero_bg:getComputedStyle(document.querySelector(".mission-command-hero")).backgroundImage.slice(0,180),hero_height:getComputedStyle(document.querySelector(".mission-command-hero")).minHeight,agent_bg:root?.firstElementChild?getComputedStyle(root.firstElementChild).backgroundImage.slice(0,180):"NONE",agent_avatar:root?.firstElementChild?getComputedStyle(root.firstElementChild,"::before").content:"NONE",bars:[...document.querySelectorAll(".mission-comparison-track span")].map(item=>item.style.width),visual_panels:document.querySelectorAll(".mission-data-panel").length},errors:window.__mlsErrors.slice(0,3)};document.documentElement.dataset.mlsHydrationTrace=JSON.stringify(trace);}snapshot();setTimeout(snapshot,200);setTimeout(snapshot,1000);setTimeout(snapshot,2400);})();}catch(e){document.documentElement.setAttribute("data-mls-snapshot-error",String(e?.message||e).slice(0,220));}</script>';
 html=html.replace('<body>','<body>'+errorScript);
 const closing=html.lastIndexOf('</body>');assert.ok(closing>0,'must inject inspector after every bundled inline script');
 html=html.slice(0,closing)+snapshotScript+html.slice(closing);
 const requests=[];
 const server=http.createServer((request,response)=>{
  const path=(request.url||'/').split('?')[0];
  requests.push(path);
  response.setHeader('Cache-Control','no-store');
  if(path==='/admin'){
   response.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
    'Content-Security-Policy':admin.headers.get('content-security-policy')||"default-src 'self'; script-src 'self' 'unsafe-inline';"});
   response.end(html);
  }else if(path==='/api/admin/bootstrap'){
   response.setHeader('Content-Type','application/json');
   response.end(JSON.stringify({schema:'admin_bootstrap_v1',csrf:'a'.repeat(64)}));
  }else{
   response.setHeader('Content-Type','application/json');
   response.writeHead(503);
   response.end(JSON.stringify({error:'ADMIN_UNAVAILABLE'}));
  }
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/admin';
  const output=await chromeDump(url);
  const encoded=output.match(/data-mls-hydration-trace="([^"]+)"/);
  if(!encoded){const pos=output.indexOf('id="commandCenterAgents"');console.log('MLS_BROWSER_MISSING_TRACE',JSON.stringify({html_bytes:html.length,output_bytes:output.length,early:output.includes('data-mls-early="YES"'),late:output.includes('data-mls-late="YES"'),runtime_errors:output.match(/data-mls-runtime-errors="([^"]*)"/)?.[1]?.slice(0,400)||null,snapshot_error:output.match(/data-mls-snapshot-error="([^"]*)"/)?.[1]?.slice(0,260)||null,agents_markup:output.slice(pos,pos+1300),tail:output.slice(-190)}));}
  assert.ok(encoded,'Chrome must run trailing DOM inspection');
  const decode=encoded[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&#39;',"'");
  const trace=JSON.parse(decode);
  console.log('MLS_AGENT_BROWSER_TRACE',JSON.stringify({browser:'headless-chrome',trace,api_requests:[...new Set(requests)]}));
  assert.equal(trace.registry,'object','inline agent script must run in real Chromium');
  assert.equal(trace.registry_status,'mls_agent_registry_v1');
  assert.equal(trace.agent_count,6);
  assert.equal(trace.fallback_count,0,'static placeholders must be replaced after script hydration');
  assert.equal(trace.net_value,'—','no financial number may be fabricated');
  assert.match(trace.visual.hero_bg,/gradient/i,'Mission Control hero must be styled with multi-tone spatial gradient');
  assert.match(trace.visual.agent_bg,/gradient/i,'real agent cards need colored gradient surfaces');
  assert.ok(trace.visual.agent_avatar&&!['none','normal','NONE'].includes(trace.visual.agent_avatar),'robotic avatar must be visible');
  assert.equal(trace.visual.visual_panels,2,'verified day + agent status analytics must exist on home');
  assert.deepEqual(trace.visual.bars,['0%','0%','0%'],'finance failure must never create decorative fake numeric bars');

  assert.deepEqual(trace.errors,[]);
  // The direct deep links must expose only the selected agent/hub section.
  // This checks Chromium's actual hidden attribute after the real Admin client
  // processes the URL, not just an HTML string / a VM stub.
  for(const tab of ['agents','agent-finance','agent-returns']){
   const routed=await chromeDump(url+'?tab='+tab);
   const active=/data-active-panel="([^"]+)"/.exec(routed)?.[1];
   assert.equal(active,tab,'Chrome must activate the requested agent tab');
   const escaped=tab.replace(/[-]/g,'\\-');
   const tag=new RegExp('<section\\b[^>]*id="'+escaped+'"[^>]*>','i').exec(routed)?.[0];
   assert.ok(tag,'dedicated section exists: '+tab);
   assert.doesNotMatch(tag,/\shidden(?:=|\s|>)/,'active section must be visible: '+tab);
   if(tab!=='agents'){
    const overview=/<section\b[^>]*id="overview"[^>]*>/i.exec(routed)?.[0];
    assert.ok(overview&&/\shidden(?:=|\s|>)/.test(overview),'overview must be hidden for '+tab);
   }
   assert.ok(routed.includes('id="mission-'+(tab==='agents'?'finance':tab.slice(6))+'-tasks"'),'dedicated agent tools remain in DOM');
  }

 }finally{
  server.closeAllConnections?.();
  server.close();
 }
});
