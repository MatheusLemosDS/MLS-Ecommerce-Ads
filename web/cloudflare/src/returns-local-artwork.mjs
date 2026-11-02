// Browser-only reader. It neither initializes the DTF workflow nor creates a
// local library. Keep the factory self-contained for the client helper freeze.
export function createReturnLocalArtworkLoader(options={}){
 const idb=options.indexedDBImpl??globalThis.indexedDB,crypt=options.cryptoImpl??globalThis.crypto,urlApi=options.URLImpl??globalThis.URL;
 const decode=options.createImageBitmapImpl??globalThis.createImageBitmap,BlobType=options.BlobImpl??globalThis.Blob;
 const schedule=options.setTimeoutImpl??globalThis.setTimeout,unschedule=options.clearTimeoutImpl??globalThis.clearTimeout;
 const timeout=Number.isInteger(options.timeoutMs)&&options.timeoutMs>=1&&options.timeoutMs<=30000?options.timeoutMs:5000;
 const operations=new Set(),releases=new Set();let disposed=false;
 const noop=()=>{},hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 const data=(value,key)=>Object.getOwnPropertyDescriptor(value,key)?.value;
 const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const dimensions=(width,height)=>Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=32767&&height<=32767&&width*height<=50000000;
 const keyValid=value=>typeof value==='string'&&value===value.normalize('NFC').toLowerCase().trim()&&/^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,127}$/u.test(value)&&!value.endsWith('.')&&!value.endsWith('.png')&&!value.includes('..');
 const failure=(state,reason)=>({state,basis:null,url:null,width:null,height:null,sha256:null,reason,cleanup:noop});
 const close=value=>{try{value?.close?.();}catch{}};
 async function load(descriptor,{signal}={}){
  if(disposed)return failure('NOT_AVAILABLE','DISPOSED');
  if(!record(descriptor)||!keyValid(data(descriptor,'art_key'))||!(data(descriptor,'sha256')===null||hash(data(descriptor,'sha256'))))return failure('INVALID','DESCRIPTOR_INVALID');
  if(signal?.aborted)return failure('NOT_AVAILABLE','CANCELLED');
  if(!idb?.open||!crypt?.subtle?.digest||typeof decode!=='function'||!BlobType?.prototype||!urlApi?.createObjectURL||!urlApi?.revokeObjectURL||typeof schedule!=='function'||typeof unschedule!=='function')return failure('NOT_AVAILABLE','BROWSER_CAPABILITY_UNAVAILABLE');
  const artKey=data(descriptor,'art_key'),expectedHash=data(descriptor,'sha256');
  let db=null,transaction=null,interruption=null,stopResolve,timer=null,release=null,keepSignal=false;
  const stopped=new Promise(resolve=>{stopResolve=resolve;});
  const shutdown=()=>{try{transaction?.abort();}catch{}transaction=null;close(db);db=null;};
  const stop=reason=>{if(interruption)return;interruption=reason;shutdown();release?.();stopResolve({stopped:true});};
  const operation={stop};operations.add(operation);
  const onAbort=()=>stop('CANCELLED');
  const check=()=>{if(interruption)throw {localArtworkStop:interruption};};
  const wait=async(promise,lateCleanup=noop)=>{
   const pending=Promise.resolve(promise).then(value=>{if(interruption){lateCleanup(value);return {stopped:true};}return {value};},error=>({error}));
   const result=await Promise.race([pending,stopped]);check();if(Object.hasOwn(result,'error'))throw result.error;return result.value;
  };
  try{
   signal?.addEventListener?.('abort',onAbort,{once:true});
   if(signal?.aborted)stop('CANCELLED');check();
   timer=schedule(()=>stop('TIMEOUT'),timeout);
   if(typeof idb.databases==='function'){
    const databases=await wait(idb.databases());
    if(!Array.isArray(databases)||!databases.some(row=>row?.name==='brazacommerce-dtf-artworks-v1'))return failure('NOT_AVAILABLE','LIBRARY_NOT_FOUND');
   }
   const opened=await wait(new Promise((resolve,reject)=>{
    let request,refused=false;try{request=idb.open('brazacommerce-dtf-artworks-v1');}catch{reject({localArtworkReason:'STORAGE_UNAVAILABLE'});return;}
    request.onupgradeneeded=()=>{refused=true;try{request.transaction?.abort();}catch{}reject({localArtworkReason:'LIBRARY_NOT_FOUND'});};
    request.onerror=event=>{refused=true;event?.preventDefault?.();reject({localArtworkReason:'STORAGE_UNAVAILABLE'});};
    request.onblocked=()=>{refused=true;reject({localArtworkReason:'STORAGE_UNAVAILABLE'});};
    request.onsuccess=()=>{const connection=request.result;if(interruption||refused){close(connection);return;}resolve(connection);};
   }),close);db=opened;check();
   if(!db?.objectStoreNames?.contains?.('artworks'))return failure('NOT_AVAILABLE','LIBRARY_NOT_FOUND');
   db.onversionchange=()=>stop('STORAGE_CHANGED');
   const row=await wait(new Promise((resolve,reject)=>{
    let request,value,received=false;
    try{transaction=db.transaction('artworks','readonly');request=transaction.objectStore('artworks').get(artKey);}catch{reject({localArtworkReason:'STORAGE_UNAVAILABLE'});return;}
    request.onsuccess=()=>{value=request.result;received=true;};
    request.onerror=()=>reject({localArtworkReason:'STORAGE_UNAVAILABLE'});
    transaction.oncomplete=()=>{transaction=null;received?resolve(value):reject({localArtworkReason:'STORAGE_UNAVAILABLE'});};
    transaction.onabort=transaction.onerror=()=>reject({localArtworkReason:'STORAGE_UNAVAILABLE'});
   }));close(db);db=null;check();
   if(row===undefined)return failure('NOT_AVAILABLE','ARTWORK_NOT_FOUND');
   if(!record(row))return failure('INVALID','LOCAL_METADATA_INVALID');
   if(data(row,'art_key')!==artKey)return failure('MISMATCH','ARTWORK_KEY_MISMATCH');
   const storedHash=data(row,'sha256'),width=data(row,'pixel_width'),height=data(row,'pixel_height'),blob=data(row,'blob');
   if(!hash(storedHash)||!dimensions(width,height))return failure('INVALID','LOCAL_METADATA_INVALID');
   if(expectedHash!==null&&storedHash!==expectedHash)return failure('MISMATCH','ARTWORK_HASH_MISMATCH');
   let size,type,buffer;
   try{
    size=Object.getOwnPropertyDescriptor(BlobType.prototype,'size').get.call(blob);
    type=Object.getOwnPropertyDescriptor(BlobType.prototype,'type').get.call(blob);
    if(type!=='image/png'||size<33||size>33554432)return failure('INVALID','PNG_INVALID');
    buffer=await wait(BlobType.prototype.arrayBuffer.call(blob));
   }catch(error){check();return failure('INVALID','PNG_INVALID');}
   const bytes=new Uint8Array(buffer);check();
   if(bytes.length!==size||bytes.slice(0,8).join(',')!=='137,80,78,71,13,10,26,10')return failure('INVALID','PNG_INVALID');
   const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
   if(view.getUint32(8)!==13||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')return failure('INVALID','PNG_INVALID');
   const pngWidth=view.getUint32(16),pngHeight=view.getUint32(20);
   if(!dimensions(pngWidth,pngHeight))return failure('INVALID','PNG_DIMENSIONS_INVALID');
   if(pngWidth!==width||pngHeight!==height)return failure('MISMATCH','ARTWORK_DIMENSIONS_MISMATCH');
   const actualHash=Array.from(new Uint8Array(await wait(crypt.subtle.digest('SHA-256',bytes))),value=>value.toString(16).padStart(2,'0')).join('');
   if(actualHash!==storedHash||(expectedHash!==null&&actualHash!==expectedHash))return failure('MISMATCH','ARTWORK_HASH_MISMATCH');
   let bitmap=null;
   try{bitmap=await wait(decode(blob),close);check();if(!bitmap||bitmap.width!==width||bitmap.height!==height)return failure('MISMATCH','ARTWORK_DIMENSIONS_MISMATCH');}
   catch(error){check();return failure('INVALID','PNG_DECODE_FAILED');}
   finally{close(bitmap);}
   check();const url=urlApi.createObjectURL(blob);let released=false;
   release=()=>{if(released)return;released=true;try{urlApi.revokeObjectURL(url);}catch{}releases.delete(release);signal?.removeEventListener?.('abort',onAbort);};
   releases.add(release);check();if(typeof url!=='string'||!url.startsWith('blob:')){release();return failure('INVALID','LOCAL_URL_INVALID');}keepSignal=true;
   return {state:'AVAILABLE',basis:expectedHash===null?'CURRENT_LOCAL_REFERENCE':'VERIFIED_HISTORICAL',url,width,height,sha256:actualHash,reason:null,cleanup:release};
  }catch(error){release?.();return failure('NOT_AVAILABLE',interruption||error?.localArtworkReason||'STORAGE_UNAVAILABLE');}
  finally{if(timer!==null)unschedule(timer);shutdown();operations.delete(operation);if(!keepSignal)signal?.removeEventListener?.('abort',onAbort);}
 }
 function dispose(){if(disposed)return;disposed=true;for(const operation of [...operations])operation.stop('DISPOSED');for(const release of [...releases])release();}
 return {load,dispose};
}
