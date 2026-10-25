import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {collectionFixture} from './business-collection-fixture.mjs';
import {runBusinessSync} from '../src/business-sync.mjs';
import {runCatalogClassifications,enqueueCatalogClassifications} from '../src/catalog-classification.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const orderRows=f=>f.financeEnv.FINANCE_DB.db.prepare('SELECT order_hash,checked_at FROM finance_business_period_orders ORDER BY order_hash').all();
const pendingRows=f=>f.financeEnv.FINANCE_DB.db.prepare('SELECT order_hash,checked_at FROM finance_business_period_payment_cache WHERE order_hash NOT IN (SELECT order_hash FROM finance_business_period_orders)').all();
const privateRun=f=>f.financeEnv.FINANCE_DB.db.prepare("SELECT run_id FROM finance_business_period_runs WHERE start_date='2026-10-01' ORDER BY created_at DESC LIMIT 1").get().run_id;
const privateRead=f=>f.services.getFinanceBusinessPeriod(f.env,{operation:'read',run_id:privateRun(f)});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const finish=async f=>{let frame;for(let step=0;step<6;step++){frame=await f.invoke('step');if(frame.status!=='RUNNING')return frame;}throw Error('collection did not finish');};

function failedLast(f){
 // Place order 22 last on the second page. This controls request order without
 // depending on crypto completion times or the host's timer scheduling.
 f.state.listHook=({base,offset})=>base===0&&offset===20?f.provider({order_list:[20,21,...Array.from({length:17},(_,index)=>23+index),22].map(index=>({order_sn:f.serial(index)})),more:false,next_cursor:''}):undefined;
}

test('a transient completed-order payment failure reuses validated payments and preserves their original observation times',async t=>{
 for(const kind of ['rate-limit','timeout'])await t.test(kind,async subtest=>{
  if(kind==='timeout')subtest.mock.timers.enable({apis:['setTimeout']});
  const f=await collectionFixture({allPaid:true,windowCounts:[40,0],paymentDelayMs:kind==='timeout'?0:1}),timeoutStarted=deferred();
  try{
   await f.invoke('start');const first=await f.invoke('step'),at=f.now()/1000;
   assert.equal(first.coverage.orders,20);assert.equal(first.known_sales_cents,130500);failedLast(f);let injected=false;
   f.state.paymentHook=({index,request})=>{
    if(index!==22||injected)return;injected=true;
    if(kind==='rate-limit')return Response.json({error:'upstream_busy'},{status:429});
    timeoutStarted.resolve();return new Promise((resolve,reject)=>request.signal.addEventListener('abort',()=>reject(new DOMException('fixture timeout','AbortError')),{once:true}));
   };
   const pending=f.invoke('step');
   if(kind==='timeout'){await timeoutStarted.promise;for(let turn=0;turn<5;turn++)await new Promise(resolve=>setImmediate(resolve));subtest.mock.timers.tick(5000);}
   const partial=await pending,privateFrame=await privateRead(f);
   assert.equal(privateFrame.diagnostic,kind==='rate-limit'?'BUSINESS_PERIOD_RATE_LIMIT':'BUSINESS_PERIOD_TIMEOUT');
   assert.equal(partial.collection.state,'RETRY_WAIT');assert.equal(partial.collection.code,privateFrame.diagnostic);assert.ok(partial.collection.retry_after_seconds>0);
   assert.equal(partial.coverage.orders,20);assert.equal(partial.known_sales_cents,130500);assert.equal(partial.result.net_estimate_cents,null);
   const cached=pendingRows(f);assert.equal(cached.length,19);assert.ok(cached.every(row=>row.checked_at===at));assert.ok(!cached.some(row=>row.order_hash===hash(f.serial(22))));
   const callsBefore=f.calls.payment.length;f.clock.time+=120000;
   const resumed=await f.invoke('step');assert.equal(resumed.coverage.orders,40);assert.equal(resumed.known_sales_cents,261000);
   assert.deepEqual(f.calls.payment.slice(callsBefore),[22],'the retry requests only the failed payment');
   const records=orderRows(f);assert.equal(records.length,40);assert.equal(new Set(records.map(row=>row.order_hash)).size,40);
   assert.equal(records.find(row=>row.order_hash===hash(f.serial(23))).checked_at,at,'using a cache does not refresh that source');
   assert.equal(records.find(row=>row.order_hash===hash(f.serial(22))).checked_at,at+120);
   const completed=await finish(f);assert.equal(completed.status,'COMPLETE');assert.equal(completed.coverage.payment_covered,40);assert.equal(completed.known_production_cost_cents,63600);assert.equal(completed.known_invoice_tax_cents,8605);
   assert.equal(completed.source_checked_at.finance_oldest_at,at);assert.equal(completed.result.net_profit_cents,null);
   assert.ok(!JSON.stringify(completed).includes('PRIVATE_INTEGRATION'));
  }finally{subtest.mock.timers.reset();f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();}
 });
});

test('a cron racing a browser page and catalogue classification retains progress without turning a held lease into source failure',async()=>{
 const f=await collectionFixture({allPaid:true,windowCounts:[40,0]}),entered=deferred(),release=deferred();
 let browser,catalog;
 try{
  await f.invoke('start');await f.invoke('step');await enqueueCatalogClassifications(f.env,[String(f.item(0))],{now:f.now});
  f.state.paymentHook=async({index})=>{if(index===22){entered.resolve();await release.promise;}};
  browser=f.invoke('step');await entered.promise;
  catalog=runCatalogClassifications(f.env,async(_,selection)=>{
   const itemId=selection.item_ids[0];return {schema:'variant_catalog_v1',checked_at:f.now()/1000,products:[{item_id:itemId,catalog_fingerprint:'a'.repeat(64),bindings:[{item_id:itemId,model_id:'0',size:'P'}],unresolved_count:0,selling_unit:'SINGLE_GARMENT',cost_catalog:{schema:'product_cost_catalog_v1',product_name:'Camiseta Adulta Verde',variants:[{model_id:'0',attributes:[{name:'Cor',value:'Verde'},{name:'Tamanho',value:'P'}]}]}}]};
  },{now:f.now,maxProducts:1});
  const background=await runBusinessSync(f.env,f.services,{now:f.now});
  assert.equal(background.status,'RUNNING');assert.equal(background.state.failure_count,0);assert.ok(!background.state.summary.pending.includes('SOURCE_UNAVAILABLE'));
  assert.equal(background.state.summary.collection.state,'RETRY_WAIT');assert.ok(['BUSINESS_PERIOD_BUSY','BUSINESS_PERIOD_CONFLICT'].includes(background.state.summary.collection.code));
  assert.equal(background.state.summary.net_estimate_cents,null);assert.equal(background.state.summary.coverage.orders,20);
  assert.equal((await catalog).status,'PROGRESSED');release.resolve();await browser;
  f.state.paymentHook=null;const completed=await finish(f);assert.equal(completed.status,'COMPLETE');assert.equal(completed.coverage.orders,40);assert.equal(completed.coverage.payment_covered,40);
  assert.equal(orderRows(f).length,40);assert.equal(new Set(f.calls.payment).size,40);assert.equal(f.calls.payment.length,40,'a competing collector does not repeat a leased payment page');
  assert.ok(!completed.result.pending.includes('SOURCE_UNAVAILABLE'));assert.equal(completed.known_production_cost_cents,63600);
 }finally{release.resolve();await Promise.allSettled([browser,catalog].filter(Boolean));f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();}
});

test('slow storage yields a resumable checkpoint and an invalid payment identity remains blocked without a fabricated total',async t=>{
 await t.test('storage consumes the remaining page budget',async()=>{
  const f=await collectionFixture({allPaid:true,windowCounts:[40,0]});
  try{
   await f.invoke('start');await f.invoke('step');const before=orderRows(f),calls=f.calls.payment.length;let delayed=false;
   f.financeEnv.FINANCE_DB.onRpc=({kind,sql})=>{if(!delayed&&kind==='batch'&&sql.includes('SELECT * FROM finance_business_period_runs')){delayed=true;f.clock.time+=18000;}};
   const yielded=await f.invoke('step');f.financeEnv.FINANCE_DB.onRpc=null;
   assert.equal(f.calls.financeFrames.at(-1).diagnostic,'BUSINESS_PERIOD_CHECKPOINT');assert.equal(yielded.coverage.orders,20);assert.equal(f.calls.payment.length,calls);assert.deepEqual(orderRows(f),before);
   assert.equal(yielded.collection.state,'RETRY_WAIT');assert.equal(yielded.collection.code,'BUSINESS_PERIOD_CHECKPOINT');assert.ok(!yielded.result.pending.includes('SOURCE_UNAVAILABLE'));
   assert.equal(yielded.result.net_estimate_cents,null);const resumed=await f.invoke('step');assert.equal(resumed.coverage.orders,40);assert.equal(orderRows(f).length,40);
   assert.equal(resumed.source_checked_at.finance_oldest_at,before[0].checked_at);assert.equal(resumed.source_checked_at.finance_latest_at,f.now()/1000);
  }finally{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();}
 });
 await t.test('a foreign identity cannot enter either the monthly total or payment cache',async()=>{
  const f=await collectionFixture({allPaid:true,windowCounts:[40,0]});
  try{
   await f.invoke('start');await f.invoke('step');f.state.paymentHook=({index})=>index===22?f.provider({order_sn:'PRIVATE_FOREIGN_ORDER',return_order_sn_list:[],order_income:{order_sn:'PRIVATE_FOREIGN_ORDER',original_cost_of_goods_sold:65.25,escrow_amount:47.51,ads_escrow_top_up_fee_or_technical_support_fee:0,items:[{item_id:f.item(index),model_id:0,line_item_id:index+1,quantity_purchased:1}]}}):undefined;
   const blocked=await f.invoke('step');assert.equal((await privateRead(f)).diagnostic,'BUSINESS_PERIOD_INVALID_SOURCE');assert.equal(blocked.coverage.orders,20);assert.equal(blocked.known_sales_cents,130500);assert.equal(blocked.result.net_estimate_cents,null);assert.equal(blocked.result.net_profit_cents,null);
   assert.equal(blocked.collection.state,'BLOCKED');assert.equal(blocked.collection.code,'BUSINESS_PERIOD_INVALID_SOURCE');assert.equal(blocked.collection.retry_after_seconds,0);
   assert.ok(!pendingRows(f).some(row=>row.order_hash===hash(f.serial(22))));assert.ok(!JSON.stringify(blocked).includes('PRIVATE_FOREIGN'));
  }finally{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();}
 });
});
