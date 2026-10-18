// Catalog quantities are aggregate API data, not physical kit or profit counts.
export function orderItems(summary,now=new Date()){
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(now);
 const base={status:'UNAVAILABLE',date:day,timezone:'America/Sao_Paulo',day_partial:true,orders_in_api_window:null,orders_with_details:null,catalog_units:null,rows:[],dashboard_counter_reconciled:false};
 const invalid=()=>({...base,status:'INVALID_RESPONSE'});
 if(!summary||typeof summary!=='object'||Array.isArray(summary))return base;
 const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
 const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00.000Z'))&&new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)===value;
 const statuses=['UNPAID','READY_TO_SHIP','PROCESSED','SHIPPED','COMPLETED','IN_CANCEL','CANCELLED','INVOICE_PENDING','UNKNOWN'];
 if(summary.schema!=='shop_order_items_v1'||summary.shop_id!==1178167501||summary.timezone!=='America/Sao_Paulo'||summary.day_partial!==true||summary.pagination_complete!==true||summary.count_basis!=='UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER'||summary.order_status_filter!=='NONE'||summary.dashboard_counter_reconciled!==false||summary.source!=='shopee_get_order_list_and_detail'||summary.api_error!=='NO'||summary.transport_http!==200||!integer(summary.orders_in_api_window,0,2000)||summary.orders_with_details!==summary.orders_in_api_window||!integer(summary.pages_read,1,20)||!integer(summary.duplicate_rows)||summary.orders_in_api_window+summary.duplicate_rows>summary.pages_read*100||!integer(summary.catalog_units)||typeof summary.order_status_verified!=='boolean'||!validDay(summary.date)||!Array.isArray(summary.rows)||summary.rows.length>1000)return invalid();
 const cutoff=summary.through_at;
 if(typeof cutoff!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?-03:00$/.test(cutoff)||cutoff.slice(0,10)!==summary.date||!Number.isFinite(Date.parse(cutoff))||Date.parse(cutoff)>now.getTime()+60000)return invalid();
 const counts=summary.currency_counts;
 if(!counts||typeof counts!=='object'||Array.isArray(counts)||Object.keys(counts).length!==3||!['BRL','OTHER','UNKNOWN'].every(key=>Object.prototype.hasOwnProperty.call(counts,key)&&integer(counts[key],0,summary.orders_in_api_window))||counts.BRL+counts.OTHER+counts.UNKNOWN!==summary.orders_in_api_window)return invalid();
 const currencyStatus=summary.orders_in_api_window>0&&counts.BRL===summary.orders_in_api_window?'BRL_ALL_CONFIRMED':'MIXED_OR_UNKNOWN';
 if(summary.currency_status!==currencyStatus)return invalid();
 const rows=[],keys=new Set();let units=0,lines=0,statusVerified=true;
 for(const row of summary.rows){
  if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.item_id!=='string'||!/^\d{1,20}$/.test(row.item_id)||!/^[1-9]\d*$/.test(row.item_id)||typeof row.model_id!=='string'||!/^(?:0|[1-9]\d{0,19})$/.test(row.model_id)||!statuses.includes(row.order_status)||!integer(row.quantity,1)||!integer(row.line_count,1,10000)||row.quantity<row.line_count)return invalid();
  const key=row.item_id+':'+row.model_id+':'+row.order_status;
  if(keys.has(key))return invalid();keys.add(key);
  units+=row.quantity;lines+=row.line_count;
  if(!integer(units)||lines>10000)return invalid();
  if(row.order_status==='UNKNOWN')statusVerified=false;
  rows.push({item_id:row.item_id,model_id:row.model_id,order_status:row.order_status,quantity:row.quantity,line_count:row.line_count});
 }
 if(units!==summary.catalog_units||lines<summary.orders_in_api_window||summary.order_status_verified!==statusVerified||(summary.orders_in_api_window===0&&(rows.length!==0||units!==0)))return invalid();
 if(summary.date!==day)return {...base,status:'STALE_DATE',snapshot_date:summary.date,through_at:cutoff};
 return {status:'AVAILABLE',schema:'shop_order_items_v1',shop_id:1178167501,date:summary.date,timezone:'America/Sao_Paulo',through_at:cutoff,day_partial:true,orders_in_api_window:summary.orders_in_api_window,orders_with_details:summary.orders_with_details,pagination_complete:true,pages_read:summary.pages_read,duplicate_rows:summary.duplicate_rows,catalog_units:units,rows,currency_status:currencyStatus,currency_counts:{BRL:counts.BRL,OTHER:counts.OTHER,UNKNOWN:counts.UNKNOWN},order_status_verified:statusVerified,count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_NO_STATUS_FILTER',order_status_filter:'NONE',dashboard_counter_reconciled:false,source:'shopee_get_order_list_and_detail',api_error:'NO',transport_http:200,snapshot_age_seconds:Math.max(0,Math.floor((now.getTime()-Date.parse(cutoff))/1000))};
}
