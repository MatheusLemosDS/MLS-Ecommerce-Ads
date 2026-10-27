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
 globalThis.brazaIncomeOverview=Object.freeze({start,observe,observeDetail,stop,getSnapshot:snapshot,getDetailSnapshot:detailSnapshot});
})();
`;
