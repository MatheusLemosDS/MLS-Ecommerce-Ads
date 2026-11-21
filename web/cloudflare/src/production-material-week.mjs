import {productionWeeklyPeriod} from './production-weekly-close.mjs';
import {readMaterialNeedsWorkspace} from './production-material-workspace.mjs';
import {readOperationalCollectionSnapshot} from './operational-journal.mjs';
import {projectProductionWeeklyPaymentLedger} from './production-weekly-payments.mjs';
import {financialDigest} from './financial-event-ledger.mjs';

export class ProductionMaterialWeekError extends Error{
 constructor(code,status=400){super('PRODUCTION_MATERIAL_WEEK_'+code);this.code=this.message;this.status=status;}
}

// Physical quantities and already-declared obligations are separate sources.
// This current read never creates or revises a saved financial closing.
export function projectProductionMaterialWeek({materials,providers,providers_complete,week_end}={}){
 const fail=code=>{throw new ProductionMaterialWeekError(code,503);};
 const integer=n=>Number.isSafeInteger(n)&&!Object.is(n,-0)&&n>=0;
 const sum=rows=>{const value=rows.reduce((a,b)=>{if(!integer(b))fail('AMOUNT_INVALID');return a+BigInt(b);},0n);if(value>BigInt(Number.MAX_SAFE_INTEGER))fail('ARITHMETIC_UNSAFE');return Number(value);};
 let period;try{period=productionWeeklyPeriod(week_end);}catch{throw new ProductionMaterialWeekError('PERIOD_INVALID');}
 if(materials?.schema!=='production_material_workspace_v1'||materials.coverage?.source_integrity_verified!==true||!Array.isArray(materials.orders)||!Array.isArray(materials.purchases)||!Array.isArray(providers)||typeof providers_complete!=='boolean')fail('SOURCE_INVALID');
 const validDate=date=>typeof date==='string'&&/^20\d\d-\d\d-\d\d$/.test(date)&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date;
 const inDates=date=>validDate(date)&&date>=period.start_date&&date<=period.end_date;
 const ambiguous=date=>date===period.start_date||date===period.end_date;
 const receipts=[],consumptions=[],reversed=[],seenReceipts=new Set(),seenConsumptions=new Set();
 for(const purchase of materials.purchases){
  if(!Array.isArray(purchase.receipts))fail('SOURCE_INVALID');
  for(const receipt of purchase.receipts){
   if(seenReceipts.has(receipt.receipt_id))fail('DUPLICATE_RECEIPT');seenReceipts.add(receipt.receipt_id);
   if(!validDate(receipt.effective_date))fail('RECEIPT_DATE_INVALID');
   if(!inDates(receipt.effective_date))continue;
   if(!Array.isArray(receipt.lines)||!receipt.lines.length)fail('RECEIPT_INVALID');
   const quantity=sum(receipt.lines.map(line=>line.quantity));
   receipts.push({purchase_id:purchase.purchase_id,receipt_id:receipt.receipt_id,effective_date:receipt.effective_date,quantity,friday_cutoff_pending:ambiguous(receipt.effective_date),reference:receipt.reference});
  }
 }
 for(const order of materials.orders){
  if(!Array.isArray(order.consumptions))fail('SOURCE_INVALID');
  for(const consumption of order.consumptions){
   if(seenConsumptions.has(consumption.consumption_id))fail('DUPLICATE_CONSUMPTION');seenConsumptions.add(consumption.consumption_id);
   if(!integer(consumption.quantity)||consumption.quantity===0||!validDate(consumption.effective_date)||!['ACTIVE','REVERSED'].includes(consumption.status)||consumption.status==='REVERSED'&&!validDate(consumption.reversed_effective_date))fail('CONSUMPTION_INVALID');
   if(!inDates(consumption.effective_date)&&!(consumption.status==='REVERSED'&&inDates(consumption.reversed_effective_date)))continue;
   const row={consumption_id:consumption.consumption_id,production_record_id:consumption.production_record_id,variant_id:consumption.variant_id,effective_date:consumption.effective_date,quantity:consumption.quantity,status:consumption.status,reversed_at:consumption.reversed_at,reversed_effective_date:consumption.reversed_effective_date??null,friday_cutoff_pending:inDates(consumption.effective_date)&&ambiguous(consumption.effective_date)||consumption.status==='REVERSED'&&inDates(consumption.reversed_effective_date)&&ambiguous(consumption.reversed_effective_date)};
   (consumption.status==='ACTIVE'?consumptions:reversed).push(row);
  }
 }
 const obligations=[];
 for(const provider of providers){
  if(!Array.isArray(provider.obligations)||!Array.isArray(provider.payments))fail('PAYMENTS_INVALID');
  for(const row of provider.obligations.filter(row=>row.week_end===week_end)){
   if(!integer(row.amount_cents)||!integer(row.settled_cents)||!integer(row.remaining_cents))fail('PAYMENTS_INVALID');
   const allocations=provider.payments.flatMap(payment=>payment.allocations.filter(a=>a.obligation_id===row.obligation_id).map(a=>({payment_id:payment.payment_id,paid_on:payment.paid_on,status:payment.status,amount_cents:a.amount_cents})));
   obligations.push({...row,provider_id:provider.provider_id,provider_name:provider.name,ledger_revision:provider.revision,allocations});
  }
 }
 const receiptCoverage=materials.coverage?.purchases_complete===true&&materials.coverage?.stock_complete===true;
 const consumptionCoverage=materials.coverage?.stock_complete===true&&materials.coverage?.manufacturing_complete===true;
 const pending=[];
 if(!receiptCoverage||!consumptionCoverage)pending.push('LOCAL_MATERIAL_COVERAGE_PARTIAL');
 if(!providers_complete)pending.push('PAYMENTS_COVERAGE_PARTIAL');
 if([...receipts,...consumptions].some(row=>row.friday_cutoff_pending))pending.push('FRIDAY_TIME_OR_ALLOCATION_REQUIRED');
 if(reversed.length)pending.push('CONSUMPTION_CORRECTIONS_REQUIRE_ORIGINAL_AND_CORRECTION_DATE_REVIEW');
 pending.push('OTHER_PHYSICAL_MOVEMENTS_USE_THE_STOCK_AUDIT','NOT_A_SAVED_FINANCIAL_CLOSE');
 return {
  schema:'production_material_week_projection_v1',period,
  basis:'CURRENT_PURCHASE_RECEIPTS_AND_LINKED_MANUFACTURING_CONSUMPTION',
  date_basis:'DECLARED_EFFECTIVE_DATE_FRIDAY_TIME_UNPROVEN',
  receipts,consumptions,reversed_consumptions:reversed,obligations,
  quantities:{received_known_interior_pieces:sum(receipts.filter(r=>!r.friday_cutoff_pending).map(r=>r.quantity)),consumed_known_interior_pieces:sum(consumptions.filter(r=>!r.friday_cutoff_pending).map(r=>r.quantity)),received_week_pieces:receiptCoverage&&!receipts.some(r=>r.friday_cutoff_pending)?sum(receipts.map(r=>r.quantity)):null,consumed_week_pieces:consumptionCoverage&&!consumptions.some(r=>r.friday_cutoff_pending)&&!reversed.length?sum(consumptions.map(r=>r.quantity)):null},
  weekly_obligations:{declared_cents:providers_complete?sum(obligations.filter(r=>r.status!=='CANCELLED').map(r=>r.amount_cents)):null,settled_cents:providers_complete?sum(obligations.filter(r=>r.status!=='CANCELLED').map(r=>r.settled_cents)):null,outstanding_cents:providers_complete?sum(obligations.map(r=>r.remaining_cents)):null,basis:'ALLOCATION_TO_THIS_OBLIGATION_WEEK_NOT_CASH_FLOW_DURING_THE_WEEK'},
  pending,financial_close_approved:false,
  coverage:{purchase_receipts_complete:receiptCoverage,linked_consumptions_complete:consumptionCoverage,other_physical_movements_included:false,provider_completeness:'LOCAL_DECLARATIONS_ONLY_ACTUAL_ACCOUNTS_NOT_PROVEN'},
  accounting_effects:{new_expense_cents:0,new_cogs_cents:0,new_bank_movement_cents:0},
  money_transfer_allowed:false,external_purchase_allowed:false
 };
}

export async function readProductionMaterialWeekWorkspace(env,query,options={}){
 if(!query||Object.keys(query).join(',')!=='week_end'||!options||Object.keys(options).some(k=>k!=='now')||options.now!==undefined&&typeof options.now!=='function')throw new ProductionMaterialWeekError('REQUEST_INVALID');
 let period;try{period=productionWeeklyPeriod(query.week_end);}catch{throw new ProductionMaterialWeekError('PERIOD_INVALID');}
 const now=(options.now??Date.now)();if(!Number.isSafeInteger(now)||now<=0)throw new ProductionMaterialWeekError('CLOCK_INVALID',503);
 const fixed={now:()=>now};
 // The journal is observed today. A past reporting week must not pretend to
 // reconstruct a historical stock balance or ask the purchase planner to do so.
 const observation_date=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(now));
 const materials=await readMaterialNeedsWorkspace(env,{planning_date:observation_date},fixed);
 const payments=await readOperationalCollectionSnapshot(env,{kinds:['PRODUCTION_WEEKLY_PAYMENTS']},{...fixed,readCapability:'finance.read'});
 if(payments.scope.organization_id!==materials.scope.organization_id||payments.scope.store_id!==materials.scope.store_id)throw new ProductionMaterialWeekError('SCOPE_MISMATCH',403);
 const providers=payments.records.map(row=>projectProductionWeeklyPaymentLedger(row.payload,row.revision));
 const report=projectProductionMaterialWeek({materials,providers,providers_complete:payments.complete,week_end:query.week_end});
 return {schema:'production_material_week_workspace_v1',scope:materials.scope,checked_at:new Date(now).toISOString(),material_observation_date:observation_date,source_vector:{material_fence:materials.fence_hash,payment_heads:payments.fence_hash},fence_hash:await financialDigest([period,materials.fence_hash,payments.fence_hash]),joint_financial_snapshot:false,report};
}
