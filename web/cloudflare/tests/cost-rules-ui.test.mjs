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
 return {workspace,api,el,field,calls};
}
const state=(revision=1,values=structuredClone(COST_RULE_DEFAULTS))=>({revision,values,updated_at:'2026-10-24T12:00:00Z'});
const findAssignment=(root,key,kind='field')=>{const dataset=kind==='field'?'costRuleAssignmentField':'costRuleAssignmentAction';const walk=row=>row.dataset[dataset]===key?row:row.children.map(walk).find(Boolean);return walk(root);};
const widgetText=root=>root.textContent+' '+root.children.map(widgetText).join(' ');
const selectChild=(root,size='8')=>{const type=findAssignment(root,'rule');type.value='camiseta-infantil';type.onchange();const option=findAssignment(root,'size');option.value=size;option.onchange();};
const learning=(changes={})=>({item_id:'101',rule_id:'camiseta-infantil',rule_label:'Camiseta infantil',status:'LEARNED',reason:'CORRECTION_AND_CATALOG',evidence_count:1,matched_variants:7,pending_variants:0,checked_at:Math.floor(Date.now()/1000),...changes});

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

test('stale and conflicting learning remains pending and a legacy response cannot retain a prior positive note',async()=>{
 let current={learning:[learning({checked_at:Math.floor(Date.now()/1000)-901})]};const b=browser(async path=>path==='cost-rules'?state():current);await b.workspace.start({api:b.api});
 await b.workspace.syncCandidates([{item_id:'101'}]);assert.equal(b.workspace.learningFor('101').status,'PENDING');assert.equal(b.workspace.learningFor('101').matched_variants,0);assert.doesNotMatch(widgetText(b.workspace.learningNote('101')),/Aprendido/);assert.match(widgetText(b.workspace.learningNote('101')),/atualização do catálogo/);
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
