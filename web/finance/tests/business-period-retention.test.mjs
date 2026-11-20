import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {runFinanceBusinessPeriod} from '../src/business-period.mjs';
import {retainFinanceBusinessPeriodPublication,prepareFinanceBusinessPeriodPublication,confirmFinanceBusinessPeriodPublication,releaseFinanceBusinessPeriodCohort,projectFinanceBusinessPeriodRetentionRequest,projectFinanceBusinessPeriodRetentionFrame,BUSINESS_PERIOD_COHORT_LEASE_SECONDS,BUSINESS_PERIOD_RETENTION_GRACE_SECONDS,BUSINESS_PERIOD_MAX_ACTIVE_COHORT_LEASES,BUSINESS_PERIOD_MAX_PENDING_PUBLICATIONS} from '../src/business-period-retention.mjs';

const error=(suffix,status)=>value=>value.code==='FINANCE_BUSINESS_RETENTION_'+suffix&&value.status===status;
async function fixture(t){
 const db=new D1();t.after(()=>db.db.close());
 const clock={time:Date.parse('2026-11-20T12:00:00Z')},now=()=>clock.time,env={FINANCE_DB:db,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,51).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:'synthetic-retention-signing-key'};
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:'SYNTHETIC_RETENTION_ACCESS',refresh_token:'SYNTHETIC_RETENTION_REFRESH',expires_at:Math.floor(now()/1000)+14400});
 let created=0;const calls=[];
 const fetchImpl=async request=>{
  const url=new URL(request.url);calls.push(url.pathname);let response;
  if(url.pathname==='/api/v2/order/get_order_list'){created=Number(url.searchParams.get('time_from'))+5;response={order_list:[{order_sn:'SYNTHETIC_RETENTION_ORDER'}],more:false,next_cursor:''};}
  else if(url.pathname==='/api/v2/order/get_order_detail')response={order_list:[{order_sn:'SYNTHETIC_RETENTION_ORDER',order_status:'COMPLETED',currency:'BRL',create_time:created,item_list:[{item_id:100,model_id:1,model_quantity_purchased:1}]}]};
  else{assert.equal(url.pathname,'/api/v2/payment/get_escrow_detail');response={order_sn:'SYNTHETIC_RETENTION_ORDER',order_income:{order_sn:'SYNTHETIC_RETENTION_ORDER',original_cost_of_goods_sold:100,escrow_amount:80,ads_escrow_top_up_fee_or_technical_support_fee:0,items:[{item_id:100,model_id:1,quantity_purchased:1}]},return_order_sn_list:[]};}
  return Response.json({error:'',response});
 };
 const run=input=>runFinanceBusinessPeriod(env,{...input,now,fetchImpl}),start=(start_date='2026-11-16',end_date='2026-11-20')=>run({operation:'start',start_date,end_date});
 const complete=async(start_date='2026-09-01',end_date='2026-09-15')=>{const initial=await start(start_date,end_date);return initial.status==='COMPLETE'?initial:run({operation:'step',run_id:initial.run_id});};
 const manifest=(frame,overrides={})=>({kind:'PUBLICATION',month:frame.start_date.slice(0,7),publication_revision:1,slots:[{slot_index:0,run_id:frame.run_id,revision:frame.revision,start_date:frame.start_date,end_date:frame.end_date}],...overrides});
 const prepare=input=>prepareFinanceBusinessPeriodPublication(env,input,{now}),confirm=input=>confirmFinanceBusinessPeriodPublication(env,input,{now}),retain=async input=>{if(input.kind==='COHORT')return retainFinanceBusinessPeriodPublication(env,input,{now});await prepare(input);return confirm(input);},rows=()=>db.db.prepare('SELECT * FROM finance_business_period_retentions ORDER BY month,reference_key').all();
 const privateRows=run_id=>Object.fromEntries(['finance_business_period_runs','finance_business_period_orders','finance_business_order_evidence','finance_financial_order_components','finance_business_period_cursors','finance_business_period_payment_cache'].map(table=>[table,db.db.prepare('SELECT * FROM '+table+' WHERE run_id=? ORDER BY rowid').all(run_id)]));
 const pressure=async()=>{
  const source=db.db.prepare('SELECT run_id FROM finance_business_period_runs LIMIT 1').get();
  for(let i=0;i<60;i++)db.db.prepare("INSERT INTO finance_business_period_runs SELECT ?,partner_id,shop_id,revision,status,start_date,end_date,time_from,time_to,?,checked_at,?,'',0,0,NULL,NULL,NULL FROM finance_business_period_runs WHERE run_id=?").run(randomUUID(),now()/1000-901,now()/1000-901,source.run_id);
  await start('2026-11-16','2026-11-20');
 };
 return {db,clock,now,env,calls,run,start,complete,manifest,prepare,confirm,retain,rows,privateRows,pressure};
}

test('retention manifests are exact, scoped, contiguous bounded windows with no caller-selected tenant',async t=>{
 const f=await fixture(t),frame=await f.complete(),valid=f.manifest(frame);
 assert.deepEqual(projectFinanceBusinessPeriodRetentionRequest(valid),valid);
 for(const invalid of [{...valid,partner_id:999},{...valid,lease_id:null},{...valid,slots:[valid.slots[0],{...valid.slots[0],slot_index:1}]},{...valid,slots:[{...valid.slots[0],start_date:'2026-09-02'}]},{...valid,slots:Array(4).fill(valid.slots[0])},{...valid,kind:'COHORT'},{...valid,publication_revision:0}]){
  assert.equal(projectFinanceBusinessPeriodRetentionRequest(invalid),null);await assert.rejects(f.retain(invalid),error('REQUEST_INVALID',400));
 }
 assert.equal(f.rows().length,0);
});

test('published historical source and every evidence byte survive TTL cleanup and sixty scratch runs',async t=>{
 const f=await fixture(t),frame=await f.complete(),before=f.privateRows(frame.run_id),calls=f.calls.length;
 const result=await f.retain(f.manifest(frame));assert.ok(projectFinanceBusinessPeriodRetentionFrame(result));assert.equal(result.state,'RETAINED');assert.equal(f.calls.length,calls);
 assert.equal(before.finance_business_period_orders.length,1);assert.equal(before.finance_business_order_evidence.length,1);assert.equal(before.finance_financial_order_components.length,1);
 f.clock.time+=31*86400000;await f.start('2026-12-01','2026-12-15');assert.deepEqual(f.privateRows(frame.run_id),before);
 const scratch=f.db.db.prepare("SELECT * FROM finance_business_period_runs WHERE run_id<>?").get(frame.run_id);f.db.db.prepare('DELETE FROM finance_business_period_cursors WHERE run_id=?').run(scratch.run_id);f.db.db.prepare('DELETE FROM finance_business_period_runs WHERE run_id=?').run(scratch.run_id);
 for(let i=0;i<60;i++)f.db.db.prepare("INSERT INTO finance_business_period_runs SELECT ?,partner_id,shop_id,revision,status,start_date,end_date,time_from,time_to,?,checked_at,?,'',0,0,NULL,NULL,NULL FROM finance_business_period_runs WHERE run_id=?").run(randomUUID(),f.now()/1000-901,f.now()/1000-901,frame.run_id);
 await f.start('2026-12-16','2026-12-20');assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM finance_business_period_runs').get().n,61);assert.deepEqual(f.privateRows(frame.run_id),before);assert.equal((await f.run({operation:'read',run_id:frame.run_id,includeDaily:true})).run_id,frame.run_id);assert.equal(f.calls.length,calls);
});

test('unpublished expired sources still delete all private children while a live run lease survives TTL',async t=>{
 const f=await fixture(t),expired=await f.complete('2026-09-01','2026-09-15'),live=await f.complete('2026-10-01','2026-10-15');
 f.clock.time+=31*86400000;f.db.db.prepare('UPDATE finance_business_period_runs SET lease_owner=?,lease_until=? WHERE run_id=?').run('synthetic-live-lease',f.now()/1000+45,live.run_id);
 await f.start('2026-12-01','2026-12-15');for(const rows of Object.values(f.privateRows(expired.run_id)))assert.equal(rows.length,0);assert.equal(f.privateRows(live.run_id).finance_business_period_orders.length,1);
});

test('publication CAS is monotonic and idempotent; replacement has bounded grace and refuses destructive churn',async t=>{
 const f=await fixture(t),first=await f.complete(),one=f.manifest(first);await f.retain(one);const rows=f.rows();
 await f.retain(one);assert.deepEqual(f.rows(),rows);
 await f.retain({...one,publication_revision:2});assert.equal(f.rows().length,1);
 await assert.rejects(f.retain(one),error('CONFLICT',409));
 f.clock.time+=901000;const second=await f.complete();await f.retain(f.manifest(second,{publication_revision:3}));
 assert.equal(f.rows().length,2);assert.equal(f.rows().find(row=>row.kind==='GRACE').expires_at,f.now()/1000+BUSINESS_PERIOD_RETENTION_GRACE_SECONDS);
 await assert.rejects(f.retain({...one,publication_revision:3}),error('CONFLICT',409));
 f.clock.time+=901000;const third=await f.complete();await assert.rejects(f.retain(f.manifest(third,{publication_revision:4})),error('GRACE_BUSY',409));
 assert.equal(JSON.parse(f.rows().find(row=>row.kind==='PUBLICATION').payload)[0].run_id,second.run_id);
 f.clock.time+=BUSINESS_PERIOD_RETENTION_GRACE_SECONDS*1000;await f.retain(f.manifest(third,{publication_revision:4}));assert.equal(f.rows().length,2);
});

test('independent cohort leases protect old references, renew only exact scopes, and release by own token',async t=>{
 const f=await fixture(t),first=await f.complete(),one=f.manifest(first),lease=randomUUID();await f.retain(one);
 const input={...one,kind:'COHORT',lease_id:lease};const held=await f.retain(input);assert.equal(held.expires_at,f.now()/1000+BUSINESS_PERIOD_COHORT_LEASE_SECONDS);
 f.clock.time+=901000;const second=await f.complete(),two=f.manifest(second,{publication_revision:2});await f.retain(two);
 const other={...two,kind:'COHORT',lease_id:randomUUID()};await f.retain(other);await f.retain(input);assert.equal(f.rows().filter(row=>row.kind==='COHORT').length,2);
 await assert.rejects(f.retain({...input,slots:two.slots}),error('LEASE_CONFLICT',409));
 const before=f.rows();const wrong=await releaseFinanceBusinessPeriodCohort(f.env,{month:input.month,lease_id:randomUUID()},{now:f.now});assert.equal(wrong.released,false);assert.deepEqual(f.rows(),before);
 const released=await releaseFinanceBusinessPeriodCohort(f.env,{month:input.month,lease_id:lease},{now:f.now});assert.ok(projectFinanceBusinessPeriodRetentionFrame(released));assert.equal(released.released,true);assert.equal(f.rows().filter(row=>row.kind==='COHORT').length,1);assert.equal(f.rows().find(row=>row.kind==='COHORT').lease_id,other.lease_id);
});

test('cohort concurrency is bounded per month, allows active renewals, and reclaims expired leases',async t=>{
 const f=await fixture(t),frame=await f.complete(),base={...f.manifest(frame),kind:'COHORT'},leases=[];
 for(let index=0;index<BUSINESS_PERIOD_MAX_ACTIVE_COHORT_LEASES;index++){const lease={...base,lease_id:randomUUID()};leases.push(lease);await f.retain(lease);}
 const overflow={...base,lease_id:randomUUID()};await assert.rejects(f.retain(overflow),error('LEASE_LIMIT',409));await f.retain(leases[0]);assert.equal(f.rows().length,BUSINESS_PERIOD_MAX_ACTIVE_COHORT_LEASES);
 f.clock.time+=(BUSINESS_PERIOD_COHORT_LEASE_SECONDS+1)*1000;await f.retain(overflow);assert.equal(f.rows().length,1);assert.equal(f.rows()[0].lease_id,overflow.lease_id);
});

test('a renewed older cohort remains protected after publication grace, then releases only its own obsolete source',async t=>{
 const f=await fixture(t),first=await f.complete(),one=f.manifest(first);await f.retain(one);const lease={...one,kind:'COHORT',lease_id:randomUUID()};await f.retain(lease);
 f.clock.time+=901000;const second=await f.complete();await f.retain(f.manifest(second,{publication_revision:2}));
 f.clock.time+=31*86400000;await f.retain(lease);await f.start('2026-11-16','2026-11-20');assert.equal(f.privateRows(first.run_id).finance_business_period_orders.length,1);assert.equal(f.privateRows(second.run_id).finance_business_period_orders.length,1);
 await releaseFinanceBusinessPeriodCohort(f.env,{month:lease.month,lease_id:lease.lease_id},{now:f.now});await f.start('2026-11-01','2026-11-15');for(const rows of Object.values(f.privateRows(first.run_id)))assert.equal(rows.length,0);assert.equal(f.privateRows(second.run_id).finance_business_period_orders.length,1);
});

test('publication retention has no arbitrary twelve-month history cutoff',async t=>{
 const f=await fixture(t);
 for(let index=0;index<13;index++){const date=new Date(Date.UTC(2025,index,1)),month=date.toISOString().slice(0,7),frame=await f.complete(month+'-01',month+'-15');await f.retain(f.manifest(frame));}
 assert.equal(f.rows().filter(row=>row.kind==='PUBLICATION').length,13);
});

test('a higher publication revision cannot replace a longer saved calendar with a shorter prefix',async t=>{
 const f=await fixture(t),original=await f.complete();await f.retain(f.manifest(original));const before=f.rows(),shorter=await f.complete('2026-09-01','2026-09-14');
 await assert.rejects(f.retain(f.manifest(shorter,{publication_revision:2})),error('SOURCE_MISMATCH',409));assert.deepEqual(f.rows(),before);
});

test('missing, foreign-tenant, running and changed revisions cannot create or falsely acknowledge a pin',async t=>{
 const f=await fixture(t),frame=await f.complete(),input=f.manifest(frame);await assert.rejects(f.retain({...input,slots:[{...input.slots[0],revision:frame.revision+1}]}),error('SOURCE_MISMATCH',409));
 f.db.db.prepare('UPDATE finance_business_period_runs SET partner_id=999 WHERE run_id=?').run(frame.run_id);await assert.rejects(f.retain(input),error('RUN_NOT_FOUND',404));f.db.db.prepare('UPDATE finance_business_period_runs SET partner_id=2049333 WHERE run_id=?').run(frame.run_id);
 f.db.db.prepare("UPDATE finance_business_period_runs SET status='RUNNING' WHERE run_id=?").run(frame.run_id);await assert.rejects(f.retain(input),error('SOURCE_MISMATCH',409));f.db.db.prepare("UPDATE finance_business_period_runs SET status='COMPLETE' WHERE run_id=?").run(frame.run_id);
 await f.retain(input);f.db.db.prepare('DELETE FROM finance_business_period_runs WHERE run_id=?').run(frame.run_id);await assert.rejects(f.retain(input),error('RUN_NOT_FOUND',404));
});

test('lost publication CAS cannot move pins or create an orphan grace manifest',async t=>{
 const f=await fixture(t),first=await f.complete();await f.retain(f.manifest(first));f.clock.time+=901000;const second=await f.complete(),prepare=f.db.prepare.bind(f.db),batch=f.db.batch.bind(f.db);let injected=false;
 f.db.prepare=sql=>{const statement=prepare(sql);statement.sql=sql;return statement;};
 f.db.batch=async statements=>{if(!injected&&statements.some(statement=>statement.sql.startsWith('INSERT INTO finance_business_period_retentions'))){injected=true;f.db.db.prepare("UPDATE finance_business_period_retentions SET publication_revision=4,write_token=? WHERE kind='PUBLICATION'").run(randomUUID());}return batch(statements);};
 await assert.rejects(f.retain(f.manifest(second,{publication_revision:3})),error('CONFLICT',409));assert.equal(injected,true);assert.equal(f.rows().length,1);assert.equal(f.rows()[0].publication_revision,4);assert.equal(JSON.parse(f.rows()[0].payload)[0].run_id,first.run_id);
});

test('a failing confirmation rolls back predecessor grace and preserves current and prepared publications',async t=>{
 const f=await fixture(t),first=await f.complete();await f.retain(f.manifest(first));const before=f.rows();f.clock.time+=901000;const second=await f.complete(),prepare=f.db.prepare.bind(f.db),batch=f.db.batch.bind(f.db);let injected=false;
 f.db.prepare=sql=>{const statement=prepare(sql);statement.sql=sql;return statement;};
 f.db.batch=async statements=>{if(!injected&&statements.length===3&&statements.slice(0,2).every(statement=>statement.sql.startsWith('INSERT INTO finance_business_period_retentions'))){injected=true;statements[1].run=async()=>{throw Error('synthetic pin storage failure');};}return batch(statements);};
 await assert.rejects(f.retain(f.manifest(second,{publication_revision:2})),error('STORAGE_UNAVAILABLE',503));assert.equal(injected,true);assert.deepEqual(f.rows().filter(row=>row.kind==='PUBLICATION'),before);assert.equal(f.rows().filter(row=>row.kind==='GRACE').length,0);assert.equal(f.rows().filter(row=>row.kind==='PENDING').length,1);
});

test('read-only period retrieval neither pins nor renews or deletes a retention manifest',async t=>{
 const f=await fixture(t),frame=await f.complete();await f.retain(f.manifest(frame));const before=f.rows(),prepare=f.db.prepare.bind(f.db),queries=[];
 f.db.prepare=sql=>{queries.push(sql);return prepare(sql);};f.clock.time+=1000;await f.run({operation:'read',run_id:frame.run_id});assert.deepEqual(f.rows(),before);assert.equal(queries.some(sql=>/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(sql)&&sql.includes('finance_business_period_retentions')),false);
});

test('corrupt stored cohort and predecessor manifests fail closed rather than bypassing validation',async t=>{
 const f=await fixture(t),frame=await f.complete(),input={...f.manifest(frame),kind:'COHORT',lease_id:randomUUID()};await f.retain(input);
 f.db.db.prepare("UPDATE finance_business_period_retentions SET payload='[{}]' WHERE kind='COHORT'").run();await assert.rejects(f.retain(f.manifest(frame)),error('STORAGE_INVALID',503));
});

test('prepare is durable without replacing the actual publication after a crash before App CAS',async t=>{
 const f=await fixture(t),first=await f.complete(),one=f.manifest(first);await f.retain(one);const firstRows=f.privateRows(first.run_id);
 f.clock.time+=901000;const second=await f.complete(),two=f.manifest(second,{publication_revision:2}),secondRows=f.privateRows(second.run_id),result=await f.prepare(two);
 assert.ok(projectFinanceBusinessPeriodRetentionFrame(result));assert.equal(result.state,'PREPARED');assert.equal(result.expires_at,null);
 assert.equal(JSON.parse(f.rows().find(row=>row.kind==='PUBLICATION').payload)[0].run_id,first.run_id);
 f.clock.time+=31*86400000;await f.pressure();assert.deepEqual(f.privateRows(first.run_id),firstRows);assert.deepEqual(f.privateRows(second.run_id),secondRows);
 assert.equal(f.rows().find(row=>row.kind==='PENDING').expires_at,null);assert.equal((await retainFinanceBusinessPeriodPublication(f.env,two,{now:f.now})).state,'PREPARED');
});

test('durable App outbox reconciles a crash after App CAS and confirmation clears only acknowledged reservations',async t=>{
 const f=await fixture(t),app=new D1();t.after(()=>app.db.close());app.db.exec('CREATE TABLE publication_outbox(month TEXT PRIMARY KEY,payload TEXT NOT NULL)');
 const first=await f.complete();await f.retain(f.manifest(first));f.clock.time+=901000;const second=await f.complete(),two=f.manifest(second,{publication_revision:2});await f.prepare(two);
 // The App CAS committed, then execution stopped before the Finance confirm.
 app.db.prepare('INSERT INTO publication_outbox VALUES(?,?)').run(two.month,JSON.stringify(two));
 f.clock.time+=901000;const third=await f.complete(),three=f.manifest(third,{publication_revision:3});await f.prepare(three);
 f.clock.time+=31*86400000;await f.pressure();assert.equal(f.privateRows(second.run_id).finance_business_period_orders.length,1);
 const actual=JSON.parse(app.db.prepare('SELECT payload FROM publication_outbox WHERE month=?').get(two.month).payload),confirmed=await f.confirm(actual);assert.equal(confirmed.state,'RETAINED');assert.equal(f.rows().find(row=>row.kind==='PUBLICATION').publication_revision,2);
 assert.deepEqual(f.rows().filter(row=>row.kind==='PENDING').map(row=>row.publication_revision),[3]);assert.equal(f.privateRows(first.run_id).finance_business_period_orders.length,1);
});

test('failed App CAS leaves the old publication protected until the next actual publication is confirmed',async t=>{
 const f=await fixture(t),first=await f.complete();await f.retain(f.manifest(first));f.clock.time+=901000;
 const second=await f.complete(),two=f.manifest(second,{publication_revision:2});await f.prepare(two);f.clock.time+=901000;const third=await f.complete(),three=f.manifest(third,{publication_revision:3});await f.prepare(three);
 // Both candidates lost their App CAS. Neither preparation can move current.
 f.clock.time+=31*86400000;await f.pressure();assert.equal(JSON.parse(f.rows().find(row=>row.kind==='PUBLICATION').payload)[0].run_id,first.run_id);assert.equal(f.privateRows(first.run_id).finance_business_period_orders.length,1);assert.equal(f.rows().filter(row=>row.kind==='PENDING').length,2);
 // A later successful App CAS/outbox read authorizes this exact confirmation.
 await f.confirm(three);assert.equal(f.rows().find(row=>row.kind==='PUBLICATION').publication_revision,3);assert.equal(f.rows().filter(row=>row.kind==='PENDING').length,0);assert.equal(f.privateRows(first.run_id).finance_business_period_orders.length,1);
});

test('pending publication budget fails closed without expiring reservations and confirms only a prepared exact manifest',async t=>{
 const f=await fixture(t),frame=await f.complete(),base=f.manifest(frame);await assert.rejects(f.confirm(base),error('NOT_PREPARED',409));
 for(let index=1;index<=BUSINESS_PERIOD_MAX_PENDING_PUBLICATIONS;index++)await f.prepare({...base,publication_revision:index});
 const before=f.rows();await assert.rejects(f.prepare({...base,publication_revision:BUSINESS_PERIOD_MAX_PENDING_PUBLICATIONS+1}),error('PENDING_LIMIT',409));assert.deepEqual(f.rows(),before);assert.equal(before.every(row=>row.expires_at===null),true);
 await f.confirm({...base,publication_revision:BUSINESS_PERIOD_MAX_PENDING_PUBLICATIONS});assert.equal(f.rows().length,1);assert.equal(f.rows()[0].kind,'PUBLICATION');assert.equal(f.rows()[0].publication_revision,BUSINESS_PERIOD_MAX_PENDING_PUBLICATIONS);
});
