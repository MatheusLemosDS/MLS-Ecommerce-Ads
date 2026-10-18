import {boundedOrdersRead} from './orders-http.mjs';
import {ordersReadDiagnostic} from './orders-diagnostic.mjs';

// Query only the private Auth route with the existing server-side app key.
export async function getOrderItems(env){
 if(!env.APP_INTERNAL_SECRET)return {diagnostic:{stage:'APP_CONFIG',code:'MISSING_BINDING',http:null}};
 const result=await boundedOrdersRead('https://auth.brazacommerce.com.br/internal/shopee/orders/items',{'X-Braza-App-Key':env.APP_INTERNAL_SECRET,Accept:'application/json','User-Agent':'MLS-Commerce-Ads-App'},60000,131072);
 return result?.ok===true&&result.status===200?result.body:{diagnostic:ordersReadDiagnostic(result,'APP_TO_AUTH')};
}
