import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import http from 'node:http';
import {createHash,randomUUID,webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {D1} from '../web/cloudflare/tests/sqlite-d1.mjs';
import {projectProductionOrdersFrame,projectProductionOrdersRequest} from '../web/finance/src/production-orders-frame.mjs';
import {createLocalBrowserAssets} from './browser_assets.mjs';

export const orderOperationsQaHash=value=>createHash('sha256').update(value).digest('hex');
export const ORDER_OPERATIONS_QA_PATH='/api/admin/order-operations';
export const ORDER_OPERATIONS_QA_PRIVATE_PATH='/internal/shopee/finance/production-orders';
const marker='<aside id="orderOperationsQaSynthetic" role="note" style="position:fixed;right:6px;bottom:76px;z-index:99999;max-width:180px;pointer-events:none;padding:6px;background:#fff3cf;color:#342500;border:1px solid #a46a00;font:600 10px system-ui">QA SINTÉTICA · SEM CONEXÃO COM A LOJA</aside>';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function compileOrderOperationsQaWorker(root,minify){
 const file=path.join(root,'dist/app-worker.mjs'),source=readFileSync(file),text=source.toString('utf8');
 assert.ok(text.includes('order_operations_events')&&text.includes('orderOperationsTitle'),'QA_ORDER_SOURCE_NOT_BUILT');
 const result=await build({entryPoints:[file],bundle:true,write:false,format:'iife',globalName:'OrderOperationsQaWorker',platform:'browser',target:'es2022',minify,logLevel:'silent'});
 const assets=createLocalBrowserAssets(root);assert.ok(assets.manifest.assets.some(row=>row.id==='orders'),'QA_ORDER_ASSET_NOT_BUILT');
 return {code:result.outputFiles[0].text,source_sha256:orderOperationsQaHash(source),compiled_sha256:orderOperationsQaHash(result.outputFiles[0].text),bytes:source.length,assets};
}

function runtime(compiled,fetchImpl){
 const timers=new Set(),context=vm.createContext({HostRequest:Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,AbortController,AbortSignal,ReadableStream,TransformStream,WritableStream,Blob,FormData,File,crypto:webcrypto,btoa,atob,
  console:Object.freeze({log(){},warn(){},error(){}}),fetch:fetchImpl,
  setTimeout(callback,delay,...args){const id=setTimeout(()=>{timers.delete(id);callback(...args);},delay);timers.add(id);return id;},clearTimeout(id){timers.delete(id);clearTimeout(id);},
  setInterval(callback,delay,...args){const id=setInterval(callback,delay,...args);timers.add(id);return id;},clearInterval(id){timers.delete(id);clearInterval(id);},
 },{name:'MLS_ORDER_OPERATIONS_SYNTHETIC_OFFLINE',codeGeneration:{strings:false,wasm:false}});
 vm.runInContext('class Request extends HostRequest{async json(){return JSON.parse(await this.text());}};globalThis.Request=Request;',context);
 vm.runInContext(compiled.code,context,{timeout:10000});
 const worker=vm.runInContext('OrderOperationsQaWorker.default',context),RequestClass=vm.runInContext('Request',context);
 function bridge(db){context.__qaDb=db;try{return vm.runInContext(`(()=>{const host=__qaDb,statements=new WeakMap(),copy=value=>JSON.parse(JSON.stringify(value));return {prepare(sql){let raw=host.prepare(sql);const wrapped={bind(...values){raw=raw.bind(...values);statements.set(wrapped,raw);return wrapped;},async run(){return copy(await raw.run());},async first(){return copy(await raw.first());},async all(){return copy(await raw.all());}};statements.set(wrapped,raw);return wrapped;},async batch(rows){return copy(await host.batch(rows.map(row=>statements.get(row))));}};})()`,context);}finally{delete context.__qaDb;}}
 return {bridge,request:(url,options)=>new RequestClass(url,options),fetch:(request,env)=>worker.fetch(request,env,{waitUntil(){}}),close(){for(const id of timers){clearTimeout(id);clearInterval(id);}timers.clear();}};
}

/** The only positive remote-shaped response is a private synthetic Shopee frame.
 * Browser requests still execute the compiled App and its SQLite-backed routes.
 * The ASSETS binding serves exact build-inventoried bytes, without HTML injection
 * of the controller or a legacy compiled-page compatibility wrapper. */
export async function startOrderOperationsQaFixture(compiled,{blockedAssetId=null}={}){
 assert.ok(blockedAssetId===null||compiled.assets.manifest.assets.some(row=>row.id===blockedAssetId),'QA_ASSET_ID_INVALID');
 const db=new D1(),requests=[],privateCalls=[],blockedOutbound=[],assetReads=[],failures=[],sql=[];
 const originalPrepare=db.prepare.bind(db),originalBatch=db.batch.bind(db);let serial=Promise.resolve();
 db.prepare=statement=>{sql.push(statement);return originalPrepare(statement);};
 db.batch=rows=>{const work=serial.then(()=>originalBatch(rows));serial=work.catch(()=>{});return work;};
 let origin='',cookie='',csrf='',closed=false,loseNextMutation=false,conflictNextMutation=false,held=null;
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()),day=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10),dayStart=Date.parse(day+'T00:00:00-03:00')/1000;
 const base=Math.floor(Date.now()/1000),created=Math.min(dayStart+28800,base-1),orders=new Map();
 for(let index=1;index<=55;index++){
  const order_id='QA_ORDER_'+String(index).padStart(4,'0'),status=index===51?'SHIPPED':index===52?'COMPLETED':index===53?'CANCELLED':index===54?'UNPAID':index===55?'TO_RETURN':'READY_TO_SHIP';
  const create_time=Math.max(dayStart,created-index);
  orders.set(order_id,{order_id,status,create_time,update_time:Math.max(create_time,base-100),lines:[{line_key:'900:1',item_id:'900',model_id:'1',sku:'QA_STAMP-27',quantity:2,model_name:'Azul / M'}]});
 }
 const app=runtime(compiled,async(input,init)=>{
  const request=input instanceof Request&&init===undefined?input:new Request(input,init),url=new URL(request.url);
  if(url.origin!=='https://auth.brazacommerce.com.br'||url.pathname!==ORDER_OPERATIONS_QA_PRIVATE_PATH||request.method!=='POST'){blockedOutbound.push({method:request.method,path:url.pathname});throw Error('QA_OUTBOUND_DISABLED');}
  const query=projectProductionOrdersRequest(JSON.parse(await request.text()));assert.ok(query,'QA_PRIVATE_REQUEST_INVALID');
  privateCalls.push({operation:query.operation,start_date:query.start_date??null,end_date:query.end_date??null,orders:query.order_ids?.length??null});
  const selected=[...orders.values()].filter(row=>query.operation==='verify'?query.order_ids.includes(row.order_id):row.create_time>=Date.parse(query.start_date+'T00:00:00-03:00')/1000&&row.create_time<Date.parse(query.end_date+'T00:00:00-03:00')/1000+86400);
  const value={schema:'production_orders_v1',shop_id:1178167501,checked_at:Math.floor(Date.now()/1000),start_date:query.start_date??null,end_date:query.end_date??null,complete:true,orders:selected};
  assert.ok(projectProductionOrdersFrame(value),'QA_PRIVATE_FRAME_INVALID');return new Response(JSON.stringify(value),{headers:{'content-type':'application/json; charset=utf-8'}});
 });
 const env={ASSETS:{async fetch(request){const requested=new URL(request.url).pathname;assetReads.push(requested);if(compiled.assets.manifest.assets.find(row=>row.id===blockedAssetId)?.path===requested)return new Response(null,{status:503});return compiled.assets.fetch(request);}},ADMIN_DB:app.bridge(db),APP_INTERNAL_SECRET:'SYNTHETIC_ORDER_QA_INTERNAL_'+'a'.repeat(40),ADMIN_USERNAME:'synthetic-order-owner',ADMIN_PASSWORD:'SYNTHETIC_ORDER_QA_PASSWORD',ADMIN_SESSION_SECRET:'SYNTHETIC_ORDER_QA_SESSION_'+'b'.repeat(48)};
 const dispatch=(route,{method='GET',headers={},body}={})=>app.fetch(app.request(origin+route,{method,headers:{cookie,...headers},...(body!==undefined?{body}:{})}),env);
 const command=body=>dispatch(ORDER_OPERATIONS_QA_PATH,{method:'POST',headers:{origin,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});
 const selection={start_date:day,end_date:day,status:'ALL',page:1},workspacePath=()=>ORDER_OPERATIONS_QA_PATH+'?'+new URLSearchParams(selection);
 const schema=()=>db.db.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
 async function concurrentMutation(body){
  const response=await dispatch(workspacePath());assert.equal(response.status,200);const value=await response.json(),row=value.orders.find(row=>row.identity.order_id!==body.identity.order_id&&row.can_update&&row.operation.stage===null);assert.ok(row);
  const result=await command({request_id:randomUUID(),revision:value.revision,identity:row.identity,source_hash:row.source_hash,from_stage:null,to_stage:'SEPARATION',reason:'Outro operador sintético confirmou separação.',confirmed:true});assert.equal(result.status,200,'QA_CONCURRENT_MUTATION_REQUIRED');
 }
 const server=http.createServer(async(request,response)=>{
  try{
   assert.equal(request.headers.host,new URL(origin).host);const url=new URL(request.url,origin),method=request.method??'GET';
   if(url.pathname==='/favicon.ico'){response.writeHead(204);response.end();return;}
   assert.ok(['/admin','/login','/admin/logout'].includes(url.pathname)||url.pathname.startsWith('/api/admin/')||url.pathname.startsWith('/assets/mls/'),'QA_ROUTE_NOT_ALLOWED');
   let body;if(!['GET','HEAD'].includes(method)){const chunks=[];let bytes=0;for await(const chunk of request){bytes+=chunk.length;assert.ok(bytes<=65536,'QA_BODY_LIMIT');chunks.push(chunk);}body=Buffer.concat(chunks);}
   const operation=url.pathname===ORDER_OPERATIONS_QA_PATH,raw=operation&&body?JSON.parse(body.toString('utf8')):null;
   const log={method,path:url.pathname,query:operation?url.search:null,request_id:raw?.request_id??null,revision:raw?.revision??null,order_id:raw?.identity?.order_id??null,to_stage:raw?.to_stage??null,body_sha256:body?orderOperationsQaHash(body):null};requests.push(log);
   if(operation&&method==='POST'&&conflictNextMutation){conflictNextMutation=false;await concurrentMutation(raw);log.concurrent_revision_injected=true;}
   const headers={};for(const [name,value]of Object.entries(request.headers))if(value!==undefined&&!['host','cookie','connection','content-length'].includes(name))headers[name]=Array.isArray(value)?value.join(','):value;
   const result=await dispatch(url.pathname+url.search,{method,headers,body});log.status=result.status;
   if(url.pathname==='/admin/logout'&&method==='POST'&&result.status===204){assert.ok(result.headers.getSetCookie().some(value=>value.startsWith('braza_admin=')&&/Max-Age=0/i.test(value)),'QA_LOGOUT_COOKIE_MUST_EXPIRE');cookie='';log.owner_session_cleared=true;}
   if(operation&&method==='POST'&&loseNextMutation&&result.status===200){loseNextMutation=false;log.response_lost_after_commit=true;log.delivered_status=502;await result.arrayBuffer();response.writeHead(502,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify({error:'ORDER_OPERATIONS_UNAVAILABLE'}));return;}
   if(operation&&method==='GET'&&held){const pending=held;held=null;pending.started();await pending.wait;log.delayed_response_released=true;}
   const responseHeaders=Object.fromEntries(result.headers);delete responseHeaders['content-length'];delete responseHeaders['set-cookie'];let bytes=Buffer.from(await result.arrayBuffer());
   if(responseHeaders['content-type']?.startsWith('text/html'))bytes=Buffer.from(bytes.toString('utf8').replace(/<body\b[^>]*>/i,'$&'+marker));
   response.writeHead(result.status,responseHeaders);response.end(bytes);
  }catch(error){failures.push(String(error?.message??error));if(!response.headersSent)response.writeHead(500,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify({error:'SYNTHETIC_ORDER_QA_FAILED'}));}
 });
 const pendingHolds=[];
 async function close(){if(closed)return;closed=true;for(const release of pendingHolds)release();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));app.close();db.db.close();}
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;
  const login=await dispatch('/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})});assert.equal(login.status,303);
  cookie=login.headers.getSetCookie().find(value=>value.startsWith('braza_admin='))?.split(';')[0];assert.ok(cookie);
  const bootstrap=await dispatch('/api/admin/bootstrap');assert.equal(bootstrap.status,200);csrf=(await bootstrap.json()).csrf;
  const before=schema();sql.length=0;const cold=await dispatch(workspacePath());assert.equal(cold.status,200);const coldFrame=await cold.json();
  assert.equal(coldFrame.coverage.state,'NOT_CAPTURED');assert.equal(coldFrame.revision,0);assert.deepEqual(schema(),before);assert.ok(sql.every(statement=>/^\s*(SELECT|WITH)\b/i.test(statement)),'QA_COLD_GET_MUST_BE_SELECT_ONLY');
  const coldGet={status:cold.status,source:coldFrame.coverage.state,revision:coldFrame.revision,sql_select_only:true,schema_unchanged:true,queries:sql.length};
  const state=await dispatch('/api/admin/state');assert.equal(state.status,200);
  return {origin,day,today,selection,requests,privateCalls,assetReads,blockedOutbound,failures,coldGet,assets:compiled.assets.manifest,close,
   async workspace(){const response=await dispatch(workspacePath());assert.equal(response.status,200);return response.json();},
   loseNextMutation(){loseNextMutation=true;},conflictNextMutation(){conflictNextMutation=true;},
   setProviderStatus(order_id,status){const row=orders.get(order_id);assert.ok(row);row.status=status;row.update_time=Math.min(Math.floor(Date.now()/1000),Math.max(row.update_time+1,Math.floor(Date.now()/1000)-2));},
   setProviderQuantity(order_id,quantity){const row=orders.get(order_id);assert.ok(row);assert.ok(Number.isSafeInteger(quantity)&&quantity>0);row.lines[0].quantity=quantity;row.update_time=Math.min(Math.floor(Date.now()/1000),Math.max(row.update_time+1,Math.floor(Date.now()/1000)-2));},
   stale(order_id){
    // Model a coherent older observation, rather than a checked_at preceding
    // the provider update it purports to contain. The next private sync uses
    // the newer synthetic provider observation and restores eligibility.
    const checked=Math.floor(Date.now()/1000)-301,row=db.db.prepare('SELECT * FROM production_dtf_orders WHERE order_id=?').get(order_id);assert.ok(row);const updated=Math.max(row.create_time,Math.min(row.update_time,checked-1));assert.ok(updated<=checked+60);
    const lines=db.db.prepare('SELECT line_key,payload FROM production_dtf_lines WHERE order_id=? AND missing=0 ORDER BY line_key').all(order_id).map(line=>{const value=JSON.parse(line.payload);return [line.line_key,orderOperationsQaHash(JSON.stringify([value.item_id,value.model_id,value.sku,value.quantity,value.model_name]))];});
    const sourceHash=orderOperationsQaHash(JSON.stringify({status:row.status,create_time:row.create_time,update_time:updated,lines}));
    db.db.prepare('UPDATE production_dtf_orders SET checked_at=?,update_time=?,source_hash=? WHERE order_id=?').run(checked,updated,sourceHash,order_id);db.db.prepare('UPDATE production_dtf_lines SET checked_at=? WHERE order_id=?').run(checked,order_id);
   },
   holdNextRead(){assert.equal(held,null);let started,release;const began=new Promise(resolve=>{started=resolve;}),wait=new Promise(resolve=>{release=resolve;});held={started,wait};pendingHolds.push(release);return {started:began,release};},
   async waitRequest(predicate){for(let i=0;i<200;i++){const row=requests.find(predicate);if(row)return row;await pause(20);}throw Error('QA_EXPECTED_REQUEST_NOT_OBSERVED');},
   databaseCounts(){const present=db.db.prepare("SELECT 1 FROM sqlite_master WHERE name='order_operations_events'").get();return {events:present?db.db.prepare('SELECT COUNT(*) n FROM order_operations_events').get().n:0,manufacturing_tables:db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'incurred_production_%'").get().n};},
  };
 }catch(error){await close();throw error;}
}
