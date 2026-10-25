import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar,projectAdsCalendar} from '../src/ads-calendar.mjs';
import {projectBusinessMonthProducts} from '../src/business-month-products.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {BUSINESS_CHECKPOINT_SCHEMA,buildBusinessCheckpoint,recordBusinessCheckpoint,readBusinessCheckpoints,businessMonthWithCheckpoint,BusinessCheckpointError} from '../src/business-checkpoint.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';

const stamp=Date.UTC(2026,9,1,18)/1000,month='2026-10';
function frame({at=stamp,expenses=0,expenseRevision=1,payout=8000,adjustment=0,treatment='UNCONFIRMED',returns=0,oldest=at-1}={}){
 const selection={start_date:'2026-10-01',end_date:'2026-10-01'};
 const measurement=buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:selection,balance:20,daily:[{date:'2026-10-01',expense:1,broad_gmv:10,broad_order:1,direct_gmv:5,direct_order:1}]},selection,at);
 const ads=buildAdsCalendar([measurement],selection,at);
 const pending=[...(returns?['RETURNS_NOT_RECONCILED']:[]),...(expenses===null?['EXTERNAL_EXPENSES_REQUIRED']:[]),...(adjustment>0&&treatment==='UNCONFIRMED'?['RECHARGE_TREATMENT_REQUIRED']:[]),...(at-oldest>900?['FINANCIAL_SOURCE_STALE']:[])];
 const net=pending.length?null:payout-1590-8605-100-expenses+(treatment==='ADS_RECHARGE'?adjustment:0);
 const value={schema:'business_month_v1',month,...selection,status:'COMPLETE',checked_at:at,progress:{windows_total:1,windows_complete:1,pages_read:1},coverage:{orders:1,paid:1,completed:1,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1,payment_missing:0,returns,returns_unknown:0},sales_cents:10000,known_sales_cents:10000,expected_repass_cents:payout,known_expected_repass_cents:payout,production_cost_cents:1590,known_production_cost_cents:1590,invoice_tax_cents:8605,known_invoice_tax_cents:8605,ads_adjustment_cents:adjustment,ads,expenses:{revision:expenses===null?0:expenseRevision,external_expenses_cents:expenses,recharge_treatment:treatment,updated_at:expenses===null?null:new Date(at*1000).toISOString()},result:{net_estimate_cents:net,net_profit_cents:null,net_margin_bps:net===null?null:Number(BigInt(net)*10000n/10000n),pending,basis:'PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE'},unmapped_variants:[],bindings_revision:2,costs_revision:3,cost_rules_revision:4,tax:{schema:'business_month_tax_v1',regime:'MEI',year:2026,policy_revision:1,monthly_das_cents:8605,tax_cents:8605,status:'DECLARED',source:'OPERATOR_DECLARED_DAS',basis:'MONTHLY_COMPETENCE_NO_PRORATION'},source_checked_at:{finance_oldest_at:oldest,finance_latest_at:at,ads_at:at}};
 assert.ok(projectBusinessMonth(value),'checkpoint fixture must cross the real monthly projector');return value;
}
const env=()=>({ADMIN_DB:new D1()});
const fail=code=>error=>error instanceof BusinessCheckpointError&&error.message===code;
const history=(e,limit=10)=>readBusinessCheckpoints(e,{month,limit});

test('the compact account explains exact cents, a single DAS and consumption without treating credit as spend or payout as settled',()=>{
 const value=frame(),checkpoint=buildBusinessCheckpoint(value);
 assert.equal(checkpoint.status,'EXPECTED_READY');assert.equal(checkpoint.result.expected_net_cents,-2295);assert.equal(checkpoint.result.realized_net_cents,null);assert.equal(checkpoint.result.realization,'UNVERIFIED');
 assert.deepEqual(checkpoint.lines,[{code:'EXPECTED_PAYOUT',sign:1,amount_cents:8000},{code:'PRODUCTION',sign:-1,amount_cents:1590},{code:'TAX',sign:-1,amount_cents:8605},{code:'ADS_CONSUMPTION',sign:-1,amount_cents:100},{code:'OTHER_EXPENSES',sign:-1,amount_cents:0},{code:'ADS_RECHARGE_RESTORE',sign:1,amount_cents:0}]);
 assert.equal(checkpoint.lines.reduce((sum,line)=>sum+BigInt(line.sign)*BigInt(line.amount_cents),0n),BigInt(checkpoint.result.expected_net_cents));
 assert.deepEqual(checkpoint.versions,{bindings:2,costs:3,cost_rules:4,tax_policy:1,expenses:1});
 const raw=JSON.stringify(checkpoint);assert.ok(!raw.includes('1178167501'));assert.ok(!raw.includes('balance_cents'));assert.ok(!raw.includes('product_summary'));
 checkpoint.coverage.paid=99;checkpoint.lines[0].amount_cents=1;checkpoint.source_checked_at.finance_oldest_at=1;checkpoint.pending.push('PRIVATE');
 assert.equal(value.coverage.paid,1);assert.equal(value.expected_repass_cents,8000);assert.equal(value.source_checked_at.finance_oldest_at,stamp-1);assert.deepEqual(value.result.pending,[]);
});

test('unknown expenses, returns and stale observations remain pending; recharge is restored once only when classified',()=>{
 for(const value of [frame({expenses:null}),frame({returns:1}),frame({oldest:stamp-901}),frame({adjustment:200})]){
  const checkpoint=buildBusinessCheckpoint(value);assert.equal(checkpoint.status,'PENDING');assert.equal(checkpoint.result.expected_net_cents,null);assert.equal(checkpoint.result.realized_net_cents,null);assert.deepEqual(checkpoint.pending,value.result.pending);
 }
 assert.equal(buildBusinessCheckpoint(frame({expenses:null})).lines[4].amount_cents,null);
 assert.equal(buildBusinessCheckpoint(frame({adjustment:200})).lines[5].amount_cents,null);
 const restored=buildBusinessCheckpoint(frame({adjustment:200,treatment:'ADS_RECHARGE'}));assert.equal(restored.lines[5].amount_cents,200);assert.equal(restored.result.expected_net_cents,-2095);
 const support=buildBusinessCheckpoint(frame({adjustment:200,treatment:'TECH_SUPPORT'}));assert.equal(support.lines[5].amount_cents,0);assert.equal(support.result.expected_net_cents,-2295);
});

test('browser helper is self contained and cannot bypass the strict monthly contract or invoke getters',()=>{
 const context=vm.createContext({Intl,Date,BigInt,JSON});
 vm.runInContext(projectAdsCalendar.toString()+'\n'+projectBusinessMonthProducts.toString()+'\n'+projectBusinessMonth.toString()+'\n'+buildBusinessCheckpoint.toString(),context);
 const raw=JSON.stringify(frame());assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(buildBusinessCheckpoint('+raw+'))',context)),buildBusinessCheckpoint(frame()));
 assert.equal(buildBusinessCheckpoint({...frame(),access_token:'PRIVATE_PROVIDER_TOKEN'}),null);
 let calls=0;const poisoned={...frame()};Object.defineProperty(poisoned,'sales_cents',{enumerable:true,get(){calls++;return 10000;}});assert.equal(buildBusinessCheckpoint(poisoned),null);assert.equal(calls,0);
 const wrong=frame();wrong.result.net_estimate_cents++;assert.equal(buildBusinessCheckpoint(wrong),null);
});

test('automatic records deduplicate refresh timestamps, watermark late observations and preserve a genuine A to B to A change',async()=>{
 const e=env(),first=await recordBusinessCheckpoint(e,frame());assert.equal(first.revision,1);
 const refreshed=await recordBusinessCheckpoint(e,frame({at:stamp+60}));assert.equal(refreshed.revision,1);assert.equal(refreshed.checkpoint.checked_at,stamp);
 assert.equal(e.ADMIN_DB.db.prepare('SELECT observed_at FROM business_checkpoint_state').get().observed_at,stamp+60);
 const late=await recordBusinessCheckpoint(e,frame({at:stamp+30,payout:7000}));assert.equal(late.revision,1);assert.equal(late.fingerprint,first.fingerprint);
 const second=await recordBusinessCheckpoint(e,frame({at:stamp+61,payout:7000}));assert.equal(second.revision,2);assert.notEqual(second.fingerprint,first.fingerprint);
 const restored=await recordBusinessCheckpoint(e,frame({at:stamp+62}));assert.equal(restored.revision,3);assert.equal(restored.fingerprint,first.fingerprint);
 const result=await history(e);assert.equal(result.schema,'business_checkpoint_history_v1');assert.equal(result.retention_limit,128);assert.deepEqual(result.checkpoints.map(record=>record.revision),[3,2,1]);assert.deepEqual(result.checkpoints.map(record=>record.checkpoint.checked_at),[stamp+62,stamp+61,stamp]);
});

test('same-second changes are retained and versions create a new explanation even when totals coincide',async()=>{
 const e=env();await recordBusinessCheckpoint(e,frame());const changed=await recordBusinessCheckpoint(e,frame({payout:7000}));assert.equal(changed.revision,2);
 const revision=frame({payout:7000});revision.costs_revision++;const third=await recordBusinessCheckpoint(e,revision);assert.equal(third.revision,3);assert.equal(third.checkpoint.result.expected_net_cents,changed.checkpoint.result.expected_net_cents);
});

test('classification revisions extend the history without rewriting legacy fingerprints or accepting a later revisionless downgrade',async()=>{
 const e=env(),legacy=await recordBusinessCheckpoint(e,frame());
 const classified=frame({at:stamp+1});classified.classification_revision=2;
 const updated=await recordBusinessCheckpoint(e,classified);
 assert.equal(updated.revision,2);assert.equal(updated.checkpoint.versions.classifications,2);
 let records=await history(e);assert.equal(records.checkpoints[1].fingerprint,legacy.fingerprint);assert.ok(!Object.hasOwn(records.checkpoints[1].checkpoint.versions,'classifications'));
 const late=await recordBusinessCheckpoint(e,frame({at:stamp+2}));assert.equal(late.revision,2);assert.equal(late.checkpoint.versions.classifications,2);
 records=await history(e);assert.equal(records.checkpoints.length,2);assert.equal(records.checkpoints[1].fingerprint,legacy.fingerprint);
});

test('out-of-order same-second replies and incomparable configuration vectors cannot roll costs or expenses back',async()=>{
 const e=env(),current=frame({expenses:500,expenseRevision:2});await recordBusinessCheckpoint(e,current);
 const old=await recordBusinessCheckpoint(e,frame({expenses:0,expenseRevision:1}));assert.equal(old.revision,1);assert.equal(old.checkpoint.versions.expenses,2);assert.equal(old.checkpoint.lines[4].amount_cents,500);
 const crossed=frame({at:stamp+1,expenses:0,expenseRevision:1});crossed.costs_revision=4;
 const held=await recordBusinessCheckpoint(e,crossed);assert.equal(held.revision,1);assert.equal(held.checkpoint.versions.costs,3);assert.equal(held.checkpoint.versions.expenses,2);
 const merged=frame({at:stamp+2,expenses:500,expenseRevision:2});merged.costs_revision=4;
 const accepted=await recordBusinessCheckpoint(e,merged);assert.equal(accepted.revision,2);assert.equal(accepted.checkpoint.versions.costs,4);assert.equal(accepted.checkpoint.versions.expenses,2);
 const missingRuleRevision=structuredClone(merged);delete missingRuleRevision.cost_rules_revision;assert.equal((await recordBusinessCheckpoint(e,missingRuleRevision)).revision,2);
});

test('older non-null source observations are ignored while an expired unavailable Ads source can become pending',async()=>{
 const e=env(),current=frame({at:stamp+60});await recordBusinessCheckpoint(e,frame());await recordBusinessCheckpoint(e,current);
 assert.equal((await history(e)).checkpoints.length,1);assert.equal((await history(e)).checkpoints[0].checkpoint.source_checked_at.finance_oldest_at,stamp-1);
 assert.equal(JSON.parse(e.ADMIN_DB.db.prepare('SELECT source_watermarks FROM business_checkpoint_state').get().source_watermarks).finance_oldest_at,stamp+59);
 const oldFinance=frame({at:stamp+120,expenses:500,expenseRevision:2,oldest:stamp-1});
 const held=await recordBusinessCheckpoint(e,oldFinance);assert.equal(held.revision,1);assert.equal(held.checkpoint.lines[4].amount_cents,0);
 const unavailable=frame({at:stamp+120});unavailable.ads=null;unavailable.source_checked_at={...current.source_checked_at,ads_at:null};unavailable.result={...unavailable.result,net_estimate_cents:null,net_margin_bps:null,pending:['ADS_UNAVAILABLE']};assert.ok(projectBusinessMonth(unavailable));
 const pending=await recordBusinessCheckpoint(e,unavailable);assert.equal(pending.revision,2);assert.equal(pending.checkpoint.status,'PENDING');assert.equal(pending.checkpoint.lines[3].amount_cents,null);assert.equal(pending.checkpoint.result.expected_net_cents,null);
});

test('a source watermark advances on a deduplicated observation even when the aggregate second is unchanged',async()=>{
 const e=env();await recordBusinessCheckpoint(e,frame());
 const fresh=frame({oldest:stamp});assert.equal((await recordBusinessCheckpoint(e,fresh)).revision,1);
 const stored=e.ADMIN_DB.db.prepare('SELECT observed_at,source_watermarks FROM business_checkpoint_state').get();assert.equal(stored.observed_at,stamp);assert.equal(JSON.parse(stored.source_watermarks).finance_oldest_at,stamp);
 const old=await recordBusinessCheckpoint(e,frame({expenses:500,expenseRevision:2}));assert.equal(old.revision,1);assert.equal(old.checkpoint.lines[4].amount_cents,0);
 const combined=await recordBusinessCheckpoint(e,frame({oldest:stamp,expenses:500,expenseRevision:2}));assert.equal(combined.revision,2);assert.equal(combined.checkpoint.lines[4].amount_cents,500);
});

test('history is bounded to 128 compact revisions with monotonic counters after retention',async()=>{
 const e=env();for(let index=0;index<131;index++)await recordBusinessCheckpoint(e,frame({at:stamp+index,expenses:index,expenseRevision:index+1}));
 const count=e.ADMIN_DB.db.prepare('SELECT COUNT(*) AS count,MIN(revision) AS oldest,MAX(revision) AS latest FROM business_checkpoint_history').get();assert.deepEqual({...count},{count:128,oldest:4,latest:131});
 const result=await history(e,20);assert.equal(result.checkpoints.length,20);assert.equal(result.checkpoints[0].revision,131);assert.equal(result.checkpoints.at(-1).revision,112);assert.ok(result.checkpoints.every(row=>Buffer.byteLength(JSON.stringify(row.checkpoint))<16384));
});

class SerialD1 extends D1 {
 constructor(){super();this.queued=Promise.resolve();}
 batch(statements){const run=this.queued.then(()=>super.batch(statements));this.queued=run.catch(()=>{});return run;}
}
test('competing collectors use CAS and atomic history instead of overwriting a newer observation',async()=>{
 const e={ADMIN_DB:new SerialD1()};
 await Promise.all([recordBusinessCheckpoint(e,frame({at:stamp})),recordBusinessCheckpoint(e,frame({at:stamp+1,payout:7000})),recordBusinessCheckpoint(e,frame({at:stamp+2,payout:6000}))]);
 const result=await history(e),head=result.checkpoints[0];assert.equal(head.checkpoint.checked_at,stamp+2);assert.equal(head.checkpoint.lines[0].amount_cents,6000);assert.equal(e.ADMIN_DB.db.prepare('SELECT observed_at FROM business_checkpoint_state').get().observed_at,stamp+2);
 assert.ok(result.checkpoints.length>=1&&result.checkpoints.length<=3);for(let index=1;index<result.checkpoints.length;index++)assert.equal(result.checkpoints[index-1].revision,result.checkpoints[index].revision+1);
});

test('a failed history append rolls the head back atomically and returns no provider information',async()=>{
 class FailingD1 extends D1 {
  prepare(sql){const statement=super.prepare(sql);if(this.fail&&sql.startsWith('INSERT INTO business_checkpoint_history'))statement.run=async()=>{throw Error('PRIVATE_PROVIDER_TOKEN');};return statement;}
 }
 const e={ADMIN_DB:new FailingD1()};await recordBusinessCheckpoint(e,frame());const before=await history(e);e.ADMIN_DB.fail=true;
 await assert.rejects(recordBusinessCheckpoint(e,frame({at:stamp+1,payout:7000})),fail('BUSINESS_CHECKPOINT_UNAVAILABLE'));e.ADMIN_DB.fail=false;assert.deepEqual(await history(e),before);
});

test('tampered values, unexpected private fields and deleted state or history are quarantined',async()=>{
 for(const mutation of [
  db=>db.exec("UPDATE business_checkpoint_history SET payload='{}'"),
  db=>{const payload=JSON.parse(db.prepare('SELECT payload FROM business_checkpoint_state').get().payload);payload.access_token='PRIVATE_PROVIDER_TOKEN';const raw=JSON.stringify(payload);db.prepare('UPDATE business_checkpoint_state SET payload=?').run(raw);db.prepare('UPDATE business_checkpoint_history SET payload=?').run(raw);},
  db=>db.exec('DELETE FROM business_checkpoint_state'),
  db=>db.exec('DELETE FROM business_checkpoint_history'),
  db=>db.exec('UPDATE business_checkpoint_state SET observed_at=1'),
  db=>db.exec("UPDATE business_checkpoint_state SET source_watermarks='{}'"),
 ]){
  const e=env();await recordBusinessCheckpoint(e,frame());mutation(e.ADMIN_DB.db);await assert.rejects(history(e),fail('BUSINESS_CHECKPOINT_STORAGE_INVALID'));await assert.rejects(recordBusinessCheckpoint(e,frame({at:stamp+1})),fail('BUSINESS_CHECKPOINT_STORAGE_INVALID'));
 }
 const e=env();await recordBusinessCheckpoint(e,frame());await recordBusinessCheckpoint(e,frame({at:stamp+1,payout:7000}));await recordBusinessCheckpoint(e,frame({at:stamp+2,payout:6000}));e.ADMIN_DB.db.exec('DELETE FROM business_checkpoint_history WHERE revision=2');await assert.rejects(history(e),fail('BUSINESS_CHECKPOINT_STORAGE_INVALID'));
});

test('read selection is exact and bounded; empty history does not invent a financial result',async()=>{
 const e=env();assert.deepEqual(await readBusinessCheckpoints(e,{month}),{schema:'business_checkpoint_history_v1',month,retention_limit:128,checkpoints:[]});
 for(const input of [{month,limit:0},{month,limit:21},{month,limit:-0},{month,limit:1.5},{month:'2099-01'},{month:'1999-12'},{month:'2026-13'},{month,shop_id:1178167501}])await assert.rejects(readBusinessCheckpoints(e,input),fail('BUSINESS_CHECKPOINT_REQUEST_INVALID'));
 let calls=0;const poison={month};Object.defineProperty(poison,'limit',{enumerable:true,get(){calls++;return 10;}});await assert.rejects(readBusinessCheckpoints(e,poison),fail('BUSINESS_CHECKPOINT_REQUEST_INVALID'));assert.equal(calls,0);
 await assert.rejects(recordBusinessCheckpoint(e,{...frame(),private_token:'PRIVATE'}),fail('BUSINESS_CHECKPOINT_INVALID'));assert.equal((await history(e)).checkpoints.length,0);
 assert.equal(BUSINESS_CHECKPOINT_SCHEMA.length,2);
});

test('the shared entry point automatically checkpoints a completed period and changed expenses, preserving actor and clock',async()=>{
 const e=env();e.ADMIN_DB.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)');
 e.ADMIN_DB.db.prepare('INSERT INTO variant_bindings_state VALUES(1,1,?,?)').run('[]',new Date(stamp*1000).toISOString());e.ADMIN_DB.db.prepare('INSERT INTO production_costs_state VALUES(1,1,?,?)').run(JSON.stringify(COST_DEFAULTS),new Date(stamp*1000).toISOString());
 const empty=running=>({schema:'finance_business_period_v1',run_id:'11111111-1111-4111-8111-111111111111',revision:running?1:2,status:running?'RUNNING':'COMPLETE',start_date:'2026-10-01',end_date:'2026-10-01',cutoff_at:stamp-1,checked_at:stamp,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:0,paid:0,completed:0,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:0,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'0',sales_base_raw:'0',known_expected_repass_raw:'0',expected_repass_raw:'0',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:0,unavailable_orders:0,known_base_raw:'0',known_tax_raw:'0'},items:[],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'});
 const services={getFinanceBusinessPeriod:async(_,selection)=>empty(selection.operation==='start')},options={now:()=>stamp*1000,actor:'checkpoint-operator'};
 const invoke=(operation,extra={})=>businessMonthWithCheckpoint(e,{operation,month,...extra},services,options);
 assert.equal((await invoke('start')).status,'RUNNING');assert.equal((await history(e)).checkpoints.length,0);
 assert.equal((await invoke('step')).status,'COMPLETE');assert.equal((await history(e)).checkpoints.length,1);
 const changed=await invoke('expenses',{revision:0,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED'});assert.equal(changed.checked_at,stamp);assert.equal((await history(e)).checkpoints[0].revision,2);assert.equal(e.ADMIN_DB.db.prepare('SELECT actor FROM business_month_expenses_audit').get().actor,'checkpoint-operator');
 await invoke('read');assert.equal((await history(e)).checkpoints[0].revision,2);
});

test('partial collection discovers already priced sold products and catalogue queue failures cannot replace valid finance or its original error',async t=>{
 class QueueFailureD1 extends D1 {
  prepare(sql){const statement=super.prepare(sql);if(this.failQueue&&sql.startsWith('INSERT OR IGNORE INTO catalog_classification_jobs'))statement.run=async()=>{throw Error('PRIVATE_QUEUE_FAILURE');};return statement;}
 }
 const e={ADMIN_DB:new QueueFailureD1()};t.after(()=>e.ADMIN_DB.db.close());e.ADMIN_DB.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)');
 const bindings=[{item_id:'201',model_id:'1',size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:true},{item_id:'202',model_id:'2',size:'G1',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}];
 e.ADMIN_DB.db.prepare('INSERT INTO variant_bindings_state VALUES(1,1,?,?)').run(JSON.stringify(bindings),new Date(stamp*1000).toISOString());e.ADMIN_DB.db.prepare('INSERT INTO production_costs_state VALUES(1,1,?,?)').run(JSON.stringify(COST_DEFAULTS),new Date(stamp*1000).toISOString());
 const imported={schema:'finance_business_period_v1',run_id:'11111111-1111-4111-8111-111111111111',revision:1,status:'RUNNING',start_date:'2026-10-01',end_date:'2026-10-01',cutoff_at:stamp-1,checked_at:stamp,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:2,paid:2,completed:2,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:2,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'100',sales_base_raw:'100',known_expected_repass_raw:'80',expected_repass_raw:'80',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:2,unavailable_orders:0,known_base_raw:'100',known_tax_raw:'2'},items:[{item_id:'201',model_id:'1',quantity:1},{item_id:'202',model_id:'2',quantity:1}],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
 const services={getFinanceBusinessPeriod:async()=>structuredClone(imported)},invoke=operation=>businessMonthWithCheckpoint(e,{operation,month},services,{now:()=>stamp*1000});
 const partial=await invoke('start');assert.equal(partial.status,'RUNNING');assert.equal(partial.product_summary,null);assert.deepEqual(partial.unmapped_variants,[]);assert.equal(partial.known_production_cost_cents,3480);
 const queued=()=>e.ADMIN_DB.db.prepare('SELECT item_id FROM catalog_classification_jobs ORDER BY item_id').all().map(row=>row.item_id);assert.deepEqual(queued(),['201','202']);
 imported.revision=2;for(const name of ['orders','paid','completed','payment_covered'])imported.coverage[name]=3;
 imported.known_sales_base_raw=imported.sales_base_raw='150';imported.known_expected_repass_raw=imported.expected_repass_raw='120';imported.invoice_tax={...imported.invoice_tax,covered_orders:3,known_base_raw:'150',known_tax_raw:'3'};imported.items.push({item_id:'203',model_id:'3',quantity:1});
 const missing=await invoke('step');assert.deepEqual(missing.unmapped_variants,[{item_id:'203',model_id:'3',quantity:1}]);
 assert.equal(e.ADMIN_DB.db.prepare('SELECT next_attempt_at FROM catalog_classification_jobs WHERE item_id=?').get('203').next_attempt_at,0);assert.equal(e.ADMIN_DB.db.prepare('SELECT next_attempt_at FROM catalog_classification_jobs WHERE item_id=?').get('201').next_attempt_at,stamp);
 e.ADMIN_DB.db.exec('DELETE FROM catalog_classification_jobs');services.getFinanceBusinessPeriod=async()=>{throw Error('PRIVATE_SOURCE_FAILURE');};
 await assert.rejects(invoke('step'),error=>error.message==='BUSINESS_MONTH_SOURCE_UNAVAILABLE');assert.deepEqual(queued(),['201','202','203'],'the previous validated partial still discovers products when the next page fails');
 e.ADMIN_DB.db.exec('DELETE FROM catalog_classification_jobs');e.ADMIN_DB.failQueue=true;
 await assert.rejects(invoke('step'),error=>error.message==='BUSINESS_MONTH_SOURCE_UNAVAILABLE');
 const retained=await invoke('read');assert.equal(retained.known_production_cost_cents,3480);assert.equal(retained.known_sales_cents,15000);assert.equal(retained.status,'RUNNING');assert.deepEqual(queued(),[]);
 assert.deepEqual(JSON.parse(e.ADMIN_DB.db.prepare('SELECT payload FROM variant_bindings_state').get().payload),bindings);
});
