import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {D1} from './sqlite-d1.mjs';
import {createTenantDatabase,tenantNamespace} from '../src/tenant-storage.mjs';
import {COST_SCHEMA,COST_DEFAULTS} from '../src/production-costs.mjs';
import {readProductRegistry,runProductRegistry,projectProductRegistryFrame} from '../src/product-registry.mjs';
import {getFinanceProductIndex} from '../src/app-product-index.mjs';
import {projectProductIndexDiagnostic} from '../../finance/src/product-index-frame.mjs';
import {FinanceConnectionError} from '../../finance/src/connection-store.mjs';
import {createFinanceWorker} from '../../finance/src/connection-worker.mjs';
import {forwardFinancePaymentSample} from '../../finance/src/auth-router.mjs';
const origin='https://auth.brazacommerce.com.br',path='/internal/shopee/finance/product-index',appKey='synthetic-index-app-'.repeat(3),routerKey='synthetic-index-router-'.repeat(3),input={offset:0,page_size:50,item_status:'BANNED'},stamp=Date.UTC(2026,10,16,12)/1000;
const unavailable=diagnostic=>({schema:'product_index_v1',status:'UNAVAILABLE',diagnostic});
async function fixture(t,db=null){
 if(db===null){db=new D1();t.after(()=>db.db.close());}
 const env={ADMIN_DB:db},time={value:stamp*1000},now=()=>time.value;
 await db.batch(COST_SCHEMA.map(sql=>db.prepare(sql)));await db.prepare('CREATE TABLE IF NOT EXISTS variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)').run();await db.prepare('INSERT INTO variant_bindings_state VALUES(1,1,?,?)').bind('[]',new Date(now()).toISOString()).run();await db.prepare('INSERT INTO production_costs_state VALUES(1,1,?,?)').bind(JSON.stringify(COST_DEFAULTS),new Date(now()).toISOString()).run();await readProductRegistry(env,{}, {now});await db.prepare("UPDATE product_registry_state SET status_index=1,offset=50,next_run_at=0").run();
 return {env,db,time,now,diagnostic:()=>db.prepare('SELECT * FROM product_registry_source_diagnostics').first(),state:()=>db.prepare('SELECT * FROM product_registry_state').first(),run:getIndex=>runProductRegistry(env,getIndex,{now,returnState:false}),retry(){time.value+=31000;},available:selection=>({schema:'product_index_v1',status:'AVAILABLE',shop_id:1178167501,checked_at:Math.floor(now()/1000),...selection,total_count:0,has_more:false,next_offset:null,items:[]})};
}
test('closed diagnostic projection retains provider/BUSY and only existing App codes without invoking accessors',()=>{
 for(const code of ['FINANCE_PRODUCT_INDEX_UPSTREAM_HTTP','FINANCE_PRODUCT_INDEX_BUSY','FINANCE_PRODUCT_INDEX_AUTH_REQUIRED','FINANCE_PRODUCT_INDEX_UNAVAILABLE'])assert.deepEqual(projectProductIndexDiagnostic({code,http:403}),{code,http:403});
 for(const suffix of ['CONFIGURATION','RESPONSE_INVALID','HTTP_ERROR','TIMEOUT','UPSTREAM_FAILED']){const value={code:'FINANCE_PRODUCT_INDEX_APP_'+suffix,http:null};assert.deepEqual(projectProductIndexDiagnostic(value,{app:true}),value);assert.equal(projectProductIndexDiagnostic(value),null);}
 let called=0;for(const value of [{code:'PRIVATE_TOKEN',http:403},{code:'FINANCE_PRODUCT_INDEX_UPSTREAM_HTTP',http:403,private:'PRIVATE'},{get code(){called++;throw Error('PRIVATE');},http:403},{code:'FINANCE_PRODUCT_INDEX_UPSTREAM_HTTP',get http(){called++;throw Error('PRIVATE');}},new Proxy({},{ownKeys(){throw Error('PRIVATE');}})])assert.equal(projectProductIndexDiagnostic(value,{app:true}),null);assert.equal(called,0);
});
test('Finance error diagnostic survives Auth, App and durable registry failure without retry or cursor advancement',async t=>{
 const f=await fixture(t);let provider=0,services=0;
 const finance=createFinanceWorker({productIndex:async()=>{provider++;throw Object.assign(new FinanceConnectionError('FINANCE_PRODUCT_INDEX_UPSTREAM_HTTP',502),{upstream_status:403,private:'PRIVATE_PROVIDER_PAYLOAD'});},fetchImpl:async()=>{throw Error('NO_PROVIDER_NETWORK');}});
 const before=await f.state(),result=await f.run((env,selected)=>getFinanceProductIndex({...env,APP_INTERNAL_SECRET:appKey},selected,{fetchImpl:request=>forwardFinancePaymentSample(request,{FINANCE_ROUTER_SECRET:routerKey,SHOPEE_FINANCE_SERVICE:{fetch:routed=>{services++;return finance.fetch(routed,{FINANCE_ROUTER_SECRET:routerKey,FINANCE_CONNECTION_ENABLED:'true'});}}},{validateInternalApp:request=>request.headers.get('x-braza-app-key')===appKey})}));
 assert.equal(result.status,'ERROR');assert.equal(provider,1);assert.equal(services,1);const after=await f.state();assert.equal(after.status_index,before.status_index);assert.equal(after.offset,before.offset);assert.equal(after.failure_count,1);assert.equal(after.last_error,'PRODUCT_REGISTRY_SOURCE_UNAVAILABLE');assert.equal(after.next_run_at,stamp+30);assert.deepEqual({...await f.diagnostic()},{id:1,item_status:'BANNED',offset:50,code:'FINANCE_PRODUCT_INDEX_UPSTREAM_HTTP',http:403,checked_at:stamp});assert.doesNotMatch(JSON.stringify(result),/UPSTREAM_HTTP|PRIVATE/);assert.ok(projectProductRegistryFrame(await readProductRegistry(f.env,{}, {now:f.now})));
});
for(const status of [200,502])test('known unavailable index diagnostic is retained for HTTP'+status+' while malformed private data is discarded',async()=>{
 const body=unavailable({code:'FINANCE_PRODUCT_INDEX_BUSY',http:null});let reads=0;const known=await getFinanceProductIndex({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async()=>{reads++;return Response.json(body,{status});}});assert.deepEqual(known,body);assert.equal(reads,1);
 const rejected=await getFinanceProductIndex({APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async()=>Response.json(unavailable({code:'PRIVATE_TOKEN',http:403,private:'PRIVATE_BUYER'}),{status})});assert.equal(rejected.status,'UNAVAILABLE');assert.doesNotMatch(JSON.stringify(rejected),/PRIVATE/);assert.equal(rejected.diagnostic.code,status===200?'FINANCE_PRODUCT_INDEX_APP_RESPONSE_INVALID':'FINANCE_PRODUCT_INDEX_APP_HTTP_ERROR');
});
test('unavailable diagnostics with accessors never execute getters or persist private text',async t=>{
 const f=await fixture(t);let calls=0;const diagnostic={get code(){calls++;return 'PRIVATE';},http:403};const result=await f.run(async()=>unavailable(diagnostic));assert.equal(result.status,'ERROR');assert.equal(calls,0);assert.equal((await f.diagnostic()).code,'PRODUCT_REGISTRY_SOURCE_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(await f.diagnostic()),/PRIVATE/);
});
test('successful discovery clears the previous diagnostic in its guarded transaction and retains the public DTO',async t=>{
 const f=await fixture(t);await f.run(async()=>unavailable({code:'FINANCE_PRODUCT_INDEX_APP_TIMEOUT',http:null}));assert.ok(await f.diagnostic());f.retry();const result=await f.run(async(_,selection)=>f.available(selection));assert.equal(result.status,'PROGRESSED');assert.equal(await f.diagnostic(),null);assert.equal(result.state.item_status,'UNLIST');assert.equal(result.state.offset,0);assert.ok(projectProductRegistryFrame(await readProductRegistry(f.env,{}, {now:f.now})));
});
for(const reason of ['CAS_LOST','LEASE_EXPIRED'])test('failed discovery cannot replace the diagnostic after '+reason,async t=>{
 const f=await fixture(t);await f.run(async()=>unavailable({code:'FINANCE_PRODUCT_INDEX_APP_TIMEOUT',http:null}));const before=await f.diagnostic();f.retry();const result=await f.run(async()=>{if(reason==='CAS_LOST')await f.db.prepare('UPDATE product_registry_state SET revision=revision+1').run();else f.time.value+=61000;return unavailable({code:'FINANCE_PRODUCT_INDEX_RATE_LIMIT',http:429});});assert.equal(result.status,'LEASED');assert.deepEqual(await f.diagnostic(),before);
});
test('registry diagnostics are isolated by tenant rather than shared shop or singleton ID',async t=>{
 const raw=new D1();t.after(()=>raw.db.close());const A={organizationId:'synthetic-org-a',storeId:'same-store',namespace:await tenantNamespace('synthetic-org-a','same-store')},B={organizationId:'synthetic-org-b',storeId:'same-store',namespace:await tenantNamespace('synthetic-org-b','same-store')},a=await fixture(t,createTenantDatabase(raw,A)),b=await fixture(t,createTenantDatabase(raw,B));
 await a.run(async()=>unavailable({code:'FINANCE_PRODUCT_INDEX_APP_TIMEOUT',http:null}));assert.equal((await a.diagnostic()).code,'FINANCE_PRODUCT_INDEX_APP_TIMEOUT');assert.equal(await b.diagnostic(),null);await b.run(async()=>unavailable({code:'FINANCE_PRODUCT_INDEX_UPSTREAM_HTTP',http:403}));assert.equal((await b.diagnostic()).http,403);assert.equal((await a.diagnostic()).http,null);
});

test('a successful stale or expired page cannot clear an existing diagnostic',async t=>{
 const f=await fixture(t);await f.run(async()=>unavailable({code:'FINANCE_PRODUCT_INDEX_APP_TIMEOUT',http:null}));const before=await f.diagnostic();f.retry();const result=await f.run(async(_,selection)=>{await f.db.prepare('UPDATE product_registry_state SET revision=revision+1').run();return f.available(selection);});assert.equal(result.status,'LEASED');assert.deepEqual(await f.diagnostic(),before);
});
test('failure diagnostic and failed-state commit roll back together on a transaction error',async t=>{
 const f=await fixture(t);await f.run(async()=>unavailable({code:'FINANCE_PRODUCT_INDEX_APP_TIMEOUT',http:null}));const before=await f.diagnostic();f.retry();await f.db.prepare("CREATE TRIGGER synthetic_reject_registry_failure BEFORE UPDATE ON product_registry_state WHEN NEW.status='RETRY_WAIT' BEGIN SELECT RAISE(ABORT,'synthetic transaction refusal');END").run();await assert.rejects(f.run(async()=>unavailable({code:'FINANCE_PRODUCT_INDEX_RATE_LIMIT',http:429})),/synthetic transaction refusal/);assert.deepEqual(await f.diagnostic(),before);
});
for(const status of [200,502])test('Auth preserves only the closed diagnostic from unavailable Finance responses HTTP'+status,async()=>{
 const body=unavailable({code:'FINANCE_PRODUCT_INDEX_UPSTREAM_HTTP',http:403}),req=new Request(origin+path,{method:'POST',headers:{'content-type':'application/json','x-braza-app-key':appKey},body:JSON.stringify(input)}),res=await forwardFinancePaymentSample(req,{FINANCE_ROUTER_SECRET:routerKey,SHOPEE_FINANCE_SERVICE:{fetch:async()=>Response.json(body,{status})}},{validateInternalApp:()=>true});assert.equal(res.status,502);assert.deepEqual(await res.json(),{error:'FINANCE_PRODUCT_INDEX_UNAVAILABLE',diagnostic:body.diagnostic});
});

for(const minify of [false,true])test('generated App host preserves safe catalogue diagnostics and the unchanged browser DTO minify='+minify,async t=>{
 const raw=readFileSync(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),seam='\nreturn {adminFetch,schedule,scheduledWork,workspaceAuthFetch};\n})();\n';assert.equal(raw.split(seam).length,2);const code=raw.replace(seam,'\nreturn {adminFetch,schedule,scheduledWork,workspaceAuthFetch,registry:runProductRegistry,browserFrame:projectProductRegistryFrame};\n})();\n')+'\nexport const {registry,browserFrame}=brazaAdmin;export {getFinanceProductIndex as adapter};';
 const transformed=await build({stdin:{contents:code,sourcefile:'synthetic-app-registry.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify}),worker=await import('data:text/javascript;base64,'+Buffer.from(transformed.outputFiles[0].text).toString('base64')),f=await fixture(t);let calls=0;
 const result=await worker.registry(f.env,(env,selection)=>worker.adapter({...env,APP_INTERNAL_SECRET:appKey},selection,{fetchImpl:async()=>{calls++;return Response.json({error:'FINANCE_PRODUCT_INDEX_UNAVAILABLE',diagnostic:{code:'FINANCE_PRODUCT_INDEX_UPSTREAM_HTTP',http:403}},{status:502});}}),{now:f.now,returnState:false});
 assert.equal(result.status,'ERROR');assert.equal(calls,1);assert.equal((await f.diagnostic()).code,'FINANCE_PRODUCT_INDEX_UPSTREAM_HTTP');assert.equal((await f.diagnostic()).http,403);assert.ok(worker.browserFrame(await readProductRegistry(f.env,{}, {now:f.now})));assert.doesNotMatch(JSON.stringify(result),/UPSTREAM_HTTP|diagnostic/);
});
