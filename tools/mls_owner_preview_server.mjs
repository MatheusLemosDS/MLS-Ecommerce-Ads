#!/usr/bin/env node
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync,openSync,closeSync,fstatSync,constants} from 'node:fs';
import {createPreviewRuntime} from './mls-owner-preview/runtime.mjs';
import {seedPreviewCatalog} from './mls-owner-preview/seed.mjs';

const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const reject=(code,status=400)=>{throw Object.assign(Error(code),{code,status});};
const maxBody=2*1024*1024;
class PreviewD1{
 constructor(filename=':memory:'){this.db=new DatabaseSync(filename);}
 prepare(sql){const db=this.db;let args=[];return {bind(...values){args=values;return this;},async run(){if(/^\s*SELECT\b/i.test(sql))return {results:db.prepare(sql).all(...args),meta:{changes:0}};const result=db.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}};}
 async batch(statements){this.db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}}
}
const landing=()=>new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MLS · Prévia local</title><style>body{font:16px system-ui;background:#081426;color:#e6f1ff;margin:0;padding:24px}main{max-width:760px;margin:8vh auto;padding:30px;border:1px solid #304359;border-radius:18px}h1{font-size:30px}p{line-height:1.7;color:#aec3d9}button,a{font:inherit;display:inline-block;padding:14px 20px;border-radius:10px;border:0;background:#4da9ff;color:#061526;font-weight:700}small{display:block;margin:24px 0;color:#aec3d9}</style><main><h1>MLS Commerce OS</h1><h2>Prévia local · dados fictícios</h2><p>Explore os painéis, o catálogo adulto/infantil e kits, os custos, a Listing Factory e as cinco áreas do AI Sales.</p><p>Este ambiente não tem conexão com a loja. Valores financeiros ausentes continuam desconhecidos. Não publica produtos, não envia convites e não altera campanhas.</p><form method="post" action="/__preview/login"><button>Abrir demonstração interativa</button></form><small>Login e banco locais. Nenhuma senha da sua loja é solicitada.</small></main></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'x-content-type-options':'nosniff'}});
function mediaInventory(directory){
 if(!directory)return {index:null,files:new Map()};
 const root=realpathSync(directory);if(lstatSync(directory).isSymbolicLink())reject('PREVIEW_MEDIA_SYMLINK');
 const readBounded=(filename,max)=>{const fd=openSync(filename,constants.O_RDONLY|constants.O_NOFOLLOW);try{const state=fstatSync(fd);if(!state.isFile()||state.size<1||state.size>max)reject('PREVIEW_MEDIA_FILE_INVALID');const bytes=readFileSync(fd);if(bytes.length!==state.size||bytes.length>max)reject('PREVIEW_MEDIA_FILE_CHANGED');return bytes;}finally{closeSync(fd);}};
 const data=readBounded(path.join(root,'demo-index.json'),1048576);
 const index=JSON.parse(data);if(index.schema!=='mls_owner_preview_media_v1'||index.source!=='ORIGINAL_SYNTHETIC_FIXTURES'||index.commercial_writes!==false||!Array.isArray(index.files)||index.files.length>100)reject('PREVIEW_MEDIA_INDEX_INVALID');
 const files=new Map(),mimes=new Set(['application/json','image/png','image/jpeg','video/mp4','application/x-subrip','text/plain','text/plain; charset=utf-8']);let totalBytes=0;
 for(const row of index.files){
  if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(row.id)||files.has(row.id)||!mimes.has(row.mime)||typeof row.relative_path!=='string'||!row.relative_path.split('/').every(part=>/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(part))||!Number.isSafeInteger(row.size_bytes)||row.size_bytes<1||row.size_bytes>67108864||!/^[a-f0-9]{64}$/.test(row.sha256))reject('PREVIEW_MEDIA_ENTRY_INVALID');
  totalBytes+=row.size_bytes;if(totalBytes>268435456)reject('PREVIEW_MEDIA_TOTAL_TOO_LARGE');
  let current=root;for(const part of row.relative_path.split('/')){current=path.join(current,part);if(lstatSync(current).isSymbolicLink())reject('PREVIEW_MEDIA_SYMLINK');}
  if(!lstatSync(current).isFile()||!realpathSync(current).startsWith(root+path.sep))reject('PREVIEW_MEDIA_FILE_INVALID');
  const bytes=readBounded(current,Math.min(row.size_bytes,67108864));if(bytes.length!==row.size_bytes||createHash('sha256').update(bytes).digest('hex')!==row.sha256)reject('PREVIEW_MEDIA_HASH_MISMATCH');files.set(row.id,{...row,bytes});
 }
 return {index,files};
}
async function bodyBytes(request){return new Promise((resolve,fail)=>{let chunks=[],length=0,failed=false;request.on('data',chunk=>{if(failed)return;length+=chunk.length;if(length>maxBody){failed=true;chunks=[];fail(Object.assign(Error('PREVIEW_BODY_TOO_LARGE'),{code:'PREVIEW_BODY_TOO_LARGE',status:413}));}else chunks.push(chunk);});request.once('end',()=>{if(!failed)resolve(Buffer.concat(chunks));});request.once('error',fail);});}
export async function startPreviewServer({port=0,host='127.0.0.1',workerPath=path.join(projectRoot,'dist/app-worker.mjs'),mediaDirectory,seed=true,databasePath=':memory:'}={}){
 if(host!=='127.0.0.1'||!Number.isSafeInteger(port)||port<0||port>65535)reject('PREVIEW_LOOPBACK_REQUIRED');
 const media=mediaInventory(mediaDirectory),runtime=await createPreviewRuntime(path.resolve(workerPath)),db=new PreviewD1(databasePath);
 const env={ADMIN_DB:runtime.bridgeD1(db),ADMIN_USERNAME:'local-preview',ADMIN_PASSWORD:randomBytes(24).toString('hex'),ADMIN_SESSION_SECRET:randomBytes(32).toString('hex'),MLS_V36_OWNER_PREVIEW:'ENABLED',MLS_AI_SALES_OWNER_PREVIEW:'ENABLED'};
 let origin='',closed=false;
 const workerCall=(url,options={})=>runtime.fetch(runtime.request(url,options),env);
 const authenticate=async headers=>{const response=await workerCall(origin+'/api/admin/bootstrap',{headers:{cookie:headers.get('cookie')||''}});if(response.status!==200)reject('UNAUTHORIZED',401);return response;};
 const demoLogin=()=>workerCall(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})});
 const server=http.createServer(async(request,response)=>{
  try{
   const expected=new URL(origin);if(request.headers.host!==expected.host)reject('PREVIEW_HOST_REJECTED',403);
   const url=new URL(request.url,origin);if(url.origin!==origin||request.url.startsWith('//'))reject('PREVIEW_ORIGIN_REJECTED',403);
   const method=request.method||'GET',headers=new Headers();for(const [key,value]of Object.entries(request.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
   if(!['GET','HEAD'].includes(method)&&headers.get('origin')!==origin)reject('PREVIEW_ORIGIN_REJECTED',403);
   let result;
   if(url.pathname==='/'&&method==='GET')result=landing();
   else if(url.pathname==='/__preview/status'&&method==='GET')result=json({schema:'mls_owner_preview_status_v1',source:'ORIGINAL_SYNTHETIC_FIXTURES',worker_sha256:runtime.workerHash,connected_to_merchant:false,commercial_writes:false,outbound_attempts:runtime.outboundAttempts,media_files:media.files.size});
   else if(url.pathname==='/__preview/login'&&method==='POST'){const bytes=await bodyBytes(request);if(bytes.length>1024)reject('PREVIEW_BODY_TOO_LARGE',413);result=await demoLogin();}
   else if(url.pathname==='/__preview/media'&&method==='GET'){await authenticate(headers);result=media.index?json(media.index):json({error:'PREVIEW_MEDIA_NOT_PREPARED'},503);}
   else if(url.pathname.startsWith('/__preview/media/')&&['GET','HEAD'].includes(method)){
    await authenticate(headers);const id=url.pathname.slice('/__preview/media/'.length),file=media.files.get(id);if(!file||url.search)reject('PREVIEW_MEDIA_NOT_FOUND',404);
    result=new Response(method==='HEAD'?null:file.bytes,{headers:{'content-type':file.mime,'content-length':String(file.bytes.length),'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'"}});
   }else if(['/login','/logout','/admin/logout','/admin','/admin/diagnostics','/dashboard','/campaigns','/optimization','/integrations'].includes(url.pathname)||url.pathname.startsWith('/api/admin/')){
    const body=['GET','HEAD'].includes(method)?undefined:await bodyBytes(request);result=await workerCall(url.href,{method,headers,body});
   }else reject('PREVIEW_ROUTE_NOT_FOUND',404);
   if((result.headers.get('content-type')||'').startsWith('text/html')){const text=(await result.text()).replace(/<body\b[^>]*>/i,'$&<aside id="mlsLocalPreviewBanner" role="note" style="padding:10px 16px;background:#fff3cf;color:#342500;font:600 13px system-ui;position:relative;z-index:50">Prévia local · dados fictícios · sem conexão com a loja</aside>');result=new Response(text,{status:result.status,headers:result.headers});}
   for(const [key,value]of result.headers)if(key!=='set-cookie')response.setHeader(key,value);
   const cookies=result.headers.getSetCookie();if(cookies.length)response.setHeader('set-cookie',cookies);response.writeHead(result.status);
   response.end(Buffer.from(await result.arrayBuffer()));
  }catch(error){const result=json({error:/^[A-Z][A-Z0-9_]{0,90}$/.test(error?.code||'')?error.code:'PREVIEW_REQUEST_FAILED'},error?.status||500);response.writeHead(result.status,Object.fromEntries(result.headers));response.end(await result.text());}
 });
 server.requestTimeout=20000;server.headersTimeout=10000;
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});origin='http://'+host+':'+server.address().port;
  const login=await demoLogin(),cookie=login.headers.getSetCookie().find(value=>value.startsWith('braza_admin='))?.split(';')[0];if(login.status!==303||!cookie)reject('PREVIEW_AUTH_SETUP_FAILED',503);
  const state=await workerCall(origin+'/api/admin/state',{headers:{cookie}});if(state.status!==200)reject('PREVIEW_DATABASE_SETUP_FAILED',503);
  if(seed)await seedPreviewCatalog({...env,ADMIN_DB:db});
 }catch(error){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));runtime.close();db.db.close();throw error;}
 return Object.freeze({origin,workerHash:runtime.workerHash,async close(){if(closed)return;closed=true;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));runtime.close();db.db.close();}});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let preview;try{const args=process.argv.slice(2),options={};for(let index=0;index<args.length;index+=2){if(!['--port','--media'].includes(args[index])||!args[index+1])reject('PREVIEW_ARGUMENT_INVALID');options[args[index]==='--port'?'port':'mediaDirectory']=args[index]==='--port'?Number(args[index+1]):args[index+1];}preview=await startPreviewServer(options);console.log('Prévia local · dados fictícios · sem conexão com a loja: '+preview.origin);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>preview.close());}catch{console.error('MLS_PREVIEW_SETUP_FAILED');process.exitCode=1;}
}
