import {MLS_BROWSER_ASSET_MANIFEST} from './browser-assets-manifest.mjs';

const ids=new Set(['bank','month','orders','production','weekly','workspace']);
const assetRows=()=>MLS_BROWSER_ASSET_MANIFEST.assets;
const valid=row=>row&&ids.has(row.id)&&/^[a-f0-9]{64}$/.test(row.sha256)&&row.path==='/assets/mls/'+row.sha256+'.js'&&Number.isSafeInteger(row.bytes)&&row.bytes>0&&row.bytes<=(['month','workspace'].includes(row.id)?1048576:262144)&&/^sha256-[A-Za-z0-9+/]{43}=$/.test(row.integrity);

export function browserAssetScript(id){
 const row=assetRows().find(row=>row.id===id);
 if(!valid(row))throw Error('BROWSER_ASSET_MANIFEST_INVALID');
 return '<script src="'+row.path+'" integrity="'+row.integrity+'" crossorigin="anonymous"></script>';
}

/** Register before the last parser-blocking workspace script; a failed asset never starts controllers. */
export function browserWorkspaceFailureScript(){
 const row=assetRows().find(row=>row.id==='workspace');
 if(!valid(row))throw Error('BROWSER_ASSET_MANIFEST_INVALID');
 return 'document.addEventListener("error",function(event){const target=event.target;if(target?.tagName!=="SCRIPT")return;let url;try{url=new URL(target.src,location.href);}catch{return;}if(url.origin!==location.origin||url.pathname!=='+JSON.stringify(row.path)+'||url.search)return;const status=document.getElementById("message"),retry=document.getElementById("startupRetry");if(status){status.textContent="Não foi possível carregar o painel. Recarregue a página para tentar novamente.";status.setAttribute("role","alert");status.style.color="var(--negative,#b42318)";}if(retry){retry.hidden=false;retry.disabled=false;retry.textContent="Recarregar a página";retry.onclick=function(){location.reload();};}},true);';
}

/** Only public, build-inventoried code can cross the ASSETS binding. */
export async function serveMlsBrowserAsset(request,env,{deadlineMs=10000}={}){
 const url=new URL(request.url);
 if(!url.pathname.startsWith('/assets/mls/'))return null;
 const error=(code,status,extra={})=>new Response(JSON.stringify({error:code}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
 const row=[...assetRows(),...MLS_BROWSER_ASSET_MANIFEST.retained].find(row=>row.path===url.pathname);
 if(url.search||!valid(row))return error('BROWSER_ASSET_NOT_FOUND',404);
 if(!['GET','HEAD'].includes(request.method))return error('BROWSER_ASSET_METHOD_NOT_ALLOWED',405,{allow:'GET, HEAD'});
 if(typeof env?.ASSETS?.fetch!=='function')return error('BROWSER_ASSET_BINDING_UNAVAILABLE',503);
 const timeout=Number.isSafeInteger(deadlineMs)&&deadlineMs>0&&deadlineMs<=10000?deadlineMs:10000,controller=new AbortController(),expires=Date.now()+timeout;
 let response,reader,timer,expired=false;
 const cancel=body=>{try{const result=body?.cancel();if(result?.catch)void result.catch(()=>{});}catch{}};
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;controller.abort();cancel(reader||response?.body);reject(Error('BROWSER_ASSET_TIMEOUT'));},timeout);});
 const bounded=value=>Promise.race([value,deadline]);
 try{
  const fetching=Promise.resolve().then(()=>env.ASSETS.fetch(new Request(url.origin+row.path,{method:'GET',headers:{'accept-encoding':'identity'},signal:controller.signal})));
  void fetching.then(value=>{if(expired)cancel(value?.body);},()=>{});
  response=await bounded(fetching);
  if(expired)throw Error('BROWSER_ASSET_TIMEOUT');
  if(response?.status!==200||!response.body)return error('BROWSER_ASSET_UNAVAILABLE',503);
  const length=response.headers.get('content-length');
  if(length!==null&&length!==String(row.bytes))return error('BROWSER_ASSET_BYTES_MISMATCH',503);
  reader=response.body.getReader();const chunks=[];let count=0,emptyChunks=0;
  while(true){
   if(Date.now()>=expires)throw Error('BROWSER_ASSET_TIMEOUT');
   const part=await bounded(reader.read());if(expired)throw Error('BROWSER_ASSET_TIMEOUT');if(part.done)break;
   if(!(part.value instanceof Uint8Array)||part.value.byteLength===0&&++emptyChunks>64)return error('BROWSER_ASSET_BYTES_MISMATCH',503);
   if(part.value.byteLength)emptyChunks=0;
   count+=part.value.byteLength;if(count>row.bytes)return error('BROWSER_ASSET_BYTES_MISMATCH',503);chunks.push(part.value);
  }
  if(count!==row.bytes)return error('BROWSER_ASSET_BYTES_MISMATCH',503);
  const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const digest=[...new Uint8Array(await bounded(crypto.subtle.digest('SHA-256',bytes)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  if(digest!==row.sha256)return error('BROWSER_ASSET_BYTES_MISMATCH',503);
  return new Response(request.method==='HEAD'?null:bytes,{status:200,headers:{'content-type':'text/javascript; charset=utf-8','content-length':String(row.bytes),'cache-control':'public, max-age=31536000, immutable','x-content-type-options':'nosniff',etag:'"sha256-'+row.sha256+'"'}});
 }catch(cause){return error(cause?.message==='BROWSER_ASSET_TIMEOUT'?'BROWSER_ASSET_TIMEOUT':'BROWSER_ASSET_UNAVAILABLE',503);}
 finally{clearTimeout(timer);controller.abort();cancel(reader||response?.body);try{reader?.releaseLock();}catch{}}
}
