// Read-only evidence presentation. Commercial units are never turned into
// physical garments or used to populate a receipt, inspection or stock ledger.
export const RETURNS_ORIGINAL_ITEMS_CSS=String.raw`
.returns-original-items{min-width:0;margin:15px 0;padding:13px;border:1px solid var(--line);border-radius:10px;background:var(--surface-raised)}.returns-original-items h5{font-size:12px;line-height:1.6;margin:0 0 8px}.returns-original-items h6{font-size:11px;line-height:1.6;margin:0 0 7px}.returns-original-items p{margin:7px 0;font-size:11px;line-height:1.75;overflow-wrap:anywhere}.returns-original-items-source{min-width:0;padding:11px 0;border-top:1px solid var(--line)}.returns-original-items-item{min-width:0;margin:9px 0;padding:9px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}.returns-original-items-item strong,.returns-original-items-item span{display:block;font-size:11px;line-height:1.7;overflow-wrap:anywhere}.returns-original-items-item span{color:var(--muted)}.returns-original-items-meta{color:var(--muted)}.returns-original-items-notice{border-top:1px solid var(--line);padding-top:10px}.returns-original-items[data-state=UNAVAILABLE] h5{color:var(--muted)}@media(max-width:390px){.returns-original-items{padding:10px}.returns-original-items-item{padding:8px}}
`;

export function returnsOriginalItemsBody(){return `<section id="physicalReturnsOriginalItems" class="returns-original-items" aria-labelledby="physicalReturnsOriginalItemsTitle" data-state="UNAVAILABLE"><h5 id="physicalReturnsOriginalItemsTitle">Itens e quantidades da origem</h5><p id="physicalReturnsOriginalItemsStatus" role="status" aria-live="polite">Escolha uma solicitação salva para conferir as evidências de origem disponíveis.</p><div id="physicalReturnsOriginalItemsSources"></div><p class="returns-original-items-notice">As quantidades abaixo são unidades comerciais registradas nas fontes. Um kit vendido não confirma quantas camisetas chegaram nem a composição física de cada peça. Recebimentos e inspeções continuam declarados e conferidos separadamente.</p></section>`;}

// Keep self-contained: the owner script embeds this factory before minifying.
export function createReturnOriginalItemsView(options={}){
 const document=options.documentImpl??globalThis.document,root=document?.getElementById?.('physicalReturnsOriginalItems');
 const unavailable=Object.freeze({render(){return false;},clear(){}});if(!root)return unavailable;
 const status=document.getElementById('physicalReturnsOriginalItemsStatus'),sources=document.getElementById('physicalReturnsOriginalItemsSources');if(!status||!sources)return unavailable;
 const node=(tag,text,cls)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(cls)value.className=cls;return value;};
 const integer=value=>Number.isSafeInteger(value)&&value>=0&&!Object.is(value,-0);
 const time=value=>integer(value)&&value>0?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value*1000)):'Não preservada';
 const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'Não informado';
 const messages={NOT_CAPTURED:'Os itens desta fonte ainda não foram preservados. A quantidade permanece desconhecida.',INVALID:'A leitura preservada não permitiu conferir os itens desta fonte. A quantidade permanece desconhecida.',LIMIT_REACHED:'O limite de captura desta fonte foi atingido. Os itens sem cobertura permanecem desconhecidos.'};
 function source(title,row){
  const section=node('section',undefined,'returns-original-items-source');section.append(node('h6',title));
  if(!row||row.state!=='AVAILABLE'){
   section.append(node('p',messages[row?.state]||messages.NOT_CAPTURED));if(row?.source_checked_at!==null&&row?.source_checked_at!==undefined)section.append(node('p','Leitura da fonte: '+time(row.source_checked_at)+' (Brasília).','returns-original-items-meta'));
   return section;
  }
  section.append(node('p','Leitura da fonte: '+time(row.source_checked_at)+' (Brasília). '+row.items.length+' linha(s) de itens preservada(s).','returns-original-items-meta'));
  for(const item of row.items){const entry=node('div',undefined,'returns-original-items-item');entry.append(node('strong','Produto #'+item.item_id+' · variação #'+item.model_id),node('span',new Intl.NumberFormat('pt-BR').format(item.quantity)+' unidade(s) comercial(is) nesta fonte'));section.append(entry);}
  return section;
 }
 function clear(message='Escolha uma solicitação salva para conferir as evidências de origem disponíveis.'){
  sources.replaceChildren();status.textContent=message;root.dataset.state='UNAVAILABLE';root.dataset.caseHash='';
 }
 function render(context,selection,{legacy=false}={}){
  try{
   if(!selection){clear();return false;}
   const reference=selection.month.slice(5)+'/'+selection.month.slice(0,4);
   if(!context){clear(legacy?'Esta leitura antiga ainda não inclui os itens de origem. As quantidades permanecem desconhecidas; o controle físico continua disponível.':'Ainda não há evidência de itens de origem disponível para esta solicitação em '+reference+'. As quantidades permanecem desconhecidas.');return false;}
   if(context.report.month!==selection.month||context.report.source_revision!==selection.publication_revision){clear('As evidências disponíveis pertencem a outra referência ou publicação. As quantidades de origem permanecem desconhecidas.');return false;}
   const matches=context.report.reports.filter(report=>report.cases.some(row=>row.case_hash===selection.case_hash&&row.order_hash===selection.order_hash));
   if(matches.length!==1){clear('Não foi possível associar uma única leitura de origem a esta solicitação. As quantidades permanecem desconhecidas.');return false;}
   const report=matches[0],evidence=context.original_items.find(row=>row.run_id===report.run_id&&row.source_revision===report.source_revision&&row.start_date===report.start_date&&row.end_date===report.end_date);
   const order=evidence?.orders.find(row=>row.order_hash===selection.order_hash),returned=evidence?.cases.find(row=>row.case_hash===selection.case_hash&&row.order_hash===selection.order_hash);
   sources.replaceChildren(source('Itens observados no pedido',order),source('Itens observados na solicitação de devolução',returned));
   const complete=order?.state==='AVAILABLE'&&returned?.state==='AVAILABLE';root.dataset.state=complete?'AVAILABLE':order?.state==='AVAILABLE'||returned?.state==='AVAILABLE'?'PARTIAL':'UNAVAILABLE';root.dataset.caseHash=selection.case_hash;
   const scope='Referência '+reference+' · origem de '+date(report.start_date)+' a '+date(report.end_date)+' · publicação '+context.report.source_revision+'.';
   status.textContent=scope+' '+(complete?'As duas fontes preservaram seus itens. Isso ainda não comprova o recebimento físico.':'Uma ou mais fontes ainda não preservaram os itens completos; ausência não é quantidade zero.')+(context.pending.length?' Há partes do recorte de origem ainda sem cobertura completa.':'');
   return complete;
  }catch{clear('Não foi possível conferir as evidências de origem desta leitura. As quantidades permanecem desconhecidas.');return false;}
 }
 return Object.freeze({render,clear});
}
