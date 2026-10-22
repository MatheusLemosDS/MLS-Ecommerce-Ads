import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {CLIENT} from '../src/admin-client.mjs';
import {buildAdsMeasurement,projectAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildStoreSummary} from '../src/store-summary.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';

const current='2026-10-22T12:00:00Z',stamp=Date.parse(current)/1000,run='11111111-1111-4111-8111-111111111111';
function measurement(day='2026-10-21',expense='52.61'){
 return buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:{start_date:day,end_date:day},balance:31.07,daily:[{date:day,expense,broad_gmv:'1011.37',broad_order:15,broad_roas:'19.28'}]}, {start_date:day,end_date:day},stamp);
}
function report(m=measurement()){
 return {schema:'ads_period_v1',status:m.status,start_date:m.start_date,end_date:m.end_date,fetched_at:m.fetched_at,covered_days:m.covered_days,total_days:m.total_days,missing_dates:m.missing_dates,expense_cents:m.expense_cents,days:m.days.map(day=>({date:day.date,expense_cents:day.expense_cents})),day_partial:m.day_partial,unit_confirmation:m.unit_confirmation,source_timezone:m.source_timezone,basis:m.basis,diagnostic:null,measurement:m};
}
function bundle(day='2026-10-21',expense='52.61'){
 const finance={schema:'finance_store_period_v1',run_id:run,revision:3,status:'COMPLETE',start_date:day,end_date:day,cutoff_at:stamp-30,checked_at:stamp-20,currency:'BRL',monetary_unit:'UNCONFIRMED',order_count:1,pages_read:1,duplicate_orders:0,returns_orders:0,escrow_amount_raw:'173.37',ads_recharge_or_support_raw:'0',items:[{item_id:'201',model_id:'0',quantity:1}],diagnostic:null,invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:0,known_base_raw:'245.5',known_tax_raw:'4.91'}};
 const values={ads_spend_cents:48924,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED',ads_source:'SHOPEE_PERIOD',external_expenses_basis:'EXCLUDES_INVOICE_TAX'};
 const result=buildStoreSummary(finance,{revision:1,bindings:[{item_id:'201',model_id:'0',size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}]},{revision:1,values:{...COST_DEFAULTS,inclusive_regular_cents:11730,components:[]}},values,report(measurement(day,expense)).expense_cents);
 return {finance,result,adjustments:{revision:1,values,updated_at:current},ads_period:report(measurement(day,expense)),product_result:null,returns_result:null};
}
function browser(value=bundle()){
 const begin=CLIENT.indexOf('let storePeriodBundle='),end=CLIENT.indexOf('function observationDate(',begin),identityBegin=CLIENT.indexOf('function variantId('),identityEnd=CLIENT.indexOf('function projectVariantCatalogDiagnostic(',identityBegin);
 assert.ok(begin>=0&&end>begin&&identityBegin>=0&&identityEnd>identityBegin);
 const context=vm.createContext({URLSearchParams});
 new vm.Script(`
 let clock=Date.parse(${JSON.stringify(current)});
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 globalThis.Date=ClockDate;
 let csrf='fixture',state={},bindingSaving=false,bindingDrafts=new Map(),bindingState=null,itemsPromise=null;
 const document={hidden:false},timers=new Map();let nextTimer=0;
 const setTimeout=(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,delay});return id;},clearTimeout=id=>timers.delete(id);
 function node(tag,text,cls){return {tag,textContent:text??'',className:cls??'',dataset:{},children:[],get childNodes(){return this.children;},value:'',hidden:false,append(...children){this.children.push(...children);},replaceChildren(...children){this.textContent='';this.children=[...children];},setAttribute(){},querySelectorAll(){return [];}};}
 const controls=new Map(),el=id=>{if(!controls.has(id))controls.set(id,node('div'));return controls.get(id);};
 const contents=el=>el.textContent+el.children.map(contents).join(' '),money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
 el('storeAdsSource').value='SHOPEE_PERIOD';
 ${projectAdsMeasurement.toString()}
 ${CLIENT.slice(identityBegin,identityEnd)}
 ${CLIENT.slice(begin,end)}
 let apiCalls=0,current;
 const api=async()=>{apiCalls++;return current;};
 `).runInContext(context);
 const run=code=>new vm.Script(code).runInContext(context),load=data=>{context.serialized=JSON.stringify(data);run('current=JSON.parse(serialized);storePeriodBundle=current;');};
 load(value);
 return {run,load,context,plain:object=>JSON.parse(JSON.stringify(object))};
}

test('client accepts exact canonical Ads alongside a legacy period cache and rejects inconsistent sidecars',()=>{
 const b=browser();assert.ok(b.run('projectAdsPeriod(current.ads_period)'));
 b.run('delete current.ads_period.measurement;');assert.ok(b.run('projectAdsPeriod(current.ads_period)'));
 for(const mutate of ["current.ads_period.expense_cents++","current.ads_period.measurement.fetched_at--","current.ads_period.measurement.days[0].broad.calculated_roas_raw='19.280000'","current.ads_period.measurement.private_token='hidden'"]){
  b.load(bundle());b.run(mutate);assert.equal(b.run('projectAdsPeriod(current.ads_period)'),null,mutate);
 }
});

test('completed-order saldo is kept while any purported store-wide net is rejected in current and legacy frames',()=>{
 const b=browser(bundle('2026-10-21','489.24'));
 assert.equal(b.run('projectStoreUiBundle(current).result.expected_after_tax_cents'),5116);
 assert.equal(b.run('projectStoreUiBundle(current).result.net_estimate_cents'),null);
 b.run('current.result.net_estimate_cents=-43808;');assert.equal(b.run('projectStoreUiBundle(current)'),null);
 b.load(bundle());b.run('current.result.known_cost_result_cents=-43808;');assert.equal(b.run('projectStoreUiBundle(current)'),null);
 b.load(bundle());b.run("current.result.pending=current.result.pending.filter(code=>code!=='ADS_COHORT_NOT_RECONCILED');");assert.equal(b.run('projectStoreUiBundle(current)'),null);
 b.load(bundle());b.run('delete current.finance.invoice_tax;delete current.result.invoice_tax;delete current.result.expected_after_tax_cents;delete current.result.known_cost_result_cents;current.result.net_estimate_cents=100;');assert.equal(b.run('projectStoreUiBundle(current)'),null);
});

test('main cards show BRL 51.16 for completed orders and keep total store net in reconciliation',()=>{
 const b=browser(bundle('2026-10-21','489.24'));
 b.run('renderStoreInvoiceTax=()=>{};renderStorePendingProducts=()=>{};renderStoreReturnsReport=()=>{};renderStoreProductReport=()=>{};updateStoreControls=()=>{};renderStoreResult();');
 const text=b.run("contents(el('storePeriodMetrics'))");
 assert.match(text,/Saldo dos pedidos concluídos/);assert.match(text,/51,16/);assert.match(text,/Líquido da loja/);assert.match(text,/Em conciliação/);assert.doesNotMatch(text,/438,08/);
 assert.match(b.run("contents(el('storePeriodPending'))"),/anúncios cobrem todas as vendas/);
});

test('Admin renders exact spend and preserves provider ROAS independently of calculated broad ROAS',()=>{
 const b=browser();b.run('renderStoreAdsState();');
 const text=b.run("contents(el('storeAdsMetrics'))");
 assert.match(text,/52,61/);assert.match(text,/1\.011,37/);assert.match(text,/19,28x/);assert.match(text,/19,22x/);assert.doesNotMatch(text,/31,07/);
 assert.equal(b.run("el('storeAdjustmentsAds').value"),'52.61');
 assert.match(b.run("contents(el('storeAdsStatus'))"),/não o de atualização na Shopee/);
 assert.match(b.run("contents(el('storeAdsStatus'))"),/fuso e o corte/);
 const link=b.run("el('storeAdsMetrics').children.flatMap(n=>n.children).find(n=>n.tag==='a').href");assert.equal(link,'/dashboard?start_date=2026-10-21&end_date=2026-10-21');
 b.load(bundle('2026-10-21','52.77'));b.run('renderStoreAdsState();');assert.match(b.run("contents(el('storeAdsMetrics'))"),/52,77/);assert.match(b.run("contents(el('storeAdsMetrics'))"),/19,17x/);assert.match(b.run("contents(el('storeAdsMetrics'))"),/19,28x/);
});

test('missing broad attribution stays pending when only direct values are available',()=>{
 const data=bundle();data.ads_period.measurement.days[0].broad={gmv_cents:null,orders:null,reported_roas_raw:null,calculated_roas_raw:null};data.ads_period.measurement.totals.broad={...data.ads_period.measurement.days[0].broad};data.ads_period.measurement.days[0].direct={gmv_cents:1000,orders:1,reported_roas_raw:'0.19',calculated_roas_raw:'0.190078'};data.ads_period.measurement.totals.direct={...data.ads_period.measurement.days[0].direct};
 const b=browser(data);assert.ok(b.run('projectAdsPeriod(current.ads_period)'));b.run('renderStoreAdsMeasurement();');
 const text=b.run("contents(el('storeAdsMetrics'))");assert.match(text,/Pendente/);assert.doesNotMatch(text,/10,00/);assert.doesNotMatch(text,/0,19x/);assert.match(text,/52,61/);
});

test('current-day refresh has one visible sixty-second timer and pauses for manual mode or hidden page',()=>{
 const b=browser(bundle('2026-10-22'));b.run('scheduleStoreAdsRefresh();scheduleStoreAdsRefresh();');
 assert.equal(b.run('timers.size'),1);assert.equal(b.run('[...timers.values()][0].delay'),60000);
 b.run('document.hidden=true;scheduleStoreAdsRefresh();');assert.equal(b.run('timers.size'),0);
 b.run("document.hidden=false;el('storeAdsSource').value='MANUAL';scheduleStoreAdsRefresh();");assert.equal(b.run('timers.size'),0);
 b.load(bundle('2026-10-21'));b.run("el('storeAdsSource').value='SHOPEE_PERIOD';scheduleStoreAdsRefresh();");assert.equal(b.run('timers.size'),0);
});

test('automatic refresh waits for age and keeps dirty drafts and manual source untouched',async()=>{
 const b=browser(bundle('2026-10-22'));
 await b.run('refreshStoreAds({automatic:true})');assert.equal(b.run('apiCalls'),0);
 b.run('clock+=61000;storeAdjustmentsDirty=true;');await b.run('refreshStoreAds({automatic:true})');assert.equal(b.run('apiCalls'),0);
 b.run("storeAdjustmentsDirty=false;el('storeAdsSource').value='MANUAL';");await b.run('refreshStoreAds({automatic:true})');assert.equal(b.run('apiCalls'),0);
 b.run("el('storeAdsSource').value='SHOPEE_PERIOD';applyStoreBundle=value=>{storePeriodBundle=value;};updateStoreControls=()=>{};");
 await b.run('refreshStoreAds({automatic:true})');assert.equal(b.run('apiCalls'),1);await b.run('refreshStoreAds({automatic:true})');assert.equal(b.run('apiCalls'),1);
});

test('Hermes daily Ads uses the canonical currency and distinct reported/calculated ROAS with no balance subtraction',async()=>{
 const b=browser();const start=CLIENT.indexOf('async function loadTodayAds(){'),end=CLIENT.indexOf('function projectDailySalesSnapshot(',start);
 new vm.Script('let todayAdsPromise=null;'+CLIENT.slice(start,end)).runInContext(b.context);
 b.load({date:'2026-10-21',measurement:measurement()});await b.run('loadTodayAds()');
 const text=b.run("contents(el('todayAds'))");assert.match(text,/Investimento:.*52,61/);assert.match(text,/Vendas atribuídas:.*1\.011,37/);assert.match(text,/ROAS informado: 19,28x/);assert.match(text,/ROAS calculado: 19,22x/);assert.doesNotMatch(text,/31,07/);
 assert.match(b.run("contents(el('todayAdsTime'))"),/não o de atualização na Shopee/);
 b.load({date:'2026-10-20',measurement:measurement()});await b.run('loadTodayAds()');assert.match(b.run("contents(el('todayAds'))"),/Não foi possível validar/);assert.doesNotMatch(b.run("contents(el('todayAds'))"),/52,61/);
});
