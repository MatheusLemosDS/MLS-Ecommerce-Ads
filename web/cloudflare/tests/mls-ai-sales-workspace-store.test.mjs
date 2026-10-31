import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {D1} from './sqlite-d1.mjs';
import {AI_SALES_WORKSPACE_STORE_SCHEMA,normalizeAiSalesWorkspaceDraft,readAiSalesWorkspace,saveAiSalesWorkspace} from '../src/mls-ai-sales-workspace-store.mjs';
import {createAiSalesAffiliateWorkspace,upsertAiSalesAffiliateCreator,draftAiSalesAffiliateProposal,approveAiSalesAffiliateProposal} from '../src/mls-ai-sales-affiliates.mjs';
import {createAiSalesPerformanceLedger} from '../src/mls-ai-sales-performance.mjs';
import {planAiSalesCampaign,createAiSalesVideoJob} from '../src/mls-ai-sales-campaign-planner.mjs';
import {hashAiSalesValue} from '../src/mls-ai-sales-contracts.mjs';
import * as contracts from '../src/mls-ai-sales-contracts.mjs';
import * as planner from '../src/mls-ai-sales-campaign-planner.mjs';
import * as catalog from '../src/mls-ai-sales-catalog.mjs';
import * as affiliates from '../src/mls-ai-sales-affiliates.mjs';
import * as performance from '../src/mls-ai-sales-performance.mjs';
import {MLS_AI_SALES_CLIENT} from '../src/mls-ai-sales-view.mjs';
import {salesAt as at,salesEvidence,salesProduct,salesAsset,salesCampaignRequest,salesPricedProduct} from './mls-ai-sales-domain-fixture.mjs';

const owner={role:'owner',subject:'fixture-owner'},other={role:'owner',subject:'another-fixture-owner'},clone=value=>JSON.parse(JSON.stringify(value));
const workspace=()=>({schema:'mls_ai_sales_workspace_v1',revision:0,products:[],assets:[],campaigns:[],jobs:[],video_reviews:[],affiliates:createAiSalesAffiliateWorkspace(),performance:createAiSalesPerformanceLedger(),audit:[],commercial_writes:false});
async function fixture(t){
 const db=new D1(),env={ADMIN_DB:db},clock={time:(at+10)*1000},now=()=>clock.time;
 t.after(()=>db.db.close());let queue=Promise.resolve();const batch=db.batch.bind(db);
 db.batch=statements=>{const next=queue.then(()=>batch(statements));queue=next.catch(()=>{});return next;};
 return {db,env,clock,now,read:(who=owner)=>readAiSalesWorkspace(env,who,{now}),save:(input,who=owner)=>saveAiSalesWorkspace(env,who,input,{now})};
}
const rows=f=>({workspaces:f.db.db.prepare('SELECT * FROM mls_ai_sales_workspaces ORDER BY owner_hash').all(),audit:f.db.db.prepare('SELECT * FROM mls_ai_sales_workspace_audit ORDER BY owner_hash,revision').all()});
const expectCode=(code,status)=>error=>{assert.equal(error.code,code);if(status!==undefined)assert.equal(error.status,status);assert.equal(error.message,code);return true;};
async function richWorkspace(){
 const product=salesProduct(),asset=salesAsset(product),campaign=await planAiSalesCampaign(salesCampaignRequest(product,[asset])),planned=await createAiSalesVideoJob(campaign,product.product_key,{job_id:'persisted-video-job',assets:[asset]});
 const output='b'.repeat(64),manifest={schema:'mls_ai_sales_render_result_v1',state:'READY_FOR_OWNER',render_policy:'MLS_LOCAL_VIDEO_CONTAIN_PTBR_V1',idempotency_key:'c'.repeat(64),campaign_id:campaign.campaign_id,product_key:product.product_key,template_id:campaign.template_id,
  job:{...planned,state:'READY_FOR_OWNER',output_hash:output,path_local:'fixture-render/video.mp4'},source_assets:[{asset_id:asset.asset_id,sha256:asset.sha256,manifest_hash:await hashAiSalesValue(asset),component_coverage:asset.component_coverage,preserve_geometry:true,role:asset.role}],narration:{source:'ESPEAK_NG_OFFLINE_PT_BR',language:'pt-BR',source_sha256:'d'.repeat(64),rights_reference:'synthetic-owned-test'},script_source:'LOCAL_TEMPLATE',ai_disclosure_required:true,
  qa:{status:'PASSED',width:1080,height:1920,duration_ms:15000,fps:30,video_codec:'h264',audio_codec:'aac',full_decode:true,sha256:output,size_bytes:10000},files:['video.mp4','thumbnail.jpg','captions.srt','script.txt'].map((name,i)=>({name,sha256:i?'e'.repeat(64):output,size_bytes:i?100:10000})),costs:{provider_cost_cents:0,currency:'BRL',local_compute_cost_cents:null,elapsed_ms:10000},tools:{ffmpeg:'ffmpeg',ffprobe:'ffprobe',ffmpeg_version:'synthetic-version',ffprobe_version:'synthetic-version'},approval:'PENDING',commercial_writes:false};
 const creator={schema:'mls_ai_sales_creator_v1',internal_creator_id:'creator-fixture',provider:'SHOPEE_BR',shop_ref:'fixture-shop',approved_handle:'@fixture_creator',consent_evidence:salesEvidence({basis:'CONSENTED'}),seller_creator_access_grant_status:'GRANTED',channel_fit:['Moda'],last_contact_at:null,status:'ELIGIBLE'},priced=salesPricedProduct();
 let affiliates=upsertAiSalesAffiliateCreator(createAiSalesAffiliateWorkspace(),creator,{at});
 affiliates=await draftAiSalesAffiliateProposal(affiliates,{plan_id:'affiliate-fixture',creator_ref:creator.internal_creator_id,product:priced,commission_rate_bps:500,commission_evidence:salesEvidence(),extra_cost_cents:0,extra_cost_evidence:salesEvidence(),returns_evidence:salesEvidence({basis:'RECONCILED_ZERO_RETURN_EXPOSURE'}),at});
 affiliates=await approveAiSalesAffiliateProposal(affiliates,{plan_id:'affiliate-fixture',product:priced,approval_id:'owner-fixture-approval',at:at+1});
 return {...workspace(),revision:2,products:[product],assets:[asset],campaigns:[campaign],jobs:[{...manifest.job,state:'APPROVED'}],video_reviews:[{manifest,review_hash:await hashAiSalesValue(manifest),decision:'APPROVED',approved_at:at+1}],affiliates};
}

test('a first GET is SELECT-only and returns an empty workspace without initializing schema or inventing business data',async t=>{
 const f=await fixture(t),before=f.db.db.prepare('SELECT COUNT(*) AS n FROM sqlite_master WHERE type=?').get('table').n;
 assert.deepEqual(await f.read(),{schema:'mls_ai_sales_saved_workspace_v1',revision:0,updated_at:null,workspace:null,commercial_writes:false});
 assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM sqlite_master WHERE type=?').get('table').n,before);
 await f.db.batch(AI_SALES_WORKSPACE_STORE_SCHEMA.map(sql=>f.db.prepare(sql)));const snapshot=rows(f);await f.read();assert.deepEqual(rows(f),snapshot);
});

test('saving then reopening preserves draft identities but revokes imported approvals, proof and provider authority',async t=>{
 const f=await fixture(t),source=await richWorkspace(),original=clone(source),saved=await f.save({revision:0,workspace:source});
 assert.equal(saved.revision,1);assert.equal(saved.updated_at,at+10);assert.equal(saved.workspace.revision,3);assert.equal(saved.workspace.products[0].product_key,source.products[0].product_key);
 assert.deepEqual(saved.workspace.products[0].verified_product_attributes,[]);assert.ok(saved.workspace.products[0].observations.every(row=>row.evidence.status==='DECLARED'));
 assert.equal(saved.workspace.assets[0].sha256,source.assets[0].sha256);assert.deepEqual(saved.workspace.assets[0].component_coverage,source.assets[0].component_coverage);
 assert.equal(saved.workspace.jobs[0].state,'QA_BLOCKED');assert.equal(saved.workspace.jobs[0].error_code,'IMPORTED_JOB_REPLAN_REQUIRED');assert.equal(saved.workspace.jobs[0].output_hash,null);assert.equal(saved.workspace.jobs[0].path_local,null);
 assert.equal(saved.workspace.video_reviews[0].decision,'PENDING');assert.equal(saved.workspace.video_reviews[0].approved_at,null);
 assert.equal(saved.workspace.affiliates.creators[0].seller_creator_access_grant_status,'UNKNOWN');assert.equal(saved.workspace.affiliates.creators[0].consent_evidence.status,'DECLARED');assert.equal(saved.workspace.affiliates.plans[0].collaboration.status,'BLOCKED');assert.equal(saved.workspace.affiliates.plans[0].collaboration.owner_approval_id,null);assert.deepEqual(saved.workspace.audit,[]);assert.deepEqual(saved.workspace.affiliates.audit,[]);
 assert.deepEqual(source,original);const snapshot=rows(f);f.clock.time+=60000;assert.deepEqual(await f.read(),saved);assert.deepEqual(await f.read(),saved);assert.deepEqual(rows(f),snapshot);
 assert.doesNotMatch(JSON.stringify(snapshot),/fixture-owner|another-fixture-owner|access_token|buyer|blob:|data:image|owner-fixture-approval/);assert.ok(Object.isFrozen(saved.workspace));
});

test('different authenticated owners cannot read or overwrite another owner workspace, and nonowner scopes fail before storage',async t=>{
 const f=await fixture(t),first=await f.save({revision:0,workspace:workspace()});assert.equal((await f.read(other)).workspace,null);
 const another=workspace();another.revision=12;await f.save({revision:0,workspace:another},other);
 assert.equal((await f.read()).workspace.revision,1);assert.equal((await f.read(other)).workspace.revision,13);assert.equal(rows(f).workspaces.length,2);
 const before=rows(f);
 for(const invalid of [null,{role:'review',subject:owner.subject},{role:'owner',subject:''},{role:'owner',subject:owner.subject,shop_ref:'forged'},{role:'owner',subject:'bad\nsubject'}]){
  await assert.rejects(readAiSalesWorkspace(f.env,invalid,{now:f.now}),expectCode('AI_SALES_WORKSPACE_FORBIDDEN',403));await assert.rejects(saveAiSalesWorkspace(f.env,invalid,{revision:1,workspace:workspace()},{now:f.now}),expectCode('AI_SALES_WORKSPACE_FORBIDDEN',403));
 }
 assert.deepEqual(rows(f),before);assert.equal(first.revision,1);
});

test('unchanged saves and lost-response retries are idempotent while stale changed drafts cannot replace newer state',async t=>{
 const f=await fixture(t),source=workspace(),saved=await f.save({revision:0,workspace:source}),before=rows(f);f.clock.time+=1000;
 assert.deepEqual(await f.save({revision:0,workspace:source}),saved);assert.deepEqual(await f.save({revision:1,workspace:saved.workspace}),saved);assert.deepEqual(rows(f),before);
 const changed=workspace();changed.revision=1;const next=await f.save({revision:1,workspace:changed});assert.equal(next.revision,2);assert.equal(rows(f).audit.length,2);
 const stale=workspace();stale.revision=99;await assert.rejects(f.save({revision:1,workspace:stale}),expectCode('AI_SALES_WORKSPACE_CONFLICT',409));assert.deepEqual(await f.read(),next);
});

test('two concurrent edits use an atomic compare-and-swap and append exactly one winning audit entry',async t=>{
 const f=await fixture(t);await f.save({revision:0,workspace:workspace()});const one=workspace(),two=workspace();one.revision=10;two.revision=20;
 const outcomes=await Promise.allSettled([f.save({revision:1,workspace:one}),f.save({revision:1,workspace:two})]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.filter(r=>r.status==='rejected'&&r.reason.code==='AI_SALES_WORKSPACE_CONFLICT').length,1);
 const saved=await f.read();assert.equal(saved.revision,2);assert.ok([11,21].includes(saved.workspace.revision));assert.deepEqual(rows(f).audit.map(row=>row.revision),[1,2]);
});

test('invalid envelopes, media payloads, accessors, sparse arrays, cycles and over-one-MiB metadata never alter saved state',async t=>{
 const f=await fixture(t),source=await richWorkspace();await f.save({revision:0,workspace:source});const before=rows(f);
 const invalid=[];let getterInvoked=false;const getter=workspace();Object.defineProperty(getter,'products',{enumerable:true,get(){getterInvoked=true;throw Error('PRIVATE_GETTER');}});invalid.push(getter);
 const sparse=workspace();sparse.products=Array(1);invalid.push(sparse);
 const extra=workspace();extra.access_token='PRIVATE_TOKEN';invalid.push(extra);
 const bytes=workspace();bytes.audit=['data:image/png;base64,PRIVATE_BYTES'];invalid.push(bytes);
 const cycle=workspace();cycle.audit=[cycle];invalid.push(cycle);
 const orphan=clone(source);orphan.assets[0].variant_ref='wrong';invalid.push(orphan);
 const badHash=clone(source);badHash.video_reviews[0].review_hash='f'.repeat(64);invalid.push(badHash);
 for(const value of invalid)await assert.rejects(f.save({revision:1,workspace:value}),error=>{assert.match(error.code,/^AI_SALES_/);assert.doesNotMatch(error.message,/PRIVATE/);return true;});
 assert.equal(getterInvoked,false);await assert.rejects(f.save({revision:1,workspace:{...workspace(),extra:'é'.repeat(600000)}}),expectCode('AI_SALES_WORKSPACE_TOO_LARGE',413));
 for(const input of [{revision:-1,workspace:workspace()},{revision:1,workspace:workspace(),subject:'injected'},{revision:1}])await assert.rejects(f.save(input),expectCode('AI_SALES_WORKSPACE_REQUEST_INVALID',400));
 assert.deepEqual(rows(f),before);
});

test('audit metadata retains the latest hundred revisions without retaining a hundred payload copies',async t=>{
 const f=await fixture(t);for(let i=0;i<105;i++){const source=workspace();source.revision=i;await f.save({revision:i,workspace:source});}
 const stored=rows(f);assert.equal(stored.workspaces.length,1);assert.equal(stored.workspaces[0].revision,105);assert.equal(stored.audit.length,100);assert.equal(stored.audit[0].revision,6);assert.equal(stored.audit.at(-1).revision,105);
 assert.deepEqual(Object.keys(stored.audit[0]),['owner_hash','revision','updated_at','payload_hash']);
});

test('an audit failure rolls back the workspace mutation in the same transaction',async t=>{
 const f=await fixture(t);await f.save({revision:0,workspace:workspace()});const head=rows(f).workspaces[0];
 f.db.db.prepare('INSERT INTO mls_ai_sales_workspace_audit VALUES(?,?,?,?)').run(head.owner_hash,2,at+10,'f'.repeat(64));const before=rows(f),changed=workspace();changed.revision=10;
 await assert.rejects(f.save({revision:1,workspace:changed}),expectCode('AI_SALES_WORKSPACE_STORAGE_UNAVAILABLE',503));assert.deepEqual(rows(f),before);assert.equal((await f.read()).revision,1);
});

test('malformed or authority-restoring stored payloads are quarantined and storage failures never look empty',async t=>{
 const f=await fixture(t),saved=await f.save({revision:0,workspace:await richWorkspace()}),original=rows(f).workspaces[0];
 f.db.db.prepare('UPDATE mls_ai_sales_workspaces SET payload=?').run('{}');await assert.rejects(f.read(),expectCode('AI_SALES_WORKSPACE_STORAGE_INVALID',503));
 const forged=clone(saved.workspace);forged.products[0].observations[0].evidence.status='VERIFIED';
 // Recompute the public content hash as a malicious database editor could;
 // structural authority checks must still reject it independently of hashing.
 const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
 const payload=canonical(forged);f.db.db.prepare('UPDATE mls_ai_sales_workspaces SET payload=?,payload_hash=?').run(payload,createHash('sha256').update(payload).digest('hex'));await assert.rejects(f.read(),expectCode('AI_SALES_WORKSPACE_STORAGE_INVALID',503));
 f.db.db.prepare('UPDATE mls_ai_sales_workspaces SET payload=?,payload_hash=?').run(original.payload,original.payload_hash);assert.deepEqual(await f.read(),saved);
 const broken={ADMIN_DB:{prepare(){throw Error('PRIVATE_DATABASE_FAILURE');},batch(){throw Error('PRIVATE_DATABASE_FAILURE');}}};await assert.rejects(readAiSalesWorkspace(broken,owner,{now:f.now}),expectCode('AI_SALES_WORKSPACE_STORAGE_UNAVAILABLE',503));
});

test('normalization matches JSON-resume downgrade without changing its input or certifying media bytes',async()=>{
 const source=await richWorkspace(),before=clone(source),next=await normalizeAiSalesWorkspaceDraft(source,{at:at+10});assert.deepEqual(source,before);assert.equal(next.assets[0].rights.status,'AUTHORIZED');assert.equal(next.video_reviews[0].decision,'PENDING');assert.equal(next.jobs[0].state,'QA_BLOCKED');assert.equal(next.commercial_writes,false);
 const block=MLS_AI_SALES_CLIENT.split('/*__MLS_AI_SALES_UI_VALIDATORS_START__*/')[1].split('/*__MLS_AI_SALES_UI_VALIDATORS_END__*/')[0],declarations=['fail','safe','copy','exact'].map(name=>MLS_AI_SALES_CLIENT.match(new RegExp('^ const '+name+'=.*$','m'))?.[0]).join('\n');
 const ui=Function('core',declarations+'\n'+block+'\nreturn {validateWorkspace};')({...contracts,...planner,...catalog,...affiliates,...performance});assert.deepEqual(next,await ui.validateWorkspace(source,at+10),'cloud persistence must retain exactly the existing JSON resume downgrade');
 await assert.rejects(normalizeAiSalesWorkspaceDraft(source,{at:at-1}),/AI_SALES_/);
});
