export const MLS_APPROVED_DESIGN_CSS=String.raw`

/* MLS Commerce OS — approved neon design, presentation only. */
/* Scroll targets clear the authenticated fixed topbar, including screenshots. */
main.workspace>section,main.workspace>#overview,.mission-workspace,.mission-hub,#commandCenter{scroll-margin-top:99px}
@media(max-width:850px){main.workspace>section,main.workspace>#overview,.mission-workspace,.mission-hub,#commandCenter{scroll-margin-top:82px}}

:root[data-theme=dark]{
 --app-bg:#040d21;--canvas:#040d21;--bg:#040d21;
 --surface:#09182f;--card:#09182f;--surface-raised:#102442;
 --text:#eef6ff;--ink:#eef6ff;--muted:#a3b9d5;--line:#204061;
 --accent:#5cb8ff;--blue:#5cb8ff;--on-accent:#06162c;--accent-hover:#81ceff;
 --accent-soft:#102d50;--positive:#44e8ac;--positive-soft:#0b382f;
 --negative:#ff758e;--negative-soft:#3f1c36;--warning:#ffbc6b;
 --warning-soft:#352616;--warning-line:#795635;--shadow:0 14px 35px rgba(1,6,21,.24);
 --mls-finance:#3be8a7;--mls-ads:#ffae4f;--mls-products:#58a9ff;
 --mls-production:#b38aff;--mls-returns:#ff678b;--mls-auditor:#37d7ea;
 color-scheme:dark
}
:root[data-theme=light]{
 --mls-finance:#127a55;--mls-ads:#a45b16;--mls-products:#185cbd;
 --mls-production:#7345b4;--mls-returns:#b03459;--mls-auditor:#12839a
}
html[data-theme=dark] body{background:radial-gradient(ellipse at 60% -20%,rgba(23,65,134,.13),transparent 65%),var(--app-bg);color:var(--text)}
html[data-theme=dark] .app-shell .sidebar{
 background:linear-gradient(180deg,#05152e 0%,#051228 55%,#07172e 100%);
 border-right:1px solid #1c4b82;box-shadow:inset -1px 0 rgba(41,111,190,.12)
}
html[data-theme=dark] .topbar{
 background:rgba(6,19,44,.96);border-bottom:1px solid #1d4576;
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
 background:#102442;border-color:#1e4270;color:#c8def4;min-width:175px
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
/* Six live KPI projections: accent colors convey metric identity, never profit certainty. */
.mission-dashboard .command-center-metrics{grid-template-columns:repeat(6,minmax(0,1fr));gap:11px}
.mission-dashboard .command-metric{
 --mls-kpi:#5cb8ff;--mls-kpi-rgb:92,184,255;
 position:relative;overflow:hidden;isolation:isolate;
 background:linear-gradient(156deg,rgba(var(--mls-kpi-rgb),.13),transparent 76%),var(--surface);
 border:1px solid rgba(var(--mls-kpi-rgb),.52);
 border-top:2px solid rgba(var(--mls-kpi-rgb),.94);
 min-width:0;border-radius:15px;box-shadow:inset 0 1px rgba(255,255,255,.045),0 12px 26px rgba(0,6,25,.13);padding:17px 15px
}
.mission-dashboard .command-metric:after{
 content:"";position:absolute;inset:auto 0 0;height:2px;
 background:linear-gradient(90deg,transparent,var(--mls-kpi),transparent);opacity:.8;pointer-events:none
}
.mission-dashboard .command-metric[data-mission-metric=net]{--mls-kpi:#35dda7;--mls-kpi-rgb:53,221,167}
.mission-dashboard .command-metric[data-mission-metric=sales]{--mls-kpi:#4eacff;--mls-kpi-rgb:78,172,255}
.mission-dashboard .command-metric[data-mission-metric=ads]{--mls-kpi:#ff9847;--mls-kpi-rgb:255,152,71}
.mission-dashboard .command-metric[data-mission-metric=margin]{--mls-kpi:#be78fa;--mls-kpi-rgb:190,120,250}
.mission-dashboard .command-metric[data-mission-metric=paid]{--mls-kpi:#48d2e1;--mls-kpi-rgb:72,210,225}
.mission-dashboard .command-metric[data-mission-metric=alerts]{--mls-kpi:#f2bb65;--mls-kpi-rgb:242,187,101}
.mission-dashboard .command-metric strong{position:relative;z-index:1;letter-spacing:-.65px;overflow-wrap:anywhere}
html[data-theme=dark] .mission-dashboard .mission-kpi-sparkline{filter:drop-shadow(0 2px 4px rgba(var(--mls-kpi-rgb),.18))}
.mission-dashboard .command-center-grid{gap:14px}
.mission-dashboard .hermes-command{
 border-color:rgba(115,91,238,.45);
 background:linear-gradient(140deg,rgba(100,71,243,.11),transparent 63%),var(--surface)
}
html[data-theme=dark] .mission-dashboard .agent-card{
 border-color:rgba(var(--mission-rgb,75,159,255),.5);
 background:linear-gradient(135deg,rgba(var(--mission-rgb,75,159,255),.17),transparent 85%),#09192e;
 box-shadow:inset 0 1px rgba(180,214,255,.045)
}
html[data-theme=dark] .mission-dashboard .agent-card[data-mission-accent=finance]{--mission-rgb:55,223,163}
html[data-theme=dark] .mission-dashboard .agent-card[data-mission-accent=ads]{--mission-rgb:255,158,51}
html[data-theme=dark] .mission-dashboard .agent-card[data-mission-accent=products]{--mission-rgb:58,160,255}
html[data-theme=dark] .mission-dashboard .agent-card[data-mission-accent=production]{--mission-rgb:171,116,254}
html[data-theme=dark] .mission-dashboard .agent-card[data-mission-accent=returns]{--mission-rgb:255,89,124}
html[data-theme=dark] .mission-dashboard .agent-card[data-mission-accent=auditor]{--mission-rgb:45,208,229}
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
.mission-agent--finance{--mission-accent:var(--mls-finance)!important;--mission-rgb:55,218,161}
.mission-agent--ads{--mission-accent:var(--mls-ads)!important;--mission-rgb:255,164,78}
.mission-agent--products{--mission-accent:var(--mls-products)!important;--mission-rgb:84,170,255}
.mission-agent--production{--mission-accent:var(--mls-production)!important;--mission-rgb:180,137,255}
.mission-agent--returns{--mission-accent:var(--mls-returns)!important;--mission-rgb:255,112,147}
.mission-agent--auditor{--mission-accent:var(--mls-auditor)!important;--mission-rgb:55,215,234}
.mission-agent--hermes{--mission-accent:#7fa2ff;--mission-rgb:125,162,255}
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
 .mission-dashboard .command-center-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}
 .mission-workspace{grid-template-columns:145px minmax(0,1fr);gap:13px}
 .mission-workspace>.mission-page-tabs{padding:10px}
}
@media(max-width:850px){
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
 .mission-dashboard .command-center-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
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
 .mission-workspace .mission-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
 .mission-workspace .mission-stat{padding:13px}
}
/* Readable KPI columns from the approved dashboard: 4 wide, 3 medium, 2 mobile. */
@media(min-width:1201px){.mission-dashboard .command-center-metrics{grid-template-columns:repeat(4,minmax(0,1fr))!important}}
@media(min-width:641px) and (max-width:1200px){.mission-dashboard .command-center-metrics{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
@media(max-width:640px){.mission-dashboard .command-center-metrics{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media(prefers-reduced-motion:reduce){
 .mission-hub .mission-hub-card,.mls-products-hub .products-hub-card,
 .dtf-workspace .dtf-flow-step,.topbar .mission-search-trigger{transition:none!important;transform:none!important}
}


/* MLS reference fidelity: compact cockpit and horizontal specialist navigation.
 * Layout only; existing states, reports and business contracts are unchanged. */
@media(min-width:901px){
 .app-shell{grid-template-columns:185px minmax(0,1fr)!important}
 .sidebar{padding:15px 11px!important;gap:20px!important}
 .sidebar .brand{font-size:13px;gap:7px}
 .sidebar .brand small{font-size:8px;letter-spacing:1px}
 .sidebar .brand-mark{width:36px;height:36px;border-radius:11px}
 .workspace-nav:not(.workspace-nav-mobile) .workspace-nav-link{padding:8px 10px!important;min-height:39px!important;font-size:12px;gap:9px}
 .workspace-nav:not(.workspace-nav-mobile) .workspace-nav-link small{display:none!important}
 .sidebar-foot p{font-size:9px;line-height:1.5;padding:5px}
 .topbar{min-height:56px!important;padding:7px 20px!important}
 .topbar .workspace-context>.brand-mark{display:none}
 .top-actions{gap:12px}
 .workspace{max-width:none!important;padding:16px 19px 45px!important}
 .mission-dashboard{display:flex!important;flex-direction:column!important;gap:12px!important;max-width:none!important}
 .mission-dashboard>.command-center-head{order:1!important;min-height:83px!important;padding:8px 10px!important;margin:0!important;border:0!important;background:transparent!important;box-shadow:none!important;display:block!important}
 .mission-dashboard>.command-center-head:before,.mission-dashboard>.command-center-head:after{display:none!important}
 .mission-dashboard .mission-command-orbit{width:170px!important;height:110px!important;opacity:.43!important;right:45px!important;top:-18px!important;pointer-events:none}
 .mission-dashboard .mission-overview-copy>.eyebrow{display:none}
 .mission-dashboard .command-center-head h2{font-size:27px!important;line-height:1.2!important;margin:0 0 4px!important}
 .mission-dashboard .command-center-head p{font-size:11px!important;max-width:710px;line-height:1.4!important}
 .mission-dashboard .mission-overview-cta{display:none!important}
 .mission-dashboard .command-center-head .command-center-mode{top:11px!important;right:8px!important}
 .mission-dashboard>.command-center-metrics{order:2!important;grid-template-columns:repeat(6,minmax(0,1fr))!important;display:grid!important;gap:9px!important;margin:0!important;width:100%!important}
 .mission-dashboard .command-metric{height:122px!important;min-height:0!important;display:flex!important;flex-direction:column!important;padding:10px!important;gap:4px!important;border-radius:11px!important}
 .mission-dashboard .command-metric>small:first-child{font-size:10px!important;line-height:1.25!important;min-height:0!important}
 .mission-dashboard .command-metric strong{font-size:19px!important;margin:0!important;line-height:1.2!important;min-height:24px!important}
 .mission-dashboard .command-metric .mission-profit-state,.mission-dashboard .command-metric .mission-kpi-delta{font-size:9px!important;line-height:1.25!important}
 .mission-dashboard .command-metric .mission-kpi-comparison-date,.mission-dashboard .command-metric>span:not(.mission-profit-state):not(.mission-kpi-delta){display:none!important}
 .mission-dashboard .command-metric:before{width:24px!important;height:24px!important;top:8px!important;right:8px!important;font-size:13px!important}
 .mission-dashboard .mission-kpi-sparkline{height:18px!important;margin-top:auto!important}
 .mission-dashboard>.command-center-grid{display:contents!important}
 .mission-dashboard>.command-center-grid>.agent-panel{order:3!important;grid-column:auto!important;grid-row:auto!important;align-self:stretch!important;margin:0!important;padding:0!important}
 .mission-dashboard .agent-panel-head{margin:0 0 9px!important;align-items:center}
 .mission-dashboard .agent-panel-head h3{font-size:19px!important;margin:0}
 .mission-dashboard .agent-panel-head p{font-size:10px}
 .mission-dashboard .agent-grid{display:grid!important;grid-template-columns:repeat(6,minmax(0,1fr))!important;gap:9px!important}
 .mission-dashboard .agent-card{display:flex!important;flex-direction:column!important;gap:6px!important;min-height:157px!important;padding:11px!important;border-radius:13px!important;box-shadow:inset 0 0 23px rgba(var(--agent-rgb,65,135,255),.12),0 8px 25px rgba(1,6,23,.25)}
 .mission-dashboard .agent-card:before{content:"◈"!important;position:relative!important;inset:auto!important;display:grid!important;place-items:center!important;width:38px!important;height:38px!important;min-height:38px!important;margin:0 0 1px!important;border-radius:12px!important;font-size:23px!important;color:var(--agent-accent,#6bbaff)!important;background:radial-gradient(circle at 31% 22%,rgba(var(--agent-rgb,65,135,255),.48),rgba(var(--agent-rgb,65,135,255),.06) 75%)!important;border:1px solid rgba(var(--agent-rgb,65,135,255),.55)!important;text-shadow:0 0 12px currentColor!important;box-shadow:0 0 20px rgba(var(--agent-rgb,65,135,255),.20)!important}
 .mission-dashboard .agent-card[data-mission-accent=finance]:before{content:"▣"!important}
 .mission-dashboard .agent-card[data-mission-accent=ads]:before{content:"◎"!important}
 .mission-dashboard .agent-card[data-mission-accent=products]:before{content:"⬡"!important}
 .mission-dashboard .agent-card[data-mission-accent=production]:before{content:"▤"!important}
 .mission-dashboard .agent-card[data-mission-accent=returns]:before{content:"↺"!important}
 .mission-dashboard .agent-card[data-mission-accent=auditor]:before{content:"◇"!important}
 .mission-dashboard .agent-card:after{display:none!important}
 .mission-dashboard .agent-card-head{display:block!important}
 .mission-dashboard .agent-card h4{font-size:12px!important;margin:0!important;line-height:1.25!important}
 .mission-dashboard .agent-card-head small{display:none!important}
 .mission-dashboard .agent-card .agent-status{max-width:100%;width:max-content;font-size:8px!important;padding:3px 7px!important;margin-top:5px!important;white-space:normal}
 .mission-dashboard .agent-card p{font-size:9px!important;line-height:1.35!important;display:-webkit-box!important;-webkit-line-clamp:2!important;-webkit-box-orient:vertical!important;overflow:hidden!important;margin:0!important}
 .mission-dashboard .agent-card .mission-card-link{font-size:9px!important;margin-top:auto!important;padding:4px 0 0!important}
 .mission-dashboard>.mission-trend-panel{order:4!important;grid-column:auto!important;margin:0!important}
 .mission-dashboard>.mission-day-intelligence{order:5!important;grid-column:auto!important;margin:0!important}
 .mission-dashboard>.command-center-grid>.hermes-command{order:6!important;grid-column:auto!important;grid-row:auto!important;align-self:stretch!important;max-height:none!important;min-height:0!important;display:grid!important;grid-template-columns:220px minmax(0,1fr) 220px!important;align-items:center!important;gap:12px!important;margin:0!important;padding:13px 16px!important}
 .mission-dashboard .hermes-command .command-priorities{max-height:110px!important}
 .mission-dashboard>.command-center-note{order:7!important;margin:0!important}
 .mission-workspace{display:flex!important;flex-direction:column!important;gap:12px!important;max-width:none!important;align-items:stretch!important}
 .mission-workspace>.mission-hero{order:1!important;min-height:103px!important;padding:14px 17px!important;margin:0!important;display:flex!important;align-items:center!important;gap:16px!important;border-radius:14px!important}
 .mission-workspace .mission-crumb{margin:0 0 7px!important;font-size:10px!important;gap:6px!important;display:flex!important;align-items:center!important}
 .mission-workspace .mission-hero-main{align-items:center!important;gap:12px!important}
 .mission-workspace .mission-orb{width:50px!important;height:50px!important;flex-basis:50px!important;border-radius:15px!important;font-size:25px!important}
 .mission-workspace .mission-hero h2{font-size:22px!important;margin:0 0 3px!important}
 .mission-workspace .mission-hero p{font-size:10px!important;line-height:1.35!important;margin:0!important}
 .mission-workspace .mission-hero p.mission-last{font-size:9px!important;margin:4px 0 0!important}
 .mission-workspace .mission-intro-status{flex-direction:row!important;flex-wrap:wrap!important;justify-content:flex-end!important;gap:8px!important}
 .mission-workspace>.mission-page-tabs{order:2!important;display:flex!important;position:static!important;flex-direction:row!important;flex-wrap:nowrap!important;align-items:center!important;gap:7px!important;margin:0!important;padding:7px 8px!important;min-width:0!important;max-width:none!important;width:100%!important;overflow-x:auto!important;white-space:nowrap!important;border:1px solid #27456e!important;border-radius:10px!important;background:#0a1933!important}
 .mission-workspace .mission-page-tabs-title{display:none!important}
 .mission-workspace .mission-page-tabs a{display:inline-flex!important;flex:0 0 auto!important;width:auto!important;min-height:27px!important;padding:6px 10px!important;border-radius:8px!important;font-size:10px!important;line-height:1.2!important}
 .mission-workspace>.mission-stats{order:3!important;display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important;margin:0!important;width:100%!important}
 .mission-workspace .mission-stat{min-height:93px!important;padding:12px 14px!important;margin:0!important;border-radius:12px!important}
 .mission-workspace .mission-stat small{font-size:10px!important;min-height:0!important}
 .mission-workspace .mission-stat strong{font-size:23px!important;margin:7px 0 3px!important}
 .mission-workspace .mission-stat span{font-size:10px!important}
 .mission-workspace>.mission-trend-panel{order:4!important;margin:0!important;padding:16px!important}
 .mission-workspace>.mission-evidence-panel{order:5!important;margin:0!important;padding:16px!important}
 .mission-workspace>.mission-panels{order:6!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important;margin:0!important}
 .mission-workspace>.mission-panels .mission-module{padding:14px!important;margin:0!important}
 .mission-workspace>.mission-finance-source{order:7!important}
}
@media(min-width:901px) and (max-width:1299px){
 .mission-dashboard .command-center-head .command-center-mode{display:none!important}
 .mission-dashboard .command-metric{padding:9px 8px!important}
 .mission-dashboard .command-metric strong{font-size:17px!important}
 .mission-dashboard .agent-card{padding:8px!important}
}
@media(min-width:701px) and (max-width:900px){
 .mission-dashboard .command-center-metrics,.mission-dashboard .agent-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}
 .mission-workspace>.mission-page-tabs{position:static!important;display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;overflow-x:auto!important}
}
@media(max-width:700px){
 .mission-dashboard .command-center-head h2{font-size:23px!important}
 .mission-dashboard .command-center-metrics,.mission-dashboard .agent-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
 .mission-workspace>.mission-page-tabs{position:static!important;display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;overflow-x:auto!important;width:100%!important}
 .mission-workspace .mission-page-tabs-title{display:none!important}
 .mission-workspace .mission-page-tabs a{flex:0 0 auto!important}
}



/* Fidelity review 2: breadcrumb single-line, proportionate avatar face. */
@media(min-width:901px){
 .sidebar .brand{font-size:12px!important;white-space:nowrap!important}
 .sidebar .brand small{white-space:normal!important}
 .mission-workspace .mission-crumb{display:flex!important;flex-direction:row!important;flex-wrap:wrap!important;align-items:center!important;justify-content:flex-start!important;gap:5px!important;margin:0 0 6px!important}
 .mission-workspace .mission-crumb>*{display:inline!important;flex:0 0 auto!important;line-height:1.3!important}
 .mission-workspace .mission-orb.mission-agent-avatar:before{display:block!important;inset:7px 6px 10px!important;border-radius:10px!important}
 .mission-workspace .mission-orb.mission-agent-avatar:after{display:block!important;top:17px!important;font-size:11px!important;letter-spacing:2px!important;line-height:1!important}
}

`;
