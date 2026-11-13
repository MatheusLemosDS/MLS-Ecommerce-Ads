import test from 'node:test';
import assert from 'node:assert/strict';
import {projectFinancialBankBalance,createAuthorizedFinancialBankConnector} from '../src/financial-bank-connector.mjs';
const scope={organization_id:'synthetic-org-a',store_id:'synthetic-store-a',account_id:'synthetic-bank-a',currency:'BRL'};
const start='2026-11-01T00:00:00-03:00',end='2026-12-01T00:00:00-03:00';
const balance=(amount_cents,at)=>({...scope,amount_cents,at,evidence_id:'statement-a',confirmed:true});
const tx=(record_id,amount_cents)=>({...scope,record_id,amount_cents,at:'2026-11-10T12:00:00-03:00',status:'POSTED',evidence_id:'statement-a'});
const statement=(changes={})=>({scope,opening:balance(1000,start),closing:balance(1300,end),transactions:[tx('credit-a',500),tx('debit-a',-200)],coverage:{state:'COMPLETE',evidence_id:'statement-a',confirmed:true,start_at:start,end_at:end},...changes});
test('T19 same-account opening plus credits minus debits equals closing',()=>{
  const r=projectFinancialBankBalance(statement());assert.equal(r.state,'RECONCILED');assert.equal(r.computed_closing_cents,1300);assert.equal(r.difference_cents,0);assert.equal(r.observed_credit_cents,500);assert.equal(r.observed_debit_cents,200);assert.equal(r.realized_profit_cents,null);
});
test('T19 unexplained difference remains visible and never generates a balancing entry',()=>{
  const r=projectFinancialBankBalance(statement({closing:balance(1350,end)}));assert.equal(r.state,'DIVERGENT');assert.equal(r.difference_cents,50);assert.deepEqual(r.pending,['BANK_BALANCE_DIFFERENCE']);assert.equal(r.closing_balance_cents,1350);
});
test('T20 imported transactions without opening/closing/completeness never prove a bank balance',()=>{
  const r=projectFinancialBankBalance(statement({opening:null,closing:null,coverage:{state:'PARTIAL'}}));assert.equal(r.state,'PARTIAL');assert.equal(r.closing_balance_cents,null);assert.equal(r.computed_closing_cents,null);assert.equal(r.difference_cents,null);assert.equal(r.observed_movement_cents,300);assert.ok(r.pending.includes('BANK_COVERAGE_UNCONFIRMED'));
  const empty=projectFinancialBankBalance(statement({opening:null,closing:null,transactions:[],coverage:{state:'UNKNOWN'}}));assert.equal(empty.state,'UNKNOWN');assert.equal(empty.closing_balance_cents,null);
});
test('T21 a confirmed empty interval can have a real zero balance; partial coverage cannot',()=>{
  const data=statement({opening:balance(0,start),closing:balance(0,end),transactions:[]});assert.equal(projectFinancialBankBalance(data).state,'RECONCILED');assert.equal(projectFinancialBankBalance({...data,coverage:{state:'PARTIAL'}}).state,'PARTIAL');
});
test('account, currency, interval, timezone and integer overflow remain strict',()=>{
  for(const data of [statement({transactions:[tx('a',1),tx('a',1)]}),statement({transactions:[{...tx('a',1),account_id:'bank-b'}]}),statement({transactions:[{...tx('a',1),at:end}]}),statement({opening:{...balance(1000,start),at:'2026-11-01T00:00:00'}}),statement({transactions:[tx('a',Number.MAX_SAFE_INTEGER),tx('b',1)]})])assert.throws(()=>projectFinancialBankBalance(data));
  const r=projectFinancialBankBalance(statement({coverage:{state:'COMPLETE',confirmed:true,evidence_id:'statement-a',start_at:'2026-11-02T00:00:00-03:00',end_at:end}}));assert.equal(r.state,'PARTIAL');assert.ok(r.pending.includes('BANK_COVERAGE_INTERVAL_MISMATCH'));
});
test('a bank connector is unavailable until an explicit scoped adapter and active consent exist',async()=>{
  let calls=0;const connector=createAuthorizedFinancialBankConnector({authorize:async()=>true});
  assert.equal((await connector.capability(scope)).reason,'NO_AUTHORIZED_CONNECTOR');assert.equal((await connector.readStatement({scope,start_at:start,end_at:end})).state,'UNAVAILABLE');assert.equal(calls,0);
  const other=createAuthorizedFinancialBankConnector({adapter:{id:'synthetic-adapter',readStatement:async()=>{calls++;return statement();}},consent:{...scope,active:true,expires_at:'2026-12-31T00:00:00Z',evidence_id:'consent-a'},authorize:async()=>true,now:()=>Date.parse('2026-11-13T12:00:00Z')});
  assert.equal((await other.readStatement({scope,start_at:start,end_at:end})).projection.state,'RECONCILED');assert.equal(calls,1);
});
test('T23 revocation during connector read blocks delivery and another account is never accepted',async()=>{
  let allowed=true;
  const connector=createAuthorizedFinancialBankConnector({adapter:{id:'synthetic-adapter',readStatement:async()=>{allowed=false;return statement();}},consent:{...scope,active:true,expires_at:'2026-12-31T00:00:00Z',evidence_id:'consent-a'},authorize:async()=>allowed,now:()=>Date.parse('2026-11-13T12:00:00Z')});
  await assert.rejects(()=>connector.readStatement({scope,start_at:start,end_at:end}),e=>e.status===403);
});
test('connector projection does not return provider credentials or raw buyer/counterparty data',async()=>{
  const connector=createAuthorizedFinancialBankConnector({adapter:{id:'synthetic-adapter',readStatement:async()=>({...statement(),access_token:'SYNTHETIC_UNUSED_TOKEN',buyer_name:'SYNTHETIC_UNUSED_NAME',transactions:statement().transactions.map(t=>({...t,description:'SYNTHETIC_UNUSED_DESCRIPTION'}))})},consent:{...scope,active:true,expires_at:'2026-12-31T00:00:00Z',evidence_id:'consent-a'},authorize:async()=>true,now:()=>Date.parse('2026-11-13T12:00:00Z')});
  const result=await connector.readStatement({scope,start_at:start,end_at:end});assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_UNUSED/);assert.equal(result.projection.state,'RECONCILED');
});
test('consent account changes during a read cannot authorize delivery from the earlier account',async()=>{
  const consent={...scope,active:true,expires_at:'2026-12-31T00:00:00Z',evidence_id:'consent-a'};
  const connector=createAuthorizedFinancialBankConnector({adapter:{id:'synthetic-adapter',readStatement:async()=>{consent.account_id='synthetic-other-account';return statement();}},consent,authorize:async({capability})=>capability==='bank.read',now:()=>Date.parse('2026-11-13T12:00:00Z')});
  await assert.rejects(connector.readStatement({scope,start_at:start,end_at:end}),e=>e.code==='FINANCIAL_CASH_CONNECTOR_CONSENT_REVOKED');
});
