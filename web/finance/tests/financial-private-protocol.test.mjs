import test from 'node:test';
import assert from 'node:assert/strict';
import {financialPrivateProtocol,financialPrivateKind,readFinancialPrivateJson,exchangeFinancialPrivate,financialPrivateResponseMatches} from '../src/financial-private-protocol.mjs';
import {collectFinancialSourceStep} from '../src/financial-source-collection.mjs';
import {sourceCommand,sourceFrame,sourceCapabilities,privateScope,privateNow,privateJson} from './financial-private-fixture.mjs';

const protocol=financialPrivateProtocol('sources'),target='https://auth.brazacommerce.com.br'+protocol.path;
const exchange=(body,input=sourceCommand(),options={})=>exchangeFinancialPrivate(target,protocol,input,{send:async()=>privateJson(body),...options});

test('private protocol destinations and request shapes are finite before any transport IO',async()=>{
 assert.equal(financialPrivateProtocol('wallet'),null);assert.equal(financialPrivateKind(protocol.path+'?scope=other'),null);assert.equal(financialPrivateKind(protocol.path+'/'),null);
 let calls=0;const send=async()=>{calls++;throw Error('must not send');};
 for(const input of [{...sourceCommand(),scope:privateScope},{...sourceCommand(),limit:101},{...sourceCommand(),cursor:'a'.repeat(64)},null])assert.equal((await exchangeFinancialPrivate(target,protocol,input,{send})).status,400);
 for(const timeoutMs of [0,4,45001,NaN])assert.equal((await exchangeFinancialPrivate(target,protocol,sourceCommand(),{send,timeoutMs})).status,503);
 assert.equal(calls,0);
 const tiny={...protocol,requestMaximum:2};assert.equal((await exchangeFinancialPrivate(target,tiny,sourceCommand(),{send})).status,413);assert.equal(calls,0);
});

test('bounded JSON reader rejects declared and streamed overflow, content confusion and invalid UTF8',async()=>{
 for(const response of [new Response('{}',{headers:{'content-type':'text/html'}}),privateJson({},200,{'content-length':'20'}),privateJson({},200,{'content-length':'-1'}),new Response('{',{headers:{'content-type':'application/json'}}),new Response(new Uint8Array([0xc3,0x28]),{headers:{'content-type':'application/json'}}),new Response('123456789',{headers:{'content-type':'application/json'}})])await assert.rejects(readFinancialPrivateJson(response,8));
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array([123]));controller.enqueue(new Uint8Array(10));controller.close();}});await assert.rejects(readFinancialPrivateJson(new Response(stream,{headers:{'content-type':'application/json'}}),8));
 assert.deepEqual(await readFinancialPrivateJson(privateJson({a:1},200,{'content-type':'application/json; charset="utf-8"'}),32),{a:1});
});

test('source exchange enforces run and cursor identity and rejects unreviewed source fields',async()=>{
 assert.equal((await exchange(sourceFrame())).status,200);
 assert.equal((await exchange(sourceFrame({run_id:'10000000-0000-4000-8000-000000000001'}))).status,502);
 const wrongCursor=sourceFrame({count:0,cursor:'a'.repeat(64)});assert.equal((await exchange(wrongCursor)).status,502);
 const corrupt=sourceFrame();corrupt.facts[0].order_sn='SYNTHETIC_PRIVATE_ORDER';assert.equal((await exchange(corrupt)).status,502);
});

test('source exchange binds revision, protocol version, command kind and requested page size',async()=>{
 for(const [input,body] of [[sourceCommand({expected_revision:2}),sourceFrame({revision:1})],[sourceCommand(),sourceFrame({version:2})],[sourceCommand({limit:1}),sourceFrame({count:2})],[{schema:'financial_source_request_v1',operation:'capabilities'},sourceFrame()]])assert.equal((await exchange(body,input)).status,502);
 assert.equal(financialPrivateResponseMatches(sourceCommand({expected_revision:2}),sourceFrame({revision:1})),false);
});

test('allocation response must match read operation, mutation revision and requested reversal group',async()=>{
 const p=financialPrivateProtocol('allocations'),scope={organization_id:privateScope.organization_id,store_id:privateScope.store_id,currency:'BRL'},read={schema:'financial_cash_allocation_request_v1',operation:'read',cursor:null,limit:2},reverse={schema:read.schema,operation:'reverse',request_id:'synthetic-request',expected_revision:1,group_id:'synthetic-group',reason_code:'OPERATOR_VERIFIED'};
 const mutation={schema:'financial_cash_allocation_mutation_v1',operation:'reverse',scope,request_id:reverse.request_id,group_id:'other-group',revision:2,replayed:false};
 const send=async input=>exchangeFinancialPrivate('https://auth.brazacommerce.com.br'+p.path,p,input,{send:async()=>privateJson(mutation)});
 assert.equal((await send(read)).status,502);assert.equal((await send(reverse)).status,502);mutation.group_id=reverse.group_id;mutation.revision=3;assert.equal((await send(reverse)).status,502);mutation.revision=2;assert.equal((await send(reverse)).status,200);
});

test('errors are minimized and returned transport headers never become account cookies',async()=>{
 const result=await exchangeFinancialPrivate(target,protocol,sourceCommand(),{send:async()=>privateJson({error:'FINANCIAL_SOURCE_CURSOR_STALE',message:'SYNTHETIC_SECRET',access_token:'SYNTHETIC_TOKEN'},409,{'set-cookie':'synthetic=unsafe'})});
 assert.deepEqual(result,{status:409,body:{schema:'financial_private_error_v1',error:'FINANCIAL_SOURCE_CURSOR_STALE'}});assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC|cookie|access_token/);
 const malformed=await exchangeFinancialPrivate(target,protocol,sourceCommand(),{send:async()=>privateJson({error:'SYNTHETIC_SECRET'},500)});assert.equal(malformed.status,502);assert.equal(malformed.body.error,'FINANCIAL_PRIVATE_UNAVAILABLE');
});

test('timeout aborts one request without retry and cancels a stalled response stream',async()=>{
 let calls=0,signal;const result=await exchangeFinancialPrivate(target,protocol,sourceCommand(),{timeoutMs:10,send:async request=>{calls++;signal=request.signal;return new Promise(()=>{});}});assert.equal(result.status,504);assert.equal(result.body.error,'FINANCIAL_PRIVATE_TIMEOUT');assert.equal(signal.aborted,true);assert.equal(calls,1);
 let canceled=false;const stream=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){canceled=true;}});const stalled=await exchangeFinancialPrivate(target,protocol,sourceCommand(),{timeoutMs:10,send:async()=>new Response(stream,{headers:{'content-type':'application/json'}})});assert.equal(stalled.status,504);assert.equal(canceled,true);
});

test('unverified source grant causes zero provider IO and zero checkpoint mutations',async()=>{
 let reads=0,writes=0;const capability=sourceCapabilities().sources.find(s=>s.source==='WALLET');assert.equal(capability.grant.state,'UNKNOWN');
 const step=await collectFinancialSourceStep({scope:privateScope,source:'WALLET',capability,window:{start_at:'2026-11-01T00:00:00Z',end_at:'2026-11-13T00:00:00Z'},readPage:async()=>{reads++;throw Error();},persistCheckpoint:async()=>{writes++;throw Error();},authorize:async()=>true,now:privateNow});assert.equal(step.state,'BLOCKED');assert.equal(step.provider_reads,0);assert.equal(reads,0);assert.equal(writes,0);assert.deepEqual(step.facts,[]);
});
