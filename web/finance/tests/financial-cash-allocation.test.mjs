import test from 'node:test';
import assert from 'node:assert/strict';
import {projectFinancialAllocation,compareFinancialCashIdentity} from '../src/financial-cash-allocation.mjs';

const scope={organization_id:'synthetic-org-a',store_id:'synthetic-store-a',currency:'BRL'};
const record=(record_id,kind,amount_cents,changes={})=>({...scope,record_id,kind,amount_cents,revision:1,account_id:kind==='BANK_TRANSACTION'?'synthetic-bank':'synthetic-wallet',date:'2026-11-13',status:kind==='BANK_TRANSACTION'?'POSTED':kind==='RECEIVABLE'?'RELEASED':kind==='FEE'?'CONFIRMED':kind==='OBLIGATION'?'OPEN':'COMPLETED',native_reference:null,identity_unique:false,evidence_id:'synthetic-evidence-'+record_id,...changes});
const amount=(record_id,amount_cents)=>({record_id,amount_cents});
const input=(left,right,changes={})=>({scope,relation:'TRANSFER_DEPOSIT',left,right,...changes});
const rejects=(run,code)=>assert.throws(run,e=>e.code==='FINANCIAL_CASH_'+code);
const manual={confirmed:true,reason_code:'OPERATOR_VERIFIED'};

test('T05 two receivables settle one bank deposit without another revenue recognition',()=>{
  const records=[record('order-a','RECEIVABLE',6000),record('order-b','RECEIVABLE',4000),record('bank-a','BANK_TRANSACTION',10000)];
  const group=projectFinancialAllocation(input([amount('order-a',6000),amount('order-b',4000)],[amount('bank-a',10000)],{relation:'RECEIVABLE_DEPOSIT',confirmation:manual}),{records});
  assert.equal(group.left_total_cents,10000);assert.equal(group.right_total_cents,10000);assert.equal(group.state,'CONFIRMED');assert.equal(group.accounting_effect,'SETTLEMENT_ONLY_NO_NEW_REVENUE');assert.notEqual(group.left[0].account_id,group.right[0].account_id);
});
test('T05 one transfer can settle in installments; allocated fractions cannot be reused',()=>{
  const records=[record('transfer','TRANSFER',10000),record('bank-a','BANK_TRANSACTION',4000),record('bank-b','BANK_TRANSACTION',6000)];
  const first=projectFinancialAllocation(input([amount('transfer',4000)],[amount('bank-a',4000)],{confirmation:manual}),{records});
  const used=new Map(first.usage.map(r=>[r.record_id,r.new_cents]));
  assert.equal(projectFinancialAllocation(input([amount('transfer',6000)],[amount('bank-b',6000)],{confirmation:manual}),{records,used_cents:used}).left_total_cents,6000);
  rejects(()=>projectFinancialAllocation(input([amount('transfer',7000)],[amount('bank-b',7000)],{confirmation:manual}),{records,used_cents:used}),'ALLOCATION_EXCEEDS_AVAILABLE');
});
test('an explained fee has its own confirmed evidence and its monetary fraction is consumed',()=>{
  const records=[record('transfer','TRANSFER',10000),record('bank','BANK_TRANSACTION',9900),record('fee','FEE',100)];
  const data=input([amount('transfer',10000)],[amount('bank',9900)],{adjustments:[{...amount('fee',100),side:'RIGHT'}],confirmation:manual});
  assert.equal(projectFinancialAllocation(data,{records}).right_total_cents,10000);
  rejects(()=>projectFinancialAllocation({...data,adjustments:[]},{records}),'GROUP_NOT_BALANCED');
  rejects(()=>projectFinancialAllocation(data,{records:records.map(r=>r.kind==='FEE'?{...r,status:'REQUESTED'}:r)}),'ADJUSTMENT_EVIDENCE_REQUIRED');
});
test('T12 obligation payment settles a recorded obligation and a bank debit without recognizing expense again',()=>{
  const records=[record('october-obligation','OBLIGATION',5000,{date:'2026-10-10'}),record('november-payment','BANK_TRANSACTION',-5000)];
  const group=projectFinancialAllocation(input([amount('october-obligation',5000)],[amount('november-payment',5000)],{relation:'OBLIGATION_PAYMENT',confirmation:manual}),{records});
  assert.equal(group.accounting_effect,'SETTLEMENT_ONLY_NO_NEW_REVENUE');assert.equal(group.right_total_cents,5000);
  rejects(()=>projectFinancialAllocation({...input([amount('october-obligation',5000)],[amount('november-payment',5000)]),relation:'RECEIVABLE_DEPOSIT'},{records}),'RECORD_STATUS_INCOMPATIBLE');
});
test('T06 amount/date matching is only a suggestion and requires explicit manual confirmation',()=>{
  const records=[record('transfer','TRANSFER',100),record('bank','BANK_TRANSACTION',100)];
  assert.equal(projectFinancialAllocation(input([amount('transfer',100)],[amount('bank',100)]),{records}).state,'SUGGESTED');
  rejects(()=>projectFinancialAllocation(input([amount('transfer',100)],[amount('bank',100)],{confirmation:{confirmed:false,reason_code:'OPERATOR_VERIFIED'}}),{records}),'CONFIRMATION_INVALID');
});
test('automatic settlement requires server-approved rule and unique native identity, not amount/date confidence',()=>{
  const records=[record('transfer','TRANSFER',100,{native_reference:'native-transfer-a',identity_unique:true}),record('bank','BANK_TRANSACTION',100,{native_reference:'native-transfer-a',identity_unique:true})];
  const rule={...scope,rule_id:'rule-a',revision:1,enabled:true,approved:true,evidence_id:'approval-a',relation:'TRANSFER_DEPOSIT'};
  const data=input([amount('transfer',100)],[amount('bank',100)],{automatic_rule:rule});
  assert.equal(projectFinancialAllocation(data,{records}).confirmation,'APPROVED_IDENTITY_RULE');
  rejects(()=>projectFinancialAllocation(data,{records:records.map(r=>({...r,identity_unique:false}))}),'AUTOMATIC_IDENTITY_NOT_PROVEN');
  rejects(()=>projectFinancialAllocation({...data,automatic_rule:{...rule,approved:false}},{records}),'AUTOMATIC_RULE_NOT_AUTHORIZED');
});
test('T01 stable native identity deduplicates API/file observations while same-value legitimate deposits stay distinct',()=>{
  const a={...scope,account_id:'bank-a',source:'NUBANK',amount_cents:5000,date:'2026-11-13',native_id:'native-a'};
  assert.equal(compareFinancialCashIdentity(a,{...a,origin:'FILE'}).state,'SAME');
  assert.equal(compareFinancialCashIdentity(a,{...a,native_id:'native-b'}).state,'DISTINCT');
  assert.equal(compareFinancialCashIdentity({...a,native_id:null},{...a,native_id:null}).state,'REVIEW');
  assert.equal(compareFinancialCashIdentity(a,{...a,amount_cents:4000}).state,'REVIEW');
  assert.equal(compareFinancialCashIdentity(a,{...a,organization_id:'synthetic-org-b'}).state,'DISTINCT');
});
test('T21 cent values, overflow, negative sign, duplicate records and unknown values are validated',()=>{
  const records=[record('transfer','TRANSFER',Number.MAX_SAFE_INTEGER),record('bank','BANK_TRANSACTION',Number.MAX_SAFE_INTEGER)];
  assert.equal(projectFinancialAllocation(input([amount('transfer',1)],[amount('bank',1)]),{records}).left_total_cents,1);
  rejects(()=>projectFinancialAllocation(input([amount('transfer',0)],[amount('bank',0)]),{records}),'ITEMS_INVALID');
  rejects(()=>projectFinancialAllocation(input([amount('transfer',1.1)],[amount('bank',1.1)]),{records}),'ITEMS_INVALID');
  rejects(()=>projectFinancialAllocation(input([amount('transfer',1)],[amount('bank',1)]),{records:[...records,records[0]]}),'RECORD_ID_AMBIGUOUS');
  rejects(()=>projectFinancialAllocation(input([amount('transfer',1)],[amount('bank',1)]),{records:records.map(r=>({...r,amount_cents:null}))}),'RECORD_INVALID');
  const large=[record('t1','TRANSFER',Number.MAX_SAFE_INTEGER),record('t2','TRANSFER',1),record('b1','BANK_TRANSACTION',Number.MAX_SAFE_INTEGER),record('b2','BANK_TRANSACTION',1)];
  rejects(()=>projectFinancialAllocation(input([amount('t1',Number.MAX_SAFE_INTEGER),amount('t2',1)],[amount('b1',Number.MAX_SAFE_INTEGER),amount('b2',1)]),{records:large}),'AMOUNT_OVERFLOW');
});
test('T23 identical external IDs in other business scopes are rejected, never mixed',()=>{
  const records=[record('transfer','TRANSFER',100),record('bank','BANK_TRANSACTION',100,{organization_id:'synthetic-org-b'})];
  rejects(()=>projectFinancialAllocation(input([amount('transfer',100)],[amount('bank',100)]),{records}),'RECORD_SCOPE_MISMATCH');
});
