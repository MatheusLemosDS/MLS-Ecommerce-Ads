import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createOfflinePreviewHtml,exportOwnerPreview} from '../mls_owner_preview_export.mjs';
const shell='<!doctype html><html><head><title>MLS</title></head><body><div class="app-shell"><section id="ai-sales"></section></div></body></html>';
const hash='a'.repeat(64);
function build(options={}){return createOfflinePreviewHtml({html:shell,workerHash:hash,snapshots:[],...options});}
function sandbox(html){
 const handlers={},message={textContent:''};
 const context=vm.createContext({URL,Response,Request,Uint8Array,Blob,atob,TextEncoder,document:{addEventListener(name,handler){handlers[name]=handler;},getElementById(){return message;}},addEventListener(){}});
 vm.runInContext("class LocalResponse extends Response { async json(){return JSON.parse(await this.text());}};globalThis.Response=LocalResponse;",context);
 const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];vm.runInContext(script,context);return {context,handlers,message,run:code=>vm.runInContext(code,context)};
}
test('offline review is clearly synthetic, readonly and denies all remote fetches',async()=>{
 const html=build();assert.match(html,/DEMONSTRAÇÃO LOCAL/);assert.match(html,/dados fictícios/);assert.match(html,/connect-src 'none'/);assert.match(html,/somente leitura/);
 const browser=sandbox(html);
 assert.equal(await browser.run("fetch('https://example.org/').then(r=>r.json()).then(v=>v.error)"),'OFFLINE_PREVIEW_NETWORK_DISABLED');
 assert.equal(await browser.run("fetch('/api/admin/settings',{method:'POST',body:'{}'}).then(r=>r.json()).then(v=>v.error)"),'OFFLINE_PREVIEW_READ_ONLY');
 assert.equal(await browser.run("fetch('/api/admin/missing').then(r=>r.json()).then(v=>v.error)"),'OFFLINE_SOURCE_UNAVAILABLE');
 assert.equal(await browser.run("fetch('/api/admin/bootstrap').then(r=>r.json()).then(v=>v.csrf)"),'0'.repeat(64));
 assert.equal(browser.run('__mlsOfflineReview.commercial_writes'),false);
});
test('snapshot secrets are rejected; synthetic CSRF is replaced without leaking values or HTML injection',async()=>{
 assert.throws(()=>build({snapshots:[{path:'/api/admin/state',status:200,body:{access_token:'never-export'}}]}),/OFFLINE_SENSITIVE_FIELD_REJECTED/);
 const value='</script><img src=x onerror=alert(1)>',html=build({snapshots:[{path:'/api/admin/state',status:200,body:{csrf:'actual-local-token',value}}]});
 assert.equal(html.includes('actual-local-token'),false);assert.equal(html.includes(value),false);
 const browser=sandbox(html);assert.equal(await browser.run("fetch('/api/admin/state').then(r=>r.json()).then(v=>v.value)"),value);
 assert.equal(await browser.run("fetch('/api/admin/state').then(r=>r.json()).then(v=>v.csrf)"),'0'.repeat(64));
});
test('native agent and tool anchors remain navigable while unknown and foreign links stay blocked',()=>{
 const browser=sandbox(build());
 for(const field of ['tab','workspaceTab','missionOpen','open']){
  let prevented=false;const link={dataset:{[field]:'agent-finance'},getAttribute:()=>'/admin?tab=agent-finance',hasAttribute:()=>false};
  browser.handlers.click({target:{closest:()=>link},preventDefault(){prevented=true;}});assert.equal(prevented,false);
 }
 for(const [panel,href] of [['agent-finance','https://external.test/admin?tab=agent-finance'],['unknown','/admin?tab=unknown'],['agent-finance','/admin?tab=agent-ads'],[undefined,'/dashboard']]){
  let prevented=false;const link={dataset:{missionOpen:panel},getAttribute:()=>href,hasAttribute:()=>false};
  browser.handlers.click({target:{closest:()=>link},preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.match(browser.message.textContent,/precisa da prévia local/);
 }
});
test('invalid assets, foreign routes and nonhex Worker identities fail before export',()=>{
 assert.throws(()=>build({workerHash:'z'.repeat(64)}),/OFFLINE_EXPORT_INPUT_INVALID/);
 assert.throws(()=>build({snapshots:[{path:'https://attacker.test/',status:200,body:{}}]}),/OFFLINE_SNAPSHOT_INVALID/);
 for(const media of [[{id:'../bad',mime:'video/mp4',base64:'AAAA'}],[{id:'test',mime:'text/html',base64:'AAAA'}],[{id:'test',mime:'video/mp4',base64:'not-base64'}]])assert.throws(()=>build({media}),/OFFLINE_MEDIA_INVALID/);
});
test('actual Worker/SQLite export preserves seeded product scopes and source clocks without a server after export',{timeout:30000},async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'mls-offline-export-'));
 try{
  const result=await exportOwnerPreview({output:path.join(dir,'preview.html')}),html=readFileSync(result.path,'utf8');
  assert.equal(result.connected_to_merchant,false);assert.equal(result.commercial_writes,false);assert.equal(result.snapshots,26);
  for(const script of [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]))new vm.Script(script);
  const browser=sandbox(html);
  assert.equal(await browser.run("fetch('/api/admin/product-registry?limit=20&offset=0&item_status=ACTIVE').then(r=>r.json()).then(v=>v.products.length)"),3);
  assert.equal(await browser.run("fetch('/api/admin/product-registry?limit=20&offset=0&search=infantil&item_status=ACTIVE').then(r=>r.json()).then(v=>v.products[0].item_id)"),'990002');
  assert.equal(await browser.run("fetch('/api/admin/product-registry?item_id=990003&variant_limit=50&variant_offset=0').then(r=>r.json()).then(v=>v.variants[0].unit_cost_cents)"),3730);
  assert.equal(await browser.run("fetch('/api/admin/product-registry?item_id=990001&variant_limit=50&variant_offset=0').then(r=>r.json()).then(v=>v.variants.map(x=>x.model_name+':'+x.unit_cost_cents).join('|'))"),'Azul / P:1590|Azul / GG:1590|Preto / P:1590|Preto / G3:2140');
  assert.equal(await browser.run("fetch('/api/admin/product-registry?item_id=990002&variant_limit=50&variant_offset=0').then(r=>r.json()).then(v=>v.variants.map(x=>x.model_name+':'+x.unit_cost_cents).join('|'))"),'2:1250|4:1250|6:1250|8:1250|10:1250|12:1250|14:1250|16:1250');
  assert.equal(await browser.run("fetch('/api/admin/product-registry?item_id=990003&variant_limit=1&variant_offset=1').then(r=>r.json()).then(v=>v.variants.length)"),0);
  assert.equal(await browser.run("fetch('/api/admin/product-registry?item_id=foreign&variant_limit=50&variant_offset=0').then(r=>r.status)"),503);
  assert.equal(await browser.run("fetch('/api/admin/product-registry?limit=-1&offset=0').then(r=>r.status)"),503);
  assert.equal(await browser.run("fetch('/api/admin/product-registry?limit=20&limit=1&offset=0').then(r=>r.status)"),503);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
