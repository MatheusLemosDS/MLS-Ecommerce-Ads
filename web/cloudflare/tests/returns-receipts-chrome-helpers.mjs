import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createChromeProfileCleanup} from './chrome-profile-cleanup.mjs';
import {waitForChromeDebugPort} from './chrome-debug-port.mjs';

export const receiptChrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
export const receiptPause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function receiptBrowser(){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-receipt-cards-')),child=spawn(receiptChrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-extensions','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'}),cleanup=createChromeProfileCleanup(child,profile);let socket;
 try{
  const port=await waitForChromeDebugPort(child,profile);let page;
  for(let i=0;i<100;i++){try{page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(row=>row.type==='page'&&row.webSocketDebuggerUrl);}catch{}if(page)break;await receiptPause(50);}assert.ok(page,'Chromium must initialize a page');socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('RECEIPT_CDP_OPEN_TIMEOUT')),10000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('RECEIPT_CDP_OPEN_FAILED'));},{once:true});});
  let sequence=0;const pending=new Map(),listeners=new Map();socket.addEventListener('message',event=>{const row=JSON.parse(event.data);for(const callback of listeners.get(row.method)||[])callback(row.params);const call=pending.get(row.id);if(!call)return;pending.delete(row.id);clearTimeout(call.timer);row.error?call.reject(Error(row.error.message||'RECEIPT_CDP_FAILED')):call.resolve(row.result);});
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('RECEIPT_CDP_TIMEOUT:'+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});await send('Page.enable');await send('Runtime.enable');
  return {send,on(method,callback){const callbacks=listeners.get(method)||[];callbacks.push(callback);listeners.set(method,callbacks);},async evaluate(expression){const row=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(row.exceptionDetails)throw Error(row.exceptionDetails.exception?.description||row.exceptionDetails.text);return row.result.value;},close:()=>cleanup(socket)};
 }catch(error){await cleanup(socket);throw error;}
}
export async function receiptWait(cdp,expression,label,diagnostic=()=>null){for(let i=0;i<160;i++){if(await cdp.evaluate(expression))return;await receiptPause(50);}assert.fail(label+' '+JSON.stringify({page:await cdp.evaluate("({status:document.getElementById('physicalReturnsStatus')?.textContent,queue:document.getElementById('physicalReturnsQueueStatus')?.textContent,revision:brazaPhysicalReturns?.getSnapshot()?.physical.revision,retry:{hidden:document.getElementById('physicalReturnsRetry')?.hidden,disabled:document.getElementById('physicalReturnsRetry')?.disabled},activations:globalThis.__receiptActivations??[],errors:globalThis.__receiptErrors??[]})"),diagnostic:await diagnostic()}));}

// Native compositor coordinates, with an observed trusted hover before press.
// No DOM .click(), form submission bypass, or synthetic activation is used.
export async function receiptClick(cdp,selector){
 await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,modifiers:0});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,modifiers:0});
 const doc=await cdp.send('DOM.getDocument'),target=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector});assert.ok(target.nodeId,'native action target exists: '+selector);
 await cdp.evaluate(`(()=>{globalThis.__receiptHover=null;globalThis.__receiptTarget=${JSON.stringify(selector)};if(!globalThis.__receiptHoverListener){globalThis.__receiptActivations=[];globalThis.__receiptHoverListener=true;addEventListener('pointermove',event=>{const target=document.querySelector(__receiptTarget);__receiptHover={trusted:event.isTrusted,matches:!!target&&(target===event.target||target.contains(event.target))};},true);for(const type of ['mousedown','click'])addEventListener(type,event=>{const target=document.querySelector(__receiptTarget);__receiptActivations.push({selector:__receiptTarget,type,trusted:event.isTrusted,matches:!!target&&(target===event.target||target.contains(event.target)),target:event.target.id||event.target.className});if(__receiptActivations.length>30)__receiptActivations.shift();},true);}})()`);
 let point;
 for(let attempt=0;attempt<8;attempt++){
  await cdp.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);
  await cdp.send('DOM.scrollIntoViewIfNeeded',{nodeId:target.nodeId});
  const rect=await cdp.evaluate(`(async()=>{await document.fonts.ready;let prior=null,stable=0,last;for(let i=0;i<120;i++){await new Promise(requestAnimationFrame);const node=document.querySelector(${JSON.stringify(selector)}),r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);last={x:r.x,y:r.y,width:r.width,height:r.height,visible:node.checkVisibility({checkVisibilityCSS:true}),unobscured:hit===node||node.contains(hit)};stable=last.visible&&last.unobscured&&prior&&['x','y','width','height'].every(key=>Math.abs(last[key]-prior[key])<.25)?stable+1:0;if(stable>=5)return {...last,stable};prior=last;}return {...last,stable};})()`);assert.equal(rect.visible,true,selector);assert.equal(rect.unobscured,true,'action is clear of sticky navigation');assert.ok(rect.height>=44,'actions retain44px targets');assert.ok(rect.stable>=5,'action settles before native activation');
  await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});const quads=await cdp.send('DOM.getContentQuads',{nodeId:target.nodeId}),q=quads.quads?.[0];assert.equal(q?.length,8);point={x:(q[0]+q[2]+q[4]+q[6])/4,y:(q[1]+q[3]+q[5]+q[7])/4};const metrics=await cdp.send('Page.getLayoutMetrics'),visual=metrics.cssVisualViewport;
  assert.equal(await cdp.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)}),hit=document.elementFromPoint(${point.x+visual.offsetX},${point.y+visual.offsetY});return hit===node||node.contains(hit);})()`),true,'measured native point belongs to action');
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1,y:1,modifiers:0});await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point,modifiers:0});await receiptPause(30);const hover=await cdp.evaluate('globalThis.__receiptHover');if(hover?.trusted&&hover.matches)break;if(attempt===7)assert.fail('trusted native hover did not reach '+selector);
 }
 await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...point,modifiers:0});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...point,modifiers:0});return point;
}
