import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileOrderOperationsQaWorker} from '../../../tools/mls_order_operations_fixture.mjs';
import {runOrderOperationsQaOutcome,runOrderOperationsAssetFailureOutcome} from '../../../tools/mls_order_operations_visual.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const compiled=new Map();
for(const minify of [false,true])for(const width of [320,1365])test(`compiled order operations with real assets, SQLite, CAS and lifecycle ${minify?'minified':'normal'} ${width}`,{timeout:240000},async()=>{
 if(!compiled.has(minify))compiled.set(minify,compileOrderOperationsQaWorker(root,minify));
 const source=await compiled.get(minify);
 for(const theme of ['light','dark']){const result=await runOrderOperationsQaOutcome(source,{minify,width,theme});assert.equal(result.pass,true);assert.equal(result.real_hashed_assets_binding,true);assert.equal(result.committed_receipt_retry_same_uuid,true);assert.equal(result.page_errors_absent,true);}
});
for(const blockedAssetId of ['bank','orders','month'])test(`compiled order startup explains unavailable ${blockedAssetId} asset without provider fallback`,{timeout:60000},async()=>{
 if(!compiled.has(false))compiled.set(false,compileOrderOperationsQaWorker(root,false));
 const result=await runOrderOperationsAssetFailureOutcome(await compiled.get(false),{blockedAssetId});assert.equal(result.pass,true);assert.equal(result.actual_asset_status,503);assert.equal(result.unsafe_fallback_absent,true);
});
