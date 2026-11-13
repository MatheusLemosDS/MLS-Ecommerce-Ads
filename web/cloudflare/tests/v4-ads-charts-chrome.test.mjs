import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import http from './browser-assets-http-fixture.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {BRAZA_THEME_CSS} from '../src/theme.mjs';
import {receiptBrowser,receiptChrome,receiptClick,receiptPause} from './returns-receipts-chrome-helpers.mjs';

const selection={start_date:'2026-11-09',end_date:'2026-11-11'},now=Date.parse('2026-11-11T15:00:00Z');
const measurement=buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:selection,balance:'0',daily:[{date:'2026-11-09',expense:1,broad_gmv:10,broad_order:2,broad_roas:9},{date:'2026-11-11',expense:0,broad_gmv:0,broad_order:0}]},selection,now/1000);
const screenshots=process.env.MLS_V4_CHART_SCREENSHOT_DIR;

test('generated normal/minified Ads charts reconcile source, touch, keyboard, themes and mobile reflow',{timeout:150000},async t=>{
 if(!receiptChrome)return t.skip('Chromium unavailable');assert.equal(measurement.status,'PARTIAL');
 const source=readFileSync(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8');
 for(const minify of [false,true]){
  // Export a presentation function from the actual emitted Worker only within
  // this isolated compilation; production exports and routes are untouched.
  const compiled=await build({stdin:{contents:source+'\nexport {renderAdsWorkspace};',resolveDir:process.cwd(),loader:'js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
  const render=(await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'))).renderAdsWorkspace;
  const html='<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+BRAZA_THEME_CSS+'body{margin:0;padding:16px;background:var(--app-bg);color:var(--text);font:14px/1.5 system-ui}*{box-sizing:border-box}</style></head><body>'+render('/dashboard',{ads:{measurement},role:'review',now})+'<p>QA SINTÉTICA · sem dados reais</p></body></html>';
  const calls=[],server=http.createServer((request,response)=>{calls.push(request.url);response.writeHead(200,{'content-type':'text/html;charset=utf-8'});response.end(html);});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const cdp=await receiptBrowser(),errors=[];cdp.on('Runtime.exceptionThrown',row=>errors.push(row.exceptionDetails.text));
  try{for(const width of [320,1365])for(const theme of ['light','dark']){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===320});await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:width===320});
   await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/dashboard'});
   for(let turn=0;turn<100;turn++){if(await cdp.evaluate('!!globalThis.mlsAdsChartsBound'))break;await receiptPause(30);}
   await cdp.evaluate('document.documentElement.dataset.theme='+JSON.stringify(theme));
   assert.equal(await cdp.evaluate('document.querySelectorAll("[data-ads-chart]").length'),2);
   assert.equal(await cdp.evaluate('document.documentElement.scrollWidth>innerWidth'),false);
   await receiptClick(cdp,'[data-ads-chart="money"] .ads-daily-point');
   const money=await cdp.evaluate('document.querySelector("[data-ads-chart=money] .ads-daily-readout").textContent');assert.match(money,/09\/11\/2026.*R\$ 1,00.*R\$ 10,00/);
   await cdp.evaluate('document.querySelector("[data-ads-chart=money] .ads-daily-point").focus()');await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});
   assert.match(await cdp.evaluate('document.querySelector("[data-ads-chart=money] .ads-daily-readout").textContent'),/10\/11\/2026.*Investimento: —/);
   await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End'});assert.match(await cdp.evaluate('document.querySelector("[data-ads-chart=money] .ads-daily-readout").textContent'),/11\/11\/2026.*R\$ 0,00.*Dia parcial/);
   await receiptClick(cdp,'[data-ads-chart="roas"] .ads-daily-point');assert.match(await cdp.evaluate('document.querySelector("[data-ads-chart=roas] .ads-daily-readout").textContent'),/ROAS calculado: 10,00x · informado: 9,00x/);
   await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});assert.match(await cdp.evaluate('document.querySelector("[data-ads-chart=roas] .ads-daily-readout").textContent'),/Seleção fechada/);
   if(width===320){const point=await cdp.evaluate('(()=>{const n=document.querySelector("[data-ads-chart=roas] .ads-daily-point");n.scrollIntoView({block:"center"});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.match(await cdp.evaluate('document.querySelector("[data-ads-chart=roas] .ads-daily-readout").textContent'),/10,00x/);}
   await receiptClick(cdp,'[data-ads-chart="money"] a');assert.equal(await cdp.evaluate('document.querySelector("[data-ads-details=source]").open'),true);assert.equal(await cdp.evaluate('document.querySelectorAll(".ads-workspace-table tbody tr").length'),3);
   assert.equal(calls.some(path=>path.startsWith('/api/')),false);assert.deepEqual(errors,[]);
   if(screenshots){await cdp.evaluate('document.querySelector("[data-ads-chart=money]").scrollIntoView({block:"start",behavior:"instant"})');mkdirSync(screenshots,{recursive:true});const image=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(screenshots+'/ads-'+(minify?'min':'normal')+'-'+width+'-'+theme+'.png',Buffer.from(image.data,'base64'));}
  }}finally{await cdp.close();await new Promise(resolve=>server.close(resolve));}
 }
});
