import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';
import {businessMonth} from '../src/business-month.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {storeCatalogClassificationFrame} from '../src/catalog-classification.mjs';

const month='2026-09',itemId='58270722536',modelId='189628289642';
const title='Camiseta Infantil Anos 80 Retrô Flashback Estampa Colorida Música Festa Vintage Menino Menina Tam 2 ao 14';
const coverage={orders:310,paid:253,completed:109,ongoing:144,cancelled:50,cancel_pending:0,unpaid:5,other:2,unknown:0,payment_covered:253,payment_missing:0,returns:4,returns_unknown:0};
const stamp=()=>Math.floor(Date.now()/1000);

function finance(selection,index){
 // The missing pair and aggregate numbers come from the 26-Oct diagnostic.
 // Other units use a synthetic mix reproducing its known 778520-cent cost;
 // these are not inferred compositions of the operator's actual orders.
 const first=index===1,c=Object.fromEntries(Object.entries(coverage).map(([key,value])=>[key,first?value:0]));
 const items=first?[{item_id:'101',model_id:'1',quantity:4},{item_id:'102',model_id:'2',quantity:58},{item_id:'103',model_id:'3',quantity:203},{item_id:itemId,model_id:'114',quantity:2},{item_id:itemId,model_id:modelId,quantity:1}]:[];
 const sales=first?'16524.16':'0',payout=first?'11611.14':'0',adjustment=first?'11.8':'0',at=stamp();
 const groups=first?[['101',4,'400','320','0','8',0],['102',58,'5800','4640','0','116',0],['103',188,'10024.16','6411.14','11.8','200.48',4],[itemId,3,'300','240','0','6',0]]:[];
 const products=groups.map(([item_id,orders,...amounts])=>{const selected=items.filter(row=>row.item_id===item_id),money={};for(const [index,name] of ['sales_base','expected_repass','ads_adjustment','invoice_tax'].entries())Object.assign(money,{['known_exclusive_'+name+'_raw']:amounts[index],['exclusive_'+name+'_raw']:amounts[index]});return {item_id,quantity:selected.reduce((sum,row)=>sum+row.quantity,0),orders,exclusive_orders:orders,mixed_orders:0,exclusive_payment_covered:orders,exclusive_payment_missing:0,exclusive_returns:amounts[4],exclusive_returns_unknown:0,...money,items:selected.map(row=>({model_id:row.model_id,exclusive_quantity:row.quantity,mixed_quantity:0}))};});
 const product_breakdown={schema:'business_product_breakdown_v1',mixed_orders:0,mixed_payment_covered:0,mixed_payment_missing:0,known_mixed_sales_base_raw:'0',known_mixed_expected_repass_raw:'0',known_mixed_ads_adjustment_raw:'0',known_mixed_invoice_tax_raw:'0',products};
 return {schema:'finance_business_period_v1',run_id:crypto.randomUUID(),revision:1,status:'COMPLETE',start_date:selection.start_date,end_date:selection.end_date,cutoff_at:at-1,checked_at:at,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:first?16:1,page_capacity:20,duplicate_orders:0,coverage:c,known_sales_base_raw:sales,sales_base_raw:sales,known_expected_repass_raw:payout,expected_repass_raw:payout,known_ads_adjustment_raw:adjustment,ads_adjustment_raw:adjustment,invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:c.paid,unavailable_orders:0,known_base_raw:sales,known_tax_raw:first?'330.48':'0'},items,product_breakdown,diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
}
function ads(selection){
 const children=[],end=Number(selection.end_date.slice(8));
 for(let start=1;start<=end;start+=15){
  const last=Math.min(start+14,end),range={start_date:month+'-'+String(start).padStart(2,'0'),end_date:month+'-'+String(last).padStart(2,'0')};
  const daily=Array.from({length:last-start+1},(_,index)=>({date:month+'-'+String(start+index).padStart(2,'0'),expense:start+index===1?1361.27:0,broad_gmv:0,direct_gmv:0,broad_order:0,direct_order:0}));
  children.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:range,balance:20,daily},range,stamp()));
 }
 return buildAdsCalendar(children,selection,stamp());
}

for(const minify of [false,true])test(`the deployable Worker prices the approved deleted size16 and reuses the saved financial cohort (minify=${minify})`,async()=>{
 const output=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].text).toString('base64'));
 const origin='https://historical-child.compiled.test',env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'child-history-session-secret-12345678901234567890',ADMIN_USERNAME:'child-history-fixture-owner',ADMIN_PASSWORD:'child-history-fixture-password'};
 const previousFetch=globalThis.fetch;let providerCalls=0;globalThis.fetch=async()=>{providerCalls++;throw Error('An approved historical cost must use the stored cohort');};
 try{
  const login=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
  const call=async(path,body)=>{const response=await worker.fetch(new Request(origin+'/api/admin/'+path,{method:body===undefined?'GET':'POST',headers:{cookie,origin,'content-type':'application/json',...(body===undefined?{}:{'x-csrf-token':state.csrf})},body:body===undefined?undefined:JSON.stringify(body)}),env);assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get('cache-control'),'no-store');return response.json();};
  const state=await call('state'),db=env.ADMIN_DB.db;
  const costs=await call('production-costs');costs.values.inclusive_plus_cents=2140;await call('production-costs',{revision:costs.revision,values:costs.values});
  const bindings=[{item_id:'101',model_id:'1',selling_unit:'SINGLE_GARMENT',size:'P',operator_confirmed:true},{item_id:'102',model_id:'2',selling_unit:'SINGLE_GARMENT',size:'G1',operator_confirmed:true},{item_id:'103',model_id:'3',selling_unit:'ONE_MALE_ONE_FEMALE_KIT',male_size:'M',female_size:'G',operator_confirmed:true}];
  db.prepare('UPDATE variant_bindings_state SET payload=?,revision=14').run(JSON.stringify(bindings));
  await storeCatalogClassificationFrame(env,{schema:'variant_catalog_v1',checked_at:stamp(),products:[{item_id:itemId,catalog_fingerprint:'a'.repeat(64),selling_unit:'SINGLE_GARMENT',bindings:[],unresolved_count:2,cost_catalog:{schema:'product_cost_catalog_v1',product_name:title,variants:[{model_id:'102',attributes:[{name:'Tamanho',value:'2'}]},{model_id:'114',attributes:[{name:'Tamanho',value:'14'}]}]},diagnostic:{axes:[{name:'Tamanho',options:['2','14'],option_count:2}],model_count:2,reasons:[{code:'OPTION_NOT_RECOGNIZED',count:2}]}}]});
  let windows=0;const sources={getFinanceBusinessPeriod:async(_,selection)=>finance(selection,++windows),getAdsCalendar:async(_,selection)=>ads(selection)};
  let frame=await businessMonth(env,{operation:'start',month},sources);while(frame.status==='RUNNING')frame=await businessMonth(env,{operation:'step',month},sources);
  await businessMonth(env,{operation:'ads',month},sources);await businessMonth(env,{operation:'expenses',month,revision:0,external_expenses_cents:0,recharge_treatment:'ADS_RECHARGE'},sources);
  const path='finance/cost-diagnostics?month='+month+'&evidence=history-v2',before=await call(path);
  assert.equal(before.diagnostic.summary.production_coverage.known_units,267);assert.equal(before.diagnostic.summary.production_coverage.pending_units,1);assert.equal(before.diagnostic.totals.known_production_cost_cents,778520);assert.equal(before.recorded_balance.amount_cents,239042);assert.equal(before.diagnostic.products[0].variants[0].model_id,modelId);assert.equal(before.diagnostic.products[0].variants[0].reason,'MODEL_NOT_IN_CATALOG');
  const payload=JSON.stringify({item_names:[title],model_names:['16'],missing_item_name:false,missing_model_name:false,conflict:false,overflow:false});
  db.prepare('INSERT INTO historical_cost_evidence_names(item_id,model_id,payload,approved,first_checked_at,last_checked_at) VALUES(?,?,?,1,?,?)').run(itemId,modelId,payload,stamp()-60,stamp()-60);
  // No classification/rule version change is needed for a code-only deploy.
  const immutable={history:db.prepare('SELECT * FROM historical_cost_evidence_names').all(),catalog:db.prepare('SELECT * FROM production_cost_catalog').all(),finance:db.prepare('SELECT * FROM business_month_frames').all(),bindings:db.prepare('SELECT * FROM variant_bindings_state').all(),expenses:db.prepare('SELECT * FROM business_month_expenses').all()};
  const after=await call(path),diagnostic=after.diagnostic;
  assert.equal(diagnostic.consistent,true);assert.equal(diagnostic.summary.state,'PROVISIONAL');assert.equal(diagnostic.summary.production_complete,true);assert.deepEqual(diagnostic.coverage,coverage);
  assert.deepEqual(diagnostic.summary.production_coverage,{total_units:268,known_units:268,pending_units:0,pending_variants:0,pending_products:0});assert.equal(diagnostic.totals.production_cost_cents,779770);assert.equal(diagnostic.totals.known_production_cost_cents,779770);assert.equal(after.recorded_balance.amount_cents,237792);
  assert.deepEqual(diagnostic.pending,['STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED']);assert.equal(diagnostic.totals.net_estimate_cents,null);assert.equal(diagnostic.totals.realized_net_cents,null);assert.deepEqual(diagnostic.products,[]);assert.deepEqual(after.history.pairs,[]);assert.deepEqual(diagnostic.source_checked_at,before.diagnostic.source_checked_at);assert.deepEqual(diagnostic.versions,before.diagnostic.versions);
  const display=await call('finance/business-month-view?month='+month);assert.equal(display.display.production_cost_cents,779770);assert.deepEqual(display.display.source_checked_at,diagnostic.source_checked_at);
  const changes=db.prepare('SELECT total_changes() AS n').get().n;await call(path);await call('finance/business-month-view?month='+month);assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changes,'warm reads must not write new source data or reassign the removed model');
  assert.deepEqual({history:db.prepare('SELECT * FROM historical_cost_evidence_names').all(),catalog:db.prepare('SELECT * FROM production_cost_catalog').all(),finance:db.prepare('SELECT * FROM business_month_frames').all(),bindings:db.prepare('SELECT * FROM variant_bindings_state').all(),expenses:db.prepare('SELECT * FROM business_month_expenses').all()},immutable);
  let rules=await call('cost-rules');rules.values.rules.find(rule=>rule.id==='camiseta-infantil').unit_cost_cents=1300;rules=await call('cost-rules',{revision:rules.revision,values:rules.values});
  const repriced=await call(path);assert.equal(repriced.diagnostic.totals.production_cost_cents,779920);assert.equal(repriced.recorded_balance.amount_cents,237642);assert.deepEqual(repriced.diagnostic.source_checked_at,diagnostic.source_checked_at);
  rules.values.rules.find(rule=>rule.id==='camiseta-infantil').enabled=false;await call('cost-rules',{revision:rules.revision,values:rules.values});const disabled=await call(path);assert.equal(disabled.diagnostic.totals.production_cost_cents,null);assert.equal(disabled.diagnostic.summary.production_coverage.pending_units,3);assert.ok(disabled.diagnostic.pending.includes('PRODUCTION_COST_INCOMPLETE'));
  assert.equal(providerCalls,0,'no Shopee, Finance, catalogue, Ads or history requests are needed');
 }finally{globalThis.fetch=previousFetch;env.ADMIN_DB.db.close();}
});
