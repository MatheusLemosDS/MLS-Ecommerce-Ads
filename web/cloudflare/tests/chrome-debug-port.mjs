import {readFileSync} from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';

const failure=code=>Object.assign(new Error(code),{code});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Wait for this Chrome process, without restarting it or assuming each polling
// iteration takes exactly 50 ms. Busy CI runners can legitimately need >6 s.
export async function waitForChromeDebugPort(child,profile,{
 timeoutMs=20000,pollMs=50,now=()=>performance.now(),readFile=file=>readFileSync(file,'utf8'),sleep=wait,
}={}){
 if(!child||typeof profile!=='string'||!profile||!Number.isFinite(timeoutMs)||timeoutMs<=0||timeoutMs>20000||!Number.isFinite(pollMs)||pollMs<=0||pollMs>timeoutMs||typeof now!=='function'||typeof readFile!=='function'||typeof sleep!=='function')throw failure('CHROME_DEBUG_PORT_OPTIONS_INVALID');
 const started=now();if(!Number.isFinite(started))throw failure('CHROME_DEBUG_PORT_CLOCK_INVALID');
 const deadline=started+timeoutMs,filename=path.join(profile,'DevToolsActivePort');let last=started;
 const time=()=>{const value=now();if(!Number.isFinite(value)||value<last)throw failure('CHROME_DEBUG_PORT_CLOCK_INVALID');last=value;return value;};
 const alive=()=>{
  if(child.exitCode!==null&&child.exitCode!==undefined||child.signalCode!==null&&child.signalCode!==undefined||child.killed===true)throw failure('CHROME_DEBUG_PROCESS_EXITED');
 };
 while(time()<deadline){
  alive();
  let text;try{text=readFile(filename);}catch{}
  if(typeof text==='string'){
   const line=text.split('\n',1)[0];
   if(/^[1-9][0-9]{0,4}$/.test(line)){
    const port=Number(line);if(port<=65535){alive();if(time()<deadline)return port;}
   }
  }
  const remaining=deadline-time();if(remaining<=0)break;
  await sleep(Math.min(pollMs,remaining));
 }
 alive();throw failure('CHROME_DEBUG_PORT_TIMEOUT');
}
