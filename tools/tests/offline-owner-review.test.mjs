import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOfflineOwnerReview,REVIEW_SECTIONS} from '../build_offline_owner_review.mjs';
import {compiledOwnerReportPage} from '../../web/cloudflare/tests/owner-report-browser-fixture.mjs';

const sample=()=>{
 const sections=REVIEW_SECTIONS.map(([id])=>'<section id="'+id+'" hidden><h2>'+id+'</h2></section>').join('');
 return '<!doctype html><html><head><style>body{background:#000}@import url(https://example.com/bad.css);.box{background:url(//external.invalid/x.png)}</style></head><body><main class="workspace">'+sections+
  '<script>window.fetch("https://example.com/private")</script>'+
  '<a href="https://example.com/exit">remote</a><a href="/admin?tab=agent-finance">Finance</a>'+
  '<img src="https://example.com/screenshot"><iframe src="https://example.com/private"></iframe>'+
  '<form method="POST" action="/api/delete" hidden onsubmit="alert(1)"><button onclick="alert(1)">Excluir</button><input value="fixture"></form>'+
  '</main></body></html>';
};
test('offline review strips app JS, remote URLs, forms and write controls',()=>{
 const html=buildOfflineOwnerReview(sample());
 assert.match(html,/data-qa-preview="off"/);
 assert.match(html,/script-src &#39;none&#39;/);
 assert.match(html,/connect-src &#39;none&#39;/);
 assert.match(html,/href="#agent-finance"/);
 assert.match(html,/href="#review-unavailable"/);
 assert.match(html,/disabled="disabled"/);
 assert.match(html,/class="review-inert-form" data-review-form="disabled" hidden/);
 assert.match(html,/QA SINTÉTICA · SEM DADOS REAIS/);
 assert.doesNotMatch(html,/<script\b|<iframe\b|<form\b|<img\b|<link\b/);
 assert.doesNotMatch(html,/href="https?:|action=|onsubmit=|onclick=|https:\/\/example/);
 assert.doesNotMatch(html,/@import/);
 assert.doesNotMatch(html,/url\(/);
 for(const [id] of REVIEW_SECTIONS)assert.ok(html.includes('href="#'+id+'"'));
});

test('offline preview mode labels cannot be confused with a real Cloudflare rollout',()=>{
 const off=buildOfflineOwnerReview(sample(),{previewEnabled:false});
 const on=buildOfflineOwnerReview(sample(),{previewEnabled:true});
 assert.match(off,/V3\.6 desligada/);
 assert.match(on,/V3\.6 habilitada apenas nesta simulação/);
 for(const page of [off,on]){
  assert.match(page,/Somente prévia de layout/);
  assert.match(page,/Sem JavaScript da loja, APIs, login, uploads, pedidos reais ou publicação/);
  assert.match(page,/main\.workspace>section:target/);
 }
});

test('offline review rejects incomplete or untrusted owner sources',()=>{
 assert.throws(()=>buildOfflineOwnerReview('arbitrary HTML'),/REVIEW_SOURCE_NOT_OWNER/);
 assert.throws(()=>buildOfflineOwnerReview('<div class="workspace"></div>'),/REVIEW_BODY_NOT_FOUND/);
 assert.throws(()=>buildOfflineOwnerReview('<body><main class="workspace">x</main></body>'),/REVIEW_STYLE_NOT_FOUND/);
 assert.throws(()=>buildOfflineOwnerReview('<style></style><body><main class="workspace">x</main></body>'),/REVIEW_MISSING_SECTION/);
});

test('real compiled owner OFF/ON can be reviewed with zero app scripts, no live data and 15 panels',{timeout:45000},async()=>{
 for(const enabled of [false,true]){
  const {html}=await compiledOwnerReportPage(false,{ownerPreview:enabled});
  const preview=buildOfflineOwnerReview(html,{previewEnabled:enabled});
  for(const [id] of REVIEW_SECTIONS){
   assert.ok(preview.includes('id="'+id+'"'),'missing compiled panel '+id);
   assert.ok(preview.includes('href="#'+id+'"'),'missing navigation '+id);
  }
  assert.ok(preview.includes('data-qa-preview="'+(enabled?'on':'off')+'"'));
  assert.ok(preview.includes('--mls-finance'),'approved color system lost');
  assert.equal(preview.includes('id="mlsListingFactory"'),enabled,
   'V3.6 editor visibility must match owner-preview flag');
  assert.doesNotMatch(preview,/<script\b|<form\b|<iframe\b|<img\b/);
  assert.doesNotMatch(preview,/\bhref="https?:|\bhref="\/admin|\bonclick=|\baction=/);
 }
});
