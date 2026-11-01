import {FINANCE_PROFILE,FinanceConnectionError} from './connection-store.mjs';
import {ensureFinanceAccessToken} from './refresh-coordinator.mjs';
import {requestFinanceAuthJson} from './auth-json-transport.mjs';
import {projectIncomeDetailFrame} from './income-detail-frame.mjs';
import {incomeDetailFailureDiagnostic} from './income-detail-diagnostic.mjs';

const origin='https://partner.shopeemobile.com',path='/api/v2/payment/get_income_detail',encoder=new TextEncoder();
const fail=(suffix,status=503,kind=null)=>{const error=new FinanceConnectionError('FINANCE_INCOME_DETAIL_'+suffix,status);if(kind!==null)Object.defineProperty(error,'upstream_diagnostic',{value:kind});throw error;};
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const serial=value=>typeof value==='string'&&value.length>0&&value.length<=128&&!/[^\x21-\x7e]|,/.test(value);
const clean=(value,max=160)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value)?value:null;
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
function providerRaw(value){
 if(value===null||value===undefined)return null;if(typeof value!=='number'||!Number.isFinite(value)||Object.is(value,-0)||Math.abs(value)>1000000000000)return null;
 const match=/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));if(!match)return null;let digits=(match[2]+(match[3]??'')).replace(/^0+/,'')||'0',scale=(match[3]??'').length-Number(match[4]??0);
 if(scale<0){digits+='0'.repeat(-scale);scale=0;}if(scale>12)return null;if(scale>0){digits=digits.padStart(scale+1,'0');digits=digits.slice(0,-scale)+'.'+digits.slice(-scale);digits=digits.replace(/0+$/,'').replace(/\.$/,'');}
 return (match[1]&&digits!=='0'?'-':'')+digits;
}
function cents(raw){if(raw===null)return null;const m=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(raw);if(!m)return null;const n=(BigInt(m[2])*100n+BigInt((m[3]??'').padEnd(2,'0')))*(m[1]?-1n:1n);return n>=BigInt(Number.MIN_SAFE_INTEGER)&&n<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n):null;}
function localDay(stamp){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));}
function previousDay(day){return new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);}
// Private structural telemetry: fixed paths and type/count metadata only. No
// provider keys, scalar values, messages, identifiers or credentials are saved.
function incomeDetailStructure(value){
 const nodes={},shallow=(current,present)=>!present?{type:'MISSING'}:current===null?{type:'NULL'}:Array.isArray(current)?{type:'ARRAY',array_count:current.length}:typeof current==='object'?{type:'OBJECT',key_count:Object.keys(current).length}:({string:'STRING',number:'NUMBER',boolean:'BOOLEAN'}[typeof current]?{type:{string:'STRING',number:'NUMBER',boolean:'BOOLEAN'}[typeof current]}:{type:'MISSING'});
 const add=segments=>{let current=value,present=true;for(const segment of segments){if(current===null||typeof current!=='object'||!Object.hasOwn(current,segment)){present=false;current=undefined;break;}current=Object.getOwnPropertyDescriptor(current,segment)?.value;}const node=shallow(current,present);if(node.type==='ARRAY')node.first=shallow(current[0],current.length>0);nodes['root'+segments.map(segment=>typeof segment==='number'?'[0]':'.'+segment).join('')]=node;};
 for(const originPath of [[],['response'],['data'],['result']]){
  add(originPath);add([...originPath,'income_detail_list']);
  for(const box of [[...originPath,'income_detail_list'],[...originPath,'income_detail_list',0]])for(const suffix of [['list'],['income_detail_list_item'],['next_page'],['next_page','cursor'],['next_page','page_size']])add([...box,...suffix]);
 }
 for(const originPath of [[],['response']]){for(const suffix of [['list'],['income_detail_list_item'],['next_page'],['next_page','cursor'],['next_page','page_size']])add([...originPath,...suffix]);for(const field of ['order_sn','currency','status','estimated_escrow_amount','estimated_payout_time','creation_date','description','payment_method'])add([...originPath,'list',0,field]);}
 const knownKeys=['error','message','request_id','response','list','next_page','income_detail_list','income_detail_list_item','partner_id','shop_id','warning','data','result'];
 const keys=current=>plain(current)?{present:knownKeys.filter(name=>Object.hasOwn(current,name)),other_count:Object.keys(current).filter(name=>!knownKeys.includes(name)).length}:null;
 return {schema:'finance_income_detail_structure_probe_v2',request_method:'GET',root_keys:keys(value),response_keys:keys(value?.response),nodes};
}
async function saveIncomeDetailStructure(env,checkedAt,probe){
 try{
  const db=env?.FINANCE_DB;if(typeof db?.prepare!=='function'||!integer(checkedAt,1,9999999999))return;const payload=JSON.stringify(probe);if(encoder.encode(payload).byteLength>16384)return;
  await db.prepare('CREATE TABLE IF NOT EXISTS finance_income_detail_structure_probe(id INTEGER PRIMARY KEY CHECK(id=1),checked_at INTEGER NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=16384))').run();
  await db.prepare('INSERT INTO finance_income_detail_structure_probe(id,checked_at,payload) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET checked_at=excluded.checked_at,payload=excluded.payload WHERE finance_income_detail_structure_probe.checked_at<excluded.checked_at').bind(checkedAt,payload).run();
 }catch{/* Diagnostic storage must never replace the original result or error. */}
}
async function envelope(value,checkedAt,flexiblePageSize=false){
 if(!plain(value)||typeof value.error!=='string')fail('INVALID_RESPONSE',502,'ROOT_INVALID');for(const row of [value,...(plain(value.response)?[value.response]:[])])for(const name of ['partner_id','shop_id'])if(Object.hasOwn(row,name)&&row[name]!==FINANCE_PROFILE[name])fail('INVALID_RESPONSE',502,'IDENTITY_MISMATCH');
 if(value.error!==''){
  const suffix=['error_api_permission','error_auth','error_sign','error_partner_id','error_ip'].includes(value.error)?'PERMISSION_DENIED':['error_limit','error_rate_limit'].includes(value.error)?'RATE_LIMIT':'UNAVAILABLE',error=new FinanceConnectionError('FINANCE_INCOME_DETAIL_'+suffix,502),safe=incomeDetailFailureDiagnostic({code:error.code,provider_code:value.error,upstream_status:200});
  Object.defineProperties(error,{provider_code:{value:safe.provider_code},upstream_status:{value:200},upstream_diagnostic:{value:'PROVIDER_ERROR'}});throw error;
 }
 // Select exactly one documented wrapped or direct canonical response box.
 // Never merge origins, aliases or pages: ambiguity cannot prove coverage.
 const candidates=[];for(const origin of [value,...(plain(value.response)?[value.response]:[])]){if(Object.hasOwn(origin,'income_detail_list')){const container=origin.income_detail_list;candidates.push(Array.isArray(container)&&container.length===1?container[0]:container);}if(Object.hasOwn(origin,'list')||Object.hasOwn(origin,'income_detail_list_item')||Object.hasOwn(origin,'next_page'))candidates.push(origin);}if(candidates.length!==1||!plain(candidates[0]))fail('INVALID_RESPONSE',502,'INCOME_CONTAINER_MISSING');const box=candidates[0];
 for(const name of ['partner_id','shop_id'])if(Object.hasOwn(box,name)&&box[name]!==FINANCE_PROFILE[name])fail('INVALID_RESPONSE',502,'IDENTITY_MISMATCH');const aliases=['list','income_detail_list_item'].filter(name=>Object.hasOwn(box,name));if(aliases.length!==1)fail('INVALID_RESPONSE',502,'INCOME_LIST_INVALID');const list=box[aliases[0]];if(!Array.isArray(list)||list.length>100)fail('INVALID_RESPONSE',502,'INCOME_LIST_INVALID');const next=box.next_page;
 if(!plain(next)||!Object.hasOwn(next,'cursor')||typeof next.cursor!=='string'||next.cursor.length>512)fail('INVALID_RESPONSE',502,'PAGE_CURSOR_INVALID');const cursor=next.cursor;if(Object.hasOwn(next,'page_size')&&(flexiblePageSize?(!integer(next.page_size,0,100)||list.length>next.page_size||next.page_size===0&&(list.length!==0||cursor!=='')):next.page_size!==100))fail('INVALID_RESPONSE',502,'PAGE_SIZE_INVALID');
 const rows=[];
 for(const item of list){
  if(!plain(item)||!serial(item.order_sn))fail('INVALID_RESPONSE',502,'ROW_IDENTITY_INVALID');if(item.currency!=='BRL')fail('INVALID_RESPONSE',502,'ROW_CURRENCY_INVALID');const raw=providerRaw(item.estimated_escrow_amount);
  if(Object.hasOwn(item,'estimated_escrow_amount')&&item.estimated_escrow_amount!==null&&raw===null)fail('INVALID_RESPONSE',502,'ROW_AMOUNT_INVALID');
  const estimated=Object.hasOwn(item,'estimated_payout_time')&&integer(item.estimated_payout_time,1,9999999999)?item.estimated_payout_time:null,created=Object.hasOwn(item,'creation_date')&&integer(item.creation_date,1,9999999999)?item.creation_date:null;
  const status=clean(item.status);if(status===null)fail('INVALID_RESPONSE',502,'ROW_STATUS_INVALID');const description=Object.hasOwn(item,'description')?clean(item.description):null,payment=Object.hasOwn(item,'payment_method')?clean(item.payment_method):null;if(Object.hasOwn(item,'description')&&item.description!==null&&description===null||Object.hasOwn(item,'payment_method')&&item.payment_method!==null&&payment===null)fail('INVALID_RESPONSE',502,'ROW_TEXT_INVALID');
  const orderHash=await hash(item.order_sn),entryHash=await hash(JSON.stringify({order_sn:item.order_sn,status,description,payment,estimated_escrow_raw:raw,estimated_payout_time:estimated,creation_time:created}));
  rows.push({entry_hash:entryHash,order_hash:orderHash,currency:'BRL',status,description,payment_method:payment,estimated_escrow_raw:raw,estimated_escrow_cents:cents(raw),estimated_payout_time:estimated,creation_time:created});
 }
 return {frame:{schema:'finance_income_detail_v1',checked_at:checkedAt,region:'BRAZIL',shop_type:'LOCAL',income_status:'PENDING',page_size:100,returned_count:rows.length,has_more:cursor.length>0,next_cursor_present:cursor.length>0,rows,basis:'CURRENT_PENDING_PROVIDER_INCOME_DETAIL_NOT_MONTH_OR_BANK_RECEIPT'},next_cursor:cursor};
}
async function readIncomeDetailPageCore(env,{fetchImpl=request=>fetch(request),now=()=>Date.now(),timeoutMs=10000,page=null}={}){
 const rawNow=now();if(!integer(rawNow,1,9999999999999)||typeof fetchImpl!=='function'||!integer(timeoutMs,5,10000)||env?.FINANCE_CONNECTION_ENABLED!=='true')fail('CONFIGURATION');const started=Math.floor(rawNow/1000);
 const keyText=env.SHOPEE_FINANCE_PARTNER_KEY;if(typeof keyText!=='string'||!keyText.length||keyText.length>4096||/[\u0000-\u001f\u007f]/.test(keyText))fail('SIGNING_CONFIGURATION');const bytes=encoder.encode(keyText);let key;try{key=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);}finally{bytes.fill(0);}
 let calls=0;const bounded=async request=>{if(calls>=2)fail('UNAVAILABLE');calls++;return fetchImpl(request);},tokens=await ensureFinanceAccessToken(env,{fetchImpl:bounded,now,timeoutMs});const timestamp=Math.floor(now()/1000);if(tokens.expires_at<=timestamp)fail('UNAVAILABLE');
 const today=localDay(timestamp);if(page!==null){const validDay=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$/.test(value)&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;if(!plain(page)||Reflect.ownKeys(page).length!==3||!['cursor','date_from','date_to'].every(name=>Object.hasOwn(Object.getOwnPropertyDescriptor(page,name)||{},'value'))||typeof page.cursor!=='string'||page.cursor.length>512||!validDay(page.date_from)||!validDay(page.date_to)||page.date_to>today||Date.parse(page.date_to+'T12:00:00Z')-Date.parse(page.date_from+'T12:00:00Z')!==86400000)fail('CONFIGURATION');}
 const parameters={cursor:page?.cursor??'',date_from:page?.date_from??previousDay(today),date_to:page?.date_to??today,income_status:2,page_size:100};let probe=null,probeCheckedAt=started;
 try{const observed=await requestFinanceAuthJson({input:{timestamp},options:{fetchImpl:bounded,now,timeoutMs},prefix:'FINANCE_INCOME_DETAIL',maximumBodyBytes:262144,buildRequest:async()=>{
  const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(String(FINANCE_PROFILE.partner_id)+path+timestamp+tokens.access_token+FINANCE_PROFILE.shop_id)))].map(byte=>byte.toString(16).padStart(2,'0')).join(''),url=new URL(path,origin);
  for(const [name,value] of Object.entries({partner_id:FINANCE_PROFILE.partner_id,shop_id:FINANCE_PROFILE.shop_id,timestamp,access_token:tokens.access_token,sign:signature}))url.searchParams.set(name,String(value));
  for(const [name,value] of Object.entries(parameters))url.searchParams.set(name,String(value));
  return new Request(url,{method:'GET',redirect:'manual',headers:{Accept:'application/json'}});
 },normalizeResponse:value=>{probe=incomeDetailStructure(value);probeCheckedAt=Math.max(started,Math.floor(now()/1000));return envelope(value,probeCheckedAt,page!==null);}});
 const result=await observed,frame=projectIncomeDetailFrame(result?.frame);if(!frame)fail('RESULT_INVALID');return {frame,next_cursor:result.next_cursor};
 }finally{if(probe)await saveIncomeDetailStructure(env,probeCheckedAt,probe);}
}

// Legacy callers retain their exact first-page DTO and strict page-size contract.
export async function readFinanceIncomeDetail(env,options={}){
 const {page:ignored,...rest}=options??{};return (await readIncomeDetailPageCore(env,{...rest,page:null})).frame;
}
// Private Finance-only page seam. The raw provider cursor must never be routed
// through Auth, App, owner APIs or public diagnostics.
export async function readFinancePendingIncomePage(env,page,options={}){
 return readIncomeDetailPageCore(env,{...options,page});
}
