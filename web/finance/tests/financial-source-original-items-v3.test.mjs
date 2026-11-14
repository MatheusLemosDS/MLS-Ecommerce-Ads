import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readFinancialSourceOriginalItems,createFinancialSourceWorker} from '../src/financial-source-worker.mjs';
import {projectFinancialSourceRequest,projectFinancialSourceResponse,financialSourceResponseMatches,FINANCIAL_SOURCE_PATH} from '../src/financial-source-frame.mjs';
import {financialPrivateProtocol,exchangeFinancialPrivate} from '../src/financial-private-protocol.mjs';
import {commercialContextFromPrincipal} from '../../cloudflare/src/commercial-context.mjs';
import {createTenantDatabase} from '../../cloudflare/src/tenant-storage.mjs';
import {commercialFinanceCapability} from '../../cloudflare/src/commercial-finance-capability.mjs';
import {getFinanceFinancialAutomation} from '../../cloudflare/src/app-financial-automation.mjs';
import {privateNow,privateEpoch,privateRun,privateScope,privateJson} from './financial-private-fixture.mjs';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {FINANCE_PROFILE} from '../src/connection-store.mjs';
import {readFinancialOrderEvidence} from '../src/financial-order-evidence.mjs';
import {createCommercialFinanceWorker} from '../src/commercial-finance-worker.mjs';
import {createCommercialAuthWorker} from '../../cloudflare/src/commercial-auth-worker.mjs';
import {migrateAccountDatabase,accountChange,accountCommit} from '../../cloudflare/src/account-store.mjs';
import {resolveServiceCommercialPrincipal} from '../../cloudflare/src/account-service.mjs';
import {forwardTenantEnvelope,verifyTenantEnvelope,TENANT_ENVELOPE_HEADER} from '../../cloudflare/src/tenant-envelope.mjs';

const env={FINANCE_ROUTER_SECRET:'synthetic-original-items-router-'.repeat(2)},hash=n=>n.toString(16).padStart(64,'0');
const command=(patch={})=>({schema:'financial_source_request_v3',operation:'original-items',run_id:privateRun,cursor:null,limit:2,expected_revision:null,order_hash:null,item_id:null,model_id:null,...patch});
const request=(input=command())=>new Request('https://auth.brazacommerce.com.br'+FINANCIAL_SOURCE_PATH,{method:'POST',headers:{'content-type':'application/json','x-braza-finance-router':env.FINANCE_ROUTER_SECRET},body:JSON.stringify(input)});
function snapshot(){
 const row=(n,bucket,items)=>({order_hash:hash(n),source_hash:'a'.repeat(64),checked_at:privateEpoch,bucket,payment_covered:['completed','ongoing'].includes(bucket)?1:0,escrow_raw:'90',returns_seen:0,evidence:{schema:'financial_order_evidence_v2',order_sn:'SYNTHETIC_PRIVATE_ORIGINAL_ORDER_'+n,order_status:bucket==='completed'?'COMPLETED':'READY_TO_SHIP',currency:'BRL',create_time:privateEpoch-86400,return_order_sn_list:['SYNTHETIC_PRIVATE_RETURN'],amounts:{escrow_amount_raw:'90',escrow_amount_after_adjustment_raw:'90',total_adjustment_amount_raw:'0'},diagnostic:null},items});
 return {schema:'financial_order_evidence_snapshot_v1',run:{run_id:privateRun,revision:3,status:'COMPLETE',start_date:'2026-11-01',end_date:'2026-11-13',cutoff_at:privateEpoch-60,checked_at:privateEpoch},orders:[row(1,'completed',[{item_id:'101',model_id:'0',quantity:2},{item_id:'101',model_id:'12',quantity:1},{item_id:'202',model_id:'33',quantity:3}]),row(2,'ongoing',[{item_id:'303',model_id:'44',quantity:1}]),row(3,'cancelled',[])],cached_orders:[row(9,'completed',[{item_id:'999',model_id:'999',quantity:100}])],missing_orders:0,invalid_orders:0};
}
const read=(input=command(),source=snapshot(),extra={})=>readFinancialSourceOriginalItems(env,input,{now:privateNow,readEvidence:async(_e,q,options)=>{assert.deepEqual(q,{run_id:privateRun});assert.equal(options.includeOriginalItems,true);assert.equal(options.initialize,false);return source;},...extra});

test('V3 original-item requests are closed, bounded and cannot change older negotiated contracts',()=>{
 assert.ok(projectFinancialSourceRequest(command()));
 const lookup=command({order_hash:hash(1),item_id:'101',model_id:'0',limit:1});assert.ok(projectFinancialSourceRequest(lookup));
 for(const change of [{schema:'financial_source_request_v1'},{schema:'financial_source_request_v2'},{operation:'evidence'},{scope:privateScope},{actor_id:'foreign-owner'},{order_hash:hash(1)},{item_id:'101'},{order_hash:hash(1),item_id:'101',model_id:null},{limit:101},{limit:0},{item_id:'01'},{cursor:{order_hash:hash(1),item_id:'101',model_id:'0'}},{cursor:'a'.repeat(64)}])assert.equal(projectFinancialSourceRequest({...command(),...change}),null);
 assert.equal(projectFinancialSourceRequest({...lookup,cursor:{order_hash:hash(1),item_id:'101',model_id:'0'},expected_revision:3}),null);
 const cursor={order_hash:hash(1),item_id:'101',model_id:'0'};assert.ok(projectFinancialSourceRequest(command({cursor,expected_revision:3})));
});

test('V3 cached original items preserve selling quantities and proof while excluding buyer/order IDs and payment cache',async()=>{
 const response=await read(command({limit:100}));assert.equal(response.schema,'financial_source_original_items_v3');assert.deepEqual(response.scope,privateScope);assert.equal(response.items.length,4);assert.equal(response.items.find(r=>r.item_id==='101'&&r.model_id==='0').quantity,2);assert.equal(response.items.some(r=>r.item_id==='999'),false);assert.equal(response.items.some(r=>r.order_hash===hash(3)),false);
 for(const item of response.items){assert.deepEqual(Object.keys(item).sort(),['checked_at','item_id','model_id','order_hash','quantity','run_id','run_revision','scope','source_hash']);assert.equal(item.run_id,privateRun);assert.equal(item.run_revision,3);assert.equal(item.source_hash,'a'.repeat(64));assert.equal(item.checked_at,new Date(privateEpoch*1000).toISOString());assert.deepEqual(item.scope,privateScope);}
 assert.equal(response.coverage.window_complete,true);assert.equal(response.has_more,false);assert.ok(projectFinancialSourceResponse(response));assert.doesNotMatch(JSON.stringify(response),/SYNTHETIC_PRIVATE|order_sn|return_order_sn_list|buyer|escrow_raw|original_cost/);
});

test('compound V3 cursor preserves every line of multi-variant orders without duplication',async()=>{
 const all=[];let cursor=null,revision=null,first;for(let page=0;page<10;page++){const q=command({limit:1,cursor,expected_revision:revision}),response=await read(q);assert.ok(projectFinancialSourceResponse(response));assert.equal(financialSourceResponseMatches(q,response),true);assert.deepEqual(response.cursor,cursor);assert.equal(response.items.length,1);all.push(...response.items);first??=response;if(!response.has_more)break;assert.deepEqual(response.next_cursor,Object.fromEntries(['order_hash','item_id','model_id'].map(k=>[k,response.items.at(-1)[k]])));cursor=response.next_cursor;revision=response.run.revision;}
 const keys=all.map(r=>r.order_hash+':'+r.item_id+':'+r.model_id);assert.equal(all.length,4);assert.equal(new Set(keys).size,4);assert.equal(first.has_more,true);assert.equal(first.coverage.page_complete,false);
});

test('compound cursor uses one byte ordering for prefix item IDs across every page',async()=>{
 const source=snapshot();source.orders=source.orders.slice(0,1);source.orders[0].items=[{item_id:'101',model_id:'0',quantity:1},{item_id:'1011',model_id:'0',quantity:2},{item_id:'101',model_id:'12',quantity:3},{item_id:'10110',model_id:'0',quantity:4}];
 const all=[];let cursor=null;for(let page=0;page<10;page++){const response=await read(command({cursor,expected_revision:cursor===null?null:3,limit:1}),source);assert.ok(projectFinancialSourceResponse(response));all.push(...response.items);if(!response.has_more)break;cursor=response.next_cursor;}
 const keys=all.map(r=>r.order_hash+':'+r.item_id+':'+r.model_id),expected=source.orders[0].items.map(r=>hash(1)+':'+r.item_id+':'+r.model_id).sort();assert.deepEqual(keys,expected);assert.equal(new Set(keys).size,4);
});

test('V3 lookup is exact and revision/cursor changes fail instead of selecting another source line',async()=>{
 const q=command({order_hash:hash(1),item_id:'101',model_id:'12',limit:1,expected_revision:3}),response=await read(q);assert.equal(response.items.length,1);assert.equal(response.items[0].model_id,'12');assert.deepEqual(response.selection,{order_hash:hash(1),item_id:'101',model_id:'12'});assert.equal(response.has_more,false);assert.equal(financialSourceResponseMatches(q,response),true);
 await assert.rejects(()=>read({...q,model_id:'999'}),e=>e.status===404);
 await assert.rejects(()=>read(command({expected_revision:2})),e=>e.status===409);
 await assert.rejects(()=>read(command({cursor:{order_hash:hash(8),item_id:'101',model_id:'12'},expected_revision:3})),e=>[400,409].includes(e.status));
 assert.equal(financialSourceResponseMatches({...q,expected_revision:2},response),false);assert.equal(financialSourceResponseMatches({...q,model_id:'0'},response),false);
});

test('V3 source contexts require both orders.read and finance.read before accessing cached evidence',async()=>{
 let reads=0;const principal=capabilities=>({kind:'account',userId:'synthetic-user',organizationId:'synthetic-org',storeId:'synthetic-store',sessionId:'synthetic-session',membershipId:'synthetic-member',role:'VIEWER',authorizationRevision:1,capabilities});
 for(const capabilities of [['finance.read'],['orders.read'],[]]){const context=await commercialContextFromPrincipal(principal(capabilities),{requiredCapability:capabilities[0]??null});await assert.rejects(()=>readFinancialSourceOriginalItems({...env,COMMERCIAL_CONTEXT:context},command(),{now:privateNow,readEvidence:async()=>{reads++;return snapshot();}}),e=>e.status===403);}
 await assert.rejects(()=>readFinancialSourceOriginalItems({...env,COMMERCIAL_CONTEXT:{organizationId:'forged',storeId:'forged',capabilities:['finance.read','orders.read']}},command(),{now:privateNow,readEvidence:async()=>{reads++;return snapshot();}}),e=>e.status===403);assert.equal(reads,0);
 const context=await commercialContextFromPrincipal(principal(['orders.read','finance.read']),{requiredCapability:'orders.read'}),response=await readFinancialSourceOriginalItems({...env,COMMERCIAL_CONTEXT:context},command(),{now:privateNow,readEvidence:async()=>{reads++;return snapshot();}});assert.equal(response.scope.organization_id,'synthetic-org');assert.equal(response.scope.store_id,'synthetic-store');assert.equal(reads,1);
});

test('V3 rejects raw, foreign-tenant and wrong-domain FINANCE_DB wrappers before any cached read',async t=>{
 const raw=new D1();t.after(()=>raw.db.close());const principal=organizationId=>({kind:'account',userId:'synthetic-user',organizationId,storeId:'synthetic-store',sessionId:'synthetic-session',membershipId:'synthetic-member',role:'VIEWER',authorizationRevision:1,capabilities:['orders.read','finance.read']}),a=await commercialContextFromPrincipal(principal('synthetic-a'),{requiredCapability:'orders.read'}),b=await commercialContextFromPrincipal(principal('synthetic-b'),{requiredCapability:'orders.read'});
 let reads=0;const options={now:privateNow,readEvidence:async()=>{reads++;return snapshot();}};
 for(const db of [raw,createTenantDatabase(raw,b,{domain:'finance'}),createTenantDatabase(raw,a,{domain:'app'})])await assert.rejects(()=>readFinancialSourceOriginalItems({...env,COMMERCIAL_CONTEXT:a,FINANCE_DB:db},command(),options),e=>e.status===403);assert.equal(reads,0);
 const result=await readFinancialSourceOriginalItems({...env,COMMERCIAL_CONTEXT:a,FINANCE_DB:createTenantDatabase(raw,a,{domain:'finance'})},command(),options);assert.equal(result.scope.organization_id,'synthetic-a');assert.equal(reads,1);
});

test('V3 cold SQLite source reads original items without DDL, source-table initialization or provider IO',async t=>{
 const db=new D1();t.after(()=>db.db.close());const network=t.mock.method(globalThis,'fetch',async()=>{throw Error('cold original source is local only');});
 db.db.exec(`CREATE TABLE finance_business_period_runs(run_id TEXT PRIMARY KEY,revision INTEGER,status TEXT,start_date TEXT,end_date TEXT,cutoff_at INTEGER,checked_at INTEGER,partner_id INTEGER,shop_id INTEGER);
 CREATE TABLE finance_business_period_orders(run_id TEXT,order_hash TEXT,bucket TEXT,payment_covered INTEGER,sales_raw TEXT,escrow_raw TEXT,ads_raw TEXT,returns_seen INTEGER,items TEXT,source_hash TEXT,checked_at INTEGER,PRIMARY KEY(run_id,order_hash));
 CREATE TABLE finance_business_period_payment_cache(run_id TEXT,order_hash TEXT,bucket TEXT,payment_covered INTEGER,sales_raw TEXT,escrow_raw TEXT,ads_raw TEXT,returns_seen INTEGER,items TEXT,source_hash TEXT,checked_at INTEGER,PRIMARY KEY(run_id,order_hash));`);
 db.db.prepare('INSERT INTO finance_business_period_runs VALUES(?,?,?,?,?,?,?,?,?)').run(privateRun,3,'COMPLETE','2026-11-01','2026-11-13',privateEpoch-60,privateEpoch,FINANCE_PROFILE.partner_id,FINANCE_PROFILE.shop_id);
 const digest=value=>createHash('sha256').update(value).digest('hex'),record={order_hash:digest('SYNTHETIC_PRIVATE_COLD_ORDER'),bucket:'completed',payment_covered:1,sales_raw:'100',escrow_raw:'90',ads_raw:'0',returns_seen:0,items:JSON.stringify([{item_id:'101',model_id:'0',quantity:2}]),checked_at:privateEpoch};record.source_hash=digest(JSON.stringify(record));
 db.db.prepare('INSERT INTO finance_business_period_orders VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(privateRun,record.order_hash,record.bucket,record.payment_covered,record.sales_raw,record.escrow_raw,record.ads_raw,record.returns_seen,record.items,record.source_hash,record.checked_at);
 const before=db.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all(),sql=[],prepare=db.prepare.bind(db);db.prepare=value=>{sql.push(value);return prepare(value);};
 const raw=await readFinancialOrderEvidence({FINANCE_DB:db},{run_id:privateRun},{now:privateNow,includeOriginalItems:true,initialize:false});assert.equal(raw.orders[0].evidence,null);assert.equal(raw.missing_orders,1);assert.equal(raw.orders[0].items[0].quantity,2);
 const response=await readFinancialSourceOriginalItems({FINANCE_DB:db},command(),{now:privateNow});assert.equal(response.items.length,1);assert.equal(response.items[0].source_hash,record.source_hash);assert.equal(response.items[0].quantity,2);assert.equal(response.scope.account_id,'operating-book');
 assert.ok(sql.length>0);assert.equal(sql.every(statement=>/^\s*SELECT\b/i.test(statement)),true);assert.deepEqual(db.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all(),before);assert.equal(db.db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='finance_business_order_evidence'").get().count,0);assert.equal(network.mock.callCount(),0);
});

test('V3 transport maps to orders.read and maintains strict App/Auth response matching and scope',async()=>{
 const input=command(),body=await read(input);assert.equal(await commercialFinanceCapability(request(input)),'orders.read');
 const p=financialPrivateProtocol('sources'),result=await exchangeFinancialPrivate('https://auth.brazacommerce.com.br'+p.path,p,input,{send:async()=>privateJson(body)});assert.equal(result.status,200);assert.deepEqual(result.body,body);
 const app=await getFinanceFinancialAutomation({APP_INTERNAL_SECRET:'synthetic-app-secret'},'sources',input,{fetchImpl:async()=>privateJson(body)});assert.equal(app.status,200);
 for(const corrupt of [{...body,run:{...body.run,revision:2}},{...body,selection:{order_hash:hash(1),item_id:'101',model_id:'0'}},{...body,items:[{...body.items[0],order_sn:'SYNTHETIC_PRIVATE_ORDER'}]}]){const r=await exchangeFinancialPrivate('https://auth.brazacommerce.com.br'+p.path,p,command({expected_revision:3}),{send:async()=>privateJson(corrupt)});assert.equal(r.status,502);}
});

test('actual V3 Auth/Finance tenant chain requires the secondary finance grant and preserves the signed body',async t=>{
 const account=new D1(),admin=new D1(),finance=new D1();t.after(()=>{account.db.close();admin.db.close();finance.db.close();});const network=t.mock.method(globalThis,'fetch',async()=>{throw Error('V3 cannot call provider');});
 const appSecret='synthetic-original-app-private-'.repeat(2),envFull={...env,APP_INTERNAL_SECRET:appSecret,ACCOUNT_DB:account,ADMIN_DB:admin,FINANCE_DB:finance},options={now:privateNow};await migrateAccountDatabase(envFull,options);
 const ids={user:'synthetic-v3-user',session:'synthetic-v3-session',org:'synthetic-v3-org',store:'synthetic-v3-store'},claims={sub:ids.user,sid:ids.session,mid:ids.user,org:ids.org,store:ids.store,cap:'orders.read',revision:1};
 const membership=capabilities=>({id:ids.user,user_id:ids.user,organization_id:ids.org,state:'ACTIVE',role:'VIEWER',store_ids:null,capabilities});
 await accountCommit(account,[accountChange('user','global',{id:ids.user,name:'Synthetic V3 user',email:'original-items@example.test',state:'ACTIVE',auth_revision:1,preferences:{theme:'system',language:'pt-BR'}}),accountChange('session','global',{id:ids.session,user_id:ids.user,created_at:privateEpoch,last_activity_at:privateEpoch,expires_at:privateEpoch+3600,revoked_at:null,mfa_complete:true,auth_revision:1,reauthenticated_at:privateEpoch,organization_id:ids.org,store_id:ids.store}),accountChange('organization','global',{id:ids.org,state:'ACTIVE',currency:'BRL',timezone:'America/Sao_Paulo'}),accountChange('membership',ids.org,membership(['orders.read'])),accountChange('store',ids.org,{id:ids.store,organization_id:ids.org,state:'ACTIVE',profile:null})]);
 let sourceReads=0,legacyCalls=0,authToken,financeToken;const source=createFinancialSourceWorker({now:privateNow,readOriginalItems:(e,q,o)=>readFinancialSourceOriginalItems(e,q,{...o,readEvidence:async()=>{sourceReads++;return snapshot();}})}),financeWorker=createCommercialFinanceWorker({worker:source,now:privateNow});
 envFull.SHOPEE_FINANCE_SERVICE={fetch:async actual=>{financeToken=actual.headers.get(TENANT_ENVELOPE_HEADER);const verified=await verifyTenantEnvelope(actual,{secret:envFull.FINANCE_ROUTER_SECRET,issuer:'auth',audience:'finance',now:privateNow,resolvePrincipal:c=>resolveServiceCommercialPrincipal(envFull,c,options)});assert.equal(verified.requiredCapability,'orders.read');assert.equal(actual.headers.get('cookie'),null);assert.deepEqual(await actual.clone().json(),command());return financeWorker.fetch(actual,envFull);}};
 const auth=createCommercialAuthWorker({fetch:async()=>{legacyCalls++;throw Error('V3 has no legacy provider fallback');}},{now:privateNow,validateInternalApp:async(r,e)=>r.headers.get('x-braza-app-key')===e.APP_INTERNAL_SECRET});
 async function throughApp(){const principal=await resolveServiceCommercialPrincipal(envFull,claims,options),context=await commercialContextFromPrincipal(principal,{requiredCapability:'orders.read'});return getFinanceFinancialAutomation({APP_INTERNAL_SECRET:appSecret,COMMERCIAL_CONTEXT:context,COMMERCIAL_FETCH:async original=>{const actual=await forwardTenantEnvelope(original,context,{secret:appSecret,issuer:'app',audience:'auth',now:privateNow});authToken=actual.headers.get(TENANT_ENVELOPE_HEADER);return auth.fetch(actual,envFull);}},'sources',command());}
 const denied=await throughApp();assert.equal(denied.status,403);assert.equal(sourceReads,0);assert.equal(legacyCalls,0);
 await accountCommit(account,[accountChange('membership',ids.org,membership(['orders.read','finance.read']),1)]);claims.revision=2;
 const allowed=await throughApp();assert.equal(allowed.status,200,JSON.stringify(allowed));assert.equal(sourceReads,1);assert.equal(allowed.body.scope.organization_id,ids.org);assert.equal(allowed.body.scope.store_id,ids.store);assert.notEqual(authToken,financeToken);const decode=token=>JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString());assert.equal(decode(authToken).body_hash,decode(financeToken).body_hash);assert.equal(decode(authToken).iss,'app');assert.equal(decode(financeToken).iss,'auth');assert.equal(network.mock.callCount(),0);assert.doesNotMatch(JSON.stringify(allowed),/order_sn|SYNTHETIC_PRIVATE|cookie|sessionId|access_token/);
});

test('V3 rejects malformed source-item quantities, identities and proof fields without inventing physical pieces',async()=>{
 for(const patch of [{quantity:0},{quantity:0.1},{quantity:Number.MAX_SAFE_INTEGER+1},{item_id:'01'},{model_id:'-1'}]){const source=snapshot();Object.assign(source.orders[0].items[0],patch);let result;try{result=await read(command({limit:100}),source);}catch(e){assert.ok([400,503].includes(e.status));continue;}assert.equal(result.coverage.complete,false);assert.equal(result.items.some(r=>r.order_hash===hash(1)&&r.item_id==='101'&&r.model_id==='0'),false);}
 const valid=await read();for(const patch of [{buyer:'SYNTHETIC_PRIVATE_BUYER'},{quantity:0},{run_revision:4},{source_hash:'bad'},{scope:{...privateScope,store_id:'foreign'}}]){const candidate={...valid,items:[{...valid.items[0],...patch}]};assert.equal(projectFinancialSourceResponse(candidate),null);}
});

for(const minify of [false,true])test('V3 normal/minified source worker uses cached original items and exact protocol '+minify,async t=>{
 const network=t.mock.method(globalThis,'fetch',async()=>{throw Error('V3 is cached only');});const built=await build({entryPoints:[fileURLToPath(new URL('../src/financial-source-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify}),module=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
 let reads=0;const worker=module.createFinancialSourceWorker({now:privateNow,readOriginalItems:(e,q,options)=>module.readFinancialSourceOriginalItems(e,q,{...options,readEvidence:async(_env,_input,sourceOptions)=>{reads++;assert.equal(sourceOptions.includeOriginalItems,true);return snapshot();}})}),response=await worker.fetch(request(),env);assert.equal(response.status,200,await response.clone().text());const body=await response.json();assert.equal(body.schema,'financial_source_original_items_v3');assert.equal(body.items.length,2);assert.equal(body.has_more,true);assert.equal(reads,1);assert.equal(network.mock.callCount(),0);assert.doesNotMatch(JSON.stringify(body),/SYNTHETIC_PRIVATE|order_sn|buyer/);
});
