import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {collectionFixture} from './business-collection-fixture.mjs';
import {projectBusinessMonth,businessMonthClientFrame} from '../src/business-month.mjs';
import {LEGACY_MONTH_PROJECTORS,LEGACY_FRAME_GUARD,LEGACY_COLLECTION_DIAGNOSTIC} from './legacy-business-month-projectors-d487da7.mjs';

const raw=cents=>{const text=String(cents);return (text.slice(0,-2)||'0')+'.'+text.slice(-2).padStart(2,'0');};
async function realMonthlyResponses(t){
 const f=await collectionFixture();t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 const empty=await f.services.getFinanceBusinessPeriod(f.env,{operation:'start',start_date:'2026-10-01',end_date:'2026-10-15'});
 f.clock.time=Date.UTC(2026,9,25,12);let fresh=false;
 f.services.getFinanceBusinessPeriod=async(_,selection)=>{
  const count=fresh||selection.start_date!=='2026-10-01'?0:241,at=f.now()/1000,base=raw(6525*count),payout=raw(4751*count),tax=raw(131*count),status=fresh?'RUNNING':'COMPLETE';
  const frame={...structuredClone(empty),run_id:(fresh?'33333333-3333-4333-8333-':selection.start_date==='2026-10-01'?'11111111-1111-4111-8111-':'22222222-2222-4222-8222-')+'111111111111',revision:count?14:1,status,start_date:selection.start_date,end_date:selection.end_date,cutoff_at:at,checked_at:at,source_checked_at:{oldest_at:at,latest_at:at},pages_read:fresh?0:count?13:1,coverage:{orders:count,paid:count,completed:count,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:count,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:base,sales_base_raw:base,known_expected_repass_raw:payout,expected_repass_raw:payout,known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{...empty.invoice_tax,covered_orders:count,known_base_raw:base,known_tax_raw:tax},items:count?[{item_id:'1000',model_id:'0',quantity:count}]:[]};
  frame.product_breakdown={...empty.product_breakdown,products:count?[{item_id:'1000',quantity:count,orders:count,exclusive_orders:count,mixed_orders:0,exclusive_payment_covered:count,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,known_exclusive_sales_base_raw:base,exclusive_sales_base_raw:base,known_exclusive_expected_repass_raw:payout,exclusive_expected_repass_raw:payout,known_exclusive_ads_adjustment_raw:'0',exclusive_ads_adjustment_raw:'0',known_exclusive_invoice_tax_raw:tax,exclusive_invoice_tax_raw:tax,items:[{model_id:'0',exclusive_quantity:count,mixed_quantity:0}]}]:[]};
  for(const name of ['known_sales_base_raw','sales_base_raw','known_expected_repass_raw','expected_repass_raw'])frame[name]=frame[name].replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');
  frame.invoice_tax.known_base_raw=frame.known_sales_base_raw;frame.invoice_tax.known_tax_raw=tax.replace(/\.00$/,'').replace(/(\.\d)0$/,'$1');
  return frame;
 };
 await f.invoke('start');await f.invoke('step');await f.invoke('ads');f.clock.time+=901000;
 const cached=await f.invoke('ads');fresh=true;const started=await f.invoke('start');
 assert.equal(cached.status,'COMPLETE');assert.equal(cached.coverage.paid,241);assert.equal(cached.ads.covered_days,25);assert.equal(started.status,'RUNNING');assert.equal(started.coverage.orders,0);assert.equal(started.ads.status,'AVAILABLE');
 for(const value of [cached,started]){assert.ok(projectBusinessMonth(value));assert.deepEqual(projectBusinessMonth(JSON.parse(JSON.stringify(value))),value);}
 return {f,cached,started};
}

async function ownerHtml(minify,env){
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'))).default,origin='https://app.month-projector.test';
 Object.assign(env,{ADMIN_SESSION_SECRET:'compiled-projector-session-'+'s'.repeat(32),ADMIN_USERNAME:'projection-owner',ADMIN_PASSWORD:'projection-fixture-password-123456'});
 const login=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);
 const cookie=login.headers.get('set-cookie').split(';')[0];return (await worker.fetch(new Request(origin+'/admin',{headers:{cookie}}),env)).text();
}

for(const minify of [false,true])test(`the actual owner HTML projector accepts a cached 241-order month and its zero-order restart with retained Ads (minify=${minify})`,async t=>{
 const {f,cached,started}=await realMonthlyResponses(t),html=await ownerHtml(minify,f.env),script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]).find(value=>value.includes('globalThis.brazaMonthDashboard='));assert.ok(script);
 const prefix=script.slice(script.indexOf('(()=>{')+6,script.indexOf(' const el=id=>'));
 const context=vm.createContext({serialized:JSON.stringify({cached,started})});
 vm.runInContext(prefix+'\nglobalThis.project=projectBusinessMonth;globalThis.summary=buildMonthlyFinancialSummary;globalThis.data=JSON.parse(serialized);',context);
 assert.equal(vm.runInContext('project(data.cached)!==null',context),true,'cached server response rejected by actual embedded projector');
 assert.equal(vm.runInContext('project(data.started)!==null',context),true,'zero-order restart rejected by actual embedded projector');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(project(data.started))',context)),started);
 assert.equal(vm.runInContext('summary(project(data.cached)).state',context),'PROVISIONAL');
 assert.equal(vm.runInContext('Number.isSafeInteger(summary(project(data.cached)).balance_cents)',context),true,'the emitted summary must work without a server closure');
 assert.equal(vm.runInContext('summary(project(data.started)).balance_cents',context),null,'a fresh partial import cannot acquire a whole-store balance');
});

function legacyBrowser(cached,started){
 const context=vm.createContext({serialized:JSON.stringify({cached,started})});
 vm.runInContext(`
  ${LEGACY_MONTH_PROJECTORS}
  ${LEGACY_FRAME_GUARD}
  ${LEGACY_COLLECTION_DIAGNOSTIC}
  const data=JSON.parse(serialized),legacy=value=>{const output=JSON.parse(JSON.stringify(value));delete output.collection;return output;};let frame=checkedFrame(legacy(data.cached),'2026-10'),diagnostic=null,message='';
  // The previous owner page catches the guard failure while retaining its
  // displayed frame. Keep this request flow thin; the validator is frozen.
  async function refresh(response=data.started){try{frame=checkedFrame(response,'2026-10');return true;}catch(error){diagnostic=collectionDiagnostic('start',error);message=error.message;return false;}}
 `,context);
 return {run:source=>vm.runInContext(source,context)};
}

test('a page left open on d487da7 reproduces the exact start failure when the next release adds an unknown collection field',async t=>{
 const {cached,started}=await realMonthlyResponses(t),browser=legacyBrowser(cached,started);
 assert.equal(browser.run('frame.coverage.paid'),241);assert.equal(browser.run('frame.ads.covered_days'),25);
 assert.equal(await browser.run('refresh()'),false);
 assert.equal(browser.run('message'),'Os dados mensais não puderam ser conferidos. Atualize o mês para tentar novamente.');
 assert.deepEqual(JSON.parse(browser.run('JSON.stringify(diagnostic)')),{operation:'start',code:'BUSINESS_MONTH_REQUEST_FAILED',api_code:null,http:null});
 assert.equal(browser.run('frame.coverage.paid'),241);assert.equal(browser.run('frame.ads.covered_days'),25);
});

test('the negotiated legacy response is accepted by the frozen old guard and a yielded page stops its immediate step loop',async t=>{
 const {cached,started}=await realMonthlyResponses(t),browser=legacyBrowser(cached,started),legacy=businessMonthClientFrame(started);
 assert.equal(Object.hasOwn(legacy,'collection'),false);assert.equal(businessMonthClientFrame(started,'business-month-v2'),started);
 assert.equal(await browser.run('refresh(JSON.parse('+JSON.stringify(JSON.stringify(legacy))+'))'),true);
 assert.equal(browser.run('frame.coverage.orders'),0);assert.equal(browser.run('frame.ads.covered_days'),25);
 const waiting={...started,collection:{schema:'business_month_collection_v1',state:'RETRY_WAIT',code:'BUSINESS_PERIOD_CHECKPOINT',retry_after_seconds:1}};
 assert.ok(projectBusinessMonth(waiting));const waitingLegacy=businessMonthClientFrame(waiting);
 assert.equal(await browser.run('refresh(JSON.parse('+JSON.stringify(JSON.stringify(waitingLegacy))+'))'),true);
 assert.equal(browser.run("frame.result.pending.includes('SOURCE_UNAVAILABLE')"),true);
 assert.equal(waiting.result.pending.includes('SOURCE_UNAVAILABLE'),false,'legacy pausing never mutates the modern server frame');
 assert.equal(browser.run('frame.result.net_estimate_cents'),null);assert.deepEqual(waitingLegacy.progress,waiting.progress);assert.equal(waitingLegacy.known_sales_cents,waiting.known_sales_cents);
});
