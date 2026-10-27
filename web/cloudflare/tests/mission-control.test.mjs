import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {MISSION_CSS,MISSION_CLIENT,MISSION_AGENTS,missionWorkspacesBody} from '../src/mission-control.mjs';
import {adminBody} from '../src/admin-view.mjs';
import {commandCenterBody,AGENT_REGISTRY_CLIENT} from '../src/agent-registry-view.mjs';
import {buildMlsAgentRegistry} from '../src/agent-registry.mjs';

const names=['finance','ads','products','production','returns','auditor','hermes'];
const fixture=()=>buildMlsAgentRegistry({
 day:{date:'2026-10-27',net_cents:13784,sales_cents:76276,ads_spend_cents:3777,paid_orders:11,net_basis:'ESTIMATE'},
 month:{month:'2026-10',status:'COMPLETE',balance_cents:258761,checked_at:1793070100,coverage:{returns:2},production_coverage:{total_units:294,known_units:294},pending:['RETURNS_NOT_RECONCILED']},
 now:1793070150
});

test('Mission Control defines seven separate read-only agent destinations with real fallback hrefs',()=>{
 const html=missionWorkspacesBody('<div id="preservedFinanceControl">Original</div>');
 assert.equal(MISSION_AGENTS.length,7);
 assert.equal(new Set(MISSION_AGENTS.map(x=>x.id)).size,7);
 assert.match(html,/id="agents"/);
 for(const id of names){
  assert.match(html,new RegExp('id="agent-'+id+'"'));
  assert.match(html,new RegExp('href="/admin\\?tab=agent-'+id+'"'));
  assert.match(html,new RegExp('id="mission-'+id+'-tasks"'));
  assert.match(html,new RegExp('id="mission-'+id+'-metric-3"'));
 }
 assert.equal((html.match(/class="mission-hub-card /g)||[]).length,7);
 assert.equal((html.match(/id="preservedFinanceControl"/g)||[]).length,1);
 assert.ok(html.indexOf('id="agent-finance"')<html.indexOf('id="preservedFinanceControl"'));
 assert.ok(html.indexOf('id="preservedFinanceControl"')<html.indexOf('id="agent-ads"'));
 assert.match(html,/MLS Pricing · M3/);
 assert.match(html,/MLS Marketplace · M8/);
 assert.doesNotMatch(html,/data-mission-open="agent-pricing"/);
});

test('owner keeps all existing financial forms and identifiers once, but overview excludes detailed monthly panels',()=>{
 const html=adminBody(),overviewStart=html.indexOf('<section id="overview">'),financeStart=html.indexOf('id="agent-finance"');
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(ids.length,new Set(ids).size,'Mission Control must not duplicate IDs');
 assert.ok(overviewStart>0&&financeStart>overviewStart);
 for(const name of ['businessDay','businessMonth','commandPendingIncomeDetails','legacyFinanceDetails','storePeriodMetrics','businessMonthExpensesForm','businessReconciliationDetails','businessEscrowReleasesDetails']){
  const ix=html.indexOf('id="'+name+'"');
  assert.ok(ix>financeStart,name+' should remain inside MLS Finance');
  assert.equal(ids.filter(value=>value===name).length,1,name+' must exist exactly once');
 }
 for(const name of ['products','margins','hermes','history','roadmap'])assert.ok(ids.includes(name),name+' legacy tab preserved');
 assert.match(html,/id="commandCenterAgents"/);
 assert.ok(html.indexOf('id="commandCenterAgents"')<financeStart,'executive cards remain on overview');
});

test('Mission Control style has scoped futuristic accents, responsive breakpoints and reduced-motion support',()=>{
 for(const name of names)assert.match(MISSION_CSS,new RegExp('mission-agent--'+name));
 for(const token of ['mission-hub-grid','mission-stats','mission-module','mission-hub-card','focus-visible','prefers-reduced-motion','max-width:550px'])assert.ok(MISSION_CSS.includes(token),token);
 assert.doesNotMatch(MISSION_CLIENT,/\bfetch\s*\(|setInterval\s*\(|\/api\/|postMessage\s*\(/);
});

function mount(snapshot){
 const html=missionWorkspacesBody();
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 const nodes=new Map(ids.map(id=>[id,{id,children:[],dataset:{},style:{},hidden:false,textContent:'',
  replaceChildren(...children){this.children=[...children];},append(...children){this.children.push(...children);}}]));
 const statuses=new Map(names.map(name=>[name,[{textContent:'',dataset:{}}]]));
 const document={getElementById:id=>nodes.get(id)||null,querySelectorAll:selector=>{
  const m=/^\[data-mission-status="([^"]+)"\]$/.exec(selector);
  return m?statuses.get(m[1])||[]:[];
 },createElement:tag=>({tag,textContent:'',dataset:{},children:[],append(...children){this.children.push(...children);}})};
 const context=vm.createContext({document,Intl,Date,Number,BigInt,Math});
 if(snapshot)context.mlsAgentRegistry={getSnapshot:()=>snapshot};
 vm.runInContext(MISSION_CLIENT,context);
 return {nodes,statuses,context};
}

test('real mission client hydrates agent status, genuine source metrics and safe priorities without requests',()=>{
 const snapshot=fixture(),mounted=mount(snapshot),{nodes,statuses}=mounted;
 assert.equal(mounted.context.mlsMission.refresh!==undefined,true);
 assert.equal(nodes.get('mission-finance-metric-0').textContent,'R$ 2.587,61');
 assert.equal(nodes.get('mission-ads-metric-0').textContent,'R$ 37,77');
 assert.equal(nodes.get('mission-products-metric-0').textContent,'294');
 assert.equal(nodes.get('mission-production-metric-0').textContent,'294');
 assert.equal(nodes.get('mission-returns-metric-0').textContent,'2');
 assert.equal(nodes.get('mission-products-coverage').hidden,false);
 assert.equal(nodes.get('mission-products-coverage-bar').style.width,'100%');
 assert.equal(statuses.get('finance')[0].dataset.status,'HEALTHY');
 assert.equal(statuses.get('returns')[0].dataset.status,'ATTENTION');
 assert.ok(nodes.get('mission-returns-tasks').children.length>=1);
 assert.equal(nodes.get('mission-hermes-metric-1').textContent,'6');
});

test('unavailable sources never become fake amounts, healthy agents or fake production status',()=>{
 const snapshot=buildMlsAgentRegistry();
 const {nodes}=mount(snapshot);
 assert.equal(nodes.get('mission-finance-metric-0').textContent,'—');
 assert.equal(nodes.get('mission-ads-metric-0').textContent,'—');
 assert.equal(nodes.get('mission-products-metric-0').textContent,'—');
 assert.equal(nodes.get('mission-products-coverage').hidden,true);
 assert.match(nodes.get('mission-finance-tasks').children[0].textContent,/Nenhuma prioridade/);
 assert.match(nodes.get('mission-finance-message').textContent,/Aguardando/);
 assert.equal(nodes.get('mission-finance-metric-3').textContent,'—');
});

test('approved Mission Control V2 actually exposes colored cockpit, real observation charts and seven dedicated agents',()=>{
 const html=commandCenterBody(),fleet=missionWorkspacesBody();
 for(const key of ['mission-dashboard','mission-command-hero','mission-command-orbit','mission-overview-cta','mission-day-intelligence','missionDayBarSales','missionDayBarNet','missionDayBarAds','missionHealthRing','missionHealthHealthy','missionHealthWorking','missionHealthAttention','missionHealthBlocked']){
  assert.ok(html.includes(key),key+' missing from shipped owner page');
 }
 for(const key of ['net','sales','ads','margin','paid','alerts'])assert.ok(html.includes('data-mission-metric="'+key+'"'),key);
 for(const name of ['finance','ads','products','production','returns','auditor'])assert.ok(html.includes('data-mission-accent="'+name+'"'));
 assert.equal((html.match(/data-agent-placeholder="true"/g)||[]).length,6);
 assert.ok(html.indexOf('mission-day-intelligence')>html.indexOf('commandCenterAgents'));
 for(const name of names){
  assert.match(fleet,new RegExp('mission-agent--'+name));
  assert.ok(fleet.includes('id="mission-'+name+'-tools"'));
  assert.match(fleet,new RegExp('href="#mission-'+name+'-tasks"'));
  assert.ok(fleet.includes('id="mission-'+name+'-metric-3"'));
 }
 assert.equal((fleet.match(/class="mission-hub-card /g)||[]).length,7);
 assert.match(fleet,/mission-mini-orb mission-agent-avatar/);
 assert.match(fleet,/mission-orb mission-agent-avatar/);
 assert.match(fleet,/href="#businessMonth"/);
 for(const text of ['Mission Control V2','mission-agent-avatar','mission-satellite','mission-day-intelligence','mission-comparison-track','mission-health-ring','mission-page-tabs']){
  assert.ok(MISSION_CSS.includes(text),text);
 }
 assert.match(MISSION_CSS,/radial-gradient/);
 assert.match(MISSION_CSS,/prefers-reduced-motion/);
 assert.match(AGENT_REGISTRY_CLIENT,/renderDayIntelligence/);
 assert.match(AGENT_REGISTRY_CLIENT,/safeInteger|Number\.isSafeInteger/);
 assert.doesNotMatch(AGENT_REGISTRY_CLIENT,/\bfetch\s*\(|setInterval\s*\(|\/api\//);
});

test('Mission Control V2 decorative surfaces cannot invent financial history or authorize business writes',()=>{
 const html=commandCenterBody();
 assert.match(html,/não representam histórico/);
 assert.match(html,/não representa.*série histórica|barras não representam histórico/i);
 assert.match(html,/valores indisponíveis permanecem como —/i);
 assert.doesNotMatch(html,/ROAS\s*(?:[0-9]|de)/i);
 assert.doesNotMatch(html,/data-action="(?:approve|execute|scale)"/);
 assert.doesNotMatch(MISSION_CLIENT,/\bfetch\s*\(|setInterval\s*\(|\/api\//);
 assert.match(MISSION_CSS,/data-theme=light/);
});
