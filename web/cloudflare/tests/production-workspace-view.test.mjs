import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {PRODUCTION_WORKSPACE_CLIENT} from '../src/production-workspace-view.mjs';

function fixture(){
 const nodes=new Map(['missionProductionFabricationPane','missionProductionReferencePane','incurredProductionDetails','missionProductionOperationsTitle'].map(id=>[id,{hidden:id==='missionProductionReferencePane',open:false}]));
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

test('pages without production hosts do not call operational controllers',()=>{
 let calls=0;const context=vm.createContext({document:{getElementById:()=>null},brazaIncurredProduction:{open:()=>calls++}});vm.runInContext(PRODUCTION_WORKSPACE_CLIENT,context);
 assert.equal(context.brazaProductionWorkspace.open(),false);assert.equal(context.brazaProductionWorkspace.activateFragment('#costPeriods'),false);assert.equal(calls,0);
});
