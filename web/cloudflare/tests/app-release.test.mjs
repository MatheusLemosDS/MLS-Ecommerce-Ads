import test from 'node:test';
import assert from 'node:assert/strict';
import {APP_RELEASE,releaseInfo} from '../src/app-release.mjs';

test('the human release identifier is static, frozen and safe for an HTTP header',()=>{
 assert.equal(Object.isFrozen(APP_RELEASE),true);
 assert.deepEqual(APP_RELEASE,{id:'2026-11-01.1',label:'Navegação e novidades',date:'01/11/2026'});
 assert.match(APP_RELEASE.id,/^[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]+$/);
 assert.doesNotMatch(APP_RELEASE.id,/[\r\n]/);
 assert.throws(()=>{APP_RELEASE.id='another-release';},TypeError);
});

test('the release getter returns a closed serializable DTO without sharing mutable response state',()=>{
 const first=releaseInfo(),second=releaseInfo();
 assert.deepEqual(first,{schema:'app_release_v1',id:'2026-11-01.1',label:'Navegação e novidades',date:'01/11/2026'});
 assert.deepEqual(Object.keys(first).sort(),['date','id','label','schema']);
 assert.deepEqual(JSON.parse(JSON.stringify(first)),first);
 assert.notEqual(first,second);
 first.label='Changed by a local consumer';first.private_data='must not propagate';
 assert.deepEqual(releaseInfo(),second);
 assert.equal(APP_RELEASE.label,'Navegação e novidades');
});

test('release information remains available without environment, database or provider capabilities',()=>{
 const unavailable=new Proxy({},{get(){throw Error('A release identifier must not read a runtime capability');}});
 assert.equal(releaseInfo.length,0);
 assert.deepEqual(releaseInfo(unavailable,unavailable),releaseInfo());
});

test('owner release-info enforces session, role, GET and query guards without touching business storage or providers',async()=>{
 const {adminFetch}=await import('../src/admin.mjs');
 let databaseAccesses=0,providerAccesses=0;
 const env={ADMIN_USERNAME:'synthetic-owner',ADMIN_PASSWORD:'synthetic-owner-password',ADMIN_SESSION_SECRET:'a'.repeat(64),REVIEW_USERNAME:'synthetic-review',REVIEW_PASSWORD:'synthetic-review-password',SESSION_SECRET:'r'.repeat(64)};
 Object.defineProperty(env,'ADMIN_DB',{get(){databaseAccesses++;throw Error('Business storage is unavailable in this regression');}});
 const providers=new Proxy({},{get(){providerAccesses++;throw Error('Providers must not be consulted for a release identifier');}}),origin='https://release.test',url=origin+'/api/admin/release-info';
 const login=async(username,password)=>{
  const response=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password})}),env,providers);
  assert.equal(response.status,303);return response.headers.get('set-cookie').split(';')[0];
 };
 const anonymous=await adminFetch(new Request(url),env,providers);assert.equal(anonymous.status,401);assert.deepEqual(await anonymous.json(),{error:'UNAUTHORIZED'});
 const cookie=await login(env.ADMIN_USERNAME,env.ADMIN_PASSWORD),request=(suffix='',options={})=>adminFetch(new Request(url+suffix,{...options,headers:{cookie,...options.headers}}),env,providers);
 const owner=await request();assert.equal(owner.status,200);assert.equal(owner.headers.get('cache-control'),'no-store');assert.equal(owner.headers.get('x-mls-app-release'),APP_RELEASE.id);assert.equal(owner.headers.get('x-content-type-options'),'nosniff');
 const value=await owner.json();assert.deepEqual(value,releaseInfo());assert.deepEqual(Object.keys(value).sort(),['date','id','label','schema']);
 for(const method of ['POST','HEAD']){const response=await request('',{method});assert.equal(response.status,405);assert.equal(response.headers.get('x-mls-app-release'),APP_RELEASE.id);}
 const query=await request('?extra=1');assert.equal(query.status,400);assert.deepEqual(await query.json(),{error:'APP_RELEASE_REQUEST_INVALID'});
 const reviewCookie=await login(env.REVIEW_USERNAME,env.REVIEW_PASSWORD),review=await adminFetch(new Request(url,{headers:{cookie:reviewCookie}}),env,providers);assert.equal(review.status,401);assert.deepEqual(await review.json(),{error:'UNAUTHORIZED'});
 assert.equal(databaseAccesses,0);assert.equal(providerAccesses,0);
});
