import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtempSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {startPreviewServer} from '../mls_owner_preview_server.mjs';
import {createPreviewRuntime} from '../mls-owner-preview/runtime.mjs';

const login=async s=>{const response=await fetch(s.origin+'/__preview/login',{method:'POST',headers:{origin:s.origin},redirect:'manual'});assert.equal(response.status,303);const cookies=response.headers.getSetCookie(),cookie=cookies.find(value=>value.startsWith('braza_admin='));assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);return cookie.split(';')[0];};
const get=async(s,route,cookie,headers={})=>{const response=await fetch(s.origin+route,{headers:{...(cookie?{cookie}:{}),...headers},redirect:'manual'});return {status:response.status,response,data:response.headers.get('content-type')?.includes('application/json')?await response.json():await response.text()};};
const raw=async(url,options={})=>new Promise((resolve,reject)=>{const request=http.request(url,options,response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});request.on('error',reject);request.end();});
const fakeMedia=()=>{const root=mkdtempSync(path.join(os.tmpdir(),'mls-preview-media-test-')),bytes=Buffer.from('ORIGINAL_SYNTHETIC_FIXTURE');writeFileSync(path.join(root,'sample.txt'),bytes);const index={schema:'mls_owner_preview_media_v1',source:'ORIGINAL_SYNTHETIC_FIXTURES',commercial_writes:false,files:[{id:'sample',relative_path:'sample.txt',mime:'text/plain',sha256:createHash('sha256').update(bytes).digest('hex'),size_bytes:bytes.length}]};writeFileSync(path.join(root,'demo-index.json'),JSON.stringify(index));return {root,index,bytes};};

test('actual Worker login and SQLite catalog expose adults, children and kit without fictional financial totals',async()=>{
 const s=await startPreviewServer();try{
  const landing=await get(s,'/');assert.match(landing.data,/Prévia local · dados fictícios/);assert.match(landing.data,/não tem conexão com a loja/);
  assert.equal((await get(s,'/api/admin/bootstrap')).status,401);const cookie=await login(s);
  const html=await get(s,'/admin?tab=ai-sales',cookie);assert.equal(html.status,200);assert.match(html.data,/id="ai-sales"/);assert.match(html.data,/id="mlsLocalPreviewBanner"/);
  const catalog=await get(s,'/api/admin/product-registry?limit=20&offset=0&item_status=ACTIVE',cookie);assert.equal(catalog.status,200);assert.equal(catalog.data.products.length,3);assert.ok(catalog.data.products.every(p=>p.item_status==='NORMAL'&&p.product_name.includes('DEMONSTRAÇÃO')));
  const detail=async id=>(await get(s,'/api/admin/product-registry?item_id='+id+'&variant_limit=50&variant_offset=0',cookie)).data;
  const adult=await detail('990001');assert.deepEqual(adult.variants.map(v=>v.unit_cost_cents),[1590,1590,1590,2140]);assert.deepEqual(adult.variants.map(v=>v.model_name),['Azul / P','Azul / GG','Preto / P','Preto / G3']);
  const child=await detail('990002');assert.equal(child.variants.length,8);assert.ok(child.variants.every(v=>v.unit_cost_cents===1250));
  const kit=await detail('990003');assert.equal(kit.variants[0].unit_cost_cents,3730);assert.equal(kit.variants[0].male_size,'GG');assert.equal(kit.variants[0].female_size,'G3');
  const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
  const finance=await get(s,'/api/admin/finance/business-month-view?month='+month,cookie,{'x-braza-client-contract':'business-month-view-v4'});assert.equal(finance.status,200);assert.equal(finance.data.schema,'business_month_view_v4');assert.equal(finance.data.display.sales_cents,null);assert.equal(finance.data.display.result.net_profit_cents,null);assert.equal(finance.data.display.ads,null);assert.deepEqual(finance.data.display.source_checked_at,{finance_oldest_at:null,finance_latest_at:null,ads_at:null});
  const status=await get(s,'/__preview/status');assert.equal(status.data.connected_to_merchant,false);assert.equal(status.data.commercial_writes,false);assert.equal(status.data.outbound_attempts,0);
 }finally{await s.close();}
});

test('actual JSON cost mutation keeps realm validation and CSRF; logout revokes only the current local session',async()=>{
 const s=await startPreviewServer();try{const cookie=await login(s),session=(await get(s,'/api/admin/bootstrap',cookie)).data,current=(await get(s,'/api/admin/production-costs',cookie)).data;
  const submit=token=>fetch(s.origin+'/api/admin/production-costs',{method:'POST',headers:{origin:s.origin,cookie,'content-type':'application/json','x-csrf-token':token},body:JSON.stringify({revision:current.revision,values:{...current.values,inclusive_regular_cents:1601}})});
  assert.equal((await submit('invalid')).status,403);const saved=await submit(session.csrf);assert.equal(saved.status,200,await saved.clone().text());assert.equal((await get(s,'/api/admin/production-costs',cookie)).data.values.inclusive_regular_cents,1601);
  const logout=await fetch(s.origin+'/admin/logout',{method:'POST',headers:{origin:s.origin,cookie,'x-csrf-token':session.csrf},redirect:'manual'});assert.equal(logout.status,204);assert.ok(logout.headers.getSetCookie().every(value=>value.includes('Max-Age=0')));
 }finally{await s.close();}
});

test('loopback Host and Origin are enforced and forwarded headers cannot grant remote access',async()=>{
 await assert.rejects(startPreviewServer({host:'0.0.0.0'}),{code:'PREVIEW_LOOPBACK_REQUIRED'});
 const s=await startPreviewServer();try{
  assert.equal(await raw(s.origin+'/',{headers:{host:'attacker.test'}}),403);
  assert.equal((await fetch(s.origin+'/__preview/login',{method:'POST',headers:{origin:'https://attacker.test','x-forwarded-host':new URL(s.origin).host,'x-forwarded-proto':'https'},redirect:'manual'})).status,403);
  assert.equal(await raw(s.origin+'/__preview/login',{method:'POST',headers:{origin:s.origin,host:'attacker.test','x-forwarded-host':new URL(s.origin).host}}),403);
  const good=await fetch(s.origin+'/__preview/login',{method:'POST',headers:{origin:s.origin,'x-forwarded-host':'attacker.test','x-forwarded-proto':'https'},redirect:'manual'});assert.equal(good.status,303);
  assert.equal((await fetch(s.origin+'/__preview/login',{method:'POST',headers:{origin:s.origin},body:'x'.repeat(2*1024*1024+1),redirect:'manual'})).status,413);
  assert.equal((await get(s,'/internal/shopee/orders')).status,404);
 }finally{await s.close();}
});

test('media is authenticated, fixed-ID, verified and cached; paths and symlinks cannot escape the inventory',async()=>{
 const f=fakeMedia();let s;try{
  s=await startPreviewServer({mediaDirectory:f.root});assert.equal((await get(s,'/__preview/media/sample')).status,401);const cookie=await login(s);
  const index=await get(s,'/__preview/media',cookie);assert.equal(index.status,200);assert.equal(index.data.files.length,1);
  writeFileSync(path.join(f.root,'sample.txt'),'changed');const media=await get(s,'/__preview/media/sample',cookie);assert.equal(media.data,f.bytes.toString());assert.equal(media.response.headers.get('content-type'),'text/plain');
  assert.equal((await get(s,'/__preview/media/not-registered',cookie)).status,404);assert.equal((await get(s,'/__preview/media/sample?path=/etc/passwd',cookie)).status,404);
  await s.close();s=null;await assert.rejects(startPreviewServer({mediaDirectory:f.root}),{code:'PREVIEW_MEDIA_HASH_MISMATCH'});
  rmSync(path.join(f.root,'sample.txt'));symlinkSync('/etc/passwd',path.join(f.root,'sample.txt'));await assert.rejects(startPreviewServer({mediaDirectory:f.root}),{code:'PREVIEW_MEDIA_SYMLINK'});
 }finally{if(s)await s.close();rmSync(f.root,{recursive:true,force:true});}
});

test('repository Worker runtime denies outgoing fetch and omits Node process globals',async()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'mls-preview-runtime-')),filename=path.join(root,'worker.mjs');writeFileSync(filename,`export default{async fetch(){try{await fetch('https://auth.brazacommerce.com.br/');return new Response('UNSAFE');}catch(e){return Response.json({code:e.code,process:typeof process,require:typeof globalThis.require});}}};`);
 const r=await createPreviewRuntime(filename);try{const response=await r.fetch(r.request('http://127.0.0.1/'),{});assert.deepEqual(await response.json(),{code:'PREVIEW_OUTBOUND_DISABLED',process:'undefined',require:'undefined'});assert.equal(r.outboundAttempts,1);}finally{r.close();rmSync(root,{recursive:true,force:true});}
});
