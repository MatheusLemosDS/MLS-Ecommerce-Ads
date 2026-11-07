import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {coverageBrowserFixture,coverageClock} from './coverage-browser-fixture.mjs';
import {readProductionCoverageWorkspace,mutateProductionCoverageWorkspace,projectProductionCoverageWorkspace} from '../src/production-coverage.mjs';

const cmd=(frame,row,mode=row.recorded.quantity?'ALL_RECORDED':'NO_MANUFACTURING',extra={})=>({action:'confirm',week_end:frame.week_end,interval_key:row.key,source_hash:row.source_hash,revision:frame.revision,ledger_revision:frame.source.ledger_revision,timing_revision:frame.source.timing_revision,request_id:crypto.randomUUID(),mode,reason:'Conferência de todos os lotes exclusivamente sintéticos',confirmed:true,...extra});
async function all(f,end){let frame=await f.read({week_end:end});for(let n=0;n<8;n++){const r=frame.intervals[n];frame=await f.mutate(cmd(frame,r));}return frame;}
const rejects=(promise,code,status=409)=>assert.rejects(promise,e=>e.message==='PRODUCTION_COVERAGE_'+code&&e.status===status);

test('cold manufacturing coverage is SELECT-only, closed and never promotes empty saved sources into zero',async t=>{
 const db=new D1(),env={ADMIN_DB:db},sql=[],prepare=db.prepare.bind(db);t.after(()=>db.db.close());db.prepare=s=>{sql.push(s);return prepare(s);};
 const frame=await readProductionCoverageWorkspace(env,{week_end:'2026-10-23'},{now:()=>coverageClock});assert.equal(frame.revision,0);assert.equal(frame.summary.total_cost_cents,null);assert.equal(frame.summary.state,'PENDING');assert.equal(frame.intervals.length,8);assert.ok(frame.intervals.every(r=>r.state==='UNCONFIRMED'&&r.attestation===null));assert.ok(sql.every(s=>/^SELECT\b/.test(s)));assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n,0);
 let reads=0;const bad={};Object.defineProperty(bad,'week_end',{get(){reads++;throw Error('PRIVATE');}});await rejects(readProductionCoverageWorkspace(env,bad,{now:()=>coverageClock}),'REQUEST_INVALID',400);assert.equal(reads,0);
 const body=cmd(frame,frame.intervals[0],null,{action:'revoke'});await rejects(mutateProductionCoverageWorkspace(env,body,'synthetic-owner',{now:()=>coverageClock}),'ATTESTATION_UNAVAILABLE');assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n,0);
});

test('eight explicit interval confirmations complete the known manufacture week without changing any legacy fact',async t=>{
 const f=await coverageBrowserFixture();t.after(()=>f.close());const legacy=f.legacyCanonical(),ledger=await f.snapshot(),weekly=JSON.stringify(await f.readWeekly());let frame=await f.read({week_end:f.expected.closed_week});assert.equal(frame.summary.known_cost_cents,9000);assert.equal(frame.summary.total_cost_cents,null);
 const populated=frame.intervals.find(r=>r.recorded.quantity>0),empty=frame.intervals.find(r=>!r.recorded.quantity);await rejects(f.mutate(cmd(frame,populated,'NO_MANUFACTURING')),'MODE_INVALID');await rejects(f.mutate(cmd(frame,empty,'ALL_RECORDED')),'MODE_INVALID');
 frame=await all(f,frame.week_end);assert.equal(frame.summary.state,'CONFIRMED');assert.equal(frame.summary.confirmed_intervals,8);assert.equal(frame.summary.total_cost_cents,9000);assert.equal(frame.summary.recorded_quantity,8);assert.equal(frame.revision,8);assert.equal(f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM production_coverage_audit').get().n,8);assert.equal(f.legacyCanonical(),legacy);assert.equal(await f.snapshot(),ledger);assert.equal(JSON.stringify(await f.readWeekly()),weekly);
});

test('zero manufacture requires eight deliberate declarations and withdrawal preserves the old audited declaration',async t=>{
 const f=await coverageBrowserFixture();t.after(()=>f.close());let frame=await all(f,f.expected.empty_week);assert.equal(frame.summary.state,'CONFIRMED');assert.equal(frame.summary.total_cost_cents,0);assert.equal(frame.summary.recorded_quantity,0);
 const old=structuredClone(frame.intervals[3].attestation),body=cmd(frame,frame.intervals[3],null,{action:'revoke',reason:'Retirada explícita da declaração sintética incorreta'});frame=await f.mutate(body);assert.equal(frame.intervals[3].state,'REVOKED');assert.equal(frame.intervals[3].can_revoke,false);assert.equal(frame.summary.total_cost_cents,null);assert.equal(frame.revision,9);const audit=JSON.parse(f.env.ADMIN_DB.db.prepare('SELECT payload FROM production_coverage_audit WHERE request_id=?').get(body.request_id).payload);assert.deepEqual(audit.previous,old);assert.equal(audit.new_attestation.revoked_at,Math.floor(f.now()/1000));
 frame=await f.mutate(cmd(frame,frame.intervals[3]));assert.equal(frame.summary.total_cost_cents,0);assert.equal(frame.revision,10);
});

test('committed confirmation retries remain idempotent after source changes, while reusing its ID for another command conflicts',async t=>{
 const f=await coverageBrowserFixture();t.after(()=>f.close());let frame=await f.read({week_end:f.expected.closed_week});const row=frame.intervals[1],body=cmd(frame,row);frame=await f.mutate(body);assert.equal(frame.revision,1);await f.record(row.date,1,100);frame=await f.mutate(body);assert.equal(frame.revision,1);assert.equal(frame.intervals[1].state,'STALE');assert.equal(f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM production_coverage_audit').get().n,1);await rejects(f.mutate({...body,reason:'Outro conteúdo com o mesmo ID sintético'}),'CONFLICT');
});

test('relevant new or voided manufacture invalidates coverage while unrelated global revisions retain valid interval hashes',async t=>{
 const f=await coverageBrowserFixture();t.after(()=>f.close());let frame=await f.read({week_end:f.expected.closed_week});frame=await f.mutate(cmd(frame,frame.intervals[1]));const old=structuredClone(frame),hash=frame.intervals[1].source_hash;await f.record('2026-10-01',1,900);frame=await f.read({week_end:frame.week_end});assert.equal(frame.intervals[1].source_hash,hash);assert.equal(frame.intervals[1].state,'CONFIRMED');await rejects(f.mutate(cmd(old,old.intervals[2])),'SOURCE_CHANGED');
 await f.voidRecord(f.ids.weekend);frame=await f.read({week_end:frame.week_end});assert.equal(frame.intervals[1].state,'STALE');assert.notEqual(frame.intervals[1].source_hash,hash);assert.equal(frame.intervals[1].recorded.quantity,0);frame=await f.mutate(cmd(frame,frame.intervals[1],'NO_MANUFACTURING'));assert.equal(frame.intervals[1].state,'CONFIRMED');
});

test('the entire Friday evidence participates even when the selected half has zero attributed pieces',async t=>{
 const f=await coverageBrowserFixture();t.after(()=>f.close());let frame=await f.read({week_end:f.expected.open_week});assert.equal(frame.intervals[0].recorded.quantity,0);frame=await f.mutate(cmd(frame,frame.intervals[0],'NO_MANUFACTURING'));const hash=frame.intervals[0].source_hash;
 const extra=await f.record('2026-10-23',1,1500);frame=await f.read({week_end:frame.week_end});assert.equal(frame.intervals[0].state,'BOUNDARY_REQUIRED');await rejects(f.mutate(cmd(frame,frame.intervals[0],'NO_MANUFACTURING')),'BOUNDARY_REQUIRED');await f.assign(extra,1,0);frame=await f.read({week_end:frame.week_end});assert.equal(frame.intervals[0].recorded.quantity,0);assert.equal(frame.intervals[0].state,'STALE');assert.notEqual(frame.intervals[0].source_hash,hash);frame=await f.mutate(cmd(frame,frame.intervals[0],'NO_MANUFACTURING'));assert.equal(frame.intervals[0].state,'CONFIRMED');
});

test('cost completeness is independent from interval completeness and unknown historical cost never becomes a total',async t=>{
 const f=await coverageBrowserFixture();t.after(()=>f.close());const frame=await all(f,f.expected.unknown_week);assert.equal(frame.summary.confirmed_intervals,8);assert.equal(frame.summary.unknown_cost_quantity,1);assert.equal(frame.summary.state,'PENDING');assert.equal(frame.summary.total_cost_cents,null);assert.equal(frame.intervals.find(r=>r.recorded.unknown_quantity).state,'CONFIRMED');
});

test('future hours cannot be attested, including the still open Friday afternoon after the13h cutoff',async t=>{
 const f=await coverageBrowserFixture();t.after(()=>f.close());let frame=await f.read({week_end:f.expected.open_week}),open=frame.intervals.find(r=>r.state==='OPEN');assert.ok(open);const canonical=f.canonical();await rejects(f.mutate(cmd(frame,open,'NO_MANUFACTURING')),'PERIOD_OPEN');assert.equal(f.canonical(),canonical);
 const cold=new D1(),env={ADMIN_DB:cold},now=()=>Date.parse('2026-10-23T16:00:00Z');t.after(()=>cold.db.close());frame=await readProductionCoverageWorkspace(env,{week_end:'2026-10-30'},{now});assert.equal(frame.intervals[0].state,'OPEN');assert.equal(frame.intervals[0].start_at,Math.floor(now()/1000));assert.equal(frame.intervals[0].can_confirm,false);await rejects(mutateProductionCoverageWorkspace(env,cmd(frame,frame.intervals[0],'NO_MANUFACTURING'),'synthetic-owner',{now}),'PERIOD_OPEN');
});

test('coverage commit fences physical and Friday timing races before any attestation can be written',async t=>{
 for(const kind of ['physical','timing']){
  const f=await coverageBrowserFixture();try{const frame=await f.read({week_end:f.expected.closed_week}),body=cmd(frame,frame.intervals[1]),db=f.env.ADMIN_DB,prepare=db.prepare.bind(db),batch=db.batch.bind(db),queries=new WeakMap();let raced=false;
   db.prepare=sql=>{const s=prepare(sql);queries.set(s,sql);return s;};db.batch=async statements=>{if(!raced&&/^INSERT OR IGNORE INTO production_coverage_state/.test(queries.get(statements[0])||'')){raced=true;if(kind==='physical')await f.record('2026-10-17',1,1500);else await f.assign(f.ids.priorFriday,2,2);}return batch(statements);};
   await rejects(f.mutate(body),'CONFLICT');assert.equal(raced,true);assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM production_coverage_audit').get().n,0);assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM production_coverage_intervals').get().n,0);assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM production_coverage_state').get().n,0);
  }finally{f.close();}
 }
});

test('an interrupted atomic batch rolls back coverage state, interval and audit together',async t=>{
 const f=await coverageBrowserFixture();t.after(()=>f.close());const frame=await f.read({week_end:f.expected.closed_week}),body=cmd(frame,frame.intervals[1]),db=f.env.ADMIN_DB,prepare=db.prepare.bind(db);let broken=false;
 db.prepare=sql=>{const s=prepare(sql);if(/^INSERT INTO production_coverage_audit/.test(sql)){const run=s.run.bind(s);s.run=async()=>{broken=true;await run();throw Error('Synthetic audit interruption');};}return s;};await rejects(f.mutate(body),'UNAVAILABLE',503);assert.equal(broken,true);for(const table of ['production_coverage_state','production_coverage_intervals','production_coverage_audit'])assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,0);db.prepare=prepare;const retried=await f.mutate(body);assert.equal(retried.revision,1);assert.equal(retried.intervals[1].state,'CONFIRMED');
});

test('coverage source fences discard a mixed read when manufacture changes after the source snapshot',async t=>{
 const f=await coverageBrowserFixture();t.after(()=>f.close());let frame=await f.read({week_end:f.expected.closed_week});frame=await f.mutate(cmd(frame,frame.intervals[1]));const db=f.env.ADMIN_DB,prepare=db.prepare.bind(db);let raced=false;
 db.prepare=sql=>{const s=prepare(sql);if(/^SELECT CASE WHEN /.test(sql)){const first=s.first.bind(s);s.first=async()=>{if(!raced){raced=true;await f.record('2026-10-17',1,1500);}return first();};}return s;};frame=await f.read({week_end:frame.week_end});assert.equal(raced,true);assert.equal(frame.intervals[1].state,'STALE');assert.equal(frame.intervals[1].recorded.quantity,3);
});

test('the standalone closed projector rejects forged totals, getters, sparse slots and future attestations without mutation',async t=>{
 const f=await coverageBrowserFixture();t.after(()=>f.close());const frame=await all(f,f.expected.closed_week),detached=vm.runInNewContext('('+projectProductionCoverageWorkspace.toString()+')(JSON.parse(input))',{Intl,Date,input:JSON.stringify(frame)});assert.deepEqual(JSON.parse(JSON.stringify(detached)),frame);
 for(const change of [x=>x.summary.total_cost_cents=0,x=>x.revision=0,x=>x.source.ledger_revision=0,x=>x.summary.confirmed_intervals=7,x=>x.intervals[0].can_confirm=false,x=>x.intervals[0].source_hash='bad',x=>x.intervals[0].attestation.confirmed_at=x.checked_at+1,x=>x.intervals[0].recorded.quantity++,x=>x.intervals[0].private_order_sn='PRIVATE',x=>delete x.intervals[1]]){const bad=structuredClone(frame);change(bad);assert.equal(projectProductionCoverageWorkspace(bad),null);}
 let reads=0;const bad=structuredClone(frame);Object.defineProperty(bad.intervals[0].recorded,'quantity',{get(){reads++;throw Error('PRIVATE');}});assert.equal(projectProductionCoverageWorkspace(bad),null);assert.equal(reads,0);const out=projectProductionCoverageWorkspace(frame);out.summary.total_cost_cents=1;assert.equal(frame.summary.total_cost_cents,9000);
});

test('historical DST civil boundaries and Friday13 remain contiguous without assuming24-hour days',async t=>{
 const db=new D1();t.after(()=>db.db.close());const frame=await readProductionCoverageWorkspace({ADMIN_DB:db},{week_end:'2018-11-09'},{now:()=>coverageClock});const sunday=frame.intervals.find(r=>r.date==='2018-11-04');assert.equal(sunday.end_at-sunday.start_at,23*3600);assert.equal(frame.period.end_at-frame.period.start_at,167*3600);for(let n=1;n<8;n++)assert.equal(frame.intervals[n].start_at,frame.intervals[n-1].end_at);assert.ok(projectProductionCoverageWorkspace(frame));const fall=await readProductionCoverageWorkspace({ADMIN_DB:db},{week_end:'2019-02-22'},{now:()=>coverageClock});assert.equal(fall.period.end_at-fall.period.start_at,169*3600);assert.ok(fall.intervals.some(r=>r.end_at-r.start_at===25*3600));
});

test('reading one week loads only its eight persisted interval declarations rather than other manufacturing history',async t=>{
 const f=await coverageBrowserFixture();t.after(()=>f.close());await all(f,f.expected.closed_week);let other=await f.read({week_end:f.expected.empty_week});await f.mutate(cmd(other,other.intervals[0]));assert.equal(f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM production_coverage_intervals').get().n,9);
 const db=f.env.ADMIN_DB,prepare=db.prepare.bind(db),loaded=[];db.prepare=sql=>{const s=prepare(sql);if(sql.startsWith('SELECT interval_key,payload FROM production_coverage_intervals')){const run=s.run.bind(s);s.run=async()=>{const r=await run();loaded.push(r.results.length);return r;};}return s;};const frame=await f.read({week_end:f.expected.closed_week});assert.equal(frame.summary.total_cost_cents,9000);assert.deepEqual(loaded,[8]);
});
