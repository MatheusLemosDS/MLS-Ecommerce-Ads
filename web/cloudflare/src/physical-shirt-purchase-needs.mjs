// Pure planning over explicitly supplied physical evidence. This is not a
// purchase order, forecast, reservation, receipt, bank instruction or write API.
// A server adapter must obtain these facts from the scoped domain services;
// accepting a DTO here does not verify a caller's permissions or its evidence.
//
// Contract: demands are versioned physical components whose quantity is ALREADY
// unallocated. Stock supplies the usable physical count and its reservations,
// not a financial inventory value. A receipt contributes only its unreceived,
// uncancelled, uncommitted remainder, with supplier confirmation and a future
// civil date. Received units belong to the physical snapshot and are not added
// again. Coverage flags describe the entire supplied planning selection.
//
// Each policy is one explicit supplier choice for one variant. Its shipping
// quote must be assigned to that proposal, not copied from a shared shipment;
// duplicate quote refs are rejected. Minimum/multiple are applied once to the
// consolidated shortage (absolute multiples from zero). No forecast, price,
// cash balance, physical quantity or supplier policy is inferred here.
//
// READY_FOR_REVIEW means only that the selected evidence supports this arithmetic.
// An effectful caller must revalidate the retained versions and scope; this plan
// does not reserve supply and cannot authorize a purchase or money movement.
export class PhysicalShirtPurchaseNeedsError extends Error {
 constructor(code){super('PHYSICAL_SHIRT_PURCHASE_NEEDS_'+code);this.code=this.message;this.status=400;}
}
const fail=code=>{throw new PhysicalShirtPurchaseNeedsError(code);};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const array=(value,max=1000)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,i)=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,String(i))||{},'value')).every(Boolean);
const integer=(value,min=0)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min;
const text=(value,max=160)=>typeof value==='string'&&value.length>0&&value.length<=max&&value.trim()===value&&value.normalize('NFC')===value&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);
const token=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const date=value=>typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const sum=(values,code='QUANTITY_OVERFLOW')=>{const total=values.reduce((n,value)=>n+BigInt(value),0n);if(total<0n||total>BigInt(Number.MAX_SAFE_INTEGER))fail(code);return Number(total);};
const amount=value=>{if(value<0n||value>BigInt(Number.MAX_SAFE_INTEGER))fail('AMOUNT_OVERFLOW');return Number(value);};
const ordered=(a,b)=>a<b?-1:a>b?1:0;
function scope(value){if(!exact(value,['organization_id','store_id','currency'])||!token(value.organization_id)||!token(value.store_id)||value.currency!=='BRL')fail('SCOPE_INVALID');return {...value};}
function sameScope(value,selected){const actual=scope(value);if(Object.keys(selected).some(key=>actual[key]!==selected[key]))fail('SCOPE_MISMATCH');}
function source(row,selected){sameScope(row.scope,selected);if(!integer(row.source_revision,1)||!text(row.evidence_ref))fail('SOURCE_INVALID');}
function validate(input){
 if(!exact(input,['schema','scope','planning_date','stock','demand_coverage_complete','receipt_coverage_complete','demands','receipts','policies'])||typeof input.demand_coverage_complete!=='boolean'||typeof input.receipt_coverage_complete!=='boolean'||input.schema!=='physical_shirt_purchase_needs_input_v1'||!date(input.planning_date)||!array(input.demands)||!array(input.receipts)||!array(input.policies))fail('INPUT_INVALID');
 const selected=scope(input.scope),stock=input.stock;
 if(!exact(stock,['scope','as_of_date','evidence_ref','coverage_complete','variants'])||!date(stock.as_of_date)||stock.as_of_date>input.planning_date||typeof stock.coverage_complete!=='boolean'||!array(stock.variants))fail('STOCK_INVALID');
 sameScope(stock.scope,selected);if(!text(stock.evidence_ref))fail('SOURCE_INVALID');const variants=new Map();
 for(const row of stock.variants){
  if(!exact(row,['variant_id','state','physical_usable_quantity','reserved_quantity','source_revision','evidence_ref'])||!hash(row.variant_id)||variants.has(row.variant_id)||!['CONFIRMED','UNKNOWN'].includes(row.state)||!integer(row.source_revision,1)||!text(row.evidence_ref))fail('STOCK_VARIANT_INVALID');
  if(row.state==='UNKNOWN'?(row.physical_usable_quantity!==null||row.reserved_quantity!==null):!integer(row.physical_usable_quantity)||!integer(row.reserved_quantity)||row.reserved_quantity>row.physical_usable_quantity)fail('STOCK_VARIANT_INVALID');
  variants.set(row.variant_id,row);
 }
 const identities=new Set(),demands=input.demands.map(row=>{
  if(!exact(row,['scope','demand_ref','component_ref','composition_revision','variant_id','quantity_unallocated','needed_on','source_revision','evidence_ref'])||!text(row.demand_ref)||!text(row.component_ref)||!integer(row.composition_revision,1)||!hash(row.variant_id)||row.quantity_unallocated!==null&&!integer(row.quantity_unallocated)||!date(row.needed_on))fail('DEMAND_INVALID');
  source(row,selected);const key=JSON.stringify([row.demand_ref,row.component_ref]);if(identities.has(key))fail('DEMAND_DUPLICATE');identities.add(key);return row;
 });
 const receiptIds=new Set(),receipts=input.receipts.map(row=>{
  if(!exact(row,['scope','receipt_ref','variant_id','supplier_id','status','ordered_quantity','received_quantity','cancelled_quantity','committed_quantity','expected_on','source_revision','evidence_ref'])||!text(row.receipt_ref)||receiptIds.has(row.receipt_ref)||!hash(row.variant_id)||!token(row.supplier_id)||!['DRAFT','CONFIRMED','PARTIALLY_RECEIVED','RECEIVED','CANCELLED'].includes(row.status)||row.ordered_quantity!==null&&!integer(row.ordered_quantity)||![row.received_quantity,row.cancelled_quantity,row.committed_quantity].every(value=>integer(value))||row.expected_on!==null&&!date(row.expected_on))fail('RECEIPT_INVALID');
  source(row,selected);receiptIds.add(row.receipt_ref);
  if(row.ordered_quantity!==null&&BigInt(row.received_quantity)+BigInt(row.cancelled_quantity)+BigInt(row.committed_quantity)>BigInt(row.ordered_quantity))fail('RECEIPT_QUANTITY_INVALID');
  if(row.status==='RECEIVED'&&(row.ordered_quantity===null||row.received_quantity+row.cancelled_quantity!==row.ordered_quantity||row.committed_quantity!==0)||row.status==='CANCELLED'&&(row.ordered_quantity===null||row.received_quantity+row.cancelled_quantity!==row.ordered_quantity||row.committed_quantity!==0))fail('RECEIPT_STATUS_INVALID');
  return row;
 });
 const policies=new Map(),quotes=new Set();
 for(const row of input.policies){
  if(!exact(row,['scope','variant_id','supplier_id','minimum_quantity','multiple_quantity','unit_cost_cents','shipping_cents','quote_ref','source_revision','evidence_ref'])||!hash(row.variant_id)||policies.has(row.variant_id)||row.supplier_id!==null&&!token(row.supplier_id)||row.minimum_quantity!==null&&!integer(row.minimum_quantity)||row.multiple_quantity!==null&&!integer(row.multiple_quantity,1)||row.unit_cost_cents!==null&&!integer(row.unit_cost_cents)||row.shipping_cents!==null&&!integer(row.shipping_cents)||!text(row.quote_ref)||quotes.has(row.quote_ref))fail('POLICY_INVALID');
  source(row,selected);policies.set(row.variant_id,row);quotes.add(row.quote_ref);
 }
 return {selected,stock,variants,demands,receipts,policies};
}
const provenance=row=>({source_revision:row.source_revision,evidence_ref:row.evidence_ref});

export function planPhysicalShirtPurchaseNeeds(input){
 const {selected,stock,variants,demands,receipts,policies}=validate(input),byVariant=new Map(),ignored=[],pending=[];
 for(const demand of demands){if(!byVariant.has(demand.variant_id))byVariant.set(demand.variant_id,[]);byVariant.get(demand.variant_id).push(demand);}
 const results=[];
 for(const [variant_id,rows] of [...byVariant].sort(([a],[b])=>ordered(a,b))){
  rows.sort((a,b)=>ordered(a.needed_on,b.needed_on)||ordered(a.demand_ref,b.demand_ref)||ordered(a.component_ref,b.component_ref));
  const physical=variants.get(variant_id),policy=policies.get(variant_id),codes=[],incoming=[];
  if(!physical||physical.state!=='CONFIRMED')codes.push('INITIAL_STOCK_UNKNOWN');
  if(stock.as_of_date!==input.planning_date)codes.push('STOCK_SNAPSHOT_STALE');
  if(!stock.coverage_complete)codes.push('STOCK_COVERAGE_PARTIAL');
  if(rows.some(row=>row.quantity_unallocated===null))codes.push('PHYSICAL_DEMAND_UNKNOWN');
  if(!input.demand_coverage_complete)codes.push('DEMAND_COVERAGE_PARTIAL');
  if(!input.receipt_coverage_complete)codes.push('RECEIPT_COVERAGE_PARTIAL');
  for(const receipt of receipts.filter(row=>row.variant_id===variant_id).sort((a,b)=>ordered(a.expected_on??'',b.expected_on??'')||ordered(a.receipt_ref,b.receipt_ref))){
   let reason=null;
   if(['DRAFT','RECEIVED','CANCELLED'].includes(receipt.status))reason='RECEIPT_'+receipt.status;
   else if(receipt.ordered_quantity===null){codes.push('FIRM_RECEIPT_QUANTITY_UNKNOWN');reason='FIRM_RECEIPT_QUANTITY_UNKNOWN';}
   else{
    const quantity=receipt.ordered_quantity-receipt.received_quantity-receipt.cancelled_quantity-receipt.committed_quantity;
    if(quantity===0)reason='NO_UNCOMMITTED_FUTURE_QUANTITY';
    else if(receipt.expected_on===null){codes.push('FIRM_RECEIPT_DATE_UNKNOWN');reason='FIRM_RECEIPT_DATE_UNKNOWN';}
    else if(receipt.expected_on<input.planning_date){codes.push('OVERDUE_RECEIPT_REQUIRES_RECONFIRMATION');reason='OVERDUE_RECEIPT_REQUIRES_RECONFIRMATION';}
    else incoming.push({receipt_ref:receipt.receipt_ref,supplier_id:receipt.supplier_id,expected_on:receipt.expected_on,quantity,remaining:quantity,...provenance(receipt)});
   }
   if(reason)ignored.push({variant_id,receipt_ref:receipt.receipt_ref,reason,...provenance(receipt)});
  }
  const free=physical?.state==='CONFIRMED'?physical.physical_usable_quantity-physical.reserved_quantity:null,knownRows=rows.filter(row=>row.quantity_unallocated!==null),knownDemand=knownRows.length?sum(knownRows.map(row=>row.quantity_unallocated)):null;
  const basisKnown=codes.length===0,allocations=[];let available=free??0,shortage=0;
  // Supplied demand is already unallocated: reservations are subtracted only
  // from physical stock. Each future remaining unit is consumed at most once.
  for(const row of rows){
   const base={demand_ref:row.demand_ref,component_ref:row.component_ref,composition_revision:row.composition_revision,needed_on:row.needed_on,overdue:row.needed_on<input.planning_date,quantity_unallocated:row.quantity_unallocated,...provenance(row)};
   if(!basisKnown){allocations.push({...base,state:'UNKNOWN',from_current_free_quantity:null,incoming:[],shortage_quantity:null});continue;}
   const physicalUsed=Math.min(available,row.quantity_unallocated);available-=physicalUsed;let needed=row.quantity_unallocated-physicalUsed;const used=[];
   for(const receipt of incoming){
    if(needed===0)break;if(receipt.expected_on>row.needed_on||receipt.remaining===0)continue;
    const quantity=Math.min(needed,receipt.remaining);receipt.remaining-=quantity;needed-=quantity;used.push({receipt_ref:receipt.receipt_ref,quantity,expected_on:receipt.expected_on,...provenance(receipt)});
   }
   shortage=sum([shortage,needed]);allocations.push({...base,state:'CALCULATED',from_current_free_quantity:physicalUsed,incoming:used,shortage_quantity:needed});
  }
  let suggested=null,overbuy=null,goods=null,shipping=null,total=null;
  if(basisKnown){
   if(shortage===0){suggested=0;overbuy=0;goods=0;shipping=0;total=0;}
   else if(!policy||policy.minimum_quantity===null||policy.multiple_quantity===null)codes.push('SUPPLIER_QUANTITY_POLICY_UNKNOWN');
   else{
    const need=BigInt(Math.max(shortage,policy.minimum_quantity)),multiple=BigInt(policy.multiple_quantity),rounded=((need+multiple-1n)/multiple)*multiple;
    if(rounded>BigInt(Number.MAX_SAFE_INTEGER))fail('QUANTITY_OVERFLOW');suggested=Number(rounded);overbuy=suggested-shortage;
   }
   if(shortage>0){
    if(!policy||policy.supplier_id===null)codes.push('SUPPLIER_UNKNOWN');
    if(!policy||policy.unit_cost_cents===null)codes.push('UNIT_COST_UNKNOWN');
    if(!policy||policy.shipping_cents===null)codes.push('SHIPPING_UNKNOWN');
    if(suggested!==null&&policy?.unit_cost_cents!==null&&policy?.unit_cost_cents!==undefined)goods=amount(BigInt(suggested)*BigInt(policy.unit_cost_cents));
    if(suggested!==null&&policy?.shipping_cents!==null&&policy?.shipping_cents!==undefined)shipping=policy.shipping_cents;
    if(goods!==null&&shipping!==null)total=amount(BigInt(goods)+BigInt(shipping));
   }
  }
  const uniqueCodes=[...new Set(codes)].sort();pending.push(...uniqueCodes.map(code=>({variant_id,code})));
  results.push({variant_id,state:uniqueCodes.length?'PARTIAL':'READY_FOR_REVIEW',known_demand_quantity:knownDemand,quantity_unallocated:basisKnown?knownDemand:null,physical_usable_quantity:physical?.physical_usable_quantity??null,reserved_quantity:physical?.reserved_quantity??null,current_free_quantity:free,free_quantity_after_known_allocations:basisKnown?available:null,shortage_quantity:basisKnown?shortage:null,suggested_buy_quantity:suggested,overbuy_quantity:overbuy,needed_on:basisKnown?allocations.find(row=>row.shortage_quantity>0)?.needed_on??null:null,supplier_id:policy?.supplier_id??null,quantity_policy:policy?{minimum_quantity:policy.minimum_quantity,multiple_quantity:policy.multiple_quantity}:null,unit_cost_cents:policy?.unit_cost_cents??null,shipping_quote_basis:'EXPLICIT_QUOTE_ASSIGNED_TO_THIS_VARIANT_PROPOSAL',goods_estimate_cents:goods,shipping_estimate_cents:shipping,total_estimate_cents:total,allocations,incoming:incoming.map(({remaining,...receipt})=>({...receipt,used_quantity:receipt.quantity-remaining,remaining_uncommitted_quantity:remaining})),stock_source:physical?{snapshot_evidence_ref:stock.evidence_ref,...provenance(physical)}:null,policy_source:policy?{quote_ref:policy.quote_ref,...provenance(policy)}:null,pending:uniqueCodes});
 }
 if(results.length===0){for(const [complete,code]of [[input.demand_coverage_complete,'DEMAND_COVERAGE_PARTIAL'],[input.receipt_coverage_complete,'RECEIPT_COVERAGE_PARTIAL'],[stock.coverage_complete,'STOCK_COVERAGE_PARTIAL']])if(!complete)pending.push({variant_id:null,code});}
 const knownCosts=results.filter(row=>row.total_estimate_cents!==null),knownTotal=knownCosts.length?sum(knownCosts.map(row=>row.total_estimate_cents),'AMOUNT_OVERFLOW'):results.length===0&&pending.length===0?0:null;
 return {schema:'physical_shirt_purchase_needs_v1',scope:selected,planning_date:input.planning_date,state:pending.length?'PARTIAL':'READY_FOR_REVIEW',variants:results,ignored_receipts:ignored.sort((a,b)=>ordered(a.variant_id,b.variant_id)||ordered(a.receipt_ref,b.receipt_ref)),known_estimate_cents:knownTotal,total_estimate_cents:pending.length===0&&knownCosts.length===results.length?knownTotal:null,pending,input_coverage:{physical_demand:input.demand_coverage_complete,future_receipts:input.receipt_coverage_complete,physical_stock:stock.coverage_complete},stock_source:{as_of_date:stock.as_of_date,coverage_complete:stock.coverage_complete,evidence_ref:stock.evidence_ref},basis:'EXPLICIT_UNALLOCATED_PHYSICAL_DEMAND_AND_SCOPED_EVIDENCE_NOT_SALES_FORECAST_OR_AVAILABLE_CASH',external_orders_allowed:false,financial_writes_allowed:false,stock_reservations_written:false};
}
