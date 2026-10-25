import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore,FINANCE_PROFILE} from '../src/connection-store.mjs';
import {runEscrowReleaseLedger} from '../src/escrow-release-ledger.mjs';

const key='PRIVATE_RELEASE_LEDGER_KEY',access='PRIVATE_RELEASE_ACCESS',refresh='PRIVATE_RELEASE_REFRESH';
const month='2026-10',path='/api/v2/payment/get_escrow_list';
const hash=value=>createHash('sha256').update(value).digest('hex');
const response=value=>Response.json({error:'',request_id:'PRIVATE_RELEASE_REQUEST',response:value});
async function fixture(t){
 const db=new D1();t.after(()=>db.db.close());let queue=Promise.resolve();const batch=db.batch.bind(db);
 db.batch=statements=>{const pending=queue.then(()=>batch(statements));queue=pending.catch(()=>{});return pending;};
 const clock={time:Date.UTC(2026,9,20,15)},now=()=>clock.time;
 const env={FINANCE_DB:db,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,51).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:key};
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:access,refresh_token:refresh,expires_at:now()/1000+86400});
 const calls=[],state={respond:()=>response({escrow_list:[],more:false}),hold:null};
 const fetchImpl=async request=>{
  const url=new URL(request.url);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(url.pathname,path);assert.equal(request.method,'GET');assert.equal(request.redirect,'manual');assert.equal(await request.clone().text(),'');
  for(const name of ['cookie','authorization','origin','x-braza-app-key','x-braza-finance-router'])assert.equal(request.headers.get(name),null);
  assert.equal(url.searchParams.get('partner_id'),String(FINANCE_PROFILE.partner_id));assert.equal(url.searchParams.get('shop_id'),String(FINANCE_PROFILE.shop_id));assert.equal(url.searchParams.get('access_token'),access);
  const base=String(FINANCE_PROFILE.partner_id)+path+url.searchParams.get('timestamp')+access+FINANCE_PROFILE.shop_id;assert.equal(url.searchParams.get('sign'),createHmac('sha256',key).update(base).digest('hex'));
  const call={url,low:Number(url.searchParams.get('release_time_from'))+1,high:Number(url.searchParams.get('release_time_to')),page:Number(url.searchParams.get('page_no')),size:Number(url.searchParams.get('page_size'))};assert.equal(call.size,100);assert.ok(Number.isSafeInteger(call.page)&&call.page>=1);calls.push(call);
  if(state.hold)await state.hold;return state.respond(call);
 };
 const invoke=(operation='step',extra={})=>runEscrowReleaseLedger(env,{operation,month,now,fetchImpl,...extra});
 const complete=async(except=null)=>{for(let index=0;index<205;index++){const value=await invoke();if(value.published?.status==='COMPLETE'&&value.published.scan_id!==except)return value;clock.time+=301000;}throw Error('fixture did not complete');};
 return {db,env,store,clock,now,calls,state,fetchImpl,invoke,complete};
}
const row=(order_sn,payout_amount,escrow_release_time)=>({order_sn,payout_amount,escrow_release_time});

test('local observation never starts a scan or a provider request; signed page collection retains exact raw values rather than assuming BRL cents',async t=>{
 const f=await fixture(t),empty=await f.invoke('read');assert.equal(empty.published,null);assert.equal(empty.active,null);assert.deepEqual(empty.rows,[]);assert.equal(f.calls.length,0);
 for(const input of [{operation:'start',month},{operation:'step',month:'2026-13'},{operation:'step',month,url:'https://foreign.invalid'},{operation:'step',month,shop_id:1}])await assert.rejects(runEscrowReleaseLedger(f.env,{...input,fetchImpl:f.fetchImpl,now:f.now}));
 assert.equal(f.calls.length,0);
 f.state.respond=({low,page})=>response({escrow_list:page===1?[row('PRIVATE_RELEASE_A',-1.2345,low+1),row('PRIVATE_RELEASE_B',0,low+2),row('PRIVATE_RELEASE_C',0.123456789012,low+3)]:[],more:false});
 const first=await f.invoke();assert.equal(f.calls.length,1);assert.equal(first.active.progress.pages_read,1);assert.equal(first.active.rows[0].payout_raw,'-1.2345');assert.equal(first.active.rows[1].payout_raw,'0');assert.equal(first.active.rows[2].payout_raw,'0.123456789012');
 for(const item of first.active.rows){assert.equal(item.order_hash,hash(item.order_sn));assert.equal(item.window_index,0);assert.equal(item.page_no,1);assert.ok(Number.isSafeInteger(item.checked_at));}
 const before=f.calls.length;await f.invoke('read');assert.equal(f.calls.length,before);assert.equal(Object.hasOwn(first,'released_cents'),false);assert.equal(Object.hasOwn(first,'net_profit_cents'),false);
});

test('seven-day BRT windows own disjoint half-open release intervals while retaining original API row positions',async t=>{
 const f=await fixture(t),cutoff=f.now()/1000;
 f.state.respond=({low,high})=>response({escrow_list:[row('GUARD_'+(low-1),25,low-1),row('BOUNDARY_'+low,0,low),row('BOUNDARY_'+high,25,high)],more:false});
 const result=await f.complete(),published=result.published;
 assert.equal(published.time_from,Date.UTC(2026,9,1,3)/1000);assert.equal(published.time_to,cutoff);assert.equal(published.cutoff_at,cutoff);assert.equal(published.progress.windows_total,3);assert.equal(published.progress.windows_complete,3);
 assert.equal(f.calls.length,3);assert.equal(f.calls[0].high,Date.UTC(2026,9,8,3)/1000);assert.equal(f.calls[1].low,f.calls[0].high);assert.equal(f.calls[2].low,f.calls[1].high);assert.equal(f.calls[2].high,cutoff);
 assert.equal(published.rows.length,3);assert.deepEqual(published.rows.map(item=>item.row_index),[1,1,1]);assert.deepEqual(published.rows.map(item=>item.window_index),[0,1,2]);assert.equal(published.ambiguous_orders,0);
 assert.ok(published.rows.every(item=>item.release_time>=published.time_from&&item.release_time<published.time_to));
});

test('a failed replacement preserves published source rows and resumes exactly the failed page without unioning scans',async t=>{
 const f=await fixture(t),original=await f.complete(),old=structuredClone(original.published),oldId=old.scan_id;assert.equal(old.rows.length,0);
 f.clock.time+=301000;let failed=false;
 f.state.respond=({low,page})=>page===1?response({escrow_list:[row('REPLACEMENT_ONLY',99,low+1)],more:true}):!failed?(failed=true,Response.json({error:'error_rate_limit',message:key},{status:429})):response({escrow_list:[],more:false});
 const started=await f.invoke();assert.equal(started.published.scan_id,oldId);assert.equal(started.rows.length,0);assert.equal(started.active.rows.length,1);
 const count=f.calls.length;f.clock.time+=61000;const blocked=await f.invoke();assert.equal(f.calls.length,count+1);assert.equal(blocked.active.progress.page_no,2);assert.equal(blocked.active.progress.pages_read,1);assert.equal(blocked.active.rows.length,1);assert.equal(blocked.published.scan_id,oldId);assert.match(blocked.collection.code||blocked.active.diagnostic,/RATE_LIMIT/);
 const deniedCount=f.calls.length;await f.invoke();assert.equal(f.calls.length,deniedCount,'the saved retry gate prevents another source request');assert.deepEqual((await f.invoke('read')).published,old);
 f.clock.time+=601000;f.state.respond=({page})=>response({escrow_list:[],more:false});const refreshed=await f.complete(oldId);
 assert.equal(refreshed.published.rows.length,1);assert.equal(refreshed.published.rows[0].order_sn,'REPLACEMENT_ONLY');assert.notEqual(refreshed.published.scan_id,oldId);assert.equal(f.calls[count].page,2);assert.equal(f.calls[count+1].page,2);
});

test('repeated order identities remain ambiguous observations and an endless repeated page cannot manufacture completion',async t=>{
 const f=await fixture(t);
 f.state.respond=({low,page})=>response({escrow_list:[row('SAME_ORDER',page===1?10:11,low+page)],more:page===1});
 await f.invoke();f.clock.time+=61000;const next=await f.invoke();assert.equal(next.active.rows.length,2);assert.equal(next.active.ambiguous_orders,1);assert.deepEqual(next.active.rows.map(item=>item.payout_raw),['10','11']);
 const g=await fixture(t);let original;
 g.state.respond=({low})=>{original??=row('REPEATED_PAGE_ORDER',1,low+1);return response({escrow_list:[original],more:true});};
 await g.invoke();g.clock.time+=61000;const repeated=await g.invoke();assert.equal(repeated.active.progress.pages_read,1);assert.equal(repeated.active.rows.length,1);assert.match(repeated.collection.code||repeated.active.diagnostic,/REPEATED_PAGE/);assert.equal(repeated.published,null);
});

test('provider identity, currency and decimal poison cannot commit a successful page or expose provider text',async t=>{
 for(const mode of ['foreign-shop','foreign-currency','binary-artefact','infinite','empty-more']){
  const f=await fixture(t);f.state.respond=({low})=>{
   // JSON.stringify(Infinity) becomes null, which is legitimate missing money.
   // Send a JSON number whose parsed value is non-finite to test the poison.
   if(mode==='infinite')return new Response('{"error":"","response":{"escrow_list":[{"order_sn":"POISON_ORDER","payout_amount":1e309,"escrow_release_time":'+(low+1)+'}],"more":false}}',{headers:{'content-type':'application/json'}});
   return response({...(mode==='foreign-shop'?{shop_id:1}:{}),escrow_list:mode==='empty-more'?[]:[{...row('POISON_ORDER',mode==='binary-artefact'?0.1+0.2:25,low+1),...(mode==='foreign-currency'?{currency:'USD'}:{})}],more:mode==='empty-more',message:key});
  };
  const value=await f.invoke();assert.equal(value.active.progress.pages_read,0,mode);assert.equal(value.active.rows.length,0,mode);assert.equal(value.published,null,mode);assert.match(value.collection.code||value.active.diagnostic,/INVALID_RESPONSE/,mode);assert.ok(!JSON.stringify(value).includes(key));
 }
});

test('concurrent invocations cannot duplicate a leased page and a corrupted persisted raw value is rejected on read',async t=>{
 const f=await fixture(t);let resolveHold,entered;const started=new Promise(resolve=>entered=resolve),hold=new Promise(resolve=>resolveHold=resolve);Object.defineProperty(f.state,'hold',{get(){entered();return hold;}});f.state.respond=({low})=>response({escrow_list:[row('CONCURRENT_ORDER',12.5,low+1)],more:false});
 const first=f.invoke();await started;
 const second=await f.invoke();assert.equal(f.calls.length,1);assert.equal(second.active.progress.pages_read,0);resolveHold();const finished=await first;assert.equal(finished.active.progress.pages_read,1);assert.equal(f.calls.length,1);
 f.db.db.prepare("UPDATE finance_escrow_release_rows SET payout_raw='9999' WHERE scan_id=?").run(finished.active.scan_id);
 await assert.rejects(f.invoke('read'),/FINANCE_ESCROW_RELEASE_STORAGE_INVALID/);
});

test('token renewal and the single release page share the same two-call external budget',async t=>{
 const f=await fixture(t),tokens=await f.store.readTokens();await f.store.saveTokens({access_token:access,refresh_token:refresh,expires_at:f.now()/1000+30},{expectedRevision:tokens.revision});let external=0;
 const fetchImpl=async request=>{
  external++;
  if(new URL(request.url).pathname!=='/api/v2/auth/access_token/get')return f.fetchImpl(request);
  assert.equal(request.method,'POST');return Response.json({error:'',message:'',request_id:'PRIVATE_RELEASE_REFRESH',...FINANCE_PROFILE,access_token:access,refresh_token:refresh+'-rotated',expire_in:14400});
 };
 const value=await runEscrowReleaseLedger(f.env,{operation:'step',month,now:f.now,fetchImpl});assert.equal(external,2);assert.equal(f.calls.length,1);assert.equal(value.active.progress.pages_read,1);
});

test('missing and null payout observations retain released identities without manufacturing zero money',async t=>{
 const f=await fixture(t);f.state.respond=({low})=>response({escrow_list:[row('MISSING_PAYOUT',undefined,low+1),row('NULL_PAYOUT',null,low+2),row('EXPLICIT_ZERO_PAYOUT',0,low+3)],more:false});
 const value=await f.invoke();assert.equal(value.active.progress.pages_read,1);assert.equal(value.active.rows.length,3);assert.deepEqual(value.active.rows.map(item=>item.payout_raw),[null,null,'0']);assert.equal(value.active.ambiguous_orders,0);
 const before=f.calls.length;assert.deepEqual((await f.invoke('read')).active.rows,value.active.rows);assert.equal(f.calls.length,before);
});

test('a mid-page storage failure rolls back observations and cursor together before retrying the same source page',async t=>{
 const f=await fixture(t),prepare=f.db.prepare.bind(f.db);let injected=false;
 f.state.respond=({low})=>response({escrow_list:[row('ATOMIC_A',12.5,low+1),row('ATOMIC_B',20,low+2)],more:false});
 f.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('INSERT INTO finance_escrow_release_pages')){const execute=statement.run.bind(statement);statement.run=async()=>{if(!injected){injected=true;throw Error('PRIVATE_ATOMIC_FAILURE');}return execute();};}return statement;};
 const failed=await f.invoke();assert.equal(injected,true);assert.equal(failed.active.progress.pages_read,0);assert.equal(failed.active.rows.length,0);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM finance_escrow_release_rows').get().n,0);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS n FROM finance_escrow_release_pages').get().n,0);assert.equal(failed.published,null);
 f.clock.time+=301000;const retried=await f.invoke();assert.equal(retried.active.progress.pages_read,1);assert.equal(retried.active.rows.length,2);assert.equal(f.calls.length,2);assert.deepEqual(f.calls.map(item=>item.page),[1,1]);
});

test('historical DST-forward windows begin at the first existing local instant when midnight was skipped',async t=>{
 const localDate=seconds=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(seconds*1000));
 const localHour=seconds=>new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(new Date(seconds*1000));
 for(const [year,day,index] of [[2000,8,1],[2017,15,2]]){
  const f=await fixture(t),selected=year+'-10';f.state.respond=({low,high})=>response({escrow_list:[row('DST_'+low,12,low),row('DST_'+high,12,high)],more:false});let complete;
  for(let step=0;step<8;step++){const value=await f.invoke('step',{month:selected});if(value.published?.status==='COMPLETE'){complete=value;break;}f.clock.time+=61000;}
  assert.ok(complete,selected+' should finish its five windows');assert.equal(complete.published.progress.windows_total,5);assert.equal(f.calls.length,5);
  const boundary=f.calls[index].low,expected=selected+'-'+String(day).padStart(2,'0');assert.equal(boundary,Date.UTC(year,9,day,3)/1000);assert.equal(localDate(boundary),expected);assert.equal(localHour(boundary),'01');assert.equal(localDate(boundary-1),selected+'-'+String(day-1).padStart(2,'0'));
  for(let position=1;position<f.calls.length;position++)assert.equal(f.calls[position].low,f.calls[position-1].high);
  assert.equal(complete.published.rows.length,5);assert.equal(complete.published.ambiguous_orders,0);assert.equal(complete.published.time_to-complete.published.time_from,31*86400-3600);
 }
});

test('historical DST fallback retains four contiguous February windows including the repeated hour',async t=>{
 const f=await fixture(t),selected='2018-02';f.state.respond=({low,high})=>response({escrow_list:[row('FOLD_'+low,12,low),row('FOLD_'+high,12,high)],more:false});let complete;
 for(let step=0;step<7;step++){const value=await f.invoke('step',{month:selected});if(value.published?.status==='COMPLETE'){complete=value;break;}f.clock.time+=61000;}
 assert.ok(complete);assert.equal(complete.published.progress.windows_total,4);assert.equal(f.calls.length,4);assert.equal(complete.published.time_from,Date.UTC(2018,1,1,2)/1000);assert.equal(complete.published.time_to,Date.UTC(2018,2,1,3)/1000);
 assert.deepEqual(f.calls.map(item=>item.high-item.low),[7*86400,7*86400,7*86400+3600,7*86400]);for(let index=1;index<f.calls.length;index++)assert.equal(f.calls[index].low,f.calls[index-1].high);
 assert.equal(complete.published.rows.length,4);assert.equal(complete.published.ambiguous_orders,0);assert.equal(complete.published.time_to-complete.published.time_from,28*86400+3600);
});
