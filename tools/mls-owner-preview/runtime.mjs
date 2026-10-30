import {build} from 'esbuild';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';

// The trusted repository Worker is isolated from network and Node process APIs.
// This is an offline development adapter, not a replacement for Cloudflare.
export async function createPreviewRuntime(workerPath){
 const source=readFileSync(workerPath),workerHash=createHash('sha256').update(source).digest('hex');
 const bundled=await build({entryPoints:[workerPath],bundle:true,write:false,format:'iife',globalName:'PreviewWorker',platform:'browser',target:'es2022',logLevel:'silent'});
 const timers=new Set();let outboundAttempts=0;
 const context=vm.createContext({HostRequest:Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,AbortController,AbortSignal,ReadableStream,TransformStream,WritableStream,Blob,FormData,File,crypto:webcrypto,btoa,atob,
  console:Object.freeze({log(){},warn(){},error(){}}),
  fetch:async()=>{outboundAttempts++;throw Object.assign(Error('PREVIEW_OUTBOUND_DISABLED'),{code:'PREVIEW_OUTBOUND_DISABLED'});},
  setTimeout(callback,delay,...args){const timer=setTimeout(()=>{timers.delete(timer);callback(...args);},delay);timers.add(timer);return timer;},
  clearTimeout(timer){timers.delete(timer);clearTimeout(timer);},
  setInterval(callback,delay,...args){const timer=setInterval(callback,delay,...args);timers.add(timer);return timer;},clearInterval(timer){timers.delete(timer);clearInterval(timer);}
 },{name:'MLS_OFFLINE_OWNER_PREVIEW',codeGeneration:{strings:false,wasm:false}});
 vm.runInContext('class Request extends HostRequest{async json(){return JSON.parse(await this.text());}};globalThis.Request=Request;',context);
 vm.runInContext(bundled.outputFiles[0].text,context,{timeout:10000});
 const worker=vm.runInContext('PreviewWorker.default',context),RequestClass=vm.runInContext('Request',context);
 const bridgeD1=db=>{context.__previewHostD1=db;try{return vm.runInContext(`(()=>{const host=__previewHostD1,raw=new WeakMap(),copy=value=>JSON.parse(JSON.stringify(value));return {prepare(sql){let statement=host.prepare(sql);const wrapped={bind(...values){statement=statement.bind(...values);raw.set(wrapped,statement);return wrapped;},async run(){return copy(await statement.run());},async first(){return copy(await statement.first());},async all(){return copy(await statement.all());}};raw.set(wrapped,statement);return wrapped;},async batch(statements){return copy(await host.batch(statements.map(statement=>raw.get(statement))));}};})()`,context);}finally{delete context.__previewHostD1;}};
 return {workerHash,bridgeD1,request:(url,options)=>new RequestClass(url,options),fetch:(request,env)=>worker.fetch(request,env,{waitUntil(){}}),get outboundAttempts(){return outboundAttempts;},close(){for(const timer of timers){clearTimeout(timer);clearInterval(timer);}timers.clear();}};
}
