// Native links and disclosure keep the legacy dashboard usable without scripts.
export function shellMobileNavigation(currentPath){
 const links=[['/dashboard','Painel de anúncios'],['/advertising','Anúncios'],['/campaigns','Campanhas'],['/gmv-max','GMV Max'],['/opportunities','Oportunidades'],['/performance','Desempenho'],['/optimization','Otimização'],['/integrations','Integrações']];
 return `<header class="shell-mobile-navigation mobile-toolbar"><a class="mobile-brand" href="/dashboard" aria-label="BrazaCommerce — painel de anúncios"><span class="mobile-brand-mark">B</span><span class="mobile-brand-name">BrazaCommerce</span></a><a class="mobile-admin" href="/admin">Administração</a><button class="mobile-theme theme-toggle" type="button" data-braza-theme-toggle aria-label="Alterar tema">Tema</button><details class="mobile-menu"><summary>Menu</summary><nav aria-label="Navegação do painel">${links.map(([href,label])=>`<a class="nav${currentPath===href?' active':''}" href="${href}"${currentPath===href?' aria-current="page"':''}>${label}</a>`).join('')}<a class="mobile-logout" href="/logout">Sair</a></nav></details></header>`;
}

export const SHELL_NAVIGATION_CSS=String.raw`
.mobile-toolbar{display:none}
@media(max-width:850px){
 .app{display:block;width:100%;min-width:0}
 .main{width:100%;min-width:0}
 .grid{grid-template-columns:minmax(0,1fr)}
 .cards,.mini-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
 .grid>*,.cards>*,.mini-grid>*,.panel{min-width:0}
 .table-wrap{width:100%;max-width:100%;min-width:0}
 .top,.panel-title-row,.detail-head{flex-wrap:wrap;gap:12px}
 .top>div:first-child{min-width:0;flex:1 1 180px}
 .panel-title-row>*,.detail-head>*{min-width:0;max-width:100%}
 .value,.note,.feature,.panel h2{overflow-wrap:anywhere}
 .mobile-toolbar{display:grid;grid-template-columns:minmax(36px,1fr) auto 44px 64px;align-items:center;gap:0 8px;position:sticky;top:0;z-index:50;width:100%;min-width:0;padding:10px 16px;background:var(--surface);color:var(--text);border-bottom:1px solid var(--line)}
 .mobile-toolbar a,.mobile-toolbar summary{-webkit-tap-highlight-color:transparent;touch-action:manipulation}
 .mobile-toolbar a:focus-visible,.mobile-toolbar summary:focus-visible,.mobile-toolbar button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
 .mobile-brand{display:flex;align-items:center;gap:9px;min-width:0;min-height:44px;color:var(--text);text-decoration:none;font-size:14px;font-weight:800;letter-spacing:-.3px}
 .mobile-brand-mark{display:grid;place-items:center;width:32px;height:32px;flex:0 0 32px;border-radius:10px;background:var(--accent);color:var(--on-accent,#fff);font-size:17px}
 .mobile-brand-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .mobile-admin{display:flex;align-items:center;justify-content:center;min-height:44px;min-width:0;padding:10px 12px;background:var(--accent-soft);border:1px solid var(--line);border-radius:11px;color:var(--accent);text-decoration:none;font-size:12px;font-weight:750}
 .mobile-theme{width:44px!important;height:44px!important;min-height:44px!important;min-width:0!important;padding:4px!important;overflow:hidden;text-indent:-9999px;position:relative;border:1px solid var(--line)!important;border-radius:11px!important;background:var(--surface)!important;color:var(--text)!important;font-size:11px!important}
 .mobile-theme::after{content:'◐';text-indent:0;position:absolute;inset:0;display:grid;place-items:center;font-size:23px;font-weight:400}
 .mobile-menu{grid-column:1/-1;min-width:0}
 .mobile-menu summary{position:absolute;top:10px;right:16px;display:flex;align-items:center;justify-content:center;gap:5px;width:64px;min-height:44px;padding:10px 6px;border:1px solid var(--line);border-radius:11px;background:var(--surface);list-style:none;font-size:12px;font-weight:750;cursor:pointer}
 .mobile-menu summary::-webkit-details-marker{display:none}
 .mobile-menu summary::after{content:'▾'}
 .mobile-menu[open] summary::after{content:'▴'}
 .mobile-menu nav{width:100%;max-width:100%;max-height:55vh;max-height:55dvh;overflow-y:auto;overscroll-behavior:contain;margin-top:10px;padding:10px 0 0;background:var(--surface);border-top:1px solid var(--line)}
 .mobile-menu .nav,.mobile-logout{display:flex;align-items:center;min-height:44px;margin:3px 0;padding:11px 14px;color:var(--muted);text-decoration:none;font-size:14px;border-radius:10px}
 .mobile-menu .nav.active{color:var(--accent);background:var(--accent-soft);font-weight:750}
 .mobile-logout{margin-top:8px;border-top:1px solid var(--line);border-radius:0}
 .mobile-logout:hover{color:var(--text);background:var(--surface-raised)}
}
@media(max-width:550px){.cards,.mini-grid{grid-template-columns:minmax(0,1fr)}.mobile-brand-name{display:none}}
`;
