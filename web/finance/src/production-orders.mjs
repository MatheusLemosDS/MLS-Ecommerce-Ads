import {FINANCE_PROFILE,FinanceConnectionError} from './connection-store.mjs';
import {ensureFinanceAccessToken} from './refresh-coordinator.mjs';
import {requestFinanceAuthJson} from './auth-json-transport.mjs';
import {projectProductionOrdersRequest,projectProductionOrdersFrame} from './production-orders-frame.mjs';

const productionEncoder=new TextEncoder();
const productionFailure=(suffix,status=502)=>new FinanceConnectionError('FINANCE_PRODUCTION_'+suffix,status);
const productionSourcePlain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const productionSourceId=(value,zero=false)=>{const id=typeof value==='number'&&Number.isSafeInteger(value)?String(value):value;return typeof id==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(id)?id:null;};
const productionSourceSerial=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const productionSourceStatuses=new Set(['UNPAID','READY_TO_SHIP','PROCESSED','RETRY_SHIP','SHIPPED','TO_CONFIRM_RECEIVE','COMPLETED','IN_CANCEL','CANCELLED','INVOICE_PENDING','TO_RETURN']);

// Both operations make fresh provider reads. No prior financial aggregate or
// caller-supplied status is accepted as evidence that an order can be printed.
export async function runFinanceProductionOrders(env,options={}){
 const {fetchImpl,now=()=>Date.now(),timeoutMs=10000}=options;
 const input=projectProductionOrdersRequest(options.operation==='scan'?{operation:options.operation,start_date:options.start_date,end_date:options.end_date}:{operation:options.operation,order_ids:options.order_ids});
 if(!input)throw productionFailure('REQUEST_INVALID',400);
 if(env?.FINANCE_CONNECTION_ENABLED!=='true'||typeof fetchImpl!=='function'||typeof now!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>10000)throw productionFailure('CONFIGURATION',503);
 const clock=()=>{let stamp;try{stamp=now();}catch{throw productionFailure('CLOCK_CONFIGURATION',503);}if(!Number.isSafeInteger(stamp)||stamp<1||stamp>9999999999999)throw productionFailure('CLOCK_CONFIGURATION',503);return stamp;};
 const initial=clock(),wall=Date.now(),cutoff=Math.floor(initial/1000),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(initial));
 if(input.operation==='scan'&&input.end_date>today)throw productionFailure('REQUEST_INVALID',400);
 let stopped=false,timer;
 const remaining=()=>{const left=35000-Math.max(0,Date.now()-wall,clock()-initial);if(stopped||left<5)throw productionFailure('READ_BUDGET',504);return Math.min(timeoutMs,Math.floor(left));};
 const work=async()=>{
  const partnerKey=env.SHOPEE_FINANCE_PARTNER_KEY;
  if(typeof partnerKey!=='string'||!partnerKey.length||partnerKey.length>4096||/[\u0000-\u001f\u007f]/.test(partnerKey))throw productionFailure('SIGNING_KEY_CONFIGURATION',503);
  const bytes=productionEncoder.encode(partnerKey);let key;try{key=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);}finally{bytes.fill(0);}
  const tokens=await ensureFinanceAccessToken(env,{fetchImpl,now,timeoutMs:remaining()});
  if(typeof tokens.access_token!=='string'||!tokens.access_token.length||tokens.access_token.length>8192||/[\u0000-\u001f\u007f]/.test(tokens.access_token)||!Number.isSafeInteger(tokens.expires_at))throw productionFailure('CONFIGURATION',503);
  const get=async(path,parameters)=>{
   const timeout=remaining(),timestamp=Math.floor(clock()/1000);
   if(tokens.expires_at<=timestamp)throw productionFailure('AUTHORIZATION_EXPIRED',409);
   return requestFinanceAuthJson({input:{timestamp},prefix:'FINANCE_PRODUCTION',maximumBodyBytes:1048576,options:{fetchImpl,now,timeoutMs:timeout},buildRequest:async()=>{
    remaining();const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,productionEncoder.encode(String(FINANCE_PROFILE.partner_id)+path+timestamp+tokens.access_token+FINANCE_PROFILE.shop_id)));
    remaining();const url=new URL(path,'https://partner.shopeemobile.com');
    const sign=Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('');
    for(const [name,value] of Object.entries({partner_id:FINANCE_PROFILE.partner_id,timestamp,access_token:tokens.access_token,shop_id:FINANCE_PROFILE.shop_id,sign,...parameters}))url.searchParams.set(name,String(value));
    return new Request(url,{method:'GET',redirect:'manual',headers:{Accept:'application/json'}});
   },normalizeResponse:payload=>{
    remaining();if(!productionSourcePlain(payload)||payload.error!==''||!productionSourcePlain(payload.response))throw productionFailure('API_REJECTED');
    for(const value of [payload,payload.response])for(const field of ['shop_id','partner_id'])if(Object.hasOwn(value,field)&&value[field]!==FINANCE_PROFILE[field])throw productionFailure('IDENTITY_MISMATCH');
    return payload.response;
   }});
  };
  let orderIds;
  if(input.operation==='verify')orderIds=[...input.order_ids];
  else{
   const seen=new Set(),cursors=new Set();let cursor='',complete=false;orderIds=[];
   const from=Date.parse(input.start_date+'T00:00:00-03:00')/1000,to=Math.min(cutoff,Date.parse(input.end_date+'T00:00:00-03:00')/1000+86399);
   for(let page=0;page<10;page++){
    const response=await get('/api/v2/order/get_order_list',{time_range_field:'create_time',time_from:from,time_to:to,page_size:100,cursor});
    if(!Array.isArray(response.order_list)||response.order_list.length>100||typeof response.more!=='boolean')throw productionFailure('LIST_INVALID');
    for(const row of response.order_list){if(!productionSourcePlain(row)||!productionSourceSerial(row.order_sn))throw productionFailure('LIST_INVALID');if(!seen.has(row.order_sn)){seen.add(row.order_sn);orderIds.push(row.order_sn);}}
    if(!response.more){complete=true;break;}
    const next=response.next_cursor;if(!response.order_list.length||typeof next!=='string'||!next.length||next.length>2048||/[\u0000-\u0020\u007f-\uffff]/.test(next)||next===cursor||cursors.has(next))throw productionFailure('CURSOR_INVALID');cursors.add(next);cursor=next;
   }
   if(!complete||orderIds.length>1000)throw productionFailure('PAGE_LIMIT',409);
  }
  const orders=[];
  for(let index=0;index<orderIds.length;index+=50){
   const selected=orderIds.slice(index,index+50),seen=new Set();
   const response=await get('/api/v2/order/get_order_detail',{order_sn_list:selected.join(','),response_optional_fields:'item_list'});
   if(!Array.isArray(response.order_list)||response.order_list.length!==selected.length)throw productionFailure('DETAIL_SET_INVALID');
   for(const row of response.order_list){
    if(!productionSourcePlain(row)||!selected.includes(row.order_sn)||seen.has(row.order_sn))throw productionFailure('DETAIL_SET_INVALID');seen.add(row.order_sn);
    for(const field of ['shop_id','partner_id'])if(Object.hasOwn(row,field)&&row[field]!==FINANCE_PROFILE[field])throw productionFailure('IDENTITY_MISMATCH');
    const status=productionSourceStatuses.has(row.order_status)?row.order_status:'UNKNOWN',rawLines=row.item_list;
    if(rawLines!==undefined&&!Array.isArray(rawLines)||Array.isArray(rawLines)&&rawLines.length>200||rawLines===undefined&&['READY_TO_SHIP','PROCESSED','RETRY_SHIP','INVOICE_PENDING'].includes(status))throw productionFailure('LINES_INVALID');
    const lines=[],keys=new Set();
    for(const line of rawLines||[]){
     if(!productionSourcePlain(line))throw productionFailure('LINES_INVALID');const item_id=productionSourceId(line.item_id),model_id=productionSourceId(line.model_id,true),line_key=item_id+':'+model_id;
     if(!item_id||!model_id||keys.has(line_key))throw productionFailure('LINES_INVALID');keys.add(line_key);
     let sku=line.model_sku;if((sku===undefined||sku==='')&&model_id==='0')sku=line.item_sku;
     lines.push({line_key,item_id,model_id,sku:sku===undefined?'':sku,quantity:line.model_quantity_purchased,model_name:line.model_name===undefined?'':line.model_name});
    }
    orders.push({order_id:row.order_sn,status,create_time:row.create_time,update_time:row.update_time,lines});
   }
  }
  remaining();const frame=projectProductionOrdersFrame({schema:'production_orders_v1',shop_id:FINANCE_PROFILE.shop_id,checked_at:Math.floor(clock()/1000),start_date:input.operation==='scan'?input.start_date:null,end_date:input.operation==='scan'?input.end_date:null,complete:true,orders});
  if(!frame)throw productionFailure('RESPONSE_INVALID');return frame;
 };
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{stopped=true;reject(productionFailure('READ_BUDGET',504));},35000);});
 try{return await Promise.race([work(),deadline]);}finally{stopped=true;clearTimeout(timer);}
}
