export const FINANCE_BUSINESS_RETENTION_PATH='/internal/finance/business-period-retention-v1';
export const FINANCE_BUSINESS_RETENTION_REQUEST_MAXIMUM=2048;
export const FINANCE_BUSINESS_RETENTION_RESPONSE_MAXIMUM=2048;
export function createBusinessPeriodRetentionProtocol(){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v)),exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
 const integer=(v,min=1,max=2147483647)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max,uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v),month=v=>typeof v==='string'&&/^20\d\d-(0[1-9]|1[0-2])$/.test(v),date=v=>typeof v==='string'&&/^20\d\d-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 function manifest(v){try{
  if(!exact(v,['kind','month','publication_revision','slots',...(v?.kind==='COHORT'?['lease_id']:[])])||!['PUBLICATION','COHORT'].includes(v.kind)||!month(v.month)||!integer(v.publication_revision)||v.kind==='COHORT'&&!uuid(v.lease_id)||!Array.isArray(v.slots)||Object.getPrototypeOf(v.slots)!==Array.prototype||v.slots.length<1||v.slots.length>3||Reflect.ownKeys(v.slots).length!==v.slots.length+1)return null;
  const seen=new Set();for(let i=0;i<v.slots.length;i++){const s=Object.getOwnPropertyDescriptor(v.slots,String(i));if(!s||!Object.hasOwn(s,'value'))return null;const row=s.value;if(!exact(row,['slot_index','run_id','revision','start_date','end_date'])||row.slot_index!==i||!uuid(row.run_id)||seen.has(row.run_id)||!integer(row.revision)||!date(row.start_date)||!date(row.end_date)||row.start_date!==v.month+'-'+String(i*15+1).padStart(2,'0')||row.end_date.slice(0,7)!==v.month||row.end_date<row.start_date||Date.parse(row.end_date)-Date.parse(row.start_date)>14*86400000||i<v.slots.length-1&&Number(row.end_date.slice(8))!==i*15+15)return null;seen.add(row.run_id);}
  return JSON.parse(JSON.stringify(v));
 }catch{return null;}}
 function request(v){try{
  if(v?.operation==='release')return exact(v,['schema','operation','month','lease_id'])&&v.schema==='finance_business_period_retention_request_v1'&&month(v.month)&&uuid(v.lease_id)?{...v}:null;
  if(!exact(v,['schema','operation','kind','month','publication_revision','slots','lease_id'])||v.schema!=='finance_business_period_retention_request_v1'||!['retain','prepare','confirm'].includes(v.operation)||v.kind==='COHORT'&&v.operation!=='retain'||v.kind==='PUBLICATION'&&v.lease_id!==null)return null;
  const raw=manifest({kind:v.kind,month:v.month,publication_revision:v.publication_revision,slots:v.slots,...(v.kind==='COHORT'?{lease_id:v.lease_id}:{})});return raw?{schema:v.schema,operation:v.operation,...raw,lease_id:v.lease_id}:null;
 }catch{return null;}}
 function response(v){try{
  if(v?.state==='RELEASED')return exact(v,['schema','state','kind','month','lease_id','released','released_at'])&&v.schema==='finance_business_period_retention_v1'&&v.kind==='COHORT'&&month(v.month)&&uuid(v.lease_id)&&typeof v.released==='boolean'&&integer(v.released_at,1,9999999999)?{...v}:null;
  if(!exact(v,['schema','state','kind','month','publication_revision','retained_slots','retained_at','lease_id','expires_at'])||v.schema!=='finance_business_period_retention_v1'||!['RETAINED','PREPARED'].includes(v.state)||!['PUBLICATION','COHORT'].includes(v.kind)||v.state==='PREPARED'&&v.kind!=='PUBLICATION'||!month(v.month)||!integer(v.publication_revision)||!integer(v.retained_slots,1,3)||!integer(v.retained_at,1,9999999999))return null;
  if(v.kind==='PUBLICATION'&&(v.lease_id!==null||v.expires_at!==null))return null;
  if(v.kind==='COHORT'&&(!uuid(v.lease_id)||!integer(v.expires_at,v.retained_at+1,9999999999)))return null;return {...v};
 }catch{return null;}}
 const matches=(q,r)=>{q=request(q);r=response(r);return !!q&&!!r&&q.month===r.month&&(q.operation==='release'?r.state==='RELEASED'&&q.lease_id===r.lease_id:r.state===(q.kind==='PUBLICATION'&&q.operation!=='confirm'?'PREPARED':'RETAINED')&&q.kind===r.kind&&q.publication_revision===r.publication_revision&&q.slots.length===r.retained_slots&&q.lease_id===r.lease_id);};
 return Object.freeze({manifest,request,response,matches});
}
export const projectBusinessPeriodRetentionManifest=v=>createBusinessPeriodRetentionProtocol().manifest(v);
export const projectBusinessPeriodRetentionRequest=v=>createBusinessPeriodRetentionProtocol().request(v);
export const projectBusinessPeriodRetentionResponse=v=>createBusinessPeriodRetentionProtocol().response(v);
export const businessPeriodRetentionResponseMatches=(q,r)=>createBusinessPeriodRetentionProtocol().matches(q,r);
export function projectBusinessPeriodRetentionMissing(value,manifest){try{const selected=projectBusinessPeriodRetentionManifest(manifest),keys=['schema','code','month','lease_id'];return selected?.kind==='COHORT'&&value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'))&&value.schema==='finance_business_period_retention_missing_v1'&&value.code==='FINANCE_BUSINESS_RETENTION_RUN_NOT_FOUND'&&value.month===selected.month&&value.lease_id===selected.lease_id?{schema:value.schema,code:value.code,month:value.month,lease_id:value.lease_id}:null;}catch{return null;}}
