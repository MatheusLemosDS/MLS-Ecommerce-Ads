// Fixed destinations shared by store management and the restricted Ads review.
const workspaceNavigationItems=Object.freeze({
 overview:{href:'/admin?tab=overview',label:'Visão geral',hint:'Vendas, custos e resultado',icon:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'},
 products:{href:'/admin?tab=products',label:'Produtos',hint:'Variações e custos por produto',icon:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 8v9l9 5 9-5V8M12 13v9"/>'},
 production:{href:'/admin?tab=production',label:'Produção',hint:'Pedidos, artes e montagem DTF',icon:'<path d="M6 8V3h12v5M6 17H4V8h16v9h-2M6 14h12v7H6zM16 11h1"/>'},
 ads:{href:'/dashboard',label:'Anúncios',hint:'Investimento, vendas e ROAS',icon:'<path d="M4 19V9m8 10V4m8 15v-7M2 21h20"/>'},
 margins:{href:'/admin?tab=margins',label:'Custos',hint:'Produção e regras de cálculo',icon:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 12h2m4 0h2M8 16h2m4 0h2"/>'},
 automation:{href:'/optimization',label:'Automação',hint:'Metas e oportunidades',icon:'<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Z"/>'},
 campaigns:{href:'/campaigns',label:'Campanhas',hint:'Product Ads e GMV Max',icon:'<path d="m3 10 16-6v16L3 14v-4Zm4 5 2 6h4l-2-5M22 8v8"/>'},
 hermes:{href:'/admin?tab=hermes',label:'MLS Hermes',hint:'Supervisor, análises e limites de uso',icon:'<path d="M8 3v3m8-3v3M3 10h18M5 6h14v15H5zM9 14h6m-6 4h4"/>'},
 integrations:{href:'/integrations',label:'Conexões',hint:'Integração com a Shopee',icon:'<path d="m8 8 3-3a4 4 0 0 1 6 6l-3 3M16 16l-3 3a4 4 0 0 1-6-6l3-3m-1 5 6-6"/>'},
 history:{href:'/admin?tab=history',label:'Histórico',hint:'Alterações e versões salvas',icon:'<path d="M3 11a9 9 0 1 1 2 7M3 5v6h6M12 7v5l3 2"/>'},
 roadmap:{href:'/admin?tab=roadmap',label:'Plano de evolução',hint:'Etapas e dados que faltam',icon:'<path d="M5 20V4h12l-2 4 2 4H5M3 20h4"/>'},
});
const workspaceOwnerPrimary=['overview','products','production','ads','margins','automation'];
const workspaceReviewPrimary=['ads','campaigns','automation'];
const workspaceOwnerSecondary=['campaigns','hermes','integrations','history','roadmap'];
const workspaceReviewSecondary=['integrations'];
function workspaceActiveKey(active){
 if(Object.hasOwn(workspaceNavigationItems,active))return active;
 const aliases={'/dashboard':'ads','/advertising':'ads','/performance':'ads','/campaigns':'campaigns','/gmv-max':'campaigns','/optimization':'automation','/opportunities':'automation','/integrations':'integrations','/admin':'overview'};
 if(Object.hasOwn(aliases,active))return aliases[active];
 if(typeof active==='string'&&active.startsWith('/admin?')){try{const value=new URL(active,'https://workspace.invalid').searchParams.get('tab');if(['overview','products','production','margins','hermes','history','roadmap'].includes(value))return value;}catch{}}
 return '';
}
function workspaceNavLink(key,current,{mobile=false}={}){
 const item=workspaceNavigationItems[key],selected=key===current,tab=item.href.startsWith('/admin?tab=')?key:null;
 return `<a class="workspace-nav-link${selected?' active':''}" href="${item.href}"${selected?' aria-current="page"':''} data-workspace-key="${key}"${tab?' data-tab="'+tab+'" data-workspace-tab="'+tab+'"':''}><span class="workspace-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${item.icon}</svg></span><span class="workspace-nav-copy"><span class="workspace-nav-label">${item.label}</span>${mobile?'':'<small>'+item.hint+'</small>'}</span></a>`;
}

export function workspaceSecondaryNavigation(active,{role='owner'}={}){
 const current=workspaceActiveKey(active),keys=role==='owner'?workspaceOwnerSecondary:workspaceReviewSecondary;
 return `<details class="workspace-more" data-active="${keys.includes(current)?'true':'false'}"><summary><span>Mais opções</span><span aria-hidden="true">⌄</span></summary><nav aria-label="Mais opções do painel">${keys.map(key=>workspaceNavLink(key,current)).join('')}<a class="workspace-nav-link workspace-signout" href="/logout"><span class="workspace-nav-label">Sair da conta</span></a></nav></details>`;
}

export function workspaceNavigation(active,{role='owner',mobile=false}={}){
 const owner=role==='owner',current=workspaceActiveKey(active),keys=owner?workspaceOwnerPrimary:workspaceReviewPrimary;
 return `<nav class="workspace-nav${mobile?' workspace-nav-mobile':''}" aria-label="${mobile?'Navegação principal no celular':'Navegação principal'}" data-workspace-role="${owner?'owner':'review'}">${keys.map(key=>workspaceNavLink(key,current,{mobile})).join('')}</nav>`+(mobile?'':workspaceSecondaryNavigation(active,{role}));
}

export const WORKSPACE_NAVIGATION_CSS=String.raw`
.workspace-nav{display:flex;flex-direction:column;gap:5px;min-width:0}
.workspace-nav .workspace-nav-link,.workspace-more .workspace-nav-link{box-sizing:border-box;display:flex;align-items:center;gap:11px;min-width:0;min-height:50px;padding:11px 12px;border:1px solid transparent;border-radius:10px;background:transparent;color:var(--muted);text-decoration:none;font-size:12px;font-weight:600;line-height:1.4}
.workspace-nav .workspace-nav-link:hover,.workspace-more .workspace-nav-link:hover{background:var(--surface-raised);color:var(--text);text-decoration:none}
.workspace-nav .workspace-nav-link.active,.workspace-more .workspace-nav-link.active{background:var(--surface-raised);border-color:var(--line);color:var(--text)}
.workspace-nav-icon{display:flex;flex:0 0 20px;align-items:center;justify-content:center;color:inherit}.workspace-nav-copy{display:flex;flex-direction:column;gap:3px;min-width:0}.workspace-nav-label{display:block;font-size:12px;font-weight:650;overflow-wrap:anywhere}.workspace-nav-copy small{font-size:10px;line-height:1.4;color:var(--muted);font-weight:400}
.workspace-more{position:relative;min-width:0;margin-top:18px;border-top:1px solid var(--line);padding-top:10px}.workspace-more>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;padding:10px 12px;color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;list-style:none;border-radius:9px;touch-action:manipulation}.workspace-more>summary::-webkit-details-marker{display:none}.workspace-more>summary:hover{color:var(--text);background:var(--surface-raised)}
.workspace-more nav{display:flex;flex-direction:column;gap:3px;padding:5px 0}.workspace-more .workspace-nav-copy small{display:none}.workspace-more .workspace-nav-link{min-height:42px;font-size:11px}.workspace-signout{margin-top:7px;border-top:1px solid var(--line)!important;border-radius:0!important}
.workspace-more[data-active=true]>summary{color:var(--text);background:var(--surface-raised)}
.workspace-nav-mobile{display:none}.workspace-nav :focus-visible,.workspace-more :focus-visible{outline:3px solid var(--accent);outline-offset:3px}
@media(min-width:851px){.workspace-header-menu{display:none}}
@media(max-width:850px){
 .workspace-nav-mobile{box-sizing:border-box;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:3px;position:fixed;bottom:0;left:0;right:0;width:100%;z-index:60;padding:7px 8px calc(7px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--surface)}
 .workspace-nav-mobile[data-workspace-role=review]{grid-template-columns:repeat(3,minmax(0,1fr))}
 .workspace-nav-mobile .workspace-nav-link{display:flex;flex-direction:column;justify-content:center;gap:5px;min-height:54px;min-width:0;padding:7px 2px;border:0;border-radius:9px;text-align:center;color:var(--muted)}
 .workspace-nav-mobile .workspace-nav-link.active{border:0;color:var(--accent);background:var(--accent-soft)}.workspace-nav-mobile .workspace-nav-copy{display:block}.workspace-nav-mobile .workspace-nav-label{font-size:10px;line-height:1.3;white-space:nowrap;font-weight:600}.workspace-nav-mobile .workspace-nav-icon{flex:0 0 20px}
 .workspace-header-menu{display:block;position:relative;min-width:0}.workspace-header-menu .workspace-more{margin:0;padding:0;border:0}.workspace-header-menu .workspace-more>summary{min-height:40px;padding:8px 11px;border:1px solid var(--line);background:var(--surface);white-space:nowrap;font-size:11px}
 .workspace-header-menu .workspace-more nav{box-sizing:border-box;position:absolute;top:calc(100% + 8px);right:0;z-index:80;display:flex;flex-direction:column;gap:3px;width:min(290px,calc(100vw - 24px));max-height:60vh;max-height:60dvh;padding:8px;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);overflow-y:auto;overscroll-behavior:contain}
 .workspace-header-menu .workspace-more .workspace-nav-link{min-height:44px;flex-direction:row;text-align:left;justify-content:flex-start;font-size:12px}.workspace-header-menu .workspace-more .workspace-nav-label{font-size:12px}.workspace-header-menu .workspace-more .workspace-nav-copy small{display:block;font-size:10px}.workspace-header-menu .workspace-more .workspace-signout{padding-left:12px}
}
@media(max-width:360px){.workspace-nav-mobile .workspace-nav-label{font-size:9px}.workspace-nav-mobile{padding-left:4px;padding-right:4px}.workspace-header-menu .workspace-more>summary{padding:8px;font-size:10px}}
`;
