import {FINANCE_PROFILE,FinanceConnectionError} from './connection-store.mjs';
import {projectBusinessPeriodRequest} from './business-period-frame.mjs';

// Private source evidence only. The old paid-cohort frame and its arithmetic
// keep their exact contract; neither return identifiers nor source payloads
// belong in an App/browser response.
export const FINANCIAL_ORDER_EVIDENCE_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS finance_business_order_evidence(run_id TEXT NOT NULL,order_hash TEXT NOT NULL,source_hash TEXT NOT NULL,checked_at INTEGER NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=32768),payload_hash TEXT NOT NULL,PRIMARY KEY(run_id,order_hash))`,
];
export class FinancialOrderEvidenceError extends FinanceConnectionError{
 constructor(code,status=503){super(code,status);}
}
const fail=(suffix,status=503)=>{throw new FinancialOrderEvidenceError('FINANCE_ORDER_EVIDENCE_'+suffix,status);};
const encoder=new TextEncoder(),plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const read=(value,key)=>plain(value)?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const list=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(value=>value&&Object.hasOwn(value,'value'));
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const serial=value=>typeof value==='string'&&value.length>0&&value.length<=128&&!/[^\x21-\x7e]|,/.test(value);
const status=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(value);
const currency=value=>typeof value==='string'&&/^[A-Z]{3}$/.test(value);
const buckets=['completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown'];
const diagnostics=[null,'PAYMENT_NOT_OBSERVED','INVALID','ADJUSTMENT_MISMATCH'];
const recordKeys=['order_hash','bucket','payment_covered','sales_raw','escrow_raw','ads_raw','returns_seen','items','checked_at','source_hash'];
const canonical=record=>Object.fromEntries(recordKeys.filter(key=>key!=='source_hash').map(key=>[key,read(record,key)]));
async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
function raw(cents){const negative=cents<0n;if(negative)cents=-cents;const fraction=(cents%100n).toString().padStart(2,'0').replace(/0+$/,'');return (negative?'-':'')+(cents/100n).toString()+(fraction?'.'+fraction:'');}
function cents(value){
 if(typeof value!=='string'||value.length>40)return null;const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value);if(!match)return null;
 let amount=BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0'));if(match[1])amount=-amount;return amount< -100000000000000000n||amount>100000000000000000n||raw(amount)!==value?null:amount;
}
function providerAmount(value){
 if(typeof value!=='number'||!Number.isFinite(value)||Object.is(value,-0)||Math.abs(value)>1000000000000)return null;
 const match=/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(String(value));if(!match)return null;
 let digits=(match[2]+(match[3]||'')).replace(/^0+/,'')||'0',scale=(match[3]||'').length-Number(match[4]||0);
 while(scale>0&&digits.endsWith('0')){digits=digits.slice(0,-1)||'0';scale--;}
 if(scale>2||scale< -20||digits.length>20)return null;if(scale<0){digits+='0'.repeat(-scale);scale=0;}
 let amount=BigInt(digits)*10n**BigInt(2-scale);if(match[1])amount=-amount;return raw(amount);
}
function validRecord(record){
 if(!exact(record,recordKeys)||!digest(record.order_hash)||!digest(record.source_hash)||!buckets.includes(record.bucket)||![0,1].includes(record.payment_covered)||!integer(record.checked_at,1,9999999999)||![null,0,1].includes(record.returns_seen)||typeof record.items!=='string'||encoder.encode(record.items).byteLength>1048576||!['sales_raw','escrow_raw','ads_raw'].every(key=>record[key]===null||cents(record[key])!==null))return false;
 let items;try{items=JSON.parse(record.items);}catch{return false;}
 const paid=['completed','ongoing'].includes(record.bucket),money=['sales_raw','escrow_raw','ads_raw'];
 if(!list(items,1000)||!paid&&(record.payment_covered!==0||record.returns_seen!==null||money.some(key=>record[key]!==null)||items.length!==0)||paid&&items.length===0)return false;
 if(record.payment_covered===0&&(record.returns_seen!==null||money.some(key=>record[key]!==null))||record.payment_covered===1&&(money.some(key=>record[key]===null)||cents(record.sales_raw)<0n))return false;
 const seen=new Set();for(const row of items){if(!exact(row,['item_id','model_id','quantity'])||typeof row.item_id!=='string'||!/^[1-9][0-9]{0,19}$/.test(row.item_id)||typeof row.model_id!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(row.model_id)||!integer(row.quantity,1,1000000000000)||seen.has(row.item_id+':'+row.model_id))return false;seen.add(row.item_id+':'+row.model_id);}
 return true;
}

export function projectFinancialOrderEvidence(value){
 if(!exact(value,['schema','order_sn','order_status','currency','return_order_sn_list','amounts','diagnostic'])||value.schema!=='financial_order_evidence_v1'||!serial(value.order_sn)||value.order_status!==null&&!status(value.order_status)||value.currency!==null&&!currency(value.currency)||!diagnostics.includes(value.diagnostic)||!exact(value.amounts,['escrow_amount_raw','escrow_amount_after_adjustment_raw','total_adjustment_amount_raw']))return null;
 const returns=value.return_order_sn_list;if(returns!==null&&(!list(returns,100)||!returns.every(serial)||new Set(returns).size!==returns.length))return null;
 if(!Object.values(value.amounts).every(value=>value===null||cents(value)!==null))return null;
 const a=value.amounts,complete=Object.values(a).every(value=>value!==null),consistent=!complete||cents(a.escrow_amount_raw)+cents(a.total_adjustment_amount_raw)===cents(a.escrow_amount_after_adjustment_raw);
 if(value.diagnostic==='ADJUSTMENT_MISMATCH'&&(!complete||consistent)||complete&&!consistent&&!['INVALID','ADJUSTMENT_MISMATCH'].includes(value.diagnostic)||value.diagnostic==='PAYMENT_NOT_OBSERVED'&&(returns!==null||Object.values(a).some(value=>value!==null))||value.diagnostic===null&&(value.order_status===null||value.currency===null))return null;
 return {...value,return_order_sn_list:returns===null?null:[...returns],amounts:{...a}};
}

// Capture is deliberately tolerant of optional provider fields: an invalid
// adjustment or return list becomes invalid evidence, never a failed paid page.
// Only a forged source context is rejected before a sidecar can be constructed.
export async function buildFinancialOrderEvidence(input){
 if(!exact(input,['order_sn','order_status','currency','payment','record']))fail('CONTEXT_INVALID');
 const {order_sn,order_status:sourceStatus,currency:sourceCurrency,payment,record}=input;
 if(!serial(order_sn)||!validRecord(record)||await hash(order_sn)!==record.order_hash||await hash(JSON.stringify(canonical(record)))!==record.source_hash)fail('CONTEXT_INVALID');
 let invalid=!status(sourceStatus)||sourceCurrency!==null&&sourceCurrency!==undefined&&!currency(sourceCurrency);
 const evidence={schema:'financial_order_evidence_v1',order_sn,order_status:status(sourceStatus)?sourceStatus:null,currency:currency(sourceCurrency)?sourceCurrency:null,return_order_sn_list:null,amounts:{escrow_amount_raw:null,escrow_amount_after_adjustment_raw:null,total_adjustment_amount_raw:null},diagnostic:null};
 const observed=plain(payment),income=read(payment,'order_income');
 if(payment!==null&&payment!==undefined&&!observed)invalid=true;
 if(observed){
  for(const row of [payment,...(plain(income)?[income]:[])])for(const name of ['order_sn','shop_id','partner_id'])if(Object.hasOwn(row,name)&&read(row,name)!==(name==='order_sn'?order_sn:FINANCE_PROFILE[name]))invalid=true;
  if(Object.hasOwn(payment,'return_order_sn_list')){const value=read(payment,'return_order_sn_list');if(list(value,100)&&value.every(serial)&&new Set(value).size===value.length)evidence.return_order_sn_list=[...value];else invalid=true;}
  if(income!==null&&income!==undefined&&!plain(income))invalid=true;
  if(plain(income))for(const field of ['escrow_amount','escrow_amount_after_adjustment','total_adjustment_amount']){
   if(!Object.hasOwn(income,field))continue;const value=read(income,field);if(value===null)continue;
   const amount=providerAmount(value);if(amount===null)invalid=true;else evidence.amounts[field+'_raw']=amount;
  }
 }
 if(record.payment_covered===1&&(evidence.currency!=='BRL'||evidence.amounts.escrow_amount_raw!==record.escrow_raw))invalid=true;
 if(record.returns_seen!==null&&evidence.return_order_sn_list!==null&&record.returns_seen!==Number(evidence.return_order_sn_list.length>0))invalid=true;
 const amounts=evidence.amounts,complete=Object.values(amounts).every(value=>value!==null),mismatch=complete&&cents(amounts.escrow_amount_raw)+cents(amounts.total_adjustment_amount_raw)!==cents(amounts.escrow_amount_after_adjustment_raw);
 evidence.diagnostic=invalid?'INVALID':mismatch?'ADJUSTMENT_MISMATCH':!observed?'PAYMENT_NOT_OBSERVED':null;
 // Non-paid detail responses may omit currency; that is useful missing
 // evidence, not an inferred BRL value or a reason to discard an order.
 if(evidence.diagnostic===null&&(evidence.order_status===null||evidence.currency===null))evidence.diagnostic='INVALID';
 const projected=projectFinancialOrderEvidence(evidence);if(!projected)fail('CONTEXT_INVALID');
 const payload=JSON.stringify(projected);if(encoder.encode(payload).byteLength>32768)fail('CONTEXT_INVALID');
 return {order_hash:record.order_hash,source_hash:record.source_hash,checked_at:record.checked_at,payload,payload_hash:await hash(payload)};
}

// A single consistent local snapshot, including an optional paid-page cache.
// Legacy/malformed sidecars stay explicit; they never acquire invented returns
// or adjustment amounts and no provider access is performed on this path.
export async function readFinancialOrderEvidence(env,input,{now=()=>Date.now()}={}){
 if(!exact(input,['run_id'])||!projectBusinessPeriodRequest({operation:'read',run_id:input.run_id}))fail('REQUEST_INVALID',400);
 const db=env?.FINANCE_DB;if(typeof db?.prepare!=='function'||typeof db?.batch!=='function'||db===env.ADMIN_DB)fail('CONFIGURATION');
 let stamp;try{const value=now();if(!integer(value,1,9999999999999))throw Error();stamp=Math.floor(value/1000);}catch{fail('CLOCK_INVALID');}
 const identity=[FINANCE_PROFILE.partner_id,FINANCE_PROFILE.shop_id],select=table=>db.prepare(`SELECT o.order_hash,o.bucket,o.payment_covered,o.sales_raw,o.escrow_raw,o.ads_raw,o.returns_seen,o.items,o.source_hash,o.checked_at,e.source_hash AS evidence_source_hash,e.checked_at AS evidence_checked_at,e.payload AS evidence_payload,e.payload_hash AS evidence_payload_hash FROM ${table} o LEFT JOIN finance_business_order_evidence e ON e.run_id=o.run_id AND e.order_hash=o.order_hash WHERE o.run_id=? AND EXISTS(SELECT 1 FROM finance_business_period_runs r WHERE r.run_id=o.run_id AND r.partner_id=? AND r.shop_id=?) ORDER BY o.order_hash`).bind(input.run_id,...identity);
 let rows;try{rows=await db.batch([...FINANCIAL_ORDER_EVIDENCE_SCHEMA.map(sql=>db.prepare(sql)),db.prepare('SELECT run_id,revision,status,start_date,end_date,cutoff_at,checked_at,partner_id,shop_id FROM finance_business_period_runs WHERE run_id=? AND partner_id=? AND shop_id=?').bind(input.run_id,...identity),select('finance_business_period_orders'),select('finance_business_period_payment_cache')]);}catch{fail('STORAGE_UNAVAILABLE');}
 const source=rows[1]?.results?.[0],committed=rows[2]?.results,cached=rows[3]?.results;if(!source)fail('RUN_NOT_FOUND',404);
 if(source.run_id!==input.run_id||source.partner_id!==identity[0]||source.shop_id!==identity[1]||!integer(source.revision,1,2147483647)||!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(source.status)||!projectBusinessPeriodRequest({operation:'start',start_date:source.start_date,end_date:source.end_date})||!integer(source.cutoff_at,1,stamp+60)||!integer(source.checked_at,source.cutoff_at,stamp+60)||!Array.isArray(committed)||committed.length>1000||!Array.isArray(cached)||cached.length>20)fail('STORAGE_INVALID');
 let missing=0,invalid=0;const seen=new Set();
 const projectRows=async(values,cache)=>{
  const result=[];for(const value of values){const record=Object.fromEntries(recordKeys.map(key=>[key,value[key]]));
   if(!validRecord(record)||seen.has(record.order_hash)||!integer(record.checked_at,source.cutoff_at,source.checked_at)||await hash(JSON.stringify(canonical(record)))!==record.source_hash||cache&&record.payment_covered!==1)fail('STORAGE_INVALID');seen.add(record.order_hash);
   let evidence=null;
   if(value.evidence_payload!==null&&value.evidence_payload!==undefined){
    try{if(value.evidence_source_hash!==record.source_hash||value.evidence_checked_at!==record.checked_at||typeof value.evidence_payload!=='string'||encoder.encode(value.evidence_payload).byteLength>32768||!digest(value.evidence_payload_hash)||await hash(value.evidence_payload)!==value.evidence_payload_hash)throw Error();evidence=projectFinancialOrderEvidence(JSON.parse(value.evidence_payload));if(!evidence||await hash(evidence.order_sn)!==record.order_hash||record.payment_covered===1&&evidence.amounts.escrow_amount_raw!==record.escrow_raw&&evidence.diagnostic!=='INVALID'||record.returns_seen!==null&&evidence.return_order_sn_list!==null&&record.returns_seen!==Number(evidence.return_order_sn_list.length>0)&&evidence.diagnostic!=='INVALID')throw Error();}catch{evidence=null;}
    if(!cache&&(!evidence||['INVALID','ADJUSTMENT_MISMATCH'].includes(evidence.diagnostic)))invalid++;
   }else if(!cache)missing++;
   result.push({order_hash:record.order_hash,source_hash:record.source_hash,checked_at:record.checked_at,bucket:record.bucket,payment_covered:record.payment_covered,escrow_raw:record.escrow_raw,returns_seen:record.returns_seen,evidence});
  }return result;
 };
 const orders=await projectRows(committed,false),cached_orders=await projectRows(cached,true),times=orders.map(row=>row.checked_at);
 return {schema:'financial_order_evidence_snapshot_v1',run:{run_id:source.run_id,revision:source.revision,status:source.status,start_date:source.start_date,end_date:source.end_date,cutoff_at:source.cutoff_at,checked_at:source.checked_at,source_checked_at:{oldest_at:times.length?Math.min(...times):source.cutoff_at,latest_at:times.length?Math.max(...times):source.checked_at}},orders,cached_orders,missing_orders:missing,invalid_orders:invalid};
}
