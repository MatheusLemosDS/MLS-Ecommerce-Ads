import {mkdtempSync,rmSync,renameSync,lstatSync,readFileSync,openSync,closeSync,unlinkSync,writeFileSync,existsSync,copyFileSync,chmodSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {validateAiSalesProductSnapshot,validateAiSalesAsset,validateAiSalesCampaignPlan,validateAiSalesVideoJob,canonicalAiSalesJson} from '../../web/cloudflare/src/mls-ai-sales-contracts.mjs';
import {planAiSalesCampaign,createAiSalesVideoJob} from '../../web/cloudflare/src/mls-ai-sales-campaign-planner.mjs';
import {AiSalesMediaError,mediaFail,runLocalProcess,inspectMediaTools} from './process.mjs';
import {hashBytes,plainDirectory,readLocalBounded,requireDisk,writePrivate,fileDigest,copyVerifiedImage,probeLocalMedia,validateVideo,safeMediaName} from './media.mjs';

const exact=(v,keys)=>v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
const list=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&d.enumerable&&Object.hasOwn(d,'value'));
const integer=(v,min,max)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const text=v=>typeof v==='string'&&v.length>0&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const POLICY='MLS_LOCAL_VIDEO_CONTAIN_PTBR_V1';
const FILES=['video.mp4','thumbnail.jpg','captions.srt','script.txt'];
const fontDefault='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

function narrationValid(narration){
 if(exact(narration,['mode'])&&narration.mode==='NONE')return true;
 if(exact(narration,['mode','language','voice','words_per_minute'])&&narration.mode==='ESPEAK_NG'&&narration.language==='pt-BR'&&narration.voice==='pt-br'&&integer(narration.words_per_minute,120,190))return true;
 if(!exact(narration,['mode','language','clips'])||narration.mode!=='LOCAL_WAV'||narration.language!=='pt-BR'||!list(narration.clips,30))return false;
 const keys=new Set();return narration.clips.every(row=>{
  if(!exact(row,['product_key','file_name','sha256','rights_reference','segments'])||!text(row.product_key)||keys.has(row.product_key)||!safeMediaName(row.file_name)||!row.file_name.toLowerCase().endsWith('.wav')||!hash(row.sha256)||!text(row.rights_reference)||row.rights_reference.length>160||!list(row.segments,30)||!row.segments.length)return false;
  keys.add(row.product_key);let end=0;return row.segments.every(segment=>{
   if(!exact(segment,['text','start_ms','end_ms'])||!text(segment.text)||Array.from(segment.text).length>108||!integer(segment.start_ms,0,30000)||!integer(segment.end_ms,1,30000)||segment.end_ms<=segment.start_ms||segment.start_ms<end)return false;end=segment.end_ms;return true;
  });
 });
}

export async function validateLocalAiSalesInput(input){
 const batch=Object.getOwnPropertyDescriptor(input||{},'schema')?.value==='mls_ai_sales_batch_input_v1',campaignKey=batch?'campaigns':'campaign';
 if(!exact(input,['schema',campaignKey,'products','assets','narration','budget'])||!['mls_ai_sales_local_input_v1','mls_ai_sales_batch_input_v1'].includes(input.schema)||
  !list(input.products,10)||input.products.length<1||!list(input.assets,100)||
  !narrationValid(input.narration)||!exact(input.budget,['max_provider_cost_cents','max_render_seconds'])||
  !integer(input.budget.max_provider_cost_cents,0,1000000)||!integer(input.budget.max_render_seconds,0,3600))mediaFail('LOCAL_MANIFEST_INVALID');
 const products=input.products.map(validateAiSalesProductSnapshot),assets=input.assets.map(validateAiSalesAsset);
 const narration=JSON.parse(JSON.stringify(input.narration)),budget={...input.budget};
 const campaigns=(batch?input.campaigns:[input.campaign]);
 if(!list(campaigns,3)||campaigns.length<1||new Set(products.map(p=>p.product_key)).size!==products.length||new Set(assets.map(a=>a.asset_id)).size!==assets.length)mediaFail('LOCAL_MANIFEST_INVALID');
 const jobs=[],seen=new Set(),validated=[];
 for(const campaign of campaigns.map(validateAiSalesCampaignPlan)){
  const planned=await planAiSalesCampaign({campaign_id:campaign.campaign_id,products,assets,template_id:campaign.template_id,channel:campaign.channel,goal:campaign.goal,generated_at:campaign.generated_at});
  if(canonicalAiSalesJson(planned)!==canonicalAiSalesJson(campaign))mediaFail('CAMPAIGN_INPUT_MISMATCH');
  validated.push(campaign);
  for(const product_key of campaign.product_refs){
   const unique=product_key+'\n'+campaign.template_id;if(seen.has(unique))mediaFail('DUPLICATE_RENDER_JOB');seen.add(unique);
   const product=products.find(p=>p.product_key===product_key),script=campaign.scripts.find(s=>s.product_key===product_key);
   const selected=assets.filter(a=>campaign.asset_refs.includes(a.asset_id)&&a.product_key===product_key&&['MOCKUP_ORIGINAL','PRODUCT_PHOTO'].includes(a.role));
   const idempotency_key=hashBytes(canonicalAiSalesJson({policy:POLICY,campaign,product,assets:selected,narration}));
   jobs.push({campaign,product,script,assets:selected,idempotency_key});
  }
 }
 if(jobs.length>30)mediaFail('LOCAL_JOB_LIMIT');
 return {products,assets,campaigns:validated,narration,budget,jobs};
}

function splitCaption(value,max=108){
 const words=value.replace(/\s+/g,' ').trim().split(' '),chunks=[];let current='';
 for(const word of words){
  if(Array.from(word).length>max)mediaFail('SCRIPT_LAYOUT_LIMIT');
  const next=current?current+' '+word:word;if(Array.from(next).length>max){chunks.push(current);current=word;}else current=next;
 }
 if(current)chunks.push(current);return chunks;
}
function wrap(value,width=27){
 const words=value.split(/\s+/),lines=[];let line='';
 for(const word of words){const chars=Array.from(word);if(chars.length>width){if(line){lines.push(line);line='';}while(chars.length>width)lines.push(chars.splice(0,width).join(''));line=chars.join('');continue;}
  if(Array.from(line+(line?' ':'')+word).length>width){lines.push(line);line=word;}else line+=(line?' ':'')+word;
 }
 if(line)lines.push(line);return lines.join('\n');
}
const stamp=ms=>{const value=Math.round(ms);return [Math.floor(value/3600000),Math.floor(value/60000)%60,Math.floor(value/1000)%60].map(v=>String(v).padStart(2,'0')).join(':')+','+String(value%1000).padStart(3,'0');};
export const makeSrt=segments=>segments.map((row,i)=>(i+1)+'\n'+stamp(row.start_ms)+' --> '+stamp(row.end_ms)+'\n'+wrap(row.text)+'\n').join('\n');

function claimOutput(root,seconds){
 const lock=path.join(root,'.mls-ai-sales-render.lock'),token=randomUUID();
 try{
  if(existsSync(lock)){
   const info=lstatSync(lock);if(info.isSymbolicLink()||!info.isFile()||info.size>2048)mediaFail('RENDERER_LOCK_INVALID');
   let prior;try{prior=JSON.parse(readFileSync(lock,'utf8'));}catch{mediaFail('RENDERER_LOCK_INVALID');}
   if(!exact(prior,['pid','token','expires_at'])||!integer(prior.pid,1,2147483647)||!text(prior.token)||!integer(prior.expires_at,1,9999999999999))mediaFail('RENDERER_LOCK_INVALID');
   let alive=true;try{process.kill(prior.pid,0);}catch(error){alive=error?.code!=='ESRCH';}
   if(alive||prior.expires_at>Date.now())mediaFail('RENDERER_BUSY');
   unlinkSync(lock);
  }
  const fd=openSync(lock,'wx',0o600);try{writeFileSync(fd,JSON.stringify({pid:process.pid,token,expires_at:Date.now()+seconds*1000+60000}));}finally{closeSync(fd);}
 }catch(error){if(error instanceof AiSalesMediaError)throw error;mediaFail('RENDERER_BUSY');}
 return ()=>{try{const value=JSON.parse(readFileSync(lock,'utf8'));if(value.token===token)unlinkSync(lock);}catch{}};
}

async function narrationFor(job,input,root,stage,tools,signal){
 const lines=job.script?.lines?.flatMap(line=>splitCaption(line));
 if(!lines?.length||lines.length>30)mediaFail('SCRIPT_UNAVAILABLE');
 if(input.narration.mode==='LOCAL_WAV'){
  const clip=input.narration.clips.find(row=>row.product_key===job.product.product_key);
  if(!clip||clip.segments.map(r=>r.text).join(' ')!==lines.join(' '))mediaFail('NARRATION_SCRIPT_MISMATCH');
  const bytes=readLocalBounded(root,clip.file_name,16777216);
  if(hashBytes(bytes)!==clip.sha256||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')mediaFail('NARRATION_HASH_OR_CONTAINER_INVALID');
  writePrivate(path.join(stage,'narration.wav'),bytes);
  const frame=await probeLocalMedia('narration.wav',tools,{cwd:stage,signal});
  const duration=Number(frame.format?.duration),audio=frame.streams[0];
  if(frame.streams.length!==1||audio.codec_type!=='audio'||!['pcm_s16le','pcm_s24le','pcm_f32le'].includes(audio.codec_name)||!Number.isFinite(duration)||duration<1||duration>30||clip.segments.at(-1).end_ms>duration*1000+1)mediaFail('NARRATION_QA_INVALID');
  await runLocalProcess(tools.ffmpeg,['-v','error','-nostdin','-i','narration.wav','-f','null','-'],{cwd:stage,signal,timeoutMs:15000});
  return {segments:clip.segments.map(r=>({...r})),duration_ms:Math.ceil(duration*1000),source:'OPERATOR_LICENSED_PT_BR_WAV',source_sha256:clip.sha256,rights_reference:clip.rights_reference};
 }
 if(input.narration.mode!=='ESPEAK_NG'||!tools.espeak)mediaFail('NARRATION_REQUIRED');
 const env={...process.env};if(tools.espeakLibraryPath)env.LD_LIBRARY_PATH=tools.espeakLibraryPath;
 const prefix=tools.espeakDataPath?['--path='+tools.espeakDataPath]:[];
 const voice=await runLocalProcess(tools.espeak,[...prefix,'--voices=pt'],{env,cwd:stage,signal,timeoutMs:10000});
 if(!/pt-br\s+--\/M\s+Portuguese_\(Brazil\)\s+roa\/pt-BR/.test(voice.stdout))mediaFail('PT_BR_VOICE_UNAVAILABLE');
 const segments=[];let elapsed=0;
 for(let i=0;i<lines.length;i++){
  const textName='voice-'+i+'.txt',audioName='voice-'+i+'.wav';writePrivate(path.join(stage,textName),lines[i]);
  await runLocalProcess(tools.espeak,[...prefix,'-v','pt-br','-s',String(input.narration.words_per_minute),'-a','100','-w',audioName,'-f',textName],{env,cwd:stage,signal,timeoutMs:10000,watchFiles:[path.join(stage,audioName)],maxFileBytes:4194304});
  const frame=await probeLocalMedia(audioName,tools,{cwd:stage,signal}),duration=Number(frame.format?.duration);
  if(frame.streams.length!==1||frame.streams[0].codec_name!=='pcm_s16le'||!Number.isFinite(duration)||duration<=0||duration>30)mediaFail('NARRATION_QA_INVALID');
  const ms=Math.ceil(duration*1000);segments.push({text:lines[i],start_ms:elapsed,end_ms:elapsed+ms});elapsed+=ms;
  if(elapsed>30000)mediaFail('NARRATION_DURATION_LIMIT');
 }
 writePrivate(path.join(stage,'narration-concat.txt'),segments.map((_,i)=>"file 'voice-"+i+".wav'").join('\n')+'\n');
 await runLocalProcess(tools.ffmpeg,['-v','error','-nostdin','-f','concat','-safe','1','-protocol_whitelist','file,pipe','-i','narration-concat.txt','-ar','48000','-ac','1','-c:a','pcm_s16le','narration.wav'],{cwd:stage,signal,timeoutMs:15000});
 return {segments,duration_ms:elapsed,source:'ESPEAK_NG_OFFLINE_PT_BR',source_sha256:fileDigest(path.join(stage,'narration.wav')).sha256,rights_reference:'EXTERNAL_ESPEAK_NG_GPL3_PLUS_SYNTHETIC_VOICE'};
}

async function inspectVoice(tools,signal){
 const env={...process.env};if(tools.espeakLibraryPath)env.LD_LIBRARY_PATH=tools.espeakLibraryPath;
 const prefix=tools.espeakDataPath?['--path='+tools.espeakDataPath]:[];
 const version=await runLocalProcess(tools.espeak,[...prefix,'--version'],{env,signal,timeoutMs:10000});
 if(!/eSpeak NG text-to-speech: [0-9.]+/.test(version.stdout))mediaFail('NARRATION_TOOL_IDENTITY_INVALID');
 const voices=await runLocalProcess(tools.espeak,[...prefix,'--voices=pt'],{env,signal,timeoutMs:10000});
 if(!/pt-br\s+--\/M\s+Portuguese_\(Brazil\)\s+roa\/pt-BR/.test(voices.stdout))mediaFail('PT_BR_VOICE_UNAVAILABLE');
}

function filterFor(job,images,segments,duration,stage){
 const colors={NOSTALGIA_80_90_2000:'0xe3a4ef',PRODUCT_DETAILS:'0x9fe2b7',COUPLE_KIT:'0xf4b0c6'};
 const accent=colors[job.campaign.template_id];if(!accent)mediaFail('TEMPLATE_UNAVAILABLE');
 const pieces=images.length,filters=[];let current='0:v';
 for(let i=0;i<pieces;i++){
  const grid=pieces>1,columns=grid?2:1,rows=pieces>2?2:1;
  const cellW=grid?460:960,cellH=Math.floor(1020/rows),x=grid?60+(i%columns)*500:60,y=420+Math.floor(i/columns)*cellH;
  filters.push('['+(i+1)+':v]scale=w='+cellW+':h='+cellH+':force_original_aspect_ratio=decrease:flags=lanczos,setsar=1,format=rgba[p'+i+']');
  filters.push('['+current+'][p'+i+']overlay=x='+x+'+('+cellW+'-w)/2:y='+y+'+('+cellH+'-h)/2:shortest=1[v'+i+']');current='v'+i;
 }
 const draw=(filename,fontsize,y,extra='')=>'drawtext=fontfile=font.ttf:textfile='+filename+':expansion=none:fontcolor=white:fontsize='+fontsize+':line_spacing=12:x=(w-text_w)/2:y='+y+extra;
 writePrivate(path.join(stage,'brand.txt'),'MLS Commerce OS · Prévia de produto');
 const titleLines=wrap(job.script.title,24).split('\n');if(titleLines.length>3)titleLines.splice(2,titleLines.length-2,titleLines[2].replace(/.$/u,'')+'…');
 writePrivate(path.join(stage,'title.txt'),titleLines.join('\n'));
 writePrivate(path.join(stage,'disclosure.txt'),'Rascunho · Voz sintetizada ou áudio autorizado\nConsulte os detalhes no anúncio original');
 const effects=['drawbox=x=60:y=350:w=960:h=4:color='+accent+':t=fill',draw('brand.txt',27,80),draw('title.txt',42,155,":alpha='min(1,t/0.35)'"),draw('disclosure.txt',24,1800)];
 for(let i=0;i<segments.length;i++){
  const row=segments[i],start=(row.start_ms/1000).toFixed(3),end=(Math.min(duration*1000,row.end_ms)/1000).toFixed(3);
  writePrivate(path.join(stage,'caption-'+i+'.txt'),wrap(row.text));
  effects.push(draw('caption-'+i+'.txt',36,1510,":enable='between(t,"+start+','+end+")':alpha='min(1,max(0,(t-"+start+')/0.18))\''));
 }
 effects.push('format=yuv420p');filters.push('['+current+']'+effects.join(',')+'[outv]');return filters.join(';');
}

function renderSourceAssets(job){
 return job.assets.map(asset=>({asset_id:asset.asset_id,sha256:asset.sha256,
  manifest_hash:job.campaign.asset_inputs.find(input=>input.asset_id===asset.asset_id).manifest_hash,
  component_coverage:asset.component_coverage.map(row=>({...row})),preserve_geometry:true,role:asset.role}));
}

async function renderOne(job,input,root,outputRoot,tools,signal,recordTools){
 const folder='mls-video-'+job.idempotency_key.slice(0,24),destination=path.join(outputRoot,folder);
 const domainJob=await createAiSalesVideoJob(job.campaign,job.product.product_key,{job_id:'local-'+job.idempotency_key.slice(0,32),assets:input.assets});
 if(!job.assets.length||job.assets.length>4)mediaFail('PRODUCT_MEDIA_LAYOUT_LIMIT');
 // A saved output is reusable only against the reattached original bytes.
 for(const asset of job.assets){
  if(asset.rights.status!=='AUTHORIZED'||!asset.rights.reference||asset.preserve_geometry!==true)mediaFail('ASSET_RIGHTS_UNVERIFIED');
  const bytes=readLocalBounded(root,asset.file_name,16777216);
  if(bytes.length!==asset.size_bytes||hashBytes(bytes)!==asset.sha256)mediaFail('ASSET_HASH_OR_SIZE_MISMATCH');
 }
 if(existsSync(destination)){
  plainDirectory(destination);let saved;try{saved=JSON.parse(readLocalBounded(destination,'manifest.json',1048576).toString('utf8'));}catch{mediaFail('EXISTING_OUTPUT_INVALID');}
  if(saved.schema!=='mls_ai_sales_render_result_v1'||saved.idempotency_key!==job.idempotency_key||saved.render_policy!==POLICY||saved.state!=='READY_FOR_OWNER'||
   saved.campaign_id!==job.campaign.campaign_id||saved.product_key!==job.product.product_key||saved.template_id!==job.campaign.template_id||
   saved.approval!=='PENDING'||saved.commercial_writes!==false||saved.script_source!=='LOCAL_TEMPLATE'||saved.ai_disclosure_required!==true||
   canonicalAiSalesJson(saved.source_assets)!==canonicalAiSalesJson(renderSourceAssets(job))||!Array.isArray(saved.files)||saved.files.length!==FILES.length||
   new Set(saved.files.map(file=>file.name)).size!==FILES.length)mediaFail('EXISTING_OUTPUT_INVALID');
  for(const name of FILES){const row=saved.files.find(f=>f.name===name),actual=fileDigest(path.join(destination,name));if(!row||row.sha256!==actual.sha256||row.size_bytes!==actual.size_bytes)mediaFail('EXISTING_OUTPUT_INVALID');}
  const qa=await validateVideo(path.join(destination,'video.mp4'),tools,{signal});
  let savedJob;try{savedJob=validateAiSalesVideoJob(saved.job);}catch{mediaFail('EXISTING_OUTPUT_INVALID');}
  if(canonicalAiSalesJson(saved.qa)!==canonicalAiSalesJson(qa)||
   canonicalAiSalesJson(savedJob)!==canonicalAiSalesJson({...domainJob,state:'READY_FOR_OWNER',output_hash:qa.sha256,path_local:folder+'/video.mp4'})||
   readLocalBounded(destination,'script.txt',65536).toString('utf8')!==job.script.title+'\n\n'+job.script.lines.join('\n')+'\n')mediaFail('EXISTING_OUTPUT_INVALID');
  return {...saved,reused:true,output_directory:destination};
 }
 requireDisk(outputRoot);const stage=mkdtempSync(path.join(outputRoot,'.mls-pending-'));chmodSync(stage,0o700);const started=performance.now();
 try{
  const images=[];
  for(let i=0;i<job.assets.length;i++){
   const asset=job.assets[i];if(asset.rights.status!=='AUTHORIZED'||!asset.rights.reference||asset.preserve_geometry!==true)mediaFail('ASSET_RIGHTS_UNVERIFIED');
   const target='asset-'+i+(asset.mime==='image/png'?'.png':'.jpg');
   images.push(await copyVerifiedImage(root,{filename:asset.file_name,...asset},path.join(stage,target),tools,{cwd:stage,signal}));
  }
  const sourceFont=tools.fontFile||fontDefault;const fontRoot=plainDirectory(path.dirname(sourceFont));const fontBytes=readLocalBounded(fontRoot,path.basename(sourceFont),4194304);writePrivate(path.join(stage,'font.ttf'),fontBytes);
  const narration=await narrationFor(job,input,root,stage,tools,signal),duration=Math.max(15,Math.ceil(narration.duration_ms/1000));
  if(duration>30)mediaFail('VIDEO_DURATION_LIMIT');
  writePrivate(path.join(stage,'captions.srt'),makeSrt(narration.segments));
  writePrivate(path.join(stage,'script.txt'),job.script.title+'\n\n'+job.script.lines.join('\n')+'\n');
  const args=['-v','error','-nostdin','-filter_complex_threads','1','-f','lavfi','-i','color=c=0x10192b:s=1080x1920:r=30:d='+duration];
  for(const image of images)args.push('-loop','1','-framerate','30','-noautorotate','-protocol_whitelist','file,pipe','-i',image.filename);
  args.push('-protocol_whitelist','file,pipe','-i','narration.wav','-filter_complex',filterFor(job,images,narration.segments,duration,stage),'-map','[outv]','-map',String(images.length+1)+':a:0','-map_metadata','-1','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-r','30','-video_track_timescale','30000','-c:a','aac','-b:a','128k','-ar','48000','-ac','1','-af','apad','-t',String(duration),'-movflags','+faststart','-threads','2','-fs','67108864','video.mp4');
  await runLocalProcess(tools.ffmpeg,args,{cwd:stage,signal,timeoutMs:180000,watchFiles:[path.join(stage,'video.mp4')],maxFileBytes:67108864});
  const qa=await validateVideo(path.join(stage,'video.mp4'),tools,{cwd:stage,signal});
  await runLocalProcess(tools.ffmpeg,['-v','error','-nostdin','-ss','1','-i','video.mp4','-frames:v','1','-vf','scale=360:640','-threads','1','thumbnail.jpg'],{cwd:stage,signal,timeoutMs:15000});
  const files=FILES.map(name=>({name,...fileDigest(path.join(stage,name))}));
  const result={schema:'mls_ai_sales_render_result_v1',state:'READY_FOR_OWNER',render_policy:POLICY,idempotency_key:job.idempotency_key,campaign_id:job.campaign.campaign_id,product_key:job.product.product_key,template_id:job.campaign.template_id,job:{...domainJob,state:'READY_FOR_OWNER',output_hash:qa.sha256,path_local:folder+'/video.mp4'},source_assets:renderSourceAssets(job),narration:{source:narration.source,language:'pt-BR',source_sha256:narration.source_sha256,rights_reference:narration.rights_reference},script_source:'LOCAL_TEMPLATE',ai_disclosure_required:true,qa,files,costs:{provider_cost_cents:0,currency:'BRL',local_compute_cost_cents:null,elapsed_ms:Math.round(performance.now()-started)},tools:recordTools,approval:'PENDING',commercial_writes:false};
  writePrivate(path.join(stage,'manifest.json'),JSON.stringify(result,null,2)+'\n');
  // Only reviewed deliverables cross the atomic publication boundary.
  for(const name of ['font.ttf','brand.txt','title.txt','disclosure.txt','narration.wav','narration-concat.txt',...images.map(i=>i.filename),...narration.segments.flatMap((_,i)=>['voice-'+i+'.txt','voice-'+i+'.wav','caption-'+i+'.txt'])])try{unlinkSync(path.join(stage,name));}catch(error){if(error?.code!=='ENOENT')throw error;}
  renameSync(stage,destination);return {...result,reused:false,output_directory:destination};
 }catch(error){
  const code=error instanceof AiSalesMediaError?error.code:'LOCAL_RENDER_FAILED';
  try{writePrivate(path.join(outputRoot,'failed-'+job.idempotency_key.slice(0,24)+'.json'),JSON.stringify({schema:'mls_ai_sales_render_failure_v1',idempotency_key:job.idempotency_key,state:'FAILED',error_code:code,commercial_writes:false})+'\n');}catch{}
  throw error;
 }finally{rmSync(stage,{recursive:true,force:true});}
}

export async function renderLocalAiSales(manifest,{assetsDirectory,outputDirectory,render=false,tools={},signal}={}){
 const input=await validateLocalAiSalesInput(manifest),blocked=[...new Set(input.campaigns.flatMap(c=>c.blocked_reasons))];
 if(input.narration.mode==='NONE')blocked.push('NARRATION_REQUIRED');
 if(input.narration.mode==='ESPEAK_NG'&&!tools.espeak)blocked.push('NARRATION_TOOL_UNAVAILABLE');
 if(input.budget.max_render_seconds===0)blocked.push('LOCAL_RENDER_BUDGET_EXHAUSTED');
 if(blocked.length)return {schema:'mls_ai_sales_local_report_v1',mode:render?'RENDER_LOCAL':'DRY_RUN',status:'BLOCKED',blocked_reasons:[...new Set(blocked)],jobs:[],commercial_writes:false};
 const root=plainDirectory(assetsDirectory),recordTools=await inspectMediaTools(tools,{signal}),actualTools={...tools,ffmpeg:recordTools.ffmpeg,ffprobe:recordTools.ffprobe};
 if(input.narration.mode==='ESPEAK_NG')await inspectVoice(actualTools,signal);
 if(!render){
  const stage=mkdtempSync(path.join(os.tmpdir(),'mls-ai-sales-check-'));chmodSync(stage,0o700);
  try{
   const seen=new Set();for(const job of input.jobs){
    if(!job.assets.length||job.assets.length>4)mediaFail('PRODUCT_MEDIA_LAYOUT_LIMIT');
    for(const asset of job.assets){if(seen.has(asset.asset_id))continue;seen.add(asset.asset_id);await copyVerifiedImage(root,{filename:asset.file_name,...asset},path.join(stage,'check-'+seen.size+(asset.mime==='image/png'?'.png':'.jpg')),actualTools,{cwd:stage,signal});}
    if(input.narration.mode==='LOCAL_WAV'){
     const audioStage=mkdtempSync(path.join(stage,'audio-'));await narrationFor(job,input,root,audioStage,actualTools,signal);
    }
   }
   return {schema:'mls_ai_sales_local_report_v1',mode:'DRY_RUN',status:'READY',blocked_reasons:[],jobs:input.jobs.map(job=>({product_key:job.product.product_key,template_id:job.campaign.template_id,idempotency_key:job.idempotency_key,state:'PLANNED'})),tools:recordTools,commercial_writes:false};
  }finally{rmSync(stage,{recursive:true,force:true});}
 }
 const output=plainDirectory(outputDirectory,{create:true}),relative=path.relative(root,output),reverse=path.relative(output,root);
 if(!relative||!relative.startsWith('..'+path.sep)&&relative!=='..'||!reverse||!reverse.startsWith('..'+path.sep)&&reverse!=='..')mediaFail('ASSET_OUTPUT_DIRECTORIES_OVERLAP');
 const release=claimOutput(output,input.budget.max_render_seconds),controller=new AbortController(),forward=()=>controller.abort(signal?.reason),timer=setTimeout(()=>controller.abort('LOCAL_RENDER_BUDGET_EXHAUSTED'),input.budget.max_render_seconds*1000);timer.unref?.();signal?.addEventListener('abort',forward,{once:true});if(signal?.aborted)forward();
 const results=[];
 try{
  for(const job of input.jobs){if(controller.signal.aborted)mediaFail(signal?.aborted?'PROCESS_ABORTED':'LOCAL_RENDER_BUDGET_EXHAUSTED');results.push(await renderOne(job,input,root,output,actualTools,controller.signal,recordTools));}
  return {schema:'mls_ai_sales_local_report_v1',mode:'RENDER_LOCAL',status:'READY_FOR_OWNER',blocked_reasons:[],jobs:results,commercial_writes:false};
 }catch(error){if(controller.signal.aborted&&!signal?.aborted)mediaFail('LOCAL_RENDER_BUDGET_EXHAUSTED');throw error;}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',forward);release();}
}
