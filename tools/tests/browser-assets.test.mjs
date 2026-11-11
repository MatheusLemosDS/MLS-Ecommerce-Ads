import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildBrowserAssets,verifyBrowserAssets,validateBrowserAssetManifest,createLocalBrowserAssets,recordBrowserAssetPublication,EMPTY_BROWSER_ASSET_PUBLICATION,orderedBrowserScripts,inlineBrowserAssets} from '../browser_assets.mjs';
import {MAX_WORKER_SOURCE_BYTES} from '../import_worker_config.mjs';

const names={bank:'BANK_RECONCILIATION_CLIENT',month:'BUSINESS_MONTH_CLIENT',orders:'ORDER_OPERATIONS_CLIENT'};
const source=(id,client)=>({id,export_name:names[id],source:'const '+names[id]+'='+JSON.stringify(client)+';'});
const request=(bank='globalThis.fixtureBank="a";\n',extras=[])=>({schema:'mls_browser_assets_build_v1',entries:[source('bank',bank),...extras]});
function fixture(t){const root=mkdtempSync(path.join(tmpdir(),'mls-browser-assets-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(path.join(root,'workers','app'),{recursive:true});writeFileSync(path.join(root,'workers','app','browser-assets-published.json'),JSON.stringify(EMPTY_BROWSER_ASSET_PUBLICATION));return root;}
const filename=(root,row)=>path.join(root,'dist','browser-assets',...row.path.slice(1).split('/'));

test('public asset inventory is deterministic, hash-addressed and contains only the exact emitted browser bytes',t=>{
 const root=fixture(t),month='/* legacy spacing and non-ASCII remain exact */\n(()=>{ const x = /[á-ú]/; globalThis.fixtureMonth = `${x}`; })();\n',input=request(undefined,[source('month',month),source('orders','globalThis.fixtureOrders=true;\n')]);
 const manifest=buildBrowserAssets(input,{root});assert.deepEqual(manifest.assets.map(row=>row.id),['bank','month','orders']);
 for(const row of manifest.assets){const bytes=readFileSync(filename(root,row));assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);assert.equal(bytes.length,row.bytes);}
 assert.equal(readFileSync(filename(root,manifest.assets.find(row=>row.id==='month')),'utf8'),month,'moving the legacy monthly client must not transform a single byte');
 assert.deepEqual(buildBrowserAssets(input,{root}),manifest);assert.deepEqual(verifyBrowserAssets(root),manifest);assert.equal(MAX_WORKER_SOURCE_BYTES,4*1024*1024);
});

test('rebuilding replaces only the inventory owned by the previous build',t=>{
 const root=fixture(t),before=buildBrowserAssets(request(),{root}),after=buildBrowserAssets(request('globalThis.fixtureBank="b";\n'),{root});
 assert.notEqual(before.assets[0].path,after.assets[0].path);assert.throws(()=>readFileSync(filename(root,before.assets[0])),{code:'ENOENT'});assert.deepEqual(verifyBrowserAssets(root),after);
 const unexpected=path.join(root,'dist','browser-assets','private.json');writeFileSync(unexpected,'private fixture must never be published');
 assert.throws(()=>buildBrowserAssets(request(),{root}),{code:'BROWSER_ASSET_INVENTORY_MISMATCH'});assert.match(readFileSync(unexpected,'utf8'),/never be published/);
});

test('missing, corrupt, extra and symlinked asset bytes fail closed',t=>{
 for(const mode of ['missing','corrupt','extra','symlink']){
  const root=fixture(t),manifest=buildBrowserAssets(request(),{root}),file=filename(root,manifest.assets[0]);
  if(mode==='missing')rmSync(file);
  if(mode==='corrupt')writeFileSync(file,'globalThis.fixtureBank="different";');
  if(mode==='extra')writeFileSync(path.join(root,'dist','browser-assets','fixture.csv'),'not browser code');
  if(mode==='symlink'){rmSync(file);symlinkSync(path.join(root,'dist','browser-assets-manifest.json'),file);}
  assert.throws(()=>verifyBrowserAssets(root),{code:mode==='corrupt'?'BROWSER_ASSET_BYTES_MISMATCH':mode==='symlink'?'BROWSER_ASSET_PATH_INVALID':'BROWSER_ASSET_INVENTORY_MISMATCH'});
 }
});

test('manifest rejects path escapes, alternate SRI, unknown ids and oversized clients',t=>{
 const root=fixture(t),manifest=buildBrowserAssets(request(),{root});
 for(const change of [row=>{row.path='/private.json';},row=>{row.integrity='sha256-'+'a'.repeat(43)+'=';},row=>{row.id='private';},row=>{row.bytes=262145;},row=>{row.extra=true;}]){const copy=structuredClone(manifest);change(copy.assets[0]);assert.throws(()=>validateBrowserAssetManifest(copy),{code:'BROWSER_ASSET_MANIFEST_INVALID'});}
 assert.throws(()=>buildBrowserAssets(request('x'.repeat(262145)),{root}),{code:'BROWSER_ASSET_MANIFEST_INVALID'});
 assert.throws(()=>buildBrowserAssets({schema:'mls_browser_assets_build_v1',entries:[source('bank','const broken = ;')]},{root}),{code:'BROWSER_ASSET_SOURCE_INVALID'});
});

test('asset manifest and source manifest must belong to the same build',t=>{
 const root=fixture(t),manifest=buildBrowserAssets(request(),{root}),altered=structuredClone(manifest);altered.assets[0].bytes++;
 writeFileSync(path.join(root,'dist','browser-assets-manifest.json'),JSON.stringify(altered));
 assert.throws(()=>verifyBrowserAssets(root),{code:'BROWSER_ASSET_INVENTORY_MISMATCH'});
});

test('offline ASSETS adapter exposes only verified public paths and never a local filesystem path',async t=>{
 const root=fixture(t),manifest=buildBrowserAssets(request(),{root}),binding=createLocalBrowserAssets(root),row=manifest.assets[0];
 const get=await binding.fetch(new Request('https://local.fixture'+row.path));assert.equal(get.status,200);assert.equal(await get.text(),'globalThis.fixtureBank="a";\n');
 const head=await binding.fetch(new Request('https://local.fixture'+row.path,{method:'HEAD'}));assert.equal(head.status,200);assert.equal(await head.text(),'');
 for(const route of ['/../../private.json','/assets/mls/unknown.js',row.path+'?file=/etc/passwd'])assert.equal((await binding.fetch(new Request('https://local.fixture'+route))).status,404);
 assert.equal((await binding.fetch(new Request('https://local.fixture'+row.path,{method:'POST'}))).status,405);
});

test('VM and offline exports preserve public script order and reject unsigned or unknown external tags',t=>{
 const root=fixture(t),manifest=buildBrowserAssets(request(),{root}),row=manifest.assets[0],tag='<script src="'+row.path+'" integrity="'+row.integrity+'" crossorigin="anonymous"></script>',html='<script>globalThis.first=true;</script>'+tag+'<script>globalThis.last=true;</script>';
 assert.deepEqual(orderedBrowserScripts(html,{root}),['globalThis.first=true;','globalThis.fixtureBank="a";\n','globalThis.last=true;']);
 const offline=inlineBrowserAssets(html,{root});assert.doesNotMatch(offline,/\bsrc=/);assert.deepEqual(orderedBrowserScripts(offline,{root}),orderedBrowserScripts(html,{root}));
 for(const changed of [tag.replace(row.integrity,'sha256-'+'a'.repeat(43)+'='),tag.replace(row.path,'/private.js'),"<script src='/private.js'></script>"])assert.throws(()=>orderedBrowserScripts(changed,{root}),{code:'BROWSER_ASSET_HTML_INVALID'});
});

test('only the last approved publication is retained; developer attempts never accumulate as public code',async t=>{
 const root=fixture(t),metadata=ordinal=>({worker_version:'11111111-1111-4111-8111-'+String(ordinal).padStart(12,'0'),source_sha256:String(ordinal).repeat(64),verified_at:'2026-11-11T15:00:00.000Z'});
 const firstInput=request('globalThis.fixtureBank="published-v1";'),first=buildBrowserAssets(firstInput,{root});assert.deepEqual(first.retained,[]);
 recordBrowserAssetPublication(root,metadata(1));assert.deepEqual(buildBrowserAssets(firstInput,{root}),first,'recording verified publication does not change its own build manifest or Worker input');
 const secondInput=request('globalThis.fixtureBank="published-v2";'),second=buildBrowserAssets(secondInput,{root});assert.deepEqual(second.retained,first.assets);
 const developerAttempt=buildBrowserAssets(request('globalThis.fixtureBank="not-published";'),{root});assert.deepEqual(developerAttempt.retained,first.assets);assert.ok(!developerAttempt.retained.some(row=>row.path===second.assets[0].path));
 buildBrowserAssets(secondInput,{root});recordBrowserAssetPublication(root,metadata(2));assert.deepEqual(buildBrowserAssets(secondInput,{root}),second,'retained predecessor bytes are stable after publication metadata is recorded');
 const served=await createLocalBrowserAssets(root).fetch(new Request('https://fixture.local'+first.assets[0].path));assert.equal(await served.text(),'globalThis.fixtureBank="published-v1";','in-flight previous HTML still resolves the previous published hash');
 const third=buildBrowserAssets(request('globalThis.fixtureBank="published-v3";'),{root});assert.deepEqual(third.retained,second.assets);assert.ok(!third.retained.some(row=>row.path===first.assets[0].path));
 recordBrowserAssetPublication(root,metadata(3));assert.equal(readFileSync(path.join(root,'workers','app','browser-assets-published.json'),'utf8').includes('not-published'),false);
});

test('missing or changed published predecessor artifacts block the next build',t=>{
 for(const mode of ['missing','changed']){
  const root=fixture(t),manifest=buildBrowserAssets(request(),{root});recordBrowserAssetPublication(root,{worker_version:'11111111-1111-4111-8111-111111111111',source_sha256:'a'.repeat(64),verified_at:'2026-11-11T15:00:00.000Z'});
  const file=path.join(root,'web','cloudflare','browser-assets-published',manifest.assets[0].sha256+'.js');if(mode==='missing')rmSync(file);else writeFileSync(file,'changed');
  assert.throws(()=>buildBrowserAssets(request('globalThis.fixtureBank="next";'),{root}),{code:mode==='missing'?'BROWSER_ASSET_PUBLICATION_INVENTORY_MISMATCH':'BROWSER_ASSET_PUBLICATION_BYTES_MISMATCH'});
 }
});
