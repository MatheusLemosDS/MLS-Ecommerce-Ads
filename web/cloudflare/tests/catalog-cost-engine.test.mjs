import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {COST_DEFAULTS,productionCostReference} from '../src/production-costs.mjs';
import {readCostRules,saveCostRules,syncCostRuleCatalog,readCostRuleReference} from '../src/cost-rules.mjs';

const clock=Date.UTC(2026,9,25,12),stamp=clock/1000;
const now=()=>clock;
function product(item_id='101',{kit=false,count=1,models=null,title=kit?'Kit Camiseta Casal':'Camiseta Adulto',size='G'}={}){
 const ids=models||Array.from({length:count},(_,index)=>String(index));
 return {item_id,catalog_fingerprint:(kit?'b':'a').repeat(64),selling_unit:kit?'ONE_MALE_ONE_FEMALE_KIT':'SINGLE_GARMENT',bindings:ids.map(model_id=>({item_id,model_id,...(kit?{male_size:'M',female_size:'G1'}:{size})})),unresolved_count:0,cost_catalog:{schema:'product_cost_catalog_v1',product_name:title,variants:ids.map(model_id=>({model_id,attributes:kit?[{name:'Tamanho Masculino',value:'HOMEM M'},{name:'Tamanho Feminino',value:'MULHER G1'}]:[{name:'Cor',value:'Verde'},{name:'Tamanho',value:size}]}))}};
}
const source=(products,at=stamp)=>({schema:'variant_catalog_v1',checked_at:at,products});
const prices=(rows,reference,bindings=[],values=COST_DEFAULTS)=>productionCostReference({status:'AVAILABLE',rows},{revision:1,bindings},{revision:1,values},reference);

test('one catalogue response persists adult and couple-kit composition without a legacy global binding write',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());
 await syncCostRuleCatalog(env,['101','102'],async()=>source([product('101'),product('102',{kit:true})]),{now});
 const reference=await readCostRuleReference(env,['101','102'],{now});
 assert.ok(reference.classification_revision>=1);assert.equal(reference.catalog_bindings.length,2);
 const result=prices([{item_id:'101',model_id:'0',quantity:2},{item_id:'102',model_id:'0',quantity:1}],reference);
 assert.equal(result.total_cents,6660);assert.equal(result.variants[0].unit_cost_cents,1590);assert.equal(result.variants[1].unit_cost_cents,3480);
 assert.equal(result.variants[0].catalog_binding.size,'G');assert.equal(result.variants[1].catalog_binding.female_size,'G1');
 assert.equal(env.ADMIN_DB.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='variant_bindings_state'").get().n,0);
 const older=await readCostRuleReference(env,['101','102'],{now:()=>clock+2*86400000});
 assert.equal(prices([{item_id:'101',model_id:'0',quantity:1},{item_id:'102',model_id:'0',quantity:1}],older).total_cents,5070,'saved classifications do not become unknown solely because a daily recheck is overdue');
 const changed={...COST_DEFAULTS,inclusive_regular_cents:1700,inclusive_plus_cents:2100};
 assert.equal(prices([{item_id:'101',model_id:'0',quantity:1},{item_id:'102',model_id:'0',quantity:1}],older,[],changed).total_cents,5500,'the saved composition uses current production prices');
});

test('three thousand automatic model compositions are priced in bounded financial batches without the legacy array cap',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());const ids=['101','102','103'];
 for(const id of ids)await syncCostRuleCatalog(env,[id],async()=>source([product(id,{count:1000})]),{now});
 const reference=await readCostRuleReference(env,ids,{now});assert.equal(reference.catalog_bindings.length,3000);
 let total=0;for(const id of ids){const rows=Array.from({length:1000},(_,index)=>({item_id:id,model_id:String(index),quantity:1})),result=prices(rows,reference);assert.equal(result.unmapped_quantity,0);total+=result.total_cents;}
 assert.equal(total,4770000);
});

test('a manual garment composition wins over a new automatic composition and manual fixed prices still win over both',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());
 await syncCostRuleCatalog(env,['101'],async()=>source([product('101',{size:'G1'})]),{now});const reference=await readCostRuleReference(env,['101'],{now});
 const binding={item_id:'101',model_id:'0',selling_unit:'SINGLE_GARMENT',size:'P',operator_confirmed:true},rows=[{item_id:'101',model_id:'0',quantity:1}];
 const manual=prices(rows,reference,[binding]);assert.equal(manual.total_cents,1590);assert.equal(manual.variants[0].catalog_binding,undefined);
 const fixed={...COST_DEFAULTS,custom_profiles:[{id:'special',label:'Exceção manual',unit_cost_cents:900}],custom_assignments:[{item_id:'101',model_id:'0',profile_id:'special'}]};
 assert.equal(prices(rows,reference,[binding],fixed).total_cents,900);
});

test('a confirmed new catalogue removes only automatic model classifications instead of reviving an obsolete legacy binding',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());
 await syncCostRuleCatalog(env,['101'],async()=>source([product('101',{models:['0','1']})]),{now});
 await syncCostRuleCatalog(env,['101'],async()=>source([product('101',{models:['1']})],stamp+1),{now:()=>clock+1000,force:true});
 const reference=await readCostRuleReference(env,['101'],{now:()=>clock+1000}),old={item_id:'101',model_id:'0',selling_unit:'SINGLE_GARMENT',size:'P',operator_confirmed:false,source:'CATALOG_SIZE_AXIS',catalog_fingerprint:'a'.repeat(64)};
 const result=prices([{item_id:'101',model_id:'0',quantity:1},{item_id:'101',model_id:'1',quantity:1}],reference,[old]);
 assert.equal(result.total_cents,null);assert.equal(result.known_subset_cents,1590);assert.equal(result.variants[0].unit_cost_cents,null);assert.equal(result.variants[1].unit_cost_cents,1590);
});

test('a size-shaped pants catalogue cannot acquire a shirt price, and current child rules remain effective while rechecks wait',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());
 await syncCostRuleCatalog(env,['101'],async()=>source([product('101',{title:'Calça Baggy',size:'M'})]),{now});
 const pants=await readCostRuleReference(env,['101'],{now});assert.equal(prices([{item_id:'101',model_id:'0',quantity:1}],pants).total_cents,null);
 const child={item_id:'102',catalog_fingerprint:'c'.repeat(64),bindings:[],unresolved_count:1,cost_catalog:{schema:'product_cost_catalog_v1',product_name:'Camiseta Infantil',variants:[{model_id:'0',attributes:[{name:'Tamanho',value:'4'}]}]}};
 await syncCostRuleCatalog(env,['102'],async()=>source([child]),{now});let childReference=await readCostRuleReference(env,['102'],{now:()=>clock+2*86400000});
 assert.equal(prices([{item_id:'102',model_id:'0',quantity:2}],childReference).total_cents,2500);
 const state=await readCostRules(env);state.values.rules[0].unit_cost_cents=1400;await saveCostRules(env,{revision:state.revision,values:state.values},'fixture');
 childReference=await readCostRuleReference(env,['102'],{now:()=>clock+2*86400000});assert.equal(prices([{item_id:'102',model_id:'0',quantity:2}],childReference).total_cents,2800);
});
