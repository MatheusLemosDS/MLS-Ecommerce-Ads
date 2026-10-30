#!/usr/bin/env node
// Development-only, self-contained owner review. No store account or network.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {startPreviewServer} from './mls_owner_preview_server.mjs';
import {projectProductRegistryFrame} from '../web/cloudflare/src/product-registry.mjs';

const csrf='0'.repeat(64),digest=value=>createHash('sha256').update(value).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code});};
const inline=value=>JSON.stringify(value).replaceAll('<','\\u003c').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
function sanitize(value){
 if(Array.isArray(value))return value.map(sanitize);
 if(value&&typeof value==='object'){const next={};for(const [key,row] of Object.entries(value)){
  if(['access_token','refresh_token','token','session_token','secret','password','admin_password','admin_session_secret','authorization','api_key','credentials','cookie','set-cookie'].includes(key.toLowerCase()))fail('OFFLINE_SENSITIVE_FIELD_REJECTED');
  next[key]=key.toLowerCase()==='csrf'?csrf:sanitize(row);
 }return next;}return value;
}
export function createOfflinePreviewHtml({html,workerHash,snapshots,media=[]}){
 if(typeof html!=='string'||!html.includes('id="ai-sales"')||!html.includes('class="app-shell"')||!/^[a-f0-9]{64}$/.test(workerHash)||!Array.isArray(snapshots)||snapshots.length>100||!Array.isArray(media)||media.length>100)fail('OFFLINE_EXPORT_INPUT_INVALID');
 const reads=snapshots.map(row=>{
  if(!row||typeof row.path!=='string'||!row.path.startsWith('/api/admin/')||!Number.isInteger(row.status)||row.status<200||row.status>599)fail('OFFLINE_SNAPSHOT_INVALID');
  return {path:row.path,status:row.status,body:sanitize(row.body),contract:row.contract??null};
 });
 let mediaBytes=0;
 const knownMedia=media.map(row=>{
  if(!row||!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(row.id)||!['video/mp4','image/png','image/jpeg','application/json','text/plain','application/x-subrip'].includes(row.mime)||typeof row.base64!=='string'||row.base64.length>12000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(row.base64))fail('OFFLINE_MEDIA_INVALID');
  mediaBytes+=row.base64.length;if(mediaBytes>18000000)fail('OFFLINE_MEDIA_TOO_LARGE');
  return {id:row.id,mime:row.mime,base64:row.base64,title:typeof row.title==='string'?row.title.slice(0,100):row.id,file_name:typeof row.file_name==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(row.file_name)?row.file_name:null};
 });
 const prelude=String.raw`<script>
(()=>{
 const snapshots=__SNAPSHOTS__,media=__MEDIA__,projectCatalog=__PROJECT__;
 const canonical=value=>{const u=new URL(value,'https://mls-offline.invalid');u.searchParams.sort();return u.pathname+u.search;};
 const records=new Map(snapshots.map(row=>[canonical(row.path),row]));
 const copy=value=>JSON.parse(JSON.stringify(value)),reply=(body,status=200,contract=null)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...(contract?{'X-Braza-Client-Contract':contract}:{})}});
 const baseCatalog=records.get('/api/admin/product-registry?item_status=ACTIVE&limit=100&offset=0');
 function catalog(url){
  const keys=[...url.searchParams.keys()];if(new Set(keys).size!==keys.length||keys.some(k=>!['limit','offset','search','item_status','item_id','variant_limit','variant_offset'].includes(k)))return null;
  const integer=(key,fallback,max)=>{const raw=url.searchParams.get(key);if(raw===null)return fallback;if(!/^(0|[1-9][0-9]*)$/.test(raw))return null;const n=Number(raw);return Number.isSafeInteger(n)&&n<=max?n:null;};
  const id=url.searchParams.get('item_id');
  if(id!==null){
   if(keys.some(k=>!['item_id','variant_limit','variant_offset'].includes(k)))return null;
   const found=snapshots.find(row=>row.body?.schema==='product_registry_detail_v1'&&row.body.product.item_id===id);if(!found||found.status!==200)return null;
   const value=copy(found.body),limit=integer('variant_limit',50,100),offset=integer('variant_offset',0,1000000);if(!limit||offset===null)return null;
   value.variants=value.variants.slice(offset,offset+limit);value.pagination={limit,offset,total:found.body.pagination.total,more:offset+limit<found.body.pagination.total};return projectCatalog(value);
  }
  if(keys.some(k=>!['limit','offset','search','item_status'].includes(k))||!baseCatalog||baseCatalog.status!==200)return null;
  const value=copy(baseCatalog.body),limit=integer('limit',20,100),offset=integer('offset',0,1000000),status=url.searchParams.get('item_status')||'ACTIVE',search=(url.searchParams.get('search')||'').trim().toLocaleLowerCase('pt-BR');
  if(!limit||offset===null||search.length>120||!['ACTIVE','ALL','NORMAL','UNKNOWN','BANNED','UNLIST','REVIEWING','SELLER_DELETE','SHOPEE_DELETE'].includes(status))return null;
  const rows=value.products.filter(p=>(status==='ALL'||(status==='ACTIVE'?!['SELLER_DELETE','SHOPEE_DELETE'].includes(p.item_status):p.item_status===status))&&((p.product_name||'').toLocaleLowerCase('pt-BR').includes(search)||p.item_id.includes(search)));
  value.products=rows.slice(offset,offset+limit);value.pagination={limit,offset,total:rows.length,more:offset+limit<rows.length};return projectCatalog(value);
 }
 globalThis.fetch=async(resource,options={})=>{
  const url=new URL(typeof resource==='string'?resource:resource.url,'https://mls-offline.invalid'),method=(options.method||(resource instanceof Request?resource.method:'GET')).toUpperCase();
  if(method!=='GET')return reply({error:'OFFLINE_PREVIEW_READ_ONLY'},503);
  if(url.origin!=='https://mls-offline.invalid')return reply({error:'OFFLINE_PREVIEW_NETWORK_DISABLED'},503);
  if(url.pathname==='/api/admin/bootstrap')return reply({schema:'admin_bootstrap_v1',csrf:'0000000000000000000000000000000000000000000000000000000000000000'});
  if(url.pathname==='/api/admin/product-registry'){const value=catalog(url);return value?reply(value):reply({error:'OFFLINE_CATALOG_SELECTION_UNAVAILABLE'},503);}
  const row=records.get(canonical(url.href));return row?reply(copy(row.body),row.status,row.contract):reply({error:'OFFLINE_SOURCE_UNAVAILABLE'},503);
 };
 globalThis.__mlsOfflineReview=Object.freeze({source:'ORIGINAL_SYNTHETIC_FIXTURES',backend_mode:'READ_ONLY_SNAPSHOT',connected_to_merchant:false,commercial_writes:false});
 document.addEventListener('click',event=>{
  const link=event.target.closest?.('a');if(!link)return;const href=link.getAttribute('href')||'';
  if(link.hasAttribute('download')&&href.startsWith('blob:'))return;
  const panel=link.dataset.tab||link.dataset.workspaceTab||link.dataset.missionOpen||link.dataset.open;
  const panels=['overview','agents','products','production','margins','hermes','history','roadmap','agent-finance','agent-ads','agent-products','agent-production','agent-returns','agent-auditor','agent-hermes','ai-sales'];
  if(href.startsWith('#'))return;
  if(panels.includes(panel)){const url=new URL(href,'https://mls-offline.invalid');if(url.origin==='https://mls-offline.invalid'&&url.pathname==='/admin'&&url.searchParams.get('tab')===panel&&[...url.searchParams].length===1)return;}
  if(href){event.preventDefault();const message=document.getElementById('mlsOfflineMessage');if(message)message.textContent='Esta ação precisa da prévia local com servidor. Esta demonstração não conecta à loja nem abre sites externos.';}
 },true);
 addEventListener('DOMContentLoaded',()=>{
  const host=document.getElementById('mlsOfflineVideos');
  for(const item of media){
   const bytes=Uint8Array.from(atob(item.base64),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:item.mime}));
   const article=document.createElement('article'),label=document.createElement('h3');label.textContent=item.title;article.append(label);
   if(item.mime==='video/mp4'){const video=document.createElement('video');video.controls=true;video.preload='metadata';video.src=url;article.append(video);}
   const a=document.createElement('a');a.href=url;a.download=item.file_name||item.id+(item.mime==='video/mp4'?'.mp4':item.mime==='application/json'?'.json':item.mime==='image/png'?'.png':'.txt');a.textContent='Baixar exemplo';article.append(a);host.append(article);
  }
  if(!media.length)host.textContent='Os vídeos estão no pacote de demonstração separado. O render funciona pelo CLI local.';
 });
})();
</script>`
 .replace('__SNAPSHOTS__',inline(reads)).replace('__MEDIA__',inline(knownMedia)).replace('__PROJECT__',projectProductRegistryFrame.toString());
 const welcome=`<details class="mls-offline-help" open><summary>DEMONSTRAÇÃO LOCAL · dados fictícios · sem conexão com a loja</summary><p>Explore as telas e os exemplos adulto, infantil e kit. No AI Sales, teste cadastro local de criador, importação/exportação, arquivos originais e planejamento. Os dados não são os resultados da sua loja.</p><p><strong>Custos e financeiro neste HTML são somente leitura.</strong> Para salvar custos e testar o backend real, execute o servidor local do pacote. Publicação, convites e gastos externos estão bloqueados. Roteiros usam template local, sem LLM.</p><details><summary>Vídeos reais de teste e arquivos próprios</summary><div id="mlsOfflineVideos"></div></details><p id="mlsOfflineMessage" role="status" aria-live="polite"></p><p>Worker de referência: <code>${workerHash}</code>. Aprovação visual/auditiva humana pendente.</p></details>`;
 const style='<style>.mls-offline-help{padding:12px 20px;background:#fff4c8;color:#302800;font:13px/1.6 system-ui;border-bottom:2px solid #b7a449}.mls-offline-help summary{cursor:pointer;font-weight:750}.mls-offline-help p{color:inherit;max-width:1100px}.mls-offline-help code{overflow-wrap:anywhere}.mls-offline-help #mlsOfflineVideos{display:flex;gap:16px;flex-wrap:wrap}.mls-offline-help article{max-width:240px}.mls-offline-help video{width:180px;max-height:320px;background:#080e18}.mls-offline-help article a{display:block;color:#004b88;font-weight:700}.mls-offline-help article h3{color:#302800}.mls-offline-help [hidden]{display:none}</style>';
 const csp='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; media-src blob:; connect-src \'none\'; form-action \'none\'; base-uri \'none\'">';
 const output=html.replace('<head>','<head>'+csp+prelude).replace('</head>',style+'</head>').replace('<body>','<body>'+welcome).replace('<title>','<title>DEMONSTRAÇÃO · ');
 if(Buffer.byteLength(output)>24*1024*1024)fail('OFFLINE_EXPORT_TOO_LARGE');return output;
}

export async function exportOwnerPreview({output,mediaDirectory,workerPath}={}){
 if(typeof output!=='string'||!output.endsWith('.html'))fail('OFFLINE_EXPORT_OPTIONS_INVALID');
 const preview=await startPreviewServer({mediaDirectory,workerPath});
 try{
  const login=await fetch(preview.origin+'/__preview/login',{method:'POST',headers:{origin:preview.origin},redirect:'manual'});
  const cookie=login.headers.getSetCookie().find(v=>v.startsWith('braza_admin='))?.split(';')[0];if(login.status!==303||!cookie)fail('OFFLINE_LOGIN_FAILED');
  const get=route=>fetch(preview.origin+route,{headers:{cookie,'X-Braza-Client-Contract':'business-month-view-v4'}});
  const page=await get('/admin?tab=overview');if(page.status!==200)fail('OFFLINE_OWNER_HTML_UNAVAILABLE');
  const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
  const routes=['state','live','audit','production-costs','production-costs/audit','production-costs/confirmed-references','variant-bindings','order-observations','order-items','shop-orders','ads-today','cost-rules','cost-rules/assignments','production','production/settings','finance/sync-state','finance/sync-policy','catalog-classification?limit=1&offset=0','catalog-classification?limit=100&offset=0','product-registry?limit=100&offset=0&item_status=ACTIVE','product-registry?item_id=990001&variant_limit=100&variant_offset=0','product-registry?item_id=990002&variant_limit=100&variant_offset=0','product-registry?item_id=990003&variant_limit=100&variant_offset=0','finance/business-month-view?month='+month,'production-costs/periods?month='+month,'finance/checkpoints?month='+month+'&limit=10'];
  const snapshots=[];
  for(const route of routes){const response=await get('/api/admin/'+route),body=await response.json().catch(()=>({error:'OFFLINE_RESPONSE_UNAVAILABLE'}));snapshots.push({path:'/api/admin/'+route,status:response.status,body,contract:response.headers.get('x-braza-client-contract')});}
  const media=[];
  if(mediaDirectory){const response=await get('/__preview/media');if(response.status!==200)fail('OFFLINE_MEDIA_INDEX_UNAVAILABLE');const index=await response.json();
   for(const row of index.files.filter(v=>['video/mp4','image/png','application/json'].includes(v.mime))){const file=await get('/__preview/media/'+row.id);if(file.status!==200)fail('OFFLINE_MEDIA_UNAVAILABLE');const bytes=Buffer.from(await file.arrayBuffer());if(bytes.length!==row.size_bytes||digest(bytes)!==row.sha256)fail('OFFLINE_MEDIA_HASH_MISMATCH');const label=index.renders.find(v=>v.video_file_id===row.id)?.template_id;media.push({id:row.id,mime:row.mime,base64:bytes.toString('base64'),title:label?({NOSTALGIA_80_90_2000:'Nostalgia 80 / 90 / 2000',PRODUCT_DETAILS:'Detalhes do produto',COUPLE_KIT:'Kit casal'}[label]||row.id):row.id,file_name:path.basename(row.relative_path)});}
  }
  const html=createOfflinePreviewHtml({html:await page.text(),workerHash:preview.workerHash,snapshots,media});writeFileSync(path.resolve(output),html,{mode:0o600});
  return {schema:'mls_owner_offline_preview_v1',path:path.resolve(output),bytes:Buffer.byteLength(html),sha256:digest(html),worker_sha256:preview.workerHash,snapshots:snapshots.length,media_files:media.length,connected_to_merchant:false,commercial_writes:false};
 }finally{await preview.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const values={};for(let n=2;n<process.argv.length;n+=2){const key=process.argv[n],value=process.argv[n+1];if(!['--output','--media'].includes(key)||!value||values[key])fail('OFFLINE_ARGUMENT_INVALID');values[key]=value;}console.log(JSON.stringify(await exportOwnerPreview({output:values['--output'],mediaDirectory:values['--media']})));}catch(error){console.error(error?.code||'MLS_OFFLINE_EXPORT_FAILED');process.exitCode=1;}
}
