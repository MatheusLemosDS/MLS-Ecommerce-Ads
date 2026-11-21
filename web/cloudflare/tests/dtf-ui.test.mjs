import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {DTF_CLIENT,dtfBody} from '../src/dtf-view.mjs';
import {DTF_ENGINE_CLIENT,planDtfLayout} from '../src/dtf-layout.mjs';
import {tenantArtworkDatabaseName} from '../src/tenant-browser-storage.mjs';

const settings={film_width_mm:570,max_length_mm:500,gap_mm:5,margin_mm:5,dpi:300,allow_rotate:false};
const line=(patch={})=>({unit_key:'pedido:1:0',order_id:'PEDIDO1',line_key:'1:0',item_id:'1',model_id:'0',sku:'vivaosanos80-27',model_name:'P',quantity:1,status:'READY_TO_SHIP',production_state:'PENDING',requires_pair:false,last_seen_at:1792843200,...patch});
const snapshot=lines=>({settings:{revision:1,values:settings},lines,batches:[],last_sync_at:1792843200});
const materialHash=value=>value.repeat(64);
function materialWorkspace(lines){return {
 schema:'production_material_workspace_v1',scope:{organization_id:'legacy-brazacommerce',store_id:'legacy-shopee'},planning_date:new Date().toISOString().slice(0,10),checked_at:new Date().toISOString(),fence_hash:materialHash('a'),source_vector:{schema:'production_material_source_vector_v1',orders_hash:materialHash('b'),operational_heads_hash:materialHash('c'),manufacturing_hash:materialHash('d')},
 coverage:{orders_complete:true,stock_complete:true,suppliers_complete:true,purchases_complete:true,manufacturing_complete:true,source_integrity_verified:true,provider_completeness:'NOT_PROVEN',basis:'SAVED_LOCAL_SOURCES_ONLY'},
 orders:lines.map(row=>({source_key:row.unit_key,source_hash:materialHash('e'),line_source_hash:row.source_revision,commercial_quantity:row.quantity,group_revision:1,material_state:'RESERVED',components:[{variant_id:'shirt-black-M',quantity_per_unit:1,required_quantity:row.quantity,reserved_quantity:row.quantity,consumed_quantity:0,shortage_quantity:0}]}))
};}
function browser(responder,stored=[]){
 const drawing=[],downloads=[],timeouts=new Map();let timeoutId=0;
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
 const context=vm.createContext({document:{getElementById:id=>elements.get(id)||null,createElement:create,body:new Element('body'),documentElement:{dataset:{activePanel:'overview'}},visibilityState:'visible',addEventListener:(kind,fn)=>listeners.set(kind,fn)},indexedDB:idb,Blob,Uint8Array,DataView,TextEncoder,TextDecoder,URL,URLSearchParams,crypto:webcrypto,createImageBitmap:async()=>({width:4000,height:2001,close(){}}),setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){},setTimeout:fn=>{const id=++timeoutId;timeouts.set(id,fn);return id;},clearTimeout:id=>timeouts.delete(id),queueMicrotask});
 new vm.Script(DTF_ENGINE_CLIENT).runInContext(context);new vm.Script(DTF_CLIENT).runInContext(context);
 const parse=vm.runInContext('JSON.parse',context);
 const api=async(path,body)=>{const request=body===undefined?undefined:JSON.parse(JSON.stringify(body));calls.push({path,body:request});return parse(JSON.stringify(await responder(path,request)));};
 return {async runTimers(){let count=0;while(timeouts.size){assert.ok(++count<10,'automatic rendering must not reschedule itself indefinitely');const pending=[...timeouts.values()];timeouts.clear();for(const fn of pending)await fn();}},context,el:key=>elements.get('dtf'+key),calls,intervals,drawing,downloads,workspace:context.brazaDtfWorkspace,api};
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

test('commercial DTF opens only its artwork namespace and a late IndexedDB read cannot restore private art after stop',async()=>{
 const b=browser(async()=>snapshot([])),context={kind:'account',userId:'person-a',organizationId:'company-a',storeId:'store-a'},name=tenantArtworkDatabaseName(context);let active=true,read,transaction,closes=0,aborts=0;
 b.context.mlsCommercialWorkspace={isActive:()=>active,ticket:()=>({name}),isCurrent:ticket=>active&&ticket?.name===name,artworkDatabaseName:()=>name};
 b.context.indexedDB.open=(selected,version)=>{assert.equal(selected,name);assert.equal(version,1);const request={};queueMicrotask(()=>{request.result={objectStoreNames:{contains:()=>true},close(){closes++;},transaction(){transaction={abort(){aborts++;transaction.onabort?.();},objectStore(){return {getAll(){read={};return read;}};}};return transaction;}};request.onsuccess();});return request;};
 const starting=b.workspace.start({api:b.api});for(let n=0;n<20&&!read;n++)await Promise.resolve();assert.ok(read,'native-shaped library read is pending');b.workspace.stop();active=false;
 read.result=[{art_key:'private-a-art',sha256:'a'.repeat(64),pixel_width:1,pixel_height:1,blob:new Blob(['private-a'],{type:'image/png'})}];read.onsuccess();await starting;
 assert.equal(b.el('ArtList').children.length,0);assert.equal(b.workspace.getSnapshot(),null);assert.equal(aborts,1);assert.ok(closes>=1);assert.equal(b.el('ArtFiles').value,'');
});

test('batch filters navigate beyond the initial sample without changing the queue or contacting the provider',async()=>{
 const ids=Array.from({length:21},(_,i)=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0')),summary=id=>({id,status:'PREPARED',created_at:1792843200,print_count:1,sheet_count:1});
 const b=browser(async path=>{if(path==='production')return snapshot([line()]);const query=new URLSearchParams(path.split('?')[1]),last=query.has('cursor');return {schema:'production_dtf_batches_page_v1',selection:{status:query.get('status'),search:query.get('search')},generation:'21:21',totals:{all:21,open:21},pagination:{page_size:20,matched_total:21,has_more:!last,next_cursor:last?null:'next-token'},items:(last?ids.slice(20):ids.slice(0,20)).map(summary)};});
 await b.workspace.start({api:b.api});const queue=b.el('Queue').children;await b.el('BatchFilters').onsubmit({preventDefault(){}});assert.equal(b.el('Batches').children.length,20);assert.equal(b.el('BatchCount').textContent,'21');assert.equal(b.el('BatchNext').disabled,false);await b.el('BatchNext').onclick();assert.equal(b.el('Batches').children.length,1);assert.equal(b.el('Batches').children[0].children[0].textContent,'Lote '+ids[20]);assert.equal(b.el('BatchPrevious').disabled,false);await b.el('BatchPrevious').onclick();assert.equal(b.el('Batches').children.length,20);assert.equal(b.calls.some(c=>c.path==='production/sync'||c.body),false);assert.deepEqual(b.el('Queue').children.map(n=>n.children[1].children[0].textContent),queue.map(n=>n.children[1].children[0].textContent));b.workspace.stop();
});

async function automaticFixture(lines=[line()],extra=[]){
 const blob=new Blob(['automatic-original-bytes'],{type:'image/png'}),sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex'),art={art_key:'vivaosanos80',sha256,pixel_width:4000,pixel_height:2001,blob};let current=lines;
 const b=browser(async path=>path==='production'?snapshot(current):{ok:true},[art,...extra]);await b.workspace.start({api:b.api});b.context.document.documentElement.dataset.activePanel='production';
 const enable=()=>{b.el('AutoLayout').checked=true;b.el('AutoLayout').onchange();};enable();return {...b,enable,setLines(value){current=value;}};
}
test('automatic montage selects and renders eligible saved PNGs without selection/preview clicks or reservation writes',async()=>{
 const b=await automaticFixture([line(),line({unit_key:'reserved',production_state:'RESERVED'}),line({unit_key:'cancelled',production_state:'BLOCKED'}),line({unit_key:'kit',requires_pair:true})]);await b.runTimers();assert.equal(b.el('SelectedCount').textContent,'1');assert.equal(b.drawing.length,1);assert.equal(b.el('Prepare').disabled,false);assert.match(b.el('AutoStatus').textContent,/Prévia automática pronta/);assert.equal(b.calls.every(c=>c.body===undefined),true);b.workspace.stop();
});
test('an unchanged source refresh keeps the same automatic canvas; cancellation immediately clears eligibility and cannot reserve stale content',async()=>{
 const b=await automaticFixture();await b.runTimers();const first=b.el('Preview').children[0];await b.workspace.open();await b.runTimers();assert.equal(b.el('Preview').children[0],first);assert.equal(b.drawing.length,1);
 b.setLines([line({production_state:'BLOCKED',status:'CANCELLED'})]);await b.workspace.open();await b.runTimers();assert.equal(b.el('SelectedCount').textContent,'0');assert.equal(b.el('Preview').children.length,0);assert.equal(b.el('Prepare').disabled,true);assert.match(b.el('AutoStatus').textContent,/Nenhuma linha apta/);assert.equal(b.calls.some(c=>c.path==='production/batches'),false);b.workspace.stop();
});
test('manual selection suppresses automatic reselection until explicitly reenabled; dirty settings suppress a new preview',async()=>{
 const b=await automaticFixture();await b.runTimers();b.el('ClearSelection').onclick();await b.runTimers();assert.equal(b.el('SelectedCount').textContent,'0');assert.equal(b.el('AutoLayout').checked,false);assert.match(b.el('AutoStatus').textContent,/Modo manual/);b.enable();await b.runTimers();assert.equal(b.el('Prepare').disabled,false);
 b.el('Gap').value='7';b.el('Gap').oninput();await b.runTimers();assert.equal(b.el('Prepare').disabled,true);assert.match(b.el('AutoStatus').textContent,/Salve o formato/);b.workspace.stop();
});
test('automatic montage stays bounded at the existing order, unit, print and sheet limits',async()=>{
 const b=await automaticFixture(Array.from({length:170},(_,i)=>line({unit_key:'unit-'+i,order_id:'order-'+i})));await b.runTimers();const count=Number(b.el('SelectedCount').textContent);assert.ok(count>0&&count<=50);assert.ok(b.el('Preview').children.length<=20);assert.match(b.el('AutoStatus').textContent,/limite/);assert.equal(b.calls.some(c=>c.body),false);b.workspace.stop();
});
test('stopping during automatic PNG rendering discards the pending canvas and never enables a stale reservation',async()=>{
 const b=await automaticFixture();let release,entered;const started=new Promise(r=>entered=r);b.context.createImageBitmap=()=>{entered();return new Promise(r=>release=()=>r({width:4000,height:2001,close(){}}));};const drawing=b.runTimers();await started;b.workspace.stop();release();await drawing;assert.equal(b.el('Preview').children.length,0);assert.equal(b.calls.some(c=>c.path==='production/batches'),false);
});

test('switching to manual mode during PNG rendering cancels the pending preview and automatic mode can resume without a locked workspace',async()=>{
 const b=await automaticFixture();let release,entered;const started=new Promise(r=>entered=r);const original=b.context.createImageBitmap;b.context.createImageBitmap=()=>{entered();return new Promise(r=>release=()=>r({width:4000,height:2001,close(){}}));};const drawing=b.runTimers();await started;b.el('AutoLayout').checked=false;b.el('AutoLayout').onchange();assert.match(b.el('AutoStatus').textContent,/Modo manual/);release();await drawing;assert.equal(b.el('Preview').children.length,0);assert.equal(b.el('Prepare').disabled,true);b.context.createImageBitmap=original;b.enable();await b.runTimers();assert.equal(b.el('Prepare').disabled,false);assert.equal(b.calls.some(c=>c.path==='production/batches'),false);b.workspace.stop();
});

test('a changed storage/account context during automatic PNG rendering cannot commit the previous account canvas',async()=>{
 const b=await automaticFixture();let release,entered;const started=new Promise(r=>entered=r);b.context.createImageBitmap=()=>{entered();return new Promise(r=>release=()=>r({width:4000,height:2001,close(){}}));};const drawing=b.runTimers();await started;b.context.mlsCommercialContext={changed:true};release();await drawing;assert.equal(b.el('Preview').children.length,0);assert.equal(b.el('Prepare').disabled,true);assert.equal(b.calls.some(c=>c.path==='production/batches'),false);b.workspace.stop();
});

test('physical selection uses only same-source reserved shirts and performs no stock, print or export writes',async()=>{
 const blob=new Blob(['physical-selection-art'],{type:'image/png'}),sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex'),art={art_key:'vivaosanos80',sha256,pixel_width:4000,pixel_height:2001,blob};
 const lines=[line({unit_key:materialHash('1'),source_revision:materialHash('4')}),line({unit_key:materialHash('2'),source_revision:materialHash('5'),order_id:'PEDIDO2'}),line({unit_key:materialHash('3'),source_revision:materialHash('6'),order_id:'PEDIDO3'})],materials=materialWorkspace(lines);
 materials.orders[1].material_state='AVAILABLE_TO_RESERVE';materials.orders[1].components[0].reserved_quantity=0;materials.orders[2].line_source_hash=materialHash('7');
 const b=browser(async()=>snapshot(lines),[art]);b.context.brazaProductionMaterials={async refresh(){return true;},getSnapshot:()=>vm.runInContext('JSON.parse',b.context)(JSON.stringify(materials))};await b.workspace.start({api:b.api});
 assert.equal(b.el('SelectMaterials').disabled,false);assert.equal(await b.el('SelectMaterials').onclick(),true);assert.equal(b.el('SelectedCount').textContent,'1');assert.deepEqual(b.calls.map(row=>row.path),['production']);assert.equal(b.el('AutoLayout').checked,false);assert.match(b.el('Queue').children[0].children[1].children.at(-1).textContent,/Camisetas: Reservadas/);assert.match(b.el('Status').textContent,/nenhuma nova reserva física ou impressão/);
 b.workspace.stop();
});

test('physical reservations never override DTF cancellation, previous print, art or reservation guards',async()=>{
 const blob=new Blob(['physical-guards-art'],{type:'image/png'}),sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex'),art={art_key:'vivaosanos80',sha256,pixel_width:4000,pixel_height:2001,blob};
 const lines=Array.from({length:5},(_,index)=>line({unit_key:materialHash(String(index+1)),source_revision:materialHash('9'),order_id:'PEDIDO'+index}));
 lines[1].production_state='BLOCKED';lines[2].production_state='RESERVED';lines[3].requires_print_review=true;lines[4].sku='missing-art-27';
 const materials=materialWorkspace(lines),b=browser(async()=>snapshot(lines),[art]);b.context.brazaProductionMaterials={async refresh(){return true;},getSnapshot:()=>vm.runInContext('JSON.parse',b.context)(JSON.stringify(materials))};await b.workspace.start({api:b.api});await b.el('SelectMaterials').onclick();assert.equal(b.el('SelectedCount').textContent,'1');assert.deepEqual(b.calls.map(row=>row.path),['production']);b.workspace.stop();
});

test('changed physical scope blocks the selected physical preview and explicit source opening removes stale selection',async()=>{
 const blob=new Blob(['physical-change-art'],{type:'image/png'}),sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex'),art={art_key:'vivaosanos80',sha256,pixel_width:4000,pixel_height:2001,blob};
 const lines=[line({unit_key:materialHash('1'),source_revision:materialHash('4')})];let materials=materialWorkspace(lines),opens=0;
 const b=browser(async()=>snapshot(lines),[art]);b.context.brazaProductionMaterials={async refresh(){return true;},getSnapshot:()=>vm.runInContext('JSON.parse',b.context)(JSON.stringify(materials)),async open(){opens++;return true;}};await b.workspace.start({api:b.api});await b.el('SelectMaterials').onclick();assert.equal(b.el('SelectedCount').textContent,'1');
 materials={...materials,scope:{...materials.scope,store_id:'different-store'}};await b.el('PreviewButton').onclick();assert.equal(b.el('Prepare').disabled,true);assert.match(b.el('PlanInfo').textContent,/fonte física mudou|fonte física/);assert.equal(b.drawing.length,0);assert.deepEqual(b.calls.map(row=>row.path),['production']);
 await b.el('MaterialCheck').onclick();assert.equal(opens,1);assert.equal(b.el('SelectedCount').textContent,'0');assert.equal(b.el('SelectMaterials').disabled,true);assert.match(b.el('MaterialStatus').textContent,/não conferida/);b.workspace.stop();
});

test('a source change during the explicit material refresh cannot select the previously available order',async()=>{
 const blob=new Blob(['material-refresh-art'],{type:'image/png'}),sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex'),art={art_key:'vivaosanos80',sha256,pixel_width:4000,pixel_height:2001,blob};
 const lines=[line({unit_key:materialHash('1'),source_revision:materialHash('4')})];let materials=materialWorkspace(lines),finish,refreshes=0;
 const b=browser(async()=>snapshot(lines),[art]);b.context.brazaProductionMaterials={refresh(){refreshes++;return new Promise(resolve=>finish=resolve);},getSnapshot:()=>vm.runInContext('JSON.parse',b.context)(JSON.stringify(materials))};await b.workspace.start({api:b.api});
 const pending=b.el('SelectMaterials').onclick();await Promise.resolve();assert.equal(refreshes,1);assert.equal(b.el('SelectMaterials').disabled,true);materials.orders[0].commercial_quantity=2;finish(true);assert.equal(await pending,false);assert.equal(b.el('SelectedCount').textContent,'0');assert.deepEqual(b.calls.map(row=>row.path),['production']);b.workspace.stop();
});

test('preparing a physically selected DTF batch rereads materials and refuses a newly released reservation',async()=>{
 const blob=new Blob(['material-prepare-art'],{type:'image/png'}),sha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex'),art={art_key:'vivaosanos80',sha256,pixel_width:4000,pixel_height:2001,blob};
 const lines=[line({unit_key:materialHash('1'),source_revision:materialHash('4')})];let materials=materialWorkspace(lines),refreshes=0;
 const b=browser(async()=>snapshot(lines),[art]);b.context.brazaProductionMaterials={async refresh(){refreshes++;if(refreshes>1){materials.orders[0].material_state='AVAILABLE_TO_RESERVE';materials.orders[0].components[0].reserved_quantity=0;}return true;},getSnapshot:()=>vm.runInContext('JSON.parse',b.context)(JSON.stringify(materials))};await b.workspace.start({api:b.api});
 assert.equal(await b.el('SelectMaterials').onclick(),true);await b.el('PreviewButton').onclick();assert.equal(b.el('Prepare').disabled,false);await b.el('Prepare').onclick();assert.equal(refreshes,2);assert.deepEqual(b.calls.map(row=>row.path),['production'],'no DTF preparation or stock mutation follows a changed physical source');assert.match(b.el('Status').textContent,/fonte física mudou/);b.workspace.stop();
});
