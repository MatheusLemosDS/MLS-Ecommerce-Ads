// Development-only assets for the loopback owner preview. No store connection.
import {mkdtempSync,rmSync,existsSync,lstatSync,writeFileSync,renameSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {writeSyntheticAiSalesFixtures} from './tests/fixtures/mls-ai-sales-media-fixture.mjs';
import {planAiSalesCampaign} from '../web/cloudflare/src/mls-ai-sales-campaign-planner.mjs';
import {renderLocalAiSales} from './mls-ai-sales/render.mjs';
import {plainDirectory,readLocalBounded} from './mls-ai-sales/media.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const scenarios=Object.freeze([
 {id:'nostalgia',template_id:'NOSTALGIA_80_90_2000',product:0},
 {id:'detalhes',template_id:'PRODUCT_DETAILS',product:1},
 {id:'kit-casal',template_id:'COUPLE_KIT',product:2}
]);
function privateFile(root,name,bytes){
 const filename=path.join(root,name);
 if(existsSync(filename)){
  const existing=readLocalBounded(root,name,67108864);
  if(!existing.equals(Buffer.from(bytes)))fail('PREVIEW_ASSET_FILE_CONFLICT');
  return;
 }
 writeFileSync(filename,bytes,{flag:'wx',mode:0o600});
}
function readGeneration(root,at){
 if(at!==undefined&&(!Number.isSafeInteger(at)||at<1||at>4102444800))fail('PREVIEW_ASSET_TIME_INVALID');
 let prior=null;
 for(const [name,schema] of [['demo-index.json','mls_owner_preview_media_v1'],['source-generation.json','mls_owner_preview_source_v1']]){
  if(!existsSync(path.join(root,name)))continue;
  let record;try{record=JSON.parse(readLocalBounded(root,name,1048576).toString('utf8'));}catch{fail('PREVIEW_ASSET_INDEX_INVALID');}
  if(record?.schema!==schema||!Number.isSafeInteger(record.generated_at)||record.generated_at<1||record.generated_at>4102444800)fail('PREVIEW_ASSET_INDEX_INVALID');
  if(prior!==null&&prior!==record.generated_at)fail('PREVIEW_ASSET_INDEX_INVALID');prior=record.generated_at;
 }
 if(at!==undefined&&prior!==null&&at!==prior)fail('PREVIEW_ASSET_TIME_CONFLICT');
 const generated_at=prior??at??Math.floor(Date.now()/1000);
 privateFile(root,'source-generation.json',JSON.stringify({schema:'mls_owner_preview_source_v1',generated_at})+'\n');
 return generated_at;
}
export async function prepareOwnerPreviewAssets({directory,render=false,tools={},at,signal}={}){
 if(typeof directory!=='string'||typeof render!=='boolean')fail('PREVIEW_ASSET_OPTIONS_INVALID');
 const root=plainDirectory(directory,{create:true}),generated_at=readGeneration(root,at);
 const assetRoot=plainDirectory(path.join(root,'assets'),{create:true}),inputRoot=plainDirectory(path.join(root,'inputs'),{create:true});
 const outputRoot=plainDirectory(path.join(root,'output'),{create:true}),stage=mkdtempSync(path.join(os.tmpdir(),'mls-preview-originals-'));
 let fixtures;
 try{
  fixtures=writeSyntheticAiSalesFixtures(stage);
  for(const a of fixtures.assets){a.rights.observed_at=generated_at;privateFile(assetRoot,a.file_name,readLocalBounded(stage,a.file_name,8388608));}
 }finally{rmSync(stage,{recursive:true,force:true});}
 for(const product of fixtures.products)for(const row of product.observations)row.evidence.observed_at=generated_at;
 const files=[],inputs=[],renders=[],campaigns=[];
 const register=(id,filename,mime)=>{
  if(!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(id)||files.some(f=>f.id===id))fail('PREVIEW_ASSET_ID_INVALID');
  const relative_path=path.relative(root,filename).split(path.sep).join('/');
  if(relative_path.startsWith('../')||path.isAbsolute(relative_path))fail('PREVIEW_ASSET_PATH_INVALID');
  const parent=plainDirectory(path.dirname(filename)),bytes=readLocalBounded(parent,path.basename(filename),67108864);
  files.push({id,relative_path,mime,sha256:digest(bytes),size_bytes:bytes.length});return id;
 };
 const assetFileIds=new Map();
 for(const a of fixtures.assets)assetFileIds.set(a.asset_id,register(a.asset_id,path.join(assetRoot,a.file_name),a.mime));
 privateFile(inputRoot,'produtos-demonstracao.json',JSON.stringify(fixtures.products,null,2)+'\n');
 register('produtos-demonstracao',path.join(inputRoot,'produtos-demonstracao.json'),'application/json');
 for(const scenario of scenarios){
  if(signal?.aborted)fail('PREVIEW_ASSET_ABORTED');
  const products=[fixtures.products[scenario.product]],keys=new Set(products.map(p=>p.product_key));
  const assets=fixtures.assets.filter(a=>keys.has(a.product_key));
  const campaign=await planAiSalesCampaign({campaign_id:'preview-'+scenario.id,products,assets,template_id:scenario.template_id,
   channel:'SHOPEE_VIDEO',goal:'STORE_VIDEO',generated_at});
  if(campaign.status!=='READY_FOR_LOCAL_RENDER')fail('PREVIEW_CAMPAIGN_BLOCKED');
  campaigns.push(campaign);
  const input={schema:'mls_ai_sales_local_input_v1',campaign,products,assets,narration:{mode:'ESPEAK_NG',language:'pt-BR',voice:'pt-br',words_per_minute:155},budget:{max_provider_cost_cents:0,max_render_seconds:300}};
  const inputName=scenario.id+'.json';privateFile(inputRoot,inputName,JSON.stringify(input,null,2)+'\n');
  const manifest_file_id=register('entrada-'+scenario.id,path.join(inputRoot,inputName),'application/json');
  inputs.push({id:scenario.id,template_id:scenario.template_id,product_key:products[0].product_key,manifest_file_id,asset_file_ids:assets.map(a=>assetFileIds.get(a.asset_id))});
  if(!render)continue;
  const report=await renderLocalAiSales(input,{assetsDirectory:assetRoot,outputDirectory:outputRoot,render:true,tools,signal});
  if(report.status!=='READY_FOR_OWNER'||report.jobs.length!==1)fail('PREVIEW_RENDER_NOT_READY');
  const job=report.jobs[0];
  if(job.approval!=='PENDING'||job.commercial_writes!==false||job.qa.full_decode!==true||job.qa.width!==1080||job.qa.height!==1920)fail('PREVIEW_RENDER_QA_INVALID');
  const rendered={template_id:scenario.template_id,product_key:products[0].product_key,qa:job.qa,approval:'PENDING'};
  for(const [field,name,mime] of [['video_file_id','video.mp4','video/mp4'],['manifest_file_id','manifest.json','application/json'],
   ['thumbnail_file_id','thumbnail.jpg','image/jpeg'],['captions_file_id','captions.srt','application/x-subrip'],['script_file_id','script.txt','text/plain']]){
   rendered[field]=register(field.replace('_file_id','')+'-'+scenario.id,path.join(job.output_directory,name),mime);
  }
  renders.push(rendered);
 }
 files.sort((a,b)=>a.id.localeCompare(b.id));
 const index={schema:'mls_owner_preview_media_v1',source:'ORIGINAL_SYNTHETIC_FIXTURES',generated_at,commercial_writes:false,
  products:fixtures.products,assets:fixtures.assets,campaigns,inputs,renders,files};
 const indexFile=path.join(root,'demo-index.json');
 if(existsSync(indexFile)&&(!lstatSync(indexFile).isFile()||lstatSync(indexFile).isSymbolicLink()))fail('PREVIEW_ASSET_INDEX_INVALID');
 const temporary='preview-index-'+randomUUID()+'.json';
 try{writeFileSync(path.join(root,temporary),JSON.stringify(index,null,2)+'\n',{flag:'wx',mode:0o600});renameSync(path.join(root,temporary),indexFile);}
 finally{rmSync(path.join(root,temporary),{force:true});}
 return index;
}

export async function runOwnerPreviewAssets(argv,{stdout=value=>process.stdout.write(value+'\n'),stderr=value=>process.stderr.write(value+'\n'),signal}={}){
 const usage='Uso: node tools/mls_owner_preview_assets.mjs --directory pasta [--render-local --espeak executavel --espeak-data pasta --espeak-lib pasta]';
 if(argv.length===1&&argv[0]==='--help'){stdout(usage);return 0;}
 try{
  const values={},seen=new Set();let render=false;
  for(let i=0;i<argv.length;i++){
   const key=argv[i];if(seen.has(key))fail('PREVIEW_ASSET_ARGUMENT_INVALID');seen.add(key);
   if(key==='--render-local'){render=true;continue;}
   if(!['--directory','--espeak','--espeak-data','--espeak-lib'].includes(key)||!argv[i+1]||argv[i+1].startsWith('--'))fail('PREVIEW_ASSET_ARGUMENT_INVALID');
   values[key]=argv[++i];
  }
  if(!values['--directory'])fail('PREVIEW_ASSET_ARGUMENT_INVALID');
  const tools={ffmpeg:'ffmpeg',ffprobe:'ffprobe',espeak:values['--espeak']||'espeak-ng',
   ...(values['--espeak-data']?{espeakDataPath:values['--espeak-data']}:{}),...(values['--espeak-lib']?{espeakLibraryPath:values['--espeak-lib']}:{})};
  const index=await prepareOwnerPreviewAssets({directory:values['--directory'],render,tools,signal});
  stdout(JSON.stringify({schema:index.schema,source:index.source,products:index.products.length,files:index.files.length,renders:index.renders.length,commercial_writes:false}));return 0;
 }catch(error){stderr(typeof error?.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(error.code)?error.code:'PREVIEW_ASSET_PREPARATION_FAILED');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const controller=new AbortController();process.once('SIGINT',()=>controller.abort());process.once('SIGTERM',()=>controller.abort());
 process.exitCode=await runOwnerPreviewAssets(process.argv.slice(2),{signal:controller.signal});
}
