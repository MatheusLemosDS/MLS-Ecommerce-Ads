import test from 'node:test';
import assert from 'node:assert/strict';
import {CSS,adminBody} from '../src/admin-view.mjs';
import {DTF_CLIENT,dtfBody} from '../src/dtf-view.mjs';
import {SAVED_CATALOG_CLIENT,savedCatalogBody} from '../src/saved-catalog-view.mjs';
import {MLS_APPROVED_DESIGN_CSS} from '../src/approved-design-system.mjs';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

test('merged sources preserve the exact V3.6 saved lookups and the approved Products/DTF workspaces',()=>{
 const source=adminBody();
 assert.match(source,/id="mlsRoadmapHeading"/);
 assert.match(source,/data-mission-scope="products"/);
 assert.match(source,/data-mission-scope="dtf"/);
 assert.match(source,/id="missionSearchExecute"/);
 assert.match(source,/id="missionSearchPageInfo"/);
 assert.ok(CSS.endsWith(MLS_APPROVED_DESIGN_CSS),'approved CSS must be last');
 assert.match(DTF_CLIENT,/function searchLines\(query,offset=0\)/);
 assert.match(DTF_CLIENT,/function findLine\(value\)/);
 assert.match(DTF_CLIENT,/globalThis\.brazaDtfWorkspace=\{start,open,stop,getSnapshot,searchLines,findLine\}/);
 assert.match(SAVED_CATALOG_CLIENT,/async function find\(search\)/);
 assert.match(SAVED_CATALOG_CLIENT,/refresh:\(\)=>refresh\(\),find,getSnapshot/);
 const dtf=dtfBody(),products=savedCatalogBody(),productsWithFactory=savedCatalogBody({listingFactory:true});
 for(const id of ['dtfQueueStage','dtfArtworkStage','dtfFilmStage','dtfPreviewStage','dtfBatchStage'])
  assert.ok(dtf.includes('id="'+id+'"'),'missing DTF step '+id);
 assert.match(products,/id="productsHub"/);
 assert.match(products,/id="savedCatalog"/);
 assert.match(products,/M3 Observador disponível/);
 assert.match(products,/href="\/admin\?tab=agent-products#businessMonthPricingObserver"/);
 assert.match(products,/A preparação aparece quando habilitada para este acesso\./);
 assert.doesNotMatch(products,/href="#mlsListingFactory"/,'the default catalogue must not link to a disabled factory');
 assert.match(productsWithFactory,/Rascunhos locais disponíveis/);
 assert.match(productsWithFactory,/href="#mlsListingFactory"/);
 assert.match(productsWithFactory,/href="\/admin\?tab=agent-products#businessMonthPricingObserver"/);
 assert.doesNotMatch(productsWithFactory,/A preparação aparece quando habilitada para este acesso\./);
 assert.doesNotMatch(products,/Homologação · não publicada|PR separada/);
 assert.doesNotMatch(MLS_APPROVED_DESIGN_CSS,/fetch\(|localStorage|shopee\.com\.br/i);
});

for(const minify of [false,true]){
 test('gated combined owner bundle: OFF does not ship Listing Factory; ON does (minify='+minify+')',async()=>{
  const off=(await compiledOwnerReportPage(minify,{ownerPreview:false})).html;
  const on=(await compiledOwnerReportPage(minify,{ownerPreview:true})).html;
  assert.match(off,/id="missionGlobalSearch" data-mls-v36-preview="disabled"/);
  assert.doesNotMatch(off,/id="mlsListingFactory"/);
  assert.doesNotMatch(off,/data-mission-scope="products"/);
  assert.doesNotMatch(off,/data-mission-scope="dtf"/);
  assert.match(off,/id="productsHub"/);
  assert.doesNotMatch(off,/href="#mlsListingFactory"/);
  assert.match(off,/href="\/admin\?tab=agent-products#businessMonthPricingObserver"/);
  assert.match(off,/id="dtfHeroTitle"/);
  assert.match(off,/id="mlsRoadmapHeading"/);
  assert.match(off,/--mls-finance/);
  assert.match(on,/id="missionGlobalSearch" data-mls-v36-preview="enabled"/);
  assert.match(on,/id="mlsListingFactory"/);
  assert.match(on,/data-mission-scope="products"/);
  assert.match(on,/data-mission-scope="dtf"/);
  assert.match(on,/id="productsHub"/);
  assert.match(on,/href="#mlsListingFactory"/);
  assert.match(on,/href="\/admin\?tab=agent-products#businessMonthPricingObserver"/);
  assert.match(on,/id="dtfHeroTitle"/);
  assert.match(on,/id="mlsRoadmapHeading"/);
  assert.match(on,/--mls-finance/);
  const unique=html=>{
   const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
   assert.equal(ids.length,new Set(ids).size,'duplicate DOM id in merged owner');
  };
  unique(off);unique(on);
  assert.equal((on.match(/id="mlsListingFactory"/g)||[]).length,1);
 });
}
