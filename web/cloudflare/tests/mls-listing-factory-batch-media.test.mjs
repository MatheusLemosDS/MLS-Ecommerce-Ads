import test from 'node:test';
import assert from 'node:assert/strict';
import {planMlsDraftBatchMedia} from '../src/mls-listing-factory-planner.mjs';

const photo=name=>({name,mime:'image/png',width:1024,height:1024,size_bytes:55000,
 sha256:name.charCodeAt(0).toString(16).padStart(2,'0').repeat(32),inspection:'HEADER_ONLY_SHA256'});
const names=['a.png','b.png','c.png','d.png','e.png'];
const manifest=(count=2)=>({schema:'mls_listing_factory_input_v1',marketplace:'SHOPEE_BR',
 items:Array.from({length:count},(_,i)=>({
  client_ref:'retro-'+String(i+1).padStart(3,'0'),
  title:'Camiseta retrô de qualidade modelo '+i+' para adultos',
  description:'Camiseta estampada. Verifique todas as medidas antes de comprar.',
  images:names.slice(),
  variants:[{sku:'RETRO-'+i+'-M',size:'M',price_cents:4990,stock_quantity:null}]
 }))});

test('one set of five real metadata frames can be matched to 19 imported drafts without faking original-file attestation',()=>{
 const plan=planMlsDraftBatchMedia(manifest(19),names.map(photo));
 assert.ok(plan);assert.equal(plan.schema,'mls_listing_batch_media_relink_v1');
 assert.equal(plan.mode,'LOCAL_ONLY');assert.equal(plan.execution_allowed,false);
 assert.equal(plan.published,false);assert.equal(plan.owner_review_required,true);
 assert.equal(plan.selected_count,5);assert.equal(plan.matched_unique_files,5);
 assert.equal(plan.matched_item_count,19);assert.equal(plan.reused_across_items,90);
 assert.equal(plan.per_item.length,19);
 assert.ok(plan.per_item.every(r=>r.matched_names.length===5&&r.not_in_selection.length===0));
 assert.match(plan.match_basis,/NOT_ORIGINAL_HASH_ATTESTATION/);
});
test('partial selection reports unmatched references and never claims they are present',()=>{
 const partial=planMlsDraftBatchMedia(manifest(2),names.slice(0,4).map(photo));
 assert.equal(partial.matched_unique_files,4);
 assert.equal(partial.matched_item_count,2);
 assert.deepEqual(partial.per_item[0].not_in_selection,['e.png']);
 assert.deepEqual(partial.per_item[1].not_in_selection,['e.png']);
 const unused=planMlsDraftBatchMedia(manifest(),[photo('a.png'),photo('extra.png')]);
 assert.deepEqual(unused.unused_names,['extra.png']);
 assert.equal(unused.matched_item_count,2);
});
test('ambiguous names, malformed metadata, huge selections and invalid manifests fail closed',()=>{
 const seed=manifest();
 const scenarios=[
  [seed,[photo('a.png'),photo('a.png')]],
  [seed,[photo('a.png'),{...photo('a.png'),sha256:'f'.repeat(64)}]],
  [seed,[{...photo('a.png'),size_bytes:2097153}]],
  [seed,[{...photo('a.png'),width:0}]],
  [seed,[{...photo('a.png'),inspection:'ASSUMED'}]],
  [seed,[photo('unmatched.png')]],
  [seed,[]],
  [seed,Array.from({length:201},(_,i)=>photo('image'+i+'.png'))],
  [seed,[{...photo('a.png'),unexpected:'token'}]]
 ];
 for(const [input,images] of scenarios)assert.equal(planMlsDraftBatchMedia(input,images),null);
 const bad=manifest();bad.access_token='sensitive';
 assert.equal(planMlsDraftBatchMedia(bad,[photo('a.png')]),null);
 const duplicated=manifest();duplicated.items[0].images=['a.png','a.png'];
 assert.equal(planMlsDraftBatchMedia(duplicated,[photo('a.png')]),null);
});
test('manual inventory unknown and declared price never mutate in the filename matcher',()=>{
 const input=manifest(1),previous=JSON.stringify(input),files=names.map(photo),original=JSON.stringify(files);
 const result=planMlsDraftBatchMedia(input,files);
 assert.equal(result.per_item[0].client_ref,'retro-001');
 assert.equal(JSON.stringify(input),previous);
 assert.equal(JSON.stringify(files),original);
 assert.equal(input.items[0].variants[0].stock_quantity,null);
 assert.equal(input.items[0].variants[0].price_cents,4990);
});
test('500 draft rows remain bounded and use local metadata only',()=>{
 const plan=planMlsDraftBatchMedia(manifest(500),names.map(photo));
 assert.ok(plan);
 assert.equal(plan.matched_item_count,500);
 assert.equal(plan.reused_across_items,2495);
 assert.equal(plan.per_item.length,500);
 assert.equal(plan.execution_allowed,false);
});
