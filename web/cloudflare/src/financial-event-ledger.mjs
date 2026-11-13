// A book partition is explicit. Physical wallet/bank/stock accounts are posting
// account_ref values; a transfer can therefore balance inside the same book.
export class FinancialLedgerError extends Error{constructor(code,status=400,options){super(code,options);this.name='FinancialLedgerError';this.code=code;this.status=status;}}
export const FINANCIAL_ACCOUNTS=Object.freeze(['RECEIVABLE','WALLET_AVAILABLE','WALLET_HELD','TRANSFER_IN_TRANSIT','BANK','ADS_PREPAID','INVENTORY','ACCOUNTS_PAYABLE','TAX_PAYABLE','LOAN_PAYABLE','OWNER_CAPITAL','OWNER_DRAWINGS','REVENUE','SALES_RETURNS','FEES','SHIPPING','COGS','ADS_EXPENSE','OPERATING_EXPENSE','TAX_EXPENSE','INVENTORY_LOSS','REPAIR_EXPENSE','OTHER_INCOME','OTHER_EXPENSE']);
export const FINANCIAL_RESULT_ACCOUNTS=Object.freeze(['REVENUE','SALES_RETURNS','FEES','SHIPPING','COGS','ADS_EXPENSE','OPERATING_EXPENSE','TAX_EXPENSE','INVENTORY_LOSS','REPAIR_EXPENSE','OTHER_INCOME','OTHER_EXPENSE']);
const encoder=new TextEncoder(),plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const fields=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
const token=(v,max=128)=>typeof v==='string'&&v.length<=max&&/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(v);
const integer=v=>Number.isSafeInteger(v)&&!Object.is(v,-0),hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=(code,status=400)=>{throw new FinancialLedgerError('FINANCIAL_'+code,status);};
export function financialSafeSum(values){let total=0n;for(const value of values){if(!integer(value))fail('MONEY_INVALID');total+=BigInt(value);}if(total>BigInt(Number.MAX_SAFE_INTEGER)||total<BigInt(Number.MIN_SAFE_INTEGER))fail('MONEY_OVERFLOW');return Number(total);}
export function financialCanonicalJSON(value){
 let count=0;function clean(v,depth){
  if(++count>50000||depth>24)fail('PAYLOAD_LIMIT');
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='string'){if(v.length>196608)fail('PAYLOAD_LIMIT');return v;}
  if(typeof v==='number'){if(!integer(v))fail('PAYLOAD_NUMBER_INVALID');return v;}
  if(Array.isArray(v)){if(v.length>10000||Reflect.ownKeys(v).length!==v.length+1)fail('PAYLOAD_INVALID');const a=[];for(let i=0;i<v.length;i++){const p=Object.getOwnPropertyDescriptor(v,String(i));if(!p||!Object.hasOwn(p,'value'))fail('PAYLOAD_INVALID');a.push(clean(p.value,depth+1));}return a;}
  if(!plain(v))fail('PAYLOAD_INVALID');const result=Object.create(null);
  const keys=Reflect.ownKeys(v);if(keys.some(k=>typeof k!=='string'))fail('PAYLOAD_INVALID');for(const key of keys.sort()){if(['__proto__','constructor','prototype'].includes(key))fail('PAYLOAD_INVALID');const p=Object.getOwnPropertyDescriptor(v,key);if(!p||!Object.hasOwn(p,'value'))fail('PAYLOAD_INVALID');result[key]=clean(p.value,depth+1);}return result;
 }
 const text=JSON.stringify(clean(value,0));if(encoder.encode(text).byteLength>196608)fail('PAYLOAD_LIMIT');return text;
}
export async function financialDigest(value){const bytes=typeof value==='string'?value:financialCanonicalJSON(value);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(bytes)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function normalizeFinancialScope(value){if(!fields(value,['organization_id','store_id','account_id','currency'])||![value.organization_id,value.store_id,value.account_id].every(v=>token(v))||typeof value.currency!=='string'||!/^[A-Z]{3}$/.test(value.currency))fail('SCOPE_INVALID');return {organization_id:value.organization_id,store_id:value.store_id,account_id:value.account_id,currency:value.currency};}
export function sameFinancialScope(a,b){try{return financialCanonicalJSON(normalizeFinancialScope(a))===financialCanonicalJSON(normalizeFinancialScope(b));}catch{return false;}}
export function normalizeFinancialTimestamp(value,{nullable=false}={}){
 if(value===null&&nullable)return null;if(typeof value!=='string'||!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?Z$/.test(value))fail('TIMESTAMP_INVALID');
 const stamp=Date.parse(value);if(!Number.isSafeInteger(stamp))fail('TIMESTAMP_INVALID');const result=new Date(stamp).toISOString();if(result.slice(0,19)!==value.slice(0,19))fail('TIMESTAMP_INVALID');return result;
}
function source(value){
 if(!fields(value,['provider','family','native_id','identity','identity_key'])||!['SHOPEE','BANK','OPERATOR','SYSTEM'].includes(value.provider)||!token(value.family,64)||!['NATIVE_ID','CONSERVATIVE'].includes(value.identity))fail('SOURCE_INVALID');
 if(value.identity==='NATIVE_ID'?!token(value.native_id,256)||value.identity_key!==null:value.native_id!==null||!hash(value.identity_key))fail('SOURCE_IDENTITY_INVALID');
 return {...value};
}
export async function financialEventIdentity(scope,value){const selected=normalizeFinancialScope(scope),s=source(value);return financialDigest(['financial-event-v1',selected,s.provider,s.family,s.identity,s.identity==='NATIVE_ID'?s.native_id:s.identity_key]);}
function event(value){
 financialCanonicalJSON(value);
 const keys=['schema','scope','event_id','version','event_type','event_at','competence_at','settlement_at','source_updated_at','observed_at','source','evidence','causal_event_id','quality','postings'];
 if(!fields(value,keys)||value.schema!=='financial_event_v1'||!hash(value.event_id)||!integer(value.version)||value.version<1||value.version>2147483645||typeof value.event_type!=='string'||!/^[A-Z][A-Z0-9_]{1,63}$/.test(value.event_type)||!['CONFIRMED','REVIEW'].includes(value.quality)||value.causal_event_id!==null&&!hash(value.causal_event_id))fail('EVENT_INVALID');
 const scope=normalizeFinancialScope(value.scope),s=source(value.source);if(s.identity==='CONSERVATIVE'&&value.quality!=='REVIEW')fail('CONSERVATIVE_IDENTITY_REQUIRES_REVIEW');
 const timestamps={};for(const key of ['event_at','competence_at','settlement_at','source_updated_at','observed_at'])timestamps[key]=normalizeFinancialTimestamp(value[key],{nullable:!['event_at','observed_at'].includes(key)});
 if(timestamps.event_at>timestamps.observed_at||timestamps.source_updated_at!==null&&timestamps.source_updated_at>timestamps.observed_at||timestamps.settlement_at!==null&&timestamps.settlement_at>timestamps.observed_at)fail('SOURCE_DATE_IN_FUTURE');
 if(!Array.isArray(value.evidence)||!value.evidence.length||value.evidence.length>32)fail('EVIDENCE_INVALID');
 const evidence=value.evidence.map(row=>{if(!fields(row,['kind','reference','sha256'])||!token(row.kind,64)||!token(row.reference,128)||!hash(row.sha256))fail('EVIDENCE_INVALID');return {...row};});
 if(!Array.isArray(value.postings)||value.postings.length>64||value.quality==='CONFIRMED'&&value.postings.length<2)fail('POSTINGS_INVALID');
 const postings=value.postings.map(row=>{if(!fields(row,['account','account_ref','amount_cents'])||!FINANCIAL_ACCOUNTS.includes(row.account)||!token(row.account_ref,128)||!integer(row.amount_cents))fail('POSTINGS_INVALID');return {...row};});
 if(financialSafeSum(postings.map(row=>row.amount_cents))!==0)fail('UNBALANCED_POSTINGS');
 return {schema:value.schema,scope,event_id:value.event_id,version:value.version,event_type:value.event_type,...timestamps,source:s,evidence,causal_event_id:value.causal_event_id,quality:value.quality,postings};
}
export function validateFinancialEvent(value,{scope=null}={}){const result=event(value);if(scope!==null&&!sameFinancialScope(result.scope,scope))fail('SCOPE_MISMATCH',403);return result;}
export async function createFinancialEvent(value,{version=1}={}){
 if(!fields(value,['scope','event_type','event_at','competence_at','settlement_at','source_updated_at','observed_at','source','evidence','causal_event_id','quality','postings']))fail('EVENT_INVALID');
 return validateFinancialEvent({schema:'financial_event_v1',...value,event_id:await financialEventIdentity(value.scope,value.source),version});
}
export async function financialEventContentHash(value){const result=validateFinancialEvent(value);delete result.version;delete result.observed_at;return financialDigest(result);}
export function financialPostingDelta(previous,current){
 const a=previous===null?null:validateFinancialEvent(previous),b=validateFinancialEvent(current);if(a&&!sameFinancialScope(a.scope,b.scope)||a&&a.event_id!==b.event_id)fail('SCOPE_MISMATCH',403);
 const buckets=new Map();for(const [value,sign] of [[a,-1n],[b,1n]])if(value?.quality==='CONFIRMED')for(const row of value.postings){const key=financialCanonicalJSON([row.account,row.account_ref]),entry=buckets.get(key)??{account:row.account,account_ref:row.account_ref,total:0n};entry.total+=BigInt(row.amount_cents)*sign;buckets.set(key,entry);}
 const result=[...buckets.values()].sort((a,b)=>a.account.localeCompare(b.account)||a.account_ref.localeCompare(b.account_ref)).map(row=>{if(row.total>BigInt(Number.MAX_SAFE_INTEGER)||row.total<BigInt(Number.MIN_SAFE_INTEGER))fail('MONEY_OVERFLOW');return {account:row.account,account_ref:row.account_ref,amount_cents:Number(row.total)};}).filter(row=>row.amount_cents!==0);
 if(financialSafeSum(result.map(row=>row.amount_cents))!==0)fail('UNBALANCED_POSTINGS');return result;
}
