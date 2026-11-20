import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {buildSync} from 'esbuild';
import {error,sha256} from './worker_project.mjs';
import {MAX_WORKER_SOURCE_BYTES} from './import_worker_config.mjs';

// Existing source cap retained. The generated Workers are complete ESM modules;
// a second bundle adds helpers inside functions serialized into browser scripts.
export const COMPLETE_WORKER_SOURCE_MAX_BYTES=MAX_WORKER_SOURCE_BYTES;
export function validateCompleteWorkerModule(filename){
 let bytes,fd;
 try{
  const stat=fs.lstatSync(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||stat.size<1||stat.size>COMPLETE_WORKER_SOURCE_MAX_BYTES)throw error('WORKER_COMPLETE_MODULE_INVALID');
  fd=fs.openSync(filename,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const opened=fs.fstatSync(fd);
  if(opened.dev!==stat.dev||opened.ino!==stat.ino||opened.size!==stat.size)throw error('WORKER_COMPLETE_MODULE_INVALID');
  const buffer=Buffer.alloc(stat.size+1);let length=0;
  while(length<buffer.length){const n=fs.readSync(fd,buffer,length,buffer.length-length);if(!n)break;length+=n;}
  const after=fs.fstatSync(fd);
  if(length!==stat.size||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||after.ctimeMs!==opened.ctimeMs)throw error('WORKER_COMPLETE_MODULE_INVALID');
  bytes=buffer.subarray(0,length);
 }catch{throw error('WORKER_COMPLETE_MODULE_INVALID');}finally{if(fd!==undefined)fs.closeSync(fd);}
 let source,parsed;
 // AST substitutions detect free CommonJS globals, including aliases, without
 // rejecting the same words in quoted browser scripts or locally bound names.
 const marker='__MLS_CJS_UNBOUND_'+randomUUID().replaceAll('-','_');
 try{
  source=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  parsed=buildSync({stdin:{contents:source,sourcefile:path.basename(filename)},bundle:false,write:false,metafile:true,treeShaking:false,format:'esm',platform:'neutral',logLevel:'silent',define:{require:marker,module:marker,exports:marker},logOverride:{'unsupported-dynamic-import':'error','unsupported-require-call':'error','commonjs-variable-in-esm':'error'}});
 }catch{throw error('WORKER_COMPLETE_MODULE_INVALID');}
 const outputs=Object.values(parsed.metafile.outputs),out=outputs[0];
 if(outputs.length!==1||out.imports.length||!out.exports.includes('default')||parsed.outputFiles.some(file=>file.text.includes(marker)))throw error('WORKER_COMPLETE_MODULE_DEPENDENCY');
 return Object.freeze({bytes:bytes.length,sha256:sha256(bytes),exports:Object.freeze([...out.exports])});
}
