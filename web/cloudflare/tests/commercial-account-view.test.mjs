import test from 'node:test';
import assert from 'node:assert/strict';
import {commercialAccountRoute,renderCommercialAccountPage} from '../src/commercial-account-view.mjs';
import {COMMERCIAL_ACCOUNT_CLIENT} from '../src/commercial-account-client.mjs';

const pages={'/register':'register','/account/register':'register','/account/login':'login','/verify-email':'verify','/forgot-password':'forgot','/reset-password':'reset','/invitations/accept':'invitation','/companies':'companies','/companies/new':'new-company','/onboarding':'onboarding','/account/profile':'profile','/account/security':'security','/account/security/events':'events','/account/sessions':'sessions','/account/preferences':'preferences','/account/notifications':'notifications','/account/help':'help','/account/data':'data'};

test('every public, personal and company route renders one accessible real account controller',async()=>{
 const routes={...pages,...Object.fromEntries(['settings','team','stores','billing','audit','onboarding'].map(page=>['/companies/synthetic-company/'+page,page]))};
 for(const [path,page] of Object.entries(routes)){const route=commercialAccountRoute(path);assert.equal(route.page,page);assert.equal(route.company,path.includes('synthetic-company')?'synthetic-company':null);const response=renderCommercialAccountPage(new Request('https://app.example.test'+path),{release:{label:'Synthetic V4 candidate'}});assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');const html=await response.text();assert.equal((html.match(/id="accountMain"/g)||[]).length,1);assert.match(html,/Pular para o conteúdo/);assert.match(html,/lang="pt-BR"/);assert.match(html,/name="viewport"/);assert.ok(html.includes(COMMERCIAL_ACCOUNT_CLIENT));assert.ok(html.includes('globalThis.__mlsAccountPage='+JSON.stringify(route)));assert.match(html,/Synthetic V4 candidate/);assert.doesNotMatch(html,/<iframe|<canvas|src="https?:\/\//);}
});

test('account pages reject unsupported methods and paths without confusing legacy login or protected app',()=>{
 for(const path of ['/login','/admin','/api/account/login','/companies/../settings','/companies/abc/unknown','/companies/a%2fb/settings'])assert.equal(commercialAccountRoute(path),null,path);
 assert.equal(renderCommercialAccountPage(new Request('https://app.example.test/admin')),null);
 for(const method of ['POST','PATCH','DELETE']){const result=renderCommercialAccountPage(new Request('https://app.example.test/register',{method}));assert.equal(result.status,405);assert.equal(result.headers.get('allow'),'GET');}
});

test('release text is escaped and link tokens are absent from server-rendered account configuration',async()=>{
 const html=await renderCommercialAccountPage(new Request('https://app.example.test/reset-password#token=synthetic-secret'),{release:{label:'<img src=x onerror=alert(1)>'}}).text();assert.ok(!html.includes('synthetic-secret'));assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
});
