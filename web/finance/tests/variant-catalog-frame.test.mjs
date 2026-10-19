import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {VariantCatalogFrameError, deriveCatalogProduct, projectVariantCatalog,
  projectVariantCatalogRequest} from '../src/variant-catalog-frame.mjs';

const ITEM = '123456789';
const sizes = ['P','M','G','GG','G1','G2','G3'];
const axis = (name, options = sizes) => ({name, option_list: options.map(option => ({option}))});
const catalog = () => ({tier_variation: [axis('Tamanho masculino'), axis('Tamanho feminino')],
  model: [{model_id: 123, tier_index: [1,3]}, {model_id: 0, tier_index: [5,2]}]});
const frame = product => ({schema: 'variant_catalog_v1', checked_at: 1792405689, products: [product]});
const binding = (model_id = '123') => ({item_id: ITEM, model_id, male_size: 'M', female_size: 'GG'});
const product = () => ({item_id: ITEM, catalog_fingerprint: 'a'.repeat(64), bindings: [binding()], unresolved_count: 0});
const invalid = error => error instanceof VariantCatalogFrameError && error.message === 'VARIANT_CATALOG_INVALID';

test('named masculine and feminine axes derive every supported size pair and preserve model zero', async () => {
  const source = catalog();
  source.model = sizes.flatMap((_, male) => sizes.map((__, female) => ({model_id: male * 7 + female, tier_index: [male,female]})));
  const value = await deriveCatalogProduct(ITEM, source);
  assert.equal(value.bindings.length, 49); assert.equal(value.unresolved_count, 0);
  for (let male = 0; male < 7; male++) for (let female = 0; female < 7; female++) {
    assert.deepEqual(value.bindings[male * 7 + female], {item_id: ITEM, model_id: String(male * 7 + female),
      male_size: sizes[male], female_size: sizes[female]});
  }
  assert.match(value.catalog_fingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(projectVariantCatalog(frame(value)), frame(value));
});

test('reversed explicit axes and common accent/case labels never swap the garments', async () => {
  const source = {tier_variation: [axis('  TAMANHO FEMÍNINO  ', ['gg','g2']), axis('Masculíno', ['p','g1'])],
    model: [{model_id: 42, tier_index: [1,0]}]};
  assert.deepEqual((await deriveCatalogProduct(ITEM, source)).bindings,
    [{item_id: ITEM, model_id: '42', male_size: 'P', female_size: 'G2'}]);
  for (const [male,female] of [['male size','female size'],["men's size","women's size"],['masc.','fem.']]) {
    const item = {tier_variation: [axis(male,['M']),axis(female,['G'])], model: [{model_id: '0',tier_index:[0,0]}]};
    assert.deepEqual((await deriveCatalogProduct(ITEM,item)).bindings,
      [{item_id: ITEM,model_id:'0',male_size:'M',female_size:'G'}]);
  }
});

test('unlabeled or ambiguous axes never infer composition from titles, SKU or order of sizes', async () => {
  for (const axes of [[],[axis('Tamanho')],[axis('Tamanho 1'),axis('Tamanho 2')],
    [axis('Masculino'),axis('Masculino')],[axis('Masculino/Feminino'),axis('Cor')],
    [axis('Masculino'),axis('Feminino'),axis('Cor',['P'])]]) {
    const source = catalog(); source.tier_variation = axes;
    source.item_name = 'Kit casal masculina M feminina GG';
    source.model[0].model_name = 'Masculino M Feminino GG';
    source.model[0].model_sku = 'MASC_M_FEM_GG';
    const value = await deriveCatalogProduct(ITEM, source);
    assert.deepEqual(value.bindings, []); assert.equal(value.unresolved_count, 2);
    for (const field of ['Kit casal','model_name','model_sku','Masculino M']) assert.ok(!JSON.stringify(value).includes(field));
  }
});

test('only whole supported option tokens resolve; unsupported options and malformed indices remain pending', async () => {
  const source = {tier_variation: [axis('Masculino',['M','G.G','Masculino P','XL','Ｇ１']),axis('Feminino',['GG'])],
    model: [
      {model_id: 1,tier_index:[0,0]}, {model_id: 2,tier_index:[1,0]}, {model_id: 3,tier_index:[2,0]},
      {model_id: 4,tier_index:[3,0]}, {model_id: 5,tier_index:[4,0]}, {model_id: 6,tier_index:[100,0]},
      {model_id: 7,tier_index:[-1,0]}, {model_id: 8,tier_index:[0]}, {model_id: 9,tier_index:[]},
      {model_id: 10,tier_index:['0',0]}, {model_id: 11,tier_index:[0.5,0]}, {model_id: 12},
    ]};
  const value = await deriveCatalogProduct(ITEM,source);
  assert.deepEqual(value.bindings,[binding('1')]); assert.equal(value.unresolved_count,11);
});

test('fingerprints use canonical relevant metadata and change with model choices or unknown options', async () => {
  const source = catalog();
  source.private_payload = 'PRIVATE_BUYER'; source.model[0].model_sku = 'PRIVATE_SKU';
  const first = await deriveCatalogProduct(ITEM,source);
  const canonical = {item_id: ITEM,axes:[{name:'tamanho masculino',options:sizes},{name:'tamanho feminino',options:sizes}],
    models:[{model_id:'0',tier_index:[5,2]},{model_id:'123',tier_index:[1,3]}]};
  assert.equal(first.catalog_fingerprint,createHash('sha256').update(JSON.stringify(canonical)).digest('hex'));
  source.model.reverse(); source.private_payload = 'PRIVATE_CHANGED';
  assert.equal((await deriveCatalogProduct(ITEM,source)).catalog_fingerprint,first.catalog_fingerprint);
  source.model[0].tier_index = [4,2];
  assert.notEqual((await deriveCatalogProduct(ITEM,source)).catalog_fingerprint,first.catalog_fingerprint);
  const unknown = catalog(); unknown.tier_variation[0].option_list[0].option = 'XL';
  assert.notEqual((await deriveCatalogProduct(ITEM,unknown)).catalog_fingerprint,first.catalog_fingerprint);
  assert.notEqual((await deriveCatalogProduct('987654321',catalog())).catalog_fingerprint,first.catalog_fingerprint);
  for (const value of ['PRIVATE_BUYER','PRIVATE_SKU','tamanho masculino','tier_index']) assert.ok(!JSON.stringify(first).includes(value));
});

test('invalid canonical IDs and duplicate model IDs fail closed without echoing input values', async () => {
  for (const item of [0,ITEM + ' ', '01','0','-1','1e3','1'.repeat(21)]) {
    await assert.rejects(deriveCatalogProduct(item,catalog()),invalid);
  }
  for (const id of [Number.MAX_SAFE_INTEGER + 1,-1,NaN,Infinity,1.2,'00','01','-1','1e3','1'.repeat(21),{},null]) {
    const source = catalog(); source.model[0].model_id = id;
    await assert.rejects(deriveCatalogProduct(ITEM,source),invalid);
  }
  const duplicate = catalog(); duplicate.model[1].model_id = '123';
  await assert.rejects(deriveCatalogProduct(ITEM,duplicate),invalid);
  const source = catalog(); source.model = [{model_id:'99999999999999999999',tier_index:[0,0]}];
  assert.equal((await deriveCatalogProduct(ITEM,source)).bindings[0].model_id,'99999999999999999999');
});

test('missing/nonarray models and malformed catalogue structures never masquerade as an empty catalogue', async () => {
  for (const source of [{},null,[],{tier_variation:[]}, {tier_variation:[],model:null},
    {tier_variation:[],model:{}},{tier_variation:null,model:[]},{tier_variation:[null],model:[]},
    {tier_variation:[{name:'Masculino',option_list:[null]}],model:[]}]) {
    await assert.rejects(deriveCatalogProduct(ITEM,source),invalid);
  }
  const empty = await deriveCatalogProduct(ITEM,{tier_variation:[],model:[]});
  assert.equal(empty.unresolved_count,0); assert.deepEqual(empty.bindings,[]);
});

test('projection strips nothing silently, sorts IDs deterministically and returns detached fixed-field copies', () => {
  const larger = product(); larger.item_id = '100'; larger.bindings = [];
  const smaller = product(); smaller.item_id = '9'; smaller.bindings = ['10','2','0'].map(model_id => ({...binding(model_id),item_id:'9'}));
  const source = {...frame(larger),products:[larger,smaller]};
  const projected = projectVariantCatalog(source);
  assert.deepEqual(projected.products.map(row=>row.item_id),['9','100']);
  assert.deepEqual(projected.products[0].bindings.map(row=>row.model_id),['0','2','10']);
  source.products[1].bindings[0].male_size = 'G3';
  assert.equal(projected.products[0].bindings[2].male_size,'M');
  const cases = [
    value=>{value.extra='PRIVATE';},value=>{value.products[0].extra='PRIVATE';},
    value=>{value.products[0].bindings[0].extra='PRIVATE';},value=>{value.products[0].bindings[0].item_id='987';},
    value=>{value.products[0].bindings[0].model_id=123;},value=>{value.products[0].bindings[0].male_size='m';},
    value=>{value.products[0].catalog_fingerprint='A'.repeat(64);},value=>{value.products[0].unresolved_count=-1;},
    value=>{value.products[0].unresolved_count=0.5;},value=>{value.checked_at=0;},value=>{value.checked_at=1e10;},
    value=>{value.schema='other';},value=>{value.products.push(structuredClone(value.products[0]));},
    value=>{value.products[0].bindings.push(structuredClone(value.products[0].bindings[0]));},
    value=>{value.products=[];},value=>{Object.defineProperty(value,Symbol('private'),{value:true});},
  ];
  for (const change of cases) {const value=frame(product());change(value);assert.equal(projectVariantCatalog(value),null);}
});

test('projections and derivation do not execute own or inherited getters or consume sparse arrays', async () => {
  let invoked = 0;
  const accessor = target => Object.defineProperty(target,'model',{get(){invoked++;return [];},enumerable:true});
  await assert.rejects(deriveCatalogProduct(ITEM,accessor({tier_variation:[]})),invalid);
  const source = catalog(); Object.defineProperty(source,'private_extra',{get(){invoked++;throw Error('PRIVATE');}});
  await deriveCatalogProduct(ITEM,source); assert.equal(invoked,0);
  const value=frame(product());Object.defineProperty(value,'checked_at',{get(){invoked++;return 1;},enumerable:true});
  assert.equal(projectVariantCatalog(value),null);assert.equal(invoked,0);
  const sparse = catalog(); sparse.model = Array(1);
  await assert.rejects(deriveCatalogProduct(ITEM,sparse),invalid);
  assert.equal(projectVariantCatalog({...frame(product()),products:Array(1)}),null);
  assert.equal(projectVariantCatalogRequest({item_ids:Array(1)}),null);
  const inherited = catalog();
  Object.setPrototypeOf(inherited.tier_variation,Object.create(Array.prototype,{map:{get(){invoked++;return Array.prototype.map;}}}));
  await assert.rejects(deriveCatalogProduct(ITEM,inherited),invalid);assert.equal(invoked,0);
  const custom = [ITEM]; Object.setPrototypeOf(custom,Object.create(Array.prototype,{every:{get(){invoked++;return Array.prototype.every;}}}));
  assert.equal(projectVariantCatalogRequest({item_ids:custom}),null);assert.equal(invoked,0);
});

test('request projection permits one through three unique canonical product IDs only', () => {
  assert.deepEqual(projectVariantCatalogRequest({item_ids:[ITEM,'1','99999999999999999999']}),
    {item_ids:[ITEM,'1','99999999999999999999']});
  for (const value of [{},{item_ids:[]},{item_ids:[ITEM,ITEM]},{item_ids:[ITEM,'2','3','4']},
    {item_ids:[0]},{item_ids:['0']},{item_ids:['01']},{item_ids:[ITEM],code:'PRIVATE'},[],null]) {
    assert.equal(projectVariantCatalogRequest(value),null);
  }
  const source={item_ids:[ITEM]},copy=projectVariantCatalogRequest(source);source.item_ids[0]='2';
  assert.deepEqual(copy,{item_ids:[ITEM]});
});

test('1000 models are bounded without truncation and aggregate frame limits reject oversized results', async () => {
  const source = catalog();source.model=Array.from({length:1000},(_,index)=>({model_id:index,tier_index:[0,0]}));
  const value=await deriveCatalogProduct(ITEM,source);
  assert.equal(value.bindings.length,1000);assert.equal(value.unresolved_count,0);
  assert.ok(projectVariantCatalog(frame(value)));
  source.model.push({model_id:1000,tier_index:[0,0]});
  await assert.rejects(deriveCatalogProduct(ITEM,source),invalid);
  const malformed=frame(value);malformed.products[0].unresolved_count=1;
  assert.equal(projectVariantCatalog(malformed),null);
  const extra=product();extra.item_id='999';extra.bindings=[{...binding(),item_id:'999'}];
  assert.equal(projectVariantCatalog({...frame(value),products:[value,extra]}),null);
  assert.equal(projectVariantCatalog({...frame(product()),products:Array.from({length:4},(_,index)=>({...product(),item_id:String(index+1),bindings:[]}))}),null);
});
