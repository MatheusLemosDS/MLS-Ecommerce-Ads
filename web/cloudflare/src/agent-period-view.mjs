export const AGENT_PERIOD_CSS=String.raw`
.mls-agent-period[hidden]{display:none!important}
.mls-agent-period{box-sizing:border-box;min-width:0;margin:0 0 20px;padding:16px 18px;border:1px solid var(--line);border-radius:13px;background:var(--surface);scroll-margin-top:110px}
.mls-agent-period-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 18px;margin-bottom:12px}
.mls-agent-period-heading strong{font-size:13px;color:var(--text,var(--ink));font-weight:700}.mls-agent-period-heading span{font-size:11px;color:var(--muted)}
.mls-agent-period-form{display:flex;align-items:end;gap:9px;flex-wrap:wrap;min-width:0}.mls-agent-period-field{display:flex;flex:1 1 190px;flex-direction:column;gap:6px;min-width:0;max-width:310px;font-size:11px;font-weight:600}
.mls-agent-period-form input{box-sizing:border-box;display:block;min-width:0;width:100%;max-width:100%;min-height:44px;margin:0;padding:10px 12px;border:1px solid var(--line);border-radius:9px;color:var(--text,var(--ink));background:var(--surface-raised,var(--surface));font:inherit;font-size:13px;color-scheme:dark}
.mls-agent-period-form button{min-width:44px;min-height:44px;margin:0;padding:10px 13px;border-radius:9px;font-size:11px;white-space:normal;touch-action:manipulation}.mls-agent-period-form button:disabled{cursor:default;opacity:.5}
.mls-agent-period-scope,.mls-agent-period-status{margin:11px 0 0;font-size:11px;line-height:1.65;color:var(--muted);overflow-wrap:anywhere}.mls-agent-period-status:empty{display:none}.mls-agent-period-status[data-error=true]{color:var(--warning,#dba05a)}
.mls-agent-period :focus-visible{outline:3px solid var(--accent);outline-offset:3px}:root[data-theme=light] .mls-agent-period-form input{color-scheme:light}
@media(max-width:720px){.mls-agent-period{padding:15px;margin-bottom:16px;scroll-margin-top:100px}.mls-agent-period-heading{align-items:flex-start;flex-direction:column;gap:5px}.mls-agent-period-field{flex-basis:100%;max-width:none}.mls-agent-period-form{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;gap:8px}.mls-agent-period-field{grid-column:1/-1}.mls-agent-period-form #mlsAgentPeriodPrevious{grid-column:1}.mls-agent-period-form #mlsAgentPeriodApply{grid-column:2;grid-row:2}.mls-agent-period-form #mlsAgentPeriodNext{grid-column:3;grid-row:2}.mls-agent-period-form #mlsAgentPeriodCurrent{grid-column:1/-1}.mls-agent-period-scope,.mls-agent-period-status{font-size:10px}}
`;

export function agentPeriodBody(){return `<div id="mlsAgentPeriod" class="mls-agent-period" aria-labelledby="mlsAgentPeriodTitle" hidden><div class="mls-agent-period-heading"><strong id="mlsAgentPeriodTitle">Período dos agentes</strong><span id="mlsAgentPeriodSelected">Mês de referência · Brasília</span></div><form id="mlsAgentPeriodForm" class="mls-agent-period-form"><label for="mlsAgentPeriodMonth" class="mls-agent-period-field">Mês de referência · Brasília<input id="mlsAgentPeriodMonth" type="month" min="2000-01" required aria-describedby="mlsAgentPeriodScope mlsAgentPeriodStatus"></label><button id="mlsAgentPeriodPrevious" type="button" class="button-secondary" aria-label="Ver mês anterior">←</button><button id="mlsAgentPeriodApply" type="submit">Ver mês</button><button id="mlsAgentPeriodNext" type="button" class="button-secondary" aria-label="Ver mês seguinte">→</button><button id="mlsAgentPeriodCurrent" type="button" class="button-secondary">Mês atual</button></form><p id="mlsAgentPeriodScope" class="mls-agent-period-scope">Indicadores financeiros e conciliação usam o mês escolhido. Catálogo e fila DTF mostram fontes atuais, sem reconstruir seu estado no passado.</p><p id="mlsAgentPeriodStatus" class="mls-agent-period-status" role="status" aria-live="polite"></p></div>`;}

// This function is embedded into the owner client. All helpers must remain in
// its own closure so the same source survives bundling and minification.
export function createAgentPeriodController(options={}){
 const doc=options.documentImpl??globalThis.document,getDashboard=options.getDashboard??(()=>globalThis.brazaMonthDashboard),getLocation=options.getLocation??(()=>globalThis.location),history=options.historyImpl??globalThis.history,now=options.now??(()=>new Date());
 const el=suffix=>doc?.getElementById?.('mlsAgentPeriod'+suffix),root=el('');
 if(!root)return Object.freeze({setPanel(){return false;},sync(){return false;},syncLocation(){return Promise.resolve(false);},selectMonth(){return Promise.resolve(false);},stop(){}});
 const scopes={
  agents:'Indicadores financeiros, prioridades e conciliação usam o mês escolhido. Catálogo, fila DTF e conexão dos agentes mostram fontes atuais, sem reconstruir o passado.',
  'agent-finance':'Resultado, despesas, repasses e conciliação usam o mês escolhido e as fontes salvas disponíveis. Ausência de histórico mantém os valores indisponíveis, sem presumir zero.',
  'agent-ads':'Investimento, vendas atribuídas e ROAS usam os anúncios salvos do mês escolhido. Atribuição de anúncios é diferente do total de vendas da loja.',
  'agent-products':'Vendas e referência de custo usam o mês escolhido. Catálogo, variações e regras de custo são as fontes atuais; não representam o catálogo ou estoque daquele mês.',
  'agent-production':'A referência de custo das vendas usa o mês escolhido. A fila DTF é atual. A produção realizada mantém seu próprio mês e semana no registro histórico, sem alterar rascunhos.',
  'agent-returns':'Devoluções e conciliação financeira usam o mês escolhido. O controle de recebimento físico tem seu próprio mês quando fixado; associações com fabricação mostram o histórico salvo.',
  'agent-auditor':'Confiabilidade, divergências e conciliação financeira usam as evidências salvas do mês escolhido. Dados ausentes permanecem indisponíveis e não confirmam ausência de problemas.',
  'agent-hermes':'O contexto financeiro dos agentes usa o mês escolhido. Conexão, fila de tarefas e limites operacionais são atuais; relatórios anteriores preservam suas próprias datas e evidências.'
 };
 let stopped=false,panel='',selected='',snapshot=null,pending=false,sequence=0,subscribed=null,unsubscribe=null,inputDirty=false,message='',error=false;
 const currentMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(now()).slice(0,7);
 const validMonth=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value)&&value>='2000-01'&&value<=currentMonth();
 const label=value=>{try{return new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T12:00:00Z'));}catch{return value;}};
 function locationMonth(location=getLocation()){
  try{const values=new URL(location.href).searchParams.getAll('month');return values.length===1&&validMonth(values[0])?values[0]:null;}catch{return null;}
 }
 function updateUrl(month,{push=false,before=null}={}){
  if(!validMonth(month))return;
  try{
   const location=getLocation(),current=new URL(location.href),target=new URL(location.href);target.searchParams.set('month',month);
   // The daily controller may replace month/date before this saved read
   // resolves. Keep the original entry so the owner's month choice remains
   // navigable with browser back and forward, while retaining the new date.
   if(push&&before&&typeof history?.pushState==='function'&&typeof history?.replaceState==='function'){
    const previous=new URL(before.href),nextState=history.state??{};
    if(previous.href===target.href)return;
    if(current.href!==previous.href)history.replaceState(before.state,'',previous.pathname+previous.search+previous.hash);
    history.pushState(nextState,'',target.pathname+target.search+target.hash);return;
   }
   if(current.searchParams.getAll('month').length===1&&current.searchParams.get('month')===month)return;
   const method=push?'pushState':'replaceState';history?.[method]?.(history.state??{},'',target.pathname+target.search+target.hash);
  }catch{}
 }
 function status(text,invalid=false){message=text;error=invalid;paint();}
 function readSnapshot(){try{return getDashboard()?.getSnapshot?.()??null;}catch{return null;}}
 function paint(){
  if(stopped)return;
  const month=validMonth(selected)?selected:currentMonth(),blocked=pending||snapshot?.period_loading===true;
  root.hidden=!Object.hasOwn(scopes,panel);root.setAttribute?.('aria-busy',String(blocked));
  const input=el('Month');if(input){input.max=currentMonth();if(!inputDirty)input.value=month;input.disabled=blocked;}
  for(const suffix of ['Apply','Previous','Next','Current'])if(el(suffix))el(suffix).disabled=blocked;
  if(el('Previous'))el('Previous').disabled=blocked||month==='2000-01';
  if(el('Next'))el('Next').disabled=blocked||month===currentMonth();
  if(el('Current'))el('Current').disabled=blocked||month===currentMonth();
  if(el('Selected'))el('Selected').textContent=label(month)+' · Brasília';
  if(el('Scope'))el('Scope').textContent=scopes[panel]??scopes.agents;
  const target=el('Status');if(target){target.dataset.error=String(error);target.textContent=message||(blocked?'Conferindo o mês selecionado nas fontes salvas…':snapshot?.month===month&&snapshot.status?'Mês compartilhado entre os agentes. Confira a cobertura e as pendências em cada painel.':'Sem resumo validado para este mês. Os valores permanecem indisponíveis; não representam zero.');}
 }
 function accept(value){
  if(stopped)return false;snapshot=value;
  if(validMonth(value?.month)){const changed=selected!==value.month;selected=value.month;if(changed){inputDirty=false;message='';error=false;}if(!pending)updateUrl(selected);}
  paint();return true;
 }
 function sync(){
  if(stopped)return false;
  const dashboard=getDashboard();
  if(dashboard!==subscribed&&typeof dashboard?.subscribe==='function'){
   try{unsubscribe?.();}catch{}subscribed=dashboard;unsubscribe=null;
   try{const cleanup=dashboard.subscribe(accept);if(typeof cleanup==='function')unsubscribe=cleanup;}catch{}
  }
  return accept(readSnapshot());
 }
 async function selectMonth(month,{push=true}={}){
  // Buttons cannot overlap reads. Browser back/forward may replace a pending
  // selection; its newer generation owns the result and never replays a write.
  if(stopped||pending&&push)return false;
  if(!validMonth(month)){inputDirty=false;status('Escolha um mês válido entre janeiro de 2000 e o mês atual em Brasília.',true);return false;}
  sync();
  if(snapshot?.period_change_blocked===true&&month!==selected){inputDirty=false;status('Salve ou recarregue os rascunhos financeiros antes de trocar o mês. Seus dados não foram alterados.',true);return false;}
  const dashboard=getDashboard();if(typeof dashboard?.selectMonth!=='function'){inputDirty=false;status('Aguarde o carregamento da sessão e tente escolher o mês novamente.',true);return false;}
  if(month===selected&&snapshot?.status){inputDirty=false;message='';error=false;updateUrl(month,{push});paint();return true;}
  let before=null;if(push)try{before={href:getLocation().href,state:history?.state??{}};}catch{}
  const token=++sequence;pending=true;message='Conferindo o mês selecionado nas fontes salvas…';error=false;paint();
  try{
   const result=await dashboard.selectMonth(month);if(stopped||token!==sequence)return false;
   const value=readSnapshot();snapshot=value;
   if(validMonth(value?.month)&&value.month===month){selected=month;inputDirty=false;message='';error=false;updateUrl(month,{push,before});return result!==false;}
   inputDirty=false;status(value?.period_change_blocked===true?'Salve ou recarregue os rascunhos financeiros antes de trocar o mês. Seus dados não foram alterados.':'Não foi possível selecionar este mês agora. O período anterior foi preservado.',true);return false;
  }catch{if(!stopped&&token===sequence){inputDirty=false;status('Não foi possível abrir este mês agora. Tente novamente; seus rascunhos foram preservados.',true);}return false;}
  finally{if(!stopped&&token===sequence){pending=false;paint();}}
 }
 function shift(delta){const date=new Date((validMonth(selected)?selected:currentMonth())+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+delta);return selectMonth(date.toISOString().slice(0,7));}
 function setPanel(next){panel=typeof next==='string'?next:'';paint();return !root.hidden;}
 function syncLocation(location=getLocation()){
  const month=locationMonth(location)??currentMonth();if(month===selected){updateUrl(selected);return Promise.resolve(true);}return selectMonth(month,{push:false});
 }
 function stop(){stopped=true;sequence++;pending=false;try{unsubscribe?.();}catch{}unsubscribe=null;}
 selected=locationMonth()??currentMonth();
 if(el('Form'))el('Form').onsubmit=event=>{event?.preventDefault?.();return selectMonth(el('Month')?.value);};
 if(el('Month'))el('Month').oninput=()=>{inputDirty=true;};
 if(el('Previous'))el('Previous').onclick=()=>shift(-1);
 if(el('Next'))el('Next').onclick=()=>shift(1);
 if(el('Current'))el('Current').onclick=()=>selectMonth(currentMonth());
 paint();sync();
 return Object.freeze({setPanel,sync,syncLocation,selectMonth,stop});
}
