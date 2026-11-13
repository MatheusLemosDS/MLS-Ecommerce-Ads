import {TenantInitializationSet} from '../../cloudflare/src/tenant-storage.mjs';
import {FINANCE_PROFILE} from './connection-store.mjs';
import {projectOriginalItemsFrame} from './original-items-frame.mjs';

// Additive private evidence only. The established Returns payload, its hash,
// refresh deadline and financial interpretation remain unchanged.
export const RETURN_ITEM_EVIDENCE_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS finance_return_item_evidence(partner_id INTEGER NOT NULL,shop_id INTEGER NOT NULL,case_hash TEXT NOT NULL,order_hash TEXT NOT NULL,legacy_payload_hash TEXT NOT NULL,checked_at INTEGER NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=65536),payload_hash TEXT NOT NULL,PRIMARY KEY(partner_id,shop_id,case_hash))`,
];
const encoder=new TextEncoder(),plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const ready=new TenantInitializationSet();
const read=(value,key)=>plain(value)?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const list=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(field=>field&&Object.hasOwn(field,'value'));
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
const compareId=(a,b)=>a.length-b.length||a.localeCompare(b);
function id(value,zero=false){if(typeof value==='number'){if(!integer(value,zero?0:1))return null;value=String(value);}return typeof value==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(value)?value:null;}
const bound=(row,payload)=>JSON.stringify({partner_id:row.partner_id,shop_id:row.shop_id,case_hash:row.case_hash,order_hash:row.order_hash,legacy_payload_hash:row.legacy_payload_hash,checked_at:row.checked_at,payload});
function canonicalItems(value,provider=false){
 if(!list(value,1000)||value.length===0)return null;
 const grouped=new Map();
 for(const row of value){
  if(!plain(row)||!provider&&!exact(row,['item_id','model_id','quantity']))return null;
  const item_id=id(read(row,'item_id')),model_id=id(read(row,'model_id'),true),quantity=read(row,provider?'amount':'quantity');
  if(!item_id||model_id===null||!integer(quantity,1,provider?1000000000:1000000000000))return null;
  const key=item_id+':'+model_id;if(grouped.has(key))return null;
  grouped.set(key,{item_id,model_id,quantity});
 }
 const result=[...grouped.values()].sort((a,b)=>compareId(a.item_id,b.item_id)||compareId(a.model_id,b.model_id));
 return provider||JSON.stringify(result)===JSON.stringify(value)?result:null;
}

export async function prepareReturnItemEvidenceStore(db){
 if(ready.has(db))return true;
 try{await db.batch(RETURN_ITEM_EVIDENCE_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);return true;}catch{return false;}
}

export async function buildReturnItemEvidence(reference,legacyPayloadHash,checkedAt,response,profile=FINANCE_PROFILE){
 if(!digest(reference?.case_hash)||!digest(reference?.order_hash)||!digest(legacyPayloadHash)||!integer(checkedAt,1,9999999999))throw Error('RETURN_ITEM_EVIDENCE_CONTEXT_INVALID');
 let state='NOT_CAPTURED',items=[];
 try{
  const field=plain(response)?Object.getOwnPropertyDescriptor(response,'item'):null;
  if(field){
   if(!Object.hasOwn(field,'value'))state='INVALID';
   else if(field.value!==null&&field.value!==undefined){
    if(Array.isArray(field.value)&&field.value.length>1000)state='LIMIT_REACHED';
    else{const result=canonicalItems(field.value,true);state=result?'AVAILABLE':'INVALID';if(result)items=result;}
   }
  }
 }catch{state='INVALID';items=[];}
 let payload={schema:'return_item_evidence_v1',state,items};
 if(encoder.encode(JSON.stringify(payload)).byteLength>65536)payload={schema:'return_item_evidence_v1',state:'LIMIT_REACHED',items:[]};
 const row={partner_id:profile.partner_id,shop_id:profile.shop_id,case_hash:reference.case_hash,order_hash:reference.order_hash,legacy_payload_hash:legacyPayloadHash,checked_at:checkedAt};
 return {...row,payload:JSON.stringify(payload),payload_hash:await hash(bound(row,payload))};
}

// This must precede the existing legacy UPDATE in the same D1 batch. Both
// statements use the same still-held case lease. A lost lease cannot write a
// sidecar, and a transaction failure cannot publish only one of the two rows.
export function returnItemEvidenceStatement(db,row,owner,writeAt){
 if(!integer(writeAt,row.checked_at,9999999999))throw Error('RETURN_ITEM_EVIDENCE_CLOCK_INVALID');
 return db.prepare('INSERT INTO finance_return_item_evidence(partner_id,shop_id,case_hash,order_hash,legacy_payload_hash,checked_at,payload,payload_hash) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM finance_returns_reconciliation_cases WHERE case_hash=? AND partner_id=? AND shop_id=? AND order_hash=? AND lease_owner=? AND lease_until>?) ON CONFLICT(partner_id,shop_id,case_hash) DO UPDATE SET order_hash=excluded.order_hash,legacy_payload_hash=excluded.legacy_payload_hash,checked_at=excluded.checked_at,payload=excluded.payload,payload_hash=excluded.payload_hash').bind(row.partner_id,row.shop_id,row.case_hash,row.order_hash,row.legacy_payload_hash,row.checked_at,row.payload,row.payload_hash,row.case_hash,row.partner_id,row.shop_id,row.order_hash,owner,writeAt);
}

// Bad optional data is localized to its count block. Neither stale evidence nor
// another profile's row can acquire the current legacy observation's identity.
export async function projectSavedReturnItemEvidence(row,legacy,profile=FINANCE_PROFILE){
 if(!row)return {state:'NOT_CAPTURED',items:[]};
 try{
  if(row.partner_id!==profile.partner_id||row.shop_id!==profile.shop_id||row.case_hash!==legacy.case_hash||row.order_hash!==legacy.order_hash||row.legacy_payload_hash!==legacy.payload_hash||!integer(row.checked_at,1,9999999999)||row.checked_at!==JSON.parse(legacy.payload).checked_at||typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>65536||!digest(row.payload_hash))throw Error();
  const payload=JSON.parse(row.payload);if(!exact(payload,['schema','state','items'])||payload.schema!=='return_item_evidence_v1'||!['AVAILABLE','NOT_CAPTURED','INVALID','LIMIT_REACHED'].includes(payload.state)||await hash(bound(row,payload))!==row.payload_hash)throw Error();
  const items=payload.state==='AVAILABLE'?canonicalItems(payload.items):list(payload.items,0)?[]:null;if(!items)throw Error();
  return {state:payload.state,items};
 }catch{return {state:'INVALID',items:[]};}
}

export function buildOriginalItemsReport(source,report,savedItems){
 const selected=[...new Set(report.cases.map(row=>row.order_hash))].sort(),byOrder=new Map(source.orders.map(row=>[row.order_hash,row]));
 const orders=selected.map(order_hash=>{
  const row=byOrder.get(order_hash),eligible=row&&['completed','ongoing'].includes(row.bucket)&&row.payment_covered===1;
  const items=eligible?canonicalItems(row.items):null;
  return {order_hash,source_checked_at:row?.checked_at??null,state:items?'AVAILABLE':'NOT_CAPTURED',items:items??[]};
 });
 const cases=report.cases.map(row=>({case_hash:row.case_hash,order_hash:row.order_hash,source_checked_at:row.checked_at,...(savedItems?.get(row.case_hash)??{state:'NOT_CAPTURED',items:[]})}));
 const result={schema:'finance_original_items_v1',run_id:report.run_id,source_revision:report.source_revision,start_date:report.start_date,end_date:report.end_date,checked_at:report.checked_at,orders,cases,truncation:{orders_total:report.truncation.truncated?null:orders.length,orders_included:orders.length,cases_total:report.truncation.cases_total,cases_included:cases.length,truncated:report.truncation.truncated},basis:'SAVED_PROVIDER_SELLING_UNIT_COUNTS_NOT_PHYSICAL_PIECES'};
 // Reserve metadata first. Add only complete blocks in deterministic order;
 // a budget overflow never silently drops a line from an otherwise AVAILABLE
 // block and never makes the legacy financial report fail.
 const blocks=[...orders,...cases],available=blocks.map(row=>({row,items:row.items}));
 for(const entry of available)if(entry.row.state==='AVAILABLE'){entry.row.state='LIMIT_REACHED';entry.row.items=[];}
 for(const entry of available)if(entry.items.length){entry.row.state='AVAILABLE';entry.row.items=entry.items;if(encoder.encode(JSON.stringify(result)).byteLength>65536){entry.row.state='LIMIT_REACHED';entry.row.items=[];}}
 return projectOriginalItemsFrame(result,report);
}
