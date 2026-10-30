import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {createChromeProfileCleanup} from './chrome-profile-cleanup.mjs';
import {buildMlsAgentRegistry} from '../src/agent-registry.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const qaDir=process.env.MLS_AGENTS_SCREENSHOT_DIR||null;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function fixture(){
 return buildMlsAgentRegistry({
  day:{schema:'mls_day_snapshot_v1',date:'2026-10-27',state:'READY',net_cents:13784,sales_cents:76276,ads_spend_cents:3777,paid_orders:11,net_basis:'ESTIMATE'},
  month:{schema:'mls_month_snapshot_v1',month:'2026-10',status:'COMPLETE',balance_cents:258761,checked_at:1793070100,
   coverage:{returns:2,returns_unknown:0,cancel_pending:0,other:0,unknown:0},
   production_coverage:{total_units:294,known_units:294},pending:['RETURNS_NOT_RECONCILED']},
  now:1793070150
 });
}
async function browserCDP(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-agents-cdp-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--disable-background-networking','--disable-extensions','--remote-allow-origins=*',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const cleanup=createChromeProfileCleanup(child,profile);
 let ws;
 try{
  let port=0;
  for(let i=0;i<120;i++){
   try{port=Number(readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);if(port>0)break;}catch{}
   await pause(75);
  }
  if(!port)throw Error('Chrome CDP startup failed');
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const url=pages.find(x=>x.type==='page')?.webSocketDebuggerUrl;
  if(!url)throw Error('Chrome page missing');
  ws=new WebSocket(url);
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('CDP socket timeout')),9000);
   ws.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
   ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP socket error'));},{once:true});
  });
  let sequence=0;const pending=new Map();
  ws.addEventListener('message',event=>{
   let msg;try{msg=JSON.parse(event.data);}catch{return;}
   const next=pending.get(msg.id);if(!next)return;pending.delete(msg.id);
   msg.error?next.reject(Error(String(msg.error.message))):next.resolve(msg.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++sequence;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));
  });
  await send('Page.enable');await send('Runtime.enable');
  return {send,async evaluate(expression){
   const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
   if(result.exceptionDetails)throw Error('Browser JS: '+result.exceptionDetails.text+' '+String(result.exceptionDetails.exception?.description||'').slice(0,500));
   return result.result.value;
  },async screenshot(filename){
   if(!qaDir)return;
   const result=await send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
   if(!result?.data)throw Error('Screenshot missing');
   mkdirSync(qaDir,{recursive:true});writeFileSync(path.join(qaDir,filename),Buffer.from(result.data,'base64'));
  },async close(){await cleanup(ws);}};
 }catch(error){
  await cleanup(ws);
  throw error;
 }
}

test('Chrome synthetic owner Agent Hub keeps status evidence and responsive layout on desktop/mobile',{timeout:85000},async t=>{
 if(!chrome)return t.skip('Chrome not installed');
 const snapshot=fixture();
 let {html}=await compiledOwnerReportPage(false,{ownerPreview:false});
 // Applies only to a local synthetic server with no provider/production endpoints.
 html=html.replace('<head>','<head><script>try{localStorage.setItem("braza-theme","dark")}catch(e){}</script>');
 html=html.replace('<body>','<body><div style="position:fixed;bottom:8px;right:8px;pointer-events:none;z-index:99999;background:#13243d;color:#e8f5ff;border:1px solid #5477a9;padding:5px 8px;border-radius:6px;font:10px sans-serif">QA SINTÉTICA · SEM DADOS REAIS</div>');
 const host=http.createServer((req,res)=>{
  if(req.url?.startsWith('/api/')){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"SYNTHETIC_NO_REMOTE_API"}');return;}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(html);
 });
 await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));
 let browser;const report=[];
 try{
  browser=await browserCDP();
  for(const item of [{name:'desktop',width:1365,height:900,mobile:false},
   {name:'mobile',width:390,height:844,mobile:true}]){
   await browser.send('Emulation.setDeviceMetricsOverride',{width:item.width,height:item.height,deviceScaleFactor:1,mobile:item.mobile});
   await browser.send('Page.navigate',{url:'http://127.0.0.1:'+host.address().port+'/admin?tab=agents'});
   let ready=false;
   for(let n=0;n<130;n++){
    if(await browser.evaluate("document.readyState==='complete'&&!!globalThis.mlsMission&&!!document.getElementById('missionHubGrid')")){ready=true;break;}
    await pause(70);
   }
   assert.equal(ready,true,item.name+': Agent Hub did not initialize');
   const value=await browser.evaluate("(()=>{"+
    "const hub=document.getElementById('agents');hub.hidden=false;"+
    "const setup=document.querySelector('.startup-recovery');if(setup)setup.hidden=true;"+
    "document.querySelectorAll('main.workspace>section').forEach(node=>{if(node!==hub)node.hidden=true});"+
    "globalThis.mlsMission.refresh("+JSON.stringify(snapshot)+");"+
    "hub.scrollIntoView({block:'start',behavior:'instant'});"+
    "const box=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width,height:r.height}};"+
    "const grid=hub.querySelector('.mission-hub-grid'),summary=hub.querySelector('.mission-hub-summary');"+
    "const cards=[...hub.querySelectorAll('.mission-hub-card')];"+
    "return {inner:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,"+
    "hero:box(hub.querySelector('.mission-hub-hero')),hub:box(hub),summary:box(summary),priority:box(hub.querySelector('.mission-hub-priority-module')),"+
    "grid:box(grid),columns:getComputedStyle(grid).gridTemplateColumns.trim().split(/\\s+/).length,"+
    "summaryColumns:getComputedStyle(summary).gridTemplateColumns.trim().split(/\\s+/).length,"+
    "cards:cards.length,statuses:cards.map(card=>card.dataset.missionHubState),"+
    "attention:document.getElementById('missionHubAttentionCount').textContent,"+
    "working:document.getElementById('missionHubWorkingCount').textContent,"+
    "priorityCount:document.getElementById('missionHubPriorityCount').textContent,"+
    "hasOverflow:[...hub.querySelectorAll('.mission-hub-card,.mission-hub-summary-card,.mission-hub-priority-module,.mission-hub-evidence-module')].some(node=>box(node).right>innerWidth+3)};"+
    "})()");
   assert.equal(value.inner,item.width,item.name+': viewport expanded');
   assert.ok(value.scroll<=item.width+2,item.name+': horizontal overflow '+JSON.stringify(value));
   assert.ok(value.hub.left>=-2&&value.hub.right<=item.width+3,item.name+': hub clipped');
   assert.ok(value.hero.left>=-2&&value.hero.right<=item.width+3,item.name+': hero clipped');
   assert.ok(value.hero.top>=68,item.name+': heading hidden by sticky header');
   assert.equal(value.hasOverflow,false,item.name+': cards overflow screen');
   assert.equal(value.cards,7);
   assert.equal(value.columns,item.mobile?1:3);
   assert.equal(value.summaryColumns,item.mobile?2:4);
   assert.equal(value.priorityCount,String(snapshot.priorities.length));
   assert.ok(value.statuses.every(state=>['HEALTHY','WORKING','ATTENTION','BLOCKED'].includes(state)));
   await browser.screenshot('agents-'+item.name+'.png');
   // Capture secondary viewports to inspect summary and specialist cards, not just the hero.
   await browser.evaluate("document.querySelector('#agents .mission-hub-summary').scrollIntoView({block:'start',behavior:'instant'})");
   await browser.screenshot('agents-'+item.name+'-summary.png');
   await browser.evaluate("document.querySelector('#agents .mission-hub-grid').scrollIntoView({block:'start',behavior:'instant'})");
   await browser.screenshot('agents-'+item.name+'-cards.png');
   const interaction=await browser.evaluate("(()=>{"+
    "const group=document.querySelector('[data-mission-hub-filter=ATTENTION]');group.click();"+
    "const selected=[...document.querySelectorAll('.mission-hub-card')].filter(card=>!card.hidden).map(card=>card.dataset.missionHubState);"+
    "const pressed=group.getAttribute('aria-pressed');"+
    "document.querySelector('[data-mission-hub-filter=all]').click();"+
    "const input=document.getElementById('missionAgentSearch');input.value='finance';input.dispatchEvent(new Event('input',{bubbles:true}));"+
    "const found=[...document.querySelectorAll('.mission-hub-card')].filter(card=>!card.hidden).map(card=>card.dataset.missionAgent);"+
    "return {selected,pressed,found};})()");
   assert.ok(interaction.selected.every(state=>['ATTENTION','BLOCKED'].includes(state)));
   assert.equal(interaction.pressed,'true');
   assert.deepEqual(interaction.found,['finance']);
   report.push({viewport:item.name,width:item.width,height:item.height,synthetic:true,noOverflow:true,agentCards:7});
  }
  if(qaDir){
   mkdirSync(qaDir,{recursive:true});
   writeFileSync(path.join(qaDir,'results.json'),JSON.stringify({schema:'mls_agents_hub_visual_qa_v1',owner_real_session_verified:false,production_approved:false,observations:report},null,2)+'\n');
   writeFileSync(path.join(qaDir,'README.txt'),'MLS Agents Hub: SYNTHETIC ONLY. No real shop, buyer, Finance or Shopee API data. No production approval.\n');
  }
 }finally{try{await browser?.close();}finally{host.closeAllConnections?.();host.close();}}
});
