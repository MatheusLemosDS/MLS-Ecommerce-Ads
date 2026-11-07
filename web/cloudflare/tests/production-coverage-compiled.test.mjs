import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';
import {coverageBrowserFixture} from './coverage-browser-fixture.mjs';
import {projectProductionCoverageWorkspace} from '../src/production-coverage.mjs';

class ObservedD1 extends D1{constructor(){super();this.sql=[];}prepare(sql){this.sql.push(sql);return super.prepare(sql);}}
for(const minify of [false,true])test(`compiled manufacturing coverage isolates explicit confirmations from legacy facts (minify=${minify})`,async t=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'))).default;
 const origin='https://coverage.synthetic.invalid',db=new ObservedD1(),fixture=await coverageBrowserFixture();
 t.after(()=>{db.db.close();fixture.close();});
 const credentials={ADMIN_SESSION_SECRET:'synthetic-coverage-session-'+'s'.repeat(32),ADMIN_USERNAME:'coverage-synthetic-owner',ADMIN_PASSWORD:'coverage-synthetic-password-123456'},env={...credentials,ADMIN_DB:db};
 const login=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
 const base=origin+'/api/admin/production/coverage',oldFetch=globalThis.fetch;let providers=0;
 globalThis.fetch=async()=>{providers++;throw Error('COVERAGE_MUST_NOT_CALL_A_PROVIDER');};t.after(()=>{globalThis.fetch=oldFetch;});
 const call=(suffix='?week_end=2026-10-23',{method='GET',body,csrf,from=origin,auth=true,raw=false}={},target=env)=>worker.fetch(new Request(base+suffix,{method,headers:{...(auth?{cookie}:{}),...(method==='POST'?{'content-type':'application/json',origin:from,'x-csrf-token':csrf??'invalid'}:{})},...(body===undefined?{}:{body:raw?body:JSON.stringify(body)})}),target);
 const count=()=>db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'production_coverage_%'").get().n;
 db.sql=[];assert.equal((await call('?week_end=2026-10-23',{auth:false})).status,401);
 for(const method of ['HEAD','PUT','PATCH','DELETE','OPTIONS'])assert.equal((await call('?week_end=2026-10-23',{method})).status,405);
 for(const suffix of ['','?week_end=2026-10-23&week_end=2026-10-23','?week_end=2026-10-23&extra=1','?week_end=2026-10-22','?week_end=bad','?week_end=2099-12-25'])assert.equal((await call(suffix)).status,400,'exact bounded Friday selection '+suffix);
 assert.equal(db.sql.length,0,'auth, method and query validation precede storage');
 const cold=await call();assert.equal(cold.status,200);assert.match(cold.headers.get('cache-control'),/no-store/);const frame=await cold.json();assert.ok(projectProductionCoverageWorkspace(frame));assert.equal(frame.summary.total_cost_cents,null);assert.equal(frame.summary.confirmed_intervals,0);assert.equal(frame.intervals.length,8);assert.ok(frame.intervals.every(row=>row.state==='UNCONFIRMED'));assert.ok(db.sql.every(sql=>/^SELECT\b/.test(sql)));assert.equal(count(),0);assert.equal(db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0,'cold GET initializes no schema');
 const state=await(await worker.fetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json(),csrf=state.csrf;
 for(const opts of [{auth:false},{from:'https://foreign.synthetic.invalid'},{csrf:'wrong'}])assert.equal((await call('',{method:'POST',body:{},csrf,...opts})).status,opts.auth===false?401:403);
 assert.equal((await call('?week_end=2026-10-23',{method:'POST',body:{},csrf})).status,400);
 assert.equal((await call('',{method:'POST',body:'x'.repeat(65537),raw:true,csrf})).status,413);assert.equal(count(),0);
 const savedEnv={...credentials,ADMIN_DB:fixture.env.ADMIN_DB},legacy=fixture.legacyCanonical(),physical=await fixture.snapshot();
 const stateSaved=await(await worker.fetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),savedEnv)).json();
 // Generic session setup is complete before the isolation baseline is taken.
 const legacyAfterSetup=fixture.legacyCanonical();
 const get=async week=>(await(await call('?week_end='+week,{},savedEnv)).json());
 const command=(value,row,mode='ALL_RECORDED')=>({action:'confirm',week_end:value.week_end,interval_key:row.key,source_hash:row.source_hash,revision:value.revision,ledger_revision:value.source.ledger_revision,timing_revision:value.source.timing_revision,request_id:crypto.randomUUID(),mode,reason:'Conferência de fabricação exclusivamente sintética',confirmed:true});
 let value=await get('2026-10-23');assert.ok(projectProductionCoverageWorkspace(value));assert.equal(value.summary.known_cost_cents,9000);assert.equal(value.summary.total_cost_cents,null);assert.equal(value.summary.recorded_quantity,8);
 const nonempty=value.intervals.find(row=>row.recorded.quantity>0),body=command(value,nonempty);
 assert.equal((await call('',{method:'POST',body:{...body,confirmed:false},csrf:stateSaved.csrf},savedEnv)).status,400);
 assert.equal((await call('',{method:'POST',body:{...body,mode:'NO_MANUFACTURING'},csrf:stateSaved.csrf},savedEnv)).status,409,'a day containing actual recorded pieces cannot be declared empty');
 assert.equal((await call('',{method:'POST',body:{...body,source_hash:'f'.repeat(64)},csrf:stateSaved.csrf},savedEnv)).status,409);
 assert.equal((await call('',{method:'POST',body:{...body,unit_cost_cents:0},csrf:stateSaved.csrf},savedEnv)).status,400,'coverage does not rewrite historical costs');
 assert.equal(fixture.env.ADMIN_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'production_coverage_%'").get().n,0,'rejected or contradictory commands do not initialize coverage storage');
 let sent=await call('',{method:'POST',body,csrf:stateSaved.csrf},savedEnv);assert.equal(sent.status,200);value=await sent.json();assert.equal(value.summary.confirmed_intervals,1);const revision=value.revision;
 sent=await call('',{method:'POST',body,csrf:stateSaved.csrf},savedEnv);assert.equal(sent.status,200);assert.equal((await sent.json()).revision,revision,'timeout replay is idempotent');assert.equal(fixture.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM production_coverage_audit').get().n,1,'replay creates no duplicate audit confirmation');
 assert.equal((await call('',{method:'POST',body:{...body,request_id:crypto.randomUUID()},csrf:stateSaved.csrf},savedEnv)).status,409,'stale CAS cannot duplicate a declaration');
 for(const key of value.intervals.filter(row=>row.state!=='CONFIRMED').map(row=>row.key)){
  value=await get('2026-10-23');const row=value.intervals.find(row=>row.key===key),next=command(value,row,row.recorded.quantity===0?'NO_MANUFACTURING':'ALL_RECORDED');
  const response=await call('',{method:'POST',body:next,csrf:stateSaved.csrf},savedEnv);assert.equal(response.status,200);value=await response.json();
 }
 assert.equal(value.summary.state,'CONFIRMED');assert.equal(value.summary.confirmed_intervals,8);assert.equal(value.summary.total_cost_cents,9000);
 const revoke={...command(value,value.intervals[0]),action:'revoke',mode:null};const revoked=await call('',{method:'POST',body:revoke,csrf:stateSaved.csrf},savedEnv);assert.equal(revoked.status,200);value=await revoked.json();assert.equal(value.intervals[0].state,'REVOKED');assert.equal(value.summary.total_cost_cents,null);assert.equal(value.summary.confirmed_intervals,7);
 assert.equal(fixture.legacyCanonical(),legacyAfterSetup,'only the additive coverage sidecar may change');assert.equal(await fixture.snapshot(),physical,'coverage never manufactures or rewrites a physical lot');assert.equal(providers,0);assert.ok(legacy.length>0);
});
