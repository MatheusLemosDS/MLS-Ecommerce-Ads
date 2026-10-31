/** Aggregate-only presentation of already validated, published return evidence.
 * No IO, order identifiers, write authority, inferred causes or bank settlement.
 */
export function createMlsReturnsInsights(){
 const statuses=['PENDING','UNKNOWN','REQUESTED','ACCEPTED','CANCELLED','JUDGING','REFUND_PAID','CLOSED','PROCESSING'];
 const cohorts=['PAID','REVIEW','OTHER'];
 const basis='SAVED_IDENTIFIED_RETURN_CASES_NOT_ORDERS_SETTLEMENT_OR_PROFIT';
 const safe=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
 const array=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
 const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
 const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
 const numeric=value=>{if(value<0n||value>BigInt(Number.MAX_SAFE_INTEGER))throw 'ARITHMETIC_UNSAFE';return Number(value);};
 function scope(value,month){
  if(!exact(value,['publication_revision','start_date','end_date','sources'])||!safe(value.publication_revision,1,2147483647)||!day(value.start_date)||!day(value.end_date)||value.start_date!==month+'-01'||value.end_date.slice(0,7)!==month||value.end_date<value.start_date||!array(value.sources,3)||value.sources.length!==Math.ceil(Number(value.end_date.slice(8))/15))return null;
  const seen=new Set(),sources=[];
  for(const [index,row] of value.sources.entries()){
   if(!exact(row,['run_id','source_revision','start_date','end_date'])||!uuid(row.run_id)||seen.has(row.run_id)||!safe(row.source_revision,1,2147483647)||row.start_date!==month+'-'+String(index*15+1).padStart(2,'0')||row.end_date!==month+'-'+String(Math.min(index*15+15,Number(value.end_date.slice(8)))).padStart(2,'0'))return null;
   seen.add(row.run_id);sources.push({run_id:row.run_id,source_revision:row.source_revision,start_date:row.start_date,end_date:row.end_date});
  }
  return {publication_revision:value.publication_revision,start_date:value.start_date,end_date:value.end_date,sources};
 }
 function projectMlsReturnsInsights(snapshot,{expectedMonth=null,expectedScope=null}={}){
  const validMonth=typeof expectedMonth==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(expectedMonth)&&expectedMonth>='2000-01';
  const empty={schema:'mls_returns_insights_v1',state:'UNAVAILABLE',reason:null,month:validMonth?expectedMonth:null,period:null,states:[],cohorts:[],coverage:{sources_total:null,sources_available:null,aggregate_complete:false,identified_cases:null,checked_cases:null,pending_cases:null,amount_known:null,amount_missing:null,known_amount_cents:null,missing_reference_sources:null,case_list_truncated:null,payout_list_truncated:null},source_checked_at:{finance_oldest_at:null,finance_latest_at:null,returns_oldest_at:null,returns_latest_at:null},basis};
  const unavailable=reason=>freeze({...empty,reason});
  try{
   const expected=validMonth?scope(expectedScope,expectedMonth):null;
   if(!expected)return unavailable('PUBLICATION_SCOPE_REQUIRED');
   if(!snapshot)return unavailable('SAVED_EVIDENCE_NOT_LOADED');
   if(!exact(snapshot,['schema','month','scope_key','report','reviews','money'])||snapshot.schema!=='mls_reconciliation_snapshot_v1'||snapshot.month!==expectedMonth||typeof snapshot.scope_key!=='string'||snapshot.scope_key.length>2048)return unavailable('SCOPE_MISMATCH');
   const received=scope(JSON.parse(snapshot.scope_key),expectedMonth);
   if(!received||snapshot.scope_key!==JSON.stringify(received)||JSON.stringify(received)!==JSON.stringify(expected))return unavailable('SCOPE_MISMATCH');
   const report=snapshot.report;
   if(!plain(report)||report.schema!=='business_reconciliation_v1'||report.month!==expectedMonth||report.source_revision!==expected.publication_revision||report.start_date!==expected.start_date||report.end_date!==expected.end_date||!safe(report.checked_at,1)||!array(report.sources,3)||report.sources.length!==expected.sources.length||!report.sources.every((row,index)=>exact(row,['run_id','source_revision','start_date','end_date'])&&['run_id','source_revision','start_date','end_date'].every(key=>row[key]===expected.sources[index][key]))||!array(report.reports,3)||!array(snapshot.reviews,3)||!array(snapshot.money,3))return unavailable('SCOPE_MISMATCH');
   const expectedById=new Map(expected.sources.map(row=>[row.run_id,row])),reports=new Map(),reviews=new Map(),money=new Map();
   for(const row of report.reports){
    const source=plain(row)?expectedById.get(row.run_id):null;
    if(!source||reports.has(row.run_id)||row.schema!=='finance_reconciliation_v1'||row.source_revision!==source.source_revision||row.start_date!==source.start_date||row.end_date!==source.end_date||!safe(row.checked_at,1,report.checked_at))return unavailable('INVALID_EVIDENCE');
    reports.set(row.run_id,row);
   }
   for(const row of snapshot.reviews){
    const source=plain(row)?reports.get(row.run_id):null;
    if(!source||!exact(row,['run_id','source_revision','review'])||row.source_revision!==source.source_revision||reviews.has(row.run_id)||row.review?.schema!=='finance_review_orders_v1'||row.review?.summary?.orders!==source.coverage?.review_orders)return unavailable('INVALID_EVIDENCE');
    reviews.set(row.run_id,row.review);
   }
   for(const row of snapshot.money){
    const source=plain(row)?reports.get(row.run_id):null;
    if(!source||!exact(row,['run_id','source_revision','money'])||row.source_revision!==source.source_revision||!reviews.has(row.run_id)||money.has(row.run_id))return unavailable('INVALID_EVIDENCE');
    money.set(row.run_id,row.money);
   }
   if(!money.size)return unavailable('STATUS_TOTALS_UNAVAILABLE');
   const states=statuses.map(status=>({status,cases:0n,amount_known:0n,known_amount_cents:0n}));
   const groups=cohorts.map(cohort=>({cohort,cases:0n,amount_known:0n,known_amount_cents:0n}));
   const coverage={sources_total:expected.sources.length,sources_available:money.size,aggregate_complete:false,identified_cases:0n,checked_cases:0n,pending_cases:0n,amount_known:0n,amount_missing:0,known_amount_cents:0n,missing_reference_sources:0,case_list_truncated:false,payout_list_truncated:false};
   const times={finance_oldest_at:[],finance_latest_at:[],returns_oldest_at:[],returns_latest_at:[]};
   let sourcePartial=false;
   for(const [id,details] of money){
    const frame=reports.get(id),returns=frame.returns,source=frame.source_checked_at;
    if(!exact(details,['schema','currency','groups','payouts','truncation','basis'])||details.schema!=='finance_reconciliation_money_v1'||details.currency!=='BRL'||details.basis!=='SAVED_RETURN_AMOUNTS_AND_PAID_PAYOUT_AFTER_ADJUSTMENTS'||!array(details.groups,3)||details.groups.length!==3||!array(details.payouts,40)||!plain(returns)||!plain(frame.coverage)||!array(frame.pending,30)||!plain(source))return unavailable('INVALID_EVIDENCE');
    for(const prefix of ['finance','returns']){
     const oldest=source[prefix+'_oldest_at'],latest=source[prefix+'_latest_at'];
     if(oldest!==null||latest!==null){if(!safe(oldest,1,frame.checked_at)||!safe(latest,oldest,frame.checked_at))return unavailable('INVALID_EVIDENCE');times[prefix+'_oldest_at'].push(oldest);times[prefix+'_latest_at'].push(latest);}
    }
    const limits=[frame.coverage.paid_orders,frame.coverage.review_orders,frame.coverage.orders-frame.coverage.paid_orders-frame.coverage.review_orders];
    if(limits.some(value=>!safe(value)))return unavailable('INVALID_EVIDENCE');
    let caseCount=0n,checkedCount=0n,amountCount=0n,amount=0n;
    for(let cohortIndex=0;cohortIndex<3;cohortIndex++){
     const group=details.groups[cohortIndex];
     if(!exact(group,['cohort','statuses','source_checked_at'])||group.cohort!==cohorts[cohortIndex]||!array(group.statuses,9)||group.statuses.length!==9||!exact(group.source_checked_at,['oldest_at','latest_at']))return unavailable('INVALID_EVIDENCE');
     let groupCases=0n,groupChecked=0n;
     for(let index=0;index<9;index++){
      const row=group.statuses[index];
      if(!exact(row,['status','cases','amount_known','known_amount_cents'])||row.status!==statuses[index]||!safe(row.cases,0,100000)||!safe(row.amount_known,0,row.cases)||!safe(row.known_amount_cents)||row.amount_known===0&&row.known_amount_cents!==0||row.status==='PENDING'&&row.amount_known!==0)return unavailable('INVALID_EVIDENCE');
      const count=BigInt(row.cases),known=BigInt(row.amount_known),cents=BigInt(row.known_amount_cents);
      groupCases+=count;caseCount+=count;amountCount+=known;amount+=cents;
      if(row.status!=='PENDING'){groupChecked+=count;checkedCount+=count;}
      for(const field of ['cases','amount_known','known_amount_cents']){const value=BigInt(row[field]);states[index][field]+=value;groups[cohortIndex][field]+=value;numeric(states[index][field]);numeric(groups[cohortIndex][field]);}
     }
     if(limits[cohortIndex]===0&&groupCases!==0n)return unavailable('INVALID_EVIDENCE');
     const observed=group.source_checked_at;
     if(groupChecked===0n){if(observed.oldest_at!==null||observed.latest_at!==null)return unavailable('INVALID_EVIDENCE');}
     else if(!safe(observed.oldest_at,source.returns_oldest_at??1,source.returns_latest_at??0)||!safe(observed.latest_at,observed.oldest_at,source.returns_latest_at??0))return unavailable('INVALID_EVIDENCE');
    }
    if(!safe(returns.reference_count)||!safe(returns.checked_count)||!safe(returns.pending_count)||!safe(returns.known_requested_refund_cents)||caseCount!==BigInt(returns.reference_count)||checkedCount!==BigInt(returns.checked_count)||caseCount-checkedCount!==BigInt(returns.pending_count)||amount!==BigInt(returns.known_requested_refund_cents)||returns.requested_amount_complete!==(amountCount===caseCount))return unavailable('INVALID_EVIDENCE');
    const cases=frame.truncation,payouts=details.truncation;
    if(!exact(cases,['truncated','cases_total','cases_included'])||!array(frame.cases,40)||cases.cases_total!==returns.reference_count||cases.cases_included!==frame.cases.length||!safe(cases.cases_total,cases.cases_included)||cases.truncated!==(cases.cases_included<cases.cases_total)||!exact(payouts,['truncated','payouts_total','payouts_included'])||payouts.payouts_included!==details.payouts.length||!safe(payouts.payouts_total,payouts.payouts_included)||payouts.truncated!==(payouts.payouts_included<payouts.payouts_total))return unavailable('INVALID_EVIDENCE');
    coverage.identified_cases+=caseCount;coverage.checked_cases+=checkedCount;coverage.pending_cases+=caseCount-checkedCount;coverage.amount_known+=amountCount;coverage.known_amount_cents+=amount;
    for(const field of ['identified_cases','checked_cases','pending_cases','amount_known','known_amount_cents'])numeric(coverage[field]);
    if(frame.pending.includes('RETURN_REFERENCES_MISSING'))coverage.missing_reference_sources++;
    coverage.case_list_truncated||=cases.truncated;coverage.payout_list_truncated||=payouts.truncated;
    sourcePartial||=frame.status!=='CHECKED';
   }
   for(const field of ['identified_cases','checked_cases','pending_cases','amount_known','known_amount_cents'])coverage[field]=numeric(coverage[field]);
   coverage.amount_missing=coverage.identified_cases-coverage.amount_known;
   coverage.aggregate_complete=coverage.sources_available===coverage.sources_total;
   const partial=!coverage.aggregate_complete||coverage.missing_reference_sources>0||sourcePartial||coverage.pending_cases>0||coverage.amount_missing>0||states[1].cases>0n;
   const checked=Object.fromEntries(Object.entries(times).map(([key,values])=>[key,values.length?(key.endsWith('oldest_at')?Math.min(...values):Math.max(...values)):null]));
   return freeze({schema:empty.schema,state:partial?'PARTIAL':'READY',reason:null,month:expectedMonth,period:{start_date:expected.start_date,end_date:expected.end_date,publication_revision:expected.publication_revision},states:states.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='bigint'?numeric(value):value]))),cohorts:groups.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='bigint'?numeric(value):value]))),coverage,source_checked_at:checked,basis});
  }catch(error){return unavailable(error==='ARITHMETIC_UNSAFE'?'ARITHMETIC_UNSAFE':'INVALID_EVIDENCE');}
 }
 return Object.freeze({projectMlsReturnsInsights});
}
export const {projectMlsReturnsInsights}=createMlsReturnsInsights();
