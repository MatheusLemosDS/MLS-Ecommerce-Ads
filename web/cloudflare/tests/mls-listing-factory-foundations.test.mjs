import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,symlinkSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {planMlsListingFactory} from '../src/mls-listing-factory-planner.mjs';
import {MLS_SHOPEE_FEATURES,auditMlsShopeeCapabilities} from '../src/mls-shopee-capability-audit.mjs';
import {planMlsLostPushRecovery} from '../src/mls-lost-push-recovery.mjs';
import {inspectLocalListingImage,buildLocalListingReview} from '../../../tools/mls_listing_factory_cli.mjs';

const image=(name='a.png')=>({name,mime:'image/png',width:1024,height:1024,
 size_bytes:120000,sha256:'a'.repeat(64),inspection:'HEADER_ONLY_SHA256'});
const variants=()=>[{sku:'ART100-P',size:'P',price_cents:4990,stock_quantity:null},
 {sku:'ART100-M',size:'M',price_cents:4990,stock_quantity:10}];
const item=(ref='art-01')=>({client_ref:ref,
 title:'Camiseta retrô original de qualidade para presente',
 description:'Camiseta estampada feita sob encomenda, confira tabela de medidas antes da compra.',
 images:['a.png','b.png','c.png','d.png','e.png'],variants:variants()});
const source=()=>({schema:'mls_listing_factory_input_v1',marketplace:'SHOPEE_BR',items:[item()]});
const media=()=>Object.fromEntries(['a','b','c','d','e'].map(key=>[key+'.png',image(key+'.png')]));
test('stages real metadata as DRAFT ONLY, never returns marketplace publishing authorization',()=>{
 const actual=planMlsListingFactory(source(),media());
 assert.ok(actual);assert.equal(actual.summary.ready_for_review,1);
 assert.equal(actual.summary.batches,1);assert.equal(actual.products[0].images.length,5);
 assert.equal(actual.products[0].status,'READY_FOR_OPERATOR_REVIEW');
 assert.deepEqual(actual.products[0].warnings,['STOCK_UNVERIFIED']);
 assert.equal(actual.products[0].seller_publication_allowed,false);
 assert.equal(actual.batches[0].submit_allowed,false);
 assert.equal(actual.execution_allowed,false);
 assert.equal(actual.api_permission_verified,false);
 assert.equal(actual.products[0].variants[0].stock_quantity,null);
 assert.equal(actual.products[0].images[0].inspection,'HEADER_ONLY_SHA256');
});
test('incomplete mockups and unknown image contents remain corrections instead of fake valid images',()=>{
 const set=media();delete set['e.png'];const a=planMlsListingFactory(source(),set);
 assert.equal(a.products[0].status,'NEEDS_CORRECTION');
 assert.ok(a.products[0].errors.includes('IMAGE_NOT_VERIFIED_OR_UNAVAILABLE'));
 const b=media();b['c.png']={...b['c.png'],width:480};
 assert.ok(planMlsListingFactory(source(),b).products[0].errors.includes('IMAGE_BELOW_500_PX_INTERNAL_RULE'));
 const c=media();c['c.png']={...c['c.png'],width:640};
 assert.ok(planMlsListingFactory(source(),c).products[0].errors.includes('IMAGE_NOT_SQUARE_INTERNAL_RULE'));
});
test('rejects malformed schema, prototype keys, duplicate IDs, fake prices, ambiguous SKU and extra fields',()=>{
 for(const mutate of [
  a=>{a.marketplace='ANY';},a=>{a.items[0].client_ref='../escape';},
  a=>{a.items.push({...a.items[0]});},
  a=>{a.items[0].variants[0].price_cents=49.90;},
  a=>{a.items[0].variants[0].sku='ART100-M';},
  a=>{a.items[0].images[0]='../../secret.png';},
  a=>{a.items[0].unexpected='value';}
 ]){
  const input=source();mutate(input);const result=planMlsListingFactory(input,media());
  assert.ok(result===null||result.summary.needs_correction>0,'invalid inputs never get a ready listing');
 }
});
test('splits 205 verified draft items into 100,100,5 without performing any network or file writes',()=>{
 const src={schema:'mls_listing_factory_input_v1',marketplace:'SHOPEE_BR',items:[]};
 const photos=media();
 for(let i=0;i<205;i++){
  const next=item('art-'+String(i+1));
  next.variants=next.variants.map((v,index)=>({...v,sku:'ART'+i+'-'+index}));
  src.items.push(next);
 }
 const result=planMlsListingFactory(src,photos);
 assert.deepEqual(result.batches.map(x=>x.client_refs.length),[100,100,5]);
 assert.equal(result.summary.items,205);
 assert.equal(result.summary.ready_for_review,205);
 assert.equal(result.execution_allowed,false);
});
test('capabilities are unknown by default, explicit grant still never enables posting or protected reads',()=>{
 const missing=auditMlsShopeeCapabilities();
 assert.equal(missing.features.length,MLS_SHOPEE_FEATURES.length);
 assert.ok(missing.features.every(r=>r.status==='UNKNOWN'&&!r.write_allowed));
 const evidence={schema:'mls_shopee_capability_evidence_v1',marketplace:'SHOPEE_BR',
  checked_at:1800000000,evidence:[
   {feature:'PRODUCT_BATCH_CREATE',status:'GRANTED',source:'OPERATOR_CONFIRMED',checked_at:1799999999},
   {feature:'PAYMENT_ESCROW_BATCH',status:'GRANTED',source:'OFFICIAL_RESPONSE',checked_at:1799999999}
  ]};
 const result=auditMlsShopeeCapabilities(evidence);
 assert.equal(result.features.find(x=>x.feature==='PRODUCT_BATCH_CREATE').write_allowed,false);
 assert.equal(result.features.find(x=>x.feature==='PAYMENT_ESCROW_BATCH').read_integration_ready,false);
 assert.equal(auditMlsShopeeCapabilities({...evidence,access_token:'sensitive'}),null);
 assert.equal(auditMlsShopeeCapabilities({...evidence,evidence:[...evidence.evidence,evidence.evidence[0]]}),null);
});
test('lost push plans deduplicate and never acknowledge events even when all are already saved',()=>{
 const example={schema:'mls_lost_push_observation_v1',source:'PROVIDER_LOST_PUSH_PAGINATED_READ',
  last_message_id:'M01',has_next_page:true,
  messages:[{message_id:'M01',event_code:3,observed_at:1790000000},
   {message_id:'M01',event_code:3,observed_at:1790000000},
   {message_id:'M02',event_code:8,observed_at:1790000001}],persisted_ids:['M01']};
 const plan=planMlsLostPushRecovery(example);
 assert.equal(plan.pending_count,1);assert.equal(plan.duplicate_count,1);
 assert.equal(plan.already_persisted_count,1);assert.equal(plan.confirm_consumed_allowed,false);
 assert.equal(plan.provider_request_allowed,false);
 assert.equal(plan.pending[0].message_id,'M02');
 assert.equal(planMlsLostPushRecovery({...example,has_next_page:'false'}),null);
});
function png(w=1024,h=1024){
 const buf=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(buf);
 buf.writeUInt32BE(13,8);buf.write('IHDR',12,'ascii');buf.writeUInt32BE(w,16);buf.writeUInt32BE(h,20);
 buf[24]=8;buf[25]=2;return buf;
}
test('CLI observes local media headers and writes only a deterministic draft manifest',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'mls-factory-test-')),assets=path.join(root,'artes');
 mkdirSync(assets);
 for(const key of ['a','b','c','d','e'])writeFileSync(path.join(assets,key+'.png'),png());
 assert.equal(inspectLocalListingImage(assets,'a.png').width,1024);
 assert.equal(inspectLocalListingImage(assets,'../secret.png'),null);
 writeFileSync(path.join(assets,'z.png'),Buffer.from('not a PNG'));
 assert.equal(inspectLocalListingImage(assets,'z.png'),null);
 const external=path.join(root,'secret.png');writeFileSync(external,png());
 try{symlinkSync(external,path.join(assets,'linked.png'));
  assert.equal(inspectLocalListingImage(assets,'linked.png'),null);}catch{}
 const preview=buildLocalListingReview(source(),assets);assert.equal(preview.summary.ready_for_review,1);
 const manifest=path.join(root,'listings.json'),output=path.join(root,'report.json');
 writeFileSync(manifest,JSON.stringify(source()));
 const cli=fileURLToPath(new URL('../../../tools/mls_listing_factory_cli.mjs',import.meta.url));
 const run=spawnSync(process.execPath,[cli,manifest,assets,output],{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 const final=JSON.parse(readFileSync(output,'utf8'));
 assert.equal(final.summary.ready_for_review,1);assert.equal(final.products[0].images.length,5);
 assert.ok(!JSON.stringify(final).includes(assets),'manifest never reveals absolute local paths');
 assert.equal(final.execution_allowed,false);
});
test('refuses token-like manifest fields, missing files and impossible payloads without touching provider',()=>{
 const root=mkdtempSync(path.join(tmpdir(),'mls-bad-factory-test-'));
 const assets=path.join(root,'assets');mkdirSync(assets);
 const wrong=source();wrong.access_token='SECRET';
 const review=buildLocalListingReview(wrong,assets);assert.equal(review,null);
 assert.equal(planMlsListingFactory({schema:'mls_listing_factory_input_v1',marketplace:'SHOPEE_BR',items:[]},{}),null);
 const incomplete=buildLocalListingReview(source(),assets);
 assert.equal(incomplete.summary.needs_correction,1);
});
