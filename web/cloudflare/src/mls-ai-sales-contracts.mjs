/** Closed, immutable MLS AI Sales records. Validation is not a marketplace grant. */
export class AiSalesContractError extends Error{
 constructor(code='AI_SALES_CONTRACT_INVALID'){super(code);this.name='AiSalesContractError';this.code=code;}
}
const aiFail=code=>{throw new AiSalesContractError(code);};
const aiControl=/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const aiId=/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const aiHash=/^[a-f0-9]{64}$/;
const aiMarkets=['SHOPEE_BR','TIKTOK_SHOP_BR'];
function aiRecord(value,keys,code){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))aiFail(code);
 const own=Reflect.ownKeys(value);if(own.length!==keys.length||own.some(k=>typeof k!=='string'||!keys.includes(k)))aiFail(code);
 for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value')||!d.enumerable)aiFail(code);}
 return value;
}
function aiArray(value,max,code){
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>max||Reflect.ownKeys(value).length!==value.length+1)aiFail(code);
 for(let n=0;n<value.length;n++){const d=Object.getOwnPropertyDescriptor(value,String(n));if(!d||!Object.hasOwn(d,'value')||!d.enumerable)aiFail(code);}return value;
}
function aiText(v,max,code,empty=false){if(typeof v!=='string'||v.length>max||(!empty&&!v.trim())||aiControl.test(v))aiFail(code);return v;}
function aiIdentity(v,code){if(typeof v!=='string'||!aiId.test(v))aiFail(code);return v;}
function aiInteger(v,code,min=0,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(v)||Object.is(v,-0)||v<min||v>max)aiFail(code);return v;}
function aiEpoch(v,code){return aiInteger(v,code,1,4102444800);}
function aiEnum(v,values,code){if(!values.includes(v))aiFail(code);return v;}
function aiCurrency(v,code){if(typeof v!=='string'||!/^[A-Z]{3}$/.test(v))aiFail(code);return v;}
function aiNullable(v,check,code){if(v!==null)check(v,code);}
function aiCodeList(v,max=40){aiArray(v,max,'AI_SALES_CODES_INVALID');const used=new Set();for(const s of v){if(typeof s!=='string'||!/^[A-Z][A-Z0-9_]{0,79}$/.test(s)||used.has(s))aiFail('AI_SALES_CODES_INVALID');used.add(s);}}
function aiFrozen(v){const copy=JSON.parse(JSON.stringify(v));const freeze=x=>{if(x&&typeof x==='object'){for(const y of Object.values(x))freeze(y);Object.freeze(x);}return x;};return freeze(copy);}
function aiDay(v,code){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)aiFail(code);return v;}
function aiScope(v,market,shop,code){if(v.marketplace!==market||v.shop_ref!==shop)aiFail(code);}
function aiIds(values,max,code){aiArray(values,max,code);const used=new Set();for(const v of values){aiIdentity(v,code);if(used.has(v))aiFail(code);used.add(v);}}
function aiProductRef(v,code){aiText(v,400,code);const p=v.split(':');if(p.length!==4||!aiMarkets.includes(p[0])||!aiId.test(p[1])||!aiId.test(p[2])||p[3]!=='~'&&!aiId.test(p[3]))aiFail(code);return v;}

export function makeAiSalesProductKey(raw){
 const code='AI_SALES_PRODUCT_ID_INVALID';aiRecord(raw,['marketplace','shop_ref','platform_product_id','variant_ref'],code);const {marketplace,shop_ref,platform_product_id,variant_ref}=raw;aiEnum(marketplace,aiMarkets,code);aiIdentity(shop_ref,code);aiIdentity(platform_product_id,code);aiNullable(variant_ref,aiIdentity,code);
 return [marketplace,shop_ref,platform_product_id,variant_ref===null?'~':variant_ref].join(':');
}
export function validateAiSalesEvidence(raw){
 const code='AI_SALES_EVIDENCE_INVALID',v=aiRecord(raw,['source','reference','observed_at','status','marketplace','shop_ref','currency','basis'],code);
 aiIdentity(v.source,code);aiText(v.reference,240,code);aiEpoch(v.observed_at,code);aiEnum(v.status,['VERIFIED','DECLARED','UNKNOWN'],code);
 aiEnum(v.marketplace,aiMarkets,code);aiIdentity(v.shop_ref,code);aiNullable(v.currency,aiCurrency,code);aiNullable(v.basis,aiIdentity,code);return aiFrozen(v);
}
export function validateAiSalesProductSnapshot(raw){
 const code='AI_SALES_PRODUCT_INVALID',v=aiRecord(raw,['schema','product_key','marketplace','shop_ref','platform_product_id','variant_ref','sku','title','verified_product_attributes','landing_url','price_cents','currency','cost_cents','fees_cents','inventory_units','piece_count','components','observations','media_refs'],code);
 if(v.schema!=='mls_ai_sales_product_snapshot_v1'||v.product_key!==makeAiSalesProductKey({marketplace:v.marketplace,shop_ref:v.shop_ref,platform_product_id:v.platform_product_id,variant_ref:v.variant_ref}))aiFail(code);
 aiNullable(v.sku,(x,c)=>aiText(x,128,c),code);aiText(v.title,200,code);aiNullable(v.currency,aiCurrency,code);
 for(const k of ['price_cents','cost_cents','fees_cents','inventory_units'])aiNullable(v[k],aiInteger,code);
 if(v.landing_url!==null){aiText(v.landing_url,1000,code);let u;try{u=new URL(v.landing_url);}catch{aiFail(code);}
  const allowed=v.marketplace==='SHOPEE_BR'?['shopee.com.br','www.shopee.com.br','s.shopee.com.br']:['shop.tiktok.com','www.tiktok.com','tiktok.com'];
  if(u.protocol!=='https:'||!allowed.includes(u.hostname)||u.port||u.username||u.password||u.hash)aiFail(code);
  for(const key of u.searchParams.keys())if(/token|secret|password|cookie|authorization|callback/i.test(key))aiFail(code);
 }
 aiArray(v.verified_product_attributes,30,code);const names=new Set();
 for(const item of v.verified_product_attributes){aiRecord(item,['name','value','evidence'],code);aiText(item.name,60,code);aiText(item.value,160,code);if(names.has(item.name))aiFail(code);names.add(item.name);const e=validateAiSalesEvidence(item.evidence);aiScope(e,v.marketplace,v.shop_ref,code);if(e.status!=='VERIFIED')aiFail(code);}
 aiArray(v.observations,50,code);const fields=new Set();
 for(const item of v.observations){aiRecord(item,['field','evidence'],code);aiEnum(item.field,['title','sku','price_cents','cost_cents','fees_cents','inventory_units','piece_count'],code);if(fields.has(item.field))aiFail(code);fields.add(item.field);const e=validateAiSalesEvidence(item.evidence);aiScope(e,v.marketplace,v.shop_ref,code);if(e.currency!==null&&v.currency!==null&&e.currency!==v.currency)aiFail(code);}
 aiArray(v.components,20,code);let units=0;const components=new Set();
 if(v.piece_count===null&&v.components.length)aiFail(code);
 if(v.piece_count!==null)aiInteger(v.piece_count,code,1,20);
 for(const item of v.components){aiRecord(item,['component_ref','size','quantity','art_ref'],code);aiIdentity(item.component_ref,code);if(components.has(item.component_ref))aiFail(code);components.add(item.component_ref);aiNullable(item.size,(x,c)=>aiText(x,40,c),code);aiInteger(item.quantity,code,1,20);aiNullable(item.art_ref,aiIdentity,code);units+=item.quantity;}
 if(v.piece_count!==null&&units!==v.piece_count)aiFail(code);aiIds(v.media_refs,30,code);return aiFrozen(v);
}
export function validateAiSalesAsset(raw){
 const code='AI_SALES_ASSET_INVALID',v=aiRecord(raw,['schema','asset_id','product_key','variant_ref','file_name','sha256','mime','width','height','size_bytes','role','represented_units','component_coverage','origin','rights','preserve_geometry'],code);
 if(v.schema!=='mls_ai_sales_asset_v1')aiFail(code);aiIdentity(v.asset_id,code);aiProductRef(v.product_key,code);aiNullable(v.variant_ref,aiIdentity,code);
 aiText(v.file_name,180,code);if(!/^[\p{L}\p{N}][\p{L}\p{N}_. ()-]*\.(?:png|jpe?g)$/iu.test(v.file_name)||v.file_name.includes('..'))aiFail(code);
 if(typeof v.sha256!=='string'||!aiHash.test(v.sha256))aiFail(code);aiEnum(v.mime,['image/png','image/jpeg'],code);
 if(v.mime==='image/png'&&!/\.png$/i.test(v.file_name)||v.mime==='image/jpeg'&&!/\.jpe?g$/i.test(v.file_name))aiFail(code);
 aiInteger(v.width,code,16,16384);aiInteger(v.height,code,16,16384);aiInteger(v.size_bytes,code,1,33554432);
 aiEnum(v.role,['MOCKUP_ORIGINAL','PRODUCT_PHOTO','ARTWORK'],code);aiInteger(v.represented_units,code,v.role==='ARTWORK'?0:1,20);if(v.role==='ARTWORK'&&v.represented_units!==0)aiFail(code);
 aiArray(v.component_coverage,20,code);let covered=0;const coverage=new Set();
 for(const row of v.component_coverage){aiRecord(row,['component_ref','quantity'],code);aiIdentity(row.component_ref,code);aiInteger(row.quantity,code,1,20);if(coverage.has(row.component_ref))aiFail(code);coverage.add(row.component_ref);covered+=row.quantity;}
 if(covered!==v.represented_units||v.role==='ARTWORK'&&v.component_coverage.length)aiFail(code);
 if(v.origin!=='LOCAL_OPERATOR'||v.preserve_geometry!==true)aiFail(code);
 aiRecord(v.rights,['status','reference','observed_at'],code);aiEnum(v.rights.status,['AUTHORIZED','UNKNOWN','DENIED'],code);aiNullable(v.rights.reference,(x,c)=>aiText(x,240,c),code);aiNullable(v.rights.observed_at,aiEpoch,code);
 if(v.rights.status==='AUTHORIZED'&&(v.rights.reference===null||v.rights.observed_at===null))aiFail(code);return aiFrozen(v);
}
export function validateAiSalesCampaignPlan(raw){
 const code='AI_SALES_CAMPAIGN_INVALID',v=aiRecord(raw,['schema','campaign_id','marketplace','shop_ref','product_refs','template_id','channel','goal','stage','asset_refs','asset_inputs','generated_at','idempotency_key','status','blocked_reasons','script_source','scripts','operator_approval_id','commercial_writes'],code);
 if(v.schema!=='mls_ai_sales_campaign_plan_v1'||v.stage!=='DRAFT'||v.script_source!=='LOCAL_TEMPLATE'||v.operator_approval_id!==null||v.commercial_writes!==false)aiFail(code);
 aiIdentity(v.campaign_id,code);aiEnum(v.marketplace,aiMarkets,code);aiIdentity(v.shop_ref,code);aiEpoch(v.generated_at,code);
 aiArray(v.product_refs,10,code);if(!v.product_refs.length)aiFail(code);const products=new Set();for(const key of v.product_refs){aiProductRef(key,code);if(products.has(key)||!key.startsWith(v.marketplace+':'+v.shop_ref+':'))aiFail(code);products.add(key);}
 aiEnum(v.template_id,['NOSTALGIA_80_90_2000','PRODUCT_DETAILS','COUPLE_KIT'],code);aiEnum(v.channel,['SHOPEE_VIDEO','TIKTOK_VIDEO'],code);aiEnum(v.goal,['STORE_VIDEO','AFFILIATE_BRIEF'],code);aiEnum(v.status,['READY_FOR_LOCAL_RENDER','BLOCKED'],code);aiCodeList(v.blocked_reasons);
 if((v.status==='BLOCKED')!==(v.blocked_reasons.length>0))aiFail(code);if(typeof v.idempotency_key!=='string'||!aiHash.test(v.idempotency_key))aiFail(code);
 aiIds(v.asset_refs,300,code);aiArray(v.asset_inputs,300,code);if(v.asset_inputs.length!==v.asset_refs.length)aiFail(code);const assetIds=new Set();
 for(const item of v.asset_inputs){aiRecord(item,['asset_id','product_key','sha256','manifest_hash'],code);aiIdentity(item.asset_id,code);if(assetIds.has(item.asset_id)||!v.asset_refs.includes(item.asset_id)||!products.has(item.product_key)||typeof item.sha256!=='string'||!aiHash.test(item.sha256)||typeof item.manifest_hash!=='string'||!aiHash.test(item.manifest_hash))aiFail(code);assetIds.add(item.asset_id);}
 aiArray(v.scripts,10,code);if(v.scripts.length!==v.product_refs.length)aiFail(code);const scripts=new Set();
 for(const item of v.scripts){aiRecord(item,['product_key','locale','title','lines'],code);if(!products.has(item.product_key)||scripts.has(item.product_key)||item.locale!=='pt-BR')aiFail(code);scripts.add(item.product_key);aiText(item.title,200,code);aiArray(item.lines,12,code);if(!item.lines.length)aiFail(code);for(const line of item.lines)aiText(line,260,code);}
 return aiFrozen(v);
}
export function validateAiSalesVideoJob(raw){
 const code='AI_SALES_JOB_INVALID',v=aiRecord(raw,['schema','job_id','campaign_id','product_ref','template_id','input_hashes','idempotency_key','state','error_code','output_hash','path_local','commercial_writes'],code);
 if(v.schema!=='mls_ai_sales_video_job_v1'||v.commercial_writes!==false)aiFail(code);aiIdentity(v.job_id,code);aiIdentity(v.campaign_id,code);aiProductRef(v.product_ref,code);
 aiEnum(v.template_id,['NOSTALGIA_80_90_2000','PRODUCT_DETAILS','COUPLE_KIT'],code);aiArray(v.input_hashes,30,code);for(const h of v.input_hashes)if(typeof h!=='string'||!aiHash.test(h))aiFail(code);
 if(typeof v.idempotency_key!=='string'||!aiHash.test(v.idempotency_key))aiFail(code);aiEnum(v.state,['PLANNED','QA_BLOCKED','RENDERING','READY_FOR_OWNER','APPROVED','FAILED'],code);aiNullable(v.error_code,(x,c)=>{if(typeof x!=='string'||!/^[A-Z][A-Z0-9_]{0,79}$/.test(x))aiFail(c);},code);aiNullable(v.output_hash,(x,c)=>{if(typeof x!=='string'||!aiHash.test(x))aiFail(c);},code);
 aiNullable(v.path_local,(x,c)=>{aiText(x,240,c);if(!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(x)||x.includes('..')||x.includes('//'))aiFail(c);},code);
 if(['READY_FOR_OWNER','APPROVED'].includes(v.state)&&(v.output_hash===null||v.path_local===null))aiFail(code);
 if(['FAILED','QA_BLOCKED'].includes(v.state)&&v.error_code===null)aiFail(code);return aiFrozen(v);
}
export function validateAiSalesCreator(raw){
 const code='AI_SALES_CREATOR_INVALID',v=aiRecord(raw,['schema','internal_creator_id','provider','shop_ref','approved_handle','consent_evidence','seller_creator_access_grant_status','channel_fit','last_contact_at','status'],code);
 if(v.schema!=='mls_ai_sales_creator_v1')aiFail(code);aiIdentity(v.internal_creator_id,code);aiEnum(v.provider,aiMarkets,code);aiIdentity(v.shop_ref,code);aiText(v.approved_handle,64,code);
 if(!/^@?[A-Za-z0-9][A-Za-z0-9._]{1,63}$/.test(v.approved_handle)||v.approved_handle.includes('@',1))aiFail(code);
 if(v.consent_evidence!==null){const e=validateAiSalesEvidence(v.consent_evidence);aiScope(e,v.provider,v.shop_ref,code);if(!['CONSENTED','PUBLIC_PERMITTED'].includes(e.basis))aiFail(code);}
 aiEnum(v.seller_creator_access_grant_status,['UNKNOWN','DENIED','GRANTED'],code);aiArray(v.channel_fit,12,code);for(const fit of v.channel_fit)aiText(fit,60,code);aiNullable(v.last_contact_at,aiEpoch,code);
 aiEnum(v.status,['DRAFT','ELIGIBLE','CONTACTED','RESPONDED','DECLINED','BLOCKED'],code);if(['ELIGIBLE','CONTACTED','RESPONDED'].includes(v.status)&&v.consent_evidence===null)aiFail(code);return aiFrozen(v);
}
export function validateAiSalesCollaboration(raw){
 const code='AI_SALES_COLLABORATION_INVALID',v=aiRecord(raw,['schema','plan_id','provider','shop_ref','creator_ref','product_ref','commission_rate_bps','money_exposure_cents','margin_evidence','status','provider_id','owner_approval_id','idempotency_key','commercial_writes'],code);
 if(v.schema!=='mls_ai_sales_collaboration_v1'||v.commercial_writes!==false)aiFail(code);aiIdentity(v.plan_id,code);aiEnum(v.provider,aiMarkets,code);aiIdentity(v.shop_ref,code);aiIdentity(v.creator_ref,code);aiProductRef(v.product_ref,code);if(!v.product_ref.startsWith(v.provider+':'+v.shop_ref+':'))aiFail(code);
 aiNullable(v.commission_rate_bps,(x,c)=>aiInteger(x,c,0,10000),code);aiNullable(v.money_exposure_cents,aiInteger,code);if(v.margin_evidence!==null)aiScope(validateAiSalesEvidence(v.margin_evidence),v.provider,v.shop_ref,code);
 aiEnum(v.status,['DRAFT','BLOCKED','APPROVED','SENT','ACCEPTED','EXPIRED'],code);aiNullable(v.provider_id,aiIdentity,code);aiNullable(v.owner_approval_id,aiIdentity,code);if(typeof v.idempotency_key!=='string'||!aiHash.test(v.idempotency_key))aiFail(code);
 if(v.status==='APPROVED'&&(v.owner_approval_id===null||v.commission_rate_bps===null||v.money_exposure_cents===null||v.margin_evidence?.status!=='VERIFIED'))aiFail(code);return aiFrozen(v);
}
export function validateAiSalesPerformance(raw){
 const code='AI_SALES_PERFORMANCE_INVALID',v=aiRecord(raw,['schema','source','marketplace','shop_ref','campaign_ref','product_ref','creator_ref','period','observed_at','currency','views','clicks','affiliate_orders','confirmed_sales_cents','attributable_ad_spend_cents','commission_cents','refunds_cents','coverage_status','source_evidence'],code);
 if(v.schema!=='mls_ai_sales_performance_v1')aiFail(code);aiIdentity(v.source,code);aiEnum(v.marketplace,aiMarkets,code);aiIdentity(v.shop_ref,code);aiIdentity(v.campaign_ref,code);aiProductRef(v.product_ref,code);if(!v.product_ref.startsWith(v.marketplace+':'+v.shop_ref+':'))aiFail(code);aiNullable(v.creator_ref,aiIdentity,code);aiEpoch(v.observed_at,code);aiCurrency(v.currency,code);
 aiRecord(v.period,['start_date','end_date'],code);aiDay(v.period.start_date,code);aiDay(v.period.end_date,code);if(v.period.start_date>v.period.end_date)aiFail(code);
 for(const k of ['views','clicks','affiliate_orders','confirmed_sales_cents','attributable_ad_spend_cents','commission_cents','refunds_cents'])aiNullable(v[k],aiInteger,code);
 aiEnum(v.coverage_status,['COMPLETE','PARTIAL','UNKNOWN'],code);const e=validateAiSalesEvidence(v.source_evidence);aiScope(e,v.marketplace,v.shop_ref,code);if(e.currency!==v.currency||e.source!==v.source||e.observed_at>v.observed_at)aiFail(code);return aiFrozen(v);
}
export function validateAiSalesActionAudit(raw){
 const code='AI_SALES_AUDIT_INVALID',v=aiRecord(raw,['schema','actor','verb','target','draft_hash','decision','gate_result','approved_at','executed_at','provider_result_status','redacted_evidence_ids'],code);
 if(v.schema!=='mls_ai_sales_action_audit_v1')aiFail(code);aiEnum(v.actor,['OWNER','AGENT'],code);aiIdentity(v.verb,code);aiText(v.target,400,code);if(typeof v.draft_hash!=='string'||!aiHash.test(v.draft_hash))aiFail(code);aiEnum(v.decision,['DRAFT','APPROVED','REJECTED','BLOCKED'],code);aiCodeList(v.gate_result);aiNullable(v.approved_at,aiEpoch,code);aiNullable(v.executed_at,aiEpoch,code);aiEnum(v.provider_result_status,['NOT_EXECUTED','MANUAL_RECORDED'],code);aiIds(v.redacted_evidence_ids,40,code);
 if(v.decision==='APPROVED'&&(v.actor!=='OWNER'||v.approved_at===null))aiFail(code);if(v.provider_result_status==='NOT_EXECUTED'&&v.executed_at!==null)aiFail(code);if(v.provider_result_status==='MANUAL_RECORDED'&&v.executed_at===null)aiFail(code);return aiFrozen(v);
}
export function canonicalAiSalesJson(value){
 const visit=(v,depth)=>{if(depth>20)aiFail('AI_SALES_CANONICAL_INVALID');if(v===null||typeof v==='boolean')return JSON.stringify(v);if(typeof v==='number'){aiInteger(v,'AI_SALES_CANONICAL_INVALID',-Number.MAX_SAFE_INTEGER);return String(v);}if(typeof v==='string'){aiText(v,100000,'AI_SALES_CANONICAL_INVALID',true);return JSON.stringify(v);}if(Array.isArray(v)){aiArray(v,1000,'AI_SALES_CANONICAL_INVALID');return '['+v.map(x=>visit(x,depth+1)).join(',')+']';}if(v&&typeof v==='object'){const keys=Object.keys(v).sort();aiRecord(v,keys,'AI_SALES_CANONICAL_INVALID');return '{'+keys.map(k=>JSON.stringify(k)+':'+visit(v[k],depth+1)).join(',')+'}';}aiFail('AI_SALES_CANONICAL_INVALID');};return visit(value,0);
}
export async function hashAiSalesValue(value){
 if(!globalThis.crypto?.subtle)aiFail('AI_SALES_CRYPTO_UNAVAILABLE');const encoded=new TextEncoder().encode(canonicalAiSalesJson(value));if(encoded.byteLength>1048576)aiFail('AI_SALES_CANONICAL_TOO_LARGE');const hash=await globalThis.crypto.subtle.digest('SHA-256',encoded);return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
}

/** Shared closed request envelope check; no authorization or coercion. */
export function readAiSalesRecord(value,keys,code='AI_SALES_REQUEST_INVALID'){return aiRecord(value,keys,code);}

export function readAiSalesList(value,max,code='AI_SALES_REQUEST_INVALID'){return aiArray(value,max,code);}
