import {projectHistoricalVariantEvidenceFrame,historicalVariantEvidenceRequestMatches} from '../../finance/src/historical-variant-evidence-frame.mjs';

// These are name observations, never sold quantities, prices or catalogue links.
// A new pair is approved only after every creation-date window has been read.
export const HISTORICAL_COST_EVIDENCE_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS historical_cost_evidence_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,write_token TEXT)`,
 `INSERT OR IGNORE INTO historical_cost_evidence_state(id,revision) VALUES(1,1)`,
 `CREATE TABLE IF NOT EXISTS historical_cost_evidence_runs(scope_key TEXT PRIMARY KEY,month TEXT NOT NULL,item_ids TEXT NOT NULL,end_date TEXT NOT NULL,run_id TEXT NOT NULL,revision INTEGER NOT NULL,status TEXT NOT NULL,window_index INTEGER NOT NULL,cursor TEXT,pages_read INTEGER NOT NULL,next_run_at INTEGER NOT NULL,failure_count INTEGER NOT NULL,last_error TEXT,last_attempt_at INTEGER,last_success_at INTEGER,lease_owner TEXT,lease_until INTEGER)`,
 `CREATE TABLE IF NOT EXISTS historical_cost_evidence_names(item_id TEXT NOT NULL,model_id TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=8192),approved INTEGER NOT NULL,first_checked_at INTEGER NOT NULL,last_checked_at INTEGER NOT NULL,PRIMARY KEY(item_id,model_id))`,
 `CREATE TABLE IF NOT EXISTS historical_cost_evidence_members(run_id TEXT NOT NULL,item_id TEXT NOT NULL,model_id TEXT NOT NULL,PRIMARY KEY(run_id,item_id,model_id))`,
 `CREATE TABLE IF NOT EXISTS historical_cost_evidence_cursors(run_id TEXT NOT NULL,window_index INTEGER NOT NULL,cursor_hash TEXT NOT NULL,PRIMARY KEY(run_id,window_index,cursor_hash))`,
];
export class HistoricalCostEvidenceError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const fail=(code,status=503)=>{throw new HistoricalCostEvidenceError(code,status);};
const ready=new WeakMap(),encoder=new TextEncoder(),MAX_PAGES=600;
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const array=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(field=>field&&Object.hasOwn(field,'value'));
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const id=(value,zero=false)=>typeof value==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(value);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&encoder.encode(value).byteLength<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);
const compare=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
const day=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
function epoch(now){let value;try{value=now();}catch{fail('HISTORICAL_COST_EVIDENCE_CLOCK_INVALID');}if(!integer(value,1,9999999999999))fail('HISTORICAL_COST_EVIDENCE_CLOCK_INVALID');return Math.floor(value/1000);}
function selection(input,stamp){
 if(!exact(input,['month','item_ids'])||typeof input.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)||input.month<'2000-01'||input.month>day(stamp).slice(0,7)||!array(input.item_ids,5)||!input.item_ids.length||!input.item_ids.every(value=>id(value))||new Set(input.item_ids).size!==input.item_ids.length)fail('HISTORICAL_COST_EVIDENCE_REQUEST_INVALID',400);
 const item_ids=[...input.item_ids].sort(compare),month=input.month,end_date=month===day(stamp).slice(0,7)?day(stamp):new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);
 return {month,item_ids,end_date};
}
const windows=end=>Array.from({length:Math.ceil(Number(end.slice(8))/15)},(_,index)=>({start_date:end.slice(0,7)+'-'+String(index*15+1).padStart(2,'0'),end_date:end.slice(0,7)+'-'+String(Math.min(Number(end.slice(8)),index*15+15)).padStart(2,'0')}));
async function setup(env){const db=env?.ADMIN_DB;if(!db?.prepare||!db?.batch)fail('HISTORICAL_COST_EVIDENCE_CONFIGURATION');if(!ready.has(db))ready.set(db,db.batch(HISTORICAL_COST_EVIDENCE_SCHEMA.map(sql=>db.prepare(sql))).catch(()=>{ready.delete(db);fail('HISTORICAL_COST_EVIDENCE_STORAGE_UNAVAILABLE');}));await ready.get(db);return db;}

function namesPayload(raw){
 let value;try{value=typeof raw==='string'?JSON.parse(raw):raw;}catch{fail('HISTORICAL_COST_EVIDENCE_STORAGE_INVALID');}
 if(!exact(value,['item_names','model_names','missing_item_name','missing_model_name','conflict','overflow'])||!array(value.item_names,5)||!value.item_names.every(row=>text(row,1024))||!array(value.model_names,5)||!value.model_names.every(row=>text(row,512))||new Set(value.item_names).size!==value.item_names.length||new Set(value.model_names).size!==value.model_names.length||!['missing_item_name','missing_model_name','conflict','overflow'].every(key=>typeof value[key]==='boolean')||!value.conflict&&(value.item_names.length>1||value.model_names.length>1||value.overflow))fail('HISTORICAL_COST_EVIDENCE_STORAGE_INVALID');
 return value;
}
function checkedObservation(row,stamp){
 if(!row||!id(row.item_id)||!id(row.model_id,true)||![0,1].includes(row.approved)||!integer(row.first_checked_at,1,stamp+60)||!integer(row.last_checked_at,row.first_checked_at,stamp+60)||typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>8192)fail('HISTORICAL_COST_EVIDENCE_STORAGE_INVALID');
 return {...row,names:namesPayload(row.payload)};
}
const normalize=value=>value.normalize('NFKD').replace(/\p{M}/gu,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const adultSizes=new Set(['P','M','G','GG','G1','G2','G3']),childSizes=new Set(['2','4','6','8','10','12','14','16']);

// Exact, narrow interpretation. A printed theme, a similar title or a lone
// numeric size never selects a garment family or supplies a second kit piece.
export function deriveHistoricalCostComposition(itemName,modelName){
 if(!text(itemName,1024)||!text(modelName,512))return null;
 const title=normalize(itemName),model=normalize(modelName),words=new Set(title.split(' ')),labels=model.split(' '),sizes=labels.filter(word=>adultSizes.has(word)),numbers=labels.filter(word=>/^\d+$/.test(word));
 const shirt=['CAMISETA','CAMISETAS'].some(word=>words.has(word)),forbidden=['CALCA','CALCAS','BAGGY','SHORT','SHORTS','BERMUDA','BERMUDAS','MOLETOM','MOLETONS','VESTIDO','BODY','REGATA','PET','PETS','CACHORRO','GATO','CANINO','FELINO','BONECA','BONECAS','PACK','PACOTE','LOTE','TRIO','FAMILIA'];
 if(!shirt||forbidden.some(word=>words.has(word)||labels.includes(word)))return null;
 const child=['INFANTIL','INFANTIS','KIDS','CRIANCA','CRIANCAS','INFANTO'].some(word=>words.has(word)),kit=['KIT','KITS','COMBO','COMBOS','CONJUNTO','CONJUNTOS','CASAL','CASAIS','DUPLA','PAR'].some(word=>words.has(word));
 const countNames={DUAS:2,DOIS:2,TRES:3,QUATRO:4,CINCO:5,SEIS:6,SETE:7,OITO:8,NOVE:9,DEZ:10,VINTE:20},counts=[...((title+' '+model).matchAll(/\b(\d+|DUAS|DOIS|TRES|QUATRO|CINCO|SEIS|SETE|OITO|NOVE|DEZ|VINTE)\s+(?:CAMISETAS?|PECAS?|UNIDADES?)\b/g))].map(match=>countNames[match[1]]??Number(match[1]));
 if(counts.some(count=>!Number.isSafeInteger(count)||count>=2&&(!kit||count!==2))||!kit&&words.has('CAMISETAS'))return null;
 const empty={size:null,male_size:null,female_size:null,child_size:null};
 if(child){
  if(kit||words.has('ADULTO')||words.has('ADULTA')||sizes.length||numbers.length!==1||!childSizes.has(numbers[0])||['ADULTO','ADULTA','PET','KIT','COMBO'].some(word=>labels.includes(word)))return null;
  return {kind:'CHILD_SINGLE',...empty,child_size:numbers[0]};
 }
 if(['BEBE','BEBES','BABY','JUVENIL'].some(word=>words.has(word)))return null;
 if(['INFANTIL','INFANTIS','KIDS','CRIANCA','CRIANCAS','BEBE','BEBES','INFANTO'].some(word=>labels.includes(word)))return null;
 if(kit){
  const explicitTitle=(words.has('CASAL')||words.has('CASAIS')||['MASCULINO','MASCULINA','HOMEM'].some(word=>words.has(word))&&['FEMININO','FEMININA','MULHER'].some(word=>words.has(word)))&&['KIT','KITS','COMBO','COMBOS','CONJUNTO','CONJUNTOS'].some(word=>words.has(word));
  if(!explicitTitle||sizes.length!==2||numbers.some(number=>number!=='2')||/\b[3-9]\s+(?:CAMISETAS?|PECAS?|UNIDADES?)\b/.test(title))return null;
  const male=[...model.matchAll(/\b(?:HOMEM|MASCULINO|MASCULINA|MASC)\s+(?:(?:TAMANHO|TAM)\s+)?(G[123]|GG|P|M|G)\b/g)],female=[...model.matchAll(/\b(?:MULHER|FEMININO|FEMININA|FEM)\s+(?:(?:TAMANHO|TAM)\s+)?(G[123]|GG|P|M|G)\b/g)];
  if(male.length!==1||female.length!==1)return null;
  return {kind:'EXPLICIT_COUPLE_KIT',...empty,male_size:male[0][1],female_size:female[0][1]};
 }
 if(sizes.length!==1||numbers.some(number=>childSizes.has(number))||/\b(?:2|3|4|5|6|7|8|9)\s+(?:CAMISETAS?|PECAS?|UNIDADES?)\b/.test(title))return null;
 return {kind:'ADULT_SINGLE',...empty,size:sizes[0]};
}
function observationComposition(row){
 const names=row.names;if(row.approved!==1||names.conflict||names.overflow||names.missing_item_name||names.missing_model_name||names.item_names.length!==1||names.model_names.length!==1)return null;
 const composition=deriveHistoricalCostComposition(names.item_names[0],names.model_names[0]);
 return composition?{item_id:row.item_id,model_id:row.model_id,...composition,provenance:'HISTORICAL_ORDER_EVIDENCE',checked_at:row.last_checked_at}:null;
}
export function historicalCostEvidenceSnapshotQueries(db,itemIds){
 if(!array(itemIds,3000)||!itemIds.every(value=>id(value)))fail('HISTORICAL_COST_EVIDENCE_REQUEST_INVALID',400);const ids=[...new Set(itemIds)],queries=[db.prepare('SELECT revision AS historical_cost_evidence_revision FROM historical_cost_evidence_state WHERE id=1')];
 for(let offset=0;offset<ids.length;offset+=90)queries.push(db.prepare('SELECT item_id,model_id,payload,approved,first_checked_at,last_checked_at FROM historical_cost_evidence_names WHERE item_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids.slice(offset,offset+90))));
 return queries;
}
export function historicalCostEvidenceFromSnapshot(snapshot,{now=()=>Date.now()}={}){
 const stamp=epoch(now),revision=snapshot?.[0]?.results?.[0]?.historical_cost_evidence_revision;if(!integer(revision,1,2147483646))fail('HISTORICAL_COST_EVIDENCE_STORAGE_INVALID');const seen=new Set(),compositions=[];
 for(const raw of snapshot.slice(1).flatMap(row=>row.results)){const row=checkedObservation(raw,stamp),key=row.item_id+':'+row.model_id;if(seen.has(key))fail('HISTORICAL_COST_EVIDENCE_STORAGE_INVALID');seen.add(key);const composition=observationComposition(row);if(composition)compositions.push(composition);}
 return {revision,compositions};
}

function checkedRun(row){
 if(!row||!integer(row.revision,1,2147483646)||!['RUNNING','COMPLETE','RETRY_WAIT','LIMIT_REACHED'].includes(row.status)||!integer(row.window_index,0,3)||!integer(row.pages_read,0,MAX_PAGES)||!integer(row.next_run_at,0,9999999999)||!integer(row.failure_count,0,1000000)||![null,'SOURCE_UNAVAILABLE','SOURCE_INVALID','PAGE_LIMIT'].includes(row.last_error)||[row.run_id,row.lease_owner].some(value=>value!==null&&(typeof value!=='string'||!/^[a-f0-9-]{36}$/.test(value)))||(row.lease_owner===null)!==(row.lease_until===null)||row.lease_until!==null&&!integer(row.lease_until,1,9999999999)||[row.last_attempt_at,row.last_success_at].some(value=>value!==null&&!integer(value,1,9999999999))||row.cursor!==null&&(typeof row.cursor!=='string'||!row.cursor.length||row.cursor.length>1024||/[^\x21-\x7e]/.test(row.cursor)))fail('HISTORICAL_COST_EVIDENCE_STORAGE_INVALID');
 return row;
}
async function scope(input,stamp){const value=selection(input,stamp);return {...value,key:await hash(JSON.stringify({month:value.month,item_ids:value.item_ids}))};}
const clipped=(value,max)=>{let output='';for(const character of value){if(encoder.encode(output+character).byteLength>max)break;output+=character;}return output;};
async function result(db,selected,stamp,work='IDLE'){
 const raw=await db.prepare('SELECT * FROM historical_cost_evidence_runs WHERE scope_key=?').bind(selected.key).first(),run=raw?checkedRun(raw):null,rows=(await db.prepare('SELECT item_id,model_id,payload,approved,first_checked_at,last_checked_at FROM historical_cost_evidence_names WHERE item_id IN (SELECT value FROM json_each(?)) ORDER BY length(item_id),item_id,length(model_id),model_id LIMIT 201').bind(JSON.stringify(selected.item_ids)).all()).results;
 const products=selected.item_ids.map(item_id=>({item_id,variants:[]})),byItem=new Map(products.map(row=>[row.item_id,row]));let truncated=rows.length>200;
 for(const raw of rows.slice(0,200)){const row=checkedObservation(raw,stamp),composition=observationComposition(row),n=row.names,reason=n.conflict||n.overflow?'CONFLICT':n.missing_item_name||n.missing_model_name?'NAMES_MISSING':row.approved!==1?'SCAN_INCOMPLETE':composition?'EVIDENCE_AVAILABLE':'COMPOSITION_PENDING';byItem.get(row.item_id).variants.push({model_id:row.model_id,item_name:n.item_names.length===1?clipped(n.item_names[0],256):null,model_name:n.model_names.length===1?clipped(n.model_names[0],128):null,source:'HISTORICAL_ORDER_EVIDENCE',approved:row.approved===1,reason,composition,first_checked_at:row.first_checked_at,last_checked_at:row.last_checked_at});}
 return {schema:'historical_cost_evidence_v1',month:selected.month,item_ids:[...selected.item_ids],checked_at:stamp,work,scan:run?{status:run.status,revision:run.revision,start_date:selected.month+'-01',end_date:run.end_date,windows_total:windows(run.end_date).length,window_index:run.window_index,pages_read:run.pages_read,retry_after_seconds:Math.min(1800,Math.max(0,run.next_run_at-stamp)),last_error:run.last_error,last_success_at:run.last_success_at,complete:run.status==='COMPLETE',running:run.lease_owner!==null&&run.lease_until>stamp}:{status:'NOT_STARTED',revision:0,start_date:selected.month+'-01',end_date:selected.end_date,windows_total:windows(selected.end_date).length,window_index:0,pages_read:0,retry_after_seconds:0,last_error:null,last_success_at:null,complete:false,running:false},products,truncated};
}
export async function readHistoricalCostEvidence(env,input,{now=()=>Date.now()}={}){const stamp=epoch(now),selected=await scope(input,stamp);return result(await setup(env),selected,stamp);}

function mergedNames(old,incoming){
 const initial=old?namesPayload(old):{item_names:[],model_names:[],missing_item_name:false,missing_model_name:false,conflict:false,overflow:false},items=[...new Set([...initial.item_names,...incoming.item_names])].sort(),models=[...new Set([...initial.model_names,...incoming.model_names])].sort();
 const value={item_names:items.slice(0,5),model_names:models.slice(0,5),missing_item_name:initial.missing_item_name||incoming.missing_item_name_lines>0,missing_model_name:initial.missing_model_name||incoming.missing_model_name_lines>0,conflict:initial.conflict||incoming.conflict||items.length>1||models.length>1,overflow:initial.overflow||items.length>5||models.length>5};if(value.overflow)value.conflict=true;return value;
}

export async function syncHistoricalCostEvidence(env,input,getPage,{now=()=>Date.now(),canRun=async()=>true}={}){
 if(typeof getPage!=='function'||typeof canRun!=='function')fail('HISTORICAL_COST_EVIDENCE_OPTIONS_INVALID',400);
 const stamp=epoch(now),selected=await scope(input,stamp),db=await setup(env);if(!await canRun())return result(db,selected,stamp,'PAUSED');
 await db.prepare("INSERT OR IGNORE INTO historical_cost_evidence_runs(scope_key,month,item_ids,end_date,run_id,revision,status,window_index,pages_read,next_run_at,failure_count) VALUES(?,?,?,?,?,1,'RUNNING',0,0,0,0)").bind(selected.key,selected.month,JSON.stringify(selected.item_ids),selected.end_date,crypto.randomUUID()).run();
 let state=checkedRun(await db.prepare('SELECT * FROM historical_cost_evidence_runs WHERE scope_key=?').bind(selected.key).first());
 if(state.status==='LIMIT_REACHED'||state.next_run_at>stamp)return result(db,selected,stamp,state.status==='RETRY_WAIT'?'RETRY_WAIT':'IDLE');
 // The caller supplies only still-unpriced products. A fresh completed scan
 // coalesces repeated clicks; after fifteen minutes another sold/deleted
 // variation can be discovered without waiting for the next local day.
 if(state.status==='COMPLETE'&&state.end_date===selected.end_date&&stamp-state.last_success_at<900)return result(db,selected,stamp,'COMPLETE');
 const reset=state.status==='COMPLETE',owner=crypto.randomUUID(),runId=reset?crypto.randomUUID():state.run_id,revision=state.revision+1;
 if(revision>=2147483646)fail('HISTORICAL_COST_EVIDENCE_REVISION_LIMIT');
 const claimed=await db.prepare("UPDATE historical_cost_evidence_runs SET revision=?,status='RUNNING',end_date=?,run_id=?,window_index=CASE WHEN ? THEN 0 ELSE window_index END,cursor=CASE WHEN ? THEN NULL ELSE cursor END,pages_read=CASE WHEN ? THEN 0 ELSE pages_read END,lease_owner=?,lease_until=?,last_attempt_at=? WHERE scope_key=? AND revision=? AND (lease_owner IS NULL OR lease_until<=?)").bind(revision,reset?selected.end_date:state.end_date,runId,Number(reset),Number(reset),Number(reset),owner,stamp+90,stamp,selected.key,state.revision,stamp).run();
 if(claimed.meta.changes!==1)return result(db,selected,stamp,'LEASED');
 state={...state,revision,run_id:runId,end_date:reset?selected.end_date:state.end_date,window_index:reset?0:state.window_index,cursor:reset?null:state.cursor,pages_read:reset?0:state.pages_read};
 const guard='scope_key=? AND revision=? AND lease_owner=? AND lease_until>?',args=finish=>[selected.key,revision,owner,finish];
 try{
  if(state.pages_read>=MAX_PAGES)fail('HISTORICAL_COST_EVIDENCE_PAGE_LIMIT');
  const parts=windows(state.end_date),window=parts[state.window_index];if(!window)fail('HISTORICAL_COST_EVIDENCE_SOURCE_INVALID');
  const request={...window,item_ids:[...selected.item_ids],cursor:state.cursor};let raw;try{raw=await getPage(env,request);}catch{fail('HISTORICAL_COST_EVIDENCE_SOURCE_UNAVAILABLE');}
  if(exact(raw,['schema','status','diagnostic'])&&raw.schema==='historical_variant_evidence_v1'&&raw.status==='UNAVAILABLE'&&exact(raw.diagnostic,['code','http'])&&typeof raw.diagnostic.code==='string'&&/^FINANCE_HISTORICAL_EVIDENCE_[A-Z_]{1,96}$/.test(raw.diagnostic.code)&&(raw.diagnostic.http===null||integer(raw.diagnostic.http,100,599)))fail('HISTORICAL_COST_EVIDENCE_SOURCE_UNAVAILABLE');
  const finish=epoch(now),frame=projectHistoricalVariantEvidenceFrame(raw);
  if(!frame||!frame.evidence_complete||!historicalVariantEvidenceRequestMatches(request,frame)||frame.checked_at<stamp-60||frame.checked_at>finish+60)fail('HISTORICAL_COST_EVIDENCE_SOURCE_INVALID');
  if(!await canRun()){await db.prepare('UPDATE historical_cost_evidence_runs SET lease_owner=NULL,lease_until=NULL WHERE '+guard).bind(...args(finish)).run();return result(db,selected,finish,'PAUSED');}
  const cursorHash=await hash(state.cursor??''),nextHash=frame.has_more?await hash(frame.next_cursor):null;
  if(nextHash&&await db.prepare('SELECT 1 AS found FROM historical_cost_evidence_cursors WHERE run_id=? AND window_index=? AND cursor_hash=?').bind(runId,state.window_index,nextHash).first())fail('HISTORICAL_COST_EVIDENCE_SOURCE_INVALID');
  const observations=frame.products.flatMap(product=>product.variants.map(variant=>({item_id:product.item_id,...variant}))),snapshot=await db.batch([db.prepare('SELECT revision FROM historical_cost_evidence_state WHERE id=1'),db.prepare('SELECT item_id,model_id,payload,approved,first_checked_at,last_checked_at FROM historical_cost_evidence_names WHERE item_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(selected.item_ids))]),globalRevision=snapshot[0]?.results?.[0]?.revision;
  if(!integer(globalRevision,1,2147483645))fail('HISTORICAL_COST_EVIDENCE_STORAGE_INVALID');
  const old=new Map(snapshot[1].results.map(row=>{const checked=checkedObservation(row,finish);return [row.item_id+':'+row.model_id,checked];}));
  const complete=!frame.has_more&&state.window_index===parts.length-1,nextWindow=frame.has_more?state.window_index:state.window_index+1,nextCursor=frame.has_more?frame.next_cursor:null,writes=[db.prepare('UPDATE historical_cost_evidence_state SET revision=revision+1,write_token=? WHERE id=1 AND revision=? AND EXISTS(SELECT 1 FROM historical_cost_evidence_runs WHERE '+guard+')').bind(owner,globalRevision,...args(finish))],publishedGuard=guard+' AND EXISTS(SELECT 1 FROM historical_cost_evidence_state WHERE id=1 AND revision=? AND write_token=?)',publishedArgs=()=>[...args(finish),globalRevision+1,owner];
  // Two independently scoped scans can see the same model. A global evidence
  // CAS prevents one of them from erasing a newly observed conflicting name.
  writes.push(db.prepare('DELETE FROM historical_cost_evidence_members WHERE run_id NOT IN (SELECT run_id FROM historical_cost_evidence_runs) AND EXISTS(SELECT 1 FROM historical_cost_evidence_runs WHERE '+publishedGuard+')').bind(...publishedArgs()));writes.push(db.prepare('DELETE FROM historical_cost_evidence_cursors WHERE run_id NOT IN (SELECT run_id FROM historical_cost_evidence_runs) AND EXISTS(SELECT 1 FROM historical_cost_evidence_runs WHERE '+publishedGuard+')').bind(...publishedArgs()));
  const records=observations.map(observation=>{const previous=old.get(observation.item_id+':'+observation.model_id);return {item_id:observation.item_id,model_id:observation.model_id,payload:JSON.stringify(mergedNames(previous?.payload,observation)),approved:previous?.approved??0,first_checked_at:previous?.first_checked_at??frame.checked_at,last_checked_at:frame.checked_at};});
  // One bounded JSON statement per page, rather than two queries per model.
  // This also keeps large accepted provider pages within the D1 query budget.
  if(records.length){const payload=JSON.stringify(records);writes.push(db.prepare("INSERT INTO historical_cost_evidence_names(item_id,model_id,payload,approved,first_checked_at,last_checked_at) SELECT json_extract(value,'$.item_id'),json_extract(value,'$.model_id'),json_extract(value,'$.payload'),json_extract(value,'$.approved'),json_extract(value,'$.first_checked_at'),json_extract(value,'$.last_checked_at') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM historical_cost_evidence_runs WHERE "+publishedGuard+") ON CONFLICT(item_id,model_id) DO UPDATE SET payload=excluded.payload,last_checked_at=MAX(historical_cost_evidence_names.last_checked_at,excluded.last_checked_at)").bind(payload,...publishedArgs()));writes.push(db.prepare("INSERT OR IGNORE INTO historical_cost_evidence_members(run_id,item_id,model_id) SELECT ?,json_extract(value,'$.item_id'),json_extract(value,'$.model_id') FROM json_each(?) WHERE EXISTS(SELECT 1 FROM historical_cost_evidence_runs WHERE "+publishedGuard+")").bind(runId,payload,...publishedArgs()));}
  writes.push(db.prepare('INSERT INTO historical_cost_evidence_cursors(run_id,window_index,cursor_hash) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM historical_cost_evidence_runs WHERE '+publishedGuard+')').bind(runId,state.window_index,cursorHash,...publishedArgs()));
  if(complete)writes.push(db.prepare('UPDATE historical_cost_evidence_names SET approved=1 WHERE approved=0 AND EXISTS(SELECT 1 FROM historical_cost_evidence_members m WHERE m.run_id=? AND m.item_id=historical_cost_evidence_names.item_id AND m.model_id=historical_cost_evidence_names.model_id) AND EXISTS(SELECT 1 FROM historical_cost_evidence_runs WHERE '+publishedGuard+')').bind(runId,...publishedArgs()));
  const classificationTable=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='catalog_classification_state'").first();
  if(classificationTable)writes.push(db.prepare('UPDATE catalog_classification_state SET revision=revision+1 WHERE id=1 AND revision<2147483646 AND EXISTS(SELECT 1 FROM historical_cost_evidence_runs WHERE '+publishedGuard+')').bind(...publishedArgs()));
  writes.push(db.prepare("UPDATE historical_cost_evidence_runs SET revision=revision+1,status=?,window_index=?,cursor=?,pages_read=pages_read+1,next_run_at=0,failure_count=0,last_error=NULL,last_success_at=?,lease_owner=NULL,lease_until=NULL WHERE "+publishedGuard).bind(complete?'COMPLETE':'RUNNING',nextWindow,nextCursor,frame.checked_at,...publishedArgs()));
  const committed=await db.batch(writes);if(committed.at(-1).meta.changes!==1)await db.prepare('UPDATE historical_cost_evidence_runs SET lease_owner=NULL,lease_until=NULL WHERE '+guard).bind(...args(finish)).run();return result(db,selected,finish,committed.at(-1).meta.changes===1?'PROGRESSED':'LEASED');
 }catch(error){
  const finish=epoch(now),limited=error instanceof HistoricalCostEvidenceError&&error.message==='HISTORICAL_COST_EVIDENCE_PAGE_LIMIT',invalid=error instanceof HistoricalCostEvidenceError&&error.message==='HISTORICAL_COST_EVIDENCE_SOURCE_INVALID',failure=Math.min(state.failure_count+1,1000000),reason=limited?'PAGE_LIMIT':invalid?'SOURCE_INVALID':'SOURCE_UNAVAILABLE';
  const saved=await db.prepare("UPDATE historical_cost_evidence_runs SET revision=revision+1,status=?,next_run_at=?,failure_count=?,last_error=?,lease_owner=NULL,lease_until=NULL WHERE "+guard).bind(limited?'LIMIT_REACHED':'RETRY_WAIT',finish+Math.min(1800,30*2**Math.min(failure-1,6)),failure,reason,...args(finish)).run();return result(db,selected,finish,saved.meta.changes===1?'ERROR':'LEASED');
 }
}
