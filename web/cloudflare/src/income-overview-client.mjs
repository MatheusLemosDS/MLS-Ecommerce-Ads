import {projectIncomeOverviewFrame} from '../../finance/src/income-overview-frame.mjs';
import {projectIncomeDetailFrame} from '../../finance/src/income-detail-frame.mjs';
import {projectPendingIncomeScanFrame} from '../../finance/src/pending-income-frame.mjs';
import {projectBusinessIncomeOverview} from './business-income-overview.mjs';
import {projectBusinessIncomeDetail} from './business-income-detail.mjs';
import {projectBusinessPendingIncomeScan} from './business-pending-income-scan.mjs';

export const INCOME_OVERVIEW_CLIENT=String.raw`
(()=>{
 ${projectIncomeOverviewFrame.toString()}
 ${projectBusinessIncomeOverview.toString()}
 ${projectIncomeDetailFrame.toString()}
 ${projectBusinessIncomeDetail.toString()}
 ${projectPendingIncomeScanFrame.toString()}
 ${projectBusinessPendingIncomeScan.toString()}
 let api=null,started=false,pending=null,lastAttempt=0,value=null,generation=0,detail=null,detailPending=null,detailLastAttempt=0,scanValue=null,scanFailed=false,page=0,pageIdentity='';
 const pageLength=50,safe=value=>Number.isSafeInteger(value)&&!Object.is(value,-0),el=name=>document.getElementById('commandCenterPending'+name);
 const money=value=>{if(!safe(value))return 'Não confirmado';const cents=BigInt(value),absolute=cents<0n?-cents:cents,fraction=String(absolute%100n).padStart(2,'0');return (cents<0n?'-':'')+new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).formatToParts(absolute/100n).map(part=>part.type==='fraction'?fraction:part.value).join('');};
 const time=value=>safe(value)&&value>0?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value*1000)):'Horário não informado';
 const node=(tag,text,cls)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;if(cls)result.className=cls;return result;};
 function renderSignal(){try{globalThis.mlsAgentRegistry?.refresh?.();}catch{}renderDetail();}
 function observe(){
  if(!started||typeof api!=='function'||document.hidden)return Promise.resolve(value!==null);
  if(pending)return pending;const now=Date.now();if(lastAttempt&&now>=lastAttempt&&now-lastAttempt<60000)return Promise.resolve(value!==null);lastAttempt=now;const token=++generation;
  const work=(async()=>{try{const raw=await api('finance/income-overview'),checked=projectBusinessIncomeOverview(raw,projectIncomeOverviewFrame);if(!started||token!==generation)return false;if(!checked)throw Error();value=checked;renderSignal();return true;}catch{if(started&&token===generation)renderSignal();return false;}})().finally(()=>{if(pending===work)pending=null;});pending=work;return work;
 }
 function observeDetail(){
  if(!started||typeof api!=='function'||document.hidden)return Promise.resolve(detail!==null||scanValue!==null);const pendingCents=value?.report?.pending?.cents;if(!safe(pendingCents)||pendingCents<=0)return Promise.resolve(false);
  if(detailPending)return detailPending;const now=Date.now();if(detailLastAttempt&&now>=detailLastAttempt&&now-detailLastAttempt<60000)return Promise.resolve(detail!==null||scanValue!==null);detailLastAttempt=now;const token=generation;
  const work=(async()=>{
   const results=await Promise.allSettled([Promise.resolve().then(()=>api('finance/income-detail')),Promise.resolve().then(()=>api('finance/income-detail?evidence=scan-v1'))]);
   if(!started||token!==generation)return false;let good=false;
   try{if(results[0].status!=='fulfilled')throw Error();const checked=projectBusinessIncomeDetail(results[0].value,projectIncomeDetailFrame);if(!checked)throw Error();if(!detail||checked.checked_at>=detail.checked_at){detail=checked;good=true;}}catch{}
   try{
    if(results[1].status!=='fulfilled')throw Error();const checked=projectBusinessPendingIncomeScan(results[1].value,frame=>projectPendingIncomeScanFrame(frame,projectIncomeDetailFrame));if(!checked)throw Error();
    const previous=scanValue?.frame,latest=checked.frame;
    if(scanValue&&checked.checked_at<scanValue.checked_at||previous&&latest&&latest.checked_at<previous.checked_at||previous?.report&&(!latest?.report||latest.report.completed_at<previous.report.completed_at))throw Error();
    scanValue=checked;scanFailed=false;good=true;
   }catch{scanFailed=true;}
   renderSignal();return good;
  })().finally(()=>{if(detailPending===work)detailPending=null;});detailPending=work;return work;
 }
 function renderDetail(){
  const status=el('Status'),target=el('Rows');if(!started||!status||!target||!scanValue)return false;
  const frame=scanValue.frame,scan=frame?.scan,report=frame?.report,legacy=detail?.report;
  const rows=report?.rows??legacy?.rows??[],identity=report?'scan:'+report.scan_id+':'+report.completed_at:legacy?'legacy:'+legacy.checked_at:'empty';
  if(identity!==pageIdentity){pageIdentity=identity;page=0;}const pages=Math.max(1,Math.ceil(rows.length/pageLength));page=Math.min(Math.max(0,page),pages-1);
  status.replaceChildren();status.dataset.scanState=scan?.state??scanValue.status;
  const copy=(text,cls='command-pending-scan-note')=>{const paragraph=node('p',text,cls);status.append(paragraph);return paragraph;};
  if(scanFailed)copy('Não foi possível atualizar a leitura local. A última coleta válida continua preservada.');
  if(scanValue.attempt?.status==='UNAVAILABLE'){copy('A última tentativa automática não foi concluída. Os dados válidos salvos continuam preservados.');if(scan?.state==='COMPLETE')copy('Próxima tentativa automática: '+time(scanValue.attempt.next_attempt_at)+'.');}
  if(scan){
   const labels={RUNNING:'Coleta automática em andamento',COMPLETE:'Varredura de páginas concluída',RETRY_WAIT:'Coleta aguardando nova tentativa',ERROR:'Coleta interrompida',LIMIT_REACHED:'Coleta atingiu o limite de conferência'};
   const progress=copy(labels[scan.state]+' · '+scan.pages_read+' página(s) · '+scan.unique_entries+' registro(s) · '+scan.unique_orders+' pedido(s).');progress.id='commandCenterPendingScanProgress';progress.setAttribute('role','status');progress.setAttribute('aria-live','polite');
   if(scan.state!=='COMPLETE')copy('Próxima tentativa automática: '+time(scan.next_attempt_at)+'. A tela consulta somente os dados salvos.');
   if(scan.error){const labels={PERMISSION_DENIED:'Permissão de leitura rejeitada pela fonte.',RATE_LIMIT:'A fonte limitou temporariamente as consultas.',TIMEOUT:'A consulta atingiu o prazo permitido.',UNAVAILABLE:'A fonte está temporariamente indisponível.',INVALID_RESPONSE:'A resposta não passou na validação.',REPEATED_CURSOR:'A fonte repetiu um marcador de página.',REPEATED_PAGE:'A fonte repetiu uma página.',EMPTY_CONTINUATION:'A fonte não avançou na leitura.',LIMIT_REACHED:'O limite seguro desta varredura foi alcançado.',SCAN_EXPIRED:'Esta varredura precisa ser reiniciada pelo coletor.'};copy(labels[scan.error]||'A coleta precisa de nova conferência.');}
  }else if(scanValue.attempt?.status==='UNAVAILABLE')copy('A coleta completa ainda não está disponível. A primeira página salva continua como referência parcial.');
  else copy('Aguardando a primeira varredura completa. A coleta acontece automaticamente em background.');
  const overview=value?.report,overviewAmount=overview?.pending?.cents;
  if(report){
   copy((scan&&scan.scan_id!==report.scan_id?'Última varredura completa preservada':'Varredura completa salva')+' · '+report.rows.length+' registro(s) / '+report.unique_orders+' pedido(s) · '+report.pages_read+' página(s).');
   copy('Observações da fonte: '+time(report.source_oldest_at)+' até '+time(report.source_latest_at)+'. Conclusão: '+time(report.completed_at)+'.');
   if(report.amount_complete)copy('Escrow estimado na varredura: '+money(report.known_amount_cents)+'.');
   else copy('Total não confirmado · '+report.unknown_amount_count+' valor(es) sem conversão segura · '+report.conflicting_orders+' pedido(s) com registros conflitantes. Valores desconhecidos não foram convertidos em zero.');
   if(report.duplicate_entries)copy(report.duplicate_entries+' registro(s) repetido(s) foram identificados sem somá-los novamente.');
   if(safe(overviewAmount)){
    copy('Pending do Overview: '+money(overviewAmount)+' em '+time(overview.checked_at)+'.');
    if(report.amount_complete){
     const delta=BigInt(report.known_amount_cents)-BigInt(overviewAmount);
     if(overview.checked_at>report.source_oldest_at)copy('Os horários do Overview e das páginas diferem; a comparação total está suspensa.');
     else if(delta===0n)copy('Os valores coincidem nesta leitura descritiva. Isso não confirma o mês nem o recebimento bancário.');
     else if(delta>=BigInt(Number.MIN_SAFE_INTEGER)&&delta<=BigInt(Number.MAX_SAFE_INTEGER))copy('Diferença descritiva frente ao Overview: '+money(Number(delta))+'. Os dados são observados em horários distintos; conferir no Seller Centre.');
     else copy('A diferença excede o limite seguro de cálculo e não foi exibida.');
    }
   }
   copy('A lista é uma observação de uma fonte que pode mudar durante a coleta. Concluir as páginas não confirma saldo em um instante, competência mensal, lucro realizado ou depósito no banco.');
  }else if(legacy){copy('Primeira página salva · '+legacy.returned_count+' registro(s). Esta referência permanece parcial enquanto a varredura completa não termina.');copy('Fonte da primeira página: '+time(legacy.checked_at)+'. Não representa o total mensal nem recebimento no banco.');}
  target.replaceChildren();
  for(const row of rows.slice(page*pageLength,(page+1)*pageLength)){
   const card=node('article',undefined,'command-pending-row');card.dataset.pendingEntry=row.entry_hash;card.append(node('strong','Pedido interno '+row.order_hash.slice(0,10)+'…'),node('span',row.status||'Pending'),node('small','Escrow estimado: '+(safe(row.estimated_escrow_cents)?money(row.estimated_escrow_cents):'Valor não confirmado')));if(safe(row.estimated_payout_time))card.append(node('small','Previsão informada: '+time(row.estimated_payout_time)));target.append(card);
  }
  let controls=document.getElementById('commandCenterPendingPagination');if(!controls){controls=node('nav',undefined,'command-pending-pagination');controls.id='commandCenterPendingPagination';controls.setAttribute('aria-label','Páginas locais dos registros Pending');target.insertAdjacentElement('afterend',controls);}controls.replaceChildren();controls.hidden=rows.length===0;
  if(rows.length){const previous=node('button','Anterior','button-link'),label=node('span','Página '+(page+1)+' de '+pages+' · '+(page*pageLength+1)+'–'+Math.min((page+1)*pageLength,rows.length)+' de '+rows.length),next=node('button','Próxima','button-link');previous.type='button';next.type='button';previous.id='commandCenterPendingPrevious';next.id='commandCenterPendingNext';label.id='commandCenterPendingPageLabel';label.setAttribute('aria-live','polite');previous.disabled=page===0;next.disabled=page>=pages-1;previous.onclick=()=>{if(!started||page<=0)return;page--;renderDetail();document.getElementById('commandCenterPendingPrevious')?.focus?.({preventScroll:true});};next.onclick=()=>{if(!started||page>=pages-1)return;page++;renderDetail();document.getElementById('commandCenterPendingNext')?.focus?.({preventScroll:true});};controls.append(previous,label,next);}
  return true;
 }
 function reset(){pending=null;lastAttempt=0;value=null;detail=null;detailPending=null;detailLastAttempt=0;scanValue=null;scanFailed=false;page=0;pageIdentity='';const controls=document.getElementById('commandCenterPendingPagination');controls?.remove?.();}
 function start(options){if(typeof options?.api!=='function')return false;if(started&&api===options.api)return true;generation++;reset();api=options.api;started=true;observe();return true;}
 function stop(){started=false;generation++;api=null;reset();const status=el('Status'),target=el('Rows');if(status)status.textContent='Abra para carregar os detalhes disponíveis.';target?.replaceChildren?.();}
 function snapshot(){return value?{schema:'mls_income_overview_snapshot_v1',checked_at:value.report?.checked_at??value.checked_at,status:value.status,pending_cents:value.report?.pending?.cents??null,released_cents:value.report?.released?.cents??null,currency_basis:value.report?.currency_basis??null,basis:value.report?.basis??null}:null;}
 function detailSnapshot(){const report=detail?.report;if(!report)return null;return {schema:'mls_income_detail_snapshot_v1',checked_at:report.checked_at,status:detail.status,returned_count:report.returned_count,has_more:report.has_more,rows:report.rows.map(row=>({...row})),basis:report.basis};}
 function scanSnapshot(){return scanValue?projectBusinessPendingIncomeScan(scanValue,frame=>projectPendingIncomeScanFrame(frame,projectIncomeDetailFrame)):null;}
 function auditDetailSnapshot(){const report=scanValue?.frame?.report;if(!report?.amount_complete||report.conflicting_orders!==0)return null;return {schema:'mls_pending_income_scan_audit_v1',checked_at:report.source_oldest_at,status:scanValue.status,returned_count:report.rows.length,has_more:false,rows:report.rows.map(row=>({...row})),basis:report.basis};}
 globalThis.brazaIncomeOverview=Object.freeze({start,observe,observeDetail,stop,renderDetail,getSnapshot:snapshot,getDetailSnapshot:detailSnapshot,getScanSnapshot:scanSnapshot,getAuditDetailSnapshot:auditDetailSnapshot});
})();
`;
