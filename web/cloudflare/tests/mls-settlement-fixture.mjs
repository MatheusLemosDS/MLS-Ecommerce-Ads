export function settlementFixture(){
 const run_id='11111111-1111-4111-8111-111111111111',source_revision=2,checked=1793070000;
 const source={run_id,source_revision,start_date:'2026-10-01',end_date:'2026-10-15'};
 const audit_scope={publication_revision:4,start_date:source.start_date,end_date:source.end_date,sources:[source]};
 const cohortSource={...source,finance_oldest_at:checked-10,finance_latest_at:checked-10,orders:1,paid_orders:1,expected_repass_cents:8000};
 const order={order_hash:'a'.repeat(64),base_repass_cents:8000,adjustment_cents:0,after_adjustment_repass_cents:8000};
 const reconciliation={schema:'mls_reconciliation_snapshot_v1',month:'2026-10',scope_key:JSON.stringify(audit_scope),report:{month:'2026-10',start_date:source.start_date,end_date:source.end_date,source_revision:audit_scope.publication_revision,sources:[{...source}],reports:[{...source,source_checked_at:{finance_oldest_at:checked-10,finance_latest_at:checked-10},coverage:{orders:1,paid_orders:1}}]},reviews:[],money:[{run_id,source_revision,money:{payouts:[{...order,cohort:'PAID',state:'AVAILABLE',source_checked_at:checked-10,reference_count:1}],truncation:{truncated:false,payouts_total:1,payouts_included:1}}}]};
 const releases={schema:'mls_escrow_releases_snapshot_v1',month:'2026-10',scope_key:JSON.stringify(audit_scope),report:{month:'2026-10',cohort:{publication_revision:audit_scope.publication_revision,start_date:source.start_date,end_date:source.end_date,sources:[{...cohortSource}]},report:{month:'2026-10',sources:[{...cohortSource,status:'AVAILABLE'}],pending:['BANK_RECEIPT_NOT_VERIFIED']}},orders:{summary:{known_paid_orders:1,verified_orders:1,not_located_orders:0,unverified_orders:0,ambiguous_orders:0},rows:[{...order,state:'VERIFIED',financial_checked_at:checked-10}],truncation:{truncated:false,orders_total:1,orders_included:1}}};
 return {month:{month:'2026-10',audit_scope},reconciliation,releases};
}
