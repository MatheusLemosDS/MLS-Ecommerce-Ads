import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';
import {readFinancialAutomationCashPage} from '../src/financial-automation-cash-sources.mjs';
import {financialAccountingPeriod} from '../src/financial-accounting-schedule.mjs';
import {projectFinancialAccounting} from '../src/financial-accounting-projection.mjs';
import {appendFinancialEvents,readFinancialEvents,readFinancialEventHistory} from '../src/financial-event-store.mjs';
import {financialEventContentHash,validateFinancialEvent} from '../src/financial-event-ledger.mjs';
import {getFinanceFinancialAutomation} from '../src/app-financial-automation.mjs';
import {EXTERNAL_CASH_PATH} from '../../finance/src/external-cash-frame.mjs';
import {FINANCIAL_ALLOCATION_PATH} from '../../finance/src/financial-allocation-frame.mjs';
import {createExternalCashWorker} from '../../finance/src/external-cash-worker.mjs';
import {createFinancialAllocationWorker} from '../../finance/src/financial-allocation-worker.mjs';
import {readExternalCashWorkspace,previewExternalCashImport,mutateExternalCash} from '../../finance/src/external-cash-store.mjs';

const scope={organization_id:'legacy-brazacommerce',store_id:'legacy-shopee',account_id:'operating-book',currency:'BRL'};
const fixed=Date.parse('2026-11-13T18:00:00Z'),now=()=>fixed,period=financialAccountingPeriod({kind:'MONTH',anchor:'2026-11'});
const input=(source='NUBANK',extra={})=>({scope,period,month:'2026-11',source,now,...extra});
const selected=(record_id,amount_cents)=>({record_id,amount_cents});
const legacySnapshot=f=>f.env.FINANCE_DB.db.prepare("SELECT name,sql FROM sqlite_master WHERE type IN('table','trigger','index') ORDER BY name").all();
async function fixture({bank=[10000],transfers=[10000]}={}){
  const env={APP_INTERNAL_SECRET:'synthetic-app-secret',FINANCE_ROUTER_SECRET:'synthetic-router-secret-'.repeat(3),FINANCE_CONNECTION_ENABLED:'false',FINANCE_DB:new D1(),ADMIN_DB:new D1()},calls=[];
  const cash=createExternalCashWorker({readWorkspace:readExternalCashWorkspace,previewImport:previewExternalCashImport,mutate:mutateExternalCash}),allocations=createFinancialAllocationWorker({now});
  env.COMMERCIAL_FETCH=async request=>{
    const path=new URL(request.url).pathname;calls.push(path);
    assert.equal(request.headers.get('cookie'),null);assert.equal(request.headers.get('authorization'),null);
    const forwarded=new Request(request.url,{method:request.method,headers:{'content-type':'application/json','x-braza-finance-router':env.FINANCE_ROUTER_SECRET},body:await request.text()});
    if(path===EXTERNAL_CASH_PATH)return cash.fetch(forwarded,env);
    if(path===FINANCIAL_ALLOCATION_PATH)return allocations.fetch(forwarded,env);
    throw Error('Unexpected synthetic route');
  };
  let document=0;
  const save=async(source,amounts)=>{
    if(!amounts.length)return;
    const value={schema:'external_cash_request_v1',operation:'preview',source,bank_account_declared:true,completed_transfers_declared:source==='SHOPEE',document_hash:(++document).toString(16).padStart(64,'0'),selection:{format:source==='NUBANK'?'nubank_csv':'shopee_csv',date_format:'YMD',amount_format:'DECIMAL'},rows:amounts.map((amount_cents,index)=>({line:index+1,date:'2026-11-10',amount_cents,external_id:'SYNTHETIC_PRIVATE_EXTERNAL_'+document+'_'+index,reference:'SYNTHETIC_PRIVATE_REFERENCE',description:'SYNTHETIC_PRIVATE_BANK_DESCRIPTION',reported_status:null}))};
    const preview=await previewExternalCashImport(env,value);
    await mutateExternalCash(env,{...value,operation:'import',request_id:crypto.randomUUID(),expected_revision:preview.revision,preview_hash:preview.preview_hash,confirmed:true},{now});
  };
  await save('NUBANK',bank);await save('SHOPEE',transfers);
  const records=async source=>(await readExternalCashWorkspace(env,{schema:'external_cash_request_v1',operation:'read',month:'2026-11',source,limit:100})).records;
  const confirm=async(amount=4000)=>{
    const banks=await records('NUBANK'),payouts=await records('SHOPEE');
    const response=await getFinanceFinancialAutomation(env,'allocations',{schema:'financial_cash_allocation_request_v1',operation:'confirm',request_id:crypto.randomUUID(),expected_revision:0,relation:'TRANSFER_DEPOSIT',left:[selected(payouts[0].record_id,amount)],right:[selected(banks[0].record_id,amount)],confirmation:{confirmed:true,reason_code:'OPERATOR_VERIFIED'}});
    assert.equal(response.status,200);return response.body;
  };
  return {env,calls,save,records,confirm,close(){env.FINANCE_DB.db.close();env.ADMIN_DB.db.close();}};
}

test('real imported transfer and bank contracts produce bounded, private REVIEW journal observations without new revenue',async()=>{
  const f=await fixture({bank:[10000,10000,-500]});try{
    const before=legacySnapshot(f);f.calls.length=0;
    const bank=await readFinancialAutomationCashPage(f.env,input()),payout=await readFinancialAutomationCashPage(f.env,input('SHOPEE'));
    assert.deepEqual(f.calls,[EXTERNAL_CASH_PATH,FINANCIAL_ALLOCATION_PATH,EXTERNAL_CASH_PATH,FINANCIAL_ALLOCATION_PATH]);
    assert.deepEqual(legacySnapshot(f),before,'source reading must not initialize or alter schemas');
    assert.equal(bank.events.length,3);assert.equal(payout.events.length,1);
    for(const event of [...bank.events,...payout.events]){assert.ok(validateFinancialEvent(event,{scope}));assert.equal(event.quality,'REVIEW');assert.equal(event.source.identity,'CONSERVATIVE');assert.equal(event.competence_at,null);assert.equal(event.settlement_at,null);assert.equal(event.postings.some(row=>['REVENUE','OTHER_INCOME','OWNER_CAPITAL','LOAN_PAYABLE'].includes(row.account)),false);}
    assert.ok(bank.events.every(event=>event.postings.length===0),'unclassified credits/debits must not infer revenue, loans or costs');
    assert.deepEqual(payout.events[0].postings.map(row=>[row.account,row.amount_cents]),[['TRANSFER_IN_TRANSIT',10000],['WALLET_AVAILABLE',-10000]]);
    assert.equal(bank.counts.suggestions_ignored>0,true);assert.equal(bank.counts.observed_net_movement_cents,19500);
    assert.equal(new Set(bank.events.map(event=>event.event_id)).size,3,'equal date/value deposits retain distinct identities');
    assert.ok(bank.pending.includes('BANK_MOVEMENT_CLASSIFICATION_REQUIRED'));
    for(const value of [bank,payout]){assert.deepEqual(value.balances,[]);assert.notEqual(value.coverage[0].state,'COMPLETE');assert.equal(value.coverage[0].timezone_confirmed,false);assert.equal(value.coverage[0].comparison,'NOT_COMPARED');assert.equal(value.coverage[0].start_at,null);assert.doesNotMatch(JSON.stringify(value),/SYNTHETIC_PRIVATE|external_id|bank_description|actor_id|reason/);}
  }finally{f.close();}
});

test('operator allocation supplies minimized causal evidence and proposed settlement without promoting files to authoritative bank facts',async()=>{
  const f=await fixture();try{
    const confirmed=await f.confirm(),bank=await readFinancialAutomationCashPage(f.env,input());
    assert.equal(bank.counts.operator_links,1);assert.equal(bank.events[0].evidence.some(row=>row.kind==='OPERATOR_CASH_ALLOCATION'),true);
    assert.deepEqual(bank.events[0].postings.map(row=>[row.account,row.amount_cents]),[['BANK',4000],['TRANSFER_IN_TRANSIT',-4000]]);
    assert.equal(bank.events[0].event_at,'2026-11-10T03:00:00.000Z','date is anchored to imported day, not operator confirmation time');
    assert.notEqual(bank.events[0].event_at,new Date(confirmed.group.confirmed_at*1000).toISOString());
    assert.equal(bank.events[0].quality,'REVIEW');assert.equal(bank.events[0].source.identity,'CONSERVATIVE');
    const reversed=await getFinanceFinancialAutomation(f.env,'allocations',{schema:'financial_cash_allocation_request_v1',operation:'reverse',request_id:crypto.randomUUID(),expected_revision:1,group_id:confirmed.group_id,reason_code:'OPERATOR_VERIFIED'});assert.equal(reversed.status,200);
    const after=await readFinancialAutomationCashPage(f.env,input());assert.equal(after.events[0].event_id,bank.events[0].event_id);assert.deepEqual(after.events[0].postings,[]);assert.equal(after.events[0].evidence.some(row=>row.kind==='OPERATOR_CASH_ALLOCATION'),true);assert.notEqual(await financialEventContentHash(after.events[0]),await financialEventContentHash(bank.events[0]));
    assert.doesNotMatch(JSON.stringify(after),/SYNTHETIC_PRIVATE|actor_id|OPERATOR_VERIFIED/);
  }finally{f.close();}
});

test('legacy confirmed one-to-one evidence remains available to the adapter without implying physical account verification',async()=>{
  const f=await fixture();try{
    const banks=await f.records('NUBANK'),payouts=await f.records('SHOPEE');
    await mutateExternalCash(f.env,{schema:'external_cash_request_v1',operation:'match',request_id:crypto.randomUUID(),expected_revision:2,confirmed:true,reason:'SYNTHETIC_PRIVATE_OPERATOR_REASON',pairs:[{bank_record_id:banks[0].record_id,transfer_record_id:payouts[0].record_id}]},{now});
    const page=await readFinancialAutomationCashPage(f.env,input());assert.equal(page.events[0].evidence.some(row=>row.kind==='OPERATOR_CASH_MATCH'),true);assert.equal(page.events[0].postings.find(row=>row.account==='BANK').amount_cents,10000);assert.equal(page.events[0].quality,'REVIEW');assert.doesNotMatch(JSON.stringify(page),/SYNTHETIC_PRIVATE/);
  }finally{f.close();}
});

test('journal replay deduplicates imported records while financial projection never counts REVIEW movements or manufactures a balance',async()=>{
  const f=await fixture();try{
    await f.confirm();const bank=await readFinancialAutomationCashPage(f.env,input()),payout=await readFinancialAutomationCashPage(f.env,input('SHOPEE')),events=[...bank.events,...payout.events];
    const options={actor:'synthetic-operator',now,assertAuthorized:async()=>true};
    const first=await appendFinancialEvents(f.env,{scope,events,expected_revision:0,request_id:crypto.randomUUID()},options);assert.equal(first.changed_count,2);
    const again=await readFinancialAutomationCashPage(f.env,input('NUBANK',{now:()=>fixed+1000}));
    const retry=await appendFinancialEvents(f.env,{scope,events:[...again.events,...payout.events],expected_revision:first.ledger_revision,request_id:crypto.randomUUID()},{...options,now:()=>fixed+1000});assert.equal(retry.changed_count,0);assert.equal(retry.unchanged_count,2);assert.equal(retry.ledger_revision,first.ledger_revision);
    const saved=await readFinancialEvents(f.env,{scope,limit:100},{...options,now:()=>fixed+1000});assert.equal(saved.events.length,2);
    const projection=projectFinancialAccounting({scope,period,events:saved.events,coverage:[...bank.coverage,...payout.coverage],balances:[],checked_at:new Date(fixed+1000).toISOString()});
    assert.equal(projection.positions.bank.amount_cents,null);assert.equal(projection.positions.bank.known_movements_cents,null);assert.equal(projection.positions.transit.amount_cents,null);assert.equal(projection.result.amount_cents,null);assert.equal(projection.result.known_amount_cents,null);assert.equal(projection.close_readiness.BANK_CASH.ready,false);
    const history=await readFinancialEventHistory(f.env,{scope,event_id:bank.events[0].event_id},options);assert.equal(history.versions.length,1);assert.deepEqual(history.versions[0].delta,[],'a review observation never writes counted postings');
  }finally{f.close();}
});

test('one page is bounded and revision changes reset the checkpoint instead of skipping or duplicating records',async()=>{
  const f=await fixture({bank:[10000,10000,10000]});try{
    f.calls.length=0;const first=await readFinancialAutomationCashPage(f.env,input('NUBANK',{limit:1}));assert.equal(first.events.length,1);assert.equal(first.has_more,true);assert.equal(f.calls.length,2);
    const next=await readFinancialAutomationCashPage(f.env,input('NUBANK',{limit:1,cursor:first.checkpoint.cursor,expected_revision:first.checkpoint.expected_revision}));assert.notEqual(first.events[0].event_id,next.events[0].event_id);
    await f.save('NUBANK',[7000]);
    const stale=await readFinancialAutomationCashPage(f.env,input('NUBANK',{limit:1,cursor:next.checkpoint.cursor,expected_revision:next.checkpoint.expected_revision}));assert.deepEqual(stale.events,[]);assert.equal(stale.has_more,true);assert.equal(stale.checkpoint.cursor,null);assert.equal(stale.checkpoint.expected_revision,null);assert.ok(stale.pending.includes('IMPORTED_CASH_CURSOR_STALE'));
  }finally{f.close();}
});

test('unknown, forbidden and malformed sources expose finite diagnostics and no private exception data',async()=>{
  const f=await fixture({bank:[],transfers:[]});try{
    const cold=await readFinancialAutomationCashPage(f.env,input());assert.deepEqual(cold.events,[]);assert.deepEqual(cold.balances,[]);assert.equal(cold.has_more,false);assert.equal(cold.coverage[0].state,'UNKNOWN');assert.equal(f.env.FINANCE_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);
    for(const options of [{readCash:async()=>{throw Error('SYNTHETIC_PRIVATE_ERROR');}},{readCash:async()=>({status:403,body:{private:'SYNTHETIC_PRIVATE'}})}]){const page=await readFinancialAutomationCashPage(f.env,input(),options);assert.deepEqual(page.events,[]);assert.deepEqual(page.balances,[]);assert.equal(page.has_more,true);assert.doesNotMatch(JSON.stringify(page),/PRIVATE|private/);}
    await assert.rejects(()=>readFinancialAutomationCashPage(f.env,input(),{readCash:async()=>({status:200,body:{schema:'external_cash_workspace_v1',private:'SYNTHETIC_PRIVATE'}})}),e=>e.code==='FINANCIAL_CASH_SOURCE_RESPONSE_INVALID'&&e.status===502);
  }finally{f.close();}
});

test('scope, currency and unsupported callback boundaries are rejected before source access',async()=>{
  let reads=0;const options={readCash:async()=>{reads++;throw Error();}};
  for(const extra of [{scope:{...scope,organization_id:'other'}},{scope:{...scope,currency:'USD'}},{source:'UNKNOWN'},{month:'2026-12'},{limit:101},{records:[]},{now:()=>NaN},{period:financialAccountingPeriod({kind:'MANUFACTURE_WEEK',anchor:'2026-11-13'})}])await assert.rejects(()=>readFinancialAutomationCashPage({},input('NUBANK',extra),options));
  await assert.rejects(()=>readFinancialAutomationCashPage({COMMERCIAL_CONTEXT:{organizationId:scope.organization_id}},input(),options),e=>e.status===403);assert.equal(reads,0);
  await assert.rejects(()=>readFinancialAutomationCashPage({},input(),{...options,resolveClassification:()=>true}),e=>e.code==='FINANCIAL_CASH_SOURCE_CONFIGURATION');
  const f=await fixture();try{await assert.rejects(()=>readFinancialAutomationCashPage(f.env,input(),{readAllocations:async()=>({status:200,body:{schema:'financial_cash_allocation_workspace_v1',scope:{organization_id:'other',store_id:'legacy-shopee',currency:'BRL'},revision:0,groups:[],next_cursor:null}})}),e=>e.status===403);}finally{f.close();}
});

for(const minify of [false,true])test('saved cash adapter retains conservative source semantics in compiled ESM, minify='+minify,async()=>{
  const built=await build({entryPoints:[fileURLToPath(new URL('../src/financial-automation-cash-sources.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
  const compiled=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
  const f=await fixture();try{const page=await compiled.readFinancialAutomationCashPage(f.env,input());assert.equal(page.events[0].quality,'REVIEW');assert.equal(page.events[0].source.identity,'CONSERVATIVE');assert.equal(page.coverage[0].timezone_confirmed,false);assert.deepEqual(page.balances,[]);assert.doesNotMatch(JSON.stringify(page),/SYNTHETIC_PRIVATE/);}finally{f.close();}
});
