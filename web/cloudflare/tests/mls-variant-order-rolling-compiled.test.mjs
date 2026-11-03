import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {variantOrderFixture,variantOrderView} from './mls-variant-order-fixture.mjs';

// Pin the last released source, rather than copying private deployed Workers
// into the repository. CI checks out full history and these pure boundaries
// compile together with every dependency from that exact previous revision.
const previous='aebc3c7aec9ad9937cc43565ba401b0b4ba07cba';
const root=fileURLToPath(new URL('../../../',import.meta.url)),sources=new Map();
const entries={getFinanceBusinessPeriod:'web/cloudflare/src/app-business-period.mjs',forwardFinancePaymentSample:'web/finance/src/auth-router.mjs',createFinanceWorker:'web/finance/src/connection-worker.mjs',buildBusinessMonthView:'web/cloudflare/src/business-month-view-state.mjs',projectBusinessMonthView:'web/cloudflare/src/business-month-view-state.mjs',projectBusinessMonth:'web/cloudflare/src/business-month.mjs',projectBusinessMonthAuditScope:'web/cloudflare/src/business-month-view-state.mjs',projectDailyBusinessSummary:'web/cloudflare/src/business-daily-summary.mjs',projectExpenseSchedule:'web/cloudflare/src/expense-schedule.mjs'};
const currentEntries={...entries,projectBusinessMonthVariantContributions:'web/cloudflare/src/business-variant-attribution.mjs'};
async function boundaries(old,minify){
 const selected=old?entries:currentEntries,source=Object.entries(selected).map(([name,file])=>`export {${name}} from ${JSON.stringify(old?'previous:'+file:'./'+file)};`).join('\n');
 const compiled=await build({stdin:{contents:source,resolveDir:root,sourcefile:'variant-rolling-boundaries.mjs'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify,plugins:old?[{name:'exact-previous-revision',setup(builder){
  builder.onResolve({filter:/^previous:/},args=>({path:args.path.slice('previous:'.length),namespace:'previous'}));
  builder.onResolve({filter:/^\./,namespace:'previous'},args=>({path:path.posix.normalize(path.posix.join(path.posix.dirname(args.importer),args.path)),namespace:'previous'}));
  builder.onLoad({filter:/.*/,namespace:'previous'},args=>{assert.ok(args.path.startsWith('web/'),'previous dependency must stay within reviewed source');assert.ok(!args.path.includes('..'));if(!sources.has(args.path))sources.set(args.path,execFileSync('git',['show',previous+':'+args.path],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024}));return {contents:sources.get(args.path),loader:'js'};});
 }}]:[]});
 return import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
}

for(const minify of [false,true])test(`compiled previous and current boundaries retain exact v1 fallback and negotiate only a complete new chain (minify=${minify})`,async()=>{
 const [old,current,f]=await Promise.all([boundaries(true,minify),boundaries(false,minify),variantOrderFixture()]);
 const capture=f.captures[0],frame=capture.frame,envelope={schema:'finance_business_period_variants_v1',report:frame,variant_financials:capture.variant_financials},appKey='SYNTHETIC_ROLLING_APP_'+'a'.repeat(40),router='SYNTHETIC_ROLLING_ROUTER_'+'r'.repeat(40),selection={operation:'read',run_id:frame.run_id};
 for(const [appName,app]of [['old',old],['current',current]])for(const [authName,auth]of [['old',old],['current',current]])for(const [financeName,finance]of [['old',old],['current',current]])for(const includeVariants of [false,true]){
  const calls={app:0,auth:0,finance:0,provider:0},options=[];
  const worker=finance.createFinanceWorker({businessPeriod:async(env,requestOptions)=>{calls.finance++;options.push(requestOptions);return requestOptions.includeVariants?structuredClone(envelope):structuredClone(frame);},now:()=>frame.checked_at*1000,fetchImpl:async()=>{calls.provider++;throw Error('NO_PROVIDER_FOR_CACHED_PROOF');}});
  const env={FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:async req=>{calls.auth++;assert.equal(req.headers.get('X-Braza-App-Key'),null);assert.equal(req.headers.get('cookie'),null);return worker.fetch(req,{FINANCE_CONNECTION_ENABLED:'true',FINANCE_ROUTER_SECRET:router});}}};
  const actual=await app.getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},selection,{includeVariants,fetchImpl:async req=>{calls.app++;assert.equal(req.headers.get('cookie'),null);assert.equal(req.headers.get('X-Braza-App-Key'),appKey);return auth.forwardFinancePaymentSample(req,env,{validateInternalApp:r=>r.headers.get('X-Braza-App-Key')===appKey});}});
  const negotiated=appName==='current'&&authName==='current'&&financeName==='current'&&includeVariants;
  assert.deepEqual(actual,negotiated?envelope:frame,`${appName} App / ${authName} Auth / ${financeName} Finance / opt=${includeVariants}`);
  assert.deepEqual(calls,{app:1,auth:1,finance:1,provider:0});assert.equal(options.length,1);assert.equal(options[0].includeDaily,true);assert.equal(options[0].includeVariants===true,negotiated);
  assert.equal(JSON.stringify(negotiated?actual.report:actual),JSON.stringify(frame),'legacy report bytes remain exact, including daily evidence');
 }
 // A new chain must reject a malformed negotiated envelope; its embedded v1
 // frame cannot conceal a corrupted aggregate or trigger a second request.
 let reads=0;const bad=structuredClone(envelope);bad.variant_financials.report_hash='0'.repeat(64);
 const rejected=await current.getFinanceBusinessPeriod({APP_INTERNAL_SECRET:appKey},selection,{includeVariants:true,fetchImpl:async()=>{reads++;return Response.json(bad);}});
 assert.equal(reads,1);assert.equal(rejected.status,'UNAVAILABLE');assert.equal(rejected.diagnostic.code,'FINANCE_BUSINESS_FRAME_INVALID');
});

for(const minify of [false,true])test(`compiled old and new monthly view readers keep v4 exact while v5 remains additive and validated (minify=${minify})`,async()=>{
 const [old,current,f]=await Promise.all([boundaries(true,minify),boundaries(false,minify),variantOrderFixture()]),v4=variantOrderView(f,{contract:'business-month-view-v4'}),v5=variantOrderView(f);
 const project=(modules,value)=>modules.projectBusinessMonthView(value,modules.projectBusinessMonth,modules.projectBusinessMonthAuditScope,modules.projectDailyBusinessSummary,modules.projectExpenseSchedule,modules.projectBusinessMonthVariantContributions);
 assert.deepEqual(project(old,v4),v4);assert.deepEqual(project(current,v4),v4);assert.equal(project(old,v5),null);assert.deepEqual(project(current,v5),v5);
 const observation={active:f.frame,display:f.frame,display_source:'PUBLISHED',audit_scope:f.audit_scope,source_frames:f.source_frames,expense_schedule:null},sync={enabled:true,status:'COMPLETE',next_run_at:1792932579,last_attempt_at:1792932514};
 assert.deepEqual(old.buildBusinessMonthView(observation,sync,{now:()=>f.frame.checked_at*1000,contract:'business-month-view-v4'}),current.buildBusinessMonthView(observation,sync,{now:()=>f.frame.checked_at*1000,contract:'business-month-view-v4'}),'unchanged v4 publication bytes do not contain the new sidecar');
 for(const mutate of [value=>{value.variant_contributions.variants[0].strict.contribution_cents++;},value=>{value.variant_contributions.source.costs_revision++;},value=>{value.variant_contributions.checked_at++;}]){const bad=structuredClone(v5);mutate(bad);assert.equal(project(current,bad),null,'malformed v5 must not be silently reinterpreted as a valid v4');}
 assert.equal(v5.variant_contributions.execution_allowed,false);assert.equal(v5.variant_contributions.net_profit_cents,null);assert.equal(v5.variant_contributions.safe_price_cents,null);
});
