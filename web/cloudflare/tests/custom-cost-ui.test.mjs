import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {CLIENT} from '../src/admin-client.mjs';
import {adminBody,CSS} from '../src/admin-view.mjs';

const base={mode:'all_inclusive',inclusive_regular_cents:1590,inclusive_plus_cents:1890,base_regular_cents:null,base_plus_cents:null,components:[]};
const custom={...base,custom_profiles:[{id:'pants',label:'Calça',unit_cost_cents:3590},{id:'couple',label:'Kit casal',unit_cost_cents:4200}],custom_assignments:[{item_id:'123',model_id:null,profile_id:'pants'},{item_id:'123',model_id:'0',profile_id:'couple'}]};
const line=prefix=>CLIENT.split('\n').find(value=>value.startsWith(prefix));

function browser(values=base){
 const context=vm.createContext({Intl,console});
 const ids=['customCostProfiles','customCostProfile','customCostAssignments','customCostItems','customCostModel','customCostsSection','customCostMessage','addCustomCostProfile','assignCustomCost','costMode','costInclusiveRegular','costInclusivePlus','costBaseRegular','costBasePlus','costComponents','costInclusive','costItemized','costsPreview','costsDraftNote','saveProductionCosts','loadProductionCosts','reviewProductionCosts','costsVersion','costsNotice','costsStatus','addCostComponent','productionCostsAudit'];
 const start=CLIENT.indexOf('function savedVariantUnitCost('),end=CLIENT.indexOf('function renderItemsProductionCosts(',start);
 assert.ok(start>=0&&end>start);
 new vm.Script(`
 class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.attributes={};this.listeners={};this.className='';}
  append(...nodes){for(const n of nodes){n.parentNode=this;this.children.push(n);}}
  replaceChildren(...nodes){for(const n of this.children)n.parentNode=null;this.children=[];this.append(...nodes);}
  remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(k,fn){this.listeners[k]=fn;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  querySelectorAll(selector){const key=selector.slice(6,-1).replace(/-([a-z])/g,(_,x)=>x.toUpperCase());return this.children.flatMap(n=>[...(Object.hasOwn(n.dataset,key)?[n]:[]),...n.querySelectorAll(selector)]);}
  focus(){globalThis.focused=this;}
  scrollIntoView(){this.scrolled=true;}
  set innerHTML(value){throw Error('HTML insertion is not allowed');}
 }
 const controls=new Map(${JSON.stringify(ids)}.map(id=>[id,new Element()]));
 const el=id=>controls.get(id),node=(tag,text,cls)=>{const n=new Element(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const structuredClone=value=>JSON.parse(JSON.stringify(value));
 let uuid=0;const crypto={randomUUID:()=> 'new-profile-'+(++uuid)};
 const money=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(c/100);
 let customCostSettingsEnabled=false,customCostAssignmentsDraft=[];
 let productionCostsState=null,productionCostsPromise=null,productionCostsSaving=false,productionCostsDirty=false,productionCostsBlocked=false,productionCostsConflict=null,productionCostsEditSequence=0,bindingState=null,storePeriodBundle=null;
 let bindingDrafts=new Map(),itemsData=null,noticeText='',openedTab='',apiCalls=[],bindingRows=[];
 const notice=text=>noticeText=text,openTab=tab=>openedTab=tab,currentBindingMap=()=>new Map(bindingRows.map(row=>[row.item_id+':'+row.model_id,row])),renderVariantCards=()=>{},loadVariants=async()=>{},refreshStoreResult=async()=>{};
 async function api(path,body){apiCalls.push({path,body:body?structuredClone(body):undefined});if(path==='production-costs/audit')return {rows:[]};return globalThis.apiAction(path,body);}
 `+line('function variantId(')+'\n'+line('function catalogDiagnosticKeys(')+'\n'+line('function catalogDiagnosticArray(')+'\n'+line('function productionCostFrameCurrent(')+'\n'+line('function savedCustomCost(')+'\n'+CLIENT.slice(start,end)+'\n'+line('function variantCostReference(')+'\n'+line('function variantReference(')).runInContext(context);
 const run=code=>new vm.Script(code).runInContext(context),json=code=>JSON.parse(run('JSON.stringify('+code+')'));
 run('applyProductionCosts('+JSON.stringify({revision:7,values,updated_at:'2026-10-23T10:00:00Z'})+')');
 return {run,json,context};
}

test('custom cost controls share the revisioned production form and explain whole kits and bulk products',()=>{
 const html=adminBody(),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(ids.length,new Set(ids).size);
 for(const id of ['customCostsSection','customCostProfiles','customCostItems','customCostModel','customCostProfile','customCostAssignments','addCustomCostProfile','assignCustomCost'])assert.ok(ids.includes(id),id);
 const form=html.slice(html.indexOf('<form id="productionCostsForm"'),html.indexOf('</form>',html.indexOf('<form id="productionCostsForm"')));
 assert.match(form,/custo do kit inteiro/);assert.match(form,/atuais e futuras/);assert.match(form,/Salvar custos de produção/);
 assert.match(CSS,/\.custom-cost-assignment-controls\{grid-template-columns:minmax\(0,1fr\)/);
});

test('legacy values keep six keys; custom state validates exact paired metadata without executing accessors',()=>{
 const b=browser();assert.deepEqual(b.json('productionCostsValues()'),base);
 assert.equal(b.run('Object.hasOwn(productionCostsValues(),"custom_profiles")'),false);
 b.run('globalThis.candidate='+JSON.stringify({revision:9,values:custom,updated_at:'new'}));
 assert.deepEqual(b.json('validProductionCostsState(candidate)'),{revision:9,values:custom,updated_at:'new'});
 for(const change of ['delete candidate.values.custom_assignments','candidate.values.custom_profiles[0].unit_cost_cents=0','candidate.values.custom_assignments[0].item_id="0123"','candidate.values.custom_assignments.push({...candidate.values.custom_assignments[0]})','candidate.values.custom_assignments[0].profile_id="missing"','candidate.values.custom_profiles[0].extra=true','candidate.values.custom_profiles[0].label="bad\\nlabel"']){
  b.run('candidate='+JSON.stringify({revision:9,values:custom})+';'+change);assert.equal(b.run('validProductionCostsState(candidate)'),null,change);
 }
 b.run('candidate='+JSON.stringify({revision:9,values:custom})+';Object.defineProperty(candidate.values.custom_profiles[0],"label",{get(){throw Error("must not execute");},enumerable:true});');
 assert.equal(b.run('validProductionCostsState(candidate)'),null);
});

test('product-wide cost covers new models without bindings; variation override wins and a kit is charged once',()=>{
 const b=browser(custom);
 assert.equal(b.run('savedVariantUnitCost(null,{item_id:"123",model_id:"99999"})'),3590);
 assert.equal(b.run('savedVariantUnitCost(null,{item_id:"123",model_id:"0"})'),4200);
 assert.equal(b.run('savedVariantUnitCost({item_id:"123",model_id:"0",selling_unit:"ONE_MALE_ONE_FEMALE_KIT",male_size:"G3",female_size:"G3"})'),4200);
 assert.equal(b.run('savedVariantUnitCost(null,{item_id:"999",model_id:"1"})'),null);
 assert.equal(b.run('savedVariantUnitCost({item_id:"999",model_id:"1",selling_unit:"SINGLE_GARMENT",size:"GG"})'),1590);
 assert.match(b.run('variantCostReference("123:99999")'),/Calça/);
 b.run('itemsData={margin_reference:{variants:[{item_id:"123",model_id:"0",unit_margin_cents:999999}]}}');
 assert.doesNotMatch(b.run('variantReference({item_id:"123",model_id:"0"},"123:0")'),/9\.999|antes dos anúncios/);
});

test('profile edits and bulk associations serialize together; in-use profiles cannot disappear silently',()=>{
 const b=browser();b.run('customCostSettingsEnabled=true;appendCustomCostProfile({id:"hoodie",label:"Moletom",unit_cost_cents:5100});productionCostsChanged();');
 b.run('el("customCostItems").value="123, 456 123";el("customCostProfile").value="hoodie";assignCustomCost();');
 assert.deepEqual(b.json('productionCostsValues().custom_assignments'),[{item_id:'123',model_id:null,profile_id:'hoodie'},{item_id:'456',model_id:null,profile_id:'hoodie'}]);
 assert.equal(b.run('el("customCostProfiles").children[0].querySelector("[data-custom-remove]").disabled'),true);
 b.run('el("customCostProfiles").children[0].querySelector("[data-custom-remove]").onclick()');assert.equal(b.run('el("customCostProfiles").children.length'),1);
 b.run('el("customCostProfiles").children[0].querySelector("[data-custom-label]").value="Moletom <b>premium</b>";el("customCostProfiles").children[0].querySelector("[data-custom-amount]").value="52,75";productionCostsChanged();');
 assert.deepEqual(b.json('productionCostsValues().custom_profiles'),[{id:'hoodie',label:'Moletom <b>premium</b>',unit_cost_cents:5275}]);
 b.run('el("customCostAssignments").children[0].children[1].children[0].onclick()');assert.equal(b.run('el("customCostItems").value'),'123');assert.equal(b.run('el("customCostModel").value'),'');
 b.run('el("customCostAssignments").children[0].children[1].children[1].onclick();el("customCostAssignments").children[0].children[1].children[1].onclick();el("customCostProfiles").children[0].querySelector("[data-custom-remove]").onclick();');
 assert.deepEqual(b.json('productionCostsValues().custom_profiles'),[]);assert.deepEqual(b.json('productionCostsValues().custom_assignments'),[]);
});

test('assignment replacement keeps variation exceptions; invalid bulk override leaves the draft intact',()=>{
 const b=browser(custom);b.run('el("customCostItems").value="123 456";el("customCostProfile").value="couple";assignCustomCost();');
 assert.equal(b.run('customCostAssignmentsDraft.filter(row=>row.item_id==="123"&&row.model_id===null)[0].profile_id'),'couple');
 assert.equal(b.run('customCostAssignmentsDraft.filter(row=>row.item_id==="123"&&row.model_id==="0").length'),1);
 const before=b.json('customCostAssignmentsDraft');b.run('el("customCostModel").value="9";assignCustomCost()');assert.deepEqual(b.json('customCostAssignmentsDraft'),before);assert.match(b.run('el("customCostMessage").textContent'),/somente um produto/);
 b.run('configureCustomCost("123")');assert.equal(b.run('openedTab'),'margins');assert.equal(b.run('el("customCostModel").value'),'');assert.equal(b.run('el("customCostProfile").value'),'pants');
 b.run('configureCustomCost("123","0")');assert.equal(b.run('el("customCostModel").value'),'0');assert.equal(b.run('el("customCostProfile").value'),'couple');
});

test('saving sends one CAS payload and preserves canonical profile metadata in the saved state',async()=>{
 const b=browser(custom);b.run('el("customCostProfiles").children[0].querySelector("[data-custom-amount]").value="36,90";productionCostsChanged();globalThis.apiAction=async(path,body)=>({revision:8,values:body.values,updated_at:"saved"});');
 await b.run('saveProductionCosts()');const payload=b.json('apiCalls[0].body');assert.equal(payload.revision,7);assert.equal(payload.values.custom_profiles[0].unit_cost_cents,3690);assert.deepEqual(payload.values.custom_assignments,custom.custom_assignments);
 assert.equal(b.run('productionCostsState.revision'),8);assert.equal(b.run('productionCostsState.updated_at'),'saved');assert.equal(b.run('productionCostsDirty'),false);
 assert.deepEqual(b.json('productionCostsValues()'),payload.values);
});

test('newer edits survive an in-flight save while saved revision and complete metadata advance',async()=>{
 const b=browser(custom);b.run('productionCostsChanged();globalThis.apiAction=()=>new Promise(resolve=>globalThis.resolveSave=resolve);globalThis.pendingSave=saveProductionCosts();');
 b.run('el("customCostProfiles").children[0].querySelector("[data-custom-label]").value="Calça nova";productionCostsChanged();resolveSave({revision:8,values:apiCalls[0].body.values,updated_at:"saved"});');await b.run('pendingSave');
 assert.equal(b.run('productionCostsState.revision'),8);assert.equal(b.run('productionCostsDirty'),true);assert.equal(b.run('productionCostsValues().custom_profiles[0].label'),'Calça nova');assert.equal(b.run('productionCostsState.values.custom_profiles[0].label'),'Calça');
});

test('stale loading preserves custom drafts and review merges additions from the latest saved version',async()=>{
 const b=browser(custom),latest={...custom,custom_profiles:[{...custom.custom_profiles[0],unit_cost_cents:3990},custom.custom_profiles[1],{id:'new',label:'Novo custo',unit_cost_cents:2700}],custom_assignments:[...custom.custom_assignments,{item_id:'789',model_id:null,profile_id:'new'}]};
 b.run('el("customCostProfiles").children[1].querySelector("[data-custom-label]").value="Meu kit";productionCostsChanged();globalThis.apiAction=async()=>('+JSON.stringify({revision:8,values:latest,updated_at:'remote'})+');');
 await b.run('loadProductionCosts()');assert.equal(b.run('productionCostsBlocked'),true);assert.equal(b.run('productionCostsState.revision'),7);assert.equal(b.run('productionCostsValues().custom_profiles[1].label'),'Meu kit');
 b.run('preserveLatestCustomCosts(productionCostsConflict.values);productionCostsState=productionCostsConflict;productionCostsConflict=null;productionCostsBlocked=false;updateProductionCostsPreview();');
 assert.equal(b.run('productionCostsValues().custom_profiles.find(row=>row.id==="pants").unit_cost_cents'),3990);assert.equal(b.run('productionCostsValues().custom_profiles.find(row=>row.id==="couple").label'),'Meu kit');assert.equal(b.run('productionCostsValues().custom_profiles.find(row=>row.id==="new").label'),'Novo custo');assert.ok(b.run('productionCostsValues().custom_assignments.some(row=>row.item_id==="789")'));
 assert.equal(b.run('el("saveProductionCosts").disabled'),false);
});

test('legacy drafts adopt newly saved custom metadata during conflict review without resetting shirt inputs',()=>{
 const b=browser();b.run('el("costInclusiveRegular").value="17,90";productionCostsChanged();preserveLatestCustomCosts('+JSON.stringify(custom)+');');
 assert.equal(b.run('productionCostsValues().inclusive_regular_cents'),1790);assert.deepEqual(b.json('productionCostsValues().custom_profiles'),custom.custom_profiles);assert.deepEqual(b.json('productionCostsValues().custom_assignments'),custom.custom_assignments);
});


test('a newer product read never presents stale shirt defaults as a custom production cost',()=>{
 const b=browser(custom);
 b.run('itemsData={production_cost_reference:{costs_revision:8}}');
 assert.equal(b.run('savedCustomCost("123","0")'),null);
 assert.equal(b.run('savedVariantUnitCost({item_id:"123",model_id:"0",selling_unit:"SINGLE_GARMENT",size:"M"})'),null);
 assert.match(b.run('variantCostReference("123:0")'),/custos salvos mudaram/);
 assert.doesNotMatch(b.run('variantReference({item_id:"123",model_id:"0"},"123:0")'),/antes dos anúncios/);
 b.run('productionCostsState.revision=8');assert.equal(b.run('savedVariantUnitCost(null,{item_id:"123",model_id:"0"})'),4200);
});

test('product list resolves all custom variations without a catalog binding and exposes searchable labels',()=>{
 const b=browser(custom);
 new vm.Script('const productSellingUnit=()=>null;\n'+line('function productSearchText(')+'\n'+line('function productBrowserRows(')).runInContext(b.context);
 const rows=b.json('productBrowserRows(new Map([["123",[["123:0",{item_id:"123",model_id:"0",quantity:1}],["123:99",{item_id:"123",model_id:"99",quantity:2}]]]]))');
 assert.equal(rows[0].ready,true);assert.equal(rows[0].mapped,0);assert.equal(rows[0].customComplete,true);assert.equal(rows[0].minCost,3590);assert.equal(rows[0].maxCost,4200);assert.deepEqual(rows[0].customLabels,['Kit casal','Calça']);assert.match(rows[0].search,/calca/);assert.equal(rows[0].quantity,3);
});
