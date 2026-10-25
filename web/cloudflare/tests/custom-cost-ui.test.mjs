import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {CLIENT} from '../src/admin-client.mjs';
import {adminBody,CSS} from '../src/admin-view.mjs';

const base={mode:'all_inclusive',inclusive_regular_cents:1590,inclusive_plus_cents:1890,base_regular_cents:null,base_plus_cents:null,components:[]};
const custom={...base,custom_profiles:[{id:'pants',label:'Calça',unit_cost_cents:3590},{id:'couple',label:'Kit casal',unit_cost_cents:4200}],custom_assignments:[{item_id:'123',model_id:null,profile_id:'pants'},{item_id:'123',model_id:'0',profile_id:'couple'}]};
const recipes={composition_recipes:[{id:'combo-3-regular',label:'Combo com três camisetas',components:[{kind:'ADULT_GARMENT',size:'P',quantity:3}]}],composition_assignments:[{item_id:'123',model_id:'0',recipe_id:'combo-3-regular'}]};
const line=prefix=>CLIENT.split('\n').find(value=>value.startsWith(prefix));

function browser(values=base){
 const context=vm.createContext({Intl,console});
 const ids=['customCostProfiles','customCostProfile','customCostAssignments','customCostItems','customCostModel','customCostsSection','customCostMessage','addCustomCostProfile','assignCustomCost','costMode','costInclusiveRegular','costInclusivePlus','costBaseRegular','costBasePlus','costComponents','costInclusive','costItemized','costsPreview','costsDraftNote','saveProductionCosts','loadProductionCosts','reviewProductionCosts','costsVersion','costsNotice','costsStatus','addCostComponent','productionCostsAudit','confirmedCostReferences','confirmedCostReferencesTitle','confirmedCostReferencesRows'];
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

test('saved adult singles precede derived kits and preserve the current plus cost of R$21.40',()=>{
 const b=browser({...base,inclusive_plus_cents:2140});
 assert.deepEqual(b.json('productionCostSingleValues(productionCostsState.values)'),[1590,2140]);assert.deepEqual(b.json('productionCostKitValues(productionCostsState.values)'),[3180,3730,4280]);
 assert.equal(b.run('el("costsPreview").children[0].textContent'),'Camisetas adultas avulsas');assert.equal(b.run('el("costsPreview").children[1].children[0].textContent'),'Adulto P, M, G e GG');assert.match(b.run('el("costsPreview").children[2].children[1].textContent'),/21,40/);assert.equal(b.run('el("costsPreview").children[3].textContent'),'Kits com duas camisetas');assert.match(b.run('el("costsPreview").children[5].children[1].textContent'),/37,30/);assert.match(b.run('el("costsPreview").children[6].children[1].textContent'),/42,80/);
 assert.match(b.run('el("costsDraftNote").textContent'),/cor só muda o custo quando há uma exceção cadastrada/);
});

test('a three-piece recipe is preserved while saving prices and never inherits the old two-shirt kit margin',async()=>{
 const b=browser({...base,...recipes});assert.deepEqual(b.json('productionCostsValues()'),{...base,...recipes});assert.equal(b.run('savedVariantUnitCost({item_id:"123",model_id:"0",selling_unit:"ONE_MALE_ONE_FEMALE_KIT",male_size:"P",female_size:"P"})'),4770);assert.equal(b.run('savedCustomCost("123","0").piece_count'),3);
 b.run('itemsData={margin_reference:{variants:[{item_id:"123",model_id:"0",unit_margin_cents:999999}]}}');assert.doesNotMatch(b.run('variantReference({item_id:"123",model_id:"0"},"123:0")'),/9\.999|antes dos anúncios/);assert.match(b.run('el("costsPreview").children[8].children[1].textContent'),/47,70/);
 b.run('el("costInclusiveRegular").value="20,00";productionCostsChanged();globalThis.apiAction=async(path,body)=>({revision:8,values:body.values,updated_at:"saved"});');await b.run('saveProductionCosts()');assert.deepEqual(b.json('apiCalls.find(row=>row.body).body.values.composition_recipes'),recipes.composition_recipes);assert.deepEqual(b.json('apiCalls.find(row=>row.body).body.values.composition_assignments'),recipes.composition_assignments);assert.equal(b.run('savedCustomCost("123","0").unit_cost_cents'),6000);
});

test('recipe totals apply per-piece costs to all garments and per-kit packaging only once; manual custom prices keep priority',()=>{
 const values={...base,...recipes,mode:'itemized',base_regular_cents:1000,base_plus_cents:1500,components:[{id:'print',label:'Estampa',basis:'per_piece',amount_cents:200},{id:'pack',label:'Embalagem',basis:'per_kit',amount_cents:100}]},b=browser(values);assert.equal(b.run('productionCostRecipeValues(productionCostsState.values)[0].unit_cost_cents'),3700);
 const manual=browser({...custom,...recipes});assert.equal(manual.run('savedCustomCost("123","0").unit_cost_cents'),4200);assert.equal(manual.run('savedCustomCost("123","999").unit_cost_cents'),3590);
});

test('paired recipe metadata rejects malformed compositions and a conflict review adopts new recipes without replacing a price draft',async()=>{
 const b=browser({...base,...recipes});for(const change of ['delete candidate.values.composition_assignments','candidate.values.composition_recipes[0].components[0].quantity=0','candidate.values.composition_recipes[0].components[0].quantity=21','candidate.values.composition_recipes[0].components[0].size="2"','candidate.values.composition_assignments[0].model_id=null','candidate.values.composition_assignments[0].recipe_id="missing"','candidate.values.composition_assignments.push({...candidate.values.composition_assignments[0]})']){b.run('globalThis.candidate='+JSON.stringify({revision:9,values:{...base,...recipes}})+';'+change);assert.equal(b.run('validProductionCostsState(candidate)'),null,change);}
 const legacy=browser();legacy.run('el("costInclusiveRegular").value="18,00";productionCostsChanged();globalThis.apiAction=async()=>('+JSON.stringify({revision:8,values:{...base,...recipes},updated_at:'new'})+');');await legacy.run('loadProductionCosts()');assert.equal(legacy.run('productionCostsBlocked'),true);legacy.run('preserveLatestCustomCosts(productionCostsConflict.values);productionCostsState=productionCostsConflict;productionCostsConflict=null;productionCostsBlocked=false;updateProductionCostsPreview();');assert.equal(legacy.run('productionCostsValues().inclusive_regular_cents'),1800);assert.deepEqual(legacy.json('productionCostsValues().composition_recipes'),recipes.composition_recipes);assert.deepEqual(legacy.json('productionCostsValues().composition_assignments'),recipes.composition_assignments);
});

test('confirmed-reference audit is read-only, shows applied revisions and preserves newer cost drafts or correction conflicts',async()=>{
 const b=browser({...base,...recipes}),audit={schema:'operator_cost_corrections_v1',shop_id:1178167501,corrections:[{id:'adult-22199878767-remove-child-rule-v1',status:'SKIPPED',reason:'ASSIGNMENT_ALREADY_CLEAR',previous_revision:2,revision:2,checked_at:1793192400},{id:'child-size-2-1250-v1',status:'APPLIED',reason:'OPERATOR_CONFIRMED',previous_revision:2,revision:3,checked_at:1793192400},{id:'adult-triple-58271140523-149796059126-v1',status:'APPLIED',reason:'OPERATOR_CONFIRMED',previous_revision:6,revision:7,checked_at:1793192400}]};
 b.run('el("costInclusiveRegular").value="18,00";productionCostsChanged();globalThis.correctionAudit='+JSON.stringify(audit)+';globalThis.apiAction=async()=>correctionAudit;');assert.equal(await b.run('loadConfirmedCostReferences()'),true);assert.equal(b.run('el("confirmedCostReferencesTitle").textContent'),'Referências confirmadas aplicadas');assert.equal(b.run('el("confirmedCostReferences").hidden'),false);assert.match(b.run('el("confirmedCostReferencesRows").children.map(row=>row.textContent).join(" ")'),/versão 3.*Composição do combo adulto.*versão 7.*Custos em uso: versão 7/);assert.equal(b.run('productionCostsValues().inclusive_regular_cents'),1800);assert.equal(b.run('productionCostsDirty'),true);assert.deepEqual(b.json('apiCalls'),[{path:'production-costs/confirmed-references'}]);
 b.run('correctionAudit.corrections[2].status="CONFLICT";correctionAudit.corrections[2].reason="NEWER_OPERATOR_COST";');await b.run('loadConfirmedCostReferences()');assert.equal(b.run('el("confirmedCostReferencesTitle").textContent'),'Referências confirmadas em conferência');assert.match(b.run('el("confirmedCostReferencesRows").children.map(row=>row.textContent).join(" ")'),/alteração recente preservada/);assert.equal(b.run('productionCostsValues().inclusive_regular_cents'),1800);assert.deepEqual(b.json('productionCostsValues().composition_recipes'),recipes.composition_recipes);
 const html=adminBody(),block=html.slice(html.indexOf('<aside id="confirmedCostReferences"'),html.indexOf('</aside>',html.indexOf('<aside id="confirmedCostReferences"')));assert.doesNotMatch(block,/<button|confirmar novamente/);
 b.run('globalThis.apiAction=async()=>({...correctionAudit,access_token:"PRIVATE"});');assert.equal(await b.run('loadConfirmedCostReferences()'),false);assert.equal(b.run('el("confirmedCostReferencesTitle").textContent'),'Referências confirmadas em conferência');
});

test('itemized single costs include per-piece components while whole kits include their packaging once',()=>{
 const values={...base,mode:'itemized',base_regular_cents:1000,base_plus_cents:1500,components:[{id:'dtf',label:'Estampa',basis:'per_piece',amount_cents:250},{id:'pack',label:'Embalagem kit',basis:'per_kit',amount_cents:100}]},b=browser(values);
 assert.deepEqual(b.json('productionCostSingleValues(productionCostsState.values)'),[1250,1750]);assert.deepEqual(b.json('productionCostKitValues(productionCostsState.values)'),[2600,3100,3600]);
});

test('loading and saving current costs do not request thirty hidden audit versions; opening audit reads once per revision',async()=>{
 const b=browser({...base,inclusive_plus_cents:2140});b.run('globalThis.apiAction=async(path,body)=>({revision:body?8:7,values:body?body.values:productionCostsState.values,updated_at:"saved"});');
 await b.run('loadProductionCosts()');assert.deepEqual(b.json('apiCalls.map(row=>row.path)'),['production-costs']);
 await b.run('loadProductionCostsAudit()');await b.run('loadProductionCostsAudit()');assert.equal(b.run('apiCalls.filter(row=>row.path==="production-costs/audit").length'),1);
 b.run('el("costInclusivePlus").value="22,00";productionCostsChanged()');await b.run('saveProductionCosts()');assert.equal(b.run('apiCalls.filter(row=>row.path==="production-costs/audit").length'),1);
 await b.run('loadProductionCostsAudit()');assert.equal(b.run('apiCalls.filter(row=>row.path==="production-costs/audit").length'),2);assert.equal(b.run('productionCostsState.values.inclusive_plus_cents'),2200);
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
