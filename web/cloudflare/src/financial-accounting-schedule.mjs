// All intervals are half-open [start,end). Finance calendars are civil days;
// manufacture retains the separately approved Friday13h boundary.
const faScheduleFail=()=>{throw Object.assign(new Error('FINANCIAL_ACCOUNTING_PERIOD_INVALID'),{status:400});};
const faScheduleDay=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const faScheduleISO=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
function faScheduleAddDay(date,days){const at=new Date(date+'T12:00:00Z');at.setUTCDate(at.getUTCDate()+days);return at.toISOString().slice(0,10);}
function faScheduleParts(at,timezone){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));}
function faScheduleAt(date,hour,timezone){
 const target=Date.parse(date+'T'+String(hour).padStart(2,'0')+':00:00Z');let at=target;
 for(let i=0;i<4;i++){const p=faScheduleParts(at,timezone),shown=Date.parse(p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute+':'+p.second+'Z');if(shown===target)return new Date(at).toISOString();at+=target-shown;}
 faScheduleFail();
}
export function financialAccountingLocalDate(value,timezone='America/Sao_Paulo'){
 if(!faScheduleISO(value)||timezone!=='America/Sao_Paulo')faScheduleFail();return new Intl.DateTimeFormat('sv-SE',{timeZone:timezone}).format(new Date(value));
}
export function financialAccountingPeriod({kind,anchor,timezone='America/Sao_Paulo',week_starts_on='FRIDAY'}={}){
 if(!['MONTH','CIVIL_WEEK','MANUFACTURE_WEEK'].includes(kind)||timezone!=='America/Sao_Paulo'||!['FRIDAY','MONDAY'].includes(week_starts_on))faScheduleFail();
 let date=faScheduleISO(anchor)?financialAccountingLocalDate(anchor,timezone):faScheduleDay(anchor)?anchor:typeof anchor==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(anchor)?anchor+'-01':null;
 if(!date)faScheduleFail();let start,end,calendar,hour=0;
 if(kind==='MONTH'){
  start=date.slice(0,7)+'-01';const [y,m]=start.split('-').map(Number);end=new Date(Date.UTC(y,m,1,12)).toISOString().slice(0,10);calendar='CIVIL_MONTH';
 }else{
  const wanted=kind==='MANUFACTURE_WEEK'?5:week_starts_on==='FRIDAY'?5:1,weekday=new Date(date+'T12:00:00Z').getUTCDay();
  start=faScheduleAddDay(date,-((weekday-wanted+7)%7));
  if(kind==='MANUFACTURE_WEEK'){
   hour=13;calendar='FRIDAY_13_TO_FRIDAY_13';
   if(faScheduleISO(anchor)&&Date.parse(anchor)<Date.parse(faScheduleAt(start,hour,timezone)))start=faScheduleAddDay(start,-7);
  }else calendar=week_starts_on==='FRIDAY'?'CIVIL_FRIDAY_THURSDAY':'CIVIL_MONDAY_SUNDAY';
  end=faScheduleAddDay(start,7);
 }
 const start_at=faScheduleAt(start,hour,timezone),end_at=faScheduleAt(end,hour,timezone);
 return {schema:'financial_accounting_period_v1',kind,id:kind+':'+calendar+':'+start,start_at,end_at,start_date:start,end_date:kind==='MANUFACTURE_WEEK'?end:faScheduleAddDay(end,-1),timezone,calendar,basis:kind==='MANUFACTURE_WEEK'?'CONFIRMED_MANUFACTURE_TIME':'EVENT_COMPETENCE'};
}
export function projectFinancialAccountingPeriod(value){
 try{
  if(!value||Object.keys(value).length!==10||Reflect.ownKeys(value).length!==10||Reflect.ownKeys(value).some(k=>typeof k!=='string'||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,k)||{},'value'))||value.schema!=='financial_accounting_period_v1')return null;
  const normalized=financialAccountingPeriod({kind:value.kind,anchor:value.start_at,timezone:value.timezone,week_starts_on:value.calendar==='CIVIL_MONDAY_SUNDAY'?'MONDAY':'FRIDAY'});
  return Object.keys(normalized).every(k=>normalized[k]===value[k])?normalized:null;
 }catch{return null;}
}
export function financialAccountingDuePeriods(value,{week_starts_on='FRIDAY'}={}){
 const stamp=typeof value==='string'?value:new Date(value).toISOString();if(!faScheduleISO(stamp))faScheduleFail();
 const currentWeek=financialAccountingPeriod({kind:'CIVIL_WEEK',anchor:stamp,week_starts_on}),currentMonth=financialAccountingPeriod({kind:'MONTH',anchor:stamp});
 return {checked_at:stamp,weekly:financialAccountingPeriod({kind:'CIVIL_WEEK',anchor:new Date(Date.parse(currentWeek.start_at)-1).toISOString(),week_starts_on}),monthly:financialAccountingPeriod({kind:'MONTH',anchor:new Date(Date.parse(currentMonth.start_at)-1).toISOString()}),clock_alone_allows_finalize:false};
}
