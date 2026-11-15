import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const roles=['app','auth','finance'];
const fail=code=>{throw Object.assign(Error(code),{code});};
function failTarget(code,env){
 const safe=value=>{
  if(!value)return 'ABSENT';
  if(typeof value!=='string'||!/^[a-z0-9][a-z0-9-]{0,62}$/.test(value))return 'REDACTED_OR_INVALID';
  if(Object.entries(env).some(([key,secret])=>/(?:TOKEN|SECRET|PASSWORD|KEY)/i.test(key)&&secret===value))return 'REDACTED_OR_INVALID';
  return value;
 };
 throw Object.assign(Error(code+'; ci_match_tag='+safe(env.WRANGLER_CI_MATCH_TAG)+'; ci_override_name='+safe(env.WRANGLER_CI_OVERRIDE_NAME)),{code});
}
export function validateIsolation(m){
 if(m?.schema!=='mls_p00_preview_isolation_v1'||m.branch!=='feature/saas-p00-baseline-20261114'||!/^[a-f0-9]{32}$/.test(m.account_id||'')||!/^[a-z0-9-]+$/.test(m.account_subdomain||''))fail('PREVIEW_MANIFEST_INVALID');
 const ids=['admin','account','finance'].map(k=>m.databases?.[k]?.id);
 if(new Set(ids).size!==3||ids.some(id=>!/^[a-f0-9-]{36}$/.test(id||'')||m.production_database_ids.includes(id)))fail('PREVIEW_DATABASE_NOT_ISOLATED');
 for(const r of roles)if(m.parents?.[r]?.name!=='brazacommerce-'+r||!/^[a-f0-9]{32}$/.test(m.parents[r].tag)||m.isolated_workers?.[r]!=='brazacommerce-'+r+'-p00-isolated')fail('PREVIEW_TARGET_INVALID');
 return m;
}
function requestedRole(m,env){
 const tagRole=roles.find(r=>m.parents[r].tag===env.WRANGLER_CI_MATCH_TAG);
 const nameRole=roles.find(r=>[m.parents[r].name,m.parents[r].tag].includes(env.WRANGLER_CI_OVERRIDE_NAME));
 if(env.WRANGLER_CI_OVERRIDE_NAME&&!nameRole)failTarget('PREVIEW_CI_TARGET_MISMATCH_NAME',env);
 if(tagRole&&nameRole&&tagRole!==nameRole)failTarget('PREVIEW_CI_TARGET_CONFLICT',env);
 const role=nameRole||tagRole;
 if(!role)failTarget('PREVIEW_CI_TARGET_MISMATCH_TAG',env);
 return {role,tagRole};
}
export function selectPreviewRole(m,env,{verifiedWorker}={}){
 validateIsolation(m);
 if(!env.WRANGLER_CI_MATCH_TAG)return null;
 if(env.WORKERS_CI_BRANCH==='main')return null;
 if(env.WORKERS_CI_BRANCH!==m.branch)fail('PREVIEW_BRANCH_NOT_AUTHORIZED');
 const {role,tagRole}=requestedRole(m,env);
 if(verifiedWorker){
  if(verifiedWorker.account_id!==m.account_id||verifiedWorker.id!==m.parents[role].tag||verifiedWorker.name!==m.parents[role].name)fail('PREVIEW_API_IDENTITY_MISMATCH');
 }else if(!tagRole)failTarget('PREVIEW_CI_TARGET_MISMATCH_TAG',env);
 return role;
}

// GET only. Python is already required by the builder and respects the managed
// environment's HTTPS proxy without adding dependencies. Credentials stay in
// the child environment and Authorization header, never arguments or output.
function lookupWorkerIdentity(accountId,workerName,env){
 if(!env.CLOUDFLARE_API_TOKEN)fail('PREVIEW_IDENTITY_TOKEN_MISSING');
 const script=`import os,json,urllib.request,urllib.error\ntry:\n r=urllib.request.urlopen(urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/'+os.environ['MLS_PREVIEW_LOOKUP_ACCOUNT']+'/workers/workers/'+os.environ['MLS_PREVIEW_LOOKUP_NAME'],headers={'Authorization':'Bearer '+os.environ['CLOUDFLARE_API_TOKEN']}),timeout=15)\n d=json.load(r)['result']\n print(json.dumps({'id':d.get('id'),'name':d.get('name')}))\nexcept urllib.error.HTTPError as e: print(json.dumps({'http_error':e.code}))\nexcept Exception: print(json.dumps({'lookup_unavailable':True}))\n`;
 let result;
 try{result=JSON.parse(execFileSync('python3',['-c',script],{env:{...env,MLS_PREVIEW_LOOKUP_ACCOUNT:accountId,MLS_PREVIEW_LOOKUP_NAME:workerName},stdio:['ignore','pipe','pipe'],encoding:'utf8',timeout:20000}));}
 catch{fail('PREVIEW_IDENTITY_LOOKUP_UNAVAILABLE');}
 if(result.http_error)fail('PREVIEW_IDENTITY_LOOKUP_HTTP_'+result.http_error);
 if(result.lookup_unavailable)fail('PREVIEW_IDENTITY_LOOKUP_UNAVAILABLE');
 return result;
}
export function verifyBuildPreviewIdentity(root,env=process.env,{lookup=lookupWorkerIdentity}={}){
 const m=validateIsolation(JSON.parse(fs.readFileSync(path.join(root,'previews/p00-isolation.json'),'utf8')));
 if(!env.WRANGLER_CI_MATCH_TAG||env.WORKERS_CI_BRANCH==='main')return null;
 if(env.WORKERS_CI_BRANCH!==m.branch)fail('PREVIEW_BRANCH_NOT_AUTHORIZED');
 if(env.CLOUDFLARE_ACCOUNT_ID&&env.CLOUDFLARE_ACCOUNT_ID!==m.account_id)fail('PREVIEW_ACCOUNT_MISMATCH');
 const {role}=requestedRole(m,env);
 const actual=lookup(m.account_id,m.parents[role].name,env);
 const verifiedWorker={account_id:m.account_id,id:actual.id,name:actual.name};
 selectPreviewRole(m,env,{verifiedWorker});
 return verifiedWorker;
}
export function isolatedHosts(m){return Object.fromEntries(roles.map(r=>[r,m.isolated_workers[r]+'.'+m.account_subdomain+'.workers.dev']));}
export function previewBindings(m,role){
 validateIsolation(m);if(!roles.includes(role))fail('PREVIEW_TARGET_INVALID');
 return {vars:{MLS_ENVIRONMENT:'P00_ISOLATED_PREVIEW',FINANCE_CONNECTION_ENABLED:'false',ADMIN_USERNAME:'p00-preview-owner',REVIEW_USERNAME:'p00-preview-review',MLS_V36_OWNER_PREVIEW:'ENABLED',MLS_AI_SALES_OWNER_PREVIEW:'ENABLED'},
  d1_databases:[{binding:'ACCOUNT_DB',database_id:m.databases.account.id},...(role==='app'?[{binding:'ADMIN_DB',database_id:m.databases.admin.id}]:role==='finance'?[{binding:'FINANCE_DB',database_id:m.databases.finance.id}]:[])],
  ...(role==='auth'?{services:[{binding:'SHOPEE_FINANCE_SERVICE',service:m.isolated_workers.finance}]}:{})};
}
export function makePreviewSource(source,role,m){
 const hosts=isolatedHosts(validateIsolation(m));let body=source;
 for(const r of roles)body=body.replaceAll('https://'+r+'.brazacommerce.com.br','https://'+hosts[r]).replaceAll(r+'.brazacommerce.com.br',hosts[r]);
 if(role==='finance'){
  if((body.match(/commercial_finance_worker_default as default,/g)||[]).length!==1)fail('PREVIEW_EXPORT_UNRECOGNIZED');
  body=body.replace('commercial_finance_worker_default as default,','');body+='\nconst MLS_ISOLATED_ORIGINAL= commercial_finance_worker_default;\n';
 }else{
  if((body.match(/export default /g)||[]).length!==1)fail('PREVIEW_EXPORT_UNRECOGNIZED');
  body=body.replace('export default ','const MLS_ISOLATED_ORIGINAL= ');
 }
 const allowed=Object.values(hosts);
 const prefix=`// P00 derivative only: no production artifact is changed.\nconst MLS_PREVIEW_HOSTS=${JSON.stringify(allowed)};\nconst MLS_PREVIEW_REAL_FETCH=globalThis.fetch.bind(globalThis);\nglobalThis.fetch=async(input,init)=>{let url;try{url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);}catch{return new Response('PREVIEW_OUTBOUND_BLOCKED',{status:403});}if(url.protocol!=='https:'||!MLS_PREVIEW_HOSTS.includes(url.hostname))return new Response('PREVIEW_OUTBOUND_BLOCKED',{status:403});return MLS_PREVIEW_REAL_FETCH(new Request(input,{...init,redirect:'manual'}));};\n`;
 const browserGuard=`(()=>{const hosts=${JSON.stringify(hosts)},allowed=${JSON.stringify(allowed)};const safe=u=>{try{const x=new URL(u,location.href);return x.origin===location.origin||(x.protocol==='https:'&&allowed.includes(x.hostname));}catch{return false;}};const rewrite=()=>{for(const a of document.querySelectorAll('a[href]')){for(const [role,host]of Object.entries(hosts))if(a.href.startsWith('https://'+role+'.brazacommerce.com.br/'))a.href=a.href.replace(role+'.brazacommerce.com.br',host);}};new MutationObserver(rewrite).observe(document.documentElement,{childList:true,subtree:true});addEventListener('click',e=>{const a=e.target.closest?.('a[href]');if(a&&!safe(a.href)){e.preventDefault();e.stopImmediatePropagation();}},true);const f=window.fetch.bind(window);window.fetch=(u,o)=>safe(typeof u==='string'?u:u.url)?f(u,o):Promise.reject(Error('PREVIEW_OUTBOUND_BLOCKED'));const open=window.open.bind(window);window.open=(u,...a)=>safe(u)?open(u,...a):null;rewrite();})();`;
 const suffix=`\nexport default {async fetch(request,env,ctx){const url=new URL(request.url);if(/\\/shopee\\/.*(?:connect|callback|oauth)/i.test(url.pathname))return new Response('PREVIEW_PROVIDER_CONNECTION_DISABLED',{status:403});const result=await MLS_ISOLATED_ORIGINAL.fetch(request,env,ctx);const headers=new Headers(result.headers);headers.set('x-mls-environment','p00-isolated');headers.set('x-robots-tag','noindex, nofollow');headers.set('cache-control','no-store');const location=headers.get('location');if(location){const target=new URL(location,url);if(target.origin!==url.origin&&!MLS_PREVIEW_HOSTS.includes(target.hostname))return new Response('PREVIEW_REDIRECT_BLOCKED',{status:403,headers:{'x-mls-environment':'p00-isolated'}});} headers.set('content-security-policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${allowed.map(h=>'https://'+h).join(' ')}; form-action 'self' ${allowed.map(h=>'https://'+h).join(' ')}; frame-src 'none'; object-src 'none'");if((headers.get('content-type')||'').includes('text/html')){const html=await result.text();return new Response(html.replace('<head>','<head><script>'+${JSON.stringify(browserGuard)}+'</script>').replace('<body>','<body><aside style="background:#542600;color:white;padding:8px;font:14px sans-serif">P00 · PRÉVIA ISOLADA · SOMENTE DADOS SINTÉTICOS · SEM CONEXÃO COM A LOJA REAL</aside>'),{status:result.status,headers});}return new Response(result.body,{status:result.status,headers});}};\n`;
 return prefix+body+suffix;
}
export function prepareIsolatedPreview(root,role,{parent=false}={}){
 const m=validateIsolation(JSON.parse(fs.readFileSync(path.join(root,'previews/p00-isolation.json'),'utf8')));
 if(!roles.includes(role))fail('PREVIEW_TARGET_INVALID');
 const dir=path.join(root,'dist','p00-preview');fs.mkdirSync(dir,{recursive:true});
 const original=fs.readFileSync(path.join(root,'dist',role+'-worker.mjs'),'utf8');
 const source=makePreviewSource(original,role,m);fs.writeFileSync(path.join(dir,role+'-worker.mjs'),source);
 const bindings=previewBindings(m,role);
 // These are complete generated modules. Rebundling adds esbuild helpers inside
 // functions serialized into browser scripts and breaks the frozen client code.
 const config={account_id:m.account_id,name:parent?m.isolated_workers[role]:m.parents[role].name,main:'./'+role+'-worker.mjs',no_bundle:true,compatibility_date:JSON.parse(fs.readFileSync(path.join(root,'workers',role,'wrangler.json'))).compatibility_date,
 workers_dev:parent,preview_urls:false,...(parent?bindings:{}),previews:bindings,...(role==='app'?{assets:{directory:'../browser-assets',binding:'ASSETS',run_worker_first:true,html_handling:'none',not_found_handling:'none'}}:{})};
 // Both environments contain only the approved isolated resource set. No routes, cron, source vars or secret values are copied.
 const configPath=path.join(dir,role+(parent?'-isolated':'-native')+'.json');fs.writeFileSync(configPath,JSON.stringify(config,null,2)+'\n');
 return {role,configPath,source_sha256:createHash('sha256').update(source).digest('hex'),source_bytes:Buffer.byteLength(source),parent};
}
export function prepareBuildPreview(root,env=process.env,{verifiedWorker}={}){
 const m=JSON.parse(fs.readFileSync(path.join(root,'previews/p00-isolation.json'),'utf8'));const role=selectPreviewRole(m,env,{verifiedWorker});
 const redirect=path.join(root,'.wrangler','deploy','config.json');
 if(!role){
  // A reused build directory must not redirect a later production build.
  // Remove only redirects produced by this helper, never another framework's config.
  if(fs.existsSync(redirect)){
   const prior=JSON.parse(fs.readFileSync(redirect,'utf8'));
   if(prior.mlsP00IsolatedPreview===true)fs.rmSync(redirect);
  }
  return null;
 }
 const result=prepareIsolatedPreview(root,role);const dir=path.join(root,'.wrangler','deploy');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(redirect,JSON.stringify({configPath:path.relative(dir,result.configPath),mlsP00IsolatedPreview:true})+'\n');
 return result;
}
