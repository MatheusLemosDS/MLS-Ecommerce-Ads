import {projectIncomeOverviewFrame} from '../../finance/src/income-overview-frame.mjs';
import {projectIncomeDetailFrame} from '../../finance/src/income-detail-frame.mjs';
import {projectBusinessIncomeOverview} from './business-income-overview.mjs';
import {projectBusinessIncomeDetail} from './business-income-detail.mjs';

export const INCOME_OVERVIEW_CLIENT=String.raw`
(()=>{
 ${projectIncomeOverviewFrame.toString()}
 ${projectBusinessIncomeOverview.toString()}
 ${projectIncomeDetailFrame.toString()}
 ${projectBusinessIncomeDetail.toString()}
 let api=null,started=false,pending=null,lastAttempt=0,value=null,generation=0,detail=null,detailPending=null,detailLastAttempt=0;
 function renderSignal(){try{globalThis.mlsAgentRegistry?.refresh?.();}catch{}}
 function observe(){
  if(!started||typeof api!=='function'||document.hidden)return Promise.resolve(value!==null);
  if(pending)return pending;const now=Date.now();if(lastAttempt&&now>=lastAttempt&&now-lastAttempt<60000)return Promise.resolve(value!==null);lastAttempt=now;const token=++generation;
  pending=(async()=>{try{const raw=await api('finance/income-overview'),checked=projectBusinessIncomeOverview(raw,projectIncomeOverviewFrame);if(!started||token!==generation)return false;if(!checked)throw Error();value=checked;renderSignal();return true;}catch{if(started&&token===generation)renderSignal();return false;}finally{if(token===generation)pending=null;}})();return pending;
 }
 function observeDetail(){
  if(!started||typeof api!=='function'||document.hidden)return Promise.resolve(detail!==null);const pendingCents=value?.report?.pending?.cents;if(!Number.isSafeInteger(pendingCents)||pendingCents<=0)return Promise.resolve(false);
  if(detailPending)return detailPending;const now=Date.now();if(detailLastAttempt&&now>=detailLastAttempt&&now-detailLastAttempt<60000)return Promise.resolve(detail!==null);detailLastAttempt=now;const token=generation;
  detailPending=(async()=>{try{const raw=await api('finance/income-detail'),checked=projectBusinessIncomeDetail(raw,projectIncomeDetailFrame);if(!started||token!==generation)return false;if(!checked)throw Error();detail=checked;renderSignal();return true;}catch{if(started&&token===generation)renderSignal();return false;}finally{if(token===generation)detailPending=null;}})();return detailPending;
 }
 function start(options){if(typeof options?.api!=='function')return false;if(started&&api===options.api)return true;generation++;api=options.api;started=true;pending=null;lastAttempt=0;value=null;detail=null;detailPending=null;detailLastAttempt=0;observe();return true;}
 function stop(){started=false;generation++;api=null;pending=null;value=null;lastAttempt=0;detail=null;detailPending=null;detailLastAttempt=0;}
 function snapshot(){return value?{schema:'mls_income_overview_snapshot_v1',checked_at:value.checked_at,status:value.status,pending_cents:value.report?.pending?.cents??null,released_cents:value.report?.released?.cents??null,currency_basis:value.report?.currency_basis??null,basis:value.report?.basis??null}:null;}
 function detailSnapshot(){const report=detail?.report;if(!report)return null;return {schema:'mls_income_detail_snapshot_v1',checked_at:detail.checked_at,status:detail.status,returned_count:report.returned_count,has_more:report.has_more,rows:report.rows.map(row=>({...row})) ,basis:report.basis};}
 function diagnostic(){
  const overview=snapshot(),current=detailSnapshot(),rows=current?.rows??[],known=rows.filter(row=>Number.isSafeInteger(row.estimated_escrow_cents)),sum=known.reduce((total,row)=>{const value=BigInt(total)+BigInt(row.estimated_escrow_cents);return value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):total;},0);
  return {schema:'mls_pending_diagnostic_v1',generated_at:Math.floor(Date.now()/1000),semantics:{scope:'CURRENT_SHOPEE_PENDING_NOT_MONTHLY_COMPETENCE',bank_receipt:false,realized_profit:false,remaining_receivable:false},overview:overview?{checked_at:overview.checked_at,status:overview.status,pending_cents:overview.pending_cents,released_cents:overview.released_cents,currency_basis:overview.currency_basis,basis:overview.basis}:null,detail:current?{checked_at:current.checked_at,status:current.status,returned_count:current.returned_count,has_more:current.has_more,known_amount_rows:known.length,known_estimated_escrow_cents:sum,basis:current.basis,rows:rows.map(row=>({order_hash:row.order_hash,status:row.status,currency:row.currency,estimated_escrow_raw:row.estimated_escrow_raw,estimated_escrow_cents:row.estimated_escrow_cents,estimated_payout_time:row.estimated_payout_time,creation_time:row.creation_time}))}:null};
 }
 globalThis.brazaIncomeOverview=Object.freeze({start,observe,observeDetail,stop,getSnapshot:snapshot,getDetailSnapshot:detailSnapshot,getDiagnostic:diagnostic});
})();
`;
