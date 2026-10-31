import {readAiSalesRecord,readAiSalesList,validateAiSalesProductSnapshot,validateAiSalesAsset,validateAiSalesCampaignPlan,validateAiSalesVideoJob,validateAiSalesActionAudit,hashAiSalesValue} from './mls-ai-sales-contracts.mjs';
import {importAiSalesManualProduct} from './mls-ai-sales-catalog.mjs';
import {validateAiSalesAffiliateWorkspace,importAiSalesAffiliateWorkspace} from './mls-ai-sales-affiliates.mjs';
import {createAiSalesPerformanceLedger,validateAiSalesPerformanceLedger,importAiSalesPerformance} from './mls-ai-sales-performance.mjs';

// One owner per existing ADMIN_DB deployment. Only draft metadata is persisted;
// media bytes and browser attachment proofs remain local. These additive tables
// are harmless to an older App version during rollback.
export const AI_SALES_WORKSPACE_STORE_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS mls_ai_sales_workspaces(owner_hash TEXT PRIMARY KEY NOT NULL,revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 2147483647),updated_at INTEGER NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=1048576),payload_hash TEXT NOT NULL,request_hash TEXT NOT NULL,write_token TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS mls_ai_sales_workspace_audit(owner_hash TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL,payload_hash TEXT NOT NULL,PRIMARY KEY(owner_hash,revision))`,
];
export class AiSalesWorkspaceStoreError extends Error{constructor(code,status=400){super(code);this.name='AiSalesWorkspaceStoreError';this.code=code;this.status=status;}}
const fail=(code,status=400)=>{throw new AiSalesWorkspaceStoreError(code,status);};
const LIMIT=1048576,MAX_REVISION=2147483647,encoder=new TextEncoder(),ready=new WeakMap();
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const ref=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value);
const exact=(value,keys)=>{try{readAiSalesRecord(value,keys);return true;}catch{return false;}};
const clone=value=>JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const text=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);
function epoch(now){let value;try{value=now();}catch{fail('AI_SALES_WORKSPACE_CLOCK_INVALID',503);}if(!integer(value,1000,4102444800000))fail('AI_SALES_WORKSPACE_CLOCK_INVALID',503);return Math.floor(value/1000);}
async function digest(value){if(!globalThis.crypto?.subtle)fail('AI_SALES_WORKSPACE_CRYPTO_UNAVAILABLE',503);return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),v=>v.toString(16).padStart(2,'0')).join('');}
async function ownerHash(owner){
 if(!exact(owner,['role','subject'])||owner.role!=='owner'||!text(owner.subject,256))fail('AI_SALES_WORKSPACE_FORBIDDEN',403);
 return digest('MLS_AI_SALES_OWNER_WORKSPACE_V1\0'+owner.subject);
}
function database(env){const db=env?.ADMIN_DB;if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')fail('AI_SALES_WORKSPACE_CONFIGURATION',503);return db;}
async function setup(db){if(!ready.has(db))ready.set(db,db.batch(AI_SALES_WORKSPACE_STORE_SCHEMA.map(sql=>db.prepare(sql))).catch(()=>{ready.delete(db);fail('AI_SALES_WORKSPACE_STORAGE_UNAVAILABLE',503);}));await ready.get(db);}
const storage=async work=>{try{return await work();}catch(error){if(error instanceof AiSalesWorkspaceStoreError)throw error;fail('AI_SALES_WORKSPACE_STORAGE_UNAVAILABLE',503);}};

// Bound and inspect plain JSON before domain validators clone anything. This
// rejects accessors, sparse arrays, cycles, custom prototypes and media data
// URLs without invoking toJSON/getters or including private input in errors.
function metadataJson(raw){
 let bytes=0;const seen=new Set(),add=s=>{bytes+=encoder.encode(s).byteLength;if(bytes>LIMIT)fail('AI_SALES_WORKSPACE_TOO_LARGE',413);return s;};
 const visit=(value,depth)=>{
  if(depth>24)fail('AI_SALES_WORKSPACE_INVALID');
  if(value===null)return add('null');if(typeof value==='boolean')return add(String(value));
  if(typeof value==='number'){if(!integer(value,-Number.MAX_SAFE_INTEGER))fail('AI_SALES_WORKSPACE_INVALID');return add(String(value));}
  if(typeof value==='string'){if(/^(?:data:[^,]{0,256};base64,|blob:https?:\/\/)/i.test(value))fail('AI_SALES_WORKSPACE_MEDIA_BYTES_FORBIDDEN');return add(JSON.stringify(value));}
  if(!value||typeof value!=='object'||seen.has(value))fail('AI_SALES_WORKSPACE_INVALID');seen.add(value);
  let output;
  if(Array.isArray(value)){
   if(Object.getPrototypeOf(value)!==Array.prototype||value.length>5000||Reflect.ownKeys(value).length!==value.length+1)fail('AI_SALES_WORKSPACE_INVALID');
   const entries=[];for(let i=0;i<value.length;i++){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))fail('AI_SALES_WORKSPACE_INVALID');entries.push(visit(d.value,depth+1));}
   add(','.repeat(Math.max(0,entries.length-1)));output=add('[')+entries.join(',')+add(']');
  }else{
   if(![Object.prototype,null].includes(Object.getPrototypeOf(value)))fail('AI_SALES_WORKSPACE_INVALID');
   const keys=Reflect.ownKeys(value);if(keys.length>100||keys.some(k=>typeof k!=='string'))fail('AI_SALES_WORKSPACE_INVALID');
   const entries=[];for(const key of keys.sort()){
    const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value')||/^(?:access_token|refresh_token|authorization|cookie|password|secret|buyer|buyer_data|email|phone|bytes|data_url)$/i.test(key))fail('AI_SALES_WORKSPACE_INVALID');
    entries.push(add(JSON.stringify(key))+add(':')+visit(d.value,depth+1));
   }
   add(','.repeat(Math.max(0,entries.length-1)));output=add('{')+entries.join(',')+add('}');
  }
  seen.delete(value);return output;
 };
 const result=visit(raw,0);if(encoder.encode(result).byteLength>LIMIT)fail('AI_SALES_WORKSPACE_TOO_LARGE',413);return result;
}
function validateManifest(raw){
 const keys=['schema','state','render_policy','idempotency_key','campaign_id','product_key','template_id','job','source_assets','narration','script_source','ai_disclosure_required','qa','files','costs','tools','approval','commercial_writes'];
 if(!exact(raw,keys)||raw.schema!=='mls_ai_sales_render_result_v1'||raw.state!=='READY_FOR_OWNER'||raw.render_policy!=='MLS_LOCAL_VIDEO_CONTAIN_PTBR_V1'||!hash(raw.idempotency_key)||!ref(raw.campaign_id)||!['NOSTALGIA_80_90_2000','PRODUCT_DETAILS','COUPLE_KIT'].includes(raw.template_id)||raw.script_source!=='LOCAL_TEMPLATE'||raw.ai_disclosure_required!==true||raw.approval!=='PENDING'||raw.commercial_writes!==false)fail('AI_SALES_VIDEO_MANIFEST_INVALID');
 const job=validateAiSalesVideoJob(raw.job),qa=raw.qa;
 if(job.state!=='READY_FOR_OWNER'||job.campaign_id!==raw.campaign_id||job.product_ref!==raw.product_key||job.template_id!==raw.template_id||job.error_code!==null)fail('AI_SALES_VIDEO_JOB_MISMATCH');
 if(!exact(qa,['status','width','height','duration_ms','fps','video_codec','audio_codec','full_decode','sha256','size_bytes'])||qa.status!=='PASSED'||qa.width!==1080||qa.height!==1920||!integer(qa.duration_ms,14950,30100)||qa.fps!==30||qa.video_codec!=='h264'||qa.audio_codec!=='aac'||qa.full_decode!==true||!hash(qa.sha256)||!integer(qa.size_bytes,1,67108864)||job.output_hash!==qa.sha256)fail('AI_SALES_VIDEO_QA_INVALID');
 if(!Array.isArray(raw.files)||raw.files.length!==4)fail('AI_SALES_VIDEO_FILES_INVALID');const names=new Set();
 for(const row of raw.files){if(!exact(row,['name','sha256','size_bytes'])||!['video.mp4','thumbnail.jpg','captions.srt','script.txt'].includes(row.name)||names.has(row.name)||!hash(row.sha256)||!integer(row.size_bytes,1,67108864))fail('AI_SALES_VIDEO_FILES_INVALID');names.add(row.name);}
 const video=raw.files.find(row=>row.name==='video.mp4');if(video.sha256!==qa.sha256||video.size_bytes!==qa.size_bytes)fail('AI_SALES_VIDEO_FILES_INVALID');
 if(!Array.isArray(raw.source_assets)||!raw.source_assets.length||raw.source_assets.length>30)fail('AI_SALES_VIDEO_SOURCES_INVALID');const ids=new Set();
 for(const asset of raw.source_assets){if(!exact(asset,['asset_id','sha256','manifest_hash','component_coverage','preserve_geometry','role'])||!ref(asset.asset_id)||ids.has(asset.asset_id)||!hash(asset.sha256)||!hash(asset.manifest_hash)||asset.preserve_geometry!==true||!['MOCKUP_ORIGINAL','PRODUCT_PHOTO'].includes(asset.role)||!Array.isArray(asset.component_coverage)||asset.component_coverage.length<1||asset.component_coverage.length>20)fail('AI_SALES_VIDEO_SOURCES_INVALID');ids.add(asset.asset_id);const components=new Set();for(const row of asset.component_coverage){if(!exact(row,['component_ref','quantity'])||!ref(row.component_ref)||components.has(row.component_ref)||!integer(row.quantity,1,20))fail('AI_SALES_VIDEO_SOURCES_INVALID');components.add(row.component_ref);}}
 if(!exact(raw.narration,['source','language','source_sha256','rights_reference'])||!['ESPEAK_NG_OFFLINE_PT_BR','OPERATOR_LICENSED_PT_BR_WAV'].includes(raw.narration.source)||raw.narration.language!=='pt-BR'||!hash(raw.narration.source_sha256)||!text(raw.narration.rights_reference,240))fail('AI_SALES_VIDEO_NARRATION_INVALID');
 if(!exact(raw.costs,['provider_cost_cents','currency','local_compute_cost_cents','elapsed_ms'])||raw.costs.provider_cost_cents!==0||raw.costs.currency!=='BRL'||raw.costs.local_compute_cost_cents!==null&&!integer(raw.costs.local_compute_cost_cents)||!integer(raw.costs.elapsed_ms))fail('AI_SALES_VIDEO_COSTS_INVALID');
 if(!exact(raw.tools,['ffmpeg','ffprobe','ffmpeg_version','ffprobe_version'])||Object.values(raw.tools).some(v=>!text(v,500)))fail('AI_SALES_VIDEO_TOOLS_INVALID');
 return clone({...raw,job});
}
async function checkedWorkspace(raw,at,downgrade){
 if(!exact(raw,['schema','revision','products','assets','campaigns','jobs','video_reviews','affiliates','performance','audit','commercial_writes'])||raw.schema!=='mls_ai_sales_workspace_v1'||!integer(raw.revision,0,MAX_REVISION-(downgrade?1:0))||raw.commercial_writes!==false)fail('AI_SALES_WORKSPACE_INVALID');
 for(const [key,limit] of [['products',10],['assets',100],['campaigns',60],['jobs',600],['video_reviews',100],['audit',1000]])readAiSalesList(raw[key],limit,'AI_SALES_WORKSPACE_LIMIT');
 const products=raw.products.map(p=>downgrade?importAiSalesManualProduct(p,{at}):validateAiSalesProductSnapshot(p)),assets=raw.assets.map(validateAiSalesAsset),campaigns=raw.campaigns.map(validateAiSalesCampaignPlan),jobs=raw.jobs.map(validateAiSalesVideoJob).map(j=>downgrade?validateAiSalesVideoJob({...clone(j),state:'QA_BLOCKED',error_code:'IMPORTED_JOB_REPLAN_REQUIRED',output_hash:null,path_local:null}):j);
 for(const [rows,key] of [[products,'product_key'],[assets,'asset_id'],[campaigns,'campaign_id'],[jobs,'job_id']])if(new Set(rows.map(row=>row[key])).size!==rows.length)fail('AI_SALES_WORKSPACE_DUPLICATE');
 for(const asset of assets){const product=products.find(p=>p.product_key===asset.product_key);if(!product||asset.variant_ref!==product.variant_ref||!product.media_refs.includes(asset.asset_id))fail('AI_SALES_WORKSPACE_ASSET_SCOPE');}
 for(const product of products)if(product.media_refs.some(id=>!assets.some(a=>a.asset_id===id&&a.product_key===product.product_key)))fail('AI_SALES_WORKSPACE_ASSET_SCOPE');
 for(const campaign of campaigns)if(campaign.product_refs.some(key=>!products.some(p=>p.product_key===key&&p.marketplace===campaign.marketplace&&p.shop_ref===campaign.shop_ref))||campaign.asset_refs.some(id=>!assets.some(a=>a.asset_id===id&&campaign.product_refs.includes(a.product_key))))fail('AI_SALES_WORKSPACE_CAMPAIGN_SCOPE');
 for(const job of jobs){const campaign=campaigns.find(c=>c.campaign_id===job.campaign_id);if(!campaign||!campaign.product_refs.includes(job.product_ref)||campaign.template_id!==job.template_id)fail('AI_SALES_WORKSPACE_JOB_SCOPE');}
 const video_reviews=[];
 for(const row of raw.video_reviews){
  if(!exact(row,['manifest','review_hash','decision','approved_at'])||!['PENDING','APPROVED','REJECTED'].includes(row.decision)||!hash(row.review_hash)||row.approved_at!==null&&!integer(row.approved_at,1,at))fail('AI_SALES_WORKSPACE_REVIEW_INVALID');
  const manifest=validateManifest(row.manifest),review_hash=await hashAiSalesValue(manifest),campaign=campaigns.find(c=>c.campaign_id===manifest.campaign_id);
  if(!campaign||!campaign.product_refs.includes(manifest.product_key)||campaign.template_id!==manifest.template_id)fail('AI_SALES_WORKSPACE_REVIEW_SCOPE');if(review_hash!==row.review_hash)fail('AI_SALES_WORKSPACE_REVIEW_HASH');
  video_reviews.push({manifest,review_hash,decision:downgrade?'PENDING':row.decision,approved_at:downgrade?null:row.approved_at});
 }
 if(new Set(video_reviews.map(v=>v.review_hash)).size!==video_reviews.length)fail('AI_SALES_WORKSPACE_DUPLICATE');
 for(const row of raw.audit)validateAiSalesActionAudit(row);
 const affiliates=downgrade?importAiSalesAffiliateWorkspace(JSON.stringify(raw.affiliates),{imported_at:at}):validateAiSalesAffiliateWorkspace(raw.affiliates);
 const performance=downgrade?importAiSalesPerformance(createAiSalesPerformanceLedger(),JSON.stringify(raw.performance),{format:'json',imported_at:at}).ledger:validateAiSalesPerformanceLedger(raw.performance);
 const output={schema:raw.schema,revision:raw.revision+(downgrade?1:0),products,assets,campaigns,jobs,video_reviews,affiliates,performance,audit:downgrade?[]:raw.audit.map(validateAiSalesActionAudit),commercial_writes:false};
 if(!downgrade){
  const checkAuthority=value=>{if(!value||typeof value!=='object')return;if(value.status==='VERIFIED'||Object.hasOwn(value,'seller_creator_access_grant_status')&&value.seller_creator_access_grant_status!=='UNKNOWN')fail('AI_SALES_WORKSPACE_STORAGE_INVALID',503);Object.values(value).forEach(checkAuthority);};checkAuthority(output);
  if(output.audit.length||affiliates.audit.length||products.some(p=>p.verified_product_attributes.length)||jobs.some(j=>j.state!=='QA_BLOCKED'||j.error_code!=='IMPORTED_JOB_REPLAN_REQUIRED'||j.output_hash!==null||j.path_local!==null)||video_reviews.some(r=>r.decision!=='PENDING'||r.approved_at!==null)||affiliates.plans.some(p=>p.collaboration.owner_approval_id!==null||p.collaboration.status!=='BLOCKED'))fail('AI_SALES_WORKSPACE_STORAGE_INVALID',503);
 }
 return freeze(output);
}

/** Same downgrade as JSON resume: no media attachment, approval or API grant survives. */
export async function normalizeAiSalesWorkspaceDraft(raw,{at}={}){
 if(!integer(at,1,4102444800))fail('AI_SALES_WORKSPACE_CLOCK_INVALID',503);metadataJson(raw);
 try{const value=await checkedWorkspace(raw,at,true);metadataJson(value);return value;}catch(error){if(error instanceof AiSalesWorkspaceStoreError)throw error;fail('AI_SALES_WORKSPACE_INVALID');}
}
const empty=()=>freeze({schema:'mls_ai_sales_saved_workspace_v1',revision:0,updated_at:null,workspace:null,commercial_writes:false});
async function fromRow(row,stamp){
 if(!row)return empty();
 if(!integer(row.revision,1,MAX_REVISION)||!integer(row.updated_at,1,stamp)||typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>LIMIT||!hash(row.payload_hash)||!hash(row.request_hash)||typeof row.write_token!=='string'||!/^[a-f0-9-]{36}$/.test(row.write_token))fail('AI_SALES_WORKSPACE_STORAGE_INVALID',503);
 if(await digest(row.payload)!==row.payload_hash)fail('AI_SALES_WORKSPACE_STORAGE_INVALID',503);
 try{const raw=JSON.parse(row.payload);if(metadataJson(raw)!==row.payload)fail('AI_SALES_WORKSPACE_STORAGE_INVALID',503);const workspace=await checkedWorkspace(raw,row.updated_at,false);return freeze({schema:'mls_ai_sales_saved_workspace_v1',revision:row.revision,updated_at:row.updated_at,workspace,commercial_writes:false});}catch{fail('AI_SALES_WORKSPACE_STORAGE_INVALID',503);}
}
const select=(db,scope)=>db.prepare('SELECT revision,updated_at,payload,payload_hash,request_hash,write_token FROM mls_ai_sales_workspaces WHERE owner_hash=?').bind(scope).first();

// This path is SELECT only: a new deployment can read its empty workspace even
// before normal App setup creates the additive schema. Other SQL failures are
// unavailable, never mistaken for an empty draft.
export async function readAiSalesWorkspace(env,owner,{now=()=>Date.now()}={}){
 const scope=await ownerHash(owner),stamp=epoch(now),db=database(env);let row;
 try{row=await select(db,scope);}catch(error){if(typeof error?.message==='string'&&/\bno such table:\s*(?:main\.)?mls_ai_sales_workspaces\b/i.test(error.message))return empty();fail('AI_SALES_WORKSPACE_STORAGE_UNAVAILABLE',503);}
 return fromRow(row,stamp);
}
export async function saveAiSalesWorkspace(env,owner,input,{now=()=>Date.now()}={}){
 const scope=await ownerHash(owner),stamp=epoch(now);
 if(!exact(input,['revision','workspace'])||!integer(input.revision,0,MAX_REVISION-1))fail('AI_SALES_WORKSPACE_REQUEST_INVALID');
 const requestPayload=metadataJson(input.workspace),requestHash=await digest(requestPayload),workspace=await normalizeAiSalesWorkspaceDraft(input.workspace,{at:stamp}),payload=metadataJson(workspace),payloadHash=await digest(payload),db=database(env);
 await setup(db);const prior=await storage(()=>select(db,scope));
 if(prior){const saved=await fromRow(prior,stamp);if(requestHash===prior.request_hash||requestHash===prior.payload_hash)return saved;if(input.revision!==prior.revision)fail('AI_SALES_WORKSPACE_CONFLICT',409);}
 else if(input.revision!==0)fail('AI_SALES_WORKSPACE_CONFLICT',409);
 const revision=input.revision+1,token=crypto.randomUUID();let writes;
 const mutation=input.revision===0
  ?db.prepare('INSERT OR IGNORE INTO mls_ai_sales_workspaces(owner_hash,revision,updated_at,payload,payload_hash,request_hash,write_token) VALUES(?,?,?,?,?,?,?)').bind(scope,revision,stamp,payload,payloadHash,requestHash,token)
  :db.prepare('UPDATE mls_ai_sales_workspaces SET revision=?,updated_at=?,payload=?,payload_hash=?,request_hash=?,write_token=? WHERE owner_hash=? AND revision=? AND updated_at<=?').bind(revision,stamp,payload,payloadHash,requestHash,token,scope,input.revision,stamp);
 try{writes=await db.batch([
  mutation,
  db.prepare('INSERT INTO mls_ai_sales_workspace_audit(owner_hash,revision,updated_at,payload_hash) SELECT owner_hash,revision,updated_at,payload_hash FROM mls_ai_sales_workspaces WHERE owner_hash=? AND write_token=?').bind(scope,token),
  db.prepare('DELETE FROM mls_ai_sales_workspace_audit WHERE owner_hash=? AND revision<=? AND EXISTS(SELECT 1 FROM mls_ai_sales_workspaces WHERE owner_hash=? AND write_token=?)').bind(scope,revision-100,scope,token),
 ]);}catch{fail('AI_SALES_WORKSPACE_STORAGE_UNAVAILABLE',503);}
 if(writes[0]?.meta?.changes!==1){const winner=await storage(()=>select(db,scope));if(winner&&(requestHash===winner.request_hash||requestHash===winner.payload_hash))return fromRow(winner,stamp);fail('AI_SALES_WORKSPACE_CONFLICT',409);}
 if(writes[1]?.meta?.changes!==1)fail('AI_SALES_WORKSPACE_STORAGE_UNAVAILABLE',503);
 return freeze({schema:'mls_ai_sales_saved_workspace_v1',revision,updated_at:stamp,workspace,commercial_writes:false});
}
