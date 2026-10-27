import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {adminBody,loginBody,CSS} from '../src/admin-view.mjs';
import {CLIENT} from '../src/admin-client.mjs';
import {businessMonthBody} from '../src/business-month-view.mjs';

function detailAncestors(html){
 const open=[],result=new Map();
 for(const token of html.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/gi)){
  const [,closing,tag,attrs]=token;
  if(closing){if(tag.toLowerCase()==='details')open.pop();continue;}
  const id=/\bid="([^"]+)"/.exec(attrs)?.[1];if(id)result.set(id,[...open]);
  if(tag.toLowerCase()==='details')open.push(id||/\bclass="([^"]+)"/.exec(attrs)?.[1]||'anonymous');
 }
 assert.equal(open.length,0,'detail sections must remain balanced');return result;
}

function navigation(search=''){
 const context=vm.createContext({URL,URLSearchParams});
 const html=adminBody(),tabs=[...html.matchAll(/data-tab="([^"]+)"/g)].map(match=>match[1]);
 const start=CLIENT.indexOf('function workspaceTabFromLocation()'),end=CLIENT.indexOf("document.addEventListener('visibilitychange'",start);
 assert.ok(start>=0&&end>start);
 new vm.Script(`
 let state=null,csrf='',observations=0,syncs=0,settingsLoads=0;
 const loadObservations=()=>observations++,syncOnProductsOpen=()=>syncs++,loadSettings=async()=>{settingsLoads++;return false;};
 function item(tab){return {dataset:{tab},attrs:{},classList:{active:false,toggle(name,value){this[name]=value;}},setAttribute(name,value){this.attrs[name]=value;},removeAttribute(name){delete this.attrs[name];}};}
 let agentScrollCount=0; const agentLinks=[{onclick:null},{onclick:null}];
 const links=${JSON.stringify(tabs)}.map(item),sections=['overview','agents','agent-finance','agent-ads','agent-products','agent-production','agent-returns','agent-auditor','agent-hermes','products','margins','hermes','history','roadmap'].map(id=>({id,hidden:id!=='overview'}));
 const controls=new Map([['pageTitle',{textContent:''}],['pageSubtitle',{textContent:''}]]),el=id=>controls.get(id);
 const menus=[{dataset:{},open:true,querySelector(){return links.find(link=>['hermes','history','roadmap'].includes(link.dataset.tab)&&link.attrs['aria-current']==='page');}}];
 const handlersDoc={};const document={documentElement:{dataset:{}},addEventListener(name,fn){handlersDoc[name]=fn;},querySelectorAll(selector){return selector==='.workspace > section'?sections:selector==='[data-tab]'?links:selector==='.workspace-more'?menus:selector==='[data-workspace-key="agents"]'?agentLinks:[];},getElementById(id){return id==='commandAgents'?{scrollIntoView(){agentScrollCount++;}}:null;}};
 globalThis.location=new URL('https://app.example.test/admin'+${JSON.stringify(search)});const historyCalls=[],handlers={};
 globalThis.history={pushState(state,title,path){historyCalls.push({state,path});globalThis.location=new URL(path,globalThis.location);}};
 globalThis.addEventListener=(name,callback)=>handlers[name]=callback;
 `+CLIENT.slice(start,end)).runInContext(context);
 const run=code=>new vm.Script(code).runInContext(context);
 return {run,json:code=>JSON.parse(run('JSON.stringify('+code+')'))};
}

test('one login form covers the whole workspace and does not send the owner to a second login',()=>{
 const html=loginBody('');assert.equal([...html.matchAll(/<form\b/g)].length,1);assert.match(html,/action="\/login"/);
 assert.match(html,/name="username"/);assert.match(html,/name="password"/);assert.doesNotMatch(html,/href="\/dashboard"|action="\/admin\/login"/);
 assert.match(loginBody('denied'),/role="alert"/);
});

test('owner workspace keeps one shared navigation, intact controls and advanced finance closed',()=>{
 const body=adminBody(),ids=[...body.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);assert.equal(ids.length,new Set(ids).size);
 for(const id of ['productionCostsForm','bindingsForm','settings','controls','logout','connection','pageTitle','pageSubtitle','legacyFinanceDetails'])assert.ok(ids.includes(id),id);
 assert.equal([...body.matchAll(/<nav class="workspace-nav"/g)].length,1);assert.equal([...body.matchAll(/workspace-nav workspace-nav-mobile/g)].length,1);
 assert.match(body,/<form[^>]*id="logout" hidden>/);assert.doesNotMatch(body,/id="legacyFinanceDetails"[^>]*\bopen\b|class="sidebar-external"|class="ads-shortcut"/);
 assert.match(body,/id="legacyFinanceDetails"[^>]*\bhidden\b/,'the obsolete per-order tax estimate cannot compete with the current monthly MEI result');
 assert.match(CSS,/\.app-shell>\.sidebar\{display:none\}/);assert.match(CSS,/safe-area-inset-bottom/);
});

test('command center leads the overview, followed by daily profit and the monthly result',()=>{
 const html=adminBody();assert.ok(html.indexOf('id="commandCenter"')<html.indexOf('id="businessDay"'));assert.ok(html.indexOf('id="businessDay"')<html.indexOf('id="businessMonth"'));assert.ok(html.indexOf('id="businessMonth"')<html.indexOf('id="legacyFinanceDetails"'));assert.match(html,/id="commandAgents"/);assert.match(html,/MLS Hermes/);
 const body=businessMonthBody();assert.equal([...body.matchAll(/class="month-metric(?: month-net)?"/g)].length,4);
 assert.match(body,/Resultado do mês/);assert.ok(body.indexOf('businessMonthNetCard')<body.indexOf('businessMonthSalesCard'));
 assert.ok(body.indexOf('businessMonthSalesCard')<body.indexOf('businessMonthCalculationTitle'));
 assert.ok(body.indexOf('id="businessMonthCalculationTitle"')<body.indexOf('id="businessMonthProductsTitle"'));
 assert.ok(body.indexOf('id="businessMonthProductsTitle"')<body.indexOf('id="businessMonthReadinessTitle"'));
 assert.match(body,/<details class="month-subsection month-readiness-details">/);assert.doesNotMatch(body,/<details class="month-subsection month-readiness-details"[^>]*\bopen\b/);
});

test('monthly tools open independent closed sections while preserving all cost, product and reconciliation controls',()=>{
 const body=businessMonthBody(),ancestors=detailAncestors(body);
 for(const id of ['businessMonthCalculationDetails','businessMonthExpensesDetails','businessMonthProductsDetails','businessReconciliationDetails','businessEscrowReleasesDetails']){
  assert.deepEqual(ancestors.get(id),[],id+' must be reachable without opening an unrelated section');
  const tag=new RegExp('<details\\b[^>]*\\bid="'+id+'"[^>]*>').exec(body)?.[0];assert.ok(tag,id);assert.doesNotMatch(tag,/\bopen\b/);
 }
 for(const [button,label] of [['Expenses','Despesas e contas'],['Refunds','Devoluções e ajustes'],['Products','Produtos vendidos'],['Calculation','Ver cálculo do mês'],['Releases','Liberações da Shopee']])assert.match(body,new RegExp('<button[^>]*id="businessMonthOpen'+button+'"[^>]*>'+label+'</button>'));
 for(const id of ['businessMonthCostOverview','businessMonthCoverage','businessMonthWaterfall','businessMonthTaxSummary'])assert.deepEqual(ancestors.get(id),['businessMonthCalculationDetails']);
 for(const id of ['businessMonthExpensesForm','businessMonthExpensesValue','businessMonthExpensesSave','businessMonthExpensesZero','businessMonthRecharge'])assert.ok(ancestors.get(id)?.includes('businessMonthExpensesDetails'),id);
 for(const id of ['businessMonthProductSearch','businessMonthProductSort','businessMonthProductRows','businessMonthProductNext','businessMonthProductPrevious'])assert.ok(ancestors.get(id)?.includes('businessMonthProductsDetails'),id);
 assert.match(body,/Aluguel, funcionários e boletos/);assert.match(body,/Informar somente o total do mês/);
});

test('the separate Hermes monitor is closed and keeps the existing daily sales and Ads identifiers',()=>{
 const html=adminBody(),ancestors=detailAncestors(html);assert.match(html,/<details class="hermes-live-monitor"><summary>Monitoramento de hoje/);
 for(const id of ['storeDay','shopOrdersCount','shopOrders','shopOrdersCutoff','shopOrdersAge','todayAds','todayAdsTime'])assert.deepEqual(ancestors.get(id),['hermes-live-monitor'],id);
 assert.match(CSS,/\.hermes-live-monitor>summary/);assert.equal([...html.matchAll(/\bid="shopOrders"/g)].length,1);assert.equal([...html.matchAll(/\bid="todayAds"/g)].length,1);
});

test('direct tab URLs select the correct section and do not reload or discard the selected month',()=>{
 const b=navigation('?tab=margins&month=2026-09');assert.equal(b.run('document.documentElement.dataset.activePanel'),'margins');assert.deepEqual(b.json('sections.filter(section=>!section.hidden).map(section=>section.id)'),['margins']);assert.equal(b.run('historyCalls.length'),0);
 b.run("links.find(link=>link.dataset.tab==='products').onclick({button:0,preventDefault(){globalThis.prevented=true;}})");
 assert.equal(b.run('globalThis.prevented'),true);assert.equal(b.run('syncs'),1);assert.equal(b.run('location.searchParams.get("month")'),'2026-09');assert.equal(b.run('location.searchParams.get("tab")'),'products');assert.equal(b.run('historyCalls.length'),1);
 assert.ok(b.json("links.filter(link=>link.attrs['aria-current']==='page').map(link=>link.dataset.tab)").every(tab=>tab==='products'));
 b.run("location=new URL('https://app.example.test/admin?tab=history&month=2026-09');handlers.popstate()");assert.equal(b.run('document.documentElement.dataset.activePanel'),'history');assert.equal(b.run('historyCalls.length'),1);assert.equal(b.run('menus[0].dataset.active'),'true');assert.equal(b.run('menus[0].open'),false);
});

test('modified clicks keep ordinary link behavior and invalid or duplicate tabs fall back safely',()=>{
 const b=navigation('?tab=history&tab=products');assert.equal(b.run('document.documentElement.dataset.activePanel'),'overview');
 b.run("links.find(link=>link.dataset.tab==='products').onclick({ctrlKey:true,preventDefault(){throw Error('modified click must follow its href');}})");assert.equal(b.run('document.documentElement.dataset.activePanel'),'overview');assert.equal(b.run('syncs'),0);
 b.run("openTab('__proto__')");assert.equal(b.run('document.documentElement.dataset.activePanel'),'overview');assert.deepEqual(b.json('sections.filter(section=>!section.hidden).map(section=>section.id)'),['overview']);
});

test('agent cards navigate to independent workspaces, preserve back and restore tab from URL',()=>{
 const b=navigation('?tab=products');
 assert.equal(b.run('document.documentElement.dataset.activePanel'),'products');
 assert.equal(b.run('typeof handlersDoc.click'),'function');
 b.run("handlersDoc.click({button:0,target:{closest(){return {dataset:{missionOpen:'agent-finance'},target:''};}},preventDefault(){}})");
 assert.equal(b.run('document.documentElement.dataset.activePanel'),'agent-finance');
 assert.deepEqual(b.json('sections.filter(section=>!section.hidden).map(section=>section.id)'),['agent-finance']);
 assert.equal(b.run('globalThis.location.search'),'?tab=agent-finance');
 const current=b.json("links.filter(link=>link.attrs['aria-current']==='page').map(link=>link.dataset.tab)");
 assert.ok(current.includes('agents'));
 b.run("location=new URL('https://app.example.test/admin?tab=agent-returns');handlers.popstate()");
 assert.equal(b.run('document.documentElement.dataset.activePanel'),'agent-returns');
 assert.deepEqual(b.json('sections.filter(section=>!section.hidden).map(section=>section.id)'),['agent-returns']);
 b.run("handlersDoc.click({button:0,target:{closest(){return {dataset:{missionOpen:'agents'},target:''};}},preventDefault(){}})");
 assert.equal(b.run('document.documentElement.dataset.activePanel'),'agents');
 assert.deepEqual(b.json('sections.filter(section=>!section.hidden).map(section=>section.id)'),['agents']);
});

