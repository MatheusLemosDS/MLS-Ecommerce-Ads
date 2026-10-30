import test from 'node:test';
import assert from 'node:assert/strict';
import {projectAiSalesSavedVariant,loadAiSalesSavedCatalog,loadAiSalesSavedVariants,importAiSalesManualProduct} from '../src/mls-ai-sales-catalog.mjs';

const stamp=1793390000;
function detail(){return {schema:'product_registry_detail_v1',checked_at:stamp+60,
 product:{item_id:'12345',item_status:'NORMAL',product_name:'Camiseta de teste',source_update_time:stamp,
  last_seen_at:stamp,catalog_checked_at:stamp,catalog_status:'MATCHED',model_count:1,resolved_count:1,metadata_changed:false},
 pagination:{limit:50,offset:0,total:1,more:false},revisions:{costs:1,bindings:1,cost_rules:1,classifications:1},
 variants:[{model_id:'98765',model_name:'Azul / G',attributes:[{name:'Cor',value:'Azul'},{name:'Tamanho',value:'G'}],
  unit_cost_cents:1590,selling_unit:'SINGLE_GARMENT',size:'G',male_size:null,female_size:null,
  cost_profile_id:null,cost_profile_label:null,reason:null}]};}

test('saved catalog preserves source age, registered cost and unknown commercial fields',()=>{
 const input=detail(),output=projectAiSalesSavedVariant(input,{model_id:'98765',at:stamp+120});
 assert.equal(output.product_key,'SHOPEE_BR:primary-shopee:12345:98765');
 assert.equal(output.observations[0].evidence.observed_at,stamp);
 assert.equal(output.observations.find(row=>row.field==='cost_cents').evidence.status,'DECLARED');
 assert.equal(output.cost_cents,1590);assert.equal(output.currency,'BRL');
 for(const field of ['sku','price_cents','fees_cents','inventory_units','landing_url'])assert.equal(output[field],null);
 assert.deepEqual(output.media_refs,[]);assert.equal(output.piece_count,1);assert.equal(output.components[0].size,'G');
 assert.ok(Object.isFrozen(output));assert.equal(input.variants[0].model_id,'98765');
});
test('registered two-piece bindings are distinct from generic child and multi-piece costs',()=>{
 const input=detail(),row=input.variants[0];row.selling_unit='ONE_MALE_ONE_FEMALE_KIT';row.size=null;row.male_size='G';row.female_size='G3';row.unit_cost_cents=3730;
 const kit=projectAiSalesSavedVariant(input,{model_id:row.model_id,at:stamp+120});assert.equal(kit.piece_count,2);assert.equal(kit.components.length,2);
 row.selling_unit='CUSTOM_PRODUCT';row.male_size=null;row.female_size=null;row.cost_profile_id='infantil';row.cost_profile_label='Camiseta infantil';row.unit_cost_cents=1250;
 const child=projectAiSalesSavedVariant(input,{model_id:row.model_id,at:stamp+120});assert.equal(child.piece_count,null);assert.deepEqual(child.components,[]);assert.equal(child.cost_cents,1250);
});
test('an incomplete kit fallback does not prove two physical pieces',()=>{
 const input=detail(),row=input.variants[0];row.selling_unit='ONE_MALE_ONE_FEMALE_KIT';row.size=null;
 assert.equal(projectAiSalesSavedVariant(input,{model_id:row.model_id,at:stamp+120}).piece_count,null);
});
test('changed, removed, unnamed or future catalog data cannot become current video products',()=>{
 for(const change of [x=>x.product.metadata_changed=true,x=>x.product.item_status='UNLIST',x=>x.product.product_name=null,
  x=>x.product.catalog_checked_at=stamp+121,x=>x.product.catalog_checked_at=null]){
  const input=detail();change(input);assert.throws(()=>projectAiSalesSavedVariant(input,{model_id:'98765',at:stamp+120}),/^AiSalesContractError: AI_SALES_/);
 }
});
test('saved variants use only the existing authenticated local GET and isolate unavailable variants',async()=>{
 const calls=[],input=detail();const result=await loadAiSalesSavedVariants(async path=>{calls.push(path);return input;},{item_id:'12345',at:stamp+120});
 assert.equal(result.products.length,1);assert.deepEqual(result.blocked,[]);assert.equal(result.source_checked_at,stamp);
 assert.deepEqual(calls,['product-registry?item_id=12345&variant_limit=50&variant_offset=0']);
 input.product.metadata_changed=true;const changed=await loadAiSalesSavedVariants(async()=>input,{item_id:'12345',at:stamp+120});
 assert.equal(changed.products.length,0);assert.equal(changed.blocked[0].code,'AI_SALES_CATALOG_PRODUCT_NOT_CURRENT');
});
test('invalid scope, accessors and pagination reject before any local or external request',async()=>{
 let calls=0;const api=async()=>{calls++;throw Error('must not run');};
 for(const options of [{item_id:'12345',shop_ref:'another-shop',at:stamp},{item_id:'https://attacker.test',at:stamp},
  {item_id:'12345',at:stamp,offset:-1},{item_id:'12345',at:stamp,token:'bad'}])await assert.rejects(loadAiSalesSavedVariants(api,options));
 const accessor={};Object.defineProperty(accessor,'search',{enumerable:true,get(){throw Error('must not evaluate');}});
 await assert.rejects(loadAiSalesSavedCatalog(api,accessor),/^AiSalesContractError:/);
 await assert.rejects(loadAiSalesSavedCatalog(api,{limit:0}));assert.equal(calls,0);
});
test('manual product import cannot promote a JSON claim into verified catalog or economic evidence',()=>{
 const native=projectAiSalesSavedVariant(detail(),{model_id:'98765',at:stamp+120});
 const imported=importAiSalesManualProduct(native,{at:stamp+180});
 assert.equal(imported.product_key,native.product_key);assert.equal(imported.cost_cents,1590);
 assert.deepEqual(imported.verified_product_attributes,[]);
 assert.ok(imported.observations.every(row=>row.evidence.status==='DECLARED'&&row.evidence.source==='OPERATOR_IMPORTED'));
 assert.equal(imported.observations.find(row=>row.field==='title').evidence.observed_at,stamp);
 assert.equal(native.verified_product_attributes.length,2);assert.equal(native.observations[0].evidence.status,'VERIFIED');
 assert.ok(Object.isFrozen(imported));
});
