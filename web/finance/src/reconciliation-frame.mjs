// This contract describes source evidence. Neither a requested refund nor a
// successful audit is a bank settlement or a permission to execute an action.
export function projectReconciliationRequest(value){
 try{
  if(value===null||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==2)return null;
  const operation=Object.getOwnPropertyDescriptor(value,'operation'),run=Object.getOwnPropertyDescriptor(value,'run_id');
  if(!operation||!run||!Object.hasOwn(operation,'value')||!Object.hasOwn(run,'value')||!['read','step'].includes(operation.value)||typeof run.value!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(run.value))return null;
  return {operation:operation.value,run_id:run.value};
 }catch{return null;}
}

// Kept self-contained so the owner page can embed this exact projector before
// its Worker is minified. Unknown fields and accessors never cross the boundary.
export function projectReconciliationFrame(value){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const cents=(item,signed=false)=>item===null||int(item,signed?Number.MIN_SAFE_INTEGER:0);
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const hash=item=>typeof item==='string'&&/^[a-f0-9]{64}$/.test(item);
 const pendingCodes=['SOURCE_COLLECTING','ORDER_EVIDENCE_MISSING','ADJUSTMENT_FIELDS_UNAVAILABLE','ADJUSTMENT_CONFLICT','RETURN_REFERENCES_MISSING','RETURN_DETAILS_PENDING','RETURN_PERMISSION_REQUIRED','RETURN_VALUES_UNVERIFIED','RETURN_STATUS_UNRECOGNIZED','SETTLEMENT_NOT_RECONCILED'];
 const caseStatuses=['PENDING','UNKNOWN','REQUESTED','ACCEPTED','CANCELLED','JUDGING','REFUND_PAID','CLOSED','PROCESSING'];
 const caseDiagnostics=['DETAILS_PENDING','PERMISSION_DENIED','RATE_LIMIT','TIMEOUT','UNAVAILABLE','INVALID_RESPONSE','UNKNOWN_STATUS','CURRENCY_MISMATCH'];
 try{
  const keys=['schema','run_id','source_revision','start_date','end_date','checked_at','status','source_checked_at','coverage','adjustments','returns','cases','truncation','pending','basis'];
  if(!exact(value,keys)||value.schema!=='finance_reconciliation_v1'||typeof value.run_id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.run_id)||!int(value.source_revision,1,2147483647)||!day(value.start_date)||!day(value.end_date)||value.start_date<'2000-01-01'||value.end_date<value.start_date||(Date.parse(value.end_date)-Date.parse(value.start_date))/86400000>14||!int(value.checked_at,1,9999999999)||!['CHECKED','PARTIAL','COLLECTING','BLOCKED'].includes(value.status)||value.basis!=='SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT')return null;
  if(value.end_date>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000)))return null;
  const c=value.coverage,a=value.adjustments,r=value.returns,s=value.source_checked_at,t=value.truncation,p=value.pending;
  const coverageKeys=['orders','evidence_orders','missing_evidence_orders','paid_orders','review_orders','return_orders','return_unknown_orders'];
  if(!exact(c,coverageKeys)||!coverageKeys.every(key=>int(c[key],0,1000))||c.evidence_orders+c.missing_evidence_orders!==c.orders||c.paid_orders+c.review_orders>c.orders||c.return_orders+c.return_unknown_orders>c.paid_orders)return null;
  if(!exact(a,['reported_orders','missing_orders','conflicting_orders','known_adjustment_cents','base_repass_cents','after_adjustment_repass_cents'])||!['reported_orders','missing_orders','conflicting_orders'].every(key=>int(a[key],0,c.paid_orders))||a.reported_orders+a.missing_orders+a.conflicting_orders!==c.paid_orders||!int(a.known_adjustment_cents,Number.MIN_SAFE_INTEGER)||!cents(a.base_repass_cents,true)||!cents(a.after_adjustment_repass_cents,true)||a.reported_orders===0&&a.known_adjustment_cents!==0)return null;
  if(a.after_adjustment_repass_cents!==null&&(a.reported_orders!==c.paid_orders||a.missing_orders!==0||a.conflicting_orders!==0||a.base_repass_cents===null||BigInt(a.base_repass_cents)+BigInt(a.known_adjustment_cents)!==BigInt(a.after_adjustment_repass_cents)))return null;
  if(!exact(r,['reference_count','checked_count','pending_count','known_requested_refund_cents','requested_amount_complete','permission'])||!['reference_count','checked_count','pending_count'].every(key=>int(r[key],0,100000))||r.checked_count+r.pending_count!==r.reference_count||!int(r.known_requested_refund_cents)||typeof r.requested_amount_complete!=='boolean'||!['UNKNOWN','AVAILABLE','DENIED'].includes(r.permission)||r.checked_count===0&&r.known_requested_refund_cents!==0||r.requested_amount_complete&&r.pending_count!==0||r.reference_count===0&&!r.requested_amount_complete)return null;
  if(!exact(s,['finance_oldest_at','finance_latest_at','returns_oldest_at','returns_latest_at']))return null;
  for(const scope of ['finance','returns']){
   const oldest=s[scope+'_oldest_at'],latest=s[scope+'_latest_at'];
   if((oldest===null)!==(latest===null)||oldest!==null&&(!int(oldest,1,value.checked_at)||!int(latest,oldest,value.checked_at)))return null;
  }
  if(c.orders>0&&s.finance_oldest_at===null||(r.checked_count===0)!==(s.returns_oldest_at===null))return null;
  if(!array(value.cases,40)||!exact(t,['truncated','cases_total','cases_included'])||typeof t.truncated!=='boolean'||t.cases_total!==r.reference_count||t.cases_included!==value.cases.length||t.cases_included>t.cases_total||t.truncated!==(t.cases_included<t.cases_total))return null;
  const seen=new Set(),cases=[];let visibleChecked=0,visibleKnown=0n,visibleMissingAmount=false,visibleUnknown=false;
  for(const item of value.cases){
   if(!exact(item,['case_hash','order_hash','status','requested_refund_cents','checked_at','diagnostic'])||!hash(item.case_hash)||!hash(item.order_hash)||seen.has(item.case_hash)||!caseStatuses.includes(item.status)||!cents(item.requested_refund_cents)||item.diagnostic!==null&&!caseDiagnostics.includes(item.diagnostic))return null;
   seen.add(item.case_hash);
   if(item.checked_at===null){
    if(item.status!=='PENDING'||item.requested_refund_cents!==null||item.diagnostic===null||item.diagnostic==='UNKNOWN_STATUS')return null;
   }else{
    if(!int(item.checked_at,1,value.checked_at)||item.status==='PENDING'||![null,'UNKNOWN_STATUS'].includes(item.diagnostic)||item.checked_at<s.returns_oldest_at||item.checked_at>s.returns_latest_at||(item.status==='UNKNOWN')!==(item.diagnostic==='UNKNOWN_STATUS'))return null;
    visibleChecked++;
    if(item.requested_refund_cents===null)visibleMissingAmount=true;else visibleKnown+=BigInt(item.requested_refund_cents);
    if(item.status==='UNKNOWN')visibleUnknown=true;
   }
   cases.push({...item});
  }
  if(visibleChecked>r.checked_count||visibleKnown>BigInt(r.known_requested_refund_cents)||r.requested_amount_complete&&visibleMissingAmount)return null;
  if(!t.truncated&&(visibleChecked!==r.checked_count||visibleKnown!==BigInt(r.known_requested_refund_cents)||r.requested_amount_complete!==(r.pending_count===0&&!visibleMissingAmount)))return null;
  if(!array(p,pendingCodes.length)||new Set(p).size!==p.length||!p.every(code=>pendingCodes.includes(code))||!p.includes('SETTLEMENT_NOT_RECONCILED'))return null;
  const required=[...(c.missing_evidence_orders>0?['ORDER_EVIDENCE_MISSING']:[]),...(a.missing_orders>0?['ADJUSTMENT_FIELDS_UNAVAILABLE']:[]),...(a.conflicting_orders>0?['ADJUSTMENT_CONFLICT']:[]),...(c.return_unknown_orders>0||r.reference_count<c.return_orders?['RETURN_REFERENCES_MISSING']:[]),...(r.pending_count>0?['RETURN_DETAILS_PENDING']:[]),...(r.permission==='DENIED'?['RETURN_PERMISSION_REQUIRED']:[]),...(r.reference_count>0?['RETURN_VALUES_UNVERIFIED']:[]),...(visibleUnknown?['RETURN_STATUS_UNRECOGNIZED']:[])];
  if(!required.every(code=>p.includes(code))||value.status==='COLLECTING'&&!p.includes('SOURCE_COLLECTING')||value.status==='BLOCKED'&&!p.includes('RETURN_PERMISSION_REQUIRED'))return null;
  if(value.status==='CHECKED'&&(p.some(code=>!['SETTLEMENT_NOT_RECONCILED','RETURN_VALUES_UNVERIFIED'].includes(code))||a.base_repass_cents===null||a.after_adjustment_repass_cents===null))return null;
  return {schema:value.schema,run_id:value.run_id,source_revision:value.source_revision,start_date:value.start_date,end_date:value.end_date,checked_at:value.checked_at,status:value.status,source_checked_at:{...s},coverage:{...c},adjustments:{...a},returns:{...r},cases,truncation:{...t},pending:[...p],basis:value.basis};
 }catch{return null;}
}

export function reconciliationRequestMatches(request,frame){
 const selection=projectReconciliationRequest(request),value=projectReconciliationFrame(frame);
 return selection!==null&&value!==null&&selection.run_id===value.run_id;
}

// Explicit dependency keeps the negotiated evidence projector safe to embed
// in the owner page. Legacy responses remain a separate, unchanged contract.
export function projectReconciliationEvidenceFrame(value,projectLegacy){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const hash=item=>typeof item==='string'&&/^[a-f0-9]{64}$/.test(item);
 const states=['NOT_APPLICABLE','PENDING','RETRY_WAIT','KNOWN_EMPTY','AVAILABLE'],categories={IN_CANCEL:'in_cancel',TO_RETURN:'to_return',OTHER_STATUS:'other',UNKNOWN_STATUS:'unknown'},diagnostics=['DETAILS_PENDING','PERMISSION_DENIED','RATE_LIMIT','TIMEOUT','UNAVAILABLE','INVALID_RESPONSE','UNKNOWN_STATUS','CURRENCY_MISMATCH'];
 try{
  if(typeof projectLegacy!=='function'||!exact(value,['schema','report','review'])||value.schema!=='finance_reconciliation_v2')return null;
  const report=projectLegacy(value.report),r=value.review;if(!report||!exact(r,['schema','summary','orders','truncation','basis'])||r.schema!=='finance_review_orders_v1'||r.basis!=='REVIEW_ORDERS_OUTSIDE_PAID_COHORT'||!exact(r.summary,['orders','in_cancel','to_return','other','unknown'])||!Object.values(r.summary).every(count=>int(count,0,1000))||r.summary.orders!==report.coverage.review_orders||r.summary.in_cancel+r.summary.to_return+r.summary.other+r.summary.unknown!==r.summary.orders||!array(r.orders,40))return null;
  const t=r.truncation;if(!exact(t,['truncated','orders_total','orders_included'])||typeof t.truncated!=='boolean'||t.orders_total!==r.summary.orders||t.orders_included!==r.orders.length||t.orders_included!==Math.min(40,t.orders_total)||t.truncated!==(t.orders_included<t.orders_total))return null;
  const seen=new Set(),orders=[],counts={in_cancel:0,to_return:0,other:0,unknown:0};let references=0,checked=0,pending=0;
  for(const row of r.orders){
   if(!exact(row,['order_hash','status','source_checked_at','reference_state','reference_count','references_checked_at','reference_diagnostic','next_attempt_at','checked_cases','pending_cases'])||!hash(row.order_hash)||seen.has(row.order_hash)||!Object.hasOwn(categories,row.status)||!int(row.source_checked_at,report.source_checked_at.finance_oldest_at??1,report.source_checked_at.finance_latest_at??0)||!states.includes(row.reference_state)||row.reference_diagnostic!==null&&!diagnostics.includes(row.reference_diagnostic)||row.next_attempt_at!==null&&!int(row.next_attempt_at,1,9999999999))return null;
   seen.add(row.order_hash);counts[categories[row.status]]++;
   const known=['KNOWN_EMPTY','AVAILABLE'].includes(row.reference_state),cases=report.cases.filter(item=>item.order_hash===row.order_hash),visibleChecked=cases.filter(item=>item.checked_at!==null).length;
   if(known){
    if(!int(row.reference_count,0,100)||!int(row.checked_cases,0,row.reference_count)||!int(row.pending_cases,0,row.reference_count)||row.checked_cases+row.pending_cases!==row.reference_count||!int(row.references_checked_at,1,report.checked_at)||(row.reference_state==='KNOWN_EMPTY')!==(row.reference_count===0)||row.reference_diagnostic==='DETAILS_PENDING'||visibleChecked>row.checked_cases||cases.length-visibleChecked>row.pending_cases)return null;
    if(!report.truncation.truncated&&(cases.length!==row.reference_count||visibleChecked!==row.checked_cases))return null;
    references+=row.reference_count;checked+=row.checked_cases;pending+=row.pending_cases;
   }else{
    if(row.reference_count!==null||row.references_checked_at!==null||row.checked_cases!==null||row.pending_cases!==null||cases.length)return null;
    if(row.reference_state==='NOT_APPLICABLE'){if(row.status==='TO_RETURN'||row.reference_diagnostic!==null||row.next_attempt_at!==null)return null;}
    else if(row.status!=='TO_RETURN')return null;
    if(row.reference_state==='RETRY_WAIT'&&(row.next_attempt_at===null||row.next_attempt_at<=report.checked_at||row.reference_diagnostic===null||row.reference_diagnostic==='DETAILS_PENDING'))return null;
    if(row.reference_state==='PENDING'&&row.reference_diagnostic!==null&&row.reference_diagnostic!=='DETAILS_PENDING'&&row.next_attempt_at!==null&&row.next_attempt_at>report.checked_at)return null;
   }
   orders.push({...row});
  }
  if(Object.entries(counts).some(([key,count])=>count>r.summary[key]||!t.truncated&&count!==r.summary[key])||references>report.returns.reference_count||checked>report.returns.checked_count||pending>report.returns.pending_count)return null;
  if(!t.truncated&&report.coverage.orders===report.coverage.review_orders&&report.cases.some(row=>!seen.has(row.order_hash)))return null;
  const result={schema:'finance_reconciliation_v2',report,review:{schema:r.schema,summary:{...r.summary},orders,truncation:{...t},basis:r.basis}};
  // Every surviving string is an ASCII identifier, date or allowlisted enum.
  return JSON.stringify(result).length<=65536?result:null;
 }catch{return null;}
}

// The extension preserves the provider's exact case statuses and amounts.
// Neither ACCEPTED nor REFUND_PAID proves a bank movement or a seller debit.
export function projectReconciliationMoneyFrame(value,projectLegacy,projectReview){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const cent=item=>item===null||int(item,Number.MIN_SAFE_INTEGER);
 const hash=item=>typeof item==='string'&&/^[a-f0-9]{64}$/.test(item);
 const cohorts=['PAID','REVIEW','OTHER'],statuses=['PENDING','UNKNOWN','REQUESTED','ACCEPTED','CANCELLED','JUDGING','REFUND_PAID','CLOSED','PROCESSING'];
 try{
  if(typeof projectLegacy!=='function'||typeof projectReview!=='function'||!exact(value,['schema','report','review','money'])||value.schema!=='finance_reconciliation_v3')return null;
  const evidence=projectReview({schema:'finance_reconciliation_v2',report:value.report,review:value.review},projectLegacy),m=value.money;
  if(!evidence||!exact(m,['schema','currency','groups','payouts','truncation','basis'])||m.schema!=='finance_reconciliation_money_v1'||m.currency!=='BRL'||m.basis!=='SAVED_RETURN_AMOUNTS_AND_PAID_PAYOUT_AFTER_ADJUSTMENTS'||!array(m.groups,3)||m.groups.length!==3||!array(m.payouts,40))return null;
  const report=evidence.report,review=evidence.review,groups=[],byCohort=new Map(),sourceTimes=[],cohortLimits={PAID:report.coverage.paid_orders,REVIEW:report.coverage.review_orders,OTHER:report.coverage.orders-report.coverage.paid_orders-report.coverage.review_orders};
  let allCases=0,allChecked=0,allKnown=0,allAmount=0n,unknown=0;
  for(let groupIndex=0;groupIndex<cohorts.length;groupIndex++){
   const row=m.groups[groupIndex];if(!exact(row,['cohort','statuses','source_checked_at'])||row.cohort!==cohorts[groupIndex]||!array(row.statuses,statuses.length)||row.statuses.length!==statuses.length||!exact(row.source_checked_at,['oldest_at','latest_at']))return null;
   let cases=0,observed=0;const checkedStatuses=[];
   for(let index=0;index<statuses.length;index++){
    const item=row.statuses[index];if(!exact(item,['status','cases','amount_known','known_amount_cents'])||item.status!==statuses[index]||!int(item.cases,0,100000)||!int(item.amount_known,0,item.cases)||!int(item.known_amount_cents)||item.amount_known===0&&item.known_amount_cents!==0||item.status==='PENDING'&&(item.amount_known!==0||item.known_amount_cents!==0))return null;
    cases+=item.cases;if(item.status!=='PENDING')observed+=item.cases;if(item.status==='UNKNOWN')unknown+=item.cases;allKnown+=item.amount_known;allAmount+=BigInt(item.known_amount_cents);checkedStatuses.push({...item});
   }
   if(cohortLimits[row.cohort]===0&&cases!==0)return null;
   const s=row.source_checked_at;
   if(observed===0){if(s.oldest_at!==null||s.latest_at!==null)return null;}
   else{if(!int(s.oldest_at,report.source_checked_at.returns_oldest_at??1,report.source_checked_at.returns_latest_at??0)||!int(s.latest_at,s.oldest_at,report.source_checked_at.returns_latest_at??0))return null;sourceTimes.push(s.oldest_at,s.latest_at);}
   const projected={cohort:row.cohort,statuses:checkedStatuses,source_checked_at:{...s}};groups.push(projected);byCohort.set(row.cohort,{value:projected,cases,observed,visible:statuses.map(status=>({status,cases:0,amount_known:0,known_amount_cents:0n})),visibleTimes:[],payoutReferences:0,payoutCount:0});allCases+=cases;allChecked+=observed;
  }
  if(allCases!==report.returns.reference_count||allChecked!==report.returns.checked_count||allCases-allChecked!==report.returns.pending_count||allAmount!==BigInt(report.returns.known_requested_refund_cents)||report.returns.requested_amount_complete!==(allKnown===allCases)||unknown>0&&!report.pending.includes('RETURN_STATUS_UNRECOGNIZED'))return null;
  if(sourceTimes.length?(Math.min(...sourceTimes)!==report.source_checked_at.returns_oldest_at||Math.max(...sourceTimes)!==report.source_checked_at.returns_latest_at):report.source_checked_at.returns_oldest_at!==null)return null;
  const t=m.truncation;if(!exact(t,['truncated','payouts_total','payouts_included'])||typeof t.truncated!=='boolean'||!int(t.payouts_total,report.coverage.return_orders+review.summary.to_return,report.coverage.orders)||t.payouts_included!==m.payouts.length||t.payouts_included!==Math.min(40,t.payouts_total)||t.truncated!==(t.payouts_included<t.payouts_total))return null;
  const payouts=[],byHash=new Map(),reviewByHash=new Map(review.orders.map(row=>[row.order_hash,row])),paidStates={AVAILABLE:0,MISSING:0,CONFLICT:0};let paidBase=0n,paidBaseKnown=true,paidDelta=0n,paidAfter=0n;
  for(const row of m.payouts){
   if(!exact(row,['order_hash','cohort','source_checked_at','reference_count','state','base_repass_cents','adjustment_cents','after_adjustment_repass_cents'])||!hash(row.order_hash)||byHash.has(row.order_hash)||!cohorts.includes(row.cohort)||!int(row.source_checked_at,report.source_checked_at.finance_oldest_at??1,report.source_checked_at.finance_latest_at??0)||row.reference_count!==null&&!int(row.reference_count,0,100)||!['AVAILABLE','MISSING','CONFLICT','NOT_IN_PAID_COHORT'].includes(row.state)||!cent(row.base_repass_cents)||!cent(row.adjustment_cents)||!cent(row.after_adjustment_repass_cents))return null;
   const group=byCohort.get(row.cohort),linked=reviewByHash.get(row.order_hash);group.payoutCount++;group.payoutReferences+=row.reference_count??0;
   if(group.payoutCount>cohortLimits[row.cohort]||linked&&(row.cohort!=='REVIEW'||row.source_checked_at!==linked.source_checked_at||row.reference_count!==linked.reference_count)||row.cohort==='REVIEW'&&!review.truncation.truncated&&!linked)return null;
   if(row.cohort!=='PAID'){
    if(row.state!=='NOT_IN_PAID_COHORT'||row.base_repass_cents!==null||row.adjustment_cents!==null||row.after_adjustment_repass_cents!==null)return null;
   }else{
    if(row.state==='NOT_IN_PAID_COHORT'||report.adjustments.base_repass_cents!==null&&row.base_repass_cents===null)return null;
    paidStates[row.state]++;if(row.base_repass_cents===null)paidBaseKnown=false;else paidBase+=BigInt(row.base_repass_cents);
    if(row.state==='AVAILABLE'){
     if(row.base_repass_cents===null||row.adjustment_cents===null||row.after_adjustment_repass_cents===null||BigInt(row.base_repass_cents)+BigInt(row.adjustment_cents)!==BigInt(row.after_adjustment_repass_cents))return null;
     paidDelta+=BigInt(row.adjustment_cents);paidAfter+=BigInt(row.after_adjustment_repass_cents);
    }else if(row.adjustment_cents!==null||row.after_adjustment_repass_cents!==null)return null;
   }
   const cases=report.cases.filter(item=>item.order_hash===row.order_hash);
   if(cases.length>(row.reference_count??0)||!report.truncation.truncated&&row.reference_count!==null&&cases.length!==row.reference_count)return null;
   const projected={...row};payouts.push(projected);byHash.set(row.order_hash,projected);
  }
  if(paidStates.AVAILABLE>report.adjustments.reported_orders||paidStates.MISSING>report.adjustments.missing_orders||paidStates.CONFLICT>report.adjustments.conflicting_orders)return null;
  if(paidStates.AVAILABLE===report.adjustments.reported_orders&&paidDelta!==BigInt(report.adjustments.known_adjustment_cents))return null;
  if(byCohort.get('PAID').payoutCount===report.coverage.paid_orders){
   if(paidStates.AVAILABLE!==report.adjustments.reported_orders||paidStates.MISSING!==report.adjustments.missing_orders||paidStates.CONFLICT!==report.adjustments.conflicting_orders||paidBaseKnown!==(report.adjustments.base_repass_cents!==null)||paidBaseKnown&&paidBase!==BigInt(report.adjustments.base_repass_cents)||report.adjustments.after_adjustment_repass_cents!==null&&paidAfter!==BigInt(report.adjustments.after_adjustment_repass_cents))return null;
  }
  for(const item of report.cases){
   const payout=byHash.get(item.order_hash);if(!payout)return null;const group=byCohort.get(payout.cohort),visible=group.visible[statuses.indexOf(item.status)];visible.cases++;
   if(item.requested_refund_cents!==null){visible.amount_known++;visible.known_amount_cents+=BigInt(item.requested_refund_cents);}
   if(item.checked_at!==null){if(item.checked_at<group.value.source_checked_at.oldest_at||item.checked_at>group.value.source_checked_at.latest_at)return null;group.visibleTimes.push(item.checked_at);}
  }
  for(const group of byCohort.values()){
   if(group.payoutReferences>group.cases||!t.truncated&&group.payoutReferences!==group.cases)return null;
   for(let index=0;index<statuses.length;index++){const full=group.value.statuses[index],seen=group.visible[index];if(seen.cases>full.cases||seen.amount_known>full.amount_known||seen.known_amount_cents>BigInt(full.known_amount_cents)||!report.truncation.truncated&&(seen.cases!==full.cases||seen.amount_known!==full.amount_known||seen.known_amount_cents!==BigInt(full.known_amount_cents)))return null;}
   if(!report.truncation.truncated&&group.visibleTimes.length&&(Math.min(...group.visibleTimes)!==group.value.source_checked_at.oldest_at||Math.max(...group.visibleTimes)!==group.value.source_checked_at.latest_at))return null;
  }
  if(!review.truncation.truncated&&review.orders.reduce((count,row)=>count+(row.reference_count??0),0)!==byCohort.get('REVIEW').cases)return null;
  const result={schema:'finance_reconciliation_v3',report,review,money:{schema:m.schema,currency:m.currency,groups,payouts,truncation:{...t},basis:m.basis}};
  // All projected strings are ASCII identifiers or fixed allowlisted labels.
  return JSON.stringify(result).length<=65536?result:null;
 }catch{return null;}
}
