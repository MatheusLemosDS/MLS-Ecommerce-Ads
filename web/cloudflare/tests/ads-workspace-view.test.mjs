import test from 'node:test';
import assert from 'node:assert/strict';
import {getAdsCalendar} from '../src/ads-calendar.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {ADS_WORKSPACE_CSS,renderAdsWorkspace} from '../src/ads-workspace-view.mjs';
import {shellDesktopNavigation,shellMobileNavigation,SHELL_NAVIGATION_CSS} from '../src/shell-navigation.mjs';

const now=Date.UTC(2026,10,2,12),selection={start_date:'2026-10-01',end_date:'2026-10-31'};
function days(start,end){return Array.from({length:(Date.parse(end)-Date.parse(start))/86400000+1},(_,index)=>new Date(Date.parse(start)+index*86400000).toISOString().slice(0,10));}
function source(part,{expense=1,missing=false}={}){
 const dates=days(part.start_date,part.end_date);
 return {status:'ok',connected:true,shop:{id:1178167501},period:part,balance:'31.07',daily:dates.filter(date=>!missing||date!=='2026-10-17').map(date=>({date,expense,broad_gmv:10,broad_order:2,broad_roas:'19.28',direct_gmv:5,direct_order:1,direct_roas:'8.01'})),private_token:'PRIVATE_SOURCE_TOKEN',private_html:'<img src=x onerror=alert(1)>'};
}
async function calendar(options={}){
 return getAdsCalendar({APP_INTERNAL_SECRET:'FIXTURE_NOT_EXPORTED'},selection,{now:()=>now,fetchImpl:async request=>{
  const url=new URL(request.url),iso=value=>value.slice(6)+'-'+value.slice(3,5)+'-'+value.slice(0,2),part={start_date:iso(url.searchParams.get('start_date')),end_date:iso(url.searchParams.get('end_date'))};
  return Response.json(source(part,options));
 }});
}
const clean=html=>html.replace(/<style>[\s\S]*?<\/style>/g,'');
const full=await calendar();

test('monthly dashboard displays one set of account metrics for all 31 days and places daily evidence in one disclosure',()=>{
 const html=clean(renderAdsWorkspace('/dashboard',{ads:{calendar:full},content:'DUPLICATE_OLD_CARDS',now}));
 assert.equal((html.match(/data-ads-metric=/g)||[]).length,4);assert.ok(!html.includes('DUPLICATE_OLD_CARDS'));
 for(const expected of ['outubro de 2026','01/10/2026 a 31/10/2026','R$ 31,00','R$ 310,00','10,00x','62','name="month" value="2026-10"','/admin?tab=overview&amp;month=2026-10','name="start_date" value="2026-10-01"','name="end_date" value="2026-10-31"'])assert.ok(html.includes(expected),expected);
 assert.equal((html.match(/data-ads-details="source"/g)||[]).length,1);assert.ok(html.includes('<details class="ads-workspace-details" data-ads-details="source">'));
 assert.equal((html.match(/<tbody>[\s\S]*?<\/tbody>/g)||[]).length,1);assert.equal((html.match(/<tr><td>/g)||[]).length,31);
 assert.ok(html.includes('Por dia, na tabela abaixo'));assert.ok(html.includes('19,28x'));assert.ok(html.includes('O crédito disponível não é o gasto'));assert.ok(!html.includes('lucro de'));
});

test('fresh monthly spend updates the ratio of totals while source daily ROAS remains independent',async()=>{
 const updated=await calendar({expense:2}),html=clean(renderAdsWorkspace('/dashboard',{ads:{calendar:updated},now}));
 assert.ok(html.includes('R$ 62,00'));assert.ok(html.includes('R$ 310,00'));assert.ok(/data-ads-metric="roas"[\s\S]*?<strong>5,00x<\/strong>/.test(html));assert.ok(html.includes('19,28x'));
 assert.ok(!/data-ads-metric="roas"[\s\S]*?<strong>19,28x<\/strong>/.test(html));
});

test('missing expense day keeps total and period ROAS pending rather than using a partial month as a complete zero',async()=>{
 const partial=await calendar({missing:true}),html=clean(renderAdsWorkspace('/dashboard',{ads:{calendar:partial},now}));
 assert.equal(partial.status,'PARTIAL');assert.ok(/data-ads-metric="spend"[\s\S]*?<strong>—<\/strong>/.test(html));assert.ok(/data-ads-metric="roas"[\s\S]*?<strong>—<\/strong>/.test(html));assert.ok(html.includes('30 de 31 dias'));assert.ok(html.includes('Gasto conhecido: R$ 30,00'));assert.ok(!html.includes('R$ 0,00'));
});

test('unavailable or poisoned calendar never falls back to a different legacy range or exposes private source fields',()=>{
 const legacySelection={start_date:'2026-10-21',end_date:'2026-10-21'},legacy=buildAdsMeasurement(source(legacySelection),legacySelection,now/1000);
 for(const ads of [{calendar:null,measurement:legacy},{calendar:{...full,private_token:'PRIVATE_CANONICAL_TOKEN'},measurement:legacy},{calendar:{...full,expense_cents:0},measurement:legacy},null]){
  const html=clean(renderAdsWorkspace('/dashboard',{ads,now}));assert.ok(html.includes('Não foi possível atualizar'));assert.ok(!html.includes('data-ads-metric='));assert.ok(!html.includes('PRIVATE_'));assert.ok(!html.includes('<img'));assert.ok(html.includes('type="month"'));assert.ok(html.includes('Ver custos e líquido da loja'));
 }
 const valid=clean(renderAdsWorkspace('/dashboard',{ads:{calendar:full},now}));for(const marker of ['PRIVATE_SOURCE_TOKEN','PRIVATE_CANONICAL_TOKEN','FIXTURE_NOT_EXPORTED','onerror='])assert.ok(!valid.includes(marker),marker);
 const old=clean(renderAdsWorkspace('/dashboard',{ads:{measurement:legacy},now}));assert.ok(old.includes('data-ads-metric="spend"'));assert.ok(old.includes('21/10/2026'));
});

test('campaign page only renders its own supplied campaign view and two type links without account totals or month controls',()=>{
 for(const view of ['product','gmv-max']){
  const html=clean(renderAdsWorkspace('/campaigns',{ads:{calendar:full},view,content:'<table data-fixture="campaigns"><tbody><tr><td>Escaped campaign</td></tr></tbody></table>',now}));
  assert.ok(html.includes('data-fixture="campaigns"'));assert.ok(!html.includes('data-ads-metric='));assert.ok(!html.includes('type="month"'));assert.equal((html.match(/aria-current="page"/g)||[]).length,1);assert.ok(html.includes('href="/campaigns?view='+view+'" aria-current="page"'));assert.ok(!html.includes('R$ 31,00'));
 }
});

test('automation, opportunities and connections have distinct content and do not reintroduce the account measurement',()=>{
 const auto=clean(renderAdsWorkspace('/optimization',{ads:{calendar:full},content:'<section data-fixture="readiness">Ready checks</section>',opportunityContent:'<section data-fixture="opportunities">Proposals</section>',now}));
 assert.ok(auto.includes('data-fixture="readiness"'));assert.ok(auto.includes('data-fixture="opportunities"'));assert.ok(auto.includes('Conferir o resultado da loja'));assert.ok(auto.includes('/admin?tab=roadmap'));assert.ok(!auto.includes('data-ads-metric='));assert.ok(!auto.includes('type="month"'));
 const settings=clean(renderAdsWorkspace('/integrations',{ads:{calendar:full},content:'<section data-fixture="connections">Connection status</section>',now}));assert.ok(settings.includes('data-fixture="connections"'));assert.ok(!settings.includes('data-ads-metric='));assert.ok(!settings.includes('readiness'));assert.ok(!settings.includes('type="month"'));
 const invalid=clean(renderAdsWorkspace('/dashboard" onclick="alert(1)',{ads:{calendar:full},content:'PRIVATE_OTHER_ROUTE',now}));assert.ok(!invalid.includes('onclick='));assert.ok(!invalid.includes('PRIVATE_OTHER_ROUTE'));
});

test('desktop and mobile share three primary destinations with finance and secondary connections, and old aliases select their canonical destination',()=>{
 for(const render of [shellDesktopNavigation,shellMobileNavigation]){
  const html=render('/campaigns');for(const route of ['/dashboard','/campaigns','/optimization','/integrations','/admin'])assert.ok(html.includes('href="'+route+'"'),route);
  for(const route of ['/advertising','/performance','/gmv-max','/opportunities'])assert.ok(!html.includes('href="'+route+'"'),route);
  for(const label of ['Resumo mensal','Campanhas','Automação','Conexões e configurações'])assert.ok(html.includes(label),label);
  assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  for(const [alias,canonical] of [['/advertising','/dashboard'],['/performance','/dashboard'],['/gmv-max','/campaigns'],['/opportunities','/optimization']])assert.ok(render(alias).includes('href="'+canonical+'" aria-current="page"'));
 }
 const mobile=shellMobileNavigation('/dashboard');assert.ok(mobile.includes('href="/logout"'));assert.ok(mobile.includes('data-braza-theme-toggle'));assert.ok(mobile.includes('>Minha loja<'));assert.ok(mobile.includes('<details class="mobile-menu">'));
});

test('workspace keeps mobile tables locally scrollable, large touch controls and light/dark theme variables',()=>{
 for(const value of ['overflow-x:auto','overscroll-behavior-x:contain','min-height:44px','@media(max-width:600px)','grid-template-columns:repeat(2,minmax(0,1fr))','var(--surface)','var(--text)','var(--muted)','var(--line)','var(--accent)'])assert.ok(ADS_WORKSPACE_CSS.includes(value),value);
 assert.ok(SHELL_NAVIGATION_CSS.includes('max-height:55dvh'));assert.ok(!SHELL_NAVIGATION_CSS.includes('float:'));
 const html=clean(renderAdsWorkspace('/dashboard',{ads:{calendar:full},now}));assert.ok(html.includes('role="region" tabindex="0" aria-label="Resultados de anúncios por dia"'));assert.equal((html.match(/<th scope="col">/g)||[]).length,6);
});
