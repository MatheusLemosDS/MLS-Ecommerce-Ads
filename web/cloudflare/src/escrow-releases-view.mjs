import {projectEscrowReleaseFrame,projectEscrowReleaseEvidenceFrame} from '../../finance/src/escrow-release-frame.mjs';
import {projectBusinessEscrowReleases,projectBusinessEscrowReleaseEvidence} from './business-escrow-releases.mjs';
import {projectBusinessMonthAuditScope} from './business-month-view-state.mjs';

export const ESCROW_RELEASES_CSS=String.raw`
.escrow-releases{margin-top:18px;border:1px solid var(--line);border-radius:12px;background:var(--surface);min-width:0}
.escrow-releases>details>summary{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px;cursor:pointer;list-style:none}
.escrow-releases>details>summary::-webkit-details-marker{display:none}.escrow-releases>details>summary::after{content:"+";font-size:21px;color:var(--muted)}.escrow-releases>details[open]>summary::after{content:"−"}
.escrow-releases-heading{min-width:0;flex:1}.escrow-releases-heading strong{display:block;font-size:13px;line-height:1.5}
.escrow-releases-heading span,.escrow-releases-badge{display:block;margin-top:5px;font-size:11px;line-height:1.6;color:var(--muted)}
.escrow-releases-body{padding:0 16px 16px}.escrow-releases-body>p{font-size:11px;color:var(--muted);line-height:1.75;margin:0 0 12px;overflow-wrap:anywhere}
.escrow-releases-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}
.escrow-releases-metric{min-width:0;padding:12px;border:1px solid var(--line);border-radius:9px}.escrow-releases-metric small,.escrow-releases-metric span{display:block;font-size:10px;line-height:1.65;color:var(--muted)}
.escrow-releases-metric strong{display:block;margin:7px 0;font-size:16px;line-height:1.4;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.escrow-releases-matching ul{padding-left:18px;margin:12px 0}.escrow-releases-matching li{font-size:11px;line-height:1.75;color:var(--muted);overflow-wrap:anywhere}
.escrow-releases-notice{padding:11px 12px;border-radius:8px;background:var(--surface-raised);font-size:11px;color:var(--muted);line-height:1.75}
.escrow-order-detail{margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}.escrow-order-detail>h4{font-size:13px;margin:0 0 6px}.escrow-order-detail>p{font-size:11px;color:var(--muted);line-height:1.7}.escrow-order-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:12px 0}.escrow-order-summary article{padding:11px;border:1px solid var(--line);border-radius:9px;min-width:0}.escrow-order-summary small,.escrow-order-summary span{display:block;font-size:9px;color:var(--muted);line-height:1.55}.escrow-order-summary strong{display:block;margin:5px 0;font-size:15px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.escrow-order-list{display:grid;gap:9px;margin-top:12px}.escrow-order-card{padding:12px;border:1px solid var(--line);border-radius:10px;background:var(--surface);min-width:0}.escrow-order-card[data-state=AMBIGUOUS],.escrow-order-card[data-state=LOCATED_UNVERIFIED]{border-left:3px solid #d29a25}.escrow-order-card[data-state=NOT_LOCATED]{border-left:3px solid var(--muted)}.escrow-order-card[data-state=VERIFIED]{border-left:3px solid var(--positive,#17845c)}.escrow-order-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.escrow-order-head strong{font-size:11px;overflow-wrap:anywhere}.escrow-order-head span{font-size:9px;color:var(--muted)}.escrow-order-values{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0}.escrow-order-values div{min-width:0}.escrow-order-values small,.escrow-order-values span{display:block;font-size:9px;color:var(--muted);line-height:1.5}.escrow-order-values b{display:block;font-size:11px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.escrow-order-return{margin:8px 0 0;font-size:10px;line-height:1.65;color:var(--muted)}.escrow-order-warning{margin-top:10px;padding:9px 10px;border-radius:8px;background:var(--surface-raised);font-size:10px;line-height:1.65;color:var(--muted)}
.escrow-releases [hidden]{display:none!important}.escrow-releases summary:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
@media(max-width:640px){.escrow-releases-metrics{grid-template-columns:minmax(0,1fr)}.escrow-releases>details>summary{align-items:flex-start;gap:10px}.escrow-releases-badge{max-width:105px}.escrow-order-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.escrow-order-values{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

export function escrowReleasesBody(){
 return `<section id="businessEscrowReleases" class="escrow-releases" aria-labelledby="businessEscrowReleasesTitle"><details id="businessEscrowReleasesDetails"><summary><span class="escrow-releases-heading"><strong id="businessEscrowReleasesTitle">Liberações da Shopee</strong><span id="businessEscrowReleasesStatus" role="status" aria-live="polite">Aguardando a consulta salva do mês.</span></span><span id="businessEscrowReleasesBadge" class="escrow-releases-badge">Em conferência</span></summary><div class="escrow-releases-body"><p id="businessEscrowReleasesScope">As liberações são consultadas pela data em que a Shopee as informou.</p><p id="businessEscrowReleasesCohort">O vínculo usa os pedidos pagos do resumo salvo, pela data de criação.</p><p>Liberação na Shopee e recebimento no banco são etapas diferentes. Os valores abaixo não são somados nem descontados novamente do resultado líquido.</p><div id="businessEscrowReleasesMetrics" class="escrow-releases-metrics" hidden></div><p id="businessEscrowReleasesNotice" class="escrow-releases-notice" hidden></p><div id="businessEscrowReleasesMatching" class="escrow-releases-matching"></div><div id="businessEscrowReleasesOrders" class="escrow-order-detail" hidden></div></div></details></section>`;
}

export const ESCROW_RELEASES_CLIENT=String.raw`
(()=>{
 ${projectEscrowReleaseFrame.toString()}
 ${projectEscrowReleaseEvidenceFrame.toString()}
 ${projectBusinessEscrowReleases.toString()}
 ${projectBusinessEscrowReleaseEvidence.toString()}
 ${projectBusinessMonthAuditScope.toString()}
 const el=name=>document.getElementById('businessEscrowReleases'+name);
 const node=(tag,text,cls)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;if(cls)result.className=cls;return result;};
 const money=value=>{if(!Number.isSafeInteger(value))return 'Não informado';const cents=BigInt(value),absolute=cents<0n?-cents:cents,fraction=String(absolute%100n).padStart(2,'0');const text=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).formatToParts(absolute/100n).map(part=>part.type==='fraction'?fraction:part.value).join('');return (cents<0n?'-':'')+text;};
 const time=value=>Number.isSafeInteger(value)&&value>0?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value*1000)):'Não consultado';
 const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'—';
 let api=null,started=false,month='',scopeKey='',generation=0,pending=null,value=null,orders=null;
 const cache=new Map(),attempted=new Map();
 function validMonth(selected){try{return typeof selected==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)&&selected>='2000-01'&&selected<=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7);}catch{return false;}}
 function showMessage(text,badge='Em conferência'){if(el('Status'))el('Status').textContent=text;if(el('Badge'))el('Badge').textContent=badge;}
 function render(){
  if(!el(''))return;
  const metrics=el('Metrics'),matching=el('Matching'),notice=el('Notice'),orderTarget=el('Orders');metrics.replaceChildren();matching.replaceChildren();notice.hidden=true;notice.textContent='';orderTarget.replaceChildren();orderTarget.hidden=true;
  if(!value){metrics.hidden=true;el('Scope').textContent=month?'Mês das liberações: '+month.slice(5)+'/'+month.slice(0,4)+' · Brasília.':'As liberações são consultadas pela data em que a Shopee as informou.';el('Cohort').textContent='O vínculo usa os pedidos pagos do resumo salvo, pela data de criação.';return;}
  renderEvidence(value,metrics,matching,notice);renderOrders(orderTarget);
 }
 function renderEvidence(observation,metrics,matching,notice){
  // Scope, coverage and monetary completeness are supplied by the shared
  // defensive projector; a partial response never turns unknown values to zero.
  const report=observation.report;
  if(!report){metrics.hidden=true;showMessage('A coleta do servidor preencherá as liberações deste mês.','Aguardando consulta');el('Scope').textContent='Mês das liberações: '+observation.month.slice(5)+'/'+observation.month.slice(0,4)+' · Brasília.';return;}
  renderReport(observation,report,metrics,matching,notice);
 }
 function renderReport(observation,report,metrics,matching,notice){
  const calendar=report.calendar,collection=report.collection,link=report.matching,cohort=observation.cohort;
  const collecting=collection.status==='RUNNING'||collection.status==='RETRY_WAIT',saved=calendar.status==='COMPLETE';
  el('Scope').textContent=calendar.scan_id===null?'Mês das liberações: '+observation.month.slice(5)+'/'+observation.month.slice(0,4)+' · Brasília. Aguardando a consulta.':'Liberações de '+time(calendar.from_at)+' até '+time(calendar.end_before_at-1)+' · Brasília. Fonte consultada de '+time(calendar.source_oldest_at)+' a '+time(calendar.source_latest_at)+'.';
  if(cohort){
   const oldest=cohort.sources.map(source=>source.finance_oldest_at).filter(at=>Number.isSafeInteger(at)&&at>0),latest=cohort.sources.map(source=>source.finance_latest_at).filter(at=>Number.isSafeInteger(at)&&at>0);
   el('Cohort').textContent='Pedidos criados de '+day(cohort.start_date)+' a '+day(cohort.end_date)+' no resumo salvo. Financeiro consultado de '+time(oldest.length?Math.min(...oldest):null)+' a '+time(latest.length?Math.max(...latest):null)+'.';
  }else el('Cohort').textContent='Aguardando o resumo financeiro completo para localizar as liberações dos mesmos pedidos.';
  const progress=collecting?' Nova consulta em andamento: '+collection.windows_complete+' de '+collection.windows_total+' intervalo(s) conferidos.':collection.status==='LIMIT_REACHED'?' A consulta atingiu o limite e continua parcial.':'';
  showMessage((saved?'Mostrando a última consulta completa deste calendário.':calendar.scan_id===null?'A coleta automática preencherá as liberações deste mês.':'Mostrando as liberações já consultadas; o calendário ainda está parcial.')+progress,collection.status==='BLOCKED'?'Fonte indisponível':saved?'Consulta disponível':calendar.scan_id===null?'Aguardando consulta':'Em conferência');
  metrics.hidden=calendar.scan_id===null;if(calendar.scan_id===null)return;
  const metric=(label,amount,help)=>{const card=node('article',undefined,'escrow-releases-metric');card.append(node('small',label),node('strong',amount),node('span',help));metrics.append(card);};
  metric('Pedidos com liberação localizada',String(calendar.unique_orders),saved?'No intervalo de liberação identificado acima.':'Contagem dos registros já consultados; ainda não representa o calendário completo.');
  if(calendar.total_release_cents!==null)metric('Valor liberado conferido',money(calendar.total_release_cents),'Valor compatível com os pedidos em todas as liberações deste corte. Não comprova depósito no banco.');
  else if(calendar.verified_orders>0)metric('Valor conferido de '+calendar.verified_orders+' pedido(s)',money(calendar.known_verified_release_cents),'Valor parcial. As demais liberações permanecem em conferência.');
  else metric('Valor liberado conferido','Em conferência',calendar.unique_orders>0?'Falta conferir os valores com os respectivos pedidos. Nenhum valor ausente foi tratado como zero.':'A conclusão da consulta determina se houve liberações neste calendário.');
  metric('Liberações únicas vinculadas ao resumo',link.paid_orders===null?'Vínculo pendente':link.paid_orders===0?'Nenhum pedido pago':link.located_paid_orders+' de '+link.paid_orders,'O vínculo considera os pedidos pagos do resumo, pela data de criação.');
  const list=node('ul');
  const expected=calendar.status==='COMPLETE'||link.located_paid_orders>0?money(link.expected_located_cents):'Aguardando a localização dos pedidos';
  list.append(node('li','Repasse previsto dos pedidos localizados: '+expected+'. Esse é o repasse previsto dos mesmos pedidos, separado do valor de liberação.'));
  const compatible=link.verified_release_cents!==null?money(link.verified_release_cents):link.verified_paid_orders>0?money(link.known_verified_release_cents)+' — parcial, em '+link.verified_paid_orders+' pedido(s)':'Em conferência';
  list.append(node('li','Liberações com valor compatível: '+compatible+'. Somente pedidos com uma única liberação conferida.'));
  if(link.located_paid_orders>0&&link.comparison_difference_cents!==null)list.append(node('li','Diferença no conjunto comparável: '+money(link.comparison_difference_cents)+'. Comparação dos mesmos pedidos, sem alterar o resultado líquido previsto.'));
  list.append(node('li','Sem liberação localizada neste período: '+(link.unlocated_paid_orders===null?'Vínculo ainda incompleto':link.unlocated_paid_orders+' pedido(s)')+'. Isso não comprova ausência de recebimento fora deste intervalo.'));
  list.append(node('li','Fora do conjunto de pedidos pagos deste resumo: '+(link.outside_cohort_orders===null?'Vínculo ainda incompleto':link.outside_cohort_orders+' pedido(s)')+'.'));
  if(link.ambiguous_paid_orders>0)list.append(node('li',link.ambiguous_paid_orders+' pedido(s) do resumo com mais de uma ocorrência de liberação aguardam conferência.'));
  matching.append(list);
  const notes=[];
  if(calendar.ambiguous_orders>0)notes.push(calendar.ambiguous_orders+' pedido(s) têm mais de uma ocorrência de liberação. O total permanece em conferência para evitar somas repetidas.');
  if(calendar.unverified_orders>0)notes.push('Os valores de '+calendar.unverified_orders+' pedido(s) ainda não foram confirmados com a evidência financeira correspondente.');
  if(link.status==='SOURCE_MISSING')notes.push('Falta recuperar parte da evidência dos pedidos do resumo para concluir o vínculo.');
  if(observation.attempt?.status==='UNAVAILABLE'||report.pending.includes('RELEASE_SOURCE_UNAVAILABLE')||collection.status==='BLOCKED'||collection.status==='RETRY_WAIT')notes.push('Parte da fonte não pôde ser consultada. Os valores salvos mantêm suas datas originais e o servidor retomará a conferência.');
  if(notes.length){notice.hidden=false;notice.textContent=notes.join(' ');}
 }
 function reconciliationIndex(){
  let snapshot=null;try{snapshot=globalThis.brazaReconciliation?.getSnapshot?.()??null;}catch{}if(!snapshot||snapshot.month!==month||snapshot.scope_key!==scopeKey)return null;
  const cases=[],payouts=new Map();for(const report of snapshot.report?.reports??[])for(const item of report.cases??[])cases.push(item);
  for(const row of snapshot.money??[])for(const payout of row.money?.payouts??[])payouts.set(payout.order_hash,payout);
  return {cases,payouts,truncated:(snapshot.report?.reports??[]).some(report=>report.truncation?.truncated)};
 }
 function renderOrders(target){
  if(!orders)return;target.hidden=false;const s=orders.summary,reconciliation=reconciliationIndex();
  target.append(node('h4','Conciliação por pedido'),node('p','Cada referência abaixo usa apenas o hash interno do pedido. “Sem liberação localizada” significa somente que o pedido não apareceu neste calendário de liberações até o corte consultado; não significa falta de pagamento nem saldo ainda a receber.'));
  const summary=node('div',undefined,'escrow-order-summary'),metric=(label,value,help)=>{const card=node('article');card.append(node('small',label),node('strong',value),node('span',help));summary.append(card);};
  metric('Pedidos pagos conhecidos',String(s.known_paid_orders),'Na coorte financeira disponível.');
  metric('Liberação conferida',String(s.verified_orders),'Uma ocorrência com valor compatível.');
  metric('Sem liberação localizada',String(s.not_located_orders),'Apenas neste calendário consultado.');
  metric('Repasse após ajustes sem liberação localizada',s.not_located_after_adjustment_known_orders?money(s.known_not_located_after_adjustment_cents):'Não informado',s.not_located_after_adjustment_known_orders+' de '+s.not_located_orders+' pedido(s) com valor após ajuste conhecido. Não é “valor a receber”.');
  target.append(summary);
  const list=node('div',undefined,'escrow-order-list'),labels={VERIFIED:'Liberação conferida',LOCATED_UNVERIFIED:'Liberação localizada · valor em conferência',AMBIGUOUS:'Mais de uma ocorrência de liberação',NOT_LOCATED:'Sem liberação localizada neste calendário'};
  for(const row of orders.rows){
   const card=node('article',undefined,'escrow-order-card');card.dataset.state=row.state;const head=node('div',undefined,'escrow-order-head'),ref='Pedido interno '+row.order_hash.slice(0,10)+'…';head.append(node('strong',ref),node('span',labels[row.state]||row.state));card.append(head);
   const values=node('div',undefined,'escrow-order-values'),cell=(label,value,help)=>{const box=node('div');box.append(node('small',label),node('b',value),node('span',help));values.append(box);};
   cell('Repasse-base',money(row.base_repass_cents),'Evidência financeira do pedido.');
   cell('Ajuste informado',row.adjustment_cents===null?'Não informado':(row.adjustment_cents>0?'+':'')+money(row.adjustment_cents),'Sem atribuir o ajuste a uma devolução específica.');
   cell('Repasse após ajuste',money(row.after_adjustment_repass_cents),'Somente quando base + ajuste = após ajuste.');
   cell('Valor liberado conferido',money(row.release_cents),row.release_time===null?'Sem data de liberação única.':'Liberação informada em '+time(row.release_time)+'.');
   card.append(values);
   if(row.difference_from_base_cents!==null&&row.difference_from_base_cents!==0)card.append(node('div','Diferença entre a liberação conferida e o repasse-base: '+(row.difference_from_base_cents>0?'+':'')+money(row.difference_from_base_cents)+'. Quando o valor coincide com o repasse após ajustes, essa diferença já está incorporada e não deve ser descontada novamente.','escrow-order-warning'));
   const related=(reconciliation?.cases??[]).filter(item=>item.order_hash===row.order_hash),payout=reconciliation?.payouts.get(row.order_hash);
   if(related.length){
    const statuses=[...new Set(related.map(item=>item.status))].join(', '),known=related.filter(item=>Number.isSafeInteger(item.requested_refund_cents)),sum=known.reduce((total,item)=>total+item.requested_refund_cents,0);
    card.append(node('p','Devolução/reembolso na evidência salva: '+statuses+'. '+(known.length?known.length+' de '+related.length+' valor(es) informado(s), subtotal '+money(sum)+'.':'Valor de reembolso não informado neste recorte.')+(payout?.after_adjustment_repass_cents!==null&&Number.isSafeInteger(payout?.after_adjustment_repass_cents)?' Repasse após ajuste na conferência de devoluções: '+money(payout.after_adjustment_repass_cents)+'.':''),'escrow-order-return'));
   }else if(reconciliation)card.append(node('p',reconciliation.truncated?'Nenhuma solicitação de devolução aparece nas linhas visíveis deste recorte; a lista de casos está truncada.':'Nenhuma solicitação de devolução aparece nas evidências consultadas para este pedido.','escrow-order-return'));
   list.append(card);
  }
  target.append(list);
  if(orders.truncation.truncated)target.append(node('p','Mostrando '+orders.truncation.orders_included+' de '+orders.truncation.orders_total+' pedido(s). O resumo acima considera a coorte conhecida completa; a lista prioriza ajustes e divergências.','escrow-order-warning'));
  target.append(node('p','O valor ainda a liberar permanece indisponível como saldo financeiro geral: pedidos podem ser liberados fora deste calendário e liberação na Shopee não comprova crédito bancário.','escrow-order-warning'));
 }
 function observe(selected,selectedScope=null){
  if(!started||!validMonth(selected))return Promise.resolve(false);
  const projectedScope=projectBusinessMonthAuditScope(selectedScope),scope=projectedScope?.start_date===selected+'-01'?projectedScope:null,selectedScopeKey=scope===null?'':JSON.stringify(scope);
  const changedMonth=selected!==month,changedScope=selectedScopeKey!==scopeKey;
  if(changedMonth||changedScope){
   generation++;month=selected;scopeKey=selectedScopeKey;pending=null;
   const saved=cache.get(selected),reuse=changedMonth&&saved?.scopeKey===selectedScopeKey;
   value=reuse?saved.value:null;orders=reuse?saved.orders:null;
   if(!reuse){cache.delete(selected);attempted.delete(selected);}
   render();showMessage(value?'Mostrando as últimas liberações salvas deste mês.':'Conferindo as liberações salvas deste mês…');
  }
  if(scope===null){value=null;orders=null;render();showMessage('Aguardando um resumo publicado para conferir os mesmos pedidos.','Aguardando resumo');return Promise.resolve(false);}
  if(document.hidden)return Promise.resolve(false);
  if(pending?.month===selected&&pending.scopeKey===selectedScopeKey)return pending.task;
  const stamp=Date.now(),last=attempted.get(selected);if(last?.scopeKey===selectedScopeKey&&stamp>=last.at&&stamp-last.at<60000)return Promise.resolve(value!==null);
  attempted.set(selected,{scopeKey:selectedScopeKey,at:stamp});while(attempted.size>12){const first=attempted.keys().next().value;attempted.delete(first);cache.delete(first);}const token=generation,current=()=>started&&generation===token&&month===selected&&scopeKey===selectedScopeKey;
  const task=(async()=>{
   await Promise.resolve();
   try{const raw=await api('finance/escrow-releases?month='+encodeURIComponent(selected)+'&evidence=orders-v1'),evidence=projectBusinessEscrowReleaseEvidence(raw,{projectBusiness:projectBusinessEscrowReleases,projectFrame:projectEscrowReleaseFrame,projectEvidenceFrame:projectEscrowReleaseEvidenceFrame}),checked=evidence?.report??projectBusinessEscrowReleases(raw,projectEscrowReleaseFrame);if(!current())return false;if(!checked||checked.month!==selected)throw Error('INVALID_RECONCILIATION');const receivedScope=projectBusinessMonthAuditScope(checked.cohort===null?null:{publication_revision:checked.cohort.publication_revision,start_date:checked.cohort.start_date,end_date:checked.cohort.end_date,sources:checked.cohort.sources.map(({run_id,source_revision,start_date,end_date})=>({run_id,source_revision,start_date,end_date}))});if(receivedScope===null||JSON.stringify(receivedScope)!==selectedScopeKey)throw Error('RECONCILIATION_SCOPE_MISMATCH');value=checked;orders=evidence?.orders??null;cache.set(selected,{scopeKey:selectedScopeKey,value:checked,orders});while(cache.size>12){const first=cache.keys().next().value;cache.delete(first);attempted.delete(first);}render();try{globalThis.mlsAgentRegistry?.refresh?.();}catch{}return true;}
   catch{if(current())showMessage(value?'Não foi possível atualizar as liberações agora. Os valores conferidos e suas datas foram preservados.':'As liberações ainda não puderam ser carregadas. A coleta do servidor continua e tentaremos novamente.','Em conferência');return false;}
   finally{if(current()&&pending?.task===task)pending=null;}
  })();
  pending={month:selected,scopeKey:selectedScopeKey,task};return task;
 }
 function snapshot(){return started&&value?{schema:'mls_escrow_releases_snapshot_v1',month,scope_key:scopeKey,report:value,orders}:null;}
 function start(options){if(!el('')||typeof options?.api!=='function')return false;if(started&&api===options.api)return true;generation++;api=options.api;started=true;month='';scopeKey='';pending=null;value=null;orders=null;cache.clear();attempted.clear();render();showMessage('Aguardando a consulta salva do mês.');return true;}
 function stop(){started=false;generation++;api=null;pending=null;orders=null;}
 globalThis.brazaEscrowReleases={start,observe,stop,getSnapshot:snapshot,refreshJoin:render};
})();
`;
