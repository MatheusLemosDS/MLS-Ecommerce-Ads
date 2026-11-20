import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Reviewed only after complete comparison against main4cf, Live17.3 ad7f and
// the original bd01 financial sections. This is test-only source accounting;
// it grants no runtime, deployment, price or DTO exception.
export const REVIEWED_BUSINESS_MONTH_SOURCE_ADAPTER=Object.freeze({
 source_sha256:'11a67217aac34c8724d670102013e89c37ecc027f905734d22e3c3d3a6700dae',
 commercial_sha256:'fe688b43dc3d848004477ace9de1b7a70a47951f488b3c06e51d8e50aa96ff63',
 commercial_commit:'4cfdf465b2fda58dd27ae693126b7fe1625f69d6',
 live_commit:'ad7f991295ca7b326f0428b5eeb744a88572cdd9',
 dto_sha256:'01308b5404bf68b52fee2211d468383bcf4c1d45c5637c10cbc0cf7bf332e221',
 calculation_tail_sha256:'ba624f764632dc9c66ee1c2b4d33985ae81759fd89b6004ee8e0385eec2c45f0',
});
const digest=value=>createHash('sha256').update(value).digest('hex');
function from(source,marker){assert.equal(source.split(marker).length,2,'unique reviewed financial source boundary '+marker);return source.slice(source.indexOf(marker));}
export function assertBusinessMonthFinancialSections(source,commercial){
 assert.equal(digest(commercial),REVIEWED_BUSINESS_MONTH_SOURCE_ADAPTER.commercial_sha256,'complete reviewed commercial source remains pinned');
 const dto=value=>{const start='export function projectBusinessMonth(',end='const businessMonthCoverageKeys=';assert.equal(value.split(start).length,2);assert.equal(value.split(end).length,2);return value.slice(value.indexOf(start),value.indexOf(end));};
 assert.equal(dto(source),dto(commercial),'direct monthly DTO is unchanged before adapter removal');
 assert.equal(digest(dto(source)),REVIEWED_BUSINESS_MONTH_SOURCE_ADAPTER.dto_sha256,'original monthly DTO bytes remain pinned');
 const marker=' const year=Number(month.slice(0,4));';
 assert.equal(from(source,marker),from(commercial,marker),'direct monthly calculations are unchanged before adapter removal');
 assert.equal(digest(from(source,marker)),REVIEWED_BUSINESS_MONTH_SOURCE_ADAPTER.calculation_tail_sha256,'original monthly calculation bytes remain pinned');
}

// Reverse only these exact, individually reviewed hunks, each occurring once.
// Reordered imports, unknown lines, a changed fence or an added option cannot
// be erased by a general expression or an accepted-hash fallback.
const adapters=[
 {label:'retention-publication imports',current:String.raw`import {catalogClassificationQueries,catalogClassificationsFromSnapshot} from './catalog-classification.mjs';
import {BUSINESS_MONTH_PUBLICATION_SCHEMA,completedBusinessMonthPublicationStatements,saveCompletedBusinessMonth,readCompletedBusinessMonth,businessMonthSourceRetentionManifest,retainCompletedBusinessMonthSources,businessMonthPublicationSnapshotStatements} from './business-month-publication.mjs';
import {BUSINESS_MONTH_ADS_HISTORY_SCHEMA,businessMonthAdsHistoryQueries,businessMonthAdsHistoryStatements} from './business-month-ads-history.mjs';
`,commercial:String.raw`import {catalogClassificationQueries,catalogClassificationsFromSnapshot} from './catalog-classification.mjs';
import {BUSINESS_MONTH_PUBLICATION_SCHEMA,completedBusinessMonthPublicationStatements,saveCompletedBusinessMonth,readCompletedBusinessMonth} from './business-month-publication.mjs';
import {BUSINESS_MONTH_ADS_HISTORY_SCHEMA,businessMonthAdsHistoryQueries,businessMonthAdsHistoryStatements} from './business-month-ads-history.mjs';
`},
 {label:'exact missing-source recovery imports',current:String.raw`import {unwrapBusinessMonthVariantSource,captureBusinessMonthVariantAttribution} from './business-variant-attribution.mjs';
import {BUSINESS_MONTH_SOURCE_RECOVERY_SCHEMA,readBusinessMonthSourceRecovery,recordBusinessMonthMissingSource,businessMonthSourceRecoveryFence,completeBusinessMonthSourceRecovery} from './business-month-source-recovery.mjs';
import {BUSINESS_MONTH_COHORT_SOURCE_RECOVERY_SCHEMA,readBusinessMonthCohortRecovery,recordBusinessMonthCohortMissingSource,businessMonthCohortRecoveryFence,completeBusinessMonthCohortRecovery} from './business-month-cohort-source-recovery.mjs';

`,commercial:String.raw`import {unwrapBusinessMonthVariantSource,captureBusinessMonthVariantAttribution} from './business-variant-attribution.mjs';

`},
 {label:'additive recovery schema',current:String.raw`export const BUSINESS_MONTH_SCHEMA=[
 ...BUSINESS_MONTH_SOURCE_RECOVERY_SCHEMA,
 ...BUSINESS_MONTH_COHORT_SOURCE_RECOVERY_SCHEMA,
 ...EXPENSE_LEDGER_SCHEMA,
`,commercial:String.raw`export const BUSINESS_MONTH_SCHEMA=[
 ...EXPENSE_LEDGER_SCHEMA,
`},
 {label:'GET keeps existing publication without creating retention pins',current:String.raw` let published=await readCompletedBusinessMonth(env,month,{now});
 // An old complete active frame remains visible, but only a mutating collector
 // can acknowledge Finance retention and publish it. GET never creates pins.
 if(!published)return {display:active,active,display_source:'ACTIVE',audit_scope:null,source_frames:null,expense_schedule:null};
`,commercial:String.raw` let published=await readCompletedBusinessMonth(env,month,{now});
 // Bootstrap a completed pre-publication deployment without waiting for a
 // provider refresh. A concurrent collector cannot publish a stale CAS view.
 if(observed?.complete&&(!published||published.row.revision<observed.row.revision)){
  published=await saveCompletedBusinessMonth(env,month,observed,{now})||await readCompletedBusinessMonth(env,month,{now});
 }
 if(!published)return {display:active,active,display_source:'ACTIVE',audit_scope:null,source_frames:null,expense_schedule:null};
`},
 {label:'POST outbox acknowledgement and cohort recovery selection',current:String.raw` let observed=await businessMonthLoadRun(db,input.month,range,stamp,true);
 let cohortRecovery=null;if(operation==='start'||operation==='step'){try{cohortRecovery=await readBusinessMonthCohortRecovery(db,input.month,observed,stamp);}catch{businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);}}
 if(operation==='start'||operation==='step'){
  // The durable App publication is the commit outbox. A crash after its CAS
  // leaves a permanently protected candidate in Finance; the next POST
  // confirms the actual winner, never a stale caller's proposed publication.
  const actual=observed?await readCompletedBusinessMonth(env,input.month,{now,snapshot:observed.publicationSnapshot}):null;
  if(actual){try{await retainCompletedBusinessMonthSources(env,input.month,actual,{operation:'confirm',now,retain:services?.retainFinanceBusinessPeriodPublication??null});}catch{
   // Legacy publications can predate the outbox protocol or reference an
   // already missing run. Keep their copies while a fresh collector recovers
   // sources. A new publication still requires its own successful prepare.
  }}
 }
 const legacyProducts=observed?.complete&&observed.payload.slots.some(slot=>!Object.hasOwn(slot.frame,'product_breakdown'));
 if(cohortRecovery||!observed||observed.payload.end_date!==range.end_date||operation==='start'&&observed.complete&&(legacyProducts||stamp-observed.row.created_at>(range.current?60:900))){
  if(!cohortRecovery&&operation!=='start'&&operation!=='read'&&operation!=='ads'&&!expenseOperation)businessMonthFail('BUSINESS_MONTH_START_REQUIRED',409);
  observed=await businessMonthCreateRun(db,input.month,range,stamp,observed,cohortRecovery);
 }
`,commercial:String.raw` let observed=await businessMonthLoadRun(db,input.month,range,stamp,true);
 const legacyProducts=observed?.complete&&observed.payload.slots.some(slot=>!Object.hasOwn(slot.frame,'product_breakdown'));
 if(!observed||observed.payload.end_date!==range.end_date||operation==='start'&&observed.complete&&(legacyProducts||stamp-observed.row.created_at>(range.current?60:900))){
  if(operation!=='start'&&operation!=='read'&&operation!=='ads'&&!expenseOperation)businessMonthFail('BUSINESS_MONTH_START_REQUIRED',409);
  observed=await businessMonthCreateRun(db,input.month,range,stamp,observed);
 }
`},
 {label:'single snapshot of active frames, recovery fences and committed outbox',current:String.raw`
function businessMonthRunSnapshotStatements(db,month){return [
  db.prepare('SELECT revision,payload,created_at,updated_at FROM business_month_runs WHERE month=?').bind(month),
  db.prepare('SELECT slot_index,run_id,revision,payload FROM business_month_frames WHERE month=? ORDER BY slot_index').bind(month),
  db.prepare('SELECT * FROM business_month_source_recoveries WHERE month=? AND parent_revision=(SELECT revision FROM business_month_runs WHERE month=?) AND replacement_run_id IS NULL ORDER BY slot_index LIMIT 4').bind(month,month),
  db.prepare('SELECT * FROM business_month_cohort_source_recoveries WHERE month=? AND parent_revision=(SELECT revision FROM business_month_runs WHERE month=?) AND replacement_parent_revision IS NULL ORDER BY slot_index LIMIT 4').bind(month,month),
  ...businessMonthPublicationSnapshotStatements(db,month),
 ];}
async function businessMonthLoadRun(db,month,range,stamp,allowPreviousScope=false,captured=null){
 // Parent, active frames, recovery fences and committed outbox share a snapshot.
 const snapshot=captured??await db.batch(businessMonthRunSnapshotStatements(db,month));
 const row=snapshot[0].results[0];
`,commercial:String.raw`
async function businessMonthLoadRun(db,month,range,stamp,allowPreviousScope=false){
 // Stable slot rows and their parent references must share one read snapshot.
 // Otherwise a concurrent step could replace a slot between these two reads.
 const snapshot=await db.batch([
  db.prepare('SELECT revision,payload,created_at,updated_at FROM business_month_runs WHERE month=?').bind(month),
  db.prepare('SELECT slot_index,run_id,revision,payload FROM business_month_frames WHERE month=? ORDER BY slot_index').bind(month),
 ]);
 const row=snapshot[0].results[0];
`},
 {label:'source recovery, CAS reset and bounded COHORT retention request',current:String.raw` if(referenced.size!==storedFrames.size)businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);
 return {row,storedPayload:payload,payload:{start_date:range.start_date,end_date:range.end_date,slots},complete:slots.every(slot=>slot.frame?.status==='COMPLETE'),recoveryRows:snapshot[2].results,cohortRecoveryRows:snapshot[3].results,publicationSnapshot:snapshot.slice(4,6)};
}
async function businessMonthCreateRun(db,month,range,stamp,observed,cohortRecovery=null){
 const payload=JSON.stringify({start_date:range.start_date,end_date:range.end_date,slots:range.slots});
 const fence=businessMonthCohortRecoveryFence(cohortRecovery);
 const mutation=observed?db.prepare('UPDATE business_month_runs SET revision=revision+1,payload=?,created_at=?,updated_at=? WHERE month=? AND revision=? AND payload=?'+fence.sql).bind(payload,stamp,stamp,month,observed.row.revision,observed.row.payload,...fence.values):db.prepare('INSERT INTO business_month_runs(month,revision,payload,created_at,updated_at) VALUES(?,1,?,?,?) ON CONFLICT(month) DO UPDATE SET revision=business_month_runs.revision+1,payload=excluded.payload,created_at=excluded.created_at,updated_at=excluded.updated_at WHERE business_month_runs.payload NOT LIKE ?').bind(month,payload,stamp,stamp,'%"end_date":"'+range.end_date+'"%');
 const writes=[mutation,db.prepare('DELETE FROM business_month_frames WHERE month=? AND changes()=1').bind(month),...(cohortRecovery?[completeBusinessMonthCohortRecovery(db,cohortRecovery,payload,stamp)]:[])],offset=writes.length;
 const captured=await db.batch([...writes,...businessMonthRunSnapshotStatements(db,month)]);
 const latest=await businessMonthLoadRun(db,month,range,stamp,false,captured.slice(offset));if(!latest)businessMonthFail('BUSINESS_MONTH_CHANGED_RELOAD',409);return latest;
}
async function businessMonthAdvance(env,db,month,range,stamp,observed,services){
 const retainSources=async(value,options={})=>{try{return await retainCompletedBusinessMonthSources(env,month,value,{now:()=>stamp*1000,retain:services?.retainFinanceBusinessPeriodPublication??null,...options});}catch(error){
  if(error?.message==='BUSINESS_MONTH_SOURCE_RETENTION_RUN_NOT_FOUND'&&observed.payload.slots.some(slot=>slot.frame!==null)){try{await recordBusinessMonthCohortMissingSource(db,month,observed,stamp);}catch{businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);}}
  throw error;
 }};
 const index=observed.payload.slots.findIndex(slot=>slot.frame===null||slot.frame.status==='RUNNING');
 if(index<0){
  if(observed.complete){
   await retainSources(observed);
   const published=await saveCompletedBusinessMonth(env,month,observed,{now:()=>stamp*1000});
   if(published)await retainCompletedBusinessMonthSources(env,month,published,{operation:'confirm',now:()=>stamp*1000,retain:services?.retainFinanceBusinessPeriodPublication??null});
  }
  return observed;
 }
 if(observed.payload.slots.some(slot=>slot.frame?.status==='LIMIT_REACHED'))return observed;
 if(typeof services?.getFinanceBusinessPeriod!=='function')businessMonthFail('BUSINESS_MONTH_SOURCE_UNAVAILABLE',503);
 const slot=observed.payload.slots[index];let recovery;
 try{recovery=await readBusinessMonthSourceRecovery(db,month,index,slot,observed,stamp);}catch{businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);}
 const selection=slot.frame&&!recovery?{operation:'step',run_id:slot.frame.run_id}:{operation:'start',start_date:slot.start_date,end_date:slot.end_date};
 const retention=businessMonthSourceRetentionManifest(month,observed,{kind:'COHORT',now:()=>stamp*1000});
 let source;try{source=await services.getFinanceBusinessPeriod(env,selection,{includeVariants:true,...(retention?{retention}:{})});}catch{businessMonthFail('BUSINESS_MONTH_SOURCE_UNAVAILABLE',503);}
 // Only this exact, bounded envelope can turn a private transport failure into
`,commercial:String.raw` if(referenced.size!==storedFrames.size)businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);
 return {row,storedPayload:payload,payload:{start_date:range.start_date,end_date:range.end_date,slots},complete:slots.every(slot=>slot.frame?.status==='COMPLETE')};
}
async function businessMonthCreateRun(db,month,range,stamp,observed){
 const payload=JSON.stringify({start_date:range.start_date,end_date:range.end_date,slots:range.slots});
 const mutation=observed?db.prepare('UPDATE business_month_runs SET revision=revision+1,payload=?,created_at=?,updated_at=? WHERE month=? AND revision=? AND payload=?').bind(payload,stamp,stamp,month,observed.row.revision,observed.row.payload):db.prepare('INSERT INTO business_month_runs(month,revision,payload,created_at,updated_at) VALUES(?,1,?,?,?) ON CONFLICT(month) DO UPDATE SET revision=business_month_runs.revision+1,payload=excluded.payload,created_at=excluded.created_at,updated_at=excluded.updated_at WHERE business_month_runs.payload NOT LIKE ?').bind(month,payload,stamp,stamp,'%"end_date":"'+range.end_date+'"%');
 await db.batch([...completedBusinessMonthPublicationStatements(db,month,observed,{now:()=>stamp*1000}),mutation,db.prepare('DELETE FROM business_month_frames WHERE month=? AND changes()=1').bind(month)]);
 const latest=await businessMonthLoadRun(db,month,range,stamp);if(!latest)businessMonthFail('BUSINESS_MONTH_CHANGED_RELOAD',409);return latest;
}
async function businessMonthAdvance(env,db,month,range,stamp,observed,services){
 const index=observed.payload.slots.findIndex(slot=>slot.frame===null||slot.frame.status==='RUNNING');
 if(index<0||observed.payload.slots.some(slot=>slot.frame?.status==='LIMIT_REACHED'))return observed;
 if(typeof services?.getFinanceBusinessPeriod!=='function')businessMonthFail('BUSINESS_MONTH_SOURCE_UNAVAILABLE',503);
 const slot=observed.payload.slots[index],selection=slot.frame?{operation:'step',run_id:slot.frame.run_id}:{operation:'start',start_date:slot.start_date,end_date:slot.end_date};
 let source;try{source=await services.getFinanceBusinessPeriod(env,selection,{includeVariants:true});}catch{businessMonthFail('BUSINESS_MONTH_SOURCE_UNAVAILABLE',503);}
 // Only this exact, bounded envelope can turn a private transport failure into
`},
 {label:'strict explicit404 recovery diagnostics',current:String.raw` if(businessMonthExact(source,['schema','status','diagnostic'])&&source.schema==='finance_business_period_v1'&&source.status==='UNAVAILABLE'){
  if(businessMonthExact(source.diagnostic,['code','http'])&&source.diagnostic.code==='FINANCE_BUSINESS_RETENTION_RUN_NOT_FOUND'&&source.diagnostic.http===404&&retention!==null){
   try{await recordBusinessMonthCohortMissingSource(db,month,observed,stamp);}catch{businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);}
   throw new BusinessMonthError('BUSINESS_MONTH_SOURCE_RETENTION_RUN_NOT_FOUND',503,{code:'FINANCE_BUSINESS_RETENTION_RUN_NOT_FOUND',http:404});
  }
  if(!recovery&&slot.frame?.status==='RUNNING'&&businessMonthExact(source.diagnostic,['code','http'])&&source.diagnostic.code==='FINANCE_BUSINESS_RUN_NOT_FOUND'&&source.diagnostic.http===404){
   try{await recordBusinessMonthMissingSource(db,month,index,slot,observed,stamp);}catch{businessMonthFail('BUSINESS_MONTH_STORAGE_INVALID',503);}
   throw new BusinessMonthError('BUSINESS_MONTH_SOURCE_RUN_NOT_FOUND',503,{code:'FINANCE_BUSINESS_RUN_NOT_FOUND',http:404});
  }
  const diagnostic=source.diagnostic,codes=['UNAVAILABLE','CONFIGURATION','NETWORK_ERROR','TIMEOUT','HTTP_ERROR','REDIRECT_REJECTED','CONTENT_TYPE_INVALID','BODY_LIMIT','BODY_READ_ERROR','JSON_INVALID','FRAME_INVALID','SCOPE_MISMATCH','RESPONSE_INVALID'];
`,commercial:String.raw` if(businessMonthExact(source,['schema','status','diagnostic'])&&source.schema==='finance_business_period_v1'&&source.status==='UNAVAILABLE'){
  const diagnostic=source.diagnostic,codes=['UNAVAILABLE','CONFIGURATION','NETWORK_ERROR','TIMEOUT','HTTP_ERROR','REDIRECT_REJECTED','CONTENT_TYPE_INVALID','BODY_LIMIT','BODY_READ_ERROR','JSON_INVALID','FRAME_INVALID','SCOPE_MISMATCH','RESPONSE_INVALID'];
`},
 {label:'replacement source run identity and monotonic revision validation',current:String.raw` const negotiated=await unwrapBusinessMonthVariantSource(source),frame=negotiated?.report??null;
 if(!frame||frame.start_date!==slot.start_date||frame.end_date!==slot.end_date||frame.checked_at>stamp+60||slot.frame&&(!recovery&&frame.run_id!==slot.frame.run_id||frame.run_id===slot.frame.run_id&&frame.revision<slot.frame.revision)||observed.payload.slots.some((entry,position)=>position!==index&&entry.frame?.run_id===frame.run_id))businessMonthFail('BUSINESS_MONTH_SOURCE_INVALID',503);
 const payload={...observed.payload,slots:observed.payload.slots.map((entry,position)=>position===index?{...entry,frame}:entry)};
`,commercial:String.raw` const negotiated=await unwrapBusinessMonthVariantSource(source),frame=negotiated?.report??null;
 if(!frame||frame.start_date!==slot.start_date||frame.end_date!==slot.end_date||frame.checked_at>stamp+60||slot.frame&&(frame.run_id!==slot.frame.run_id||frame.revision<slot.frame.revision)||observed.payload.slots.some((entry,position)=>position!==index&&entry.frame?.run_id===frame.run_id))businessMonthFail('BUSINESS_MONTH_SOURCE_INVALID',503);
 const payload={...observed.payload,slots:observed.payload.slots.map((entry,position)=>position===index?{...entry,frame}:entry)};
`},
 {label:'exact missing-source recovery write fence',current:String.raw` // references, so a legal month cannot exceed D1's per-value size limit.
 const fence=businessMonthSourceRecoveryFence(recovery),writes=[],storedPayload={...payload,slots:payload.slots.map((entry,position)=>{
  if(entry.frame===null)return entry;
`,commercial:String.raw` // references, so a legal month cannot exceed D1's per-value size limit.
 const writes=[],storedPayload={...payload,slots:payload.slots.map((entry,position)=>{
  if(entry.frame===null)return entry;
`},
 {label:'frame replacement CAS includes the recovery fence',current:String.raw`   const raw=JSON.stringify(next);if(new TextEncoder().encode(raw).byteLength>1048576)businessMonthFail('BUSINESS_MONTH_SOURCE_INVALID',503);
   writes.push(db.prepare('INSERT INTO business_month_frames(month,slot_index,run_id,revision,payload) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM business_month_runs WHERE month=? AND revision=? AND payload=?)'+fence.sql+' ON CONFLICT(month,slot_index) DO UPDATE SET run_id=excluded.run_id,revision=excluded.revision,payload=excluded.payload').bind(month,position,next.run_id,next.revision,raw,month,observed.row.revision,observed.row.payload,...fence.values));
  }
`,commercial:String.raw`   const raw=JSON.stringify(next);if(new TextEncoder().encode(raw).byteLength>1048576)businessMonthFail('BUSINESS_MONTH_SOURCE_INVALID',503);
   writes.push(db.prepare('INSERT INTO business_month_frames(month,slot_index,run_id,revision,payload) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM business_month_runs WHERE month=? AND revision=? AND payload=?) ON CONFLICT(month,slot_index) DO UPDATE SET run_id=excluded.run_id,revision=excluded.revision,payload=excluded.payload').bind(month,position,next.run_id,next.revision,raw,month,observed.row.revision,observed.row.payload));
  }
`},
 {label:'prepare before App publication, snapshot CAS winner and confirm retained source',current:String.raw` const raw=JSON.stringify(storedPayload),updatedAt=Math.max(stamp,frame.checked_at),parentIndex=writes.length;
 writes.push(db.prepare('UPDATE business_month_runs SET revision=revision+1,payload=?,updated_at=? WHERE month=? AND revision=? AND payload=?'+fence.sql).bind(raw,updatedAt,month,observed.row.revision,observed.row.payload,...fence.values));
 const next={row:{revision:observed.row.revision+1,payload:raw,created_at:observed.row.created_at,updated_at:updatedAt},storedPayload,payload,complete:payload.slots.every(slot=>slot.frame?.status==='COMPLETE')};
 if(frame.status==='COMPLETE'){
  await retainSources(next,{kind:next.complete?'PUBLICATION':'COHORT',now:()=>updatedAt*1000});
 }
 if(recovery)writes.push(completeBusinessMonthSourceRecovery(db,recovery,frame,next,updatedAt));
 writes.push(...completedBusinessMonthPublicationStatements(db,month,next,{now:()=>updatedAt*1000}));
 const publicationIndex=writes.length;if(next.complete)writes.push(...businessMonthPublicationSnapshotStatements(db,month));
 const committed=await db.batch(writes),written=committed[parentIndex];
 if(written.meta.changes!==1){const latest=await businessMonthLoadRun(db,month,range,Math.max(stamp,frame.checked_at));if(!latest)businessMonthFail('BUSINESS_MONTH_CHANGED_RELOAD',409);return latest;}
 if(next.complete){const actual=await readCompletedBusinessMonth(env,month,{now:()=>updatedAt*1000,snapshot:committed.slice(publicationIndex)});if(actual)await retainCompletedBusinessMonthSources(env,month,actual,{operation:'confirm',now:()=>updatedAt*1000,retain:services?.retainFinanceBusinessPeriodPublication??null});}
 if(negotiated.variant_financials)await captureBusinessMonthVariantAttribution(db,month,frame,negotiated.variant_financials,{capture_revision:next.row.revision,parent_payload:raw,slot_index:index});
 return {...next,recoveryRows:[],cohortRecoveryRows:[],publicationSnapshot:next.complete?committed.slice(publicationIndex):observed.publicationSnapshot};
}
`,commercial:String.raw` const raw=JSON.stringify(storedPayload),updatedAt=Math.max(stamp,frame.checked_at),parentIndex=writes.length;
 writes.push(db.prepare('UPDATE business_month_runs SET revision=revision+1,payload=?,updated_at=? WHERE month=? AND revision=? AND payload=?').bind(raw,updatedAt,month,observed.row.revision,observed.row.payload));
 const next={row:{revision:observed.row.revision+1,payload:raw,created_at:observed.row.created_at,updated_at:updatedAt},storedPayload,payload,complete:payload.slots.every(slot=>slot.frame?.status==='COMPLETE')};
 writes.push(...completedBusinessMonthPublicationStatements(db,month,next,{now:()=>updatedAt*1000}));
 const written=(await db.batch(writes))[parentIndex];
 if(written.meta.changes!==1){const latest=await businessMonthLoadRun(db,month,range,Math.max(stamp,frame.checked_at));if(!latest)businessMonthFail('BUSINESS_MONTH_CHANGED_RELOAD',409);return latest;}
 if(negotiated.variant_financials)await captureBusinessMonthVariantAttribution(db,month,frame,negotiated.variant_financials,{capture_revision:next.row.revision,parent_payload:raw,slot_index:index});
 return businessMonthLoadRun(db,month,range,Math.max(stamp,frame.checked_at));
}
`},
];
export function normalizeReviewedBusinessMonthSource(source,commercial){
 // These direct financial assertions deliberately run BEFORE any stripping.
 assertBusinessMonthFinancialSections(source,commercial);
 assert.equal(digest(source),REVIEWED_BUSINESS_MONTH_SOURCE_ADAPTER.source_sha256,'only exact reviewed retention/recovery source bytes');
 let normalized=source;
 for(const adapter of adapters){assert.equal(normalized.split(adapter.current).length-1,1,'one exact reviewed adapter hunk: '+adapter.label);normalized=normalized.replace(adapter.current,adapter.commercial);}
 assert.equal(normalized,commercial,'complete reviewed source after exact retention/recovery adapters');
 return normalized;
}
