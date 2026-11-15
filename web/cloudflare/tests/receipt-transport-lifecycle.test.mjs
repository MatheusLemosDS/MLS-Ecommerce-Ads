import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptProtocolError,receiptNodeObservation,receiptDocumentNavigation} from './returns-receipts-chrome-helpers.mjs';

const origin='http://127.0.0.1:12345';
class FakeCdp{
 constructor(){this.listeners=new Map();this.calls=[];this.loader='before';this.node=0;this.observe=0;}
 on(method,fn){const set=this.listeners.get(method)||new Set();set.add(fn);this.listeners.set(method,set);return()=>{set.delete(fn);if(!set.size)this.listeners.delete(method);};}
 emit(method,value={}){for(const fn of [...(this.listeners.get(method)||[])])fn(value);}
 async send(method,params={}){
  this.calls.push({method,params});
  if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'main',loaderId:this.loader,url:origin+'/before'}}};
  if(method==='DOM.getDocument')return {root:{nodeId:++this.node}};
  if(method==='DOM.querySelector')return {nodeId:++this.node};
  if(method==='DOM.scrollIntoViewIfNeeded'||method==='DOM.getContentQuads'){
   if(this.observe++===0)throw receiptProtocolError(method,{code:-32000,message:'Could not find node with given id'});
   return {observedNode:params.nodeId};
  }
  if(method==='Runtime.evaluate'){assert.equal(params.expression,'document.readyState');assert.equal(params.contextId,2);return {result:{value:'complete'}};}
  throw Error('UNEXPECTED_METHOD:'+method);
 }
 frame(extra={}){this.emit('Page.frameNavigated',{frame:{id:'main',loaderId:'after',url:origin+'/after'},...extra});}
 context(extra={}){this.emit('Runtime.executionContextCreated',{context:{id:2,origin,auxData:{isDefault:true,frameId:'main'},...extra}});}
 load(){this.emit('Page.lifecycleEvent',{name:'load',frameId:'main',loaderId:'after'});}
 complete(){this.frame();this.context();this.load();}
}
const navigate=(cdp,action)=>receiptDocumentNavigation(cdp,{url:origin+'/after',action,timeoutMs:25});

test('stale DOM observation resolves a fresh node without dispatching input',async()=>{
 for(const method of ['DOM.scrollIntoViewIfNeeded','DOM.getContentQuads']){
  const cdp=new FakeCdp();const result=await receiptNodeObservation(cdp,'#action',method);
  const observations=cdp.calls.filter(c=>c.method===method);assert.equal(observations.length,2);assert.notEqual(observations[0].params.nodeId,observations[1].params.nodeId);assert.equal(result.observedNode,observations[1].params.nodeId);
  assert.ok(cdp.calls.every(c=>!c.method.startsWith('Input.')));
 }
});
test('node observations never replay actions, cross documents or swallow unrelated failures',async()=>{
 const action=new FakeCdp();await assert.rejects(receiptNodeObservation(action,'#action','Input.dispatchMouseEvent'));assert.equal(action.calls.length,0);
 const replaced=new FakeCdp();const send=replaced.send.bind(replaced);replaced.send=async(method,params)=>{if(method==='Page.getFrameTree'&&replaced.observe)replaced.loader='different';return send(method,params);};await assert.rejects(receiptNodeObservation(replaced,'#action','DOM.getContentQuads'),/Could not find node/);assert.equal(replaced.observe,1);
 for(const error of [Error('RECEIPT_CDP_CLOSED'),receiptProtocolError('DOM.getContentQuads',{code:-32000,message:'Target crashed'})]){
  const cdp=new FakeCdp();const raw=cdp.send.bind(cdp);cdp.send=async(method,params)=>{if(method==='DOM.getContentQuads')throw error;return raw(method,params);};await assert.rejects(receiptNodeObservation(cdp,'#action','DOM.getContentQuads'),e=>e===error);
 }
 const endless=new FakeCdp();const raw=endless.send.bind(endless);let attempts=0;endless.send=async(method,params)=>{if(method==='DOM.getContentQuads'){attempts++;throw receiptProtocolError(method,{code:-32000,message:'Could not find node with given id'});}return raw(method,params);};await assert.rejects(receiptNodeObservation(endless,'#action','DOM.getContentQuads'));assert.equal(attempts,3);
});
test('document navigation observes main frame, new default context and matching loader before reads',async()=>{
 const cdp=new FakeCdp();let actions=0;const proof=await navigate(cdp,()=>{actions++;cdp.complete();});assert.equal(actions,1);assert.deepEqual(proof,{frameId:'main',loaderId:'after',contextId:2});assert.equal(cdp.listeners.size,0);assert.deepEqual(cdp.calls.map(c=>c.method),['Page.getFrameTree']);
});
test('context reset succeeds only with complete navigation proof, never by retrying the action',async()=>{
 const reset=()=>receiptProtocolError('Runtime.evaluate',{code:-32000,message:'Inspected target navigated or closed'});
 const cdp=new FakeCdp();let actions=0;await navigate(cdp,()=>{actions++;cdp.complete();throw reset();});assert.equal(actions,1);
 for(const evidence of [()=>{},c=>{c.frame();c.load();},c=>{c.frame();c.context();},c=>{c.frame();c.context({auxData:{isDefault:false,frameId:'main'}});c.load();},c=>{c.frame();c.context();c.emit('Page.lifecycleEvent',{name:'load',frameId:'main',loaderId:'before'});}]){
  const incomplete=new FakeCdp();await assert.rejects(navigate(incomplete,()=>{evidence(incomplete);throw reset();}),/NAVIGATION_INCOMPLETE/);assert.equal(incomplete.listeners.size,0);
 }
});
test('unexpected destinations, crashes, Javascript errors and unrelated protocol failures remain failures',async()=>{
 for(const event of ['Inspector.targetCrashed','Inspector.detached','Receipt.disconnected','Runtime.exceptionThrown']){
  const cdp=new FakeCdp();await assert.rejects(navigate(cdp,()=>{cdp.complete();cdp.emit(event);}),/TARGET_UNAVAILABLE|JAVASCRIPT_EXCEPTION/);assert.equal(cdp.listeners.size,0);
 }
 const wrong=new FakeCdp();await assert.rejects(navigate(wrong,()=>{wrong.frame({frame:{id:'main',loaderId:'after',url:'https://other.example/after'}});}),/UNEXPECTED_NAVIGATION/);
 const unrelated=new FakeCdp(),error=receiptProtocolError('DOM.getDocument',{code:-32000,message:'Inspected target navigated or closed'});await assert.rejects(navigate(unrelated,()=>{unrelated.complete();throw error;}),e=>e===error);
});
test('back-forward cache restore requires the observed new main context and complete document',async()=>{
 const cdp=new FakeCdp();await navigate(cdp,()=>{cdp.frame({type:'BackForwardCacheRestore'});cdp.context();});assert.equal(cdp.calls.filter(c=>c.method==='Runtime.evaluate').length,1);assert.equal(cdp.listeners.size,0);
});
