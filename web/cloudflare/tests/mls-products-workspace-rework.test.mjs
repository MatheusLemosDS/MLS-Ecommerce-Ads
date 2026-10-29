import test from 'node:test';
import assert from 'node:assert/strict';
import {savedCatalogBody,SAVED_CATALOG_CSS,SAVED_CATALOG_CLIENT} from '../src/saved-catalog-view.mjs';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

test('Products workspace truthfully distinguishes shipped catalog/costs from draft-only Listing Factory and pricing',()=>{
 const html=savedCatalogBody();
 const intro=html.slice(0,html.indexOf('<section id="savedCatalog"'));
 assert.match(intro,/id="productsHub"/);
 assert.match(intro,/aria-labelledby="productsHubTitle"/);
 assert.match(intro,/id="productsHubTitle"/);
 assert.equal((intro.match(/class="products-hub-card"/g)||[]).length,4);
 assert.equal((intro.match(/data-stage="available"/g)||[]).length,2);
 assert.equal((intro.match(/data-stage="review"/g)||[]).length,2);
 assert.match(intro,/Fábrica de Anúncios/);
 assert.match(intro,/Homologação · não publicada/);
 assert.match(intro,/Observer em revisão/);
 assert.match(intro,/Catálogo salvo não é estoque vendável/);
 assert.match(intro,/Ads e PROMO continuam bloqueados/);
 assert.match(intro,/href="#savedCatalog"/);
 assert.match(intro,/href="#legacyProductEditor"/);
 assert.match(intro,/href="\/admin\?tab=margins"/);
 assert.match(intro,/pull\/68/);
 assert.match(intro,/pull\/47/);
 assert.doesNotMatch(intro,/READY_TO_PUBLISH|Preço ideal: R\$|lucro líquido aprovado/i);
 assert.ok(html.indexOf('id="productsHub"')<html.indexOf('id="savedCatalog"'),'hub appears before the real saved catalog');
 assert.match(html,/id="savedCatalogSearchForm"/);
 assert.match(html,/id="savedCatalogSync"/);
 assert.match(SAVED_CATALOG_CSS,/\.mls-products-hub/);
 assert.match(SAVED_CATALOG_CSS,/@media\(max-width:600px\)/);
 assert.match(SAVED_CATALOG_CLIENT,/globalThis\.brazaSavedCatalog/);
 // Existing read/write controls must be retained; this PR only changes visible descriptions.
 for(const forbidden of ['productsHub','products-hub-'])assert.equal(SAVED_CATALOG_CLIENT.includes(forbidden),false);
});
for(const minify of [false,true]){
 test('compiled owner page keeps every Products identifier once, no new provider endpoints (minify='+minify+')',async()=>{
  const {html}=await compiledOwnerReportPage(minify);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,new Set(ids).size,'duplicate owner DOM IDs');
  for(const id of ['products','productsHub','productsHubTitle','savedCatalog','savedCatalogSearch',
    'savedCatalogStatus','savedCatalogList','savedCatalogSync','legacyProductEditor','bindingsForm',
    'variantCards','saveBindings','missionGlobalSearch','commandCenter']){
   assert.equal(ids.includes(id),true,'missing preserved owner node '+id);
  }
  const hub=html.indexOf('id="productsHub"'),catalog=html.indexOf('id="savedCatalog"'),editor=html.indexOf('id="legacyProductEditor"');
  assert.ok(hub>=0&&catalog>hub&&editor>catalog,'Products hub, saved catalog and advanced editor order');
  assert.equal(html.includes('id="mlsListingFactory"'),false,'V3.6 not published in main');
  assert.match(html,/Homologação · não publicada/);
  assert.match(html,/Dados da consulta e referências de custo/);
 });
}
