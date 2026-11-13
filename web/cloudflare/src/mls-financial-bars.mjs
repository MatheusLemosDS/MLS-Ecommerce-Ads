/** Signed presentation only. Callers supply canonical components; no result is
 * calculated here and incomplete components never become a closed account. */
export function createMlsFinancialBars(document){
 const safe=value=>Number.isSafeInteger(value)&&!Object.is(value,-0);
 const project=(rows,{title='Componentes financeiros',basis='',complete=false}={})=>{
  if(typeof title!=='string'||title.length>160||typeof basis!=='string'||basis.length>400||typeof complete!=='boolean'||!Array.isArray(rows)||!rows.length||rows.length>24)return null;
  const seen=new Set(),segments=[];
  for(const row of rows){if(!row||typeof row.label!=='string'||!row.label.trim()||row.label.length>120||seen.has(row.label)||row.value!==null&&!safe(row.value)||!['START','DEDUCTION','ADJUSTMENT','RESULT','CONTEXT'].includes(row.role))return null;seen.add(row.label);segments.push({label:row.label,value:row.value,role:row.role});}
  return {schema:'mls_signed_financial_bars_v1',unit:'BRL_CENTS',type:'signedBar',status:complete&&segments.every(row=>row.value!==null)?'READY':'PARTIAL',title,basis,segments};
 };
 const money=value=>{if(value===null)return 'Pendente';const n=BigInt(value),abs=n<0n?-n:n;return (n<0n?'− ':'')+'R$ '+new Intl.NumberFormat('pt-BR').format(abs/100n)+','+String(abs%100n).padStart(2,'0');};
 function draw(host,rows,options){
  if(!host)return false;host.replaceChildren();const model=project(rows,options);if(!model){host.textContent='Os componentes financeiros aguardam uma fonte válida.';return false;}
  const make=(tag,text,cls)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(cls)item.className=cls;return item;};
  host.className='mls-financial-bars';host.dataset.chartUnit=model.unit;host.dataset.chartStatus=model.status;
  host.append(make('h4',model.title),make('p',model.basis+(model.status==='PARTIAL'?' Componentes conhecidos e pendências; não formam uma conta fechada.':' Valores assinados da mesma base.')));
  const max=Math.max(1,...model.segments.filter(row=>row.value!==null).map(row=>Math.abs(row.value))),list=make('div',undefined,'mls-financial-bar-list'),readout=make('p','Selecione um componente para conferir o valor e a função na composição.','mls-financial-bar-readout'),buttons=[];
  readout.setAttribute('aria-live','polite');
  const roles={START:'Base de entrada',DEDUCTION:'Dedução',ADJUSTMENT:'Ajuste',RESULT:'Resultado da base indicada',CONTEXT:'Contexto; não é nova dedução'};
  for(const row of model.segments){
   const button=make('button',undefined,'mls-financial-bar-point');button.type='button';button.dataset.sign=row.value===null?'unknown':row.value<0?'negative':'positive';button.dataset.role=row.role;button.setAttribute('aria-pressed','false');const description=row.label+': '+money(row.value)+' · '+roles[row.role]+(model.status==='PARTIAL'?' · base parcial':'');button.setAttribute('aria-label',description);
   const label=make('span',row.label),track=make('span',undefined,'mls-financial-bar-track'),bar=make('i'),amount=make('strong',money(row.value));track.setAttribute('aria-hidden','true');
   // Absolute magnitude is only geometric; negative values retain their signed
   // amount and extend left of the visible zero axis.
   if(row.value!==null){const width=Math.abs(row.value)/max*50;bar.style.width=width+'%';bar.style.left=(row.value<0?50-width:50)+'%';track.append(bar);}else track.append(make('span','—'));button.append(label,track,amount);
   const select=()=>{for(const peer of buttons)peer.setAttribute('aria-pressed',String(peer===button));readout.textContent=description;};button.onclick=select;button.onfocus=select;buttons.push(button);list.append(button);
  }
  buttons.forEach((button,index)=>button.onkeydown=event=>{const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowDown'||event.key==='ArrowRight'?Math.min(buttons.length-1,index+1):event.key==='ArrowUp'||event.key==='ArrowLeft'?Math.max(0,index-1):-1;if(event.key==='Escape'){for(const peer of buttons)peer.setAttribute('aria-pressed','false');readout.textContent='Seleção fechada. Os valores permanecem na lista equivalente.';}else if(next>=0){event.preventDefault?.();buttons[next].focus?.();buttons[next].onclick();}});
  host.append(list,readout);return true;
 }
 return Object.freeze({project,draw});
}
