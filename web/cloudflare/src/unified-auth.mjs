// One entry page, with separate signed owner and read-only review privileges.
// Existing cookie signatures remain valid; no passwords or tokens are stored.
const workspaceAuthLifetime=28800;
const workspaceAuthEncoder=new TextEncoder();
export class WorkspaceAuthError extends Error {
 constructor(code,status=400){super(code);this.status=status;}
}
function workspaceAuthAssert(condition,code,status=400){if(!condition)throw new WorkspaceAuthError(code,status);}
function workspaceAuthConfigured(value,minimum=1){return typeof value==='string'&&value.length>=minimum;}
function workspaceAuthTime(now){const clock=now();workspaceAuthAssert(Number.isSafeInteger(clock)&&clock>0,'AUTH_UNAVAILABLE',503);return Math.floor(clock/1000);}
function workspaceAuthBase64(bytes){let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function workspaceAuthPayload(value){return workspaceAuthBase64(workspaceAuthEncoder.encode(JSON.stringify(value)));}
function workspaceAuthDecode(value){const bytes=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0));return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
async function workspaceAuthHmac(value,secret,hex=false){const key=await crypto.subtle.importKey('raw',workspaceAuthEncoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,workspaceAuthEncoder.encode(value)));return hex?[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join(''):workspaceAuthBase64(bytes);}
async function workspaceAuthEqual(left,right){if(typeof left!=='string'||typeof right!=='string')return false;const [a,b]=await Promise.all([left,right].map(value=>crypto.subtle.digest('SHA-256',workspaceAuthEncoder.encode(value))));const x=new Uint8Array(a),y=new Uint8Array(b);let difference=0;for(let index=0;index<x.length;index++)difference|=x[index]^y[index];return difference===0;}
function workspaceAuthCookie(request,name){const matches=[...(request.headers.get('cookie')||'').matchAll(new RegExp('(?:^|;\\s*)'+name+'=([^;]*)','g'))];return matches.length===1&&matches[0][1].length<=4096?matches[0][1]:null;}
function workspaceAuthExact(value,keys){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
function workspaceAuthExpiry(value,stamp){return Number.isSafeInteger(value)&&value>stamp&&value<=stamp+workspaceAuthLifetime;}
function workspaceAuthRedirect(path,headers){return new Response(null,{status:303,headers:{location:path,'cache-control':'no-store',...headers}});}
function workspaceAuthJson(code,status){return new Response(JSON.stringify({error:code}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});}
function workspaceAuthClear(headers,name){headers.append('set-cookie',name+'=; Path=/; HttpOnly; Secure; SameSite='+(name==='braza_admin'?'Strict':'Lax')+'; Max-Age=0');}
async function workspaceAuthBody(request){
 const declared=request.headers.get('content-length');workspaceAuthAssert(declared===null||/^\d+$/.test(declared)&&Number(declared)<=4096,'BODY_TOO_LARGE',413);
 const reader=request.body?.getReader();workspaceAuthAssert(reader,'BODY_REQUIRED');const chunks=[];let length=0;
 try{while(true){const chunk=await reader.read();if(chunk.done)break;workspaceAuthAssert(chunk.value instanceof Uint8Array,'BODY_INVALID');length+=chunk.value.byteLength;workspaceAuthAssert(length<=4096,'BODY_TOO_LARGE',413);chunks.push(chunk.value);}}
 finally{try{await reader.cancel();}catch{}}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let raw;try{raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new WorkspaceAuthError('BODY_INVALID');}
 return new URLSearchParams(raw);
}
function workspaceAuthOrigin(request){workspaceAuthAssert(request.headers.get('origin')===new URL(request.url).origin,'ORIGIN_REJECTED',403);}

export async function readOwnerSession(request,env,{requireSetup=false,now=()=>Date.now()}={}){
 if(!workspaceAuthConfigured(env?.ADMIN_SESSION_SECRET,32)){if(requireSetup)throw new WorkspaceAuthError('ADMIN_SESSION_SETUP_REQUIRED',503);return null;}
 const token=workspaceAuthCookie(request,'braza_admin');if(!token||!/^([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/.test(token))return null;
 try{
  const [payload,signature]=token.split('.');if(!await workspaceAuthEqual(signature,await workspaceAuthHmac('admin:'+payload,env.ADMIN_SESSION_SECRET,true)))return null;
  const data=workspaceAuthDecode(payload),stamp=workspaceAuthTime(now);
  if(!workspaceAuthExact(data,['role','user','exp','nonce'])||data.role!=='admin'||data.user!=='admin'||!workspaceAuthExpiry(data.exp,stamp)||typeof data.nonce!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(data.nonce))return null;
  return {role:'owner',token,user:'admin',csrf:await workspaceAuthHmac('csrf:'+token,env.ADMIN_SESSION_SECRET,true)};
 }catch{return null;}
}

export async function readWorkspaceSession(request,env,options={}){
 const owner=await readOwnerSession(request,env,options);if(owner)return owner;
 if(!workspaceAuthConfigured(env?.SESSION_SECRET,32)||!workspaceAuthConfigured(env?.REVIEW_USERNAME))return null;
 const token=workspaceAuthCookie(request,'mls_session');if(!token||!/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.test(token))return null;
 try{
  const [payload,signature]=token.split('.');if(!await workspaceAuthEqual(signature,await workspaceAuthHmac(payload,env.SESSION_SECRET)))return null;
  const data=workspaceAuthDecode(payload),stamp=workspaceAuthTime(options.now||(()=>Date.now()));
  if(!workspaceAuthExact(data,['user','exp'])||data.user!==env.REVIEW_USERNAME||!workspaceAuthExpiry(data.exp,stamp))return null;
  return {role:'review',token,user:data.user,csrf:await workspaceAuthHmac('csrf:review:'+token,env.SESSION_SECRET,true)};
 }catch{return null;}
}

function workspaceAuthDefaultLogout(current){
 return new Response('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sair · BrazaCommerce</title></head><body><main><h1>Sair da sua conta?</h1><p>Você precisará entrar novamente para acessar o painel.</p><form action="/logout" method="post"><input type="hidden" name="csrf" value="'+current.csrf+'"><button type="submit">Sair</button></form><p><a href="'+(current.role==='owner'?'/admin':'/dashboard')+'">Continuar no painel</a></p></main></body></html>',{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'x-content-type-options':'nosniff','x-frame-options':'DENY'}});
}

export async function handleWorkspaceAuth(request,env,{renderLogin,renderLogout,now=()=>Date.now()}={}){
 const url=new URL(request.url),path=url.pathname;if(!['/','/login','/admin/login','/logout','/admin/logout'].includes(path))return null;
 try{
  workspaceAuthAssert(!url.search,'AUTH_REQUEST_INVALID');
  if(path==='/logout'||path==='/admin/logout'){
   const current=path==='/admin/logout'?await readOwnerSession(request,env,{requireSetup:true,now}):await readWorkspaceSession(request,env,{now});
   if(request.method==='GET'&&path==='/logout')return current?(renderLogout?renderLogout(current):workspaceAuthDefaultLogout(current)):workspaceAuthRedirect('/login');
   workspaceAuthAssert(request.method==='POST','METHOD_NOT_ALLOWED',405);workspaceAuthOrigin(request);workspaceAuthAssert(current,'UNAUTHORIZED',401);
   let csrf=request.headers.get('x-csrf-token')||'';
   if(!csrf&&(request.headers.get('content-type')||'').split(';')[0]==='application/x-www-form-urlencoded'){const form=await workspaceAuthBody(request);workspaceAuthAssert(form.getAll('csrf').length===1,'CSRF_REJECTED',403);csrf=form.get('csrf');}
   workspaceAuthAssert(await workspaceAuthEqual(csrf,current.csrf),'CSRF_REJECTED',403);
   const headers=new Headers({'cache-control':'no-store'});workspaceAuthClear(headers,'braza_admin');workspaceAuthClear(headers,'mls_session');
   if(path==='/admin/logout')return new Response(null,{status:204,headers});headers.set('location','/login');return new Response(null,{status:303,headers});
  }
  if(request.method==='GET'){
   const current=await readWorkspaceSession(request,env,{now});if(current)return workspaceAuthRedirect(current.role==='owner'?'/admin?tab=overview':'/dashboard');
   if(path!=='/login')return workspaceAuthRedirect('/login');
   workspaceAuthAssert(typeof renderLogin==='function','AUTH_UNAVAILABLE',503);return renderLogin('');
  }
  workspaceAuthAssert(path!=='/'&&request.method==='POST','METHOD_NOT_ALLOWED',405);workspaceAuthOrigin(request);
  workspaceAuthAssert((request.headers.get('content-type')||'').split(';')[0]==='application/x-www-form-urlencoded','FORM_REQUIRED',415);
  const form=await workspaceAuthBody(request);workspaceAuthAssert(form.getAll('username').length===1&&form.getAll('password').length===1&&[...form.keys()].every(key=>['username','password'].includes(key)),'AUTH_REQUEST_INVALID');
  const username=form.get('username'),password=form.get('password');workspaceAuthAssert(username.length<=100&&password.length<=200,'AUTH_REQUEST_INVALID');
  const ownerReady=workspaceAuthConfigured(env?.ADMIN_USERNAME)&&workspaceAuthConfigured(env?.ADMIN_PASSWORD,16)&&workspaceAuthConfigured(env?.ADMIN_SESSION_SECRET,32);
  const reviewReady=workspaceAuthConfigured(env?.REVIEW_USERNAME)&&workspaceAuthConfigured(env?.REVIEW_PASSWORD)&&workspaceAuthConfigured(env?.SESSION_SECRET,32);
  workspaceAuthAssert(ownerReady||reviewReady,'ADMIN_CREDENTIALS_SETUP_REQUIRED',503);
  const [ownerUser,ownerPass,reviewUser,reviewPass]=await Promise.all([workspaceAuthEqual(username,ownerReady?env.ADMIN_USERNAME:''),workspaceAuthEqual(password,ownerReady?env.ADMIN_PASSWORD:''),workspaceAuthEqual(username,reviewReady?env.REVIEW_USERNAME:''),workspaceAuthEqual(password,reviewReady?env.REVIEW_PASSWORD:'')]);
  const owner=ownerReady&&ownerUser&&ownerPass,review=reviewReady&&reviewUser&&reviewPass;
  if(!owner&&!review){workspaceAuthAssert(typeof renderLogin==='function','AUTH_UNAVAILABLE',503);const response=renderLogin('denied');return new Response(response.body,{status:401,headers:response.headers});}
  const stamp=workspaceAuthTime(now),payload=workspaceAuthPayload(owner?{role:'admin',user:'admin',exp:stamp+workspaceAuthLifetime,nonce:crypto.randomUUID()}:{user:env.REVIEW_USERNAME,exp:stamp+workspaceAuthLifetime});
  const token=payload+'.'+await workspaceAuthHmac(owner?'admin:'+payload:payload,owner?env.ADMIN_SESSION_SECRET:env.SESSION_SECRET,owner);
  const headers=new Headers({location:owner?'/admin?tab=overview':'/dashboard','cache-control':'no-store'});
  headers.append('set-cookie',(owner?'braza_admin':'mls_session')+'='+token+'; Path=/; HttpOnly; Secure; SameSite='+(owner?'Strict':'Lax')+'; Max-Age=28800');workspaceAuthClear(headers,owner?'mls_session':'braza_admin');
  return new Response(null,{status:303,headers});
 }catch(error){return workspaceAuthJson(error instanceof WorkspaceAuthError?error.message:'AUTH_UNAVAILABLE',error instanceof WorkspaceAuthError?error.status:503);}
}
