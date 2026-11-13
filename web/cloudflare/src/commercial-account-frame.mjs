// Versioned, bounded App -> Auth account transport. It never carries provider
// credentials, browser-selected roles, or a request-selected destination host.
export const ACCOUNT_BRIDGE_PATH='/internal/accounts/bridge-v1';
export const ACCOUNT_BRIDGE_REQUEST_LIMIT=98304;
export const ACCOUNT_BRIDGE_BODY_LIMIT=65536;
export const ACCOUNT_BRIDGE_RESPONSE_LIMIT=2097152;
const accountBridgeOrigin='https://app.brazacommerce.com.br';
const accountBridgeHeaders=new Set(['cookie','origin','content-type','x-csrf-token','user-agent','cf-connecting-ip']);
const accountBridgeResponseHeaders=new Set(['content-type','cache-control','referrer-policy','x-content-type-options','x-frame-options','content-security-policy','set-cookie','location','retry-after']);
const accountBridgePlain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const accountBridgeExact=(v,keys)=>accountBridgePlain(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const accountBridgeBytes=v=>new TextEncoder().encode(v).byteLength;
function accountBridgeValidOrigin(value,{local=false}={}){
 if(value===accountBridgeOrigin)return true;
 if(!local||typeof value!=='string')return false;
 try{const url=new URL(value);return url.origin===value&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname);}catch{return false;}
}
export function isCommercialAccountPath(path){
 if(typeof path!=='string'||path.length>2048||!/^\/[A-Za-z0-9/_-]*$/.test(path))return false;
 return /^\/api\/(?:account|companies|stores)(?:\/[A-Za-z0-9_-]+)*$/.test(path)||
  ['/register','/verify-email','/forgot-password','/reset-password','/invitations/accept','/companies','/companies/new','/onboarding','/help'].includes(path)||
  /^\/account\/(?:login|register|profile|security|sessions|preferences|data|help|notifications)(?:\/events)?$/.test(path)||
  /^\/companies\/[A-Za-z0-9_-]+\/(?:settings|team|stores|billing|audit|data|onboarding)$/.test(path)||
  /^\/stores\/[A-Za-z0-9_-]+\/connections$/.test(path);
}
export function projectAccountBridgeRequest(value,options={}){
 if(!accountBridgeExact(value,['schema','operation','origin','path','method','headers','body','selection'])||value.schema!=='mls_account_bridge_request_v1'||!['forward','resolve'].includes(value.operation)||!accountBridgeValidOrigin(value.origin,options))return null;
 if(typeof value.path!=='string'||value.path.length>4096||/[\u0000-\u0020\u007f\\#]/.test(value.path)||!value.path.startsWith('/')||value.path.startsWith('//'))return null;
 let url;try{url=new URL(value.path,value.origin);}catch{return null;}
 if(url.origin!==value.origin||url.pathname+url.search!==value.path||/%(?:2f|5c|00|0a|0d)/i.test(value.path))return null;
 if(!['GET','POST','PATCH','DELETE'].includes(value.method)||!accountBridgePlain(value.headers))return null;
 const headers={};for(const [key,entry]of Object.entries(value.headers)){
  if(!accountBridgeHeaders.has(key)||typeof entry!=='string'||entry.length>(key==='cookie'?8192:1024)||/[\r\n\u0000]/.test(entry))return null;
  headers[key]=entry;
 }
 if(value.body!==null&&(typeof value.body!=='string'||accountBridgeBytes(value.body)>ACCOUNT_BRIDGE_BODY_LIMIT))return null;
 if(value.method==='GET'&&value.body!==null)return null;
 if(value.operation==='forward'){
  if(!isCommercialAccountPath(url.pathname)||value.selection!==null)return null;
 }else{
  if(!/^\/(?:admin(?:\/diagnostics)?|api\/admin(?:\/[A-Za-z0-9_-]+)*|dashboard|campaigns|optimization|integrations)$/.test(url.pathname)||value.body!==null)return null;
  if(!accountBridgeExact(value.selection,['organizationId','storeId','capability']))return null;
  for(const key of ['organizationId','storeId'])if(value.selection[key]!==null&&(typeof value.selection[key]!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value.selection[key])))return null;
  if(typeof value.selection.capability!=='string'||! /^[a-z][a-z0-9_.:-]{1,79}$/.test(value.selection.capability))return null;
 }
 const result={schema:value.schema,operation:value.operation,origin:value.origin,path:value.path,method:value.method,headers,body:value.body,selection:value.selection===null?null:{...value.selection}};
 return accountBridgeBytes(JSON.stringify(result))<=ACCOUNT_BRIDGE_REQUEST_LIMIT?result:null;
}
export function projectAccountBridgeResponse(value){
 if(!accountBridgeExact(value,['schema','status','headers','body'])||value.schema!=='mls_account_bridge_response_v1'||!Number.isInteger(value.status)||value.status<200||value.status>599||!accountBridgePlain(value.headers)||typeof value.body!=='string'||accountBridgeBytes(value.body)>ACCOUNT_BRIDGE_RESPONSE_LIMIT)return null;
 const headers={};for(const [key,entry]of Object.entries(value.headers)){
  if(!accountBridgeResponseHeaders.has(key)||typeof entry!=='string'||entry.length>16384||/[\r\n\u0000]/.test(entry))return null;
  if(key==='location'&&(!entry.startsWith('/')||entry.startsWith('//')||entry.includes('\\')))return null;
  headers[key]=entry;
 }
 if(!headers['content-type']&&!['204','303'].includes(String(value.status)))return null;
 return {schema:value.schema,status:value.status,headers,body:value.body};
}
