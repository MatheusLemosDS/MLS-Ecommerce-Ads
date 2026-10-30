#!/usr/bin/env node
// Local files only. Rendering is opt-in; this program has no publisher or HTTP client.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderLocalAiSales} from './mls-ai-sales/render.mjs';
import {plainDirectory,readLocalBounded,writePrivate} from './mls-ai-sales/media.mjs';

export async function runAiSalesCli(argv,{stdout=console.log,stderr=console.error,signal}={}){
 const usage='Uso: node tools/mls_ai_sales_cli.mjs --manifest arquivo.json --assets pasta [--render-local --out pasta-saida] [--espeak executavel --espeak-data pasta --espeak-lib pasta] [--report resultado.json]';
 try{
  if(argv.length===1&&argv[0]==='--help'){stdout(usage);return 0;}
  const values={},flags=new Set();
  for(let i=0;i<argv.length;i++){
   const key=argv[i];if(['--render-local','--dry-run'].includes(key)){if(flags.has(key))throw Error();flags.add(key);continue;}
   if(!['--manifest','--assets','--out','--ffmpeg','--ffprobe','--espeak','--espeak-data','--espeak-lib','--font','--report'].includes(key)||values[key]!==undefined||!argv[i+1]||argv[i+1].startsWith('--'))throw Error();values[key]=argv[++i];
  }
  if(!values['--manifest']||!values['--assets']||flags.has('--render-local')&&(!values['--out']||flags.has('--dry-run')))throw Error();
  const manifestPath=path.resolve(values['--manifest']),manifestRoot=plainDirectory(path.dirname(manifestPath));
  const manifest=JSON.parse(readLocalBounded(manifestRoot,path.basename(manifestPath),1048576).toString('utf8'));
  const tools={};for(const [arg,key] of [['--ffmpeg','ffmpeg'],['--ffprobe','ffprobe'],['--espeak','espeak'],['--espeak-data','espeakDataPath'],['--espeak-lib','espeakLibraryPath'],['--font','fontFile']])if(values[arg])tools[key]=values[arg];
  const report=await renderLocalAiSales(manifest,{assetsDirectory:values['--assets'],outputDirectory:values['--out'],render:flags.has('--render-local'),tools,signal});
  if(values['--report']){
   const target=path.resolve(values['--report']),root=plainDirectory(path.dirname(target),{create:true});
   if(!/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(path.basename(target)))throw Error();
   writePrivate(path.join(root,path.basename(target)),JSON.stringify(report,null,2)+'\n');
  }
  stdout(JSON.stringify({schema:report.schema,mode:report.mode,status:report.status,jobs:report.jobs.length,blocked_reasons:report.blocked_reasons,commercial_writes:false}));
  return report.status==='BLOCKED'?2:0;
 }catch(error){
  const code=typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{0,95}$/.test(error.code)?error.code:'LOCAL_INPUT_OR_RENDER_INVALID';
  stderr('MLS_AI_SALES_CLI_FAILED: '+code);return 1;
 }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const controller=new AbortController(),cancel=()=>controller.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 process.exitCode=await runAiSalesCli(process.argv.slice(2),{signal:controller.signal});
 process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);
}
