import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {FINANCE_COMPLETION_FROZEN_FILES,FINANCE_COMPLETION_MERGE_BASE_COMMIT} from '../release_preflight.mjs';
import {HISTORICAL_PROFIT_REVIEWED_SOURCE_ADDITIONS as additions,HISTORICAL_PROFIT_REVIEWED_KIT_HELPER as helper,restoreFinanceSourceBeforeNumberedKitAddition as restore} from './historical-profit-reviewed-source-fixture.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url)),digest=value=>createHash('sha256').update(value).digest('hex');

test('finite numbered-kit additions reconstruct the original pinned Finance sources byte for byte',()=>{
 assert.deepEqual(Object.keys(additions).sort(),['web/cloudflare/src/cost-rules.mjs','web/cloudflare/src/production-costs.mjs']);
 assert.ok(Object.isFrozen(additions));
 for(const [filename,proof] of Object.entries(additions)){
  assert.equal(proof.baseline_sha256,FINANCE_COMPLETION_FROZEN_FILES[filename]);assert.ok(Object.isFrozen(proof));assert.ok(Object.isFrozen(proof.patches));
  const previous=spawnSync('git',['show',FINANCE_COMPLETION_MERGE_BASE_COMMIT+':'+filename],{cwd:root,encoding:'utf8'});assert.equal(previous.status,0,previous.stderr);assert.equal(digest(previous.stdout),proof.baseline_sha256);assert.equal(restore(filename,previous.stdout),null,'omitting the reviewed addition is not this candidate');
  const current=fs.readFileSync(path.join(root,filename),'utf8');assert.equal(digest(current),proof.reviewed_sha256);assert.equal(restore(filename,current),previous.stdout);
  let forward=previous.stdout,last=-1;
  for(const patch of proof.patches){
   assert.ok(Object.isFrozen(patch));assert.ok(Number.isSafeInteger(patch.offset)&&patch.offset>last);last=patch.offset;assert.ok(patch.added.length||patch.removed.length);
   const offset=patch.offset;assert.equal(forward.slice(offset,offset+patch.removed.length),patch.removed);
   forward=forward.slice(0,offset)+patch.added+forward.slice(offset+patch.removed.length);
  }
  assert.equal(forward,current,'only the finite literal additions may differ');
  assert.equal(digest(restore(filename,current)),proof.baseline_sha256);
 }
});

test('each added fragment, surrounding legacy byte and exact source length remains protected',()=>{
 for(const [filename,proof] of Object.entries(additions)){
  const source=fs.readFileSync(path.join(root,filename),'utf8');
  for(const altered of [source+'\n',source.slice(1),'x'+source.slice(1),source.replace('return','throw'),source.replace('export','disabled')])assert.equal(restore(filename,altered),null,filename);
  for(const patch of proof.patches){
   const mutations=[source.slice(0,patch.offset)+'x'+source.slice(patch.offset)];
   if(patch.added.length)mutations.push(source.slice(0,patch.offset)+source.slice(patch.offset+patch.added.length),source.slice(0,patch.offset)+patch.added+source.slice(patch.offset));
   for(const altered of mutations)assert.equal(restore(filename,altered),null,filename+':'+patch.offset);
  }
 }
 for(const filename of ['tools/worker_deploy.mjs','tools/release_preflight.mjs','web/cloudflare/src/business-month.mjs','../cost-rules.mjs','web/cloudflare/src/*','__proto__'])assert.equal(restore(filename,'arbitrary'),null);
 assert.equal(restore(null,'arbitrary'),null);assert.equal(restore('web/cloudflare/src/cost-rules.mjs',null),null);
});

test('the numbered-kit helper itself has exact reviewed bytes and grants no release authority',()=>{
 assert.equal(helper.path,'web/cloudflare/src/numbered-adult-kit-costs.mjs');assert.ok(Object.isFrozen(helper));
 const source=fs.readFileSync(path.join(root,helper.path),'utf8');assert.equal(digest(source),helper.sha256);assert.notEqual(digest(source+'\n'),helper.sha256);
 const fixture=fs.readFileSync(new URL('./historical-profit-reviewed-source-fixture.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(fixture,/production_approved\s*:\s*true|live_authorization\s*:\s*true|commercial_writes_allowed\s*:\s*true/);
 assert.equal(Object.hasOwn(FINANCE_COMPLETION_FROZEN_FILES,helper.path),false,'new helper does not replace an earlier frozen-source entry');
});
