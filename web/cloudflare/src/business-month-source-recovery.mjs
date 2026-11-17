// A missing private source is a transport fact, not permission to erase a
// month. Preserve the old frame and use the same parent CAS for its successor.
export const BUSINESS_MONTH_SOURCE_RECOVERY_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_month_source_recoveries(month TEXT NOT NULL,slot_index INTEGER NOT NULL CHECK(slot_index BETWEEN 0 AND 2),source_run_id TEXT NOT NULL,source_revision INTEGER NOT NULL,parent_revision INTEGER NOT NULL,parent_payload TEXT NOT NULL CHECK(length(CAST(parent_payload AS BLOB))<=8192),start_date TEXT NOT NULL,end_date TEXT NOT NULL,original_frame TEXT NOT NULL CHECK(length(CAST(original_frame AS BLOB))<=1048576),created_at INTEGER NOT NULL,replacement_run_id TEXT,replaced_at INTEGER,CHECK((replacement_run_id IS NULL)=(replaced_at IS NULL)),PRIMARY KEY(month,slot_index,source_run_id,parent_revision))`,
];
const recoveryFailure=()=>{throw Error('BUSINESS_MONTH_SOURCE_RECOVERY_STORAGE_INVALID');};
const recoveryKeys=['month','slot_index','source_run_id','source_revision','parent_revision','parent_payload','start_date','end_date','original_frame','created_at','replacement_run_id','replaced_at'];
export async function readBusinessMonthSourceRecovery(db,month,index,slot,observed,stamp){
 if(slot.frame?.status!=='RUNNING')return null;
 if(!Array.isArray(observed.recoveryRows)||observed.recoveryRows.length>3)recoveryFailure();
 const selected=observed.recoveryRows.filter(row=>row.month===month&&row.slot_index===index&&row.source_run_id===slot.frame.run_id&&row.parent_revision===observed.row.revision);
 if(selected.length>1)recoveryFailure();const row=selected[0];
 if(!row)return null;
 if(Object.keys(row).length!==recoveryKeys.length||recoveryKeys.some(key=>!Object.hasOwn(row,key))||row.source_revision!==slot.frame.revision||row.parent_payload!==observed.row.payload||row.start_date!==slot.start_date||row.end_date!==slot.end_date||row.original_frame!==JSON.stringify(slot.frame)||!Number.isSafeInteger(row.created_at)||row.created_at<1||row.created_at>stamp+5||row.replacement_run_id!==null||row.replaced_at!==null)recoveryFailure();
 return row;
}
export async function recordBusinessMonthMissingSource(db,month,index,slot,observed,stamp){
 if(slot.frame?.status!=='RUNNING')recoveryFailure();
 const raw=JSON.stringify(slot.frame),bytes=new TextEncoder();
 if(bytes.encode(raw).byteLength>1048576||bytes.encode(observed.row.payload).byteLength>8192)recoveryFailure();
 const result=await db.prepare('INSERT OR IGNORE INTO business_month_source_recoveries(month,slot_index,source_run_id,source_revision,parent_revision,parent_payload,start_date,end_date,original_frame,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM business_month_runs WHERE month=? AND revision=? AND payload=?)').bind(month,index,slot.frame.run_id,slot.frame.revision,observed.row.revision,observed.row.payload,slot.start_date,slot.end_date,raw,stamp,month,observed.row.revision,observed.row.payload).run();
 // A lost CAS never authorizes a replacement on the stale caller's next turn.
 return result.meta.changes===1;
}
export function businessMonthSourceRecoveryFence(recovery){
 return recovery?{sql:' AND EXISTS(SELECT 1 FROM business_month_source_recoveries WHERE month=? AND slot_index=? AND source_run_id=? AND source_revision=? AND parent_revision=? AND parent_payload=? AND start_date=? AND end_date=? AND original_frame=? AND created_at=? AND replacement_run_id IS NULL AND replaced_at IS NULL)',values:[recovery.month,recovery.slot_index,recovery.source_run_id,recovery.source_revision,recovery.parent_revision,recovery.parent_payload,recovery.start_date,recovery.end_date,recovery.original_frame,recovery.created_at]}:{sql:'',values:[]};
}
export function completeBusinessMonthSourceRecovery(db,recovery,frame,next,stamp){
 return db.prepare('UPDATE business_month_source_recoveries SET replacement_run_id=?,replaced_at=? WHERE month=? AND slot_index=? AND source_run_id=? AND parent_revision=? AND parent_payload=? AND original_frame=? AND replacement_run_id IS NULL AND EXISTS(SELECT 1 FROM business_month_runs WHERE month=? AND revision=? AND payload=?) AND EXISTS(SELECT 1 FROM business_month_frames WHERE month=? AND slot_index=? AND run_id=? AND revision=?)').bind(frame.run_id,stamp,recovery.month,recovery.slot_index,recovery.source_run_id,recovery.parent_revision,recovery.parent_payload,recovery.original_frame,recovery.month,next.row.revision,next.row.payload,recovery.month,recovery.slot_index,frame.run_id,frame.revision);
}
