import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {collectionFixture} from './business-collection-fixture.mjs';
import {readBusinessMonthDisplay} from '../src/business-month.mjs';
import {buildBusinessFinancialCloseout} from '../src/business-financial-closeout.mjs';
import {buildHermesFinancialContext,applyHermesCloseoutEvidence,projectHermesFinancialContext,prepareHermesFinancialContext,readHermesFinancialContext} from '../src/hermes-financial-context.mjs';

const analysisDate='2026-10-23',jobId='11111111-1111-4111-8111-111111111111';
const taskRaw=JSON.stringify({type:'daily_review',shop_id:'1178167501',start_date:analysisDate,end_date:analysisDate,ads_execution:'LOCKED'});
async function fixture(t){
 const f=await collectionFixture({returns:true,paymentDelayMs:0});t.after(()=>f.env.ADMIN_DB.db.close());
 let frame=await f.invoke('start');while(frame.status==='RUNNING')frame=await f.invoke('step');await f.invoke('ads');
 const saved=f.env.ADMIN_DB.db.prepare('SELECT payload FROM variant_bindings_state').get(),bindings=JSON.parse(saved.payload).filter(row=>row.item_id!=='1002');
 f.env.ADMIN_DB.db.prepare('UPDATE variant_bindings_state SET revision=4,payload=?').run(JSON.stringify(bindings));
 const observed=await readBusinessMonthDisplay(f.env,{month:'2026-10'},{now:f.now}),context=buildHermesFinancialContext(observed.display,{analysisDate,capturedAt:Math.floor(f.now()/1000)});
 const closeout=buildBusinessFinancialCloseout({monthly:observed.display,audit_scope:observed.audit_scope},{now:f.now});
 return {...f,observed,context,closeout};
}
const costTask=value=>value.monthly.top_actions.find(row=>row.code==='COMPLETE_PRODUCTION_COSTS');
function pythonAccepts(context){
 const fingerprint=createHash('sha256').update(JSON.stringify({job_id:jobId,context})).digest('hex');
 const script="import importlib.util,json,sys\nspec=importlib.util.spec_from_file_location('legacy_bridge',sys.argv[1]);bridge=importlib.util.module_from_spec(spec);spec.loader.exec_module(bridge)\nv=json.load(sys.stdin)\ntry:\n bridge.validate_financial_context(v['job'],v['task']);print('ACCEPTED')\nexcept bridge.BridgeError:\n print('REJECTED')\n";
 return execFileSync('python3',['-c',script,fileURLToPath(new URL('../../bridge/hermes_bridge.py',import.meta.url))],{input:JSON.stringify({job:{id:jobId,financial_context:JSON.stringify(context),financial_context_fingerprint:fingerprint},task:JSON.parse(taskRaw)}),encoding:'utf8'}).trim()==='ACCEPTED';
}

test('existing Hermes monthly actions receive quantified cases while financial values and v1 bridge stay exact',async t=>{
 const f=await fixture(t),before=structuredClone(f.context),enriched=applyHermesCloseoutEvidence(f.context,f.closeout),task=costTask(enriched);
 assert.notDeepEqual(enriched,f.context);assert.match(task.detail,/Conciliação salva: 1 unidade\(s\) afetado\(s\); valor conhecido informativo R\$ 1510,50 \(produção já identificada\); fonte custos salvos em 2026-10-24T/);assert.match(task.detail,/Próxima ação: completar os custos das variações\. Não confirma recebimento bancário\./);
 assert.deepEqual(f.context,before);assert.ok(projectHermesFinancialContext(enriched));assert.ok(pythonAccepts(enriched));assert.equal(enriched.schema,'hermes_financial_context_v1');
 const stripDetails=value=>({...value,monthly:{...value.monthly,top_actions:value.monthly.top_actions.map(row=>({...row,detail:null}))}});
 assert.deepEqual(stripDetails(enriched),stripDetails(before));assert.ok(enriched.monthly.top_actions.every(row=>row.detail.length<=700));assert.deepEqual(applyHermesCloseoutEvidence(enriched,f.closeout),enriched);
});

test('new job capture persists enriched evidence under its immutable fingerprint and never calls a provider',async t=>{
 const f=await fixture(t),db=f.env.ADMIN_DB,before=structuredClone(f.calls);db.db.exec('CREATE TABLE hermes_jobs(id TEXT PRIMARY KEY,task TEXT NOT NULL,created_at TEXT NOT NULL)');
 const prepared=await prepareHermesFinancialContext(f.env,jobId,analysisDate,{now:f.now,taskRaw});assert.deepEqual(f.calls,before);assert.match(costTask(prepared.context).detail,/Conciliação salva:/);assert.ok(pythonAccepts(prepared.context));
 await db.batch([db.prepare('INSERT INTO hermes_jobs(id,task,created_at) VALUES(?,?,?)').bind(jobId,taskRaw,'2026-10-24T12:00:00.000Z'),prepared.statement]);
 const saved=await readHermesFinancialContext(f.env,jobId);assert.deepEqual(saved.context,prepared.context);assert.equal(saved.fingerprint,prepared.fingerprint);assert.equal(saved.fingerprint,createHash('sha256').update(JSON.stringify({job_id:jobId,context:prepared.context})).digest('hex'));
 f.clock.time+=1000;const next=await prepareHermesFinancialContext(f.env,jobId,analysisDate,{now:f.now,taskRaw});assert.notEqual(next.fingerprint,saved.fingerprint);assert.equal((await next.statement.run()).meta.changes,0);assert.deepEqual(await readHermesFinancialContext(f.env,jobId),saved);
});

test('mismatched month, versions, amounts, counts or unknown text cannot rewrite Hermes evidence',async t=>{
 const f=await fixture(t);
 for(const mutate of [r=>r.versions.costs++,r=>r.totals.known_production_cents++,r=>r.checked_at++,r=>r.cases.find(row=>row.code==='PRODUCTION_COST_INCOMPLETE').affected_count++,r=>r.cases.find(row=>row.code==='PRODUCTION_COST_INCOMPLETE').known_amount_cents++,r=>r.cases.find(row=>row.code==='PRODUCTION_COST_INCOMPLETE').next_action='PRIVATE_PROVIDER_TEXT',r=>r.token='PRIVATE_TOKEN']){
  const value=structuredClone(f.closeout);mutate(value);assert.deepEqual(applyHermesCloseoutEvidence(f.context,value),f.context);
 }
 const full=structuredClone(f.context);costTask(full).detail='x'.repeat(699);assert.deepEqual(applyHermesCloseoutEvidence(full,f.closeout),full);
 assert.deepEqual(applyHermesCloseoutEvidence(f.context,null),f.context);
});

test('current provider Pending stays outside monthly actions, totals and job instructions',async t=>{
 const f=await fixture(t),report=structuredClone(f.closeout),row=report.cases.find(row=>row.code==='PRODUCTION_COST_INCOMPLETE');
 report.cases=[{...row,code:'CURRENT_PENDING_DETAIL_UNAVAILABLE',affected_count:null,affected_unit:'ORDERS',known_amount_cents:123456,amount_basis:'CURRENT_PROVIDER_PENDING',source:{name:'CURRENT_INCOME_PENDING',checked_at:report.checked_at,freshness:'FRESH'},next_action:'RESTORE_PENDING_DETAIL',href:'#commandPendingIncomeDetails',technical_code:'FINANCE_INCOME_DETAIL_HTTP_ERROR'}];
 assert.deepEqual(applyHermesCloseoutEvidence(f.context,report),f.context);assert.doesNotMatch(JSON.stringify(f.context),/123456|CURRENT_PENDING_DETAIL_UNAVAILABLE/);
});
