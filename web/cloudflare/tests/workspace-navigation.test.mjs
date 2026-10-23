import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceNavigation,workspaceSecondaryNavigation} from '../src/workspace-navigation.mjs';
import {shellDesktopNavigation,shellMobileNavigation} from '../src/shell-navigation.mjs';
import {renderAdsWorkspace} from '../src/ads-workspace-view.mjs';
import {renderWorkspaceConnections} from '../src/scaling-preparation.mjs';
import {enhanceAdsPageHtml} from '../src/ads-presentation.mjs';

const primary=html=>html.match(/<nav class="workspace-nav[^"]*"[^>]*>([\s\S]*?)<\/nav>/)?.[1]||'';
const destinations=html=>[...html.matchAll(/href="([^"]*)"/g)].map(match=>match[1]);
const owner=['/admin?tab=overview','/admin?tab=products','/dashboard','/admin?tab=margins','/optimization'];

test('owner has the same five main destinations and ordering on Admin, Ads, desktop and mobile',()=>{
 for(const active of ['overview','products','/dashboard','margins','/optimization']){
  for(const mobile of [false,true]){
   const html=workspaceNavigation(active,{role:'owner',mobile});
   assert.deepEqual(destinations(primary(html)),owner);
   assert.equal((primary(html).match(/aria-current="page"/g)||[]).length,1);
   for(const tab of ['overview','products','margins'])assert.match(html,new RegExp('data-tab="'+tab+'" data-workspace-tab="'+tab+'"'));
  }
 }
 assert.deepEqual(destinations(primary(shellDesktopNavigation('/dashboard',{role:'owner'}))),owner);
 assert.deepEqual(destinations(primary(shellMobileNavigation('/dashboard',{role:'owner'}))),owner);
});

test('secondary work stays grouped without automatically opening a mobile overlay',()=>{
 const html=workspaceNavigation('/campaigns',{role:'owner'}),secondary=workspaceSecondaryNavigation('hermes',{role:'owner'});
 assert.ok(!destinations(primary(html)).includes('/campaigns'));
 for(const route of ['/campaigns','/admin?tab=hermes','/integrations','/admin?tab=history','/admin?tab=roadmap'])assert.ok(destinations(html).includes(route),route);
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
  }
 }
 const ownerDashboard=renderAdsWorkspace('/dashboard',{role:'owner'});
 assert.match(ownerDashboard,/<a[^>]*href="\/admin\?tab=overview/);
 assert.match(renderWorkspaceConnections({connected:true},{role:'owner'}),/<a[^>]*href="\/admin\?tab=overview/);
 const presentation=enhanceAdsPageHtml('<html><head></head><body><main class="main"><div class="top"><div><h1>Advertising</h1></div><div class="system">System Online</div></div></main></body></html>');
 assert.doesNotMatch(presentation,/<a[^>]*href="\/admin/);
 assert.doesNotMatch(presentation,/class="ads-source-banner"/);
});
