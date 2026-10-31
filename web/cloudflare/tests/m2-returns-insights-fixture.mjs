/** Explicit synthetic source evidence, shared by unit and compiled-browser QA. */
export function returnsInsightsFixture(){
 const month='2026-10',at=Date.UTC(2026,9,25,12)/1000,run='11111111-1111-4111-8111-111111111111';
 const hash=index=>index.toString(16).padStart(64,'a');
 const cases=['ACCEPTED','REFUND_PAID','CANCELLED'].map((status,index)=>({case_hash:hash(index+10),order_hash:hash(index+1),status,requested_refund_cents:(index+1)*1000,checked_at:at-150,diagnostic:null}));
 const frame={schema:'finance_reconciliation_v1',run_id:run,source_revision:2,start_date:month+'-01',end_date:month+'-15',checked_at:at-100,status:'CHECKED',source_checked_at:{finance_oldest_at:at-400,finance_latest_at:at-300,returns_oldest_at:at-150,returns_latest_at:at-150},coverage:{orders:3,evidence_orders:3,missing_evidence_orders:0,paid_orders:2,review_orders:1,return_orders:2,return_unknown_orders:0},adjustments:{reported_orders:2,missing_orders:0,conflicting_orders:0,known_adjustment_cents:200,base_repass_cents:16000,after_adjustment_repass_cents:16200},returns:{reference_count:3,checked_count:3,pending_count:0,known_requested_refund_cents:6000,requested_amount_complete:true,permission:'AVAILABLE'},cases,truncation:{truncated:false,cases_total:3,cases_included:3},pending:['RETURN_VALUES_UNVERIFIED','SETTLEMENT_NOT_RECONCILED'],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};
 const source={run_id:run,source_revision:2,start_date:frame.start_date,end_date:frame.end_date};
 const scope={publication_revision:7,start_date:frame.start_date,end_date:frame.end_date,sources:[source]};
 const report={schema:'business_reconciliation_v1',month,start_date:frame.start_date,end_date:frame.end_date,checked_at:at,status:'CHECKED',source_revision:7,sources:[source],reports:[frame],attempts:[{run_id:run,source_revision:2,checked_at:at,status:'SUCCESS',code:null,next_attempt_at:at+600}],pending:[]};
 const review={schema:'finance_review_orders_v1',summary:{orders:1,in_cancel:0,to_return:1,other:0,unknown:0},orders:[{order_hash:cases[2].order_hash,status:'TO_RETURN',source_checked_at:at-300,reference_state:'AVAILABLE',reference_count:1,references_checked_at:at-200,reference_diagnostic:null,next_attempt_at:null,checked_cases:1,pending_cases:0}],truncation:{truncated:false,orders_total:1,orders_included:1},basis:'REVIEW_ORDERS_OUTSIDE_PAID_COHORT'};
 const statuses=['PENDING','UNKNOWN','REQUESTED','ACCEPTED','CANCELLED','JUDGING','REFUND_PAID','CLOSED','PROCESSING'];
 const groups=['PAID','REVIEW','OTHER'].map(cohort=>{
  const members=cohort==='PAID'?cases.slice(0,2):cohort==='REVIEW'?cases.slice(2):[];
  return {cohort,statuses:statuses.map(status=>{const rows=members.filter(row=>row.status===status);return {status,cases:rows.length,amount_known:rows.length,known_amount_cents:rows.reduce((total,row)=>total+row.requested_refund_cents,0)};}),source_checked_at:{oldest_at:members.length?at-150:null,latest_at:members.length?at-150:null}};
 });
 const payouts=cases.map((row,index)=>({order_hash:row.order_hash,cohort:index<2?'PAID':'REVIEW',source_checked_at:at-300,reference_count:1,state:index<2?'AVAILABLE':'NOT_IN_PAID_COHORT',base_repass_cents:index<2?8000:null,adjustment_cents:index<2?100:null,after_adjustment_repass_cents:index<2?8100:null}));
 const money={schema:'finance_reconciliation_money_v1',currency:'BRL',groups,payouts,truncation:{truncated:false,payouts_total:3,payouts_included:3},basis:'SAVED_RETURN_AMOUNTS_AND_PAID_PAYOUT_AFTER_ADJUSTMENTS'};
 const reviews=[{run_id:run,source_revision:2,review}],amounts=[{run_id:run,source_revision:2,money}];
 const snapshot={schema:'mls_reconciliation_snapshot_v1',month,scope_key:JSON.stringify(scope),report,reviews,money:amounts};
 return {month,scope,snapshot,envelope:{schema:'business_reconciliation_v3',report,reviews,money:amounts}};
}
