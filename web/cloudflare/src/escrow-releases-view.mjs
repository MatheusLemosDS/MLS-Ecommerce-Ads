import {projectEscrowReleaseFrame} from '../../finance/src/escrow-release-frame.mjs';
import {projectBusinessEscrowReleases} from './business-escrow-releases.mjs';

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
.escrow-releases [hidden]{display:none!important}.escrow-releases summary:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
@media(max-width:640px){.escrow-releases-metrics{grid-template-columns:minmax(0,1fr)}.escrow-releases>details>summary{align-items:flex-start;gap:10px}.escrow-releases-badge{max-width:105px}}
`;

export function escrowReleasesBody(){
 return `<section id="businessEscrowReleases" class="escrow-releases" aria-labelledby="businessEscrowReleasesTitle"><details id="businessEscrowReleasesDetails"><summary><span class="escrow-releases-heading"><strong id="businessEscrowReleasesTitle">Liberações da Shopee</strong><span id="businessEscrowReleasesStatus" role="status" aria-live="polite">Aguardando a consulta salva do mês.</span></span><span id="businessEscrowReleasesBadge" class="escrow-releases-badge">Em conferência</span></summary><div class="escrow-releases-body"><p id="businessEscrowReleasesScope">As liberações são consultadas pela data em que a Shopee as informou.</p><p id="businessEscrowReleasesCohort">O vínculo usa os pedidos pagos do resumo salvo, pela data de criação.</p><p>Liberação na Shopee e recebimento no banco são etapas diferentes. Os valores abaixo não são somados nem descontados novamente do resultado líquido.</p><div id="businessEscrowReleasesMetrics" class="escrow-releases-metrics" hidden></div><p id="businessEscrowReleasesNotice" class="escrow-releases-notice" hidden></p><div id="businessEscrowReleasesMatching" class="escrow-releases-matching"></div></div></details></section>`;
}

export const ESCROW_RELEASES_CLIENT=String.raw`
(()=>{
 ${projectEscrowReleaseFrame.toString()}
 ${projectBusinessEscrowReleases.toString()}
 const el=name=>document.getElementById('businessEscrowReleases'+name);
 const node=(tag,text,cls)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;if(cls)result.className=cls;return result;};
 const money=value=>{if(!Number.isSafeInteger(value))return 'Não informado';const cents=BigInt(value),absolute=cents<0n?-cents:cents,fraction=String(absolute%100n).padStart(2,'0');const text=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).formatToParts(absolute/100n).map(part=>part.type==='fraction'?fraction:part.value).join('');return (cents<0n?'-':'')+text;};
 const time=value=>Number.isSafeInteger(value)&&value>0?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value*1000)):'Não consultado';
 const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'—';
 let api=null,started=false,month='',scopeKey='',generation=0,pending=null,value=null;
 const cache=new Map(),attempted=new Map();
 function validMonth(selected){try{return typeof selected==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)&&selected>='2000-01'&&selected<=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7);}catch{return false;}}
 function showMessage(text,badge='Em conferência'){if(el('Status'))el('Status').textContent=text;if(el('Badge'))el('Badge').textContent=badge;}
 function render(){
  if(!el(''))return;
  const metrics=el('Metrics'),matching=el('Matching'),notice=el('Notice');metrics.replaceChildren();matching.replaceChildren();notice.hidden=true;notice.textContent='';
  if(!value){metrics.hidden=true;el('Scope').textContent=month?'Mês das liberações: '+month.slice(5)+'/'+month.slice(0,4)+' · Brasília.':'As liberações são consultadas pela data em que a Shopee as informou.';el('Cohort').textContent='O vínculo usa os pedidos pagos do resumo salvo, pela data de criação.';return;}
  renderEvidence(value,metrics,matching,notice);
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
 function observe(selected,selectedScopeKey=''){
  if(!started||document.hidden||!validMonth(selected)||typeof selectedScopeKey!=='string'||selectedScopeKey.length>1024)return Promise.resolve(false);
  const changedMonth=selected!==month,changedScope=selectedScopeKey!==scopeKey;
  if(changedMonth||changedScope){
   generation++;month=selected;scopeKey=selectedScopeKey;pending=null;
   const saved=cache.get(selected),reuse=changedMonth&&saved?.scopeKey===selectedScopeKey;
   value=reuse?saved.value:null;
   if(!reuse){cache.delete(selected);attempted.delete(selected);}
   render();showMessage(value?'Mostrando as últimas liberações salvas deste mês.':'Conferindo as liberações salvas deste mês…');
  }
  if(pending?.month===selected&&pending.scopeKey===selectedScopeKey)return pending.task;
  const stamp=Date.now(),last=attempted.get(selected);if(last?.scopeKey===selectedScopeKey&&stamp>=last.at&&stamp-last.at<60000)return Promise.resolve(value!==null);
  attempted.set(selected,{scopeKey:selectedScopeKey,at:stamp});while(attempted.size>12){const first=attempted.keys().next().value;attempted.delete(first);cache.delete(first);}const token=generation,current=()=>started&&generation===token&&month===selected&&scopeKey===selectedScopeKey;
  const task=(async()=>{
   await Promise.resolve();
   try{const raw=await api('finance/escrow-releases?month='+encodeURIComponent(selected)),checked=projectBusinessEscrowReleases(raw,projectEscrowReleaseFrame);if(!current())return false;if(!checked||checked.month!==selected)throw Error('INVALID_RECONCILIATION');value=checked;cache.set(selected,{scopeKey:selectedScopeKey,value:checked});while(cache.size>12){const first=cache.keys().next().value;cache.delete(first);attempted.delete(first);}render();return true;}
   catch{if(current())showMessage(value?'Não foi possível atualizar as liberações agora. Os valores conferidos e suas datas foram preservados.':'As liberações ainda não puderam ser carregadas. A coleta do servidor continua e tentaremos novamente.','Em conferência');return false;}
   finally{if(current()&&pending?.task===task)pending=null;}
  })();
  pending={month:selected,scopeKey:selectedScopeKey,task};return task;
 }
 function start(options){if(!el('')||typeof options?.api!=='function')return false;if(started&&api===options.api)return true;generation++;api=options.api;started=true;month='';scopeKey='';pending=null;value=null;cache.clear();attempted.clear();render();showMessage('Aguardando a consulta salva do mês.');return true;}
 function stop(){started=false;generation++;api=null;pending=null;}
 globalThis.brazaEscrowReleases={start,observe,stop};
})();
`;
