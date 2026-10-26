import {FINANCE_PROFILE,FinanceConnectionError} from './connection-store.mjs';
import {ensureFinanceAccessToken} from './refresh-coordinator.mjs';
import {requestFinanceAuthJson} from './auth-json-transport.mjs';
import {projectBusinessPeriodRequest,projectBusinessPeriodFrame} from './business-period-frame.mjs';
import {FINANCIAL_ORDER_EVIDENCE_SCHEMA,buildFinancialOrderEvidence,projectFinancialOrderEvidence} from './financial-order-evidence.mjs';

// A creation-time cohort of every order, classified from current detail status.
// Only the existing read APIs are used; no Ads attribution or settlement is inferred.
const BUSINESS_ORIGIN='https://partner.shopeemobile.com';
const BUSINESS_LIST='/api/v2/order/get_order_list';
const BUSINESS_DETAIL='/api/v2/order/get_order_detail';
const BUSINESS_PAYMENT='/api/v2/payment/get_escrow_detail';
const BUSINESS_PAGE_CAPACITY=20;
const businessSalesStatuses=new Set(['READY_TO_SHIP','PROCESSED','RETRY_SHIP','SHIPPED','TO_CONFIRM_RECEIVE','COMPLETED','INVOICE_PENDING']);
const businessEncoder=new TextEncoder();
const businessIdentity=[FINANCE_PROFILE.partner_id,FINANCE_PROFILE.shop_id];
const businessFailure=(suffix,status=502)=>new FinanceConnectionError('FINANCE_BUSINESS_'+suffix,status);
const businessPlain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const businessSerial=value=>typeof value==='string'&&value.length>0&&value.length<=128&&!/[^\x21-\x7e]|,/.test(value);
const businessCursor=value=>typeof value==='string'&&value.length>0&&value.length<=1024&&!/[^\x21-\x7e]/.test(value);
const businessHash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',businessEncoder.encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
const businessBuckets=['completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown'];
const BUSINESS_SCHEMA=[
 ...FINANCIAL_ORDER_EVIDENCE_SCHEMA,
 `CREATE TABLE IF NOT EXISTS finance_business_period_runs (run_id TEXT PRIMARY KEY,partner_id INTEGER NOT NULL,shop_id INTEGER NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,time_from INTEGER NOT NULL,time_to INTEGER NOT NULL,cutoff_at INTEGER NOT NULL,checked_at INTEGER NOT NULL,created_at INTEGER NOT NULL,cursor TEXT NOT NULL,pages_read INTEGER NOT NULL,duplicate_orders INTEGER NOT NULL,lease_owner TEXT,lease_until INTEGER,last_error TEXT)`,
 `CREATE TABLE IF NOT EXISTS finance_business_period_orders (run_id TEXT NOT NULL,order_hash TEXT NOT NULL,bucket TEXT NOT NULL,payment_covered INTEGER NOT NULL,sales_raw TEXT,escrow_raw TEXT,ads_raw TEXT,returns_seen INTEGER,items TEXT NOT NULL,source_hash TEXT NOT NULL,checked_at INTEGER NOT NULL,PRIMARY KEY(run_id,order_hash))`,
 `CREATE TABLE IF NOT EXISTS finance_business_period_cursors (run_id TEXT NOT NULL,cursor_hash TEXT NOT NULL,PRIMARY KEY(run_id,cursor_hash))`,
 `CREATE TABLE IF NOT EXISTS finance_business_period_payment_cache (run_id TEXT NOT NULL,order_hash TEXT NOT NULL,bucket TEXT NOT NULL,payment_covered INTEGER NOT NULL,sales_raw TEXT,escrow_raw TEXT,ads_raw TEXT,returns_seen INTEGER,items TEXT NOT NULL,source_hash TEXT NOT NULL,checked_at INTEGER NOT NULL,PRIMARY KEY(run_id,order_hash))`,
];

function businessBucket(status){
 if(status==='COMPLETED')return 'completed';
 if(businessSalesStatuses.has(status))return 'ongoing';
 if(status==='CANCELLED')return 'cancelled';
 if(status==='IN_CANCEL')return 'cancel_pending';
 if(status==='UNPAID')return 'unpaid';
 return status==='TO_RETURN'?'other':'unknown';
}
function businessId(value,zero=false){
 if(typeof value==='number'){if(!Number.isSafeInteger(value)||value<(zero?0:1))throw businessFailure('RESPONSE_INVALID');value=String(value);}
 if(typeof value!=='string'||!(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(value))throw businessFailure('RESPONSE_INVALID');
 return value;
}
function businessItems(rows,field){
 if(!Array.isArray(rows)||!rows.length||rows.length>1000)throw businessFailure('RESPONSE_INVALID');
 const grouped=new Map(),lineIds=new Set();
 for(const row of rows){
  if(!businessPlain(row))throw businessFailure('RESPONSE_INVALID');
  const item_id=businessId(row.item_id),model_id=businessId(row.model_id,true),quantity=row[field];
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>(field==='quantity'?1000000000000:1000000000))throw businessFailure('RESPONSE_INVALID');
  if(field==='quantity_purchased'&&Object.hasOwn(row,'line_item_id')){const id=businessId(row.line_item_id,true);if(lineIds.has(id))throw businessFailure('RESPONSE_INVALID');lineIds.add(id);}
  const key=item_id+':'+model_id,total=(grouped.get(key)?.quantity||0)+quantity;
  if(!Number.isSafeInteger(total)||total>1000000000000)throw businessFailure('RESPONSE_INVALID');
  grouped.set(key,{item_id,model_id,quantity:total});
 }
 return [...grouped.values()].sort((a,b)=>a.item_id.length-b.item_id.length||a.item_id.localeCompare(b.item_id)||a.model_id.length-b.model_id.length||a.model_id.localeCompare(b.model_id));
}
function businessRaw(cents){
 const negative=cents<0n;if(negative)cents=-cents;
 const fraction=(cents%100n).toString().padStart(2,'0').replace(/0+$/,'');
 return (negative?'-':'')+(cents/100n).toString()+(fraction?'.'+fraction:'');
}
function businessCents(raw,bound=100000000000000000n){
 if(typeof raw!=='string'||raw.length>40)return null;
 const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(raw);if(!match)return null;
 let cents=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));if(match[1])cents=-cents;
 return cents< -bound||cents>bound||businessRaw(cents)!==raw?null:cents;
}
function businessAmount(income,field,{positive=false}={}){
 if(!Object.hasOwn(income,field)||income[field]===null)return null;
 const value=income[field];
 if(typeof value!=='number'||!Number.isFinite(value)||Object.is(value,-0)||Math.abs(value)>1000000000000||positive&&value<0)throw businessFailure('PAYMENT_INVALID');
 // The source JSON number must itself represent an exact BRL-cent value. Never
 // round a provider sub-cent amount or a binary arithmetic artefact into money.
 const text=String(value),match=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(text);
 if(!match)throw businessFailure('PAYMENT_INVALID');
 let digits=(match[2]+(match[3]||'')).replace(/^0+/,'')||'0',scale=(match[3]||'').length-Number(match[4]||0);
 while(scale>0&&digits.endsWith('0')){digits=digits.slice(0,-1)||'0';scale--;}
 if(scale>2||scale< -20||digits.length>20)throw businessFailure('PAYMENT_INVALID');
 if(scale<0){digits+='0'.repeat(-scale);scale=0;}
 let cents=BigInt(digits)*10n**BigInt(2-scale);if(match[1])cents=-cents;
 return businessRaw(cents);
}
function businessEnvelope(payload){
 if(!businessPlain(payload)||typeof payload.error!=='string'||payload.error.length>8192)throw businessFailure('RESPONSE_INVALID');
 for(const row of [payload,businessPlain(payload.response)?payload.response:{}])for(const field of ['partner_id','shop_id'])if(Object.hasOwn(row,field)&&row[field]!==FINANCE_PROFILE[field])throw businessFailure('IDENTITY_MISMATCH');
 if(payload.error!=='')throw businessFailure(payload.error==='error_token'?'AUTH_REQUIRED':['error_rate_limit','error_limit'].includes(payload.error)?'RATE_LIMIT':['error_server','err_busy'].includes(payload.error)?'PROVIDER_UNAVAILABLE':['error_auth','error_sign','error_api_permission','error_partner_id','error_ip'].includes(payload.error)?'API_REJECTED':['order_not_ready','order_not_found'].includes(payload.error)?'PAYMENT_NOT_READY':'API_UNAVAILABLE');
 if(!businessPlain(payload.response))throw businessFailure('RESPONSE_INVALID');
 return payload.response;
}
function businessPaymentUnavailable(error){
 // Only an exact successful-HTTP provider token describes an order whose
 // Payment is not ready. Transport/auth/rate failures are never missing money.
 return error instanceof FinanceConnectionError&&error.code==='FINANCE_BUSINESS_PAYMENT_NOT_READY';
}
function businessDiagnostic(error){
 const code=error instanceof FinanceConnectionError?error.code:'';
 if(code==='FINANCE_BUSINESS_CHECKPOINT')return 'BUSINESS_PERIOD_CHECKPOINT';
 if(['FINANCE_REFRESH_IN_PROGRESS','FINANCE_AUTHORIZATION_IN_PROGRESS','FINANCE_REFRESH_CONFLICT','FINANCE_REVISION_CONFLICT'].includes(code))return 'BUSINESS_PERIOD_BUSY';
 if(['FINANCE_BUSINESS_AUTH_REQUIRED','FINANCE_AUTHORIZATION_REQUIRED','FINANCE_BUSINESS_AUTHORIZATION_EXPIRED'].includes(code))return 'BUSINESS_PERIOD_AUTH_REQUIRED';
 if(code==='FINANCE_BUSINESS_RATE_LIMIT'||error?.upstream_status===429)return 'BUSINESS_PERIOD_RATE_LIMIT';
 if(code.endsWith('_TIMEOUT')||[408,504].includes(error?.upstream_status))return 'BUSINESS_PERIOD_TIMEOUT';
 if(['FINANCE_BUSINESS_PROVIDER_UNAVAILABLE','FINANCE_BUSINESS_PAYMENT_NOT_READY','FINANCE_BUSINESS_UPSTREAM_FAILED','FINANCE_STORAGE_UNAVAILABLE','FINANCE_BUSINESS_STORAGE_UNAVAILABLE','FINANCE_REFRESH_FAILED','FINANCE_REFRESH_TRANSPORT_UNAVAILABLE','FINANCE_BUSINESS_TRANSPORT_UNAVAILABLE'].includes(code)||error?.upstream_status>=500)return 'BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE';
 return 'BUSINESS_PERIOD_INVALID_SOURCE';
}
function businessMidnight(day){
 const target=Date.parse(day+'T00:00:00Z'),formatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',timeZoneName:'longOffset'});let candidate=target;
 for(let i=0;i<2;i++){
  const label=formatter.formatToParts(new Date(candidate)).find(part=>part.type==='timeZoneName')?.value,match=/^GMT([+-])(\d{2}):(\d{2})$/.exec(label||'');
  if(!match)throw businessFailure('CLOCK_CONFIGURATION',503);
  candidate=target-(Number(match[2])*3600+Number(match[3])*60)*(match[1]==='+'?1:-1)*1000;
 }
 return Math.floor(candidate/1000);
}
const businessCanonical=record=>({order_hash:record.order_hash,bucket:record.bucket,payment_covered:record.payment_covered,sales_raw:record.sales_raw,escrow_raw:record.escrow_raw,ads_raw:record.ads_raw,returns_seen:record.returns_seen,items:record.items,checked_at:record.checked_at});
function businessDailyBreakdown(run,records,evidenceByOrder){
 const coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
 const group=date=>({date,coverage:Object.fromEntries(coverageKeys.map(key=>[key,0])),money:[0n,0n,0n],items:new Map(),times:[],adjustments:{covered_orders:0,missing_orders:0,conflict_orders:0,money:[0n,0n,0n]}});
 const days=new Map(),undated=group(null),formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'});
 for(let at=Date.parse(run.start_date+'T00:00:00Z'),end=Date.parse(run.end_date+'T00:00:00Z');at<=end;at+=86400000){const date=new Date(at).toISOString().slice(0,10);days.set(date,group(date));}
 for(const record of records){
  const evidence=evidenceByOrder.get(record.order_hash),created=evidence?.schema==='financial_order_evidence_v2'?evidence.create_time:null;
  const date=Number.isSafeInteger(created)&&created>=run.time_from&&created<=run.time_to&&created<=record.checked_at?formatter.format(new Date(created*1000)):null;
  const current=days.get(date)||undated,c=current.coverage;c.orders++;c[record.bucket]++;current.times.push(record.checked_at);
  if(!['completed','ongoing'].includes(record.bucket))continue;
  c.paid++;for(const item of JSON.parse(record.items)){const key=item.item_id+':'+item.model_id,old=current.items.get(key);current.items.set(key,{...item,quantity:(old?.quantity||0)+item.quantity});}
  const adjustment=current.adjustments;
  if(!record.payment_covered){c.payment_missing++;c.returns_unknown++;adjustment.missing_orders++;continue;}
  c.payment_covered++;if(record.returns_seen===null)c.returns_unknown++;else c.returns+=record.returns_seen;
  [record.sales_raw,record.escrow_raw,record.ads_raw].forEach((raw,index)=>{current.money[index]+=businessCents(raw);});
  if(!evidence){adjustment.missing_orders++;continue;}
  if(['INVALID','ADJUSTMENT_MISMATCH'].includes(evidence.diagnostic)||evidence.currency!=='BRL'||evidence.amounts.escrow_amount_raw!==record.escrow_raw){adjustment.conflict_orders++;continue;}
  const amounts=['escrow_amount_raw','total_adjustment_amount_raw','escrow_amount_after_adjustment_raw'].map(key=>businessCents(evidence.amounts[key],100000000000000n));
  if(amounts.some(value=>value===null)){adjustment.missing_orders++;continue;}
  if(amounts[0]+amounts[1]!==amounts[2]){adjustment.conflict_orders++;continue;}
  adjustment.covered_orders++;amounts.forEach((amount,index)=>{adjustment.money[index]+=amount;});
 }
 const project=current=>{
  const {coverage:c,adjustments:a}=current,complete=a.covered_orders===c.paid;
  const items=[...current.items.values()].sort((a,b)=>a.item_id.length-b.item_id.length||a.item_id.localeCompare(b.item_id)||a.model_id.length-b.model_id.length||a.model_id.localeCompare(b.model_id));
  const money=current.money.map(businessRaw),adjustments=a.money.map(businessRaw);
  return {date:current.date,coverage:c,known_sales_base_raw:money[0],sales_base_raw:c.payment_missing?null:money[0],known_expected_repass_raw:money[1],expected_repass_raw:c.payment_missing?null:money[1],known_ads_adjustment_raw:money[2],ads_adjustment_raw:c.payment_missing?null:money[2],items,source_checked_at:{oldest_at:current.times.length?Math.min(...current.times):null,latest_at:current.times.length?Math.max(...current.times):null},adjustments:{covered_orders:a.covered_orders,missing_orders:a.missing_orders,conflict_orders:a.conflict_orders,known_base_repass_raw:adjustments[0],known_adjustment_raw:adjustments[1],known_after_adjustment_repass_raw:adjustments[2],adjustment_raw:complete?adjustments[1]:null,after_adjustment_repass_raw:complete?adjustments[2]:null}};
 };
 return {schema:'finance_business_daily_v1',timezone:'America/Sao_Paulo',basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED',days:[...days.values()].map(project),undated:project(undated)};
}
function businessFrame(run,records,diagnostic){
 if(!run||run.partner_id!==FINANCE_PROFILE.partner_id||run.shop_id!==FINANCE_PROFILE.shop_id||!Array.isArray(records)||records.length>1000)throw businessFailure('STORAGE_INVALID',503);
 const coverage={orders:records.length,paid:0,completed:0,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:0,payment_missing:0,returns:0,returns_unknown:0},grouped=new Map(),seenOrders=new Set(),products=new Map();
 const mixed={orders:0,covered:0,missing:0,money:[0n,0n,0n,0n]},moneyNames=['sales_base','expected_repass','ads_adjustment','invoice_tax'];
 let sales=0n,escrow=0n,ads=0n,tax=0n;
 for(const record of records){
  if(!/^[a-f0-9]{64}$/.test(record.order_hash)||seenOrders.has(record.order_hash)||!/^[a-f0-9]{64}$/.test(record.source_hash)||!businessBuckets.includes(record.bucket)||![0,1].includes(record.payment_covered)||!Number.isSafeInteger(record.checked_at)||record.checked_at<run.cutoff_at||record.checked_at>run.checked_at)throw businessFailure('STORAGE_INVALID',503);
  seenOrders.add(record.order_hash);coverage[record.bucket]++;
  let items;try{items=JSON.parse(record.items);}catch{throw businessFailure('STORAGE_INVALID',503);}
  const paid=['completed','ongoing'].includes(record.bucket);
  if(!paid){if(record.payment_covered!==0||record.sales_raw!==null||record.escrow_raw!==null||record.ads_raw!==null||record.returns_seen!==null||!Array.isArray(items)||items.length)throw businessFailure('STORAGE_INVALID',503);continue;}
  coverage.paid++;
  const canonical=businessItems(items,'quantity');
  if(JSON.stringify(canonical)!==record.items)throw businessFailure('STORAGE_INVALID',503);
  const exclusive=new Set(canonical.map(row=>row.item_id)).size===1,affected=new Set();
  if(!exclusive)mixed.orders++;
  for(const row of canonical){
   let product=products.get(row.item_id);
   if(!product){product={item_id:row.item_id,quantity:0,orders:0,exclusive_orders:0,mixed_orders:0,exclusive_payment_covered:0,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,money:[0n,0n,0n,0n],items:new Map()};products.set(row.item_id,product);}
   if(!affected.has(row.item_id)){product.orders++;product[exclusive?'exclusive_orders':'mixed_orders']++;affected.add(row.item_id);}
   product.quantity+=row.quantity;if(!Number.isSafeInteger(product.quantity))throw businessFailure('GROUP_LIMIT',409);
   let model=product.items.get(row.model_id);if(!model){model={model_id:row.model_id,exclusive_quantity:0,mixed_quantity:0};product.items.set(row.model_id,model);}
   model[exclusive?'exclusive_quantity':'mixed_quantity']+=row.quantity;
  }
  const product=exclusive?products.get(canonical[0].item_id):null;
  for(const row of canonical){const id=row.item_id+':'+row.model_id,total=(grouped.get(id)?.quantity||0)+row.quantity;if(!Number.isSafeInteger(total)||total>1000000000000)throw businessFailure('GROUP_LIMIT',409);grouped.set(id,{...row,quantity:total});}
  if(record.payment_covered===0){
   if(record.sales_raw!==null||record.escrow_raw!==null||record.ads_raw!==null||record.returns_seen!==null)throw businessFailure('STORAGE_INVALID',503);
   if(product){product.exclusive_payment_missing++;product.exclusive_returns_unknown++;}else mixed.missing++;
   coverage.payment_missing++;coverage.returns_unknown++;continue;
  }
  const currentSales=businessCents(record.sales_raw,100000000000000n),currentEscrow=businessCents(record.escrow_raw,100000000000000n),currentAds=businessCents(record.ads_raw,100000000000000n);
  if(currentSales===null||currentSales<0n||currentEscrow===null||currentAds===null)throw businessFailure('STORAGE_INVALID',503);
  const currentTax=(currentSales*200n+5000n)/10000n,currentMoney=[currentSales,currentEscrow,currentAds,currentTax];
  coverage.payment_covered++;sales+=currentSales;escrow+=currentEscrow;ads+=currentAds;tax+=currentTax;
  if(record.returns_seen===null)coverage.returns_unknown++;else if(record.returns_seen===0||record.returns_seen===1)coverage.returns+=record.returns_seen;else throw businessFailure('STORAGE_INVALID',503);
  if(product){product.exclusive_payment_covered++;if(record.returns_seen===null)product.exclusive_returns_unknown++;else product.exclusive_returns+=record.returns_seen;for(let index=0;index<currentMoney.length;index++)product.money[index]+=currentMoney[index];}
  else{mixed.covered++;for(let index=0;index<currentMoney.length;index++)mixed.money[index]+=currentMoney[index];}
 }
 if(grouped.size>1000)throw businessFailure('GROUP_LIMIT',409);
 const completePayments=coverage.payment_missing===0,salesRaw=businessRaw(sales),escrowRaw=businessRaw(escrow),adsRaw=businessRaw(ads);
 // Finishing another page does not refresh the orders read on earlier pages.
 // Empty imports have no per-order observations, so retain the conservative
 // run interval instead of inventing a fresh timestamp for the empty cohort.
 const source_checked_at={oldest_at:records.length?Math.min(...records.map(record=>record.checked_at)):run.cutoff_at,latest_at:records.length?Math.max(...records.map(record=>record.checked_at)):run.checked_at};
 const frame=projectBusinessPeriodFrame({schema:'finance_business_period_v1',run_id:run.run_id,revision:run.revision,status:run.status,start_date:run.start_date,end_date:run.end_date,cutoff_at:run.cutoff_at,checked_at:run.checked_at,source_checked_at,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:run.pages_read,page_capacity:BUSINESS_PAGE_CAPACITY,duplicate_orders:run.duplicate_orders,coverage,
  known_sales_base_raw:salesRaw,sales_base_raw:completePayments?salesRaw:null,known_expected_repass_raw:escrowRaw,expected_repass_raw:completePayments?escrowRaw:null,known_ads_adjustment_raw:adsRaw,ads_adjustment_raw:completePayments?adsRaw:null,
  invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:coverage.payment_covered,unavailable_orders:coverage.payment_missing,known_base_raw:salesRaw,known_tax_raw:businessRaw(tax)},items:[...grouped.values()],
  product_breakdown:{schema:'business_product_breakdown_v1',mixed_orders:mixed.orders,mixed_payment_covered:mixed.covered,mixed_payment_missing:mixed.missing,...Object.fromEntries(moneyNames.map((name,index)=>['known_mixed_'+name+'_raw',businessRaw(mixed.money[index])])),products:[...products.values()].map(({money,items,...row})=>({...row,...Object.fromEntries(moneyNames.flatMap((name,index)=>{const known=businessRaw(money[index]);return [['known_exclusive_'+name+'_raw',known],['exclusive_'+name+'_raw',row.exclusive_payment_missing?null:known]];})),items:[...items.values()]}))},
  // A competing lease owner may finish between this caller's observation and
  // its failed write. The winner's terminal data takes precedence over the
  // caller-local conflict; a stored terminal error still fails validation.
  diagnostic:diagnostic===undefined||diagnostic==='BUSINESS_PERIOD_CONFLICT'&&run.status!=='RUNNING'?run.last_error:diagnostic,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'});
 if(!frame)throw businessFailure('STORAGE_INVALID',503);return frame;
}

export async function runFinanceBusinessPeriod(env,options={}){
 if(!businessPlain(options)||env?.FINANCE_CONNECTION_ENABLED!=='true'||!env?.FINANCE_DB||typeof env.FINANCE_DB.prepare!=='function'||typeof env.FINANCE_DB.batch!=='function'||env.ADMIN_DB===env.FINANCE_DB)throw businessFailure('CONFIGURATION',503);
 const {operation,fetchImpl,now=()=>Date.now(),timeoutMs=5000,includeDaily=false}=options;if(typeof includeDaily!=='boolean')throw businessFailure('REQUEST_INVALID',400);
 const input=projectBusinessPeriodRequest(operation==='start'?{operation,start_date:options.start_date,end_date:options.end_date}:{operation,run_id:options.run_id});if(!input)throw businessFailure('REQUEST_INVALID',400);
 const epoch=()=>{let value;try{value=now();}catch{throw businessFailure('CLOCK_CONFIGURATION',503);}if(!Number.isSafeInteger(value)||value<=0||Math.floor(value/1000)>9999999999)throw businessFailure('CLOCK_CONFIGURATION',503);return Math.floor(value/1000);};
 const initialTime=epoch(),deadline=initialTime+20,db=env.FINANCE_DB,prepare=(sql,args=[])=>db.prepare(sql).bind(...args);
 const remainingTimeout=()=>{const remaining=(deadline-epoch()-3)*1000;if(remaining<5)throw businessFailure('CHECKPOINT',409);return Math.min(timeoutMs,remaining);};
 const storage=async work=>{try{return await work();}catch(error){if(error instanceof FinanceConnectionError)throw error;throw businessFailure('STORAGE_UNAVAILABLE',503);}};
 await storage(()=>db.batch(BUSINESS_SCHEMA.map(sql=>db.prepare(sql))));
 const snapshot=async(run_id,diagnostic)=>{
  const fields='o.order_hash,o.bucket,o.payment_covered,o.sales_raw,o.escrow_raw,o.ads_raw,o.returns_seen,o.items,o.source_hash,o.checked_at',dailyFields=',e.source_hash AS evidence_source_hash,e.checked_at AS evidence_checked_at,e.payload AS evidence_payload,e.payload_hash AS evidence_payload_hash';
  const selectRecords=(table,daily=false)=>'SELECT '+fields+(daily?dailyFields:'')+' FROM '+table+' o'+(daily?' LEFT JOIN finance_business_order_evidence e ON e.run_id=o.run_id AND e.order_hash=o.order_hash':'')+' WHERE o.run_id=?';
  const data=await storage(()=>db.batch([
   prepare('SELECT * FROM finance_business_period_runs WHERE run_id=? AND partner_id=? AND shop_id=?',[run_id,...businessIdentity]),
   prepare(selectRecords('finance_business_period_orders',includeDaily)+' AND EXISTS(SELECT 1 FROM finance_business_period_runs WHERE run_id=? AND partner_id=? AND shop_id=?) ORDER BY o.order_hash',[run_id,run_id,...businessIdentity]),
   prepare(selectRecords('finance_business_period_payment_cache')+' ORDER BY o.order_hash',[run_id]),
  ]));
  const run=data[0]?.results?.[0],stored=data[1]?.results,storedCache=data[2]?.results;if(!run)throw businessFailure('RUN_NOT_FOUND',404);
  const record=entry=>({...businessCanonical(entry),source_hash:entry.source_hash}),records=Array.isArray(stored)?stored.map(record):stored,cache=Array.isArray(storedCache)?storedCache.map(record):storedCache;
  if(!Array.isArray(records)||!projectBusinessPeriodRequest({operation:'start',start_date:run.start_date,end_date:run.end_date}))throw businessFailure('STORAGE_INVALID',503);
  const nextDay=new Date(Date.parse(run.end_date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  if(run.time_from!==businessMidnight(run.start_date)||run.time_to!==Math.min(run.cutoff_at,businessMidnight(nextDay)-1)||run.cursor!==''&&!businessCursor(run.cursor))throw businessFailure('STORAGE_INVALID',503);
  if(!Array.isArray(cache)||cache.length>20||businessEncoder.encode(JSON.stringify(cache)).byteLength>1048576||cache.some(record=>record.payment_covered!==1||!['completed','ongoing'].includes(record.bucket)||records.some(committed=>committed.order_hash===record.order_hash)))throw businessFailure('STORAGE_INVALID',503);
  const hashes=await Promise.all([...records,...cache].map(async record=>await businessHash(JSON.stringify(businessCanonical(record)))===record.source_hash));if(hashes.includes(false))throw businessFailure('STORAGE_INVALID',503);
  for(const record of cache)businessFrame({...run,status:'RUNNING',pages_read:1,duplicate_orders:0,last_error:null},[record]);
  let frame=businessFrame(run,records,diagnostic);
  if(includeDaily){
   const evidenceByOrder=new Map();
   for(const row of stored){
    try{
     if(row.evidence_source_hash!==row.source_hash||row.evidence_checked_at!==row.checked_at||typeof row.evidence_payload!=='string'||businessEncoder.encode(row.evidence_payload).byteLength>32768||await businessHash(row.evidence_payload)!==row.evidence_payload_hash)continue;
     const evidence=projectFinancialOrderEvidence(JSON.parse(row.evidence_payload));if(!evidence||await businessHash(evidence.order_sn)!==row.order_hash)continue;
     evidenceByOrder.set(row.order_hash,evidence);
    }catch{}
   }
   const daily_breakdown=businessDailyBreakdown(run,records,evidenceByOrder),candidate={...frame,daily_breakdown};
   // A very dense calendar must not invalidate the already bounded period.
   // Omit the optional detail instead of truncating days or enlarging limits.
   if(businessEncoder.encode(JSON.stringify(daily_breakdown)).byteLength<=524288&&businessEncoder.encode(JSON.stringify(candidate)).byteLength<=1048576){const projected=projectBusinessPeriodFrame(candidate);if(!projected)throw businessFailure('STORAGE_INVALID',503);frame=projected;}
  }
  return {run,records,cache,frame};
 };
 if(input.operation==='start'){
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(initialTime*1000));if(input.end_date>today)throw businessFailure('REQUEST_INVALID',400);
  const nextDay=new Date(Date.parse(input.end_date+'T00:00:00Z')+86400000).toISOString().slice(0,10),timeFrom=businessMidnight(input.start_date),timeTo=Math.min(initialTime,businessMidnight(nextDay)-1);
  if(timeTo<timeFrom)throw businessFailure('REQUEST_INVALID',400);
  const freshness=input.end_date===today?60:900;
  const recentSql="SELECT r.run_id FROM finance_business_period_runs r WHERE partner_id=? AND shop_id=? AND start_date=? AND end_date=? AND ((status='COMPLETE' AND cutoff_at>=? AND NOT EXISTS(SELECT 1 FROM finance_business_period_orders o WHERE o.run_id=r.run_id AND NOT EXISTS(SELECT 1 FROM finance_business_order_evidence e WHERE e.run_id=o.run_id AND e.order_hash=o.order_hash AND e.source_hash=o.source_hash AND e.checked_at=o.checked_at))) OR (status='RUNNING' AND cutoff_at>=?)) ORDER BY created_at DESC,run_id DESC LIMIT 1",recentArgs=[...businessIdentity,input.start_date,input.end_date,initialTime-freshness,initialTime-900];
  const recent=await storage(()=>prepare(recentSql,recentArgs).first());if(recent)return (await snapshot(recent.run_id)).frame;
  const cutoff=initialTime-30*86400;
  await storage(()=>db.batch([
   prepare('DELETE FROM finance_business_order_evidence WHERE run_id IN (SELECT run_id FROM finance_business_period_runs WHERE created_at<? AND partner_id=? AND shop_id=?)',[cutoff,...businessIdentity]),
   prepare('DELETE FROM finance_business_period_orders WHERE run_id IN (SELECT run_id FROM finance_business_period_runs WHERE created_at<? AND partner_id=? AND shop_id=?)',[cutoff,...businessIdentity]),
   prepare('DELETE FROM finance_business_period_cursors WHERE run_id IN (SELECT run_id FROM finance_business_period_runs WHERE created_at<? AND partner_id=? AND shop_id=?)',[cutoff,...businessIdentity]),
   prepare('DELETE FROM finance_business_period_payment_cache WHERE run_id IN (SELECT run_id FROM finance_business_period_runs WHERE created_at<? AND partner_id=? AND shop_id=?)',[cutoff,...businessIdentity]),
   prepare('DELETE FROM finance_business_period_runs WHERE created_at<? AND partner_id=? AND shop_id=?',[cutoff,...businessIdentity]),
  ]));
  const evict="SELECT run_id FROM finance_business_period_runs WHERE partner_id=? AND shop_id=? AND cutoff_at<? AND (lease_owner IS NULL OR lease_until<=?) AND (SELECT COUNT(*) FROM finance_business_period_runs WHERE partner_id=? AND shop_id=?)>=60 ORDER BY created_at,run_id LIMIT 1",evictArgs=[...businessIdentity,initialTime-900,initialTime,...businessIdentity];
  await storage(()=>db.batch([
   prepare('DELETE FROM finance_business_order_evidence WHERE run_id IN ('+evict+')',evictArgs),
   prepare('DELETE FROM finance_business_period_orders WHERE run_id IN ('+evict+')',evictArgs),
   prepare('DELETE FROM finance_business_period_cursors WHERE run_id IN ('+evict+')',evictArgs),
   prepare('DELETE FROM finance_business_period_payment_cache WHERE run_id IN ('+evict+')',evictArgs),
   prepare('DELETE FROM finance_business_period_runs WHERE run_id IN ('+evict+')',evictArgs),
  ]));
  const count=await storage(()=>prepare('SELECT COUNT(*) AS n FROM finance_business_period_runs WHERE partner_id=? AND shop_id=?',businessIdentity).first());if(!count||count.n>=60)throw businessFailure('RUN_LIMIT',409);
  const run_id=crypto.randomUUID(),cursorHash=await businessHash('');
  const created=await storage(()=>db.batch([
   prepare("INSERT INTO finance_business_period_runs(run_id,partner_id,shop_id,revision,status,start_date,end_date,time_from,time_to,cutoff_at,checked_at,created_at,cursor,pages_read,duplicate_orders,lease_owner,lease_until,last_error) SELECT ?,?,?,1,'RUNNING',?,?,?,?,?,?,?,'',0,0,NULL,NULL,NULL WHERE NOT EXISTS("+recentSql+") AND (SELECT COUNT(*) FROM finance_business_period_runs WHERE partner_id=? AND shop_id=?)<60",[run_id,...businessIdentity,input.start_date,input.end_date,timeFrom,timeTo,initialTime,initialTime,initialTime,...recentArgs,...businessIdentity]),
   prepare('INSERT INTO finance_business_period_cursors(run_id,cursor_hash) SELECT ?,? WHERE EXISTS(SELECT 1 FROM finance_business_period_runs WHERE run_id=?)',[run_id,cursorHash,run_id]),
  ]));
  if(created[0]?.meta?.changes!==1){const winner=await storage(()=>prepare(recentSql,recentArgs).first());if(!winner)throw businessFailure('RUN_LIMIT',409);return (await snapshot(winner.run_id)).frame;}
  return (await snapshot(run_id)).frame;
 }
 const observed=await snapshot(input.run_id);if(input.operation==='read'||observed.run.status!=='RUNNING')return observed.frame;
 if(typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>5000)throw businessFailure('CONFIGURATION',503);
 const retrySeconds={BUSINESS_PERIOD_RATE_LIMIT:30,BUSINESS_PERIOD_TIMEOUT:5,BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE:10,BUSINESS_PERIOD_BUSY:2}[observed.run.last_error]||0;
 if(epoch()<observed.run.checked_at+retrySeconds)return observed.frame;
 if(deadline-epoch()<=3)return {...observed.frame,diagnostic:'BUSINESS_PERIOD_CHECKPOINT'};
 const owner=crypto.randomUUID(),leaseUntil=initialTime+45,run=observed.run;
 const leased=await storage(()=>prepare("UPDATE finance_business_period_runs SET lease_owner=?,lease_until=? WHERE run_id=? AND partner_id=? AND shop_id=? AND revision=? AND status='RUNNING' AND (lease_owner IS NULL OR lease_until<=?)",[owner,leaseUntil,input.run_id,...businessIdentity,run.revision,initialTime]).run());
 if(leased?.meta?.changes!==1)return (await snapshot(input.run_id,'BUSINESS_PERIOD_CONFLICT')).frame;
 const guard="run_id=? AND partner_id=? AND shop_id=? AND revision=? AND status='RUNNING' AND lease_owner=? AND lease_until>?",guardArgs=stamp=>[input.run_id,...businessIdentity,run.revision,owner,stamp];
 const stopAtLimit=async stamp=>{
  const limited=await storage(()=>prepare("UPDATE finance_business_period_runs SET status='LIMIT_REACHED',revision=revision+1,checked_at=?,lease_owner=NULL,lease_until=NULL,last_error=NULL WHERE "+guard,[stamp,...guardArgs(stamp)]).run());
  return (await snapshot(input.run_id,limited.meta.changes===1?undefined:'BUSINESS_PERIOD_CONFLICT')).frame;
 };
 const newlyCached=[],newEvidence=new Map();let retainedCache=observed.cache;
 const evidenceStatements=(records,stamp)=>records.flatMap(record=>{
  const evidence=newEvidence.get(record.order_hash);if(!evidence||evidence.source_hash!==record.source_hash||evidence.checked_at!==record.checked_at)return [];
  return [prepare('INSERT INTO finance_business_order_evidence(run_id,order_hash,source_hash,checked_at,payload,payload_hash) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM finance_business_period_runs WHERE '+guard+') ON CONFLICT(run_id,order_hash) DO UPDATE SET source_hash=excluded.source_hash,checked_at=excluded.checked_at,payload=excluded.payload,payload_hash=excluded.payload_hash',[input.run_id,record.order_hash,record.source_hash,record.checked_at,evidence.payload,evidence.payload_hash,...guardArgs(stamp)])];
 });
 try{
  remainingTimeout();
  if(run.pages_read>=200||observed.records.length>=1000)return await stopAtLimit(epoch());
  const partnerKey=env.SHOPEE_FINANCE_PARTNER_KEY;if(typeof partnerKey!=='string'||!partnerKey.length||partnerKey.length>4096||/[\u0000-\u001f\u007f]/.test(partnerKey))throw businessFailure('SIGNING_CONFIGURATION',503);
  const rawKey=businessEncoder.encode(partnerKey);let key;
  try{if(rawKey.length>8192)throw businessFailure('SIGNING_CONFIGURATION',503);key=await crypto.subtle.importKey('raw',rawKey,{name:'HMAC',hash:'SHA-256'},false,['sign']);}finally{rawKey.fill(0);}
  const tokens=await ensureFinanceAccessToken(env,{fetchImpl,now,timeoutMs:remainingTimeout()});
  const get=async(path,query)=>{
   const timestamp=epoch();if(tokens.expires_at<=timestamp)throw businessFailure('AUTHORIZATION_EXPIRED',409);
   return requestFinanceAuthJson({input:{timestamp},options:{fetchImpl,now,timeoutMs:remainingTimeout()},prefix:'FINANCE_BUSINESS',...(path===BUSINESS_DETAIL?{maximumBodyBytes:1024*1024}:{}),buildRequest:async()=>{
    const base=String(FINANCE_PROFILE.partner_id)+path+timestamp+tokens.access_token+FINANCE_PROFILE.shop_id,sign=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,businessEncoder.encode(base))),byte=>byte.toString(16).padStart(2,'0')).join('');
    const url=new URL(path,BUSINESS_ORIGIN);for(const [name,value] of Object.entries({partner_id:FINANCE_PROFILE.partner_id,timestamp,access_token:tokens.access_token,shop_id:FINANCE_PROFILE.shop_id,sign,...query}))url.searchParams.set(name,String(value));
    return new Request(url,{method:'GET',redirect:'manual',headers:{Accept:'application/json'}});
   },normalizeResponse:businessEnvelope});
  };
  // Reserve the entire page before reading it. A final short page can reach
  // the order ceiling without truncating provider rows or skipping a cursor.
  const pageSize=Math.min(BUSINESS_PAGE_CAPACITY,1000-observed.records.length);
  const listing=await get(BUSINESS_LIST,{time_range_field:'create_time',time_from:run.time_from,time_to:run.time_to,page_size:pageSize,cursor:run.cursor});
  if(!Array.isArray(listing.order_list)||listing.order_list.length>pageSize||typeof listing.more!=='boolean')throw businessFailure('LIST_INVALID');
  let nextCursor='';
  if(listing.more){nextCursor=listing.next_cursor;if(!listing.order_list.length||!businessCursor(nextCursor)||nextCursor===run.cursor)throw businessFailure('CURSOR_INVALID');const nextHash=await businessHash(nextCursor);if(await storage(()=>prepare('SELECT cursor_hash FROM finance_business_period_cursors WHERE run_id=? AND cursor_hash=?',[input.run_id,nextHash]).first()))throw businessFailure('CURSOR_INVALID');}
  const known=new Set(observed.records.map(record=>record.order_hash)),selected=[],pageSeen=new Set();let duplicates=0;
  for(const row of listing.order_list){
   if(!businessPlain(row)||!businessSerial(row.order_sn))throw businessFailure('LIST_INVALID');
   const orderHash=await businessHash(row.order_sn);if(known.has(orderHash)||pageSeen.has(orderHash)){duplicates++;continue;}pageSeen.add(orderHash);selected.push({serial:row.order_sn,orderHash});
  }
  if(run.duplicate_orders+duplicates>1000)return await stopAtLimit(epoch());
  let details=[];
  if(selected.length){
   const response=await get(BUSINESS_DETAIL,{order_sn_list:selected.map(row=>row.serial).join(','),response_optional_fields:'item_list'});
   if(!Array.isArray(response.order_list)||response.order_list.length!==selected.length)throw businessFailure('DETAIL_INVALID');
   const bySerial=new Map();
   for(const row of response.order_list){
    if(!businessPlain(row)||!selected.some(entry=>entry.serial===row.order_sn)||bySerial.has(row.order_sn))throw businessFailure('DETAIL_INVALID');
    for(const field of ['partner_id','shop_id'])if(Object.hasOwn(row,field)&&row[field]!==FINANCE_PROFILE[field])throw businessFailure('IDENTITY_MISMATCH');
    if(Object.hasOwn(row,'create_time')&&(!Number.isSafeInteger(row.create_time)||row.create_time<run.time_from||row.create_time>run.time_to))throw businessFailure('IDENTITY_MISMATCH');
    const bucket=businessBucket(row.order_status),paid=['completed','ongoing'].includes(bucket);
    if(paid&&row.currency!=='BRL')throw businessFailure('DETAIL_INVALID');
    bySerial.set(row.order_sn,{bucket,order_status:row.order_status,currency:row.currency,create_time:row.create_time??null,items:paid?businessItems(row.item_list,'model_quantity_purchased'):[]});
   }
   details=selected.map(row=>({...row,...bySerial.get(row.serial)}));
  }
  const records=new Array(details.length);let index=0,failed;
  const cached=new Map(observed.cache.map(record=>[record.order_hash,record]));
  retainedCache=details.flatMap(selection=>{const record=cached.get(selection.orderHash);return record&&record.bucket===selection.bucket&&record.items===JSON.stringify(selection.items)?[record]:[];});
  const worker=async()=>{
   while(!failed){const position=index++;if(position>=details.length)return;const selection=details[position];
    try{
     remainingTimeout();
     const saved=cached.get(selection.orderHash);
     if(saved&&saved.bucket===selection.bucket&&saved.items===JSON.stringify(selection.items)){records[position]=saved;continue;}
     const record={order_hash:selection.orderHash,bucket:selection.bucket,payment_covered:0,sales_raw:null,escrow_raw:null,ads_raw:null,returns_seen:null,items:JSON.stringify(selection.items),checked_at:epoch()};
     let payment;
     if(['completed','ongoing'].includes(selection.bucket)){
      try{payment=await get(BUSINESS_PAYMENT,{order_sn:selection.serial});}catch(error){if(selection.bucket!=='ongoing'||!businessPaymentUnavailable(error))throw error;}
      if(payment!==undefined){
       const income=payment.order_income;
       const echoes=[payment,...(businessPlain(income)?[income]:[])].filter(row=>Object.hasOwn(row,'order_sn'));
       if(!echoes.length||echoes.some(row=>row.order_sn!==selection.serial))throw businessFailure('IDENTITY_MISMATCH');
       if(income!==undefined&&income!==null&&!businessPlain(income))throw businessFailure('PAYMENT_INVALID');
       if(businessPlain(income)){
        for(const field of ['partner_id','shop_id'])if(Object.hasOwn(income,field)&&income[field]!==FINANCE_PROFILE[field])throw businessFailure('IDENTITY_MISMATCH');
        const items=businessItems(income.items,'quantity_purchased');if(JSON.stringify(items)!==JSON.stringify(selection.items))throw businessFailure('LINE_IDENTITY_MISMATCH');
        const sales=businessAmount(income,'original_cost_of_goods_sold',{positive:true}),escrow=businessAmount(income,'escrow_amount'),ads=businessAmount(income,'ads_escrow_top_up_fee_or_technical_support_fee');
        let returnsSeen=null;
        if(Object.hasOwn(payment,'return_order_sn_list')){
         const returns=payment.return_order_sn_list;if(!Array.isArray(returns)||returns.length>100||!returns.every(businessSerial)||new Set(returns).size!==returns.length)throw businessFailure('PAYMENT_INVALID');returnsSeen=Number(returns.length>0);
        }
        if(sales!==null&&escrow!==null&&ads!==null){record.payment_covered=1;record.sales_raw=sales;record.escrow_raw=escrow;record.ads_raw=ads;record.returns_seen=returnsSeen;}
       }
      }
     }
     record.checked_at=epoch();record.source_hash=await businessHash(JSON.stringify(businessCanonical(record)));records[position]=record;
     if(record.payment_covered===1)newlyCached.push(record);
     // Optional evidence has its own private bounded representation. Missing or
     // invalid optional fields cannot invalidate the established v1 ledger.
     try{newEvidence.set(record.order_hash,await buildFinancialOrderEvidence({order_sn:selection.serial,order_status:selection.order_status??null,currency:selection.currency??null,payment,record,create_time:selection.create_time}));}catch{}
    }catch(error){
     const priority={BUSINESS_PERIOD_CHECKPOINT:0,BUSINESS_PERIOD_BUSY:0,BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE:1,BUSINESS_PERIOD_TIMEOUT:2,BUSINESS_PERIOD_RATE_LIMIT:3,BUSINESS_PERIOD_AUTH_REQUIRED:4,BUSINESS_PERIOD_INVALID_SOURCE:5};
     if(!failed||priority[businessDiagnostic(error)]>priority[businessDiagnostic(failed)])failed=error;
     return;
    }
   }
  };
  await Promise.all(Array.from({length:4},()=>worker()));if(failed)throw failed;
  remainingTimeout();
  const stamp=epoch(),pages=run.pages_read+1,orderCount=observed.records.length+records.length;
  const status=!listing.more?'COMPLETE':pages>=200||orderCount>=1000?'LIMIT_REACHED':'RUNNING';
  try{businessFrame({...run,revision:run.revision+1,status,checked_at:stamp,pages_read:pages,duplicate_orders:run.duplicate_orders+duplicates,last_error:null},[...observed.records,...records]);}
  catch(error){if(error instanceof FinanceConnectionError&&error.code==='FINANCE_BUSINESS_GROUP_LIMIT'){
   return await stopAtLimit(stamp);
  }throw error;}
  const statements=records.map(record=>prepare('INSERT INTO finance_business_period_orders(run_id,order_hash,bucket,payment_covered,sales_raw,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM finance_business_period_runs WHERE '+guard+')',[input.run_id,record.order_hash,record.bucket,record.payment_covered,record.sales_raw,record.escrow_raw,record.ads_raw,record.returns_seen,record.items,record.source_hash,record.checked_at,...guardArgs(stamp)]));
  if(listing.more)statements.push(prepare('INSERT INTO finance_business_period_cursors(run_id,cursor_hash) SELECT ?,? WHERE EXISTS(SELECT 1 FROM finance_business_period_runs WHERE '+guard+')',[input.run_id,await businessHash(nextCursor),...guardArgs(stamp)]));
  statements.push(prepare('DELETE FROM finance_business_period_payment_cache WHERE run_id=? AND EXISTS(SELECT 1 FROM finance_business_period_runs WHERE '+guard+')',[input.run_id,...guardArgs(stamp)]));
  statements.push(...evidenceStatements(records,stamp));
  statements.push(prepare('UPDATE finance_business_period_runs SET cursor=?,pages_read=?,duplicate_orders=?,status=?,revision=revision+1,checked_at=?,lease_owner=NULL,lease_until=NULL,last_error=NULL WHERE '+guard,[nextCursor,pages,run.duplicate_orders+duplicates,status,stamp,...guardArgs(stamp)]));
  const committed=await storage(()=>db.batch(statements));return (await snapshot(input.run_id,committed.at(-1)?.meta?.changes===1?undefined:'BUSINESS_PERIOD_CONFLICT')).frame;
 }catch(error){
  const stamp=epoch(),diagnostic=businessDiagnostic(error),cache=[];
  // This is an optional checkpoint, never a partial cohort. Keep its private
  // value bounded even when a valid page has unusually many item lines.
  for(const record of new Map([...retainedCache,...newlyCached].map(record=>[record.order_hash,record])).values())if(cache.length<20&&businessEncoder.encode(JSON.stringify([...cache,record])).byteLength<=1048576)cache.push(record);
  // Validated record hashes include the original observation time. Compare
  // the complete prior cache so invalidated records are still removed.
  const previousCache=new Map(observed.cache.map(record=>[record.order_hash,record.source_hash]));
  const cacheUnchanged=cache.length===previousCache.size&&cache.every(record=>previousCache.get(record.order_hash)===record.source_hash);
  const statements=cacheUnchanged?[]:[prepare('DELETE FROM finance_business_period_payment_cache WHERE run_id=? AND EXISTS(SELECT 1 FROM finance_business_period_runs WHERE '+guard+')',[input.run_id,...guardArgs(stamp)]),...cache.map(record=>prepare('INSERT INTO finance_business_period_payment_cache(run_id,order_hash,bucket,payment_covered,sales_raw,escrow_raw,ads_raw,returns_seen,items,source_hash,checked_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM finance_business_period_runs WHERE '+guard+')',[input.run_id,record.order_hash,record.bucket,record.payment_covered,record.sales_raw,record.escrow_raw,record.ads_raw,record.returns_seen,record.items,record.source_hash,record.checked_at,...guardArgs(stamp)]))];
  statements.push(...evidenceStatements(cache,stamp));
  statements.push(prepare('UPDATE finance_business_period_runs SET revision=revision+?,lease_owner=NULL,lease_until=NULL,last_error=?,checked_at=? WHERE '+guard,[newlyCached.length?1:0,diagnostic,stamp,...guardArgs(stamp)]));
  const saved=await storage(()=>db.batch(statements));if(saved.at(-1)?.meta?.changes!==1)return (await snapshot(input.run_id,'BUSINESS_PERIOD_CONFLICT')).frame;
  return (await snapshot(input.run_id)).frame;
 }
}
