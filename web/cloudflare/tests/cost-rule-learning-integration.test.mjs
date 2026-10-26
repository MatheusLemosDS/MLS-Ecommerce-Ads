import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {COST_DEFAULTS,productionCostReference} from '../src/production-costs.mjs';
import {readCostRules,saveCostRules,assignCostRules,syncCostRuleCatalog,readCostRuleReference,evaluateCostRules,COST_RULE_DEFAULTS} from '../src/cost-rules.mjs';
import {refreshKnownCatalogClassifications,readCatalogClassificationState} from '../src/catalog-classification.mjs';
import {deriveCatalogProduct,deriveProductCostCatalog} from '../../finance/src/variant-catalog-frame.mjs';

const clock=Date.UTC(2026,9,24,12),stamp=clock/1000,now=()=>clock;
const catalogue=(name='Produto Verde de lançamento',sizes=['4','6','8','10','12','14','16'])=>({schema:'product_cost_catalog_v1',product_name:name,variants:sizes.map((size,index)=>({model_id:String(index),attributes:[{name:'Cor',value:'Verde'},{name:'Tamanho',value:size}]}))});
const frame=(source=catalogue(),id='101')=>({schema:'variant_catalog_v1',checked_at:stamp,products:[{item_id:id,catalog_fingerprint:'a'.repeat(64),bindings:[],unresolved_count:source.variants.length,cost_catalog:source}]});
const correction=(model_id='0',size='4',rule_id='camiseta-infantil')=>({item_id:'101',model_id,rule_id,size});

test('a targeted catalogue refresh after size 16 removal clears only the observed change and preserves historical costs',async()=>{
 const env={ADMIN_DB:new D1()};try{
  await readCostRules(env);await assignCostRules(env,{revision:1,assignments:[correction('6','16')]},'admin');
  await syncCostRuleCatalog(env,['101'],async()=>frame(catalogue('Camiseta Verde')),{now});
  await refreshKnownCatalogClassifications(env,['101'],{now});
  assert.equal((await readCatalogClassificationState(env,{item_ids:['101']},{now})).products[0].reason,'CATALOG_METADATA_CHANGED');
  const remaining=catalogue('Camiseta Verde');remaining.variants.pop();
  const refreshed=await syncCostRuleCatalog(env,['101'],async()=>({...frame(remaining),checked_at:stamp+1}),{now:()=>clock+1000,force:true});
  const state=await readCatalogClassificationState(env,{item_ids:['101']},{now:()=>clock+1000});
  assert.notEqual(state.products[0].reason,'CATALOG_METADATA_CHANGED');assert.equal(state.products[0].model_count,6);assert.equal(state.products[0].variants.some(row=>row.model_id==='6'),false);
  const reference=await readCostRuleReference(env,['101'],{now:()=>clock+1000});
  assert.equal(refreshed.learning[0].status,'RECOGNIZED');assert.equal(reference.variants.length,7);assert.ok(reference.variants.every(row=>row.unit_cost_cents===1250));
  assert.equal(reference.catalog_model_keys.includes('101:6'),false,'removed size is not advertised as a current variation');
  assert.deepEqual((await readCostRules(env)).values.assignments,[correction('6','16')]);
  const priced=productionCostReference({status:'AVAILABLE',rows:[{item_id:'101',model_id:'0',quantity:2},{item_id:'101',model_id:'6',quantity:1}]},{revision:1,bindings:[]},{revision:1,values:COST_DEFAULTS},reference);
  assert.equal(priced.total_cents,3750,'remaining models and historical size 16 keep their own evidence and saved price');
 }finally{env.ADMIN_DB.db.close();}
});

test('a newer provider change arriving during a manual catalogue read remains pending',async()=>{
 for(const priorChange of [false,true]){const env={ADMIN_DB:new D1()};try{
  await readCostRules(env);await syncCostRuleCatalog(env,['101'],async()=>frame(catalogue('Camiseta Verde')),{now});
  if(priorChange)await refreshKnownCatalogClassifications(env,['101'],{now});
  const first=env.ADMIN_DB.db.prepare('SELECT change_token FROM catalog_classification_changes WHERE item_id=?').get('101')?.change_token??null;
  await syncCostRuleCatalog(env,['101'],async()=>{await refreshKnownCatalogClassifications(env,['101'],{now:()=>clock+1000});return {...frame(catalogue('Camiseta Verde')),checked_at:stamp+1};},{now:()=>clock+1000,force:true});
  const pending=env.ADMIN_DB.db.prepare('SELECT change_token FROM catalog_classification_changes WHERE item_id=?').get('101');
  assert.ok(pending);assert.notEqual(pending.change_token,first);
  assert.equal((await readCatalogClassificationState(env,{item_ids:['101']},{now:()=>clock+1000})).products[0].reason,'CATALOG_METADATA_CHANGED');
  assert.ok((await readCostRuleReference(env,['101'],{now:()=>clock+1000})).variants.every(row=>row.unit_cost_cents===null));
 }finally{env.ADMIN_DB.db.close();}}
});

test('an explicitly named child shirt reprocesses remaining stable IDs after size 16 and axis reordering without manual assignments',async()=>{
 const env={ADMIN_DB:new D1()};try{
  await readCostRules(env);
  const axis=(name,options)=>({name,option_list:options.map(option=>({option}))});
  const source={tier_variation:[axis('Cor',['Verde']),axis('Tamanho',['4','14','16'])],model:[{model_id:104,tier_index:[0,0]},{model_id:114,tier_index:[0,1]},{model_id:116,tier_index:[0,2]}]};
  const response=async(at=stamp)=>({schema:'variant_catalog_v1',checked_at:at,products:[{...await deriveCatalogProduct('101',source,{selling_unit:'AUTO'}),cost_catalog:deriveProductCostCatalog(source,'Camiseta infantil Verde')}]});
  await syncCostRuleCatalog(env,['101'],async()=>response(),{now});
  await refreshKnownCatalogClassifications(env,['101'],{now});
  source.tier_variation=[axis('Tamanho',['14','4']),axis('Cor',['Verde'])];source.model=[{model_id:114,tier_index:[0,0]},{model_id:104,tier_index:[1,0]}];
  await syncCostRuleCatalog(env,['101'],async()=>response(stamp+1),{now:()=>clock+1000,force:true});
  const state=await readCatalogClassificationState(env,{item_ids:['101']},{now:()=>clock+1000}),reference=await readCostRuleReference(env,['101'],{now:()=>clock+1000});
  assert.notEqual(state.products[0].reason,'CATALOG_METADATA_CHANGED');assert.deepEqual(state.products[0].variants.map(row=>[row.model_id,row.attributes.find(attribute=>attribute.name==='Tamanho').value]),[['104','4'],['114','14']]);
  assert.deepEqual(reference.variants.map(row=>[row.model_id,row.unit_cost_cents]),[['104',1250],['114',1250]]);assert.equal((await readCostRules(env)).values.assignments,undefined);
  const priced=productionCostReference({status:'AVAILABLE',rows:[{item_id:'101',model_id:'104',quantity:2},{item_id:'101',model_id:'114',quantity:1}]},{revision:1,bindings:[]},{revision:1,values:COST_DEFAULTS},reference);assert.equal(priced.total_cents,3750);
  const old=productionCostReference({status:'AVAILABLE',rows:[{item_id:'101',model_id:'116',quantity:1}]},{revision:1,bindings:[]},{revision:1,values:COST_DEFAULTS},reference);assert.equal(old.total_cents,null,'an absent historical model without saved composition cannot inherit a remaining model by position');
 }finally{env.ADMIN_DB.db.close();}
});

test('one saved correction teaches every compatible sibling and a new model without copying assignments or freezing the price',async()=>{
 const env={ADMIN_DB:new D1()};try{
 let state=await readCostRules(env);await assignCostRules(env,{revision:state.revision,assignments:[correction()]},'admin');
 let result=await syncCostRuleCatalog(env,['101'],async()=>frame(catalogue(undefined,['4','6','8','10','12','14'])),{now});assert.equal(result.learning[0].status,'LEARNED');assert.equal(result.learning[0].evidence_count,1);assert.equal(result.learning[0].matched_variants,6);assert.equal(result.matched_variants.length,6);
 await syncCostRuleCatalog(env,['101'],async()=>frame(),{now,force:true});let reference=await readCostRuleReference(env,['101'],{now});assert.equal(reference.variants.length,7);assert.ok(reference.variants.every(row=>row.unit_cost_cents===1250));assert.ok(reference.restricted_item_ids.includes('101'));assert.equal((await readCostRules(env)).values.assignments.length,1);
 const extended=await syncCostRuleCatalog(env,['101'],async()=>frame(catalogue(undefined,['4','6','8','10','12','14','16','18'])),{now,force:true});assert.equal(extended.learning[0].matched_variants,7);assert.equal(extended.learning[0].pending_variants,1);reference=await readCostRuleReference(env,['101'],{now});assert.equal(reference.variants.at(-1).unit_cost_cents,null);
 state=await readCostRules(env);state.values.rules[0].unit_cost_cents=1300;await saveCostRules(env,{revision:state.revision,values:state.values},'admin');reference=await readCostRuleReference(env,['101'],{now});assert.ok(reference.variants.slice(0,7).every(row=>row.unit_cost_cents===1300));assert.equal(reference.variants.at(-1).unit_cost_cents,null);
 }finally{env.ADMIN_DB.db.close();}
});

test('saved learned evidence survives an overdue verification without restoring adult costs for siblings',async()=>{
 const env={ADMIN_DB:new D1()};try{await readCostRules(env);await assignCostRules(env,{revision:1,assignments:[correction()]},'admin');await syncCostRuleCatalog(env,['101'],async()=>frame(),{now});
 const reference=await readCostRuleReference(env,['101'],{now:()=>clock+901000});assert.equal(reference.learning[0].status,'LEARNED');assert.ok(reference.variants.every(row=>row.unit_cost_cents===1250));
 const binding={item_id:'101',model_id:'1',selling_unit:'SINGLE_GARMENT',size:'P',operator_confirmed:true},priced=productionCostReference({status:'AVAILABLE',rows:[{item_id:'101',model_id:'1',quantity:1}]},{revision:1,bindings:[binding]},{revision:1,values:COST_DEFAULTS},reference);assert.equal(priced.total_cents,1250);assert.equal(priced.known_subset_cents,1250);
 }finally{env.ADMIN_DB.db.close();}
});

test('conflicting corrections or contradictory observed sizes keep examples but cannot price the other variants',async()=>{
 const env={ADMIN_DB:new D1()};try{let state=await readCostRules(env);state.values.rules.push({...state.values.rules[0],id:'special',label:'Outra composição',unit_cost_cents:1550});state=await saveCostRules(env,{revision:state.revision,values:state.values},'admin');
 state=await assignCostRules(env,{revision:state.revision,assignments:[correction(),correction('1','6','special')]},'admin');await syncCostRuleCatalog(env,['101'],async()=>frame(),{now});let reference=await readCostRuleReference(env,['101'],{now});assert.equal(reference.learning[0].status,'CONFLICT');assert.deepEqual(reference.variants.slice(0,2).map(row=>row.unit_cost_cents),[1250,1550]);assert.ok(reference.variants.slice(2).every(row=>row.unit_cost_cents===null));
 await assignCostRules(env,{revision:state.revision,assignments:[{item_id:'101',model_id:'1',rule_id:null,size:null},correction('0','8')]},'admin');reference=await readCostRuleReference(env,['101'],{now});assert.equal(reference.learning[0].reason,'CORRECTION_SIZE_MISMATCH');assert.equal(reference.variants[0].unit_cost_cents,1250);assert.ok(reference.variants.slice(1).every(row=>row.unit_cost_cents===null));
 }finally{env.ADMIN_DB.db.close();}
});

test('generic new child shirts are recognized by actual type and size evidence while unrelated or mixed products stay unpriced',()=>{
 const inferred=evaluateCostRules(COST_RULE_DEFAULTS,'102',catalogue('Camiseta Verde Unissex'));assert.equal(inferred.length,7);assert.ok(inferred.every(row=>row.unit_cost_cents===1250));
 for(const title of ['Camiseta Infantil Kits Casais','Camisetas Infantis Calças','Camiseta Infantil Adultos','Camiseta Infantil Bonecas','Camiseta Infantil Pets','Calça Infantil','Short Infantil'])assert.ok(evaluateCostRules(COST_RULE_DEFAULTS,'102',catalogue(title)).every(row=>row.unit_cost_cents===null),title);
 assert.deepEqual(evaluateCostRules(COST_RULE_DEFAULTS,'102',catalogue('Camiseta Verde',['P','M','G'])),[]);assert.deepEqual(evaluateCostRules(COST_RULE_DEFAULTS,'102',catalogue('Camiseta Verde',['4','P'])),[]);
});

test('a broad recognition never silently overrides another configured rule for the same new product',async()=>{
 const env={ADMIN_DB:new D1()};try{let state=await readCostRules(env);state.values.rules.push({...state.values.rules[0],id:'other-child',name_patterns:['camiseta verde'],unit_cost_cents:1400});await saveCostRules(env,{revision:state.revision,values:state.values},'admin');const result=await syncCostRuleCatalog(env,['101'],async()=>frame(catalogue('Camiseta Verde Unissex')),{now});assert.equal(result.learning[0].status,'CONFLICT');assert.equal(result.learning[0].reason,'RULE_CONFLICT');assert.deepEqual(result.matched_variants,[]);
 }finally{env.ADMIN_DB.db.close();}
});
