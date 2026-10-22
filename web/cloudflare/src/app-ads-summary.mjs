import {getAdsPeriod} from './ads-period.mjs';
import {projectAdsMeasurement} from './ads-measurement.mjs';

// A single explicit calendar selection feeds the old Ads screens and Admin.
// The default matches Seller Centre's "Hoje", rather than silently using 7 days.
export function adsMeasurementPageSelection(url,{now=()=>Date.now()}={}){
 try{
 const names=['start_date','end_date'];
 if(names.some(name=>url.searchParams.has(name))){
  if(names.some(name=>url.searchParams.getAll(name).length!==1))return {start_date:null,end_date:null};
  return {start_date:url.searchParams.get('start_date'),end_date:url.searchParams.get('end_date')};
 }
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(now()));
 return {start_date:today,end_date:today};
 }catch{return {start_date:null,end_date:null};}
}

export async function getAdsSummary(env,selection,options={}){
 const now=options.now||(()=>Date.now());
 selection=selection??adsMeasurementPageSelection(new URL('https://app.brazacommerce.com.br/dashboard'),{now});
 const period=await getAdsPeriod(env,selection,options);
 const measurement=projectAdsMeasurement(period.measurement);
 if(!measurement||measurement.status==='UNAVAILABLE')return {ok:false,connected:false,error:'Não foi possível conferir os anúncios deste período. Selecione até 15 dias e tente atualizar.',period:{start_date:period.start_date,end_date:period.end_date},measurement};
 const broad=measurement.totals.broad,amount=value=>value===null?null:value/100;
 const ratio=broad.reported_roas_raw??broad.calculated_roas_raw;
 return {
  ok:true,connected:true,shop:{id:1178167501},
  period:{start_date:measurement.start_date,end_date:measurement.end_date},
  balance:amount(measurement.balance_cents),measurement,
  metrics:{spend:amount(measurement.expense_cents),gmv:amount(broad.gmv_cents),orders:broad.orders,
   roas:ratio===null?null:Number(ratio),
   cost_per_order:measurement.expense_cents===null||!broad.orders?null:measurement.expense_cents/100/broad.orders,
   // These secondary measures are not present in the verified projection.
   items_sold:null,impressions:null,clicks:null,ctr:null,cpc:null},
  daily:measurement.days,
 };
}
