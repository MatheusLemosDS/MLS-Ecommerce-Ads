// Compact read-only due-date projection for MLS Finance. This reads only
// persisted owner expense ledgers and never performs payments or bank actions.
export class ExpenseScheduleError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const fail=(code,status=503)=>{throw new ExpenseScheduleError(code,status);};
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const day=value=>typeof value==='string'&&/^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const month=value=>typeof value==='string'&&/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(value);
const safe=value=>value>=0n&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
function addDays(value,count){return new Date(Date.parse(value+'T12:00:00Z')+count*86400000).toISOString().slice(0,10);}
function nextMonth(value){const date=new Date(value+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);return date.toISOString().slice(0,7);}
function clock(now){let raw;try{raw=now();}catch{fail('EXPENSE_SCHEDULE_CLOCK_INVALID');}if(!integer(raw,1,9999999999999))fail('EXPENSE_SCHEDULE_CLOCK_INVALID');const checked_at=Math.floor(raw/1000),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(raw));if(!day(today))fail('EXPENSE_SCHEDULE_CLOCK_INVALID');return {checked_at,today};}
export function projectExpenseSchedule(value){
 try{
  if(!value||typeof value!=='object'||Array.isArray(value)||Reflect.ownKeys(value).length!==10||value.schema!=='expense_schedule_v1'||!integer(value.checked_at,1,9999999999)||!day(value.today)||!month(value.current_month)||!month(value.next_month)||value.current_month!==value.today.slice(0,7)||value.next_month!==nextMonth(value.current_month)||!integer(value.scheduled_months,0,2)||typeof value.has_unallocated_due_dates!=='boolean')return null;
  const group=row=>row&&typeof row==='object'&&!Array.isArray(row)&&Reflect.ownKeys(row).length===2&&integer(row.count,0,400)&&integer(row.cents,0);
  if(!group(value.open)||!group(value.overdue)||!group(value.due_today)||!group(value.due_next_7_days))return null;
  const next=value.next_due;if(next!==null&&(!next||typeof next!=='object'||Array.isArray(next)||Reflect.ownKeys(next).length!==3||!day(next.date)||next.date<value.today||!integer(next.count,1,400)||!integer(next.cents,1)))return null;
  if(value.overdue.count>value.open.count||value.due_today.count>value.open.count||value.due_next_7_days.count>value.open.count||value.overdue.cents>value.open.cents||value.due_today.cents>value.open.cents||value.due_next_7_days.cents>value.open.cents)return null;
  return {...value,open:{...value.open},overdue:{...value.overdue},due_today:{...value.due_today},due_next_7_days:{...value.due_next_7_days},next_due:value.next_due?{...value.next_due}:null};
 }catch{return null;}
}
export async function readExpenseSchedule(env,{now=()=>Date.now()}={}){
 const {checked_at,today}=clock(now),current_month=today.slice(0,7),next_month=nextMonth(current_month),db=env?.ADMIN_DB;if(typeof db?.prepare!=='function')fail('EXPENSE_SCHEDULE_CONFIGURATION');
 let rows;try{rows=(await db.prepare('SELECT month,unallocated_cents,payload FROM business_expense_ledger_months WHERE month IN (?,?) ORDER BY month').bind(current_month,next_month).all()).results??[];}catch(error){throw new ExpenseScheduleError('EXPENSE_SCHEDULE_UNAVAILABLE',503,{cause:error});}
 if(!Array.isArray(rows)||rows.length>2)fail('EXPENSE_SCHEDULE_STORAGE_INVALID');
 const items=[];let scheduledMonths=0,hasUnallocated=false;
 for(const row of rows){
  if(!month(row.month)||![current_month,next_month].includes(row.month)||!integer(row.unallocated_cents)||typeof row.payload!=='string'||row.payload.length>262144)fail('EXPENSE_SCHEDULE_STORAGE_INVALID');
  scheduledMonths++;if(row.unallocated_cents>0)hasUnallocated=true;let parsed;try{parsed=JSON.parse(row.payload);}catch{fail('EXPENSE_SCHEDULE_STORAGE_INVALID');}
  if(!Array.isArray(parsed)||parsed.length>200)fail('EXPENSE_SCHEDULE_STORAGE_INVALID');
  for(const item of parsed){
   if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.due_date!=='string'||!day(item.due_date)||!integer(item.amount_cents,1)||!['OPEN','PAID','CANCELLED'].includes(item.status))fail('EXPENSE_SCHEDULE_STORAGE_INVALID');
   if(item.status==='OPEN')items.push({due_date:item.due_date,amount_cents:item.amount_cents});
  }
 }
 const sum=rows=>{const amount=rows.reduce((total,item)=>total+BigInt(item.amount_cents),0n),cents=safe(amount);if(cents===null)fail('EXPENSE_SCHEDULE_ARITHMETIC_UNSAFE');return {count:rows.length,cents};};
 const open=sum(items),overdue=sum(items.filter(item=>item.due_date<today)),dueToday=sum(items.filter(item=>item.due_date===today)),end=addDays(today,7),nextSeven=sum(items.filter(item=>item.due_date>today&&item.due_date<=end));
 const future=items.filter(item=>item.due_date>=today).sort((a,b)=>a.due_date.localeCompare(b.due_date));let nextDue=null;if(future.length){const date=future[0].due_date,nextRows=future.filter(item=>item.due_date===date),summary=sum(nextRows);nextDue={date,count:summary.count,cents:summary.cents};}
 const value={schema:'expense_schedule_v1',checked_at,today,current_month,next_month,scheduled_months:scheduledMonths,has_unallocated_due_dates:hasUnallocated,open,overdue,due_today:dueToday,due_next_7_days:nextSeven,next_due:nextDue},projected=projectExpenseSchedule(value);if(!projected)fail('EXPENSE_SCHEDULE_RESULT_INVALID');return projected;
}
