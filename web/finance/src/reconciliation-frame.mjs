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
