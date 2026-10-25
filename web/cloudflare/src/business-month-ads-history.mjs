import {projectAdsCalendar} from './ads-calendar.mjs';

// Calendar observations belong to their exact dates. A new current-day scope
// must not erase the advertising inputs of the last completed publication.
export const BUSINESS_MONTH_ADS_HISTORY_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_month_ads_history(month TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=1048576),updated_at INTEGER NOT NULL CHECK(updated_at BETWEEN 1 AND 9999999999),PRIMARY KEY(month,start_date,end_date))`,
];
export class BusinessMonthAdsHistoryError extends Error{constructor(code='BUSINESS_MONTH_ADS_HISTORY_INVALID'){super(code);this.status=503;}}
const fail=()=>{throw new BusinessMonthAdsHistoryError();};
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const own=(value,key)=>plain(value)?Object.getOwnPropertyDescriptor(value,key)?.value:undefined;
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
function scope(month,range){
 const start_date=own(range,'start_date'),end_date=own(range,'end_date');if(typeof month!=='string'||!/^(?:[2-9][0-9]{3})-(0[1-9]|1[0-2])$/.test(month)||!day(start_date)||!day(end_date)||start_date.slice(0,7)!==month||end_date.slice(0,7)!==month||start_date>end_date)fail();return {start_date,end_date};
}
function database(db){if(typeof db?.prepare!=='function')fail();return db;}

export function businessMonthAdsHistoryQueries(db,month,range){
 const dates=scope(month,range);return [database(db).prepare('SELECT month,start_date,end_date,payload,updated_at FROM business_month_ads_history WHERE month=? AND start_date=? AND end_date=?').bind(month,dates.start_date,dates.end_date)];
}

const reportKeys=['schema','status','start_date','end_date','fetched_at','covered_days','total_days','missing_dates','expense_cents','known_expense_cents','balance_cents','days','day_partial','unit_confirmation','source_timezone','basis','diagnostic','totals'];
const metricKeys=['gmv_cents','orders','reported_roas_raw','calculated_roas_raw'];
const quoted=keys=>keys.map(key=>"'"+key+"'").join(',');
const exactSql=(expression,keys)=>`json_type(${expression})='object' AND (SELECT COUNT(*) FROM json_each(${expression}))=${keys.length} AND (SELECT COUNT(DISTINCT key) FROM json_each(${expression}))=${keys.length} AND NOT EXISTS(SELECT 1 FROM json_each(${expression}) WHERE key NOT IN(${quoted(keys)}))`;
const nonnegativeSql=expression=>`json_type(${expression})='integer' AND json_extract(${expression},'$') BETWEEN 0 AND 9007199254740991`;
const metricSql=expression=>`(${exactSql(expression,metricKeys)} AND (json_type(${expression},'$.gmv_cents')='null' OR (${nonnegativeSql(`json_extract(${expression},'$.gmv_cents')`)})) AND (json_type(${expression},'$.orders')='null' OR (${nonnegativeSql(`json_extract(${expression},'$.orders')`)})) AND json_type(${expression},'$.reported_roas_raw') IN('null','integer','real','text') AND json_type(${expression},'$.calculated_roas_raw') IN('null','text'))`;

// This statement runs before replacing the one-row legacy cache, in the same
// caller-owned batch. It copies original bytes/timestamps and never treats an
// unavailable or partial source as a proven zero. Selected rows are still
// validated with projectAdsCalendar by the monthly reader before being used.
const legacyPrimeSql=`INSERT OR IGNORE INTO business_month_ads_history(month,start_date,end_date,payload,updated_at)
 SELECT month,json_extract(payload,'$.start_date'),json_extract(payload,'$.end_date'),payload,updated_at FROM business_month_ads
 WHERE month=? AND CASE WHEN json_valid(payload) THEN
  (${exactSql('payload',reportKeys)}) AND json_extract(payload,'$.schema')='ads_calendar_v1' AND json_extract(payload,'$.status')='AVAILABLE'
  AND json_type(payload,'$.start_date')='text' AND json_type(payload,'$.end_date')='text'
  AND substr(json_extract(payload,'$.start_date'),1,7)=month AND substr(json_extract(payload,'$.end_date'),1,7)=month
  AND date(json_extract(payload,'$.start_date'),'+0 days')=json_extract(payload,'$.start_date') AND date(json_extract(payload,'$.end_date'),'+0 days')=json_extract(payload,'$.end_date')
  AND json_extract(payload,'$.start_date')<=json_extract(payload,'$.end_date') AND json_type(payload,'$.fetched_at')='integer' AND json_extract(payload,'$.fetched_at') BETWEEN 1 AND ?
  AND typeof(updated_at)='integer' AND updated_at=json_extract(payload,'$.fetched_at')
  AND json_type(payload,'$.total_days')='integer' AND json_extract(payload,'$.total_days') BETWEEN 1 AND 31
  AND json_extract(payload,'$.total_days')=CAST(julianday(json_extract(payload,'$.end_date'))-julianday(json_extract(payload,'$.start_date'))+1 AS INTEGER)
  AND json_extract(payload,'$.covered_days')=json_extract(payload,'$.total_days') AND json_type(payload,'$.covered_days')='integer'
  AND json_type(payload,'$.missing_dates')='array' AND json_array_length(payload,'$.missing_dates')=0
  AND json_type(payload,'$.expense_cents')='integer' AND json_extract(payload,'$.expense_cents') BETWEEN 0 AND 9007199254740991 AND json_extract(payload,'$.known_expense_cents')=json_extract(payload,'$.expense_cents') AND json_type(payload,'$.known_expense_cents')='integer'
  AND (json_type(payload,'$.balance_cents')='null' OR (json_type(payload,'$.balance_cents')='integer' AND json_extract(payload,'$.balance_cents') BETWEEN 0 AND 9007199254740991))
  AND json_type(payload,'$.diagnostic')='null' AND json_type(payload,'$.day_partial') IN('true','false')
  AND json_extract(payload,'$.unit_confirmation')='OPERATOR_CONFIRMED_BRL_2026_10_20' AND json_extract(payload,'$.source_timezone')='UNCONFIRMED' AND json_extract(payload,'$.basis')='CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION'
  AND json_type(payload,'$.days')='array' AND json_array_length(payload,'$.days')=json_extract(payload,'$.total_days')
  AND NOT EXISTS(SELECT 1 FROM json_each(payload,'$.days') d WHERE NOT(
   (${exactSql('d.value',['date','expense_cents','direct','broad'])}) AND json_extract(d.value,'$.date')=date(json_extract(payload,'$.start_date'),'+'||d.key||' days')
   AND json_type(d.value,'$.expense_cents')='integer' AND json_extract(d.value,'$.expense_cents') BETWEEN 0 AND 9007199254740991
   AND ${metricSql("json_extract(d.value,'$.direct')")} AND ${metricSql("json_extract(d.value,'$.broad')")}
  ))
  AND (SELECT SUM(json_extract(d.value,'$.expense_cents')) FROM json_each(payload,'$.days') d)=json_extract(payload,'$.expense_cents')
  AND (${exactSql("json_extract(payload,'$.totals')",['direct','broad'])}) AND ${metricSql("json_extract(payload,'$.totals.direct')")} AND ${metricSql("json_extract(payload,'$.totals.broad')")}
  AND length(CAST(payload AS BLOB))<=1048576
 ELSE 0 END
 ON CONFLICT(month,start_date,end_date) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at WHERE business_month_ads_history.updated_at<excluded.updated_at`;

export function businessMonthAdsHistoryStatements(db,month,report,stamp){
 if(!Number.isSafeInteger(stamp)||Object.is(stamp,-0)||stamp<1||stamp>9999999999)fail();const value=projectAdsCalendar(report);if(!value||value.status!=='AVAILABLE'||value.fetched_at>stamp+60)fail();const dates=scope(month,value),payload=JSON.stringify(value);if(new TextEncoder().encode(payload).byteLength>1048576)fail();database(db);
 return [db.prepare(legacyPrimeSql).bind(month,stamp+60),db.prepare('INSERT INTO business_month_ads_history(month,start_date,end_date,payload,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(month,start_date,end_date) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at WHERE business_month_ads_history.updated_at<excluded.updated_at').bind(month,dates.start_date,dates.end_date,payload,value.fetched_at)];
}
