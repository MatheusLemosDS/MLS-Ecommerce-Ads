import {projectProductRegistryFrame} from './product-registry.mjs';
import {AiSalesContractError,readAiSalesRecord,makeAiSalesProductKey,validateAiSalesProductSnapshot} from './mls-ai-sales-contracts.mjs';

// This registry belongs to the application's existing, single configured Shopee
// profile. The local reference is not an OAuth grant or a user-selected shop.
export const AI_SALES_SAVED_SHOP_REF='primary-shopee';
const aiSavedFail=code=>{throw new AiSalesContractError(code);};
const aiSavedInt=(v,min,max)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
function aiSavedOptions(value,allowed){
 readAiSalesRecord(value,Object.keys(value||{}),'AI_SALES_CATALOG_REQUEST_INVALID');
 if(Object.keys(value).some(key=>!allowed.includes(key)))aiSavedFail('AI_SALES_CATALOG_REQUEST_INVALID');
 return value;
}

/** An imported file is a declaration, even if its JSON says VERIFIED. */
export function importAiSalesManualProduct(raw,{at}={}){
 if(!aiSavedInt(at,1,4102444800))aiSavedFail('AI_SALES_PRODUCT_IMPORT_INVALID');
 const checked=validateAiSalesProductSnapshot(raw),copy=JSON.parse(JSON.stringify(checked));
 const existing=new Map(copy.observations.map(row=>[row.field,row.evidence]));
 copy.verified_product_attributes=[];
 copy.observations=[];
 for(const field of ['title','sku','price_cents','cost_cents','fees_cents','inventory_units','piece_count']){
  if(copy[field]===null)continue;
  const old=existing.get(field);
  copy.observations.push({field,evidence:{source:'OPERATOR_IMPORTED',status:'DECLARED',
   observed_at:old?.observed_at??at,reference:'manual-product-'+copy.platform_product_id,
   marketplace:copy.marketplace,shop_ref:copy.shop_ref,currency:copy.currency,
   basis:'OPERATOR_IMPORTED_PRODUCT'}});
 }
 return validateAiSalesProductSnapshot(copy);
}

/** Translate source fields only; never infer a SKU, sale price or stock. */
export function projectAiSalesSavedVariant(raw,{model_id,at,shop_ref=AI_SALES_SAVED_SHOP_REF}={}){
 const frame=projectProductRegistryFrame(raw);
 if(!frame||frame.schema!=='product_registry_detail_v1'||shop_ref!==AI_SALES_SAVED_SHOP_REF||
  !aiSavedInt(at,1,4102444800))aiSavedFail('AI_SALES_CATALOG_SOURCE_INVALID');
 const product=frame.product,variant=frame.variants.find(row=>row.model_id===model_id);
 if(!variant)aiSavedFail('AI_SALES_CATALOG_VARIANT_MISSING');
 if(product.item_status!=='NORMAL'||product.metadata_changed)aiSavedFail('AI_SALES_CATALOG_PRODUCT_NOT_CURRENT');
 const stamp=product.catalog_checked_at;
 if(!aiSavedInt(stamp,1,at)||stamp>frame.checked_at)aiSavedFail('AI_SALES_CATALOG_SOURCE_TIME_UNKNOWN');
 if(!product.product_name||product.product_name.length>200)aiSavedFail('AI_SALES_CATALOG_TITLE_UNKNOWN');
 const marketplace='SHOPEE_BR',currency=variant.unit_cost_cents===null?null:'BRL';
 const evidence=(source,status,observed_at,basis,money=null)=>({source,status,observed_at,basis,
  marketplace,shop_ref,currency:money,reference:'saved-product-'+product.item_id+'-'+variant.model_id});
 const catalog=evidence('SHOPEE_SAVED','VERIFIED',stamp,'SAVED_CATALOG_OBSERVATION');
 const observations=[{field:'title',evidence:catalog}];
 if(currency!==null)observations.push({field:'cost_cents',evidence:evidence(
  'OPERATOR_REGISTERED_COST','DECLARED',frame.checked_at,'CURRENT_REGISTERED_UNIT_COST','BRL')});
 let components=[],piece_count=null;
 if(variant.selling_unit==='SINGLE_GARMENT'&&variant.size!==null){
  piece_count=1;components=[{component_ref:'garment',size:variant.size,quantity:1,art_ref:null}];
 }else if(variant.selling_unit==='ONE_MALE_ONE_FEMALE_KIT'&&variant.male_size!==null&&variant.female_size!==null){
  piece_count=2;components=[{component_ref:'male',size:variant.male_size,quantity:1,art_ref:null},
   {component_ref:'female',size:variant.female_size,quantity:1,art_ref:null}];
 }
 // A generic custom cost may represent one child shirt or a three-piece kit.
 // Its label and amount do not prove a physical composition.
 if(piece_count!==null)observations.push({field:'piece_count',evidence:evidence(
  'SAVED_COST_BINDING','DECLARED',frame.checked_at,'REGISTERED_SALE_COMPOSITION')});
 const names=new Set(),attributes=[];
 for(const row of variant.attributes){
  if(!row.name.trim()||!row.value.trim()||row.name.length>60||row.value.length>160||names.has(row.name))continue;
  names.add(row.name);attributes.push({name:row.name,value:row.value,evidence:catalog});
 }
 return validateAiSalesProductSnapshot({schema:'mls_ai_sales_product_snapshot_v1',
  product_key:makeAiSalesProductKey({marketplace,shop_ref,platform_product_id:product.item_id,variant_ref:variant.model_id}),
  marketplace,shop_ref,platform_product_id:product.item_id,variant_ref:variant.model_id,
  sku:null,title:product.product_name,verified_product_attributes:attributes,landing_url:null,
  price_cents:null,currency,cost_cents:variant.unit_cost_cents,fees_cents:null,inventory_units:null,
  piece_count,components,observations,media_refs:[]});
}

export async function loadAiSalesSavedCatalog(api,options={}){
 if(typeof api!=='function')aiSavedFail('AI_SALES_CATALOG_REQUEST_INVALID');
 aiSavedOptions(options,['offset','limit','search']);
 const {offset=0,limit=20,search=''}=options;
 if(!aiSavedInt(offset,0,1000000)||!aiSavedInt(limit,1,100)||typeof search!=='string'||search.length>120||
  /[\u0000-\u001f\u007f-\u009f]/.test(search))aiSavedFail('AI_SALES_CATALOG_REQUEST_INVALID');
 const query=new URLSearchParams({limit:String(limit),offset:String(offset),search,item_status:'ACTIVE'});
 const frame=projectProductRegistryFrame(await api('product-registry?'+query));
 if(!frame||frame.schema!=='product_registry_v1')aiSavedFail('AI_SALES_CATALOG_SOURCE_INVALID');
 return frame;
}

export async function loadAiSalesSavedVariants(api,options={}){
 if(typeof api!=='function')aiSavedFail('AI_SALES_CATALOG_REQUEST_INVALID');
 aiSavedOptions(options,['item_id','shop_ref','offset','limit','at']);
 const {item_id,shop_ref=AI_SALES_SAVED_SHOP_REF,offset=0,limit=50,at}=options;
 if(typeof item_id!=='string'||!/^\d{1,20}$/.test(item_id)||item_id.startsWith('0')||
  shop_ref!==AI_SALES_SAVED_SHOP_REF||!aiSavedInt(offset,0,1000000)||!aiSavedInt(limit,1,100)||
  !aiSavedInt(at,1,4102444800))aiSavedFail('AI_SALES_CATALOG_REQUEST_INVALID');
 const query=new URLSearchParams({item_id,variant_limit:String(limit),variant_offset:String(offset)});
 const frame=projectProductRegistryFrame(await api('product-registry?'+query));
 if(!frame||frame.schema!=='product_registry_detail_v1'||frame.product.item_id!==item_id)aiSavedFail('AI_SALES_CATALOG_SOURCE_INVALID');
 const products=[],blocked=[];
 for(const row of frame.variants){
  try{products.push(projectAiSalesSavedVariant(frame,{model_id:row.model_id,shop_ref,at}));}
  catch(error){if(!(error instanceof AiSalesContractError))throw error;blocked.push({model_id:row.model_id,code:error.code});}
 }
 return {schema:'mls_ai_sales_saved_variants_v1',shop_ref,checked_at:frame.checked_at,
  source_checked_at:frame.product.catalog_checked_at,product:frame.product,pagination:frame.pagination,products,blocked};
}
