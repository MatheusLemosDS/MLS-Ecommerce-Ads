// A continuation offer is scheduling metadata, never financial approval. The
// existing monthly runner validates the complete publication/source again.
export const BUSINESS_HISTORY_CONTINUATION_COOLDOWN_SECONDS=900;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(key=>Object.hasOwn(v,key));
const integer=(v,min=0,max=9999999999)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export function businessHistoryContinuationQuery(month){
 const date=new Date(month+'-01T12:00:00Z');date.setUTCDate(0);const prior=date.toISOString().slice(0,7);
 // Parent references are already bounded to8KiB. Project only finite source
 // metadata: never aggregate the three up-to1MiB financial frames into a cell.
 return {args:[prior],sql:`(SELECT CASE WHEN json_valid(r.payload) AND length(CAST(r.payload AS BLOB))<=8192 THEN json_object('month',r.month,'revision',r.revision,'created_at',r.created_at,'updated_at',r.updated_at,'parent',r.payload,'published_revision',p.source_revision,'published_at',p.published_at,'history_status',h.status,'history_next',h.next_run_at,'history_attempt',h.last_attempt_at,'history_failures',h.failure_count,'history_error',h.last_error,'next_work',(SELECT next_work FROM business_history_sync_fairness WHERE id=1),'last_background_revision',(SELECT last_background_revision FROM business_history_sync_fairness WHERE id=1),'frames',json((SELECT json_group_array(json_object('slot_index',f.slot_index,'run_id',f.run_id,'revision',f.revision,'schema',CASE WHEN json_valid(f.payload) THEN json_extract(f.payload,'$.schema') END,'status',CASE WHEN json_valid(f.payload) THEN json_extract(f.payload,'$.status') END,'start_date',CASE WHEN json_valid(f.payload) THEN json_extract(f.payload,'$.start_date') END,'end_date',CASE WHEN json_valid(f.payload) THEN json_extract(f.payload,'$.end_date') END,'checked_at',CASE WHEN json_valid(f.payload) THEN json_extract(f.payload,'$.checked_at') END,'cutoff_at',CASE WHEN json_valid(f.payload) THEN json_extract(f.payload,'$.cutoff_at') END)) FROM business_month_frames f WHERE f.month=r.month))) END FROM business_month_runs r JOIN business_month_publications p ON p.month=r.month JOIN business_history_sync_state h ON h.month=r.month WHERE r.month=?)`};
}
export function projectBusinessHistoryContinuation(raw,{month,stamp,admission=false,backgroundRevision=null}={}){
 try{
  if(typeof raw!=='string')return null;const v=JSON.parse(raw),keys=['month','revision','created_at','updated_at','parent','published_revision','published_at','history_status','history_next','history_attempt','history_failures','history_error','next_work','last_background_revision','frames'];
  const parentRaw=v?.parent;if(typeof parentRaw!=='string'||new TextEncoder().encode(parentRaw).byteLength>8192)return null;v.parent=JSON.parse(parentRaw);
  if(!exact(v,keys)||typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!integer(stamp,1))return null;
  const last=new Date(month+'-01T12:00:00Z');last.setUTCDate(0);const end=last.toISOString().slice(0,10),prior=end.slice(0,7),slots=Math.ceil(Number(end.slice(8))/15);
  if(v.month!==prior||!integer(v.revision,2,2147483647)||!integer(v.published_revision,1,v.revision-1)||!integer(v.published_at,1,stamp)||!integer(v.created_at,v.published_at,stamp)||!integer(v.updated_at,v.created_at,stamp+5)||!['RUNNING','ERROR'].includes(v.history_status)||!integer(v.history_next)||!integer(v.history_attempt,1,stamp+5)||!integer(v.history_failures,0,1000000)||v.history_status==='RUNNING'&&(v.history_failures!==0||v.history_error!==null)||v.history_status==='ERROR'&&(v.history_failures<1||!['BUSINESS_HISTORY_COLLECTION_UNAVAILABLE','BUSINESS_HISTORY_RESULT_INVALID'].includes(v.history_error))||!exact(v.parent,['start_date','end_date','slots'])||v.parent.start_date!==prior+'-01'||v.parent.end_date!==end||!Array.isArray(v.parent.slots)||v.parent.slots.length!==slots||!Array.isArray(v.frames)||v.frames.length>slots)return null;
  if(v.next_work===null?v.last_background_revision!==null:!['MONTHLY','AUXILIARY'].includes(v.next_work)||!integer(v.last_background_revision,1,2147483646))return null;
  const frames=new Map(),ids=new Set();let pending=false,references=0;
  for(const f of v.frames){if(!exact(f,['slot_index','run_id','revision','schema','status','start_date','end_date','checked_at','cutoff_at'])||!integer(f.slot_index,0,slots-1)||frames.has(f.slot_index)||!uuid(f.run_id)||ids.has(f.run_id)||!integer(f.revision,1,2147483647)||f.schema!=='finance_business_period_v1'||!['RUNNING','COMPLETE'].includes(f.status)||!integer(f.cutoff_at,1,stamp+5)||!integer(f.checked_at,f.cutoff_at,stamp+5))return null;frames.set(f.slot_index,f);ids.add(f.run_id);}
  for(const [index,slot] of v.parent.slots.entries()){
   const begin=prior+'-'+String(index*15+1).padStart(2,'0'),finish=prior+'-'+String(Math.min(index*15+15,Number(end.slice(8)))).padStart(2,'0');if(!exact(slot,['start_date','end_date','frame'])||slot.start_date!==begin||slot.end_date!==finish)return null;
   if(slot.frame===null){if(frames.has(index))return null;pending=true;continue;}
   const f=frames.get(index),ref=slot.frame;references++;if(!exact(ref,['schema','run_id','revision'])||ref.schema!=='business_month_frame_ref_v1'||!f||ref.run_id!==f.run_id||ref.revision!==f.revision||f.start_date!==begin||f.end_date!==finish)return null;if(f.status==='RUNNING')pending=true;
  }
  if(!pending||references!==frames.size)return null;
  if(admission&&(v.history_next>stamp||v.history_attempt>stamp-BUSINESS_HISTORY_CONTINUATION_COOLDOWN_SECONDS||v.next_work==='AUXILIARY'||!integer(backgroundRevision,1,2147483646)||v.last_background_revision!==null&&v.last_background_revision>=backgroundRevision))return null;
  return {month:prior,parent_revision:v.revision,parent_payload:parentRaw,published_revision:v.published_revision};
 }catch{return null;}
}
