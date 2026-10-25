import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';

for(const minify of [false,true])test(`deployable monthly reads persist their private explanation after compilation (minify=${minify})`,async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const origin='https://app.compiled.test',env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'compiled-checkpoint-session-12345678901234567890',ADMIN_USERNAME:'compiled-checkpoint-owner',ADMIN_PASSWORD:'compiled-checkpoint-password-123456',APP_INTERNAL_SECRET:'fixture-private-checkpoint-key'};
 const savedFetch=globalThis.fetch,calls=[];
 globalThis.fetch=async request=>{
  const url=new URL(request.url);assert.equal(url.origin,'https://auth.brazacommerce.com.br');assert.equal(url.pathname,'/internal/shopee/finance/business-period');
  assert.equal(request.headers.get('x-braza-app-key'),env.APP_INTERNAL_SECRET);assert.equal(request.headers.has('cookie'),false);
  const input=await request.json(),at=Math.floor(Date.now()/1000);calls.push(input);assert.equal(input.operation,'start');
  return Response.json({schema:'finance_business_period_v1',run_id:'11111111-1111-4111-8111-'+input.start_date.slice(8).padStart(12,'0'),revision:2,status:'COMPLETE',start_date:input.start_date,end_date:input.end_date,cutoff_at:at-2,checked_at:at,source_checked_at:{oldest_at:at-2,latest_at:at},currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,page_capacity:20,duplicate_orders:0,coverage:{orders:0,paid:0,completed:0,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:0,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'0',sales_base_raw:'0',known_expected_repass_raw:'0',expected_repass_raw:'0',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:0,unavailable_orders:0,known_base_raw:'0',known_tax_raw:'0'},items:[],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'});
 };
 try{
  const login=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);
  const cookie=login.headers.get('set-cookie').split(';')[0],state=await(await worker.fetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
  const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7),historyUrl=origin+'/api/admin/finance/checkpoints?month='+month;
  const policy=await(await worker.fetch(new Request(origin+'/api/admin/finance/sync-state',{headers:{cookie}}),env)).json();
  const paused=await worker.fetch(new Request(origin+'/api/admin/finance/sync-policy',{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-csrf-token':state.csrf},body:JSON.stringify({revision:policy.revision,enabled:false})}),env);assert.equal(paused.status,200);
  assert.equal((await worker.fetch(new Request(historyUrl),env)).status,401);
  const invoke=async body=>{const response=await worker.fetch(new Request(origin+'/api/admin/finance/business-month',{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-csrf-token':state.csrf},body:JSON.stringify(body)}),env);assert.equal(response.status,200,await response.clone().text());return response.json();};
  let frame=await invoke({operation:'start',month});while(frame.status==='RUNNING')frame=await invoke({operation:'step',month});
  assert.equal(frame.progress.order_capacity,frame.progress.pages_read*20);
  const before=calls.length,first=await(await worker.fetch(new Request(historyUrl,{headers:{cookie}}),env)).json();
  assert.equal(first.checkpoints.length,1);assert.equal(first.checkpoints[0].checkpoint.status,'PENDING');assert.equal(first.checkpoints[0].checkpoint.source_checked_at.finance_oldest_at,frame.source_checked_at.finance_oldest_at);
  await invoke({operation:'expenses',month,revision:0,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED'});
  const history=await(await worker.fetch(new Request(historyUrl,{headers:{cookie}}),env)).json();assert.equal(history.checkpoints.length,2);assert.equal(history.checkpoints[0].checkpoint.versions.expenses,1);assert.equal(history.checkpoints[0].checkpoint.result.realized_net_cents,null);assert.equal(history.checkpoints[0].checkpoint.lines.find(line=>line.code==='OTHER_EXPENSES').amount_cents,0);
  assert.equal(calls.length,before,'history and an expense-only recalculation never query the private source');
  assert.ok(!JSON.stringify(history).includes(env.APP_INTERNAL_SECRET));
 }finally{globalThis.fetch=savedFetch;env.ADMIN_DB.db.close();}
});
