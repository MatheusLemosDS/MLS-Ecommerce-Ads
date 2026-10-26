import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {PRODUCTION_COST_PERIODS_CLIENT,productionCostPeriodsBody} from '../src/production-cost-periods-view.mjs';
import {SAVED_CATALOG_CLIENT,savedCatalogBody} from '../src/saved-catalog-view.mjs';
import {projectProductRegistryFrame} from '../src/product-registry.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
function browser(html,client,prefix,respond){
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.ownText='';this.attributes={};this.value='';this.hidden=false;this.disabled=false;this.dataset={};}
  append(...values){this.children.push(...values);}
  replaceChildren(...values){this.ownText='';this.children=[];this.append(...values);}
  set textContent(value){this.ownText=String(value);this.children=[];}
  get textContent(){return this.ownText+this.children.map(row=>row.textContent).join(' ');}
  setAttribute(key,value){this.attributes[key]=String(value);}
  getAttribute(key){return this.attributes[key]??null;}
  querySelector(selector){const attribute=selector.slice(1,-1);for(const row of this.children){if(row.getAttribute(attribute)!==null)return row;const found=row.querySelector(selector);if(found)return found;}return null;}
  set innerHTML(value){throw Error('Unsafe HTML insertion');}
 }
 const elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>[match[1],new Element()])),calls=[],timers=new Map(),listeners=new Map();let timerSequence=0,now=1793192400000;
 class Clock extends Date{static now(){return now;}}
 const document={hidden:false,getElementById:id=>elements.get(id)||null,createElement:tag=>new Element(tag),addEventListener:(event,callback)=>listeners.set(event,callback)};
 const context=vm.createContext({Intl,Date:Clock,TextEncoder,document,setTimeout:(callback,delay)=>{const id=++timerSequence;timers.set(id,{callback,due:now+delay});return id;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(client,context);const workspace=context[prefix==='costPeriods'?'brazaProductionCostPeriods':'brazaSavedCatalog'];
 const api=async(path,body)=>{calls.push({path,body:body===undefined?undefined:clone(body)});const value=await respond(path,body);return vm.runInContext('JSON.parse('+JSON.stringify(JSON.stringify(value))+')',context);};
 const el=name=>elements.get(prefix+name),buttons=(root=el('List'))=>{const result=[];const walk=row=>{if(row.tagName==='BUTTON')result.push(row);row.children.forEach(walk);};walk(root);return result;};
 const button=(label,root)=>buttons(root).find(row=>row.textContent===label);
 return {context,workspace,api,calls,el,button,buttons,timers,async tick(ms=1000){now+=ms;const due=[...timers].filter(([,timer])=>timer.due<=now);for(const [id,timer] of due){timers.delete(id);await timer.callback();}},visible(value){document.hidden=!value;listeners.get('visibilitychange')?.();},async flush(){for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));}};
}
const stamp=1793192400;
const coverage={orders:3,eligible_orders:2,excluded_cancelled:1,excluded_cancel_pending:0,excluded_unpaid:0,review_orders:0,total_units:3,known_units:2,pending_units:1,pending_variants:1};
const period=(kind,changes={})=>({period:kind,start_date:kind==='WEEK'?'2026-10-26':'2026-10-01',end_date:'2026-10-28',state:'PARTIAL',source_start_date:kind==='WEEK'?'2026-10-26':'2026-10-01',source_end_date:'2026-10-27',source_checked_at:stamp,calculated_at:stamp+60,production_cost_cents:null,known_production_cost_cents:3730,coverage:clone(coverage),versions:{bindings:3,costs:5,cost_rules:2,classifications:7},pending:['PRODUCTION_COST_INCOMPLETE','PERIOD_INCOMPLETE'],sync_state:'IDLE',days:[],...changes});
const periods=(changes={})=>({schema:'production_cost_periods_v1',reference_month:'2026-10',checked_at:stamp+60,currency:'BRL',basis:'CURRENT_REGISTERED_COSTS_PAID_CREATE_DATE',weekly:period('WEEK'),monthly:period('MONTH'),...changes});
const product=(item_id='101',changes={})=>({item_id,item_status:'NORMAL',product_name:'Camiseta Verde',source_update_time:stamp-100,last_seen_at:stamp-60,catalog_checked_at:stamp-50,catalog_status:'MATCHED',model_count:2,resolved_count:2,metadata_changed:false,...changes});
const registry=(products=[product()],changes={})=>({schema:'product_registry_v1',checked_at:stamp,revision:3,counts:{total:products.length,indexed:products.length,pending_catalog:0},discovery:{status:'RUNNING',item_status:'NORMAL',offset:50,pages_read:1,last_attempt_at:stamp,last_success_at:null,next_run_at:stamp,last_error:null,complete:false},pagination:{limit:20,offset:0,total:products.length,more:false},products,...changes});
const variant=(model_id='1',changes={})=>({model_id,model_name:'Verde G1',attributes:[{name:'Cor',value:'Verde'},{name:'Tamanho',value:'G1'}],unit_cost_cents:2140,selling_unit:'SINGLE_GARMENT',size:'G1',male_size:null,female_size:null,cost_profile_id:null,cost_profile_label:null,reason:null,...changes});
const detail=(item_id='101',variants=[variant()],changes={})=>({schema:'product_registry_detail_v1',checked_at:stamp,product:product(item_id),pagination:{limit:100,offset:0,total:variants.length,more:false},revisions:{costs:5,bindings:3,cost_rules:2,classifications:7},variants,...changes});

test('weekly and monthly cards retain a partial production subtotal and disclose the exact saved source range',async()=>{
 const b=browser(productionCostPeriodsBody(),PRODUCTION_COST_PERIODS_CLIENT,'costPeriods',async()=>periods());b.el('Month').value='2026-10';assert.equal(await b.workspace.start({api:b.api}),true);
 assert.deepEqual(b.calls,[{path:'production-costs/periods?month=2026-10',body:undefined}]);assert.match(b.el('Weekly').textContent,/Esta semana.*26\/10\/2026 a 28\/10\/2026.*37,30.*subtotal parcial/);assert.match(b.el('Weekly').textContent,/2 de 3 unidade.*1 unidade.*1 variação/);assert.match(b.el('Weekly').textContent,/1 pedido.*excluído/);assert.match(b.el('Weekly').textContent,/26\/10\/2026 a 27\/10\/2026/);assert.match(b.el('Monthly').textContent,/Mês selecionado.*01\/10\/2026/);assert.doesNotMatch(b.el('Weekly').textContent,/Custo total de produção/);
});

test('recalculate reads saved quantities and current costs; only the explicit weekly update posts to the source route',async()=>{
 let value=periods();const b=browser(productionCostPeriodsBody(),PRODUCTION_COST_PERIODS_CLIENT,'costPeriods',async()=>value);b.el('Month').value='2026-10';await b.workspace.start({api:b.api});value=periods({weekly:period('WEEK',{known_production_cost_cents:4130,versions:{bindings:3,costs:6,cost_rules:2,classifications:7}})});
 await b.el('Refresh').onclick();assert.match(b.el('Weekly').textContent,/41,30.*subtotal parcial/);assert.match(b.el('Weekly').textContent,/Custos v6/);assert.equal(b.calls.filter(call=>call.body!==undefined).length,0);assert.match(b.el('Message').textContent,/data da fonte foi preservada/);
 await b.el('Sync').onclick();assert.deepEqual(b.calls.at(-1),{path:'production-costs/periods',body:{operation:'sync',month:'2026-10'}});assert.match(b.el('Message').textContent,/cobertura e o horário da fonte/);
});

test('a verified empty paid cohort can show zero, whereas a missing source remains unavailable',async()=>{
 const zero=period('WEEK',{state:'COMPLETE',production_cost_cents:0,known_production_cost_cents:0,coverage:{...coverage,eligible_orders:0,total_units:0,known_units:0,pending_units:0,pending_variants:0},pending:[]}),missing=period('MONTH',{state:'UNAVAILABLE',production_cost_cents:null,known_production_cost_cents:null,source_start_date:null,source_end_date:null,source_checked_at:null,versions:null,pending:['SOURCE_MISSING'],coverage:{...coverage,orders:0,eligible_orders:0,total_units:null,known_units:null,pending_units:0,pending_variants:0}});
 const b=browser(productionCostPeriodsBody(),PRODUCTION_COST_PERIODS_CLIENT,'costPeriods',async()=>periods({weekly:zero,monthly:missing}));b.el('Month').value='2026-10';await b.workspace.start({api:b.api});assert.match(b.el('Weekly').textContent,/0,00.*Custo total de produção/);assert.match(b.el('Monthly').textContent,/Aguardando dados.*Sem coleta salva/);assert.doesNotMatch(b.el('Monthly').textContent,/R\$/);
});

test('failed or mismatched period reads preserve prior cards and do not leak provider text; in-flight reads coalesce',async()=>{
 let response=periods(),release;const b=browser(productionCostPeriodsBody(),PRODUCTION_COST_PERIODS_CLIENT,'costPeriods',async()=>response);b.el('Month').value='2026-10';await b.workspace.start({api:b.api});const old=b.el('Weekly').textContent;response=new Promise(resolve=>release=resolve);const one=b.workspace.refresh(),two=b.workspace.refresh();assert.equal(one,two);release({...periods(),reference_month:'2026-09'});assert.equal(await one,false);assert.equal(b.el('Weekly').textContent,old);assert.match(b.el('Message').textContent,/últimos valores continuam visíveis/);
 response=Promise.reject(Error('PRIVATE_TOKEN'));response.catch(()=>{});assert.equal(await b.workspace.refresh(),false);assert.doesNotMatch(b.el('Message').textContent,/PRIVATE/);
});

test('a catalogue page performs one local read and fetches only the product detail the owner opens',async()=>{
 const products=Array.from({length:20},(_,index)=>product(String(101+index))),b=browser(savedCatalogBody(),SAVED_CATALOG_CLIENT,'savedCatalog',async path=>path.includes('item_id=')?detail():registry(products));b.el('Status').value='ACTIVE';await b.workspace.start({api:b.api});assert.equal(b.calls.length,1);assert.match(b.calls[0].path,/product-registry\?limit=20&offset=0&search=&item_status=ACTIVE/);assert.equal(b.el('List').children.length,20);assert.match(b.el('Source').textContent,/indexação ainda está em andamento/);
 const first=b.el('List').children[0];await b.button('Ver variações e custos',first).onclick();await b.flush();assert.equal(b.calls.length,2);assert.match(b.calls[1].path,/item_id=101&variant_limit=100&variant_offset=0/);assert.match(b.el('List').textContent,/Cor: Verde · Tamanho: G1.*21,40.*Custo da peça avulsa/);assert.equal(b.calls.filter(call=>call.body!==undefined).length,0);
});

test('saved detail distinguishes whole kits, child profiles and adult single costs without inferring current availability',async()=>{
 const rows=[variant(),variant('2',{model_name:'Casal G e G2',unit_cost_cents:3730,selling_unit:'ONE_MALE_ONE_FEMALE_KIT',size:null,male_size:'G',female_size:'G2'}),variant('3',{model_name:'Infantil 8',attributes:[{name:'Tamanho',value:'8'}],unit_cost_cents:1325,selling_unit:'CUSTOM_PRODUCT',size:null,cost_profile_id:'infantil',cost_profile_label:'Infantil atualizado'})];
 const b=browser(savedCatalogBody(),SAVED_CATALOG_CLIENT,'savedCatalog',async path=>path.includes('item_id=')?detail('101',rows):registry());b.el('Status').value='ACTIVE';await b.workspace.start({api:b.api});b.button('Ver variações e custos').onclick();await b.flush();assert.match(b.el('List').textContent,/37,30.*Custo do kit inteiro/);assert.match(b.el('List').textContent,/13,25.*Custo por unidade vendida · Infantil atualizado/);assert.doesNotMatch(b.el('List').textContent,/em estoque|disponível para venda|vendas do dia/);
});

test('a cost refresh reuses saved product selection and fetches one local detail with the new saved price',async()=>{
 let cost=2140;const configured=[],rules=[];const b=browser(savedCatalogBody(),SAVED_CATALOG_CLIENT,'savedCatalog',async path=>path.includes('item_id=')?detail('101',[variant('1',{unit_cost_cents:cost})]):registry());b.el('Status').value='ACTIVE';await b.workspace.start({api:b.api,onConfigureCost:(...args)=>configured.push(args),onAssignRule:(...args)=>{rules.push(args);return b.el('Search');}});b.button('Ver variações e custos').onclick();await b.flush();b.button('Configurar custo desta variação').onclick();assert.deepEqual(configured,[['101','1']]);b.button('Definir tipo para todos os tamanhos').onclick();assert.deepEqual(rules,[['101',null]]);
 cost=2200;await b.workspace.refresh();assert.match(b.el('List').textContent,/22,00/);assert.equal(b.calls.length,4);assert.equal(b.calls.filter(call=>call.body!==undefined).length,0);assert.equal(b.calls.filter(call=>call.path.includes('item_id=')).length,2);
});

test('an explicit check refreshes only the open product variations once and reloads saved costs after size removal',async()=>{
 let checked=false,release;const gate=new Promise(resolve=>release=resolve),b=browser(savedCatalogBody(),SAVED_CATALOG_CLIENT,'savedCatalog',async(path,body)=>{
  if(path==='cost-rules/sync'){await gate;checked=true;return {processed:['101'],cached:[],revision:2,matched_variants:[{item_id:'101',model_id:'1'}],learning:[]};}
  if(path.includes('item_id='))return detail('101',checked?[variant('1',{model_name:'Infantil 14',attributes:[{name:'Tamanho',value:'14'}],unit_cost_cents:1250,selling_unit:'CUSTOM_PRODUCT',size:null,cost_profile_id:'auto-camiseta-infantil',cost_profile_label:'Camiseta infantil · 14'})]:[variant('1',{model_name:'Infantil 14',attributes:[{name:'Tamanho',value:'14'}],unit_cost_cents:null,selling_unit:null,size:null,reason:'CATALOG_METADATA_CHANGED'}),variant('2',{model_name:'Infantil 16',attributes:[{name:'Tamanho',value:'16'}],unit_cost_cents:null,selling_unit:null,size:null,reason:'CATALOG_METADATA_CHANGED'})]);
  return registry();
 });b.el('Status').value='ACTIVE';await b.workspace.start({api:b.api});b.button('Ver variações e custos').onclick();await b.flush();const verify=b.button('Conferir variações na Shopee'),one=verify.onclick(),two=verify.onclick();assert.equal(one,two);assert.equal(verify.disabled,true);assert.equal(b.calls.filter(call=>call.body!==undefined).length,1);assert.deepEqual(b.calls.at(-1),{path:'cost-rules/sync',body:{item_ids:['101'],force:true}});release();assert.equal(await one,true);assert.match(b.el('List').textContent,/Infantil 14.*12,50/);assert.doesNotMatch(b.el('List').textContent,/Infantil 16/);assert.match(b.el('Message').textContent,/histórico dos tamanhos removidos foi preservado/);assert.equal(b.button('Conferir variações na Shopee').disabled,false);assert.equal(b.calls.filter(call=>call.path.includes('item_id=')).length,2);
});

test('failed or mismatched variation checks preserve the displayed costs and do not leak provider text or retry automatically',async()=>{
 let result=null;const b=browser(savedCatalogBody(),SAVED_CATALOG_CLIENT,'savedCatalog',async(path,body)=>{if(path==='cost-rules/sync'){if(result===null)throw Error('PRIVATE_PROVIDER_TOKEN');return result;}return path.includes('item_id=')?detail():registry();});b.el('Status').value='ACTIVE';await b.workspace.start({api:b.api});b.button('Ver variações e custos').onclick();await b.flush();let verify=b.button('Conferir variações na Shopee');assert.equal(await verify.onclick(),false);assert.match(b.el('List').textContent,/custos salvos foram preservados/);assert.match(b.el('List').textContent,/21,40/);assert.doesNotMatch(b.el('List').textContent,/PRIVATE/);assert.equal(verify.disabled,false);assert.equal(b.calls.filter(call=>call.path==='cost-rules/sync').length,1);
 result={processed:['999'],cached:[]};assert.equal(await verify.onclick(),false);assert.equal(b.calls.filter(call=>call.path.includes('item_id=')).length,1);assert.match(b.el('List').textContent,/21,40/);
});

test('a late variation check cannot reload or overwrite a different product selected in the meantime',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),b=browser(savedCatalogBody(),SAVED_CATALOG_CLIENT,'savedCatalog',async path=>{if(path==='cost-rules/sync'){await gate;return {processed:['101'],cached:[]};}if(path.includes('item_id=101'))return detail();if(path.includes('item_id=102'))return detail('102',[variant('9',{model_name:'SEGUNDO PRODUTO',unit_cost_cents:1590,size:'P'})]);return registry([product('101'),product('102')]);});b.el('Status').value='ACTIVE';await b.workspace.start({api:b.api});b.button('Ver variações e custos',b.el('List').children[0]).onclick();await b.flush();const pending=b.button('Conferir variações na Shopee').onclick();b.button('Ver variações e custos',b.el('List').children[1]).onclick();await b.flush();assert.equal(b.button('Conferir variações na Shopee').disabled,true);const calls=b.calls.length;release();assert.equal(await pending,false);assert.equal(b.calls.length,calls);assert.match(b.el('List').textContent,/SEGUNDO PRODUTO/);assert.equal(b.button('Conferir variações na Shopee').disabled,false);assert.doesNotMatch(b.el('Message').textContent,/Variações conferidas/);
});

test('a saved variation check does not claim refreshed costs if the following detail read fails',async()=>{
 let checked=false;const b=browser(savedCatalogBody(),SAVED_CATALOG_CLIENT,'savedCatalog',async path=>{if(path==='cost-rules/sync'){checked=true;return {processed:['101'],cached:[]};}if(path.includes('item_id=')){if(checked)throw Error('PRIVATE_D1_FAILURE');return detail();}return registry();});b.el('Status').value='ACTIVE';await b.workspace.start({api:b.api});b.button('Ver variações e custos').onclick();await b.flush();assert.equal(await b.button('Conferir variações na Shopee').onclick(),false);assert.match(b.el('Message').textContent,/conferência foi salva.*Recarregue o catálogo salvo/);assert.match(b.el('List').textContent,/Não foi possível carregar as variações salvas/);assert.doesNotMatch(b.el('Message').textContent,/PRIVATE/);
});

test('catalogue changes remain visibly pending and private malformed detail responses cannot replace safe values',async()=>{
 let value=detail('101',[variant('1',{unit_cost_cents:null,selling_unit:null,size:null,reason:'CATALOG_METADATA_CHANGED'})],{product:product('101',{metadata_changed:true,resolved_count:0})});
 const b=browser(savedCatalogBody(),SAVED_CATALOG_CLIENT,'savedCatalog',async path=>path.includes('item_id=')?value:registry([product('101',{product_name:'<img src=x onerror=PRIVATE()>',metadata_changed:true,resolved_count:0})]));b.el('Status').value='ACTIVE';await b.workspace.start({api:b.api});assert.match(b.el('List').textContent,/Catálogo alterado; aguardando conferir variações/);b.button('Ver variações e custos').onclick();await b.flush();assert.match(b.el('List').textContent,/Custo pendente.*produto mudou na Shopee/);assert.equal(b.context.PRIVATE,undefined);
 value={...value,buyer:'PRIVATE_PERSON'};await b.workspace.refresh();assert.match(b.el('List').textContent,/Não foi possível carregar as variações salvas/);assert.doesNotMatch(b.el('List').textContent,/PRIVATE_PERSON/);assert.equal(projectProductRegistryFrame(value),null);
});

test('startup reads the saved catalogue immediately before background work and manual source failure keeps all products',async()=>{
 let fail=false;const b=browser(savedCatalogBody(),SAVED_CATALOG_CLIENT,'savedCatalog',async(path,body)=>{if(body!==undefined){if(fail)throw Error('PRIVATE_429');return {status:'PROGRESSED'};}return registry();});b.el('Status').value='ACTIVE';await b.workspace.start({api:b.api});assert.equal(b.calls.length,1);await b.el('Sync').onclick();assert.deepEqual(b.calls[1],{path:'product-registry/sync',body:{}});assert.equal(b.calls.length,3);fail=true;await b.el('Sync').onclick();assert.match(b.el('List').textContent,/Camiseta Verde/);assert.match(b.el('Message').textContent,/produtos salvos foram preservados/);assert.doesNotMatch(b.el('Message').textContent,/PRIVATE/);
});

test('visible background discovery completes pages automatically, coalesces source work and leaves search and details usable',async()=>{
 let pages=0,release;const firstPage=new Promise(resolve=>release=resolve),b=browser(savedCatalogBody(),SAVED_CATALOG_CLIENT,'savedCatalog',async(path,body)=>{
  if(body!==undefined){pages++;if(pages===1)await firstPage;return {status:'PROGRESSED'};}
  if(path.includes('item_id='))return detail();return registry([product()],{discovery:{...registry().discovery,complete:pages>=3,status:pages>=3?'IDLE':'RUNNING',last_success_at:pages>=3?stamp+3:null,next_run_at:pages>=3?stamp+86400:stamp}});
 });b.el('Status').value='ACTIVE';await b.workspace.start({api:b.api});assert.equal(pages,0);const running=b.tick();await b.flush();assert.equal(pages,1);assert.equal(b.el('Search').disabled,false);assert.equal(b.el('Find').disabled,false);assert.equal(b.el('Sync').disabled,true);await b.el('Sync').onclick();assert.equal(pages,1);
 b.button('Ver variações e custos').onclick();await b.flush();assert.match(b.el('List').textContent,/21,40/);release();await running;await b.tick();await b.tick();assert.equal(pages,3);assert.equal(b.timers.size,0);assert.equal(b.calls.filter(call=>call.path.includes('item_id=')).length,1,'background pages must retain the open detail without re-fetching it');assert.match(b.el('List').textContent,/21,40/);assert.match(b.el('Source').textContent,/varredura completa foi concluída/);
});

test('background respects provider retry dates, pauses when hidden and never queries the source for a recent complete index',async()=>{
 let pages=0;const waiting={...registry().discovery,status:'RETRY_WAIT',next_run_at:stamp+30,last_error:'PRODUCT_REGISTRY_SOURCE_UNAVAILABLE'};
 const b=browser(savedCatalogBody(),SAVED_CATALOG_CLIENT,'savedCatalog',async(path,body)=>{if(body!==undefined){pages++;return {status:'PROGRESSED'};}return registry([product()],{discovery:waiting});});b.el('Status').value='ACTIVE';await b.workspace.start({api:b.api});await b.tick(1000);assert.equal(pages,0);b.visible(false);assert.equal(b.timers.size,0);await b.tick(30000);assert.equal(pages,0);b.visible(true);await b.tick(1000);assert.equal(pages,1);b.workspace.stop();assert.equal(b.timers.size,0);await b.tick(60000);assert.equal(pages,1);
 const ready=browser(savedCatalogBody(),SAVED_CATALOG_CLIENT,'savedCatalog',async()=>registry([product()],{discovery:{...registry().discovery,status:'IDLE',complete:true,last_success_at:stamp,next_run_at:stamp+86400}}));ready.el('Status').value='ACTIVE';await ready.workspace.start({api:ready.api});assert.equal(ready.timers.size,0);await ready.tick(60000);assert.equal(ready.calls.length,1);
});

test('a background provider error backs off instead of hammering and preserves a manual rule draft in the open detail',async()=>{
 let pages=0;const b=browser(savedCatalogBody(),SAVED_CATALOG_CLIENT,'savedCatalog',async(path,body)=>{if(body!==undefined){pages++;throw Error('PRIVATE_PROVIDER_429');}return path.includes('item_id=')?detail():registry();});b.el('Status').value='ACTIVE';await b.workspace.start({api:b.api});b.button('Ver variações e custos').onclick();await b.flush();const oldDetail=b.el('List').children[0].children[1];oldDetail.append(b.el('Search'));
 await b.tick();assert.equal(pages,1);assert.equal(b.el('List').children[0].children[1],oldDetail);assert.match(b.el('List').textContent,/21,40/);await b.tick(1000);assert.equal(pages,1);await b.tick(119000);assert.equal(pages,2);assert.doesNotMatch(b.el('Source').textContent,/PRIVATE/);
});

test('a paused policy stops source continuation until an explicit resume and a concurrent lease waits five seconds',async()=>{
 let status='PAUSED',posts=0;const b=browser(savedCatalogBody(),SAVED_CATALOG_CLIENT,'savedCatalog',async(path,body)=>{if(body!==undefined){posts++;return {status};}return registry();});b.el('Status').value='ACTIVE';await b.workspace.start({api:b.api});await b.tick();assert.equal(posts,1);assert.equal(b.timers.size,0);assert.match(b.el('Source').textContent,/pausada nas configurações/);await b.workspace.refresh();assert.equal(b.timers.size,0);await b.tick(60000);assert.equal(posts,1);
 status='LEASED';b.workspace.resume();await b.tick();assert.equal(posts,2);await b.tick(1000);assert.equal(posts,2);await b.tick(4000);assert.equal(posts,3);b.workspace.stop();assert.equal(b.timers.size,0);
});

test('changed metadata warns in the open detail without destroying a pending correction; explicit refresh rechecks its current cost once',async()=>{
 let changed=false,cost=2140;const b=browser(savedCatalogBody(),SAVED_CATALOG_CLIENT,'savedCatalog',async(path,body)=>{if(body!==undefined){changed=true;return {status:'PROGRESSED'};}return path.includes('item_id=')?detail('101',[variant('1',{unit_cost_cents:cost})]):registry([product('101',{metadata_changed:changed})]);});b.el('Status').value='ACTIVE';await b.workspace.start({api:b.api});b.button('Ver variações e custos').onclick();await b.flush();const host=b.el('List').children[0].children[1];await b.tick();assert.equal(b.el('List').children[0].children[1],host);assert.match(host.textContent,/valores exibidos são da conferência anterior.*escolhas foram preservadas/);assert.equal(b.calls.filter(call=>call.path.includes('item_id=')).length,1);
 cost=2200;await b.workspace.refresh();assert.match(b.el('List').textContent,/22,00/);assert.equal(b.calls.filter(call=>call.path.includes('item_id=')).length,2);
});

test('late details from a closed product cannot overwrite a newly selected product',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve),b=browser(savedCatalogBody(),SAVED_CATALOG_CLIENT,'savedCatalog',async path=>path.includes('item_id=101')?pending:path.includes('item_id=102')?detail('102',[variant('9',{model_name:'SEGUNDO PRODUTO',unit_cost_cents:1590,size:'P'})]):registry([product('101'),product('102')]));b.el('Status').value='ACTIVE';await b.workspace.start({api:b.api});b.button('Ver variações e custos',b.el('List').children[0]).onclick();await b.flush();b.button('Ver variações e custos',b.el('List').children[1]).onclick();await b.flush();assert.match(b.el('List').textContent,/SEGUNDO PRODUTO/);release(detail('101',[variant('1',{model_name:'PRIMEIRO ATRASADO'})]));await b.flush();assert.match(b.el('List').textContent,/SEGUNDO PRODUTO/);assert.doesNotMatch(b.el('List').textContent,/PRIMEIRO ATRASADO/);
});
