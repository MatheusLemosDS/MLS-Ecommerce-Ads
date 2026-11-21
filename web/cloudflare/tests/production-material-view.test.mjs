import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {ownerReportBrowser} from './owner-report-browser-fixture.mjs';
import {productionMaterialsBody,PRODUCTION_MATERIALS_CSS,PRODUCTION_MATERIALS_CLIENT,projectProductionMaterialsWorkspace} from '../src/production-material-view.mjs';
import {materialFixture} from './production-material-fixture.mjs';
import {readMaterialNeedsWorkspace} from '../src/production-material-workspace.mjs';

const day='2026-11-21',clock=Date.parse(day+'T15:00:00.000Z'),hash=n=>String(n).repeat(64),uuid=n=>String(n).repeat(8)+'-'+String(n).repeat(4)+'-'+String(n).repeat(4)+'-'+String(n).repeat(4)+'-'+String(n).repeat(12);
const scope={organization_id:'synthetic-material-org',store_id:'synthetic-material-store'},physical={garment_type:'ADULT',fit:'UNISEX',size:'M',color:'Preta',material:null};
function emptyFrame(){return {schema:'production_material_workspace_v1',scope:{...scope},planning_date:day,checked_at:day+'T15:00:00.000Z',date_basis:'PLANNING_DATE_NOT_SHOPEE_DEADLINE',fence_hash:hash(1),source_vector:{schema:'production_material_source_vector_v1',orders_hash:hash(2),operational_heads_hash:hash(3),manufacturing_hash:hash(4)},coverage:{orders_complete:true,stock_complete:true,suppliers_complete:true,purchases_complete:true,manufacturing_complete:true,source_integrity_verified:true,provider_completeness:'NOT_PROVEN',basis:'SAVED_LOCAL_SOURCES_ONLY'},orders:[],stock:{variants:[]},suppliers:[],purchases:[],manufacturing_records:[],pending:[],effects:{external_purchase_allowed:false,financial_integration_allowed:false,money_transfer_allowed:false,financial_writes_allowed:false,automatic_stock_writes:false},plan:{schema:'physical_shirt_purchase_needs_v1',scope:{...scope,currency:'BRL'},planning_date:day,state:'READY_FOR_REVIEW',variants:[],known_estimate_cents:0,total_estimate_cents:0,stock_source:{as_of_date:day,coverage_complete:true,evidence_ref:hash(3)},external_orders_allowed:false,financial_writes_allowed:false,stock_reservations_written:false}};}
function frameWithOrder({mapped=true,unknown=false}={}){
 const f=emptyFrame();f.stock.variants.push({variant_id:hash(5),revision:2,identity:{...physical},state:unknown?'UNKNOWN':'CONFIRMED',physical_usable_quantity:unknown?null:3,reserved_quantity:unknown?null:0,free_quantity:unknown?null:3,reservations:[],last_movement:null});
 f.orders.push({source_key:'synthetic-order-line',source_hash:hash(6),line_source_hash:hash(7),order_hash:hash(8),item_id:'10',model_id:'20',sku:'synthetic-kit',model_name:'Kit de duas camisetas',status:'READY_TO_SHIP',commercial_quantity:2,mapping_revision:mapped?1:0,group_revision:0,material_state:mapped&&!unknown?'AVAILABLE_TO_RESERVE':'UNKNOWN',components:mapped?[{variant_id:hash(5),identity:{...physical},quantity_per_unit:1,required_quantity:2,reserved_quantity:0,consumed_quantity:0,free_quantity:unknown?null:3,shortage_quantity:unknown?null:0,pending:[]}]:[],pending:mapped?[]:['COMPOSITION_UNKNOWN'],evidence_refs:['synthetic-order-source'],consumptions:[]});return f;
}
function mount(initial=emptyFrame()){
 let current=structuredClone(initial),transport=null;const calls=[],b=ownerReportBrowser(productionMaterialsBody()+'<script>'+PRODUCTION_MATERIALS_CLIENT+'</script>',{scriptIncludes:'globalThis.brazaProductionMaterials='});b.context.crypto=webcrypto;b.context.fixtureClock=clock;
 b.context.materialApi=async(path,body)=>{const input=body===undefined?undefined:JSON.parse(JSON.stringify(body));calls.push({path,body:input});if(transport)return transport(path,input);return JSON.stringify(current);};
 b.run(`class MaterialClock extends Date{constructor(...args){super(...(args.length?args:[fixtureClock]));}static now(){return fixtureClock;}}globalThis.Date=MaterialClock;const materialApi=async(path,body)=>JSON.parse(await globalThis.materialApi(path,body));brazaProductionMaterials.bootstrapState({phase:'READY'});brazaProductionMaterials.start({api:materialApi});`);
 b.nodes.get('productionMaterialsDate').value=day;
 const fields=form=>b.nodes.get('productionMaterials'+form+'Form'),field=(form,name)=>fields(form).querySelector('[name="'+name+'"]');
 const fill=(form,values)=>{for(const [name,value]of Object.entries(values)){const input=field(form,name);assert.ok(input,'real material control '+form+'.'+name);if(input.type==='checkbox')input.checked=value;else input.value=String(value);input.oninput?.();input.onchange?.();}};
 return {b,calls,field,fields,fill,get current(){return current;},set current(v){current=structuredClone(v);},setTransport(fn){transport=fn;},snapshot(){return JSON.parse(b.run('JSON.stringify(brazaProductionMaterials.getSnapshot())'));},async open(){await b.run('brazaProductionMaterials.open()');await b.flush();},async submit(form){const result=await fields(form).onsubmit({preventDefault(){}});await b.flush();return result;},stop(){b.run('brazaProductionMaterials.stop()');b.timers.clear();}};
}
async function mountService(f){
 const ui=mount(await f.read());ui.setTransport(async(path,body)=>{
  try{if(body)return JSON.stringify(await f.mutate(body));const url=new URL('https://synthetic.test/'+path);return JSON.stringify(await readMaterialNeedsWorkspace(f.env,{planning_date:url.searchParams.get('planning_date')},f.options));}
  catch(error){throw Object.assign(new Error('SAFE_MATERIAL_HTTP_ERROR'),{status:error.status,apiCode:error.code??error.message});}
 });return ui;
}
function setRow(form,index,values){const box=form.querySelectorAll('.production-materials-row')[index];assert.ok(box,'real component row '+index);for(const [key,value]of Object.entries(values)){const input=box.querySelector('[name="'+key+'"]');assert.ok(input,'component control '+key);input.value=String(value);input.oninput?.();input.onchange?.();}}

test('material workspace preserves V4.1 tokens, touch targets, scope and explicit physical boundaries',()=>{
 const html=productionMaterialsBody(),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size);assert.ok(ids.includes('productionMaterialsDetails'));
 assert.match(html,/role="status" aria-live="polite"/);assert.match(html,/não comprova o prazo de envio da Shopee/);assert.match(html,/Uma compra em aberto não aumenta o estoque/);assert.match(html,/consumir material exige fabricação confirmada/);
 assert.match(PRODUCTION_MATERIALS_CSS,/var\(--surface\)/);assert.match(PRODUCTION_MATERIALS_CSS,/min-height:44px/);assert.match(PRODUCTION_MATERIALS_CSS,/max-width:390px/);
 assert.doesNotMatch(PRODUCTION_MATERIALS_CLIENT,/innerHTML\s*=|\bfetch\s*\(|setInterval\s*\(|localStorage/);
});

test('material projection retains unknown physical quantities and rejects forged totals, effects, scope and getters',()=>{
 const valid=frameWithOrder({unknown:true});assert.ok(projectProductionMaterialsWorkspace(valid));assert.equal(projectProductionMaterialsWorkspace(valid).stock.variants[0].physical_usable_quantity,null);
 for(const change of [v=>v.effects.money_transfer_allowed=true,v=>v.plan.scope.store_id='another-store',v=>v.orders[0].components[0].required_quantity=3,v=>v.orders[0].material_state='RESERVED',v=>v.stock.variants[0].free_quantity=0,v=>v.coverage.provider_completeness='COMPLETE',v=>v.date_basis='SHOPEE_DELIVERY_DEADLINE']){const bad=structuredClone(valid);change(bad);assert.equal(projectProductionMaterialsWorkspace(bad),null);}
 const partial=emptyFrame();partial.plan.state='PARTIAL';partial.plan.total_estimate_cents=0;assert.equal(projectProductionMaterialsWorkspace(partial),null);
 let reads=0;const bad=structuredClone(valid);Object.defineProperty(bad.orders[0],'sku',{enumerable:true,get(){reads++;throw Error('MUST_NOT_EXECUTE');}});assert.equal(projectProductionMaterialsWorkspace(bad),null);assert.equal(reads,0);
});

test('opening the material workspace is read-only and missing stock is never displayed as zero',async t=>{
 const ui=mount(frameWithOrder({unknown:true}));t.after(()=>ui.stop());assert.equal(ui.calls.length,0);await ui.open();assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].body,undefined);assert.equal(ui.calls[0].path,'production/material-needs?planning_date='+day);
 assert.match(ui.b.nodes.get('productionMaterialsSelected').textContent,/Livre agora: Não conferido/);assert.match(ui.b.nodes.get('productionMaterialsSelected').textContent,/Falta: Não conferido/);assert.equal(ui.snapshot().effects.automatic_stock_writes,false);
});

test('an explicit reserve command binds the server scope, source hash, group revision and complete fence',async t=>{
 const f=frameWithOrder(),ui=mount(f);t.after(()=>ui.stop());await ui.open();ui.fill('Order',{evidence:'Conferência física sintética',confirmed:false});assert.equal(await ui.submit('Order'),false);assert.equal(ui.calls.length,1);
 ui.fill('Order',{confirmed:true});assert.equal(await ui.submit('Order'),true);assert.equal(ui.b.nodes.get('productionMaterialsStatus').textContent,'Ação registrada. Materiais e fontes atualizados.','a completed POST and follow-up GET do not leave a loading message');const [post]=ui.calls.filter(c=>c.body);assert.equal(post.path,'production/material-needs');assert.equal(post.body.action,'reserve_order');assert.deepEqual(post.body.expected_scope,scope);assert.equal(post.body.expected_revision,0);assert.equal(post.body.source_key,f.orders[0].source_key);assert.equal(post.body.source_hash,f.orders[0].source_hash);assert.equal(post.body.fence_hash,f.fence_hash);assert.equal(post.body.confirmed,true);assert.match(post.body.request_id,/^[a-f0-9-]{36}$/);assert.ok(!Object.hasOwn(post.body,'free_quantity'));assert.ok(!Object.hasOwn(post.body,'coverage'));
});

test('a lost material confirmation retains the identical command and prevents an independent second write',async t=>{
 const ui=mount(frameWithOrder());t.after(()=>ui.stop());await ui.open();let lost=true;
 ui.setTransport(async(path,body)=>{if(body&&lost){lost=false;throw Object.assign(Error('PRIVATE_TRANSPORT_DETAIL'),{status:504});}return JSON.stringify(ui.current);});
 ui.fill('Order',{evidence:'Conferido uma vez',confirmed:true});assert.equal(await ui.submit('Order'),false);assert.equal(ui.b.nodes.get('productionMaterialsRetry').hidden,false);assert.equal(ui.field('Order','evidence').disabled,true);assert.equal(ui.b.nodes.get('productionMaterialsReload').disabled,true);assert.doesNotMatch(ui.b.nodes.get('productionMaterialsStatus').textContent,/PRIVATE_TRANSPORT_DETAIL/);
 assert.equal(ui.snapshot(),null,'an unconfirmed physical write cannot remain a ready source for DTF or agents');
 assert.equal(await ui.b.nodes.get('productionMaterialsRetry').onclick(),true);await ui.b.flush();const posts=ui.calls.filter(c=>c.body);assert.equal(posts.length,2);assert.deepEqual(posts[0].body,posts[1].body);assert.equal(ui.b.nodes.get('productionMaterialsRetry').hidden,true);
});

test('a concurrent material update refreshes the source and preserves the draft while requiring a new confirmation',async t=>{
 const ui=mount(frameWithOrder());t.after(()=>ui.stop());await ui.open();let conflict=true;
 ui.setTransport(async(path,body)=>{if(body&&conflict){conflict=false;const next=structuredClone(ui.current);next.fence_hash=hash(9);next.orders[0].group_revision=1;ui.current=next;throw Object.assign(Error('PRIVATE_CAS_DETAIL'),{status:409});}return JSON.stringify(ui.current);});
 ui.fill('Order',{evidence:'Meu rascunho físico',confirmed:true});assert.equal(await ui.submit('Order'),false);assert.equal(ui.field('Order','evidence').value,'Meu rascunho físico');assert.equal(ui.field('Order','confirmed').checked,false);assert.equal(ui.snapshot().fence_hash,hash(9));assert.match(ui.b.nodes.get('productionMaterialsStatus').textContent,/rascunho foi preservado/);
 ui.fill('Order',{confirmed:true});assert.equal(await ui.submit('Order'),true);const posts=ui.calls.filter(c=>c.body);assert.notEqual(posts[0].body.request_id,posts[1].body.request_id);assert.equal(posts[1].body.expected_revision,1);assert.equal(posts[1].body.fence_hash,hash(9));
});

test('forbidden reads, scope changes and stopped delayed reads clear private material records and drafts',async t=>{
 const ui=mount(frameWithOrder());t.after(()=>ui.stop());await ui.open();ui.fill('Order',{evidence:'private-scope-draft',confirmed:true});
 ui.setTransport(()=>{throw Object.assign(Error('PRIVATE_PROVIDER_ERROR'),{status:403});});assert.equal(await ui.b.nodes.get('productionMaterialsReload').onclick(),false);await ui.b.flush();assert.equal(ui.snapshot(),null);assert.equal(ui.b.nodes.get('productionMaterialsOrders').textContent,'');assert.doesNotMatch(ui.b.nodes.get('productionMaterialsStatus').textContent,/PRIVATE_PROVIDER_ERROR/);
 const delayed=mount(frameWithOrder());t.after(()=>delayed.stop());let finish;delayed.setTransport(()=>new Promise(resolve=>{finish=()=>resolve(JSON.stringify(frameWithOrder()));}));delayed.b.run('brazaProductionMaterials.open()');await delayed.b.flush();assert.ok(finish);delayed.stop();finish();await delayed.b.flush();assert.equal(delayed.snapshot(),null);assert.equal(delayed.b.nodes.get('productionMaterialsOrders').textContent,'');
 const changed=mount(frameWithOrder());t.after(()=>changed.stop());await changed.open();changed.fill('Order',{evidence:'previous-company-draft',confirmed:true});const other=frameWithOrder();other.scope={organization_id:'different-company',store_id:'different-store'};other.plan.scope={...other.scope,currency:'BRL'};changed.current=other;await changed.b.nodes.get('productionMaterialsReload').onclick();assert.deepEqual(changed.snapshot().scope,other.scope);assert.equal(changed.field('Order','evidence').value,'');assert.equal(changed.field('Order','confirmed').checked,false);
});

test('supplier quotes preserve omitted prices and explicit zero shipping without creating financial commands',async t=>{
 const ui=mount(frameWithOrder());t.after(()=>ui.stop());await ui.open();ui.fill('Supplier',{name:'Fornecedor sintético',evidence:'Cotação sintética',confirmed:true});
 const add=ui.fields('Supplier').querySelectorAll('button').find(n=>n.textContent==='Adicionar tamanho e cor à cotação');assert.ok(add);add.onclick();await ui.b.flush();const boxes=ui.fields('Supplier').querySelectorAll('.production-materials-row'),box=boxes[0];
 for(const [key,value]of Object.entries({variant_id:hash(5),minimum_quantity:'1',multiple_quantity:'1',unit_cost_cents:'',shipping_cents:'0',quote_ref:'synthetic-quote'}))box.querySelector('[name="'+key+'"]').value=value;
 ui.fill('Supplier',{confirmed:true});assert.equal(await ui.submit('Supplier'),true);const post=ui.calls.find(c=>c.body).body;assert.equal(post.action,'save_supplier');assert.equal(post.policies[0].unit_cost_cents,null);assert.equal(post.policies[0].shipping_cents,0);assert.ok(ui.calls.every(c=>c.path.startsWith('production/material-needs')));
});

test('correction of consumption requires a separate declaration that the pieces remain physically blank',async t=>{
 const f=frameWithOrder();f.orders[0].consumptions=[{consumption_id:uuid(1),variant_id:hash(5),production_record_id:uuid(2),quantity:1,effective_date:day,status:'ACTIVE'}];const ui=mount(f);t.after(()=>ui.stop());await ui.open();ui.fill('Order',{action:'reverse_consumption'});ui.fill('Order',{consumption_id:uuid(1),effective_date:day,reason:'Consumo registrado por engano',evidence:'As peças não foram estampadas',confirmed:true,blank_stock_confirmed:false});assert.equal(await ui.submit('Order'),false);assert.equal(ui.calls.filter(c=>c.body).length,0);assert.match(ui.fields('Order').textContent,/Camiseta já estampada ou fabricada não retorna ao estoque/);
 ui.fill('Order',{blank_stock_confirmed:true});assert.equal(await ui.submit('Order'),true);const post=ui.calls.find(c=>c.body).body;assert.equal(post.action,'reverse_consumption');assert.equal(post.blank_stock_confirmed,true);assert.equal(post.consumption_id,uuid(1));assert.equal(post.effective_date,day);
});

test('physical materials can page through saved orders without discarding a reviewed draft or executing a write',async t=>{
 const f=frameWithOrder();for(let i=1;i<31;i++)f.orders.push({...structuredClone(f.orders[0]),source_key:'synthetic-line-'+i,model_name:'Item sintético '+i});const ui=mount(f);t.after(()=>ui.stop());await ui.open();ui.fill('Order',{evidence:'Rascunho da primeira página',confirmed:false});await ui.b.nodes.get('productionMaterialsNext').onclick();assert.equal(ui.b.nodes.get('productionMaterialsOrders').querySelectorAll('[data-material-order]').length,6);assert.equal(ui.field('Order','evidence').value,'Rascunho da primeira página');await ui.b.nodes.get('productionMaterialsPrevious').onclick();assert.equal(ui.b.nodes.get('productionMaterialsOrders').querySelectorAll('[data-material-order]').length,25);assert.equal(ui.calls.filter(c=>c.body).length,0);
});

test('DTF may explicitly refresh physical sources while the material panel is closed without opening or writing it',async t=>{
 const ui=mount(frameWithOrder());t.after(()=>ui.stop());ui.b.context.document.documentElement.dataset.activePanel='production';assert.equal(ui.calls.length,0);
 assert.equal(await ui.b.run('brazaProductionMaterials.refresh()'),false);assert.equal(ui.calls.length,0);
 assert.equal(await ui.b.run('brazaProductionMaterials.refresh({allowHidden:true,preserveDrafts:true})'),true);await ui.b.flush();assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].body,undefined);assert.equal(ui.b.nodes.get('productionMaterialsDetails').open,false);assert.ok(ui.snapshot());
});

test('a confirmation from another scope clears the material data and cannot be retried into the previous company',async t=>{
 const ui=mount(frameWithOrder());t.after(()=>ui.stop());await ui.open();const other=frameWithOrder();other.scope={organization_id:'different-org',store_id:'different-store'};other.plan.scope={...other.scope,currency:'BRL'};
 ui.setTransport(async()=>JSON.stringify(other));ui.fill('Order',{evidence:'Protected scope draft',confirmed:true});assert.equal(await ui.submit('Order'),false);assert.equal(ui.snapshot(),null);assert.equal(ui.b.nodes.get('productionMaterialsOrders').textContent,'');assert.equal(ui.b.nodes.get('productionMaterialsRetry').hidden,true);assert.match(ui.b.nodes.get('productionMaterialsStatus').textContent,/sessão ou permissão mudou/);
});

test('opening a materials link for another order preserves both independent drafts without copying a confirmation',async t=>{
 const f=frameWithOrder();f.orders.push({...structuredClone(f.orders[0]),source_key:'synthetic-second-line',model_id:'21'});const ui=mount(f);t.after(()=>ui.stop());await ui.open();ui.fill('Order',{evidence:'Only first order',confirmed:true});ui.fill('Mapping',{evidence:'First composition evidence',confirmed:true});
 await ui.b.run('brazaProductionMaterials.open({source_key:"synthetic-second-line"})');await ui.b.flush();assert.equal(ui.field('Order','evidence').value,'');assert.equal(ui.field('Order','confirmed').checked,false);assert.equal(ui.field('Mapping','evidence').value,'');assert.equal(ui.field('Mapping','confirmed').checked,false);
 await ui.b.run('brazaProductionMaterials.open({source_key:"synthetic-order-line"})');await ui.b.flush();assert.equal(ui.field('Order','evidence').value,'Only first order');assert.equal(ui.field('Mapping','evidence').value,'First composition evidence');assert.equal(ui.calls.filter(c=>c.body).length,0);
});

test('actual scoped service frames drive a two-variant kit mapping and an atomic physical reservation from the UI',async t=>{
 const f=materialFixture(t),black=await f.seedStock({size:'M',color:'Preto',count:5}),white=await f.seedStock({size:'G',color:'Branco',count:4});await f.seedOrder({quantity:2,model_name:'Kit sintético de duas camisetas'});const ui=await mountService(f);t.after(()=>ui.stop());await ui.open();assert.equal(ui.snapshot().orders[0].material_state,'UNKNOWN');assert.equal(ui.snapshot().plan.total_estimate_cents,null);
 const add=ui.fields('Mapping').querySelectorAll('button').find(n=>n.textContent==='Adicionar tamanho e cor');add.onclick();setRow(ui.fields('Mapping'),0,{variant_id:black.variant_id,quantity_per_unit:1});setRow(ui.fields('Mapping'),1,{variant_id:white.variant_id,quantity_per_unit:1});ui.fill('Mapping',{evidence:'Composição do kit sintético conferida',confirmed:true});assert.equal(await ui.submit('Mapping'),true);assert.equal(ui.snapshot().orders[0].components.length,2);assert.deepEqual(ui.snapshot().orders[0].components.map(c=>c.required_quantity),[2,2]);assert.equal(ui.snapshot().orders[0].material_state,'AVAILABLE_TO_RESERVE');
 ui.fill('Order',{evidence:'Peças físicas sintéticas disponíveis',confirmed:true});assert.equal(await ui.submit('Order'),true);const view=ui.snapshot();assert.equal(view.orders[0].material_state,'RESERVED');assert.deepEqual(view.orders[0].components.map(c=>c.reserved_quantity),[2,2]);assert.deepEqual(view.stock.variants.map(v=>v.free_quantity).sort(),[2,3]);assert.equal(view.effects.financial_integration_allowed,false);assert.ok(ui.calls.filter(c=>c.body).every(c=>['save_mapping','reserve_order'].includes(c.body.action)));
});

test('actual purchase and partial receipt controls add only physically received units and preserve unknown cost',async t=>{
 const f=materialFixture(t),variant=await f.seedStock({count:0});await f.seedOrder({quantity:2});const order=(await f.read()).orders[0];await f.map(order,[{variant_id:variant.variant_id,quantity_per_unit:1}]);const ui=await mountService(f);t.after(()=>ui.stop());await ui.open();assert.equal(ui.snapshot().orders[0].material_state,'SHORTAGE');
 ui.fill('Supplier',{name:'Fornecedor sintético real-service',evidence:'Fornecedor da fixture',confirmed:true});assert.equal(await ui.submit('Supplier'),true);const supplier=ui.snapshot().suppliers[0];ui.fill('Purchase',{supplier_id:supplier.supplier_id,status:'CONFIRMED',expected_on:day,reference:'compra-sintética-ui',evidence:'Fornecedor confirmou quatro peças',shipping_cents:'0'});setRow(ui.fields('Purchase'),0,{variant_id:variant.variant_id,quantity:4,unit_cost_cents:''});ui.fill('Purchase',{confirmed:true});assert.equal(await ui.submit('Purchase'),true);let view=ui.snapshot();assert.equal(view.stock.variants[0].physical_usable_quantity,0,'a confirmed purchase is not a physical receipt');assert.equal(view.purchases[0].total_estimate_cents,null,'missing unit price stays unknown');const purchase=view.purchases[0];
 ui.fill('Receipt',{purchase_id:purchase.purchase_id});setRow(ui.fields('Receipt'),0,{quantity:2});ui.fill('Receipt',{effective_date:day,reference:'recebimento-parcial-ui',evidence:'Duas peças fisicamente conferidas',confirmed:true});assert.equal(await ui.submit('Receipt'),true);view=ui.snapshot();assert.equal(view.stock.variants[0].physical_usable_quantity,2);assert.equal(view.purchases[0].status,'PARTIALLY_RECEIVED');assert.equal(view.purchases[0].lines[0].received_quantity,2);assert.equal(view.purchases[0].total_estimate_cents,null);
 assert.equal(f.db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND (name LIKE 'financial_%' OR name LIKE '%bank%')").get().n,0);
});

test('UI consumption selects actual confirmed manufacture and correction never treats a printed garment as blank stock',async t=>{
 const f=materialFixture(t),variant=await f.seedStock({count:5});let order=await f.seedOrder({quantity:2});await f.map(order,[{variant_id:variant.variant_id,quantity_per_unit:1}]);await f.reserve(order.source_key);order=(await f.read()).orders[0];const record=await f.seedManufacturing(order,variant,{quantity:2});const ui=await mountService(f);t.after(()=>ui.stop());await ui.open();assert.ok(projectProductionMaterialsWorkspace(await f.read()));
 ui.fill('Order',{action:'consume_order'});setRow(ui.fields('Order'),0,{production_record_id:record,quantity:2});ui.fill('Order',{evidence:'Duas camisetas da fabricação sintética',confirmed:true});assert.equal(await ui.submit('Order'),true);let view=ui.snapshot();assert.equal(view.orders[0].material_state,'CONSUMED');assert.equal(view.stock.variants[0].physical_usable_quantity,3);const consumption=view.orders[0].consumptions[0];
 ui.fill('Order',{action:'reverse_consumption'});ui.fill('Order',{consumption_id:consumption.consumption_id,effective_date:day,reason:'Lançamento físico incorreto',evidence:'Estas peças sintéticas continuam lisas',confirmed:true,blank_stock_confirmed:false});const before=ui.calls.filter(c=>c.body).length;assert.equal(await ui.submit('Order'),false);assert.equal(ui.calls.filter(c=>c.body).length,before);
 ui.fill('Order',{blank_stock_confirmed:true});assert.equal(await ui.submit('Order'),true);view=ui.snapshot();assert.equal(view.stock.variants[0].physical_usable_quantity,5);assert.equal(view.orders[0].consumptions[0].status,'REVERSED');assert.equal(view.effects.financial_writes_allowed,false);
});

test('future planning uses the observed stock date and never presents it as a future stock count or Shopee deadline',async t=>{
 const f=materialFixture(t),v=await f.seedStock();const o=await f.seedOrder();await f.map(o,[{variant_id:v.variant_id,quantity_per_unit:1}]);const frame=await readMaterialNeedsWorkspace(f.env,{planning_date:'2026-11-24'},f.options);assert.equal(frame.planning_date,'2026-11-24');assert.equal(frame.plan.planning_date,'2026-11-21');assert.equal(frame.plan.stock_source.as_of_date,'2026-11-21');assert.ok(projectProductionMaterialsWorkspace(frame));assert.equal(frame.date_basis,'PLANNING_DATE_NOT_SHOPEE_DEADLINE');
});

test('a real receipt with a lost reply is applied once and cancelling the remaining purchase never removes received stock',async t=>{
 const f=materialFixture(t),variant=await f.seedStock({count:0}),supplier=webcrypto.randomUUID(),purchase=webcrypto.randomUUID();await f.seedOrder();
 await f.mutate(f.command('save_supplier',{supplier_id:supplier,name:'Fornecedor da entrega parcial',evidence:'Fixture sintética',policies:[]}));
 await f.mutate(f.command('save_purchase',{purchase_id:purchase,supplier_id:supplier,status:'CONFIRMED',expected_on:day,reference:'purchase-lost-reply',evidence:'Quatro peças confirmadas',shipping_cents:null,lines:[{variant_id:variant.variant_id,quantity:4,unit_cost_cents:null}]}));
 const ui=await mountService(f);t.after(()=>ui.stop());await ui.open();let lost=true;
 ui.setTransport(async(path,body)=>{if(body){const result=await f.mutate(body);if(lost){lost=false;throw Object.assign(Error('SAFE_LOST_RECEIPT'),{status:504});}return JSON.stringify(result);}return JSON.stringify(await f.read());});
 ui.fill('Receipt',{purchase_id:purchase});setRow(ui.fields('Receipt'),0,{quantity:1});ui.fill('Receipt',{effective_date:day,reference:'package-lost-reply',evidence:'Uma peça conferida',confirmed:true});assert.equal(await ui.submit('Receipt'),false);assert.equal((await f.read()).stock.variants[0].physical_usable_quantity,1);assert.equal(ui.snapshot(),null);
 assert.equal(await ui.b.nodes.get('productionMaterialsRetry').onclick(),true);await ui.b.flush();let view=ui.snapshot();assert.equal(view.stock.variants[0].physical_usable_quantity,1);assert.equal(view.purchases[0].receipts.length,1);const receiptPosts=ui.calls.filter(c=>c.body?.action==='confirm_receipt');assert.equal(receiptPosts.length,2);assert.deepEqual(receiptPosts[0].body,receiptPosts[1].body);
 ui.fill('Purchase',{purchase_id:purchase});ui.fill('Purchase',{action:'cancel_purchase',cancel_reason:'Saldo não entregue cancelado pelo operador',evidence:'Confirmação sintética do cancelamento',confirmed:true});assert.equal(await ui.submit('Purchase'),true);view=ui.snapshot();assert.equal(view.purchases[0].status,'CANCELLED');assert.equal(view.purchases[0].lines[0].received_quantity,1);assert.equal(view.purchases[0].lines[0].cancelled_quantity,3);assert.equal(view.stock.variants[0].physical_usable_quantity,1);assert.equal(view.effects.external_purchase_allowed,false);
});

test('explicitly refreshing changed material sources retains draft values but never carries an old approval to the new fence',async t=>{
 const ui=mount(frameWithOrder());t.after(()=>ui.stop());await ui.open();ui.fill('Order',{evidence:'Reviewed before source changed',confirmed:true});ui.fill('Mapping',{evidence:'Mapping draft before source changed',confirmed:true});const next=structuredClone(ui.current);next.fence_hash=hash(9);ui.current=next;await ui.b.nodes.get('productionMaterialsReload').onclick();await ui.b.flush();assert.equal(ui.field('Order','evidence').value,'Reviewed before source changed');assert.equal(ui.field('Mapping','evidence').value,'Mapping draft before source changed');assert.equal(ui.field('Order','confirmed').checked,false);assert.equal(ui.field('Mapping','confirmed').checked,false);assert.match(ui.b.nodes.get('productionMaterialsStatus').textContent,/As fontes mudaram/);assert.equal(ui.calls.filter(c=>c.body).length,0);
});

test('partial source coverage keeps total purchases unknown while a proven individual order remains available for review',async t=>{
 const f=frameWithOrder();f.coverage.orders_complete=false;f.plan=null;f.pending=[{code:'SAVED_ORDER_COVERAGE_PARTIAL'}];assert.ok(projectProductionMaterialsWorkspace(f));const ui=mount(f);t.after(()=>ui.stop());await ui.open();assert.equal(ui.snapshot().plan,null);assert.match(ui.b.nodes.get('productionMaterialsNeeds').textContent,/Ainda não é possível concluir a lista total/);assert.match(ui.b.nodes.get('productionMaterialsNeeds').textContent,/individualmente/);assert.match(ui.b.nodes.get('productionMaterialsCoverage').textContent,/Cobertura local parcial/);assert.equal(ui.field('Order','confirmed').disabled,false);assert.doesNotMatch(ui.b.nodes.get('productionMaterialsSummary').textContent,/R\$\s*0,00/);
});

test('a partly manufactured kit is described as partial manufacture instead of promising that the complete DTF line is ready',async t=>{
 const f=materialFixture(t),first=await f.seedStock({size:'M',count:5}),second=await f.seedStock({size:'G',count:5});const order=await f.seedOrder({quantity:2});await f.map(order,[{variant_id:first.variant_id,quantity_per_unit:1},{variant_id:second.variant_id,quantity_per_unit:1}]);await f.reserve(order.source_key);let current=(await f.read()).orders[0];const record=await f.seedManufacturing(current,first,{quantity:2});const before=await f.read();current=before.orders[0];await f.mutate(f.command('consume_order',{source_key:current.source_key,source_hash:current.source_hash,fence_hash:before.fence_hash,evidence:'Duas peças de um componente fabricadas',lines:[{variant_id:first.variant_id,production_record_id:record,quantity:2}]},current.group_revision));
 const ui=await mountService(f);t.after(()=>ui.stop());await ui.open();assert.equal(ui.snapshot().orders[0].material_state,'RESERVED');assert.match(ui.b.nodes.get('productionMaterialsSelected').textContent,/Fabricação parcial registrada/);assert.doesNotMatch(ui.b.nodes.get('productionMaterialsSelected').textContent,/apto para conferir DTF/);
});

test('actual purchase estimates and quote drafts preserve integer cents without binary rounding at the supported monetary bound',async t=>{
 const f=materialFixture(t),variant=await f.seedStock({count:0}),order=await f.seedOrder({quantity:1});await f.map(order,[{variant_id:variant.variant_id,quantity_per_unit:1}]);const supplier=webcrypto.randomUUID();await f.mutate(f.command('save_supplier',{supplier_id:supplier,name:'Fornecedor do limite monetário sintético',evidence:'Cotação de teste do limite inteiro',policies:[{variant_id:variant.variant_id,minimum_quantity:1,multiple_quantity:1,unit_cost_cents:Number.MAX_SAFE_INTEGER,shipping_cents:0,quote_ref:'synthetic-boundary-quote'}]}));const ui=await mountService(f);t.after(()=>ui.stop());await ui.open();assert.equal(ui.snapshot().plan.total_estimate_cents,Number.MAX_SAFE_INTEGER);assert.match(ui.b.nodes.get('productionMaterialsNeeds').textContent,/90\.071\.992\.547\.409,91/);const edit=ui.b.nodes.get('productionMaterialsSuppliers').querySelector('button');edit.onclick();await ui.b.flush();assert.equal(ui.fields('Supplier').querySelectorAll('.production-materials-row')[0].querySelector('[name="unit_cost_cents"]').value,'90071992547409.91');
});
