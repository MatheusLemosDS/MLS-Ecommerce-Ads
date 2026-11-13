import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptProtocolError,receiptWaitForLogoutNavigation} from './returns-receipts-chrome-helpers.mjs';

const origin='https://logout-fixture.example.test';
class FakeCdp{
 constructor(){this.listeners=new Map();this.commands=[];}
 async send(method){this.commands.push(method);assert.equal(method,'Page.getFrameTree');return {frameTree:{frame:{id:'main',loaderId:'before',url:origin+'/admin?tab=order-operations'}}};}
 on(method,callback){const callbacks=this.listeners.get(method)||new Set();callbacks.add(callback);this.listeners.set(method,callbacks);return()=>{callbacks.delete(callback);if(!callbacks.size)this.listeners.delete(method);};}
 emit(method,params){for(const callback of [...(this.listeners.get(method)||[])])callback(params);}
 frame(url=origin+'/login'){this.emit('Page.frameNavigated',{frame:{id:'main',loaderId:'after',url}});}
 context(extra={}){this.emit('Runtime.executionContextCreated',{context:{id:2,origin,auxData:{isDefault:true,frameId:'main'},...extra}});}
 load(){this.emit('Page.loadEventFired',{timestamp:1});}
 complete(){this.frame();this.context();this.load();}
}
const reset=()=>receiptProtocolError('Runtime.evaluate',{code:-32000,message:'Inspected target navigated or closed'});
const run=(cdp,action)=>receiptWaitForLogoutNavigation(cdp,{origin,action,timeoutMs:20});

test('protocol errors add only the method, keeping parameters and expressions out of diagnostics',()=>{
 const error=reset();assert.equal(error.message,'Inspected target navigated or closed [CDP Runtime.evaluate]');
 assert.equal(error.cdpMethod,'Runtime.evaluate');assert.equal(error.cdpProtocolCode,-32000);
 assert.deepEqual(Object.keys(error).sort(),['cdpMethod','cdpProtocolCode','cdpProtocolMessage']);
});

test('intentional logout subscribes before activation and requires the exact new frame, main context and load',async()=>{
 const cdp=new FakeCdp();const result=await run(cdp,()=>{
  for(const name of ['Page.frameNavigated','Runtime.executionContextCreated','Page.loadEventFired','Inspector.targetCrashed','Runtime.exceptionThrown'])assert.ok(cdp.listeners.has(name),name);
  cdp.complete();
 });
 assert.deepEqual(result,{url:origin+'/login',frameId:'main',contextId:2,loaded:true});
 assert.deepEqual(cdp.commands,['Page.getFrameTree'],'no Runtime location polling across navigation');assert.equal(cdp.listeners.size,0);
});

test('a known Runtime context-reset response succeeds only with complete navigation evidence',async()=>{
 const cdp=new FakeCdp();await run(cdp,()=>{cdp.complete();throw reset();});assert.equal(cdp.listeners.size,0);
});

test('context-reset error alone, missing new context or missing load cannot pass logout',async()=>{
 for(const evidence of [()=>{},cdp=>{cdp.frame();cdp.load();},cdp=>{cdp.frame();cdp.context();}]){
  const cdp=new FakeCdp();await assert.rejects(run(cdp,()=>{evidence(cdp);throw reset();}),/RECEIPT_LOGOUT_NAVIGATION_INCOMPLETE/);assert.equal(cdp.listeners.size,0);
 }
});

test('unexpected destination, origin, frame or unchanged document cannot pass even alongside reset',async()=>{
 for(const frame of [
  {id:'main',loaderId:'after',url:origin+'/dashboard'},
  {id:'main',loaderId:'after',url:'https://other.example.test/login'},
  {id:'other-main',loaderId:'after',url:origin+'/login'},
  {id:'main',loaderId:'before',url:origin+'/login'},
  {id:'main',loaderId:'after',url:origin+'/login?unexpected=1'},
 ]){
  const cdp=new FakeCdp();await assert.rejects(run(cdp,()=>{cdp.emit('Page.frameNavigated',{frame});cdp.context();cdp.load();throw reset();}),/RECEIPT_LOGOUT_UNEXPECTED_NAVIGATION/);assert.equal(cdp.listeners.size,0);
 }
});

test('isolated-world and subframe contexts never substitute for the new default main context',async()=>{
 for(const auxData of [{isDefault:false,frameId:'main'},{isDefault:true,frameId:'child'}]){
  const cdp=new FakeCdp();await assert.rejects(run(cdp,()=>{cdp.frame();cdp.context({auxData});cdp.load();throw reset();}),/RECEIPT_LOGOUT_NAVIGATION_INCOMPLETE/);
 }
});

test('target crash, detach and connection closure remain failures before and after document evidence',async()=>{
 for(const event of ['Inspector.targetCrashed','Inspector.detached','Receipt.disconnected'])for(const afterProof of [false,true]){
  const cdp=new FakeCdp();await assert.rejects(run(cdp,()=>{if(afterProof)cdp.complete();cdp.emit(event,{});throw reset();}),/RECEIPT_LOGOUT_TARGET_UNAVAILABLE/);assert.equal(cdp.listeners.size,0);
 }
});

test('JavaScript exceptions and unrelated protocol failures are not swallowed by intentional logout',async()=>{
 const javascript=new FakeCdp();await assert.rejects(run(javascript,()=>{javascript.complete();javascript.emit('Runtime.exceptionThrown',{});throw reset();}),/RECEIPT_LOGOUT_JAVASCRIPT_EXCEPTION/);
 for(const error of [Error('ordinary action failed'),Error('Inspected target navigated or closed'),receiptProtocolError('DOM.getDocument',{code:-32000,message:'Inspected target navigated or closed'}),receiptProtocolError('Runtime.evaluate',{code:-32000,message:'Target crashed'}),receiptProtocolError('Runtime.evaluate',{code:-32601,message:'Inspected target navigated or closed'})]){
  const cdp=new FakeCdp();await assert.rejects(run(cdp,()=>{cdp.complete();throw error;}),value=>value===error);assert.equal(cdp.listeners.size,0);
 }
});

test('a second navigation is rejected and stale load before the expected frame is insufficient',async()=>{
 const twice=new FakeCdp();await assert.rejects(run(twice,()=>{twice.complete();twice.frame();}),/RECEIPT_LOGOUT_MULTIPLE_NAVIGATIONS/);
 const stale=new FakeCdp();await assert.rejects(run(stale,()=>{stale.load();stale.frame();stale.context();}),/RECEIPT_LOGOUT_NAVIGATION_INCOMPLETE/);
});
