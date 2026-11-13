import {TenantIsolationError} from './tenant-storage.mjs';
import {commercialContextFromPrincipal,isCommercialContext} from './commercial-context.mjs';

export const TENANT_ENVELOPE_HEADER='x-mls-context';
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const fail=(code,status=403)=>{throw new TenantIsolationError('TENANT_ENVELOPE_'+code,status);};
const keys=['v','iss','aud','sub','sid','mid','org','store','revision','cap','method','target','body_hash','iat','exp','jti'];
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(v);
const b64=bytes=>{let raw='';for(const b of bytes)raw+=String.fromCharCode(b);return btoa(raw).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');};
const bytes=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value))fail('INVALID');try{return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}catch{fail('INVALID');}};
const digest=async value=>b64(new Uint8Array(await crypto.subtle.digest('SHA-256',value)));
async function key(secret){if(typeof secret!=='string'||secret.length<32)fail('CONFIGURATION',503);return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
function route(request){const u=new URL(request.url);return u.pathname+u.search;}
function time(now){const value=Math.floor(now()/1000);if(!Number.isSafeInteger(value)||value<1)fail('CLOCK_INVALID',503);return value;}
function endpoints(issuer,audience){return issuer==='app'&&audience==='auth'||issuer==='auth'&&audience==='finance';}
async function bodyHash(request){
 const declared=request.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>1048576))fail('BODY_TOO_LARGE',413);
 if(!request.body)return digest(new Uint8Array());
 const reader=request.clone().body.getReader(),chunks=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1048576)fail('BODY_TOO_LARGE',413);chunks.push(part.value);}}finally{try{reader.cancel().catch(()=>{});}catch{}reader.releaseLock();}
 const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}return digest(data);
}
export async function signTenantEnvelope(request,context,{secret,audience,issuer,now=()=>Date.now(),ttlSeconds=30}={}){
 if(!isCommercialContext(context)||!endpoints(issuer,audience)||!Number.isInteger(ttlSeconds)||ttlSeconds<1||ttlSeconds>60||!context.requiredCapability)fail('CONTEXT_INVALID');
 const stamp=time(now),claims={v:2,iss:issuer,aud:audience,sub:context.userId,sid:context.sessionId,mid:context.membershipId,org:context.organizationId,store:context.storeId,revision:context.authorizationRevision??null,cap:context.requiredCapability,method:request.method,target:route(request),body_hash:await bodyHash(request),iat:stamp,exp:stamp+ttlSeconds,jti:crypto.randomUUID()};
 const payload=b64(encoder.encode(JSON.stringify(claims))),signature=b64(new Uint8Array(await crypto.subtle.sign('HMAC',await key(secret),encoder.encode('mls-context-v2.'+payload))));
 return payload+'.'+signature;
}
export async function verifyTenantEnvelope(request,{secret,audience,issuer,resolvePrincipal,now=()=>Date.now()}={}){
 if(!endpoints(issuer,audience)||typeof resolvePrincipal!=='function')fail('CONFIGURATION',503);
 const token=request.headers.get(TENANT_ENVELOPE_HEADER);if(typeof token!=='string'||token.length>4096||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))fail('REQUIRED');
 const [payload,signature]=token.split('.');
 if(!await crypto.subtle.verify('HMAC',await key(secret),bytes(signature),encoder.encode('mls-context-v2.'+payload)))fail('SIGNATURE_INVALID');
 let claims;try{claims=JSON.parse(decoder.decode(bytes(payload)));}catch{fail('INVALID');}
 const stamp=time(now);
 if(!Number.isSafeInteger(claims?.revision)||claims.revision<1)fail('INVALID');
 if(!claims||Array.isArray(claims)||Object.keys(claims).length!==keys.length||keys.some(k=>!Object.hasOwn(claims,k))||claims.v!==2||claims.iss!==issuer||claims.aud!==audience||![claims.sub,claims.sid,claims.mid,claims.org,claims.store].every(id)||typeof claims.cap!=='string'||!/^[a-z][a-z0-9_.:-]{1,79}$/.test(claims.cap)||!Number.isSafeInteger(claims.iat)||!Number.isSafeInteger(claims.exp)||claims.iat>stamp||claims.exp<=stamp||claims.exp-claims.iat<1||claims.exp-claims.iat>60||stamp-claims.iat>60||!id(claims.jti)||claims.method!==request.method||claims.target!==route(request)||typeof claims.body_hash!=='string'||claims.body_hash!==await bodyHash(request))fail('INVALID');
 // A valid service signature does not grant tenant access. The receiver looks
 // up these IDs in its trusted account registry on every boundary.
 const principal=await resolvePrincipal(Object.freeze({...claims}));
 if(principal?.userId!==claims.sub||principal?.sessionId!==claims.sid||principal?.membershipId!==claims.mid||principal?.organizationId!==claims.org||principal?.storeId!==claims.store||(principal?.authorizationRevision??null)!==claims.revision)fail('AUTHORIZATION_REVOKED');
 return commercialContextFromPrincipal(principal,{requiredCapability:claims.cap});
}
export async function forwardTenantEnvelope(request,context,options){
 const headers=new Headers(request.headers);headers.delete(TENANT_ENVELOPE_HEADER);headers.set(TENANT_ENVELOPE_HEADER,await signTenantEnvelope(request,context,options));return new Request(request,{headers});
}
