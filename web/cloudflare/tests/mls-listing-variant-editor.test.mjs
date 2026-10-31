import test from 'node:test';
import assert from 'node:assert/strict';
import {planMlsListingVariantRows,generateMlsListingSku,planMlsListingFactory} from '../src/mls-listing-factory-planner.mjs';

test('editor identities retain arbitrary SKUs, original case, order and duplicate size labels',()=>{
 const originals=[{size:'m',sku:'retro/vermelho.M-27'},{size:'P/M',sku:'s'.repeat(80)},
  {size:'M',sku:'OUTRO_azul'}, {size:'P + G3',sku:'viva-27+viva-27'}];
 const before=structuredClone(originals),rows=planMlsListingVariantRows(['M','P/M','P + G3'],originals);
 assert.deepEqual(rows,originals.map((row,index)=>({key:'saved-'+index,...row,original:true})));
 assert.deepEqual(originals,before);assert.equal(rows[0].sku,'retro/vermelho.M-27');
 assert.equal(rows[1].sku.length,80);assert.notEqual(rows[0].key,rows[2].key);
 const removed=planMlsListingVariantRows(['P/M','P + G3'],originals);
 assert.deepEqual(removed.map(row=>row.key),['saved-1','saved-3']);
 assert.deepEqual(planMlsListingVariantRows(['M','P/M','P + G3','G2'],originals).at(-1),
  {key:'new-G2',size:'G2',sku:null,original:false});
});

test('only explicit generation uses a prefix and compound labels never corrupt a recovered SKU',()=>{
 assert.equal(generateMlsListingSku('retro2000','P/M'),'RETRO2000-P-M');
 assert.equal(generateMlsListingSku('novo','P + G3'),'NOVO-P-G3');
 assert.equal(generateMlsListingSku('novo','Único'),'NOVO-UNICO');
 assert.equal(planMlsListingVariantRows(['P/M'],[{size:'P/M',sku:'RETRO-P-M'}])[0].sku,'RETRO-P-M');
 for(const [prefix,size] of [['','P'],['a'.repeat(61),'P'],['bad prefix','P'],['ok','<img>'],['ok','   ']])
  assert.equal(generateMlsListingSku(prefix,size),null);
 // Distinct compound labels may normalize to the same generated suffix. The
 // UI must reject bulk replacement atomically instead of changing saved SKUs.
 assert.equal(generateMlsListingSku('novo','P/M'),generateMlsListingSku('novo','P + M'));
});

test('variant row planning rejects ambiguous selections and malformed input without invoking getters',()=>{
 const original=[{size:'M',sku:'SKU-M'}];
 for(const sizes of [['M','m'],[''],['M',undefined],Array(1),Array.from({length:33},(_,i)=>String(i))])
  assert.equal(planMlsListingVariantRows(sizes,original),null);
 assert.equal(planMlsListingVariantRows(['M'],[{size:'M',sku:'same'},{size:'M',sku:'same'}]),null);
 assert.equal(planMlsListingVariantRows(['M'],[{size:'M',sku:'x'.repeat(81)}]),null);
 assert.equal(planMlsListingVariantRows(['M'],[{size:'M',sku:'ok',token:'secret'}]),null);
 let reads=0;const hostile={size:'M'};Object.defineProperty(hostile,'sku',{enumerable:true,get(){reads++;return 'bad';}});
 assert.equal(planMlsListingVariantRows(['M'],[hostile]),null);assert.equal(reads,0);
 const array=[];Object.defineProperty(array,'0',{enumerable:true,get(){reads++;return 'M';}});array.length=1;
 assert.equal(planMlsListingVariantRows(array,original),null);assert.equal(reads,0);
});

test('draft manifest preserves a DTF kit SKU, compound sizes and exact optional quantities without publishing',()=>{
 const variants=[{size:'P + G3',sku:'viva-27+viva-27',price_cents:9900,stock_quantity:3},
  {size:'P/M',sku:'mixed/Case-27',price_cents:5800,stock_quantity:0},
  {size:'M',sku:'sem-estampa',price_cents:3500,stock_quantity:null},
  {size:'M',sku:'another_colour_M',price_cents:3600,stock_quantity:2}];
 const input={schema:'mls_listing_factory_input_v1',marketplace:'SHOPEE_BR',items:[{
  client_ref:'kit-001',title:'Kit casal com estampas originais para revisão',
  description:'Confira cores, medidas e composição antes de revisar este rascunho.',images:[],variants
 }]};
 const report=planMlsListingFactory(input,{});
 assert.ok(report);assert.deepEqual(report.products[0].variants,variants);
 assert.equal(report.published,false);assert.equal(report.execution_allowed,false);
 assert.equal(report.products[0].seller_publication_allowed,false);
 assert.ok(report.products[0].warnings.includes('STOCK_UNVERIFIED'));
});
