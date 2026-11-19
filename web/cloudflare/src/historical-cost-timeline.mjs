// The estimator's historical sale-date cost policy. Source rows come from the
// existing append-only *_audit tables. No financial or physical fact is written.
//
// Grouped day-of-creation reports cannot separate orders on the same day as
// an edit, so such a day is deliberately UNKNOWN (never silently repriced).
const brDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'});
const validDay=value=>typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const isoDay=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?brDay.format(new Date(value)):null;
const safe=value=>value>=0n&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;

/**
 * Reject missing/corrupt audit history instead of assigning today's price to
 * an earlier date. D1 callers must fetch in ascending revision with LIMIT 513:
 * >128 rows means incomplete evidence, never a partially valid timeline.
 */
export function checkedCostAudit(rows,current){
 if(!Array.isArray(rows)||!rows.length||rows.length>128||!current||!Number.isSafeInteger(current.revision)||typeof current.payload!=='string')return null;
 let previousAt=0;
 for(let index=0;index<rows.length;index++){
  const row=rows[index],at=Date.parse(row?.created_at??'');
  if(!Number.isSafeInteger(row?.revision)||row.revision!==index+1||typeof row.payload!=='string'||row.payload.length>131072||!Number.isFinite(at)||at<previousAt)return null;
  previousAt=at;
 }
 const last=rows.at(-1);
 if(last.revision!==current.revision||last.payload!==current.payload||last.created_at!==current.updated_at)return null;
 return rows.map(row=>({revision:row.revision,payload:row.payload,updated_at:row.created_at,day:isoDay(row.created_at)}));
}

/**
 * Returns an audit snapshot applicable for a day or null if there is no
 * proven prior revision or an edit occurred during that calendar day.
 * The latter is ambiguous because the historical source groups quantities
 * by day rather than individual order timestamps.
 */
export function costAuditBeforeDay(rows,day){
 if(!validDay(day)||!Array.isArray(rows)||!rows.length)return null;
 let selected=null;
 for(const row of rows){
  if(!validDay(row?.day))return null;
  if(row.day===day)return null;
  if(row.day<day)selected=row;
 }
 return selected;
}

export function historicalDayCosts(items,pricing){
 if(!Array.isArray(items)||typeof pricing!=='function')return null;
 let total=0n,known=0n,pending=0n,amount=0n;
 for(const item of items){
  if(!item||typeof item.item_id!=='string'||typeof item.model_id!=='string'||!Number.isSafeInteger(item.quantity)||item.quantity<1)return null;
  const count=BigInt(item.quantity);
  total+=count;
  const price=pricing(item.item_id,item.model_id);
  if(price===null||price===undefined){pending+=count;continue;}
  if(!Number.isSafeInteger(price)||price<1||price>1000000)return null;
  known+=count;
  amount+=count*BigInt(price);
 }
 const total_units=safe(total),known_units=safe(known),pending_units=safe(pending),known_production_cost_cents=safe(amount);
 if([total_units,known_units,pending_units,known_production_cost_cents].some(value=>value===null))return null;
 return {total_units,known_units,pending_units,known_production_cost_cents,production_cost_cents:pending_units===0?known_production_cost_cents:null};
}
