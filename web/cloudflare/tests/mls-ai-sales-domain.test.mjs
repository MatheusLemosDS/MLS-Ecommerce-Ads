import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transform} from 'esbuild';
import {AiSalesContractError,validateAiSalesProductSnapshot,validateAiSalesAsset,validateAiSalesCreator,validateAiSalesCollaboration,validateAiSalesPerformance,validateAiSalesActionAudit,validateAiSalesVideoJob,makeAiSalesProductKey,hashAiSalesValue,canonicalAiSalesJson} from '../src/mls-ai-sales-contracts.mjs';
import {planAiSalesCampaign,createAiSalesVideoJob} from '../src/mls-ai-sales-campaign-planner.mjs';
import {evaluateAiSalesProfitability} from '../src/mls-ai-sales-profitability-gate.mjs';
import {auditAiSalesCapabilities} from '../src/mls-ai-sales-capability-audit.mjs';
import {salesAt,salesEvidence,salesProduct,salesAsset,salesCampaignRequest,salesPricedProduct} from './mls-ai-sales-domain-fixture.mjs';
const bad=(fn,code)=>assert.throws(fn,e=>e instanceof AiSalesContractError&&(!code||e.code===code));
const financial=(overrides={})=>({product:salesPricedProduct(),commission_rate_bps:1000,commission_evidence:salesEvidence(),extra_cost_cents:500,extra_cost_evidence:salesEvidence(),at:salesAt,...overrides});

test('saved product unknown fields stay null; validators freeze copies without inventing SKU, stock or money',()=>{
 const raw=salesProduct(),p=validateAiSalesProductSnapshot(raw);
 for(const k of ['sku','price_cents','cost_cents','fees_cents','inventory_units'])assert.equal(p[k],null);
 assert.equal(Object.isFrozen(p),true);assert.equal(Object.isFrozen(p.components[0]),true);raw.title='changed';assert.equal(p.title,'Produto de teste autorizado');
 const zero=validateAiSalesProductSnapshot(salesProduct({price_cents:0,cost_cents:0,fees_cents:0,inventory_units:0}));assert.equal(zero.price_cents,0);assert.equal(zero.inventory_units,0);
});

test('closed schemas reject extras, accessors, forged product keys and foreign scope before getter execution',()=>{
 bad(()=>validateAiSalesProductSnapshot({...salesProduct(),fake_connected:true}));let reads=0;const getter=salesProduct();Object.defineProperty(getter,'title',{enumerable:true,get(){reads++;return 'unsafe';}});bad(()=>validateAiSalesProductSnapshot(getter));assert.equal(reads,0);
 bad(()=>validateAiSalesProductSnapshot(salesProduct({product_key:'SHOPEE_BR:other-shop:fixture-product:fixture-M'})));
 bad(()=>validateAiSalesProductSnapshot(salesProduct({observations:[{field:'title',evidence:salesEvidence({shop_ref:'other-shop'})}]})));
 bad(()=>validateAiSalesProductSnapshot(salesProduct({verified_product_attributes:[{name:'Tecido',value:'Algodão',evidence:salesEvidence({status:'DECLARED'})}]})));
 const identity={marketplace:'SHOPEE_BR',shop_ref:'fixture-shop',platform_product_id:'fixture-product',variant_ref:'fixture-M'};Object.defineProperty(identity,'shop_ref',{enumerable:true,get(){reads++;return 'unsafe';}});bad(()=>makeAiSalesProductKey(identity));assert.equal(reads,0);
 const sparse=salesProduct();sparse.media_refs=new Array(1);bad(()=>validateAiSalesProductSnapshot(sparse));
});

test('kit composition is explicit for two or three pieces, never derived from title, SKU or photograph count',()=>{
 for(const pieces of [2,3])assert.equal(validateAiSalesProductSnapshot(salesProduct({piece_count:pieces,components:[{component_ref:'pieces',size:'P-M-G',quantity:pieces,art_ref:null}]})).piece_count,pieces);
 bad(()=>validateAiSalesProductSnapshot(salesProduct({piece_count:2})));bad(()=>validateAiSalesProductSnapshot(salesProduct({piece_count:null})));
 const unknown=validateAiSalesProductSnapshot(salesProduct({title:'Kit 3 peças P ao G3',piece_count:null,components:[]}));assert.equal(unknown.piece_count,null);
 for(const value of [-1,-0,1.5,Number.MAX_SAFE_INTEGER+1,'1590'])bad(()=>validateAiSalesProductSnapshot(salesProduct({cost_cents:value})));
});

test('media identity, rights, dimensions, basenames and preservation are separate from a matching content hash',()=>{
 const p=salesProduct();assert.equal(validateAiSalesAsset(salesAsset(p)).sha256,'a'.repeat(64));
 for(const file_name of ['../photo.png','/photo.png','https://host/photo.png','a\\photo.png'])bad(()=>validateAiSalesAsset(salesAsset(p,{file_name})));
 bad(()=>validateAiSalesAsset(salesAsset(p,{preserve_geometry:false})));bad(()=>validateAiSalesAsset(salesAsset(p,{rights:{status:'AUTHORIZED',reference:null,observed_at:null}})));
 bad(()=>validateAiSalesAsset(salesAsset(p,{width:0})));bad(()=>validateAiSalesAsset(salesAsset(p,{size_bytes:33554433})));
 assert.equal(validateAiSalesAsset(salesAsset(p,{rights:{status:'UNKNOWN',reference:null,observed_at:null}})).rights.status,'UNKNOWN');
});

test('local campaign is deterministic, never calls providers, and omits unknown price, inventory and material claims',async()=>{
 const p=salesProduct(),request=salesCampaignRequest(p),before=structuredClone(request),plan=await planAiSalesCampaign(request);
 assert.equal(plan.status,'READY_FOR_LOCAL_RENDER');assert.equal(plan.stage,'DRAFT');assert.equal(plan.script_source,'LOCAL_TEMPLATE');assert.equal(plan.commercial_writes,false);assert.equal(plan.operator_approval_id,null);assert.deepEqual(request,before);
 assert.doesNotMatch(plan.scripts[0].lines.join(' '),/R\$|algodão|estoque|desconto|últimas/i);assert.equal(plan.asset_inputs[0].sha256,'a'.repeat(64));assert.equal(plan.asset_inputs[0].manifest_hash,await hashAiSalesValue(request.assets[0]));
 const again=await planAiSalesCampaign({...request,campaign_id:'another-draft',generated_at:salesAt+1});assert.equal(again.idempotency_key,plan.idempotency_key);
 assert.equal(await hashAiSalesValue({b:0,a:null}),await hashAiSalesValue({a:null,b:0}));assert.equal(canonicalAiSalesJson({b:0,a:null}),'{"a":null,"b":0}');
});

test('different photo angles of one component cannot satisfy a two-piece kit; combined coverage is explicit',async()=>{
 const components=[{component_ref:'shirt-A',size:'P',quantity:1,art_ref:null},{component_ref:'shirt-B',size:'M',quantity:1,art_ref:null}],p=salesProduct({piece_count:2,components,media_refs:['asset-1','asset-2']});
 const one=salesAsset(p),same=salesAsset(p,{asset_id:'asset-2'}),angle={...same,sha256:'b'.repeat(64)};
 for(const photo of [same,angle]){const duplicated=await planAiSalesCampaign(salesCampaignRequest(p,[one,photo],{template_id:'COUPLE_KIT'}));assert.equal(duplicated.status,'BLOCKED');assert.ok(duplicated.blocked_reasons.includes('ASSET_UNIT_COVERAGE_INCOMPLETE'));}
 const second={...angle,component_coverage:[{component_ref:'shirt-B',quantity:1}]};
 const complete=await planAiSalesCampaign(salesCampaignRequest(p,[second,one],{template_id:'COUPLE_KIT'}));assert.equal(complete.status,'READY_FOR_LOCAL_RENDER');
 const reordered=await planAiSalesCampaign(salesCampaignRequest(p,[one,second],{template_id:'COUPLE_KIT'}));assert.equal(reordered.idempotency_key,complete.idempotency_key);
 await assert.rejects(planAiSalesCampaign(salesCampaignRequest(p,[one,{...second,sha256:one.sha256}])),{code:'AI_SALES_ASSET_CONTENT_COVERAGE_CONFLICT'});
 const combined=salesProduct({...p,media_refs:['asset-1']}),coverage=components.map(c=>({component_ref:c.component_ref,quantity:c.quantity}));assert.equal((await planAiSalesCampaign(salesCampaignRequest(combined,[salesAsset(combined,{represented_units:2,component_coverage:coverage})],{template_id:'COUPLE_KIT'}))).status,'READY_FOR_LOCAL_RENDER');
});

test('component coverage is closed, sum-consistent, within product capacity and unique per identity',async()=>{
 const p=salesProduct();
 for(const component_coverage of [[],[{component_ref:'piece-1',quantity:2}],[{component_ref:'piece-1',quantity:1},{component_ref:'piece-1',quantity:1}],[{component_ref:'piece-1',quantity:-0}]])bad(()=>validateAiSalesAsset(salesAsset(p,{component_coverage})));
 bad(()=>validateAiSalesAsset(salesAsset(p,{role:'ARTWORK',represented_units:0})));
 const artwork=validateAiSalesAsset(salesAsset(p,{role:'ARTWORK',represented_units:0,component_coverage:[]}));assert.equal(artwork.component_coverage.length,0);
 await assert.rejects(planAiSalesCampaign(salesCampaignRequest(p,[salesAsset(p,{component_coverage:[{component_ref:'unbound',quantity:1}]})])),{code:'AI_SALES_ASSET_COMPONENT_MISMATCH'});
 const pair=salesProduct({piece_count:2,components:[{component_ref:'pair',size:'M',quantity:2,art_ref:null}],media_refs:['asset-1','asset-2']});
 const assets=[salesAsset(pair),salesAsset(pair,{asset_id:'asset-2',sha256:'b'.repeat(64)})];const angle=await planAiSalesCampaign(salesCampaignRequest(pair,assets));assert.ok(angle.blocked_reasons.includes('ASSET_UNIT_COVERAGE_INCOMPLETE'));
 const combined=salesProduct({...pair,media_refs:['asset-1']});assert.equal((await planAiSalesCampaign(salesCampaignRequest(combined,[salesAsset(combined,{represented_units:2,component_coverage:[{component_ref:'pair',quantity:2}]})]))).status,'READY_FOR_LOCAL_RENDER');
 await assert.rejects(planAiSalesCampaign(salesCampaignRequest(p,[salesAsset(p,{represented_units:2,component_coverage:[{component_ref:'piece-1',quantity:2}]})])),{code:'AI_SALES_ASSET_COMPONENT_MISMATCH'});
 let reads=0;const row={component_ref:'piece-1'};Object.defineProperty(row,'quantity',{enumerable:true,get(){reads++;return 1;}});bad(()=>validateAiSalesAsset(salesAsset(p,{component_coverage:[row]})));assert.equal(reads,0);
});

test('family kit of three has three bound pieces, while the couple-only template remains blocked',async()=>{
 const p=salesProduct({piece_count:3,components:[{component_ref:'trio',size:'P-M-G',quantity:3,art_ref:null}]});
 const asset=salesAsset(p,{represented_units:3,component_coverage:[{component_ref:'trio',quantity:3}]});assert.equal((await planAiSalesCampaign(salesCampaignRequest(p,[asset]))).status,'READY_FOR_LOCAL_RENDER');
 const couple=await planAiSalesCampaign(salesCampaignRequest(p,[asset],{template_id:'COUPLE_KIT'}));assert.ok(couple.blocked_reasons.includes('COUPLE_KIT_REQUIRES_TWO_PIECES'));
});

test('missing variant, rights, attachment or stale title evidence is an explicit render block',async()=>{
 const p=salesProduct();const unknown=await planAiSalesCampaign(salesCampaignRequest(p,[salesAsset(p,{rights:{status:'UNKNOWN',reference:null,observed_at:null}})]));assert.ok(unknown.blocked_reasons.includes('ASSET_RIGHTS_UNCONFIRMED'));
 const missing=await planAiSalesCampaign(salesCampaignRequest(p,[]));assert.ok(missing.blocked_reasons.includes('ASSET_BYTES_NOT_ATTACHED'));
 const old=await planAiSalesCampaign(salesCampaignRequest(p,[salesAsset(p)],{generated_at:salesAt+2592001}));assert.ok(old.blocked_reasons.includes('PRODUCT_EVIDENCE_STALE'));
 const variant=salesProduct({variant_ref:null,product_key:makeAiSalesProductKey({marketplace:'SHOPEE_BR',shop_ref:'fixture-shop',platform_product_id:'fixture-product',variant_ref:null})});assert.ok((await planAiSalesCampaign(salesCampaignRequest(variant,[salesAsset(variant)]))).blocked_reasons.includes('PRODUCT_VARIANT_UNKNOWN'));
 const noUnits=salesProduct({piece_count:null,components:[]});assert.ok((await planAiSalesCampaign(salesCampaignRequest(noUnits,[salesAsset(noUnits)]))).blocked_reasons.includes('PRODUCT_UNITS_UNKNOWN'));
});

test('campaigns reject cross-shop products, foreign media references and sparse untrusted request arrays',async()=>{
 const p=salesProduct(),other=salesProduct({shop_ref:'other-shop',platform_product_id:'other-product',product_key:makeAiSalesProductKey({marketplace:'SHOPEE_BR',shop_ref:'other-shop',platform_product_id:'other-product',variant_ref:'fixture-M'}),observations:[{field:'title',evidence:salesEvidence({shop_ref:'other-shop'})}]});
 await assert.rejects(planAiSalesCampaign({...salesCampaignRequest(p),products:[p,other]}),{code:'AI_SALES_CAMPAIGN_SCOPE_MISMATCH'});
 await assert.rejects(planAiSalesCampaign(salesCampaignRequest(p,[salesAsset(p,{variant_ref:'OTHER'})])),{code:'AI_SALES_ASSET_BINDING_MISMATCH'});
 await assert.rejects(planAiSalesCampaign({...salesCampaignRequest(p),products:new Array(1)}),AiSalesContractError);
});

test('video jobs contain actual original media hashes and reject replacement bytes instead of hashing an idempotency label',async()=>{
 const p=salesProduct(),assets=[salesAsset(p)],plan=await planAiSalesCampaign(salesCampaignRequest(p,assets));
 const job=await createAiSalesVideoJob(plan,p.product_key,{job_id:'job-fixture',assets});assert.deepEqual(job.input_hashes,['a'.repeat(64)]);assert.notEqual(job.input_hashes[0],plan.idempotency_key);assert.equal(job.state,'PLANNED');assert.equal(job.commercial_writes,false);
 const same=await createAiSalesVideoJob(plan,p.product_key,{job_id:'retry-job',assets});assert.equal(job.idempotency_key,same.idempotency_key);
 await assert.rejects(createAiSalesVideoJob(plan,p.product_key,{job_id:'changed',assets:[salesAsset(p,{sha256:'b'.repeat(64)})]}),{code:'AI_SALES_JOB_INPUTS_CHANGED'});
 for(const changed of [salesAsset(p,{rights:{status:'UNKNOWN',reference:null,observed_at:null}}),salesAsset(p,{component_coverage:[{component_ref:'unbound',quantity:1}]}),salesAsset(p,{width:601})])await assert.rejects(createAiSalesVideoJob(plan,p.product_key,{job_id:'changed-metadata',assets:[changed]}),{code:'AI_SALES_JOB_INPUTS_CHANGED'});
 await assert.rejects(createAiSalesVideoJob(plan,p.product_key,{job_id:'missing-assets'}),AiSalesContractError);
 await assert.rejects(createAiSalesVideoJob(plan,p.product_key,{job_id:'sparse',assets:new Array(1)}),AiSalesContractError);
 const blocked=await planAiSalesCampaign(salesCampaignRequest(p,[]));assert.equal((await createAiSalesVideoJob(blocked,p.product_key,{job_id:'blocked',assets:[]})).state,'QA_BLOCKED');
});

test('untrusted hash and error-code values cannot execute coercion or leak raw TypeErrors',async()=>{
 const p=salesProduct(),assets=[salesAsset(p)],plan=await planAiSalesCampaign(salesCampaignRequest(p,assets)),job=await createAiSalesVideoJob(plan,p.product_key,{job_id:'coercion-fixture',assets});
 let calls=0;const poisoned={toString(){calls++;return 'a'.repeat(64);}};
 for(const overrides of [{input_hashes:[poisoned]},{input_hashes:[Symbol('unsafe')]},{idempotency_key:poisoned},{error_code:poisoned}])bad(()=>validateAiSalesVideoJob({...job,...overrides}));
 assert.equal(calls,0);
});

test('unit contribution uses verified same-scope integer inputs and ceilings commission cents without pretending bank net',()=>{
 const result=evaluateAiSalesProfitability(financial());assert.equal(result.status,'READY');assert.equal(result.contribution_cents,2500);assert.equal(result.margin_bps,2500);assert.equal(result.commission_cents,1000);assert.equal(result.commercial_writes,false);assert.match(result.interpretation,/EXCLUDES_TAX_ADS_FIXED_COSTS_RETURNS/);
 const exact=evaluateAiSalesProfitability(financial({product:salesPricedProduct({price_cents:1001,cost_cents:0,fees_cents:0}),commission_rate_bps:333,extra_cost_cents:0}));assert.equal(exact.commission_cents,34);assert.equal(exact.contribution_cents,967);assert.equal(exact.margin_bps,9660);
});

test('unknown money or unverified, stale, cross-currency and incompatible evidence never produces a trusted contribution',()=>{
 for(const overrides of [{product:salesPricedProduct({fees_cents:null})},{commission_evidence:null},{commission_evidence:salesEvidence({status:'DECLARED'})},{commission_evidence:salesEvidence({shop_ref:'other-shop'})},{commission_evidence:salesEvidence({currency:'USD'})},{commission_evidence:salesEvidence({basis:'DIFFERENT_PERIOD'})},{at:salesAt+86401},{commission_evidence:salesEvidence({observed_at:salesAt+1})}]){const result=evaluateAiSalesProfitability(financial(overrides));assert.equal(result.status,'BLOCKED');assert.equal(result.contribution_cents,null);assert.ok(result.blocked_reasons.length>0);}
});

test('zero and loss remain precise known outcomes, while unsafe sums never round into an answer',()=>{
 const zero=evaluateAiSalesProfitability(financial({product:salesPricedProduct({price_cents:0,cost_cents:0,fees_cents:0}),commission_rate_bps:0,extra_cost_cents:0}));assert.equal(zero.contribution_cents,0);assert.equal(zero.margin_bps,null);assert.ok(zero.blocked_reasons.includes('NON_POSITIVE_CONTRIBUTION'));
 const loss=evaluateAiSalesProfitability(financial({product:salesPricedProduct({price_cents:100,cost_cents:200,fees_cents:0}),commission_rate_bps:0,extra_cost_cents:0}));assert.equal(loss.contribution_cents,-100);assert.equal(loss.status,'BLOCKED');
 const max=Number.MAX_SAFE_INTEGER,unsafe=evaluateAiSalesProfitability(financial({product:salesPricedProduct({price_cents:max,cost_cents:max,fees_cents:max}),extra_cost_cents:max}));assert.equal(unsafe.contribution_cents,null);assert.ok(unsafe.blocked_reasons.includes('ARITHMETIC_UNSAFE'));
});

test('read grants, creator grant and publishing are separate and no documentary grant enables transport or commercial writes',()=>{
 const grant={capability:'AFFILIATE_SELLER_READ',grant_status:'GRANTED',expires_at:salesAt+60,evidence:salesEvidence()};
 const audit=auditAiSalesCapabilities({marketplace:'SHOPEE_BR',shop_ref:'fixture-shop',evidence:[grant],at:salesAt});assert.equal(audit.provider_connected,false);assert.equal(audit.commercial_writes,false);for(const c of audit.capabilities){assert.equal(c.can_read,false);assert.equal(c.can_write,false);}
 assert.equal(audit.capabilities.find(c=>c.capability==='AFFILIATE_SELLER_READ').grant_status,'GRANTED');assert.equal(audit.capabilities.find(c=>c.capability==='VIDEO_PUBLISH').grant_status,'UNKNOWN');
 const conflict=auditAiSalesCapabilities({marketplace:'SHOPEE_BR',shop_ref:'fixture-shop',evidence:[grant,{...grant,grant_status:'DENIED'}],at:salesAt});assert.equal(conflict.capabilities.find(c=>c.capability==='AFFILIATE_SELLER_READ').grant_status,'CONFLICT');
 bad(()=>auditAiSalesCapabilities({marketplace:'SHOPEE_BR',shop_ref:'wrong-shop',evidence:[grant],at:salesAt}));
});

const creator=()=>({schema:'mls_ai_sales_creator_v1',internal_creator_id:'fixture-creator',provider:'SHOPEE_BR',shop_ref:'fixture-shop',approved_handle:'fixture.creator',consent_evidence:null,seller_creator_access_grant_status:'UNKNOWN',channel_fit:['nostalgia'],last_contact_at:null,status:'DRAFT'});
test('creator, collaboration, aggregate performance and audit are closed local records, not invented provider executions',()=>{
 assert.equal(validateAiSalesCreator(creator()).consent_evidence,null);bad(()=>validateAiSalesCreator({...creator(),email:'not-allowed@example.test'}));bad(()=>validateAiSalesCreator({...creator(),status:'ELIGIBLE'}));
 const c=validateAiSalesCreator({...creator(),status:'ELIGIBLE',consent_evidence:salesEvidence({basis:'PUBLIC_PERMITTED'})});assert.equal(c.status,'ELIGIBLE');
 const collab={schema:'mls_ai_sales_collaboration_v1',plan_id:'plan-1',provider:'SHOPEE_BR',shop_ref:'fixture-shop',creator_ref:c.internal_creator_id,product_ref:salesProduct().product_key,commission_rate_bps:null,money_exposure_cents:null,margin_evidence:null,status:'DRAFT',provider_id:null,owner_approval_id:null,idempotency_key:'b'.repeat(64),commercial_writes:false};
 assert.equal(validateAiSalesCollaboration(collab).status,'DRAFT');bad(()=>validateAiSalesCollaboration({...collab,status:'APPROVED'}));bad(()=>validateAiSalesCollaboration({...collab,commercial_writes:true}));
 const performance={schema:'mls_ai_sales_performance_v1',source:'SYNTHETIC_VERIFIED_FIXTURE',marketplace:'SHOPEE_BR',shop_ref:'fixture-shop',campaign_ref:'campaign-fixture',product_ref:salesProduct().product_key,creator_ref:null,period:{start_date:'2026-10-01',end_date:'2026-10-30'},observed_at:salesAt,currency:'BRL',views:0,clicks:null,affiliate_orders:0,confirmed_sales_cents:0,attributable_ad_spend_cents:null,commission_cents:null,refunds_cents:0,coverage_status:'PARTIAL',source_evidence:salesEvidence()};
 assert.equal(validateAiSalesPerformance(performance).views,0);assert.equal(validateAiSalesPerformance(performance).clicks,null);bad(()=>validateAiSalesPerformance({...performance,period:{start_date:'2026-02-30',end_date:'2026-10-30'}}));
 const audit={schema:'mls_ai_sales_action_audit_v1',actor:'OWNER',verb:'APPROVE_LOCAL_EXPORT',target:'job-fixture',draft_hash:'b'.repeat(64),decision:'APPROVED',gate_result:[],approved_at:salesAt,executed_at:null,provider_result_status:'NOT_EXECUTED',redacted_evidence_ids:['fixture-evidence']};
 assert.equal(validateAiSalesActionAudit(audit).executed_at,null);bad(()=>validateAiSalesActionAudit({...audit,actor:'AGENT'}));bad(()=>validateAiSalesActionAudit({...audit,executed_at:salesAt}));
});

test('the same pure core can be statically embedded in normal and minified browser scripts without module imports',async()=>{
 const files=['mls-ai-sales-contracts.mjs','mls-ai-sales-profitability-gate.mjs','mls-ai-sales-capability-audit.mjs','mls-ai-sales-campaign-planner.mjs'];
 const body=files.map(file=>readFileSync(new URL('../src/'+file,import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/^export /gm,'')).join('\n');
 const source='globalThis.MlsAiSalesCore=(()=>{'+body+';return{planAiSalesCampaign,createAiSalesVideoJob,validateAiSalesProductSnapshot};})();';
 for(const minify of [false,true]){
  const {code}=await transform(source,{minify,target:'es2022'}),context=vm.createContext({crypto:globalThis.crypto,TextEncoder,URL});vm.runInContext(code,context);
  const plan=await vm.runInContext('MlsAiSalesCore.planAiSalesCampaign('+JSON.stringify(salesCampaignRequest())+')',context);assert.equal(plan.status,'READY_FOR_LOCAL_RENDER');assert.equal(plan.commercial_writes,false);
 }
});
