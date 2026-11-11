import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {ORDER_OPERATIONS_CSS,ORDER_OPERATIONS_CLIENT,orderOperationsBody,createOrderOperationsController} from '../src/order-operations-view.mjs';

const baseTime=Date.parse('2026-11-11T15:00:00Z'),stamp=baseTime/1000,hash='a'.repeat(64),stages=['NOT_STARTED','SEPARATION','PRODUCTION','FINISHING','READY_TO_SHIP','SHIPPED','COMPLETED','CANCELLED','UNPAID','REVIEW'];
const identity={platform:'SHOPEE_BR',shop_id:'1178167501',order_id:'SYNTHETIC-ORDER-1'};
function order(){return {identity:{...identity},source_hash:hash,provider:{status:'READY_TO_SHIP',created_at:stamp-3600,updated_at:stamp-60,checked_at:stamp,age_seconds:0,stale:false},operation:{stage:null,updated_at:null,reason:null,lines_changed:false},display_stage:'NOT_STARTED',can_update:true,blocked_reasons:[],lines:[{item_id:'101',model_id:'201',sku:'SYNTHETIC-SKU',quantity:2,model_name:'<script>Somente texto</script>',missing:false}],lines_total:1,lines_limited:false,selling_units:2};}
function workspace(selection={start_date:'2026-11-11',end_date:'2026-11-11',status:'ALL',page:1},rows=[order()]){const counts=Object.fromEntries(stages.map(stage=>[stage,0]));for(const row of rows)counts[row.display_stage]++;return {schema:'order_operations_workspace_v1',checked_at:stamp,revision:0,selection:{...selection},pagination:{page:selection.page,page_size:50,total_orders:rows.length,pages:rows.length?1:0,has_more:false},coverage:{state:'PARTIAL',source:'SAVED_SHOPEE_DTF_CACHE',period_complete:false,orders_in_period:rows.length,oldest_checked_at:stamp,latest_checked_at:stamp,last_sync_at:stamp,history_next_date:'2026-11-10'},platforms:[{platform:'SHOPEE_BR',shop_id:'1178167501',connection:'SAVED_SOURCE'},{platform:'MERCADO_LIVRE_BR',shop_id:null,connection:'NOT_CONNECTED'},{platform:'TIKTOK_SHOP_BR',shop_id:null,connection:'NOT_CONNECTED'}],totals:{orders:rows.length,by_stage:counts},orders:rows};}

function browser(){
 const controls=new Map(),listeners=new Map(),windowListeners=new Map(),timers=new Map();let time=baseTime,sequence=0;
 function node(tag='div'){let id='';const value={tag,textContent:'',value:'',checked:false,disabled:false,hidden:false,children:[],style:{},dataset:{},attributes:{},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=[...children];this.textContent='';},setAttribute(name,value){this.attributes[name]=value;},focus(){},scrollIntoView(){}};Object.defineProperty(value,'id',{get:()=>id,set:valueId=>{id=valueId;controls.set(id,value);}});return value;}
 for(const [,id] of orderOperationsBody().matchAll(/\bid="([^"]+)"/g)){const value=node();value.id=id;}
 const el=name=>controls.get('orderOperations'+name),document={hidden:false,visibilityState:'visible',documentElement:{dataset:{activePanel:'overview'}},getElementById:id=>controls.get(id),createElement:node,addEventListener:(name,callback)=>listeners.set(name,callback)};
 el('StatusFilter').value='ALL';el('Auto').checked=true;el('Editor').hidden=true;
 const calls=[];let handler=async(path,request)=>path==='production/sync'?{}:request?{schema:'order_operations_mutation_v1',request_id:request.request_id,revision:request.revision+1,replayed:false}:workspace(Object.fromEntries([...new URLSearchParams(path.split('?')[1])].map(([key,value])=>[key,key==='page'?Number(value):value])));
 const api=async(path,request)=>{calls.push({path,request:request&&structuredClone(request)});return handler(path,request);};
 class FixtureDate extends Date{static now(){return time;}}
 const environment={document,crypto:webcrypto,Date:FixtureDate,setTimeout:(callback,delay)=>{const id=++sequence;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id),addEventListener:(name,callback)=>windowListeners.set(name,callback)};
 const controller=createOrderOperationsController(environment);controller.prepare();
 const fullText=value=>(value.textContent??'')+' '+value.children.map(fullText).join(' ');
 const buttons=value=>value.children.flatMap(child=>[...(child.tag==='button'?[child]:[]),...buttons(child)]);
 return {el,document,controller,api,calls,timers,handler:value=>handler=value,text:name=>fullText(el(name)),buttons:name=>buttons(el(name)),advance:milliseconds=>{time+=milliseconds;},event:name=>listeners.get(name)?.(),focus:()=>windowListeners.get('focus')?.(),async tick(){const entry=[...timers.entries()][0];if(entry){timers.delete(entry[0]);time+=entry[1].delay;await entry[1].callback();await flush();}}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function ready(){const b=browser();await b.controller.start({api:b.api});b.document.documentElement.dataset.activePanel='order-operations';b.controller.open();await flush();return b;}
function edit(b){const button=b.buttons('Orders').find(button=>button.textContent==='Atualizar etapa');assert.ok(button);button.onclick();b.el('Stage').value='SEPARATION';b.el('Reason').value='Separação conferida em cenário sintético';b.el('Confirm').checked=true;b.el('Confirm').onchange();}

test('opening operations lazily reads saved orders; automatic source sync is single-flight and only visible',async()=>{
 const b=browser();await b.controller.start({api:b.api});assert.equal(b.calls.length,0);assert.equal(b.timers.size,0);b.document.documentElement.dataset.activePanel='order-operations';b.controller.open();b.controller.open();await flush();assert.equal(b.calls.length,1);assert.match(b.calls[0].path,/order-operations\?.*start_date=2026-11-11/);assert.equal([...b.timers.values()][0].delay,60000);
 await b.tick();assert.equal(b.calls.filter(call=>call.path==='production/sync').length,1);assert.equal(b.calls.filter(call=>call.path.startsWith('order-operations?')).length,2);b.controller.hide();assert.equal(b.timers.size,0);b.focus();assert.equal(b.calls.length,3);
});

test('totals are independent of the visible page and each card keeps source status separate from internal work',async()=>{
 const b=browser();b.handler(async(path)=>{const selection={start_date:'2026-11-11',end_date:'2026-11-11',status:'ALL',page:Number(new URLSearchParams(path.split('?')[1]).get('page'))},value=workspace(selection);value.totals.orders=81;value.totals.by_stage.NOT_STARTED=80;value.totals.by_stage.SHIPPED=1;value.coverage.orders_in_period=81;value.pagination={page:selection.page,page_size:50,total_orders:81,pages:2,has_more:selection.page===1};return value;});await b.controller.start({api:b.api});b.document.documentElement.dataset.activePanel='order-operations';b.controller.open();await flush();assert.match(b.text('Metrics'),/80/);assert.match(b.text('Scope'),/81 pedido/);assert.match(b.text('Orders'),/Na Shopee: A preparar/);assert.match(b.text('Orders'),/Etapa interna: não iniciada/);assert.match(b.text('Orders'),/<script>Somente texto<\/script>/);await b.el('Next').onclick();assert.match(b.calls.at(-1).path,/page=2/);assert.match(b.text('Page'),/Página 2 de 2/);assert.match(b.text('Metrics'),/80/);
});

test('a stage requires explicit confirmation and reason and sends only the internal operation intent',async()=>{
 const b=await ready();const button=b.buttons('Orders').find(button=>button.textContent==='Atualizar etapa');button.onclick();b.el('Stage').value='SEPARATION';assert.equal(await b.el('EditorForm').onsubmit(),false);b.el('Reason').value='Conferência sintética';assert.equal(await b.el('EditorForm').onsubmit(),false);b.el('Confirm').checked=true;assert.equal(await b.el('EditorForm').onsubmit(),true);const writes=b.calls.filter(call=>call.request);assert.equal(writes.length,1);assert.equal(writes[0].path,'order-operations');assert.deepEqual(Object.keys(writes[0].request),['request_id','revision','identity','source_hash','from_stage','to_stage','reason','confirmed']);assert.equal(writes[0].request.from_stage,null);assert.equal(writes[0].request.to_stage,'SEPARATION');assert.equal(writes[0].request.confirmed,true);assert.equal(b.el('Editor').hidden,true);assert.match(b.text('Status'),/Etapa interna confirmada/);assert.equal(b.calls.some(call=>/incurred|weekly-closing|batches\/action/.test(call.path)),false);
});

test('an uncertain response keeps the exact UUID and request and blocks draft edits until retry or close',async()=>{
 const b=await ready();edit(b);let attempts=0;b.handler(async(path,request)=>{if(request){if(++attempts===1)throw Error('lost synthetic reply');return {schema:'order_operations_mutation_v1',request_id:request.request_id,revision:request.revision+1,replayed:true};}return workspace();});assert.equal(await b.el('EditorForm').onsubmit(),false);assert.match(b.text('EditorStatus'),/mesma tentativa/);assert.equal(b.el('Stage').disabled,true);assert.equal(b.el('Reason').disabled,true);assert.equal(b.el('Save').disabled,false);assert.equal(b.timers.size,0);assert.equal(await b.el('EditorForm').onsubmit(),true);const writes=b.calls.filter(call=>call.request);assert.equal(writes.length,2);assert.deepEqual(writes[0].request,writes[1].request);
});

test('CAS refresh preserves the reason, exposes the new stage and requires a fresh owner confirmation',async()=>{
 const b=await ready();edit(b);let writes=0;b.handler(async(path,request)=>{if(request){if(++writes===1)throw Object.assign(Error('synthetic CAS'),{status:409});return {schema:'order_operations_mutation_v1',request_id:request.request_id,revision:request.revision+1,replayed:false};}const row=order();row.operation={stage:'SEPARATION',updated_at:stamp,reason:'Outro operador sintético',lines_changed:false};row.display_stage='SEPARATION';row.source_hash='b'.repeat(64);const value=workspace(undefined,[row]);value.revision=7;return value;});assert.equal(await b.el('EditorForm').onsubmit(),false);assert.equal(b.el('Reason').value,'Separação conferida em cenário sintético');assert.equal(b.el('Confirm').checked,false);assert.equal(b.el('Save').disabled,true);assert.match(b.text('EditorSource'),/Em separação/);b.el('Stage').value='PRODUCTION';b.el('Confirm').checked=true;assert.equal(await b.el('EditorForm').onsubmit(),true);const requests=b.calls.filter(call=>call.request).map(call=>call.request);assert.equal(requests[1].revision,7);assert.equal(requests[1].source_hash,'b'.repeat(64));assert.equal(requests[1].from_stage,'SEPARATION');assert.notEqual(requests[0].request_id,requests[1].request_id);
});

test('a response for another filter cannot replace the current list and source absence is explicit',async()=>{
 const b=await ready(),first=b.controller.getSnapshot();b.handler(async()=>{const value=workspace();value.selection.start_date='2026-11-10';return value;});assert.equal(await b.el('Refresh').onclick(),false);assert.equal(b.controller.getSnapshot(),first);assert.match(b.text('Status'),/última leitura foi preservada/);b.handler(async()=>{const value=workspace(undefined,[]);value.coverage.state='NOT_CAPTURED';for(const name of ['oldest_checked_at','latest_checked_at','last_sync_at'])value.coverage[name]=null;value.platforms[0].connection='NOT_CAPTURED';return value;});await b.el('Refresh').onclick();assert.match(b.text('Source'),/Nenhuma fonte.*capturada/);assert.match(b.text('Orders'),/Sincronize a fonte/);
});

test('an old saved snapshot cannot remain editable after source refresh fails',async()=>{
 const b=await ready();b.advance(301000);b.handler(async()=>{throw Error('synthetic offline');});await b.el('Refresh').onclick();const buttons=b.buttons('Orders');assert.equal(buttons.find(button=>button.textContent==='Etapa indisponível')?.disabled,true);assert.match(b.text('Orders'),/Atualize a fonte/);
});

test('limited line previews are disclosed while every order remains in its page',async()=>{
 const b=browser();b.handler(async()=>{const row=order();row.lines_total=12;row.lines_limited=true;return workspace(undefined,[row]);});await b.controller.start({api:b.api});b.document.documentElement.dataset.activePanel='order-operations';b.controller.open();await flush();assert.match(b.text('Orders'),/Prévia: 1 de 12 linhas comerciais/);assert.match(b.text('Orders'),/Nenhum pedido foi omitido/);assert.equal(b.controller.getSnapshot().orders.length,1);
});

test('an incomplete commercial quantity stays unknown and cannot enable an operational edit',async()=>{
 const b=browser();b.handler(async()=>{const row=order();row.selling_units=null;row.can_update=false;row.blocked_reasons=['SOURCE_INCOMPLETE'];row.display_stage='REVIEW';return workspace(undefined,[row]);});await b.controller.start({api:b.api});b.document.documentElement.dataset.activePanel='order-operations';b.controller.open();await flush();assert.match(b.text('Orders'),/Quantidade em conferência/);assert.doesNotMatch(b.text('Orders'),/0 unidade/);assert.equal(b.buttons('Orders').find(button=>button.textContent==='Etapa indisponível')?.disabled,true);
});

test('changed items move a former ready stage into review and require explicit reconfirmation of the saved stage',async()=>{
 const b=browser();let confirmed=false;b.handler(async(path,request)=>{if(request){confirmed=true;return {schema:'order_operations_mutation_v1',request_id:request.request_id,revision:request.revision+1,replayed:false};}const row=order();row.source_hash='b'.repeat(64);row.operation={stage:'READY_TO_SHIP',updated_at:stamp-60,reason:'Conferência anterior sintética',lines_changed:!confirmed};row.display_stage=confirmed?'READY_TO_SHIP':'REVIEW';const value=workspace(undefined,[row]);value.revision=confirmed?4:3;return value;});await b.controller.start({api:b.api});b.document.documentElement.dataset.activePanel='order-operations';b.controller.open();await flush();assert.match(b.text('Orders'),/Em revisão/);assert.match(b.text('Orders'),/Etapa anterior: Prontos para envio/);assert.match(b.text('Orders'),/Itens ou quantidades mudaram; confira e confirme novamente a etapa/);assert.equal(b.controller.getSnapshot().totals.by_stage.READY_TO_SHIP,0);
 b.buttons('Orders').find(button=>button.textContent==='Atualizar etapa').onclick();assert.match(b.text('EditorSource'),/Itens ou quantidades mudaram/);assert.match(b.text('Stage'),/Reconfirmar · Prontos para envio/);b.el('Stage').value='READY_TO_SHIP';b.el('Reason').value='Novas quantidades conferidas em cenário sintético';assert.equal(await b.el('EditorForm').onsubmit(),false);assert.equal(b.calls.filter(call=>call.request).length,0);b.el('Confirm').checked=true;assert.equal(await b.el('EditorForm').onsubmit(),true);const write=b.calls.find(call=>call.request);assert.equal(write.request.from_stage,'READY_TO_SHIP');assert.equal(write.request.to_stage,'READY_TO_SHIP');assert.equal(write.request.source_hash,'b'.repeat(64));assert.equal(b.controller.getSnapshot().orders[0].operation.lines_changed,false);assert.doesNotMatch(b.text('Orders'),/Itens ou quantidades mudaram/);assert.equal(b.controller.getSnapshot().totals.by_stage.READY_TO_SHIP,1);
});

test('a workspace without the changed-items flag cannot silently inherit a ready stage',async()=>{
 const b=await ready(),previous=b.controller.getSnapshot();b.handler(async()=>{const row=order();delete row.operation.lines_changed;row.operation.stage='READY_TO_SHIP';row.display_stage='READY_TO_SHIP';return workspace(undefined,[row]);});assert.equal(await b.el('Refresh').onclick(),false);assert.equal(b.controller.getSnapshot(),previous);assert.match(b.text('Status'),/última leitura foi preservada/);
});

test('receipt retry remains available after five minutes without creating a new stale-source intent',async()=>{
 const b=await ready();edit(b);let writes=0;b.handler(async(path,request)=>{if(request){if(++writes===1)throw Error('synthetic response loss');return {schema:'order_operations_mutation_v1',request_id:request.request_id,revision:request.revision+1,replayed:true};}return workspace();});await b.el('EditorForm').onsubmit();b.advance(301000);b.el('Confirm').onchange();assert.equal(b.el('Save').disabled,false);assert.equal(await b.el('EditorForm').onsubmit(),true);const requests=b.calls.filter(call=>call.request).map(call=>call.request);assert.deepEqual(requests[0],requests[1]);
});

test('a future source timestamp or inconsistent distribution cannot replace a valid saved list',async()=>{
 const b=await ready(),previous=b.controller.getSnapshot();b.handler(async()=>{const value=workspace();value.checked_at=stamp+3600;return value;});assert.equal(await b.el('Refresh').onclick(),false);assert.equal(b.controller.getSnapshot(),previous);b.handler(async()=>{const value=workspace();value.totals.by_stage.SHIPPED=7;return value;});assert.equal(await b.el('Refresh').onclick(),false);assert.equal(b.controller.getSnapshot(),previous);
});

test('hiding or logging out cancels timers and rejects a late private response',async()=>{
 const b=await ready();let resolve;b.handler(()=>new Promise(finish=>resolve=finish));const pending=b.el('Refresh').onclick();b.controller.hide();resolve(workspace());await pending;assert.equal(b.timers.size,0);b.controller.open();await flush();b.controller.stop();assert.equal(b.controller.getSnapshot(),null);assert.equal(b.el('Orders').children.length,0);assert.equal(b.el('Reason').value,'');assert.equal(b.el('From').value,'');assert.equal(b.el('Editor').hidden,true);assert.equal(b.el('Sync').disabled,true);assert.equal(b.timers.size,0);resolve(workspace());await flush();assert.equal(b.el('Orders').children.length,0);
});

test('date filters reject invalid or overly wide ranges and editing pauses automatic source calls',async()=>{
 const b=await ready(),count=b.calls.length;b.el('From').value='2026-11-31';assert.equal(await b.el('Filters').onsubmit(),false);assert.equal(b.calls.length,count);b.el('From').value='2026-10-01';b.el('Through').value='2026-11-11';assert.equal(await b.el('Filters').onsubmit(),false);assert.match(b.text('Status'),/até 31 dias/);b.el('From').value='2026-11-11';edit(b);assert.equal(b.timers.size,0);assert.equal(b.el('From').disabled,true);b.focus();await flush();assert.equal(b.calls.length,count);
});

test('browser client is self-contained, safely renders text, and offers accessible touch controls and source-specific reports',()=>{
 assert.doesNotThrow(()=>new Function(ORDER_OPERATIONS_CLIENT));assert.doesNotMatch(ORDER_OPERATIONS_CLIENT,/innerHTML|localStorage|sessionStorage|console\.|fetch\(/);assert.match(ORDER_OPERATIONS_CSS,/min-height:44px/);assert.match(ORDER_OPERATIONS_CSS,/var\(--surface\)/);assert.match(orderOperationsBody(),/Mercado Livre · não conectado/);assert.match(orderOperationsBody(),/sexta 13h/);assert.match(orderOperationsBody(),/Resultado financeiro e conciliação/);assert.doesNotMatch(orderOperationsBody(),/lucro realizado.*R\$/i);
});
