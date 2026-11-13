import {D1} from './sqlite-d1.mjs';
import {createFinancialEvent,FinancialLedgerError} from '../src/financial-event-ledger.mjs';
export const financialTestScope=(patch={})=>({organization_id:'synthetic-org-a',store_id:'synthetic-store-a',account_id:'store-book',currency:'BRL',...patch});
export const financialTestPeriod=(patch={})=>({kind:'MONTH',start_at:'2026-10-01T03:00:00.000Z',end_at:'2026-11-01T03:00:00.000Z',timezone:'America/Sao_Paulo',calendar_id:'MONTH_CIVIL',...patch});
export async function financialTestEvent(patch={}){
 const scope=patch.scope??financialTestScope();return createFinancialEvent({scope,event_type:'SALE_RECOGNIZED',event_at:'2026-10-10T12:00:00.000Z',competence_at:'2026-10-10T12:00:00.000Z',settlement_at:null,source_updated_at:'2026-10-10T12:00:00.000Z',observed_at:'2026-11-13T17:00:00.000Z',source:{provider:'SHOPEE',family:'ORDER',native_id:'synthetic-order-1',identity:'NATIVE_ID',identity_key:null},evidence:[{kind:'API_FINANCIAL_FIELDS',reference:'synthetic-evidence',sha256:'d'.repeat(64)}],causal_event_id:null,quality:'CONFIRMED',postings:[{account:'RECEIVABLE',account_ref:'wallet-primary',amount_cents:10000},{account:'REVENUE',account_ref:'sales',amount_cents:-10000}],...patch});
}
export function financialTestFixture(){
 const env={ADMIN_DB:new D1()};let allowed=true,stamp=Date.parse('2026-11-13T17:00:00Z');const options={actor:'synthetic-owner',now:()=>stamp,assertAuthorized:async()=>{if(!allowed)throw new FinancialLedgerError('FINANCIAL_AUTHORIZATION_REVOKED',403);}};
 return {env,options,setTime(value){stamp=Date.parse(value);},revoke(){allowed=false;},close(){env.ADMIN_DB.db.close();}};
}
export const financialTestPolicy=(patch={})=>({schema:'financial_accounting_policy_v1',policy_id:'synthetic-policy',revision:1,scope:financialTestScope(),effective_from:'2026-01-01',effective_to:null,recognition:'EXPLICIT_EVENT_COMPETENCE',revenue_base:'NET_PAYOUT',cost_basis:'HISTORICAL_ALLOCATED_PIECES',financial_week:'CIVIL_FRIDAY_THURSDAY',timezone:'America/Sao_Paulo',late_event_policy:'RESTATEMENT_REQUIRED',tax:{regime:'SYNTHETIC_DECLARED',mode:'EXPLICIT_EVENTS',monthly_cents:null,recognition:'SOURCE_COMPETENCE',source_ref:'synthetic-tax-source',revision:1},approval:{state:'APPROVED',actor_ref:'synthetic-owner',at:'2026-10-01T12:00:00.000Z',evidence_ref:'synthetic-policy-approval'},...patch});
