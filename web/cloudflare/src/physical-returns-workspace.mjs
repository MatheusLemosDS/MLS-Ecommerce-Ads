import {PhysicalReturnsError,readPhysicalReturns,mutatePhysicalReturns} from './physical-returns.mjs';
import {readBusinessReconciliation,projectBusinessReconciliation} from './business-reconciliation.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';

// This adapter can only read saved reconciliation evidence. No provider service,
// financial writer, settings initializer or external stock capability is accepted.
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const fail=(suffix,status=400)=>{throw new PhysicalReturnsError('PHYSICAL_RETURNS_'+suffix,status);};
function clock(now){let stamp;try{stamp=Math.floor(now()/1000);}catch{}if(!integer(stamp,1,9999999999))fail('CLOCK_INVALID',503);return stamp;}
function selection(input,stamp){
 const descriptor=input&&Object.getOwnPropertyDescriptor(input,'month');
 const month=descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:null;
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
 if(!input||![Object.prototype,null].includes(Object.getPrototypeOf(input))||Reflect.ownKeys(input).length!==1||typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||month>today.slice(0,7))fail('REQUEST_INVALID');
 return month;
}
const unavailable=reason=>({status:'UNAVAILABLE',checked_at:null,cases_total:null,cases_included:0,truncated:true,reason,cases:[]});
export function buildPhysicalReturnCandidates(raw,{now=()=>Date.now()}={}){
 const stamp=clock(now),value=projectBusinessReconciliation(raw,projectReconciliationFrame);
 if(!value||!value.sources.length)return unavailable('SAVED_RETURNS_UNAVAILABLE');
 const allReports=value.reports.length===value.sources.length,found=new Map();let total=0,incomplete=!allReports||value.status!=='CHECKED';
 for(const report of value.reports){
  if(!integer(report.returns.reference_count))return unavailable('SAVED_RETURNS_CONFLICT');total+=report.returns.reference_count;
  incomplete||=report.truncation.truncated||report.pending.includes('RETURN_REFERENCES_MISSING');
  for(const row of report.cases){
   if(row.checked_at!==null&&row.checked_at>stamp){incomplete=true;continue;}
   const candidate={case_hash:row.case_hash,order_hash:row.order_hash,status:row.status,checked_at:row.checked_at,publication_revision:value.source_revision};
   if(found.has(row.case_hash)&&JSON.stringify(found.get(row.case_hash))!==JSON.stringify(candidate))return unavailable('SAVED_RETURNS_CONFLICT');
   found.set(row.case_hash,candidate);
  }
 }
 if(!integer(total)||found.size>120||found.size>total)return unavailable('SAVED_RETURNS_CONFLICT');
 const cases=[...found.values()].sort((a,b)=>a.case_hash.localeCompare(b.case_hash)),truncated=incomplete||cases.length<total;
 return {status:truncated?'PARTIAL':'AVAILABLE',checked_at:value.checked_at,cases_total:allReports?total:null,cases_included:cases.length,truncated,reason:truncated?'SAVED_RETURNS_INCOMPLETE':null,cases};
}
async function savedSource(env,month,now){
 try{return buildPhysicalReturnCandidates(await readBusinessReconciliation(env,{month},{now,readOnly:true}),{now});}
 catch{return unavailable('SAVED_RETURNS_UNAVAILABLE');}
}
function envelope(month,physical,source,stamp){return {schema:'physical_returns_workspace_v1',month,checked_at:Math.max(stamp,physical.checked_at,source.checked_at??0),source,physical};}
export async function readPhysicalReturnsWorkspace(env,input,{now=()=>Date.now()}={}){
 const stamp=clock(now),month=selection(input,stamp);
 const physical=await readPhysicalReturns(env,{now}),source=await savedSource(env,month,now);
 return envelope(month,physical,source,stamp);
}
export async function mutatePhysicalReturnsWorkspace(env,selectionInput,body,actor,{now=()=>Date.now()}={}){
 const stamp=clock(now),month=selection(selectionInput,stamp);
 const action=body&&Object.getOwnPropertyDescriptor(body,'action')?.value;
 const source=await savedSource(env,month,now);
 let sourceCase=null;
 if(action==='register'){
  const selected=source.cases.find(row=>row.case_hash===Object.getOwnPropertyDescriptor(body,'case_hash')?.value);
  if(selected)sourceCase={...selected,month};
 }
 const physical=await mutatePhysicalReturns(env,body,actor,{now,sourceCase});
 return envelope(month,physical,source,stamp);
}
