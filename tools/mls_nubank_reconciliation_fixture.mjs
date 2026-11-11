import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import http from 'node:http';
import {createHash,randomUUID,webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {D1} from '../web/cloudflare/tests/sqlite-d1.mjs';
import {createLocalBrowserAssets} from './browser_assets.mjs';

export const NUBANK_QA_MONTH='2026-11';
export const NUBANK_QA_FILES=Object.freeze({
 bank:'Data,Valor,Identificador,Descrição\n10/11/2026,150.50,QA_BANK_MATCH,Crédito sintético para conciliação\n11/11/2026,-25.00,QA_BANK_DEBIT,Débito sintético separado\n12/11/2026,0.00,QA_BANK_ZERO,Movimento sintético explícito zero',
 transfer:'Data;Valor;Identificador;Referência;Situação;Descrição\n2026-11-10;150.50;QA_TRANSFER_MATCH;QA_SHARED_REFERENCE;Concluído;Transferência sintética concluída',
});
export const nubankQaHash=value=>createHash('sha256').update(value).digest('hex');
const privatePath='/internal/finance/external-cash-v1';
const privateOrigin='https://auth.brazacommerce.com.br';
const marker='<aside id="nubankQaSynthetic" role="note" style="position:fixed;right:6px;bottom:76px;z-index:99999;max-width:180px;pointer-events:none;padding:6px;background:#fff3cf;color:#342500;border:1px solid #a46a00;font:600 10px system-ui">QA SINTÉTICA · SEM CONEXÃO COM A LOJA</aside>';

export async function compileNubankQaWorkers(root,minify){
 const entries={};
 for(const name of ['app','auth','finance']){
  const file=path.join(root,'dist',name+'-worker.mjs'),source=readFileSync(file),text=source.toString('utf8');
  assert.ok(text.includes(name==='app'?'bankReconciliation':name==='auth'?privatePath:'finance_external_cash_records'),'QA_BUILT_SOURCE_MISSING_'+name.toUpperCase());
  const result=await build({entryPoints:[file],bundle:true,write:false,format:'iife',globalName:'NubankQaWorker',platform:'browser',target:'es2022',minify,logLevel:'silent'});
  entries[name]={code:result.outputFiles[0].text,source_sha256:nubankQaHash(source),compiled_sha256:nubankQaHash(result.outputFiles[0].text),bytes:source.length};
 }
 entries.app.assets=createLocalBrowserAssets(root);
 return entries;
}

function isolatedRuntime(compiled,{fetchImpl=async()=>{throw Error('QA_OUTBOUND_DISABLED');}}={}){
 const timers=new Set(),outbound=[];
 const context=vm.createContext({HostRequest:Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,AbortController,AbortSignal,ReadableStream,TransformStream,WritableStream,Blob,FormData,File,crypto:webcrypto,btoa,atob,
  console:Object.freeze({log(){},warn(){},error(){}}),
  fetch:async(input,init)=>{const request=input instanceof Request&&init===undefined?input:new Request(input,init);outbound.push({method:request.method,path:new URL(request.url).pathname});return fetchImpl(request);},
  setTimeout(callback,delay,...args){const timer=setTimeout(()=>{timers.delete(timer);callback(...args);},delay);timers.add(timer);return timer;},
  clearTimeout(timer){timers.delete(timer);clearTimeout(timer);},
  setInterval(callback,delay,...args){const timer=setInterval(callback,delay,...args);timers.add(timer);return timer;},
  clearInterval(timer){timers.delete(timer);clearInterval(timer);},
 },{name:'MLS_NUBANK_SYNTHETIC_OFFLINE',codeGeneration:{strings:false,wasm:false}});
 vm.runInContext('class Request extends HostRequest{async json(){return JSON.parse(await this.text());}};globalThis.Request=Request;',context);
 vm.runInContext(compiled.code,context,{timeout:10000});
 const worker=vm.runInContext('NubankQaWorker.default',context),RequestClass=vm.runInContext('Request',context);
 function bridgeD1(db){
  context.__qaHostDb=db;
  try{return vm.runInContext(`(()=>{const host=__qaHostDb,raw=new WeakMap(),copy=value=>JSON.parse(JSON.stringify(value));return {prepare(sql){let statement=host.prepare(sql);const wrapped={bind(...values){statement=statement.bind(...values);raw.set(wrapped,statement);return wrapped;},async run(){return copy(await statement.run());},async first(){return copy(await statement.first());},async all(){return copy(await statement.all());}};raw.set(wrapped,statement);return wrapped;},async batch(statements){return copy(await host.batch(statements.map(statement=>raw.get(statement))));}};})()`,context);}finally{delete context.__qaHostDb;}
 }
 return {bridgeD1,outbound,request:(url,options)=>new RequestClass(url,options),fetch:(request,env)=>worker.fetch(request,env,{waitUntil(){}}),close(){for(const timer of timers){clearTimeout(timer);clearInterval(timer);}timers.clear();}};
}

// Three compiled Workers, two ephemeral SQLite databases, fixed private hops.
// No positive bank response is fabricated; all successful commands cross App → Auth → Finance.
export async function startNubankQaFixture(compiled){
 const appDb=new D1(),financeDb=new D1(),requests=[],privateHops=[],blockedOutbound=[];
 const secret='SYNTHETIC_QA_APP_INTERNAL_'+'a'.repeat(40),routerSecret='SYNTHETIC_QA_FINANCE_ROUTER_'+'b'.repeat(40);
 let origin='',cookie='',csrf='',closed=false,loseNextImport=false,conflictNextImport=false;
 const finance=isolatedRuntime(compiled.finance,{fetchImpl:async request=>{blockedOutbound.push(new URL(request.url).pathname);throw Error('QA_PROVIDER_DISABLED');}});
 const financeEnv={FINANCE_DB:finance.bridgeD1(financeDb),FINANCE_ROUTER_SECRET:routerSecret};
 const auth=isolatedRuntime(compiled.auth,{fetchImpl:async request=>{blockedOutbound.push(new URL(request.url).pathname);throw Error('QA_AUTH_OUTBOUND_DISABLED');}});
 const authEnv={APP_INTERNAL_SECRET:secret,FINANCE_ROUTER_SECRET:routerSecret,SHOPEE_FINANCE_SERVICE:{async fetch(request){
  const url=new URL(request.url);assert.equal(url.origin,privateOrigin);assert.equal(url.pathname,privatePath);assert.equal(request.method,'POST');
  privateHops.push({stage:'AUTH_TO_FINANCE',method:request.method,path:url.pathname});
  return finance.fetch(finance.request(request.url,{method:request.method,headers:request.headers,body:await request.arrayBuffer(),redirect:'manual'}),financeEnv);
 }}};
 const app=isolatedRuntime(compiled.app,{fetchImpl:async request=>{
  const url=new URL(request.url);
  if(url.origin!==privateOrigin||url.pathname!==privatePath||request.method!=='POST'){blockedOutbound.push(url.pathname);throw Error('QA_APP_OUTBOUND_DISABLED');}
  privateHops.push({stage:'APP_TO_AUTH',method:request.method,path:url.pathname});
  return auth.fetch(auth.request(request.url,{method:request.method,headers:request.headers,body:await request.arrayBuffer(),redirect:'manual'}),authEnv);
 }});
 const appEnv={ASSETS:compiled.app.assets,ADMIN_DB:app.bridgeD1(appDb),APP_INTERNAL_SECRET:secret,ADMIN_USERNAME:'synthetic-nubank-owner',ADMIN_PASSWORD:'SYNTHETIC_QA_ONLY_PASSWORD_20261110',ADMIN_SESSION_SECRET:'SYNTHETIC_QA_SESSION_'+'c'.repeat(48)};
 const dispatch=(route,{method='GET',headers={},body}={})=>app.fetch(app.request(origin+route,{method,headers:{cookie,...headers},...(body!==undefined?{body}:{})}),appEnv);
 const command=body=>dispatch('/api/admin/finance/external-cash',{method:'POST',headers:{origin,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});
 async function concurrentImport(){
  const preview={schema:'external_cash_request_v1',operation:'preview',source:'NUBANK',bank_account_declared:true,completed_transfers_declared:false,document_hash:nubankQaHash('QA_CONCURRENT_SYNTHETIC_FILE'),selection:{format:'nubank_csv',date_format:'DMY',amount_format:'DECIMAL'},rows:[{line:2,date:NUBANK_QA_MONTH+'-09',amount_cents:777,external_id:'QA_CONCURRENT_BANK',reference:null,description:'Outro operador sintético em SQLite local',reported_status:null}],cursor:null,limit:100};
  const read=await command(preview);assert.equal(read.status,200);const value=await read.json();
  const {cursor,limit,...base}=preview;
  const mutation=await command({...base,operation:'import',request_id:randomUUID(),expected_revision:value.revision,preview_hash:value.preview_hash,confirmed:true});assert.equal(mutation.status,200);
 }
 async function readBody(request){const chunks=[];let bytes=0;for await(const chunk of request){bytes+=chunk.length;assert.ok(bytes<=524288,'QA_REQUEST_BODY_LIMIT');chunks.push(chunk);}return Buffer.concat(chunks);}
 const server=http.createServer(async(request,response)=>{
  try{
   assert.equal(request.headers.host,new URL(origin).host,'QA_LOOPBACK_HOST_REQUIRED');
   const url=new URL(request.url,origin);assert.equal(url.origin,origin);const method=request.method??'GET';
   if(url.pathname==='/favicon.ico'){response.writeHead(204);response.end();return;}
   assert.ok(url.pathname==='/admin'||url.pathname.startsWith('/api/admin/'),'QA_ROUTE_REJECTED');
   const body=['GET','HEAD'].includes(method)?undefined:await readBody(request),bank=url.pathname==='/api/admin/finance/external-cash';
   const raw=bank&&body?JSON.parse(body.toString('utf8')):null;
   const log={method,path:url.pathname,operation:raw?.operation??(bank?'read':null),request_id:raw?.request_id??null,expected_revision:raw?.expected_revision??null,rows_count:Array.isArray(raw?.rows)?raw.rows.length:null,body_sha256:body?nubankQaHash(body):null};
   requests.push(log);
   if(bank&&raw?.operation==='import'&&conflictNextImport){conflictNextImport=false;await concurrentImport();log.concurrent_revision_injected=true;}
   const headers={};for(const [name,value]of Object.entries(request.headers))if(value!==undefined&&!['host','cookie','connection','content-length'].includes(name))headers[name]=Array.isArray(value)?value.join(','):value;
   const result=await dispatch(url.pathname+url.search,{method,headers,body});log.status=result.status;
   if(bank&&raw?.operation==='import'&&loseNextImport&&result.status===200){
    // Chromium may transparently replay a POST after a closed socket. A fixed
    // unavailable receipt models an intermediary losing the committed reply
    // and lets this scenario exercise the owner's explicit retry instead.
    loseNextImport=false;log.response_lost_after_commit=true;log.delivered_status=502;await result.arrayBuffer();
    response.writeHead(502,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify({schema:'external_cash_error_v1',error:'FINANCE_EXTERNAL_CASH_UNAVAILABLE'}));return;
   }
   const responseHeaders=Object.fromEntries(result.headers);delete responseHeaders['content-length'];delete responseHeaders['set-cookie'];
   let bytes=Buffer.from(await result.arrayBuffer());
   if(responseHeaders['content-type']?.startsWith('text/html'))bytes=Buffer.from(bytes.toString('utf8').replace(/<body\b[^>]*>/i,'$&'+marker));
   response.writeHead(result.status,responseHeaders);response.end(bytes);
  }catch(error){response.writeHead(500,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify({error:'SYNTHETIC_QA_ROUTE_FAILED'}));}
 });
 async function close(){if(closed)return;closed=true;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));for(const runtime of [app,auth,finance])runtime.close();appDb.db.close();financeDb.db.close();}
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;
  const login=await dispatch('/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:appEnv.ADMIN_USERNAME,password:appEnv.ADMIN_PASSWORD})});
  assert.equal(login.status,303,'QA_SYNTHETIC_LOGIN_REQUIRED');cookie=login.headers.getSetCookie().find(value=>value.startsWith('braza_admin='))?.split(';')[0];assert.ok(cookie);
  const boot=await dispatch('/api/admin/bootstrap');assert.equal(boot.status,200);csrf=(await boot.json()).csrf;
  const initial=await dispatch('/api/admin/state');assert.equal(initial.status,200,'QA_SYNTHETIC_STATE_REQUIRED');
  return {origin,requests,privateHops,blockedOutbound,close,loseNextImport(){loseNextImport=true;},conflictNextImport(){conflictNextImport=true;},
   async workspace(){const response=await dispatch('/api/admin/finance/external-cash?month='+NUBANK_QA_MONTH);assert.equal(response.status,200);return response.json();},
   databaseCounts(){const exists=financeDb.db.prepare("SELECT 1 FROM sqlite_master WHERE name='finance_external_cash_records'").get();return exists?{records:financeDb.db.prepare('SELECT COUNT(*) AS n FROM finance_external_cash_records').get().n,imports:financeDb.db.prepare('SELECT COUNT(*) AS n FROM finance_external_cash_imports').get().n,matches:financeDb.db.prepare('SELECT COUNT(*) AS n FROM finance_external_cash_matches').get().n,unlinks:financeDb.db.prepare('SELECT COUNT(*) AS n FROM finance_external_cash_unlinks').get().n,audit:financeDb.db.prepare('SELECT COUNT(*) AS n FROM finance_external_cash_audit').get().n}:{records:0,imports:0,matches:0,unlinks:0,audit:0};},
  };
 }catch(error){await close();throw error;}
}
