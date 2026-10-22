import {getAdsCalendar,projectAdsCalendar,projectAdsCalendarRequest} from './ads-calendar.mjs';
import {projectAdsMeasurement} from './ads-measurement.mjs';

// A single explicit calendar selection feeds the account screens and Admin.
// The monthly overview defaults to the current month through today in Brasilia.
export function adsMeasurementPageSelection(url,{now=()=>Date.now()}={}){
 try{
 const invalid=()=>({start_date:null,end_date:null});
 const names=['start_date','end_date'];
 if(url.searchParams.has('month')){
  if(url.searchParams.getAll('month').length!==1||names.some(name=>url.searchParams.has(name)))return invalid();
  const month=url.searchParams.get('month');
  if(typeof month!=='string'||!(/^[1-9]\d{3}-(?:0[1-9]|1[0-2])$/).test(month))return invalid();
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(now()));
  if(month>today.slice(0,7))return invalid();
  const end=month===today.slice(0,7)?today:new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
  return projectAdsCalendarRequest({start_date:month+'-01',end_date:end},{now})??invalid();
 }
 if(names.some(name=>url.searchParams.has(name))){
  if(names.some(name=>url.searchParams.getAll(name).length!==1))return invalid();
  return projectAdsCalendarRequest({start_date:url.searchParams.get('start_date'),end_date:url.searchParams.get('end_date')},{now})??invalid();
 }
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(now()));
 return projectAdsCalendarRequest({start_date:today.slice(0,7)+'-01',end_date:today},{now})??invalid();
 }catch{return {start_date:null,end_date:null};}
}

export async function getAdsSummary(env,selection,options={}){
 const now=options?.now||(()=>Date.now());
 selection=selection??adsMeasurementPageSelection(new URL('https://app.brazacommerce.com.br/dashboard'),{now});
 const calendar=projectAdsCalendar(await getAdsCalendar(env,selection,options));
 // Hermes and existing single-read consumers keep the reviewed <=15-day
 // contract. A month never masquerades as a validated 15-day measurement.
 const measurement=calendar&&calendar.total_days<=15?projectAdsMeasurement({...calendar,schema:'ads_measurement_v1',diagnostic:calendar.diagnostic?.replace('ADS_CALENDAR_','ADS_MEASUREMENT_')??null}):null;
 if(!calendar||calendar.status==='UNAVAILABLE')return {ok:false,connected:false,error:'Não foi possível conferir os anúncios deste período. Selecione até 31 dias e tente atualizar.',period:{start_date:calendar?.start_date??null,end_date:calendar?.end_date??null},calendar,measurement};
 const broad=calendar.totals.broad,amount=value=>value===null?null:value/100;
 const ratio=broad.reported_roas_raw??broad.calculated_roas_raw;
 return {
  ok:true,connected:true,shop:{id:1178167501},
  period:{start_date:calendar.start_date,end_date:calendar.end_date},
  balance:amount(calendar.balance_cents),calendar,...(measurement?{measurement}:{}),
  metrics:{spend:amount(calendar.expense_cents),gmv:amount(broad.gmv_cents),orders:broad.orders,
   roas:ratio===null?null:Number(ratio),
   cost_per_order:calendar.expense_cents===null||!broad.orders?null:calendar.expense_cents/100/broad.orders,
   // These secondary measures are not present in the verified projection.
   items_sold:null,impressions:null,clicks:null,ctr:null,cpc:null},
  daily:calendar.days,
 };
}
