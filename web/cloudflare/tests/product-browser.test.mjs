import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {CLIENT} from '../src/admin-client.mjs';

// Exercise the actual browser selection functions without mounting hundreds of
// model editors. The compiled-page harness separately covers DOM and drafts.
function browser(){
 const controls=Object.fromEntries(['productSearch','productStatusFilter','productTypeFilter','productSort','productPageSize','productBrowserSummary','productPageInfo','productPrevious','productNext'].map(id=>[id,{value:''}]));
 Object.assign(controls.productStatusFilter,{value:'all'});Object.assign(controls.productTypeFilter,{value:'all'});Object.assign(controls.productSort,{value:'quantity_desc'});Object.assign(controls.productPageSize,{value:'20'});
 const bindings=new Map(),units=new Map(),drafts=new Map();
 const context=vm.createContext({el:id=>controls[id],productBrowserPage:1,itemsData:{status:'AVAILABLE'},bindingDrafts:drafts,currentBindingMap:()=>bindings,productSellingUnit:id=>units.get(id)||'',savedVariantUnitCost:value=>value?.cost_cents??null});
 const start=CLIENT.indexOf('function productSearchText('),end=CLIENT.indexOf('function updateProductDraftIndicators(');
 assert.ok(start>=0&&end>start);
 new vm.Script(CLIENT.slice(start,end)).runInContext(context);
 return {controls,bindings,units,drafts,context,build:products=>context.productBrowserRows(products),filter:rows=>context.filteredProductBrowserRows(rows),summary:(rows,filtered)=>context.updateProductBrowserSummary(rows,filtered)};
}
function fixture(count=120){
 const b=browser(),products=new Map();
 for(let i=1;i<=count;i++){
  const itemId=String(9000000000000000n+BigInt(i)),models=[];b.units.set(itemId,i%2?'SINGLE_GARMENT':'ONE_MALE_ONE_FEMALE_KIT');
  for(let m=1;m<=3;m++){
   const model_id=String(i*100+m),key=itemId+':'+model_id,unit=b.units.get(itemId);
   models.push([key,{item_id:itemId,model_id,quantity:m===1?i:null}]);
   if(i%5!==0)b.bindings.set(key,{item_id:itemId,model_id,selling_unit:unit,...(unit==='SINGLE_GARMENT'?{size:i%3?'P':'G1'}:{male_size:'G',female_size:'G1'}),cost_cents:unit==='SINGLE_GARMENT'?1590:3480,operator_confirmed:false});
  }
  products.set(itemId,models);
 }
 return {...b,products};
}
const ids=rows=>Array.from(rows,row=>row.itemId);

test('all loaded product and model identities are searchable beyond the first visible page',()=>{
 const b=fixture(),rows=b.build(b.products);assert.equal(rows.length,120);
 b.controls.productSearch.value='11903';const filtered=b.filter(rows);
 assert.deepEqual(ids(filtered),['9000000000000119']);assert.equal(filtered[0].models.length,3);
 b.controls.productSearch.value='9000000000000120';assert.deepEqual(ids(b.filter(rows)),['9000000000000120']);
});

test('size queries are exact, combined with normalized composition terms and do not invent names',()=>{
 const b=fixture(12),rows=b.build(b.products);b.controls.productSearch.value='kit G1';
 const kits=b.filter(rows);assert.ok(kits.length>0);assert.ok(kits.every(row=>row.unit==='ONE_MALE_ONE_FEMALE_KIT'&&row.sizes.has('G1')));
 b.controls.productSearch.value='G';assert.ok(b.filter(rows).every(row=>row.sizes.has('G')));
 b.controls.productSearch.value='avulsa g1';assert.ok(b.filter(rows).every(row=>row.unit==='SINGLE_GARMENT'&&row.sizes.has('G1')));
 b.controls.productSearch.value='Verde';assert.equal(b.filter(rows).length,0);
});

test('status and composition filters use the full saved state and keep global draft products discoverable',()=>{
 const b=fixture(120),draftItem='9000000000000119';b.drafts.set(draftItem+':11901',{confirmed:true});
 const rows=b.build(b.products);b.controls.productStatusFilter.value='draft';assert.deepEqual(ids(b.filter(rows)),[draftItem]);
 b.controls.productStatusFilter.value='pending';assert.equal(b.filter(rows).length,24);
 b.controls.productStatusFilter.value='ready';b.controls.productTypeFilter.value='single';assert.equal(b.filter(rows).length,48);
 assert.equal(b.drafts.size,1);assert.equal(b.bindings.size,288);
});

test('known costs sort before unknowns in both directions and large IDs use deterministic numeric order',()=>{
 const b=fixture(12),rows=b.build(b.products);
 for(const sort of ['cost_desc','cost_asc']){b.controls.productSort.value=sort;const filtered=b.filter(rows);const unknown=filtered.findIndex(row=>row.minCost===null);assert.ok(unknown>0);assert.ok(filtered.slice(unknown).every(row=>row.minCost===null));}
 b.controls.productSort.value='id_asc';assert.deepEqual(ids(b.filter(rows)),[...b.products.keys()]);
 b.controls.productSort.value='quantity_desc';assert.equal(b.filter(rows)[0].itemId,'9000000000000012');
});

test('page ranges clamp after filtering, while summary retains all product and draft counts',()=>{
 const b=fixture(120),rows=b.build(b.products);b.context.productBrowserPage=4;
 let page=b.summary(rows,rows);assert.equal(page.begin,61);assert.equal(page.end,80);assert.equal(b.controls.productPrevious.disabled,false);assert.equal(b.controls.productNext.disabled,false);
 b.controls.productSearch.value='11903';const filtered=b.filter(rows);page=b.summary(rows,filtered);
 assert.equal(page.begin,1);assert.equal(page.end,1);assert.equal(b.context.productBrowserPage,1);assert.match(b.controls.productPageInfo.textContent,/filtrados entre 120/);
 assert.match(b.controls.productBrowserSummary.textContent,/120 produto/);assert.match(b.controls.productBrowserSummary.textContent,/pendente/);
 b.summary(rows,[]);assert.match(b.controls.productPageInfo.textContent,/0–0 de 0/);assert.equal(b.controls.productNext.disabled,true);
});

test('saved but unobserved products preserve unknown quantity and partial costs are not complete',()=>{
 const b=browser(),itemId='99',products=new Map([[itemId,[['99:1',{item_id:'99',model_id:'1',quantity:null}],['99:2',{item_id:'99',model_id:'2',quantity:null}]]]]);
 b.units.set(itemId,'SINGLE_GARMENT');b.bindings.set('99:1',{selling_unit:'SINGLE_GARMENT',size:'P',cost_cents:1590});
 const rows=b.build(products);assert.equal(rows[0].quantity,null);assert.equal(rows[0].minCost,1590);assert.equal(rows[0].costComplete,false);assert.equal(rows[0].ready,false);
 b.context.itemsData=null;b.summary(rows,rows);assert.match(b.controls.productBrowserSummary.textContent,/recorte indisponível/);
});
