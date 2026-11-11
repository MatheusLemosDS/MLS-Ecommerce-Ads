import {getOrderedBrowserScripts} from './browser-assets-http-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

const scriptCount=html=>getOrderedBrowserScripts(html).length;
const checkUniqueIds=html=>{
 const ids=[...html.matchAll(/id="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(new Set(ids).size,ids.length,'owner HTML must never reuse an element ID');
};

for(const minify of [false,true]){
 test('V3.6 release switch defaults OFF, preserving existing owner tools (minify='+minify+')',async()=>{
  const {html}=await compiledOwnerReportPage(minify,{ownerPreview:false});
  checkUniqueIds(html);
  assert.match(html,/id="missionGlobalSearch" data-mls-v36-preview="disabled"/);
  assert.match(html,/data-mission-scope="navigation"/);
  assert.doesNotMatch(html,/data-mission-scope="products"|data-mission-scope="dtf"/);
  assert.match(html,/id="savedCatalog"/);
  assert.match(html,/id="missionSearchOpen"/);
  assert.match(html,/id="businessMonthSelect"/);
  assert.doesNotMatch(html,/id="mlsListingFactory"|id="mlsLfBatchFiles"|id="mlsLfFiles"/);
  assert.equal(html.includes("const root=document.getElementById('mlsListingFactory')"),false);
  assert.equal(html.includes('.mls-lf-head'),false,'no editor CSS when disabled');
  assert.equal(scriptCount(html),17,'V3.6 off retains physical returns and the weekly report without shipping the editor script');
  assert.equal(getOrderedBrowserScripts(html).filter(script=>script.includes('globalThis.brazaWeeklyOperating=')).length,1,'the shared weekly report is delivered exactly once with the editor disabled');
  assert.equal(getOrderedBrowserScripts(html).filter(script=>script.includes('globalThis.brazaPhysicalReturns=')).length,1,'physical returns remains independent of the editor flag');
 });
 test('V3.6 exact owner opt-in ships draft editor and record search (minify='+minify+')',async()=>{
  const {html}=await compiledOwnerReportPage(minify,{ownerPreview:true});
  checkUniqueIds(html);
  assert.match(html,/id="missionGlobalSearch" data-mls-v36-preview="enabled"/);
  assert.match(html,/data-mission-scope="navigation"/);
  assert.match(html,/data-mission-scope="products"/);
  assert.match(html,/data-mission-scope="dtf"/);
  assert.match(html,/id="mlsListingFactory"/);
  assert.match(html,/id="mlsLfBatchFiles"/);
  assert.match(html,/id="savedCatalog"/);
  assert.equal(scriptCount(html),18,'draft-only editor is delivered only with exact opt-in');
  assert.equal(getOrderedBrowserScripts(html).filter(script=>script.includes('globalThis.brazaWeeklyOperating=')).length,1,'editor opt-in cannot duplicate or remove the shared weekly report');
  assert.equal(getOrderedBrowserScripts(html).filter(script=>script.includes('globalThis.brazaPhysicalReturns=')).length,1,'editor opt-in cannot duplicate the physical-return controller');
 });
}

test('malformed, whitespace and lowercase flag values fail closed',async()=>{
 for(const value of ['enabled','ENABLED ','true','1','OWNER_PREVIEW']){
  const {html}=await compiledOwnerReportPage(false,{flagValue:value});
  assert.match(html,/data-mls-v36-preview="disabled"/);
  assert.doesNotMatch(html,/id="mlsListingFactory"/);
  assert.doesNotMatch(html,/data-mission-scope="products"|data-mission-scope="dtf"/);
 }
});
