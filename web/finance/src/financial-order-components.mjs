import {getFinanceProfile,FINANCE_PROFILE,FinanceConnectionError} from './connection-store.mjs';
import {buildFinancialOrderEvidence} from './financial-order-evidence.mjs';
import {projectBusinessPeriodRequest} from './business-period-frame.mjs';
import {tenantDatabaseHasContext} from '../../cloudflare/src/tenant-storage.mjs';

// An optional, minimized capture beside the existing paid-page records. These
// are observations of named provider fields, not another calculation of fees.
export const FINANCIAL_ORDER_COMPONENT_FIELDS=Object.freeze(['escrow_amount','escrow_amount_after_adjustment','total_adjustment_amount','original_cost_of_goods_sold','buyer_total_amount','commission_fee','service_fee','seller_transaction_fee','actual_shipping_fee','ads_escrow_top_up_fee_or_technical_support_fee']);
export const FINANCIAL_ORDER_COMPONENT_DATE_FIELDS=Object.freeze({created_at:'create_time',updated_at:'update_time',paid_at:'pay_time',completed_at:'complete_time'});
export const FINANCIAL_ORDER_COMPONENTS_SCHEMA=Object.freeze([
 `CREATE TABLE IF NOT EXISTS finance_financial_order_components(run_id TEXT NOT NULL,order_hash TEXT NOT NULL,source_hash TEXT NOT NULL,checked_at INTEGER NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=16384),payload_hash TEXT NOT NULL,PRIMARY KEY(run_id,order_hash))`,
]);
const encoder=new TextEncoder(),plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const own=(v,k)=>plain(v)?Object.getOwnPropertyDescriptor(v,k):undefined;
const value=(v,k)=>{const d=own(v,k);return d&&Object.hasOwn(d,'value')?d.value:undefined;};
const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(own(v,k)||{},'value'));
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const list=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
const fail=(suffix,status=503)=>{throw new FinanceConnectionError('FINANCE_ORDER_COMPONENTS_'+suffix,status);};
const hash=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(v)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const amountKeys=FINANCIAL_ORDER_COMPONENT_FIELDS.map(k=>k+'_cents'),dateKeys=Object.keys(FINANCIAL_ORDER_COMPONENT_DATE_FIELDS);
const observationFields=[...FINANCIAL_ORDER_COMPONENT_FIELDS,...dateKeys.map(k=>'dates.'+k),'currency','source_status'];
const basis='OBSERVED_ORDER_INCOME_FIELDS_NO_INFERRED_RECONCILIATION';
function providerCents(v){
 if(typeof v!=='number'||!Number.isFinite(v)||Object.is(v,-0))return null;
 const m=/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(v));if(!m)return null;
 let digits=(m[2]+(m[3]||'')).replace(/^0+/,'')||'0',scale=(m[3]||'').length-Number(m[4]||0);
 while(scale>0&&digits.endsWith('0')){digits=digits.slice(0,-1)||'0';scale--;}
 if(scale>2||scale< -20||digits.length>20)return null;
 if(scale<0){digits+='0'.repeat(-scale);scale=0;}
 let cents=BigInt(digits)*10n**BigInt(2-scale);if(m[1])cents=-cents;
 return cents<BigInt(Number.MIN_SAFE_INTEGER)||cents>BigInt(Number.MAX_SAFE_INTEGER)?null:Number(cents);
}
const iso=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const finiteList=v=>list(v,observationFields.length)&&new Set(v).size===v.length&&v.every(k=>observationFields.includes(k));
export function projectFinancialOrderComponents(v){
 try{
  if(!exact(v,['schema','order_hash','source_hash','checked_at','currency','source_status','status','dates','amounts','missing_fields','invalid_fields','basis'])||v.schema!=='financial_order_components_v1'||!digest(v.order_hash)||!digest(v.source_hash)||!integer(v.checked_at,1,9999999999)||v.currency!==null&&v.currency!=='BRL'||v.source_status!==null&&!(typeof v.source_status==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(v.source_status))||!['AVAILABLE','PARTIAL','INVALID','NOT_CAPTURED'].includes(v.status)||v.basis!==basis||!exact(v.dates,dateKeys)||!exact(v.amounts,amountKeys)||!finiteList(v.missing_fields)||!finiteList(v.invalid_fields))return null;
  if(!Object.values(v.amounts).every(n=>n===null||integer(n,Number.MIN_SAFE_INTEGER))||!Object.values(v.dates).every(d=>d===null||iso(d)&&Date.parse(d)/1000<=v.checked_at))return null;
  for(const field of FINANCIAL_ORDER_COMPONENT_FIELDS)if(v.amounts[field+'_cents']===null&&!v.missing_fields.includes(field)&&!v.invalid_fields.includes(field))return null;
  for(const field of dateKeys)if(v.dates[field]===null&&!v.missing_fields.includes('dates.'+field)&&!v.invalid_fields.includes('dates.'+field))return null;
  if(v.status==='AVAILABLE'&&(v.missing_fields.length||v.invalid_fields.length)||v.status==='INVALID'&&v.invalid_fields.length===0||v.invalid_fields.length&&v.status!=='INVALID')return null;
  return {...v,dates:{...v.dates},amounts:{...v.amounts},missing_fields:[...v.missing_fields],invalid_fields:[...v.invalid_fields]};
 }catch{return null;}
}
export async function buildFinancialOrderComponents(input,profile=FINANCE_PROFILE){
 if(!exact(input,['order_sn','order_status','currency','payment','record','order'])||!integer(profile?.partner_id,1)||!integer(profile?.shop_id,1))fail('CONTEXT_INVALID');
 const {order_sn,order_status,currency,payment,record,order}=input;
 // This already validates the cohort record's exact source hash and private
 // order identity. Optional component failures never relax that binding.
 await buildFinancialOrderEvidence({order_sn,order_status,currency,payment,record},profile);
 for(const row of [payment,value(payment,'order_income'),order])if(plain(row))for(const key of ['shop_id','partner_id','order_sn'])if(own(row,key)&&value(row,key)!==(key==='order_sn'?order_sn:profile[key]))fail('CONTEXT_INVALID');
 const missing=[],invalid=[],income=value(payment,'order_income');
 const mark=(name,missingValue)=>{(missingValue?missing:invalid).push(name);return null;};
 const amounts=Object.fromEntries(FINANCIAL_ORDER_COMPONENT_FIELDS.map(field=>{
  const d=own(income,field),v=value(income,field);if(!d||Object.hasOwn(d,'value')&&(v===null||v===undefined))return [field+'_cents',mark(field,true)];
  const n=providerCents(v);return [field+'_cents',n===null?mark(field,false):n];
 }));
 if(record.payment_covered===1){
  if(currency!=='BRL')fail('CONTEXT_INVALID');
  for(const [field,raw] of [['escrow_amount',record.escrow_raw],['original_cost_of_goods_sold',record.sales_raw],['ads_escrow_top_up_fee_or_technical_support_fee',record.ads_raw]]){
   const match=/^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(raw),cents=match?(BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0')))*(match[1]?-1n:1n):null;
   if(amounts[field+'_cents']===null||cents!==BigInt(amounts[field+'_cents']))fail('CONTEXT_INVALID');
  }
 }
 const adjusted=[amounts.escrow_amount_cents,amounts.total_adjustment_amount_cents,amounts.escrow_amount_after_adjustment_cents];
 if(adjusted.every(v=>v!==null)&&BigInt(adjusted[0])+BigInt(adjusted[1])!==BigInt(adjusted[2]))invalid.push('escrow_amount_after_adjustment');
 const dates=Object.fromEntries(Object.entries(FINANCIAL_ORDER_COMPONENT_DATE_FIELDS).map(([field,providerField])=>{
  const d=own(order,providerField),v=value(order,providerField);if(!d||Object.hasOwn(d,'value')&&(v===null||v===undefined||v===0))return [field,mark('dates.'+field,true)];
  return [field,integer(v,946684800,Math.min(record.checked_at,4102444799))?new Date(v*1000).toISOString():mark('dates.'+field,false)];
 }));
 const observedCurrency=currency==='BRL'?'BRL':mark('currency',currency===null||currency===undefined),observedStatus=typeof order_status==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(order_status)?order_status:mark('source_status',order_status===null||order_status===undefined);
 const status=invalid.length?'INVALID':!plain(payment)?'NOT_CAPTURED':missing.length?'PARTIAL':'AVAILABLE';
 const candidate={schema:'financial_order_components_v1',order_hash:record.order_hash,source_hash:record.source_hash,checked_at:record.checked_at,currency:observedCurrency,source_status:observedStatus,status,dates,amounts,missing_fields:missing,invalid_fields:invalid,basis};
 const projected=projectFinancialOrderComponents(candidate);if(!projected)fail('CONTEXT_INVALID');const payload=JSON.stringify(projected);if(encoder.encode(payload).byteLength>16384)fail('CONTEXT_INVALID');
 return {order_hash:record.order_hash,source_hash:record.source_hash,checked_at:record.checked_at,payload,payload_hash:await hash(payload)};
}

// SELECT-only: old cache snapshots without a capture remain NOT_CAPTURED.
// No DDL, refresh, provider read, clock rewriting or financial zero is produced.
export async function readFinancialOrderComponents(env,input,{now=()=>Date.now(),authorize=null}={}){
 const profile=getFinanceProfile(env),db=env?.FINANCE_DB;
 if(!exact(input,['run_id','order_hashes'])||!projectBusinessPeriodRequest({operation:'read',run_id:input.run_id})||!list(input.order_hashes,1000)||input.order_hashes.some(h=>!digest(h))||new Set(input.order_hashes).size!==input.order_hashes.length)fail('REQUEST_INVALID',400);
 if(!db?.prepare||!db?.batch||db===env.ADMIN_DB||env.COMMERCIAL_CONTEXT&&!tenantDatabaseHasContext(db,env.COMMERCIAL_CONTEXT,{domain:'finance'}))fail('CONFIGURATION');
 const access=async()=>{if(authorize!==null&&(typeof authorize!=='function'||await authorize()!==true))fail('AUTHORIZATION_REVOKED',403);};await access();
 const millis=now();if(!integer(millis,1,9999999999999))fail('CLOCK_INVALID');const stamp=Math.floor(millis/1000),json=JSON.stringify(input.order_hashes),identity=[profile.partner_id,profile.shop_id];let batch;
 try{batch=await db.batch([
  db.prepare('SELECT run_id,revision,checked_at,partner_id,shop_id FROM finance_business_period_runs WHERE run_id=? AND partner_id=? AND shop_id=?').bind(input.run_id,...identity),
  db.prepare('SELECT order_hash,source_hash,checked_at FROM finance_business_period_orders WHERE run_id=? AND order_hash IN(SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM finance_business_period_runs WHERE run_id=? AND partner_id=? AND shop_id=?) UNION ALL SELECT order_hash,source_hash,checked_at FROM finance_business_period_payment_cache WHERE run_id=? AND order_hash IN(SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM finance_business_period_runs WHERE run_id=? AND partner_id=? AND shop_id=?)').bind(input.run_id,json,input.run_id,...identity,input.run_id,json,input.run_id,...identity),
  db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name='finance_financial_order_components'")
 ]);}catch{fail('STORAGE_UNAVAILABLE');}
 const run=batch[0]?.results?.[0],records=batch[1]?.results,schemas=batch[2]?.results;if(!run)fail('RUN_NOT_FOUND',404);
 if(run.run_id!==input.run_id||run.partner_id!==identity[0]||run.shop_id!==identity[1]||!integer(run.revision,1)||!integer(run.checked_at,1,stamp+60)||!Array.isArray(records)||!Array.isArray(schemas)||schemas.length>1)fail('STORAGE_INVALID');
 const byId=new Map();for(const r of records){if(!digest(r.order_hash)||!digest(r.source_hash)||!integer(r.checked_at,1,run.checked_at)||byId.has(r.order_hash))fail('STORAGE_INVALID');byId.set(r.order_hash,r);}
 if(input.order_hashes.some(h=>!byId.has(h)))fail('ORDER_NOT_FOUND',404);
 const canonical=s=>s.replace(/\bIF NOT EXISTS\s+/i,'').replace(/\s+/g,' ').trim().replace(/;$/,'');
 if(schemas.length&&(schemas[0].type!=='table'||schemas[0].name!=='finance_financial_order_components'||typeof schemas[0].sql!=='string'||canonical(schemas[0].sql)!==canonical(FINANCIAL_ORDER_COMPONENTS_SCHEMA[0])))fail('STORAGE_INVALID');
 let captures=[];if(schemas.length)try{captures=(await db.prepare('SELECT order_hash,source_hash,checked_at,payload,payload_hash FROM finance_financial_order_components WHERE run_id=? AND order_hash IN(SELECT value FROM json_each(?)) AND EXISTS(SELECT 1 FROM finance_business_period_runs WHERE run_id=? AND partner_id=? AND shop_id=?)').bind(input.run_id,json,input.run_id,...identity).all()).results;}catch{fail('STORAGE_UNAVAILABLE');}
 if(!Array.isArray(captures)||captures.length>input.order_hashes.length)fail('STORAGE_INVALID');const captured=new Map();let missing=0,invalid=0;
 for(const r of captures){if(!digest(r.order_hash)||captured.has(r.order_hash))fail('STORAGE_INVALID');captured.set(r.order_hash,r);}
 const orders=[];for(const h of input.order_hashes){const source=byId.get(h),row=captured.get(h);let components=null,payloadHash=null;
  if(row){try{if(row.source_hash!==source.source_hash||row.checked_at!==source.checked_at||typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>16384||!digest(row.payload_hash)||await hash(row.payload)!==row.payload_hash)throw Error();components=projectFinancialOrderComponents(JSON.parse(row.payload));if(!components||components.order_hash!==h||components.source_hash!==source.source_hash||components.checked_at!==source.checked_at)throw Error();payloadHash=row.payload_hash;}catch{components=null;invalid++;}}
  else missing++;
  if(components?.status==='INVALID')invalid++;
  orders.push({order_hash:h,source_hash:source.source_hash,checked_at:source.checked_at,components,payload_hash:payloadHash});
 }
 await access();return {schema:'financial_order_components_snapshot_v1',status:!schemas.length||missing===orders.length?'NOT_CAPTURED':invalid||missing||orders.some(r=>r.components?.status!=='AVAILABLE')?'PARTIAL':'AVAILABLE',run_id:input.run_id,source_revision:run.revision,checked_at:run.checked_at,orders,missing_orders:missing,invalid_orders:invalid};
}
