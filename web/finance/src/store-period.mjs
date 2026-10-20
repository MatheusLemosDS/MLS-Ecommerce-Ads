import {FINANCE_PROFILE,FinanceConnectionError} from './connection-store.mjs';
import {ensureFinanceAccessToken} from './refresh-coordinator.mjs';
import {requestFinanceAuthJson} from './auth-json-transport.mjs';
import {projectStorePeriodRequest,projectStorePeriodFrame,normalizeStoreDecimal,addStoreDecimals} from './store-period-frame.mjs';

const STORE_ORIGIN='https://partner.shopeemobile.com';
const STORE_LIST='/api/v2/order/get_order_list';
const STORE_DETAIL='/api/v2/order/get_order_detail';
const STORE_PAYMENT='/api/v2/payment/get_escrow_detail';
const storeEncoder=new TextEncoder();
const storeFailure=(suffix,status=502)=>new FinanceConnectionError('FINANCE_STORE_'+suffix,status);
const storeObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const storeSerial=value=>typeof value==='string'&&value.length>0&&value.length<=128&&!/[^\x21-\x7e]|,/.test(value);
const storeCursor=value=>typeof value==='string'&&value.length>0&&value.length<=1024&&!/[^\x21-\x7e]/.test(value);
const storeHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',storeEncoder.encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
const storeIdentity=[FINANCE_PROFILE.partner_id,FINANCE_PROFILE.shop_id];
const STORE_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS finance_store_period_runs (run_id TEXT PRIMARY KEY,partner_id INTEGER NOT NULL,shop_id INTEGER NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,time_from INTEGER NOT NULL,time_to INTEGER NOT NULL,cutoff_at INTEGER NOT NULL,checked_at INTEGER NOT NULL,created_at INTEGER NOT NULL,cursor TEXT NOT NULL,pages_read INTEGER NOT NULL,duplicate_orders INTEGER NOT NULL,lease_owner TEXT,lease_until INTEGER,last_error TEXT)`,
 `CREATE TABLE IF NOT EXISTS finance_store_period_orders (run_id TEXT NOT NULL,order_hash TEXT NOT NULL,escrow_raw TEXT,ads_raw TEXT,returns_seen INTEGER,items TEXT NOT NULL,source_hash TEXT NOT NULL,checked_at INTEGER NOT NULL,PRIMARY KEY(run_id,order_hash))`,
 `CREATE TABLE IF NOT EXISTS finance_store_period_cursors (run_id TEXT NOT NULL,cursor_hash TEXT NOT NULL,PRIMARY KEY(run_id,cursor_hash))`,
];

function storeCatalogId(value,zero=false){
 if(typeof value==='number'){if(!Number.isSafeInteger(value)||value<(zero?0:1))throw storeFailure('RESPONSE_INVALID');value=String(value);}
 if(typeof value!=='string'||!(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(value))throw storeFailure('RESPONSE_INVALID');
 return value;
}
function storeItems(rows,quantityField){
 if(!Array.isArray(rows)||rows.length<1||rows.length>1000)throw storeFailure('RESPONSE_INVALID');
 const grouped=new Map(),lineIds=new Set();
 for(const row of rows){
  if(!storeObject(row))throw storeFailure('RESPONSE_INVALID');
  const item_id=storeCatalogId(row.item_id),model_id=storeCatalogId(row.model_id,true),quantity=row[quantityField];
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000000)throw storeFailure('RESPONSE_INVALID');
  if(quantityField==='quantity_purchased'&&Object.hasOwn(row,'line_item_id')){
   const id=storeCatalogId(row.line_item_id,true);if(lineIds.has(id))throw storeFailure('RESPONSE_INVALID');lineIds.add(id);
  }
  const key=item_id+':'+model_id,previous=grouped.get(key);const total=(previous?.quantity||0)+quantity;
  if(!Number.isSafeInteger(total)||total>1000000000000)throw storeFailure('RESPONSE_INVALID');
  grouped.set(key,{item_id,model_id,quantity:total});
 }
 return [...grouped.values()].sort((a,b)=>a.item_id.length-b.item_id.length||a.item_id.localeCompare(b.item_id)||a.model_id.length-b.model_id.length||a.model_id.localeCompare(b.model_id));
}
function storeProviderAmount(income,name){
 if(!Object.hasOwn(income,name)||income[name]===null)return null;
 if(typeof income[name]!=='number')throw storeFailure('RESPONSE_INVALID');
 const value=normalizeStoreDecimal(income[name],'1000000000000');
 if(value===null)throw storeFailure('RESPONSE_INVALID');return value;
}
function storeEnvelope(payload){
 if(!storeObject(payload)||typeof payload.error!=='string'||payload.error!==''||!storeObject(payload.response))throw storeFailure('RESPONSE_INVALID');
 for(const row of [payload,payload.response])for(const field of ['partner_id','shop_id'])if(Object.hasOwn(row,field)&&row[field]!==FINANCE_PROFILE[field])throw storeFailure('IDENTITY_MISMATCH');
 return payload.response;
}
function storeMidnight(day){
 const target=Date.parse(day+'T00:00:00Z'),formatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',timeZoneName:'longOffset'});
 let candidate=target;
 for(let i=0;i<2;i++){
  const label=formatter.formatToParts(new Date(candidate)).find(part=>part.type==='timeZoneName')?.value;
  const match=/^GMT([+-])(\d{2}):(\d{2})$/.exec(label||'');if(!match)throw storeFailure('CLOCK_CONFIGURATION',503);
  const offset=(Number(match[2])*3600+Number(match[3])*60)*(match[1]==='+'?1:-1);candidate=target-offset*1000;
 }
 return Math.floor(candidate/1000);
}
function storeFrame(run,records,diagnostic){
 if(!run||run.partner_id!==FINANCE_PROFILE.partner_id||run.shop_id!==FINANCE_PROFILE.shop_id||!Array.isArray(records)||records.length>1000)throw storeFailure('STORAGE_INVALID',503);
 const grouped=new Map(),productGroups=new Map();let returnsOrders=0,returnsKnown=true;
 const returnGroups=Object.fromEntries(['with_return','without_reported_return','unknown'].map(kind=>[kind,{order_count:0,payouts:[],known:true}]));
 const escrows=[],ads=[];let escrowKnown=true,adsKnown=true;
 const exclusivePayouts=[],mixedPayouts=[];let exclusiveOrders=0,mixedOrders=0,exclusiveKnown=true,mixedKnown=true;
 for(const record of records){
  if(!/^[a-f0-9]{64}$/.test(record.order_hash)||!/^[a-f0-9]{64}$/.test(record.source_hash))throw storeFailure('STORAGE_INVALID',503);
  for(const [field,values] of [['escrow_raw',escrows],['ads_raw',ads]]){
   if(record[field]===null){if(field==='escrow_raw')escrowKnown=false;else adsKnown=false;}
   else if(typeof record[field]!=='string'||normalizeStoreDecimal(record[field],'1000000000000')!==record[field])throw storeFailure('STORAGE_INVALID',503);
   else values.push(record[field]);
  }
  if(record.returns_seen===null)returnsKnown=false;
  else if(record.returns_seen===0||record.returns_seen===1)returnsOrders+=record.returns_seen;
  else throw storeFailure('STORAGE_INVALID',503);
  const returnsKind=record.returns_seen===null?'unknown':record.returns_seen===1?'with_return':'without_reported_return';
  const returnsGroup=returnGroups[returnsKind];returnsGroup.order_count++;
  if(record.escrow_raw===null)returnsGroup.known=false;else returnsGroup.payouts.push(record.escrow_raw);
  let items;try{items=JSON.parse(record.items);}catch{throw storeFailure('STORAGE_INVALID',503);}
  if(!Array.isArray(items)||!items.length||items.length>1000)throw storeFailure('STORAGE_INVALID',503);
  const seen=new Set(),orderProducts=new Set();
  for(const row of items){
   if(!storeObject(row)||Object.keys(row).length!==3||!Object.hasOwn(row,'item_id')||!Object.hasOwn(row,'model_id')||!Object.hasOwn(row,'quantity')||storeCatalogId(row.item_id)!==row.item_id||storeCatalogId(row.model_id,true)!==row.model_id||!Number.isSafeInteger(row.quantity)||row.quantity<1||row.quantity>1000000000000)throw storeFailure('STORAGE_INVALID',503);
   const key=row.item_id+':'+row.model_id;if(seen.has(key))throw storeFailure('STORAGE_INVALID',503);seen.add(key);
   const total=(grouped.get(key)?.quantity||0)+row.quantity;if(!Number.isSafeInteger(total)||total>1000000000000)throw storeFailure('STORAGE_INVALID',503);
   grouped.set(key,{item_id:row.item_id,model_id:row.model_id,quantity:total});
   orderProducts.add(row.item_id);
  }
  const exclusive=orderProducts.size===1;
  if(exclusive){exclusiveOrders++;if(record.escrow_raw===null)exclusiveKnown=false;else exclusivePayouts.push(record.escrow_raw);}
  else {mixedOrders++;if(record.escrow_raw===null)mixedKnown=false;else mixedPayouts.push(record.escrow_raw);}
  for(const item_id of orderProducts){
   const product=productGroups.get(item_id)||{item_id,order_count:0,exclusive_order_count:0,mixed_order_count:0,payouts:[],payout_known:true,returns_orders:0,returns_known:true,with_return_orders:0,without_reported_return_orders:0,unknown_orders:0};
   product.order_count++;
   product[returnsKind+'_orders']++;
   if(exclusive){product.exclusive_order_count++;if(record.escrow_raw===null)product.payout_known=false;else product.payouts.push(record.escrow_raw);}
   else product.mixed_order_count++;
   if(record.returns_seen===null)product.returns_known=false;else product.returns_orders+=record.returns_seen;
   productGroups.set(item_id,product);
  }
 }
 if(grouped.size>1000)throw storeFailure('GROUP_LIMIT',409);
 const result=projectStorePeriodFrame({schema:'finance_store_period_v1',run_id:run.run_id,revision:run.revision,status:run.status,
  start_date:run.start_date,end_date:run.end_date,cutoff_at:run.cutoff_at,checked_at:run.checked_at,currency:'BRL',monetary_unit:'UNCONFIRMED',
  order_count:records.length,pages_read:run.pages_read,duplicate_orders:run.duplicate_orders,returns_orders:returnsKnown?returnsOrders:null,
  escrow_amount_raw:escrowKnown?addStoreDecimals(escrows):null,ads_recharge_or_support_raw:adsKnown?addStoreDecimals(ads):null,
  items:[...grouped.values()],diagnostic:diagnostic===undefined?run.last_error:diagnostic,
  product_breakdown:{schema:'store_product_breakdown_v1',exclusive_order_count:exclusiveOrders,mixed_order_count:mixedOrders,
   exclusive_payout_raw:exclusiveKnown?addStoreDecimals(exclusivePayouts):null,mixed_payout_raw:mixedKnown?addStoreDecimals(mixedPayouts):null,
   products:[...productGroups.values()].map(product=>({item_id:product.item_id,order_count:product.order_count,
    exclusive_order_count:product.exclusive_order_count,mixed_order_count:product.mixed_order_count,
    exclusive_payout_raw:product.payout_known?addStoreDecimals(product.payouts):null,returns_orders:product.returns_known?product.returns_orders:null}))},
  returns_breakdown:{schema:'store_returns_breakdown_v1',
   ...Object.fromEntries(Object.entries(returnGroups).map(([kind,group])=>[kind,{order_count:group.order_count,payout_raw:group.known?addStoreDecimals(group.payouts):null}])),
   products:[...productGroups.values()].map(product=>({item_id:product.item_id,order_count:product.order_count,
    with_return_orders:product.with_return_orders,without_reported_return_orders:product.without_reported_return_orders,unknown_orders:product.unknown_orders}))}});
 if(!result)throw storeFailure('STORAGE_INVALID',503);return result;
}

// A job has a fixed creation-date cohort/cutoff and one bounded provider page per
// explicit step. Neither order numbers nor provider cursors reach the browser.
export async function runFinanceStorePeriod(env,options={}){
 if(!storeObject(options)||env?.FINANCE_CONNECTION_ENABLED!=='true'||!env?.FINANCE_DB||typeof env.FINANCE_DB.prepare!=='function'||typeof env.FINANCE_DB.batch!=='function'||env.ADMIN_DB===env.FINANCE_DB)throw storeFailure('CONFIGURATION',503);
 const {operation,fetchImpl,now=()=>Date.now(),timeoutMs=5000}=options;
 const input=projectStorePeriodRequest(operation==='start'?{operation,start_date:options.start_date,end_date:options.end_date}:{operation,run_id:options.run_id});
 if(!input)throw storeFailure('REQUEST_INVALID',400);
 const epoch=()=>{let value;try{value=now();}catch{throw storeFailure('CLOCK_CONFIGURATION',503);}if(!Number.isSafeInteger(value)||value<=0||Math.floor(value/1000)>9999999999)throw storeFailure('CLOCK_CONFIGURATION',503);return Math.floor(value/1000);};
 const initialTime=epoch(),db=env.FINANCE_DB;
 const prepare=(sql,args=[])=>db.prepare(sql).bind(...args);
 const storage=async operation=>{try{return await operation();}catch(error){if(error instanceof FinanceConnectionError)throw error;throw storeFailure('STORAGE_UNAVAILABLE',503);}};
 await storage(()=>db.batch(STORE_SCHEMA.map(sql=>db.prepare(sql))));
 const snapshot=async(run_id,diagnostic)=>{
  const rows=await storage(()=>db.batch([
   prepare('SELECT * FROM finance_store_period_runs WHERE run_id=? AND partner_id=? AND shop_id=?',[run_id,...storeIdentity]),
   prepare('SELECT order_hash,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at FROM finance_store_period_orders WHERE run_id=? AND EXISTS(SELECT 1 FROM finance_store_period_runs WHERE run_id=? AND partner_id=? AND shop_id=?) ORDER BY order_hash',[run_id,run_id,...storeIdentity]),
  ]));
  const run=rows[0]?.results?.[0];if(!run)throw storeFailure('RUN_NOT_FOUND',404);
  const records=rows[1]?.results;if(!Array.isArray(records))throw storeFailure('STORAGE_INVALID',503);
  if(!projectStorePeriodRequest({operation:'start',start_date:run.start_date,end_date:run.end_date}))throw storeFailure('STORAGE_INVALID',503);
  const nextDay=new Date(Date.parse(run.end_date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  if(run.time_from!==storeMidnight(run.start_date)||run.time_to!==Math.min(run.cutoff_at,storeMidnight(nextDay)-1)
   ||run.cursor!==''&&!storeCursor(run.cursor))throw storeFailure('STORAGE_INVALID',503);
  for(const record of records){
   const canonical={order_hash:record.order_hash,escrow_raw:record.escrow_raw,ads_raw:record.ads_raw,returns_seen:record.returns_seen,items:record.items,checked_at:record.checked_at};
   if(await storeHash(JSON.stringify(canonical))!==record.source_hash)throw storeFailure('STORAGE_INVALID',503);
  }
  return {run,records,frame:storeFrame(run,records,run.status==='RUNNING'?diagnostic:undefined)};
 };
 if(input.operation==='start'){
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(initialTime*1000));
  if(input.end_date>today)throw storeFailure('REQUEST_INVALID',400);
  const nextDay=new Date(Date.parse(input.end_date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  const timeFrom=storeMidnight(input.start_date),timeTo=Math.min(initialTime,storeMidnight(nextDay)-1);
  if(timeTo<timeFrom)throw storeFailure('REQUEST_INVALID',400);
  // Automatic dashboard loading reuses a recent cohort. The INSERT guard below
  // makes concurrent page loads share one run without another provider import.
  const recentSql="SELECT run_id FROM finance_store_period_runs WHERE partner_id=? AND shop_id=? AND start_date=? AND end_date=? AND cutoff_at>=? AND status IN ('RUNNING','COMPLETE') ORDER BY created_at DESC,run_id DESC LIMIT 1";
  const recentArgs=[...storeIdentity,input.start_date,input.end_date,initialTime-900];
  const recent=await storage(()=>prepare(recentSql,recentArgs).first());
  if(recent)return (await snapshot(recent.run_id)).frame;
  const cutoff=initialTime-30*86400;
  await storage(()=>db.batch([
   prepare('DELETE FROM finance_store_period_orders WHERE run_id IN (SELECT run_id FROM finance_store_period_runs WHERE created_at<? AND partner_id=? AND shop_id=?)',[cutoff,...storeIdentity]),
   prepare('DELETE FROM finance_store_period_cursors WHERE run_id IN (SELECT run_id FROM finance_store_period_runs WHERE created_at<? AND partner_id=? AND shop_id=?)',[cutoff,...storeIdentity]),
   prepare('DELETE FROM finance_store_period_runs WHERE created_at<? AND partner_id=? AND shop_id=?',[cutoff,...storeIdentity]),
  ]));
  // These runs are a bounded query cache, not a financial ledger. At capacity,
  // expire the oldest stale idle entry so routine automatic opens cannot make
  // the dashboard unusable until the thirty-day age limit is reached.
  const evict="SELECT run_id FROM finance_store_period_runs WHERE partner_id=? AND shop_id=? AND cutoff_at<? AND (lease_owner IS NULL OR lease_until<=?) AND (SELECT COUNT(*) FROM finance_store_period_runs WHERE partner_id=? AND shop_id=?)>=60 ORDER BY created_at,run_id LIMIT 1";
  const evictArgs=[...storeIdentity,initialTime-900,initialTime,...storeIdentity];
  await storage(()=>db.batch([
   prepare('DELETE FROM finance_store_period_orders WHERE run_id IN ('+evict+')',evictArgs),
   prepare('DELETE FROM finance_store_period_cursors WHERE run_id IN ('+evict+')',evictArgs),
   prepare('DELETE FROM finance_store_period_runs WHERE run_id IN ('+evict+')',evictArgs),
  ]));
  const count=await storage(()=>prepare('SELECT COUNT(*) AS n FROM finance_store_period_runs WHERE partner_id=? AND shop_id=?',storeIdentity).first());if(!count||count.n>=60)throw storeFailure('RUN_LIMIT',409);
  const run_id=crypto.randomUUID(),cursorHash=await storeHash('');
  const created=await storage(()=>db.batch([
   prepare("INSERT INTO finance_store_period_runs(run_id,partner_id,shop_id,revision,status,start_date,end_date,time_from,time_to,cutoff_at,checked_at,created_at,cursor,pages_read,duplicate_orders,lease_owner,lease_until,last_error) SELECT ?,?,?,1,'RUNNING',?,?,?,?,?,?,?,'',0,0,NULL,NULL,NULL WHERE NOT EXISTS("+recentSql+") AND (SELECT COUNT(*) FROM finance_store_period_runs WHERE partner_id=? AND shop_id=?)<60",[run_id,...storeIdentity,input.start_date,input.end_date,timeFrom,timeTo,initialTime,initialTime,initialTime,...recentArgs,...storeIdentity]),
   prepare('INSERT INTO finance_store_period_cursors(run_id,cursor_hash) SELECT ?,? WHERE EXISTS(SELECT 1 FROM finance_store_period_runs WHERE run_id=?)',[run_id,cursorHash,run_id]),
  ]));
  if(created[0]?.meta?.changes!==1){
   const winner=await storage(()=>prepare(recentSql,recentArgs).first());
   if(!winner)throw storeFailure('RUN_LIMIT',409);
   return (await snapshot(winner.run_id)).frame;
  }
  return (await snapshot(run_id)).frame;
 }
 const observed=await snapshot(input.run_id);
 if(input.operation==='read'||observed.run.status!=='RUNNING')return observed.frame;
 if(typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>5000)throw storeFailure('CONFIGURATION',503);
 const owner=crypto.randomUUID(),leaseUntil=initialTime+45,run=observed.run;
 const lease=await storage(()=>prepare("UPDATE finance_store_period_runs SET lease_owner=?,lease_until=? WHERE run_id=? AND partner_id=? AND shop_id=? AND revision=? AND status='RUNNING' AND (lease_owner IS NULL OR lease_until<=?)",[owner,leaseUntil,input.run_id,...storeIdentity,run.revision,initialTime]).run());
 if(lease?.meta?.changes!==1)return (await snapshot(input.run_id,'STORE_PERIOD_CONFLICT')).frame;
 const guard="run_id=? AND partner_id=? AND shop_id=? AND revision=? AND status='RUNNING' AND lease_owner=? AND lease_until>?";
 const guardArgs=stamp=>[input.run_id,...storeIdentity,run.revision,owner,stamp];
 try{
  const partnerKey=env.SHOPEE_FINANCE_PARTNER_KEY;
  if(typeof partnerKey!=='string'||!partnerKey.length||partnerKey.length>4096||/[\u0000-\u001f\u007f]/.test(partnerKey))throw storeFailure('SIGNING_CONFIGURATION',503);
  const rawKey=storeEncoder.encode(partnerKey);let key;
  try{if(rawKey.length>8192)throw storeFailure('SIGNING_CONFIGURATION',503);key=await crypto.subtle.importKey('raw',rawKey,{name:'HMAC',hash:'SHA-256'},false,['sign']);}finally{rawKey.fill(0);}
  const tokens=await ensureFinanceAccessToken(env,{fetchImpl,now,timeoutMs});
  const get=async(path,query)=>{
   const timestamp=epoch();if(tokens.expires_at<=timestamp)throw storeFailure('AUTHORIZATION_EXPIRED',409);
   return requestFinanceAuthJson({input:{timestamp},options:{fetchImpl,now,timeoutMs},prefix:'FINANCE_STORE',
    buildRequest:async()=>{
     const base=String(FINANCE_PROFILE.partner_id)+path+timestamp+tokens.access_token+FINANCE_PROFILE.shop_id;
     const sign=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,storeEncoder.encode(base))),byte=>byte.toString(16).padStart(2,'0')).join('');
     const url=new URL(path,STORE_ORIGIN);
     for(const [name,value] of Object.entries({partner_id:FINANCE_PROFILE.partner_id,timestamp,access_token:tokens.access_token,shop_id:FINANCE_PROFILE.shop_id,sign,...query}))url.searchParams.set(name,String(value));
     return new Request(url,{method:'GET',redirect:'manual',headers:{Accept:'application/json'}});
    },normalizeResponse:storeEnvelope});
  };
  const listing=await get(STORE_LIST,{time_range_field:'create_time',time_from:run.time_from,time_to:run.time_to,order_status:'COMPLETED',page_size:5,cursor:run.cursor});
  if(!Array.isArray(listing.order_list)||listing.order_list.length>5||typeof listing.more!=='boolean')throw storeFailure('LIST_INVALID');
  let nextCursor='';
  if(listing.more){
   nextCursor=listing.next_cursor;
   if(!listing.order_list.length||!storeCursor(nextCursor)||nextCursor===run.cursor)throw storeFailure('CURSOR_INVALID');
   const nextHash=await storeHash(nextCursor);
   const prior=await storage(()=>prepare('SELECT cursor_hash FROM finance_store_period_cursors WHERE run_id=? AND cursor_hash=?',[input.run_id,nextHash]).first());
   if(prior)throw storeFailure('CURSOR_INVALID');
  }
  const known=new Set(observed.records.map(record=>record.order_hash)),selected=[],pageSeen=new Set();let duplicates=0;
  for(const row of listing.order_list){
   if(!storeObject(row)||!storeSerial(row.order_sn)||Object.hasOwn(row,'order_status')&&row.order_status!=='COMPLETED')throw storeFailure('LIST_INVALID');
   const orderHash=await storeHash(row.order_sn);
   if(known.has(orderHash)||pageSeen.has(orderHash)){duplicates++;continue;}
   pageSeen.add(orderHash);selected.push({serial:row.order_sn,orderHash});
  }
  let details=[];
  if(selected.length){
   const response=await get(STORE_DETAIL,{order_sn_list:selected.map(row=>row.serial).join(','),response_optional_fields:'item_list'});
   if(!Array.isArray(response.order_list)||response.order_list.length!==selected.length)throw storeFailure('DETAIL_INVALID');
   const bySerial=new Map();
   for(const row of response.order_list){
    if(!storeObject(row)||!selected.some(entry=>entry.serial===row.order_sn)||bySerial.has(row.order_sn)||row.order_status!=='COMPLETED'||row.currency!=='BRL')throw storeFailure('DETAIL_INVALID');
    bySerial.set(row.order_sn,storeItems(row.item_list,'model_quantity_purchased'));
   }
   details=selected.map(row=>({...row,items:bySerial.get(row.serial)}));
  }
  const records=new Array(details.length);let index=0,failed;
  const worker=async()=>{
   while(!failed){const position=index++;if(position>=details.length)return;const selection=details[position];
    try{
     const payment=await get(STORE_PAYMENT,{order_sn:selection.serial});
     if(!storeObject(payment.order_income))throw storeFailure('PAYMENT_INVALID');
     const echoes=[payment,payment.order_income].filter(row=>Object.hasOwn(row,'order_sn'));
     if(!echoes.length||echoes.some(row=>row.order_sn!==selection.serial))throw storeFailure('IDENTITY_MISMATCH');
     const items=storeItems(payment.order_income.items,'quantity_purchased');
     if(JSON.stringify(items)!==JSON.stringify(selection.items))throw storeFailure('LINE_IDENTITY_MISMATCH');
     let returnsSeen=null;
     if(Object.hasOwn(payment,'return_order_sn_list')){
      if(!Array.isArray(payment.return_order_sn_list)||payment.return_order_sn_list.length>100||!payment.return_order_sn_list.every(storeSerial)||new Set(payment.return_order_sn_list).size!==payment.return_order_sn_list.length)throw storeFailure('PAYMENT_INVALID');
      returnsSeen=Number(payment.return_order_sn_list.length>0);
     }
     const record={order_hash:selection.orderHash,escrow_raw:storeProviderAmount(payment.order_income,'escrow_amount'),ads_raw:storeProviderAmount(payment.order_income,'ads_escrow_top_up_fee_or_technical_support_fee'),returns_seen:returnsSeen,items:JSON.stringify(items),checked_at:epoch()};
     record.source_hash=await storeHash(JSON.stringify(record));records[position]=record;
    }catch(error){failed=error;return;}
   }
  };
  await Promise.all([worker(),worker()]);if(failed)throw failed;
  const stamp=epoch(),pages=run.pages_read+1,orderCount=observed.records.length+records.length;
  let status=!listing.more?'COMPLETE':pages>=200||orderCount>=1000?'LIMIT_REACHED':'RUNNING';
  try{storeFrame({...run,revision:run.revision+1,status,checked_at:stamp,pages_read:pages,duplicate_orders:run.duplicate_orders+duplicates,last_error:null},[...observed.records,...records]);}
  catch(error){if(error instanceof FinanceConnectionError&&error.code==='FINANCE_STORE_GROUP_LIMIT'){
   const limit=await storage(()=>prepare("UPDATE finance_store_period_runs SET status='LIMIT_REACHED',revision=revision+1,checked_at=?,lease_owner=NULL,lease_until=NULL,last_error=NULL WHERE "+guard,[stamp,...guardArgs(stamp)]).run());
   return (await snapshot(input.run_id,limit.meta.changes===1?undefined:'STORE_PERIOD_CONFLICT')).frame;
  }throw error;}
  const statements=records.map(record=>prepare('INSERT INTO finance_store_period_orders(run_id,order_hash,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM finance_store_period_runs WHERE '+guard+')',[input.run_id,record.order_hash,record.escrow_raw,record.ads_raw,record.returns_seen,record.items,record.source_hash,record.checked_at,...guardArgs(stamp)]));
  if(listing.more)statements.push(prepare('INSERT INTO finance_store_period_cursors(run_id,cursor_hash) SELECT ?,? WHERE EXISTS(SELECT 1 FROM finance_store_period_runs WHERE '+guard+')',[input.run_id,await storeHash(nextCursor),...guardArgs(stamp)]));
  statements.push(prepare('UPDATE finance_store_period_runs SET cursor=?,pages_read=?,duplicate_orders=?,status=?,revision=revision+1,checked_at=?,lease_owner=NULL,lease_until=NULL,last_error=NULL WHERE '+guard,[nextCursor,pages,run.duplicate_orders+duplicates,status,stamp,...guardArgs(stamp)]));
  const committed=await storage(()=>db.batch(statements));
  return (await snapshot(input.run_id,committed.at(-1)?.meta?.changes===1?undefined:'STORE_PERIOD_CONFLICT')).frame;
 }catch(error){
  const stamp=epoch();await storage(()=>prepare("UPDATE finance_store_period_runs SET lease_owner=NULL,lease_until=NULL,last_error='STORE_PERIOD_UPSTREAM_UNAVAILABLE',checked_at=? WHERE run_id=? AND partner_id=? AND shop_id=? AND revision=? AND lease_owner=?",[stamp,input.run_id,...storeIdentity,run.revision,owner]).run());
  return (await snapshot(input.run_id)).frame;
 }
}
