import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {BUSINESS_MONTH_PUBLICATION_SCHEMA,completedBusinessMonthPublicationStatements,saveCompletedBusinessMonth,readCompletedBusinessMonth,BusinessMonthPublicationError} from '../src/business-month-publication.mjs';
const at=Date.UTC(2026,10,2,12),stamp=at/1000,now=()=>at,month='2026-10';
const serial=index=>'11111111-1111-4111-8111-'+String(index).padStart(12,'0');
function frame(start_date,end_date,index,{large=false,status='COMPLETE',checked_at=stamp}={}){
 const count=large?1000:1,goods=large?'1000000':'100',payout=large?'800000':'80',tax=large?'20000':'2',items=Array.from({length:count},(_,offset)=>({item_id:(10000000000000000000n+BigInt(index*1000+offset)).toString(),model_id:'99999999999999999999',quantity:1}));
 const value={schema:'finance_business_period_v1',run_id:serial(index),revision:2,status,start_date,end_date,cutoff_at:checked_at-2,checked_at,source_checked_at:{oldest_at:checked_at-1,latest_at:checked_at-1},currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:Math.ceil(count/5),duplicate_orders:0,coverage:{orders:count,paid:count,completed:count,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:count,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:String(Number(goods)*count),sales_base_raw:String(Number(goods)*count),known_expected_repass_raw:String(Number(payout)*count),expected_repass_raw:String(Number(payout)*count),known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:count,unavailable_orders:0,known_base_raw:String(Number(goods)*count),known_tax_raw:String(Number(tax)*count)},items,diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
 if(large)value.product_breakdown={schema:'business_product_breakdown_v1',mixed_orders:0,mixed_payment_covered:0,mixed_payment_missing:0,known_mixed_sales_base_raw:'0',known_mixed_expected_repass_raw:'0',known_mixed_ads_adjustment_raw:'0',known_mixed_invoice_tax_raw:'0',products:items.map(item=>({item_id:item.item_id,quantity:1,orders:1,exclusive_orders:1,mixed_orders:0,exclusive_payment_covered:1,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,known_exclusive_sales_base_raw:goods,exclusive_sales_base_raw:goods,known_exclusive_expected_repass_raw:payout,exclusive_expected_repass_raw:payout,known_exclusive_ads_adjustment_raw:'0',exclusive_ads_adjustment_raw:'0',known_exclusive_invoice_tax_raw:tax,exclusive_invoice_tax_raw:tax,items:[{model_id:item.model_id,exclusive_quantity:1,mixed_quantity:0}]}))};
 assert.ok(projectBusinessPeriodFrame(value));return value;
}
class MeteredD1 extends D1{
 constructor(){super();this.calls=0;this.maximum=0;this.before=null;this.breakWrite=false;this.sql=[];}
 prepare(sql){const query=super.prepare(sql),bind=query.bind.bind(query);query.sql=sql;query.bind=(...args)=>{for(const arg of args)if(typeof arg==='string'){this.maximum=Math.max(this.maximum,Buffer.byteLength(arg));if(Buffer.byteLength(arg)>1048576)throw Error('D1_VALUE_LIMIT');}return bind(...args);};return query;}
 async batch(statements){this.calls++;this.sql.push(statements.map(row=>row.sql));if(this.before){const callback=this.before;this.before=null;callback();}if(this.breakWrite){this.breakWrite=false;return super.batch([statements[0],{async run(){throw Error('SIMULATED_FAILURE');}},...statements.slice(1)]);}return super.batch(statements);}
}
async function fixture(t){const db=new MeteredD1();t.after(()=>db.db.close());await db.batch(['CREATE TABLE business_month_runs(month TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL)',...BUSINESS_MONTH_PUBLICATION_SCHEMA].map(sql=>db.prepare(sql)));db.calls=0;db.sql=[];return {ADMIN_DB:db};}
function active(env,{revision=3,end='31',large=false,status='COMPLETE',checked_at=stamp,offset=0}={}){
 const slots=Array.from({length:Math.ceil(Number(end)/15)},(_,index)=>{const start_date=month+'-'+String(index*15+1).padStart(2,'0'),end_date=month+'-'+String(Math.min(Number(end),index*15+15)).padStart(2,'0');return {start_date,end_date,frame:frame(start_date,end_date,index+1+offset,{large,status,checked_at})};}),payload={start_date:month+'-01',end_date:month+'-'+end,slots},storedPayload={...payload,slots:slots.map(slot=>({...slot,frame:{schema:'business_month_frame_ref_v1',run_id:slot.frame.run_id,revision:slot.frame.revision}}))},row={revision,payload:JSON.stringify(storedPayload),created_at:stamp-2000,updated_at:stamp};
 env.ADMIN_DB.db.prepare('INSERT OR REPLACE INTO business_month_runs VALUES(?,?,?,?,?)').run(month,revision,row.payload,row.created_at,row.updated_at);return {row,storedPayload,payload,complete:status==='COMPLETE'};
}
const stored=env=>({header:env.ADMIN_DB.db.prepare('SELECT * FROM business_month_publications').all(),frames:env.ADMIN_DB.db.prepare('SELECT * FROM business_month_publication_frames ORDER BY slot_index').all()});

test('a completed publication survives replacement/deletion of active slots and keeps source timestamps unchanged using one RPC per operation',async t=>{
 const env=await fixture(t),observed=active(env,{checked_at:stamp-86400}),saved=await saveCompletedBusinessMonth(env,month,observed,{now});assert.ok(saved);assert.equal(env.ADMIN_DB.calls,1);assert.equal(saved.publication.source_revision,3);assert.equal(saved.payload.slots[0].frame.checked_at,stamp-86400);assert.deepEqual(saved.payload.slots[0].frame.source_checked_at,observed.payload.slots[0].frame.source_checked_at);
 active(env,{revision:4,status:'RUNNING',offset:10});env.ADMIN_DB.db.exec('DELETE FROM business_month_runs');const value=await readCompletedBusinessMonth(env,month,{now});assert.equal(env.ADMIN_DB.calls,2);assert.equal(value.complete,true);assert.deepEqual(value.payload,observed.payload);assert.equal(value.publication.published_at,stamp);assert.ok(env.ADMIN_DB.sql.at(-1).every(sql=>!sql.includes('business_month_runs')&&!sql.includes('business_month_frames')));
 const rows=stored(env);assert.ok(rows.header[0].payload.length<1024);assert.equal(rows.frames.length,3);assert.doesNotMatch(JSON.stringify(rows),/production_cost|net_estimate|costs_revision|external_expenses|monthly_das|ads_calendar/);
});

test('CAS losers and lower revisions cannot replace an existing publication, while a later completed run replaces all copies atomically',async t=>{
 const env=await fixture(t),first=active(env);await saveCompletedBusinessMonth(env,month,first,{now});const before=stored(env),second=active(env,{revision:4,offset:10});env.ADMIN_DB.before=()=>active(env,{revision:5,status:'RUNNING',offset:20});assert.equal(await saveCompletedBusinessMonth(env,month,second,{now}),null);assert.deepEqual(stored(env),before);
 active(env,{revision:2});assert.equal(await saveCompletedBusinessMonth(env,month,{...first,row:{...first.row,revision:2}},{now}),null);assert.deepEqual(stored(env),before);
 const latest=active(env,{revision:6,offset:30});assert.ok(await saveCompletedBusinessMonth(env,month,latest,{now}));const result=await readCompletedBusinessMonth(env,month,{now});assert.equal(result.row.revision,6);assert.deepEqual(result.payload,latest.payload);assert.ok(stored(env).frames.every(row=>row.write_token===stored(env).header[0].write_token));
});

test('a mid-batch failure rolls back both publication header and frame copies',async t=>{
 const env=await fixture(t);await saveCompletedBusinessMonth(env,month,active(env),{now});const before=stored(env),next=active(env,{revision:4,offset:10});env.ADMIN_DB.breakWrite=true;await assert.rejects(saveCompletedBusinessMonth(env,month,next,{now}),/SIMULATED_FAILURE/);assert.deepEqual(stored(env),before);assert.equal((await readCompletedBusinessMonth(env,month,{now})).row.revision,3);
});

test('three thousand-product windows are copied to three bounded values rather than one oversized parent or price cache',async t=>{
 const env=await fixture(t),observed=active(env,{large:true});assert.ok(Buffer.byteLength(JSON.stringify(observed.payload))>2097152);await saveCompletedBusinessMonth(env,month,observed,{now});assert.equal(env.ADMIN_DB.calls,1);assert.ok(env.ADMIN_DB.maximum<=1048576);const rows=stored(env);assert.equal(rows.frames.length,3);assert.ok(rows.frames.every(row=>Buffer.byteLength(row.payload)<=1048576));assert.ok(Buffer.byteLength(rows.header[0].payload)<1024);const result=await readCompletedBusinessMonth(env,month,{now});assert.equal(result.payload.slots.reduce((sum,slot)=>sum+slot.frame.coverage.paid,0),3000);assert.deepEqual(result.payload,observed.payload);
 assert.throws(()=>env.ADMIN_DB.db.prepare('UPDATE business_month_publication_frames SET payload=? WHERE slot_index=0').run('x'.repeat(1048577)),/CHECK constraint failed/);
});

test('only complete correctly scoped frames publish; stale source age and a previous local-day scope remain readable',async t=>{
 const env=await fixture(t),valid=active(env,{end:'25'});for(const mutate of [row=>row.complete=false,row=>row.payload.slots[0].frame.status='RUNNING',row=>row.payload.slots[0].frame.currency='USD',row=>row.payload.slots[1].frame.run_id=row.payload.slots[0].frame.run_id,row=>row.payload.slots[0].end_date=month+'-14',row=>row.payload.slots[0].frame.checked_at=stamp+61,row=>row.payload.slots[0].frame.private_token='PRIVATE',row=>row.payload.slots[0].frame.source_checked_at.oldest_at=0]){const bad=structuredClone(valid);mutate(bad);assert.equal(await saveCompletedBusinessMonth(env,month,bad,{now}),null);}assert.equal(env.ADMIN_DB.calls,0);
 assert.ok(await saveCompletedBusinessMonth(env,month,valid,{now}));const previous=await readCompletedBusinessMonth(env,month,{now:()=>at+86400000});assert.equal(previous.payload.end_date,'2026-10-25');assert.ok(previous.complete);
 const narrower=active(env,{revision:4,end:'24'});assert.equal(await saveCompletedBusinessMonth(env,month,narrower,{now}),null);assert.equal((await readCompletedBusinessMonth(env,month,{now})).payload.end_date,'2026-10-25');
});

test('corrupted or mixed publication references fail closed without consulting active source rows',async t=>{
 const env=await fixture(t);assert.equal(await readCompletedBusinessMonth(env,month,{now}),null);await saveCompletedBusinessMonth(env,month,active(env),{now});env.ADMIN_DB.db.prepare('UPDATE business_month_publication_frames SET write_token=? WHERE slot_index=0').run(crypto.randomUUID());await assert.rejects(readCompletedBusinessMonth(env,month,{now}),error=>error instanceof BusinessMonthPublicationError&&error.message==='BUSINESS_MONTH_PUBLICATION_STORAGE_INVALID');
});

test('the pure statement builder joins parent completion and before-reset publication without an extra D1 RPC',async t=>{
 const env=await fixture(t),db=env.ADMIN_DB,old=active(env),next=active(env,{revision:4,offset:10});db.db.prepare('UPDATE business_month_runs SET revision=?,payload=? WHERE month=?').run(old.row.revision,old.row.payload,month);
 const statements=completedBusinessMonthPublicationStatements(db,month,next,{now});assert.equal(db.calls,0);assert.equal(statements.length,5);assert.deepEqual(completedBusinessMonthPublicationStatements(db,month,{...next,complete:false},{now}),[]);
 await db.batch([db.prepare('UPDATE business_month_runs SET revision=?,payload=?,updated_at=? WHERE month=? AND revision=? AND payload=?').bind(next.row.revision,next.row.payload,next.row.updated_at,month,old.row.revision,old.row.payload),...statements]);assert.equal(db.calls,1);assert.equal((await readCompletedBusinessMonth(env,month,{now})).row.revision,4);
 const newer=active(env,{revision:5,offset:20}),resetRaw=JSON.stringify({...newer.storedPayload,slots:newer.storedPayload.slots.map(slot=>({...slot,frame:null}))}),beforeReset=completedBusinessMonthPublicationStatements(db,month,newer,{now}),calls=db.calls;
 await db.batch([...beforeReset,db.prepare('UPDATE business_month_runs SET revision=revision+1,payload=? WHERE month=? AND revision=? AND payload=?').bind(resetRaw,month,newer.row.revision,newer.row.payload)]);assert.equal(db.calls,calls+1);const value=await readCompletedBusinessMonth(env,month,{now});assert.equal(value.row.revision,5);assert.deepEqual(value.payload,newer.payload);assert.ok(JSON.parse(db.db.prepare('SELECT payload FROM business_month_runs').get().payload).slots.every(slot=>slot.frame===null));
});
