import {buildFinancialSourceCapabilities} from '../src/financial-source-capabilities.mjs';

export const privateNow=()=>Date.parse('2026-11-13T18:00:00Z');
export const privateEpoch=privateNow()/1000;
export const privateScope={organization_id:'legacy-brazacommerce',store_id:'legacy-shopee',account_id:'operating-book',currency:'BRL'};
export const privateRun='00000000-0000-4000-8000-000000000001';
export const sourceCommand=(patch={})=>({schema:'financial_source_request_v1',operation:'evidence',run_id:privateRun,cursor:null,limit:2,expected_revision:null,...patch});
export const sourceCapabilities=(scope=privateScope)=>buildFinancialSourceCapabilities({scope,now:privateNow});
export function sourceFrame({scope=privateScope,version=1,count=1,revision=1,cursor=null,run_id=privateRun}={}){
 return {schema:'financial_source_evidence_v'+version,scope:{...scope},run:{run_id,revision,status:'COMPLETE',start_date:'2026-11-01',end_date:'2026-11-13',cutoff_at:privateEpoch-60,checked_at:privateEpoch},facts:Array.from({length:count},(_,i)=>({event_key:(i+1).toString(16).padStart(64,'0'),source_hash:'a'.repeat(64),bucket:'completed',create_time:privateEpoch-100,checked_at:privateEpoch,currency:'BRL',escrow_amount_cents:9000,after_adjustment_cents:8000,total_adjustment_cents:-1000,return_count:0,diagnostic:null,payment_covered:true,...(version===2?{components:null}:{})})),coverage:{state:version===2?'PARTIAL':'COMPLETE',complete:version!==2,orders_total:count,missing_orders:0,invalid_orders:0,window_complete:true,page_complete:true,...(version===2?{base_complete:true,components_state:'NOT_CAPTURED',components_missing_orders:count,components_invalid_orders:0}:{})},capabilities:sourceCapabilities(scope),cursor,next_cursor:null,has_more:false};
}
export const privateJson=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
