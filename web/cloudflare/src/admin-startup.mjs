// This factory is embedded in the browser. Keep its helpers inside the factory
// so build-time renaming cannot capture a server-only closure.
export function createAdminStartup(options){
 const required=['loadSession','acceptSession','startPrimary','startSecondary','onState','onPrimaryFailure'];
 const optional=['onSecondaryFailure','canRetry','wait'];
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 if(!plain(options)||Reflect.ownKeys(options).some(key=>!required.includes(key)&&!optional.includes(key))||required.some(key=>!Object.hasOwn(options,key))||Reflect.ownKeys(options).some(key=>typeof Object.getOwnPropertyDescriptor(options,key)?.value!=='function'))throw TypeError('ADMIN_STARTUP_CONFIGURATION');
 const {loadSession,acceptSession,startPrimary,startSecondary,onState,onPrimaryFailure}=options;
 const onSecondaryFailure=options.onSecondaryFailure||(()=>{});
 const canRetry=options.canRetry||(()=>typeof document==='undefined'||document.hidden!==true);
 const wait=options.wait||(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 let phase='LOADING',attempt=0,pending=null,sessionReady=false,primaryStarted=false,secondaryStarted=false,stopped=false,generation=0,current=null;
 const getState=()=>({phase,attempt,pending:pending!==null,ready:phase==='READY',sessionReady,primaryStarted,secondaryStarted});
 const active=token=>!stopped&&current===token&&generation===token.generation;
 const emit=(callback,...args)=>{try{Promise.resolve(callback(...args)).catch(()=>{});}catch{}};
 const notify=error=>emit(onState,{...getState(),...(error===undefined?{}:{error})});
 const retryAllowed=()=>{try{return canRetry()===true;}catch{return false;}};
 const retryable=error=>{
  if(error===null||typeof error!=='object')return false;
  const code=Object.getOwnPropertyDescriptor(error,'code')?.value,status=Object.getOwnPropertyDescriptor(error,'status')?.value;
  const safeStatus=status===undefined||status===null||Number.isInteger(status)&&status>=200&&status<300;
  return ['ADMIN_API_NETWORK_ERROR','ADMIN_API_TIMEOUT'].includes(code)&&safeStatus;
 };
 const cancelled=Object.freeze({cancelled:true});
 // Cancellation only disconnects a read or the short retry delay. It never
 // repeats a write and never accepts a late session response after stop().
 const read=async(token,invoke)=>new Promise(resolve=>{
  if(!active(token)){resolve(cancelled);return;}
  let settled=false;
  const finish=result=>{if(settled)return;settled=true;token.cancel.delete(cancel);resolve(result);};
  const cancel=()=>finish(cancelled);token.cancel.add(cancel);
  Promise.resolve().then(()=>active(token)?invoke():cancelled).then(value=>finish(value===cancelled?cancelled:{value}),error=>finish({error}));
 });
 function failed(token,error){
  if(!active(token))return getState();
  phase='FAILED';pending=null;notify(error);return getState();
 }
 function launch(token,callback,failure){
  try{const result=callback();Promise.resolve(result).catch(error=>{if(active(token))emit(failure,error);});return null;}
  catch(error){return {error};}
 }
 async function run(token){
  let result=await read(token,loadSession);if(!active(token)||result===cancelled)return getState();
  if(Object.hasOwn(result,'error')){
   if(!retryable(result.error)||!retryAllowed())return failed(token,result.error);
   const firstError=result.error;attempt=2;phase='RETRYING';notify(firstError);
   const delayed=await read(token,()=>wait(750));if(!active(token)||delayed===cancelled)return getState();
   if(Object.hasOwn(delayed,'error'))return failed(token,delayed.error);
   if(!retryAllowed())return failed(token,firstError);
   result=await read(token,loadSession);if(!active(token)||result===cancelled)return getState();
   if(Object.hasOwn(result,'error'))return failed(token,result.error);
  }
  // Accepting the session is a separate critical validation step. Its failure
  // must never be mistaken for a retryable fetch failure.
  try{
   const accepted=acceptSession(result.value);
   if(accepted&&typeof accepted.then==='function'){
    const validation=await read(token,()=>accepted);if(!active(token)||validation===cancelled)return getState();
    if(Object.hasOwn(validation,'error'))return failed(token,validation.error);
   }
  }catch(error){return failed(token,error);}
  if(!active(token))return getState();
  sessionReady=true;primaryStarted=true;
  const primaryFailure=launch(token,startPrimary,onPrimaryFailure);
  if(!active(token))return getState();
  secondaryStarted=true;const secondaryFailure=launch(token,startSecondary,onSecondaryFailure);
  if(!active(token))return getState();
  phase='READY';pending=null;notify();
  if(primaryFailure)emit(onPrimaryFailure,primaryFailure.error);
  if(secondaryFailure&&active(token))emit(onSecondaryFailure,secondaryFailure.error);
  return getState();
 }
 function start(){
  if(stopped||phase==='READY')return Promise.resolve(getState());
  if(pending)return pending;
  const token={generation:++generation,cancel:new Set()};current=token;
  phase='LOADING';attempt=1;
  const work=Promise.resolve().then(()=>run(token)).catch(error=>failed(token,error));
  pending=work;notify();return work;
 }
 function stop(){
  if(stopped)return getState();
  stopped=true;generation++;phase='STOPPED';pending=null;
  if(current)for(const cancel of [...current.cancel])cancel();
  notify();return getState();
 }
 return Object.freeze({start,stop,getState});
}
