// Only an authenticated exact Finance retention 404 can queue a fresh cohort.
// Keep every prior active frame and parent CAS in the audit; a displayed App
// publication is never edited or discarded when its old source disappeared.
export const BUSINESS_MONTH_COHORT_SOURCE_RECOVERY_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_month_cohort_source_recoveries(month TEXT NOT NULL,parent_revision INTEGER NOT NULL,slot_index INTEGER NOT NULL CHECK(slot_index BETWEEN 0 AND 2),parent_payload TEXT NOT NULL CHECK(length(CAST(parent_payload AS BLOB))<=8192),source_run_id TEXT NOT NULL,source_revision INTEGER NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,original_frame TEXT NOT NULL CHECK(length(CAST(original_frame AS BLOB))<=1048576),reason TEXT NOT NULL CHECK(reason='FINANCE_BUSINESS_RETENTION_RUN_NOT_FOUND'),created_at INTEGER NOT NULL,replacement_parent_revision INTEGER,replaced_at INTEGER,CHECK((replacement_parent_revision IS NULL)=(replaced_at IS NULL)),PRIMARY KEY(month,parent_revision,slot_index))`,
];
const fail=()=>{throw Error('BUSINESS_MONTH_COHORT_SOURCE_RECOVERY_STORAGE_INVALID');};
export async function recordBusinessMonthCohortMissingSource(db,month,observed,stamp){
 const rows=observed?.payload?.slots?.map((slot,index)=>({slot,index})).filter(row=>row.slot.frame!==null);if(!rows?.length||rows.length>3||new TextEncoder().encode(observed.row.payload).byteLength>8192)fail();
 const writes=rows.map(({slot,index})=>{const raw=JSON.stringify(slot.frame);if(new TextEncoder().encode(raw).byteLength>1048576)fail();return db.prepare("INSERT OR IGNORE INTO business_month_cohort_source_recoveries(month,parent_revision,slot_index,parent_payload,source_run_id,source_revision,start_date,end_date,original_frame,reason,created_at) SELECT ?,?,?,?,?,?,?,?,?, 'FINANCE_BUSINESS_RETENTION_RUN_NOT_FOUND',? WHERE EXISTS(SELECT 1 FROM business_month_runs WHERE month=? AND revision=? AND payload=?)").bind(month,observed.row.revision,index,observed.row.payload,slot.frame.run_id,slot.frame.revision,slot.start_date,slot.end_date,raw,stamp,month,observed.row.revision,observed.row.payload);});
 await db.batch(writes);
}
export async function readBusinessMonthCohortRecovery(db,month,observed,stamp){
 if(!observed)return null;const result={results:observed.cohortRecoveryRows};
 if(!Array.isArray(result.results)||result.results.length>3)fail();if(!result.results.length)return null;
 const expected=observed.payload.slots.map((slot,index)=>({slot,index})).filter(row=>row.slot.frame!==null);
 if(result.results.length!==expected.length)fail();
 for(let index=0;index<expected.length;index++){const row=result.results[index],source=expected[index],slot=source.slot;if(row.month!==month||row.parent_revision!==observed.row.revision||row.slot_index!==source.index||row.parent_payload!==observed.row.payload||row.source_run_id!==slot.frame.run_id||row.source_revision!==slot.frame.revision||row.start_date!==slot.start_date||row.end_date!==slot.end_date||row.original_frame!==JSON.stringify(slot.frame)||row.reason!=='FINANCE_BUSINESS_RETENTION_RUN_NOT_FOUND'||!Number.isSafeInteger(row.created_at)||row.created_at<1||row.created_at>stamp+5||row.replacement_parent_revision!==null||row.replaced_at!==null)fail();}
 return {month,parent_revision:observed.row.revision,parent_payload:observed.row.payload,rows:result.results};
}
export function businessMonthCohortRecoveryFence(recovery){return recovery?{sql:" AND EXISTS(SELECT 1 FROM business_month_cohort_source_recoveries WHERE month=? AND parent_revision=? AND parent_payload=? AND reason='FINANCE_BUSINESS_RETENTION_RUN_NOT_FOUND' AND replacement_parent_revision IS NULL)",values:[recovery.month,recovery.parent_revision,recovery.parent_payload]}:{sql:'',values:[]};}
export function completeBusinessMonthCohortRecovery(db,recovery,resetPayload,stamp){return db.prepare('UPDATE business_month_cohort_source_recoveries SET replacement_parent_revision=?,replaced_at=? WHERE month=? AND parent_revision=? AND parent_payload=? AND replacement_parent_revision IS NULL AND EXISTS(SELECT 1 FROM business_month_runs WHERE month=? AND revision=? AND payload=?)').bind(recovery.parent_revision+1,stamp,recovery.month,recovery.parent_revision,recovery.parent_payload,recovery.month,recovery.parent_revision+1,resetPayload);}
