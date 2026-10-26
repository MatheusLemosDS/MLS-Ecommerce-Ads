import test from 'node:test';
import assert from 'node:assert/strict';
import {costRuleProductLearning} from '../src/cost-rule-learning.mjs';
import {COST_RULE_DEFAULTS} from '../src/cost-rules.mjs';

const values=assignments=>({...structuredClone(COST_RULE_DEFAULTS),...(assignments===undefined?{}:{assignments})});
const assigned=(model_id='0',size='4',changes={})=>({item_id:'101',model_id,rule_id:'camiseta-infantil',size,...changes});
const catalog=(name='Camiseta Política Estrela',sizes=['4','6','8','10','12','14','16'])=>({schema:'product_cost_catalog_v1',product_name:name,variants:sizes.map((size,index)=>({model_id:String(index),attributes:[{name:'Cor',value:'Vermelho'},{name:'Tamanho',value:size}]}))});
const none={rule_id:null,status:'NONE',reason:null,evidence_models:[],managed:false};

test('one confirmed child size teaches its product family without changing stored rules or creating assignments for siblings',()=>{
 const input=values([assigned()]),source=catalog(),before=structuredClone({input,source});
 assert.deepEqual(costRuleProductLearning(input,'101',source),{rule_id:'camiseta-infantil',status:'LEARNED',reason:'CONFIRMED_VARIATION_SIZE',evidence_models:['0'],managed:true});
 source.variants.push({model_id:'99',attributes:[{name:'Tamanho',value:'18'}]});
 assert.equal(costRuleProductLearning(input,'101',source).status,'LEARNED','an unsupported sibling size does not turn the confirmed rule into a wider size range');
 assert.deepEqual(input,before.input);assert.deepEqual(source.variants.slice(0,7),before.source.variants);assert.deepEqual(input.assignments,[assigned()]);
});

test('current named axes and normalized size evidence are required before propagating a correction',()=>{
 const input=values([assigned('0','4 anos')]),source=catalog();source.variants[0].attributes=[{name:'TÁMANHO',value:'4 ANOS'}];
 assert.equal(costRuleProductLearning(input,'101',source).status,'LEARNED');
 source.variants[0].attributes[0].value='6';let result=costRuleProductLearning(input,'101',source);assert.equal(result.status,'CONFLICT');assert.equal(result.reason,'CORRECTION_SIZE_MISMATCH');assert.equal(result.managed,false);
 source.variants[0].attributes=[{name:'Código',value:'4'}];assert.equal(costRuleProductLearning(input,'101',source).reason,'SIZE_AXIS_NOT_RECOGNIZED');
 source.variants[0].attributes=[{name:'Tamanho',value:'4'},{name:'Tamanho infantil',value:'4'}];assert.equal(costRuleProductLearning(input,'101',source).reason,'SIZE_AXIS_AMBIGUOUS');
});

test('all present correction anchors must agree, and different confirmed rules prevent inferred product scope',()=>{
 const input=values([assigned('0','4'),assigned('1','6')]),source=catalog();assert.deepEqual(costRuleProductLearning(input,'101',source).evidence_models,['0','1']);
 input.assignments[1].size='8';assert.equal(costRuleProductLearning(input,'101',source).status,'CONFLICT');
 input.assignments[1].rule_id='another-rule';const result=costRuleProductLearning(input,'101',source);assert.equal(result.status,'CONFLICT');assert.equal(result.rule_id,null);assert.equal(result.reason,'MULTIPLE_CONFIRMED_RULES');assert.equal(result.managed,false);
});

test('a missing catalogue or removed corrected model with no independent type evidence stays pending',()=>{
 const input=values([assigned()]);let result=costRuleProductLearning(input,'101',null);assert.equal(result.status,'PENDING');assert.equal(result.reason,'CATALOG_UNAVAILABLE');assert.equal(result.managed,false);
 const source=catalog('Produto Verde');source.variants.shift();result=costRuleProductLearning(input,'101',source);assert.equal(result.reason,'CORRECTED_MODEL_NOT_FOUND');assert.equal(result.managed,false);
 assert.equal(costRuleProductLearning(input,'102',catalog('Produto antigo')).status,'NONE');
});

test('removing the only corrected size does not suppress independent recognition of the remaining child sizes',()=>{
 const input=values([assigned('6','16')]),source=catalog();
 assert.equal(costRuleProductLearning(input,'101',source).status,'LEARNED');
 source.variants.pop();const before=structuredClone({input,source});
 assert.deepEqual(costRuleProductLearning(input,'101',source),{rule_id:'camiseta-infantil',status:'RECOGNIZED',reason:'CONFIRMED_CHILD_TYPE_AND_SIZES',evidence_models:[],managed:true});
 assert.deepEqual({input,source},before,'the removed correction remains historical evidence for its exact model ID');
 assert.equal(costRuleProductLearning(input,'101',source,{stale:true}).reason,'CATALOG_STALE');
 for(const title of ['Produto Verde','Camiseta Kit Casal','Calça Infantil'])assert.notEqual(costRuleProductLearning(input,'101',{...source,product_name:title}).status,'RECOGNIZED');
 for(const sizes of [['4','18'],['4','P'],[]])assert.notEqual(costRuleProductLearning(input,'101',catalog('Camiseta Verde',sizes)).status,'RECOGNIZED');
 const unknown=catalog();unknown.variants.pop();unknown.variants[0].attributes[1].name='Código';assert.notEqual(costRuleProductLearning(input,'101',unknown).status,'RECOGNIZED');
 const other=values([assigned('6','16',{rule_id:'different-rule'})]);assert.notEqual(costRuleProductLearning(other,'101',source).status,'RECOGNIZED');
 const disabled=values([assigned('6','16')]);disabled.rules[0].enabled=false;assert.notEqual(costRuleProductLearning(disabled,'101',source).status,'RECOGNIZED');
});

test('stale coherent evidence remains managed but cannot authorize a learned cost; disabled and removed rules stay pending',()=>{
 const input=values([assigned()]),source=catalog();let result=costRuleProductLearning(input,'101',source,{stale:true});assert.equal(result.status,'PENDING');assert.equal(result.reason,'CATALOG_STALE');assert.equal(result.managed,true);
 input.rules[0].enabled=false;result=costRuleProductLearning(input,'101',source);assert.equal(result.status,'PENDING');assert.equal(result.reason,'RULE_UNAVAILABLE');assert.equal(result.managed,true);
 input.rules=[];result=costRuleProductLearning(input,'101',source);assert.equal(result.status,'PENDING');assert.equal(result.reason,'RULE_UNAVAILABLE');assert.equal(result.managed,false);
});

test('explicit product scope wins over conflicting leaf evidence and preserves a disabled or stale product restriction',()=>{
 const input=values([assigned(null,null),assigned('0','4',{rule_id:'different-rule'})]);assert.deepEqual(costRuleProductLearning(input,'101',catalog()),{rule_id:'camiseta-infantil',status:'EXPLICIT',reason:'EXPLICIT_PRODUCT_RULE',evidence_models:[],managed:true});
 assert.equal(costRuleProductLearning(input,'101',catalog(),{stale:true}).status,'PENDING');input.rules[0].enabled=false;assert.equal(costRuleProductLearning(input,'101',catalog()).managed,true);
});

test('configured product exclusions stop learning and whole-unit rules need positive title evidence',()=>{
 let input=values([assigned()]);for(const title of ['Calça Infantil','Kit Camiseta Infantil','Short com Camiseta Infantil','Camiseta Infantil Casais','Camiseta Infantil Adultos','Camiseta Infantil Bonecas','Camiseta Infantil Pets'])assert.equal(costRuleProductLearning(input,'101',catalog(title)).reason,'PRODUCT_TYPE_CONFLICT');
 input.rules[0].options=[];input.rules[0].axis_names=[];input.assignments[0].size=null;
 assert.equal(costRuleProductLearning(input,'101',catalog('Produto antigo')).reason,'PRODUCT_TYPE_NOT_CONFIRMED');assert.equal(costRuleProductLearning(input,'101',catalog('Camiseta Infantil Estrela')).status,'LEARNED');
});

test('generic T-shirt names recognize only the existing confirmed child rule and actual allowed size options',()=>{
 for(const title of ['Camiseta Política Estrela','Camisa lançamentos','Blusas Unissex']){
  assert.deepEqual(costRuleProductLearning(values(),'101',catalog(title)),{rule_id:'camiseta-infantil',status:'RECOGNIZED',reason:'CONFIRMED_CHILD_TYPE_AND_SIZES',evidence_models:[],managed:true});
 }
 assert.equal(costRuleProductLearning(values(),'101',catalog('Camiseta Estrela',['4 anos','6 anos'])).status,'RECOGNIZED');
 const input=values();input.rules[0].unit_cost_cents=1490;assert.equal(costRuleProductLearning(input,'101',catalog()).rule_id,'camiseta-infantil','recognition references the rule, not a frozen price');
});

test('pants, kits, adult products and unknown product types never inherit the child rule from numeric sizes',()=>{
 for(const title of ['Calça Infantil','Calças Baggy','Short Infantil','Camiseta Kit Casal','Camiseta Kits Casais','Camiseta Conjunto','Camiseta Conjuntos','Camiseta Adulto','Camiseta Adultos','Camiseta Adulta','Camiseta para Boneca','Camiseta para Bonecas','Camiseta Pet','Camiseta Pets','Camiseta Moletom','Camiseta Moletons','Produto Verde'])assert.deepEqual(costRuleProductLearning(values(),'101',catalog(title)),none,title);
});

test('generic child fallback requires every model to have one size axis and at most a color or print axis',()=>{
 const input=values();
 for(const sizes of [['4','6','P'],['4','18'],['P','M'],[]])assert.deepEqual(costRuleProductLearning(input,'101',catalog('Camiseta Estrela',sizes)),none);
 for(const extra of ['Sexo','Tamanho Masculino','Código']){const source=catalog();source.variants[1].attributes[0].name=extra;assert.deepEqual(costRuleProductLearning(input,'101',source),none);}
 for(const extra of ['Cor','Estampa','Color','Print']){const source=catalog();source.variants.forEach(row=>row.attributes[0].name=extra);assert.equal(costRuleProductLearning(input,'101',source).status,'RECOGNIZED');}
 const source=catalog();source.variants[0].attributes=[{name:'Tamanho',value:'4'},{name:'Tamanho infantil',value:'4'}];assert.deepEqual(costRuleProductLearning(input,'101',source),none);
});

test('editing, removing or disabling the confirmed child rule cannot leave an invented fallback active',()=>{
 const input=values();input.rules[0].enabled=false;assert.deepEqual(costRuleProductLearning(input,'101',catalog()),none);
 input.rules[0].enabled=true;input.rules[0].options=['4','18'];assert.deepEqual(costRuleProductLearning(input,'101',catalog()),none);
 input.rules[0].options=['4','6'];input.rules[0].name_patterns=['camiseta'];assert.deepEqual(costRuleProductLearning(input,'101',catalog('Camiseta Estrela',['4','6'])),none);
 input.rules[0].name_patterns=['camiseta infantil'];input.rules[0].id='other-child-rule';assert.deepEqual(costRuleProductLearning(input,'101',catalog('Camiseta Estrela',['4','6'])),none);
 assert.deepEqual(costRuleProductLearning(values(),'101',catalog(),{stale:true}),{rule_id:'camiseta-infantil',status:'PENDING',reason:'CATALOG_STALE',evidence_models:[],managed:true});
});

test('malformed data and accessors fail without invocation and returned evidence never aliases corrections',()=>{
 let calls=0;const inputs=[values(),values(),values()];Object.defineProperty(inputs[0],'rules',{get(){calls++;return [];},enumerable:true});Object.defineProperty(inputs[1].rules[0],'options',{get(){calls++;return ['4'];},enumerable:true});inputs[2].assignments=[assigned()];Object.defineProperty(inputs[2].assignments[0],'size',{get(){calls++;return '4';},enumerable:true});
 for(const input of inputs)assert.deepEqual(costRuleProductLearning(input,'101',catalog()),none);const source=catalog();Object.defineProperty(source,'variants',{get(){calls++;return [];},enumerable:true});assert.deepEqual(costRuleProductLearning(values(),'101',source),none);
 const options={};Object.defineProperty(options,'stale',{get(){calls++;return true;},enumerable:true});assert.deepEqual(costRuleProductLearning(values(),'101',catalog(),options),none);assert.equal(calls,0);
 for(const input of [null,{},[],{rules:[{}]},values([assigned('0','4'),assigned('0','4')])])assert.deepEqual(costRuleProductLearning(input,'101',catalog()),none);
 const input=values([assigned()]),result=costRuleProductLearning(input,'101',catalog());result.evidence_models.push('999');assert.equal(input.assignments.length,1);assert.deepEqual(costRuleProductLearning(input,'101',catalog()).evidence_models,['0']);
});
