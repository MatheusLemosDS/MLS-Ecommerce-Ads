import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {accountBridgeCall} from '../src/commercial-account-gateway.mjs';
import {ACCOUNT_BRIDGE_PATH,ACCOUNT_BRIDGE_BODY_LIMIT} from '../src/commercial-account-frame.mjs';
const origin='https://app.brazacommerce.com.br',env={APP_INTERNAL_SECRET:'synthetic-gateway-timeout-'.repeat(3)},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const post=stream=>new Request(origin+'/api/account/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:stream,duplex:'half'});
async function bounded(action){return Promise.race([action,pause(1500).then(()=>{throw Error('Synthetic account stream deadline did not settle');})]);}
const frame=()=>new Response(JSON.stringify({schema:'mls_account_bridge_response_v1',status:200,headers:{'content-type':'application/json'},body:'{"ok":true}'}),{headers:{'content-type':'application/json'}});

test('account input body is covered by the transport deadline and never reaches Auth after timing out',async()=>{
 let cancelled=0,calls=0;const stream=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled++;}});
 const response=await bounded(accountBridgeCall(post(stream),env,{timeoutMs:10,fetchImpl:async()=>{calls++;return frame();}}));
 assert.equal(response.status,503);assert.equal((await response.json()).error,'ACCOUNT_SERVICE_TIMEOUT');assert.equal(calls,0);assert.equal(cancelled,1);assert.equal(stream.locked,false);
});
test('oversized input returns the existing invalid-request response without awaiting an uncooperative cancel hook',async()=>{
 let cancelled=0,calls=0;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(ACCOUNT_BRIDGE_BODY_LIMIT+1));},cancel(){cancelled++;return new Promise(()=>{});}});
 const response=await bounded(accountBridgeCall(post(stream),env,{timeoutMs:10,fetchImpl:async()=>{calls++;return frame();}}));
 assert.equal(response.status,400);assert.equal((await response.json()).error,'ACCOUNT_REQUEST_INVALID');assert.equal(calls,0);assert.equal(cancelled,1);assert.equal(stream.locked,false);
});
test('account response body is cancelled and unlocked when Auth does not finish, even if cancel never resolves',async()=>{
 let cancelled=0,calls=0;const stream=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled++;return new Promise(()=>{});}});
 const response=await bounded(accountBridgeCall(new Request(origin+'/api/account/session'),env,{timeoutMs:10,fetchImpl:async request=>{calls++;assert.equal(request.redirect,'manual');return new Response(stream,{headers:{'content-type':'application/json'}});}}));
 assert.equal(response.status,503);assert.equal((await response.json()).error,'ACCOUNT_SERVICE_TIMEOUT');assert.equal(calls,1);assert.equal(cancelled,1);assert.equal(stream.locked,false);
});
test('an Auth response arriving after timeout is cancelled rather than accepted or retried',async()=>{
 let cancelled=0,calls=0;const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{}'));},cancel(){cancelled++;}});
 const response=await bounded(accountBridgeCall(new Request(origin+'/api/account/session'),env,{timeoutMs:10,fetchImpl:async()=>{calls++;await pause(35);return new Response(stream,{headers:{'content-type':'application/json'}});}}));
 assert.equal(response.status,503);assert.equal((await response.json()).error,'ACCOUNT_SERVICE_TIMEOUT');await pause(60);assert.equal(calls,1);assert.equal(cancelled,1);assert.equal(stream.locked,false);
});
test('unbounded empty chunks cannot starve the deadline or grow an unbounded chunk list',async()=>{
 let calls=0,cancelled=0;const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array());},cancel(){cancelled++;}});
 const response=await bounded(accountBridgeCall(post(stream),env,{timeoutMs:10,fetchImpl:async()=>{calls++;return frame();}}));assert.equal(response.status,400);assert.equal((await response.json()).error,'ACCOUNT_REQUEST_INVALID');assert.equal(calls,0);assert.equal(cancelled,1);assert.equal(stream.locked,false);
});
test('a successful input read does not clear or restart the one shared deadline before the Auth body',async()=>{
 let cancelled=0,calls=0;const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{}'));c.close();}}),upstream=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled++;}});
 const response=await bounded(accountBridgeCall(post(stream),env,{timeoutMs:10,fetchImpl:async()=>{calls++;return new Response(upstream,{headers:{'content-type':'application/json'}});}}));assert.equal(response.status,503);assert.equal((await response.json()).error,'ACCOUNT_SERVICE_TIMEOUT');assert.equal(calls,1);assert.equal(cancelled,1);assert.equal(upstream.locked,false);
});
test('generated App Worker retains account routing and Origin guards while rejecting a hostile oversized stream',()=>{
 const module=`
 import assert from 'node:assert/strict';
 import worker from ${JSON.stringify(new URL('../../../dist/app-worker.mjs',import.meta.url).href)};
 const origin=${JSON.stringify(origin)},env=${JSON.stringify(env)};let calls=0;
 globalThis.fetch=async request=>{calls++;assert.equal(request.url,${JSON.stringify('https://auth.brazacommerce.com.br'+ACCOUNT_BRIDGE_PATH)});assert.equal(request.redirect,'manual');return new Response(JSON.stringify({schema:'mls_account_bridge_response_v1',status:200,headers:{'content-type':'application/json'},body:'{"ok":true}'}),{headers:{'content-type':'application/json'}});};
 const success=await worker.fetch(new Request(origin+'/api/account/session'),env);assert.equal(success.status,200);assert.deepEqual(await success.json(),{ok:true});assert.equal(calls,1);
 let cancelled=0;const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(${ACCOUNT_BRIDGE_BODY_LIMIT+1}));},cancel(){cancelled++;return new Promise(()=>{});}});
 const request=new Request(origin+'/api/account/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:stream,duplex:'half'});
 const response=await Promise.race([worker.fetch(request,env),new Promise((_,reject)=>setTimeout(()=>reject(Error('Generated Worker stalled')),1500))]);
 assert.equal(response.status,400);assert.equal((await response.json()).error,'ACCOUNT_REQUEST_INVALID');assert.equal(calls,1);assert.equal(cancelled,1);assert.equal(stream.locked,false);
 const forbidden=new Request(origin+'/api/account/profile',{method:'PATCH',headers:{origin:'https://untrusted.example','content-type':'application/json'},body:'{}'}),reject=await worker.fetch(forbidden,env);assert.equal(reject.status,403);assert.equal(calls,1);assert.equal(forbidden.bodyUsed,false);console.log('GENERATED_ACCOUNT_GATEWAY_GUARDS_AND_STREAM_CLEANUP_OK');
 `;
 const result=spawnSync(process.execPath,['--input-type=module','--eval',module],{cwd:fileURLToPath(new URL('../../../',import.meta.url)),encoding:'utf8',timeout:10000,maxBuffer:65536});assert.equal(result.status,0,result.stderr||result.stdout);assert.match(result.stdout,/GENERATED_ACCOUNT_GATEWAY_GUARDS_AND_STREAM_CLEANUP_OK/);
});
