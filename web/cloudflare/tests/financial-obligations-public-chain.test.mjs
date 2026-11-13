import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {adminFetch} from '../src/admin.mjs';
import {createAccountService,readLocalAccountOutbox,resolveAccountSession,resolveCommercialPrincipal,tenantAuthorizationGuard} from '../src/account-service.mjs';
import {handleAccountRequest} from '../src/account-worker.mjs';
import {accountGet,accountChange,accountCommit} from '../src/account-store.mjs';
import {accountToken} from '../src/account-crypto.mjs';
import {commercialContextFromPrincipal,bindCommercialEnvironment} from '../src/commercial-context.mjs';
import {createCommercialAuthWorker} from '../src/commercial-auth-worker.mjs';
import {createCommercialFinanceWorker} from '../../finance/src/commercial-finance-worker.mjs';
import {TENANT_ENVELOPE_HEADER,forwardTenantEnvelope} from '../src/tenant-envelope.mjs';
import {FINANCIAL_OBLIGATION_PATH,projectFinancialObligationResponse,financialObligationSnapshotHash} from '../../finance/src/financial-obligation-frame.mjs';
import {BUSINESS_MONTH_SCHEMA} from '../src/business-month.mjs';
import {readExpenseLedger,mutateExpenseLedger} from '../src/expense-ledger.mjs';

const appOrigin='https://app.brazacommerce.com.br',authOrigin='https://auth.brazacommerce.com.br',month=new Date().toISOString().slice(0,7);
const appSecret='synthetic-public-app-secret-'.repeat(2),routerSecret='synthetic-public-finance-secret-'.repeat(2);
const validateInternalApp=(request,env)=>request.headers.get('x-braza-app-key')===env.APP_INTERNAL_SECRET;
const claims=token=>JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString());
async function fixture(t){
  const env={ACCOUNT_DB:new D1(),ADMIN_DB:new D1(),FINANCE_DB:new D1(),APP_INTERNAL_SECRET:appSecret,FINANCE_ROUTER_SECRET:routerSecret,FINANCE_CONNECTION_ENABLED:'false',ACCOUNT_ENCRYPTION_KEY:accountToken(),ACCOUNT_MAIL_MODE:'LOCAL_TEST_ONLY'};
  const options={local:true,test:true,passwordIterations:1000},service=await createAccountService(env,options),password='Synthetic obligations passphrase 1369';
  await service.register({name:'Pessoa de teste',email:'obligation-chain@example.test',password},'synthetic-origin');
  const mail=(await readLocalAccountOutbox(env,options)).find(row=>row.purpose==='EMAIL_VERIFICATION');await service.confirmVerification({token:mail.message.token});
  const login=await service.login({email:'obligation-chain@example.test',password},'synthetic-origin'),cookie='__Host-mls_account='+login.token,session=await resolveAccountSession(new Request(appOrigin,{headers:{cookie}}),env,options);
  const accountCall=async(path,body)=>{const response=await handleAccountRequest(new Request(appOrigin+path,{method:'POST',headers:{cookie,origin:appOrigin,'content-type':'application/json','x-csrf-token':session.csrf},body:JSON.stringify(body)}),env,options);assert.equal(response.status,200,await response.clone().text());return response.json();};
  const company=(await accountCall('/api/companies',{name:'Empresa de teste',confirmed:true,request_id:crypto.randomUUID()})).organization;
  const store=(await accountCall('/api/companies/'+company.id+'/stores',{name:'Loja de teste',platform:'SHOPEE',confirmed:true,request_id:crypto.randomUUID()})).store;
  const principal=await resolveCommercialPrincipal(new Request(appOrigin,{headers:{cookie}}),env,{...options,organizationId:company.id,storeId:store.id,capability:'finance.write'});
  const context=await commercialContextFromPrincipal(principal,{requiredCapability:'finance.write'}),scoped=bindCommercialEnvironment(env,context,{authorizationGuard:()=>tenantAuthorizationGuard(principal,'finance.write')});
  await scoped.ADMIN_DB.batch(BUSINESS_MONTH_SCHEMA.map(sql=>scoped.ADMIN_DB.prepare(sql)));
  const initial=await readExpenseLedger(scoped,{month});
  const saved=await mutateExpenseLedger(scoped,{action:'save',month,revision:initial.revision,request_id:crypto.randomUUID(),entry:{id:null,category:'BILL',description:'SYNTHETIC_PRIVATE_EXPENSE_DESCRIPTION',amount_cents:13500,competence_month:month,due_date:month+'-20',status:'OPEN',paid_date:null},installments:1},principal.userId);
  const trace={app:[],finance:[],legacy:0,provider:0},finance=createCommercialFinanceWorker(),auth=createCommercialAuthWorker({fetch:async()=>{trace.legacy++;throw Error('new private route cannot fall through');}},{...options,validateInternalApp});
  const f={env,options,cookie,csrf:session.csrf,company,store,principal,scoped,saved,trace,auth,beforeFinance:null,afterFinance:null,accountCall};
  env.SHOPEE_FINANCE_SERVICE={fetch:async request=>{
    if(f.beforeFinance)await f.beforeFinance(request);
    trace.finance.push({path:new URL(request.url).pathname,token:request.headers.get(TENANT_ENVELOPE_HEADER),body:await request.clone().json()});
    assert.equal(request.headers.get('cookie'),null);assert.equal(request.headers.get('x-braza-app-key'),null);assert.equal(request.headers.get('x-braza-finance-router'),routerSecret);
    const response=await finance.fetch(request,env);if(f.afterFinance)await f.afterFinance(request,response);return response;
  }};
  const previous=globalThis.fetch;globalThis.fetch=async value=>{
    const request=value instanceof Request?value:new Request(value),url=new URL(request.url);
    if(url.origin!==authOrigin){trace.provider++;throw Error('unexpected external network request');}
    if(url.pathname===FINANCIAL_OBLIGATION_PATH){trace.app.push({path:url.pathname,token:request.headers.get(TENANT_ENVELOPE_HEADER),body:await request.clone().json()});assert.equal(request.headers.get('cookie'),null);assert.equal(request.headers.get('x-braza-app-key'),appSecret);}
    return auth.fetch(request,env);
  };
  t.after(()=>{globalThis.fetch=previous;for(const key of ['ACCOUNT_DB','ADMIN_DB','FINANCE_DB'])env[key].db.close();});
  f.call=async(path,body=null,patch={})=>{
    const headers={cookie,'x-mls-company':patch.company??company.id,'x-mls-store':patch.store??store.id,...(body===null?{}:{origin:appOrigin,'content-type':'application/json','x-csrf-token':session.csrf}),...patch.headers};
    const request=new Request(appOrigin+path,{method:body===null?'GET':'POST',headers,...(body===null?{}:{body:JSON.stringify(body)})});
    const response=await adminFetch(request,env),value=await response.json();return {response,status:response.status,body:value,request};
  };
  f.refresh=(revision=0,extra={})=>f.call('/api/admin/finance/obligations',{month,expected_revision:revision,request_id:crypto.randomUUID(),confirmed:true,...extra});
  f.revoke=async()=>{const original=await accountGet(env.ACCOUNT_DB,'session','global',principal.sessionId);await accountCommit(env.ACCOUNT_DB,[accountChange('session','global',{...original,revoked_at:Math.floor(Date.now()/1000)},original.revision)]);};
  f.capabilities=async capabilities=>{const original=await accountGet(env.ACCOUNT_DB,'membership',company.id,principal.membershipId);await accountCommit(env.ACCOUNT_DB,[accountChange('membership',company.id,{...original,capabilities},original.revision)]);};
  return f;
}

test('actual public App obligations GET/POST traverse fresh commercial Auth and Finance envelopes and persist the real expense capture',async t=>{
  const f=await fixture(t),cold=await f.call('/api/admin/finance/obligations?month='+month);assert.equal(cold.status,200,JSON.stringify(cold.body));assert.equal(cold.body.state,'NOT_CAPTURED');assert.equal(cold.body.revision,0);
  const registered=await f.refresh();assert.equal(registered.status,200,JSON.stringify(registered.body));assert.equal(registered.body.schema,'financial_obligation_registration_v1');assert.equal(registered.body.quality,'REVIEW');
  const read=await f.call('/api/admin/finance/obligations?month='+month);assert.equal(read.status,200,JSON.stringify(read.body));assert.ok(projectFinancialObligationResponse(read.body));assert.equal(read.body.scope.organization_id,f.company.id);assert.equal(read.body.scope.store_id,f.store.id);assert.equal(read.body.state,'AVAILABLE');assert.equal(read.body.items[0].expense_id,f.saved.items[0].id);assert.equal(read.body.items[0].amount_cents,13500);assert.equal(read.body.items[0].record_id,'obligation:'+f.saved.items[0].id);assert.equal(read.body.items[0].evidence_id,'expense-evidence:'+registered.body.snapshot_id);
  assert.equal(f.trace.app.length,3);assert.equal(f.trace.finance.length,3);assert.equal(f.trace.legacy,0);assert.equal(f.trace.provider,0);
  for(let i=0;i<3;i++){
    const a=claims(f.trace.app[i].token),b=claims(f.trace.finance[i].token);assert.notEqual(f.trace.app[i].token,f.trace.finance[i].token);assert.equal(a.iss,'app');assert.equal(a.aud,'auth');assert.equal(b.iss,'auth');assert.equal(b.aud,'finance');assert.equal(a.body_hash,b.body_hash);assert.equal(a.org,f.company.id);assert.equal(b.store,f.store.id);assert.equal(a.cap,i===1?'bank.write':'bank.read');assert.equal(b.cap,a.cap);
    assert.doesNotMatch(JSON.stringify(f.trace.app[i].body),/SYNTHETIC_PRIVATE|description|cookie|actor_id|bank_record_id/);
  }
  assert.match(read.response.headers.get('cache-control'),/no-store/);assert.equal(read.response.headers.get('set-cookie'),null);assert.doesNotMatch(JSON.stringify(read.body),/SYNTHETIC_PRIVATE|sessionId|membershipId|userId|cookie|description/);
  assert.equal(f.env.FINANCE_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0,'commercial snapshots use scoped ACCOUNT_DB, never legacy deployment FINANCE_DB');
  const after=await readExpenseLedger(f.scoped,{month});assert.deepEqual(after.items,f.saved.items,'capture does not change declaration, paid status or amount');
});

test('public obligations refuse browser fact injection, duplicate filters and CSRF before any private registry call',async t=>{
  const f=await fixture(t);for(const extra of [{snapshot:{}},{scope:{organization_id:'foreign'}},{items:[{amount_cents:1}]},{confirmed:false}])assert.equal((await f.refresh(0,extra)).status,400);
  for(const query of ['?month='+month+'&month='+month,'?month='+month+'&scope=foreign','?month=2026-13'])assert.equal((await f.call('/api/admin/finance/obligations'+query)).status,400);
  for(const headers of [{origin:'https://foreign.example'},{'x-csrf-token':'wrong'}])assert.equal((await f.refresh(0,{}).then(()=>f.call('/api/admin/finance/obligations',{month,expected_revision:0,request_id:crypto.randomUUID(),confirmed:true},{headers}))).status,403);
  assert.equal(f.trace.provider,0);
});

test('a revoked commercial session between Auth authorization and Finance dispatch cannot create a snapshot',async t=>{
  const f=await fixture(t);f.beforeFinance=async()=>{f.beforeFinance=null;await f.revoke();};const result=await f.refresh();assert.equal(result.status,403,JSON.stringify(result.body));
  assert.equal(f.env.ACCOUNT_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE '%finance_financial_obligation_snapshots'").get().n,0);assert.equal(f.trace.provider,0);
});

test('revocation after a committed capture withholds the receipt and preserves the immutable fact for audit',async t=>{
  const f=await fixture(t);f.afterFinance=async(request,response)=>{if((await request.clone().json()).operation==='register'&&response.status===200){f.afterFinance=null;await f.revoke();}};const result=await f.refresh();assert.equal(result.status,403,JSON.stringify(result.body));
  const names=f.env.ACCOUNT_DB.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%finance_financial_obligation_snapshots'").all();assert.equal(names.length,1);assert.equal(f.env.ACCOUNT_DB.db.prepare('SELECT COUNT(*) n FROM "'+names[0].name+'"').get().n,1);assert.doesNotMatch(JSON.stringify(result.body),/snapshot_id|source_hash|13500/);
});

test('both public and signed private boundaries require financial permission in addition to bank permission',async t=>{
  const f=await fixture(t);await f.capabilities(['store.read','bank.read','bank.write']);assert.equal((await f.call('/api/admin/finance/obligations?month='+month)).status,403);assert.equal((await f.refresh()).status,403);assert.equal(f.trace.finance.length,0);
  const current=await resolveCommercialPrincipal(new Request(appOrigin,{headers:{cookie:f.cookie}}),f.env,{...f.options,organizationId:f.company.id,storeId:f.store.id,capability:'bank.read'}),context=await commercialContextFromPrincipal(current,{requiredCapability:'bank.read'});
  const raw=new Request(authOrigin+FINANCIAL_OBLIGATION_PATH,{method:'POST',headers:{'content-type':'application/json','x-braza-app-key':appSecret},body:JSON.stringify({schema:'financial_obligation_source_request_v1',operation:'read',month})});
  const signed=await forwardTenantEnvelope(raw,context,{secret:appSecret,issuer:'app',audience:'auth'}),response=await f.auth.fetch(signed,f.env);assert.equal(response.status,403);assert.equal(f.trace.finance.length,1);assert.equal(f.env.FINANCE_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);
});

test('an authorized second company cannot read the first company obligation capture',async t=>{
  const f=await fixture(t);assert.equal((await f.refresh()).status,200);
  const company=(await f.accountCall('/api/companies',{name:'Segunda empresa sintética',confirmed:true,request_id:crypto.randomUUID()})).organization,store=(await f.accountCall('/api/companies/'+company.id+'/stores',{name:'Segunda loja',platform:'SHOPEE',confirmed:true,request_id:crypto.randomUUID()})).store;
  const second=await f.call('/api/admin/finance/obligations?month='+month,null,{company:company.id,store:store.id});assert.equal(second.status,200,JSON.stringify(second.body));assert.equal(second.body.scope.organization_id,company.id);assert.equal(second.body.state,'NOT_CAPTURED');assert.equal(second.body.revision,0);assert.deepEqual(second.body.items,[]);assert.doesNotMatch(JSON.stringify(second.body),new RegExp(f.saved.items[0].id));
});
