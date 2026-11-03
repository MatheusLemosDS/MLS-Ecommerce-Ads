import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {collectionFixture} from './business-collection-fixture.mjs';
import {readBusinessMonthDisplay} from '../src/business-month.mjs';
import {buildBusinessMonthView} from '../src/business-month-view-state.mjs';
import {readIncurredProduction,mutateIncurredProduction} from '../src/incurred-production.mjs';
import {readIncurredProductionWorkspace} from '../src/incurred-production-workspace.mjs';
import {completeWorkspaceFrame} from './monthly-workspace-browser-fixture.mjs';
import {buildHermesFinancialContext,projectHermesFinancialContext} from '../src/hermes-financial-context.mjs';
import {createHash} from 'node:crypto';

// Every amount and identity in this module is synthetic. Manufacturing entries
// cross the real explicit declaration API; commercial estimates cross the real
// cached Finance collector, App monthly publication and daily projector.
export const dailyProductionClock=Date.UTC(2026,9,25,15);
export const dailyProductionNow=()=>dailyProductionClock;
const identity={artwork:'Arte de QA sintética',color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null};

export async function dailyProductionFixture(){
 const env={ADMIN_DB:new D1()};let ordinal=0;
 async function record(produced_date,quantity,unit_cost_cents){
  const frame=await readIncurredProduction(env,{now:dailyProductionNow}),record_id=crypto.randomUUID();
  await mutateIncurredProduction(env,{revision:frame.revision,request_id:crypto.randomUUID(),action:'record',record_id,production_ref:'QA SINTÉTICA fabricação '+(++ordinal),replaces_record_id:null,produced_date,quantity,identity:{...identity},source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents,reference:null},evidence:'Declaração sintética de peças fabricadas e custo histórico',confirmed:true},'synthetic-owner',{now:dailyProductionNow});
  return record_id;
 }
 async function voidRecord(record_id){
  const frame=await readIncurredProduction(env,{now:dailyProductionNow});
  await mutateIncurredProduction(env,{revision:frame.revision,request_id:crypto.randomUUID(),action:'void',record_id,reason:'Correção sintética preservada no histórico'},'synthetic-owner',{now:dailyProductionNow});
 }
 const july=await record('2026-07-09',1,7777);await voidRecord(july);
 await record('2026-09-10',2,1000);await record('2026-09-20',3,1000);await record('2026-09-21',3,1000);
 const septemberVoid=await record('2026-09-22',1,50000);await voidRecord(septemberVoid);
 await record('2026-10-01',2,1500);await record('2026-10-10',3,1250);await record('2026-10-15',1,null);await record('2026-10-20',2,2000);await record('2026-10-24',1,0);await record('2026-10-25',1,500);
 const finance=await collectionFixture({allPaid:true,daily:true,windowCounts:[3,1],paymentDelayMs:0});
 try{
  let monthly=await finance.invoke('start');for(let turn=0;monthly.status==='RUNNING'&&turn<12;turn++)monthly=await finance.invoke('step');assert.equal(monthly.status,'COMPLETE');await finance.invoke('ads');
  const observed=await readBusinessMonthDisplay(finance.env,{month:'2026-10'},{now:finance.now});
  const financialView=buildBusinessMonthView(observed,{enabled:true,status:'COMPLETE',next_run_at:finance.now()/1000+60,last_attempt_at:finance.now()/1000-5},{now:finance.now,contract:'business-month-view-v5'});
  assert.ok(financialView.daily_summary,'the fixture must retain genuine daily financial evidence');
  const september=completeWorkspaceFrame({month:'2026-09',review:false,at:dailyProductionClock/1000-30}),septemberScope={publication_revision:4,start_date:september.start_date,end_date:september.end_date,sources:[1,16].map((first,index)=>({run_id:'abcdef02-0000-4000-8000-'+String(index+1).padStart(12,'0'),source_revision:1,start_date:'2026-09-'+String(first).padStart(2,'0'),end_date:'2026-09-'+String(first+14).padStart(2,'0')}))};
  const septemberView=buildBusinessMonthView({display:september,active:september,display_source:'PUBLISHED',audit_scope:septemberScope,source_frames:null},{enabled:true,status:'COMPLETE',next_run_at:dailyProductionClock/1000+60,last_attempt_at:dailyProductionClock/1000-5},{now:dailyProductionNow,contract:'business-month-view-v5'});
  assert.equal(septemberView.daily_summary,null,'saved monthly totals alone never manufacture a daily profit series');
  const hermesContext=buildHermesFinancialContext(observed.display,{analysisDate:'2026-10-23',capturedAt:finance.now()/1000});assert.ok(projectHermesFinancialContext(hermesContext));assert.equal(hermesContext.available,true);
  const jobId='abcdef03-0000-4000-8000-000000000001',hermesJob={id:jobId,status:'completed',start_date:'2026-10-23',end_date:'2026-10-23',settings_revision:1,reserve_cents:0,cost_cents:1,cost_source:'operator_confirmed',failure:null,created_at:'2026-10-24T12:00:00Z',started_at:'2026-10-24T12:00:01Z',completed_at:'2026-10-24T12:00:02Z',result:'Análise de 2026-10-23\nInvestimento: 52.77\nCliques: 123\nImpressões: 2000\nROAS 12.5 19.28\nPedidos 9 15\nStatus econômico: UNKNOWN\nRecomendação: OBSERVE\nQualidade e limitações\nAnúncios não alterados.'};
  const hermesEnvelope={job_id:jobId,fingerprint:createHash('sha256').update(JSON.stringify({job_id:jobId,context:hermesContext})).digest('hex'),context:hermesContext};
  const snapshot=async()=>JSON.stringify(await readIncurredProduction(env,{now:dailyProductionNow}));
  return {env,financialView,financialViews:new Map([['2026-10',financialView],['2026-09',septemberView]]),financialSnapshot:JSON.stringify(financialView),financialSourceCalls:JSON.stringify(finance.calls),hermesJob,hermesEnvelope,
   read:selected=>readIncurredProductionWorkspace(env,selected,{now:dailyProductionNow}),snapshot,providerCalls:()=>JSON.stringify(finance.calls),
   expected:{october:{known_cost_cents:11250,produced_quantity:10,unknown_cost_quantity:1,highest_quantity_date:'2026-10-10'},september:{total_cost_cents:8000,produced_quantity:8,peak_cost_cents:3000,peak_dates:['2026-09-20','2026-09-21']},explicit_zero_date:'2026-10-24',unknown_date:'2026-10-15',unrecorded_date:'2026-10-02',void_only_month:'2026-07'},
   close(){env.ADMIN_DB.db.close();finance.env.ADMIN_DB.db.close();finance.financeEnv.FINANCE_DB.db.close();}};
 }catch(error){env.ADMIN_DB.db.close();finance.env.ADMIN_DB.db.close();finance.financeEnv.FINANCE_DB.db.close();throw error;}
}
