import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch} from '../src/admin.mjs';
import {getFinancePaymentPreview,getFinancePaymentSample,projectAdminFinancePreview} from '../src/app-finance-sample.mjs';
import {FINANCE_PREVIEW_AMOUNT_FIELDS} from '../../finance/src/payment-preview-frame.mjs';
import {D1} from './sqlite-d1.mjs';

const base='https://app.example.test';
const serial='FIXTURE_PREVIEW_PRIVATE_ORDER';
const frame=()=>({schema:'finance_payment_preview_v1',status:'AVAILABLE',checked_at:1792405689,token_revision:2,currency:'BRL',monetary_unit:'UNCONFIRMED',order_sn:serial,identity_match:true,amounts:FINANCE_PREVIEW_AMOUNT_FIELDS.map((name,index)=>({name,value:[8990,null,9990,1000,0,200,-50.125,0][index]})),items:[{quantity_purchased:2,original_price:4995,selling_price:4495,is_kit:false}],item_count:1});
const json=(value,status=200)=>Response.json(value,{status});
function environment(){return {ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'fixture-only-preview-session-123456789',ADMIN_USERNAME:'fixture-preview-admin',ADMIN_PASSWORD:'fixture-preview-password-123456789'};}
async function session(env){const login=await adminFetch(new Request(base+'/admin/login',{method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];const state=await (await adminFetch(new Request(base+'/api/admin/state',{headers:{cookie}}),env)).json();return {cookie,csrf:state.csrf};}

test('App preview uses only the separate fixed private POST and preserves raw signed values without conversion or totals',async()=>{
 let calls=0;const value=frame();
 const result=await getFinancePaymentPreview({APP_INTERNAL_SECRET:'fixture-internal-preview'},{fetchImpl:async request=>{calls++;assert.equal(request.url,'https://auth.brazacommerce.com.br/internal/shopee/finance/payment-preview');assert.equal(request.method,'POST');assert.equal(request.redirect,'manual');assert.equal(await request.text(),'{}');assert.equal(request.headers.get('x-braza-app-key'),'fixture-internal-preview');assert.equal(request.headers.get('cookie'),null);assert.equal(request.headers.get('authorization'),null);return json(value);}});
 assert.equal(calls,1);assert.deepEqual(result,value);assert.equal(result.amounts[0].value,8990);assert.equal(result.amounts[4].value,0);assert.equal(result.amounts[6].value,-50.125);assert.equal(result.items[0].selling_price,4495);assert.equal(result.items[0].quantity_purchased,2);assert.equal(Object.hasOwn(result,'profit'),false);
 const schemaOnly=await getFinancePaymentSample({APP_INTERNAL_SECRET:'fixture'},{fetchImpl:async()=>json(value)});assert.equal(schemaOnly.status,'UNAVAILABLE');assert.ok(!JSON.stringify(schemaOnly).includes(serial));assert.ok(!JSON.stringify(schemaOnly).includes('8990'));
});

test('App preview rejects extra provider fields, nonfinite/ambiguous numbers, invalid identity and non200 success frames without private error output',async()=>{
 for(const value of [{...frame(),buyer:'PRIVATE_BUYER'},{...frame(),access_token:'PRIVATE_TOKEN'},{...frame(),identity_match:false},{...frame(),currency:'USD'},{...frame(),monetary_unit:'CENTS'},{...frame(),amounts:frame().amounts.map((row,index)=>index?row:{...row,value:'8990'})}]){const result=projectAdminFinancePreview(value);assert.equal(result.status,'UNAVAILABLE');assert.ok(!JSON.stringify(result).includes('PRIVATE_'));}
 const refused=await getFinancePaymentPreview({APP_INTERNAL_SECRET:'fixture'},{fetchImpl:async()=>json(frame(),403)});assert.equal(refused.status,'UNAVAILABLE');assert.ok(!JSON.stringify(refused).includes(serial));
 const rejected=await getFinancePaymentPreview({APP_INTERNAL_SECRET:'fixture'},{fetchImpl:async()=>json({error:'FINANCE_SAMPLE_UNAVAILABLE',diagnostic:{code:'FINANCE_SAMPLE_PREVIEW_RESPONSE_INVALID',http:null,message:'PRIVATE_ERROR'},order_sn:serial},502)});assert.deepEqual(rejected,{schema:'finance_payment_preview_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_SAMPLE_PREVIEW_RESPONSE_INVALID',http:null}});
});

test('App preview missing configuration, late response cancellation and bounded transport retain only fixed diagnostic metadata',async()=>{
 let calls=0;
 assert.equal((await getFinancePaymentPreview({},{fetchImpl:async()=>{calls++;return json(frame());}})).status,'UNAVAILABLE');assert.equal(calls,0);
 let finish,cancelled=0;const late=new Promise(resolve=>{finish=resolve;});
 const result=await getFinancePaymentPreview({APP_INTERNAL_SECRET:'fixture'},{timeoutMs:5,fetchImpl:()=>late});assert.equal(result.diagnostic.code,'FINANCE_SAMPLE_APP_TIMEOUT');
 finish(new Response(new ReadableStream({start(){},cancel(){cancelled++;}}),{headers:{'content-type':'application/json'}}));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(cancelled,1);
 for(const response of [new Response('<html>PRIVATE_ERROR</html>',{headers:{'content-type':'text/html'}}),new Response('',{status:302,headers:{location:'https://other.invalid'}}),new Response(' '.repeat(65537),{headers:{'content-type':'application/json'}})]){const value=await getFinancePaymentPreview({APP_INTERNAL_SECRET:'fixture'},{fetchImpl:async()=>response});assert.equal(value.status,'UNAVAILABLE');assert.ok(!JSON.stringify(value).includes('PRIVATE_ERROR'));}
});

test('private values require admin session Origin CSRF POST empty bounded body and no query before the service is invoked',async()=>{
 const env=environment(),auth=await session(env);let calls=0;const services={getFinancePaymentPreview:async()=>{calls++;return frame();}};
 const request=(changes={})=>new Request(base+(changes.path||'/api/admin/finance/payment-preview'),{method:changes.method||'POST',headers:{cookie:changes.cookie??auth.cookie,origin:changes.origin??base,'x-csrf-token':changes.csrf??auth.csrf,'content-type':'application/json'},body:changes.method==='GET'?undefined:changes.raw??JSON.stringify(changes.body??{})});
 for(const [changes,status] of [[{cookie:''},401],[{cookie:'mls_session=review'},401],[{csrf:''},403],[{origin:'https://other.invalid'},403],[{method:'GET'},405],[{body:{order_sn:serial}},400],[{path:'/api/admin/finance/payment-preview?shop_id=1'},400],[{raw:' '.repeat(129)},413]]){const response=await adminFetch(request(changes),env,services);assert.equal(response.status,status);assert.ok(!(await response.text()).includes(serial));assert.equal(calls,0);}
 const before=env.ADMIN_DB.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();const audits=env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM admin_audit').get().n;
 const result=await adminFetch(request(),env,services);assert.equal(result.status,200);assert.deepEqual(await result.json(),frame());assert.equal(calls,1);
 assert.deepEqual(env.ADMIN_DB.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all(),before);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM admin_audit').get().n,audits);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM hermes_jobs').get().n,0);
 await adminFetch(new Request(base+'/admin',{headers:{cookie:auth.cookie}}),env,services);assert.equal(calls,1);
 const failure=await adminFetch(request(),env,{getFinancePaymentPreview:async()=>{throw Error('PRIVATE_TOKEN');}});assert.deepEqual(await failure.json(),{schema:'finance_payment_preview_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_SAMPLE_UNAVAILABLE',http:null}});
});
