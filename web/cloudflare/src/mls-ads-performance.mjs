/** Read-only Ads projections. Broad attribution never stands in for store sales or profit. */
export function projectMissionAdsSnapshot(frame){
 const safe=value=>Number.isSafeInteger(value)&&value>=0&&!Object.is(value,-0);
 const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 const ratio=(sales,expense)=>{if(sales===null||expense===null||expense===0)return null;const n=BigInt(sales)*1000000n,d=BigInt(expense);let value=n/d;if(n%d*2n>=d)value++;return String(value/1000000n)+'.'+String(value%1000000n).padStart(6,'0');};
 try{
  if(frame?.schema!=='business_month_v1'||typeof frame.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(frame.month)||frame.start_date!==frame.month+'-01'||!date(frame.end_date)||frame.end_date.slice(0,7)!==frame.month||!safe(frame.checked_at)||frame.checked_at===0)return null;
  const ads=frame.ads;
  if(!ads)return null;
  if(ads.schema!=='ads_calendar_v1'||!['AVAILABLE','PARTIAL','UNAVAILABLE'].includes(ads.status)||ads.start_date!==frame.start_date||ads.end_date!==frame.end_date||!safe(ads.fetched_at)||ads.fetched_at===0||ads.fetched_at>frame.checked_at+5||ads.unit_confirmation!=='OPERATOR_CONFIRMED_BRL_2026_10_20'||ads.source_timezone!=='UNCONFIRMED'||ads.basis!=='CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION'||typeof ads.day_partial!=='boolean')return null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(ads.fetched_at*1000));
  if(ads.end_date>today||ads.day_partial!==(ads.end_date===today))return null;
  const total=Number(ads.end_date.slice(8));
  if(ads.total_days!==total||!safe(ads.covered_days)||ads.covered_days>total||!Array.isArray(ads.days)||ads.days.length>31)return null;
  const broad=ads.totals?.broad;
  if(!broad||broad.gmv_cents!==null&&!safe(broad.gmv_cents)||ads.expense_cents!==null&&!safe(ads.expense_cents)||broad.calculated_roas_raw!==ratio(broad.gmv_cents,ads.expense_cents))return null;
  const days=[];let covered=0,expense=0n,sales=0n,salesComplete=true;
  if(ads.status==='UNAVAILABLE'){
   if(ads.days.length||ads.covered_days!==0||ads.expense_cents!==null||broad.gmv_cents!==null||broad.calculated_roas_raw!==null)return null;
  }else{
   if(ads.days.length!==total)return null;
   for(const [index,day] of ads.days.entries()){
    const expected=frame.month+'-'+String(index+1).padStart(2,'0'),gmv=day?.broad?.gmv_cents;
    if(day?.date!==expected||day.expense_cents!==null&&!safe(day.expense_cents)||gmv!==null&&!safe(gmv)||day.broad.calculated_roas_raw!==ratio(gmv,day.expense_cents))return null;
    if(day.expense_cents!==null){covered++;expense+=BigInt(day.expense_cents);}
    if(gmv===null)salesComplete=false;else sales+=BigInt(gmv);
    days.push(Object.freeze({date:expected,expense_cents:day.expense_cents,attributed_sales_cents:gmv,calculated_roas_raw:day.broad.calculated_roas_raw,partial:ads.day_partial&&expected===ads.end_date}));
   }
   if(covered!==ads.covered_days||expense>BigInt(Number.MAX_SAFE_INTEGER)||sales>BigInt(Number.MAX_SAFE_INTEGER)||ads.status==='AVAILABLE'&&(covered!==total||ads.expense_cents!==Number(expense))||ads.status==='PARTIAL'&&(covered===total||ads.expense_cents!==null)||broad.gmv_cents!==(salesComplete?Number(sales):null))return null;
  }
  return Object.freeze({schema:'mls_month_ads_snapshot_v1',month:frame.month,start_date:frame.start_date,end_date:frame.end_date,status:ads.status,checked_at:ads.fetched_at,expense_cents:ads.expense_cents,attributed_sales_cents:broad.gmv_cents,calculated_roas_raw:broad.calculated_roas_raw,covered_days:ads.covered_days,total_days:total,day_partial:ads.day_partial,source_timezone:'UNCONFIRMED',attribution:'BROAD',basis:'CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION',days:Object.freeze(days)});
 }catch{return null;}
}

/** Ratio chart based only on the saved Ads calendar, independent from financial daily estimates. */
export function projectMissionRoasChart(snapshot,windowDays=14){
 const unavailable=reason=>Object.freeze({status:'UNAVAILABLE',reason,source:'mls_month_ads_snapshot_v1'});
 const safe=value=>Number.isSafeInteger(value)&&value>=0&&!Object.is(value,-0);
 const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 const ratio=(sales,expense)=>{if(sales===null||expense===null||expense===0)return null;const n=BigInt(sales)*1000000n,d=BigInt(expense);let value=n/d;if(n%d*2n>=d)value++;return value;};
 const raw=value=>value===null?null:String(BigInt(value)/1000000n)+'.'+String(BigInt(value)%1000000n).padStart(6,'0');
 try{
  if(![7,14].includes(windowDays)||snapshot?.schema!=='mls_month_ads_snapshot_v1'||!['AVAILABLE','PARTIAL'].includes(snapshot.status)||snapshot.attribution!=='BROAD'||snapshot.basis!=='CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION'||snapshot.source_timezone!=='UNCONFIRMED'||!date(snapshot.start_date)||!date(snapshot.end_date)||snapshot.start_date!==snapshot.month+'-01'||snapshot.end_date.slice(0,7)!==snapshot.month||!Array.isArray(snapshot.days)||snapshot.days.length!==Number(snapshot.end_date.slice(8))||snapshot.days.length!==snapshot.total_days||typeof snapshot.day_partial!=='boolean')return unavailable('Histórico de ROAS ainda não disponível nas mesmas datas.');
  const points=[];let covered=0,totalExpense=0n,totalSales=0n,salesComplete=true;
  for(const [index,row] of snapshot.days.entries()){
   if(row?.date!==snapshot.month+'-'+String(index+1).padStart(2,'0')||row.expense_cents!==null&&!safe(row.expense_cents)||row.attributed_sales_cents!==null&&!safe(row.attributed_sales_cents)||typeof row.partial!=='boolean'||row.partial!==(snapshot.day_partial&&row.date===snapshot.end_date))return unavailable('Datas, valores ou cobertura de Ads incompatíveis.');
   if(row.expense_cents!==null){covered++;totalExpense+=BigInt(row.expense_cents);}
   if(row.attributed_sales_cents===null)salesComplete=false;else totalSales+=BigInt(row.attributed_sales_cents);
   const exact=ratio(row.attributed_sales_cents,row.expense_cents),value=exact!==null&&exact<=BigInt(Number.MAX_SAFE_INTEGER)?Number(exact):null;
   // A legitimate very large ratio stays unknown on the chart if micros would overflow.
   if(row.calculated_roas_raw!==raw(exact))return unavailable('ROAS não corresponde às vendas atribuídas e ao gasto do dia.');
   points.push(Object.freeze({date:row.date,value,partial:row.partial,basis:'ADS_BROAD_CALENDAR'}));
  }
  if(totalExpense>BigInt(Number.MAX_SAFE_INTEGER)||totalSales>BigInt(Number.MAX_SAFE_INTEGER)||covered!==snapshot.covered_days||snapshot.status==='AVAILABLE'&&(covered!==snapshot.total_days||snapshot.expense_cents!==Number(totalExpense))||snapshot.status==='PARTIAL'&&(covered===snapshot.total_days||snapshot.expense_cents!==null)||snapshot.attributed_sales_cents!==(salesComplete?Number(totalSales):null)||snapshot.calculated_roas_raw!==raw(ratio(snapshot.attributed_sales_cents,snapshot.expense_cents)))return unavailable('Cobertura diária incompatível com o resumo de Ads.');
  const selected=points.slice(-windowDays),known=selected.filter(row=>row.value!==null).length;
  if(known<2)return Object.freeze({...unavailable('Necessárias duas observações reais de ROAS; gasto zero ou fonte ausente não produzem um índice.'),evidence_valid:true});
  const missing=selected.length-known,partial=selected.some(row=>row.partial);
  return Object.freeze({status:missing||partial?'PARTIAL':'READY',type:'area',kind:'area',metric:'roas',source:'mls_month_ads_snapshot_v1',unit:'RATIO_MICROS',period:Object.freeze({start_date:selected[0].date,end_date:selected.at(-1).date,selected_date:snapshot.end_date,window_days:windowDays}),verified_at:snapshot.checked_at,coverage:Object.freeze({observed:known,total:selected.length,missing,partial}),missing,points:Object.freeze(selected)});
 }catch{return unavailable('A evidência de ROAS não passou pela validação.');}
}

/** Compare two consecutive complete source-calendar days; never infer profitability from ROAS. */
export function compareMissionRoas(snapshot){
 const safe=value=>Number.isSafeInteger(value)&&value>=0&&!Object.is(value,-0);
 try{
  if(snapshot?.schema!=='mls_month_ads_snapshot_v1'||!['AVAILABLE','PARTIAL'].includes(snapshot.status)||snapshot.attribution!=='BROAD'||snapshot.basis!=='CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION'||snapshot.source_timezone!=='UNCONFIRMED'||!Array.isArray(snapshot.days)||snapshot.days.length>31||snapshot.days.length!==snapshot.total_days||typeof snapshot.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(snapshot.month)||snapshot.start_date!==snapshot.month+'-01'||snapshot.end_date!==snapshot.month+'-'+String(snapshot.total_days).padStart(2,'0')||typeof snapshot.day_partial!=='boolean')return null;
  for(const [index,row] of snapshot.days.entries())if(row?.date!==snapshot.month+'-'+String(index+1).padStart(2,'0')||typeof row.partial!=='boolean'||row.partial!==(snapshot.day_partial&&row.date===snapshot.end_date))return null;
  for(let index=snapshot.days.length-1;index>0;index--){
   const current=snapshot.days[index],previous=snapshot.days[index-1];
   if(current.partial!==false||previous.partial!==false||typeof current.date!=='string'||typeof previous.date!=='string'||current.date.slice(0,7)!==snapshot.month||previous.date.slice(0,7)!==snapshot.month||Date.parse(current.date+'T00:00:00Z')-Date.parse(previous.date+'T00:00:00Z')!==86400000)continue;
   const micros=row=>{if(!safe(row.expense_cents)||row.expense_cents===0||!safe(row.attributed_sales_cents))return null;const n=BigInt(row.attributed_sales_cents)*1000000n,d=BigInt(row.expense_cents);let v=n/d;if(n%d*2n>=d)v++;const expected=String(v/1000000n)+'.'+String(v%1000000n).padStart(6,'0');return row.calculated_roas_raw===expected&&v<=BigInt(Number.MAX_SAFE_INTEGER)?v:null;};
   const newer=micros(current),older=micros(previous);if(newer===null||older===null)continue;
   const delta=newer-older;
   if(delta<BigInt(Number.MIN_SAFE_INTEGER)||delta>BigInt(Number.MAX_SAFE_INTEGER))continue;
   return Object.freeze({current_date:current.date,previous_date:previous.date,current_micros:Number(newer),previous_micros:Number(older),delta_micros:Number(delta),direction:delta>0n?'UP':delta<0n?'DOWN':'FLAT',basis:'TWO_COMPLETE_ADS_CALENDAR_DAYS_BROAD_ATTRIBUTION_NOT_PROFIT'});
  }
  return null;
 }catch{return null;}
}
