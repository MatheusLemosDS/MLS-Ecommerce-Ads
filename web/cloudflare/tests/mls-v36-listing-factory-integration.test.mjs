import test from 'node:test';
import assert from 'node:assert/strict';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {MLS_LISTING_FACTORY_CLIENT} from '../src/mls-listing-factory-view.mjs';
import {CLIENT} from '../src/admin-client.mjs';
import {SAVED_CATALOG_CLIENT} from '../src/saved-catalog-view.mjs';
import {DTF_CLIENT} from '../src/dtf-view.mjs';

test('V3.6 search and Listing Factory integrate without creating Shopee writes or duplicated client modules',()=>{
 assert.match(CLIENT,/const missionSearchRoutes=Object\.freeze/);
 assert.match(CLIENT,/async function searchRecords\(offset=0\)/);
 assert.match(CLIENT,/globalThis\.brazaSavedCatalog\?\.find\?\.\(item\.productId\)/);
 assert.match(CLIENT,/searchRecords\(currentOffset\+8\)/);
 assert.match(CLIENT,/event\.key==='Enter'/);
 assert.match(CLIENT,/key==='k'/);
 assert.match(SAVED_CATALOG_CLIENT,/globalThis\.brazaSavedCatalog/);
 assert.match(DTF_CLIENT,/globalThis\.brazaDtfWorkspace/);
 assert.match(MLS_LISTING_FACTORY_CLIENT,/planMlsDraftBatchMedia\(manifest,scanned\.map/);
 for(const forbidden of ['fetch(', 'XMLHttpRequest','localStorage','sessionStorage','indexedDB',
  'navigator.sendBeacon','/api/admin/','v2.product.batch_add_item']){
  assert.equal(MLS_LISTING_FACTORY_CLIENT.includes(forbidden),false,'Listing Factory must have no provider/backend I/O: '+forbidden);
 }
});
for(const minify of [false,true]){
 test('combined owner '+(minify?'minified':'normal')+' ships scope search, DTF queue, saved catalog and offline editor together',async()=>{
  const {html}=await compiledOwnerReportPage(minify);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(ids.length,new Set(ids).size,'no duplicate DOM IDs');
  const productTab=html.indexOf('<section id="products" hidden>'),
   factory=html.indexOf('id="mlsListingFactory"'),
   catalog=html.indexOf('id="savedCatalog"');
  assert.ok(productTab>=0&&factory>productTab&&catalog>factory);
  for(const id of ['missionGlobalSearch','missionSearchExecute','missionSearchMore',
   'missionSearchInput','missionSearchResults','dtfQueue','mlsLfBatchFiles',
   'mlsLfBatchFolder','mlsLfExportManifest','mlsLfExportReview'])
    assert.ok(html.includes('id="'+id+'"'),'missing owner control '+id);
  for(const scope of ['navigation','products','dtf'])
    assert.ok(html.includes('data-mission-scope="'+scope+'"'),'missing V3.6 search scope '+scope);
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
  assert.equal(scripts.length,14,'retain the existing 13 owner scripts plus one Listing Factory script');
  const factoryClients=scripts.filter(x=>x.includes("const root=document.getElementById('mlsListingFactory')"));
  const searchClients=scripts.filter(x=>x.includes('const missionSearchRoutes=Object.freeze'));
  assert.equal(factoryClients.length,1);
  assert.equal(searchClients.length,1);
  assert.match(factoryClients[0],/function planMlsListingFactory\(input,mediaIndex\)/);
  assert.match(factoryClients[0],/function planMlsDraftBatchMedia\(manifest,observed\)/);
  assert.doesNotMatch(factoryClients[0],/\/\*__MLS_LISTING_FACTORY_CORE__\*\//);
  assert.doesNotMatch(factoryClients[0],/fetch\(|XMLHttpRequest|sendBeacon|\/api\/admin\//);
  assert.match(searchClients[0],/async function searchRecords\(offset=0\)/);
 });
}
