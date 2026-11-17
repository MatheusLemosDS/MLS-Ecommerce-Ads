import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {D1} from './sqlite-d1.mjs';
import {COST_SCHEMA,COST_DEFAULTS} from '../src/production-costs.mjs';
import {readProductRegistry} from '../src/product-registry.mjs';
import {createFinanceStore} from '../../finance/src/connection-store.mjs';

const appKey='synthetic-shape-app-'.repeat(4),router='synthetic-shape-router-'.repeat(4),prefix='FINANCE_PRODUCT_INDEX_',selection={offset:0,page_size:50,item_status:'BANNED'};
const envelope=response=>({error:'',response}),empty=()=>({item:[],total_count:0,has_next_page:false}),row=()=>({item_id:101,item_status:'BANNED',update_time:Math.floor(Date.now()/1000)-10});
const cases=[
 {name:'explicit empty array remains a valid empty BANNED page',payload:()=>envelope(empty()),code:null},
 {name:'missing item with explicit zero and false is diagnosed rather than normalized',payload:()=>envelope({total_count:0,has_next_page:false}),code:'RESPONSE_EMPTY_ITEM_MISSING'},
 {name:'null item with explicit zero and false is diagnosed rather than normalized',payload:()=>envelope({item:null,total_count:0,has_next_page:false}),code:'RESPONSE_EMPTY_ITEM_NULL'},
 {name:'missing item with nonzero total is an invalid item type',payload:()=>envelope({total_count:1,has_next_page:false}),code:'RESPONSE_ITEM_TYPE'},
 {name:'missing item with a true next-page flag cannot imply an empty result',payload:()=>envelope({total_count:0,has_next_page:true,next_offset:1}),code:'RESPONSE_ITEM_TYPE'},
 {name:'a numeric-looking total string stays invalid',payload:()=>envelope({...empty(),total_count:'0'}),code:'RESPONSE_TOTAL'},
 {name:'a nonempty page cannot have zero total',payload:()=>envelope({item:[row()],total_count:0,has_next_page:false}),code:'RESPONSE_TOTAL'},
 {name:'a true next-page flag requires rows and a forward cursor',payload:()=>envelope({...empty(),has_next_page:true,next_offset:1}),code:'RESPONSE_PAGINATION'},
 {name:'an absent error envelope is rejected',payload:()=>({response:empty()}),code:'RESPONSE_ENVELOPE'},
 {name:'a null response object is rejected',payload:()=>envelope(null),code:'RESPONSE_OBJECT'},
 {name:'a nonobject item row is rejected',payload:()=>envelope({item:[null],total_count:1,has_next_page:false}),code:'RESPONSE_ROW_OBJECT'},
 {name:'a malformed item ID is rejected',payload:()=>envelope({item:[{...row(),item_id:'0'}],total_count:1,has_next_page:false}),code:'RESPONSE_ROW_ID'},
 {name:'a row from a different status is rejected',payload:()=>envelope({item:[{...row(),item_status:'NORMAL'}],total_count:1,has_next_page:false}),code:'RESPONSE_ROW_STATUS'},
 {name:'a malformed update time is rejected',payload:()=>envelope({item:[{...row(),update_time:'today'}],total_count:1,has_next_page:false}),code:'RESPONSE_ROW_TIME'},
 {name:'duplicate item identities remain rejected',payload:()=>envelope({item:[row(),row()],total_count:2,has_next_page:false}),code:'RESPONSE_ROW_DUPLICATE'},
 {name:'a mismatched provider identity keeps its existing diagnostic',payload:()=>({...envelope(empty()),shop_id:999}),code:'IDENTITY_MISMATCH'},
];
async function compile(source,minify,name){const result=await build({stdin:{contents:source,sourcefile:name},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));}
async function workers(minify){
 const raw=readFileSync(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),seam='\nreturn {adminFetch,schedule,scheduledWork,workspaceAuthFetch};\n})();\n';assert.equal(raw.split(seam).length,2,'reviewed generated App test seam must remain unique');
 const appSource=raw.replace(seam,'\nreturn {adminFetch,schedule,scheduledWork,workspaceAuthFetch,registry:runProductRegistry};\n})();\n')+'\nexport const registry=brazaAdmin.registry;export {getFinanceProductIndex as adapter};';
 const [app,auth,finance]=await Promise.all([compile(appSource,minify,'app-shape-test.mjs'),compile(readFileSync(new URL('../../../docs/finance-connection-delivery/auth-worker.mjs',import.meta.url),'utf8'),minify,'auth-shape-test.mjs'),compile(readFileSync(new URL('../../../docs/finance-connection-delivery/finance-worker.mjs',import.meta.url),'utf8'),minify,'finance-shape-test.mjs')]);
 return {app,auth:auth.default,finance:finance.default};
}
async function fixture(t){
 const db=new D1(),financeDb=new D1();t.after(()=>{db.db.close();financeDb.db.close();});const time=Date.now(),now=()=>time,stamp=Math.floor(time/1000),env={ADMIN_DB:db};
 await db.batch(COST_SCHEMA.map(sql=>db.prepare(sql)));await db.prepare('CREATE TABLE IF NOT EXISTS variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)').run();await db.prepare('INSERT INTO variant_bindings_state VALUES(1,1,?,?)').bind('[]',new Date(time).toISOString()).run();await db.prepare('INSERT INTO production_costs_state VALUES(1,1,?,?)').bind(JSON.stringify(COST_DEFAULTS),new Date(time).toISOString()).run();await readProductRegistry(env,{}, {now});await db.prepare('UPDATE product_registry_state SET status_index=1,offset=0,next_run_at=0').run();
 const financeEnv={FINANCE_DB:financeDb,FINANCE_CONNECTION_ENABLED:'true',FINANCE_ROUTER_SECRET:router,FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,29).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:'synthetic-shape-partner-key'};const store=await createFinanceStore(financeEnv);await store.setup();await store.saveTokens({access_token:'SYNTHETIC_SHAPE_ACCESS',refresh_token:'SYNTHETIC_SHAPE_REFRESH',expires_at:stamp+14400});
 return {db,env,financeEnv,now,stamp,state:()=>db.prepare('SELECT * FROM product_registry_state').first(),diagnostic:()=>db.prepare('SELECT * FROM product_registry_source_diagnostics').first()};
}
async function chain(worker,f,payload,{stale=false}={}){
 const previous=globalThis.fetch;let provider=0,services=0,financeHttp=null,authHttp=null,adapted;
 globalThis.fetch=async request=>{provider++;const url=new URL(request.url);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(url.pathname,'/api/v2/product/get_item_list');assert.equal(request.method,'GET');assert.equal(url.searchParams.get('item_status'),'BANNED');assert.equal(url.searchParams.get('offset'),'0');if(stale)await f.db.prepare('UPDATE product_registry_state SET revision=revision+1').run();return Response.json(payload);};
 try{
  const result=await worker.app.registry(f.env,async(env,input)=>{
   assert.deepEqual(input,selection);adapted=await worker.app.adapter({...env,APP_INTERNAL_SECRET:appKey},input,{fetchImpl:async request=>{const response=await worker.auth.fetch(request,{APP_INTERNAL_SECRET:appKey,FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async routed=>{services++;const response=await worker.finance.fetch(routed,f.financeEnv);financeHttp=response.status;return response;}}});authHttp=response.status;return response;}});return adapted;
  },{now:f.now,returnState:false});return {result,provider,services,financeHttp,authHttp,adapted};
 }finally{globalThis.fetch=previous;}
}
for(const minify of [false,true])test('real generated App/Auth/Finance preserve structural catalogue diagnostics minify='+minify,async t=>{
 const worker=await workers(minify);
 for(const example of cases)await t.test(example.name,async t=>{
  const f=await fixture(t),before=await f.state(),observed=await chain(worker,f,example.payload()),after=await f.state();assert.equal(observed.provider,1);assert.equal(observed.services,1);
  if(example.code===null){assert.equal(observed.financeHttp,200);assert.equal(observed.authHttp,200);assert.equal(observed.adapted.status,'AVAILABLE');assert.deepEqual(observed.adapted.items,[]);assert.equal(observed.result.status,'PROGRESSED');assert.equal(after.status_index,2);assert.equal(after.offset,0);assert.equal(await f.diagnostic(),null);}
  else{assert.equal(observed.financeHttp,502);assert.equal(observed.authHttp,502);assert.equal(observed.adapted.status,'UNAVAILABLE');assert.equal(observed.adapted.diagnostic.code,prefix+example.code);assert.equal(observed.result.status,'ERROR');assert.equal(after.status_index,before.status_index);assert.equal(after.offset,before.offset);assert.equal(after.failure_count,1);assert.equal(after.next_run_at,f.stamp+30);assert.deepEqual({...await f.diagnostic()},{id:1,item_status:'BANNED',offset:0,code:prefix+example.code,http:null,checked_at:f.stamp});}
  assert.doesNotMatch(JSON.stringify(observed.result),/SYNTHETIC|PRIVATE|access_token|refresh_token|sign|buyer|RESPONSE_/);
 });
 await t.test('a late response after CAS loss cannot overwrite a retained diagnostic',async t=>{
  const f=await fixture(t);await f.db.prepare('INSERT INTO product_registry_source_diagnostics VALUES(1,?,?,?,?,?)').bind('BANNED',0,'FINANCE_PRODUCT_INDEX_APP_TIMEOUT',null,f.stamp).run();const before=await f.diagnostic(),observed=await chain(worker,f,envelope({item:null,total_count:0,has_next_page:false}),{stale:true});assert.equal(observed.financeHttp,502);assert.equal(observed.authHttp,502);assert.equal(observed.adapted.diagnostic.code,'FINANCE_PRODUCT_INDEX_RESPONSE_EMPTY_ITEM_NULL');assert.equal(observed.result.status,'LEASED');assert.equal(observed.provider,1);assert.equal(observed.services,1);assert.deepEqual(await f.diagnostic(),before);
 });
});
