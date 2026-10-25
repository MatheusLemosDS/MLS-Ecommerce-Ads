import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {BUSINESS_MONTH_CLIENT} from '../src/business-month-client.mjs';
import {BUSINESS_MONTH_CSS,businessMonthBody} from '../src/business-month-view.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {buildBusinessCheckpoint} from '../src/business-checkpoint.mjs';

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
function productRow(itemId,modelId,changes={}){
 const repass=4000+Number(itemId)-200,after=repass-1100;
 return {item_id:String(itemId),quantity:1,orders:1,exclusive_orders:1,mixed_orders:0,exclusive_payment_covered:1,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,known_exclusive_sales_cents:5000,exclusive_sales_cents:5000,known_exclusive_repass_cents:repass,exclusive_repass_cents:repass,known_exclusive_tax_cents:100,exclusive_tax_cents:100,known_exclusive_ads_adjustment_cents:0,exclusive_ads_adjustment_cents:0,known_production_cost_cents:1000,production_cost_cents:1000,known_exclusive_production_cost_cents:1000,exclusive_production_cost_cents:1000,exclusive_after_costs_cents:after,exclusive_margin_bps:Math.trunc(after*10000/5000),pending:[],variants:[{model_id:String(modelId),quantity:1,exclusive_quantity:1,mixed_quantity:0,unit_cost_cents:1000,production_cost_cents:1000,exclusive_production_cost_cents:1000,selling_unit:'SINGLE_GARMENT',size:'P',male_size:null,female_size:null}],...changes};
}
function productFixture(count=2){
 const source=fixture(),products=Array.from({length:count},(_,index)=>productRow(200+index,300+index));
 const sales=count*5000,repass=products.reduce((sum,row)=>sum+row.exclusive_repass_cents,0),production=count*1000,tax=count*100,net=repass-production-tax-1500;
 return fixture({...source,progress:{...source.progress,pages_read:Math.ceil((count+2)/5)},coverage:{...source.coverage,orders:count+2,paid:count,completed:count-1,ongoing:1,payment_covered:count},sales_cents:sales,known_sales_cents:sales,expected_repass_cents:repass,known_expected_repass_cents:repass,production_cost_cents:production,known_production_cost_cents:production,invoice_tax_cents:tax,known_invoice_tax_cents:tax,result:{...source.result,net_estimate_cents:net,net_margin_bps:Math.trunc(net*10000/sales)},product_summary:{schema:'business_month_products_v1',mixed_orders:0,known_mixed_sales_cents:0,known_mixed_repass_cents:0,known_mixed_tax_cents:0,known_mixed_ads_adjustment_cents:0,products}});
}
function mixedProductFixture(){
 const source=fixture(),first=productRow(200,300),second=productRow(201,301);
 Object.assign(first,{quantity:2,orders:2,mixed_orders:1,known_production_cost_cents:2000,production_cost_cents:2000});Object.assign(first.variants[0],{quantity:2,mixed_quantity:1,production_cost_cents:2000});
 Object.assign(second,{exclusive_orders:0,mixed_orders:1,exclusive_payment_covered:0,known_exclusive_sales_cents:0,exclusive_sales_cents:0,known_exclusive_repass_cents:0,exclusive_repass_cents:0,known_exclusive_tax_cents:0,exclusive_tax_cents:0,known_exclusive_production_cost_cents:0,exclusive_production_cost_cents:0,exclusive_after_costs_cents:null,exclusive_margin_bps:null,pending:['NO_EXCLUSIVE_ORDERS']});Object.assign(second.variants[0],{exclusive_quantity:0,mixed_quantity:1,exclusive_production_cost_cents:0});
 return fixture({...source,sales_cents:15000,known_sales_cents:15000,expected_repass_cents:12000,known_expected_repass_cents:12000,production_cost_cents:3000,known_production_cost_cents:3000,invoice_tax_cents:300,known_invoice_tax_cents:300,result:{...source.result,net_estimate_cents:7200,net_margin_bps:4800},product_summary:{schema:'business_month_products_v1',mixed_orders:1,known_mixed_sales_cents:10000,known_mixed_repass_cents:8000,known_mixed_tax_cents:200,known_mixed_ads_adjustment_cents:0,products:[first,second]}});
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
 const settle=async()=>{for(let index=0;index<10;index++)await Promise.resolve();};
 return {run,load,context,settle,text:name=>run("text(control("+JSON.stringify(name)+"))")};
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
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(calls.map(call=>call.body.operation))')),['read','start','ads']);
});

test('a validated saved month paints before the private import responds and remains visible while its steps run',async()=>{
 const source=fixture({source_checked_at:{finance_oldest_at:stamp-90,finance_latest_at:stamp-30,ads_at:stamp}}),b=browser(source);
 const running=fixture({...source,status:'RUNNING',progress:{...source.progress,windows_complete:1},sales_cents:null,expected_repass_cents:null,production_cost_cents:null,invoice_tax_cents:null,ads_adjustment_cents:null,result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['COLLECTING','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADJUSTMENT_UNAVAILABLE']}});
 b.run("let releaseStart,releaseStep;customApi=async(path,body)=>body.operation==='start'?new Promise(resolve=>releaseStart=resolve):body.operation==='step'?new Promise(resolve=>releaseStep=resolve):JSON.parse(JSON.stringify(currentFrame));");
 const starting=b.run('brazaMonthDashboard.start({api,syncVariants})');await b.settle();
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(calls.map(call=>call.body.operation))')),['read','start']);
 assert.match(b.text('Sales'),/100,00/);assert.match(b.text('Net'),/43,00/);assert.match(b.text('Status'),/última leitura salva.*Atualizando/);
 assert.match(b.text('Scope'),/financeiro: leitura mais antiga .*08:58:30; mais recente .*08:59:30/);assert.match(b.text('Scope'),/Idade do financeiro: há 1 minuto\(s\).*idade dos anúncios: há menos de 1 minuto/);
 b.context.running=JSON.stringify(running);b.run('releaseStart(JSON.parse(running));');await b.settle();
 assert.equal(b.run('calls.at(-1).body.operation'),'step');assert.match(b.text('Net'),/43,00/);assert.match(b.text('Sales'),/100,00/);assert.match(b.text('Status'),/última leitura salva.*Conferindo os pedidos/);
 b.run('releaseStep(JSON.parse(JSON.stringify(currentFrame)));');assert.equal(await starting,true);assert.equal(b.run('timers.size'),1);
});

test('a changed month paints its saved data while a late private response from the previous month is ignored',async()=>{
 const source=fixture(),b=browser(source);
 b.run("const releaseImports=new Map();customApi=async(path,body)=>body.operation==='start'?new Promise(resolve=>releaseImports.set(body.month,resolve)):JSON.parse(JSON.stringify(currentFrame));");
 const old=b.run('brazaMonthDashboard.start({api,syncVariants})');await b.settle();
 const past=fixture({...source,month:'2026-09',start_date:'2026-09-01',end_date:'2026-09-30',ads:calendar('2026-09',30)});b.load(past);
 b.run("control('Select').value='2026-09';");const selected=b.run('brazaMonthDashboard.refresh()');await b.settle();
 assert.match(b.text('Scope'),/01\/09\/2026 a 30\/09\/2026/);assert.match(b.text('Net'),/43,00/);assert.match(b.text('Status'),/última leitura salva/);
 b.run("releaseImports.get('2026-09')(JSON.parse(JSON.stringify(currentFrame)));");assert.equal(await selected,true);
 b.context.old=JSON.stringify(source);b.run("releaseImports.get('2026-10')(JSON.parse(old));");assert.equal(await old,false);
 assert.match(b.text('Scope'),/01\/09\/2026 a 30\/09\/2026/);assert.doesNotMatch(b.text('Scope'),/01\/10\/2026/);
});

test('a failed saved read falls back once to the normal financial import',async()=>{
 const b=browser();b.run("customApi=async(path,body)=>{if(body.operation==='read')throw Error('Cache indisponível.');return JSON.parse(JSON.stringify(currentFrame));};");
 assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(calls.map(call=>call.body.operation))')),['read','start','ads']);assert.match(b.text('Net'),/43,00/);assert.equal(b.run('timers.size'),1);
});

test('a stale saved financial source keeps the net pending before a delayed private refresh',async()=>{
 const source=fixture(),stale=fixture({...source,source_checked_at:{finance_oldest_at:stamp-1200,finance_latest_at:stamp-30,ads_at:stamp},result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['FINANCIAL_SOURCE_STALE']}}),b=browser(stale);
 b.run("let releaseStart;customApi=async(path,body)=>body.operation==='start'?new Promise(resolve=>releaseStart=resolve):JSON.parse(JSON.stringify(currentFrame));");
 const starting=b.run('brazaMonthDashboard.start({api,syncVariants})');await b.settle();
 assert.equal(b.text('Net'),'Em conciliação');assert.doesNotMatch(b.text('Net'),/0,00|43,00/);assert.match(b.text('PendingList'),/nova leitura/);assert.match(b.text('Scope'),/Idade do financeiro: há 20 minuto\(s\)/);
 b.load(source);b.run('releaseStart(JSON.parse(JSON.stringify(currentFrame)));');await starting;assert.match(b.text('Net'),/43,00/);
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

test('minute Ads updates keep one timer and do not repeat the full financial import before its bounded interval',async()=>{
 const b=browser();await b.run('brazaMonthDashboard.start({api,syncVariants})');assert.equal(b.run('timers.size'),1);
 b.run('clock+=61000;');await b.run('[...timers.values()][0].callback()');
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(calls.map(call=>call.body.operation))')),['read','start','ads','ads']);
 b.run("document.hidden=true;document.handlers.visibilitychange();");assert.equal(b.run('timers.size'),0);
 b.run("document.hidden=false;document.handlers.visibilitychange();control('ExpensesValue').value='7.00';control('ExpensesValue').oninput();");assert.equal(b.run('timers.size'),0);
});

test('automatic full refresh imports new sales and later cancellations before updating Ads and the monthly net',async()=>{
 const b=browser(),source=fixture();await b.run('brazaMonthDashboard.start({api,syncVariants})');
 const added=fixture({...source,coverage:{...source.coverage,orders:5,paid:3,ongoing:2,payment_covered:3},sales_cents:15000,known_sales_cents:15000,expected_repass_cents:12000,known_expected_repass_cents:12000,production_cost_cents:3000,known_production_cost_cents:3000,invoice_tax_cents:300,known_invoice_tax_cents:300,result:{...source.result,net_estimate_cents:7200,net_margin_bps:4800}});
 const running=fixture({...source,status:'RUNNING',progress:{...source.progress,windows_complete:1},sales_cents:null,expected_repass_cents:null,production_cost_cents:null,invoice_tax_cents:null,ads_adjustment_cents:null,result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['COLLECTING','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADJUSTMENT_UNAVAILABLE']}});
 b.context.running=JSON.stringify(running);b.load(added);
 b.run("customApi=async(path,body)=>JSON.parse(body.operation==='start'?running:JSON.stringify(currentFrame));clock+=301000;");
 await b.run('[...timers.values()][0].callback()');
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(calls.map(call=>call.body.operation))')),['read','start','ads','start','step','ads']);
 assert.match(b.text('Sales'),/150,00/);assert.match(b.text('Coverage'),/3 pedido\(s\) pagos/);assert.match(b.text('Net'),/72,00/);assert.equal(b.run('timers.size'),1);
 const cancelled=fixture({...source,coverage:{...source.coverage,orders:5,cancelled:2},result:{...source.result}});b.load(cancelled);
 b.run('clock+=301000;');await b.run('[...timers.values()][0].callback()');
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(calls.slice(-3).map(call=>call.body.operation))')),['start','step','ads']);
 assert.match(b.text('Coverage'),/2 cancelado\(s\) excluído\(s\)/);assert.match(b.text('Sales'),/100,00/);assert.match(b.text('Net'),/43,00/);
 assert.equal(b.run('timers.size'),1);
});

test('overdue hidden finance refresh resumes once, blocks overlap and preserves expense edits made during the import',async()=>{
 const b=browser();await b.run('brazaMonthDashboard.start({api,syncVariants})');
 b.run('document.hidden=true;document.handlers.visibilitychange();clock+=600000;');assert.equal(b.run('timers.size'),0);
 b.run('document.hidden=false;document.handlers.visibilitychange();');assert.equal(b.run('timers.size'),1);assert.equal(b.run('[...timers.values()][0].delay'),0);
 b.run("let completeImport;customApi=async(path,body)=>body.operation==='start'?new Promise(resolve=>completeImport=resolve):JSON.parse(JSON.stringify(currentFrame));");
 const refresh=b.run('[...timers.values()][0].callback()');
 assert.equal(b.run('timers.size'),0);assert.equal(b.run("control('Refresh').disabled"),true);
 b.run("document.handlers.visibilitychange();control('ExpensesValue').value='12,34';control('ExpensesValue').oninput();");assert.equal(b.run('timers.size'),0);
 b.run('completeImport(JSON.parse(JSON.stringify(currentFrame)));');await refresh;
 assert.equal(b.run("control('ExpensesValue').value"),'12,34');assert.match(b.text('ExpenseState'),/edição de despesas ainda não salva/);
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(calls.map(call=>call.body.operation))')),['read','start','ads','start','ads']);
 assert.equal(b.run('timers.size'),0,'an unfinished expense draft pauses scheduling instead of being saved or overwritten');
 b.run("control('ExpensesReload').onclick();");assert.equal(b.run('timers.size'),1);
});

test('an automatic source failure or explicit stop cannot start a retry loop on visibility changes',async()=>{
 const b=browser();await b.run('brazaMonthDashboard.start({api,syncVariants})');
 b.run("customApi=async()=>{throw Error('Fonte temporariamente indisponível.');};clock+=301000;");
 assert.equal(await b.run('[...timers.values()][0].callback()'),false);assert.equal(b.run('calls.length'),4);assert.equal(b.run('timers.size'),0);
 b.run('document.hidden=true;document.handlers.visibilitychange();clock+=600000;document.hidden=false;document.handlers.visibilitychange();');
 assert.equal(b.run('timers.size'),0);assert.equal(b.run('calls.length'),4);assert.match(b.text('Sales'),/100,00/);assert.match(b.text('Status'),/Fonte temporariamente indisponível/);
 b.run('customApi=null;');assert.equal(await b.run('brazaMonthDashboard.refresh()'),true);assert.equal(b.run('timers.size'),1);
 b.run('brazaMonthDashboard.stop();document.hidden=true;document.handlers.visibilitychange();document.hidden=false;document.handlers.visibilitychange();');
 assert.equal(b.run('timers.size'),0);
});

test('an import hidden between responses suspends further requests and resumes automatically on visibility',async()=>{
 const source=fixture(),running=fixture({...source,status:'RUNNING',progress:{...source.progress,windows_complete:1},sales_cents:null,expected_repass_cents:null,production_cost_cents:null,invoice_tax_cents:null,ads_adjustment_cents:null,result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['COLLECTING','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADJUSTMENT_UNAVAILABLE']}});
 const b=browser();b.context.partial=JSON.stringify(running);
 b.run("let releaseStart;customApi=async()=>new Promise(resolve=>releaseStart=resolve);");const starting=b.run('brazaMonthDashboard.start({api,syncVariants})');
 b.run('document.hidden=true;document.handlers.visibilitychange();releaseStart(JSON.parse(partial));');await starting;
 assert.equal(b.run('calls.length'),1);assert.equal(b.run('timers.size'),0);assert.match(b.text('Status'),/automaticamente quando este painel voltar/);
 b.run('customApi=null;document.hidden=false;document.handlers.visibilitychange();');assert.equal(b.run('[...timers.values()][0].delay'),0);
 await b.run('[...timers.values()][0].callback()');
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(calls.map(call=>call.body.operation))')),['read','start','ads']);assert.match(b.text('Net'),/43,00/);assert.equal(b.run('timers.size'),1);
});

test('an explicit pause waits for the current response and does not start Ads until manually resumed',async()=>{
 const b=browser();b.run("let releaseStart;customApi=async()=>new Promise(resolve=>releaseStart=resolve);");
 const starting=b.run('brazaMonthDashboard.start({api,syncVariants})');b.run("control('Pause').onclick();releaseStart(JSON.parse(JSON.stringify(currentFrame)));");await starting;
 assert.equal(b.run('calls.length'),1);assert.equal(b.run('timers.size'),0);assert.match(b.text('Status'),/Consulta pausada/);
 b.run('customApi=null;');await b.run('brazaMonthDashboard.refresh()');
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(calls.map(call=>call.body.operation))')),['read','start','ads']);assert.equal(b.run('timers.size'),1);
});

test('source failure stops the collection without an automatic retry loop or private error text',async()=>{
 const b=browser();b.run("customApi=async()=>{throw Error('A conexão financeira ainda não está disponível.');};");
 assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),false);assert.equal(b.run('calls.length'),2);assert.equal(b.run('timers.size'),0);assert.equal(b.text('Net'),'Em apuração');assert.equal(b.run("control('Refresh').disabled"),false);assert.match(b.text('Status'),/conexão financeira/);
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
 assert.equal(b.run('syncCalls'),1);assert.deepEqual(JSON.parse(b.run('JSON.stringify(calls.map(call=>call.body.operation))')),['read','start','read','ads']);assert.match(b.text('Net'),/43,00/);
});

test('a forged net result is refused before it can appear in the monthly dashboard',async()=>{
 const b=browser(),invalid=fixture();invalid.result.net_estimate_cents++;b.load(invalid);
 assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),false);assert.equal(b.text('Net'),'Em apuração');assert.match(b.text('Status'),/não puderam ser conferidos/);assert.equal(b.run('timers.size'),0);
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(calls.map(call=>call.body.operation))')),['read'],'an invalid successful cache response is never trusted or treated as a cache miss');
});

test('monthly products keep production totals and exclusive contribution separate from account Ads and net profit',async()=>{
 const b=browser(productFixture());assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);
 assert.match(b.text('ProductSummary'),/2 produto\(s\) vendido\(s\)/);
 assert.match(b.text('ProductRows'),/Produto #200/);assert.match(b.text('ProductRows'),/29,00/);assert.match(b.text('ProductRows'),/10,00/);
 assert.match(b.text('ProductRows'),/1 pedido\(s\) só deste produto/);assert.match(b.text('ProductRows'),/Anúncios e outras despesas ainda não foram conciliados por produto/);
 assert.doesNotMatch(b.text('ProductRows'),/ROAS|lucro líquido/i);
 assert.equal(b.run("control('ProductRows').children[0].children[0].children[3].children[1].children.length"),0,'variation details should stay lazy while collapsed');
 b.run("const detail=control('ProductRows').children[0].children[0].children[3];detail.open=true;detail.ontoggle();");
 assert.match(b.text('ProductRows'),/Variação #300 · Camiseta P/);
 assert.match(b.text('ProductRows'),/1 em pedidos exclusivos \/ 0 com outros produtos/);
});

test('a large monthly product list supports stable pagination, exact identity search, sort and empty filters',async()=>{
 const b=browser(productFixture(45));await b.run('brazaMonthDashboard.start({api,syncVariants})');
 assert.equal(b.run("control('ProductRows').children.length"),20);assert.match(b.text('ProductPageStatus'),/1–20 de 45/);
 await b.run("control('ProductNext').onclick()");assert.match(b.text('ProductPageStatus'),/21–40 de 45/);assert.match(b.run("text(control('ProductRows').children[0])"),/Produto #220/);
 await b.run("control('ProductNext').onclick()");assert.equal(b.run("control('ProductRows').children.length"),5);assert.equal(b.run("control('ProductNext').disabled"),true);
 b.run("control('ProductSort').value='contribution_desc';control('ProductSort').onchange();");assert.match(b.run("text(control('ProductRows').children[0])"),/Produto #244/);
 b.run("control('ProductSearch').value='#329';control('ProductSearch').oninput();");assert.match(b.text('ProductRows'),/Produto #229/);assert.match(b.text('ProductPageStatus'),/1–1 de 1/);
 b.run("control('ProductSearch').value='';control('ProductSearch').oninput();control('ProductPageSize').value='50';control('ProductPageSize').onchange();");assert.equal(b.run("control('ProductRows').children.length"),45);
 b.run("control('ProductFilter').value='pending';control('ProductFilter').onchange();");assert.match(b.text('ProductRows'),/Nenhum produto corresponde/);assert.equal(b.run("control('ProductNext').disabled"),true);assert.match(b.text('ProductPageStatus'),/0–0 de 0/);
});

test('mixed orders keep all production visible without allocating payout or subtracting mixed units from exclusive contribution',async()=>{
 const b=browser(mixedProductFixture());assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);
 assert.match(b.text('ProductSummary'),/1 pedido\(s\) com produtos diferentes, sem rateio financeiro/);assert.match(b.text('ProductSummary'),/100,00/);assert.match(b.text('ProductSummary'),/80,00/);
 const first=b.run("text(control('ProductRows').children[0])"),second=b.run("text(control('ProductRows').children[1])");
 assert.match(first,/20,00/);assert.match(first,/29,00/);assert.doesNotMatch(first,/19,00/);assert.match(first,/1 pedido\(s\) com outros produtos não estão neste saldo/);
 assert.match(second,/Sem pedido exclusivo/);assert.doesNotMatch(b.run("text(control('ProductRows').children[1].children[3])"),/0,00/);
 b.run("control('ProductFilter').value='ready';control('ProductFilter').onchange();");assert.equal(b.run("control('ProductRows').children.length"),1);assert.match(b.text('ProductRows'),/Produto #200/);
 b.run("control('ProductFilter').value='pending';control('ProductFilter').onchange();");assert.equal(b.run("control('ProductRows').children.length"),1);assert.match(b.text('ProductRows'),/Produto #201/);
 b.run("control('ProductFilter').value='mixed';control('ProductFilter').onchange();");assert.equal(b.run("control('ProductRows').children.length"),2);
});

test('pending-cost filter also finds a mixed variation without blocking the proven exclusive saldo',async()=>{
 const source=mixedProductFixture(),row=source.product_summary.products[0];
 row.known_production_cost_cents=1000;row.production_cost_cents=null;Object.assign(row.variants[0],{quantity:1,mixed_quantity:0,production_cost_cents:1000});
 row.variants.push({model_id:'302',quantity:1,exclusive_quantity:0,mixed_quantity:1,unit_cost_cents:null,production_cost_cents:null,exclusive_production_cost_cents:0,selling_unit:null,size:null,male_size:null,female_size:null});
 source.known_production_cost_cents=2000;source.production_cost_cents=null;source.unmapped_variants=[{item_id:'200',model_id:'302',quantity:1}];source.result={...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['PRODUCTION_COST_INCOMPLETE']};
 const b=browser(fixture(source));assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);
 b.run("control('ProductFilter').value='pending';control('ProductFilter').onchange();control('ProductSearch').value='200';control('ProductSearch').oninput();");
 assert.equal(b.run("control('ProductRows').children.length"),1);assert.match(b.text('ProductRows'),/Produto #200/);assert.match(b.text('ProductRows'),/29,00/);assert.match(b.text('ProductRows'),/Já identificado: .*10,00/);
 assert.match(b.text('ProductRows'),/Nestes pedidos: repasse .*40,00 · produção .*10,00 · imposto .*1,00/);
 assert.equal(b.text('Net'),'Em conciliação');
});

test('absent or forged product data cannot become zero product contribution',async()=>{
 const legacy=browser();await legacy.run('brazaMonthDashboard.start({api,syncVariants})');
 assert.match(legacy.text('ProductSummary'),/leitura anterior ainda não trouxe os produtos/);assert.doesNotMatch(legacy.text('ProductRows'),/0,00/);assert.equal(legacy.run("control('ProductSearch').disabled"),true);
 const source=productFixture(),b=browser(source);await b.run('brazaMonthDashboard.start({api,syncVariants})');
 source.product_summary.products[0].exclusive_after_costs_cents++;
 b.load(source);assert.equal(await b.run('brazaMonthDashboard.refreshCosts()'),false);assert.match(b.run("text(control('ProductRows').children[0])"),/29,00/);assert.doesNotMatch(b.run("text(control('ProductRows').children[0])"),/29,01/);
 assert.match(b.text('Status'),/não foi possível recalcular/);
});

test('monthly custom products show their configured profile and full unit cost without assuming garment composition or rendering labels as HTML',async()=>{
 const source=productFixture(),labels=['Calça moletom','Kit casal <img src=x onerror=alert(1)>'];
 for(const [index,product] of source.product_summary.products.entries())Object.assign(product.variants[0],{selling_unit:'CUSTOM_PRODUCT',size:null,male_size:null,female_size:null,cost_profile_id:index?'kit-casal':'calca',cost_profile_label:labels[index]});
 assert.ok(projectBusinessMonth(source));const b=browser(source);assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);
 for(let index=0;index<2;index++)b.run("{const detail=control('ProductRows').children["+index+"].children[0].children[3];detail.open=true;detail.ontoggle();}");
 const text=b.text('ProductRows');assert.match(text,/Custo personalizado · Calça moletom/);assert.match(text,/Custo personalizado · Kit casal <img src=x onerror=alert\(1\)>/);assert.match(text,/10,00 por unidade vendida/);assert.doesNotMatch(text,/Camiseta P|masculino|feminino|Camisetas ou kits/);
 assert.equal(b.run("control('ProductRows').children[1].children[0].children[3].children[1].children[0].tag"),'li');
 assert.equal(b.run('globalThis.alert'),undefined);assert.match(b.text('Net'),/43,01/);
 const changed=structuredClone(source);changed.product_summary.products[0].variants[0].cost_profile_label='INVALID\u0000';b.load(changed);assert.equal(await b.run('brazaMonthDashboard.refreshCosts()'),false);assert.match(b.text('ProductRows'),/Custo personalizado · Calça moletom/);
});

function meiProductFixture({pending=false}={}){
 const source=productFixture(3),tax={schema:'business_month_tax_v1',regime:'MEI',year:2026,policy_revision:pending?0:1,monthly_das_cents:pending?null:8605,tax_cents:pending?null:8605,status:pending?'PENDING':'DECLARED',source:pending?'DAS_REQUIRED':'OPERATOR_DECLARED_DAS',basis:'MONTHLY_COMPETENCE_NO_PRORATION'};
 source.tax=tax;source.invoice_tax_cents=tax.tax_cents;source.known_invoice_tax_cents=tax.tax_cents;
 source.source_checked_at={finance_oldest_at:stamp-90,finance_latest_at:stamp-30,ads_at:stamp};
 source.product_summary.tax_treatment='MONTHLY_DAS_NOT_ALLOCATED';
 for(const product of source.product_summary.products){product.known_exclusive_tax_cents=0;product.exclusive_tax_cents=0;product.exclusive_after_costs_cents=product.exclusive_repass_cents-product.exclusive_production_cost_cents;product.exclusive_margin_bps=Math.trunc(product.exclusive_after_costs_cents*10000/product.exclusive_sales_cents);}
 const net=pending?null:source.expected_repass_cents-source.production_cost_cents-tax.tax_cents-source.ads.expense_cents-source.expenses.external_expenses_cents;
 source.result={...source.result,net_estimate_cents:net,net_margin_bps:net===null?null:Math.trunc(net*10000/source.sales_cents),pending:pending?['TAX_POLICY_REQUIRED','INVOICE_TAX_UNAVAILABLE']:[]};
 assert.ok(projectBusinessMonth(source),'MEI fixture must satisfy the real monthly and product projectors');return source;
}

test('MEI shows one fixed monthly DAS for three products and leaves product balances before the unallocated monthly tax',async()=>{
 const source=meiProductFixture(),b=browser(source);assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);
 assert.match(b.text('TaxSummary'),/DAS-MEI.*86,05 por mês.*2026.*automático/);assert.match(b.text('TaxHelp'),/uma única vez.*mesmo sem vendas/);
 const waterfall=b.text('Waterfall');assert.equal((waterfall.match(/86,05/g)||[]).length,1);assert.match(waterfall,/DAS-MEI mensal · uma vez no mês/);assert.match(waterfall,/Diferença líquida entre vendas e repasse/);
 assert.match(b.text('Net'),/11,02/);assert.match(b.text('TotalExpenses'),/131,05/);assert.match(b.text('TotalExpensesHelp'),/já está considerada no repasse e não é descontada novamente/);
 assert.equal(b.text('ProductBalanceHeading'),'Saldo após produção');assert.match(b.text('ProductTaxHelp'),/uma única vez no resultado geral, sem rateio/);
 assert.match(b.text('ProductRows'),/30,00/);assert.doesNotMatch(b.text('ProductRows'),/86,05|29,00|imposto .*0,00/);
 for(const name of ['TaxSummary','TaxHelp','Waterfall','Readiness','NetHelp','ProductTaxHelp','ProductRows'])assert.doesNotMatch(b.text(name),/imposto (?:de )?2%|estimativa de 2%|Imposto previsto · 2%/i,'MEI copy must not claim a per-note tax in '+name);
 assert.equal(b.run("calls.some(call=>call.body.operation==='expenses')"),false,'reading the known DAS does not prompt or save manual monthly tax amounts');
});

test('an unknown MEI yearly DAS remains pending instead of using two percent or zero tax',async()=>{
 const b=browser(meiProductFixture({pending:true}));assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);
 assert.equal(b.text('Net'),'Em conciliação');assert.equal(b.text('TotalExpenses'),'Pendente');assert.match(b.text('TaxSummary'),/DAS-MEI pendente para 2026/);
 assert.match(b.text('TaxHelp'),/não substitui esse valor por 2%.*nem assume imposto zero/);assert.match(b.text('PendingList'),/DAS-MEI deste ano ainda não está cadastrado/);
 const taxRow=b.run("text(control('Waterfall').children.find(row=>row.children[0].textContent.startsWith('DAS-MEI')))");assert.equal(taxRow,'DAS-MEI mensal · uma vez no mês Pendente');
 assert.match(b.text('ProductRows'),/30,00/,'a monthly tax pending status does not invent a per-product tax allocation');
});

test('financial and Ads timestamps remain visibly separate when a newer Ads response arrives',async()=>{
 const source=meiProductFixture(),b=browser(source);await b.run('brazaMonthDashboard.start({api,syncVariants})');
 assert.match(b.text('Scope'),/financeiro: leitura mais antiga .*08:58:30; mais recente .*08:59:30/);assert.match(b.text('Scope'),/Anúncios consultados em .*09:00:00/);
 assert.doesNotMatch(b.text('Scope'),/Consulta em/);
 const later=structuredClone(source);later.checked_at=stamp+30;later.source_checked_at.ads_at=stamp+30;later.ads.fetched_at=stamp+30;
 b.load(later);assert.equal(await b.run('brazaMonthDashboard.refreshCosts()'),true);
 assert.match(b.text('Scope'),/financeiro: leitura mais antiga .*08:58:30; mais recente .*08:59:30/);assert.match(b.text('Scope'),/Anúncios consultados em .*09:00:30/);
});

test('financial conference explains the actual cohort, source times and versions without claiming received profit',async()=>{
 const source=fixture({source_checked_at:{finance_oldest_at:stamp-120,finance_latest_at:stamp-30,ads_at:stamp},cost_rules_revision:4}),b=browser(source);
 await b.run('brazaMonthDashboard.start({api,syncVariants})');
 const text=b.text('CheckpointEvidence');
 assert.match(text,/Resultado previsto.*43,00/);assert.match(text,/2 pago\(s\).*1 concluído\(s\).*1 em andamento/);
 assert.match(text,/1 cancelado\(s\) e 1 não pago\(s\)/);assert.match(text,/Primeira leitura financeira usada/);assert.match(text,/Última leitura financeira usada/);
 assert.match(text,/Custos v3.*vínculos v2.*regras v4.*imposto anterior sem versão.*despesas v1/);
 assert.equal(b.text('CheckpointStatus'),'Previsão completa');
 assert.match(businessMonthBody(),/Recebimentos e reembolsos ainda não conciliados/);
 assert.equal(b.run("calls.filter(call=>call.path.startsWith('finance/checkpoints')).length"),0,'collapsed evidence must not add requests');
});

test('opening the financial conference reads history once, then a newer frame invalidates it without a request loop',async()=>{
 const source=fixture(),b=browser(source),history={schema:'business_checkpoint_history_v1',month:source.month,retention_limit:128,checkpoints:[{revision:7,fingerprint:'a'.repeat(64),checkpoint:buildBusinessCheckpoint(source)}]};
 b.context.historySerialized=JSON.stringify(history);
 b.run("customApi=async(path,body)=>path.startsWith('finance/checkpoints')?JSON.parse(historySerialized):JSON.parse(JSON.stringify(currentFrame));");
 await b.run('brazaMonthDashboard.start({api,syncVariants})');
 b.run("control('CheckpointDetails').open=true;control('CheckpointDetails').ontoggle();");await b.settle();
 assert.match(b.text('CheckpointHistory'),/Versão 7/);assert.match(b.text('CheckpointHistory'),/Previsão:.*43,00/);
 assert.equal(b.run("calls.filter(call=>call.path==='finance/checkpoints?month=2026-10&limit=10').length"),1);
 b.run("control('CheckpointDetails').open=false;control('CheckpointDetails').ontoggle();control('CheckpointDetails').open=true;control('CheckpointDetails').ontoggle();");await b.settle();
 assert.equal(b.run("calls.filter(call=>call.path.startsWith('finance/checkpoints')).length"),1);
 await b.run('brazaMonthDashboard.refreshCosts()');
 assert.match(b.text('CheckpointHistoryState'),/nova leitura do resumo/);
 assert.equal(b.run("calls.filter(call=>call.path.startsWith('finance/checkpoints')).length"),1,'ordinary render cannot repeat the history read');
 await b.run("control('CheckpointHistoryRefresh').onclick()");
 assert.equal(b.run("calls.filter(call=>call.path.startsWith('finance/checkpoints')).length"),2);
 assert.match(b.text('CheckpointHistoryState'),/registradas automaticamente/);
});

test('late history from a different month cannot overwrite the selected financial conference',async()=>{
 const source=fixture(),b=browser(source),history={schema:'business_checkpoint_history_v1',month:source.month,retention_limit:128,checkpoints:[{revision:8,fingerprint:'b'.repeat(64),checkpoint:buildBusinessCheckpoint(source)}]};
 b.context.historySerialized=JSON.stringify(history);
 await b.run('brazaMonthDashboard.start({api,syncVariants})');
 b.run("let releaseHistory;customApi=async(path,body)=>path.startsWith('finance/checkpoints')?new Promise(resolve=>releaseHistory=resolve):JSON.parse(JSON.stringify(currentFrame));control('CheckpointDetails').open=true;control('CheckpointDetails').ontoggle();");await b.settle();
 const past=fixture({...source,month:'2026-09',start_date:'2026-09-01',end_date:'2026-09-30',ads:calendar('2026-09',30)});b.load(past);
 b.run("control('Select').value='2026-09';");await b.run('brazaMonthDashboard.refresh()');
 b.run('releaseHistory(JSON.parse(historySerialized));');await b.settle();
 assert.doesNotMatch(b.text('CheckpointHistory'),/Versão 8/);
 assert.match(b.text('CheckpointEvidence'),/Resultado previsto.*43,00/);
 assert.equal(b.run("control('CheckpointHistoryRefresh').disabled"),false);
});

test('invalid history remains a local error and cannot replace the verified expected result or render private error text',async()=>{
 const source=fixture(),b=browser(source),history={schema:'business_checkpoint_history_v1',month:source.month,retention_limit:128,checkpoints:[{revision:1,fingerprint:'c'.repeat(64),checkpoint:{...buildBusinessCheckpoint(source),result:{expected_net_cents:'PRIVATE_PROVIDER_VALUE',realized_net_cents:null,realization:'UNVERIFIED'}}}]};
 b.context.historySerialized=JSON.stringify(history);
 b.run("customApi=async(path,body)=>path.startsWith('finance/checkpoints')?JSON.parse(historySerialized):JSON.parse(JSON.stringify(currentFrame));");
 await b.run('brazaMonthDashboard.start({api,syncVariants})');
 b.run("control('CheckpointDetails').open=true;control('CheckpointDetails').ontoggle();");await b.settle();
 assert.match(b.text('CheckpointHistoryState'),/Não foi possível conferir o histórico/);assert.doesNotMatch(b.text('CheckpointHistoryState'),/PRIVATE_PROVIDER_VALUE/);
 assert.doesNotMatch(b.text('CheckpointHistory'),/PRIVATE_PROVIDER_VALUE/);assert.match(b.text('Net'),/43,00/);
 assert.equal(b.run("control('CheckpointHistoryRefresh').disabled"),false);
});

test('each historical version expands its own amounts, references and pending reasons instead of reusing the current calculation',async()=>{
 const current=fixture(),older=fixture({production_cost_cents:1500,known_production_cost_cents:1500,result:{...current.result,net_estimate_cents:4800,net_margin_bps:4800}}),pending=fixture({production_cost_cents:null,result:{...current.result,net_estimate_cents:null,net_margin_bps:null,pending:['PRODUCTION_COST_INCOMPLETE']}}),b=browser(current);
 const history={schema:'business_checkpoint_history_v1',month:current.month,retention_limit:128,checkpoints:[{revision:2,fingerprint:'e'.repeat(64),checkpoint:buildBusinessCheckpoint(older)},{revision:1,fingerprint:'f'.repeat(64),checkpoint:buildBusinessCheckpoint(pending)}]};
 b.context.historySerialized=JSON.stringify(history);b.run("customApi=async(path,body)=>path.startsWith('finance/checkpoints')?JSON.parse(historySerialized):JSON.parse(JSON.stringify(currentFrame));");
 await b.run('brazaMonthDashboard.start({api,syncVariants})');b.run("control('CheckpointDetails').open=true;control('CheckpointDetails').ontoggle();");await b.settle();
 assert.match(b.text('Net'),/43,00/);
 assert.match(b.text('CheckpointHistory'),/48,00/);assert.match(b.text('CheckpointHistory'),/Há produtos sem composição ou custo completo/);
 assert.equal(b.run("control('CheckpointHistory').children[0].children[0].tag"),'details');
 b.run("let historicalDetails=control('CheckpointHistory').children[0].children[0];historicalDetails.open=true;historicalDetails.ontoggle();");
 assert.match(b.run("text(historicalDetails.children[2].children[1])"),/Custo de produção.*15,00/);
 assert.match(b.run("text(historicalDetails.children[3])"),/Custos v3.*vínculos v2/);
 assert.match(b.run("text(historicalDetails.children[2].children[6])"),/Resultado previsto desta versão.*48,00/);
 await b.run('brazaMonthDashboard.refreshCosts()');
 assert.equal(b.run("control('CheckpointHistory').children[0].children[0].open"),true,'a harmless rerender should preserve the expanded version');
});

test('forged historical lines, sums, references, sources and pending codes are rejected before displaying the old calculation',async()=>{
 const source=fixture();
 const corruptions=[
  report=>{report.lines[1].amount_cents=-1;},
  report=>{report.lines[1].sign=1;},
  report=>{report.lines[1].code='EXPECTED_PAYOUT';},
  report=>{report.lines[1].amount_cents=1999;},
  report=>{report.versions.costs=0;},
  report=>{report.source_checked_at={finance_oldest_at:stamp,finance_latest_at:stamp-1,ads_at:stamp};},
  report=>{report.pending=['PRIVATE_PROVIDER_VALUE'];},
 ];
 for(const corrupt of corruptions){
  const report=buildBusinessCheckpoint(source);corrupt(report);
  const b=browser(source),history={schema:'business_checkpoint_history_v1',month:source.month,retention_limit:128,checkpoints:[{revision:1,fingerprint:'d'.repeat(64),checkpoint:report}]};
  b.context.historySerialized=JSON.stringify(history);b.run("customApi=async(path,body)=>path.startsWith('finance/checkpoints')?JSON.parse(historySerialized):JSON.parse(JSON.stringify(currentFrame));");
  await b.run('brazaMonthDashboard.start({api,syncVariants})');b.run("control('CheckpointDetails').open=true;control('CheckpointDetails').ontoggle();");await b.settle();
  assert.match(b.text('CheckpointHistoryState'),/Não foi possível conferir o histórico/);assert.equal(b.text('CheckpointHistory'),'');assert.match(b.text('Net'),/43,00/);
 }
});

test('history validation refuses accessor fields without evaluating their getters',async()=>{
 const source=fixture(),b=browser(source),history={schema:'business_checkpoint_history_v1',month:source.month,retention_limit:128,checkpoints:[{revision:1,fingerprint:'a'.repeat(64),checkpoint:buildBusinessCheckpoint(source)}]};
 b.context.historySerialized=JSON.stringify(history);
 b.run("let getterReads=0;customApi=async(path,body)=>{if(!path.startsWith('finance/checkpoints'))return JSON.parse(JSON.stringify(currentFrame));const value=JSON.parse(historySerialized);Object.defineProperty(value.checkpoints[0].checkpoint,'lines',{enumerable:true,get(){getterReads++;throw Error('PRIVATE_GETTER');}});return value;};");
 await b.run('brazaMonthDashboard.start({api,syncVariants})');b.run("control('CheckpointDetails').open=true;control('CheckpointDetails').ontoggle();");await b.settle();
 assert.equal(b.run('getterReads'),0);assert.match(b.text('CheckpointHistoryState'),/Não foi possível conferir o histórico/);assert.doesNotMatch(b.text('CheckpointHistoryState'),/PRIVATE_GETTER/);assert.match(b.text('Net'),/43,00/);
});

function classificationFixture({due=0,enabled=true,products=null}={}){
 const rows=products||[{item_id:'200',product_name:'Camiseta infantil <img src=x>',status:due?'QUEUED':'MATCHED',reason:due?'CATALOG_NOT_READ':null,checked_at:stamp,catalog_fingerprint:'a'.repeat(64),model_count:1,resolved_count:due?0:1,next_attempt_at:due?stamp:stamp+86400,failure_count:0,variants:[{model_id:'300',model_name:'Estampa: Verde · Tamanho: 8',reason:null,attributes:[{name:'Cor',value:'Verde'},{name:'Tamanho',value:'8'}]}],variants_complete:true}];
 return {schema:'catalog_classification_state_v1',revision:1,counts:{total:1,queued:due?1:0,running:0,matched:due?0:1,partial:0,review:0,retry_wait:0,due:due?1:0},products:rows,limit:100,offset:0,more:false,next_due_at:due?stamp:stamp+86400,variants_limit_reached:false,enabled};
}

test('automatic catalogue metadata names the sold products and variations as text without replacing their financial amounts',async()=>{
 const b=browser(fixture({...productFixture(),classification_revision:1}));b.context.classified=JSON.stringify(classificationFixture());
 b.run("customApi=async(path,body)=>path.startsWith('catalog-classification?')?JSON.parse(classified):JSON.parse(JSON.stringify(currentFrame));");
 assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);
 assert.equal(b.run('syncCalls'),0);
 assert.equal(await b.run('brazaMonthDashboard.refreshCatalog()'),true);
 assert.match(b.text('ProductRows'),/Camiseta infantil <img src=x>/);assert.equal(b.run("control('ProductRows').children[0].children[0].children[0].tag"),'strong');
 b.run("control('ProductRows').children[0].children[0].children.find(child=>child.tag==='details').open=true;control('ProductRows').children[0].children[0].children.find(child=>child.tag==='details').ontoggle();");
 assert.match(b.text('ProductRows'),/Estampa: Verde · Tamanho: 8/);assert.match(b.text('ProductRows'),/Produto #200/);assert.match(b.text('Net'),/43,01/);
 b.run("control('ProductSearch').value='verde';control('ProductSearch').oninput();");assert.match(b.text('ProductRows'),/Camiseta infantil/);assert.doesNotMatch(b.text('ProductRows'),/Produto #201/);
 assert.equal(b.run("calls.filter(call=>call.path.startsWith('catalog-classification/sync')).length"),0,'a queue with no due work performs no source action');
});

test('one failed catalogue product does not stop automatic continuation and known classifications do not require per-product clicks',async()=>{
 const b=browser(fixture({...productFixture(),classification_revision:1}));b.context.classified=JSON.stringify(classificationFixture({due:1}));
 b.run("let classifiedSteps=0;customApi=async(path,body)=>{if(path.startsWith('catalog-classification?'))return JSON.parse(classified);if(path==='catalog-classification/sync'){classifiedSteps++;const state=JSON.parse(classified);if(classifiedSteps===2){state.counts={total:1,queued:0,running:0,matched:1,partial:0,review:0,retry_wait:0,due:0};state.next_due_at=Date.now()/1000+86400;classified=JSON.stringify(state);}return {status:'PROGRESSED',processed:classifiedSteps===1?[]:['200'],failed:classifiedSteps===1?['199']:[],state};}return JSON.parse(JSON.stringify(currentFrame));};");
 await b.run('brazaMonthDashboard.start({api,syncVariants})');assert.equal(await b.run('brazaMonthDashboard.refreshCatalog()'),true);assert.equal(b.run('classifiedSteps'),1);
 assert.equal(b.run("[...timers.values()].some(timer=>timer.delay===750)"),true);
 await b.run("[...timers.values()].find(timer=>timer.delay===750).callback()");
 assert.equal(b.run('classifiedSteps'),2);assert.equal(b.run('syncCalls'),0);assert.match(b.text('Net'),/43,01/);
 assert.equal(b.run("calls.filter(call=>call.path==='catalog-classification/sync').every(call=>Object.keys(call.body).length===0)"),true);
});

test('catalogue work pauses for hidden pages and a paused collection, then resumes once when visible',async()=>{
 const b=browser(fixture({...productFixture(),classification_revision:1}));b.context.classified=JSON.stringify(classificationFixture({due:1,enabled:false}));
 b.run("customApi=async(path,body)=>path.startsWith('catalog-classification?')?JSON.parse(classified):JSON.parse(JSON.stringify(currentFrame));");
 await b.run('brazaMonthDashboard.start({api,syncVariants})');await b.run('brazaMonthDashboard.refreshCatalog()');assert.match(b.text('CatalogStatus'),/pausada/);assert.equal(b.run("calls.filter(call=>call.path==='catalog-classification/sync').length"),0);
 b.run("document.hidden=true;document.handlers.visibilitychange();");assert.equal(b.run('timers.size'),0);assert.equal(await b.run('brazaMonthDashboard.refreshCatalog()'),false);
 b.run("document.hidden=false;document.handlers.visibilitychange();");assert.equal(b.run("[...timers.values()].filter(timer=>timer.delay===0).length"),1);
});

test('malformed catalogue metadata cannot replace trusted product prices or render raw source errors',async()=>{
 const b=browser(fixture({...productFixture(),classification_revision:1}));b.context.classified=JSON.stringify({...classificationFixture(),access_token:'PRIVATE_PROVIDER_TOKEN'});
 b.run("customApi=async(path,body)=>path.startsWith('catalog-classification?')?JSON.parse(classified):JSON.parse(JSON.stringify(currentFrame));");
 await b.run('brazaMonthDashboard.start({api,syncVariants})');assert.equal(await b.run('brazaMonthDashboard.refreshCatalog()'),false);
 assert.match(b.text('CatalogStatus'),/indisponível/);assert.doesNotMatch(b.text('CatalogStatus'),/PRIVATE|CATALOG_STATE/);assert.doesNotMatch(b.text('ProductRows'),/<img/);assert.match(b.text('Net'),/43,01/);
});

test('a known product subtotal remains visible beside final monthly blockers and states the data age',async()=>{
 const source=productFixture(1),row=source.product_summary.products[0];
 Object.assign(row,{known_exclusive_repass_cents:2198,exclusive_repass_cents:2198,known_exclusive_tax_cents:0,exclusive_tax_cents:0,known_production_cost_cents:1590,production_cost_cents:1590,known_exclusive_production_cost_cents:1590,exclusive_production_cost_cents:1590,known_exclusive_after_costs_cents:608,exclusive_after_costs_cents:null,exclusive_margin_bps:null,pending:['STATUS_REVIEW_REQUIRED','SOURCE_UNAVAILABLE']});Object.assign(row.variants[0],{unit_cost_cents:1590,production_cost_cents:1590,exclusive_production_cost_cents:1590});
 const mei={schema:'business_month_tax_v1',regime:'MEI',year:2026,policy_revision:1,monthly_das_cents:8605,tax_cents:8605,status:'DECLARED',source:'OPERATOR_DECLARED_DAS',basis:'MONTHLY_COMPETENCE_NO_PRORATION'};
 const value=fixture({...source,coverage:{...source.coverage,orders:4,cancel_pending:1},expected_repass_cents:2198,known_expected_repass_cents:2198,production_cost_cents:1590,known_production_cost_cents:1590,invoice_tax_cents:8605,known_invoice_tax_cents:8605,tax:mei,source_checked_at:{finance_oldest_at:stamp-1200,finance_latest_at:stamp,ads_at:stamp},result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['STATUS_REVIEW_REQUIRED','FINANCIAL_SOURCE_STALE']},product_summary:{...source.product_summary,tax_treatment:'MONTHLY_DAS_NOT_ALLOCATED'}});
 const b=browser(value);await b.run('brazaMonthDashboard.start({api,syncVariants})');
 assert.match(b.text('ProductRows'),/Subtotal da última leitura.*6,08/);assert.match(b.text('ProductRows'),/antes de anúncios, outras despesas e DAS-MEI mensal/);assert.match(b.text('ProductRows'),/saldo final continua em conferência/);assert.match(b.text('ProductPeriodNotice'),/Avisos do período/);assert.doesNotMatch(b.text('ProductRows'),/Há situações de pedidos do mês|Parte da leitura financeira/);assert.equal(b.text('Net'),'Em conciliação');
});

test('ready products on the visible page never hide the global queue of more than sixty products',async()=>{
 const b=browser(fixture({...productFixture(),classification_revision:1})),globalState=classificationFixture({due:1}),visibleState=classificationFixture();
 globalState.counts={total:61,queued:61,running:0,matched:0,partial:0,review:0,retry_wait:0,due:61};
 b.context.globalState=JSON.stringify(globalState);b.context.visibleState=JSON.stringify(visibleState);
 b.run("let classifiedSteps=0;customApi=async(path,body)=>{if(path.startsWith('catalog-classification?'))return JSON.parse(path.includes('item_ids=')?visibleState:globalState);if(path==='catalog-classification/sync'){classifiedSteps++;return {status:'PROGRESSED',processed:['999'],failed:[],state:JSON.parse(globalState)};}return JSON.parse(JSON.stringify(currentFrame));};");
 await b.run('brazaMonthDashboard.start({api,syncVariants})');await b.run('brazaMonthDashboard.refreshCatalog()');
 assert.equal(b.run('classifiedSteps'),1);assert.equal(b.run("[...timers.values()].some(timer=>timer.delay===750)"),true);
 await b.run("[...timers.values()].find(timer=>timer.delay===750).callback()");assert.equal(b.run('classifiedSteps'),2);
 assert.equal(b.run("calls.filter(call=>call.path.includes('catalog-classification?limit=1&')).length>=2"),true);
});

test('hiding the page during one catalogue request prevents follow-up reads and resumes the changed costs on return',async()=>{
 const b=browser(fixture({...productFixture(),classification_revision:1}));b.context.classified=JSON.stringify(classificationFixture({due:1}));
 b.run("let releaseClassification;customApi=async(path,body)=>{if(path.startsWith('catalog-classification?'))return JSON.parse(classified);if(path==='catalog-classification/sync')return new Promise(resolve=>releaseClassification=resolve);return JSON.parse(JSON.stringify(currentFrame));};");
 await b.run('brazaMonthDashboard.start({api,syncVariants})');const pending=b.run('brazaMonthDashboard.refreshCatalog()');await b.settle();
 assert.equal(b.run('typeof releaseClassification'),'function');const before=b.run('calls.length');
 b.run("document.hidden=true;document.handlers.visibilitychange();const completed=JSON.parse(classified);completed.revision=2;completed.counts={total:1,queued:0,running:0,matched:1,partial:0,review:0,retry_wait:0,due:0};completed.next_due_at=Date.now()/1000+86400;classified=JSON.stringify(completed);currentFrame.classification_revision=2;releaseClassification({status:'PROGRESSED',processed:['200'],failed:[],state:completed});");
 assert.equal(await pending,false);assert.equal(b.run('calls.length'),before);assert.equal(b.run('timers.size'),0);
 b.run("document.hidden=false;document.handlers.visibilitychange();");await b.run("[...timers.values()].find(timer=>timer.delay===0).callback()");
 assert.equal(b.run("calls.at(-1).body.operation"),'read');assert.match(b.text('Net'),/43,01/);
});

test('prepare fills the valid query month or the current Brasilia month before any authenticated API is available',()=>{
 for(const [search,expected] of [['?month=2026-09','2026-09'],['?month=2099-01','2026-10'],['?month=2026-13','2026-10'],['?month=2026-09&month=2026-08','2026-10'],['','2026-10']]){
  const b=browser(fixture(),search);assert.equal(b.run('brazaMonthDashboard.prepare()'),true);
  assert.equal(b.run("control('Select').value"),expected);assert.equal(b.run("control('Select').max"),'2026-10');assert.equal(b.run("control('Select').disabled"),true);assert.equal(b.run("control('Previous').disabled"),true);assert.equal(b.run("control('Refresh').disabled"),true);
  assert.equal(b.text('Refresh'),'Conectando…');assert.match(b.text('Status'),/Conectando ao painel/);assert.equal(b.text('Sales'),'Pendente');assert.equal(b.run('calls.length'),0);assert.equal(b.run('timers.size'),0);
 }
 const boundary=browser();boundary.run("clock=Date.parse('2026-11-01T01:00:00Z');brazaMonthDashboard.prepare();");assert.equal(boundary.run("control('Select').value"),'2026-10','the local month must remain October before midnight in Brasilia');
});

test('bootstrap failures display safe Portuguese text and one retry callback without an API request or raw fetch error',async()=>{
 const b=browser();b.run("let retries=0,releaseRetry;brazaMonthDashboard.prepare({retry:()=>{retries++;return new Promise(resolve=>releaseRetry=resolve);}});brazaMonthDashboard.bootstrapState({phase:'FAILED',message:'Failed to fetch PRIVATE_PROVIDER_TOKEN https://private.invalid'});");
 assert.match(b.text('Status'),/Não foi possível conectar ao painel/);assert.doesNotMatch(b.text('Status'),/Failed to fetch|PRIVATE|https:/);assert.equal(b.text('Refresh'),'Tentar novamente');assert.equal(b.run("control('Refresh').disabled"),false);
 const first=b.run("control('Refresh').onclick()"),second=b.run("control('Refresh').onclick()");
 assert.equal(await second,false);assert.equal(b.run('retries'),1);assert.equal(b.run("control('Refresh').disabled"),true);assert.equal(b.text('Refresh'),'Conectando…');assert.match(b.text('Status'),/Tentando conectar/);
 b.run('releaseRetry(false)');assert.equal(await first,false);assert.equal(b.run("control('Refresh').disabled"),false);assert.equal(b.text('Refresh'),'Tentar novamente');assert.equal(b.run('calls.length'),0);
});

test('a rejected bootstrap retry remains recoverable without reflecting its exception',async()=>{
 const b=browser();b.run("let retries=0;brazaMonthDashboard.prepare({retry:async()=>{retries++;throw Error('Failed to fetch PRIVATE_PROVIDER_TOKEN');}});brazaMonthDashboard.bootstrapState({phase:'FAILED'});");
 assert.equal(await b.run("control('Refresh').onclick()"),false);assert.equal(b.run('retries'),1);assert.equal(b.text('Refresh'),'Tentar novamente');assert.equal(b.run("control('Refresh').disabled"),false);assert.doesNotMatch(b.text('Status'),/PRIVATE|Failed to fetch/);assert.equal(b.run('calls.length'),0);
});

test('the prepared retry can start the monthly dashboard and late bootstrap notifications preserve its data and expense draft',async()=>{
 const b=browser();b.run("let retries=0;brazaMonthDashboard.prepare({retry:()=>{retries++;return brazaMonthDashboard.start({api,syncVariants});}});brazaMonthDashboard.bootstrapState({phase:'FAILED'});");
 assert.equal(await b.run("control('Refresh').onclick()"),true);assert.equal(b.run('retries'),1);assert.equal(b.run("control('Select').disabled"),false);assert.equal(b.run("control('Previous').disabled"),false);assert.equal(b.text('Refresh'),'Atualizar mês');assert.match(b.text('Net'),/43,00/);
 b.run("control('ExpensesValue').value='123.45';control('ExpensesValue').oninput();");const before=b.text('Status'),calls=b.run('calls.length');
 for(const phase of ['LOADING','RETRYING','FAILED','READY'])assert.equal(b.run('brazaMonthDashboard.bootstrapState({phase:'+JSON.stringify(phase)+',message:"Failed to fetch PRIVATE"})'),false);
 assert.equal(b.run('brazaMonthDashboard.prepare()'),false);assert.equal(b.run('calls.length'),calls);assert.equal(b.run("control('ExpensesValue').value"),'123.45');assert.equal(b.text('Status'),before);assert.match(b.text('Net'),/43,00/);
 b.run('brazaMonthDashboard.stop();');assert.equal(b.text('Refresh'),'Continuar consulta');assert.equal(b.run('brazaMonthDashboard.bootstrapState({phase:"FAILED"})'),false);assert.match(b.text('Net'),/43,00/);
});
