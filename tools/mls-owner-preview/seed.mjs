import {readProductionCosts,saveProductionCosts} from '../../web/cloudflare/src/production-costs.mjs';
import {readCostRules,saveCostRules} from '../../web/cloudflare/src/cost-rules.mjs';
import {deriveCatalogProduct,deriveProductCostCatalog} from '../../web/finance/src/variant-catalog-frame.mjs';
import {storeCatalogClassificationFrame} from '../../web/cloudflare/src/catalog-classification.mjs';
import {runProductRegistry} from '../../web/cloudflare/src/product-registry.mjs';

export async function seedPreviewCatalog(env){
 const stamp=Math.floor(Date.now()/1000),now=()=>stamp*1000;
 const costs=await readProductionCosts(env);
 await saveProductionCosts(env,{revision:costs.revision,values:{...costs.values,inclusive_regular_cents:1590,inclusive_plus_cents:2140}},'LOCAL_PREVIEW_SYNTHETIC');
 const rules=await readCostRules(env);
 await saveCostRules(env,{revision:rules.revision,values:{...rules.values,rules:rules.values.rules.map(rule=>rule.id==='camiseta-infantil'?{...rule,options:['2','4','6','8','10','12','14','16']}:rule)}},'LOCAL_PREVIEW_SYNTHETIC');
 const definitions=[
  {id:'990001',name:'Camiseta adulta · DEMONSTRAÇÃO',axes:[['Cor',['Azul','Preto']],['Tamanho',['P','GG','G3']]],indices:[[0,0],[0,1],[1,0],[1,2]]},
  {id:'990002',name:'Camiseta infantil · DEMONSTRAÇÃO',axes:[['Tamanho',['2','4','6','8','10','12','14','16']]],indices:Array.from({length:8},(_,index)=>[index])},
  {id:'990003',name:'Kit casal 2 camisetas · DEMONSTRAÇÃO',axes:[['Tamanho Masculino',['GG']],['Tamanho Feminino',['G3']]],indices:[[0,0]]}
 ];
 for(const definition of definitions){
  const response={tier_variation:definition.axes.map(([name,options])=>({name,option_list:options.map(option=>({option}))})),model:definition.indices.map((tier_index,index)=>({model_id:Number(definition.id)*100+index,tier_index}))};
  const product=await deriveCatalogProduct(definition.id,response,{selling_unit:'AUTO'});product.cost_catalog=deriveProductCostCatalog(response,definition.name);
  await storeCatalogClassificationFrame(env,{schema:'variant_catalog_v1',checked_at:stamp,products:[product]},{now});
 }
 await runProductRegistry(env,async(_,input)=>{const items=input.item_status==='NORMAL'?definitions.map(row=>({item_id:row.id,item_status:'NORMAL',source_update_time:stamp-1})):[];return {schema:'product_index_v1',status:'AVAILABLE',shop_id:1178167501,checked_at:stamp,...input,total_count:items.length,has_more:false,next_offset:null,items};},{now});
 return {source:'ORIGINAL_SYNTHETIC_FIXTURES',products:definitions.length,variants:definitions.reduce((sum,row)=>sum+row.indices.length,0)};
}
