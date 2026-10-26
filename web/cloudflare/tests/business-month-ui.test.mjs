import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {BUSINESS_MONTH_CLIENT} from '../src/business-month-client.mjs';
import {BUSINESS_MONTH_CSS,businessMonthBody} from '../src/business-month-view.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {buildBusinessCheckpoint} from '../src/business-checkpoint.mjs';
import {buildMonthlyFinancialSummary} from '../src/business-month-summary.mjs';
import {projectBusinessCostDiagnostics,projectBusinessCostDiagnosticsEvidence,projectBusinessCostDiagnosticsEvidenceV2} from '../src/business-cost-diagnostics.mjs';
import {projectHistoricalCostPairDiagnostics,projectHistoricalCostPairDiagnosticsEvidence,deriveHistoricalCostComposition} from '../src/historical-cost-evidence.mjs';
import {buildRecordedBusinessBalance,projectRecordedBusinessBalance} from '../src/business-recorded-balance.mjs';
import {projectBackgroundCollectionDiagnostics} from '../src/background-collection-diagnostics.mjs';

const current='2026-10-22T12:00:00Z',stamp=Date.parse(current)/1000;
function calendar(month='2026-10',end=22,expense='10'){
 const selections=Array.from({length:Math.ceil(end/15)},(_,index)=>({start_date:month+'-'+String(index*15+1).padStart(2,'0'),end_date:month+'-'+String(Math.min(end,index*15+15)).padStart(2,'0')}));
 const children=selections.map(selection=>{
  const days=Array.from({length:Number(selection.end_date.slice(8))-Number(selection.start_date.slice(8))+1},(_,index)=>month+'-'+String(Number(selection.start_date.slice(8))+index).padStart(2,'0'));
  return buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:selection,balance:9999,daily:days.map(date=>({date,expense:Number(date.slice(8))===end?expense:'0',broad_gmv:Number(date.slice(8))===end?'200':'0',broad_order:Number(date.slice(8))===end?5:0,broad_roas:20,direct_gmv:0,direct_order:0,direct_roas:0}))},selection,stamp);
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
function partialCostProductFixture(){
 const source=mixedProductFixture(),row=source.product_summary.products[0];
 row.known_production_cost_cents=1000;row.production_cost_cents=null;Object.assign(row.variants[0],{quantity:1,mixed_quantity:0,production_cost_cents:1000});
 row.variants.push({model_id:'302',quantity:1,exclusive_quantity:0,mixed_quantity:1,unit_cost_cents:null,production_cost_cents:null,exclusive_production_cost_cents:0,selling_unit:null,size:null,male_size:null,female_size:null});
 source.known_production_cost_cents=2000;source.production_cost_cents=null;source.unmapped_variants=[{item_id:'200',model_id:'302',quantity:1}];source.result={...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['PRODUCTION_COST_INCOMPLETE']};
 return fixture(source);
}
function browser(value=fixture(),search=''){
 const context=vm.createContext({URLSearchParams,TextEncoder});
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
 let currentFrame=JSON.parse(${JSON.stringify(JSON.stringify(value))});const calls=[];let customApi=null,customViewApi=null,syncCalls=0;
 // These tests exercise the explicit manual path with the automatic collector
 // paused. Current-month cron ownership has a separate dedicated test suite.
 const savedView=value=>({schema:'business_month_view_v1',month:value.month,display:JSON.parse(JSON.stringify(value)),display_source:'ACTIVE',collection:{status:value.status,start_date:value.start_date,end_date:value.end_date,checked_at:value.checked_at,progress:JSON.parse(JSON.stringify(value.progress)),coverage:JSON.parse(JSON.stringify(value.coverage)),source_checked_at:value.source_checked_at??null,collection:value.collection??null},automatic:{enabled:false,applicable:value.month===new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7),status:'PAUSED',next_run_at:0,last_attempt_at:null}});
 const api=async(path,body)=>{calls.push({path,body});if(path.startsWith('finance/business-month-view?'))return customViewApi?customViewApi(path):savedView(currentFrame);return customApi?customApi(path,body):JSON.parse(JSON.stringify(currentFrame));};
 async function startManual(options={api,syncVariants}){const opened=await brazaMonthDashboard.start(options);if(!opened)return false;return control('SourceRefresh').onclick();}
 const operationCalls=(rows=calls)=>rows.map(call=>call.path.startsWith('finance/business-month-view?')?'view':call.body?.operation||'observe');
 const syncVariants=async rows=>{syncCalls++;return true;};
 `+BUSINESS_MONTH_CLIENT).runInContext(context);
 const run=code=>new vm.Script(code).runInContext(context);
 const load=data=>{context.serialized=JSON.stringify(data);run('currentFrame=JSON.parse(serialized);');};
 const settle=async()=>{for(let index=0;index<10;index++)await Promise.resolve();};
 return {run,load,context,settle,text:name=>run("text(control("+JSON.stringify(name)+"))")};
}
function collectionFixture(state='READY',code=null,wait=0,changes={}){
 const source=fixture(),pending=['COLLECTING','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADJUSTMENT_UNAVAILABLE'];
 if(state!=='READY'&&!['BUSINESS_PERIOD_CHECKPOINT','BUSINESS_PERIOD_BUSY','BUSINESS_PERIOD_CONFLICT'].includes(code))pending.push('SOURCE_UNAVAILABLE');
 return fixture({...source,status:'RUNNING',progress:{windows_total:2,windows_complete:1,pages_read:1},sales_cents:null,expected_repass_cents:null,production_cost_cents:null,invoice_tax_cents:null,ads_adjustment_cents:null,result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending},collection:{schema:'business_month_collection_v1',state,code,retry_after_seconds:wait},...changes});
}

test('the dashboard binds both financial panels to the exact published view and suspends them during manual collection',async()=>{
 const b=browser();
 b.run(`
  const auditCalls=[];
  globalThis.brazaReconciliation={start:()=>true,stop(){},observe:(selected,scope)=>{auditCalls.push({panel:'returns',selected,scope:scope===null?null:JSON.parse(JSON.stringify(scope))});return Promise.resolve(scope!==null);}};
  globalThis.brazaEscrowReleases={start:()=>true,stop(){},observe:(selected,scope)=>{auditCalls.push({panel:'releases',selected,scope:scope===null?null:JSON.parse(JSON.stringify(scope))});return Promise.resolve(scope!==null);}};
  let publishedScope={publication_revision:7,start_date:'2026-10-01',end_date:'2026-10-22',sources:[{run_id:'11111111-1111-4111-8111-111111111111',source_revision:2,start_date:'2026-10-01',end_date:'2026-10-15'},{run_id:'22222222-2222-4222-8222-222222222222',source_revision:3,start_date:'2026-10-16',end_date:'2026-10-22'}]};
  customViewApi=()=>({...savedView(currentFrame),schema:'business_month_view_v2',display_source:'PUBLISHED',audit_scope:JSON.parse(JSON.stringify(publishedScope))});
 `);
 assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);
 const first=JSON.parse(b.run('JSON.stringify(auditCalls.filter(call=>call.scope!==null))'));
 assert.equal(first.length,2);assert.deepEqual(first.map(call=>call.panel),['returns','releases']);assert.equal(first[0].scope.publication_revision,7);assert.deepEqual(first[0].scope,first[1].scope);assert.equal(first[0].scope.sources.length,2);
 const initialNet=b.text('Net');
 b.run('publishedScope.publication_revision=8;publishedScope.sources[0].run_id="33333333-3333-4333-8333-333333333333";');
 assert.equal(await b.run('control("Refresh").onclick()'),true);
 const changed=JSON.parse(b.run('JSON.stringify(auditCalls.slice(-2))'));
 assert.ok(changed.every(call=>call.scope.publication_revision===8&&call.scope.sources[0].run_id.startsWith('33333333')));assert.equal(b.text('Net'),initialNet,'equal aggregates cannot hide a new publication identity');
 b.run('customApi=async(path,body)=>body?.operation==="start"?new Promise(resolve=>globalThis.finishManual=resolve):JSON.parse(JSON.stringify(currentFrame));globalThis.manual=control("SourceRefresh").onclick();');await b.settle();
 assert.ok(JSON.parse(b.run('JSON.stringify(auditCalls.slice(-2))')).every(call=>call.scope===null),'manual work clears the published identity before its response');
 b.run('finishManual(JSON.parse(JSON.stringify(currentFrame)));');await b.run('manual');
 assert.ok(JSON.parse(b.run('JSON.stringify(auditCalls.slice(-2))')).every(call=>call.scope===null));
 assert.equal(await b.run('brazaMonthDashboard.refresh()'),true);
 assert.ok(JSON.parse(b.run('JSON.stringify(auditCalls.slice(-2))')).every(call=>call.scope.publication_revision===8));
 b.run('brazaMonthDashboard.stop();');
});

test('legacy and active views keep financial audit scopes suspended until a verified publication identity is available',async()=>{
 for(const mode of ['legacy','active']){
  const b=browser();b.context.mode=mode;
  b.run(`
   const auditCalls=[];
   const panel={start:()=>true,stop(){},observe:(selected,scope)=>{auditCalls.push({selected,scope});return Promise.resolve(false);}};
   globalThis.brazaReconciliation=panel;globalThis.brazaEscrowReleases=panel;
   customViewApi=()=>mode==='legacy'?{...savedView(currentFrame),display_source:'PUBLISHED'}:{...savedView(currentFrame),schema:'business_month_view_v2',audit_scope:null};
  `);
  assert.equal(await b.run('brazaMonthDashboard.start({api})'),true,mode);assert.match(b.text('Net'),/43,00/);assert.ok(b.run('auditCalls.length>=2'));assert.equal(b.run('auditCalls.some(call=>call.scope!==null)'),false,mode);b.run('brazaMonthDashboard.stop();');
 }
});
const recoveryTick=b=>b.run('clock+=[...timers.values()][0].delay;[...timers.values()][0].callback()');
const operations=b=>JSON.parse(b.run("JSON.stringify(operationCalls())"));

function costDiagnosticFixture(source=partialCostProductFixture(),changes={}){
 const versions={bindings:source.bindings_revision,costs:source.costs_revision,cost_rules:source.cost_rules_revision??null,classifications:source.classification_revision??null},summary=buildMonthlyFinancialSummary(source),products=source.unmapped_variants.map(row=>({item_id:row.item_id,product_name:'Camiseta infantil',catalog_checked_at:null,classification:null,variants:[{model_id:row.model_id,quantity:row.quantity,model_name:null,attributes:[],reason:'NO_CATALOG',recoverable:true,next_attempt_at:null,unit_cost_cents:null,production_cost_cents:null,assignment:null}]}));
 const value={schema:'business_cost_diagnostics_v1',month:source.month,start_date:source.start_date,end_date:source.end_date,checked_at:source.checked_at,diagnosed_at:stamp,consistent:true,status:source.status,pending:source.result.pending,coverage:source.coverage,review_counts:{IN_CANCEL:source.coverage.cancel_pending,TO_RETURN:source.coverage.other,UNKNOWN_STATUS:source.coverage.unknown},source_checked_at:source.source_checked_at??{finance_oldest_at:source.checked_at,finance_latest_at:source.checked_at,ads_at:source.checked_at},collection:source.collection??null,versions:{monthly:{...versions},current:{...versions}},summary,totals:{sales_cents:source.sales_cents,known_sales_cents:source.known_sales_cents,expected_repass_cents:source.expected_repass_cents,known_expected_repass_cents:source.known_expected_repass_cents,production_cost_cents:source.production_cost_cents,known_production_cost_cents:source.known_production_cost_cents,invoice_tax_cents:source.invoice_tax_cents,ads_spend_cents:source.ads.expense_cents,external_expenses_cents:source.expenses.external_expenses_cents,ads_adjustment_cents:source.ads_adjustment_cents,recharge_addback_cents:source.expenses.recharge_treatment==='ADS_RECHARGE'?source.ads_adjustment_cents:0,net_estimate_cents:source.result.net_estimate_cents,realized_net_cents:null,summary_balance_cents:summary.balance_cents},settings:{mode:'all_inclusive',inclusive_regular_cents:1590,inclusive_plus_cents:2140,base_regular_cents:null,base_plus_cents:null,components:[],custom_profiles:[],rules:[{id:'camiseta-infantil',label:'Infantil',enabled:true,unit_cost_cents:1425}]},products,truncation:{truncated:false,products_total:products.length,products_included:products.length,variants_total:source.unmapped_variants.length,variants_included:source.unmapped_variants.length,reason:null,text_truncated:false},...changes};
 assert.ok(projectBusinessCostDiagnostics(value),'UI diagnostic fixture must satisfy the shared owner projector');return value;
}

test('one local diagnostic displays all eight missing-cost products, reasons and three exact review categories, then copies only its response',async()=>{
 const source=partialCostProductFixture(),summary=buildMonthlyFinancialSummary(source);summary.production_coverage={total_units:257,known_units:232,pending_units:25,pending_variants:13,pending_products:8};
 const products=Array.from({length:8},(_,index)=>({item_id:String(500+index),product_name:'Produto infantil '+index,catalog_checked_at:stamp-10,classification:index===0?{status:'RETRY_WAIT',reason:'CATALOG_UNAVAILABLE',checked_at:stamp-10,next_attempt_at:stamp+300,failure_count:2}:null,variants:Array.from({length:index<5?2:1},(_,model)=>({model_id:String(model),quantity:index<5?2:1,model_name:'Tamanho '+(model?6:4),attributes:[{name:'Tamanho',value:model?'6':'4'}],reason:index===1?'RULE_DISABLED':'NO_CATALOG',recoverable:index>1,next_attempt_at:index===0?stamp+300:null,unit_cost_cents:null,production_cost_cents:null,assignment:null}))}));
 products[7].variants[0].quantity=3;const coverage={...source.coverage,orders:source.coverage.orders+2,cancel_pending:1,other:1},diagnostic=costDiagnosticFixture(source,{summary,coverage,review_counts:{IN_CANCEL:1,TO_RETURN:1,UNKNOWN_STATUS:0},products,truncation:{truncated:false,products_total:8,products_included:8,variants_total:13,variants_included:13,reason:null,text_truncated:false}}),b=browser(source);b.context.diagnostic=JSON.stringify(diagnostic);
 await b.run('brazaMonthDashboard.start({api})');const oldNet=b.text('Net'),before=b.run('calls.length');b.run('customApi=async(path,body)=>path.startsWith("finance/cost-diagnostics?")?JSON.parse(diagnostic):JSON.parse(JSON.stringify(currentFrame));globalThis.copied=null;globalThis.navigator={clipboard:{writeText:async value=>{copied=value;}}};');
 assert.equal(await b.run('control("CostCheck").onclick()'),true);assert.equal(b.run('calls.length'),before+1);assert.match(b.text('CostDiagnosticBody'),/25 unidade.*13 variação.*8 produto/);assert.match(b.text('CostDiagnosticBody'),/Em cancelamento: 1.*Em devolução: 1.*Situação desconhecida: 0/);assert.match(b.text('CostDiagnosticBody'),/regra de custo associada está desativada/);assert.match(b.text('CostDiagnosticBody'),/Aguardando nova tentativa.*próxima tentativa/);for(let i=0;i<8;i++)assert.match(b.text('CostDiagnosticBody'),new RegExp('Produto infantil '+i));assert.equal(b.text('Net'),oldNet);
 assert.equal(await b.run('control("CostCopy").onclick()'),true);assert.deepEqual(JSON.parse(b.run('copied')),diagnostic);assert.doesNotMatch(b.run('copied'),/csrf|cookie|token|order_sn/);assert.equal(b.run('calls.slice('+before+').some(call=>call.body!==undefined)'),false);
});

test('one automatic cost action stops at eight targeted requests and reads the monthly result locally without overwriting expense drafts',async()=>{
 const source=partialCostProductFixture(),diagnostic=costDiagnosticFixture(source),b=browser(source);b.context.diagnostic=JSON.stringify(diagnostic);await b.run('brazaMonthDashboard.start({api})');const before=b.run('calls.length');
 b.run('control("ExpensesValue").value="37,50";control("ExpensesValue").oninput();customApi=async(path,body)=>path.startsWith("finance/cost-diagnostics?")?JSON.parse(diagnostic):path.startsWith("finance/cost-recovery?")?{schema:"business_cost_recovery_v1",month:"2026-10",diagnostic:JSON.parse(diagnostic),work:{status:"PROGRESSED",processed:["200"],failed:[]}}:JSON.parse(JSON.stringify(currentFrame));');
 assert.equal(await b.run('control("CostRecover").onclick()'),true);assert.equal(b.run('calls.slice('+before+').filter(call=>call.path.startsWith("finance/cost-recovery?")).length'),8);assert.deepEqual(JSON.parse(b.run('JSON.stringify(operationCalls(calls.slice('+before+').filter(call=>call.path.startsWith("finance/business-month-view?"))))')),['view']);assert.equal(b.run('control("ExpensesValue").value'),'37,50');assert.match(b.text('CostDiagnosticStatus'),/atingiu o limite/);assert.match(b.text('NetLabel'),/ainda falta produção|Saldo/);assert.equal(b.run('calls.slice('+before+').some(call=>["start","step","ads","expenses"].includes(call.body?.operation))'),false);
});

test('historical cost recovery remains eligible during catalogue backoff and respects server pauses, leases and retry limits',async()=>{
 const source=partialCostProductFixture();
 for(const reason of ['NO_CATALOG','MODEL_NOT_IN_CATALOG'])for(const state of ['PROGRESSED','PAUSED','LEASED','RETRY_WAIT']){
  const diagnostic=costDiagnosticFixture(source),product=diagnostic.products[0];product.classification={status:'RETRY_WAIT',reason:'CATALOG_UNAVAILABLE',checked_at:stamp-10,next_attempt_at:stamp+86400,failure_count:20};Object.assign(product.variants[0],{reason,recoverable:false,next_attempt_at:stamp+86400});assert.ok(projectBusinessCostDiagnostics(diagnostic));
  const b=browser(source);b.context.diagnostic=JSON.stringify(diagnostic);b.context.workStatus=state;await b.run('brazaMonthDashboard.start({api})');const before=b.run('calls.length');
  b.run('customApi=async(path)=>path.startsWith("finance/cost-diagnostics?")?JSON.parse(diagnostic):path.startsWith("finance/cost-recovery?")?{schema:"business_cost_recovery_v1",month:"2026-10",diagnostic:JSON.parse(diagnostic),work:{status:workStatus,processed:workStatus==="PROGRESSED"?["200"]:[],failed:[]}}:JSON.parse(JSON.stringify(currentFrame));');
  assert.equal(await b.run('control("CostRecover").onclick()'),true,reason+' '+state);assert.equal(b.run('calls.slice('+before+').filter(call=>call.path.startsWith("finance/cost-recovery?")).length'),state==='PROGRESSED'?8:1,reason+' '+state);assert.deepEqual(JSON.parse(b.run('JSON.stringify(operationCalls(calls.slice('+before+').filter(call=>call.path.startsWith("finance/business-month-view?"))))')),['view']);assert.match(b.text('CostDiagnosticBody'),/histórico de pedidos pode confirmar/);assert.match(b.text('CostDiagnosticStatus'),state==='PROGRESSED'?/atingiu o limite/:state==='PAUSED'?/pausada/:state==='LEASED'?/Outra conferência/:/Uma fonte precisa aguardar/);b.run('brazaMonthDashboard.stop()');
 }
 const diagnostic=costDiagnosticFixture(source);diagnostic.consistent=false;diagnostic.versions.current.costs++;diagnostic.products[0].variants[0].recoverable=false;assert.ok(projectBusinessCostDiagnostics(diagnostic));const b=browser(source);b.context.diagnostic=JSON.stringify(diagnostic);await b.run('brazaMonthDashboard.start({api})');const before=b.run('calls.length');b.run('customApi=async(path)=>path.startsWith("finance/cost-diagnostics?")?JSON.parse(diagnostic):JSON.parse(JSON.stringify(currentFrame));');assert.equal(await b.run('control("CostRecover").onclick()'),true);assert.equal(b.run('calls.slice('+before+').filter(call=>call.path.startsWith("finance/cost-recovery?")).length'),0);assert.match(b.text('CostDiagnosticBody'),/custos mudaram durante a conferência/);b.run('brazaMonthDashboard.stop()');
});

test('automatic cost work stops immediately for policy pause, active lease or provider backoff and never guesses ambiguous composition',async()=>{
 const source=partialCostProductFixture();for(const state of ['PAUSED','LEASED','RETRY_WAIT']){const diagnostic=costDiagnosticFixture(source),b=browser(source);b.context.diagnostic=JSON.stringify(diagnostic);b.context.workStatus=state;await b.run('brazaMonthDashboard.start({api})');const before=b.run('calls.length');b.run('customApi=async(path)=>path.startsWith("finance/cost-diagnostics?")?JSON.parse(diagnostic):path.startsWith("finance/cost-recovery?")?{schema:"business_cost_recovery_v1",month:"2026-10",diagnostic:JSON.parse(diagnostic),work:{status:workStatus,processed:[],failed:[]}}:JSON.parse(JSON.stringify(currentFrame));');assert.equal(await b.run('control("CostRecover").onclick()'),true);assert.equal(b.run('calls.slice('+before+').filter(call=>call.path.startsWith("finance/cost-recovery?")).length'),1,state);assert.match(b.text('CostDiagnosticStatus'),state==='PAUSED'?/pausada/:state==='LEASED'?/Outra conferência/:/Uma fonte precisa aguardar/);}
 const diagnostic=costDiagnosticFixture(source);diagnostic.products[0].variants[0].reason='CONFLICT';diagnostic.products[0].variants[0].recoverable=false;const b=browser(source);b.context.diagnostic=JSON.stringify(diagnostic);await b.run('brazaMonthDashboard.start({api})');const before=b.run('calls.length');b.run('customApi=async(path)=>path.startsWith("finance/cost-diagnostics?")?JSON.parse(diagnostic):JSON.parse(JSON.stringify(currentFrame));');assert.equal(await b.run('control("CostRecover").onclick()'),true);assert.equal(b.run('calls.slice('+before+').filter(call=>call.path.startsWith("finance/cost-recovery?")).length'),0);assert.match(b.text('CostDiagnosticBody'),/conflitantes.*composição ambígua/);
});

test('malformed or failed diagnostic responses preserve the prior safe report and stopped work cannot replace it',async()=>{
 const source=partialCostProductFixture(),diagnostic=costDiagnosticFixture(source),b=browser(source);b.context.diagnostic=JSON.stringify(diagnostic);await b.run('brazaMonthDashboard.start({api})');b.run('customApi=async()=>JSON.parse(diagnostic);');await b.run('control("CostCheck").onclick()');const old=b.text('CostDiagnosticBody');b.run('customApi=async()=>({...JSON.parse(diagnostic),access_token:"PRIVATE"});');assert.equal(await b.run('control("CostCheck").onclick()'),false);assert.equal(b.text('CostDiagnosticBody'),old);assert.doesNotMatch(b.text('CostDiagnosticStatus'),/PRIVATE/);
 b.run('customApi=(path)=>path.startsWith("finance/cost-diagnostics?")?new Promise(resolve=>globalThis.finishDiagnostic=resolve):JSON.parse(JSON.stringify(currentFrame));globalThis.lateDiagnostic=control("CostCheck").onclick();');await b.settle();b.run('brazaMonthDashboard.stop();finishDiagnostic(JSON.parse(diagnostic));');await b.run('lateDiagnostic');assert.equal(b.text('CostDiagnosticBody'),old);assert.equal(b.run('control("CostRecover").disabled'),true);
});

test('a pending cost diagnostic is discarded when the owner selects a different month',async()=>{
 const source=partialCostProductFixture(),diagnostic=costDiagnosticFixture(source),b=browser(source);b.context.diagnostic=JSON.stringify(diagnostic);await b.run('brazaMonthDashboard.start({api})');b.run('customApi=(path)=>path.startsWith("finance/cost-diagnostics?")?new Promise(resolve=>globalThis.finishDiagnostic=resolve):JSON.parse(JSON.stringify(currentFrame));globalThis.oldDiagnostic=control("CostCheck").onclick();');await b.settle();
 b.load(fixture({...source,month:'2026-09',start_date:'2026-09-01',end_date:'2026-09-30',ads:calendar('2026-09',30)}));b.run('control("Select").value="2026-09";');assert.equal(await b.run('control("Select").onchange()'),true);b.run('finishDiagnostic(JSON.parse(diagnostic));');assert.equal(await b.run('oldDiagnostic'),false);assert.equal(b.run('control("CostDiagnosticBody").hidden'),true);assert.equal(b.run('control("CostCopy").disabled'),true);assert.match(b.text('Scope'),/01\/09\/2026 a 30\/09\/2026/);assert.doesNotMatch(b.text('CostDiagnosticStatus'),/Camiseta infantil|concluída/);
});

test('the cost recovery loop also stops at two minutes and retains visible truncation and source versions',async()=>{
 const source=partialCostProductFixture(),diagnostic=costDiagnosticFixture(source,{truncation:{truncated:true,products_total:8,products_included:1,variants_total:13,variants_included:1,reason:'BYTE_LIMIT',text_truncated:false}}),b=browser(source);b.context.diagnostic=JSON.stringify(diagnostic);await b.run('brazaMonthDashboard.start({api})');const before=b.run('calls.length');b.run('customApi=async(path)=>{if(path.startsWith("finance/cost-diagnostics?"))return JSON.parse(diagnostic);if(path.startsWith("finance/cost-recovery?")){clock+=60000;return {schema:"business_cost_recovery_v1",month:"2026-10",diagnostic:JSON.parse(diagnostic),work:{status:"PROGRESSED",processed:["200"],failed:[]}};}return JSON.parse(JSON.stringify(currentFrame));};');
 assert.equal(await b.run('control("CostRecover").onclick()'),true);assert.equal(b.run('calls.slice('+before+').filter(call=>call.path.startsWith("finance/cost-recovery?")).length'),2);assert.match(b.text('CostDiagnosticStatus'),/atingiu o limite/);assert.match(b.text('CostDiagnosticBody'),/Diagnóstico parcial: 1 de 8 produto.*1 de 13 variação/);assert.match(b.text('CostDiagnosticBody'),/referências atuais: custos v3.*vínculos v2/);
});

test('a durable checkpoint observes saved progress and resumes only step after its delay',async()=>{
 const waiting=collectionFixture('RETRY_WAIT','BUSINESS_PERIOD_CHECKPOINT',3),ready=collectionFixture(),done=fixture({collection:{schema:'business_month_collection_v1',state:'READY',code:null,retry_after_seconds:0}}),b=browser(waiting);
 b.context.ready=JSON.stringify(ready);b.context.done=JSON.stringify(done);
 b.run("Math.random=()=>0;customApi=async(path,body)=>JSON.parse(!body?ready:['step','ads'].includes(body.operation)?done:JSON.stringify(currentFrame));");
 assert.equal(await b.run('startManual({api,syncVariants})'),true);
 assert.deepEqual(operations(b),['view','start']);assert.equal(b.text('Badge'),'Aguardando retomada automática');assert.match(b.text('Status'),/preservados/);assert.equal(b.run("control('Pause').hidden"),false);
 assert.equal(b.run('[...timers.values()][0].delay'),3000);
 await recoveryTick(b);
 assert.deepEqual(operations(b),['view','start','observe','step','ads']);assert.match(b.text('Net'),/43,00/);assert.doesNotMatch(b.text('Status'),/Diagnóstico da coleta/);
});

test('an ambiguous step timeout preserves partial amounts and observes before any retry without replaying start or expenses',async()=>{
 const running=collectionFixture(),done=fixture({collection:{schema:'business_month_collection_v1',state:'READY',code:null,retry_after_seconds:0}}),b=browser(running);
 b.context.done=JSON.stringify(done);
 b.run("Math.random=()=>0;let stepFailures=0;customApi=async(path,body)=>{if(body?.operation==='step'&&stepFailures++===0)throw Object.assign(Error('Private provider URL must stay private'),{code:'ADMIN_API_TIMEOUT',status:null});return JSON.parse(body&&['step','ads'].includes(body.operation)?done:JSON.stringify(currentFrame));};");
 assert.equal(await b.run('startManual({api,syncVariants})'),false);
 assert.deepEqual(operations(b),['view','start','step']);assert.match(b.text('SalesHelp'),/100,00/);assert.equal(b.text('Net'),'Em apuração');assert.equal(b.text('Badge'),'Aguardando retomada automática');assert.doesNotMatch(b.text('Status'),/Private provider/);
 await recoveryTick(b);
 assert.deepEqual(operations(b),['view','start','step','observe','step','ads']);assert.match(b.text('Net'),/43,00/);assert.equal(operations(b).filter(op=>op==='start').length,1);assert.ok(!operations(b).includes('expenses'));
});

test('an observed completion after a timeout does not replay start, step or Ads',async()=>{
 const running=collectionFixture(),done=fixture({collection:{schema:'business_month_collection_v1',state:'READY',code:null,retry_after_seconds:0}}),b=browser(running);b.context.done=JSON.stringify(done);
 b.run("customApi=async(path,body)=>{if(!body)return JSON.parse(done);if(body.operation==='step')throw Object.assign(Error('Timeout'),{code:'ADMIN_API_TIMEOUT',status:null});return JSON.parse(JSON.stringify(currentFrame));};");
 await b.run('startManual({api,syncVariants})');await recoveryTick(b);
 assert.deepEqual(operations(b),['view','start','step','observe']);assert.match(b.text('Net'),/43,00/);assert.equal(b.text('Badge'),'Previsão completa');assert.match(b.text('Status'),/financeira foi concluída/);
});

test('an observed financial completion makes one first Ads read when none was submitted before the interrupted finance request',async()=>{
 const source=fixture(),done=fixture({...source,ads:null,result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['ADS_UNAVAILABLE']},collection:{schema:'business_month_collection_v1',state:'READY',code:null,retry_after_seconds:0}}),priced=fixture({collection:done.collection}),b=browser(collectionFixture());b.context.done=JSON.stringify(done);b.context.priced=JSON.stringify(priced);
 b.run("customApi=async(path,body)=>{if(!body)return JSON.parse(done);if(body.operation==='step')throw Object.assign(Error('Timeout'),{code:'ADMIN_API_TIMEOUT'});if(body.operation==='ads')return JSON.parse(priced);return JSON.parse(JSON.stringify(currentFrame));};");
 await b.run('startManual({api,syncVariants})');await recoveryTick(b);
 assert.deepEqual(operations(b),['view','start','step','observe','ads']);assert.equal(operations(b).filter(op=>op==='ads').length,1);assert.equal(b.run('timers.size'),1);assert.match(b.text('Ads'),/10,00/);assert.match(b.text('Net'),/43,00/);assert.match(b.text('Status'),/Dados do mês atualizados/);
});

test('failure of the first Ads read after observed finance completion waits before retrying only the read-only Ads source',async()=>{
 const source=fixture(),done=fixture({...source,ads:null,result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['ADS_UNAVAILABLE']},collection:{schema:'business_month_collection_v1',state:'READY',code:null,retry_after_seconds:0}}),b=browser(collectionFixture());b.context.done=JSON.stringify(done);
 b.run("customApi=async(path,body)=>{if(!body)return JSON.parse(done);if(['step','ads'].includes(body.operation))throw Object.assign(Error('Private upstream payload'),{code:'ADMIN_API_TIMEOUT'});return JSON.parse(JSON.stringify(currentFrame));};");
 await b.run('startManual({api,syncVariants})');assert.equal(await recoveryTick(b),false);
 assert.deepEqual(operations(b),['view','start','step','observe','ads']);assert.equal(b.run('timers.size'),1);assert.equal(b.run('[...timers.values()][0].delay'),60000);assert.equal(b.text('Net'),'Em conciliação');assert.match(b.text('Status'),/Não foi possível atualizar os anúncios/);assert.doesNotMatch(b.text('Status'),/Private upstream/);
 b.run('document.hidden=true;document.handlers.visibilitychange();document.hidden=false;document.handlers.visibilitychange();');assert.equal(b.run('timers.size'),1);assert.equal(operations(b).filter(op=>op==='ads').length,1);assert.ok(!operations(b).includes('expenses'));
});

test('an explicit start timeout preserves partial data and observes the durable job without fabricating totals or replaying start',async()=>{
 const ready=collectionFixture(),done=fixture({collection:{schema:'business_month_collection_v1',state:'READY',code:null,retry_after_seconds:0}}),b=browser(ready);b.context.ready=JSON.stringify(ready);b.context.done=JSON.stringify(done);
 b.run("customApi=async(path,body)=>{if(!body)return JSON.parse(ready);if(body.operation==='read')throw Object.assign(Error('No saved frame'),{code:'ADMIN_API_HTTP_ERROR',status:409});if(body.operation==='start')throw Object.assign(Error('Start timed out'),{code:'ADMIN_API_TIMEOUT'});return JSON.parse(done);};");
 assert.equal(await b.run('startManual({api,syncVariants})'),false);
 assert.deepEqual(operations(b),['view','start']);assert.equal(b.text('Sales'),'Pendente');assert.match(b.text('Ads'),/10,00/);assert.equal(b.text('Net'),'Em apuração');assert.equal(b.text('Badge'),'Aguardando retomada automática');assert.doesNotMatch(b.text('SalesHelp'),/R\$\s*0,00/);
 await recoveryTick(b);assert.deepEqual(operations(b),['view','start','observe','step','ads']);assert.match(b.text('Net'),/43,00/);assert.equal(operations(b).filter(op=>op==='start').length,1);
});

test('an interrupted Ads read waits for a bounded retry without replaying the financial import',async()=>{
 const b=browser(fixture({collection:{schema:'business_month_collection_v1',state:'READY',code:null,retry_after_seconds:0}}));
 b.run("customApi=async(path,body)=>{if(body.operation==='ads')throw Object.assign(Error('Ads timed out'),{code:'ADMIN_API_TIMEOUT'});return JSON.parse(JSON.stringify(currentFrame));};");
 assert.equal(await b.run('startManual({api,syncVariants})'),false);assert.deepEqual(operations(b),['view','start','ads']);assert.equal(b.run('timers.size'),1);assert.equal(b.run('[...timers.values()][0].delay'),60000);
 b.run('document.hidden=true;document.handlers.visibilitychange();document.hidden=false;document.handlers.visibilitychange();');assert.deepEqual(operations(b),['view','start','ads']);assert.equal(b.run('timers.size'),1);assert.equal(b.run('[...timers.values()][0].delay'),60000);
});

test('eight retries without progress suspend step requests while GET observes cron progress and resumes automatically',async()=>{
 const waiting=collectionFixture('RETRY_WAIT','BUSINESS_PERIOD_CHECKPOINT',1),ready=collectionFixture(),progress=collectionFixture('READY',null,0,{progress:{windows_total:2,windows_complete:1,pages_read:2}}),done=fixture({collection:{schema:'business_month_collection_v1',state:'READY',code:null,retry_after_seconds:0}}),b=browser(waiting);
 b.context.ready=JSON.stringify(ready);b.context.progress=JSON.stringify(progress);b.context.done=JSON.stringify(done);
 b.run("Math.random=()=>0;let externalProgress=false;customApi=async(path,body)=>JSON.parse(!body?(externalProgress?progress:ready):body.operation==='step'&&externalProgress?done:body.operation==='ads'?done:JSON.stringify(currentFrame));");
 await b.run('startManual({api,syncVariants})');
 for(let index=0;index<8;index++)await recoveryTick(b);
 assert.equal(operations(b).filter(op=>op==='step').length,8);assert.equal(b.run('[...timers.values()][0].delay'),60000);assert.match(b.text('Status'),/aguardando avanço/);
 for(let index=0;index<3;index++)await recoveryTick(b);
 assert.equal(operations(b).filter(op=>op==='step').length,8,'observing unchanged data cannot reset the request budget');
 b.run('externalProgress=true;');await recoveryTick(b);
 assert.equal(operations(b).filter(op=>op==='step').length,9);assert.match(b.text('Net'),/43,00/);assert.equal(operations(b).filter(op=>op==='start').length,1);
});

test('lower job counters cannot release another retry budget by returning to the already observed high-water marks',async()=>{
 const waiting=collectionFixture('RETRY_WAIT','BUSINESS_PERIOD_CHECKPOINT',1,{progress:{windows_total:2,windows_complete:1,pages_read:2}}),lower=collectionFixture(),b=browser(waiting);b.context.lower=JSON.stringify(lower);
 b.run("Math.random=()=>0;let lowerObservation=false;customApi=async(path,body)=>JSON.parse(!body&&lowerObservation?lower:JSON.stringify(currentFrame));");
 await b.run('startManual({api,syncVariants})');for(let index=0;index<8;index++)await recoveryTick(b);
 assert.equal(operations(b).filter(op=>op==='step').length,8);
 b.run('lowerObservation=true;');await recoveryTick(b);b.run('lowerObservation=false;');await recoveryTick(b);
 assert.equal(operations(b).filter(op=>op==='step').length,8);assert.equal(b.run('[...timers.values()][0].delay'),60000);
});

test('fixed provider backoff is not restarted by unchanged GET observations and each wait is bounded to sixty seconds',async()=>{
 const waiting=collectionFixture('RETRY_WAIT','BUSINESS_PERIOD_RATE_LIMIT',1800),done=fixture({collection:{schema:'business_month_collection_v1',state:'READY',code:null,retry_after_seconds:0}}),b=browser(waiting);b.context.done=JSON.stringify(done);
 b.run("Math.random=()=>0;customApi=async(path,body)=>JSON.parse(body&&['step','ads'].includes(body.operation)?done:JSON.stringify(currentFrame));");
 await b.run('startManual({api,syncVariants})');
 for(let index=0;index<29;index++){assert.equal(b.run('[...timers.values()][0].delay'),60000);await recoveryTick(b);}
 assert.equal(operations(b).filter(op=>op==='step').length,0);await recoveryTick(b);
 assert.equal(operations(b).filter(op=>op==='step').length,1);assert.match(b.text('Net'),/43,00/);
});

test('authorization and invalid-source collection blocks keep partial values and never create automatic source requests',async()=>{
 for(const code of ['BUSINESS_PERIOD_AUTH_REQUIRED','BUSINESS_PERIOD_INVALID_SOURCE','BUSINESS_PERIOD_PERMISSION_DENIED']){
  const b=browser(collectionFixture('BLOCKED',code));await b.run('startManual({api,syncVariants})');
  assert.deepEqual(operations(b),['view','start']);assert.equal(b.run('timers.size'),0);assert.equal(b.text('Badge'),'Consulta requer atenção');assert.equal(b.text('Net'),'Em apuração');assert.match(b.text('SalesHelp'),/100,00/);assert.match(b.text('Status'),/preservados/);
  b.run('document.hidden=true;document.handlers.visibilitychange();document.hidden=false;document.handlers.visibilitychange();');assert.equal(b.run('timers.size'),0);
 }
});

test('recovery pauses for visibility, explicit pause and expense drafts without sending an expense write',async()=>{
 const waiting=collectionFixture('RETRY_WAIT','BUSINESS_PERIOD_CONFLICT',1),b=browser(waiting);await b.run('startManual({api,syncVariants})');
 b.run('document.hidden=true;document.handlers.visibilitychange();clock+=10000;');assert.equal(b.run('timers.size'),0);
 b.run('document.hidden=false;document.handlers.visibilitychange();');assert.equal(b.run('timers.size'),1);
 b.run("control('Pause').onclick();");assert.equal(b.run('timers.size'),0);assert.equal(b.text('Badge'),'Consulta pausada');
 await b.run('brazaMonthDashboard.refresh()');
 b.run("control('ExpensesValue').value='7.00';control('ExpensesValue').oninput();");assert.equal(b.run('timers.size'),0);assert.equal(b.run("control('ExpensesValue').value"),'7.00');
 b.run("control('ExpensesReload').onclick();");assert.equal(b.run('timers.size'),1);assert.ok(!operations(b).includes('observe'));assert.ok(!operations(b).includes('expenses'));
 b.run('brazaMonthDashboard.stop();document.hidden=true;document.handlers.visibilitychange();document.hidden=false;document.handlers.visibilitychange();');assert.equal(b.run('timers.size'),0);
});

test('a hidden or stopped page ignores a pending observation before it could advance a source step',async()=>{
 for(const action of ['document.hidden=true;document.handlers.visibilitychange();','brazaMonthDashboard.stop();']){
  const waiting=collectionFixture('RETRY_WAIT','BUSINESS_PERIOD_CONFLICT',1),ready=collectionFixture(),b=browser(waiting);b.context.ready=JSON.stringify(ready);
  b.run("let releaseObserve;customApi=async(path,body)=>body?JSON.parse(JSON.stringify(currentFrame)):new Promise(resolve=>releaseObserve=resolve);");
  await b.run('startManual({api,syncVariants})');const observing=recoveryTick(b);await b.settle();
  b.run(action+'releaseObserve(JSON.parse(ready));');await observing;
  assert.deepEqual(operations(b),['view','start','observe']);assert.equal(b.run('timers.size'),0);
 }
});

test('transient observation failures back off but an owner authorization failure ends recovery',async()=>{
 const b=browser(collectionFixture('RETRY_WAIT','BUSINESS_PERIOD_TIMEOUT',1));
 b.run("let observations=0;customApi=async(path,body)=>{if(!body)throw Object.assign(Error('Private response'),observations++===0?{code:'ADMIN_API_TIMEOUT',status:200}:{code:'ADMIN_API_TIMEOUT',status:401});return JSON.parse(JSON.stringify(currentFrame));};");
 await b.run('startManual({api,syncVariants})');await recoveryTick(b);
 assert.equal(b.run('timers.size'),1);assert.match(b.text('Status'),/consulta está temporariamente indisponível/);assert.doesNotMatch(b.text('Status'),/Private response/);
 await recoveryTick(b);assert.equal(b.run('timers.size'),0);assert.deepEqual(operations(b),['view','start','observe','observe']);assert.match(b.text('Status'),/confira a conexão financeira/);
});

test('monthly body has one clear card per business metric and responsive scoped markup',()=>{
 const body=businessMonthBody(),ids=[...body.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(new Set(ids).size,ids.length);assert.ok(ids.every(id=>id.startsWith('businessMonth')||id.startsWith('businessReconciliation')||id.startsWith('businessEscrowReleases')));
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
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(operationCalls())')),['view']);
});

test('a validated saved month paints before the private import responds and remains visible while its steps run',async()=>{
 const source=fixture({source_checked_at:{finance_oldest_at:stamp-90,finance_latest_at:stamp-30,ads_at:stamp}}),b=browser(source);
 const running=fixture({...source,status:'RUNNING',progress:{...source.progress,windows_complete:1},sales_cents:null,expected_repass_cents:null,production_cost_cents:null,invoice_tax_cents:null,ads_adjustment_cents:null,result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['COLLECTING','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADJUSTMENT_UNAVAILABLE']}});
 b.run("let releaseStart,releaseStep;customApi=async(path,body)=>body.operation==='start'?new Promise(resolve=>releaseStart=resolve):body.operation==='step'?new Promise(resolve=>releaseStep=resolve):JSON.parse(JSON.stringify(currentFrame));");
 await b.run('brazaMonthDashboard.start({api,syncVariants})');assert.deepEqual(operations(b),['view']);
 const starting=b.run("control('SourceRefresh').onclick()");await b.settle();
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(operationCalls())')),['view','start']);
 assert.match(b.text('Sales'),/100,00/);assert.match(b.text('Net'),/43,00/);assert.match(b.text('Status'),/última leitura salva.*Atualizando/);
 assert.match(b.text('Scope'),/financeiro: leitura mais antiga .*08:58:30; mais recente .*08:59:30/);assert.match(b.text('Scope'),/Idade do financeiro: há 1 minuto\(s\).*idade dos anúncios: há menos de 1 minuto/);
 b.context.running=JSON.stringify(running);b.run('releaseStart(JSON.parse(running));');await b.settle();
 assert.equal(b.run('calls.at(-1).body?.operation'),'step');assert.match(b.text('Net'),/43,00/);assert.match(b.text('Sales'),/100,00/);assert.match(b.text('Status'),/última leitura salva.*Conferindo os pedidos/);
 b.run('releaseStep(JSON.parse(JSON.stringify(currentFrame)));');assert.equal(await starting,true);assert.equal(b.run('timers.size'),1);
});

test('a changed month paints its saved data while a late private response from the previous month is ignored',async()=>{
 const source=fixture(),b=browser(source);
 b.run("const releaseImports=new Map();customApi=async(path,body)=>body.operation==='start'?new Promise(resolve=>releaseImports.set(body.month,resolve)):JSON.parse(JSON.stringify(currentFrame));");
 const old=b.run('startManual({api,syncVariants})');await b.settle();
 const past=fixture({...source,month:'2026-09',start_date:'2026-09-01',end_date:'2026-09-30',ads:calendar('2026-09',30)});b.load(past);
 b.run("control('Select').value='2026-09';");const selected=b.run("control('Select').onchange()");await b.settle();
 assert.match(b.text('Scope'),/01\/09\/2026 a 30\/09\/2026/);assert.match(b.text('Net'),/43,00/);assert.match(b.text('Status'),/salvos/);
 assert.equal(await selected,true);assert.equal(b.run("releaseImports.has('2026-09')"),false);
 b.context.old=JSON.stringify(source);b.run("releaseImports.get('2026-10')(JSON.parse(old));");assert.equal(await old,false);
 assert.match(b.text('Scope'),/01\/09\/2026 a 30\/09\/2026/);assert.doesNotMatch(b.text('Scope'),/01\/10\/2026/);
});

test('an unavailable saved view does not start a financial import and can be retried through a local read',async()=>{
 const b=browser();b.run("customViewApi=async()=>{throw Object.assign(Error('PRIVATE_STORAGE_RESPONSE'),{status:503});};");
 assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),false);assert.deepEqual(operations(b),['view']);assert.equal(b.text('Net'),'Em apuração');assert.doesNotMatch(b.text('Status'),/PRIVATE/);
 b.run('customViewApi=null;');assert.equal(await b.run('brazaMonthDashboard.refresh()'),true);assert.deepEqual(operations(b),['view','view']);assert.match(b.text('Net'),/43,00/);assert.equal(b.run('timers.size'),1);
});

test('a stale saved financial source shows a clearly provisional balance while the strict net awaits a delayed refresh',async()=>{
 const source=fixture(),stale=fixture({...source,source_checked_at:{finance_oldest_at:stamp-1200,finance_latest_at:stamp-30,ads_at:stamp},result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['FINANCIAL_SOURCE_STALE']}}),b=browser(stale);
 b.run("let releaseStart;customApi=async(path,body)=>body.operation==='start'?new Promise(resolve=>releaseStart=resolve):JSON.parse(JSON.stringify(currentFrame));");
 const starting=b.run('startManual({api,syncVariants})');await b.settle();
 assert.match(b.text('Net'),/43,00/);assert.equal(b.text('NetLabel'),'Resultado líquido previsto · em conferência');assert.match(b.text('NetHelp'),/última leitura|provisório|atualiza/i);assert.equal(b.run('currentFrame.result.net_estimate_cents'),null);assert.equal(b.text('CheckpointStatus'),'Previsão com pendências');assert.match(b.text('PendingList'),/nova leitura/);assert.match(b.text('Scope'),/Idade do financeiro: há 20 minuto\(s\)/);
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
 assert.equal(b.run("calls.filter(call=>call.body?.operation==='expenses').length"),1);
 assert.equal(b.run("calls.find(call=>call.body?.operation==='expenses').body.external_expenses_cents"),0);
 assert.equal(b.run("calls.find(call=>call.body?.operation==='expenses').body.revision"),0);assert.match(b.text('Net'),/48,00/);
});

test('cost-only refresh is read-only, preserves expense drafts and requires review on a changed saved revision',async()=>{
 const b=browser();await b.run('brazaMonthDashboard.start({api,syncVariants})');
 b.run("control('ExpensesValue').value='12,34';control('ExpensesValue').oninput();");
 const source=fixture(),changed=fixture({...source,expenses:{...source.expenses,revision:2,external_expenses_cents:700},result:{...source.result,net_estimate_cents:4100,net_margin_bps:4100}});b.load(changed);
 await b.run('brazaMonthDashboard.refreshCosts()');
 assert.equal(b.run("control('ExpensesValue').value"),'12,34');assert.equal(b.run("operationCalls().at(-1)"),'view');assert.equal(b.run("control('ExpensesSave').disabled"),true);assert.match(b.text('ExpenseState'),/alteradas em outra sessão/);
 b.run("control('ExpensesReload').onclick();");assert.equal(b.run("control('ExpensesValue').value"),'7.00');assert.equal(b.run("control('ExpensesSave').disabled"),false);
});

test('outdated local views never overwrite the selected month or restore old metrics',async()=>{
 const b=browser();b.run("let releaseOld;customViewApi=async path=>new URLSearchParams(path.split('?')[1]).get('month')==='2026-10'?new Promise(resolve=>releaseOld=resolve):savedView(currentFrame);");
 const old=b.run('brazaMonthDashboard.start({api,syncVariants})');await b.settle();
 const source=fixture(),past=fixture({...source,month:'2026-09',start_date:'2026-09-01',end_date:'2026-09-30',ads:calendar('2026-09',30)});b.load(past);
 b.run("control('Select').value='2026-09';");assert.equal(await b.run("control('Select').onchange()"),true);
 b.context.stale=JSON.stringify(source);b.run('releaseOld(savedView(JSON.parse(stale)));');assert.equal(await old,false);
 assert.equal(b.run("control('Select').value"),'2026-09');assert.match(b.text('Scope'),/01\/09\/2026 a 30\/09\/2026/);assert.doesNotMatch(b.text('Scope'),/01\/10\/2026 a 22\/10\/2026/);assert.deepEqual(operations(b),['view','view']);
});

test('a paused workspace observes saved values with one timer and never refreshes Ads or finance on its own',async()=>{
 const b=browser();await b.run('brazaMonthDashboard.start({api,syncVariants})');assert.equal(b.run('timers.size'),1);
 await recoveryTick(b);assert.deepEqual(operations(b),['view','view']);
 b.run("document.hidden=true;document.handlers.visibilitychange();");assert.equal(b.run('timers.size'),0);
 b.run("document.hidden=false;document.handlers.visibilitychange();control('ExpensesValue').value='7.00';control('ExpensesValue').oninput();");assert.equal(b.run('timers.size'),0);assert.equal(b.run("control('ExpensesValue').value"),'7.00');b.run("control('ExpensesReload').onclick();");assert.equal(b.run('timers.size'),1);await recoveryTick(b);assert.deepEqual(operations(b),['view','view','view']);assert.equal(b.run('calls.some(call=>call.body?.operation)'),false);
});

test('local observation displays newly saved sales and later cancellations without importing either source in the browser',async()=>{
 const b=browser(),source=fixture();await b.run('brazaMonthDashboard.start({api,syncVariants})');
 const added=fixture({...source,coverage:{...source.coverage,orders:5,paid:3,ongoing:2,payment_covered:3},sales_cents:15000,known_sales_cents:15000,expected_repass_cents:12000,known_expected_repass_cents:12000,production_cost_cents:3000,known_production_cost_cents:3000,invoice_tax_cents:300,known_invoice_tax_cents:300,result:{...source.result,net_estimate_cents:7200,net_margin_bps:4800}});b.load(added);await recoveryTick(b);
 assert.deepEqual(operations(b),['view','view']);assert.match(b.text('Sales'),/150,00/);assert.match(b.text('Coverage'),/3 pedido\(s\) pagos/);assert.match(b.text('Net'),/72,00/);assert.equal(b.run('timers.size'),1);
 const cancelled=fixture({...source,coverage:{...source.coverage,orders:5,cancelled:2}});b.load(cancelled);await recoveryTick(b);
 assert.deepEqual(operations(b),['view','view','view']);assert.match(b.text('Coverage'),/2 cancelado\(s\) excluído\(s\)/);assert.match(b.text('Sales'),/100,00/);assert.match(b.text('Net'),/43,00/);assert.equal(b.run('timers.size'),1);
});

test('a visible local observation coalesces overlap and preserves expense edits made while its response is pending',async()=>{
 const b=browser();await b.run('brazaMonthDashboard.start({api,syncVariants})');b.run('document.hidden=true;document.handlers.visibilitychange();clock+=600000;');assert.equal(b.run('timers.size'),0);
 b.run('document.hidden=false;document.handlers.visibilitychange();');assert.equal(b.run('timers.size'),1);b.run("let completeView;customViewApi=async()=>new Promise(resolve=>completeView=resolve);");
 const observed=recoveryTick(b);await b.settle();assert.equal(b.run('timers.size'),0);assert.equal(b.run('calls.length'),2);
 b.run("document.handlers.visibilitychange();control('ExpensesValue').value='12,34';control('ExpensesValue').oninput();");assert.equal(b.run('calls.length'),2);
 b.run('completeView(savedView(currentFrame));');assert.equal(await observed,true);assert.equal(b.run("control('ExpensesValue').value"),'12,34');assert.match(b.text('ExpenseState'),/edição de despesas ainda não salva/);assert.deepEqual(operations(b),['view','view']);assert.equal(b.run('timers.size'),1);
 b.run("control('ExpensesReload').onclick();");assert.equal(b.run('timers.size'),1);
});

test('failed local observation retains the verified summary and cannot create source requests on visibility changes or after stop',async()=>{
 const b=browser();await b.run('brazaMonthDashboard.start({api,syncVariants})');b.run("customViewApi=async()=>{throw Error('PRIVATE_STORAGE_RESPONSE');};");
 assert.equal(await recoveryTick(b),false);assert.deepEqual(operations(b),['view','view']);assert.match(b.text('Sales'),/100,00/);assert.doesNotMatch(b.text('Status'),/PRIVATE/);assert.equal(b.run('timers.size'),1);assert.ok(b.run('[...timers.values()][0].delay')>=15000);
 b.run('document.hidden=true;document.handlers.visibilitychange();clock+=600000;document.hidden=false;document.handlers.visibilitychange();');assert.equal(b.run('timers.size'),1);assert.equal(b.run('calls.length'),2);
 b.run('customViewApi=null;');assert.equal(await b.run('brazaMonthDashboard.refresh()'),true);assert.deepEqual(operations(b),['view','view','view']);
 b.run('brazaMonthDashboard.stop();document.hidden=true;document.handlers.visibilitychange();document.hidden=false;document.handlers.visibilitychange();');assert.equal(b.run('timers.size'),0);
});

test('an explicitly requested manual import suspends while hidden and resumes the saved job without a new start',async()=>{
 const running=collectionFixture(),source=fixture({collection:{schema:'business_month_collection_v1',state:'READY',code:null,retry_after_seconds:0}}),b=browser(running);b.context.partial=JSON.stringify(running);b.context.completed=JSON.stringify(source);
 b.run("let releaseStart;customApi=async()=>new Promise(resolve=>releaseStart=resolve);");const starting=b.run('startManual({api,syncVariants})');await b.settle();
 b.run('document.hidden=true;document.handlers.visibilitychange();releaseStart(JSON.parse(partial));');await starting;
 assert.equal(b.run('calls.length'),2);assert.equal(b.run('timers.size'),0);assert.equal(operations(b).filter(operation=>operation==='ads').length,0);
 b.run("customApi=async(path,body)=>JSON.parse(body&&['step','ads'].includes(body.operation)?completed:partial);document.hidden=false;document.handlers.visibilitychange();");assert.equal(b.run('timers.size'),1);await recoveryTick(b);
 assert.deepEqual(operations(b),['view','start','observe','step','ads']);assert.match(b.text('Net'),/43,00/);assert.equal(b.run('timers.size'),1);
});

test('an explicit pause waits for the current response and does not start Ads until manually resumed',async()=>{
 const b=browser(collectionFixture());b.run("let releaseStart;customApi=async()=>new Promise(resolve=>releaseStart=resolve);");
 const starting=b.run('startManual({api,syncVariants})');await b.settle();b.run("control('Pause').onclick();releaseStart(JSON.parse(JSON.stringify(currentFrame)));");await starting;
 assert.equal(b.run('calls.length'),2);assert.equal(b.run('timers.size'),0);assert.match(b.text('Status'),/Consulta pausada/);
 b.load(fixture());b.run('customApi=null;');await b.run('brazaMonthDashboard.refresh()');
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(operationCalls())')),['view','start','start','ads']);assert.equal(b.run('timers.size'),1);
});

test('an explicitly requested source failure preserves the last complete summary and returns to local observation',async()=>{
 const b=browser();b.run("customApi=async()=>{throw Error('A conexão financeira ainda não está disponível.');};");
 assert.equal(await b.run('startManual({api,syncVariants})'),false);assert.deepEqual(operations(b),['view','start']);assert.match(b.text('Net'),/43,00/);assert.equal(b.run("control('Refresh').disabled"),false);assert.match(b.text('Status'),/conexão financeira/);assert.equal(b.run('timers.size'),1);
 await recoveryTick(b);assert.deepEqual(operations(b),['view','start','view']);assert.match(b.text('Net'),/43,00/);
});

test('a failed partial import shows an interrupted badge and a bounded copyable diagnostic until a manual continuation succeeds',async()=>{
 const source=fixture(),running=fixture({...source,status:'RUNNING',progress:{...source.progress,windows_complete:1},sales_cents:null,expected_repass_cents:null,production_cost_cents:null,invoice_tax_cents:null,ads_adjustment_cents:null,result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['COLLECTING','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADJUSTMENT_UNAVAILABLE']}}),b=browser(running);
 b.run("customApi=async(path,body)=>{if(body.operation==='step')throw Object.assign(Error('A leitura financeira foi interrompida.'),{code:'ADMIN_API_HTTP_ERROR',apiCode:'BUSINESS_MONTH_SOURCE_HTTP_503',status:503,url:'https://private.invalid/?token=PRIVATE_TOKEN',payload:{access_token:'PRIVATE_TOKEN'}});return JSON.parse(JSON.stringify(currentFrame));};");
 assert.equal(await b.run('startManual({api,syncVariants})'),false);assert.equal(b.text('Badge'),'Consulta interrompida');assert.equal(b.text('Refresh'),'Continuar consulta');assert.equal(b.run("control('Refresh').disabled"),false);assert.match(b.text('Coverage'),/2 pedido\(s\) pagos/);assert.match(b.text('SalesHelp'),/100,00/);
 const diagnostic=b.run("control('Status').children.find(row=>row.className==='month-detail-help').children.find(row=>row.tag==='code').textContent");
 assert.deepEqual(JSON.parse(diagnostic),{client_contract:'business-month-v2',operation:'step',code:'ADMIN_API_HTTP_ERROR',api_code:'BUSINESS_MONTH_SOURCE_HTTP_503',http:503});assert.ok(!b.text('Status').includes('PRIVATE_TOKEN'));assert.ok(!b.text('Status').includes('private.invalid'));assert.equal(b.run("control('Status').children.filter(row=>row.className==='month-detail-help').length"),1);
 assert.equal(b.run('calls.length'),3);assert.equal(b.run('timers.size'),0,'a partial POST failure must not be replayed automatically');
 b.load(source);b.run('customApi=null;');assert.equal(await b.run("control('Refresh').onclick()"),true);assert.equal(b.text('Badge'),'Previsão completa');assert.doesNotMatch(b.text('Status'),/Diagnóstico da coleta/);assert.match(b.text('Net'),/43,00/);
});

test('a failed local recalculation preserves verified amounts and a successful retry clears the local error',async()=>{
 const b=browser();await b.run('brazaMonthDashboard.start({api,syncVariants})');b.run("customViewApi=async()=>{throw Object.assign(Error('PRIVATE_STORAGE_RESPONSE'),{code:'ADMIN_API_NETWORK_ERROR'});};");
 assert.equal(await b.run('brazaMonthDashboard.refreshCosts()'),false);assert.match(b.text('Net'),/43,00/);assert.doesNotMatch(b.text('Status'),/PRIVATE/);b.run('customViewApi=null;');assert.equal(await b.run('brazaMonthDashboard.refreshCosts()'),true);assert.doesNotMatch(b.text('Status'),/Diagnóstico da coleta|ADMIN_API_NETWORK_ERROR/);assert.deepEqual(operations(b),['view','view','view']);
});

test('collection diagnostics ignore arbitrary payloads, unsafe codes and accessor fields',async()=>{
 const b=browser();assert.equal(b.run('brazaMonthDashboard.clientContract'),'business-month-v2');b.run("brazaMonthDashboard.clientContract='PRIVATE_TOKEN';let diagnosticAccessors=0;customApi=async()=>{const failure=Error('Não foi possível concluir a leitura.');failure.url='https://private.invalid/PRIVATE_TOKEN';failure.payload={token:'PRIVATE_TOKEN'};Object.defineProperty(failure,'client_contract',{get(){diagnosticAccessors++;return 'PRIVATE_TOKEN';}});failure.code='PRIVATE_TOKEN <html>';Object.defineProperty(failure,'apiCode',{get(){diagnosticAccessors++;return 'BUSINESS_MONTH_PRIVATE';}});Object.defineProperty(failure,'status',{get(){diagnosticAccessors++;return 503;}});throw failure;};");
 assert.equal(await b.run('startManual({api,syncVariants})'),false);assert.equal(b.run('diagnosticAccessors'),0);assert.doesNotMatch(b.text('Status'),/PRIVATE_TOKEN|private\.invalid|<html>/);
 const diagnostic=b.run("control('Status').children.find(row=>row.className==='month-detail-help').children.find(row=>row.tag==='code').textContent");assert.deepEqual(JSON.parse(diagnostic),{client_contract:'business-month-v2',operation:'start',code:'BUSINESS_MONTH_REQUEST_FAILED',api_code:null,http:null});assert.equal(b.text('Badge'),'Previsão completa');
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
 await b.run('startManual({api,syncVariants:syncAndComplete})');
 assert.equal(b.run('syncCalls'),1);assert.deepEqual(JSON.parse(b.run('JSON.stringify(operationCalls())')),['view','start','read','ads']);assert.match(b.text('Net'),/43,00/);
});

test('a forged net result is refused before it can appear in the monthly dashboard',async()=>{
 const b=browser(),invalid=fixture();invalid.result.net_estimate_cents++;b.load(invalid);
 assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),false);assert.equal(b.text('Net'),'Em apuração');assert.match(b.text('Status'),/não foi possível conferir/i);assert.equal(b.run('timers.size'),1);
 assert.deepEqual(JSON.parse(b.run('JSON.stringify(operationCalls())')),['view'],'an invalid successful cache response is never trusted or treated as a cache miss');
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
 assert.match(b.text('CostOverview'),/30,00/);assert.match(b.text('CostOverview'),/48,00/);assert.match(b.text('CostOverview'),/3 de 3/);assert.match(b.text('Net'),/72,00/);assert.equal(b.text('NetLabel'),'Resultado líquido previsto');
 b.run("control('ProductFilter').value='ready';control('ProductFilter').onchange();");assert.equal(b.run("control('ProductRows').children.length"),1);assert.match(b.text('ProductRows'),/Produto #200/);
 b.run("control('ProductFilter').value='pending';control('ProductFilter').onchange();");assert.equal(b.run("control('ProductRows').children.length"),1);assert.match(b.text('ProductRows'),/Produto #201/);
 b.run("control('ProductFilter').value='mixed';control('ProductFilter').onchange();");assert.equal(b.run("control('ProductRows').children.length"),2);
});

test('pending-cost filter also finds a mixed variation without blocking the proven exclusive saldo',async()=>{
 const b=browser(partialCostProductFixture());assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);
 b.run("control('ProductFilter').value='pending';control('ProductFilter').onchange();control('ProductSearch').value='200';control('ProductSearch').oninput();");
 assert.equal(b.run("control('ProductRows').children.length"),1);assert.match(b.text('ProductRows'),/Produto #200/);assert.match(b.text('ProductRows'),/29,00/);assert.match(b.text('ProductRows'),/Já identificado: .*10,00/);
 assert.match(b.text('ProductRows'),/Nestes pedidos: repasse .*40,00 · produção .*10,00 · imposto .*1,00/);
 assert.match(b.text('Net'),/82,00/);assert.equal(b.text('NetLabel'),'Saldo com custos identificados');assert.match(b.text('NetHelp'),/custo.*(?:pendente|falta|faltante)|(?:pendente|falta|faltante).*custo/i);assert.equal(b.run('currentFrame.result.net_estimate_cents'),null);
});

test('partial manufacturing costs show known amounts and unit coverage without releasing final net or automation',async()=>{
 const source=partialCostProductFixture(),b=browser(source);
 b.run('globalThis.brazaAutomationWorkspace={render(value){globalThis.diagnosis=value;}};');
 assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);
 assert.match(b.text('CostOverview'),/20,00/);assert.match(b.text('CostOverview'),/38,00/);assert.match(b.text('CostOverview'),/2 de 3/);assert.match(b.text('CostOverview'),/1.*pendente/i);
 assert.match(b.text('Net'),/82,00/);assert.equal(b.text('NetLabel'),'Saldo com custos identificados');assert.match(b.text('Waterfall'),/Produção.*identificad|Produção.*conhecid/i);assert.match(b.text('Waterfall'),/Saldo com custos identificados/);
 assert.equal(b.run('currentFrame.result.net_estimate_cents'),null);assert.equal(b.run('currentFrame.production_cost_cents'),null);assert.equal(b.text('CheckpointStatus'),'Previsão com pendências');assert.match(b.text('PendingList'),/sem composição ou custo completo/);
 assert.equal(b.run('diagnosis.status'),'BLOCKED');assert.equal(b.run('diagnosis.metrics.net_estimate_cents'),null);assert.equal(b.run('diagnosis.execution'),'READ_ONLY');assert.equal(b.run('diagnosis.conditions.includes("PRODUCTION_COST_INCOMPLETE")'),true);
});

test('partial balances explain both returns and unpriced production, including a known zero subtotal without inferred unit coverage',async()=>{
 const source=fixture();
 for(const sample of [{known:1000,quantity:1,returns:1,amount:'53,00'},{known:0,quantity:2,returns:0,amount:'63,00'}]){
  const pending=['PRODUCTION_COST_INCOMPLETE',...(sample.returns?['RETURNS_NOT_RECONCILED']:[])],value=fixture({...source,coverage:{...source.coverage,returns:sample.returns},production_cost_cents:null,known_production_cost_cents:sample.known,unmapped_variants:[{item_id:'201',model_id:'0',quantity:sample.quantity}],result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending}}),b=browser(value);
  assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);assert.equal(b.text('NetLabel'),'Saldo com custos identificados');assert.match(b.text('Net'),new RegExp(sample.amount));assert.match(b.text('NetHelp'),/falta descontar a produção/);assert.match(b.text('NetHelp'),/não é lucro líquido final/);
  if(sample.returns)assert.match(b.text('NetHelp'),/devolu.*conciliação/i);
  const production=b.run("text(control('CostOverview').children[0])");assert.match(production,/Produção com custo identificado/);assert.match(production,new RegExp(sample.known?'10,00':'0,00'));assert.match(production,/produção total permanece pendente/i);
  assert.doesNotMatch(b.text('CostOverview'),/100%|1 de 1|2 de 2|0 de 0/);assert.match(b.text('CostOverview'),/Quantidade ainda não disponível/);assert.equal(b.run('currentFrame.result.net_estimate_cents'),null);assert.equal(b.run('currentFrame.production_cost_cents'),null);
 }
});

test('fully identified production with unconciliated returns shows a provisional store balance and preserves all final blockers',async()=>{
 const source=productFixture(),row=source.product_summary.products[0];source.coverage.returns=1;row.exclusive_returns=1;row.exclusive_after_costs_cents=null;row.exclusive_margin_bps=null;row.pending=['RETURNS_NOT_RECONCILED'];source.result={...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['RETURNS_NOT_RECONCILED']};
 const b=browser(fixture(source));b.run('globalThis.brazaAutomationWorkspace={render(value){globalThis.diagnosis=value;}};');
 assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);
 assert.equal(b.text('NetLabel'),'Resultado líquido previsto · em conferência');assert.match(b.text('Net'),/43,01/);assert.match(b.text('NetHelp'),/devolu|reembolso|concilia/i);assert.match(b.text('CostOverview'),/20,00/);assert.match(b.text('CostOverview'),/2 de 2/);assert.match(b.text('PendingList'),/devoluções/);
 assert.equal(b.text('CheckpointStatus'),'Previsão com pendências');assert.equal(b.run('currentFrame.result.net_estimate_cents'),null);assert.equal(b.run('diagnosis.status'),'BLOCKED');assert.equal(b.run('diagnosis.metrics.net_estimate_cents'),null);assert.equal(b.run('diagnosis.conditions.includes("RETURNS_NOT_RECONCILED")'),true);
});

test('missing financial inputs and unresolved sources cannot become a numerical store balance',async()=>{
 const source=fixture(),pending=({pending:codes,...changes})=>fixture({...source,...changes,result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:codes}});
 const cases=[
  ['repasse',pending({coverage:{...source.coverage,payment_covered:1,payment_missing:1},sales_cents:null,expected_repass_cents:null,invoice_tax_cents:null,ads_adjustment_cents:null,pending:['PAYMENT_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADJUSTMENT_UNAVAILABLE']})],
  ['anúncios',pending({ads:null,pending:['ADS_UNAVAILABLE']})],
  ['DAS',meiProductFixture({pending:true})],
  ['despesas',pending({expenses:{revision:0,external_expenses_cents:null,recharge_treatment:'UNCONFIRMED',updated_at:null},pending:['EXTERNAL_EXPENSES_REQUIRED']})],
  ['ajuste ausente',pending({ads_adjustment_cents:null,pending:['ADJUSTMENT_UNAVAILABLE']})],
  ['recarga não classificada',pending({ads_adjustment_cents:1000,pending:['RECHARGE_TREATMENT_REQUIRED']})],
  ['fonte indisponível',pending({pending:['SOURCE_UNAVAILABLE']})],
  ['aritmética insegura',pending({pending:['ARITHMETIC_UNSAFE']})],
 ];
 for(const [name,value] of cases){const b=browser(value);assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true,name);assert.equal(b.text('Net'),'Em conciliação',name);assert.equal(b.text('NetLabel'),'Resultado líquido previsto',name);assert.equal(b.run('currentFrame.result.net_estimate_cents'),null,name);assert.equal(b.text('CheckpointStatus'),'Previsão com pendências',name);assert.doesNotMatch(b.text('Net'),/R\$|0,00/,name);}
});

test('a fully costed forecast keeps status-review orders excluded and preserves strict financial and automation blockers',async()=>{
 const source=fixture(),value=fixture({...source,coverage:{...source.coverage,orders:6,cancel_pending:1,other:1,returns:1},result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['STATUS_REVIEW_REQUIRED','RETURNS_NOT_RECONCILED']}}),b=browser(value);
 b.run('globalThis.brazaAutomationWorkspace={render(value){globalThis.diagnosis=value;}};');await b.run('brazaMonthDashboard.start({api,syncVariants})');
 assert.equal(b.text('NetLabel'),'Resultado líquido previsto · em conferência');assert.match(b.text('Net'),/43,00/);assert.match(b.text('NetHelp'),/2.*pedido.*(?:revisão|excluído)/i);assert.match(b.text('NetHelp'),/devolu.*concilia/i);assert.match(b.text('CostOverview'),/37,00/);assert.match(b.text('PendingList'),/cancelamento|situação/);assert.match(b.text('PendingList'),/devolu/i);
 assert.equal(b.run('currentFrame.result.net_estimate_cents'),null);assert.equal(b.run('currentFrame.result.net_profit_cents'),null);assert.equal(b.run('diagnosis.status'),'BLOCKED');assert.equal(b.run('diagnosis.execution'),'READ_ONLY');assert.equal(b.run('diagnosis.metrics.net_estimate_cents'),null);
});

test('legacy monthly data without product quantities does not invent unit coverage or erase known manufacturing costs',async()=>{
 const b=browser();assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);
 assert.match(b.text('CostOverview'),/20,00/);assert.doesNotMatch(b.text('CostOverview'),/2 de 2|100%|0 de 0/);assert.match(b.text('CostOverview'),/quantidade|unidades|detalhamento/i);assert.match(b.text('Net'),/43,00/);
});

test('absent or forged product data cannot become zero product contribution',async()=>{
 const legacy=browser();await legacy.run('brazaMonthDashboard.start({api,syncVariants})');
 assert.match(legacy.text('ProductSummary'),/leitura anterior ainda não trouxe os produtos/);assert.doesNotMatch(legacy.text('ProductRows'),/0,00/);assert.equal(legacy.run("control('ProductSearch').disabled"),true);
 const source=productFixture(),b=browser(source);await b.run('brazaMonthDashboard.start({api,syncVariants})');
 source.product_summary.products[0].exclusive_after_costs_cents++;
 b.load(source);assert.equal(await b.run('brazaMonthDashboard.refreshCosts()'),false);assert.match(b.run("text(control('ProductRows').children[0])"),/29,00/);assert.doesNotMatch(b.run("text(control('ProductRows').children[0])"),/29,01/);
 assert.match(b.text('Status'),/não foi possível (?:recalcular|conferir)/i);
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
 assert.equal(b.run("calls.some(call=>call.body?.operation==='expenses')"),false,'reading the known DAS does not prompt or save manual monthly tax amounts');
});

test('a partially costed MEI month deducts the declared DAS once without inventing the missing product cost',async()=>{
 const source=meiProductFixture(),row=source.product_summary.products[0],variant=row.variants[0];
 Object.assign(variant,{unit_cost_cents:null,production_cost_cents:null,exclusive_production_cost_cents:null,selling_unit:null,size:null,male_size:null,female_size:null});Object.assign(row,{known_production_cost_cents:0,production_cost_cents:null,known_exclusive_production_cost_cents:0,exclusive_production_cost_cents:null,exclusive_after_costs_cents:null,exclusive_margin_bps:null,pending:['PRODUCTION_COST_INCOMPLETE']});
 Object.assign(source,{known_production_cost_cents:2000,production_cost_cents:null,unmapped_variants:[{item_id:row.item_id,model_id:variant.model_id,quantity:1}],result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['PRODUCTION_COST_INCOMPLETE']}});
 const b=browser(fixture(source));assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);
 assert.equal(b.text('NetLabel'),'Saldo com custos identificados');assert.match(b.text('Net'),/-R\$\s*1,02/);assert.match(b.text('CostOverview'),/121,05/);assert.match(b.text('CostOverview'),/2 de 3/);assert.match(b.text('NetHelp'),/DAS-MEI mensal/);assert.doesNotMatch(b.text('NetHelp'),/2%/);
 assert.equal((b.text('Waterfall').match(/86,05/g)||[]).length,1);assert.equal(b.run('currentFrame.result.net_estimate_cents'),null);assert.equal(b.run('currentFrame.production_cost_cents'),null);
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
 assert.match(b.text('ProductRows'),/Subtotal da última leitura.*6,08/);assert.match(b.text('ProductRows'),/antes de anúncios, outras despesas e DAS-MEI mensal/);assert.match(b.text('ProductRows'),/saldo final continua em conferência/);assert.match(b.text('ProductPeriodNotice'),/Avisos do período/);assert.doesNotMatch(b.text('ProductRows'),/Há situações de pedidos do mês|Parte da leitura financeira/);assert.equal(b.text('NetLabel'),'Resultado líquido previsto · em conferência');assert.match(b.text('Net'),/94,97/);assert.equal(b.run('currentFrame.result.net_estimate_cents'),null);
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
 assert.equal(b.run("operationCalls().at(-1)"),'view');assert.match(b.text('Net'),/43,01/);
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
 assert.equal(await b.run("control('Refresh').onclick()"),true);assert.equal(b.run('retries'),1);assert.equal(b.run("control('Select').disabled"),false);assert.equal(b.run("control('Previous').disabled"),false);assert.equal(b.text('Refresh'),'Recalcular custos');assert.match(b.text('Net'),/43,00/);
 b.run("control('ExpensesValue').value='123.45';control('ExpensesValue').oninput();");const before=b.text('Status'),calls=b.run('calls.length');
 for(const phase of ['LOADING','RETRYING','FAILED','READY'])assert.equal(b.run('brazaMonthDashboard.bootstrapState({phase:'+JSON.stringify(phase)+',message:"Failed to fetch PRIVATE"})'),false);
 assert.equal(b.run('brazaMonthDashboard.prepare()'),false);assert.equal(b.run('calls.length'),calls);assert.equal(b.run("control('ExpensesValue').value"),'123.45');assert.equal(b.text('Status'),before);assert.match(b.text('Net'),/43,00/);
 b.run('brazaMonthDashboard.stop();');assert.equal(b.text('Refresh'),'Recalcular custos');assert.equal(b.run('brazaMonthDashboard.bootstrapState({phase:"FAILED"})'),false);assert.match(b.text('Net'),/43,00/);
});


test('a recent saved month opens with one local read and the primary cost recalculation never reimports orders or Ads',async()=>{
 const saved=fixture({source_checked_at:{finance_oldest_at:stamp-90,finance_latest_at:stamp-30,ads_at:stamp}}),b=browser(saved);
 assert.equal(await b.run('brazaMonthDashboard.start({api,syncVariants})'),true);assert.deepEqual(operations(b),['view']);
 assert.equal(b.text('Refresh'),'Recalcular custos');assert.equal(b.text('SourceRefresh'),'Atualizar vendas');assert.match(b.text('Status'),/pedidos.*salvos/);
 const changed=fixture({...saved,costs_revision:4,production_cost_cents:2100,known_production_cost_cents:2100,result:{...saved.result,net_estimate_cents:4200,net_margin_bps:4200}});b.load(changed);
 assert.equal(await b.run("control('Refresh').onclick()"),true);assert.deepEqual(operations(b),['view','view']);assert.match(b.text('Net'),/42,00/);
 assert.match(b.text('Status'),/custos salvos/);assert.match(b.text('Scope'),/08:58:30/);assert.equal(b.run("control('SourceRefresh').disabled"),false);
 assert.equal(b.run('timers.size'),1,'cost recalculation keeps exactly one financial schedule');
 b.run('clock+=211000;customApi=async(path,body)=>{if(body.operation!=="read")throw Object.assign(Error("fixture stop"),{code:"ADMIN_API_HTTP_ERROR"});return JSON.parse(JSON.stringify(currentFrame));};');
 await b.run('[...timers.values()][0].callback()');assert.equal(operations(b).at(-1),'view');assert.equal(b.run('currentFrame.source_checked_at.finance_oldest_at'),stamp-90,'the local read did not renew the provider clock');assert.equal(operations(b).some(operation=>['start','step','ads'].includes(operation)),false);
});

test('the separate sales update still imports cancellations before replacing the saved monthly quantities and balance',async()=>{
 const saved=fixture({source_checked_at:{finance_oldest_at:stamp-90,finance_latest_at:stamp-30,ads_at:stamp}}),b=browser(saved);
 await b.run('brazaMonthDashboard.start({api,syncVariants})');
 const updated=fixture({...saved,coverage:{...saved.coverage,paid:1,completed:1,ongoing:0,cancelled:2,payment_covered:1},sales_cents:5000,known_sales_cents:5000,expected_repass_cents:4000,known_expected_repass_cents:4000,production_cost_cents:1000,known_production_cost_cents:1000,invoice_tax_cents:100,known_invoice_tax_cents:100,result:{...saved.result,net_estimate_cents:1400,net_margin_bps:2800}});b.load(updated);
 assert.equal(await b.run("control('SourceRefresh').onclick()"),true);assert.deepEqual(operations(b),['view','start','ads']);
 assert.match(b.text('Coverage'),/1 pedido\(s\) pagos/);assert.match(b.text('Coverage'),/2 cancelado\(s\) excluído\(s\)/);assert.match(b.text('Sales'),/50,00/);assert.match(b.text('Net'),/14,00/);
});

test('a delayed local recalculation cannot overwrite a different selected month and cannot send an overlapping source update',async()=>{
 const saved=fixture({source_checked_at:{finance_oldest_at:stamp-90,finance_latest_at:stamp-30,ads_at:stamp}}),b=browser(saved);await b.run('brazaMonthDashboard.start({api,syncVariants})');
 b.run('let releaseCosts;customViewApi=async path=>new URLSearchParams(path.split("?")[1]).get("month")==="2026-10"?new Promise(resolve=>releaseCosts=resolve):savedView(currentFrame);');
 const pending=b.run("control('Refresh').onclick()");await b.settle();assert.equal(b.run("control('SourceRefresh').disabled"),true);assert.equal(await b.run("control('SourceRefresh').onclick()"),false);assert.deepEqual(operations(b),['view','view']);
 const past=fixture({...saved,month:'2026-09',start_date:'2026-09-01',end_date:'2026-09-30',ads:calendar('2026-09',30)});b.load(past);b.run("control('Select').value='2026-09';");assert.equal(await b.run("control('Select').onchange()"),true);assert.match(b.text('Scope'),/01\/09\/2026 a 30\/09\/2026/);
 b.context.old=JSON.stringify(saved);b.run('releaseCosts(savedView(JSON.parse(old)));');assert.equal(await pending,false);assert.match(b.text('Scope'),/01\/09\/2026 a 30\/09\/2026/);assert.doesNotMatch(b.text('Scope'),/01\/10\/2026/);assert.equal(b.run("control('SourceRefresh').disabled"),false);
});


test('a failed Ads read after an explicit manual update cannot become a periodic browser retry',async()=>{
 const source=fixture(),saved=fixture({...source,source_checked_at:{finance_oldest_at:stamp,finance_latest_at:stamp,ads_at:stamp},result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['ADS_UNAVAILABLE']}}),b=browser(saved);
 b.run("customApi=async(path,body)=>{if(body?.operation==='ads')throw Object.assign(Error('PRIVATE_ADS_RESPONSE'),{code:'ADMIN_API_TIMEOUT'});return JSON.parse(JSON.stringify(currentFrame));};");
 assert.equal(await b.run('startManual({api,syncVariants})'),false);assert.deepEqual(operations(b),['view','start','ads']);assert.match(b.text('Ads'),/10,00/);assert.equal(b.run("control('AdsCard').dataset.status"),'provisional');assert.doesNotMatch(b.text('Status'),/PRIVATE/);
 for(let index=0;index<4;index++)await recoveryTick(b);assert.deepEqual(operations(b),['view','start','ads','view','view','view','view']);assert.equal(b.run('calls.filter(call=>call.body?.operation===\"ads\").length'),1);assert.ok(!operations(b).includes('expenses'));
});

test('cost-only reads retain the last dated Ads amount and cannot call an Ads source even while its refresh is pending',async()=>{
 const source=fixture(),saved=fixture({...source,source_checked_at:{finance_oldest_at:stamp-30,finance_latest_at:stamp,ads_at:stamp},result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['ADS_UNAVAILABLE']}}),b=browser(saved);await b.run('brazaMonthDashboard.start({api,syncVariants})');
 assert.equal(await b.run("control('Refresh').onclick()"),true);assert.deepEqual(operations(b),['view','view']);assert.match(b.text('Ads'),/10,00/);assert.match(b.text('AdsHelp'),/último gasto|Último gasto/);assert.equal(b.text('Net'),'Em conciliação');assert.equal(b.run('currentFrame.source_checked_at.ads_at'),stamp);assert.equal(b.run('timers.size'),1);
});


function recordedUiFixture(){
 const source=fixture();return fixture({...source,progress:{windows_total:2,windows_complete:2,pages_read:13,order_capacity:260},coverage:{orders:243,paid:241,completed:241,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:2,unknown:0,payment_covered:241,payment_missing:0,returns:4,returns_unknown:0},sales_cents:1576639,known_sales_cents:1576639,expected_repass_cents:1109313,known_expected_repass_cents:1109313,production_cost_cents:null,known_production_cost_cents:736510,invoice_tax_cents:8605,known_invoice_tax_cents:8605,ads_adjustment_cents:1180,ads:calendar('2026-10',22,'1314.03'),expenses:{revision:1,external_expenses_cents:0,recharge_treatment:'ADS_RECHARGE',updated_at:current},result:{...source.result,net_estimate_cents:null,net_margin_bps:null,pending:['PRODUCTION_COST_INCOMPLETE','RETURNS_NOT_RECONCILED','STATUS_REVIEW_REQUIRED','FINANCIAL_SOURCE_STALE']},unmapped_variants:[{item_id:'58218547329',model_id:'238814010783',quantity:1},{item_id:'58219210514',model_id:'219195030703',quantity:3}],tax:{schema:'business_month_tax_v1',regime:'MEI',year:2026,policy_revision:1,monthly_das_cents:8605,tax_cents:8605,status:'DECLARED',source:'OPERATOR_DECLARED_DAS',basis:'MONTHLY_COMPETENCE_NO_PRORATION'},source_checked_at:{finance_oldest_at:stamp-1800,finance_latest_at:stamp-1,ads_at:stamp},collection:{schema:'business_month_collection_v1',state:'READY',code:null,retry_after_seconds:0},product_summary:null});
}
function costEvidenceFixture(source=recordedUiFixture()){
 const diagnostic=costDiagnosticFixture(source),history={schema:'historical_cost_pair_diagnostics_v1',month:source.month,checked_at:stamp,pairs:diagnostic.products.flatMap((product,index)=>product.variants.map(variant=>({item_id:product.item_id,model_id:variant.model_id,state:index===0?'NOT_FOUND':'SCANNING',reason:index===0?'EXACT_PAIR_NOT_IN_COMPLETED_SCAN':'SCAN_NOT_COMPLETE',approved:false,provenance:null,item_name:null,model_name:null,name_flags:{missing_item_name:false,missing_model_name:false,conflict:false,overflow:false},composition:null,first_checked_at:null,last_checked_at:null,scan:{status:index===0?'COMPLETE':'RETRY_WAIT',start_date:'2026-10-01',end_date:'2026-10-21',window_index:index===0?2:1,windows_total:2,pages_read:index===0?7:3,checked_at:stamp-1,retry_after_seconds:index===0?0:60,running:false,observed_pair:false}}))),truncation:{truncated:false,pairs_total:source.unmapped_variants.length,pairs_included:source.unmapped_variants.length}},recorded_balance=buildRecordedBusinessBalance(source),value={schema:'business_cost_diagnostics_evidence_v1',diagnostic,history,recorded_balance};
 assert.ok(projectBusinessCostDiagnosticsEvidence(value,{projectDiagnostic:projectBusinessCostDiagnostics,projectHistory:projectHistoricalCostPairDiagnostics,projectBalance:projectRecordedBusinessBalance}),'the enriched report must satisfy all standalone contracts');return value;
}

test('the overview presents one R$2339.75 known-cost balance and keeps four costs, two reviews and four returns explicit',async()=>{
 const source=recordedUiFixture(),b=browser(source),before=JSON.stringify(source);assert.equal(buildRecordedBusinessBalance(source).amount_cents,233975);await b.run('brazaMonthDashboard.start({api})');
 const text=b.text('NetHelp');assert.match(b.text('Net'),/2[.]339,75/);assert.equal(b.text('NetLabel'),'Saldo com custos identificados');assert.doesNotMatch(b.text('CostOverview'),/Subtotal com custos identificados/);assert.match(text,/produção.*4|4.*unidade/i);assert.match(text,/2.*pedido.*revisão/i);assert.match(text,/4.*devolu/i);assert.match(text,/leitura financeira|última leitura|atualiza/i);assert.match(text,/não é lucro líquido final/i);assert.equal(b.run('currentFrame.result.net_estimate_cents'),null);assert.equal(b.run('currentFrame.result.net_profit_cents'),null);assert.equal(b.run('calls.some(call=>call.path.includes("cost-diagnostics"))'),false);assert.equal(JSON.stringify(source),before);b.run('brazaMonthDashboard.stop()');
 const ready=browser(meiProductFixture());await ready.run('brazaMonthDashboard.start({api})');assert.doesNotMatch(ready.text('CostOverview'),/Subtotal com custos identificados/);assert.equal(ready.text('NetLabel'),'Resultado líquido previsto');ready.run('brazaMonthDashboard.stop()');
});

test('the pending-order shortcut opens the saved reconciliation section without new reads, timers or financial changes',async()=>{
 const b=browser(recordedUiFixture());b.run('let reconciliationOpens=0;globalThis.brazaReconciliation={start:()=>true,observe:async()=>false,stop(){},open(){reconciliationOpens++;return true;}};');
 await b.run('brazaMonthDashboard.start({api})');assert.match(businessMonthBody(),/Conferir pedidos e devoluções/);assert.equal(b.run('control("OpenReconciliation").hidden'),false);
 const reads=b.run('calls.length'),timers=b.run('timers.size'),net=b.text('Net');for(let i=0;i<3;i++)assert.equal(b.run('control("OpenReconciliation").onclick()'),true);
 assert.equal(b.run('reconciliationOpens'),3);assert.equal(b.run('calls.length'),reads);assert.equal(b.run('timers.size'),timers);assert.equal(b.text('Net'),net);assert.equal(b.run('currentFrame.result.net_estimate_cents'),null);
 b.load(fixture());await b.run('brazaMonthDashboard.refreshCosts()');assert.equal(b.run('control("OpenReconciliation").hidden'),true);b.run('brazaMonthDashboard.stop()');
});

test('an unknown monetary deduction cannot become a recorded subtotal or zero after a local repaint',async()=>{
 const source=recordedUiFixture();source.expenses={revision:0,external_expenses_cents:null,recharge_treatment:'UNCONFIRMED',updated_at:null};source.ads_adjustment_cents=0;source.result.pending.push('EXTERNAL_EXPENSES_REQUIRED');assert.ok(projectBusinessMonth(source));const b=browser(source);await b.run('brazaMonthDashboard.start({api})');assert.doesNotMatch(b.text('CostOverview'),/Subtotal com custos identificados|2[.]339,75/);assert.equal(b.text('Net'),'Em conciliação');b.run('brazaMonthDashboard.stop()');
});

test('one opt-in cost report explains both historical pairs and copies the complete evidence while malformed history preserves the verified report',async()=>{
 const source=recordedUiFixture(),wrapper=costEvidenceFixture(source),b=browser(source);b.context.evidence=JSON.stringify(wrapper);await b.run('brazaMonthDashboard.start({api})');b.run('customApi=async(path)=>path.startsWith("finance/cost-diagnostics?")?JSON.parse(evidence):JSON.parse(JSON.stringify(currentFrame));globalThis.navigator={clipboard:{writeText:async value=>{globalThis.copied=value;}}};');
 assert.equal(await b.run('control("CostCheck").onclick()'),true);assert.equal(b.run('calls.at(-1).path'),'finance/cost-diagnostics?month=2026-10&evidence=history-v2');const text=b.text('CostDiagnosticBody');assert.match(text,/não apareceu no intervalo de pedidos já conferido/);assert.match(text,/conferência do histórico.*em andamento/);assert.match(text,/Pedidos de 2026-10-01 a 2026-10-21/);assert.match(text,/Nova tentativa em até 60 segundo/);assert.match(text,/1 unidade.*3 unidade/s);assert.equal(await b.run('control("CostCopy").onclick()'),true);assert.deepEqual(JSON.parse(b.run('copied')),wrapper);
 b.run('customApi=async()=>{const value=JSON.parse(evidence);value.history.month="2026-09";return value;};');assert.equal(await b.run('control("CostCheck").onclick()'),false);assert.equal(b.text('CostDiagnosticBody'),text);assert.equal(await b.run('control("CostCopy").onclick()'),true);assert.deepEqual(JSON.parse(b.run('copied')),wrapper);
 b.run('customApi=async()=>{const value=JSON.parse(evidence);value.history.pairs[1].reason="OBSERVATION_OUTSIDE_COMPLETED_SCAN";value.history.pairs[1].scan.status="COMPLETE";value.history.pairs[1].scan.window_index=2;value.history.pairs[1].scan.retry_after_seconds=0;return value;};');assert.equal(await b.run('control("CostCheck").onclick()'),true);assert.match(b.text('CostDiagnosticBody'),/nomes salvos vieram de outra conferência/);assert.doesNotMatch(b.text('CostDiagnosticBody'),/conferência do histórico.*em andamento/);
 b.run('customApi=async()=>JSON.parse(evidence).diagnostic;');assert.equal(await b.run('control("CostCheck").onclick()'),true);assert.doesNotMatch(b.text('CostDiagnosticBody'),/Nova tentativa em até 60 segundo|Histórico ·/);b.run('brazaMonthDashboard.stop()');
});


function costEvidenceV2Fixture(){
 const old=costEvidenceFixture(),value={...old,schema:'business_cost_diagnostics_evidence_v2',history:{...old.history,schema:'historical_cost_pair_diagnostics_v2',pairs:old.history.pairs.map(pair=>({...pair,item_names:[],model_names:[],resolution:{kind:'CONFLICT',compositions:[],combinations:0,reason:'NO_OBSERVATION'}}))},background:{schema:'background_collection_diagnostic_v1',month:'2026-10',checked_at:stamp,planned:{cron:'* * * * *',running_interval_seconds:60,complete_interval_seconds:300,financial_freshness_seconds:900},trigger_observation:'NOT_RECORDED',sync:{enabled:true,status:'COMPLETE',month:'2026-09',next_run_at:stamp+60,last_attempt_at:stamp-90,last_success_at:stamp-30,failure_count:0,last_error:null,lease_active:false,lease_expires_at:null,summary:null},lane:{revision:1,next_group:'FINANCE',next_auxiliary:'HISTORY',lease_active:false,lease_expires_at:null,analysis_attempt_day:null},cohort:{revision:2,start_date:'2026-10-01',end_date:'2026-10-22',app_created_at:stamp-1800,app_updated_at:stamp-30,source_oldest_at:stamp-1800,source_latest_at:stamp-1},recent_finance_runs:[{status:'COMPLETE',started_at:stamp-90,finished_at:stamp-30,finance_steps:1,ads_reads:0,error_code:null,pages_read:null,orders_seen:null}]}};
 const pair=value.history.pairs[1],item_names=['Camiseta adulta unissex P ao G3'],model_names=['Preto / P','Amarelo / G1'],compositions=model_names.map(name=>{const parsed=deriveHistoricalCostComposition(item_names[0],name);return Object.fromEntries(['kind','size','male_size','female_size','child_size'].map(key=>[key,parsed[key]]));}).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 Object.assign(pair,{state:'COST_CANDIDATES',reason:'DIFFERENT_SUPPORTED_COMPOSITIONS',approved:true,provenance:'HISTORICAL_ORDER_EVIDENCE',item_name:item_names[0],model_name:null,item_names,model_names,name_flags:{missing_item_name:false,missing_model_name:false,conflict:true,overflow:false},first_checked_at:stamp-60,last_checked_at:stamp-1,scan:{...pair.scan,status:'COMPLETE',window_index:2,retry_after_seconds:0,observed_pair:true},resolution:{kind:'COST_CANDIDATES',compositions,combinations:2,reason:'DIFFERENT_COMPOSITIONS'}});
 assert.ok(projectBusinessCostDiagnosticsEvidenceV2(value,{projectDiagnostic:projectBusinessCostDiagnostics,projectHistory:row=>projectHistoricalCostPairDiagnosticsEvidence(row,{deriveComposition:deriveHistoricalCostComposition,projectLegacy:projectHistoricalCostPairDiagnostics}),projectBalance:projectRecordedBusinessBalance,projectBackground:projectBackgroundCollectionDiagnostics}));return value;
}

test('history-v2 displays every original alternative and local background evidence without guessing size, price or external cron execution',async()=>{
 const value=costEvidenceV2Fixture(),b=browser(recordedUiFixture());b.context.evidence=JSON.stringify(value);await b.run('brazaMonthDashboard.start({api})');b.run('customApi=async(path)=>path.startsWith("finance/cost-diagnostics?")?JSON.parse(evidence):JSON.parse(JSON.stringify(currentFrame));globalThis.navigator={clipboard:{writeText:async value=>{globalThis.copied=value;}}};');const net=b.text('Net');
 assert.equal(await b.run('control("CostCheck").onclick()'),true);assert.equal(b.run('calls.at(-1).path'),'finance/cost-diagnostics?month=2026-10&evidence=history-v2');const text=b.text('CostDiagnosticBody');assert.match(text,/Nomes da variação registrados:.*Preto \/ P.*Amarelo \/ G1/);assert.match(text,/tamanhos diferentes.*mesmo custo cadastrado.*sem escolher um tamanho/);assert.match(text,/Acompanhamento automático.*não confirmam os disparos da agenda externa/);assert.match(text,/Última tentativa:.*último avanço concluído:.*próxima consulta prevista:/);assert.match(text,/Mês da coleta automática: 2026-09/);assert.match(text,/Leitura atual iniciada em.*Primeira fonte financeira:/);assert.match(text,/Próxima frente prevista: financeiro/);assert.match(text,/páginas não informadas.*quantidade de pedidos não informada/);assert.doesNotMatch(text,/null página|undefined|Camiseta P ·/);assert.equal(b.text('Net'),net);assert.equal(b.run('currentFrame.unmapped_variants.length'),2);
 assert.equal(await b.run('control("CostCopy").onclick()'),true);assert.deepEqual(JSON.parse(b.run('copied')),value);b.run('customApi=async()=>{const value=JSON.parse(evidence);value.background.month="2026-09";return value;};');assert.equal(await b.run('control("CostCheck").onclick()'),false);assert.equal(b.text('CostDiagnosticBody'),text);b.run('brazaMonthDashboard.stop()');
});
