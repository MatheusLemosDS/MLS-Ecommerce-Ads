import {readCompletedBusinessMonth} from './business-month-publication.mjs';
import {readApprovedDatedCostIdentitySnapshot,datedCostIdentityForSchedule,DatedCostEvidenceError} from './dated-cost-evidence.mjs';

// A separate historical selector. Current catalogue recognition is useful for
// today's reference, but is not proof of an old order's exact identity.
export async function readDatedCostCandidates(env,input,{now=()=>Date.now()}={}){
 let at;try{at=now();}catch{at=null;}const today=Number.isSafeInteger(at)&&at>0?new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(at)):null;
 if(!today||!input||Object.keys(input).length!==1||typeof input.month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.month)||input.month>today.slice(0,7))throw new DatedCostEvidenceError('REQUEST_INVALID',400);
 const result={state:'UNAVAILABLE',month:input.month,end_date:null,source_revision:null,item_ids:[],scan:null,pending_pairs:null,pending_units:null,reason:'SOURCE_MISSING'};
 let publication;try{publication=await readCompletedBusinessMonth(env,input.month,{now:()=>at});}catch{return {...result,reason:'SOURCE_INVALID'};}if(!publication)return result;
 const quantities=new Map();let total=0n;
 for(const slot of publication.payload.slots)for(const row of slot.frame.items){const key=row.item_id+':'+row.model_id,old=quantities.get(key);quantities.set(key,{item_id:row.item_id,model_id:row.model_id,quantity:(old?.quantity??0n)+BigInt(row.quantity)});total+=BigInt(row.quantity);}
 if(total>BigInt(Number.MAX_SAFE_INTEGER)||quantities.size>3000)return {...result,reason:'SOURCE_LIMIT'};
 const items=[...quantities.values()].map(row=>({...row,quantity:Number(row.quantity)})),end_date=publication.payload.end_date,stamp=Math.floor(at/1000),shop_id=env?.COMMERCIAL_CONTEXT?.profile?.shop_id??1178167501;let identity;
 try{identity=await readApprovedDatedCostIdentitySnapshot(env.ADMIN_DB,{month:input.month,end_date,items,stamp,shop_id});}catch{return {...result,end_date,source_revision:publication.publication.source_revision,reason:'EVIDENCE_INVALID'};}
 const proof=datedCostIdentityForSchedule(identity,{month:input.month,end_date,items,stamp}),approved=new Set((proof?.[1]?.results??[]).map(row=>row.item_id+':'+row.model_id)),byItem=new Map();let pendingPairs=0,pendingUnits=0;
 for(const row of items){if(approved.has(row.item_id+':'+row.model_id))continue;pendingPairs++;pendingUnits+=row.quantity;byItem.set(row.item_id,(byItem.get(row.item_id)||0)+row.quantity);}
 let scans=[];try{scans=(await env.ADMIN_DB.prepare('SELECT scan_id,revision,status,item_ids,started_at FROM dated_cost_scans WHERE month=? AND end_date=? AND shop_id=? ORDER BY started_at,scan_id LIMIT 129').bind(input.month,end_date,shop_id).all()).results;}catch{/* Cold storage is initialized only by an explicit scan start. */}
 if(!Array.isArray(scans)||scans.length>128)return {...result,end_date,reason:'EVIDENCE_LIMIT_REACHED'};
 const blocked=new Set();let running=null;
 for(const scan of scans){let ids;try{ids=JSON.parse(scan.item_ids);}catch{return {...result,end_date,reason:'EVIDENCE_INVALID'};}if(!Array.isArray(ids)||ids.length>5||!ids.every(id=>typeof id==='string'&&/^[1-9][0-9]{0,19}$/.test(id))||!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(scan.status))return {...result,end_date,reason:'EVIDENCE_INVALID'};
  if(scan.status==='RUNNING'&&!running)running={scan_id:scan.scan_id,revision:scan.revision,item_ids:ids};else if(scan.status!=='RUNNING')for(const id of ids)blocked.add(id);
 }
 const item_ids=running?.item_ids??[...byItem].filter(([id])=>!blocked.has(id)).sort((a,b)=>b[1]-a[1]||a[0].length-b[0].length||a[0].localeCompare(b[0])).slice(0,5).map(([id])=>id);
 return {state:'AVAILABLE',month:input.month,end_date,source_revision:publication.publication.source_revision,item_ids,scan:running?{scan_id:running.scan_id,revision:running.revision}:null,pending_pairs:pendingPairs,pending_units:pendingUnits,reason:identity.state==='UNAVAILABLE'?'EVIDENCE_STORAGE_UNAVAILABLE':pendingPairs?(item_ids.length?'DATED_IDENTITY_PENDING':scans.some(row=>row.status==='LIMIT_REACHED')?'EVIDENCE_LIMIT_REACHED':'REVIEW_REQUIRED'):null};
}
