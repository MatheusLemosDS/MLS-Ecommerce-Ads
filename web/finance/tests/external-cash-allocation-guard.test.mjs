import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {EXTERNAL_CASH_SCHEMA,readExternalCashStorageContext,mutateExternalCash} from '../src/external-cash-store.mjs';
import {createFinancialCashAllocationStore,FINANCIAL_CASH_ALLOCATION_SCHEMA} from '../../cloudflare/src/financial-cash-allocation-store.mjs';

const now=()=>Date.parse('2026-11-13T15:00:00Z');
const scope={organization_id:'synthetic-org',store_id:'synthetic-store',currency:'BRL'};
const ids={transfer:'a'.repeat(64),bank:'b'.repeat(64),otherTransfer:'c'.repeat(64),otherBank:'d'.repeat(64)};
const selected=(record_id,amount_cents)=>({record_id,amount_cents});
class ObservedD1 extends D1 {
  prepare(sql){const s=super.prepare(sql);s.testSql=sql;return s;}
  async batch(statements){if(this.beforeBatch)await this.beforeBatch(statements);return super.batch(statements);}
}
async function fixture(){
  const db=new ObservedD1(),env={FINANCE_DB:db,ADMIN_DB:new D1()};
  await db.batch(EXTERNAL_CASH_SCHEMA.map(sql=>db.prepare(sql)));
  const {tenant}=await readExternalCashStorageContext(env);
  await db.prepare('INSERT INTO finance_external_cash_state(tenant,revision) VALUES(?,0)').bind(tenant).run();
  const records=Object.entries(ids).map(([name,record_id])=>({...scope,record_id,legacy_record_id:record_id,revision:1,account_id:name.toLowerCase().includes('bank')?'synthetic-bank':'synthetic-wallet',kind:name.toLowerCase().includes('bank')?'BANK_TRANSACTION':'TRANSFER',amount_cents:10000,status:name.toLowerCase().includes('bank')?'POSTED':'COMPLETED',date:'2026-11-13',evidence_id:'synthetic-import-'+record_id,native_reference:null,identity_unique:false}));
  for(const r of records)await db.prepare("INSERT INTO finance_external_cash_records(tenant,record_id,source,date,amount_cents,currency,external_id,reference,description,reported_status,status,import_id,review_hint,created_at) VALUES(?,?,?,'2026-11-13',10000,'BRL',?,NULL,NULL,NULL,?,'synthetic-import',0,1)").bind(tenant,r.record_id,r.kind==='BANK_TRANSACTION'?'NUBANK':'SHOPEE',r.record_id,r.status).run();
  const allocations=createFinancialCashAllocationStore(db,{scope,actor_id:'synthetic-operator',authorize:async()=>true,resolveRecords:async wanted=>records.filter(r=>wanted.includes(r.record_id)),legacy_cash_tenant:tenant,now});
  return {db,env,allocations,close(){db.db.close();env.ADMIN_DB.db.close();}};
}
const legacyMatch=()=>({schema:'external_cash_request_v1',operation:'match',request_id:crypto.randomUUID(),expected_revision:0,confirmed:true,reason:'Synthetic operator verified evidence',pairs:[{bank_record_id:ids.bank,transfer_record_id:ids.transfer}]});
const allocation=(left=ids.transfer,right=ids.bank,amount=4000,expected_revision=0)=>({request_id:crypto.randomUUID(),expected_revision,relation:'TRANSFER_DEPOSIT',left:[selected(left,amount)],right:[selected(right,amount)],confirmation:{confirmed:true,reason_code:'OPERATOR_VERIFIED'}});
const legacySnapshot=f=>Object.fromEntries(['state','matches','unlinks','requests','audit','guard'].map(name=>[name,f.db.db.prepare('SELECT * FROM finance_external_cash_'+name+' ORDER BY 1').all()]));
const legacyConflict=run=>assert.rejects(run,e=>e.code==='FINANCE_EXTERNAL_CASH_MATCH_CONFLICT'&&e.status===409);

test('legacy full matching checks a partial new reservation on either source side before writing',async()=>{
  for(const [left,right] of [[ids.transfer,ids.otherBank],[ids.otherTransfer,ids.bank]]){
    const f=await fixture();try{
      await f.allocations.confirm(allocation(left,right));
      const before=legacySnapshot(f);
      await legacyConflict(()=>mutateExternalCash(f.env,legacyMatch(),{now}));
      assert.deepEqual(legacySnapshot(f),before);
      assert.equal((await f.allocations.read()).groups.length,1);
    }finally{f.close();}
  }
});

test('a new group committed after legacy precheck is rejected by the same atomic reservation fence',async()=>{
  const f=await fixture();try{
    await f.allocations.initialize();
    const before=legacySnapshot(f);let raced=false;
    f.db.beforeBatch=async statements=>{
      if(!statements.some(s=>/^UPDATE finance_external_cash_state SET/.test(s.testSql)))return;
      f.db.beforeBatch=null;raced=true;
      await f.allocations.confirm(allocation());
    };
    await legacyConflict(()=>mutateExternalCash(f.env,legacyMatch(),{now}));
    assert.equal(raced,true,'new reservation was inserted between precheck and legacy transaction');
    assert.deepEqual(legacySnapshot(f),before,'failed atomic guard rolls back legacy revision, link and receipts');
    const saved=await f.allocations.read();assert.equal(saved.revision,1);assert.equal(saved.groups[0].left_total_cents,4000);
  }finally{f.close();}
});

test('reversing a group releases the reservation; legacy links then block spending the same source again',async()=>{
  const f=await fixture();try{
    const group=await f.allocations.confirm(allocation());
    await f.allocations.reverse({request_id:crypto.randomUUID(),expected_revision:1,group_id:group.group_id,reason_code:'OPERATOR_VERIFIED'});
    const match=await mutateExternalCash(f.env,legacyMatch(),{now});assert.equal(match.revision,1);assert.equal(match.result.match_ids.length,1);
    await assert.rejects(()=>f.allocations.confirm(allocation(ids.transfer,ids.bank,1,2)),e=>e.status===409);
    const groups=await f.allocations.read();assert.equal(groups.groups.length,1);assert.equal(groups.groups[0].state,'REVERSED');
  }finally{f.close();}
});

test('an old-schema match initializes only additive reservation infrastructure and preserves all source records',async()=>{
  const f=await fixture();try{
    const before=f.db.db.prepare('SELECT * FROM finance_external_cash_records ORDER BY record_id').all();
    assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'finance_financial_cash_%'").get().n,0);
    const command=legacyMatch(),saved=await mutateExternalCash(f.env,command,{now});assert.equal(saved.revision,1);
    assert.deepEqual(f.db.db.prepare('SELECT * FROM finance_external_cash_records ORDER BY record_id').all(),before);
    for(const table of ['groups','items','requests','audit'])assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM finance_financial_cash_'+table).get().n,0);
    const replay=await mutateExternalCash(f.env,command,{now});assert.equal(replay.replayed,true);assert.deepEqual(replay.result,saved.result);
    assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM finance_external_cash_matches').get().n,1);
  }finally{f.close();}
});

test('a partial or incompatible reservation schema fails closed instead of bypassing active capacity',async()=>{
  for(const ddl of [FINANCIAL_CASH_ALLOCATION_SCHEMA.slice(0,1),FINANCIAL_CASH_ALLOCATION_SCHEMA.map(sql=>sql.replace('ok INTEGER NOT NULL CHECK(ok=1)','ok INTEGER NOT NULL'))]){
    const f=await fixture();try{
      await f.db.batch(ddl.map(sql=>f.db.prepare(sql)));const before=legacySnapshot(f);
      await assert.rejects(()=>mutateExternalCash(f.env,legacyMatch(),{now}),e=>e.code==='FINANCE_EXTERNAL_CASH_STORAGE_INVALID'&&e.status===503);
      assert.deepEqual(legacySnapshot(f),before);
    }finally{f.close();}
  }
});
