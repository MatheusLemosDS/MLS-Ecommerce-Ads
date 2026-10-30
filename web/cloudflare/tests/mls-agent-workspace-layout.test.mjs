import test from 'node:test';
import assert from 'node:assert/strict';
import {missionWorkspacesBody} from '../src/mission-control.mjs';
import {MLS_AGENT_WORKSPACE_CSS} from '../src/mls-agent-workspace-layout.mjs';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';

function workspaces(){
 const html=missionWorkspacesBody(''),starts=[...html.matchAll(/<section class="mission-workspace mission-agent--([a-z]+)(?: mls-agent-workspace)?" id="agent-[a-z]+"/g)];
 return new Map(starts.map((row,index)=>[row[1],html.slice(row.index,starts[index+1]?.index??html.length)]));
}

test('approved specialist components preserve four metric bindings and real navigation without a nested content rail',()=>{
 const panels=workspaces();assert.equal(panels.size,7);
 for(const id of ['finance','ads','products','production','returns']){
  const html=panels.get(id);assert.ok(html.includes('mls-agent-workspace'));
  assert.equal((html.match(/class="mls-agent-mini-nav"/g)||[]).length,1,id);
  for(const part of ['label','metric','hint'])for(let index=0;index<4;index++)
   assert.equal((html.match(new RegExp('id="mission-'+id+'-'+part+'-'+index+'"','g'))||[]).length,1,id+'/'+part+'/'+index);
  assert.ok(html.indexOf('id="mission-'+id+'-metrics"')<html.indexOf('class="mission-page-tabs mls-module-tabs"'),id+': KPIs precede tabs');
  assert.match(html,/href="\/admin\?tab=overview" data-tab="overview"/);
  assert.match(html,/href="\/integrations"/);
  assert.match(html,/Período da fonte/);assert.doesNotMatch(html,/class="mls-workspace-period"[^<]*>Hoje/);
  assert.match(html,/class="mission-orb mission-agent-avatar mls-agent-avatar"[^>]*><svg/);
 }
 for(const id of ['auditor','hermes'])assert.ok(!panels.get(id).includes('class="mls-agent-mini-nav"'));
});

test('chart pairs preserve source warnings and full Finance drill-down instead of inventing mockup amounts',()=>{
 const panels=workspaces();
 const expected={finance:['finance-payouts','finance-reconciliation'],ads:['ads-distribution'],products:['products-margin','products-ranking'],returns:['returns-reasons','returns-status'],production:['production-hourly','production-states']};
 for(const [id,keys] of Object.entries(expected)){
  const html=panels.get(id);assert.match(html,/class="mls-workspace-chart-pair"/);
  for(const key of keys){assert.equal((html.match(new RegExp('id="missionChart-'+key+'"','g'))||[]).length,1);assert.match(html,new RegExp('data-mission-specialist-chart="'+key+'" data-chart-status="UNAVAILABLE"'));}
  assert.match(html,/Conferir fonte/);assert.match(html,/Dados indisponíveis permanecem desconhecidos/);
 }
 assert.match(panels.get('finance'),/<details class="mls-workspace-history">[\s\S]*id="missionTrendsFinance"/);
 assert.match(panels.get('ads'),/class="mls-workspace-chart-pair"[\s\S]*id="missionTrendsAds"/);
 for(const [id,html] of panels){
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length,id+': duplicate control ID');
 }
});

test('specialist primary actions use existing tools and commercial campaign creation remains explicitly blocked',()=>{
 const panels=workspaces();
 assert.match(panels.get('ads'),/<button[^>]+disabled aria-describedby="mission-ads-action-note">Criar campanha/);
 assert.match(panels.get('ads'),/id="mission-ads-action-note">Bloqueado no modo Observador/);
 for(const id of ['finance','products','production','returns'])assert.match(panels.get(id),/<a class="mls-workspace-primary" href="(?:#businessMonth|\/admin\?tab=)/);
 assert.doesNotMatch(MLS_AGENT_WORKSPACE_CSS,/!important|url\(/i);
 assert.match(MLS_AGENT_WORKSPACE_CSS,/sidebar-navigation>\.workspace-nav\{display:none\}/);
 assert.match(MLS_AGENT_WORKSPACE_CSS,/sidebar-navigation>\.workspace-more/);
 assert.match(MLS_AGENT_WORKSPACE_CSS,/@media\(max-width:850px\)/);
 assert.doesNotMatch(MLS_AGENT_WORKSPACE_CSS,/workspace-nav-mobile[^}]*display:none/);
});

for(const minify of [false,true])test('compiled specialist workspace anchors resolve to actual owner tools and editable components (minify='+minify+')',async()=>{
 const {html}=await compiledOwnerReportPage(minify,{ownerPreview:false});
 for(const id of ['finance','ads','products','production','returns']){
  assert.match(html,new RegExp('class="mission-workspace mission-agent--'+id+' mls-agent-workspace" id="agent-'+id+'"'));
  for(const index of [0,1,2,3])assert.ok(html.includes('id="mission-'+id+'-metric-'+index+'"'));
 }
 const fragments=[...html.matchAll(/href="#([A-Za-z][A-Za-z0-9-]*)"/g)].map(row=>row[1]);
 assert.ok(fragments.length>30,'the compiled owner tools must retain real detail navigation');
 for(const id of new Set(fragments))assert.ok(html.includes('id="'+id+'"'),'broken tool anchor #'+id);
 assert.match(html,/\.mission-workspace\.mls-agent-workspace\{display:block;min-width:0\}/);
 assert.match(html,/class="mission-orb mission-agent-avatar mls-agent-avatar" aria-hidden="true"><svg/);
 assert.doesNotMatch(html,/(?:01_overview|02_finance|03_ads|04_production|05_returns|06_products)_aprovado\.png/);
});
