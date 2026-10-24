import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {runFinanceVariantCatalog} from '../src/variant-catalog.mjs';

const key = 'fixture-catalog-key-ç';
const access = 'fixture-catalog-access';
const catalog = () => ({error: '', response: {
  tier_variation: [{name: 'Tamanho feminino', option_list: [{option: 'G1'}, {option: 'GG'}]},
    {name: 'Tamanho masculino', option_list: [{option: 'P'}, {option: 'G2'}]}],
  model: [{model_id: 456, tier_index: [0, 1], model_sku: 'DO_NOT_EXPORT'},
    {model_id: 457, tier_index: [1, 0]}], buyer: 'DO_NOT_EXPORT',
}});
async function fixture(ttl = 500) {
  const now = () => 1792405689000;
  const env = {FINANCE_DB: new D1(), FINANCE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    FINANCE_CONNECTION_ENABLED: 'true', SHOPEE_FINANCE_PARTNER_KEY: key};
  const store = await createFinanceStore(env, {now}); await store.setup();
  await store.saveTokens({access_token: access, refresh_token: 'fixture-refresh', expires_at: now() / 1000 + ttl});
  const calls = [];
  const run = (overrides = {}) => runFinanceVariantCatalog(env, {now, item_ids: ['123'],
    fetchImpl: async request => {calls.push(request); return Response.json(catalog());}, ...overrides});
  return {env, store, calls, run, now};
}
test('catalogue reads fixed Global shop models once per requested product and maps reversed gender axes', async () => {
  const f = await fixture(); const before = await f.store.readTokens();
  const result = await f.run({item_ids: ['123', '124', '125']});
  assert.equal(f.calls.length, 3); assert.equal(result.products.length, 3);
  assert.deepEqual(result.products[0].bindings, [
    {item_id: '123', model_id: '456', male_size: 'G2', female_size: 'G1'},
    {item_id: '123', model_id: '457', male_size: 'P', female_size: 'GG'},
  ]);
  for (let i = 0; i < 3; i++) {
    const r = f.calls[i], u = new URL(r.url);
    assert.equal(u.origin, 'https://partner.shopeemobile.com');
    assert.equal(u.pathname, '/api/v2/product/get_model_list'); assert.equal(r.method, 'GET');
    assert.equal(r.redirect, 'manual'); assert.equal(await r.clone().text(), '');
    assert.equal(r.headers.get('cookie'), null); assert.equal(r.headers.get('authorization'), null);
    assert.equal(u.searchParams.get('shop_id'), '1178167501');
    assert.equal(u.searchParams.get('partner_id'), '2049333');
    assert.equal(u.searchParams.get('item_id'), String(123 + i));
    assert.equal(u.searchParams.get('sign'), createHmac('sha256', key)
      .update('2049333' + u.pathname + u.searchParams.get('timestamp') + access + '1178167501').digest('hex'));
  }
  assert.deepEqual(await f.store.readTokens(), before);
  for (const privateValue of [key, access, 'fixture-refresh', 'DO_NOT_EXPORT', 'buyer', 'model_sku']) {
    assert.ok(!JSON.stringify(result).includes(privateValue));
  }
});
test('unknown catalogue axes produce unresolved entries without assuming option order or guessing SKU', async () => {
  const f = await fixture();
  const result = await f.run({fetchImpl: async () => {
    const body = catalog(); body.response.tier_variation[0].name = 'Opção 1'; return Response.json(body);
  }});
  assert.deepEqual(result.products[0].bindings, []); assert.equal(result.products[0].unresolved_count, 2);
});
test('explicit single garment reads the observed Cor and Tamanho catalogue without doubling its garments', async () => {
  const f = await fixture(); const before = await f.store.readTokens(); let reads = 0;
  const result = await f.run({item_ids: ['22199878767'], selling_unit: 'SINGLE_GARMENT',fetchImpl: async request => {
    reads++; const url = new URL(request.url);
    assert.equal(url.origin, 'https://partner.shopeemobile.com');
    assert.equal(url.pathname, '/api/v2/product/get_model_list');
    assert.equal(url.searchParams.get('item_id'), '22199878767');
    assert.equal(url.searchParams.get('selling_unit'), null);
    assert.equal(url.searchParams.get('sign'), createHmac('sha256', key)
      .update('2049333' + url.pathname + url.searchParams.get('timestamp') + access + '1178167501').digest('hex'));
    return Response.json({error:'',response:{
      tier_variation:[{name:'Cor',option_list:[{option:'Verde'}]},
        {name:'Tamanho',option_list:['p','m','g','gg'].map(option=>({option}))}],
      model:[0,1,2,3].map(index=>({model_id:189627799547+index,tier_index:[0,index],model_sku:'DO_NOT_EXPORT'})),
    }});
  }});
  assert.equal(reads,1);assert.equal(result.products.length,1);
  const product=result.products[0];
  assert.equal(product.item_id,'22199878767');assert.equal(product.selling_unit,'SINGLE_GARMENT');
  assert.equal(product.unresolved_count,0);
  assert.deepEqual(product.bindings,['P','M','G','GG'].map((size,index)=>({item_id:'22199878767',model_id:String(189627799547+index),size})));
  assert.ok(!JSON.stringify(result).includes('male_size'));assert.ok(!JSON.stringify(result).includes('female_size'));
  assert.ok(!JSON.stringify(result).includes('DO_NOT_EXPORT'));
  assert.deepEqual(await f.store.readTokens(),before);
});
test('invalid scope, item and configuration fail before provider reads', async () => {
  for (const item_ids of [[], ['0'], ['123', '123'], ['1', '2', '3', '4'], [123], ['001']]) {
    const f = await fixture(); await assert.rejects(f.run({item_ids})); assert.equal(f.calls.length, 0);
  }
  for (const change of [env => {env.FINANCE_CONNECTION_ENABLED = 'false';}, env => {delete env.SHOPEE_FINANCE_PARTNER_KEY;}]) {
    const f = await fixture(); change(f.env); await assert.rejects(f.run()); assert.equal(f.calls.length, 0);
  }
  for (const selling_unit of [undefined,null,true,'garment','SINGLE_GARMENT ']) {
    const f = await fixture(); await assert.rejects(f.run({selling_unit})); assert.equal(f.calls.length,0);
  }
});
test('provider permission, malformed scope and redirect errors never retry or invalidate a working connection', async () => {
  for (const response of [Response.json({error: 'error_api_permission', message: key}),
    Response.json({...catalog(), shop_id: 999}), Response.json({error: '', response: {}}),
    new Response(null, {status: 302, headers: {location: 'https://other.invalid'}}),
    new Response('x'.repeat(65537), {headers: {'content-type': 'application/json'}})]) {
    const f = await fixture(); let calls = 0; const before = await f.store.readTokens();
    await assert.rejects(f.run({fetchImpl: async () => {calls++; return response;}}), error => {
      assert.ok(!String(error).includes(key)); return true;
    });
    assert.equal(calls, 1); assert.deepEqual(await f.store.readTokens(), before);
  }
});

test('AUTO reads one bounded catalogue request per product and projects mixed resolved compositions', async () => {
  const f=await fixture(),before=await f.store.readTokens();let reads=0;
  const result=await f.run({item_ids:['123','124','125'],selling_unit:'AUTO',fetchImpl:async request=>{
    reads++;const url=new URL(request.url);
    assert.equal(url.origin,'https://partner.shopeemobile.com');
    assert.equal(url.pathname,'/api/v2/product/get_model_list');
    assert.equal(url.searchParams.get('selling_unit'),null);
    assert.equal(url.searchParams.get('sign'),createHmac('sha256',key)
      .update('2049333'+url.pathname+url.searchParams.get('timestamp')+access+'1178167501').digest('hex'));
    if(url.searchParams.get('item_id')==='123')return Response.json(catalog());
    if(url.searchParams.get('item_id')==='124')return Response.json({error:'',response:{
      tier_variation:[{name:'Cor',option_list:[{option:'Verde'}]},
        {name:'Tamanho',option_list:[{option:'P'},{option:'GG'}]}],
      model:[{model_id:0,tier_index:[0,0]},{model_id:1,tier_index:[0,1]}],buyer_name:'DO_NOT_EXPORT'}});
    return Response.json({error:'',response:{tier_variation:[{name:'Opção',option_list:[{option:'A'}]}],
      model:[{model_id:0,tier_index:[0]}],model_sku:'DO_NOT_EXPORT'}});
  }});
  assert.equal(reads,3);assert.equal(result.products.length,3);
  assert.equal(result.products[0].selling_unit||'ONE_MALE_ONE_FEMALE_KIT','ONE_MALE_ONE_FEMALE_KIT');
  assert.equal(result.products[0].bindings.length,2);
  assert.equal(result.products[1].selling_unit,'SINGLE_GARMENT');
  assert.deepEqual(result.products[1].bindings,[{item_id:'124',model_id:'0',size:'P'},{item_id:'124',model_id:'1',size:'GG'}]);
  assert.equal(result.products[2].bindings.length,0);assert.equal(result.products[2].unresolved_count,1);
  assert.ok(result.products.every(row=>row.selling_unit!=='AUTO'));
  assert.deepEqual(await f.store.readTokens(),before);
  assert.equal(JSON.stringify(result).includes('DO_NOT_EXPORT'),false);
});

test('opt-in cost catalogue reads fixed product metadata and exact child options without borrowing adult sizes or exposing unrelated data',async()=>{
 const f=await fixture(),before=await f.store.readTokens(),calls=[];
 const result=await f.run({selling_unit:'AUTO',include_cost_catalog:true,fetchImpl:async request=>{
  const url=new URL(request.url);calls.push(url);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(url.searchParams.get('shop_id'),'1178167501');assert.equal(url.searchParams.get('partner_id'),'2049333');
  assert.equal(url.searchParams.get('sign'),createHmac('sha256',key).update('2049333'+url.pathname+url.searchParams.get('timestamp')+access+'1178167501').digest('hex'));
  if(url.pathname==='/api/v2/product/get_item_base_info'){assert.equal(url.searchParams.get('item_id_list'),'123');return Response.json({error:'',response:{item_list:[{item_id:123,item_name:'Camiseta Infantil Estrela',description:'DO_NOT_EXPORT',price_info:[{price:9999}],buyer:'DO_NOT_EXPORT'}]}});}
  assert.equal(url.pathname,'/api/v2/product/get_model_list');return Response.json({error:'',response:{tier_variation:[{name:'Cor',option_list:[{option:'Vermelho'}]},{name:'Tamanho',option_list:['4','6','8','10','12','14','16'].map(option=>({option}))}],model:Array.from({length:7},(_,i)=>({model_id:i,tier_index:[0,i],model_sku:'DO_NOT_EXPORT'}))}});
 }});
 assert.equal(calls.length,2);assert.equal(result.products[0].bindings.length,0);assert.equal(result.products[0].unresolved_count,7);
 assert.equal(result.products[0].cost_catalog.product_name,'Camiseta Infantil Estrela');assert.deepEqual(result.products[0].cost_catalog.variants.map(row=>row.attributes[1].value),['4','6','8','10','12','14','16']);
 assert.equal(JSON.stringify(result).includes('DO_NOT_EXPORT'),false);assert.equal(JSON.stringify(result).includes('price_info'),false);assert.deepEqual(await f.store.readTokens(),before);
});

test('cost metadata with another product or shop fails before model reads and does not change the connection',async()=>{
 for(const payload of [{error:'',shop_id:9,response:{item_list:[{item_id:123,item_name:'Camiseta Infantil'}]}},{error:'',response:{item_list:[{item_id:999,item_name:'Camiseta Infantil'}]}},{error:'error_api_permission',response:{item_list:[]}}]){
  const f=await fixture(),before=await f.store.readTokens();let calls=0;
  await assert.rejects(f.run({include_cost_catalog:true,fetchImpl:async()=>{calls++;return Response.json(payload);}}));assert.equal(calls,1);assert.deepEqual(await f.store.readTokens(),before);
 }
});
