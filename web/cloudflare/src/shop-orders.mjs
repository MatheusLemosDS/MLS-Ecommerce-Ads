// Project only the native count contract. No order identifiers or customer data.
export function shopOrders(summary,now=new Date()){
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(now);
 const base={status:'UNAVAILABLE',date:day,timezone:'America/Sao_Paulo',day_partial:true,orders_in_api_window:null,dashboard_counter_reconciled:false};
 if(!summary||typeof summary!=='object'||Array.isArray(summary))return base;
 const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
 const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00.000Z'))&&new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)===value;
 if(summary.schema!=='shop_orders_v1'||summary.shop_id!==1178167501||summary.timezone!=='America/Sao_Paulo'||summary.day_partial!==true||summary.pagination_complete!==true||summary.count_basis!=='UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER'||summary.order_status_filter!=='NONE'||summary.dashboard_counter_reconciled!==false||summary.source!=='shopee_get_order_list'||summary.api_error!=='NO'||summary.transport_http!==200||!integer(summary.orders_in_api_window)||!integer(summary.pages_read,1,20)||!integer(summary.duplicate_rows)||summary.orders_in_api_window+summary.duplicate_rows>summary.pages_read*100||!validDay(summary.date))return {...base,status:'INVALID_RESPONSE'};
 const cutoff=summary.through_at;
 if(typeof cutoff!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?-03:00$/.test(cutoff)||cutoff.slice(0,10)!==summary.date||!Number.isFinite(Date.parse(cutoff))||Date.parse(cutoff)>now.getTime()+60000)return {...base,status:'INVALID_RESPONSE'};
 if(summary.date!==day)return {...base,status:'STALE_DATE',snapshot_date:summary.date,through_at:cutoff};
 return {status:'AVAILABLE',schema:'shop_orders_v1',shop_id:1178167501,date:summary.date,timezone:'America/Sao_Paulo',through_at:cutoff,day_partial:true,orders_in_api_window:summary.orders_in_api_window,pagination_complete:true,pages_read:summary.pages_read,duplicate_rows:summary.duplicate_rows,count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER',order_status_filter:'NONE',dashboard_counter_reconciled:false,source:'shopee_get_order_list',api_error:'NO',transport_http:200,snapshot_age_seconds:Math.max(0,Math.floor((now.getTime()-Date.parse(cutoff))/1000))};
}
