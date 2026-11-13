// No session, bearer, password or email token belongs in this adapter.
export function tenantBrowserNamespace(context){
 const valid=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
 if(context?.kind!=='account'||![context.userId,context.organizationId,context.storeId].every(valid))throw new Error('BROWSER_TENANT_CONTEXT_REQUIRED');
 return ['mls-v2',context.userId,context.organizationId,context.storeId].map(encodeURIComponent).join(':');
}
export function tenantArtworkDatabaseName(context){return 'brazacommerce-dtf-artworks-v2:'+tenantBrowserNamespace(context);}
export function createTenantDraftStorage(storage,context){
 const namespace=tenantBrowserNamespace(context)+':draft:';
 const key=value=>{if(typeof value!=='string'||!value||value.length>256)throw new Error('BROWSER_DRAFT_KEY_INVALID');return namespace+encodeURIComponent(value);};
 return Object.freeze({getItem:name=>storage.getItem(key(name)),setItem:(name,value)=>storage.setItem(key(name),value),removeItem:name=>storage.removeItem(key(name)),clear(){const keys=[];for(let i=0;i<storage.length;i++){const name=storage.key(i);if(name?.startsWith(namespace))keys.push(name);}for(const name of keys)storage.removeItem(name);}});
}
export function createTenantBrowserLifecycle({clear=()=>{},stop=()=>{},revokeObjectURL=url=>URL.revokeObjectURL(url)}={}){
 let generation=0,current=null;const controllers=new Set(),urls=new Set();
 const reset=()=>{generation++;for(const controller of controllers)controller.abort();controllers.clear();stop();for(const url of urls)revokeObjectURL(url);urls.clear();clear();current=null;};
 return Object.freeze({begin(context){const next=tenantBrowserNamespace(context);if(next!==current){reset();current=next;}return Object.freeze({namespace:current,generation});},isCurrent(ticket){return current!==null&&ticket?.namespace===current&&ticket?.generation===generation;},controller(){if(!current)throw new Error('BROWSER_TENANT_CONTEXT_REQUIRED');const controller=new AbortController();controllers.add(controller);return controller;},trackObjectURL(url){if(!current)throw new Error('BROWSER_TENANT_CONTEXT_REQUIRED');urls.add(url);return url;},stop:reset});
}
function openExisting(indexedDB,name){return new Promise((resolve,reject)=>{const request=indexedDB.open(name);let absent=false;request.onupgradeneeded=()=>{absent=true;request.transaction.abort();};request.onerror=()=>absent?resolve(null):reject(new Error('BROWSER_ARTWORK_STORAGE_UNAVAILABLE'));request.onsuccess=()=>resolve(request.result);});}
function readAll(db){return new Promise((resolve,reject)=>{const request=db.transaction('artworks','readonly').objectStore('artworks').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('BROWSER_ARTWORK_STORAGE_UNAVAILABLE'));});}
function openTarget(indexedDB,name){return new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('artworks'))request.result.createObjectStore('artworks',{keyPath:'art_key'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('BROWSER_ARTWORK_STORAGE_UNAVAILABLE'));});}
// Explicit copy only; originals remain available to the legacy operator.
// The server confirms eligibility and the existing DTF verifier checks every
// PNG/hash before any target write. Merely logging in never reads the old DB.
export async function copyLegacyArtworkLibrary({indexedDB,context,confirmed=false,authorizeLegacyImport,verifyArtwork}={}){
 if(confirmed!==true||typeof authorizeLegacyImport!=='function'||typeof verifyArtwork!=='function'||await authorizeLegacyImport(context)!==true)throw new Error('BROWSER_LEGACY_IMPORT_NOT_AUTHORIZED');
 const targetName=tenantArtworkDatabaseName(context),source=await openExisting(indexedDB,'brazacommerce-dtf-artworks-v1');if(!source)return {copied:0,sourcePreserved:true};
 let target;
 try{
  const rows=await readAll(source);for(const row of rows)if(await verifyArtwork(row)!==true)throw new Error('BROWSER_LEGACY_ARTWORK_INVALID');
  target=await openTarget(indexedDB,targetName);const existing=new Map((await readAll(target)).map(row=>[row.art_key,row]));
  for(const row of rows){const old=existing.get(row.art_key);if(old&&(old.sha256!==row.sha256||await verifyArtwork(old)!==true))throw new Error('BROWSER_LEGACY_ARTWORK_CONFLICT');}
  await new Promise((resolve,reject)=>{const tx=target.transaction('artworks','readwrite'),store=tx.objectStore('artworks');for(const row of rows)if(!existing.has(row.art_key))store.add(row);tx.oncomplete=resolve;tx.onerror=()=>reject(new Error('BROWSER_ARTWORK_STORAGE_UNAVAILABLE'));tx.onabort=tx.onerror;});
  return {copied:rows.filter(row=>!existing.has(row.art_key)).length,sourcePreserved:true};
 }finally{source.close();target?.close();}
}
