import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createAdminApiClient} from '../src/admin-api-client.mjs';

function timerControl(){
 let sequence=0;const timers=new Map(),cleared=[];
 return {timers,cleared,setTimeoutImpl(callback,delay){const id=++sequence;timers.set(id,{callback,delay});return id;},clearTimeoutImpl(id){cleared.push(id);timers.delete(id);},fire(){const value=[...timers.values()][0];assert.ok(value);value.callback();}};
}
const timingOptions=timer=>({setTimeoutImpl:timer.setTimeoutImpl,clearTimeoutImpl:timer.clearTimeoutImpl});
const safe=(code,status=null,apiCode=null)=>failure=>{
 assert.equal(failure.code,code);assert.equal(failure.status,status);assert.equal(failure.apiCode,apiCode);
 assert.ok(!failure.message.includes('PRIVATE'));assert.ok(!failure.message.includes('Failed to fetch'));assert.ok(!failure.message.includes('<html>'));return true;
};

test('successful fixed-origin reads return JSON and always clear their deadline',async()=>{
 const timer=timerControl(),calls=[];
 const api=createAdminApiClient({...timingOptions(timer),fetchImpl:async(url,options)=>{calls.push({url,options});assert.equal([...timer.timers.values()][0].delay,45000);return Response.json({revision:2});}});
 assert.deepEqual(await api('catalog-classification?item_ids=101%2C102&limit=20'),{revision:2});
 assert.equal(calls[0].url,'/api/admin/catalog-classification?item_ids=101%2C102&limit=20');assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.credentials,'same-origin');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.cache,'no-store');assert.equal(calls[0].options.body,undefined);
 assert.equal(timer.timers.size,0);assert.equal(timer.cleared.length,1);assert.equal(calls[0].options.signal.aborted,false);
});

test('a mutation carries the current CSRF once and never replays after a network failure',async()=>{
 const timer=timerControl(),calls=[];let csrf='first-csrf';
 const api=createAdminApiClient({...timingOptions(timer),getCsrf:()=>csrf,fetchImpl:async(url,options)=>{calls.push({url,options});assert.equal([...timer.timers.values()][0].delay,90000);throw new TypeError('Failed to fetch PRIVATE_PROVIDER_TOKEN');}});
 csrf='current-csrf';await assert.rejects(api('catalog-classification/sync',{}),safe('ADMIN_API_NETWORK_ERROR'));
 assert.equal(calls.length,1);assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.headers['X-CSRF-Token'],'current-csrf');assert.equal(calls[0].options.body,'{}');assert.equal(timer.timers.size,0);
});

test('a deadline rejects a hung fetch even when it ignores abort, and its late response is never returned',async()=>{
 const timer=timerControl();let finish,attempts=0,signal;
 const api=createAdminApiClient({...timingOptions(timer),fetchImpl:async(url,options)=>{attempts++;signal=options.signal;return new Promise(resolve=>finish=resolve);}});
 const pending=api('state',undefined,{timeoutMs:12000});assert.equal([...timer.timers.values()][0].delay,12000);timer.fire();
 await assert.rejects(pending,safe('ADMIN_API_TIMEOUT'));assert.equal(signal.aborted,true);assert.equal(attempts,1);assert.equal(timer.timers.size,0);
 finish(Response.json({revision:999}));await Promise.resolve();await Promise.resolve();assert.equal(attempts,1);
});

test('the same deadline covers JSON parsing and attempts to cancel an unread body',async()=>{
 const timer=timerControl();let finishBody,bodyStarted=false,cancelled=0;
 const api=createAdminApiClient({...timingOptions(timer),fetchImpl:async()=>({status:200,ok:true,body:{cancel(){cancelled++;return Promise.resolve();}},json(){bodyStarted=true;return new Promise(resolve=>finishBody=resolve);}})});
 const pending=api('state');await Promise.resolve();assert.equal(bodyStarted,true);timer.fire();
 await assert.rejects(pending,safe('ADMIN_API_TIMEOUT',200));assert.equal(cancelled,1);assert.equal(timer.timers.size,0);
 finishBody({revision:9});await Promise.resolve();await Promise.resolve();
});

test('known HTTP status survives non-JSON responses without displaying their raw HTML',async()=>{
 for(const status of [401,502]){
  const timer=timerControl(),api=createAdminApiClient({...timingOptions(timer),fetchImpl:async()=>new Response('<html>PRIVATE_PROVIDER_ERROR</html>',{status,headers:{'content-type':'text/html'}})});
  await assert.rejects(api('state'),safe('ADMIN_API_HTTP_ERROR',status));assert.equal(timer.timers.size,0);
 }
 const api=createAdminApiClient({fetchImpl:async()=>new Response('<html>PRIVATE_PROVIDER_ERROR</html>',{status:200})});await assert.rejects(api('state'),safe('ADMIN_API_RESPONSE_INVALID',200));
});

test('a connection lost while reading a successful response remains a retryable network failure rather than malformed data',async()=>{
 let attempts=0;const api=createAdminApiClient({fetchImpl:async()=>{attempts++;return {status:200,ok:true,json:async()=>{throw new TypeError('PRIVATE_CONNECTION_STREAM_ERROR');}};}});
 await assert.rejects(api('state'),safe('ADMIN_API_NETWORK_ERROR'));assert.equal(attempts,1);
});

test('only a canonical JSON error code crosses the HTTP boundary and accessors never run',async()=>{
 const api=createAdminApiClient({fetchImpl:async()=>Response.json({error:'UNAUTHORIZED',message:'PRIVATE_PROVIDER_TOKEN'},{status:401})});
 await assert.rejects(api('state'),safe('ADMIN_API_HTTP_ERROR',401,'UNAUTHORIZED'));
 for(const code of ['PRIVATE_PROVIDER_TOKEN <html>','lowercase','A'.repeat(81),null]){
  const request=createAdminApiClient({fetchImpl:async()=>Response.json({error:code},{status:503})});await assert.rejects(request('state'),safe('ADMIN_API_HTTP_ERROR',503));
 }
 let calls=0;const value={};Object.defineProperty(value,'error',{enumerable:true,get(){calls++;return 'PRIVATE';}});
 const request=createAdminApiClient({fetchImpl:async()=>({status:403,ok:false,json:async()=>value})});await assert.rejects(request('state'),safe('ADMIN_API_HTTP_ERROR',403));assert.equal(calls,0);
});

test('bad selectors, deadline values and accessor options fail before fetch without forwarding arbitrary text',async()=>{
 let reads=0,getters=0;const api=createAdminApiClient({fetchImpl:async()=>{reads++;return Response.json({});}});
 for(const path of ['https://evil.invalid','//evil.invalid','../state','/state','state#fragment','state?url=https://evil.invalid','STATE','state\n'])await assert.rejects(api(path),safe('ADMIN_API_RESPONSE_INVALID'));
 for(const timeoutMs of [0,4,120001,NaN,1.5,'12000'])await assert.rejects(api('state',undefined,{timeoutMs}),safe('ADMIN_API_RESPONSE_INVALID'));
 const options={};Object.defineProperty(options,'timeoutMs',{enumerable:true,get(){getters++;return 12000;}});await assert.rejects(api('state',undefined,options),safe('ADMIN_API_RESPONSE_INVALID'));
 const setup={};Object.defineProperty(setup,'fetchImpl',{enumerable:true,get(){getters++;return ()=>{};}});assert.throws(()=>createAdminApiClient(setup),safe('ADMIN_API_RESPONSE_INVALID'));
 assert.equal(getters,0);assert.equal(reads,0);
});

test('an unencodable body or invalid csrf cannot issue a request and arrays remain valid JSON responses',async()=>{
 let reads=0;const api=createAdminApiClient({fetchImpl:async()=>{reads++;return Response.json([]);}}),circular={};circular.self=circular;
 await assert.rejects(api('settings',circular),safe('ADMIN_API_RESPONSE_INVALID'));
 const badCsrf=createAdminApiClient({getCsrf:()=> 'PRIVATE\nHEADER',fetchImpl:async()=>{reads++;return Response.json({});}});await assert.rejects(badCsrf('settings',{}),safe('ADMIN_API_RESPONSE_INVALID'));
 assert.deepEqual(await api('audit'),[]);assert.equal(reads,1);
 for(const value of [null,true,1,'PRIVATE']){
  const request=createAdminApiClient({fetchImpl:async()=>Response.json(value)});await assert.rejects(request('state'),safe('ADMIN_API_RESPONSE_INVALID',200));
 }
});

test('the factory works from its isolated browser source without a module closure',async()=>{
 const context=vm.createContext({AbortController,setTimeout,clearTimeout,Response});
 vm.runInContext(createAdminApiClient.toString()+"\nglobalThis.client=createAdminApiClient({fetchImpl:async(url,options)=>Response.json({url,method:options.method}),getCsrf:()=> 'csrf'});",context);
 const actual=await vm.runInContext("client('state',undefined,{timeoutMs:12000})",context);assert.equal(actual.url,'/api/admin/state');assert.equal(actual.method,'GET');
});
