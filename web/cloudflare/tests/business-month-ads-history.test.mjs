import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {buildAdsCalendar,projectAdsCalendar} from '../src/ads-calendar.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {BUSINESS_MONTH_ADS_HISTORY_SCHEMA,BusinessMonthAdsHistoryError,businessMonthAdsHistoryQueries,businessMonthAdsHistoryStatements} from '../src/business-month-ads-history.mjs';

const month='2026-10',at24=Date.UTC(2026,9,24,12)/1000,at25=Date.UTC(2026,9,25,12)/1000;
const scope=end=>({start_date:month+'-01',end_date:month+'-'+String(end).padStart(2,'0')});
function calendar(end,at,spend=1.25,{missing=null,unavailable=false}={}){
 const selection=scope(end),children=[];
 for(let begin=1;begin<=end;begin+=15){const last=Math.min(end,begin+14),period={start_date:month+'-'+String(begin).padStart(2,'0'),end_date:month+'-'+String(last).padStart(2,'0')};children.push(unavailable?null:buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period,balance:30,daily:Array.from({length:last-begin+1},(_,index)=>({date:month+'-'+String(begin+index).padStart(2,'0'),expense:spend,broad_gmv:spend?10:0,broad_order:spend?1:0,broad_roas:spend?8:0,direct_gmv:0,direct_order:0,direct_roas:0})).filter(row=>row.date!==missing)},period,at));}
 const result=buildAdsCalendar(children,selection,at);assert.ok(projectAdsCalendar(result));return result;
}
class ObservedD1 extends D1{
 constructor(){super();this.executions=0;}
 prepare(sql){const statement=super.prepare(sql);for(const method of ['run','first','all']){const execute=statement[method].bind(statement);statement[method]=(...args)=>{this.executions++;return execute(...args);};}return statement;}
}
async function fixture(t){const db=new ObservedD1();t.after(()=>db.db.close());await db.batch([...BUSINESS_MONTH_ADS_HISTORY_SCHEMA,'CREATE TABLE business_month_ads(month TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at INTEGER NOT NULL)'].map(sql=>db.prepare(sql)));db.executions=0;return db;}
const legacy=(db,report)=>db.prepare('INSERT INTO business_month_ads(month,payload,updated_at) VALUES(?,?,?) ON CONFLICT(month) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').bind(month,JSON.stringify(report),report.fetched_at);
async function read(db,end){const queries=businessMonthAdsHistoryQueries(db,month,scope(end));assert.equal(queries.length,1);return (await db.batch(queries))[0].results[0]??null;}
const invalid=error=>error instanceof BusinessMonthAdsHistoryError&&error.message==='BUSINESS_MONTH_ADS_HISTORY_INVALID';

test('day rollover retains both exact Ads scopes with their original amounts and observation timestamps',async t=>{
 const db=await fixture(t),day24=calendar(24,at24),day25=calendar(25,at25,2);await db.batch([...businessMonthAdsHistoryStatements(db,month,day24,at24),legacy(db,day24)]);await db.batch([...businessMonthAdsHistoryStatements(db,month,day25,at25),legacy(db,day25)]);
 const old=await read(db,24),current=await read(db,25);assert.deepEqual(JSON.parse(old.payload),day24);assert.deepEqual(JSON.parse(current.payload),day25);assert.equal(old.updated_at,at24);assert.equal(current.updated_at,at25);assert.equal(JSON.parse(old.payload).expense_cents,3000);assert.equal(JSON.parse(current.payload).expense_cents,5000);assert.equal(JSON.parse(db.db.prepare('SELECT payload FROM business_month_ads WHERE month=?').get(month).payload).end_date,'2026-10-25');assert.equal(db.db.prepare('SELECT COUNT(*) n FROM business_month_ads_history').get().n,2);assert.equal(await read(db,23),null,'an unobserved scope is not filled with a nearby report');
});

test('the same write batch primes a valid legacy scope before its replacement without refreshing the saved source clock',async t=>{
 const db=await fixture(t),old=calendar(24,at24),current=calendar(25,at25);await legacy(db,old).run();assert.equal(db.db.prepare('SELECT COUNT(*) n FROM business_month_ads_history').get().n,0);
 const statements=businessMonthAdsHistoryStatements(db,month,current,at25+30);assert.equal(statements.length,2);await db.batch([...statements,legacy(db,current)]);const migrated=await read(db,24),latest=await read(db,25);assert.equal(migrated.payload,JSON.stringify(old));assert.equal(migrated.updated_at,at24);assert.equal(JSON.parse(migrated.payload).fetched_at,at24);assert.equal(latest.updated_at,at25,'the later request clock does not become a new observation');assert.equal(JSON.parse(latest.payload).fetched_at,at25);
 for(const bad of [calendar(24,at24,1,{missing:'2026-10-02'}),calendar(24,at24,1,{unavailable:true}),{...old,access_token:'PRIVATE_LEGACY'}]){db.db.prepare('DELETE FROM business_month_ads_history').run();await legacy(db,bad).run();await db.batch([...businessMonthAdsHistoryStatements(db,month,current,at25),legacy(db,current)]);assert.equal(await read(db,24),null,'an unavailable or invalid legacy row is not promoted to trusted history');assert.deepEqual(JSON.parse((await read(db,25)).payload),current);}
});

test('partial, unavailable, private, accessor and mismatched input cannot create a fabricated Ads amount',async t=>{
 const db=await fixture(t),good=calendar(25,at25),partial=calendar(25,at25,1,{missing:'2026-10-03'}),unavailable=calendar(25,at25,1,{unavailable:true});let invoked=0;const accessor={...good};Object.defineProperty(accessor,'days',{enumerable:true,get(){invoked++;return good.days;}});
 for(const value of [partial,unavailable,{...good,access_token:'PRIVATE'},accessor])assert.throws(()=>businessMonthAdsHistoryStatements(db,month,value,at25),invalid);assert.equal(invoked,0);assert.throws(()=>businessMonthAdsHistoryStatements(db,'2026-09',good,at25),invalid);assert.throws(()=>businessMonthAdsHistoryStatements(db,month,good,NaN),invalid);assert.throws(()=>businessMonthAdsHistoryQueries(db,month,{start_date:'2026-09-01',end_date:'2026-09-24'}),invalid);assert.equal(db.executions,0,'constructing or rejecting statements performs no D1 RPC');assert.equal(await read(db,25),null);
 const zero=calendar(25,at25,0);await db.batch(businessMonthAdsHistoryStatements(db,month,zero,at25));const stored=JSON.parse((await read(db,25)).payload);assert.equal(stored.expense_cents,0);assert.equal(stored.known_expense_cents,0);assert.equal(stored.status,'AVAILABLE');assert.equal(stored.fetched_at,at25);
});

test('statement construction has no RPC and a late older response cannot overwrite a newer observation of the same scope',async t=>{
 const db=await fixture(t),newer=calendar(25,at25,2),older=calendar(25,at25-30,1);const first=businessMonthAdsHistoryStatements(db,month,newer,at25),late=businessMonthAdsHistoryStatements(db,month,older,at25+300),queries=businessMonthAdsHistoryQueries(db,month,scope(25));assert.equal(db.executions,0);assert.equal(queries.length,1);newer.private_token='PRIVATE_AFTER_BUILD';await db.batch(first);await db.batch(late);const stored=await read(db,25);assert.equal(stored.updated_at,at25);assert.equal(JSON.parse(stored.payload).fetched_at,at25);assert.equal(JSON.parse(stored.payload).expense_cents,5000);assert.doesNotMatch(stored.payload,/PRIVATE/);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM business_month_ads_history').get().n,1);
});
