import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import http from './browser-assets-http-fixture.mjs';
import {receiptBrowser,receiptChrome,receiptClick,receiptPause} from './returns-receipts-chrome-helpers.mjs';

const workerPath=fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url));
const digest=()=>createHash('sha256').update(readFileSync(workerPath)).digest('hex');
const themeSelector='[data-braza-theme-toggle]';

for(const minify of [false,true])test('compiled legacy owner login keeps native theme and credential controls accessible '+(minify?'minified':'normal'),{timeout:90000},async t=>{
 if(!receiptChrome)return t.skip('Chrome executable not installed on CI runner');
 const frozenWorker=digest();
 const compiled=await build({entryPoints:[workerPath],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'))).default;
 // Only the real unauthenticated GET handler is exercised. No session, database,
 // provider binding, credential submission or production service is configured.
 const env=Object.freeze({ADMIN_USERNAME:'synthetic-owner',ADMIN_PASSWORD:'synthetic-unused-password',ADMIN_SESSION_SECRET:'synthetic-unused-session-'+'s'.repeat(32)});
 const reads=[],mutations=[];
 const server=http.createServer(async(request,response)=>{
  try{
   if(request.method!=='GET'){mutations.push({method:request.method,path:request.url});response.writeHead(405);response.end();return;}
   if(request.url!=='/login'){response.writeHead(404);response.end();return;}
   reads.push(request.url);
   const result=await worker.fetch(new Request('http://127.0.0.1/login'),env);
   assert.equal(result.status,200,'compiled Worker serves the existing owner login');
   response.writeHead(result.status,Object.fromEntries(result.headers));response.end(await result.text());
  }catch(error){response.writeHead(500);response.end(String(error));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await receiptBrowser();
  const errors=[];browser.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails?.text||'JavaScript exception'));
  await browser.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});
  for(const width of [320,1365])for(const theme of ['light','dark']){
   const preferenceScript=await browser.send('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.setItem("braza-theme",'+JSON.stringify(theme)+')'});
   await browser.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===320});
   await browser.send('Page.navigate',{url:origin+'/login'});
   let loaded=false;
   for(let attempt=0;attempt<120;attempt++){
    loaded=await browser.evaluate(`location.pathname==="/login"&&document.readyState==="complete"&&document.documentElement.dataset.themePreference===${JSON.stringify(theme)}&&!!document.querySelector('form[action="/login"] button[type=submit]')`);
    if(loaded)break;await receiptPause(50);
   }
   assert.equal(loaded,true,'actual login document loads at '+width+' / '+theme);
   await browser.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:preferenceScript.identifier});
   const state=await browser.evaluate(`(async()=>{await document.fonts.ready;const form=document.querySelector('form[action="/login"]');return {theme:document.documentElement.dataset.theme,overflow:document.documentElement.scrollWidth>innerWidth,form:{method:form.method,action:new URL(form.action).pathname,fields:[...form.querySelectorAll('input')].map(node=>({name:node.name,type:node.type,required:node.required,autocomplete:node.autocomplete,maxLength:node.maxLength})),submit:form.querySelector('button[type=submit]').textContent.trim()},controls:[...document.querySelectorAll('${themeSelector},#username,#password,form button[type=submit]')].map(node=>{const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {name:node.name||node.type,width:r.width,height:r.height,visible:node.checkVisibility({checkVisibilityCSS:true}),unobscured:hit===node||node.contains(hit)};})};})()`);
   assert.equal(state.theme,theme);assert.equal(state.overflow,false,'login fits '+width+'px');
   assert.deepEqual(state.form,{method:'post',action:'/login',fields:[{name:'username',type:'text',required:true,autocomplete:'username',maxLength:100},{name:'password',type:'password',required:true,autocomplete:'current-password',maxLength:200}],submit:'Entrar'},'owner username/password contract remains intact');
   assert.equal(state.controls.length,4);
   for(const control of state.controls){
    assert.equal(control.visible,true,control.name+' visible');assert.equal(control.unobscured,true,control.name+' unobscured');
    assert.ok(control.width>=44&&control.height>=44,'native login control is at least 44px in both dimensions: '+JSON.stringify({width,theme,control}));
   }
   await receiptClick(browser,themeSelector);
   const expectedPreference=theme==='light'?'dark':'system',expectedTheme=theme==='light'?'dark':'light';
   assert.deepEqual(await browser.evaluate('({theme:document.documentElement.dataset.theme,preference:document.documentElement.dataset.themePreference,saved:localStorage.getItem("braza-theme"),clicks:globalThis.__receiptActivations.filter(event=>event.type==="click").map(event=>({trusted:event.trusted,matches:event.matches}))})'),{theme:expectedTheme,preference:expectedPreference,saved:expectedPreference,clicks:[{trusted:true,matches:true}]},'trusted native activation changes the actual theme and saves the preference');
   // Keep the next profile's trusted-click evidence independent.
   await browser.evaluate('globalThis.__receiptActivations=[]');
   if(process.env.MLS_LEGACY_LOGIN_SCREENSHOT_DIR){
    mkdirSync(process.env.MLS_LEGACY_LOGIN_SCREENSHOT_DIR,{recursive:true});
    const shot=await browser.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    writeFileSync(path.join(process.env.MLS_LEGACY_LOGIN_SCREENSHOT_DIR,'legacy-login-'+(minify?'min':'normal')+'-'+width+'-'+theme+'.png'),Buffer.from(shot.data,'base64'));
   }
  }
  assert.deepEqual(errors,[],'login and theme produce no JavaScript exception');
  assert.equal(reads.length,4);assert.deepEqual(mutations,[],'theme activation never submits login or writes application data');
  assert.equal(digest(),frozenWorker,'compiled fixture remains frozen throughout native browser checks');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
