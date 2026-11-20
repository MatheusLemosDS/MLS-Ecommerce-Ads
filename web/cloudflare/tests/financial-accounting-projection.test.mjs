import test from 'node:test';
import assert from 'node:assert/strict';
import {projectFinancialAccounting,projectFinancialInventory,buildFinancialAccountingSnapshot,FINANCIAL_ACCOUNTING_COVERAGE_FAMILIES} from '../src/financial-accounting-projection.mjs';
import {financialAccountingPeriod} from '../src/financial-accounting-schedule.mjs';
import {financialDigest} from '../src/financial-event-ledger.mjs';
import {financialTestEvent,financialTestScope,financialTestPolicy} from './financial-ledger-fixture.mjs';

const scope=financialTestScope(),period=financialAccountingPeriod({kind:'MONTH',anchor:'2026-10'}),checked_at='2026-11-13T17:00:00.000Z';
const row=(account,amount_cents,account_ref=account==='BANK'?'bank-primary':account==='TRANSFER_IN_TRANSIT'?'transit-primary':'wallet-primary')=>({account,account_ref,amount_cents});
const coverage=(range=period)=>FINANCIAL_ACCOUNTING_COVERAGE_FAMILIES.map(family=>({scope,family,state:'COMPLETE',start_at:range.start_at,end_at:range.end_at,timezone_confirmed:true,comparison:'MATCHED',account_refs:family==='BANK'?['bank-primary']:family==='PAYOUTS'?['transit-primary']:['RECEIVABLES','WALLET','ADS','INVENTORY'].includes(family)?['wallet-primary']:[],pending:[]}));
const balances=(closing={})=>['BANK','RECEIVABLE','WALLET_AVAILABLE','TRANSFER_IN_TRANSIT','ADS_PREPAID','INVENTORY'].flatMap(account=>[period.start_at,period.end_at].map((as_of,index)=>({scope,account,account_ref:row(account,0).account_ref,as_of,amount_cents:index?(closing[account]??0):0,confirmed:true,evidence_ref:'synthetic-balance-'+account+'-'+index})));
const fact=(id,postings,patch={})=>financialTestEvent({source:{provider:'SHOPEE',family:'CANONICAL_SYNTHETIC',native_id:id,identity:'NATIVE_ID',identity_key:null},postings,...patch});
const project=(events,patch={})=>projectFinancialAccounting({scope,period,policy:financialTestPolicy(),events,coverage:coverage(),balances:balances(),obligations:[],reserve:{scope,amount_cents:0,confirmed:true,evidence_ref:'synthetic-reserve'},checked_at,...patch});

test('sale, wallet credit, withdrawal and bank deposit recognize one revenue across four stages',async()=>{
 const events=[await fact('sale',[row('RECEIVABLE',10000),row('REVENUE',-10000)]),await fact('release',[row('WALLET_AVAILABLE',10000),row('RECEIVABLE',-10000)]),await fact('withdrawal',[row('TRANSFER_IN_TRANSIT',10000),row('WALLET_AVAILABLE',-10000)]),await fact('bank-arrival',[row('BANK',10000),row('TRANSFER_IN_TRANSIT',-10000)])];
 const result=project(events,{balances:balances({BANK:10000})});assert.equal(result.result.state,'READY');assert.equal(result.result.amount_cents,10000);assert.equal(result.positions.bank.amount_cents,10000);assert.equal(result.positions.wallet.available.amount_cents,0);assert.equal(result.positions.transit.amount_cents,0);
 assert.equal(result.series.reduce((n,r)=>n+r.result_cents,0),result.result.amount_cents);assert.equal(result.close_readiness.ACCRUAL.ready,true);assert.equal(result.close_readiness.BANK_CASH.ready,true);
});

test('capital, loans, owner drawings and internal transfers change positions without operating revenue',async()=>{
 const events=[await fact('capital',[row('BANK',50000),row('OWNER_CAPITAL',-50000)]),await fact('loan',[row('BANK',20000),row('LOAN_PAYABLE',-20000)]),await fact('owner-drawing',[row('OWNER_DRAWINGS',10000),row('BANK',-10000)]),await fact('internal-transfer',[row('BANK',10000,'bank-secondary'),row('BANK',-10000)])];
 const extra=[period.start_at,period.end_at].map((as_of,index)=>({scope,account:'BANK',account_ref:'bank-secondary',as_of,amount_cents:index?10000:0,confirmed:true,evidence_ref:'synthetic-secondary-'+index}));
 const sources=coverage().map(c=>c.family==='BANK'?{...c,account_refs:[...c.account_refs,'bank-secondary']}:c);
 const result=project(events,{balances:[...balances({BANK:50000}),...extra],coverage:sources});assert.equal(result.result.amount_cents,0);assert.equal(result.positions.bank.amount_cents,60000);
});

test('Ads recharge100 and consumption30 recognize30 of expense and retain70 prepaid',async()=>{
 const events=[await fact('opening-capital',[row('BANK',10000),row('OWNER_CAPITAL',-10000)]),await fact('ads-recharge',[row('ADS_PREPAID',10000),row('BANK',-10000)]),await fact('ads-consumption',[row('ADS_EXPENSE',3000),row('ADS_PREPAID',-3000)])];
 const result=project(events,{balances:balances({ADS_PREPAID:7000})});assert.equal(result.result.amount_cents,-3000);assert.equal(result.positions.ads_prepaid.amount_cents,7000);assert.equal(result.result.components.find(c=>c.account==='ADS_EXPENSE').amount_cents,-3000);
});

test('expense recognized in October and paid in November affects each appropriate basis only once',async()=>{
 const october=await fact('expense-obligation',[row('OPERATING_EXPENSE',10000),row('ACCOUNTS_PAYABLE',-10000)]),november=await fact('expense-payment',[row('ACCOUNTS_PAYABLE',10000),row('BANK',-10000)],{event_at:'2026-11-05T12:00:00.000Z',competence_at:null,settlement_at:'2026-11-05T12:00:00.000Z',source_updated_at:'2026-11-05T12:00:00.000Z'});
 const result=project([october,november]);assert.equal(result.result.amount_cents,-10000);assert.equal(result.series.reduce((n,r)=>n+r.known_bank_delta_cents,0),0);
 const nextPeriod=financialAccountingPeriod({kind:'MONTH',anchor:'2026-11'}),next=project([october,november],{period:nextPeriod,coverage:coverage(nextPeriod),balances:[],checked_at:'2026-12-01T12:00:00.000Z'});assert.equal(next.result.amount_cents,0);assert.equal(next.series.reduce((n,r)=>n+r.known_bank_delta_cents,0),-10000);
});

test('legitimate unpaid receivable may close accrual while bank cash remains unverified',async()=>{
 const sale=await fact('future-settlement-sale',[row('RECEIVABLE',15000),row('REVENUE',-15000)]),sources=coverage().map(c=>c.family==='BANK'?{...c,state:'UNKNOWN',comparison:'NOT_COMPARED',start_at:null,end_at:null}:c);
 const result=project([sale],{coverage:sources,balances:[]});assert.equal(result.result.amount_cents,15000);assert.equal(result.close_readiness.ACCRUAL.ready,true);assert.equal(result.close_readiness.BANK_CASH.ready,false);assert.equal(result.positions.bank.amount_cents,null);
});

test('review identities, absent source coverage and timezone uncertainty never become observed zero',async()=>{
 const event=await fact('weak-evidence',[row('RECEIVABLE',10000),row('REVENUE',-10000)],{quality:'REVIEW'}),sources=coverage().map(c=>c.family==='ADS'?{...c,state:'PARTIAL',timezone_confirmed:false}:c);
 const result=project([event],{coverage:sources});assert.equal(result.result.amount_cents,null);assert.equal(result.result.known_amount_cents,0);assert.ok(result.result.pending.includes('RESULT_EVENTS_REQUIRE_REVIEW'));assert.ok(result.result.pending.includes('ADS_COVERAGE_INCOMPLETE'));assert.ok(result.series.every(r=>r.result_cents===null));assert.equal(result.close_readiness.ACCRUAL.ready,false);
 const absent=projectFinancialAccounting({scope,period,checked_at});assert.equal(absent.result.amount_cents,null);assert.equal(absent.result.known_amount_cents,null);assert.equal(absent.result.state,'UNKNOWN');assert.ok(absent.result.components.every(row=>row.amount_cents===null));assert.ok(absent.series.every(row=>row.known_result_cents===null&&row.known_bank_delta_cents===null));assert.equal(absent.positions.bank.amount_cents,null);assert.equal(absent.positions.bank.movements_cents,null);assert.equal(absent.cash_projection.known_committed_cents,null);assert.equal(absent.cash_projection.known_expected_cents,null);assert.ok(absent.pending.includes('ACCOUNTING_POLICY_REQUIRED'));
});

test('future days remain unobserved and no source can certify future monthly coverage or balance',()=>{
 const range=financialAccountingPeriod({kind:'MONTH',anchor:'2026-11'}),value=project([],{period:range,coverage:coverage(range),balances:[]});
 assert.equal(value.result.amount_cents,null);assert.equal(value.result.known_amount_cents,null);assert.equal(value.close_readiness.ACCRUAL.ready,false);
 assert.ok(value.series.filter(row=>row.date>'2026-11-13').every(row=>row.state==='NOT_OBSERVED'&&row.known_result_cents===null&&row.known_bank_delta_cents===null));
 assert.throws(()=>project([],{balances:[{scope,account:'BANK',account_ref:'bank-primary',as_of:'2026-12-01T03:00:00.000Z',amount_cents:10000,confirmed:true,evidence_ref:'synthetic-impossible-future-balance'}]}),/BALANCES_INVALID/);
 const inventory=projectFinancialInventory({scope,as_of:checked_at});assert.equal(inventory.known_inventory_value_cents,null);assert.equal(inventory.remaining_quantity,null);
});

test('declared tax coverage cannot mask a missing fixed-month recognition',async()=>{
 const policy=financialTestPolicy({tax:{regime:'MEI',mode:'FIXED_MONTHLY',monthly_cents:8605,recognition:'MONTH_END',source_ref:'synthetic-tax-declaration',revision:1}}),missing=project([],{policy});
 assert.equal(missing.result.amount_cents,null);assert.ok(missing.result.pending.includes('TAX_POLICY_RECOGNITION_MISMATCH'));assert.equal(missing.close_readiness.ACCRUAL.gates.consistent,false);
 const tax=await fact('tax-month-october',[row('TAX_EXPENSE',8605),row('TAX_PAYABLE',-8605)],{event_at:'2026-10-31T15:00:00.000Z',competence_at:'2026-10-31T15:00:00.000Z',source_updated_at:'2026-10-31T15:00:00.000Z'});
 const result=project([tax],{policy});assert.equal(result.result.amount_cents,-8605);assert.equal(result.close_readiness.ACCRUAL.ready,true);
});

test('bank opening plus movements must reconcile to the same account closing without fictitious adjustment',async()=>{
 const credit=await fact('observed-credit',[row('BANK',5000),row('OWNER_CAPITAL',-5000)]),result=project([credit],{balances:balances({BANK:4999})});
 assert.equal(result.positions.bank.amount_cents,null);assert.equal(result.positions.bank.unexplained_difference_cents,-1);assert.ok(result.positions.bank.pending.includes('BANK_UNEXPLAINED_BALANCE_DIFFERENCE'));assert.equal(result.close_readiness.BANK_CASH.ready,false);
});

test('every declared bank account requires its own opening and closing before bank cash can close',()=>{
 const sources=coverage().map(c=>c.family==='BANK'?{...c,account_refs:['bank-primary','bank-secondary']}:c);
 const result=project([],{coverage:sources}),bank=result.positions.bank,missing=bank.accounts.find(account=>account.account_ref==='bank-secondary');
 assert.equal(bank.state,'UNKNOWN');assert.equal(bank.amount_cents,null);assert.equal(bank.known_amount_cents,null);assert.equal(bank.opening_cents,null);assert.equal(bank.closing_cents,null);
 assert.equal(missing.opening_cents,null);assert.equal(missing.closing_cents,null);assert.equal(missing.known_amount_cents,null);assert.deepEqual(missing.evidence_refs,[]);
 assert.ok(bank.pending.includes('BANK_OPENING_BALANCE_REQUIRED'));assert.ok(bank.pending.includes('BANK_CLOSING_BALANCE_REQUIRED'));
 assert.equal(result.close_readiness.BANK_CASH.ready,false);assert.ok(result.close_readiness.BANK_CASH.pending.includes('BANK_OPENING_BALANCE_REQUIRED'));assert.ok(result.close_readiness.BANK_CASH.pending.includes('BANK_CLOSING_BALANCE_REQUIRED'));
 const secondary=[period.start_at,period.end_at].map((as_of,index)=>({scope,account:'BANK',account_ref:'bank-secondary',as_of,amount_cents:0,confirmed:true,evidence_ref:'synthetic-explicit-zero-secondary-'+index}));
 for(const onlyOne of secondary){
  const partial=project([],{coverage:sources,balances:[...balances(),onlyOne]});
  assert.equal(partial.positions.bank.amount_cents,null);assert.equal(partial.close_readiness.BANK_CASH.ready,false);
  assert.ok(partial.positions.bank.pending.includes(onlyOne.as_of===period.start_at?'BANK_CLOSING_BALANCE_REQUIRED':'BANK_OPENING_BALANCE_REQUIRED'));
 }
 const complete=project([],{coverage:sources,balances:[...balances(),...secondary]});
 assert.equal(complete.positions.bank.state,'READY');assert.equal(complete.positions.bank.amount_cents,0);assert.equal(complete.positions.bank.accounts.length,2);assert.equal(complete.close_readiness.BANK_CASH.ready,true);
});

test('declared wallet and payout accounts cannot disappear when their evidence is entirely absent',()=>{
 const cases=[['WALLET','WALLET_AVAILABLE',result=>result.positions.wallet.available],['WALLET','WALLET_HELD',result=>result.positions.wallet.held],['PAYOUTS','TRANSFER_IN_TRANSIT',result=>result.positions.transit],['RECEIVABLES','RECEIVABLE',result=>result.positions.receivables],['ADS','ADS_PREPAID',result=>result.positions.ads_prepaid],['INVENTORY','INVENTORY',result=>result.positions.inventory]];
 for(const [family,account,position] of cases){
  const sources=coverage().map(c=>c.family===family?{...c,account_refs:[...c.account_refs,'declared-secondary']}:c),value=position(project([],{coverage:sources})),missing=value.accounts.find(row=>row.account_ref==='declared-secondary');
  assert.notEqual(value.state,'READY',account);assert.equal(value.amount_cents,null,account);assert.equal(missing.opening_cents,null,account);assert.equal(missing.closing_cents,null,account);
  assert.ok(value.pending.includes(account+'_OPENING_BALANCE_REQUIRED'));assert.ok(value.pending.includes(account+'_CLOSING_BALANCE_REQUIRED'));
 }
});

test('weekly and monthly results derive from their own competence dates across a month boundary',async()=>{
 const a=await fact('october-last',[row('RECEIVABLE',100),row('REVENUE',-100)],{event_at:'2026-10-31T15:00:00.000Z',competence_at:'2026-10-31T15:00:00.000Z',source_updated_at:'2026-10-31T15:00:00.000Z'}),b=await fact('november-first',[row('RECEIVABLE',200),row('REVENUE',-200)],{event_at:'2026-11-01T15:00:00.000Z',competence_at:'2026-11-01T15:00:00.000Z',source_updated_at:'2026-11-01T15:00:00.000Z'});
 const range=financialAccountingPeriod({kind:'CIVIL_WEEK',anchor:'2026-11-01'}),week=project([a,b],{period:range,coverage:coverage(range),balances:[]});assert.equal(week.result.amount_cents,300);assert.equal(project([a,b]).result.amount_cents,100);
 const november=financialAccountingPeriod({kind:'MONTH',anchor:'2026-11'});assert.equal(project([a,b],{period:november,coverage:coverage(november),balances:[],checked_at:'2026-12-01T12:00:00.000Z'}).result.amount_cents,200);
});

test('canonical snapshot freezes policy, event revisions and totals without recomputation',async()=>{
 const event=await fact('snapshot-sale',[row('RECEIVABLE',15000),row('REVENUE',-15000)]),projection=project([event]),snapshot=buildFinancialAccountingSnapshot(projection),hash=await financialDigest(snapshot);
 assert.equal(snapshot.result.amount_cents,15000);assert.equal(snapshot.policy.revision,1);assert.deepEqual(snapshot.result.event_indices,[0]);assert.equal(snapshot.result.event_refs,undefined);
 projection.result.amount_cents=1;projection.policy.revision=2;event.postings[0].amount_cents=1;assert.equal(await financialDigest(snapshot),hash);assert.equal(snapshot.result.amount_cents,15000);
 assert.throws(()=>projectFinancialAccounting({scope,period,checked_at,events:[{...event,scope:financialTestScope({organization_id:'other-company'})}]}));
});

test('manufacturing100 selling80 and returning a partial component preserve historical stock and unique costs',()=>{
 const lot={scope,lot_id:'synthetic-lot',component_ref:'adult-M',quantity:100,unit_cost_cents:1590,produced_at:'2026-10-01T12:00:00.000Z',confirmed:true,evidence_ref:'synthetic-manufacture'},allocation=(id,kind,quantity,patch={})=>({scope,allocation_id:id,lot_id:lot.lot_id,component_ref:lot.component_ref,kind,quantity,competence_at:'2026-10-10T12:00:00.000Z',evidence_ref:'synthetic-piece-evidence',original_allocation_id:null,incremental_cost_cents:null,quantity_verified:true,origin_verified:true,condition_confirmed:true,...patch});
 const sold=allocation('sale-80','SALE',80),base=projectFinancialInventory({scope,lots:[lot],allocations:[sold],as_of:checked_at,coverage_complete:true});assert.equal(base.remaining_quantity,20);assert.equal(base.inventory_value_cents,31800);assert.equal(base.recognitions[0].amount_cents,127200);
 const returned=allocation('returned-2','RETURN_RESALE',2,{original_allocation_id:sold.allocation_id,competence_at:'2026-10-11T12:00:00.000Z'}),repack=allocation('repack-2','REPACK_COST',2,{original_allocation_id:sold.allocation_id,competence_at:'2026-10-12T12:00:00.000Z',incremental_cost_cents:220}),resold=allocation('resold-2','SALE',2,{competence_at:'2026-10-13T12:00:00.000Z'}),result=projectFinancialInventory({scope,lots:[lot],allocations:[sold,returned,repack,resold],as_of:checked_at,coverage_complete:true});
 assert.equal(result.remaining_quantity,20);assert.equal(result.recognitions.reduce((sum,r)=>sum+r.amount_cents,0),127420);assert.equal(result.recognitions.find(r=>r.kind==='REPACK_COST').amount_cents,220);
 assert.throws(()=>projectFinancialInventory({scope,lots:[lot],allocations:[sold,{...returned,component_ref:'child-2'}],as_of:checked_at,coverage_complete:true}),/ORIGIN_MISMATCH/);
 const unknown=projectFinancialInventory({scope,lots:[{...lot,unit_cost_cents:null}],allocations:[sold],as_of:checked_at,coverage_complete:true});assert.equal(unknown.inventory_value_cents,null);assert.equal(unknown.recognitions[0].amount_cents,null);
});

test('unconfirmed returns do not restock and damaged already-consumed pieces are not written off twice',()=>{
 const lot={scope,lot_id:'synthetic-lot',component_ref:'adult-M',quantity:1,unit_cost_cents:1590,produced_at:'2026-10-01T12:00:00.000Z',confirmed:true,evidence_ref:'synthetic-manufacture'},sold={scope,allocation_id:'sold',lot_id:lot.lot_id,component_ref:lot.component_ref,kind:'SALE',quantity:1,competence_at:'2026-10-10T12:00:00.000Z',evidence_ref:'synthetic-evidence',original_allocation_id:null,incremental_cost_cents:null,quantity_verified:true,origin_verified:true,condition_confirmed:true},returned={...sold,allocation_id:'returned',kind:'RETURN_LOSS',original_allocation_id:'sold',competence_at:'2026-10-11T12:00:00.000Z'};
 const result=projectFinancialInventory({scope,lots:[lot],allocations:[sold,returned],as_of:checked_at,coverage_complete:true});assert.equal(result.remaining_quantity,0);assert.equal(result.recognitions[1].amount_cents,0);
 const pending=projectFinancialInventory({scope,lots:[lot],allocations:[sold,{...returned,kind:'RETURN_RESALE',condition_confirmed:false}],as_of:checked_at,coverage_complete:true});assert.equal(pending.remaining_quantity,0);assert.ok(pending.pending.includes('PHYSICAL_QUANTITY_OR_CONDITION_UNVERIFIED'));
});

test('same-instant physical returns follow their explicit sale origin regardless of allocation ID or input order',()=>{
 const lot={scope,lot_id:'synthetic-same-instant-lot',component_ref:'adult-M',quantity:1,unit_cost_cents:1590,produced_at:'2026-10-01T12:00:00.000Z',confirmed:true,evidence_ref:'synthetic-manufacture'},sold={scope,allocation_id:'z-sale',lot_id:lot.lot_id,component_ref:lot.component_ref,kind:'SALE',quantity:1,competence_at:'2026-10-10T12:00:00.000Z',evidence_ref:'synthetic-sale-evidence',original_allocation_id:null,incremental_cost_cents:null,quantity_verified:true,origin_verified:true,condition_confirmed:true};
 for(const kind of ['RETURN_RESALE','RETURN_LOSS']){
  const returned={...sold,allocation_id:'a-return',kind,original_allocation_id:sold.allocation_id,evidence_ref:'synthetic-return-evidence'},input={scope,lots:[lot],as_of:checked_at,coverage_complete:true},result=projectFinancialInventory({...input,allocations:[returned,sold]});
  assert.equal(result.state,'READY');assert.deepEqual(result.recognitions.map(row=>row.allocation_id),['z-sale','a-return']);
  assert.equal(result.remaining_quantity,kind==='RETURN_RESALE'?1:0);assert.equal(result.inventory_value_cents,kind==='RETURN_RESALE'?1590:0);assert.equal(result.recognitions.reduce((sum,row)=>sum+row.amount_cents,0),kind==='RETURN_RESALE'?0:1590);
  assert.deepEqual(projectFinancialInventory({...input,allocations:[sold,returned]}),result);
 }
});

test('causal timestamp ties preserve invalid-origin, quantity, duplicate and physical-verification guards',()=>{
 const lot={scope,lot_id:'synthetic-causal-guard-lot',component_ref:'adult-M',quantity:1,unit_cost_cents:1590,produced_at:'2026-10-01T12:00:00.000Z',confirmed:true,evidence_ref:'synthetic-manufacture'},sold={scope,allocation_id:'z-sale',lot_id:lot.lot_id,component_ref:lot.component_ref,kind:'SALE',quantity:1,competence_at:'2026-10-10T12:00:00.000Z',evidence_ref:'synthetic-sale-evidence',original_allocation_id:null,incremental_cost_cents:null,quantity_verified:true,origin_verified:true,condition_confirmed:true},returned={...sold,allocation_id:'a-return',kind:'RETURN_RESALE',original_allocation_id:sold.allocation_id},input={scope,lots:[lot],as_of:checked_at,coverage_complete:true};
 assert.throws(()=>projectFinancialInventory({...input,allocations:[sold,{...returned,competence_at:'2026-10-10T11:59:59.999Z'}]}),/INVENTORY_RETURN_ORIGIN_INVALID/);
 assert.throws(()=>projectFinancialInventory({...input,allocations:[sold,{...returned,original_allocation_id:'missing-sale'}]}),/INVENTORY_RETURN_ORIGIN_INVALID/);
 assert.throws(()=>projectFinancialInventory({...input,allocations:[sold,{...returned,quantity:2}]}),/INVENTORY_RETURN_QUANTITY_EXCEEDED/);
 assert.throws(()=>projectFinancialInventory({...input,allocations:[sold,sold,returned]}),/INVENTORY_ALLOCATION_INVALID/);
 assert.throws(()=>projectFinancialInventory({...input,allocations:[{...sold,origin_verified:false},returned]}),/INVENTORY_RETURN_ORIGIN_INVALID/);
 const unverified=projectFinancialInventory({...input,allocations:[sold,{...returned,condition_confirmed:false}]});
 assert.equal(unverified.remaining_quantity,0);assert.equal(unverified.inventory_value_cents,null);assert.ok(unverified.pending.includes('PHYSICAL_QUANTITY_OR_CONDITION_UNVERIFIED'));assert.equal(unverified.recognitions.length,1);
});

test('daily Ads requires the whole nominal civil day and never splits a manufacture edge Friday',async()=>{
 const week=financialAccountingPeriod({kind:'MANUFACTURE_WEEK',anchor:'2026-10-16T16:00:00.000Z'}),source=date=>({provider:'SYSTEM',family:'ADS_DAILY_CONSUMPTION',native_id:'ads-day:'+date,identity:'NATIVE_ID',identity_key:null});
 const edge=await financialTestEvent({source:source('2026-10-16'),event_at:'2026-10-16T18:00:00.000Z',competence_at:'2026-10-16T18:00:00.000Z',postings:[row('ADS_EXPENSE',3000),row('ADS_PREPAID',-3000)]});
 const full=await financialTestEvent({source:source('2026-10-17'),event_at:'2026-10-17T18:00:00.000Z',competence_at:'2026-10-17T18:00:00.000Z',postings:[row('ADS_EXPENSE',4000),row('ADS_PREPAID',-4000)]});
 const result=project([edge,full],{period:week,coverage:coverage(week),balances:[]});
 assert.equal(result.result.components.find(r=>r.account==='ADS_EXPENSE').amount_cents,-4000);
 assert.ok(result.result.pending.includes('ADS_DAILY_CIVIL_INTERVAL_NOT_CONTAINED'));
 assert.equal(result.positions.ads_prepaid.known_movements_cents,-4000);
 assert.equal(result.series.find(r=>r.date==='2026-10-16').known_result_cents,0);
});
