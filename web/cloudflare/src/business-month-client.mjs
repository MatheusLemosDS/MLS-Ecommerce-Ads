import {EXPENSE_LEDGER_CLIENT} from './expense-ledger-view.mjs';
import {ESCROW_RELEASES_CLIENT} from './escrow-releases-view.mjs';
import {BUSINESS_RECONCILIATION_CLIENT} from './business-reconciliation-view.mjs';
import {projectBusinessMonth} from './business-month.mjs';
import {projectBusinessMonthView,projectBusinessMonthAuditScope} from './business-month-view-state.mjs';
import {projectAdsCalendar} from './ads-calendar.mjs';
import {projectBusinessMonthProducts} from './business-month-products.mjs';
import {buildAccountDiagnosis} from './account-diagnosis.mjs';
import {buildBusinessCheckpoint} from './business-checkpoint.mjs';
import {buildMonthlyFinancialSummary} from './business-month-summary.mjs';
import {projectBusinessCostDiagnostics,projectBusinessCostDiagnosticsEvidence,projectBusinessCostDiagnosticsEvidenceV2} from './business-cost-diagnostics.mjs';
import {projectHistoricalCostPairDiagnostics,projectHistoricalCostPairDiagnosticsEvidence,deriveHistoricalCostComposition} from './historical-cost-evidence.mjs';
import {projectBackgroundCollectionDiagnostics} from './background-collection-diagnostics.mjs';
import {buildRecordedBusinessBalance,projectRecordedBusinessBalance} from './business-recorded-balance.mjs';

export const BUSINESS_MONTH_CLIENT=String.raw`
(()=>{
 ${projectAdsCalendar.toString()}
 ${projectBusinessMonthProducts.toString()}
 ${projectBusinessMonth.toString()}
 ${projectBusinessMonthAuditScope.toString()}
 ${projectBusinessMonthView.toString()}
 ${buildBusinessCheckpoint.toString()}
 ${buildAccountDiagnosis.toString()}
 ${buildMonthlyFinancialSummary.toString()}
 ${projectBusinessCostDiagnostics.toString()}
 ${projectBusinessCostDiagnosticsEvidence.toString()}
 ${projectBusinessCostDiagnosticsEvidenceV2.toString()}
 ${projectHistoricalCostPairDiagnosticsEvidence.toString()}
 ${deriveHistoricalCostComposition.toString()}
 ${projectBackgroundCollectionDiagnostics.toString()}
 ${projectHistoricalCostPairDiagnostics.toString()}
 ${projectRecordedBusinessBalance.toString()}
 ${buildRecordedBusinessBalance.toString()}
 const clientContract='business-month-v2';
 const el=id=>document.getElementById('businessMonth'+id);
 const node=(tag,text,cls)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(cls)value.className=cls;return value;};
 const pendingMessages={COLLECTING:'A consulta dos pedidos do mês ainda está em andamento.',PERIOD_LIMIT_REACHED:'A quantidade de pedidos ultrapassou o limite desta consulta. O mês permanece parcial.',SOURCE_UNAVAILABLE:'A Shopee não concluiu parte da leitura. Atualize o mês para retomar.',STATUS_REVIEW_REQUIRED:'Há pedidos em cancelamento ou com uma situação que ainda precisa ser conferida.',PAYMENT_INCOMPLETE:'A Shopee ainda não informou todos os valores financeiros dos pedidos pagos. Esses pedidos não são tratados como valor zero.',RETURNS_NOT_RECONCILED:'Há devoluções ou pedidos sem informação suficiente de devolução. Falta conciliar seus valores.',PRODUCTION_COST_INCOMPLETE:'Há produtos sem composição ou custo completo. A identificação automática preserva os vínculos já salvos.',INVOICE_TAX_UNAVAILABLE:'O valor do imposto ainda não está disponível para concluir o mês.',TAX_POLICY_REQUIRED:'O DAS-MEI deste ano ainda não está cadastrado. O imposto permanece pendente, sem usar 2% por nota.',FINANCIAL_SOURCE_STALE:'Os pedidos e repasses precisam de uma nova leitura. O resultado permanece em conferência até a atualização financeira.',ADS_UNAVAILABLE:'O gasto de anúncios ainda não foi confirmado para todos os dias do mês.',EXTERNAL_EXPENSES_REQUIRED:'Informe as outras despesas do mês ou escolha “Não tenho outras despesas”.',RECHARGE_TREATMENT_REQUIRED:'Confira se o ajuste financeiro corresponde a recarga de anúncios ou taxa de suporte.',ADJUSTMENT_UNAVAILABLE:'O ajuste financeiro de anúncios ou suporte ainda não foi informado por completo.',ARITHMETIC_UNSAFE:'Um valor excedeu o limite seguro de cálculo e não será apresentado como resultado.'};
 const money=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100):'Pendente';
 const ratio=value=>value===null||value===undefined?'Pendente':new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value))+'x';
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
 const validMonth=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&value>='2000-01'&&value<=today().slice(0,7);
 const monthName=value=>validMonth(value)?new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T12:00:00Z')):'mês selecionado';
 const sourceAge=value=>{if(!Number.isSafeInteger(value)||value<=0)return 'pendente';const minutes=Math.max(0,Math.floor((Date.now()-value*1000)/60000));return minutes<1?'há menos de 1 minuto':minutes<60?'há '+minutes+' minuto(s)':minutes<1440?'há '+Math.floor(minutes/60)+' hora(s)':'há '+Math.floor(minutes/1440)+' dia(s)';};
 let api=null,syncVariants=null,onCatalogChanged=null,frame=null,month='',generation=0,busy=false,adsBusy=false,saving=false,started=false,paused=false,dirty=false,editSequence=0,draftRevision=0,timer=null,message='',failed=false;
 let bootstrapPrepared=false,bootstrapCompleted=false,bootstrapPhase='LOADING',bootstrapRetry=null,bootstrapRetryPending=false;
 let productPage=1,productMonth='';
 let workspaceView=null,viewRequest=0,viewPromise=null,viewFailures=0,manualCollection=false,priorityPromise=null;
 const cronOwnsCollection=()=>workspaceView?.automatic.applicable===true&&workspaceView.automatic.enabled===true;
 const financeRefreshInterval=300000;
 let lastFinancialRefreshAt=0,automaticBlocked=false,resumeOnVisible=false,adsFailures=0,adsRetryAt=0;
 let collectionFailure=null,collectionRecovery=null;
 const productOpen=new Set();
 let catalogState=null,catalogBusy=false,catalogTimer=null,catalogRequest=0,catalogNeedsRead=true,catalogError='',catalogPaused=false,catalogProductsChanged=false,catalogVisibleIds=[],catalogSignature='';
 const catalogProducts=new Map();
 let costDiagnostic=null,costDiagnosticEvidence=null,costDiagnosticRaw='',costDiagnosticBusy=false,costDiagnosticRequest=0,costDiagnosticPromise=null;
 const catalogFeature=()=>Number.isSafeInteger(frame?.classification_revision);
 const catalogMessages={CATALOG_NOT_READ:'Aguardando a consulta automática do catálogo.',CATALOG_UNAVAILABLE:'A consulta falhou; a fila tentará este produto novamente.',CATALOG_REQUEST_FAILED:'A consulta falhou; os outros produtos continuam na fila.',UNRECOGNIZED_TYPE:'O tipo deste produto ainda não foi reconhecido com segurança.',SIZE_AMBIGUOUS:'O tamanho da variação precisa de conferência.',RULE_CONFLICT:'Mais de uma regra de custo corresponde a esta variação.',NO_COST_REGISTERED:'Falta cadastrar um custo para este tipo de produto.',RULE_NOT_MATCHED:'Nenhuma regra de custo reconhece este tipo e tamanho com segurança.',RULE_ASSIGNMENT_PENDING:'A regra de custo informada precisa de conferência de tamanho ou disponibilidade.',UNRECOGNIZED_VARIATION:'O catálogo não identificou o tipo e o tamanho desta variação com segurança.',INDEX_NOT_VALID:'A combinação de opções desta variação precisa ser conferida no catálogo.',NO_MODELS:'O catálogo não retornou variações para este produto.',CATALOG_CONFLICT:'Outra atualização está conferindo este produto; a fila continuará automaticamente.',CATALOG_STALE_RESPONSE:'Uma resposta antiga foi descartada. A fila consultará novamente.',AXES_NOT_RECOGNIZED:'Os eixos de variação não identificam a composição com segurança.',OPTION_NOT_RECOGNIZED:'O tamanho retornado pelo catálogo ainda não foi reconhecido.',CATALOG_INVALID:'Os dados do catálogo não passaram na conferência.',CATALOG_STALE:'A classificação salva está preservada enquanto o catálogo é atualizado.'};
 function catalogReason(reason,status){return catalogMessages[reason]||(status==='QUEUED'||status==='RUNNING'?'A identificação automática está na fila.':status==='RETRY_WAIT'?'A consulta será repetida automaticamente, sem impedir os outros produtos.':'O catálogo precisa de uma conferência de tipo ou tamanho.');}
 const costDiagnosticReasons={COST_AVAILABLE:'O custo já está disponível na versão atual.',NO_CATALOG:'O catálogo deste produto ainda não foi consultado.',MODEL_NOT_IN_CATALOG:'A variação vendida ainda não consta no catálogo salvo.',METADATA_CHANGED:'O produto mudou na Shopee e precisa de uma nova conferência.',RULE_DISABLED:'A regra de custo associada está desativada.',RULE_UNAVAILABLE:'A regra de custo associada não está disponível.',ASSIGNMENT_PENDING:'O tipo ou tamanho associado precisa de correção.',CONFLICT:'Há regras ou composições conflitantes.',OPTION_NOT_RECOGNIZED:'O tamanho do catálogo ainda não foi reconhecido.',AXES_NOT_RECOGNIZED:'As opções do produto não identificam a composição com segurança.',INDEX_NOT_VALID:'A combinação de opções precisa ser conferida.',NO_MODELS:'O catálogo não retornou as variações deste produto.',RULE_NOT_MATCHED:'Nenhuma regra de custo corresponde ao tipo e tamanho.',COMPOSITION_PENDING:'Falta identificar a composição e o custo deste produto.'};
 function costHistoryEvidence(itemId,variant){
  const history=costDiagnosticEvidence?.history;if(!history)return null;
  const pair=history.pairs.find(row=>row.item_id===itemId&&row.model_id===variant.model_id),entry=node('div',undefined,'month-detail-help');
  if(!pair){entry.append(node('p',history.truncation.truncated?'O histórico desta variação não foi incluído neste diagnóstico parcial.':'Não há evidência histórica incluída para esta variação.'));return entry;}
  const labels={NO_SCAN:'O histórico desta variação ainda não foi conferido.',SCANNING:'A conferência do histórico desta variação está em andamento.',NOT_FOUND:'Esta variação não apareceu no intervalo de pedidos já conferido.',NAME_MISSING:'O pedido antigo não contém todos os nomes necessários para identificar a composição.',CONFLICT:'Os nomes encontrados nos pedidos antigos divergem. O custo permanece pendente.',COMPOSITION_REJECTED:'Os nomes dos pedidos antigos não identificam uma composição aceita com segurança.',COST_CANDIDATES:'Foram encontrados tamanhos diferentes. O custo só pode ser aplicado automaticamente quando todas as opções têm o mesmo custo cadastrado, sem escolher um tamanho.',APPROVED:'A composição foi identificada pelos nomes dos pedidos antigos.'};
  const reasons={OBSERVATION_OUTSIDE_COMPLETED_SCAN:'Os nomes salvos vieram de outra conferência e ainda precisam ser verificados neste intervalo.',APPROVAL_PENDING:'A variação apareceu nos pedidos, mas falta concluir a conferência dos nomes.'};entry.append(node('p','Histórico · '+(reasons[pair.reason]||labels[pair.state])));
  if(Array.isArray(pair.item_names)&&Array.isArray(pair.model_names)){
   for(const [label,names] of [['Nomes do produto registrados',pair.item_names],['Nomes da variação registrados',pair.model_names]]){entry.append(node('p',label+':'));if(names.length){const alternatives=node('ul');for(const name of names)alternatives.append(node('li',name));entry.append(alternatives);}else entry.append(node('p','Não informado nos pedidos conferidos.'));}
   if(pair.resolution?.reason==='SEMANTIC_COMPOSITION_CONSENSUS')entry.append(node('p','As diferenças de escrita identificam a mesma composição. Os nomes originais foram preservados.'));
  }else if(pair.item_name||pair.model_name)entry.append(node('p',[pair.item_name,pair.model_name].filter(Boolean).join(' · ')));
  if(pair.approved&&variant.unit_cost_cents===null)entry.append(node('p','A evidência foi encontrada, mas o custo ainda depende das referências e regras atuais. Nenhum preço foi presumido.'));
  if(pair.scan){const scan=pair.scan;entry.append(node('p','Pedidos de '+scan.start_date+' a '+scan.end_date+' · '+scan.window_index+' de '+scan.windows_total+' intervalo(s) · '+scan.pages_read+' página(s) conferida(s).'+(scan.status==='RETRY_WAIT'?' Nova tentativa em até '+scan.retry_after_seconds+' segundo(s).':scan.running?' A leitura continuará automaticamente.':scan.status==='LIMIT_REACHED'?' A leitura atingiu o limite e permanece parcial.':'')+' Leitura: '+checkpointTime(scan.checked_at)+'.'));}
  return entry;
 }
 function costBackgroundEvidence(){
  const value=costDiagnosticEvidence?.background;if(!value)return null;
  const detail=node('details',undefined,'month-detail-help');detail.append(node('summary','Acompanhamento automático'));
  detail.append(node('p','A agenda prevê consultas a cada minuto durante a coleta e a cada cinco minutos após a conclusão. Os registros abaixo mostram tentativas locais; não confirmam os disparos da agenda externa.'));
  if(value.sync){const sync=value.sync,states={IDLE:'Aguardando próxima leitura',RUNNING:'Leitura em andamento',COMPLETE:'Última coleta concluída',PARTIAL:'Coleta parcial',LIMIT_REACHED:'Limite desta leitura atingido',ERROR:'Uma tentativa precisa ser repetida',PAUSED:'Coleta pausada'};detail.append(node('p','Mês da coleta automática: '+(sync.month||'não definido')+'. '+(sync.enabled?'Coleta automática ativa. ':'Coleta automática pausada. ')+(states[sync.status]||'Estado em conferência')+'. Última tentativa: '+checkpointTime(sync.last_attempt_at)+' · último avanço concluído: '+checkpointTime(sync.last_success_at)+' · próxima consulta prevista: '+checkpointTime(sync.next_run_at)+'.'));if(sync.lease_active)detail.append(node('p','Outra consulta possui uma reserva ativa até '+checkpointTime(sync.lease_expires_at)+'.'));}else detail.append(node('p','Não há estado local de coleta disponível para esta conferência.'));
  if(value.lane){const fronts={HISTORY:'nomes de pedidos antigos',CATALOG:'variações dos produtos',REGISTRY:'listagem de produtos',PRODUCTION:'produção',COSTS:'referências de custo'};detail.append(node('p','Próxima frente prevista: '+(value.lane.next_group==='FINANCE'?'financeiro':fronts[value.lane.next_auxiliary])+'.'+(value.lane.lease_active?' Uma consulta possui reserva ativa até '+checkpointTime(value.lane.lease_expires_at)+'.':'')));}
  if(value.cohort){const cohort=value.cohort;detail.append(node('p','Leitura atual iniciada em '+checkpointTime(cohort.app_created_at)+' · intervalo '+cohort.start_date+' a '+cohort.end_date+'. Primeira fonte financeira: '+checkpointTime(cohort.source_oldest_at)+' · última fonte: '+checkpointTime(cohort.source_latest_at)+'.'));
  }
  if(value.recent_finance_runs.length){const list=node('ul');for(const run of value.recent_finance_runs)list.append(node('li','Tentativa em '+checkpointTime(run.started_at)+' · '+(run.status==='COMPLETE'?'concluída':run.status==='RUNNING'?'em andamento':'em conferência')+' · '+run.finance_steps+' etapa(s) financeira(s) · '+run.ads_reads+' leitura(s) de anúncios · '+(run.pages_read===null?'':run.pages_read)+(run.pages_read===null?' páginas não informadas':' página(s)')+' · '+(run.orders_seen===null?'quantidade de pedidos não informada':run.orders_seen+' pedido(s) observados')+'.'));detail.append(list);}
  detail.append(node('p','Estado local conferido em '+checkpointTime(value.checked_at)+'.'));return detail;
 }
 function costDiagnosticHasDue(value){return value?.consistent===true&&value.products.some(product=>product.variants.some(variant=>variant.recoverable||['NO_CATALOG','MODEL_NOT_IN_CATALOG'].includes(variant.reason)));}
 function drawCostDiagnostic(){
  const value=costDiagnostic,target=el('CostDiagnosticBody');if(!value||value.month!==month){target.hidden=true;return;}target.hidden=false;const coverage=value.summary.production_coverage,out=[node('p',value.status==='COMPLETE'?coverage.pending_units+' unidade(s) sem custo · '+coverage.pending_variants+' variação(ões) · '+coverage.pending_products+' produto(s).':'Consulta mensal parcial · '+value.coverage.paid+' pedido(s) pagos já lidos · produção identificada '+money(value.totals.known_production_cost_cents)+'. As quantidades finais dependem da conclusão do período.','month-detail-help')];
  const counts=node('div',undefined,'month-cost-diagnostic-counts');for(const [key,label] of [['IN_CANCEL','Em cancelamento'],['TO_RETURN','Em devolução'],['UNKNOWN_STATUS','Situação desconhecida']])counts.append(node('span',label+': '+value.review_counts[key]));out.push(counts);
  if(!value.consistent)out.push(node('p','Os custos mudaram durante a conferência. As versões abaixo foram preservadas; recalcule novamente antes de concluir.','month-detail-help'));
  for(const product of value.products){const card=node('article',undefined,'month-cost-diagnostic-product');card.append(node('h4',product.product_name||'Produto #'+product.item_id),node('p','#'+product.item_id+' · catálogo: '+checkpointTime(product.catalog_checked_at)));const classification=product.classification,labels={QUEUED:'Na fila',RUNNING:'Em consulta',MATCHED:'Catálogo identificado',PARTIAL:'Identificação parcial',REVIEW:'Tipo ou tamanho em conferência',RETRY_WAIT:'Aguardando nova tentativa'};
   card.append(node('p',classification?labels[classification.status]+(classification.status==='RETRY_WAIT'?' · próxima tentativa: '+checkpointTime(classification.next_attempt_at):classification.status==='RUNNING'?' · aguarde a consulta em andamento.':''):'Aguardando a primeira consulta do catálogo.'));
   const groups=new Map();for(const variant of product.variants){if(!groups.has(variant.reason))groups.set(variant.reason,[]);groups.get(variant.reason).push(variant);}for(const [reason,variants] of groups){const quantity=variants.reduce((sum,row)=>sum+BigInt(row.quantity),0n),list=node('ul');card.append(node('p',new Intl.NumberFormat('pt-BR').format(quantity)+' unidade(s) · '+variants.length+' variação(ões) · '+costDiagnosticReasons[reason]));for(const variant of variants){const label=variant.model_name||'Variação #'+variant.model_id,attributes=variant.attributes.map(row=>row.name+': '+row.value).join(' · '),item=node('li',label+' · '+variant.quantity+' unidade(s)'+(attributes?' · '+attributes:'')+(variant.unit_cost_cents!==null?' · custo unitário '+money(variant.unit_cost_cents):''));if(variant.assignment)item.append(node('span',' · regra '+variant.assignment.rule_id+(variant.assignment.size?' · tamanho '+variant.assignment.size:'')));const history=costHistoryEvidence(product.item_id,variant);if(history)item.append(history);list.append(item);}card.append(list);}
   if(product.variants.some(variant=>variant.recoverable))card.append(node('p','Há dados de catálogo que podem ser consultados pela conferência automática.'));else if(value.consistent&&product.variants.some(variant=>['NO_CATALOG','MODEL_NOT_IN_CATALOG'].includes(variant.reason)))card.append(node('p','O histórico de pedidos pode confirmar esta variação sem repetir o catálogo em espera.'));else if(product.variants.some(variant=>variant.reason!=='COST_AVAILABLE')&&classification?.status!=='RUNNING'&&classification?.status!=='RETRY_WAIT')card.append(node('p','Confira o tipo, o tamanho ou o custo cadastrado. Repetir uma consulta não resolve uma composição ambígua.'));out.push(card);
  }
  const background=costBackgroundEvidence();if(background)out.push(background);
  if(!value.products.length)out.push(node('p',value.status==='COMPLETE'?'Não há produtos sem custo neste diagnóstico. As outras pendências do período continuam identificadas acima.':'Nenhum produto sem custo entre os itens já lidos. O mês permanece parcial enquanto a coleta continua.','month-detail-help'));
  const versionText=versions=>'custos v'+(versions.costs??'—')+' · regras v'+(versions.cost_rules??'—')+' · vínculos v'+(versions.bindings??'—')+' · catálogo v'+(versions.classifications??'—');out.push(node('p','Conferência: '+checkpointTime(value.diagnosed_at)+' · financeiro: '+checkpointTime(value.source_checked_at.finance_oldest_at)+' · anúncios: '+checkpointTime(value.source_checked_at.ads_at)+' · referências atuais: '+versionText(value.versions.current)+'.'+(value.consistent?'':' Referências do mês: '+versionText(value.versions.monthly)+'.'),'month-cost-diagnostic-sources'));
  if(value.truncation.truncated)out.push(node('p','Diagnóstico parcial: '+value.truncation.products_included+' de '+value.truncation.products_total+' produto(s) e '+value.truncation.variants_included+' de '+value.truncation.variants_total+' variação(ões) incluídos. Nenhuma ausência foi tratada como custo zero.','month-detail-help'));target.replaceChildren(...out);
 }
 function costDiagnosticControls(){const unavailable=!started||!frame||busy||adsBusy||saving||costDiagnosticBusy;el('CostCheck').disabled=unavailable;el('CostRecover').disabled=unavailable||!frame?.unmapped_variants.length;el('CostCopy').disabled=costDiagnosticBusy||!costDiagnosticRaw;el('CostRecover').textContent=costDiagnosticBusy?'Conferindo custos…':'Conferir custos automaticamente';}
 function resetCostDiagnostic({clear=false}={}){costDiagnosticRequest++;costDiagnosticBusy=false;costDiagnosticPromise=null;if(clear){costDiagnostic=null;costDiagnosticEvidence=null;costDiagnosticRaw='';el('CostDiagnosticBody').replaceChildren();el('CostDiagnosticBody').hidden=true;el('CostDiagnosticStatus').textContent='Confira todos os produtos sem custo e as situações dos pedidos em uma única consulta aos dados salvos.';}}
 function takeCostDiagnostic(raw,selected){
  const schema=Object.getOwnPropertyDescriptor(raw||{},'schema')?.value,evidence=schema==='business_cost_diagnostics_evidence_v2'?projectBusinessCostDiagnosticsEvidenceV2(raw,{projectDiagnostic:projectBusinessCostDiagnostics,projectHistory:value=>projectHistoricalCostPairDiagnosticsEvidence(value,{deriveComposition:deriveHistoricalCostComposition,projectLegacy:projectHistoricalCostPairDiagnostics}),projectBalance:projectRecordedBusinessBalance,projectBackground:projectBackgroundCollectionDiagnostics}):schema==='business_cost_diagnostics_evidence_v1'?projectBusinessCostDiagnosticsEvidence(raw,{projectDiagnostic:projectBusinessCostDiagnostics,projectHistory:projectHistoricalCostPairDiagnostics,projectBalance:projectRecordedBusinessBalance}):null,checked=evidence?evidence.diagnostic:projectBusinessCostDiagnostics(raw);
  if(!checked||checked.month!==selected)throw Error('COST_DIAGNOSTIC_INVALID');costDiagnostic=checked;costDiagnosticEvidence=evidence;costDiagnosticRaw=JSON.stringify(raw,null,2);drawCostDiagnostic();return checked;
 }
 function checkedCostRecovery(raw,selected){const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row)),exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value')),ids=rows=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=90&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,index)=>Object.getOwnPropertyDescriptor(rows,String(index))).every(d=>d&&Object.hasOwn(d,'value')&&typeof d.value==='string'&&/^[1-9][0-9]{0,19}$/.test(d.value))&&new Set(rows).size===rows.length;if(!exact(raw,['schema','month','diagnostic','work'])||raw.schema!=='business_cost_recovery_v1'||raw.month!==selected||!exact(raw.work,['status','processed','failed'])||!['PROGRESSED','IDLE','PAUSED','LEASED','RETRY_WAIT'].includes(raw.work.status)||!ids(raw.work.processed)||!ids(raw.work.failed)||raw.work.processed.some(id=>raw.work.failed.includes(id)))throw Error('COST_RECOVERY_INVALID');takeCostDiagnostic(raw.diagnostic,selected);return raw.work;}
 async function copyCostDiagnostic(){if(!costDiagnosticRaw)return false;const serialized=costDiagnosticRaw,selected=month,token=generation,current=()=>started&&month===selected&&token===generation&&serialized===costDiagnosticRaw;try{if(typeof globalThis.navigator?.clipboard?.writeText!=='function')throw Error();await globalThis.navigator.clipboard.writeText(serialized);if(current())el('CostDiagnosticStatus').textContent='Diagnóstico copiado. Ele contém somente a conferência retornada para este mês.';return true;}catch{if(current())el('CostDiagnosticStatus').textContent='Não foi possível copiar automaticamente. O diagnóstico continua disponível; tente novamente em uma conexão segura.';return false;}}
 function checkCostDiagnostic({recover=false}={}){
  if(costDiagnosticPromise)return costDiagnosticPromise;if(!started||!frame||busy||adsBusy||saving||!validMonth(month))return Promise.resolve(false);const token=generation,selected=month,requestId=++costDiagnosticRequest,start=Date.now(),current=()=>started&&token===generation&&selected===month&&requestId===costDiagnosticRequest;
  costDiagnosticBusy=true;catalogRequest++;catalogBusy=false;clearTimeout(catalogTimer);catalogTimer=null;clearTimeout(timer);timer=null;controls();el('CostDiagnosticStatus').textContent=recover?'Conferindo os custos salvos e as consultas necessárias…':'Conferindo todas as pendências nos dados salvos…';
  const task=(async()=>{let requests=0,lastStatus=null,localReadFailed=false;try{
   const raw=await api('finance/cost-diagnostics?month='+encodeURIComponent(selected)+'&evidence=history-v2');if(!current())return false;takeCostDiagnostic(raw,selected);
   if(recover){
    for(;requests<8&&Date.now()-start<120000&&!document.hidden;){
     if(!costDiagnosticHasDue(costDiagnostic))break;el('CostDiagnosticStatus').textContent='Conferindo custos automaticamente · etapa '+(requests+1)+' de até 8. Vínculos manuais são preservados.';
     const result=await api('finance/cost-recovery?evidence=history-v2',{month:selected},{timeoutMs:Math.max(1,Math.min(60000,120000-(Date.now()-start)))});requests++;if(!current())return false;const work=checkedCostRecovery(result,selected);lastStatus=work.status;if(work.status!=='PROGRESSED')break;
    }
    if(!current())return false;
    try{const updated=await request('read',selected);if(!current())return false;apply(updated,selected);catalogNeedsRead=true;}catch{if(!current())return false;localReadFailed=true;}
   }
   if(!current())return false;
   el('CostDiagnosticStatus').textContent=lastStatus==='PAUSED'?'A conferência automática está pausada nas configurações. Os custos salvos foram preservados.':lastStatus==='LEASED'?'Outra conferência está em andamento. Aguarde alguns segundos; os custos salvos foram preservados.':lastStatus==='RETRY_WAIT'?'Uma fonte precisa aguardar. Confira abaixo o horário da próxima tentativa.':localReadFailed?'O diagnóstico foi atualizado, mas o resumo mensal não pôde ser relido. Use Recalcular custos para conferir os novos totais.':recover&&document.hidden?'Conferência interrompida porque o painel ficou em segundo plano. Os avanços foram preservados.':recover&&(requests===8||Date.now()-start>=120000)&&costDiagnosticHasDue(costDiagnostic)?'Esta rodada atingiu o limite de conferências. Os avanços foram preservados e as pendências continuam identificadas abaixo.':recover?'Conferência concluída nesta tentativa. Veja os custos identificados e as pendências que ainda exigem conferência.':'Pendências conferidas nos dados salvos. Copie o diagnóstico para reunir todos os motivos em uma única mensagem.';return true;
  }catch{if(current())el('CostDiagnosticStatus').textContent='Não foi possível concluir esta conferência. Os valores, o diagnóstico anterior e seus rascunhos foram preservados; tente novamente.';return false;}finally{if(current()){costDiagnosticBusy=false;costDiagnosticPromise=null;controls();schedule();scheduleCatalog();}}})();costDiagnosticPromise=task;return task;
 }
 function checkedCatalogState(value){
  const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
  const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
  const array=(row,max)=>Array.isArray(row)&&Object.getPrototypeOf(row)===Array.prototype&&row.length<=max&&Reflect.ownKeys(row).length===row.length+1&&Array.from({length:row.length},(_,index)=>Object.getOwnPropertyDescriptor(row,String(index))).every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'));
  const int=(row,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
  const text=(row,max)=>typeof row==='string'&&row.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(row);
  const reason=row=>row===null||typeof row==='string'&&/^[A-Z][A-Z0-9_]{0,95}$/.test(row);
  const id=(row,zero=false)=>typeof row==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(row);
  const keys=['schema','revision','counts','products','limit','offset','more','next_due_at'];
  if(plain(value)&&Object.hasOwn(value,'enabled'))keys.push('enabled');
  if(plain(value)&&Object.hasOwn(value,'variants_limit_reached'))keys.push('variants_limit_reached');
  const counts=['total','queued','running','matched','partial','review','retry_wait','due'];
  if(!exact(value,keys)||value.schema!=='catalog_classification_state_v1'||!int(value.revision,1,2147483647)||!exact(value.counts,counts)||!counts.every(key=>int(value.counts[key],0,3000000))||value.counts.total!==counts.slice(1,-1).reduce((sum,key)=>sum+value.counts[key],0)||value.counts.due>value.counts.total||!array(value.products,100)||!int(value.limit,1,100)||!int(value.offset,0,3000000)||typeof value.more!=='boolean'||value.next_due_at!==null&&!int(value.next_due_at,0,9999999999)||Object.hasOwn(value,'enabled')&&typeof value.enabled!=='boolean'||Object.hasOwn(value,'variants_limit_reached')&&typeof value.variants_limit_reached!=='boolean')throw Error('CATALOG_STATE_INVALID');
  const seen=new Set();let variantCount=0;
  for(const product of value.products){
   if(!exact(product,['item_id','product_name','status','reason','checked_at','catalog_fingerprint','model_count','resolved_count','next_attempt_at','failure_count','variants','variants_complete'])||!id(product.item_id)||seen.has(product.item_id)||product.product_name!==null&&!text(product.product_name,1024)||!['QUEUED','RUNNING','MATCHED','PARTIAL','REVIEW','RETRY_WAIT'].includes(product.status)||!reason(product.reason)||product.checked_at!==null&&!int(product.checked_at,1,Math.floor(Date.now()/1000)+60)||product.catalog_fingerprint!==null&&(typeof product.catalog_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(product.catalog_fingerprint))||!int(product.model_count,0,1000)||!int(product.resolved_count,0,product.model_count)||product.next_attempt_at!==null&&!int(product.next_attempt_at,0,9999999999)||!int(product.failure_count,0,1000000)||!array(product.variants,1000)||typeof product.variants_complete!=='boolean')throw Error('CATALOG_STATE_INVALID');
   seen.add(product.item_id);variantCount+=product.variants.length;if(variantCount>1000)throw Error('CATALOG_STATE_INVALID');const models=new Set();
   for(const variant of product.variants){if(!exact(variant,['model_id','model_name','reason','attributes'])||!id(variant.model_id,true)||models.has(variant.model_id)||!text(variant.model_name,1024)||!reason(variant.reason)||!array(variant.attributes,10))throw Error('CATALOG_STATE_INVALID');models.add(variant.model_id);for(const attribute of variant.attributes)if(!exact(attribute,['name','value'])||!text(attribute.name,1024)||!text(attribute.value,1024))throw Error('CATALOG_STATE_INVALID');}
  }
  return value;
 }
 function checkedCatalogRun(value){
  const keys=['status','processed','failed','state'];if(!value||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'))||!['PAUSED','LEASED','PROGRESSED','IDLE'].includes(value.status))throw Error('CATALOG_STATE_INVALID');
  for(const key of ['processed','failed']){const rows=value[key];if(!Array.isArray(rows)||Object.getPrototypeOf(rows)!==Array.prototype||rows.length>3||Reflect.ownKeys(rows).length!==rows.length+1||!Array.from({length:rows.length},(_,index)=>Object.getOwnPropertyDescriptor(rows,String(index))).every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'))||!rows.every(id=>typeof id==='string'&&/^[1-9][0-9]{0,19}$/.test(id))||new Set(rows).size!==rows.length)throw Error('CATALOG_STATE_INVALID');}
  checkedCatalogState(value.state);return value;
 }
 function takeCatalogState(value,{metadataOnly=false}={}){const checked=checkedCatalogState(value);if(!metadataOnly){catalogState=checked;catalogPaused=checked.enabled===false;}else if(checked.enabled===false)catalogPaused=true;for(const product of checked.products)catalogProducts.set(product.item_id,product);while(catalogProducts.size>3000)catalogProducts.delete(catalogProducts.keys().next().value);catalogError='';}
 function drawCatalogStatus(){
  const target=el('CatalogStatus');target.hidden=!catalogFeature();if(target.hidden)return;
  if(catalogError){target.textContent=catalogError;return;}
  if(catalogPaused){target.textContent='Identificação automática pausada nas configurações da coleta. Os custos já cadastrados foram preservados.';return;}
  const remaining=frame?.unmapped_variants.length||0;
  if(catalogBusy)target.textContent='Identificando automaticamente tipos e tamanhos. Os outros produtos continuam na fila se uma consulta falhar.';
  else if(catalogState)target.textContent=remaining?remaining+' variação(ões) vendida(s) ainda sem custo completo. '+catalogState.counts.queued+' produto(s) na fila · '+catalogState.counts.running+' em consulta · '+catalogState.counts.retry_wait+' aguardando nova tentativa.':'Custos dos produtos vendidos identificados. O catálogo continua sendo conferido automaticamente.';
  else target.textContent='Consultando a identificação automática dos produtos vendidos…';
 }
 function canClassify(){return started&&catalogFeature()&&!document.hidden&&!busy&&!adsBusy&&!saving&&!dirty&&!paused&&!costDiagnosticBusy;}
 function scheduleCatalog(delay=0){
  clearTimeout(catalogTimer);catalogTimer=null;if(!canClassify()||catalogBusy)return;
  catalogTimer=setTimeout(()=>{catalogTimer=null;return updateCatalog();},Math.max(0,delay));
 }
 async function loadCatalogMetadata(token,selected){
  const globalState=await api('catalog-classification?limit=1&offset=0');if(token!==catalogRequest||selected!==month||!started)return false;takeCatalogState(globalState);
  const ids=[...new Set(catalogVisibleIds.length?catalogVisibleIds:(frame?.unmapped_variants||[]).map(row=>row.item_id))];
  const chunks=ids.length?Array.from({length:Math.ceil(ids.length/90)},(_,index)=>ids.slice(index*90,index*90+90)):[[]];
  for(const chunk of chunks){
   const raw=await api('catalog-classification?limit=100&offset=0'+(chunk.length?'&item_ids='+encodeURIComponent(chunk.join(',')):''));
   if(token!==catalogRequest||selected!==month||!started)return false;takeCatalogState(raw,{metadataOnly:true});
  }
  catalogNeedsRead=false;return true;
 }
 async function updateCatalog({process=true}={}){
  if(cronOwnsCollection())process=false;
  if(!canClassify()||catalogBusy)return false;
  const token=++catalogRequest,selected=month;catalogBusy=true;drawCatalogStatus();let delay=60000;
  try{
   if(catalogNeedsRead||!catalogState){if(!await loadCatalogMetadata(token,selected))return false;}
   if(token!==catalogRequest||selected!==month||!canClassify())return false;
   if(process&&!catalogPaused&&catalogState.counts.due>0){
    const response=await api('catalog-classification/sync',{});
    if(token!==catalogRequest||selected!==month||!started)return false;
    const raw=checkedCatalogRun(response);
    takeCatalogState(raw.state);catalogPaused=catalogPaused||raw.status==='PAUSED';catalogNeedsRead=raw.processed.length+raw.failed.length>0;if(raw.processed.length)catalogProductsChanged=true;if(!canClassify())return false;
    if(raw.processed.length){const reread=await request('read',selected);if(token!==catalogRequest||selected!==month||!started)return false;apply(reread,selected);if(token!==catalogRequest||selected!==month||!canClassify())return false;if(!await loadCatalogMetadata(token,selected))return false;}else if(raw.failed.length&&!await loadCatalogMetadata(token,selected))return false;
    delay=raw.status==='LEASED'?5000:(raw.processed.length+raw.failed.length)>0&&catalogState.counts.due>0?750:60000;
   }
   if(token!==catalogRequest||selected!==month||!canClassify())return false;
   if(catalogState.revision!==frame.classification_revision){const reread=await request('read',selected);if(token!==catalogRequest||selected!==month||!canClassify())return false;apply(reread,selected);}
   if(catalogProductsChanged&&typeof onCatalogChanged==='function'){try{await onCatalogChanged();catalogProductsChanged=false;}catch{}if(token!==catalogRequest||selected!==month||!canClassify())return false;}
   drawProducts();return true;
  }catch{if(token===catalogRequest&&selected===month){catalogError='A consulta do catálogo está indisponível agora. Os custos conhecidos foram preservados; a coleta automática continuará tentando.';catalogNeedsRead=true;}return false;}
  finally{if(token===catalogRequest&&selected===month){catalogBusy=false;drawCatalogStatus();if(catalogPaused)delay=300000;else if(catalogState?.counts.due===0&&catalogState.next_due_at!==null)delay=Math.max(60000,Math.min(300000,catalogState.next_due_at*1000-Date.now()));catalogNeedsRead=true;scheduleCatalog(delay);}}
 }
 async function syncCatalogCandidates(rows){
  if(!catalogFeature())return null;if(!Array.isArray(rows)||rows.length>3000)return false;
  const ids=[...new Set(rows.map(row=>row?.item_id).filter(value=>typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value)))];
  if(!ids.length)return true;
  try{const raw=await api('catalog-classification/enqueue',{item_ids:ids});takeCatalogState(raw);catalogNeedsRead=true;drawCatalogStatus();scheduleCatalog();return true;}
  catch{catalogError='A fila não pôde ser atualizada agora. Os custos e ajustes salvos foram preservados.';drawCatalogStatus();return false;}
 }
 let checkpointHistory=null,checkpointHistoryMonth='',checkpointHistoryBusy=false,checkpointHistoryError='',checkpointHistoryStale=false,checkpointHistoryRequest=0;
 const checkpointHistoryOpen=new Set();
 const checkpointVersions=report=>'Custos v'+report.versions.costs+' · vínculos v'+report.versions.bindings+' · regras '+(report.versions.cost_rules===null?'pendentes':'v'+report.versions.cost_rules)+' · '+(report.tax_regime==='MEI'?'DAS-MEI':'imposto anterior')+' '+(report.versions.tax_policy===null?'sem versão':'v'+report.versions.tax_policy)+' · despesas v'+report.versions.expenses+(Number.isSafeInteger(report.versions.classifications)?' · classificações v'+report.versions.classifications:'');
 const checkpointTime=value=>Number.isSafeInteger(value)&&value>0?new Date(value*1000).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Pendente';
 function invalidateCheckpointHistory(){
  checkpointHistoryRequest++;checkpointHistoryBusy=false;checkpointHistoryError='';
  checkpointHistoryStale=!!checkpointHistory;
  if(checkpointHistoryMonth!==month){checkpointHistory=null;checkpointHistoryMonth='';checkpointHistoryStale=false;checkpointHistoryOpen.clear();}
 }
 function drawCheckpoint(){
  const report=frame?buildBusinessCheckpoint(frame):null,target=el('CheckpointEvidence');target.replaceChildren();
  el('CheckpointStatus').textContent=!report?'Aguardando os dados do mês':report.status==='EXPECTED_READY'?'Previsão completa':'Previsão com pendências';
  if(report){
   const entries=[
    ['Resultado previsto',money(report.result.expected_net_cents)],
    ['Pedidos considerados',report.coverage.paid+' pago(s), dos quais '+report.coverage.completed+' concluído(s) e '+report.coverage.ongoing+' em andamento'],
    ['Pedidos excluídos',report.coverage.cancelled+' cancelado(s) e '+report.coverage.unpaid+' não pago(s)'],
    ['Situações em conferência',report.coverage.cancel_pending+' em cancelamento e '+(report.coverage.other+report.coverage.unknown)+' com situação não confirmada'],
    ['Cobertura dos valores financeiros',report.coverage.payment_covered+' de '+report.coverage.paid+' pedido(s) pago(s) · '+report.coverage.payment_missing+' com valores pendentes'],
    ['Devoluções a conferir',report.coverage.returns+' com devolução e '+report.coverage.returns_unknown+' sem informação suficiente'],
    ['Primeira leitura financeira usada',checkpointTime(report.source_checked_at.finance_oldest_at)],
    ['Última leitura financeira usada',checkpointTime(report.source_checked_at.finance_latest_at)],
    ['Gasto dos anúncios consultado em',checkpointTime(report.source_checked_at.ads_at)],
    ['Referências usadas',checkpointVersions(report)],
   ];
   for(const [label,value] of entries){const row=node('div');row.append(node('dt',label),node('dd',value));target.append(row);}
  }
  const list=el('CheckpointHistory');list.replaceChildren();
  el('CheckpointHistoryRefresh').disabled=!frame||checkpointHistoryBusy;
  el('CheckpointHistoryRefresh').textContent=checkpointHistoryBusy?'Consultando…':'Atualizar histórico';
  let historyState='O histórico é consultado quando você abre esta conferência.';
  if(checkpointHistoryBusy)historyState='Consultando os registros deste mês…';
  else if(checkpointHistoryError)historyState=checkpointHistoryError;
  else if(checkpointHistoryStale)historyState='Há uma nova leitura do resumo. Atualize o histórico para conferir os registros mais recentes.';
  else if(checkpointHistory)historyState='Últimas '+checkpointHistory.checkpoints.length+' versão(ões) registradas automaticamente. Até 128 versões são preservadas por mês.';
  el('CheckpointHistoryState').textContent=historyState;
  if(checkpointHistory&&checkpointHistoryMonth===month){
   if(!checkpointHistory.checkpoints.length)list.append(node('li','Ainda não há uma versão registrada para este mês.'));
   for(const entry of checkpointHistory.checkpoints){
    const saved=entry.checkpoint,item=node('li'),details=node('details',undefined,'month-checkpoint-version'),summary=node('summary'),amounts=node('dl',undefined,'month-checkpoint-evidence'),references=node('dl',undefined,'month-checkpoint-evidence');
    summary.append(node('strong','Versão '+entry.revision+' · '+checkpointTime(saved.checked_at)),node('span',saved.status==='EXPECTED_READY'?'Previsão: '+money(saved.result.expected_net_cents):'Previsão em conferência · valores pendentes'));
    const key=saved.month+':'+entry.revision;details.open=checkpointHistoryOpen.has(key);details.ontoggle=()=>{if(details.open)checkpointHistoryOpen.add(key);else checkpointHistoryOpen.delete(key);};
    const labels={EXPECTED_PAYOUT:'Repasse previsto',PRODUCTION:'Custo de produção',TAX:saved.tax_regime==='MEI'?'DAS-MEI mensal':'Imposto estimado',ADS_CONSUMPTION:'Gasto em anúncios',OTHER_EXPENSES:'Outras despesas',ADS_RECHARGE_RESTORE:'Recarga de anúncios reposta'};
    for(const line of saved.lines){const row=node('div'),sign=line.sign===-1?'− ':line.code==='ADS_RECHARGE_RESTORE'?'+ ':'';row.append(node('dt',labels[line.code]),node('dd',line.amount_cents===null?'Pendente':sign+money(line.amount_cents)));amounts.append(row);}
    const resultRow=node('div');resultRow.append(node('dt','Resultado previsto desta versão'),node('dd',money(saved.result.expected_net_cents)));amounts.append(resultRow);
    const evidence=[['Pedidos pagos',saved.coverage.paid+' · '+saved.coverage.completed+' concluído(s) e '+saved.coverage.ongoing+' em andamento'],['Pedidos excluídos',saved.coverage.cancelled+' cancelado(s) e '+saved.coverage.unpaid+' não pago(s)'],['Referências usadas',checkpointVersions(saved)],['Primeira leitura financeira usada',checkpointTime(saved.source_checked_at.finance_oldest_at)],['Última leitura financeira usada',checkpointTime(saved.source_checked_at.finance_latest_at)],['Anúncios consultados em',checkpointTime(saved.source_checked_at.ads_at)]];
    for(const [label,value] of evidence){const row=node('div');row.append(node('dt',label),node('dd',value));references.append(row);}
    details.append(summary,node('p','Valores registrados nesta versão. As deduções da Shopee já estão incluídas no repasse.','month-detail-help'),amounts,references);
    if(saved.pending.length){const pending=node('ul',undefined,'month-checkpoint-version-pending');for(const code of saved.pending)pending.append(node('li',pendingMessages[code]));details.append(pending);}
    else details.append(node('p','Previsão completa com as informações disponíveis nessa leitura. Recebimentos e reembolsos não conciliados.','month-detail-help'));
    item.append(details);list.append(item);
   }
  }
 }
 function checkedCheckpointHistory(value,selected){
  const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
  const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
  const array=(row,max)=>Array.isArray(row)&&Object.getPrototypeOf(row)===Array.prototype&&row.length<=max&&Reflect.ownKeys(row).length===row.length+1&&Array.from({length:row.length},(_,index)=>Object.getOwnPropertyDescriptor(row,String(index))).every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'));
  const int=(row,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
  const amount=(row,signed=false)=>row===null||int(row,signed?Number.MIN_SAFE_INTEGER:0);
  const day=row=>typeof row==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row)&&Number.isFinite(Date.parse(row+'T00:00:00Z'))&&new Date(row+'T00:00:00Z').toISOString().slice(0,10)===row;
  const coverageKeys=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
  const lineCodes=['EXPECTED_PAYOUT','PRODUCTION','TAX','ADS_CONSUMPTION','OTHER_EXPENSES','ADS_RECHARGE_RESTORE'];
  if(!exact(value,['schema','month','retention_limit','checkpoints'])||value.schema!=='business_checkpoint_history_v1'||value.month!==selected||value.retention_limit!==128||!array(value.checkpoints,10))throw Error();
  let previous=Infinity;
  for(const entry of value.checkpoints){
   if(!exact(entry,['revision','fingerprint','checkpoint'])||!int(entry.revision,1,2147483647)||entry.revision>=previous||typeof entry.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(entry.fingerprint))throw Error();
   const report=entry.checkpoint;
   if(!exact(report,['schema','month','start_date','end_date','checked_at','status','coverage','pending','result','lines','sales_cents','versions','source_checked_at','tax_regime','recharge_treatment'])||report.schema!=='business_checkpoint_v1'||report.month!==selected||report.start_date!==selected+'-01'||!day(report.start_date)||!day(report.end_date)||report.end_date.slice(0,7)!==selected||!int(report.checked_at,1,Math.floor(Date.now()/1000)+60)||!['EXPECTED_READY','PENDING'].includes(report.status))throw Error();
   const checkedDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(report.checked_at*1000)),c=report.coverage;
   if(report.end_date>checkedDay||!exact(c,coverageKeys)||!coverageKeys.every(key=>int(c[key],0,3000))||c.orders!==c.paid+c.cancelled+c.cancel_pending+c.unpaid+c.other+c.unknown||c.paid!==c.completed+c.ongoing||c.payment_covered+c.payment_missing!==c.paid||c.returns+c.returns_unknown>c.paid)throw Error();
   if(!array(report.pending,Object.keys(pendingMessages).length)||!report.pending.every(code=>typeof code==='string'&&Object.hasOwn(pendingMessages,code))||new Set(report.pending).size!==report.pending.length||!exact(report.result,['expected_net_cents','realized_net_cents','realization'])||!amount(report.result.expected_net_cents,true)||report.result.realized_net_cents!==null||report.result.realization!=='UNVERIFIED'||!amount(report.sales_cents)||!array(report.lines,6)||report.lines.length!==6)throw Error();
   for(let index=0;index<6;index++){const line=report.lines[index];if(!exact(line,['code','sign','amount_cents'])||line.code!==lineCodes[index]||line.sign!==(index===0||index===5?1:-1)||!amount(line.amount_cents,index===0))throw Error();}
   const versions=report.versions,sources=report.source_checked_at;
   if(!exact(versions,['bindings','costs','cost_rules','tax_policy','expenses',...(Object.hasOwn(versions,'classifications')?['classifications']:[])])||Object.hasOwn(versions,'classifications')&&!int(versions.classifications,1,2147483647)||!int(versions.bindings,1,2147483647)||!int(versions.costs,1,2147483647)||versions.cost_rules!==null&&!int(versions.cost_rules,1,2147483646)||versions.tax_policy!==null&&!int(versions.tax_policy,0,2147483647)||!int(versions.expenses,0,2147483646)||!exact(sources,['finance_oldest_at','finance_latest_at','ads_at'])||!Object.values(sources).every(at=>at===null||int(at,1,report.checked_at))||(sources.finance_oldest_at===null)!==(sources.finance_latest_at===null)||sources.finance_oldest_at!==null&&sources.finance_oldest_at>sources.finance_latest_at)throw Error();
   if(!['MEI','LEGACY_ESTIMATE'].includes(report.tax_regime)||!['UNCONFIRMED','ADS_RECHARGE','TECH_SUPPORT'].includes(report.recharge_treatment)||report.tax_regime==='MEI'&&versions.tax_policy===null||report.tax_regime==='LEGACY_ESTIMATE'&&versions.tax_policy!==null||report.recharge_treatment!=='ADS_RECHARGE'&&report.lines[5].amount_cents!==null&&report.lines[5].amount_cents!==0)throw Error();
   const has=code=>report.pending.includes(code);
   if(c.cancel_pending+c.other+c.unknown>0&&!has('STATUS_REVIEW_REQUIRED')||c.payment_missing>0&&!has('PAYMENT_INCOMPLETE')||c.returns+c.returns_unknown>0&&!has('RETURNS_NOT_RECONCILED')||report.lines[1].amount_cents===null&&!has('PRODUCTION_COST_INCOMPLETE')||report.lines[2].amount_cents===null&&!has('INVOICE_TAX_UNAVAILABLE')||report.lines[3].amount_cents===null&&!has('ADS_UNAVAILABLE')||report.lines[4].amount_cents===null&&!has('EXTERNAL_EXPENSES_REQUIRED')||report.lines[5].amount_cents===null&&!has('ADJUSTMENT_UNAVAILABLE')&&!has('RECHARGE_TREATMENT_REQUIRED')||report.tax_regime==='MEI'&&versions.tax_policy===0&&!has('TAX_POLICY_REQUIRED'))throw Error();
   const stale=report.month===checkedDay.slice(0,7)&&sources.finance_oldest_at!==null&&report.checked_at-sources.finance_oldest_at>900;
   const ready=report.result.expected_net_cents!==null;
   if(stale!==has('FINANCIAL_SOURCE_STALE')||(report.status==='EXPECTED_READY')!==ready||ready&&(report.pending.length||report.sales_cents===null||report.lines.some(line=>line.amount_cents===null))||!ready&&!report.pending.length)throw Error();
   if(ready&&report.lines.reduce((total,line)=>total+BigInt(line.sign)*BigInt(line.amount_cents),0n)!==BigInt(report.result.expected_net_cents))throw Error();
   previous=entry.revision;
  }
  return value;
 }
 async function loadCheckpointHistory(){
  if(!started||!api||!frame||!el('CheckpointDetails').open||checkpointHistoryBusy)return false;
  if(checkpointHistory&&!checkpointHistoryStale&&checkpointHistoryMonth===month)return true;
  const selected=month,token=++checkpointHistoryRequest;checkpointHistoryBusy=true;checkpointHistoryError='';drawCheckpoint();
  try{
   const raw=await api('finance/checkpoints?month='+encodeURIComponent(selected)+'&limit=10');
   if(token!==checkpointHistoryRequest||selected!==month||!started)return false;
   checkpointHistory=checkedCheckpointHistory(raw,selected);checkpointHistoryMonth=selected;checkpointHistoryStale=false;return true;
  }catch{
   if(token===checkpointHistoryRequest&&selected===month)checkpointHistoryError='Não foi possível conferir o histórico. Os valores do resumo foram preservados; tente atualizar o histórico novamente.';
   return false;
  }finally{if(token===checkpointHistoryRequest&&selected===month){checkpointHistoryBusy=false;drawCheckpoint();}}
 }
 function setMetric(key,value,help){const target=el(key),card=el(key+'Card');target.textContent=value===null?'Pendente':value;card.dataset.status=value===null?'pending':'available';el(key+'Help').textContent=help;}
 function collectionDiagnostic(operation,error){
  const field=key=>{try{return Object.getOwnPropertyDescriptor(error||{},key)?.value;}catch{return undefined;}};
  const sourceCode=field('code'),sourceApiCode=field('apiCode'),sourceStatus=field('status');
  const transportCodes=['ADMIN_API_NETWORK_ERROR','ADMIN_API_TIMEOUT','ADMIN_API_HTTP_ERROR','ADMIN_API_RESPONSE_INVALID','ADMIN_API_CONFIGURATION','ADMIN_API_REQUEST_INVALID','BUSINESS_MONTH_SOURCE_UNAVAILABLE'];
  return {client_contract:clientContract,operation:['start','step','read','ads'].includes(operation)?operation:'read',code:transportCodes.includes(sourceCode)?sourceCode:'BUSINESS_MONTH_REQUEST_FAILED',api_code:typeof sourceApiCode==='string'&&/^BUSINESS_MONTH_[A-Z0-9_]{1,64}$/.test(sourceApiCode)?sourceApiCode:null,http:Number.isInteger(sourceStatus)&&sourceStatus>=100&&sourceStatus<=599?sourceStatus:null};
 }
 function status(text,error=false){
  message=text;failed=error;const target=el('Status');target.replaceChildren();target.textContent=text;target.dataset.status=error?'error':'normal';
  if(!collectionFailure)return;
  const report=node('span',undefined,'month-detail-help'),serialized=JSON.stringify(collectionFailure,null,2),code=node('code',serialized),copy=node('button','Copiar diagnóstico','button-link');
  report.setAttribute('style','display:block;overflow-wrap:anywhere');code.setAttribute('style','white-space:pre-wrap;overflow-wrap:anywhere');copy.type='button';
  copy.onclick=async()=>{try{if(typeof globalThis.navigator?.clipboard?.writeText!=='function')throw Error();await globalThis.navigator.clipboard.writeText(serialized);copy.textContent='Diagnóstico copiado';}catch{copy.textContent='Selecione e copie o diagnóstico';}};
  report.append(node('span','Diagnóstico da coleta: '),code,copy);target.append(report);
 }
 function paintBootstrap(){
  if(started||bootstrapCompleted||!el('Select'))return false;
  const failure=bootstrapPhase==='FAILED';
  el('Select').disabled=true;el('Previous').disabled=true;el('Pause').hidden=true;
  el('Refresh').disabled=!failure||bootstrapRetryPending;el('Refresh').textContent=failure?'Tentar novamente':'Conectando…';
  status(failure?'Não foi possível conectar ao painel. Verifique a conexão e tente novamente.':bootstrapPhase==='RETRYING'?'Tentando conectar ao painel novamente…':'Conectando ao painel da loja…',failure);
  return true;
 }
 async function retryBootstrap(){
  if(started||bootstrapPhase!=='FAILED'||bootstrapRetryPending||typeof bootstrapRetry!=='function')return false;
  bootstrapRetryPending=true;bootstrapPhase='RETRYING';paintBootstrap();
  try{const result=await bootstrapRetry();if(result===false&&!started)bootstrapPhase='FAILED';return result;}
  catch{if(!started)bootstrapPhase='FAILED';return false;}
  finally{bootstrapRetryPending=false;if(!started)paintBootstrap();}
 }
 function prepare(options={}){
  if(started||bootstrapCompleted||!el('Select'))return false;
  if(typeof options.retry==='function')bootstrapRetry=options.retry;
  let selected;try{const params=new URLSearchParams(globalThis.location?.search||'');selected=params.getAll('month').length===1?params.get('month'):null;}catch{}
  const control=el('Select');control.max=today().slice(0,7);control.value=validMonth(selected)?selected:bootstrapPrepared&&validMonth(control.value)?control.value:today().slice(0,7);
  bootstrapPrepared=true;if(!frame)render();
  el('Refresh').onclick=retryBootstrap;paintBootstrap();return true;
 }
 function bootstrapState(options={}){
  if(started||bootstrapCompleted||!['LOADING','RETRYING','FAILED','READY'].includes(options.phase))return false;
  if(!bootstrapPrepared&&!prepare())return false;
  // The caller's error text may contain a browser/provider failure or private
  // details. Only the known phase selects the user-facing Portuguese message.
  bootstrapPhase=options.phase;return paintBootstrap();
 }
 function controls(){
  if(bootstrapPrepared&&!bootstrapCompleted&&!started){paintBootstrap();return;}
  el('Refresh').disabled=busy||adsBusy||saving;el('Refresh').textContent=busy?'Consultando…':collectionRecovery?.waiting&&!paused?'Atualizar agora':paused||frame?.status==='RUNNING'?'Continuar consulta':frame?.status==='COMPLETE'?'Recalcular custos':'Atualizar mês';el('SourceRefresh').disabled=busy||adsBusy||saving;el('SourceRefresh').textContent='Atualizar vendas';el('Pause').hidden=!busy&&!collectionRecovery?.waiting;el('Pause').disabled=paused;el('Previous').disabled=saving;el('Select').disabled=saving;
  const conflict=!!frame&&dirty&&draftRevision!==frame.expenses.revision;
  el('ExpensesSave').disabled=!frame||busy||adsBusy||saving||conflict;
  el('ExpensesZero').disabled=!frame||busy||adsBusy||saving||conflict;
  el('ExpensesReload').hidden=!dirty;
  el('Identify').disabled=busy||adsBusy||saving;
  if(!manualCollection){el('Pause').hidden=true;el('Refresh').textContent=busy?'Conferindo…':'Recalcular custos';el('SourceRefresh').disabled=busy||adsBusy||saving||!!priorityPromise;}
  costDiagnosticControls();
 }
 function balanceLabel(summary){return summary?.state==='PARTIAL_COSTS'?'Saldo com custos identificados':summary?.state==='PROVISIONAL'?'Resultado líquido previsto · em conferência':'Resultado líquido previsto';}
 function summaryCount(value,singular,plural){return new Intl.NumberFormat('pt-BR').format(value)+' '+(value===1?singular:plural);}
 function missingProductionText(summary){const coverage=summary?.production_coverage;if(coverage?.pending_units>0)return 'Ainda falta descontar a produção de '+summaryCount(coverage.pending_units,'unidade','unidades')+', em '+summaryCount(coverage.pending_variants,'variação','variações')+' de '+summaryCount(coverage.pending_products,'produto','produtos')+'.';return 'Ainda há custos de produção pendentes. Eles não foram tratados como zero.';}
 function summaryBalanceHelp(summary){
  if(!summary)return 'Os valores faltantes estão identificados abaixo.';
  const mei=frame?.tax?.regime==='MEI',deductions='Produção, '+(mei?'DAS-MEI mensal':'imposto')+', anúncios e outras despesas já descontados.';
  if(summary.state==='READY')return deductions+' É uma previsão, não o valor recebido em banco.';
  const reviewed=frame?frame.coverage.cancel_pending+frame.coverage.other+frame.coverage.unknown:0,returned=frame?frame.coverage.returns+frame.coverage.returns_unknown:0;
  const review=summary.pending.includes('STATUS_REVIEW_REQUIRED')?' '+(reviewed>0?summaryCount(reviewed,'pedido com situação em revisão está excluído','pedidos com situação em revisão estão excluídos')+' dos valores dos pedidos pagos.':'Há situações de pedidos em revisão; a previsão considera somente os pedidos pagos identificados.'):'';
  const returns=summary.pending.includes('RETURNS_NOT_RECONCILED')?' '+(returned>0?summaryCount(returned,'devolução ainda precisa','devoluções ainda precisam'):'Devoluções e reembolsos ainda precisam')+' de conciliação. O valor pode mudar após reembolsos e ajustes.':'';
  const stale=summary.pending.includes('FINANCIAL_SOURCE_STALE')?' Saldo da última leitura financeira, consultada '+sourceAge(frame?.source_checked_at?.finance_oldest_at??frame?.checked_at)+'.':'';
  if(summary.state==='PARTIAL_COSTS')return 'Repasse após os custos identificados, '+(mei?'DAS-MEI mensal':'imposto')+', anúncios e outras despesas. '+missingProductionText(summary)+' O saldo pode diminuir; não é lucro líquido final.'+review+returns+stale;
  if(summary.state==='PROVISIONAL')return deductions+review+returns+' Este resultado previsto não é lucro líquido final nem recebimento confirmado.'+stale;
  const blockers=['COLLECTING','PERIOD_LIMIT_REACHED','PAYMENT_INCOMPLETE','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','ADS_UNAVAILABLE','INVOICE_TAX_UNAVAILABLE','TAX_POLICY_REQUIRED','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE'];
  const reasons=summary.pending.filter(code=>blockers.includes(code)).slice(0,2).map(code=>pendingMessages[code]);return reasons.length?reasons.join(' '):'Os valores faltantes estão identificados abaixo. Custos conhecidos não representam o total de todos os custos.';
 }
 function drawCostOverview(summary){
  const target=el('CostOverview');target.replaceChildren();target.hidden=!frame||!summary;if(target.hidden)return;
  const item=(label,value,help)=>{const entry=node('article',undefined,'month-cost-overview-item');entry.append(node('small',label),node('strong',value),node('p',help,'month-detail-help'));target.append(entry);};
  const coverage=summary.production_coverage,recorded=buildRecordedBusinessBalance(frame);
  if(summary.balance_cents===null&&recorded.status==='AVAILABLE'){
   const exclusions=[];if(recorded.pending_production_units>0)exclusions.push('Falta descontar a produção de '+recorded.pending_production_units+' unidade(s).');if(recorded.review_orders>0)exclusions.push(recorded.review_orders+' pedido(s) com situação em revisão.');if(recorded.returns_orders>0)exclusions.push(recorded.returns_orders+' devolução(ões) ainda sem conciliação.');if(recorded.pending.includes('FINANCIAL_SOURCE_STALE'))exclusions.push('A leitura financeira precisa de atualização.');
   item('Subtotal com custos identificados',money(recorded.amount_cents),'Repasse menos produção identificada, DAS-MEI, anúncios e despesas salvas, com recarga de anúncios reposta quando confirmada. '+exclusions.join(' ')+' Não é lucro final nem confirma recebimento. Financeiro: '+checkpointTime(recorded.source_checked_at.finance_oldest_at)+'.');
  }
  item(summary.production_complete?'Produção total do mês':'Produção com custo identificado',money(summary.known_production_cents),summary.production_complete?'Custo cadastrado aplicado às unidades vendidas, incluindo os pedidos com vários produtos.':missingProductionText(summary)+' A produção total permanece pendente.');
  item(summary.production_complete?'Custos após o repasse':'Custos identificados após o repasse',money(summary.costs_after_payout_cents),'Produção '+(summary.production_complete?'total':'identificada')+', '+(frame.tax?.regime==='MEI'?'DAS-MEI':'imposto')+', anúncios e outras despesas. '+(summary.costs_after_payout_cents===null?'Algum valor ainda não foi confirmado.':'As deduções já incluídas no repasse da Shopee não são cobradas novamente.'));
  const counted=coverage.total_units!==null&&coverage.known_units!==null;
  item('Cobertura do custo de produção',counted?coverage.total_units===0?'Sem unidades vendidas':new Intl.NumberFormat('pt-BR').format(coverage.known_units)+' de '+new Intl.NumberFormat('pt-BR').format(coverage.total_units)+' unidades':'Quantidade ainda não disponível',coverage.pending_units>0?summaryCount(coverage.pending_units,'unidade','unidades')+' sem custo · '+summaryCount(coverage.pending_variants,'variação','variações')+' · '+summaryCount(coverage.pending_products,'produto','produtos')+'.':counted?'Todas as unidades deste recorte têm custo identificado.':'A quantidade depende do detalhamento validado dos produtos; ela não é calculada pela quantidade de pedidos.');
 }
 function drawWaterfall(summary=frame?buildMonthlyFinancialSummary(frame):null){
  const target=el('Waterfall');target.replaceChildren();if(!frame)return;
  const row=(label,amount,sign='')=>{const entry=node('div',undefined,'month-waterfall-row');entry.append(node('dt',label),node('dd',amount===null?'Pendente':sign+money(amount)));target.append(entry);};
  const mei=frame.tax?.regime==='MEI';
  row('Vendas dos produtos',frame.sales_cents);
  const difference=Number.isSafeInteger(frame.sales_cents)&&Number.isSafeInteger(frame.expected_repass_cents)?BigInt(frame.sales_cents)-BigInt(frame.expected_repass_cents):null;
  const adjustment=difference!==null&&difference>=BigInt(Number.MIN_SAFE_INTEGER)&&difference<=BigInt(Number.MAX_SAFE_INTEGER)?Number(difference):null;
  row('Diferença líquida entre vendas e repasse',adjustment);
  row('Repasse previsto · deduções da Shopee já consideradas',frame.expected_repass_cents);
  row(summary?.production_complete?'Produção total':'Produção com custo identificado',summary?.known_production_cents??null,'− ');row(mei?'DAS-MEI mensal · uma vez no mês':'Imposto previsto · 2%',frame.invoice_tax_cents,'− ');
  if(frame.ads_adjustment_cents>0){
   if(frame.expenses.recharge_treatment==='ADS_RECHARGE')row('Recarga de anúncios reposta',frame.ads_adjustment_cents,'+ ');
   else if(frame.expenses.recharge_treatment==='UNCONFIRMED')row('Recarga ou suporte · tratamento a conferir',null);
  }
  row('Gasto com anúncios',frame.ads?.status==='AVAILABLE'?frame.ads.expense_cents:null,'− ');
  row('Outras despesas do mês',frame.expenses.external_expenses_cents,'− ');
  row(balanceLabel(summary),summary?.balance_cents??null);
  el('CalculationHelp').textContent=summary?.state==='PARTIAL_COSTS'||summary?.state==='PROVISIONAL'?summaryBalanceHelp(summary):'A previsão usa os custos de produção atuais. Recebimentos bancários ainda não estão conciliados.';
 }
 function drawTaxAndExpenses(summary=frame?buildMonthlyFinancialSummary(frame):null){
  const mei=frame?.tax?.regime==='MEI';
  el('TotalExpensesLabel').textContent=summary&&!summary.production_complete?'Custos identificados após o repasse':'Custos após o repasse';
  el('TotalExpensesHelp').textContent='Produção'+(summary&&!summary.production_complete?' identificada':'')+', '+(mei?'DAS-MEI mensal':'imposto')+', anúncios e outras despesas. '+(summary&&!summary.production_complete?'O custo de produção pendente ainda não está neste total. ':'')+'A diferença entre vendas e repasse pode incluir taxas, frete e outros ajustes da Shopee; ela já está considerada no repasse e não é descontada novamente.';
  el('TotalExpenses').textContent=money(summary?.costs_after_payout_cents??null);
  if(!frame){el('TaxSummary').textContent='Consultando a regra fiscal';el('TaxHelp').textContent='O imposto aparece quando a regra fiscal do mês puder ser conferida.';return;}
  if(mei){
   const tax=frame.tax,declared=tax.status==='DECLARED'&&Number.isSafeInteger(tax.tax_cents);
   el('TaxSummary').textContent=declared?'DAS-MEI · '+money(tax.tax_cents)+' por mês · '+tax.year+' · automático':'DAS-MEI pendente para '+tax.year;
   el('TaxHelp').textContent=declared?'Valor mensal informado por você, versão '+tax.policy_revision+'. Descontado uma única vez na competência do mês, mesmo sem vendas. Não é multiplicado pelas notas ou pelos pedidos e não é rateado entre os produtos.':'Falta o valor mensal do DAS-MEI deste ano. O sistema não substitui esse valor por 2% de cada nota nem assume imposto zero.';
  }else{
   el('TaxSummary').textContent='Regra anterior · estimativa de 2% sobre os produtos';
   el('TaxHelp').textContent='Esta leitura usa a regra fiscal anterior registrada no mês. Ela não representa o DAS-MEI mensal. Atualize o mês para conferir a regra atual.';
  }
 }
 function drawReadiness(){
  const target=el('Readiness');target.replaceChildren();if(!frame)return;
  const c=frame.coverage,complete=frame.status==='COMPLETE';
  for(const [label,ready] of [['Pedidos e valores financeiros',complete&&c.payment_missing===0&&c.cancel_pending===0&&c.other===0&&c.unknown===0&&!frame.result.pending.includes('FINANCIAL_SOURCE_STALE')],['Custos de produção',complete&&frame.production_cost_cents!==null],[frame.tax?.regime==='MEI'?'DAS-MEI mensal':'Imposto de 2%',complete&&frame.invoice_tax_cents!==null&&!frame.result.pending.includes('TAX_POLICY_REQUIRED')],['Gasto dos anúncios',frame.ads?.status==='AVAILABLE'&&!frame.result.pending.includes('ADS_UNAVAILABLE')],['Outras despesas',frame.expenses.external_expenses_cents!==null],['Devoluções e ajustes',complete&&c.returns===0&&c.returns_unknown===0&&!frame.result.pending.includes('ADJUSTMENT_UNAVAILABLE')&&!frame.result.pending.includes('RECHARGE_TREATMENT_REQUIRED')]]){
   const item=node('li');item.dataset.ready=String(!!ready);item.append(node('span',label),node('strong',ready?'Conferido':'Pendente'));target.append(item);
  }
  el('ReadinessStatus').textContent=frame.result.net_estimate_cents===null?'Complete as pendências para comparar a previsão de lucro do mês.':frame.result.net_estimate_cents<=0?'A previsão do mês ainda não tem lucro positivo. Confira custos e desempenho antes de aumentar o investimento.':'A previsão financeira do mês está completa. Próximo passo: conferir margem por produto, estoque e campanhas antes de escalar.';
 }
 function fillExpenses({force=false}={}){
  if(!frame)return;if(dirty&&!force)return;
  const saved=frame.expenses;el('ExpensesValue').value=saved.external_expenses_cents===null?'':(saved.external_expenses_cents/100).toFixed(2);el('Recharge').value=saved.recharge_treatment;draftRevision=saved.revision;dirty=false;
 }
 function drawProducts(){
  const target=el('ProductRows'),report=frame?.product_summary,mei=frame?.tax?.regime==='MEI';
  drawCatalogStatus();const periodCodes=frame?.result.pending.filter(code=>['STATUS_REVIEW_REQUIRED','SOURCE_UNAVAILABLE','FINANCIAL_SOURCE_STALE'].includes(code))||[];el('ProductPeriodNotice').hidden=!periodCodes.length;el('ProductPeriodNotice').textContent=periodCodes.length?'Avisos do período: '+periodCodes.map(code=>pendingMessages[code]).join(' ')+' Os subtotais abaixo cobrem somente os pedidos já conferidos de cada produto.':'';
  el('ProductBalanceHeading').textContent=mei?'Saldo após produção':'Saldo após produção e imposto';
  el('ProductTaxHelp').textContent=mei?'O saldo por produto usa o repasse da Shopee, menos produção dos pedidos exclusivos. O DAS-MEI é mensal e está descontado uma única vez no resultado geral, sem rateio por produto. Anúncios e outras despesas ainda não foram conciliados por produto. Este saldo não é lucro líquido por produto.':'O saldo por produto usa o repasse da Shopee, menos produção e imposto de 2% dos pedidos exclusivos. Anúncios e outras despesas ainda não foram conciliados por produto. Este saldo não é lucro líquido por produto.';
  if(month!==productMonth){productMonth=month;productPage=1;productOpen.clear();el('ProductSearch').value='';el('ProductFilter').value='all';el('ProductSort').value='quantity_desc';el('ProductPageSize').value='20';}
  target.replaceChildren();
  for(const name of ['ProductSearch','ProductFilter','ProductSort','ProductPageSize'])el(name).disabled=!report;
  el('ProductPrevious').disabled=true;el('ProductNext').disabled=true;
  if(!report){
   const text=!frame||frame.status!=='COMPLETE'?'Os produtos aparecem quando a consulta dos pedidos do mês terminar.':'A leitura anterior ainda não trouxe os produtos. Use Atualizar mês para conferir os dados.';
   el('ProductSummary').textContent=text;el('ProductPageStatus').textContent='Produtos ainda não disponíveis.';
   const row=node('tr'),cell=node('td',text,'month-products-empty');cell.setAttribute('colspan','4');row.append(cell);target.append(row);return;
  }
  const orderId=(left,right)=>left.length-right.length||(left<right?-1:left>right?1:0);
  const query=el('ProductSearch').value.trim().replace(/^#/,'').toLowerCase().split(/\s+/).filter(Boolean),filter=el('ProductFilter').value,sort=el('ProductSort').value;
  const numberOrder=(left,right)=>left===null?(right===null?0:1):right===null?-1:left>right?-1:left<right?1:0;
  const rows=report.products.filter(product=>query.every(term=>[product.item_id,...product.variants.map(variant=>variant.model_id),catalogProducts.get(product.item_id)?.product_name||'',...(catalogProducts.get(product.item_id)?.variants||[]).flatMap(variant=>[variant.model_name,...variant.attributes.map(attribute=>attribute.value)])].some(value=>value.toLowerCase().includes(term)))&&(filter==='ready'?product.exclusive_after_costs_cents!==null:filter==='known'?Number.isSafeInteger(product.known_exclusive_after_costs_cents):filter==='pending'?(product.pending.length>0||product.production_cost_cents===null):filter==='mixed'?product.mixed_orders>0:true)).sort((left,right)=>(sort==='contribution_desc'?numberOrder(left.exclusive_after_costs_cents??left.known_exclusive_after_costs_cents??null,right.exclusive_after_costs_cents??right.known_exclusive_after_costs_cents??null):sort==='cost_desc'?numberOrder(left.production_cost_cents,right.production_cost_cents):sort==='item_asc'?0:numberOrder(left.quantity,right.quantity))||orderId(left.item_id,right.item_id));
  const pageSize=[20,50,100].includes(Number(el('ProductPageSize').value))?Number(el('ProductPageSize').value):20,pages=Math.max(1,Math.ceil(rows.length/pageSize));
  productPage=Math.max(1,Math.min(productPage,pages));const offset=(productPage-1)*pageSize;
  const ready=report.products.filter(product=>product.exclusive_after_costs_cents!==null).length;
  el('ProductSummary').textContent=report.products.length+' produto(s) vendido(s) · '+ready+' com saldo dos pedidos exclusivos conferido · '+report.mixed_orders+' pedido(s) com produtos diferentes, sem rateio financeiro.';
  if(report.mixed_orders>0)el('ProductSummary').textContent+=' Valores já informados nesses pedidos: produtos '+money(report.known_mixed_sales_cents)+', repasse '+money(report.known_mixed_repass_cents)+'. Eles fazem parte do total da loja.';
  const productMessages={PAYMENT_INCOMPLETE:'Faltam valores financeiros de pedidos exclusivos.',PRODUCTION_COST_INCOMPLETE:'Há variações com custo de produção pendente.',RETURNS_NOT_RECONCILED:'Devoluções dos pedidos exclusivos precisam de conciliação.',STATUS_REVIEW_REQUIRED:'Há situações de pedidos do mês ainda em revisão.',SOURCE_UNAVAILABLE:'Parte da leitura financeira ainda está pendente.',NO_EXCLUSIVE_ORDERS:'Este produto só aparece em pedidos com outros produtos; os valores não foram rateados.',ARITHMETIC_UNSAFE:'Um valor excedeu o limite seguro de cálculo.'};
  const stat=(label,amount,help)=>{const cell=node('td');cell.append(node('span',label,'month-product-mobile-label'),node('strong',amount),node('small',help));return cell;};
  const visible=rows.slice(offset,offset+pageSize);catalogVisibleIds=visible.map(product=>product.item_id);const signature=month+':'+catalogVisibleIds.join(',');if(signature!==catalogSignature){catalogSignature=signature;catalogNeedsRead=true;}
  for(const product of visible){
   const metadata=catalogProducts.get(product.item_id),row=node('tr'),identity=node('td');identity.append(node('strong',metadata?.product_name||'Produto #'+product.item_id));if(metadata?.product_name)identity.append(node('small','Produto #'+product.item_id,'month-product-identity-code'));identity.append(node('small',product.orders+' pedido(s) · '+product.exclusive_orders+' exclusivo(s) · '+product.mixed_orders+' com outros produtos'));
   const badge=node('span',product.exclusive_after_costs_cents===null?'Saldo em conferência':'Saldo de pedidos exclusivos conferido','month-product-badge');badge.dataset.ready=String(product.exclusive_after_costs_cents!==null);identity.append(badge);
   const details=node('details',undefined,'month-product-variants'),summary=node('summary',product.variants.length+' variação(ões) vendida(s)'),variants=node('ul',undefined,'month-product-variant-list');
   details.append(summary,variants);details.open=productOpen.has(product.item_id);
   const fill=()=>{variants.replaceChildren();if(!details.open)return;for(const variant of product.variants){const composition=variant.selling_unit==='CUSTOM_PRODUCT'?'Custo personalizado · '+variant.cost_profile_label:variant.selling_unit==='SINGLE_GARMENT'?'Camiseta '+variant.size:variant.selling_unit==='ONE_MALE_ONE_FEMALE_KIT'?'Kit · masculino '+variant.male_size+' / feminino '+variant.female_size:'Composição pendente';const catalogueVariant=metadata?.variants.find(row=>row.model_id===variant.model_id),label=catalogueVariant?.model_name||catalogueVariant?.attributes.map(attribute=>attribute.name+': '+attribute.value).join(' · ')||'Variação #'+variant.model_id,entry=node('li',label+' · '+composition+' · '+variant.quantity+' unidade(s) · '+money(variant.unit_cost_cents)+' por unidade vendida · '+variant.exclusive_quantity+' em pedidos exclusivos / '+variant.mixed_quantity+' com outros produtos.');if(catalogueVariant?.model_name)entry.append(node('small','Variação #'+variant.model_id));if(variant.unit_cost_cents===null)entry.append(node('small',catalogReason(catalogueVariant?.reason||metadata?.reason,metadata?.status)));variants.append(entry);}};
   details.ontoggle=()=>{if(details.open)productOpen.add(product.item_id);else productOpen.delete(product.item_id);fill();};fill();identity.append(details);
   const localPending=product.pending.filter(code=>!['STATUS_REVIEW_REQUIRED','SOURCE_UNAVAILABLE'].includes(code));if(localPending.length){const pending=node('ul',undefined,'month-product-pending');pending.append(node('li','Pendências deste produto:'));for(const code of localPending)pending.append(node('li',productMessages[code]||'Parte dos dados ainda precisa ser conferida.'));identity.append(pending);}
   const units=stat('Unidades vendidas',new Intl.NumberFormat('pt-BR').format(product.quantity),'Unidades do anúncio, conforme a composição ou o perfil de custo cadastrado.');
   const production=stat('Produção total',money(product.production_cost_cents),product.production_cost_cents===null?'Já identificado: '+money(product.known_production_cost_cents)+'. Falta conferir as variações pendentes.':'Custo de todas as unidades deste produto no mês.');
   const contribution=stat(mei?'Saldo após produção':'Saldo após produção e imposto',product.exclusive_orders===0?'Sem pedido exclusivo':money(product.exclusive_after_costs_cents),product.exclusive_orders+' pedido(s) só deste produto. '+(mei?'Repasse informado pela Shopee, após produção. O DAS-MEI está no resultado geral da loja, sem rateio entre produtos.':'Repasse informado pela Shopee, após produção e imposto de 2%.')+' Anúncios e outras despesas ainda não foram conciliados por produto.');
   if(product.exclusive_after_costs_cents===null&&Number.isSafeInteger(product.known_exclusive_after_costs_cents)){const stale=frame.result.pending.includes('FINANCIAL_SOURCE_STALE'),partial=node('div',undefined,'month-product-partial');partial.append(node('small',stale?'Subtotal da última leitura':'Subtotal dos pedidos já conferidos'),node('strong',money(product.known_exclusive_after_costs_cents)),node('small','Após produção'+(mei?'':' e imposto')+', antes de anúncios, outras despesas'+(mei?' e DAS-MEI mensal':'')+'. O saldo final continua em conferência.'));if(stale)partial.append(node('small','Leitura financeira: '+checkpointTime(frame.source_checked_at?.finance_oldest_at??frame.checked_at)+'.'));contribution.append(partial);}
   if(product.exclusive_after_costs_cents!==null&&product.exclusive_after_costs_cents<0)contribution.children[1].className='month-product-negative';
   if(product.exclusive_orders>0)contribution.append(node('small','Nestes pedidos: repasse '+money(product.exclusive_repass_cents)+' · produção '+money(product.exclusive_production_cost_cents)+(mei?'. DAS-MEI contabilizado no resultado mensal.':' · imposto '+money(product.exclusive_tax_cents)+'.')));
   if(product.exclusive_margin_bps!==null)contribution.append(node('small','Percentual sobre as vendas exclusivas: '+new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}).format(product.exclusive_margin_bps/100)+'%.'));
   if(product.mixed_orders>0)contribution.append(node('small',product.mixed_orders+' pedido(s) com outros produtos não estão neste saldo.'));
   row.append(identity,units,production,contribution);target.append(row);
  }
  if(!rows.length){const row=node('tr'),cell=node('td',report.products.length?'Nenhum produto corresponde à busca ou ao filtro.':'Nenhum produto em pedido pago neste mês.','month-products-empty');cell.setAttribute('colspan','4');row.append(cell);target.append(row);}
  el('ProductPageStatus').textContent=(rows.length?offset+1:0)+'–'+Math.min(offset+pageSize,rows.length)+' de '+rows.length+' produto(s) · página '+productPage+'/'+pages+' · '+pageSize+' por página';
  el('ProductPrevious').disabled=productPage<=1;el('ProductNext').disabled=productPage>=pages;
 }
 function render(){
  try{globalThis.brazaExpenseLedger?.observe(month);}catch{}
  globalThis.brazaAutomationWorkspace?.render(frame?buildAccountDiagnosis(frame):null);drawCheckpoint();
  if(!frame){
   for(const key of ['Sales','Ads','Roas']){el(key).textContent=busy?'Consultando':'Pendente';el(key+'Card').dataset.status='pending';}el('NetLabel').textContent='Resultado líquido previsto';el('Net').textContent='Em apuração';el('NetHelp').textContent='O resultado aparece após conferir os pedidos, anúncios e custos do mês.';el('NetCard').dataset.status='pending';el('Margin').textContent='';el('Coverage').replaceChildren();el('Waterfall').replaceChildren();el('Readiness').replaceChildren();el('Pending').hidden=true;el('Badge').textContent=collectionRecovery?.waiting&&!paused&&!document.hidden?'Aguardando retomada automática':busy?'Consultando':collectionFailure?'Consulta interrompida':'Aguardando consulta';drawCostOverview(null);drawTaxAndExpenses();drawProducts();drawWorkspaceCollection();controls();return;
  }
  const c=frame.coverage,ads=frame.ads,broad=ads?.totals.broad,net=frame.result.net_estimate_cents,summary=buildMonthlyFinancialSummary(frame),balance=summary?.balance_cents??null;
  setMetric('Sales',frame.sales_cents===null?null:money(frame.sales_cents),frame.sales_cents===null?'Já informado: '+money(frame.known_sales_cents)+'. Falta conferir parte dos pedidos pagos.':'Produtos dos '+c.paid+' pedido(s) pagos criados nas datas do mês.');
  setMetric('Ads',ads?.status==='AVAILABLE'?money(ads.expense_cents):null,savedAdsHelp(ads));
  if(ads?.status==='AVAILABLE'&&frame.result.pending.includes('ADS_UNAVAILABLE'))el('AdsCard').dataset.status='provisional';
  setMetric('Roas',broad?.calculated_roas_raw===null||broad?.calculated_roas_raw===undefined?null:ratio(broad.calculated_roas_raw),broad?.gmv_cents===null||broad?.gmv_cents===undefined?'Vendas atribuídas aos anúncios ainda pendentes.':'Vendas atribuídas aos anúncios: '+money(broad.gmv_cents)+'. Este valor difere das vendas totais da loja.');
  if(ads?.status==='AVAILABLE'&&ads.expense_cents===0&&broad?.calculated_roas_raw===null){el('Roas').textContent='Sem investimento';el('RoasCard').dataset.status='available';}
  el('NetLabel').textContent=balanceLabel(summary);setMetric('Net',balance===null?null:money(balance),summaryBalanceHelp(summary));
  if(balance===null)el('Net').textContent=frame.status==='RUNNING'?'Em apuração':'Em conciliação';
  else if(summary.state!=='READY')el('NetCard').dataset.status='provisional';
  el('NetCard').dataset.negative=String(balance!==null&&balance<0);
  el('Margin').textContent=frame.result.net_margin_bps===null?'':'Margem prevista: '+new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}).format(frame.result.net_margin_bps/100)+'%';
  el('Badge').textContent=collectionRecovery?.waiting&&!paused&&!document.hidden?'Aguardando retomada automática':frame.status==='RUNNING'?(busy&&!paused&&!document.hidden?'Consultando':paused||resumeOnVisible||document.hidden?'Consulta pausada':frame.collection?.state==='BLOCKED'?'Consulta requer atenção':'Consulta interrompida'):frame.status==='LIMIT_REACHED'?'Mês parcial':net===null?'Há pendências':'Previsão completa';
  el('Coverage').replaceChildren();for(const text of [c.paid+' pedido(s) pagos',c.completed+' concluído(s)',c.ongoing+' em andamento',c.cancelled+' cancelado(s) excluído(s)',c.unpaid+' não pago(s) excluído(s)'])el('Coverage').append(node('span',text));
  if(c.cancel_pending)el('Coverage').append(node('span',c.cancel_pending+' em cancelamento · em revisão'));
  if(c.other+c.unknown)el('Coverage').append(node('span',(c.other+c.unknown)+' com situação a conferir'));
  const warnings=frame.result.pending.filter(code=>code!=='COLLECTING');el('Pending').hidden=!warnings.length;el('PendingTitle').textContent=warnings.length===1?'Falta uma conferência para concluir o resultado':'O que falta para concluir o resultado';el('PendingList').replaceChildren();for(const code of warnings)el('PendingList').append(node('li',code==='ADS_UNAVAILABLE'&&ads?.status==='AVAILABLE'?savedAdsHelp(ads):pendingMessages[code]||'Parte dos dados ainda precisa ser conferida.'));
  el('Identify').hidden=true;
  if(warnings.includes('EXTERNAL_EXPENSES_REQUIRED')&&warnings.length===1)el('ExpensesDetails').open=true;
  el('RechargeField').hidden=!(frame.ads_adjustment_cents>0||warnings.includes('RECHARGE_TREATMENT_REQUIRED'));
  drawCostOverview(summary);drawWaterfall(summary);drawTaxAndExpenses(summary);drawReadiness();drawProducts();fillExpenses();
  if(dirty){el('ExpenseState').textContent=draftRevision!==frame.expenses.revision?'As despesas foram alteradas em outra sessão. Sua edição foi preservada; carregue os valores salvos antes de salvar novamente.':'Há uma edição de despesas ainda não salva.';}
  else el('ExpenseState').textContent=frame.expenses.external_expenses_cents===null?'Outras despesas ainda não informadas. Informe o valor ou confirme que não há despesas.':'Despesas salvas para '+monthName(frame.month)+' · versão '+frame.expenses.revision+'.';
  const progress=frame.progress;el('Progress').hidden=!busy;el('Progress').value=progress.windows_total?Math.round(progress.windows_complete/progress.windows_total*100):0;
  const formatTime=value=>Number.isSafeInteger(value)&&value>0?new Date(value*1000).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'pendente',sources=frame.source_checked_at;
  const consultation=sources?'Pedidos e financeiro: leitura mais antiga '+formatTime(sources.finance_oldest_at)+'; mais recente '+formatTime(sources.finance_latest_at)+'. Anúncios consultados em '+formatTime(sources.ads_at)+'. Idade do financeiro: '+sourceAge(sources.finance_oldest_at)+'; idade dos anúncios: '+sourceAge(sources.ads_at)+'.':'Horário informado pela leitura anterior: '+formatTime(frame.checked_at)+'. Idade da leitura: '+sourceAge(frame.checked_at)+'. Essa leitura não separa os horários do financeiro e dos anúncios.';
  el('Scope').textContent='Pedidos pagos criados de '+frame.start_date.split('-').reverse().join('/')+' a '+frame.end_date.split('-').reverse().join('/')+' e anúncios nas mesmas datas. Custos atuais de produção. '+consultation+' Brasília. Recebimentos bancários ainda não conciliados.';
  for(const key of ['AdsLink','DetailsLink'])el(key).href='/dashboard?month='+encodeURIComponent(frame.month);
  drawWorkspaceCollection();controls();
 }
 function drawWorkspaceCollection(){
  const target=el('CollectionState');if(!target)return;target.hidden=!workspaceView;if(!workspaceView)return;
  const value=workspaceView,current=value.collection,automatic=value.automatic,published=value.display_source==='PUBLISHED',collecting=current.status==='RUNNING';
  const displayTime=checkpointTime(frame?.source_checked_at?.finance_latest_at??frame?.checked_at),activeTime=checkpointTime(current.source_checked_at?.finance_latest_at??current.checked_at);
  let text=published?'Resumo concluído de '+frame.start_date+' a '+frame.end_date+' · financeiro de '+displayTime+'. ':'Resumo parcial dos pedidos de '+frame.start_date+' a '+frame.end_date+' · financeiro de '+displayTime+'. ';
  if(collecting)text+='Nova coleta de '+current.start_date+' a '+current.end_date+' em andamento: '+current.progress.windows_complete+' de '+current.progress.windows_total+' intervalo(s), '+current.coverage.orders+' pedido(s) observados · leitura de '+activeTime+'. Os valores desta coleta só substituem o resumo concluído após a conferência do período.';
  else if(current.status==='LIMIT_REACHED')text+='A nova coleta atingiu o limite e permanece parcial.';
  else text+='A leitura dos pedidos deste período está concluída.';
  if(!automatic.enabled)text+=' Coleta automática pausada. Atualizar vendas inicia uma consulta manual.';
  else if(!automatic.applicable)text+=' Mês histórico: use Atualizar vendas para uma nova consulta manual.';
  else text+=' A coleta continua automaticamente mesmo com o painel fechado.';
  target.textContent=text;
  if(collecting){el('Badge').textContent=!automatic.enabled?'Leitura parcial · coleta pausada':!automatic.applicable?'Leitura parcial do mês histórico':published?'Atualizando · resumo anterior preservado':'Coleta automática em andamento';el('Progress').hidden=false;el('Progress').value=current.progress.windows_total?Math.round(current.progress.windows_complete/current.progress.windows_total*100):0;}
  el('RefreshHelp').textContent=automatic.applicable&&automatic.enabled?'Recalcular custos usa os pedidos salvos. Atualizar vendas prioriza a próxima coleta automática, que continua com o painel fechado.':'Recalcular custos usa os pedidos salvos. Atualizar vendas inicia uma consulta manual à Shopee para este período.';
 }
 async function fetchWorkspaceView(selected){
  const raw=await api('finance/business-month-view?month='+encodeURIComponent(selected)),checked=projectBusinessMonthView(raw,projectBusinessMonth,projectBusinessMonthAuditScope);if(!checked||checked.month!==selected)throw Error('BUSINESS_MONTH_VIEW_INVALID');return checked;
 }
 function readWorkspaceView({selected=el('Select').value,background=false}={}){
  if(!started||saving||!validMonth(selected)||background&&(document.hidden||costDiagnosticBusy||manualCollection||busy))return Promise.resolve(false);
  if(viewPromise?.month===selected)return viewPromise.task;
  const changed=selected!==month;if(changed){resetCostDiagnostic({clear:true});generation++;month=selected;frame=null;workspaceView=null;observeAudits(selected);collectionRecovery=null;collectionFailure=null;manualCollection=false;priorityPromise=null;paused=false;automaticBlocked=false;catalogRequest++;catalogBusy=false;catalogState=null;catalogProducts.clear();catalogSignature='';catalogNeedsRead=true;dirty=false;editSequence++;draftRevision=0;el('ExpensesValue').value='';el('Recharge').value='UNCONFIRMED';invalidateCheckpointHistory();}
  const token=generation,requestId=++viewRequest,current=()=>started&&token===generation&&month===selected&&requestId===viewRequest;
  if(!background){busy=true;clearTimeout(timer);timer=null;status('Conferindo o resumo salvo e o andamento da coleta…');render();}
  const task=(async()=>{try{const value=await fetchWorkspaceView(selected);if(!current())return false;workspaceView=value;manualCollection=false;collectionRecovery=null;collectionFailure=null;automaticBlocked=false;viewFailures=0;apply(value.display,selected);if(!background)status(value.collection.status==='RUNNING'?(value.display_source==='PUBLISHED'?'Atualização em andamento no servidor; o último resumo concluído está identificado abaixo.':value.automatic.enabled&&value.automatic.applicable?'A coleta automática está em andamento. O resultado do período aparece após sua conclusão.':'Há uma leitura parcial salva. Use Atualizar vendas para continuar manualmente.'):'Resumo recalculado com os pedidos, anúncios e custos salvos.');return true;}catch(error){if(current()){viewFailures=Math.min(4,viewFailures+1);status(error?.status===401?'Entre novamente para acompanhar os dados da loja.':'Não foi possível conferir o andamento agora. O último resumo e seus rascunhos foram preservados; tentaremos novamente.',true);}return false;}finally{if(current()){if(!background)busy=false;viewPromise=null;render();schedule();scheduleCatalog();}}})();viewPromise={month:selected,task};return task;
 }
 function checkedRefreshRequest(value,selected){
  const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row)),keys=['schema','month','status','next_run_at','lease_expires_at'];
  if(!plain(value)||Reflect.ownKeys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'))||value.schema!=='business_month_refresh_request_v1'||value.month!==selected||!['QUEUED','RUNNING','PAUSED','RETRY_WAIT'].includes(value.status)||!Number.isSafeInteger(value.next_run_at)||value.next_run_at<0||value.next_run_at>9999999999||value.lease_expires_at!==null&&(!Number.isSafeInteger(value.lease_expires_at)||value.lease_expires_at<1||value.lease_expires_at>9999999999))throw Error('BUSINESS_MONTH_REFRESH_REQUEST_INVALID');return value;
 }
 function requestSalesUpdate(){
  if(priorityPromise)return priorityPromise;if(!started||busy||adsBusy||saving||!validMonth(month))return Promise.resolve(false);
  if(!workspaceView)return readWorkspaceView();
  if(!cronOwnsCollection()){manualCollection=true;workspaceView=null;viewRequest++;viewPromise=null;observeAudits(month);return refresh();}
  const selected=month,token=generation,current=()=>started&&month===selected&&token===generation;
  const task=(async()=>{try{const value=checkedRefreshRequest(await api('finance/business-month-request',{month:selected}),selected);if(!current())return false;await readWorkspaceView({selected,background:true});if(!current())return false;status(value.status==='PAUSED'?'A coleta automática foi pausada. Os valores salvos foram preservados.':value.status==='RETRY_WAIT'?'A fonte precisa aguardar antes da próxima tentativa. O resumo salvo foi preservado.':value.status==='RUNNING'?'A coleta já está em andamento. O painel acompanhará os avanços automaticamente.':'Atualização priorizada. A coleta será executada automaticamente; você pode manter o painel fechado.');return true;}catch{if(current())status('Não foi possível priorizar a atualização agora. O resumo salvo foi preservado.',true);return false;}finally{if(current()){priorityPromise=null;controls();schedule();}}})();priorityPromise=task;controls();return task;
 }
 function checkedFrame(value,expectedMonth){const checked=projectBusinessMonth(value);if(!checked||checked.month!==expectedMonth)throw Error('Os dados mensais não puderam ser conferidos. Atualize o mês para tentar novamente.');return checked;}
 function observeAudits(selected,scope=null){try{globalThis.brazaReconciliation?.observe(selected,scope);globalThis.brazaEscrowReleases?.observe(selected,scope);}catch{}}
 function apply(value,expectedMonth){const previous=frame?.classification_revision;frame=checkedFrame(value,expectedMonth);if(previous!==frame.classification_revision){catalogNeedsRead=true;if(previous!==undefined)catalogProductsChanged=true;}invalidateCheckpointHistory();render();const auditScope=!manualCollection&&workspaceView?.display===value&&workspaceView.schema==='business_month_view_v2'&&workspaceView.display_source==='PUBLISHED'?workspaceView.audit_scope:null;observeAudits(expectedMonth,auditScope);return frame;}
 function collectionProgress(value){return [value.progress.pages_read,value.coverage.orders,value.progress.windows_complete];}
 function trackCollection(value){
  if(!value.collection)return null;
  const progress=collectionProgress(value);
  if(!collectionRecovery)collectionRecovery={value,progress,highWater:[...progress],attempts:0,readFailures:0,firstAdsAttempted:false,waiting:false,observing:false,retryAt:0,waitKey:null};
  else{
   // A restarted job can briefly report lower counters. Only progress beyond
   // this visit's high-water marks releases another bounded set of retries.
   if(progress.some((count,index)=>count>collectionRecovery.highWater[index])){collectionRecovery.attempts=0;collectionRecovery.waitKey=null;}
   collectionRecovery.highWater=progress.map((count,index)=>Math.max(count,collectionRecovery.highWater[index]));
   collectionRecovery.value=value;collectionRecovery.progress=progress;
  }
  return collectionRecovery;
 }
 function recoverableFailure(error){
  const diagnostic=collectionDiagnostic('read',error),http=diagnostic.http;
  if(http!==null&&http>=300&&![408,429,500,502,503,504].includes(http))return false;
  return ['ADMIN_API_NETWORK_ERROR','ADMIN_API_TIMEOUT'].includes(diagnostic.code)||diagnostic.code==='ADMIN_API_HTTP_ERROR'&&[408,429,500,502,503,504].includes(http);
 }
 function recoveryDelay(attempt){return Math.min(60000,Math.ceil(Math.min(55000,1000*2**Math.min(attempt,6))*(1.03+Math.random()*.07)));}
 function waitForUnknownCollection(){
  collectionRecovery={value:null,progress:[0,0,0],highWater:[0,0,0],attempts:0,readFailures:0,firstAdsAttempted:false,waiting:true,observing:false,retryAt:Date.now()+recoveryDelay(0),waitKey:'NETWORK|UNKNOWN'};
  automaticBlocked=false;resumeOnVisible=false;
  status('Não recebemos a confirmação da coleta. Vamos conferir os dados salvos antes de retomar.');
 }
 function waitForCollection(value,{error=false}={}){
  const recovery=trackCollection(value);if(!recovery)return false;
  if(value.collection.state==='BLOCKED'){
   collectionRecovery=null;automaticBlocked=true;
   status(value.collection.code==='BUSINESS_PERIOD_AUTH_REQUIRED'?'A conexão financeira precisa ser autorizada novamente nas integrações. Os valores já consultados foram preservados.':value.collection.code==='BUSINESS_PERIOD_PERMISSION_DENIED'?'A Shopee recusou a permissão para esta consulta. Confira a conexão financeira nas integrações; os valores já consultados foram preservados.':'Parte da resposta financeira não passou na conferência. Os valores já consultados foram preservados; confira a conexão antes de retomar.',true);
   return true;
  }
  recovery.waiting=true;automaticBlocked=false;resumeOnVisible=false;
  const key=(error?'NETWORK':value.collection.code||'READY')+'|'+recovery.progress.join(':');
  if(recovery.waitKey!==key){recovery.waitKey=key;recovery.retryAt=Date.now()+Math.max(error?0:value.collection.retry_after_seconds*1000,recoveryDelay(recovery.attempts));}
  status(recovery.attempts>=8?'A coleta automática está aguardando avanço da Shopee. Continuaremos conferindo os dados salvos, sem repetir consultas em sequência.':'Aguardando retomada automática da consulta. Os valores já consultados foram preservados.');return true;
 }
 function canRecover(){return manualCollection&&started&&collectionRecovery?.waiting&&!document.hidden&&!busy&&!adsBusy&&!saving&&!dirty&&!paused&&!automaticBlocked&&!costDiagnosticBusy;}
 async function observeCollection(){
  if(!canRecover()||collectionRecovery.observing)return false;
  const recovery=collectionRecovery,selected=month,token=generation;recovery.observing=true;
  const current=()=>started&&token===generation&&selected===month&&collectionRecovery===recovery;
  try{
   const raw=await api('finance/business-month?month='+encodeURIComponent(selected));if(!current())return false;
   const value=checkedFrame(raw,selected);recovery.readFailures=0;
   // A legacy response cannot authorize a new collector request after an
   // ambiguous failure. Only the durable collection contract can resume it.
   if(!value.collection){collectionRecovery=null;automaticBlocked=true;status('Os dados salvos foram preservados. Use Atualizar mês para retomar a consulta.',true);return false;}
   trackCollection(value);apply(value,selected);
   if(value.collection.state==='BLOCKED'){waitForCollection(value);return false;}
   if(value.status!=='RUNNING'){
    const firstAds=value.status==='COMPLETE'&&!value.result.pending.includes('SOURCE_UNAVAILABLE')&&value.ads?.status!=='AVAILABLE'&&!recovery.firstAdsAttempted;
    // This is the first Ads read after an interrupted financial request, never
    // a replay of an Ads submission. Wait for a foreground, unedited workspace.
    if(firstAds&&!canRecover()){recovery.retryAt=0;return true;}
    if(firstAds){
     recovery.firstAdsAttempted=true;collectionRecovery=null;collectionFailure=null;lastFinancialRefreshAt=Date.now();automaticBlocked=false;
     status('A consulta financeira foi concluída. Conferindo os anúncios nas mesmas datas…');
     const refreshed=await refreshAds();
     if(started&&token===generation&&selected===month&&refreshed)status(frame.ads?.status==='AVAILABLE'?'Dados do mês atualizados. Confira o resultado e as pendências abaixo.':'A consulta financeira foi concluída, mas o gasto de anúncios ainda está pendente. O resultado líquido continua em conciliação.');
     return refreshed;
    }
    collectionRecovery=null;collectionFailure=null;lastFinancialRefreshAt=Date.now();automaticBlocked=value.result.pending.includes('SOURCE_UNAVAILABLE');if(value.ads?.status==='AVAILABLE'&&!value.result.pending.includes('ADS_UNAVAILABLE'))adsSuccess();else adsFailure();
    status(value.status==='COMPLETE'?(value.ads?.status==='AVAILABLE'?'A consulta financeira foi concluída. Os dados salvos e as pendências do mês foram atualizados.':'A consulta financeira foi concluída, mas o gasto de anúncios ainda está pendente. O resultado líquido continua em conciliação. A atualização dos anúncios será tentada novamente automaticamente, com uma espera entre tentativas.'):'O mês está parcial porque o limite de pedidos foi atingido. Os totais pendentes não são estimados como zero.');return true;
   }
   if(value.collection.state==='RETRY_WAIT')waitForCollection(value);
   else recovery.retryAt=0;
   if(!canRecover())return false;
   if(recovery.attempts>=8||Date.now()<recovery.retryAt){render();return true;}
   recovery.waiting=false;recovery.observing=false;recovery.attempts++;collectionFailure=null;
   return refresh({automatic:true,observed:value});
  }catch(error){
   if(current()){
    collectionFailure=collectionDiagnostic('read',error);
    if(recoverableFailure(error)){recovery.readFailures++;recovery.retryAt=Date.now()+recoveryDelay(recovery.readFailures);status('A consulta está temporariamente indisponível. Continuaremos conferindo os dados salvos antes de retomar.');}
    else{collectionRecovery=null;automaticBlocked=true;status('Não foi possível conferir o estado da consulta. Os dados salvos foram preservados; confira a conexão financeira antes de retomar.',true);}
   }return false;
  }finally{if(current()){recovery.observing=false;render();schedule();scheduleCatalog();}else if(started&&token===generation&&selected===month){render();schedule();scheduleCatalog();}}
 }
 function adsFailure(){adsFailures=Math.min(adsFailures+1,3);adsRetryAt=Date.now()+[60000,120000,300000][adsFailures-1];}
 function adsSuccess(){adsFailures=0;adsRetryAt=0;}
 function savedAdsHelp(value){
  if(!value)return 'O gasto de anúncios ainda não foi coletado para estas datas. A atualização automática continuará tentando.';
  if(value.status!=='AVAILABLE')return 'Consulta parcial: '+value.covered_days+' de '+value.total_days+' dia(s), sem completar os dias ausentes com zero.';
  const old=Date.now()-value.fetched_at*1000>900000,unconfirmed=frame.result.pending.includes('ADS_UNAVAILABLE');
  return (old?'Último gasto salvo; leitura antiga. ':unconfirmed?'Último gasto confirmado; a atualização ainda está pendente. ':'Gasto confirmado em '+value.covered_days+' de '+value.total_days+' dia(s). ')+
   'Consultado '+sourceAge(value.fetched_at)+'.'+(unconfirmed?' O líquido aguarda uma atualização de anúncios.':'');
 }
 function schedule(){
  clearTimeout(timer);timer=null;
  if(!manualCollection){if(!started||document.hidden||busy||saving||costDiagnosticBusy||viewPromise)return;const delay=viewFailures?Math.min(300000,15000*2**viewFailures):workspaceView?.collection.status==='RUNNING'?15000:60000;timer=setTimeout(()=>{timer=null;return readWorkspaceView({background:true});},delay);return;}
  if(collectionRecovery?.waiting){if(!canRecover()||collectionRecovery.observing)return;const delay=collectionRecovery.attempts>=8?60000:Math.min(60000,Math.max(0,collectionRecovery.retryAt-Date.now()));timer=setTimeout(()=>{timer=null;return observeCollection();},delay);return;}
  if(!started||document.hidden||busy||adsBusy||saving||dirty||paused||automaticBlocked||costDiagnosticBusy||frame?.status!=='COMPLETE'&&!resumeOnVisible||month!==today().slice(0,7))return;
  // Ads updates never advance the financial clock: orders, cancellations and
  // payouts must be imported again even while Ads continues to update.
  const financialDue=resumeOnVisible?Date.now():lastFinancialRefreshAt+financeRefreshInterval;
  const delay=Math.min(60000,Math.max(0,financialDue-Date.now()));
  timer=setTimeout(()=>{timer=null;if(document.hidden||dirty||paused||automaticBlocked)return;return Date.now()>=financialDue?refresh({automatic:true}):refreshAds();},delay);
 }
 async function request(operation,selected=month){if(!manualCollection){if(operation!=='read')throw Error('A coleta automática é acompanhada pelos dados salvos.');const token=generation,value=await fetchWorkspaceView(selected);if(started&&selected===month&&token===generation)workspaceView=value;return value.display;}return api('finance/business-month',{operation,month:selected});}
 async function refresh({automatic=false,observed=null,cacheFirst=false}={}){
  if(!manualCollection)return readWorkspaceView({background:automatic});
  if(!started||saving||automatic&&(dirty||paused||automaticBlocked||document.hidden||adsBusy))return false;
  const selected=el('Select').value;if(!validMonth(selected)){status('Escolha um mês válido até o mês atual.',true);return false;}
  const changed=selected!==month;if(busy&&!changed)return false;
  resetCostDiagnostic({clear:changed});const token=++generation;catalogRequest++;catalogBusy=false;clearTimeout(catalogTimer);catalogTimer=null;month=selected;paused=false;automaticBlocked=false;resumeOnVisible=false;collectionFailure=null;if(!observed)collectionRecovery=null;busy=true;adsBusy=false;clearTimeout(timer);timer=null;
  if(changed){adsSuccess();frame=null;observeAudits(selected);catalogState=null;catalogPaused=false;catalogProducts.clear();catalogSignature='';catalogNeedsRead=true;invalidateCheckpointHistory();dirty=false;editSequence++;draftRevision=0;el('ExpensesValue').value='';el('Recharge').value='UNCONFIRMED';}
  status(automatic?'Atualizando vendas, cancelamentos e anúncios de '+monthName(month)+'…':'Consultando os pedidos de '+monthName(month)+'…');render();
  const current=()=>token===generation&&month===selected;
  let operation='read';
  try{
   let value=!changed&&frame?.status==='COMPLETE'?frame:null;
   if(changed){
    let cached,readSucceeded=false;
    try{cached=await request('read',selected);readSucceeded=true;}catch{}
    if(!current())return false;
    // A successful but invalid cache response must fail validation, rather than
    // being treated as a network miss or displaying unverified totals.
    if(readSucceeded){value=apply(cached,selected);if(value.status==='COMPLETE')status('Mostrando a última leitura salva. Atualizando os pedidos e anúncios de '+monthName(selected)+'…');}
   }
   if(paused||document.hidden){
    resumeOnVisible=!paused;
    status(paused?'Consulta pausada após a última resposta. Use Continuar consulta para retomar.':'A atualização continua automaticamente quando este painel voltar à tela.');return true;
   }
   // Opening a recent saved month must not restart its order/payment import.
   // Only provider observation times govern freshness; a local cost read does
   // not make old orders, cancellations or Ads newer.
   const financeAt=value?.source_checked_at?.finance_oldest_at;
   if(cacheFirst&&value?.status==='COMPLETE'&&Number.isSafeInteger(financeAt)&&financeAt>0&&financeAt*1000<=Date.now()&&Date.now()-financeAt*1000<financeRefreshInterval&&!value.result.pending.some(code=>['SOURCE_UNAVAILABLE','FINANCIAL_SOURCE_STALE'].includes(code))){
    lastFinancialRefreshAt=financeAt*1000;
    status('Custos recalculados com os pedidos salvos. Leitura financeira '+sourceAge(financeAt)+'. Use Atualizar vendas para buscar mudanças na Shopee.');
    return true;
   }
   const keepCached=value?.status==='COMPLETE';
   if(keepCached)status('Mostrando a última leitura salva. Atualizando os pedidos e anúncios de '+monthName(selected)+'…');
   const update=raw=>{const checked=checkedFrame(raw,selected);trackCollection(checked);if(!keepCached||checked.status!=='RUNNING'){frame=checked;invalidateCheckpointHistory();render();}return checked;};
   if(observed)value=update(observed);
   else{operation='start';const initial=await request('start',selected);if(!current())return false;value=update(initial);}
   let steps=0,resumeDue=!!observed;
   while(value.status==='RUNNING'&&value.collection?.state!=='BLOCKED'&&(resumeDue||value.collection?.state!=='RETRY_WAIT')&&!paused&&!document.hidden&&steps<610){
    resumeDue=false;
    status((keepCached?'Mostrando a última leitura salva. ':'')+'Conferindo os pedidos do mês… '+value.coverage.orders+' pedido(s) consultado(s).');
    operation='step';const raw=await request('step',selected);if(!current())return false;value=update(raw);steps++;
    if(value.result.pending.includes('SOURCE_UNAVAILABLE')||value.collection?.state==='RETRY_WAIT'||value.collection?.state==='BLOCKED')break;
   }
   if(!current())return false;
   if(value.collection?.state==='RETRY_WAIT'||value.collection?.state==='BLOCKED')waitForCollection(value);
   else if(value.result.pending.includes('SOURCE_UNAVAILABLE')){automaticBlocked=true;collectionRecovery=null;collectionFailure=collectionDiagnostic(operation,{code:'BUSINESS_MONTH_SOURCE_UNAVAILABLE'});}
   if(document.hidden&&!paused){if(value.collection&&value.status==='RUNNING')waitForCollection(value);else resumeOnVisible=!automaticBlocked;status('A atualização continua automaticamente quando este painel voltar à tela.');}
   else if(collectionRecovery?.waiting||automaticBlocked&&value.collection?.state==='BLOCKED'){}
   else if(value.status==='COMPLETE'&&!paused){
    collectionRecovery=null;lastFinancialRefreshAt=Date.now();
    let catalogueFailed=false;
    if(!catalogFeature()&&value.unmapped_variants.length&&typeof syncVariants==='function'){
     status('Associando automaticamente os custos dos produtos vendidos…');
     try{catalogueFailed=await syncVariants(value.unmapped_variants)===false;}catch{catalogueFailed=true;}
     if(!current())return false;operation='read';const reread=await request('read',selected);if(!current())return false;apply(reread,selected);
    }
    if(automatic&&Date.now()<adsRetryAt){status('Vendas atualizadas. A consulta de anúncios aguarda a próxima tentativa automática; o último gasto salvo mantém seu horário.');return true;}
    if(!current())return false;status('Conferindo os anúncios nas mesmas datas…');
    operation='ads';const raw=await request('ads',selected);if(!current())return false;value=apply(raw,selected);
    if(value.ads?.status==='AVAILABLE'&&!value.result.pending.includes('ADS_UNAVAILABLE'))adsSuccess();else adsFailure();
    status(catalogueFailed?'Valores mensais atualizados. Há produtos com identificação pendente; confira os motivos abaixo.':'Dados do mês atualizados. Confira o resultado e as pendências abaixo.');
   }else if(paused)status('Consulta pausada após a última resposta. Use Continuar consulta para retomar.');
   else if(value.status==='LIMIT_REACHED')status('O mês está parcial porque o limite de pedidos foi atingido. Os totais pendentes não são estimados como zero.');
   else status('Parte da consulta ficou pendente. Use Atualizar mês para retomar a leitura.');
   return true;
  }catch(error){if(current()&&error?.code==='BUSINESS_MONTH_BACKGROUND_OWNED'){manualCollection=false;collectionRecovery=null;automaticBlocked=false;busy=false;return readWorkspaceView({selected});}if(current()){collectionFailure=collectionDiagnostic(operation,error);const recoverableValue=collectionRecovery?.value||frame;if(['start','step'].includes(operation)&&recoverableFailure(error)&&(recoverableValue?.collection||!recoverableValue)){if(recoverableValue)waitForCollection(recoverableValue,{error:true});else waitForUnknownCollection();}else{if(operation==='ads')adsFailure();else automaticBlocked=true;collectionRecovery=null;status(operation==='ads'?'Não foi possível atualizar os anúncios. O último gasto salvo mantém sua data; tentaremos novamente automaticamente.':error?.message||'Não foi possível atualizar o mês. Tente novamente.',true);}render();}return false;}
  finally{if(current()){busy=false;if(frame?.status==='COMPLETE'&&!collectionRecovery?.waiting)manualCollection=false;render();schedule();scheduleCatalog();}}
 }
 async function refreshAds(){
  if(!manualCollection)return readWorkspaceView({background:true});
  if(!started||!frame||busy||adsBusy||saving||dirty||document.hidden)return false;
  if(Date.now()<adsRetryAt){schedule();return false;}
  if(frame.ads?.status==='AVAILABLE'&&!frame.result.pending.includes('ADS_UNAVAILABLE')&&Date.now()-frame.ads.fetched_at*1000<60000){schedule();return false;}
  const token=generation,selected=month;adsBusy=true;controls();
  try{
   const raw=await request('ads',selected);if(token!==generation||selected!==month)return false;apply(raw,selected);
   if(frame.ads?.status==='AVAILABLE'&&!frame.result.pending.includes('ADS_UNAVAILABLE')){adsSuccess();if(collectionFailure?.operation==='ads')collectionFailure=null;}
   else{adsFailure();status('A atualização dos anúncios ficou pendente. O último gasto salvo mantém seu horário; a consulta será repetida automaticamente.');}
   return true;
  }catch(error){if(token===generation){adsFailure();collectionFailure=collectionDiagnostic('ads',error);status('Não foi possível atualizar os anúncios. O último gasto salvo mantém seu horário; tentaremos novamente automaticamente.',true);}return false;}
  finally{if(token===generation){adsBusy=false;render();schedule();scheduleCatalog();}}
 }
 async function refreshCosts(){
  if(!manualCollection)return readWorkspaceView();
  if(!started||!frame||busy||adsBusy||saving)return false;
  resetCostDiagnostic();const token=++generation,selected=month;busy=true;catalogRequest++;catalogBusy=false;clearTimeout(catalogTimer);catalogTimer=null;clearTimeout(timer);timer=null;controls();
  status('Recalculando os custos com os pedidos e produtos salvos…');
  try{
   const raw=await request('read',selected);if(token!==generation||selected!==month)return false;apply(raw,selected);
   status('Custos recalculados com os dados salvos. Pedidos consultados '+sourceAge(frame.source_checked_at?.finance_oldest_at??frame.checked_at)+'. Use Atualizar vendas para buscar mudanças na Shopee.');return true;
  }catch(error){if(token===generation){collectionFailure=collectionDiagnostic('read',error);status('Os custos foram preservados, mas não foi possível recalcular os dados salvos. Tente novamente ou use Atualizar vendas.',true);}return false;}
  finally{if(token===generation){busy=false;render();schedule();scheduleCatalog();}}
 }
 function expenseChanged(){dirty=true;editSequence++;clearTimeout(timer);timer=null;render();}
 function expenseAmount(){const raw=el('ExpensesValue').value.trim().replace(',','.');if(!/^(0|[1-9][0-9]{0,10})(?:\.[0-9]{1,2})?$/.test(raw))throw Error('Informe as despesas em reais, com até duas casas decimais, inclusive se forem zero.');const [whole,fraction='']=raw.split('.'),cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));if(cents>BigInt(Number.MAX_SAFE_INTEGER))throw Error('O valor das despesas excede o limite seguro.');return Number(cents);}
 async function saveExpenses({zero=false}={}){
  if(!frame||busy||adsBusy||saving||dirty&&draftRevision!==frame.expenses.revision)return false;
  if(zero){el('ExpensesValue').value='0.00';expenseChanged();}
  let amount;try{amount=expenseAmount();}catch(error){el('ExpenseState').textContent=error.message;return false;}
  const selected=month,token=generation,submitted=editSequence,revision=draftRevision,treatment=el('Recharge').value;saving=true;controls();el('ExpenseState').textContent='Salvando as despesas deste mês…';
  try{
   const raw=await api('finance/business-month',{operation:'expenses',month:selected,revision,external_expenses_cents:amount,recharge_treatment:treatment});
   if(token!==generation||selected!==month)return false;
   const result=projectBusinessMonth(raw);if(!result||result.month!==selected)throw Error('As despesas foram enviadas, mas o resultado não pôde ser conferido. Atualize o mês.');
   frame=result;observeAudits(selected);invalidateCheckpointHistory();draftRevision=result.expenses.revision;
   if(submitted===editSequence){dirty=false;fillExpenses({force:true});}
   render();status('Despesas do mês salvas. Produção, imposto e anúncios continuam contabilizados separadamente.');return true;
  }catch(error){
   if(token===generation){
    el('ExpenseState').textContent=error.status===409?'As despesas mudaram em outra sessão. Sua edição foi preservada; carregue os valores salvos antes de salvar.':(error.message||'Não foi possível salvar. Sua edição foi preservada.');
    if(error.status===409){try{const raw=await request('read',selected);if(token===generation)apply(raw,selected);}catch{}}
   }return false;
  }finally{if(token===generation){saving=false;controls();schedule();scheduleCatalog();}}
 }
 async function identify(){
  if(catalogFeature()){catalogNeedsRead=true;return updateCatalog();}
  if(!frame||busy||adsBusy||saving||!frame.unmapped_variants.length||typeof syncVariants!=='function')return;
  const token=generation,selected=month;busy=true;controls();status('Atualizando a identificação dos produtos vendidos…');
  try{await syncVariants(frame.unmapped_variants);if(token!==generation)return;const raw=await request('read',selected);if(token!==generation)return;apply(raw,selected);status('Custos do mês atualizados. Vínculos manuais foram preservados.');}
  catch{if(token===generation)status('A identificação automática ficou pendente. Confira os produtos e custos; os vínculos salvos foram preservados.',true);}
  finally{if(token===generation){busy=false;render();schedule();}}
 }
 async function start(options={}){
  if(started)return false;if(typeof options.api!=='function'||!el('Select'))return false;
  api=options.api;try{globalThis.brazaExpenseLedger?.start({api,onChanged:async selected=>{if(started&&selected===month)return refreshCosts();}});globalThis.brazaReconciliation?.start({api});globalThis.brazaEscrowReleases?.start({api});}catch{}syncVariants=options.syncVariants;onCatalogChanged=options.onCatalogChanged;bootstrapPhase='READY';bootstrapCompleted=true;started=true;
  let selected;try{const params=new URLSearchParams(globalThis.location?.search||'');selected=params.getAll('month').length===1?params.get('month'):null;}catch{}
  el('Select').max=today().slice(0,7);el('Select').value=validMonth(selected)?selected:bootstrapPrepared&&validMonth(el('Select').value)?el('Select').value:today().slice(0,7);
  el('Refresh').onclick=()=>frame?.status==='COMPLETE'&&!paused&&!collectionRecovery?.waiting?refreshCosts():refresh();el('SourceRefresh').onclick=requestSalesUpdate;el('Select').onchange=()=>readWorkspaceView();
  el('Previous').onclick=()=>{const basis=validMonth(el('Select').value)?el('Select').value:today().slice(0,7),date=new Date(basis+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()-1);el('Select').value=date.toISOString().slice(0,7);readWorkspaceView();};
  el('Pause').onclick=()=>{paused=true;clearTimeout(timer);timer=null;el('Pause').disabled=true;status(busy?'A consulta será pausada após a resposta em andamento.':'Consulta pausada. Use Continuar consulta para retomar.');render();};
  el('ExpensesForm').onsubmit=event=>{event.preventDefault();saveExpenses();};el('ExpensesValue').oninput=expenseChanged;el('Recharge').onchange=expenseChanged;
  el('OpenExpenses').onclick=()=>{el('ExpensesDetails').open=true;el('ExpensesDetails').scrollIntoView?.({behavior:'smooth',block:'start'});return globalThis.brazaExpenseLedger?.refresh();};
  el('ExpensesZero').onclick=()=>saveExpenses({zero:true});el('ExpensesReload').onclick=()=>{dirty=false;editSequence++;fillExpenses({force:true});render();schedule();scheduleCatalog();};el('Identify').onclick=identify;
  el('CostCheck').onclick=()=>checkCostDiagnostic();el('CostRecover').onclick=()=>checkCostDiagnostic({recover:true});el('CostCopy').onclick=copyCostDiagnostic;
  el('CheckpointDetails').ontoggle=()=>{if(el('CheckpointDetails').open)loadCheckpointHistory();};
  el('CheckpointHistoryRefresh').onclick=()=>{checkpointHistoryStale=true;return loadCheckpointHistory();};
  for(const name of ['ProductSearch','ProductFilter','ProductSort','ProductPageSize'])el(name)[name==='ProductSearch'?'oninput':'onchange']=()=>{productPage=1;drawProducts();scheduleCatalog();};
  el('ProductPrevious').onclick=()=>{productPage--;drawProducts();scheduleCatalog();};el('ProductNext').onclick=()=>{productPage++;drawProducts();scheduleCatalog();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);timer=null;clearTimeout(catalogTimer);catalogTimer=null;}else{schedule();scheduleCatalog();}});
  manualCollection=false;return readWorkspaceView();
 }
 function stop(){try{globalThis.brazaExpenseLedger?.stop();globalThis.brazaReconciliation?.stop();globalThis.brazaEscrowReleases?.stop();}catch{}started=false;viewRequest++;viewPromise=null;priorityPromise=null;manualCollection=false;resetCostDiagnostic();catalogRequest++;catalogBusy=false;clearTimeout(catalogTimer);catalogTimer=null;paused=true;resumeOnVisible=false;collectionRecovery=null;generation++;checkpointHistoryRequest++;checkpointHistoryBusy=false;busy=false;adsBusy=false;clearTimeout(timer);timer=null;controls();}
 globalThis.brazaMonthDashboard={clientContract,prepare,bootstrapState,start,refresh,refreshCosts,stop,supportsCatalogQueue:catalogFeature,syncCatalogCandidates,refreshCatalog:()=>{catalogNeedsRead=true;return updateCatalog();},catalogMetadata:item=>catalogProducts.get(item)||null};
})();
`+EXPENSE_LEDGER_CLIENT+BUSINESS_RECONCILIATION_CLIENT+ESCROW_RELEASES_CLIENT;
