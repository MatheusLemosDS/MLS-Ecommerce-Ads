import {projectAdsCalendar} from './ads-calendar.mjs';
import {createFinancialEvent,financialDigest,financialSafeSum,normalizeFinancialScope,normalizeFinancialTimestamp,FinancialLedgerError} from './financial-event-ledger.mjs';
import {projectFinancialAccountingPeriod} from './financial-accounting-schedule.mjs';
import {isCommercialContext} from './commercial-context.mjs';
import {tenantDatabaseHasContext} from './tenant-storage.mjs';

// The existing calendar explicitly says UNCONFIRMED for the source timezone.
// Its date is therefore retained as a nominal label on a REVIEW event. A pin at
// UTC midnight is an index for that label, never a claimed consumption instant.
// Neither Friday13h allocation nor an Ads recharge can be derived from it.
const encoder=new TextEncoder(),plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const token=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);
const integer=v=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=0;
const fail=(suffix,status=400)=>{throw new FinancialLedgerError('FINANCIAL_ADS_'+suffix,status);};
function periodInput(value){const p=projectFinancialAccountingPeriod(value);if(!p)fail('PERIOD_INVALID');return p;}
function dates(period){const a=Date.parse(period.start_date+'T00:00:00Z'),b=Date.parse(period.end_date+'T00:00:00Z');return Array.from({length:(b-a)/86400000+1},(_,i)=>new Date(a+i*86400000).toISOString().slice(0,10));}
function coverage(scope,period,state,pending){return [{family:'ADS',scope:{...scope},state,start_at:period.start_at,end_at:period.end_at,timezone_confirmed:false,comparison:'NOT_COMPARED',account_refs:[],pending:[...pending]}];}
function clock(now){const value=typeof now==='function'?now():now;if(!Number.isSafeInteger(value)||value<1)fail('CLOCK_INVALID',503);return normalizeFinancialTimestamp(new Date(value).toISOString());}

export async function projectFinancialAutomationAdsSources({scope,period,calendars=[],observed_at}={}){
 const selected=normalizeFinancialScope(scope),range=periodInput(period),stamp=normalizeFinancialTimestamp(observed_at);
 if(selected.currency!=='BRL')fail('CURRENCY_UNSUPPORTED',403);
 if(!Array.isArray(calendars)||calendars.length>80)fail('SOURCES_INVALID');
 if(range.kind==='MANUFACTURE_WEEK')return {events:[],coverage:coverage(selected,range,'UNKNOWN',['ADS_INTRADAY_ALLOCATION_UNAVAILABLE']),pending:['ADS_INTRADAY_ALLOCATION_UNAVAILABLE'],known_expense_cents:null,covered_days:0,missing_days:[],partial_days:[],source_refs:[]};
 const wanted=dates(range),byDate=new Map(),conflicts=new Set(),pending=new Set(['ADS_SOURCE_TIMEZONE_UNCONFIRMED']),refs=new Set();let valid=0;
 for(const source of calendars){
  if(!plain(source)||!token(source.source_ref)){pending.add('ADS_SAVED_SOURCE_INVALID');continue;}
  const report=projectAdsCalendar(source.report);
  if(!report||report.fetched_at*1000>Date.parse(stamp)){pending.add('ADS_SAVED_SOURCE_INVALID');continue;}
  valid++;if(report.status==='UNAVAILABLE')continue;
  for(const day of report.days){
   if(!wanted.includes(day.date)||day.expense_cents===null)continue;
   const partial=report.day_partial&&day.date===report.end_date,prior=byDate.get(day.date),next={date:day.date,expense_cents:day.expense_cents,partial,fetched_at:report.fetched_at,source_ref:source.source_ref,unit_confirmation:report.unit_confirmation,source_timezone:report.source_timezone};
   if(!prior||prior.partial&&!partial||prior.partial===partial&&prior.fetched_at<next.fetched_at){byDate.set(day.date,next);conflicts.delete(day.date);}
   else if(prior.partial===partial&&prior.fetched_at===next.fetched_at&&prior.expense_cents!==next.expense_cents)conflicts.add(day.date);
  }
 }
 const missing_days=wanted.filter(d=>!byDate.has(d)||conflicts.has(d)),partial_days=wanted.filter(d=>byDate.get(d)?.partial===true&&!conflicts.has(d)),events=[],known=[];
 if(missing_days.length)pending.add('ADS_SAVED_DATES_INCOMPLETE');if(partial_days.length)pending.add('ADS_CURRENT_DAY_PARTIAL');if(conflicts.size)pending.add('ADS_SAVED_DAY_CONFLICT');if(!valid)pending.add('ADS_SAVED_SOURCE_UNAVAILABLE');
 for(const date of wanted){
  const day=byDate.get(date);if(!day||conflicts.has(date))continue;
  known.push(day.expense_cents);refs.add(day.source_ref);const native='ads-day:'+date,pin=date+'T00:00:00.000Z';
  events.push(await createFinancialEvent({scope:selected,event_type:'ADS_DAILY_CONSUMPTION_REVIEW',event_at:pin,competence_at:pin,settlement_at:null,source_updated_at:null,observed_at:stamp,source:{provider:'SHOPEE',family:'ADS_DAILY_CONSUMPTION',native_id:native,identity:'NATIVE_ID',identity_key:null},evidence:[{kind:'ADS_CALENDAR_NOMINAL_DATE',reference:day.source_ref,sha256:await financialDigest({schema:'financial_ads_day_observation_v1',scope:selected,date,expense_cents:day.expense_cents,day_partial:day.partial,source_checked_at:day.fetched_at,unit_confirmation:day.unit_confirmation,source_timezone:day.source_timezone,date_basis:'NOMINAL_CALENDAR_LABEL_NOT_CONFIRMED_INSTANT'})}],causal_event_id:null,quality:'REVIEW',postings:[{account:'ADS_EXPENSE',account_ref:'shopee-ads-consumption',amount_cents:day.expense_cents},{account:'ADS_PREPAID',account_ref:'shopee-ads-credit',amount_cents:day.expense_cents===0?0:-day.expense_cents}]}));
 }
 const codes=[...pending],known_expense_cents=known.length?financialSafeSum(known):null;
 return {events,coverage:coverage(selected,range,valid?'PARTIAL':'UNKNOWN',codes),pending:codes,known_expense_cents,covered_days:known.length,missing_days,partial_days,source_refs:[...refs].sort()};
}

function readerScope(env,scope){
 const c=env?.COMMERCIAL_CONTEXT;if(scope.account_id!=='operating-book'||scope.currency!=='BRL')fail('SCOPE_INVALID',403);
 if(c!==undefined&&c!==null){if(!isCommercialContext(c)||c.organizationId!==scope.organization_id||c.storeId!==scope.store_id||!tenantDatabaseHasContext(env?.ADMIN_DB,c))fail('SCOPE_INVALID',403);}
 else if(scope.organization_id!=='legacy-brazacommerce'||scope.store_id!=='legacy-shopee')fail('SCOPE_INVALID',403);
}
function months(period){const output=[period.start_date.slice(0,7)],last=period.end_date.slice(0,7);if(last!==output[0])output.push(last);return output;}
async function readMonthRows(db,month){
 if(!db?.prepare||!db?.batch)fail('CONFIGURATION',503);
 const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN('business_month_ads','business_month_ads_history')").all()).results;
 if(!Array.isArray(tables)||tables.some(r=>!['business_month_ads','business_month_ads_history'].includes(r.name)))fail('STORAGE_INVALID',503);
 const names=new Set(tables.map(r=>r.name)),queries=[];
 if(names.has('business_month_ads'))queries.push(db.prepare('SELECT month,payload,updated_at FROM business_month_ads WHERE month=?').bind(month));
 if(names.has('business_month_ads_history'))queries.push(db.prepare('SELECT month,start_date,end_date,payload,updated_at FROM business_month_ads_history WHERE month=? ORDER BY updated_at DESC,start_date,end_date LIMIT 35').bind(month));
 if(!queries.length)return {rows:[],limited:false};const batch=await db.batch(queries);if(!Array.isArray(batch)||batch.length!==queries.length||batch.some(r=>!Array.isArray(r.results)))fail('STORAGE_INVALID',503);
 const rows=[];let limited=false;for(const r of batch){if(r.results.length>34)limited=true;rows.push(...r.results.slice(0,34));}return {rows,limited};
}

// Reads only local cache/history; no DDL, token, provider call or live mutation.
// A caller may reuse its already-loaded readBusinessMonthDisplay result.
export async function readFinancialAutomationSavedAds(env,{scope,period,now=Date.now,readMonth=null}={}){
 const selected=normalizeFinancialScope(scope),range=periodInput(period),stamp=clock(now);readerScope(env,selected);
 if(readMonth!==null&&typeof readMonth!=='function')fail('READER_INVALID');
 const calendars=[],diagnostics=new Set();
 if(range.kind!=='MANUFACTURE_WEEK')for(const month of months(range))try{
  if(readMonth!==null){
   const saved=await readMonth(month,now);for(const slot of ['display','active']){const frame=saved?.[slot];if(frame?.month!==undefined&&frame.month!==month)fail('SAVED_SCOPE_INVALID',403);const report=frame?.ads;if(report!==null&&report!==undefined)calendars.push({source_ref:'ads-saved-'+await financialDigest([month,slot,report.fetched_at]),report});}
  }else{
   const result=await readMonthRows(env?.ADMIN_DB,month);if(result.limited)diagnostics.add('ADS_SAVED_HISTORY_SCAN_LIMIT');
   for(const row of result.rows){if(row.month!==month||!integer(row.updated_at)||row.updated_at<1||typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>65536){diagnostics.add('ADS_SAVED_SOURCE_INVALID');continue;}
    let report;try{report=projectAdsCalendar(JSON.parse(row.payload));}catch{}
    if(!report||report.start_date?.slice(0,7)!==month||report.end_date?.slice(0,7)!==month||report.fetched_at!==row.updated_at||row.start_date!==undefined&&(row.start_date!==report.start_date||row.end_date!==report.end_date)){diagnostics.add('ADS_SAVED_SOURCE_INVALID');continue;}
    calendars.push({source_ref:'ads-cache-'+await financialDigest([month,report.start_date,report.end_date,report.fetched_at]),report});
   }
  }
 }catch{diagnostics.add('ADS_SAVED_SOURCE_UNAVAILABLE');}
 const result=await projectFinancialAutomationAdsSources({scope:selected,period:range,calendars,observed_at:stamp}),pending=[...new Set([...result.pending,...diagnostics])];
 return {...result,pending,coverage:result.coverage.map(row=>({...row,pending}))};
}
