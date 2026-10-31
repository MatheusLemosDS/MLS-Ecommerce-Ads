import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForChromeDebugPort} from './chrome-debug-port.mjs';

function fixture({readyAt=0,contents='9222\n/devtools/browser/synthetic',exitAt=null,signalAt=null,timeoutMs=20000,pollMs=50}={}){
 let elapsed=0,reads=0;const waits=[],child={exitCode:null,signalCode:null,killed:false};
 const options={timeoutMs,pollMs,now:()=>elapsed,readFile:file=>{
  assert.equal(file,'/synthetic-profile/DevToolsActivePort');reads++;
  if(elapsed<readyAt)throw Error('ENOENT synthetic port file not ready');return contents;
 },sleep:async ms=>{waits.push(ms);elapsed+=ms;if(exitAt!==null&&elapsed>=exitAt)child.exitCode=1;if(signalAt!==null&&elapsed>=signalAt)child.signalCode='SIGTERM';}};
 return {child,options,get elapsed(){return elapsed;},get reads(){return reads;},waits};
}

test('Chrome startup can take more than six seconds without a restart or shortened readiness window',async()=>{
 const f=fixture({readyAt:7050});
 assert.equal(await waitForChromeDebugPort(f.child,'/synthetic-profile',f.options),9222);
 assert.equal(f.elapsed,7050);assert.ok(f.reads>120);assert.equal(f.waits.length,141);
});

test('missing readiness data expires at the monotonic twenty-second deadline without oversleeping',async()=>{
 const f=fixture({readyAt:21000,pollMs:70});
 await assert.rejects(waitForChromeDebugPort(f.child,'/synthetic-profile',f.options),{code:'CHROME_DEBUG_PORT_TIMEOUT'});
 assert.equal(f.elapsed,20000);assert.equal(f.waits.at(-1),50);assert.equal(f.reads,286);
});

test('an exited or signalled Chrome stops readiness polling immediately',async()=>{
 for(const options of [{exitAt:150},{signalAt:150}]){
  const f=fixture({readyAt:21000,...options});
  await assert.rejects(waitForChromeDebugPort(f.child,'/synthetic-profile',f.options),{code:'CHROME_DEBUG_PROCESS_EXITED'});
  assert.equal(f.elapsed,150);assert.equal(f.reads,3);
 }
 const f=fixture();f.child.exitCode=0;
 await assert.rejects(waitForChromeDebugPort(f.child,'/synthetic-profile',f.options),{code:'CHROME_DEBUG_PROCESS_EXITED'});assert.equal(f.reads,0);
});

test('only an integer TCP port from 1 through 65535 satisfies readiness',async()=>{
 for(const contents of ['0','-1','65536','1.5','NaN','',' 9222','0x2406','9222x','Infinity']){
  const f=fixture({contents,timeoutMs:100});
  await assert.rejects(waitForChromeDebugPort(f.child,'/synthetic-profile',f.options),{code:'CHROME_DEBUG_PORT_TIMEOUT'});
  assert.equal(f.elapsed,100);
 }
 for(const port of [1,65535]){
  const f=fixture({contents:port+'\n/devtools/browser/synthetic'});
  assert.equal(await waitForChromeDebugPort(f.child,'/synthetic-profile',f.options),port);assert.equal(f.elapsed,0);
 }
});

test('a clock moving backwards is rejected instead of extending the readiness deadline',async()=>{
 const f=fixture({readyAt:21000});let calls=0;f.options.now=()=>++calls===1?100:99;
 await assert.rejects(waitForChromeDebugPort(f.child,'/synthetic-profile',f.options),{code:'CHROME_DEBUG_PORT_CLOCK_INVALID'});assert.equal(f.reads,0);
});

test('a port file observed only after the deadline cannot report a successful startup',async()=>{
 const child={exitCode:null,signalCode:null};let elapsed=0;
 await assert.rejects(waitForChromeDebugPort(child,'/synthetic-profile',{
  now:()=>elapsed,readFile:()=>{elapsed=20001;return '9222\n/devtools/browser/synthetic';},sleep:async()=>assert.fail('the deadline has already elapsed'),
 }),{code:'CHROME_DEBUG_PORT_TIMEOUT'});
});
