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
