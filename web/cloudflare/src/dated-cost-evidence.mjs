import {TenantInitializationMap} from './tenant-storage.mjs';
import {projectHistoricalVariantEvidenceFrame,historicalVariantEvidenceRequestMatches} from '../../finance/src/historical-variant-evidence-frame.mjs';
import {deriveHistoricalCompositionConsensus} from './historical-cost-evidence.mjs';

// This store is deliberately independent of the legacy, mutable union of
// names. Only a new complete scan owns its pages, scope and review history.
export const DATED_COST_EVIDENCE_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS dated_cost_scans(scan_id TEXT PRIMARY KEY,month TEXT NOT NULL,end_date TEXT NOT NULL,item_ids TEXT NOT NULL,shop_id INTEGER NOT NULL,started_at INTEGER NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,window_index INTEGER NOT NULL,cursor TEXT,pages_read INTEGER NOT NULL,lease_token TEXT,lease_until INTEGER,last_error TEXT,updated_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS dated_cost_pages(scan_id TEXT NOT NULL,page_index INTEGER NOT NULL,window_index INTEGER NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=65536),sha256 TEXT NOT NULL,previous_sha256 TEXT,created_at INTEGER NOT NULL,PRIMARY KEY(scan_id,page_index))`,
 `CREATE TABLE IF NOT EXISTS dated_cost_publications(scan_id TEXT PRIMARY KEY,sha256 TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=1048576),created_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS dated_cost_reviews(scan_id TEXT NOT NULL,revision INTEGER NOT NULL,publication_sha256 TEXT NOT NULL,decision TEXT NOT NULL CHECK(decision IN ('APPROVE','WITHDRAW')),actor TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(scan_id,revision))`,
 `CREATE UNIQUE INDEX IF NOT EXISTS dated_cost_scans_running_scope ON dated_cost_scans(month,end_date,item_ids,shop_id) WHERE status='RUNNING'`,
 `CREATE TRIGGER IF NOT EXISTS dated_cost_scans_scope_no_update BEFORE UPDATE OF scan_id,month,end_date,item_ids,shop_id,started_at ON dated_cost_scans BEGIN SELECT RAISE(ABORT,'DATED_COST_IMMUTABLE'); END`,
 `CREATE TRIGGER IF NOT EXISTS dated_cost_scans_no_delete BEFORE DELETE ON dated_cost_scans BEGIN SELECT RAISE(ABORT,'DATED_COST_IMMUTABLE'); END`,
 ...['dated_cost_pages','dated_cost_publications','dated_cost_reviews'].flatMap(table=>['UPDATE','DELETE'].map(action=>`CREATE TRIGGER IF NOT EXISTS ${table}_no_${action.toLowerCase()} BEFORE ${action} ON ${table} BEGIN SELECT RAISE(ABORT,'DATED_COST_IMMUTABLE'); END`)),
];
export class DatedCostEvidenceError extends Error{constructor(code,status=503){super('DATED_COST_'+code);this.status=status;}}
const fail=(code,status)=>{throw new DatedCostEvidenceError(code,status);};
const ready=new TenantInitializationMap(),encoder=new TextEncoder(),MAX_PAGES=128,MAX_PAIRS=3000,snapshots=new WeakMap();
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const id=(value,zero=false)=>typeof value==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const exact=(value,keys)=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const array=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,i)=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,String(i))||{},'value')).every(Boolean);
const compare=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),pair=row=>row.item_id+':'+row.model_id;
const day=value=>typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const today=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
function clock(now){let at;try{at=now();}catch{fail('CLOCK_INVALID');}if(!integer(at,1,9999999999999))fail('CLOCK_INVALID');return Math.floor(at/1000);}
function scope(input,stamp){
 if(!input||typeof input.month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.month)||!day(input.end_date)||input.end_date.slice(0,7)!==input.month||input.end_date>today(stamp))fail('REQUEST_INVALID',400);
 return {month:input.month,end_date:input.end_date};
}
const windows=end=>Array.from({length:Math.ceil(Number(end.slice(8))/15)},(_,index)=>({start_date:end.slice(0,7)+'-'+String(index*15+1).padStart(2,'0'),end_date:end.slice(0,7)+'-'+String(Math.min(Number(end.slice(8)),index*15+15)).padStart(2,'0')}));
function database(value){const db=value?.ADMIN_DB??value;if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')fail('STORAGE_UNAVAILABLE');return db;}
async function setup(env){const db=database(env);if(!ready.has(db))ready.set(db,db.batch(DATED_COST_EVIDENCE_SCHEMA.map(sql=>db.prepare(sql))).catch(()=>{ready.delete(db);fail('STORAGE_UNAVAILABLE');}));await ready.get(db);return db;}
function checkedScan(raw,stamp){
 if(!raw||!uuid(raw.scan_id)||!integer(raw.shop_id,1)||!integer(raw.started_at,1,stamp+60)||!integer(raw.updated_at,raw.started_at,stamp+60)||!integer(raw.revision,1,2147483646)||!integer(raw.pages_read,0,MAX_PAGES)||!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(raw.status)||!integer(raw.window_index,0,3)||raw.lease_token!==null&&!uuid(raw.lease_token)||raw.lease_until!==null&&!integer(raw.lease_until,1,9999999999)||raw.cursor!==null&&(typeof raw.cursor!=='string'||raw.cursor.length<1||raw.cursor.length>1024))fail('STORAGE_INVALID');
 scope(raw,stamp);let ids;try{ids=JSON.parse(raw.item_ids);}catch{fail('STORAGE_INVALID');}if(!array(ids,5)||!ids.length||!ids.every(value=>id(value))||new Set(ids).size!==ids.length||!same(ids,[...ids].sort(compare)))fail('STORAGE_INVALID');
 const count=windows(raw.end_date).length;if(raw.window_index>count||raw.status==='COMPLETE'&&(raw.window_index!==count||raw.cursor!==null)||raw.status==='RUNNING'&&raw.window_index>=count)fail('STORAGE_INVALID');return {...raw,item_ids:ids};
}
const summary=row=>({scan_id:row.scan_id,month:row.month,end_date:row.end_date,item_ids:row.item_ids,status:row.status,revision:row.revision,pages_read:row.pages_read,window_index:row.window_index,windows_total:windows(row.end_date).length,updated_at:row.updated_at,last_error:row.last_error});
async function scanById(db,scanId,stamp){const raw=await db.prepare('SELECT * FROM dated_cost_scans WHERE scan_id=?').bind(scanId).first();if(!raw)fail('NOT_FOUND',404);return checkedScan(raw,stamp);}

export async function startDatedCostScan(env,input,{now=()=>Date.now()}={}){
 const stamp=clock(now);if(!exact(input,['month','end_date','item_ids'])||!array(input.item_ids,5)||!input.item_ids.length||!input.item_ids.every(value=>id(value))||new Set(input.item_ids).size!==input.item_ids.length)fail('REQUEST_INVALID',400);
 const selected=scope(input,stamp),item_ids=[...input.item_ids].sort(compare),shop_id=env?.COMMERCIAL_CONTEXT?.profile?.shop_id??1178167501;if(!integer(shop_id,1))fail('CONFIGURATION');const db=await setup(env),rawIds=JSON.stringify(item_ids);
 const existing=(await db.prepare("SELECT * FROM dated_cost_scans WHERE month=? AND end_date=? AND item_ids=? AND shop_id=? AND status='RUNNING' ORDER BY started_at DESC,scan_id LIMIT 1").bind(selected.month,selected.end_date,rawIds,shop_id).first());if(existing)return summary(checkedScan(existing,stamp));
 const scan_id=crypto.randomUUID(),write=await db.prepare("INSERT OR IGNORE INTO dated_cost_scans(scan_id,month,end_date,item_ids,shop_id,started_at,revision,status,window_index,cursor,pages_read,updated_at) VALUES(?,?,?,?,?,?,1,'RUNNING',0,NULL,0,?)").bind(scan_id,selected.month,selected.end_date,rawIds,shop_id,stamp,stamp).run();
 if(write?.meta?.changes!==1){const current=await db.prepare("SELECT * FROM dated_cost_scans WHERE month=? AND end_date=? AND item_ids=? AND shop_id=? AND status='RUNNING' LIMIT 1").bind(selected.month,selected.end_date,rawIds,shop_id).first();if(!current)fail('REVISION_CONFLICT',409);return summary(checkedScan(current,stamp));}return summary(await scanById(db,scan_id,stamp));
}

// Replay retained pages from the initial cursor. A previous mutable RUNNING
// scan, a global approved flag or names from today's catalogue never enter.
async function replay(scan,rows,stamp){
 if(!array(rows,MAX_PAGES))fail('STORAGE_INVALID');const bounds=windows(scan.end_date),observations=new Map(),manifest=[];let window_index=0,cursor=null,previous=null;const cursors=new Set();
 for(let index=0;index<rows.length;index++){
  const row=rows[index];if(row.scan_id!==scan.scan_id||row.page_index!==index||row.window_index!==window_index||!digest(row.sha256)||row.previous_sha256!==previous||typeof row.payload!=='string'||!integer(row.created_at,scan.started_at,stamp+60)||await hash(row.payload)!==row.sha256||!bounds[window_index])fail('STORAGE_INVALID');
  let value;try{value=JSON.parse(row.payload);}catch{fail('STORAGE_INVALID');}const frame=projectHistoricalVariantEvidenceFrame(value,{shop_id:scan.shop_id}),request={...bounds[window_index],item_ids:scan.item_ids,cursor};
  if(!frame||!frame.evidence_complete||!historicalVariantEvidenceRequestMatches(request,frame)||frame.checked_at<scan.started_at-60||frame.checked_at>row.created_at+60||cursors.has(window_index+':'+String(cursor)))fail('STORAGE_INVALID');cursors.add(window_index+':'+String(cursor));
  for(const product of frame.products)for(const variant of product.variants){
   const key=product.item_id+':'+variant.model_id;let found=observations.get(key);if(!found){if(observations.size>=MAX_PAIRS)fail('LIMIT_REACHED');found={item_id:product.item_id,model_id:variant.model_id,item_names:[],model_names:[],missing_item_name:false,missing_model_name:false,conflict:false,overflow:false};observations.set(key,found);}
   for(const field of ['item_names','model_names'])for(const name of variant[field])if(!found[field].includes(name)){if(found[field].length===5)found.overflow=true;else found[field].push(name);}
   found.missing_item_name ||= variant.missing_item_name_lines>0;found.missing_model_name ||= variant.missing_model_name_lines>0;found.conflict=found.item_names.length>1||found.model_names.length>1||found.overflow;
  }
  manifest.push({page_index:index,window_index,sha256:row.sha256,previous_sha256:previous});previous=row.sha256;
  if(frame.has_more){if(cursors.has(window_index+':'+frame.next_cursor))fail('CURSOR_LOOP');cursor=frame.next_cursor;}else{window_index++;cursor=null;}
 }
 const names=[...observations.values()].sort((a,b)=>compare(a.item_id,b.item_id)||compare(a.model_id,b.model_id)).map(row=>({...row,item_names:row.item_names.sort(),model_names:row.model_names.sort()}));return {window_index,cursor,manifest,names};
}

export async function stepDatedCostScan(env,input,getPage,{now=()=>Date.now(),canRun=async()=>true,backgroundLease=null}={}){
 let stamp=clock(now);if(!exact(input,['scan_id','revision'])||!uuid(input.scan_id)||!integer(input.revision,1,2147483646)||typeof getPage!=='function'||typeof canRun!=='function'||backgroundLease!==null&&(!exact(backgroundLease,['token','revision'])||!uuid(backgroundLease.token)||!integer(backgroundLease.revision,1,2147483646)))fail('REQUEST_INVALID',400);const db=await setup(env);let scan=await scanById(db,input.scan_id,stamp);
 if(scan.shop_id!==(env?.COMMERCIAL_CONTEXT?.profile?.shop_id??1178167501))fail('SCOPE_MISMATCH',403);if(scan.revision!==input.revision)fail('REVISION_CONFLICT',409);if(scan.status!=='RUNNING'||!await canRun())return summary(scan);if(scan.lease_until>stamp)fail('BUSY',409);
 const token=crypto.randomUUID(),lease=await db.prepare("UPDATE dated_cost_scans SET lease_token=?,lease_until=? WHERE scan_id=? AND revision=? AND status='RUNNING' AND (lease_until IS NULL OR lease_until<=?)").bind(token,stamp+120,scan.scan_id,scan.revision,stamp).run();if(lease?.meta?.changes!==1)fail('BUSY',409);
 try{
  const past=(await db.prepare('SELECT * FROM dated_cost_pages WHERE scan_id=? ORDER BY page_index LIMIT 129').bind(scan.scan_id).all()).results,prior=await replay(scan,past,stamp);if(past.length!==scan.pages_read||prior.window_index!==scan.window_index||prior.cursor!==scan.cursor)fail('STORAGE_INVALID');
  if(scan.pages_read>=MAX_PAGES)fail('LIMIT_REACHED');if(!await canRun())return summary(scan);
  const request={...windows(scan.end_date)[scan.window_index],item_ids:scan.item_ids,cursor:scan.cursor};
  // Exactly one source invocation in this step; retries never loop providers.
  const raw=await getPage(request);stamp=clock(now);if(!await canRun())return summary(scan);const frame=projectHistoricalVariantEvidenceFrame(raw,{shop_id:scan.shop_id});
  if(!frame||!frame.evidence_complete||!historicalVariantEvidenceRequestMatches(request,frame)||frame.checked_at>stamp+60||frame.checked_at<stamp-900)fail('SOURCE_INVALID');
  const payload=JSON.stringify(frame),sha256=await hash(payload),page={scan_id:scan.scan_id,page_index:scan.pages_read,window_index:scan.window_index,payload,sha256,previous_sha256:past.at(-1)?.sha256??null,created_at:stamp},next=await replay(scan,[...past,page],stamp),complete=next.window_index===windows(scan.end_date).length;
  let publication=null;if(complete){publication=JSON.stringify({schema:'dated_cost_publication_v1',scan_id:scan.scan_id,shop_id:scan.shop_id,month:scan.month,start_date:scan.month+'-01',end_date:scan.end_date,item_ids:scan.item_ids,started_at:scan.started_at,completed_at:stamp,pages:next.manifest,names:next.names});if(encoder.encode(publication).byteLength>1048576)fail('LIMIT_REACHED');}
  const publicationHash=publication?await hash(publication):null;if(!await canRun())return summary(scan);const commitStamp=clock(now);if(commitStamp>stamp+60)fail('CLOCK_INVALID');
  // A shared provider turn is checked inside this transaction as well as by
  // canRun. A pause/replaced lease between the final read and commit cannot
  // retain even the first page, nor publish a supposedly complete scan.
  const backgroundSql=backgroundLease?' AND EXISTS(SELECT 1 FROM background_collection_lane_state WHERE id=1 AND revision=? AND lease_token=? AND lease_until>?) AND EXISTS(SELECT 1 FROM business_sync_state WHERE id=1 AND enabled=1)':'',backgroundArgs=backgroundLease?[backgroundLease.revision,backgroundLease.token,commitStamp]:[],guard="EXISTS(SELECT 1 FROM dated_cost_scans WHERE scan_id=? AND revision=? AND lease_token=? AND lease_until>=?)"+backgroundSql,args=[scan.scan_id,scan.revision,token,commitStamp,...backgroundArgs],writes=[db.prepare('INSERT INTO dated_cost_pages(scan_id,page_index,window_index,payload,sha256,previous_sha256,created_at) SELECT ?,?,?,?,?,?,? WHERE '+guard).bind(page.scan_id,page.page_index,page.window_index,payload,sha256,page.previous_sha256,stamp,...args)];
  if(publication)writes.push(db.prepare('INSERT INTO dated_cost_publications(scan_id,sha256,payload,created_at) SELECT ?,?,?,? WHERE '+guard).bind(scan.scan_id,publicationHash,publication,stamp,...args));
  writes.push(db.prepare('UPDATE dated_cost_scans SET revision=revision+1,status=?,window_index=?,cursor=?,pages_read=pages_read+1,lease_token=NULL,lease_until=NULL,last_error=NULL,updated_at=? WHERE scan_id=? AND revision=? AND lease_token=? AND lease_until>=?'+backgroundSql).bind(complete?'COMPLETE':'RUNNING',next.window_index,next.cursor,commitStamp,...args));
  const results=await db.batch(writes);if(results.some(row=>row?.meta?.changes!==1))fail('REVISION_CONFLICT',409);return summary(await scanById(db,scan.scan_id,commitStamp));
 }catch(error){const limited=error instanceof DatedCostEvidenceError&&error.message==='DATED_COST_LIMIT_REACHED';await db.prepare('UPDATE dated_cost_scans SET status=?,last_error=?,updated_at=? WHERE scan_id=? AND revision=? AND lease_token=?').bind(limited?'LIMIT_REACHED':'RUNNING',limited?'LIMIT_REACHED':'SOURCE_OR_STORAGE_UNAVAILABLE',stamp,scan.scan_id,scan.revision,token).run();throw error instanceof DatedCostEvidenceError?error:new DatedCostEvidenceError('SOURCE_UNAVAILABLE');}
 finally{await db.prepare('UPDATE dated_cost_scans SET lease_token=NULL,lease_until=NULL WHERE scan_id=? AND lease_token=?').bind(scan.scan_id,token).run();}
}

function namesOf(row){
 if(!exact(row,['item_id','model_id','item_names','model_names','missing_item_name','missing_model_name','conflict','overflow'])||!id(row.item_id)||!id(row.model_id,true))fail('STORAGE_INVALID');const names=Object.fromEntries(['item_names','model_names','missing_item_name','missing_model_name','conflict','overflow'].map(field=>[field,row[field]]));
 // The existing strict projector rederives every supported alternative. A
 // conflict remains reviewable evidence, but cannot supply a guessed identity.
 const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&encoder.encode(value).byteLength<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);
 const resolution=deriveHistoricalCompositionConsensus(names);if(!array(row.item_names,5)||!array(row.model_names,5)||!row.item_names.every(value=>text(value,1024))||!row.model_names.every(value=>text(value,512))||new Set(row.item_names).size!==row.item_names.length||new Set(row.model_names).size!==row.model_names.length||!['missing_item_name','missing_model_name','conflict','overflow'].every(field=>typeof row[field]==='boolean')||!row.conflict&&(row.item_names.length>1||row.model_names.length>1||row.overflow))fail('STORAGE_INVALID');return {names,resolution};
}
async function publicationOf(raw,stamp){
 if(!raw||!digest(raw.sha256)||typeof raw.payload!=='string'||encoder.encode(raw.payload).byteLength>1048576||await hash(raw.payload)!==raw.sha256||!integer(raw.created_at,1,stamp+60))fail('STORAGE_INVALID');let value;try{value=JSON.parse(raw.payload);}catch{fail('STORAGE_INVALID');}
 if(!exact(value,['schema','scan_id','shop_id','month','start_date','end_date','item_ids','started_at','completed_at','pages','names'])||value.schema!=='dated_cost_publication_v1'||!uuid(value.scan_id)||value.scan_id!==raw.scan_id||!integer(value.shop_id,1)||value.start_date!==value.month+'-01'||!integer(value.started_at,1,stamp+60)||!integer(value.completed_at,value.started_at,stamp+60)||value.completed_at!==raw.created_at||!array(value.item_ids,5)||!value.item_ids.length||!value.item_ids.every(value=>id(value))||new Set(value.item_ids).size!==value.item_ids.length||!array(value.pages,MAX_PAGES)||!value.pages.length||!array(value.names,MAX_PAIRS))fail('STORAGE_INVALID');scope(value,stamp);
 let previous=null,lastWindow=0;for(let index=0;index<value.pages.length;index++){const row=value.pages[index];if(!exact(row,['page_index','window_index','sha256','previous_sha256'])||row.page_index!==index||!integer(row.window_index,lastWindow,Math.min(lastWindow+1,windows(value.end_date).length-1))||index===0&&row.window_index!==0||!digest(row.sha256)||row.previous_sha256!==previous)fail('STORAGE_INVALID');lastWindow=row.window_index;previous=row.sha256;}if(lastWindow!==windows(value.end_date).length-1)fail('STORAGE_INVALID');
 const seen=new Set();for(const row of value.names){if(!value.item_ids.includes(row.item_id)||seen.has(pair(row)))fail('STORAGE_INVALID');seen.add(pair(row));namesOf(row);}return value;
}
// SELECT only, even on a cold database. No provider, DDL, grants or approvals.
async function publications(db,selected,stamp,shop_id=1178167501){
 if(!integer(shop_id,1))fail('CONFIGURATION');let rows;try{rows=(await db.prepare('SELECT p.*,r.revision AS review_revision,r.publication_sha256,r.decision,r.created_at AS reviewed_at FROM dated_cost_publications p JOIN dated_cost_scans s ON s.scan_id=p.scan_id LEFT JOIN dated_cost_reviews r ON r.scan_id=p.scan_id AND r.revision=(SELECT MAX(x.revision) FROM dated_cost_reviews x WHERE x.scan_id=p.scan_id) WHERE s.month=? AND s.end_date=? AND s.shop_id=? AND s.status=\'COMPLETE\' ORDER BY p.created_at,p.scan_id LIMIT 129').bind(selected.month,selected.end_date,shop_id).all()).results;}catch{ return {state:'UNAVAILABLE',publications:[]};}
 if(!array(rows,128))fail('LIMIT_REACHED');const output=[];for(const row of rows){const value=await publicationOf(row,stamp);if(value.month!==selected.month||value.end_date!==selected.end_date||value.shop_id!==shop_id||row.review_revision!==null&&(!integer(row.review_revision,1,2147483646)||row.publication_sha256!==row.sha256||!['APPROVE','WITHDRAW'].includes(row.decision)||!integer(row.reviewed_at,value.completed_at,stamp+60)))fail('STORAGE_INVALID');output.push({row,value});}return {state:'AVAILABLE',publications:output};
}
export async function readDatedCostEvidence(env,input,{now=()=>Date.now()}={}){
 const stamp=clock(now);if(!exact(input,['month','end_date']))fail('REQUEST_INVALID',400);const selected=scope(input,stamp),db=database(env),shop_id=env?.COMMERCIAL_CONTEXT?.profile?.shop_id??1178167501,stored=await publications(db,selected,stamp,shop_id);let scans=[];try{scans=(await db.prepare('SELECT * FROM dated_cost_scans WHERE month=? AND end_date=? AND shop_id=? ORDER BY started_at DESC,scan_id LIMIT 129').bind(selected.month,selected.end_date,shop_id).all()).results;}catch{return {schema:'dated_cost_evidence_v1',...selected,state:'UNAVAILABLE',checked_at:stamp,scans:[],publications:[]};}if(!array(scans,128))fail('LIMIT_REACHED');
 return {schema:'dated_cost_evidence_v1',...selected,state:stored.state,checked_at:stamp,scans:scans.map(row=>summary(checkedScan(row,stamp))),publications:stored.publications.map(({row,value})=>({scan_id:value.scan_id,publication_sha256:row.sha256,revision:row.review_revision??0,decision:row.decision??'PROPOSED',completed_at:value.completed_at,reviewed_at:row.reviewed_at??null,pages_read:value.pages.length,pairs:value.names.map(observation=>({item_id:observation.item_id,model_id:observation.model_id,...namesOf(observation)}))}))};
}
export async function reviewDatedCostEvidence(env,input,actor,{now=()=>Date.now()}={}){
 const stamp=clock(now);if(!exact(input,['scan_id','revision','publication_sha256','decision'])||!uuid(input.scan_id)||!integer(input.revision,0,2147483645)||!digest(input.publication_sha256)||!['APPROVE','WITHDRAW'].includes(input.decision)||typeof actor!=='string'||!actor.trim()||encoder.encode(actor).byteLength>256||/[\u0000-\u001f\u007f]/.test(actor))fail('REQUEST_INVALID',400);const db=await setup(env),raw=await db.prepare('SELECT * FROM dated_cost_publications WHERE scan_id=?').bind(input.scan_id).first();if(!raw)fail('NOT_FOUND',404);const value=await publicationOf(raw,stamp);if(value.shop_id!==(env?.COMMERCIAL_CONTEXT?.profile?.shop_id??1178167501))fail('SCOPE_MISMATCH',403);if(raw.sha256!==input.publication_sha256)fail('REVISION_CONFLICT',409);if(stamp<value.completed_at)fail('CLOCK_INVALID');
 const write=await db.prepare("INSERT INTO dated_cost_reviews(scan_id,revision,publication_sha256,decision,actor,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM dated_cost_publications WHERE scan_id=? AND sha256=?) AND COALESCE((SELECT MAX(revision) FROM dated_cost_reviews WHERE scan_id=?),0)=?").bind(value.scan_id,input.revision+1,raw.sha256,input.decision,actor,stamp,value.scan_id,raw.sha256,value.scan_id,input.revision).run();if(write?.meta?.changes!==1)fail('REVISION_CONFLICT',409);return {scan_id:value.scan_id,revision:input.revision+1,publication_sha256:raw.sha256,decision:input.decision,reviewed_at:stamp};
}
export async function readApprovedDatedCostIdentitySnapshot(db,input){
 const {stamp,items}=input||{};if(!integer(stamp,1,9999999999)||!array(items,3000)||!items.every(row=>id(row?.item_id)&&id(row?.model_id,true))||new Set(items.map(pair)).size!==items.length)fail('REQUEST_INVALID',400);const selected=scope(input,stamp);
 const stored=await publications(database(db),selected,stamp,input.shop_id??1178167501),requested=new Set(items.map(pair)),observed=new Map(),conflicts=new Set(),proofs=[];
 for(const {row,value} of stored.publications){if(row.decision!=='APPROVE')continue;proofs.push({scan_id:value.scan_id,publication_sha256:row.sha256,review_revision:row.review_revision,reviewed_at:row.reviewed_at});for(const observation of value.names){const key=pair(observation);if(!requested.has(key))continue;const checked=namesOf(observation);if(checked.resolution.kind==='CONFLICT'){conflicts.add(key);continue;}const prior=observed.get(key);if(prior&&!same(prior.names,checked.names))conflicts.add(key);else observed.set(key,{...observation,checked_at:value.completed_at});}}
 for(const key of conflicts)observed.delete(key);
 const result=Object.freeze({schema:'approved_dated_cost_identity_v1',state:stored.state,...selected,checked_at:stamp,approved_pairs:observed.size,conflicting_pairs:conflicts.size,publications:proofs.map(row=>Object.freeze(row))});snapshots.set(result,{...selected,stamp,requested,observations:[...observed.values()]});return result;
}
// A WeakMap capability prevents callers from supplying a claimed approved flag
// or identity array. Only the SELECT-and-hash-validated store read mints it.
export function datedCostIdentityForSchedule(snapshot,{month,end_date,items,stamp}){
 const value=snapshots.get(snapshot);if(!value||month!==value.month||end_date!==value.end_date||stamp!==value.stamp||!array(items,3000)||items.length!==value.requested.size||items.some(row=>!value.requested.has(pair(row))))return null;
 return [{results:[{historical_cost_evidence_revision:1}]},{results:value.observations.map(row=>({item_id:row.item_id,model_id:row.model_id,payload:JSON.stringify(Object.fromEntries(['item_names','model_names','missing_item_name','missing_model_name','conflict','overflow'].map(field=>[field,row[field]]))),approved:1,first_checked_at:row.checked_at,last_checked_at:row.checked_at}))}];
}
