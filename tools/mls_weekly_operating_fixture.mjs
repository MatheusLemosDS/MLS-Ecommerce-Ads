import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import http from 'node:http';
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID,webcrypto} from 'node:crypto';
import {D1} from '../web/cloudflare/tests/sqlite-d1.mjs';
import {createLocalBrowserAssets} from './browser_assets.mjs';
import {businessMonth,readBusinessMonthDisplay} from '../web/cloudflare/src/business-month.mjs';
import {buildBusinessMonthView} from '../web/cloudflare/src/business-month-view-state.mjs';
import {buildAdsCalendar} from '../web/cloudflare/src/ads-calendar.mjs';
import {buildAdsMeasurement} from '../web/cloudflare/src/ads-measurement.mjs';
import {COST_DEFAULTS} from '../web/cloudflare/src/production-costs.mjs';
import {createFinanceStore} from '../web/finance/src/connection-store.mjs';
import {runFinanceBusinessPeriod} from '../web/finance/src/business-period.mjs';
import {readIncurredProduction,mutateIncurredProduction} from '../web/cloudflare/src/incurred-production.mjs';
import {readProductionWeeklyClosingWorkspace,mutateProductionWeeklyClosingWorkspace,runProductionWeeklyClosing} from '../web/cloudflare/src/production-weekly-store.mjs';
import {readProductionCoverageWorkspace,mutateProductionCoverageWorkspace} from '../web/cloudflare/src/production-coverage.mjs';

export const WEEKLY_QA_WEEK_END='2026-11-06';
export const WEEKLY_QA_PREVIOUS_END='2026-10-30';
export const WEEKLY_QA_NEXT_END='2026-11-13';
export const WEEKLY_QA_REPORT_PATH='/api/admin/reports/weekly';
export const weeklyQaHash=value=>createHash('sha256').update(value).digest('hex');
const cashPath='/internal/finance/external-cash-v1',cashPeriodPath='/internal/finance/external-cash-period-v1',authOrigin='https://auth.brazacommerce.com.br';
const marker='<aside id="weeklyOperatingQaSynthetic" role="note" style="position:fixed;right:6px;bottom:76px;z-index:99999;max-width:180px;pointer-events:none;padding:6px;background:#fff3cf;color:#342500;border:1px solid #a46a00;font:600 10px system-ui">QA SINTÉTICA · SEM CONEXÃO COM A LOJA</aside>';
const clone=value=>JSON.parse(JSON.stringify(value));

export async function compileWeeklyOperatingQaWorkers(root,minify){
 const entries={};
 for(const name of ['app','auth','finance']){
  const file=path.join(root,'dist',name+'-worker.mjs'),source=readFileSync(file),text=source.toString('utf8');
  assert.ok(text.includes(name==='app'?'weekly_operating_report_v1':cashPeriodPath),'QA_WEEKLY_BUILT_SOURCE_MISSING_'+name);
  const result=await build({entryPoints:[file],bundle:true,write:false,format:'iife',globalName:'WeeklyOperatingQaWorker',platform:'browser',target:'es2022',minify,logLevel:'silent'});
  entries[name]={code:result.outputFiles[0].text,source_sha256:weeklyQaHash(source),compiled_sha256:weeklyQaHash(result.outputFiles[0].text),bytes:source.length};
 }
 entries.app.assets=createLocalBrowserAssets(root);return entries;
}

function runtime(compiled,fetchImpl){
 const timers=new Set(),context=vm.createContext({HostRequest:Request,Response,Headers,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,DataView,AbortController,AbortSignal,ReadableStream,TransformStream,WritableStream,Blob,FormData,File,crypto:webcrypto,btoa,atob,console:Object.freeze({log(){},warn(){},error(){}}),fetch:fetchImpl,
  setTimeout(callback,delay,...args){const timer=setTimeout(()=>{timers.delete(timer);callback(...args);},delay);timers.add(timer);return timer;},clearTimeout(timer){timers.delete(timer);clearTimeout(timer);},setInterval(callback,delay,...args){const timer=setInterval(callback,delay,...args);timers.add(timer);return timer;},clearInterval(timer){timers.delete(timer);clearInterval(timer);},
 },{name:'MLS_WEEKLY_SYNTHETIC_OFFLINE',codeGeneration:{strings:false,wasm:false}});
 // D1 responses are JSON values. Keep their clones in the Worker realm so the
 // production strict-object projectors see the same prototypes as on Workers.
 vm.runInContext('class Request extends HostRequest{async json(){return JSON.parse(await this.text());}};globalThis.Request=Request;globalThis.structuredClone=value=>JSON.parse(JSON.stringify(value));',context);vm.runInContext(compiled.code,context,{timeout:10000});
 const worker=vm.runInContext('WeeklyOperatingQaWorker.default',context),RequestClass=vm.runInContext('Request',context);
 function bridge(db){context.__qaDb=db;try{return vm.runInContext(`(()=>{const host=__qaDb,raw=new WeakMap(),copy=value=>JSON.parse(JSON.stringify(value));return {prepare(sql){let statement=host.prepare(sql);const wrapped={bind(...values){statement=statement.bind(...values);raw.set(wrapped,statement);return wrapped;},async run(){return copy(await statement.run());},async first(){return copy(await statement.first());},async all(){return copy(await statement.all());}};raw.set(wrapped,statement);return wrapped;},async batch(statements){return copy(await host.batch(statements.map(statement=>raw.get(statement))));}};})()`,context);}finally{delete context.__qaDb;}}
 return {bridge,request:(url,options)=>new RequestClass(url,options),fetch:(request,env)=>worker.fetch(request,env,{waitUntil(){}}),close(){for(const timer of timers){clearTimeout(timer);clearInterval(timer);}timers.clear();}};
}
function observedD1(sql){const db=new D1(),prepare=db.prepare.bind(db),batch=db.batch.bind(db);let queue=Promise.resolve();db.prepare=query=>{sql.push(query);return prepare(query);};db.batch=statements=>{const work=queue.then(()=>batch(statements));queue=work.catch(()=>{});return work;};return db;}
const schema=db=>db.db.prepare("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();

// Financial publications are produced by the real Finance collector and App
// orchestrator. Only the three synthetic Shopee read responses and Ads inputs
// below are fixtures. No weekly financial value is fabricated at an HTTP route.
async function seedFinancialPublications(appDb,financeDb){
 const now=()=>Date.now(),stamp=Math.floor(now()/1000),env={ADMIN_DB:appDb},financeEnv={FINANCE_DB:financeDb,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,19).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:'SYNTHETIC_WEEKLY_PARTNER_KEY'},calls=[];
 const store=await createFinanceStore(financeEnv,{now});await store.setup();await store.saveTokens({access_token:'SYNTHETIC_WEEKLY_ACCESS',refresh_token:'SYNTHETIC_WEEKLY_REFRESH',expires_at:stamp+14400});
 appDb.db.prepare('UPDATE variant_bindings_state SET revision=2,payload=?,updated_at=? WHERE id=1').run(JSON.stringify([{item_id:'201',model_id:'0',size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}]),new Date().toISOString());
 appDb.db.prepare('UPDATE production_costs_state SET revision=7,payload=?,updated_at=? WHERE id=1').run(JSON.stringify(COST_DEFAULTS),new Date().toISOString());
 const orders=new Map();
 for(const month of ['2026-10','2026-11'])for(let day=1;day<=(month==='2026-10'?31:11);day++){
  const date=month+'-'+String(day).padStart(2,'0'),serial='QA_WEEKLY_ORDER_'+date.replaceAll('-','');orders.set(serial,{date,serial,index:day,create_time:Date.parse(date+'T12:00:00-03:00')/1000});
 }
 const provider=response=>Response.json({error:'',response});
 const fetchImpl=async request=>{
  const url=new URL(request.url);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(request.method,'GET');calls.push(url.pathname);
  if(url.pathname==='/api/v2/order/get_order_list'){
   const start=Number(url.searchParams.get('time_from')),end=Number(url.searchParams.get('time_to')),offset=Number(url.searchParams.get('cursor')||0),size=Number(url.searchParams.get('page_size')),rows=[...orders.values()].filter(row=>row.create_time>=start&&row.create_time<=end),page=rows.slice(offset,offset+size),more=offset+page.length<rows.length;
   return provider({order_list:page.map(row=>({order_sn:row.serial})),more,next_cursor:more?String(offset+page.length):''});
  }
  if(url.pathname==='/api/v2/order/get_order_detail')return provider({order_list:url.searchParams.get('order_sn_list').split(',').map(serial=>{const row=orders.get(serial);assert.ok(row);return {order_sn:serial,order_status:'COMPLETED',currency:'BRL',create_time:row.create_time,item_list:[{item_id:201,model_id:0,model_quantity_purchased:1}]};})});
  assert.equal(url.pathname,'/api/v2/payment/get_escrow_detail');const row=orders.get(url.searchParams.get('order_sn'));assert.ok(row);const payout=row.date==='2026-11-03'?10:47.51;
  return provider({order_sn:row.serial,return_order_sn_list:[],order_income:{order_sn:row.serial,original_cost_of_goods_sold:65.25,escrow_amount:payout,total_adjustment_amount:0,escrow_amount_after_adjustment:payout,ads_escrow_top_up_fee_or_technical_support_fee:0,items:[{item_id:201,model_id:0,line_item_id:row.index,quantity_purchased:1}]}});
 };
 const services={getFinanceBusinessPeriod:(_,input)=>runFinanceBusinessPeriod(financeEnv,{...input,fetchImpl,now,timeoutMs:5000,includeDaily:true}),getAdsCalendar:async(_,selection)=>{
  const pieces=[],month=selection.start_date.slice(0,7),end=Number(selection.end_date.slice(8));
  for(let first=1;first<=end;first+=15){const last=Math.min(end,first+14),range={start_date:month+'-'+String(first).padStart(2,'0'),end_date:month+'-'+String(last).padStart(2,'0')};pieces.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:range,balance:0,daily:Array.from({length:last-first+1},(_,index)=>({date:month+'-'+String(first+index).padStart(2,'0'),expense:1.25,broad_gmv:12.5,broad_order:1,broad_roas:10,direct_gmv:0,direct_order:0,direct_roas:0}))},range,Math.floor(now()/1000)));}
  return buildAdsCalendar(pieces,selection,Math.floor(now()/1000));
 }};
 const daily=new Map();
 for(const month of ['2026-10','2026-11']){
  await businessMonth(env,{operation:'expenses',month,revision:0,external_expenses_cents:1000,recharge_treatment:'TECH_SUPPORT'},services,{now,actor:'synthetic-weekly-owner'});
  let frame=await businessMonth(env,{operation:'start',month},services,{now});for(let turn=0;frame.status==='RUNNING'&&turn<40;turn++)frame=await businessMonth(env,{operation:'step',month},services,{now});assert.equal(frame.status,'COMPLETE','QA_MONTHLY_COLLECTION_MUST_FINISH');await businessMonth(env,{operation:'ads',month},services,{now});
  const observed=await readBusinessMonthDisplay(env,{month},{now}),view=buildBusinessMonthView(observed,{enabled:true,status:'COMPLETE',next_run_at:Math.floor(now()/1000)+60,last_attempt_at:Math.floor(now()/1000)-5},{now,contract:'business-month-view-v5'});assert.ok(view.daily_summary,'QA_CANONICAL_DAILY_SUMMARY_REQUIRED');daily.set(month,view.daily_summary);
 }
 const selected=[...daily.values()].flatMap(value=>value.days).filter(row=>row.date>='2026-10-30'&&row.date<='2026-11-05');assert.equal(selected.length,7);assert.ok(selected.every(row=>Number.isSafeInteger(row.estimate_cents)));
 return {daily,calls,expected:{sales_estimate_cents:selected.reduce((sum,row)=>sum+row.estimate_cents,0),sales_cents:selected.reduce((sum,row)=>sum+row.sales_cents,0),payout_cents:selected.reduce((sum,row)=>sum+row.payout_cents,0),reference_production_cost_cents:selected.reduce((sum,row)=>sum+row.production_cost_cents,0),ads_spend_cents:selected.reduce((sum,row)=>sum+row.ads_spend_cents,0),allocated_das_cents:selected.reduce((sum,row)=>sum+row.allocated_das_cents,0),allocated_expenses_cents:selected.reduce((sum,row)=>sum+row.allocated_expenses_cents,0),negative_day:'2026-11-03',months:['2026-10','2026-11']}};
}

async function seedManufacturing(appDb){
 const env={ADMIN_DB:appDb};let time=Date.parse('2026-11-06T13:01:00-03:00'),ordinal=0;const now=()=>time,identity={artwork:'QA semanal exclusivamente sintética',color:'Azul',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null};
 const record=async(date,quantity,cost)=>{const frame=await readIncurredProduction(env,{now}),record_id=randomUUID();await mutateIncurredProduction(env,{revision:frame.revision,request_id:randomUUID(),action:'record',record_id,production_ref:'QA SEMANAL '+(++ordinal),replaces_record_id:null,produced_date:date,quantity,identity:{...identity},source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:cost,reference:null},evidence:'Fabricação e custo histórico declarados apenas na base efêmera de QA',confirmed:true},'synthetic-weekly-owner',{now});return record_id;};
 const assign=async(record_id,before,after)=>{const month=record_id===priorFriday?'2026-10':'2026-11',view=await readProductionWeeklyClosingWorkspace(env,{month},{now}),row=view.boundary_records.find(row=>row.record_id===record_id);assert.ok(row);await mutateProductionWeeklyClosingWorkspace(env,{action:'assign_boundary',month,request_id:randomUUID(),revision:view.revision,ledger_revision:view.source.ledger_revision,record_id,record_hash:row.record_hash,before13_quantity:before,at_or_after13_quantity:after,confirmed:true,reason:'Divisão sintética das peças nos dois lados do corte de13h'},'synthetic-weekly-owner',{now});};
 const priorFriday=await record('2026-10-30',5,1000),weekday=await record('2026-11-02',4,1350),closingFriday=await record('2026-11-06',4,1200);await assign(priorFriday,2,3);await assign(closingFriday,1,3);
 time=Date.parse('2026-11-06T13:10:05-03:00');for(let turn=0;turn<3;turn++)await runProductionWeeklyClosing(env,{now});
 let view=await readProductionWeeklyClosingWorkspace(env,{month:'2026-11'},{now}),original=view.weeks.find(row=>row.end_date===WEEKLY_QA_WEEK_END).original;assert.equal(original.total_cost_cents,9600);
 const revisionTick=Math.floor((Date.now()-6000)/600000)*600000+5000;time=revisionTick-1000;const ledger=await readIncurredProduction(env,{now});await mutateIncurredProduction(env,{revision:ledger.revision,request_id:randomUUID(),action:'void',record_id:weekday,reason:'Correção exclusivamente sintética após o primeiro fechamento'},'synthetic-weekly-owner',{now});await record('2026-11-02',4,1450);
 time=revisionTick;for(let turn=0;turn<4;turn++)await runProductionWeeklyClosing(env,{now});time=Date.now();
 await record('2026-11-09',2,null);
 for(let index=0;index<8;index++){const coverage=await readProductionCoverageWorkspace(env,{week_end:WEEKLY_QA_WEEK_END},{now}),row=coverage.intervals[index];await mutateProductionCoverageWorkspace(env,{action:'confirm',week_end:WEEKLY_QA_WEEK_END,interval_key:row.key,source_hash:row.source_hash,revision:coverage.revision,ledger_revision:coverage.source.ledger_revision,timing_revision:coverage.source.timing_revision,request_id:randomUUID(),mode:row.recorded.quantity?'ALL_RECORDED':'NO_MANUFACTURING',reason:'Declaração de completude exclusivamente sintética',confirmed:true},'synthetic-weekly-owner',{now});}
 const coverage=await readProductionCoverageWorkspace(env,{week_end:WEEKLY_QA_WEEK_END},{now});view=await readProductionWeeklyClosingWorkspace(env,{month:'2026-11'},{now});const selected=view.weeks.find(row=>row.end_date===WEEKLY_QA_WEEK_END);assert.equal(coverage.summary.state,'CONFIRMED');assert.equal(coverage.summary.total_cost_cents,10000);assert.equal(selected.original.total_cost_cents,9600);assert.equal(selected.latest.total_cost_cents,10000);
 return {original:clone(original),expected:{manufacturing_cents:10000,original_cents:9600,latest_cents:10000,quantity:8,confirmed_intervals:8}};
}

export async function startWeeklyOperatingQaFixture(compiled,{blockedAssetId=null}={}){
 assert.ok(blockedAssetId===null||compiled.app.assets.manifest.assets.some(row=>row.id===blockedAssetId));
 const appSql=[],financeSql=[],appDb=observedD1(appSql),financeDb=observedD1(financeSql),requests=[],privateHops=[],assetReads=[],blockedOutbound=[],failures=[];
 let origin='',cookie='',csrf='',closed=false,cashUnavailable=false,failNext=false,held=null;const releases=[];
 const secret='SYNTHETIC_WEEKLY_APP_'+'a'.repeat(40),routerSecret='SYNTHETIC_WEEKLY_ROUTER_'+'b'.repeat(40);
 const denied=async input=>{blockedOutbound.push(new URL(input.url??input).pathname);throw Error('QA_PROVIDER_DISABLED');};
 const finance=runtime(compiled.finance,denied),financeEnv={FINANCE_DB:finance.bridge(financeDb),FINANCE_ROUTER_SECRET:routerSecret};
 const auth=runtime(compiled.auth,denied),authEnv={APP_INTERNAL_SECRET:secret,FINANCE_ROUTER_SECRET:routerSecret,SHOPEE_FINANCE_SERVICE:{async fetch(request){const url=new URL(request.url);assert.equal(url.origin,authOrigin);assert.ok([cashPath,cashPeriodPath].includes(url.pathname));privateHops.push({stage:'AUTH_TO_FINANCE',path:url.pathname});if(cashUnavailable&&url.pathname===cashPeriodPath)throw Error('SYNTHETIC_CASH_SOURCE_UNAVAILABLE');return finance.fetch(finance.request(request.url,{method:request.method,headers:request.headers,body:await request.arrayBuffer(),redirect:'manual'}),financeEnv);}}};
 const app=runtime(compiled.app,async(input,init)=>{const request=input instanceof Request&&init===undefined?input:new Request(input,init),url=new URL(request.url);if(url.origin!==authOrigin||![cashPath,cashPeriodPath].includes(url.pathname)||request.method!=='POST')return denied(request);privateHops.push({stage:'APP_TO_AUTH',path:url.pathname});return auth.fetch(auth.request(request.url,{method:request.method,headers:request.headers,body:await request.arrayBuffer(),redirect:'manual'}),authEnv);});
 const flags={MLS_V36_OWNER_PREVIEW:'ENABLED',MLS_AI_SALES_OWNER_PREVIEW:'ENABLED'};
 const env={ASSETS:{async fetch(request){const requested=new URL(request.url).pathname;assetReads.push(requested);if(compiled.app.assets.manifest.assets.find(row=>row.id===blockedAssetId)?.path===requested)return new Response(null,{status:503});return compiled.app.assets.fetch(request);}},ADMIN_DB:app.bridge(appDb),APP_INTERNAL_SECRET:secret,ADMIN_USERNAME:'synthetic-weekly-owner',ADMIN_PASSWORD:'SYNTHETIC_WEEKLY_PASSWORD',ADMIN_SESSION_SECRET:'SYNTHETIC_WEEKLY_SESSION_'+'c'.repeat(48),...flags};
 const dispatch=(route,{method='GET',headers={},body}={})=>app.fetch(app.request(origin+route,{method,headers:{cookie,...headers},...(body!==undefined?{body}:{})}),env);
 const cashCommand=body=>dispatch('/api/admin/finance/external-cash',{method:'POST',headers:{origin,'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});
 const report=async(week_end=WEEKLY_QA_WEEK_END)=>{const response=await dispatch(WEEKLY_QA_REPORT_PATH+'?week_end='+week_end);assert.equal(response.status,200,'QA_COMPILED_WEEKLY_READ_REQUIRED');return response.json();};
 async function seedCash(){
  const bank=[{line:2,date:'2026-11-01',amount_cents:15050,external_id:'QA_WEEKLY_BANK_MATCH',reference:'QA_WEEKLY_REF',description:'Crédito sintético entre meses',reported_status:null},...Array.from({length:105},(_,index)=>({line:index+3,date:'2026-11-02',amount_cents:100,external_id:'QA_WEEKLY_BANK_'+index,reference:null,description:'Crédito sintético de arquivo, além da primeira página',reported_status:null})),{line:108,date:'2026-11-03',amount_cents:-2500,external_id:'QA_WEEKLY_DEBIT',reference:null,description:'Débito sintético independente',reported_status:null},{line:109,date:'2026-11-04',amount_cents:0,external_id:'QA_WEEKLY_ZERO',reference:null,description:'Zero explícito de arquivo sintético',reported_status:null},{line:110,date:'2026-11-06',amount_cents:900,external_id:'QA_WEEKLY_NEXT_CREDIT',reference:null,description:'Crédito sintético na semana seguinte',reported_status:null}],transfer=[{line:2,date:'2026-10-31',amount_cents:15050,external_id:'QA_WEEKLY_TRANSFER_MATCH',reference:'QA_WEEKLY_REF',description:'Transferência sintética entre meses',reported_status:null},{line:3,date:'2026-11-04',amount_cents:2000,external_id:'QA_WEEKLY_TRANSFER_UNMATCHED',reference:null,description:'Transferência sintética ainda sem vínculo',reported_status:null}];
  for(const [source,rows]of [['NUBANK',bank],['SHOPEE',transfer]]){const base={schema:'external_cash_request_v1',source,bank_account_declared:true,completed_transfers_declared:source==='SHOPEE',document_hash:weeklyQaHash('QA_WEEKLY_SYNTHETIC_DOCUMENT_'+source),selection:{format:source==='SHOPEE'?'shopee_csv':'nubank_csv',date_format:'YMD',amount_format:'DECIMAL'},rows};let response=await cashCommand({...base,operation:'preview',cursor:null,limit:100});assert.equal(response.status,200);const preview=await response.json();response=await cashCommand({...base,operation:'import',request_id:randomUUID(),expected_revision:preview.revision,preview_hash:preview.preview_hash,confirmed:true});assert.equal(response.status,200);}
  const values=financeDb.db.prepare('SELECT record_id,external_id FROM finance_external_cash_records').all(),record=external=>values.find(row=>row.external_id===external).record_id,revision=financeDb.db.prepare('SELECT revision FROM finance_external_cash_state').get().revision;
  const matched=await cashCommand({schema:'external_cash_request_v1',operation:'match',request_id:randomUUID(),expected_revision:revision,confirmed:true,reason:'Vínculo entre meses exclusivamente sintético confirmado pelo operador de QA',pairs:[{bank_record_id:record('QA_WEEKLY_BANK_MATCH'),transfer_record_id:record('QA_WEEKLY_TRANSFER_MATCH')}]});assert.equal(matched.status,200);
  return {bank_credit_cents:25550,bank_debit_cents:2500,bank_records:108,matched_bank_cents:15050,transfer_cents:17050,matched_transfer_cents:15050};
 }
 const server=http.createServer(async(request,response)=>{try{
  assert.equal(request.headers.host,new URL(origin).host);const url=new URL(request.url,origin),method=request.method??'GET';if(url.pathname==='/favicon.ico'){response.writeHead(204);response.end();return;}
  assert.ok(['/admin','/login','/admin/logout'].includes(url.pathname)||url.pathname.startsWith('/api/admin/')||url.pathname.startsWith('/assets/mls/'));
  let body;if(!['GET','HEAD'].includes(method)){const chunks=[];let bytes=0;for await(const chunk of request){bytes+=chunk.length;assert.ok(bytes<=524288);chunks.push(chunk);}body=Buffer.concat(chunks);}
  const log={path:url.pathname,query:url.pathname===WEEKLY_QA_REPORT_PATH?url.search:null,method};requests.push(log);const headers={};for(const [name,value]of Object.entries(request.headers))if(value!==undefined&&!['host','cookie','connection','content-length'].includes(name))headers[name]=Array.isArray(value)?value.join(','):value;
  const result=await dispatch(url.pathname+url.search,{method,headers,body});log.status=result.status;if(url.pathname==='/admin/logout'&&method==='POST'&&result.status===204)cookie='';
  if(url.pathname===WEEKLY_QA_REPORT_PATH&&held){const hold=held;held=null;hold.started();await hold.wait;log.delayed_response_released=true;}
  if(url.pathname===WEEKLY_QA_REPORT_PATH&&failNext){failNext=false;await result.arrayBuffer();log.synthetic_transport_failure=true;response.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});response.end(JSON.stringify({error:'SYNTHETIC_WEEKLY_TRANSPORT_UNAVAILABLE'}));return;}
  const responseHeaders=Object.fromEntries(result.headers);delete responseHeaders['content-length'];delete responseHeaders['set-cookie'];let bytes=Buffer.from(await result.arrayBuffer());if(responseHeaders['content-type']?.startsWith('text/html'))bytes=Buffer.from(bytes.toString('utf8').replace(/<body\b[^>]*>/i,'$&'+marker));response.writeHead(result.status,responseHeaders);response.end(bytes);
 }catch(error){failures.push(String(error?.message??error));if(!response.headersSent)response.writeHead(500,{'content-type':'application/json'});response.end(JSON.stringify({error:'SYNTHETIC_WEEKLY_QA_FAILED'}));}});
 async function close(){if(closed)return;closed=true;for(const release of releases)release();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));for(const worker of [app,auth,finance])worker.close();appDb.db.close();financeDb.db.close();}
 try{
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin='http://127.0.0.1:'+server.address().port;
  const login=await dispatch('/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})});assert.equal(login.status,303);cookie=login.headers.getSetCookie().find(value=>value.startsWith('braza_admin='))?.split(';')[0];assert.ok(cookie);const bootstrap=await dispatch('/api/admin/bootstrap');assert.equal(bootstrap.status,200);csrf=(await bootstrap.json()).csrf;
  const before=JSON.stringify([schema(appDb),schema(financeDb)]);appSql.length=0;financeSql.length=0;const cold=await report();assert.equal(cold.schema,'weekly_operating_report_v1');assert.equal(JSON.stringify([schema(appDb),schema(financeDb)]),before);assert.ok([...appSql,...financeSql].every(sql=>/^\s*(SELECT|WITH)\b/i.test(sql)),'QA_WEEKLY_COLD_GET_MUST_BE_SELECT_ONLY');const coldGet={schema_unchanged:true,select_only:true,app_queries:appSql.length,finance_queries:financeSql.length};
  const state=await dispatch('/api/admin/state');assert.equal(state.status,200);const financial=await seedFinancialPublications(appDb,financeDb),manufacturing=await seedManufacturing(appDb),cash=await seedCash();
  return {origin,requests,privateHops,assetReads,blockedOutbound,failures,coldGet,flags,assets:compiled.app.assets.manifest,expected:{...financial.expected,...manufacturing.expected,cash},seed_evidence:{financial:'REAL_FINANCE_COLLECTOR_AND_APP_PUBLICATIONS_WITH_SYNTHETIC_UPSTREAM',manufacturing:'CANONICAL_LEDGER_BOUNDARY_COVERAGE_AND_CLOSING_MUTATORS_SYNTHETIC_ONLY',manufacturing_original_capture_kind:manufacturing.original.capture_kind,cash:'REAL_COMPILED_APP_AUTH_FINANCE_FILE_IMPORT_AND_MATCH',synthetic_provider_inputs:financial.calls.length},report,close,
   cashUnavailable(value=true){cashUnavailable=value;},failNextReport(){failNext=true;},
   holdNextReport(){assert.equal(held,null);let started,release;const began=new Promise(resolve=>{started=resolve;}),wait=new Promise(resolve=>{release=resolve;});held={started,wait};releases.push(release);return {started:began,release};},
   async assertReadOnly(){const changes=[appDb.db.prepare('SELECT total_changes() n').get().n,financeDb.db.prepare('SELECT total_changes() n').get().n],schemas=JSON.stringify([schema(appDb),schema(financeDb)]);appSql.length=0;financeSql.length=0;const value=await report();assert.deepEqual([appDb.db.prepare('SELECT total_changes() n').get().n,financeDb.db.prepare('SELECT total_changes() n').get().n],changes);assert.equal(JSON.stringify([schema(appDb),schema(financeDb)]),schemas);assert.ok([...appSql,...financeSql].every(sql=>/^\s*(SELECT|WITH)\b/i.test(sql)));return value;},
   financialSourceSnapshot(){return JSON.stringify({headers:appDb.db.prepare('SELECT * FROM business_month_publications ORDER BY month').all(),frames:appDb.db.prepare('SELECT * FROM business_month_publication_frames ORDER BY month,slot_index').all()});},
   removePublication(month){assert.ok(['2026-10','2026-11'].includes(month));const header=appDb.db.prepare('SELECT * FROM business_month_publications WHERE month=?').get(month),frames=appDb.db.prepare('SELECT * FROM business_month_publication_frames WHERE month=? ORDER BY slot_index').all(month);assert.ok(header);appDb.db.exec('BEGIN');try{appDb.db.prepare('DELETE FROM business_month_publication_frames WHERE month=?').run(month);appDb.db.prepare('DELETE FROM business_month_publications WHERE month=?').run(month);appDb.db.exec('COMMIT');}catch(error){appDb.db.exec('ROLLBACK');throw error;}return ()=>{appDb.db.exec('BEGIN');try{for(const [table,rows]of [['business_month_publications',[header]],['business_month_publication_frames',frames]])for(const row of rows){const keys=Object.keys(row);appDb.db.prepare('INSERT INTO '+table+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').run(...keys.map(key=>row[key]));}appDb.db.exec('COMMIT');}catch(error){appDb.db.exec('ROLLBACK');throw error;}};},
  };
 }catch(error){await close();throw error;}
}
