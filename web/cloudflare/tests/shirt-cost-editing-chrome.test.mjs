import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import http from './browser-assets-http-fixture.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {compiledOwnerReportPage} from './owner-report-browser-fixture.mjs';
import {receiptBrowser,receiptPause,receiptClick} from './returns-receipts-chrome-helpers.mjs';
import {D1} from './sqlite-d1.mjs';
import {COST_SCHEMA,readProductionCosts,saveProductionCosts,productionCostReference} from '../src/production-costs.mjs';
import {readCostRules,saveCostRules} from '../src/cost-rules.mjs';
import {assertReviewedCostSources} from './reviewed-cost-source-invariants.mjs';

const records=[];
async function wait(cdp,expression,label){for(let n=0;n<180;n++){if(await cdp.evaluate(expression))return;await receiptPause(50);}assert.fail(label+' '+await cdp.evaluate("JSON.stringify({status:document.getElementById('costsStatus')?.textContent,notice:document.getElementById('costsNotice')?.textContent,errors:globalThis.__shirtErrors})"));}
async function click(cdp,selector){try{return await receiptClick(cdp,selector);}catch(e){e.message=selector+': '+e.message+' '+await cdp.evaluate('JSON.stringify((()=>{const a=[];for(let n=document.querySelector('+JSON.stringify(selector)+');n;n=n.parentElement)a.push({tag:n.tagName,id:n.id,hidden:n.hidden,display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility,open:n.open});return a;})())');throw e;}}
async function type(cdp,selector,text){await click(cdp,selector);await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await cdp.send('Input.insertText',{text});}
async function backend(){
 const env={ADMIN_DB:new D1()};await env.ADMIN_DB.batch(COST_SCHEMA.map(sql=>env.ADMIN_DB.prepare(sql)));
 const values={mode:'all_inclusive',inclusive_regular_cents:1590,inclusive_plus_cents:2140,base_regular_cents:null,base_plus_cents:null,components:[{id:'pack',label:'Embalagem inativa',basis:'per_kit',amount_cents:100}],custom_profiles:[{id:'exception',label:'Exceção manual',unit_cost_cents:3900}],custom_assignments:[{item_id:'999',model_id:null,profile_id:'exception'}],composition_recipes:[{id:'triple',label:'Três camisetas',components:['P','M','G'].map(size=>({kind:'ADULT_GARMENT',size,quantity:1}))}],composition_assignments:[{item_id:'903',model_id:'0',recipe_id:'triple'}]},stamp=new Date().toISOString(),raw=JSON.stringify(values);
 await env.ADMIN_DB.batch([env.ADMIN_DB.prepare('INSERT INTO production_costs_state VALUES(1,1,?,?)').bind(raw,stamp),env.ADMIN_DB.prepare('INSERT INTO production_costs_audit(revision,payload,actor,created_at) VALUES(1,?,?,?)').bind(raw,'synthetic-initial',stamp)]);
 const seed=await readCostRules(env),rules=await saveCostRules(env,{revision:seed.revision,values:{rules:[...seed.values.rules,{...seed.values.rules[0],id:'basic-shirt',label:'Camiseta básica',unit_cost_cents:1427,name_patterns:['camiseta basica'],exclude_terms:[],axis_names:[],options:[]}]}},'synthetic-rule');
 const read=()=>readProductionCosts(env),audit=()=>env.ADMIN_DB.db.prepare('SELECT revision,payload,actor FROM production_costs_audit ORDER BY revision').all();
 const calculate=state=>productionCostReference({status:'AVAILABLE',rows:['901','902','903','999'].map(item_id=>({item_id,model_id:'0',quantity:1}))},{revision:1,bindings:[{item_id:'901',model_id:'0',selling_unit:'SINGLE_GARMENT',size:'P',operator_confirmed:true},{item_id:'902',model_id:'0',selling_unit:'ONE_MALE_ONE_FEMALE_KIT',male_size:'P',female_size:'G1',operator_confirmed:true}]},state);
 return {env,values,rules,read,audit,calculate};
}
for(const minify of [false,true])for(const width of [320,1365])test(`shirt edit appears before read-only cards and persists lower adult costs with independent rules and history ${minify?'minified':'normal'} ${width}`,{timeout:150000},async()=>{
 assertReviewedCostSources();const f=await backend(),before=await f.read(),oldAudit=f.audit(),oldReference=f.calculate(before),page=await compiledOwnerReportPage(minify,{ownerPreview:false,localReadSnapshot:true}),cached=new Map(page.localReadSnapshot.responses.map(row=>[row.path,row])),posts=[],errors=[];
 const html=page.html.replace('<head>','<head><script>globalThis.__shirtErrors=[];addEventListener("error",e=>__shirtErrors.push(e.message));addEventListener("unhandledrejection",e=>__shirtErrors.push(String(e.reason)));</script>');
 const server=http.createServer(async(req,res)=>{try{
  if(!req.url.startsWith('/api/')){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(html);return;}
  const url=new URL(req.url,'http://synthetic.invalid'),headers={'content-type':'application/json','cache-control':'no-store'};let body;
  if(req.method==='POST'){
   assert.equal(url.pathname,'/api/admin/production-costs','only the explicitly saved adult cost configuration may be mutated');let raw='';for await(const chunk of req)raw+=chunk;assert.ok(raw.length<131072);const input=JSON.parse(raw);posts.push(input);
   try{body=await saveProductionCosts(f.env,input,'synthetic-shirt-owner');}catch(e){res.writeHead(e.status||500,headers);res.end(JSON.stringify({error:e.message}));return;}
  }else{
   assert.equal(req.method,'GET');if(url.pathname==='/api/admin/production-costs')body=await f.read();else if(url.pathname==='/api/admin/cost-rules')body=f.rules;else if(url.pathname==='/api/admin/production-costs/audit')body={rows:f.audit().map(row=>({...row,created_at:new Date().toISOString()}))};else{const entry=cached.get(req.url);if(entry){body=entry.body;if(entry.contract)headers['x-braza-client-contract']=entry.contract;}}
  }
  res.writeHead(body?200:503,headers);res.end(JSON.stringify(body||{error:'SYNTHETIC_OPTIONAL_SOURCE_UNAVAILABLE'}));
 }catch(e){errors.push(e.message);res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"SYNTHETIC_TEST_FAILURE"}');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let cdp;
 try{
  cdp=await receiptBrowser();await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width===320});await cdp.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/admin?tab=margins'});
  await wait(cdp,"document.getElementById('costInclusiveRegular')?.value==='15.90'&&!document.getElementById('loadProductionCosts').disabled",'existing cost state loads');
  assert.equal(await cdp.evaluate("(()=>{const a=document.getElementById('costInclusiveRegular'),b=document.getElementById('costsPreview'),c=document.getElementById('customCostsSection');return a.checkVisibility({checkVisibilityCSS:true})&&!!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(a.compareDocumentPosition(c)&Node.DOCUMENT_POSITION_FOLLOWING);})()"),true,'the adult input is visible before unrelated settings or summaries');
  assert.equal(await cdp.evaluate("document.getElementById('productionCostsForm').querySelector('input,select').id"),'costMode');assert.equal(posts.length,0);
  const rule=await cdp.evaluate("[...document.querySelectorAll('[data-cost-rule-price]')].find(n=>n.dataset.costRulePrice==='basic-shirt')?.value");assert.equal(rule,'14.27','a separately registered rule is not presented as the adult standard');
  await type(cdp,'#costInclusiveRegular','14,27');await type(cdp,'#costInclusivePlus','19,80');assert.equal(posts.length,0,'editing a draft does not save automatically');
  await click(cdp,'#saveProductionCosts');await wait(cdp,"document.getElementById('costsVersion').textContent==='Custos · versão 2'&&!document.getElementById('loadProductionCosts').disabled",'explicit audited save completes');
  const saved=await f.read(),expected={...f.values,inclusive_regular_cents:1427,inclusive_plus_cents:1980};assert.deepEqual(saved.values,expected);assert.equal(posts.length,1);assert.deepEqual(posts[0],{revision:1,values:expected});assert.deepEqual(f.audit().slice(0,1),oldAudit,'previous cost revision is immutable');assert.equal(f.audit().length,2);assert.equal(f.audit()[1].actor,'synthetic-shirt-owner');assert.deepEqual(await readCostRules(f.env),f.rules,'saving adult standards must not overwrite independent rules');
  assert.deepEqual(f.calculate(saved).variants.map(row=>row.unit_cost_cents),[1427,3407,4281,3900],'subsequent references use lower costs, with whole kits, recipes and manual precedence intact');assert.deepEqual(oldReference.variants.map(row=>row.unit_cost_cents),[1590,3730,4770,3900],'the original captured reference is unchanged');
  await wait(cdp,"document.getElementById('costsDraftNote').textContent.includes('versão salva')",'saved draft status');assert.equal(await cdp.evaluate("document.getElementById('saveProductionCosts').disabled"),true);assert.match(await cdp.evaluate("document.getElementById('costsPreview').textContent"),/14,27.*19,80.*28,54.*34,07.*39,60.*42,81/);
  assert.equal(await cdp.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),true);assert.deepEqual(await cdp.evaluate('globalThis.__shirtErrors'),[]);assert.deepEqual(errors,[]);
  const link='#costRules a[href="/admin?tab=margins#productionCostsForm"]';await click(cdp,link);await wait(cdp,"(()=>{const n=document.getElementById('costInclusiveRegular'),r=n.getBoundingClientRect();return n.checkVisibility({checkVisibilityCSS:true})&&r.top>=0&&r.bottom<innerHeight;})()",'rule section provides a working direct path back to adult editing');assert.equal(posts.length,1,'navigation never saves');
  if(process.env.MLS_SHIRT_COST_SCREENSHOT_DIR){mkdirSync(process.env.MLS_SHIRT_COST_SCREENSHOT_DIR,{recursive:true});const image=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});writeFileSync(path.join(process.env.MLS_SHIRT_COST_SCREENSHOT_DIR,(minify?'min':'normal')+'-'+width+'.png'),Buffer.from(image.data,'base64'));}
  records.push({minify,width,passed:true,synthetic_only:true,explicit_saves:posts.length,source_hashes:Object.fromEntries(['app','auth','finance'].map(role=>[role,createHash('sha256').update(readFileSync(new URL('../../../dist/'+role+'-worker.mjs',import.meta.url))).digest('hex')]))});
 }finally{await cdp?.close();await new Promise(resolve=>server.close(resolve));f.env.ADMIN_DB.db.close();}
});
after(()=>{if(process.env.MLS_SHIRT_COST_QA_FILE)writeFileSync(process.env.MLS_SHIRT_COST_QA_FILE,JSON.stringify({schema:'owner_shirt_cost_native_qa_v1',profiles:records,all_passed:records.length===4},null,2)+'\n');});
