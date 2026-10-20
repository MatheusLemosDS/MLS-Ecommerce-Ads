import test from 'node:test';
import assert from 'node:assert/strict';
import {getAdsPeriod,projectAdsPeriod,projectAdsPeriodRequest} from '../src/ads-period.mjs';

const stamp=Date.UTC(2026,9,20,12),now=()=>stamp;
const input={start_date:'2026-10-18',end_date:'2026-10-20'},env={APP_INTERNAL_SECRET:'fixture-private-app-key'};
const payload=()=>({status:'ok',connected:true,shop:{id:1178167501,name:'PRIVATE_SHOP'},period:{start_date:'18-10-2026',end_date:'20-10-2026'},metrics:{spend:999999999},balance:123456,daily:[{date:'18-10-2026',expense:0.1,direct_order:4,broad_order:5},{date:'2026-10-19',expense:'0.20'},{date:'20/10/2026',expense:50}],private_token:'PRIVATE_TOKEN'});
async function read(raw=payload(),options={}){
 const calls=[];const frame=await getAdsPeriod(env,input,{now,fetchImpl:async request=>{calls.push(request);return Response.json(raw);},...options});
 return {frame,calls};
}
const unavailable=frame=>{assert.equal(frame.status,'UNAVAILABLE');assert.equal(frame.expense_cents,null);assert.ok(projectAdsPeriod(frame));};

test('exact request selects fixed authenticated summary, DMY dates and raw daily amounts only',async()=>{
 const {frame,calls}=await read(),request=calls[0],url=new URL(request.url);
 assert.equal(url.origin,'https://auth.brazacommerce.com.br');assert.equal(url.pathname,'/internal/shopee/ads/summary');assert.deepEqual([...url.searchParams],[['start_date','18-10-2026'],['end_date','20-10-2026']]);
 assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');assert.equal(request.headers.get('X-Braza-App-Key'),env.APP_INTERNAL_SECRET);assert.equal(request.headers.get('Accept'),'application/json');
 for(const name of ['cookie','authorization','x-braza-finance-router'])assert.equal(request.headers.get(name),null);
 assert.equal(frame.status,'AVAILABLE');assert.equal(frame.expense_cents,5030);assert.deepEqual(frame.days,[{date:'2026-10-18',expense_cents:10},{date:'2026-10-19',expense_cents:20},{date:'2026-10-20',expense_cents:5000}]);
 assert.equal(frame.day_partial,true);assert.equal(frame.covered_days,3);assert.deepEqual(frame.missing_dates,[]);assert.deepEqual(projectAdsPeriod(frame),frame);
 assert.equal(frame.basis,'CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION');assert.equal(frame.source_timezone,'UNCONFIRMED');assert.equal(frame.unit_confirmation,'OPERATOR_CONFIRMED_BRL_2026_10_20');
 for(const secret of ['PRIVATE_SHOP','PRIVATE_TOKEN',env.APP_INTERNAL_SECRET,'999999999','direct_order','broad_order'])assert.ok(!JSON.stringify(frame).includes(secret));
});

test('request rejects invalid dates, future Sao Paulo days, more than fifteen days and extra selectors before fetching',async()=>{
 const invalid=[{...input,end_date:'2026-10-21'},{start_date:'2026-10-01',end_date:'2026-10-20'},{...input,start_date:'2026-02-30'},{start_date:'2026-10-20',end_date:'2026-10-19'},{...input,shop_id:'OTHER'},null,{}];let calls=0;
 for(const selection of invalid){assert.equal(projectAdsPeriodRequest(selection,{now}),null);unavailable(await getAdsPeriod(env,selection,{now,fetchImpl:async()=>{calls++;throw Error('not reached');}}));}
 assert.equal(calls,0);assert.deepEqual(projectAdsPeriodRequest({start_date:'2026-10-06',end_date:'2026-10-20'},{now}),{start_date:'2026-10-06',end_date:'2026-10-20'});
 const midnight=()=>Date.UTC(2026,9,21,1);assert.equal(projectAdsPeriodRequest({...input,end_date:'2026-10-21'},{now:midnight}),null);
 for(const options of [{now:()=>NaN},{now:()=>{throw Error('PRIVATE_CLOCK');}},{fetchImpl:null},{timeoutMs:4},{timeoutMs:10001}])unavailable(await getAdsPeriod(env,input,{now,...options}));
});

test('source identity, connection, period and native success flag are independently pinned',async()=>{
 for(const mutate of [p=>p.status='error',p=>p.ok=false,p=>delete p.status,p=>p.connected=false,p=>p.shop.id=2047569,p=>p.shop.id='01178167501',p=>p.period.start_date='17-10-2026',p=>p.period.end_date='21-10-2026',p=>p.daily={},p=>p.daily=Array(16).fill(p.daily[0])]){
  const source=payload();mutate(source);unavailable((await read(source)).frame);
 }
 const source=payload();source.shop.id='1178167501';source.ok=true;assert.equal((await read(source)).frame.status,'AVAILABLE');
});

test('missing days stay partial; missing, invalid and sub-cent amounts never become zero or a confirmed total',async()=>{
 const missing=payload();missing.daily.splice(1,1);let frame=(await read(missing)).frame;
 assert.equal(frame.status,'PARTIAL');assert.equal(frame.expense_cents,null);assert.equal(frame.covered_days,2);assert.deepEqual(frame.missing_dates,['2026-10-19']);assert.equal(frame.days[1].expense_cents,null);assert.equal(frame.diagnostic,'ADS_PERIOD_DATE_COVERAGE_PARTIAL');assert.ok(projectAdsPeriod(frame));
 for(const value of [null,true,false,-1,'-0','', ' ', '01.00','1e2','50,00','Infinity', '0.001',0.1+0.2,90071992547409.9,9007199254740992,'900719925474099.99',{},[]]){
  const source=payload();source.daily[1].expense=value;frame=(await read(source)).frame;assert.equal(frame.status,'PARTIAL',String(value));assert.equal(frame.expense_cents,null);assert.equal(frame.days[1].expense_cents,null);assert.equal(frame.diagnostic,'ADS_PERIOD_EXPENSE_INVALID');assert.ok(projectAdsPeriod(frame));
 }
 const source=payload();delete source.daily[1].expense;frame=(await read(source)).frame;assert.equal(frame.status,'PARTIAL');assert.equal(frame.days[1].expense_cents,null);
 const negativeZero=JSON.stringify(payload()).replace('"expense":"0.20"','"expense":-0');frame=(await read(undefined,{fetchImpl:async()=>new Response(negativeZero,{headers:{'content-type':'application/json'}})})).frame;assert.equal(frame.status,'PARTIAL');assert.equal(frame.days[1].expense_cents,null);
});

test('numeric and text decimal values retain exact cents, explicit zero is available only with complete rows',async()=>{
 for(const [value,cents] of [[50,5000],['50',5000],['50.00',5000],[0,0],['0.00',0],[0.1,10],[0.2,20],[1e-2,1],[1e2,10000],['1.2300',123]]){
  const source=payload();source.daily.forEach(day=>day.expense=value);const {frame}=await read(source);assert.equal(frame.status,'AVAILABLE');assert.equal(frame.expense_cents,cents*3);
 }
 const source=payload();source.daily=[];const {frame}=await read(source);assert.equal(frame.status,'PARTIAL');assert.equal(frame.expense_cents,null);assert.equal(frame.covered_days,0);assert.deepEqual(frame.missing_dates,['2026-10-18','2026-10-19','2026-10-20']);
});

test('duplicate, unknown and foreign source days invalidate the entire result rather than combining ambiguous rows',async()=>{
 for(const mutate of [p=>p.daily[1].date='18-10-2026',p=>p.daily[1].date='21-10-2026',p=>p.daily[1].date='31-02-2026',p=>p.daily[1].date=null,p=>p.daily[1]=null]){
  const source=payload();mutate(source);unavailable((await read(source)).frame);
 }
 const source=payload();source.daily.reverse();assert.equal((await read(source)).frame.expense_cents,5030);
});

test('day-partial is derived in Sao Paulo and source metadata does not promote report timezone or completeness',async()=>{
 const source=payload();source.period.end_date='19-10-2026';source.daily.pop();const selected={start_date:'2026-10-18',end_date:'2026-10-19'};
 const frame=await getAdsPeriod(env,selected,{now,fetchImpl:async()=>Response.json(source)});assert.equal(frame.status,'AVAILABLE');assert.equal(frame.day_partial,false);assert.equal(frame.source_timezone,'UNCONFIRMED');assert.equal(frame.expense_cents,30);
});

test('safe individual daily amounts cannot overflow into an available period total',async()=>{
 const source=payload();source.daily.forEach(day=>day.expense='40000000000000');const {frame}=await read(source);unavailable(frame);assert.equal(frame.diagnostic,'ADS_PERIOD_ARITHMETIC_UNSAFE');
});

test('projection rejects invented sums, removed coverage, duplicates, private extras and false measurement labels',async()=>{
 const frame=(await read()).frame;
 for(const change of [v=>v.expense_cents++,v=>v.covered_days--,v=>v.days[1].date=v.days[0].date,v=>v.days[1].expense_cents=-1,v=>v.days[0].secret='PRIVATE',v=>v.private_token='PRIVATE',v=>v.unit_confirmation='UNKNOWN',v=>v.source_timezone='America/Sao_Paulo',v=>v.basis='ORDER_ATTRIBUTION',v=>v.day_partial=false,v=>v.diagnostic='PRIVATE_ERROR',v=>v.days.reverse(),v=>v.missing_dates=['2026-10-19']]){
  const modified=structuredClone(frame);change(modified);assert.equal(projectAdsPeriod(modified),null);
 }
 const modified={...frame};let invoked=0;Object.defineProperty(modified,'days',{get(){invoked++;return frame.days;}});assert.equal(projectAdsPeriod(modified),null);assert.equal(invoked,0);
 const malformed={...frame,missing_dates:[{toJSON(){invoked++;return '2026-10-19';}}]};assert.equal(projectAdsPeriod(malformed),null);assert.equal(invoked,0);
 const incomplete=payload();incomplete.daily.pop();const partial=(await read(incomplete)).frame;assert.ok(projectAdsPeriod(partial));assert.equal(projectAdsPeriod({...partial,status:'AVAILABLE',expense_cents:30}),null);
});

test('response length, UTF-8, JSON headers, HTTP and redirect guards return finite failures without private bodies',async()=>{
 for(const response of [new Response('PRIVATE_ERROR',{status:403}),new Response('PRIVATE_ERROR',{status:302,headers:{location:'https://evil.example'}}),new Response('PRIVATE_ERROR',{headers:{'content-type':'text/html'}}),new Response(new Uint8Array([255]),{headers:{'content-type':'application/json'}}),new Response('{PRIVATE',{headers:{'content-type':'application/json'}}),new Response('{}',{headers:{'content-type':'application/json; charset=latin1'}}),new Response('{}',{headers:{'content-type':'application/json','content-length':'65537'}}),new Response('{}',{headers:{'content-type':'application/json','content-length':'-1'}})]){
  const frame=await getAdsPeriod(env,input,{now,fetchImpl:async()=>response});unavailable(frame);assert.ok(!JSON.stringify(frame).includes('PRIVATE_ERROR'));
 }
});

test('64 KiB response is accepted, next byte rejected, and oversized or early-refused streams are cancelled',async()=>{
 const source={...payload(),padding:''},base=JSON.stringify(source);source.padding='x'.repeat(65536-base.length);const raw=JSON.stringify(source);assert.equal(raw.length,65536);
 assert.equal((await read(undefined,{fetchImpl:async()=>new Response(raw,{headers:{'content-type':'application/json'}})})).frame.status,'AVAILABLE');
 let cancelled=0;const stream=()=>new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(raw+' '));},cancel(){cancelled++;}});
 unavailable((await read(undefined,{fetchImpl:async()=>new Response(stream(),{headers:{'content-type':'application/json'}})})).frame);assert.equal(cancelled,1);
 unavailable((await read(undefined,{fetchImpl:async()=>new Response(stream(),{status:403,headers:{'content-type':'application/json'}})})).frame);assert.equal(cancelled,2);
});

test('deadline bounds ignored aborts and a hung response body, cancels streams and never retries',async()=>{
 let calls=0,request;const started=Date.now();let frame=await getAdsPeriod(env,input,{now,timeoutMs:5,fetchImpl:async value=>{calls++;request=value;return new Promise(()=>{});}});unavailable(frame);assert.equal(calls,1);assert.equal(request.signal.aborted,true);assert.ok(Date.now()-started<1000);
 let cancelled=0;frame=await getAdsPeriod(env,input,{now,timeoutMs:5,fetchImpl:async()=>new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled++;}}),{headers:{'content-type':'application/json'}})});unavailable(frame);assert.equal(cancelled,1);
});
