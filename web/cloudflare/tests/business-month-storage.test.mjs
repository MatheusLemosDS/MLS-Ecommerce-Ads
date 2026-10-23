import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {businessMonth,BusinessMonthError} from '../src/business-month.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';

const clock=Date.UTC(2026,10,2,12),stamp=clock/1000,now=()=>clock;
const id=index=>'11111111-1111-4111-8111-'+String(index).padStart(12,'0');
const frame=(selection,index,{status='COMPLETE',revision=2,large=false}={})=>{
 const count=large?1000:1,goods=large?'1000000':'100',payout=large?'800000':'80',tax=large?'20000':'2';
 const items=Array.from({length:count},(_,at)=>({item_id:(10000000000000000000n+BigInt(index*1000+at)).toString(),model_id:'99999999999999999999',quantity:1}));
 const value={schema:'finance_business_period_v1',run_id:id(index),revision,status,...selection,cutoff_at:stamp-2,checked_at:stamp,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:Math.ceil(count/5),duplicate_orders:0,coverage:{orders:count,paid:count,completed:count,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:count,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:String(Number(goods)*count),sales_base_raw:String(Number(goods)*count),known_expected_repass_raw:String(Number(payout)*count),expected_repass_raw:String(Number(payout)*count),known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:count,unavailable_orders:0,known_base_raw:String(Number(goods)*count),known_tax_raw:String(Number(tax)*count)},items,diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED',product_breakdown:{schema:'business_product_breakdown_v1',mixed_orders:0,mixed_payment_covered:0,mixed_payment_missing:0,known_mixed_sales_base_raw:'0',known_mixed_expected_repass_raw:'0',known_mixed_ads_adjustment_raw:'0',known_mixed_invoice_tax_raw:'0',products:items.map(item=>({item_id:item.item_id,quantity:1,orders:1,exclusive_orders:1,mixed_orders:0,exclusive_payment_covered:1,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,known_exclusive_sales_base_raw:goods,exclusive_sales_base_raw:goods,known_exclusive_expected_repass_raw:payout,exclusive_expected_repass_raw:payout,known_exclusive_ads_adjustment_raw:'0',exclusive_ads_adjustment_raw:'0',known_exclusive_invoice_tax_raw:tax,exclusive_invoice_tax_raw:tax,items:[{model_id:item.model_id,exclusive_quantity:1,mixed_quantity:0}]}))}};
 assert.ok(projectBusinessPeriodFrame(value));return value;
};

class BoundedD1 extends D1{
 constructor(){super();this.maxValue=0;this.failAdvance=false;this.snapshots=0;}
 prepare(sql){const value=super.prepare(sql),bind=value.bind.bind(value);value.sql=sql;value.bind=(...args)=>{for(const arg of args)if(typeof arg==='string'){const bytes=Buffer.byteLength(arg);this.maxValue=Math.max(this.maxValue,bytes);if(bytes>2097152)throw Error('D1_VALUE_LIMIT');}return bind(...args);};return value;}
 async batch(statements){
  if(statements[0]?.sql?.startsWith('SELECT revision,payload,created_at')){assert.match(statements[1]?.sql||'',/FROM business_month_frames/);this.snapshots++;}
  if(this.failAdvance&&statements.some(statement=>statement.sql?.startsWith('INSERT INTO business_month_frames'))){this.failAdvance=false;return super.batch([...statements.slice(0,-1),{async run(){throw Error('SIMULATED_PARENT_WRITE_FAILURE');}}]);}
  return super.batch(statements);
 }
}
function environment(){
 const ADMIN_DB=new BoundedD1();ADMIN_DB.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)');
 ADMIN_DB.db.prepare('INSERT INTO variant_bindings_state VALUES(1,1,?,?)').run('[]',new Date(clock).toISOString());
 ADMIN_DB.db.prepare('INSERT INTO production_costs_state VALUES(1,1,?,?)').run(JSON.stringify(COST_DEFAULTS),new Date(clock).toISOString());return {ADMIN_DB};
}
function source(options={}){let sequence=0;const frames=new Map(),calls=[];return {calls,frames,getFinanceBusinessPeriod:async(_,selection)=>{calls.push(selection);if(selection.operation==='start'){const value=frame({start_date:selection.start_date,end_date:selection.end_date},++sequence,options);frames.set(value.run_id,value);return structuredClone(value);}return structuredClone(frames.get(selection.run_id));}};}
const run=(env,services,operation='start',extra={},time=now)=>businessMonth(env,{operation,month:'2026-10',...extra},services,{now:time});
async function finish(env,services){let value=await run(env,services);while(value.status==='RUNNING')value=await run(env,services,'step');return value;}
const stored=env=>({parent:env.ADMIN_DB.db.prepare('SELECT * FROM business_month_runs').all(),frames:env.ADMIN_DB.db.prepare('SELECT * FROM business_month_frames ORDER BY month,slot_index').all()});
const fail=error=>error instanceof BusinessMonthError&&error.message==='BUSINESS_MONTH_STORAGE_INVALID';

test('three legal thousand-product windows use bounded individual rows instead of one oversized D1 value',async()=>{
 const env=environment(),services=source({large:true}),value=await finish(env,services),state=stored(env);
 const fullPayload={start_date:'2026-10-01',end_date:'2026-10-31',slots:[...services.frames.values()].map(frame=>({start_date:frame.start_date,end_date:frame.end_date,frame}))};
 assert.ok(Buffer.byteLength(JSON.stringify(fullPayload))>2097152,'the original inline storage must exceed the real D1 value limit');
 assert.equal(value.status,'COMPLETE');assert.equal(value.coverage.paid,3000);assert.equal(value.sales_cents,300000000000);assert.equal(value.product_summary.products.length,3000);
 assert.equal(state.frames.length,3);assert.ok(state.frames.every(row=>Buffer.byteLength(row.payload)<=1048576));assert.ok(Buffer.byteLength(state.parent[0].payload)<1024);assert.ok(env.ADMIN_DB.maxValue<=1048576);assert.ok(env.ADMIN_DB.snapshots>=3);
 const read=await run(env,services,'read');assert.equal(read.sales_cents,value.sales_cents);assert.equal(read.product_summary.products.length,3000);assert.equal(services.calls.length,3);
 const saved=await run(env,services,'expenses',{revision:0,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED'});assert.equal(saved.expenses.revision,1);assert.equal(saved.product_summary.products.length,3000);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS count FROM business_month_expenses_audit').get().count,1);
});

test('legacy inline frames are accepted and converted to compact references at the next step',async()=>{
 const env=environment(),services=source();await run(env,services);const row=stored(env).parent[0],payload=JSON.parse(row.payload),inline=[...services.frames.values()][0];
 payload.slots[0].frame=inline;env.ADMIN_DB.db.prepare('UPDATE business_month_runs SET payload=?').run(JSON.stringify(payload));env.ADMIN_DB.db.exec('DELETE FROM business_month_frames');
 assert.equal((await run(env,services,'read')).coverage.paid,1);await run(env,services,'step');const migrated=stored(env),refs=JSON.parse(migrated.parent[0].payload).slots.filter(slot=>slot.frame);
 assert.equal(refs.length,2);assert.equal(migrated.frames.length,2);assert.ok(refs.every(slot=>slot.frame.schema==='business_month_frame_ref_v1'));assert.equal((await run(env,services,'read')).coverage.paid,2);
});

test('a failed parent write rolls back frame replacement and retains a valid previous snapshot',async()=>{
 const env=environment(),services=source({status:'RUNNING',revision:1});await run(env,services);const before=stored(env);const current=[...services.frames.values()][0];services.frames.set(current.run_id,{...current,revision:2});
 env.ADMIN_DB.failAdvance=true;await assert.rejects(run(env,services,'step'),error=>error instanceof BusinessMonthError&&error.message==='BUSINESS_MONTH_UNAVAILABLE');assert.deepEqual(stored(env),before);
 assert.equal((await run(env,services,'read')).coverage.paid,1);await run(env,services,'step');assert.equal(stored(env).frames[0].revision,2);assert.equal(stored(env).frames.length,1);
});

test('a stale concurrent step cannot replace slot data or invalidate the winning references',async()=>{
 const env=environment(),services=source({status:'RUNNING',revision:1});await run(env,services);const current=[...services.frames.values()][0];let entered,release;
 const pending=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 const stale=run(env,{getFinanceBusinessPeriod:async()=>{entered();return pending;}},'step');await started;
 const winner=await run(env,{getFinanceBusinessPeriod:async()=>({...current,revision:3})},'step');const expected=stored(env);release({...current,revision:2});const loser=await stale;
 assert.deepEqual(stored(env),expected);assert.equal(stored(env).frames[0].revision,3);assert.deepEqual(loser,winner);
});

test('normalized references reject missing, mismatched, poisoned and unreferenced slot rows',async()=>{
 const mutations=[
  (db,payload)=>payload.slots[0].frame.private_token='PRIVATE',
  (db,payload)=>payload.slots[0].frame.revision++,
  db=>db.exec('DELETE FROM business_month_frames'),
  db=>db.exec('UPDATE business_month_frames SET slot_index=1'),
  db=>db.exec('UPDATE business_month_frames SET run_id=\'22222222-2222-4222-8222-222222222222\''),
  db=>db.exec('UPDATE business_month_frames SET payload=\'{}\''),
  db=>db.exec('INSERT INTO business_month_frames SELECT month,2,run_id,revision,payload FROM business_month_frames'),
 ];
 for(const mutate of mutations){const env=environment(),services=source();await run(env,services);const parent=stored(env).parent[0],payload=JSON.parse(parent.payload);mutate(env.ADMIN_DB.db,payload);env.ADMIN_DB.db.prepare('UPDATE business_month_runs SET payload=?').run(JSON.stringify(payload));await assert.rejects(run(env,services,'read'),fail);assert.equal(services.calls.length,1);}
});

test('repeated frame versions and expired run replacement keep at most three current rows and preserve expenses',async()=>{
 const env=environment(),services=source({status:'RUNNING',revision:1});await run(env,services);const initial=[...services.frames.values()][0];
 for(let revision=2;revision<=9;revision++){services.frames.set(initial.run_id,{...initial,revision});await run(env,services,'step');assert.equal(stored(env).frames.length,1);assert.equal(stored(env).frames[0].revision,revision);}
 services.frames.set(initial.run_id,{...initial,revision:10,status:'COMPLETE'});await run(env,services,'step');
 services.getFinanceBusinessPeriod=async(_,selection)=>frame({start_date:selection.start_date,end_date:selection.end_date},selection.start_date.endsWith('16')?2:3);await run(env,services,'step');await run(env,services,'step');assert.equal(stored(env).frames.length,3);
 await run(env,services,'expenses',{revision:0,external_expenses_cents:123,recharge_treatment:'UNCONFIRMED'});const audit=env.ADMIN_DB.db.prepare('SELECT * FROM business_month_expenses_audit').all();
 const next=source();await run(env,next,'start',{},()=>clock+901000);assert.equal(stored(env).frames.length,1);assert.equal((await run(env,next,'read',{},()=>clock+901000)).expenses.external_expenses_cents,123);assert.deepEqual(env.ADMIN_DB.db.prepare('SELECT * FROM business_month_expenses_audit').all(),audit);
});
