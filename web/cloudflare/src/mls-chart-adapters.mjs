/** Daily observations only. This adapter performs no IO and grants no authority. */
export function projectMlsMissionChart(trend,metric='net',windowDays=14){
 const safe=value=>Number.isSafeInteger(value)&&!Object.is(value,-0);
 const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 const unavailable=reason=>Object.freeze({status:'UNAVAILABLE',reason,source:'mls_mission_daily_trend_v1'});
 const fields={net:'net_cents',sales:'sales_cents',ads:'ads_spend_cents'};
 if(!Object.hasOwn(fields,metric)||![7,14].includes(windowDays))return unavailable('Métrica ou janela não reconhecida');
 if(trend?.schema!=='mls_mission_daily_trend_v1'||trend.basis!=='PAID_CREATE_DAY_AND_CALENDAR_ADS_OPERATIONAL_ESTIMATE'||
  !date(trend.selected_date)||trend.selected_date.slice(0,7)!==trend.month||
  !Array.isArray(trend.points)||trend.points.length>60)return unavailable('Histórico diário validado ainda indisponível');
 const all=[];let previous=null;
 for(const row of trend.points){
  if(!date(row?.date)||row.date.slice(0,7)!==trend.month||row.date>trend.selected_date||
   previous!==null&&row.date<=previous||typeof row.partial!=='boolean'||
   !['OPERATIONAL','PARTIAL_COSTS','UNAVAILABLE'].includes(row.state))return unavailable('Datas ou estados incompatíveis no histórico');
  const basis={OPERATIONAL:'ESTIMATE',PARTIAL_COSTS:'KNOWN_COSTS',UNAVAILABLE:null}[row.state];
  if(row.net_basis!==basis||row.net_cents!==null&&!safe(row.net_cents)||
   row.state==='UNAVAILABLE'&&row.net_cents!==null)return unavailable('Base do resultado incompatível com a cobertura diária');
  previous=row.date;
  const value=row[fields[metric]];
  if(value!==null&&(!safe(value)||metric!=='net'&&value<0))return unavailable('Valor diário inválido');
  if(row.state==='UNAVAILABLE'&&value!==null)return unavailable('Observação sem cobertura validada');
  all.push(row);
 }
 const selected=Date.parse(trend.selected_date+'T00:00:00Z');
 const oldest=new Date(selected-(windowDays-1)*86400000).toISOString().slice(0,10);
 const filtered=all.filter(row=>row.date>=oldest);
 if(!filtered.length)return unavailable('Sem observações nesta janela');
 // Insert only explicit null gaps. Never manufacture a numeric observation.
 const points=[];let expected=Date.parse(filtered[0].date+'T00:00:00Z');
 for(const row of filtered){
  const at=Date.parse(row.date+'T00:00:00Z');
  while(expected<at){points.push(Object.freeze({date:new Date(expected).toISOString().slice(0,10),value:null,partial:false}));expected+=86400000;}
  points.push(Object.freeze({date:row.date,value:row[fields[metric]],partial:row.partial,
   basis:metric==='net'?row.net_basis:null}));
  expected=at+86400000;
 }
 const known=points.filter(row=>row.value!==null).length;
 if(known<2)return unavailable('Necessárias duas observações reais nesta janela');
 const missing=points.length-known,partial=points.some(row=>row.partial||row.basis==='KNOWN_COSTS');
 return Object.freeze({status:missing||partial?'PARTIAL':'READY',type:'area',kind:'area',metric,
  source:'mls_mission_daily_trend_v1',unit:'BRL_CENTS',
  period:Object.freeze({start_date:points[0].date,end_date:points.at(-1).date,selected_date:trend.selected_date,window_days:windowDays}),
  verified_at:null,coverage:Object.freeze({observed:known,total:points.length,missing,partial}),
  missing,points:Object.freeze(points)});
}
