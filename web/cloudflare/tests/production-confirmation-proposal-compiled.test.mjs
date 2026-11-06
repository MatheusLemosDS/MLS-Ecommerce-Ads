import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';
import {proposalBrowserFixture} from './proposal-browser-fixture.mjs';
import {projectProductionConfirmationProposal} from '../src/production-confirmation-proposal.mjs';

class ObservedD1 extends D1{constructor(){super();this.sql=[];}prepare(sql){this.sql.push(sql);return super.prepare(sql);}}
for(const minify of [false,true])test(`compiled production proposal is owner-only, GET-only and cold SELECT-only (minify=${minify})`,async t=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'))).default;
 const origin='https://proposal.synthetic.invalid',db=new ObservedD1(),fixture=await proposalBrowserFixture();
 t.after(()=>{db.db.close();fixture.close();});
 const credentials={ADMIN_SESSION_SECRET:'synthetic-proposal-session-'+'s'.repeat(32),ADMIN_USERNAME:'proposal-synthetic-owner',ADMIN_PASSWORD:'proposal-synthetic-password-123456'},env={...credentials,ADMIN_DB:db};
 const login=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
 const base=origin+'/api/admin/production/proposal',query='?source_key='+'a'.repeat(64)+'&source_hash='+'b'.repeat(64),oldFetch=globalThis.fetch;let providerCalls=0;
 globalThis.fetch=async()=>{providerCalls++;throw Error('PROPOSAL_MUST_NOT_CALL_A_PROVIDER');};t.after(()=>{globalThis.fetch=oldFetch;});
 const call=(suffix=query,options={},target=env)=>worker.fetch(new Request(base+suffix,{...options,headers:{cookie,...options.headers}}),target);
 db.sql=[];
 assert.equal((await worker.fetch(new Request(base+query),env)).status,401);
 for(const method of ['HEAD','POST','PUT','PATCH','DELETE','OPTIONS'])assert.equal((await call(query,{method})).status,405,method+' is not permitted');
 for(const suffix of ['', '?source_key='+'a'.repeat(64),query+'&source_key='+'a'.repeat(64),query+'&source_hash='+'b'.repeat(64),query+'&extra=1','?source_key=bad&source_hash='+'b'.repeat(64),'?source_key='+'A'.repeat(64)+'&source_hash='+'b'.repeat(64),'?source_key='+'a'.repeat(64)+'&source_hash='+('b'.repeat(63))])assert.equal((await call(suffix)).status,400,'malformed or ambiguous query is rejected');
 assert.equal(db.sql.length,0,'auth/method/query gates execute before any storage lookup');
 const cold=await call();assert.equal(cold.status,200);assert.match(cold.headers.get('cache-control'),/no-store/);const unknown=await cold.json();assert.ok(projectProductionConfirmationProposal(unknown));assert.equal(unknown.state,'UNAVAILABLE');assert.equal(unknown.cost.unit_cost_cents,null);assert.equal(unknown.composition.components.length,0);
 assert.equal(db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);assert.ok(db.sql.length>0);assert.ok(db.sql.every(sql=>/^SELECT\b/.test(sql)),JSON.stringify(db.sql));
 const before=fixture.canonical(),source=fixture.sources.kit,savedEnv={...credentials,ADMIN_DB:fixture.env.ADMIN_DB};
 const savedQuery='?source_key='+source.key+'&source_hash='+source.hash,observed=[];
 const originalPrepare=fixture.env.ADMIN_DB.prepare.bind(fixture.env.ADMIN_DB);fixture.env.ADMIN_DB.prepare=sql=>{observed.push(sql);return originalPrepare(sql);};
 const saved=await call(savedQuery,{},savedEnv);assert.equal(saved.status,200);const value=await saved.json();assert.ok(projectProductionConfirmationProposal(value));assert.equal(value.source.key,source.key);assert.equal(value.source.hash,source.hash);assert.equal(value.source.selling_quantity,2);assert.equal(value.composition.components.length,2);assert.equal(value.cost.scope,'COMMERCIAL_UNIT');assert.equal(value.cost.unit_cost_cents,3180);assert.equal(value.cost.basis,'CURRENT_REGISTERED_COST_NOT_HISTORICAL_MANUFACTURING');assert.equal(value.composition.components.every(row=>row.identity.artwork===null),true);
 const stale=await call('?source_key='+source.key+'&source_hash='+'f'.repeat(64),{},savedEnv);assert.equal(stale.status,409);assert.deepEqual(await stale.json(),{error:'PRODUCTION_CONFIRMATION_PROPOSAL_SOURCE_CHANGED'});
 assert.ok(observed.length>0);assert.ok(observed.every(sql=>/^SELECT\b/.test(sql)),JSON.stringify(observed));assert.equal(fixture.canonical(),before,'route reads never change sales, catalogue, ledger, cost versions or audit');assert.equal(providerCalls,0);
 const encoded=await call('?%73ource_key='+source.key+'&source_hash='+source.hash,{},savedEnv);assert.equal(encoded.status,200,'one decoded canonical query key remains unambiguous');
 const reversed=await call('?source_hash='+source.hash+'&source_key='+source.key,{},savedEnv);assert.equal(reversed.status,200,'query order does not alter the selected source');
 assert.equal(fixture.canonical(),before);assert.equal(providerCalls,0);
});
