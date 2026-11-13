import {FINANCIAL_ACCOUNTS,FINANCIAL_RESULT_ACCOUNTS,normalizeFinancialScope,sameFinancialScope,validateFinancialEvent,financialSafeSum,financialCanonicalJSON} from './financial-event-ledger.mjs';
import {projectFinancialAccountingPolicy,financialAccountingPolicyForPeriod,financialAccountingTaxRecognitions} from './financial-accounting-policy.mjs';
import {projectFinancialAccountingPeriod,financialAccountingLocalDate} from './financial-accounting-schedule.mjs';

const faProjectionFail=code=>{throw Object.assign(new Error('FINANCIAL_ACCOUNTING_'+code),{status:400});};
const faProjectionInt=v=>Number.isSafeInteger(v)&&!Object.is(v,-0);
const faProjectionToken=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v);
const faProjectionISO=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const faProjectionUnique=values=>[...new Set(values)].sort();
const faProjectionRefs=events=>events.map(e=>({event_id:e.event_id,version:e.version})).sort((a,b)=>a.event_id.localeCompare(b.event_id));
const faProjectionIn=(stamp,period)=>stamp!==null&&stamp>=period.start_at&&stamp<period.end_at;
const faProjectionSum=values=>financialSafeSum(values);
const faProjectionOpposite=value=>value===0?0:-value;
// A nominal provider calendar day is not an observed hourly timestamp. These
// validated calendars permit only whole civil days; manufacture edge Fridays
// are incomplete days and cannot absorb a whole daily Ads amount.
function faProjectionDailyAdsInside(event,period){
 if(event.source.family!=='ADS_DAILY_CONSUMPTION')return true;
 const match=/^ads-day:(20\d{2}-\d{2}-\d{2})$/.exec(event.source.native_id??'');if(!match)return false;
 const date=match[1],at=new Date(date+'T12:00:00Z');if(!Number.isFinite(at.getTime())||at.toISOString().slice(0,10)!==date)return false;
 return period.kind==='MANUFACTURE_WEEK'?date>period.start_date&&date<period.end_date:date>=period.start_date&&date<=period.end_date;
}
export const FINANCIAL_ACCOUNTING_COVERAGE_FAMILIES=Object.freeze(['ORDERS','COGS','ADS','EXPENSES','TAX','RETURNS','RECEIVABLES','WALLET','PAYOUTS','BANK','INVENTORY','OBLIGATIONS']);
const faResultFamilies=['ORDERS','COGS','ADS','EXPENSES','TAX','RETURNS'];
function faProjectionCoverage(values,scope,period,checked_at){
 if(!Array.isArray(values)||values.length>64)faProjectionFail('COVERAGE_INVALID');const seen=new Set();
 return values.map(value=>{
  financialCanonicalJSON(value);
  const accountRefs=value.account_refs??[],comparison=value.comparison??'NOT_COMPARED';
  if(!value||!FINANCIAL_ACCOUNTING_COVERAGE_FAMILIES.includes(value.family)||seen.has(value.family)||!['COMPLETE','PARTIAL','UNKNOWN','UNAVAILABLE','FORBIDDEN'].includes(value.state)||!sameFinancialScope(value.scope,scope)||value.start_at!==null&&!faProjectionISO(value.start_at)||value.end_at!==null&&!faProjectionISO(value.end_at)||value.start_at!==null&&value.end_at!==null&&value.start_at>=value.end_at||typeof value.timezone_confirmed!=='boolean'||!['MATCHED','NOT_COMPARED','DIFFERENCE'].includes(comparison)||!Array.isArray(accountRefs)||accountRefs.some(x=>!faProjectionToken(x))||new Set(accountRefs).size!==accountRefs.length||!Array.isArray(value.pending)||value.pending.some(x=>!faProjectionToken(x)))faProjectionFail('COVERAGE_INVALID');
  seen.add(value.family);return {family:value.family,scope:{...scope},state:value.state,start_at:value.start_at,end_at:value.end_at,timezone_confirmed:value.timezone_confirmed,comparison,account_refs:[...accountRefs].sort(),pending:faProjectionUnique(value.pending),complete:value.state==='COMPLETE'&&value.start_at!==null&&value.start_at<=period.start_at&&value.end_at!==null&&value.end_at>=period.end_at&&value.end_at<=checked_at&&value.timezone_confirmed};
 });
}
function faProjectionFamilyPending(coverage,families,{comparisons=false}={}){
 const pending=[];for(const family of families){const row=coverage.find(x=>x.family===family);if(!row?.complete)pending.push(family+'_COVERAGE_INCOMPLETE');if(row)pending.push(...row.pending);if(comparisons&&row?.comparison!=='MATCHED')pending.push(family+'_COMPARISON_REQUIRED');}return faProjectionUnique(pending);
}
function faProjectionMetric(amount,known,pending,events,basis,{estimate=false}={}){
 const codes=faProjectionUnique(pending);return {state:estimate?'ESTIMATE':codes.length?(known===null?'UNKNOWN':'PARTIAL'):'READY',amount_cents:codes.length||estimate?null:amount,known_amount_cents:known,pending:codes,event_refs:faProjectionRefs(events),basis};
}
function faProjectionBalances(values,scope,checked_at){
 if(!Array.isArray(values)||values.length>512)faProjectionFail('BALANCES_INVALID');const seen=new Set();
 return values.map(value=>{
  financialCanonicalJSON(value);
  if(!value||!sameFinancialScope(value.scope,scope)||!FINANCIAL_ACCOUNTS.includes(value.account)||!faProjectionToken(value.account_ref)||!faProjectionISO(value.as_of)||value.as_of>checked_at||!faProjectionInt(value.amount_cents)||value.confirmed!==true||!faProjectionToken(value.evidence_ref))faProjectionFail('BALANCES_INVALID');
  const key=[value.account,value.account_ref,value.as_of].join(':');if(seen.has(key))faProjectionFail('BALANCES_DUPLICATE');seen.add(key);
  return {scope:{...scope},account:value.account,account_ref:value.account_ref,as_of:value.as_of,amount_cents:value.amount_cents,confirmed:true,evidence_ref:value.evidence_ref};
 });
}
function faProjectionPosition(account,family,events,balances,coverage,period){
 const entries=events.filter(e=>e.quality==='CONFIRMED'&&faProjectionDailyAdsInside(e,period)&&faProjectionIn(e.settlement_at??e.event_at,period)&&e.postings.some(p=>p.account===account));
 const relevant=balances.filter(b=>b.account===account&&(b.as_of===period.start_at||b.as_of===period.end_at)),refs=new Set([...relevant.map(x=>x.account_ref),...entries.flatMap(e=>e.postings.filter(p=>p.account===account).map(p=>p.account_ref))]);
 const pending=faProjectionFamilyPending(coverage,[family]),accounts=[];
 if(!refs.size)pending.push(account+'_BALANCE_EVIDENCE_REQUIRED');
 for(const ref of [...refs].sort()){
  const opening=relevant.find(x=>x.account_ref===ref&&x.as_of===period.start_at),closing=relevant.find(x=>x.account_ref===ref&&x.as_of===period.end_at),movements=faProjectionSum(entries.flatMap(e=>e.postings.filter(p=>p.account===account&&p.account_ref===ref).map(p=>p.amount_cents))),known=opening?faProjectionSum([opening.amount_cents,movements]):null,difference=known!==null&&closing?faProjectionSum([closing.amount_cents,faProjectionOpposite(known)]):null;
  if(!coverage.some(x=>x.family===family&&x.account_refs.includes(ref)))pending.push(account+'_ACCOUNT_COVERAGE_REQUIRED');
  if(!opening)pending.push(account+'_OPENING_BALANCE_REQUIRED');if(!closing)pending.push(account+'_CLOSING_BALANCE_REQUIRED');if(difference!==null&&difference!==0)pending.push(account+'_UNEXPLAINED_BALANCE_DIFFERENCE');
  accounts.push({account_ref:ref,opening_cents:opening?.amount_cents??null,closing_cents:closing?.amount_cents??null,movements_cents:movements,known_amount_cents:known,unexplained_difference_cents:difference,evidence_refs:[opening?.evidence_ref,closing?.evidence_ref].filter(Boolean)});
 }
 const total=key=>accounts.length&&accounts.every(x=>x[key]!==null)?faProjectionSum(accounts.map(x=>x[key])):null,known=total('known_amount_cents'),closing=total('closing_cents');
 const complete=faProjectionFamilyPending(coverage,[family]).length===0,movements=entries.length||complete?faProjectionSum(accounts.map(x=>x.movements_cents)):null;
 return {...faProjectionMetric(closing,known,pending,entries,'CONFIRMED_OPENING_PLUS_MOVEMENTS_RECONCILED_TO_CLOSING'),opening_cents:total('opening_cents'),closing_cents:closing,movements_cents:complete?movements:null,known_movements_cents:movements,unexplained_difference_cents:total('unexplained_difference_cents'),accounts};
}

// This projector consumes validated latest journal facts. It never creates
// postings from a bank credit, a refund request, or current product prices.
export function projectFinancialAccounting({scope,period,policy=null,events=[],coverage=[],balances=[],obligations=[],reserve=null,inventory=null,checked_at}={}){
 const selected=normalizeFinancialScope(scope),range=projectFinancialAccountingPeriod(period);if(!range||!faProjectionISO(checked_at)||!Array.isArray(events)||events.length>10000)faProjectionFail('INPUT_INVALID');
 const normalizedPolicy=policy===null?null:projectFinancialAccountingPolicy(policy,{scope:selected});if(policy!==null&&!normalizedPolicy)faProjectionFail('POLICY_INVALID');
 const policyStatus=financialAccountingPolicyForPeriod(normalizedPolicy,range,{scope:selected}),all=events.map(e=>validateFinancialEvent(e,{scope:selected})),seen=new Set();
 for(const e of all){if(seen.has(e.event_id)||e.observed_at>checked_at)faProjectionFail('EVENT_VERSION_OR_CUTOFF_INVALID');seen.add(e.event_id);}
 const sourceCoverage=faProjectionCoverage(coverage,selected,range,checked_at),positionsInput=faProjectionBalances(balances,selected,checked_at);
 const resultEvents=all.filter(e=>faProjectionIn(e.competence_at,range)&&faProjectionDailyAdsInside(e,range)&&e.postings.some(p=>FINANCIAL_RESULT_ACCOUNTS.includes(p.account))),posted=resultEvents.filter(e=>e.quality==='CONFIRMED');
 const resultPending=[...policyStatus.pending,...faProjectionFamilyPending(sourceCoverage,faResultFamilies,{comparisons:true})];
 if(all.some(e=>e.source.family==='ADS_DAILY_CONSUMPTION'&&e.quality==='CONFIRMED'&&!faProjectionDailyAdsInside(e,range)))resultPending.push('ADS_DAILY_CIVIL_INTERVAL_NOT_CONTAINED');
 if(resultEvents.some(e=>e.quality!=='CONFIRMED'))resultPending.push('RESULT_EVENTS_REQUIRE_REVIEW');
 if(all.some(e=>e.quality==='CONFIRMED'&&e.competence_at===null&&e.postings.some(p=>FINANCIAL_RESULT_ACCOUNTS.includes(p.account))))resultPending.push('RESULT_EVENT_COMPETENCE_REQUIRED');
 if(normalizedPolicy?.tax.mode==='FIXED_MONTHLY'&&policyStatus.state==='APPROVED'){
  const expected=financialAccountingTaxRecognitions(normalizedPolicy,range,{scope:selected}),required=faProjectionSum(expected.events.map(e=>e.amount_cents)),observed=faProjectionSum(posted.flatMap(e=>e.postings.filter(p=>p.account==='TAX_EXPENSE').map(p=>p.amount_cents)));
  if(required!==observed)resultPending.push('TAX_POLICY_RECOGNITION_MISMATCH');
 }
 const componentFamilies={REVENUE:'ORDERS',SALES_RETURNS:'RETURNS',FEES:'ORDERS',SHIPPING:'ORDERS',COGS:'COGS',ADS_EXPENSE:'ADS',OPERATING_EXPENSE:'EXPENSES',TAX_EXPENSE:'TAX',INVENTORY_LOSS:'COGS',REPAIR_EXPENSE:'EXPENSES',OTHER_INCOME:'EXPENSES',OTHER_EXPENSE:'EXPENSES'};
 const components=FINANCIAL_RESULT_ACCOUNTS.map(account=>{const values=posted.flatMap(e=>e.postings.filter(p=>p.account===account).map(p=>faProjectionOpposite(p.amount_cents))),observed=values.length>0||faProjectionFamilyPending(sourceCoverage,[componentFamilies[account]]).length===0;return {account,amount_cents:observed?faProjectionSum(values):null,event_refs:faProjectionRefs(posted.filter(e=>e.postings.some(p=>p.account===account)))};});
 const knownComponents=components.filter(x=>x.amount_cents!==null),knownResult=knownComponents.length?faProjectionSum(knownComponents.map(x=>x.amount_cents)):null;
 const result={...faProjectionMetric(knownResult,knownResult,resultPending,posted,'POSTED_EVENT_COMPETENCE',{estimate:policyStatus.state==='ESTIMATE'}),components,policy_revision:policyStatus.revision};
 const positions={receivables:faProjectionPosition('RECEIVABLE','RECEIVABLES',all,positionsInput,sourceCoverage,range),wallet:{available:faProjectionPosition('WALLET_AVAILABLE','WALLET',all,positionsInput,sourceCoverage,range),held:faProjectionPosition('WALLET_HELD','WALLET',all,positionsInput,sourceCoverage,range)},transit:faProjectionPosition('TRANSFER_IN_TRANSIT','PAYOUTS',all,positionsInput,sourceCoverage,range),bank:faProjectionPosition('BANK','BANK',all,positionsInput,sourceCoverage,range),ads_prepaid:faProjectionPosition('ADS_PREPAID','ADS',all,positionsInput,sourceCoverage,range),inventory:faProjectionPosition('INVENTORY','INVENTORY',all,positionsInput,sourceCoverage,range)};
 if(inventory!==null){if(inventory.schema!=='financial_inventory_projection_v1'||!sameFinancialScope(inventory.scope,selected))faProjectionFail('INVENTORY_INVALID');positions.inventory.physical=JSON.parse(JSON.stringify(inventory));}
 const cashProjection=financialAccountingCashProjection({scope:selected,period:range,bank:positions.bank,coverage:sourceCoverage,obligations,reserve,checked_at});
 const series=[],observedDate=financialAccountingLocalDate(checked_at,range.timezone);
 for(let date=range.start_date;date<=range.end_date;){
  const dailyResult=posted.filter(e=>financialAccountingLocalDate(e.competence_at,range.timezone)===date),dailyBank=all.filter(e=>e.quality==='CONFIRMED'&&faProjectionDailyAdsInside(e,range)&&faProjectionIn(e.settlement_at??e.event_at,range)&&financialAccountingLocalDate(e.settlement_at??e.event_at,range.timezone)===date&&e.postings.some(p=>p.account==='BANK'));
  const known_result_cents=dailyResult.length||faProjectionFamilyPending(sourceCoverage,faResultFamilies).length===0?faProjectionSum(dailyResult.flatMap(e=>e.postings.filter(p=>FINANCIAL_RESULT_ACCOUNTS.includes(p.account)).map(p=>faProjectionOpposite(p.amount_cents)))):null,known_bank_delta_cents=dailyBank.length||faProjectionFamilyPending(sourceCoverage,['BANK']).length===0?faProjectionSum(dailyBank.flatMap(e=>e.postings.filter(p=>p.account==='BANK').map(p=>p.amount_cents))):null;
  const refs=new Map([...dailyResult,...dailyBank].map(e=>[e.event_id,e]));
  const observed=date<=observedDate;
  series.push({date,state:observed?result.state:'NOT_OBSERVED',result_cents:observed&&result.state==='READY'?known_result_cents:null,known_result_cents:observed?known_result_cents:null,bank_delta_cents:observed&&positions.bank.state==='READY'?known_bank_delta_cents:null,known_bank_delta_cents:observed?known_bank_delta_cents:null,event_refs:faProjectionRefs([...refs.values()])});
  const at=new Date(date+'T12:00:00Z');at.setUTCDate(at.getUTCDate()+1);date=at.toISOString().slice(0,10);
  if(series.length>367)faProjectionFail('PERIOD_LIMIT');
 }
 const baseGates={coverage_complete:faProjectionFamilyPending(sourceCoverage,faResultFamilies).length===0,consistent:!resultPending.includes('RESULT_EVENTS_REQUIRE_REVIEW')&&!resultPending.includes('RESULT_EVENT_COMPETENCE_REQUIRED')&&!resultPending.includes('TAX_POLICY_RECOGNITION_MISMATCH'),costs_complete:sourceCoverage.some(x=>x.family==='COGS'&&x.complete),taxes_complete:normalizedPolicy?.tax.mode!=='UNCONFIGURED'&&sourceCoverage.some(x=>x.family==='TAX'&&x.complete),policy_complete:policyStatus.state==='APPROVED',comparisons_complete:faResultFamilies.every(f=>sourceCoverage.some(x=>x.family===f&&x.comparison==='MATCHED')),blocking_pending_count:result.pending.length,receivables_verified:faProjectionFamilyPending(sourceCoverage,['RECEIVABLES'],{comparisons:true}).length===0,cash_verified:positions.bank.state==='READY'};
 const cashPolicyComplete=normalizedPolicy?.approval.state==='APPROVED'&&!policyStatus.pending.some(x=>['ACCOUNTING_POLICY_OUTSIDE_EFFECTIVE_PERIOD','FINANCIAL_COMPETENCE_PERIOD_REQUIRED','ACCOUNTING_CALENDAR_POLICY_MISMATCH'].includes(x));
 const accrualPending=faProjectionUnique([...result.pending,...(!baseGates.receivables_verified?['RECEIVABLES_RECONCILIATION_REQUIRED']:[])]),cashPending=faProjectionUnique([...positions.bank.pending,...(!cashPolicyComplete?['ACCOUNTING_POLICY_REQUIRED']:[]),...faProjectionFamilyPending(sourceCoverage,['BANK'],{comparisons:true})]);
 const cashGates={...baseGates,policy_complete:cashPolicyComplete,coverage_complete:faProjectionFamilyPending(sourceCoverage,['BANK']).length===0,consistent:positions.bank.unexplained_difference_cents===0,comparisons_complete:sourceCoverage.some(x=>x.family==='BANK'&&x.comparison==='MATCHED'),blocking_pending_count:cashPending.length};
 return {schema:'financial_accounting_projection_v1',scope:selected,period:range,policy:normalizedPolicy,checked_at,events:faProjectionRefs(all),result,positions,cash_projection:cashProjection,coverage:sourceCoverage,pending:faProjectionUnique([...result.pending,...positions.receivables.pending,...positions.wallet.available.pending,...positions.wallet.held.pending,...positions.transit.pending,...positions.bank.pending,...cashProjection.pending]),series,close_readiness:{ACCRUAL:{ready:accrualPending.length===0,pending:accrualPending,gates:{...baseGates,blocking_pending_count:accrualPending.length}},BANK_CASH:{ready:cashPending.length===0,pending:cashPending,gates:cashGates},RECEIVABLES:{ready:positions.receivables.state==='READY',pending:positions.receivables.pending}},basis:'VERSIONED_POSTED_EVENTS_NOT_LEGACY_ESTIMATE_OR_MONEY_DISTRIBUTION'};
}

export function financialAccountingCashProjection({scope,period,bank,coverage=[],obligations=[],reserve=null,checked_at}={}){
 const selected=normalizeFinancialScope(scope);if(!period||!faProjectionISO(checked_at)||!Array.isArray(obligations)||obligations.length>2000||!bank)faProjectionFail('CASH_PROJECTION_INVALID');
 const pending=[...bank.pending,...faProjectionFamilyPending(coverage,['OBLIGATIONS'])],seen=new Set(),rows=[];
 for(const row of obligations){
  financialCanonicalJSON(row);
  if(!row||!faProjectionToken(row.obligation_id)||seen.has(row.obligation_id)||!sameFinancialScope(row.scope,selected)||!['PAYABLE','RECEIVABLE','PRODUCTION_COMMITMENT'].includes(row.kind)||!['OPEN','SETTLED','CANCELLED'].includes(row.status)||row.amount_cents!==null&&(!faProjectionInt(row.amount_cents)||row.amount_cents<0)||row.due_at!==null&&!faProjectionISO(row.due_at)||!['CONFIRMED','EXPECTED','UNKNOWN'].includes(row.confidence)||!faProjectionToken(row.evidence_ref))faProjectionFail('OBLIGATION_INVALID');
  seen.add(row.obligation_id);if(row.status!=='OPEN')continue;
  if(row.amount_cents===null||row.due_at===null||row.confidence==='UNKNOWN')pending.push('OBLIGATION_AMOUNT_OR_DUE_DATE_UNKNOWN');
  rows.push({...row,scope:{...selected}});
 }
 let reserveCents=null;if(reserve!==null){if(!sameFinancialScope(reserve.scope,selected)||!faProjectionInt(reserve.amount_cents)||reserve.amount_cents<0||reserve.confirmed!==true||!faProjectionToken(reserve.evidence_ref))faProjectionFail('RESERVE_INVALID');reserveCents=reserve.amount_cents;}else pending.push('WORKING_CAPITAL_RESERVE_REQUIRED');
 const payable=rows.filter(r=>r.kind!=='RECEIVABLE'),receivable=rows.filter(r=>r.kind==='RECEIVABLE'),payableKnown=payable.filter(r=>r.amount_cents!==null),receivableKnown=receivable.filter(r=>r.amount_cents!==null&&r.due_at!==null&&r.confidence!=='UNKNOWN'),obligationsComplete=faProjectionFamilyPending(coverage,['OBLIGATIONS']).length===0,knownCommitted=payableKnown.length||obligationsComplete?faProjectionSum(payableKnown.map(r=>r.amount_cents)):null,knownExpected=receivableKnown.length||obligationsComplete?faProjectionSum(receivableKnown.map(r=>r.amount_cents)):null;
 const committed=obligationsComplete&&payable.every(r=>r.amount_cents!==null&&r.due_at!==null)?knownCommitted:null,expected=obligationsComplete&&receivable.every(r=>r.amount_cents!==null&&r.due_at!==null&&r.confidence!=='UNKNOWN')?knownExpected:null,codes=faProjectionUnique(pending),available=bank.amount_cents;
 const free=available!==null&&committed!==null&&reserveCents!==null?faProjectionSum([available,faProjectionOpposite(committed),faProjectionOpposite(reserveCents)]):null;
 return {state:codes.length?'PARTIAL':'READY',as_of:period.end_at,available_cents:available,committed_cents:committed,known_committed_cents:knownCommitted,expected_cents:expected,known_expected_cents:knownExpected,reserve_cents:reserveCents,free_operating_cents:codes.length?null:free,known_free_operating_cents:free,pending:codes,obligations:rows,scenarios:[{kind:'CONFIRMED_ONLY',amount_cents:free},{kind:'EXPECTED_RECEIPTS_ARRIVE',amount_cents:free!==null&&expected!==null?faProjectionSum([free,expected]):null}],basis:'RECONCILED_BANK_LESS_OPEN_COMMITMENTS_AND_APPROVED_RESERVE_NOT_DISTRIBUTABLE_PROFIT',money_transfer_allowed:false};
}

// Deduplicate provenance by index for immutable snapshots; UI detail records
// retain full event refs. No totals or policies are recomputed during freezing.
export function buildFinancialAccountingSnapshot(projection){
 const canonical=financialCanonicalJSON(projection);if(projection?.schema!=='financial_accounting_projection_v1')faProjectionFail('SNAPSHOT_INVALID');
 const copy=JSON.parse(canonical),refs=new Map(copy.events.map((r,i)=>[r.event_id+':'+r.version,i]));
 const visit=value=>{if(!value||typeof value!=='object')return;if(!Array.isArray(value)&&Array.isArray(value.event_refs)){value.event_indices=value.event_refs.map(r=>{const index=refs.get(r.event_id+':'+r.version);if(index===undefined)faProjectionFail('SNAPSHOT_EVENT_REFERENCE_INVALID');return index;});delete value.event_refs;}for(const row of Object.values(value))visit(row);};
 visit(copy);copy.schema='financial_accounting_snapshot_v1';return JSON.parse(financialCanonicalJSON(copy));
}

// Physical units only: a kit must already be decomposed into proven component
// lots. A returned damaged piece does not create a second loss of an already
// consumed unit. Restocking reverses only that unit's historical COGS.
export function projectFinancialInventory({scope,lots=[],allocations=[],as_of,coverage_complete=false}={}){
 const selected=normalizeFinancialScope(scope);if(!faProjectionISO(as_of)||!Array.isArray(lots)||lots.length>1000||!Array.isArray(allocations)||allocations.length>5000||typeof coverage_complete!=='boolean')faProjectionFail('INVENTORY_INVALID');
 const stock=new Map(),movements=new Map(),returns=new Map(),pending=[],recognitions=[];
 for(const lot of lots){
  financialCanonicalJSON(lot);
  if(!lot||!sameFinancialScope(lot.scope,selected)||!faProjectionToken(lot.lot_id)||stock.has(lot.lot_id)||!faProjectionToken(lot.component_ref)||!faProjectionInt(lot.quantity)||lot.quantity<1||lot.unit_cost_cents!==null&&(!faProjectionInt(lot.unit_cost_cents)||lot.unit_cost_cents<0)||!faProjectionISO(lot.produced_at)||!faProjectionToken(lot.evidence_ref)||lot.confirmed!==true)faProjectionFail('INVENTORY_LOT_INVALID');
  if(lot.produced_at>=as_of)continue;
  stock.set(lot.lot_id,{...lot,remaining:BigInt(lot.quantity),sold:0n,returned_resale:0n,returned_loss:0n,lost:0n});
 }
 const ordered=[...allocations].sort((a,b)=>String(a.competence_at).localeCompare(String(b.competence_at))||String(a.allocation_id).localeCompare(String(b.allocation_id)));
 const allIds=new Set();
 for(const allocation of ordered){
  financialCanonicalJSON(allocation);
  if(!allocation||!sameFinancialScope(allocation.scope,selected)||!faProjectionToken(allocation.allocation_id)||allIds.has(allocation.allocation_id)||!faProjectionToken(allocation.lot_id)||!faProjectionToken(allocation.component_ref)||!['SALE','RETURN_RESALE','RETURN_LOSS','STOCK_LOSS','REPAIR_COST','REPACK_COST'].includes(allocation.kind)||!faProjectionInt(allocation.quantity)||allocation.quantity<1||!faProjectionISO(allocation.competence_at)||!faProjectionToken(allocation.evidence_ref)||allocation.original_allocation_id!==null&&!faProjectionToken(allocation.original_allocation_id)||allocation.incremental_cost_cents!==null&&(!faProjectionInt(allocation.incremental_cost_cents)||allocation.incremental_cost_cents<0)||typeof allocation.quantity_verified!=='boolean'||typeof allocation.origin_verified!=='boolean'||typeof allocation.condition_confirmed!=='boolean')faProjectionFail('INVENTORY_ALLOCATION_INVALID');
  allIds.add(allocation.allocation_id);if(allocation.competence_at>=as_of)continue;
  const lot=stock.get(allocation.lot_id);if(!lot||lot.component_ref!==allocation.component_ref||allocation.competence_at<lot.produced_at)faProjectionFail('INVENTORY_ORIGIN_MISMATCH');
  movements.set(allocation.allocation_id,allocation);
  if(!allocation.quantity_verified||!allocation.origin_verified||allocation.kind.startsWith('RETURN_')&&!allocation.condition_confirmed){pending.push('PHYSICAL_QUANTITY_OR_CONDITION_UNVERIFIED');continue;}
  const quantity=BigInt(allocation.quantity),historical=lot.unit_cost_cents===null?null:faProjectionSum([Number(quantity*BigInt(lot.unit_cost_cents))]);let account=null,amount=null;
  if(allocation.kind==='SALE'||allocation.kind==='STOCK_LOSS'){
   if(allocation.original_allocation_id!==null||lot.remaining<quantity)faProjectionFail('INVENTORY_QUANTITY_EXCEEDED');
   lot.remaining-=quantity;if(allocation.kind==='SALE'){lot.sold+=quantity;account='COGS';}else{lot.lost+=quantity;account='INVENTORY_LOSS';}amount=historical;
  }else if(allocation.kind.startsWith('RETURN_')){
   const original=movements.get(allocation.original_allocation_id);
   if(!original||original.kind!=='SALE'||original.lot_id!==allocation.lot_id||original.component_ref!==allocation.component_ref||!original.quantity_verified||!original.origin_verified)faProjectionFail('INVENTORY_RETURN_ORIGIN_INVALID');
   const returned=(returns.get(original.allocation_id)??0n)+quantity;if(returned>BigInt(original.quantity))faProjectionFail('INVENTORY_RETURN_QUANTITY_EXCEEDED');returns.set(original.allocation_id,returned);
   if(allocation.kind==='RETURN_RESALE'){lot.remaining+=quantity;lot.returned_resale+=quantity;account='COGS';amount=historical===null?null:faProjectionOpposite(historical);}
   else{lot.returned_loss+=quantity;amount=0;account='INVENTORY_LOSS';}
  }else{
   if(allocation.incremental_cost_cents===null){pending.push('INCREMENTAL_REUSE_COST_UNKNOWN');continue;}
   account=allocation.kind==='REPAIR_COST'?'REPAIR_EXPENSE':'OPERATING_EXPENSE';amount=allocation.incremental_cost_cents;
  }
  if(amount===null)pending.push('HISTORICAL_UNIT_COST_UNKNOWN');
  recognitions.push({allocation_id:allocation.allocation_id,lot_id:allocation.lot_id,component_ref:allocation.component_ref,kind:allocation.kind,quantity:allocation.quantity,competence_at:allocation.competence_at,account,amount_cents:amount,evidence_ref:allocation.evidence_ref,basis:allocation.kind==='RETURN_LOSS'?'ALREADY_CONSUMED_UNIT_NO_DUPLICATE_WRITE_OFF':allocation.kind.endsWith('_COST')?'ACTUAL_INCREMENTAL_REUSE_COST':'HISTORICAL_PHYSICAL_COMPONENT_COST'});
 }
 if(!coverage_complete)pending.push('INVENTORY_SOURCE_COVERAGE_INCOMPLETE');
 const rows=[...stock.values()].map(lot=>{
  const count=value=>{if(value<0n||value>BigInt(Number.MAX_SAFE_INTEGER))faProjectionFail('INVENTORY_QUANTITY_OVERFLOW');return Number(value);};
  return {lot_id:lot.lot_id,component_ref:lot.component_ref,produced_quantity:lot.quantity,remaining_quantity:count(lot.remaining),sold_quantity:count(lot.sold),returned_resale_quantity:count(lot.returned_resale),returned_loss_quantity:count(lot.returned_loss),lost_quantity:count(lot.lost),historical_unit_cost_cents:lot.unit_cost_cents,inventory_value_cents:lot.unit_cost_cents===null&&lot.remaining!==0n?null:faProjectionSum([Number(lot.remaining*BigInt(lot.unit_cost_cents??0))]),evidence_ref:lot.evidence_ref};
 });
 const knownRows=rows.filter(r=>r.inventory_value_cents!==null),known=knownRows.length||coverage_complete?faProjectionSum(knownRows.map(r=>r.inventory_value_cents)):null,codes=faProjectionUnique(pending);if(rows.some(r=>r.inventory_value_cents===null))codes.push('INVENTORY_COST_UNKNOWN');
 return {schema:'financial_inventory_projection_v1',scope:selected,as_of,state:codes.length?'PARTIAL':'READY',remaining_quantity:rows.length||coverage_complete?faProjectionSum(rows.map(r=>r.remaining_quantity)):null,inventory_value_cents:codes.length?null:known,known_inventory_value_cents:known,lots:rows,recognitions,pending:faProjectionUnique(codes),basis:'VERIFIED_PHYSICAL_COMPONENTS_AND_HISTORICAL_LOT_COST_NOT_SALES_PRICE',external_stock_write_allowed:false};
}
