import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {readIncurredProduction,mutateIncurredProduction} from '../src/incurred-production.mjs';
import {readProductionWeeklyClosingWorkspace,mutateProductionWeeklyClosingWorkspace,runProductionWeeklyClosing} from '../src/production-weekly-store.mjs';
import {weeklyProductionFixture} from './production-weekly-browser-fixture.mjs';

const identity={artwork:'QA sintética',color:'Azul',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null};
function fixture(at='2026-10-25T15:00:00Z'){
 const env={ADMIN_DB:new D1()};let stamp=Date.parse(at),ordinal=0;const now=()=>stamp;
 const read=(month='2026-10')=>readProductionWeeklyClosingWorkspace(env,{month},{now});
 const mutate=body=>mutateProductionWeeklyClosingWorkspace(env,body,'synthetic-owner',{now});
 async function record(date,quantity=1,amount=1590){const current=await readIncurredProduction(env,{now}),id=crypto.randomUUID();await mutateIncurredProduction(env,{revision:current.revision,request_id:crypto.randomUUID(),action:'record',record_id:id,production_ref:'QA '+(++ordinal),replaces_record_id:null,produced_date:date,quantity,identity:{...identity},source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:amount,reference:null},evidence:'Somente fatos sintéticos de fabricação',confirmed:true},'synthetic-owner',{now});return id;}
 async function body(id,before,after){const view=await read(),row=view.boundary_records.find(row=>row.record_id===id);assert.ok(row);return {action:'assign_boundary',month:'2026-10',request_id:crypto.randomUUID(),revision:view.revision,ledger_revision:view.source.ledger_revision,record_id:id,record_hash:row.record_hash,before13_quantity:before,at_or_after13_quantity:after,confirmed:true,reason:'Confirmação sintética da divisão do lote'};}
 return {env,now,read,mutate,record,body,set(value){stamp=Date.parse(value);},run:()=>runProductionWeeklyClosing(env,{now}),close:()=>env.ADMIN_DB.db.close()};
}
const week=(value,end)=>value.weeks.find(row=>row.end_date===end);
const rows=(f,sql)=>f.env.ADMIN_DB.db.prepare(sql).all();

test('cold GET is read-only and historic absence never becomes a zero expense',async()=>{
 const f=fixture();try{const before=rows(f,"SELECT name FROM sqlite_master WHERE type='table'"),view=await f.read();assert.deepEqual(rows(f,"SELECT name FROM sqlite_master WHERE type='table'"),before);assert.equal(view.revision,0);assert.equal(view.source.ledger_revision,0);assert.ok(view.weeks.length>0);for(const row of view.weeks){assert.equal(row.original,null);assert.equal(row.current.status,row.current.period_end_at>view.checked_at?'OPEN':'NO_RECORDS');assert.equal(row.current.total_cost_cents,null);assert.equal(row.current.capture_kind,row.current.status==='OPEN'?'LIVE_PREVIEW':'RETROSPECTIVE');}}finally{f.close();}
});

test('clock-only off-slots perform zero database or provider work and Friday13h is eligible',async()=>{
 let touched=0;const env={get ADMIN_DB(){touched++;throw Error('must remain untouched');},get ADS(){throw Error('provider unavailable');}};
 const skip=await runProductionWeeklyClosing(env,{now:()=>Date.parse('2026-10-23T16:01:00Z')});assert.equal(skip.status,'NOT_DUE');assert.equal(skip.worked,false);assert.equal(touched,0);
 const f=fixture('2026-10-23T16:00:00Z');try{const result=await f.run();assert.equal(result.worked,true);assert.equal(result.reports_written,2);assert.equal(rows(f,"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'incurred_production_%'").length,0);}finally{f.close();}
});

test('scheduled snapshots are bounded, idempotent, retrospective and never manufacture physical schema',async()=>{
 const f=fixture();try{for(let i=0;i<7;i++){const result=await f.run();assert.equal(result.worked,true);assert.ok(result.reports_written<=2);}const values=rows(f,'SELECT payload FROM production_weekly_reports').map(row=>JSON.parse(row.payload));assert.equal(values.length,12);assert.ok(values.every(row=>row.report_version===1&&row.capture_kind==='RETROSPECTIVE'&&row.status==='NO_RECORDS'&&row.total_cost_cents===null));assert.equal(rows(f,"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'incurred_production_%'").length,0);const state=rows(f,'SELECT activated_at,last_tick_at,last_success_at FROM production_weekly_state')[0];assert.equal(state.last_tick_at,f.now()/1000);assert.equal(state.last_success_at,state.last_tick_at);}finally{f.close();}
});

test('reserved weekly maintenance stays under the existing50subrequest ceiling without provider access',async()=>{
 const f=fixture();try{await f.record('2026-10-20',2,1250);await f.record('2026-10-23',4,null);let statements=0,providers=0;const prepare=f.env.ADMIN_DB.prepare.bind(f.env.ADMIN_DB);f.env.ADMIN_DB.prepare=sql=>{statements++;return prepare(sql);};Object.defineProperty(f.env,'FINANCE',{get(){providers++;throw Error('not a weekly source');}});const result=await f.run();assert.equal(result.worked,true);assert.ok(result.reports_written<=2);assert.ok(statements<=50,'weekly lane must fit the unchanged total budget: '+statements);assert.equal(providers,0);}finally{f.close();}
});

test('boundary confirmations conserve quantities, require source CAS and retry without duplicating declarations',async()=>{
 const f=fixture('2026-10-23T15:00:00Z');try{const id=await f.record('2026-10-23',4,1250);f.set('2026-10-25T15:00:00Z');const physical=JSON.stringify(await readIncurredProduction(f.env,{now:f.now})),body=await f.body(id,1,3),first=await f.mutate(body);assert.equal(first.revision,1);assert.equal(week(first,'2026-10-23').current.total_cost_cents,1250);assert.equal(week(first,'2026-10-30').current.known_cost_cents,3750);assert.equal(JSON.stringify(await readIncurredProduction(f.env,{now:f.now})),physical);await f.record('2026-10-24',1,1000);const replay=await f.mutate(body);assert.equal(replay.revision,1);assert.equal(rows(f,'SELECT COUNT(*) AS n FROM production_weekly_audit')[0].n,1);await assert.rejects(f.mutate({...body,request_id:crypto.randomUUID()}),error=>error.status===409);await assert.rejects(f.mutate({...body,revision:1,request_id:crypto.randomUUID(),ledger_revision:0}),error=>error.message==='PRODUCTION_WEEKLY_SOURCE_CHANGED');const second=await f.mutate(await f.body(id,1,3));assert.equal(second.revision,2);}finally{f.close();}
});

test('invalid partitions and unconfirmed or accessor requests do not create timing facts',async()=>{
 const f=fixture();try{const id=await f.record('2026-10-23',4),body=await f.body(id,1,3);for(const patch of [{confirmed:false},{reason:'\u0000'},{before13_quantity:-1},{before13_quantity:1.5}])await assert.rejects(f.mutate({...body,...patch}),error=>error.status===400);await assert.rejects(f.mutate({...body,before13_quantity:2}),error=>error.status===409);let getter=0;const forged={...body};Object.defineProperty(forged,'reason',{get(){getter++;return 'forged';},enumerable:true});await assert.rejects(f.mutate(forged),error=>error.status===400);assert.equal(getter,0);const view=await f.read();assert.equal(view.revision,0);assert.equal(view.boundary_records[0].assignment_status,'PENDING');}finally{f.close();}
});

test('a simultaneous physical revision defeats the timing CAS without partial sidecar writes',async()=>{
 const f=fixture();try{const id=await f.record('2026-10-23',2),body=await f.body(id,1,1),db=f.env.ADMIN_DB,prepare=db.prepare.bind(db),batch=db.batch.bind(db),sql=new WeakMap();let armed=true;
  db.prepare=query=>{const statement=prepare(query);sql.set(statement,query);return statement;};db.batch=async statements=>{if(armed&&statements.some(value=>sql.get(value)?.startsWith('UPDATE production_weekly_state SET revision'))){armed=false;await f.record('2026-10-24',1,0);}return batch(statements);};
  await assert.rejects(f.mutate(body),error=>error.status===409);assert.equal((await f.read()).revision,0);assert.equal(rows(f,'SELECT COUNT(*) AS n FROM production_weekly_assignments')[0].n,0);assert.equal(rows(f,'SELECT COUNT(*) AS n FROM production_weekly_audit')[0].n,0);
 }finally{f.close();}
});

test('atomic guard rolls back state, partition and audit when any statement is lost',async()=>{
 const f=fixture();try{const id=await f.record('2026-10-23',2),body=await f.body(id,1,1),db=f.env.ADMIN_DB,prepare=db.prepare.bind(db);let armed=true;
  db.prepare=query=>armed&&query.startsWith('INSERT INTO production_weekly_audit')?(armed=false,prepare('SELECT 0 AS dropped_audit')):prepare(query);
  await assert.rejects(f.mutate(body),error=>error.status===503);assert.equal((await f.read()).revision,0);assert.equal(rows(f,'SELECT COUNT(*) AS n FROM production_weekly_assignments')[0].n,0);assert.equal(rows(f,'SELECT COUNT(*) AS n FROM production_weekly_audit')[0].n,0);
 }finally{f.close();}
});

test('late physical and timing corrections preserve original close and record an auditable restatement',async()=>{
 const f=await weeklyProductionFixture();try{const view=f.initial,row=view.boundary_records.find(row=>row.record_id===f.pending),physical=await f.snapshot();await f.mutate({action:'assign_boundary',month:'2026-10',request_id:crypto.randomUUID(),revision:view.revision,ledger_revision:view.source.ledger_revision,record_id:row.record_id,record_hash:row.record_hash,before13_quantity:2,at_or_after13_quantity:1,confirmed:true,reason:'Divisão real confirmada exclusivamente no ambiente sintético'});const settled=await f.settle(),closed=week(settled,'2026-10-23');assert.equal(JSON.stringify(closed.original),JSON.stringify(f.original));assert.equal(closed.latest.total_cost_cents,8400);assert.equal(closed.delta_cents,-600);assert.equal(closed.latest.capture_kind,'RESTATEMENT');assert.equal(closed.needs_restatement,false);assert.equal(week(settled,'2026-10-30').current.known_cost_cents,2700);assert.equal(await f.snapshot(),physical);}finally{f.close();}
});

test('changing only another week does not restate an unchanged close',async()=>{
 const f=fixture();try{await f.record('2026-10-20',2,1590);await f.run();const first=week(await f.read(),'2026-10-23').original;await f.record('2026-10-24',1,999);await f.run();const current=week(await f.read(),'2026-10-23');assert.equal(current.versions_count,1);assert.equal(JSON.stringify(current.original),JSON.stringify(first));assert.equal(current.current.content_hash,first.content_hash);}finally{f.close();}
});

test('a concurrent source mutation prevents publishing a stale weekly artifact',async()=>{
 const f=fixture();try{const db=f.env.ADMIN_DB,prepare=db.prepare.bind(db);let armed=true;db.prepare=query=>{const statement=prepare(query);if(query.startsWith('INSERT OR IGNORE INTO production_weekly_reports')){const run=statement.run.bind(statement);statement.run=async()=>{if(armed){armed=false;await f.record('2026-10-20',1,2222);}return run();};}return statement;};const raced=await f.run();assert.equal(raced.status,'SOURCE_CHANGED');assert.equal(raced.reports_written,0);assert.equal(rows(f,'SELECT COUNT(*) AS n FROM production_weekly_reports')[0].n,0);await f.run();assert.equal(week(await f.read(),'2026-10-23').latest.total_cost_cents,2222);}finally{f.close();}
});

test('overlapping cron invocations cannot publish duplicate versions',async()=>{
 const f=fixture();try{await f.record('2026-10-20',1,1250);const db=f.env.ADMIN_DB,prepare=db.prepare.bind(db);let armed=true;db.prepare=query=>{const statement=prepare(query);if(query.startsWith('INSERT OR IGNORE INTO production_weekly_reports')){const run=statement.run.bind(statement);statement.run=async()=>{if(armed){armed=false;await f.run();}return run();};}return statement;};await f.run();const view=await f.read();assert.equal(week(view,'2026-10-23').versions_count,1);assert.equal(rows(f,"SELECT COUNT(*) AS n FROM production_weekly_reports WHERE week_end_date='2026-10-23'")[0].n,1);}finally{f.close();}
});

test('tampered saved report payload fails closed instead of silently replacing history',async()=>{
 const f=fixture();try{await f.run();f.env.ADMIN_DB.db.exec("UPDATE production_weekly_reports SET payload=replace(payload,'NO_RECORDS','RECORDED_COSTS')");await assert.rejects(f.read(),error=>error.message==='PRODUCTION_WEEKLY_STORAGE_INVALID');}finally{f.close();}
});

test('request-id collisions and missing or extra stored timing fields are rejected',async()=>{
 for(const alteration of ['missing','extra']){
  const f=fixture();try{const id=await f.record('2026-10-23',2),body=await f.body(id,1,1);await f.mutate(body);await assert.rejects(f.mutate({...body,reason:'Different payload under the same request id'}),error=>error.message==='PRODUCTION_WEEKLY_CONFLICT');const value=JSON.parse(rows(f,'SELECT payload FROM production_weekly_assignments')[0].payload);if(alteration==='missing')delete value.record_hash;else value.unapproved=true;f.env.ADMIN_DB.db.prepare('UPDATE production_weekly_assignments SET payload=?').run(JSON.stringify(value));await assert.rejects(f.read(),error=>error.message==='PRODUCTION_WEEKLY_STORAGE_INVALID');}finally{f.close();}
 }
});
