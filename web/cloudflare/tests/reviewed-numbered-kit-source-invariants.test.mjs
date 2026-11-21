import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {REVIEWED_COST_SOURCE_PINS,assertReviewedCostSources,normalizeReviewedNumberedKitCostSource} from './reviewed-cost-source-invariants.mjs';
import {HISTORICAL_PROFIT_REVIEWED_SOURCE_ADDITIONS as additions} from '../../../tools/tests/historical-profit-reviewed-source-fixture.mjs';

const source=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const digest=value=>createHash('sha256').update(value).digest('hex');

test('only the exact numbered-kit additions normalize to existing commercial pins and every old formula guard still runs',()=>{
 assertReviewedCostSources();
 for(const [filename,proof] of Object.entries(additions)){
  const name=filename.split('/').at(-1),observed=source(name),original=normalizeReviewedNumberedKitCostSource(name,observed);
  assert.equal(digest(observed),proof.reviewed_sha256);assert.equal(digest(original),REVIEWED_COST_SOURCE_PINS[name].commercial);assert.equal(digest(original),proof.baseline_sha256);
  assert.notEqual(original,observed);
 }
});

test('unreviewed changes inside additions or earlier formulas cannot pass the old source guard',()=>{
 for(const [name,before,after] of [
  ['cost-rules.mjs','currentCompositions=[]','currentCompositions=[{}]'],
  ['cost-rules.mjs','unit_cost_cents:1250','unit_cost_cents:1251'],
  ['production-costs.mjs',"composition.provenance!=='CURRENT_CATALOG_NUMBERED_ADULT_KIT'","composition.provenance==='CURRENT_CATALOG_NUMBERED_ADULT_KIT'"],
  ['production-costs.mjs','result=a*b','result=a+b'],
 ]){
  const observed=source(name);assert.ok(observed.includes(before));const altered=observed.replace(before,after);
  assert.equal(normalizeReviewedNumberedKitCostSource(name,altered),altered,'unknown bytes receive no normalization');
  assert.throws(()=>assertReviewedCostSources({readSource:file=>file===name?altered:source(file)}),/only exact reviewed legacy\/commercial source bytes/);
 }
 for(const name of ['business-month.mjs','incurred-production.mjs','production-coverage.mjs'])assert.equal(normalizeReviewedNumberedKitCostSource(name,source(name)),source(name),'unrelated source receives no new adapter');
});
