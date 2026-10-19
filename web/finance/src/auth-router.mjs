// Candidate router: only the isolated financial Service Binding can handle these paths.
const FINANCE_ORIGIN = 'https://auth.brazacommerce.com.br';
const FINANCE_ROUTES = new Set(['/shopee/finance/connect','/shopee/finance/callback','/shopee/finance/status']);
const AUTHORIZATION_HOSTS = new Set(['open.shopee.com','open.shopee.com.br','partner.shopeemobile.com','openplatform.shopee.com.br']);
const PRIVATE_HEADERS = {'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};

function routerFailure(code,status){return new Response(JSON.stringify({error:code}),{status,headers:{...PRIVATE_HEADERS,'content-type':'application/json; charset=utf-8'}});}
function safeRedirect(value){
 try {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash)return false;
  if(AUTHORIZATION_HOSTS.has(url.hostname))return true;
  return url.origin===FINANCE_ORIGIN&&url.pathname==='/shopee/finance/status'&&!url.search;
 } catch {return false;}
}

export async function forwardFinanceConnection(request,env){
 let url;try{url=new URL(request.url);}catch{return routerFailure('INVALID_REQUEST',400);}
 if(url.origin!==FINANCE_ORIGIN||url.username||url.password||url.hash||!FINANCE_ROUTES.has(url.pathname))return routerFailure('NOT_FOUND',404);
 if(request.method!=='GET')return routerFailure('METHOD_NOT_ALLOWED',405);
 if(request.url.length>8192)return routerFailure('INVALID_REQUEST',400);
 const secret=env.FINANCE_ROUTER_SECRET;
 if(typeof secret!=='string'||secret.length<32||secret.length>256||/[\r\n]/.test(secret)||!env.SHOPEE_FINANCE_SERVICE||typeof env.SHOPEE_FINANCE_SERVICE.fetch!=='function')return routerFailure('FINANCE_CONFIGURATION_PENDING',503);
 const headers=new Headers({'accept':url.pathname.endsWith('/status')?'application/json':'text/html','X-Braza-Finance-Router':secret});
 // The financial worker never receives Ads/admin session cookies or caller authorization.
 const cookies=(request.headers.get('cookie')||'').split(';').map(part=>part.trim()).filter(part=>part.startsWith('braza_finance_oauth='));
 if(cookies.length)headers.set('cookie',cookies.join('; '));
 let upstream;
 try{upstream=await env.SHOPEE_FINANCE_SERVICE.fetch(new Request(url.href,{method:'GET',headers,redirect:'manual'}));}
 catch{return routerFailure('FINANCE_UNAVAILABLE',502);}
 if(!upstream||!Number.isInteger(upstream.status)||upstream.status<200||upstream.status>599)return routerFailure('FINANCE_UNAVAILABLE',502);
 if(upstream.status>=300&&upstream.status<400&&(![302,303].includes(upstream.status)||!safeRedirect(upstream.headers.get('location'))))return routerFailure('FINANCE_UNAVAILABLE',502);
 const outputHeaders=new Headers(PRIVATE_HEADERS);
 for(const name of ['content-type','content-security-policy','location','set-cookie']){
  const value=upstream.headers.get(name);if(value)outputHeaders.set(name,value);
 }
 const cookie=outputHeaders.get('set-cookie');
 if(cookie&&(!cookie.startsWith('braza_finance_oauth=')||/;\s*domain\s*=/i.test(cookie)||!/(?:^|;)\s*Path=\/shopee\/finance(?:;|$)/i.test(cookie)))return routerFailure('FINANCE_UNAVAILABLE',502);
 return new Response(upstream.body,{status:upstream.status,headers:outputHeaders});
}
