import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {getAdsCalendar,buildAdsCalendar,projectAdsCalendar,projectAdsCalendarRequest} from '../src/ads-calendar.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {adsMeasurementPageSelection,getAdsSummary} from '../src/app-ads-summary.mjs';

const stamp=Date.UTC(2026,10,2,1),now=()=>stamp,epoch=stamp/1000;
const env={APP_INTERNAL_SECRET:'PRIVATE_CALENDAR_KEY'};
const full={start_date:'2026-10-01',end_date:'2026-10-31'};
const iso=value=>/^\d{4}-/.test(value)?value:value.split('-').reverse().join('-');
const dates=input=>Array.from({length:(Date.parse(input.end_date+'T00:00:00Z')-Date.parse(input.start_date+'T00:00:00Z'))/86400000+1},(_,index)=>new Date(Date.parse(input.start_date+'T00:00:00Z')+index*86400000).toISOString().slice(0,10));
const source=(input,change=()=>{})=>{
 const raw={status:'ok',connected:true,shop:{id:1178167501,name:'PRIVATE_NAME'},period:{...input},balance:'31.07',metrics:{spend:999999999},private_token:'PRIVATE_TOKEN',daily:dates(input).map(date=>({date,expense:'0.10',broad_gmv:'1.23',broad_order:1,broad_roas:'99.88',direct_gmv:'0.50',direct_order:0,direct_roas:'5',private_token:'PRIVATE_ROW_TOKEN'}))};change(raw);return raw;
};
async function read(input=full,change=()=>{},overrides={}){
 const calls=[];
 const frame=await getAdsCalendar(env,input,{now,fetchImpl:async request=>{
  const url=new URL(request.url),part={start_date:iso(url.searchParams.get('start_date')),end_date:iso(url.searchParams.get('end_date'))};calls.push({request,input:part});
  return Response.json(source(part,raw=>change(raw,part,calls.length)));
 },...overrides});return {frame,calls};
}
const chunks=input=>{const days=dates(input);return Array.from({length:Math.ceil(days.length/15)},(_,index)=>({start_date:days[index*15],end_date:days[Math.min(index*15+14,days.length-1)]}));};
const children=(input=full)=>chunks(input).map(part=>buildAdsMeasurement(source(part),part,epoch));

test('a 31-day month uses exactly three authenticated disjoint source reads and exact cent sums',async()=>{
 const {frame,calls}=await read();
 assert.deepEqual(calls.map(call=>call.input),[{start_date:'2026-10-01',end_date:'2026-10-15'},{start_date:'2026-10-16',end_date:'2026-10-30'},{start_date:'2026-10-31',end_date:'2026-10-31'}]);
 for(const {request} of calls){const url=new URL(request.url);assert.equal(url.origin,'https://auth.brazacommerce.com.br');assert.equal(url.pathname,'/internal/shopee/ads/summary');assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');assert.equal(request.headers.get('x-braza-app-key'),env.APP_INTERNAL_SECRET);assert.equal(request.headers.get('cookie'),null);assert.equal(request.headers.get('authorization'),null);}
 assert.equal(frame.status,'AVAILABLE');assert.equal(frame.total_days,31);assert.equal(frame.covered_days,31);assert.equal(frame.expense_cents,310);assert.equal(frame.known_expense_cents,310);assert.equal(frame.totals.broad.gmv_cents,3813);assert.equal(frame.totals.broad.orders,31);assert.equal(frame.totals.broad.calculated_roas_raw,'12.300000');assert.equal(frame.totals.broad.reported_roas_raw,null);
 assert.equal(frame.totals.direct.gmv_cents,1550);assert.equal(frame.totals.direct.calculated_roas_raw,'5.000000');assert.equal(frame.balance_cents,3107);assert.equal(frame.day_partial,false);assert.deepEqual(frame.days.map(day=>day.date),dates(full));assert.deepEqual(projectAdsCalendar(frame),frame);
 for(const marker of ['PRIVATE_NAME','PRIVATE_TOKEN','PRIVATE_ROW_TOKEN',env.APP_INTERNAL_SECRET,'999999999'])assert.ok(!JSON.stringify(frame).includes(marker));
});

test('one missing middle day invalidates the total, keeps the exact known subtotal and never becomes zero',async()=>{
 const {frame}=await read(full,(raw,part)=>{if(part.start_date==='2026-10-16')raw.daily.splice(4,1);});
 assert.equal(frame.status,'PARTIAL');assert.equal(frame.expense_cents,null);assert.equal(frame.known_expense_cents,300);assert.equal(frame.covered_days,30);assert.deepEqual(frame.missing_dates,['2026-10-20']);assert.equal(frame.days[19].expense_cents,null);assert.equal(frame.totals.broad.gmv_cents,null);assert.equal(frame.totals.broad.orders,null);assert.equal(frame.totals.broad.calculated_roas_raw,null);assert.ok(projectAdsCalendar(frame));
});

test('a failed chunk is a missing range rather than a truncated monthly total',async()=>{
 const child=children();child[1]=null;
 const frame=buildAdsCalendar(child,full,epoch);assert.equal(frame.status,'PARTIAL');assert.equal(frame.expense_cents,null);assert.equal(frame.known_expense_cents,160);assert.equal(frame.covered_days,16);assert.deepEqual(frame.missing_dates,dates(chunks(full)[1]));assert.equal(frame.totals.broad.gmv_cents,null);assert.equal(frame.totals.broad.calculated_roas_raw,null);
 const failed=buildAdsCalendar([null,null,null],full,epoch);assert.equal(failed.status,'UNAVAILABLE');assert.equal(failed.expense_cents,null);assert.equal(failed.known_expense_cents,0);assert.ok(projectAdsCalendar(failed));
});

test('duplicate, overlapping, reordered or foreign chunks cannot be summed as one month',()=>{
 for(const change of [items=>items.reverse(),items=>items[1]=items[0],items=>items.pop(),items=>items.push(items[0]),items=>items[1]={...items[1],start_date:'2026-10-15'},items=>items[1]={...items[1],private_token:'PRIVATE'},items=>items[1]={...items[1],fetched_at:epoch+1},items=>items[1]={...items[1],fetched_at:epoch-61}]){
  const child=children();change(child);const frame=buildAdsCalendar(child,full,epoch);assert.equal(frame.status,'UNAVAILABLE');assert.equal(frame.expense_cents,null);assert.ok(projectAdsCalendar(frame));
 }
 let accessed=0;const sparse=children();Object.defineProperty(sparse,'1',{get(){accessed++;return children()[1];}});assert.equal(buildAdsCalendar(sparse,full,epoch).status,'UNAVAILABLE');assert.equal(accessed,0);
});

test('monthly ROAS is a ratio of summed amounts, while each provider daily ROAS is preserved',async()=>{
 const part={start_date:'2026-10-01',end_date:'2026-10-16'};
 const {frame}=await read(part,(raw,selected)=>{raw.daily.forEach((row,index)=>{row.expense=selected.start_date==='2026-10-16'?10:1;row.broad_gmv=selected.start_date==='2026-10-16'?10:2;row.broad_roas=selected.start_date==='2026-10-16'?'1.1':'2.2';});});
 assert.equal(frame.expense_cents,2500);assert.equal(frame.totals.broad.gmv_cents,4000);assert.equal(frame.totals.broad.calculated_roas_raw,'1.600000');assert.equal(frame.totals.broad.reported_roas_raw,null);assert.equal(frame.days[0].broad.reported_roas_raw,'2.2');assert.equal(frame.days[15].broad.reported_roas_raw,'1.1');
});

test('broad and direct gaps remain independent across chunks, without attribution fallback',async()=>{
 const {frame}=await read(full,(raw,part)=>{if(part.start_date==='2026-10-16'){delete raw.daily[0].broad_gmv;delete raw.daily[1].direct_order;}});
 assert.equal(frame.status,'AVAILABLE');assert.equal(frame.expense_cents,310);assert.equal(frame.totals.broad.gmv_cents,null);assert.equal(frame.totals.broad.orders,31);assert.equal(frame.totals.broad.calculated_roas_raw,null);assert.equal(frame.totals.direct.gmv_cents,1550);assert.equal(frame.totals.direct.orders,null);
});

test('explicit zero expense remains zero, cannot create a division ROAS and does not consume credit balance',async()=>{
 const {frame}=await read(full,raw=>raw.daily.forEach(row=>{row.expense=0;row.broad_gmv=0;row.broad_order=0;}));
 assert.equal(frame.status,'AVAILABLE');assert.equal(frame.expense_cents,0);assert.equal(frame.balance_cents,3107);assert.equal(frame.totals.broad.gmv_cents,0);assert.equal(frame.totals.broad.orders,0);assert.equal(frame.totals.broad.calculated_roas_raw,null);
});

test('invalid subcent expense and unsafe monthly aggregates cannot turn into a usable total',async()=>{
 const partial=(await read(full,(raw,part)=>{if(part.start_date==='2026-10-31')raw.daily[0].expense=0.1+0.2;})).frame;
 assert.equal(partial.status,'PARTIAL');assert.equal(partial.diagnostic,'ADS_CALENDAR_EXPENSE_INVALID');assert.equal(partial.expense_cents,null);assert.equal(partial.known_expense_cents,300);
 const overflow=(await read(full,raw=>raw.daily.forEach(row=>{row.expense='3000000000000';}))).frame;
 assert.equal(overflow.status,'UNAVAILABLE');assert.equal(overflow.expense_cents,null);assert.ok(projectAdsCalendar(overflow));
});

test('request dates, future day, extra fields and invalid clocks fail before any authenticated read',async()=>{
 const invalid=[null,{},[],{...full,extra:true},{start_date:'2026-09-30',end_date:'2026-10-31'},{start_date:'2026-10-31',end_date:'2026-10-01'},{start_date:'2026-02-30',end_date:'2026-03-01'},{start_date:'2026-11-02',end_date:'2026-11-02'}];
 for(const input of invalid){assert.equal(projectAdsCalendarRequest(input,{now}),null);const {frame,calls}=await read(input);assert.equal(frame.status,'UNAVAILABLE');assert.equal(frame.diagnostic,'ADS_CALENDAR_CONFIGURATION');assert.equal(calls.length,0);assert.ok(projectAdsCalendar(frame));}
 for(const clock of [()=>NaN,()=>{throw Error('PRIVATE');}]){const {frame,calls}=await read(full,()=>{},{now:clock});assert.equal(frame.status,'UNAVAILABLE');assert.equal(calls.length,0);assert.ok(!JSON.stringify(frame).includes('PRIVATE'));}
});

test('month selection handles 28, 29, 30 and 31 days, current Brasilia month and rejects conflicting selectors',()=>{
 const at=(month,clock=now)=>adsMeasurementPageSelection(new URL('https://app.brazacommerce.com.br/dashboard?month='+month),{now:clock});
 assert.deepEqual(at('2026-10'),full);assert.deepEqual(at('2026-09'),{start_date:'2026-09-01',end_date:'2026-09-30'});assert.deepEqual(at('2026-02'),{start_date:'2026-02-01',end_date:'2026-02-28'});assert.deepEqual(at('2024-02'),{start_date:'2024-02-01',end_date:'2024-02-29'});
 assert.deepEqual(at('2026-11'),{start_date:'2026-11-01',end_date:'2026-11-01'});
 const stillOctober=()=>Date.UTC(2026,10,1,1);assert.deepEqual(adsMeasurementPageSelection(new URL('https://app.brazacommerce.com.br/dashboard'),{now:stillOctober}),full);
 for(const query of ['month=2026-12','month=2026-13','month=2026-00','month=2026-2','month=0000-01','month=2026-10&month=2026-09','month=2026-10&start_date=2026-10-01','month=2026-10&end_date=2026-10-31'])assert.deepEqual(adsMeasurementPageSelection(new URL('https://app.brazacommerce.com.br/dashboard?'+query),{now}),{start_date:null,end_date:null});
});

test('one-day summary keeps the legacy verified measurement while a full month only carries its calendar contract',async()=>{
 const one={start_date:'2026-10-21',end_date:'2026-10-21'};
 const selected=async input=>getAdsSummary(env,input,{now,fetchImpl:async request=>{const q=new URL(request.url).searchParams;return Response.json(source({start_date:iso(q.get('start_date')),end_date:iso(q.get('end_date'))}));}});
 const daily=await selected(one);assert.equal(daily.ok,true);assert.equal(daily.calendar.schema,'ads_calendar_v1');assert.equal(daily.measurement.schema,'ads_measurement_v1');assert.deepEqual(daily.calendar.days,daily.measurement.days);assert.equal(daily.metrics.roas,99.88);
 const monthly=await selected(full);assert.equal(monthly.ok,true);assert.equal(monthly.measurement,undefined);assert.equal(monthly.calendar.total_days,31);assert.equal(monthly.metrics.roas,12.3);
});

test('standalone calendar projection rejects forged sums, ratios and private extras without invoking getters',async()=>{
 const {frame}=await read();
 for(const change of [value=>value.expense_cents++,value=>value.covered_days--,value=>value.days[0].broad.gmv_cents++,value=>value.totals.broad.gmv_cents++,value=>value.totals.broad.calculated_roas_raw='99.880000',value=>value.totals.broad.reported_roas_raw='99.88',value=>value.private_token='PRIVATE',value=>value.days[0].private_token='PRIVATE',value=>value.total_days=15,value=>value.source_timezone='America/Sao_Paulo']){const modified=structuredClone(frame);change(modified);assert.equal(projectAdsCalendar(modified),null);}
 let invoked=0;const poisoned={...frame};Object.defineProperty(poisoned,'days',{get(){invoked++;return frame.days;}});assert.equal(projectAdsCalendar(poisoned),null);assert.equal(invoked,0);
 const context=vm.createContext({});const actual=new vm.Script('('+projectAdsCalendar.toString()+')('+JSON.stringify(frame)+')').runInContext(context);assert.equal(JSON.stringify(actual),JSON.stringify(frame));
});

test('clock skew or a collection longer than one minute remains an unavailable finite frame',async()=>{
 let count=0;
 const {frame}=await read(full,()=>{},{now:()=>count++<2?stamp:stamp+61000});
 assert.equal(frame.status,'UNAVAILABLE');assert.equal(frame.expense_cents,null);assert.ok(projectAdsCalendar(frame));
});
