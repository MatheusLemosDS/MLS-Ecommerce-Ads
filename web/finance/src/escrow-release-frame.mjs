// Release observations and order-creation cohorts are separate scopes. These
// DTOs never describe bank receipts, refund payments or realized profit.
export function projectEscrowReleaseRequest(value){
 try{
  const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
  const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
  const uuid=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
  if(!exact(value,['operation','month','sources'])||!['read','step'].includes(value.operation)||typeof value.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||value.month<'2000-01'||!Array.isArray(value.sources)||Object.getPrototypeOf(value.sources)!==Array.prototype||value.sources.length>3||Reflect.ownKeys(value.sources).length!==value.sources.length+1)return null;
  const seen=new Set(),sources=[];
  for(let index=0;index<value.sources.length;index++){
   const descriptor=Object.getOwnPropertyDescriptor(value.sources,String(index));if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;
   const row=descriptor.value;if(!exact(row,['run_id','source_revision'])||!uuid(row.run_id)||seen.has(row.run_id)||!Number.isSafeInteger(row.source_revision)||row.source_revision<1||row.source_revision>2147483647)return null;
   seen.add(row.run_id);sources.push({run_id:row.run_id,source_revision:row.source_revision});
  }
  return {operation:value.operation,month:value.month,sources};
 }catch{return null;}
}

// Self-contained for the owner-page freezer. Every nullable monetary total
// remains distinct from its explicitly identified, possibly partial subset.
export function projectEscrowReleaseFrame(value){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const cent=item=>item===null||int(item,Number.MIN_SAFE_INTEGER);
 const uuid=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
 const date=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const time=item=>int(item,1,9999999999);
 const midnight=day=>{
  const target=Date.parse(day+'T00:00:00Z'),formatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',timeZoneName:'longOffset'});let result=target;
  for(let index=0;index<2;index++){const label=formatter.formatToParts(new Date(result)).find(part=>part.type==='timeZoneName')?.value,match=/^GMT([+-])(\d{2}):(\d{2})$/.exec(label||'');if(!match)return null;result=target-(Number(match[2])*3600+Number(match[3])*60)*(match[1]==='+'?1:-1)*1000;}
  return result/1000;
 };
 const pendingCodes=['SOURCE_COLLECTING','SOURCE_MISSING','RELEASES_COLLECTING','RELEASE_IDENTITY_AMBIGUOUS','RELEASE_AMOUNT_UNVERIFIED','RELEASE_SOURCE_UNAVAILABLE','MATCHING_INCOMPLETE','FINANCIAL_EVIDENCE_MISSING','BANK_RECEIPT_NOT_VERIFIED'];
 const diagnostics=['PERMISSION_DENIED','RATE_LIMIT','TIMEOUT','UNAVAILABLE','INVALID_RESPONSE','REPEATED_PAGE','LIMIT_REACHED'];
 try{
  if(!exact(value,['schema','month','checked_at','status','sources','calendar','collection','matching','pending','basis'])||value.schema!=='finance_escrow_releases_v1'||typeof value.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||value.month<'2000-01'||!time(value.checked_at)||!['COLLECTING','PARTIAL','CHECKED','BLOCKED','LIMIT_REACHED'].includes(value.status)||value.basis!=='RELEASE_CALENDAR_AND_ORDER_CREATE_COHORT_NOT_BANK_RECEIPT'||!array(value.sources,3))return null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000));if(value.month>today.slice(0,7))return null;
  const next=new Date(value.month+'-01T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);const from=midnight(value.month+'-01'),end=midnight(next.toISOString().slice(0,10));if(!time(from)||!time(end))return null;
  const sources=[],seen=new Set();let paid=0,allSources=value.sources.length>0,allExpected=true,expected=0n;
  for(const item of value.sources){
   if(!exact(item,['run_id','source_revision','start_date','end_date','status','orders','paid_orders','finance_oldest_at','finance_latest_at','expected_repass_cents'])||!uuid(item.run_id)||seen.has(item.run_id)||!int(item.source_revision,1,2147483647)||!['AVAILABLE','MISSING'].includes(item.status))return null;seen.add(item.run_id);
   if(item.status==='MISSING'){
    if(['start_date','end_date','orders','paid_orders','finance_oldest_at','finance_latest_at','expected_repass_cents'].some(key=>item[key]!==null))return null;allSources=false;allExpected=false;
   }else{
    if(!date(item.start_date)||!date(item.end_date)||item.start_date.slice(0,7)!==value.month||item.end_date.slice(0,7)!==value.month||item.end_date<item.start_date||item.end_date>today||(Date.parse(item.end_date)-Date.parse(item.start_date))/86400000>14||!int(item.orders,0,1000)||!int(item.paid_orders,0,item.orders)||!cent(item.expected_repass_cents))return null;
    if((item.finance_oldest_at===null)!==(item.finance_latest_at===null)||item.finance_oldest_at!==null&&(!time(item.finance_oldest_at)||!int(item.finance_latest_at,item.finance_oldest_at,value.checked_at))||item.orders>0&&item.finance_oldest_at===null||item.paid_orders===0&&item.expected_repass_cents!==0)return null;
    if(sources.some(previous=>previous.status==='AVAILABLE'&&previous.start_date<=item.end_date&&item.start_date<=previous.end_date))return null;
    paid+=item.paid_orders;if(item.expected_repass_cents===null)allExpected=false;else expected+=BigInt(item.expected_repass_cents);
   }
   sources.push({...item});
  }
  const c=value.calendar,w=value.collection,m=value.matching,p=value.pending;
  if(!exact(c,['scan_id','status','from_at','end_before_at','cutoff_at','source_oldest_at','source_latest_at','observations','unique_orders','ambiguous_orders','verified_orders','unverified_orders','known_verified_release_cents','total_release_cents'])||!['MISSING','RUNNING','COMPLETE','LIMIT_REACHED'].includes(c.status)||!['observations','unique_orders','ambiguous_orders','verified_orders','unverified_orders'].every(key=>int(c[key],0,10000))||c.unique_orders>c.observations||c.ambiguous_orders>Math.min(c.unique_orders,c.observations-c.unique_orders)||c.verified_orders+c.unverified_orders!==c.unique_orders||c.verified_orders>c.unique_orders-c.ambiguous_orders||!int(c.known_verified_release_cents,Number.MIN_SAFE_INTEGER)||!cent(c.total_release_cents)||c.verified_orders===0&&c.known_verified_release_cents!==0)return null;
  if(c.status==='MISSING'){
   if(['scan_id','from_at','end_before_at','cutoff_at','source_oldest_at','source_latest_at','total_release_cents'].some(key=>c[key]!==null)||['observations','unique_orders','ambiguous_orders','verified_orders','unverified_orders','known_verified_release_cents'].some(key=>c[key]!==0))return null;
  }else{
   if(!uuid(c.scan_id)||c.from_at!==from||!int(c.cutoff_at,from+1,Math.min(end,value.checked_at))||c.end_before_at!==c.cutoff_at||(c.source_oldest_at===null)!==(c.source_latest_at===null)||c.source_oldest_at!==null&&(!time(c.source_oldest_at)||!int(c.source_latest_at,c.source_oldest_at,value.checked_at))||c.observations>0&&c.source_oldest_at===null||c.status==='COMPLETE'&&c.source_oldest_at===null)return null;
   const completeMoney=c.status==='COMPLETE'&&c.ambiguous_orders===0&&c.verified_orders===c.unique_orders;
   if(completeMoney?c.total_release_cents!==c.known_verified_release_cents:c.total_release_cents!==null)return null;
  }
  if(!exact(w,['scan_id','status','cutoff_at','windows_total','windows_complete','pages_read','observations','next_attempt_at','diagnostic'])||!['MISSING','RUNNING','COMPLETE','LIMIT_REACHED','RETRY_WAIT','BLOCKED'].includes(w.status)||!int(w.windows_total,0,6)||!int(w.windows_complete,0,w.windows_total)||!int(w.pages_read,0,1200)||!int(w.observations,0,10000)||!int(w.next_attempt_at,0,9999999999)||w.diagnostic!==null&&!diagnostics.includes(w.diagnostic))return null;
  if(w.status==='MISSING'){
   if(w.scan_id!==null||w.cutoff_at!==null||w.diagnostic!==null||['windows_total','windows_complete','pages_read','observations','next_attempt_at'].some(key=>w[key]!==0)||c.status!=='MISSING')return null;
  }else{
   const windows=cutoff=>{const lastDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date((cutoff-1)*1000));return Math.ceil(((Date.parse(lastDay+'T00:00:00Z')-Date.parse(value.month+'-01T00:00:00Z'))/86400000+1)/7);};
   if(!uuid(w.scan_id)||!int(w.cutoff_at,from+1,Math.min(end,value.checked_at))||w.windows_total<1||w.windows_total!==windows(w.cutoff_at)||w.windows_complete>w.pages_read||w.status==='COMPLETE'&&(w.windows_complete!==w.windows_total||w.diagnostic!==null)||w.status!=='COMPLETE'&&w.windows_complete===w.windows_total||w.status==='RUNNING'&&w.diagnostic!==null||['RETRY_WAIT','BLOCKED','LIMIT_REACHED'].includes(w.status)&&w.diagnostic===null||w.status==='BLOCKED'&&w.diagnostic!=='PERMISSION_DENIED')return null;
   if(c.status==='MISSING'||w.cutoff_at<c.cutoff_at)return null;
   if(w.scan_id===c.scan_id){if(w.cutoff_at!==c.cutoff_at||w.observations!==c.observations||c.status==='COMPLETE'&&w.status!=='COMPLETE'||c.status==='RUNNING'&&!['RUNNING','RETRY_WAIT','BLOCKED'].includes(w.status)||c.status==='LIMIT_REACHED'&&w.status!=='LIMIT_REACHED')return null;}
   else if(c.status!=='COMPLETE'||w.status==='COMPLETE')return null;
  }
  const moneyKeys=['known_expected_located_cents','expected_located_cents','known_verified_release_cents','verified_release_cents','comparison_difference_cents'];
  if(!exact(m,['status','paid_orders','located_paid_orders','unlocated_paid_orders','ambiguous_paid_orders','verified_paid_orders',...moneyKeys,'outside_cohort_orders'])||!['AVAILABLE','SOURCE_MISSING'].includes(m.status)||!['located_paid_orders','ambiguous_paid_orders','verified_paid_orders'].every(key=>int(m[key],0,3000))||m.verified_paid_orders>m.located_paid_orders||m.located_paid_orders+m.ambiguous_paid_orders>c.unique_orders||m.ambiguous_paid_orders>c.ambiguous_orders||m.verified_paid_orders!==c.verified_orders||!moneyKeys.every(key=>cent(m[key]))||m.known_expected_located_cents===null||m.known_verified_release_cents===null||m.known_verified_release_cents!==c.known_verified_release_cents||m.located_paid_orders===0&&m.known_expected_located_cents!==0||m.verified_paid_orders===0&&m.known_verified_release_cents!==0)return null;
  if(m.status==='SOURCE_MISSING'){
   if(allSources||['paid_orders','unlocated_paid_orders','outside_cohort_orders','expected_located_cents','verified_release_cents','comparison_difference_cents'].some(key=>m[key]!==null))return null;
  }else{
   if(!allSources||!int(m.paid_orders,0,3000)||m.paid_orders!==paid||!int(m.unlocated_paid_orders,0,paid)||m.located_paid_orders+m.ambiguous_paid_orders+m.unlocated_paid_orders!==paid||!int(m.outside_cohort_orders,0,10000)||m.outside_cohort_orders!==c.unique_orders-m.located_paid_orders-m.ambiguous_paid_orders||m.expected_located_cents!==null&&m.expected_located_cents!==m.known_expected_located_cents||m.located_paid_orders===0&&m.expected_located_cents!==0)return null;
   const verified=c.status==='COMPLETE'&&m.verified_paid_orders===m.located_paid_orders;
   if(verified?m.verified_release_cents!==m.known_verified_release_cents:m.verified_release_cents!==null)return null;
   const comparable=m.verified_release_cents!==null&&m.expected_located_cents!==null;
   if(comparable){const difference=BigInt(m.verified_release_cents)-BigInt(m.expected_located_cents);if(difference<BigInt(Number.MIN_SAFE_INTEGER)||difference>BigInt(Number.MAX_SAFE_INTEGER)||BigInt(m.comparison_difference_cents??Number.MAX_SAFE_INTEGER)!==difference||m.comparison_difference_cents===null)return null;}
   else if(m.comparison_difference_cents!==null)return null;
   if(allExpected&&m.unlocated_paid_orders===0&&m.ambiguous_paid_orders===0&&(expected<BigInt(Number.MIN_SAFE_INTEGER)||expected>BigInt(Number.MAX_SAFE_INTEGER)||m.expected_located_cents===null||BigInt(m.expected_located_cents)!==expected))return null;
  }
  if(!array(p,pendingCodes.length)||new Set(p).size!==p.length||!p.every(code=>pendingCodes.includes(code))||!p.includes('BANK_RECEIPT_NOT_VERIFIED'))return null;
  const unavailable=w.diagnostic!==null&&w.diagnostic!=='LIMIT_REACHED';
  const required=[...(m.status==='SOURCE_MISSING'?['SOURCE_MISSING','MATCHING_INCOMPLETE']:[]),...(c.status!=='COMPLETE'?['RELEASES_COLLECTING']:[]),...(c.ambiguous_orders>0?['RELEASE_IDENTITY_AMBIGUOUS']:[]),...(c.unverified_orders>0?['RELEASE_AMOUNT_UNVERIFIED']:[]),...(unavailable?['RELEASE_SOURCE_UNAVAILABLE']:[]),...(m.status==='AVAILABLE'&&(m.unlocated_paid_orders>0||m.ambiguous_paid_orders>0||m.verified_paid_orders<m.located_paid_orders)?['MATCHING_INCOMPLETE']:[]),...(sources.some(row=>row.status==='AVAILABLE'&&row.expected_repass_cents===null)||m.status==='AVAILABLE'&&m.expected_located_cents===null?['FINANCIAL_EVIDENCE_MISSING']:[])];
  if(!required.every(code=>p.includes(code))||value.status==='CHECKED'&&(c.status!=='COMPLETE'||m.status!=='AVAILABLE'||c.unverified_orders>0||c.ambiguous_orders>0||p.some(code=>code!=='BANK_RECEIPT_NOT_VERIFIED'))||value.status==='BLOCKED'&&w.status!=='BLOCKED'||value.status==='LIMIT_REACHED'&&w.status!=='LIMIT_REACHED'&&c.status!=='LIMIT_REACHED'||value.status==='COLLECTING'&&!['MISSING','RUNNING'].includes(c.status))return null;
  return {schema:value.schema,month:value.month,checked_at:value.checked_at,status:value.status,sources,calendar:{...c},collection:{...w},matching:{...m},pending:[...p],basis:value.basis};
 }catch{return null;}
}

export function projectEscrowReleaseEvidenceFrame(value,projectLegacy){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const cent=item=>item===null||int(item,Number.MIN_SAFE_INTEGER);
 const hash=item=>typeof item==='string'&&/^[a-f0-9]{64}$/.test(item);
 const time=item=>item===null||int(item,1,9999999999);
 try{
  if(typeof projectLegacy!=='function'||!exact(value,['schema','report','orders'])||value.schema!=='finance_escrow_releases_v2')return null;
  const report=projectLegacy(value.report),o=value.orders;if(!report||!exact(o,['schema','summary','rows','truncation','basis'])||o.schema!=='finance_escrow_release_orders_v1'||o.basis!=='PAID_ORDER_COHORT_RELEASE_MATCHING_NOT_BANK_RECEIPT'||!array(o.rows,40))return null;
  const s=o.summary,t=o.truncation;
  const summaryKeys=['known_paid_orders','located_orders','ambiguous_orders','verified_orders','unverified_orders','not_located_orders','adjusted_orders','after_adjustment_known_orders','known_after_adjustment_cents','not_located_after_adjustment_known_orders','known_not_located_after_adjustment_cents'],countKeys=['known_paid_orders','located_orders','ambiguous_orders','verified_orders','unverified_orders','not_located_orders','adjusted_orders','after_adjustment_known_orders','not_located_after_adjustment_known_orders'];
  if(!exact(s,summaryKeys)||!countKeys.every(key=>int(s[key],0,100000))||!int(s.known_after_adjustment_cents,Number.MIN_SAFE_INTEGER)||!int(s.known_not_located_after_adjustment_cents,Number.MIN_SAFE_INTEGER))return null;
  if(s.located_orders+s.ambiguous_orders+s.not_located_orders!==s.known_paid_orders||s.verified_orders+s.unverified_orders!==s.located_orders||s.after_adjustment_known_orders>s.known_paid_orders||s.adjusted_orders>s.after_adjustment_known_orders||s.not_located_after_adjustment_known_orders>s.not_located_orders||s.after_adjustment_known_orders===0&&s.known_after_adjustment_cents!==0||s.not_located_after_adjustment_known_orders===0&&s.known_not_located_after_adjustment_cents!==0)return null;
  const matching=report.matching;if(matching.status==='AVAILABLE'&&(s.known_paid_orders!==matching.paid_orders||s.located_orders!==matching.located_paid_orders||s.ambiguous_orders!==matching.ambiguous_paid_orders||s.verified_orders!==matching.verified_paid_orders||s.unverified_orders!==matching.located_paid_orders-matching.verified_paid_orders||s.not_located_orders!==matching.unlocated_paid_orders))return null;
  if(!exact(t,['truncated','orders_total','orders_included'])||typeof t.truncated!=='boolean'||t.orders_total!==s.known_paid_orders||!int(t.orders_included,0,Math.min(40,t.orders_total))||t.orders_included!==o.rows.length||t.truncated!==(t.orders_included<t.orders_total))return null;
  const states=['NOT_LOCATED','AMBIGUOUS','LOCATED_UNVERIFIED','VERIFIED'],bases=['BASE_REPASS','AFTER_ADJUSTMENT'],seen=new Set(),visible={NOT_LOCATED:0,AMBIGUOUS:0,LOCATED_UNVERIFIED:0,VERIFIED:0};let visibleAdjusted=0,visibleAfterKnown=0,visibleAfter=0n,visibleNotLocatedKnown=0,visibleNotLocated=0n;
  for(const row of o.rows){
   const keys=['order_hash','state','reference_count','release_time','financial_checked_at','release_checked_at','base_repass_cents','adjustment_cents','after_adjustment_repass_cents','release_cents','comparison_basis','difference_from_base_cents'];
   if(!exact(row,keys)||!hash(row.order_hash)||seen.has(row.order_hash)||!states.includes(row.state)||!int(row.reference_count,0,100)||!time(row.release_time)||!int(row.financial_checked_at,1,report.checked_at)||!time(row.release_checked_at)||!cent(row.base_repass_cents)||!cent(row.adjustment_cents)||!cent(row.after_adjustment_repass_cents)||!cent(row.release_cents)||row.comparison_basis!==null&&!bases.includes(row.comparison_basis)||!cent(row.difference_from_base_cents))return null;
   seen.add(row.order_hash);visible[row.state]++;
   const adjusted=row.adjustment_cents!==null&&row.after_adjustment_repass_cents!==null;
   if(adjusted){if(row.base_repass_cents===null||BigInt(row.base_repass_cents)+BigInt(row.adjustment_cents)!==BigInt(row.after_adjustment_repass_cents))return null;visibleAfterKnown++;visibleAfter+=BigInt(row.after_adjustment_repass_cents);if(row.adjustment_cents!==0)visibleAdjusted++;}
   else if(row.adjustment_cents!==null||row.after_adjustment_repass_cents!==null)return null;
   if(row.state==='NOT_LOCATED'){
    if(row.reference_count!==0||row.release_time!==null||row.release_checked_at!==null||row.release_cents!==null||row.comparison_basis!==null||row.difference_from_base_cents!==null)return null;
    if(adjusted){visibleNotLocatedKnown++;visibleNotLocated+=BigInt(row.after_adjustment_repass_cents);}
   }else if(row.state==='AMBIGUOUS'){
    if(row.reference_count<2||row.release_time!==null||row.release_checked_at!==null||row.release_cents!==null||row.comparison_basis!==null||row.difference_from_base_cents!==null)return null;
   }else{
    if(row.reference_count!==1||row.release_time===null||row.release_checked_at===null)return null;
    if(row.state==='LOCATED_UNVERIFIED'){
     if(row.release_cents!==null||row.comparison_basis!==null||row.difference_from_base_cents!==null)return null;
    }else{
     if(row.release_cents===null||row.base_repass_cents===null||row.comparison_basis===null||row.difference_from_base_cents===null||BigInt(row.release_cents)-BigInt(row.base_repass_cents)!==BigInt(row.difference_from_base_cents))return null;
     if(row.comparison_basis==='BASE_REPASS'&&row.release_cents!==row.base_repass_cents||row.comparison_basis==='AFTER_ADJUSTMENT'&&(!adjusted||row.release_cents!==row.after_adjustment_repass_cents))return null;
    }
   }
  }
  if(!t.truncated){
   if(visible.NOT_LOCATED!==s.not_located_orders||visible.AMBIGUOUS!==s.ambiguous_orders||visible.VERIFIED!==s.verified_orders||visible.LOCATED_UNVERIFIED!==s.unverified_orders||visibleAdjusted!==s.adjusted_orders||visibleAfterKnown!==s.after_adjustment_known_orders||visibleAfter!==BigInt(s.known_after_adjustment_cents)||visibleNotLocatedKnown!==s.not_located_after_adjustment_known_orders||visibleNotLocated!==BigInt(s.known_not_located_after_adjustment_cents))return null;
  }else if(visible.NOT_LOCATED>s.not_located_orders||visible.AMBIGUOUS>s.ambiguous_orders||visible.VERIFIED>s.verified_orders||visible.LOCATED_UNVERIFIED>s.unverified_orders||visibleAdjusted>s.adjusted_orders||visibleAfterKnown>s.after_adjustment_known_orders||visibleAfter>BigInt(s.known_after_adjustment_cents)||visibleNotLocatedKnown>s.not_located_after_adjustment_known_orders||visibleNotLocated>BigInt(s.known_not_located_after_adjustment_cents))return null;
  const result={schema:'finance_escrow_releases_v2',report,orders:{schema:o.schema,summary:{...s},rows:o.rows.map(row=>({...row})),truncation:{...t},basis:o.basis}};
  return new TextEncoder().encode(JSON.stringify(result)).byteLength<=65536?result:null;
 }catch{return null;}
}

export function escrowReleaseRequestMatches(request,frame){
 const selection=projectEscrowReleaseRequest(request),legacy=projectEscrowReleaseFrame(frame),evidence=legacy?null:projectEscrowReleaseEvidenceFrame(frame,projectEscrowReleaseFrame),value=legacy??evidence?.report;
 const scopes=rows=>rows.map(({run_id,source_revision})=>run_id+':'+source_revision).sort();
 return selection!==null&&value!==null&&selection.month===value.month&&JSON.stringify(scopes(selection.sources))===JSON.stringify(scopes(value.sources));
}

export function projectEscrowReleaseCoverageRequest(value){
 try{
  const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
  const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
  const uuid=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
  const month=item=>typeof item==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(item)&&item>='2000-01';
  const index=item=>Number(item.slice(0,4))*12+Number(item.slice(5,7))-1;
  if(!exact(value,['operation','cohort_month','through_month','sources'])||value.operation!=='coverage'||!month(value.cohort_month)||!month(value.through_month)||value.cohort_month>value.through_month||index(value.through_month)-index(value.cohort_month)>5||!Array.isArray(value.sources)||Object.getPrototypeOf(value.sources)!==Array.prototype||value.sources.length>3||Reflect.ownKeys(value.sources).length!==value.sources.length+1)return null;
  const seen=new Set(),sources=[];
  for(let position=0;position<value.sources.length;position++){
   const descriptor=Object.getOwnPropertyDescriptor(value.sources,String(position));if(!descriptor||!Object.hasOwn(descriptor,'value'))return null;
   const row=descriptor.value;if(!exact(row,['run_id','source_revision'])||!uuid(row.run_id)||seen.has(row.run_id)||!Number.isSafeInteger(row.source_revision)||row.source_revision<1||row.source_revision>2147483647)return null;
   seen.add(row.run_id);sources.push({run_id:row.run_id,source_revision:row.source_revision});
  }
  return {operation:'coverage',cohort_month:value.cohort_month,through_month:value.through_month,sources};
 }catch{return null;}
}

export function projectEscrowReleaseCoverageFrame(value){
 const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
 const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
 const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
 const month=item=>typeof item==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(item)&&item>='2000-01';
 const monthIndex=item=>Number(item.slice(0,4))*12+Number(item.slice(5,7))-1;
 const nextMonth=item=>{const date=new Date(item+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);return date.toISOString().slice(0,7);};
 const uuid=item=>typeof item==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(item);
 const day=item=>typeof item==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item)&&Number.isFinite(Date.parse(item+'T00:00:00Z'))&&new Date(item+'T00:00:00Z').toISOString().slice(0,10)===item;
 const cents=item=>item===null||int(item,Number.MIN_SAFE_INTEGER);
 const time=item=>item===null||int(item,1,9999999999);
 const allowedPending=['SOURCE_MISSING','CALENDAR_MISSING','CALENDAR_PARTIAL','ORDER_NOT_LOCATED','RELEASE_IDENTITY_AMBIGUOUS','BANK_RECEIPT_NOT_VERIFIED','RELEASE_CYCLE_SEMANTICS_UNVERIFIED'];
 try{
  if(!exact(value,['schema','cohort_month','through_month','checked_at','status','sources','calendars','coverage','pending','basis'])||value.schema!=='finance_escrow_release_coverage_v1'||!month(value.cohort_month)||!month(value.through_month)||value.cohort_month>value.through_month||monthIndex(value.through_month)-monthIndex(value.cohort_month)>5||!int(value.checked_at,1,9999999999)||!['COLLECTING','PARTIAL','IDENTITY_COMPLETE'].includes(value.status)||value.basis!=='SAVED_RELEASE_CALENDARS_AGAINST_PAID_ORDER_COHORT_NOT_BANK_RECEIPT'||!array(value.sources,3))return null;
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000)).slice(0,7);if(value.through_month>today)return null;
  const sources=[],seen=new Set();let paid=0,allSources=value.sources.length>0;
  for(const item of value.sources){
   if(!exact(item,['run_id','source_revision','start_date','end_date','status','orders','paid_orders','finance_oldest_at','finance_latest_at','expected_repass_cents'])||!uuid(item.run_id)||seen.has(item.run_id)||!int(item.source_revision,1,2147483647)||!['AVAILABLE','MISSING'].includes(item.status))return null;seen.add(item.run_id);
   if(item.status==='MISSING'){
    if(['start_date','end_date','orders','paid_orders','finance_oldest_at','finance_latest_at','expected_repass_cents'].some(key=>item[key]!==null))return null;allSources=false;
   }else{
    if(!day(item.start_date)||!day(item.end_date)||item.start_date.slice(0,7)!==value.cohort_month||item.end_date.slice(0,7)!==value.cohort_month||item.end_date<item.start_date||(Date.parse(item.end_date)-Date.parse(item.start_date))/86400000>14||!int(item.orders,0,1000)||!int(item.paid_orders,0,item.orders)||!cents(item.expected_repass_cents)||!int(item.finance_oldest_at,1,value.checked_at)||!int(item.finance_latest_at,item.finance_oldest_at,value.checked_at))return null;
    paid+=item.paid_orders;
   }
   sources.push({...item});
  }
  const months=monthIndex(value.through_month)-monthIndex(value.cohort_month)+1;if(!array(value.calendars,6)||value.calendars.length!==months)return null;
  const calendars=[];let expected=value.cohort_month,completeCalendars=0,hasMissing=false,hasPartial=false;
  for(const item of value.calendars){
   if(!exact(item,['month','status','scan_id','cutoff_at','source_oldest_at','source_latest_at','observations','cohort_observations','unique_cohort_orders','ambiguous_cohort_orders'])||item.month!==expected||!['MISSING','PARTIAL','COMPLETE'].includes(item.status)||!int(item.observations,0,10000)||!int(item.cohort_observations,0,item.observations)||!int(item.unique_cohort_orders,0,item.cohort_observations)||!int(item.ambiguous_cohort_orders,0,item.unique_cohort_orders))return null;
   if(item.status==='MISSING'){
    if(item.scan_id!==null||item.cutoff_at!==null||item.source_oldest_at!==null||item.source_latest_at!==null||item.observations!==0||item.cohort_observations!==0||item.unique_cohort_orders!==0||item.ambiguous_cohort_orders!==0)return null;hasMissing=true;
   }else{
    if(!uuid(item.scan_id)||!int(item.cutoff_at,1,value.checked_at)||(item.source_oldest_at===null)!==(item.source_latest_at===null)||item.source_oldest_at!==null&&(!int(item.source_oldest_at,1,value.checked_at)||!int(item.source_latest_at,item.source_oldest_at,value.checked_at))||item.observations>0&&item.source_oldest_at===null)return null;
    if(item.status==='COMPLETE')completeCalendars++;else hasPartial=true;
   }
   calendars.push({...item});expected=nextMonth(expected);
  }
  const coverage=value.coverage;if(!exact(coverage,['paid_orders','located_orders','not_located_orders','ambiguous_orders','single_orders','calendars_total','calendars_complete','identity_complete_at_cutoff'])||coverage.paid_orders!==null&&!int(coverage.paid_orders,0,3000)||!int(coverage.located_orders,0,3000)||coverage.not_located_orders!==null&&!int(coverage.not_located_orders,0,3000)||!int(coverage.ambiguous_orders,0,coverage.located_orders)||!int(coverage.single_orders,0,coverage.located_orders)||coverage.single_orders+coverage.ambiguous_orders!==coverage.located_orders||coverage.calendars_total!==calendars.length||coverage.calendars_complete!==completeCalendars||typeof coverage.identity_complete_at_cutoff!=='boolean')return null;
  if(allSources){
   if(coverage.paid_orders!==paid||coverage.not_located_orders!==paid-coverage.located_orders||coverage.located_orders>paid)return null;
  }else if(coverage.paid_orders!==null||coverage.not_located_orders!==null)return null;
  const identity=allSources&&!hasMissing&&!hasPartial&&coverage.not_located_orders===0&&coverage.ambiguous_orders===0;
  if(coverage.identity_complete_at_cutoff!==identity)return null;
  if(!array(value.pending,allowedPending.length)||new Set(value.pending).size!==value.pending.length||!value.pending.every(code=>allowedPending.includes(code))||!value.pending.includes('BANK_RECEIPT_NOT_VERIFIED')||!value.pending.includes('RELEASE_CYCLE_SEMANTICS_UNVERIFIED'))return null;
  const required=[...(!allSources?['SOURCE_MISSING']:[]),...(hasMissing?['CALENDAR_MISSING']:[]),...(hasPartial?['CALENDAR_PARTIAL']:[]),...(allSources&&coverage.not_located_orders>0?['ORDER_NOT_LOCATED']:[]),...(coverage.ambiguous_orders>0?['RELEASE_IDENTITY_AMBIGUOUS']:[])];
  if(!required.every(code=>value.pending.includes(code)))return null;
  const status=!allSources||hasMissing||hasPartial?'COLLECTING':identity?'IDENTITY_COMPLETE':'PARTIAL';if(value.status!==status)return null;
  return {schema:value.schema,cohort_month:value.cohort_month,through_month:value.through_month,checked_at:value.checked_at,status,sources,calendars,coverage:{...coverage},pending:[...value.pending],basis:value.basis};
 }catch{return null;}
}

export function escrowReleaseCoverageRequestMatches(request,frame){
 const selection=projectEscrowReleaseCoverageRequest(request),value=projectEscrowReleaseCoverageFrame(frame);
 if(!selection||!value||selection.cohort_month!==value.cohort_month||selection.through_month!==value.through_month)return false;
 const scopes=rows=>rows.map(({run_id,source_revision})=>run_id+':'+source_revision).sort();
 return JSON.stringify(scopes(selection.sources))===JSON.stringify(scopes(value.sources));
}
