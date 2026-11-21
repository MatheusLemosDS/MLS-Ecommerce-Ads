import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {readProductionWeeklyPaymentsWorkspace,mutateProductionWeeklyPaymentsWorkspace} from '../src/production-weekly-payments.mjs';
import {projectProductionWeeklyPaymentsWorkspace,projectProductionWeeklyPaymentPreview} from '../src/production-weekly-payments-view.mjs';
import {commercialContextFromPrincipal,bindCommercialEnvironment} from '../src/commercial-context.mjs';

const fixed=Date.parse('2026-11-20T20:00:00.000Z'),now=()=>fixed,actor='synthetic-owner',options={now};
const query=provider_id=>({provider_id,cursor:null,history_cursor:null});
const id=()=>crypto.randomUUID();
const legacyScope={organization_id:'legacy-brazacommerce',store_id:'legacy-shopee'};
const read=(env,provider)=>readProductionWeeklyPaymentsWorkspace(env,query(provider),options);
const command=(provider,revision,action,extra={})=>({action,provider_id:provider,expected_revision:revision,request_id:id(),expected_scope:{...legacyScope},...extra});
const scopedCommand=(env,provider,revision,action,extra={})=>command(provider,revision,action,{...extra,expected_scope:{organization_id:env.COMMERCIAL_CONTEXT.organizationId,store_id:env.COMMERCIAL_CONTEXT.storeId}});
async function fixture(){
 const env={ADMIN_DB:new D1(),FINANCE_DB:new D1()},provider=id();
 const apply=body=>mutateProductionWeeklyPaymentsWorkspace(env,body,actor,options);
 const create=async(name='Synthetic sewing service',chosen=provider)=>apply(command(chosen,0,'save_provider',{name}));
 const add=async(week,amount,reference='invoice '+id(),chosen=provider)=>{const current=await read(env,chosen);return apply(command(chosen,current.selected.revision,'add_obligation',{obligation_id:id(),week_end:week,amount_cents:amount,reference}));};
 const prepare=async(amount,reference='receipt '+id(),chosen=provider,paid_on='2026-11-20')=>{
  const current=await read(env,chosen),body=command(chosen,current.selected.revision,'preview_payment',{payment_id:id(),amount_cents:amount,paid_on,reference});
  const proposal=await apply(body);return {proposal,body:{...body,action:'apply_payment',preview_hash:proposal.preview_hash}};
 };
 return {env,provider,apply,create,add,prepare,close(){env.ADMIN_DB.db.close();env.FINANCE_DB.db.close();}};
}
const tableCount=env=>Number(env.ADMIN_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n);
const code=(suffix,status)=>error=>error.code==='PRODUCTION_WEEKLY_PAYMENTS_'+suffix&&error.status===status;

test('cold reads and missing-provider previews are SELECT-only; no debt, manufacturing or bank fact is fabricated',async()=>{
 const f=await fixture();try{
  const fresh=await read(f.env,null);assert.deepEqual(fresh.providers,[]);assert.equal(fresh.selected,null);assert.equal(fresh.next_cursor,null);assert.deepEqual(fresh.history,{rows:[],next_cursor:null});assert.equal(fresh.money_transfer_allowed,false);assert.equal(fresh.bank_reconciliation_confirmed,false);assert.equal(tableCount(f.env),0);
  await assert.rejects(()=>f.apply(command(f.provider,0,'preview_payment',{payment_id:id(),amount_cents:120000,paid_on:'2026-11-20',reference:'Synthetic payment'})),code('PROVIDER_NOT_FOUND',404));assert.equal(tableCount(f.env),0);
  assert.equal(f.env.FINANCE_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);
 }finally{f.close();}
});

test('R$1000 and R$800 weeks receive R$1200 FIFO: oldest settled and exactly R$600 remains, with no duplicate cost or money movement',async()=>{
 const f=await fixture();try{
  await f.create();await f.add('2026-11-13',80000,'newer invoice');await f.add('2026-11-06',100000,'older invoice');
  const before=await read(f.env,f.provider),p=await f.prepare(120000,'synthetic transfer receipt');
  assert.deepEqual(p.proposal.allocations.map(r=>[r.week_end,r.amount_cents,r.remaining_cents]),[['2026-11-06',100000,0],['2026-11-13',20000,60000]]);
  assert.equal(p.proposal.outstanding_before_cents,180000);assert.equal(p.proposal.outstanding_after_cents,60000);assert.equal(p.proposal.money_transfer_allowed,false);
  assert.equal((await read(f.env,f.provider)).selected.revision,before.selected.revision,'preview cannot write');
  const saved=await f.apply(p.body);assert.equal(saved.mutation.replayed,false);assert.equal(saved.selected.outstanding_cents,60000);assert.equal(saved.selected.declared_amount_cents,180000);
  assert.deepEqual(saved.selected.obligations.map(r=>[r.week_end,r.status,r.settled_cents,r.remaining_cents]),[['2026-11-06','SETTLED',100000,0],['2026-11-13','OPEN',20000,60000]]);
  assert.deepEqual(saved.selected.payments[0].allocations.map(r=>r.amount_cents),[100000,20000]);assert.equal(saved.money_transfer_allowed,false);assert.equal(saved.bank_reconciliation_confirmed,false);
  assert.equal(f.env.FINANCE_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0,'no sidecar accounting write');
  assert.equal(f.env.ADMIN_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('incurred_production_state','financial_event_revisions','production_dtf_state','expense_ledger_state')").get().n,0,'no manufacture, expense or cost recognized by the payment book');
  const replay=await f.apply(p.body);assert.equal(replay.mutation.replayed,true);const current=await read(f.env,f.provider);assert.equal(current.selected.payments.length,1);assert.equal(current.selected.outstanding_cents,60000);assert.equal(current.selected.revision,saved.selected.revision);
 }finally{f.close();}
});

test('the same receipt cannot settle twice under a fresh request or payment ID, and changed material cannot reuse a request',async()=>{
 const f=await fixture();try{
  await f.create();await f.add('2026-11-06',180000);const p=await f.prepare(10000,'Receipt One');await f.apply(p.body);
  await assert.rejects(()=>f.prepare(10000,'RECEIPT   ONE'),code('PAYMENT_ALREADY_RECORDED',409));
  await assert.rejects(()=>f.apply({...p.body,amount_cents:11000}),error=>error.status===409);
  assert.equal((await read(f.env,f.provider)).selected.outstanding_cents,170000);
 }finally{f.close();}
});

test('a retry after later declarations preserves the original receipt revision and returns the current balanced workspace',async()=>{
 const f=await fixture();try{
  await f.create();await f.add('2026-11-06',100000);const p=await f.prepare(30000),first=await f.apply(p.body);await f.add('2026-11-13',80000);
  const replay=await f.apply(p.body);assert.equal(replay.mutation.replayed,true);assert.equal(replay.mutation.revision,first.mutation.revision);assert.equal(replay.selected.revision,first.selected.revision+1);assert.equal(replay.selected.outstanding_cents,150000);assert.equal(replay.selected.payments.length,1);assert.equal(replay.history.rows[0].revision,replay.selected.revision);assert.equal(replay.selected.payments[0].amount_cents,30000);assert.ok(projectProductionWeeklyPaymentsWorkspace(replay),'actual UI must accept an original receipt with a current workspace');
 }finally{f.close();}
});

test('an advancing real clock returns a post-write checked_at accepted by the actual UI contract',async()=>{
 const f=await fixture();try{
  let tick=0;const advancing={now:()=>fixed+tick++*17};
  const created=await mutateProductionWeeklyPaymentsWorkspace(f.env,command(f.provider,0,'save_provider',{name:'Advancing clock provider'}),actor,advancing);
  assert.ok(Date.parse(created.checked_at)>Date.parse(created.history.rows[0].created_at));assert.ok(projectProductionWeeklyPaymentsWorkspace(created));
  const invoice=await mutateProductionWeeklyPaymentsWorkspace(f.env,command(f.provider,created.selected.revision,'add_obligation',{obligation_id:id(),week_end:'2026-11-13',amount_cents:100000,reference:'Clock invoice'}),actor,advancing);assert.ok(projectProductionWeeklyPaymentsWorkspace(invoice));
  const previewBody=command(f.provider,invoice.selected.revision,'preview_payment',{payment_id:id(),amount_cents:10000,paid_on:'2026-11-20',reference:'Clock payment'}),preview=await mutateProductionWeeklyPaymentsWorkspace(f.env,previewBody,actor,advancing);assert.ok(projectProductionWeeklyPaymentPreview(preview,invoice.selected,invoice.scope));
  const paid=await mutateProductionWeeklyPaymentsWorkspace(f.env,{...previewBody,action:'apply_payment',preview_hash:preview.preview_hash},actor,advancing);assert.ok(projectProductionWeeklyPaymentsWorkspace(paid));assert.ok(Date.parse(paid.checked_at)>Date.parse(paid.history.rows[0].created_at));
 }finally{f.close();}
});

test('identical provider and obligation IDs in two legitimate stores cannot reuse the other store preview',async()=>{
 const raw=new D1();try{
  const context=async store=>commercialContextFromPrincipal({kind:'account',userId:'synthetic-user',organizationId:'synthetic-org',storeId:store,sessionId:'synthetic-session',membershipId:'synthetic-member',role:'OWNER',authorizationRevision:1,capabilities:['finance.read','finance.write']});
  const envs=await Promise.all(['one','two'].map(async store=>bindCommercialEnvironment({ACCOUNT_DB:raw},await context(store),{authorizationGuard:()=>({sql:'SELECT 1',bindings:[]})}))),provider=id(),obligation=id(),payment=id();
  for(const env of envs){await mutateProductionWeeklyPaymentsWorkspace(env,scopedCommand(env,provider,0,'save_provider',{name:'Identical provider'}),'synthetic-user',options);await mutateProductionWeeklyPaymentsWorkspace(env,scopedCommand(env,provider,1,'add_obligation',{obligation_id:obligation,week_end:'2026-11-13',amount_cents:100000,reference:'Identical invoice'}),'synthetic-user',options);}
  const body=scopedCommand(envs[0],provider,2,'preview_payment',{payment_id:payment,amount_cents:50000,paid_on:'2026-11-20',reference:'Identical receipt'}),bodyTwo={...body,expected_scope:{organization_id:'synthetic-org',store_id:'two'}},one=await mutateProductionWeeklyPaymentsWorkspace(envs[0],body,'synthetic-user',options),two=await mutateProductionWeeklyPaymentsWorkspace(envs[1],bodyTwo,'synthetic-user',options);
  assert.notDeepEqual(one.scope,two.scope);assert.notEqual(one.preview_hash,two.preview_hash);
  await assert.rejects(()=>mutateProductionWeeklyPaymentsWorkspace(envs[1],{...body,action:'apply_payment',preview_hash:one.preview_hash},'synthetic-user',options),code('SCOPE_CHANGED',409));
  await assert.rejects(()=>mutateProductionWeeklyPaymentsWorkspace(envs[1],{...bodyTwo,action:'apply_payment',preview_hash:one.preview_hash},'synthetic-user',options),code('PREVIEW_CHANGED',409));assert.equal((await read(envs[1],provider)).selected.payments.length,0);
  const accepted=await mutateProductionWeeklyPaymentsWorkspace(envs[0],{...body,action:'apply_payment',preview_hash:one.preview_hash},'synthetic-user',options);assert.equal(accepted.selected.outstanding_cents,50000);assert.ok(projectProductionWeeklyPaymentsWorkspace(accepted));
 }finally{raw.db.close();}
});

test('an old store draft cannot create a provider in another store and fails before any operational DDL',async()=>{
 const raw=new D1();try{
  const context=await commercialContextFromPrincipal({kind:'account',userId:'synthetic-user',organizationId:'synthetic-org',storeId:'two',sessionId:'synthetic-session',membershipId:'synthetic-member',role:'OWNER',authorizationRevision:1,capabilities:['finance.read','finance.write']}),env=bindCommercialEnvironment({ACCOUNT_DB:raw},context,{authorizationGuard:()=>({sql:'SELECT 1',bindings:[]})});
  const oldDraft=command(id(),0,'save_provider',{name:'Old store draft',expected_scope:{organization_id:'synthetic-org',store_id:'one'}});
  await assert.rejects(()=>mutateProductionWeeklyPaymentsWorkspace(env,oldDraft,'synthetic-user',options),code('SCOPE_CHANGED',409));assert.equal(raw.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);assert.deepEqual((await read(env,null)).providers,[]);
 }finally{raw.db.close();}
});

test('a stale preview or a forged digest is rejected and concurrent changes are retained',async()=>{
 const f=await fixture();try{
  await f.create();await f.add('2026-11-06',100000);const p=await f.prepare(50000);await f.add('2026-11-13',80000);
  await assert.rejects(()=>f.apply(p.body),error=>error.status===409);
  const current=await read(f.env,f.provider);await assert.rejects(()=>f.apply({...p.body,request_id:id(),expected_revision:current.selected.revision}),code('PREVIEW_CHANGED',409));
  const fresh=await f.prepare(50000);await assert.rejects(()=>f.apply({...fresh.body,preview_hash:'0'.repeat(64)}),code('PREVIEW_CHANGED',409));
  const after=await read(f.env,f.provider);assert.equal(after.selected.outstanding_cents,180000);assert.equal(after.selected.payments.length,0);assert.equal(after.selected.revision,current.selected.revision);
 }finally{f.close();}
});

test('payment dates cannot allocate to a later week or silently create an advance; future and invalid physical dates fail',async()=>{
 const f=await fixture();try{
  await f.create();await f.add('2026-11-06',100000);await f.add('2026-11-13',80000);
  await assert.rejects(()=>f.prepare(120000,'old payment',f.provider,'2026-11-10'),code('PAYMENT_EXCEEDS_OBLIGATIONS',409));
  const old=await f.prepare(100000,'eligible old payment',f.provider,'2026-11-10');assert.deepEqual(old.proposal.allocations.map(r=>r.week_end),['2026-11-06']);
  await assert.rejects(()=>f.prepare(180001),code('PAYMENT_EXCEEDS_OBLIGATIONS',409));
  for(const bad of ['2026-11-21','2026-02-30','invalid'])await assert.rejects(()=>f.prepare(1,'bad date '+bad,f.provider,bad),code('PAYMENT_DATE_INVALID',400));
  await assert.rejects(()=>f.add('2026-11-27',1000),code('WEEK_NOT_CLOSED',400));await assert.rejects(()=>f.add('2026-11-19',1000),code('WEEK_INVALID',400));
  assert.equal((await read(f.env,f.provider)).selected.payments.length,0);
 }finally{f.close();}
});

test('providers isolate debt and FIFO; a different provider cannot reuse a preview',async()=>{
 const f=await fixture();try{
  const other=id();await f.create();await f.create('Second synthetic provider',other);await f.add('2026-11-06',100000);await f.add('2026-10-30',900000,'other invoice',other);
  const p=await f.prepare(50000);const state=await read(f.env,other);
  await assert.rejects(()=>f.apply({...p.body,provider_id:other,expected_revision:state.selected.revision}),code('PREVIEW_CHANGED',409));
  await f.apply(p.body);assert.equal((await read(f.env,f.provider)).selected.outstanding_cents,50000);assert.equal((await read(f.env,other)).selected.outstanding_cents,900000);
 }finally{f.close();}
});

test('reversal restores only its original allocations once; cancellation and corrected receipt preserve audit rather than deleting history',async()=>{
 const f=await fixture();try{
  await f.create();await f.add('2026-11-06',100000);await f.add('2026-11-13',80000);const p=await f.prepare(120000,'receipt requiring correction');await f.apply(p.body);
  let state=await read(f.env,f.provider);const oldest=state.selected.obligations[0].obligation_id;
  await assert.rejects(()=>f.apply(command(f.provider,state.selected.revision,'cancel_obligation',{obligation_id:oldest,reason:'Cannot cancel a settled debt'})),code('OBLIGATION_NOT_CANCELLABLE',409));
  const undo=command(f.provider,state.selected.revision,'reverse_payment',{payment_id:p.body.payment_id,reason:'Correcting the declared amount; no bank transfer'});await f.apply(undo);const replay=await f.apply(undo);assert.equal(replay.mutation.replayed,true);
  state=await read(f.env,f.provider);assert.equal(state.selected.outstanding_cents,180000);assert.equal(state.selected.payments[0].status,'REVERSED');assert.equal(state.selected.payments[0].reason,'Correcting the declared amount; no bank transfer');
  await assert.rejects(()=>f.apply(command(f.provider,state.selected.revision,'reverse_payment',{payment_id:p.body.payment_id,reason:'second reversal'})),code('PAYMENT_ALREADY_REVERSED',409));
  const replacement=await f.prepare(110000,'receipt requiring correction');await f.apply(replacement.body);state=await read(f.env,f.provider);assert.equal(state.selected.outstanding_cents,70000);assert.equal(state.selected.payments.length,2);assert.equal(state.selected.payments.filter(r=>r.status==='ACTIVE').length,1);
  const undoNew=command(f.provider,state.selected.revision,'reverse_payment',{payment_id:replacement.body.payment_id,reason:'Obligation itself needs correction'});await f.apply(undoNew);state=await read(f.env,f.provider);
  const originalReference=state.selected.obligations.find(r=>r.obligation_id===oldest).reference;
  await f.apply(command(f.provider,state.selected.revision,'cancel_obligation',{obligation_id:oldest,reason:'Wrong invoice declared; retained in audit'}));state=await read(f.env,f.provider);assert.equal(state.selected.obligations[0].status,'CANCELLED');assert.equal(state.selected.outstanding_cents,80000);
  await f.add('2026-11-06',90000,originalReference);state=await read(f.env,f.provider);assert.equal(state.selected.obligations.length,3);assert.equal(state.selected.outstanding_cents,170000);assert.equal(state.history.rows.length,9);
  assert.deepEqual(state.history.rows.map(r=>r.command.action),['add_obligation','cancel_obligation','reverse_payment','apply_payment','reverse_payment','apply_payment','add_obligation','add_obligation','save_provider']);
 }finally{f.close();}
});

test('duplicate obligations, invalid cents and aggregate overflow fail without discarding the saved book',async()=>{
 const f=await fixture();try{
  await f.create();await f.add('2026-11-06',100000,'Invoice One');await assert.rejects(()=>f.add('2026-11-06',100000,'INVOICE   ONE'),code('OBLIGATION_ALREADY_RECORDED',409));
  for(const amount of [null,0,-0,-1,1.1,Number.MAX_SAFE_INTEGER+1,'100'])await assert.rejects(()=>f.add('2026-11-13',amount),code('AMOUNT_OR_REFERENCE_INVALID',400));
  let state=await read(f.env,f.provider);await assert.rejects(()=>f.apply({...command(f.provider,state.selected.revision,'save_provider',{name:'name'}),money_transfer_allowed:true}),code('REQUEST_INVALID',400));
  const other=id();await f.create('Overflow test',other);await f.add('2026-11-06',Number.MAX_SAFE_INTEGER,'largest integer',other);await assert.rejects(()=>f.add('2026-11-13',1,'would overflow',other),code('AMOUNT_OVERFLOW',400));
  state=await read(f.env,other);assert.equal(state.selected.obligations.length,1);assert.equal(state.selected.outstanding_cents,Number.MAX_SAFE_INTEGER);
 }finally{f.close();}
});

test('history remains accessible after the first25revisions and provider lists use real pagination',async()=>{
 const f=await fixture();try{
  await f.create();for(let i=0;i<28;i++)await f.add('2026-11-06',100+i,'Synthetic invoice '+i);
  const first=await read(f.env,f.provider);assert.equal(first.history.rows.length,25);assert.ok(first.history.next_cursor);
  const second=await readProductionWeeklyPaymentsWorkspace(f.env,{...query(f.provider),history_cursor:first.history.next_cursor},options);assert.equal(second.history.rows.length,4);assert.equal(second.history.next_cursor,null);const revisions=[...first.history.rows,...second.history.rows].map(r=>r.revision);assert.equal(new Set(revisions).size,29);
  for(let i=0;i<26;i++)await f.create('Synthetic provider '+i,id());
  const page1=await read(f.env,null);assert.equal(page1.providers.length,25);assert.ok(page1.next_cursor);const page2=await readProductionWeeklyPaymentsWorkspace(f.env,{...query(null),cursor:page1.next_cursor},options);assert.equal(page2.providers.length,2);assert.equal(new Set([...page1.providers,...page2.providers].map(r=>r.provider_id)).size,27);
 }finally{f.close();}
});

test('two sessions cannot consume the same outstanding revision',async()=>{
 const f=await fixture();try{
  await f.create();await f.add('2026-11-06',100000);const one=await f.prepare(70000,'Session one'),two=await f.prepare(60000,'Session two');
  const results=await Promise.allSettled([f.apply(one.body),f.apply(two.body)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
  const final=await read(f.env,f.provider);assert.equal(final.selected.payments.length,1);assert.equal(final.selected.outstanding_cents,100000-final.selected.payments[0].amount_cents);
 }finally{f.close();}
});

test('forged contexts, missing finance access and cross-store cursors do not read or mutate another business',async()=>{
 const raw=new D1();try{
  await assert.rejects(()=>read({ADMIN_DB:raw,COMMERCIAL_CONTEXT:{organizationId:'forged'}},null),error=>error.status===403);assert.equal(tableCount({ADMIN_DB:raw}),0);
  const principal=(store,capabilities)=>({kind:'account',userId:'synthetic-user',organizationId:'synthetic-org',storeId:store,sessionId:'synthetic-session',membershipId:'synthetic-member',role:'OWNER',authorizationRevision:1,capabilities});
  const context=await commercialContextFromPrincipal(principal('one',['finance.read','finance.write'])),second=await commercialContextFromPrincipal(principal('two',['finance.read','finance.write'])),reader=await commercialContextFromPrincipal(principal('one',['finance.read']));
  const bind=context=>bindCommercialEnvironment({ACCOUNT_DB:raw},context,{authorizationGuard:()=>({sql:'SELECT 1',bindings:[]})}),env=bind(context),other=bind(second),readOnly=bind(reader),provider=id();
  await mutateProductionWeeklyPaymentsWorkspace(env,scopedCommand(env,provider,0,'save_provider',{name:'Scoped provider'}),'synthetic-user',options);
  assert.equal((await read(env,provider)).selected.name,'Scoped provider');assert.deepEqual((await read(other,null)).providers,[]);await assert.rejects(()=>read(other,provider),code('PROVIDER_NOT_FOUND',404));
  await assert.rejects(()=>mutateProductionWeeklyPaymentsWorkspace(readOnly,scopedCommand(readOnly,provider,1,'save_provider',{name:'Unauthorized'}),'synthetic-user',options),error=>error.status===403);assert.equal((await read(env,provider)).selected.revision,1);
 }finally{raw.db.close();}
});
