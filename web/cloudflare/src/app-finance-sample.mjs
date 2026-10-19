import {projectFinanceSample,financeSampleDiagnostic} from './finance-sample-frame.mjs';
import {projectFinancePaymentPreview} from '../../finance/src/payment-preview-frame.mjs';
import {projectVariantCatalog,projectVariantCatalogRequest} from '../../finance/src/variant-catalog-frame.mjs';

export function projectAdminFinancePreview(value){
 return projectFinancePaymentPreview(value)||{schema:'finance_payment_preview_v1',status:'UNAVAILABLE',diagnostic:financeSampleDiagnostic(value?.diagnostic)};
}

// Both actions have fixed destinations. Only the authenticated preview receives
// values; the existing schema/support result remains free of private values.
async function getFinanceAction(env,preview,{fetchImpl=request=>fetch(request),timeoutMs=45000}={}){
 const project=preview?projectAdminFinancePreview:projectFinanceSample;
 const failure=(code,http=null)=>project({status:'UNAVAILABLE',diagnostic:financeSampleDiagnostic({code,http})});
 if(typeof env.APP_INTERNAL_SECRET!=='string'||!env.APP_INTERNAL_SECRET||typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>45000)return failure('FINANCE_SAMPLE_APP_CONFIGURATION');
 const controller=new AbortController();let timer,reader,response;
 const cancel=()=>{try{(reader?reader.cancel():response?.body?.cancel())?.catch(()=>{});}catch{}};
 const checkDeadline=()=>{if(controller.signal.aborted){cancel();throw Error('deadline');}};
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{reject(Error('deadline'));controller.abort();cancel();},timeoutMs);});
 const run=async()=>{
  const target=preview?'https://auth.brazacommerce.com.br/internal/shopee/finance/payment-preview':'https://auth.brazacommerce.com.br/internal/shopee/finance/payment-sample';
  response=await fetchImpl(new Request(target,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-Braza-App-Key':env.APP_INTERNAL_SECRET},body:'{}',redirect:'manual',signal:controller.signal}));
  checkDeadline();
  if(!(response instanceof Response)||response.redirected||!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(response.headers.get('content-type')||''))return failure('FINANCE_SAMPLE_APP_RESPONSE_INVALID');
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>65536))return failure('FINANCE_SAMPLE_APP_RESPONSE_INVALID');
  if(!response.body)return failure('FINANCE_SAMPLE_APP_RESPONSE_INVALID');
  reader=response.body.getReader();const chunks=[];let length=0;
  try{while(true){checkDeadline();const chunk=await reader.read();checkDeadline();if(chunk.done)break;if(!(chunk.value instanceof Uint8Array))return failure('FINANCE_SAMPLE_APP_RESPONSE_INVALID');length+=chunk.value.byteLength;if(length>65536)return failure('FINANCE_SAMPLE_APP_RESPONSE_INVALID');chunks.push(chunk.value);}}
  finally{cancel();try{reader.releaseLock();}catch{}reader=undefined;}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return failure('FINANCE_SAMPLE_APP_RESPONSE_INVALID');}
  if(response.status!==200)return failure(raw?.error==='FINANCE_SAMPLE_UNAVAILABLE'?raw?.diagnostic?.code:'FINANCE_SAMPLE_UNAVAILABLE',raw?.error==='FINANCE_SAMPLE_UNAVAILABLE'?raw?.diagnostic?.http:response.status);
  return project(raw);
 };
 try{return await Promise.race([run(),deadline]);}
 catch{return failure(controller.signal.aborted?'FINANCE_SAMPLE_APP_TIMEOUT':'FINANCE_SAMPLE_APP_UPSTREAM_FAILED');}
 finally{clearTimeout(timer);controller.abort();cancel();}
}

export async function getFinancePaymentSample(env,options){return getFinanceAction(env,false,options);}
export async function getFinancePaymentPreview(env,options){return getFinanceAction(env,true,options);}

// The caller supplies only bounded product identifiers, never a provider path,
// shop, token or URL. The response is projected again before the admin sees it.
export async function getFinanceVariantCatalog(env,input,{fetchImpl=request=>fetch(request),timeoutMs=45000}={}){
 const failure=code=>({schema:'variant_catalog_v1',status:'UNAVAILABLE',diagnostic:{code,http:null}});
 const body=projectVariantCatalogRequest(input);
 if(!body||typeof env?.APP_INTERNAL_SECRET!=='string'||!env.APP_INTERNAL_SECRET||typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>45000)return failure('FINANCE_CATALOG_APP_CONFIGURATION');
 const controller=new AbortController();let timer,reader,response;
 const cancel=()=>{try{(reader?reader.cancel():response?.body?.cancel())?.catch(()=>{});}catch{}};
 const checkDeadline=()=>{if(controller.signal.aborted){cancel();throw Error('deadline');}};
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();cancel();reject(Error('deadline'));},timeoutMs);});
 const run=async()=>{
  response=await fetchImpl(new Request('https://auth.brazacommerce.com.br/internal/shopee/finance/variant-catalog',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-Braza-App-Key':env.APP_INTERNAL_SECRET},body:JSON.stringify(body),redirect:'manual',signal:controller.signal}));
  checkDeadline();
  if(!(response instanceof Response)||response.redirected||response.status!==200||!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(response.headers.get('content-type')||''))return failure('FINANCE_CATALOG_APP_RESPONSE_INVALID');
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>262144))return failure('FINANCE_CATALOG_APP_RESPONSE_INVALID');
  if(!response.body)return failure('FINANCE_CATALOG_APP_RESPONSE_INVALID');
  reader=response.body.getReader();const chunks=[];let length=0;
  try{while(true){checkDeadline();const chunk=await reader.read();checkDeadline();if(chunk.done)break;if(!(chunk.value instanceof Uint8Array))return failure('FINANCE_CATALOG_APP_RESPONSE_INVALID');length+=chunk.value.byteLength;if(length>262144)return failure('FINANCE_CATALOG_APP_RESPONSE_INVALID');chunks.push(chunk.value);}}
  finally{cancel();try{reader.releaseLock();}catch{}reader=undefined;}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return failure('FINANCE_CATALOG_APP_RESPONSE_INVALID');}
  const frame=projectVariantCatalog(raw);
  return frame&&frame.products.length===body.item_ids.length&&frame.products.every(product=>body.item_ids.includes(product.item_id))?frame:failure('FINANCE_CATALOG_APP_RESPONSE_INVALID');
 };
 try{return await Promise.race([run(),deadline]);}
 catch{return failure(controller.signal.aborted?'FINANCE_CATALOG_APP_TIMEOUT':'FINANCE_CATALOG_APP_UPSTREAM_FAILED');}
 finally{clearTimeout(timer);controller.abort();cancel();}
}
