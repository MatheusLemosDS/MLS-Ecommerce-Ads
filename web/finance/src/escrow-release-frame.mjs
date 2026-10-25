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

export function escrowReleaseRequestMatches(request,frame){
 const selection=projectEscrowReleaseRequest(request),value=projectEscrowReleaseFrame(frame);
 const scopes=rows=>rows.map(({run_id,source_revision})=>run_id+':'+source_revision).sort();
 return selection!==null&&value!==null&&selection.month===value.month&&JSON.stringify(scopes(selection.sources))===JSON.stringify(scopes(value.sources));
}
