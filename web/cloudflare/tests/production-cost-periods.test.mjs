import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {D1} from './sqlite-d1.mjs';
import {SCHEMA} from '../src/admin.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {readCostRules,syncCostRuleCatalog} from '../src/cost-rules.mjs';
import {projectProductionOrdersFrame} from '../../finance/src/production-orders-frame.mjs';
import {businessMonth} from '../src/business-month.mjs';
import {productionCostPeriods,captureProductionCostMonth,PRODUCTION_COST_PERIODS_SCHEMA} from '../src/production-cost-periods.mjs';

const base=Date.parse('2026-10-28T12:00:00Z');
const line=(item_id='201',model_id='0',quantity=1)=>({line_key:item_id+':'+model_id,item_id,model_id,sku:'arte-27',quantity,model_name:'Modelo'});
const order=(order_id='ORDER_1',changes={})=>({order_id,status:'READY_TO_SHIP',create_time:base/1000-3600,update_time:base/1000-60,lines:[line()],...changes});
const clone=value=>JSON.parse(JSON.stringify(value));

async function fixture(t,{orders=[order()],time=base,bindings=null,costs={}}={}){
 const ADMIN_DB=new D1(),actual=ADMIN_DB.batch.bind(ADMIN_DB);let tail=Promise.resolve();
 ADMIN_DB.batch=statements=>{const pending=tail.then(()=>actual(statements));tail=pending.catch(()=>{});return pending;};
 t.after(()=>ADMIN_DB.db.close());await ADMIN_DB.batch([...SCHEMA,...PRODUCTION_COST_PERIODS_SCHEMA].map(sql=>ADMIN_DB.prepare(sql)));
 const values={...COST_DEFAULTS,components:[],inclusive_plus_cents:2140,custom_profiles:[{id:'calca',label:'Calça completa',unit_cost_cents:5000}],custom_assignments:[{item_id:'205',model_id:null,profile_id:'calca'}],...costs};
 const stored=bindings??[{item_id:'201',model_id:'0',size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:true},{item_id:'202',model_id:'0',size:'G1',selling_unit:'SINGLE_GARMENT',operator_confirmed:true},{item_id:'204',model_id:'0',male_size:'M',female_size:'G2',selling_unit:'ONE_MALE_ONE_FEMALE_KIT',operator_confirmed:true}];
 ADMIN_DB.db.prepare('INSERT OR REPLACE INTO production_costs_state(id,revision,payload,updated_at) VALUES(1,5,?,?)').run(JSON.stringify(values),new Date(time).toISOString());
 ADMIN_DB.db.prepare('INSERT OR REPLACE INTO variant_bindings_state(id,revision,payload,updated_at) VALUES(1,3,?,?)').run(JSON.stringify(stored),new Date(time).toISOString());await readCostRules({ADMIN_DB});
 const state={time,orders:clone(orders),calls:[],source:null},env={ADMIN_DB},now=()=>state.time;
 const frame=(input,rows=state.orders)=>{
  const selected=rows.filter(row=>row.create_time>=Date.parse(input.start_date+'T00:00:00-03:00')/1000&&row.create_time<Date.parse(input.end_date+'T00:00:00-03:00')/1000+86400);
  const value={schema:'production_orders_v1',shop_id:1178167501,checked_at:Math.floor(state.time/1000),start_date:input.start_date,end_date:input.end_date,complete:true,orders:clone(selected)};
  assert.ok(projectProductionOrdersFrame(value),'source fixture must satisfy the real provider projector');return value;
 };
 const services={getFinanceProductionOrders:async(_,input)=>{state.calls.push(clone(input));return state.source?state.source(input):frame(input);}};
 const run=(operation,month='2026-10')=>productionCostPeriods(env,{operation,month},services,{now});
 const child=()=>syncCostRuleCatalog(env,['203'],async()=>({schema:'variant_catalog_v1',checked_at:Math.floor(state.time/1000),products:[{item_id:'203',catalog_fingerprint:'c'.repeat(64),bindings:[],unresolved_count:1,cost_catalog:{schema:'product_cost_catalog_v1',product_name:'Camiseta Infantil Estrela',variants:[{model_id:'0',attributes:[{name:'Tamanho',value:'4'}]}]}}]}),{now});
 return {env,state,services,now,frame,values,child,read:month=>run('read',month),sync:month=>run('sync',month)};
}

async function seedMonth(f){
 const stamp=Math.floor(f.state.time/1000),calls=[];
 const services={getFinanceBusinessPeriod:async(_,input)=>{calls.push(clone(input));return {schema:'finance_business_period_v1',run_id:'11111111-1111-4111-8111-'+String(calls.length).padStart(12,'0'),revision:2,status:'COMPLETE',start_date:input.start_date,end_date:input.end_date,cutoff_at:stamp-2,checked_at:stamp,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:1,paid:1,completed:1,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'20',sales_base_raw:'20',known_expected_repass_raw:'15',expected_repass_raw:'15',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:0,known_base_raw:'20',known_tax_raw:'0.4'},items:[{item_id:'201',model_id:'0',quantity:1}],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};}};
 let frame=await businessMonth(f.env,{operation:'start',month:'2026-10'},services,{now:f.now});for(let count=0;frame.status==='RUNNING'&&count<4;count++)frame=await businessMonth(f.env,{operation:'step',month:'2026-10'},services,{now:f.now});assert.equal(frame.status,'COMPLETE');assert.equal(frame.production_cost_cents,3180);return {frame,calls};
}

test('read uses only local state and distinguishes unavailable production from a real zero',async t=>{
 const f=await fixture(t);let financialReads=0;f.services.getFinanceBusinessPeriod=async()=>{financialReads++;throw Error('unexpected private source read');};
 const result=await f.read();assert.equal(result.schema,'production_cost_periods_v1');assert.equal(result.reference_month,'2026-10');assert.equal(result.currency,'BRL');assert.equal(result.basis,'CURRENT_REGISTERED_COSTS_PAID_CREATE_DATE');
 assert.equal(result.weekly.start_date,'2026-10-26');assert.equal(result.weekly.end_date,'2026-10-28');assert.equal(result.weekly.state,'UNAVAILABLE');assert.equal(result.weekly.production_cost_cents,null);assert.equal(result.weekly.known_production_cost_cents,null);assert.deepEqual(result.weekly.pending,['SOURCE_MISSING']);assert.equal(result.monthly.production_cost_cents,null);assert.equal(f.state.calls.length,0);assert.equal(financialReads,0);
});

test('one current-week scan prices regular, current plus, child, couple-kit and custom units once',async t=>{
 const f=await fixture(t,{orders:[order('MIX',{lines:[line('201','0',2),line('202'),line('203','0',3),line('204'),line('205','0',2)]})]});await f.child();
 const result=await f.sync();assert.deepEqual(f.state.calls,[{operation:'scan',start_date:'2026-10-26',end_date:'2026-10-28'}]);const week=result.weekly;
 assert.equal(week.state,'COMPLETE');assert.equal(week.production_cost_cents,22800);assert.equal(week.known_production_cost_cents,22800);assert.equal(week.coverage.total_units,9);assert.equal(week.coverage.known_units,9);assert.equal(week.coverage.pending_units,0);assert.deepEqual(week.pending,[]);assert.equal(week.versions.bindings,3);assert.equal(week.versions.costs,5);
 assert.deepEqual(week.days.map(row=>[row.date,row.production_cost_cents]),[['2026-10-26',0],['2026-10-27',0],['2026-10-28',22800]]);assert.equal(week.source_start_date,week.start_date);assert.equal(week.source_end_date,week.end_date);assert.equal(week.source_checked_at,base/1000);
 const read=await f.read();assert.equal(read.weekly.production_cost_cents,22800);assert.equal(f.state.calls.length,1);
});

test('cancelled, cancelling, unpaid and unknown orders never enter the priced paid cohort',async t=>{
 const paid=['READY_TO_SHIP','PROCESSED','RETRY_SHIP','SHIPPED','TO_CONFIRM_RECEIVE','COMPLETED','INVOICE_PENDING'];
 const excluded=['CANCELLED','IN_CANCEL','UNPAID','UNKNOWN','TO_RETURN'];const rows=[...paid.map(status=>order(status,{status})),...excluded.map(status=>order(status,{status,lines:[line('999','0',100)]}))],f=await fixture(t,{orders:rows});
 const {weekly:week}=await f.sync();assert.equal(week.coverage.orders,12);assert.equal(week.coverage.eligible_orders,7);assert.equal(week.coverage.excluded_cancelled,1);assert.equal(week.coverage.excluded_cancel_pending,1);assert.equal(week.coverage.excluded_unpaid,1);assert.equal(week.coverage.review_orders,2);assert.equal(week.coverage.total_units,7);assert.equal(week.coverage.pending_units,0);assert.equal(week.known_production_cost_cents,11130);assert.equal(week.production_cost_cents,null);assert.ok(week.pending.includes('STATUS_REVIEW_REQUIRED'));assert.ok(!week.pending.includes('PRODUCTION_COST_INCOMPLETE'));assert.ok(week.days.every(slot=>slot.production_cost_cents===null),'daily observed subtotals cannot claim complete costs while eligibility is still under review');
});

test('the weekly eligible cohort stays in exact parity with the private Finance paid-status set',async t=>{
 const source=readFileSync(new URL('../../finance/src/business-period.mjs',import.meta.url),'utf8'),match=source.match(/^const\s+businessSalesStatuses\s*=\s*new Set\(\[([^\]\r\n]*)\]\);/m);
 assert.ok(match,'Finance must retain an inspectable paid-status literal');assert.match(match[1],/^\s*'[A-Z_]+'\s*(?:,\s*'[A-Z_]+'\s*)*$/,'read only a list of quoted status names; never execute the Finance module');
 const finance=new Set([...match[1].matchAll(/'([A-Z_]+)'/g)].map(row=>row[1])),statuses=['UNPAID','READY_TO_SHIP','PROCESSED','RETRY_SHIP','SHIPPED','TO_CONFIRM_RECEIVE','COMPLETED','IN_CANCEL','CANCELLED','INVOICE_PENDING','TO_RETURN','UNKNOWN'];
 assert.equal(finance.size,7);assert.ok([...finance].every(status=>statuses.includes(status)));const f=await fixture(t,{orders:statuses.map(status=>order(status,{status}))}),{weekly:week}=await f.sync();
 assert.equal(week.coverage.eligible_orders,finance.size);assert.equal(week.known_production_cost_cents,finance.size*1590);assert.equal(week.coverage.excluded_cancelled,1);assert.equal(week.coverage.excluded_cancel_pending,1);assert.equal(week.coverage.excluded_unpaid,1);assert.equal(week.coverage.review_orders,2);
 for(const status of statuses){f.state.time+=1000;f.state.orders=[order(status,{status})];const {weekly:single}=await f.sync();assert.equal(single.coverage.eligible_orders,finance.has(status)?1:0,status);assert.equal(single.known_production_cost_cents,finance.has(status)?1590:0,status);assert.equal(single.coverage.review_orders,['UNKNOWN','TO_RETURN'].includes(status)?1:0,status);}
});

test('unpriced sold quantities preserve their known production subtotal and leave the full total null',async t=>{
 const f=await fixture(t,{orders:[order('PARTIAL',{lines:[line('201','0',2),line('999','0',3)]})]}),{weekly:week}=await f.sync();
 assert.equal(week.state,'PARTIAL');assert.equal(week.production_cost_cents,null);assert.equal(week.known_production_cost_cents,3180);assert.deepEqual([week.coverage.total_units,week.coverage.known_units,week.coverage.pending_units,week.coverage.pending_variants],[5,2,3,1]);assert.ok(week.pending.includes('PRODUCTION_COST_INCOMPLETE'));assert.equal(week.days.at(-1).production_cost_cents,null);assert.equal(week.days.at(-1).known_production_cost_cents,3180);
});

test('a paid order without item lines cannot become a zero-cost order or a fully counted quantity',async t=>{
 const f=await fixture(t,{orders:[order(),order('EMPTY',{lines:[]})]}),{weekly:week}=await f.sync();
 assert.equal(week.state,'PARTIAL');assert.equal(week.coverage.eligible_orders,2);assert.equal(week.coverage.total_units,null);assert.equal(week.coverage.known_units,1);assert.equal(week.known_production_cost_cents,1590);assert.equal(week.production_cost_cents,null);assert.ok(week.pending.includes('ORDER_LINES_MISSING'));assert.equal(week.days.at(-1).total_units,null);assert.equal(week.days.at(-1).production_cost_cents,null);
});

test('provider failure preserves the last approved source and marks its amounts partial without private error text',async t=>{
 const f=await fixture(t),first=await f.sync(),before=f.env.ADMIN_DB.db.prepare('SELECT payload,source_checked_at FROM production_cost_week_state').get();f.state.time+=1000;f.state.source=async()=>{throw Error('PRIVATE_TOKEN https://private.invalid/customer');};
 const second=await f.sync();assert.equal(second.weekly.state,'PARTIAL');assert.equal(second.weekly.production_cost_cents,null);assert.equal(second.weekly.known_production_cost_cents,1590);assert.equal(second.weekly.source_checked_at,first.weekly.source_checked_at);assert.ok(second.weekly.pending.includes('SOURCE_UNAVAILABLE'));assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT payload,source_checked_at FROM production_cost_week_state').get(),before);assert.doesNotMatch(JSON.stringify(second),/PRIVATE_TOKEN|private\.invalid|customer/);
 await f.read();assert.equal(f.state.calls.length,2);
});

test('incomplete, stale, mismatched and extra-field source frames never overwrite an approved cache',async t=>{
 const f=await fixture(t);await f.sync();const before=f.env.ADMIN_DB.db.prepare('SELECT payload,source_checked_at FROM production_cost_week_state').get();
 for(const mutate of [value=>({...value,complete:false}),value=>({...value,shop_id:999}),value=>({...value,start_date:'2026-10-27'}),value=>({...value,checked_at:base/1000-121}),value=>({...value,buyer:'PRIVATE'})]){
  f.state.source=input=>mutate(f.frame(input));const result=await f.sync();assert.equal(result.weekly.production_cost_cents,null);assert.equal(result.weekly.known_production_cost_cents,1590);assert.ok(result.weekly.pending.includes('SOURCE_UNAVAILABLE'));assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT payload,source_checked_at FROM production_cost_week_state').get(),before);
 }
});

test('local reads disclose an aged source and reprice only with the registered cost revision',async t=>{
 const f=await fixture(t,{orders:[order('COSTS',{lines:[line('201'),line('202')]})]});assert.equal((await f.sync()).weekly.production_cost_cents,3730);
 const values={...f.values,inclusive_regular_cents:1990};f.env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET revision=6,payload=? WHERE id=1').run(JSON.stringify(values));let result=await f.read();assert.equal(result.weekly.production_cost_cents,4130);assert.equal(result.weekly.versions.costs,6);assert.equal(f.state.calls.length,1);
 f.state.time+=901000;result=await f.read();assert.equal(result.weekly.production_cost_cents,null);assert.equal(result.weekly.known_production_cost_cents,4130);assert.equal(result.weekly.source_checked_at,base/1000);assert.ok(result.weekly.pending.includes('SOURCE_STALE'));assert.equal(f.state.calls.length,1);
});

test('a missing registered-cost state does not replace known items with a manufactured zero total',async t=>{
 const f=await fixture(t);await f.sync();f.env.ADMIN_DB.db.prepare('DELETE FROM production_costs_state').run();const {weekly:week}=await f.read();
 assert.equal(week.state,'PARTIAL');assert.equal(week.production_cost_cents,null);assert.equal(week.known_production_cost_cents,null);assert.ok(week.pending.includes('COSTS_UNAVAILABLE'));assert.equal(f.state.calls.length,1);
});

test('more than a thousand distinct sold models are priced across bounded batches without dropping the final model',async t=>{
 const lines=Array.from({length:1001},(_,index)=>line('205',String(index))),orders=Array.from({length:6},(_,index)=>order('BULK_'+index,{lines:lines.slice(index*200,index*200+200)})),f=await fixture(t,{orders}),{weekly:week}=await f.sync();
 assert.equal(week.state,'COMPLETE');assert.equal(week.coverage.total_units,1001);assert.equal(week.coverage.known_units,1001);assert.equal(week.coverage.pending_units,0);assert.equal(week.production_cost_cents,5005000);assert.equal(week.known_production_cost_cents,5005000);assert.equal(f.state.calls.length,1);
});

test('an active weekly lease coalesces concurrent syncs before calling the provider',async t=>{
 const f=await fixture(t);let entered,release;const started=new Promise(resolve=>{entered=resolve;}),blocked=new Promise(resolve=>{release=resolve;});f.state.source=async input=>{entered();await blocked;return f.frame(input);};
 const pending=f.sync();await started;const concurrent=await f.sync();assert.equal(concurrent.weekly.sync_state,'RUNNING');assert.equal(f.state.calls.length,1);release();assert.equal((await pending).weekly.production_cost_cents,1590);assert.equal((await f.read()).weekly.sync_state,'IDLE');
});

test('an expired lease fences a late approved response from overwriting the winning scan',async t=>{
 const f=await fixture(t);let entered,release;const started=new Promise(resolve=>{entered=resolve;}),blocked=new Promise(resolve=>{release=resolve;});let reads=0;
 f.state.source=async input=>{if(++reads===1){entered();await blocked;return f.frame(input,[order('ORDER_1',{update_time:Math.floor(f.state.time/1000)-1,lines:[line('201','0',2)]})]);}return f.frame(input,[order('ORDER_1',{update_time:Math.floor(f.state.time/1000)-1,lines:[line('201','0',4)]})]);};
 const late=f.sync();await started;f.state.time+=121000;const winner=await f.sync();assert.equal(winner.weekly.production_cost_cents,6360);const before=f.env.ADMIN_DB.db.prepare('SELECT payload,source_checked_at FROM production_cost_week_state').get();release();assert.equal((await late).weekly.production_cost_cents,6360);assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT payload,source_checked_at FROM production_cost_week_state').get(),before);assert.equal(f.state.calls.length,2);
});

test('regressed source and order clocks cannot resurrect an older cost quantity',async t=>{
 const f=await fixture(t);await f.sync();const before=f.env.ADMIN_DB.db.prepare('SELECT payload,source_checked_at FROM production_cost_week_state').get();f.state.time+=1000;
 for(const mutate of [value=>({...value,checked_at:base/1000-1}),value=>({...value,orders:value.orders.map(row=>({...row,update_time:base/1000-61}))})]){
  f.state.source=input=>mutate(f.frame(input,[order('ORDER_1',{lines:[line('201','0',9)]})]));const result=await f.sync();assert.equal(result.weekly.known_production_cost_cents,1590);assert.equal(result.weekly.production_cost_cents,null);assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT payload,source_checked_at FROM production_cost_week_state').get(),before);
 }
});

test('Sunday to Monday in Brasilia starts a new week and a past monthly selection never changes the live weekly scan',async t=>{
 const sunday=Date.parse('2026-10-26T02:59:59Z'),f=await fixture(t,{orders:[],time:sunday});let result=await f.sync('2026-09');assert.deepEqual(f.state.calls[0],{operation:'scan',start_date:'2026-10-19',end_date:'2026-10-25'});assert.equal(result.weekly.days.length,7);assert.equal(result.weekly.production_cost_cents,0);assert.equal(result.monthly.start_date,'2026-09-01');assert.equal(result.monthly.end_date,'2026-09-30');
 f.state.time+=1000;result=await f.read('2026-09');assert.equal(result.weekly.start_date,'2026-10-26');assert.equal(result.weekly.state,'UNAVAILABLE');assert.equal(result.weekly.production_cost_cents,null);assert.equal(result.weekly.source_checked_at,null);
 result=await f.sync('2026-09');assert.deepEqual(f.state.calls[1],{operation:'scan',start_date:'2026-10-26',end_date:'2026-10-26'});assert.equal(result.weekly.days.length,1);assert.equal(result.weekly.production_cost_cents,0);
});

test('an existing monthly cohort is read locally and is not replaced by the current-week subset',async t=>{
 const f=await fixture(t);await seedMonth(f);
 const read=await f.read();assert.equal(read.monthly.state,'COMPLETE');assert.equal(read.monthly.production_cost_cents,3180);assert.equal(read.monthly.coverage.eligible_orders,2);assert.equal(f.state.calls.length,0);assert.deepEqual(read.monthly.days,[]);
 const sync=await f.sync();assert.equal(sync.weekly.production_cost_cents,1590);assert.equal(sync.monthly.production_cost_cents,3180);assert.equal(f.state.calls.length,1);
});

test('captured complete monthly quantities survive the next-day RUNNING reset without appearing complete through the new day',async t=>{
 const f=await fixture(t),seeded=await seedMonth(f);assert.equal(await captureProductionCostMonth(f.env,'2026-10',{now:f.now}),true);
 const before=f.env.ADMIN_DB.db.prepare('SELECT payload FROM production_cost_month_quantities WHERE month=?').get('2026-10').payload,saved=JSON.parse(before);
 assert.deepEqual(Object.keys(saved).sort(),['schema','start_date','end_date','source_checked_at','coverage','items'].sort());assert.deepEqual(saved.items,[{item_id:'201',model_id:'0',quantity:2}]);assert.equal(saved.end_date,'2026-10-28');
 f.state.time+=86400000;const read=await f.read();assert.equal(read.monthly.end_date,'2026-10-29');assert.equal(read.monthly.source_end_date,'2026-10-28');assert.equal(read.monthly.state,'PARTIAL');assert.equal(read.monthly.known_production_cost_cents,3180);assert.equal(read.monthly.production_cost_cents,null);assert.ok(read.monthly.pending.includes('PERIOD_INCOMPLETE'));assert.ok(read.monthly.pending.includes('SOURCE_STALE'));
 const current=await businessMonth(f.env,{operation:'read',month:'2026-10'},{},{now:f.now});assert.equal(current.status,'RUNNING');assert.equal(current.production_cost_cents,null);assert.equal(f.env.ADMIN_DB.db.prepare('SELECT payload FROM production_cost_month_quantities WHERE month=?').get('2026-10').payload,before);assert.equal(seeded.calls.length,2);assert.equal(f.state.calls.length,0);
});

test('saved monthly quantities reprice with a newer registered cost even while the financial import is RUNNING',async t=>{
 const f=await fixture(t),seeded=await seedMonth(f);await captureProductionCostMonth(f.env,'2026-10',{now:f.now});const before=f.env.ADMIN_DB.db.prepare('SELECT payload FROM production_cost_month_quantities WHERE month=?').get('2026-10').payload;
 f.state.time+=86400000;assert.equal((await f.read()).monthly.known_production_cost_cents,3180);f.env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET revision=6,payload=? WHERE id=1').run(JSON.stringify({...f.values,inclusive_regular_cents:1990}));
 const read=await f.read();assert.equal(read.monthly.known_production_cost_cents,3980);assert.equal(read.monthly.production_cost_cents,null);assert.equal(read.monthly.versions.costs,6);assert.equal(read.monthly.coverage.total_units,2);assert.equal(read.monthly.coverage.known_units,2);assert.equal(read.monthly.source_end_date,'2026-10-28');assert.ok(read.monthly.pending.includes('PERIOD_INCOMPLETE'));assert.equal(seeded.calls.length,2);assert.equal(f.state.calls.length,0);assert.equal(f.env.ADMIN_DB.db.prepare('SELECT payload FROM production_cost_month_quantities WHERE month=?').get('2026-10').payload,before);
});

test('a monthly slot reference cannot certify quantities from another run identity',async t=>{
 const f=await fixture(t);await seedMonth(f);const row=f.env.ADMIN_DB.db.prepare('SELECT slot_index,payload FROM business_month_frames WHERE month=? LIMIT 1').get('2026-10'),frame=JSON.parse(row.payload);frame.run_id='11111111-1111-4111-8111-999999999999';f.env.ADMIN_DB.db.prepare('UPDATE business_month_frames SET payload=? WHERE month=? AND slot_index=?').run(JSON.stringify(frame),'2026-10',row.slot_index);
 assert.equal(await captureProductionCostMonth(f.env,'2026-10',{now:f.now}),false);assert.equal(f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS count FROM production_cost_month_quantities').get().count,0);assert.equal(f.state.calls.length,0);
});
