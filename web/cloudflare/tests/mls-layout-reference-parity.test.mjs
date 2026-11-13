import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {AGENT_REGISTRY_CLIENT,commandCenterBody} from '../src/agent-registry-view.mjs';
import {MLS_APPROVED_DESIGN_CSS} from '../src/approved-design-system.mjs';
import {MLS_REFERENCE_SHELL_CSS} from '../src/mls-reference-shell-design.mjs';
import {MLS_REFERENCE_PANEL_CSS} from '../src/mls-reference-panel-design.mjs';

// Reference: user-supplied MLS_COMMERCE_OS_LAYOUT.html, SHA256
// 135002e7193409451e78263ee5d45fdcfb53e1061804a3a39af84fdc5edcc5f3.
// Native proportions and clipping are covered in the composition Chrome test.
test('reference layers are the final shared presentation and cannot flatten all product surfaces or inject business facts',()=>{
 assert.ok(MLS_APPROVED_DESIGN_CSS.endsWith(MLS_REFERENCE_SHELL_CSS+MLS_REFERENCE_PANEL_CSS));
 for(const css of [MLS_REFERENCE_SHELL_CSS,MLS_REFERENCE_PANEL_CSS]){
  assert.doesNotMatch(css,/https?:\/\/|url\(["']?https?:|R\$\s*\d+/i,'reference presentation contains no external assets or sample money');
  assert.doesNotMatch(css,/background-image\s*:\s*none\s*!important/i,'do not strip every reference tint');
  assert.doesNotMatch(css,/(?:^|\})\s*(?:p|small|p\s*,\s*small)\s*\{[^}]*font-size\s*:\s*14px\s*!important/,'annotations keep role-specific reference typography');
  assert.doesNotMatch(css,/#(?:message|startupRetry|missionSourceState)\b[^{}]*\{[^}]*display\s*:\s*none/,'source failures must remain controlled by their actual state');
 }
});

function monthProxyFixture({month='2026-10',loading=false,select}={}){
 const nodes=Object.fromEntries(['mlsOverviewMonth','mlsOverviewMonthPrevious','mlsOverviewMonthNext','mlsOverviewMonthStatus','mlsAgentPeriodStatus'].map(id=>[id,{value:'',disabled:true,hidden:true,textContent:''}]));
 nodes.mlsAgentPeriodStatus.textContent='Confira os rascunhos antes de trocar o período.';
 const state={month,period_loading:loading},calls=[],daySync=[];
 const extract=name=>{
  const found=AGENT_REGISTRY_CLIENT.match(new RegExp('(async )?function '+name+'\\([^]*?\\n }'));
  assert.ok(found,'actual registry helper remains identifiable: '+name);return found[0];
 };
 const context={document:{getElementById:id=>nodes[id]??null},Intl,Date,Promise,
  brazaMonthDashboard:{getSnapshot:()=>state,selectMonth:()=>{throw Error('The visual proxy must use the shared period gate');}},
  mlsAgentPeriod:{selectMonth:async value=>{calls.push(value);return select?select(value):true;}},
  syncOverviewPeriod:()=>daySync.push(true)};
 const controller=vm.runInNewContext('let overviewMonthBusy=false;\n'+extract('syncOverviewMonth')+'\n'+extract('selectOverviewMonth')+'\n({sync:syncOverviewMonth,select:selectOverviewMonth,get busy(){return overviewMonthBusy;}})',context);
 return {nodes,state,calls,daySync,controller};
}

test('month control delegates to the existing shared period gate once and preserves selection/drafts when the gate rejects',async()=>{
 const fixture=monthProxyFixture({select:()=>false}),{controller,nodes,calls,state}=fixture;
 controller.sync();assert.equal(nodes.mlsOverviewMonth.value,'2026-10');assert.equal(nodes.mlsOverviewMonth.disabled,false);
 assert.equal(await controller.select('2026-09'),false);
 assert.deepEqual(calls,['2026-09']);assert.equal(state.month,'2026-10');
 assert.equal(nodes.mlsOverviewMonth.value,'2026-10');assert.equal(nodes.mlsOverviewMonth.disabled,false);
 assert.equal(nodes.mlsOverviewMonthStatus.hidden,false);
 assert.equal(nodes.mlsOverviewMonthStatus.textContent,nodes.mlsAgentPeriodStatus.textContent);
 assert.equal(fixture.daySync.length,1,'day display resynchronizes with the actual shared selection');
});

test('accepted month selection displays the shared controller result and clears the pending status',async()=>{
 let fixture;
 fixture=monthProxyFixture({select:value=>{fixture.state.month=value;return true;}});
 assert.equal(await fixture.controller.select('2026-09'),true);
 assert.deepEqual(fixture.calls,['2026-09']);assert.equal(fixture.nodes.mlsOverviewMonth.value,'2026-09');
 assert.equal(fixture.nodes.mlsOverviewMonthStatus.hidden,true);assert.equal(fixture.nodes.mlsOverviewMonthStatus.textContent,'');
 assert.equal(fixture.nodes.mlsOverviewMonth.disabled,false);assert.equal(fixture.daySync.length,1);
});

test('month control coalesces pending selections and exposes recoverable failure without advancing the source month',async()=>{
 let reject;
 const waiting=new Promise((_resolve,rejectPromise)=>{reject=rejectPromise;});
 const fixture=monthProxyFixture({select:()=>waiting}),{controller,nodes,calls}=fixture;
 const first=controller.select('2026-09');assert.equal(controller.busy,true);assert.equal(nodes.mlsOverviewMonth.disabled,true);
 assert.equal(await controller.select('2026-08'),false);assert.deepEqual(calls,['2026-09']);
 reject(Error('synthetic shared gate failure'));
 assert.equal(await first,false);assert.equal(controller.busy,false);assert.equal(nodes.mlsOverviewMonth.disabled,false);
 assert.equal(nodes.mlsOverviewMonth.value,'2026-10');assert.equal(nodes.mlsOverviewMonthStatus.hidden,false);
 assert.match(nodes.mlsOverviewMonthStatus.textContent,/período e os rascunhos anteriores foram preservados/);
});

test('shared month loading and lower/upper month boundaries disable presentation actions without creating a second financial period model',()=>{
 const fixture=monthProxyFixture({month:'2000-01'}),{controller,nodes,state}=fixture;
 controller.sync();assert.equal(nodes.mlsOverviewMonthPrevious.disabled,true);assert.equal(nodes.mlsOverviewMonthNext.disabled,false);
 const current=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7);
 state.month=current;controller.sync();assert.equal(nodes.mlsOverviewMonth.max,current);assert.equal(nodes.mlsOverviewMonthNext.disabled,true);
 state.period_loading=true;controller.sync();
 assert.equal(nodes.mlsOverviewMonth.disabled,true);assert.equal(nodes.mlsOverviewMonthPrevious.disabled,true);assert.equal(nodes.mlsOverviewMonthNext.disabled,true);
 const html=commandCenterBody();
 assert.match(html,/id="mlsOverviewPeriod" hidden tabindex="-1" aria-hidden="true"/);
 assert.deepEqual([...html.matchAll(/data-overview-period="([^"]+)"/g)].map(row=>row[1]),['today','yesterday','custom']);
 assert.doesNotMatch(AGENT_REGISTRY_CLIENT,/\bfetch\s*\(|setInterval\s*\(|\/api\//,'presentation adapters use existing caches and controllers');
});
