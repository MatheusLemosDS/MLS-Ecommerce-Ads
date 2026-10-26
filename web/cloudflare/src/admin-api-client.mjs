// This factory is embedded into the owner page. Keep helpers local so bundling
// cannot capture a server closure or rename a dependency in the browser source.
export function createAdminApiClient(options={}){
 const monthlyContract='business-month-v2',monthlyViewContract='business-month-view-v3';
 const messages={ADMIN_API_NETWORK_ERROR:'Não foi possível conectar ao painel. Verifique sua conexão e tente novamente.',ADMIN_API_TIMEOUT:'A consulta demorou mais que o esperado. Tente novamente.',ADMIN_API_RESPONSE_INVALID:'Não foi possível conferir a resposta do painel. Tente novamente.',ADMIN_API_HTTP_ERROR:'Não foi possível concluir a consulta ao painel. Tente novamente.'};
 const error=(code,status=null,apiCode=null)=>Object.assign(new Error(messages[code]),{code,status,apiCode});
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const dataKeys=(value,allowed)=>plain(value)&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&allowed.includes(key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
 if(!dataKeys(options,['fetchImpl','getCsrf','setTimeoutImpl','clearTimeoutImpl','AbortControllerImpl']))throw error('ADMIN_API_RESPONSE_INVALID');
 const fetchImpl=options.fetchImpl??((...args)=>fetch(...args)),getCsrf=options.getCsrf??(()=>''),setTimer=options.setTimeoutImpl??((...args)=>setTimeout(...args)),clearTimer=options.clearTimeoutImpl??(id=>clearTimeout(id)),Controller=options.AbortControllerImpl??AbortController;
 if([fetchImpl,getCsrf,setTimer,clearTimer,Controller].some(value=>typeof value!=='function'))throw error('ADMIN_API_RESPONSE_INVALID');
 return async function request(path,body,requestOptions={}){
  if(typeof path!=='string'||path.length>4096||!/^([a-z][a-z0-9-]*)(\/[a-z0-9-]+)*(\?[^\s#]*)?$/.test(path)||path.includes('..')||path.includes('://')||/[\u0000-\u001f\u007f]/.test(path)||!dataKeys(requestOptions,['timeoutMs']))throw error('ADMIN_API_RESPONSE_INVALID');
  const post=body!==undefined,timeoutMs=requestOptions.timeoutMs??(post?90000:45000);
  if(!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>120000)throw error('ADMIN_API_RESPONSE_INVALID');
  let serialized,csrf;
  try{
   if(post){serialized=JSON.stringify(body);csrf=getCsrf();if(serialized===undefined||typeof csrf!=='string'||csrf.length>4096||/[\u0000-\u001f\u007f]/.test(csrf))throw Error();}
  }catch{throw error('ADMIN_API_RESPONSE_INVALID');}
  const headers=post?{'Accept':'application/json','Content-Type':'application/json','X-CSRF-Token':csrf}:{'Accept':'application/json'};
  if(path==='finance/business-month'||path.startsWith('finance/business-month?'))headers['X-Braza-Client-Contract']=monthlyContract;
  if(path==='finance/business-month-view'||path.startsWith('finance/business-month-view?'))headers['X-Braza-Client-Contract']=monthlyViewContract;
  let controller;try{controller=new Controller();if(!controller.signal||typeof controller.abort!=='function')throw Error();}catch{throw error('ADMIN_API_RESPONSE_INVALID');}
  let timer=null,expired=false,response=null,responseStatus=null;
  const deadline=new Promise((resolve,reject)=>{
   timer=setTimer(()=>{
    expired=true;
    try{controller.abort();}catch{}
    // Native fetch aborts a pending body read. Some clients ignore the signal;
    // the deadline still settles this call and no request is replayed.
    try{const cancellation=response?.body?.cancel?.();if(cancellation&&typeof cancellation.catch==='function')cancellation.catch(()=>{});}catch{}
    reject(error('ADMIN_API_TIMEOUT',responseStatus));
   },timeoutMs);
  });
  const work=async()=>{
   if(expired)throw error('ADMIN_API_TIMEOUT',responseStatus);
   try{response=await fetchImpl('/api/admin/'+path,{method:post?'POST':'GET',headers,credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal,...(post?{body:serialized}:{})});}
   catch{throw error(expired?'ADMIN_API_TIMEOUT':'ADMIN_API_NETWORK_ERROR',responseStatus);}
   if(expired)throw error('ADMIN_API_TIMEOUT',responseStatus);
   if(!response||typeof response.json!=='function'||typeof response.ok!=='boolean'||!Number.isInteger(response.status)||response.status<100||response.status>599)throw error('ADMIN_API_RESPONSE_INVALID');
   responseStatus=response.status;
   let value;
   try{value=await response.json();}
   catch(failure){
    if(expired)throw error('ADMIN_API_TIMEOUT',responseStatus);
    if(!response.ok)throw error('ADMIN_API_HTTP_ERROR',responseStatus);
    throw error(failure instanceof TypeError?'ADMIN_API_NETWORK_ERROR':'ADMIN_API_RESPONSE_INVALID',failure instanceof TypeError?null:responseStatus);
   }
   if(expired)throw error('ADMIN_API_TIMEOUT',responseStatus);
   if(!response.ok){
    const descriptor=plain(value)?Object.getOwnPropertyDescriptor(value,'error'):null,code=descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:null;
    throw error('ADMIN_API_HTTP_ERROR',responseStatus,typeof code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(code)?code:null);
   }
   if(value===null||typeof value!=='object')throw error('ADMIN_API_RESPONSE_INVALID',responseStatus);
   return value;
  };
  try{return await Promise.race([work(),deadline]);}
  finally{if(timer!==null)clearTimer(timer);}
 };
}
