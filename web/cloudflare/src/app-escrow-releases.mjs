import {projectEscrowReleaseRequest,projectEscrowReleaseFrame,projectEscrowReleaseEvidenceFrame,projectEscrowReleaseCoverageRequest,projectEscrowReleaseCoverageFrame,escrowReleaseRequestMatches,escrowReleaseCoverageRequestMatches} from '../../finance/src/escrow-release-frame.mjs';

// Only the fixed financial service can supply this private evidence report. There
// is no caller-selected shop, provider URL, token, order serial or API path.
export async function getFinanceEscrowReleases(env,input,{fetchImpl=request=>fetch(request),timeoutMs=45000}={}){
 const failure=(suffix='UNAVAILABLE',http=null)=>({schema:'finance_escrow_releases_unavailable_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_ESCROW_RELEASES_'+suffix,http:Number.isInteger(http)&&http>=100&&http<=599?http:null}});
 const body=projectEscrowReleaseRequest(input);
 if(!body||typeof env?.APP_INTERNAL_SECRET!=='string'||!env.APP_INTERNAL_SECRET||typeof fetchImpl!=='function'
   ||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>45000)return failure('CONFIGURATION');
 const controller=new AbortController();let timer,reader,response,stage='FETCH';
 const cancel=()=>{try{(reader?reader.cancel():response?.body?.cancel())?.catch(()=>{});}catch{}};
 const checkDeadline=()=>{if(controller.signal.aborted){cancel();throw Error('deadline');}};
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();cancel();reject(Error('deadline'));},timeoutMs);});
 const run=async()=>{
  response=await fetchImpl(new Request('https://auth.brazacommerce.com.br/internal/shopee/finance/escrow-releases',{
   method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-Braza-App-Key':env.APP_INTERNAL_SECRET,'X-Braza-Release-Contract':'release-orders-v1'},
   body:JSON.stringify(body),redirect:'manual',signal:controller.signal}));
  checkDeadline();
  if(!(response instanceof Response))return failure('RESPONSE_INVALID');
  if(response.redirected||response.status>=300&&response.status<400)return failure('REDIRECT_REJECTED',response.status);
  if(response.status!==200)return failure('HTTP_ERROR',response.status);
  if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(response.headers.get('content-type')||''))return failure('CONTENT_TYPE_INVALID',response.status);
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))))return failure('RESPONSE_INVALID',response.status);
  if(declared!==null&&Number(declared)>65536)return failure('BODY_LIMIT',response.status);
  if(!response.body)return failure('RESPONSE_INVALID',response.status);
  stage='BODY';
  reader=response.body.getReader();const chunks=[];let length=0;
  try{while(true){checkDeadline();const chunk=await reader.read();checkDeadline();if(chunk.done)break;
   if(!(chunk.value instanceof Uint8Array))return failure('RESPONSE_INVALID',response.status);length+=chunk.value.byteLength;if(length>65536)return failure('BODY_LIMIT',response.status);chunks.push(chunk.value);}}
  finally{cancel();try{reader.releaseLock();}catch{}reader=undefined;}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return failure('JSON_INVALID',response.status);}
  const evidence=projectEscrowReleaseEvidenceFrame(raw,projectEscrowReleaseFrame),frame=evidence?.report??projectEscrowReleaseFrame(raw);
  if(!frame)return failure('FRAME_INVALID',response.status);
  if(!escrowReleaseRequestMatches(body,frame))return failure('SCOPE_MISMATCH',response.status);
  return evidence??frame;
 };
 try{return await Promise.race([run(),deadline]);}
 catch{return failure(controller.signal.aborted?'TIMEOUT':stage==='FETCH'?'NETWORK_ERROR':'BODY_READ_ERROR',response instanceof Response?response.status:null);}
 finally{clearTimeout(timer);controller.abort();cancel();}
}

export async function getFinanceEscrowReleaseCoverage(env,input,{fetchImpl=request=>fetch(request),timeoutMs=45000}={}){
 const failure=(suffix='UNAVAILABLE',http=null)=>({schema:'finance_escrow_release_coverage_unavailable_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_ESCROW_RELEASES_'+suffix,http:Number.isInteger(http)&&http>=100&&http<=599?http:null}});
 const body=projectEscrowReleaseCoverageRequest(input);
 if(!body||typeof env?.APP_INTERNAL_SECRET!=='string'||!env.APP_INTERNAL_SECRET||typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>45000)return failure('CONFIGURATION');
 const controller=new AbortController();let timer,reader,response,stage='FETCH';
 const cancel=()=>{try{(reader?reader.cancel():response?.body?.cancel())?.catch(()=>{});}catch{}};
 const checkDeadline=()=>{if(controller.signal.aborted){cancel();throw Error('deadline');}};
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();cancel();reject(Error('deadline'));},timeoutMs);});
 const run=async()=>{
  response=await fetchImpl(new Request('https://auth.brazacommerce.com.br/internal/shopee/finance/escrow-releases',{
   method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-Braza-App-Key':env.APP_INTERNAL_SECRET,'X-Braza-Release-Contract':'release-coverage-v1'},
   body:JSON.stringify(body),redirect:'manual',signal:controller.signal}));
  checkDeadline();
  if(!(response instanceof Response))return failure('RESPONSE_INVALID');
  if(response.redirected||response.status>=300&&response.status<400)return failure('REDIRECT_REJECTED',response.status);
  if(response.status!==200)return failure('HTTP_ERROR',response.status);
  if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(response.headers.get('content-type')||''))return failure('CONTENT_TYPE_INVALID',response.status);
  const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))))return failure('RESPONSE_INVALID',response.status);if(declared!==null&&Number(declared)>65536)return failure('BODY_LIMIT',response.status);
  if(!response.body)return failure('RESPONSE_INVALID',response.status);
  stage='BODY';reader=response.body.getReader();const chunks=[];let length=0;
  try{while(true){checkDeadline();const chunk=await reader.read();checkDeadline();if(chunk.done)break;if(!(chunk.value instanceof Uint8Array))return failure('RESPONSE_INVALID',response.status);length+=chunk.value.byteLength;if(length>65536)return failure('BODY_LIMIT',response.status);chunks.push(chunk.value);}}
  finally{cancel();try{reader.releaseLock();}catch{}reader=undefined;}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return failure('JSON_INVALID',response.status);}
  const frame=projectEscrowReleaseCoverageFrame(raw);if(!frame)return failure('FRAME_INVALID',response.status);if(!escrowReleaseCoverageRequestMatches(body,frame))return failure('SCOPE_MISMATCH',response.status);return frame;
 };
 try{return await Promise.race([run(),deadline]);}
 catch{return failure(controller.signal.aborted?'TIMEOUT':stage==='FETCH'?'NETWORK_ERROR':'BODY_READ_ERROR',response instanceof Response?response.status:null);}
 finally{clearTimeout(timer);controller.abort();cancel();}
}
