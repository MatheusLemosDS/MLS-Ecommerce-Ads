import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {receiptChrome,receiptBrowser,receiptClick,receiptPause} from './returns-receipts-chrome-helpers.mjs';
import {MLS_BROWSER_ASSET_MANIFEST as manifest} from '../src/browser-assets-manifest.mjs';
import {createLocalBrowserAssets} from '../../../tools/browser_assets.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
async function wait(cdp,expression,label){for(let n=0;n<180;n++){if(await cdp.evaluate(expression))return;await receiptPause(40);}assert.fail(label+' '+JSON.stringify(await cdp.evaluate('({url:location.href,message:document.getElementById("message")?.textContent,retry:document.getElementById("startupRetry")?.outerHTML})')));}
for(const minify of [false,true])test('compiled workspace asset failure is readable, starts no API controllers and reloads all six exact assets (minify='+minify+')',{timeout:120000},async t=>{
 if(!receiptChrome)return t.skip('Chromium unavailable');
 const owner=await compiledOwnerReportPage(minify,{ownerPreview:false,localReadSnapshot:true}),local=createLocalBrowserAssets(root),workspace=manifest.assets.find(row=>row.id==='workspace'),weekly=manifest.assets.find(row=>row.id==='weekly'),cached=new Map(owner.localReadSnapshot.responses.map(row=>[row.path,row]));
 assert.ok(workspace);const scripts=[...owner.html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)].map(m=>m[1]);assert.equal(scripts.length,6);assert.equal(scripts.at(-1),workspace.path);assert.deepEqual([...scripts].sort(),manifest.assets.map(row=>row.path).sort());
 let mode='missing',serverError=null;const requests=[],errors=[],network=[];
 const server=http.createServer(async(req,res)=>{try{
  requests.push({method:req.method,path:req.url});
  if(req.url.startsWith('/assets/mls/')){
   if(req.url===workspace.path&&mode==='missing'||req.url===weekly.path&&mode==='weekly'){res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"SYNTHETIC_ASSET_UNAVAILABLE"}');return;}
   const result=await local.fetch(new Request('http://fixture.invalid'+req.url));const bytes=Buffer.from(await result.arrayBuffer());if(req.url===workspace.path&&mode==='integrity')bytes[0]^=1;
   res.writeHead(result.status,Object.fromEntries(result.headers));res.end(bytes);return;
  }
  if(req.url.startsWith('/api/')){assert.equal(req.method,'GET','asset lifecycle proof never writes');const entry=cached.get(req.url);res.writeHead(entry?200:503,{'content-type':'application/json','cache-control':'no-store',...(entry?.contract?{'x-braza-client-contract':entry.contract}:{})});res.end(JSON.stringify(entry?.body||{error:'SYNTHETIC_OPTIONAL_SOURCE_UNAVAILABLE'}));return;}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(owner.html);
 }catch(error){serverError=String(error.stack||error);res.writeHead(500);res.end('SYNTHETIC_TEST_ERROR');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port,cdp=await receiptBrowser();cdp.on('Network.requestWillBeSent',event=>network.push({url:event.request.url,loader:event.loaderId}));cdp.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails.exception?.description||event.exceptionDetails.text));
 try{
  await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Emulation.setDeviceMetricsOverride',{width:320,height:900,deviceScaleFactor:1,mobile:true});
  for(const failure of ['missing','integrity']){
   mode=failure;const navigation=await cdp.send('Page.navigate',{url:origin+'/admin?tab=overview'});assert.ok(navigation.loaderId);
   await wait(cdp,'document.getElementById("message")?.textContent.includes("Não foi possível carregar o painel")&&!document.getElementById("startupRetry").hidden','workspace '+failure+' has an actionable fallback');
   assert.equal(await cdp.evaluate('typeof globalThis.mlsFinanceSyncInspector'),'undefined','missing workspace cannot initialize the Admin controller');assert.equal(network.some(r=>r.loader===navigation.loaderId&&r.url.startsWith(origin+'/api/')),false,'the failed document does not initialize API controllers; prior-document requests have distinct loaders');
   assert.equal(await cdp.evaluate('document.getElementById("message").getAttribute("role")'),'alert');assert.equal(await cdp.evaluate('document.getElementById("startupRetry").disabled'),false);assert.equal(await cdp.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true);assert.ok(await cdp.evaluate('document.getElementById("startupRetry").getBoundingClientRect().height')>=44);
   if(process.env.MLS_WORKSPACE_ASSET_SCREENSHOT_DIR){mkdirSync(process.env.MLS_WORKSPACE_ASSET_SCREENSHOT_DIR,{recursive:true});const image=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(process.env.MLS_WORKSPACE_ASSET_SCREENSHOT_DIR+'/workspace-'+(minify?'min':'normal')+'-'+failure+'-320.png',Buffer.from(image.data,'base64'));}
   mode='success';const reloadFirst=requests.length;await receiptClick(cdp,'#startupRetry');await wait(cdp,'typeof globalThis.mlsFinanceSyncInspector?.read==="function"&&document.getElementById("startupRetry").hidden','native reload initializes actual workspace after source recovery');
   const served=new Set(requests.slice(reloadFirst).filter(r=>r.path.startsWith('/assets/mls/')).map(r=>r.path));assert.deepEqual([...served].sort(),manifest.assets.map(row=>row.path).sort(),'successful reload loads the exact six-asset inventory');assert.equal(requests.slice(reloadFirst).filter(r=>r.path.startsWith('/api/')).every(r=>r.method==='GET'),true);
  }
  mode='weekly';await cdp.send('Page.navigate',{url:origin+'/admin?tab=weekly-report'});await wait(cdp,'document.getElementById("weeklyOperatingStatus")?.textContent.includes("Não foi possível carregar o relatório semanal")','the previous weekly fallback remains functional with the workspace present');assert.equal(await cdp.evaluate('typeof mlsFinanceSyncInspector.read'),'function');assert.equal(await cdp.evaluate('document.getElementById("message").textContent.includes("Não foi possível carregar o painel")'),false);
  assert.deepEqual(errors,[]);assert.equal(serverError,null);assert.equal(requests.every(r=>r.method==='GET'),true);
 }finally{await cdp.close();await new Promise(resolve=>server.close(resolve));}
});
