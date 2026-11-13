import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {PRODUCTION_WORKSPACE_CLIENT,productionWorkspaceBody} from '../src/production-workspace-view.mjs';

function fixture(){
 const nodes=new Map(['missionProductionFabricationPane','missionProductionReferencePane','incurredProductionDetails','missionProductionOperationsTitle','missionProductionWeeklyPane','incurredProduction','incurredProductionCalendar','incurredProductionFinancePane','incurredProductionRangePane','incurredProductionRecordsPane'].map(id=>[id,{hidden:id==='missionProductionReferencePane',open:false}]));
 let source=null,opens=0,refreshes=0;const context=vm.createContext({document:{getElementById:id=>nodes.get(id)||null},brazaIncurredProduction:{getSnapshot:()=>source,open:()=>{opens++;nodes.get('incurredProductionDetails').open=true;}},brazaProductionDailyFinance:{refresh:()=>{refreshes++;}}});
 vm.runInContext(PRODUCTION_WORKSPACE_CLIENT,context);
 return {nodes,context,workspace:context.brazaProductionWorkspace,snapshot:value=>source=value,calls:()=>({opens,refreshes})};
}

test('the production controller stays lazy on startup and opens fabrication only when its pane is selected',()=>{
 const f=fixture();assert.deepEqual(f.calls(),{opens:0,refreshes:0});
 assert.equal(f.workspace.open({fragment:'#costPeriods'}),true);assert.deepEqual(f.calls(),{opens:0,refreshes:0});assert.equal(f.nodes.get('missionProductionFabricationPane').hidden,true);assert.equal(f.nodes.get('missionProductionReferencePane').hidden,false);
 assert.equal(f.nodes.get('missionProductionOperationsTitle').textContent,'Referência de custo dos pedidos vendidos');
 assert.equal(f.workspace.open(),true);assert.deepEqual(f.calls(),{opens:1,refreshes:1});assert.equal(f.nodes.get('incurredProductionDetails').open,true);assert.equal(f.nodes.get('missionProductionReferencePane').hidden,true);
 assert.equal(f.nodes.get('missionProductionOperationsTitle').textContent,'Produção e custo por data de fabricação');
});

test('switching visible sources preserves the existing ledger, selection and unsaved controls without refetching loaded facts',()=>{
 const f=fixture();f.workspace.open();const saved={month:'2026-10',selected_day:'2026-10-15',draft:'preserve-this-draft'};f.snapshot(saved);
 f.workspace.activateFragment('#costPeriodsMonth');f.workspace.activateFragment('#incurredProductionDay');
 assert.deepEqual(f.calls(),{opens:1,refreshes:2});assert.equal(f.context.brazaIncurredProduction.getSnapshot(),saved);assert.equal(saved.draft,'preserve-this-draft');assert.equal(f.workspace.getSnapshot().active_pane,'manufacturing');
 const out=f.workspace.getSnapshot();assert.equal(Object.isFrozen(out),true);assert.throws(()=>out.active_pane='sales-reference');
});

test('daily, weekly, interval and registration destinations retain their controls and show one task at a time',()=>{
 const f=fixture();f.workspace.open();f.snapshot({draft:'do-not-reset'});
 const check=(fragment,mode,visible)=>{assert.equal(f.workspace.activateFragment(fragment),true);assert.equal(f.workspace.getSnapshot().active_view,mode);for(const id of ['incurredProductionCalendar','incurredProductionRangePane','incurredProductionRecordsPane','missionProductionWeeklyPane'])assert.equal(f.nodes.get(id).hidden,id!==visible);assert.equal(f.context.brazaIncurredProduction.getSnapshot().draft,'do-not-reset');};
 check('#productionWeeklyClosing','weekly','missionProductionWeeklyPane');
 check('#incurredProductionRecordsPane','records','incurredProductionRecordsPane');
 check('#incurredProductionStart','range','incurredProductionRangePane');
 check('#incurredProductionCalendarTitle','daily','incurredProductionCalendar');
 assert.deepEqual(f.calls(),{opens:1,refreshes:2});
});

test('confirm day transfers only the selected date to the explicit coverage flow',()=>{
 const f=fixture(),calls=[];f.context.brazaIncurredProduction.getAnalyticsSnapshot=()=>({selected_day:{date:'2026-10-23'}});f.context.brazaProductionCoverage={openForDate:date=>{calls.push(date);return true;},open:()=>{throw Error('must not start a competing read');}};
 assert.equal(f.workspace.confirmDay(),true);assert.deepEqual(calls,['2026-10-23']);assert.equal(f.workspace.getSnapshot().active_view,'weekly');
 f.context.brazaIncurredProduction.getAnalyticsSnapshot=()=>null;assert.equal(f.workspace.confirmDay(),false);assert.equal(calls.length,1);
});

test('markup puts daily records before weekly reports and keeps all existing source hosts',()=>{
 const body=productionWorkspaceBody({daily:'DAILY-HOST',weekly:'WEEKLY-HOST',coverage:'COVERAGE-HOST',reference:'REFERENCE-HOST'});
 assert.ok(body.indexOf('DAILY-HOST')<body.indexOf('WEEKLY-HOST'));assert.match(body,/id="missionProductionWeeklyPane" hidden/);assert.match(body,/id="missionProductionReferencePane"[^>]* hidden/);for(const text of ['DAILY-HOST','WEEKLY-HOST','COVERAGE-HOST','REFERENCE-HOST'])assert.equal(body.split(text).length,2);
});

test('pages without production hosts do not call operational controllers',()=>{
 let calls=0;const context=vm.createContext({document:{getElementById:()=>null},brazaIncurredProduction:{open:()=>calls++}});vm.runInContext(PRODUCTION_WORKSPACE_CLIENT,context);
 assert.equal(context.brazaProductionWorkspace.open(),false);assert.equal(context.brazaProductionWorkspace.activateFragment('#costPeriods'),false);assert.equal(calls,0);
});

test('weekly context delegates to the saved-week controller without a competing current-month read',async()=>{
 const f=fixture(),calls=[];f.context.brazaProductionWeeklyClosing={open:()=>assert.fail('context must not open another month first'),openContext:context=>{calls.push(JSON.parse(JSON.stringify(context)));return Promise.resolve(true);}};
 assert.equal(await f.workspace.open({fragment:'#productionWeeklyClosing',context:{month:'2026-10',week_end:'2026-10-02'}}),true);
 assert.deepEqual(calls,[{month:'2026-10',week_end:'2026-10-02'}]);assert.equal(f.workspace.getSnapshot().active_view,'weekly');
});
