import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {compactWorkerNamespaces} from '../compact_worker_namespaces.mjs';

test('historical source scheduler namespace compaction preserves schema bytes, public names and arities',()=>{
 const raw=readFileSync(new URL('../../web/cloudflare/src/business-history-sync.mjs',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/^export /gm,''),source='const brazaBusinessHistorySync=(()=>{'+raw+'\nreturn {BUSINESS_HISTORY_SYNC_SCHEMA,runBusinessHistorySync,BusinessHistorySyncError};})();\nconst {BUSINESS_HISTORY_SYNC_SCHEMA,runBusinessHistorySync,BusinessHistorySyncError}=brazaBusinessHistorySync;\n',result=compactWorkerNamespaces({schema:'worker_server_namespaces_v1',namespaces:[{name:'brazaBusinessHistorySync',source}]});
 const observe=code=>{const context=vm.createContext({TenantInitializationMap:Map});vm.runInContext(code+';globalThis.result={schema:BUSINESS_HISTORY_SYNC_SCHEMA,runName:runBusinessHistorySync.name,runArity:runBusinessHistorySync.length,errorName:BusinessHistorySyncError.name,errorArity:BusinessHistorySyncError.length};',context);return JSON.parse(JSON.stringify(context.result));};
 assert.deepEqual(observe(result.namespaces[0].source),observe(source));assert.equal(observe(source).runName,'runBusinessHistorySync');assert.equal(observe(source).runArity,2);assert.ok(Buffer.byteLength(result.namespaces[0].source)<Buffer.byteLength(source),'private identifiers/whitespace fit the existing budget without deleting runtime guards');
});
