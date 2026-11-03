import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {runFinanceBusinessPeriod} from '../src/business-period.mjs';
import {projectBusinessPeriodFrame} from '../src/business-period-frame.mjs';
import {buildBusinessVariantBreakdown,projectBusinessVariantBreakdown,buildBusinessPeriodVariantsFrame,projectBusinessPeriodVariantsFrame} from '../src/business-variant-attribution.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const specs=[
 {status:'COMPLETED',items:[['100','1',2]],sales:10.25,payout:8,ads:.11},
 {status:'SHIPPED',items:[['100','2',1]],sales:20.25,payout:14,ads:0},
 {status:'COMPLETED',items:[['100','1',1],['100','2',2]],sales:30.25,payout:23,ads:0},
 {status:'COMPLETED',items:[['100','1',1],['200','9',3]],sales:40.25,payout:33,ads:0},
 {status:'SHIPPED',items:[['100','3',1]],missing:true},
 {status:'COMPLETED',items:[['200','9',1]],sales:.25,payout:-1,ads:-.5,returned:true},
 {status:'CANCELLED',items:[]},
];
async function fixture(values=specs,{finish=true}={}){
 const db=new D1(),clock={time:Date.UTC(2026,9,20,15)},now=()=>clock.time,calls=[];
 const env={FINANCE_DB:db,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,49).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:'SYNTHETIC_VARIANT_PARTNER_KEY'};
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:'SYNTHETIC_VARIANT_ACCESS',refresh_token:'SYNTHETIC_VARIANT_REFRESH',expires_at:now()/1000+14400});
 const serial=i=>'SYNTHETIC_VARIANT_ORDER_'+i,provider=response=>Response.json({error:'',response});
 const lines=(value,quantity)=>value.items.map(([item_id,model_id,amount])=>({item_id,model_id,[quantity]:amount}));
 const fetchImpl=async request=>{
  const url=new URL(request.url);calls.push(url.pathname);assert.equal(request.method,'GET');
  if(url.pathname.endsWith('/get_order_list'))return provider({order_list:values.map((value,i)=>({order_sn:serial(i)})),more:false,next_cursor:''});
  if(url.pathname.endsWith('/get_order_detail'))return provider({order_list:url.searchParams.get('order_sn_list').split(',').map(order_sn=>{const i=Number(order_sn.split('_').at(-1)),value=values[i];return {order_sn,order_status:value.status,currency:'BRL',create_time:Date.UTC(2026,9,20,12)/1000,item_list:lines(value,'model_quantity_purchased')};})});
  assert.ok(url.pathname.endsWith('/get_escrow_detail'));const order_sn=url.searchParams.get('order_sn'),i=Number(order_sn.split('_').at(-1)),value=values[i];
  if(value.missing)return Response.json({error:'order_not_found'});
  return provider({order_sn,return_order_sn_list:value.unknownReturns?undefined:value.returned?['SYNTHETIC_VARIANT_RETURN']:[],order_income:{order_sn,items:lines(value,'quantity_purchased'),original_cost_of_goods_sold:value.sales,escrow_amount:value.payout,ads_escrow_top_up_fee_or_technical_support_fee:value.ads}});
 };
 const run=options=>runFinanceBusinessPeriod(env,{fetchImpl,now,...options});
 let frame=await run({operation:'start',start_date:'2026-10-14',end_date:'2026-10-20'});for(let step=0;finish&&frame.status==='RUNNING'&&step<5;step++){frame=await run({operation:'step',run_id:frame.run_id});assert.equal(frame.diagnostic,null,'synthetic source must not hide collection failures');}if(finish)assert.equal(frame.status,'COMPLETE');
 const records=()=>db.db.prepare('SELECT * FROM finance_business_period_orders WHERE run_id=? ORDER BY order_hash').all(frame.run_id);
 return {db,env,clock,now,calls,run,frame,records};
}

test('committed paid orders partition single pairs, same-product variants and mixed products with exact conservation',async()=>{
 const f=await fixture(),before=JSON.stringify(f.frame),records=f.records(),recorded=JSON.stringify(records),result=await buildBusinessPeriodVariantsFrame(f.frame,records);
 assert.ok(await projectBusinessPeriodVariantsFrame(result));const v=result.variant_financials;assert.ok(v);assert.equal(v.report_hash,hash(JSON.stringify(f.frame)));
 assert.equal(v.variants.length,4);assert.deepEqual(v.variants.map(row=>[row.item_id,row.model_id,row.quantity]),[['100','1',2],['100','2',1],['100','3',1],['200','9',1]]);
 assert.equal(v.variants[0].known_expected_repass_raw,'8');assert.equal(v.unallocated_products.length,1);assert.equal(v.unallocated_products[0].known_expected_repass_raw,'23');assert.equal(v.unallocated_products[0].quantity,3);
 assert.equal(v.mixed.known_expected_repass_raw,'33');assert.equal(v.mixed.quantity,4);assert.equal(v.mixed.orders,f.frame.product_breakdown.mixed_orders);
 assert.equal(JSON.stringify(f.frame),before);assert.equal(JSON.stringify(records),recorded);
 for(const secret of ['SYNTHETIC_VARIANT_ORDER','SYNTHETIC_VARIANT_ACCESS','SYNTHETIC_VARIANT_RETURN','order_hash','source_hash','line_item_id'])assert.ok(!JSON.stringify(result).includes(secret),secret);
});

test('missing payment and return evidence keep coverage explicit without inventing strict raw money',async()=>{
 const f=await fixture(),result=await buildBusinessPeriodVariantsFrame(f.frame,f.records()),v=result.variant_financials,missing=v.variants.find(row=>row.model_id==='3'),returned=v.variants.find(row=>row.item_id==='200');
 assert.equal(missing.payment_missing,1);assert.equal(missing.returns_unknown,1);assert.equal(missing.known_expected_repass_raw,'0');assert.equal(missing.expected_repass_raw,null);
 assert.equal(returned.returns,1);assert.equal(returned.known_expected_repass_raw,'-1');assert.equal(returned.known_ads_adjustment_raw,'-0.5');
 const g=await fixture([{...specs[0],unknownReturns:true}]),unknown=(await buildBusinessPeriodVariantsFrame(g.frame,g.records())).variant_financials.variants[0];assert.equal(unknown.returns_unknown,1);assert.equal(unknown.payment_covered,1);
});

test('per-order tax rounds before grouping, and no withheld adjustment is added to the repass',async()=>{
 const f=await fixture([{...specs[0],items:[['100','1',1]],sales:.25,payout:.2,ads:.11},{...specs[0],items:[['100','1',1]],sales:.25,payout:.2,ads:.11}]);
 const row=(await buildBusinessPeriodVariantsFrame(f.frame,f.records())).variant_financials.variants[0];assert.equal(row.known_sales_base_raw,'0.5');assert.equal(row.known_invoice_tax_raw,'0.02','two 0.005 estimates each round to0.01');assert.equal(row.known_expected_repass_raw,'0.4');assert.equal(row.known_ads_adjustment_raw,'0.22');
});

test('opt-in responses preserve the exact legacy report, daily detail and provider read count',async()=>{
 const f=await fixture(),before=f.calls.length,legacy=await f.run({operation:'read',run_id:f.frame.run_id}),v=await f.run({operation:'read',run_id:f.frame.run_id,includeVariants:true});
 assert.deepEqual(v.report,legacy);assert.equal(JSON.stringify(v.report),JSON.stringify(legacy));assert.equal(f.calls.length,before);assert.ok(v.variant_financials);
 const daily=await f.run({operation:'read',run_id:f.frame.run_id,includeDaily:true}),withBoth=await f.run({operation:'step',run_id:f.frame.run_id,includeDaily:true,includeVariants:true});
 assert.deepEqual(withBoth.report,daily);assert.ok(daily.daily_breakdown);assert.equal(withBoth.variant_financials.report_hash,hash(JSON.stringify(daily)));assert.ok(await projectBusinessPeriodVariantsFrame(withBoth));assert.equal(f.calls.length,before);
 await assert.rejects(f.run({operation:'read',run_id:f.frame.run_id,includeVariants:'true'}),error=>error.code==='FINANCE_BUSINESS_REQUEST_INVALID');assert.equal(f.calls.length,before);
});

test('valid payment-cache rows outside the committed cohort never enter the aggregation',async()=>{
 const f=await fixture(),copy={...f.records().find(row=>row.payment_covered===1)},canonical={order_hash:hash('SYNTHETIC_UNCOMMITTED'),bucket:copy.bucket,payment_covered:copy.payment_covered,sales_raw:copy.sales_raw,escrow_raw:copy.escrow_raw,ads_raw:copy.ads_raw,returns_seen:copy.returns_seen,items:JSON.stringify([{item_id:'999',model_id:'8',quantity:99}]),checked_at:copy.checked_at};
 const columns=Object.keys(canonical),source_hash=hash(JSON.stringify(canonical));f.db.db.prepare('INSERT INTO finance_business_period_payment_cache(run_id,'+columns.join(',')+',source_hash) VALUES('+Array(columns.length+2).fill('?').join(',')+')').run(f.frame.run_id,...columns.map(key=>canonical[key]),source_hash);
 const before=f.calls.length,result=await f.run({operation:'read',run_id:f.frame.run_id,includeVariants:true});assert.equal(result.report.items.some(row=>row.item_id==='999'),false);assert.equal(result.variant_financials.variants.some(row=>row.item_id==='999'),false);assert.equal(f.calls.length,before);
});

test('parent identity, payload hash and partition conservation reject tampering instead of downgrading',async()=>{
 const f=await fixture(),wrapper=await buildBusinessPeriodVariantsFrame(f.frame,f.records());
 for(const mutate of [v=>v.variant_financials.source_revision++,v=>v.variant_financials.report_hash='a'.repeat(64),v=>v.variant_financials.variants[0].quantity++,v=>v.variant_financials.variants[0].known_expected_repass_raw='9',v=>v.variant_financials.variants.push(structuredClone(v.variant_financials.variants[0])),v=>v.variant_financials.mixed.items.reverse(),v=>v.extra=true]){const changed=structuredClone(wrapper);mutate(changed);assert.equal(await projectBusinessPeriodVariantsFrame(changed),null);}
 const stale=structuredClone(wrapper);stale.report={...stale.report,checked_at:stale.report.checked_at+1};assert.ok(projectBusinessPeriodFrame(stale.report));assert.equal(await projectBusinessPeriodVariantsFrame(stale),null);
 assert.ok(await projectBusinessPeriodVariantsFrame({...wrapper,variant_financials:null}));
});

test('optional aggregate failure retains a valid envelope with unknown evidence and no extra source work',async()=>{
 const f=await fixture(),wrong=f.records().slice(1),result=await buildBusinessPeriodVariantsFrame(f.frame,wrong);assert.equal(result.variant_financials,null);assert.deepEqual(result.report,f.frame);assert.ok(await projectBusinessPeriodVariantsFrame(result));
 const before=f.calls.length,empty=await f.run({operation:'start',start_date:'2026-10-01',end_date:'2026-10-01',includeVariants:true});assert.equal(empty.report.status,'RUNNING');assert.equal(empty.variant_financials.variants.length,0);assert.equal(f.calls.length,before);
});

test('synchronous projection is closed and detached, including null-prototype descriptors and accessor rejection',async()=>{
 const f=await fixture(),v=await buildBusinessPeriodVariantsFrame(f.frame,f.records()),before=JSON.stringify(v),digest=v.variant_financials.report_hash;
 const projected=projectBusinessVariantBreakdown(v.variant_financials,v.report,digest);assert.ok(projected);projected.variants[0].quantity=999;assert.equal(JSON.stringify(v),before);
 let reads=0;const bad=structuredClone(v.variant_financials);Object.defineProperty(bad,'variants',{get(){reads++;throw Error('must not read');},enumerable:true});assert.equal(projectBusinessVariantBreakdown(bad,v.report,digest),null);assert.equal(reads,0);
 const context=vm.createContext({TextEncoder});context.serialized=JSON.stringify(v);vm.runInContext('const p='+projectBusinessVariantBreakdown.toString()+';const v=JSON.parse(serialized);globalThis.result=p(v.variant_financials,v.report,v.variant_financials.report_hash);',context);assert.equal(JSON.stringify(context.result),JSON.stringify(v.variant_financials));
});

test('raw bounds, canonical decimals and incomplete order inputs cannot create an attributed value',async()=>{
 const f=await fixture(),records=f.records(),digest=hash(JSON.stringify(f.frame));
 assert.equal(buildBusinessVariantBreakdown(f.frame,[...records,records[0]],digest),null);
 const changed=structuredClone(records);changed.find(row=>row.payment_covered===1).escrow_raw='8.00';assert.equal(buildBusinessVariantBreakdown(f.frame,changed,digest),null);
 const over=structuredClone(await buildBusinessPeriodVariantsFrame(f.frame,records));over.variant_financials.variants[0].known_expected_repass_raw='100000000000000000000000';assert.equal(await projectBusinessPeriodVariantsFrame(over),null);
});

test('checkpoint and lease-conflict envelopes bind their exact diagnostic report without provider work',async()=>{
 const f=await fixture([],{finish:false}),prepare=f.db.prepare.bind(f.db);let delayed=false;
 f.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('SELECT * FROM finance_business_period_runs')){const run=statement.run.bind(statement);statement.run=async()=>{const result=await run();if(!delayed){delayed=true;f.clock.time+=18000;}return result;};}return statement;};
 const yielded=await f.run({operation:'step',run_id:f.frame.run_id,includeDaily:true,includeVariants:true});assert.equal(yielded.report.diagnostic,'BUSINESS_PERIOD_CHECKPOINT');assert.ok(yielded.report.daily_breakdown);assert.ok(await projectBusinessPeriodVariantsFrame(yielded));assert.equal(yielded.variant_financials.report_hash,hash(JSON.stringify(yielded.report)));assert.equal(f.calls.length,0);
 const g=await fixture([],{finish:false});g.db.db.prepare('UPDATE finance_business_period_runs SET lease_owner=?,lease_until=? WHERE run_id=?').run(crypto.randomUUID(),g.now()/1000+40,g.frame.run_id);
 const conflict=await g.run({operation:'step',run_id:g.frame.run_id,includeVariants:true});assert.equal(conflict.report.diagnostic,'BUSINESS_PERIOD_CONFLICT');assert.ok(await projectBusinessPeriodVariantsFrame(conflict));assert.equal(conflict.variant_financials.report_hash,hash(JSON.stringify(conflict.report)));assert.equal(g.calls.length,0);
});

test('large unallocated commercial quantities stay exact without an artificial aggregate-unit cap',async()=>{
 const items=Array.from({length:150},(_,i)=>['100',String(10000+i),1000000000]);
 const f=await fixture(Array.from({length:10},()=>({...specs[0],items}))),result=await buildBusinessPeriodVariantsFrame(f.frame,f.records());assert.ok(result.variant_financials);assert.equal(result.variant_financials.variants.length,0);assert.equal(result.variant_financials.unallocated_products[0].quantity,1500000000000);assert.ok(await projectBusinessPeriodVariantsFrame(result));
});

test('a dense valid legacy frame keeps its exact bytes when optional aggregation exceeds its byte budget',async()=>{
 const f=await fixture([specs[0]]),frame=structuredClone(f.frame),item_id='10000000000000000001',ids=Array.from({length:1000},(_,i)=>String(20000000000000000000n+BigInt(i))),count=1000;
 const money={sales_base:'999999999999990',expected_repass:'-999999999999990',ads_adjustment:'-999999999999990',invoice_tax:'20000000000000'};
 Object.assign(frame,{pages_read:50,coverage:{orders:count,paid:count,completed:count,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:count,payment_missing:0,returns:0,returns_unknown:0},items:ids.map((model_id,i)=>({item_id,model_id,quantity:i<999?2:1}))});
 for(const name of ['sales_base','expected_repass','ads_adjustment'])frame['known_'+name+'_raw']=frame[name+'_raw']=money[name];
 Object.assign(frame.invoice_tax,{covered_orders:count,unavailable_orders:0,known_base_raw:money.sales_base,known_tax_raw:money.invoice_tax});
 const product={...frame.product_breakdown.products[0],item_id,quantity:1999,orders:count,exclusive_orders:count,mixed_orders:0,exclusive_payment_covered:count,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,items:ids.map((model_id,i)=>({model_id,exclusive_quantity:i<999?2:1,mixed_quantity:0}))};
 for(const name of Object.keys(money))product['known_exclusive_'+name+'_raw']=product['exclusive_'+name+'_raw']=money[name];frame.product_breakdown.products=[product];assert.ok(projectBusinessPeriodFrame(frame));
 const records=ids.map((model_id,i)=>{const record={order_hash:hash('SYNTHETIC_DENSE_'+i),bucket:'completed',payment_covered:1,sales_raw:'999999999999.99',escrow_raw:'-999999999999.99',ads_raw:'-999999999999.99',returns_seen:0,items:JSON.stringify(i<999?[{item_id,model_id,quantity:1}]:ids.map(model_id=>({item_id,model_id,quantity:1}))),checked_at:frame.checked_at};return {...record,source_hash:hash(JSON.stringify(record))};});
 const result=await buildBusinessPeriodVariantsFrame(frame,records);assert.equal(result.variant_financials===null,true,'dense evidence must respect its byte ceiling');assert.equal(JSON.stringify(result.report),JSON.stringify(frame));assert.ok(await projectBusinessPeriodVariantsFrame(result));assert.ok(Buffer.byteLength(JSON.stringify(result))<2097152);
});
