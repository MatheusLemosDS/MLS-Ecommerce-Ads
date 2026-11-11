import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {WEEKLY_OPERATING_CSS,WEEKLY_OPERATING_CLIENT,weeklyOperatingBody,createWeeklyOperatingController} from '../src/weekly-operating-view.mjs';
import {createWeeklyOperatingReportProtocol} from '../src/weekly-operating-report.mjs';
import {createExternalCashPeriodProtocol} from '../../finance/src/external-cash-period-frame.mjs';

const at=Date.parse('2026-11-11T15:00:00Z')/1000,cashProtocol=createExternalCashPeriodProtocol(),protocol=createWeeklyOperatingReportProtocol({projectCashPeriod:cashProtocol.projectExternalCashPeriodSummary});
const shift=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
function cash(period,{empty=false}={}){
 const bank={record_count:empty?0:2,credit_count:empty?0:1,credit_cents:empty?null:5000,debit_count:empty?0:1,debit_cents:empty?null:500,zero_count:0,matched_credit_count:empty?0:1,matched_credit_cents:empty?null:5000,unmatched_credit_count:0,unmatched_credit_cents:empty?null:0,review_count:0,latest_import_at:empty?null:at-60};
 const shopee={record_count:empty?0:1,positive_count:empty?0:1,positive_cents:empty?null:5000,negative_count:0,negative_cents:empty?null:0,zero_count:0,transfer_cents:empty?null:5000,matched_transfer_count:empty?0:1,matched_transfer_cents:empty?null:5000,unmatched_transfer_count:0,unmatched_transfer_cents:empty?null:0,review_count:0,latest_import_at:empty?null:at-120};
 return {schema:'external_cash_period_summary_v1',start_date:period.start_date,end_date:period.end_date,checked_at:at,revision:3,state:empty?'NO_IMPORTED_RECORDS':'AVAILABLE',currency:'BRL',coverage:'IMPORTED_FILES_ONLY',basis:'IMPORTED_BANK_AND_TRANSFER_CALENDARS',bank,shopee,pending:cashProtocol.externalCashPeriodPending(bank,shopee),realized_profit_cents:null};
}
function report(week='2026-11-06',{manufacturing=true,sales=true,imported=true,emptyCash=false,missingSale=null,unknownCost=false}={}){
 const p=protocol.weeklyOperatingPeriod(week,at);assert.ok(p);
 const intervals=Array.from({length:8},(_,i)=>({date:shift(p.calendar_period.start_date,i),part:i===0?'AT_OR_AFTER_13':i===7?'BEFORE_13':'DAY',state:'CONFIRMED',recorded:{quantity:1,known_quantity:unknownCost&&i===0?0:1,unknown_quantity:unknownCost&&i===0?1:0,known_cost_cents:unknownCost&&i===0?0:1590,boundary_pending_records:0}}));
 const coverage=manufacturing&&p.manufacturing_period.end_at<=at?{checked_at:at,revision:2,source:{ledger_revision:5,timing_revision:3},summary:{state:unknownCost?'PARTIAL':'CONFIRMED',recorded_quantity:8,unknown_cost_quantity:unknownCost?1:0,boundary_pending_records:0,known_cost_cents:unknownCost?11130:12720,total_cost_cents:unknownCost?null:12720,confirmed_intervals:8},intervals}:null;
 const grouped=new Map();
 if(sales)for(let i=0;i<7;i++){const date=shift(p.calendar_period.start_date,i);if(date>'2026-11-11'||date===missingSale)continue;const month=date.slice(0,7);if(!grouped.has(month))grouped.set(month,{month,publication_revision:9,bindings_revision:14,costs_revision:8,cost_rules_revision:7,classification_revision:42,expenses_revision:4,tax_policy_revision:2,source_checked_at:{finance_oldest_at:at-180,finance_latest_at:at-60,ads_at:at-60},days:[]});grouped.get(month).days.push({date,state:'PROVISIONAL',day_partial:false,sales_cents:10000,payout_cents:7000,production_cost_cents:3000,known_production_cost_cents:3000,ads_spend_cents:500,recharge_addback_cents:0,allocated_das_cents:100,allocated_expenses_cents:0,estimate_cents:3400,known_estimate_cents:3400,coverage:{paid:2,cancelled:1},pending:[]});}
 const result=protocol.buildWeeklyOperatingReport({checked_at:at,week_end:week,coverage,saved_report:coverage?{original_version:1,latest_version:2,original_cost_cents:12720,latest_cost_cents:12720,captured_at:p.manufacturing_period.end_at+30}:null,daily_summaries:[...grouped.values()],cash:imported?cash(p.calendar_period,{empty:emptyCash}):null});assert.ok(result,'fixture must pass the real closed protocol');return result;
}
function browser(){
 const elements=new Map(),listeners=new Map(),windowEvents=new Map();
 function node(tag='div'){let id='';const value={tag,textContent:'',value:'',disabled:false,hidden:false,children:[],dataset:{},attributes:{},style:{setProperty(name,value){this[name]=value;}},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=[...children];this.textContent='';},setAttribute(name,value){this.attributes[name]=value;},focus(){this.focused=true;},scrollIntoView(){}};Object.defineProperty(value,'id',{get:()=>id,set:valueId=>{id=valueId;elements.set(id,value);}});return value;}
 for(const [,id] of weeklyOperatingBody().matchAll(/\bid="([^"]+)"/g)){const value=node();value.id=id;}
 const el=name=>elements.get('weeklyOperating'+name),document={hidden:false,visibilityState:'visible',documentElement:{dataset:{activePanel:'overview'}},getElementById:id=>elements.get(id),createElement:node,addEventListener:(name,fn)=>listeners.set(name,fn)};
 const calls=[];let handler=async path=>report(new URLSearchParams(path.split('?')[1]).get('week_end'));
 const api=async(path,body)=>{calls.push({path,body});return handler(path,body);};
 class FixtureDate extends Date{static now(){return at*1000;}}
 const controller=createWeeklyOperatingController({document,Date:FixtureDate,addEventListener:(name,fn)=>windowEvents.set(name,fn)},protocol);controller.prepare();
 const text=value=>(value.textContent??'')+' '+value.children.map(text).join(' ');
 return {controller,el,document,calls,api,handler:value=>handler=value,text:name=>text(el(name)),event:name=>listeners.get(name)?.(),focus:()=>windowEvents.get('focus')?.()};
}
async function ready(options={}){const b=browser();if(options.handler)b.handler(options.handler);await b.controller.start({api:b.api});b.document.documentElement.dataset.activePanel='weekly-report';await b.controller.open();b.el('WeekEnd').value='2026-11-06';b.el('WeekEnd').onchange();await b.el('Form').onsubmit();return b;}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('the asset is importable before DOM exists and opening the report performs only a lazy saved-data GET',async()=>{
 const context=vm.createContext({document:{getElementById(){return null;}},URLSearchParams});assert.doesNotThrow(()=>vm.runInContext(WEEKLY_OPERATING_CLIENT,context));assert.equal(typeof context.brazaWeeklyOperating.start,'function');
 const b=browser();await b.controller.init(b.api);assert.equal(b.calls.length,0);b.document.documentElement.dataset.activePanel='weekly-report';await b.controller.open();assert.equal(b.calls.length,1);assert.equal(b.calls[0].path,'reports/weekly?week_end=2026-11-13');assert.equal(b.calls[0].body,undefined);assert.equal(b.el('WeekEnd').max,'2026-11-13');assert.equal(b.el('Next').disabled,true);
});

test('cross-month cuts stay separate: eight manufacturing intervals, seven civil sales dates and imported cash origins',async()=>{
 const b=await ready();assert.match(b.text('ManufacturingScope'),/30\/10\/2026.*06\/11\/2026/);assert.match(b.text('SalesScope'),/30\/10\/2026 a 05\/11\/2026/);assert.equal(b.el('ManufacturingChart').children.length,8);assert.equal(b.el('SalesChart').children.length,7);assert.equal(b.el('CashChart').children.length,4);assert.match(b.text('ManufacturingValue'),/127,20/);assert.match(b.text('SalesValue'),/238,00/);assert.match(b.text('CashValue'),/50,00/);assert.match(b.text('SalesSources'),/Mês 2026-10/);assert.match(b.text('SalesSources'),/Mês 2026-11/);assert.equal(b.controller.getSnapshot().realized_profit_cents,null);assert.equal(b.calls.some(call=>call.body!==undefined),false);
});

test('chart points respond to clicks and keyboard arrows without changing the selected week or querying another source',async()=>{
 const b=await ready(),before=b.calls.length,chart=b.el('ManufacturingChart');chart.children[2].onclick();assert.match(b.text('ManufacturingSelected'),/01\/11\/2026/);let prevented=false;chart.children[2].onkeydown({key:'ArrowRight',preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(chart.children[3].attributes['aria-pressed'],'true');assert.equal(chart.children[3].focused,true);assert.match(b.text('ManufacturingSelected'),/02\/11\/2026/);chart.children[3].onkeydown({key:'End',preventDefault(){}});assert.match(b.text('ManufacturingSelected'),/06\/11\/2026.*antes de 13h/);assert.equal(b.calls.length,before);
});

test('one unavailable block does not hide the other valid sources and does not create a zero manufacturing cost',async()=>{
 const b=await ready({handler:path=>report(new URLSearchParams(path.split('?')[1]).get('week_end'),{manufacturing:false})});assert.equal(b.el('ManufacturingValue').textContent,'Pendente');assert.match(b.text('ManufacturingPending'),/registros de fabricação ainda não estão disponíveis/);assert.match(b.text('SalesValue'),/238,00/);assert.match(b.text('CashValue'),/50,00/);assert.equal(b.controller.getSnapshot().state,'PARTIAL');assert.equal(b.el('SalesChart').children.length,7);
});

test('missing days produce a labelled known subtotal and a gap instead of a fabricated complete weekly result',async()=>{
 const b=await ready({handler:path=>report(new URLSearchParams(path.split('?')[1]).get('week_end'),{missingSale:'2026-11-01'})});assert.equal(b.controller.getSnapshot().sales_estimate.totals.estimate_cents,null);assert.match(b.text('SalesValue'),/204,00/);assert.match(b.text('SalesValueLabel'),/Subtotal conhecido.*parcial/);const point=b.el('SalesChart').children[2];point.onclick();assert.match(b.text('SalesSelected'),/Pendente/);assert.match(b.text('SalesSelected'),/Não capturado/);assert.match(b.text('SalesCoverage'),/6 de 7 dias/);
});

test('unknown manufacturing cost remains partial while the independent sales estimate is unchanged',async()=>{
 const b=await ready({handler:path=>report(new URLSearchParams(path.split('?')[1]).get('week_end'),{unknownCost:true})});assert.match(b.text('ManufacturingValue'),/111,30/);assert.match(b.text('ManufacturingValueLabel'),/parcial/);b.el('ManufacturingChart').children[0].onclick();assert.match(b.text('ManufacturingSelected'),/Pendente/);assert.match(b.text('ManufacturingMetrics'),/Peças com custo pendente\s+1/);assert.match(b.text('SalesValue'),/238,00/);b.el('ManufacturingMetric').value='quantity';b.el('ManufacturingMetric').onchange();b.el('ManufacturingChart').children[0].onclick();assert.match(b.text('ManufacturingSelected'),/Quantidade registrada: 1/);
});

test('a recorded zero unit cost remains a known zero point while an unconfirmed empty interval remains a gap',async()=>{
 function partial(week,known){const value=report(week);if(value.manufacturing.state==='UNAVAILABLE')return value;const m=value.manufacturing,row=m.days[0];row.state='UNCONFIRMED';row.known_cost_cents=known?0:null;row.total_cost_cents=null;if(!known){row.recorded_quantity=0;m.recorded_quantity=7;m.known_cost_quantity=7;}m.confirmed_intervals=7;m.known_cost_cents=11130;m.total_cost_cents=null;m.state='PARTIAL';m.pending=['MANUFACTURING_COVERAGE_UNCONFIRMED'];value.state='PARTIAL';assert.ok(protocol.projectWeeklyOperatingReport(value));return value;}
 const zero=await ready({handler:path=>partial(new URLSearchParams(path.split('?')[1]).get('week_end'),true)});zero.el('ManufacturingChart').children[0].onclick();assert.match(zero.text('ManufacturingSelected'),/Custo identificado: R\$ 0,00/);assert.doesNotMatch(zero.text('ManufacturingSelected'),/Custo identificado: Pendente/);assert.equal(zero.el('ManufacturingChart').children[0].children[0].children[0].style.height,'0%');
 const gap=await ready({handler:path=>partial(new URLSearchParams(path.split('?')[1]).get('week_end'),false)});gap.el('ManufacturingChart').children[0].onclick();assert.match(gap.text('ManufacturingSelected'),/Custo identificado: Pendente/);assert.equal(gap.el('ManufacturingChart').children[0].children[0].children[0].textContent,'—');
});

test('no imported records keeps cash values pending; genuine zero and negative imported amounts remain distinct',async()=>{
 const empty=await ready({handler:path=>report(new URLSearchParams(path.split('?')[1]).get('week_end'),{emptyCash:true})});assert.equal(empty.el('CashValue').textContent,'Pendente');assert.match(empty.text('CashPending'),/Não há registros importados/);assert.doesNotMatch(empty.text('CashMetrics'),/R\$ 0,00/);
 const b=await ready();assert.match(b.text('CashMetrics'),/− R\$ 5,00/);b.el('CashChart').children[3].onclick();assert.match(b.text('CashSelected'),/R\$ 0,00/);assert.doesNotMatch(b.text('CashSelected'),/− R\$ 0,00/);b.el('CashMetric').value='matched';b.el('CashMetric').onchange();assert.equal(b.el('CashChart').children.length,2);assert.match(b.text('CashCoverage'),/Não some créditos e transferências/);
});

test('Friday controls reject other weekdays and future cuts and support earlier valid weeks',async()=>{
 const b=await ready(),before=b.calls.length;b.el('WeekEnd').value='2026-11-12';b.el('WeekEnd').onchange();assert.equal(await b.el('Form').onsubmit(),false);assert.equal(b.calls.length,before);assert.match(b.text('Status'),/sexta-feira válida/);b.el('WeekEnd').value='2026-11-20';b.el('WeekEnd').onchange();assert.equal(await b.el('Form').onsubmit(),false);assert.equal(b.calls.length,before);b.el('WeekEnd').value='2026-11-06';b.el('WeekEnd').onchange();await b.el('Previous').onclick();assert.equal(b.controller.getSnapshot().week_end,'2026-10-30');assert.match(b.text('LoadedSelection'),/30\/10\/2026/);
});

test('refreshing saved data preserves an unapplied date draft and marks the actually displayed week',async()=>{
 const b=await ready();b.el('WeekEnd').value='2026-10-30';b.el('WeekEnd').oninput();await b.el('Refresh').onclick();assert.equal(b.el('WeekEnd').value,'2026-10-30');assert.equal(b.controller.getSnapshot().week_end,'2026-11-06');assert.match(b.text('LoadedSelection'),/06\/11\/2026.*data ainda não aplicada/);assert.match(b.calls.at(-1).path,/week_end=2026-11-06/);
});

test('out-of-order replies cannot overwrite a later selection and the API read remains bound to its requested Friday',async()=>{
 const b=await ready(),pending=new Map();b.handler(path=>new Promise(resolve=>pending.set(new URLSearchParams(path.split('?')[1]).get('week_end'),resolve)));b.el('WeekEnd').value='2026-10-30';b.el('WeekEnd').onchange();const first=b.el('Form').onsubmit();b.el('WeekEnd').value='2026-10-23';b.el('WeekEnd').onchange();const second=b.el('Form').onsubmit();pending.get('2026-10-23')(report('2026-10-23'));await second;pending.get('2026-10-30')(report('2026-10-30'));await first;assert.equal(b.controller.getSnapshot().week_end,'2026-10-23');assert.match(b.text('LoadedSelection'),/23\/10\/2026/);
 b.handler(()=>report('2026-10-30'));assert.equal(await b.el('Refresh').onclick(),false);assert.equal(b.controller.getSnapshot().week_end,'2026-10-23');assert.match(b.text('Status'),/leitura de 23\/10\/2026 foi preservada/);
});

test('transport or invalid closed-contract responses preserve the old report with its original date visible',async()=>{
 const b=await ready(),previous=b.controller.getSnapshot();b.handler(()=>{throw Error('synthetic offline');});b.el('WeekEnd').value='2026-10-30';b.el('WeekEnd').onchange();assert.equal(await b.el('Form').onsubmit(),false);assert.equal(b.controller.getSnapshot(),previous);assert.match(b.text('Status'),/leitura de 06\/11\/2026 foi preservada/);b.handler(()=>({...report('2026-10-30'),realized_profit_cents:123}));assert.equal(await b.el('Refresh').onclick(),false);assert.equal(b.controller.getSnapshot(),previous);
});

test('hiding and logout invalidate outstanding responses and remove all private displayed values',async()=>{
 const b=await ready();let finish;b.handler(()=>new Promise(resolve=>finish=resolve));const pending=b.el('Refresh').onclick();b.controller.setVisible(false);finish(report());await pending;assert.equal(b.controller.getSnapshot().week_end,'2026-11-06');const reopened=b.controller.open();await flush();b.controller.stop();finish(report());await reopened;assert.equal(b.controller.getSnapshot(),null);assert.equal(b.el('WeekEnd').value,'');assert.equal(b.el('SalesValue').textContent,'Pendente');assert.equal(b.el('CashSources').children.length,0);assert.equal(b.el('ManufacturingChart').children.length,0);assert.equal(b.el('Apply').disabled,true);
});

test('self-contained read-only asset and responsive styles retain separate bases and usable report links',()=>{
 assert.doesNotThrow(()=>new Function(WEEKLY_OPERATING_CLIENT));assert.doesNotMatch(WEEKLY_OPERATING_CLIENT,/innerHTML|localStorage|sessionStorage|console\.|fetch\(/);assert.match(WEEKLY_OPERATING_CSS,/min-height:44px/);assert.match(WEEKLY_OPERATING_CSS,/safe-area-inset-bottom/);assert.match(weeklyOperatingBody(),/sete dias civis/);assert.match(weeklyOperatingBody(),/não é descontada novamente/);assert.match(weeklyOperatingBody(),/Não|não/);assert.match(weeklyOperatingBody(),/tab=agent-finance/);
});
