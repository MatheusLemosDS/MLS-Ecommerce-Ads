import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';

for(const minify of [false,true])test(`compiled App scheduled collection is wired independently of login and has an owner-only audited pause (minify=${minify})`,async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const base='https://app.example.test',env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'background-session-fixture-'+ 's'.repeat(40),ADMIN_USERNAME:'background-owner',ADMIN_PASSWORD:'background-password-fixture-123456'};
 try{
  const tasks=[];await worker.scheduled({},env,{waitUntil(value){tasks.push(value);}});assert.equal(tasks.length,1);await Promise.all(tasks);
  // No internal service key is configured in this fixture, so the private
  // transport fails locally before any network request or commercial action.
  const stored=env.ADMIN_DB.db.prepare('SELECT status,summary,last_error FROM business_sync_state WHERE id=1').get();assert.equal(stored.status,'ERROR');assert.equal(stored.last_error,'BUSINESS_SYNC_COLLECTION_UNAVAILABLE');
  assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM business_sync_audit').get().n,1);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM hermes_jobs').get().n,0);
  assert.equal((await worker.fetch(new Request(base+'/api/admin/finance/sync-state'),env)).status,401);
  assert.equal((await worker.fetch(new Request(base+'/api/admin/finance/sync-state',{headers:{cookie:'mls_session=review'}}),env)).status,401);
  const login=await worker.fetch(new Request(base+'/login',{method:'POST',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);
  const cookie=login.headers.get('set-cookie').split(';')[0],current=await (await worker.fetch(new Request(base+'/api/admin/state',{headers:{cookie}}),env)).json();
  const state=await (await worker.fetch(new Request(base+'/api/admin/finance/sync-state',{headers:{cookie}}),env)).json();assert.equal(state.enabled,true);assert.equal(state.mode,'READ_ONLY');assert.equal(Object.hasOwn(state,'lease_token'),false);
  const policy=(origin,csrf)=>new Request(base+'/api/admin/finance/sync-policy',{method:'POST',headers:{cookie,origin,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({revision:state.revision,enabled:false})});
  assert.equal((await worker.fetch(policy('https://foreign.example',current.csrf),env)).status,403);assert.equal((await worker.fetch(policy(base,''),env)).status,403);
  const paused=await worker.fetch(policy(base,current.csrf),env);assert.equal(paused.status,200);assert.equal((await paused.json()).status,'PAUSED');
  assert.equal((await worker.fetch(policy(base,current.csrf),env)).status,409);
  const auditCount=env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM business_sync_audit').get().n;
  const next=[];await worker.scheduled({},env,{waitUntil(value){next.push(value);}});await Promise.all(next);
  assert.equal(env.ADMIN_DB.db.prepare('SELECT status FROM business_sync_state WHERE id=1').get().status,'PAUSED');assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM business_sync_audit').get().n,auditCount);
 }finally{env.ADMIN_DB.db.close();}
});
