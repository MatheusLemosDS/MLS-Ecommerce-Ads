import test from 'node:test';
import assert from 'node:assert/strict';
import {projectFinancialAllocationRequest,projectFinancialAllocationResponse,financialAllocationResponseMatches} from '../src/financial-allocation-frame.mjs';
import {projectFinancialAllocation} from '../src/financial-cash-allocation.mjs';
const scope={organization_id:'synthetic-org',store_id:'synthetic-store',currency:'BRL'};
const schema='financial_cash_allocation_request_v1',item=(record_id,amount_cents)=>({record_id,amount_cents});
const command=(operation='preview')=>({schema,operation,relation:'TRANSFER_DEPOSIT',left:[item('synthetic-transfer',100)],right:[item('synthetic-bank',100)]});
const records=[['synthetic-transfer','TRANSFER','COMPLETED'],['synthetic-bank','BANK_TRANSACTION','POSTED']].map(([record_id,kind,status])=>({...scope,record_id,kind,status,amount_cents:100,revision:1,account_id:kind==='TRANSFER'?'synthetic-wallet':'synthetic-bank',date:'2026-11-13',evidence_id:'synthetic-evidence',native_reference:null,identity_unique:false}));
const preview=()=>({schema:'financial_cash_allocation_preview_v1',scope,revision:0,group:projectFinancialAllocation({...command(),scope},{records})});
test('closed allocation requests carry selections but no caller-controlled scope, actor or source facts',()=>{
 assert.deepEqual(projectFinancialAllocationRequest({schema,operation:'read'}),{schema,operation:'read',limit:50,cursor:null});assert.ok(projectFinancialAllocationRequest(command()));
 for(const patch of [{scope},{records},{actor_id:'other-owner'},{automatic_rule:{approved:true}},{password:'synthetic-secret'},{operation:'withdraw'},{left:[item('synthetic-transfer',0)]},{right:[item('synthetic-bank',0.1)]}])assert.equal(projectFinancialAllocationRequest({...command(),...patch}),null);
 const getter={...command()};Object.defineProperty(getter,'secret',{enumerable:true,get(){throw Error('getter must not run');}});assert.equal(projectFinancialAllocationRequest(getter),null);
});
test('confirm requires revision and request identity, and cannot combine operator and automatic-rule authority',()=>{
 const c={...command('confirm'),request_id:'synthetic-request',expected_revision:0,confirmation:{confirmed:true,reason_code:'OPERATOR_VERIFIED'}};assert.ok(projectFinancialAllocationRequest(c));assert.equal(projectFinancialAllocationRequest({...c,rule_id:'rule-a'}),null);assert.equal(projectFinancialAllocationRequest({...c,expected_revision:Number.MAX_SAFE_INTEGER}),null);assert.equal(projectFinancialAllocationRequest({...c,confirmation:{confirmed:false,reason_code:'OPERATOR_VERIFIED'}}),null);
});
test('preview transport rejects unequal totals, extra raw data, duplicated fractions and foreign scope',()=>{
 const p=preview();assert.ok(projectFinancialAllocationResponse(p));assert.equal(financialAllocationResponseMatches(command(),p),true);
 for(const change of [{access_token:'synthetic-token'},{scope:{...scope,store_id:'other-store'}},{group:{...p.group,right_total_cents:99}},{group:{...p.group,buyer_name:'synthetic-buyer'}},{group:{...p.group,left:[...p.group.left,p.group.left[0]]}}])assert.equal(projectFinancialAllocationResponse({...p,...change}),null);
 assert.equal(projectFinancialAllocationResponse({...p,group:{...p.group,scope:{...scope,store_id:'other-store'}}}),null);
});
test('response matching fences operation, immutable replay revision and scope-containing groups',()=>{
 const c={...command('confirm'),request_id:'synthetic-request',expected_revision:0,confirmation:{confirmed:true,reason_code:'OPERATOR_VERIFIED'}};
 const group={...projectFinancialAllocation({...c,scope},{records}),group_id:'synthetic-group',revision:1,confirmed_at:1,actor_id:'synthetic-actor'};
 const response={schema:'financial_cash_allocation_mutation_v1',operation:'confirm',scope,request_id:c.request_id,group_id:group.group_id,revision:1,replayed:false,group};assert.ok(projectFinancialAllocationResponse(response));assert.equal(financialAllocationResponseMatches(c,response),true);assert.equal(financialAllocationResponseMatches({...c,expected_revision:1},response),false);assert.equal(financialAllocationResponseMatches({...c,request_id:'other-request'},response),false);
 const reverse={schema,operation:'reverse',request_id:'reverse-request',expected_revision:1,group_id:group.group_id,reason_code:'OPERATOR_VERIFIED'};const reversed={schema:response.schema,operation:'reverse',scope,request_id:reverse.request_id,group_id:group.group_id,revision:2,replayed:false};assert.equal(financialAllocationResponseMatches(reverse,reversed),true);assert.equal(projectFinancialAllocationResponse({...reversed,group}),null);
});
test('workspace continuation is tied to an exact safe revision',()=>{
 const p={schema:'financial_cash_allocation_workspace_v1',scope,revision:2,groups:[],next_cursor:'2:synthetic-group'};assert.ok(projectFinancialAllocationResponse(p));assert.equal(projectFinancialAllocationResponse({...p,next_cursor:'1:synthetic-group'}),null);assert.equal(projectFinancialAllocationRequest({schema,operation:'read',cursor:'9999999999999999:synthetic-group'}),null);
});
