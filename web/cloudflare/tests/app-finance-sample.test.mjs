import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch} from '../src/admin.mjs';
import {getFinancePaymentSample} from '../src/app-finance-sample.mjs';
import {projectFinanceSample,financeSampleDiagnostic} from '../src/finance-sample-frame.mjs';
import {D1} from './sqlite-d1.mjs';

const base='https://app.example.test';
const frame=()=>({schema_version:1,status:'VALIDATED',checked_at:1792400000,token_revision:2,fields:[{name:'escrow_amount',type:'number'},{name:'items',type:'array'}],item_fields:[{name:'item_id',type:'number'}],item_count:1,identity_match:true});
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8'}});
function environment(){return {ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'fixture-only-session-secret-123456789',ADMIN_USERNAME:'fixture-admin',ADMIN_PASSWORD:'fixture-password-123456789'};}
async function session(env){const response=await adminFetch(new Request(base+'/admin/login',{method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(response.status,303);const cookie=response.headers.get('set-cookie').split(';')[0];const state=await (await adminFetch(new Request(base+'/api/admin/state',{headers:{cookie}}),env)).json();return {cookie,csrf:state.csrf};}

test('sample projection discards private values and rejects unknown names/types, duplicates or mismatched scope',()=>{
 const value={...frame(),order_sn:'PRIVATE_ORDER',buyer:'PRIVATE_BUYER',access_token:'PRIVATE_TOKEN'};value.fields[0].value='PRIVATE_AMOUNT';
 const projected=projectFinanceSample(value);assert.deepEqual(projected,frame());assert.ok(!JSON.stringify(projected).includes('PRIVATE'));
 for(const change of [{identity_match:false},{token_revision:0},{item_count:1001},{fields:[{name:'PRIVATE_BUYER',type:'string'}]},{fields:[{name:'escrow_amount',type:'PRIVATE_TYPE'}]},{fields:[{name:'items',type:'array'},{name:'items',type:'array'}]},{status:'EMPTY'}])assert.equal(projectFinanceSample({...frame(),...change}).status,'UNAVAILABLE');
 assert.equal(projectFinanceSample({...frame(),status:'EMPTY',identity_match:undefined,fields:[],item_fields:[],item_count:0}).status,'EMPTY');
 assert.deepEqual(financeSampleDiagnostic({code:'PRIVATE_TOKEN',http:'403'}),{code:'FINANCE_SAMPLE_UNAVAILABLE',http:null});
});

test('App sample uses one fixed POST with existing internal authentication and reprojects the result',async()=>{
 let calls=0;
 const result=await getFinancePaymentSample({APP_INTERNAL_SECRET:'fixture-internal-secret'},{fetchImpl:async request=>{calls++;assert.equal(request.url,'https://auth.brazacommerce.com.br/internal/shopee/finance/payment-sample');assert.equal(request.method,'POST');assert.equal(request.redirect,'manual');assert.equal(await request.text(),'{}');assert.equal(request.headers.get('x-braza-app-key'),'fixture-internal-secret');assert.equal(request.headers.has('cookie'),false);assert.equal(request.headers.has('authorization'),false);return json({...frame(),order_sn:'PRIVATE_ORDER'});}});
 assert.equal(calls,1);assert.deepEqual(result,frame());
 assert.equal((await getFinancePaymentSample({}, {fetchImpl:()=>{throw Error('must not fetch');}})).diagnostic.code,'FINANCE_SAMPLE_APP_CONFIGURATION');
});

test('App transport bounds slow streams and refuses redirects, HTML, oversize, invalid UTF8 and non200 success-shaped bodies',async()=>{
 for(const response of [json(frame(),403),new Response('',{status:302,headers:{location:'https://other.example'}}),new Response('<html>PRIVATE</html>',{headers:{'content-type':'text/html'}}),new Response(' '.repeat(65537),{headers:{'content-type':'application/json'}}),new Response(new Uint8Array([0xff]),{headers:{'content-type':'application/json'}})]){
  let calls=0;const result=await getFinancePaymentSample({APP_INTERNAL_SECRET:'fixture'},{fetchImpl:async()=>{calls++;return response;}});assert.equal(result.status,'UNAVAILABLE');assert.equal(calls,1);assert.ok(!JSON.stringify(result).includes('PRIVATE'));
 }
 const slow=new ReadableStream({start(){},cancel(){}});
 const result=await getFinancePaymentSample({APP_INTERNAL_SECRET:'fixture'},{timeoutMs:10,fetchImpl:async()=>new Response(slow,{headers:{'content-type':'application/json'}})});
 assert.equal(result.diagnostic.code,'FINANCE_SAMPLE_APP_TIMEOUT');
 const denied=await getFinancePaymentSample({APP_INTERNAL_SECRET:'fixture'},{fetchImpl:async()=>json({error:'FINANCE_SAMPLE_UNAVAILABLE',diagnostic:{code:'FINANCE_SAMPLE_PAYMENT_API_PERMISSION_REJECTED',http:403,private:'PRIVATE'}},502)});
 assert.deepEqual(denied.diagnostic,{code:'FINANCE_SAMPLE_PAYMENT_API_PERMISSION_REJECTED',http:403});
});

test('App transport cancels early rejected and late arriving response streams even when fetch ignores abort',async()=>{
 let cancelled=0;
 const rejected=new ReadableStream({start(){},cancel(){cancelled++;}});
 await getFinancePaymentSample({APP_INTERNAL_SECRET:'fixture'},{fetchImpl:async()=>new Response(rejected,{headers:{'content-type':'text/html'}})});
 assert.equal(cancelled,1);
 let finish;
 const late=new Promise(resolve=>{finish=resolve;});
 const result=await getFinancePaymentSample({APP_INTERNAL_SECRET:'fixture'},{timeoutMs:5,fetchImpl:()=>late});
 assert.equal(result.diagnostic.code,'FINANCE_SAMPLE_APP_TIMEOUT');
 finish(new Response(new ReadableStream({start(){},cancel(){cancelled++;}}),{headers:{'content-type':'application/json'}}));
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(cancelled,2);
});

test('admin probe requires session, Origin, CSRF, POST, no query and empty bounded body before any private call',async()=>{
 const env=environment(),auth=await session(env);let calls=0;const services={getFinancePaymentSample:async()=>{calls++;return {...frame(),order_sn:'PRIVATE_ORDER'};}};
 const request=(changes={})=>new Request(base+(changes.path||'/api/admin/finance/payment-sample'),{method:changes.method||'POST',headers:{cookie:changes.cookie??auth.cookie,origin:changes.origin??base,'x-csrf-token':changes.csrf??auth.csrf,'content-type':'application/json'},body:changes.method==='GET'?undefined:changes.raw??JSON.stringify(changes.body??{})});
 for(const [changes,status] of [[{cookie:''},401],[{cookie:'mls_session=review'},401],[{csrf:''},403],[{origin:'https://evil.example'},403],[{method:'GET'},405],[{path:'/api/admin/finance/payment-sample?shop_id=1'},400],[{body:{order_sn:'PRIVATE_ORDER'}},400],[{raw:' '.repeat(129)},413]]){assert.equal((await adminFetch(request(changes),env,services)).status,status);assert.equal(calls,0);}
 const before=env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM admin_audit').get().n;
 const response=await adminFetch(request(),env,services);assert.equal(response.status,200);assert.deepEqual(await response.json(),frame());assert.equal(calls,1);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM hermes_jobs').get().n,0);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM admin_audit').get().n,before);
 const unavailable=await adminFetch(request(),env,{getFinancePaymentSample:async()=>{throw Error('PRIVATE_TOKEN');}});assert.equal((await unavailable.json()).status,'UNAVAILABLE');
 const page=await (await adminFetch(new Request(base+'/admin',{headers:{cookie:auth.cookie}}),env,services)).text();assert.match(page,/id="financeSampleCheck"/);assert.equal(calls,1);
});
