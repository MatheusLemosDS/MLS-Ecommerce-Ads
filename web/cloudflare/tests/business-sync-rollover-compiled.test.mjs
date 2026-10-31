import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {rolloverScenarios,runRolloverScenario} from './business-sync-rollover-fixture.mjs';

for(const minify of [false,true])test(`generated App retains Brasília midnight boundaries and genuine failure/policy guards (minify=${minify})`,async t=>{
 const source=await readFile(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),seam='return {adminFetch,schedule,scheduledWork,workspaceAuthFetch};';assert.equal(source.split(seam).length,2);
 // In-memory test seam only. Production exports and routes remain unchanged.
 const text=source.replace(seam,'return {adminFetch,schedule,scheduledWork,workspaceAuthFetch,runBusinessSync,readBusinessSyncState,saveBusinessSyncPolicy};')+'\nexport {brazaAdmin as rolloverSmoke};';
 const compiled=await build({stdin:{contents:text,loader:'js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const {rolloverSmoke}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 for(const scenario of rolloverScenarios)await t.test(scenario,async child=>runRolloverScenario(child,rolloverSmoke,scenario));
});
