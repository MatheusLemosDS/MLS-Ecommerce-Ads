import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {CLIENT} from '../src/admin-client.mjs';

const declaration=name=>{const match=new RegExp('^function '+name+'\\(','m').exec(CLIENT);assert.ok(match,name);const tail=CLIENT.slice(match.index),next=/\n(?:async )?function [A-Za-z_$]/.exec(tail);assert.ok(next,name);return tail.slice(0,next.index);};
function browser(){
 const context=vm.createContext();
 vm.runInContext(`
 class Element{constructor(tag,text=''){this.tag=tag;this.textContent=text;this.children=[];this.dataset={};this.hidden=false;this.open=false;this.isConnected=true;this.disabled=false;this._value='';}append(...rows){for(const row of rows){row.parentElement=this;this.children.push(row);}}insertBefore(row,before){row.parentElement=this;this.children.splice(this.children.indexOf(before),0,row);}get lastChild(){return this.children.at(-1);}get value(){return this._value;}set value(value){this._value=this.tag==='select'&&!this.children.some(row=>row.value===value)?'':value;}scrollIntoView(){}querySelector(){return null;}}
 const node=(tag,text,cls)=>{const value=new Element(tag,text);value.className=cls;return value;},text=value=>value.textContent+' '+value.children.map(text).join(' '),all=(value,tag)=>[...(value.tag===tag?[value]:[]),...value.children.flatMap(row=>all(row,tag))];
 const target=node('div'),el=()=>target,bindingDrafts=new Map(),productDetailsOpen=new Set(),productAdjustmentsOpen=new Set(),productUnitSelections=new Map();let bindingDraftSequence=0,controls=0,selectedRule=null,savedRule=false,chosenUnit='SINGLE_GARMENT';
 const productSellingUnit=()=>chosenUnit,automaticBinding=value=>value?.operator_confirmed===false,savedCustomCost=()=>null,variantReference=()=> 'Referência salva',variantCostReference=()=> 'Custo de produção por camiseta: R$ 15,90 · perfil cadastrado.',money=value=>'R$ '+(value/100).toFixed(2),costRuleAssignmentSaved=async()=>{},updateBindingSaveState=()=>{},updateProductDraftIndicators=()=>{},configureCustomCost=()=>{},renderProductAutomation=()=>node('section','Ajuste de composição');
 const saved=new Map(),currentBindingMap=()=>saved;
 globalThis.brazaCostRules={assignmentFor:()=>selectedRule,hasAssignment:()=>savedRule,assignmentControl:options=>{controls++;globalThis.lastRuleControl=options;return node('section','Regra de custo infantil');}};
 globalThis.brazaMonthDashboard={catalogMetadata:()=>({product_name:'Camiseta unissex Verde',variants:[{model_id:'1',model_name:'Verde / g',attributes:[{name:'Cor',value:'Verde'},{name:'Tamanho',value:'g'}]}]})};
 `+declaration('costRuleAssignmentControl')+declaration('renderProductVariantCard')+declaration('renderProductBrowserRow'),context);
 const run=code=>vm.runInContext(code,context);return {run};
}

test('an identified adult Verde/g shows its registered composition and cost without routing to the child rule selector',()=>{
 const b=browser();b.run("saved.set('101:1',{item_id:'101',model_id:'1',size:'G',selling_unit:'SINGLE_GARMENT',operator_confirmed:false});const card=renderProductVariantCard('101:1',{item_id:'101',model_id:'1',quantity:1,line_count:1,statuses:new Map()},saved);");
 assert.equal(b.run('controls'),0);assert.match(b.run('text(card)'),/Verde \/ g/);assert.match(b.run('text(card)'),/Camiseta avulsa · tamanho G/);assert.match(b.run('text(card)'),/15,90/);assert.doesNotMatch(b.run('text(card)'),/Regra de custo infantil/);
 assert.equal(b.run("all(card,'details').length"),1);assert.match(b.run("text(all(card,'details')[0].children[0])"),/Ajustar identificação/);assert.equal(b.run("all(card,'details')[0].open"),false);assert.equal(b.run("all(card,'select').every(select=>select.parentElement.parentElement.parentElement.tag==='details')"),true);
});

test('a genuine unavailable inherited rule opens its product scope for repair without silently assigning the child rule',()=>{
 const b=browser();b.run("savedRule=true;selectedRule={item_id:'101',model_id:null,rule_id:'regra-antiga',size:null};const card=renderProductVariantCard('101:1',{item_id:'101',model_id:'1',quantity:1,line_count:1,statuses:new Map()},saved);");
 assert.equal(b.run('controls'),1);assert.equal(b.run('lastRuleControl.model_id'),null);assert.equal(b.run("all(card,'select').length"),0);assert.match(b.run('text(card)'),/regra de custo/);
});

test('the main product action opens variations instead of the optional custom-rule editor',()=>{
 const b=browser();b.run("const row={itemId:'101',ready:true,unit:'SINGLE_GARMENT',quantity:1,mapped:1,models:[['101:1',{item_id:'101',model_id:'1',quantity:1,line_count:1,statuses:new Map()}]],customComplete:false,customLabels:[],hasDraft:false,manual:false,minCost:1590,maxCost:1590,costComplete:true};const card=renderProductBrowserRow(row);const action=all(card,'button').find(button=>button.textContent==='Conferir identificação');action.onclick();");
 assert.equal(b.run('controls'),0);assert.equal(b.run("all(card,'details').find(details=>details.className==='product-models').open"),true);assert.equal(b.run("all(card,'details').find(details=>details.className==='product-rule-costs').open"),false);
});

test('a current normalized composition outranks stale automatic product type while manual choices remain authoritative',()=>{
 const context=vm.createContext();vm.runInContext(`let bindings=[{item_id:'101',model_id:'1',selling_unit:'SINGLE_GARMENT',operator_confirmed:false}];const currentBindingMap=()=>new Map(bindings.map(row=>[row.model_id,row])),knownStoreProductUnit=()=> 'ONE_MALE_ONE_FEMALE_KIT',productUnitSelections=new Map();`+declaration('productSellingUnit'),context);
 assert.equal(vm.runInContext("productSellingUnit('101')",context),'SINGLE_GARMENT');vm.runInContext("productUnitSelections.set('101','ONE_MALE_ONE_FEMALE_KIT')",context);assert.equal(vm.runInContext("productSellingUnit('101')",context),'ONE_MALE_ONE_FEMALE_KIT');
 vm.runInContext("bindings=[{item_id:'101',model_id:'1',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}]",context);assert.equal(vm.runInContext("productSellingUnit('101')",context),'SINGLE_GARMENT');
});
