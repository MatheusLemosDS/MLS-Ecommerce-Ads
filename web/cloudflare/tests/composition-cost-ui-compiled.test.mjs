import test from 'node:test';
import assert from 'node:assert/strict';
import {compiledOwnerReportPage,ownerReportBrowser} from './owner-report-browser-fixture.mjs';

const values={mode:'all_inclusive',inclusive_regular_cents:1590,inclusive_plus_cents:2140,base_regular_cents:null,base_plus_cents:null,components:[],composition_recipes:[{id:'combo-three',label:'Combo de três camisetas',components:['P','M','G'].map(size=>({kind:'ADULT_GARMENT',size,quantity:1}))}],composition_assignments:[{item_id:'123',model_id:'0',recipe_id:'combo-three'}]};
const audit={schema:'operator_cost_corrections_v1',shop_id:1178167501,corrections:[{id:'adult-triple-58271140523-149796059126-v1',status:'APPLIED',reason:'OPERATOR_CONFIRMED',previous_revision:6,revision:7,checked_at:1793192400}]};

for(const minify of [false,true])test('compiled owner '+(minify?'minified':'normal')+' preserves confirmed three-piece recipes and displays their audit without another confirmation',async t=>{
 const {html}=await compiledOwnerReportPage(minify);assert.match(html,/id="confirmedCostReferences"/);
 const b=ownerReportBrowser(html,{respond:async(url,options)=>{
  if(url==='/api/admin/production-costs/confirmed-references')return {body:audit};
  if(url==='/api/admin/production-costs'){const body=JSON.parse(options.body);return {body:{revision:8,values:body.values,updated_at:'2026-10-28T12:00:00Z'}};}
  if(url==='/api/admin/order-items?source=saved')return {body:{status:'UNAVAILABLE'}};
  if(url==='/api/admin/variant-bindings')return {body:{revision:1,bindings:[],updated_at:'2026-10-28T12:00:00Z'}};
  return null;
 }});t.after(()=>b.stop());b.context.serialized=JSON.stringify(values);b.run('globalThis.structuredClone=value=>JSON.parse(JSON.stringify(value));csrf="owner-fixture-csrf";applyProductionCosts(validProductionCostsState({revision:7,values:JSON.parse(serialized),updated_at:"2026-10-28T12:00:00Z"}));');
 assert.match(b.nodes.get('costsPreview').textContent,/Combo de três camisetas.*47,70.*custo do combo inteiro/);assert.equal(b.run('savedCustomCost("123","0").unit_cost_cents'),4770);
 assert.equal(await b.run('loadConfirmedCostReferences()'),true);assert.equal(b.nodes.get('confirmedCostReferencesTitle').textContent,'Referências confirmadas aplicadas');assert.match(b.nodes.get('confirmedCostReferencesRows').textContent,/Composição do combo adulto.*versão 7/);assert.equal(b.nodes.get('confirmedCostReferences').querySelectorAll('button').length,0);
 b.run('el("costInclusiveRegular").value="20,00";productionCostsChanged();');await b.run('saveProductionCosts()');const save=b.calls.find(call=>call.url==='/api/admin/production-costs'),payload=JSON.parse(save.options.body);assert.deepEqual(payload.values.composition_recipes,values.composition_recipes);assert.deepEqual(payload.values.composition_assignments,values.composition_assignments);assert.equal(b.run('productionCostsState.revision'),8);assert.equal(b.run('savedCustomCost("123","0").unit_cost_cents'),6000);assert.match(b.nodes.get('costsPreview').textContent,/Combo de três camisetas.*60,00/);assert.equal(b.calls.some(call=>call.url==='/api/admin/order-items'),false);assert.equal(b.calls.some(call=>call.url.endsWith('/cost-rules/sync')),false);
});
