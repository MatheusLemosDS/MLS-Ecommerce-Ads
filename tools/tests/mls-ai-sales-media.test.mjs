import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync,readdirSync,symlinkSync,unlinkSync,existsSync,lstatSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {renderLocalAiSales,validateLocalAiSalesInput,makeSrt} from '../mls-ai-sales/render.mjs';
import {runLocalProcess} from '../mls-ai-sales/process.mjs';
import {plainDirectory,readLocalBounded} from '../mls-ai-sales/media.mjs';
import {runAiSalesCli} from '../mls_ai_sales_cli.mjs';
import {validateAiSalesVideoJob} from '../../web/cloudflare/src/mls-ai-sales-contracts.mjs';
import {planAiSalesCampaign} from '../../web/cloudflare/src/mls-ai-sales-campaign-planner.mjs';
import {writeSyntheticAiSalesFixtures,localFixtureInput,localFixtureTools} from './fixtures/mls-ai-sales-media-fixture.mjs';

const digest=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const setup=(options={})=>{const root=mkdtempSync(path.join(os.tmpdir(),'mls-ai-media-test-'));mkdirSync(root+'/assets');return {root,fixtures:writeSyntheticAiSalesFixtures(root+'/assets',options),assetsDirectory:root+'/assets',outputDirectory:root+'/output',tools:localFixtureTools()};};
async function resign(input){return {...input,campaign:await planAiSalesCampaign({campaign_id:input.campaign.campaign_id,products:input.products,assets:input.assets,template_id:input.campaign.template_id,channel:input.campaign.channel,goal:input.campaign.goal,generated_at:input.campaign.generated_at})};}

test('local process argv remains literal, bounded, and excludes stderr from results',async()=>{
 const literal='$(touch should-never-exist); `whoami` %{}';
 const result=await runLocalProcess(process.execPath,['-e','process.stdout.write(process.argv[1]);process.stderr.write("private diagnostic")',literal],{timeoutMs:1000});
 assert.equal(result.stdout,literal);assert.ok(!JSON.stringify(result).includes('private diagnostic'));
 await assert.rejects(runLocalProcess(process.execPath,['-e','process.stdout.write("x".repeat(10000))'],{maxOutputBytes:100,timeoutMs:1000}),{code:'PROCESS_OUTPUT_LIMIT'});
});

test('local media child processes stop on deadline and explicit abort',async()=>{
 await assert.rejects(runLocalProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:30}),{code:'PROCESS_TIMEOUT'});
 const controller=new AbortController(),pending=runLocalProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:controller.signal,timeoutMs:1000});controller.abort();
 await assert.rejects(pending,{code:'PROCESS_ABORTED'});
});

test('asset access rejects traversal, links, special files and growing/oversized inputs',()=>{
 const s=setup();try{
  assert.throws(()=>readLocalBounded(s.assetsDirectory,'../input.png',100),{code:'LOCAL_FILE_NAME_INVALID'});
  symlinkSync(s.assetsDirectory,s.root+'/linked');assert.throws(()=>plainDirectory(s.root+'/linked'),{code:'LOCAL_SYMLINK_OR_DIRECTORY_INVALID'});
  symlinkSync(path.join(s.assetsDirectory,s.fixtures.assets[0].file_name),s.assetsDirectory+'/linked.png');
  assert.throws(()=>readLocalBounded(s.assetsDirectory,'linked.png',10000),{code:'LOCAL_SYMLINK_OR_FILE_INVALID'});
  mkdirSync(s.assetsDirectory+'/directory.png');assert.throws(()=>readLocalBounded(s.assetsDirectory,'directory.png',10000),{code:'LOCAL_SYMLINK_OR_FILE_INVALID'});
  assert.throws(()=>readLocalBounded(s.assetsDirectory,s.fixtures.assets[0].file_name,4),{code:'LOCAL_FILE_SIZE_INVALID'});
 }finally{rmSync(s.root,{recursive:true,force:true});}
});

test('default dry-run fully decodes images and never generates MP4 or creates output directory',async()=>{
 const s=setup();try{
  const input=await localFixtureInput(s.fixtures),report=await renderLocalAiSales(input,s);
  assert.equal(report.mode,'DRY_RUN');assert.equal(report.status,'READY');assert.equal(report.jobs.length,1);
  assert.equal(report.jobs[0].state,'PLANNED');assert.equal(report.commercial_writes,false);assert.equal(existsSync(s.outputDirectory),false);
  assert.deepEqual(readdirSync(s.root),['assets']);
 }finally{rmSync(s.root,{recursive:true,force:true});}
});

test('ten products and three templates yield thirty distinct deterministic planned jobs',async()=>{
 const s=setup({count:10,allKits:true});try{
  const templates=['NOSTALGIA_80_90_2000','PRODUCT_DETAILS','COUPLE_KIT'],inputs=[];
  for(const [i,template] of templates.entries())inputs.push(await localFixtureInput(s.fixtures,{all:true,template,id:'batch-'+i}));
  const input={schema:'mls_ai_sales_batch_input_v1',campaigns:inputs.map(i=>i.campaign),products:s.fixtures.products,assets:s.fixtures.assets,narration:inputs[0].narration,budget:inputs[0].budget};
  const first=await validateLocalAiSalesInput(input),second=await validateLocalAiSalesInput(input);
  assert.equal(first.jobs.length,30);assert.equal(new Set(first.jobs.map(j=>j.idempotency_key)).size,30);
  assert.deepEqual(first.jobs.map(j=>j.idempotency_key),second.jobs.map(j=>j.idempotency_key));
  assert.ok(first.products.every(p=>p.price_cents===null&&p.cost_cents===null&&p.inventory_units===null));
  const duplicate={...input,campaigns:[input.campaigns[0],input.campaigns[0]]};
  await assert.rejects(validateLocalAiSalesInput(duplicate),{code:'DUPLICATE_RENDER_JOB'});
 }finally{rmSync(s.root,{recursive:true,force:true});}
});

test('local validation snapshots mutable settings and rejects array getters without invoking them',async()=>{
 const s=setup();try{
  const input=await localFixtureInput(s.fixtures),pending=validateLocalAiSalesInput(input);
  input.narration.words_per_minute=190;input.budget.max_render_seconds=0;
  const saved=await pending;assert.equal(saved.narration.words_per_minute,155);assert.equal(saved.budget.max_render_seconds,300);
  const bad=await localFixtureInput(s.fixtures);let invoked=0;
  Object.defineProperty(bad.products,'0',{enumerable:true,get(){invoked++;return s.fixtures.products[0];}});
  await assert.rejects(validateLocalAiSalesInput(bad),{code:'LOCAL_MANIFEST_INVALID'});assert.equal(invoked,0);
 }finally{rmSync(s.root,{recursive:true,force:true});}
});

test('missing narration, zero local budget and uncertain rights block before tools or files',async()=>{
 const s=setup();try{
  const base=await localFixtureInput(s.fixtures);
  for(const [changed,reason] of [[{...base,narration:{mode:'NONE'}},'NARRATION_REQUIRED'],[{...base,budget:{...base.budget,max_render_seconds:0}},'LOCAL_RENDER_BUDGET_EXHAUSTED']]){
   const report=await renderLocalAiSales(changed,{assetsDirectory:'/does-not-exist',render:true});assert.equal(report.status,'BLOCKED');assert.ok(report.blocked_reasons.includes(reason));
  }
  const unknown=clone(base);unknown.assets[0].rights={status:'UNKNOWN',reference:null,observed_at:null};const report=await renderLocalAiSales(await resign(unknown),{assetsDirectory:'/does-not-exist',render:true});assert.equal(report.status,'BLOCKED');assert.ok(report.blocked_reasons.includes('ASSET_RIGHTS_UNCONFIRMED'));
  assert.equal(existsSync(s.outputDirectory),false);
 }finally{rmSync(s.root,{recursive:true,force:true});}
});

test('kit without its second image cannot masquerade as full component coverage',async()=>{
 const s=setup();try{
  const input=await localFixtureInput(s.fixtures,{template:'COUPLE_KIT',productIndex:2});input.assets.pop();
  const report=await renderLocalAiSales(await resign(input),{assetsDirectory:'/does-not-exist',render:true});assert.equal(report.status,'BLOCKED');assert.ok(report.blocked_reasons.includes('ASSET_UNIT_COVERAGE_INCOMPLETE'));
 }finally{rmSync(s.root,{recursive:true,force:true});}
});

test('two angles of one kit component leave the other component blocked before I/O',async()=>{
 const s=setup();try{
  const input=clone(await localFixtureInput(s.fixtures,{template:'COUPLE_KIT',productIndex:2}));
  input.assets[1].component_coverage=clone(input.assets[0].component_coverage);
  const report=await renderLocalAiSales(await resign(input),{assetsDirectory:'/does-not-exist',render:true});
  assert.equal(report.status,'BLOCKED');assert.ok(report.blocked_reasons.includes('ASSET_UNIT_COVERAGE_INCOMPLETE'));
  assert.equal(existsSync(s.outputDirectory),false);
 }finally{rmSync(s.root,{recursive:true,force:true});}
});

test('actual render deadline cancels media work and clears staging and lease',{timeout:15000},async()=>{
 const s=setup();try{
  const input=await localFixtureInput(s.fixtures);input.budget.max_render_seconds=1;
  await assert.rejects(renderLocalAiSales(input,{...s,render:true}),{code:'LOCAL_RENDER_BUDGET_EXHAUSTED'});
  assert.equal(existsSync(path.join(s.outputDirectory,'.mls-ai-sales-render.lock')),false);
  assert.ok(!readdirSync(s.outputDirectory).some(name=>name.startsWith('.mls-pending-')||name.startsWith('mls-video-')));
 }finally{rmSync(s.root,{recursive:true,force:true});}
});

test('tampered campaign text and altered original bytes cannot render or reuse a job',async()=>{
 const s=setup();try{
  const input=await localFixtureInput(s.fixtures),changed=clone(input);changed.campaign.scripts[0].lines[0]='Últimas unidades com desconto inventado';
  await assert.rejects(renderLocalAiSales(changed,s),{code:'CAMPAIGN_INPUT_MISMATCH'});
  writeFileSync(path.join(s.assetsDirectory,input.assets[0].file_name),'unrelated bytes');
  await assert.rejects(renderLocalAiSales(input,s),{code:'ASSET_HASH_OR_SIZE_MISMATCH'});
  assert.equal(existsSync(s.outputDirectory),false);
 }finally{rmSync(s.root,{recursive:true,force:true});}
});

test('a valid-looking PNG header with corrupt pixels fails complete image validation',async()=>{
 const s=setup();try{
  const input=clone(await localFixtureInput(s.fixtures)),filename=path.join(s.assetsDirectory,input.assets[0].file_name),broken=readFileSync(filename).subarray(0,48);
  writeFileSync(filename,broken);input.assets[0].sha256=digest(broken);input.assets[0].size_bytes=broken.length;
  await assert.rejects(renderLocalAiSales(await resign(input),s),error=>['IMAGE_CONTAINER_INVALID','PROCESS_FAILED','MEDIA_PROBE_INVALID'].includes(error.code));
  assert.equal(existsSync(s.outputDirectory),false);
 }finally{rmSync(s.root,{recursive:true,force:true});}
});

test('CLI is dry-run by default, rejects publication flags, and prints only safe codes',async()=>{
 const s=setup();try{
  const input=await localFixtureInput(s.fixtures);writeFileSync(s.root+'/input.json',JSON.stringify(input));const out=[],err=[];
  const args=['--manifest',s.root+'/input.json','--assets',s.assetsDirectory,'--espeak',s.tools.espeak];
  if(s.tools.espeakDataPath)args.push('--espeak-data',s.tools.espeakDataPath);if(s.tools.espeakLibraryPath)args.push('--espeak-lib',s.tools.espeakLibraryPath);
  assert.equal(await runAiSalesCli(args,{stdout:s=>out.push(s),stderr:s=>err.push(s)}),0);
  assert.equal(JSON.parse(out[0]).mode,'DRY_RUN');assert.equal(JSON.parse(out[0]).commercial_writes,false);
  assert.equal(await runAiSalesCli([...args,'--publish'],{stdout:s=>out.push(s),stderr:s=>err.push(s)}),1);
  assert.ok(err[0].startsWith('MLS_AI_SALES_CLI_FAILED: '));assert.ok(!err[0].includes(s.root));assert.equal(existsSync(s.outputDirectory),false);
 }finally{rmSync(s.root,{recursive:true,force:true});}
});

test('SRT uses measured caption boundaries and preserves literal untrusted text',()=>{
 const srt=makeSrt([{text:'Detalhes %{sem expansão} e <sem HTML>',start_ms:0,end_ms:1234}]);
 assert.ok(srt.startsWith('1\n00:00:00,000 --> 00:00:01,234\n'));assert.ok(srt.includes('%{sem expansão}'));assert.ok(srt.includes('<sem HTML>'));
});

async function averagePatch(video,out,tools,x,y){
 await runLocalProcess(tools.ffmpeg,['-v','error','-nostdin','-ss','1','-i',video,'-vf','crop=16:16:'+x+':'+y+',format=rgb24','-frames:v','1','-threads','1','-f','rawvideo',out],{timeoutMs:15000});
 const bytes=readFileSync(out),channels=[0,0,0];for(let i=0;i<bytes.length;i++)channels[i%3]+=bytes[i];return channels.map(v=>v/(bytes.length/3));
}

test('three real templates render PT-BR MP4s, preserve asymmetry, validate, export and reuse atomically',{timeout:360000},async()=>{
 const s=setup(),artifact=process.env.MLS_AI_SALES_ARTIFACTS_DIR;
 const output=artifact?plainDirectory(artifact,{create:true}):s.outputDirectory,results=[];
 try{
  for(const [index,template] of ['NOSTALGIA_80_90_2000','PRODUCT_DETAILS','COUPLE_KIT'].entries()){
   const input=await localFixtureInput(s.fixtures,{template,productIndex:index,id:'proof-'+index});
   const before=input.assets.map(a=>digest(readFileSync(path.join(s.assetsDirectory,a.file_name))));
   const report=await renderLocalAiSales(input,{...s,outputDirectory:output,render:true});assert.equal(report.status,'READY_FOR_OWNER');const job=report.jobs[0];
   assert.equal(job.state,'READY_FOR_OWNER');assert.equal(job.reused,false);assert.equal(job.approval,'PENDING');assert.equal(job.commercial_writes,false);
   assert.equal(validateAiSalesVideoJob(job.job).state,'READY_FOR_OWNER');assert.equal(job.job.output_hash,job.qa.sha256);
   assert.equal(job.qa.full_decode,true);assert.equal(job.qa.width,1080);assert.equal(job.qa.height,1920);assert.equal(job.qa.fps,30);assert.ok(job.qa.duration_ms>=15000&&job.qa.duration_ms<=30100);
   assert.equal(job.narration.language,'pt-BR');assert.equal(job.narration.source,'ESPEAK_NG_OFFLINE_PT_BR');assert.equal(job.costs.provider_cost_cents,0);assert.equal(job.costs.local_compute_cost_cents,null);
   assert.deepEqual(readdirSync(job.output_directory).sort(),['captions.srt','manifest.json','script.txt','thumbnail.jpg','video.mp4']);
   assert.deepEqual(before,input.assets.map(a=>digest(readFileSync(path.join(s.assetsDirectory,a.file_name)))));
   for(const file of job.files)assert.equal(digest(readFileSync(path.join(job.output_directory,file.name))),file.sha256);
   assert.ok(readFileSync(path.join(job.output_directory,'captions.srt'),'utf8').includes('-->'));
   if(index===0){
    const video=path.join(job.output_directory,'video.mp4'),green=await averagePatch(video,s.root+'/green.rgb',s.tools,466,870),red=await averagePatch(video,s.root+'/red.rgb',s.tools,548,890),edge=await averagePatch(video,s.root+'/edge.rgb',s.tools,64,454);
    assert.ok(green[1]>green[0]+100&&green[1]>green[2]+100,'original left green stripe remains in the proportional location');
    assert.ok(red[0]>red[1]+100&&red[0]>red[2]+100,'original right red arrow remains in the proportional location');
    assert.ok(edge.every(v=>v>210),'the full source edge survives contain without a cover crop');
    const rerun=await renderLocalAiSales(input,{...s,outputDirectory:output,render:true});assert.equal(rerun.jobs[0].reused,true);assert.equal(rerun.jobs[0].qa.sha256,job.qa.sha256);
    const manifestFile=path.join(job.output_directory,'manifest.json'),savedManifest=readFileSync(manifestFile,'utf8'),editedManifest=JSON.parse(savedManifest);
    editedManifest.approval='APPROVED';writeFileSync(manifestFile,JSON.stringify(editedManifest));
    await assert.rejects(renderLocalAiSales(input,{...s,outputDirectory:output,render:true}),{code:'EXISTING_OUTPUT_INVALID'});
    writeFileSync(manifestFile,savedManifest);
    writeFileSync(path.join(s.assetsDirectory,input.assets[0].file_name),'changed after approved QA');
    await assert.rejects(renderLocalAiSales(input,{...s,outputDirectory:output,render:true}),{code:'ASSET_HASH_OR_SIZE_MISMATCH'});
   }
   results.push({template_id:template,video_sha256:job.qa.sha256,duration_ms:job.qa.duration_ms,size_bytes:job.qa.size_bytes,output_directory:path.basename(job.output_directory),provider_cost_cents:0,local_compute_cost_cents:null});
  }
  assert.equal(existsSync(path.join(output,'.mls-ai-sales-render.lock')),false);assert.ok(!readdirSync(output).some(n=>n.startsWith('.mls-pending-')));
  if(artifact)writeFileSync(path.join(output,'evidence.json'),JSON.stringify({schema:'mls_ai_sales_media_test_evidence_v1',fixture:'ORIGINAL_SYNTHETIC_TEST_SHIRTS_NOT_MERCHANT_DATA',full_decode:true,templates:results,commercial_writes:false},null,2)+'\n');
 }finally{rmSync(s.root,{recursive:true,force:true});}
});
