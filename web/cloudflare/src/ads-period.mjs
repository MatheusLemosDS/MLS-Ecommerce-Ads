import {buildAdsMeasurement,projectAdsMeasurement} from './ads-measurement.mjs';
// The operator confirmed that this Ads source reports BRL units on 2026-10-20.
// Consumption still belongs to calendar reporting days, not to a Payment order
// cohort or an individual product. No legacy aggregate is used as financial data.
const adsPeriodKeys=['schema','status','start_date','end_date','fetched_at','covered_days','total_days','missing_dates','expense_cents','days','day_partial','unit_confirmation','source_timezone','basis','diagnostic'];
const adsPeriodUnits='OPERATOR_CONFIRMED_BRL_2026_10_20';
const adsPeriodBasis='CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION';
const adsPeriodDiagnostics=new Set(['ADS_PERIOD_CONFIGURATION','ADS_PERIOD_UNAVAILABLE','ADS_PERIOD_DATE_COVERAGE_PARTIAL','ADS_PERIOD_EXPENSE_INVALID','ADS_PERIOD_ARITHMETIC_UNSAFE']);
const adsPeriodPlain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const adsPeriodExact=(value,keys)=>adsPeriodPlain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const adsPeriodArray=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'));
const adsPeriodInteger=(value,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&value>=0&&value<=max;
const adsPeriodDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const adsPeriodToday=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
function adsPeriodDates(start,end){
 if(!adsPeriodDay(start)||!adsPeriodDay(end))return null;
 const length=(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000+1;
 if(length<1||length>15)return null;
 return Array.from({length},(_,index)=>new Date(Date.parse(start+'T00:00:00Z')+index*86400000).toISOString().slice(0,10));
}
function adsPeriodStamp(now){try{const value=now();return Number.isSafeInteger(value)&&value>0&&Math.floor(value/1000)<=9999999999?Math.floor(value/1000):null;}catch{return null;}}
export function projectAdsPeriodRequest(value,{now=()=>Date.now()}={}){
 try{const stamp=adsPeriodStamp(now);if(!stamp||!adsPeriodExact(value,['start_date','end_date'])||!adsPeriodDates(value.start_date,value.end_date)||value.end_date>adsPeriodToday(stamp))return null;return {start_date:value.start_date,end_date:value.end_date};}catch{return null;}
}
function adsPeriodCents(value){
 const numeric=typeof value==='number';
 // At larger magnitudes a JSON Number can already have lost a cent before
 // String() sees it. Exact decimal strings retain their separate safe-int bound.
 if(numeric){if(!Number.isFinite(value)||value<0||value>1000000000000||Object.is(value,-0))return null;value=String(value);}
 if(typeof value!=='string'||value.length>96||!(/^(0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]{1,3})?$/).test(value)||!numeric&&/[eE]/.test(value))return null;
 const match=/^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
 let digits=(match[1]+(match[2]||'')).replace(/^0+/,'')||'0',scale=(match[2]||'').length-Number(match[3]||0);
 while(scale>0&&digits.endsWith('0')){digits=digits.slice(0,-1)||'0';scale--;}
 if(scale>2||scale< -20||digits.length>20)return null;
 if(scale<0){digits+='0'.repeat(-scale);scale=0;}
 if(digits.length>20)return null;
 const result=BigInt(digits)*10n**BigInt(2-scale);
 return result<=BigInt(Number.MAX_SAFE_INTEGER)?Number(result):null;
}
function adsPeriodSourceDay(value){
 if(adsPeriodDay(value))return value;
 const match=typeof value==='string'&&/^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(value);
 const iso=match?match[3]+'-'+match[2]+'-'+match[1]:null;
 return adsPeriodDay(iso)?iso:null;
}
function adsPeriodEmpty(input,stamp,diagnostic){
 const dates=input?adsPeriodDates(input.start_date,input.end_date):[];
 return {schema:'ads_period_v1',status:'UNAVAILABLE',start_date:input?.start_date??null,end_date:input?.end_date??null,fetched_at:stamp??0,covered_days:0,total_days:dates.length,missing_dates:[...dates],expense_cents:null,days:[],day_partial:!!(input&&stamp&&input.end_date===adsPeriodToday(stamp)),unit_confirmation:adsPeriodUnits,source_timezone:'UNCONFIRMED',basis:adsPeriodBasis,diagnostic};
}
export function projectAdsPeriod(value){
 try{
  const keys=[...adsPeriodKeys,...(adsPeriodPlain(value)&&Object.hasOwn(value,'measurement')?['measurement']:[])];
  if(!adsPeriodExact(value,keys)||value.schema!=='ads_period_v1'||!['AVAILABLE','PARTIAL','UNAVAILABLE'].includes(value.status)||!adsPeriodInteger(value.fetched_at,9999999999)||!adsPeriodInteger(value.covered_days,15)||!adsPeriodInteger(value.total_days,15)||!adsPeriodArray(value.missing_dates,15)||!value.missing_dates.every(adsPeriodDay)||!adsPeriodArray(value.days,15)||typeof value.day_partial!=='boolean'||value.unit_confirmation!==adsPeriodUnits||value.source_timezone!=='UNCONFIRMED'||value.basis!==adsPeriodBasis||value.diagnostic!==null&&!adsPeriodDiagnostics.has(value.diagnostic))return null;
  let measurement;
  if(Object.hasOwn(value,'measurement')){
   measurement=projectAdsMeasurement(value.measurement);if(!measurement)return null;
   for(const key of ['status','start_date','end_date','fetched_at','covered_days','total_days','expense_cents','day_partial'])if(measurement[key]!==value[key])return null;
   if(JSON.stringify(measurement.missing_dates)!==JSON.stringify(value.missing_dates)||JSON.stringify(measurement.days.map(({date,expense_cents})=>({date,expense_cents})))!==JSON.stringify(value.days))return null;
  }
  const dates=adsPeriodDates(value.start_date,value.end_date);
  if(!dates){if(value.status!=='UNAVAILABLE'||value.start_date!==null||value.end_date!==null||value.total_days!==0||value.covered_days!==0||value.missing_dates.length||value.days.length||value.expense_cents!==null||value.day_partial||value.diagnostic!=='ADS_PERIOD_CONFIGURATION')return null;return {...value,missing_dates:[],days:[]};}
  if(value.fetched_at===0||value.end_date>adsPeriodToday(value.fetched_at)||value.total_days!==dates.length||value.day_partial!==(value.end_date===adsPeriodToday(value.fetched_at)))return null;
  if(value.status==='UNAVAILABLE'){
   if(value.covered_days!==0||value.days.length||value.expense_cents!==null||JSON.stringify(value.missing_dates)!==JSON.stringify(dates)||!['ADS_PERIOD_CONFIGURATION','ADS_PERIOD_UNAVAILABLE','ADS_PERIOD_ARITHMETIC_UNSAFE'].includes(value.diagnostic))return null;
  }else{
   if(value.days.length!==dates.length)return null;
   let total=0n,covered=0;const missing=[];
   for(let index=0;index<dates.length;index++){
    const day=value.days[index];if(!adsPeriodExact(day,['date','expense_cents'])||day.date!==dates[index]||day.expense_cents!==null&&!adsPeriodInteger(day.expense_cents))return null;
    if(day.expense_cents===null)missing.push(day.date);else{covered++;total+=BigInt(day.expense_cents);}
   }
   if(value.covered_days!==covered||JSON.stringify(value.missing_dates)!==JSON.stringify(missing))return null;
   if(value.status==='AVAILABLE'?(covered!==dates.length||total>BigInt(Number.MAX_SAFE_INTEGER)||value.expense_cents!==Number(total)||value.diagnostic!==null):(covered===dates.length||value.expense_cents!==null||!['ADS_PERIOD_DATE_COVERAGE_PARTIAL','ADS_PERIOD_EXPENSE_INVALID'].includes(value.diagnostic)))return null;
  }
  return {...Object.fromEntries(adsPeriodKeys.map(key=>[key,key==='days'?value.days.map(day=>({...day})):key==='missing_dates'?[...value.missing_dates]:value[key]])),...(measurement?{measurement}:{})};
 }catch{return null;}
}

export async function getAdsPeriod(env,input,{fetchImpl=request=>fetch(request),now=()=>Date.now(),timeoutMs=10000}={}){
 const stamp=adsPeriodStamp(now),selection=stamp?projectAdsPeriodRequest(input,{now:()=>stamp*1000}):null;
 const failure=code=>adsPeriodEmpty(selection,stamp,code);
 if(!selection||typeof env?.APP_INTERNAL_SECRET!=='string'||!env.APP_INTERNAL_SECRET||env.APP_INTERNAL_SECRET.length>8192||/[\u0000-\u001f\u007f]/.test(env.APP_INTERNAL_SECRET)||typeof fetchImpl!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<5||timeoutMs>10000)return failure('ADS_PERIOD_CONFIGURATION');
 const dates=adsPeriodDates(selection.start_date,selection.end_date),controller=new AbortController();let response,reader,timer;
 const cancel=()=>{try{(reader?reader.cancel():response?.body?.cancel())?.catch(()=>{});}catch{}};
 const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();cancel();reject(Error('deadline'));},timeoutMs);});
 const check=()=>{if(controller.signal.aborted){cancel();throw Error('deadline');}};
 const work=async()=>{
  const url=new URL('https://auth.brazacommerce.com.br/internal/shopee/ads/summary');
  for(const [key,value] of Object.entries(selection))url.searchParams.set(key,value.slice(8,10)+'-'+value.slice(5,7)+'-'+value.slice(0,4));
  response=await fetchImpl(new Request(url,{method:'GET',redirect:'manual',signal:controller.signal,headers:{Accept:'application/json','X-Braza-App-Key':env.APP_INTERNAL_SECRET}}));
  check();if(!(response instanceof Response)||response.redirected||response.status!==200||!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(response.headers.get('content-type')||''))return failure('ADS_PERIOD_UNAVAILABLE');
  const declared=response.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared))||Number(declared)>65536)||!response.body)return failure('ADS_PERIOD_UNAVAILABLE');
  reader=response.body.getReader();const chunks=[];let length=0;
  try{while(true){check();const next=await reader.read();check();if(next.done)break;if(!(next.value instanceof Uint8Array))return failure('ADS_PERIOD_UNAVAILABLE');length+=next.value.length;if(length>65536)return failure('ADS_PERIOD_UNAVAILABLE');chunks.push(next.value);}}
  finally{cancel();try{reader.releaseLock();}catch{}reader=undefined;}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return failure('ADS_PERIOD_UNAVAILABLE');}
  // Admin and Ads pages use one projection of this same read. Legacy metrics
  // can mix direct/broad attribution and are never used to calculate totals.
  const measurement=buildAdsMeasurement(raw,selection,stamp);
  const diagnostic=measurement.diagnostic?.replace('ADS_MEASUREMENT_','ADS_PERIOD_')??null;
  const days=measurement.days.map(({date,expense_cents})=>({date,expense_cents}));
  return projectAdsPeriod({schema:'ads_period_v1',status:measurement.status,...selection,fetched_at:stamp,covered_days:measurement.covered_days,total_days:dates.length,missing_dates:[...measurement.missing_dates],expense_cents:measurement.expense_cents,days,day_partial:selection.end_date===adsPeriodToday(stamp),unit_confirmation:adsPeriodUnits,source_timezone:'UNCONFIRMED',basis:adsPeriodBasis,diagnostic,measurement})||failure('ADS_PERIOD_UNAVAILABLE');
 };
 try{return await Promise.race([work(),deadline]);}catch{return failure('ADS_PERIOD_UNAVAILABLE');}finally{clearTimeout(timer);controller.abort();cancel();}
}
