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
