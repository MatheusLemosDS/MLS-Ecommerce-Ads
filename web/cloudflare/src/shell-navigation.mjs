// Native links and disclosure keep the legacy dashboard usable without scripts.
export function shellMobileNavigation(currentPath){
 const links=[['/dashboard','Painel de anúncios'],['/advertising','Anúncios'],['/campaigns','Campanhas'],['/gmv-max','GMV Max'],['/opportunities','Oportunidades'],['/performance','Desempenho'],['/optimization','Otimização'],['/integrations','Integrações']];
 return `<header class="shell-mobile-navigation mobile-toolbar"><a class="mobile-brand" href="/dashboard" aria-label="BrazaCommerce — painel de anúncios">BRAZA</a><a class="mobile-admin" href="/admin">Administração</a><details class="mobile-menu"><summary>Menu</summary><nav aria-label="Navegação do painel">${links.map(([href,label])=>`<a class="nav${currentPath===href?' active':''}" href="${href}"${currentPath===href?' aria-current="page"':''}>${label}</a>`).join('')}<a class="mobile-logout" href="/logout">Sair</a></nav></details></header>`;
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
 .mobile-toolbar{display:flow-root;position:sticky;top:0;z-index:50;width:100%;min-width:0;padding:10px 16px;background:#111827;color:#fff}
 .mobile-toolbar a,.mobile-toolbar summary{-webkit-tap-highlight-color:transparent;touch-action:manipulation}
 .mobile-toolbar a:focus-visible,.mobile-toolbar summary:focus-visible{outline:3px solid #93c5fd;outline-offset:3px}
 .mobile-brand{float:left;display:flex;align-items:center;min-height:44px;margin-right:12px;color:#fff;text-decoration:none;font-size:15px;font-weight:800;letter-spacing:.6px}
 .mobile-admin{float:left;display:flex;align-items:center;justify-content:center;min-height:44px;max-width:100%;margin-right:10px;padding:10px 12px;background:#ff5a1f;border-radius:8px;color:#fff;text-decoration:none;font-size:14px;font-weight:700;overflow-wrap:anywhere}
 .mobile-menu{position:static}
 .mobile-menu summary{float:right;display:flex;align-items:center;justify-content:center;gap:7px;min-height:44px;max-width:100%;padding:10px 12px;border:1px solid #4b5563;border-radius:8px;list-style:none;font-size:14px;font-weight:700;cursor:pointer}
 .mobile-menu summary::-webkit-details-marker{display:none}
 .mobile-menu summary::after{content:'▾'}
 .mobile-menu[open] summary::after{content:'▴'}
 .mobile-menu nav{clear:both;width:100%;max-width:100%;max-height:55vh;max-height:55dvh;overflow-y:auto;overscroll-behavior:contain;padding:8px;background:#111827;border-top:1px solid #4b5563}
 .mobile-menu .nav,.mobile-logout{display:flex;align-items:center;min-height:44px;margin:0;padding:11px 14px;color:#e2e8f0;text-decoration:none;font-size:14px;border-radius:8px}
 .mobile-menu .nav.active{color:#fff;background:#ff5a1f}
 .mobile-logout{margin-top:8px;border-top:1px solid #4b5563;border-radius:0}
 .mobile-logout:hover{color:#fff;background:#1f2937}
}
@media(max-width:550px){.cards,.mini-grid{grid-template-columns:minmax(0,1fr)}}
`;
