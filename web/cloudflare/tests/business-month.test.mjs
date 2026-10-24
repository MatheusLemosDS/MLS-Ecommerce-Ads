import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar,projectAdsCalendar} from '../src/ads-calendar.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {businessMonth,projectBusinessMonth,BusinessMonthError} from '../src/business-month.mjs';
import {syncCostRuleCatalog,readCostRules,saveCostRules,assignCostRules} from '../src/cost-rules.mjs';

const clock=Date.UTC(2026,10,2,12),stamp=Math.floor(clock/1000),now=()=>clock;
const request=(operation='start',changes={})=>({operation,month:'2026-10',...changes});
const fail=code=>error=>error instanceof BusinessMonthError&&error.message===code;
const serial=index=>'11111111-1111-4111-8111-'+String(index).padStart(12,'0');
const frame=(selection,index,changes={})=>({schema:'finance_business_period_v1',run_id:serial(index),revision:2,status:'COMPLETE',...selection,cutoff_at:stamp-2,checked_at:stamp,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:4,paid:2,completed:1,ongoing:1,cancelled:1,cancel_pending:0,unpaid:1,other:0,unknown:0,payment_covered:2,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'600',sales_base_raw:'600',known_expected_repass_raw:'500',expected_repass_raw:'500',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:2,unavailable_orders:0,known_base_raw:'600',known_tax_raw:'12'},items:[{item_id:'201',model_id:'0',quantity:2}],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED',...changes});
function withProducts(value){
 const c=value.coverage;
 return {...value,product_breakdown:{schema:'business_product_breakdown_v1',mixed_orders:0,mixed_payment_covered:0,mixed_payment_missing:0,known_mixed_sales_base_raw:'0',known_mixed_expected_repass_raw:'0',known_mixed_ads_adjustment_raw:'0',known_mixed_invoice_tax_raw:'0',products:[{item_id:'201',quantity:2,orders:2,exclusive_orders:2,mixed_orders:0,exclusive_payment_covered:c.payment_covered,exclusive_payment_missing:c.payment_missing,exclusive_returns:c.returns,exclusive_returns_unknown:c.returns_unknown,known_exclusive_sales_base_raw:value.known_sales_base_raw,exclusive_sales_base_raw:value.sales_base_raw,known_exclusive_expected_repass_raw:value.known_expected_repass_raw,exclusive_expected_repass_raw:value.expected_repass_raw,known_exclusive_ads_adjustment_raw:value.known_ads_adjustment_raw,exclusive_ads_adjustment_raw:value.ads_adjustment_raw,known_exclusive_invoice_tax_raw:value.invoice_tax.known_tax_raw,exclusive_invoice_tax_raw:c.payment_missing?null:value.invoice_tax.known_tax_raw,items:[{model_id:'0',exclusive_quantity:2,mixed_quantity:0}]}]}};
}
function calendar(selection,at=stamp,missing=null,spend=1){
 const days=[];for(let at=Date.parse(selection.start_date+'T00:00:00Z');at<=Date.parse(selection.end_date+'T00:00:00Z');at+=86400000)days.push(new Date(at).toISOString().slice(0,10));
 const children=[];for(let index=0;index<days.length;index+=15){const dates=days.slice(index,index+15),range={start_date:dates[0],end_date:dates.at(-1)},raw={status:'ok',connected:true,shop:{id:1178167501},period:range,balance:31.07,daily:dates.filter(day=>day!==missing).map(date=>({date,expense:spend,broad_gmv:spend?10:0,broad_order:spend?1:0,broad_roas:spend?10:0,direct_gmv:spend?4:0,direct_order:spend?1:0,direct_roas:spend?4:0}))};children.push(buildAdsMeasurement(raw,range,at));}
 return buildAdsCalendar(children,selection,at);
}
function env(){
 const ADMIN_DB=new D1();ADMIN_DB.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)');
 ADMIN_DB.db.prepare('INSERT INTO variant_bindings_state VALUES(1,3,?,?)').run(JSON.stringify([{item_id:'201',model_id:'0',size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}]),new Date(clock).toISOString());
 ADMIN_DB.db.prepare('INSERT INTO production_costs_state VALUES(1,7,?,?)').run(JSON.stringify({...COST_DEFAULTS,components:[]}),new Date(clock).toISOString());return {ADMIN_DB};
}
function source(transform=value=>value){
 const calls={finance:[],ads:[]},frames=new Map();let count=0;
 return {calls,getFinanceBusinessPeriod:async(_,selection)=>{calls.finance.push(selection);if(selection.operation==='start'){const f=transform(frame({start_date:selection.start_date,end_date:selection.end_date},++count));frames.set(f.run_id,f);return structuredClone(f);}const f=frames.get(selection.run_id);return structuredClone(f);},getAdsCalendar:async(_,selection)=>{calls.ads.push(selection);return calendar(selection);}};
}
const run=(e,s,operation='start',changes={},options={})=>businessMonth(e,request(operation,changes),s,{now,...options});
async function complete(e,s,changes={},options={}){let value=await run(e,s,'start',changes,options);for(let index=0;index<20&&value.status==='RUNNING';index++)value=await run(e,s,'step',changes,options);return value;}
const state=e=>({expenses:e.ADMIN_DB.db.prepare('SELECT * FROM business_month_expenses').all(),audit:e.ADMIN_DB.db.prepare('SELECT * FROM business_month_expenses_audit').all()});
const save=(e,s,revision=0,changes={})=>run(e,s,'expenses',{revision,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED',...changes},{actor:'fixture-admin'});

test('automatic child costs flow into the month and every sold unit without using the old adult price or per-product confirmations',async()=>{
 const e=env(),s=source(withProducts);await complete(e,s);
 await syncCostRuleCatalog(e,['201'],async()=>({schema:'variant_catalog_v1',checked_at:stamp,products:[{item_id:'201',catalog_fingerprint:'b'.repeat(64),bindings:[],unresolved_count:1,cost_catalog:{schema:'product_cost_catalog_v1',product_name:'Camiseta Infantil Estrela',variants:[{model_id:'0',attributes:[{name:'Tamanho',value:'4'}]}]}}]}),{now});
 await run(e,s,'ads');let value=await save(e,s);
 assert.equal(value.production_cost_cents,7500);assert.equal(value.result.net_estimate_cents,130795);assert.equal(value.cost_rules_revision,1);assert.equal(value.costs_revision,7);assert.deepEqual(value.unmapped_variants,[]);
 const product=value.product_summary.products[0];assert.equal(product.exclusive_after_costs_cents,142500);assert.equal(product.variants[0].unit_cost_cents,1250);assert.equal(product.variants[0].selling_unit,'CUSTOM_PRODUCT');assert.match(product.variants[0].cost_profile_label,/infantil · 4/);
 const state=await readCostRules(e),values=structuredClone(state.values);values.rules[0].unit_cost_cents=1300;await saveCostRules(e,{revision:state.revision,values},'admin');value=await run(e,s,'read');assert.equal(value.production_cost_cents,7800);assert.equal(value.result.net_estimate_cents,130495);assert.equal(value.cost_rules_revision,2);assert.ok(projectBusinessMonth(value));
});

test('MEI policy and source timestamps are detached and strict; financial timings cannot disappear from a completed result',async()=>{
 const e=env(),s=source(withProducts);await complete(e,s);await run(e,s,'ads');const value=await save(e,s);
 const projected=projectBusinessMonth(value);assert.ok(projected);assert.notEqual(projected.tax,value.tax);assert.notEqual(projected.source_checked_at,value.source_checked_at);
 projected.tax.tax_cents=1;projected.source_checked_at.finance_oldest_at=1;assert.equal(value.tax.tax_cents,8605);assert.equal(value.source_checked_at.finance_oldest_at,stamp);
 assert.equal(projectBusinessMonth({...value,source_checked_at:{finance_oldest_at:null,finance_latest_at:null,ads_at:value.ads.fetched_at}}),null);
 assert.equal(projectBusinessMonth({...value,tax:{...value.tax,tax_cents:17210}}),null);
 let calls=0;const poisoned={...value.ads};Object.defineProperty(poisoned,'fetched_at',{enumerable:true,get(){calls++;return stamp;}});
 assert.equal(projectBusinessMonth({...value,ads:poisoned}),null);assert.equal(calls,0);
});

test('a manually classified child variation replaces the adult cost in the monthly net without another provider read',async()=>{
 const e=env(),s=source(withProducts);await complete(e,s);await run(e,s,'ads');await save(e,s);
 const bindings=e.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_state').all(),rules=await readCostRules(e),reads=s.calls.finance.length;
 await assignCostRules(e,{revision:rules.revision,assignments:[{item_id:'201',model_id:'0',rule_id:'camiseta-infantil',size:'12'}]},'admin');const value=await run(e,s,'read');
 assert.equal(value.production_cost_cents,7500);assert.equal(value.result.net_estimate_cents,130795);assert.equal(value.cost_rules_revision,2);assert.match(value.product_summary.products[0].variants[0].cost_profile_label,/infantil · 12/);assert.equal(s.calls.finance.length,reads);assert.deepEqual(e.ADMIN_DB.db.prepare('SELECT * FROM variant_bindings_state').all(),bindings);
});

test('a 31-day month uses disjoint bounded windows and all paid statuses without counting cancelled or unpaid as sales',async()=>{
 const e=env(),s=source();const value=await complete(e,s);
 assert.deepEqual(s.calls.finance,[{operation:'start',start_date:'2026-10-01',end_date:'2026-10-15'},{operation:'start',start_date:'2026-10-16',end_date:'2026-10-30'},{operation:'start',start_date:'2026-10-31',end_date:'2026-10-31'}]);
 assert.equal(value.status,'COMPLETE');assert.deepEqual(value.progress,{windows_total:3,windows_complete:3,pages_read:3});
 assert.equal(value.coverage.orders,12);assert.equal(value.coverage.paid,6);assert.equal(value.coverage.completed,3);assert.equal(value.coverage.ongoing,3);assert.equal(value.coverage.cancelled,3);assert.equal(value.coverage.unpaid,3);
 assert.equal(value.sales_cents,180000);assert.equal(value.expected_repass_cents,150000);assert.equal(value.production_cost_cents,9540);assert.equal(value.invoice_tax_cents,8605);assert.equal(value.known_invoice_tax_cents,8605);assert.equal(value.tax.regime,'MEI');assert.equal(value.result.net_estimate_cents,null);assert.ok(value.result.pending.includes('ADS_UNAVAILABLE'));assert.ok(value.result.pending.includes('EXTERNAL_EXPENSES_REQUIRED'));assert.ok(projectBusinessMonth(value));assert.deepEqual(state(e),{expenses:[],audit:[]});
});

test('monthly estimated net uses one month of spend and one audited expense, with a single declared MEI DAS and current production costs',async()=>{
 const e=env(),s=source();await complete(e,s);const ads=await run(e,s,'ads');assert.equal(ads.ads.expense_cents,3100);assert.equal(ads.ads.totals.broad.calculated_roas_raw,'10.000000');
 const value=await save(e,s,0,{external_expenses_cents:1000});assert.equal(value.result.net_estimate_cents,127755);assert.equal(value.result.net_margin_bps,7097);assert.equal(value.result.net_profit_cents,null);assert.deepEqual(value.result.pending,[]);assert.equal(value.result.basis,'PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE');
 const saved=state(e);assert.equal(saved.expenses.length,1);assert.equal(saved.audit.length,1);assert.equal(saved.expenses[0].external_expenses_cents,1000);assert.equal(saved.audit[0].external_expenses_cents,1000);assert.equal(saved.audit[0].actor,'fixture-admin');assert.deepEqual(projectBusinessMonth(value),value);
 for(let index=0;index<3;index++)assert.equal((await run(e,s,'read')).result.net_estimate_cents,127755);
 assert.deepEqual(state(e),saved);assert.equal(s.calls.finance.length,3);assert.equal(s.calls.ads.length,1);
 const imports=e.ADMIN_DB.db.prepare('SELECT payload FROM business_month_frames ORDER BY slot_index').all().map(row=>JSON.parse(row.payload));
 assert.equal(imports.length,3);assert.ok(imports.every(frame=>frame.invoice_tax.rate_bps===200&&frame.invoice_tax.known_tax_raw==='12'),'immutable legacy estimates remain in their imported frames, but are not deducted from the MEI result');
});

test('current-month start reuses a fresh completed import for sixty seconds; closed months keep fifteen minutes without duplicating expenses',async()=>{
 const e=env(),s=source(withProducts);await complete(e,s);await run(e,s,'ads');await save(e,s);const saved=state(e),calls=s.calls.finance.length;
 await run(e,s,'start',{}, {now:()=>clock+899000});assert.equal(s.calls.finance.length,calls);
 await run(e,s,'start',{}, {now:()=>clock+901000});assert.equal(s.calls.finance.length,calls+1);assert.deepEqual(state(e),saved);
 const currentEnv=env(),currentSource=source(),dateNow=()=>Date.UTC(2026,9,21,15);
 const currentStamp=Math.floor(dateNow()/1000);currentSource.getFinanceBusinessPeriod=async(_,selection)=>{currentSource.calls.finance.push(selection);return withProducts(frame({start_date:selection.start_date,end_date:selection.end_date},currentSource.calls.finance.length,{cutoff_at:currentStamp-2,checked_at:currentStamp}));};
 const current=async(op,offset=0)=>businessMonth(currentEnv,request(op),currentSource,{now:()=>dateNow()+offset});
 await current('start');await current('step');assert.equal(currentSource.calls.finance.length,2);await current('start',59000);assert.equal(currentSource.calls.finance.length,2);await current('start',61000);assert.equal(currentSource.calls.finance.length,3);
});

test('explicit zero expenses is distinct from absence, CAS conflicts never overwrite an audited declaration',async()=>{
 const e=env(),s=source();await complete(e,s);await run(e,s,'ads');assert.equal((await run(e,s,'read')).expenses.external_expenses_cents,null);
 const value=await save(e,s);assert.equal(value.expenses.external_expenses_cents,0);assert.equal(value.result.net_estimate_cents,128755);const before=state(e);
 await assert.rejects(save(e,s),fail('BUSINESS_MONTH_EXPENSES_CHANGED_RELOAD'));await assert.rejects(save(e,s,2,{external_expenses_cents:100}),fail('BUSINESS_MONTH_EXPENSES_CHANGED_RELOAD'));assert.deepEqual(state(e),before);
 const updated=await save(e,s,1,{external_expenses_cents:500});assert.equal(updated.result.net_estimate_cents,128255);assert.equal(state(e).audit.length,2);assert.equal(state(e).audit[0].external_expenses_cents,0);
});

test('missing ongoing-order Payment remains pending and preserves known sales, units and production without guessing total revenue',async()=>{
 const e=env(),s=source(original=>({...original,coverage:{...original.coverage,payment_covered:1,payment_missing:1,returns_unknown:1},known_sales_base_raw:'300',sales_base_raw:null,known_expected_repass_raw:'250',expected_repass_raw:null,known_ads_adjustment_raw:'0',ads_adjustment_raw:null,invoice_tax:{...original.invoice_tax,covered_orders:1,unavailable_orders:1,known_base_raw:'300',known_tax_raw:'6'}}));
 const value=await complete(e,s);assert.equal(value.status,'COMPLETE');assert.equal(value.coverage.payment_missing,3);assert.equal(value.known_sales_cents,90000);assert.equal(value.sales_cents,null);assert.equal(value.expected_repass_cents,null);assert.equal(value.production_cost_cents,9540);assert.equal(value.invoice_tax_cents,8605);assert.equal(value.known_invoice_tax_cents,8605);assert.equal(value.result.net_estimate_cents,null);
 for(const code of ['PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','ADJUSTMENT_UNAVAILABLE'])assert.ok(value.result.pending.includes(code),code);assert.ok(!value.result.pending.includes('INVOICE_TAX_UNAVAILABLE'));
});

test('unknown statuses, returns and pending cancellation block estimated net even with complete expenses and Ads',async()=>{
 for(const change of [c=>({...c,orders:5,cancel_pending:1}),c=>({...c,orders:5,other:1}),c=>({...c,orders:5,unknown:1}),c=>({...c,returns:1}),c=>({...c,returns_unknown:1})]){
  const e=env(),s=source(f=>({...f,coverage:change(f.coverage)}));await complete(e,s);await run(e,s,'ads');const value=await save(e,s);assert.equal(value.result.net_estimate_cents,null);assert.ok(value.result.pending.includes(value.coverage.returns+value.coverage.returns_unknown?'RETURNS_NOT_RECONCILED':'STATUS_REVIEW_REQUIRED'));
 }
});

test('partial or limited monthly coverage never turns the known subtotal into a complete monthly total or a zero loss',async()=>{
 const e=env(),s=source(f=>({...f,status:'LIMIT_REACHED'}));const value=await run(e,s);assert.equal(value.status,'LIMIT_REACHED');assert.equal(value.known_expected_repass_cents,50000);assert.equal(value.expected_repass_cents,null);assert.equal(value.sales_cents,null);assert.equal(value.production_cost_cents,null);assert.equal(value.result.net_estimate_cents,null);assert.ok(value.result.pending.includes('PERIOD_LIMIT_REACHED'));
 assert.equal((await run(e,s,'step')).status,'LIMIT_REACHED');assert.equal(s.calls.finance.length,1);
 const collecting=await run(env(),source());assert.equal(collecting.status,'RUNNING');assert.equal(collecting.sales_cents,null);assert.equal(collecting.invoice_tax_cents,null);
});

test('recharges are added back exactly once while support already included in the repass is not deducted twice',async()=>{
 for(const treatment of ['UNCONFIRMED','ADS_RECHARGE','TECH_SUPPORT']){
  const e=env(),s=source(f=>withProducts({...f,known_ads_adjustment_raw:'10',ads_adjustment_raw:'10'}));await complete(e,s);await run(e,s,'ads');const value=await save(e,s,0,{recharge_treatment:treatment});
  assert.equal(value.ads_adjustment_cents,3000);assert.equal(value.invoice_tax_cents,8605);assert.equal(value.product_summary.tax_treatment,'MONTHLY_DAS_NOT_ALLOCATED');assert.equal(value.product_summary.products[0].exclusive_tax_cents,0);
  if(treatment==='UNCONFIRMED'){assert.equal(value.result.net_estimate_cents,null);assert.ok(value.result.pending.includes('RECHARGE_TREATMENT_REQUIRED'));}
  else{assert.equal(value.result.net_estimate_cents,treatment==='ADS_RECHARGE'?131755:128755);const addBack=treatment==='ADS_RECHARGE'?3000:0;assert.equal(value.result.net_estimate_cents,value.expected_repass_cents-value.production_cost_cents-8605+addBack-value.ads.expense_cents-value.expenses.external_expenses_cents);}
 }
});

test('Ads coverage holes and aged current-day caches stay unavailable without saving missing days as zero',async()=>{
 const e=env(),s=source();s.getAdsCalendar=async(_,selection)=>calendar(selection,stamp,'2026-10-16');await complete(e,s);let value=await run(e,s,'ads');assert.equal(value.ads.status,'PARTIAL');assert.equal(value.ads.expense_cents,null);assert.deepEqual(value.ads.missing_dates,['2026-10-16']);value=await save(e,s);assert.equal(value.result.net_estimate_cents,null);assert.ok(value.result.pending.includes('ADS_UNAVAILABLE'));
 const before=state(e);value=await run(e,s,'read',{}, {now:()=>clock+901000});assert.equal(value.ads,null);assert.deepEqual(state(e),before);
});

test('poisoned provider identity, duplicates and foreign ranges cannot replace a stored monthly import',async()=>{
 const e=env(),s=source();await run(e,s);const before=e.ADMIN_DB.db.prepare('SELECT * FROM business_month_runs').all();
 for(const mutate of [f=>({...f,start_date:'2026-10-01'}),f=>({...f,private_token:'PRIVATE'}),f=>({...f,run_id:serial(1)}),f=>({...f,coverage:{...f.coverage,paid:9}})]){
  const poison=source(mutate);await assert.rejects(run(e,poison,'step'),fail('BUSINESS_MONTH_SOURCE_INVALID'));assert.deepEqual(e.ADMIN_DB.db.prepare('SELECT * FROM business_month_runs').all(),before);
 }
});

test('request validation, dates and forbidden input fields fail before services or monthly expense writes',async()=>{
 const e=env(),s=source();for(const input of [null,{},request('unknown'),request('read',{month:'2026-13'}),request('read',{month:'2026-11-01'}),request('read',{month:'2026-12'}),request('start',{shop_id:'OTHER'}),request('expenses',{revision:0,external_expenses_cents:-1,recharge_treatment:'UNCONFIRMED'}),request('expenses',{revision:0,external_expenses_cents:0,recharge_treatment:'UNKNOWN'})])await assert.rejects(businessMonth(e,input,s,{now}));
 assert.equal(s.calls.finance.length,0);assert.equal(s.calls.ads.length,0);
 await assert.rejects(run(e,s,'read',{}, {now:()=>NaN}),fail('BUSINESS_MONTH_CLOCK'));
});

test('the browser projector rejects forged monthly sums, missing blockers, private fields and invented actual profit',async()=>{
 const e=env(),s=source();await complete(e,s);await run(e,s,'ads');const value=await save(e,s);
 for(const mutate of [v=>v.private_token='PRIVATE',v=>v.result.net_estimate_cents++,v=>v.result.net_profit_cents=1,v=>v.result.net_margin_bps++,v=>v.ads.days[0].expense_cents++,v=>v.coverage.paid++,v=>v.sales_cents++,v=>v.month='2026-11',v=>v.progress.windows_complete--,v=>v.expenses.private='PRIVATE',v=>v.tax.tax_cents++,v=>v.tax.monthly_das_cents++,v=>v.tax.regime='PERCENT_PER_ORDER',v=>v.source_checked_at.finance_oldest_at=v.checked_at+1]){
  const altered=structuredClone(value);mutate(altered);assert.equal(projectBusinessMonth(altered),null);
 }
 const partial=await run(env(),source());partial.result.pending=partial.result.pending.filter(code=>code!=='COLLECTING');assert.equal(projectBusinessMonth(partial),null);
 const context=vm.createContext({structuredClone,Intl});context.serialized=JSON.stringify(value);new vm.Script(projectAdsCalendar.toString()+'\n'+projectBusinessMonth.toString()+'\nglobalThis.actual=projectBusinessMonth(JSON.parse(serialized));').runInContext(context);assert.deepEqual(JSON.parse(JSON.stringify(context.actual)),value);
 const copy=projectBusinessMonth(value);copy.coverage.paid=99;assert.notEqual(value.coverage.paid,99);assert.ok(projectBusinessPeriodFrame(frame({start_date:'2026-10-01',end_date:'2026-10-15'},1)));
});

test('monthly product contribution uses the same disjoint paid windows and cost snapshots before account Ads and expenses',async()=>{
 const e=env(),s=source(withProducts);const partial=await run(e,s);assert.equal(partial.product_summary,null);
 let value=partial;while(value.status==='RUNNING')value=await run(e,s,'step');
 const products=value.product_summary;assert.ok(products);assert.equal(products.mixed_orders,0);assert.equal(products.products.length,1);
 const product=products.products[0];assert.equal(product.item_id,'201');assert.equal(product.quantity,6);assert.equal(product.orders,6);assert.equal(product.exclusive_orders,6);assert.equal(product.mixed_orders,0);
 assert.equal(product.production_cost_cents,9540);assert.equal(product.exclusive_production_cost_cents,9540);assert.equal(product.exclusive_tax_cents,0);assert.equal(product.exclusive_after_costs_cents,140460);assert.equal(products.tax_treatment,'MONTHLY_DAS_NOT_ALLOCATED');assert.deepEqual(product.pending,[]);
 assert.deepEqual(product.variants,[{model_id:'0',quantity:6,exclusive_quantity:6,mixed_quantity:0,unit_cost_cents:1590,production_cost_cents:9540,exclusive_production_cost_cents:9540,selling_unit:'SINGLE_GARMENT',size:'P',male_size:null,female_size:null}]);
 await run(e,s,'ads');value=await save(e,s,0,{external_expenses_cents:1000});assert.equal(value.result.net_estimate_cents,127755);assert.equal(value.product_summary.products[0].exclusive_after_costs_cents,140460);assert.equal(s.calls.finance.length,3);
 const changed=e.ADMIN_DB.db.prepare('SELECT payload FROM production_costs_state WHERE id=1').get();const costs=JSON.parse(changed.payload);costs.inclusive_regular_cents=2000;
 e.ADMIN_DB.db.prepare('UPDATE production_costs_state SET revision=8,payload=? WHERE id=1').run(JSON.stringify(costs));
 value=await run(e,s,'read');assert.equal(value.costs_revision,8);assert.equal(value.product_summary.products[0].production_cost_cents,12000);assert.equal(value.product_summary.products[0].exclusive_after_costs_cents,138000);assert.equal(s.calls.finance.length,3);
});

test('legacy paid imports retain monthly totals while product detail is unavailable until refreshed',async()=>{
 const e=env(),s=source();const value=await complete(e,s);assert.equal(value.sales_cents,180000);assert.equal(value.product_summary,null);
 const stored=await run(e,s,'read');assert.equal(stored.product_summary,null);assert.equal(s.calls.finance.length,3);
 const upgraded=source(withProducts);let refreshed=await run(e,upgraded,'start');while(refreshed.status==='RUNNING')refreshed=await run(e,upgraded,'step');
 assert.ok(refreshed.product_summary);assert.equal(refreshed.sales_cents,value.sales_cents);assert.equal(upgraded.calls.finance.length,3);
 const live=await complete(env(),source(f=>withProducts({...f,coverage:{...f.coverage,orders:5,cancel_pending:1}})));
 assert.ok(live.product_summary);assert.equal(live.product_summary.products[0].exclusive_after_costs_cents,null);assert.ok(live.product_summary.products[0].pending.includes('STATUS_REVIEW_REQUIRED'));
});

test('a custom product-wide cost prices every monthly unit without a shirt binding and recalculates the exclusive balance',async()=>{
 const e=env(),s=source(withProducts);
 e.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET revision=4,payload=? WHERE id=1').run('[]');
 const values={...COST_DEFAULTS,components:[],custom_profiles:[{id:'calca-moletom',label:'Calça de moletom',unit_cost_cents:5000}],custom_assignments:[{item_id:'201',model_id:null,profile_id:'calca-moletom'}]};
 e.ADMIN_DB.db.prepare('UPDATE production_costs_state SET revision=8,payload=? WHERE id=1').run(JSON.stringify(values));
 await complete(e,s);await run(e,s,'ads');const result=await save(e,s);
 assert.equal(result.production_cost_cents,30000);assert.deepEqual(result.unmapped_variants,[]);assert.equal(result.result.net_estimate_cents,108295);
 const product=result.product_summary.products[0];assert.equal(product.exclusive_production_cost_cents,30000);assert.equal(product.exclusive_after_costs_cents,120000);
 assert.equal(product.variants[0].selling_unit,'CUSTOM_PRODUCT');assert.equal(product.variants[0].cost_profile_label,'Calça de moletom');assert.equal(product.variants[0].unit_cost_cents,5000);
 assert.equal(result.costs_revision,8);assert.equal(result.bindings_revision,4);assert.ok(projectBusinessMonth(result));
});

test('a MEI month without sales or advertising still deducts its declared DAS exactly once',async()=>{
 const e=env(),s=source(original=>({
  ...original,coverage:Object.fromEntries(Object.keys(original.coverage).map(key=>[key,0])),known_sales_base_raw:'0',sales_base_raw:'0',known_expected_repass_raw:'0',expected_repass_raw:'0',items:[],
  invoice_tax:{...original.invoice_tax,covered_orders:0,unavailable_orders:0,known_base_raw:'0',known_tax_raw:'0'},
  product_breakdown:{schema:'business_product_breakdown_v1',mixed_orders:0,mixed_payment_covered:0,mixed_payment_missing:0,known_mixed_sales_base_raw:'0',known_mixed_expected_repass_raw:'0',known_mixed_ads_adjustment_raw:'0',known_mixed_invoice_tax_raw:'0',products:[]},
 }));
 s.getAdsCalendar=async(_,selection)=>calendar(selection,stamp,null,0);
 await complete(e,s);await run(e,s,'ads');let value=await save(e,s);
 assert.equal(value.coverage.paid,0);assert.equal(value.sales_cents,0);assert.equal(value.expected_repass_cents,0);assert.equal(value.production_cost_cents,0);assert.equal(value.ads.expense_cents,0);
 assert.equal(value.invoice_tax_cents,8605);assert.equal(value.known_invoice_tax_cents,8605);assert.equal(value.tax.tax_cents,8605);assert.equal(value.result.net_estimate_cents,-8605);assert.equal(value.result.net_margin_bps,null);
 assert.equal(value.product_summary.tax_treatment,'MONTHLY_DAS_NOT_ALLOCATED');assert.deepEqual(value.product_summary.products,[]);
 for(let index=0;index<3;index++){value=await run(e,s,'read');assert.equal(value.result.net_estimate_cents,-8605);}
 assert.equal(state(e).audit.length,1);assert.equal(e.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM business_tax_policy_audit WHERE year=2026').get().n,1);
});

test('a new tax year remains pending instead of silently carrying the prior MEI DAS or returning to the old percentage',async()=>{
 const e=env(),nextClock=Date.UTC(2027,1,2,12),nextStamp=Math.floor(nextClock/1000),options={now:()=>nextClock};
 const s=source(original=>withProducts({...original,cutoff_at:nextStamp-2,checked_at:nextStamp}));s.getAdsCalendar=async(_,selection)=>calendar(selection,nextStamp);
 await complete(e,s,{month:'2027-01'},options);await run(e,s,'ads',{month:'2027-01'},options);
 const value=await run(e,s,'expenses',{month:'2027-01',revision:0,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED'},{...options,actor:'fixture-admin'});
 assert.equal(value.status,'COMPLETE');assert.equal(value.sales_cents,180000);assert.equal(value.production_cost_cents,9540);assert.equal(value.tax.year,2027);assert.equal(value.tax.status,'PENDING');assert.equal(value.tax.policy_revision,0);
 assert.equal(value.tax.monthly_das_cents,null);assert.equal(value.tax.tax_cents,null);assert.equal(value.invoice_tax_cents,null);assert.equal(value.known_invoice_tax_cents,null);assert.equal(value.result.net_estimate_cents,null);
 assert.ok(value.result.pending.includes('TAX_POLICY_REQUIRED'));assert.ok(value.result.pending.includes('INVOICE_TAX_UNAVAILABLE'));assert.ok(!value.result.pending.includes('ARITHMETIC_UNSAFE'));
 assert.equal(value.product_summary.tax_treatment,'MONTHLY_DAS_NOT_ALLOCATED');assert.equal(value.product_summary.products[0].exclusive_tax_cents,0);assert.equal(value.product_summary.products[0].exclusive_after_costs_cents,140460);
 assert.equal(e.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM business_tax_policy_state WHERE year=2027').get().n,0);
 assert.equal(JSON.parse(e.ADMIN_DB.db.prepare('SELECT payload FROM business_tax_policy_state WHERE year=2026').get().payload).monthly_das_cents,8605);
 assert.ok(projectBusinessMonth(value));
});

test('fresh Ads cannot conceal stale current-month financial data or release a net estimate until the paid orders are refreshed',async()=>{
 const e=env();let activeClock=Date.UTC(2026,9,21,12),financeStamp=Math.floor(activeClock/1000);const firstStamp=financeStamp,options={now:()=>activeClock};
 const s=source(original=>withProducts({...original,cutoff_at:financeStamp-2,checked_at:financeStamp}));s.getAdsCalendar=async(_,selection)=>calendar(selection,Math.floor(activeClock/1000));
 await complete(e,s,{},options);await run(e,s,'ads',{},options);let value=await run(e,s,'expenses',{revision:0,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED'},{...options,actor:'fixture-admin'});
 assert.equal(value.result.net_estimate_cents,82935);assert.equal(s.calls.finance.length,2);
 activeClock+=901000;value=await run(e,s,'ads',{},options);
 assert.equal(value.ads.fetched_at,Math.floor(activeClock/1000));assert.equal(value.checked_at,Math.floor(activeClock/1000));assert.equal(value.source_checked_at.finance_oldest_at,firstStamp);assert.equal(value.source_checked_at.finance_latest_at,firstStamp);assert.equal(value.source_checked_at.ads_at,value.ads.fetched_at);
 assert.equal(value.result.net_estimate_cents,null);assert.ok(value.result.pending.includes('FINANCIAL_SOURCE_STALE'));assert.equal(value.sales_cents,120000);assert.equal(s.calls.finance.length,2);
 assert.equal(value.product_summary.products[0].exclusive_after_costs_cents,null);assert.ok(value.product_summary.products[0].pending.includes('SOURCE_UNAVAILABLE'));
 const forged=structuredClone(value);forged.result.pending=forged.result.pending.filter(code=>code!=='FINANCIAL_SOURCE_STALE');assert.equal(projectBusinessMonth(forged),null);
 financeStamp=Math.floor(activeClock/1000);value=await complete(e,s,{},options);
 assert.equal(s.calls.finance.length,4);assert.equal(value.source_checked_at.finance_oldest_at,financeStamp);assert.ok(!value.result.pending.includes('FINANCIAL_SOURCE_STALE'));assert.equal(value.result.net_estimate_cents,82935);assert.equal(value.product_summary.products[0].exclusive_after_costs_cents,93640);assert.equal(state(e).audit.length,1);
});
