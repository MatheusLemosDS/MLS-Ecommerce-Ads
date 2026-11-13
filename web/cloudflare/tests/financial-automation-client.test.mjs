import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {financialAutomationUiFixture} from './financial-automation-ui-fixture.mjs';
import {projectFinancialAutomationWorkspace,financialAutomationRowsCsv,createFinancialAutomationController,FINANCIAL_AUTOMATION_CLIENT} from '../src/financial-automation-client.mjs';

test('financial browser projection preserves canonical amounts, partial sources and explicit scope',async()=>{
 const input=await financialAutomationUiFixture(),before=JSON.stringify(input),value=projectFinancialAutomationWorkspace(input,{month:input.month,scope:input.scope});
 assert.ok(value);assert.equal(value.projection.result.amount_cents,-2500);assert.equal(value.projection.positions.bank.amount_cents,3000);assert.deepEqual(value.projection.series,input.projection.series);assert.equal(JSON.stringify(input),before);
 assert.equal(projectFinancialAutomationWorkspace(input,{month:'2026-09'}),null);assert.equal(projectFinancialAutomationWorkspace(input,{scope:{...input.scope,organization_id:'foreign-company'}}),null);
 const denied=structuredClone(input);denied.permissions.financial_read=false;assert.equal(projectFinancialAutomationWorkspace(denied),null);
 const mixed=structuredClone(input);mixed.projection.cash_projection.obligations[0].scope.organization_id='other-company';assert.equal(projectFinancialAutomationWorkspace(mixed),null);
 const partial=await financialAutomationUiFixture({partial:true}),p=projectFinancialAutomationWorkspace(partial);assert.ok(p);assert.equal(p.projection.result.amount_cents,null);assert.equal(p.projection.positions.bank.amount_cents,null);
});

test('financial browser projection rejects unsafe money, missing fields and executable property values',async()=>{
 const value=await financialAutomationUiFixture();
 for(const amount of [NaN,Infinity,1.5,-0,Number.MAX_SAFE_INTEGER+1]){const bad=structuredClone(value);bad.projection.series[0].known_result_cents=amount;assert.equal(projectFinancialAutomationWorkspace(bad),null);}
 const bad=structuredClone(value);delete bad.projection.positions.bank;assert.equal(projectFinancialAutomationWorkspace(bad),null);
 let invoked=0;const property=structuredClone(value);Object.defineProperty(property,'extra',{get(){invoked++;return 1;}});assert.equal(projectFinancialAutomationWorkspace(property),null);assert.equal(invoked,0);
 const future=structuredClone(value);future.projection.series[0]={...future.projection.series[0],state:'NOT_OBSERVED',known_result_cents:null,known_bank_delta_cents:null,result_cents:null,bank_delta_cents:null,event_refs:[]};assert.ok(projectFinancialAutomationWorkspace(future));
});

test('CSV keeps the exact canonical rows, integer cents, scope and cutoff without raw payloads',async()=>{
 const value=await financialAutomationUiFixture(),csv=financialAutomationRowsCsv(value);assert.ok(csv.startsWith('\uFEFF'));const lines=csv.trim().split('\r\n');assert.equal(lines.length,value.projection.series.length+1);
 const row=value.projection.series.find(x=>x.date==='2026-10-20');assert.ok(csv.includes('"'+row.date+'";"'+row.state+'";"'+row.result_cents+'";"'+row.known_result_cents+'"'));assert.ok(csv.includes('"BRL";"'+value.projection.checked_at+'"'));assert.ok(!csv.includes('source.payload'));assert.ok(!csv.includes('native_id'));assert.ok(!csv.includes('buyer'));
});

test('read controller coalesces reads, rejects foreign responses and clears data after authorization loss',async()=>{
 const value=await financialAutomationUiFixture();let reads=0,mode='pending',resolve;
 const c=createFinancialAutomationController({});assert.equal(c.start({api:()=>{reads++;if(mode==='pending')return new Promise(r=>{resolve=r;});if(mode==='denied')throw Object.assign(Error(),{status:403,apiCode:'ACCOUNT_FORBIDDEN'});if(mode==='unavailable')throw Object.assign(Error(),{status:503,apiCode:'FINANCIAL_STORAGE_UNAVAILABLE'});return structuredClone({...value,scope:{...value.scope,organization_id:'foreign-company'}});},month:value.month,scope:value.scope}),true);
 c.open();const first=c.refresh(),second=c.refresh();await Promise.resolve();assert.equal(reads,1);resolve(value);assert.equal(await first,true);assert.equal(await second,true);assert.equal(c.getSnapshot().scope.organization_id,value.scope.organization_id);assert.deepEqual(c.getVisualRows('components').map(x=>x.amount_cents),[...value.projection.result.components.map(x=>x.amount_cents),value.projection.result.amount_cents]);assert.deepEqual(c.getVisualRows('positions').map(x=>x.amount_cents),[value.projection.positions.receivables.amount_cents,value.projection.positions.wallet.held.amount_cents,value.projection.positions.wallet.available.amount_cents,value.projection.positions.transit.amount_cents,value.projection.positions.bank.amount_cents]);
 assert.deepEqual(c.getVisualRows('forecast').map(x=>x.amount_cents),[...value.projection.cash_projection.scenarios.map(x=>x.amount_cents),...value.projection.cash_projection.obligations.map(x=>x.amount_cents)]);mode='unavailable';assert.equal(await c.refresh(),false);assert.equal(c.getSnapshot().scope.organization_id,value.scope.organization_id);assert.equal(c.getState().stale,true);mode='foreign';assert.equal(await c.refresh(),false);assert.equal(c.getSnapshot(),null);
 mode='denied';assert.equal(await c.refresh(),false);assert.equal(c.getSnapshot(),null);assert.equal(c.getState().stale,false);c.stop();assert.equal(c.getSnapshot(),null);
});

test('a superseded period cannot publish a late response into the next month',async()=>{
 const value=await financialAutomationUiFixture();let resolve;const c=createFinancialAutomationController({});c.start({month:value.month,scope:value.scope,api:()=>new Promise(r=>{resolve=r;})});c.open();const first=c.refresh();await Promise.resolve();c.hide();c.observe('2026-09');resolve(value);assert.equal(await first,false);assert.equal(c.getSnapshot(),null);assert.equal(c.getState().month,'2026-09');c.stop();
});

for(const minify of [false,true])test('standalone financial browser module boots and validates real projector output '+(minify?'minified':'normal'),async()=>{
 const input=await financialAutomationUiFixture(),compiled=await build({entryPoints:[new URL('../src/financial-automation-client.mjs',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const module=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const context=vm.createContext({crypto:globalThis.crypto});vm.runInContext(module.FINANCIAL_AUTOMATION_CLIENT,context);vm.runInContext('globalThis.fixture=JSON.parse('+JSON.stringify(JSON.stringify(input))+');globalThis.brazaFinancialAutomation.start({month:fixture.month,scope:fixture.scope,api:async()=>fixture});globalThis.brazaFinancialAutomation.open();',context);
 for(let attempt=0;attempt<20;attempt++){if(vm.runInContext('!!brazaFinancialAutomation.getSnapshot()',context))break;await new Promise(r=>setTimeout(r,0));}
 assert.equal(vm.runInContext('brazaFinancialAutomation.getSnapshot()?.projection.result.amount_cents',context),input.projection.result.amount_cents,'the emitted client literal has no dangling renamed helper reference');
 vm.runInContext('brazaFinancialAutomation.stop()',context);
});
