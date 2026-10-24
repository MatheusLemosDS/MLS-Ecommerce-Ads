import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {adminFetch} from '../src/admin.mjs';
import {D1} from './sqlite-d1.mjs';

const origin='https://app.production.test',art={art_key:'vivaosanos80',sha256:'a'.repeat(64),pixel_width:3600,pixel_height:3600};
async function fixture(){
 const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'production-fixture-secret-12345678901234567890',ADMIN_USERNAME:'production-owner',ADMIN_PASSWORD:'production-fixture-password-123456'};
 const response=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(response.status,303);const cookie=response.headers.get('set-cookie').split(';')[0],state=await(await adminFetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
 return {env,cookie,csrf:state.csrf};
}
function request(auth,path='',body,options={}){
 const method=options.method||(body===undefined?'GET':'POST');return new Request(origin+'/api/admin/production'+path,{method,headers:{cookie:options.cookie??auth.cookie,origin:options.origin??origin,'content-type':'application/json','x-csrf-token':options.csrf??auth.csrf},body:['GET','HEAD'].includes(method)?undefined:JSON.stringify(body)});
}
function source(){
 const calls=[];let status='READY_TO_SHIP';
 const getFinanceProductionOrders=async(_,input)=>{calls.push(input);const stamp=Math.floor(Date.now()/1000);return {schema:'production_orders_v1',shop_id:1178167501,checked_at:stamp,start_date:input.operation==='scan'?input.start_date:null,end_date:input.operation==='scan'?input.end_date:null,complete:true,orders:input.operation==='scan'&&input.end_date<new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000))?[]:[{order_id:'FIXTURE0001',status,create_time:stamp-600,update_time:stamp,lines:status==='CANCELLED'?[]:[{line_key:'101:0',item_id:'101',model_id:'0',sku:'vivaosanos80-27',quantity:2,model_name:'M'}]}]};};
 return {services:{getFinanceProductionOrders},calls,cancel(){status='CANCELLED';}};
}

test('production routes protect owner data, actions and exact scope before reading Shopee',async()=>{
 const auth=await fixture(),s=source();try{
 for(const cookie of ['', 'mls_session=review'])assert.equal((await adminFetch(request(auth,'',undefined,{cookie}),auth.env,s.services)).status,401);
 for(const path of ['/settings','/sync','/batches','/batches/action']){
  assert.equal((await adminFetch(request(auth,path,{}, {origin:'https://foreign.test'}),auth.env,s.services)).status,403);
  assert.equal((await adminFetch(request(auth,path,{}, {csrf:''}),auth.env,s.services)).status,403);
  assert.equal((await adminFetch(request(auth,path,undefined),auth.env,s.services)).status,405);
 }
 assert.equal((await adminFetch(request(auth,'/sync?shop_id=123',{}),auth.env,s.services)).status,400);
 assert.equal((await adminFetch(request(auth,'/sync',{path:'PRIVATE'}),auth.env,s.services)).status,400);
 assert.equal((await adminFetch(request(auth,'/unknown',{}),auth.env,s.services)).status,404);assert.equal(s.calls.length,0);
 const page=await adminFetch(new Request(origin+'/admin?tab=production',{headers:{cookie:auth.cookie}}),auth.env,s.services),html=await page.text();assert.match(html,/id="production"/);assert.match(html,/vivaosanos80/);assert.match(html,/neste dispositivo/);assert.match(html,/href="\/admin\?tab=production"/);
 assert.doesNotThrow(()=>new vm.Script([...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]).join('\n')));assert.match(page.headers.get('content-security-policy'),/img-src 'self' blob: data:/);
 }finally{auth.env.ADMIN_DB.db.close();}
});

test('the authenticated production workflow reserves once and revalidates cancellation before export',async()=>{
 const auth=await fixture(),s=source();try{
 let response=await adminFetch(request(auth,'',undefined),auth.env,s.services),read=await response.json();assert.equal(response.status,200);assert.equal(read.settings.values.film_width_mm,570);
 response=await adminFetch(request(auth,'/sync',{}),auth.env,s.services);assert.equal(response.status,200);read=await response.json();const row=read.lines.find(line=>line.order_id==='FIXTURE0001');assert.equal(row.sku,'vivaosanos80-27');assert.equal(row.quantity,2);
 const input={request_id:'11111111-1111-4111-8111-111111111111',unit_keys:[row.unit_key],artworks:[art]};
 response=await adminFetch(request(auth,'/batches',input),auth.env,s.services);const created=await response.json();assert.equal(response.status,200,JSON.stringify(created));assert.equal(created.batch.status,'PREPARED');assert.equal(created.batch.layout.print_count,2);
 response=await adminFetch(request(auth,'/batches',input),auth.env,s.services);assert.equal(response.status,200);assert.equal((await response.json()).batch.id,created.batch.id);
 response=await adminFetch(request(auth,'/batches',{...input,request_id:'22222222-2222-4222-8222-222222222222'}),auth.env,s.services);assert.equal(response.status,409);
 s.cancel();response=await adminFetch(request(auth,'/batches/action',{id:created.batch.id,action:'export'}),auth.env,s.services);assert.equal(response.status,409);
 response=await adminFetch(request(auth,'',undefined),auth.env,s.services);read=await response.json();assert.equal(read.batches.find(batch=>batch.id===created.batch.id).status,'PREPARED');assert.ok(!JSON.stringify(read).includes('access_token'));
 assert.equal(auth.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM hermes_jobs').get().n,0);
 }finally{auth.env.ADMIN_DB.db.close();}
});
