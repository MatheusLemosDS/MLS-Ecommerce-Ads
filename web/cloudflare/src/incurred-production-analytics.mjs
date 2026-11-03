import {projectIncurredProduction,incurredProductionRange} from './incurred-production.mjs';

// Read-only daily analysis of the saved physical-manufacture ledger. The two
// canonical helpers are also embedded beside this function in the browser.
export function buildIncurredProductionAnalytics(ledger,selection){
 try{
  const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
  const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
  const date=value=>typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  if(!exact(selection,['month','selected_date']))return null;
  const {month,selected_date}=selection,frame=projectIncurredProduction(ledger);
  if(!frame||typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||!date(selected_date)||selected_date.slice(0,7)!==month)return null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(frame.checked_at*1000));
  if(month>today.slice(0,7)||selected_date>today)return null;
  const monthLast=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0,12)).toISOString().slice(0,10);
  const start_date=month+'-01',end_date=monthLast<today?monthLast:today;
  const range=incurredProductionRange(frame,{start_date,end_date});
  if(!range)return null;
  const selected=range.days.find(row=>row.date===selected_date);
  if(!selected)return null;
  const active=range.days.filter(row=>row.summary.active_records>0);
  const highest_cost={state:range.summary.state==='NO_RECORDS'?'NO_RECORDS':range.summary.unknown_cost_quantity>0?'UNKNOWN_COSTS':'AVAILABLE',amount_cents:null,dates:[]};
  // A partial day is a lower bound, not evidence of the month's largest cost.
  // An explicit zero-cost manufactured piece is different from an empty day.
  if(highest_cost.state==='AVAILABLE'){
   highest_cost.amount_cents=Math.max(...active.map(row=>row.summary.total_cost_cents));
   highest_cost.dates=active.filter(row=>row.summary.total_cost_cents===highest_cost.amount_cents).map(row=>row.date);
  }
  const highest_quantity={state:active.length?'AVAILABLE':'NO_RECORDS',produced_quantity:null,dates:[]};
  if(active.length){
   highest_quantity.produced_quantity=Math.max(...active.map(row=>row.summary.produced_quantity));
   highest_quantity.dates=active.filter(row=>row.summary.produced_quantity===highest_quantity.produced_quantity).map(row=>row.date);
  }
  return {schema:'incurred_production_analytics_v1',checked_at:frame.checked_at,revision:frame.revision,month,start_date,end_date,timezone:'America/Sao_Paulo',basis:'RECORDED_MANUFACTURE_DATE_HISTORICAL_COSTS_NOT_SALES_OR_CASH',summary:{...range.summary},days:range.days.map(row=>({date:row.date,summary:{...row.summary}})),selected_day:{date:selected_date,summary:{...selected.summary}},history_months:[...new Set(frame.records.map(row=>row.produced_date.slice(0,7)))].sort().reverse(),highest_cost,highest_quantity,financial_integration_allowed:false,actual_profit_cents:null};
 }catch{return null;}
}
