import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';
import {businessMonth} from '../src/business-month.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {storeCatalogClassificationFrame} from '../src/catalog-classification.mjs';

function previousMonth(){const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()),date=new Date(today.slice(0,7)+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()-1);return date.toISOString().slice(0,7);}
function financial(selection,index){
 const stamp=Math.floor(Date.now()/1000);return {schema:'finance_business_period_v1',run_id:'11111111-1111-4111-8111-'+String(index).padStart(12,'0'),revision:1,status:'COMPLETE',start_date:selection.start_date,end_date:selection.end_date,cutoff_at:stamp-1,checked_at:stamp,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,page_capacity:20,duplicate_orders:0,coverage:{orders:1,paid:1,completed:1,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'120',sales_base_raw:'120',known_expected_repass_raw:'100',expected_repass_raw:'100',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:0,known_base_raw:'120',known_tax_raw:'2.4'},items:[{item_id:'101',model_id:'244',quantity:2}],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
}
function calendar(selection){
 const stamp=Math.floor(Date.now()/1000),children=[];
 for(let start=1;start<=Number(selection.end_date.slice(8));start+=15){const last=Math.min(start+14,Number(selection.end_date.slice(8))),range={start_date:selection.start_date.slice(0,8)+String(start).padStart(2,'0'),end_date:selection.end_date.slice(0,8)+String(last).padStart(2,'0')};children.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:range,balance:20,daily:Array.from({length:last-start+1},(_,index)=>({date:selection.start_date.slice(0,8)+String(start+index).padStart(2,'0'),expense:1,broad_gmv:10,broad_order:1,broad_roas:10,direct_gmv:0,direct_order:0,direct_roas:0}))},range,stamp));}
 return buildAdsCalendar(children,selection,stamp);
}

for(const minify of [false,true])test(`the deployable App recovers a sold absent plus model through two historical adapter pages and current costs (minify=${minify})`,async()=>{
 const output=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify}),{default:worker}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
 const origin='https://historical-cost.compiled.test',env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'historical-compiled-session-secret-12345678901234567890',ADMIN_USERNAME:'historical-compiled-owner',ADMIN_PASSWORD:'historical-compiled-password-123456',APP_INTERNAL_SECRET:'fixture-historical-private-key'},calls=[],forbidden=[],month=previousMonth(),savedFetch=globalThis.fetch;
 globalThis.fetch=async request=>{
  const url=new URL(request.url);if(url.pathname!=='/internal/shopee/finance/historical-variant-evidence'){forbidden.push(url.pathname);return Response.json({error:'UNAVAILABLE'},{status:503});}
  assert.equal(url.origin,'https://auth.brazacommerce.com.br');assert.equal(request.method,'POST');assert.equal(request.headers.get('x-braza-app-key'),env.APP_INTERNAL_SECRET);assert.equal(request.headers.has('cookie'),false);assert.equal(request.redirect,'manual');const input=await request.json();calls.push(input);assert.deepEqual(input.item_ids,['101']);
  // The historical 999 units intentionally differ from the proved financial
  // cohort. They can establish a name, never production quantity or money.
  return Response.json({schema:'historical_variant_evidence_v1',shop_id:1178167501,checked_at:Math.floor(Date.now()/1000),...input,has_more:false,next_cursor:null,coverage:{orders_seen:1,target_orders:1,target_lines:1,target_units:999},evidence_complete:true,products:[{item_id:'101',variants:[{model_id:'244',line_count:1,quantity:999,item_names:['Camiseta Adulta Estrela'],model_names:['Preto / G1'],missing_item_name_lines:0,missing_model_name_lines:0,status_counts:[{status:'COMPLETED',line_count:1,quantity:999}],conflict:false}]}],omitted:{target_lines:0,target_units:0}});
 };
 try{
  const login=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0],state=await(await worker.fetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
  const call=async(path,body)=>{const response=await worker.fetch(new Request(origin+'/api/admin/'+path,{method:body===undefined?'GET':'POST',headers:{cookie,origin,'content-type':'application/json','x-csrf-token':state.csrf},body:body===undefined?undefined:JSON.stringify(body)}),env),data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;};
  await storeCatalogClassificationFrame(env,{schema:'variant_catalog_v1',checked_at:Math.floor(Date.now()/1000),products:[{item_id:'101',catalog_fingerprint:'a'.repeat(64),selling_unit:'SINGLE_GARMENT',bindings:[{item_id:'101',model_id:'243',size:'P'}],unresolved_count:0,cost_catalog:{schema:'product_cost_catalog_v1',product_name:'Camiseta Adulta Estrela',variants:[{model_id:'243',attributes:[{name:'Cor',value:'Verde'},{name:'Tamanho',value:'P'}]}]}}]});
  let windows=0;const sources={getFinanceBusinessPeriod:async(_,selection)=>financial(selection,++windows),getAdsCalendar:async(_,selection)=>calendar(selection)};let frame=await businessMonth(env,{operation:'start',month},sources);while(frame.status==='RUNNING')frame=await businessMonth(env,{operation:'step',month},sources);await businessMonth(env,{operation:'ads',month},sources);await businessMonth(env,{operation:'expenses',month,revision:0,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED'},sources);
  const savedCosts=await call('production-costs');savedCosts.values.inclusive_plus_cents=2140;await call('production-costs',{revision:savedCosts.revision,values:savedCosts.values});
  const before=await call('finance/cost-diagnostics?month='+month);assert.equal(before.products[0].variants[0].model_id,'244');assert.equal(before.products[0].variants[0].quantity,windows*2);assert.equal(before.products[0].variants[0].reason,'MODEL_NOT_IN_CATALOG');assert.equal(before.totals.production_cost_cents,null);assert.equal(calls.length,0);
  let recovered;for(let index=0;index<Math.ceil(Number(frame.end_date.slice(8))/15);index++){recovered=await call('finance/cost-recovery',{month});assert.equal(calls.length,index+1,'one historical source page per owner action');if(index===0&&Number(frame.end_date.slice(8))>15)assert.equal(recovered.diagnostic.totals.production_cost_cents,null);}
  assert.equal(recovered.diagnostic.summary.production_coverage.pending_units,0);assert.equal(recovered.diagnostic.totals.production_cost_cents,windows*2*2140);assert.equal(recovered.diagnostic.coverage.paid,windows);assert.equal(recovered.diagnostic.totals.realized_net_cents,null);assert.deepEqual(forbidden,[],'no catalogue, Payment, financial import, Ads or product index is queried');
  assert.deepEqual(calls.map(input=>[input.start_date,input.end_date,input.cursor]),Array.from({length:windows},(_,index)=>[month+'-'+String(index*15+1).padStart(2,'0'),month+'-'+String(Math.min(Number(frame.end_date.slice(8)),index*15+15)).padStart(2,'0'),null]));
  const count=calls.length,idle=await call('finance/cost-recovery',{month});assert.equal(idle.work.status,'IDLE');await call('finance/cost-diagnostics?month='+month);assert.equal(calls.length,count);assert.deepEqual(forbidden,[]);
  const costs=await call('production-costs');costs.values.inclusive_plus_cents=2300;await call('production-costs',{revision:costs.revision,values:costs.values});const repriced=await call('finance/cost-diagnostics?month='+month);assert.equal(repriced.totals.production_cost_cents,windows*2*2300);assert.equal(calls.length,count);
 }finally{globalThis.fetch=savedFetch;env.ADMIN_DB.db.close();}
});
