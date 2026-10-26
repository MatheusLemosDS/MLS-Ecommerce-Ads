import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {COST_DEFAULTS,productionCostReference} from '../src/production-costs.mjs';
import {readCostRules,saveCostRules,readCostRuleReference,syncCostRuleCatalog} from '../src/cost-rules.mjs';
import {refreshKnownCatalogClassifications} from '../src/catalog-classification.mjs';

const item='58270722536',removed='189628289642',currentTwo='189628289640',currentFourteen='189628289641',stamp=1793017766,catalogStamp=1792983894,now=()=>stamp*1000;
const title='Camiseta Infantil Anos 80 Retrô Flashback Estampa Colorida Música Festa Vintage Menino Menina Tam 2 ao 14';
const oldNames={item_names:[title],model_names:['16'],missing_item_name:false,missing_model_name:false,conflict:false,overflow:false};
const values={...COST_DEFAULTS,inclusive_regular_cents:1590,inclusive_plus_cents:2140};
const catalog=(name=title,models=[[currentTwo,'2'],[currentFourteen,'14']])=>({schema:'product_cost_catalog_v1',product_name:name,variants:models.map(([model_id,size])=>({model_id,attributes:[{name:'Tamanho',value:size}]}))});
async function fixture(t,{withCatalog=true}={}){
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());await readCostRules(env);let source=catalog();
 const updateCatalog=async(next=source)=>{source=next;return syncCostRuleCatalog(env,[item],async()=>({schema:'variant_catalog_v1',checked_at:catalogStamp,products:[{item_id:item,catalog_fingerprint:'a'.repeat(64),bindings:[],unresolved_count:source.variants.length,cost_catalog:source}]}),{force:true,now:()=>catalogStamp*1000});};
 if(withCatalog)await updateCatalog();
 env.ADMIN_DB.db.prepare('INSERT INTO historical_cost_evidence_names VALUES(?,?,?,1,?,?)').run(item,removed,JSON.stringify(oldNames),1792983236,1792983236);
 const reference=()=>readCostRuleReference(env,[item],{now});
 const price=(automatic,costs=values,rows=[{item_id:item,model_id:removed,quantity:1}],bindings=[])=>productionCostReference({status:'AVAILABLE',rows},{revision:14,bindings},{revision:5,values:costs},automatic);
 const updateRules=async(change)=>{const state=await readCostRules(env);return saveCostRules(env,{revision:state.revision,values:change(structuredClone(state.values))},'operator');};
 return {env,reference,price,updateRules,updateCatalog};
}

test('the reported removed child size16 is priced from approved exact historical evidence even while an unrelated current size2 is pending',async t=>{
 const f=await fixture(t),changes=f.env.ADMIN_DB.db.prepare('SELECT total_changes() AS n').get().n,reference=await f.reference();
 assert.ok(reference.restricted_item_ids.includes(item));assert.equal(reference.historical_compositions[0].unit_cost_cents,1250);assert.equal(reference.variants.some(row=>row.model_id===removed),false);assert.equal(reference.variants.find(row=>row.model_id===currentTwo).unit_cost_cents,null);
 const result=f.price(reference);assert.equal(result.total_cents,1250);assert.equal(result.mapped_quantity,1);assert.equal(result.unmapped_quantity,0);assert.equal(result.variants[0].unit_cost_cents,1250);assert.equal(result.variants[0].cost_profile_label,'Camiseta infantil 16 · histórico');assert.equal(Object.hasOwn(result.variants[0],'catalog_binding'),false);
 assert.equal(f.price(reference,values,[{item_id:item,model_id:removed,quantity:1},{item_id:item,model_id:currentFourteen,quantity:2}]).total_cents,3750);
 const unresolved=f.price(reference,values,[{item_id:item,model_id:removed,quantity:1},{item_id:item,model_id:currentTwo,quantity:1},{item_id:item,model_id:'189628289643',quantity:1}]);assert.equal(unresolved.known_subset_cents,1250);assert.equal(unresolved.unmapped_quantity,2);assert.equal(unresolved.total_cents,null);
 assert.deepEqual(reference.historical_child_rule_keys,[item+':'+removed]);assert.equal(Object.getOwnPropertyDescriptor(reference,'historical_child_rule_keys').enumerable,false);assert.ok(!JSON.stringify(reference).includes('historical_child_rule_keys'));
 await f.reference();assert.equal(f.env.ADMIN_DB.db.prepare('SELECT total_changes() AS n').get().n,changes,'pricing and snapshot reads do not write new assignments, catalogue models, or historical evidence');assert.deepEqual(JSON.parse(f.env.ADMIN_DB.db.prepare('SELECT payload FROM historical_cost_evidence_names').get().payload),oldNames);
});

test('historical child pricing follows current configured price and stops on disabled, removed, excluded, or ambiguous matching rules',async t=>{
 const f=await fixture(t),base=(await readCostRules(f.env)).values;
 const check=async(change,expected)=>{await f.updateRules(()=>change(structuredClone(base)));assert.equal(f.price(await f.reference()).total_cents,expected);};
 await check(v=>{v.rules[0].unit_cost_cents=1375;return v;},1375);
 await check(v=>{v.rules[0].enabled=false;return v;},null);
 await check(v=>{v.rules[0].options=v.rules[0].options.filter(size=>size!=='16');return v;},null);
 await check(v=>{v.rules[0].exclude_terms.push('retrô');return v;},null);
 await check(v=>{v.rules[0].name_patterns=['camiseta azul'];return v;},null);
 for(const price of [1250,1800])await check(v=>{v.rules.push({...v.rules[0],id:'outra-infantil',unit_cost_cents:price});return v;},null);
 await check(v=>{v.rules.push({...v.rules[0],id:'outra-infantil',options:[],unit_cost_cents:1800});return v;},null);
 await check(v=>{v.rules.push({...v.rules[0],id:'outra-infantil',enabled:false,unit_cost_cents:1800});return v;},1250);
 await check(v=>{v.rules.push({...v.rules[0],id:'outra-infantil',options:['4'],unit_cost_cents:1800});return v;},1250);
 await check(v=>{v.rules.push({...v.rules[0],id:'outra-infantil',unit_cost_cents:1800});v.rules[0].enabled=false;return v;},null);
 await f.updateRules(()=>structuredClone(base));for(const name of ['Moletom infantil Anos 80','Camiseta adulta Anos 80']){await f.updateCatalog(catalog(name));assert.equal(f.price(await f.reference()).total_cents,null);}
});

test('manual historical assignments and product decisions retain precedence, and contradictory sibling corrections cannot authorize deleted models',async t=>{
 const f=await fixture(t),base=(await readCostRules(f.env)).values;
 const check=async(assignments,expected,{ruleSizeOptions=['2','4','6','8','10','12','14','16']}={})=>{await f.updateRules(()=>({...structuredClone(base),rules:[...structuredClone(base.rules),{...structuredClone(base.rules[0]),id:'outra-infantil',unit_cost_cents:1800,options:ruleSizeOptions}],assignments}));assert.equal(f.price(await f.reference()).total_cents,expected);};
 await check([{item_id:item,model_id:removed,rule_id:'outra-infantil',size:'16'}],1800);
 await f.updateRules(v=>{v.rules.find(rule=>rule.id==='outra-infantil').enabled=false;return v;});assert.equal(f.price(await f.reference()).total_cents,null,'a disabled exact manual assignment does not fall back to the child rule');
 await check([{item_id:item,model_id:null,rule_id:'outra-infantil',size:null}],1800,{ruleSizeOptions:[]});
 await check([{item_id:item,model_id:currentFourteen,rule_id:'outra-infantil',size:'14'}],null);
 await f.updateRules(()=>({...structuredClone(base),assignments:[{item_id:item,model_id:currentFourteen,rule_id:'camiseta-infantil',size:'8'}]}));assert.equal(f.price(await f.reference()).total_cents,null);
 await f.updateRules(()=>({...structuredClone(base),assignments:[{item_id:item,model_id:null,rule_id:'camiseta-infantil',size:null}]}));assert.equal(f.price(await f.reference()).total_cents,null);
 await f.updateRules(()=>({...structuredClone(base),assignments:[]}));const reference=await f.reference();
 const explicit={...values,custom_profiles:[{id:'manual',label:'Custo informado',unit_cost_cents:2100}],custom_assignments:[{item_id:item,model_id:removed,profile_id:'manual'}]};assert.equal(f.price(reference,explicit).total_cents,2100);
 const recipe={...values,composition_recipes:[{id:'double',label:'Composição confirmada',components:[{kind:'ADULT_GARMENT',size:'G3',quantity:2}]}],composition_assignments:[{item_id:item,model_id:removed,recipe_id:'double'}]};assert.equal(f.price(reference,recipe).total_cents,4280);
});

test('current models, observed metadata changes, incomplete evidence and unsupported historical sizes stay pending',async t=>{
 const f=await fixture(t);await f.updateCatalog(catalog(title,[[currentFourteen,'14'],[removed,'18']]));assert.equal(f.price(await f.reference()).total_cents,null,'present but unsupported size cannot use its old historical name');
 await f.updateCatalog(catalog());await refreshKnownCatalogClassifications(f.env,[item],{now});assert.equal(f.price(await f.reference()).total_cents,null,'pending metadata change still blocks historical fallback');
 f.env.ADMIN_DB.db.prepare('DELETE FROM catalog_classification_changes WHERE item_id=?').run(item);
 for(const [approved,names] of [[0,oldNames],[1,{...oldNames,missing_model_name:true}],[1,{...oldNames,model_names:['18']}],[1,{...oldNames,model_names:['16','adulto G'],conflict:true}],[1,{...oldNames,overflow:true,conflict:true}]]){f.env.ADMIN_DB.db.prepare('UPDATE historical_cost_evidence_names SET approved=?,payload=?').run(approved,JSON.stringify(names));assert.equal(f.price(await f.reference()).total_cents,null);}
});

test('approved child historical evidence without a current catalogue retains its existing conservative behavior',async t=>{
 const f=await fixture(t,{withCatalog:false}),reference=await f.reference();assert.equal(f.price(reference).total_cents,1250);assert.deepEqual(reference.historical_child_rule_keys,[]);await f.updateRules(v=>{v.rules[0].enabled=false;return v;});assert.equal(f.price(await f.reference()).total_cents,null);
});
