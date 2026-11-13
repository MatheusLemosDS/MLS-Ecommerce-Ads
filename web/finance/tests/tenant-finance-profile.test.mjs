import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {migrateAccountDatabase,accountCommit,accountChange,accountGet} from '../../cloudflare/src/account-store.mjs';
import {resolveServiceCommercialPrincipal,tenantAuthorizationGuard} from '../../cloudflare/src/account-service.mjs';
import {commercialContextFromPrincipal,bindCommercialEnvironment} from '../../cloudflare/src/commercial-context.mjs';
import {signTenantEnvelope,verifyTenantEnvelope,TENANT_ENVELOPE_HEADER} from '../../cloudflare/src/tenant-envelope.mjs';
import {getFinanceProfile,createFinanceStore} from '../src/connection-store.mjs';
import {runFinanceProductIndex} from '../src/product-index.mjs';
import {previewExternalCashImport,mutateExternalCash,readExternalCashWorkspace} from '../src/external-cash-store.mjs';
import {readExternalCashPeriodSummary} from '../src/external-cash-period.mjs';
import {cashPreview,cashRead,cashRequestId} from './external-cash-fixture.mjs';
import {COST_SCHEMA,readProductionCosts,saveProductionCosts} from '../../cloudflare/src/production-costs.mjs';
import {costRuleSchemaForEnvironment,readCostRules} from '../../cloudflare/src/cost-rules.mjs';
import {TAX_POLICY_SCHEMA,readBusinessTaxPolicy} from '../../cloudflare/src/business-tax-policy.mjs';

// Native D1 batch returns rows for RETURNING statements. The shared lightweight
// fixture uses sqlite.run(), so retain native SQLite returning semantics here.
class ReturningD1 extends D1{prepare(sql){const statement=super.prepare(sql);if(/\bRETURNING\b/i.test(sql))statement.run=()=>statement.all();return statement;}}
const now=()=>Date.parse('2026-11-11T15:00:00Z'),stamp=now()/1000,key='SYNTHETIC-OWN-CONNECTOR-KEY',serviceSecret='synthetic-service-context-key'.repeat(2);
async function fixture(t,{profile=true}={}){
 const raw=new ReturningD1(),legacy=new D1();t.after(()=>{raw.db.close();legacy.db.close();});
 const original={ACCOUNT_DB:raw,ADMIN_DB:legacy,FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,17).toString('base64'),FINANCE_CONNECTION_ENABLED:'true',SHOPEE_FINANCE_PARTNER_KEY:'LEGACY-MUST-NOT-BE-INHERITED',ADMIN_PASSWORD:'LEGACY-PASSWORD',ADMIN_SESSION_SECRET:'LEGACY-SESSION',REVIEW_PASSWORD:'LEGACY-REVIEW',SESSION_SECRET:'LEGACY-REVIEW-SESSION',GATEWAY_SHARED_SECRET:'LEGACY-GATEWAY',HERMES_BRIDGE_SECRET:'LEGACY-BRIDGE',SHOP_ID:'1178167501',SHOPEE_LIVE_PARTNER_ID:'LEGACY-PARTNER',APP_INTERNAL_SECRET:serviceSecret,FINANCE_ROUTER_SECRET:serviceSecret};
 await migrateAccountDatabase(original,{now});const contexts=[];
 for(const [suffix,shop] of [['a',5001],['b',6001]]){
  const uid='synthetic-user-'+suffix,org='synthetic-org-'+suffix,sid='synthetic-session-'+suffix,store='same-store',p=profile?{partner_id:2049333,shop_id:shop,environment:'LIVE',region:'BRAZIL'}:null;
  await accountCommit(raw,[accountChange('user','global',{id:uid,name:'Synthetic '+suffix,email:suffix+'@example.invalid',state:'ACTIVE',auth_revision:1,preferences:{theme:'system',language:'pt-BR'}}),accountChange('session','global',{id:sid,user_id:uid,created_at:stamp,last_activity_at:stamp,expires_at:stamp+28800,revoked_at:null,mfa_complete:true,auth_revision:1,reauthenticated_at:stamp,organization_id:org,store_id:store}),accountChange('organization','global',{id:org,state:'ACTIVE',currency:'BRL',timezone:'America/Sao_Paulo'}),accountChange('membership',org,{id:uid,user_id:uid,organization_id:org,state:'ACTIVE',role:'OWNER',store_ids:null,capabilities:null}),accountChange('store',org,{id:store,organization_id:org,state:'ACTIVE',profile:p})]);
  const claims={sid,sub:uid,mid:uid,org,store,cap:'bank.write',revision:1},principal=await resolveServiceCommercialPrincipal(original,claims,{now}),context=await commercialContextFromPrincipal(principal,{requiredCapability:'bank.write'});
  const scoped=bindCommercialEnvironment(original,context,{authorizationGuard:()=>tenantAuthorizationGuard(context,context.requiredCapability,now()),...(p?{providerEnvironment:{SHOPEE_FINANCE_PARTNER_KEY:key}}:{})});contexts.push({context,scoped,claims});
 }
 return {raw,legacy,original,A:contexts[0],B:contexts[1]};
}

test('dynamic profiles use own encrypted tokens, OAuth state and provider signature; same IDs never select legacy or another company',async t=>{
 const {raw,A,B}=await fixture(t),stores=[];
 for(const entry of [A,B]){
  assert.equal(entry.scoped.ADMIN_PASSWORD,undefined);assert.equal(entry.scoped.ADMIN_SESSION_SECRET,undefined);assert.equal(entry.scoped.REVIEW_PASSWORD,undefined);assert.equal(entry.scoped.SESSION_SECRET,undefined);assert.equal(entry.scoped.GATEWAY_SHARED_SECRET,undefined);assert.equal(entry.scoped.HERMES_BRIDGE_SECRET,undefined);assert.equal(entry.scoped.SHOP_ID,undefined);assert.equal(entry.scoped.SHOPEE_LIVE_PARTNER_ID,undefined);assert.equal(entry.scoped.APP_INTERNAL_SECRET,serviceSecret);
  const store=await createFinanceStore(entry.scoped,{now});await store.setup();await store.saveTokens({access_token:'SYNTHETIC_ACCESS_'+entry.context.userId,refresh_token:'SYNTHETIC_REFRESH_'+entry.context.userId,expires_at:stamp+3600});stores.push(store);
  const expected=getFinanceProfile(entry.scoped),frame=await runFinanceProductIndex(entry.scoped,{offset:0,page_size:2,item_status:'NORMAL',now,fetchImpl:async request=>{const u=new URL(request.url);assert.equal(u.searchParams.get('shop_id'),String(expected.shop_id));assert.equal(u.searchParams.get('partner_id'),String(expected.partner_id));assert.equal(u.searchParams.get('sign'),createHmac('sha256',key).update(String(expected.partner_id)+u.pathname+stamp+'SYNTHETIC_ACCESS_'+entry.context.userId+expected.shop_id).digest('hex'));return Response.json({error:'',response:{shop_id:expected.shop_id,item:[],total_count:0,has_next_page:false,next_offset:0}});}});assert.equal(frame.shop_id,expected.shop_id);
 }
 assert.equal((await stores[0].readTokens()).access_token,'SYNTHETIC_ACCESS_'+A.context.userId);assert.equal((await stores[1].readTokens()).access_token,'SYNTHETIC_ACCESS_'+B.context.userId);
 const state=await stores[0].issueState();await assert.rejects(stores[1].consumeState(state.state,state.browser_secret),/FINANCE_INVALID_STATE/);await stores[0].consumeState(state.state,state.browser_secret);
 const row=raw.db.prepare('SELECT * FROM '+A.context.namespace+'finance_connections').get();assert.equal(row.shop_id,5001);assert.ok(!row.ciphertext.includes('SYNTHETIC_ACCESS'));
});

test('encrypted connector state cannot cross organizations even when both external profile identities are equal',async t=>{
 const {raw,original,A,B}=await fixture(t),other=await accountGet(raw,'store',B.context.organizationId,B.context.storeId);
 await accountCommit(raw,[accountChange('store',B.context.organizationId,{...other,profile:A.context.profile},other.revision)]);
 const principal=await resolveServiceCommercialPrincipal(original,B.claims,{now}),context=await commercialContextFromPrincipal(principal,{requiredCapability:'bank.write'}),scoped=bindCommercialEnvironment(original,context,{authorizationGuard:()=>tenantAuthorizationGuard(context,'bank.write',now()),providerEnvironment:{SHOPEE_FINANCE_PARTNER_KEY:key}});
 const left=await createFinanceStore(A.scoped,{now}),right=await createFinanceStore(scoped,{now});
 for(const [store,label] of [[left,'LEFT'],[right,'RIGHT']]){await store.setup();await store.saveTokens({access_token:'SYNTHETIC_'+label,refresh_token:'SYNTHETIC_REFRESH_'+label,expires_at:stamp+3600});}
 const source=raw.db.prepare('SELECT ciphertext,iv,key_fingerprint FROM '+A.context.namespace+'finance_connections').get();
 raw.db.prepare('UPDATE '+context.namespace+'finance_connections SET ciphertext=?,iv=?,key_fingerprint=?').run(source.ciphertext,source.iv,source.key_fingerprint);
 await assert.rejects(right.readTokens(),/FINANCE_TOKEN_DECRYPT_FAILED/);
 assert.equal((await left.readTokens()).access_token,'SYNTHETIC_LEFT');
 assert.equal(raw.db.prepare('SELECT status FROM '+context.namespace+'finance_connections').get().status,'REAUTH_REQUIRED');
 assert.equal(raw.db.prepare('SELECT status FROM '+A.context.namespace+'finance_connections').get().status,'CONNECTED');
});

test('real persisted membership revocation blocks UPDATE RETURNING, cash writes and an old signed service envelope atomically',async t=>{
 const {raw,original,A}=await fixture(t),store=await createFinanceStore(A.scoped,{now});await store.setup();await store.saveTokens({access_token:'SYNTHETIC_ACCESS',refresh_token:'SYNTHETIC_REFRESH',expires_at:stamp+3600});
 const request=new Request('https://finance.invalid/internal/read'),token=await signTenantEnvelope(request,A.context,{secret:serviceSecret,issuer:'auth',audience:'finance',now});
 const cash=cashPreview(),preview=await previewExternalCashImport(A.scoped,cash),{cursor,limit,...cashBody}=cash;
 const member=await accountGet(raw,'membership',A.context.organizationId,A.context.userId);await accountCommit(raw,[accountChange('membership',A.context.organizationId,{...member,state:'REMOVED'},member.revision)]);
 await assert.rejects(store.claimRefresh(1),/FINANCE_STORAGE_UNAVAILABLE/);const row=raw.db.prepare('SELECT status,revision FROM '+A.context.namespace+'finance_connections').get();assert.equal(row.status,'CONNECTED');assert.equal(row.revision,1);
 await assert.rejects(A.scoped.FINANCE_DB.prepare('UPDATE finance_connections SET revision=99 RETURNING revision').first(),/CHECK/);
 await assert.rejects(mutateExternalCash(A.scoped,{...cashBody,operation:'import',request_id:cashRequestId,expected_revision:0,preview_hash:preview.preview_hash,confirmed:true},{now}));assert.equal(raw.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name=?").get(A.context.namespace+'finance_external_cash_records').n,0);
 await assert.rejects(verifyTenantEnvelope(new Request(request,{headers:{[TENANT_ENVELOPE_HEADER]:token}}),{secret:serviceSecret,issuer:'auth',audience:'finance',resolvePrincipal:claims=>resolveServiceCommercialPrincipal(original,claims,{now}),now}));
});

test('commercial cost initialization keeps legacy monetary seeds absent and saves only explicitly supplied first values',async t=>{
 const {A,B}=await fixture(t,{profile:false});
 for(const entry of [A,B])await entry.scoped.ADMIN_DB.batch(costRuleSchemaForEnvironment(entry.scoped,[...COST_SCHEMA,...TAX_POLICY_SCHEMA]).map(sql=>entry.scoped.ADMIN_DB.prepare(sql)));
 assert.deepEqual((await readCostRules(A.scoped)).values,{rules:[]});assert.deepEqual((await readCostRules(B.scoped)).values,{rules:[]});
 await assert.rejects(readProductionCosts(A.scoped),/PRODUCTION_COSTS_CONFIGURATION_REQUIRED/);
 assert.deepEqual(await readBusinessTaxPolicy(A.scoped,2026),{revision:0,values:{regime:'MEI',year:2026,monthly_das_cents:null},updated_at:null});
 const values={mode:'all_inclusive',inclusive_regular_cents:2101,inclusive_plus_cents:3101,base_regular_cents:null,base_plus_cents:null,components:[]};
 const saved=await saveProductionCosts(A.scoped,{revision:0,values},A.context.userId);assert.equal(saved.revision,1);assert.deepEqual(saved.values,values);
 assert.equal((await A.scoped.ADMIN_DB.prepare('SELECT actor FROM production_costs_audit WHERE revision=1').first()).actor,A.context.userId);
 await assert.rejects(readProductionCosts(B.scoped),/PRODUCTION_COSTS_CONFIGURATION_REQUIRED/);
 await assert.rejects(saveProductionCosts(A.scoped,{revision:0,values},A.context.userId),/PRODUCTION_COSTS_CHANGED_RELOAD/);
});

test('cash files and period totals work without OAuth and persist actual-person events in separate immutable audit rows',async t=>{
 const {A,B}=await fixture(t,{profile:false});
 for(const [entry,amount] of [[A,11111],[B,22222]]){
  assert.equal(getFinanceProfile(entry.scoped,{optional:true}),null);assert.throws(()=>getFinanceProfile(entry.scoped),/FINANCE_CONNECTION_REQUIRED/);await assert.rejects(createFinanceStore(entry.scoped,{now}),/FINANCE_CONNECTION_REQUIRED/);
  const input=cashPreview();input.rows[0].amount_cents=amount;const preview=await previewExternalCashImport(entry.scoped,input),{cursor,limit,...body}=input;const request={...body,operation:'import',request_id:cashRequestId,expected_revision:0,preview_hash:preview.preview_hash,confirmed:true};await mutateExternalCash(entry.scoped,request,{now});assert.equal((await mutateExternalCash(entry.scoped,request,{now})).replayed,true);
  assert.equal((await readExternalCashWorkspace(entry.scoped,cashRead())).records[0].amount_cents,amount);
  const period=await readExternalCashPeriodSummary(entry.scoped,{schema:'external_cash_period_request_v1',start_date:'2026-11-01',end_date:'2026-11-30'},{now});assert.equal(period.bank.credit_cents,amount);
  const rows=(await entry.scoped.FINANCE_DB.prepare('SELECT operation,details_json FROM finance_external_cash_audit ORDER BY request_id').all()).results;assert.equal(rows.length,2);const event=JSON.parse(rows.find(row=>row.operation==='ACTOR_CONTEXT_V1').details_json);assert.equal(event.actor_user_id,entry.context.userId);assert.equal(event.organization_id,entry.context.organizationId);assert.equal(event.store_id,entry.context.storeId);
  await assert.rejects(entry.scoped.FINANCE_DB.prepare("DELETE FROM finance_external_cash_audit WHERE operation='ACTOR_CONTEXT_V1'").run(),/external_cash_immutable/);
 }
 const a=(await readExternalCashWorkspace(A.scoped,cashRead())).records[0],b=(await readExternalCashWorkspace(B.scoped,cashRead())).records[0];assert.notEqual(a.record_id,b.record_id);
});
