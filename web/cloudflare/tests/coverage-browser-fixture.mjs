import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {dailyProductionFixture} from './production-daily-browser-fixture.mjs';
import {readIncurredProduction,mutateIncurredProduction} from '../src/incurred-production.mjs';
import {readIncurredProductionWorkspace} from '../src/incurred-production-workspace.mjs';
import {readProductionWeeklyClosingWorkspace,mutateProductionWeeklyClosingWorkspace,runProductionWeeklyClosing} from '../src/production-weekly-store.mjs';
import {readProductionCoverageWorkspace,mutateProductionCoverageWorkspace} from '../src/production-coverage.mjs';

// Every record, interval confirmation and amount is synthetic. Production facts
// enter the disposable ledger only through its existing explicit owner command.
export const coverageClock=Date.UTC(2026,9,25,15);
const identity={artwork:'Arte de fabricação sintética de QA',color:'Azul',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null};
export async function coverageBrowserFixture(){
 const env={ADMIN_DB:new D1()},finance=await dailyProductionFixture();let time=coverageClock,ordinal=0;
 const now=()=>time;
 async function record(produced_date,quantity,unit_cost_cents){
  const ledger=await readIncurredProduction(env,{now}),record_id='c0a0e000-0000-4000-8000-'+String(++ordinal).padStart(12,'0');
  await mutateIncurredProduction(env,{revision:ledger.revision,request_id:crypto.randomUUID(),action:'record',record_id,production_ref:'QA COBERTURA fabricação '+ordinal,replaces_record_id:null,produced_date,quantity,identity:{...identity},source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents,reference:null},evidence:'Registro de fabricação e custo exclusivamente sintéticos',confirmed:true},'synthetic-coverage-owner',{now});return record_id;
 }
 async function voidRecord(record_id){
  const ledger=await readIncurredProduction(env,{now});return mutateIncurredProduction(env,{revision:ledger.revision,request_id:crypto.randomUUID(),action:'void',record_id,reason:'Correção de fabricação exclusivamente sintética'},'synthetic-coverage-owner',{now});
 }
 async function assign(record_id,before13_quantity,at_or_after13_quantity){
  const frame=await readProductionWeeklyClosingWorkspace(env,{month:'2026-10'},{now}),row=frame.boundary_records.find(row=>row.record_id===record_id);assert.ok(row);
  return mutateProductionWeeklyClosingWorkspace(env,{action:'assign_boundary',month:'2026-10',request_id:crypto.randomUUID(),revision:frame.revision,ledger_revision:frame.source.ledger_revision,record_id,record_hash:row.record_hash,before13_quantity,at_or_after13_quantity,confirmed:true,reason:'Divisão sintética conferida das peças antes e depois de13h'},'synthetic-coverage-owner',{now});
 }
 try{
  const unknown=await record('2026-10-15',1,null),priorFriday=await record('2026-10-16',4,1000),weekend=await record('2026-10-17',2,1500),weekday=await record('2026-10-20',1,2000),closingFriday=await record('2026-10-23',2,500);
  await assign(priorFriday,1,3);await assign(closingFriday,2,0);await runProductionWeeklyClosing(env,{now});
  const original=(await readProductionWeeklyClosingWorkspace(env,{month:'2026-10'},{now})).weeks.find(row=>row.end_date==='2026-10-23').original;assert.equal(original?.total_cost_cents,9000);
  const read=selection=>readProductionCoverageWorkspace(env,selection,{now}),mutate=body=>mutateProductionCoverageWorkspace(env,body,'synthetic-coverage-owner',{now});
  const tables=()=>env.ADMIN_DB.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row=>row.name);
  const canonical=(includeCoverage=true)=>JSON.stringify(tables().filter(name=>includeCoverage||!name.startsWith('production_coverage_')).map(name=>[name,env.ADMIN_DB.db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()]));
  return {env,finance,now,read,mutate,record,voidRecord,assign,canonical,legacyCanonical:()=>canonical(false),ids:{unknown,priorFriday,weekend,weekday,closingFriday},setClock:stamp=>{time=stamp;},readLedger:selected=>readIncurredProductionWorkspace(env,selected,{now}),snapshot:async()=>JSON.stringify(await readIncurredProduction(env,{now})),readWeekly:()=>readProductionWeeklyClosingWorkspace(env,{month:'2026-10'},{now}),expected:{closed_week:'2026-10-23',empty_week:'2026-10-09',unknown_week:'2026-10-16',open_week:'2026-10-30',closed_cost_cents:9000,closed_quantity:8},close(){env.ADMIN_DB.db.close();finance.close();}};
 }catch(error){env.ADMIN_DB.db.close();finance.close();throw error;}
}
