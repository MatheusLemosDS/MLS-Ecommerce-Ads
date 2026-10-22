import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {D1} from './sqlite-d1.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';

const current='2026-10-22T12:00:00Z',stamp=Date.parse(current)/1000;

function monthlyFrame(){
 const selections=[{start_date:'2026-10-01',end_date:'2026-10-15'},{start_date:'2026-10-16',end_date:'2026-10-22'}];
 const children=selections.map(selection=>{
  const days=Array.from({length:Number(selection.end_date.slice(8))-Number(selection.start_date.slice(8))+1},(_,index)=>'2026-10-'+String(Number(selection.start_date.slice(8))+index).padStart(2,'0'));
  return buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:selection,balance:9999,daily:days.map(date=>({date,expense:date==='2026-10-22'?'10':'0',broad_gmv:date==='2026-10-22'?'200':'0',broad_order:date==='2026-10-22'?5:0,broad_roas:20,direct_gmv:0,direct_order:0,direct_roas:0}))},selection,stamp);
 });
 const ads=buildAdsCalendar(children,{start_date:'2026-10-01',end_date:'2026-10-22'},stamp);
 const frame={
  schema:'business_month_v1',month:'2026-10',start_date:'2026-10-01',end_date:'2026-10-22',status:'COMPLETE',checked_at:stamp,
  progress:{windows_total:2,windows_complete:2,pages_read:2},
  coverage:{orders:4,paid:2,completed:1,ongoing:1,cancelled:1,cancel_pending:0,unpaid:1,other:0,unknown:0,payment_covered:2,payment_missing:0,returns:0,returns_unknown:0},
  sales_cents:10000,known_sales_cents:10000,expected_repass_cents:8000,known_expected_repass_cents:8000,production_cost_cents:2000,known_production_cost_cents:2000,invoice_tax_cents:200,known_invoice_tax_cents:200,ads_adjustment_cents:0,ads,
  expenses:{revision:1,external_expenses_cents:500,recharge_treatment:'UNCONFIRMED',updated_at:current},
  result:{net_estimate_cents:4300,net_profit_cents:null,net_margin_bps:4300,pending:[],basis:'PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE'},
  unmapped_variants:[],bindings_revision:2,costs_revision:3
 };
 assert.ok(projectBusinessMonth(frame),'the response fixture must satisfy the production financial checks');
 return frame;
}

async function bundledAdminHtml(minify){
 // Bundle the deployable artifact, rather than the source CLIENT constant:
 // Wrangler can rename declarations and references before .toString() executes.
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const base='https://app.example.test';
 const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'bundled-test-session-secret-'+ 's'.repeat(40),ADMIN_USERNAME:'bundled-admin-fixture',ADMIN_PASSWORD:'bundled-password-fixture-123456'};
 try{
  const login=await worker.fetch(new Request(base+'/admin/login',{method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
  assert.equal(login.status,303,'the real bundled Worker must accept the fixture admin session');
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const response=await worker.fetch(new Request(base+'/admin',{headers:{cookie}}),env);
  assert.equal(response.status,200);
  return await response.text();
 }finally{env.ADMIN_DB.db.close();}
}

function verifyReportAndDailyAds(html){
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
 const legacy=scripts.find(script=>script.includes('let renderedReportKey='));
 assert.ok(legacy,'the admin page must include the report and daily Ads client');
 // These are the real helper declarations emitted before the admin UI starts;
 // evaluating them separately needs no DOM, HTTP listener or browser process.
 const helpers=legacy.slice(0,legacy.indexOf('let renderedReportKey='));
 const context=vm.createContext();
 new vm.Script(helpers).runInContext(context);
 const report='Investimento raw: 10.00\nROAS raw 20.00 20.00\nStatus econômico: UNKNOWN.';
 const parsed=new vm.Script('parseReport('+JSON.stringify(report)+')').runInContext(context);
 assert.equal(parsed.investment,'10.00');assert.equal(parsed.original,report);
 const selection={start_date:'2026-10-22',end_date:'2026-10-22'};
 const measurement=buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:selection,balance:9999,daily:[{date:'2026-10-22',expense:'10',broad_gmv:'200',broad_order:5,broad_roas:20,direct_gmv:0,direct_order:0,direct_roas:0}]},selection,stamp);
 context.serialized=JSON.stringify(measurement);
 const projected=new vm.Script('projectAdsMeasurement(JSON.parse(serialized))').runInContext(context);
 assert.ok(projected,'the emitted daily Ads helper must accept a complete response');
 assert.equal(projected.expense_cents,1000);assert.equal(projected.totals.broad.gmv_cents,20000);
}

function monthlyBrowser(html){
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
 assert.ok(scripts.length>=2,'the rendered page must contain its browser scripts');
 for(const script of scripts)new vm.Script(script);
 const monthly=scripts.filter(script=>script.includes('globalThis.brazaMonthDashboard='));
 assert.equal(monthly.length,1,'the rendered page must contain exactly one monthly client');
 const ids=[...html.matchAll(/\bid="(businessMonth[^"]*)"/g)].map(match=>match[1]);
 const context=vm.createContext({URLSearchParams});
 new vm.Script(`
 const clock=Date.parse(${JSON.stringify(current)});
 class ClockDate extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 globalThis.Date=ClockDate;globalThis.location={search:''};
 const timers=new Map();let nextTimer=0;
 const setTimeout=(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback,delay});return id;},clearTimeout=id=>timers.delete(id);
 function node(tag='div',text=''){return {tag,textContent:text,value:'',dataset:{},children:[],hidden:false,disabled:false,open:false,max:'',append(...values){this.children.push(...values);},replaceChildren(...values){this.textContent='';this.children=[...values];},setAttribute(){}};}
 const controls=new Map(${JSON.stringify(ids)}.map(id=>[id,node()]));
 const document={hidden:false,getElementById(id){if(!controls.has(id))throw Error('UNKNOWN_CONTROL:'+id);return controls.get(id);},createElement:tag=>node(tag),addEventListener(){}};
 const text=element=>element.textContent+element.children.map(text).join(' '),control=name=>controls.get('businessMonth'+name);
 let frame=JSON.parse(${JSON.stringify(JSON.stringify(monthlyFrame()))});const calls=[];
 const api=async(path,body)=>{calls.push({path,body});return JSON.parse(JSON.stringify(frame));};
 const syncVariants=async()=>true;
 `+monthly[0]).runInContext(context);
 const run=source=>new vm.Script(source).runInContext(context);
 return {run,text:name=>run('text(control('+JSON.stringify(name)+'))')};
}

for(const minify of [false,true]){
 test(`deployed monthly client validates and renders financial and Ads responses after esbuild (minify=${minify})`,async()=>{
  const html=await bundledAdminHtml(minify);
  const browser=monthlyBrowser(html);
  const started=await browser.run('brazaMonthDashboard.start({api,syncVariants})');
  assert.equal(started,true,browser.text('Status'));
  assert.match(browser.text('Sales'),/100,00/);
  assert.match(browser.text('Ads'),/10,00/);
  assert.equal(browser.text('Roas'),'20,00x');
  assert.match(browser.text('Net'),/43,00/);
  assert.match(browser.text('Coverage'),/1 cancelado\(s\) excluído\(s\)/);
  assert.deepEqual(JSON.parse(browser.run('JSON.stringify(calls.map(call=>call.body.operation))')),['start','ads']);
  // A second real response exercises the embedded projector again, including
  // the nested Ads calendar check, rather than just compiling the script.
  await browser.run('brazaMonthDashboard.refreshCosts()');
  assert.equal(browser.run('calls.at(-1).body.operation'),'read');
  assert.match(browser.text('Net'),/43,00/);
  assert.doesNotMatch(browser.text('Status'),/is not defined/);
  verifyReportAndDailyAds(html);
 });
}
