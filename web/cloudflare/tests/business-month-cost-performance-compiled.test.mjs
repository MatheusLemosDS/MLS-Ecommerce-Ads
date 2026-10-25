import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {collectionFixture} from './business-collection-fixture.mjs';
import {readBusinessMonthDisplay} from '../src/business-month.mjs';
import {buildBusinessMonthView,requestBusinessMonthRefresh} from '../src/business-month-view-state.mjs';
import {readBusinessSyncState,runBusinessSync} from '../src/business-sync.mjs';

async function savedView(f,month){return buildBusinessMonthView(await readBusinessMonthDisplay(f.env,{month},{now:f.now}),await readBusinessSyncState(f.env),{now:f.now});}

for(const minify of [false,true])test(`the emitted monthly owner controls recalculate saved costs without importing orders or Ads (minify=${minify})`,async t=>{
 // The order belongs to the current window: a later explicit cron can verify
 // its cancellation without relying on a still-valid historical-window cache.
 const f=await collectionFixture({allPaid:true,windowCounts:[0,1],paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let frame=await f.invoke('start');for(let i=0;frame.status==='RUNNING'&&i<8;i++)frame=await f.invoke('step');assert.equal(frame.status,'COMPLETE');frame=await f.invoke('ads');
 const {html}=await compiledOwnerReportPage(minify),script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(row=>row[1]).find(value=>value.includes('globalThis.brazaMonthDashboard='));assert.ok(script);
 const ids=[...html.matchAll(/\bid="(businessMonth[^"]*)"/g)].map(row=>row[1]),calls=[],before={finance:f.calls.finance.length,ads:f.calls.ads.length};
 let hold=false,entered,release;const context=vm.createContext({URLSearchParams,clock:f.clock.time,ids,send:async(path,body)=>{calls.push({path,body});if(path==='finance/business-month-request'){assert.deepEqual(JSON.parse(JSON.stringify(body)),{month:'2026-10'});return JSON.stringify(await requestBusinessMonthRefresh(f.env,{month:'2026-10'},{now:f.now}));}assert.match(path,/^finance\/business-month-view\?month=2026-(?:09|10)$/);assert.equal(body,undefined,'passive reads cannot request private finance or Ads collection');const selected=path.slice(path.indexOf('=')+1),view=await savedView(f,selected);if(hold&&selected==='2026-10'){hold=false;entered();return new Promise(resolve=>{release=()=>resolve(JSON.stringify(view));});}return JSON.stringify(view);}});
 vm.runInContext(`
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}globalThis.Date=ClockDate;globalThis.location={search:'?month=2026-10'};
 const timers=new Map();let sequence=0;const setTimeout=(callback,delay)=>{const id=++sequence;timers.set(id,{callback,delay});return id;},clearTimeout=id=>timers.delete(id);
 function element(tag='div'){return {tag,textContent:'',value:'',dataset:{},children:[],hidden:false,disabled:false,open:false,max:'',append(...values){this.children.push(...values);},replaceChildren(...values){this.textContent='';this.children=[...values];},setAttribute(){}};}
 const controls=new Map(ids.map(id=>[id,element()])),document={hidden:false,getElementById(id){if(!controls.has(id))throw Error('Unknown '+id);return controls.get(id);},createElement:element,addEventListener(){}};
 const api=async(path,body)=>JSON.parse(await send(path,body)),text=n=>n.textContent+n.children.map(text).join(' '),control=name=>controls.get('businessMonth'+name);
 `+script,context);
 assert.equal(await vm.runInContext('brazaMonthDashboard.start({api})',context),true);assert.deepEqual(calls.map(row=>row.path),['finance/business-month-view?month=2026-10']);assert.equal(f.calls.finance.length,before.finance);assert.equal(f.calls.ads.length,before.ads);
 assert.equal(vm.runInContext("control('Refresh').textContent",context),'Recalcular custos');assert.equal(vm.runInContext("control('SourceRefresh').textContent",context),'Atualizar vendas');
 const originalSources=frame.source_checked_at,oldCost=frame.production_cost_cents,stored=f.env.ADMIN_DB.db.prepare('SELECT payload FROM production_costs_state WHERE id=1').get(),costs=JSON.parse(stored.payload);costs.inclusive_regular_cents+=500;
 f.env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET revision=revision+1,payload=? WHERE id=1').run(JSON.stringify(costs));
 vm.runInContext("control('ExpensesValue').value='37,50';control('ExpensesValue').oninput();",context);assert.equal(await vm.runInContext("control('Refresh').onclick()",context),true);assert.deepEqual(calls.map(row=>row.path),Array(2).fill('finance/business-month-view?month=2026-10'));assert.equal(f.calls.finance.length,before.finance);assert.equal(f.calls.ads.length,before.ads);assert.equal(vm.runInContext("control('ExpensesValue').value",context),'37,50');
 const local=await f.invoke('read');assert.equal(local.production_cost_cents,oldCost+500);assert.deepEqual(local.source_checked_at,originalSources);assert.match(vm.runInContext("control('Status').textContent",context),/salvos/);assert.match(vm.runInContext("text(control('CostOverview'))",context),/20,90/);
 // Updating sales queues the collector; only an explicitly executed backend
 // cron below may import the newly cancelled order.
 f.clock.time+=61000;context.clock=f.clock.time;const requestedAt=calls.length;assert.equal(await vm.runInContext("control('SourceRefresh').onclick()",context),true);assert.deepEqual(calls.slice(requestedAt).map(row=>row.path),['finance/business-month-request','finance/business-month-view?month=2026-10']);assert.equal(f.calls.finance.length,before.finance);assert.equal(f.calls.ads.length,before.ads);
 f.state.detailHook=({ids})=>f.provider({order_list:ids.map(index=>({order_sn:f.serial(index),order_status:'CANCELLED',currency:'BRL',create_time:Date.UTC(2026,9,20,12)/1000,item_list:[{item_id:f.item(index),model_id:0,model_quantity_purchased:1}]}))});const collected=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(collected.status,'COMPLETE');assert.equal(collected.state.summary.coverage.paid,0);assert.equal(collected.state.summary.coverage.cancelled,1);assert.equal(f.calls.payment.length,1,'the cancellation does not cause another escrow read');const afterCron={finance:f.calls.finance.length,ads:f.calls.ads.length};assert.equal(await vm.runInContext("control('Refresh').onclick()",context),true);assert.equal(f.calls.finance.length,afterCron.finance);assert.equal(f.calls.ads.length,afterCron.ads);assert.match(vm.runInContext("text(control('CostOverview'))",context),/0,00/);assert.equal((await savedView(f,'2026-10')).display.production_cost_cents,0);
 // A delayed local read from October cannot replace a subsequently selected
 // September view. All requests in this generation race are passive reads.
 const ready=new Promise(resolve=>{entered=resolve;});hold=true;const late=vm.runInContext("control('Refresh').onclick()",context);await ready;assert.equal(await vm.runInContext("control('Select').value='2026-09';control('Select').onchange()",context),true);const september=vm.runInContext("control('CollectionState').textContent",context);assert.match(september,/2026-09-01/);release();assert.equal(await late,false);assert.equal(vm.runInContext("control('Select').value",context),'2026-09');assert.equal(vm.runInContext("control('CollectionState').textContent",context),september);assert.equal(f.calls.finance.length,afterCron.finance);assert.equal(f.calls.ads.length,afterCron.ads);assert.ok(calls.every(call=>call.body===undefined||call.path==='finance/business-month-request'));
 vm.runInContext('brazaMonthDashboard.stop();',context);
});
