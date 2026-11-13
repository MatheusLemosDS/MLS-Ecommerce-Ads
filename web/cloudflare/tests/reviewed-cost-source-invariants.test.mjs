import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {assertReviewedCostSources} from './reviewed-cost-source-invariants.mjs';

test('reviewed commercial adapters preserve the complete original financial source and direct formula sections',()=>assertReviewedCostSources());
test('the exact previous source variant remains recognized without broadening the legacy baseline',()=>{
 assertReviewedCostSources({readSource:name=>execFileSync('git',['show','bd01f64d7e290abb259e9c9dc2646496494a87f0:web/cloudflare/src/'+name],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'})});
});
test('unreviewed formula and initialization changes are rejected by exact source fingerprints',()=>{
 for(const [name,before,after] of [['cost-rules.mjs','unit_cost_cents:1250','unit_cost_cents:1251'],['production-costs.mjs','result=a*b','result=a+b'],['business-month.mjs','withExpenseSchedule=false','withExpenseSchedule=true'],['incurred-production.mjs','new TenantInitializationSet()','new WeakSet()']]){
  const source=readFileSync(new URL('../src/'+name,import.meta.url),'utf8');assert.ok(source.includes(before),name+' mutation exists');
  assert.throws(()=>assertReviewedCostSources({readSource:file=>file===name?source.replace(before,after):readFileSync(new URL('../src/'+file,import.meta.url),'utf8')}),/only exact reviewed legacy\/commercial source bytes/);
 }
});
