import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {selectPreviewRole,assertProductionDeploymentContext} from '../isolated_preview.mjs';

const root=path.resolve(import.meta.dirname,'../..'),branch='fix/finance-completion-20261120';
test('Finance repair adds only its exact reviewed branch to the existing isolated preview policy',()=>{
 const file='previews/isolated-builds.json',current=JSON.parse(readFileSync(path.join(root,file),'utf8')),prior=JSON.parse(execFileSync('git',['show','4cfdf465b2fda58dd27ae693126b7fe1625f69d6:'+file],{cwd:root,encoding:'utf8'}));
 assert.deepEqual(current.authorized_branches,[...prior.authorized_branches,branch]);assert.deepEqual({...current,authorized_branches:prior.authorized_branches},prior,'identities, resources and production policy remain exact');
 for(const role of ['app','auth','finance']){
  const context={WORKERS_CI:'1',WORKERS_CI_BRANCH:branch,WRANGLER_CI_MATCH_TAG:current.parents[role].tag};assert.equal(selectPreviewRole(current,context),role);
  assert.throws(()=>selectPreviewRole(current,{...context,WORKERS_CI_BRANCH:branch+'-unreviewed'}),/PREVIEW_BRANCH_NOT_AUTHORIZED/);
  assert.throws(()=>assertProductionDeploymentContext(role,root,context,{lookup:()=>assert.fail('a preview branch must be refused before any native lookup')}),/WORKER_PREVIEW_PRODUCTION_DEPLOY_REFUSED/);
 }
});
