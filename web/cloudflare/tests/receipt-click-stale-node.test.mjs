import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptClick,receiptProtocolError} from './returns-receipts-chrome-helpers.mjs';

const selector='#receiptAction';
const missingNode=(method,code=-32000,message='Could not find node with given id')=>receiptProtocolError(method,{code,message});
function fixture(options={}){
 const trace=[],counts=new Map(),state={root:0,node:41,rect:{x:10,y:20,width:80,height:44,visible:true,unobscured:true,stable:5},...options.state};
 const record=(method,params)=>{trace.push({method,params});const count=(counts.get(method)||0)+1;counts.set(method,count);const error=options.fault?.({method,params,count,state});if(error)throw error;};
 const cdp={
  async send(method,params={}){
   record(method,params);
   if(method==='DOM.getDocument'){state.root++;return {root:{nodeId:state.root}};}
   if(method==='DOM.querySelector'){assert.equal(params.nodeId,state.root,'query uses the current document');assert.equal(params.selector,selector);return {nodeId:state.node};}
   if(['DOM.scrollIntoViewIfNeeded','DOM.getContentQuads'].includes(method)){
    if(params.nodeId!==state.node)throw missingNode(method);
    if(method==='DOM.getContentQuads')return {quads:[[10,20,90,20,90,64,10,64]]};
    return {};
   }
   if(method==='Page.captureScreenshot'){options.screenshot?.(state,counts.get(method));return {data:''};}
   if(method==='Page.getLayoutMetrics')return {cssVisualViewport:{offsetX:0,offsetY:0}};
   if(method==='Input.dispatchKeyEvent'){assert.equal(params.key,'Escape');return {};}
   if(method==='Input.dispatchMouseEvent')return {};
   assert.fail('unexpected CDP method: '+method);
  },
  async evaluate(expression){
   record('Runtime.evaluate',{expression});assert.doesNotMatch(expression,/\.click\s*\(/,'the helper never substitutes a DOM click');
   if(expression.includes('globalThis.__receiptTarget='))return;
   if(expression.startsWith('document.querySelector(')&&expression.includes('.scrollIntoView('))return;
   if(expression.includes('await document.fonts.ready'))return {...state.rect};
   if(expression==='globalThis.__receiptHover')return options.hover??{trusted:true,matches:true};
   if(expression.includes('if(!node)return null;'))return Object.hasOwn(options,'current')?options.current:{visible:state.rect.visible,height:state.rect.height,unobscured:state.rect.unobscured};
   if(expression.includes('return hit===node||node.contains(hit);'))return options.measured??true;
   assert.fail('unexpected browser evaluation');
  },
 };
 const events=type=>trace.filter(row=>row.method==='Input.dispatchMouseEvent'&&row.params.type===type);
 return {cdp,trace,state,count:method=>counts.get(method)||0,events};
}
function noActivation(f){assert.equal(f.events('mousePressed').length,0);assert.equal(f.events('mouseReleased').length,0);}
function oneNativeActivation(f){
 assert.deepEqual(f.events('mousePressed').map(row=>row.params),[{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:50,y:42,modifiers:0}]);
 assert.deepEqual(f.events('mouseReleased').map(row=>row.params),[{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:50,y:42,modifiers:0}]);
 assert.equal(f.trace.at(-2).params.type,'mousePressed');assert.equal(f.trace.at(-1).params.type,'mouseReleased');
}

test('a typed stale scroll node obtains a new document and target before exactly one native activation',async()=>{
 const f=fixture({fault({method,count,state}){if(method==='DOM.scrollIntoViewIfNeeded'&&count===1){state.node=42;return missingNode(method);}}});
 assert.deepEqual(await receiptClick(f.cdp,selector),{x:50,y:42});assert.equal(f.count('DOM.getDocument'),2);
 assert.deepEqual(f.trace.filter(row=>row.method==='DOM.scrollIntoViewIfNeeded').map(row=>row.params.nodeId),[41,42]);
 assert.deepEqual(f.trace.filter(row=>row.method==='DOM.getContentQuads').map(row=>row.params.nodeId),[42]);oneNativeActivation(f);
});

test('a typed stale content quad obtains a fresh selector and repeats all pre-press checks',async()=>{
 const f=fixture({fault({method,count,state}){if(method==='DOM.getContentQuads'&&count===1){state.node=43;return missingNode(method,-32001,'No node with given id found');}}});
 await receiptClick(f.cdp,selector);assert.equal(f.count('DOM.getDocument'),2);assert.equal(f.count('Page.captureScreenshot'),2);
 assert.deepEqual(f.trace.filter(row=>row.method==='DOM.getContentQuads').map(row=>row.params.nodeId),[41,43]);oneNativeActivation(f);
});

test('a stale document query is reacquired, while a genuinely absent selector is not retried',async()=>{
 const f=fixture({fault({method,count}){if(method==='DOM.querySelector'&&count===1)return missingNode(method);}});
 await receiptClick(f.cdp,selector);assert.equal(f.count('DOM.getDocument'),2);oneNativeActivation(f);
 const absent=fixture({state:{node:0}});await assert.rejects(receiptClick(absent.cdp,selector),/native action target exists/);assert.equal(absent.count('DOM.getDocument'),1);noActivation(absent);
});

test('persistent typed staleness stops after eight fresh attempts without native press',async()=>{
 const failure=missingNode('DOM.scrollIntoViewIfNeeded'),f=fixture({fault:({method})=>method==='DOM.scrollIntoViewIfNeeded'?failure:null});
 await assert.rejects(receiptClick(f.cdp,selector),error=>error===failure);assert.equal(f.count('DOM.getDocument'),8);assert.equal(f.count('DOM.querySelector'),8);assert.equal(f.count('DOM.scrollIntoViewIfNeeded'),8);noActivation(f);
});

test('a replacement after screenshot repeats stability checks on the actual target before activating',async()=>{
 const f=fixture({screenshot(state,count){if(count===1)state.node=44;}});
 await receiptClick(f.cdp,selector);assert.equal(f.count('DOM.getDocument'),2);assert.equal(f.count('Page.captureScreenshot'),2);assert.equal(f.count('DOM.getContentQuads'),1);oneNativeActivation(f);
});

for(const [label,change,expected]of [['smaller',{height:20},/44px/],['hidden',{visible:false},/receiptAction/],['obscured',{unobscured:false},/sticky navigation/]])test(`a ${label} replacement cannot borrow the preceding target's successful layout checks`,async()=>{
 const f=fixture({screenshot(state,count){if(count===1){state.node=45;Object.assign(state.rect,change);}}});
 await assert.rejects(receiptClick(f.cdp,selector),expected);assert.equal(f.count('DOM.getDocument'),2);assert.equal(f.count('DOM.getContentQuads'),0);noActivation(f);
});

test('a target that is replaced on every screenshot fails within the same eight-attempt bound',async()=>{
 const f=fixture({screenshot(state){state.node++;}});await assert.rejects(receiptClick(f.cdp,selector),/native action target kept changing/);assert.equal(f.count('DOM.getDocument'),8);assert.equal(f.count('DOM.getContentQuads'),0);noActivation(f);
});

test('unrelated, untyped and incorrectly attributed protocol errors are never swallowed',async()=>{
 for(const [method,error]of [
  ['DOM.scrollIntoViewIfNeeded',Error('Could not find node with given id')],
  ['DOM.scrollIntoViewIfNeeded',missingNode('DOM.scrollIntoViewIfNeeded',-32602)],
  ['DOM.scrollIntoViewIfNeeded',receiptProtocolError('DOM.scrollIntoViewIfNeeded',{code:-32000,message:'Permission denied'})],
  ['DOM.getContentQuads',receiptProtocolError('DOM.getContentQuads',{code:-32000,message:'Could not compute content quads.'})],
  ['DOM.getDocument',missingNode('DOM.getDocument')],
  ['Page.captureScreenshot',missingNode('Page.captureScreenshot')],
  ['Runtime.evaluate',missingNode('Runtime.evaluate')],
 ]){
  const f=fixture({fault:row=>row.method===method?error:null});await assert.rejects(receiptClick(f.cdp,selector),value=>value===error);assert.equal(f.count(method),1,method);assert.ok(f.count('DOM.getDocument')<=1);noActivation(f);
 }
});

for(const [label,options,expected]of [
 ['hidden',{state:{rect:{height:44,visible:false,unobscured:true,stable:5}}},/receiptAction/],
 ['obscured',{state:{rect:{height:44,visible:true,unobscured:false,stable:5}}},/sticky navigation/],
 ['below 44px',{state:{rect:{height:43,visible:true,unobscured:true,stable:5}}},/44px/],
 ['unstable',{state:{rect:{height:44,visible:true,unobscured:true,stable:4}}},/settles/],
 ['wrong native hit',{measured:false},/native point belongs/],
 ['untrusted hover',{hover:{trusted:false,matches:true}},/trusted native hover/],
 ['hover outside selector',{hover:{trusted:true,matches:false}},/trusted native hover/],
 ['removed before press',{current:null},/native action target exists/],
 ['shrunk before press',{current:{visible:true,unobscured:true,height:20}},/44px/],
 ])test(`${label} still fails without any native press`,async()=>{
 const f=fixture(options);await assert.rejects(receiptClick(f.cdp,selector),expected);noActivation(f);assert.ok(f.count('DOM.getDocument')<=8);
});

for(const type of ['mousePressed','mouseReleased'])test(`failure at ${type} cannot repeat a native activation`,async()=>{
 const failure=receiptProtocolError('Input.dispatchMouseEvent',{code:-32000,message:'Could not find node with given id'}),f=fixture({fault:({method,params})=>method==='Input.dispatchMouseEvent'&&params.type===type?failure:null});
 await assert.rejects(receiptClick(f.cdp,selector),error=>error===failure);assert.equal(f.count('DOM.getDocument'),1);assert.equal(f.events('mousePressed').length,1);assert.equal(f.events('mouseReleased').length,type==='mouseReleased'?1:0);
});
