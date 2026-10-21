import {FINANCE_PROFILE, FinanceConnectionError} from './connection-store.mjs';
import {ensureFinanceAccessToken} from './refresh-coordinator.mjs';
import {requestFinanceAuthJson} from './auth-json-transport.mjs';
import {projectDailyOrdersFrame} from './daily-orders-frame.mjs';

const DAILY_ORDER_LIST = '/api/v2/order/get_order_list';
const DAILY_ORDER_DETAIL = '/api/v2/order/get_order_detail';
const DAILY_READ_BUDGET_MS = 35000;
// Ten list pages plus twenty detail batches stay below the Free Worker limit,
// including a possible token refresh. Larger days fail without a partial count.
const DAILY_MAX_PAGES = 10;
const DAILY_SALES_STATUSES = new Set(['READY_TO_SHIP','PROCESSED','RETRY_SHIP','SHIPPED',
  'TO_CONFIRM_RECEIVE','COMPLETED','INVOICE_PENDING']);
const dailyEncoder = new TextEncoder();
const dailyFailure = (suffix,status=502) => new FinanceConnectionError('FINANCE_DAILY_ORDERS_'+suffix,status);
const dailyPlain = value => value !== null && typeof value==='object'
  && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const dailyOrderId = value => typeof value==='string' && value.length>=1 && value.length<=128
  && !/[\u0000-\u0020\u007f-\uffff,]/.test(value);
const dailyCursor = value => typeof value==='string' && value.length>=1 && value.length<=2048
  && !/[\u0000-\u0020\u007f-\uffff]/.test(value);

function dailyEnvelope(payload){
  if(!dailyPlain(payload)||typeof payload.error!=='string')throw dailyFailure('RESPONSE_INVALID');
  if(payload.error!=='')throw dailyFailure(payload.error==='error_api_permission'?'PERMISSION_REQUIRED':'API_REJECTED');
  if(!dailyPlain(payload.response))throw dailyFailure('RESPONSE_INVALID');
  for(const value of [payload,payload.response]){
    for(const field of ['partner_id','shop_id']){
      if(Object.hasOwn(value,field)&&value[field]!==FINANCE_PROFILE[field])throw dailyFailure('IDENTITY_MISMATCH');
    }
  }
  return payload.response;
}

function dailyBucket(status){
  if(DAILY_SALES_STATUSES.has(status))return 'sales_orders';
  if(status==='CANCELLED')return 'cancelled_orders';
  if(status==='IN_CANCEL')return 'cancellation_pending_orders';
  if(status==='UNPAID')return 'unpaid_orders';
  if(status==='TO_RETURN')return 'other_orders';
  return 'unknown_status_orders';
}

// Read the complete creation-time cohort again on each invocation. Only current
// order-level statuses determine the counters; item lines and Ads never do.
// No order numbers, cursors or provider payloads enter persistent storage.
export async function runFinanceDailyOrders(env,options={}){
  if(!dailyPlain(options)||Reflect.ownKeys(options).some(key=>!['fetchImpl','now','timeoutMs'].includes(key)
    ||!Object.hasOwn(Object.getOwnPropertyDescriptor(options,key)||{},'value')))throw dailyFailure('REQUEST_INVALID',400);
  const {fetchImpl,now=()=>Date.now(),timeoutMs=5000}=options;
  if(env?.FINANCE_CONNECTION_ENABLED!=='true'||typeof fetchImpl!=='function'||typeof now!=='function'
    ||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>10000)throw dailyFailure('CONFIGURATION',503);
  const clock=()=>{
    let value;try{value=now();}catch{throw dailyFailure('CLOCK_CONFIGURATION',503);}
    if(!Number.isSafeInteger(value)||value<=0||Math.floor(value/1000)>9999999999)throw dailyFailure('CLOCK_CONFIGURATION',503);
    return value;
  };
  const initial=clock(),wallStarted=Date.now(),cutoff=Math.floor(initial/1000);
  const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(initial));
  const offset=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',timeZoneName:'longOffset'})
    .formatToParts(new Date(initial)).find(part=>part.type==='timeZoneName')?.value;
  // The shared current-day contract uses Brazil's present UTC-03:00 offset.
  if(offset!=='GMT-03:00')throw dailyFailure('CLOCK_CONFIGURATION',503);
  const through=new Date(initial-10800000).toISOString().replace('Z','-03:00');
  const from=Date.parse(day+'T00:00:00-03:00')/1000;
  if(!Number.isSafeInteger(from)||from>cutoff)throw dailyFailure('CLOCK_CONFIGURATION',503);
  let stopped=false,timer;
  const remaining=()=>{
    if(stopped)throw dailyFailure('READ_BUDGET',504);
    const elapsed=Math.max(0,Date.now()-wallStarted,clock()-initial);
    const left=DAILY_READ_BUDGET_MS-elapsed;
    if(left<5)throw dailyFailure('READ_BUDGET',504);
    return Math.min(timeoutMs,Math.floor(left));
  };
  const work=async()=>{
    const partnerKey=env.SHOPEE_FINANCE_PARTNER_KEY;
    if(typeof partnerKey!=='string'||!partnerKey.length||partnerKey.length>4096
      ||/[\u0000-\u001f\u007f]/.test(partnerKey))throw dailyFailure('SIGNING_KEY_CONFIGURATION',503);
    const keyBytes=dailyEncoder.encode(partnerKey);
    if(keyBytes.byteLength>8192){keyBytes.fill(0);throw dailyFailure('SIGNING_KEY_CONFIGURATION',503);}
    let key;
    try{key=await crypto.subtle.importKey('raw',keyBytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);}
    catch{throw dailyFailure('SIGNING_KEY_CONFIGURATION',503);}
    finally{keyBytes.fill(0);}
    const tokens=await ensureFinanceAccessToken(env,{fetchImpl,now,timeoutMs:remaining()});
    if(typeof tokens.access_token!=='string'||!tokens.access_token.length||tokens.access_token.length>8192
      ||/[\u0000-\u001f\u007f]/.test(tokens.access_token)||!Number.isSafeInteger(tokens.expires_at))throw dailyFailure('CONFIGURATION',503);
    const request=async(path,parameters)=>{
      const timeout=remaining(),timestamp=Math.floor(clock()/1000);
      if(tokens.expires_at<=timestamp)throw dailyFailure('AUTHORIZATION_EXPIRED',409);
      return requestFinanceAuthJson({input:{timestamp},prefix:'FINANCE_DAILY_ORDERS',
        options:{fetchImpl,now,timeoutMs:timeout},
        buildRequest:async()=>{
          remaining();
          const base=String(FINANCE_PROFILE.partner_id)+path+timestamp+tokens.access_token+FINANCE_PROFILE.shop_id;
          const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,dailyEncoder.encode(base)));
          remaining();
          const sign=Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
          const url=new URL(path,'https://partner.shopeemobile.com');
          for(const [name,value] of Object.entries({partner_id:FINANCE_PROFILE.partner_id,timestamp,
            access_token:tokens.access_token,shop_id:FINANCE_PROFILE.shop_id,sign,...parameters}))url.searchParams.set(name,String(value));
          return new Request(url,{method:'GET',redirect:'manual',headers:{Accept:'application/json'}});
        },normalizeResponse:payload=>{remaining();return dailyEnvelope(payload);}});
    };
    const identifiers=[],seen=new Set(),cursors=new Set();
    let cursor='',duplicates=0,pages=0,complete=false;
    for(let page=1;page<=DAILY_MAX_PAGES;page++){
      const response=await request(DAILY_ORDER_LIST,{time_range_field:'create_time',time_from:from,time_to:cutoff,page_size:100,cursor});
      const rows=response.order_list;
      if(!Array.isArray(rows)||rows.length>100||typeof response.more!=='boolean')throw dailyFailure('LIST_INVALID');
      for(const row of rows){
        if(!dailyPlain(row)||!dailyOrderId(row.order_sn))throw dailyFailure('ORDER_ID_INVALID');
        if(seen.has(row.order_sn))duplicates++;
        else{seen.add(row.order_sn);identifiers.push(row.order_sn);}
      }
      pages=page;
      if(!response.more){complete=true;break;}
      const next=response.next_cursor;
      if(!rows.length||!dailyCursor(next))throw dailyFailure('CURSOR_INVALID');
      if(next===cursor||cursors.has(next))throw dailyFailure('CURSOR_REPEATED');
      cursors.add(next);cursor=next;
    }
    if(!complete)throw dailyFailure('PAGE_LIMIT',409);
    const counters={sales_orders:0,cancelled_orders:0,cancellation_pending_orders:0,unpaid_orders:0,other_orders:0,unknown_status_orders:0};
    for(let index=0;index<identifiers.length;index+=50){
      const selected=identifiers.slice(index,index+50),expected=new Set(selected),received=new Set();
      const response=await request(DAILY_ORDER_DETAIL,{order_sn_list:selected.join(',')});
      if(!Array.isArray(response.order_list)||response.order_list.length!==selected.length)throw dailyFailure('DETAIL_SET_INVALID');
      for(const row of response.order_list){
        if(!dailyPlain(row)||!dailyOrderId(row.order_sn)||!expected.has(row.order_sn)||received.has(row.order_sn))throw dailyFailure('DETAIL_SET_INVALID');
        for(const field of ['shop_id','partner_id'])if(Object.hasOwn(row,field)&&row[field]!==FINANCE_PROFILE[field])throw dailyFailure('IDENTITY_MISMATCH');
        if(Object.hasOwn(row,'create_time')&&(!Number.isSafeInteger(row.create_time)||row.create_time<from||row.create_time>cutoff))throw dailyFailure('IDENTITY_MISMATCH');
        received.add(row.order_sn);counters[dailyBucket(row.order_status)]++;
      }
      if(received.size!==expected.size)throw dailyFailure('DETAIL_SET_INVALID');
    }
    remaining();
    const result=projectDailyOrdersFrame({schema:'shop_daily_sales_v1',shop_id:FINANCE_PROFILE.shop_id,date:day,
      timezone:'America/Sao_Paulo',through_at:through,day_partial:true,orders_in_api_window:identifiers.length,
      orders_with_details:identifiers.length,...counters,pagination_complete:true,pages_read:pages,duplicate_rows:duplicates,
      count_basis:'UNIQUE_ORDER_SN_CREATE_TIME_CURRENT_STATUS',source:'shopee_get_order_list_and_detail'});
    if(!result)throw dailyFailure('RESPONSE_INVALID');
    return result;
  };
  const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{stopped=true;reject(dailyFailure('READ_BUDGET',504));},DAILY_READ_BUDGET_MS);});
  try{return await Promise.race([work(),deadline]);}
  finally{stopped=true;clearTimeout(timer);}
}
