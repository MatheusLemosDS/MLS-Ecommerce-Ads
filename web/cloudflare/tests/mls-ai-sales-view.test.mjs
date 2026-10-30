import test from 'node:test';
import assert from 'node:assert/strict';
import {MLS_AI_SALES_CLIENT,MLS_AI_SALES_CSS,mlsAiSalesBody} from '../src/mls-ai-sales-view.mjs';
import * as contracts from '../src/mls-ai-sales-contracts.mjs';
import * as planner from '../src/mls-ai-sales-campaign-planner.mjs';
import * as catalog from '../src/mls-ai-sales-catalog.mjs';
import * as affiliates from '../src/mls-ai-sales-affiliates.mjs';
import * as performance from '../src/mls-ai-sales-performance.mjs';
import {salesAt,salesProduct,salesAsset,salesCampaignRequest} from './mls-ai-sales-domain-fixture.mjs';

const core={...contracts,...planner,...catalog,...affiliates,...performance};
function uiValidators(){
 const block=MLS_AI_SALES_CLIENT.split('/*__MLS_AI_SALES_UI_VALIDATORS_START__*/')[1].split('/*__MLS_AI_SALES_UI_VALIDATORS_END__*/')[0];
 const declarations=['fail','safe','copy','exact'].map(name=>MLS_AI_SALES_CLIENT.match(new RegExp('^ const '+name+'=.*$','m'))?.[0]).join('\n');
 assert.ok(!declarations.includes('undefined'));
 return Function('core',declarations+'\n'+block+'\nreturn {validateManifest,validateWorkspace,imageHeader,validateReviewCampaign,creatorScopeKey,selectScopedCreator,invalidateVideoReviews,stableMediaRefs};')(core);
}
const clone=v=>JSON.parse(JSON.stringify(v));
async function manifestFixture(){
 const product=salesProduct(),asset=salesAsset(product),campaign=await planner.planAiSalesCampaign(salesCampaignRequest(product,[asset])),planned=await planner.createAiSalesVideoJob(campaign,product.product_key,{job_id:'local-test-job',assets:[asset]});
 const output='b'.repeat(64),manifest={schema:'mls_ai_sales_render_result_v1',state:'READY_FOR_OWNER',render_policy:'MLS_LOCAL_VIDEO_CONTAIN_PTBR_V1',idempotency_key:'c'.repeat(64),campaign_id:campaign.campaign_id,product_key:product.product_key,template_id:campaign.template_id,
 job:{...planned,state:'READY_FOR_OWNER',output_hash:output,path_local:'mls-video-test/video.mp4'},
 source_assets:[{asset_id:asset.asset_id,sha256:asset.sha256,manifest_hash:await contracts.hashAiSalesValue(asset),component_coverage:asset.component_coverage,preserve_geometry:true,role:asset.role}],narration:{source:'ESPEAK_NG_OFFLINE_PT_BR',language:'pt-BR',source_sha256:'d'.repeat(64),rights_reference:'synthetic-espeak-test'},script_source:'LOCAL_TEMPLATE',ai_disclosure_required:true,
 qa:{status:'PASSED',width:1080,height:1920,duration_ms:15000,fps:30,video_codec:'h264',audio_codec:'aac',full_decode:true,sha256:output,size_bytes:10000},
 files:['video.mp4','thumbnail.jpg','captions.srt','script.txt'].map((name,i)=>({name,sha256:i?'e'.repeat(64):output,size_bytes:i?100:10000})),costs:{provider_cost_cents:0,currency:'BRL',local_compute_cost_cents:null,elapsed_ms:14000},tools:{ffmpeg:'ffmpeg',ffprobe:'ffprobe',ffmpeg_version:'ffmpeg synthetic fixture',ffprobe_version:'ffprobe synthetic fixture'},approval:'PENDING',commercial_writes:false};
 return {product,asset,campaign,planned,manifest};
}

test('AI Sales body has five native tabs, real form controls, and no inline external actions',()=>{
 const body=mlsAiSalesBody();
 for(const id of ['campaigns','studio','affiliates','performance','integrations']){
  assert.ok(body.includes('data-ai-sales-tab="'+id+'"'));
  assert.ok(body.includes('id="aiSalesPanel-'+id+'"'));
 }
 const ids=[...body.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 for(const id of ['AssetCoverage','RightsConfirmed','AssetFiles','Plan','VideoManifest','CreatorForm','ProposalForm','PerformanceImport','PerformanceForm','ExportWorkspace','ImportWorkspace'])assert.ok(ids.includes('aiSales'+id));
 assert.match(MLS_AI_SALES_CSS,/\.mls-ai-tabs button\{width:auto/);
 assert.match(MLS_AI_SALES_CLIENT,/globalThis\.mlsAiSalesWorkspace=Object\.freeze/);
 assert.equal((MLS_AI_SALES_CLIENT.match(/\/\*__MLS_AI_SALES_CORE__\*\//g)||[]).length,1);
 assert.doesNotMatch(MLS_AI_SALES_CLIENT,/__MLS_AI_SALES_UI_OPERATIONS__|\.innerHTML\s*=|\bfetch\s*\(|XMLHttpRequest|sendBeacon|window\.open\s*\(/);
 assert.doesNotMatch(body,/<script|\sonclick=|https?:\/\//i);
});

test('video UI accepts only a local declared QA manifest and ties output, job and files together',async()=>{
 const {manifest}=await manifestFixture(),{validateManifest}=uiValidators(),checked=validateManifest(manifest);
 assert.deepEqual(checked,manifest);assert.notEqual(checked,manifest);assert.equal(checked.costs.local_compute_cost_cents,null);
 const mutations=[m=>m.approval='APPROVED',m=>m.commercial_writes=true,m=>m.state='APPROVED',m=>m.script_source='LLM',m=>m.extra='untrusted',m=>m.qa.full_decode=false,m=>m.qa.width=720,m=>m.qa.duration_ms=31000,m=>m.qa.sha256='f'.repeat(64),m=>m.files[0].size_bytes++,m=>m.files[1].name='../../file',m=>m.files[1].name='video.mp4',m=>m.source_assets[0].manifest_hash=null,m=>m.source_assets[0].component_coverage[0].quantity=0,m=>m.source_assets.push(clone(m.source_assets[0])),m=>m.narration.language='en-US',m=>m.costs.provider_cost_cents=1,m=>m.job.campaign_id='different'];
 for(const mutate of mutations){const bad=clone(manifest);mutate(bad);assert.throws(()=>validateManifest(bad),/^Error: AI_SALES_|^AiSalesContractError: AI_SALES_/);}
});

test('resume never restores approvals, attached media, provider grants or verified financial claims',async()=>{
 const {product,asset,campaign,planned,manifest}=await manifestFixture(),review_hash=await contracts.hashAiSalesValue(manifest),{validateWorkspace}=uiValidators();
 const source={schema:'mls_ai_sales_workspace_v1',revision:2,products:[product],assets:[asset],campaigns:[campaign],jobs:[planned],video_reviews:[{manifest,review_hash,decision:'APPROVED',approved_at:salesAt}],affiliates:affiliates.createAiSalesAffiliateWorkspace(),performance:performance.createAiSalesPerformanceLedger(),audit:[],commercial_writes:false};
 const resumed=await validateWorkspace(source,salesAt+10);
 assert.equal(resumed.jobs[0].state,'QA_BLOCKED');assert.equal(resumed.jobs[0].error_code,'IMPORTED_JOB_REPLAN_REQUIRED');assert.equal(resumed.jobs[0].output_hash,null);assert.equal(resumed.jobs[0].path_local,null);assert.equal(resumed.revision,3);assert.equal(resumed.video_reviews[0].decision,'PENDING');assert.equal(resumed.video_reviews[0].approved_at,null);assert.deepEqual(resumed.audit,[]);
 assert.ok(resumed.products[0].observations.every(row=>row.evidence.status==='DECLARED'));assert.deepEqual(resumed.products[0].verified_product_attributes,[]);
 assert.equal(source.video_reviews[0].decision,'APPROVED');assert.equal(source.products[0].observations[0].evidence.status,'VERIFIED');
 assert.doesNotMatch(JSON.stringify(resumed),/blob:|data:|access_token|cookie/);
 const bad=clone(source);bad.video_reviews[0].review_hash='f'.repeat(64);await assert.rejects(validateWorkspace(bad,salesAt+10),/AI_SALES_WORKSPACE_REVIEW_HASH/);
});

test('resume rejects cross-product media, duplicate ids and oversized collections atomically',async()=>{
 const {product,asset,campaign,planned}=await manifestFixture(),{validateWorkspace}=uiValidators();
 const source={schema:'mls_ai_sales_workspace_v1',revision:0,products:[product],assets:[asset],campaigns:[campaign],jobs:[planned],video_reviews:[],affiliates:affiliates.createAiSalesAffiliateWorkspace(),performance:performance.createAiSalesPerformanceLedger(),audit:[],commercial_writes:false};
 for(const mutate of [m=>m.products.push(clone(product)),m=>m.assets[0].variant_ref='another',m=>m.products[0].media_refs=[],m=>m.campaigns=Array(61).fill(campaign),m=>m.commercial_writes=true]){const bad=clone(source);mutate(bad);await assert.rejects(validateWorkspace(bad,salesAt+10));}
 assert.equal(source.products.length,1);assert.equal(source.assets[0].variant_ref,product.variant_ref);
});

test('local image preflight reads exact PNG/JPEG dimensions and rejects arbitrary payloads',()=>{
 const {imageHeader}=uiValidators(),png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);const view=new DataView(png.buffer);view.setUint32(12,0x49484452);view.setUint32(16,600);view.setUint32(20,800);assert.deepEqual(imageHeader(png.buffer),{mime:'image/png',width:600,height:800});
 const jpeg=new Uint8Array([255,216,255,192,0,8,8,3,32,2,88,0]);assert.deepEqual(imageHeader(jpeg.buffer),{mime:'image/jpeg',width:600,height:800});
 for(const bytes of [new Uint8Array(),new TextEncoder().encode('<svg onload="bad()">'),jpeg.slice(0,7),new Uint8Array([255,216,1,1,1,1])])assert.throws(()=>imageHeader(bytes.buffer),/AI_SALES_IMAGE_HEADER_INVALID/);
});

test('resume resets planned and approved job states and refuses every orphan relationship',async()=>{
 const {product,asset,campaign,planned,manifest}=await manifestFixture(),{validateWorkspace}=uiValidators();
 const source={schema:'mls_ai_sales_workspace_v1',revision:0,products:[product],assets:[asset],campaigns:[campaign],jobs:[{...manifest.job,state:'APPROVED'}],video_reviews:[],affiliates:affiliates.createAiSalesAffiliateWorkspace(),performance:performance.createAiSalesPerformanceLedger(),audit:[],commercial_writes:false};
 const reset=await validateWorkspace(source,salesAt+10);assert.equal(reset.jobs[0].state,'QA_BLOCKED');assert.equal(reset.jobs[0].output_hash,null);assert.equal(reset.jobs[0].path_local,null);
 for(const mutate of [m=>m.campaigns=[],m=>m.products=[],m=>m.jobs[0].campaign_id='orphan',m=>m.jobs[0].template_id='COUPLE_KIT',m=>m.assets=[],m=>m.campaigns[0].product_refs=['SHOPEE_BR:fixture-shop:unknown:unknown']]){const bad=clone(source);mutate(bad);await assert.rejects(validateWorkspace(bad,salesAt+10));}
 assert.equal(source.jobs[0].state,'APPROVED');assert.equal(source.jobs[0].output_hash,manifest.qa.sha256);
});

test('video approval replans the entire current product snapshot and rejects incomplete or changed kits',async()=>{
 const {product,asset,campaign,manifest}=await manifestFixture(),{validateReviewCampaign}=uiValidators();
 assert.equal(await validateReviewCampaign(manifest,campaign,[product],[asset]),true);
 const changed=clone(product);changed.piece_count=2;changed.components.push({component_ref:'new-piece',size:'P',quantity:1,art_ref:null});
 await assert.rejects(validateReviewCampaign(manifest,campaign,[changed],[asset]),/AI_SALES_VIDEO_CURRENT_PRODUCT_CHANGED/);
 const title=clone(product);title.title='A different product claim';await assert.rejects(validateReviewCampaign(manifest,campaign,[title],[asset]),/AI_SALES_VIDEO_CURRENT_PRODUCT_CHANGED/);
 const downgraded=catalog.importAiSalesManualProduct(product,{at:salesAt+10});await assert.rejects(validateReviewCampaign(manifest,campaign,[downgraded],[asset]),/AI_SALES_VIDEO_CURRENT_PRODUCT_CHANGED/);
 const swapped=clone(asset);swapped.rights.reference='different rights metadata';await assert.rejects(validateReviewCampaign(manifest,campaign,[product],[swapped]),/AI_SALES_VIDEO_CURRENT_PRODUCT_CHANGED/);
});

test('creator edit and proposal selections retain provider and shop when internal ids collide',()=>{
 const {creatorScopeKey,selectScopedCreator}=uiValidators(),one={provider:'SHOPEE_BR',shop_ref:'first-shop',internal_creator_id:'same-id',approved_handle:'@first'},two={provider:'TIKTOK_SHOP_BR',shop_ref:'second-shop',internal_creator_id:'same-id',approved_handle:'@second'},creators=[one,two];
 const firstKey=creatorScopeKey(one),secondKey=creatorScopeKey(two);assert.notEqual(firstKey,secondKey);assert.equal(selectScopedCreator(creators,secondKey),two);assert.equal(selectScopedCreator(creators,firstKey),one);
 assert.equal(selectScopedCreator(creators,secondKey,{marketplace:two.provider,shop_ref:two.shop_ref}),two);
 assert.throws(()=>selectScopedCreator(creators,firstKey,{marketplace:two.provider,shop_ref:two.shop_ref}),/AI_SALES_CREATOR_PRODUCT_SCOPE_MISMATCH/);
 assert.throws(()=>selectScopedCreator(creators,'same-id'),/AI_SALES_CREATOR_SELECTION_INVALID/);
 assert.match(MLS_AI_SALES_CLIENT,/creatorEditing=creatorScopeKey\(c\)/);assert.match(MLS_AI_SALES_CLIENT,/creators\.map\(c=>\[creatorScopeKey\(c\)/);assert.match(MLS_AI_SALES_CLIENT,/selectScopedCreator\(state\.affiliates\.creators,creatorKey,product\)/);
});

test('changed asset or composition revokes current approval while retaining an explicit supersession audit',async()=>{
 const {manifest}=await manifestFixture(),review_hash=await contracts.hashAiSalesValue(manifest),{invalidateVideoReviews}=uiValidators(),approved={manifest,review_hash,decision:'APPROVED',approved_at:salesAt},other={...clone(approved),manifest:{...clone(manifest),product_key:'SHOPEE_BR:fixture-shop:other:other'}};
 const result=invalidateVideoReviews([approved,other],manifest.product_key);assert.equal(result.reviews[0].decision,'PENDING');assert.equal(result.reviews[0].approved_at,null);assert.equal(result.reviews[1],other);assert.deepEqual(result.revoked,[approved]);assert.equal(approved.decision,'APPROVED');
 assert.match(MLS_AI_SALES_CLIENT,/if\(incoming\.some\(row=>row\.changed\)\)revokeVideoApprovals\(p\.product_key\)/);
 assert.match(MLS_AI_SALES_CLIENT,/revokeVideoApprovals\(p\.product_key\);state\.products=state\.products\.map/);
 assert.match(MLS_AI_SALES_CLIENT,/verb:'REVOKE_LOCAL_VIDEO_APPROVAL'/);assert.match(MLS_AI_SALES_CLIENT,/gate_result:\['APPROVAL_SUPERSEDED_INPUT_CHANGED'\]/);
});

test('changing product A revokes every video and job in the shared immutable campaign, including product B',async()=>{
 const pA=salesProduct(),pB=salesProduct({product_key:contracts.makeAiSalesProductKey({marketplace:'SHOPEE_BR',shop_ref:'fixture-shop',platform_product_id:'second-product',variant_ref:'second-M'}),platform_product_id:'second-product',variant_ref:'second-M',media_refs:['asset-2']}),aA=salesAsset(pA),aB=salesAsset(pB,{asset_id:'asset-2',sha256:'f'.repeat(64)}),campaign=await planner.planAiSalesCampaign(salesCampaignRequest(pA,[aA,aB],{products:[pA,pB]}));
 const jobA=await planner.createAiSalesVideoJob(campaign,pA.product_key,{job_id:'job-a',assets:[aA,aB]}),jobB=await planner.createAiSalesVideoJob(campaign,pB.product_key,{job_id:'job-b',assets:[aA,aB]}),approvedJob={...jobB,state:'APPROVED',output_hash:'c'.repeat(64),path_local:'saved-b/video.mp4'};
 const reviewA={manifest:{campaign_id:campaign.campaign_id,product_key:pA.product_key},decision:'APPROVED',approved_at:salesAt},reviewB={manifest:{campaign_id:campaign.campaign_id,product_key:pB.product_key},decision:'APPROVED',approved_at:salesAt},unrelated={manifest:{campaign_id:'unrelated-campaign',product_key:pB.product_key},decision:'APPROVED',approved_at:salesAt};
 const {invalidateVideoReviews}=uiValidators(),result=invalidateVideoReviews([reviewA,reviewB,unrelated],pA.product_key,[campaign],[jobA,approvedJob]);
 assert.deepEqual(result.campaignIds,[campaign.campaign_id]);assert.deepEqual(result.revoked,[reviewA,reviewB]);assert.deepEqual(result.reviews.slice(0,2).map(r=>[r.decision,r.approved_at]),[['PENDING',null],['PENDING',null]]);assert.equal(result.reviews[2],unrelated);
 for(const job of result.jobs){assert.equal(job.state,'QA_BLOCKED');assert.equal(job.error_code,'INPUTS_CHANGED_REPLAN_REQUIRED');assert.equal(job.output_hash,null);assert.equal(job.path_local,null);}
 const changed=clone(aA);changed.rights.reference='changed authorization';const newPlan=await planner.planAiSalesCampaign(salesCampaignRequest(pA,[changed,aB],{products:[pA,pB]}));assert.notEqual(newPlan.idempotency_key,campaign.idempotency_key);assert.equal(reviewB.decision,'APPROVED');assert.equal(approvedJob.state,'APPROVED');
 assert.match(MLS_AI_SALES_CLIENT,/invalidateVideoReviews\(state\.video_reviews,productKey,state\.campaigns,state\.jobs\)/);
});

test('reattaching the first unchanged original preserves media reference order and exact campaign identity',async()=>{
 const {stableMediaRefs}=uiValidators(),product=salesProduct({media_refs:['asset-1','asset-2']}),first=salesAsset(product),second=salesAsset(product,{asset_id:'asset-2',file_name:'second-photo.png',sha256:'b'.repeat(64)}),original=await planner.planAiSalesCampaign(salesCampaignRequest(product,[first,second]));
 // An imported list or file map may enumerate originals in another order.
 // A byte-identical reattachment keeps existing product refs stable anyway.
 const refs=stableMediaRefs(product,[second,first]),resumed=contracts.validateAiSalesProductSnapshot({...clone(product),media_refs:refs}),reattached=await planner.planAiSalesCampaign(salesCampaignRequest(resumed,[second,first]));
 assert.deepEqual(refs,['asset-1','asset-2']);assert.deepEqual(reattached,original);
 assert.deepEqual(stableMediaRefs(product,[second,first,{...second,asset_id:'asset-3'}]),['asset-1','asset-2','asset-3']);
 assert.match(MLS_AI_SALES_CLIENT,/media_refs:stableMediaRefs\(product,state\.assets\)/);
});
