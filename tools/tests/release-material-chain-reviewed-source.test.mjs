import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {MATERIAL_CHAIN_REVIEWED_SOURCE_DELTAS as deltas,MATERIAL_CHAIN_REVIEWED_POLICY as policy,restoreSourceBeforeMaterialChain as restore} from './release-material-chain-review-fixture.mjs';
import {MATERIAL_CHAIN_MERGE_BASE_COMMIT,MATERIAL_CHAIN_BASE_PREFLIGHT_SHA256,MATERIAL_CHAIN_RELEASE_ID,MATERIAL_CHAIN_ALLOWED_FILES,MATERIAL_CHAIN_FROZEN_FILES,OPERATING_INCREMENT_FROZEN_FILES,materialChainPriorVerifierMatchesBaseline,operatingIncrementPriorVerifierMatchesBaseline,historicalProfitPriorVerifierMatchesBaseline,financeCompletionPriorVerifierMatchesBaseline} from '../release_preflight.mjs';
import {APP_RELEASE} from '../../web/cloudflare/src/app-release.mjs';
import {normalizeReviewedMaterialChainCostSource,normalizeReviewedNumberedKitCostSource,assertReviewedCostSources} from '../../web/cloudflare/tests/reviewed-cost-source-invariants.mjs';

const root=new URL('../../',import.meta.url),digest=value=>createHash('sha256').update(value).digest('hex');
const source=filename=>readFileSync(new URL(filename,root),'utf8');
const git=(commit,filename)=>execFileSync('git',['show',commit+':'+filename],{cwd:root,encoding:'utf8'});
const reviewed132='de0bb72e583a84d86b20952e55b352722996cbed';

test('material linkage targets the actual integrated operating main, identifies code21.4 and never grants publication or external writes',()=>{
 assert.match(MATERIAL_CHAIN_MERGE_BASE_COMMIT,/^[a-f0-9]{40}$/);
 assert.notEqual(MATERIAL_CHAIN_MERGE_BASE_COMMIT,'426b1de037b075afa066ace4742e3cf398294bbf');
 const baseline=git(MATERIAL_CHAIN_MERGE_BASE_COMMIT,'tools/release_preflight.mjs');
 assert.equal(digest(baseline),MATERIAL_CHAIN_BASE_PREFLIGHT_SHA256);assert.equal(digest(baseline),policy.baseline_sha256);
 assert.equal(MATERIAL_CHAIN_RELEASE_ID,'2026-11-21.4');assert.equal(APP_RELEASE.id,MATERIAL_CHAIN_RELEASE_ID);
 for(const name of ['finance-completion','historical-profit','operating-increment','material-chain']){
  const candidate=JSON.parse(source('tools/release-'+name+'-candidate.json'));
  assert.equal(candidate.production_approved,false);assert.equal(candidate.live_authorization,false);assert.equal(candidate.commercial_writes_allowed,false);
 }
 const workflow=source('.github/workflows/validate.yml');assert.doesNotMatch(workflow,/wrangler\s+(?:deploy|publish)|npm\s+run\s+deploy|worker_deploy\.mjs\s+deploy/);
});

test('removing only the two exact new policy sections restores all previous verifiers and their complete original bytes',()=>{
 const current=source('tools/release_preflight.mjs'),baseline=git(MATERIAL_CHAIN_MERGE_BASE_COMMIT,'tools/release_preflight.mjs');
 assert.equal(digest(current),policy.reviewed_sha256);assert.equal(restore('tools/release_preflight.mjs',current),baseline);
 assert.equal(materialChainPriorVerifierMatchesBaseline(current,baseline),true);
 assert.equal(operatingIncrementPriorVerifierMatchesBaseline(current,git('426b1de037b075afa066ace4742e3cf398294bbf','tools/release_preflight.mjs')),true);
 assert.equal(historicalProfitPriorVerifierMatchesBaseline(current,git('dc784188e72c1a35dc014155e23c474b95b17cfe','tools/release_preflight.mjs')),true);
 assert.equal(financeCompletionPriorVerifierMatchesBaseline(current,git('4cfdf465b2fda58dd27ae693126b7fe1625f69d6','tools/release_preflight.mjs')),true);
 for(const mutate of [s=>s+'\n',s=>s.replace('if(!validOperatingIncrementCandidate(candidate))','if(false)'),s=>s.replace('if(!validFinanceCompletionCandidate(candidate))','if(false)'),s=>s.replace(' // BEGIN MATERIAL_CHAIN_DISPATCH_V1\n',' // CHANGED MATERIAL_CHAIN_DISPATCH_V1\n')]){
  const changed=mutate(current);assert.equal(restore('tools/release_preflight.mjs',changed),null);assert.equal(materialChainPriorVerifierMatchesBaseline(changed,baseline),false);
 }
 for(const {begin,end,sha256} of policy.sections){assert.ok(Object.isFrozen(policy.sections));assert.equal(current.split(begin).length,2);assert.equal(current.split(end).length,2);assert.equal(digest(current.slice(current.indexOf(begin),current.indexOf(end)+end.length)),sha256);}
});

test('every separately reviewed UI/error/wrapper/test adapter reconstructs its exact previous source, with no generic source acceptance',()=>{
 const expected=[
  'tools/tests/operating-integration-gates.test.mjs',
  'tools/tests/release-finance-completion-preflight.test.mjs',
  'tools/tests/release-historical-profit-preflight.test.mjs',
  'tools/tests/release-operating-increment-preflight.test.mjs',
  'web/cloudflare/src/agent-registry-view.mjs',
  'web/cloudflare/src/incurred-production.mjs',
  'web/cloudflare/src/production-weekly-payments.mjs',
  'web/cloudflare/tests/production-closing-workspace-chrome.test.mjs',
  'web/cloudflare/tests/reviewed-cost-source-invariants.mjs',
 ].sort();
 assert.deepEqual(Object.keys(deltas).sort(),expected);assert.ok(Object.isFrozen(deltas));
 for(const [filename,proof] of Object.entries(deltas)){
  const before=git(reviewed132,filename),current=source(filename);
  assert.ok(MATERIAL_CHAIN_ALLOWED_FILES.includes(filename),filename);assert.ok(Object.isFrozen(proof));assert.ok(Object.isFrozen(proof.patches));assert.equal(digest(before),proof.baseline_sha256);assert.equal(digest(current),proof.reviewed_sha256);assert.equal(restore(filename,current),before);
  let forward=before,previous=-1;
  for(const patch of proof.patches){assert.ok(Object.isFrozen(patch));assert.ok(Number.isSafeInteger(patch.offset)&&patch.offset>previous);previous=patch.offset;assert.ok(patch.added.length||patch.removed.length);assert.equal(forward.slice(patch.offset,patch.offset+patch.removed.length),patch.removed);forward=forward.slice(0,patch.offset)+patch.added+forward.slice(patch.offset+patch.removed.length);}
  assert.equal(forward,current,'only literal reviewed differences may be reversed: '+filename);
  for(const altered of [current+'\n',current.slice(1),'x'+current.slice(1),current.replace('return','throw')])assert.equal(restore(filename,altered),null,filename);
  for(const patch of proof.patches)assert.equal(restore(filename,current.slice(0,patch.offset)+'x'+current.slice(patch.offset)),null,filename+':'+patch.offset);
 }
});

test('material error409 mapping adds no financial formula and the original full-source and direct-section guards still reject mutations',()=>{
 const filename='web/cloudflare/src/incurred-production.mjs',current=source(filename),before=git(reviewed132,filename);
 const addition="if(typeof error?.message==='string'&&error.message.includes('MLS_MATERIAL_PRODUCTION_LINK_ACTIVE'))throw new IncurredProductionError('INCURRED_PRODUCTION_MATERIAL_LINK_ACTIVE',409);";
 assert.equal(current,before.replace(" catch(error){if(typeof error?.message==='string'&&error.message.includes('MLS_RETURN_MANUFACTURING_LINK_ACTIVE'))"," catch(error){"+addition+"if(typeof error?.message==='string'&&error.message.includes('MLS_RETURN_MANUFACTURING_LINK_ACTIVE'))"));
 assert.equal(current.split(addition).length,2);assert.equal(current.replace(addition,''),before);
 assert.equal(normalizeReviewedMaterialChainCostSource('incurred-production.mjs',current),before);
 assert.equal(normalizeReviewedNumberedKitCostSource('incurred-production.mjs',current),current,'existing numbered-kit adapter remains unchanged');
 assertReviewedCostSources();
 for(const [from,to] of [["INCURRED_PRODUCTION_MATERIAL_LINK_ACTIVE',409","INCURRED_PRODUCTION_MATERIAL_LINK_ACTIVE',200"],['new TenantInitializationSet()','new WeakSet()'],['BigInt(row.quantity)*BigInt(row.cost.unit_cost_cents)','BigInt(row.quantity)+BigInt(row.cost.unit_cost_cents)']]){
  assert.ok(current.includes(from));const changed=current.replace(from,to);assert.equal(normalizeReviewedMaterialChainCostSource('incurred-production.mjs',changed),changed);assert.throws(()=>assertReviewedCostSources({readSource:name=>name==='incurred-production.mjs'?changed:source('web/cloudflare/src/'+name)}),/only exact reviewed legacy\/commercial source bytes/);
 }
});

test('weekly linkage exposes only the same existing validated payment ledger without a new formula or mutation',()=>{
 const filename='web/cloudflare/src/production-weekly-payments.mjs',current=source(filename),before=git(reviewed132,filename);
 const addition="// Reuse the same validated ledger projection in operational weekly reads.\n// This exposes no new command, money movement, or accounting calculation.\nexport function projectProductionWeeklyPaymentLedger(value,revision){\n if(!integer(revision,1))fail('REVISION_INVALID');\n return selected(value,revision);\n}\n";
 assert.equal(current.split(addition).length,2);assert.equal(current.replace(addition,''),before);
 assert.equal(restore(filename,current),before);
 for(const changed of [current.replace('return selected(value,revision);','return selected(value,revision+1);'),current+'\n'])assert.equal(restore(filename,changed),null);
});

test('all previous financial frozen pins remain authoritative or have exactly one finite separately reviewed source proof',()=>{
 const exceptions=Object.keys(OPERATING_INCREMENT_FROZEN_FILES).filter(filename=>!Object.hasOwn(MATERIAL_CHAIN_FROZEN_FILES,filename)).sort();
 assert.deepEqual(exceptions,[
  'tools/tests/release-finance-completion-preflight.test.mjs',
  'web/cloudflare/src/agent-registry-view.mjs',
  'web/cloudflare/src/incurred-production.mjs',
  'web/cloudflare/tests/production-closing-workspace-chrome.test.mjs',
  'web/cloudflare/tests/reviewed-cost-source-invariants.mjs',
 ].sort());
 for(const [filename,sha256] of Object.entries(OPERATING_INCREMENT_FROZEN_FILES)){
  if(exceptions.includes(filename)){assert.equal(deltas[filename].baseline_sha256,sha256);assert.equal(digest(restore(filename,source(filename))),sha256);}
  else assert.equal(MATERIAL_CHAIN_FROZEN_FILES[filename],sha256,filename);
 }
 const frozen132='tools/tests/operating-integration-review-fixture.mjs';assert.equal(digest(source(frozen132)),MATERIAL_CHAIN_FROZEN_FILES[frozen132]);
 for(const filename of ['web/cloudflare/src/cost-rules.mjs','web/cloudflare/src/production-costs.mjs','web/cloudflare/src/numbered-adult-kit-costs.mjs','web/cloudflare/src/physical-shirt-stock.mjs'])assert.equal(digest(source(filename)),MATERIAL_CHAIN_FROZEN_FILES[filename]);
});
