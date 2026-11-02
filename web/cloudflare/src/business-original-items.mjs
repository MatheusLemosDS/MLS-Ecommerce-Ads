// Additive evidence only. The legacy reconciliation payload and the physical
// ledgers retain their exact contracts and rollback-safe stored bytes.
export const BUSINESS_ORIGINAL_ITEMS_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_reconciliation_original_items(run_id TEXT PRIMARY KEY NOT NULL,source_revision INTEGER NOT NULL,publication_revision INTEGER NOT NULL,report_checked_at INTEGER NOT NULL,report_hash TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=65536),payload_hash TEXT NOT NULL)`,
];

// All proof stays tied to one selected publication and its exact saved legacy
// reports. Dependencies are explicit for the browser's frozen .toString copy.
export function projectBusinessOriginalItems(value,projectBusiness,projectFrame,projectOriginal){
 try{
  const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
  const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
  const array=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,index)=>Object.hasOwn(Object.getOwnPropertyDescriptor(rows,String(index))||{},'value')).every(Boolean);
  if(![projectBusiness,projectFrame,projectOriginal].every(fn=>typeof fn==='function')||!exact(value,['schema','report','original_items','pending'])||value.schema!=='business_original_items_v1'||!array(value.original_items,3)||!array(value.pending,1))return null;
  const report=projectBusiness(value.report,projectFrame);if(!report)return null;
  const byId=new Map(report.reports.map(row=>[row.run_id,row])),seenRuns=new Set(),seenOrders=new Set(),seenCases=new Set(),items=[];
  for(const raw of value.original_items){
   const runId=plain(raw)?Object.getOwnPropertyDescriptor(raw,'run_id')?.value:null,legacy=byId.get(runId);
   if(!legacy||seenRuns.has(runId))return null;
   const checked=projectOriginal(raw,legacy);if(!checked)return null;
   for(const row of checked.orders){if(seenOrders.has(row.order_hash))return null;seenOrders.add(row.order_hash);}
   for(const row of checked.cases){if(seenCases.has(row.case_hash))return null;seenCases.add(row.case_hash);}
   seenRuns.add(runId);items.push(checked);
  }
  items.sort((left,right)=>report.sources.findIndex(row=>row.run_id===left.run_id)-report.sources.findIndex(row=>row.run_id===right.run_id));
  const incomplete=!report.sources.length||items.length!==report.sources.length||items.some(frame=>[...frame.orders,...frame.cases].some(row=>row.state!=='AVAILABLE'));
  const pending=incomplete?['ORIGINAL_ITEMS_NOT_CAPTURED']:[];
  if(JSON.stringify(value.pending)!==JSON.stringify(pending))return null;
  const result={schema:'business_original_items_v1',report,original_items:items,pending};
  return new TextEncoder().encode(JSON.stringify(result)).byteLength<=524288?result:null;
 }catch{return null;}
}

// An unavailable new evidence panel never changes the legacy physical ledger.
// A nonnull panel must describe exactly the source cases rendered beside it.
export function projectPhysicalReturnsOriginalItemsWorkspace(value,projectWorkspace,projectBusinessOriginal,projectBusiness,projectFrame,projectOriginal){
 try{
  const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
  const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
  if(![projectWorkspace,projectBusinessOriginal,projectBusiness,projectFrame,projectOriginal].every(fn=>typeof fn==='function')||!exact(value,['schema','report','original_items'])||value.schema!=='physical_returns_workspace_v2')return null;
  const report=projectWorkspace(value.report);if(!report)return null;
  let original=null;
  if(value.original_items!==null){
   original=projectBusinessOriginal(value.original_items,projectBusiness,projectFrame,projectOriginal);
   if(!original||original.report.month!==report.month||original.report.checked_at>report.checked_at)return null;
   const cases=new Map(original.report.reports.flatMap(frame=>frame.cases).map(row=>[row.case_hash,row]));
   for(const row of report.source.cases){const current=cases.get(row.case_hash);if(!current||row.order_hash!==current.order_hash||row.status!==current.status||row.checked_at!==current.checked_at||row.publication_revision!==original.report.source_revision)return null;}
  }
  const result={schema:'physical_returns_workspace_v2',report,original_items:original};
  return new TextEncoder().encode(JSON.stringify(result)).byteLength<=1048576?result:null;
 }catch{return null;}
}
