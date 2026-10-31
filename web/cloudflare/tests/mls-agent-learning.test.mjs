import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createMlsAgentLearningReport,evaluateMlsAgentActionPolicy} from '../src/mls-agent-learning-report.mjs';
import {MLS_AGENT_LEARNING_SCHEMA,MlsAgentLearningError,recordMlsAgentLearningObservation,readMlsAgentLearning} from '../src/mls-agent-learning.mjs';
import {learningClock,learningNow,learningFrame,learningEnv,learningPublication} from './mls-agent-learning-fixture.mjs';

const read=(env,month='2026-10',now=learningNow)=>readMlsAgentLearning(env,{month},{now});
const record=(env,frame,revision=1,options={})=>recordMlsAgentLearningObservation(env,{frame,publication_revision:revision},{now:learningNow,...options});
const count=env=>env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM mls_agent_learning_observations').get().n;
const stored=env=>env.ADMIN_DB.db.prepare('SELECT * FROM mls_agent_learning_observations ORDER BY end_date').all();
const tables=env=>env.ADMIN_DB.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
const fail=code=>e=>e instanceof MlsAgentLearningError&&e.message===code;

test('learning owner reads stay empty and never initialize tables, collect data or write',async t=>{
 const env=await learningEnv(t),before=tables(env),report=await read(env);
 assert.deepEqual(tables(env),before);assert.equal(report.status,'EMPTY');assert.equal(report.latest,null);assert.deepEqual(report.lessons,[]);assert.equal(report.autonomy.model_training,false);assert.equal(report.autonomy.commercial_write_allowed,false);assert.equal(report.evidence.independent_financial_comparisons,0);
});
test('learning records only aggregate trusted completed publications and preserves unknown money',async t=>{
 const env=await learningEnv(t),frame=learningFrame();learningPublication(env,frame);
 assert.equal((await record(env,frame)).status,'RECORDED');const report=await read(env);
 assert.equal(report.status,'OBSERVING');assert.equal(report.evidence.cutoffs_observed,1);assert.equal(report.latest.metrics.ads_spend_cents,null);assert.equal(report.latest.metrics.net_estimate_cents,null);assert.equal(report.latest.metrics.actual_profit_cents,null);assert.equal(report.latest.metrics.sales_cents,0);
 assert.equal(report.lessons.find(v=>v.code==='SOURCE_REFRESH_REQUIRED').confidence,'OBSERVED');assert.equal(report.evidence.independent_financial_comparisons,0);
 assert.doesNotMatch(JSON.stringify(stored(env)),/order_sn|item_id|model_id|buyer|access_token|PRIVATE/);
});
test('learning rejects invalid frames and private extra fields before storage setup',async t=>{
 const env=await learningEnv(t),before=tables(env);
 for(const frame of [null,{}, {...learningFrame(),private_token:'PRIVATE'}, {...learningFrame(),result:{...learningFrame().result,net_profit_cents:1}}])await assert.rejects(record(env,frame),fail('MLS_AGENT_LEARNING_INPUT_INVALID'));
 await assert.rejects(recordMlsAgentLearningObservation(env,{frame:learningFrame(),publication_revision:1,private:'PRIVATE'},{now:learningNow}),fail('MLS_AGENT_LEARNING_INPUT_INVALID'));
 assert.deepEqual(tables(env),before);
});
test('incomplete runs and missing source identity do not create memory',async t=>{
 const env=await learningEnv(t),before=tables(env),running=learningFrame({status:'RUNNING',progress:{windows_total:1,windows_complete:0,pages_read:1},sales_cents:null,expected_repass_cents:null,production_cost_cents:null,invoice_tax_cents:null,ads_adjustment_cents:null,result:{net_estimate_cents:null,net_profit_cents:null,net_margin_bps:null,pending:['COLLECTING','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADS_UNAVAILABLE','ADJUSTMENT_UNAVAILABLE'],basis:'PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE'}});
 assert.equal((await record(env,running)).status,'WAITING_COMPLETE_PUBLICATION');const noSource=learningFrame();delete noSource.source_checked_at;
 assert.equal((await record(env,noSource)).status,'WAITING_SOURCE_IDENTITY');assert.deepEqual(tables(env),before);
});
test('publication revision, range and finance source watermarks must match the frozen published cohort',async t=>{
 const env=await learningEnv(t),frame=learningFrame();learningPublication(env,frame,3);
 assert.equal((await record(env,frame,2)).observations_written,0);assert.equal(count(env),0);
 assert.equal((await record(env,learningFrame({end_date:'2026-10-14'}),3)).observations_written,0);assert.equal(count(env),0);
 const other=learningFrame({source_checked_at:{finance_oldest_at:frame.checked_at-10,finance_latest_at:frame.checked_at-5,ads_at:null}});
 assert.equal((await record(env,other,3)).observations_written,0);assert.equal(count(env),0);
 assert.equal((await record(env,frame,3)).observations_written,1);
});
test('an identical refresh is idempotent and a new source observation does not create a correction win',async t=>{
 const env=await learningEnv(t),frame=learningFrame();learningPublication(env,frame);await record(env,frame);
 assert.equal((await record(env,frame)).observations_written,0);const before=stored(env)[0];
 const later=learningFrame({at:frame.checked_at+60});learningPublication(env,later,2);await record(env,later,2,{now:()=>learningClock+60000});
 assert.equal(count(env),1);const after=stored(env)[0];assert.equal(after.first_observed_at,before.first_observed_at);assert.equal(after.correction_count,0);
 const report=await read(env,'2026-10',()=>learningClock+60000);assert.equal(report.evidence.cutoffs_observed,1);assert.equal(report.evidence.revisions_observed,0);assert.equal(report.evidence.independent_financial_comparisons,0);
});
test('cost corrections replace the same cumulative cutoff and keep version lineage',async t=>{
 const env=await learningEnv(t),frame=learningFrame();learningPublication(env,frame);await record(env,frame);
 const corrected=learningFrame({costs_revision:2});await record(env,corrected);
 assert.equal(count(env),1);assert.equal(stored(env)[0].correction_count,1);const report=await read(env);
 assert.equal(report.evidence.cutoffs_observed,1);assert.equal(report.evidence.revisions_observed,1);assert.equal(report.latest.revisions.costs,2);
 assert.ok(report.lessons.some(lesson=>lesson.code==='REFERENCE_CORRECTION_RECORDED'));
 assert.equal((await record(env,frame)).observations_written,0);assert.equal((await read(env)).latest.revisions.costs,2);
});
test('older source revisions or cost vectors cannot overwrite more recent observations',async t=>{
 const env=await learningEnv(t),frame=learningFrame({costs_revision:3});learningPublication(env,frame,3);await record(env,frame,3);
 const newerPublicationOldCosts=learningFrame({costs_revision:2});learningPublication(env,newerPublicationOldCosts,4);
 assert.equal((await record(env,newerPublicationOldCosts,4)).observations_written,0);assert.equal((await read(env)).latest.revisions.costs,3);
});
test('a delayed observation cannot replace a more recent computation for the same financial publication',async t=>{
 const env=await learningEnv(t),frame=learningFrame(),newer=learningFrame({at:frame.checked_at+60,source_checked_at:{...frame.source_checked_at}});learningPublication(env,frame,3);
 assert.equal((await record(env,newer,3,{now:()=>learningClock+60000})).observations_written,1);
 assert.equal((await record(env,frame,3,{now:()=>learningClock+120000})).observations_written,0);
 assert.equal((await read(env,'2026-10',()=>learningClock+120000)).latest.checked_at,newer.checked_at);
});
test('pause before setup and pause after setup cannot record an observation',async t=>{
 const env=await learningEnv(t),frame=learningFrame();learningPublication(env,frame);const before=tables(env);
 assert.equal((await record(env,frame,1,{canRun:async()=>false})).status,'PAUSED');assert.deepEqual(tables(env),before);
 let calls=0;assert.equal((await record(env,frame,1,{canRun:async()=>++calls<2})).status,'PAUSED');assert.equal(count(env),0);
});
test('an atomic pause after the final canRun check prevents the observation insert',async t=>{
 const env=await learningEnv(t),frame=learningFrame();learningPublication(env,frame);
 const batch=env.ADMIN_DB.batch.bind(env.ADMIN_DB);let batches=0,checks=0;
 env.ADMIN_DB.batch=async statements=>{if(++batches===2)env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET enabled=0 WHERE id=1').run();return batch(statements);};
 const result=await record(env,frame,1,{canRun:async()=>{checks++;return true;}});
 assert.equal(checks,2);assert.equal(result.status,'UNCHANGED_OR_SUPERSEDED');assert.equal(result.observations_written,0);assert.equal(count(env),0);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT enabled FROM business_sync_state WHERE id=1').get().enabled,0);
});
test('different cumulative dates count as descriptive observations, never independent financial outcomes',async t=>{
 const env=await learningEnv(t);
 for(const end_date of ['2026-10-14','2026-10-15']){const frame=learningFrame({end_date});learningPublication(env,frame,Number(end_date.slice(-2)));await record(env,frame,Number(end_date.slice(-2)));}
 const report=await read(env);assert.equal(report.evidence.cutoffs_observed,2);assert.equal(report.evidence.independent_financial_comparisons,0);assert.equal(report.status,'EVIDENCE_AVAILABLE');
 const lesson=report.lessons.find(v=>v.code==='SOURCE_REFRESH_REQUIRED');assert.equal(lesson.confidence,'REPEATED');assert.equal(lesson.evidence_count,2);
});
test('current blocked or missing evidence remains descriptive rather than a successful recommendation',async t=>{
 const env=await learningEnv(t),base=learningFrame(),frame=learningFrame({production_cost_cents:null,result:{...base.result,pending:['PRODUCTION_COST_INCOMPLETE','ADS_UNAVAILABLE']}});learningPublication(env,frame);await record(env,frame);
 const report=await read(env);assert.ok(report.lessons.some(v=>v.code==='PRODUCTION_REFERENCE_INCOMPLETE'));assert.ok(!report.lessons.some(v=>v.code==='COST_REFERENCE_OBSERVED'));assert.equal(report.latest.metrics.net_estimate_cents,null);assert.equal(report.autonomy.mode,'OBSERVER');
 assert.ok(report.autonomy.confirmation_required.includes('NEW_ACTION'));assert.ok(report.autonomy.confirmation_required.includes('COMMERCIAL_WRITE'));
});
test('stale memory is labeled and cannot produce commercial permissions',async t=>{
 const env=await learningEnv(t),clock=Date.UTC(2026,9,15,12),frame=learningFrame({at:clock/1000});learningPublication(env,frame);await record(env,frame,1,{now:()=>clock});
 const report=await read(env,'2026-10',()=>clock+21601000);assert.equal(report.status,'STALE');assert.equal(report.autonomy.commercial_write_allowed,false);assert.equal(report.latest.metrics.net_estimate_cents,null);
});
test('re-recording an old frame never makes an old financial observation current',async t=>{
 const env=await learningEnv(t),clock=Date.UTC(2026,9,15,12),frame=learningFrame({at:clock/1000});learningPublication(env,frame);await record(env,frame,1,{now:()=>clock+901000});
 const report=await read(env,'2026-10',()=>clock+901000);assert.equal(report.status,'STALE');assert.equal(report.evidence.latest_observed_at,(clock+901000)/1000);assert.equal(report.latest.checked_at,clock/1000);
});
test('memory persistence is bounded to 400 cutoffs without modifying business publications',async t=>{
 const env=await learningEnv(t),frame=learningFrame({end_date:'2026-10-31'});learningPublication(env,frame,9);await env.ADMIN_DB.batch(MLS_AGENT_LEARNING_SCHEMA.map(sql=>env.ADMIN_DB.prepare(sql)));
 const insert=env.ADMIN_DB.db.prepare('INSERT INTO mls_agent_learning_observations VALUES(?,?,?,?,?,?,?)');
 for(let n=0;n<400;n++){const date=new Date(Date.UTC(2024,0,1)+n*86400000).toISOString().slice(0,10);insert.run(date.slice(0,7),date,1,1,1,0,'{}');}
 const original=env.ADMIN_DB.db.prepare('SELECT * FROM business_month_publications').all();assert.equal((await record(env,frame,9)).observations_written,1);assert.equal(count(env),400);
 assert.deepEqual(env.ADMIN_DB.db.prepare('SELECT * FROM business_month_publications').all(),original);assert.ok(!stored(env).some(v=>v.end_date==='2024-01-01'));
});
test('malformed stored observations fail closed without leaking stored strings or changing data',async t=>{
 const env=await learningEnv(t),frame=learningFrame();learningPublication(env,frame);await record(env,frame);
 env.ADMIN_DB.db.prepare('UPDATE mls_agent_learning_observations SET payload=?').run('{"private":"PRIVATE_SECRET"}');const before=stored(env);
 await assert.rejects(read(env),fail('MLS_AGENT_LEARNING_STORAGE_INVALID'));assert.deepEqual(stored(env),before);
});
test('read requests reject extra fields, invalid or future months without initializing storage',async t=>{
 const env=await learningEnv(t),before=tables(env);
 for(const input of [null,{}, {month:'2026-13'},{month:'2027-01'}, {month:'2026-10',refresh:true}])await assert.rejects(readMlsAgentLearning(env,input,{now:learningNow}),fail('MLS_AGENT_LEARNING_REQUEST_INVALID'));
 assert.deepEqual(tables(env),before);
});
test('the pure learning projector survives serialization and rejects duplicate or private observations',async t=>{
 const env=await learningEnv(t),frame=learningFrame();learningPublication(env,frame);await record(env,frame);const row=stored(env)[0],input={month:frame.month,checked_at:frame.checked_at,observations:[{observation:JSON.parse(row.payload),first_observed_at:row.first_observed_at,last_observed_at:row.last_observed_at,correction_count:row.correction_count}]};
 const project=createMlsAgentLearningReport().projectReport,context=vm.createContext({input:JSON.stringify(input)}),serialized=vm.runInContext('('+createMlsAgentLearningReport.toString()+')().projectReport(JSON.parse(input))',context);
 assert.deepEqual(JSON.parse(JSON.stringify(serialized)),project(input));assert.equal(project({...input,observations:[...input.observations,...input.observations]}),null);
 assert.equal(project({...input,observations:[{...input.observations[0],observation:{...input.observations[0].observation,private:'PRIVATE'}}]}),null);
});

const policyInput=(changes={})=>({schema:'mls_agent_action_request_v1',action:'PREPARE_REPORTS',known_action:true,capability:'AVAILABLE',evidence:'CURRENT',new_risk:false,commercial_write:false,paid_provider:false,policy_change:false,...changes});
test('only recognized existing safe automation can remain automatic and it never creates a new grant',()=>{
 for(const action of ['COLLECT_SAVED_EVIDENCE','CHECK_DATA_QUALITY','CLASSIFY_USING_SAVED_RULES','PREPARE_REPORTS']){
  const result=evaluateMlsAgentActionPolicy(policyInput({action}));assert.equal(result.decision,'AUTOMATIC_WITH_EXISTING_POLICY');assert.equal(result.grants_new_permissions,false);assert.equal(result.commercial_write_allowed,false);
 }
});
test('new actions, newly discovered risk, paid providers, commercial writes and policy changes require confirmation',()=>{
 for(const changes of [{known_action:false},{action:'CHANGE_AD_BUDGET'},{action:'SAVE_NEW_COST_RULE'},{new_risk:true},{commercial_write:true},{paid_provider:true},{policy_change:true}]){
  const result=evaluateMlsAgentActionPolicy(policyInput(changes));assert.equal(result.decision,'REQUIRE_CONFIRMATION');assert.ok(result.reasons.length);assert.equal(result.grants_new_permissions,false);
 }
});
test('an existing safe action waits for current evidence and confirmed capabilities',()=>{
 for(const evidence of ['STALE','MISSING'])assert.equal(evaluateMlsAgentActionPolicy(policyInput({evidence})).decision,'WAITING_EVIDENCE');
 for(const capability of ['UNKNOWN','UNAVAILABLE'])assert.equal(evaluateMlsAgentActionPolicy(policyInput({capability})).decision,'BLOCKED_CAPABILITY');
 const result=evaluateMlsAgentActionPolicy(policyInput({action:'CHANGE_AD_BUDGET',capability:'UNKNOWN',evidence:'MISSING'}));assert.equal(result.decision,'REQUIRE_CONFIRMATION');assert.ok(result.reasons.includes('CAPABILITY_NOT_CONFIRMED'));assert.ok(result.reasons.includes('CURRENT_EVIDENCE_REQUIRED'));
});
test('malformed policy inputs cannot become automatic and the policy serializes without ambient configuration',()=>{
 for(const input of [null,{},policyInput({known_action:1}),policyInput({capability:true}),policyInput({evidence:'CURRENT',secret:'PRIVATE'}),policyInput({action:'prepare_reports'})])assert.equal(evaluateMlsAgentActionPolicy(input),null);
 const context=vm.createContext({input:JSON.stringify(policyInput())}),result=vm.runInContext('('+createMlsAgentLearningReport.toString()+')().evaluateActionPolicy(JSON.parse(input))',context);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),evaluateMlsAgentActionPolicy(policyInput()));
});
test('saved current lessons are prioritized by source safety and recurrence while cleared conditions remain descriptive',async t=>{
 const env=await learningEnv(t),firstBase=learningFrame({end_date:'2026-10-14'}),first=learningFrame({end_date:'2026-10-14',production_cost_cents:null,result:{...firstBase.result,pending:['PRODUCTION_COST_INCOMPLETE','ADS_UNAVAILABLE']}});learningPublication(env,first,1);await record(env,first,1);
 const latest=learningFrame({end_date:'2026-10-15'});learningPublication(env,latest,2);await record(env,latest,2);const report=await read(env);
 assert.equal(report.lessons[0].code,'SOURCE_REFRESH_REQUIRED');assert.equal(report.lessons[0].confidence,'REPEATED');assert.ok(report.lessons.some(v=>v.code==='CONDITION_NOT_IN_LATEST_CUTOFF'));assert.ok(report.lessons.some(v=>v.code==='COST_REFERENCE_OBSERVED'));
 assert.ok(!report.lessons.some(v=>v.code==='PRODUCTION_REFERENCE_INCOMPLETE'));assert.equal(report.evidence.independent_financial_comparisons,0);
});
test('stored memory drops product identifiers even when an unknown cost appears in the trusted frame',async t=>{
 const env=await learningEnv(t),base=learningFrame(),frame=learningFrame({production_cost_cents:null,unmapped_variants:[{item_id:'123987654321',model_id:'987765443322',quantity:1}],result:{...base.result,pending:['PRODUCTION_COST_INCOMPLETE','ADS_UNAVAILABLE']}});learningPublication(env,frame);await record(env,frame);
 assert.doesNotMatch(JSON.stringify(stored(env)),/123987654321|987765443322|item_id|model_id/);
});
