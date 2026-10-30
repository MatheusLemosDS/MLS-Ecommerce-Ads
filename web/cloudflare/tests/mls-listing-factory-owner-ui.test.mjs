import test from 'node:test';
import assert from 'node:assert/strict';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {MLS_LISTING_FACTORY_CSS,mlsListingFactoryBody,MLS_LISTING_FACTORY_CLIENT} from '../src/mls-listing-factory-view.mjs';

test('owner Listing Factory presents a draft-only form with separated size pricing and upload-free review',()=>{
 const html=mlsListingFactoryBody();
 for(const key of ['mlsListingFactory','mlsLfForm','mlsLfFiles','mlsLfVariants','mlsLfDrafts','mlsLfImport','mlsLfBatchFiles','mlsLfBatchFolder','mlsLfBatchStatus','mlsLfPrevious','mlsLfPage','mlsLfNext','mlsLfExportManifest','mlsLfExportReview','mlsLfReplaceSkus'])
  assert.match(html,new RegExp('id="'+key+'"'));
 assert.match(html,/SEM PUBLICAÇÃO/);
 assert.doesNotMatch(html,/id="mlsLfPrice"[^>]*\bvalue=/,'price must come from operator, never preset');
 assert.match(html,/manifesto MLS|Retomar anúncios/);
 assert.match(MLS_LISTING_FACTORY_CLIENT,/by\('Import'\)\.addEventListener\('change'/);
 assert.match(MLS_LISTING_FACTORY_CLIENT,/const pageSize=8;/);
 assert.match(MLS_LISTING_FACTORY_CLIENT,/async function reattachBatch\(picker\)/);
 assert.match(MLS_LISTING_FACTORY_CLIENT,/selected\.length>200/);
 assert.match(MLS_LISTING_FACTORY_CLIENT,/bytes>64\*1024\*1024/);
 assert.match(MLS_LISTING_FACTORY_CLIENT,/planMlsDraftBatchMedia\(manifest,scanned\.map/);
 assert.match(MLS_LISTING_FACTORY_CLIENT,/state\.drafts\.slice\(first,first\+pageSize\)/);
 assert.match(MLS_LISTING_FACTORY_CSS,/@media\(max-width:700px\)/);
 assert.match(MLS_LISTING_FACTORY_CLIENT,/__MLS_LISTING_FACTORY_CORE__/);
 for(const forbidden of ['fetch(','XMLHttpRequest','WebSocket(','sendBeacon(','localStorage','sessionStorage','indexedDB','/api/admin/'])
  assert.equal(MLS_LISTING_FACTORY_CLIENT.includes(forbidden),false,'unexpected I/O '+forbidden);
});
for(const minify of [false,true]){
 test('compiled '+(minify?'minified':'normal')+' owner HTML embeds same canonical Listing Factory planner once',async()=>{
  const {html}=await compiledOwnerReportPage(minify);
  const products=html.indexOf('<section id="products" hidden>');
  const factory=html.indexOf('id="mlsListingFactory"'),catalog=html.indexOf('id="savedCatalog"');
  assert.ok(products>=0&&factory>products&&catalog>factory,'new editor inserted inside Products above saved catalog');
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
  const clients=scripts.filter(s=>s.includes("const root=document.getElementById('mlsListingFactory')"));
  assert.equal(clients.length,1);
  assert.match(clients[0],/function planMlsListingFactory\(input,mediaIndex\)/);
  assert.match(clients[0],/function planMlsDraftBatchMedia\(manifest,observed\)/);
  assert.match(clients[0],/function planMlsListingVariantRows\(sizes,originals=/);
  assert.match(clients[0],/function generateMlsListingSku\(prefix,size\)/);
  assert.doesNotMatch(clients[0],/__MLS_LISTING_FACTORY_CORE__/);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const forbidden of ['fetch(','XMLHttpRequest','localStorage','indexedDB'])
   assert.equal(clients[0].includes(forbidden),false,'browser UI is network-free: '+forbidden);
 });
}
