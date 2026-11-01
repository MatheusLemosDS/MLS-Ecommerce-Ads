import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {BUSINESS_DAY_CLIENT,BUSINESS_DAY_CSS,businessDayBody} from '../src/business-day-view.mjs';
import {collectionFixture} from './business-collection-fixture.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {readCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {projectBusinessMonthAuditScope} from '../src/business-month-view-state.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {buildDailyBusinessSummary,projectDailyBusinessSummary} from '../src/business-daily-summary.mjs';

const validators={projectMonthly:projectBusinessMonth,projectFrame:projectBusinessPeriodFrame,projectScope:projectBusinessMonthAuditScope};
let savedEvidence;
async function evidence(){
 if(!savedEvidence)savedEvidence=(async()=>{
  const f=await collectionFixture({daily:true,allPaid:true,windowCounts:[2,1],paymentDelayMs:0});
  try{
   let monthly=await f.invoke('start');for(let n=0;monthly.status==='RUNNING'&&n<20;n++)monthly=await f.invoke('step');assert.equal(monthly.status,'COMPLETE');monthly=await f.invoke('ads');
   const publication=await readCompletedBusinessMonth(f.env,'2026-10',{now:f.now}),frames=publication.payload.slots.map(row=>row.frame),scope={publication_revision:publication.publication.source_revision,start_date:monthly.start_date,end_date:monthly.end_date,sources:frames.map(frame=>({run_id:frame.run_id,source_revision:frame.revision,start_date:frame.start_date,end_date:frame.end_date}))};
   const daily=buildDailyBusinessSummary(monthly,frames,scope,validators);assert.ok(daily);assert.ok(projectDailyBusinessSummary(daily,monthly,scope));return {monthly,frames,scope,daily};
  }finally{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();}
 })();
 return structuredClone(await savedEvidence);
}

function browser(value,{search='?date=2026-10-10&tab=overview',now='2026-10-26T12:00:00Z'}={}){
 const context=vm.createContext({URL,URLSearchParams,serialized:JSON.stringify(value)}),ids=[...businessDayBody().matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 vm.runInContext(`
 let clock=Date.parse(${JSON.stringify(now)});class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}globalThis.Date=ClockDate;
 function node(tag='div'){return {tag,textContent:'',dataset:{},attrs:{},children:[],disabled:false,value:'',max:'',open:false,append(...values){this.children.push(...values);},replaceChildren(...values){this.textContent='';this.children=[...values];},setAttribute(name,value){this.attrs[name]=String(value);}};}
 const controls=new Map(${JSON.stringify(ids)}.map(id=>[id,node()])),control=name=>controls.get('businessDay'+name),text=element=>element.textContent+element.children.map(text).join(' ');
 const document={getElementById:id=>controls.get(id)||null,createElement:tag=>node(tag)};
 globalThis.location=new URL('https://app.example.test/admin'+${JSON.stringify(search)});const historyCalls=[];globalThis.history={state:{keep:'owner'},replaceState(state,title,path){historyCalls.push({state,path});location=new URL(path,location);}};
 const input=JSON.parse(serialized),monthCalls=[];let selectMonthImpl=null;globalThis.brazaMonthDashboard={selectMonth(month){monthCalls.push(month);brazaDayDashboard.reset({month});return selectMonthImpl?selectMonthImpl(month):Promise.resolve(true);}};
 const show=()=>brazaDayDashboard.setContext(input.daily,{monthly:input.monthly,scope:input.scope,month:input.monthly.month});
 const choose=value=>{control('Date').value=value;return control('Date').onchange();};
 `+BUSINESS_DAY_CLIENT,context);
 const run=code=>vm.runInContext(code,context);
 return {context,run,text:name=>run('text(control('+JSON.stringify(name)+'))'),json:code=>JSON.parse(run('JSON.stringify('+code+')')),activate(){run("brazaDayDashboard.prepare();brazaDayDashboard.bootstrapState({phase:'READY'});show();");}};
}

test('daily overview has accessible day controls, a closed calculation and a responsive primary result',()=>{
 const html=businessDayBody(),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(ids.length,new Set(ids).size);
 assert.match(html,/<h2 id="businessDayTitle">Lucro estimado do dia<\/h2>/);assert.match(html,/Por pedidos criados neste dia \(Brasília\)/);
 assert.match(html,/for="businessDayDate"/);assert.match(html,/id="businessDayDate"[^>]*type="date"[^>]*disabled/);assert.match(html,/role="status" aria-live="polite"/);
 assert.doesNotMatch(html,/<details[^>]*\bopen\b/);assert.match(html,/não são descontadas novamente/);
 assert.match(BUSINESS_DAY_CSS,/@media\(max-width:640px\)/);assert.match(BUSINESS_DAY_CSS,/@media\(max-width:360px\)/);assert.match(BUSINESS_DAY_CSS,/minmax\(0,1fr\)/);
});

test('the selected date is the Brasília day, handles month links, and rejects future or invalid URL dates',async()=>{
 const data=await evidence();
 for(const [search,expected] of [['','2026-10-25'],['?date=2026-10-26','2026-10-25'],['?date=2026-02-30','2026-10-25'],['?date=2026-09-20&month=2026-10','2026-09-20'],['?month=2026-09','2026-10-25'],['?tab=overview&month=2026-09','2026-10-25'],['?tab=agent-finance&month=2026-09','2026-09-01'],['?month=2026-10','2026-10-25'],['?date=2026-10-10&date=2026-10-11','2026-10-25']]){
  const b=browser(data,{search,now:'2026-10-26T02:30:00Z'});assert.equal(b.run('brazaDayDashboard.prepare()'),true);assert.equal(b.run('brazaDayDashboard.getSelection()'),expected);assert.equal(b.run('control("Date").max'),'2026-10-25');assert.equal(b.run('control("Date").disabled'),true);assert.equal(b.run('monthCalls.length'),0);
 }
 const b=browser(data,{search:'',now:'2026-11-01T02:30:00Z'});b.activate();assert.equal(b.run('brazaDayDashboard.getSelection()'),'2026-10-31');await b.run('control("Yesterday").onclick()');assert.equal(b.run('brazaDayDashboard.getSelection()'),'2026-10-30');assert.equal(b.run('monthCalls.length'),0);
});

test('Today follows the natural Brasília rollover while explicit dates and historical Finance links stay fixed',async()=>{
 const data=await evidence(),now='2026-11-01T02:59:59Z';
 const following=browser(data,{search:'?tab=overview&month=2026-09',now});following.activate();
 assert.equal(following.run('brazaDayDashboard.getSelection()'),'2026-10-31');
 following.run('clock=Date.parse("2026-11-01T03:00:00Z");');
 assert.equal(following.run('brazaDayDashboard.getSelection()'),'2026-11-01');
 assert.equal(following.run('brazaDayDashboard.getSnapshot().net_cents'),null,'yesterday’s publication cannot become today’s profit');
 assert.equal(following.run('show()'),false,'an October response arriving after the rollover cannot restore October values');
 assert.equal(following.run('monthCalls.length'),0,'synchronizing the local day never creates a new read or timer');
 assert.equal(following.run('location.searchParams.has("date")'),false,'Today remains relative after a reload');
 for(const search of ['?tab=overview&date=2026-10-31','?tab=agent-finance&month=2026-09']){
  const b=browser(data,{search,now});b.activate();const selected=b.run('brazaDayDashboard.getSelection()');b.run('clock=Date.parse("2026-11-01T03:00:00Z");');
  assert.equal(b.run('brazaDayDashboard.getSelection()'),selected,'a custom date or historical month must not advance overnight');
 }
 const chosen=browser(data,{now,search:'?date=2026-10-10'});chosen.activate();await chosen.run('control("Today").onclick()');chosen.run('clock=Date.parse("2026-11-01T03:00:00Z");');
 assert.equal(chosen.run('brazaDayDashboard.getSelection()'),'2026-11-01','the Today button explicitly restores relative selection');
});

test('same-month date changes use only saved day values, preserve source times and never create a fetch or polling loop',async()=>{
 const data=await evidence(),b=browser(data);b.activate();const ten=data.daily.days[9];
 assert.equal(b.run('control("Date").disabled'),false);assert.match(b.text('Net'),new RegExp((ten.estimate_cents/100).toFixed(2).replace('.',',')));assert.equal(b.text('Paid'),'2');assert.match(b.text('NetLabel'),/repasse base informado/);
 assert.match(b.text('Allocation'),/31 dias.*DAS mensal.*Despesas mensais.*conta mensal desconta o valor completo/);
 assert.match(b.text('Pending'),/data informada pela Shopee.*fuso ainda não foi confirmado.*não identifica quais pedidos/);
 const times=b.text('Sources');await b.run('choose("2026-10-20")');assert.equal(b.text('Paid'),'1');await b.run('choose("2026-10-10")');assert.equal(b.text('Sources'),times);
 assert.equal(b.run('monthCalls.length'),0);assert.equal(b.run('typeof fetch'),'undefined');assert.equal(b.run('typeof setTimeout'),'undefined');assert.equal(b.run('typeof setInterval'),'undefined');
 assert.equal(b.run('location.searchParams.get("date")'),'2026-10-10');assert.equal(b.run('location.searchParams.get("month")'),'2026-10');assert.equal(b.run('location.searchParams.get("tab")'),'overview');assert.deepEqual(b.json('historyCalls.at(-1).state'),{keep:'owner'});
 assert.equal(await b.run('choose("2026-10-27")'),false);assert.equal(b.run('control("Date").value'),'2026-10-10');assert.match(b.text('Status'),/data válida/);assert.equal(b.run('monthCalls.length'),0);
});

test('confirmed empty days show their negative fixed-cost estimate while uncovered dates never become zero',async()=>{
 const b=browser(await evidence());b.activate();await b.run('choose("2026-10-11")');assert.match(b.text('Net'),/-R\$\s*4,42/);assert.equal(b.run('control("Result").dataset.negative'),'true');assert.match(b.text('Sales'),/R\$\s*0,00/);assert.equal(b.text('Paid'),'0');
 assert.match(b.text('Status'),/Nenhum pedido nesta data\. Corte da consulta:/);assert.doesNotMatch(b.text('Status'),/financeiros: Não consultado/);assert.match(b.text('Sources'),/Nenhum pedido nesta data/);
 await b.run('control("Today").onclick()');assert.equal(b.run('brazaDayDashboard.getSelection()'),'2026-10-26');assert.equal(b.text('Net'),'Em apuração');assert.equal(b.text('Sales'),'—');assert.match(b.text('Help'),/coleta salva ainda não cobre esta data/);assert.equal(b.run('monthCalls.length'),0);
 await b.run('choose("2026-10-24")');assert.match(b.text('Status'),/Leitura parcial/,'partial coverage follows the saved original cutoff even when that day is now in the past');
});

test('incomplete production is labelled as a known-cost subtotal and legacy history stays unavailable',async()=>{
 const data=await evidence();data.monthly.product_summary=null;assert.ok(projectBusinessMonth(data.monthly));data.daily=buildDailyBusinessSummary(data.monthly,data.frames,data.scope,validators);assert.ok(data.daily);const b=browser(data);b.activate();
 assert.equal(b.text('NetLabel'),'Saldo após custos conhecidos');assert.equal(b.text('Badge'),'Custos incompletos');assert.match(b.text('Help'),/não representa o lucro completo do dia/);assert.match(b.text('Waterfall'),/Produção com custo identificado.*Saldo após custos conhecidos/);
 const legacy=await evidence();delete legacy.frames[0].daily_breakdown;legacy.daily=buildDailyBusinessSummary(legacy.monthly,legacy.frames,legacy.scope,validators);assert.ok(legacy.daily);const old=browser(legacy);old.activate();assert.equal(old.text('Net'),'Em apuração');assert.equal(old.text('Sales'),'Não informado');assert.match(old.text('Help'),/próxima coleta compatível/);assert.doesNotMatch(old.text('Waterfall'),/Lucro estimado do dia R\$\s*0,00/);
});

test('unconfirmed monthly expenses expose a separate subtotal without inventing daily profit or hiding the known DAS',async()=>{
 const data=await evidence();
 data.monthly.expenses={revision:0,external_expenses_cents:null,recharge_treatment:'UNCONFIRMED',updated_at:null};
 data.monthly.result={...data.monthly.result,net_estimate_cents:null,net_margin_bps:null,pending:[...new Set([...data.monthly.result.pending,'EXTERNAL_EXPENSES_REQUIRED'])]};
 assert.ok(projectBusinessMonth(data.monthly));data.daily=buildDailyBusinessSummary(data.monthly,data.frames,data.scope,validators);assert.ok(data.daily);
 const b=browser(data);b.activate();const original=data.daily.days[9],expected=original.operating_balance_cents-original.allocated_das_cents;
 assert.equal(b.run('brazaDayDashboard.getSnapshot().net_cents'),null);
 assert.equal(b.run('brazaDayDashboard.getSnapshot().presentation.amount_cents'),expected);
 assert.equal(b.run('brazaDayDashboard.getSnapshot().presentation.expenses_included'),false);
 assert.equal(b.run('brazaDayDashboard.getSnapshot().presentation.das_included'),true);
 assert.match(b.text('NetLabel'),/Saldo parcial antes das despesas mensais/);assert.match(b.text('Help'),/DAS já foi descontada.*Confirme as despesas.*não representa o lucro completo/);
 assert.match(b.text('Waterfall'),/Parcela diária das despesas mensais Não informado.*Saldo parcial antes das despesas mensais/);
 assert.equal(b.run('brazaDayDashboard.getTrend().points.at(-1).net_cents'),null,'the subtotal is never a net-profit chart point');
});

test('a date in another month asks the existing monthly reader once and keeps the latest chosen day',async()=>{
 const b=browser(await evidence());b.activate();b.run('selectMonthImpl=()=>new Promise(resolve=>globalThis.finishMonth=resolve);globalThis.first=choose("2026-09-20");globalThis.second=choose("2026-09-21");');
 assert.equal(b.run('first===second'),true);assert.deepEqual(b.json('monthCalls'),['2026-09']);assert.equal(b.text('Net'),'Em apuração');assert.match(b.text('Status'),/Consultando o resumo salvo de 09\/2026/);
 assert.equal(b.run('show()'),false,'a late October context cannot replace the requested September date');
 b.run('brazaDayDashboard.setContext(null,{month:"2026-09",monthly:{month:"2026-09"},scope:null});finishMonth(true);');assert.equal(await b.run('first'),true);assert.equal(b.run('brazaDayDashboard.getSelection()'),'2026-09-21');assert.equal(b.run('control("Date").value'),'2026-09-21');assert.doesNotMatch(b.text('Status'),/Consultando/);
 await b.run('choose("2026-09-22")');assert.equal(b.run('monthCalls.length'),1,'a valid monthly response without daily detail also stays local');
});

test('failed or rejected month reads release their pending request and allow a retry after the real reset ordering',async()=>{
 for(const failure of ['false','reject']){
  const b=browser(await evidence());b.activate();b.run('selectMonthImpl=()=>new Promise((resolve,reject)=>{globalThis.finishMonth=resolve;globalThis.rejectMonth=reject;});globalThis.first=choose("2026-09-20");globalThis.second=choose("2026-09-21");');
  b.run(failure==='false'?'finishMonth(false)':'rejectMonth(Error("PRIVATE_RESPONSE"))');assert.equal(await b.run('first'),false);assert.equal(await b.run('second'),false);assert.match(b.text('Status'),/Não foi possível abrir o mês escolhido/);assert.doesNotMatch(b.text('Status'),/PRIVATE_RESPONSE/);
  b.run('globalThis.retry=choose("2026-09-21");');assert.deepEqual(b.json('monthCalls'),['2026-09','2026-09']);assert.match(b.text('Status'),/Consultando/);
  b.run('brazaDayDashboard.setContext(null,{month:"2026-09",monthly:{month:"2026-09"},scope:null});finishMonth(true);');assert.equal(await b.run('retry'),true);assert.equal(b.run('brazaDayDashboard.getSelection()'),'2026-09-21');assert.equal(b.run('control("Status").dataset.error'),'false');
 }
});

test('rapid changes between months and a manual month reset ignore late failures and late foreign contexts',async()=>{
 const b=browser(await evidence());b.activate();b.run('const releases=[];selectMonthImpl=()=>new Promise(resolve=>releases.push(resolve));globalThis.september=choose("2026-09-20");globalThis.august=choose("2026-08-15");globalThis.october=choose("2026-10-10");');
 assert.deepEqual(b.json('monthCalls'),['2026-09','2026-08','2026-10']);assert.equal(b.run('show()'),true);b.run('releases[2](true);');assert.equal(await b.run('october'),true);const result=b.text('Net');b.run('releases[0](false);releases[1](false);');assert.equal(await b.run('september'),false);assert.equal(await b.run('august'),false);assert.equal(b.text('Net'),result);assert.equal(b.run('control("Status").dataset.error'),'false');
 assert.equal(b.run('brazaDayDashboard.setContext(null,{month:"2026-09",monthly:{month:"2026-09"},scope:null})'),false);assert.equal(b.run('brazaDayDashboard.getSelection()'),'2026-10-10');
 b.run('globalThis.pending=choose("2026-09-20");brazaDayDashboard.reset({month:"2026-08"});brazaDayDashboard.setContext(null,{month:"2026-08",monthly:{month:"2026-08"},scope:null});releases[3](false);');assert.equal(await b.run('pending'),false);assert.equal(b.run('brazaDayDashboard.getSelection()'),'2026-08-01');assert.equal(b.run('control("Status").dataset.error'),'false');
});

test('bootstrap failures expose only the shared category and logout cannot restore or request financial values',async()=>{
 const b=browser(await evidence());b.run('brazaDayDashboard.prepare();brazaDayDashboard.bootstrapState({phase:"FAILED",failureKind:"TIMEOUT",message:"PRIVATE_PAYLOAD"});');assert.match(b.text('Status'),/consulta demorou mais/);assert.doesNotMatch(b.text('Status'),/PRIVATE_PAYLOAD/);assert.equal(b.run('control("Today").disabled'),true);
 b.run('let accessed=false;const invalid={phase:"FAILED"};Object.defineProperty(invalid,"failureKind",{get(){accessed=true;throw Error("PRIVATE");}});brazaDayDashboard.bootstrapState(invalid);');assert.equal(b.run('accessed'),false);assert.match(b.text('Status'),/Não foi possível abrir o painel/);
 b.activate();b.run('selectMonthImpl=()=>new Promise(resolve=>globalThis.finishMonth=resolve);globalThis.pending=choose("2026-09-20");brazaDayDashboard.stop();finishMonth(true);');assert.equal(await b.run('pending'),false);assert.equal(b.run('show()'),false);assert.equal(b.run('brazaDayDashboard.bootstrapState({phase:"READY"})'),false);assert.equal(await b.run('choose("2026-10-10")'),false);assert.equal(b.run('monthCalls.length'),1);assert.equal(b.text('Net'),'Em apuração');assert.match(b.text('Status'),/Sessão encerrada/);assert.equal(b.run('control("Date").disabled'),true);
});

test('an incompatible daily snapshot clears prior values without exposing rejected payloads or changing monthly state',async()=>{
 const b=browser(await evidence());b.activate();b.run('input.daily.publication_revision++;input.daily.PRIVATE_ACCESS_TOKEN="private";');assert.equal(b.run('show()'),false);assert.equal(b.text('Net'),'Em apuração');assert.equal(b.text('Sales'),'—');assert.match(b.text('Help'),/resumo mensal continua disponível/);assert.doesNotMatch(b.text('Status'),/PRIVATE|private/);assert.equal(b.run('monthCalls.length'),0);
 assert.equal(b.run('brazaDayDashboard.setContext(null,{month:"2026-10",monthly:input.monthly,scope:null})'),false);assert.equal(b.run('control("Status").dataset.error'),'false');assert.match(b.text('Status'),/dados compatíveis/);
});

test('daily BRL presentation keeps every cent at the positive and negative safe-integer boundaries',()=>{
 const start=BUSINESS_DAY_CLIENT.indexOf(' const money='),end=BUSINESS_DAY_CLIENT.indexOf('\n const day=',start);assert.ok(start>=0&&end>start);const context=vm.createContext();vm.runInContext(BUSINESS_DAY_CLIENT.slice(start,end),context);
 assert.match(vm.runInContext('money(Number.MAX_SAFE_INTEGER)',context),/^R\$\s*90\.071\.992\.547\.409,91$/);assert.match(vm.runInContext('money(Number.MIN_SAFE_INTEGER)',context),/^-R\$\s*90\.071\.992\.547\.409,91$/);assert.equal(vm.runInContext('money(null)',context),'Não informado');assert.match(vm.runInContext('money(0)',context),/^R\$\s*0,00$/);
});
