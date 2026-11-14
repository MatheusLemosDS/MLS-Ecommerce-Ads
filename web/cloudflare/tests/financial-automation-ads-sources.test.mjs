import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar,projectAdsCalendar} from '../src/ads-calendar.mjs';
import {financialAccountingPeriod} from '../src/financial-accounting-schedule.mjs';
import {financialEventContentHash,validateFinancialEvent} from '../src/financial-event-ledger.mjs';
import {projectFinancialAutomationAdsSources,readFinancialAutomationSavedAds} from '../src/financial-automation-ads-sources.mjs';
import {FINANCE_PROFILE} from '../../finance/src/connection-store.mjs';

const scope={organization_id:'legacy-brazacommerce',store_id:'legacy-shopee',account_id:'operating-book',currency:'BRL'},epoch=Date.parse('2026-11-13T18:00:00Z')/1000,now=()=>epoch*1000,observed_at=new Date(now()).toISOString(),period=financialAccountingPeriod({kind:'MONTH',anchor:'2026-10'});
const dateList=(start,end)=>Array.from({length:(Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000+1},(_,i)=>new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
function calendar(start='2026-10-01',end='2026-10-31',{amount='0.10',fetched_at=epoch,change=()=>{}}={}){
 const dates=dateList(start,end),children=[];
 for(let i=0;i<dates.length;i+=15){const selection={start_date:dates[i],end_date:dates[Math.min(i+14,dates.length-1)]},raw={status:'ok',connected:true,shop:{id:FINANCE_PROFILE.shop_id,name:'SYNTHETIC_PRIVATE_SHOP'},period:{...selection},balance:'51.23',private_token:'SYNTHETIC_PRIVATE_TOKEN',daily:dateList(selection.start_date,selection.end_date).map(date=>({date,expense:amount,broad_gmv:'0',broad_order:0,broad_roas:'0',direct_gmv:'0',direct_order:0,direct_roas:'0'}))};change(raw);children.push(buildAdsMeasurement(raw,selection,fetched_at));}
 const result=buildAdsCalendar(children,{start_date:start,end_date:end},fetched_at);assert.ok(projectAdsCalendar(result));return result;
}
const source=(report,source_ref='synthetic-cache-ref')=>({source_ref,report});
const project=(calendars,changes={})=>projectFinancialAutomationAdsSources({scope,period,calendars,observed_at,...changes});

test('saved daily Ads observations keep exact expense and balanced review postings without creating recharge, cash or revenue',async()=>{
 const r=await project([source(calendar())]);assert.equal(r.events.length,31);assert.equal(r.known_expense_cents,310);assert.equal(r.covered_days,31);assert.deepEqual(r.missing_days,[]);assert.equal(r.coverage[0].state,'PARTIAL');assert.equal(r.coverage[0].timezone_confirmed,false);assert.ok(r.pending.includes('ADS_SOURCE_TIMEZONE_UNCONFIRMED'));
 for(const e of r.events){assert.ok(validateFinancialEvent(e,{scope}));assert.equal(e.quality,'REVIEW');assert.equal(e.source.family,'ADS_DAILY_CONSUMPTION');assert.equal(e.source_updated_at,null);assert.equal(e.settlement_at,null);assert.deepEqual(e.postings.map(p=>[p.account,p.amount_cents]),[['ADS_EXPENSE',10],['ADS_PREPAID',-10]]);assert.equal(e.event_at,e.source.native_id.slice(8)+'T00:00:00.000Z');}
 assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC_PRIVATE_SHOP|SYNTHETIC_PRIVATE_TOKEN|REVENUE|WALLET_AVAILABLE|BANK/);
});
test('replaying a saved day changes neither native identity nor economic content when the observation clock advances',async()=>{
 const report=calendar(),a=await project([source(report)]),b=await project([source(report)],{observed_at:'2026-11-14T18:00:00.000Z'});assert.deepEqual(a.events.map(e=>e.event_id),b.events.map(e=>e.event_id));assert.equal(await financialEventContentHash(a.events[0]),await financialEventContentHash(b.events[0]));
 const other=await project([source(report)],{scope:{...scope,store_id:'another-store'}});assert.notEqual(a.events[0].event_id,other.events[0].event_id);
});
test('explicit zero consumption is an observed zero while missing days remain null and never create zero events',async()=>{
 const report=calendar('2026-10-01','2026-10-02',{amount:'0',change:raw=>raw.daily=raw.daily.filter(d=>d.date!=='2026-10-02')});const r=await project([source(report)]);assert.equal(r.events.length,1);assert.equal(r.known_expense_cents,0);assert.equal(r.events[0].postings[0].amount_cents,0);assert.deepEqual(r.missing_days.slice(0,2),['2026-10-02','2026-10-03']);assert.equal((await project([])).known_expense_cents,null);
});
test('overlapping saved calendar ranges choose the latest known day once and keep the previous observation on a missing refresh',async()=>{
 const old=calendar('2026-10-01','2026-10-03',{fetched_at:epoch-120}),latest=calendar('2026-10-01','2026-10-03',{amount:'0.25',change:raw=>raw.daily=raw.daily.filter(d=>d.date!=='2026-10-02')});const r=await project([source(old,'synthetic-old'),source(latest,'synthetic-latest')]);assert.equal(r.events.length,3);assert.equal(r.known_expense_cents,60);assert.equal(r.events.find(e=>e.source.native_id==='ads-day:2026-10-02').postings[0].amount_cents,10);assert.equal(new Set(r.events.map(e=>e.event_id)).size,3);
});
test('conflicting source amounts at the same observed instant are withheld rather than arbitrarily selected',async()=>{
 const r=await project([source(calendar('2026-10-01','2026-10-01'),'synthetic-a'),source(calendar('2026-10-01','2026-10-01',{amount:'0.20'}),'synthetic-b')]);assert.equal(r.events.length,0);assert.equal(r.known_expense_cents,null);assert.ok(r.missing_days.includes('2026-10-01'));assert.ok(r.pending.includes('ADS_SAVED_DAY_CONFLICT'));
});
test('the current daily calendar remains partial and its collection time never becomes a source update or settlement date',async()=>{
 const r=await project([source(calendar('2026-11-13','2026-11-13'))],{period:financialAccountingPeriod({kind:'MONTH',anchor:'2026-11'})});assert.deepEqual(r.partial_days,['2026-11-13']);assert.ok(r.pending.includes('ADS_CURRENT_DAY_PARTIAL'));assert.equal(r.events[0].quality,'REVIEW');assert.equal(r.events[0].source_updated_at,null);assert.equal(r.coverage[0].timezone_confirmed,false);
});
test('civil week dates across months select only their own observed labels without attribution revenue or ROAS averages',async()=>{
 const week=financialAccountingPeriod({kind:'CIVIL_WEEK',anchor:'2026-11-01'}),r=await project([source(calendar('2026-10-01','2026-10-31'),'synthetic-october'),source(calendar('2026-11-01','2026-11-05'),'synthetic-november')],{period:week});assert.equal(r.covered_days,7);assert.equal(r.known_expense_cents,70);assert.deepEqual(r.events.map(e=>e.source.native_id),dateList('2026-10-30','2026-11-05').map(d=>'ads-day:'+d));
});
test('Friday13h manufacture windows never receive a guessed daily allocation',async()=>{
 const r=await project([source(calendar())],{period:financialAccountingPeriod({kind:'MANUFACTURE_WEEK',anchor:'2026-10-30T17:00:00.000Z'})});assert.equal(r.events.length,0);assert.equal(r.known_expense_cents,null);assert.equal(r.coverage[0].state,'UNKNOWN');assert.deepEqual(r.pending,['ADS_INTRADAY_ALLOCATION_UNAVAILABLE']);
});
test('forged calendar totals, source timezone, negative expense, unknown fields and future observations do not create postings',async()=>{
 const base=calendar('2026-10-01','2026-10-01');for(const change of [r=>r.expense_cents++,r=>r.source_timezone='America/Sao_Paulo',r=>r.days[0].expense_cents=-1,r=>r.private='SYNTHETIC_PRIVATE',r=>r.fetched_at=epoch+1]){const report=structuredClone(base);change(report);const r=await project([source(report)]);assert.equal(r.events.length,0);assert.equal(r.known_expense_cents,null);assert.ok(r.pending.includes('ADS_SAVED_SOURCE_INVALID'));}
 await assert.rejects(()=>project([source(base)],{scope:{...scope,currency:'USD'}}),e=>e.status===403);
});
function database(rows,{fail=false}={}){const calls=[];return {calls,prepare(sql){calls.push(sql);return {bind(...args){return {sql,args};},async all(){if(fail)throw Error('SYNTHETIC_PRIVATE_STORAGE_FAILURE');return {results:[{name:'business_month_ads'},{name:'business_month_ads_history'}]};}};},async batch(queries){return queries.map(q=>({results:rows.filter(r=>r.month===q.args[0]&&(q.sql.includes('FROM business_month_ads_history')?r.start_date!==undefined:r.start_date===undefined))}));}};}
test('default reader consumes validated local cache and history with SELECT only, preserving absent daily evidence',async()=>{
 const report=calendar('2026-10-01','2026-10-02'),db=database([{month:'2026-10',payload:JSON.stringify(report),updated_at:report.fetched_at},{month:'2026-10',start_date:report.start_date,end_date:report.end_date,payload:JSON.stringify(report),updated_at:report.fetched_at}]),r=await readFinancialAutomationSavedAds({ADMIN_DB:db},{scope,period,now});assert.equal(r.known_expense_cents,20);assert.equal(r.events.length,2);assert.ok(db.calls.length>0);assert.equal(db.calls.every(sql=>sql.startsWith('SELECT ')),true);assert.equal(r.coverage[0].state,'PARTIAL');
});
test('missing cache tables and unavailable storage stay unknown without a provider fallback or private error text',async()=>{
 const absent={prepare(){return {all:async()=>({results:[]})};},batch(){throw Error('no query expected');}},r=await readFinancialAutomationSavedAds({ADMIN_DB:absent},{scope,period,now});assert.equal(r.known_expense_cents,null);assert.equal(r.coverage[0].state,'UNKNOWN');const failed=await readFinancialAutomationSavedAds({ADMIN_DB:database([],{fail:true})},{scope,period,now});assert.ok(failed.pending.includes('ADS_SAVED_SOURCE_UNAVAILABLE'));assert.doesNotMatch(JSON.stringify(failed),/SYNTHETIC_PRIVATE_STORAGE_FAILURE/);
});
test('reuse of a saved month avoids database and network access and cannot accept another month or company',async()=>{
 let reads=0;const r=await readFinancialAutomationSavedAds({}, {scope,period,now,readMonth:async(month,clock)=>{reads++;assert.equal(month,'2026-10');assert.equal(clock,now);return {display:{month,ads:calendar('2026-10-01','2026-10-01')},active:null};}});assert.equal(reads,1);assert.equal(r.known_expense_cents,10);
 const invalid=await readFinancialAutomationSavedAds({}, {scope,period,now,readMonth:async()=>({display:{month:'2026-09',ads:calendar()}})});assert.equal(invalid.events.length,0);assert.equal(invalid.known_expense_cents,null);
 await assert.rejects(()=>readFinancialAutomationSavedAds({}, {scope:{...scope,organization_id:'other-org'},period,now,readMonth:async()=>{throw Error('must not read');}}),e=>e.status===403);await assert.rejects(()=>readFinancialAutomationSavedAds({COMMERCIAL_CONTEXT:{organizationId:scope.organization_id,storeId:scope.store_id}}, {scope,period,now}),e=>e.status===403);
});
