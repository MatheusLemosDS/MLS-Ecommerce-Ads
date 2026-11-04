import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {dailyProductionFixture} from './production-daily-browser-fixture.mjs';
import {readIncurredProduction,mutateIncurredProduction} from '../src/incurred-production.mjs';
import {readIncurredProductionWorkspace} from '../src/incurred-production-workspace.mjs';
import {readProductionWeeklyClosingWorkspace,mutateProductionWeeklyClosingWorkspace,runProductionWeeklyClosing} from '../src/production-weekly-store.mjs';

// The dates, money and physical declarations in this fixture are synthetic.
// No service binding, real account, stock write or provider is available here.
export const weeklyProductionClock=Date.UTC(2026,9,25,15);
const identity={artwork:'QA semanal sintética',color:'Azul',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null};

export async function weeklyProductionFixture(){
 const env={ADMIN_DB:new D1()};let clock=Date.UTC(2026,9,23,15,30),ordinal=0;
 const now=()=>clock;
 async function record(produced_date,quantity,unit_cost_cents){
  const ledger=await readIncurredProduction(env,{now}),record_id=crypto.randomUUID();
  await mutateIncurredProduction(env,{revision:ledger.revision,request_id:crypto.randomUUID(),action:'record',record_id,production_ref:'QA SEMANAL '+(++ordinal),replaces_record_id:null,produced_date,quantity,identity:{...identity},source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents,reference:null},evidence:'Declaração de fabricação exclusivamente sintética',confirmed:true},'synthetic-weekly-owner',{now});
  return record_id;
 }
 const read=month=>readProductionWeeklyClosingWorkspace(env,{month},{now});
 const mutate=body=>mutateProductionWeeklyClosingWorkspace(env,body,'synthetic-weekly-owner',{now});
 async function assign(record_id,before13_quantity,at_or_after13_quantity){
  const view=await read('2026-10'),row=view.boundary_records.find(row=>row.record_id===record_id);assert.ok(row);
  return mutate({action:'assign_boundary',month:'2026-10',request_id:crypto.randomUUID(),revision:view.revision,ledger_revision:view.source.ledger_revision,record_id,record_hash:row.record_hash,before13_quantity,at_or_after13_quantity,confirmed:true,reason:'Confirmação sintética da divisão no corte de 13h'});
 }
 try{
  await record('2026-09-17',1,0);await record('2026-09-24',1,1111);
  const priorFriday=await record('2026-10-16',4,1000);
  await record('2026-10-17',2,1500);
  const corrected=await record('2026-10-20',1,2000);
  const closingFriday=await record('2026-10-23',2,500);
  await assign(priorFriday,1,3);await assign(closingFriday,2,0);
  clock=Date.UTC(2026,9,23,16,0,5);
  for(let turn=0;turn<3;turn++)await runProductionWeeklyClosing(env,{now});
  const firstWeek=(await read('2026-10')).weeks.find(row=>row.end_date==='2026-10-23'),original=firstWeek?.original;
  assert.ok(original,'the actual scheduled store must retain an immutable first snapshot');
  assert.equal(firstWeek.versions_count,1,'duplicate cron calls cannot produce duplicate snapshots');
  assert.equal(original.total_cost_cents,9000,'Friday quantities, weekend and weekday pieces compose the original cost');
  clock=weeklyProductionClock;
  const ledger=await readIncurredProduction(env,{now});
  await mutateIncurredProduction(env,{revision:ledger.revision,request_id:crypto.randomUUID(),action:'void',record_id:corrected,reason:'Correção sintética posterior ao fechamento'},'synthetic-weekly-owner',{now});
  const pending=await record('2026-10-23',3,700);
  await record('2026-10-24',1,0);await record('2026-10-25',2,1000);
  await runProductionWeeklyClosing(env,{now});
  const initial=await read('2026-10'),week=initial.weeks.find(row=>row.end_date==='2026-10-23');
  assert.equal(week.current.total_cost_cents,null);
  assert.equal(week.current.known_cost_cents,7000);
  assert.equal(week.current.boundary_pending_quantity,3);
  assert.equal(JSON.stringify(week.original),JSON.stringify(original));
  const finance=await dailyProductionFixture();
  const snapshot=async()=>JSON.stringify(await readIncurredProduction(env,{now}));
  return {env,initial,read,mutate,now,pending,original,finance,snapshot,readLedger:selection=>readIncurredProductionWorkspace(env,selection,{now}),
   async settle(){for(let turn=0;turn<3;turn++)await runProductionWeeklyClosing(env,{now});return read('2026-10');},
   expected:{end_date:'2026-10-23',original_cents:9000,known_pending_cents:7000,resolved_cents:8400,delta_cents:-600,open_known_cents:2700,retrospective_end_date:'2026-09-25',retrospective_cents:1111},
   close(){env.ADMIN_DB.db.close();finance.close();}};
 }catch(error){env.ADMIN_DB.db.close();throw error;}
}
