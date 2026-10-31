import {projectEscrowReleaseFrame,projectEscrowReleaseEvidenceFrame,projectEscrowReleaseCoverageFrame} from '../../finance/src/escrow-release-frame.mjs';
import {projectBusinessEscrowReleases,projectBusinessEscrowReleaseEvidence} from './business-escrow-releases.mjs';
import {projectBusinessEscrowReleaseCoverage} from './business-escrow-release-coverage.mjs';
import {projectBusinessMonthAuditScope} from './business-month-view-state.mjs';

// Aggregate presentation only. This function is frozen into the browser; all
// validators are supplied explicitly so it cannot capture server-only state.
export function projectMlsReleaseCoverageFollowup(value,selection,projectCoverage,projectFrame){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
 const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const month=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v)&&v>='2000-01';
 const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
 const waiting=reason=>{let selected=null;try{const descriptor=Object.getOwnPropertyDescriptor(selection??{},'month');if(descriptor&&Object.hasOwn(descriptor,'value')&&month(descriptor.value))selected=descriptor.value;}catch{}return {schema:'mls_release_coverage_followup_v1',state:'WAITING',reason,scope_compatible:false,month:selected,period:null,through_month:null,checked_at:null,attempt:null,coverage:null,calendars:[]};};
 try{
  if(!exact(selection,['month','scope','currentMonth','cohortSources','checkedAt'])||!integer(selection.checkedAt,1,9999999999)||!month(selection.month)||!month(selection.currentMonth)||selection.month>selection.currentMonth)return waiting('SELECTION_INVALID');
  if(selection.month===selection.currentMonth)return {...waiting('CURRENT_MONTH'),state:'CURRENT_MONTH'};
  const scope=selection.scope;
  if(!exact(scope,['publication_revision','start_date','end_date','sources'])||!integer(scope.publication_revision,1,2147483647)||scope.start_date!==selection.month+'-01'||!day(scope.end_date)||scope.end_date.slice(0,7)!==selection.month||!Array.isArray(scope.sources)||scope.sources.length!==Math.ceil(Number(scope.end_date.slice(8))/15)||!Array.isArray(selection.cohortSources)||selection.cohortSources.length!==scope.sources.length)return waiting('PUBLICATION_SCOPE_REQUIRED');
  const expected=new Map(),published=new Map();
  for(const [index,source] of scope.sources.entries()){
   if(!exact(source,['run_id','source_revision','start_date','end_date'])||!uuid(source.run_id)||expected.has(source.run_id)||!integer(source.source_revision,1,2147483647)||source.start_date!==selection.month+'-'+String(index*15+1).padStart(2,'0')||source.end_date!==selection.month+'-'+String(Math.min(index*15+15,Number(scope.end_date.slice(8)))).padStart(2,'0'))return waiting('PUBLICATION_SCOPE_REQUIRED');
   expected.set(source.run_id,source);
  }
  for(const source of selection.cohortSources){
   const ref=expected.get(source?.run_id);
   if(!ref||published.has(source.run_id)||source.source_revision!==ref.source_revision||source.start_date!==ref.start_date||source.end_date!==ref.end_date||!integer(source.orders,0,1000)||!integer(source.paid_orders,0,source.orders)||source.expected_repass_cents!==null&&!integer(source.expected_repass_cents,Number.MIN_SAFE_INTEGER)||(source.finance_oldest_at===null)!==(source.finance_latest_at===null)||source.orders>0&&source.finance_oldest_at===null||source.finance_oldest_at!==null&&(!integer(source.finance_oldest_at,1,selection.checkedAt+60)||!integer(source.finance_latest_at,source.finance_oldest_at,selection.checkedAt+60)))return waiting('PUBLICATION_SCOPE_REQUIRED');
   published.set(source.run_id,source);
  }
  if(typeof projectCoverage!=='function'||typeof projectFrame!=='function')return waiting('VALIDATOR_REQUIRED');
  const observed=projectCoverage(value,projectFrame);
  if(!observed||observed.cohort_month!==selection.month||observed.checked_at>selection.checkedAt+60)return waiting('SAVED_EVIDENCE_NOT_LOADED');
  if(!observed.report)return {...waiting(observed.status==='UNAVAILABLE'?'SOURCE_UNAVAILABLE':'AWAITING_AUTOMATIC_CHECK'),attempt:observed.attempt?{...observed.attempt}:null};
  const report=observed.report;
  if(report.cohort_month!==selection.month||report.through_month>selection.currentMonth||report.sources.length!==expected.size)return waiting('PUBLICATION_MISMATCH');
  const seen=new Set();
  for(const source of report.sources){
   const ref=expected.get(source.run_id),saved=published.get(source.run_id);
   if(!ref||seen.has(source.run_id)||source.source_revision!==ref.source_revision)return waiting('PUBLICATION_MISMATCH');
   if(source.status==='AVAILABLE'&&(source.start_date!==ref.start_date||source.end_date!==ref.end_date||source.orders!==saved.orders||source.paid_orders!==saved.paid_orders||source.expected_repass_cents!==saved.expected_repass_cents||saved.orders>0&&(source.finance_oldest_at!==saved.finance_oldest_at||source.finance_latest_at!==saved.finance_latest_at)))return waiting('PUBLICATION_MISMATCH');
   seen.add(source.run_id);
  }
  const historical=report.through_month<selection.currentMonth;
  return {schema:'mls_release_coverage_followup_v1',state:historical?'HISTORICAL':observed.status==='PARTIAL_UNAVAILABLE'?'RETRY_WAIT':'CURRENT',reason:historical?'LATER_CALENDAR_PENDING':observed.status==='PARTIAL_UNAVAILABLE'?'SOURCE_REFRESH_FAILED':null,scope_compatible:true,month:selection.month,period:{start_date:scope.start_date,end_date:scope.end_date},through_month:report.through_month,checked_at:report.checked_at,attempt:observed.attempt?{...observed.attempt}:null,coverage:{...report.coverage},calendars:report.calendars.map(row=>({...row}))};
 }catch{return waiting('INVALID_EVIDENCE');}
}

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
.escrow-release-coverage{margin-top:16px;padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--surface-raised)}.escrow-release-coverage h4{margin:0 0 6px;font-size:13px}.escrow-release-coverage p{margin:5px 0;font-size:10px;line-height:1.7;color:var(--muted)}.escrow-release-coverage-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}.escrow-release-coverage-grid div{min-width:0;padding:9px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}.escrow-release-coverage-grid small,.escrow-release-coverage-grid strong{display:block}.escrow-release-coverage-grid small{font-size:9px;color:var(--muted);line-height:1.45}.escrow-release-coverage-grid strong{margin-top:4px;font-size:12px;overflow-wrap:anywhere}.escrow-release-calendar-list{margin:10px 0 0;padding-left:18px}.escrow-release-calendar-list li{font-size:10px;line-height:1.65;color:var(--muted)}
.escrow-release-coverage-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}.escrow-release-coverage-head button{min-height:44px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--text);font-size:10px;font-weight:700;cursor:pointer}.escrow-release-coverage-head button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.escrow-release-coverage[data-state=HISTORICAL],.escrow-release-coverage[data-state=RETRY_WAIT]{border-color:var(--warning,#d29a25)}.escrow-release-coverage-attempt{padding-top:8px;border-top:1px solid var(--line)}
.escrow-releases [hidden]{display:none!important}.escrow-releases summary:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
@media(max-width:640px){.escrow-releases-metrics{grid-template-columns:minmax(0,1fr)}.escrow-releases>details>summary{align-items:flex-start;gap:10px}.escrow-releases-badge{max-width:105px}.escrow-order-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.escrow-order-values{grid-template-columns:repeat(2,minmax(0,1fr))}.escrow-release-coverage-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

export function escrowReleasesBody(){
 return `<section id="businessEscrowReleases" class="escrow-releases" aria-labelledby="businessEscrowReleasesTitle"><details id="businessEscrowReleasesDetails"><summary><span class="escrow-releases-heading"><strong id="businessEscrowReleasesTitle">Liberações da Shopee</strong><span id="businessEscrowReleasesStatus" role="status" aria-live="polite">Aguardando a consulta salva do mês.</span></span><span id="businessEscrowReleasesBadge" class="escrow-releases-badge">Em conferência</span></summary><div class="escrow-releases-body"><p id="businessEscrowReleasesScope">As liberações são consultadas pela data em que a Shopee as informou.</p><p id="businessEscrowReleasesCohort">O vínculo usa os pedidos pagos do resumo salvo, pela data de criação.</p><p>Liberação na Shopee e recebimento no banco são etapas diferentes. Os valores abaixo não são somados nem descontados novamente do resultado líquido.</p><div id="businessEscrowReleasesMetrics" class="escrow-releases-metrics" hidden></div><p id="businessEscrowReleasesNotice" class="escrow-releases-notice" hidden></p><div id="businessEscrowReleasesMatching" class="escrow-releases-matching"></div><div id="businessEscrowReleasesCoverage" class="escrow-release-coverage"></div><div id="businessEscrowReleasesOrders" class="escrow-order-detail" hidden></div></div></details></section>`;
}

export const ESCROW_RELEASES_CLIENT=String.raw`
(()=>{
 ${projectEscrowReleaseFrame.toString()}
 ${projectEscrowReleaseEvidenceFrame.toString()}
 ${projectEscrowReleaseCoverageFrame.toString()}
 ${projectBusinessEscrowReleases.toString()}
 ${projectBusinessEscrowReleaseEvidence.toString()}
 ${projectBusinessEscrowReleaseCoverage.toString()}
 ${projectMlsReleaseCoverageFollowup.toString()}
 ${projectBusinessMonthAuditScope.toString()}
 const el=name=>document.getElementById('businessEscrowReleases'+name);
 const node=(tag,text,cls)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;if(cls)result.className=cls;return result;};
 const money=value=>{if(!Number.isSafeInteger(value))return 'Não informado';const cents=BigInt(value),absolute=cents<0n?-cents:cents,fraction=String(absolute%100n).padStart(2,'0');const text=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).formatToParts(absolute/100n).map(part=>part.type==='fraction'?fraction:part.value).join('');return (cents<0n?'-':'')+text;};
 const time=value=>Number.isSafeInteger(value)&&value>0?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value*1000)):'Não consultado';
 const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'—';
 let api=null,started=false,month='',scopeKey='',generation=0,pending=null,value=null,orders=null,coverage=null,coveragePending=null,coverageFailed=false,coverageDetails=null;
 const cache=new Map(),attempted=new Map(),coverageAttempted=new Map();
 function validMonth(selected){try{return typeof selected==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)&&selected>='2000-01'&&selected<=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7);}catch{return false;}}
 function showMessage(text,badge='Em conferência'){if(el('Status'))el('Status').textContent=text;if(el('Badge'))el('Badge').textContent=badge;}
 function render(){
  if(!el(''))return;
  const metrics=el('Metrics'),matching=el('Matching'),notice=el('Notice'),orderTarget=el('Orders'),coverageTarget=el('Coverage');metrics.replaceChildren();matching.replaceChildren();notice.hidden=true;notice.textContent='';orderTarget.replaceChildren();orderTarget.hidden=true;coverageTarget.replaceChildren();
  if(!value){metrics.hidden=true;el('Scope').textContent=month?'Mês das liberações: '+month.slice(5)+'/'+month.slice(0,4)+' · Brasília.':'As liberações são consultadas pela data em que a Shopee as informou.';el('Cohort').textContent='O vínculo usa os pedidos pagos do resumo salvo, pela data de criação.';renderCoverage(coverageTarget);return;}
  renderEvidence(value,metrics,matching,notice);renderCoverage(coverageTarget);renderOrders(orderTarget);
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
 function currentMonth(){try{return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7);}catch{return '';}}
 function coveragePresentation(){
  let scope=null;try{scope=JSON.parse(scopeKey);}catch{}
  return projectMlsReleaseCoverageFollowup(coverage,{month,scope,currentMonth:currentMonth(),cohortSources:value?.cohort?.sources??null,checkedAt:Math.floor(Date.now()/1000)},projectBusinessEscrowReleaseCoverage,projectEscrowReleaseCoverageFrame);
 }
 function renderCoverage(target){
  const head=node('div',undefined,'escrow-release-coverage-head');head.append(node('h4','Acompanhamento automático dos repasses'));
  if(month&&month<currentMonth()){
   const refresh=node('button','Conferir acompanhamento');refresh.type='button';refresh.disabled=coveragePending!==null||!value?.cohort||!scopeKey;refresh.onclick=()=>loadCoverage({force:true});head.append(refresh);
  }
  target.append(head);
  if(!month){target.append(node('p','Selecione um mês para acompanhar os mesmos pedidos pagos nos calendários posteriores.'));return;}
  const followup=coveragePresentation();target.dataset.state=followup.state;
  if(followup.state==='CURRENT_MONTH'){target.append(node('p','Este ainda é o mês corrente. O acompanhamento dos repasses em meses posteriores começa após a virada do mês; a conferência acima continua usando o corte atual.'));return;}
  const attempt=followup.attempt;
  if(coveragePending)target.append(node('p','Conferindo o acompanhamento já salvo pelo servidor…'));
  if(!followup.coverage){
   const message=followup.reason==='PUBLICATION_MISMATCH'?'A publicação dos pedidos mudou. Aguardando o acompanhamento automático conferir exatamente este recorte.':followup.reason==='SOURCE_UNAVAILABLE'?'O acompanhamento ainda não pôde ser atualizado. O servidor tentará novamente no horário agendado.':'Aguardando a rotina automática cruzar estes pedidos com os calendários de liberação salvos dos meses seguintes.';
   target.append(node('p',message));
  }else{
   const summary=followup.coverage,grid=node('div',undefined,'escrow-release-coverage-grid'),cell=(label,value)=>{const box=node('div');box.append(node('small',label),node('strong',value));grid.append(box);};
   target.append(node('p','Pedidos criados de '+day(followup.period.start_date)+' a '+day(followup.period.end_date)+'. Último cruzamento salvo: '+time(followup.checked_at)+'.'));
   if(followup.state==='HISTORICAL')target.append(node('p','Este é um corte histórico até '+followup.through_month.slice(5)+'/'+followup.through_month.slice(0,4)+'. O calendário de '+currentMonth().slice(5)+'/'+currentMonth().slice(0,4)+' ainda precisa entrar no acompanhamento.'));
   else if(followup.state==='RETRY_WAIT')target.append(node('p','Mostrando o último cruzamento válido. A tentativa mais recente não pôde atualizar a fonte; as datas originais foram preservadas.'));
   cell('Calendários conferidos',summary.calendars_complete+' de '+summary.calendars_total);cell('Pedidos localizados',summary.paid_orders===null?String(summary.located_orders)+' conhecidos':summary.located_orders+' de '+summary.paid_orders);cell('Ainda não localizados',summary.not_located_orders===null?'Coorte incompleta':String(summary.not_located_orders));cell('Identidade ambígua',String(summary.ambiguous_orders));target.append(grid);
   const through=followup.through_month.slice(5)+'/'+followup.through_month.slice(0,4);
   target.append(node('p',summary.identity_complete_at_cutoff?'No corte salvo até '+through+', todos os pedidos pagos conhecidos aparecem exatamente uma vez. Isso confirma somente a identidade nesse recorte; o ciclo de liberação e o recebimento bancário continuam em conferência.':'A cobertura do corte salvo até '+through+' ainda está incompleta. Um pedido sem ocorrência significa apenas que não apareceu nos calendários salvos acompanhados.'));
   const list=node('ul',undefined,'escrow-release-calendar-list'),labels={COMPLETE:'conferido no corte salvo',PARTIAL:'consulta parcial',MISSING:'calendário ainda sem snapshot completo'};
   for(const item of followup.calendars)list.append(node('li',item.month.slice(5)+'/'+item.month.slice(0,4)+' · '+labels[item.status]+(item.cohort_observations?' · '+item.cohort_observations+' ocorrência(s) dos pedidos acompanhados':'')));
   target.append(list);
  }
  if(attempt)target.append(node('p','Última tentativa automática: '+time(attempt.checked_at)+' · '+(attempt.status==='SUCCESS'?'cruzamento salvo':'fonte indisponível')+'. Próxima conferência programada: '+time(attempt.next_attempt_at)+'. O horário é uma previsão; a fila respeita pausas e tarefas em andamento.','escrow-release-coverage-attempt'));
  if(coverageFailed)target.append(node('p','Não foi possível conferir o acompanhamento salvo agora. Use Conferir acompanhamento para tentar novamente; as datas e evidências anteriores foram preservadas.'));
  target.append(node('p','A rotina funciona em segundo plano. Abrir esta seção apenas lê os registros salvos. Valores a receber, valores não informados e lucro realizado não são deduzidos dessas contagens.'));
 }
 function loadCoverage({force=false}={}){
  if(!started||!month||month>=currentMonth()||!value?.cohort||!scopeKey||document.hidden||!el('Details')?.open)return Promise.resolve(false);
  const selected=month,selectedScopeKey=scopeKey,selectedThrough=currentMonth(),key=selected+'|'+selectedScopeKey+'|'+selectedThrough;
  if(coveragePending?.key===key)return coveragePending.task;
  const stamp=Date.now(),last=coverageAttempted.get(key);if(!force&&last!==undefined&&stamp>=last&&stamp-last<60000)return Promise.resolve(coverage!==null);
  coverageAttempted.set(key,stamp);while(coverageAttempted.size>12)coverageAttempted.delete(coverageAttempted.keys().next().value);
  const token=generation,current=()=>started&&generation===token&&month===selected&&scopeKey===selectedScopeKey&&currentMonth()===selectedThrough;
  const task=(async()=>{
   await Promise.resolve();
   try{
    const raw=await api('finance/escrow-release-coverage?month='+encodeURIComponent(selected));if(!current())return false;
    const checked=projectBusinessEscrowReleaseCoverage(raw,projectEscrowReleaseCoverageFrame);if(!checked||checked.cohort_month!==selected)throw Error('INVALID_COVERAGE');
    coverage=checked;coverageFailed=false;const saved=cache.get(selected);if(saved?.scopeKey===selectedScopeKey)saved.coverage=coverage;render();return coveragePresentation().scope_compatible;
   }catch{if(current()){coverageFailed=true;render();}return false;}
   finally{if(coveragePending?.task===task){coveragePending=null;if(started)render();}}
  })();
  coveragePending={key,task};render();return task;
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
   generation++;month=selected;scopeKey=selectedScopeKey;pending=null;coveragePending=null;coverageFailed=false;
   const saved=cache.get(selected),reuse=changedMonth&&saved?.scopeKey===selectedScopeKey;
   value=reuse?saved.value:null;orders=reuse?saved.orders:null;coverage=reuse?saved.coverage:null;
   if(!reuse){cache.delete(selected);attempted.delete(selected);}
   render();showMessage(value?'Mostrando as últimas liberações salvas deste mês.':'Conferindo as liberações salvas deste mês…');
  }
  if(scope===null){value=null;orders=null;coverage=null;render();showMessage('Aguardando um resumo publicado para conferir os mesmos pedidos.','Aguardando resumo');return Promise.resolve(false);}
  if(document.hidden)return Promise.resolve(false);
  if(pending?.month===selected&&pending.scopeKey===selectedScopeKey)return pending.task;
  const stamp=Date.now(),last=attempted.get(selected);if(last?.scopeKey===selectedScopeKey&&stamp>=last.at&&stamp-last.at<60000){if(value?.cohort&&el('Details')?.open){const selectedGeneration=generation;return loadCoverage().then(()=>started&&generation===selectedGeneration&&month===selected&&scopeKey===selectedScopeKey&&value!==null);}return Promise.resolve(value!==null);}
  attempted.set(selected,{scopeKey:selectedScopeKey,at:stamp});while(attempted.size>12){const first=attempted.keys().next().value;attempted.delete(first);cache.delete(first);}const token=generation,current=()=>started&&generation===token&&month===selected&&scopeKey===selectedScopeKey;
  const task=(async()=>{
   await Promise.resolve();
   try{const raw=await api('finance/escrow-releases?month='+encodeURIComponent(selected)+'&evidence=orders-v1'),evidence=projectBusinessEscrowReleaseEvidence(raw,{projectBusiness:projectBusinessEscrowReleases,projectFrame:projectEscrowReleaseFrame,projectEvidenceFrame:projectEscrowReleaseEvidenceFrame}),checked=evidence?.report??projectBusinessEscrowReleases(raw,projectEscrowReleaseFrame);if(!current())return false;if(!checked||checked.month!==selected)throw Error('INVALID_RECONCILIATION');const receivedScope=projectBusinessMonthAuditScope(checked.cohort===null?null:{publication_revision:checked.cohort.publication_revision,start_date:checked.cohort.start_date,end_date:checked.cohort.end_date,sources:checked.cohort.sources.map(({run_id,source_revision,start_date,end_date})=>({run_id,source_revision,start_date,end_date}))});if(receivedScope===null||JSON.stringify(receivedScope)!==selectedScopeKey)throw Error('RECONCILIATION_SCOPE_MISMATCH');value=checked;orders=evidence?.orders??null;if(selected<currentMonth()&&el('Details')?.open)await loadCoverage();if(!current())return false;cache.set(selected,{scopeKey:selectedScopeKey,value:checked,orders,coverage});while(cache.size>12){const first=cache.keys().next().value;cache.delete(first);attempted.delete(first);}render();try{globalThis.mlsAgentRegistry?.refresh?.();}catch{}return true;}
   catch{if(current())showMessage(value?'Não foi possível atualizar as liberações agora. Os valores conferidos e suas datas foram preservados.':'As liberações ainda não puderam ser carregadas. A coleta do servidor continua e tentaremos novamente.','Em conferência');return false;}
   finally{if(current()&&pending?.task===task)pending=null;}
  })();
  pending={month:selected,scopeKey:selectedScopeKey,task};return task;
 }
 function snapshot(){return started&&value?{schema:'mls_escrow_releases_snapshot_v1',month,scope_key:scopeKey,report:value,orders,coverage:coveragePresentation().scope_compatible?coverage:null}:null;}
 function onCoverageToggle(){if(coverageDetails?.open)void loadCoverage();}
 function start(options){if(!el('')||typeof options?.api!=='function')return false;if(started&&api===options.api)return true;generation++;api=options.api;started=true;month='';scopeKey='';pending=null;value=null;orders=null;coverage=null;coveragePending=null;coverageFailed=false;cache.clear();attempted.clear();coverageAttempted.clear();
  // This module is embedded alongside other financial panels. Bind only after
  // its own DOM exists, and keep one stable handler across stop/start cycles.
  const details=el('Details');if(details!==coverageDetails){
   if(typeof coverageDetails?.removeEventListener==='function')coverageDetails.removeEventListener('toggle',onCoverageToggle);
   coverageDetails=details;if(typeof details?.addEventListener==='function')details.addEventListener('toggle',onCoverageToggle);
  }
  render();showMessage('Aguardando a consulta salva do mês.');return true;}
 function stop(){started=false;generation++;api=null;pending=null;orders=null;coverage=null;coveragePending=null;coverageFailed=false;coverageAttempted.clear();}
 globalThis.brazaEscrowReleases={start,observe,stop,getSnapshot:snapshot,refreshJoin:render,refreshCoverage:()=>loadCoverage({force:true})};
})();
`;
