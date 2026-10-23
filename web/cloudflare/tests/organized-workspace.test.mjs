import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {adminBody,loginBody,CSS} from '../src/admin-view.mjs';
import {CLIENT} from '../src/admin-client.mjs';
import {businessMonthBody} from '../src/business-month-view.mjs';

function navigation(search=''){
 const context=vm.createContext({URL,URLSearchParams});
 const html=adminBody(),tabs=[...html.matchAll(/data-tab="([^"]+)"/g)].map(match=>match[1]);
 const start=CLIENT.indexOf('function workspaceTabFromLocation()'),end=CLIENT.indexOf("document.addEventListener('visibilitychange'",start);
 assert.ok(start>=0&&end>start);
 new vm.Script(`
 let state=null,observations=0,syncs=0;
 const loadObservations=()=>observations++,syncOnProductsOpen=()=>syncs++;
 function item(tab){return {dataset:{tab},attrs:{},classList:{active:false,toggle(name,value){this[name]=value;}},setAttribute(name,value){this.attrs[name]=value;},removeAttribute(name){delete this.attrs[name];}};}
 const links=${JSON.stringify(tabs)}.map(item),sections=['overview','products','margins','hermes','history','roadmap'].map(id=>({id,hidden:id!=='overview'}));
 const controls=new Map([['pageTitle',{textContent:''}],['pageSubtitle',{textContent:''}]]),el=id=>controls.get(id);
 const menus=[{dataset:{},open:true,querySelector(){return links.find(link=>['hermes','history','roadmap'].includes(link.dataset.tab)&&link.attrs['aria-current']==='page');}}];
 const document={documentElement:{dataset:{}},querySelectorAll(selector){return selector==='.workspace > section'?sections:selector==='[data-tab]'?links:selector==='.workspace-more'?menus:[];}};
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
 assert.match(CSS,/\.app-shell>\.sidebar\{display:none\}/);assert.match(CSS,/safe-area-inset-bottom/);
});

test('monthly overview puts four metrics before the explanation and product list, with preparation secondary',()=>{
 const body=businessMonthBody();assert.equal([...body.matchAll(/class="month-metric(?: month-net)?"/g)].length,4);
 assert.ok(body.indexOf('businessMonthSalesCard')<body.indexOf('businessMonthCalculationTitle'));
 assert.ok(body.indexOf('id="businessMonthCalculationTitle"')<body.indexOf('id="businessMonthProductsTitle"'));
 assert.ok(body.indexOf('id="businessMonthProductsTitle"')<body.indexOf('id="businessMonthReadinessTitle"'));
 assert.match(body,/<details class="month-subsection month-readiness-details">/);assert.doesNotMatch(body,/<details class="month-subsection month-readiness-details"[^>]*\bopen\b/);
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
