import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProductionConfirmationPatch,PRODUCTION_CONFIRMATION_PROPOSAL_CLIENT} from '../src/production-confirmation-proposal-view.mjs';
import {projectProductionConfirmationProposal} from '../src/production-confirmation-proposal.mjs';
import {ownerReportBrowser} from './owner-report-browser-fixture.mjs';

const key='a'.repeat(64),hash='b'.repeat(64),otherKey='d'.repeat(64),otherHash='e'.repeat(64);
function proposal({sourceKey=key,sourceHash=hash,kit=false}={}){
 const identity={artwork:null,color:'Preto',size:'M',garment_type:'ADULT',fit:kit?'MALE':'UNKNOWN',item_id:'123',model_id:'456',sku:'CAM-80'};
 return {schema:'production_confirmation_proposal_v1',checked_at:1793970000,state:'AVAILABLE',reason:null,
  source:{key:sourceKey,hash:sourceHash,checked_at:1793969900,order_hash:'c'.repeat(64),order_status:'READY_TO_SHIP',selling_quantity:2,item_id:'123',model_id:'456',sku:'CAM-80',model_name:'Preto / M',quantity_basis:'SAVED_SELLING_UNITS_NOT_PRODUCED_PIECES'},
  catalog:{state:'AVAILABLE',product_name:'Camiseta Anos 80',model_name:'Preto / M',attributes:[{name:'Cor',value:'Preto'},{name:'Tamanho',value:'M'}],catalog_fingerprint:'f'.repeat(64),checked_at:1793969800,classification_status:'MATCHED',reason:null},
  composition:{state:'SUGGESTED',basis:'MANUAL_BINDING',components:[{key:'component-1',quantity_per_commercial_unit:1,identity},...(kit?[{key:'component-2',quantity_per_commercial_unit:1,identity:{...identity,size:'G1',fit:'FEMALE'}}]:[])],reason:null},
  cost:{state:'AVAILABLE',currency:'BRL',scope:'COMMERCIAL_UNIT',unit_cost_cents:kit?3730:1590,basis:'CURRENT_REGISTERED_COST_NOT_HISTORICAL_MANUFACTURING',reason:null},
  versions:{bindings:14,costs:5,cost_rules:7,classifications:54,historical:3},basis:'SAVED_CONTEXT_NOT_MANUFACTURING_CONFIRMATION'};
}
function mount({respond=async()=>proposal(),current={}}={}){
 const b=ownerReportBrowser('<div id="proposalHost"></div><script>'+PRODUCTION_CONFIRMATION_PROPOSAL_CLIENT+'</script>',{scriptIncludes:'globalThis.brazaProductionConfirmationProposal='}),calls=[],applied=[];
 let transport=respond,locked=false;
 b.context.proposalApi=async path=>{calls.push(path);return JSON.stringify(await transport(path));};b.context.proposalRead=()=>JSON.stringify(current);b.context.proposalLocked=()=>locked;
 b.context.proposalApply=(patch,context)=>{applied.push({patch:JSON.parse(JSON.stringify(patch)),context:JSON.parse(JSON.stringify(context))});Object.assign(current,patch);return true;};
 b.run(`const proposalOptions={api:async path=>JSON.parse(await proposalApi(path)),host:document.getElementById('proposalHost'),readIdentity:()=>JSON.parse(proposalRead()),isLocked:()=>proposalLocked(),onApply:(patch,context)=>proposalApply(patch,context)};brazaProductionConfirmationProposal.start(proposalOptions);`);
 const host=b.nodes.get('proposalHost');
 return {b,calls,applied,current,host,select:(source={key,hash})=>b.run('brazaProductionConfirmationProposal.setSource('+JSON.stringify(source)+')'),button:()=>host.querySelector('button'),snapshot:()=>JSON.parse(b.run('JSON.stringify(brazaProductionConfirmationProposal.getSnapshot())')),stop:()=>b.run('brazaProductionConfirmationProposal.stop()'),restart:()=>b.run('brazaProductionConfirmationProposal.start(proposalOptions)'),setTransport:value=>{transport=value;},setLocked:value=>{locked=value;}};
}

test('saved proposal is read only after selection and applied only by explicit action',async()=>{
 const current={artwork:'Arte conferida',produced_date:'2026-10-30',quantity:'9',unit_cost:'18,75',evidence:'Documento do lote',color:'',size:'',garment_type:'UNKNOWN',fit:'UNKNOWN'},ui=mount({current});
 assert.equal(ui.calls.length,0);assert.equal(ui.button(),null);assert.ok(projectProductionConfirmationProposal(proposal()));
 assert.equal(await ui.select(),true);assert.deepEqual(ui.calls,['production/proposal?source_key='+key+'&source_hash='+hash]);assert.equal(ui.applied.length,0);assert.match(ui.host.textContent,/Nenhuma produção foi registrada/);assert.match(ui.host.textContent,/não define peças fabricadas/);assert.match(ui.host.textContent,/não é o custo histórico de uma peça/);assert.match(ui.host.textContent,new RegExp(hash));
 assert.equal(ui.button().onclick(),true);assert.deepEqual(ui.applied[0].patch,{color:'Preto',size:'M',garment_type:'ADULT',item_id:'123',model_id:'456',sku:'CAM-80'});assert.deepEqual(ui.applied[0].context,{source_key:key,source_hash:hash,component_key:'component-1'});
 for(const [name,value] of Object.entries({artwork:'Arte conferida',produced_date:'2026-10-30',quantity:'9',unit_cost:'18,75',evidence:'Documento do lote'}))assert.equal(current[name],value);
 assert.equal(ui.calls.length,1);assert.match(ui.host.textContent,/Confirme novamente a identidade física/);
});

test('conflicting identity blocks the entire patch while equivalent entered values remain untouched',async()=>{
 const current={color:'Azul',size:'GG',garment_type:'CHILD',fit:'FEMALE',item_id:'999',model_id:'888',sku:'OTHER',quantity:'4'},ui=mount({current});await ui.select();const before=structuredClone(current);
 assert.equal(ui.button().onclick(),false);assert.deepEqual(current,before);assert.equal(ui.applied.length,0);assert.match(ui.host.textContent,/Nada foi preenchido/);assert.match(ui.host.textContent,/cor, tamanho, segmento, produto, variação, SKU/);
 const patch=buildProductionConfirmationPatch(proposal(),'component-1',{color:' preto ',size:'m',garment_type:'ADULT',fit:'UNKNOWN',item_id:'123'});assert.equal(patch.state,'READY');assert.deepEqual(patch.patch,{model_id:'456',sku:'CAM-80'});assert.equal(Object.hasOwn(patch.patch,'artwork'),false);
});

test('kit components require an explicit choice and never populate commercial or physical quantities or costs',async()=>{
 const ui=mount({respond:async()=>proposal({kit:true}),current:{quantity:'7',unit_cost:'21,40'}});await ui.select();assert.equal(ui.button().disabled,true);assert.equal(ui.button().onclick(),false);assert.equal(ui.applied.length,0);
 const select=ui.host.querySelector('select');select.value='component-2';select.onchange();assert.equal(ui.button().disabled,false);assert.equal(ui.button().onclick(),true);assert.equal(ui.applied[0].patch.size,'G1');assert.equal(ui.applied[0].patch.fit,'FEMALE');assert.equal(ui.current.quantity,'7');assert.equal(ui.current.unit_cost,'21,40');assert.equal(ui.calls.length,1);assert.match(ui.host.textContent,/37,30/);
});

test('unknown component count and identity remain unknown and are not promoted by size-axis context',async()=>{
 const value=proposal();value.composition.basis='SIZE_AXIS';Object.assign(value.composition.components[0],{quantity_per_commercial_unit:null});Object.assign(value.composition.components[0].identity,{garment_type:'UNKNOWN',fit:'UNKNOWN'});
 const ui=mount({respond:async()=>value});assert.equal(await ui.select(),true);assert.match(ui.host.textContent,/Quantidade física não determinada/);assert.equal(ui.button().onclick(),true);assert.equal(Object.hasOwn(ui.applied[0].patch,'garment_type'),false);assert.equal(Object.hasOwn(ui.applied[0].patch,'fit'),false);assert.equal(Object.hasOwn(ui.applied[0].patch,'quantity'),false);
});

test('stale, malformed and mismatched responses keep manual form facts and disable proposals',async()=>{
 for(const respond of [async()=>{throw Object.assign(Error('STALE'),{status:409});},async()=>({...proposal(),unexpected:true}),async()=>proposal({sourceHash:otherHash})]){
  const ui=mount({respond,current:{color:'Cor digitada',quantity:'5'}});assert.equal(await ui.select(),false);assert.equal(ui.button(),null);assert.equal(ui.snapshot(),null);assert.equal(ui.applied.length,0);assert.equal(ui.current.color,'Cor digitada');assert.equal(ui.current.quantity,'5');assert.match(ui.host.textContent,/preenchimento manual continua disponível/);
 }
});

test('late source responses cannot replace another selection, a manual lot, reload or logged-out session',async()=>{
 const first=Promise.withResolvers(),ui=mount({respond:()=>first.promise}),read=ui.select();ui.setTransport(async()=>proposal({sourceKey:otherKey,sourceHash:otherHash}));assert.equal(await ui.select({key:otherKey,hash:otherHash}),true);first.resolve(proposal());assert.equal(await read,false);assert.equal(ui.snapshot().source.key,otherKey);
 const second=Promise.withResolvers();ui.setTransport(()=>second.promise);const pending=ui.select();await ui.select({key:'',hash:null});second.resolve(proposal());assert.equal(await pending,false);assert.equal(ui.snapshot(),null);assert.equal(ui.button(),null);
 for(const restart of [false,true]){const deferred=Promise.withResolvers();ui.setTransport(()=>deferred.promise);const pending=ui.select();ui.stop();if(restart)ui.restart();deferred.resolve(proposal());assert.equal(await pending,false);assert.equal(ui.snapshot(),null);assert.equal(ui.button(),null);if(!restart)ui.restart();}
});

test('locked or expired sessions cannot apply suggestions even if an outer form enables the button',async()=>{
 const ui=mount();await ui.select();ui.setLocked(true);ui.button().disabled=false;assert.equal(ui.button().onclick(),false);assert.equal(ui.applied.length,0);ui.b.run("brazaProductionConfirmationProposal.bootstrapState({phase:'UNAUTHORIZED'})");assert.equal(ui.snapshot(),null);assert.equal(ui.host.textContent,'');assert.equal(await ui.select(),false);
});

test('parent controls preserve proposal DOM and focus while refreshing disabled state',async()=>{
 const ui=mount({respond:async()=>proposal({kit:true})});ui.b.run("const proposalCreate=document.createElement;document.createElement=tag=>{const item=proposalCreate(tag);item.focus=()=>{globalThis.proposalFocused=item;};return item;};");await ui.select();
 const first=ui.host.querySelector('select');first.value='component-2';first.onchange();const select=ui.host.querySelector('select'),button=ui.button(),details=ui.host.querySelector('details');assert.equal(ui.b.context.proposalFocused,select);details.open=true;
 ui.setLocked(true);ui.b.run('brazaProductionConfirmationProposal.refresh()');assert.equal(ui.host.querySelector('select'),select);assert.equal(ui.button(),button);assert.equal(ui.host.querySelector('details'),details);assert.equal(details.open,true);assert.equal(select.disabled,true);assert.equal(button.disabled,true);
 ui.setLocked(false);ui.b.run('brazaProductionConfirmationProposal.refresh()');assert.equal(ui.host.querySelector('select'),select);assert.equal(select.disabled,false);assert.equal(button.disabled,false);assert.equal(ui.calls.length,1);
});

test('invalid source selection never reads and catalogue text is rendered as text',async()=>{
 const value=proposal();value.catalog.product_name='<img src=x onerror=alert(1)>';const ui=mount({respond:async()=>value});for(const source of [{key:'../orders',hash},{key,hash:'token'},{key:null,hash:null}])assert.equal(await ui.select(source),false);assert.equal(ui.calls.length,0);
 await ui.select();assert.match(ui.host.textContent,/<img src=x onerror=alert\(1\)>/);assert.equal(ui.host.querySelector('img'),null);assert.equal(ui.calls.length,1);
});
