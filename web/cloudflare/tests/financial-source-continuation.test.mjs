import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {createFinancialAutomationServices} from '../src/financial-automation-sources.mjs';
import {readFinancialAutomationCashPage} from '../src/financial-automation-cash-sources.mjs';
import {financialAccountingPeriod} from '../src/financial-accounting-schedule.mjs';
import {readFinancialSourceEvidence} from '../../finance/src/financial-source-worker.mjs';
import {readExternalCashWorkspace,previewExternalCashImport,mutateExternalCash} from '../../finance/src/external-cash-store.mjs';
import {projectExternalCashResponse,externalCashResponseMatches} from '../../finance/src/external-cash-frame.mjs';

const scope={organization_id:'legacy-brazacommerce',store_id:'legacy-shopee',account_id:'operating-book',currency:'BRL'};
const period=financialAccountingPeriod({kind:'MONTH',anchor:'2026-11'}),fixed=Date.parse('2026-11-20T21:00:00Z'),now=()=>fixed;
const explicitZero={mode:'MANUAL',expenses_revision:1,current_external_expenses_cents:0,unallocated_cents:0,items:[]};
async function fixture(t,{revisionChange=false,windows=null}={}){
 const env={FINANCE_DB:new D1()},reads={orders:0,ads:0,cash:0,inventory:0,returns:0},bankPages=[],bankCommands=[];
 t.after(()=>env.FINANCE_DB.db.close());let document=0,references=0,validFrames=0;
 const save=async count=>{
  const number=++document,input={schema:'external_cash_request_v1',operation:'preview',source:'NUBANK',bank_account_declared:true,completed_transfers_declared:false,document_hash:number.toString(16).padStart(64,'0'),selection:{format:'nubank_csv',date_format:'YMD',amount_format:'DECIMAL'},rows:Array.from({length:count},(_,index)=>({line:index+1,date:'2026-11-10',amount_cents:1,external_id:'synthetic-'+number+'-'+index,reference:'synthetic-reference',description:'synthetic-description',reported_status:null}))};
  const preview=await previewExternalCashImport(env,input);
  await mutateExternalCash(env,{...input,operation:'import',request_id:crypto.randomUUID(),expected_revision:preview.revision,preview_hash:preview.preview_hash,confirmed:true},{now});
 };
 await save(101);
 const services=createFinancialAutomationServices(env,{
  readFinancialSavedMonth:async()=>{references++;return {audit_scope:{sources:windows?windows.map(row=>({run_id:row.run_id,source_revision:1,start_date:row.start_date,end_date:row.end_date})):[{run_id:references===1?'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa':'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',source_revision:1}]}};},
  readFinancialSavedExpenses:async()=>explicitZero,
  readFinancialPrivate:async command=>{
   reads.orders++;const saved=windows?.find(row=>row.run_id===command.run_id),run={run_id:command.run_id,revision:1,status:'COMPLETE',start_date:'2026-11-01',end_date:'2026-11-15',cutoff_at:Date.parse('2026-11-16T03:00:00Z')/1000-1,checked_at:fixed/1000,...saved};
   return {status:200,body:await readFinancialSourceEvidence(env,command,{now,readEvidence:async()=>({schema:'financial_order_evidence_snapshot_v1',run,missing_orders:0,invalid_orders:0,orders:[]}),readComponents:async()=>({schema:'financial_order_components_snapshot_v1',run_id:run.run_id,source_revision:1,status:'AVAILABLE',missing_orders:0,invalid_orders:0,orders:[]})})};
  },
  readFinancialSavedAds:async()=>{reads.ads++;return {events:[],coverage:[],pending:['ADS_SOURCE_TIMEZONE_UNCONFIRMED'],known_expense_cents:null,covered_days:0,missing_days:[],partial_days:[]};},
  readFinancialSavedCash:async input=>{
   reads.cash++;
   const page=await readFinancialAutomationCashPage(env,input,{
    readCash:async command=>{
     if(command.source==='NUBANK')bankCommands.push({...command});
     const changing=revisionChange&&command.source==='NUBANK'&&command.cursor!==null;
     if(changing)await save(1);
     // Exercise the adapter's explicit valid200/new-revision branch. The
     // current store route normally rejects old revision cursors with409;
     // this injected new snapshot is not a claim of observed Live behavior.
     const body=await readExternalCashWorkspace(env,{...command,...(changing?{cursor:null}:{})});
     assert.ok(projectExternalCashResponse(body));assert.ok(externalCashResponseMatches(command,body));validFrames++;
     return {status:200,body};
    },readAllocations:async()=>({status:403,body:{error:'FORBIDDEN'}}),
   });
   if(input.source==='NUBANK')bankPages.push(page);
   return page;
  },
  readFinancialSavedInventory:async()=>{reads.inventory++;return {events:[],coverage:[],pending:[],checkpoint:null,has_more:false,inventory_revision:0,inventory:{schema:'financial_inventory_projection_v1',scope,state:'PARTIAL',remaining_quantity:null,known_inventory_value_cents:null}};},
  readFinancialSavedReturns:async()=>{reads.returns++;return {revision:0,checked_at:null,state:'UNKNOWN',counts:{known:0},pending:['RETURNS_FINANCIAL_COVERAGE_UNCONFIRMED']};},
 });
 return {env,services,reads,bankPages,bankCommands,get references(){return references;},get validFrames(){return validFrames;}};
}

test('a real cash adapter revision reset yields the target conservatively so independent order and Ads sources refresh',async t=>{
 const f=await fixture(t,{revisionChange:true});let result=null;
 for(let turn=0;turn<20;turn++)result=await f.services.readFinancialAutomationSources({scope,period,policy:null,now,mode:'sync',checkpoint:result?.checkpoint??null});
 const stale=f.bankPages.filter(page=>page.pending.includes('IMPORTED_CASH_CURSOR_STALE'));
 assert.ok(stale.length>0,'the actual adapter must traverse the200 new-revision branch');
 for(const page of stale){assert.equal(page.has_more,true);assert.equal(page.coverage[0].state,'PARTIAL');assert.equal(page.checkpoint.cursor,null);assert.equal(page.checkpoint.expected_revision,null);assert.deepEqual(page.events,[]);}
 assert.ok(f.reads.orders>=2,'a cash reset cannot permanently pin the old order publication');
 assert.ok(f.reads.ads>=2,'independent saved Ads must refresh despite a cash cursor reset');
 assert.ok(f.references>=2);assert.equal(f.validFrames,f.reads.cash);
 assert.ok(result.pending.includes('IMPORTED_CASH_CURSOR_STALE'));
 assert.notEqual(result.coverage.find(row=>row.family==='BANK').state,'COMPLETE');
 assert.ok(f.bankPages.every(page=>page.coverage[0].state!=='COMPLETE'&&page.coverage[0].timezone_confirmed===false&&page.balances.length===0));
 assert.ok(f.bankPages.flatMap(page=>page.events).every(event=>event.quality==='REVIEW'&&!event.postings.some(posting=>posting.account==='REVENUE')));
 t.diagnostic('LOCAL_SYNTHETIC: valid200 new-revision injection, sources='+JSON.stringify(f.reads)+'; no remote provider calls or writes');
});

test('a valid101-row bank collection keeps its exact cursor and drains100+1 without treating genuine pagination as stale',async t=>{
 const f=await fixture(t);let result=null,firstCashState=null;
 for(let turn=0;turn<12&&f.bankPages.length<2;turn++){
  const before=f.bankPages.length;
  result=await f.services.readFinancialAutomationSources({scope,period,policy:null,now,mode:'sync',checkpoint:result?.checkpoint??null});
  if(before===0&&f.bankPages.length===1)firstCashState=structuredClone(result.checkpoint);
 }
 assert.equal(f.bankPages.length,2);const [first,second]=f.bankPages;
 assert.equal(first.events.length,100);assert.equal(first.has_more,true);assert.notEqual(first.checkpoint.cursor,null);assert.equal(firstCashState.cash_index,0);
 assert.equal(second.events.length,1);assert.equal(second.has_more,false);assert.equal(second.checkpoint.cursor,null);
 assert.equal(f.bankCommands[0].cursor,null);assert.equal(f.bankCommands[1].cursor,first.checkpoint.cursor);assert.equal(first.checkpoint.expected_revision,second.checkpoint.expected_revision);
 assert.ok(f.bankPages.every(page=>!page.pending.includes('IMPORTED_CASH_CURSOR_STALE')));
 assert.equal(new Set([...first.events,...second.events].map(event=>event.event_id)).size,101);
 assert.equal(result.checkpoint.cash_index,1,'only the genuine terminal page advances the bank target');
 assert.notEqual(result.coverage.find(row=>row.family==='BANK').state,'COMPLETE');
});

test('independently completed creation windows include their last captured second without requiring later observations of earlier windows',async t=>{
 const selected=financialAccountingPeriod({kind:'MONTH',anchor:'2026-10'}),ids=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cccccccc-cccc-4ccc-8ccc-cccccccccccc'];
 const windows=[['2026-10-01','2026-10-15','2026-10-16T03:00:00Z'],['2026-10-16','2026-10-30','2026-10-31T03:00:00Z'],['2026-10-31','2026-10-31','2026-11-01T03:00:00Z']].map(([start_date,end_date,next],index)=>({run_id:ids[index],start_date,end_date,cutoff_at:Date.parse(next)/1000-1,checked_at:Date.parse(next)/1000+60}));
 const f=await fixture(t,{windows}),policy={policy_id:'synthetic-window-policy',revision:1,approval:{state:'APPROVED'},recognition:'PAID_ORDER_CREATE_ESTIMATE',revenue_base:'NET_PAYOUT'};
 let result=null;for(let turn=0;turn<24&&!result?.checkpoint.completed;turn++)result=await f.services.readFinancialAutomationSources({scope,period:selected,policy,now,mode:'sync',checkpoint:result?.checkpoint??null});
 assert.equal(f.reads.orders,3);assert.equal(result.checkpoint.completed,true);
 assert.equal(result.coverage.find(row=>row.family==='ORDERS').state,'COMPLETE','a source covering every integer creation timestamp through23:59:59 includes that full civil day');
 assert.ok(!result.pending.includes('ORDER_CREATION_WINDOW_CUTOFF_REQUIRED'));
 assert.ok(!result.pending.includes('ORDER_CREATION_WINDOW_COVERAGE_REQUIRED'));
 assert.notEqual(result.coverage.find(row=>row.family==='BANK').state,'COMPLETE','complete order capture does not promote unconfirmed cash');
});
