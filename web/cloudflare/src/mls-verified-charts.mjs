/**
 * MLS Commerce OS: no-dependency, source-verified SVG chart primitives.
 * Pure rendering; NEVER converts missing observations into zero or generates data.
 * Chart models do not grant write permissions, infer bank settlement, SKU profit,
 * hourly production, placements, return reasons, or advertising attribution.
 */
const SAFE = value => Number.isSafeInteger(value) && !Object.is(value,-0);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLORS = Object.freeze({
  net:'#35e6ae',sales:'#4b9fff',ads:'#ef5ab1',finance:'#44e8ad',
  production:'#39d5eb',returns:'#ff688e',products:'#ffaa4b'
});
const esc = value => String(value).replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const fail = (reason,source='UNAVAILABLE')=>Object.freeze({status:'UNAVAILABLE',reason,source});

export function projectMlsDailyChart(trend,metric='net'){
 const fields={net:'net_cents',sales:'sales_cents',ads:'ads_spend_cents'};
 if(!Object.hasOwn(fields,metric))return fail('Métrica não reconhecida');
 if(trend?.schema!=='mls_mission_daily_trend_v1'||!Array.isArray(trend.points))
  return fail('Histórico diário validado ainda indisponível');
 if(trend.points.length>60)return fail('Cobertura maior que o limite do gráfico');
 const seen=new Set(),rows=[];
 for(const row of trend.points){
  const date=row?.date;
  if(typeof date!=='string'||!DATE.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||seen.has(date))
   return fail('Datas inválidas ou duplicadas');
  seen.add(date);
  const value=row?.[fields[metric]];
  rows.push({date,value:SAFE(value)?value:null,partial:row?.partial===true});
 }
 for(let i=1;i<rows.length;i++)if(rows[i].date<=rows[i-1].date)
  return fail('Histórico sem ordenação cronológica');
 if(rows.filter(x=>x.value!==null).length<2)return fail('Necessárias duas observações reais');
 return Object.freeze({
  status:'READY',type:'area',source:'mls_mission_daily_trend_v1',metric,
  unit:'BRL_CENTS',points:rows.map(x=>Object.freeze(x)),
  missing:rows.filter(x=>x.value===null).length
 });
}

export function projectMlsDistribution(input){
 // STRICT EXCLUSIVE groups; "complete" must be supplied by the source adapter,
 // not assumed from overlapping settlement or refund counters.
 const {source,total,segments,complete}=input||{};
 if(complete!==true||!SAFE(total)||total<=0)return fail('Cobertura completa não verificada');
 if(!Array.isArray(segments)||segments.length<1||segments.length>8)
  return fail('Categorias não verificadas');
 let sum=0;const categories=[];
 for(const row of segments){
  if(typeof row?.label!=='string'||!row.label.trim()||row.label.length>90||
     !SAFE(row.value)||row.value<0)return fail('Categoria com valor indisponível');
  if(!Number.isSafeInteger(sum+row.value))return fail('Total fora do limite seguro');
  sum+=row.value;categories.push(Object.freeze({label:row.label,value:row.value}));
 }
 if(sum!==total)return fail('Categorias não fecham com o total');
 return Object.freeze({status:'READY',type:'donut',source:typeof source==='string'?source:'VERIFIED_BREAKDOWN',
  total,segments:Object.freeze(categories)});
}

export function projectMlsDtfStateChart(queue){
 if(!queue||!SAFE(queue.line_count)||queue.line_count<=0)return fail('Fila DTF sem contagem validada');
 const fields=[
  ['Pendentes','pending_lines'],
  ['Reservadas','reserved_lines'],
  ['Produzidas','produced_lines'],
  ['Bloqueadas','blocked_lines']
 ];
 const segments=fields.map(([label,key])=>({label,value:queue[key]}));
 if(segments.some(r=>!SAFE(r.value)||r.value<0))return fail('Estados DTF incompletos');
 const sum=segments.reduce((a,b)=>a+b.value,0);
 if(!SAFE(sum)||sum>queue.line_count)return fail('Estados DTF inconsistentes');
 if(sum<queue.line_count)segments.push({label:'Estado não classificado',value:queue.line_count-sum});
 return projectMlsDistribution({source:'DTF_QUEUE_SAVED_LINES',total:queue.line_count,
  segments:segments.filter(x=>x.value>0),complete:true});
}

function svgFrame(inner,label,w,h){
 return '<svg xmlns="http://www.w3.org/2000/svg" class="mls-verified-chart" width="100%" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="'+esc(label)+'" preserveAspectRatio="xMidYMid meet">'+
  '<title>'+esc(label)+'</title>'+inner+'</svg>';
}
export function renderMlsVerifiedChart(model,{title='Gráfico de dados observados',palette='net'}={}){
 if(model?.status!=='READY')return '<div class="mls-chart-unavailable" role="status">'+esc(model?.reason||'Dados indisponíveis')+'</div>';
 const color=Object.hasOwn(COLORS,palette)?COLORS[palette]:COLORS.net;
 if(model.type==='area'){
  const rows=model.points;
  if(!Array.isArray(rows)||rows.length<2||rows.some(r=>r.value!==null&&!SAFE(r.value)))
   return '<div class="mls-chart-unavailable" role="status">Série inválida</div>';
  const known=rows.map(x=>x.value).filter(SAFE);
  if(known.length<2)return '<div class="mls-chart-unavailable" role="status">Histórico insuficiente</div>';
  const w=620,h=222,left=48,right=610,top=16,bottom=187;
  const max=Math.max(0,...known),min=Math.min(0,...known),span=max-min||1;
  const x=i=>left+(right-left)*i/Math.max(1,rows.length-1);
  const y=v=>top+(max-v)*(bottom-top)/span;
  const baseline=y(0);
  let graphics='';
  for(let i=0;i<=4;i++){
   const yy=top+i*(bottom-top)/4;
   graphics+='<line x1="'+left+'" y1="'+yy+'" x2="'+right+'" y2="'+yy+
    '" stroke="#335070" stroke-opacity=".5" stroke-dasharray="2 5"/>';
  }
  let i=0;
  while(i<rows.length){
   if(rows[i].value===null){i++;continue;}
   let j=i;while(j+1<rows.length&&rows[j+1].value!==null)j++;
   if(j>i){
    let path='M '+x(i)+' '+y(rows[i].value);
    for(let k=i+1;k<=j;k++)path+=' L '+x(k)+' '+y(rows[k].value);
    const fill=path+' L '+x(j)+' '+baseline+' L '+x(i)+' '+baseline+' Z';
    graphics+='<path d="'+fill+'" fill="'+color+'" fill-opacity=".16"/>'+
      '<path d="'+path+'" fill="none" stroke="'+color+'" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>';
   }
   i=j+1;
  }
  for(let k=0;k<rows.length;k++){
   const point=rows[k];
   if(point.value!==null){
    graphics+='<circle cx="'+x(k)+'" cy="'+y(point.value)+'" r="2.6" fill="'+(point.partial?'#ffcf84':color)+'">'+
      '<title>'+esc(point.date+': R$ '+(point.value/100).toFixed(2)+(point.partial?' (parcial)':''))+'</title></circle>';
   }
   if(k===0||k===rows.length-1||k%Math.max(1,Math.ceil(rows.length/5))===0)
    graphics+='<text x="'+x(k)+'" y="214" text-anchor="middle" font-size="10" fill="#96b5d9">'+esc(point.date.slice(5))+'</text>';
  }
  return svgFrame(graphics,title+'; '+known.length+' observações reais, '+model.missing+' lacunas',w,h);
 }
 if(model.type==='donut'){
  const rows=model.segments,total=model.total;
  if(!Array.isArray(rows)||!SAFE(total)||total<=0||rows.some(r=>!SAFE(r.value)||r.value<0)||
   rows.reduce((n,r)=>n+r.value,0)!==total)
   return '<div class="mls-chart-unavailable" role="status">Categorias inconsistentes</div>';
  const strokes=['#42e5af','#48b0ff','#b481ff','#ffb15a','#fb658e','#42dce8','#7890ff'];
  const radius=66,circ=2*Math.PI*radius;
  let offset=0,segments='';
  rows.forEach((r,index)=>{
   if(r.value===0)return;
   const length=r.value/total*circ;
   segments+='<circle cx="110" cy="110" r="'+radius+'" fill="none" stroke="'+strokes[index%strokes.length]+'" stroke-width="24" '+
    'stroke-dasharray="'+length+' '+(circ-length)+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 110 110)">'+
    '<title>'+esc(r.label+': '+r.value+' ('+(100*r.value/total).toFixed(1)+'%)')+'</title></circle>';
   offset+=length;
  });
  segments+='<text x="110" y="107" text-anchor="middle" font-size="22" font-weight="750" fill="#f0f8ff">'+total+'</text>'+
   '<text x="110" y="125" text-anchor="middle" font-size="10" fill="#a4c1e4">total observado</text>';
  rows.forEach((r,index)=>{
   if(index>7)return;
   const yy=24+index*23;
   segments+='<rect x="227" y="'+(yy-10)+'" width="9" height="9" rx="2" fill="'+strokes[index%strokes.length]+'"/>'+
     '<text x="242" y="'+yy+'" font-size="11" fill="#d3e4f8">'+esc(r.label.slice(0,24))+'</text>'+
     '<text x="424" y="'+yy+'" text-anchor="end" font-size="11" font-weight="700" fill="#f2f9ff">'+
     esc((r.value/total*100).toFixed(1)+'%')+'</text>';
  });
  return svgFrame(segments,title+'; '+total+' registros exclusivos verificados',440,220);
 }
 return '<div class="mls-chart-unavailable" role="status">Tipo de gráfico indisponível</div>';
}
