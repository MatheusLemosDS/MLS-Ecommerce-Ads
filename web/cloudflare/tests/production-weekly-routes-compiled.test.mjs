import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {D1} from './sqlite-d1.mjs';
import {MeteredHistoryD1} from './m2-history-fixture.mjs';
import {readIncurredProduction,mutateIncurredProduction} from '../src/incurred-production.mjs';
import {readProductionWeeklyClosingWorkspace} from '../src/production-weekly-store.mjs';

const identity={artwork:'QA semanal compilada',color:'Verde',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null};
const recordId='12121212-1212-4121-8121-121212121212';
const clock=Date.UTC(2026,9,23,16,0,5),now=()=>clock;
async function seed(env,{day='2026-10-23',quantity=3,cost=700}={}){
 const ledger=await readIncurredProduction(env,{now});
 await mutateIncurredProduction(env,{revision:ledger.revision,request_id:crypto.randomUUID(),action:'record',record_id:recordId,production_ref:'LOTE SEMANAL COMPILADO SINTÉTICO',replaces_record_id:null,produced_date:day,quantity,identity:{...identity},source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:cost,reference:null},evidence:'Fabricação e custo exclusivamente sintéticos',confirmed:true},'synthetic-compiled-owner',{now});
}
async function compiled(minify){
 const raw=readFileSync(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),seam='return {adminFetch,schedule,scheduledWork,workspaceAuthFetch};';assert.equal(raw.split(seam).length,2,'the legacy admin surface remains intact');
 const result=await build({stdin:{contents:raw+'\nexport {brazaAdmin as weeklyCompiledSmoke};',resolveDir:fileURLToPath(new URL('../../../dist',import.meta.url)),sourcefile:'weekly-compiled-smoke.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
}

for(const minify of [false,true])test(`compiled weekly owner routes and autonomous manufacturing scheduler (minify=${minify})`,async t=>{
 const module=await compiled(minify),worker=module.default;
 await t.test('owner, closed query, Origin, CSRF and bounded bodies precede timing writes',async()=>{
  const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'weekly-compiled-session-secret-'+'s'.repeat(32),ADMIN_USERNAME:'weekly-synthetic-owner',ADMIN_PASSWORD:'weekly-synthetic-password-123456'},origin='https://weekly-compiled.test';
  try{
   const login=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);
   const cookie=login.headers.get('set-cookie').split(';')[0],state=await(await worker.fetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
   const request=(path,{method='GET',body,auth=true,csrf=state.csrf,from=origin,raw=false}={})=>worker.fetch(new Request(origin+path,{method,headers:{...(auth?{cookie}:{}),...(method==='POST'?{'content-type':'application/json','x-csrf-token':csrf,origin:from}:{})},...(body===undefined?{}:{body:raw?body:JSON.stringify(body)})}),env);
   const count=()=>env.ADMIN_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'production_weekly_%'").get().n;
   assert.equal(count(),0);assert.equal((await request('/api/admin/production/weekly-closing?month=2026-10',{auth:false})).status,401);assert.equal(count(),0);
   const cold=await request('/api/admin/production/weekly-closing?month=2026-10');assert.equal(cold.status,200);const frame=await cold.json();assert.equal(frame.schema,'production_weekly_closing_workspace_v1');assert.equal(frame.source.ledger_revision,0);assert.equal(frame.financial_integration_allowed,false);assert.ok(frame.weeks.every(w=>w.current.total_cost_cents===null));assert.equal(count(),0,'cold weekly GET is read-only and creates no tables');
   for(const query of ['', '?month=2026-10&month=2026-10','?month=2026-10&cursor=secret','?month=2099-12'])assert.equal((await request('/api/admin/production/weekly-closing'+query)).status,400,'closed weekly selection: '+query);
   assert.equal((await request('/api/admin/production/weekly-closing?month=2026-10',{method:'DELETE'})).status,405);
   assert.equal((await request('/api/admin/production/weekly-closing',{method:'POST',body:{},auth:false})).status,401);
   assert.equal((await request('/api/admin/production/weekly-closing',{method:'POST',body:{},from:'https://foreign.test'})).status,403);
   assert.equal((await request('/api/admin/production/weekly-closing',{method:'POST',body:{},csrf:'invalid'})).status,403);
   assert.equal((await request('/api/admin/production/weekly-closing?month=2026-10',{method:'POST',body:{}})).status,400);
   assert.equal((await request('/api/admin/production/weekly-closing',{method:'POST',raw:true,body:'x'.repeat(65537)})).status,413);
   assert.equal(count(),0,'rejected authentication, query and body requests cannot create weekly sidecars');
   await seed(env);const canonicalBefore=JSON.stringify(await readIncurredProduction(env,{now}));
   const fresh=await(await request('/api/admin/production/weekly-closing?month=2026-10')).json(),row=fresh.boundary_records.find(row=>row.record_id===recordId);assert.ok(row);assert.equal(row.assignment_status,'PENDING');
   const body={action:'assign_boundary',month:'2026-10',request_id:crypto.randomUUID(),revision:fresh.revision,ledger_revision:fresh.source.ledger_revision,record_id:recordId,record_hash:row.record_hash,before13_quantity:2,at_or_after13_quantity:1,confirmed:true,reason:'Duas peças antes de 13h e uma a partir do corte, exclusivamente sintéticas'};
   assert.equal((await request('/api/admin/production/weekly-closing',{method:'POST',body:{...body,confirmed:false}})).status,400);
   const mismatch=await request('/api/admin/production/weekly-closing',{method:'POST',body:{...body,at_or_after13_quantity:2}});assert.equal(mismatch.status,409);assert.equal((await mismatch.json()).error,'PRODUCTION_WEEKLY_SOURCE_CHANGED','a partition inconsistent with the stored quantity is an exact source conflict');
   assert.equal((await request('/api/admin/production/weekly-closing',{method:'POST',body:{...body,unit_cost_cents:0}})).status,400,'timing assignments cannot overwrite historical cost');
   assert.equal((await(await request('/api/admin/production/weekly-closing?month=2026-10')).json()).revision,fresh.revision,'rejected timing declarations cannot advance the audit revision');assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM production_weekly_audit').get().n,0,'rejected timing declarations create zero audit facts');assert.equal(JSON.stringify(await readIncurredProduction(env,{now})),canonicalBefore,'rejected timing declarations cannot alter physical facts');
   const saved=await request('/api/admin/production/weekly-closing',{method:'POST',body});assert.equal(saved.status,200);const savedFrame=await saved.json();assert.equal(savedFrame.revision,fresh.revision+1);assert.equal(savedFrame.boundary_records.find(r=>r.record_id===recordId).before13_quantity,2);
   const replay=await request('/api/admin/production/weekly-closing',{method:'POST',body});assert.equal(replay.status,200);assert.equal((await replay.json()).revision,savedFrame.revision,'an ambiguous client replay cannot duplicate a timing confirmation');
   assert.equal((await request('/api/admin/production/weekly-closing',{method:'POST',body:{...body,request_id:crypto.randomUUID()}})).status,409,'stale expected timing revision is rejected');
   assert.equal(JSON.stringify(await readIncurredProduction(env,{now})),canonicalBefore,'compiled timing route cannot alter the v1 manufacturing ledger');
  }finally{env.ADMIN_DB.db.close();}
 });
 await t.test('the shipped weekly scheduler reserves a bounded independent turn before maintenance and paused collection',async()=>{
  const db=new MeteredHistoryD1(),env={ADMIN_DB:db};let forbidden=0,at=clock;const tick=()=>at,source=async()=>{forbidden++;throw Error('NO_PROVIDER_CAPABILITY_IN_WEEKLY_QA');},services={getFinanceBusinessPeriod:source,getFinanceProductionOrders:source,getFinanceReconciliation:source};
  try{
   await seed(env,{day:'2026-10-22',quantity:2,cost:400});const before=JSON.stringify(await readIncurredProduction(env,{now:tick}));db.rpc=0;
   const work=await module.weeklyCompiledSmoke.scheduledWork(env,services,tick);assert.equal(work.lane,'MAINTENANCE');assert.equal(work.collection,'DEFERRED');assert.equal(forbidden,0);assert.ok(db.rpc<=50,'a cold weekly turn must respect the 50-subrequest ceiling: '+db.rpc);
   const snapshot=await readProductionWeeklyClosingWorkspace(env,{month:'2026-10'},{now:tick}),closed=snapshot.weeks.find(w=>w.end_date==='2026-10-23');assert.equal(closed.original?.total_cost_cents,800,'first financial maintenance cannot suppress the manufacturing closure');assert.equal(JSON.stringify(await readIncurredProduction(env,{now:tick})),before);
   at+=60000;const initialSetup=await module.weeklyCompiledSmoke.scheduledWork(env,services,tick);assert.equal(initialSetup.collection,'MAINTENANCE','the existing financial pipeline retains its own first off-slot initialization');
   db.db.prepare('UPDATE business_sync_state SET enabled=0').run();at=clock+10*60000;
   const ledger=await readIncurredProduction(env,{now:tick});await mutateIncurredProduction(env,{revision:ledger.revision,request_id:crypto.randomUUID(),action:'void',record_id:recordId,reason:'Anulação sintética posterior ao fechamento'},'synthetic-compiled-owner',{now:tick});const afterVoid=JSON.stringify(await readIncurredProduction(env,{now:tick}));db.rpc=0;
   const correction=await module.weeklyCompiledSmoke.scheduledWork(env,services,tick);assert.equal(correction.lane,'MAINTENANCE');assert.equal(forbidden,0);assert.ok(db.rpc<=50,'restating a weekly report must respect the 50-subrequest ceiling: '+db.rpc);assert.equal(JSON.stringify(await readIncurredProduction(env,{now:tick})),afterVoid);
   const revised=(await readProductionWeeklyClosingWorkspace(env,{month:'2026-10'},{now:tick})).weeks.find(w=>w.end_date==='2026-10-23');assert.equal(revised.original.total_cost_cents,800);assert.equal(revised.latest.status,'NO_RECORDS');assert.equal(revised.latest.total_cost_cents,null);assert.equal(revised.versions_count,2,'a paused financial policy cannot suppress the independent manufacturing restatement');
   await module.weeklyCompiledSmoke.scheduledWork(env,services,tick);assert.equal((await readProductionWeeklyClosingWorkspace(env,{month:'2026-10'},{now:tick})).weeks.find(w=>w.end_date==='2026-10-23').versions_count,2,'repeated weekly turns remain idempotent');
   at+=60000;const paused=await module.weeklyCompiledSmoke.scheduledWork(env,services,tick);assert.equal(paused.lane,'PAUSED');assert.equal(forbidden,0);
  }finally{env.ADMIN_DB.db.close();}
 });
});
