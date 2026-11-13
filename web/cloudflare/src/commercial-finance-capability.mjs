const financeOrigin='https://auth.brazacommerce.com.br';
const financeRoutes=new Set(['/internal/finance/external-cash-v1','/internal/finance/external-cash-period-v1','/internal/shopee/finance/daily-orders','/internal/shopee/finance/escrow-releases','/internal/shopee/finance/income-overview','/internal/shopee/finance/income-detail','/internal/shopee/finance/reconciliation','/internal/shopee/finance/product-index','/internal/shopee/finance/payment-sample','/internal/shopee/finance/payment-preview','/internal/shopee/finance/variant-catalog','/internal/shopee/finance/store-period','/internal/shopee/finance/business-period','/internal/shopee/finance/production-orders','/internal/shopee/finance/historical-variant-evidence']);
const fail=(code,status=403)=>{throw Object.assign(Error(code),{code,status});};
export async function commercialFinanceCapability(request){
 const url=new URL(request.url),path=url.pathname;if(url.origin!==financeOrigin||!financeRoutes.has(path))fail('COMMERCIAL_CONNECTION_REQUIRED',503);
 if(url.search||url.hash||request.method!==(path.endsWith('/daily-orders')?'GET':'POST'))fail('COMMERCIAL_REQUEST_INVALID',400);
 if(path==='/internal/finance/external-cash-period-v1')return 'bank.read';
 if(path==='/internal/finance/external-cash-v1'){let body;try{body=await request.clone().json();}catch{fail('COMMERCIAL_REQUEST_INVALID',400);}if(!['read','preview','import','match','unlink'].includes(body?.operation))fail('COMMERCIAL_REQUEST_INVALID',400);return ['read','preview'].includes(body.operation)?'bank.read':'bank.write';}
 if(['/internal/shopee/finance/production-orders','/internal/shopee/finance/daily-orders'].includes(path))return 'orders.read';
 if(['/internal/shopee/finance/product-index','/internal/shopee/finance/variant-catalog','/internal/shopee/finance/historical-variant-evidence'].includes(path))return 'catalog.read';
 return 'finance.read';
}
