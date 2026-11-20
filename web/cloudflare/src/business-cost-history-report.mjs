import {BusinessMonthError} from './business-month.mjs';
import {readCompletedBusinessMonth} from './business-month-publication.mjs';
import {readHistoricalCostSchedule} from './business-cost-history.mjs';

export const BUSINESS_COST_HISTORY_CONTRACT='business-cost-history-v1';
const basis='HISTORICAL_AUDITED_COSTS_PAID_CREATE_DATE';
const brDay=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value));
const safe=value=>value>=0n&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
const reasons=new Set(['REQUEST_INVALID','AUDIT_UNAVAILABLE','AUDIT_INVALID','SOURCE_INVALID','ARITHMETIC_UNSAFE']);

// A separate, explicitly negotiated reference. The legacy monthly/products,
// daily and weekly DTOs retain their current-registered-cost policy. This read
// neither initializes storage nor modifies a publication, financial closing,
// manufacturing ledger or any current cost configuration.
export async function readBusinessCostHistoryReport(env,input,{now=()=>Date.now()}={}){
 let at;try{at=now();}catch{at=null;}
 if(!Number.isSafeInteger(at)||at<1||at>9999999999999||!input||Object.keys(input).length!==1||typeof input.month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(input.month)||input.month>brDay(at).slice(0,7))throw new BusinessMonthError('BUSINESS_COST_HISTORY_REQUEST_INVALID',400);
 const month=input.month,stamp=Math.floor(at/1000),db=env?.ADMIN_DB;
 const result={schema:'business_cost_history_v1',month,checked_at:stamp,currency:'BRL',basis,scope:'REGISTERED_COST_REFERENCE_NOT_MANUFACTURE_COGS_OR_SETTLEMENT',state:'UNAVAILABLE',source:null,audit_scope:null,coverage:{total_units:null,known_units:null,pending_units:null,pending_variants:null},production_cost_cents:null,known_production_cost_cents:null,days:[],day_evidence:[],mixed_variants:null,pending:[]};
 const unavailable=reason=>({...result,state:'UNAVAILABLE',pending:[reason]});
 if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')return unavailable('STORAGE_UNAVAILABLE');
 let publication;
 try{publication=await readCompletedBusinessMonth(env,month,{now:()=>at});}catch{return unavailable('SOURCE_INVALID');}
 if(!publication)return unavailable('SOURCE_MISSING');
 const frames=publication.payload.slots.map(slot=>slot.frame),quantities=new Map();let units=0n;
 for(const frame of frames)for(const item of frame.items){
  const key=item.item_id+':'+item.model_id,old=quantities.get(key),quantity=BigInt(old?.quantity??0)+BigInt(item.quantity);
  if(safe(quantity)===null)return unavailable('ARITHMETIC_UNSAFE');
  quantities.set(key,{item_id:item.item_id,model_id:item.model_id,quantity:Number(quantity)});units+=BigInt(item.quantity);
 }
 if(safe(units)===null)return unavailable('ARITHMETIC_UNSAFE');
 const financeTimes=frames.every(frame=>frame.source_checked_at)?{oldest_at:Math.min(...frames.map(frame=>frame.source_checked_at.oldest_at)),latest_at:Math.max(...frames.map(frame=>frame.source_checked_at.latest_at))}:null;
 result.source={start_date:publication.payload.start_date,end_date:publication.payload.end_date,publication_revision:publication.publication.source_revision,published_at:publication.publication.published_at,source_updated_at:publication.row.updated_at,finance_checked_at:financeTimes};
 result.coverage.total_units=Number(units);
 let snapshot;
 try{snapshot=await db.batch(['production_costs_state','production_cost_rules_state','variant_bindings_state'].map(table=>db.prepare('SELECT revision,payload,updated_at FROM '+table+' WHERE id=1')));}catch{return unavailable('AUDIT_UNAVAILABLE');}
 if(!Array.isArray(snapshot)||snapshot.length!==3||snapshot.some(row=>!Array.isArray(row?.results)||row.results.length!==1))return unavailable('AUDIT_UNAVAILABLE');
 let history;
 try{history=await readHistoricalCostSchedule(db,{month,stamp,frames,items:[...quantities.values()],current:{costs:snapshot[0].results[0],rules:snapshot[1].results[0],bindings:snapshot[2].results[0]}});}catch{return unavailable('AUDIT_INVALID');}
 if(history?.state!=='AVAILABLE')return unavailable(reasons.has(history?.reason)?history.reason:'AUDIT_INVALID');
 let total=0n,known=0n,pending=0n,cost=0n;
 for(const row of history.days){total+=BigInt(row.total_units);known+=BigInt(row.known_units);pending+=BigInt(row.pending_units);cost+=BigInt(row.known_production_cost_cents);}
 if(total!==units||known+pending!==units||safe(known)===null||safe(pending)===null||safe(cost)===null||Number(cost)!==history.known_production_cost_cents)return unavailable('SOURCE_INVALID');
 const calendarEnd=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10),expectedEnd=month===brDay(at).slice(0,7)?brDay(at):calendarEnd;
 const flags=[];
 if(result.source.end_date!==expectedEnd)flags.push('PERIOD_INCOMPLETE');
 if(pending>0n)flags.push('PRODUCTION_COST_INCOMPLETE');
 result.state=flags.length?'PARTIAL':'COMPLETE';result.pending=flags;
 result.audit_scope=history.audit_scope;
 result.coverage={total_units:Number(total),known_units:Number(known),pending_units:Number(pending),pending_variants:history.unmapped_variants.length};
 result.production_cost_cents=flags.length?null:history.production_cost_cents;
 result.known_production_cost_cents=history.known_production_cost_cents;
 result.days=history.days;result.day_evidence=history.day_evidence;result.mixed_variants=history.mixed_variants;
 return result;
}
