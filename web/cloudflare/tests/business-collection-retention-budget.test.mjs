import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFixture} from './business-collection-fixture.mjs';
import {adminFetch,scheduledWork} from '../src/admin.mjs';

test('the complete scheduled collection budget includes every explicit retention POST and all App D1 calls',async t=>{
 const f=await collectionFixture();t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});f.clock.time+=60000;
 const origin='https://synthetic-retention-budget.test';Object.assign(f.env,{ADMIN_SESSION_SECRET:'synthetic-retention-budget-session-'+'s'.repeat(32),ADMIN_USERNAME:'synthetic-budget-owner',ADMIN_PASSWORD:'synthetic-budget-password-123456'});
 const login=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:f.env.ADMIN_USERNAME,password:f.env.ADMIN_PASSWORD})}),f.env,{});assert.equal(login.status,303);
 const cookie=login.headers.get('set-cookie').split(';')[0],state=await adminFetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),f.env,{});assert.equal(state.status,200);
 const maintenance=await scheduledWork(f.env,f.services,f.now);assert.equal(maintenance.lane,'MAINTENANCE');
 for(let tick=0;tick<2;tick++){
  const before={finance:f.calls.finance.length,ads:f.calls.ads.length,retention:f.calls.retention.length};f.env.ADMIN_DB.calls=0;
  const result=await scheduledWork(f.env,f.services,f.now),finance=f.calls.finance.length-before.finance,ads=f.calls.ads.length-before.ads,retention=f.calls.retention.length-before.retention,total=f.env.ADMIN_DB.calls+finance+ads+retention;
  t.diagnostic(JSON.stringify({tick,appD1:f.env.ADMIN_DB.calls,finance,ads,retention,total}));assert.equal(result.lane,'FINANCE');assert.ok(total<=50,'all App D1 and private Finance/Ads/retention calls must fit the original 50-RPC limit');assert.ok(['RUNNING','COMPLETE'].includes(result.collection));f.clock.time+=300000;
 }
 assert.equal(f.calls.retention.some(command=>command.operation==='prepare'),true);assert.equal(f.calls.retention.some(command=>command.operation==='confirm'),true);assert.equal(f.calls.retentionInline.length>0,true);
});
