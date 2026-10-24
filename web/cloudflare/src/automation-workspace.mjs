export const AUTOMATION_WORKSPACE_CSS=String.raw`
.automation-workspace{min-width:0;margin:24px 0;border-top:1px solid var(--line);padding-top:20px}.automation-workspace>summary{display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;min-height:44px;list-style:none}.automation-workspace>summary::-webkit-details-marker{display:none}.automation-workspace>summary::after{content:"+";font-size:20px;color:var(--muted)}.automation-workspace[open]>summary::after{content:"−"}.automation-workspace>summary strong{font-size:14px}.automation-workspace>summary span{margin-left:auto;color:var(--muted);font-size:11px}.automation-content{padding-top:15px}.automation-status,.automation-note,.automation-times,.automation-message{font-size:12px;line-height:1.7;color:var(--muted);overflow-wrap:anywhere}.automation-status{color:var(--text);margin:0 0 8px}.automation-times{display:grid;gap:4px;margin:12px 0}.automation-actions{display:flex;flex-wrap:wrap;gap:9px;margin:15px 0}.automation-actions button{min-height:42px;font-size:12px;padding:9px 13px}.automation-message{min-height:20px;margin:8px 0}.automation-message[data-error=true]{color:var(--negative,#db6477)}.automation-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.automation-metric{min-width:0;padding:16px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.automation-metric small,.automation-metric span{display:block;font-size:11px;line-height:1.6;color:var(--muted)}.automation-metric strong{display:block;font-size:23px;line-height:1.3;margin:9px 0;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.automation-workspace h3{font-size:13px;margin:20px 0 9px}.automation-tasks{padding-left:20px;margin:12px 0}.automation-tasks li{padding:5px 0 10px;font-size:12px;line-height:1.7}.automation-tasks strong{display:block;font-size:12px}.automation-tasks p{margin:4px 0 0;color:var(--muted)}.automation-task-priority{display:inline-block;font-size:10px;color:var(--muted);margin-top:3px}.automation-workspace button:focus-visible,.automation-workspace>summary:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.automation-workspace [hidden]{display:none!important}@media(max-width:640px){.automation-metrics{grid-template-columns:minmax(0,1fr)}.automation-workspace>summary{flex-wrap:wrap;gap:8px}.automation-workspace>summary span{margin-left:0}.automation-actions button{flex:1}}
`;

export function automationWorkspaceBody(){return `<details class="automation-workspace" id="automationWorkspace"><summary><strong>Coleta e diagnóstico automático</strong><span id="automationCompactStatus">Conferindo agendamento</span></summary><div class="automation-content"><p class="automation-status" id="automationStatus" role="status">Aguardando o estado da coleta.</p><p class="automation-note">A coleta consulta pedidos, repasses e anúncios em segundo plano. Campanhas e orçamentos permanecem protegidos.</p><div class="automation-times"><span id="automationLastSuccess">Última coleta concluída: ainda não confirmada.</span><span id="automationNextRun">Próxima coleta: aguardando o agendamento.</span></div><div class="automation-actions"><button type="button" id="automationToggle" disabled>Pausar coleta</button><button type="button" id="automationRefresh" disabled>Atualizar status</button></div><p class="automation-message" id="automationMessage" role="status" aria-live="polite"></p><p class="automation-note" id="automationDiagnosisStatus">O diagnóstico aparece após a leitura validada do mês.</p><div class="automation-metrics"><article class="automation-metric"><small>Gasto de Ads sobre vendas · TACOS</small><strong id="automationTacos">Pendente</strong><span>Gasto do calendário ÷ vendas pagas da loja no período.</span></article><article class="automation-metric"><small>Saldo disponível antes de Ads</small><strong id="automationBeforeAds">Pendente</strong><span>Repasse previsto após produção, DAS e despesas cadastradas.</span></article><article class="automation-metric"><small>Cobertura dos custos</small><strong id="automationCostCoverage">Pendente</strong><span id="automationCostQuantity">Unidades vendidas com custo identificado.</span></article></div><h3>Próximos passos por prioridade</h3><ol class="automation-tasks" id="automationTasks"><li>Aguardando o diagnóstico do mês.</li></ol><p class="automation-note">O repasse é esperado. Recebimentos liquidados e reembolsos efetivos ainda precisam de conciliação para confirmar lucro real. Este diagnóstico não autoriza alterações em anúncios.</p></div></details>`;}

export const AUTOMATION_WORKSPACE_CLIENT=String.raw`(()=>{
 let api=null,active=false,bound=false,timer=null,pending=null,generation=0,state=null,stateAvailable=false,saving=false,desired=null;
 const el=name=>document.getElementById('automation'+name);
 const node=(tag,text,cls)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(cls)value.className=cls;return value;};
 const statuses={IDLE:'Aguardando a primeira coleta agendada.',PAUSED:'Coleta em segundo plano pausada.',NOT_DUE:'Aguardando a próxima coleta agendada.',LEASED:'Uma coleta está em andamento.',RUNNING:'Consultando os dados do mês.',COMPLETE:'Última coleta concluída.',LIMIT_REACHED:'A coleta atingiu um limite; confira a cobertura do mês.',ERROR:'A última coleta encontrou uma falha. A nova tentativa respeita o intervalo do agendamento.',PARTIAL:'A coleta ainda não cobriu todos os dados do mês.'};
 const integer=value=>Number.isSafeInteger(value)&&value>=0;
 const timestamp=value=>value===null||integer(value)&&value<=9999999999;
 function projectState(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.schema!=='business_sync_state_v1'||value.mode!=='READ_ONLY'||typeof value.enabled!=='boolean'||!integer(value.revision)||value.revision<1||!Object.hasOwn(statuses,value.status)||!integer(value.failure_count)||![value.next_run_at,value.lease_expires_at,value.last_attempt_at,value.last_success_at].every(timestamp)||value.month!==null&&(typeof value.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)))return null;
  return {enabled:value.enabled,revision:value.revision,status:value.status,month:value.month,next_run_at:value.next_run_at,last_success_at:value.last_success_at};
 }
 const date=value=>value?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(value*1000))+' · Brasília':null;
 const money=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100):'Pendente';
 const percent=value=>Number.isSafeInteger(value)&&value>=0?new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(value/100)+'%':'Pendente';
 function message(text,error=false){el('Message').textContent=text;el('Message').dataset.error=String(error);}
 function drawState(){
  el('Refresh').disabled=!active||saving||!!pending;
  el('Toggle').disabled=!active||saving||!!pending||!stateAvailable;
  el('Toggle').textContent=saving?'Salvando…':desired!==null?(desired?'Confirmar ativação':'Confirmar pausa'):state?.enabled===false?'Ativar coleta':'Pausar coleta';
  if(!stateAvailable){el('CompactStatus').textContent='Estado indisponível';el('Status').textContent='Não foi possível confirmar o estado do agendamento.';el('NextRun').textContent='Próxima coleta: estado ainda não confirmado.';return;}
  const running=['RUNNING','LEASED'].includes(state.status),paused=!state.enabled;
  el('CompactStatus').textContent=paused?'Pausada':running?'Coletando':['ERROR','LIMIT_REACHED'].includes(state.status)?'Coleta com pendências':state.status==='PARTIAL'?'Coleta parcial':state.last_success_at?'Coleta habilitada':'Aguardando primeira coleta';
  el('Status').textContent=paused?(running?'Pausa solicitada. A leitura já iniciada pode terminar; novas coletas ficam pausadas.':statuses.PAUSED):statuses[state.status];
  el('LastSuccess').textContent=state.last_success_at?'Última coleta concluída: '+date(state.last_success_at):'Última coleta concluída: ainda não confirmada pelo agendamento.';
  el('NextRun').textContent=paused?'Próxima coleta: pausada.':state.next_run_at?'Próxima coleta prevista: '+date(state.next_run_at):'Próxima coleta: aguardando a primeira execução do agendamento.';
 }
 function cancelTimer(){if(timer!==null)clearTimeout(timer);timer=null;}
 function schedule(){cancelTimer();if(active&&!document.hidden)timer=setTimeout(()=>{timer=null;refresh();},60000);}
 async function refresh({duringSave=false}={}){
  if(!active||document.hidden||saving&&!duringSave)return;
  cancelTimer();if(pending)return pending;
  const version=generation;
  const work=(async()=>{
   try{const value=projectState(await Promise.resolve().then(()=>api('finance/sync-state')));if(version!==generation||!active)return;if(!value)throw Error('INVALID_STATE');state=value;stateAvailable=true;return value;}
   catch{if(version===generation&&active){stateAvailable=false;message('O estado da coleta está indisponível. Use Atualizar status para conferir novamente.',true);}}
   finally{if(pending===work)pending=null;if(version===generation&&active){drawState();schedule();}}
  })();pending=work;drawState();return work;
 }
 async function toggle(){
  if(!active||saving||pending||!stateAvailable)return;
  cancelTimer();saving=true;if(desired===null)desired=!state.enabled;drawState();
  const version=generation;
  try{
   const value=projectState(await api('finance/sync-policy',{revision:state.revision,enabled:desired}));
   if(version!==generation||!active)return;
   if(!value)throw Error('INVALID_STATE');state=value;stateAvailable=true;desired=null;message(value.enabled?'Coleta habilitada. Aguarde a confirmação de uma execução agendada.':'Novas coletas estão pausadas.');
  }catch(error){
   if(version!==generation||!active)return;
   if(error?.status===409){
    const value=await refresh({duringSave:true});
    if(version!==generation||!active)return;
    if(value&&value.enabled===desired){desired=null;message('A configuração atual já corresponde à sua escolha.');}
    else message(value?'A configuração mudou em outra sessão. Sua escolha foi preservada; confira o estado e confirme novamente.':'Sua escolha foi preservada. Atualize o status antes de confirmar novamente.',true);
   }else{stateAvailable=false;message('Não foi possível confirmar a alteração. Sua escolha foi preservada; atualize o status antes de tentar novamente.',true);}
  }finally{if(version===generation&&active){saving=false;drawState();schedule();}}
 }
 function render(value){
  if(!el('Workspace'))return;
  el('Tasks').replaceChildren();
  if(!value){el('DiagnosisStatus').textContent='O diagnóstico aparece após a leitura validada do mês.';for(const name of ['Tacos','BeforeAds','CostCoverage'])el(name).textContent='Pendente';el('CostQuantity').textContent='Unidades vendidas com custo identificado.';el('Tasks').append(node('li','Aguardando o diagnóstico do mês.'));return;}
  const metrics=value.metrics;
  el('DiagnosisStatus').textContent='Mês '+value.month.split('-').reverse().join('/')+' · '+(value.status==='READY_FOR_REVIEW'?'Dados disponíveis para revisão.':'Há pendências antes de concluir a estimativa.');
  el('Tacos').textContent=percent(metrics.tacos_bps);el('BeforeAds').textContent=money(metrics.available_before_ads_cents);el('CostCoverage').textContent=percent(metrics.cost_coverage_bps);
  el('CostQuantity').textContent=Number.isSafeInteger(metrics.costed_quantity)&&Number.isSafeInteger(metrics.total_quantity)?metrics.costed_quantity+' de '+metrics.total_quantity+' unidades vendidas com custo identificado.':'Cobertura por quantidade ainda não disponível.';
  for(const task of value.tasks){const row=node('li'),label=node('strong',task.label),priority=node('span',({HIGH:'Prioridade alta',MEDIUM:'Prioridade média',LOW:'Acompanhar'})[task.priority]||'Revisar','automation-task-priority');row.append(label,priority,node('p',task.detail));el('Tasks').append(row);}
 }
 function bind(){if(bound)return;bound=true;el('Refresh').onclick=async()=>{message('');await refresh();};el('Toggle').onclick=toggle;document.addEventListener('visibilitychange',()=>{cancelTimer();if(active&&!document.hidden)refresh();});}
 async function start(options){if(!el('Workspace')||typeof options?.api!=='function')return;api=options.api;bind();if(active)return refresh();active=true;generation++;stateAvailable=false;message('');if(pending)await pending;if(!active)return;return refresh();}
 function stop(){active=false;generation++;cancelTimer();saving=false;drawState();}
 globalThis.brazaAutomationWorkspace=Object.freeze({start,stop,render});
})();`;
