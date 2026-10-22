import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {BUSINESS_MONTH_CLIENT} from '../src/business-month-client.mjs';
import {BUSINESS_MONTH_CSS,businessMonthBody} from '../src/business-month-view.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';

const current='2026-10-22T12:00:00Z',stamp=Date.parse(current)/1000;
function calendar(month='2026-10',end=22){
 const selections=Array.from({length:Math.ceil(end/15)},(_,index)=>({start_date:month+'-'+String(index*15+1).padStart(2,'0'),end_date:month+'-'+String(Math.min(end,index*15+15)).padStart(2,'0')}));
 const children=selections.map(selection=>{
  const days=Array.from({length:Number(selection.end_date.slice(8))-Number(selection.start_date.slice(8))+1},(_,index)=>month+'-'+String(Number(selection.start_date.slice(8))+index).padStart(2,'0'));
  return buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:selection,balance:9999,daily:days.map(date=>({date,expense:Number(date.slice(8))===end?'10':'0',broad_gmv:Number(date.slice(8))===end?'200':'0',broad_order:Number(date.slice(8))===end?5:0,broad_roas:20,direct_gmv:0,direct_order:0,direct_roas:0}))},selection,stamp);
 });
 return buildAdsCalendar(children,{start_date:month+'-01',end_date:month+'-'+String(end).padStart(2,'0')},stamp);
}
function fixture(changes={}){
 const frame={schema:'business_month_v1',month:'2026-10',start_date:'2026-10-01',end_date:'2026-10-22',status:'COMPLETE',checked_at:stamp,progress:{windows_total:2,windows_complete:2,pages_read:2},coverage:{orders:4,paid:2,completed:1,ongoing:1,cancelled:1,cancel_pending:0,unpaid:1,other:0,unknown:0,payment_covered:2,payment_missing:0,returns:0,returns_unknown:0},sales_cents:10000,known_sales_cents:10000,expected_repass_cents:8000,known_expected_repass_cents:8000,production_cost_cents:2000,known_production_cost_cents:2000,invoice_tax_cents:200,known_invoice_tax_cents:200,ads_adjustment_cents:0,ads:calendar(),expenses:{revision:1,external_expenses_cents:500,recharge_treatment:'UNCONFIRMED',updated_at:current},result:{net_estimate_cents:4300,net_profit_cents:null,net_margin_bps:4300,pending:[],basis:'PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE'},unmapped_variants:[],bindings_revision:2,costs_revision:3,...changes};
 assert.ok(projectBusinessMonth(frame),'fixture must satisfy the production projector');return frame;
}
function browser(value=fixture(),search=''){
 const context=vm.createContext({URLSearchParams});
 const ids=[...businessMonthBody().matchAll(/\bid="(businessMonth[^"]*)"/g)].map(match=>match[1]);
 new vm.Script(`
 let clock=Date.parse(${JSON.stringify(current)});
 class ClockDate extends Date {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 globalThis.Date=ClockDate;globalThis.location={search:${JSON.stringify(search)}};
 const timers=new Map();let nextTimer=0;
 const setTimeout=(callback,delay)=>{const id=++nextTimer;timers.set(id,{callback:()=>{timers.delete(id);return callback();},delay});return id;},clearTimeout=id=>timers.delete(id);
 function item(tag='div',text=''){return {tag,textContent:text,value:'',dataset:{},children:[],hidden:false,disabled:false,open:false,max:'',append(...values){this.children.push(...values);},replaceChildren(...values){this.textContent='';this.children=[...values];},setAttribute(){}};}
 const controls=new Map(${JSON.stringify(ids)}.map(id=>[id,item()]));
 const document={hidden:false,handlers:{},getElementById(id){if(!controls.has(id))throw Error('UNKNOWN_CONTROL:'+id);return controls.get(id);},createElement:tag=>item(tag),addEventListener(name,callback){this.handlers[name]=callback;}};
 const text=element=>element.textContent+element.children.map(text).join(' '),control=name=>controls.get('businessMonth'+name);
 let currentFrame=JSON.parse(${JSON.stringify(JSON.stringify(value))});const calls=[];let customApi=null,syncCalls=0;
 const api=async(path,body)=>{calls.push({path,body});return customApi?customApi(path,body):JSON.parse(JSON.stringify(currentFrame));};
 const syncVariants=async rows=>{syncCalls++;return true;};
 `+BUSINESS_MONTH_CLIENT).runInContext(context);
 const run=code=>new vm.Script(code).runInContext(context);
 const load=data=>{context.serialized=JSON.stringify(data);run('currentFrame=JSON.parse(serialized);');};
 return {run,load,context,text:name=>run("text(control("+JSON.stringify(name)+"))")};
}

test('monthly body has one clear card per business metric and responsive scoped markup',()=>{
 const body=businessMonthBody(),ids=[...body.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(new Set(ids).size,ids.length);assert.ok(ids.every(id=>id.startsWith('businessMonth')));
 for(const title of ['Vendas da loja','Investimento em anúncios','ROAS dos anúncios','Resultado líquido previsto','Como chegamos ao resultado','Base para crescer com lucro'])assert.ok(body.includes(title),title);
 assert.match(body,/type="month"/);assert.match(body,/Não tenho outras despesas/);assert.doesNotMatch(body,/api[_ -]?key|token de acesso|password/i);
 assert.match(BUSINESS_MONTH_CSS,/minmax\(0,1fr\)/);assert.match(BUSINESS_MONTH_CSS,/@media\(max-width:640px\)/);assert.doesNotMatch(BUSINESS_MONTH_CSS,/(?:^|\n)(?:body|html)\s*\{/);
});

test('paid store sales, Ads attribution and the fully costed net remain different precise metrics',async()=>{
 const b=browser();assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);
 assert.match(b.text('Sales'),/100,00/);assert.match(b.text('Ads'),/10,00/);assert.equal(b.text('Roas'),'20,00x');assert.match(b.text('Net'),/43,00/);
 assert.match(b.text('RoasHelp'),/200,00/);assert.doesNotMatch(b.text('Sales'),/200,00/);assert.match(b.text('Margin'),/43/);
 const waterfall=b.text('Waterfall');for(const value of ['80,00','20,00','2,00','10,00','5,00','43,00'])assert.ok(waterfall.includes(value),value);
 assert.match(b.text('Coverage'),/1 cancelado\(s\) excluído\(s\)/);assert.match(b.text('Coverage'),/1 não pago\(s\) excluído\(s\)/);assert.match(b.text('Coverage'),/1 em andamento/);
 assert.match(b.text('NetHelp'),/não o valor recebido em banco/);assert.equal(b.run("control('AdsLink').href"),'/dashboard?month=2026-10');
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(calls.map(call=>call.body.operation))')),['start','ads']);
});

test('a missing payment keeps monthly sales and net pending rather than manufacturing zero revenue or a loss',async()=>{
 const source=fixture(),partial=fixture({...source,coverage:{...source.coverage,payment_covered:1,payment_missing:1},sales_cents:null,known_sales_cents:5000,expected_repass_cents:null,known_expected_repass_cents:4000,invoice_tax_cents:null,known_invoice_tax_cents:100,ads_adjustment_cents:null,result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['PAYMENT_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADJUSTMENT_UNAVAILABLE']}});
 const b=browser(partial);await b.run('brazaMonthDashboard.start({api,syncVariants})');
 assert.equal(b.text('Sales'),'Pendente');assert.match(b.text('SalesHelp'),/50,00/);assert.equal(b.text('Net'),'Em conciliação');assert.match(b.text('PendingList'),/não são tratados como valor zero/);assert.match(b.text('Ads'),/10,00/);assert.doesNotMatch(b.text('Net'),/0,00/);
});

test('an explicit zero expense is saved once per month and recalculates only from the verified response',async()=>{
 const source=fixture(),unconfirmed=fixture({...source,expenses:{revision:0,external_expenses_cents:null,recharge_treatment:'UNCONFIRMED',updated_at:null},result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['EXTERNAL_EXPENSES_REQUIRED']}});
 const b=browser(unconfirmed);await b.run('brazaMonthDashboard.start({api,syncVariants})');
 assert.equal(b.run("control('ExpensesValue').value"),'');assert.equal(b.text('Net'),'Em conciliação');
 b.load(fixture({...source,expenses:{revision:1,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED',updated_at:current},result:{...source.result,net_estimate_cents:4800,net_margin_bps:4800}}));
 await b.run("control('ExpensesZero').onclick()");
 assert.equal(b.run("calls.filter(call=>call.body.operation==='expenses').length"),1);
 assert.equal(b.run("calls.find(call=>call.body.operation==='expenses').body.external_expenses_cents"),0);
 assert.equal(b.run("calls.find(call=>call.body.operation==='expenses').body.revision"),0);assert.match(b.text('Net'),/48,00/);
});

test('cost-only refresh is read-only, preserves expense drafts and requires review on a changed saved revision',async()=>{
 const b=browser();await b.run('brazaMonthDashboard.start({api,syncVariants})');
 b.run("control('ExpensesValue').value='12,34';control('ExpensesValue').oninput();");
 const source=fixture(),changed=fixture({...source,expenses:{...source.expenses,revision:2,external_expenses_cents:700},result:{...source.result,net_estimate_cents:4100,net_margin_bps:4100}});b.load(changed);
 await b.run('brazaMonthDashboard.refreshCosts()');
 assert.equal(b.run("control('ExpensesValue').value"),'12,34');assert.equal(b.run("calls.at(-1).body.operation"),'read');assert.equal(b.run("control('ExpensesSave').disabled"),true);assert.match(b.text('ExpenseState'),/alteradas em outra sessão/);
 b.run("control('ExpensesReload').onclick();");assert.equal(b.run("control('ExpensesValue').value"),'7.00');assert.equal(b.run("control('ExpensesSave').disabled"),false);
});

test('outdated month responses never overwrite the selected month or restore old metrics',async()=>{
 const b=browser();
 b.run("let releaseOld;customApi=async(path,body)=>body.month==='2026-10'?new Promise(resolve=>releaseOld=resolve):JSON.parse(JSON.stringify(currentFrame));");
 const old=b.run('brazaMonthDashboard.start({api,syncVariants})');
 const source=fixture(),past={...source,month:'2026-09',start_date:'2026-09-01',end_date:'2026-09-30',progress:{windows_total:2,windows_complete:2,pages_read:2},ads:calendar('2026-09',30)};assert.ok(projectBusinessMonth(past));b.load(past);
 b.run("control('Select').value='2026-09';");await b.run('brazaMonthDashboard.refresh()');
 b.context.stale=JSON.stringify(source);b.run('releaseOld(JSON.parse(stale));');await old;
 assert.equal(b.run("control('Select').value"),'2026-09');assert.match(b.text('Scope'),/01\/09\/2026 a 30\/09\/2026/);assert.doesNotMatch(b.text('Scope'),/01\/10\/2026 a 22\/10\/2026/);
});

test('automatic Ads refresh keeps a single visible current-month timer and never imports orders again',async()=>{
 const b=browser();await b.run('brazaMonthDashboard.start({api,syncVariants})');assert.equal(b.run('timers.size'),1);
 b.run('clock+=61000;');await b.run('[...timers.values()][0].callback()');
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(calls.map(call=>call.body.operation))')),['start','ads','ads']);
 b.run("document.hidden=true;document.handlers.visibilitychange();");assert.equal(b.run('timers.size'),0);
 b.run("document.hidden=false;document.handlers.visibilitychange();control('ExpensesValue').value='7.00';control('ExpensesValue').oninput();");assert.equal(b.run('timers.size'),0);
});

test('source failure stops the collection without an automatic retry loop or private error text',async()=>{
 const b=browser();b.run("customApi=async()=>{throw Error('A conexão financeira ainda não está disponível.');};");
 assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),false);assert.equal(b.run('calls.length'),1);assert.equal(b.run('timers.size'),0);assert.equal(b.text('Net'),'Em apuração');assert.equal(b.run("control('Refresh').disabled"),false);assert.match(b.text('Status'),/conexão financeira/);
});

test('a recharge is visibly added back once while a support fee stays inside the reported payout',async()=>{
 const source=fixture();
 const recharge=fixture({...source,ads_adjustment_cents:1000,expenses:{...source.expenses,recharge_treatment:'ADS_RECHARGE'},result:{...source.result,net_estimate_cents:5300,net_margin_bps:5300}});
 const b=browser(recharge);await b.run('brazaMonthDashboard.start({api,syncVariants})');
 assert.match(b.text('Waterfall'),/Recarga de anúncios reposta/);assert.match(b.text('Waterfall'),/\+ .*10,00/);assert.match(b.text('Net'),/53,00/);
 const support=fixture({...source,ads_adjustment_cents:1000,expenses:{...source.expenses,recharge_treatment:'TECH_SUPPORT'}});b.load(support);await b.run('brazaMonthDashboard.refreshCosts()');
 assert.doesNotMatch(b.text('Waterfall'),/Recarga de anúncios reposta/);assert.match(b.text('Net'),/43,00/);
});

test('missing product costs trigger one automatic catalogue pass and a read-only recalculation',async()=>{
 const source=fixture(),pending=fixture({...source,production_cost_cents:null,known_production_cost_cents:1000,unmapped_variants:[{item_id:'201',model_id:'0',quantity:1}],result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['PRODUCTION_COST_INCOMPLETE']}});
 const b=browser(pending);b.context.completed=JSON.stringify(source);
 b.run("const syncAndComplete=async rows=>{syncCalls++;if(rows.length!==1||rows[0].item_id!=='201')throw Error('UNEXPECTED_VARIANTS');currentFrame=JSON.parse(completed);return true;};");
 await b.run('brazaMonthDashboard.start({api,syncVariants:syncAndComplete})');
 assert.equal(b.run('syncCalls'),1);assert.deepEqual(JSON.parse(b.run('JSON.stringify(calls.map(call=>call.body.operation))')),['start','read','ads']);assert.match(b.text('Net'),/43,00/);
});

test('a forged net result is refused before it can appear in the monthly dashboard',async()=>{
 const b=browser(),invalid=fixture();invalid.result.net_estimate_cents++;b.load(invalid);
 assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),false);assert.equal(b.text('Net'),'Em apuração');assert.match(b.text('Status'),/não puderam ser conferidos/);assert.equal(b.run('timers.size'),0);
});
