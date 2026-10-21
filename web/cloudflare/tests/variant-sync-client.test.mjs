import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {CLIENT} from '../src/admin-client.mjs';

// Run the browser's real projectors in their own realm, just as fetch().json()
// supplies ordinary objects to the page. DOM behaviour is checked separately.
function part(start,end){
 const a=CLIENT.indexOf(start),b=CLIENT.indexOf(end,a);
 assert.ok(a>=0&&b>a);
 return CLIENT.slice(a,b);
}
function browser(){
 const context=vm.createContext({});
 new vm.Script(`
  const variantCatalogReviews=new Map();
  let storePeriodBundle=null,storePeriodBusy=false,storeProductBusy=null,storeAdsBusy=false,storeResultMessage='';
  let requestCount=0,applied=[];
  let api=async()=>{requestCount++;return {fixture:'updated'};};
  let applyStoreBundle=value=>applied.push(value);
  ${part('function variantId(','function variantCatalogReasonMessage(')}
  ${part('function validBindingState(','function groupVariantRows(')}
  ${part('function projectVariantSync(','async function syncKnownVariants(')}
 `).runInContext(context);
 const evaluate=source=>new vm.Script(source).runInContext(context);
 const load=(value,candidates=[{item_id:'58220193244',model_id:'9'}])=>{
  context.inputText=JSON.stringify(value);context.candidateText=JSON.stringify(candidates);
  evaluate('globalThis.input=JSON.parse(inputText);globalThis.candidates=JSON.parse(candidateText);');
 };
 const project=()=>evaluate('projectVariantSync(input,candidates)');
 const plain=value=>JSON.parse(JSON.stringify(value));
 return {context,evaluate,load,project,plain};
}
const state=()=>({revision:4,bindings:[{item_id:'10',model_id:'1',size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}],updated_at:'2026-10-21T12:00:00.000Z'});
const response=()=>({state:state(),remaining_known:0,pending_type:['58220193244'],processed:['58220193244']});
function review(){
 return {...response(),catalog_review:{schema:'variant_catalog_v1',checked_at:1792584000,products:[{
  item_id:'58220193244',catalog_fingerprint:'a'.repeat(64),bindings:[],unresolved_count:1,
  diagnostic:{axes:[{name:'Modelo',options:['Especial'],option_count:1}],model_count:1,reasons:[{code:'AXES_NOT_RECOGNIZED',count:1}]},
 }]}};
}

test('legacy sync responses remain valid without requiring catalogue review',()=>{
 const b=browser(),input=response();b.load(input);
 assert.deepEqual(b.plain(b.project()),{...input,catalog_diagnostics:[]});
 b.evaluate("input.state.bindings[0].size='G';input.pending_type.push('10');");
 assert.equal(b.project(),null);
});

test('pending catalogue review exposes detached bounded labels and reasons with no guessed composition or cost',()=>{
 const b=browser();b.load(review());
 b.evaluate('globalThis.projected=projectVariantSync(input,candidates);');
 const projected=b.plain(b.evaluate('projected'));
 assert.deepEqual(projected.catalog_diagnostics,[{schema:'variant_catalog_diagnostic_v1',item_id:'58220193244',checked_at:1792584000,
  axes:[{name:'Modelo',options:['Especial'],option_count:1}],model_count:1,reasons:[{code:'AXES_NOT_RECOGNIZED',count:1}]}]);
 assert.deepEqual(projected.state,state());
 b.evaluate("input.catalog_review.products[0].diagnostic.axes[0].options[0]='changed';input.state.bindings[0].size='G';");
 assert.deepEqual(b.plain(b.evaluate('projected')),projected);
 assert.equal(Object.hasOwn(projected.catalog_diagnostics[0],'selling_unit'),false);
 assert.equal(JSON.stringify(projected).includes('cost_cents'),false);
});

test('review is accepted only for requested products that were processed and are still pending',()=>{
 const b=browser();
 for(const mutate of [
  value=>{value.processed=[];},value=>{value.pending_type=[];},
  value=>{value.catalog_review.products[0].item_id='10';},
  value=>{value.processed.push('10');},value=>{value.pending_type.push('10');},
  value=>{value.processed.push('58220193244');},value=>{value.pending_type.push('58220193244');},
 ]){const value=review();mutate(value);b.load(value);assert.equal(b.project(),null);}
});

test('private extras, inconsistent counts and malformed catalogue evidence reject the whole sync result',()=>{
 const b=browser();
 const mutations=[
  value=>{value.private_token='PRIVATE';},value=>{value.catalog_review=null;},
  value=>{value.catalog_review.products=[];},value=>{value.catalog_review.schema='wrong';},
  value=>{value.catalog_review.products.push(structuredClone(value.catalog_review.products[0]));},
  value=>{value.catalog_review.products[0].catalog_fingerprint='wrong';},
  value=>{value.catalog_review.products[0].diagnostic.model_count=2;},
  value=>{value.catalog_review.products[0].diagnostic.reasons[0].count=2;},
  value=>{value.catalog_review.products[0].diagnostic.reasons[0].code='PRIVATE_PROVIDER_ERROR';},
  value=>{value.catalog_review.products[0].diagnostic.axes[0].buyer='PRIVATE_BUYER';},
  value=>{value.catalog_review.products[0].diagnostic.axes[0].options=['PRIVATE\nLABEL'];},
  value=>{value.catalog_review.products[0].diagnostic.axes[0].options=Array(8).fill('M');value.catalog_review.products[0].diagnostic.axes[0].option_count=8;},
  value=>{delete value.catalog_review.products[0].diagnostic;},
  value=>{value.remaining_known=1001;},value=>{value.remaining_known=-1;},
  value=>{value.state.bindings[0].size='XL';},value=>{value.state.bindings[0].operator_confirmed=false;},
 ];
 for(const mutate of mutations){const value=review();mutate(value);b.load(value);assert.equal(b.project(),null);}
});

test('review accessors reject without evaluating top-level or product identity getters',()=>{
 const b=browser();
 for(const target of ['top','identity','axes']){
  b.load(review());
  b.evaluate(`globalThis.getterCalls=0;Object.defineProperty(${target==='top'?'input':target==='identity'?'input.catalog_review.products[0]':'input.catalog_review.products[0].diagnostic'},${JSON.stringify(target==='top'?'catalog_review':target==='identity'?'item_id':'axes')},{enumerable:true,get(){getterCalls++;return [];}});`);
  assert.equal(b.project(),null);assert.equal(b.evaluate('getterCalls'),0);
 }
});

test('a sold historical model missing from a fully recognized catalogue remains reviewable without fabricating its size',()=>{
 const b=browser(),value=review(),product=value.catalog_review.products[0];
 product.selling_unit='SINGLE_GARMENT';product.bindings=[{item_id:product.item_id,model_id:'1',size:'GG'}];product.unresolved_count=0;
 product.diagnostic={axes:[{name:'Estampa',options:['Vermelha'],option_count:1},{name:'Tamanho',options:['GG'],option_count:1}],model_count:1,reasons:[]};
 b.load(value);const projected=b.plain(b.project());
 assert.equal(projected.catalog_diagnostics[0].selling_unit,'SINGLE_GARMENT');assert.deepEqual(projected.catalog_diagnostics[0].reasons,[]);
 assert.deepEqual(projected.state,state());assert.equal(projected.state.bindings.some(row=>row.item_id===product.item_id&&row.model_id==='9'),false);
});

test('processed review is replaced or cleared without erasing unrelated products and its cache stays bounded',()=>{
 const b=browser();b.load(review());
 b.evaluate("variantCatalogReviews.set('10',{item_id:'10'});rememberVariantSyncReview(projectVariantSync(input,candidates));");
 assert.deepEqual(b.plain(b.evaluate('[...variantCatalogReviews.keys()]')),['10','58220193244']);
 b.load({...response(),pending_type:[]});b.evaluate('rememberVariantSyncReview(projectVariantSync(input,candidates));');
 assert.deepEqual(b.plain(b.evaluate('[...variantCatalogReviews.keys()]')),['10']);
 b.evaluate("variantCatalogReviews.clear();for(let i=1;i<=1001;i++)rememberVariantSyncReview({processed:[],catalog_diagnostics:[{item_id:String(i)}]});");
 assert.equal(b.evaluate('variantCatalogReviews.size'),1000);assert.equal(b.evaluate("variantCatalogReviews.has('1')"),false);
});

test('late automatic sync rereads only a completed idle financial run and ignores responses for a replaced run',async()=>{
 const b=browser();
 b.evaluate("storePeriodBundle={finance:{run_id:'first'},result:{complete:true}};");
 await b.evaluate('rereadStoreAfterVariantSync()');
 assert.equal(b.evaluate('requestCount'),1);assert.deepEqual(b.plain(b.evaluate('applied')),[{fixture:'updated'}]);
 for(const busy of ['storePeriodBusy','storeProductBusy','storeAdsBusy']){
  b.evaluate(busy+'=true;');await b.evaluate('rereadStoreAfterVariantSync()');b.evaluate(busy+'=false;');
 }
 b.evaluate('storePeriodBundle.result.complete=false;');await b.evaluate('rereadStoreAfterVariantSync()');assert.equal(b.evaluate('requestCount'),1);
 b.evaluate("storePeriodBundle.result.complete=true;api=()=>new Promise(resolve=>globalThis.releaseRead=resolve);");
 const pending=b.evaluate('rereadStoreAfterVariantSync()');
 b.evaluate("storePeriodBundle.finance.run_id='second';releaseRead({fixture:'stale'});");await pending;
 assert.deepEqual(b.plain(b.evaluate('applied')),[{fixture:'updated'}]);
});

test('financial reread failure keeps saved bindings distinct from an outdated result',async()=>{
 const b=browser();b.evaluate("storePeriodBundle={finance:{run_id:'first'},result:{complete:true}};api=async()=>{throw Error('offline');};");
 await b.evaluate('rereadStoreAfterVariantSync()');
 assert.match(b.evaluate('storeResultMessage'),/vínculos foram salvos/);assert.match(b.evaluate('storeResultMessage'),/Recalcular/);
 assert.deepEqual(b.plain(b.evaluate('applied')),[]);
});
