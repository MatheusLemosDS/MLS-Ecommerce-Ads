import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {build} from 'esbuild';
import {projectProductRegistryFrame} from '../src/product-registry.mjs';
import {fileURLToPath} from 'node:url';

const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
const workerPath=fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url));

async function compiledWorker(){
 const compiled=await build({entryPoints:[workerPath],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 return (await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'))).default;
}
async function chromeDump(url){
 const args=['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking',
 '--no-first-run','--no-default-browser-check','--disable-extensions','--window-size=420,950',
 '--virtual-time-budget=2800','--dump-dom',url];
 return new Promise((resolve,reject)=>{
  const child=spawn(chrome,args,{stdio:['ignore','pipe','pipe']});
  const chunks=[];let size=0;
  child.stdout.on('data',data=>{size+=data.length;if(size<12*1024*1024)chunks.push(data);});
  let stderr='';
  child.stderr.on('data',data=>{if(stderr.length<8192)stderr+=data.toString().slice(0,500);});
  const watchdog=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Chrome timeout'));},35000);
  child.on('error',error=>{clearTimeout(watchdog);reject(error);});
  child.on('close',(status)=>{clearTimeout(watchdog);if(status!==0)return reject(Error('Chrome exited '+status+': '+stderr.slice(0,400)));resolve(Buffer.concat(chunks).toString());});
 });
}

test('real Chromium hydrates owner agent cards even when finance API is unavailable',{timeout:90000},async t=>{
 if(!chrome)return t.skip('Chrome executable not installed on CI runner');
 const worker=await compiledWorker();
 const env={ADMIN_USERNAME:'owner-browser-test',ADMIN_PASSWORD:'owner-browser-test-password',
  ADMIN_SESSION_SECRET:'owner-browser-test-session-'+ 'x'.repeat(40)};
 const login=await worker.fetch(new Request('https://app.browser.fixture/login',{method:'POST',
  headers:{origin:'https://app.browser.fixture','content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(login.status,303);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const admin=await worker.fetch(new Request('https://app.browser.fixture/admin',{headers:{cookie}}),env);
 assert.equal(admin.status,200);
 let html=await admin.text();
 // Set the synthetic test browser's theme preference before the real head bootstrap.
 html=html.replace('<head>','<head><script>try{localStorage.setItem("braza-theme","dark")}catch(e){}</script>');
 const errorScript='<script>document.documentElement.setAttribute("data-mls-early","YES");window.__mlsErrors=[];window.addEventListener("error",e=>window.__mlsErrors.push(String(e.message||"ERROR").slice(0,250)));window.addEventListener("unhandledrejection",e=>window.__mlsErrors.push(String(e.reason?.message||e.reason||"REJECTION").slice(0,250)));setTimeout(()=>document.documentElement.setAttribute("data-mls-runtime-errors",JSON.stringify(window.__mlsErrors)),2200);</script>';
 const snapshotScript='<script>document.documentElement.setAttribute("data-mls-late","YES");document.documentElement.dataset.theme="dark";document.documentElement.dataset.themePreference="dark";try{(()=>{function snapshot(){const root=document.getElementById("commandCenterAgents");const trace={registry:typeof globalThis.mlsAgentRegistry,agent_count:root?.children.length||0,fallback_count:root?.querySelectorAll("[data-agent-placeholder=true]").length||0,registry_status:globalThis.mlsAgentRegistry?.getSnapshot?.()?.schema||"MISSING",net_value:(document.getElementById("commandCenterNet")?.textContent||"").slice(0,25),bootstrap_status:(document.getElementById("message")?.textContent||"").slice(0,100),visual:{theme:document.documentElement.dataset.theme,hero_bg:getComputedStyle(document.querySelector(".mission-command-hero")).backgroundImage.slice(0,180),hero_height:getComputedStyle(document.querySelector(".mission-command-hero")).minHeight,agent_bg:root?.firstElementChild?getComputedStyle(root.firstElementChild).backgroundImage.slice(0,180):"NONE",agent_avatar:root?.firstElementChild?getComputedStyle(root.firstElementChild,"::before").content:"NONE",bars:[...document.querySelectorAll(".mission-comparison-track span")].map(item=>item.style.width),visual_panels:document.querySelectorAll(".mission-data-panel").length,metric_columns:getComputedStyle(document.querySelector(".command-center-metrics")).gridTemplateColumns,source_visible:document.getElementById("missionSourceState")?.hidden===false,source_title:document.getElementById("missionSourceTitle")?.textContent||"",collection_detail:(document.getElementById("missionCollectorStatus")?.textContent||"").slice(0,220),priority_hidden:document.getElementById("missionSourcePriority")?.hidden??null},errors:window.__mlsErrors.slice(0,3)};document.documentElement.dataset.mlsHydrationTrace=JSON.stringify(trace);}snapshot();setTimeout(snapshot,200);setTimeout(snapshot,1000);setTimeout(snapshot,2400);})();}catch(e){document.documentElement.setAttribute("data-mls-snapshot-error",String(e?.message||e).slice(0,220));}</script>';
 html=html.replace('<body>','<body><script>document.documentElement.dataset.theme="dark";document.documentElement.dataset.themePreference="dark";</script>'+errorScript);
 const closing=html.lastIndexOf('</body>');assert.ok(closing>0,'must inject inspector after every bundled inline script');
 html=html.slice(0,closing)+snapshotScript+html.slice(closing);

 const syntheticRows=[
  {date:'2026-10-25',state:'OPERATIONAL',net_basis:'ESTIMATE',net_cents:5000,sales_cents:30000,ads_spend_cents:3500,paid_orders:8,partial:false,comparable:true},
  {date:'2026-10-26',state:'OPERATIONAL',net_basis:'ESTIMATE',net_cents:-5000,sales_cents:35000,ads_spend_cents:4000,paid_orders:9,partial:false,comparable:true},
  {date:'2026-10-27',state:'OPERATIONAL',net_basis:'ESTIMATE',net_cents:-2500,sales_cents:20000,ads_spend_cents:1500,paid_orders:4,partial:true,comparable:false}
 ];
 const syntheticTrend={schema:'mls_mission_daily_trend_v1',month:'2026-10',selected_date:'2026-10-27',points:syntheticRows};
 const fixtureScript='<script>(()=>{try{const trend='+JSON.stringify(syntheticTrend)+
  ';globalThis.brazaDayDashboard={getTrend:()=>trend};'+
  'globalThis.mlsAgentRegistry={getSnapshot:()=>({day:{net_cents:-2500},month:{balance_cents:-50000}})};'+
  'globalThis.mlsMissionTrends.refresh();'+
  'const report={overview_svg:document.querySelectorAll("#missionTrendGraphOverview svg").length,'+
  'finance_svg:document.querySelectorAll("#missionTrendGraphFinance svg").length,ads_svg:document.querySelectorAll("#missionTrendGraphAds svg").length,'+
  'points:document.querySelectorAll("#missionTrendGraphOverview circle").length,'+
  'net_badge:document.getElementById("missionKpiDeltaNet")?.textContent,'+
  'sales_badge:document.getElementById("missionKpiDeltaSales")?.textContent,'+
  'ads_badge:document.getElementById("missionKpiDeltaAds")?.textContent,'+
  'chart_tab_direction:getComputedStyle(document.querySelector(".mission-trend-controls")).flexDirection,'+
  'chart_title:document.getElementById("missionTrendTitleOverview")?.textContent,'+
  'net_color:getComputedStyle(document.getElementById("missionKpiDeltaNet")).color,'+
  'sales_color:getComputedStyle(document.getElementById("missionKpiDeltaSales")).color,'+
  'ads_color:getComputedStyle(document.getElementById("missionKpiDeltaAds")).color,'+
  'net_tone:document.querySelector("[data-mission-metric=net]")?.dataset.resultTone,'+
  'finance_tone:document.getElementById("mission-finance-metric-0")?.dataset.resultTone,'+
  'profit_label:document.getElementById("missionProfitState")?.textContent,'+
  'errors:window.__mlsErrors.slice(0,4)};'+
  'document.documentElement.dataset.mlsTrendFixture=JSON.stringify(report);'+
  '}catch(e){document.documentElement.dataset.mlsTrendFixtureError=String(e?.message||e).slice(0,250);}})();</script>';

 const agentsFixtureScript="<script>(()=>{try{\n const catalog={schema:\"mls_agent_catalog_snapshot_v1\",total:345,indexed:300,pending_catalog:45,checked_at:1793200000,discovery_status:\"IDLE\"};\n const dtf={schema:\"mls_agent_dtf_queue_v1\",line_count:10,pending_lines:4,reserved_lines:2,produced_lines:3,blocked_lines:1,batch_count:2};\n if(globalThis.brazaSavedCatalog)globalThis.brazaSavedCatalog.getSnapshot=()=>catalog;\n if(globalThis.brazaDtfWorkspace)globalThis.brazaDtfWorkspace.getSnapshot=()=>dtf;\n globalThis.mlsAgentRegistry?.notify?.();\n setTimeout(()=>{const opener=document.getElementById('missionSearchOpen');opener?.click();const search=document.getElementById('missionSearchInput');if(search){search.value='dtf';search.dispatchEvent(new Event('input',{bubbles:true}));}const snapshot=globalThis.mlsAgentRegistry?.getSnapshot?.();document.documentElement.dataset.mlsAgentSourcesFixture=JSON.stringify({catalog:snapshot?.sources?.catalog?.total,dtf:snapshot?.sources?.dtf_queue?.pending_lines,products:document.getElementById(\"mission-products-metric-0\")?.textContent,production:document.getElementById(\"mission-production-metric-0\")?.textContent,catalog_chart:document.getElementById(\"mission-products-evidence\")?.dataset.evidenceSource,queue_chart:document.getElementById(\"mission-production-evidence\")?.dataset.evidenceSource,catalog_chart_rows:document.querySelectorAll(\"#mission-products-evidence .mission-evidence-row\").length,queue_chart_rows:document.querySelectorAll(\"#mission-production-evidence .mission-evidence-row\").length,search_open:document.getElementById('missionGlobalSearch')?.hidden===false,search_titles:[...document.querySelectorAll('#missionSearchResults .mission-search-result strong')].map(el=>el.textContent),search_destinations:[...document.querySelectorAll('#missionSearchResults .mission-search-result')].map(el=>new URL(el.href).searchParams.get('tab')),errors:window.__mlsErrors.slice(0,4)});},350);\n\n setTimeout(async()=>{try{\n  const palette=globalThis.mlsWorkspaceSearch,input=document.getElementById('missionSearchInput');\n  if(!palette||!input)throw Error('PALETTE_MISSING');\n  const originalFetch=globalThis.fetch.bind(globalThis);\n  globalThis.fetch=async (...args)=>{\n   const response=await originalFetch(...args);\n   if(String(args[0]).includes('search=Camiseta')){\n    document.documentElement.dataset.mlsMockHttpStatus=String(response.status);\n    response.clone().json().then(value=>{\n     document.documentElement.dataset.mlsMockResponseSchema=String(value?.schema||'none');\n     document.documentElement.dataset.mlsMockResponseValid=String(!!globalThis.projectProductRegistryFrame?.(value));\n    }).catch(()=>{document.documentElement.dataset.mlsMockResponseSchema='parse-failed';});\n   }\n   return response;\n  };\n  palette.scope('products');input.value='Camiseta';input.dispatchEvent(new Event('input',{bubbles:true}));\n  document.getElementById('missionSearchExecute').click();\n  await new Promise(resolve=>setTimeout(resolve,230));\n  const firstCount=document.querySelectorAll('#missionSearchResults .mission-search-result').length;\n  const firstMessage=(document.getElementById('missionSearchResults')?.textContent||'').slice(0,230);\n  const firstScope=(document.getElementById('missionSearchScope')?.textContent||'').slice(0,230);\n  const firstKind=document.querySelector('#missionSearchResults .mission-search-empty')?.dataset.searchFailure||null;\n  const firstMore=document.getElementById('missionSearchMore').hidden===false;\n  document.getElementById('missionSearchMore').click();\n  await new Promise(resolve=>setTimeout(resolve,230));\n  const lastTitle=document.querySelector('#missionSearchResults .mission-search-result strong')?.textContent||'';\n  const lastLink=document.querySelector('#missionSearchResults .mission-search-result');\n  lastLink?.click();\n  await new Promise(resolve=>setTimeout(resolve,65));\n  const productPanel=document.documentElement.dataset.activePanel;\n  const productFilter=document.getElementById('savedCatalogSearch')?.value||'';\n  const dtf=globalThis.brazaDtfWorkspace;\n  if(!dtf)throw Error('DTF_MISSING');\n  dtf.searchLines=(query,offset)=>({schema:'mls_saved_dtf_search_v1',total:1,offset,limit:8,more:false,rows:[\n   {order_id:'998877',sku:'AB123-ESTAMPA',item_id:'700009',model_name:'M',production_state:'PENDING',quantity:2}\n  ]});\n  dtf.findLine=id=>{document.documentElement.dataset.mlsSelectedOrder=id;return true;};\n  palette.open();palette.scope('dtf');input.value='AB123';input.dispatchEvent(new Event('input',{bubbles:true}));\n  document.getElementById('missionSearchExecute').click();\n  await new Promise(resolve=>setTimeout(resolve,80));\n  const orderTitle=document.querySelector('#missionSearchResults .mission-search-result strong')?.textContent||'';\n  document.querySelector('#missionSearchResults .mission-search-result')?.click();\n  await new Promise(resolve=>setTimeout(resolve,50));\n  document.documentElement.dataset.mlsRecordSearchFixture=JSON.stringify({\n   firstCount,firstMessage,firstScope,firstKind,mockHttp:document.documentElement.dataset.mlsMockHttpStatus,mockSchema:document.documentElement.dataset.mlsMockResponseSchema,mockValid:document.documentElement.dataset.mlsMockResponseValid,validatorType:typeof globalThis.projectProductRegistryFrame,firstMore,lastTitle,productPanel,productFilter,orderTitle,\n   dtfPanel:document.documentElement.dataset.activePanel,selectedOrder:document.documentElement.dataset.mlsSelectedOrder,\n   errors:window.__mlsErrors.slice(0,4)\n  });\n }catch(error){document.documentElement.dataset.mlsRecordSearchError=String(error?.message||error).slice(0,260);}},600);\n }catch(error){document.documentElement.dataset.mlsAgentSourcesError=String(error?.message||error).slice(0,200)}})();</script>";
 const financeAuthFixtureScript="<script>(()=>{try{\n const prior=globalThis.brazaMonthDashboard;\n globalThis.brazaMonthDashboard={\n   getSnapshot:()=>prior?.getSnapshot?.()??null,\n   getSourceStatus:()=>({schema:'mls_finance_source_coverage_v1',collection_code:'BUSINESS_PERIOD_AUTH_REQUIRED'})\n };\n globalThis.mlsAgentRegistry?.refresh?.();\n const box=document.getElementById('missionFinanceAuthRecovery');\n document.documentElement.dataset.mlsFinanceAuthFixture=JSON.stringify({\n  visible:box?.hidden===false,\n  links:[...(box?.querySelectorAll('a')||[])].map(a=>({href:a.href,target:a.target,rel:a.rel})),\n  errors:window.__mlsErrors?.slice(0,3)||[]\n });\n }catch(e){document.documentElement.dataset.mlsFinanceAuthFixtureError=String(e?.message||e).slice(0,200)}})();</script>";
 const requests=[];
 const server=http.createServer((request,response)=>{
  const path=(request.url||'/').split('?')[0];
  requests.push(request.url||path);
  response.setHeader('Cache-Control','no-store');
  if(path==='/admin'){
   response.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
    'Content-Security-Policy':admin.headers.get('content-security-policy')||"default-src 'self'; script-src 'self' 'unsafe-inline';"});
   response.end((request.url||'').includes('mlsFixture=trend')?html.replace('</body>',fixtureScript+'</body>'):(request.url||'').includes('mlsFixture=agents')?html.replace('</body>',agentsFixtureScript+'</body>'):(request.url||'').includes('mlsFixture=financeAuth')?html.replace('</body>',financeAuthFixtureScript+'</body>'):html);

  }else if(path==='/api/admin/product-registry'&&new URL(request.url||'/', 'http://localhost').searchParams.get('search')==='Camiseta'){
   const params=new URL(request.url,'http://localhost').searchParams,offset=Number(params.get('offset')||0),end=Math.min(9,offset+8);
   const products=Array.from({length:Math.max(0,end-offset)},(_,index)=>{
    const item=700001+offset+index;
    return {item_id:String(item),item_status:'NORMAL',product_name:'Camiseta Modelo '+String(offset+index+1),
     source_update_time:null,last_seen_at:1793200000,catalog_checked_at:1793200000,
     catalog_status:'MATCHED',model_count:1,resolved_count:1,metadata_changed:false};
   });
   response.setHeader('Content-Type','application/json');
   const frame={schema:'product_registry_v1',checked_at:1793200000,revision:1,
    counts:{total:9,indexed:9,pending_catalog:0},
    discovery:{status:'IDLE',item_status:'NORMAL',offset:0,pages_read:1,last_attempt_at:null,last_success_at:1793200000,
     next_run_at:0,last_error:null,complete:true},
    pagination:{limit:8,offset,total:9,more:offset+8<9},products};
   assert.ok(projectProductRegistryFrame(frame),'fixture is a valid saved catalog response');
   response.end(JSON.stringify(frame));
  }else if(path==='/api/admin/bootstrap'){
   response.setHeader('Content-Type','application/json');
   response.end(JSON.stringify({schema:'admin_bootstrap_v1',csrf:'a'.repeat(64)}));
  }else{
   response.setHeader('Content-Type','application/json');
   response.writeHead(503);
   response.end(JSON.stringify({error:'ADMIN_UNAVAILABLE'}));
  }
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const url='http://127.0.0.1:'+server.address().port+'/admin';
  const output=await chromeDump(url);
  const encoded=output.match(/data-mls-hydration-trace="([^"]+)"/);
  if(!encoded){const pos=output.indexOf('id="commandCenterAgents"');console.log('MLS_BROWSER_MISSING_TRACE',JSON.stringify({html_bytes:html.length,output_bytes:output.length,early:output.includes('data-mls-early="YES"'),late:output.includes('data-mls-late="YES"'),runtime_errors:output.match(/data-mls-runtime-errors="([^"]*)"/)?.[1]?.slice(0,400)||null,snapshot_error:output.match(/data-mls-snapshot-error="([^"]*)"/)?.[1]?.slice(0,260)||null,agents_markup:output.slice(pos,pos+1300),tail:output.slice(-190)}));}
  assert.ok(encoded,'Chrome must run trailing DOM inspection');
  const decode=encoded[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&#39;',"'");
  const trace=JSON.parse(decode);
  console.log('MLS_AGENT_BROWSER_TRACE',JSON.stringify({browser:'headless-chrome',trace,api_requests:[...new Set(requests)]}));
  assert.equal(trace.registry,'object','inline agent script must run in real Chromium');
  assert.equal(trace.registry_status,'mls_agent_registry_v1');
  assert.equal(trace.agent_count,6);
  assert.equal(trace.fallback_count,0,'static placeholders must be replaced after script hydration');
  assert.equal(trace.net_value,'—','no financial number may be fabricated');
  assert.equal(trace.visual.theme,'dark','approved Mission Control theme must be inspected in dark mode');
  assert.match(trace.visual.hero_bg,/gradient/i,'Mission Control hero must be styled with multi-tone spatial gradient');
  assert.match(trace.visual.agent_bg,/gradient/i,'real agent cards need colored gradient surfaces');
  assert.ok(trace.visual.agent_avatar&&!['none','normal','NONE'].includes(trace.visual.agent_avatar),'robotic avatar must be visible');
  assert.equal(trace.visual.visual_panels,2,'verified day + agent status analytics must exist on home');
  assert.equal(trace.visual.metric_columns.trim().split(/\s+/).length,2,'narrow real Chromium viewport must show two KPI columns');
  assert.equal(trace.visual.source_visible,true,'missing financial readings must expose a useful source state');
  assert.match(trace.visual.collection_detail,/Progresso da coleta|Janelas financeiras|Coleta/,'missing data should explain collector progress state');
  assert.equal(trace.visual.priority_hidden,true,'no validated automatic policy means no priority request');
  assert.match(trace.visual.source_title,/Resumo financeiro|Sem leitura financeira|Coleta financeira/);
  assert.deepEqual(trace.visual.bars,['0%','0%','0%'],'finance failure must never create decorative fake numeric bars');

  assert.deepEqual(trace.errors,[]);
  // Real-browser synthetic fixture checks actual visual encoding of verified
  // negative profit, consecutive day change and missing cross-day exaggeration.
  const example=await chromeDump(url+'?mlsFixture=trend');

  const encodedFixture=example.match(/data-mls-trend-fixture="([^"]+)"/);
  assert.ok(encodedFixture,'validated-series inspector must execute in Chrome (trace: '+(example.match(/data-mls-trend-fixture-error="([^"]+)"/)?.[1]||'none')+')');
  const fixture=JSON.parse(encodedFixture[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&#39;',"'"));
  console.log('MLS_TREND_BROWSER_TRACE',JSON.stringify(fixture));
  assert.equal(fixture.overview_svg,1);
  assert.equal(fixture.finance_svg,1);
  assert.equal(fixture.ads_svg,1);
  assert.equal(fixture.points,3);
  assert.equal(fixture.chart_tab_direction,'row','chart buttons should be horizontal on desktop');
  assert.match(fixture.chart_title,/Resultado diário estimado/);
  assert.match(fixture.net_badge,/▼.*-R\$/);
  assert.match(fixture.sales_badge,/▲.*\+R\$/);
  assert.match(fixture.ads_badge,/▲.*\+R\$/);
  assert.equal(fixture.net_tone,'loss');
  assert.equal(fixture.finance_tone,'loss');
  assert.match(fixture.profit_label,/Prejuízo estimado/);
  assert.notEqual(fixture.net_color,fixture.sales_color,'loss and sales growth must use distinct colors');
  assert.notEqual(fixture.sales_color,fixture.ads_color,'more Ad spend is amber rather than success green');
  assert.deepEqual(fixture.errors,[]);


  const specialist=await chromeDump(url+'?mlsFixture=agents');
  const captured=specialist.match(/data-mls-agent-sources-fixture="([^"]+)"/);
  assert.ok(captured,'specialist sources must update real Chromium DOM (error: '+(specialist.match(/data-mls-agent-sources-error="([^"]+)"/)?.[1]||'none')+')');
  const source=JSON.parse(captured[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&#39;',"'"));
  assert.equal(source.catalog,345);
  assert.equal(source.dtf,4);
  assert.equal(source.products,'345');
  assert.equal(source.production,'4');
  assert.equal(source.catalog_chart,'CATALOG','real Chromium should render source-specific product chart');
  assert.equal(source.queue_chart,'DTF_QUEUE','real Chromium should render source-specific DTF queue chart');
  assert.equal(source.catalog_chart_rows,3,'registered/indexed/pending catalog rows');
  assert.equal(source.queue_chart_rows,4,'four classified DTF statuses');
  assert.equal(source.search_open,true,'global palette must open in authenticated owner DOM');
  assert.ok(source.search_titles.some(title=>title.includes('DTF')),'DTF search shows navigation result');
  assert.ok(source.search_destinations.includes('production')&&source.search_destinations.includes('agent-production'),'search preserves both operation and agent routes');
  assert.deepEqual(source.errors,[]);

  const recordMatch=specialist.match(/data-mls-record-search-fixture="([^"]+)"/);
  assert.ok(recordMatch,'authenticated global record search executed in Chrome: '+(specialist.match(/data-mls-record-search-error="([^"]+)"/)?.[1]||'no trace'));
  const record=JSON.parse(recordMatch[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&#39;',"'"));
  console.log('MLS_RECORD_SEARCH_TRACE',JSON.stringify({record,registry_requests:requests.filter(url=>url.startsWith('/api/admin/product-registry'))}));
  assert.equal(record.firstCount,8,'saved catalog search shows eight validated results');
  assert.equal(record.firstMore,true,'saved catalog explicit pagination is available');
  assert.equal(record.lastTitle,'Camiseta Modelo 9');
  assert.equal(record.productPanel,'products');
  assert.equal(record.productFilter,'700009','selected product filters the specialized saved catalog');
  assert.equal(record.orderTitle,'Pedido 998877');
  assert.equal(record.dtfPanel,'production');
  assert.equal(record.selectedOrder,'998877');
  assert.deepEqual(record.errors,[]);


  const authorization=await chromeDump(url+'?mlsFixture=financeAuth');
  const encodedAuth=authorization.match(/data-mls-finance-auth-fixture="([^"]+)"/);
  assert.ok(encodedAuth,'Auth-recovery inspector must execute (error '+(authorization.match(/data-mls-finance-auth-fixture-error="([^"]+)"/)?.[1]||'none')+')');
  const auth=JSON.parse(encodedAuth[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&#39;',"'"));
  assert.equal(auth.visible,true,'only the exact AUTH_REQUIRED code exposes recovery links');
  assert.deepEqual(auth.links.map(x=>x.href),[
   'https://auth.brazacommerce.com.br/shopee/finance/status',
   'https://auth.brazacommerce.com.br/shopee/finance/connect'
  ]);
  assert.ok(auth.links.every(x=>x.target==='_blank'&&x.rel.includes('noopener')&&x.rel.includes('noreferrer')));
  assert.deepEqual(auth.errors,[]);

  // The direct deep links must expose only the selected agent/hub section.
  // This checks Chromium's actual hidden attribute after the real Admin client
  // processes the URL, not just an HTML string / a VM stub.
  for(const tab of ['agents','agent-finance','agent-returns']){
   const routed=await chromeDump(url+'?tab='+tab);
   const active=/data-active-panel="([^"]+)"/.exec(routed)?.[1];
   assert.equal(active,tab,'Chrome must activate the requested agent tab');
   const escaped=tab.replace(/[-]/g,'\\-');
   const tag=new RegExp('<section\\b[^>]*id="'+escaped+'"[^>]*>','i').exec(routed)?.[0];
   assert.ok(tag,'dedicated section exists: '+tab);
   assert.doesNotMatch(tag,/\shidden(?:=|\s|>)/,'active section must be visible: '+tab);
   if(tab!=='agents'){
    const overview=/<section\b[^>]*id="overview"[^>]*>/i.exec(routed)?.[0];
    assert.ok(overview&&/\shidden(?:=|\s|>)/.test(overview),'overview must be hidden for '+tab);
   }
   assert.ok(routed.includes('id="mission-'+(tab==='agents'?'finance':tab.slice(6))+'-tasks"'),'dedicated agent tools remain in DOM');
  }

 }finally{
  server.closeAllConnections?.();
  server.close();
 }
});
