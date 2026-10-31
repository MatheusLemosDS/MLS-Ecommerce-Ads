import {constants,openSync,closeSync,fstatSync,readSync,lstatSync,mkdirSync,realpathSync,writeFileSync,statfsSync,statSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {mediaFail,runLocalProcess} from './process.mjs';

export const hashBytes=bytes=>createHash('sha256').update(bytes).digest('hex');
export const safeMediaName=name=>typeof name==='string'&&name.length>4&&name.length<=160&&
 !name.startsWith('.')&&!/[\u0000-\u001f\u007f-\u009f/\\:]/.test(name)&&path.basename(name)===name;

// Reject links at every existing path component, including the chosen root.
export function plainDirectory(directory,{create=false}={}){
 if(typeof directory!=='string'||!directory||/[\u0000-\u001f\u007f]/.test(directory))mediaFail('LOCAL_DIRECTORY_INVALID');
 const resolved=path.resolve(directory);let current=path.parse(resolved).root;
 for(const part of resolved.slice(current.length).split(path.sep).filter(Boolean)){
  current=path.join(current,part);let info;
  try{info=lstatSync(current);}catch(error){
   if(error?.code!=='ENOENT'||!create)mediaFail('LOCAL_DIRECTORY_UNAVAILABLE');
   try{mkdirSync(current,{mode:0o700});info=lstatSync(current);}catch{mediaFail('LOCAL_DIRECTORY_UNAVAILABLE');}
  }
  if(info.isSymbolicLink()||!info.isDirectory())mediaFail('LOCAL_SYMLINK_OR_DIRECTORY_INVALID');
 }
 if(realpathSync(resolved)!==resolved)mediaFail('LOCAL_SYMLINK_OR_DIRECTORY_INVALID');
 return resolved;
}

export function readLocalBounded(root,name,maxBytes){
 if(!safeMediaName(name)||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>67108864)mediaFail('LOCAL_FILE_NAME_INVALID');
 const filename=path.join(root,name);let fd;
 try{
  const entry=lstatSync(filename);if(entry.isSymbolicLink()||!entry.isFile())mediaFail('LOCAL_SYMLINK_OR_FILE_INVALID');
  fd=openSync(filename,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  const info=fstatSync(fd);if(!info.isFile()||info.size<1||info.size>maxBytes)mediaFail('LOCAL_FILE_SIZE_INVALID');
  const chunks=[];let total=0;
  while(true){const chunk=Buffer.allocUnsafe(Math.min(65536,maxBytes+1-total)),count=readSync(fd,chunk,0,chunk.length,null);if(!count)break;total+=count;if(total>maxBytes)mediaFail('LOCAL_FILE_SIZE_INVALID');chunks.push(chunk.subarray(0,count));}
  const after=fstatSync(fd);if(after.size!==total||after.ino!==info.ino||after.dev!==info.dev||after.mtimeMs!==info.mtimeMs)mediaFail('LOCAL_FILE_CHANGED');
  return Buffer.concat(chunks,total);
 }catch(error){if(error?.code&&/^LOCAL_/.test(error.code))throw error;mediaFail('LOCAL_FILE_UNAVAILABLE');}
 finally{if(fd!==undefined)closeSync(fd);}
}

export function requireDisk(directory,bytes=134217728){
 try{const info=statfsSync(directory,{bigint:true});if(info.bavail*info.bsize<BigInt(bytes))mediaFail('OUTPUT_DISK_LIMIT');}
 catch(error){if(error?.code==='OUTPUT_DISK_LIMIT')throw error;mediaFail('OUTPUT_DISK_UNAVAILABLE');}
}

export function writePrivate(filename,data){writeFileSync(filename,data,{flag:'wx',mode:0o600});}
export function fileDigest(filename,maxBytes=67108864){
 const info=lstatSync(filename);if(info.isSymbolicLink()||!info.isFile()||info.size<1||info.size>maxBytes)mediaFail('OUTPUT_FILE_INVALID');
 return {sha256:hashBytes(readFileSync(filename)),size_bytes:info.size};
}

export async function probeLocalMedia(filename,tools,{cwd,signal,timeoutMs=15000}={}){
 const response=await runLocalProcess(tools.ffprobe||'ffprobe',[
  '-v','error','-protocol_whitelist','file,pipe','-show_entries',
  'format=format_name,duration,size:stream=codec_name,codec_type,width,height,pix_fmt,sample_rate,channels,sample_aspect_ratio,r_frame_rate,nb_frames',
  '-of','json',filename],{cwd,signal,timeoutMs});
 let frame;try{frame=JSON.parse(response.stdout);}catch{mediaFail('MEDIA_PROBE_INVALID');}
 if(!frame||!Array.isArray(frame.streams)||!frame.streams.length||frame.streams.length>4)mediaFail('MEDIA_PROBE_INVALID');
 return frame;
}

export async function copyVerifiedImage(root,descriptor,target,tools,options={}){
 const {filename,sha256,width,height,mime,size_bytes}=descriptor;
 if(!safeMediaName(filename)||!['image/png','image/jpeg'].includes(mime)||
  typeof sha256!=='string'||!/^[a-f0-9]{64}$/.test(sha256)||
  !Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<128||height<128||width*height>16777216||
  !Number.isSafeInteger(size_bytes)||size_bytes<1||size_bytes>16777216)mediaFail('IMAGE_DESCRIPTOR_INVALID');
 const bytes=readLocalBounded(root,filename,16777216);
 if(bytes.length!==size_bytes||hashBytes(bytes)!==sha256)mediaFail('ASSET_HASH_OR_SIZE_MISMATCH');
 const png=bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg=bytes.length>=11&&bytes[0]===255&&bytes[1]===216;
 if((mime==='image/png'&&!png)||(mime==='image/jpeg'&&!jpeg))mediaFail('IMAGE_SIGNATURE_INVALID');
 if(png){
  if(bytes.readUInt32BE(8)!==13||bytes.toString('ascii',12,16)!=='IHDR'||bytes.readUInt32BE(16)!==width||bytes.readUInt32BE(20)!==height)mediaFail('IMAGE_DIMENSIONS_MISMATCH');
  for(let p=8;p+12<=bytes.length;){const length=bytes.readUInt32BE(p),end=p+12+length;if(end>bytes.length)mediaFail('IMAGE_CONTAINER_INVALID');if(bytes.toString('ascii',p+4,p+8)==='acTL')mediaFail('ANIMATED_IMAGE_NOT_ALLOWED');p=end;}
 }
 writePrivate(target,bytes);
 const frame=await probeLocalMedia(target,tools,options),stream=frame.streams[0];
 if(frame.streams.length!==1||stream.codec_type!=='video'||stream.width!==width||stream.height!==height||
  stream.codec_name!==(mime==='image/png'?'png':'mjpeg'))mediaFail('IMAGE_DECODE_OR_DIMENSIONS_INVALID');
 await runLocalProcess(tools.ffmpeg||'ffmpeg',['-v','error','-nostdin','-threads','1','-noautorotate','-protocol_whitelist','file,pipe','-i',target,'-frames:v','1','-f','null','-'],{...options,timeoutMs:15000});
 return {filename:path.basename(target),source_sha256:sha256,width,height,mime};
}

export async function validateVideo(filename,tools,options={}){
 const probe=await probeLocalMedia(filename,tools,options),video=probe.streams.filter(row=>row.codec_type==='video'),audio=probe.streams.filter(row=>row.codec_type==='audio');
 const duration=Number(probe.format?.duration);
 if(video.length!==1||audio.length!==1||probe.streams.length!==2||video[0].codec_name!=='h264'||
  video[0].width!==1080||video[0].height!==1920||video[0].pix_fmt!=='yuv420p'||
  video[0].r_frame_rate!=='30/1'||video[0].sample_aspect_ratio!=='1:1'||audio[0].codec_name!=='aac'||
  Number(audio[0].sample_rate)!==48000||audio[0].channels!==1||!Number.isFinite(duration)||duration<14.95||duration>30.1||
  !String(probe.format?.format_name).split(',').includes('mp4'))mediaFail('VIDEO_QA_INVALID');
 const files=fileDigest(filename);
 await runLocalProcess(tools.ffmpeg||'ffmpeg',['-v','error','-nostdin','-threads','2','-protocol_whitelist','file,pipe','-i',filename,'-f','null','-'],{...options,timeoutMs:60000,maxOutputBytes:65536});
 return {status:'PASSED',width:1080,height:1920,duration_ms:Math.round(duration*1000),fps:30,video_codec:'h264',audio_codec:'aac',full_decode:true,...files};
}
