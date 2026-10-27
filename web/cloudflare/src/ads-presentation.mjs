// Presentation only: provider data, prices, counts, URLs and scripts retain
// their existing values. The exact dictionary covers known UI text nodes.
const adsUiLabels=new Map(Object.entries({
 'Advertising Dashboard':'Painel de anúncios',
 'Real Shopee advertising performance':'Acompanhe o investimento e as vendas atribuídas aos anúncios da Shopee.',
 'Advertising':'Anúncios','Dashboard':'Painel de anúncios','Campaigns':'Campanhas',
 'Shopee advertising account overview':'Saldo, investimento e desempenho da conta de anúncios.',
 'Product Ads campaign intelligence':'Compare as campanhas e acompanhe os indicadores de cada produto.',
 'GMV Max Products':'Produtos no GMV Max','Product-level GMV Max performance':'Investimento e desempenho dos produtos no GMV Max.',
 'Opportunities':'Oportunidades','Shopee recommendation intelligence - advisory only':'Sugestões da Shopee para avaliar antes de tomar uma decisão.',
 'Performance':'Desempenho','Advertising performance and reconciliation':'Entenda os resultados dos anúncios e a cobertura das fontes.',
 'Optimization':'Otimização','Campaign optimization intelligence':'Avalie recomendações e limites antes de ajustar campanhas.',
 'Integrations':'Integrações','Connected commerce platforms':'Confira o estado das conexões da sua loja.',
 'System Online':'Sistema disponível','Advertising Spend':'Investimento em anúncios',
 'Attributed GMV':'Vendas atribuídas aos anúncios','Orders':'Pedidos atribuídos',
 'Ads Balance':'Saldo de anúncios','Safe CPA':'CPA de referência','Break-even CPA':'CPA de equilíbrio',
 'Data Coverage':'Cobertura dos dados','Unavailable':'Indisponível','Daily Performance':'Desempenho por dia',
 'Daily Account Performance':'Desempenho diário da conta','Automation Safety':'Critérios de automação',
 'Economic Safety Guard':'Referências econômicas cadastradas','Account Performance':'Indicadores da conta',
 'Spend':'Investimento','GMV':'Vendas atribuídas','Impressions':'Impressões','Clicks':'Cliques',
 'Cost per Order':'Custo por pedido atribuído','Product Campaigns':'Campanhas por produto',
 'GMV Max Spend':'Investimento no GMV Max','GMV Max GMV':'Vendas atribuídas ao GMV Max',
 'GMV Max ROAS':'ROAS do GMV Max','Top GMV Max Product':'Produto com maior destaque no GMV Max',
 'GMV Max Product Performance':'Desempenho dos produtos no GMV Max','Automation Locked':'Alterações automáticas desativadas',
 'Product Opportunities':'Oportunidades por produto','Opportunity Intelligence':'Avaliação das oportunidades',
 'Recommendation Sources':'Fontes das recomendações','Product Intelligence':'Análise do produto',
 'ROI Intelligence':'Referências de retorno','Budget Intelligence':'Referências de orçamento',
 'Recommended Keywords':'Palavras-chave sugeridas','Product':'Produto','Shopee Tags':'Indicadores da Shopee',
 'Current Ads':'Anúncios atuais','Score':'Pontuação','Back to opportunities':'Voltar às oportunidades',
 'View intelligence':'Ver análise','Optimization Intelligence':'Análise para otimização',
 'Data Reconciliation':'Conferência dos dados','Safety Analysis':'Critérios para revisão',
 'Account Ads':'Anúncios da conta','Campaign':'Campanha','Status':'Situação','Margin':'Margem de referência',
 'Recommendation':'Recomendação','Signal':'Indicador','Date':'Data','Keyword':'Palavra-chave',
 'Quality':'Qualidade','30d Search Volume':'Buscas em 30 dias','Suggested Bid':'Lance sugerido',
 'Target ROAS':'ROAS de referência','Minimum Coverage':'Cobertura mínima','Automation Gate':'Condições para automação',
 'Recommended':'Recomendado','Observe':'Acompanhar','Pause Review':'Revisar pausa','Reduce':'Revisar redução',
 'Scale':'Avaliar expansão','Margin Watch':'Revisar margem','Economically Safe':'Dentro da referência econômica',
 'Above Safe CPA':'Acima do CPA de referência','Economic Risk':'Atenção à referência econômica',
 'Economic Guard':'Referências econômicas','Safe':'Dentro da referência','Read-only':'Somente leitura',
 'Active':'Ativo','Inactive':'Inativo','Paused':'Pausado','Automatic':'Automático',
 'Minimum':'Mínimo','Maximum':'Máximo','Lower Target':'Limite inferior','Upper Target':'Limite superior',
 'Exact Target':'Meta específica','MLS Target':'Meta cadastrada','Source Health':'Estado das fontes',
 'Not connected':'Desconectado','Connected ✓':'Conectado','Online ✓':'Disponível','Loaded on demand':'Consulta sob demanda','Degraded mode':'Parte dos dados indisponível',
 'Connect Shopee':'Conectar Shopee','Advertising APIs':'APIs de anúncios','Access Token':'Autorização de acesso',
 'Shop ID':'Identificação da loja','Token Renewal':'Renovação da conexão','Fixed outbound IP':'Endereço de saída',
 'Sign out':'Sair','Sign in':'Entrar','Username':'Usuário','Password':'Senha',
 'Invalid username or password.':'Usuário ou senha inválidos.',
 'Shopee Ads Intelligence':'Sua operação, com mais clareza.',
 'Product Ads, GMV Max, recommendation intelligence and optimization guidance.':'Anúncios, campanhas e recomendações da Shopee em um só lugar.',
 'No campaigns.':'Nenhuma campanha retornada.','No GMV Max items.':'Nenhum produto no GMV Max retornado.',
 'No data.':'Nenhum dado retornado.','Coverage unavailable.':'Cobertura indisponível.',
 'No product with attributed orders yet.':'Nenhum produto com pedidos atribuídos neste recorte.',
 'No recommended products were returned by Shopee for this shop.':'A Shopee não retornou produtos recomendados para esta loja.',
 'No source diagnostics.':'Nenhum diagnóstico de fonte disponível.',
 'Select a product above to load ROI target, budget suggestion and recommended keywords.':'Selecione um produto para conferir as referências de retorno, orçamento e palavras-chave.',
 'Shopee authorized the keyword recommendation source, but no recommended keywords were returned for this product.':'A fonte de palavras-chave está autorizada, mas não retornou sugestões para este produto.',
 'Shopee recommendations are advisory signals. MLS does not make automatic changes in this version.':'As recomendações são sugestões para análise. Esta versão não altera os anúncios automaticamente.',
 'This page is recommendation-only. No budget, ROAS, keyword or campaign status is changed.':'As recomendações desta página não alteram orçamento, ROAS, palavras-chave ou situação das campanhas.',
 'One or more recommendation sources are unavailable. The rest of the dashboard remains read-only and operational.':'Parte das fontes de recomendações está indisponível. Os demais indicadores continuam disponíveis para consulta.',
 'Automatic actions are technically eligible, but remain disabled until explicitly enabled.':'Os critérios técnicos foram atendidos. A execução comercial continua desativada.',
 'Low-evidence products without orders':'Produtos sem pedidos e com poucos dados','Meaningful spend without orders':'Investimento relevante sem pedidos atribuídos',
 'Products with only a few cents of spend are not treated as waste.':'Produtos com investimento muito baixo ainda não têm dados suficientes para avaliar desperdício.',
 'Profit preserved at Safe CPA':'Contribuição de referência no CPA indicado','Safe ad share of margin':'Parcela de referência da margem para anúncios',
 'Minimum reconciled coverage:':'Cobertura mínima conferida:','✓ Data Coverage Passed':'✓ Cobertura dos dados suficiente',
 '🔒 Automatic changes locked':'Alterações automáticas desativadas','🔒 Automation Locked':'Alterações automáticas desativadas',
}));
const adsLeafTag=/<(h[1-6]|th|label|button|a|div|p|strong|span|title)(\b[^>]*)>([^<>]*)<\/\1>/gi;
const adsPresentable=(tag,attrs)=>['h1','h2','h3','h4','h5','h6','th','label','button','title'].includes(tag)
 || /\bclass="[^"]*\b(?:label|subtitle|system|nav|logout|button|badge|connection-status|note|period|signal|tag)\b/.test(attrs)
 || tag==='p';

export function enhanceAdsPageHtml(html){
 if(typeof html!=='string')return html;
 const blocks=html.split(/(<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>)/gi);
 let result=blocks.map(block=>/^<(?:script|style)\b/i.test(block)?block:block.replace(adsLeafTag,(whole,tag,attrs,text)=>{
  if(!adsPresentable(tag.toLowerCase(),attrs))return whole;
  const normalized=text.replace(/\s+/g,' ').trim(),translated=adsUiLabels.get(normalized);
  if(translated)return '<'+tag+attrs+'>'+translated+'</'+tag+'>';
  if(tag.toLowerCase()==='title'){
   const heading=normalized.replace(/ - MLS Commerce Ads$/,'');
   return '<title>'+(adsUiLabels.get(heading)||heading).replace(/^MLS Commerce Ads$/,'MLS Commerce OS')+(heading!==normalized?' · MLS Commerce OS':'')+'</title>';
  }
  return whole;
 }).replace(/(<div class="(?:feature|signal(?: [^"]*)?|locked|unlocked)">\s*<strong>)([^<>]*)(<\/strong>)/g,(whole,start,text,end)=>{
  const translated=adsUiLabels.get(text.replace(/\s+/g,' ').trim());
  return translated?start+translated+end:whole;
 }).replace(/(<div class="feature">\s*<strong>[^<>]*<\/strong>\s*)([^<>]*)(\s*<\/div>)/g,(whole,start,text,end)=>{
  const translated=adsUiLabels.get(text.replace(/\s+/g,' ').trim());
  return translated?start+translated+end:whole;
 })).join('');
 result=result.replace('<html lang="en">','<html lang="pt-BR">')
  .replace(/<div class="(logo|brand)">\s*MLS Commerce\s*<span>Ads<\/span>\s*<\/div>/g,
   '<div class="$1"><span class="ads-brand-mark">MLS</span><span class="ads-brand-name">MLS Commerce OS</span></div>');
 const toggle='<button type="button" class="ads-theme-toggle theme-toggle" data-braza-theme-toggle aria-label="Alterar tema">Tema</button>';
 if(result.includes('<main class="main">')){
  result=result.replace(/(<div class="top">[\s\S]*?)(<div class="system">)/,'$1<div class="ads-top-actions">'+toggle+'$2')
   .replace(/(<div class="system">[\s\S]*?<\/div>)/,'$1</div>');
 }else if(result.includes('action="/login"')){
  result=result.replace('<body>','<body class="ads-login"><div class="ads-login-theme">'+toggle+'</div>');
 }
 return result.replace('</head>','<style>'+ADS_PRESENTATION_CSS+'</style></head>');
}

export const ADS_PRESENTATION_CSS=String.raw`
body{background:var(--app-bg);color:var(--text);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.5;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}
.app{width:100%;min-width:0;align-items:flex-start}
.sidebar{position:sticky;top:0;height:100dvh;width:236px;flex:0 0 236px;padding:30px 20px 20px;background:var(--surface);color:var(--text);border-right:1px solid var(--line);overflow-y:auto}
.logo,.brand{display:flex;align-items:center;gap:10px;color:var(--text);font-size:18px;font-weight:800;letter-spacing:-.6px;margin-bottom:36px}
.logo .ads-brand-mark,.brand .ads-brand-mark{display:grid;place-items:center;width:43px;height:39px;flex:0 0 43px;border-radius:12px;background:var(--accent);color:var(--on-accent,#fff);font-size:10px;letter-spacing:.45px}
.logo .ads-brand-name,.brand .ads-brand-name{color:var(--text)}
.sidebar .nav{display:flex;align-items:center;min-height:44px;padding:12px 15px;margin:5px 0;border:1px solid transparent;border-radius:11px;color:var(--muted);font-size:13px;font-weight:600;transition:background .15s,color .15s}
.sidebar .nav:hover{color:var(--text);background:var(--surface-raised)}
.sidebar .nav.active{color:var(--accent);background:var(--accent-soft);border-color:var(--line);font-weight:750}
.logout{color:var(--muted);font-size:13px;border-top:1px solid var(--line);margin-top:24px;padding-top:20px}
.main{padding:34px 36px 56px;width:calc(100% - 236px);max-width:1470px;margin:0 auto}
.top{gap:20px;margin-bottom:24px;align-items:flex-start}
.top h1{font-size:30px;font-weight:750;letter-spacing:-1px;line-height:1.35;overflow-wrap:anywhere}
.subtitle{font-size:14px;color:var(--muted);margin-top:10px;max-width:64ch;line-height:1.6}
.ads-top-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-shrink:0}
.system{display:flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--surface);color:var(--muted);padding:9px 12px;font-size:11px;font-weight:650;white-space:nowrap}
.system::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--positive)}
.ads-theme-toggle{width:auto!important;min-height:38px;max-width:180px;padding:8px 12px!important;border:1px solid var(--line)!important;border-radius:10px!important;background:var(--surface)!important;color:var(--text)!important;font-size:12px!important;font-weight:650!important;cursor:pointer}
.ads-theme-toggle:hover{background:var(--surface-raised)!important}
.ads-source-banner{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:17px 20px;margin:0 0 25px;border:1px solid var(--line);border-radius:15px;background:var(--surface)}
.ads-eyebrow{display:block;color:var(--accent);font-size:10px;font-weight:800;letter-spacing:1.25px}
.ads-source-banner p{margin:5px 0 0;font-size:12px;line-height:1.6;color:var(--muted);max-width:74ch}
.ads-finance-link{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:40px;flex:0 0 auto;color:var(--accent);font-size:12px;font-weight:750;text-decoration:none}
.cards{grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.card,.panel,.mini{background:var(--surface);border:1px solid var(--line);border-radius:17px;box-shadow:0 3px 16px rgba(15,23,42,.025)}
.cards .card{position:relative;padding:24px 22px;min-width:0;min-height:132px}
.cards .card::before{content:'';position:absolute;left:22px;top:0;width:30px;height:3px;background:var(--accent);border-radius:0 0 4px 4px}
.label{font-size:12px;font-weight:550;color:var(--muted);line-height:1.5}
.value{font-size:clamp(25px,2.4vw,34px);font-weight:770;letter-spacing:-1.2px;margin-top:12px;line-height:1.25;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.green{color:var(--positive)}.red{color:var(--negative)}.orange{color:var(--accent)}
.mini-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:16px}
.mini{padding:20px;min-width:0}.mini strong{color:var(--text);font-size:21px;letter-spacing:-.65px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.grid{grid-template-columns:minmax(0,1.75fr) minmax(280px,1fr);gap:20px;margin-top:24px}
.panel{padding:25px;min-width:0}.panel h2{font-size:16px;font-weight:750;letter-spacing:-.35px;color:var(--text);margin-bottom:14px}
.panel-title-row,.detail-head{gap:18px}.note{color:var(--muted);font-size:12px;line-height:1.8}
.period,.neutral,.status-ended,.status-closed,.status-unknown{background:var(--surface-raised);color:var(--muted);border:1px solid var(--line)}
.table-wrap{max-width:100%;overflow-x:auto;border-radius:12px;scrollbar-width:thin}
table{font-size:12px;margin-top:15px}th,td{padding:14px 12px;border-bottom:1px solid var(--line);color:var(--text);font-size:12px}th{color:var(--muted);font-weight:650;background:var(--surface-raised)}
tbody tr:last-child td{border-bottom:0}tbody tr:hover td{background:var(--surface-raised)}
.campaign-name{min-width:240px;max-width:380px}.campaign-name strong{font-weight:650}.campaign-name .note{font-size:11px}
.badge,.connection-status{font-size:10px;padding:6px 9px;font-weight:700;letter-spacing:.15px}
.good,.connected,.status-ongoing{color:var(--positive);background:color-mix(in srgb,var(--positive) 11%,var(--surface));border-color:color-mix(in srgb,var(--positive) 25%,var(--line))}
.warning,.status-paused{color:var(--text);background:color-mix(in srgb,#d29a25 12%,var(--surface));border-color:color-mix(in srgb,#d29a25 26%,var(--line))}
.danger{color:var(--negative);background:color-mix(in srgb,var(--negative) 10%,var(--surface));border-color:color-mix(in srgb,var(--negative) 23%,var(--line))}
.feature{padding:16px 0;border-color:var(--line);color:var(--text);font-size:13px}.feature strong{color:var(--muted);font-size:11px;font-weight:600}
.filters{gap:8px;margin:18px 0}.filter{border-color:var(--line);background:var(--surface);color:var(--muted);padding:9px 13px;border-radius:10px;font-size:11px}.filter.active{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}
.signal,.signal.good,.signal.warning,.signal.danger,.signal.info,.locked,.unlocked,.muted-card{padding:16px;border-radius:12px;background:var(--surface-raised);border:1px solid var(--line);color:var(--text)}
.signal strong{font-size:12px;font-weight:700}.signal .note{margin-top:6px}.coverage-bar,.score-bar{background:var(--line);height:7px}.coverage-fill,.score-fill{background:var(--positive)}.coverage-fill.low{background:var(--negative)}
.button,.connect{min-height:42px;border-radius:10px;padding:11px 15px;background:var(--accent);color:var(--on-accent,#fff);font-size:12px;font-weight:700}.button.secondary{background:var(--surface-raised);border:1px solid var(--line);color:var(--text)}
.tag{color:var(--accent);background:var(--accent-soft);font-size:10px;border:1px solid var(--line)}.score{color:var(--text);font-size:30px;letter-spacing:-1px}
a:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.ads-login{background:var(--app-bg);color:var(--text)}.ads-login .left{background:var(--surface);border-right:1px solid var(--line);color:var(--text);padding:clamp(35px,6vw,100px)}
.ads-login .left h1{font-size:clamp(36px,4.8vw,64px);line-height:1.08;letter-spacing:-2.5px;max-width:8ch;margin:65px 0 25px}.ads-login .left p{max-width:40ch;font-size:15px;line-height:1.8;color:var(--muted)}
.ads-login .right{padding:45px}.ads-login .right .card{padding:38px;border-radius:22px;box-shadow:0 20px 80px rgba(15,23,42,.04)}.ads-login .right h2{font-size:25px;letter-spacing:-.8px;margin:0 0 24px}.ads-login label{font-size:12px;font-weight:650;color:var(--muted)}
.ads-login input{background:var(--surface-raised);color:var(--text);border:1px solid var(--line);padding:13px 14px;min-height:48px;border-radius:11px;margin:8px 0 20px;font-size:15px}.ads-login input:focus{outline:2px solid var(--accent);outline-offset:1px}.ads-login form button{background:var(--accent);color:var(--on-accent,#fff);border-radius:11px;min-height:48px;cursor:pointer}.ads-login .error{color:var(--negative);background:color-mix(in srgb,var(--negative) 9%,var(--surface))}
.ads-login-theme{position:absolute;top:22px;right:24px}
@media(max-width:1150px){.cards,.mini-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.grid{grid-template-columns:minmax(0,1fr)}}
@media(max-width:850px){.sidebar{display:none}.main{width:100%;padding:26px 20px 42px}.top{margin-bottom:18px}.top h1{font-size:27px}.ads-top-actions{display:none}.ads-source-banner{padding:16px;margin-bottom:20px;align-items:flex-start;flex-direction:column;gap:8px}.ads-finance-link{min-height:36px;width:100%;justify-content:flex-start}.cards{gap:12px}.cards .card{padding:21px;min-height:124px}.cards .card::before{left:21px}.value{font-size:30px}.panel{padding:20px}.mini-grid{gap:12px}.mini{padding:18px}.ads-login .right{min-height:100dvh;width:100%;padding:80px 24px 32px}}
@media(max-width:550px){.cards{grid-template-columns:minmax(0,1fr)}.mini-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.main{padding:24px 16px 36px}.top h1{font-size:26px}.subtitle{font-size:12px}.cards .card{min-height:114px}.mini strong{font-size:19px}.mini .label{font-size:11px}.panel{padding:18px}.ads-source-banner p{font-size:11px}.panel-title-row{flex-direction:column;align-items:flex-start}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
`;
