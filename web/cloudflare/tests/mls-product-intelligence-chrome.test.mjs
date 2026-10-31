import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {createChromeProfileCleanup} from './chrome-profile-cleanup.mjs';
import {productObserverFrame} from './mls-product-intelligence-fixture.mjs';
import {workspaceView} from './monthly-workspace-browser-fixture.mjs';
const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
async function dump(url,width,height){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-pricing-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const cleanup=createChromeProfileCleanup(child,profile);
 let socket;const pause=()=>new Promise(resolve=>setTimeout(resolve,75));
 try{
  let port=0;
  for(let n=0;n<100;n++){try{port=Number(readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0]);}catch{}if(port)break;await pause();}
  assert.ok(port,'Chromium debug port not ready');
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let seq=0;const pending=new Map();
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data),call=pending.get(data.id);if(!call)return;pending.delete(data.id);data.error?call.reject(Error(data.error.message)):call.resolve(data.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{
   const result=await send('Runtime.evaluate',{expression,returnByValue:true});
   if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;
  };
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width===390});
  await send('Page.navigate',{url});
  let complete=false;
  for(let n=0;n<120;n++){if(await evaluate('!!(document.documentElement?.dataset.pricingProof||document.documentElement?.dataset.pricingError)')){complete=true;break;}await pause();}
  assert.equal(complete,true,'compiled pricing fixture did not finish');
  return await evaluate('document.documentElement.outerHTML');
 }finally{await cleanup(socket);}
}

test('compiled observer ranks actual saved units and calculates only an explicit local what-if',{timeout:120000},async t=>{
 if(!chrome)return t.skip('Chromium unavailable');
 const source=workspaceView(productObserverFrame());
 for(const minify of [false,true]){
  let {html}=await compiledOwnerReportPage(minify,{ownerPreview:false});
  const script=`<script>(async()=>{try{
   const view=${JSON.stringify(source)},requests=[];
   const api=async(path,body)=>{requests.push({path,write:body!==undefined});
    if(path.startsWith('finance/business-month-view?'))return structuredClone(view);
    throw Error('SYNTHETIC_SOURCE_UNAVAILABLE');
   };
   await globalThis.brazaMonthDashboard.start({api});
   const byId=name=>document.getElementById('businessMonthPricing'+name);
   const initial={ready:byId('Observer').dataset.sourceReady,rows:byId('Rows').querySelectorAll('tr').length,
    units:byId('Rows').querySelector('tr')?.children[2]?.textContent,
    band:byId('Rows').querySelector('tr')?.children[1]?.textContent,
    assumptions:['Extra','Fee','Ads','Margin'].map(name=>byId(name).value),
    gate:byId('Scope').textContent};
   byId('Variant').value='301:1';byId('Calculate').click();
   const missing=byId('Result').textContent;
   for(const [name,value] of Object.entries({Extra:'2,00',Fee:'10',Ads:'5',Margin:'20'})){byId(name).value=value;byId(name).dispatchEvent(new Event('input'));}
   byId('Calculate').click();const result=byId('Result').textContent;
   byId('Ads').value='15';byId('Ads').dispatchEvent(new Event('input'));const changed=byId('Result').textContent;
   byId('Fee').value='<img src=x onerror=alert(1)>';byId('Calculate').click();
   const invalid={text:byId('Result').textContent,injected:byId('Result').querySelectorAll('img,script,iframe').length};
   byId('Fee').value='90';byId('Ads').value='90';byId('Calculate').click();const excessive=byId('Result').textContent;
   byId('Extra').value='0';byId('Fee').value='0';byId('Ads').value='0';byId('Margin').value='0';byId('Calculate').click();
   const zero=byId('Result').textContent;
   document.documentElement.dataset.pricingProof=JSON.stringify({initial,missing,result,changed,invalid,excessive,zero,
    writes:requests.filter(row=>row.write).length});
   globalThis.brazaMonthDashboard.stop();
  }catch(e){document.documentElement.dataset.pricingError=String(e.message||e);}})();</script>`;
  html=html.replace('</body>',script+'</body>');
  const server=http.createServer((req,res)=>{res.writeHead(req.url.startsWith('/api/')?503:200,{'content-type':req.url.startsWith('/api/')?'application/json':'text/html; charset=utf-8'});res.end(req.url.startsWith('/api/')?'{}':html);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
   for(const [width,height] of [[1365,900],[390,844]]){
    const output=await dump('http://127.0.0.1:'+server.address().port+'/admin?tab=agent-finance&month=2026-10',width,height);
    assert.doesNotMatch(output,/data-pricing-error=/);
    const match=/data-pricing-proof="([^"]+)"/.exec(output);assert.ok(match,'compiled observer proof missing');
    const proof=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));
    assert.equal(proof.initial.ready,'true');assert.equal(proof.initial.rows,1);
    assert.equal(proof.initial.units,'257');assert.equal(proof.initial.band,'A');
    assert.deepEqual(proof.initial.assumptions,['','','','']);
    assert.match(proof.initial.gate,/não por estoque/);assert.match(proof.initial.gate,/não publica preços/);
    assert.match(proof.missing,/Nenhum valor é presumido/);
    assert.match(proof.result,/47,70/);assert.match(proof.result,/NÃO É PREÇO SEGURO/);
    assert.match(proof.changed,/Hipóteses alteradas/);assert.doesNotMatch(proof.changed,/47,70/);
    assert.equal(proof.invalid.injected,0);assert.match(proof.invalid.text,/Nenhum valor é presumido/);
    assert.match(proof.excessive,/menor que 100%/);assert.match(proof.zero,/29,00/);
    assert.equal(proof.writes,0,'scenario controls never mutate a business record or marketplace');
   }
  }finally{await new Promise(resolve=>server.close(resolve));}
 }
});
