import {projectReconciliationFrame,projectReconciliationEvidenceFrame} from '../../finance/src/reconciliation-frame.mjs';
import {projectBusinessReconciliation,projectBusinessReconciliationEvidence} from './business-reconciliation.mjs';
import {projectBusinessMonthAuditScope} from './business-month-view-state.mjs';

export const BUSINESS_RECONCILIATION_CSS=String.raw`
.business-reconciliation-review{margin:14px 0;padding:12px;border:1px solid var(--line);border-radius:9px}.business-reconciliation-review h5,.business-reconciliation-order-group h5{margin:0 0 8px;font-size:12px;line-height:1.6}.business-reconciliation-review-order{padding:12px 0;border-top:1px solid var(--line)}.business-reconciliation-review-order strong,.business-reconciliation-review-order span,.business-reconciliation-review-order a{display:block;font-size:11px;line-height:1.75;overflow-wrap:anywhere}.business-reconciliation-review-order span{color:var(--muted)}.business-reconciliation-review-order a{margin-top:6px}.business-reconciliation-order-group{padding-top:12px;margin-top:12px;border-top:1px solid var(--line)}
.business-reconciliation{margin-top:18px;border:1px solid var(--line);border-radius:12px;background:var(--surface);min-width:0}.business-reconciliation>details>summary{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px;cursor:pointer;list-style:none}.business-reconciliation>details>summary::-webkit-details-marker{display:none}.business-reconciliation>details>summary::after{content:"+";font-size:21px;color:var(--muted)}.business-reconciliation>details[open]>summary::after{content:"−"}.business-reconciliation-heading{min-width:0;flex:1}.business-reconciliation-heading strong{display:block;font-size:13px;line-height:1.5}.business-reconciliation-heading span,.business-reconciliation-badge{display:block;margin-top:5px;font-size:11px;line-height:1.6;color:var(--muted)}.business-reconciliation-body{padding:0 16px 16px}.business-reconciliation-body>p{font-size:11px;color:var(--muted);line-height:1.75;margin:0 0 12px;overflow-wrap:anywhere}.business-reconciliation-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}.business-reconciliation-metric{min-width:0;padding:12px;border:1px solid var(--line);border-radius:9px}.business-reconciliation-metric small,.business-reconciliation-metric span{display:block;font-size:10px;line-height:1.65;color:var(--muted)}.business-reconciliation-metric strong{display:block;margin:7px 0;font-size:16px;line-height:1.4;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.business-reconciliation-run{margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}.business-reconciliation-run h4{margin:0 0 7px;font-size:12px}.business-reconciliation-run p,.business-reconciliation-run li{font-size:11px;line-height:1.75;color:var(--muted);overflow-wrap:anywhere}.business-reconciliation-run ul{padding-left:18px;margin:10px 0}.business-reconciliation-case{display:flex;justify-content:space-between;align-items:start;gap:14px;padding:10px 0;border-top:1px solid var(--line)}.business-reconciliation-case:first-child{border-top:0}.business-reconciliation-case>div{min-width:0}.business-reconciliation-case strong{display:block;font-size:11px;line-height:1.7}.business-reconciliation-case span{display:block;font-size:10px;line-height:1.7;color:var(--muted)}.business-reconciliation-case>span{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.business-reconciliation-notice{padding:11px 12px;border-radius:8px;background:var(--surface-raised);font-size:11px;color:var(--muted);line-height:1.75}.business-reconciliation [hidden]{display:none!important}.business-reconciliation summary:focus-visible{outline:3px solid var(--accent);outline-offset:3px}@media(max-width:640px){.business-reconciliation-metrics{grid-template-columns:minmax(0,1fr)}.business-reconciliation-case{flex-direction:column;gap:5px}.business-reconciliation-case>span{text-align:left}.business-reconciliation>details>summary{align-items:flex-start;gap:10px}.business-reconciliation-badge{max-width:105px}}
`;

export function businessReconciliationBody(){
 return `<section id="businessReconciliation" class="business-reconciliation" aria-labelledby="businessReconciliationTitle"><details id="businessReconciliationDetails"><summary id="businessReconciliationSummary"><span class="business-reconciliation-heading"><strong id="businessReconciliationTitle">Conferência de repasses e devoluções</strong><span id="businessReconciliationStatus" role="status" aria-live="polite">Aguardando o resumo salvo do mês.</span></span><span id="businessReconciliationBadge" class="business-reconciliation-badge">Em conferência</span></summary><div class="business-reconciliation-body"><p id="businessReconciliationScope">A consulta acompanha as mesmas datas do resumo concluído.</p><p>Valores de solicitações de devolução e ajustes são evidências para conferência. Eles não são descontados novamente do resultado e não comprovam pagamento ou recebimento no banco.</p><div id="businessReconciliationMetrics" class="business-reconciliation-metrics" hidden></div><p id="businessReconciliationNotice" class="business-reconciliation-notice" hidden></p><div id="businessReconciliationRuns"></div></div></details></section>`;
}

export const BUSINESS_RECONCILIATION_CLIENT=String.raw`
(()=>{
 ${projectReconciliationFrame.toString()}
 ${projectReconciliationEvidenceFrame.toString()}
 ${projectBusinessReconciliation.toString()}
 ${projectBusinessReconciliationEvidence.toString()}
 ${projectBusinessMonthAuditScope.toString()}
 const el=name=>document.getElementById('businessReconciliation'+name);
 const node=(tag,text,cls)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;if(cls)result.className=cls;return result;};
 const money=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100):'Não informado';
 const time=value=>Number.isSafeInteger(value)&&value>0?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value*1000)):'Não consultado';
 const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8)+'/'+value.slice(5,7)+'/'+value.slice(0,4):'—';
 const sum=values=>{let total=0n;for(const value of values){if(!Number.isSafeInteger(value))return null;total+=BigInt(value);}return total>=BigInt(Number.MIN_SAFE_INTEGER)&&total<=BigInt(Number.MAX_SAFE_INTEGER)?Number(total):null;};
 const caseLabels={PENDING:'Detalhes pendentes',UNKNOWN:'Situação não reconhecida',REQUESTED:'Solicitação aberta',ACCEPTED:'Solicitação aceita',CANCELLED:'Solicitação cancelada',JUDGING:'Em análise',REFUND_PAID:'Reembolso informado pela Shopee',CLOSED:'Solicitação encerrada',PROCESSING:'Em processamento'};
 const reviewLabels={IN_CANCEL:'Cancelamento em andamento',TO_RETURN:'Devolução em andamento',OTHER_STATUS:'Outro estado em revisão',UNKNOWN_STATUS:'Situação não identificada'};
 const referenceMessages={DETAILS_PENDING:'As referências ainda precisam ser consultadas.',PERMISSION_DENIED:'A integração não recebeu permissão para consultar estas referências.',RATE_LIMIT:'A fonte limitou as consultas. A próxima tentativa deve respeitar a espera indicada.',TIMEOUT:'A fonte não respondeu dentro do prazo.',UNAVAILABLE:'A fonte das referências está indisponível.',INVALID_RESPONSE:'A resposta da fonte não pôde ser confirmada.',UNKNOWN_STATUS:'A situação informada pela fonte ainda não é reconhecida.',CURRENCY_MISMATCH:'A moeda informada pela fonte não corresponde ao real.'};
 let api=null,started=false,month='',scopeKey='',generation=0,pending=null,value=null,reviews=[];
 const cache=new Map(),attempted=new Map();
 function validMonth(selected){try{return typeof selected==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)&&selected>='2000-01'&&selected<=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7);}catch{return false;}}
 function showMessage(text,badge='Em conferência'){if(el('Status'))el('Status').textContent=text;if(el('Badge'))el('Badge').textContent=badge;}
 const orderTarget=(report,hash)=>'business-reconciliation-order-'+report.run_id+'-'+hash;
 function renderReview(report,review){
  const section=node('section',undefined,'business-reconciliation-review');section.append(node('h5','Pedidos em revisão'));
  section.append(node('p',report.coverage.review_orders+' pedido(s) fora dos valores dos pedidos pagos. São acompanhados separadamente dos '+report.coverage.return_orders+' pedido(s) pagos com devolução identificada.'));
  if(!review){section.append(node('p','O detalhe individual ainda não está disponível nesta leitura salva. O total em revisão continua preservado. A conferência de cada pedido depende de evidências compatíveis com este resumo.'));return section;}
  const counts=review.summary,types=[];for(const [key,label] of [['to_return','em devolução'],['in_cancel','em cancelamento'],['other','em outro estado'],['unknown','sem situação identificada']])if(counts[key])types.push(counts[key]+' '+label);
  section.append(node('p',types.join(' · ')+'. As referências abaixo são internas do BrazaCommerce; não são os números dos pedidos na Shopee.'));
  for(const item of review.orders){
   const row=node('article',undefined,'business-reconciliation-review-order');row.append(node('strong','Pedido interno '+item.order_hash.slice(0,12)+' · '+reviewLabels[item.status]),node('span','Fora dos valores dos pedidos pagos · situação observada em '+time(item.source_checked_at)+'.'));
   let step;
   if(item.reference_state==='NOT_APPLICABLE'){row.append(node('span','Esta situação não usa a busca de referências de devolução nesta conferência.'));step='Acompanhar a próxima atualização da situação do pedido.';}
   else if(item.reference_state==='PENDING'||item.reference_state==='RETRY_WAIT'){row.append(node('span',item.reference_state==='PENDING'?'Referências de devolução ainda não disponíveis.':'A consulta das referências precisa ser repetida.'));step='Obter as referências de devolução antes de conferir os valores.';}
   else if(item.reference_state==='KNOWN_EMPTY'){row.append(node('span','Nenhuma referência de devolução encontrada na consulta registrada. Isso não confirma o encerramento da situação.'));step='Conferir novamente as referências quando a situação for atualizada.';}
   else{row.append(node('span',item.reference_count+' solicitação(ões) identificada(s) · '+item.checked_cases+' com detalhes consultados · '+item.pending_cases+' aguardando detalhes.'));step=item.pending_cases>0?'Consultar os detalhes das solicitações pendentes.':'Conferir a situação e os valores solicitados; o reembolso efetivo continua sem conciliação.';}
   if(item.references_checked_at!==null)row.append(node('span','Referências consultadas em '+time(item.references_checked_at)+'.'));
   if(item.reference_diagnostic!==null){if(item.reference_count!==null)row.append(node('span','A última atualização das referências não foi concluída. As referências anteriores foram preservadas.'));row.append(node('span',referenceMessages[item.reference_diagnostic]));}
   if(item.next_attempt_at>0)row.append(node('span','Nova consulta permitida a partir de '+time(item.next_attempt_at)+'.'));
   row.append(node('span','Próxima conferência: '+step));
   if(report.cases.some(entry=>entry.order_hash===item.order_hash)){const link=node('a','Ver solicitações deste pedido');link.href='#'+orderTarget(report,item.order_hash);row.append(link);}
   section.append(row);
  }
  if(review.truncation.truncated)section.append(node('p',review.truncation.orders_included+' de '+review.truncation.orders_total+' pedidos em revisão exibidos. As contagens acima incluem todos os pedidos deste intervalo.'));
  return section;
 }
 function renderCase(item){
  const row=node('article',undefined,'business-reconciliation-case'),description=node('div');description.append(node('strong','Solicitação '+item.case_hash.slice(0,8)+' · '+caseLabels[item.status]),node('span',item.checked_at===null?'Detalhes ainda não consultados.':'Consultada em '+time(item.checked_at)+'.'));if(item.status==='CANCELLED')description.append(node('span','Cancelamento da solicitação; este valor não é uma despesa confirmada.'));row.append(description,node('span','Valor solicitado informado: '+money(item.requested_refund_cents)));return row;
 }
 function renderRun(report,review){
  const section=node('section',undefined,'business-reconciliation-run');
  section.append(node('h4',day(report.start_date)+' a '+day(report.end_date)),node('p','Financeiro: '+time(report.source_checked_at.finance_oldest_at)+' a '+time(report.source_checked_at.finance_latest_at)+' · revisão '+report.source_revision+'.'));
  const coverage=report.coverage,adjustments=report.adjustments,returns=report.returns;
  section.append(node('p',coverage.evidence_orders+' de '+coverage.orders+' pedido(s) deste intervalo com evidência preservada. '+coverage.review_orders+' pedido(s) com situação em revisão.'));
  if(coverage.review_orders>0)section.append(renderReview(report,review));
  const values=node('ul');values.append(node('li','Repasse base informado: '+money(adjustments.base_repass_cents)+'.'));
  values.append(node('li',(adjustments.missing_orders+adjustments.conflicting_orders>0?'Ajustes nos pedidos com valores compatíveis: ':'Ajustes informados: ')+(adjustments.reported_orders>0||coverage.paid_orders===0?money(adjustments.known_adjustment_cents):'Não informado')+'.'));
  values.append(node('li','Repasse após ajustes informado: '+money(adjustments.after_adjustment_repass_cents)+'. Esses valores não alteram a previsão líquida durante esta conferência.'));section.append(values);
  const notes=[];
  if(coverage.missing_evidence_orders>0)notes.push(coverage.missing_evidence_orders+' pedido(s) ainda sem evidência preservada. A coleta automática poderá completar as próximas leituras.');
  if(adjustments.conflicting_orders>0)notes.push(adjustments.conflicting_orders+' pedido(s) com diferença entre o repasse e os ajustes informados. Esses valores continuam em conferência.');
  if(adjustments.missing_orders>0)notes.push('O repasse após ajustes ainda não foi informado para '+adjustments.missing_orders+' pedido(s). Ausência de informação não é valor zero.');
  if(report.pending.includes('RETURN_REFERENCES_MISSING'))notes.push('Há ocorrências de devolução sem todas as referências necessárias para consultar seus detalhes.');
  if(returns.permission==='DENIED')notes.push('A Shopee não liberou os detalhes de devoluções nesta integração. As consultas de repasse e anúncios continuam disponíveis.');
  else if(returns.pending_count>0)notes.push(returns.pending_count+' solicitação(ões) aguardando detalhes. A conferência continua pelo servidor.');
  if(returns.checked_count>0)section.append(node('p','Detalhes de devolução: '+time(report.source_checked_at.returns_oldest_at)+' a '+time(report.source_checked_at.returns_latest_at)+'. Valores abaixo são os solicitados informados pela Shopee.'));
  if(notes.length){const list=node('ul');for(const text of notes)list.append(node('li',text));section.append(list);}
  if(report.cases.length){const groups=new Map();for(const item of report.cases){if(!groups.has(item.order_hash))groups.set(item.order_hash,[]);groups.get(item.order_hash).push(item);}for(const [hash,items] of groups){const group=node('section',undefined,'business-reconciliation-order-group');group.id=orderTarget(report,hash);group.append(node('h5','Solicitações do pedido interno '+hash.slice(0,12)));if(review?.orders.some(item=>item.order_hash===hash))group.append(node('p','Este pedido está em revisão e fora dos valores dos pedidos pagos.'));for(const item of items)group.append(renderCase(item));section.append(group);}}
  if(report.truncation.truncated)section.append(node('p',report.truncation.cases_included+' de '+report.truncation.cases_total+' solicitações exibidas. A cobertura informada acima considera o intervalo completo.'));
  return section;
 }
 function render(){
  if(!el(''))return;
  const metrics=el('Metrics'),runs=el('Runs'),notice=el('Notice');metrics.replaceChildren();runs.replaceChildren();notice.hidden=true;notice.textContent='';
  if(!value){metrics.hidden=true;el('Scope').textContent=month?'Mês de referência: '+month.slice(5)+'/'+month.slice(0,4)+' · Brasília.':'A consulta acompanha as mesmas datas do resumo concluído.';return;}
  el('Scope').textContent=value.end_date===null?'Mês de referência: '+value.month.slice(5)+'/'+value.month.slice(0,4)+'. Aguardando a conclusão de um período financeiro.':'Período desta conferência: '+day(value.start_date)+' a '+day(value.end_date)+' · Brasília. Revisão '+value.source_revision+'.';
  const reports=value.reports,covered=reports.length,complete=covered===value.sources.length&&value.sources.length>0;
  showMessage(value.status==='COLLECTING'?'Aguardando o resumo completo para conferir as mesmas datas.':covered+' de '+value.sources.length+' intervalo(s) com evidências consultadas. A conferência continua automaticamente.',value.status==='CHECKED'?'Evidências disponíveis':value.status==='UNAVAILABLE'?'Fonte indisponível':'Em conferência');
  metrics.hidden=reports.length===0;
  const metric=(label,amount,help)=>{const card=node('article',undefined,'business-reconciliation-metric');card.append(node('small',label),node('strong',amount),node('span',help));metrics.append(card);};
  if(reports.length){
   const knownOrders=sum(reports.map(report=>report.coverage.evidence_orders)),totalOrders=sum(reports.map(report=>report.coverage.orders));
   metric('Pedidos com evidência preservada',knownOrders+' de '+totalOrders,complete?'Nos mesmos intervalos do resumo salvo.':'Cobertura dos intervalos já consultados; ainda não representa todo o mês.');
   const after=complete?sum(reports.map(report=>report.adjustments.after_adjustment_repass_cents)):null;
   metric('Repasse após ajustes informado',money(after),'Valor informado pela Shopee, separado da previsão líquida. Não comprova recebimento.');
   const checked=sum(reports.map(report=>report.returns.checked_count)),references=sum(reports.map(report=>report.returns.reference_count));
   const missingReferences=reports.some(report=>report.pending.includes('RETURN_REFERENCES_MISSING'));
   metric('Solicitações com detalhes consultados',missingReferences&&references===0?'Referências pendentes':checked+' de '+references,missingReferences?'Há referências de devolução ainda ausentes.':'As solicitações e seus valores não são descontados novamente.');
   const reviewCount=sum(reports.map(report=>report.coverage.review_orders)),paidReturns=sum(reports.map(report=>report.coverage.return_orders)),unknownReturns=sum(reports.map(report=>report.coverage.return_unknown_orders));
   metric('Pedidos em revisão',String(reviewCount),'Fora dos valores dos pedidos pagos.'+(complete?'':' Contagem dos intervalos já consultados.'));
   metric('Pedidos pagos com devolução identificada',String(paidReturns),'Não inclui os pedidos em revisão.'+(unknownReturns>0?' Há ainda '+unknownReturns+' pedido(s) pago(s) sem confirmação de devolução.':'')+(complete?'':' Contagem dos intervalos já consultados.'));
   for(const report of reports)runs.append(renderRun(report,reviews.find(row=>row.run_id===report.run_id&&row.source_revision===report.source_revision)?.review??null));
  }
  const failed=value.attempts.some(attempt=>attempt.status==='UNAVAILABLE');
  if(failed||value.pending.includes('SOURCE_UNAVAILABLE')){notice.hidden=false;notice.textContent='Parte da fonte não pôde ser consultada. As evidências salvas mantêm suas datas originais; o servidor tentará novamente.';}
  else if(!reports.length&&value.status!=='COLLECTING'){notice.hidden=false;notice.textContent='A conferência será preenchida pela coleta do servidor. Não é necessário consultar a Shopee manualmente.';}
 }
 function observe(selected,selectedScope=null){
  if(!started||!validMonth(selected))return Promise.resolve(false);
  const projectedScope=projectBusinessMonthAuditScope(selectedScope),scope=projectedScope?.start_date===selected+'-01'?projectedScope:null,selectedScopeKey=scope===null?'':JSON.stringify(scope);
  const changedMonth=selected!==month,changedScope=selectedScopeKey!==scopeKey;
  if(changedMonth||changedScope){
   generation++;month=selected;scopeKey=selectedScopeKey;pending=null;
   const saved=cache.get(selected),reuse=changedMonth&&saved?.scopeKey===selectedScopeKey;
   value=reuse?saved.value:null;reviews=reuse?saved.reviews:[];
   if(!reuse){cache.delete(selected);attempted.delete(selected);}
   render();showMessage(value?'Mostrando as últimas evidências salvas deste mês.':'Conferindo as evidências salvas deste mês…');
  }
  if(scope===null){value=null;reviews=[];render();showMessage('Aguardando um resumo publicado para conferir os mesmos pedidos.','Aguardando resumo');return Promise.resolve(false);}
  if(document.hidden)return Promise.resolve(false);
  if(pending?.month===selected&&pending.scopeKey===selectedScopeKey)return pending.task;
  const stamp=Date.now(),last=attempted.get(selected);if(last?.scopeKey===selectedScopeKey&&stamp>=last.at&&stamp-last.at<60000)return Promise.resolve(value!==null);
  attempted.set(selected,{scopeKey:selectedScopeKey,at:stamp});while(attempted.size>12){const first=attempted.keys().next().value;attempted.delete(first);cache.delete(first);}const token=generation,current=()=>started&&generation===token&&month===selected&&scopeKey===selectedScopeKey;
  const task=(async()=>{
   await Promise.resolve();
   try{const raw=await api('finance/reconciliation?month='+encodeURIComponent(selected)+'&evidence=review-v1');if(!current())return false;const evidence=projectBusinessReconciliationEvidence(raw,{projectBusiness:projectBusinessReconciliation,projectFrame:projectReconciliationFrame,projectEvidenceFrame:projectReconciliationEvidenceFrame}),checked=evidence?.report??projectBusinessReconciliation(raw,projectReconciliationFrame);if(!checked||checked.month!==selected)throw Error('INVALID_RECONCILIATION');const receivedScope=projectBusinessMonthAuditScope({publication_revision:checked.source_revision,start_date:checked.start_date,end_date:checked.end_date,sources:checked.sources});if(receivedScope===null||JSON.stringify(receivedScope)!==selectedScopeKey)throw Error('RECONCILIATION_SCOPE_MISMATCH');value=checked;reviews=evidence?.reviews??[];cache.set(selected,{scopeKey:selectedScopeKey,value:checked,reviews});while(cache.size>12){const first=cache.keys().next().value;cache.delete(first);attempted.delete(first);}render();return true;}
   catch{if(current())showMessage(value?'Não foi possível atualizar a conferência agora. As evidências salvas e suas datas foram preservadas.':'A conferência ainda não pôde ser carregada. A coleta do servidor continua e tentaremos novamente.','Em conferência');return false;}
   finally{if(current()&&pending?.task===task)pending=null;}
  })();
  pending={month:selected,scopeKey:selectedScopeKey,task};return task;
 }
 function start(options){if(!el('')||typeof options?.api!=='function')return false;if(started&&api===options.api)return true;generation++;api=options.api;started=true;month='';scopeKey='';pending=null;value=null;reviews=[];cache.clear();attempted.clear();render();showMessage('Aguardando o resumo salvo do mês.');return true;}
 function stop(){started=false;generation++;api=null;pending=null;}
 function open(){const details=el('Details');if(!started||!details)return false;details.open=true;details.scrollIntoView?.({behavior:'smooth',block:'start'});el('Summary')?.focus?.({preventScroll:true});return true;}
 globalThis.brazaReconciliation={start,observe,stop,open};
})();
`;
