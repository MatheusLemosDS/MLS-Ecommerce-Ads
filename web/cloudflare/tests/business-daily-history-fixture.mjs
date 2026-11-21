import assert from 'node:assert/strict';
import {collectionFixture} from './business-collection-fixture.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {readBusinessMonthDisplay,projectBusinessMonth} from '../src/business-month.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {projectBusinessMonthAuditScope} from '../src/business-month-view-state.mjs';
import {buildDailyBusinessSummary} from '../src/business-daily-summary.mjs';
import {readHistoricalDailyBusinessSummary} from '../src/business-daily-history.mjs';

export async function historicalDailyFixture(t,{editDay='2026-10-14'}={}){
 const f=await collectionFixture({allPaid:true,daily:true,windowCounts:[2,1],paymentDelayMs:0});
 t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let state=await f.invoke('start');for(let n=0;state.status==='RUNNING'&&n<10;n++)state=await f.invoke('step');assert.equal(state.status,'COMPLETE');await f.invoke('ads');
 const db=f.env.ADMIN_DB;
 db.db.exec('CREATE TABLE IF NOT EXISTS production_costs_audit(revision INTEGER PRIMARY KEY,payload TEXT,created_at TEXT);CREATE TABLE IF NOT EXISTS variant_bindings_audit(revision INTEGER PRIMARY KEY,payload TEXT,created_at TEXT)');
 const costs=[{revision:1,payload:JSON.stringify({...COST_DEFAULTS,inclusive_regular_cents:1000}),at:'2026-10-01T12:00:00.000Z'},{revision:2,payload:JSON.stringify({...COST_DEFAULTS,inclusive_regular_cents:1200}),at:editDay+'T12:00:00.000Z'}],bindings=db.db.prepare('SELECT payload FROM variant_bindings_state').get().payload,rules=JSON.stringify({rules:[]});
 db.db.exec('DELETE FROM production_costs_audit;DELETE FROM variant_bindings_audit;DELETE FROM production_cost_rules_audit');
 for(const row of costs)db.db.prepare('INSERT INTO production_costs_audit VALUES(?,?,?)').run(row.revision,row.payload,row.at);
 db.db.prepare('UPDATE production_costs_state SET revision=2,payload=?,updated_at=?').run(costs[1].payload,costs[1].at);
 db.db.prepare('UPDATE variant_bindings_state SET revision=1,updated_at=?').run(costs[0].at);
 db.db.prepare('INSERT INTO variant_bindings_audit VALUES(1,?,?)').run(bindings,costs[0].at);
 db.db.prepare('UPDATE production_cost_rules_state SET revision=1,payload=?,updated_at=?').run(rules,costs[0].at);
 db.db.prepare('INSERT INTO production_cost_rules_audit(revision,payload,actor,created_at) VALUES(1,?,?,?)').run(rules,'synthetic-owner',costs[0].at);
 async function read(){
  const observed=await readBusinessMonthDisplay(f.env,{month:'2026-10'},{now:f.now});
  const legacy=buildDailyBusinessSummary(observed.display,observed.source_frames,observed.audit_scope,{projectMonthly:projectBusinessMonth,projectFrame:projectBusinessPeriodFrame,projectScope:projectBusinessMonthAuditScope});assert.ok(legacy);
  const historical=await readHistoricalDailyBusinessSummary(f.env,observed,legacy,{now:f.now});assert.ok(historical);
  return {observed,legacy,historical};
 }
 return {...f,read};
}
