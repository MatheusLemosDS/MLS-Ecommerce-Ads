import {buildPendingIncomeAudit,buildMlsAgentRegistry} from './agent-registry.mjs';
import {missionTrendPanelBody} from './mission-control.mjs';
import {MLS_AGENT_ROBOT_SVG,MLS_COMMAND_GLOBE_SVG} from './mls-agent-art.mjs';

export const COMMAND_CENTER_CSS=String.raw`
.command-center{margin-bottom:26px}.command-center-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:16px}.command-center-head h2{font-size:25px;margin:4px 0 7px;letter-spacing:-.6px}.command-center-head p{margin:0;color:var(--muted);font-size:12px;max-width:760px}.command-center-mode{display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border:1px solid var(--line);border-radius:999px;background:var(--surface);font-size:10px;font-weight:700;color:var(--muted);white-space:nowrap}.command-center-mode:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--positive,#17845c)}
.command-center-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:11px;margin-bottom:16px}.command-metric{min-width:0;padding:17px 16px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.command-metric small{display:block;font-size:10px;color:var(--muted);line-height:1.45}.command-metric strong{display:block;margin:7px 0 3px;font-size:22px;line-height:1.25;letter-spacing:-.6px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.command-metric span{display:block;font-size:9px;color:var(--muted);line-height:1.5}.command-metric[data-tone=warning] strong{color:var(--warning,#8a651c)}.command-metric[data-tone=negative] strong{color:var(--negative,#db6477)}
.command-center-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1.95fr);gap:16px;align-items:start}.hermes-command{min-width:0;padding:22px;border:1px solid var(--line);border-radius:16px;background:var(--surface)}.hermes-command-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.hermes-command-head h3{font-size:19px;margin:4px 0}.hermes-command-head p{font-size:11px;color:var(--muted);margin:0}.agent-status{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:999px;background:var(--surface-raised);font-size:9px;font-weight:700;color:var(--muted);white-space:nowrap}.agent-status:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--muted)}.agent-status[data-status=HEALTHY]:before{background:var(--positive,#17845c)}.agent-status[data-status=WORKING]:before{background:var(--accent,#0f6b78)}.agent-status[data-status=ATTENTION]:before{background:#d29a25}.agent-status[data-status=BLOCKED]:before{background:var(--negative,#db6477)}.hermes-command-summary{margin:18px 0;padding:14px;border-radius:11px;background:var(--surface-raised);font-size:12px;line-height:1.75}.hermes-command-summary strong{display:block;font-size:13px;margin-bottom:5px}.hermes-command-summary p{margin:0;color:var(--muted)}
.command-priorities{display:grid;gap:8px;margin:15px 0}.command-priority{display:block;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:var(--surface);color:var(--text);text-decoration:none}.command-priority:hover{text-decoration:none;background:var(--surface-raised)}.command-priority strong,.command-priority span{display:block}.command-priority strong{font-size:11px;line-height:1.5}.command-priority span{margin-top:4px;font-size:10px;line-height:1.55;color:var(--muted)}.command-priority[data-severity=BLOCKED]{border-left:3px solid var(--negative,#db6477)}.command-priority[data-severity=ATTENTION]{border-left:3px solid #d29a25}.command-priority[data-severity=WORKING]{border-left:3px solid var(--accent,#0f6b78)}.command-empty{padding:12px;border-radius:10px;background:var(--surface-raised);color:var(--muted);font-size:11px;line-height:1.7}.hermes-command-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line);font-size:10px;color:var(--muted)}.hermes-command-foot a{font-weight:700}
.agent-panel{min-width:0}.agent-panel-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:10px}.agent-panel-head h3{font-size:16px;margin:0}.agent-panel-head p{font-size:10px;color:var(--muted);margin:0}.agent-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.agent-card{display:flex;flex-direction:column;min-width:0;min-height:144px;padding:16px;border:1px solid var(--line);border-radius:13px;background:var(--surface);color:var(--text);text-decoration:none}.agent-card:hover{text-decoration:none;background:var(--surface-raised)}.agent-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.agent-card h4{font-size:13px;margin:0}.agent-card small{display:block;margin-top:3px;color:var(--muted);font-size:9px}.agent-card p{margin:12px 0 10px;color:var(--muted);font-size:10px;line-height:1.65}.agent-card-metric{margin-top:auto;font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.agent-card-expenses{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)}.agent-card-expenses div{min-width:0}.agent-card-expenses small{display:block;font-size:8px;color:var(--muted);line-height:1.45}.agent-card-expenses strong{display:block;margin-top:2px;font-size:10px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.agent-card-expenses span{display:block;margin-top:2px;font-size:8px;color:var(--muted);line-height:1.4}.agent-card-secondary{margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}.agent-card-secondary small{display:block;font-size:9px;color:var(--muted);margin-bottom:3px}.agent-card-secondary strong{display:block;font-size:11px;font-variant-numeric:tabular-nums}.agent-card-secondary span{display:block;margin-top:3px;font-size:8px;line-height:1.45;color:var(--muted)}.agent-card[data-status=ATTENTION]{border-left:3px solid #d29a25}.agent-card[data-status=BLOCKED]{border-left:3px solid var(--negative,#db6477)}.agent-card[data-status=WORKING]{border-left:3px solid var(--accent,#0f6b78)}.command-pending-detail{margin-top:16px;border:1px solid var(--line);border-radius:13px;background:var(--surface)}.command-pending-detail>summary{cursor:pointer;list-style:none;padding:14px 16px;font-size:11px;font-weight:700}.command-pending-detail>summary::-webkit-details-marker{display:none}.command-pending-detail>summary::after{content:"+";float:right;color:var(--muted);font-size:16px}.command-pending-detail[open]>summary::after{content:"−"}.command-pending-body{padding:0 16px 16px}.command-pending-body>p{margin:0 0 10px;color:var(--muted);font-size:10px;line-height:1.7}.command-pending-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.command-pending-row{padding:11px;border:1px solid var(--line);border-radius:9px;min-width:0}.command-pending-row strong,.command-pending-row span,.command-pending-row small{display:block}.command-pending-row strong{font-size:11px;overflow-wrap:anywhere}.command-pending-row span,.command-pending-row small{margin-top:4px;color:var(--muted);font-size:9px;line-height:1.55}.command-pending-status{font-size:10px;color:var(--muted);margin-bottom:10px}.command-center-note{margin:11px 0 0;font-size:10px;line-height:1.7;color:var(--muted)}
@media(max-width:1180px){.command-center-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.command-center-grid{grid-template-columns:minmax(0,1fr)}.agent-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:760px){.command-center{margin-bottom:20px}.command-center-head{display:block}.command-center-mode{margin-top:10px}.command-center-head h2{font-size:22px}.command-center-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.command-metric{padding:14px 12px}.command-metric strong{font-size:19px}.agent-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.hermes-command{padding:18px}.hermes-command-head{gap:8px}.hermes-command-foot{align-items:flex-start;flex-direction:column}}
@media(max-width:390px){.command-center-metrics,.agent-grid,.command-pending-grid{grid-template-columns:minmax(0,1fr)}}

/* Finite, owner-visible financial data states; no financial amounts are inferred. */
.mission-source-state[hidden]{display:none!important}
.mission-source-state{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:12px;padding:11px 13px;border-radius:12px;border:1px solid rgba(243,180,75,.35);background:rgba(22,39,64,.86);color:var(--text)}
.mission-source-copy{flex:1;min-width:180px}
.mission-source-copy strong{display:block;font-size:12px;color:#ffcf88}
.mission-source-copy p{margin:4px 0 0!important;font-size:11px;line-height:1.45;color:#b9cce5}
.mission-source-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.mission-source-actions button,.mission-source-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:7px 10px;border:1px solid rgba(120,183,244,.42);border-radius:9px;background:rgba(38,87,150,.27);color:#dbedff;font-size:11px;font-weight:700;text-decoration:none;cursor:pointer}
.mission-source-actions button:disabled{opacity:.55;cursor:not-allowed}
.mission-source-actions button[hidden],.mission-collector-feedback[hidden]{display:none!important}

.mission-inline-diagnostic[hidden],.mission-inline-diagnostic a[hidden]{display:none!important}
.mission-inline-diagnostic{margin-top:10px;border:1px solid rgba(112,179,247,.32);background:rgba(14,39,67,.70);border-radius:10px;padding:10px 12px}
.mission-inline-diagnostic>strong{font-size:11px;color:#ceeaff}
.mission-inline-diagnostic>p{font-size:11px;color:#c7d9eb;line-height:1.55;white-space:pre-line;overflow-wrap:anywhere;margin:7px 0 0!important}
.mission-inline-diagnostic>a{display:inline-block;margin-top:9px;font-size:11px;font-weight:750;color:#95d5ff;text-decoration:underline}
.mission-finance-auth-recovery[hidden]{display:none!important}
.mission-finance-auth-recovery{margin-top:12px;padding:12px;border:1px solid rgba(255,176,99,.34);background:rgba(54,41,45,.44);border-radius:12px;max-width:100%}
.mission-finance-auth-recovery strong{font-size:12px;color:#ffd6a3}
.mission-finance-auth-recovery p{margin:5px 0 9px!important;line-height:1.5;font-size:11px;color:#d4dfef}
.mission-finance-auth-links{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.mission-finance-auth-links a{min-height:38px;display:inline-flex;align-items:center;padding:8px 11px;border:1px solid rgba(142,188,244,.55);border-radius:9px;background:rgba(36,76,138,.40);color:#e4f4ff;font-weight:700;font-size:11px;text-decoration:none}
.mission-finance-auth-links a:focus-visible{outline:3px solid #88d6ff;outline-offset:2px}
.mission-finance-auth-recovery small{display:block;color:#9fbbd7;line-height:1.5;font-size:10px;margin-top:8px}
@media(max-width:570px){.mission-finance-auth-links a{flex:1;justify-content:center}}

.mission-source-copy .mission-collector-status{color:#9dbbdb;font-size:10px;line-height:1.55;margin-top:6px!important}
.mission-source-copy .mission-collector-feedback{color:#bde9fa;font-size:10px;margin-top:6px!important}
.mission-source-actions button:focus-visible,.mission-source-actions a:focus-visible{outline:3px solid #87d9ff;outline-offset:2px}
.mission-dashboard .mission-command-hero[data-source-state=missing]{max-height:none!important;height:auto!important}
@media(max-width:570px){.mission-source-state{padding:10px}.mission-source-actions{width:100%}.mission-source-actions button,.mission-source-actions a{flex:1}}

`;

export function commandCenterBody(){
 // Static, non-financial placeholders stay visible even if one browser script
 // fails before the observational agent registry can hydrate the dashboard.
 const fallbackAgents=[
  ['hermes','MLS Hermes','Supervisor','/admin?tab=agent-hermes'],
  ['finance','MLS Finance','Financeiro','/admin?tab=agent-finance'],
  ['ads','MLS Ads','Anúncios','/admin?tab=agent-ads'],
  ['products','MLS Products','Produtos','/admin?tab=agent-products'],
  ['production','MLS Production','Produção','/admin?tab=agent-production'],
  ['returns','MLS Returns','Devoluções','/admin?tab=agent-returns']
 ].map(([id,name,area,href])=>`<a class="agent-card" href="${href}" data-mission-open="agent-${id}" data-mission-accent="${id}" data-agent-placeholder="true"><span class="mls-agent-avatar" aria-hidden="true">${MLS_AGENT_ROBOT_SVG}</span><div class="agent-card-head"><div><h4>${name}</h4><small>${area} · Observador</small></div><span class="agent-status">Aguardando dados</span></div><p>Estado e evidências após a leitura. Nenhum valor é presumido.</p><span class="mission-card-link">Abrir painel</span></a>`).join('');
 return `<section id="commandCenter" class="command-center mission-dashboard" aria-labelledby="commandCenterTitle"><header class="command-center-head mission-command-hero"><div class="mission-overview-copy"><h2 id="commandCenterTitle">Central de Comando</h2><p>Visão geral do seu e-commerce com inteligência em tempo real.</p><details class="mls-overview-source"><summary>Estado da leitura e conexão financeira</summary><section class="mission-source-state" id="missionSourceState" role="status" aria-live="polite" hidden><div class="mission-source-copy"><strong id="missionSourceTitle">Dados financeiros ainda indisponíveis</strong><p id="missionSourceDescription">Aguardando uma leitura validada da fonte financeira.</p><p class="mission-collector-status" id="missionCollectorStatus">O progresso da coleta será mostrado quando a fonte carregar.</p><p class="mission-collector-feedback" id="missionCollectorFeedback" aria-live="polite" hidden></p><div class="mission-inline-diagnostic" id="missionInlineDiagnostic" hidden><strong>Estado técnico do agendador</strong><p id="missionInlineDiagnosticResult" aria-live="polite">A consulta começa somente após seu clique.</p><a id="missionInlineDiagnosticLogin" href="/login" hidden>Entrar como administrador neste navegador</a></div><aside class="mission-finance-auth-recovery" id="missionFinanceAuthRecovery" hidden aria-label="Recuperar autorização financeira"><strong>Conexão financeira precisa ser conferida</strong><p>Verifique o estado da autorização no Auth. Se estiver desconectada ou exigir nova autorização, reconecte a loja pela aplicação financeira. Os dados salvos permanecem preservados.</p><div class="mission-finance-auth-links"><a href="https://auth.brazacommerce.com.br/shopee/finance/status" target="_blank" rel="noopener noreferrer">Ver estado da conexão</a><a href="https://auth.brazacommerce.com.br/shopee/finance/connect" target="_blank" rel="noopener noreferrer">Reautorizar Financeiro</a></div><small>Não compartilhe o código de retorno, tokens, cookies ou a URL de callback. Após autorizar, acompanhe a próxima execução no MLS Finance.</small></aside></div><div class="mission-source-actions"><button type="button" id="missionSourceRetry">Reler resumo salvo</button><button type="button" id="missionSourceInspect">Diagnosticar coleta</button><button type="button" id="missionSourcePriority" hidden>Priorizar coleta</button><a href="/admin?tab=agent-finance" data-mission-open="agent-finance">Ver Finance</a></div></section></details></div><div class="mls-overview-period"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><rect x="4" y="5" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 3v4m8-4v4M4 10h16m-11 4h2m3 0h2m-7 3h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg><select id="mlsOverviewPeriod" aria-label="Selecionar data da Visão geral" disabled><option value="today">Hoje</option><option value="yesterday">Ontem</option><option value="custom">Outra data</option></select><input id="mlsOverviewDate" type="date" aria-label="Data da Visão geral · Brasília" hidden disabled></div><div class="mls-command-globe" aria-hidden="true">${MLS_COMMAND_GLOBE_SVG}</div></header><div class="command-center-metrics" aria-label="Resumo executivo de hoje"><article class="command-metric" data-mission-metric="net"><small>Lucro estimado hoje</small><strong id="commandCenterNet">Em apuração</strong><span id="missionProfitState" class="mission-profit-state" data-tone="unknown">Resultado em apuração</span><span id="missionKpiDeltaNet" class="mission-kpi-delta" data-direction="UNAVAILABLE">↔ Aguardando comparação</span><div class="mission-kpi-sparkline" id="missionSparkNet" role="img" aria-label="Sem histórico diário suficiente"></div></article><article class="command-metric" data-mission-metric="sales"><small>Vendas hoje</small><strong id="commandCenterSales">—</strong><span id="missionKpiDeltaSales" class="mission-kpi-delta" data-direction="UNAVAILABLE">↔ Aguardando comparação</span><div class="mission-kpi-sparkline" id="missionSparkSales" role="img" aria-label="Sem histórico diário suficiente"></div></article><article class="command-metric" data-mission-metric="ads"><small>Ads hoje</small><strong id="commandCenterAds">—</strong><span id="missionKpiDeltaAds" class="mission-kpi-delta" data-direction="UNAVAILABLE">↔ Aguardando comparação</span><div class="mission-kpi-sparkline" id="missionSparkAds" role="img" aria-label="Sem histórico diário suficiente"></div></article><article class="command-metric" data-mission-metric="margin"><small>Margem estimada</small><strong id="commandCenterMargin">—</strong><span id="missionKpiDeltaMargin" class="mission-kpi-delta" data-direction="UNAVAILABLE">↔ Aguardando comparação</span></article><article class="command-metric" data-mission-metric="paid"><small>Pedidos pagos</small><strong id="commandCenterPaid">—</strong><span id="missionKpiDeltaPaid" class="mission-kpi-delta" data-direction="UNAVAILABLE">↔ Aguardando comparação</span></article><article class="command-metric" id="commandCenterAlertsCard" data-mission-metric="alerts"><small>Prioridades</small><strong id="commandCenterAlerts">—</strong></article></div><details class="mls-kpi-context"><summary>Base dos indicadores e comparação entre dias</summary><p>Vendas e pedidos seguem a data de criação de pedidos pagos; anúncios usam o consumo no calendário da Shopee. Os valores são observados, sem comprovar depósito bancário.</p><div><small class="mission-kpi-comparison-date" id="missionKpiDeltaDateNet">Últimos dois dias completos</small><small class="mission-kpi-comparison-date" id="missionKpiDeltaDateSales">Últimos dois dias completos</small><small class="mission-kpi-comparison-date" id="missionKpiDeltaDateAds">Últimos dois dias completos</small><small class="mission-kpi-comparison-date" id="missionKpiDeltaDateMargin">Últimos dois dias completos</small><small class="mission-kpi-comparison-date" id="missionKpiDeltaDatePaid">Últimos dois dias completos</small><span id="commandCenterNetHelp">Mesma referência do resultado diário.</span><span id="commandCenterMarginHelp">Sobre as vendas do dia.</span></div></details><section id="commandAgents" class="agent-panel" aria-labelledby="commandAgentsTitle"><header class="agent-panel-head"><div><h3 id="commandAgentsTitle">Seus agentes</h3><p>Equipe digital especializada, cada um com seu painel completo.</p></div><a href="/admin?tab=agents" data-mission-open="agents" class="mission-fleet-link" aria-label="Agentes em modo Observador">Modo dos agentes <span class="mls-observer-dot" aria-hidden="true"></span> Observador</a></header><div id="commandCenterAgents" class="agent-grid">${fallbackAgents}</div></section><div class="command-center-grid mls-overview-panels" aria-label="Desempenho, atividades e prioridades"><section class="mls-overview-performance" aria-labelledby="mlsOverviewPerformanceTitle"><h3 id="mlsOverviewPerformanceTitle">Desempenho geral</h3>${missionTrendPanelBody("overview")}</section><article class="mls-overview-activity mission-module" aria-labelledby="mlsOverviewActivityTitle"><header class="mission-module-head"><h3 id="mlsOverviewActivityTitle">Últimas atividades dos agentes</h3></header><p class="command-empty" role="status">Sem atividade auditada no período.</p><p class="mls-overview-source-note">Os estados dos agentes não comprovam ações executadas. O histórico está disponível para conferência.</p><a class="mission-action" href="/admin?tab=history" data-mission-open="history">Abrir histórico e auditoria</a></article><article class="hermes-command mls-overview-priorities" aria-labelledby="mlsOverviewPrioritiesTitle"><div class="hermes-command-head"><div><span class="eyebrow">MLS HERMES · SUPERVISOR</span><h3 id="mlsOverviewPrioritiesTitle">Prioridades de hoje</h3><p>Coordena a leitura dos agentes sem executar ações comerciais nesta fase.</p></div><span id="commandCenterHermesStatus" class="agent-status" data-status="WORKING">Preparando</span></div><div id="commandCenterHermesSummary" class="hermes-command-summary"><strong>Montando o resumo operacional</strong><p>Os agentes usarão os dados que já estão no painel.</p></div><div id="commandCenterPriorities" class="command-priorities"></div><div class="hermes-command-foot"><span>Ads/PROMO permanecem bloqueados para escrita.</span><a href="/admin?tab=agent-hermes" data-mission-open="agent-hermes">Abrir MLS Hermes</a></div></article></div><details class="mls-overview-detail"><summary>Comparativo do dia e saúde dos agentes</summary><section class="mission-day-intelligence" aria-label="Inteligência operacional com indicadores verificados">
  <article class="mission-data-panel"><span class="mission-panel-eyebrow">PANORAMA DO DIA · VALORES EM BRL</span><h3>Comparativo financeiro de hoje</h3><p>Três valores da mesma data. As barras não representam histórico, recebimento bancário ou composição do lucro.</p>
   <div class="mission-comparison-bars">
    <div class="mission-comparison-row" data-visual="sales"><header><span>Vendas pagas</span><strong id="missionDayValueSales">—</strong></header><div class="mission-comparison-track"><span id="missionDayBarSales"></span></div></div>
    <div class="mission-comparison-row" data-visual="net"><header><span>Lucro estimado</span><strong id="missionDayValueNet">—</strong></header><div class="mission-comparison-track"><span id="missionDayBarNet"></span></div></div>
    <div class="mission-comparison-row" data-visual="ads"><header><span>Gasto Ads</span><strong id="missionDayValueAds">—</strong></header><div class="mission-comparison-track"><span id="missionDayBarAds"></span></div></div>
   </div><p class="mission-comparison-foot">Barras relativas ao maior valor positivo observado no dia; valores indisponíveis permanecem como —.</p>
  </article>
  <article class="mission-data-panel"><span class="mission-panel-eyebrow">MONITOR DE AGENTES</span><h3>Saúde da equipe digital</h3><p>Contagem real dos seis especialistas em modo Observador, sem execução comercial.</p>
   <div class="mission-health-overview"><div class="mission-health-ring" id="missionHealthRing"><strong id="missionHealthCount">—</strong></div><div class="mission-health-caption">Agentes saudáveis <strong>de 6 especialistas</strong></div></div>
   <a class="mission-auditor-link" href="/admin?tab=agent-auditor" data-mission-open="agent-auditor">Abrir MLS Auditor</a><div class="mission-health-list"><div data-health="HEALTHY">Saudáveis <strong id="missionHealthHealthy">—</strong></div><div data-health="WORKING">Em acompanhamento <strong id="missionHealthWorking">—</strong></div><div data-health="ATTENTION">Atenção <strong id="missionHealthAttention">—</strong></div><div data-health="BLOCKED">Bloqueados <strong id="missionHealthBlocked">—</strong></div></div>
  </article></section></details><p class="command-center-note">Esta central é uma projeção local dos dados já coletados. Ela não cria chamadas extras à Shopee, não altera campanhas e não transforma estimativas em lucro realizado.</p></section>`;
}

export function pendingIncomeBody(){return "<details id=\"commandPendingIncomeDetails\" class=\"command-pending-detail\"><summary>Pending atual por pedido · MLS Finance</summary><div class=\"command-pending-body\"><p>Carrega somente o snapshot local coletado em background. Não consulta a Shopee ao abrir.</p><div id=\"commandCenterPendingStatus\" class=\"command-pending-status\">Abra para carregar os detalhes disponíveis.</div><div id=\"commandCenterPendingRows\" class=\"command-pending-grid\"></div></div></details>";}

export const AGENT_REGISTRY_CLIENT=String.raw`
(()=>{
 const buildPendingIncomeAudit=${buildPendingIncomeAudit.toString()};
 const buildMlsAgentRegistry=${buildMlsAgentRegistry.toString()};
 const robotArtwork=${JSON.stringify(MLS_AGENT_ROBOT_SVG)};
 const el=name=>document.getElementById('commandCenter'+name);
 const node=(tag,text,cls)=>{const value=document.createElement(tag);if(text!==undefined)value.textContent=text;if(cls)value.className=cls;return value;};
 const money=value=>{if(!Number.isSafeInteger(value))return '—';const cents=BigInt(value),negative=cents<0n,absolute=negative?-cents:cents,fraction=String(absolute%100n).padStart(2,'0');const formatted=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).formatToParts(absolute/100n).map(part=>part.type==='fraction'?fraction:part.value).join('');return (negative?'-':'')+formatted;};
 const percent=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}).format(value/100)+'%':'—';
 const shortDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8)+'/'+value.slice(5,7):'—';
 const count=value=>Number.isSafeInteger(value)?new Intl.NumberFormat('pt-BR').format(value):'—';
 const statusLabel={HEALTHY:'Saudável',WORKING:'Trabalhando',ATTENTION:'Atenção',BLOCKED:'Bloqueado'};
 let lastKey='',observer=null,queued=false,registry=null,pendingDetailLoaded=false,sourcePriorityBusy=false;
 function read(){
  let day=null,month=null,reconciliation=null,releases=null,incomeOverview=null,incomeDetail=null,catalog=null,productionPeriod=null,dtfQueue=null;
  try{day=globalThis.brazaDayDashboard?.getSnapshot?.()??null;}catch{}
  try{month=globalThis.brazaMonthDashboard?.getSnapshot?.()??null;}catch{}
  try{reconciliation=globalThis.brazaReconciliation?.getSnapshot?.()??null;}catch{}
  try{releases=globalThis.brazaEscrowReleases?.getSnapshot?.()??null;}catch{}
  try{incomeOverview=globalThis.brazaIncomeOverview?.getSnapshot?.()??null;}catch{}
  try{incomeDetail=globalThis.brazaIncomeOverview?.getDetailSnapshot?.()??null;}catch{}
  try{catalog=globalThis.brazaSavedCatalog?.getSnapshot?.()??null;}catch{}
  try{productionPeriod=globalThis.brazaProductionCostPeriods?.getSnapshot?.()??null;}catch{}
  try{dtfQueue=globalThis.brazaDtfWorkspace?.getSnapshot?.()??null;}catch{}
  const pendingAudit=buildPendingIncomeAudit({overview:incomeOverview,detail:incomeDetail,detailLoaded:pendingDetailLoaded});
  return buildMlsAgentRegistry({day,month,reconciliation,releases,incomeOverview,pendingAudit,catalog,productionPeriod,dtfQueue});
 }
 function renderPending(){
  const status=el('PendingStatus'),target=el('PendingRows');if(!status||!target)return;target.replaceChildren();let detail=null,overview=null;try{detail=globalThis.brazaIncomeOverview?.getDetailSnapshot?.()??null;overview=globalThis.brazaIncomeOverview?.getSnapshot?.()??null;}catch{}
  const audit=buildPendingIncomeAudit({overview,detail,detailLoaded:pendingDetailLoaded});
  const time=value=>Number.isSafeInteger(value)?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value*1000)):'—';
  if(audit.state==='NO_OVERVIEW'||audit.state==='OVERVIEW_AMOUNT_UNVERIFIED'){status.textContent='O valor Pending atual ainda não foi confirmado pela coleta.';return;}
  if(audit.state==='NO_PENDING'){status.textContent='A Shopee informa Pending atual igual a R$ 0,00 neste snapshot. Nenhum detalhe por pedido é necessário.';return;}
  if(audit.state==='DETAIL_NOT_LOADED'){status.textContent='Abra esta seção para ler o snapshot local por pedido. Isso não consulta a Shopee.';return;}
  if(audit.state==='WAITING_SAVED_DETAIL'){status.textContent='O MLS Finance ainda não possui o primeiro detalhe Pending salvo. O cron fará a coleta sem depender desta tela.';return;}
  const parts=['Overview: '+money(audit.pending_cents),'Detalhe: '+count(audit.returned_count)+' registro(s) / '+count(audit.unique_orders)+' pedido(s)','Subtotal visível: '+money(audit.visible_estimated_cents),'Valores conhecidos: '+count(audit.known_amount_rows)+' de '+count(audit.returned_count)];
  if(audit.state==='DETAIL_OLDER_THAN_OVERVIEW')parts.push('Detalhe anterior ao Overview; comparação suspensa');
  else if(audit.state==='PARTIAL_PAGE')parts.push('Há mais páginas; cobertura parcial');
  else if(audit.state==='AMOUNT_PARTIAL')parts.push('Há valor(es) sem conversão segura para centavos');
  else if(audit.state==='OBSERVED_MATCH')parts.push('Os valores coincidem neste recorte, sem provar competência mensal ou depósito');
  else if(audit.state==='OBSERVED_DIFFERENT')parts.push('Diferença descritiva: '+(audit.difference_cents>0?'+':'')+money(audit.difference_cents)+'; validar semântica no Seller Centre');
  else if(audit.state==='ARITHMETIC_UNSAFE')parts.push('Soma fora do limite seguro; auditoria bloqueada');
  parts.push('Overview em '+time(audit.overview_checked_at)+' · detalhe em '+time(audit.detail_checked_at));
  status.textContent=parts.join(' · ')+'.';
  if(!detail)return;
  for(const row of detail.rows){const card=node('article',undefined,'command-pending-row'),ref='Pedido interno '+row.order_hash.slice(0,10)+'…';card.append(node('strong',ref),node('span',row.status||'Pending'));const amount=Number.isSafeInteger(row.estimated_escrow_cents)?money(row.estimated_escrow_cents):'Valor em unidade ainda não convertível';card.append(node('small','Escrow estimado: '+amount));if(Number.isSafeInteger(row.estimated_payout_time))card.append(node('small','Previsão informada: '+new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(row.estimated_payout_time*1000))));target.append(card);}
 }
 function metricValue(agent,secondary=false){
  const kind=secondary?agent.secondary_metric_kind:agent.metric_kind,value=secondary?agent.secondary_metric:agent.metric;
  if(kind==='money')return money(value);
  if(kind==='units')return Number.isSafeInteger(value)?count(value)+' unidade(s)':'—';
  if(kind==='count')return Number.isSafeInteger(value)?count(value)+' item(ns)':'—';
  if(kind==='lines')return Number.isSafeInteger(value)?count(value)+' linha(s)':'—';
  return '';
 }
 function renderDayIntelligence(value){
  const daily=value?.day||{},amounts=[['Sales',daily.sales_cents],['Net',daily.net_cents],['Ads',daily.ads_spend_cents]];
  const positive=amounts.map(([,amount])=>Number.isSafeInteger(amount)&&amount>0?amount:0),maximum=Math.max(0,...positive);
  for(const [key,amount] of amounts){
   const label=document.getElementById('missionDayValue'+key),bar=document.getElementById('missionDayBar'+key);
   if(label)label.textContent=money(amount);
   if(bar){const pct=maximum>0&&Number.isSafeInteger(amount)&&amount>0?Math.min(100,Math.round(amount/maximum*1000)/10):0;bar.style.width=pct+'%';}
  }
  const counts={HEALTHY:0,WORKING:0,ATTENTION:0,BLOCKED:0};
  for(const agent of Array.isArray(value?.agents)?value.agents:[])if(Object.hasOwn(counts,agent?.status))counts[agent.status]++;
  const total=Object.values(counts).reduce((sum,part)=>sum+part,0);
  for(const [kind,number] of Object.entries(counts)){const label=document.getElementById('missionHealth'+({HEALTHY:'Healthy',WORKING:'Working',ATTENTION:'Attention',BLOCKED:'Blocked'}[kind]));if(label)label.textContent=count(number);}
  const result=document.getElementById('missionHealthCount');if(result)result.textContent=count(counts.HEALTHY)+' / '+count(total);
  const ring=document.getElementById('missionHealthRing');if(ring?.style?.setProperty)ring.style.setProperty('--mission-health-pct',total>0?(counts.HEALTHY/total*100).toFixed(2)+'%':'0%');
 }

 function paintSourceState(){
  const box=document.getElementById('missionSourceState'),title=document.getElementById('missionSourceTitle'),
   message=document.getElementById('missionSourceDescription'),retry=document.getElementById('missionSourceRetry');
  if(!box||!title||!message)return;
  const hero=typeof document.querySelector==='function'?document.querySelector('.mission-command-hero'):null;
  let day=null,month=null,trend=null,coverage=null;
  try{day=globalThis.brazaDayDashboard?.getSnapshot?.()??null;}catch{}
  try{month=globalThis.brazaMonthDashboard?.getSnapshot?.()??null;}catch{}
  try{trend=globalThis.brazaDayDashboard?.getTrend?.()??null;}catch{}
  try{coverage=globalThis.brazaMonthDashboard?.getSourceStatus?.()??null;}catch{}
  const complete=day&&['net_cents','sales_cents','ads_spend_cents','paid_orders'].some(key=>Number.isSafeInteger(day[key]));
  box.hidden=!!complete;const sourceDisclosure=document.querySelector?.('.mls-overview-source');if(sourceDisclosure)sourceDisclosure.hidden=!!complete;
  if(hero)hero.dataset.sourceState=complete?'ready':'missing';
  if(complete)return;
  const validMonth=key=>typeof key==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(key);
  const validDay=key=>typeof key==='string'&&/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(key);
  const selected=validDay(day?.date)?day.date:null,selectedMonth=selected?.slice(0,7);
  const currentMonth=validMonth(month?.month)?month.month:null,reference=selectedMonth||currentMonth;
  const monthlyReady=month?.schema==='mls_month_snapshot_v1'&&['RUNNING','COMPLETE'].includes(month.status)&&Number.isSafeInteger(month.checked_at)&&month.checked_at>0;
  const short=key=>key?.slice(8,10)+'/'+key?.slice(5,7)+'/'+key?.slice(0,4);
  const observed=trend?.schema==='mls_mission_daily_trend_v1'&&Array.isArray(trend.points)?trend.points.filter(row=>validDay(row?.date)&&['net_cents','sales_cents','ads_spend_cents'].some(key=>Number.isSafeInteger(row[key]))):[];
  const latest=observed.length?observed[observed.length-1].date:null;
  const end=coverage?.schema==='mls_finance_source_coverage_v1'&&validDay(coverage.published_through)?coverage.published_through:null;
  const auto=coverage?.automatic_enabled===false?' A coleta automática está desativada.':coverage?.collection_status==='RUNNING'?' A coleta mensal ainda não foi concluída.':'';
  if(monthlyReady&&currentMonth===selectedMonth&&end&&selected&&selected>end){
   title.textContent='O dia '+short(selected)+' ainda não consta na publicação financeira';
   message.textContent='O último resumo validado cobre até '+short(end)+'. '+short(selected)+' ainda está fora desse recorte; não é venda zero nem falha de cálculo.'+auto;
  }else if(monthlyReady&&currentMonth===selectedMonth&&coverage?.daily_summary_present===false&&coverage?.display_source==='PUBLISHED'){
   title.textContent='Resumo mensal disponível, detalhamento diário pendente';
   message.textContent='Há publicação mensal, mas a série diária ainda não passou pela validação de origem e custos.'+(end?' Período publicado até '+short(end)+'.':'')+auto;
  }else if(monthlyReady&&currentMonth===selectedMonth&&coverage?.daily_summary_state==='UNAVAILABLE'){
   title.textContent='Detalhamento diário sem valores suficientes';
   message.textContent='O recorte mensal está carregado, porém o histórico por dia não contém evidência financeira completa para esta data.'+(end?' Publicação até '+short(end)+'.':'')+auto;
  }else if(monthlyReady&&currentMonth!==null&&selectedMonth!==null&&currentMonth!==selectedMonth){
   title.textContent='O período financeiro está diferente da data selecionada';
   message.textContent='Data do painel: '+short(selected)+'. Referência mensal: '+currentMonth.slice(5)+'/'+currentMonth.slice(0,4)+'. Use a leitura salva do período correto.';
  }else if(monthlyReady&&month.status==='RUNNING'){
   title.textContent='Coleta financeira em andamento';
   message.textContent='A data '+(selected?short(selected):'selecionada')+' ainda não tem valores confirmados. Nenhum indicador foi substituído por zero.';
  }else if(monthlyReady){
   title.textContent='Sem leitura financeira validada para '+(selected?short(selected):'a data selecionada');
   message.textContent='O mês foi carregado, mas não há valores diários compatíveis para essa data.'+(latest?' Último dia observado: '+short(latest)+'.':'')+' Os traços não significam R$ 0,00.';
  }else{
   title.textContent='Resumo financeiro ainda não disponível nesta sessão';
   message.textContent='A leitura mensal salva não foi confirmada. Verifique a conexão e a situação do Financeiro; os valores não foram estimados.';
  }
  const progress=document.getElementById('missionCollectorStatus'),
   priority=document.getElementById('missionSourcePriority');
  const validStamp=value=>Number.isSafeInteger(value)&&value>0&&value<=9999999999;
  const clock=value=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(value*1000));
  if(progress){
   const details=[];
   if(Number.isSafeInteger(coverage?.windows_complete)&&Number.isSafeInteger(coverage?.windows_total)&&coverage.windows_total>0)
    details.push('Janelas financeiras: '+coverage.windows_complete+' de '+coverage.windows_total);
   if(Number.isSafeInteger(coverage?.pages_read))details.push('páginas processadas: '+coverage.pages_read);
   if(validStamp(coverage?.collection_checked_at))details.push('estado observado em '+clock(coverage.collection_checked_at));
   const reasons={
    BUSINESS_PERIOD_RATE_LIMIT:'A Shopee aplicou limite temporário à fonte',
    BUSINESS_PERIOD_TIMEOUT:'A leitura da fonte atingiu o limite de tempo',
    BUSINESS_PERIOD_UPSTREAM_UNAVAILABLE:'A fonte está temporariamente indisponível',
    BUSINESS_PERIOD_AUTH_REQUIRED:'A autorização financeira requer conferência',
    BUSINESS_PERIOD_PERMISSION_DENIED:'A fonte recusou a permissão',
    BUSINESS_PERIOD_INVALID_SOURCE:'A resposta financeira não passou pela validação',
    BUSINESS_PERIOD_CHECKPOINT:'A leitura foi pausada no ponto de retomada',
    BUSINESS_PERIOD_BUSY:'Outra leitura mantém a operação em andamento',
    BUSINESS_PERIOD_CONFLICT:'A leitura aguarda resolução de concorrência'
   };
   if(coverage?.collection_code&&Object.hasOwn(reasons,coverage.collection_code))
    details.push(reasons[coverage.collection_code]);
   else if(coverage?.collection_phase==='RETRY_WAIT')details.push('Aguardando prazo de nova tentativa');
   else if(coverage?.collection_phase==='BLOCKED')details.push('Coleta bloqueada: confira MLS Finance');
   if(coverage?.automatic_status==='PAUSED'||coverage?.automatic_enabled===false)
    details.push('Coleta automática desativada');
   else if(coverage?.automatic_status==='ERROR')
    details.push('A última execução automática registrou erro; conferir diagnóstico financeiro');
   else if(coverage?.automatic_status==='LIMIT_REACHED')
    details.push('A coleta atingiu o limite permitido para o período');
   if(validStamp(coverage?.automatic_last_attempt_at))
    details.push('última tentativa automática: '+clock(coverage.automatic_last_attempt_at));
   if(validStamp(coverage?.automatic_next_run_at))
    details.push('próxima tentativa prevista: '+clock(coverage.automatic_next_run_at));
   if(coverage?.collection_status==='RUNNING'&&validStamp(coverage?.automatic_last_attempt_at)&&Date.now()/1000-coverage.automatic_last_attempt_at>1800)
    details.push('não há tentativa automática recente confirmada');
   progress.textContent=details.length?details.join(' · ')+'.':'Progresso da coleta ainda não disponível neste snapshot.';
  }
  if(priority){
   const localMonth=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
   const eligible=validMonth(reference)&&reference===localMonth&&coverage?.automatic_enabled===true&&coverage?.automatic_applicable===true&&coverage?.collection_phase!=='BLOCKED'&&!['ERROR','PAUSED','LIMIT_REACHED'].includes(coverage?.automatic_status);
   priority.hidden=!eligible;
   priority.disabled=sourcePriorityBusy;
  }
  const recovery=document.getElementById('missionFinanceAuthRecovery');
  if(recovery)recovery.hidden=coverage?.schema!=='mls_finance_source_coverage_v1'||coverage?.collection_code!=='BUSINESS_PERIOD_AUTH_REQUIRED';
  if(retry){retry.disabled=!validMonth(reference);retry.dataset.month=validMonth(reference)?reference:'';}
 }

 function syncOverviewPeriod(){
  const select=document.getElementById('mlsOverviewPeriod'),proxy=document.getElementById('mlsOverviewDate'),date=document.getElementById('businessDayDate'),todayButton=document.getElementById('businessDayToday'),yesterdayButton=document.getElementById('businessDayYesterday');
  if(!select||!proxy)return;
  const ready=!!date&&!date.disabled&&!!todayButton&&!todayButton.disabled&&!!yesterdayButton&&!yesterdayButton.disabled;
  select.disabled=!ready;proxy.disabled=!ready;
  let selected=null;try{selected=globalThis.brazaDayDashboard?.getSelection?.()??null;}catch{}
  if(typeof selected!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(selected))return;
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),part=key=>parts.find(item=>item.type===key)?.value;
  const today=part('year')+'-'+part('month')+'-'+part('day'),yesterday=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10);
  select.value=selected===today?'today':selected===yesterday?'yesterday':'custom';
  proxy.value=selected;proxy.max=date?.max||today;proxy.min=date?.min||'2000-01-01';proxy.hidden=select.value!=='custom';
 }
 function render(){
  if(!el(''))return null;
  syncOverviewPeriod();
  paintSourceState();
  const value=read(),key=JSON.stringify(value);if(key===lastKey){renderPending();try{globalThis.mlsMissionTrends?.refresh?.();}catch{}return registry;}lastKey=key;registry=value;
  el('Net').textContent=money(value.day.net_cents);el('NetHelp').textContent=value.day.net_basis==='KNOWN_COSTS'?'Saldo após custos conhecidos; ainda pode diminuir.':'Mesma referência do resultado diário.';
  el('Sales').textContent=money(value.day.sales_cents);el('Ads').textContent=money(value.day.ads_spend_cents);el('Margin').textContent=percent(value.day.margin_bps);el('MarginHelp').textContent=value.day.net_basis==='KNOWN_COSTS'?'Margem parcial com custos conhecidos.':'Sobre as vendas do dia.';el('Paid').textContent=count(value.day.paid_orders);el('Alerts').textContent=count(value.priorities.length);
  const alertCard=el('AlertsCard');alertCard.dataset.tone=value.health==='BLOCKED'?'negative':value.health==='ATTENTION'?'warning':'';alertCard.dataset.resultTone=value.priorities.length?'alert':'healthy';
  const hermes=value.hermes;el('HermesStatus').textContent=statusLabel[hermes.status]||hermes.status;el('HermesStatus').dataset.status=hermes.status;
  const summary=el('HermesSummary');summary.replaceChildren(node('strong',value.health==='HEALTHY'?'Operação sem bloqueios sinalizados':value.health==='BLOCKED'?'Há um bloqueio operacional':'Há pontos para acompanhar'),node('p',hermes.message));
  const priorities=el('Priorities');priorities.replaceChildren();
  if(!value.priorities.length)priorities.append(node('div','Nenhuma prioridade foi aberta pelos dados atuais. A central continua em modo Observador.','command-empty'));
  else for(const item of value.priorities){const link=node('a',undefined,'command-priority');link.href=item.href?.startsWith?.('#business')||item.href==='#commandPendingIncomeDetails'?'/admin?tab=agent-finance'+item.href:item.href;link.dataset.severity=item.severity;link.append(node('strong',item.title),node('span',item.detail));priorities.append(link);}
  const agents=el('Agents');agents.replaceChildren();
  const visibleAgents=[value.hermes,...value.agents.filter(agent=>agent.id!=='auditor')];
  for(const agent of visibleAgents){const card=node('a',undefined,'agent-card');card.href='/admin?tab=agent-'+agent.id;card.dataset.missionOpen='agent-'+agent.id;card.dataset.missionAccent=agent.id;card.dataset.status=agent.status;const avatar=node('span',undefined,'mls-agent-avatar');avatar.setAttribute('aria-hidden','true');if(typeof globalThis.DOMParser==='function'&&typeof document.importNode==='function'){try{const art=new globalThis.DOMParser().parseFromString(robotArtwork,'image/svg+xml').documentElement;avatar.append(document.importNode(art,true));}catch{}}card.append(avatar);const head=node('div',undefined,'agent-card-head'),copy=node('div');copy.append(node('h4',agent.name),node('small',agent.area+' · Observador'));const badge=node('span',statusLabel[agent.status]||agent.status,'agent-status');badge.dataset.status=agent.status;head.append(copy,badge);card.append(head,node('p',agent.message));const metric=metricValue(agent);if(metric)card.append(node('div',metric,'agent-card-metric'));const secondary=metricValue(agent,true);if(agent.secondary_metric_label&&secondary){const extra=node('div',undefined,'agent-card-secondary');extra.append(node('small',agent.secondary_metric_label),node('strong',secondary),node('span','Snapshot atual da Shopee · separado do mês e do banco.'));card.append(extra);}card.append(node('span','Abrir painel','mission-card-link'));agents.append(card);}
  renderDayIntelligence(value);renderPending();try{globalThis.mlsMission?.refresh?.(value);}catch{}try{globalThis.mlsMissionTrends?.refresh?.();}catch{}return registry;
 }
 function queue(){if(queued)return;queued=true;Promise.resolve().then(()=>{queued=false;render();});}
 function start(){
  render();
  const period=document.getElementById('mlsOverviewPeriod'),periodDate=document.getElementById('mlsOverviewDate');
  if(period&&periodDate){
   period.onchange=()=>{
    if(period.disabled)return;
    if(period.value==='custom'){periodDate.hidden=false;periodDate.focus();try{periodDate.showPicker?.();}catch{}return;}
    const original=document.getElementById(period.value==='today'?'businessDayToday':'businessDayYesterday');
    if(original&&!original.disabled)original.click();syncOverviewPeriod();
   };
   periodDate.onchange=()=>{
    const original=document.getElementById('businessDayDate');if(periodDate.disabled||!original||original.disabled)return;
    original.value=periodDate.value;original.dispatchEvent(new Event('change',{bubbles:true}));syncOverviewPeriod();
   };
  }

  const retry=document.getElementById('missionSourceRetry');
  if(retry)retry.onclick=async()=>{
   const month=retry.dataset.month;
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))return;
   retry.disabled=true;
   try{await globalThis.brazaMonthDashboard?.selectMonth?.(month);}catch{}
   finally{paintSourceState();globalThis.mlsAgentRegistry?.notify?.();}
  };
  const priority=document.getElementById('missionSourcePriority'),
   feedback=document.getElementById('missionCollectorFeedback');
  if(priority)priority.onclick=async()=>{
   if(sourcePriorityBusy||priority.hidden)return;
   sourcePriorityBusy=true;priority.disabled=true;
   if(feedback){feedback.hidden=false;feedback.textContent='Solicitando prioridade ao agendador existente…';}
   let success=false;
   try{success=await globalThis.brazaMonthDashboard?.prioritizeCurrentMonth?.()===true;}catch{}
   finally{
    sourcePriorityBusy=false;
    if(feedback)feedback.textContent=success?'Coleta priorizada no agendador. O dia só terá números após a validação e publicação.':'Não foi possível priorizar. Confira o estado da coleta no MLS Finance; nenhuma coleta extra foi iniciada.';
    paintSourceState();globalThis.mlsAgentRegistry?.notify?.();
   }
  };

  // User-initiated only; never poll the owner endpoint automatically.
  const inspect=document.getElementById('missionSourceInspect'),
   diagnostic=document.getElementById('missionInlineDiagnostic'),
   diagnosticResult=document.getElementById('missionInlineDiagnosticResult'),
   diagnosticLogin=document.getElementById('missionInlineDiagnosticLogin');
  if(inspect&&diagnostic&&diagnosticResult)inspect.onclick=async()=>{
   if(inspect.disabled)return;
   inspect.disabled=true;
   diagnostic.hidden=false;
   if(diagnosticLogin)diagnosticLogin.hidden=true;
   diagnosticResult.textContent='Consultando a sessão administrativa nesta página…';
   try{
    const state=await globalThis.mlsFinanceSyncInspector?.read?.();
    if(state?.schema!=='mls_owner_finance_sync_diagnostic_v1')throw Error('DIAGNOSTIC_UNAVAILABLE');
    const date=value=>Number.isSafeInteger(value)&&value>0?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(value*1000)):'—';
    const count=value=>Number.isSafeInteger(value)?String(value):'—';
    const labels={BUSINESS_SYNC_SOURCE_AUTH_REQUIRED:'A fonte financeira retornou erro de autorização',BUSINESS_SYNC_SOURCE_PERMISSION_DENIED:'Permissão financeira rejeitada',BUSINESS_SYNC_SOURCE_TIMEOUT:'A leitura atingiu o prazo permitido',BUSINESS_SYNC_SOURCE_RATE_LIMIT:'Limite temporário de consultas na fonte',BUSINESS_SYNC_COLLECTION_UNAVAILABLE:'Coleta financeira indisponível',BUSINESS_SYNC_SOURCE_INVALID:'A resposta financeira não passou na validação'};
    diagnosticResult.textContent=[
     'Agendamento: '+(state.enabled?'Ativado':'Pausado')+' · Estado: '+state.status+' · Mês: '+(state.month||'—'),
     'Última tentativa: '+date(state.last_attempt_at)+' · Próxima execução: '+date(state.next_run_at),
     'Falhas seguidas: '+count(state.failure_count)+' · Último erro: '+(labels[state.last_error]||state.last_error||'Nenhum registrado'),
     'Coleta: '+(state.source_phase||'—')+(state.source_code?' ('+state.source_code+')':'')+' · Janelas: '+count(state.windows_complete)+'/'+count(state.windows_total)+' · Páginas: '+count(state.pages_read)
    ].join('\n');
   }catch(error){
    if(error?.status===401){
     diagnosticResult.textContent='A sessão de administrador não foi reconhecida nesta aba. Entre no MLS Commerce OS como administrador, sem abrir o diagnóstico em outro navegador.';
     if(diagnosticLogin)diagnosticLogin.hidden=false;
    }else{
     diagnosticResult.textContent='Não foi possível consultar o diagnóstico desta sessão. O resumo financeiro salvo permanece preservado. Reabra o painel pela conta administradora e tente novamente.';
    }
   }finally{inspect.disabled=false;}
  };
  const details=document.getElementById('commandPendingIncomeDetails');if(details)details.ontoggle=()=>{if(!details.open)return;let task;try{task=globalThis.brazaIncomeOverview?.observeDetail?.();}catch{}Promise.resolve(task).then(()=>{pendingDetailLoaded=true;lastKey='';render();}).catch(()=>{pendingDetailLoaded=true;lastKey='';render();});};
  if(typeof globalThis.MutationObserver==='function'){observer=new globalThis.MutationObserver(queue);for(const id of ['businessDay','businessMonth','savedCatalogList','costPeriodsMonthly','dtfQueue']){const target=document.getElementById(id);if(target)observer.observe(target,{subtree:true,childList:true,characterData:true,attributes:true});}}
  return true;
 }
 function stop(){try{observer?.disconnect?.();}catch{}observer=null;lastKey='';registry=null;pendingDetailLoaded=false;}
 globalThis.mlsAgentRegistry=Object.freeze({start,stop,refresh:render,notify:queue,getSnapshot:()=>registry??render()});
 start();
})();
`;
