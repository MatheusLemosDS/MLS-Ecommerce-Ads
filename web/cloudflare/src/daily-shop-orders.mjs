import {projectDailyOrdersFrame} from '../../finance/src/daily-orders-frame.mjs';

// A gross creation count is never a substitute for status-checked daily sales.
export function shopDailyOrders(summary,now=new Date()){
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(now);
 const base={status:'UNAVAILABLE',date:day,timezone:'America/Sao_Paulo',day_partial:true,orders_in_api_window:null,sales_orders:null,dashboard_counter_reconciled:false};
 if(!summary||typeof summary!=='object'||Array.isArray(summary))return base;
 const frame=projectDailyOrdersFrame(summary);
 if(!frame||Date.parse(frame.through_at)>now.getTime()+60000)return {...base,status:'INVALID_RESPONSE'};
 if(frame.date!==day)return {...base,status:'STALE_DATE',snapshot_date:frame.date,through_at:frame.through_at};
 if(now.getTime()-Date.parse(frame.through_at)>120000)return {...base,status:'INVALID_RESPONSE'};
 return {...frame,status:'AVAILABLE',dashboard_counter_reconciled:false,snapshot_age_seconds:Math.max(0,Math.floor((now.getTime()-Date.parse(frame.through_at))/1000))};
}
