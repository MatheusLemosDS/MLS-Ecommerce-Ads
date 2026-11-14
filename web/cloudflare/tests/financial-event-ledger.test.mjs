import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinancialEvent,validateFinancialEvent,financialEventIdentity,financialPostingDelta,financialSafeSum,financialCanonicalJSON,financialEventContentHash,normalizeFinancialScope} from '../src/financial-event-ledger.mjs';
import {financialTestScope,financialTestEvent} from './financial-ledger-fixture.mjs';

test('balanced signed postings conserve exact cents, negative amounts and observed zero',async()=>{
 const value=await financialTestEvent();assert.equal(financialSafeSum(value.postings.map(x=>x.amount_cents)),0);
 const zero=await financialTestEvent({postings:value.postings.map(x=>({...x,amount_cents:0}))});assert.equal(financialSafeSum(zero.postings.map(x=>x.amount_cents)),0);
 assert.throws(()=>validateFinancialEvent({...value,postings:[{...value.postings[0],amount_cents:10001},value.postings[1]]}),/UNBALANCED/);
 for(const invalid of [-0,.01,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>validateFinancialEvent({...value,postings:[{...value.postings[0],amount_cents:invalid},value.postings[1]]}));
 assert.equal(financialSafeSum([Number.MAX_SAFE_INTEGER,-Number.MAX_SAFE_INTEGER]),0);assert.throws(()=>financialSafeSum([Number.MAX_SAFE_INTEGER,1]),/OVERFLOW/);
});

test('native event identity is transport-independent and isolated by organization store book and currency',async()=>{
 const event=await financialTestEvent(),id=event.event_id;
 assert.equal(await financialEventIdentity(event.scope,event.source),id);
 for(const scope of [financialTestScope({organization_id:'synthetic-org-b'}),financialTestScope({store_id:'synthetic-store-b'}),financialTestScope({account_id:'another-book'}),financialTestScope({currency:'USD'})])assert.notEqual(await financialEventIdentity(scope,event.source),id);
 const fromFile=await financialTestEvent({evidence:[{kind:'STATEMENT_LINE',reference:'synthetic-document',sha256:'a'.repeat(64)}]});assert.equal(fromFile.event_id,id);
 assert.throws(()=>validateFinancialEvent(event,{scope:financialTestScope({organization_id:'synthetic-org-b'})}),/SCOPE_MISMATCH/);
});

test('a weak identity remains explicitly reviewable rather than creating a confirmed duplicate fact',async()=>{
 const original=await financialTestEvent(),weak={provider:'BANK',family:'TRANSACTION',native_id:null,identity:'CONSERVATIVE',identity_key:'e'.repeat(64)};
 await assert.rejects(financialTestEvent({source:weak}),/REQUIRES_REVIEW/);
 const event=await financialTestEvent({source:weak,quality:'REVIEW',postings:[]});assert.equal(event.quality,'REVIEW');assert.deepEqual(financialPostingDelta(original,{...original,quality:'REVIEW'}),[{account:'RECEIVABLE',account_ref:'wallet-primary',amount_cents:-10000},{account:'REVENUE',account_ref:'sales',amount_cents:10000}]);
});

test('source revisions derive a balanced delta without adding the entire replacement twice',async()=>{
 const first=await financialTestEvent(),next={...first,version:2,postings:first.postings.map(x=>({...x,amount_cents:x.amount_cents/2}))};
 assert.deepEqual(financialPostingDelta(first,next),[{account:'RECEIVABLE',account_ref:'wallet-primary',amount_cents:-5000},{account:'REVENUE',account_ref:'sales',amount_cents:5000}]);
 assert.equal(await financialEventContentHash(first),await financialEventContentHash({...first,version:3,observed_at:'2026-11-13T17:01:00.000Z'}));
 assert.notEqual(await financialEventContentHash(first),await financialEventContentHash(next));
});

test('untrusted accessors, sparse arrays, symbols, foreign prototypes and partial scopes are rejected without evaluation',async()=>{
 const event=await financialTestEvent();let reads=0;const getters={...event};Object.defineProperty(getters,'postings',{get(){reads++;return event.postings;},enumerable:true});assert.throws(()=>validateFinancialEvent(getters));
 const posting=[...event.postings];Object.defineProperty(posting,'0',{get(){reads++;return event.postings[0];},enumerable:true});assert.throws(()=>validateFinancialEvent({...event,postings:posting}));assert.equal(reads,0);
 assert.throws(()=>financialCanonicalJSON({[Symbol('hidden')]:true}));assert.throws(()=>financialCanonicalJSON(new Date()));assert.throws(()=>financialCanonicalJSON([,1]));assert.throws(()=>normalizeFinancialScope({organization_id:'synthetic-org-a'}));
});

test('timestamps retain explicit UTC and reject impossible or future source dates',async()=>{
 const event=await financialTestEvent({event_at:'2026-10-10T12:00:00Z'});assert.equal(event.event_at,'2026-10-10T12:00:00.000Z');
 for(const event_at of ['2026-02-30T12:00:00Z','2026-10-10T12:00:00-03:00','2026-11-14T00:00:00Z'])await assert.rejects(financialTestEvent({event_at}));
});
