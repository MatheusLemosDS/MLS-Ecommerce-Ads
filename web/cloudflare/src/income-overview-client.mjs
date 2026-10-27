import {projectIncomeOverviewFrame} from '../../finance/src/income-overview-frame.mjs';
import {projectBusinessIncomeOverview} from './business-income-overview.mjs';

export const INCOME_OVERVIEW_CLIENT=String.raw`
(()=>{
 ${projectIncomeOverviewFrame.toString()}
 ${projectBusinessIncomeOverview.toString()}
 let api=null,started=false,pending=null,lastAttempt=0,value=null,generation=0;
 function renderSignal(){try{globalThis.mlsAgentRegistry?.refresh?.();}catch{}}
 function observe(){
  if(!started||typeof api!=='function'||document.hidden)return Promise.resolve(value!==null);
  if(pending)return pending;const now=Date.now();if(lastAttempt&&now>=lastAttempt&&now-lastAttempt<60000)return Promise.resolve(value!==null);lastAttempt=now;const token=++generation;
  pending=(async()=>{try{const raw=await api('finance/income-overview'),checked=projectBusinessIncomeOverview(raw,projectIncomeOverviewFrame);if(!started||token!==generation)return false;if(!checked)throw Error();value=checked;renderSignal();return true;}catch{if(started&&token===generation)renderSignal();return false;}finally{if(token===generation)pending=null;}})();return pending;
 }
 function start(options){if(typeof options?.api!=='function')return false;if(started&&api===options.api)return true;generation++;api=options.api;started=true;pending=null;lastAttempt=0;value=null;observe();return true;}
 function stop(){started=false;generation++;api=null;pending=null;value=null;lastAttempt=0;}
 function snapshot(){return value?{schema:'mls_income_overview_snapshot_v1',checked_at:value.checked_at,status:value.status,pending_cents:value.report?.pending?.cents??null,released_cents:value.report?.released?.cents??null,currency_basis:value.report?.currency_basis??null,basis:value.report?.basis??null}:null;}
 globalThis.brazaIncomeOverview=Object.freeze({start,observe,stop,getSnapshot:snapshot});
})();
`;
