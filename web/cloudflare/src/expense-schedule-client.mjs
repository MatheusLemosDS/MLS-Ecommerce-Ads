import {projectExpenseSchedule} from './expense-schedule.mjs';

export const EXPENSE_SCHEDULE_CLIENT=String.raw`
(()=>{
 ${projectExpenseSchedule.toString()}
 let api=null,started=false,pending=null,value=null,lastAttempt=0,generation=0;
 function signal(){try{globalThis.mlsAgentRegistry?.refresh?.();}catch{}}
 function observe(){
  if(!started||typeof api!=='function'||document.hidden)return Promise.resolve(value!==null);
  if(pending)return pending;const now=Date.now();if(lastAttempt&&now>=lastAttempt&&now-lastAttempt<60000)return Promise.resolve(value!==null);lastAttempt=now;const token=generation;
  pending=(async()=>{try{const raw=await api('finance/expense-schedule'),checked=projectExpenseSchedule(raw);if(!started||token!==generation)return false;if(!checked)throw Error();value=checked;signal();return true;}catch{if(started&&token===generation)signal();return false;}finally{if(token===generation)pending=null;}})();return pending;
 }
 function start(options){if(typeof options?.api!=='function')return false;if(started&&api===options.api)return true;generation++;api=options.api;started=true;pending=null;value=null;lastAttempt=0;observe();return true;}
 function stop(){started=false;generation++;api=null;pending=null;value=null;lastAttempt=0;}
 function snapshot(){return value?{schema:'mls_expense_schedule_snapshot_v1',checked_at:value.checked_at,today:value.today,open:value.open,overdue:value.overdue,due_today:value.due_today,due_next_7_days:value.due_next_7_days,next_due:value.next_due,scheduled_months:value.scheduled_months,has_unallocated_due_dates:value.has_unallocated_due_dates}:null;}
 globalThis.brazaExpenseSchedule=Object.freeze({start,observe,stop,getSnapshot:snapshot});
})();
`;
