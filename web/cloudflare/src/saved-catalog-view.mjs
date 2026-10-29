import {projectProductRegistryFrame} from './product-registry.mjs';

export const SAVED_CATALOG_CSS=String.raw`.saved-catalog-toolbar{display:flex;align-items:end;gap:12px;flex-wrap:wrap}.saved-catalog-toolbar .field{flex:1;min-width:180px}.saved-catalog-list{display:grid;gap:12px;margin:18px 0}.saved-catalog-product{border:1px solid var(--line,#e2e6e9);border-radius:14px;padding:18px;min-width:0}.saved-catalog-product h3{margin:0;overflow-wrap:anywhere}.saved-catalog-meta{display:flex;justify-content:space-between;gap:12px;align-items:start}.saved-catalog-detail{margin-top:18px;border-top:1px solid var(--line,#e2e6e9);padding-top:16px}.saved-catalog-variants{display:grid;gap:10px}.saved-catalog-variant{padding:14px;border:1px solid var(--line,#e2e6e9);border-radius:12px;min-width:0}.saved-catalog-variant h4{margin:0 0 8px;overflow-wrap:anywhere}.saved-catalog-variant .observation-toolbar{margin-top:12px}.saved-catalog-cost{font-size:1.2rem;font-weight:750;margin:8px 0}.saved-catalog-assignment{margin-top:12px}.saved-catalog-page{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.saved-catalog-page .actions{display:flex;gap:8px}.saved-catalog-scope{margin-top:18px}@media(max-width:700px){.saved-catalog-toolbar{align-items:stretch}.saved-catalog-toolbar>*{width:100%}.saved-catalog-meta{display:block}.saved-catalog-meta>button{margin-top:12px}.saved-catalog-product{padding:16px}.saved-catalog-page .actions{width:100%}.saved-catalog-page .actions button{flex:1}}

/* MLS Products hub: read-only visual overview of shipped vs draft features. */
.mls-products-hub{--products-blue:#6da8ff;--products-green:#50d6aa;--products-amber:#e7bb7b;min-width:0;margin:0 0 22px;scroll-margin-top:90px}
.mls-products-hub *{box-sizing:border-box}
.mls-products-hub .products-hub-hero{position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(0,1.65fr) minmax(240px,.7fr);gap:21px;padding:clamp(21px,2.75vw,34px);background:radial-gradient(ellipse at 85% -30%,rgba(91,157,255,.19),transparent 55%),linear-gradient(118deg,rgba(77,136,234,.08),transparent 65%),var(--surface);border:1px solid var(--line);border-radius:20px}
.mls-products-hub .products-hub-hero:before{content:"";position:absolute;right:-100px;top:-200px;width:370px;height:370px;border:1px solid rgba(110,170,255,.20);border-radius:50%;pointer-events:none}
.mls-products-hub .products-hub-copy{position:relative;min-width:0}
.mls-products-hub .products-hub-eyebrow{font-size:10px;font-weight:800;line-height:1.55;letter-spacing:1.45px;color:var(--products-blue)}
.mls-products-hub .products-hub-copy h2{font-size:clamp(25px,2.55vw,35px);letter-spacing:-.8px;line-height:1.17;margin:11px 0 12px;max-width:720px;color:var(--text)}
.mls-products-hub .products-hub-copy>p{font-size:13px;line-height:1.7;color:var(--muted);max-width:700px;margin:0}
.mls-products-hub .products-hub-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:20px}
.mls-products-hub .products-hub-actions a{display:inline-flex;min-height:41px;align-items:center;justify-content:center;gap:9px;padding:10px 14px;border:1px solid var(--line);border-radius:10px;color:var(--text);text-decoration:none;font-size:11px;font-weight:750;background:var(--surface-raised)}
.mls-products-hub .products-hub-actions a:first-child{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.mls-products-hub .products-hub-actions a:hover{border-color:var(--products-blue)}
.mls-products-hub .products-hub-state{position:relative;display:flex;flex-direction:column;gap:10px;min-width:0;padding:20px;border:1px solid rgba(109,168,255,.25);border-radius:16px;background:linear-gradient(143deg,rgba(109,168,255,.09),transparent 70%),var(--surface-raised)}
.mls-products-hub .products-hub-state-label{font-size:10px;font-weight:800;letter-spacing:1.2px;color:var(--muted)}
.mls-products-hub .products-hub-state strong{font-size:20px;letter-spacing:-.35px;line-height:1.3}
.mls-products-hub .products-hub-state p{margin:0;font-size:11px;line-height:1.7;color:var(--muted)}
.mls-products-hub .products-hub-pill{display:inline-flex;align-self:flex-start;gap:7px;align-items:center;max-width:100%;padding:6px 9px;border:1px solid var(--line);border-radius:999px;background:var(--surface-raised);color:var(--muted);font-size:10px;line-height:1.45;font-weight:750}
.mls-products-hub .products-hub-pill--available{border-color:rgba(80,214,170,.30);color:var(--products-green);background:rgba(80,214,170,.07)}
.mls-products-hub .products-hub-pill--review{border-color:rgba(231,187,123,.30);color:var(--products-amber);background:rgba(231,187,123,.065)}
.mls-products-hub .products-hub-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px;margin:15px 0}
.mls-products-hub .products-hub-card{min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:9px;padding:18px;border:1px solid var(--line);border-top:2px solid var(--products-blue);border-radius:14px;background:var(--surface)}
.mls-products-hub .products-hub-card[data-stage=review]{border-top-color:var(--products-amber)}
.mls-products-hub .products-hub-number{font-size:10px;letter-spacing:1.5px;font-weight:850;color:var(--muted)}
.mls-products-hub .products-hub-card h3{font-size:16px;line-height:1.35;letter-spacing:-.3px;margin:3px 0 0;color:var(--text)}
.mls-products-hub .products-hub-card p{font-size:11px;line-height:1.6;color:var(--muted);margin:0}
.mls-products-hub .products-hub-card .products-hub-link{font-size:11px;font-weight:800;line-height:1.45;color:var(--accent);margin-top:auto;padding-top:7px;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}
.mls-products-hub .products-hub-caution{display:flex;gap:10px;align-items:flex-start;padding:13px 17px;border:1px solid var(--line);border-radius:12px;background:var(--surface-raised)}
.mls-products-hub .products-hub-caution strong{font-size:10px;font-weight:850;letter-spacing:1px;color:var(--products-blue);white-space:nowrap}
.mls-products-hub .products-hub-caution p{margin:0;color:var(--muted);font-size:11px;line-height:1.65}
#savedCatalog,#legacyProductEditor,#savedCatalogSearch,#productSearch{scroll-margin-top:92px}
:root[data-theme=light] .mls-products-hub{--products-blue:#185bbb;--products-green:#167653;--products-amber:#8c5d1b}
@media(max-width:1230px){.mls-products-hub .products-hub-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:850px){.mls-products-hub .products-hub-hero{grid-template-columns:minmax(0,1fr)}.mls-products-hub .products-hub-state{padding:17px}}
@media(max-width:600px){.mls-products-hub .products-hub-hero{padding:22px 18px;gap:17px}.mls-products-hub .products-hub-copy h2{font-size:25px}.mls-products-hub .products-hub-grid{grid-template-columns:minmax(0,1fr)}.mls-products-hub .products-hub-actions{display:grid;grid-template-columns:1fr}.mls-products-hub .products-hub-card{padding:17px}.mls-products-hub .products-hub-caution{display:block}.mls-products-hub .products-hub-caution strong{display:block;margin-bottom:6px}.mls-products-hub .products-hub-state{gap:8px}}
`;

export function savedCatalogBody(){return `
<section id="productsHub" class="mls-products-hub" aria-labelledby="productsHubTitle">
 <header class="products-hub-hero">
  <div class="products-hub-copy">
   <span class="products-hub-eyebrow">MLS PRODUCTS · CENTRAL DE PRODUTOS</span>
   <h2 id="productsHubTitle">Catálogo, custos e oportunidades em um só lugar.</h2>
   <p>Consulte o cadastro salvo, revise custos por variação e acompanhe as próximas ferramentas. Cadastro, vendas e rentabilidade são fontes diferentes e não devem ser confundidas.</p>
   <div class="products-hub-actions">
    <a href="#savedCatalog">Explorar catálogo salvo <span aria-hidden="true">›</span></a>
    <a href="/admin?tab=margins">Abrir custos de produção <span aria-hidden="true">›</span></a>
   </div>
  </div>
  <aside class="products-hub-state" aria-label="Estado da área de Produtos">
   <span class="products-hub-state-label">STATUS DA ÁREA</span>
   <strong>Leitura e conferência</strong>
   <span class="products-hub-pill products-hub-pill--available">Disponível no painel atual</span>
   <p>O catálogo persistido e os controles atuais de custo estão disponíveis. Alterações na Shopee exigem ações próprias e autorização; abrir esta área não publica anúncios.</p>
  </aside>
 </header>
 <div class="products-hub-grid" aria-label="Ferramentas por estágio de entrega">
  <article class="products-hub-card" data-stage="available">
   <span class="products-hub-number">01 · CADASTRO SALVO</span>
   <h3>Pesquisar produtos</h3>
   <span class="products-hub-pill products-hub-pill--available">Disponível</span>
   <p>Localize produtos, confira variações e acompanhe a cobertura da indexação. Status cadastral não representa estoque.</p>
   <a class="products-hub-link" href="#savedCatalog">Ir para o catálogo salvo</a>
  </article>
  <article class="products-hub-card" data-stage="available">
   <span class="products-hub-number">02 · REFERÊNCIAS DE CUSTO</span>
   <h3>Custos e vínculos</h3>
   <span class="products-hub-pill products-hub-pill--available">Disponível</span>
   <p>Consulte custos cadastrados, abra as variações e revise vínculos avançados. Custo conhecido não comprova lucro líquido.</p>
   <a class="products-hub-link" href="#legacyProductEditor">Ir à revisão avançada de vínculos</a>
  </article>
  <article class="products-hub-card" data-stage="review">
   <span class="products-hub-number">03 · CRIAÇÃO DE ANÚNCIOS</span>
   <h3>Fábrica de Anúncios</h3>
   <span class="products-hub-pill products-hub-pill--review">Homologação · não publicada</span>
   <p>Rascunhos locais com títulos, variações e mockups estão em revisão técnica. Nenhum envio automático à Shopee está liberado.</p>
   <a class="products-hub-link" href="https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/68" target="_blank" rel="noopener noreferrer">Ver candidato V3.6 no GitHub</a>
  </article>
  <article class="products-hub-card" data-stage="review">
   <span class="products-hub-number">04 · ANÁLISE E PREÇOS</span>
   <h3>MLS Pricing</h3>
   <span class="products-hub-pill products-hub-pill--review">Observer em revisão</span>
   <p>Curva ABC e simulação manual estão em PR separada. Recomendar preço exige custos, taxas, Ads e estoque verificáveis.</p>
   <a class="products-hub-link" href="https://github.com/MatheusLemosDS/MLS-Ecommerce-Ads/pull/47" target="_blank" rel="noopener noreferrer">Ver proposta M3 no GitHub</a>
  </article>
 </div>
 <div class="products-hub-caution"><strong>FONTES DISTINTAS</strong><p>Catálogo salvo não é estoque vendável; unidades vendidas não são pedidos únicos; custo cadastrado não é lucro; rascunho de anúncio não é publicação. Ads e PROMO continuam bloqueados para execução automática.</p></div>
</section>
<section id="savedCatalog" class="card saved-catalog"><div class="card-head"><div><span class="eyebrow">CATÁLOGO SALVO</span><h2>Seus produtos e custos</h2><p class="muted">Encontre qualquer produto cadastrado, abra suas variações e confira o custo completo de cada unidade ou kit.</p></div></div><form id="savedCatalogSearchForm" class="saved-catalog-toolbar"><div class="field"><label for="savedCatalogSearch">Nome ou código do produto</label><input id="savedCatalogSearch" type="search" maxlength="120" autocomplete="off" placeholder="Ex.: infantil, camiseta ou código"></div><div class="field"><label for="savedCatalogStatus">Produtos exibidos</label><select id="savedCatalogStatus"><option value="ACTIVE">Sem produtos excluídos</option><option value="ALL">Incluir histórico de excluídos</option><option value="UNKNOWN">Cadastro em conferência</option><option value="NORMAL">Status normal na Shopee</option><option value="UNLIST">Não listados</option><option value="BANNED">Suspensos</option><option value="REVIEWING">Em revisão</option></select></div><button id="savedCatalogFind" type="submit" class="button-secondary">Buscar</button><button id="savedCatalogRefresh" type="button" class="button-secondary">Recarregar catálogo salvo</button></form><p id="savedCatalogMessage" class="field-help" role="status" aria-live="polite">Preparando o catálogo salvo…</p><p id="savedCatalogCoverage" class="field-help"></p><div id="savedCatalogList" class="saved-catalog-list"></div><div class="saved-catalog-page"><p id="savedCatalogPage" class="field-help"></p><div class="actions"><button id="savedCatalogPrevious" type="button" class="button-secondary" disabled>Anterior</button><button id="savedCatalogNext" type="button" class="button-secondary" disabled>Próxima</button></div></div><details class="saved-catalog-scope"><summary>Atualização e cobertura do catálogo</summary><p id="savedCatalogSource" class="field-help"></p><p class="field-help">A lista usa o cadastro persistido e os custos atuais. Abrir uma variação não consulta a Shopee. A indexação automática inclui produtos sem vendas recentes; enquanto ela estiver em andamento, alguns produtos podem ainda não aparecer. O status cadastral não informa estoque nem disponibilidade para venda.</p><button id="savedCatalogSync" type="button" class="button-secondary">Atualizar cadastro na Shopee</button></details></section>`;}

export const SAVED_CATALOG_CLIENT=String.raw`
(()=>{
 ${projectProductRegistryFrame.toString()}
 const el=id=>document.getElementById('savedCatalog'+id),node=(tag,text,cls)=>{const row=document.createElement(tag);if(text!==undefined)row.textContent=text;if(cls)row.className=cls;return row;},money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100),time=value=>value===null?'Ainda não concluída':new Date(value*1000).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
 let api=null,onConfigureCost=null,onAssignRule=null,stopped=true,generation=0,promise=null,sourceBusy=false,frame=null,offset=0,selected=null,selectionGeneration=0,detailPromise=null,detailFrame=null,detailHost=null,detailOffset=0,sourceTimer=null,backgroundPromise=null,sourceRetryAt=0,sourcePaused=false,discovery=null,listGeneration=0,variantRefreshPromise=null,detailRefreshButton=null;
 const statuses={NORMAL:'Status normal',UNLIST:'Não listado',BANNED:'Suspenso',REVIEWING:'Em revisão',SELLER_DELETE:'Excluído pelo vendedor',SHOPEE_DELETE:'Excluído pela Shopee',UNKNOWN:'Cadastro em conferência'};
 const button=(label,fn)=>{const item=node('button',label,'button-secondary');item.type='button';item.onclick=fn;return item;};
 function controls(){const busy=!!promise||sourceBusy;for(const key of ['Search','Status','Find','Refresh'])el(key).disabled=busy;el('Sync').disabled=busy||!!backgroundPromise;el('Previous').disabled=busy||!frame||frame.pagination.offset===0;el('Next').disabled=busy||!frame?.pagination.more;}
 function closeDetail(){selected=null;selectionGeneration++;detailFrame=null;detailPromise=null;detailHost=null;detailOffset=0;detailRefreshButton=null;}
 function renderList({preserveDetail=false}={}){
  const oldDetailHost=preserveDetail?detailHost:null;
  if(!frame)return;const cards=frame.products.map(product=>{const card=node('article',undefined,'saved-catalog-product'),head=node('div',undefined,'saved-catalog-meta'),meta=node('div'),expand=button(selected===product.item_id?'Fechar variações':'Ver variações e custos',()=>{if(selected===product.item_id){closeDetail();renderList();return;}closeDetail();selected=product.item_id;renderList();loadDetail();});expand.setAttribute('aria-expanded',String(selected===product.item_id));
   meta.append(node('h3',product.product_name||'Produto #'+product.item_id),node('p','#'+product.item_id+' · '+statuses[product.item_status],'field-help'),node('p',product.metadata_changed?'Catálogo alterado; aguardando conferir variações':product.model_count?product.resolved_count+' de '+product.model_count+' variação(ões) identificada(s)':'Variações aguardando o catálogo','field-help'));head.append(meta,expand);card.append(head);
   if(selected===product.item_id){detailHost=oldDetailHost||node('div',undefined,'saved-catalog-detail');card.append(detailHost);if(!oldDetailHost){if(detailFrame)renderDetail();else detailHost.append(node('p','Carregando variações salvas…','field-help'));}}return card;});
  el('List').replaceChildren(...(cards.length?cards:[node('p','Nenhum produto encontrado neste filtro. Confira a cobertura do catálogo abaixo.','field-help')]));const p=frame.pagination;el('Page').textContent=(p.total?p.offset+1:0)+'–'+Math.min(p.offset+p.limit,p.total)+' de '+p.total+' produto(s) · '+p.limit+' por página';
  const c=frame.counts,d=frame.discovery;el('Coverage').textContent=c.total+' produto(s) no cadastro salvo · '+c.indexed+' conferido(s) na Shopee · '+c.pending_catalog+' aguardando identificação.';el('Source').textContent='Última indexação completa: '+time(d.last_success_at)+'. '+(d.complete?'Uma varredura completa foi concluída.':d.status==='RETRY_WAIT'?'A atualização será retomada automaticamente.':'A indexação ainda está em andamento.')+' A abertura desta lista não altera o horário da fonte.';controls();
 }
 function renderDetail(){
  if(!detailFrame||!detailHost||detailFrame.product.item_id!==selected)return;const d=detailFrame,out=[];
  if(['SELLER_DELETE','SHOPEE_DELETE'].includes(d.product.item_status))out.push(node('p','Registro histórico de um produto excluído. Os custos não indicam disponibilidade para venda.','field-help'));
  out.push(node('p','Catálogo conferido em '+time(d.product.catalog_checked_at)+' · custos v'+(d.revisions.costs??'—')+' · regras v'+(d.revisions.cost_rules??'—'),'field-help'));
  const actions=node('div',undefined,'observation-toolbar'),ruleHost=node('div',undefined,'saved-catalog-assignment'),feedback=node('p',undefined,'field-help'),id=d.product.item_id;feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');detailRefreshButton=button('Conferir variações na Shopee',()=>refreshVariants(id,feedback));detailRefreshButton.disabled=!!variantRefreshPromise;actions.append(detailRefreshButton,button('Configurar custo do produto',()=>onConfigureCost?.(selected,null)));if(onAssignRule)actions.append(button('Definir tipo para todos os tamanhos',()=>{ruleHost.replaceChildren();const control=onAssignRule(selected,null);if(control)ruleHost.append(control);}));out.push(actions,feedback,ruleHost);
  const rows=node('div',undefined,'saved-catalog-variants');for(const variant of d.variants){const item=node('article',undefined,'saved-catalog-variant');item.append(node('h4',variant.model_name||'Variação #'+variant.model_id),node('p',variant.attributes.length?variant.attributes.map(a=>a.name+': '+a.value).join(' · '):'Variação #'+variant.model_id,'field-help'));
   let label=variant.selling_unit==='ONE_MALE_ONE_FEMALE_KIT'?'Custo do kit inteiro':variant.selling_unit==='CUSTOM_PRODUCT'?'Custo por unidade vendida':'Custo da peça avulsa';item.append(node('p',variant.unit_cost_cents===null?'Custo pendente':money(variant.unit_cost_cents),'saved-catalog-cost'),node('p',variant.unit_cost_cents===null?(variant.reason==='CATALOG_METADATA_CHANGED'?'O produto mudou na Shopee. A identificação está aguardando uma nova conferência.':'Tipo, tamanho ou custo ainda precisam de identificação.'):label+(variant.cost_profile_label?' · '+variant.cost_profile_label:''),'field-help'));
   const rowActions=node('div',undefined,'observation-toolbar'),assignment=node('div',undefined,'saved-catalog-assignment');const id=selected,model=variant.model_id;rowActions.append(button('Configurar custo desta variação',()=>onConfigureCost?.(id,model)));if(onAssignRule)rowActions.append(button('Corrigir tipo e tamanho',()=>{assignment.replaceChildren();const control=onAssignRule(id,model);if(control)assignment.append(control);}));item.append(rowActions,assignment);rows.append(item);
  }out.push(rows);if(!d.variants.length)out.push(node('p','As variações deste produto ainda não foram identificadas no catálogo. O cadastro será atualizado automaticamente.','field-help'));
  const page=node('div',undefined,'saved-catalog-page'),nav=node('div',undefined,'actions'),prev=button('Variações anteriores',()=>loadDetail(Math.max(0,d.pagination.offset-d.pagination.limit))),next=button('Próximas variações',()=>loadDetail(d.pagination.offset+d.pagination.limit));prev.disabled=d.pagination.offset===0;next.disabled=!d.pagination.more;nav.append(prev,next);page.append(node('p',(d.pagination.total?d.pagination.offset+1:0)+'–'+Math.min(d.pagination.offset+d.pagination.limit,d.pagination.total)+' de '+d.pagination.total+' variação(ões)','field-help'),nav);out.push(page);detailHost.replaceChildren(...out);
 }
 function loadDetail(nextOffset=detailOffset){
  if(stopped||!selected||!api)return Promise.resolve(false);if(detailPromise)return detailPromise;const id=selected,seq=selectionGeneration,gen=generation;detailOffset=nextOffset;if(detailHost)detailHost.setAttribute('aria-busy','true');
  const task=(async()=>{try{const raw=await api('product-registry?item_id='+encodeURIComponent(id)+'&variant_limit=100&variant_offset='+nextOffset);if(stopped||gen!==generation||seq!==selectionGeneration)return false;const d=projectProductRegistryFrame(raw);if(!d||d.schema!=='product_registry_detail_v1'||d.product.item_id!==id||d.pagination.offset!==nextOffset)throw Error('INVALID');detailFrame=d;renderDetail();return true;}catch{if(!stopped&&gen===generation&&seq===selectionGeneration&&detailHost){if(!detailFrame)detailHost.replaceChildren();detailHost.append(node('p','Não foi possível carregar as variações salvas. Abra o produto novamente para tentar.','field-help'));}return false;}finally{if(gen===generation&&seq===selectionGeneration){detailPromise=null;detailHost?.setAttribute('aria-busy','false');}}})();detailPromise=task;return task;
 }
 function refreshVariants(itemId,feedback){
  if(stopped||!api||selected!==itemId)return Promise.resolve(false);if(variantRefreshPromise)return variantRefreshPromise;const gen=generation,seq=selectionGeneration;if(detailRefreshButton)detailRefreshButton.disabled=true;feedback.textContent='Conferindo os tamanhos atuais deste produto na Shopee…';
  const task=(async()=>{try{const raw=await api('cost-rules/sync',{item_ids:[itemId],force:true});if(stopped||gen!==generation||seq!==selectionGeneration)return false;if(!raw||!Array.isArray(raw.processed)||raw.processed.length!==1||raw.processed[0]!==itemId||!Array.isArray(raw.cached)||raw.cached.length!==0)throw Error('INVALID');if(promise){await promise;if(stopped||gen!==generation||seq!==selectionGeneration)return false;}const loaded=await refresh();if(stopped||gen!==generation||selected!==itemId)return false;const updated=loaded&&detailFrame?.product.item_id===itemId;el('Message').textContent=updated?'Variações conferidas na Shopee. Os custos usam as regras salvas; o histórico dos tamanhos removidos foi preservado.':'A conferência foi salva. Recarregue o catálogo salvo para consultar as variações atualizadas.';return updated;}catch{if(!stopped&&gen===generation&&seq===selectionGeneration)feedback.textContent='Não foi possível conferir as variações agora. Os custos salvos foram preservados; tente novamente em instantes.';return false;}finally{if(gen===generation){variantRefreshPromise=null;if(detailRefreshButton)detailRefreshButton.disabled=false;}}})();variantRefreshPromise=task;return task;
 }
 function listPath(){return 'product-registry?limit=20&offset='+offset+'&search='+encodeURIComponent(el('Search').value.trim())+'&item_status='+encodeURIComponent(el('Status').value);}
 function clearSourceTimer(){if(sourceTimer!==null){clearTimeout(sourceTimer);sourceTimer=null;}}
 function scheduleSource(){
  clearSourceTimer();if(stopped||document.hidden||!api||!discovery||sourceBusy||backgroundPromise||sourcePaused)return;const now=Date.now(),due=Math.max(discovery.next_run_at*1000,sourceRetryAt);if(discovery.complete&&due>now)return;
  sourceTimer=setTimeout(()=>{sourceTimer=null;return backgroundSync();},Math.max(1000,Math.min(2147483647,due-now)));
 }
 function acceptSyncStatus(raw){const status=Object.getOwnPropertyDescriptor(raw||{},'status')?.value;if(!['PROGRESSED','IDLE','LEASED','PAUSED','ERROR'].includes(status))throw Error('INVALID');sourcePaused=status==='PAUSED';sourceRetryAt=status==='ERROR'?Date.now()+120000:status==='LEASED'?Date.now()+5000:0;return status;}
 async function readBackground(seq){
  const path=listPath(),view=listGeneration,raw=await api(path);if(stopped||seq!==generation)return false;const next=projectProductRegistryFrame(raw);if(!next||next.schema!=='product_registry_v1')throw Error('INVALID');discovery=next.discovery;
  if(!promise&&view===listGeneration&&path===listPath()){frame=next;renderList({preserveDetail:true});globalThis.mlsAgentRegistry?.notify?.();if(detailHost&&detailFrame&&next.products.some(row=>row.item_id===selected&&row.metadata_changed)&&!detailHost.querySelector('[data-catalog-change-warning]')){const warning=node('p','O cadastro deste produto mudou. Os valores exibidos são da conferência anterior; revise o custo após a identificação. Suas escolhas foram preservadas.','field-help');warning.setAttribute('data-catalog-change-warning','true');detailHost.append(warning);}}return true;
 }
 function backgroundSync(){
  if(stopped||document.hidden||!api||backgroundPromise||sourceBusy)return Promise.resolve(false);if(promise){scheduleSource();return Promise.resolve(false);}const seq=generation;
  const task=(async()=>{try{const raw=await api('product-registry/sync',{});if(stopped||seq!==generation)return false;const status=acceptSyncStatus(raw);await readBackground(seq);if(sourcePaused)el('Source').textContent='A atualização automática está pausada nas configurações. Os produtos e custos salvos continuam disponíveis.';return status!=='PAUSED'&&status!=='ERROR';}catch{if(!stopped&&seq===generation){sourceRetryAt=Date.now()+120000;el('Source').textContent='A atualização automática aguarda uma nova tentativa. Os produtos e custos salvos continuam disponíveis.';}return false;}finally{if(seq===generation){backgroundPromise=null;controls();scheduleSource();}}})();backgroundPromise=task;controls();return task;
 }
 function refresh({reset=false}={}){
  if(stopped||!api)return Promise.resolve(false);if(promise)return promise;if(reset)offset=0;const seq=generation,selection=selected,path=listPath();listGeneration++;el('Message').textContent='Lendo o catálogo salvo e os custos atuais…';
  const task=(async()=>{try{const raw=await api(path);if(stopped||seq!==generation)return false;const next=projectProductRegistryFrame(raw);if(!next||next.schema!=='product_registry_v1'||next.pagination.offset!==offset)throw Error('INVALID');frame=next;discovery=next.discovery;globalThis.mlsAgentRegistry?.notify?.();if(selection===selected){const keep=next.products.some(p=>p.item_id===selection);closeDetail();if(keep)selected=selection;}renderList();el('Message').textContent='Catálogo salvo carregado. Os valores usam os custos atuais.';if(selected)await loadDetail();return true;}catch{if(!stopped&&seq===generation)el('Message').textContent='Não foi possível carregar o catálogo salvo. A lista anterior foi preservada; tente novamente.';return false;}finally{if(seq===generation){promise=null;controls();scheduleSource();}}})();promise=task;controls();return task;
 }
 async function sync(){if(stopped||sourceBusy||promise||backgroundPromise)return false;clearSourceTimer();sourcePaused=false;const seq=generation;sourceBusy=true;controls();el('Message').textContent='Consultando a próxima página do cadastro na Shopee…';try{const raw=await api('product-registry/sync',{});if(stopped||seq!==generation)return false;const status=acceptSyncStatus(raw);await refresh();if(seq===generation&&!stopped)el('Message').textContent=status==='PAUSED'?'A atualização está pausada nas configurações. Os produtos salvos continuam disponíveis.':status==='LEASED'?'Outra atualização está em andamento. O cadastro continuará automaticamente.':status==='ERROR'?'A atualização será retomada em instantes. Os produtos salvos foram preservados.':'Cadastro atualizado. A indexação continuará automaticamente até concluir todas as páginas.';return status!=='PAUSED'&&status!=='ERROR';}catch{if(seq===generation&&!stopped){sourceRetryAt=Date.now()+120000;el('Message').textContent='Não foi possível atualizar o cadastro agora. Os produtos salvos foram preservados e a atualização automática tentará novamente.';}return false;}finally{if(seq===generation){sourceBusy=false;controls();scheduleSource();}}}
 document.addEventListener?.('visibilitychange',()=>{if(document.hidden)clearSourceTimer();else scheduleSource();});
 function getSnapshot(){
  if(stopped||frame?.schema!=='product_registry_v1')return null;
  const counts=frame.counts||{},discovery=frame.discovery||{};
  return Object.freeze({schema:'mls_agent_catalog_snapshot_v1',checked_at:frame.checked_at,
   total:Number.isSafeInteger(counts.total)?counts.total:null,
   indexed:Number.isSafeInteger(counts.indexed)?counts.indexed:null,
   pending_catalog:Number.isSafeInteger(counts.pending_catalog)?counts.pending_catalog:null,
   discovery_status:['IDLE','RUNNING','RETRY_WAIT'].includes(discovery.status)?discovery.status:null,
   source:'SAVED_PRODUCT_REGISTRY'});
 }
 globalThis.brazaSavedCatalog={start(options={}){if(!el('List')||typeof options.api!=='function')return Promise.resolve(false);api=options.api;onConfigureCost=typeof options.onConfigureCost==='function'?options.onConfigureCost:null;onAssignRule=typeof options.onAssignRule==='function'?options.onAssignRule:null;generation++;stopped=false;frame=null;discovery=null;promise=null;backgroundPromise=null;variantRefreshPromise=null;sourceBusy=false;sourceRetryAt=0;sourcePaused=false;clearSourceTimer();closeDetail();el('SearchForm').onsubmit=event=>{event.preventDefault();return refresh({reset:true});};el('Refresh').onclick=()=>refresh();el('Status').onchange=()=>refresh({reset:true});el('Previous').onclick=()=>{if(!frame||!frame.pagination.offset||promise)return;offset=Math.max(0,frame.pagination.offset-frame.pagination.limit);return refresh();};el('Next').onclick=()=>{if(!frame?.pagination.more||promise)return;offset=frame.pagination.offset+frame.pagination.limit;return refresh();};el('Sync').onclick=sync;return refresh();},refresh:()=>refresh(),getSnapshot,resume(){sourcePaused=false;sourceRetryAt=0;scheduleSource();},stop(){stopped=true;generation++;promise=null;sourceBusy=false;backgroundPromise=null;variantRefreshPromise=null;clearSourceTimer();closeDetail();}};
})();`;
