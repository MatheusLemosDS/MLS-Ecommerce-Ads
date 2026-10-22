import {projectBusinessMonth} from './business-month.mjs';
import {projectAdsCalendar} from './ads-calendar.mjs';

export const BUSINESS_MONTH_CLIENT=String.raw`
(()=>{
 ${projectAdsCalendar.toString()}
 ${projectBusinessMonth.toString()}
 const el=id=>document.getElementById('businessMonth'+id);
 const node=(tag,text,cls)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(cls)value.className=cls;return value;};
 const pendingMessages={COLLECTING:'A consulta dos pedidos do mês ainda está em andamento.',PERIOD_LIMIT_REACHED:'A quantidade de pedidos ultrapassou o limite desta consulta. O mês permanece parcial.',SOURCE_UNAVAILABLE:'A Shopee não concluiu parte da leitura. Atualize o mês para retomar.',STATUS_REVIEW_REQUIRED:'Há pedidos em cancelamento ou com uma situação que ainda precisa ser conferida.',PAYMENT_INCOMPLETE:'A Shopee ainda não informou todos os valores financeiros dos pedidos pagos. Esses pedidos não são tratados como valor zero.',RETURNS_NOT_RECONCILED:'Há devoluções ou pedidos sem informação suficiente de devolução. Falta conciliar seus valores.',PRODUCTION_COST_INCOMPLETE:'Há produtos sem composição ou custo completo. A identificação automática preserva os vínculos já salvos.',INVOICE_TAX_UNAVAILABLE:'A base dos produtos ainda não foi informada para todos os pedidos; o imposto de 2% permanece parcial.',ADS_UNAVAILABLE:'O gasto de anúncios ainda não foi confirmado para todos os dias do mês.',EXTERNAL_EXPENSES_REQUIRED:'Informe as outras despesas do mês ou escolha “Não tenho outras despesas”.',RECHARGE_TREATMENT_REQUIRED:'Confira se o ajuste financeiro corresponde a recarga de anúncios ou taxa de suporte.',ADJUSTMENT_UNAVAILABLE:'O ajuste financeiro de anúncios ou suporte ainda não foi informado por completo.',ARITHMETIC_UNSAFE:'Um valor excedeu o limite seguro de cálculo e não será apresentado como resultado.'};
 const money=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100):'Pendente';
 const ratio=value=>value===null||value===undefined?'Pendente':new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value))+'x';
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
 const validMonth=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&value>='2000-01'&&value<=today().slice(0,7);
 const monthName=value=>validMonth(value)?new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T12:00:00Z')):'mês selecionado';
 let api=null,syncVariants=null,frame=null,month='',generation=0,busy=false,adsBusy=false,saving=false,started=false,paused=false,dirty=false,editSequence=0,draftRevision=0,timer=null,message='',failed=false;
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
  row('Repasse previsto · taxas da Shopee já descontadas',frame.expected_repass_cents);
  row('Produção',frame.production_cost_cents,'− ');row('Imposto previsto · 2%',frame.invoice_tax_cents,'− ');
  if(frame.ads_adjustment_cents>0){
   if(frame.expenses.recharge_treatment==='ADS_RECHARGE')row('Recarga de anúncios reposta',frame.ads_adjustment_cents,'+ ');
   else if(frame.expenses.recharge_treatment==='UNCONFIRMED')row('Recarga ou suporte · tratamento a conferir',null);
  }
  row('Gasto com anúncios',frame.ads?.status==='AVAILABLE'?frame.ads.expense_cents:null,'− ');
  row('Outras despesas do mês',frame.expenses.external_expenses_cents,'− ');
  row('Resultado líquido previsto',frame.result.net_estimate_cents);
 }
 function drawReadiness(){
  const target=el('Readiness');target.replaceChildren();if(!frame)return;
  const c=frame.coverage,complete=frame.status==='COMPLETE';
  for(const [label,ready] of [['Pedidos e valores financeiros',complete&&c.payment_missing===0&&c.cancel_pending===0&&c.other===0&&c.unknown===0],['Custos de produção',complete&&frame.production_cost_cents!==null],['Imposto de 2%',complete&&frame.invoice_tax_cents!==null],['Gasto dos anúncios',frame.ads?.status==='AVAILABLE'],['Outras despesas',frame.expenses.external_expenses_cents!==null],['Devoluções e ajustes',complete&&c.returns===0&&c.returns_unknown===0&&!frame.result.pending.includes('ADJUSTMENT_UNAVAILABLE')&&!frame.result.pending.includes('RECHARGE_TREATMENT_REQUIRED')]]){
   const item=node('li');item.dataset.ready=String(!!ready);item.append(node('span',label),node('strong',ready?'Conferido':'Pendente'));target.append(item);
  }
  el('ReadinessStatus').textContent=frame.result.net_estimate_cents===null?'Complete as pendências para comparar a previsão de lucro do mês.':frame.result.net_estimate_cents<=0?'A previsão do mês ainda não tem lucro positivo. Confira custos e desempenho antes de aumentar o investimento.':'A previsão financeira do mês está completa. Próximo passo: conferir margem por produto, estoque e campanhas antes de escalar.';
 }
 function fillExpenses({force=false}={}){
  if(!frame)return;if(dirty&&!force)return;
  const saved=frame.expenses;el('ExpensesValue').value=saved.external_expenses_cents===null?'':(saved.external_expenses_cents/100).toFixed(2);el('Recharge').value=saved.recharge_treatment;draftRevision=saved.revision;dirty=false;
 }
 function render(){
  if(!frame){
   for(const key of ['Sales','Ads','Roas']){el(key).textContent=busy?'Consultando':'Pendente';el(key+'Card').dataset.status='pending';}el('Net').textContent='Em apuração';el('NetCard').dataset.status='pending';el('Margin').textContent='';el('Coverage').replaceChildren();el('Waterfall').replaceChildren();el('Readiness').replaceChildren();el('Pending').hidden=true;el('Badge').textContent=busy?'Consultando':'Aguardando consulta';controls();return;
  }
  const c=frame.coverage,ads=frame.ads,broad=ads?.totals.broad,net=frame.result.net_estimate_cents;
  setMetric('Sales',frame.sales_cents===null?null:money(frame.sales_cents),frame.sales_cents===null?'Já informado: '+money(frame.known_sales_cents)+'. Falta conferir parte dos pedidos pagos.':'Produtos dos '+c.paid+' pedido(s) pagos criados nas datas do mês.');
  setMetric('Ads',ads?.status==='AVAILABLE'?money(ads.expense_cents):null,ads?'Gasto confirmado em '+ads.covered_days+' de '+ads.total_days+' dia(s). Dias ausentes permanecem pendentes.':'Consultando o gasto da conta de anúncios nas mesmas datas.');
  setMetric('Roas',broad?.calculated_roas_raw===null||broad?.calculated_roas_raw===undefined?null:ratio(broad.calculated_roas_raw),broad?.gmv_cents===null||broad?.gmv_cents===undefined?'Vendas atribuídas aos anúncios ainda pendentes.':'Vendas atribuídas aos anúncios: '+money(broad.gmv_cents)+'. Este valor difere das vendas totais da loja.');
  if(ads?.status==='AVAILABLE'&&ads.expense_cents===0&&broad?.calculated_roas_raw===null){el('Roas').textContent='Sem investimento';el('RoasCard').dataset.status='available';}
  setMetric('Net',net===null?null:money(net),net===null?'Os valores faltantes estão identificados abaixo.':'Produção, imposto, anúncios e outras despesas já descontados. É uma previsão, não o valor recebido em banco.');
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
  drawWaterfall();drawReadiness();fillExpenses();
  if(dirty){el('ExpenseState').textContent=draftRevision!==frame.expenses.revision?'As despesas foram alteradas em outra sessão. Sua edição foi preservada; carregue os valores salvos antes de salvar novamente.':'Há uma edição de despesas ainda não salva.';}
  else el('ExpenseState').textContent=frame.expenses.external_expenses_cents===null?'Outras despesas ainda não informadas. Informe o valor ou confirme que não há despesas.':'Despesas salvas para '+monthName(frame.month)+' · versão '+frame.expenses.revision+'.';
  const progress=frame.progress;el('Progress').hidden=!busy;el('Progress').value=progress.windows_total?Math.round(progress.windows_complete/progress.windows_total*100):0;
  el('Scope').textContent='Pedidos pagos criados de '+frame.start_date.split('-').reverse().join('/')+' a '+frame.end_date.split('-').reverse().join('/')+' e anúncios nas mesmas datas. Custos atuais de produção. Consulta em '+new Date(frame.checked_at*1000).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' · Brasília. Recebimentos bancários ainda não conciliados.';
  for(const key of ['AdsLink','DetailsLink'])el(key).href='/dashboard?month='+encodeURIComponent(frame.month);
  controls();
 }
 function apply(value,expectedMonth){const checked=projectBusinessMonth(value);if(!checked||checked.month!==expectedMonth)throw Error('Os dados mensais não puderam ser conferidos. Atualize o mês para tentar novamente.');frame=checked;render();return checked;}
 function schedule(){
  clearTimeout(timer);timer=null;if(!started||document.hidden||busy||adsBusy||saving||dirty||frame?.status!=='COMPLETE'||month!==today().slice(0,7))return;
  timer=setTimeout(()=>{timer=null;if(!document.hidden&&!dirty)return refreshAds();},60000);
 }
 async function request(operation,selected=month){return api('finance/business-month',{operation,month:selected});}
 async function refresh(){
  if(!started||saving)return false;
  const selected=el('Select').value;if(!validMonth(selected)){status('Escolha um mês válido até o mês atual.',true);return false;}
  const changed=selected!==month;if(busy&&!changed)return false;
  const token=++generation;month=selected;paused=false;busy=true;adsBusy=false;clearTimeout(timer);timer=null;
  if(changed){frame=null;dirty=false;editSequence++;draftRevision=0;el('ExpensesValue').value='';el('Recharge').value='UNCONFIRMED';}
  status('Consultando os pedidos de '+monthName(month)+'…');render();
  const current=()=>token===generation&&month===selected;
  try{
   const initial=await request('start',selected);if(!current())return false;let value=apply(initial,selected);
   let steps=0;
   while(value.status==='RUNNING'&&!paused&&steps<610){
    status('Conferindo os pedidos do mês… '+value.coverage.orders+' pedido(s) consultado(s).');
    const raw=await request('step',selected);if(!current())return false;value=apply(raw,selected);steps++;
    if(value.result.pending.includes('SOURCE_UNAVAILABLE'))break;
   }
   if(!current())return false;
   if(value.status==='COMPLETE'){
    let catalogueFailed=false;
    if(value.unmapped_variants.length&&typeof syncVariants==='function'){
     status('Associando automaticamente os custos dos produtos vendidos…');
     try{catalogueFailed=await syncVariants(value.unmapped_variants)===false;}catch{catalogueFailed=true;}
     if(!current())return false;const reread=await request('read',selected);if(!current())return false;apply(reread,selected);
    }
    if(!current())return false;status('Conferindo os anúncios nas mesmas datas…');
    const raw=await request('ads',selected);if(!current())return false;value=apply(raw,selected);
    status(catalogueFailed?'Valores mensais atualizados. Há produtos com identificação pendente; confira os motivos abaixo.':'Dados do mês atualizados. Confira o resultado e as pendências abaixo.');
   }else if(paused)status('Consulta pausada após a última resposta. Use Continuar consulta para retomar.');
   else if(value.status==='LIMIT_REACHED')status('O mês está parcial porque o limite de pedidos foi atingido. Os totais pendentes não são estimados como zero.');
   else status('Parte da consulta ficou pendente. Use Atualizar mês para retomar a leitura.');
   return true;
  }catch(error){if(current()){status(error?.message||'Não foi possível atualizar o mês. Tente novamente.',true);if(frame)render();}return false;}
  finally{if(current()){busy=false;render();schedule();}}
 }
 async function refreshAds(){
  if(!started||!frame||busy||adsBusy||saving||dirty||document.hidden)return false;
  if(frame.ads&&Date.now()-frame.ads.fetched_at*1000<60000){schedule();return false;}
  const token=generation,selected=month;adsBusy=true;controls();
  try{const raw=await request('ads',selected);if(token!==generation||selected!==month)return false;apply(raw,selected);return true;}
  catch{if(token===generation)status('Não foi possível atualizar os anúncios. A leitura anterior mantém seu horário de consulta; use Atualizar mês para conferir.',true);return false;}
  finally{if(token===generation){adsBusy=false;controls();schedule();}}
 }
 async function refreshCosts(){
  if(!started||!frame||busy||adsBusy||saving)return false;
  const token=generation,selected=month;
  try{const raw=await request('read',selected);if(token!==generation||selected!==month)return false;apply(raw,selected);schedule();return true;}
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
   frame=result;draftRevision=result.expenses.revision;
   if(submitted===editSequence){dirty=false;fillExpenses({force:true});}
   render();status('Despesas do mês salvas. Produção, imposto e anúncios continuam contabilizados separadamente.');return true;
  }catch(error){
   if(token===generation){
    el('ExpenseState').textContent=error.status===409?'As despesas mudaram em outra sessão. Sua edição foi preservada; carregue os valores salvos antes de salvar.':(error.message||'Não foi possível salvar. Sua edição foi preservada.');
    if(error.status===409){try{const raw=await request('read',selected);if(token===generation)apply(raw,selected);}catch{}}
   }return false;
  }finally{if(token===generation){saving=false;controls();schedule();}}
 }
 async function identify(){
  if(!frame||busy||adsBusy||saving||!frame.unmapped_variants.length||typeof syncVariants!=='function')return;
  const token=generation,selected=month;busy=true;controls();status('Atualizando a identificação dos produtos vendidos…');
  try{await syncVariants(frame.unmapped_variants);if(token!==generation)return;const raw=await request('read',selected);if(token!==generation)return;apply(raw,selected);status('Custos do mês atualizados. Vínculos manuais foram preservados.');}
  catch{if(token===generation)status('A identificação automática ficou pendente. Confira os produtos e custos; os vínculos salvos foram preservados.',true);}
  finally{if(token===generation){busy=false;render();schedule();}}
 }
 async function start(options={}){
  if(started)return false;if(typeof options.api!=='function'||!el('Select'))return false;
  api=options.api;syncVariants=options.syncVariants;started=true;
  let selected;try{const params=new URLSearchParams(globalThis.location?.search||'');selected=params.getAll('month').length===1?params.get('month'):null;}catch{}
  el('Select').max=today().slice(0,7);el('Select').value=validMonth(selected)?selected:today().slice(0,7);
  el('Refresh').onclick=()=>refresh();el('Select').onchange=()=>refresh();
  el('Previous').onclick=()=>{const basis=validMonth(el('Select').value)?el('Select').value:today().slice(0,7),date=new Date(basis+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()-1);el('Select').value=date.toISOString().slice(0,7);refresh();};
  el('Pause').onclick=()=>{paused=true;el('Pause').disabled=true;status('A consulta será pausada após a resposta em andamento.');};
  el('ExpensesForm').onsubmit=event=>{event.preventDefault();saveExpenses();};el('ExpensesValue').oninput=expenseChanged;el('Recharge').onchange=expenseChanged;
  el('ExpensesZero').onclick=()=>saveExpenses({zero:true});el('ExpensesReload').onclick=()=>{dirty=false;editSequence++;fillExpenses({force:true});render();schedule();};el('Identify').onclick=identify;
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);timer=null;}else schedule();});
  return refresh();
 }
 function stop(){paused=true;generation++;busy=false;adsBusy=false;clearTimeout(timer);timer=null;controls();}
 globalThis.brazaMonthDashboard={start,refresh,refreshCosts,stop};
})();
`;
