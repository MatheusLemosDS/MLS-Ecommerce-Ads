import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceNavigation,workspaceSecondaryNavigation} from '../src/workspace-navigation.mjs';
import {adminBody,CSS} from '../src/admin-view.mjs';
import {CLIENT} from '../src/admin-client.mjs';
import {SAVED_CATALOG_CLIENT} from '../src/saved-catalog-view.mjs';
import {DTF_CLIENT} from '../src/dtf-view.mjs';
import {shellDesktopNavigation,shellMobileNavigation} from '../src/shell-navigation.mjs';
import {renderAdsWorkspace} from '../src/ads-workspace-view.mjs';
import {renderWorkspaceConnections} from '../src/scaling-preparation.mjs';
import {enhanceAdsPageHtml} from '../src/ads-presentation.mjs';

const primary=html=>html.match(/<nav class="workspace-nav[^"]*"[^>]*>([\s\S]*?)<\/nav>/)?.[1]||'';
const destinations=html=>[...html.matchAll(/href="([^"]*)"/g)].map(match=>match[1]);
const owner=['/admin?tab=overview','/admin?tab=agents','/admin?tab=products','/admin?tab=production','/dashboard','/optimization'];

test('owner has the same six main destinations and ordering on Admin, Ads, desktop and mobile',()=>{
 for(const active of ['overview','agents','products','production','/dashboard','/optimization']){
  for(const mobile of [false,true]){
   const html=workspaceNavigation(active,{role:'owner',mobile});
   assert.deepEqual(destinations(primary(html)),owner);
   assert.equal((primary(html).match(/aria-current="page"/g)||[]).length,1);
   for(const tab of ['overview','products','production'])assert.match(html,new RegExp('data-tab="'+tab+'" data-workspace-tab="'+tab+'"'));
  }
 }
 assert.deepEqual(destinations(primary(shellDesktopNavigation('/dashboard',{role:'owner'}))),owner);
 assert.deepEqual(destinations(primary(shellMobileNavigation('/dashboard',{role:'owner'}))),owner);
});

test('secondary work stays grouped without automatically opening a mobile overlay',()=>{
 const html=workspaceNavigation('/campaigns',{role:'owner'}),secondary=workspaceSecondaryNavigation('hermes',{role:'owner'});
 assert.ok(!destinations(primary(html)).includes('/campaigns'));
 for(const route of ['/admin?tab=agents','/admin?tab=margins','/campaigns','/admin?tab=hermes','/integrations','/admin?tab=history','/admin?tab=roadmap'])assert.ok(destinations(html).includes(route),route);
 assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
 assert.match(secondary,/<details class="workspace-more" data-active="true">/);
 assert.doesNotMatch(secondary,/<details[^>]*\bopen(?:\s|>)/);
 assert.match(secondary,/href="\/admin\?tab=hermes" aria-current="page"/);
});

test('restricted and unknown roles never receive privileged destinations or local Admin controls',()=>{
 for(const role of ['review','unknown','admin',undefined]){
  for(const render of [shellDesktopNavigation,shellMobileNavigation]){
   const html=render('/dashboard',{role});
   assert.doesNotMatch(html,/href="\/admin|data-tab=|data-workspace-tab=/);
   assert.deepEqual(destinations(primary(html)),['/dashboard','/campaigns','/optimization']);
   assert.ok(destinations(html).includes('/integrations'));
   assert.ok(destinations(html).includes('/logout'));
  }
 }
});

test('old routes resolve to one selected canonical destination and untrusted active strings are never rendered',()=>{
 for(const [alias,route] of [['/advertising','/dashboard'],['/performance','/dashboard'],['/gmv-max','/campaigns'],['/opportunities','/optimization']]){
  const html=workspaceNavigation(alias,{role:'review'});assert.ok(html.includes('href="'+route+'" aria-current="page"'));
 }
 for(const input of ['/admin?tab=products','products'])assert.match(workspaceNavigation(input),/href="\/admin\?tab=products" aria-current="page"/);
 const poison='"><img src=x onerror=alert(1)>';
 assert.doesNotMatch(workspaceNavigation(poison,{role:poison}),/onerror=|<img/);
});

test('every restricted Ads route and presentation omits financial navigation while owners retain contextual access',()=>{
 for(const role of ['review','unknown']){
  for(const route of ['/dashboard','/campaigns','/optimization','/integrations']){
   const content=route==='/integrations'?renderWorkspaceConnections({connected:true},{role}):'';
   const rendered=renderAdsWorkspace(route,{role,content});
   assert.doesNotMatch(rendered,/<a[^>]*href="\/admin/);
   assert.doesNotMatch(rendered,/shopee\/finance\/connect/);
  }
 }
 const ownerDashboard=renderAdsWorkspace('/dashboard',{role:'owner'});
 assert.match(ownerDashboard,/<a[^>]*href="\/admin\?tab=overview/);
 assert.match(renderWorkspaceConnections({connected:true},{role:'owner'}),/<a[^>]*href="\/admin\?tab=overview/);
 assert.match(renderWorkspaceConnections({connected:true},{role:'owner'}),/href="https:\/\/auth\.brazacommerce\.com\.br\/shopee\/finance\/connect" target="_blank" rel="noopener noreferrer"/);
 const presentation=enhanceAdsPageHtml('<html><head></head><body><main class="main"><div class="top"><div><h1>Advertising</h1></div><div class="system">System Online</div></div></main></body></html>');
 assert.doesNotMatch(presentation,/<a[^>]*href="\/admin/);
 assert.doesNotMatch(presentation,/class="ads-source-banner"/);
});

test('agent destination is always visible on mobile and uses an overview route rather than a hidden hash-only tab',()=>{
 const mobile=workspaceNavigation('overview',{role:'owner',mobile:true});
 const desktop=workspaceNavigation('overview',{role:'owner'});
 assert.match(primary(mobile),/data-workspace-key="agents"/);
 assert.match(primary(desktop),/data-workspace-key="agents"/);
 assert.match(primary(mobile),/href="\/admin\?tab=agents"/);
 assert.match(primary(mobile),/data-tab="agents"/);
 assert.doesNotMatch(workspaceSecondaryNavigation('overview'),/data-workspace-key="agents"/);
});

test('agent subpages preserve the fleet as selected and never expose owner navigation to review roles',()=>{
 for(const tab of ['agents','agent-finance','agent-ads','agent-products','agent-production','agent-returns','agent-auditor','agent-hermes']){
  const html=workspaceNavigation('/admin?tab='+tab,{role:'owner'});
  assert.match(html,/aria-current="page" data-workspace-key="agents"/);
  assert.equal((primary(html).match(/aria-current="page"/g)||[]).length,1);
 }
 const restricted=workspaceNavigation('agents',{role:'review'});
 assert.doesNotMatch(restricted,/data-workspace-key="agents"|\/admin\?tab=agent-/);
});

test('Mission Control V3.5 has one keyboard navigation palette with only existing owner destinations',()=>{
 const html=adminBody(),sources=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(sources.length,new Set(sources).size,'global search must not introduce duplicate IDs');
 for(const id of ['missionSearchOpen','missionGlobalSearch','missionSearchClose','missionSearchInput','missionSearchResults','missionSearchTitle','missionSearchScope'])
  assert.ok(sources.includes(id),id);
 assert.match(html,/id="missionGlobalSearch" role="dialog" aria-modal="true" aria-labelledby="missionSearchTitle" hidden/);
 assert.match(html,/aria-keyshortcuts="Control\+K Meta\+K"/);
 assert.match(CSS,/mission-search-overlay\[hidden\]/);
 assert.match(CSS,/@media\(max-width:850px\)\{\.topbar \.mission-search-trigger/);
 for(const route of ['agent-finance','agent-ads','agent-products','agent-production','agent-returns','agent-auditor','agent-hermes','products','production','margins','history','roadmap']){
  assert.ok(CLIENT.includes("key:'"+route+"'"),route);
 }
 const searchStart=CLIENT.indexOf('// Mission Control V3.5:');
 const searchEnd=CLIENT.indexOf("document.querySelectorAll('[data-tab]').forEach(link=>link.onclick",searchStart);
 assert.ok(searchStart>=0&&searchEnd>searchStart);
 const search=CLIENT.slice(searchStart,searchEnd);
 assert.match(search,/missionSearchRoutes=Object\.freeze/);
 assert.match(search,/document\.addEventListener\('keydown'/);
 assert.match(search,/event\.key==='Enter'/);
 assert.match(search,/event\.key==='Escape'/);
 assert.match(search,/key==='k'/);
 assert.match(search,/input\.addEventListener\('input',\(\)=>/);
 assert.match(search,/globalThis\.mlsWorkspaceSearch=Object\.freeze/);
 assert.doesNotMatch(search,/\bfetch\s*\(|\bsetInterval\s*\(|\/api\//);
 assert.doesNotMatch(search,/access_token|refresh_token|FINANCE_TOKEN_ENCRYPTION_KEY|APP_INTERNAL_SECRET/);
});

test('V3.6 scopes trigger only explicit validated persisted-product and saved-DTF searches',()=>{
 const html=adminBody();
 for(const scope of ['navigation','products','dtf'])
  assert.match(html,new RegExp('data-mission-scope="'+scope+'"'));
 for(const id of ['missionSearchExecute','missionSearchMore','missionSearchPageInfo'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/Pedidos na fila DTF/);
 assert.match(html,/Produtos salvos/);
 assert.match(CSS,/mission-search-scopes/);
 const block=CLIENT.slice(CLIENT.indexOf('(function installMissionSearch(){'),CLIENT.indexOf("document.querySelectorAll('[data-tab]').forEach(link=>link.onclick"));
 assert.match(block,/async function searchRecords\(offset=0\)/);
 assert.match(block,/input\.value\.trim\(\)\.length<2/);
 assert.match(block,/searchRecords\(currentOffset\+8\)/);
 assert.match(block,/projectProductRegistryFrame\(raw\)/);
 assert.match(block,/api\('product-registry\?'\+queryString,undefined,\{timeoutMs:15000\}\)/);
 assert.match(block,/globalThis\.brazaDtfWorkspace\?\.searchLines\?\.\(query,offset\)/);
 assert.match(block,/globalThis\.brazaSavedCatalog\?\.find\?\.\(item\.productId\)/);
 assert.match(block,/globalThis\.brazaDtfWorkspace\?\.findLine\?\.\(item\.orderId\)/);
 assert.match(block,/execute\.onclick=\(\)=>searchRecords\(0\)/);
 assert.match(block,/mode==='navigation'\?choose\(selected\[active\]\):searchRecords\(0\)/);
 assert.doesNotMatch(block,/\bfetch\s*\(|\bsetInterval\s*\(|product-registry\/sync/);
 assert.match(SAVED_CATALOG_CLIENT,/async function find\(search\)/);
 assert.match(DTF_CLIENT,/function searchLines\(query,offset=0\)/);
 assert.match(DTF_CLIENT,/SAVED_DTF_LINES_NOT_PAID_ORDERS_OR_UNIT_COUNTS/);
 assert.match(DTF_CLIENT,/searchLines,findLine/);
});
