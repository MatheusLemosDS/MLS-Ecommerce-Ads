/**
 * Specialist presentation mapped to MLS_COMMERCE_OS_LAYOUT.html (135002e7…).
 * Only CSS: the existing sources, values, controls and evidence stay in place.
 */
export const MLS_REFERENCE_PANEL_CSS=String.raw`
/* The reference uses a quiet, lightly tinted surface for each specialist. */
.mission-workspace[data-mission-page]{--panel-tone:var(--mission-accent);min-width:0}
.mission-workspace[data-mission-page=finance]{--mission-accent:var(--mls-finance,#25e4b0);--mission-rgb:37,228,176}
.mission-workspace[data-mission-page=ads]{--mission-accent:var(--mls-ads,#b46cf4);--mission-rgb:180,108,244}
.mission-workspace[data-mission-page=products]{--mission-accent:var(--mls-products,#ffac5b);--mission-rgb:255,172,91}
.mission-workspace[data-mission-page=production]{--mission-accent:var(--mls-production,#2dd7ed);--mission-rgb:45,215,237}
.mission-workspace[data-mission-page=returns]{--mission-accent:var(--mls-returns,#f65c91);--mission-rgb:246,92,145}
.mission-workspace[data-mission-page=auditor]{--mission-accent:var(--mls-auditor,#68b9d5);--mission-rgb:104,185,213}
.mission-workspace[data-mission-page=hermes]{--mission-accent:var(--mls-hermes,#51adff);--mission-rgb:81,173,255}
html[data-theme=light] .mission-workspace[data-mission-page=finance]{--mission-rgb:18,122,85}
html[data-theme=light] .mission-workspace[data-mission-page=ads]{--mission-rgb:130,64,186}
html[data-theme=light] .mission-workspace[data-mission-page=products]{--mission-rgb:166,96,24}
html[data-theme=light] .mission-workspace[data-mission-page=production]{--mission-rgb:8,125,145}
html[data-theme=light] .mission-workspace[data-mission-page=returns]{--mission-rgb:176,52,89}
html[data-theme=light] .mission-workspace[data-mission-page=auditor]{--mission-rgb:50,110,134}
html[data-theme=light] .mission-workspace[data-mission-page=hermes]{--mission-rgb:34,102,177}

/* Reference .page-header: 98px, 64px symbol, 30px title and 14px copy. */
html[data-theme] .mission-workspace[data-mission-page]>.mission-hero{display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:20px;min-height:98px;margin:0 0 20px;padding:0;border:0;border-radius:0;background:none;box-shadow:none;isolation:isolate}
html[data-theme] .mission-workspace[data-mission-page]>.mission-hero:before,
html[data-theme] .mission-workspace[data-mission-page]>.mission-hero:after{display:none}
.mission-workspace[data-mission-page] .mission-hero-main{display:flex;align-items:center;gap:14px;min-width:0}
html[data-theme] .mission-workspace[data-mission-page] .mission-orb.mls-agent-avatar{box-sizing:border-box;width:64px;height:64px;flex:0 0 64px;padding:4px;border:1px solid color-mix(in srgb,var(--panel-tone) 25%,var(--line));border-radius:20px;background:radial-gradient(circle,color-mix(in srgb,var(--panel-tone) 24%,var(--surface)),var(--surface));color:var(--panel-tone);box-shadow:0 0 30px color-mix(in srgb,var(--panel-tone) 12%,transparent)}
.mission-workspace[data-mission-page] .mission-orb.mls-agent-avatar svg{display:block;width:100%;height:100%}
html[data-theme] .mission-workspace[data-mission-page] .mission-hero h2{font-size:30px;font-weight:720;line-height:1.2;letter-spacing:-.8px;margin:0;color:var(--text)}
html[data-theme] .mission-workspace[data-mission-page] .mission-hero-main p{font-size:14px;line-height:1.65;color:var(--muted);margin:7px 0 0;max-width:760px}
.mission-workspace[data-mission-page] .mission-crumb{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:0 0 7px;padding:0;font-size:10px;line-height:1.5;letter-spacing:1.3px;text-transform:uppercase;color:var(--panel-tone)}
.mission-workspace[data-mission-page] .mission-crumb :is(a,strong,span){color:inherit;font-size:inherit;font-weight:600}
.mission-workspace[data-mission-page] .mission-intro-status{display:flex;align-items:center;flex-wrap:wrap;justify-content:flex-end;gap:8px}
.mission-workspace[data-mission-page] .mission-breadcrumb-pill{font-size:11px;line-height:1.5}
.mission-workspace[data-mission-page] .mls-workspace-heading-actions{gap:9px;max-width:100%;min-width:0}
.mission-workspace[data-mission-page] .mls-workspace-primary{min-height:44px;padding:10px 14px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--text);font-size:13px;font-weight:550;line-height:1.5;white-space:normal;box-shadow:none}
.mission-workspace[data-mission-page] .mls-workspace-primary:hover{background:var(--surface-raised);border-color:var(--muted);filter:none}
.mission-workspace[data-mission-page] .mls-workspace-primary-action small{font-size:10px;line-height:1.5;max-width:190px}
.mission-workspace[data-mission-page] .mls-workspace-source-line{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 13px;padding:0;border:0}
.mission-workspace[data-mission-page] .mission-last{font-size:11px;line-height:1.6;color:var(--muted);margin:0}
.mission-workspace[data-mission-page] .mission-status{font-size:10px;line-height:1.5;font-weight:550;padding:4px 8px;border-radius:6px;box-shadow:none}

/* Reference .subnav is a single 50px contextual rail, not a second sidebar. */
html[data-theme] .mission-workspace[data-mission-page]>.mission-page-tabs{position:static;display:flex;flex-direction:row;align-items:center;flex-wrap:wrap;gap:3px;min-height:50px;margin:0 0 20px;padding:2px;border:1px solid var(--line);border-radius:9px;background:var(--surface);box-shadow:none}
html[data-theme] .mission-workspace[data-mission-page]>.mission-page-tabs a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 13px;border:1px solid transparent;border-radius:6px;color:var(--muted);font-size:12px;font-weight:500;line-height:1.35;white-space:normal;box-shadow:none}
html[data-theme] .mission-workspace[data-mission-page]>.mission-page-tabs a[aria-current]{color:var(--accent);background:var(--accent-soft);border-color:transparent;font-weight:600}
.mission-workspace[data-mission-page] .mls-module-nav-icon{display:none}

/* Reference metric-grid.four/three: 12px gaps, 17px inset, 27px values. */
html[data-theme] .mission-workspace[data-mission-page] .mission-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 20px;align-items:stretch}
html[data-theme] .mission-workspace[data-mission-page] .mission-stat{box-sizing:border-box;position:relative;display:flex;flex-direction:column;gap:6px;min-width:0;min-height:132px;height:auto;padding:17px;border:1px solid color-mix(in srgb,var(--panel-tone) 28%,var(--line));border-radius:12px;background:var(--surface);background-image:radial-gradient(ellipse at 0% 0%,color-mix(in srgb,var(--panel-tone) 9%,transparent),transparent 70%);box-shadow:0 5px 18px #00000013}
.mission-workspace[data-mission-page] .mission-stat:before{content:"";position:absolute;top:0;left:0;width:64%;height:1px;background:linear-gradient(to right,var(--panel-tone),transparent);opacity:.85}
.mission-workspace[data-mission-page] .mission-stat>small{display:block;min-height:18px;font-size:12px;line-height:1.5;font-weight:400;color:var(--muted)}
html[data-theme] .mission-workspace[data-mission-page] .mission-stat>strong{display:block;font-size:27px;font-weight:700;line-height:1.3;letter-spacing:-.7px;font-variant-numeric:tabular-nums;margin:0;color:var(--text);overflow-wrap:anywhere}
.mission-workspace[data-mission-page] .mission-stat>span{display:block;min-height:31px;font-size:11px;line-height:1.5;color:var(--muted)}
html[data-theme] .mission-workspace[data-mission-page] .mission-stat>.mls-stat-status{font-size:18px;line-height:1.5;letter-spacing:normal;overflow-wrap:normal;word-break:normal}

/* The source-derived graph keeps its equivalent table and its unavailable state. */
.mission-reference-supporting{min-width:0;margin:0 0 20px;padding:0;border:0;background:none;box-shadow:none}
html[data-theme] .mission-workspace[data-mission-page] .mls-workspace-chart-pair{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(280px,1fr);gap:18px;margin:0 0 22px;align-items:stretch}
html[data-theme] .mission-workspace[data-mission-page=production] .mls-workspace-chart-pair{grid-template-columns:repeat(2,minmax(0,1fr))}
html[data-theme] .mission-workspace[data-mission-page] :is(.mission-module,.mission-trend-panel,.mission-evidence-panel,.month-composition-panel,.month-card,.month-subsection,.incurred-production-panel,.production-weekly-card,.m3-chart-panel,.physical-returns-panel){min-width:0;border:1px solid color-mix(in srgb,var(--panel-tone) 14%,var(--line));border-radius:12px;background-color:var(--surface);background-image:linear-gradient(140deg,color-mix(in srgb,var(--panel-tone) 3%,var(--surface)),var(--surface) 65%);box-shadow:0 8px 26px #00000012}
html[data-theme] .mission-workspace[data-mission-page] .mls-workspace-chart-pair :is(.mission-module,.mission-trend-panel,.month-composition-panel){position:relative;padding:20px;min-height:0;margin:0;box-shadow:0 8px 26px #00000012}
.mission-workspace[data-mission-page] .month-composition-panel>header{margin:0 0 15px}
.mission-workspace[data-mission-page] .month-composition-panel>header h3{font-size:17px;font-weight:650;line-height:1.4;letter-spacing:-.35px;margin:0;color:var(--text)}
.mission-workspace[data-mission-page] .month-composition-panel>header p{font-size:12px;line-height:1.6;margin:4px 0 0;color:var(--muted)}
.mission-workspace[data-mission-page] .mls-workspace-chart-pair :is(.mission-module,.mission-trend-panel):before{content:"";position:absolute;left:20px;right:20px;top:0;width:auto;height:1px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--panel-tone) 65%,transparent),transparent);opacity:1}
.mission-workspace[data-mission-page] .mls-workspace-chart-pair .mission-module-head{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin:0 0 15px}
html[data-theme] .mission-workspace[data-mission-page] .mls-workspace-chart-pair :is(.mission-module-head h3,.mission-trend-heading h3){font-size:17px;font-weight:650;line-height:1.4;letter-spacing:-.35px;color:var(--text);margin:0}
.mission-workspace[data-mission-page] .mls-workspace-chart-pair :is(.mission-module-head small,.mission-trend-heading p){font-size:12px;line-height:1.6;color:var(--muted);margin:4px 0 0;text-align:left}
.mission-workspace[data-mission-page] .mls-workspace-chart-pair .mission-panel-eyebrow{font-size:10px;line-height:1.5;letter-spacing:.09em;color:var(--panel-tone)}
.mission-workspace[data-mission-page] .mls-workspace-chart-pair .mission-trend-graph{height:240px;border:0;border-radius:0;background:transparent}
.mission-workspace[data-mission-page] .mls-workspace-chart-pair .mission-trend-panel:has(.mission-trend-empty){height:auto;min-height:0}
.mission-workspace[data-mission-page] .mls-workspace-chart-pair .mission-trend-panel:has(.mission-trend-empty) .mission-trend-graph{height:240px}
.mission-workspace[data-mission-page] .mls-workspace-chart-pair .mls-verified-chart{max-width:100%;max-height:280px;height:auto}
.mission-workspace[data-mission-page] .mls-workspace-chart-pair .mission-empty{display:grid;place-items:center;min-height:220px;padding:20px;border:1px dashed var(--line);border-radius:8px;background:transparent;color:var(--muted);font-size:12px;line-height:1.65;text-align:center}
.mission-workspace[data-mission-page] .mls-workspace-chart-pair :is(.mission-footnote,.mission-trend-note){font-size:11px;line-height:1.6;color:var(--muted);margin:12px 0 0}
.mission-workspace[data-mission-page] .mls-workspace-chart-pair .mission-return{font-size:12px;min-height:44px;line-height:1.5;color:var(--accent);white-space:normal}
.mission-workspace[data-mission-page] .mission-trend-controls{gap:3px;padding:3px;border:1px solid var(--line);border-radius:8px;background:var(--surface);box-shadow:none}
.mission-workspace[data-mission-page] .mission-trend-controls button{min-height:44px;padding:6px 10px;border:0;border-radius:5px;background:none;color:var(--muted);font-size:11px;font-weight:500;box-shadow:none}
.mission-workspace[data-mission-page] .mission-trend-controls button[aria-pressed=true]{color:var(--accent);background:var(--accent-soft);font-weight:600;box-shadow:none}
.mission-workspace[data-mission-page] .mission-trend-window{font-size:11px;line-height:1.5;color:var(--muted)}
.mission-workspace[data-mission-page] .mission-trend-window select{font-size:12px;min-height:44px;border-radius:7px;background:var(--surface);border:1px solid var(--line)}

/* The real month, fabrication and product cards use the same reference rhythm. */
.mission-workspace[data-mission-page] :is(.month-metrics,.incurred-production-daily-cards,.m3-stats){gap:12px;margin-bottom:20px}
html[data-theme] .mission-workspace[data-mission-page] :is(.month-metric,.incurred-production-daily-cards>.incurred-production-panel,.m3-stats>div,.m3-stats>article){min-width:0;min-height:132px;padding:17px;border:1px solid color-mix(in srgb,var(--panel-tone) 28%,var(--line));border-radius:12px;background-color:var(--surface);background-image:radial-gradient(ellipse at 0% 0%,color-mix(in srgb,var(--panel-tone) 9%,transparent),transparent 70%);box-shadow:0 5px 18px #00000013}
.mission-workspace[data-mission-page] :is(.month-metric,.incurred-production-daily-cards>.incurred-production-panel,.m3-stats>div,.m3-stats>article)>:is(small,h4){font-size:12px;line-height:1.5;color:var(--muted);font-weight:400}
html[data-theme] .mission-workspace[data-mission-page] :is(.month-metric>strong,.incurred-production-daily-cards .incurred-production-amount,.m3-stats strong){font-size:27px!important;line-height:1.3!important;font-weight:700;letter-spacing:-.7px;margin:6px 0;color:var(--text);font-variant-numeric:tabular-nums}
.mission-workspace[data-mission-page] :is(.month-metric,.incurred-production-daily-cards>.incurred-production-panel,.m3-stats>div,.m3-stats>article)>:is(p,span){font-size:11px;line-height:1.5;color:var(--muted)}
.mission-workspace[data-mission-page] :is(.mission-operation-heading p,.month-heading p,.incurred-production-heading p,.m3-heading p,.physical-returns-heading p){font-size:14px;line-height:1.65;color:var(--muted)}
.mission-workspace[data-mission-page] :is(.mission-operation-heading h3,.month-heading h3,.incurred-production-heading h3,.m3-heading h3,.physical-returns-heading h3){font-size:17px;line-height:1.4;letter-spacing:-.35px}
.mission-workspace[data-mission-page] :is(.incurred-production-panel,.production-weekly-card,.m3-chart-panel,.physical-returns-panel){padding:20px}
.mission-workspace[data-mission-page] :is(.mission-workflow-footer,.incurred-production-columns,.m3-chart-grid,.physical-returns-columns){gap:18px}
.mission-workspace[data-mission-page] :is(.mission-workspace-history,.mission-metric-context,.mission-day-details,.mission-supporting){border:1px solid var(--line);border-radius:9px;background:var(--surface);padding:0 14px;margin:0 0 18px;box-shadow:none}
.mission-workspace[data-mission-page] :is(.mission-workspace-history,.mission-metric-context,.mission-day-details,.mission-supporting)>summary{min-height:44px;font-size:12px;line-height:1.6;color:var(--muted);padding:10px 0}
.mission-workspace[data-mission-page] :is(.mission-workspace-history,.mission-metric-context,.mission-day-details,.mission-supporting)[open]>summary{margin-bottom:15px;border-bottom:1px solid var(--line)}
.mission-workspace[data-mission-page] :is(th,td){padding:13px 14px;font-size:13px;line-height:1.5;vertical-align:top;border-bottom:1px solid var(--line)}
.mission-workspace[data-mission-page] thead th{font-size:11px;font-weight:600;text-transform:none;letter-spacing:normal;background:var(--surface-raised);color:var(--muted)}
.mission-workspace[data-mission-page] :is(.month-waterfall>div,.month-cost-summary>div){padding-block:13px;gap:16px;font-size:12px;line-height:1.5;border-bottom:1px solid var(--line)}
.mission-workspace[data-mission-page] :is(.mission-task,.mission-action){min-height:44px;padding:13px 0;font-size:12px;border-radius:0;border-bottom:1px solid var(--line);background:none;box-shadow:none}
.mission-workspace[data-mission-page] .mission-task strong{font-size:13px;font-weight:600}
.mission-workspace[data-mission-page] .mission-task p{font-size:12px;line-height:1.6;color:var(--muted)}
.mission-workspace[data-mission-page] .mission-return-workflow{padding:13px 15px;border:1px solid color-mix(in srgb,var(--panel-tone) 30%,var(--line));border-radius:9px;background:color-mix(in srgb,var(--panel-tone) 7%,var(--surface));font-size:12px;line-height:1.6;color:var(--muted)}
.mission-workspace[data-mission-page] :focus-visible{outline:3px solid var(--accent);outline-offset:4px}

/* Existing operation containers are composition wrappers, not extra cards.
   Keeping their IDs while dropping nested frames lets the real KPIs and
   graphs follow the same edge as the reference heading and contextual rail. */
html[data-theme] .mission-workspace[data-mission-page]>.mission-reference-supporting{margin:0 0 20px;padding:0;border:0;border-radius:0;background:none;box-shadow:none}
html[data-theme] .mission-workspace[data-mission-page=finance] .business-month{margin:0;padding:0;border:0;background:none}
html[data-theme] .mission-workspace[data-mission-page=finance]>.mission-finance-source{margin:0;padding:0;border:0;border-radius:0;background:none;box-shadow:none}
html[data-theme] .mission-workspace[data-mission-page=finance] .business-month>.month-card{margin:0;padding:0;border:0;border-radius:0;background:none;box-shadow:none}
.mission-workspace[data-mission-page=finance] .month-source-controls{margin:0 0 12px;padding:0 13px;border:1px solid var(--line);border-radius:9px;background:var(--surface)}
.mission-workspace[data-mission-page=finance] .month-source-controls>summary{display:flex;align-items:center;min-height:44px;font-size:12px;line-height:1.5;color:var(--muted);cursor:pointer}
.mission-workspace[data-mission-page=finance] .month-source-controls[open]{padding-bottom:13px}
.mission-workspace[data-mission-page=finance] .month-source-controls[open]>summary{margin-bottom:13px;border-bottom:1px solid var(--line)}
.mission-workspace[data-mission-page=finance] .month-collection-state{padding:9px 12px;font-size:11px;line-height:1.6;margin:8px 0 0}
.mission-workspace[data-mission-page=finance] .month-status{font-size:11px;line-height:1.6;margin:8px 0 12px}
html[data-theme] .mission-workspace[data-mission-page=finance] .month-metric{display:flex;flex-direction:column;gap:6px}
.mission-workspace[data-mission-page=finance] .month-metric>small{min-height:18px}
html[data-theme] .mission-workspace[data-mission-page=finance] .month-metric>strong{margin:0;line-height:1.3!important}
.mission-workspace[data-mission-page=finance] .month-metric>span{font-size:11px;line-height:1.5}
.mission-workspace[data-mission-page=finance] .month-net-margin{min-height:0}
.mission-workspace[data-mission-page=finance] .month-net-margin:empty{display:none}
html[data-theme] .mission-workspace[data-mission-page=products] .m3-workbench{margin:0 0 20px;padding:0;border:0;border-radius:0;background:none;box-shadow:none;--m3-accent:var(--panel-tone)}
.mission-workspace[data-mission-page=products] .m3-heading{margin:0 0 14px}
.mission-workspace[data-mission-page=products] .m3-heading h3{font-size:17px}
.mission-workspace[data-mission-page=products] .m3-heading .m3-eyebrow{font-size:10px;letter-spacing:.09em;font-weight:600}
.mission-workspace[data-mission-page=products] .m3-workbench>.m3-stats{margin-top:14px}
html[data-theme] .mission-workspace[data-mission-page=production] .incurred-production{margin:0 0 20px;border:0;border-radius:0;background:none;box-shadow:none}
.mission-workspace[data-mission-page=production] .incurred-production>details>summary{min-height:44px;padding:5px 0 12px;border:0}
.mission-workspace[data-mission-page=production] .incurred-production-heading strong{font-size:13px;line-height:1.5}
.mission-workspace[data-mission-page=production] .incurred-production-heading small{font-size:11px;line-height:1.5;margin-top:2px}
.mission-workspace[data-mission-page=production] .incurred-production-body{padding:0}
.mission-workspace[data-mission-page=production] .incurred-production-calendar{margin:0;padding:0;border:0;border-radius:0;background:none}
.mission-workspace[data-mission-page=production] .incurred-production-calendar>h3{font-size:17px;margin:0 0 6px}
.mission-workspace[data-mission-page=production] .incurred-production-controls{margin:12px 0 18px}
.mission-workspace[data-mission-page=production] .incurred-production-chart-wrap{margin:0 0 18px;padding:20px;border:1px solid color-mix(in srgb,var(--panel-tone) 14%,var(--line));border-radius:12px;background:linear-gradient(140deg,color-mix(in srgb,var(--panel-tone) 3%,var(--surface)),var(--surface) 65%)}
.mission-workspace[data-mission-page=production] :is(.mission-production-context,.production-workspace-context){margin:0 0 12px;padding:0 13px;border:1px solid var(--line);border-radius:9px;background:var(--surface);box-shadow:none}
.mission-workspace[data-mission-page=production] :is(.mission-production-context,.production-workspace-context)>summary{display:flex;align-items:center;min-height:44px;font-size:12px;line-height:1.5;color:var(--muted);cursor:pointer}
.mission-workspace[data-mission-page=production] :is(.mission-production-context,.production-workspace-context)[open]>summary{border-bottom:1px solid var(--line);margin-bottom:12px}
.mission-workspace[data-mission-page=production] .mission-production-context>.mission-operation-heading{margin:0 0 13px}

/* The same shared month controller is docked in the specialist header. */
html[data-theme] .mission-workspace[data-mission-page]>.mission-hero:has(>.mls-agent-period){display:grid;grid-template-columns:minmax(0,1fr) 326px auto;align-items:center;column-gap:18px;row-gap:10px;overflow:visible}
.mission-workspace[data-mission-page]>.mission-hero:has(>.mls-agent-period)>.mission-hero-main{grid-column:1;grid-row:1}
.mission-workspace[data-mission-page]>.mission-hero:has(>.mls-agent-period)>.mls-workspace-heading-actions{grid-column:3;grid-row:1}
.mission-workspace[data-mission-page]>.mission-hero>.mls-agent-period{grid-column:2;grid-row:1;position:relative;width:326px;max-width:100%;min-width:0;margin:0;padding:0;border:0;border-radius:0;background:none;box-shadow:none;text-align:left}
.mission-workspace[data-mission-page] .mls-agent-period-heading{display:none;margin:0 0 5px;gap:4px 10px}
.mission-workspace[data-mission-page] .mls-agent-period-heading strong{font-size:11px;font-weight:600;color:var(--muted)}
.mission-workspace[data-mission-page] .mls-agent-period-heading span{font-size:10px;line-height:1.5}
.mission-workspace[data-mission-page] .mls-agent-period-form{display:grid;grid-template-columns:44px minmax(0,1fr) 44px 44px;align-items:end;gap:5px}
.mission-workspace[data-mission-page] .mls-agent-period-field{grid-column:2;grid-row:1;order:2;max-width:none;min-width:0;gap:4px;font-size:11px;line-height:1.5;color:var(--muted)}
.mission-workspace[data-mission-page] .mls-agent-period-form input{height:44px;min-height:44px;margin:0;padding:8px 9px;border-radius:7px;border:1px solid var(--line);background:var(--surface);color:var(--text);font-size:12px;font-weight:400}
.mission-workspace[data-mission-page] .mls-agent-period-form button{min-height:44px;min-width:44px;padding:8px;border:1px solid var(--line);border-radius:7px;background:var(--surface);color:var(--muted);font-size:11px;font-weight:500;box-shadow:none}
.mission-workspace[data-mission-page] #mlsAgentPeriodPrevious{grid-column:1;grid-row:1;order:1}
.mission-workspace[data-mission-page] #mlsAgentPeriodNext{grid-column:3;grid-row:1;order:3}
.mission-workspace[data-mission-page] :is(#mlsAgentPeriodApply,#mlsAgentPeriodCurrent){order:4;flex:1}
.mission-workspace[data-mission-page] .mls-agent-period-help{grid-column:4;grid-row:1;position:relative;order:5;min-width:0;margin:0;padding:0;text-align:left;border:0;background:none}
.mission-workspace[data-mission-page] .mls-agent-period-help>summary{display:grid;place-items:center;width:44px;min-width:44px;height:44px;min-height:44px;padding:0;border:1px solid var(--line);border-radius:7px;background:var(--surface);font-size:0;line-height:1;color:var(--muted);cursor:pointer;list-style:none}
.mission-workspace[data-mission-page] .mls-agent-period-help>summary:before{content:'ⓘ';font-size:17px;line-height:1}
.mission-workspace[data-mission-page] .mls-agent-period-help>summary::-webkit-details-marker{display:none}
.mission-workspace[data-mission-page] .mls-agent-period-help[open]{position:absolute;top:calc(100% + 7px);right:0;z-index:40;width:326px;max-width:calc(100vw - 36px);padding:11px;border:1px solid var(--line);border-radius:8px;background:var(--surface);box-shadow:var(--shadow)}
.mission-workspace[data-mission-page] .mls-agent-period-help[open]>summary{position:absolute;right:0;top:-52px}
.mission-workspace[data-mission-page] .mls-agent-period-help :is(.mls-agent-period-scope,.mls-agent-period-status){font-size:11px;line-height:1.6;margin:8px 0 0}
.mission-workspace[data-mission-page] .mls-agent-period-help [data-error=true]{color:var(--warning)}
.mission-workspace[data-mission-page] .mls-agent-period-help :is(#mlsAgentPeriodApply,#mlsAgentPeriodCurrent){min-height:44px;padding:8px 11px;margin:8px 5px 0 0;border:1px solid var(--line);border-radius:7px;background:var(--surface-raised);color:var(--text);font-size:11px}

/* Dedicated Ads routes share the same specialist shell and metric treatment. */
.ads-workspace{--panel-tone:var(--mls-ads,#b46cf4);--mls-page-accent:var(--panel-tone)}
html[data-theme] .ads-workspace .ads-workspace-head{min-height:98px;padding:0;margin:0 0 20px;border:0;border-radius:0;background:none;box-shadow:none;align-items:center}
.ads-workspace .ads-workspace-eyebrow{font-size:10px;letter-spacing:1.3px;font-weight:600;color:var(--panel-tone)}
html[data-theme] .ads-workspace .ads-workspace-head h2{font-size:30px;font-weight:720;line-height:1.2;letter-spacing:-.8px;margin:7px 0}
.ads-workspace .ads-workspace-head p{font-size:14px;line-height:1.65}
.ads-workspace .ads-workspace-metrics{gap:12px;margin-bottom:20px}
html[data-theme] .ads-workspace .ads-workspace-metric{position:relative;min-height:132px;padding:17px;border:1px solid color-mix(in srgb,var(--panel-tone) 28%,var(--line));border-radius:12px;background-color:var(--surface);background-image:radial-gradient(ellipse at 0% 0%,color-mix(in srgb,var(--panel-tone) 9%,transparent),transparent 70%);box-shadow:0 5px 18px #00000013}
.ads-workspace .ads-workspace-metric>span{font-size:12px;line-height:1.5}
.ads-workspace .ads-workspace-metric strong{font-size:27px;font-weight:700;line-height:1.3;letter-spacing:-.7px;margin:6px 0;color:var(--text)}
.ads-workspace .ads-workspace-metric small{font-size:11px;line-height:1.5}
.ads-workspace :is(.ads-daily-chart,.ads-workspace-finance,.ads-workspace-details){padding:20px;border:1px solid color-mix(in srgb,var(--panel-tone) 14%,var(--line));border-radius:12px;background-color:var(--surface);background-image:linear-gradient(140deg,color-mix(in srgb,var(--panel-tone) 3%,var(--surface)),var(--surface) 65%);box-shadow:0 8px 26px #00000012}
.ads-workspace .ads-daily-charts{gap:18px;margin:20px 0 22px}
.ads-workspace :is(.ads-daily-chart h3,.ads-workspace-finance h3){font-size:17px;font-weight:650;letter-spacing:-.35px;line-height:1.4}
.ads-workspace :is(.ads-daily-chart p,.ads-workspace-finance p,.ads-workspace-summary-note){font-size:12px;line-height:1.6;color:var(--muted)}
.ads-workspace .ads-workspace-tabs{gap:3px;min-height:50px;padding:2px;border:1px solid var(--line);border-radius:9px;background:var(--surface)}
.ads-workspace .ads-workspace-tabs a{min-height:44px;padding:8px 13px;border:0;border-radius:6px;font-size:12px;font-weight:500}
.ads-workspace .ads-workspace-tabs a[aria-current]{color:var(--accent);background:var(--accent-soft);font-weight:600}
.ads-workspace :is(.ads-workspace-alert,.ads-workspace-route-note){font-size:12px;line-height:1.6;border-radius:9px;padding:13px 15px;background:color-mix(in srgb,var(--panel-tone) 7%,var(--surface));border-color:color-mix(in srgb,var(--panel-tone) 30%,var(--line));box-shadow:none}
html[data-theme=light] .mission-workspace[data-mission-page] :is(.mission-stat,.month-metric,.incurred-production-daily-cards>.incurred-production-panel,.m3-stats>div,.m3-stats>article),html[data-theme=light] .ads-workspace .ads-workspace-metric{box-shadow:0 4px 14px #192b4008}

@media(max-width:1180px){
 .mission-workspace[data-mission-page] .mls-workspace-chart-pair{grid-template-columns:minmax(0,1.5fr) minmax(270px,1fr)}
}
@media(min-width:851px) and (max-width:1180px){
 html[data-theme] .mission-workspace[data-mission-page]>.mission-hero:has(>.mls-agent-period){grid-template-columns:minmax(0,1fr) 326px}
 .mission-workspace[data-mission-page]>.mission-hero:has(>.mls-agent-period)>.mls-workspace-heading-actions{grid-column:1/-1;grid-row:2;justify-content:flex-end}
}
@media(min-width:851px) and (max-width:1280px){
 html[data-theme] .mission-workspace[data-mission-page] .mission-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:850px){
 html[data-theme] .mission-workspace[data-mission-page]>.mission-hero{align-items:flex-start;flex-wrap:wrap;gap:12px;min-height:0;margin-bottom:20px}
 html[data-theme] .mission-workspace[data-mission-page]>.mission-hero:has(>.mls-agent-period){grid-template-columns:minmax(0,1fr);gap:12px}
 .mission-workspace[data-mission-page]>.mission-hero:has(>.mls-agent-period)>.mission-hero-main{grid-column:1;grid-row:1}
 .mission-workspace[data-mission-page]>.mission-hero:has(>.mls-agent-period)>.mls-agent-period{grid-column:1;grid-row:2;width:100%}
 .mission-workspace[data-mission-page]>.mission-hero:has(>.mls-agent-period)>.mls-workspace-heading-actions{grid-column:1;grid-row:3}
 html[data-theme] .mission-workspace[data-mission-page] .mission-hero h2{font-size:27px}
 html[data-theme] .mission-workspace[data-mission-page] .mission-orb.mls-agent-avatar{width:52px;height:52px;flex-basis:52px;border-radius:16px}
 .mission-workspace[data-mission-page] .mission-hero-main{gap:12px}
 .mission-workspace[data-mission-page] .mls-workspace-heading-actions{width:100%;flex-wrap:wrap;justify-content:space-between}
 .mission-workspace[data-mission-page] .mls-workspace-source-line{align-items:flex-start;flex-wrap:wrap;gap:8px}
 html[data-theme] .mission-workspace[data-mission-page]>.mission-page-tabs{flex-wrap:nowrap;overflow-x:auto;max-width:100%;overscroll-behavior-x:contain;scrollbar-width:thin}
 html[data-theme] .mission-workspace[data-mission-page]>.mission-page-tabs a{flex:0 0 auto;white-space:nowrap;font-size:12px}
 html[data-theme] .mission-workspace[data-mission-page] .mission-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
 html[data-theme] .mission-workspace[data-mission-page] .mission-stat{padding:14px;min-height:126px}
 html[data-theme] .mission-workspace[data-mission-page] .mission-stat>strong{font-size:25px}
 .mission-workspace[data-mission-page] .incurred-production-daily-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
 .mission-workspace[data-mission-page] .incurred-production-daily-cards>.incurred-production-panel:last-child{grid-column:1/-1}
 html[data-theme] .mission-workspace[data-mission-page] .mls-workspace-chart-pair{grid-template-columns:minmax(0,1fr);gap:15px}
 html[data-theme] .mission-workspace[data-mission-page] .mls-workspace-chart-pair :is(.mission-module,.mission-trend-panel,.month-composition-panel),.mission-workspace[data-mission-page] :is(.incurred-production-panel,.production-weekly-card,.m3-chart-panel,.physical-returns-panel){padding:17px}
 .mission-workspace[data-mission-page] :is(.mission-workflow-footer,.incurred-production-columns,.m3-chart-grid,.physical-returns-columns){grid-template-columns:minmax(0,1fr);gap:15px}
 .ads-workspace .ads-workspace-head{min-height:0}
 .ads-workspace .ads-workspace-head h2{font-size:27px}
 .ads-workspace .ads-workspace-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
 .ads-workspace :is(.ads-daily-chart,.ads-workspace-finance,.ads-workspace-details){padding:17px}
}
@media(max-width:640px){
 html[data-theme] .mission-workspace[data-mission-page] .mission-stat:has(.mls-stat-status){grid-column:1/-1}
}
@media(max-width:500px){
 html[data-theme] .mission-workspace[data-mission-page] .mission-hero h2{font-size:26px}
 html[data-theme] .mission-workspace[data-mission-page] .mission-orb.mls-agent-avatar{width:48px;height:48px;flex-basis:48px;border-radius:16px}
 html[data-theme] .mission-workspace[data-mission-page] .mission-stat{padding:13px 11px;min-height:126px}
 html[data-theme] .mission-workspace[data-mission-page] .mission-stat>strong{font-size:24px}
 .mission-workspace[data-mission-page] .mission-stat>small{min-height:31px}
 .mission-workspace[data-mission-page] .mission-stat>span{font-size:10px}
 .mission-workspace[data-mission-page] .mls-workspace-primary{flex:1;font-size:12px}
 html[data-theme] .mission-workspace[data-mission-page] .mls-workspace-chart-pair :is(.mission-module,.mission-trend-panel,.month-composition-panel),.mission-workspace[data-mission-page] :is(.incurred-production-panel,.production-weekly-card,.m3-chart-panel,.physical-returns-panel){padding:16px}
 .mission-workspace[data-mission-page] :is(.month-metric,.incurred-production-daily-cards>.incurred-production-panel,.m3-stats>div,.m3-stats>article){padding:14px}
 html[data-theme] .mission-workspace[data-mission-page] :is(.month-metric>strong,.incurred-production-daily-cards .incurred-production-amount,.m3-stats strong){font-size:24px!important}
 .ads-workspace .ads-workspace-head h2{font-size:26px}
 .ads-workspace .ads-workspace-metric{padding:14px}
 .ads-workspace .ads-workspace-metric strong{font-size:24px}
 .ads-workspace :is(.ads-daily-chart,.ads-workspace-finance,.ads-workspace-details){padding:16px}
}
@media(prefers-reduced-motion:reduce){.mission-workspace[data-mission-page] *, .ads-workspace *{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;
