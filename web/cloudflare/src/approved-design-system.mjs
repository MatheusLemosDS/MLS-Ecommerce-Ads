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
`;
