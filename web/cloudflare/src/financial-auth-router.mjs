import {financialPrivateKind,financialPrivateProtocol,exchangeFinancialPrivate,financialPrivateFailure,readFinancialPrivateJson} from '../../finance/src/financial-private-protocol.mjs';

export async function forwardFinancialPrivate(request,env,{validateInternalApp,timeoutMs=20000}={}){
 const reply=value=>new Response(JSON.stringify(value.body),{status:value.status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
 const url=new URL(request.url),kind=financialPrivateKind(url.pathname),protocol=financialPrivateProtocol(kind);
 if(url.origin!=='https://auth.brazacommerce.com.br'||!protocol||url.username||url.password)return reply(financialPrivateFailure('FINANCIAL_PRIVATE_NOT_FOUND',404));
 if(request.method!=='POST')return reply(financialPrivateFailure('FINANCIAL_PRIVATE_METHOD_NOT_ALLOWED',405));
 if(url.search||url.hash)return reply(financialPrivateFailure('FINANCIAL_PRIVATE_REQUEST_INVALID',400));
 if(typeof validateInternalApp!=='function'||!await validateInternalApp(request,env))return reply(financialPrivateFailure('FINANCIAL_PRIVATE_UNAUTHORIZED',401));
 const secret=env?.FINANCE_ROUTER_SECRET,binding=env?.SHOPEE_FINANCE_SERVICE;
 if(typeof secret!=='string'||! /^[\x21-\x7e]{32,256}$/.test(secret)||typeof binding?.fetch!=='function')return reply(financialPrivateFailure('FINANCIAL_PRIVATE_CONFIGURATION'));
 let raw,timer;const controller=new AbortController();
 try{const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();try{void request.body?.cancel()?.catch(()=>{});}catch{}reject(Error());},5000);});raw=await Promise.race([readFinancialPrivateJson(new Response(request.body,{headers:request.headers}),protocol.requestMaximum,controller.signal),deadline]);}
 catch{return reply(financialPrivateFailure('FINANCIAL_PRIVATE_REQUEST_INVALID',400));}finally{clearTimeout(timer);}
 return reply(await exchangeFinancialPrivate(url.origin+protocol.path,protocol,raw,{send:value=>binding.fetch(value),headers:{'x-braza-finance-router':secret},timeoutMs}));
}
