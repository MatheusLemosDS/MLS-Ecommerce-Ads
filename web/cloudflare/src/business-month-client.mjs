import {projectBusinessMonth} from './business-month.mjs';
import {projectAdsCalendar} from './ads-calendar.mjs';
import {projectBusinessMonthProducts} from './business-month-products.mjs';
import {buildAccountDiagnosis} from './account-diagnosis.mjs';
import {buildBusinessCheckpoint} from './business-checkpoint.mjs';

export const BUSINESS_MONTH_CLIENT=String.raw`
(()=>{
 ${projectAdsCalendar.toString()}
 ${projectBusinessMonthProducts.toString()}
 ${projectBusinessMonth.toString()}
 ${buildBusinessCheckpoint.toString()}
 ${buildAccountDiagnosis.toString()}
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
 let productPage=1,productMonth='';
 const financeRefreshInterval=300000;
 let lastFinancialRefreshAt=0,automaticBlocked=false,resumeOnVisible=false;
 const productOpen=new Set();
 let catalogState=null,catalogBusy=false,catalogTimer=null,catalogRequest=0,catalogNeedsRead=true,catalogError='',catalogPaused=false,catalogProductsChanged=false,catalogVisibleIds=[],catalogSignature='';
 const catalogProducts=new Map();
 const catalogFeature=()=>Number.isSafeInteger(frame?.classification_revision);
 const catalogMessages={CATALOG_NOT_READ:'Aguardando a consulta automática do catálogo.',CATALOG_UNAVAILABLE:'A consulta falhou; a fila tentará este produto novamente.',CATALOG_REQUEST_FAILED:'A consulta falhou; os outros produtos continuam na fila.',UNRECOGNIZED_TYPE:'O tipo deste produto ainda não foi reconhecido com segurança.',SIZE_AMBIGUOUS:'O tamanho da variação precisa de conferência.',RULE_CONFLICT:'Mais de uma regra de custo corresponde a esta variação.',NO_COST_REGISTERED:'Falta cadastrar um custo para este tipo de produto.',RULE_NOT_MATCHED:'Nenhuma regra de custo reconhece este tipo e tamanho com segurança.',RULE_ASSIGNMENT_PENDING:'A regra de custo informada precisa de conferência de tamanho ou disponibilidade.',UNRECOGNIZED_VARIATION:'O catálogo não identificou o tipo e o tamanho desta variação com segurança.',INDEX_NOT_VALID:'A combinação de opções desta variação precisa ser conferida no catálogo.',NO_MODELS:'O catálogo não retornou variações para este produto.',CATALOG_CONFLICT:'Outra atualização está conferindo este produto; a fila continuará automaticamente.',CATALOG_STALE_RESPONSE:'Uma resposta antiga foi descartada. A fila consultará novamente.',AXES_NOT_RECOGNIZED:'Os eixos de variação não identificam a composição com segurança.',OPTION_NOT_RECOGNIZED:'O tamanho retornado pelo catálogo ainda não foi reconhecido.',CATALOG_INVALID:'Os dados do catálogo não passaram na conferência.',CATALOG_STALE:'A classificação salva está preservada enquanto o catálogo é atualizado.'};
 function catalogReason(reason,status){return catalogMessages[reason]||(status==='QUEUED'||status==='RUNNING'?'A identificação automática está na fila.':status==='RETRY_WAIT'?'A consulta será repetida automaticamente, sem impedir os outros produtos.':'O catálogo precisa de uma conferência de tipo ou tamanho.');}
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
 function canClassify(){return started&&catalogFeature()&&!document.hidden&&!busy&&!adsBusy&&!saving&&!dirty&&!paused;}
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
 function status(text,error=false){message=text;failed=error;el('Status').textContent=text;el('Status').dataset.status=error?'error':'normal';}
 function controls(){
  el('Refresh').disabled=busy||adsBusy||saving;el('Refresh').textContent=busy?'Consultando…':paused?'Continuar consulta':'Atualizar mês';el('Pause').hidden=!busy;el('Pause').disabled=paused;el('Previous').disabled=saving;el('Select').disabled=saving;
  const conflict=!!frame&&dirty&&draftRevision!==frame.expenses.revision;
  el('ExpensesSave').disabled=!frame||busy||adsBusy||saving||conflict;
  el('ExpensesZero').disabled=!frame||busy||adsBusy||saving||conflict;
  el('ExpensesReload').hidden=!dirty;
  el('Identify').disabled=busy||adsBusy||saving;
 }
 function drawWaterfall(){
  const target=el('Waterfall');target.replaceChildren();if(!frame)return;
  const row=(label,amount,sign='')=>{const entry=node('div',undefined,'month-waterfall-row');entry.append(node('dt',label),node('dd',amount===null?'Pendente':sign+money(amount)));target.append(entry);};
  const mei=frame.tax?.regime==='MEI';
  row('Vendas dos produtos',frame.sales_cents);
  const difference=Number.isSafeInteger(frame.sales_cents)&&Number.isSafeInteger(frame.expected_repass_cents)?BigInt(frame.sales_cents)-BigInt(frame.expected_repass_cents):null;
  const adjustment=difference!==null&&difference>=BigInt(Number.MIN_SAFE_INTEGER)&&difference<=BigInt(Number.MAX_SAFE_INTEGER)?Number(difference):null;
  row('Diferença líquida entre vendas e repasse',adjustment);
  row('Repasse previsto · deduções da Shopee já consideradas',frame.expected_repass_cents);
  row('Produção',frame.production_cost_cents,'− ');row(mei?'DAS-MEI mensal · uma vez no mês':'Imposto previsto · 2%',frame.invoice_tax_cents,'− ');
  if(frame.ads_adjustment_cents>0){
   if(frame.expenses.recharge_treatment==='ADS_RECHARGE')row('Recarga de anúncios reposta',frame.ads_adjustment_cents,'+ ');
   else if(frame.expenses.recharge_treatment==='UNCONFIRMED')row('Recarga ou suporte · tratamento a conferir',null);
  }
  row('Gasto com anúncios',frame.ads?.status==='AVAILABLE'?frame.ads.expense_cents:null,'− ');
  row('Outras despesas do mês',frame.expenses.external_expenses_cents,'− ');
  row('Resultado líquido previsto',frame.result.net_estimate_cents);
 }
 function drawTaxAndExpenses(){
  const mei=frame?.tax?.regime==='MEI';
  el('TotalExpensesLabel').textContent='Custos após o repasse';
  el('TotalExpensesHelp').textContent='Produção, '+(mei?'DAS-MEI mensal':'imposto')+', anúncios e outras despesas. A diferença entre vendas e repasse pode incluir taxas, frete e outros ajustes da Shopee; ela já está considerada no repasse e não é descontada novamente.';
  const amounts=frame?[frame.production_cost_cents,frame.invoice_tax_cents,frame.ads?.status==='AVAILABLE'?frame.ads.expense_cents:null,frame.expenses.external_expenses_cents]:[];
  const subtotal=amounts.length===4&&amounts.every(Number.isSafeInteger)?amounts.reduce((sum,value)=>sum+BigInt(value),0n):null;
  el('TotalExpenses').textContent=subtotal!==null&&subtotal>=0n&&subtotal<=BigInt(Number.MAX_SAFE_INTEGER)?money(Number(subtotal)):'Pendente';
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
  for(const [label,ready] of [['Pedidos e valores financeiros',complete&&c.payment_missing===0&&c.cancel_pending===0&&c.other===0&&c.unknown===0&&!frame.result.pending.includes('FINANCIAL_SOURCE_STALE')],['Custos de produção',complete&&frame.production_cost_cents!==null],[frame.tax?.regime==='MEI'?'DAS-MEI mensal':'Imposto de 2%',complete&&frame.invoice_tax_cents!==null&&!frame.result.pending.includes('TAX_POLICY_REQUIRED')],['Gasto dos anúncios',frame.ads?.status==='AVAILABLE'],['Outras despesas',frame.expenses.external_expenses_cents!==null],['Devoluções e ajustes',complete&&c.returns===0&&c.returns_unknown===0&&!frame.result.pending.includes('ADJUSTMENT_UNAVAILABLE')&&!frame.result.pending.includes('RECHARGE_TREATMENT_REQUIRED')]]){
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
  globalThis.brazaAutomationWorkspace?.render(frame?buildAccountDiagnosis(frame):null);drawCheckpoint();
  if(!frame){
   for(const key of ['Sales','Ads','Roas']){el(key).textContent=busy?'Consultando':'Pendente';el(key+'Card').dataset.status='pending';}el('Net').textContent='Em apuração';el('NetCard').dataset.status='pending';el('Margin').textContent='';el('Coverage').replaceChildren();el('Waterfall').replaceChildren();el('Readiness').replaceChildren();el('Pending').hidden=true;el('Badge').textContent=busy?'Consultando':'Aguardando consulta';drawTaxAndExpenses();drawProducts();controls();return;
  }
  const c=frame.coverage,ads=frame.ads,broad=ads?.totals.broad,net=frame.result.net_estimate_cents;
  setMetric('Sales',frame.sales_cents===null?null:money(frame.sales_cents),frame.sales_cents===null?'Já informado: '+money(frame.known_sales_cents)+'. Falta conferir parte dos pedidos pagos.':'Produtos dos '+c.paid+' pedido(s) pagos criados nas datas do mês.');
  setMetric('Ads',ads?.status==='AVAILABLE'?money(ads.expense_cents):null,ads?'Gasto confirmado em '+ads.covered_days+' de '+ads.total_days+' dia(s). Dias ausentes permanecem pendentes.':'Consultando o gasto da conta de anúncios nas mesmas datas.');
  setMetric('Roas',broad?.calculated_roas_raw===null||broad?.calculated_roas_raw===undefined?null:ratio(broad.calculated_roas_raw),broad?.gmv_cents===null||broad?.gmv_cents===undefined?'Vendas atribuídas aos anúncios ainda pendentes.':'Vendas atribuídas aos anúncios: '+money(broad.gmv_cents)+'. Este valor difere das vendas totais da loja.');
  if(ads?.status==='AVAILABLE'&&ads.expense_cents===0&&broad?.calculated_roas_raw===null){el('Roas').textContent='Sem investimento';el('RoasCard').dataset.status='available';}
  setMetric('Net',net===null?null:money(net),net===null?'Os valores faltantes estão identificados abaixo.':'Produção, '+(frame.tax?.regime==='MEI'?'DAS-MEI mensal':'imposto')+', anúncios e outras despesas já descontados. É uma previsão, não o valor recebido em banco.');
  if(net===null)el('Net').textContent=frame.status==='RUNNING'?'Em apuração':'Em conciliação';
  el('NetCard').dataset.negative=String(net!==null&&net<0);
  el('Margin').textContent=frame.result.net_margin_bps===null?'':'Margem prevista: '+new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}).format(frame.result.net_margin_bps/100)+'%';
  el('Badge').textContent=frame.status==='RUNNING'?'Consultando':frame.status==='LIMIT_REACHED'?'Mês parcial':net===null?'Há pendências':'Previsão completa';
  el('Coverage').replaceChildren();for(const text of [c.paid+' pedido(s) pagos',c.completed+' concluído(s)',c.ongoing+' em andamento',c.cancelled+' cancelado(s) excluído(s)',c.unpaid+' não pago(s) excluído(s)'])el('Coverage').append(node('span',text));
  if(c.cancel_pending)el('Coverage').append(node('span',c.cancel_pending+' em cancelamento · em revisão'));
  if(c.other+c.unknown)el('Coverage').append(node('span',(c.other+c.unknown)+' com situação a conferir'));
  const warnings=frame.result.pending.filter(code=>code!=='COLLECTING');el('Pending').hidden=!warnings.length;el('PendingTitle').textContent=warnings.length===1?'Falta uma conferência para concluir o resultado':'O que falta para concluir o resultado';el('PendingList').replaceChildren();for(const code of warnings)el('PendingList').append(node('li',pendingMessages[code]||'Parte dos dados ainda precisa ser conferida.'));
  el('Identify').hidden=!frame.unmapped_variants.length;
  if(warnings.includes('EXTERNAL_EXPENSES_REQUIRED')&&warnings.length===1)el('ExpensesDetails').open=true;
  el('RechargeField').hidden=!(frame.ads_adjustment_cents>0||warnings.includes('RECHARGE_TREATMENT_REQUIRED'));
  drawWaterfall();drawTaxAndExpenses();drawReadiness();drawProducts();fillExpenses();
  if(dirty){el('ExpenseState').textContent=draftRevision!==frame.expenses.revision?'As despesas foram alteradas em outra sessão. Sua edição foi preservada; carregue os valores salvos antes de salvar novamente.':'Há uma edição de despesas ainda não salva.';}
  else el('ExpenseState').textContent=frame.expenses.external_expenses_cents===null?'Outras despesas ainda não informadas. Informe o valor ou confirme que não há despesas.':'Despesas salvas para '+monthName(frame.month)+' · versão '+frame.expenses.revision+'.';
  const progress=frame.progress;el('Progress').hidden=!busy;el('Progress').value=progress.windows_total?Math.round(progress.windows_complete/progress.windows_total*100):0;
  const formatTime=value=>Number.isSafeInteger(value)&&value>0?new Date(value*1000).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'pendente',sources=frame.source_checked_at;
  const consultation=sources?'Pedidos e financeiro: leitura mais antiga '+formatTime(sources.finance_oldest_at)+'; mais recente '+formatTime(sources.finance_latest_at)+'. Anúncios consultados em '+formatTime(sources.ads_at)+'. Idade do financeiro: '+sourceAge(sources.finance_oldest_at)+'; idade dos anúncios: '+sourceAge(sources.ads_at)+'.':'Horário informado pela leitura anterior: '+formatTime(frame.checked_at)+'. Idade da leitura: '+sourceAge(frame.checked_at)+'. Essa leitura não separa os horários do financeiro e dos anúncios.';
  el('Scope').textContent='Pedidos pagos criados de '+frame.start_date.split('-').reverse().join('/')+' a '+frame.end_date.split('-').reverse().join('/')+' e anúncios nas mesmas datas. Custos atuais de produção. '+consultation+' Brasília. Recebimentos bancários ainda não conciliados.';
  for(const key of ['AdsLink','DetailsLink'])el(key).href='/dashboard?month='+encodeURIComponent(frame.month);
  controls();
 }
 function checkedFrame(value,expectedMonth){const checked=projectBusinessMonth(value);if(!checked||checked.month!==expectedMonth)throw Error('Os dados mensais não puderam ser conferidos. Atualize o mês para tentar novamente.');return checked;}
 function apply(value,expectedMonth){const previous=frame?.classification_revision;frame=checkedFrame(value,expectedMonth);if(previous!==frame.classification_revision){catalogNeedsRead=true;if(previous!==undefined)catalogProductsChanged=true;}invalidateCheckpointHistory();render();return frame;}
 function schedule(){
  clearTimeout(timer);timer=null;if(!started||document.hidden||busy||adsBusy||saving||dirty||paused||automaticBlocked||frame?.status!=='COMPLETE'&&!resumeOnVisible||month!==today().slice(0,7))return;
  // Ads updates never advance the financial clock: orders, cancellations and
  // payouts must be imported again even while Ads continues to update.
  const financialDue=resumeOnVisible?Date.now():lastFinancialRefreshAt+financeRefreshInterval;
  const delay=Math.min(60000,Math.max(0,financialDue-Date.now()));
  timer=setTimeout(()=>{timer=null;if(document.hidden||dirty||paused||automaticBlocked)return;return Date.now()>=financialDue?refresh({automatic:true}):refreshAds();},delay);
 }
 async function request(operation,selected=month){return api('finance/business-month',{operation,month:selected});}
 async function refresh({automatic=false}={}){
  if(!started||saving||automatic&&(dirty||paused||automaticBlocked||document.hidden||adsBusy))return false;
  const selected=el('Select').value;if(!validMonth(selected)){status('Escolha um mês válido até o mês atual.',true);return false;}
  const changed=selected!==month;if(busy&&!changed)return false;
  const token=++generation;catalogRequest++;catalogBusy=false;clearTimeout(catalogTimer);catalogTimer=null;month=selected;paused=false;automaticBlocked=false;resumeOnVisible=false;busy=true;adsBusy=false;clearTimeout(timer);timer=null;
  if(changed){frame=null;catalogState=null;catalogPaused=false;catalogProducts.clear();catalogSignature='';catalogNeedsRead=true;invalidateCheckpointHistory();dirty=false;editSequence++;draftRevision=0;el('ExpensesValue').value='';el('Recharge').value='UNCONFIRMED';}
  status(automatic?'Atualizando vendas, cancelamentos e anúncios de '+monthName(month)+'…':'Consultando os pedidos de '+monthName(month)+'…');render();
  const current=()=>token===generation&&month===selected;
  try{
   let value=null;
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
   const keepCached=value?.status==='COMPLETE';
   const update=raw=>{const checked=checkedFrame(raw,selected);if(!keepCached||checked.status!=='RUNNING'){frame=checked;invalidateCheckpointHistory();render();}return checked;};
   const initial=await request('start',selected);if(!current())return false;value=update(initial);
   let steps=0;
   while(value.status==='RUNNING'&&!paused&&!document.hidden&&steps<610){
    status((keepCached?'Mostrando a última leitura salva. ':'')+'Conferindo os pedidos do mês… '+value.coverage.orders+' pedido(s) consultado(s).');
    const raw=await request('step',selected);if(!current())return false;value=update(raw);steps++;
    if(value.result.pending.includes('SOURCE_UNAVAILABLE'))break;
   }
   if(!current())return false;
   if(value.result.pending.includes('SOURCE_UNAVAILABLE'))automaticBlocked=true;
   if(document.hidden&&!paused){resumeOnVisible=!automaticBlocked;status('A atualização continua automaticamente quando este painel voltar à tela.');}
   else if(value.status==='COMPLETE'&&!paused){
    let catalogueFailed=false;
    if(!catalogFeature()&&value.unmapped_variants.length&&typeof syncVariants==='function'){
     status('Associando automaticamente os custos dos produtos vendidos…');
     try{catalogueFailed=await syncVariants(value.unmapped_variants)===false;}catch{catalogueFailed=true;}
     if(!current())return false;const reread=await request('read',selected);if(!current())return false;apply(reread,selected);
    }
    if(!current())return false;status('Conferindo os anúncios nas mesmas datas…');
    const raw=await request('ads',selected);if(!current())return false;value=apply(raw,selected);
    if(value.ads?.status==='AVAILABLE'&&!value.result.pending.includes('SOURCE_UNAVAILABLE'))lastFinancialRefreshAt=Date.now();
    else automaticBlocked=true;
    status(catalogueFailed?'Valores mensais atualizados. Há produtos com identificação pendente; confira os motivos abaixo.':'Dados do mês atualizados. Confira o resultado e as pendências abaixo.');
   }else if(paused)status('Consulta pausada após a última resposta. Use Continuar consulta para retomar.');
   else if(value.status==='LIMIT_REACHED')status('O mês está parcial porque o limite de pedidos foi atingido. Os totais pendentes não são estimados como zero.');
   else status('Parte da consulta ficou pendente. Use Atualizar mês para retomar a leitura.');
   return true;
  }catch(error){if(current()){automaticBlocked=true;status(error?.message||'Não foi possível atualizar o mês. Tente novamente.',true);if(frame)render();}return false;}
  finally{if(current()){busy=false;render();schedule();scheduleCatalog();}}
 }
 async function refreshAds(){
  if(!started||!frame||busy||adsBusy||saving||dirty||document.hidden)return false;
  if(frame.ads&&Date.now()-frame.ads.fetched_at*1000<60000){schedule();return false;}
  const token=generation,selected=month;adsBusy=true;controls();
  try{const raw=await request('ads',selected);if(token!==generation||selected!==month)return false;apply(raw,selected);if(frame.ads?.status!=='AVAILABLE')automaticBlocked=true;return true;}
  catch{if(token===generation){automaticBlocked=true;status('Não foi possível atualizar os anúncios. A leitura anterior mantém seu horário de consulta; use Atualizar mês para conferir.',true);}return false;}
  finally{if(token===generation){adsBusy=false;controls();schedule();scheduleCatalog();}}
 }
 async function refreshCosts(){
  if(!started||!frame||busy||adsBusy||saving)return false;
  const token=generation,selected=month;
  try{const raw=await request('read',selected);if(token!==generation||selected!==month)return false;apply(raw,selected);schedule();scheduleCatalog();return true;}
  catch{if(token===generation)status('Os custos foram preservados, mas não foi possível recalcular o mês. Use Atualizar mês para conferir.',true);return false;}
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
   frame=result;invalidateCheckpointHistory();draftRevision=result.expenses.revision;
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
  api=options.api;syncVariants=options.syncVariants;onCatalogChanged=options.onCatalogChanged;started=true;
  let selected;try{const params=new URLSearchParams(globalThis.location?.search||'');selected=params.getAll('month').length===1?params.get('month'):null;}catch{}
  el('Select').max=today().slice(0,7);el('Select').value=validMonth(selected)?selected:today().slice(0,7);
  el('Refresh').onclick=()=>refresh();el('Select').onchange=()=>refresh();
  el('Previous').onclick=()=>{const basis=validMonth(el('Select').value)?el('Select').value:today().slice(0,7),date=new Date(basis+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()-1);el('Select').value=date.toISOString().slice(0,7);refresh();};
  el('Pause').onclick=()=>{paused=true;el('Pause').disabled=true;status('A consulta será pausada após a resposta em andamento.');};
  el('ExpensesForm').onsubmit=event=>{event.preventDefault();saveExpenses();};el('ExpensesValue').oninput=expenseChanged;el('Recharge').onchange=expenseChanged;
  el('ExpensesZero').onclick=()=>saveExpenses({zero:true});el('ExpensesReload').onclick=()=>{dirty=false;editSequence++;fillExpenses({force:true});render();schedule();scheduleCatalog();};el('Identify').onclick=identify;
  el('CheckpointDetails').ontoggle=()=>{if(el('CheckpointDetails').open)loadCheckpointHistory();};
  el('CheckpointHistoryRefresh').onclick=()=>{checkpointHistoryStale=true;return loadCheckpointHistory();};
  for(const name of ['ProductSearch','ProductFilter','ProductSort','ProductPageSize'])el(name)[name==='ProductSearch'?'oninput':'onchange']=()=>{productPage=1;drawProducts();scheduleCatalog();};
  el('ProductPrevious').onclick=()=>{productPage--;drawProducts();scheduleCatalog();};el('ProductNext').onclick=()=>{productPage++;drawProducts();scheduleCatalog();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);timer=null;clearTimeout(catalogTimer);catalogTimer=null;}else{schedule();scheduleCatalog();}});
  return refresh();
 }
 function stop(){started=false;catalogRequest++;catalogBusy=false;clearTimeout(catalogTimer);catalogTimer=null;paused=true;resumeOnVisible=false;generation++;checkpointHistoryRequest++;checkpointHistoryBusy=false;busy=false;adsBusy=false;clearTimeout(timer);timer=null;controls();}
 globalThis.brazaMonthDashboard={start,refresh,refreshCosts,stop,supportsCatalogQueue:catalogFeature,syncCatalogCandidates,refreshCatalog:()=>{catalogNeedsRead=true;return updateCatalog();},catalogMetadata:item=>catalogProducts.get(item)||null};
})();
`;
