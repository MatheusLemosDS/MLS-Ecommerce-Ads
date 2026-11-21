import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {selectPreviewRole,assertProductionDeploymentContext,validateIsolation} from '../isolated_preview.mjs';
import {MATERIAL_CHAIN_MERGE_BASE_COMMIT} from '../release_preflight.mjs';
const root=path.resolve(import.meta.dirname,'../..'),branch='feature/order-materials-dtf-chain-20261121';
test('material chain adds its one exact isolated branch, preserves every resource, and refuses production for all three targets',()=>{
 const file='previews/isolated-builds.json',current=JSON.parse(readFileSync(path.join(root,file),'utf8')),baseline=JSON.parse(execFileSync('git',['show',MATERIAL_CHAIN_MERGE_BASE_COMMIT+':'+file],{cwd:root,encoding:'utf8'}));
 assert.deepEqual(current.authorized_branches,[...baseline.authorized_branches,branch]);
 assert.deepEqual({...current,authorized_branches:baseline.authorized_branches},baseline);
 assert.equal(validateIsolation(current),current);
 for(const role of ['app','auth','finance']){
  const context={WORKERS_CI:'1',WORKERS_CI_BRANCH:branch,WRANGLER_CI_MATCH_TAG:current.parents[role].tag};
  assert.equal(selectPreviewRole(current,context),role);
  assert.throws(()=>selectPreviewRole(current,{...context,WORKERS_CI_BRANCH:branch+'-unreviewed'}),/PREVIEW_BRANCH_NOT_AUTHORIZED/);
  assert.throws(()=>assertProductionDeploymentContext(role,root,context,{lookup:()=>assert.fail('production must be refused before native lookup')}),/WORKER_PREVIEW_PRODUCTION_DEPLOY_REFUSED/);
 }
});
