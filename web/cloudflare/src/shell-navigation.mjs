import {workspaceNavigation,workspaceSecondaryNavigation,WORKSPACE_NAVIGATION_CSS} from './workspace-navigation.mjs';

// Ads and store management share destinations; the review role stays in Ads.
export function shellDesktopNavigation(currentPath,{role='review'}={}){
 return workspaceNavigation(currentPath,{role});
}
export function shellMobileNavigation(currentPath,{role='review'}={}){
 const home=role==='owner'?'/admin?tab=overview':'/dashboard';
 return `<header class="shell-mobile-navigation mobile-toolbar"><a class="mobile-brand" href="${home}" aria-label="MLS Commerce OS — painel da loja"><span class="mobile-brand-mark">MLS</span><span class="mobile-brand-name">MLS Commerce OS</span></a><button class="mobile-theme theme-toggle" type="button" data-braza-theme-toggle aria-label="Alterar tema">Tema</button><div class="workspace-header-menu">${workspaceSecondaryNavigation(currentPath,{role})}</div></header>${workspaceNavigation(currentPath,{role,mobile:true})}`;
}

export const SHELL_NAVIGATION_CSS=WORKSPACE_NAVIGATION_CSS+String.raw`
.mobile-toolbar{display:none}.sidebar>.workspace-nav{margin-top:4px}.sidebar>.workspace-more{margin-top:18px}
@media(max-width:850px){
 .app{display:block;width:100%;min-width:0}.main{width:100%;min-width:0;padding-bottom:calc(100px + env(safe-area-inset-bottom))!important}.grid{grid-template-columns:minmax(0,1fr)}.cards,.mini-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.grid>*,.cards>*,.mini-grid>*,.panel{min-width:0}.table-wrap{width:100%;max-width:100%;min-width:0}
 .top,.panel-title-row,.detail-head{flex-wrap:wrap;gap:12px}.top>div:first-child{min-width:0;flex:1 1 180px}.panel-title-row>*,.detail-head>*{min-width:0;max-width:100%}.value,.note,.feature,.panel h2{overflow-wrap:anywhere}
 .mobile-toolbar{box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr) 40px auto;align-items:center;gap:10px;position:sticky;top:0;z-index:50;width:100%;min-width:0;min-height:64px;padding:10px 16px;background:var(--surface);color:var(--text);border-bottom:1px solid var(--line)}
 .mobile-toolbar a,.mobile-toolbar summary{-webkit-tap-highlight-color:transparent;touch-action:manipulation}.mobile-toolbar a:focus-visible,.mobile-toolbar summary:focus-visible,.mobile-toolbar button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
 .mobile-brand{display:flex;align-items:center;gap:9px;min-width:0;min-height:40px;color:var(--text);text-decoration:none;font-size:14px;font-weight:750;letter-spacing:-.3px}.mobile-brand-mark{display:grid;place-items:center;width:38px;height:32px;flex:0 0 38px;border-radius:10px;background:var(--accent);color:var(--on-accent,#fff);font-size:9px;letter-spacing:.35px}.mobile-brand-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .mobile-theme{width:40px!important;height:40px!important;min-height:40px!important;min-width:0!important;padding:4px!important;overflow:hidden;text-indent:-9999px;position:relative;border:1px solid var(--line)!important;border-radius:10px!important;background:var(--surface)!important;color:var(--text)!important;font-size:11px!important}.mobile-theme::after{content:'◐';text-indent:0;position:absolute;inset:0;display:grid;place-items:center;font-size:23px;font-weight:400}
}
@media(max-width:550px){.cards,.mini-grid{grid-template-columns:minmax(0,1fr)}}
@media(max-width:360px){.mobile-toolbar{padding:9px 12px;gap:7px}.mobile-brand-name{font-size:12px}}
`;
