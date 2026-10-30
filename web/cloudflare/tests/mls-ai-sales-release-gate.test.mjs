import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

for(const minify of [false,true]){
 test('AI Sales has independent OFF default and exact authenticated owner preview (minify='+minify+')',async()=>{
  const off=await compiledOwnerReportPage(minify,{ownerPreview:false});
  assert.doesNotMatch(off.html,/id="ai-sales"|id="aiSalesTitle"|data-tab="ai-sales"/);
  assert.equal(off.html.includes('.mls-ai-sales'),false);
  assert.equal(off.html.includes('const MlsAiSalesCore='),false);
  assert.doesNotMatch(off.headers['content-security-policy'],/media-src/);
  const on=await compiledOwnerReportPage(minify,{ownerPreview:false,aiSalesPreview:true});
  assert.match(on.html,/id="ai-sales"/);
  assert.match(on.html,/data-tab="ai-sales"/);
  assert.doesNotMatch(on.html,/id="mlsListingFactory"/,'AI preview cannot enable other release flags');
  assert.match(on.headers['content-security-policy'],/media-src 'self' blob:/);
  const ids=[...on.html.matchAll(/\bid="([^"]*)"/g)].map(x=>x[1]);
  assert.equal(ids.length,new Set(ids).size,'unique native IDs');
  for(const script of [...on.html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]))new vm.Script(script);
  const client=[...on.html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(s=>s.includes('const MlsAiSalesCore='));
  assert.ok(client);assert.doesNotMatch(client,/__MLS_AI_SALES_(?:CORE|UI_OPERATIONS)__/);
  assert.doesNotMatch(client,/node:child_process|execFile(?:Sync)?\(|spawn\(/,'server executables cannot ship in browser');
 });
}
test('AI Sales malformed release flags fail closed independently',async()=>{
 for(const value of ['enabled','ENABLED ','true','1',true]){
  const {html}=await compiledOwnerReportPage(false,{aiSalesFlagValue:value});
  assert.doesNotMatch(html,/id="ai-sales"|id="aiSalesTitle"|data-tab="ai-sales"/);
  assert.match(html,/id="mlsListingFactory"/,'existing preview remains independent');
 }
});
