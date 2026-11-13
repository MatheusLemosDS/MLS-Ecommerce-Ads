import {financialPrivateProtocol,exchangeFinancialPrivate,financialPrivateFailure} from '../../finance/src/financial-private-protocol.mjs';

// Fixed private destinations only. Tenant envelopes and grants are provided by
// the existing per-request COMMERCIAL_FETCH closure, never by browser headers.
export async function getFinanceFinancialAutomation(env,kind,input,options={}){
 const protocol=financialPrivateProtocol(kind),secret=env?.APP_INTERNAL_SECRET;
 if(!protocol||typeof secret!=='string'||secret.length<1)return financialPrivateFailure('FINANCIAL_PRIVATE_CONFIGURATION');
 const result=await exchangeFinancialPrivate('https://auth.brazacommerce.com.br'+protocol.path,protocol,input,{send:options.fetchImpl??env.COMMERCIAL_FETCH??(request=>fetch(request)),headers:{'x-braza-app-key':secret},timeoutMs:options.timeoutMs??20000});
 if(result.status===200&&result.body.scope){const context=env.COMMERCIAL_CONTEXT,expected={...(context?{organization_id:context.organizationId,store_id:context.storeId}:{organization_id:'legacy-brazacommerce',store_id:'legacy-shopee'}),currency:'BRL',...(kind==='sources'?{account_id:'operating-book'}:{})};if(Object.keys(expected).some(key=>result.body.scope[key]!==expected[key]))return financialPrivateFailure('FINANCIAL_PRIVATE_SCOPE_MISMATCH',502);}
 return result;
}
