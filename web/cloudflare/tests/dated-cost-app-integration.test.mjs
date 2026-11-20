import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {adminFetch,scheduledWork} from '../src/admin.mjs';
import {commercialRoutePolicy} from '../src/commercial-route-policy.mjs';
import {tenantNamespace,createTenantDatabase} from '../src/tenant-storage.mjs';
import {startDatedCostScan,readDatedCostEvidence,reviewDatedCostEvidence} from '../src/dated-cost-evidence.mjs';
import {acquireBackgroundLane,finishBackgroundLane,runBackgroundHistoryWork,runDatedCostHistory} from '../src/historical-cost-orchestration.mjs';

const origin='https://dated-cost.test',month='2026-10',end_date=month+'-15',item_ids=['1001'];
const now=()=>Date.parse('2026-11-20T12:01:00.000Z');
function page(input,stamp=Math.floor(Date.now()/1000)){return {schema:'historical_variant_evidence_v1',shop_id:1178167501,checked_at:stamp,...input,has_more:false,next_cursor:null,coverage:{orders_seen:1,target_orders:1,target_lines:1,target_units:1},evidence_complete:true,products:input.item_ids.map(item_id=>({item_id,variants:[{model_id:'0',line_count:1,quantity:1,item_names:['Camiseta Adulta Estrela'],model_names:['Preto / G'],missing_item_name_lines:0,missing_model_name_lines:0,status_counts:[{status:'COMPLETED',line_count:1,quantity:1}],conflict:false}]})),omitted:{target_lines:0,target_units:0}};}
async function owner(t){
 const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'dated-cost-session-secret-12345678901234567890',ADMIN_USERNAME:'dated-cost-owner',ADMIN_PASSWORD:'dated-cost-password'};t.after(()=>env.ADMIN_DB.db.close());
 const login=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env,{});assert.equal(login.status,303);
 const cookie=login.headers.get('set-cookie').split(';')[0],calls=[],services={getFinanceHistoricalVariantEvidence:async(binding,input)=>{assert.equal(binding,env);calls.push(structuredClone(input));return page(input);}};
 const bootstrap=await adminFetch(new Request(origin+'/api/admin/bootstrap',{headers:{cookie}}),env,services),csrf=(await bootstrap.json()).csrf;
 const call=async(path,body=null,headers={})=>{const response=await adminFetch(new Request(origin+'/api/admin/finance/'+path,{method:body===null?'GET':'POST',headers:{cookie,...(body===null?{}:{origin,'content-type':'application/json','x-csrf-token':csrf}),...headers},...(body===null?{}:{body:JSON.stringify(body)})}),env,services);return {status:response.status,body:await response.json(),headers:response.headers};};
 return {env,calls,call,services};
}
function offerCost(env,{last=null,turn='COST'}={}){env.ADMIN_DB.db.prepare("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=0,lease_token=NULL,lease_until=NULL").run();env.ADMIN_DB.db.prepare('UPDATE background_history_fairness_state SET next_history_work=?,last_auxiliary_at=?').run(turn,last);}

test('dated historical GET routes negotiate separate read-only reports and never initialize cold costs or collect providers',async t=>{
 const f=await owner(t),before=f.env.ADMIN_DB.db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all();
 const evidence=await f.call('dated-cost-evidence?month='+month+'&end_date='+end_date);assert.equal(evidence.status,200);assert.equal(evidence.body.state,'UNAVAILABLE');
 const candidates=await f.call('dated-cost-candidates?month='+month);assert.equal(candidates.status,200);assert.equal(candidates.body.state,'UNAVAILABLE');
 const report=await f.call('business-cost-history-dated?month='+month,null,{'x-braza-client-contract':'business-cost-history-dated-v1'});assert.equal(report.status,200);assert.equal(report.body.schema,'business_cost_history_dated_v1');assert.equal(report.body.state,'UNAVAILABLE');assert.equal(report.headers.get('x-braza-client-contract'),'business-cost-history-dated-v1');
 for(const path of ['business-cost-history-dated?month='+month,'business-cost-history?month='+month])assert.equal((await f.call(path,null,{'x-braza-client-contract':'business-cost-history-v2'})).status,409);
 for(const path of ['dated-cost-evidence?month='+month+'&end_date='+end_date+'&month='+month,'dated-cost-candidates?month='+month+'&scope=foreign','business-cost-history-dated?month='+month+'&force=true'])assert.equal((await f.call(path)).status,400);
 assert.deepEqual(f.env.ADMIN_DB.db.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all(),before);assert.deepEqual(f.calls,[]);
});

test('owner dated scan actions require explicit CSRF confirmation and consume one existing private page before a separate reviewed approval',async t=>{
 const f=await owner(t),start={operation:'start',confirmed:true,month,end_date,item_ids};
 for(const [body,headers,status] of [[{...start,confirmed:false},{},400],[start,{origin:'https://foreign.example'},403],[start,{'x-csrf-token':'wrong'},403],[{...start,approved:true},{},400]])assert.equal((await f.call('dated-cost-evidence',body,headers)).status,status);
 const created=await f.call('dated-cost-evidence',start);assert.equal(created.status,200);assert.equal(created.body.status,'RUNNING');assert.equal(f.calls.length,0);
 await scheduledWork(f.env,{},now);
 offerCost(f.env);
 const stepped=await f.call('dated-cost-evidence',{operation:'step',confirmed:true,scan_id:created.body.scan_id,revision:created.body.revision});assert.equal(stepped.status,200);assert.equal(stepped.body.status,'COMPLETE');assert.equal(f.calls.length,1);
 const stored=await f.call('dated-cost-evidence?month='+month+'&end_date='+end_date),publication=stored.body.publications[0];assert.equal(publication.decision,'PROPOSED');assert.equal(publication.revision,0);
 const review={operation:'review',confirmed:true,scan_id:publication.scan_id,revision:0,publication_sha256:publication.publication_sha256,decision:'APPROVE'};
 assert.equal((await f.call('dated-cost-evidence',{...review,publication_sha256:'a'.repeat(64)})).status,409);
 assert.equal((await f.call('dated-cost-evidence',review)).status,200);assert.equal((await f.call('dated-cost-evidence',review)).status,409);
 assert.equal((await f.call('dated-cost-evidence?month='+month+'&end_date='+end_date)).body.publications[0].decision,'APPROVE');assert.equal(f.calls.length,1);
 const second=await f.call('dated-cost-evidence',{...start,item_ids:['1002']});f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET enabled=0').run();assert.equal((await f.call('dated-cost-evidence',{operation:'step',confirmed:true,scan_id:second.body.scan_id,revision:second.body.revision})).status,409);assert.equal(f.calls.length,1);
});

test('manual dated provider read cannot consume Finance, AUDIT, global cooldown or another active background lease',async t=>{
 const f=await owner(t),created=await f.call('dated-cost-evidence',{operation:'start',confirmed:true,month,end_date,item_ids}),step={operation:'step',confirmed:true,scan_id:created.body.scan_id,revision:created.body.revision},db=f.env.ADMIN_DB;
 assert.equal((await f.call('dated-cost-evidence',step)).status,409);assert.equal(f.calls.length,0);let row=db.db.prepare('SELECT * FROM background_collection_lane_state').get();assert.equal(row.next_lane,'FINANCE');assert.equal(row.lease_token,null);
 offerCost(f.env,{turn:'AUDIT'});assert.equal((await f.call('dated-cost-evidence',step)).status,409);assert.equal(f.calls.length,0);assert.equal(db.db.prepare('SELECT next_history_work FROM background_history_fairness_state').get().next_history_work,'AUDIT');assert.equal(db.db.prepare('SELECT auxiliary_index FROM background_collection_lane_state').get().auxiliary_index,0);
 offerCost(f.env,{last:Math.floor(Date.now()/1000)});assert.equal((await f.call('dated-cost-evidence',step)).status,409);assert.equal(f.calls.length,0);assert.equal(db.db.prepare('SELECT next_history_work FROM background_history_fairness_state').get().next_history_work,'COST');
 offerCost(f.env);const token=crypto.randomUUID();db.db.prepare('UPDATE background_collection_lane_state SET lease_token=?,lease_until=?').run(token,Math.floor(Date.now()/1000)+290);assert.equal((await f.call('dated-cost-evidence',step)).status,409);assert.equal(db.db.prepare('SELECT lease_token FROM background_collection_lane_state').get().lease_token,token);assert.equal(f.calls.length,0);
});

test('admitted manual COST page yields to AUDIT, while an in-flight pause or stolen global lease cannot publish',async t=>{
 for(const lost of [false,true]){
  const f=await owner(t),created=await f.call('dated-cost-evidence',{operation:'start',confirmed:true,month,end_date,item_ids}),step={operation:'step',confirmed:true,scan_id:created.body.scan_id,revision:created.body.revision};await scheduledWork(f.env,{},now);offerCost(f.env);
  const source=f.services.getFinanceHistoricalVariantEvidence;f.services.getFinanceHistoricalVariantEvidence=async(...args)=>{const value=await source(...args);if(lost)f.env.ADMIN_DB.db.prepare('UPDATE background_collection_lane_state SET revision=revision+1,lease_token=?').run(crypto.randomUUID());else f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET enabled=0').run();return value;};
  assert.equal((await f.call('dated-cost-evidence',step)).status,409);assert.equal(f.calls.length,1);assert.equal(f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM dated_cost_pages').get().n,0);assert.equal(f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM dated_cost_publications').get().n,0);
 }
 const f=await owner(t),created=await f.call('dated-cost-evidence',{operation:'start',confirmed:true,month,end_date,item_ids});await scheduledWork(f.env,{},now);offerCost(f.env);assert.equal((await f.call('dated-cost-evidence',{operation:'step',confirmed:true,scan_id:created.body.scan_id,revision:created.body.revision})).status,200);assert.equal(f.calls.length,1);const lane=f.env.ADMIN_DB.db.prepare('SELECT next_lane,lease_token FROM background_collection_lane_state').get();assert.equal(lane.next_lane,'FINANCE');assert.equal(lane.lease_token,null);assert.equal(f.env.ADMIN_DB.db.prepare('SELECT next_history_work FROM background_history_fairness_state').get().next_history_work,'AUDIT');
});

test('dated report and mutation policies retain independent finance/cost permissions and namespace every new schema object',async t=>{
 for(const suffix of ['dated-cost-candidates','dated-cost-evidence','business-cost-history-dated']){const policy=await commercialRoutePolicy(new Request(origin+'/api/admin/finance/'+suffix));assert.deepEqual(policy.capabilities,['finance.read','costs.read']);assert.equal(policy.mutating,false);}
 const policy=await commercialRoutePolicy(new Request(origin+'/api/admin/finance/dated-cost-evidence',{method:'POST',headers:{'content-type':'application/json'},body:'{"operation":"review"}'}));assert.deepEqual(policy.capabilities,['costs.write','finance.read']);assert.equal(policy.mutating,true);
 const raw=new D1();t.after(()=>raw.db.close());const scoped=async storeId=>({organizationId:'synthetic-org',storeId,namespace:await tenantNamespace('synthetic-org',storeId)});
 const a={ADMIN_DB:createTenantDatabase(raw,await scoped('store-a'))},b={ADMIN_DB:createTenantDatabase(raw,await scoped('store-b'))};
 const scan=await startDatedCostScan(a,{month,end_date,item_ids},{now});await startDatedCostScan(b,{month,end_date,item_ids},{now});
 assert.equal((await readDatedCostEvidence(a,{month,end_date},{now})).scans[0].scan_id,scan.scan_id);assert.notEqual((await readDatedCostEvidence(b,{month,end_date},{now})).scans[0].scan_id,scan.scan_id);
 await assert.rejects(()=>reviewDatedCostEvidence(b,{scan_id:scan.scan_id,revision:0,publication_sha256:'a'.repeat(64),decision:'APPROVE'},'synthetic-owner',{now}),error=>error.status===404);
 assert.equal(raw.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='dated_cost_scans'").get().n,0);
});

test('dated COST work shares the existing one-page lease and yields to AUDIT without automatic approval or late paused publication',async t=>{
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());assert.equal((await scheduledWork(env,{},now)).lane,'MAINTENANCE');
 env.ADMIN_DB.db.prepare("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=0").run();const selected={state:'AVAILABLE',month,end_date,item_ids,scan:null},readCandidates=async()=>({ready:false,status:'IDLE'});
 let providerReads=0,auditTurns=0;const services={getFinanceHistoricalVariantEvidence:async(_,input)=>{providerReads++;return page(input,Math.floor(now()/1000));}};
 const runDatedCost=(binding,input,source,options)=>runDatedCostHistory(binding,input,source,{...options,readCandidates:async()=>selected});
 let lease=await acquireBackgroundLane(env,{month},{now});assert.equal(lease.lane,'HISTORY');const first=await runBackgroundHistoryWork(env,services,{month,lease},{now,readCandidates,runDatedCost});assert.equal(first.source_reads,1);assert.equal(providerReads,1);assert.equal(first.history,'COMPLETE');assert.equal(first.historyNextWork,'AUDIT');
 assert.equal((await readDatedCostEvidence(env,{month,end_date},{now})).publications[0].decision,'PROPOSED');await finishBackgroundLane(env,lease,{now,historyNextWork:first.historyNextWork});
 env.ADMIN_DB.db.prepare("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=0").run();lease=await acquireBackgroundLane(env,{month},{now});const second=await runBackgroundHistoryWork(env,services,{month,lease},{now,readCandidates,runDatedCost,runAudits:async()=>{auditTurns++;return {returns_status:'DEFERRED',releases_status:'DEFERRED',income_status:'DEFERRED',income_detail_status:'DEFERRED'};}});assert.equal(auditTurns,1);assert.equal(second.source_reads,0);assert.equal(providerReads,1);await finishBackgroundLane(env,lease,{now,historyNextWork:'COST'});
 env.ADMIN_DB.db.prepare("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=0").run();lease=await acquireBackgroundLane(env,{month},{now});services.getFinanceHistoricalVariantEvidence=async(_,input)=>{providerReads++;env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET enabled=0').run();return page(input,Math.floor(now()/1000));};
 const paused=await runBackgroundHistoryWork(env,services,{month,lease},{now,readCandidates,runDatedCost:(binding,input,source,options)=>runDatedCostHistory(binding,input,source,{...options,readCandidates:async()=>({...selected,item_ids:['1002']})})});assert.equal(paused.source_reads,1);assert.equal(paused.history,'PAUSED');assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM dated_cost_publications').get().n,1);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM dated_cost_reviews').get().n,0);
});
