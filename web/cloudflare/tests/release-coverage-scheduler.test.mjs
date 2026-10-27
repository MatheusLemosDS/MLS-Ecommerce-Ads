import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {scheduledWork} from '../src/admin.mjs';

const time=Date.UTC(2026,9,27,15),stamp=time/1000;
async function fixture(t){
 const db=new D1(),env={ADMIN_DB:db},now=()=>time;t.after(()=>db.db.close());
 const maintenance=await scheduledWork(env,{},now);
 assert.equal(maintenance.lane,'MAINTENANCE');assert.equal(maintenance.collection,'MAINTENANCE');
 db.db.prepare("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=0,lease_token=NULL,lease_until=NULL WHERE id=1").run();
 db.db.prepare("UPDATE business_sync_state SET enabled=1,status='IDLE',next_run_at=?,lease_token=NULL,lease_expires_at=NULL WHERE id=1").run(stamp+300);
 return {db,env,now};
}

test('HISTORY scheduler invokes the temporal coverage tracker even when no old cohort is due',async t=>{
 const f=await fixture(t);let privateCalls=0;
 const result=await scheduledWork(f.env,{getFinanceEscrowReleaseCoverage:async()=>{privateCalls++;throw Error('coverage source must not run without an old published cohort');}},f.now);
 assert.equal(result.lane,'HISTORY');
 assert.equal(result.history,'IDLE');
 assert.equal(result.reconciliation,'DEFERRED');
 assert.equal(result.releases,'DEFERRED');
 assert.equal(result.release_coverage,'NO_COHORT');
 assert.equal(privateCalls,0,'the tracker must decide locally that there is no cohort before using the private service');
});

test('paused scheduler marks temporal coverage paused together with the other background work',async t=>{
 const f=await fixture(t);f.db.db.prepare("UPDATE business_sync_state SET enabled=0,status='PAUSED' WHERE id=1").run();
 const result=await scheduledWork(f.env,{getFinanceEscrowReleaseCoverage:async()=>{throw Error('paused coverage source must not run');}},f.now);
 assert.equal(result.lane,'PAUSED');assert.equal(result.release_coverage,'PAUSED');assert.equal(result.reconciliation,'PAUSED');assert.equal(result.releases,'PAUSED');
});
