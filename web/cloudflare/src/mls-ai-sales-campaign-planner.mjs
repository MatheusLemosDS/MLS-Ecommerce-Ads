import {AiSalesContractError,readAiSalesRecord,readAiSalesList,validateAiSalesProductSnapshot,validateAiSalesAsset,validateAiSalesCampaignPlan,validateAiSalesVideoJob,hashAiSalesValue,canonicalAiSalesJson} from './mls-ai-sales-contracts.mjs';

async function aiSalesAssetInputs(assets){return Promise.all(assets.map(async a=>({asset_id:a.asset_id,product_key:a.product_key,sha256:a.sha256,manifest_hash:await hashAiSalesValue(a)})));}

export const AI_SALES_TEMPLATE_IDS=Object.freeze(['NOSTALGIA_80_90_2000','PRODUCT_DETAILS','COUPLE_KIT']);
/** Local reviewed draft, without a generative model, network, price or stock claim. */
export async function planAiSalesCampaign(raw){
 readAiSalesRecord(raw,['campaign_id','products','assets','template_id','channel','goal','generated_at']);
 if(!Array.isArray(raw.products)||raw.products.length<1||raw.products.length>10||!Array.isArray(raw.assets)||raw.assets.length>300||!AI_SALES_TEMPLATE_IDS.includes(raw.template_id)||!['SHOPEE_VIDEO','TIKTOK_VIDEO'].includes(raw.channel)||!['STORE_VIDEO','AFFILIATE_BRIEF'].includes(raw.goal))throw new AiSalesContractError('AI_SALES_CAMPAIGN_REQUEST_INVALID');
 readAiSalesList(raw.products,10);readAiSalesList(raw.assets,300);
 if(typeof raw.campaign_id!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(raw.campaign_id)||!Number.isSafeInteger(raw.generated_at)||Object.is(raw.generated_at,-0)||raw.generated_at<=0||raw.generated_at>4102444800)throw new AiSalesContractError('AI_SALES_CAMPAIGN_REQUEST_INVALID');
 const products=raw.products.map(validateAiSalesProductSnapshot).sort((a,b)=>a.product_key<b.product_key?-1:a.product_key>b.product_key?1:0),assets=raw.assets.map(validateAiSalesAsset).sort((a,b)=>a.asset_id<b.asset_id?-1:a.asset_id>b.asset_id?1:0);
 const first=products[0],productKeys=new Set(),assetKeys=new Set(),reasons=new Set();
 for(const p of products){if(productKeys.has(p.product_key)||p.marketplace!==first.marketplace||p.shop_ref!==first.shop_ref)throw new AiSalesContractError('AI_SALES_CAMPAIGN_SCOPE_MISMATCH');productKeys.add(p.product_key);if(p.variant_ref===null)reasons.add('PRODUCT_VARIANT_UNKNOWN');if(p.piece_count===null)reasons.add('PRODUCT_UNITS_UNKNOWN');if(raw.template_id==='COUPLE_KIT'&&p.piece_count!==2)reasons.add('COUPLE_KIT_REQUIRES_TWO_PIECES');
  const title=p.observations.find(row=>row.field==='title')?.evidence;if(!title||title.status==='UNKNOWN')reasons.add('PRODUCT_TITLE_EVIDENCE_MISSING');
  for(const row of [title,...p.verified_product_attributes.map(a=>a.evidence)].filter(Boolean))if(row.observed_at>raw.generated_at||raw.generated_at-row.observed_at>2592000)reasons.add('PRODUCT_EVIDENCE_STALE');
 }
 for(const a of assets){if(assetKeys.has(a.asset_id)||!productKeys.has(a.product_key))throw new AiSalesContractError('AI_SALES_ASSET_SCOPE_MISMATCH');assetKeys.add(a.asset_id);const p=products.find(p=>p.product_key===a.product_key);if(a.variant_ref!==p.variant_ref||!p.media_refs.includes(a.asset_id))throw new AiSalesContractError('AI_SALES_ASSET_BINDING_MISMATCH');if(a.rights.status!=='AUTHORIZED')reasons.add('ASSET_RIGHTS_UNCONFIRMED');if(a.rights.observed_at!==null&&a.rights.observed_at>raw.generated_at)reasons.add('ASSET_RIGHTS_EVIDENCE_FUTURE');}
 for(const p of products){
  for(const id of p.media_refs){const bound=assets.find(a=>a.asset_id===id);if(!bound)reasons.add('ASSET_BYTES_NOT_ATTACHED');else if(bound.product_key!==p.product_key)throw new AiSalesContractError('AI_SALES_ASSET_BINDING_MISMATCH');}
  const originals=assets.filter(a=>a.product_key===p.product_key&&a.role!=='ARTWORK'),coverage=new Map(),byHash=new Map();
  for(const a of originals){
   const normalized=[...a.component_coverage].sort((x,y)=>x.component_ref<y.component_ref?-1:x.component_ref>y.component_ref?1:0),declaration=canonicalAiSalesJson(normalized);
   if(byHash.has(a.sha256)&&byHash.get(a.sha256)!==declaration)throw new AiSalesContractError('AI_SALES_ASSET_CONTENT_COVERAGE_CONFLICT');
   byHash.set(a.sha256,declaration);
   for(const row of a.component_coverage){const component=p.components.find(c=>c.component_ref===row.component_ref);
    if(p.piece_count!==null&&(!component||row.quantity>component.quantity))throw new AiSalesContractError('AI_SALES_ASSET_COMPONENT_MISMATCH');
    coverage.set(row.component_ref,Math.max(coverage.get(row.component_ref)||0,row.quantity));
   }
  }
  if(!originals.length)reasons.add('ORIGINAL_PRODUCT_MEDIA_MISSING');
  if(p.piece_count!==null&&p.components.some(c=>(coverage.get(c.component_ref)||0)<c.quantity))reasons.add('ASSET_UNIT_COVERAGE_INCOMPLETE');
 }
 const scripts=products.map(p=>({product_key:p.product_key,locale:'pt-BR',title:p.title,lines:[
  raw.template_id==='NOSTALGIA_80_90_2000'?'Um visual para celebrar suas memórias.':raw.template_id==='COUPLE_KIT'?'Um kit para compartilhar o estilo.':'Conheça os detalhes deste produto.',
  p.title,...p.verified_product_attributes.slice(0,3).map(a=>a.name+': '+a.value),
  'Confira as opções e os detalhes no anúncio.'
 ]}));
 const asset_inputs=await aiSalesAssetInputs(assets);
 const idempotency_key=await hashAiSalesValue({schema:'mls_ai_sales_campaign_inputs_v1',products,assets,template_id:raw.template_id,channel:raw.channel,goal:raw.goal,script_source:'LOCAL_TEMPLATE'});
 return validateAiSalesCampaignPlan({schema:'mls_ai_sales_campaign_plan_v1',campaign_id:raw.campaign_id,marketplace:first.marketplace,shop_ref:first.shop_ref,product_refs:products.map(p=>p.product_key),template_id:raw.template_id,channel:raw.channel,goal:raw.goal,stage:'DRAFT',asset_refs:assets.map(a=>a.asset_id),asset_inputs,generated_at:raw.generated_at,idempotency_key,status:reasons.size?'BLOCKED':'READY_FOR_LOCAL_RENDER',blocked_reasons:[...reasons].sort(),script_source:'LOCAL_TEMPLATE',scripts,operator_approval_id:null,commercial_writes:false});
}

export async function createAiSalesVideoJob(rawCampaign,product_key,rawOptions){
 const campaign=validateAiSalesCampaignPlan(rawCampaign);readAiSalesRecord(rawOptions,['job_id','assets']);
 if(!campaign.product_refs.includes(product_key)||!Array.isArray(rawOptions.assets)||rawOptions.assets.length>300)throw new AiSalesContractError('AI_SALES_JOB_SCOPE_MISMATCH');
 readAiSalesList(rawOptions.assets,300);
 const assets=rawOptions.assets.map(validateAiSalesAsset).sort((a,b)=>a.asset_id<b.asset_id?-1:a.asset_id>b.asset_id?1:0);
 const actual=await aiSalesAssetInputs(assets);
 if(canonicalAiSalesJson(actual)!==canonicalAiSalesJson(campaign.asset_inputs))throw new AiSalesContractError('AI_SALES_JOB_INPUTS_CHANGED');
 const selected=actual.filter(a=>a.product_key===product_key),hashes=[...new Set(selected.map(a=>a.sha256))].sort();
 const idempotency_key=await hashAiSalesValue({campaign_inputs:campaign.idempotency_key,product_key,template_id:campaign.template_id,input_hashes:hashes});
 return validateAiSalesVideoJob({schema:'mls_ai_sales_video_job_v1',job_id:rawOptions.job_id,campaign_id:campaign.campaign_id,product_ref:product_key,template_id:campaign.template_id,input_hashes:hashes,idempotency_key,state:campaign.status==='BLOCKED'?'QA_BLOCKED':'PLANNED',error_code:campaign.status==='BLOCKED'?'CAMPAIGN_BLOCKED':null,output_hash:null,path_local:null,commercial_writes:false});
}
