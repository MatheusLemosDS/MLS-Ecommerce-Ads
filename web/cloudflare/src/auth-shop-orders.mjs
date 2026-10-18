import {shopOrders} from './shop-orders.mjs';
import {boundedOrdersRead} from './orders-http.mjs';
import {ordersReadDiagnostic} from './orders-diagnostic.mjs';

export async function gatewayShopOrders(env,normalizeGatewayUrl){
 if(!env.GATEWAY_URL||!env.GATEWAY_SHARED_SECRET)return {ok:false,status:502,body:null,diagnostic:{stage:'AUTH_CONFIG',code:'MISSING_BINDING',http:null}};
 return boundedOrdersRead(normalizeGatewayUrl(env.GATEWAY_URL)+'/api/shopee/orders/summary?shop_id=1178167501',{'X-Braza-Gateway-Key':env.GATEWAY_SHARED_SECRET,Accept:'application/json','User-Agent':'BrazaCommerce-Auth-Worker'},45000);
}

// Additional private route. Existing authentication and gateway key stay server-side.
export async function authShopOrders(request,env,services){
 const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
 try{
  if(!await services.validateInternalApp(request,env))return reply({error:'UNAUTHORIZED'},401);
  if(request.method!=='GET')return reply({error:'METHOD_NOT_ALLOWED'},405);
  const result=await services.gatewayOrdersRead(env);
  if(result?.ok!==true||result.status!==200)return reply({error:'SHOP_ORDERS_UNAVAILABLE',diagnostic:ordersReadDiagnostic(result,'AUTH_TO_GATEWAY')},502);
  const value=shopOrders(result.body);
  if(value.status!=='AVAILABLE')return reply({error:'SHOP_ORDERS_UNAVAILABLE',diagnostic:{stage:'AUTH_VALIDATION',code:value.status==='STALE_DATE'?'STALE_DATE':'INVALID_RESPONSE',http:200,validation:value.status==='STALE_DATE'?'STALE_DATE':'INVALID_RESPONSE'}},502);
  return reply(value);
 }catch{return reply({error:'SHOP_ORDERS_UNAVAILABLE',diagnostic:{stage:'AUTH_TO_GATEWAY',code:'INTERNAL_ERROR',http:null}},502);}
}
