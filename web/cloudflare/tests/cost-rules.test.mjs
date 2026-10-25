import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {COST_RULE_DEFAULTS,validateCostRules,evaluateCostRules,readCostRules,saveCostRules,readCostRuleReference,syncCostRuleCatalog,selectCostRuleCandidates,assignCostRules} from '../src/cost-rules.mjs';
import {COST_DEFAULTS,productionCostReference} from '../src/production-costs.mjs';
import {deriveCatalogProduct,deriveProductCostCatalog} from '../../finance/src/variant-catalog-frame.mjs';
import {storeCatalogClassificationFrame} from '../src/catalog-classification.mjs';
const clock=Date.UTC(2026,9,24,12),now=()=>clock,stamp=clock/1000;
const catalog=(name='Camiseta Estrela Infantil',sizes=['4','6','8','10','12','14','16'])=>({schema:'product_cost_catalog_v1',product_name:name,variants:sizes.map((size,i)=>({model_id:String(i),attributes:[{name:'Cor',value:'Vermelho'},{name:'Tamanho',value:size}]}))});
const provider=(meta=catalog())=>({schema:'variant_catalog_v1',checked_at:stamp,products:[{item_id:'101',catalog_fingerprint:'a'.repeat(64),bindings:[],unresolved_count:meta.variants.length,cost_catalog:meta}]});
const fixture=()=>({ADMIN_DB:new D1()});
const reference=(automated,changes={})=>productionCostReference({status:'AVAILABLE',rows:catalog().variants.map(row=>({item_id:'101',model_id:row.model_id,quantity:2}))},{revision:1,bindings:[]},{revision:1,values:{...COST_DEFAULTS,...changes}},automated);

test('the saved catalogue automatically prices adult, plus, child and all gendered kit options while keeping ambiguous products pending',async t=>{
 const env=fixture();t.after(()=>env.ADMIN_DB.db.close());
 const sizes=['P','M','G','GG','G1','G2','G3'];
 const definitions=[
  {item:'22199878767',name:'Camiseta Camisa Unissex Verde',axes:[{name:'Cor',options:['Verde']},{name:'Tamanho',options:sizes.map(size=>size.toLowerCase())}]},
  {item:'102',name:'Camiseta Política Estrela',axes:[{name:'Cor',options:['Verde']},{name:'Tamanho',options:['4','6','8','10','12','14','16']}]},
  {item:'58269212782',name:'Kit Casal Camisetas Estrela',axes:[{name:'Tamanho Feminino',options:sizes.map(size=>'MULHER '+size)},{name:'Tamanho Masculino',options:sizes.map(size=>'HOMEM '+size)}]},
  {item:'104',name:'Calça Baggy',axes:[{name:'Cor',options:['Verde']},{name:'Tamanho',options:['M']}]},
  {item:'105',name:'Kit Casal Camisetas',axes:[{name:'Tamanho Feminino',options:['HOMEM P']},{name:'Tamanho Masculino',options:['MULHER M']}]},
 ];
 const products=[];
 for(const definition of definitions){
  const model=[];for(let first=0;first<definition.axes[0].options.length;first++)for(let second=0;second<definition.axes[1].options.length;second++)model.push({model_id:100+model.length,tier_index:[first,second]});
  const raw={tier_variation:definition.axes.map(axis=>({name:axis.name,option_list:axis.options.map(option=>({option}))})),model};
  const product=await deriveCatalogProduct(definition.item,raw,{selling_unit:'AUTO'});product.cost_catalog=deriveProductCostCatalog(raw,definition.name);products.push(product);
  await storeCatalogClassificationFrame(env,{schema:'variant_catalog_v1',checked_at:stamp,products:[product]},{now});
 }
 const automatic=await readCostRuleReference(env,definitions.map(row=>row.item),{now}),rows=products.flatMap(product=>product.cost_catalog.variants.map(variant=>({item_id:product.item_id,model_id:variant.model_id,quantity:1}))),price=(values=COST_DEFAULTS,bindings=[])=>productionCostReference({status:'AVAILABLE',rows},{revision:1,bindings},{revision:1,values},automatic),result=price();
 const adult=result.variants.filter(row=>row.item_id==='22199878767'),children=result.variants.filter(row=>row.item_id==='102'),kits=result.variants.filter(row=>row.item_id==='58269212782');
 assert.deepEqual(adult.map(row=>row.unit_cost_cents),[1590,1590,1590,1590,1890,1890,1890]);assert.deepEqual(adult.map(row=>row.catalog_binding.size),sizes);
 assert.equal(children.length,7);assert.ok(children.every(row=>row.unit_cost_cents===1250&&row.cost_source==='CUSTOM_PROFILE'));
 assert.equal(kits.length,49);assert.equal(kits[0].unit_cost_cents,3180);assert.equal(kits[4].unit_cost_cents,3480);assert.equal(kits.at(-1).unit_cost_cents,3780);
 assert.ok(result.variants.filter(row=>['104','105'].includes(row.item_id)).every(row=>row.unit_cost_cents===null));assert.equal(result.total_cents,null);assert.equal(result.known_subset_cents,189200);
 assert.ok(!automatic.variants.some(row=>row.item_id==='22199878767'),'adult garment prices use their catalogue composition, not the child rule');
 const manualBinding={item_id:'22199878767',model_id:'102',size:'G1',selling_unit:'SINGLE_GARMENT',operator_confirmed:true},manualValues={...COST_DEFAULTS,custom_profiles:[{id:'manual-child',label:'Exceção infantil',unit_cost_cents:999}],custom_assignments:[{item_id:'102',model_id:'100',profile_id:'manual-child'}]},before=structuredClone({manualBinding,manualValues});
 const manual=price(manualValues,[manualBinding]);assert.equal(manual.variants.find(row=>row.item_id==='22199878767'&&row.model_id==='102').unit_cost_cents,1890);assert.equal(manual.variants.find(row=>row.item_id==='102'&&row.model_id==='100').unit_cost_cents,999);assert.deepEqual({manualBinding,manualValues},before);
});

test('the confirmed child rule covers every even size 4 to 16 once per selling unit without garment bindings',async()=>{
 const env=fixture();try{const state=await readCostRules(env);assert.equal(state.revision,1);assert.equal(state.values.rules[0].unit_cost_cents,1250);
 await syncCostRuleCatalog(env,['101'],async(_,input)=>{assert.deepEqual(input,{item_ids:['101'],selling_unit:'AUTO',include_cost_catalog:true});return provider();},{now});
 const rules=await readCostRuleReference(env,['101'],{now}),result=reference(rules);assert.equal(result.total_cents,17500);assert.equal(result.unmapped_quantity,0);assert.ok(result.variants.every(row=>row.unit_cost_cents===1250&&row.cost_source==='CUSTOM_PROFILE'));assert.match(result.variants[0].cost_profile_label,/infantil · 4/);assert.match(result.variants.at(-1).cost_profile_label,/16/);
 const removed=productionCostReference({status:'AVAILABLE',rows:[{item_id:'101',model_id:'99',quantity:1}]},{revision:1,bindings:[{item_id:'101',model_id:'99',size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}]},{revision:1,values:COST_DEFAULTS},rules);assert.equal(removed.total_cents,null,'a removed child model cannot inherit an old adult default');
 }finally{env.ADMIN_DB.db.close();}
});
test('numeric sizes never choose the product type and pants, shorts, kits or unknown clothing never borrow the child cost',()=>{
 for(const name of ['Calça Baggy Infantil','Short Infantil','Kit Camiseta Infantil','Camiseta Moletom Infantil','Produto sem tipo']){const rows=evaluateCostRules(COST_RULE_DEFAULTS,'101',catalog(name));assert.ok(rows.every(row=>row.unit_cost_cents===null));}
 assert.deepEqual(evaluateCostRules(COST_RULE_DEFAULTS,'101',catalog('Camiseta Adulto',['P','GG'])),[]);
 const numeric=evaluateCostRules(COST_RULE_DEFAULTS,'101',catalog('Camiseta Infantil',['2','18','P','M']));assert.ok(numeric.every(row=>row.unit_cost_cents===null));
 assert.equal(evaluateCostRules(COST_RULE_DEFAULTS,'101',catalog('Camisetas infantis',['4 anos']))[0].unit_cost_cents,1250);
});
test('new product rules distinguish pants and shorts and can price a whole unit without doubling kits',()=>{
 const child=structuredClone(COST_RULE_DEFAULTS.rules[0]),baggy={...child,id:'baggy',label:'Calça baggy',unit_cost_cents:3500,name_patterns:['calça baggy'],exclude_terms:[],options:['4','6']};
 const values={rules:[child,baggy]};assert.equal(evaluateCostRules(values,'101',catalog('Calça Baggy Infantil',['4']))[0].unit_cost_cents,3500);
 const whole={...baggy,id:'kit',label:'Kit completo',unit_cost_cents:4000,name_patterns:['kit casal'],options:[],axis_names:[]};const matches=evaluateCostRules({rules:[whole]},'101',catalog('Kit Casal',['M']));assert.equal(matches[0].unit_cost_cents,4000);
});
test('overlapping rules and ambiguous size axes stay pending instead of silently choosing a price',()=>{
 const child=structuredClone(COST_RULE_DEFAULTS.rules[0]),other={...child,id:'other',unit_cost_cents:1300,options:['4']};
 const rows=evaluateCostRules({rules:[child,other]},'101',catalog());assert.equal(rows[0].unit_cost_cents,null);assert.equal(rows[0].reason,'RULE_CONFLICT');assert.equal(rows[1].unit_cost_cents,1250);
 const meta=catalog();meta.variants[0].attributes=[{name:'Tamanho',value:'4'},{name:'Tamanho infantil',value:'6'}];assert.equal(evaluateCostRules({rules:[child]},'101',meta)[0].unit_cost_cents,null);
});
test('manual variation and product costs win over automatic rules; an unmatched automatic type blocks an old shirt default',()=>{
 const automatic={revision:1,variants:evaluateCostRules(COST_RULE_DEFAULTS,'101',catalog())};
 const result=reference(automatic,{custom_profiles:[{id:'manual',label:'Exceção manual',unit_cost_cents:999}],custom_assignments:[{item_id:'101',model_id:'0',profile_id:'manual'}]});assert.equal(result.variants[0].unit_cost_cents,999);assert.equal(result.variants[1].unit_cost_cents,1250);
 const blocked=evaluateCostRules(COST_RULE_DEFAULTS,'101',catalog('Calça Baggy',['P']));const ref=productionCostReference({status:'AVAILABLE',rows:[{item_id:'101',model_id:'0',quantity:1}]},{revision:1,bindings:[{item_id:'101',model_id:'0',size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}]},{revision:1,values:COST_DEFAULTS},{revision:1,variants:blocked});assert.equal(ref.total_cents,null);
});
test('cached catalogue metadata is reapplied immediately after a rule edit while audit and stale-write protection are preserved',async()=>{
 const env=fixture();try{await syncCostRuleCatalog(env,['101'],async()=>provider(),{now});const first=await readCostRules(env),values=structuredClone(first.values);values.rules[0].unit_cost_cents=1300;
 const saved=await saveCostRules(env,{revision:first.revision,values},'admin');assert.equal(saved.revision,2);assert.equal((await readCostRuleReference(env,['101'],{now})).variants[0].unit_cost_cents,1300);
 await assert.rejects(saveCostRules(env,{revision:1,values},'admin'),error=>error.status===409);const audit=env.ADMIN_DB.db.prepare('SELECT payload FROM production_cost_rules_audit ORDER BY revision').all();assert.equal(audit.length,2);assert.equal(JSON.parse(audit[0].payload).rules[0].unit_cost_cents,1250);
 }finally{env.ADMIN_DB.db.close();}
});
test('fresh catalogue skips duplicate provider reads, saved classification survives age and poisoned replies cannot overwrite it',async()=>{
 const env=fixture();try{let calls=0;const read=async()=>{calls++;return provider();};await syncCostRuleCatalog(env,['101'],read,{now});await syncCostRuleCatalog(env,['101'],read,{now});assert.equal(calls,1);
 const old=await readCostRuleReference(env,['101'],{now:()=>clock+901000});assert.ok(old.variants.every(row=>row.unit_cost_cents===1250&&row.reason===null));
 const before=env.ADMIN_DB.db.prepare('SELECT * FROM production_cost_catalog').all();await assert.rejects(syncCostRuleCatalog(env,['101'],async()=>({...provider(),secret:'PRIVATE'}),{now,force:true}));assert.deepEqual(env.ADMIN_DB.db.prepare('SELECT * FROM production_cost_catalog').all(),before);
 }finally{env.ADMIN_DB.db.close();}
});
test('strict rules reject invalid amounts, missing identity conditions, duplicate IDs and accessors without invoking them',()=>{
 const base=structuredClone(COST_RULE_DEFAULTS),rule=base.rules[0];for(const patch of [{unit_cost_cents:0},{unit_cost_cents:12.5},{unit_cost_cents:1000001},{name_patterns:[]},{axis_names:[]},{options:['4','4 anos']},{extra:'PRIVATE'}])assert.throws(()=>validateCostRules({rules:[{...rule,...patch}]}));
 assert.throws(()=>validateCostRules({rules:[rule,rule]}));let calls=0;const bad={...rule};Object.defineProperty(bad,'unit_cost_cents',{get(){calls++;return 1250;},enumerable:true});assert.throws(()=>validateCostRules({rules:[bad]}));assert.equal(calls,0);
 const metadata=catalog();Object.defineProperty(metadata,'variants',{get(){calls++;return [];},enumerable:true});assert.throws(()=>evaluateCostRules(base,'101',metadata));assert.equal(calls,0);
});
test('background selection visits uncached products before refreshing old catalogues and skips fresh reads',async()=>{
 const env=fixture();try{await syncCostRuleCatalog(env,['101'],async()=>provider(),{now});
 assert.deepEqual(await selectCostRuleCandidates(env,['101','102','103','104','105'],{now}),['102','103','104']);
 assert.deepEqual(await selectCostRuleCandidates(env,['101'],{now}),[]);
 assert.deepEqual(await selectCostRuleCandidates(env,['101','102'],{now:()=>clock+601000}),['102','101']);
 }finally{env.ADMIN_DB.db.close();}
});
test('audit collisions roll back the complete rule change and deleted rule state cannot reset an existing history',async()=>{
 const env=fixture();try{const first=await readCostRules(env);env.ADMIN_DB.db.prepare('INSERT INTO production_cost_rules_audit VALUES(2,?,?,?)').run(JSON.stringify(first.values),'fixture',first.updated_at);
 await assert.rejects(saveCostRules(env,{revision:1,values:{rules:[]}},'admin'));assert.deepEqual(await readCostRules(env),first);env.ADMIN_DB.db.prepare('DELETE FROM production_cost_rules_state').run();await assert.rejects(readCostRules(env));
 }finally{env.ADMIN_DB.db.close();}
});

test('an explicit child variation size works without catalogue metadata and never receives the adult cost',async()=>{
 const env=fixture();try{const initial=await readCostRules(env);assert.deepEqual(Object.keys(initial.values),['rules']);
 const assigned=await assignCostRules(env,{revision:initial.revision,assignments:[{item_id:'101',model_id:'189628289639',rule_id:'camiseta-infantil',size:'4'}]},'admin');assert.equal(assigned.revision,2);
 const rules=await readCostRuleReference(env,['101'],{now}),frame={status:'AVAILABLE',rows:[{item_id:'101',model_id:'189628289639',quantity:2},{item_id:'101',model_id:'2',quantity:1}]},bindings={revision:1,bindings:[{item_id:'101',model_id:'189628289639',size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:true},{item_id:'101',model_id:'2',size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}]};
 const result=productionCostReference(frame,bindings,{revision:1,values:COST_DEFAULTS},rules);assert.equal(result.variants[0].unit_cost_cents,1250);assert.equal(result.variants[0].production_cost_cents,2500);assert.equal(result.variants[1].unit_cost_cents,1590);assert.equal(result.total_cents,4090);assert.equal(rules.restricted_item_ids.includes('101'),false);
 const manual={...COST_DEFAULTS,custom_profiles:[{id:'manual',label:'Custo manual',unit_cost_cents:1100}],custom_assignments:[{item_id:'101',model_id:'189628289639',profile_id:'manual'}]};assert.equal(productionCostReference(frame,bindings,{revision:2,values:manual},rules).variants[0].unit_cost_cents,1100);
 }finally{env.ADMIN_DB.db.close();}
});

test('assigned sizes follow current rule prices, while disabling or deleting a rule leaves the assignment pending',async()=>{
 const env=fixture();try{let state=await readCostRules(env);state=await assignCostRules(env,{revision:state.revision,assignments:[{item_id:'101',model_id:'0',rule_id:'camiseta-infantil',size:'16'}]},'admin');
 const values=structuredClone(state.values);values.rules[0].unit_cost_cents=1400;state=await saveCostRules(env,{revision:state.revision,values},'admin');assert.equal((await readCostRuleReference(env,['101'],{now})).variants[0].unit_cost_cents,1400);
 values.rules[0].enabled=false;state=await saveCostRules(env,{revision:state.revision,values},'admin');assert.equal((await readCostRuleReference(env,['101'],{now})).variants[0].unit_cost_cents,null);
 state=await saveCostRules(env,{revision:state.revision,values:{rules:[],assignments:state.values.assignments}},'admin');const pending=await readCostRuleReference(env,['101'],{now});assert.equal(pending.variants[0].reason,'RULE_ASSIGNMENT_PENDING');assert.equal(state.values.assignments.length,1);
 state=await assignCostRules(env,{revision:state.revision,assignments:[{item_id:'101',model_id:'0',rule_id:null,size:null}]},'admin');assert.deepEqual(state.values.assignments,[]);
 }finally{env.ADMIN_DB.db.close();}
});

test('a product rule bypasses title matching but still needs a valid size axis, and an explicit variation takes priority',async()=>{
 const env=fixture();try{let state=await readCostRules(env);const values=structuredClone(state.values);values.rules.push({...values.rules[0],id:'child-special',label:'Infantil especial',unit_cost_cents:1550});state=await saveCostRules(env,{revision:state.revision,values},'admin');
 state=await assignCostRules(env,{revision:state.revision,assignments:[{item_id:'101',model_id:null,rule_id:'camiseta-infantil',size:null},{item_id:'101',model_id:'0',rule_id:'child-special',size:'4'}]},'admin');
 const pending=await readCostRuleReference(env,['101'],{now});assert.ok(pending.restricted_item_ids.includes('101'));assert.equal(pending.variants[0].unit_cost_cents,1550);
 await syncCostRuleCatalog(env,['101'],async()=>provider(catalog('Produto com título antigo',['4','6','18'])),{now});const reference=await readCostRuleReference(env,['101'],{now});assert.deepEqual(reference.variants.map(row=>row.unit_cost_cents),[1550,1250,null]);
 const bad=catalog('Produto com título antigo',['6']);bad.variants[0].attributes=[{name:'Código',value:'6'}];assert.equal(evaluateCostRules(state.values,'101',{...bad,variants:[{...bad.variants[0],model_id:'1'}]})[0].unit_cost_cents,null);
 }finally{env.ADMIN_DB.db.close();}
});

test('assignment patches preserve unrelated scopes and old clients cannot erase assigned classifications',async()=>{
 const env=fixture();try{let state=await readCostRules(env);state=await assignCostRules(env,{revision:state.revision,assignments:[{item_id:'101',model_id:'0',rule_id:'camiseta-infantil',size:'4'},{item_id:'102',model_id:'0',rule_id:'camiseta-infantil',size:'6'}]},'admin');
 const before=await readCostRules(env);await assert.rejects(saveCostRules(env,{revision:state.revision,values:{rules:state.values.rules}},'admin'),error=>error.status===409&&error.message==='COST_RULE_ASSIGNMENTS_CHANGED_RELOAD');assert.deepEqual(await readCostRules(env),before);
 await assert.rejects(assignCostRules(env,{revision:1,assignments:[{item_id:'101',model_id:'0',rule_id:null,size:null}]},'admin'),error=>error.status===409);
 state=await assignCostRules(env,{revision:state.revision,assignments:[{item_id:'101',model_id:'0',rule_id:null,size:null}]},'admin');assert.deepEqual(state.values.assignments,[{item_id:'102',model_id:'0',rule_id:'camiseta-infantil',size:'6'}]);
 for(const assignment of [{item_id:'102',model_id:'0',rule_id:'camiseta-infantil',size:'5'},{item_id:'102',model_id:null,rule_id:'camiseta-infantil',size:'4'},{item_id:'102',model_id:'0',rule_id:'missing',size:'6'}])await assert.rejects(assignCostRules(env,{revision:state.revision,assignments:[assignment]},'admin'));
 assert.deepEqual(await readCostRules(env),state);const accessor={item_id:'102',model_id:'0',rule_id:'camiseta-infantil',size:'6'};let calls=0;Object.defineProperty(accessor,'size',{get(){calls++;return '6';},enumerable:true});assert.throws(()=>validateCostRules({rules:state.values.rules,assignments:[accessor]}));assert.equal(calls,0);
 }finally{env.ADMIN_DB.db.close();}
});
