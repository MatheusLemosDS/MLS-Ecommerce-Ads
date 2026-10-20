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

test('observed MULHER and HOMEM kit options resolve all 49 combinations on their explicit gender axes', async () => {
  const item='58269212782';
  const source={tier_variation:[axis('Tamanho Feminino',sizes.map(size=>'MULHER '+size)),
    axis('Tamanho Masculino',sizes.map(size=>'HOMEM '+size))],
    // Model IDs are synthetic; the operator supplied axis options and a count,
    // not the real model IDs or their tier indices.
    model:sizes.flatMap((_,female)=>sizes.map((__,male)=>({model_id:female*7+male,tier_index:[female,male]})))};
  const original=await deriveCatalogProduct(item,source);
  assert.equal(original.unresolved_count,0);assert.equal(original.bindings.length,49);
  assert.deepEqual(original.diagnostic.reasons,[]);
  for(let female=0;female<7;female++)for(let male=0;male<7;male++){
    assert.deepEqual(original.bindings[female*7+male],{item_id:item,model_id:String(female*7+male),
      male_size:sizes[male],female_size:sizes[female]});
  }
  const expectedFingerprint=createHash('sha256').update(JSON.stringify({item_id:item,
    axes:[{name:'tamanho feminino',options:sizes.map(size=>'MULHER '+size)},
      {name:'tamanho masculino',options:sizes.map(size=>'HOMEM '+size)}],
    models:source.model.map(row=>({model_id:String(row.model_id),tier_index:row.tier_index}))})).digest('hex');
  assert.equal(original.catalog_fingerprint,expectedFingerprint);
  assert.deepEqual(projectVariantCatalog(frame(original)),frame(original));
  source.tier_variation.reverse();for(const row of source.model)row.tier_index.reverse();
  assert.deepEqual((await deriveCatalogProduct(item,source)).bindings,original.bindings);
});

test('kit prefix recognition is exact and gender-aware while plain sizes retain their meaning', async () => {
  for(const [female,male,expected] of [
    [' mulher p ',' homem gg ',{female_size:'P',male_size:'GG'}],
    ['MULHER   G1','HOMEM  G3',{female_size:'G1',male_size:'G3'}],
    ['P','HOMEM M',{female_size:'P',male_size:'M'}],
    ['MULHER G2','GG',{female_size:'G2',male_size:'GG'}],
  ]){
    const source={tier_variation:[axis('Feminino',[female]),axis('Masculino',[male])],model:[{model_id:0,tier_index:[0,0]}]};
    assert.deepEqual((await deriveCatalogProduct(ITEM,source)).bindings,[{item_id:ITEM,model_id:'0',male_size:expected.male_size,female_size:expected.female_size}]);
  }
  for(const [female,male] of [
    ['HOMEM P','HOMEM G'],['MULHER P','MULHER G'],['MULHER P HOMEM G','HOMEM G'],
    ['MULHER MULHER P','HOMEM G'],['MULHER-P','HOMEM G'],['MULHERP','HOMEM G'],
    ['MULHER P extra','HOMEM G'],['MULHER GG1','HOMEM G'],['MULHER G.G','HOMEM G'],
    ['FEMININO P','HOMEM G'],['MULHER P','MASCULINO G'],['MULHER P','HOMEM XL'],
    ['MÚLHER P','HOMEM G'],['MULHER P','HOMEM\u2028G'],
  ]){
    const source={tier_variation:[axis('Feminino',[female]),axis('Masculino',[male])],model:[{model_id:0,tier_index:[0,0]}]};
    const result=await deriveCatalogProduct(ITEM,source);
    assert.deepEqual(result.bindings,[],JSON.stringify([female,male]));assert.equal(result.unresolved_count,1);
    assert.deepEqual(result.diagnostic.reasons,[{code:'OPTION_NOT_RECOGNIZED',count:1}]);
  }
});

test('gender prefixes cannot supply missing kit axes or change single-garment size parsing', async () => {
  for(const names of [['Tamanho','Outro tamanho'],['Cor','Tamanho'],['Feminino','Feminino']]){
    const source={tier_variation:[axis(names[0],['MULHER P']),axis(names[1],['HOMEM G'])],model:[{model_id:1,tier_index:[0,0]}]};
    const result=await deriveCatalogProduct(ITEM,source);
    assert.deepEqual(result.bindings,[]);assert.deepEqual(result.diagnostic.reasons,[{code:'AXES_NOT_RECOGNIZED',count:1}]);
  }
  const source={tier_variation:[axis('Cor',['Verde']),axis('Tamanho',['p','MULHER P','HOMEM P','gg'])],
    model:[0,1,2,3].map(index=>({model_id:index,tier_index:[0,index]}))};
  const result=await deriveCatalogProduct(ITEM,source,{selling_unit:'SINGLE_GARMENT'});
  assert.deepEqual(result.bindings,[{item_id:ITEM,model_id:'0',size:'P'},{item_id:ITEM,model_id:'3',size:'GG'}]);
  assert.equal(result.unresolved_count,2);assert.deepEqual(result.diagnostic.reasons,[{code:'OPTION_NOT_RECOGNIZED',count:2}]);
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
  assert.deepEqual(value.diagnostic.reasons,[
    {code:'OPTION_NOT_RECOGNIZED',count:4},{code:'INDEX_NOT_VALID',count:7},
  ]);
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
  for (const value of ['PRIVATE_BUYER','PRIVATE_SKU','tier_index']) assert.ok(!JSON.stringify(first).includes(value));
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
  assert.deepEqual(empty.diagnostic,{axes:[],model_count:0,reasons:[{code:'NO_MODELS',count:0}]});
  assert.deepEqual(projectVariantCatalog(frame(empty)),frame(empty));
});

test('diagnostics preserve bounded raw axis labels and option samples without exposing unrelated provider data', async () => {
  const options=[' p ','M','GG','G1','G2','G3','Masculina P','NEVER_IN_SAMPLE'];
  const source={tier_variation:[axis('  TAMANHO FEMÍNINO  ',options),axis('Masculíno',[' p '])],
    model:[{model_id:1,tier_index:[0,0],model_name:'PRIVATE_MODEL_LABEL',model_sku:'PRIVATE_SKU'}],
    item_name:'PRIVATE_TITLE',access_token:'PRIVATE_TOKEN',buyer_name:'PRIVATE_BUYER',price:123};
  source.tier_variation[0].private_extra='PRIVATE_AXIS';
  source.tier_variation[0].option_list[0].private_extra='PRIVATE_OPTION';
  const result=await deriveCatalogProduct(ITEM,source);
  assert.deepEqual(result.bindings,[{item_id:ITEM,model_id:'1',male_size:'P',female_size:'P'}]);
  assert.deepEqual(result.diagnostic,{
    axes:[{name:'  TAMANHO FEMÍNINO  ',options:options.slice(0,7),option_count:8},
      {name:'Masculíno',options:[' p '],option_count:1}],model_count:1,reasons:[],
  });
  const projected=projectVariantCatalog(frame(result));
  assert.deepEqual(projected,frame(result));
  result.diagnostic.axes[0].options[0]='CHANGED';
  result.diagnostic.axes[1].name='CHANGED';
  assert.equal(projected.products[0].diagnostic.axes[0].options[0],' p ');
  assert.equal(projected.products[0].diagnostic.axes[1].name,'Masculíno');
  for(const forbidden of ['PRIVATE_','NEVER_IN_SAMPLE','model_name','model_sku','access_token','buyer_name','price']){
    assert.ok(!JSON.stringify(projected).includes(forbidden));
  }
});

test('diagnostic counts describe disjoint unresolved models with axes before indices and indices before options', async () => {
  const source={tier_variation:[axis('Masculino',['M','Masculino P']),axis('Feminino',['GG'])],
    model:[{model_id:0,tier_index:[0,0]},{model_id:1,tier_index:[1,0]},
      {model_id:2,tier_index:[1,1]},{model_id:3,tier_index:[0]},{model_id:4}]};
  const result=await deriveCatalogProduct(ITEM,source);
  assert.equal(result.unresolved_count,4);
  assert.deepEqual(result.diagnostic.reasons,[{code:'OPTION_NOT_RECOGNIZED',count:1},{code:'INDEX_NOT_VALID',count:3}]);
  assert.equal(result.diagnostic.model_count,result.bindings.length+result.unresolved_count);
  assert.equal(result.diagnostic.reasons.reduce((sum,reason)=>sum+reason.count,0),result.unresolved_count);
  source.tier_variation[0].name='Tamanho';
  const unknown=await deriveCatalogProduct(ITEM,source);
  assert.equal(unknown.unresolved_count,5);
  assert.deepEqual(unknown.diagnostic.reasons,[{code:'AXES_NOT_RECOGNIZED',count:5}]);
  assert.ok(projectVariantCatalog(frame(unknown)));
});

test('diagnostic projection remains optional for legacy frames and rejects malformed, enlarged or inconsistent metadata', async () => {
  assert.deepEqual(projectVariantCatalog(frame(product())),frame(product()));
  const source=frame(await deriveCatalogProduct(ITEM,catalog()));
  const cases=[
    value=>{value.diagnostic=undefined;},value=>{value.diagnostic.extra='PRIVATE';},
    value=>{value.diagnostic.axes[0].extra='PRIVATE';},
    value=>{value.diagnostic.axes[0].name='x'.repeat(129);},value=>{value.diagnostic.axes[0].name='bad\nname';},
    value=>{value.diagnostic.axes[0].name=12;},value=>{value.diagnostic.axes[0].options[0]='x'.repeat(129);},
    value=>{value.diagnostic.axes[0].options[0]='bad\u007foption';},value=>{value.diagnostic.axes[0].options[0]=12;},
    value=>{value.diagnostic.axes[0].options.push('EXTRA');},value=>{value.diagnostic.axes[0].option_count=6;},
    value=>{value.diagnostic.axes[0].option_count=1001;},value=>{value.diagnostic.axes[0].option_count=1.5;},
    value=>{value.diagnostic.axes=Array.from({length:11},()=>({name:'axis',options:[],option_count:0}));},
    value=>{value.diagnostic.model_count=1;},value=>{value.diagnostic.model_count=1001;},
    value=>{value.diagnostic.reasons=[{code:'PRIVATE_PROVIDER_ERROR',count:1}];},
    value=>{value.diagnostic.reasons=[{code:'INDEX_NOT_VALID',count:0}];},
    value=>{value.diagnostic.reasons=[{code:'NO_MODELS',count:0}];},
    value=>{value.diagnostic.reasons=[{code:'INDEX_NOT_VALID',count:1}];},
    value=>{value.diagnostic.reasons=[{code:'INDEX_NOT_VALID',count:1,extra:'PRIVATE'}];},
    value=>{value.diagnostic.axes=Array(1);},value=>{value.diagnostic.axes[0].options=Array(1);},
    value=>{value.diagnostic.reasons=Array(1);},
  ];
  for(const change of cases){const value=structuredClone(source);change(value.products[0]);assert.equal(projectVariantCatalog(value),null);}
  const unresolved=await deriveCatalogProduct(ITEM,{tier_variation:[axis('Unknown')],model:[{model_id:0},{model_id:1}]});
  unresolved.diagnostic.reasons=[{code:'AXES_NOT_RECOGNIZED',count:1},{code:'AXES_NOT_RECOGNIZED',count:1}];
  assert.equal(projectVariantCatalog(frame(unresolved)),null);
  const empty=await deriveCatalogProduct(ITEM,{tier_variation:[],model:[]});
  empty.diagnostic.reasons=[];assert.equal(projectVariantCatalog(frame(empty)),null);
  empty.diagnostic.reasons=[{code:'NO_MODELS',count:1}];assert.equal(projectVariantCatalog(frame(empty)),null);
});

test('diagnostic projection rejects accessors without executing them', async () => {
  let invoked=0;
  const original=frame(await deriveCatalogProduct(ITEM,catalog()));
  const targets=[
    value=>[value.products[0],'diagnostic'],
    value=>[value.products[0].diagnostic,'axes'],
    value=>[value.products[0].diagnostic.axes[0],'name'],
    value=>[value.products[0].diagnostic.axes[0].options,'0'],
    value=>[value.products[0].diagnostic,'model_count'],
    value=>[value.products[0].diagnostic,'reasons'],
  ];
  for(const target of targets){const value=structuredClone(original),[object,key]=target(value);
    Object.defineProperty(object,key,{get(){invoked++;throw Error('PRIVATE');},enumerable:true});
    assert.equal(projectVariantCatalog(value),null);
  }
  assert.equal(invoked,0);
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

test('confirmed single-garment composition resolves the observed color and generic size catalogue without duplicating garments', async () => {
  const item_id='22199878767';
  const source={tier_variation:[axis('Cor',['Verde']),axis('Tamanho',['p','m','g','gg'])],
    model:[{model_id:'189627799547',tier_index:[0,0]},{model_id:'189627799548',tier_index:[0,1]},
      {model_id:'189627799549',tier_index:[0,2]},{model_id:'189627799550',tier_index:[0,3]}]};
  const value=await deriveCatalogProduct(item_id,source,{selling_unit:'SINGLE_GARMENT'});
  assert.equal(value.selling_unit,'SINGLE_GARMENT'); assert.equal(value.unresolved_count,0);
  assert.deepEqual(value.bindings,source.model.map((model,index)=>({item_id,model_id:model.model_id,size:sizes[index]})));
  assert.deepEqual(value.diagnostic,{axes:[{name:'Cor',options:['Verde'],option_count:1},
    {name:'Tamanho',options:['p','m','g','gg'],option_count:4}],model_count:4,reasons:[]});
  assert.deepEqual(projectVariantCatalog(frame(value)),frame(value));
  const legacy=await deriveCatalogProduct(item_id,source);
  assert.equal(Object.hasOwn(legacy,'selling_unit'),false);
  assert.deepEqual(legacy.bindings,[]); assert.equal(legacy.unresolved_count,4);
  assert.deepEqual(legacy.diagnostic.reasons,[{code:'AXES_NOT_RECOGNIZED',count:4}]);
});

test('single-garment derivation supports every size, reversed color axes and normalized generic axis labels', async () => {
  for(const name of ['Tamanho','  TAM.  ','Size','Sizes','Tamanhos','Shirt size','Garment size']){
    const source={tier_variation:[axis(name,sizes.map(size=>' '+size.toLowerCase()+' '))],
      model:sizes.map((_,index)=>({model_id:index,tier_index:[index]}))};
    const result=await deriveCatalogProduct(ITEM,source,{selling_unit:'SINGLE_GARMENT'});
    assert.deepEqual(result.bindings,sizes.map((size,index)=>({item_id:ITEM,model_id:String(index),size})));
    assert.equal(result.unresolved_count,0);
  }
  for(const color of ['Cor','Color','Colour'])for(const reverse of [false,true]){
    const source={tier_variation:reverse?[axis('Size',['g3']),axis(color,['Verde','Azul'])]
      :[axis(color,['Verde','Azul']),axis('Size',['g3'])],
      model:[{model_id:0,tier_index:reverse?[0,1]:[1,0]}]};
    const result=await deriveCatalogProduct(ITEM,source,{selling_unit:'SINGLE_GARMENT'});
    assert.deepEqual(result.bindings,[{item_id:ITEM,model_id:'0',size:'G3'}]);
  }
});

test('single-garment indices validate color as well as size, with disjoint pending-model reasons', async () => {
  const source={tier_variation:[axis('Cor',['Verde']),axis('Tamanho',['M','G.G','Masculino P','XL','Ｇ１'])],
    model:[{model_id:0,tier_index:[0,0]},{model_id:1,tier_index:[0,1]},{model_id:2,tier_index:[0,2]},
      {model_id:3,tier_index:[0,3]},{model_id:4,tier_index:[0,4]},{model_id:5,tier_index:[1,0]},
      {model_id:6,tier_index:[0,5]},{model_id:7,tier_index:[-1,0]},{model_id:8,tier_index:[0]},
      {model_id:9,tier_index:[0,0,0]},{model_id:10,tier_index:['0',0]},{model_id:11,tier_index:[0,0.5]},
      {model_id:12}]};
  const result=await deriveCatalogProduct(ITEM,source,{selling_unit:'SINGLE_GARMENT'});
  assert.deepEqual(result.bindings,[{item_id:ITEM,model_id:'0',size:'M'}]);
  assert.equal(result.unresolved_count,12);
  assert.deepEqual(result.diagnostic.reasons,[{code:'OPTION_NOT_RECOGNIZED',count:4},{code:'INDEX_NOT_VALID',count:8}]);
  assert.deepEqual(projectVariantCatalog(frame(result)),frame(result));
  source.tier_variation[0].option_list=[];
  assert.equal((await deriveCatalogProduct(ITEM,source,{selling_unit:'SINGLE_GARMENT'})).bindings.length,0);
});

test('single-garment rules reject duplicate size axes and unknown axes rather than guessing from names or SKU', async () => {
  for(const axes of [[],[axis('Cor',['Verde'])],[axis('Masculino')],
    [axis('Tamanho'),axis('Size')],[axis('Tamanho'),axis('Estampa',['Verde'])],
    [axis('Tamanho'),axis('Cor',['Verde']),axis('Colour',['Verde'])],
    [axis('Tamanho masculino'),axis('Tamanho feminino')]]){
    const source={tier_variation:axes,model:[{model_id:0,tier_index:axes.map(()=>0),
      model_name:'PRIVATE_SINGLE_GARMENT_SIZE_M',model_sku:'PRIVATE_M'}],item_name:'PRIVATE_CAMISETA_AVULSA_M'};
    const result=await deriveCatalogProduct(ITEM,source,{selling_unit:'SINGLE_GARMENT'});
    assert.deepEqual(result.bindings,[]);assert.equal(result.unresolved_count,1);
    assert.deepEqual(result.diagnostic.reasons,[{code:'AXES_NOT_RECOGNIZED',count:1}]);
    assert.equal(JSON.stringify(result).includes('PRIVATE_'),false);
  }
});

test('single-garment fingerprints include the composition rule while legacy kit fingerprints remain identical', async () => {
  const source={tier_variation:[axis('Cor',['Verde']),axis('Tamanho',['M'])],model:[{model_id:0,tier_index:[0,0]}]};
  const single=await deriveCatalogProduct(ITEM,source,{selling_unit:'SINGLE_GARMENT'});
  const canonical={item_id:ITEM,axes:[{name:'cor',options:['VERDE']},{name:'tamanho',options:['M']}],
    models:[{model_id:'0',tier_index:[0,0]}],selling_unit:'SINGLE_GARMENT'};
  assert.equal(single.catalog_fingerprint,createHash('sha256').update(JSON.stringify(canonical)).digest('hex'));
  assert.notEqual(single.catalog_fingerprint,(await deriveCatalogProduct(ITEM,source)).catalog_fingerprint);
  assert.deepEqual(await deriveCatalogProduct(ITEM,catalog(),{selling_unit:'ONE_MALE_ONE_FEMALE_KIT'}),
    await deriveCatalogProduct(ITEM,catalog()));
  source.model[0].model_sku='PRIVATE_SKU';source.item_name='PRIVATE_TITLE';source.price=123;
  assert.equal((await deriveCatalogProduct(ITEM,source,{selling_unit:'SINGLE_GARMENT'})).catalog_fingerprint,single.catalog_fingerprint);
  source.tier_variation[0].option_list[0].option='Azul';
  assert.notEqual((await deriveCatalogProduct(ITEM,source,{selling_unit:'SINGLE_GARMENT'})).catalog_fingerprint,single.catalog_fingerprint);
  await assert.rejects(deriveCatalogProduct(ITEM,source,{selling_unit:'UNKNOWN'}),invalid);
});

test('single-garment projection is a strict detached product union and never silently changes kit rows', async () => {
  const single=await deriveCatalogProduct(ITEM,{tier_variation:[axis('Tamanho',['M'])],
    model:[{model_id:0,tier_index:[0]}]},{selling_unit:'SINGLE_GARMENT'});
  const copy=projectVariantCatalog(frame(single));
  assert.deepEqual(copy,frame(single));single.bindings[0].size='G3';
  assert.equal(copy.products[0].bindings[0].size,'M');
  const kit=product();kit.selling_unit='ONE_MALE_ONE_FEMALE_KIT';
  assert.deepEqual(projectVariantCatalog(frame(kit)),frame(kit));
  assert.deepEqual(projectVariantCatalog(frame(product())),frame(product()));
  const original=copy;
  const cases=[value=>{delete value.selling_unit;},value=>{value.selling_unit='UNKNOWN';},
    value=>{value.selling_unit=undefined;},value=>{value.selling_unit='ONE_MALE_ONE_FEMALE_KIT';},
    value=>{value.bindings[0].size='m';},value=>{value.bindings[0].size=null;},
    value=>{value.bindings[0].male_size='M';},value=>{value.bindings[0].female_size='M';},
    value=>{value.bindings[0].model_id=0;},value=>{value.bindings[0].item_id='2';}];
  for(const change of cases){const value=structuredClone(original);change(value.products[0]);assert.equal(projectVariantCatalog(value),null);}
  const wrongKit=frame(product());wrongKit.products[0].bindings[0]={item_id:ITEM,model_id:'123',size:'M'};
  assert.equal(projectVariantCatalog(wrongKit),null);
});

test('request composition rule remains optional, explicit and strictly typed without injecting defaults', () => {
  const legacy={item_ids:[ITEM]};assert.deepEqual(projectVariantCatalogRequest(legacy),legacy);
  for(const selling_unit of ['SINGLE_GARMENT','ONE_MALE_ONE_FEMALE_KIT']){
    const source={item_ids:[ITEM],selling_unit},copy=projectVariantCatalogRequest(source);
    assert.deepEqual(copy,source);source.item_ids[0]='2';assert.deepEqual(copy,{item_ids:[ITEM],selling_unit});
  }
  for(const selling_unit of [null,undefined,0,{},true,'single_garment','UNKNOWN','SINGLE_GARMENT ']){
    assert.equal(projectVariantCatalogRequest({item_ids:[ITEM],selling_unit}),null);
  }
  assert.equal(projectVariantCatalogRequest({item_ids:[ITEM],selling_unit:'SINGLE_GARMENT',gender:'male'}),null);
});

test('new composition and size accessors are rejected before execution', async () => {
  let invoked=0;
  const getter={get(){invoked++;throw Error('PRIVATE');},enumerable:true};
  const request={item_ids:[ITEM]};Object.defineProperty(request,'selling_unit',getter);
  assert.equal(projectVariantCatalogRequest(request),null);
  const single=await deriveCatalogProduct(ITEM,{tier_variation:[axis('Tamanho',['M'])],
    model:[{model_id:0,tier_index:[0]}]},{selling_unit:'SINGLE_GARMENT'});
  for(const key of ['selling_unit','size']){
    const value=structuredClone(frame(single));
    Object.defineProperty(key==='selling_unit'?value.products[0]:value.products[0].bindings[0],key,getter);
    assert.equal(projectVariantCatalog(value),null);
  }
  assert.equal(invoked,0);
});

test('single-garment diagnostics preserve bounded source counts while excluding unrelated catalogue payload', async () => {
  const colors=Array.from({length:1000},(_,index)=>'Cor '+index);
  const source={tier_variation:[axis('Cor',colors),axis('Tamanho',[...sizes,'XL'])],
    model:[{model_id:0,tier_index:[999,6],model_name:'PRIVATE_MODEL',model_sku:'PRIVATE_SKU'},
      {model_id:1,tier_index:[0,7]}],item_name:'PRIVATE_TITLE',buyer_name:'PRIVATE_BUYER',price:123,access_token:'PRIVATE_TOKEN'};
  const result=await deriveCatalogProduct(ITEM,source,{selling_unit:'SINGLE_GARMENT'});
  assert.deepEqual(result.bindings,[{item_id:ITEM,model_id:'0',size:'G3'}]);
  assert.equal(result.unresolved_count,1);
  assert.deepEqual(result.diagnostic,{axes:[{name:'Cor',options:colors.slice(0,7),option_count:1000},
    {name:'Tamanho',options:sizes,option_count:8}],model_count:2,reasons:[{code:'OPTION_NOT_RECOGNIZED',count:1}]});
  const projected=projectVariantCatalog(frame(result));assert.deepEqual(projected,frame(result));
  for(const forbidden of ['PRIVATE_','Cor 999','model_name','model_sku','price','access_token','buyer_name']){
    assert.equal(JSON.stringify(projected).includes(forbidden),false);
  }
  source.tier_variation[0].option_list.push({option:'One too many'});
  await assert.rejects(deriveCatalogProduct(ITEM,source,{selling_unit:'SINGLE_GARMENT'}),invalid);
});
