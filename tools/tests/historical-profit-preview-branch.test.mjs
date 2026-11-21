import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {selectPreviewRole,assertProductionDeploymentContext,validateIsolation} from '../isolated_preview.mjs';

const root=path.resolve(import.meta.dirname,'../..'),branch='fix/historical-profit-20261121';
test('historical profit recovery adds exactly its one isolated branch without changing any resource or existing branch',()=>{
 const file='previews/isolated-builds.json',current=JSON.parse(execFileSync('git',['show','426b1de037b075afa066ace4742e3cf398294bbf:'+file],{cwd:root,encoding:'utf8'})),baseline=JSON.parse(execFileSync('git',['show','dc784188e72c1a35dc014155e23c474b95b17cfe:'+file],{cwd:root,encoding:'utf8'}));
 assert.deepEqual(current.authorized_branches,[...baseline.authorized_branches,branch]);
 assert.deepEqual({...current,authorized_branches:baseline.authorized_branches},baseline);
 assert.equal(validateIsolation(current),current);
 for(const role of ['app','auth','finance']){
  const context={WORKERS_CI:'1',WORKERS_CI_BRANCH:branch,WRANGLER_CI_MATCH_TAG:current.parents[role].tag};
  assert.equal(selectPreviewRole(current,context),role);
  assert.throws(()=>selectPreviewRole(current,{...context,WORKERS_CI_BRANCH:branch+'-unreviewed'}),/PREVIEW_BRANCH_NOT_AUTHORIZED/);
  assert.throws(()=>assertProductionDeploymentContext(role,root,context,{lookup:()=>assert.fail('production refusal must precede native lookup')}),/WORKER_PREVIEW_PRODUCTION_DEPLOY_REFUSED/);
 }
});
