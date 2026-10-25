import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {runFinanceVariantCatalog} from '../src/variant-catalog.mjs';
import {financeCatalogDiagnostic,projectVariantCatalogFailure} from '../src/variant-catalog-frame.mjs';
import {getFinanceVariantCatalog} from '../../cloudflare/src/app-finance-sample.mjs';
import {storeCatalogClassificationFrame,enqueueCatalogClassifications,runCatalogClassifications,readCatalogClassificationState} from '../../cloudflare/src/catalog-classification.mjs';
import {readCostRuleReference} from '../../cloudflare/src/cost-rules.mjs';
import {COST_DEFAULTS,productionCostReference} from '../../cloudflare/src/production-costs.mjs';

const stamp=1792405689,now=()=>stamp*1000,key='fixture-private-catalog-diagnostic-key',access='PRIVATE_DIAGNOSTIC_ACCESS',refresh='PRIVATE_DIAGNOSTIC_REFRESH';
const base='/api/v2/product/get_item_base_info',models='/api/v2/product/get_model_list';
const response=payload=>Response.json(payload),validBase=()=>({error:'',response:{item_list:[{item_id:123,item_name:'Camiseta adulta'}]}}),validModels=()=>({error:'',response:{tier_variation:[{name:'Tamanho',option_list:[{option:'M'}]}],model:[{model_id:456,tier_index:[0]}]}});
const unavailable=(code,stage='TRANSPORT',http=null)=>({schema:'variant_catalog_v1',status:'UNAVAILABLE',diagnostic:{stage,code,http}});
async function financeFixture(t){
 const env={FINANCE_DB:new D1(),FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,11).toString('base64'),FINANCE_CONNECTION_ENABLED:'true',SHOPEE_FINANCE_PARTNER_KEY:key};t.after(()=>env.FINANCE_DB.db.close());
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:access,refresh_token:refresh,expires_at:stamp+14400});
 return {env,store,run:fetchImpl=>runFinanceVariantCatalog(env,{item_ids:['123'],selling_unit:'AUTO',include_cost_catalog:true,now,fetchImpl})};
}
const safeCatalog=()=>({schema:'variant_catalog_v1',checked_at:stamp,products:[{item_id:'123',selling_unit:'SINGLE_GARMENT',catalog_fingerprint:'a'.repeat(64),bindings:[{item_id:'123',model_id:'456',size:'M'}],unresolved_count:0,cost_catalog:{schema:'product_cost_catalog_v1',product_name:'Camiseta adulta',variants:[{model_id:'456',attributes:[{name:'Tamanho',value:'M'}]}]}}]});

test('base-info failures identify absent items and unavailable titles before model reads without exposing credentials',async t=>{
 const cases=[
  [{error:'',response:{item_list:[]}},'FINANCE_CATALOG_BASE_ITEM_ABSENT'],
  [{error:'',response:{item_list:[{item_id:123}]}},'FINANCE_CATALOG_BASE_NAME_UNAVAILABLE'],
  [{error:'',response:{item_list:[{item_id:123,item_name:''}]}},'FINANCE_CATALOG_BASE_NAME_UNAVAILABLE'],
  [{error:'PRIVATE_UNKNOWN_PROVIDER_ERROR',message:key,response:{item_list:[]}},'FINANCE_CATALOG_BASE_API_REJECTED'],
  [{error:'',response:{item_list:null}},'FINANCE_CATALOG_BASE_RESPONSE_INVALID'],
 ];
 for(const [payload,code] of cases){
  const f=await financeFixture(t),before=await f.store.readTokens(),calls=[];
  await assert.rejects(f.run(async request=>{calls.push(new URL(request.url).pathname);return response(payload);}),error=>{
   assert.equal(error.code,code);assert.equal(financeCatalogDiagnostic(error).stage,'BASE_INFO');assert.equal(financeCatalogDiagnostic(error).code,code);assert.doesNotMatch(JSON.stringify(financeCatalogDiagnostic(error)),/PRIVATE|fixture-private|message|access_token|refresh_token/);return true;
  });
  assert.deepEqual(calls,[base]);assert.deepEqual(await f.store.readTokens(),before);
 }
});

test('model API errors and malformed model structures have distinct finite causes after a valid base response',async t=>{
 for(const [payload,code] of [[{error:'PRIVATE_UNKNOWN_PROVIDER_ERROR',message:key},'FINANCE_CATALOG_MODEL_API_REJECTED'],[{error:'',response:null},'FINANCE_CATALOG_MODEL_RESPONSE_INVALID'],[{error:'',response:{tier_variation:'not-an-array',model:[]}},'FINANCE_CATALOG_MODEL_STRUCTURE_INVALID']]){
  const f=await financeFixture(t),before=await f.store.readTokens(),calls=[];
  await assert.rejects(f.run(async request=>{const path=new URL(request.url).pathname;calls.push(path);return response(path===base?validBase():payload);}),error=>{assert.equal(error.code,code);assert.equal(financeCatalogDiagnostic(error).stage,'MODELS');return true;});
  assert.deepEqual(calls,[base,models]);assert.deepEqual(await f.store.readTokens(),before);
 }
});

test('valid provider catalogue metadata may exceed 64 KiB but remains bounded to one MiB per read',async t=>{
 const f=await financeFixture(t),calls=[];
 const result=await f.run(async request=>{const path=new URL(request.url).pathname;calls.push(path);const payload=path===base?validBase():validModels();payload.response.unused_provider_metadata='PRIVATE_METADATA_'.repeat(6000);assert.ok(Buffer.byteLength(JSON.stringify(payload))>65536);return response(payload);});
 assert.equal(result.products[0].bindings[0].size,'M');assert.deepEqual(calls,[base,models]);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_METADATA/);
 const oversized=await financeFixture(t);let reads=0;
 await assert.rejects(oversized.run(async()=>{reads++;const payload=validBase();payload.response.unused_provider_metadata='x'.repeat(1048576);return response(payload);}),error=>{assert.deepEqual(financeCatalogDiagnostic(error),{stage:'BASE_INFO',code:'FINANCE_CATALOG_UPSTREAM_BODY_TOO_LARGE',http:null});return true;});assert.equal(reads,1);
});

test('App preserves validated source diagnostics on non-200 responses and never forwards arbitrary provider text',async()=>{
 const expected=unavailable('FINANCE_CATALOG_BASE_ITEM_ABSENT','BASE_INFO',403);let calls=0;
 const value=await getFinanceVariantCatalog({APP_INTERNAL_SECRET:'fixture-app-private-key'},{item_ids:['123'],selling_unit:'AUTO',include_cost_catalog:true},{fetchImpl:async request=>{calls++;assert.equal(new URL(request.url).pathname,'/internal/shopee/finance/variant-catalog');assert.equal(request.redirect,'manual');return Response.json(expected,{status:503});}});
 assert.deepEqual(value,expected);assert.equal(calls,1);
 const poisoned={...expected,diagnostic:{...expected.diagnostic,message:'PRIVATE_UPSTREAM_MESSAGE'}};
 const rejected=await getFinanceVariantCatalog({APP_INTERNAL_SECRET:'fixture-app-private-key'},{item_ids:['123'],selling_unit:'AUTO',include_cost_catalog:true},{fetchImpl:async()=>Response.json(poisoned,{status:503})});
 assert.equal(rejected.status,'UNAVAILABLE');assert.doesNotMatch(JSON.stringify(rejected),/PRIVATE|message|fixture-app-private/);assert.ok(projectVariantCatalogFailure(rejected));
});

test('an actual App timeout remains CATALOG_TIMEOUT after twenty failures and preserves the last good registered cost',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());await storeCatalogClassificationFrame(env,safeCatalog(),{now});
 env.ADMIN_DB.db.prepare('UPDATE catalog_classification_jobs SET next_attempt_at=?,failure_count=19 WHERE item_id=?').run(stamp+1,'123');
 const before={catalog:env.ADMIN_DB.db.prepare('SELECT payload FROM production_cost_catalog WHERE item_id=?').get('123').payload,variant:env.ADMIN_DB.db.prepare('SELECT payload FROM catalog_classification_variants WHERE item_id=?').get('123').payload};
 let calls=0;const at=()=>1000*(stamp+1),source=(_,input)=>getFinanceVariantCatalog({APP_INTERNAL_SECRET:'fixture-app-private-key'},input,{timeoutMs:5,fetchImpl:async()=>{calls++;return new Promise(()=>{});}});
 const result=await runCatalogClassifications(env,source,{now:at,maxProducts:1});assert.deepEqual(result.failed,['123']);assert.equal(calls,1);
 let job=result.state.products.find(row=>row.item_id==='123');assert.equal(job.reason,'CATALOG_TIMEOUT');assert.equal(job.status,'RETRY_WAIT');assert.equal(job.failure_count,20);assert.equal(job.next_attempt_at,stamp+1+1800);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT payload FROM production_cost_catalog WHERE item_id=?').get('123').payload,before.catalog);assert.equal(env.ADMIN_DB.db.prepare('SELECT payload FROM catalog_classification_variants WHERE item_id=?').get('123').payload,before.variant);
 const automatic=await readCostRuleReference(env,['123'],{now:at}),cost=productionCostReference({status:'AVAILABLE',rows:[{item_id:'123',model_id:'456',quantity:2}]},{revision:1,bindings:[]},{revision:1,values:{...COST_DEFAULTS,inclusive_plus_cents:2140,components:[]}},automatic);assert.equal(cost.total_cents,3180);
 assert.equal((await runCatalogClassifications(env,source,{now:at,maxProducts:1})).status,'IDLE');assert.equal(calls,1);
 assert.equal((await runCatalogClassifications(env,source,{now:()=>1000*(stamp+1802),maxProducts:1,canRun:async()=>false})).status,'PAUSED');assert.equal(calls,1);job=(await readCatalogClassificationState(env,{}, {now:at})).products[0];assert.equal(job.failure_count,20);assert.equal(job.reason,'CATALOG_TIMEOUT');
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|fixture-app-private|access_token|refresh_token|source_hash/);
 const proof=env.ADMIN_DB.db.prepare('SELECT * FROM catalog_classification_source_diagnostics WHERE item_id=?').get('123');assert.deepEqual(JSON.parse(proof.diagnostic),{stage:'APP',code:'FINANCE_CATALOG_APP_TIMEOUT',http:null});assert.equal(proof.failure_count,20);
 const recovered=await runCatalogClassifications(env,async()=>({...safeCatalog(),checked_at:stamp+1802}),{now:()=>1000*(stamp+1802),maxProducts:1});assert.deepEqual(recovered.processed,['123']);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM catalog_classification_source_diagnostics').get().n,0,'a validated success retires the old failure evidence');
});

test('known unavailable causes remain separate from a genuinely malformed successful catalogue',async t=>{
 const cases=[['FINANCE_CATALOG_BASE_ITEM_ABSENT','BASE_INFO','CATALOG_BASE_ITEM_ABSENT'],['FINANCE_CATALOG_BASE_NAME_UNAVAILABLE','BASE_INFO','CATALOG_BASE_NAME_UNAVAILABLE'],['FINANCE_CATALOG_BASE_API_REJECTED','BASE_INFO','CATALOG_BASE_API_REJECTED'],['FINANCE_CATALOG_MODEL_API_REJECTED','MODELS','CATALOG_MODEL_API_REJECTED'],['FINANCE_CATALOG_MODEL_STRUCTURE_INVALID','MODELS','CATALOG_MODEL_STRUCTURE_INVALID'],['FINANCE_CATALOG_RATE_LIMIT','TRANSPORT','CATALOG_RATE_LIMIT'],['FINANCE_CATALOG_AUTH_REQUIRED','CONFIGURATION','CATALOG_AUTH_REQUIRED'],['FINANCE_CATALOG_PERMISSION_REQUIRED','MODELS','CATALOG_PERMISSION_REQUIRED'],['FINANCE_CATALOG_UPSTREAM_HTTP','TRANSPORT','CATALOG_HTTP_ERROR']];
 for(const [code,stage,reason] of cases){const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());await enqueueCatalogClassifications(env,['123'],{now,returnState:false});const result=await runCatalogClassifications(env,async()=>unavailable(code,stage,code==='FINANCE_CATALOG_UPSTREAM_HTTP'?503:null),{now,maxProducts:1});assert.equal(result.state.products[0].reason,reason,code);assert.notEqual(result.state.products[0].reason,'CATALOG_INVALID');}
 const malformed={ADMIN_DB:new D1()};t.after(()=>malformed.ADMIN_DB.db.close());await enqueueCatalogClassifications(malformed,['123'],{now,returnState:false});const result=await runCatalogClassifications(malformed,async()=>({schema:'variant_catalog_v1',checked_at:stamp,products:[{unexpected:'PRIVATE_PROVIDER_TEXT'}]}),{now,maxProducts:1});assert.equal(result.state.products[0].reason,'CATALOG_INVALID');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_PROVIDER_TEXT/);
});

test('failure projection is standalone, finite and detached without invoking coercions or accessors',()=>{
 const value=unavailable('FINANCE_CATALOG_BASE_ITEM_ABSENT','BASE_INFO',403),copy=projectVariantCatalogFailure(value);assert.deepEqual(copy,value);copy.diagnostic.http=500;assert.equal(value.diagnostic.http,403);
 for(const poisoned of [{...value,access_token:access},{...value,diagnostic:{...value.diagnostic,message:key}},{...value,diagnostic:{...value.diagnostic,stage:'ARBITRARY_STAGE'}},{...value,diagnostic:{...value.diagnostic,code:'PRIVATE_RAW_ERROR'}}])assert.equal(projectVariantCatalogFailure(poisoned),null);
 let calls=0;const getter={...value};Object.defineProperty(getter,'diagnostic',{get(){calls++;return value.diagnostic;},enumerable:true});assert.equal(projectVariantCatalogFailure(getter),null);const coerced={...value,diagnostic:{...value.diagnostic,code:{toString(){calls++;return value.diagnostic.code;}}}};assert.equal(projectVariantCatalogFailure(coerced),null);assert.equal(calls,0);
 const context=vm.createContext({serialized:JSON.stringify(value)});new vm.Script(projectVariantCatalogFailure.toString()+'\nglobalThis.actual=projectVariantCatalogFailure(JSON.parse(serialized));').runInContext(context);assert.deepEqual(JSON.parse(JSON.stringify(context.actual)),value);
 const unknown=financeCatalogDiagnostic(new Error('PRIVATE_AUTH_TOKEN'));assert.doesNotMatch(JSON.stringify(unknown),/PRIVATE_AUTH_TOKEN/);assert.ok(projectVariantCatalogFailure({schema:'variant_catalog_v1',status:'UNAVAILABLE',diagnostic:unknown}));
});
