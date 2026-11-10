import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {cashPreview,cashRead} from './external-cash-fixture.mjs';

const origin='https://external-cash-compiled.test',ownerPath='/api/admin/finance/external-cash',internalPath='/internal/finance/external-cash-v1';
const appSecret='SYNTHETIC_COMPILED_APP_'+'a'.repeat(40),routerSecret='SYNTHETIC_COMPILED_ROUTER_'+'r'.repeat(40);
const artifact=relative=>new URL(relative,import.meta.url);
async function compile(relative,minify){
 const result=await build({entryPoints:[fileURLToPath(artifact(relative))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});return (await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))).default;
}

test('external evidence tests execute the same complete App/Auth/Finance vector prepared for deployment',()=>{
 for(const [dist,generated] of [['../../../dist/app-worker.mjs','../../cloudflare/app-worker.mjs'],['../../../dist/auth-worker.mjs','../../../docs/finance-connection-delivery/auth-worker.mjs'],['../../../dist/finance-worker.mjs','../../../docs/finance-connection-delivery/finance-worker.mjs']])assert.deepEqual(readFileSync(artifact(dist)),readFileSync(artifact(generated)));
 for(const path of ['../../../dist/app-worker.mjs','../../../dist/auth-worker.mjs','../../../dist/finance-worker.mjs'])assert.match(readFileSync(artifact(path),'utf8'),/external-cash-v1/);
});

for(const minify of [false,true])test(`generated owner App→Auth→Finance imports, matches and unlinks using real SQLite without provider configuration (minify=${minify})`,async()=>{
 const [app,auth,finance]=await Promise.all([compile('../../../dist/app-worker.mjs',minify),compile('../../../dist/auth-worker.mjs',minify),compile('../../../dist/finance-worker.mjs',minify)]),db=new D1();
 const calls={fetch:0,binding:0,legacyStorage:0},financeEnv={FINANCE_DB:db,FINANCE_ROUTER_SECRET:routerSecret,FINANCE_CONNECTION_ENABLED:'false'},appEnv={ADMIN_USERNAME:'synthetic-compiled-owner',ADMIN_PASSWORD:'synthetic-compiled-password',ADMIN_SESSION_SECRET:'synthetic-compiled-session-'+'s'.repeat(40),APP_INTERNAL_SECRET:appSecret};
 Object.defineProperty(appEnv,'ADMIN_DB',{get(){calls.legacyStorage++;throw Error('unexpected legacy database');}});
 const ctx={waitUntil(){throw Error('unexpected background provider collection');}},previousFetch=globalThis.fetch;
 const authEnv={APP_INTERNAL_SECRET:appSecret,FINANCE_ROUTER_SECRET:routerSecret,SHOPEE_FINANCE_SERVICE:{fetch:async request=>{
  calls.binding++;assert.equal(request.url,'https://auth.brazacommerce.com.br'+internalPath);assert.equal(request.headers.get('x-braza-finance-router'),routerSecret);for(const header of ['cookie','authorization','x-braza-app-key','x-braza-shop-id','x-braza-actor'])assert.equal(request.headers.get(header),null);return finance.fetch(request,financeEnv);
 }}};
 globalThis.fetch=async request=>{calls.fetch++;assert.equal(request.url,'https://auth.brazacommerce.com.br'+internalPath,'no bank or Shopee provider may be contacted');assert.equal(request.method,'POST');assert.equal(request.headers.get('x-braza-app-key'),appSecret);assert.equal(request.headers.get('cookie'),null);return auth.fetch(request,authEnv);};
 try{
  const login=await app.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:appEnv.ADMIN_USERNAME,password:appEnv.ADMIN_PASSWORD})}),appEnv,ctx);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
  const call=(path,body,extraHeaders={})=>app.fetch(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{cookie,...(body===undefined?{}:{origin,'content-type':'application/json','x-csrf-token':csrf}),...extraHeaders},body:body===undefined?undefined:JSON.stringify(body)}),appEnv,ctx);
  let csrf;const bootstrap=await call('/api/admin/bootstrap');assert.equal(bootstrap.status,200);csrf=(await bootstrap.json()).csrf;assert.equal(calls.fetch,0);assert.equal(calls.legacyStorage,0);
  assert.equal((await app.fetch(new Request(origin+ownerPath+'?month=2026-11'),appEnv,ctx)).status,401);
  const denied=new Request(origin+ownerPath,{method:'POST',headers:{cookie,origin:'https://other.invalid','content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(cashPreview())});assert.equal((await app.fetch(denied,appEnv,ctx)).status,403);assert.equal(denied.bodyUsed,false);assert.equal(calls.fetch,0);
  const read=async()=>{const response=await call(ownerPath+'?month=2026-11');assert.equal(response.status,200,await response.clone().text());return response.json();};
  const cold=await read();assert.equal(cold.schema,'external_cash_workspace_v1');assert.equal(cold.revision,0);assert.deepEqual(cold.records,[]);
  assert.equal(db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0,'GET must not create a ledger or a financial fact');
  const importDocument=async(preview,requestId)=>{
   const before=db.db.prepare('SELECT total_changes() n').get().n,response=await call(ownerPath,preview);assert.equal(response.status,200,await response.clone().text());const projected=await response.json();assert.equal(projected.schema,'external_cash_preview_v1');assert.equal(projected.can_import,true);assert.equal(db.db.prepare('SELECT total_changes() n').get().n,before,'preview must be SELECT-only');
   const {cursor,limit,...document}=preview,body={...document,operation:'import',request_id:requestId,expected_revision:projected.revision,preview_hash:projected.preview_hash,confirmed:true},saved=await call(ownerPath,body);assert.equal(saved.status,200,await saved.clone().text());return {body,frame:await saved.json()};
  };
  const bank=await importDocument(cashPreview(),'10000000-0000-4000-8000-000000000011');assert.equal(bank.frame.revision,1);assert.equal(bank.frame.result.inserted_count,1);
  const replay=await call(ownerPath,bank.body);assert.equal(replay.status,200);const replayFrame=await replay.json();assert.equal(replayFrame.replayed,true);assert.equal(replayFrame.revision,1);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM finance_external_cash_records').get().n,1);
  const transfer=cashPreview();transfer.source='SHOPEE';transfer.completed_transfers_declared=true;transfer.selection.format='shopee_csv';transfer.document_hash='b'.repeat(64);transfer.rows[0].external_id='SYNTHETIC_COMPLETED_TRANSFER';transfer.rows[0].description='Synthetic completed transfer';transfer.rows[0].reported_status='Concluído';
  const pending=structuredClone(transfer);pending.rows[0].reported_status='PENDING';const pendingResponse=await call(ownerPath,pending);assert.equal(pendingResponse.status,400);assert.deepEqual(await pendingResponse.json(),{schema:'external_cash_error_v1',error:'FINANCE_EXTERNAL_CASH_STATUS_NOT_COMPLETED'});
  const shopee=await importDocument(transfer,'10000000-0000-4000-8000-000000000012');assert.equal(shopee.frame.revision,2);const beforeMatch=await read();assert.equal(beforeMatch.records.length,2);assert.ok(beforeMatch.suggestions.length>0);
  const bankRow=beforeMatch.records.find(row=>row.source==='NUBANK'),transferRow=beforeMatch.records.find(row=>row.source==='SHOPEE'),match={schema:'external_cash_request_v1',operation:'match',request_id:'10000000-0000-4000-8000-000000000013',expected_revision:beforeMatch.revision,confirmed:true,pairs:[{bank_record_id:bankRow.record_id,transfer_record_id:transferRow.record_id}],reason:'Owner compared both imported documents'};
  const matched=await call(ownerPath,match);assert.equal(matched.status,200,await matched.clone().text());const matchedFrame=await matched.json();assert.equal(matchedFrame.revision,3);const linked=await read();assert.equal(linked.matches.length,1);assert.equal(linked.matches[0].match_id,matchedFrame.result.match_ids[0]);
  const unlink={schema:'external_cash_request_v1',operation:'unlink',request_id:'10000000-0000-4000-8000-000000000014',expected_revision:linked.revision,confirmed:true,match_id:linked.matches[0].match_id,reason:'Owner corrected a mistaken manual link'},undone=await call(ownerPath,unlink);assert.equal(undone.status,200,await undone.clone().text());assert.equal((await undone.json()).revision,4);assert.deepEqual((await read()).matches,[]);
  const audit=db.db.prepare('SELECT operation,actor FROM finance_external_cash_audit ORDER BY revision').all();assert.deepEqual(audit.map(row=>({...row})),[{operation:'import',actor:'OWNER'},{operation:'import',actor:'OWNER'},{operation:'match',actor:'OWNER'},{operation:'unlink',actor:'OWNER'}]);
  assert.equal(db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='finance_connections'").get().n,0);assert.equal(calls.fetch,calls.binding);assert.equal(calls.legacyStorage,0);assert.ok(calls.fetch>=10);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM finance_external_cash_unlinks').get().n,1);
 }finally{globalThis.fetch=previousFetch;db.db.close();}
});
