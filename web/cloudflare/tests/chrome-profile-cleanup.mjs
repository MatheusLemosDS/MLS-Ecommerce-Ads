// Test-only process lifecycle: a killed Chromium can still write its profile.
import {rmSync} from 'node:fs';

export function createChromeProfileCleanup(child,profile){
 const closed=new Promise(resolve=>child.once('close',resolve));
 let cleanup;
 return socket=>cleanup??=(async()=>{
  try{socket?.close();}catch{}
  try{child.kill('SIGKILL');}catch{}
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('CHROME_SHUTDOWN_TIMEOUT')),5000);
   closed.then(()=>{clearTimeout(timeout);resolve();});
  });
  rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:50});
 })();
}
