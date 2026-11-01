import {IncurredProductionError,readIncurredProduction,mutateIncurredProduction,incurredProductionPeriods} from './incurred-production.mjs';
import {readProductionCosts} from './production-costs.mjs';

// Saved operational context is not evidence that manufacturing or payment took
// place. This adapter accepts no provider/financial/DTF write capability.
const encoder=new TextEncoder();
const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
const data=(v,key)=>plain(v)?Object.getOwnPropertyDescriptor(v,key)?.value:undefined;
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const id=(v,zero=false)=>typeof v==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(v);
const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&v.trim()===v&&v.normalize('NFC')===v&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
const fail=(code,status=400)=>{throw new IncurredProductionError('INCURRED_PRODUCTION_'+code,status);};
const day=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
function clock(now){let stamp;try{stamp=Math.floor(now()/1000);}catch{}if(!integer(stamp,1,9999999999))fail('CLOCK_INVALID',503);return stamp;}
function selection(input,stamp){
 if(!exact(input,['month','week_of']))fail('REQUEST_INVALID');
 const {month,week_of}=input,today=day(stamp);
 if(typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||month>today.slice(0,7)||typeof week_of!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(week_of)||week_of>today||!Number.isFinite(Date.parse(week_of+'T12:00:00Z'))||new Date(week_of+'T12:00:00Z').toISOString().slice(0,10)!==week_of)fail('REQUEST_INVALID');
 return {month,week_of};
}
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(typeof value==='string'?value:JSON.stringify(value)))),byte=>byte.toString(16).padStart(2,'0')).join('');}
function sourceUnavailable(){return {status:'UNAVAILABLE',checked_at:null,included:0,has_more:true,reason:'SAVED_DTF_UNAVAILABLE',candidates:[]};}
function refsUnavailable(){return {status:'UNAVAILABLE',revision:null,mode:null,adult_regular_cents:null,adult_plus_cents:null};}
function database(env){const db=env?.ADMIN_DB;if(!db?.prepare||!db?.batch)fail('UNAVAILABLE',503);return db;}
async function tables(db){const result=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('production_dtf_orders','production_dtf_lines','production_costs_state')").all();return new Set((result?.results??[]).map(row=>row.name));}
const sourceQuery="SELECT l.unit_key,l.order_id,l.line_key,l.payload,l.source_hash AS line_source_hash,l.checked_at AS line_checked_at,l.missing,o.status AS order_status,o.checked_at AS order_checked_at,o.source_hash AS order_source_hash FROM production_dtf_lines l JOIN production_dtf_orders o ON o.order_id=l.order_id ";
async function candidate(row,stamp){
 if(!plain(row)||!hash(row.unit_key)||!text(row.order_id,80)||typeof row.line_key!=='string'||!row.line_key||row.line_key.length>100||!hash(row.line_source_hash)||!hash(row.order_source_hash)||!integer(row.line_checked_at,1,stamp)||!integer(row.order_checked_at,1,stamp)||![0,1].includes(row.missing)||typeof row.order_status!=='string'||!/^[A-Z][A-Z0-9_]{0,39}$/.test(row.order_status)||typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>8192)return null;
 let payload;try{payload=JSON.parse(row.payload);}catch{return null;}
 if(!exact(payload,['item_id','model_id','sku','quantity','model_name','requires_pair'])||!id(payload.item_id)||!id(payload.model_id,true)||payload.sku!==null&&!text(payload.sku,128)||payload.model_name!==null&&!text(payload.model_name,160)||!integer(payload.quantity,1,10000)||typeof payload.requires_pair!=='boolean'||await digest(row.payload)!==row.line_source_hash||await digest([row.order_id,row.line_key])!==row.unit_key)return null;
 const sourceHash=await digest({key:row.unit_key,line:row.line_source_hash,order:row.order_source_hash,status:row.order_status,missing:row.missing});
 return {key:row.unit_key,hash:sourceHash,checked_at:Math.max(row.line_checked_at,row.order_checked_at),order_hash:await digest(row.order_id),order_status:row.missing?'MISSING':row.order_status,selling_quantity:payload.quantity,item_id:payload.item_id,model_id:payload.model_id,sku:payload.sku,model_name:payload.model_name,quantity_basis:'SAVED_SELLING_UNITS_NOT_PRODUCED_PIECES'};
}
async function savedSources(db,names,stamp){
 if(!names.has('production_dtf_orders')||!names.has('production_dtf_lines'))return sourceUnavailable();
 try{
  const result=await db.prepare(sourceQuery+'ORDER BY MAX(l.checked_at,o.checked_at) DESC,l.unit_key LIMIT 51').all(),rows=result?.results;
  if(!Array.isArray(rows))return sourceUnavailable();
  const candidates=[];let invalid=false,checked_at=null;
  for(const row of rows.slice(0,50)){const value=await candidate(row,stamp);if(!value){invalid=true;continue;}candidates.push(value);checked_at=Math.max(checked_at??0,value.checked_at);}
  const has_more=rows.length>50||invalid;
  return {status:has_more?'PARTIAL':'AVAILABLE',checked_at,included:candidates.length,has_more,reason:has_more?'SAVED_DTF_INCOMPLETE':null,candidates};
 }catch{return sourceUnavailable();}
}
async function selectedSource(db,names,body,stamp){
 const requested=data(body,'source');
 if(data(requested,'kind')!=='SAVED_DTF_ORDER_LINE'||!hash(data(requested,'key'))||!hash(data(requested,'hash'))||!names.has('production_dtf_orders')||!names.has('production_dtf_lines'))return null;
 try{
  const row=await db.prepare(sourceQuery+'WHERE l.unit_key=?').bind(data(requested,'key')).first(),value=await candidate(row,stamp);
  if(!value||value.hash!==data(requested,'hash'))return null;
  return {kind:'SAVED_DTF_ORDER_LINE',key:value.key,hash:value.hash,checked_at:value.checked_at,order_hash:value.order_hash,order_status:value.order_status,selling_quantity:value.selling_quantity};
 }catch{return null;}
}
async function savedReferences(env,names,stamp){
 if(!names.has('production_costs_state'))return refsUnavailable();
 try{
  const current=await readProductionCosts(env);if(Math.floor(Date.parse(current.updated_at)/1000)>stamp)return refsUnavailable();
  const inclusive=current.values.mode==='all_inclusive';
  return {status:'AVAILABLE',revision:current.revision,mode:current.values.mode,adult_regular_cents:inclusive?current.values.inclusive_regular_cents:null,adult_plus_cents:inclusive?current.values.inclusive_plus_cents:null};
 }catch{return refsUnavailable();}
}
function trustedReference(body,references){
 const cost=data(body,'cost'),ref=data(cost,'reference'),identity=data(body,'identity');
 if(!exact(ref,['kind','revision','mode','unit_cost_cents'])||references.status!=='AVAILABLE'||references.mode!=='all_inclusive'||ref.mode!=='all_inclusive'||ref.revision!==references.revision||data(identity,'garment_type')!=='ADULT')return null;
 const regular=ref.kind==='ADULT_REGULAR',plus=ref.kind==='ADULT_PLUS';
 if(!regular&&!plus||!(regular?['P','M','G','GG']:['G1','G2','G3']).includes(data(identity,'size')))return null;
 const amount=references[regular?'adult_regular_cents':'adult_plus_cents'];
 if(ref.unit_cost_cents!==amount||data(cost,'unit_cost_cents')!==amount)return null;
 return {kind:ref.kind,revision:ref.revision,mode:'all_inclusive',unit_cost_cents:amount};
}
function envelope(selected,ledger,source,references,stamp){
 const periods=incurredProductionPeriods(ledger,selected);if(!periods)fail('PERIODS_INVALID',503);
 return {schema:'incurred_production_workspace_v1',...selected,checked_at:stamp,ledger,periods,source,references};
}
async function metadata(env,stamp){
 const db=database(env);let names;try{names=await tables(db);}catch{names=new Set();}
 // Keep reads sequential on the same D1/SQLite connection.
 const source=await savedSources(db,names,stamp),references=await savedReferences(env,names,stamp);
 return {db,names,source,references};
}
export async function readIncurredProductionWorkspace(env,input,{now=()=>Date.now()}={}){
 const stamp=clock(now),selected=selection(input,stamp),fixedNow=()=>stamp*1000;
 const ledger=await readIncurredProduction(env,{now:fixedNow}),{source,references}=await metadata(env,stamp);
 return envelope(selected,ledger,source,references,stamp);
}
export async function mutateIncurredProductionWorkspace(env,input,body,actor,{now=()=>Date.now()}={}){
 const stamp=clock(now),selected=selection(input,stamp),fixedNow=()=>stamp*1000;
 const {db,names,source,references}=await metadata(env,stamp);
 const trustedSource=await selectedSource(db,names,body,stamp),reference=trustedReference(body,references);
 const ledger=await mutateIncurredProduction(env,body,actor,{now:fixedNow,trustedSource,trustedReference:reference});
 return envelope(selected,ledger,source,references,stamp);
}
