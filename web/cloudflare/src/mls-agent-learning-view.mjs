/** Owner-visible descriptive memory. Does not grant an agent any new action. */
export function projectMlsAgentLearningView(value,selected){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const date=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const month=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(v);
 const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
 const lessonAgents={PRODUCTION_REFERENCE_INCOMPLETE:'production',RETURNS_REQUIRE_RECONCILIATION:'returns',ORDER_STATUS_REQUIRES_REVIEW:'finance',SOURCE_REFRESH_REQUIRED:'auditor',PAYMENT_COVERAGE_REQUIRED:'finance',COST_REFERENCE_OBSERVED:'production',MONTH_ESTIMATE_OBSERVED:'finance',ARITHMETIC_REVIEW_REQUIRED:'auditor',REFERENCE_CORRECTION_RECORDED:'auditor',CONDITION_NOT_IN_LATEST_CUTOFF:'auditor'};
 try{
  if(!month(selected)||!exact(value,['schema','month','checked_at','status','evidence','latest','lessons','autonomy','basis'])||value.schema!=='mls_agent_learning_report_v1'||value.month!==selected||!int(value.checked_at,1,9999999999)||!['EMPTY','OBSERVING','EVIDENCE_AVAILABLE','STALE'].includes(value.status)||value.basis!=='DESCRIPTIVE_TRUSTED_OBSERVATIONS_NOT_CAUSAL_MODEL_TRAINING')return null;
  const e=value.evidence,a=value.autonomy;
  if(!exact(e,['cutoffs_observed','closed_months_observed','latest_observed_at','latest_end_date','revisions_observed','independent_financial_comparisons'])||!['cutoffs_observed','closed_months_observed','revisions_observed','independent_financial_comparisons'].every(k=>int(e[k],0,1000000000))||e.cutoffs_observed>31||e.independent_financial_comparisons!==0)return null;
  const expectedAuto=['COLLECT_SAVED_EVIDENCE','CHECK_DATA_QUALITY','CLASSIFY_USING_SAVED_RULES','PREPARE_REPORTS'],expectedConfirmation=['NEW_ACTION','COMMERCIAL_WRITE','PAID_PROVIDER','POLICY_CHANGE'];
  const same=(items,expected)=>Array.isArray(items)&&items.length===expected.length&&items.every((v,i)=>v===expected[i]);
  if(!exact(a,['mode','automatic','confirmation_required','commercial_write_allowed','model_training'])||a.mode!=='OBSERVER'||!same(a.automatic,expectedAuto)||!same(a.confirmation_required,expectedConfirmation)||a.commercial_write_allowed!==false||a.model_training!==false)return null;
  if(!Array.isArray(value.lessons)||value.lessons.length>10||new Set(value.lessons.map(v=>v?.code)).size!==value.lessons.length)return null;
  let latest=null;
  if(value.status==='EMPTY'){
   if(e.cutoffs_observed!==0||e.latest_observed_at!==null||e.latest_end_date!==null||value.latest!==null||value.lessons.length)return null;
  }else{
   if(e.cutoffs_observed<1||!int(e.latest_observed_at,1,value.checked_at+60)||!date(e.latest_end_date)||e.latest_end_date.slice(0,7)!==selected||!plain(value.latest)||value.latest.schema!=='mls_agent_learning_observation_v1'||value.latest.month!==selected||value.latest.end_date!==e.latest_end_date||!int(value.latest.checked_at,1,e.latest_observed_at+60))return null;
   latest=Object.freeze({checked_at:value.latest.checked_at,end_date:e.latest_end_date});
  }
  const lessons=[];
  for(const row of value.lessons){
   if(!exact(row,['code','agent','title','detail','confidence','evidence_count','first_observed_at','last_observed_at'])||!Object.hasOwn(lessonAgents,row.code)||row.agent!==lessonAgents[row.code]||!text(row.title,180)||!text(row.detail,1200)||!['OBSERVED','REPEATED'].includes(row.confidence)||!int(row.evidence_count,1,e.cutoffs_observed)||row.confidence!==(row.evidence_count>1?'REPEATED':'OBSERVED')||!int(row.first_observed_at,1,value.checked_at+60)||!int(row.last_observed_at,row.first_observed_at,value.checked_at+60))return null;
   lessons.push(Object.freeze({...row}));
  }
  return Object.freeze({schema:value.schema,month:selected,checked_at:value.checked_at,status:value.status,evidence:Object.freeze({...e}),latest,lessons:Object.freeze(lessons),autonomy:Object.freeze({mode:'OBSERVER',commercial_write_allowed:false,model_training:false})});
 }catch{return null;}
}

export function mlsAgentLearningBody(){
 return '<details class="mls-agent-learning" id="mlsAgentLearning"><summary><span>Memória e evolução dos agentes</span><span class="mls-learning-mode">Observador</span></summary><div class="mls-learning-body">'+
  '<header><div><span class="mission-eyebrow">EVIDÊNCIAS SALVAS</span><h3>O que a operação está ensinando</h3><p>Recortes financeiros e correções ajudam a priorizar as próximas conferências.</p></div><button type="button" id="mlsLearningReload">Conferir memória</button></header>'+
  '<p class="mls-learning-status" id="mlsLearningStatus" role="status" aria-live="polite">Abra esta seção para conferir a memória salva do mês selecionado.</p><a id="mlsLearningLogin" href="/login" hidden>Entrar novamente como administrador</a>'+
  '<div class="mls-learning-metrics" id="mlsLearningMetrics" aria-label="Cobertura da memória"></div><div class="mls-learning-lessons" id="mlsLearningLessons"></div>'+
  '<section class="mls-learning-policy" aria-label="Autonomia atual"><h4>Autonomia com limites</h4><p><strong>Automático:</strong> registrar evidências já coletadas, conferir qualidade dos dados, aplicar regras já salvas e preparar relatórios.</p><p><strong>Exige confirmação:</strong> ações novas, mudanças comerciais, uso de provedor pago e alterações de política.</p></section>'+
  '<p class="mls-learning-note">Recortes acumulados do mesmo mês não são experimentos independentes. A memória registra padrões observados; não treina o modelo, não prova o efeito de uma recomendação e não amplia permissões automaticamente.</p></div></details>';
}

export const MLS_AGENT_LEARNING_CSS=String.raw`
.mls-agent-learning{min-width:0;margin:16px 0 22px;border:1px solid rgba(81,173,255,.36);border-radius:14px;background:linear-gradient(135deg,rgba(81,173,255,.07),transparent 70%),var(--surface);overflow:hidden}
.mls-agent-learning>summary{min-height:54px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 18px;font-size:14px;font-weight:750;cursor:pointer;list-style:none}
.mls-agent-learning>summary::-webkit-details-marker{display:none}.mls-agent-learning>summary:before{content:'+';color:#69baff;font-size:21px}.mls-agent-learning[open]>summary:before{content:'−'}.mls-agent-learning>summary>span:first-of-type{margin-right:auto}
.mls-learning-mode{font-size:10px;font-weight:650;color:var(--muted);padding:5px 9px;border:1px solid var(--line);border-radius:99px}
.mls-learning-body{padding:0 18px 18px}.mls-learning-body>header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-top:14px;border-top:1px solid var(--line)}
.mls-learning-body h3{margin:4px 0;font-size:18px;letter-spacing:-.35px}.mls-learning-body header p,.mls-learning-status,.mls-learning-note,.mls-learning-policy p{font-size:11px;color:var(--muted);line-height:1.7;margin:7px 0}
.mls-learning-body button{min-height:44px;padding:8px 12px;font-size:11px;font-weight:700;white-space:normal;border:1px solid rgba(81,173,255,.45);border-radius:8px;background:rgba(81,173,255,.10);color:var(--text);cursor:pointer}.mls-learning-body button:disabled{opacity:.6;cursor:wait}
.mls-agent-learning :focus-visible{outline:3px solid #69baff;outline-offset:3px}.mls-learning-status[data-state=error]{color:var(--negative,#f68aa6)}.mls-learning-status[data-state=stale]{color:var(--warning,#ebc27b)}
.mls-learning-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:15px 0}.mls-learning-metrics article{min-width:0;padding:13px;border:1px solid var(--line);border-radius:10px;background:var(--surface-raised)}.mls-learning-metrics small,.mls-learning-metrics strong,.mls-learning-metrics span{display:block}.mls-learning-metrics small{font-size:10px;color:var(--muted);line-height:1.5}.mls-learning-metrics strong{font-size:24px;margin:5px 0;font-variant-numeric:tabular-nums}.mls-learning-metrics span{font-size:9px;color:var(--muted);line-height:1.5}
.mls-learning-lessons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.mls-learning-lesson{min-width:0;padding:14px;border:1px solid var(--line);border-left:3px solid #66b5ff;border-radius:10px;background:var(--surface-raised)}.mls-learning-lesson h4{margin:0 0 8px;font-size:12px;line-height:1.6}.mls-learning-lesson p{margin:8px 0;font-size:11px;line-height:1.7;color:var(--muted)}.mls-learning-confidence{display:inline-block;padding:4px 7px;border-radius:6px;font-size:9px;font-weight:700;background:rgba(81,173,255,.12);color:var(--text)}.mls-learning-lesson small{display:block;font-size:9px;line-height:1.6;color:var(--muted)}
.mls-learning-policy{margin-top:16px;padding:13px;border:1px solid var(--line);border-radius:10px;background:var(--surface-raised)}.mls-learning-policy h4{margin:0 0 5px;font-size:12px}.mls-learning-note{margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}.mls-agent-learning [hidden]{display:none!important}
@media(max-width:720px){.mls-agent-learning>summary{padding:12px 14px;font-size:12px}.mls-learning-body{padding:0 14px 14px}.mls-learning-body>header{flex-wrap:wrap}.mls-learning-body h3{font-size:16px}.mls-learning-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.mls-learning-lessons{grid-template-columns:minmax(0,1fr)}.mls-learning-metrics strong{font-size:21px}}
@media(prefers-reduced-motion:reduce){.mls-agent-learning *{animation:none!important;transition:none!important}}
`;

export const MLS_AGENT_LEARNING_CLIENT=String.raw`
(()=>{
 const project=${projectMlsAgentLearningView.toString()};
 const byId=id=>document.getElementById(id),root=byId('mlsAgentLearning');
 if(!root)return;
 const status=byId('mlsLearningStatus'),metrics=byId('mlsLearningMetrics'),lessons=byId('mlsLearningLessons'),reload=byId('mlsLearningReload'),login=byId('mlsLearningLogin');
 const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
 const validMonth=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(v);
 const stamp=v=>Number.isSafeInteger(v)&&v>0?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(v*1000)):'ainda não observado';
 const short=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v.slice(8)+'/'+v.slice(5,7):'—';
 let api=null,started=false,generation=0,busy=false,currentMonth=null,currentSource=null,snapshot=null;
 function context(){let value=null;try{value=globalThis.brazaMonthDashboard?.getSnapshot?.()??null;}catch{}const month=validMonth(value?.month)?value.month:validMonth(byId('businessMonthSelect')?.value)?byId('businessMonthSelect').value:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7);return {month,source:Number.isSafeInteger(value?.checked_at)?value.checked_at:null};}
 function message(text,state='idle'){if(status){status.textContent=text;status.dataset.state=state;}}
 function clear(){snapshot=null;metrics?.replaceChildren();lessons?.replaceChildren();if(login)login.hidden=true;}
 function syncContext(){const next=context();if(next.month!==currentMonth){generation++;busy=false;currentMonth=next.month;currentSource=next.source;clear();if(reload)reload.disabled=false;message('Mês '+currentMonth.slice(5)+'/'+currentMonth.slice(0,4)+' selecionado. Confira a memória salva deste período.');return true;}if(next.source!==currentSource){currentSource=next.source;generation++;busy=false;clear();if(reload)reload.disabled=false;message('A referência financeira mudou. Confira a memória novamente para usar o recorte atual.','stale');}return false;}
 function render(value){
  metrics?.replaceChildren();lessons?.replaceChildren();
  const e=value.evidence,rows=[['Recortes salvos',e.cutoffs_observed,'Recortes acumulados deste mês'],['Correções registradas',e.revisions_observed,'Atualizações do mesmo recorte'],['Meses fechados observados',e.closed_months_observed,'Cobertura histórica da memória'],['Comparações independentes',e.independent_financial_comparisons,'Sem avaliador de resultados de ações nesta fase']];
  if(metrics)for(const [label,count,help] of rows){const card=make('article');card.append(make('small',label),make('strong',new Intl.NumberFormat('pt-BR').format(count)),make('span',help));metrics.append(card);}
  if(lessons)for(const row of value.lessons){const card=make('article',undefined,'mls-learning-lesson');card.dataset.agent=row.agent;card.append(make('h4',row.title),make('span',row.confidence==='REPEATED'?'Padrão repetido em recortes':'Observação registrada','mls-learning-confidence'),make('p',row.detail),make('small',row.evidence_count+' recorte(s) salvo(s) · primeira observação '+stamp(row.first_observed_at)+' · última '+stamp(row.last_observed_at)));lessons.append(card);}
  if(lessons&&!value.lessons.length)lessons.append(make('p',value.status==='EMPTY'?'Ainda não há uma publicação financeira completa registrada para este mês. A coleta automática preservará evidências quando estiverem disponíveis.':'Nenhum padrão descritivo adicional foi identificado neste recorte. Isso não comprova ausência de problemas.','mls-learning-note'));
  const period=value.month.slice(5)+'/'+value.month.slice(0,4),end=e.latest_end_date?' · recorte até '+short(e.latest_end_date):'';
  message((value.status==='STALE'?'Memória com evidência antiga; aguarda nova conferência. ':value.status==='EMPTY'?'Memória aguardando evidências. ':'Memória de observações disponível. ')+period+end+' · última observação '+stamp(e.latest_observed_at)+'.',value.status==='STALE'?'stale':'ready');
 }
 async function read(){
  if(!started||!root.open||busy)return false;
  syncContext();const selected=currentMonth,source=currentSource,token=++generation;busy=true;clear();if(reload)reload.disabled=true;message('Conferindo a memória salva de '+selected.slice(5)+'/'+selected.slice(0,4)+'…','loading');
  const active=()=>started&&root.open&&token===generation&&context().month===selected&&context().source===source;
  try{const value=project(await api('agents/learning?month='+encodeURIComponent(selected)),selected);if(!active())return false;if(!value)throw Error('INVALID_LEARNING_REPORT');snapshot=value;render(value);return true;}
  catch(error){if(!active())return false;clear();if(error?.status===401||error?.status===403){message('Sua sessão precisa ser confirmada para consultar a memória dos agentes.','error');if(login)login.hidden=false;}else message('Não foi possível conferir a memória salva. Use Conferir memória para tentar novamente.','error');return false;}
  finally{if(token===generation){busy=false;if(reload)reload.disabled=false;}}
 }
 root.addEventListener('toggle',()=>{if(!root.open){generation++;busy=false;if(reload)reload.disabled=false;return;}if(started)void read();});
 reload?.addEventListener('click',()=>{if(!root.open)root.open=true;void read();});
 byId('businessMonthSelect')?.addEventListener('change',()=>{syncContext();});
 globalThis.mlsAgentLearning=Object.freeze({start(options={}){if(typeof options.api!=='function')return false;generation++;api=options.api;started=true;busy=false;currentMonth=null;syncContext();if(root.open)void read();return true;},refreshContext(){if(!started)return;syncContext();},stop(){generation++;started=false;api=null;busy=false;currentMonth=null;currentSource=null;clear();if(reload)reload.disabled=false;message('Entre novamente para conferir a memória salva dos agentes.');},getSnapshot:()=>snapshot});
})();
`;
