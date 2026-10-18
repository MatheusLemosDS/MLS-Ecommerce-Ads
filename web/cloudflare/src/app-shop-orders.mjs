import {boundedOrdersRead} from './orders-http.mjs';
import {ordersReadDiagnostic} from './orders-diagnostic.mjs';
// Calls only the private Auth Worker; legacy internalRequest is unchanged.
export async function getShopOrders(env){
 if(!env.APP_INTERNAL_SECRET)return {diagnostic:{stage:'APP_CONFIG',code:'MISSING_BINDING',http:null}};
 const result=await boundedOrdersRead('https://auth.brazacommerce.com.br/internal/shopee/orders/summary',{'X-Braza-App-Key':env.APP_INTERNAL_SECRET,Accept:'application/json','User-Agent':'MLS-Commerce-Ads-App'},60000);
 return result?.ok===true&&result.status===200?result.body:{diagnostic:ordersReadDiagnostic(result,'APP_TO_AUTH')};
}
