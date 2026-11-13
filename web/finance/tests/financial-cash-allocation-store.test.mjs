import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinancialCashAllocationStore,financialCashLegacyUsageSql,FINANCIAL_CASH_ALLOCATION_SCHEMA} from '../../cloudflare/src/financial-cash-allocation-store.mjs';
import {EXTERNAL_CASH_SCHEMA} from '../src/external-cash-store.mjs';
import {projectFinancialAllocationResponse} from '../src/financial-allocation-frame.mjs';

const scope={organization_id:'synthetic-org-a',store_id:'synthetic-store-a',currency:'BRL'},legacy='synthetic-legacy-cash';
const amount=(record_id,amount_cents)=>({record_id,amount_cents});
const row=(record_id,kind,amount_cents)=>({...scope,record_id,revision:1,legacy_record_id:record_id,account_id:kind==='BANK_TRANSACTION'?'synthetic-bank':'synthetic-wallet',kind,amount_cents,status:kind==='BANK_TRANSACTION'?'POSTED':'COMPLETED',date:'2026-11-13',evidence_id:'synthetic-evidence-'+record_id,native_reference:null,identity_unique:false});
const manual={confirmed:true,reason_code:'OPERATOR_VERIFIED'};
const command=(left,right,expected_revision=0)=>({request_id:crypto.randomUUID(),expected_revision,relation:'TRANSFER_DEPOSIT',left,right,confirmation:manual});
class ObservedD1 extends D1{
 executed=[];
 prepare(sql){const statement=super.prepare(sql);statement.sql=sql;for(const operation of ['run','first','all']){const execute=statement[operation];statement[operation]=async(...args)=>{this.executed.push(sql);return execute(...args);};}return statement;}
 async batch(statements){if(this.beforeBatch)await this.beforeBatch(statements);const result=await super.batch(statements);if(this.afterBatch)await this.afterBatch(statements);return result;}
}

test('a hundred bank installments conserve cents within a fixed D1 query budget',async t=>{
 const f=await fixture({legacySchema:true});try{
 const banks=Array.from({length:100},(_,index)=>row((index+1).toString(16).padStart(64,'0'),'BANK_TRANSACTION',100));f.records.splice(1,2,...banks);
 for(const r of banks)await f.db.prepare("INSERT INTO finance_external_cash_records(tenant,record_id,source,date,amount_cents,currency,external_id,reference,description,reported_status,status,import_id,review_hint,created_at) VALUES(?,?,'NUBANK',?,?,'BRL',?,NULL,NULL,NULL,'POSTED','synthetic-import',0,1)").bind(legacy,r.record_id,r.date,r.amount_cents,r.record_id).run();
 await f.store.initialize();f.db.executed=[];
 const result=await f.store.confirm(command([amount('transfer',10000)],banks.map(r=>amount(r.record_id,100))));
 assert.equal(result.group.right.length,100);assert.equal(result.group.right_total_cents,10000);assert.equal(count(f,'items'),101);
 assert.ok(f.db.executed.length<25,'source reservations and writes stay bounded, observed '+f.db.executed.length+' D1 queries');
 t.diagnostic('100 bank installments confirmed with '+f.db.executed.length+' D1 queries');
 assert.equal(f.db.executed.filter(sql=>sql.startsWith('INSERT INTO finance_financial_cash_items')).length,1);
 }finally{f.close();}
});
async function fixture({legacySchema=false}={}){
 const db=new ObservedD1(),records=[row('transfer','TRANSFER',10000),row('bank-a','BANK_TRANSACTION',4000),row('bank-b','BANK_TRANSACTION',6000)];let allowed=true;
 if(legacySchema){await db.batch(EXTERNAL_CASH_SCHEMA.map(sql=>db.prepare(sql)));for(const r of records)await db.prepare("INSERT INTO finance_external_cash_records(tenant,record_id,source,date,amount_cents,currency,external_id,reference,description,reported_status,status,import_id,review_hint,created_at) VALUES(?,?,?,?,?,'BRL',?,NULL,NULL,NULL,?,'synthetic-import',0,1)").bind(legacy,r.record_id,r.kind==='BANK_TRANSACTION'?'NUBANK':'SHOPEE',r.date,r.amount_cents,r.record_id,r.status).run();}
 const options=(selected=scope)=>({scope:selected,actor_id:'synthetic-actor',authorize:async()=>allowed,resolveRecords:async ids=>records.filter(r=>ids.includes(r.record_id)).map(r=>({...r,...selected})),legacy_cash_tenant:legacySchema?legacy:null,now:()=>Date.parse('2026-11-13T15:00:00Z')});
 return {db,records,options,store:createFinancialCashAllocationStore(db,options()),revoke(){allowed=false;},close(){db.db.close();}};
}
const count=(f,table)=>f.db.db.prepare('SELECT COUNT(*) AS n FROM finance_financial_cash_'+table).get().n;

test('cold allocation read/preview are SELECT-only and do not create financial records',async()=>{
 const f=await fixture();try{const read=await f.store.read();assert.equal(read.revision,0);assert.deepEqual(read.groups,[]);assert.ok(projectFinancialAllocationResponse(read));
 const preview=await f.store.preview({relation:'TRANSFER_DEPOSIT',left:[amount('transfer',4000)],right:[amount('bank-a',4000)]});assert.equal(preview.group.state,'SUGGESTED');assert.ok(projectFinancialAllocationResponse(preview));assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);
 }finally{f.close();}
});
test('T05 persisted installments conserve every cent and exact retries do not duplicate allocations',async()=>{
 const f=await fixture();try{const first=command([amount('transfer',4000)],[amount('bank-a',4000)]),a=await f.store.confirm(first),replay=await f.store.confirm(first);assert.equal(a.revision,1);assert.equal(replay.replayed,true);assert.equal(replay.group_id,a.group_id);assert.ok(projectFinancialAllocationResponse(a));
 const b=await f.store.confirm(command([amount('transfer',6000)],[amount('bank-b',6000)],1));assert.equal(b.revision,2);assert.equal(count(f,'groups'),2);assert.equal(f.db.db.prepare("SELECT SUM(amount_cents) n FROM finance_financial_cash_items WHERE record_id='transfer'").get().n,10000);
 await assert.rejects(f.store.confirm(command([amount('transfer',1)],[amount('bank-b',1)],2)),e=>e.code==='FINANCIAL_CASH_ALLOCATION_EXCEEDS_AVAILABLE');assert.equal(count(f,'groups'),2);assert.equal(count(f,'audit'),2);assert.equal(count(f,'requests'),2);
 }finally{f.close();}
});
test('reversal releases reservations but preserves original group and immutable request/audit rows',async()=>{
 const f=await fixture({legacySchema:true});try{const first=await f.store.confirm(command([amount('transfer',4000)],[amount('bank-a',4000)]));const original=f.db.db.prepare('SELECT payload_json FROM finance_financial_cash_groups').get().payload_json;
 assert.equal(f.db.db.prepare('SELECT '+financialCashLegacyUsageSql('?','?')+' n').get(legacy,'transfer').n,4000);
 const reversed=await f.store.reverse({request_id:crypto.randomUUID(),expected_revision:1,group_id:first.group_id,reason_code:'OPERATOR_VERIFIED'});assert.equal(reversed.revision,2);assert.equal(f.db.db.prepare('SELECT '+financialCashLegacyUsageSql('?','?')+' n').get(legacy,'transfer').n,0);assert.equal(f.db.db.prepare('SELECT payload_json FROM finance_financial_cash_groups').get().payload_json,original);
 const read=await f.store.read();assert.equal(read.groups[0].state,'REVERSED');assert.ok(projectFinancialAllocationResponse(read));assert.throws(()=>f.db.db.prepare('DELETE FROM finance_financial_cash_groups').run(),/immutable/);assert.throws(()=>f.db.db.prepare('UPDATE finance_financial_cash_requests SET request_hash=?').run('changed'),/immutable/);
 assert.equal((await f.store.confirm(command([amount('transfer',4000)],[amount('bank-a',4000)],2))).revision,3);
 }finally{f.close();}
});
test('T02 a committed transaction with a lost acknowledgement replays the original immutable response',async()=>{
 const f=await fixture();try{let armed=true;f.db.afterBatch=statements=>{if(armed&&statements.some(s=>s.sql.startsWith('UPDATE finance_financial_cash_state'))){armed=false;throw Error('synthetic lost acknowledgement');}};
 const body=command([amount('transfer',4000)],[amount('bank-a',4000)]),r=await f.store.confirm(body);assert.equal(r.replayed,true);assert.equal(count(f,'groups'),1);assert.equal(count(f,'requests'),1);assert.equal((await f.store.confirm(body)).group_id,r.group_id);
 }finally{f.close();}
});
test('T02 concurrent groups using one revision cannot both spend the same capacity',async()=>{
 const f=await fixture();try{await f.store.initialize();let armed=true;f.db.beforeBatch=async statements=>{if(armed&&statements.some(s=>s.sql.startsWith('UPDATE finance_financial_cash_state'))){armed=false;await f.store.confirm(command([amount('transfer',6000)],[amount('bank-b',6000)]));}};
 await assert.rejects(f.store.confirm(command([amount('transfer',4000)],[amount('bank-a',4000)])),e=>e.code==='FINANCIAL_CASH_REVISION_CONFLICT');assert.equal(count(f,'groups'),1);assert.equal((await f.store.read()).revision,1);
 }finally{f.close();}
});
test('legacy 1:1 reservations are enforced before fractional allocation',async()=>{
 const f=await fixture({legacySchema:true});try{await f.db.prepare("INSERT INTO finance_external_cash_matches(tenant,match_id,bank_record_id,transfer_record_id,confirmed_at,reason,actor,revision) VALUES(?,'synthetic-match','bank-a','transfer',1,'synthetic','OWNER',1)").bind(legacy).run();await assert.rejects(f.store.confirm(command([amount('transfer',4000)],[amount('bank-a',4000)])),e=>e.code==='FINANCIAL_CASH_ALLOCATION_EXCEEDS_AVAILABLE');
 assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='finance_financial_cash_groups'").get().n,0);
 }finally{f.close();}
});
test('legacy reservations arriving during allocation are checked again inside the D1 transaction',async()=>{
 const f=await fixture({legacySchema:true});try{await f.store.initialize();let armed=true;f.db.beforeBatch=async statements=>{if(armed&&statements.some(s=>s.sql.startsWith('UPDATE finance_financial_cash_state'))){armed=false;await f.db.prepare("INSERT INTO finance_external_cash_matches(tenant,match_id,bank_record_id,transfer_record_id,confirmed_at,reason,actor,revision) VALUES(?,'synthetic-match','bank-a','transfer',1,'synthetic','OWNER',1)").bind(legacy).run();}};
 await assert.rejects(f.store.confirm(command([amount('transfer',4000)],[amount('bank-a',4000)])),e=>e.status===409);assert.equal(count(f,'groups'),0);assert.equal((await f.store.read()).revision,0);
 }finally{f.close();}
});
test('an explicitly shared legacy source cannot be spent twice through different book namespaces',async()=>{
 const f=await fixture({legacySchema:true});try{await f.store.initialize();const other=createFinancialCashAllocationStore(f.db,f.options({...scope,store_id:'synthetic-store-b'}));await other.initialize();let armed=true;f.db.beforeBatch=async statements=>{if(armed&&statements.some(s=>s.sql.startsWith('UPDATE finance_financial_cash_state'))){armed=false;await other.confirm(command([amount('transfer',6000)],[amount('bank-b',6000)]));}};
 await assert.rejects(f.store.confirm(command([amount('transfer',10000)],[amount('bank-a',4000),amount('bank-b',6000)])),e=>e.status===409);assert.equal(count(f,'groups'),1);assert.equal((await f.store.read()).revision,0);assert.equal((await other.read()).revision,1);
 }finally{f.close();}
});
test('T24 failure midway through the transaction rolls back group, reservations, revision and audit',async()=>{
 const f=await fixture();try{await f.store.initialize();f.db.db.exec("CREATE TRIGGER synthetic_fail_audit BEFORE INSERT ON finance_financial_cash_audit BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");await assert.rejects(f.store.confirm(command([amount('transfer',4000)],[amount('bank-a',4000)])));assert.equal(count(f,'groups'),0);assert.equal(count(f,'items'),0);assert.equal(count(f,'requests'),0);assert.equal((await f.store.read()).revision,0);
 }finally{f.close();}
});
test('T23 authorization is checked before source access, before transaction and before delivery',async()=>{
 const f=await fixture();try{let calls=0;const store=createFinancialCashAllocationStore(f.db,{...f.options(),authorize:async({phase})=>phase!=='before-transaction',resolveRecords:async ids=>{calls++;return f.records.filter(r=>ids.includes(r.record_id));}});await assert.rejects(store.confirm(command([amount('transfer',4000)],[amount('bank-a',4000)])),e=>e.status===403);assert.equal(calls,1);assert.equal(count(f,'groups'),0);f.revoke();await assert.rejects(f.store.read(),e=>e.status===403);
 }finally{f.close();}
});
test('T24 initializing the additive schema repeatedly preserves history and monetary reservations',async()=>{
 const f=await fixture();try{await f.store.confirm(command([amount('transfer',4000)],[amount('bank-a',4000)]));const before=JSON.stringify(f.db.db.prepare('SELECT * FROM finance_financial_cash_groups').all());await f.store.initialize();await f.db.batch(FINANCIAL_CASH_ALLOCATION_SCHEMA.map(sql=>f.db.prepare(sql)));assert.equal(JSON.stringify(f.db.db.prepare('SELECT * FROM finance_financial_cash_groups').all()),before);assert.equal((await f.store.read()).revision,1);
 }finally{f.close();}
});
