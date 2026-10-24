import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {DTF_CLIENT,dtfBody} from '../src/dtf-view.mjs';
import {DTF_ENGINE_CLIENT,planDtfLayout} from '../src/dtf-layout.mjs';

const settings={film_width_mm:570,max_length_mm:500,gap_mm:5,margin_mm:5,dpi:300,allow_rotate:false};
const line=(patch={})=>({unit_key:'pedido:1:0',order_id:'PEDIDO1',line_key:'1:0',item_id:'1',model_id:'0',sku:'vivaosanos80-27',model_name:'P',quantity:1,status:'READY_TO_SHIP',production_state:'PENDING',requires_pair:false,last_seen_at:1792843200,...patch});
const snapshot=lines=>({settings:{revision:1,values:settings},lines,batches:[],last_sync_at:1792843200});
function browser(responder,stored=[]){
 const drawing=[],downloads=[];
 class Element{
  constructor(tag='div'){this.tag=tag;this.textContent='';this.children=[];this.dataset={};this.value='';this.checked=false;this.disabled=false;this.attributes={};}
  append(...values){this.children.push(...values);}
  replaceChildren(...values){this.children=[...values];}
  setAttribute(key,value){this.attributes[key]=value;}
 }
 const elements=new Map([...dtfBody().matchAll(/id="([^"]+)"/g)].map(row=>[row[1],new Element()])),calls=[],intervals=[],listeners=new Map();
 for(const [key,value] of Object.entries({FilmWidth:'57',MaxLength:'50',Gap:'5',Margin:'5',Dpi:'300',Rotate:'false'}))elements.get('dtf'+key).value=value;
 const idb={open(){const request={};queueMicrotask(()=>{request.result={transaction(){return {objectStore(){return {getAll(){const result={};queueMicrotask(()=>{result.result=stored;result.onsuccess?.();});return result;}};},close(){}};},close(){}};request.onsuccess?.();});return request;}};
 const create=tag=>{const element=new Element(tag);if(tag==='canvas'){element.getContext=()=>({save(){},restore(){},translate(){},rotate(){},drawImage(...args){drawing.push(args);}});element.toBlob=callback=>callback(new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')],{type:'image/png'}));}if(tag==='a'){element.click=()=>downloads.push({href:element.href,download:element.download});element.remove=()=>{};}return element;};
 const context=vm.createContext({document:{getElementById:id=>elements.get(id)||null,createElement:create,body:new Element('body'),documentElement:{dataset:{activePanel:'overview'}},visibilityState:'visible',addEventListener:(kind,fn)=>listeners.set(kind,fn)},indexedDB:idb,Blob,Uint8Array,DataView,TextEncoder,TextDecoder,URL,crypto:webcrypto,createImageBitmap:async()=>({width:4000,height:2001,close(){}}),setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){},queueMicrotask});
 new vm.Script(DTF_ENGINE_CLIENT).runInContext(context);new vm.Script(DTF_CLIENT).runInContext(context);
 const parse=vm.runInContext('JSON.parse',context);
 const api=async(path,body)=>{const request=body===undefined?undefined:JSON.parse(JSON.stringify(body));calls.push({path,body:request});return parse(JSON.stringify(await responder(path,request)));};
 return {context,el:key=>elements.get('dtf'+key),calls,intervals,drawing,downloads,workspace:context.brazaDtfWorkspace,api};
}

test('production starts with a read, loads the confirmed57cm setting and never scans while another panel is active',async()=>{
 const b=browser(async()=>snapshot([line()]));await b.workspace.start({api:b.api});assert.deepEqual(b.calls.map(row=>row.path),['production']);assert.equal(b.el('FilmWidth').value,'57');assert.equal(b.el('PendingCount').textContent,'1');assert.equal(b.el('PreviewButton').disabled,true);assert.match(b.el('Queue').children[0].children[2].textContent,/importar a arte/);
 assert.equal(b.intervals.length,1);b.intervals[0]();await Promise.resolve();assert.equal(b.calls.length,1);b.workspace.stop();
});

test('the queue renders private values as text, keeps reservations and cancellations unselectable and paginates20rows',async()=>{
 const lines=Array.from({length:23},(_,index)=>line({unit_key:'u'+index,order_id:'PEDIDO'+index,sku:index?'vivaosanos80-27':'<img src=x onerror=alert(1)>',production_state:index===2?'RESERVED':index===3?'BLOCKED':'PENDING'}));
 const b=browser(async()=>snapshot(lines));await b.workspace.start({api:b.api});assert.equal(b.el('Queue').children.length,20);assert.equal(b.el('Queue').children[0].children[1].children[0].textContent,lines[0].sku);assert.equal(b.el('Queue').children[2].children[0].disabled,true);assert.equal(b.el('Queue').children[3].children[0].disabled,true);assert.equal(b.el('Next').disabled,false);b.el('Next').onclick();assert.equal(b.el('Queue').children.length,3);assert.match(b.el('Page').textContent,/21–23 de 23/);
 assert.doesNotMatch(DTF_CLIENT,/innerHTML/);b.workspace.stop();
});

test('opening production syncs once, guards overlap and preserves the last queue when a source fails',async()=>{
 let finish;const b=browser(async path=>path==='production'?snapshot([line()]):new Promise(resolve=>finish=resolve));await b.workspace.start({api:b.api});b.context.document.documentElement.dataset.activePanel='production';const pending=b.workspace.open();await Promise.resolve();assert.equal(b.calls.filter(row=>row.path==='production/sync').length,1);await b.workspace.open();assert.equal(b.calls.filter(row=>row.path==='production/sync').length,1);finish({ok:true});await pending;assert.equal(b.el('PendingCount').textContent,'1');b.workspace.stop();
});

test('settings edits remain unsaved until explicit save and serialize dimensions as millimeters with CASrevision',async()=>{
 const b=browser(async(path,body)=>path==='production/settings'?{revision:2,values:body.values}:snapshot([]));await b.workspace.start({api:b.api});b.el('FilmWidth').value='56,5';b.el('FilmWidth').oninput();assert.equal(b.calls.length,1);await b.el('SettingsForm').onsubmit({preventDefault(){}});const save=b.calls.find(row=>row.path==='production/settings');assert.equal(save.body.revision,1);assert.equal(save.body.values.film_width_mm,565);assert.equal(save.body.values.dpi,300);b.workspace.stop();
});

test('stopping the workspace ignores a later sync response and prevents another read or scan',async()=>{
 let finish;const b=browser(async path=>path==='production'?snapshot([]):new Promise(resolve=>finish=resolve));await b.workspace.start({api:b.api});b.context.document.documentElement.dataset.activePanel='production';const pending=b.workspace.open();await Promise.resolve();b.workspace.stop();finish({ok:true});await pending;assert.deepEqual(b.calls.map(row=>row.path),['production','production/sync']);await b.workspace.open();assert.equal(b.calls.length,2);
});

test('a local artwork makes the matching SKU ready without stretching its aspectratio into the rounded packing height',async()=>{
 const blob=new Blob(['original-bytes'],{type:'image/png'}),bytes=await blob.arrayBuffer(),sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',bytes)).toString('hex');
 const art={art_key:'vivaosanos80',sha256,pixel_width:4000,pixel_height:2001,blob};const b=browser(async()=>snapshot([line()]),[art]);await b.workspace.start({api:b.api});assert.equal(b.el('Queue').children[0].children[0].disabled,false);b.el('SelectReady').onclick();assert.equal(b.el('SelectedCount').textContent,'1');await b.el('PreviewButton').onclick();assert.equal(b.drawing.length,1);const [,x,y,width,height]=b.drawing[0];assert.ok(x>0&&y>0);assert.equal(height/width,2001/4000);assert.equal(b.el('Prepare').disabled,false);assert.match(b.el('PlanInfo').textContent,/1 estampa/);b.workspace.stop();
});

test('the markup explains local image storage, proportional sizing, fullsize output and recovery through the samebatch',()=>{
 assert.match(dtfBody(),/Artes salvas neste dispositivo/);assert.match(dtfBody(),/vivaosanos80-27/);assert.match(dtfBody(),/altura proporcional/);assert.match(dtfBody(),/não é espelhado/);assert.match(dtfBody(),/mesma reserva/);new vm.Script(DTF_CLIENT);
});

test('selecting a large ready queue builds a bounded printable batch and keeps the remaining orders for later',async()=>{
 const blob=new Blob(['original-bytes'],{type:'image/png'}),sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex'),art={art_key:'vivaosanos80',sha256,pixel_width:4000,pixel_height:2001,blob};
 const b=browser(async()=>snapshot(Array.from({length:70},(_,index)=>line({unit_key:'unit-'+index,order_id:'PEDIDO'+index}))),[art]);
 await b.workspace.start({api:b.api});b.el('SelectReady').onclick();assert.equal(b.el('SelectedCount').textContent,'50');assert.match(b.el('Status').textContent,/próximo lote/);
 await b.el('PreviewButton').onclick();assert.match(b.el('PlanInfo').textContent,/50 estampa/);assert.equal(b.el('Prepare').disabled,false);assert.equal(b.el('PendingCount').textContent,'70');b.workspace.stop();
});

test('exported PNGs retain physical300DPI metadata and every actualdownload rechecks the samebatch before releasing a file',async()=>{
 const blob=new Blob(['original-bytes'],{type:'image/png'}),sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex'),art={art_key:'vivaosanos80',sha256,pixel_width:4000,pixel_height:2001,blob};
 const layout=planDtfLayout({settings,units:[{unit_key:'pedido:1:0',sku:'vivaosanos80-27',quantity:1,requires_pair:false}],artworks:[{art_key:art.art_key,sha256,pixel_width:art.pixel_width,pixel_height:art.pixel_height}]}),batch={id:'lote-original',status:'PREPARED',created_at:'2026-10-24T12:00:00Z',source_checked_at:1792843200,layout};
 let rejectDownload=false;
 const b=browser(async(path,body)=>{if(path==='production/batches/action'){assert.deepEqual(body,{id:batch.id,action:'export'});if(rejectDownload)throw Object.assign(Error('changed'),{status:409});batch.status='EXPORTED';return {batch};}return {...snapshot([]),batches:[batch]};},[art]);
 await b.workspace.start({api:b.api});const button=b.el('Batches').children[0].children[3].children[0];await button.onclick();assert.equal(b.calls.filter(row=>row.path.endsWith('/action')).length,1);const link=b.el('Downloads').children[1],bytes=new Uint8Array(await(await fetch(link.href)).arrayBuffer());let dpi=null;for(let offset=8;offset+12<=bytes.length;){const length=new DataView(bytes.buffer).getUint32(offset),type=String.fromCharCode(...bytes.slice(offset+4,offset+8));if(type==='pHYs')dpi={x:new DataView(bytes.buffer).getUint32(offset+8),y:new DataView(bytes.buffer).getUint32(offset+12),unit:bytes[offset+16]};offset+=length+12;}
 assert.deepEqual(dpi,{x:11811,y:11811,unit:1});assert.equal(b.downloads.length,0);await link.onclick({preventDefault(){}});assert.equal(b.calls.filter(row=>row.path.endsWith('/action')).length,2);assert.equal(b.downloads.length,1);assert.match(b.downloads[0].download,/lote-original-folha-1\.png/);
 rejectDownload=true;await link.onclick({preventDefault(){}});assert.equal(b.downloads.length,1);assert.equal(b.el('Downloads').children.length,0);b.workspace.stop();
});
