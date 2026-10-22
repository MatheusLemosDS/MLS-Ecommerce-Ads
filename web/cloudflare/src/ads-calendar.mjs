import {getAdsPeriod} from './ads-period.mjs';
import {projectAdsMeasurement} from './ads-measurement.mjs';

// Calendar reports keep the proven <=15-day source read unchanged. A calendar
// selection uses at most three disjoint reads; no source account total or daily
// ROAS average participates in the resulting monthly sums.
const adsCalendarUnits='OPERATOR_CONFIRMED_BRL_2026_10_20';
const adsCalendarBasis='CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION';
const adsCalendarPlain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const adsCalendarExact=(value,keys)=>adsCalendarPlain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const adsCalendarDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const adsCalendarToday=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
function adsCalendarStamp(now){try{const value=now();return Number.isSafeInteger(value)&&value>0&&Math.floor(value/1000)<=9999999999?Math.floor(value/1000):null;}catch{return null;}}
function adsCalendarDates(start,end){
 if(!adsCalendarDay(start)||!adsCalendarDay(end))return null;
 const count=(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000+1;
 if(count<1||count>31)return null;
 return Array.from({length:count},(_,index)=>new Date(Date.parse(start+'T00:00:00Z')+index*86400000).toISOString().slice(0,10));
}
export function projectAdsCalendarRequest(value,{now=()=>Date.now()}={}){
 try{const stamp=adsCalendarStamp(now);if(!stamp||!adsCalendarExact(value,['start_date','end_date'])||!adsCalendarDates(value.start_date,value.end_date)||value.end_date>adsCalendarToday(stamp))return null;return {start_date:value.start_date,end_date:value.end_date};}catch{return null;}
}
const adsCalendarEmptyMetric=()=>({gmv_cents:null,orders:null,reported_roas_raw:null,calculated_roas_raw:null});
function adsCalendarFailure(selection,stamp,diagnostic){
 const dates=selection?adsCalendarDates(selection.start_date,selection.end_date):[];
 return {schema:'ads_calendar_v1',status:'UNAVAILABLE',start_date:selection?.start_date??null,end_date:selection?.end_date??null,fetched_at:stamp??0,covered_days:0,total_days:dates.length,missing_dates:[...dates],expense_cents:null,known_expense_cents:0,balance_cents:null,days:[],day_partial:!!(selection&&stamp&&selection.end_date===adsCalendarToday(stamp)),unit_confirmation:adsCalendarUnits,source_timezone:'UNCONFIRMED',basis:adsCalendarBasis,diagnostic,totals:{direct:adsCalendarEmptyMetric(),broad:adsCalendarEmptyMetric()}};
}
function adsCalendarChunks(dates){
 const result=[];
 for(let index=0;index<dates.length;index+=15)result.push({start_date:dates[index],end_date:dates[Math.min(index+14,dates.length-1)]});
 return result;
}
function adsCalendarRatio(gmv,expense){
 if(gmv===null||expense===null||expense===0)return null;
 const numerator=BigInt(gmv)*1000000n,denominator=BigInt(expense);let rounded=numerator/denominator;
 if(numerator%denominator*2n>=denominator)rounded++;
 return (rounded/1000000n).toString()+'.'+(rounded%1000000n).toString().padStart(6,'0');
}

export function projectAdsCalendar(value) {
  // Keep helpers local: the client embeds this function via .toString().
  const keys = ['schema', 'status', 'start_date', 'end_date', 'fetched_at', 'covered_days', 'total_days', 'missing_dates', 'expense_cents', 'known_expense_cents', 'balance_cents', 'days', 'day_partial', 'unit_confirmation', 'source_timezone', 'basis', 'diagnostic', 'totals'];
  const metrics = ['gmv_cents', 'orders', 'reported_roas_raw', 'calculated_roas_raw'];
  const isPlain = item => item !== null && typeof item === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(item));
  const isExact = (item, names) => isPlain(item) && Reflect.ownKeys(item).length === names.length && names.every(name => Object.hasOwn(Object.getOwnPropertyDescriptor(item, name) || {}, 'value'));
  const isArray = (item, max) => Array.isArray(item) && Object.getPrototypeOf(item) === Array.prototype && item.length <= max && Reflect.ownKeys(item).length === item.length + 1 && Array.from({length: item.length}, (_, index) => Object.getOwnPropertyDescriptor(item, String(index))).every(descriptor => descriptor && Object.hasOwn(descriptor, 'value'));
  const isInteger = (item, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(item) && item >= 0 && item <= max && !Object.is(item, -0);
  const isDay = item => typeof item === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item) && Number.isFinite(Date.parse(item + 'T00:00:00Z')) && new Date(item + 'T00:00:00Z').toISOString().slice(0, 10) === item;
  const currentDay = stamp => new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/Sao_Paulo'}).format(new Date(stamp * 1000));
  const validReported = item => item === null || typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= 1000000000000 && !Object.is(item, -0) || typeof item === 'string' && item.length <= 96 && /^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(item) && Number(item) <= 1000000000000;
  const calculated = (gmv, expense) => {
    if (gmv === null || expense === null || expense === 0) return null;
    const numerator = BigInt(gmv) * 1000000n, denominator = BigInt(expense);
    let rounded = numerator / denominator;
    if (numerator % denominator * 2n >= denominator) rounded++;
    return (rounded / 1000000n).toString() + '.' + (rounded % 1000000n).toString().padStart(6, '0');
  };
  const metricValid = (item, expense) => isExact(item, metrics) && (item.gmv_cents === null || isInteger(item.gmv_cents)) && (item.orders === null || isInteger(item.orders)) && validReported(item.reported_roas_raw) && item.calculated_roas_raw === calculated(item.gmv_cents, expense);
  const metricEmpty = item => metrics.every(key => item[key] === null);
  const equalDates = (left, right) => left.length === right.length && left.every((date, index) => date === right[index]);
  const diagnostics = ['ADS_CALENDAR_CONFIGURATION', 'ADS_CALENDAR_UNAVAILABLE', 'ADS_CALENDAR_DATE_COVERAGE_PARTIAL', 'ADS_CALENDAR_EXPENSE_INVALID', 'ADS_CALENDAR_ARITHMETIC_UNSAFE'];
  try {
    if (!isExact(value, keys) || value.schema !== 'ads_calendar_v1' || !['AVAILABLE', 'PARTIAL', 'UNAVAILABLE'].includes(value.status) || !isInteger(value.fetched_at, 9999999999) || !isInteger(value.covered_days, 31) || !isInteger(value.total_days, 31) || !isArray(value.missing_dates, 31) || !value.missing_dates.every(isDay) || !isArray(value.days, 31) || typeof value.day_partial !== 'boolean' || value.unit_confirmation !== 'OPERATOR_CONFIRMED_BRL_2026_10_20' || value.source_timezone !== 'UNCONFIRMED' || value.basis !== 'CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION' || value.diagnostic !== null && !diagnostics.includes(value.diagnostic) || !isInteger(value.known_expense_cents) || value.expense_cents !== null && !isInteger(value.expense_cents) || value.balance_cents !== null && !isInteger(value.balance_cents) || !isExact(value.totals, ['direct', 'broad'])) return null;
    let dates = [];
    if (isDay(value.start_date) && isDay(value.end_date)) {
      const length = (Date.parse(value.end_date + 'T00:00:00Z') - Date.parse(value.start_date + 'T00:00:00Z')) / 86400000 + 1;
      if (length < 1 || length > 31 || value.fetched_at === 0 || value.end_date > currentDay(value.fetched_at)) return null;
      dates = Array.from({length}, (_, index) => new Date(Date.parse(value.start_date + 'T00:00:00Z') + index * 86400000).toISOString().slice(0, 10));
    } else if (value.start_date !== null || value.end_date !== null || value.diagnostic !== 'ADS_CALENDAR_CONFIGURATION') return null;
    if (value.total_days !== dates.length || value.day_partial !== (dates.length > 0 && value.end_date === currentDay(value.fetched_at))) return null;
    if (value.status === 'UNAVAILABLE') {
      if (value.covered_days !== 0 || value.days.length || value.expense_cents !== null || value.known_expense_cents !== 0 || value.balance_cents !== null || !equalDates(value.missing_dates, dates) || !['ADS_CALENDAR_CONFIGURATION', 'ADS_CALENDAR_UNAVAILABLE', 'ADS_CALENDAR_ARITHMETIC_UNSAFE'].includes(value.diagnostic)) return null;
      for (const attribution of ['direct', 'broad']) if (!metricValid(value.totals[attribution], null) || !metricEmpty(value.totals[attribution])) return null;
    } else {
      if (!dates.length || value.days.length !== dates.length) return null;
      let total = 0n;
      const missing = [];
      for (let index = 0; index < dates.length; index++) {
        const day = value.days[index];
        if (!isExact(day, ['date', 'expense_cents', 'direct', 'broad']) || day.date !== dates[index] || day.expense_cents !== null && !isInteger(day.expense_cents) || !metricValid(day.direct, day.expense_cents) || !metricValid(day.broad, day.expense_cents)) return null;
        if (day.expense_cents === null) missing.push(day.date); else total += BigInt(day.expense_cents);
      }
      if (total > BigInt(Number.MAX_SAFE_INTEGER) || value.covered_days !== dates.length - missing.length || !equalDates(value.missing_dates, missing) || value.known_expense_cents !== Number(total)) return null;
      if (value.status === 'AVAILABLE' ? missing.length !== 0 || value.expense_cents !== Number(total) || value.diagnostic !== null : missing.length === 0 || value.expense_cents !== null || !['ADS_CALENDAR_DATE_COVERAGE_PARTIAL', 'ADS_CALENDAR_EXPENSE_INVALID'].includes(value.diagnostic)) return null;
      for (const attribution of ['direct', 'broad']) {
        const aggregate = value.totals[attribution];
        if (!metricValid(aggregate, value.expense_cents)) return null;
        for (const field of ['gmv_cents', 'orders']) {
          const amounts = value.days.map(day => day[attribution][field]);
          const sum = amounts.some(amount => amount === null) ? null : amounts.reduce((sum, amount) => sum + BigInt(amount), 0n);
          if (sum !== null && sum > BigInt(Number.MAX_SAFE_INTEGER) || aggregate[field] !== (sum === null ? null : Number(sum))) return null;
        }
        if (aggregate.reported_roas_raw !== (dates.length === 1 ? value.days[0][attribution].reported_roas_raw : null)) return null;
      }
    }
    return Object.fromEntries(keys.map(key => [key, key === 'days' ? value.days.map(day => ({date: day.date, expense_cents: day.expense_cents, direct: {...day.direct}, broad: {...day.broad}})) : key === 'missing_dates' ? [...value.missing_dates] : key === 'totals' ? {direct: {...value.totals.direct}, broad: {...value.totals.broad}} : value[key]]));
  } catch { return null; }
}


/** Compose exactly one validated measurement (or an unavailable slot) per chunk.
 * fetched_at is the end of the bounded collection, not Shopee's update cutoff.
 */
export function buildAdsCalendar(children,selection,fetchedAtEpoch){
 const stamp=Number.isSafeInteger(fetchedAtEpoch)&&fetchedAtEpoch>0&&fetchedAtEpoch<=9999999999?fetchedAtEpoch:0;
 const input=stamp?projectAdsCalendarRequest(selection,{now:()=>stamp*1000}):null;
 const failure=code=>adsCalendarFailure(input,stamp,code);
 if(!input)return failure('ADS_CALENDAR_CONFIGURATION');
 try{
  const dates=adsCalendarDates(input.start_date,input.end_date),chunks=adsCalendarChunks(dates);
  if(!Array.isArray(children)||Object.getPrototypeOf(children)!==Array.prototype||children.length!==chunks.length||Reflect.ownKeys(children).length!==children.length+1)return failure('ADS_CALENDAR_UNAVAILABLE');
  const byDate=new Map();let balance_cents=null,availableChunks=0,invalidExpense=false;
  for(let index=0;index<chunks.length;index++){
   const descriptor=Object.getOwnPropertyDescriptor(children,String(index));if(!descriptor||!Object.hasOwn(descriptor,'value'))return failure('ADS_CALENDAR_UNAVAILABLE');
   const raw=descriptor.value;if(raw===null)continue;
   const child=projectAdsMeasurement(raw),chunk=chunks[index];
   if(!child||child.start_date!==chunk.start_date||child.end_date!==chunk.end_date||child.fetched_at>stamp||stamp-child.fetched_at>60)return failure('ADS_CALENDAR_UNAVAILABLE');
   if(child.status==='UNAVAILABLE')continue;
   availableChunks++;balance_cents=child.balance_cents;
   if(child.diagnostic==='ADS_MEASUREMENT_EXPENSE_INVALID')invalidExpense=true;
   for(const day of child.days){if(!dates.includes(day.date)||byDate.has(day.date))return failure('ADS_CALENDAR_UNAVAILABLE');byDate.set(day.date,day);}
  }
  if(!availableChunks)return failure('ADS_CALENDAR_UNAVAILABLE');
  const days=dates.map(date=>byDate.get(date)??{date,expense_cents:null,direct:adsCalendarEmptyMetric(),broad:adsCalendarEmptyMetric()});
  const missing_dates=days.filter(day=>day.expense_cents===null).map(day=>day.date);
  const known=days.reduce((sum,day)=>sum+BigInt(day.expense_cents??0),0n);
  if(known>BigInt(Number.MAX_SAFE_INTEGER))return failure('ADS_CALENDAR_ARITHMETIC_UNSAFE');
  const expense_cents=missing_dates.length?null:Number(known),totals={};
  for(const attribution of ['direct','broad']){
   const aggregate=adsCalendarEmptyMetric();
   for(const field of ['gmv_cents','orders']){
    const values=days.map(day=>day[attribution][field]);
    if(!values.some(value=>value===null)){
     const sum=values.reduce((sum,value)=>sum+BigInt(value),0n);
     if(sum>BigInt(Number.MAX_SAFE_INTEGER))return failure('ADS_CALENDAR_ARITHMETIC_UNSAFE');aggregate[field]=Number(sum);
    }
   }
   aggregate.reported_roas_raw=dates.length===1?days[0][attribution].reported_roas_raw:null;
   aggregate.calculated_roas_raw=adsCalendarRatio(aggregate.gmv_cents,expense_cents);totals[attribution]=aggregate;
  }
  return projectAdsCalendar({schema:'ads_calendar_v1',status:missing_dates.length?'PARTIAL':'AVAILABLE',...input,fetched_at:stamp,covered_days:dates.length-missing_dates.length,total_days:dates.length,missing_dates,expense_cents,known_expense_cents:Number(known),balance_cents,days,day_partial:input.end_date===adsCalendarToday(stamp),unit_confirmation:adsCalendarUnits,source_timezone:'UNCONFIRMED',basis:adsCalendarBasis,diagnostic:missing_dates.length?(invalidExpense?'ADS_CALENDAR_EXPENSE_INVALID':'ADS_CALENDAR_DATE_COVERAGE_PARTIAL'):null,totals})||failure('ADS_CALENDAR_UNAVAILABLE');
 }catch{return failure('ADS_CALENDAR_UNAVAILABLE');}
}

export async function getAdsCalendar(env,input,options={}){
 const now=options?.now||(()=>Date.now()),stamp=adsCalendarStamp(now),selection=stamp?projectAdsCalendarRequest(input,{now:()=>stamp*1000}):null;
 const failure=code=>adsCalendarFailure(selection,stamp,code);
 if(!selection||!adsCalendarPlain(options))return failure('ADS_CALENDAR_CONFIGURATION');
 const chunks=adsCalendarChunks(adsCalendarDates(selection.start_date,selection.end_date)),children=[];
 for(const chunk of chunks){
  const period=await getAdsPeriod(env,chunk,options);
  children.push(period?.measurement??null);
 }
 const finished=adsCalendarStamp(now);
 if(!finished||finished<stamp||finished-stamp>60)return failure('ADS_CALENDAR_UNAVAILABLE');
 return buildAdsCalendar(children,selection,finished);
}
