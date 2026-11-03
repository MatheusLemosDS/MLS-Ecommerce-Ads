import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {incurredProductionBody,INCURRED_PRODUCTION_CLIENT} from '../src/incurred-production-view.mjs';
import {readIncurredProduction,mutateIncurredProduction} from '../src/incurred-production.mjs';
import {readIncurredProductionWorkspace} from '../src/incurred-production-workspace.mjs';
import {D1} from './sqlite-d1.mjs';
import {ownerReportBrowser} from './owner-report-browser-fixture.mjs';

const at=Date.parse('2026-11-26T18:00:00Z'),now=()=>at;
const identity={artwork:'Arte sintética',color:'Preta',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null};
async function fixture(t,{empty=false,financialMonth='2026-11',financialDate=null,reenterSelection=false}={}){
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());let number=0;
 const read=()=>readIncurredProduction(env,{now});
 const record=async(produced_date,quantity,cost)=>{const ledger=await read(),record_id=webcrypto.randomUUID();await mutateIncurredProduction(env,{revision:ledger.revision,request_id:webcrypto.randomUUID(),action:'record',record_id,production_ref:'SIMULADO: fabricação '+(++number),replaces_record_id:null,produced_date,quantity,identity:{...identity},source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:cost,reference:null},evidence:'SIMULADO: data de fabricação e custo histórico conferidos',confirmed:true},'synthetic-owner',{now});return record_id;};
 if(!empty){const old=await record('2026-07-15',1,50000);await mutateIncurredProduction(env,{revision:(await read()).revision,request_id:webcrypto.randomUUID(),action:'void',record_id:old,reason:'SIMULADO: lançamento anulado'},'synthetic-owner',{now});await record('2026-09-20',2,1500);await record('2026-09-21',3,1000);await record('2026-09-25',1,2000);await record('2026-10-15',2,null);await record('2026-10-20',1,1250);await record('2026-10-24',1,0);await record('2026-11-25',2,1590);}
 const resizeProbe='globalThis.productionResizeHandlers=[];globalThis.addEventListener=(name,handler)=>{if(name==="resize")productionResizeHandlers.push(handler);};';
 const b=ownerReportBrowser(incurredProductionBody()+'<script>'+resizeProbe+INCURRED_PRODUCTION_CLIENT+'</script>',{scriptIncludes:'globalThis.brazaIncurredProduction='}),calls=[];let failPost=false;b.context.crypto=webcrypto;b.context.fixtureAt=at;b.context.fixtureFinancialMonth=financialMonth;b.context.fixtureFinancialDate=financialDate;b.context.fixtureReenterSelection=reenterSelection;
 b.context.readSaved=async(path,body)=>{calls.push({path,body:body===undefined?null:JSON.parse(JSON.stringify(body))});if(body&&failPost)throw Object.assign(Error('SAFE_SYNTHETIC_TIMEOUT'),{code:'ADMIN_API_TIMEOUT'});assert.equal(body,undefined,'calendar reads must not create physical facts');const q=new URL('https://local.test/'+path).searchParams;return JSON.stringify(await readIncurredProductionWorkspace(env,{month:q.get('month'),week_of:q.get('week_of')},{now}));};
 b.run(`class ProductionDate extends Date{constructor(...args){super(...(args.length?args:[fixtureAt]));}static now(){return fixtureAt;}}globalThis.Date=ProductionDate;globalThis.brazaMonthDashboard={getSnapshot:()=>({month:fixtureFinancialMonth})};globalThis.financialSelectionReads=0;if(fixtureFinancialDate!==null)globalThis.brazaDayDashboard={getSelection:()=>{financialSelectionReads++;if(fixtureReenterSelection&&financialSelectionReads===1)brazaIncurredProduction.getAnalyticsSnapshot();return fixtureFinancialDate;}};const productionApi=async(path,body)=>JSON.parse(await readSaved(path,body));brazaIncurredProduction.start({api:productionApi});`);
 t.after(()=>{b.run('brazaIncurredProduction.stop();');b.timers.clear();});
 const analytics=()=>JSON.parse(b.run('JSON.stringify(brazaIncurredProduction.getAnalyticsSnapshot())'));
 const field=(name,kind='Form')=>b.nodes.get('incurredProduction'+kind).querySelector('[name="'+name+'"]');
 return {b,calls,read,analytics,field,async open(){b.run('brazaIncurredProduction.open();');await b.flush();},selectMonth(value){b.nodes.get('incurredProductionHistoryMonth').value=value;return b.nodes.get('incurredProductionHistoryMonth').onchange();},selectDay(value){b.nodes.get('incurredProductionDay').value=value;return b.nodes.get('incurredProductionDay').onchange();},failPost(){failPost=true;}};
}

test('daily calendar starts lazily and never turns a cold ledger into zero expenditure',async t=>{
 const f=await fixture(t,{empty:true});assert.equal(f.calls.length,0);assert.equal(f.analytics(),null);await f.open();assert.equal(f.calls.length,1);assert.equal(f.analytics().summary.state,'NO_RECORDS');
 for(const name of ['incurredProductionSelectedDay','incurredProductionMonthTotal','incurredProductionHighestCost'])assert.doesNotMatch(f.b.nodes.get(name).textContent,/R\$/);
 assert.equal(f.b.nodes.get('incurredProductionCostChart').hidden,true);assert.equal(f.b.nodes.get('incurredProductionCostChart').getAttribute('hidden'),'','SVG visibility must use its attribute, independently of the HTML hidden property');assert.match(f.b.nodes.get('incurredProductionChartEmpty').textContent,/não presume custo zero/);assert.equal(f.b.nodes.get('incurredProductionMonthDays').children.length,26);
 assert.equal(f.selectDay('2026-11-27'),false);assert.equal(f.analytics().selected_day.date,'2026-11-26');assert.equal(f.b.nodes.get('incurredProductionDay').value,'2026-11-26');assert.equal(f.calls.length,1);
});

test('saved manufacturing months, exact day costs, peak ties and void-only history are local and preserve drafts',async t=>{
 const f=await fixture(t);await f.open();const original=JSON.stringify(await f.read()),range=f.b.run('JSON.stringify(brazaIncurredProduction.getRangeSnapshot())');
 f.b.nodes.get('incurredProductionRecord').value=(await f.read()).records.find(row=>row.status==='ACTIVE').record_id;f.b.nodes.get('incurredProductionRecord').onchange();
 f.field('production_ref').value='Rascunho sintético preservado';f.field('production_ref').oninput();f.field('quantity').value='9';f.field('quantity').oninput();f.field('reason','VoidForm').value='Motivo sintético preservado';f.field('reason','VoidForm').oninput();
 f.b.nodes.get('incurredProductionStart').value='2026-10-15';f.b.nodes.get('incurredProductionStart').oninput();f.b.nodes.get('incurredProductionEnd').value='2026-10-25';f.b.nodes.get('incurredProductionEnd').oninput();
 assert.equal(f.selectMonth('2026-09'),true);let value=f.analytics();assert.equal(value.summary.total_cost_cents,8000);assert.deepEqual(value.highest_cost.dates,['2026-09-20','2026-09-21']);assert.equal(value.highest_cost.amount_cents,3000);assert.equal(f.b.nodes.get('incurredProductionMonthDays').children.length,30);assert.equal(f.b.nodes.get('incurredProductionCostChart').querySelectorAll('rect').length,3);assert.equal(f.b.nodes.get('incurredProductionCostChart').getAttribute('hidden'),null);assert.equal(f.b.nodes.get('incurredProductionHighestCost').querySelectorAll('button').length,2);
 const selected=f.b.nodes.get('incurredProductionMonthDays').querySelectorAll('button').find(row=>row.dataset.incurredProductionDay==='2026-09-20');assert.ok(selected);assert.equal(selected.onclick(),true);assert.equal(f.analytics().selected_day.summary.total_cost_cents,3000);assert.equal(f.b.nodes.get('incurredProductionDay').value,'2026-09-20');
 assert.equal(f.selectMonth('2026-10'),true);assert.equal(f.analytics().highest_cost.state,'UNKNOWN_COSTS');assert.doesNotMatch(f.b.nodes.get('incurredProductionHighestCost').textContent,/R\$/);assert.match(f.b.nodes.get('incurredProductionHighestCost').textContent,/custos pendentes/);
 assert.equal(f.selectDay('2026-10-24'),true);assert.equal(f.analytics().selected_day.summary.total_cost_cents,0);assert.match(f.b.nodes.get('incurredProductionSelectedDay').textContent,/R\$\s*0,00/);
 assert.equal(f.selectDay('2026-10-15'),true);assert.equal(f.analytics().selected_day.summary.total_cost_cents,null);assert.match(f.b.nodes.get('incurredProductionSelectedDay').textContent,/Custo pendente/);assert.doesNotMatch(f.b.nodes.get('incurredProductionSelectedDay').textContent,/R\$/);
 assert.equal(f.selectMonth('2026-07'),true);assert.equal(f.analytics().summary.state,'NO_RECORDS');assert.equal(f.b.nodes.get('incurredProductionCostChart').hidden,true);assert.equal(f.analytics().summary.voided_records,1);assert.ok(f.analytics().history_months.includes('2026-07'));
 assert.equal(f.field('production_ref').value,'Rascunho sintético preservado');assert.equal(f.field('quantity').value,'9');assert.equal(f.field('reason','VoidForm').value,'Motivo sintético preservado');assert.equal(f.b.nodes.get('incurredProductionStart').value,'2026-10-15');assert.equal(f.b.nodes.get('incurredProductionEnd').value,'2026-10-25');assert.equal(f.b.run('JSON.stringify(brazaIncurredProduction.getRangeSnapshot())'),range);
 assert.equal(f.calls.length,1);assert.equal(JSON.stringify(await f.read()),original);assert.ok(f.calls.every(row=>row.body===null));
});

test('the public date selection API cannot bypass an unconfirmed manufacturing mutation or a closed session',async t=>{
 const f=await fixture(t);await f.open();f.failPost();
 for(const [name,value]of Object.entries({production_ref:'Rascunho enviado',quantity:'3',produced_date:'2026-11-26',evidence:'SIMULADO: produção conferida'})){f.field(name).value=value;f.field(name).oninput();}f.field('confirmed').checked=true;
 assert.equal(await f.b.nodes.get('incurredProductionForm').onsubmit({preventDefault(){}}),false);const before=JSON.stringify(f.analytics()),calls=f.calls.length;
 f.b.context.testDate='2026-09-20';assert.equal(f.b.run('brazaIncurredProduction.selectAnalyticsDate(testDate)'),false);assert.equal(JSON.stringify(f.analytics()),before);assert.equal(f.b.nodes.get('incurredProductionDay').disabled,true);assert.equal(f.b.nodes.get('incurredProductionHistoryMonth').disabled,true);assert.equal(f.calls.length,calls);assert.equal(f.field('production_ref').value,'Rascunho enviado');
 f.b.run('productionResizeHandlers.forEach(handler=>handler());');assert.ok(f.b.nodes.get('incurredProductionMonthDays').querySelectorAll('button').every(button=>button.disabled),'resizing must keep newly rendered daily buttons locked while the mutation is unconfirmed');assert.ok(f.b.nodes.get('incurredProductionHighestCost').querySelectorAll('button').every(button=>button.disabled));assert.equal(JSON.stringify(f.analytics()),before);assert.equal(f.calls.length,calls);
 f.b.run('brazaIncurredProduction.stop();');assert.equal(f.analytics(),null);assert.equal(f.b.run('brazaIncurredProduction.selectAnalyticsDate(testDate)'),false);
});

test('initial historical and explicit dates follow the existing financial selection without overriding later local choices',async t=>{
 for(const [financialMonth,financialDate,expected]of [['2026-09','2026-09-01','2026-09-01'],['2026-10','2026-10-24','2026-10-24'],['2026-09','2026-10-24','2026-09-30'],['2026-11','2026-11-27','2026-11-26']]){
  const f=await fixture(t,{financialMonth,financialDate,reenterSelection:true});await f.open();assert.equal(f.analytics().month,financialMonth);assert.equal(f.analytics().selected_day.date,expected);assert.equal(f.calls.length,1);assert.equal(f.b.run('financialSelectionReads'),1,'the initial financial getter may re-enter the ledger once, without recursion or duplicate selection reads');
  f.field('production_ref').value='Rascunho histórico preservado';f.field('production_ref').oninput();const chosen=financialMonth+'-20';assert.equal(f.selectDay(chosen),true);f.b.context.fixtureFinancialDate=financialMonth+'-21';await f.b.nodes.get('incurredProductionReload').onclick();assert.equal(f.analytics().selected_day.date,chosen,'later saved-ledger refresh must retain the explicitly chosen local date');assert.equal(f.field('production_ref').value,'Rascunho histórico preservado');assert.equal(f.b.run('financialSelectionReads'),1);assert.equal(f.calls.length,2);assert.ok(f.calls.every(row=>row.body===null));
 }
});
