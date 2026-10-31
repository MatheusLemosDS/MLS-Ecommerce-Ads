import {MLS_AGENT_WORKSPACE_CSS} from './mls-agent-workspace-layout.mjs';

export const MLS_APPROVED_DESIGN_CSS=String.raw`

/* MLS Commerce OS — approved neon design, presentation only. */
/* Scroll targets clear the authenticated fixed topbar, including screenshots. */
main.workspace>section,main.workspace>#overview,.mission-workspace,.mission-hub,#commandCenter{scroll-margin-top:99px}
@media(max-width:850px){main.workspace>section,main.workspace>#overview,.mission-workspace,.mission-hub,#commandCenter{scroll-margin-top:82px}}

:root[data-theme=dark]{
 --app-bg:#030d1c;--canvas:#030d1c;--bg:#030d1c;
 --surface:#071523;--card:#071523;--surface-raised:#0c2035;
 --text:#edf6ff;--ink:#edf6ff;--muted:#9cb1ca;--line:#1b3a55;
 --accent:#5cb8ff;--blue:#5cb8ff;--on-accent:#06162c;--accent-hover:#81ceff;
 --accent-soft:#102d50;--positive:#44e8ac;--positive-soft:#0b382f;
 --negative:#ff758e;--negative-soft:#3f1c36;--warning:#ffbc6b;
 --warning-soft:#352616;--warning-line:#795635;--shadow:0 14px 35px rgba(1,6,21,.24);
 --mls-hermes:#51adff;--mls-finance:#25e4b0;--mls-ads:#b46cf4;--mls-products:#ffac5b;
 --mls-production:#2dd7ed;--mls-returns:#f65c91;--mls-auditor:#68b9d5;
 color-scheme:dark
}
:root[data-theme=light]{
 --mls-hermes:#2266b1;--mls-finance:#127a55;--mls-ads:#8240ba;--mls-products:#a66018;
 --mls-production:#087d91;--mls-returns:#b03459;--mls-auditor:#326e86
}
html[data-theme=dark] body{background:radial-gradient(ellipse at 60% -20%,rgba(23,65,134,.13),transparent 65%),var(--app-bg);color:var(--text)}
html[data-theme=dark] .app-shell .sidebar{
 background:linear-gradient(180deg,#030b19 0%,#020812 75%,#031220 100%);
 border-right:1px solid #1c4b82;box-shadow:inset -1px 0 rgba(41,111,190,.12)
}
html[data-theme=dark] .topbar{
 background:rgba(3,14,30,.96);border-bottom:1px solid #173651;
 backdrop-filter:blur(12px);box-shadow:0 5px 22px rgba(0,5,19,.16)
}
html[data-theme=dark] .sidebar .brand-mark,html[data-theme=dark] .topbar .brand-mark{
 background:linear-gradient(140deg,#2587ee,#5be5f5);color:#031129;
 box-shadow:0 6px 24px rgba(21,165,247,.25)
}
html[data-theme=dark] .workspace-nav .workspace-nav-link:hover,
html[data-theme=dark] .workspace-more .workspace-nav-link:hover{
 border-color:#27598f;background:#112b50;color:#f0f8ff
}
html[data-theme=dark] .workspace-nav .workspace-nav-link.active,
html[data-theme=dark] .workspace-more .workspace-nav-link.active{
 border:1px solid #247bd0;border-left:3px solid #55c3ff;
 background:linear-gradient(105deg,rgba(23,103,198,.32),rgba(9,39,86,.65));
 color:#f0faff;box-shadow:inset 0 0 24px rgba(30,115,223,.14)
}
html[data-theme=dark] .topbar .mission-search-trigger{
 background:#102442;border-color:#1e4270;color:#c8def4
}
html[data-theme=dark] .theme-button{background:#10233e;color:#edf6ff;border-color:#294567}
html[data-theme=dark] .workspace .card,html[data-theme=dark] .mission-module,
html[data-theme=dark] .source-card,html[data-theme=dark] .analysis-report{
 background:linear-gradient(142deg,rgba(41,99,186,.035),transparent 65%),var(--surface);
 border-color:var(--line);box-shadow:0 12px 35px rgba(0,7,25,.11)
}
html[data-theme=dark] .hero h1,html[data-theme=dark] .mission-hero h2{color:#f3f9ff}
html[data-theme=dark] .hero p,html[data-theme=dark] .mission-hero p{line-height:1.7}
html[data-theme=dark] input,html[data-theme=dark] select,html[data-theme=dark] textarea{
 border-color:#2c4c72;background:#0b213c;color:#eff9ff
}
html[data-theme=dark] input:focus,html[data-theme=dark] select:focus,
html[data-theme=dark] textarea:focus{border-color:var(--accent)}
html[data-theme=dark] .button-secondary{background:#132d4d;border:1px solid #2a4e78;color:#e8f6ff}
html[data-theme=dark] .badge{border:1px solid #2b4970;background:#142a46;color:#d9ecff}
html[data-theme=dark] .badge.guard{color:var(--positive);border-color:#1e6b57}
html[data-theme=dark] .help-box,html[data-theme=dark] .simulation,
html[data-theme=dark] .mission-empty{background:rgba(15,40,77,.82);border-color:#2b476c}
html[data-theme=dark] .mission-search-overlay{background:rgba(1,7,26,.82)}
html[data-theme=dark] .mission-search-dialog{border-color:#3465a1;background:#091a34;box-shadow:0 22px 80px rgba(0,3,14,.62)}
html[data-theme=dark] .mission-search-result:hover,
html[data-theme=dark] .mission-search-result[data-active=true]{background:#173b68;border-color:#4b97eb}
html[data-theme=dark] .mission-search-field{border-color:#4990df;background:#112a4c}
/* Canonical shell and overview geometry, measured against the six original
   references. Source-state controls remain available without becoming the hero. */
:root{--mls-sidebar-width:228px}
.app-shell{grid-template-columns:var(--mls-sidebar-width) minmax(0,1fr)}
.workspace{padding:24px}
.app-shell>.sidebar{padding:24px 14px 18px;gap:22px}
.sidebar .brand{font-size:15px;gap:10px;letter-spacing:-.25px}
.sidebar .brand-mark{width:38px;height:38px;border-radius:9px;flex:0 0 38px;font-size:16px}
.sidebar .brand small{font-size:8px;letter-spacing:.12em;margin-top:5px}
.sidebar-navigation .workspace-nav-link{min-height:45px;padding:9px 10px;border-radius:8px;font-size:12px}
.sidebar-navigation .workspace-nav-link small{display:none}
.mls-shell-topbar{gap:18px;min-height:72px;padding:12px 24px}
.mls-shell-topbar .mission-search-trigger{width:min(48vw,480px);min-width:175px;justify-content:space-between;gap:12px;min-height:44px;margin-right:auto}
.mls-shell-search-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:500}
.mls-shell-context{display:none}
.mls-shell-supervisor{display:flex;align-items:center;gap:9px;color:var(--mls-hermes,var(--accent));white-space:nowrap}
.mls-shell-supervisor strong{display:block;font-size:11px;color:var(--text)}
.mls-shell-supervisor small{display:block;font-size:9px;color:var(--muted);margin-top:3px}
.mls-shell-supervisor .mls-agent-avatar{width:36px;height:36px;flex-basis:36px}
.mls-shell-tools{display:flex;align-items:center;gap:11px}
.mls-shell-tools #connection{font-size:10px}
.mls-shell-tools #connection[data-status=pending]:before{background:var(--mls-warning,#e8b84e);box-shadow:none}
.mls-shell-topbar .mission-search-trigger:disabled,.mls-shell-topbar .theme-button:disabled{background:var(--surface-raised);border-color:var(--line);color:var(--muted);opacity:.7}
.mls-shell-store{display:flex;gap:10px;align-items:center;padding-top:18px;border-top:1px solid var(--line);font-size:11px;color:var(--text)}
.mls-shell-store small{display:block;margin-top:3px;font-size:10px;color:var(--muted)}
.mls-shell-store>span:first-child{display:grid;place-items:center;width:35px;height:35px;border-radius:10px;background:#ff673b;color:white;font-size:19px}
.mls-agent-avatar{display:block;flex:0 0 72px;width:72px;height:72px;color:var(--mission-accent,var(--mls-hermes,#51adff));filter:drop-shadow(0 0 8px currentColor)}
.mls-agent-avatar svg{display:block;width:100%;height:100%;overflow:visible}
.mission-dashboard{display:block}
.mission-dashboard .command-center-head.mission-command-hero{position:relative;isolation:isolate;overflow:visible;min-height:82px;height:auto;margin:0 0 12px;padding:0;border:0;border-radius:0;background:none;box-shadow:none;align-items:flex-start}
.mission-dashboard .command-center-head.mission-command-hero:before,.mission-dashboard .command-center-head.mission-command-hero:after{display:none}
.mission-dashboard .command-center-head .mission-overview-copy{max-width:76%;position:relative;z-index:1}
.mission-dashboard .command-center-head .mission-overview-copy h2{font-size:clamp(26px,2.1vw,33px);margin:0 0 5px;line-height:1.2;letter-spacing:-.65px;text-shadow:none}
.mission-dashboard .command-center-head .mission-overview-copy p{max-width:660px;font-size:12px;line-height:1.5}
.mls-command-globe{position:absolute;right:9%;top:-35px;width:330px;height:155px;overflow:hidden;z-index:-1;pointer-events:none;filter:drop-shadow(0 0 11px rgba(35,129,255,.45));opacity:.85}
.mls-command-globe:before{content:"";position:absolute;inset:16px 4% -30px 31%;border-radius:50%;background:radial-gradient(ellipse at 48% 42%,rgba(72,167,255,.22),rgba(30,108,255,.08) 47%,transparent 72%);filter:blur(8px)}
.mls-command-globe svg{position:relative;display:block;width:100%;height:auto}
.mls-overview-period{display:grid;grid-template-columns:18px minmax(0,1fr);column-gap:7px;row-gap:7px;align-items:center;position:relative;z-index:2;margin-left:auto;flex:0 0 auto;width:152px;max-width:100%;color:var(--muted)}
.mls-overview-period select,.mls-overview-period input{height:39px;min-height:39px;font-size:11px;padding:8px 11px;border-radius:7px;border:1px solid var(--line);background:var(--surface);color:var(--text);width:100%;min-width:0}
.mls-overview-period input{grid-column:1/-1}
.mls-overview-period>svg{width:16px;height:16px;display:block;flex:0 0 16px}
.mls-overview-period input[hidden]{display:none}
.mls-overview-source{position:relative;margin-top:8px;max-width:740px}
.mls-overview-source>summary{cursor:pointer;width:fit-content;min-height:24px;font-size:10px;color:var(--warning);line-height:1.4}
.mls-overview-source[open]{padding-bottom:5px}
.mls-overview-source .mission-source-state{margin-top:7px;padding:11px 12px}
:root[data-theme=light] .mission-dashboard .command-center-head.mission-command-hero{background:none;color:var(--text)}
:root[data-theme=light] .mission-dashboard .command-center-head .mission-overview-copy h2{color:var(--text)}
:root[data-theme=light] .mission-dashboard .command-center-head .mission-overview-copy p{color:var(--muted)}
:root[data-theme=light] .mls-command-globe{opacity:.35}
/* Six live KPI projections: accent colors convey metric identity, never profit certainty. */
.mission-dashboard .command-center-metrics{grid-template-columns:repeat(6,minmax(0,1fr));gap:11px}
.mission-dashboard .command-center-metrics .command-metric{
 --mls-kpi:#5cb8ff;--mls-kpi-rgb:92,184,255;
 position:relative;overflow:hidden;isolation:isolate;
 background:linear-gradient(156deg,rgba(var(--mls-kpi-rgb),.13),transparent 76%),var(--surface);
 border:1px solid rgba(var(--mls-kpi-rgb),.52);
 border-top:2px solid rgba(var(--mls-kpi-rgb),.94);
 display:flex;flex-direction:column;gap:3px;min-height:132px;min-width:0;border-radius:9px;box-shadow:inset 0 1px rgba(255,255,255,.045);padding:13px 12px
}
.mission-dashboard .command-metric:after{
 content:"";position:absolute;inset:auto 0 0;height:2px;
 background:linear-gradient(90deg,transparent,var(--mls-kpi),transparent);opacity:.8;pointer-events:none
}
.mission-dashboard .command-metric[data-mission-metric=net]{--mls-kpi:#35dda7;--mls-kpi-rgb:53,221,167}
.mission-dashboard .command-metric[data-mission-metric=sales]{--mls-kpi:#4eacff;--mls-kpi-rgb:78,172,255}
.mission-dashboard .command-metric[data-mission-metric=ads]{--mls-kpi:#e866c6;--mls-kpi-rgb:232,102,198}
.mission-dashboard .command-metric[data-mission-metric=margin]{--mls-kpi:#35dda7;--mls-kpi-rgb:53,221,167}
.mission-dashboard .command-metric[data-mission-metric=paid]{--mls-kpi:#579fff;--mls-kpi-rgb:87,159,255}
.mission-dashboard .command-metric[data-mission-metric=alerts]{--mls-kpi:#f2bb65;--mls-kpi-rgb:242,187,101}
.mission-dashboard .command-metric[data-mission-metric=roas]{--mls-kpi:#b780ff;--mls-kpi-rgb:183,128,255}
.mission-dashboard .command-metric .mission-roas-scope,.mission-dashboard .command-metric .mission-kpi-inline-period{display:block;min-height:12px;font-size:8px;line-height:1.4;color:var(--muted);font-weight:500}
.mission-dashboard .command-metric .mission-kpi-delta[data-metric=roas]{font-size:8px}
.mission-dashboard .command-metric .mission-kpi-delta[data-metric=roas][data-direction=UP]{color:#c2a2ff}
.mission-dashboard .command-metric .mission-kpi-delta[data-metric=roas][data-direction=DOWN]{color:#f9b37d}
:root[data-theme=light] .mission-dashboard .command-metric .mission-kpi-delta[data-metric=roas][data-direction=UP]{color:#6740a2}
:root[data-theme=light] .mission-dashboard .command-metric .mission-kpi-delta[data-metric=roas][data-direction=DOWN]{color:#88500c}
.mission-dashboard .command-metric:before{display:none}
.mission-dashboard .command-metric small{max-width:100%;min-height:16px;font-size:10px;line-height:1.3}
.mission-dashboard .command-metric strong{position:relative;z-index:1;letter-spacing:-.65px;font-size:clamp(20px,1.8vw,26px);line-height:1.1;margin:0 0 3px;overflow-wrap:anywhere}
.mission-dashboard .command-metric .mission-profit-state{font-size:9px;line-height:1.2;min-height:12px}
.mission-dashboard .command-metric .mission-kpi-delta{font-size:9px;line-height:1.2;min-height:14px;padding:0;margin-top:0}
.mission-dashboard .command-metric .mission-kpi-sparkline{min-height:27px;height:31px;overflow:hidden;margin-top:auto}
.mission-dashboard .command-metric .mission-kpi-sparkline p{font-size:8px;margin:0;line-height:1.3}
.mls-kpi-context{margin:0 0 12px;font-size:10px;color:var(--muted)}
.mls-kpi-context>summary{cursor:pointer;min-height:22px;width:fit-content}
.mls-kpi-context>div{display:grid;gap:5px;margin:8px 0}
.mls-kpi-context>p{max-width:90ch;font-size:11px;line-height:1.6}
html[data-theme=dark] .mission-dashboard .mission-kpi-sparkline{filter:drop-shadow(0 2px 4px rgba(var(--mls-kpi-rgb),.18))}
.mission-dashboard>.agent-panel{margin:0 0 18px}
.mission-dashboard .agent-grid{grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
.mission-dashboard .agent-card{min-height:222px;padding:12px;gap:5px;border-radius:9px;align-items:flex-start}
.mission-dashboard .agent-card:before{display:none}
.mission-dashboard .agent-card>.mls-agent-avatar{width:64px;height:64px;flex-basis:64px;margin:-4px 0 -5px -7px}
.mission-dashboard .agent-card-head{display:block}
.mission-dashboard .agent-card-head:before{display:none}
.mission-dashboard .agent-card h4{font-size:14px;line-height:1.35}
.mission-dashboard .agent-card .agent-status{font-size:8px;line-height:1.3;margin-top:4px;padding:3px 6px;white-space:normal}
.mission-dashboard .agent-card small{display:none}
.mission-dashboard .agent-card p{font-size:9.5px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:26px}
.mission-dashboard .agent-card .agent-card-metric{font-size:9px;line-height:1.3}
.mission-dashboard .agent-card .mission-card-link{font-size:10px;padding:6px 8px;min-height:32px;width:100%;margin-top:auto}
.mission-dashboard .agent-card .mission-card-link:after{content:"";display:block;width:6px;height:6px;border-top:1px solid currentColor;border-right:1px solid currentColor;transform:rotate(45deg);margin-right:3px}
.mls-observer-dot{width:6px;height:6px;border-radius:50%;background:var(--positive);margin-left:5px;box-shadow:0 0 7px rgba(37,228,176,.4)}
.mission-dashboard .command-center-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;align-items:start}
.mission-dashboard .command-center-grid>.hermes-command{grid-column:auto;grid-row:auto;max-height:none;align-self:start}
.mls-overview-performance{min-width:0}
.mls-overview-performance>h3{margin:0;padding:13px 14px 0;font-size:13px}
.mls-overview-performance{border:1px solid var(--line);border-radius:9px;background:var(--surface);overflow:hidden}
.mls-overview-performance .mission-trend-panel{margin:0;padding:10px 13px;border:0;box-shadow:none;background:none;border-radius:0}
.mls-overview-panels .hermes-command,.mls-overview-panels .mission-module{padding:13px 14px;border-radius:9px}
.mls-overview-panels .mission-module h3{font-size:13px}
.mls-overview-panels .hermes-command .eyebrow{font-size:8px}
.mls-overview-panels .hermes-command .hermes-command-head p{display:none}
.mls-overview-panels .hermes-command:before{display:none}
.mls-overview-panels .hermes-command h3{font-size:13px}
.mls-overview-panels .hermes-command-summary{margin:9px 0;font-size:10px;padding:9px}
.mls-overview-panels .hermes-command-summary strong{font-size:10px}
.mls-overview-panels .hermes-command-summary p{font-size:10px}
.mls-overview-priorities .command-priorities{max-height:235px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}
.mls-overview-source-note{font-size:11px;line-height:1.6;color:var(--muted)}
.mls-overview-detail{margin-top:18px;border:1px solid var(--line);border-radius:12px;padding:0 16px}
.mls-overview-detail>summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-size:12px;font-weight:700}
.mls-overview-detail .mission-day-intelligence{margin:0 0 16px}

/* Inspection follows existing observed marks; decoration never adds samples. */
.mission-trend-graph,[data-mission-specialist-chart]{position:relative}
.mls-verified-chart .mls-chart-series{filter:drop-shadow(0 0 3px rgba(77,161,255,.2))}
.mls-verified-chart .mls-chart-mark{cursor:crosshair;transition:filter .14s ease}
.mls-verified-chart .mls-chart-mark:focus-visible,
.mls-verified-chart .mls-chart-mark[data-mls-chart-selected=true]{outline:2px solid var(--accent,#5cb8ff);outline-offset:3px;filter:drop-shadow(0 0 4px rgba(102,185,255,.65))}
.mls-verified-chart .mls-chart-crosshair{fill:none;stroke:var(--muted,#9cb1ca);stroke-width:1;stroke-dasharray:3 4;pointer-events:none}
.mls-chart-readout{position:absolute;z-index:3;top:8px;right:8px;display:grid;gap:2px;max-width:min(270px,calc(100% - 16px));padding:9px 11px;border:1px solid var(--line,#1b3a55);border-radius:8px;background:var(--surface,#071523);box-shadow:0 8px 24px rgba(0,5,20,.26);color:var(--text,#edf6ff);line-height:1.4;pointer-events:none;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.mls-chart-readout[hidden],.mls-chart-crosshair[hidden]{display:none}
.mls-chart-readout-label{font-size:10px;color:var(--muted,#9cb1ca)}
.mls-chart-readout-value{font-size:13px;font-weight:750}
.mls-chart-readout-context{font-size:9px;color:var(--muted,#9cb1ca)}
:root[data-theme=light] .mls-chart-readout{box-shadow:0 8px 22px rgba(24,61,100,.12)}

/* Return cases are grouped by their saved cohort and status, never by cause. */
.mission-evidence-list[data-evidence-source^=RETURNS_INSIGHTS]{display:block}
.mls-returns-coverage,.mls-returns-evidence-note{margin:0 0 12px;font-size:11px;line-height:1.65;color:var(--muted);overflow-wrap:anywhere}
.mls-returns-cohorts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 14px}
.mls-returns-cohorts article{min-width:0;padding:12px;border:1px solid rgba(var(--mission-rgb),.28);border-radius:9px;background:var(--surface-raised)}
.mls-returns-cohorts small,.mls-returns-cohorts span{display:block;color:var(--muted);font-size:10px;line-height:1.55;overflow-wrap:anywhere}
.mls-returns-cohorts strong{display:block;margin:6px 0;font-size:15px;line-height:1.4;font-variant-numeric:tabular-nums}
.mls-returns-states{min-width:0;margin-bottom:13px;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.mls-returns-states table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:11px;line-height:1.55}
.mls-returns-states th,.mls-returns-states td{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid var(--line);overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.mls-returns-states th:first-child{width:43%}
.mls-returns-states th:nth-child(2){width:20%}
.mls-returns-states thead th{color:var(--muted);font-weight:600;background:var(--surface-raised)}
.mls-returns-states tbody th{font-weight:600}
.mls-returns-states tbody tr:last-child>*{border-bottom:0}
.mls-returns-states td small{display:block;margin-top:3px;font-size:9px;line-height:1.45;color:var(--muted)}

.mission-dashboard .hermes-command{
 border-color:rgba(115,91,238,.45);
 background:linear-gradient(140deg,rgba(100,71,243,.11),transparent 63%),var(--surface)
}
html[data-theme=dark] .mission-dashboard .agent-card{
 border-color:rgba(var(--mission-rgb,75,159,255),.5);
 background:linear-gradient(135deg,rgba(var(--mission-rgb,75,159,255),.17),transparent 85%),#09192e;
 box-shadow:inset 0 1px rgba(180,214,255,.045)
}
.mission-dashboard .agent-card[data-mission-accent=finance]{--mission-rgb:37,228,176;--agent-rgb:37,228,176;--mission-accent:var(--mls-finance);--agent-color:var(--mls-finance);color:var(--mls-finance)}
.mission-dashboard .agent-card[data-mission-accent=ads]{--mission-rgb:180,108,244;--agent-rgb:180,108,244;--mission-accent:var(--mls-ads);--agent-color:var(--mls-ads);color:var(--mls-ads)}
.mission-dashboard .agent-card[data-mission-accent=products]{--mission-rgb:255,172,91;--agent-rgb:255,172,91;--mission-accent:var(--mls-products);--agent-color:var(--mls-products);color:var(--mls-products)}
.mission-dashboard .agent-card[data-mission-accent=production]{--mission-rgb:45,215,237;--agent-rgb:45,215,237;--mission-accent:var(--mls-production);--agent-color:var(--mls-production);color:var(--mls-production)}
.mission-dashboard .agent-card[data-mission-accent=returns]{--mission-rgb:246,92,145;--agent-rgb:246,92,145;--mission-accent:var(--mls-returns);--agent-color:var(--mls-returns);color:var(--mls-returns)}
.mission-dashboard .agent-card[data-mission-accent=auditor]{--mission-rgb:104,185,213;--agent-rgb:104,185,213;--mission-accent:var(--mls-auditor);--agent-color:var(--mls-auditor);color:var(--mls-auditor)}
.mission-dashboard .agent-card[data-mission-accent=hermes]{--mission-rgb:81,173,255;--agent-rgb:81,173,255;--mission-accent:var(--mls-hermes);--agent-color:var(--mls-hermes);color:var(--mls-hermes)}
/* Specialized agent mini-sidebar: existing anchor navigation, no new data requests. */
.mission-workspace{
 display:grid;grid-template-columns:170px minmax(0,1fr);
 column-gap:19px;row-gap:15px;align-items:start
}
.mission-workspace>*:not(.mission-page-tabs){grid-column:2;min-width:0}
.mission-workspace>.mission-hero{grid-row:1}
.mission-workspace>.mission-page-tabs{
 grid-column:1;grid-row:1 / span 12;align-self:start;
 position:sticky;top:98px;display:flex;flex-direction:column;align-items:stretch;
 gap:6px;min-width:0;max-width:none;margin:0;padding:13px;
 border:1px solid var(--line);border-radius:15px;
 background:linear-gradient(145deg,rgba(var(--mission-rgb),.095),transparent 65%),var(--surface)
}
.mission-workspace>.mission-page-tabs a{
 min-height:42px;display:flex;align-items:center;justify-content:flex-start;
 padding:10px 11px;border:1px solid transparent;border-radius:10px;
 background:transparent;color:var(--muted);font-size:11px;font-weight:700;white-space:normal;line-height:1.4;text-decoration:none
}
.mission-workspace>.mission-page-tabs a:hover,
.mission-workspace>.mission-page-tabs a:focus-visible{
 border-color:rgba(var(--mission-rgb),.45);
 background:rgba(var(--mission-rgb),.14);color:var(--text)
}
.mission-workspace .mission-hero{
 border-color:rgba(var(--mission-rgb),.5);
 background:radial-gradient(ellipse at 82% -28%,rgba(var(--mission-rgb),.18),transparent 65%),var(--surface)
}
.mission-workspace .mission-stats .mission-stat{
 border-color:rgba(var(--mission-rgb),.37);border-top:2px solid rgba(var(--mission-rgb),.85);
 background:linear-gradient(148deg,rgba(var(--mission-rgb),.095),transparent 75%),var(--surface)
}
.mission-workspace .mission-module,.mission-workspace .mission-evidence-panel{border-color:rgba(var(--mission-rgb),.3)}
.mission-workspace .mission-action:hover{background:rgba(var(--mission-rgb),.1)}
.mission-workspace .mission-last{overflow-wrap:anywhere}
.mission-agent--finance{--mission-accent:var(--mls-finance)!important;--mission-rgb:37,228,176}
.mission-agent--ads{--mission-accent:var(--mls-ads)!important;--mission-rgb:180,108,244}
.mission-agent--products{--mission-accent:var(--mls-products)!important;--mission-rgb:255,172,91}
.mission-agent--production{--mission-accent:var(--mls-production)!important;--mission-rgb:45,215,237}
.mission-agent--returns{--mission-accent:var(--mls-returns)!important;--mission-rgb:246,92,145}
.mission-agent--auditor{--mission-accent:var(--mls-auditor)!important;--mission-rgb:104,185,213}
.mission-agent--hermes{--mission-accent:var(--mls-hermes)!important;--mission-rgb:81,173,255}
.mission-hub .mission-hub-card,.mls-products-hub .products-hub-card,
.dtf-workspace .dtf-flow-step{
 box-shadow:inset 0 1px rgba(255,255,255,.025),0 10px 23px rgba(0,9,25,.06);
 transition:border-color .17s,box-shadow .17s,transform .17s
}
html[data-theme=dark] .mls-roadmap .roadmap-hero,
html[data-theme=dark] .mls-products-hub .products-hub-hero,
html[data-theme=dark] .dtf-workspace .dtf-hero,
html[data-theme=dark] .mission-hub .mission-hub-hero{
 box-shadow:0 9px 36px rgba(0,7,29,.2);border-color:#284c7a
}
html[data-theme=dark] .mls-products-hub .products-hub-card,
html[data-theme=dark] .dtf-workspace .dtf-flow-step{
 background:linear-gradient(145deg,rgba(80,122,214,.065),transparent 75%),var(--surface)
}
/* Ads routes. Only values sourced from the validated Ads projection are displayed. */
.ads-workspace{--mls-page-accent:var(--mls-ads);--mls-page-rgb:255,164,78;max-width:1480px;min-width:0}
.ads-workspace .ads-workspace-head{
 padding:clamp(21px,2.7vw,33px);border:1px solid rgba(var(--mls-page-rgb),.36);
 border-radius:19px;gap:14px;
 background:radial-gradient(ellipse at 75% -30%,rgba(var(--mls-page-rgb),.13),transparent 60%),var(--surface)
}
.ads-workspace .ads-workspace-head h2{font-size:clamp(23px,2vw,29px)}
.ads-workspace .ads-workspace-eyebrow{color:var(--mls-page-accent)}
.ads-workspace .ads-workspace-metrics{gap:12px}
.ads-workspace .ads-workspace-metric{
 border-color:rgba(var(--mls-page-rgb),.38);border-top:2px solid var(--mls-page-accent);
 background:linear-gradient(150deg,rgba(var(--mls-page-rgb),.095),transparent 72%),var(--surface)
}
.ads-workspace .ads-workspace-metric[data-ads-metric=sales]{--mls-page-accent:var(--mls-products);--mls-page-rgb:84,170,255}
.ads-workspace .ads-workspace-metric[data-ads-metric=roas]{--mls-page-accent:var(--mls-production);--mls-page-rgb:180,137,255}
.ads-workspace .ads-workspace-metric[data-ads-metric=orders]{--mls-page-accent:var(--mls-finance);--mls-page-rgb:55,218,161}
.ads-workspace .ads-workspace-tabs a[aria-current=page],
.ads-workspace .ads-workspace-shortcuts a[aria-current]{border-color:rgba(var(--mls-page-rgb),.48);background:rgba(var(--mls-page-rgb),.13);color:var(--text)}
.ads-workspace .ads-workspace-details,.ads-workspace .ads-workspace-finance{background:var(--surface);border-color:var(--line)}
.ads-workspace .ads-workspace-route-note{border-left-color:var(--mls-page-accent);border-radius:7px;background:var(--surface-raised)}
.ads-workspace[data-ads-route=automation]{--mls-page-accent:var(--mls-production);--mls-page-rgb:180,137,255}
.ads-workspace[data-ads-route=settings]{--mls-page-accent:var(--mls-auditor);--mls-page-rgb:55,215,234}
#hermes .section-heading{
 padding:25px 27px;border:1px solid rgba(125,162,255,.38);border-radius:18px;
 background:radial-gradient(ellipse at 88% -10%,rgba(125,162,255,.15),transparent 56%),var(--surface)
}
#hermes .stat-card,#hermes .source-card{border-top:2px solid rgba(125,162,255,.55)}
.automation-workspace{
 border:1px solid rgba(142,114,232,.38);border-radius:16px;
 padding:16px 20px;background:linear-gradient(140deg,rgba(131,99,229,.09),transparent 78%),var(--surface)
}
.automation-workspace[open]{padding-bottom:22px}
.automation-workspace .automation-metric{
 border-top:2px solid var(--mls-production);border-color:rgba(178,136,255,.3);
 background:linear-gradient(145deg,rgba(178,136,255,.08),transparent 70%),var(--surface-raised)
}
#history .card,#margins .card{border-top:2px solid rgba(89,169,255,.36)}
#history .observation-detail,#margins .cost-component,#hermes .decision-card{background:var(--surface-raised);border-color:var(--line)}
#history .report-metric,#margins .report-metric{border-top:2px solid rgba(86,172,255,.45)}
#products .saved-catalog-product,#products .saved-catalog-variant{
 border-color:var(--line);background:var(--surface-raised);border-radius:12px
}
.app-shell,.main-wrap,.workspace,.mission-workspace,.ads-workspace{min-width:0}
.workspace input,.workspace button,.workspace select,.workspace textarea,
.ads-workspace input,.ads-workspace button{max-width:100%}
.mission-workspace .mission-panels,.mission-workspace .mission-stats,
.mission-dashboard .command-center-metrics{min-width:0}
.mission-workspace .mission-panels >*,.mission-workspace .mission-stats >*,
.ads-workspace .ads-workspace-metrics >*{min-width:0}
html[data-theme=dark] :focus-visible{outline-color:#75c8ff}
@media(max-width:1200px){
 :root{--mls-sidebar-width:204px}
 .mission-dashboard .command-center-metrics,.mission-dashboard .agent-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
 .mission-dashboard .command-center-grid{grid-template-columns:minmax(0,1fr)}
 .mission-workspace{grid-template-columns:145px minmax(0,1fr);gap:13px}
 .mission-workspace>.mission-page-tabs{padding:10px}
}
@media(max-width:850px){
 .workspace{padding:20px 16px}
 .mls-shell-context{display:flex;min-width:0;overflow:hidden}
 .mls-shell-topbar{min-height:67px;padding:10px 16px;gap:9px}
 .mls-shell-topbar .mission-search-trigger{flex:0 0 44px;width:44px;min-width:44px;height:44px;min-height:44px;padding:0;margin:0;justify-content:center}
 .mls-shell-topbar .theme-button{width:44px;min-width:44px;height:44px;min-height:44px}
 .mls-shell-topbar .workspace-header-menu .workspace-more>summary{min-height:44px}
 .mls-shell-search-label,.mls-shell-supervisor,.mls-shell-tools #connection{display:none}
 .mission-workspace{display:block}
 .mission-workspace>*:not(.mission-page-tabs){grid-column:auto}
 .mission-workspace>.mission-page-tabs{
  position:static;display:flex;flex-direction:row;gap:7px;overflow-x:auto;max-width:100%;
  margin:0 0 14px;padding:7px;border-radius:12px
 }
 .mission-workspace>.mission-page-tabs a{flex:0 0 auto;min-height:40px;white-space:nowrap}
 html[data-theme=dark] .workspace-nav-mobile{background:#07172f;border-top:1px solid #2a5887}
 html[data-theme=dark] .workspace-nav-mobile .workspace-nav-link.active{border:0;background:#163965}
}
@media(max-width:640px){
 .mls-returns-cohorts{grid-template-columns:minmax(0,1fr);gap:8px}
 .mls-returns-states th,.mls-returns-states td{padding:8px 6px;font-size:10px}
 .mission-dashboard .command-center-metrics,.mission-dashboard .agent-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
 .mission-dashboard .command-center-head .mission-overview-copy{max-width:100%}
 .mission-dashboard .command-center-head.mission-command-hero{padding:0;min-height:82px}
 .mls-overview-period{max-width:100%;justify-content:flex-start;margin:8px 0 0}
 .mission-dashboard .command-center-head.mission-command-hero{flex-wrap:wrap}
 .mls-command-globe{width:210px;right:0;top:-5px;opacity:.28}
 .mission-dashboard .command-center-head .mission-overview-copy p{font-size:11px}
 .mls-overview-source{max-width:100%}
 .mls-overview-period select,.mls-overview-period input{min-height:44px;height:44px}
 .mission-dashboard .command-metric .mission-kpi-delta[data-direction=UNAVAILABLE]{display:none}
 .mission-dashboard .agent-card{min-height:220px}
 .mission-dashboard .command-metric{padding:14px 12px}
 .mission-dashboard .command-metric strong{font-size:clamp(17px,5vw,25px)}
 .mission-dashboard .command-center-grid,.mission-workspace .mission-panels{grid-template-columns:minmax(0,1fr)}
 .mission-hub .mission-hub-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
 .ads-workspace .ads-workspace-head{padding:18px 16px}
 .ads-workspace .ads-workspace-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
 .ads-workspace .ads-workspace-metric{padding:15px 12px}
 .ads-workspace .ads-workspace-metric strong{font-size:clamp(18px,5vw,25px)}
 .automation-workspace{padding:13px}
 #hermes .section-heading{padding:20px 16px}
}
@media(max-width:390px){
 .mission-dashboard .command-metric strong{font-size:18px}
 .mission-dashboard .agent-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
 .mission-workspace .mission-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
 .mission-workspace .mission-stat{padding:13px}
}
@media(prefers-reduced-motion:reduce){
 .mission-hub .mission-hub-card,.mls-products-hub .products-hub-card,
 .dtf-workspace .dtf-flow-step,.topbar .mission-search-trigger,
 .mls-verified-chart .mls-chart-mark{transition:none!important;transform:none!important}
}
`+MLS_AGENT_WORKSPACE_CSS;
