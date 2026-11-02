import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceNavigation,workspaceSecondaryNavigation} from '../src/workspace-navigation.mjs';
import {adminBody,CSS} from '../src/admin-view.mjs';
import {CLIENT} from '../src/admin-client.mjs';
import {SAVED_CATALOG_CLIENT,savedCatalogBody} from '../src/saved-catalog-view.mjs';
import {DTF_CLIENT} from '../src/dtf-view.mjs';
import {shellDesktopNavigation,shellMobileNavigation} from '../src/shell-navigation.mjs';
import {renderAdsWorkspace} from '../src/ads-workspace-view.mjs';
import {renderWorkspaceConnections} from '../src/scaling-preparation.mjs';
import {enhanceAdsPageHtml} from '../src/ads-presentation.mjs';

const primary=html=>html.match(/<nav class="workspace-nav[^"]*"[^>]*>([\s\S]*?)<\/nav>/)?.[1]?.split('<details')[0]||'';
const destinations=html=>[...html.matchAll(/href="([^"]*)"/g)].map(match=>match[1]);
const owner=['/admin?tab=overview','/admin?tab=agent-production','/admin?tab=agent-returns','/admin?tab=agent-finance','/admin?tab=products','/dashboard','/admin?tab=agent-hermes'];
const mobileOwner=owner.slice(0,5);

test('owner desktop gives seven operational destinations and mobile gives five direct links plus a real menu',()=>{
 for(const active of ['overview','agent-production','agent-returns','agent-finance','products','/dashboard','agent-hermes']){
  const desktop=workspaceNavigation(active,{role:'owner'}),mobile=workspaceNavigation(active,{role:'owner',mobile:true});
  assert.deepEqual(destinations(primary(desktop)),owner);
  assert.deepEqual(destinations(primary(mobile)),mobileOwner);
  assert.equal((desktop.match(/aria-current="page"/g)||[]).length,1);
  assert.equal((mobile.match(/aria-current="page"/g)||[]).length,1);
  assert.equal((mobile.match(/<details /g)||[]).length,1);
  assert.match(mobile,/<details class="workspace-more workspace-mobile-menu"/);
  assert.match(mobile,/<summary>[\s\S]*?workspace-nav-label">Menu<\/span><\/summary>/);
  for(const route of owner)assert.ok(destinations(mobile).includes(route),route);
  for(const tab of ['overview','agent-production','agent-returns','agent-finance','products'])assert.match(mobile,new RegExp('data-tab="'+tab+'" data-workspace-tab="'+tab+'"'));
 }
 assert.deepEqual(destinations(primary(shellDesktopNavigation('/dashboard',{role:'owner'}))),owner);
 const shellMobile=shellMobileNavigation('/dashboard',{role:'owner'});
 assert.deepEqual(destinations(primary(shellMobile)),mobileOwner);
 assert.doesNotMatch(shellMobile,/<div class="workspace-header-menu">/,'the owner has one menu in the bottom bar');
});

test('secondary work stays reachable in one menu and never automatically opens an overlay',()=>{
 const html=workspaceNavigation('/campaigns',{role:'owner'}),secondary=workspaceSecondaryNavigation('agents',{role:'owner'});
 assert.ok(!destinations(primary(html)).includes('/campaigns'));
 for(const route of ['/admin?tab=agents','/admin?tab=margins','/campaigns','/optimization','/integrations','/admin?tab=history','/admin?tab=roadmap','/admin/diagnostics','/logout'])assert.ok(destinations(html).includes(route),route);
 assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
 assert.match(secondary,/<details class="workspace-more" data-active="true">/);
 assert.doesNotMatch(secondary,/<details[^>]*\bopen(?:\s|>)/);
 assert.match(secondary,/href="\/admin\?tab=agents" aria-current="page"/);
 assert.match(secondary,/Equipe e agentes/);
 assert.match(secondary,/somente leitura/);
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

test('team remains explicit in both secondary menus without occupying a main operational cell',()=>{
 for(const mobile of [false,true]){
  const html=workspaceNavigation('agents',{role:'owner',mobile});
  assert.doesNotMatch(primary(html),/data-workspace-key="agents"/);
  assert.match(html,/href="\/admin\?tab=agents" aria-current="page" data-workspace-key="agents" data-tab="agents"/);
 }
 assert.match(workspaceSecondaryNavigation('overview'),/data-workspace-key="agents"/);
});

test('legacy tabs and agent subpages select the matching operational destination without changing their URL contract',()=>{
 const mapping={agents:'agents','agent-finance':'finance','agent-ads':'ads','agent-products':'products','agent-production':'production','agent-returns':'returns','agent-auditor':'agents','agent-hermes':'hermes',production:'production',margins:'products',hermes:'hermes'};
 for(const [tab,key] of Object.entries(mapping)){
  for(const active of [tab,'/admin?tab='+tab]){
   const html=workspaceNavigation(active,{role:'owner'});
   assert.match(html,new RegExp('aria-current="page" data-workspace-key="'+key+'"'));
   assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  }
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
 assert.match(block,/raw\?\.schema!=='product_registry_v1'/);
 assert.match(block,/page\.more!==\(offset\+8<page\.total\)/);
 assert.match(block,/validId\(row\.item_id\)&&validName\(row\.product_name\)/);
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

test('V3.6 product search is user-confirmed and delegates to the saved catalog form',()=>{
 const markup=savedCatalogBody();
 assert.match(markup,/id="savedCatalogSearchForm"/);
 assert.match(markup,/id="savedCatalogSearch"/);
 const start=CLIENT.indexOf('// Mission Control V3.5:');
 const end=CLIENT.indexOf("document.querySelectorAll('[data-tab]').forEach(link=>link.onclick",start);
 const source=CLIENT.slice(start,end);
 assert.match(source,/key:'product-query'/);
 assert.match(source,/rawQuery\.length>=2&&rawQuery\.length<=90/);
 assert.match(source,/selected\.find\(value=>value\.key===link\.dataset\.searchRoute\)/);
 assert.match(source,/item\.catalogQuery/);
 assert.match(source,/savedCatalogSearch/);
 assert.match(source,/openTab\(item\.panel,\{updateUrl:!item\.hash\}\)/);
 assert.match(source,/workspaceOpenFragment\('#'\+item\.hash,\{focus:true,updateUrl:true\}\)/);
 assert.match(source,/search\.value=item\.catalogQuery/);
 assert.doesNotMatch(source,/\bfetch\s*\(|\bsetInterval\s*\(|\/api\//);
 assert.doesNotMatch(source,/location\.assign\(.*catalogQuery/);
});
