import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,symlinkSync,unlinkSync,existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {prepareOwnerPreviewAssets,runOwnerPreviewAssets} from '../mls_owner_preview_assets.mjs';
const at=1793390400;
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function temp(t){const root=mkdtempSync(path.join(os.tmpdir(),'mls-preview-assets-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));return root;}

test('preview prepares exact synthetic originals, validated three templates and bounded indexed byte hashes',async t=>{
 const root=temp(t),index=await prepareOwnerPreviewAssets({directory:root,at,tools:{espeak:'/must-not-run'}});
 assert.equal(index.schema,'mls_owner_preview_media_v1');assert.equal(index.source,'ORIGINAL_SYNTHETIC_FIXTURES');
 assert.equal(index.commercial_writes,false);assert.equal(index.products.length,3);assert.equal(index.assets.length,4);
 assert.equal(index.campaigns.length,3);assert.ok(index.campaigns.every(c=>c.status==='READY_FOR_LOCAL_RENDER'));
 assert.deepEqual(index.inputs.map(i=>i.template_id),['NOSTALGIA_80_90_2000','PRODUCT_DETAILS','COUPLE_KIT']);
 assert.equal(index.files.length,8);assert.deepEqual(index.renders,[]);
 for(const file of index.files){const bytes=readFileSync(path.join(root,file.relative_path));assert.equal(digest(bytes),file.sha256);assert.equal(bytes.length,file.size_bytes);assert.ok(!file.relative_path.includes('..'));}
 for(const p of index.products){assert.equal(p.price_cents,null);assert.equal(p.inventory_units,null);assert.equal(p.fees_cents,null);assert.equal(p.cost_cents,null);assert.ok(p.observations.every(o=>o.evidence.status==='DECLARED'&&o.evidence.observed_at===at));}
 assert.equal(index.products[2].piece_count,2);assert.deepEqual(index.assets.filter(a=>a.product_key===index.products[2].product_key).map(a=>a.component_coverage[0].component_ref),['component-0','component-1']);
});
test('restarting asset preparation preserves generation time and identical bytes rather than renewing evidence',async t=>{
 const root=temp(t),first=await prepareOwnerPreviewAssets({directory:root,at}),before=readFileSync(path.join(root,'demo-index.json'));
 const second=await prepareOwnerPreviewAssets({directory:root});
 assert.deepEqual(second,first);assert.deepEqual(readFileSync(path.join(root,'demo-index.json')),before);
 await assert.rejects(prepareOwnerPreviewAssets({directory:root,at:at+1}),/PREVIEW_ASSET_TIME_CONFLICT/);
});
test('changed local originals are not overwritten when the preview is restarted',async t=>{
 const root=temp(t);await prepareOwnerPreviewAssets({directory:root,at});
 const file=path.join(root,'assets','original-shirt-0-0.png'),tampered=Buffer.from('unexpected user data');writeFileSync(file,tampered);
 await assert.rejects(prepareOwnerPreviewAssets({directory:root}),/PREVIEW_ASSET_FILE_CONFLICT/);
 assert.deepEqual(readFileSync(file),tampered);
});
test('preview refuses a symlink root, symlink media and symlink index without modifying the targets',async t=>{
 const parent=temp(t),root=path.join(parent,'real'),alias=path.join(parent,'alias');
 await prepareOwnerPreviewAssets({directory:root,at});symlinkSync(root,alias,'dir');
 await assert.rejects(prepareOwnerPreviewAssets({directory:alias}),/LOCAL_SYMLINK_OR_DIRECTORY_INVALID/);
 const original=path.join(root,'assets','original-shirt-0-0.png'),target=path.join(parent,'foreign.png'),foreign=Buffer.from('foreign fixture');writeFileSync(target,foreign);unlinkSync(original);symlinkSync(target,original);
 await assert.rejects(prepareOwnerPreviewAssets({directory:root}),/LOCAL_SYMLINK_OR_FILE_INVALID/);assert.deepEqual(readFileSync(target),foreign);
 unlinkSync(original);const index=path.join(root,'demo-index.json');unlinkSync(index);symlinkSync(target,index);
 await assert.rejects(prepareOwnerPreviewAssets({directory:root}),/PREVIEW_ASSET_INDEX_INVALID/);assert.deepEqual(readFileSync(target),foreign);
});
test('an aborted initial generation records its source clock for a resumable next local run',async t=>{
 const root=temp(t),controller=new AbortController();controller.abort();
 await assert.rejects(prepareOwnerPreviewAssets({directory:root,at,signal:controller.signal}),/PREVIEW_ASSET_ABORTED/);
 const second=await prepareOwnerPreviewAssets({directory:root});assert.equal(second.generated_at,at);assert.equal(second.inputs.length,3);
});
test('CLI rejects extra or duplicate arguments before creating an output and reports sanitized codes',async t=>{
 const root=temp(t),target=path.join(root,'not-created');
 for(const args of [[],['--directory',target,'--unknown','private'],['--directory',target,'--directory',target],['--directory',target,'--espeak']]){
  const output=[],errors=[];assert.equal(await runOwnerPreviewAssets(args,{stdout:v=>output.push(v),stderr:v=>errors.push(v)}),1);
  assert.deepEqual(output,[]);assert.deepEqual(errors,['PREVIEW_ASSET_ARGUMENT_INVALID']);assert.equal(existsSync(target),false);
 }
});
