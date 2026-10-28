import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
function chromeDump(url){
 return new Promise((resolve,reject)=>{
  const args=['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-extensions',
   '--window-size=420,950','--virtual-time-budget=9000','--dump-dom',url];
  const proc=spawn(chrome,args,{stdio:['ignore','pipe','pipe']}),chunks=[];let size=0,err='';
  const timer=setTimeout(()=>{proc.kill('SIGKILL');reject(Error('Chrome timeout'));},35000);
  proc.stdout.on('data',chunk=>{size+=chunk.length;if(size<14000000)chunks.push(chunk);});
  proc.stderr.on('data',chunk=>{if(err.length<4000)err+=chunk.toString().slice(0,160);});
  proc.on('error',e=>{clearTimeout(timer);reject(e);});
  proc.on('close',code=>{clearTimeout(timer);code===0?resolve(Buffer.concat(chunks).toString()):reject(Error('Chrome '+code+' '+err.slice(0,200)));});
 });
}
const fixture="\n(async()=>{\n const by=id=>document.getElementById('mlsLf'+id),info={};\n try{\n  const root=document.getElementById('mlsListingFactory');\n  info.visible=!document.getElementById('products').hidden&&root.getBoundingClientRect().height>0;\n  by('Ref').value='test-art-001';by('Sku').value='ART001';\n  by('Title').value='Camiseta <img src=x onerror=alert(1)> anos 2000';\n  by('Description').value='Camiseta estampada em tecido macio. Confira as medidas antes de escolher o tamanho.';\n  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;\n  const ctx=canvas.getContext('2d');ctx.fillStyle='#ddd';ctx.fillRect(0,0,1024,1024);\n  const data=canvas.toDataURL('image/png').split(',')[1];\n  const raw=atob(data),bytes=new Uint8Array(raw.length);\n  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);\n  function choose(names){\n   const selected=new DataTransfer();\n   for(const name of names)selected.items.add(new File([bytes],name,{type:name.endsWith('.jpg')?'image/jpeg':'image/png'}));\n   by('Files').files=selected.files;by('Files').dispatchEvent(new Event('change',{bubbles:true}));\n  }\n  async function settled(){\n   for(let i=0;i<75;i++){\n    if(!by('Save').disabled)return;\n    await new Promise(done=>setTimeout(done,100));\n   }\n   throw Error('IMAGE_TIMEOUT');\n  }\n  choose(['foto-invalida.jpg']);await settled();\n  info.spoofed=by('ImagePreview').textContent;\n  choose(['foto1.png','foto2.png','foto3.png','foto4.png','foto5.png']);await settled();\n  info.inspected=by('ImagePreview').querySelectorAll('figure').length;\n  const cost=by('Variants').querySelector('[data-role=price]');\n  cost.value='58,50';cost.dispatchEvent(new Event('input',{bubbles:true}));\n  by('Form').requestSubmit();\n  info.cards=by('Drafts').querySelectorAll('article').length;\n  info.ready=by('Drafts').querySelector('article')?.dataset.ready;\n  info.safe=by('Drafts').querySelectorAll('img').length===5&&\n   by('Drafts').textContent.includes('<img src=x onerror=alert(1)>');\n  by('Drafts').querySelector('button').click();\n  info.editing={ref:by('Ref').value,sku:by('Sku').value,cancelVisible:!by('Cancel').hidden};\n  by('Cancel').click();\n  info.stillOne=by('Drafts').querySelectorAll('article').length===1;\n  const blobs=[];URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:local-test';};\n  HTMLAnchorElement.prototype.click=function(){};\n  by('ExportManifest').click();by('ExportReview').click();\n  info.exported=[];for(const blob of blobs)info.exported.push(JSON.parse(await blob.text()));\n  info.errors=window.__lfErrors.slice();\n }catch(error){info.failure=String(error?.stack||error).slice(0,1400);}\n document.documentElement.dataset.mlsLfE2e=JSON.stringify(info);\n})();";

test('owner Chromium editor validates real images, edits, prevents XSS and exports drafts offline',{timeout:60000},async t=>{
 if(!chrome)return t.skip('Chrome unavailable');
 let html=(await compiledOwnerReportPage(false)).html;
 html=html.replace('<head>','<head><script>window.__lfErrors=[];addEventListener("error",e=>window.__lfErrors.push(String(e.message)));addEventListener("unhandledrejection",e=>window.__lfErrors.push(String(e.reason)));</script>');
 const index=html.lastIndexOf('</body>');assert.ok(index>0);
 html=html.slice(0,index)+'<script>'+fixture+'</script>'+html.slice(index);
 const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const result=await chromeDump('http://127.0.0.1:'+server.address().port+'/?tab=products');
  const match=result.match(/data-mls-lf-e2e="([^"]+)"/);
  assert.ok(match,'Chromium inspector must execute');
  const data=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&amp;','&'));
  assert.equal(data.failure,undefined,data.failure);
  assert.equal(data.visible,true);
  assert.match(data.spoofed,/Formato real incompatível/);
  assert.equal(data.inspected,5);assert.equal(data.cards,1);assert.equal(data.ready,'true');
  assert.equal(data.safe,true);
  assert.deepEqual(data.editing,{ref:'test-art-001',sku:'ART001',cancelVisible:true});
  assert.equal(data.stillOne,true);
  assert.deepEqual(data.exported.map(x=>x.schema),['mls_listing_factory_input_v1','mls_listing_factory_plan_v1']);
  assert.equal(data.exported[0].items[0].variants[0].price_cents,5850);
  assert.equal(data.exported[0].items[0].variants[0].stock_quantity,null);
  assert.equal(data.exported[1].execution_allowed,false);
  assert.equal(data.exported[1].products[0].seller_publication_allowed,false);
  assert.equal(data.exported[1].products[0].images.length,5);
  assert.deepEqual(data.errors,[]);
 }finally{server.closeAllConnections?.();server.close();}
});
