import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionFixture} from './business-collection-fixture.mjs';
import {readCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {assertReviewedCostSources} from './reviewed-cost-source-invariants.mjs';
import {getFinanceBusinessPeriod} from '../src/app-business-period.mjs';
import {createFinanceWorker} from '../../finance/src/connection-worker.mjs';
import {forwardFinancePaymentSample} from '../../finance/src/auth-router.mjs';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';

const typedMissing=()=>({schema:'finance_business_period_v1',status:'UNAVAILABLE',diagnostic:{code:'FINANCE_BUSINESS_RUN_NOT_FOUND',http:404}});
const failure=message=>error=>error.message===message;
const sourceCount=f=>f.calls.finance.length;
const providerCount=f=>f.calls.list.length+f.calls.detail.length+f.calls.payment.length;
const row=f=>f.env.ADMIN_DB.db.prepare('SELECT * FROM business_month_runs WHERE month=?').get('2026-10');
const frames=f=>f.env.ADMIN_DB.db.prepare('SELECT * FROM business_month_frames WHERE month=? ORDER BY slot_index').all('2026-10');
const recoveries=f=>f.env.ADMIN_DB.db.prepare('SELECT * FROM business_month_source_recoveries ORDER BY parent_revision').all();
const publication=async f=>readCompletedBusinessMonth(f.env,'2026-10',{now:f.now});
async function pending(t){
 const f=await collectionFixture({allPaid:true,daily:true,windowCounts:[2,1],paymentDelayMs:0});
 t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 let frame=await f.invoke('start');for(let turn=0;frame.status==='RUNNING'&&turn<12;turn++)frame=await f.invoke('step');assert.equal(frame.status,'COMPLETE');
 f.beforePublication=await publication(f);f.beforeComplete=frame;f.clock.time+=901000;
 await f.invoke('start');f.before=row(f);f.beforeFrames=frames(f);f.original=JSON.parse(f.beforeFrames[0].payload);assert.equal(f.original.status,'RUNNING');
 const db=f.financeEnv.FINANCE_DB.db;
 for(const table of ['finance_financial_order_components','finance_business_order_evidence','finance_business_period_orders','finance_business_period_cursors','finance_business_period_payment_cache','finance_business_period_runs']){
  if(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name=?").get(table).n)db.prepare('DELETE FROM '+table+' WHERE run_id=?').run(f.original.run_id);
 }
 const real=f.services.getFinanceBusinessPeriod,router='synthetic-recovery-router-'+'r'.repeat(40),appKey='synthetic-recovery-app-'+'a'.repeat(40);
 const finance=createFinanceWorker({businessPeriod:(env,options)=>real(env,options),fetchImpl:f.fetchImpl,now:f.now});
 f.transport={env:{APP_INTERNAL_SECRET:appKey},router,fetchImpl:request=>forwardFinancePaymentSample(request,{FINANCE_ROUTER_SECRET:router,SHOPEE_FINANCE_SERVICE:{fetch:upstream=>finance.fetch(upstream,{...f.financeEnv,FINANCE_ROUTER_SECRET:router})}},{validateInternalApp:request=>request.headers.get('x-braza-app-key')===appKey})};
 f.services.getFinanceBusinessPeriod=(_,input)=>getFinanceBusinessPeriod(f.transport.env,input,{fetchImpl:f.transport.fetchImpl,includeVariants:true});
 return f;
}
async function mark(f){await assert.rejects(()=>f.invoke('step'),failure('BUSINESS_MONTH_SOURCE_RUN_NOT_FOUND'));assert.equal(recoveries(f).length,1);}

test('a typed missing source reserves a real same-period bootstrap on the next turn and preserves the old publication and source evidence',async t=>{
 const f=await pending(t),called=sourceCount(f),provider=providerCount(f);
 await mark(f);assert.equal(sourceCount(f),called+1);assert.equal(providerCount(f),provider);assert.deepEqual(row(f),f.before);assert.deepEqual(frames(f),f.beforeFrames);assert.deepEqual(await publication(f),f.beforePublication);
 const intent=recoveries(f)[0];assert.equal(intent.original_frame,JSON.stringify(f.original));assert.equal(intent.parent_revision,f.before.revision);assert.equal(intent.parent_payload,f.before.payload);assert.equal(intent.replacement_run_id,null);
 await f.invoke('read');assert.equal(sourceCount(f),called+1,'read never bootstraps or reads the provider');
 const started=await f.invoke('step'),fresh=JSON.parse(frames(f)[0].payload),audit=recoveries(f)[0];
 assert.equal(started.status,'RUNNING');assert.notEqual(fresh.run_id,f.original.run_id);assert.equal(fresh.start_date,f.original.start_date);assert.equal(fresh.end_date,f.original.end_date);assert.equal(fresh.coverage.orders,0);assert.equal(audit.replacement_run_id,fresh.run_id);assert.equal(audit.original_frame,intent.original_frame);assert.equal(audit.replaced_at,Math.floor(f.now()/1000));assert.equal(sourceCount(f),called+2);assert.equal(providerCount(f),provider,'start creates a real empty source, not fabricated collected orders');assert.deepEqual(await publication(f),f.beforePublication);
 let frame=started;for(let turn=0;frame.status==='RUNNING'&&turn<12;turn++){const calls=sourceCount(f);frame=await f.invoke('step');assert.equal(sourceCount(f),calls+1);}
 assert.equal(frame.status,'COMPLETE');assert.equal(frame.coverage.orders,f.beforeComplete.coverage.orders);assert.equal(frame.known_sales_cents,f.beforeComplete.known_sales_cents);assert.equal(frame.known_expected_repass_cents,f.beforeComplete.known_expected_repass_cents);assert.equal(frame.known_production_cost_cents,f.beforeComplete.known_production_cost_cents);assert.equal(recoveries(f).length,1);assert.equal(recoveries(f)[0].original_frame,intent.original_frame);assert.ok((await publication(f)).row.revision>f.beforePublication.row.revision);
 for(const [key,table] of [['expenses','business_month_expenses'],['bindings','variant_bindings_state'],['costs','production_costs_state']])assert.deepEqual(f.env.ADMIN_DB.db.prepare('SELECT * FROM '+table).all(),f.immutable[key]);
});

test('generic HTTP 404, malformed missing-run envelopes and other failures never authorize a source replacement',async t=>{
 const f=await pending(t),values=[
  {...typedMissing(),diagnostic:{code:'FINANCE_BUSINESS_HTTP_ERROR',http:404}},
  {...typedMissing(),diagnostic:{code:'FINANCE_BUSINESS_RUN_NOT_FOUND',http:502}},
  {...typedMissing(),diagnostic:{...typedMissing().diagnostic,extra:true}},
  {...typedMissing(),extra:true},
  {...typedMissing(),diagnostic:{code:'FINANCE_BUSINESS_HTTP_ERROR',http:403}},
 ];
 for(const value of values){f.services.getFinanceBusinessPeriod=async()=>value;await assert.rejects(()=>f.invoke('step'));assert.equal(recoveries(f).length,0);assert.deepEqual(row(f),f.before);assert.deepEqual(frames(f),f.beforeFrames);assert.deepEqual(await publication(f),f.beforePublication);}
});

test('a pending recovery rejects a source of different dates, duplicate slot identity or regressing restored revision and retains its intent',async t=>{
 const f=await pending(t),complete=f.beforePublication.payload.slots[1].frame,payload=JSON.parse(f.before.payload);
 payload.slots[1].frame={schema:'business_month_frame_ref_v1',run_id:complete.run_id,revision:complete.revision};
 f.env.ADMIN_DB.db.prepare('INSERT INTO business_month_frames VALUES(?,?,?,?,?)').run('2026-10',1,complete.run_id,complete.revision,JSON.stringify(complete));f.env.ADMIN_DB.db.prepare('UPDATE business_month_runs SET payload=? WHERE month=?').run(JSON.stringify(payload),'2026-10');f.before=row(f);f.beforeFrames=frames(f);await mark(f);
 for(const change of [frame=>frame.start_date='2026-10-02',frame=>frame.run_id=complete.run_id,frame=>{frame.run_id=f.original.run_id;frame.revision=0;}]){
  f.services.getFinanceBusinessPeriod=async()=>{const frame=structuredClone(f.original);frame.run_id=crypto.randomUUID();change(frame);return frame;};
  await assert.rejects(()=>f.invoke('step'),failure('BUSINESS_MONTH_SOURCE_INVALID'));assert.deepEqual(row(f),f.before);assert.deepEqual(frames(f),f.beforeFrames);assert.equal(recoveries(f)[0].replacement_run_id,null);assert.deepEqual(await publication(f),f.beforePublication);
 }
});

test('two concurrent recoveries converge on the Finance same-period source and only one parent CAS and audit replacement win',async t=>{
 const f=await pending(t);await mark(f);const real=f.services.getFinanceBusinessPeriod;let arrivals=0,release;const both=new Promise(resolve=>release=resolve);
 f.services.getFinanceBusinessPeriod=async(...args)=>{arrivals++;if(arrivals===2)release();await both;return real(...args);};
 const before=sourceCount(f),provider=providerCount(f),result=await Promise.all([f.invoke('step'),f.invoke('step')]);
 assert.equal(sourceCount(f),before+2);assert.equal(providerCount(f),provider);assert.deepEqual(result[0],result[1]);assert.equal(row(f).revision,f.before.revision+1);assert.equal(recoveries(f).length,1);assert.equal(recoveries(f)[0].replacement_run_id,frames(f)[0].run_id);assert.deepEqual(await publication(f),f.beforePublication);
});

test('a parent CAS lost after bootstrap preserves the original frame and publication; retry reuses the real source instead of clearing the month',async t=>{
 const f=await pending(t);await mark(f);const real=f.services.getFinanceBusinessPeriod;let interrupted=true,startedRun;
 f.services.getFinanceBusinessPeriod=async(...args)=>{const value=await real(...args);if(interrupted&&args[1].operation==='start'){interrupted=false;startedRun=(value.report??value).run_id;f.env.ADMIN_DB.db.prepare('UPDATE business_month_runs SET revision=revision+1 WHERE month=?').run('2026-10');}return value;};
 const result=await f.invoke('step');assert.equal(result.status,'RUNNING');assert.deepEqual(frames(f),f.beforeFrames);assert.equal(row(f).revision,f.before.revision+1);assert.equal(recoveries(f)[0].replacement_run_id,null);assert.deepEqual(await publication(f),f.beforePublication);
 await assert.rejects(()=>f.invoke('step'),failure('BUSINESS_MONTH_SOURCE_RUN_NOT_FOUND'));assert.equal(recoveries(f).length,2);await f.invoke('step');assert.equal(frames(f)[0].run_id,startedRun);assert.equal(recoveries(f).filter(row=>row.replacement_run_id!==null).length,1);assert.deepEqual(await publication(f),f.beforePublication);
});

for(const mutation of ['delete','change'])test('a recovery intent '+mutation+'d between source start and commit fences both the slot write and parent CAS',async t=>{
 const f=await pending(t);await mark(f);const real=f.services.getFinanceBusinessPeriod;
 f.services.getFinanceBusinessPeriod=async(...args)=>{const value=await real(...args);f.env.ADMIN_DB.db.prepare(mutation==='delete'?'DELETE FROM business_month_source_recoveries':"UPDATE business_month_source_recoveries SET original_frame='{}'").run();return value;};
 const result=await f.invoke('step');assert.equal(result.status,'RUNNING');assert.deepEqual(row(f),f.before);assert.deepEqual(frames(f),f.beforeFrames);assert.deepEqual(await publication(f),f.beforePublication);assert.equal(recoveries(f).filter(row=>row.replacement_run_id!==null).length,0);
});

test('a source error or corrupt recovery intent cannot replace the original frame or publication',async t=>{
 const f=await pending(t);await mark(f);const real=f.services.getFinanceBusinessPeriod;
 f.services.getFinanceBusinessPeriod=async()=>{throw Error('SYNTHETIC_PRIVATE_SOURCE_TIMEOUT');};await assert.rejects(()=>f.invoke('step'),failure('BUSINESS_MONTH_SOURCE_UNAVAILABLE'));assert.deepEqual(row(f),f.before);assert.equal(recoveries(f)[0].replacement_run_id,null);
 f.services.getFinanceBusinessPeriod=real;f.env.ADMIN_DB.db.prepare("UPDATE business_month_source_recoveries SET original_frame='{}'").run();const calls=sourceCount(f);await assert.rejects(()=>f.invoke('step'),failure('BUSINESS_MONTH_STORAGE_INVALID'));assert.equal(sourceCount(f),calls);assert.deepEqual(row(f),f.before);assert.deepEqual(frames(f),f.beforeFrames);assert.deepEqual(await publication(f),f.beforePublication);
});

test('after a crash longer than the Finance reuse window, one legitimate new source is bound without duplicating App quantities or overwriting the old publication early',async t=>{
 const f=await pending(t);await mark(f);const bootstrap=await f.services.getFinanceBusinessPeriod(f.env,{operation:'start',start_date:f.original.start_date,end_date:f.original.end_date}),first=bootstrap.report??bootstrap;assert.equal(first.status,'RUNNING');assert.equal(recoveries(f)[0].replacement_run_id,null);
 f.clock.time+=901000;await f.invoke('step');const second=JSON.parse(frames(f)[0].payload);assert.notEqual(second.run_id,first.run_id);assert.equal(recoveries(f).length,1);assert.equal(recoveries(f)[0].replacement_run_id,second.run_id);assert.deepEqual(await publication(f),f.beforePublication);
 let frame;for(let turn=0;turn<12;turn++){frame=await f.invoke('step');if(frame.status!=='RUNNING')break;}assert.equal(frame.status,'COMPLETE');assert.equal(frame.coverage.orders,f.beforeComplete.coverage.orders);assert.equal(frame.known_sales_cents,f.beforeComplete.known_sales_cents);
});

for(const minify of [false,true])test(`all three generated Workers complete typed Finance HTTP → Auth → App recovery with a synthetic provider (minify=${minify})`,async t=>{
 const f=await pending(t),originalFetch=globalThis.fetch;t.mock.method(Date,'now',f.now);globalThis.fetch=request=>f.fetchImpl(request);t.after(()=>{globalThis.fetch=originalFetch;});
 const source=await readFile(new URL('../../../dist/app-worker.mjs',import.meta.url),'utf8'),boundary='return {adminFetch,schedule,scheduledWork,workspaceAuthFetch};';assert.equal(source.split(boundary).length,2);
 const compiled=await build({stdin:{contents:source.replace(boundary,'return {adminFetch,schedule,scheduledWork,workspaceAuthFetch,sourceRecoverySmoke:brazaBusinessMonth};')+'\nexport {brazaAdmin,getFinanceBusinessPeriod as transportSmoke};',loader:'js'},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify}),worker=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const compile=async path=>{const contents=await readFile(new URL(path,import.meta.url),'utf8'),result=await build({stdin:{contents,sourcefile:path},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});return (await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))).default;};
 const [auth,finance]=await Promise.all([compile('../../../dist/auth-worker.mjs'),compile('../../../dist/finance-worker.mjs')]),financeStatuses=[],authStatuses=[];
 f.transport.fetchImpl=async request=>{f.calls.finance.push(JSON.parse(await request.clone().text()));const response=await auth.fetch(request,{APP_INTERNAL_SECRET:f.transport.env.APP_INTERNAL_SECRET,FINANCE_ROUTER_SECRET:f.transport.router,SHOPEE_FINANCE_SERVICE:{fetch:async upstream=>{const output=await finance.fetch(upstream,{...f.financeEnv,FINANCE_ROUTER_SECRET:f.transport.router});financeStatuses.push(output.status);return output;}}});authStatuses.push(response.status);return response;};
 f.invoke=async operation=>{try{return await worker.brazaAdmin.sourceRecoverySmoke.businessMonth(f.env,{operation,month:'2026-10'},f.services,{now:f.now});}catch(error){throw Object.assign(Error(error.message),{status:error.status});}};f.services.getFinanceBusinessPeriod=(_,input)=>worker.transportSmoke(f.transport.env,input,{fetchImpl:f.transport.fetchImpl,includeVariants:true});
 const before=sourceCount(f);await mark(f);assert.equal(sourceCount(f),before+1);assert.deepEqual(await publication(f),f.beforePublication);await f.invoke('step');assert.equal(sourceCount(f),before+2);assert.notEqual(frames(f)[0].run_id,f.original.run_id);assert.equal(recoveries(f)[0].replacement_run_id,frames(f)[0].run_id);assert.deepEqual(await publication(f),f.beforePublication);
 let frame;for(let turn=0;turn<12;turn++){const calls=sourceCount(f);frame=await f.invoke('step');assert.equal(sourceCount(f),calls+1);if(frame.status!=='RUNNING')break;assert.deepEqual(await publication(f),f.beforePublication);}assert.equal(frame.status,'COMPLETE');assert.equal(frame.coverage.orders,f.beforeComplete.coverage.orders);assert.equal(frame.known_sales_cents,f.beforeComplete.known_sales_cents);assert.equal(financeStatuses[0],404);assert.equal(authStatuses[0],404);assert.ok(financeStatuses.slice(1).every(status=>status===200));assert.ok(authStatuses.slice(1).every(status=>status===200));
});

test('the exact monthly recovery adapter preserves all preexisting pinned DTO and financial calculation bytes',()=>assertReviewedCostSources());
