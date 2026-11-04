import {projectIncurredProduction} from './incurred-production.mjs';

const zone='America/Sao_Paulo',encoder=new TextEncoder();
const civil=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const date=value=>typeof value==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const dayNumber=value=>new Date(value+'T12:00:00Z').getUTCDay();
const shift=(value,days)=>new Date(Date.parse(value+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
const canonical=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):Array.isArray(value)?value.map(canonical):value;
async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(canonical(value))))),byte=>byte.toString(16).padStart(2,'0')).join('');}
function closeAt(value){
 const target=Date.parse(value+'T13:00:00Z');let at=target;
 for(let i=0;i<4;i++){
  const p=Object.fromEntries(parts.formatToParts(new Date(at)).filter(row=>row.type!=='literal').map(row=>[row.type,Number(row.value)]));
  const observed=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second),difference=target-observed;
  if(difference===0)return at/1000;at+=difference;
 }
 throw Error('PRODUCTION_WEEKLY_TIMEZONE_INVALID');
}
export function productionWeeklyPeriod(end_date){
 if(!date(end_date)||dayNumber(end_date)!==5)throw Error('PRODUCTION_WEEKLY_PERIOD_INVALID');
 const start_date=shift(end_date,-7);
 return {start_date,end_date,start_at:closeAt(start_date),end_at:closeAt(end_date),timezone:zone};
}
export function productionWeeklyNextClose(stamp){
 if(!integer(stamp,1,9999999999))throw Error('PRODUCTION_WEEKLY_CLOCK_INVALID');
 const today=civil.format(new Date(stamp*1000));let end_date=shift(today,(5-dayNumber(today)+7)%7);
 if(closeAt(end_date)<=stamp)end_date=shift(end_date,7);
 return productionWeeklyPeriod(end_date);
}
export function productionWeeklyEndDates(month,stamp){
 const next=productionWeeklyNextClose(stamp),today=civil.format(new Date(stamp*1000));
 if(typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||month>today.slice(0,7))throw Error('PRODUCTION_WEEKLY_MONTH_INVALID');
 const first=month+'-01',last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0,12)).toISOString().slice(0,10),ends=[];
 for(let day=shift(first,(5-dayNumber(first)+7)%7);day<=last;day=shift(day,7))if(day<=next.end_date)ends.push(day);
 if(month===today.slice(0,7)&&next.end_date.slice(0,7)!==month)ends.push(next.end_date);
 return ends.reverse();
}
export function productionWeeklyAffectedEnds(produced_date){
 if(!date(produced_date))throw Error('PRODUCTION_WEEKLY_DATE_INVALID');
 return dayNumber(produced_date)===5?[produced_date,shift(produced_date,7)]:[shift(produced_date,(5-dayNumber(produced_date)+7)%7)];
}
export async function productionWeeklyRecordHash(record){return digest(record);}

// A boundary partition assigns the timing of existing pieces. It never records
// new manufacture, changes historical unit costs or infers production from sales.
const preparedSources=new WeakMap();
export async function prepareProductionWeeklySource(ledger,assignments){
 const frame=projectIncurredProduction(ledger);
 if(!frame||!Array.isArray(assignments)||assignments.length>1000)throw Error('PRODUCTION_WEEKLY_SOURCE_INVALID');
 const timing=new Map();
 for(const row of assignments){
  if(!row||typeof row!=='object'||timing.has(row.record_id)||typeof row.record_id!=='string'||typeof row.record_hash!=='string'||!/^[a-f0-9]{64}$/.test(row.record_hash)||!integer(row.before13_quantity,0,10000)||!integer(row.at_or_after13_quantity,0,10000))throw Error('PRODUCTION_WEEKLY_TIMING_INVALID');
  timing.set(row.record_id,{record_hash:row.record_hash,before13_quantity:row.before13_quantity,at_or_after13_quantity:row.at_or_after13_quantity});
 }
 const rows=[];for(const row of frame.records)if(row.status==='ACTIVE')rows.push({row,record_hash:await productionWeeklyRecordHash(row),ends:productionWeeklyAffectedEnds(row.produced_date)});
 const handle=Object.freeze({schema:'production_weekly_source_handle_v1'});preparedSources.set(handle,{frame,timing,rows});return handle;
}
export async function buildProductionWeeklyReport(ledger,assignments,end_date){return buildProductionWeeklyReportFromSource(await prepareProductionWeeklySource(ledger,assignments),end_date);}
export async function buildProductionWeeklyReportFromSource(handle,end_date){
 const source=preparedSources.get(handle);if(!source)throw Error('PRODUCTION_WEEKLY_SOURCE_INVALID');
 const {frame,timing,rows}=source,period=productionWeeklyPeriod(end_date);
 let active=0,quantity=0n,knownQuantity=0n,unknownQuantity=0n,pendingRecords=0,pendingQuantity=0n,known=0n;const evidence=[];
 for(const {row,record_hash,ends} of rows){
  if(!ends.includes(end_date))continue;let count=row.quantity;
  if(ends.length===2){
   const choice=timing.get(row.record_id);
   if(!choice||choice.record_hash!==record_hash||choice.before13_quantity+choice.at_or_after13_quantity!==row.quantity){pendingRecords++;pendingQuantity+=BigInt(row.quantity);evidence.push({record_id:row.record_id,record_hash,boundary:'UNKNOWN'});continue;}
   count=end_date===ends[0]?choice.before13_quantity:choice.at_or_after13_quantity;
  }
  if(count===0)continue;
  active++;quantity+=BigInt(count);evidence.push({record_id:row.record_id,record_hash,quantity:count});
  if(row.cost.state==='UNKNOWN')unknownQuantity+=BigInt(count);else{knownQuantity+=BigInt(count);known+=BigInt(count)*BigInt(row.cost.unit_cost_cents);}
 }
 if([quantity,knownQuantity,unknownQuantity,pendingQuantity,known].some(value=>value>BigInt(Number.MAX_SAFE_INTEGER)))throw Error('PRODUCTION_WEEKLY_LIMIT');
 const open=frame.checked_at<period.end_at,pending=[];
 if(open)pending.push('PERIOD_OPEN');
 if(active===0&&pendingRecords===0)pending.push('NO_PRODUCTION_RECORDS');
 if(unknownQuantity>0n)pending.push('UNKNOWN_UNIT_COST');
 if(pendingRecords>0)pending.push('BOUNDARY_TIME_REQUIRED');
 const status=open?'OPEN':active===0&&pendingRecords===0?'NO_RECORDS':unknownQuantity>0n||pendingRecords>0?'PENDING':'RECORDED_COSTS';
 const metrics={status,active_records:active,produced_quantity:Number(quantity),known_cost_quantity:Number(knownQuantity),unknown_cost_quantity:Number(unknownQuantity),boundary_pending_records:pendingRecords,boundary_pending_quantity:Number(pendingQuantity),known_cost_cents:Number(known),total_cost_cents:status==='RECORDED_COSTS'?Number(known):null,pending};
 evidence.sort((a,b)=>a.record_id.localeCompare(b.record_id));
 // Global revisions and capture time are deliberately absent from this key:
 // unrelated ledger changes must not create another version of this week.
 const content_hash=await digest({period_start_at:period.start_at,period_end_at:period.end_at,metrics,evidence});
 return {schema:'production_weekly_report_v1',week_end_date:end_date,period_start_at:period.start_at,period_end_at:period.end_at,captured_at:frame.checked_at,source_revision:frame.revision,timing_revision:0,capture_kind:open?'LIVE_PREVIEW':'RETROSPECTIVE',report_version:0,content_hash,...metrics,basis:'CONFIRMED_MANUFACTURE_RECORDS_NOT_ALL_STORE_OR_CASH'};
}
