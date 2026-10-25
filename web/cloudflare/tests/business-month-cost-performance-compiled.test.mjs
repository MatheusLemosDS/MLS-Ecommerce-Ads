import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {collectionFixture} from './business-collection-fixture.mjs';

for(const minify of [false,true])test(`the emitted monthly owner controls recalculate saved costs without importing orders or Ads (minify=${minify})`,async t=>{
 const f=await collectionFixture({allPaid:true,windowCounts:[1,0],paymentDelayMs:0});t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let frame=await f.invoke('start');for(let i=0;frame.status==='RUNNING'&&i<8;i++)frame=await f.invoke('step');assert.equal(frame.status,'COMPLETE');frame=await f.invoke('ads');
 const {html}=await compiledOwnerReportPage(minify),script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(row=>row[1]).find(value=>value.includes('globalThis.brazaMonthDashboard='));assert.ok(script);
 const ids=[...html.matchAll(/\bid="(businessMonth[^"]*)"/g)].map(row=>row[1]),calls=[],before={finance:f.calls.finance.length,ads:f.calls.ads.length};
 const context=vm.createContext({URLSearchParams,clock:f.clock.time,ids,send:async(path,body)=>{calls.push({path,operation:body?.operation});assert.equal(path,'finance/business-month');assert.equal(body.operation,'read','local recalc may not start private order/payment or Ads collection');return JSON.stringify(await f.invoke('read'));}});
 vm.runInContext(`
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}globalThis.Date=ClockDate;globalThis.location={search:'?month=2026-10'};
 const timers=new Map();let sequence=0;const setTimeout=(callback,delay)=>{const id=++sequence;timers.set(id,{callback,delay});return id;},clearTimeout=id=>timers.delete(id);
 function element(tag='div'){return {tag,textContent:'',value:'',dataset:{},children:[],hidden:false,disabled:false,open:false,max:'',append(...values){this.children.push(...values);},replaceChildren(...values){this.textContent='';this.children=[...values];},setAttribute(){}};}
 const controls=new Map(ids.map(id=>[id,element()])),document={hidden:false,getElementById(id){if(!controls.has(id))throw Error('Unknown '+id);return controls.get(id);},createElement:element,addEventListener(){}};
 const api=async(path,body)=>JSON.parse(await send(path,body)),text=n=>n.textContent+n.children.map(text).join(' '),control=name=>controls.get('businessMonth'+name);
 `+script,context);
 assert.equal(await vm.runInContext('brazaMonthDashboard.start({api})',context),true);assert.deepEqual(calls.map(row=>row.operation),['read']);
 assert.equal(vm.runInContext("control('Refresh').textContent",context),'Recalcular custos');assert.equal(vm.runInContext("control('SourceRefresh').textContent",context),'Atualizar vendas');
 const originalSources=frame.source_checked_at,oldCost=frame.production_cost_cents,stored=f.env.ADMIN_DB.db.prepare('SELECT payload FROM production_costs_state WHERE id=1').get(),costs=JSON.parse(stored.payload);costs.inclusive_regular_cents+=500;
 f.env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET revision=revision+1,payload=? WHERE id=1').run(JSON.stringify(costs));
 assert.equal(await vm.runInContext("control('Refresh').onclick()",context),true);assert.deepEqual(calls.map(row=>row.operation),['read','read']);assert.equal(f.calls.finance.length,before.finance);assert.equal(f.calls.ads.length,before.ads);
 const local=await f.invoke('read');assert.equal(local.production_cost_cents,oldCost+500);assert.deepEqual(local.source_checked_at,originalSources);assert.equal(vm.runInContext("/dados salvos/.test(control('Status').textContent)",context),true);assert.match(vm.runInContext("text(control('CostOverview'))",context),/20,90/);
 vm.runInContext('brazaMonthDashboard.stop();',context);
});
