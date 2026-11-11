import {createHash} from 'node:crypto';
import {existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

export const BROWSER_ASSET_SCHEMA='mls_browser_assets_v1';
const specs=Object.freeze({bank:'BANK_RECONCILIATION_CLIENT',month:'BUSINESS_MONTH_CLIENT',orders:'ORDER_OPERATIONS_CLIENT',production:'PRODUCTION_BROWSER_CLIENT',weekly:'WEEKLY_OPERATING_CLIENT'});
const prefix='export const MLS_BROWSER_ASSET_MANIFEST=Object.freeze(';
const suffix=');\n';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=code=>{const error=new Error(code);error.code=code;throw error;};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const utf8=bytes=>{try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('BROWSER_ASSET_UTF8_INVALID');}};
const publicRoot=root=>path.join(root,'dist','browser-assets');
const manifestFile=root=>path.join(root,'web','cloudflare','src','browser-assets-manifest.mjs');
const inventoryFile=root=>path.join(root,'dist','browser-assets-manifest.json');
const publicationFile=root=>path.join(root,'workers','app','browser-assets-published.json');
const publicationRoot=root=>path.join(root,'web','cloudflare','browser-assets-published');
const publishedFilename=(root,row)=>path.join(publicationRoot(root),row.sha256+'.js');
export const EMPTY_BROWSER_ASSET_PUBLICATION=Object.freeze({schema:'mls_browser_assets_published_v1',publication:null,assets:[],retained:[]});

export function validateBrowserAssetManifest(value){
 if(!exact(value,['schema','assets','retained'])||value.schema!==BROWSER_ASSET_SCHEMA||!Array.isArray(value.assets)||value.assets.length<1||value.assets.length>5||!Array.isArray(value.retained)||value.retained.length>5)fail('BROWSER_ASSET_MANIFEST_INVALID');
 const ids=new Set(),paths=new Set();let total=0;
 for(const rows of [value.assets,value.retained]){
  const local=new Set();
  for(const row of rows){
   if(!exact(row,['id','path','sha256','integrity','bytes'])||!Object.hasOwn(specs,row.id)||local.has(row.id)||paths.has(row.path)||!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>(row.id==='month'?1048576:262144)||!/^[a-f0-9]{64}$/.test(row.sha256)||row.path!=='/assets/mls/'+row.sha256+'.js'||row.integrity!=='sha256-'+Buffer.from(row.sha256,'hex').toString('base64'))fail('BROWSER_ASSET_MANIFEST_INVALID');
   local.add(row.id);paths.add(row.path);total+=row.bytes;
  }
  if(rows.map(row=>row.id).join(',')!==[...local].sort().join(','))fail('BROWSER_ASSET_MANIFEST_INVALID');
 }
 for(const row of value.assets)ids.add(row.id);
 if(!ids.has('bank')||total>3145728)fail('BROWSER_ASSET_MANIFEST_INVALID');
 return value;
}

function readPublishedBrowserAssets(root){
 let ledger;try{ledger=JSON.parse(readFileSync(publicationFile(root),'utf8'));}catch{fail('BROWSER_ASSET_PUBLICATION_LEDGER_MISSING');}
 if(!exact(ledger,['schema','publication','assets','retained'])||ledger.schema!=='mls_browser_assets_published_v1'||!Array.isArray(ledger.assets)||!Array.isArray(ledger.retained))fail('BROWSER_ASSET_PUBLICATION_LEDGER_INVALID');
 if(ledger.publication===null){if(ledger.assets.length||ledger.retained.length)fail('BROWSER_ASSET_PUBLICATION_LEDGER_INVALID');}
 else{
  const p=ledger.publication;
  if(!exact(p,['worker_version','source_sha256','verified_at'])||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(p.worker_version)||!/^[a-f0-9]{64}$/.test(p.source_sha256)||typeof p.verified_at!=='string'||p.verified_at.length>40||!p.verified_at.endsWith('Z')||!Number.isFinite(Date.parse(p.verified_at)))fail('BROWSER_ASSET_PUBLICATION_LEDGER_INVALID');
  validateBrowserAssetManifest({schema:BROWSER_ASSET_SCHEMA,assets:ledger.assets,retained:ledger.retained});
 }
 const expected=[...ledger.assets,...ledger.retained].map(row=>row.sha256+'.js').sort(),directory=publicationRoot(root);
 if(existsSync(directory)){
  const stat=lstatSync(directory);if(!stat.isDirectory()||stat.isSymbolicLink())fail('BROWSER_ASSET_PATH_INVALID');
  const entries=readdirSync(directory).sort();if(JSON.stringify(entries)!==JSON.stringify(expected))fail('BROWSER_ASSET_PUBLICATION_INVENTORY_MISMATCH');
  for(const row of [...ledger.assets,...ledger.retained]){const file=publishedFilename(root,row),stat=lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())fail('BROWSER_ASSET_PATH_INVALID');const bytes=readFileSync(file);if(bytes.length!==row.bytes||hash(bytes)!==row.sha256)fail('BROWSER_ASSET_PUBLICATION_BYTES_MISMATCH');}
 }else if(expected.length)fail('BROWSER_ASSET_PUBLICATION_BYTES_MISSING');
 return ledger;
}

export function readBrowserAssetManifest(root){
 let text;try{text=readFileSync(manifestFile(root),'utf8');}catch{fail('BROWSER_ASSET_MANIFEST_MISSING');}
 if(!text.startsWith(prefix)||!text.endsWith(suffix))fail('BROWSER_ASSET_MANIFEST_INVALID');
 let value;try{value=JSON.parse(text.slice(prefix.length,-suffix.length));}catch{fail('BROWSER_ASSET_MANIFEST_INVALID');}
 return validateBrowserAssetManifest(value);
}

function actualFiles(directory){
 const files=[];
 function visit(current){
  if(!existsSync(current))return;
  const stat=lstatSync(current);if(stat.isSymbolicLink()||!stat.isDirectory())fail('BROWSER_ASSET_PATH_INVALID');
  for(const entry of readdirSync(current,{withFileTypes:true})){
   const file=path.join(current,entry.name),info=lstatSync(file);
   if(info.isSymbolicLink())fail('BROWSER_ASSET_PATH_INVALID');
   if(info.isDirectory()){
    const relative=path.relative(directory,file).split(path.sep).join('/');
    if(!['assets','assets/mls'].includes(relative))fail('BROWSER_ASSET_INVENTORY_MISMATCH');
    visit(file);
   }else if(info.isFile())files.push('/'+path.relative(directory,file).split(path.sep).join('/'));
   else fail('BROWSER_ASSET_PATH_INVALID');
  }
 }
 visit(directory);return files.sort();
}

export function verifyBrowserAssets(root){
 const manifest=readBrowserAssetManifest(root);let inventory;
 try{inventory=JSON.parse(readFileSync(inventoryFile(root),'utf8'));}catch{fail('BROWSER_ASSET_INVENTORY_MISSING');}
 validateBrowserAssetManifest(inventory);
 if(JSON.stringify(inventory)!==JSON.stringify(manifest))fail('BROWSER_ASSET_INVENTORY_MISMATCH');
 const directory=publicRoot(root),files=actualFiles(directory),rows=[...manifest.assets,...manifest.retained],expected=rows.map(row=>row.path).sort();
 if(JSON.stringify(files)!==JSON.stringify(expected))fail('BROWSER_ASSET_INVENTORY_MISMATCH');
 for(const row of rows){
  const bytes=readFileSync(path.join(directory,...row.path.slice(1).split('/')));
  if(bytes.length!==row.bytes||hash(bytes)!==row.sha256)fail('BROWSER_ASSET_BYTES_MISMATCH');
  const source=utf8(bytes);if(!source.trim()||/<\/script\b/i.test(source))fail('BROWSER_ASSET_SOURCE_INVALID');
  try{new vm.Script(source,{filename:row.id+'.js'});}catch{fail('BROWSER_ASSET_SOURCE_INVALID');}
 }
 return manifest;
}

/** Offline development adapter; it cannot read a path outside the inventory. */
export function createLocalBrowserAssets(root){
 const manifest=verifyBrowserAssets(root),files=new Map([...manifest.assets,...manifest.retained].map(row=>[row.path,readFileSync(path.join(publicRoot(root),...row.path.slice(1).split('/')))]));
 return Object.freeze({manifest,async fetch(request){
  const url=new URL(request.url),bytes=files.get(url.pathname);
  if(!bytes||url.search)return new Response(null,{status:404});
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{allow:'GET, HEAD'}});
  return new Response(request.method==='HEAD'?null:bytes,{headers:{'content-type':'text/javascript; charset=utf-8','content-length':String(bytes.length)}});
 }});
}

/** Resolve generated script tags for offline exports and isolated VM checks. */
export function orderedBrowserScripts(html,{root}={}){
 if(typeof html!=='string')fail('BROWSER_ASSET_HTML_INVALID');
 let binding;const result=[];
 for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  const attrs=match[1],src=/\bsrc="([^"]+)"/.exec(attrs);
  if(!src&&/\bsrc\s*=/i.test(attrs))fail('BROWSER_ASSET_HTML_INVALID');
  if(!src){result.push(match[2]);continue;}
  binding??=createLocalBrowserAssets(root);
  const row=[...binding.manifest.assets,...binding.manifest.retained].find(row=>row.path===src[1]);
  if(!row||match[0]!=='<script src="'+row.path+'" integrity="'+row.integrity+'" crossorigin="anonymous"></script>')fail('BROWSER_ASSET_HTML_INVALID');
  result.push(readFileSync(path.join(publicRoot(root),...row.path.slice(1).split('/')),'utf8'));
 }
 return result;
}

export function inlineBrowserAssets(html,{root}={}){
 const scripts=orderedBrowserScripts(html,{root});let index=0;
 return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,match=>{
  const source=scripts[index++];return /\bsrc=/.test(match)?'<script>'+source+'</script>':match;
 });
}

export function buildBrowserAssets(request,{root}={}){
 if(typeof root!=='string'||!path.isAbsolute(root)||!exact(request,['schema','entries'])||request.schema!=='mls_browser_assets_build_v1'||!Array.isArray(request.entries)||request.entries.length<1||request.entries.length>5)fail('BROWSER_ASSET_BUILD_INVALID');
 const ids=new Set(),outputs=[];
 for(const row of request.entries){
  if(!exact(row,['id','source','export_name'])||!Object.hasOwn(specs,row.id)||row.export_name!==specs[row.id]||ids.has(row.id)||typeof row.source!=='string'||Buffer.byteLength(row.source)>(row.id==='month'?2097152:1048576))fail('BROWSER_ASSET_BUILD_INVALID');
  ids.add(row.id);let source;
  try{
   const context=vm.createContext(Object.create(null),{codeGeneration:{strings:false,wasm:false}});
   source=new vm.Script('"use strict";\n'+row.source+'\n'+row.export_name).runInContext(context,{timeout:1000});
  }catch{fail('BROWSER_ASSET_BUILD_SOURCE_INVALID_'+row.id.toUpperCase());}
  if(typeof source!=='string'||!source.trim()||/<\/script\b/i.test(source))fail('BROWSER_ASSET_BUILD_SOURCE_INVALID_'+row.id.toUpperCase());
  // adminPage already applied these exact escapes to every inline client.
  // Preserve that emitted representation when moving code out of the HTML,
  // including safe self-contained offline exports of the same public bytes.
  source=source.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,character=>'\\u'+character.charCodeAt(0).toString(16).padStart(4,'0'));
  try{new vm.Script(source,{filename:row.id+'.js'});}catch{fail('BROWSER_ASSET_SOURCE_INVALID');}
  const bytes=Buffer.from(source),sha256=hash(bytes);
  outputs.push({row:{id:row.id,path:'/assets/mls/'+sha256+'.js',sha256,integrity:'sha256-'+Buffer.from(sha256,'hex').toString('base64'),bytes:bytes.length},bytes});
 }
 outputs.sort((a,b)=>a.row.id.localeCompare(b.row.id));
 const publication=readPublishedBrowserAssets(root),assets=outputs.map(row=>row.row),currentPaths=new Set(assets.map(row=>row.path));
 const retained=(JSON.stringify(assets)===JSON.stringify(publication.assets)?publication.retained:publication.assets).filter(row=>!currentPaths.has(row.path));
 const manifest=validateBrowserAssetManifest({schema:BROWSER_ASSET_SCHEMA,assets,retained}),directory=publicRoot(root);
 // Only replace files owned by a previous successful build. An unexpected file
 // or symlink is a hard failure instead of silently exposing or deleting it.
 const files=actualFiles(directory);
 if(files.length){
  let previous;try{previous=JSON.parse(readFileSync(inventoryFile(root),'utf8'));}catch{fail('BROWSER_ASSET_INVENTORY_MISSING');}
  validateBrowserAssetManifest(previous);
  if(JSON.stringify(files)!==JSON.stringify([...previous.assets,...previous.retained].map(row=>row.path).sort()))fail('BROWSER_ASSET_INVENTORY_MISMATCH');
  for(const file of files)unlinkSync(path.join(directory,...file.slice(1).split('/')));
 }
 mkdirSync(path.join(directory,'assets','mls'),{recursive:true});
 for(const output of outputs)writeFileSync(path.join(directory,...output.row.path.slice(1).split('/')),output.bytes);
 for(const row of retained)writeFileSync(path.join(directory,...row.path.slice(1).split('/')),readFileSync(publishedFilename(root,row)));
 mkdirSync(path.dirname(manifestFile(root)),{recursive:true});
 writeFileSync(manifestFile(root),prefix+JSON.stringify(manifest,null,2)+suffix);
 writeFileSync(inventoryFile(root),JSON.stringify(manifest,null,2)+'\n');
 verifyBrowserAssets(root);return manifest;
}

/** Call only after independently verifying the deployed Worker and every asset. */
export function recordBrowserAssetPublication(root,publication){
 const manifest=verifyBrowserAssets(root),previous=readPublishedBrowserAssets(root),ledger={schema:'mls_browser_assets_published_v1',publication,assets:manifest.assets,retained:manifest.retained};
 // Validate metadata through the same closed schema before writing any bytes.
 const p=publication;if(!exact(p,['worker_version','source_sha256','verified_at'])||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(p.worker_version)||!/^[a-f0-9]{64}$/.test(p.source_sha256)||typeof p.verified_at!=='string'||p.verified_at.length>40||!p.verified_at.endsWith('Z')||!Number.isFinite(Date.parse(p.verified_at)))fail('BROWSER_ASSET_PUBLICATION_LEDGER_INVALID');
 const rows=[...manifest.assets,...manifest.retained],keep=new Set(rows.map(row=>row.path));mkdirSync(publicationRoot(root),{recursive:true});
 for(const row of rows)writeFileSync(publishedFilename(root,row),readFileSync(path.join(publicRoot(root),...row.path.slice(1).split('/'))));
 for(const row of [...previous.assets,...previous.retained])if(!keep.has(row.path))unlinkSync(publishedFilename(root,row));
 const temporary=publicationFile(root)+'.next-'+process.pid;writeFileSync(temporary,JSON.stringify(ledger,null,2)+'\n');renameSync(temporary,publicationFile(root));
 readPublishedBrowserAssets(root);return ledger;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==3)fail('BROWSER_ASSET_BUILD_INVALID');process.stdout.write(JSON.stringify(buildBrowserAssets(JSON.parse(readFileSync(0,'utf8')),{root:path.resolve(process.argv[2])})));}
 catch(error){process.stderr.write((error?.code||'BROWSER_ASSET_BUILD_FAILED')+'\n');process.exitCode=1;}
}
