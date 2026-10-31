/** Cross-source observation over saved owner snapshots. No IO, no settlement
 * inference and no changes to the immutable paid cohort or financial result.
 * Keep all dependencies local: this function is embedded in the owner page.
 */
export function projectMlsSettlementEvidence({month=null,reconciliation=null,releases=null}={}){
 const expectedScope=month?.audit_scope;month=typeof month==='string'?month:month?.month;
 const result={schema:'mls_settlement_evidence_v1',evidence_state:'NOT_LOADED',reason:'SOURCES_NOT_LOADED',compared_orders:0,compatible_orders:0,conflicts:0,duplicate_conflicts:0,missing_value_orders:0,truncated:false,basis:'SAVED_SAME_PUBLICATION_PAYOUT_COMPARISON_NOT_BANK_RECEIPT'};
 const finish=(state,reason)=>Object.freeze({...result,...(['NOT_LOADED','WAITING_SCOPE'].includes(state)?{compared_orders:0,compatible_orders:0,conflicts:0,duplicate_conflicts:0,missing_value_orders:0}:{}),evidence_state:state,reason});
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
 const safe=value=>Number.isSafeInteger(value)&&!Object.is(value,-0);
 const revision=value=>safe(value)&&value>0&&value<=2147483647;
 const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
 const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
 const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 const sourceKeys=['run_id','source_revision','start_date','end_date'];
 const sourceMatches=(row,source)=>plain(row)&&sourceKeys.every(key=>row[key]===source[key]);
 function scope(key){
  if(typeof key!=='string'||key.length<2||key.length>4096)return null;
  let value;try{value=JSON.parse(key);}catch{return null;}
  if(!exact(value,['publication_revision','start_date','end_date','sources'])||!revision(value.publication_revision)||!day(value.start_date)||!day(value.end_date)||value.start_date.slice(0,7)!==month||value.start_date!==month+'-01'||value.end_date.slice(0,7)!==month||value.end_date<value.start_date||!Array.isArray(value.sources)||value.sources.length!==Math.ceil(Number(value.end_date.slice(8))/15))return null;
  const sources=[],seen=new Set();
  for(let index=0;index<value.sources.length;index++){
   const row=value.sources[index],start=month+'-'+String(index*15+1).padStart(2,'0'),end=month+'-'+String(Math.min(index*15+15,Number(value.end_date.slice(8)))).padStart(2,'0');
   if(!exact(row,sourceKeys)||!uuid(row.run_id)||seen.has(row.run_id)||!revision(row.source_revision)||row.start_date!==start||row.end_date!==end)return null;
   sources.push({run_id:row.run_id,source_revision:row.source_revision,start_date:row.start_date,end_date:row.end_date});seen.add(row.run_id);
  }
  const projected={publication_revision:value.publication_revision,start_date:value.start_date,end_date:value.end_date,sources};
  return JSON.stringify(projected)===key?projected:null;
 }
 try{
  if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||reconciliation?.schema!=='mls_reconciliation_snapshot_v1'||releases?.schema!=='mls_escrow_releases_snapshot_v1')return finish('NOT_LOADED','SOURCES_NOT_LOADED');
  if(reconciliation.month!==month||releases.month!==month)return finish('WAITING_SCOPE','MONTH_MISMATCH');
  const left=scope(reconciliation.scope_key),right=scope(releases.scope_key),expected=scope(JSON.stringify(expectedScope)??'');
  if(!left||!right||!expected||reconciliation.scope_key!==releases.scope_key||reconciliation.scope_key!==JSON.stringify(expected))return finish('WAITING_SCOPE','PUBLICATION_MISMATCH');
  const returnsReport=reconciliation.report,releaseReport=releases.report,cohort=releaseReport?.cohort,calendar=releaseReport?.report;
  if(!plain(returnsReport)||!plain(releaseReport)||!plain(cohort)||!plain(calendar))return finish('WAITING_EVIDENCE','REPORTS_NOT_LOADED');
  if(returnsReport.month!==month||releaseReport.month!==month||calendar.month!==month||returnsReport.source_revision!==left.publication_revision||cohort.publication_revision!==left.publication_revision||returnsReport.start_date!==left.start_date||returnsReport.end_date!==left.end_date||cohort.start_date!==left.start_date||cohort.end_date!==left.end_date)return finish('WAITING_SCOPE','REPORT_PUBLICATION_MISMATCH');
  const sourceGroups=[returnsReport.sources,cohort.sources,calendar.sources];
  if(sourceGroups.some(rows=>!Array.isArray(rows)||rows.length!==left.sources.length))return finish('WAITING_SCOPE','REPORT_SOURCES_MISMATCH');
  for(const rows of sourceGroups)for(let index=0;index<left.sources.length;index++)if(!sourceMatches(rows[index],left.sources[index]))return finish('WAITING_SCOPE','REPORT_SOURCES_MISMATCH');
  if(!Array.isArray(returnsReport.reports)||returnsReport.reports.length!==left.sources.length)return finish('WAITING_EVIDENCE','REPORTS_INCOMPLETE');
  const reports=new Map();
  for(const row of returnsReport.reports){if(!plain(row)||reports.has(row.run_id))return finish('WAITING_SCOPE','REPORT_SOURCES_MISMATCH');reports.set(row.run_id,row);}
  for(let index=0;index<left.sources.length;index++){
   const source=left.sources[index],audit=reports.get(source.run_id),published=cohort.sources[index],observed=calendar.sources[index];
   if(!sourceMatches(audit,source))return finish('WAITING_SCOPE','REPORT_SOURCES_MISMATCH');
   if(observed.status!=='AVAILABLE')return finish('WAITING_EVIDENCE','RELEASE_SOURCE_MISSING');
   const oldest=published.finance_oldest_at,latest=published.finance_latest_at;
   if((oldest===null)!==(latest===null)||oldest!==null&&(!safe(oldest)||oldest<1||!safe(latest)||latest<oldest)||!safe(published.orders)||published.orders<0||!safe(published.paid_orders)||published.paid_orders<0||published.paid_orders>published.orders||published.orders>0&&oldest===null)return finish('WAITING_SCOPE','FINANCIAL_CUTOFF_MISMATCH');
   if(audit.source_checked_at?.finance_oldest_at!==oldest||audit.source_checked_at?.finance_latest_at!==latest||observed.finance_oldest_at!==oldest||observed.finance_latest_at!==latest||audit.coverage?.orders!==published.orders||audit.coverage?.paid_orders!==published.paid_orders||observed.orders!==published.orders||observed.paid_orders!==published.paid_orders)return finish('WAITING_SCOPE','FINANCIAL_CUTOFF_MISMATCH');
  }
  const releaseRows=releases.orders?.rows,money=reconciliation.money;
  if(!Array.isArray(releaseRows)||releaseRows.length>40||!Array.isArray(money)||money.length>3)return finish('WAITING_EVIDENCE','MONEY_NOT_LOADED');
  const releaseIndex=new Map(),payoutIndex=new Map(),ambiguous=new Set(),contradictory=new Set();let observationMismatch=false;
  const tuple=row=>JSON.stringify([row.cohort??'PAID',row.base_repass_cents,row.adjustment_cents,row.after_adjustment_repass_cents,row.source_checked_at??row.financial_checked_at]);
  function index(target,row){
   if(!plain(row)||!hash(row.order_hash))return false;
   const old=target.get(row.order_hash);
   if(!old){target.set(row.order_hash,row);return true;}
   if((old.source_checked_at??old.financial_checked_at)!==(row.source_checked_at??row.financial_checked_at))observationMismatch=true;
   if(tuple(old)===tuple(row))return true;
   ambiguous.add(row.order_hash);
   if((old.cohort??'PAID')!==(row.cohort??'PAID')||['base_repass_cents','adjustment_cents','after_adjustment_repass_cents'].some(key=>safe(old[key])&&safe(row[key])&&old[key]!==row[key]))contradictory.add(row.order_hash);
   return true;
  }
  for(const row of releaseRows)if(!index(releaseIndex,row))return finish('WAITING_EVIDENCE','MONEY_INVALID');
  const seenSources=new Set();
  for(const group of money){
   const audit=reports.get(group?.run_id);
   if(!audit||seenSources.has(group.run_id)||group.source_revision!==audit.source_revision||!Array.isArray(group.money?.payouts)||group.money.payouts.length>40)return finish('WAITING_SCOPE','MONEY_SOURCES_MISMATCH');
   seenSources.add(group.run_id);
   result.truncated ||= group.money.truncation?.truncated!==false;
   for(const row of group.money.payouts){
    if(!index(payoutIndex,row))return finish('WAITING_EVIDENCE','MONEY_INVALID');
    if(!safe(row.source_checked_at)||row.source_checked_at<(audit.source_checked_at.finance_oldest_at??Infinity)||row.source_checked_at>(audit.source_checked_at.finance_latest_at??-Infinity))return finish('WAITING_SCOPE','FINANCIAL_CUTOFF_MISMATCH');
   }
  }
  if(observationMismatch)return finish('WAITING_SCOPE','ORDER_OBSERVATION_MISMATCH');
  result.truncated ||= releases.orders?.truncation?.truncated!==false||money.length!==left.sources.length;
  const conflictOrders=new Set(contradictory);
  for(const [orderHash,row] of releaseIndex){
   if(ambiguous.has(orderHash))continue;
   const payout=payoutIndex.get(orderHash);if(!payout)continue;
   if(payout.cohort!=='PAID'||payout.state!=='AVAILABLE'){result.missing_value_orders++;continue;}
   if(row.financial_checked_at!==payout.source_checked_at)return finish('WAITING_SCOPE','ORDER_OBSERVATION_MISMATCH');
   const a=row.after_adjustment_repass_cents,b=payout.after_adjustment_repass_cents;
   if(!safe(a)||!safe(b)){result.missing_value_orders++;continue;}
   for(const entry of [row,payout])if(!safe(entry.base_repass_cents)||!safe(entry.adjustment_cents)||BigInt(entry.base_repass_cents)+BigInt(entry.adjustment_cents)!==BigInt(entry.after_adjustment_repass_cents))return finish('WAITING_EVIDENCE','MONEY_INVALID');
   result.compared_orders++;
   if(a!==b||row.base_repass_cents!==payout.base_repass_cents||row.adjustment_cents!==payout.adjustment_cents)conflictOrders.add(orderHash);else result.compatible_orders++;
  }
  result.conflicts=conflictOrders.size;result.duplicate_conflicts=contradictory.size;
  if(result.conflicts)return finish('CONFLICT',result.duplicate_conflicts?'DUPLICATE_EVIDENCE_CONFLICT':'PAYOUT_VALUES_DIFFER');
  if(ambiguous.size)return finish('WAITING_EVIDENCE','DUPLICATE_EVIDENCE_INCOMPLETE');
  if(!result.compared_orders)return finish('WAITING_EVIDENCE','NO_COMPARABLE_ORDERS');
  return finish(result.truncated||result.missing_value_orders?'PARTIAL':'OBSERVED_COMPATIBLE',null);
 }catch{return finish('WAITING_EVIDENCE','EVIDENCE_INVALID');}
}
