/**
 * MLS Commerce OS: no-dependency, source-verified SVG chart primitives.
 * Pure rendering; NEVER converts missing observations into zero or generates data.
 * Chart models do not grant write permissions, infer bank settlement, SKU profit,
 * hourly production, placements, return reasons, or advertising attribution.
 */
export function createMlsVerifiedCharts(){
 const SAFE = value => Number.isSafeInteger(value) && !Object.is(value,-0);
 const DATE = /^\d{4}-\d{2}-\d{2}$/;
 const localAmount=value=>{const n=BigInt(value),absolute=n<0n?-n:n;return (n<0n?'-':'')+'R$ '+String(absolute/100n).replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+String(absolute%100n).padStart(2,'0');};
 const axisAmount=value=>{
  const n=BigInt(value),absolute=n<0n?-n:n;
  for(const [scale,suffix] of [[100000000000000n,'tri'],[100000000000n,'bi'],[100000000n,'mi'],[100000n,'mil']]){
   if(absolute<scale)continue;
   const tenth=(absolute*10n+scale/2n)/scale;
   return (n<0n?'-':'')+'R$ '+String(tenth/10n)+(tenth%10n?','+String(tenth%10n):'')+' '+suffix;
  }
  return localAmount(value);
 };
 const COLORS = Object.freeze({
   net:'#35e6ae',sales:'#4b9fff',ads:'#ef5ab1',finance:'#44e8ad',
   production:'#39d5eb',returns:'#ff688e',products:'#ffaa4b'
 });
 const esc = value => String(value).replace(/[&<>"']/g,c=>({
   '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[c]));
 const fail = (reason,source='UNAVAILABLE')=>Object.freeze({status:'UNAVAILABLE',reason,source});
 const markAttributes=(index,label,value,context,basis='')=>' class="mls-chart-mark" data-mls-chart-mark="'+index+'" tabindex="0" role="img"'+
  ' data-mls-chart-label="'+esc(label)+'" data-mls-chart-value="'+esc(value)+'" data-mls-chart-context="'+esc(context)+'"'+
  ' data-mls-chart-basis="'+esc(basis)+'"';

 function projectMlsDailyChart(trend,metric='net'){
  const fields={net:'net_cents',sales:'sales_cents',ads:'ads_spend_cents'};
  if(!Object.hasOwn(fields,metric))return fail('Métrica não reconhecida');
  if(trend?.schema!=='mls_mission_daily_trend_v1'||!Array.isArray(trend.points))
   return fail('Histórico diário validado ainda indisponível');
  if(trend.points.length>60)return fail('Cobertura maior que o limite do gráfico');
  const seen=new Set(),rows=[];
  for(const row of trend.points){
   const date=row?.date;
  if(typeof date!=='string'||!DATE.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||
    new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||seen.has(date))
    return fail('Datas inválidas ou duplicadas');
   seen.add(date);
   const value=row?.[fields[metric]];
   rows.push({date,value:SAFE(value)?value:null,partial:row?.partial===true,
    basis:metric==='net'&&['KNOWN_COSTS','ESTIMATE'].includes(row?.net_basis)?row.net_basis:null});
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

 function projectMlsDistribution(input){
  // STRICT EXCLUSIVE groups; "complete" must be supplied by the source adapter,
  // not assumed from overlapping settlement or refund counters.
  const {source,total,segments,complete}=input||{};
  if(complete!==true||!SAFE(total)||total<=0)return fail('Cobertura completa não verificada');
  if(!Array.isArray(segments)||segments.length<1||segments.length>8)
   return fail('Categorias não verificadas');
  let sum=0;const categories=[],labels=new Set();
  for(const row of segments){
   if(typeof row?.label!=='string'||!row.label.trim()||row.label.length>90||
      !SAFE(row.value)||row.value<0||labels.has(row.label))return fail('Categoria com valor indisponível');
   labels.add(row.label);
   if(!Number.isSafeInteger(sum+row.value))return fail('Total fora do limite seguro');
   sum+=row.value;categories.push(Object.freeze({label:row.label,value:row.value}));
  }
  if(sum!==total)return fail('Categorias não fecham com o total');
  return Object.freeze({status:'READY',type:'donut',source:typeof source==='string'?source:'VERIFIED_BREAKDOWN',
   total,segments:Object.freeze(categories)});
 }


 function projectMlsCategoricalChart(input){
  const {source,segments,complete,orientation='vertical',unit='COUNT'}=input||{};
  if(complete!==true)return fail('Cobertura por categoria não verificada');
  if(!['vertical','horizontal'].includes(orientation)||!['COUNT','BRL_CENTS'].includes(unit))
   return fail('Tipo de série não reconhecido');
  if(!Array.isArray(segments)||segments.length<1||segments.length>24)
   return fail('Categorias indisponíveis ou em excesso');
  const used=new Set(),rows=[];
  for(const row of segments){
   if(typeof row?.label!=='string'||!row.label.trim()||row.label.length>72||
    !SAFE(row.value)||row.value<0||used.has(row.label))return fail('Valores ou categorias inválidas');
  used.add(row.label);rows.push(Object.freeze({label:row.label,value:row.value}));
  }
  return Object.freeze({status:'READY',type:orientation==='horizontal'?'horizontalBar':'bar',
   source:typeof source==='string'?source:'VERIFIED_CATEGORY_SERIES',unit,segments:Object.freeze(rows)});
 }

 function projectMlsDtfStateChart(queue){
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
  return '<svg xmlns="http://www.w3.org/2000/svg" class="mls-verified-chart" width="100%" viewBox="0 0 '+w+' '+h+'" role="group" aria-label="'+esc(label)+'" preserveAspectRatio="xMidYMid meet">'+
   '<title>'+esc(label)+'</title>'+inner+'</svg>';
 }
 function renderMlsVerifiedChart(model,{title='Gráfico de dados observados',palette='net'}={}){
  if(!['READY','PARTIAL'].includes(model?.status))return '<div class="mls-chart-unavailable" role="status">'+esc(model?.reason||'Dados indisponíveis')+'</div>';
  const color=Object.hasOwn(COLORS,palette)?COLORS[palette]:COLORS.net;
  if(model.type==='area'){
   const rows=model.points;
   if(!Array.isArray(rows)||rows.length<2||rows.some(r=>r.value!==null&&!SAFE(r.value)))
    return '<div class="mls-chart-unavailable" role="status">Série inválida</div>';
   const known=rows.map(x=>x.value).filter(SAFE);
   if(known.length<2)return '<div class="mls-chart-unavailable" role="status">Histórico insuficiente</div>';
   const w=620,h=222,left=78,right=610,top=16,bottom=187;
   const max=Math.max(0,...known),min=Math.min(0,...known),span=max-min||1;
   const x=i=>left+(right-left)*i/Math.max(1,rows.length-1);
   const y=v=>top+(max-v)*(bottom-top)/span;
   const baseline=y(0);
   let graphics='';
   for(let i=0;i<=4;i++){
    const yy=top+i*(bottom-top)/4;
    graphics+='<line x1="'+left+'" y1="'+yy+'" x2="'+right+'" y2="'+yy+
     '" stroke="var(--line,#335070)" stroke-opacity=".5" stroke-dasharray="2 5"/>';
    const tick=Number(BigInt(min)+(BigInt(max)-BigInt(min))*BigInt(4-i)/4n);
    graphics+='<text class="mls-chart-axis" x="'+(left-9)+'" y="'+(yy+3)+'" text-anchor="end" font-size="9" fill="var(--muted,#96b5d9)">'+esc(axisAmount(tick))+'</text>';
   }
   graphics+='<path class="mls-chart-zero" d="M '+left+' '+baseline+' H '+right+'" fill="none" stroke="var(--line,#335070)" stroke-opacity=".85"/>';
   let i=0;
   while(i<rows.length){
    if(rows[i].value===null){i++;continue;}
    let j=i;while(j+1<rows.length&&rows[j+1].value!==null&&
      Date.parse(rows[j+1].date+'T00:00:00Z')-Date.parse(rows[j].date+'T00:00:00Z')===86400000)j++;
    const piece=(ax,av,bx,bv,tint)=>{
     const path='M '+ax+' '+y(av)+' L '+bx+' '+y(bv);
     return '<path class="mls-chart-area" d="'+path+' L '+bx+' '+baseline+' L '+ax+' '+baseline+' Z" fill="'+tint+'" fill-opacity=".13"/>'+
      '<path class="mls-chart-halo" d="'+path+'" fill="none" stroke="'+tint+'" stroke-opacity=".12" stroke-width="8" stroke-linecap="round" aria-hidden="true"/>'+
      '<path class="mls-chart-series" d="'+path+'" fill="none" stroke="'+tint+'" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>';
    };
    for(let k=i+1;k<=j;k++){
     const a=rows[k-1].value,b=rows[k].value,ax=x(k-1),bx=x(k);
     if(model.metric==='net'&&(a<0&&b>0||a>0&&b<0)){
      // A visual zero crossing is not an additional financial observation.
      const zeroX=ax+(bx-ax)*Math.abs(a)/(Math.abs(a)+Math.abs(b));
      graphics+=piece(ax,a,zeroX,0,a<0?'#ff7899':color)+piece(zeroX,0,bx,b,b<0?'#ff7899':color);
     }else graphics+=piece(ax,a,bx,b,model.metric==='net'&&(a<0||b<0)?'#ff7899':color);
    }
    i=j+1;
   }
   for(let k=0;k<rows.length;k++){
    const point=rows[k];
    if(point.value!==null){
     const label=point.date+': '+localAmount(point.value)+(point.partial?' (parcial)':'')+
       (point.basis==='KNOWN_COSTS'?' (subtotal com custos conhecidos)':'');
     const context=(point.basis==='KNOWN_COSTS'?'Subtotal com custos conhecidos':model.metric==='net'?'Resultado estimado':'Valor observado')+(point.partial?' · Dia parcial':'');
     const displayDate=point.date.slice(8)+'/'+point.date.slice(5,7)+'/'+point.date.slice(0,4);
     graphics+='<circle'+markAttributes(k,displayDate,localAmount(point.value),context,point.basis||'')+' data-mls-chart-date="'+esc(point.date)+'"'+
       ' data-mls-chart-x="'+x(k)+'" data-mls-chart-left="'+left+'" data-mls-chart-right="'+right+'" data-mls-chart-top="'+top+'" data-mls-chart-bottom="'+bottom+'" aria-label="'+esc(label)+'" cx="'+x(k)+'" cy="'+y(point.value)+'" r="3.5" fill="'+
       (point.partial?'#ffcf84':model.metric==='net'&&point.value<0?'#ff7899':color)+'">'+
       '<title>'+esc(label)+'</title></circle>';
    }
    if(k===0||k===rows.length-1||k%Math.max(1,Math.ceil(rows.length/5))===0)
     graphics+='<text x="'+x(k)+'" y="214" text-anchor="middle" font-size="10" fill="var(--muted,#96b5d9)">'+esc(point.date.slice(8)+'/'+point.date.slice(5,7))+'</text>';
   }
   return svgFrame(graphics,title+'; '+known.length+' observações reais, '+model.missing+' lacunas',w,h);
  }

  if(model.type==='bar'||model.type==='horizontalBar'){
   const rows=model.segments;
   if(!Array.isArray(rows)||!rows.length||rows.some(r=>!SAFE(r.value)||r.value<0))
    return '<div class="mls-chart-unavailable" role="status">Valores categóricos inconsistentes</div>';
   const max=Math.max(1,...rows.map(r=>r.value)),fill=color;
   const number=value=>model.unit==='BRL_CENTS'?localAmount(value):String(value);
   if(model.type==='bar'){
    const w=620,h=226,left=78,right=609,top=15,bottom=182,space=(right-left)/rows.length;
    let body='';
    for(let line=0;line<5;line++){
     const yy=top+line*(bottom-top)/4;
     body+='<line x1="'+left+'" y1="'+yy+'" x2="'+right+'" y2="'+yy+'" stroke="var(--line,#315274)" stroke-opacity=".45" stroke-dasharray="3 5"/>';
     const tick=Number(BigInt(max)*BigInt(4-line)/4n);
     body+='<text class="mls-chart-axis" x="'+(left-9)+'" y="'+(yy+3)+'" text-anchor="end" font-size="9" fill="var(--muted,#96b5d9)">'+esc(model.unit==='BRL_CENTS'?axisAmount(tick):String(tick))+'</text>';
    }
    for(let i=0;i<rows.length;i++){
     const row=rows[i],bar=Math.max(0,(row.value/max)*(bottom-top));
     const x=left+i*space+space*.18,y=bottom-bar;
     body+='<g'+markAttributes(i,row.label,model.unit==='BRL_CENTS'?localAmount(row.value):String(row.value),'Categoria observada')+' aria-label="'+esc(row.label+': '+number(row.value))+'">'+
      '<rect x="'+x+'" y="'+top+'" width="'+(space*.64)+'" height="'+(bottom-top)+'" fill="transparent"/>'+
      '<rect class="mls-chart-series" x="'+x+'" y="'+y+'" width="'+(space*.64)+'" height="'+bar+
      '" rx="5" fill="'+fill+'" fill-opacity=".84"><title>'+esc(row.label+': '+number(row.value))+'</title></rect></g>'+
      '<text x="'+(left+(i+.5)*space)+'" y="201" font-size="10" fill="var(--muted,#a8c2e5)" text-anchor="middle">'+
      esc(row.label.slice(0,10))+'</text>';
    }
    return svgFrame(body,title+'; '+rows.length+' categorias observadas',w,h);
   }
   const w=620,h=Math.max(90,rows.length*35+20),left=148,right=550;
   let body='';
   for(let i=0;i<rows.length;i++){
    const row=rows[i],y=10+i*35,bar=row.value/max*(right-left);
    body+='<g'+markAttributes(i,row.label,model.unit==='BRL_CENTS'?localAmount(row.value):String(row.value),'Categoria observada')+' aria-label="'+esc(row.label+': '+number(row.value))+'">'+
     '<text x="'+(left-9)+'" y="'+(y+18)+'" font-size="11" fill="var(--text,#c2d9f0)" text-anchor="end">'+
     esc(row.label.slice(0,22))+'</text>'+
     '<rect x="'+left+'" y="'+y+'" width="'+(right-left)+'" height="21" rx="5" fill="var(--surface-raised,#16314c)"/>'+
     '<rect class="mls-chart-series" x="'+left+'" y="'+y+'" width="'+bar+'" height="21" rx="5" fill="'+fill+'">'+
     '<title>'+esc(row.label+': '+number(row.value))+'</title></rect>'+
     '<text x="'+(right+8)+'" y="'+(y+16)+'" font-size="11" fill="var(--text,#eaf7ff)">'+esc(number(row.value))+'</text></g>';
   }
   return svgFrame(body,title+'; '+rows.length+' categorias observadas',w,h);
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
    const length=r.value/total*circ;
    const percent=(100*r.value/total).toFixed(1).replace('.',','),yy=24+index*23;
    const label=r.label+': '+r.value+' ('+percent+'%)';
    segments+='<g'+markAttributes(index,r.label,String(r.value),percent+'% do total observado')+' aria-label="'+esc(label)+'">';
    if(r.value>0)segments+='<circle class="mls-chart-series" cx="110" cy="110" r="'+radius+'" fill="none" stroke="'+strokes[index%strokes.length]+'" stroke-width="24" '+
     'stroke-dasharray="'+length+' '+(circ-length)+'" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 110 110)">'+
     '<title>'+esc(label)+'</title></circle>';
    // The legend is also the pointer/focus target for an observed zero category.
    segments+='<rect x="224" y="'+(yy-14)+'" width="208" height="21" rx="4" fill="transparent"/>'+
     '<rect x="227" y="'+(yy-10)+'" width="9" height="9" rx="2" fill="'+strokes[index%strokes.length]+'"/>'+
     '<text x="242" y="'+yy+'" font-size="11" fill="var(--text,#d3e4f8)">'+esc(r.label.slice(0,24))+'</text>'+
     '<text x="424" y="'+yy+'" text-anchor="end" font-size="11" font-weight="700" fill="var(--text,#f2f9ff)">'+esc(percent+'%')+'</text></g>';
    offset+=length;
   });
   segments+='<text x="110" y="107" text-anchor="middle" font-size="22" font-weight="750" fill="var(--text,#f0f8ff)">'+total+'</text>'+
    '<text x="110" y="125" text-anchor="middle" font-size="10" fill="var(--muted,#a4c1e4)">total observado</text>';
   return svgFrame(segments,title+'; '+total+' registros exclusivos verificados',440,220);
  }
  return '<div class="mls-chart-unavailable" role="status">Tipo de gráfico indisponível</div>';
 }

  return Object.freeze({projectMlsDailyChart,projectMlsDistribution,projectMlsDtfStateChart,projectMlsCategoricalChart,renderMlsVerifiedChart});
}
export const {projectMlsDailyChart,projectMlsDistribution,projectMlsDtfStateChart,projectMlsCategoricalChart,renderMlsVerifiedChart}=createMlsVerifiedCharts();
