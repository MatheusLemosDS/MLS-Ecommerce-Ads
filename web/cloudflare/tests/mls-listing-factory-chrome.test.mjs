import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const sleep=milliseconds=>new Promise(done=>setTimeout(done,milliseconds));

async function chromeEvaluate(url,source){
 const profile=mkdtempSync(path.join(os.tmpdir(),'mls-listing-cdp-'));
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--disable-background-networking','--disable-extensions','--remote-allow-origins=*',
  '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let socket;
 try{
  let port=null;
  for(let i=0;i<100;i++){
   try{const rows=readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n');port=Number(rows[0]);if(port>0)break;}
   catch{}await sleep(100);
  }
  if(!port)throw Error('CHROME_DEBUG_PORT_UNAVAILABLE');
  const pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const endpoint=pages.find(item=>item.type==='page')?.webSocketDebuggerUrl;
  if(!endpoint)throw Error('CHROME_PAGE_UNAVAILABLE');
  socket=new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('CHROME_SOCKET_TIMEOUT')),10000);
   socket.addEventListener('open',()=>{clearTimeout(timeout);resolve();},{once:true});
   socket.addEventListener('error',event=>{clearTimeout(timeout);reject(Error('CHROME_SOCKET_ERROR'));},{once:true});
  });
  let seq=0;const requests=new Map();
  socket.addEventListener('message',event=>{
   let msg;try{msg=JSON.parse(event.data);}catch{return;}
   if(!msg.id)return;
   const pending=requests.get(msg.id);if(!pending)return;
   requests.delete(msg.id);
   msg.error?pending.reject(Error('CDP_'+msg.error.message)):pending.resolve(msg.result);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++seq;requests.set(id,{resolve,reject});
   socket.send(JSON.stringify({id,method,params}));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate',{url});
  let ready=false;
  for(let i=0;i<100;i++){
   const state=await send('Runtime.evaluate',{expression:"document.readyState==='complete' && !!document.getElementById('mlsLfForm')",returnByValue:true});
   if(state?.result?.value){ready=true;break;}
   await sleep(100);
  }
  if(!ready)throw Error('CHROME_OWNER_DOCUMENT_NOT_READY');
  const expression=source.replace('document.documentElement.dataset.mlsLfE2e=JSON.stringify(info);','return info;');
  const completion=send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  const result=await Promise.race([completion,new Promise((_,reject)=>setTimeout(()=>reject(Error('CHROME_IMAGE_E2E_TIMEOUT')),25000))]);
  if(result?.exceptionDetails)throw Error('CHROME_FIXTURE_EXCEPTION: '+result.exceptionDetails.text);
  if(result?.result?.type!=='object')throw Error('CHROME_FIXTURE_RESULT_INVALID');
  return result.result.value;
 }finally{
  try{socket?.close();}catch{}
  try{child.kill('SIGKILL');}catch{}
  rmSync(profile,{recursive:true,force:true});
 }
}

const fixture="\n(async()=>{\n const by=id=>document.getElementById('mlsLf'+id),info={};\n try{\n  const root=document.getElementById('mlsListingFactory');\n  info.visible=!document.getElementById('products').hidden&&root.getBoundingClientRect().height>0;\n  info.initialPrice=by('Price').value;\n  info.initialVariantPrices=[...by('Variants').querySelectorAll('[data-role=price]')].map(x=>x.value);\n  by('Ref').value='test-art-001';by('Sku').value='ART001';\n  by('Title').value='Camiseta <img src=x onerror=alert(1)> anos 2000';\n  by('Description').value='Camiseta estampada em tecido macio. Confira as medidas antes de escolher o tamanho.';\n  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;\n  const ctx=canvas.getContext('2d');ctx.fillStyle='#ddd';ctx.fillRect(0,0,1024,1024);\n  const data=canvas.toDataURL('image/png').split(',')[1];\n  const raw=atob(data),bytes=new Uint8Array(raw.length);\n  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);\n  function choose(names){\n   const selected=new DataTransfer();\n   for(const name of names)selected.items.add(new File([bytes],name,{type:name.endsWith('.jpg')?'image/jpeg':'image/png'}));\n   by('Files').files=selected.files;by('Files').dispatchEvent(new Event('change',{bubbles:true}));\n  }\n  async function settled(){\n   for(let i=0;i<75;i++){\n    if(!by('Save').disabled)return;\n    await new Promise(done=>setTimeout(done,100));\n   }\n   throw Error('IMAGE_TIMEOUT');\n  }\n  choose(['foto-invalida.jpg']);await settled();\n  info.spoofed=by('ImagePreview').textContent;\n  const oversized=bytes.slice();oversized[16]=0;oversized[17]=0;oversized[18]=200;oversized[19]=0;\n  const selection=new DataTransfer();selection.items.add(new File([oversized],'big.png',{type:'image/png'}));\n  by('Files').files=selection.files;by('Files').dispatchEvent(new Event('change',{bubbles:true}));\n  await settled();info.oversized=by('ImagePreview').textContent;\n  choose(['foto1.png','foto2.png','foto3.png','foto4.png','foto5.png']);await settled();\n  info.inspected=by('ImagePreview').querySelectorAll('figure').length;\n  by('Price').value='52,90';by('Price').dispatchEvent(new Event('input',{bubbles:true}));\n  info.baseApplied=[...by('Variants').querySelectorAll('[data-role=price]')].map(x=>x.value);\n  let cost=by('Variants').querySelector('[data-role=price]');\n  cost.value='58,50';cost.dispatchEvent(new Event('input',{bubbles:true}));\n  by('Price').value='54,90';by('Price').dispatchEvent(new Event('input',{bubbles:true}));\n  info.manualPreserved=[...by('Variants').querySelectorAll('[data-role=price]')].map(x=>x.value);\n  by('ApplyPrice').click();\n  info.forceApplied=[...by('Variants').querySelectorAll('[data-role=price]')].map(x=>x.value);\n  cost=by('Variants').querySelector('[data-role=price]');cost.value='58,50';\n  cost.dispatchEvent(new Event('input',{bubbles:true}));\n  by('Form').requestSubmit();\n  info.cards=by('Drafts').querySelectorAll('article').length;\n  info.ready=by('Drafts').querySelector('article')?.dataset.ready;\n  info.safe=by('Drafts').querySelectorAll('img').length===5&&\n   by('Drafts').textContent.includes('<img src=x onerror=alert(1)>');\n  by('Drafts').querySelector('button').click();\n  info.editing={ref:by('Ref').value,sku:by('Sku').value,cancelVisible:!by('Cancel').hidden};\n  by('Cancel').click();\n  info.stillOne=by('Drafts').querySelectorAll('article').length===1;\n  const blobs=[];URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:local-test';};\n  HTMLAnchorElement.prototype.click=function(){};\n  by('ExportManifest').click();by('ExportReview').click();\n  info.exported=[];for(const blob of blobs)info.exported.push(JSON.parse(await blob.text()));\n  const importFile=async(object,filename)=>{\n   const t=new DataTransfer();t.items.add(new File([JSON.stringify(object)],filename,{type:'application/json'}));\n   by('Message').textContent='Processando JSON...';\n   by('Import').files=t.files;by('Import').dispatchEvent(new Event('change',{bubbles:true}));\n   for(let i=0;i<65;i++){\n    if(by('Message').textContent.includes('Importados ')||by('Message').textContent.includes('Arquivo contém')||\n     by('Message').textContent.includes('O JSON não corresponde'))return;\n    await new Promise(done=>setTimeout(done,40));\n   }\n   throw Error('IMPORT_TIMEOUT');\n  };\n  window.confirm=()=>true;\n  const malicious={...info.exported[0],access_token:'UNSAFE'};\n  await importFile(malicious,'invalido.json');\n  info.importRejected=by('Message').textContent;\n  await importFile(info.exported[0],'anuncios.json');\n  info.importStatus=by('Drafts').querySelector('article')?.dataset.ready;\n  info.importCount=by('Drafts').querySelectorAll('article').length;\n  info.importMessage=by('Message').textContent;\n  by('Drafts').querySelector('button').click();\n  info.importRelinkNotice=by('Message').textContent;\n  by('Form').requestSubmit();\n  by('ExportManifest').click();\n  info.manifestAfterImport=JSON.parse(await blobs.at(-1).text());\n  info.importAfterEdit=by('Drafts').querySelector('article')?.dataset.ready;\n  const base=info.exported[0].items[0];\n  const many={schema:'mls_listing_factory_input_v1',marketplace:'SHOPEE_BR',\n   items:Array.from({length:19},(_,i)=>({\n    ...base,client_ref:'batch-'+String(i+1).padStart(3,'0'),\n    images:base.images.slice(),\n    variants:base.variants.map(v=>({...v,sku:'BATCH'+String(i+1)+'-'+v.size}))\n   }))};\n  await importFile(many,'multi.json');\n  info.batchFirst={count:by('Drafts').querySelectorAll('article').length,page:by('Page').textContent};\n  by('Next').click();\n  info.batchSecond={count:by('Drafts').querySelectorAll('article').length,page:by('Page').textContent};\n  by('Next').click();\n  info.batchThird={count:by('Drafts').querySelectorAll('article').length,page:by('Page').textContent};\n  by('Previous').click();\n  info.batchBack=by('Page').textContent;\n  info.errors=window.__lfErrors.slice();\n }catch(error){info.failure=String(error?.stack||error).slice(0,1400);}\n document.documentElement.dataset.mlsLfE2e=JSON.stringify(info);\n})();";

test('real Chrome owner validates PNG bytes, rejects spoofed JPG, edits and exports offline',{timeout:65000},async t=>{
 if(!chrome)return t.skip('Chrome unavailable');
 let html=(await compiledOwnerReportPage(false)).html;
 html=html.replace('<head>','<head><script>window.__lfErrors=[];addEventListener("error",e=>window.__lfErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>window.__lfErrors.push(String(e.reason)));</script>');
 const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);});
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 try{
  const data=await chromeEvaluate('http://127.0.0.1:'+server.address().port+'/?tab=products',fixture);
  assert.equal(data.failure,undefined,data.failure);
  assert.equal(data.visible,true);
  assert.equal(data.initialPrice,'');
  assert.deepEqual(data.initialVariantPrices,['','','','']);
  assert.match(data.spoofed,/Formato real incompatível/);
  assert.match(data.oversized,/Dimensões excessivas/);
  assert.deepEqual(data.baseApplied,['52,90','52,90','52,90','52,90']);
  assert.deepEqual(data.manualPreserved,['58,50','54,90','54,90','54,90']);
  assert.deepEqual(data.forceApplied,['54,90','54,90','54,90','54,90']);
  assert.equal(data.inspected,5);assert.equal(data.cards,1);assert.equal(data.ready,'true');
  assert.equal(data.safe,true);
  assert.deepEqual(data.editing,{ref:'test-art-001',sku:'ART001',cancelVisible:true});
  assert.equal(data.stillOne,true);
  assert.deepEqual(data.exported.map(x=>x.schema),['mls_listing_factory_input_v1','mls_listing_factory_plan_v1']);
  assert.equal(data.exported[0].items[0].variants[0].price_cents,5850);
  assert.equal(data.exported[0].items[0].variants[1].price_cents,5490);
  assert.equal(data.exported[0].items[0].variants[0].stock_quantity,null);
  assert.equal(data.exported[1].execution_allowed,false);
  assert.equal(data.exported[1].products[0].seller_publication_allowed,false);
  assert.equal(data.exported[1].products[0].images.length,5);
  assert.match(data.importRejected,/O JSON não corresponde/);
  assert.equal(data.importStatus,'false','JSON alone cannot validate mockup files');
  assert.equal(data.importCount,1);
  assert.match(data.importMessage,/reanexe/i);
  assert.match(data.importRelinkNotice,/selecione novamente os mockups/i);
  assert.deepEqual(data.manifestAfterImport.items[0].images,['foto1.png','foto2.png','foto3.png','foto4.png','foto5.png']);
  assert.equal(data.importAfterEdit,'false','JSON roundtrip is still not publishable');
  assert.deepEqual(data.batchFirst,{count:8,page:'Exibindo 1–8 de 19 · Página 1/3'});
  assert.deepEqual(data.batchSecond,{count:8,page:'Exibindo 9–16 de 19 · Página 2/3'});
  assert.deepEqual(data.batchThird,{count:3,page:'Exibindo 17–19 de 19 · Página 3/3'});
  assert.equal(data.batchBack,'Exibindo 9–16 de 19 · Página 2/3');
  assert.deepEqual(data.errors,[]);
 }finally{server.closeAllConnections?.();server.close();}
});
