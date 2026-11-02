import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import vm from 'node:vm';
import {createReturnLocalArtworkLoader} from '../src/returns-local-artwork.mjs';

function png(width=1,height=1){
 const crc=bytes=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return (value^0xffffffff)>>>0;};
 const chunk=(name,data)=>{const kind=Buffer.from(name),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);kind.copy(result,4);data.copy(result,8);result.writeUInt32BE(crc(Buffer.concat([kind,data])),result.length-4);return result;};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))]);
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function artwork(bytes=png(),overrides={}){return {art_key:'arte teste',sha256:sha(bytes),pixel_width:1,pixel_height:1,blob:new Blob([bytes],{type:'image/png'}),...overrides};}
function fixture({row=artwork(),exists=true,enumerate=true,opening='success',pendingRead=false,pendingOpen=false,decodeImpl=null}={}){
 const calls={opens:0,gets:[],transactions:[],closes:0,aborts:0,upgradeAborts:0,urls:[],revoked:[],bitmapsClosed:0,decode:0,timers:0,cleared:0};
 let openRequest,getRequest,tx,timer;
 const db={objectStoreNames:{contains:name=>name==='artworks'},close(){calls.closes++;},transaction(name,mode){
  calls.transactions.push({name,mode});assert.equal(name,'artworks');assert.equal(mode,'readonly');
  tx={abort(){calls.aborts++;tx.onabort?.();},objectStore(store){assert.equal(store,'artworks');return {get(key){calls.gets.push(key);getRequest={};if(!pendingRead)queueMicrotask(()=>{getRequest.result=row;getRequest.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());});return getRequest;},getAll(){throw Error('BROAD_READ_FORBIDDEN');},put(){throw Error('WRITE_FORBIDDEN');}};}};return tx;
 }};
 const idb={open(name,...versions){calls.opens++;assert.equal(name,'brazacommerce-dtf-artworks-v1');assert.equal(versions.length,0);openRequest={result:db,transaction:{abort(){calls.upgradeAborts++;}}};if(!pendingOpen)queueMicrotask(()=>{if(opening==='upgrade')openRequest.onupgradeneeded?.();else if(opening==='blocked')openRequest.onblocked?.();else openRequest.onsuccess?.();});return openRequest;}};
 if(enumerate)idb.databases=async()=>exists?[{name:'brazacommerce-dtf-artworks-v1',version:1}]:[];
 const options={indexedDBImpl:idb,cryptoImpl:webcrypto,BlobImpl:Blob,URLImpl:{createObjectURL(blob){assert.ok(blob instanceof Blob);const url='blob:verified-'+calls.urls.length;calls.urls.push(url);return url;},revokeObjectURL(url){calls.revoked.push(url);}},createImageBitmapImpl:decodeImpl|| (async()=>{calls.decode++;return {width:1,height:1,close(){calls.bitmapsClosed++;}};}),setTimeoutImpl(fn){calls.timers++;timer=fn;return 1;},clearTimeoutImpl(){calls.cleared++;},timeoutMs:100};
 return {calls,options,db,idb,openSuccess(){openRequest.onsuccess?.();},completeRead(...values){getRequest.result=values.length?values[0]:row;getRequest.onsuccess?.();tx.oncomplete?.();},timeout(){timer();}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('reads only the exact key and verifies native PNG bytes, SHA and decoded dimensions before a URL',async()=>{
 const f=fixture(),loader=createReturnLocalArtworkLoader(f.options),row=artwork();
 const result=await loader.load({art_key:row.art_key,sha256:row.sha256});
 assert.equal(result.state,'AVAILABLE');assert.equal(result.basis,'VERIFIED_HISTORICAL');assert.equal(result.sha256,row.sha256);assert.equal(result.width,1);assert.equal(result.height,1);
 assert.deepEqual(f.calls.gets,['arte teste']);assert.deepEqual(f.calls.transactions,[{name:'artworks',mode:'readonly'}]);assert.equal(f.calls.closes,1);assert.equal(f.calls.bitmapsClosed,1);assert.equal(f.calls.urls.length,1);
 result.cleanup();result.cleanup();loader.dispose();assert.deepEqual(f.calls.revoked,f.calls.urls);
});
test('unknown historical SHA labels a verified current local reference',async()=>{
 const f=fixture(),loader=createReturnLocalArtworkLoader(f.options),result=await loader.load({art_key:'arte teste',sha256:null});
 assert.equal(result.state,'AVAILABLE');assert.equal(result.basis,'CURRENT_LOCAL_REFERENCE');assert.match(result.sha256,/^[a-f0-9]{64}$/);loader.dispose();assert.equal(f.calls.revoked.length,1);
});
test('missing library enumeration never opens or creates a database',async()=>{
 const f=fixture({exists:false}),result=await createReturnLocalArtworkLoader(f.options).load({art_key:'arte teste',sha256:null});
 assert.equal(result.state,'NOT_AVAILABLE');assert.equal(result.reason,'LIBRARY_NOT_FOUND');assert.equal(f.calls.opens,0);assert.equal(f.calls.urls.length,0);
});
test('without enumeration an upgrade is aborted rather than initializing a missing library',async()=>{
 const f=fixture({enumerate:false,opening:'upgrade'}),result=await createReturnLocalArtworkLoader(f.options).load({art_key:'arte teste',sha256:null});
 assert.equal(result.state,'NOT_AVAILABLE');assert.equal(result.reason,'LIBRARY_NOT_FOUND');assert.equal(f.calls.upgradeAborts,1);assert.deepEqual(f.calls.transactions,[]);f.openSuccess();assert.equal(f.calls.closes,1);
});
test('a blocked open is unavailable and a late successful connection is closed',async()=>{
 const f=fixture({opening:'blocked'}),result=await createReturnLocalArtworkLoader(f.options).load({art_key:'arte teste',sha256:null});
 assert.equal(result.state,'NOT_AVAILABLE');f.openSuccess();assert.equal(f.calls.closes,1);assert.equal(f.calls.urls.length,0);
});
test('missing exact artwork never chooses another local key',async()=>{
 const pending=fixture({pendingRead:true}),promise=createReturnLocalArtworkLoader(pending.options).load({art_key:'arte teste',sha256:null});
 await tick();pending.completeRead(undefined);const result=await promise;
 assert.equal(result.state,'NOT_AVAILABLE');assert.equal(result.reason,'ARTWORK_NOT_FOUND');assert.deepEqual(pending.calls.gets,['arte teste']);assert.equal(pending.calls.urls.length,0);
});
test('a returned duplicate or different key is rejected without a URL',async()=>{
 const f=fixture({row:artwork(png(),{art_key:'outra arte'})}),result=await createReturnLocalArtworkLoader(f.options).load({art_key:'arte teste',sha256:null});
 assert.equal(result.state,'MISMATCH');assert.equal(result.reason,'ARTWORK_KEY_MISMATCH');assert.equal(f.calls.decode,0);assert.equal(f.calls.urls.length,0);
});
test('a conflicting historical SHA does not decode a current replacement',async()=>{
 const f=fixture(),result=await createReturnLocalArtworkLoader(f.options).load({art_key:'arte teste',sha256:'0'.repeat(64)});
 assert.equal(result.state,'MISMATCH');assert.equal(f.calls.decode,0);assert.equal(f.calls.urls.length,0);
});
test('tampered PNG bytes cannot pass the saved or expected hash',async()=>{
 const original=png(),tampered=Buffer.from(original);tampered[tampered.length-1]^=1;
 const f=fixture({row:artwork(tampered,{sha256:sha(original)})}),result=await createReturnLocalArtworkLoader(f.options).load({art_key:'arte teste',sha256:sha(original)});
 assert.equal(result.state,'MISMATCH');assert.equal(result.reason,'ARTWORK_HASH_MISMATCH');assert.equal(f.calls.decode,0);assert.equal(f.calls.urls.length,0);
});
test('PNG signature and IHDR length are checked before decoding',async t=>{
 for(const kind of ['signature','ihdr'])await t.test(kind,async()=>{
  const bytes=png();if(kind==='signature')bytes[0]=0;else bytes.writeUInt32BE(12,8);
  const f=fixture({row:artwork(bytes)}),result=await createReturnLocalArtworkLoader(f.options).load({art_key:'arte teste',sha256:null});
  assert.equal(result.state,'INVALID');assert.equal(f.calls.decode,0);assert.equal(f.calls.urls.length,0);
 });
});
test('native Blob brand, PNG MIME and 32 MiB bound prevent forged or oversized images',async t=>{
 const candidates=[{size:100,type:'image/png',arrayBuffer(){throw Error('FORGED_BLOB_READ');}},new Blob([png()],{type:'text/html'}),new Blob([new Uint8Array(33554433)],{type:'image/png'})];
 for(const [index,blob] of candidates.entries())await t.test(String(index),async()=>{const f=fixture({row:artwork(png(),{blob})}),result=await createReturnLocalArtworkLoader(f.options).load({art_key:'arte teste',sha256:null});assert.equal(result.state,'INVALID');assert.equal(f.calls.decode,0);assert.equal(f.calls.urls.length,0);});
});
test('dimension metadata and the 50 MP limit are checked before bitmap allocation',async t=>{
 await t.test('metadata disagreement',async()=>{const f=fixture({row:artwork(png(),{pixel_width:2})}),result=await createReturnLocalArtworkLoader(f.options).load({art_key:'arte teste',sha256:null});assert.equal(result.state,'MISMATCH');assert.equal(f.calls.decode,0);});
 await t.test('oversized PNG',async()=>{const f=fixture({row:artwork(png(10000,6000))}),result=await createReturnLocalArtworkLoader(f.options).load({art_key:'arte teste',sha256:null});assert.equal(result.state,'INVALID');assert.equal(result.reason,'PNG_DIMENSIONS_INVALID');assert.equal(f.calls.decode,0);});
});
test('decode failure and decoded dimension mismatch never produce an image URL',async t=>{
 await t.test('decode rejected',async()=>{const f=fixture({decodeImpl:async()=>{throw Error('decode');}}),result=await createReturnLocalArtworkLoader(f.options).load({art_key:'arte teste',sha256:null});assert.equal(result.state,'INVALID');assert.equal(result.reason,'PNG_DECODE_FAILED');assert.equal(f.calls.urls.length,0);});
 await t.test('decoded dimensions disagree',async()=>{let closed=0;const f=fixture({decodeImpl:async()=>({width:2,height:1,close(){closed++;}})}),result=await createReturnLocalArtworkLoader(f.options).load({art_key:'arte teste',sha256:null});assert.equal(result.state,'MISMATCH');assert.equal(closed,1);assert.equal(f.calls.urls.length,0);});
});
test('abort before opening, while opening and during a transaction leaves no late URL',async t=>{
 await t.test('already aborted',async()=>{const f=fixture(),controller=new AbortController();controller.abort();const result=await createReturnLocalArtworkLoader(f.options).load({art_key:'arte teste',sha256:null},{signal:controller.signal});assert.equal(result.reason,'CANCELLED');assert.equal(f.calls.opens,0);});
 await t.test('opening cancelled',async()=>{const f=fixture({pendingOpen:true}),controller=new AbortController(),promise=createReturnLocalArtworkLoader(f.options).load({art_key:'arte teste',sha256:null},{signal:controller.signal});await tick();controller.abort();assert.equal((await promise).reason,'CANCELLED');f.openSuccess();assert.equal(f.calls.closes,1);assert.equal(f.calls.urls.length,0);});
 await t.test('transaction cancelled',async()=>{const f=fixture({pendingRead:true}),controller=new AbortController(),promise=createReturnLocalArtworkLoader(f.options).load({art_key:'arte teste',sha256:null},{signal:controller.signal});await tick();controller.abort();assert.equal((await promise).reason,'CANCELLED');assert.equal(f.calls.aborts,1);assert.equal(f.calls.closes,1);f.completeRead();assert.equal(f.calls.urls.length,0);});
});
test('timeout closes an active database and aborts its read-only transaction',async()=>{
 const f=fixture({pendingRead:true}),promise=createReturnLocalArtworkLoader(f.options).load({art_key:'arte teste',sha256:null});await tick();f.timeout();const result=await promise;
 assert.equal(result.reason,'TIMEOUT');assert.equal(f.calls.aborts,1);assert.equal(f.calls.closes,1);assert.equal(f.calls.cleared,1);assert.equal(f.calls.urls.length,0);
});
test('disposal during decoding closes a late bitmap and never creates a late URL',async()=>{
 let finish,closed=0;const f=fixture({decodeImpl:()=>new Promise(resolve=>{finish=resolve;})}),loader=createReturnLocalArtworkLoader(f.options),promise=loader.load({art_key:'arte teste',sha256:null});
 while(!finish)await tick();loader.dispose();assert.equal((await promise).reason,'DISPOSED');finish({width:1,height:1,close(){closed++;}});await tick();assert.equal(closed,1);assert.equal(f.calls.urls.length,0);
 assert.equal((await loader.load({art_key:'arte teste',sha256:null})).reason,'DISPOSED');
});
test('aborting a completed load revokes its URL; disposal revokes all remaining URLs once',async()=>{
 const f=fixture(),loader=createReturnLocalArtworkLoader(f.options),controller=new AbortController();
 const first=await loader.load({art_key:'arte teste',sha256:null},{signal:controller.signal});const second=await loader.load({art_key:'arte teste',sha256:null});
 controller.abort();assert.deepEqual(f.calls.revoked,[first.url]);loader.dispose();second.cleanup();assert.deepEqual(f.calls.revoked,[first.url,second.url]);
});
test('keys are not guessed or normalized and getter descriptors are never evaluated',async()=>{
 let touched=0;const f=fixture(),loader=createReturnLocalArtworkLoader(f.options);
 for(const art_key of ['Arte Teste','arte teste.png','../arte','arte/parte'])assert.equal((await loader.load({art_key,sha256:null})).state,'INVALID');
 const descriptor={sha256:null};Object.defineProperty(descriptor,'art_key',{get(){touched++;return 'arte teste';}});assert.equal((await loader.load(descriptor)).state,'INVALID');assert.equal(touched,0);assert.equal(f.calls.opens,0);
});
test('factory survives toString embedding with no closure, network or DTF dependency',async()=>{
 let externalCalls=0;const blocked=()=>{externalCalls++;throw Error('EXTERNAL_IO_FORBIDDEN');},f=fixture();
 const factory=vm.runInNewContext('('+createReturnLocalArtworkLoader.toString()+')',{globalThis:{},fetch:blocked,XMLHttpRequest:blocked,DTF:{start:blocked}}),loader=factory(f.options),result=await loader.load({art_key:'arte teste',sha256:null});
 assert.equal(result.state,'AVAILABLE');assert.equal(externalCalls,0);loader.dispose();
});
