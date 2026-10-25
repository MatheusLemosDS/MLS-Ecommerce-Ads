import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';

// A publication owns its financial frame copies. It never points at the active
// collector's replaceable slot rows and never stores the App's computed
// production, tax, advertising or expense total. References are priced on read.
export const BUSINESS_MONTH_PUBLICATION_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_month_publications(month TEXT PRIMARY KEY NOT NULL,source_revision INTEGER NOT NULL,source_created_at INTEGER NOT NULL,source_updated_at INTEGER NOT NULL,published_at INTEGER NOT NULL,write_token TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=8192))`,
 `CREATE TABLE IF NOT EXISTS business_month_publication_frames(month TEXT NOT NULL,slot_index INTEGER NOT NULL CHECK(slot_index BETWEEN 0 AND 2),write_token TEXT NOT NULL,run_id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=1048576),PRIMARY KEY(month,slot_index))`,
];
export class BusinessMonthPublicationError extends Error{constructor(code){super(code);this.status=503;}}
const fail=()=>{throw new BusinessMonthPublicationError('BUSINESS_MONTH_PUBLICATION_STORAGE_INVALID');};
const encoder=new TextEncoder(),plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const array=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function stampAt(now){let value;try{value=now();}catch{fail();}if(!integer(value,1,9999999999999))fail();return Math.floor(value/1000);}
const today=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
function range(month,payload,stamp){
 if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2000-01'||month>today(stamp).slice(0,7)||!exact(payload,['start_date','end_date','slots'])||payload.start_date!==month+'-01'||!date(payload.end_date)||payload.end_date.slice(0,7)!==month||payload.end_date>today(stamp)||!array(payload.slots,3))return null;
 const end=Number(payload.end_date.slice(8)),count=Math.ceil(end/15);if(payload.slots.length!==count)return null;
 return payload.slots.map((_,index)=>({start_date:month+'-'+String(index*15+1).padStart(2,'0'),end_date:month+'-'+String(Math.min(end,index*15+15)).padStart(2,'0')}));
}
function completedPayload(month,payload,stamp){
 const expected=range(month,payload,stamp);if(!expected)return null;const seen=new Set(),slots=[];
 for(let index=0;index<expected.length;index++){const slot=payload.slots[index];if(!exact(slot,['start_date','end_date','frame'])||slot.start_date!==expected[index].start_date||slot.end_date!==expected[index].end_date)return null;
  const frame=projectBusinessPeriodFrame(slot.frame);if(!frame||frame.status!=='COMPLETE'||frame.start_date!==slot.start_date||frame.end_date!==slot.end_date||frame.checked_at>stamp+60||seen.has(frame.run_id))return null;
  const raw=JSON.stringify(frame);if(encoder.encode(raw).byteLength>1048576)return null;seen.add(frame.run_id);slots.push({...expected[index],frame});
 }
 return {start_date:payload.start_date,end_date:payload.end_date,slots};
}
const reference=frame=>({schema:'business_month_publication_frame_ref_v1',run_id:frame.run_id,revision:frame.revision});
const compact=payload=>({start_date:payload.start_date,end_date:payload.end_date,slots:payload.slots.map(slot=>({start_date:slot.start_date,end_date:slot.end_date,frame:reference(slot.frame)}))});
function sourceMatches(raw,payload){
 let source;try{source=JSON.parse(raw);}catch{return false;}if(!exact(source,['start_date','end_date','slots'])||source.start_date!==payload.start_date||source.end_date!==payload.end_date||!array(source.slots,3)||source.slots.length!==payload.slots.length)return false;
 return source.slots.every((slot,index)=>{const observed=payload.slots[index];if(!exact(slot,['start_date','end_date','frame'])||slot.start_date!==observed.start_date||slot.end_date!==observed.end_date)return false;
  if(exact(slot.frame,['schema','run_id','revision'])&&slot.frame.schema==='business_month_frame_ref_v1')return slot.frame.run_id===observed.frame.run_id&&slot.frame.revision===observed.frame.revision;
  const inline=projectBusinessPeriodFrame(slot.frame);return inline!==null&&same(inline,observed.frame);
 });
}
function dbOf(env){const db=env?.ADMIN_DB;if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')fail();return db;}
function bundle(row,storedPayload,payload,published_at){return {row,storedPayload,payload,complete:true,publication:{source_revision:row.revision,published_at}};}

function publicationPlan(db,month,observed,now){
 if(typeof db?.prepare!=='function')fail();const stamp=stampAt(now),row=observed?.row;if(observed?.complete!==true||!exact(row,['revision','payload','created_at','updated_at'])||!integer(row.revision,1,2147483647)||typeof row.payload!=='string'||!integer(row.created_at,1,stamp+60)||!integer(row.updated_at,row.created_at,stamp+60))return null;
 const payload=completedPayload(month,observed.payload,stamp);if(!payload||!sourceMatches(row.payload,payload))return null;
 const storedPayload=compact(payload),raw=JSON.stringify(storedPayload),token=crypto.randomUUID();if(encoder.encode(raw).byteLength>8192)return null;
 const active='EXISTS(SELECT 1 FROM business_month_runs WHERE month=? AND revision=? AND payload=?)',activeArgs=[month,row.revision,row.payload];
 const writes=[db.prepare('INSERT INTO business_month_publications(month,source_revision,source_created_at,source_updated_at,published_at,write_token,payload) SELECT ?,?,?,?,?,?,? WHERE '+active+' ON CONFLICT(month) DO UPDATE SET source_revision=excluded.source_revision,source_created_at=excluded.source_created_at,source_updated_at=excluded.source_updated_at,published_at=excluded.published_at,write_token=excluded.write_token,payload=excluded.payload WHERE business_month_publications.source_revision<excluded.source_revision AND json_extract(business_month_publications.payload,\'$.end_date\')<=json_extract(excluded.payload,\'$.end_date\')').bind(month,row.revision,row.created_at,row.updated_at,stamp,token,raw,...activeArgs)];
 const published='EXISTS(SELECT 1 FROM business_month_publications WHERE month=? AND source_revision=? AND write_token=?)',publishedArgs=[month,row.revision,token];
 for(let index=0;index<payload.slots.length;index++){const frame=payload.slots[index].frame;writes.push(db.prepare('INSERT INTO business_month_publication_frames(month,slot_index,write_token,run_id,revision,payload) SELECT ?,?,?,?,?,? WHERE '+published+' ON CONFLICT(month,slot_index) DO UPDATE SET write_token=excluded.write_token,run_id=excluded.run_id,revision=excluded.revision,payload=excluded.payload').bind(month,index,token,frame.run_id,frame.revision,JSON.stringify(frame),...publishedArgs));}
 writes.push(db.prepare('DELETE FROM business_month_publication_frames WHERE month=? AND slot_index>=? AND '+published).bind(month,payload.slots.length,...publishedArgs));
 return {writes,value:bundle({revision:row.revision,payload:raw,created_at:row.created_at,updated_at:row.updated_at},storedPayload,payload,stamp)};
}

// Zero RPCs. The collector can append these statements to its existing atomic
// parent/frame update (after it), or prepend them before resetting a complete
// run. The same exact revision/payload CAS governs the combined transaction.
export function completedBusinessMonthPublicationStatements(db,month,observed,{now=()=>Date.now()}={}){
 return publicationPlan(db,month,observed,now)?.writes??[];
}

// Exactly one D1 binding RPC. Header publication and copied frames either win
// the same active-run CAS together or leave the previous publication intact.
export async function saveCompletedBusinessMonth(env,month,observed,{now=()=>Date.now()}={}){
 const db=dbOf(env),plan=publicationPlan(db,month,observed,now);if(!plan)return null;
 const result=await db.batch(plan.writes);if(result?.[0]?.meta?.changes!==1)return null;
 if(plan.value.payload.slots.some((_,index)=>result[index+1]?.meta?.changes!==1))fail();
 return plan.value;
}

// One consistent read snapshot; no active collector rows, provider calls,
// pricing references or freshness-based erasure of a completed publication.
export async function readCompletedBusinessMonth(env,month,{now=()=>Date.now()}={}){
 const stamp=stampAt(now),db=dbOf(env);if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2000-01'||month>today(stamp).slice(0,7))return null;
 const snapshot=await db.batch([db.prepare('SELECT source_revision,source_created_at,source_updated_at,published_at,write_token,payload FROM business_month_publications WHERE month=?').bind(month),db.prepare('SELECT slot_index,write_token,run_id,revision,payload FROM business_month_publication_frames WHERE month=? ORDER BY slot_index').bind(month)]),header=snapshot?.[0]?.results?.[0],frames=snapshot?.[1]?.results;
 if(!header){if(!Array.isArray(frames)||frames.length)fail();return null;}
 if(!integer(header.source_revision,1,2147483647)||!integer(header.source_created_at,1,stamp+60)||!integer(header.source_updated_at,header.source_created_at,stamp+60)||!integer(header.published_at,1,stamp+60)||typeof header.write_token!=='string'||!/^[a-f0-9-]{36}$/.test(header.write_token)||typeof header.payload!=='string'||encoder.encode(header.payload).byteLength>8192||!Array.isArray(frames)||frames.length>3)fail();
 let storedPayload;try{storedPayload=JSON.parse(header.payload);}catch{fail();}const expected=range(month,storedPayload,stamp);if(!expected||frames.length!==expected.length)fail();
 const slots=storedPayload.slots.map((slot,index)=>{const stored=frames[index];if(!exact(slot,['start_date','end_date','frame'])||slot.start_date!==expected[index].start_date||slot.end_date!==expected[index].end_date||!exact(slot.frame,['schema','run_id','revision'])||slot.frame.schema!=='business_month_publication_frame_ref_v1'||stored.slot_index!==index||stored.write_token!==header.write_token||stored.run_id!==slot.frame.run_id||stored.revision!==slot.frame.revision||typeof stored.payload!=='string'||encoder.encode(stored.payload).byteLength>1048576)fail();let frame;try{frame=JSON.parse(stored.payload);}catch{fail();}if(frame?.run_id!==stored.run_id||frame?.revision!==stored.revision)fail();return {...expected[index],frame};});
 const payload=completedPayload(month,{start_date:storedPayload.start_date,end_date:storedPayload.end_date,slots},stamp);if(!payload)fail();
 return bundle({revision:header.source_revision,payload:header.payload,created_at:header.source_created_at,updated_at:header.source_updated_at},storedPayload,payload,header.published_at);
}
