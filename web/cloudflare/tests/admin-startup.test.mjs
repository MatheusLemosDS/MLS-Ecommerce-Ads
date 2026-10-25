import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createAdminStartup} from '../src/admin-startup.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const network=(code='ADMIN_API_NETWORK_ERROR',status)=>Object.assign(new Error('PRIVATE_TRANSPORT_DETAIL'),{code,...(status===undefined?{}:{status})});
function fixture(overrides={}){
 const events=[],states=[],errors=[],secondaryErrors=[],waits=[],session={settings:{},csrf:'fixture-only'};
 const options={loadSession:async()=>{events.push('session');return session;},acceptSession:value=>{assert.equal(value,session);events.push('accept');},startPrimary:()=>{events.push('primary');},startSecondary:()=>{events.push('secondary');},onState:value=>states.push(value),onPrimaryFailure:error=>errors.push(error),onSecondaryFailure:error=>secondaryErrors.push(error),canRetry:()=>true,wait:async ms=>{waits.push(ms);},...overrides};
 const controller=createAdminStartup(options);return {controller,events,states,errors,secondaryErrors,waits,session};
}
const flush=async()=>{for(let step=0;step<12;step++)await Promise.resolve();};

test('validated session launches the primary immediately before secondary work, without awaiting either import',async()=>{
 const primary=deferred(),secondary=deferred(),events=[],value={csrf:'known-session'};
 const f=fixture({loadSession:async()=>{events.push('session');return value;},acceptSession:received=>{assert.equal(received,value);events.push('accept');},startPrimary:()=>{events.push('primary');return primary.promise;},startSecondary:()=>{events.push('secondary');return secondary.promise;}});
 const result=await f.controller.start();assert.deepEqual(events,['session','accept','primary','secondary']);assert.equal(result.phase,'READY');assert.equal(result.pending,false);assert.equal(result.sessionReady,true);assert.equal(result.primaryStarted,true);assert.equal(result.secondaryStarted,true);assert.deepEqual(f.states.map(value=>value.phase),['LOADING','READY']);
 assert.equal((await f.controller.start()).phase,'READY');assert.deepEqual(events,['session','accept','primary','secondary']);
});

test('one retry is allowed only for a retryable session read, preserving order and the accepted CSRF',async()=>{
 let reads=0;const value={csrf:'validated-csrf'},accepted=[];
 const f=fixture({loadSession:async()=>{if(++reads===1)throw network();return value;},acceptSession:session=>accepted.push(session)});
 const result=await f.controller.start();assert.equal(reads,2);assert.deepEqual(f.waits,[750]);assert.deepEqual(accepted,[value]);assert.equal(result.phase,'READY');assert.equal(result.attempt,2);assert.deepEqual(f.states.map(value=>value.phase),['LOADING','RETRYING','READY']);assert.equal(f.states[0].pending,true);assert.equal(f.states.at(-1).pending,false);
});

test('an interrupted successful response body may retry once, while a timed-out unauthorized body stays terminal',async()=>{
 let reads=0;const session={csrf:'accepted-after-body-timeout'};
 const f=fixture({loadSession:async()=>{if(++reads===1)throw network('ADMIN_API_TIMEOUT',200);return session;},acceptSession:value=>{assert.equal(value,session);}});
 assert.equal((await f.controller.start()).phase,'READY');assert.equal(reads,2);assert.deepEqual(f.waits,[750]);assert.deepEqual(f.events,['primary','secondary']);
 let unauthorizedReads=0;const unauthorized=fixture({loadSession:async()=>{unauthorizedReads++;throw network('ADMIN_API_TIMEOUT',401);}});
 assert.equal((await unauthorized.controller.start()).phase,'FAILED');assert.equal(unauthorizedReads,1);assert.deepEqual(unauthorized.waits,[]);assert.deepEqual(unauthorized.events,[]);
});

test('two failed session reads expose a terminal failure and one manual start opens a fresh bounded attempt',async()=>{
 let reads=0;const f=fixture({loadSession:async()=>{if(++reads<=2)throw network('ADMIN_API_TIMEOUT');return null;},acceptSession:()=>{}});
 const failed=await f.controller.start();assert.equal(reads,2);assert.equal(failed.phase,'FAILED');assert.equal(failed.pending,false);assert.equal(failed.sessionReady,false);assert.equal(failed.primaryStarted,false);assert.equal(failed.secondaryStarted,false);assert.deepEqual(f.events,[]);
 const ready=await f.controller.start();assert.equal(reads,3);assert.equal(ready.phase,'READY');assert.equal(ready.attempt,1);assert.deepEqual(f.events,['primary','secondary']);
});

test('HTTP failures, unclassified errors and validation exceptions are never retried as network failures',async()=>{
 for(const failure of [network('ADMIN_API_TIMEOUT',199),network('ADMIN_API_TIMEOUT',302),network('ADMIN_API_TIMEOUT',401),network('ADMIN_API_NETWORK_ERROR',403),network('ADMIN_API_TIMEOUT',503),Object.assign(new Error('INVALID_JSON'),{code:'ADMIN_API_INVALID_RESPONSE'}),new TypeError('Failed to fetch')]){
  let reads=0;const f=fixture({loadSession:async()=>{reads++;throw failure;}});
  assert.equal((await f.controller.start()).phase,'FAILED');assert.equal(reads,1);assert.deepEqual(f.waits,[]);assert.deepEqual(f.events,[]);
 }
 let reads=0;const f=fixture({loadSession:async()=>{reads++;return {};},acceptSession:()=>{throw network();}});
 assert.equal((await f.controller.start()).phase,'FAILED');assert.equal(reads,1);assert.deepEqual(f.waits,[]);assert.equal(f.controller.getState().sessionReady,false);
});

test('an asynchronous session validator is critical but does not turn its exception into a retry',async()=>{
 const validation=deferred();let accepted=0;const f=fixture({acceptSession:()=>{accepted++;return validation.promise;}});
 const work=f.controller.start();await flush();assert.equal(accepted,1);assert.deepEqual(f.events,['session']);validation.reject(network());
 assert.equal((await work).phase,'FAILED');assert.equal(f.controller.getState().primaryStarted,false);assert.deepEqual(f.waits,[]);
});

test('secondary throws or rejected promises cannot stop the primary or reject startup',async()=>{
 for(const startSecondary of [()=>{throw new Error('SECONDARY_FAILED');},()=>Promise.reject(new Error('SECONDARY_FAILED'))]){
  const f=fixture({startSecondary});assert.equal((await f.controller.start()).phase,'READY');await flush();assert.deepEqual(f.events,['session','accept','primary']);assert.equal(f.secondaryErrors.length,1);assert.equal(f.errors.length,0);
 }
});

test('primary failure is reported independently and never holds secondary work behind it',async()=>{
 for(const startPrimary of [()=>{throw new Error('PRIMARY_FAILED');},()=>Promise.reject(new Error('PRIMARY_FAILED'))]){
  const f=fixture({startPrimary});assert.equal((await f.controller.start()).phase,'READY');await flush();assert.deepEqual(f.events,['session','accept','secondary']);assert.equal(f.errors.length,1);assert.equal(f.secondaryErrors.length,0);assert.equal(f.controller.getState().sessionReady,true);
 }
});

test('overlapping starts share the same promise, one session read and one launch of each workspace',async()=>{
 const session=deferred();let reads=0;const f=fixture({loadSession:()=>{reads++;return session.promise;},acceptSession:()=>{}});
 const first=f.controller.start(),second=f.controller.start();assert.equal(first,second);await flush();assert.equal(reads,1);session.resolve({csrf:'fixture'});assert.equal((await first).phase,'READY');assert.equal((await second).phase,'READY');assert.deepEqual(f.events,['primary','secondary']);assert.equal(f.controller.getState().pending,false);
});

test('stopping an unresolved session settles startup and a late response cannot accept state or launch anything',async()=>{
 const session=deferred();let accepts=0;const f=fixture({loadSession:()=>session.promise,acceptSession:()=>{accepts++;}});
 const work=f.controller.start();await flush();const stopped=f.controller.stop();assert.equal(stopped.phase,'STOPPED');assert.equal(stopped.pending,false);assert.equal((await work).phase,'STOPPED');session.resolve({csrf:'late'});await flush();assert.equal(accepts,0);assert.deepEqual(f.events,[]);assert.equal((await f.controller.start()).phase,'STOPPED');
});

test('stopping during the retry delay prevents another session request even if the old timer later completes',async()=>{
 const delay=deferred();let reads=0;const f=fixture({loadSession:async()=>{reads++;throw network();},wait:()=>delay.promise});
 const work=f.controller.start();await flush();assert.equal(f.controller.getState().phase,'RETRYING');f.controller.stop();assert.equal((await work).phase,'STOPPED');delay.resolve();await flush();assert.equal(reads,1);assert.deepEqual(f.events,[]);
});

test('a hidden page never starts the automatic second attempt and late child failures cannot update a stopped workspace',async()=>{
 let visible=true,reads=0;const delay=deferred();const hidden=fixture({loadSession:async()=>{reads++;throw network();},wait:()=>delay.promise,canRetry:()=>visible});
 const work=hidden.controller.start();await flush();visible=false;delay.resolve();assert.equal((await work).phase,'FAILED');assert.equal(reads,1);
 const primary=deferred(),secondary=deferred(),f=fixture({startPrimary:()=>primary.promise,startSecondary:()=>secondary.promise});await f.controller.start();f.controller.stop();primary.reject(Error('late primary'));secondary.reject(Error('late secondary'));await flush();assert.deepEqual(f.errors,[]);assert.deepEqual(f.secondaryErrors,[]);
});

test('the browser factory is closure-free, has detached state and rejects option getters without running them',async()=>{
 let getter=0;const poisoned={};Object.defineProperty(poisoned,'loadSession',{enumerable:true,get(){getter++;return ()=>{};}});assert.throws(()=>createAdminStartup(poisoned),/ADMIN_STARTUP_CONFIGURATION/);assert.equal(getter,0);
 const context=vm.createContext({});vm.runInContext(createAdminStartup.toString()+`;let loads=0,accepts=0,primary=0,secondary=0;const controller=createAdminStartup({loadSession:async()=>{loads++;return {csrf:'fixture'};},acceptSession:()=>accepts++,startPrimary:()=>primary++,startSecondary:()=>secondary++,onState:()=>{},onPrimaryFailure:()=>{},canRetry:()=>true,wait:async()=>{}});`,context);
 const result=await vm.runInContext('controller.start()',context);assert.equal(result.phase,'READY');assert.equal(vm.runInContext('loads+accepts+primary+secondary',context),4);const snapshot=vm.runInContext('controller.getState()',context);snapshot.phase='FAILED';assert.equal(vm.runInContext('controller.getState().phase',context),'READY');
});
