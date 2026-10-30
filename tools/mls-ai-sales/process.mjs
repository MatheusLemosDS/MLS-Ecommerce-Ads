import {spawn} from 'node:child_process';
import {statSync} from 'node:fs';
import {performance} from 'node:perf_hooks';

// Local media programs only. No shell, provider transport, or raw diagnostics
// escape this boundary (FFmpeg diagnostics may contain operator filenames).
export class AiSalesMediaError extends Error {
 constructor(code){super(code);this.name='AiSalesMediaError';this.code=code;}
}
export const mediaFail=code=>{throw new AiSalesMediaError(code);};

export function runLocalProcess(executable,args,{cwd,env,signal,timeoutMs=60000,maxOutputBytes=131072,watchFiles=[],maxFileBytes=67108864}={}){
 if(typeof executable!=='string'||!executable||/[\u0000-\u001f\u007f]/.test(executable)||
  !Array.isArray(args)||!args.every(arg=>typeof arg==='string'&&!arg.includes('\0'))||
  !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000||
  !Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1||maxOutputBytes>1048576)
  return Promise.reject(new AiSalesMediaError('PROCESS_CONFIGURATION_INVALID'));
 if(signal?.aborted)return Promise.reject(new AiSalesMediaError('PROCESS_ABORTED'));
 return new Promise((resolve,reject)=>{
  const started=performance.now();let child,stdout=[],bytes=0,settled=false,failure=null,killTimer=null,watcher=null;
  const stop=code=>{
   if(failure||settled)return;failure=code;
   child?.kill('SIGTERM');killTimer=setTimeout(()=>child?.kill('SIGKILL'),500);killTimer.unref?.();
  };
  const abort=()=>stop('PROCESS_ABORTED');
  const timer=setTimeout(()=>stop('PROCESS_TIMEOUT'),timeoutMs);timer.unref?.();
  const finish=(error,value)=>{
   if(settled)return;settled=true;clearTimeout(timer);clearTimeout(killTimer);clearInterval(watcher);
   signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);
  };
  try{child=spawn(executable,args,{cwd,env:env||process.env,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});}
  catch{finish(new AiSalesMediaError('TOOL_UNAVAILABLE'));return;}
  signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
  child.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxOutputBytes){stop('PROCESS_OUTPUT_LIMIT');return;}stdout.push(chunk);});
  // Count stderr to bound a corrupt input's diagnostic stream; never return it.
  child.stderr.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxOutputBytes)stop('PROCESS_OUTPUT_LIMIT');});
  child.on('error',()=>finish(new AiSalesMediaError(failure||'TOOL_UNAVAILABLE')));
  child.on('close',code=>{
   if(failure||code!==0){finish(new AiSalesMediaError(failure||'PROCESS_FAILED'));return;}
   finish(null,{stdout:Buffer.concat(stdout).toString('utf8'),elapsed_ms:Math.round(performance.now()-started)});
  });
  if(watchFiles.length)watcher=setInterval(()=>{
   try{for(const file of watchFiles)if(statSync(file).size>maxFileBytes){stop('OUTPUT_SIZE_LIMIT');break;}}
   catch(error){if(error?.code!=='ENOENT')stop('OUTPUT_INSPECTION_FAILED');}
  },100);
  watcher?.unref?.();
 });
}

export async function inspectMediaTools(tools={},options={}){
 const ffmpeg=tools.ffmpeg||'ffmpeg',ffprobe=tools.ffprobe||'ffprobe';
 const a=await runLocalProcess(ffmpeg,['-version'],{...options,timeoutMs:10000});
 const b=await runLocalProcess(ffprobe,['-version'],{...options,timeoutMs:10000});
 const ffmpegVersion=a.stdout.split('\n')[0],ffprobeVersion=b.stdout.split('\n')[0];
 if(!/^ffmpeg version [\w.:+~-]+ /.test(ffmpegVersion)||!/^ffprobe version [\w.:+~-]+ /.test(ffprobeVersion))mediaFail('MEDIA_TOOL_IDENTITY_INVALID');
 return {ffmpeg,ffprobe,ffmpeg_version:ffmpegVersion.slice(0,180),ffprobe_version:ffprobeVersion.slice(0,180)};
}
