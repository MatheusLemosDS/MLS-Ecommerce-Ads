import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {transformSync} from 'esbuild';
import {COMMERCIAL_WORKSPACE_CLIENT} from '../src/commercial-workspace-client.mjs';
import {DTF_CLIENT,dtfBody} from '../src/dtf-view.mjs';
import {DTF_ENGINE_CLIENT} from '../src/dtf-layout.mjs';
import {createReturnLocalArtworkLoader} from '../src/returns-local-artwork.mjs';
import {tenantArtworkDatabaseName} from '../src/tenant-browser-storage.mjs';
import {receiptBrowser,receiptPause} from './returns-receipts-chrome-helpers.mjs';

function png(color){
 const crc=bytes=>{let c=0xffffffff;for(const byte of bytes){c^=byte;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const name=Buffer.from(type),result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);name.copy(result,4);data.copy(result,8);result.writeUInt32BE(crc(Buffer.concat([name,data])),result.length-4);return result;};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.from([0,...color]))),chunk('IEND',Buffer.alloc(0))]);
}
const sha=value=>createHash('sha256').update(value).digest('hex');
const context=(key)=>({kind:'account',userId:'person-'+key,organizationId:'company-'+key,storeId:'store-'+key,role:'OWNER',capabilities:['dtf.read','returns.read'],csrf:key.repeat(43),namespace:'mlst_'+key.repeat(64)+'_',allowedTabs:['production','agent-returns']});
async function until(cdp,expression){for(let n=0;n<180;n++){if(await cdp.evaluate(expression))return;await receiptPause(25);}assert.fail('Native workspace isolation did not reach its expected state');}

test('native shared-origin IndexedDB keeps two company artwork libraries separate and logout clears late reads',{timeout:60000},async()=>{
 const bytes={a:png([255,0,0,255]),b:png([0,0,255,255])},hashes={a:sha(bytes.a),b:sha(bytes.b)},requests=[],exceptions=[];let held=null;
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://fixture.test');
  if(url.pathname==='/driver'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><html><body><h1>Synthetic native storage isolation</h1></body></html>');return;}
  if(['/a','/b'].includes(url.pathname)){
   const key=url.pathname.slice(1),ctx=context(key);let initialize=`globalThis.__revoked=[];const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=value=>{__revoked.push(value);revoke(value);};`+COMMERCIAL_WORKSPACE_CLIENT;
   let source=DTF_ENGINE_CLIENT+DTF_CLIENT+`;globalThis.artworkLoader=(${createReturnLocalArtworkLoader.toString()})();globalThis.ready=false;(async()=>{await brazaDtfWorkspace.start({api:async(path,body)=>{const response=await fetch('/api/admin/'+path,{method:body===undefined?'GET':'POST',...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});return response.json();}});globalThis.ready=true;})().catch(error=>{globalThis.initError=error.message;});`;
   if(url.searchParams.get('minify')==='true'){initialize=transformSync(initialize,{minify:true,target:'es2022'}).code;source=transformSync(source,{minify:true,target:'es2022'}).code;}
   res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><html><body><script type="application/json" id="mls-commercial-context">'+JSON.stringify(ctx)+'</script><script>'+initialize+'</script><main data-mls-private-root><a href="/admin?tab=agent-finance" id="restrictedFinanceLink">Financeiro</a><output id="commandCenterSales">—</output>'+dtfBody()+'</main><script>'+source+'</script></body></html>');return;
  }
  if(url.pathname.startsWith('/api/')){
   const row={path:url.pathname,method:req.method,company:req.headers['x-mls-company']??null,store:req.headers['x-mls-store']??null,csrf:req.headers['x-csrf-token']??null};requests.push(row);
   if(url.pathname==='/api/admin/late'){res.writeHead(200,{'content-type':'application/json'});res.write('{"private":"');held=res;return;}
   if(url.pathname==='/api/account/logout'){assert.equal(req.method,'POST');assert.equal(row.csrf,'b'.repeat(43));res.writeHead(200,{'content-type':'application/json'});res.end('{"logged_out":true}');return;}
   res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(url.pathname==='/api/admin/production'?{settings:{revision:1,values:null},lines:[],batches:[],last_sync_at:null}:{company:row.company,store:row.store}));return;
  }
  res.writeHead(204);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;let cdp;
 try{
  cdp=await receiptBrowser();cdp.on('Runtime.exceptionThrown',row=>exceptions.push(row.exceptionDetails.text));
  for(const minify of [false,true]){
   await cdp.send('Page.navigate',{url:origin+'/driver'});await until(cdp,'location.pathname==="/driver"&&!!document.body');
   const records=[{name:'brazacommerce-dtf-artworks-v1',key:'legacy-private',data:bytes.a.toString('base64'),hash:hashes.a},...['a','b'].flatMap(key=>[{name:tenantArtworkDatabaseName(context(key)),key:'same-art',data:bytes[key].toString('base64'),hash:hashes[key]},{name:tenantArtworkDatabaseName(context(key)),key:'company-'+key+'-private',data:bytes[key].toString('base64'),hash:hashes[key]}])];
   await cdp.evaluate(`(async()=>{for(const row of ${JSON.stringify(records)}){const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(row.name,1);r.onupgradeneeded=()=>r.result.createObjectStore('artworks',{keyPath:'art_key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('artworks','readwrite');tx.objectStore('artworks').put({art_key:row.key,sha256:row.hash,pixel_width:1,pixel_height:1,blob:new Blob([Uint8Array.from(atob(row.data),c=>c.charCodeAt(0))],{type:'image/png'})});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}for(const key of ['a','b']){const iframe=document.createElement('iframe');iframe.id='frame-'+key;iframe.src='/'+key+'?minify='+${JSON.stringify(String(minify))};document.body.append(iframe);}})()`);
   await until(cdp,"['a','b'].every(key=>document.getElementById('frame-'+key)?.contentWindow.ready===true)");
   const libraries=await cdp.evaluate(`(async()=>{const output={};for(const key of ['a','b']){const w=document.getElementById('frame-'+key).contentWindow,result=await w.artworkLoader.load({art_key:'same-art',sha256:${JSON.stringify(hashes)}[key]});output[key]={text:w.document.getElementById('dtfArtList').textContent,state:result.state,sha:result.sha256,url:result.url,context:w.mlsCommercialContext.organizationId};}return output;})()`);
   for(const key of ['a','b']){assert.equal(libraries[key].state,'AVAILABLE');assert.equal(libraries[key].sha,hashes[key]);assert.equal(libraries[key].context,'company-'+key);assert.match(libraries[key].text,new RegExp('company-'+key+'-private'));assert.doesNotMatch(libraries[key].text,new RegExp('company-'+(key==='a'?'b':'a')+'-private|legacy-private'));}
   assert.equal(await cdp.evaluate("document.getElementById('frame-a').contentDocument.getElementById('restrictedFinanceLink').hidden"),true,'pre-markup initializer applies allowedTabs after DOM ready');
   assert.equal(await cdp.evaluate("document.getElementById('frame-a').contentDocument.getElementById('commandCenterSales').textContent"),'Acesso restrito','no finance capability is explicit, never a fake zero');
   assert.notEqual(libraries.a.sha,libraries.b.sha,'equal art keys never identify the other company bytes');
   const pinned=await cdp.evaluate("(async()=>{const result={};for(const key of ['a','b']){const w=document.getElementById('frame-'+key).contentWindow;result[key]=await(await w.fetch('/api/admin/context',{headers:{'x-mls-company':'forged','x-mls-store':'forged'}})).json();}return result;})()");
   assert.deepEqual(pinned,{a:{company:'company-a',store:'store-a'},b:{company:'company-b',store:'store-b'}});
   await cdp.evaluate("(()=>{const w=document.getElementById('frame-a').contentWindow;w.pendingPrivate=w.fetch('/api/admin/late').then(r=>r.json()).then(()=>({leaked:true}),error=>({error:error.name}));})()");
   for(let n=0;n<100&&!held;n++)await receiptPause(10);assert.ok(held,'late native response started');
   await cdp.evaluate("document.getElementById('frame-a').contentWindow.mlsCommercialWorkspace.stop('CONTEXT_CHANGED')");
   const late=await cdp.evaluate("document.getElementById('frame-a').contentWindow.pendingPrivate");assert.deepEqual(late,{error:'AbortError'});held.end('OLD-COMPANY-DATA"}');held=null;
   assert.equal(await cdp.evaluate("document.getElementById('frame-a').contentDocument.querySelector('main').textContent"),'');assert.equal(await cdp.evaluate("document.getElementById('frame-b').contentWindow.mlsCommercialWorkspace.isActive()"),true);
   assert.equal(await cdp.evaluate("document.getElementById('frame-b').contentWindow.mlsCommercialWorkspace.logout()"),true);
   await until(cdp,"['a','b'].every(key=>document.getElementById('frame-'+key).contentWindow.mlsCommercialWorkspace.isActive()===false)");
   const stopped=await cdp.evaluate("['a','b'].map(key=>{const w=document.getElementById('frame-'+key).contentWindow;return {private:w.document.querySelector('main').textContent,url:w.location.pathname,revoked:w.__revoked.length,notice:!!w.document.getElementById('mlsCommercialSessionNotice')};})");
   for(const row of stopped){assert.equal(row.private,'');assert.equal(row.notice,true);assert.ok(row.revoked>=1);assert.ok(['/a','/b'].includes(row.url),'logout leaves an explicit reauthentication notice instead of instant navigation');}
   const legacy=await cdp.evaluate("(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('brazacommerce-dtf-artworks-v1');r.onsuccess=()=>resolve(r.result);});const row=await new Promise(resolve=>{const r=db.transaction('artworks').objectStore('artworks').get('legacy-private');r.onsuccess=()=>resolve(r.result);});db.close();return row.art_key;})()");assert.equal(legacy,'legacy-private','legacy library remains intact, never migrated automatically');
  }
  assert.deepEqual(exceptions,[]);assert.ok(requests.filter(row=>row.path.startsWith('/api/admin/')).every(row=>row.company==='company-a'&&row.store==='store-a'||row.company==='company-b'&&row.store==='store-b'));
 }finally{held?.end();await cdp?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
