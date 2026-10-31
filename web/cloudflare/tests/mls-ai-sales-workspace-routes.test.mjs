import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {adminFetch} from '../src/admin.mjs';
import {D1} from './sqlite-d1.mjs';
import {createAiSalesAffiliateWorkspace} from '../src/mls-ai-sales-affiliates.mjs';
import {createAiSalesPerformanceLedger} from '../src/mls-ai-sales-performance.mjs';
import {planAiSalesCampaign,createAiSalesVideoJob} from '../src/mls-ai-sales-campaign-planner.mjs';
import {hashAiSalesValue} from '../src/mls-ai-sales-contracts.mjs';
import {salesAt,salesProduct,salesAsset,salesCampaignRequest} from './mls-ai-sales-domain-fixture.mjs';

const origin='https://ai-workspace.fixture',path='/api/admin/ai-sales/workspace';
const clone=value=>JSON.parse(JSON.stringify(value));
const empty=()=>({schema:'mls_ai_sales_workspace_v1',revision:0,products:[],assets:[],campaigns:[],jobs:[],video_reviews:[],affiliates:createAiSalesAffiliateWorkspace(),performance:createAiSalesPerformanceLedger(),audit:[],commercial_writes:false});
const changes=auth=>auth.env.ADMIN_DB.db.prepare('SELECT total_changes() AS count').get().count;
const tables=auth=>auth.env.ADMIN_DB.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
async function login(t,fetch=adminFetch){
 const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'synthetic-ai-workspace-owner-session-'+ 's'.repeat(40),ADMIN_USERNAME:'synthetic-owner',ADMIN_PASSWORD:'synthetic-owner-password-123456',REVIEW_USERNAME:'synthetic-review',REVIEW_PASSWORD:'synthetic-review-password-123456',SESSION_SECRET:'synthetic-review-session-'+ 'r'.repeat(40),MLS_AI_SALES_OWNER_PREVIEW:'ENABLED'};
 t.after(()=>env.ADMIN_DB.db.close());
 let providerReads=0;
 const services=new Proxy({}, {get:()=>async()=>{providerReads++;throw Error('PRIVATE_UNEXPECTED_PROVIDER_READ');}});
 const invoke=(request)=>fetch(request,env,services);
 const response=await invoke(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}));
 assert.equal(response.status,303);const cookie=response.headers.get('set-cookie').split(';')[0];
 const bootstrap=await invoke(new Request(origin+'/api/admin/bootstrap',{headers:{cookie}}));assert.equal(bootstrap.status,200);const {csrf}=await bootstrap.json();
 return {env,invoke,cookie,csrf,providerReads:()=>providerReads};
}
function request(auth,body,options={}){
 const method=options.method??(body===undefined?'GET':'POST');
 return new Request(origin+path+(options.search??''),{method,headers:{cookie:options.cookie??auth.cookie,origin:options.origin??origin,'x-csrf-token':options.csrf??auth.csrf,'content-type':options.contentType??'application/json'},...(!['GET','HEAD'].includes(method)?{body:options.raw??JSON.stringify(body??{})}:{})});
}
async function draft(){
 const product=salesProduct(),asset=salesAsset(product),campaign=await planAiSalesCampaign(salesCampaignRequest(product,[asset])),job=await createAiSalesVideoJob(campaign,product.product_key,{job_id:'workspace-synthetic-job',assets:[asset]});
 const output='b'.repeat(64),manifest={schema:'mls_ai_sales_render_result_v1',state:'READY_FOR_OWNER',render_policy:'MLS_LOCAL_VIDEO_CONTAIN_PTBR_V1',idempotency_key:'c'.repeat(64),campaign_id:campaign.campaign_id,product_key:product.product_key,template_id:campaign.template_id,job:{...job,state:'READY_FOR_OWNER',output_hash:output,path_local:'synthetic-local-output/video.mp4'},source_assets:[{asset_id:asset.asset_id,sha256:asset.sha256,manifest_hash:await hashAiSalesValue(asset),component_coverage:asset.component_coverage,preserve_geometry:true,role:asset.role}],narration:{source:'ESPEAK_NG_OFFLINE_PT_BR',language:'pt-BR',source_sha256:'d'.repeat(64),rights_reference:'synthetic-authorized-voice'},script_source:'LOCAL_TEMPLATE',ai_disclosure_required:true,qa:{status:'PASSED',width:1080,height:1920,duration_ms:15000,fps:30,video_codec:'h264',audio_codec:'aac',full_decode:true,sha256:output,size_bytes:10000},files:['video.mp4','thumbnail.jpg','captions.srt','script.txt'].map((name,index)=>({name,sha256:index?'e'.repeat(64):output,size_bytes:index?100:10000})),costs:{provider_cost_cents:0,currency:'BRL',local_compute_cost_cents:null,elapsed_ms:14000},tools:{ffmpeg:'ffmpeg',ffprobe:'ffprobe',ffmpeg_version:'synthetic ffmpeg fixture',ffprobe_version:'synthetic ffprobe fixture'},approval:'PENDING',commercial_writes:false};
 return {...empty(),revision:5,products:[product],assets:[asset],campaigns:[campaign],jobs:[{...manifest.job,state:'APPROVED'}],video_reviews:[{manifest,review_hash:await hashAiSalesValue(manifest),decision:'APPROVED',approved_at:salesAt}]};
}

test('AI draft API requires an owner and exact independent flag before reading storage',async t=>{
 const auth=await login(t);assert.deepEqual(tables(auth),[]);const before=auth.env.ADMIN_DB.calls;
 for(const cookie of ['',auth.cookie.replace(/.$/,'x')]){const response=await auth.invoke(request(auth,undefined,{cookie}));assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'UNAUTHORIZED'});}
 const review=await auth.invoke(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:auth.env.REVIEW_USERNAME,password:auth.env.REVIEW_PASSWORD})}));assert.equal(review.status,303);
 assert.equal((await auth.invoke(request(auth,undefined,{cookie:review.headers.get('set-cookie').split(';')[0]}))).status,401);
 for(const value of [undefined,'enabled','ENABLED ',true,'DISABLED']){
  auth.env.MLS_AI_SALES_OWNER_PREVIEW=value;
  const response=await auth.invoke(request(auth));assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:'NOT_FOUND'});
 }
 assert.equal(auth.env.ADMIN_DB.calls,before);assert.equal(auth.providerReads(),0);assert.deepEqual(tables(auth),[]);
});

test('GET returns a private empty or saved draft without initializing financial state or contacting sources',async t=>{
 const auth=await login(t),before=changes(auth);
 for(let attempt=0;attempt<3;attempt++){
  const response=await auth.invoke(request(auth));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('access-control-allow-origin'),null);
  assert.deepEqual(await response.json(),{schema:'mls_ai_sales_saved_workspace_v1',revision:0,updated_at:null,workspace:null,commercial_writes:false});
 }
 assert.equal(changes(auth),before);assert.deepEqual(tables(auth),[]);assert.equal(auth.providerReads(),0);
});

test('workspace writes enforce method, exact query, origin, CSRF and bounded JSON before any draft mutation',async t=>{
 const auth=await login(t),body={revision:0,workspace:empty()},before=changes(auth);
 for(const [options,status,error] of [
  [{method:'PUT'},405,'METHOD_NOT_ALLOWED'],[{method:'DELETE'},405,'METHOD_NOT_ALLOWED'],[{method:'HEAD'},405,'METHOD_NOT_ALLOWED'],
  [{search:'?owner=someone'},400,'AI_SALES_WORKSPACE_REQUEST_INVALID'],[{method:'GET',search:'?revision=0'},400,'AI_SALES_WORKSPACE_REQUEST_INVALID'],
  [{origin:'https://external.invalid'},403,'ORIGIN_REJECTED'],[{csrf:''},403,'CSRF_REJECTED'],
  [{contentType:'text/plain'},415,'JSON_REQUIRED'],[{raw:'{invalid'},400,'BODY_INVALID'],[{raw:'[]'},400,'BODY_INVALID'],
  [{raw:' '.repeat(1048833)},413,'BODY_TOO_LARGE'],
 ]){
  const response=await auth.invoke(request(auth,body,options));assert.equal(response.status,status,JSON.stringify(options));
  if(options.method!=='HEAD')assert.deepEqual(await response.json(),{error});
 }
 // The anti-CSRF gate wins over a malformed or oversized payload.
 const blocked=await auth.invoke(request(auth,body,{csrf:'',raw:' '.repeat(1048833)}));assert.equal(blocked.status,403);assert.deepEqual(await blocked.json(),{error:'CSRF_REJECTED'});
 assert.equal(changes(auth),before);assert.deepEqual(tables(auth),[]);assert.equal(auth.providerReads(),0);
});

test('saving and reloading retain useful metadata but revoke imported approvals and verified product claims',async t=>{
 const auth=await login(t),source=await draft(),response=await auth.invoke(request(auth,{revision:0,workspace:source}));
 assert.equal(response.status,200,await response.clone().text());const saved=await response.json();assert.equal(saved.revision,1);assert.ok(Number.isSafeInteger(saved.updated_at));assert.equal(saved.workspace.products[0].title,source.products[0].title);
 assert.ok(saved.workspace.products[0].observations.every(row=>row.evidence.status==='DECLARED'));
 assert.deepEqual(saved.workspace.products[0].verified_product_attributes,[]);assert.equal(saved.workspace.jobs[0].state,'QA_BLOCKED');assert.equal(saved.workspace.jobs[0].output_hash,null);assert.equal(saved.workspace.jobs[0].path_local,null);
 assert.equal(saved.workspace.video_reviews[0].decision,'PENDING');assert.equal(saved.workspace.video_reviews[0].approved_at,null);assert.equal(saved.commercial_writes,false);
 const before=changes(auth),reload=await auth.invoke(request(auth));assert.equal(reload.status,200);assert.deepEqual(await reload.json(),saved);assert.equal(changes(auth),before);
 assert.deepEqual(tables(auth),['mls_ai_sales_workspace_audit','mls_ai_sales_workspaces']);assert.equal(auth.providerReads(),0);
 assert.equal(source.jobs[0].state,'APPROVED');assert.equal(source.video_reviews[0].decision,'APPROVED');
 assert.doesNotMatch(JSON.stringify(saved),/PRIVATE|access_token|cookie|blob:|data:/);
});

test('a stale tab cannot overwrite the saved draft and invalid extra owner or binary fields cannot mutate it',async t=>{
 const auth=await login(t),workspace=empty();let response=await auth.invoke(request(auth,{revision:0,workspace}));assert.equal(response.status,200);const saved=await response.json(),before=changes(auth);
 for(const input of [{revision:0,workspace:{...workspace,revision:1}},{revision:1,workspace,subject:'another-owner'},{revision:1,workspace:{...workspace,binary_media:'data:video/mp4;base64,PRIVATE'}},{revision:1,workspace:{...workspace,commercial_writes:true}}]){
  response=await auth.invoke(request(auth,input));assert.ok([400,409].includes(response.status));assert.match((await response.json()).error,/^AI_SALES_WORKSPACE_/);
 }
 assert.equal(changes(auth),before);assert.deepEqual(await(await auth.invoke(request(auth))).json(),saved);assert.equal(auth.providerReads(),0);
});

test('an unavailable draft store returns a finite safe error without provider or private database details',async t=>{
 const auth=await login(t),prepare=auth.env.ADMIN_DB.prepare.bind(auth.env.ADMIN_DB);
 auth.env.ADMIN_DB.prepare=()=>{throw Error('PRIVATE_DATABASE_CREDENTIAL_OR_QUERY');};
 const failed=await auth.invoke(request(auth));assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:'AI_SALES_WORKSPACE_STORAGE_UNAVAILABLE'});
 auth.env.ADMIN_DB.prepare=prepare;
 assert.equal((await auth.invoke(request(auth))).status,200);assert.equal(auth.providerReads(),0);assert.deepEqual(tables(auth),[]);
});

for(const minify of [false,true])test(`the generated App persists owner drafts with CAS and revoked approvals (minify=${minify})`,async t=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const originalFetch=globalThis.fetch;let outbound=0;globalThis.fetch=async()=>{outbound++;throw Error('PRIVATE_UNEXPECTED_OUTBOUND');};t.after(()=>{globalThis.fetch=originalFetch;});
 const auth=await login(t,(request,env)=>worker.fetch(request,env)),source=await draft();
 const write=await auth.invoke(request(auth,{revision:0,workspace:source}));assert.equal(write.status,200,await write.clone().text());const saved=await write.json();
 assert.equal(saved.revision,1);assert.equal(saved.workspace.jobs[0].state,'QA_BLOCKED');assert.equal(saved.workspace.video_reviews[0].decision,'PENDING');
 assert.deepEqual(await(await auth.invoke(request(auth))).json(),saved);
 const conflict=await auth.invoke(request(auth,{revision:0,workspace:{...source,revision:6}}));assert.equal(conflict.status,409);assert.deepEqual(await conflict.json(),{error:'AI_SALES_WORKSPACE_CONFLICT'});
 assert.equal(outbound,0);assert.deepEqual(tables(auth),['mls_ai_sales_workspace_audit','mls_ai_sales_workspaces']);
});
