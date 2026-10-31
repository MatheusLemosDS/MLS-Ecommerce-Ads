/** Approved specialist composition. No provider data or business behavior. */
export const MLS_AGENT_WORKSPACE_CSS=String.raw`
/* Keep the application rail stable on every page. Each specialist has one
   contextual toolbar, with no second rail or repeated quicklink row. */
.mission-workspace.mls-agent-workspace{display:block;min-width:0}
.mission-workspace.mls-agent-workspace>*{min-width:0}
.mission-workspace.mls-agent-workspace>.mission-hero{
 display:flex;flex-direction:row;align-items:center;justify-content:space-between;
 min-height:100px;margin:0;padding:14px 0 12px;gap:20px;border:0;border-radius:0;
 background:linear-gradient(115deg,rgba(var(--mission-rgb),.075),transparent 76%);box-shadow:none
}
.mls-agent-workspace .mission-hero:before,.mls-agent-workspace .mission-hero:after{display:none}
.mls-agent-workspace .mission-hero-main{align-items:center;gap:16px;min-width:0}
.mls-agent-workspace .mission-orb.mls-agent-avatar{width:66px;height:66px;flex-basis:66px;flex-shrink:0;border-radius:50%;color:var(--mission-accent)}
.mission-workspace.mls-agent-workspace .mission-crumb{display:flex;flex-direction:row;align-items:center;justify-content:flex-start;flex-wrap:wrap;margin:0 0 6px;gap:6px;padding:0;font-size:10px}
.mission-workspace.mls-agent-workspace .mission-hero h2{font-size:clamp(27px,2.4vw,35px);margin:0 0 5px;letter-spacing:-.7px;color:var(--text)}
.mission-workspace.mls-agent-workspace .mission-hero-main p{font-size:11px;line-height:1.5;max-width:560px;color:var(--muted)}
.mls-workspace-heading-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-shrink:0}
.mls-workspace-period{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 13px;border:1px solid var(--line);border-radius:8px;color:var(--muted);font-size:11px;white-space:nowrap;background:var(--surface)}
.mls-workspace-period>span{font-size:18px;color:var(--mission-accent)}
.mls-workspace-primary{display:flex;align-items:center;justify-content:center;gap:12px;box-sizing:border-box;min-height:44px;padding:10px 17px;border:1px solid var(--mission-accent);border-radius:8px;background:var(--mission-accent);color:var(--on-accent,#06152c);font-size:12px;font-weight:750;text-decoration:none;white-space:nowrap}
.mls-workspace-primary:hover{filter:brightness(1.08);text-decoration:none}
.mls-workspace-primary[disabled]{opacity:.6;cursor:not-allowed;filter:none}
.mls-workspace-primary-action{display:grid;gap:5px;text-align:center}
.mls-workspace-primary-action small{font-size:9px;color:var(--muted);line-height:1.3;max-width:170px}
.mls-workspace-source-line{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:0 0 14px;padding:0 0 9px;border-bottom:1px solid var(--line)}
.mls-workspace-source-line .mission-last{margin:0;color:var(--muted);font-size:10px;line-height:1.5}
.mls-workspace-source-line .mission-status{font-size:10px;padding:5px 8px;flex-shrink:0}
.mission-workspace.mls-agent-workspace>.mission-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin:0 0 16px}
.mls-agent-workspace .mission-stat{min-height:126px;padding:15px 17px;border-radius:10px}
.mls-agent-workspace .mission-stat small{min-height:28px;font-size:11px;line-height:1.4}
.mls-agent-workspace .mission-stat strong{margin:8px 0 6px;font-size:clamp(22px,2.2vw,31px);letter-spacing:-.65px}
.mission-workspace.mls-agent-workspace .mission-stat .mls-stat-status{font-size:18px;line-height:1.35;letter-spacing:normal}
.mls-agent-workspace .mission-stat span{font-size:10px;line-height:1.45}
.mission-workspace.mls-agent-workspace>.mission-page-tabs{
 position:sticky;top:84px;z-index:10;display:flex;flex-direction:row;align-items:center;flex-wrap:wrap;
 width:auto;margin:0 0 15px;padding:5px;gap:4px;border:1px solid rgba(var(--mission-rgb),.3);
 border-radius:10px;background:var(--surface);max-width:none
}
.mission-workspace.mls-agent-workspace>.mission-page-tabs a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:9px 13px;font-size:11px;border-radius:7px;line-height:1.3;white-space:normal}
.mission-workspace.mls-agent-workspace>.mission-page-tabs a[aria-current]{border-color:var(--mission-accent);background:rgba(var(--mission-rgb),.16);color:var(--mission-accent)}
.mls-module-tabs .mls-module-nav-icon{display:none}
.mls-workspace-chart-pair{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:15px;align-items:stretch;margin:0 0 17px}
.mls-workspace-chart-pair>.mission-panels{display:contents}
.mls-workspace-chart-pair .mission-module,.mls-workspace-chart-pair .mission-trend-panel{box-sizing:border-box;min-width:0;min-height:315px;margin:0;padding:18px;border:1px solid rgba(var(--mission-rgb),.32);border-radius:11px;background:var(--surface);box-shadow:none;color:var(--text)}
.mls-workspace-chart-pair .mission-module{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto minmax(0,1fr) auto;gap:8px 12px;height:280px;min-height:280px}
.mls-workspace-chart-pair .mission-module-head{grid-column:1/-1;margin:0;align-items:flex-start;gap:9px}
.mls-workspace-chart-pair .mission-module-head h3{font-size:14px;line-height:1.4;margin:0}
.mls-workspace-chart-pair .mission-module-head small{color:var(--muted);font-size:9px;line-height:1.4;text-align:right}
.mls-workspace-chart-pair [data-mission-specialist-chart]{grid-column:1/-1;display:flex;flex-direction:column;justify-content:center;min-width:0;min-height:90px}
.mls-workspace-chart-pair .mission-empty{font-size:11px;line-height:1.65;padding:16px;border:1px dashed var(--line);border-radius:8px;background:transparent;color:var(--muted)}
.mls-workspace-chart-pair .mission-footnote{grid-column:1;align-self:center;margin:0;font-size:9px;line-height:1.45;color:var(--muted)}
.mls-workspace-chart-pair .mission-return{grid-column:2;align-self:center;min-height:44px;display:inline-flex;align-items:center;font-size:10px;color:var(--mission-accent);white-space:nowrap}
.mls-workspace-chart-pair .mission-module:has([data-chart-status=READY]){height:auto;min-height:315px}
.mls-workspace-chart-pair .mission-trend-heading{gap:8px;margin:0 0 10px}
.mls-workspace-chart-pair .mission-trend-heading h3{font-size:14px;line-height:1.4;margin:0 0 5px;color:var(--text)}
.mls-workspace-chart-pair .mission-trend-heading p{font-size:10px;color:var(--muted)}
.mls-workspace-chart-pair .mission-trend-heading .mission-panel-eyebrow{font-size:8px;letter-spacing:.09em}
.mls-workspace-chart-pair .mission-trend-tools{justify-content:flex-start;gap:6px}
.mls-workspace-chart-pair .mission-trend-controls button,.mls-workspace-chart-pair .mission-trend-window select{min-height:44px;font-size:10px}
.mls-workspace-chart-pair .mission-trend-note,.mls-workspace-chart-pair .mission-trend-values{font-size:10px;line-height:1.5;color:var(--muted)}
.mls-workspace-chart-pair .mission-trend-graph{height:170px}
.mls-workspace-chart-pair .mission-trend-empty{min-height:0;height:100%;box-sizing:border-box;padding:12px;font-size:11px}
.mls-workspace-chart-pair .mission-trend-panel:has(.mission-trend-empty) .mission-trend-graph{height:120px}
.mls-workspace-chart-pair .mission-trend-panel:has(.mission-trend-empty) .mission-trend-values{display:none}
.mls-workspace-chart-pair .mission-trend-panel:before{background:linear-gradient(90deg,var(--mission-accent),transparent);opacity:.55}
.mls-workspace-chart-pair .mls-verified-chart{display:block;width:100%;max-width:100%;height:auto;max-height:220px}
.mls-workspace-history{margin:0 0 18px;border:1px solid var(--line);border-radius:9px;padding:0 14px}
.mls-workspace-history>summary{display:flex;align-items:center;min-height:44px;cursor:pointer;font-size:11px;color:var(--muted)}
.workspace :is(details[id],.mission-tasks[id],.mission-module[id],[id^="business"],[id^="missionChart-"],[id^="dtf"]){scroll-margin-top:160px}
.mls-agent-workspace :focus-visible{outline:3px solid var(--mission-accent);outline-offset:3px}
@media(min-width:851px){
 .mls-workspace-chart-pair .mission-trend-panel:has(.mission-trend-empty){height:280px;min-height:280px}

}
@media(max-width:1120px) and (min-width:851px){
 .mission-workspace.mls-agent-workspace>.mission-hero{align-items:flex-start;flex-wrap:wrap;gap:10px}
 .mls-workspace-heading-actions{margin-left:auto}
 .mls-workspace-chart-pair{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
 .mls-agent-workspace .mission-stat{padding:13px 11px}
}
@media(max-width:850px){
 .mission-workspace.mls-agent-workspace{margin-bottom:26px}
 .mission-workspace.mls-agent-workspace>.mission-hero{display:flex;flex-direction:column;align-items:stretch;min-height:0;padding:10px 0 12px;gap:15px}
 .mls-agent-workspace .mission-hero-main{gap:12px}
 .mls-agent-workspace .mission-orb.mls-agent-avatar{width:54px;height:54px;flex-basis:54px}
 .mls-agent-workspace .mission-hero h2{font-size:25px}
 .mls-agent-workspace .mission-hero-main p{font-size:11px}
 .mls-workspace-heading-actions{justify-content:space-between;flex-shrink:1;gap:8px}
 .mls-workspace-period{font-size:10px;padding:0 10px;min-width:0}
 .mls-workspace-primary{font-size:11px;padding:9px 12px;min-width:0;white-space:normal}
 .mls-workspace-source-line{align-items:flex-start;gap:8px}
 .mls-workspace-source-line .mission-last{font-size:9px}
 .mls-workspace-source-line .mission-status{font-size:9px}
 .mission-workspace.mls-agent-workspace>.mission-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:0 0 12px}
 .mls-agent-workspace .mission-stat{padding:12px;min-height:120px}
 .mls-agent-workspace .mission-stat strong{font-size:24px}
 .mission-workspace.mls-agent-workspace>.mission-page-tabs{top:76px;flex-wrap:nowrap;overflow-x:auto;max-width:100%;padding:5px;gap:4px;overscroll-behavior-x:contain;scrollbar-width:thin}
 .mission-workspace.mls-agent-workspace>.mission-page-tabs a{flex:0 0 auto;white-space:nowrap;min-height:44px;padding:9px 11px;font-size:10px}
 .mls-workspace-chart-pair{grid-template-columns:minmax(0,1fr);gap:12px}
 .mls-workspace-chart-pair .mission-module,.mls-workspace-chart-pair .mission-trend-panel{height:auto;padding:15px;min-height:285px}
 .mls-workspace-history{padding:0 12px}
}
@media(max-width:420px){.mission-workspace.mls-agent-workspace .mission-stat .mls-stat-status{font-size:clamp(12px,3.5vw,15px);line-height:1.4;overflow-wrap:normal;word-break:normal}}
@media(prefers-reduced-motion:reduce){.mls-workspace-primary{transition:none}}
`;
