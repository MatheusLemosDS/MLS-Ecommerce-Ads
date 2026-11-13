// Embedded before operational controllers. This browser context pins a tab's
// requests and media; the server still authorizes every company/store/action.
export function createCommercialWorkspaceClient(environment=globalThis,options={}){
 const document=environment.document,node=document?.getElementById?.('mls-commercial-context');
 if(!node)return null;
 if(environment.mlsCommercialWorkspace)return environment.mlsCommercialWorkspace;
 const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value);
 const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
 const nativeFetch=environment.fetch?.bind(environment),RequestType=environment.Request??Request,HeadersType=environment.Headers??Headers,Controller=environment.AbortController??AbortController;
 const URLType=environment.URL??URL,origin=environment.location?.origin;
 const nativeTimeout=environment.setTimeout?.bind(environment),nativeInterval=environment.setInterval?.bind(environment),nativeClearTimeout=environment.clearTimeout?.bind(environment),nativeClearInterval=environment.clearInterval?.bind(environment);
 const nativeCreateURL=URLType.createObjectURL?.bind(URLType),nativeRevokeURL=URLType.revokeObjectURL?.bind(URLType);
 // Same contract as tenant-browser-storage. Keeping this tiny helper inside
 // the factory makes the emitted script independent of server module closures.
 const artworkDatabaseName=options.artworkDatabaseName??function tenantArtworkDatabaseName(context){
  if(context?.kind!=='account'||![context.userId,context.organizationId,context.storeId].every(id))throw Error('BROWSER_TENANT_CONTEXT_REQUIRED');
  return 'brazacommerce-dtf-artworks-v2:'+['mls-v2',context.userId,context.organizationId,context.storeId].map(encodeURIComponent).join(':');
 };
 const abortError=()=>{const error=Error('COMMERCIAL_WORKSPACE_CONTEXT_CHANGED');error.name='AbortError';return error;};
 let context=null,active=true,generation=1,channel=null,logoutPromise=null,reason=null;
 const requests=new Set(),timeouts=new Set(),intervals=new Set(),frames=new Set(),urls=new Set(),registrations=new Set(),roots=new Set(),readers=new Set(),streamControllers=new Set(),pendingResults=new Set(),cleanupErrors=[];
 try{
  const raw=JSON.parse(node.textContent),allowed=['kind','userId','organizationId','storeId','role','capabilities','csrf','namespace','allowedTabs'];
  if(!plain(raw)||Object.keys(raw).some(key=>!allowed.includes(key))||raw.kind!=='account'||![raw.userId,raw.organizationId,raw.storeId].every(id)||!['OWNER','ADMIN','FINANCE','OPERATIONS','VIEWER'].includes(raw.role)||!Array.isArray(raw.capabilities)||raw.capabilities.length>100||raw.capabilities.some(value=>typeof value!=='string'||!/^[a-z][a-z0-9_.:-]{1,79}$/.test(value))||typeof raw.csrf!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(raw.csrf)||typeof raw.namespace!=='string'||!/^mlst_[a-f0-9]{64}_$/.test(raw.namespace)||raw.allowedTabs!==undefined&&(!Array.isArray(raw.allowedTabs)||raw.allowedTabs.length>40||raw.allowedTabs.some(value=>typeof value!=='string'||!/^[-a-z0-9]{1,64}$/.test(value))))throw Error('context');
  context=Object.freeze({...raw,capabilities:Object.freeze([...new Set(raw.capabilities)]),allowedTabs:Object.freeze([...(raw.allowedTabs??[])])});
  artworkDatabaseName(context);
 }catch{active=false;reason='INVALID_CONTEXT';}
 node.textContent='';
 environment.mlsCommercialContext=context;
 const ticket=()=>Object.freeze({generation,namespace:context?.namespace??null});
 const isCurrent=value=>active&&context!==null&&value?.generation===generation&&value.namespace===context.namespace;
 const current=value=>{if(!isCurrent(value))throw abortError();};
 const waitCurrent=(work,epoch,signal)=>{
  current(epoch);if(signal?.aborted)return Promise.reject(abortError());
  return new Promise((resolve,reject)=>{
   const cleanup=()=>{pendingResults.delete(cancel);signal?.removeEventListener?.('abort',cancel);},cancel=()=>{cleanup();reject(abortError());};
   pendingResults.add(cancel);signal?.addEventListener?.('abort',cancel,{once:true});
   Promise.resolve(work).then(value=>{cleanup();try{current(epoch);if(signal?.aborted)throw abortError();resolve(value);}catch(error){reject(error);}},error=>{cleanup();reject(error);});
  });
 };
 const stopControllers=()=>{
  const names=['brazaMonthDashboard','brazaDayDashboard','brazaBankReconciliation','brazaOrderOperations','brazaWeeklyOperating','brazaProductionWorkspace','brazaIncurredProduction','brazaProductionConfirmationProposal','brazaProductionWeeklyClosing','brazaProductionCoverage','brazaProductionCostPeriods','brazaDtfWorkspace','brazaPhysicalReturns','brazaReturnManufacturingLinks','brazaExpenseLedger','brazaSavedCatalog','brazaCostRules','brazaReconciliation','brazaEscrowReleases','brazaFinancialCloseout','brazaIncomeOverview','brazaProductionDailyFinance','brazaAutomationWorkspace','mlsAiSalesWorkspace','mlsAgentLearning','mlsAgentPeriod','mlsWorkspaceSearch','mlsCommercialAccount','mlsAgentRegistry'];
  for(const name of names)try{environment[name]?.stop?.();}catch{cleanupErrors.push(name);}
  try{environment.mlsAgentRegistry?.reset?.();}catch{cleanupErrors.push('mlsAgentRegistry');}
 };
 function registerRoot(element){if(element?.replaceChildren){roots.add(element);if(!active)element.replaceChildren();}return()=>roots.delete(element);}
 function collectRoots(){for(const element of document.querySelectorAll?.('.app-shell,main,#missionGlobalSearch,.workspace-nav-mobile,[data-mls-private-root]')??[])registerRoot(element);}
 function applyAccessPresentation(){
  if(!active||!context)return;const allowed=new Set(context.allowedTabs),has=capability=>context.capabilities.includes(capability);
  for(const element of document.querySelectorAll?.('[data-tab],[data-workspace-tab],[data-mission-open],a[href]')??[]){
   let tab=element.dataset?.workspaceTab??element.dataset?.tab??element.dataset?.missionOpen;
   if(!tab&&element.getAttribute?.('href'))try{const target=new URLType(element.getAttribute('href'),environment.location.href);if(target.origin===origin&&target.pathname==='/admin')tab=target.searchParams.get('tab');}catch{}
   if(tab==='hermes')tab='agent-hermes';if(tab&&!allowed.has(tab)){element.hidden=true;element.setAttribute?.('aria-disabled','true');element.setAttribute?.('tabindex','-1');}
  }
  const restricted=!has('finance.read')?['Net','Sales','Margin','Paid']:[];if(!has('ads.read'))restricted.push('Ads','Roas');
  for(const name of restricted){const value=document.getElementById?.('commandCenter'+name);if(value){value.textContent='Acesso restrito';value.setAttribute?.('data-access','restricted');value.setAttribute?.('aria-label','Seu papel não permite esta leitura neste contexto.');}}
 }
 collectRoots();
 function notice(){
  if(!document.createElement||!document.body)return;
  const old=document.getElementById?.('mlsCommercialSessionNotice');old?.remove?.();
  const panel=document.createElement('section');panel.id='mlsCommercialSessionNotice';panel.className='card';panel.setAttribute('role','alert');panel.setAttribute('tabindex','-1');
  const heading=document.createElement('h1');heading.textContent='Confirme seu acesso';
  const text=document.createElement('p');text.textContent=reason==='LOGOUT'?'A sessão foi encerrada. Entre novamente para continuar.':reason==='LOGOUT_UNCERTAIN'?'Não foi possível confirmar a saída. Os dados desta aba foram removidos; entre novamente para conferir o acesso.':'O acesso mudou ou não está disponível. Os dados desta aba foram removidos.';
  const link=document.createElement('a');link.href='/account/login';link.textContent='Entrar novamente';panel.append(heading,text,link);document.body.prepend?.(panel);panel.focus?.();
 }
 function stop(nextReason='CONTEXT_CHANGED'){
  if(!active&&reason!==null){notice();return false;}
  active=false;reason=nextReason;generation++;
  for(const cancel of pendingResults)cancel();pendingResults.clear();
  for(const controller of requests)controller.abort();requests.clear();
  for(const controller of streamControllers)try{controller.error(abortError());}catch{}streamControllers.clear();
  for(const reader of readers)try{Promise.resolve(reader.cancel()).catch(()=>{});}catch{}readers.clear();
  for(const id of timeouts)nativeClearTimeout?.(id);timeouts.clear();for(const id of intervals)nativeClearInterval?.(id);intervals.clear();
  for(const id of frames)environment.cancelAnimationFrame?.(id);frames.clear();
  stopControllers();
  for(const registration of registrations){try{registration.stop?.();}catch{cleanupErrors.push('registered.stop');}try{registration.clear?.();}catch{cleanupErrors.push('registered.clear');}}
  for(const url of [...urls])try{nativeRevokeURL?.(url);}catch{}urls.clear();
  collectRoots();for(const root of roots)try{root.replaceChildren();}catch{cleanupErrors.push('root');}
  environment.mlsCommercialContext=null;notice();return true;
 }
 function register(registration={}){
  if(!plain(registration))throw Error('COMMERCIAL_WORKSPACE_REGISTRATION_INVALID');
  registrations.add(registration);if(registration.root)registerRoot(registration.root);
  if(!active){try{registration.stop?.();}catch{cleanupErrors.push('registered.stop');}try{registration.clear?.();}catch{cleanupErrors.push('registered.clear');}}
  return()=>registrations.delete(registration);
 }
 // Legacy panel routing can replace an /admin URL without reinitializing its
 // controllers. A different explicit company/store needs a fresh server page.
 document.addEventListener?.('click',event=>{
  if(!active||!context||event.defaultPrevented||event.button>0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target?.closest?.('a[href]');
  if(!link||link.target==='_blank'||link.hasAttribute?.('download'))return;
  let target;try{target=new URLType(link.getAttribute('href'),environment.location.href);}catch{return;}
  if(target.origin!==origin||target.pathname!=='/admin')return;
  const changed=(key,value)=>{const values=target.searchParams.getAll(key);return values.length>0&&(values.length!==1||values[0]!==value);};
  if(!changed('company',context.organizationId)&&!changed('store',context.storeId))return;
  event.preventDefault();event.stopImmediatePropagation();stop('CONTEXT_CHANGED');
  environment.location.assign(target.href);
 },true);
 function wrapResponse(response,epoch,signal,release){
  let bodyProxy=null;
  function guardedReader(reader){
   readers.add(reader);
   return new Proxy(reader,{get(target,key){
    if(key==='read')return async(...args)=>{current(epoch);return waitCurrent(target.read(...args),epoch,signal);};
    if(key==='cancel')return async(...args)=>{try{return await target.cancel(...args);}finally{readers.delete(target);}};
    if(key==='releaseLock')return()=>{readers.delete(target);return target.releaseLock();};
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
   }});
  }
  function guardedStream(source){
   const StreamType=environment.ReadableStream??ReadableStream;let reader=null,streamController=null;
   const adapter=new StreamType({start(controller){streamController=controller;streamControllers.add(controller);},async pull(controller){
    try{current(epoch);if(!reader){reader=source.getReader();readers.add(reader);}const part=await waitCurrent(reader.read(),epoch,signal);current(epoch);if(part.done){readers.delete(reader);streamControllers.delete(controller);release();controller.close();}else controller.enqueue(part.value);}
    catch(error){try{Promise.resolve(reader?.cancel()).catch(()=>{});}catch{}if(reader)readers.delete(reader);streamControllers.delete(controller);release();controller.error(error);}
   },async cancel(value){try{if(reader)await reader.cancel(value);else await source.cancel(value);}finally{if(reader)readers.delete(reader);streamControllers.delete(streamController);release();}}},{highWaterMark:0});
   return new Proxy(adapter,{get(target,key){
    if(key==='getReader')return(...args)=>{current(epoch);return guardedReader(target.getReader(...args));};
    if(key==='tee')return()=>{current(epoch);return target.tee().map(guardedStream);};
    if(key==='pipeThrough')return(...args)=>{current(epoch);return guardedStream(target.pipeThrough(...args));};
    if(key==='pipeTo')return(...args)=>{current(epoch);return waitCurrent(target.pipeTo(...args),epoch,signal);};
    if(key==='values'||key===Symbol.asyncIterator)return(...args)=>{
     current(epoch);const iterator=target[key](...args),wrapped={next:(...values)=>{current(epoch);return waitCurrent(iterator.next(...values),epoch,signal);},return:(...values)=>iterator.return(...values),[Symbol.asyncIterator](){return this;}};return wrapped;
    };
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
   }});
  }
  return new Proxy(response,{get(target,key){
   if(['json','text','arrayBuffer','blob','formData','bytes'].includes(key)&&typeof target[key]==='function')return async(...args)=>{current(epoch);try{return await waitCurrent(target[key](...args),epoch,signal);}finally{release();}};
   if(key==='clone')return()=>{current(epoch);return wrapResponse(target.clone(),epoch,signal,release);};
   if(key==='body'){if(!target.body)return null;if(!bodyProxy)bodyProxy=guardedStream(target.body);return bodyProxy;}
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
 }
 if(typeof nativeFetch==='function')environment.fetch=async(input,init)=>{
  let url;try{url=new URLType(typeof input==='string'||input instanceof URLType?String(input):input.url,environment.location.href);}catch{return nativeFetch(input,init);}
  if(url.origin!==origin||!(url.pathname==='/api/admin'||url.pathname.startsWith('/api/admin/')))return nativeFetch(input,init);
  const epoch=ticket();current(epoch);const original=new RequestType(input instanceof RequestType?input:url.href,init),headers=new HeadersType(original.headers),controller=new Controller();
  headers.set('x-mls-company',context.organizationId);headers.set('x-mls-store',context.storeId);if(!['GET','HEAD'].includes(original.method))headers.set('x-csrf-token',context.csrf);
  const abort=()=>controller.abort();if(original.signal?.aborted)controller.abort();else original.signal?.addEventListener?.('abort',abort,{once:true});requests.add(controller);
  const release=()=>{requests.delete(controller);original.signal?.removeEventListener?.('abort',abort);};
  try{
   const work=Promise.resolve(nativeFetch(new RequestType(original,{headers,credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal}))).then(response=>{if(!isCurrent(epoch)){try{Promise.resolve(response.body?.cancel()).catch(()=>{});}catch{}throw abortError();}return response;});
   const response=await waitCurrent(work,epoch,controller.signal);current(epoch);if(response.status===401){stop('SESSION_EXPIRED');throw abortError();}if(!response.body)release();return wrapResponse(response,epoch,controller.signal,release);
  }catch(error){release();throw error;}
 };
 if(nativeTimeout&&nativeClearTimeout)environment.setTimeout=(callback,delay,...args)=>{if(!active)return 0;const epoch=ticket();let id;id=nativeTimeout(()=>{timeouts.delete(id);if(isCurrent(epoch))callback(...args);},delay);timeouts.add(id);return id;};
 if(nativeClearTimeout)environment.clearTimeout=id=>{timeouts.delete(id);nativeClearTimeout(id);};
 if(nativeInterval&&nativeClearInterval)environment.setInterval=(callback,delay,...args)=>{if(!active)return 0;const epoch=ticket(),id=nativeInterval(()=>{if(isCurrent(epoch))callback(...args);},delay);intervals.add(id);return id;};
 if(nativeClearInterval)environment.clearInterval=id=>{intervals.delete(id);nativeClearInterval(id);};
 const nativeFrame=environment.requestAnimationFrame?.bind(environment);
 if(nativeFrame)environment.requestAnimationFrame=callback=>{if(!active)return 0;const epoch=ticket();let id;id=nativeFrame(value=>{frames.delete(id);if(isCurrent(epoch))callback(value);});frames.add(id);return id;};
 if(nativeCreateURL)URLType.createObjectURL=blob=>{current(ticket());const url=nativeCreateURL(blob);urls.add(url);return url;};
 if(nativeRevokeURL)URLType.revokeObjectURL=url=>{urls.delete(url);return nativeRevokeURL(url);};
 function announce(type){try{channel?.postMessage({type});}catch{}}
 async function logout(){
  if(logoutPromise)return logoutPromise;
  logoutPromise=(async()=>{
   if(!active||!context||typeof nativeFetch!=='function')return false;
   const epoch=ticket(),controller=new Controller(),timer=nativeTimeout?.(()=>controller.abort(),15000);
   try{
    const response=await waitCurrent(nativeFetch(new RequestType(origin+'/api/account/logout',{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal,headers:{'content-type':'application/json',accept:'application/json','x-csrf-token':context.csrf},body:'{}'})),epoch,controller.signal),value=await waitCurrent(response.json(),epoch,controller.signal);
    if(!response.ok||value?.logged_out!==true)throw Error('logout');announce('LOGOUT');stop('LOGOUT');return true;
   }catch{announce('LOCKED');stop('LOGOUT_UNCERTAIN');return false;}
   finally{if(timer!==undefined)nativeClearTimeout?.(timer);}
  })();try{return await logoutPromise;}finally{logoutPromise=null;}
 }
 try{channel=new environment.BroadcastChannel('mls-auth-lifecycle-v1');channel.onmessage=event=>{if(['LOGIN','LOGOUT','LOCKED'].includes(event.data?.type))stop(event.data.type==='LOGOUT'?'LOGOUT':'CONTEXT_CHANGED');};}catch{}
 environment.addEventListener?.('pagehide',()=>stop('PAGE_HIDDEN'));
 environment.addEventListener?.('pageshow',event=>{if(event.persisted)stop('CONTEXT_CHANGED');});
 const ready=()=>{collectRoots();if(active)applyAccessPresentation();else{for(const root of roots)root.replaceChildren();notice();}};
 if(document.readyState==='loading')document.addEventListener?.('DOMContentLoaded',ready,{once:true});else ready();
 const client=Object.freeze({getContext:()=>active?context:null,isActive:()=>active,ticket,isCurrent,artworkDatabaseName:()=>{current(ticket());return artworkDatabaseName(context);},register,registerRoot,stop,logout,getState:()=>({active,generation,reason,pending:requests.size,cleanupErrors:[...cleanupErrors]})});
 environment.mlsCommercialWorkspace=client;
 if(!active){for(const root of roots)root.replaceChildren();environment.mlsCommercialContext=null;notice();}
 return client;
}

export const COMMERCIAL_WORKSPACE_CLIENT=String.raw`;(${createCommercialWorkspaceClient.toString()})(globalThis);`;
