import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {COST_RULE_CLIENT,costRulesBody} from '../src/cost-rules-view.mjs';
import {COST_RULE_DEFAULTS,validateCostRules} from '../src/cost-rules.mjs';

function browser(responder){
 class Element{
  constructor(tag='div',text=''){this.tag=tag;this.textContent=text;this.children=[];this.dataset={};this.value='';this.checked=false;this.disabled=false;this.parentElement=null;}
  append(...values){for(const row of values){this.children.push(row);row.parentElement=this;}}
  replaceChildren(...values){this.children=[];this.append(...values);}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(row=>row!==this);}
  querySelector(selector){const field=selector.match(/data-cost-rule-field="([^"]+)"/)?.[1];const find=row=>row.dataset.costRuleField===field?row:row.children.map(find).find(Boolean);return field?find(this):null;}
 }
 const elements=new Map([...costRulesBody().matchAll(/id="([^"]+)"/g)].map(match=>[match[1],new Element()])),calls=[];
 const context=vm.createContext({document:{getElementById:id=>elements.get(id)||null,createElement:tag=>new Element(tag)},crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'}});
 new vm.Script(COST_RULE_CLIENT).runInContext(context);const workspace=context.brazaCostRules;
 const api=async(path,body)=>{const request=body===undefined?undefined:JSON.parse(JSON.stringify(body));calls.push({path,body:request});return responder(path,request);};
 const el=name=>elements.get('costRules'+name),field=(key,index=0)=>el('Rows').children[index].querySelector('[data-cost-rule-field="'+key+'"]');
 const priceField=(id='camiseta-infantil')=>{const find=row=>row.dataset.costRulePrice===id?row:row.children.map(find).find(Boolean);return find(el('Summary'));};
 return {workspace,api,el,field,priceField,calls};
}
const state=(revision=1,values=structuredClone(COST_RULE_DEFAULTS))=>({revision,values,updated_at:'2026-10-24T12:00:00Z'});
const findAssignment=(root,key,kind='field')=>{const dataset=kind==='field'?'costRuleAssignmentField':'costRuleAssignmentAction';const walk=row=>row.dataset[dataset]===key?row:row.children.map(walk).find(Boolean);return walk(root);};
const widgetText=root=>root.textContent+' '+root.children.map(widgetText).join(' ');
const selectChild=(root,size='8')=>{const type=findAssignment(root,'rule');type.value='camiseta-infantil';type.onchange();const option=findAssignment(root,'size');option.value=size;option.onchange();};
const learning=(changes={})=>({item_id:'101',rule_id:'camiseta-infantil',rule_label:'Camiseta infantil',status:'LEARNED',reason:'CORRECTION_AND_CATALOG',evidence_count:1,matched_variants:7,pending_variants:0,checked_at:Math.floor(Date.now()/1000),...changes});

test('child summary uses the saved rule price and sizes without resetting an edited saved value to the original seed',async()=>{
 const values=structuredClone(COST_RULE_DEFAULTS);values.rules[0].unit_cost_cents=1425;const b=browser(async()=>state(5,values));await b.workspace.start({api:b.api});
 assert.match(widgetText(b.el('Summary')),/Camiseta infantil.*14,25.*4, 6, 8, 10, 12, 14, 16/);assert.doesNotMatch(widgetText(b.el('Summary')),/12,50/);assert.match(widgetText(b.el('Summary')),/versão salva 5/);
 b.field('amount').value='15,00';b.field('amount').oninput();assert.match(widgetText(b.el('Summary')),/14,25/);assert.doesNotMatch(widgetText(b.el('Summary')),/15,00/);
});

test('confirmed child size two and its current saved price appear dynamically without requiring an adult binding',async()=>{
 const values=structuredClone(COST_RULE_DEFAULTS);values.rules[0].options=['2',...values.rules[0].options];values.rules[0].unit_cost_cents=1325;let current=state(8,values);const b=browser(async(path,body)=>{if(path==='cost-rules/assignments')current=state(9,{...values,assignments:body.assignments});return current;});await b.workspace.start({api:b.api});const widget=b.workspace.assignmentControl({item_id:'101',model_id:'0'});selectChild(widget,'2');assert.match(widgetText(b.el('Summary')),/13,25.*2, 4, 6, 8, 10, 12, 14, 16/);assert.equal(findAssignment(widget,'save','action').disabled,false);await findAssignment(widget,'save','action').onclick();assert.equal(b.calls.find(row=>row.path==='cost-rules/assignments').body.assignments[0].size,'2');assert.ok(!b.calls.some(row=>row.path.includes('variant-bindings')));
});

test('a catalogue mismatch rejects an infantil rule on an adult product with a useful message while preserving the choices and saved cost',async()=>{
 const b=browser(async(path)=>{if(path==='cost-rules/assignments')throw Object.assign(Error('PRIVATE_CATALOG_TRACE'),{status:409,apiCode:'COST_RULE_ASSIGNMENT_CATALOG_CONFLICT'});return state();});await b.workspace.start({api:b.api});let saved=false;const widget=b.workspace.assignmentControl({item_id:'101',model_id:null,onSaved:()=>{saved=true;}}),type=findAssignment(widget,'rule');type.value='camiseta-infantil';type.onchange();await findAssignment(widget,'save','action').onclick();assert.match(widgetText(widget),/não corresponde aos tamanhos deste produto.*associação não foi salva.*custo anterior foi preservado/);assert.doesNotMatch(widgetText(widget),/PRIVATE|mudaram em outra sessão/);assert.equal(type.value,'camiseta-infantil');assert.equal(findAssignment(widget,'save','action').disabled,false);assert.equal(saved,false);assert.equal(b.workspace.hasAssignment('101'),false);assert.equal(b.calls.filter(row=>row.path==='cost-rules/sync').length,0);
});

test('the child rule loads as R$12.50 and seven sizes, while other product types can be added without touching manual profiles',async()=>{
 const b=browser(async()=>state());await b.workspace.start({api:b.api});assert.equal(b.field('amount').value,'12.50');assert.equal(b.field('options').value,'4; 6; 8; 10; 12; 14; 16');assert.equal(b.el('Save').disabled,true);
 b.el('Add').onclick();assert.equal(b.el('Rows').children.length,2);assert.equal(b.el('Save').disabled,false);assert.equal(b.field('amount',1).value,'');assert.equal(b.field('options',1).value,'');
 assert.doesNotMatch(COST_RULE_CLIENT,/innerHTML/);assert.match(costRulesBody(),/vinculados manualmente/);
});
test('one save serializes complete reusable rules in integer cents with the saved revision and preserves newer edits',async()=>{
 let finish;const b=browser(async(path,body)=>path==='cost-rules'&&body?new Promise(resolve=>{finish=()=>resolve(state(2,body.values));}):state());await b.workspace.start({api:b.api});
 b.field('amount').value='13,75';b.field('amount').oninput();const saving=b.el('Form').onsubmit({preventDefault(){}});await Promise.resolve();
 assert.equal(b.calls.at(-1).body.revision,1);assert.equal(b.calls.at(-1).body.values.rules[0].unit_cost_cents,1375);validateCostRules(b.calls.at(-1).body.values);
 b.field('amount').value='14,00';b.field('amount').oninput();finish();await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(b.field('amount').value,'14,00');
});
test('zero prices and incomplete type identity never reach the save API',async()=>{
 const b=browser(async()=>state());await b.workspace.start({api:b.api});const before=b.calls.length;
 b.field('amount').value='0';b.field('amount').oninput();await b.el('Form').onsubmit({preventDefault(){}});assert.equal(b.calls.length,before);assert.match(b.el('Status').textContent,/0,01/);
 b.field('amount').value='12.50';b.field('name_patterns').value='';await b.el('Form').onsubmit({preventDefault(){}});assert.equal(b.calls.length,before);assert.match(b.el('Status').textContent,/identificação/);
});
test('a stale rules edit cannot overwrite a newer saved rule and keeps its unsaved values visible',async()=>{
 const b=browser(async(path,body)=>{if(body)throw Object.assign(Error('conflict'),{status:409});return state();});await b.workspace.start({api:b.api});b.field('amount').value='15';b.field('amount').oninput();
 b.el('Form').onsubmit({preventDefault(){}});for(let i=0;i<8;i++)await Promise.resolve();assert.equal(b.field('amount').value,'15');assert.equal(b.el('Save').disabled,true);assert.match(b.el('Status').textContent,/rascunhos foram preservados/);
});
test('catalogue synchronization batches all product IDs in threes and cannot mutate costs through order or buyer fields',async()=>{
 const b=browser(async(path)=>path==='cost-rules'?state():{processed:[],revision:1,matched_variants:[{item_id:'100',model_id:'0'}]});await b.workspace.start({api:b.api});
 await b.workspace.syncCandidates(Array.from({length:7},(_,i)=>({item_id:String(100+i),model_id:'0',buyer:'PRIVATE'})));
 const batches=b.calls.filter(row=>row.path.endsWith('/sync'));assert.deepEqual(batches.map(row=>row.body.item_ids.length),[3,3,1]);assert.ok(batches.every(row=>Object.keys(row.body).sort().join(',')==='force,item_ids'&&row.body.force===false));assert.ok(!JSON.stringify(batches).includes('PRIVATE'));
 assert.equal(b.workspace.isMapped('100','0'),true);assert.equal(b.workspace.isMapped('101','0'),false);
});

test('a child variation selects sizes4to16 and saves a rule reference with R$12.50 without creating an adult binding',async()=>{
 let saved=state(),callback=null;const b=browser(async(path,body)=>{if(path==='cost-rules/assignments'){saved=state(2,{...saved.values,assignments:body.assignments});return saved;}return saved;});await b.workspace.start({api:b.api});
 const widget=b.workspace.assignmentControl({item_id:'101',model_id:'189628289639',onSaved:value=>{callback=value;}});selectChild(widget);
 assert.deepEqual(findAssignment(widget,'size').children.map(row=>row.value),['','4','6','8','10','12','14','16']);assert.match(widgetText(widget),/12,50/);
 assert.equal(findAssignment(widget,'save','action').disabled,false);await findAssignment(widget,'save','action').onclick();
 assert.deepEqual(b.calls.find(row=>row.path==='cost-rules/assignments'),{path:'cost-rules/assignments',body:{revision:1,assignments:[{item_id:'101',model_id:'189628289639',rule_id:'camiseta-infantil',size:'8'}]}});assert.deepEqual(b.calls.at(-1),{path:'cost-rules/sync',body:{item_ids:['101'],force:true}});
 assert.deepEqual(JSON.parse(JSON.stringify(callback)),{item_id:'101',model_id:'189628289639'});assert.equal(b.workspace.hasAssignment('101','189628289639'),true);assert.ok(!b.calls.some(row=>row.path.includes('variant-bindings')));assert.equal(b.calls.filter(row=>row.path==='cost-rules/sync').length,1);
});

test('a product rule is applied once across its catalogue and preserves the classification when metadata is unavailable',async()=>{
 let current=state(),saved=false;const b=browser(async(path,body)=>{if(path==='cost-rules/assignments'){current=state(2,{...current.values,assignments:body.assignments});return current;}if(path==='cost-rules/sync')throw Error('source unavailable');return current;});await b.workspace.start({api:b.api});
 const widget=b.workspace.assignmentControl({item_id:'101',onSaved:()=>{saved=true;}});const type=findAssignment(widget,'rule');type.value='camiseta-infantil';type.onchange();await findAssignment(widget,'save','action').onclick();
 const assignment=b.calls.find(row=>row.path==='cost-rules/assignments');assert.deepEqual(assignment.body.assignments,[{item_id:'101',model_id:null,rule_id:'camiseta-infantil',size:null}]);assert.deepEqual(b.calls.at(-1),{path:'cost-rules/sync',body:{item_ids:['101'],force:true}});assert.equal(saved,true);assert.equal(b.workspace.hasAssignment('101','99'),true);assert.match(widgetText(widget),/Tipo salvo.*aguarda o catálogo/);
});

test('saving a manual child identification preserves unrelated rule drafts and subsequent rule save retains the assignment',async()=>{
 let current=state();const b=browser(async(path,body)=>{if(path==='cost-rules/assignments')current=state(2,{...current.values,assignments:body.assignments});else if(path==='cost-rules'&&body)current=state(3,body.values);return current;});await b.workspace.start({api:b.api});
 b.field('amount').value='14,25';b.field('amount').oninput();const widget=b.workspace.assignmentControl({item_id:'101',model_id:'1'});selectChild(widget,'4');await findAssignment(widget,'save','action').onclick();assert.equal(b.field('amount').value,'14,25');assert.equal(b.el('Save').disabled,false);
 await b.el('Form').onsubmit({preventDefault(){}});const saved=b.calls.at(-1);assert.equal(saved.path,'cost-rules');assert.equal(saved.body.revision,2);assert.equal(saved.body.values.rules[0].unit_cost_cents,1425);assert.deepEqual(saved.body.values.assignments,[{item_id:'101',model_id:'1',rule_id:'camiseta-infantil',size:'4'}]);validateCostRules(saved.body.values);
});

test('a changed rule blocks a stale child assignment, preserves selections and reloads the current price before retry',async()=>{
 let current=state(),conflict=true;const b=browser(async(path,body)=>{if(path==='cost-rules/assignments'){if(conflict)throw Object.assign(Error('stale'),{status:409});current=state(3,{...current.values,assignments:body.assignments});}return current;});await b.workspace.start({api:b.api});const widget=b.workspace.assignmentControl({item_id:'101',model_id:'1'});selectChild(widget,'16');
 await findAssignment(widget,'save','action').onclick();assert.equal(findAssignment(widget,'size').value,'16');assert.equal(findAssignment(widget,'save','action').disabled,true);assert.match(widgetText(widget),/escolhas foram preservadas/);
 current=state(2,{rules:[{...COST_RULE_DEFAULTS.rules[0],unit_cost_cents:1375}]});await findAssignment(widget,'reload','action').onclick();assert.equal(findAssignment(widget,'size').value,'16');assert.match(widgetText(widget),/13,75/);conflict=false;await findAssignment(widget,'save','action').onclick();const assignment=b.calls.filter(row=>row.path==='cost-rules/assignments').at(-1);assert.equal(assignment.body.revision,2);assert.equal(assignment.body.assignments[0].size,'16');
});

test('a missing size cannot be saved and removing an explicit assignment does not remove another scope',async()=>{
 let current=state(2,{...structuredClone(COST_RULE_DEFAULTS),assignments:[{item_id:'101',model_id:null,rule_id:'camiseta-infantil',size:null},{item_id:'101',model_id:'1',rule_id:'camiseta-infantil',size:'4'}]});
 const b=browser(async(path,body)=>{if(path==='cost-rules/assignments'){current=state(3,{...current.values,assignments:current.values.assignments.filter(row=>row.model_id!==body.assignments[0].model_id)});}return current;});await b.workspace.start({api:b.api});const widget=b.workspace.assignmentControl({item_id:'101',model_id:'1'}),size=findAssignment(widget,'size');size.value='';size.onchange();assert.equal(findAssignment(widget,'save','action').disabled,true);const before=b.calls.length;await findAssignment(widget,'save','action').onclick();assert.equal(b.calls.length,before);
 await findAssignment(widget,'remove','action').onclick();assert.deepEqual(b.calls.at(-1).body.assignments,[{item_id:'101',model_id:'1',rule_id:null,size:null}]);assert.equal(b.workspace.assignmentFor('101','1').model_id,null);
});

test('product controls recreated during a saved assignment are enabled after the shared save completes',async()=>{
 let current=state(),replacement;const b=browser(async(path,body)=>{if(path==='cost-rules/assignments')current=state(2,{...current.values,assignments:body.assignments});return current;});await b.workspace.start({api:b.api});
 const widget=b.workspace.assignmentControl({item_id:'101',model_id:'1',onSaved:()=>{replacement=b.workspace.assignmentControl({item_id:'101',model_id:'1'});assert.equal(findAssignment(replacement,'save','action').disabled,true);}});selectChild(widget,'6');await findAssignment(widget,'save','action').onclick();
 assert.equal(findAssignment(replacement,'size').value,'6');assert.equal(findAssignment(replacement,'save','action').disabled,false);assert.equal(findAssignment(replacement,'remove','action').disabled,false);
});

test('learning notes distinguish correction-based learning from confirmed child type recognition and return detached metadata',async()=>{
 const first=learning(),second=learning({item_id:'102',status:'RECOGNIZED',reason:'CONFIRMED_CHILD_TYPE_AND_SIZES',evidence_count:0,pending_variants:1,matched_variants:6});
 const b=browser(async path=>path==='cost-rules'?state():{processed:['101','102'],revision:1,matched_variants:[],learning:[first,second]});await b.workspace.start({api:b.api});
 assert.equal(await b.workspace.syncCandidates([{item_id:'101'},{item_id:'102'}]),true);assert.match(widgetText(b.workspace.learningNote('101')),/Aprendido com sua correção.*7 variação/);assert.match(widgetText(b.workspace.learningNote('102')),/Reconhecido pelo tipo e pelos tamanhos infantis.*6 variação.*1 aguardando/);
 first.rule_label='ALTERADO';const copy=b.workspace.learningFor('101');copy.matched_variants=0;assert.equal(b.workspace.learningFor('101').rule_label,'Camiseta infantil');assert.equal(b.workspace.learningFor('101').matched_variants,7);assert.equal(b.workspace.learningFor('103'),null);
});

test('established learning survives catalogue age, conflicts remain pending and legacy responses clear old notes',async()=>{
 let current={learning:[learning({checked_at:Math.floor(Date.now()/1000)-901})]};const b=browser(async path=>path==='cost-rules'?state():current);await b.workspace.start({api:b.api});
 await b.workspace.syncCandidates([{item_id:'101'}]);assert.equal(b.workspace.learningFor('101').status,'LEARNED');assert.equal(b.workspace.learningFor('101').matched_variants,7);assert.match(widgetText(b.workspace.learningNote('101')),/Aprendido/);
 current={learning:[learning({status:'CONFLICT',reason:'CONFLICTING_CORRECTIONS',matched_variants:1,pending_variants:6})]};await b.workspace.syncCandidates([{item_id:'101'}]);assert.match(widgetText(b.workspace.learningNote('101')),/em revisão.*preservadas/);assert.doesNotMatch(widgetText(b.workspace.learningNote('101')),/Aprendido/);
 current={processed:['101'],revision:1};assert.equal(await b.workspace.syncCandidates([{item_id:'101'}]),true);assert.equal(b.workspace.learningFor('101'),null);assert.equal(b.workspace.learningNote('101'),null);
});

test('learning identity, counts, status, private extras and accessors are rejected before they can create a product note',async()=>{
 let response;const b=browser(async path=>path==='cost-rules'?state():response);await b.workspace.start({api:b.api});
 for(const rows of [[learning({item_id:'103'})],[learning(),learning()],[learning({status:'AUTONOMOUS'})],[{...learning(),access_token:'PRIVATE'}],[learning({matched_variants:1001})],[learning({rule_id:null})],[learning({reason:'PRIVATE\nTEXT'})]]){
  response={learning:rows};assert.equal(await b.workspace.syncCandidates([{item_id:'101'}]),false);assert.equal(b.workspace.learningNote('101'),null);
 }
 let calls=0;response={};Object.defineProperty(response,'learning',{get(){calls++;return [learning()];},enumerable:true});assert.equal(await b.workspace.syncCandidates([{item_id:'101'}]),false);assert.equal(calls,0);
 const row=learning();Object.defineProperty(row,'rule_label',{get(){calls++;return 'PRIVATE';},enumerable:true});response={learning:[row]};assert.equal(await b.workspace.syncCandidates([{item_id:'101'}]),false);assert.equal(calls,0);assert.equal(b.workspace.learningNote('101'),null);
});

test('a source failure after an individual child correction preserves the saved cost and explains that sibling discovery is pending',async()=>{
 let current=state(),saved=false;const b=browser(async(path,body)=>{if(path==='cost-rules/assignments'){current=state(2,{...current.values,assignments:body.assignments});return current;}if(path==='cost-rules/sync')throw Error('PRIVATE_PROVIDER_FAILURE');return current;});await b.workspace.start({api:b.api});
 const widget=b.workspace.assignmentControl({item_id:'101',model_id:'1',onSaved:()=>{saved=true;}});selectChild(widget,'4');await findAssignment(widget,'save','action').onclick();assert.equal(saved,true);assert.equal(b.workspace.assignmentFor('101','1').size,'4');assert.match(widgetText(widget),/Tamanho salvo.*outras variações aguarda o catálogo.*custo desta variação foi preservado/);assert.doesNotMatch(widgetText(widget),/PRIVATE_PROVIDER_FAILURE/);assert.equal(b.workspace.learningNote('101'),null);assert.ok(!b.calls.some(row=>row.path.includes('variant-bindings')));
});

test('an unavailable saved rule is repairable in its own scope and never selects the only available child rule automatically',async()=>{
 let current=state(2,{...structuredClone(COST_RULE_DEFAULTS),assignments:[{item_id:'101',model_id:null,rule_id:'regra-antiga',size:null}]});
 const b=browser(async(path,body)=>{if(path==='cost-rules/assignments')current=state(3,{...current.values,assignments:[]});return current;});await b.workspace.start({api:b.api});
 const widget=b.workspace.assignmentControl({item_id:'101'}),type=findAssignment(widget,'rule');
 assert.equal(type.value,'regra-antiga');assert.equal(type.children.find(option=>option.value==='regra-antiga').disabled,true);assert.equal(findAssignment(widget,'save','action').disabled,true);assert.equal(findAssignment(widget,'remove','action').hidden,false);assert.match(widgetText(widget),/Recarregue os tipos ou retire essa associação/);assert.doesNotMatch(widgetText(widget),/Para infantil, escolha/);
 await findAssignment(widget,'remove','action').onclick();assert.deepEqual(b.calls.find(call=>call.path==='cost-rules/assignments').body.assignments,[{item_id:'101',model_id:null,rule_id:null,size:null}]);assert.equal(type.value,'');assert.equal(b.workspace.hasAssignment('101'),false);
});

test('simple cost values are visible before advanced conditions and product controls link to the real editor',async()=>{
 const html=costRulesBody();assert.equal([...html.matchAll(/id="costRulesPriceSave"/g)].length,1);assert.ok(html.indexOf('id="costRulesPriceForm"')<html.indexOf('<details class="cost-rule-editor">'));assert.doesNotMatch(html,/<details[^>]*\bopen\b/);
 assert.match(html,/todos os produtos que usam esta regra.*referência dos períodos de vendas ao abrir ou recalcular.*Exceções manuais têm prioridade.*fabricação antigos exigem uma correção histórica explícita/);
 const b=browser(async()=>state());await b.workspace.start({api:b.api});assert.equal(b.priceField().value,'12.50');assert.match(widgetText(b.el('Summary')),/12,50 salvo por unidade vendida/);
 const variation=b.workspace.assignmentControl({item_id:'101',model_id:'1'});selectChild(variation,'4');assert.equal(findAssignment(variation,'save','action').textContent,'Salvar tipo e tamanho');
 const link=variation.children.flatMap(row=>row.children).find(row=>row.tag==='a');assert.ok(link);assert.equal(link.textContent,'Alterar valor deste tipo');assert.equal(link.href,'/admin?tab=margins#costRules');assert.equal(link.hidden,false);
 const product=b.workspace.assignmentControl({item_id:'101'});assert.equal(findAssignment(product,'save','action').textContent,'Aplicar tipo a todas as variações');
});

test('amount-only save updates R$13.50 with the exact revision and preserves every rule condition and assignment',async()=>{
 const values=structuredClone(COST_RULE_DEFAULTS);values.rules[0].options.unshift('2');values.rules.push({...values.rules[0],id:'camiseta-basica',label:'Camiseta básica',unit_cost_cents:1590,name_patterns:['camiseta basica'],options:['P','M','G','GG']});values.assignments=[{item_id:'101',model_id:'1',rule_id:'camiseta-infantil',size:'2'}];let current=state(7,values),recalcs=0;
 const b=browser(async(path,body)=>{if(body){assert.equal(path,'cost-rules');current=state(8,body.values);}return current;});await b.workspace.start({api:b.api,onChanged:()=>{recalcs++;}});
 b.priceField().value='13,50';b.priceField().oninput();assert.equal(b.el('PriceSave').disabled,false);assert.match(widgetText(b.el('Summary')),/12,50 salvo/,'the saved reference does not claim a draft has persisted');
 await b.el('PriceForm').onsubmit({preventDefault(){}});const saved=b.calls.find(row=>row.body);assert.equal(saved.body.revision,7);const expected=structuredClone(values);expected.rules[0].unit_cost_cents=1350;assert.deepEqual(saved.body.values,expected);assert.deepEqual(values.assignments,[{item_id:'101',model_id:'1',rule_id:'camiseta-infantil',size:'2'}]);validateCostRules(saved.body.values);
 assert.equal(recalcs,1);assert.equal(b.calls.length,2);assert.ok(!b.calls.some(row=>row.path.endsWith('/sync')));assert.equal(b.priceField().value,'13.50');assert.equal(b.field('amount').value,'13.50','advanced editing starts from the newly saved price');assert.match(b.el('PriceStatus').textContent,/Valores salvos.*versão 8/);assert.match(b.el('Status').textContent,/Regras salvas.*versão 8.*Condições e associações preservadas/);assert.match(widgetText(b.el('Summary')),/13,50 salvo/);assert.equal(b.el('PriceSave').disabled,true);
});

test('simple prices accept dot or comma decimals and reject invalid amounts before any write',async()=>{
 for(const raw of ['0','-1','1.234','1e2','13,500','10000.01','R$ 13,50','','1,2,3']){
  const b=browser(async()=>state());await b.workspace.start({api:b.api});b.priceField().value=raw;b.priceField().oninput();await b.el('PriceForm').onsubmit({preventDefault(){}});assert.equal(b.calls.length,1,raw);assert.match(b.el('PriceStatus').textContent,/duas casas|0,01/);
 }
 for(const [raw,cents] of [['13.50',1350],['13,50',1350],['10000.00',1000000]]){
  const b=browser(async(path,body)=>body?state(2,body.values):state());await b.workspace.start({api:b.api});b.priceField().value=raw;b.priceField().oninput();await b.el('PriceForm').onsubmit({preventDefault(){}});assert.equal(b.calls.at(-1).body.values.rules[0].unit_cost_cents,cents);
 }
});

test('a simple-price conflict preserves the draft and requires explicit reload before another save',async()=>{
 let current=state(),posts=0;const b=browser(async(path,body)=>{if(body){posts++;throw Object.assign(Error('changed'),{status:409});}return current;});await b.workspace.start({api:b.api});b.priceField().value='13,50';b.priceField().oninput();await b.el('PriceForm').onsubmit({preventDefault(){}});
 assert.equal(b.priceField().value,'13,50');assert.equal(b.el('PriceSave').disabled,true);assert.match(b.el('PriceStatus').textContent,/valores foram preservados.*Carregar valores salvos/);await b.el('PriceForm').onsubmit({preventDefault(){}});assert.equal(posts,1);
 current=state(2,{rules:[{...COST_RULE_DEFAULTS.rules[0],unit_cost_cents:1275}]});await b.el('PriceReload').onclick();assert.equal(b.priceField().value,'12.75');assert.equal(b.field('amount').value,'12.75');assert.equal(b.el('PriceSave').disabled,true);
});

test('advanced drafts block amount-only saving and cannot be overwritten by it',async()=>{
 let current=state();const b=browser(async(path,body)=>{if(body)current=state(2,body.values);return current;});await b.workspace.start({api:b.api});b.priceField().value='13,50';b.priceField().oninput();b.field('label').value='Infantil especial';b.field('label').oninput();assert.equal(b.el('PriceSave').disabled,true);await b.el('PriceForm').onsubmit({preventDefault(){}});assert.equal(b.calls.length,1);assert.equal(b.field('label').value,'Infantil especial');assert.equal(b.priceField().value,'13,50');
 await b.el('Form').onsubmit({preventDefault(){}});assert.equal(b.calls.at(-1).body.values.rules[0].label,'Infantil especial');assert.equal(b.calls.at(-1).body.values.rules[0].unit_cost_cents,1250,'advanced save never silently includes an unsaved simple-price draft');assert.equal(b.priceField().value,'13,50');assert.equal(b.el('PriceSave').disabled,true,'the old simple draft cannot silently rebase to the advanced save revision');assert.match(b.el('PriceStatus').textContent,/versão salva mudou.*preservados/);
});

test('an assignment in flight blocks simple save and its new revision cannot silently rebase the price draft',async()=>{
 let current=state(),finish;const b=browser(async(path,body)=>{if(path==='cost-rules/assignments')return new Promise(resolve=>{finish=()=>{current=state(2,{...current.values,assignments:body.assignments});resolve(current);};});if(path.endsWith('/sync'))return {processed:['101'],matched_variants:[]};return current;});await b.workspace.start({api:b.api});b.priceField().value='13,50';b.priceField().oninput();const control=b.workspace.assignmentControl({item_id:'101',model_id:'1'});selectChild(control,'4');const work=findAssignment(control,'save','action').onclick();await Promise.resolve();assert.equal(b.el('PriceSave').disabled,true);await b.el('PriceForm').onsubmit({preventDefault(){}});assert.equal(b.calls.filter(row=>row.path==='cost-rules'&&row.body).length,0);
 finish();await work;assert.equal(b.priceField().value,'13,50');assert.equal(b.el('PriceSave').disabled,true);assert.match(b.el('PriceStatus').textContent,/versão salva mudou.*preservados/);await b.el('PriceForm').onsubmit({preventDefault(){}});assert.equal(b.calls.filter(row=>row.path==='cost-rules'&&row.body).length,0);
});

test('simple save is single-flight and preserves an advanced draft created while the response is pending',async()=>{
 let finish,recalcs=0;const b=browser(async(path,body)=>body?new Promise(resolve=>{finish=()=>resolve(state(2,body.values));}):state());await b.workspace.start({api:b.api,onChanged:()=>{recalcs++;}});b.priceField().value='13,50';b.priceField().oninput();const work=b.el('PriceForm').onsubmit({preventDefault(){}});await Promise.resolve();await b.el('PriceForm').onsubmit({preventDefault(){}});assert.equal(b.calls.filter(row=>row.body).length,1);
 b.field('label').value='Meu rascunho infantil';b.field('label').oninput();finish();await work;assert.equal(b.field('label').value,'Meu rascunho infantil');assert.equal(b.field('amount').value,'12.50','preserved advanced fields are not rewritten by the quick response');assert.equal(b.el('Save').disabled,true,'review is required before an old advanced amount can replace the newly saved price');assert.equal(b.priceField().value,'13.50');assert.equal(recalcs,1);assert.match(b.el('Status').textContent,/rascunho avançado foi preservado.*revisar/);
});

test('a recalculation failure after persistence reports a saved value and cannot cause a duplicate cost write',async()=>{
 let recalcs=0;const b=browser(async(path,body)=>body?state(2,body.values):state());await b.workspace.start({api:b.api,onChanged:()=>{recalcs++;throw Error('recalculation unavailable');}});b.priceField().value='13,50';b.priceField().oninput();await b.el('PriceForm').onsubmit({preventDefault(){}});assert.match(b.el('PriceStatus').textContent,/Valores salvos.*Reabra o período/);assert.equal(b.priceField().value,'13.50');assert.equal(b.el('PriceSave').disabled,true);await b.el('PriceForm').onsubmit({preventDefault(){}});assert.equal(b.calls.filter(row=>row.body).length,1);assert.equal(recalcs,1);
});

test('refreshed price inputs remain disabled until the cached recalculation has finished',async()=>{
 let finish,recalculating;const b=browser(async(path,body)=>body?state(2,body.values):state());await b.workspace.start({api:b.api,onChanged:()=>{recalculating=true;return new Promise(resolve=>{finish=resolve;});}});b.priceField().value='13,50';b.priceField().oninput();const work=b.el('PriceForm').onsubmit({preventDefault(){}});for(let n=0;n<8&&!recalculating;n++)await Promise.resolve();assert.equal(recalculating,true);assert.equal(b.priceField().value,'13.50');assert.equal(b.priceField().disabled,true,'newly rendered saved fields keep the shared write lock while recalculation is pending');assert.equal(b.el('PriceSave').disabled,true);await b.el('PriceForm').onsubmit({preventDefault(){}});assert.equal(b.calls.filter(row=>row.body).length,1);finish();await work;assert.equal(b.priceField().disabled,false);assert.equal(b.el('PriceSave').disabled,true);
});

test('a nondiscarding refresh preserves a simple draft and explicit reload clears both editing areas',async()=>{
 let current=state();const b=browser(async()=>current);await b.workspace.start({api:b.api});b.priceField().value='13,50';b.priceField().oninput();b.field('label').value='Rascunho avançado';b.field('label').oninput();current=state(2,{rules:[{...COST_RULE_DEFAULTS.rules[0],unit_cost_cents:1375}]});await b.workspace.start({api:b.api});assert.equal(b.priceField().value,'13,50');assert.equal(b.field('label').value,'Rascunho avançado');assert.equal(b.el('PriceSave').disabled,true);assert.equal(b.el('Save').disabled,true);await b.el('Reload').onclick();assert.equal(b.priceField().value,'13.75');assert.equal(b.field('label').value,'Camiseta infantil');assert.equal(b.field('amount').value,'13.75');assert.equal(b.el('PriceSave').disabled,true);assert.equal(b.el('Save').disabled,true);
});

test('a valid response from a later or different writer cannot confirm or rebase a simple-price draft',async()=>{
 for(const [revision,change] of [[3,values=>{values.rules[0].unit_cost_cents=1450;}],[2,values=>{values.rules[0].unit_cost_cents=1450;}],[3,()=>{}],[2,values=>{values.rules[0].options=['2','4'];}],[2,values=>{values.assignments=[{item_id:'101',model_id:'1',rule_id:'camiseta-infantil',size:'4'}];}]]){
  let recalcs=0;const b=browser(async(path,body)=>{if(!body)return state();const values=structuredClone(body.values);change(values);validateCostRules(values);return state(revision,values);});await b.workspace.start({api:b.api,onChanged:()=>{recalcs++;}});b.priceField().value='13,50';b.priceField().oninput();await b.el('PriceForm').onsubmit({preventDefault(){}});
  assert.equal(b.priceField().value,'13,50');assert.equal(b.el('PriceSave').disabled,true);assert.match(b.el('PriceStatus').textContent,new RegExp('versão '+revision+'.*confirmação.*incerta.*preservados.*Carregar valores salvos'));assert.doesNotMatch(b.el('PriceStatus').textContent,/^Valores salvos/);assert.equal(recalcs,0);await b.el('PriceForm').onsubmit({preventDefault(){}});assert.equal(b.calls.filter(row=>row.body).length,1,'uncertain acknowledgement never retries with a new revision');
 }
});

test('semantic confirmation accepts reordered JSON object keys while preserving complete rule and assignment values',async()=>{
 const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).reverse().map(key=>[key,reorder(value[key])])):value;
 const values=structuredClone(COST_RULE_DEFAULTS);values.assignments=[{item_id:'101',model_id:'1',rule_id:'camiseta-infantil',size:'4'}];let recalcs=0;const b=browser(async(path,body)=>body?state(2,reorder(body.values)):state(1,values));await b.workspace.start({api:b.api,onChanged:()=>{recalcs++;}});b.priceField().value='13,50';b.priceField().oninput();await b.el('PriceForm').onsubmit({preventDefault(){}});assert.equal(recalcs,1);assert.equal(b.priceField().value,'13.50');assert.equal(b.el('PriceSave').disabled,true);assert.match(b.el('PriceStatus').textContent,/Valores salvos.*versão 2/);assert.equal(b.calls.filter(row=>row.body).length,1);
});

test('advanced editing explains the disabled simple inputs and a successful advanced save synchronizes both version captions',async()=>{
 let current=state();const b=browser(async(path,body)=>{if(body)current=state(2,body.values);return current;});await b.workspace.start({api:b.api});b.field('amount').value='13,75';b.field('amount').oninput();assert.equal(b.priceField().disabled,true);assert.equal(b.el('PriceSave').disabled,true);assert.match(b.el('PriceStatus').textContent,/Há edições no editor avançado.*Salve ou recarregue/);await b.el('Form').onsubmit({preventDefault(){}});assert.equal(b.priceField().value,'13.75');assert.equal(b.priceField().disabled,false);assert.match(b.el('Status').textContent,/Regras salvas.*versão 2/);assert.match(b.el('PriceStatus').textContent,/Valores da versão salva 2/);assert.doesNotMatch(b.el('PriceStatus').textContent,/Há edições/);
});

test('assignment saves and assignment reloads synchronize the simple-price caption when there is no price draft',async()=>{
 let current=state();const b=browser(async(path,body)=>{if(path==='cost-rules/assignments')current=state(2,{...current.values,assignments:body.assignments});if(path.endsWith('/sync'))return {processed:['101'],matched_variants:[]};return current;});await b.workspace.start({api:b.api});const control=b.workspace.assignmentControl({item_id:'101',model_id:'1'});selectChild(control,'4');await findAssignment(control,'save','action').onclick();assert.match(b.el('PriceStatus').textContent,/Valores da versão salva 2/);assert.match(widgetText(b.el('Summary')),/versão salva 2/);current=state(3,{...current.values,rules:[{...current.values.rules[0],unit_cost_cents:1375}]});await findAssignment(control,'reload','action').onclick();assert.match(b.el('PriceStatus').textContent,/Valores da versão salva 3/);assert.equal(b.priceField().value,'13.75');assert.equal(b.el('PriceSave').disabled,true);
});

test('editing advanced rules during cached recalculation keeps the save acknowledgement and explains why simple inputs remain disabled',async()=>{
 let finish,recalculating;const b=browser(async(path,body)=>body?state(2,body.values):state());await b.workspace.start({api:b.api,onChanged:()=>{recalculating=true;return new Promise(resolve=>{finish=resolve;});}});b.priceField().value='13,50';b.priceField().oninput();const work=b.el('PriceForm').onsubmit({preventDefault(){}});for(let n=0;n<8&&!recalculating;n++)await Promise.resolve();assert.equal(recalculating,true);b.field('label').value='Rascunho durante recálculo';b.field('label').oninput();assert.match(b.el('PriceStatus').textContent,/Há edições no editor avançado/);finish();await work;assert.match(b.el('PriceStatus').textContent,/Valores salvos.*versão 2.*Há edições no editor avançado/);assert.equal(b.priceField().disabled,true);assert.equal(b.field('label').value,'Rascunho durante recálculo');assert.equal(b.el('Save').disabled,false,'the new advanced draft uses the freshly saved price and may be saved explicitly');
});

test('advanced input cannot erase an uncertain financial-save acknowledgement warning',async()=>{
 const b=browser(async(path,body)=>body?state(3,{rules:[{...COST_RULE_DEFAULTS.rules[0],unit_cost_cents:1450}]}):state());await b.workspace.start({api:b.api});b.priceField().value='13,50';b.priceField().oninput();await b.el('PriceForm').onsubmit({preventDefault(){}});const warning=b.el('PriceStatus').textContent;assert.match(warning,/confirmação.*incerta/);b.field('label').value='Outro rascunho';b.field('label').oninput();assert.equal(b.el('PriceStatus').textContent,warning);assert.equal(b.priceField().value,'13,50');assert.equal(b.el('PriceSave').disabled,true);
});

test('stop invalidates a held rules read and its old finally cannot disturb a new active load',async()=>{
 let finish,reads=0;const values=structuredClone(COST_RULE_DEFAULTS);values.rules[0].label='New authorized rules';
 const b=browser(async()=>++reads===1?new Promise(resolve=>{finish=resolve;}):state(7,values)),old=b.workspace.start({api:b.api});
 await Promise.resolve();b.workspace.stop();assert.equal(widgetText(b.el('Summary')).trim(),'');assert.equal(b.el('Form').onsubmit,null);
 await b.workspace.start({api:b.api});assert.match(widgetText(b.el('Summary')),/New authorized rules.*versão salva 7/);
 const privateValues=structuredClone(COST_RULE_DEFAULTS);privateValues.rules[0].label='OLD PRIVATE RULE';finish(state(9,privateValues));await old;
 assert.match(widgetText(b.el('Summary')),/New authorized rules.*versão salva 7/);assert.doesNotMatch(widgetText(b.el('Summary')),/OLD PRIVATE RULE|versão salva 9/);assert.equal(b.el('Reload').disabled,false);
});

test('stop clears cost drafts, learning, assignments and held widgets before a delayed assignment can publish',async()=>{
 let finish,saved=0;const values=structuredClone(COST_RULE_DEFAULTS);values.assignments=[{item_id:'101',model_id:'1',rule_id:'camiseta-infantil',size:'4'}];
 const b=browser(async(path,body)=>path==='cost-rules/assignments'?new Promise(resolve=>{finish=()=>resolve(state(2,{...values,assignments:body.assignments}));}):path.endsWith('/sync')?{matched_variants:[{item_id:'101',model_id:'1'}],learning:[learning()]}:state(1,values));
 await b.workspace.start({api:b.api});await b.workspace.syncCandidates([{item_id:'101'}]);assert.equal(b.workspace.isMapped('101','1'),true);assert.ok(b.workspace.learningFor('101'));assert.ok(b.workspace.assignmentFor('101','1'));
 const price=b.priceField(),advanced=b.field('label'),widget=b.workspace.assignmentControl({item_id:'101',model_id:'1',onSaved:()=>{saved++;}});selectChild(widget,'6');const type=findAssignment(widget,'rule'),size=findAssignment(widget,'size'),submit=findAssignment(widget,'save','action'),work=submit.onclick();
 b.workspace.stop();assert.equal(price.value,'');assert.equal(advanced.value,'');assert.equal(type.value,'');assert.equal(size.value,'');assert.equal(submit.onclick,null);assert.equal(widgetText(widget).trim(),'');assert.equal(b.workspace.isMapped('101','1'),false);assert.equal(b.workspace.learningFor('101'),null);assert.equal(b.workspace.assignmentFor('101','1'),null);assert.equal(b.workspace.hasAssignment('101','1'),false);
 const calls=b.calls.length;finish();assert.equal(await work,false);assert.equal(saved,0);assert.equal(b.calls.length,calls);assert.equal(widgetText(b.el('Summary')).trim(),'');assert.equal(widgetText(b.el('Rows')).trim(),'');assert.equal(b.workspace.isMapped('101','1'),false);
});

test('stop suppresses delayed price confirmations and pending recalculation notices without restoring controls',async()=>{
 for(const phase of ['response','recalculation']){
  let finish,entered=false,recalculations=0;
  const b=browser(async(path,body)=>body&&phase==='response'?new Promise(resolve=>{finish=()=>resolve(state(2,body.values));}):body?state(2,body.values):state());
  await b.workspace.start({api:b.api,onChanged:()=>{recalculations++;entered=true;return new Promise(resolve=>{finish=resolve;});}});const price=b.priceField();price.value='13,50';price.oninput();const work=b.el('PriceForm').onsubmit({preventDefault(){}});
  for(let n=0;n<12&&!finish;n++)await Promise.resolve();assert.ok(finish);assert.equal(entered,phase==='recalculation');b.workspace.stop();finish();assert.equal(await work,false);assert.equal(recalculations,phase==='recalculation'?1:0);assert.equal(price.value,'');assert.equal(b.el('PriceStatus').textContent,'');assert.equal(b.el('PriceSave').disabled,true);assert.equal(widgetText(b.el('Summary')).trim(),'');
 }
});

test('stop prevents an in-flight or queued catalogue task from repopulating maps or starting another batch',async()=>{
 let finish;const b=browser(async(path)=>path==='cost-rules'?state():new Promise(resolve=>{finish=()=>resolve({matched_variants:[{item_id:'101',model_id:'1'}],learning:[learning()]});}));await b.workspace.start({api:b.api});
 const first=b.workspace.syncCandidates([{item_id:'101'},{item_id:'102'},{item_id:'103'},{item_id:'104'}]),queued=b.workspace.syncCandidates([{item_id:'201'}]);for(let n=0;n<8&&!finish;n++)await Promise.resolve();assert.ok(finish);b.workspace.stop();finish();assert.equal(await first,false);assert.equal(await queued,false);assert.equal(b.calls.filter(row=>row.path.endsWith('/sync')).length,1);assert.equal(b.workspace.isMapped('101','1'),false);assert.equal(b.workspace.learningFor('101'),null);assert.equal(b.el('Sync').textContent,'');assert.equal(await b.workspace.syncCandidates([{item_id:'301'}]),false);
});
