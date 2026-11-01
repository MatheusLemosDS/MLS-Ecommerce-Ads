import {FINANCE_PROFILE,FinanceConnectionError} from './connection-store.mjs';
import {readFinancePendingIncomePage} from './income-detail.mjs';
import {projectIncomeDetailFrame} from './income-detail-frame.mjs';
import {projectPendingIncomeScanRequest,projectPendingIncomeScanFrame} from './pending-income-frame.mjs';

export const PENDING_INCOME_SCAN_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS finance_pending_income_control(id INTEGER PRIMARY KEY CHECK(id=1),active_scan_id TEXT)`,
 `CREATE TABLE IF NOT EXISTS finance_pending_income_scans(scan_id TEXT PRIMARY KEY,partner_id INTEGER NOT NULL,shop_id INTEGER NOT NULL,revision INTEGER NOT NULL,state TEXT NOT NULL,started_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,completed_at INTEGER,date_from TEXT NOT NULL,date_to TEXT NOT NULL,pages_read INTEGER NOT NULL,duplicate_entries INTEGER NOT NULL,next_cursor TEXT NOT NULL,next_attempt_at INTEGER NOT NULL,error TEXT,lease_owner TEXT,lease_until INTEGER)`,
 `CREATE TABLE IF NOT EXISTS finance_pending_income_pages(scan_id TEXT NOT NULL,page_index INTEGER NOT NULL,request_cursor_hash TEXT NOT NULL,next_cursor_hash TEXT NOT NULL,page_hash TEXT NOT NULL,entry_hashes TEXT NOT NULL,row_count INTEGER NOT NULL,checked_at INTEGER NOT NULL,PRIMARY KEY(scan_id,page_index))`,
 `CREATE TABLE IF NOT EXISTS finance_pending_income_rows(scan_id TEXT NOT NULL,entry_hash TEXT NOT NULL,order_hash TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(scan_id,entry_hash))`,
 `CREATE TABLE IF NOT EXISTS finance_pending_income_publication(id INTEGER PRIMARY KEY CHECK(id=1),scan_id TEXT NOT NULL,published_at INTEGER NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=1032192))`,
];
const ready=new WeakSet(),encoder=new TextEncoder(),basis='CURRENT_PENDING_PAGINATED_MUTABLE_SOURCE_NOT_MONTH_OR_BANK_RECEIPT',identity=[FINANCE_PROFILE.partner_id,FINANCE_PROFILE.shop_id];
const fail=(suffix,status=503)=>{throw new FinanceConnectionError('FINANCE_PENDING_INCOME_SCAN_'+suffix,status);};
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
const localDay=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
const priorDay=day=>new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);
function stats(rows){
 const orders=new Map();let unknown=0,sum=0n;
 for(const row of rows){orders.set(row.order_hash,(orders.get(row.order_hash)||0)+1);if(row.estimated_escrow_cents===null)unknown++;else sum+=BigInt(row.estimated_escrow_cents);}
 const conflicts=[...orders.values()].filter(count=>count>1).length,safe=sum>=BigInt(Number.MIN_SAFE_INTEGER)&&sum<=BigInt(Number.MAX_SAFE_INTEGER),complete=unknown===0&&conflicts===0&&safe;
 return {unique_orders:orders.size,conflicting_orders:conflicts,known_amount_cents:complete?Number(sum):null,unknown_amount_count:unknown,amount_complete:complete};
}
function classify(error){
 const code=typeof error?.code==='string'?error.code:'';
 if(code.endsWith('_PERMISSION_DENIED')||error?.upstream_status===403)return 'PERMISSION_DENIED';
 if(code.endsWith('_RATE_LIMIT')||error?.upstream_status===429)return 'RATE_LIMIT';
 if(code.endsWith('_TIMEOUT')||[408,504].includes(error?.upstream_status))return 'TIMEOUT';
 if(['REPEATED_CURSOR','REPEATED_PAGE','EMPTY_CONTINUATION','LIMIT_REACHED','SCAN_EXPIRED'].some(suffix=>code==='FINANCE_PENDING_INCOME_SCAN_'+suffix))return code.slice('FINANCE_PENDING_INCOME_SCAN_'.length);
 if(/_(?:INVALID_RESPONSE|RESULT_INVALID|UPSTREAM_INVALID_JSON|UPSTREAM_CONTENT_TYPE|UPSTREAM_BODY_TOO_LARGE)$/.test(code))return 'INVALID_RESPONSE';
 return 'UNAVAILABLE';
}
function reportFor(run,pages,rows,completedAt){
 return {scan_id:run.scan_id,started_at:run.started_at,completed_at:completedAt,source_oldest_at:Math.min(...pages.map(page=>page.checked_at)),source_latest_at:Math.max(...pages.map(page=>page.checked_at)),pages_read:pages.length,rows,duplicate_entries:run.duplicate_entries,...stats(rows),basis};
}
async function setup(env){
 const db=env?.FINANCE_DB;if(env?.FINANCE_CONNECTION_ENABLED!=='true'||typeof db?.prepare!=='function'||typeof db?.batch!=='function'||db===env.ADMIN_DB)fail('CONFIGURATION');
 if(!ready.has(db)){await db.batch([...PENDING_INCOME_SCAN_SCHEMA.map(sql=>db.prepare(sql)),db.prepare('INSERT OR IGNORE INTO finance_pending_income_control(id,active_scan_id) VALUES(1,NULL)')]);ready.add(db);}return db;
}
async function readState(db,stamp){
 const [selected,published,pageResult,rowResult]=await db.batch([
  db.prepare('SELECT s.* FROM finance_pending_income_control c JOIN finance_pending_income_scans s ON s.scan_id=c.active_scan_id WHERE c.id=1'),
  db.prepare('SELECT scan_id,published_at,payload FROM finance_pending_income_publication WHERE id=1'),
  db.prepare('SELECT * FROM finance_pending_income_pages WHERE scan_id=(SELECT active_scan_id FROM finance_pending_income_control WHERE id=1) ORDER BY page_index'),
  db.prepare('SELECT entry_hash,order_hash,payload FROM finance_pending_income_rows WHERE scan_id=(SELECT active_scan_id FROM finance_pending_income_control WHERE id=1) ORDER BY entry_hash'),
 ]);
 const run=selected?.results?.[0]??null,pub=published?.results?.[0]??null,pages=pageResult?.results,storedRows=rowResult?.results;
 if(!Array.isArray(pages)||!Array.isArray(storedRows)||pages.length>20||storedRows.length>1000)fail('STORAGE_INVALID');
 let report=null;try{if(pub){if(!uuid(pub.scan_id)||!integer(pub.published_at,1,stamp)||typeof pub.payload!=='string'||encoder.encode(pub.payload).byteLength>1032192)throw Error();report=JSON.parse(pub.payload);if(report.scan_id!==pub.scan_id||report.completed_at!==pub.published_at)throw Error();}}catch{fail('STORAGE_INVALID');}
 const rows=[];try{for(const stored of storedRows){const row=JSON.parse(stored.payload);if(row.entry_hash!==stored.entry_hash||row.order_hash!==stored.order_hash)throw Error();rows.push(row);}}catch{fail('STORAGE_INVALID');}
 for(let offset=0;offset<rows.length;offset+=100){const chunk=rows.slice(offset,offset+100);if(!projectIncomeDetailFrame({schema:'finance_income_detail_v1',checked_at:stamp,region:'BRAZIL',shop_type:'LOCAL',income_status:'PENDING',page_size:100,returned_count:chunk.length,has_more:false,next_cursor_present:false,rows:chunk,basis:'CURRENT_PENDING_PROVIDER_INCOME_DETAIL_NOT_MONTH_OR_BANK_RECEIPT'}))fail('STORAGE_INVALID');}
 let scan=null;
 if(run){
  if(run.partner_id!==identity[0]||run.shop_id!==identity[1]||!integer(run.revision,1,2147483646)||typeof run.next_cursor!=='string'||run.next_cursor.length>512||(run.lease_owner===null)!==(run.lease_until===null)||run.lease_owner!==null&&(!uuid(run.lease_owner)||!integer(run.lease_until,1,9999999999))||run.pages_read!==pages.length)fail('STORAGE_INVALID');
  const details=stats(rows);scan={scan_id:run.scan_id,state:run.state,started_at:run.started_at,updated_at:run.updated_at,completed_at:run.completed_at,date_from:run.date_from,date_to:run.date_to,pages_read:pages.length,unique_entries:rows.length,unique_orders:details.unique_orders,duplicate_entries:run.duplicate_entries,conflicting_orders:details.conflicting_orders,next_attempt_at:run.next_attempt_at,error:run.error};
  const emptyCursorHash=await hash(''),availableEntries=new Set(rows.map(row=>row.entry_hash));let cursorHash=emptyCursorHash,allEntries=new Set(),duplicates=0;
  for(let index=0;index<pages.length;index++){
   const page=pages[index];let entries;try{entries=JSON.parse(page.entry_hashes);}catch{fail('STORAGE_INVALID');}
   if(page.page_index!==index+1||page.scan_id!==run.scan_id||!digest(page.request_cursor_hash)||page.request_cursor_hash!==cursorHash||!digest(page.next_cursor_hash)||!digest(page.page_hash)||!Array.isArray(entries)||entries.length!==page.row_count||entries.length>100||new Set(entries).size!==entries.length||entries.some(entry=>!digest(entry)||!availableEntries.has(entry))||!integer(page.checked_at,run.started_at,run.updated_at)||await hash(JSON.stringify([...entries].sort()))!==page.page_hash)fail('STORAGE_INVALID');
   for(const entry of entries){if(allEntries.has(entry))duplicates++;allEntries.add(entry);}cursorHash=page.next_cursor_hash;
   if(index<pages.length-1&&cursorHash===emptyCursorHash)fail('STORAGE_INVALID');
  }
  if(allEntries.size!==rows.length||duplicates!==run.duplicate_entries||cursorHash!==await hash(run.next_cursor)||run.state==='COMPLETE'&&run.next_cursor!=='')fail('STORAGE_INVALID');
 }else if(pages.length||rows.length)fail('STORAGE_INVALID');
 const projected=projectPendingIncomeScanFrame({schema:'finance_pending_income_scan_v1',checked_at:stamp,scan,report,basis});if(!projected)fail('STORAGE_INVALID');
 return {frame:projected,run,pages,rows};
}

export async function readOrStepFinancePendingIncomeScan(env,input,{fetchImpl=request=>fetch(request),now=()=>Date.now(),readPage=readFinancePendingIncomePage}={}){
 const request=projectPendingIncomeScanRequest(input);if(!request)fail('REQUEST_INVALID',400);
 if(typeof now!=='function')fail('CONFIGURATION');let latestClock=0;const clock=()=>{let value;try{value=now();}catch{fail('CLOCK_INVALID');}if(!integer(value,1,9999999999999))fail('CLOCK_INVALID');const stamp=Math.floor(value/1000);if(stamp<latestClock)fail('CLOCK_INVALID');latestClock=stamp;return stamp;};
 const stamp=clock(),db=await setup(env);let state=await readState(db,stamp);if(request.operation==='read')return state.frame;
 if(typeof fetchImpl!=='function'||typeof readPage!=='function')fail('CONFIGURATION');
 const current=state.run;
 if(!current||['COMPLETE','ERROR','LIMIT_REACHED'].includes(current.state)&&current.next_attempt_at<=stamp){
  const id=crypto.randomUUID(),today=localDay(stamp),oldId=current?.scan_id??null;
  await db.batch([
   db.prepare("INSERT INTO finance_pending_income_scans(scan_id,partner_id,shop_id,revision,state,started_at,updated_at,completed_at,date_from,date_to,pages_read,duplicate_entries,next_cursor,next_attempt_at,error,lease_owner,lease_until) SELECT ?,?,?,1,'RUNNING',?,?,NULL,?,?,0,0,'',0,NULL,NULL,NULL WHERE EXISTS(SELECT 1 FROM finance_pending_income_control WHERE id=1 AND active_scan_id IS ?) AND NOT EXISTS(SELECT 1 FROM finance_pending_income_scans WHERE scan_id=? AND (next_attempt_at>? OR lease_until>?))").bind(id,...identity,stamp,stamp,priorDay(today),today,oldId,oldId,stamp,stamp),
   db.prepare('UPDATE finance_pending_income_control SET active_scan_id=? WHERE id=1 AND active_scan_id IS ? AND EXISTS(SELECT 1 FROM finance_pending_income_scans WHERE scan_id=?)').bind(id,oldId,id),
   ...['finance_pending_income_rows','finance_pending_income_pages','finance_pending_income_scans'].map(table=>db.prepare('DELETE FROM '+table+' WHERE scan_id IN(SELECT scan_id FROM finance_pending_income_scans WHERE partner_id=? AND shop_id=? AND scan_id NOT IN(SELECT active_scan_id FROM finance_pending_income_control WHERE active_scan_id IS NOT NULL UNION SELECT scan_id FROM finance_pending_income_publication)) AND EXISTS(SELECT 1 FROM finance_pending_income_control WHERE id=1 AND active_scan_id=?)').bind(...identity,id)),
  ]);
  state=await readState(db,stamp);
 }
 const run=state.run;if(!run||!['RUNNING','RETRY_WAIT'].includes(run.state)||run.next_attempt_at>stamp||run.lease_until>stamp)return state.frame;
 const owner=crypto.randomUUID(),guard="scan_id=? AND partner_id=? AND shop_id=? AND revision=? AND lease_owner=? AND lease_until>? AND scan_id=(SELECT active_scan_id FROM finance_pending_income_control WHERE id=1)",args=at=>[run.scan_id,...identity,run.revision,owner,at];
 const leased=await db.prepare("UPDATE finance_pending_income_scans SET lease_owner=?,lease_until=? WHERE scan_id=? AND partner_id=? AND shop_id=? AND revision=? AND state IN('RUNNING','RETRY_WAIT') AND next_attempt_at<=? AND (lease_owner IS NULL OR lease_until<=?)").bind(owner,stamp+45,run.scan_id,...identity,run.revision,stamp,stamp).run();if(leased?.meta?.changes!==1)return (await readState(db,clock())).frame;
 try{
  if(stamp-run.started_at>=3600)fail('SCAN_EXPIRED');
  const raw=await readPage(env,{cursor:run.next_cursor,date_from:run.date_from,date_to:run.date_to},{fetchImpl,now,timeoutMs:10000}),page=projectIncomeDetailFrame(raw?.frame),finished=clock();
  if(finished-run.started_at>=3600)fail('SCAN_EXPIRED');
  if(!page||page.checked_at<run.started_at||page.checked_at>finished||typeof raw.next_cursor!=='string'||raw.next_cursor.length>512||page.has_more!==(raw.next_cursor.length>0))fail('INVALID_RESPONSE',502);
  if(raw.next_cursor!==''&&page.rows.length===0)fail('EMPTY_CONTINUATION',502);
  const requestHash=await hash(run.next_cursor),nextHash=await hash(raw.next_cursor),pageHash=await hash(JSON.stringify(page.rows.map(row=>row.entry_hash).sort()));
  if(raw.next_cursor!==''&&(nextHash===requestHash||state.pages.some(previous=>previous.request_cursor_hash===nextHash||previous.next_cursor_hash===nextHash)))fail('REPEATED_CURSOR',502);
  if(raw.next_cursor!==''&&state.pages.some(previous=>previous.page_hash===pageHash))fail('REPEATED_PAGE',502);
  const entries=new Map(state.rows.map(row=>[row.entry_hash,row]));let duplicateEntries=run.duplicate_entries;
  for(const row of page.rows){const previous=entries.get(row.entry_hash);if(previous){if(JSON.stringify(previous)!==JSON.stringify(row))fail('INVALID_RESPONSE',502);duplicateEntries++;}else entries.set(row.entry_hash,row);}
  if(entries.size>1000||run.pages_read>=20)fail('LIMIT_REACHED');
  const rows=[...entries.values()].sort((a,b)=>a.entry_hash.localeCompare(b.entry_hash)),pages=[...state.pages,{checked_at:page.checked_at}],complete=raw.next_cursor==='',nextState=!complete&&pages.length>=20?'LIMIT_REACHED':complete?'COMPLETE':'RUNNING',nextError=nextState==='LIMIT_REACHED'?'LIMIT_REACHED':null,nextAttempt=finished+(complete?900:nextError?3600:60),report=reportFor({...run,duplicate_entries:duplicateEntries},pages,rows,finished);
  if(encoder.encode(JSON.stringify(report)).byteLength>1032192)fail('LIMIT_REACHED');
  const writes=[];
  for(const row of page.rows)writes.push(db.prepare('INSERT INTO finance_pending_income_rows(scan_id,entry_hash,order_hash,payload) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM finance_pending_income_scans WHERE '+guard+') ON CONFLICT(scan_id,entry_hash) DO NOTHING').bind(run.scan_id,row.entry_hash,row.order_hash,JSON.stringify(row),...args(finished)));
  writes.push(db.prepare('INSERT INTO finance_pending_income_pages(scan_id,page_index,request_cursor_hash,next_cursor_hash,page_hash,entry_hashes,row_count,checked_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM finance_pending_income_scans WHERE '+guard+')').bind(run.scan_id,pages.length,requestHash,nextHash,pageHash,JSON.stringify(page.rows.map(row=>row.entry_hash)),page.rows.length,page.checked_at,...args(finished)));
  writes.push(db.prepare('UPDATE finance_pending_income_scans SET revision=revision+1,state=?,updated_at=?,completed_at=?,pages_read=?,duplicate_entries=?,next_cursor=?,next_attempt_at=?,error=?,lease_owner=NULL,lease_until=NULL WHERE '+guard).bind(nextState,finished,complete?finished:null,pages.length,duplicateEntries,raw.next_cursor,nextAttempt,nextError,...args(finished)));
  if(complete)writes.push(db.prepare('INSERT INTO finance_pending_income_publication(id,scan_id,published_at,payload) SELECT 1,?,?,? WHERE changes()=1 ON CONFLICT(id) DO UPDATE SET scan_id=excluded.scan_id,published_at=excluded.published_at,payload=excluded.payload').bind(run.scan_id,finished,JSON.stringify(report)));
  await db.batch(writes);
 }catch(error){
  const finished=clock(),code=classify(error),terminal=['REPEATED_CURSOR','REPEATED_PAGE','EMPTY_CONTINUATION','SCAN_EXPIRED'].includes(code),nextState=code==='LIMIT_REACHED'?'LIMIT_REACHED':terminal?'ERROR':'RETRY_WAIT';
  await db.prepare('UPDATE finance_pending_income_scans SET revision=revision+1,state=?,updated_at=?,completed_at=NULL,next_attempt_at=?,error=?,lease_owner=NULL,lease_until=NULL WHERE '+guard).bind(nextState,finished,finished+(code==='LIMIT_REACHED'?3600:terminal?900:300),code,...args(finished)).run();
 }finally{
  await db.prepare('UPDATE finance_pending_income_scans SET lease_owner=NULL,lease_until=NULL WHERE scan_id=? AND lease_owner=?').bind(run.scan_id,owner).run();
 }
 return (await readState(db,clock())).frame;
}
