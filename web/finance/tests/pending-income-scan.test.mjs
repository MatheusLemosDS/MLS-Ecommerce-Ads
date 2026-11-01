import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {readFinanceIncomeDetail,readFinancePendingIncomePage} from '../src/income-detail.mjs';
import {readOrStepFinancePendingIncomeScan} from '../src/pending-income-scan.mjs';
import {projectPendingIncomeScanFrame,projectPendingIncomeScanRequest} from '../src/pending-income-frame.mjs';

const base=Date.UTC(2026,10,1,14),stamp=base/1000;
const providerRow=(index,amount=47.51)=>({order_sn:'SYNTHETIC_PROVIDER_ORDER_'+index,currency:'BRL',status:'Pending',description:'Order Income',payment_method:'PIX',estimated_escrow_amount:amount,estimated_payout_time:stamp+86400,creation_date:stamp-86400});
const body=(rows,cursor='',pageSize=100)=>({error:'',response:{list:rows,next_page:{cursor,page_size:pageSize}}});
async function fixture(t){
 const db=new D1();t.after(()=>db.db.close());const clock={time:base},now=()=>clock.time,env={FINANCE_DB:db,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,39).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:'PRIVATE_PENDING_SCAN_KEY'};
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:'PRIVATE_PENDING_SCAN_ACCESS',refresh_token:'PRIVATE_PENDING_SCAN_REFRESH',expires_at:stamp+86400});
 const calls=[],state={handler:()=>body([providerRow(1)])};
 const fetchImpl=async request=>{const url=new URL(request.url);calls.push({url,request});assert.equal(request.method,'GET');assert.equal(request.body,null);assert.equal(url.pathname,'/api/v2/payment/get_income_detail');return Response.json(await state.handler(url));};
 const invoke=operation=>readOrStepFinancePendingIncomeScan(env,{operation},{now,fetchImpl});
 return {db,clock,now,env,store,state,calls,fetchImpl,read:()=>invoke('read'),step:()=>invoke('step'),advance:seconds=>clock.time+=seconds*1000};
}

test('Pending scan read is passive and its request and result projectors reject unknown fields',async t=>{
 const f=await fixture(t),read=await f.read();assert.ok(projectPendingIncomeScanFrame(read));assert.equal(read.scan,null);assert.equal(read.report,null);assert.equal(f.calls.length,0);
 for(const invalid of [null,{},[],{operation:'refresh'},{operation:'read',cursor:'PRIVATE_CURSOR'}]){assert.equal(projectPendingIncomeScanRequest(invalid),null);await assert.rejects(readOrStepFinancePendingIncomeScan(f.env,invalid,{now:f.now,fetchImpl:f.fetchImpl}),error=>error.code==='FINANCE_PENDING_INCOME_SCAN_REQUEST_INVALID');}
 for(const invalid of [{...read,next_cursor:'PRIVATE_CURSOR'},{...read,checked_at:-1},{...read,basis:'BANK_PROFIT'}])assert.equal(projectPendingIncomeScanFrame(invalid),null);
});

test('two provider pages publish 117 private entries only at terminal cursor and freeze dates across midnight',async t=>{
 const f=await fixture(t),firstRows=Array.from({length:100},(_,i)=>providerRow(i));f.clock.time=Date.UTC(2026,10,2,2,59,40);
 f.state.handler=url=>url.searchParams.get('cursor')===''?body(firstRows,'PRIVATE_CURSOR_ALPHA'):body(Array.from({length:17},(_,i)=>providerRow(100+i)),'',17);
 const first=await f.step();assert.equal(first.scan.state,'RUNNING');assert.equal(first.scan.pages_read,1);assert.equal(first.scan.unique_entries,100);assert.equal(first.report,null);assert.equal(f.calls.length,1);assert.doesNotMatch(JSON.stringify(first),/PRIVATE_|SYNTHETIC_PROVIDER_ORDER/);
 const frozen={date_from:f.calls[0].url.searchParams.get('date_from'),date_to:f.calls[0].url.searchParams.get('date_to')};assert.deepEqual(frozen,{date_from:'2026-10-31',date_to:'2026-11-01'});
 f.advance(61);const complete=await f.step();assert.equal(complete.scan.state,'COMPLETE');assert.equal(complete.report.rows.length,117);assert.equal(complete.report.unique_orders,117);assert.equal(complete.report.pages_read,2);assert.equal(complete.report.known_amount_cents,117*4751);assert.equal(complete.report.amount_complete,true);assert.equal(complete.report.source_oldest_at,first.scan.updated_at);assert.ok(complete.report.source_latest_at>complete.report.source_oldest_at);assert.equal(f.calls.length,2);
 assert.equal(f.calls[1].url.searchParams.get('cursor'),'PRIVATE_CURSOR_ALPHA');for(const [name,value] of Object.entries(frozen))assert.equal(f.calls[1].url.searchParams.get(name),value);assert.ok(projectPendingIncomeScanFrame(complete));assert.doesNotMatch(JSON.stringify(complete),/PRIVATE_|SYNTHETIC_PROVIDER_ORDER|next_cursor|order_sn/);
 const rows=f.db.db.prepare('SELECT payload FROM finance_pending_income_rows').all();assert.doesNotMatch(JSON.stringify(rows),/PRIVATE_PENDING_SCAN_|SYNTHETIC_PROVIDER_ORDER/);
 await f.step();await f.read();assert.equal(f.calls.length,2,'fresh complete reads and refreshes do not requery the provider');
});

test('short terminal page sizes are accepted only by the private scan page seam, retaining exact legacy semantics',async t=>{
 for(const pageSize of [17,100]){
  const f=await fixture(t);f.state.handler=()=>body(Array.from({length:17},(_,i)=>providerRow(i)),'',pageSize);const complete=await f.step();assert.equal(complete.scan.state,'COMPLETE');assert.equal(complete.report.rows.length,17);
 }
 const f=await fixture(t);f.state.handler=()=>body([providerRow(1)],'',1);
 await assert.rejects(readFinanceIncomeDetail(f.env,{now:f.now,fetchImpl:f.fetchImpl}),error=>error.upstream_diagnostic==='PAGE_SIZE_INVALID');
 const page=await readFinancePendingIncomePage(f.env,{cursor:'',date_from:'2026-10-31',date_to:'2026-11-01'},{now:f.now,fetchImpl:f.fetchImpl});assert.equal(page.frame.returned_count,1);assert.equal(page.next_cursor,'');
 for(const [rows,cursor,size] of [[[], 'PRIVATE_NEXT',0],[[providerRow(1)],'',0],[[providerRow(1)],'',101],[[providerRow(1)],'',-1],[[providerRow(1)],'',0.5]]){f.state.handler=()=>body(rows,cursor,size);await assert.rejects(readFinancePendingIncomePage(f.env,{cursor:'',date_from:'2026-10-31',date_to:'2026-11-01'},{now:f.now,fetchImpl:f.fetchImpl}),error=>error.upstream_diagnostic==='PAGE_SIZE_INVALID');}
});

test('cross-page identical entries deduplicate, while divergent entries for one order make the amount unknown',async t=>{
 const f=await fixture(t);f.state.handler=url=>url.searchParams.get('cursor')===''?body([providerRow(1),providerRow(2)],'PRIVATE_NEXT'):body([providerRow(2),providerRow(3),providerRow(1,50)]);
 await f.step();f.advance(61);const complete=await f.step();assert.equal(complete.scan.state,'COMPLETE');assert.equal(complete.report.rows.length,4);assert.equal(complete.report.unique_orders,3);assert.equal(complete.report.duplicate_entries,1);assert.equal(complete.report.conflicting_orders,1);assert.equal(complete.report.known_amount_cents,null);assert.equal(complete.report.amount_complete,false);assert.ok(projectPendingIncomeScanFrame(complete));
 const altered=structuredClone(complete);altered.report.known_amount_cents=19253;altered.report.amount_complete=true;assert.equal(projectPendingIncomeScanFrame(altered),null);
});

test('transient failure preserves the last complete publication and resumes the same cursor after retry and restart',async t=>{
 const f=await fixture(t),old=await f.step();assert.equal(old.scan.state,'COMPLETE');f.advance(901);
 let failed=false;f.state.handler=url=>{if(url.searchParams.get('cursor')==='')return body([providerRow(2)],'PRIVATE_RESUME');if(!failed){failed=true;throw Error('PRIVATE_NETWORK_FAILURE');}return body([providerRow(3)]);};
 const active=await f.step();assert.equal(active.scan.state,'RUNNING');assert.deepEqual(active.report,old.report);f.advance(61);const failure=await f.step();assert.equal(failure.scan.state,'RETRY_WAIT');assert.equal(failure.scan.error,'UNAVAILABLE');assert.deepEqual(failure.report,old.report);assert.equal(failure.scan.pages_read,1);const count=f.calls.length;
 await f.step();assert.equal(f.calls.length,count,'retry window is authoritative');f.advance(301);
 const facade={prepare:sql=>f.db.prepare(sql),batch:statements=>f.db.batch(statements)};const restarted=await readOrStepFinancePendingIncomeScan({...f.env,FINANCE_DB:facade},{operation:'step'},{now:f.now,fetchImpl:f.fetchImpl});assert.equal(restarted.scan.scan_id,active.scan.scan_id);assert.equal(restarted.scan.state,'COMPLETE');assert.equal(restarted.report.rows.length,2);assert.notEqual(restarted.report.scan_id,old.report.scan_id);assert.equal(f.calls.at(-1).url.searchParams.get('cursor'),'PRIVATE_RESUME');
 assert.equal(f.db.db.prepare('SELECT COUNT(*) count FROM finance_pending_income_scans').get().count,2);
});

test('repeated cursor, cursor cycles, reordered repeated pages and empty nonterminal pages fail without publishing partial data',async t=>{
 for(const kind of ['same','cycle','page','empty']){
  const f=await fixture(t);f.state.handler=url=>{const cursor=url.searchParams.get('cursor');if(cursor==='')return body([providerRow(1),providerRow(2)],'PRIVATE_A');if(kind==='same')return body([providerRow(3)],'PRIVATE_A');if(kind==='cycle'&&cursor==='PRIVATE_A')return body([providerRow(3)],'PRIVATE_B');if(kind==='cycle')return body([providerRow(4)],'PRIVATE_A');if(kind==='page')return body([providerRow(2),providerRow(1)],'PRIVATE_B');return body([],'PRIVATE_B');};
  await f.step();f.advance(61);let result=await f.step();if(kind==='cycle'){f.advance(61);result=await f.step();}
  assert.equal(result.scan.state,'ERROR',kind);assert.equal(result.scan.error,kind==='page'?'REPEATED_PAGE':kind==='empty'?'EMPTY_CONTINUATION':'REPEATED_CURSOR',kind);assert.equal(result.report,null);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|SYNTHETIC_PROVIDER_ORDER/);
 }
});

test('explicit zero and subcent unknown amounts remain distinct and invalid source currency never publishes',async t=>{
 const f=await fixture(t);f.state.handler=()=>body([providerRow(1,0),providerRow(2,10.123)]);const complete=await f.step();assert.equal(complete.report.unknown_amount_count,1);assert.equal(complete.report.rows.find(row=>row.estimated_escrow_raw==='0').estimated_escrow_cents,0);assert.equal(complete.report.known_amount_cents,null);assert.equal(complete.report.amount_complete,false);
 f.advance(901);f.state.handler=()=>body([{...providerRow(3),currency:'USD'}]);const failed=await f.step();assert.equal(failed.scan.state,'RETRY_WAIT');assert.equal(failed.scan.error,'INVALID_RESPONSE');assert.deepEqual(failed.report,complete.report);
});

test('source permission and timeout failures retain only a closed failure code',async t=>{
 for(const code of ['error_api_permission','error_limit']){const f=await fixture(t);f.state.handler=()=>({error:code,message:'PRIVATE_PROVIDER_BODY',request_id:'PRIVATE_REQUEST'});const result=await f.step();assert.equal(result.scan.state,'RETRY_WAIT');assert.equal(result.scan.error,code==='error_api_permission'?'PERMISSION_DENIED':'RATE_LIMIT');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|request_id|message/);}
 const f=await fixture(t),result=await readOrStepFinancePendingIncomeScan(f.env,{operation:'step'},{now:f.now,fetchImpl:f.fetchImpl,readPage:async()=>{const error=Error('PRIVATE_TIMEOUT_BODY');Object.defineProperty(error,'code',{value:'FINANCE_INCOME_DETAIL_TIMEOUT'});throw error;}});assert.equal(result.scan.error,'TIMEOUT');assert.equal(result.scan.state,'RETRY_WAIT');
});

test('active leases suppress duplicate reads and a late source cannot commit after lease expiry',async t=>{
 const f=await fixture(t);f.state.handler=()=>body([providerRow(1)],'PRIVATE_NEXT');await f.step();f.advance(61);let release,entered;const ready=new Promise(resolve=>entered=resolve),pending=readOrStepFinancePendingIncomeScan(f.env,{operation:'step'},{now:f.now,fetchImpl:f.fetchImpl,readPage:async()=>{entered();await new Promise(resolve=>release=resolve);return readFinancePendingIncomePage(f.env,{cursor:'PRIVATE_NEXT',date_from:'2026-10-31',date_to:'2026-11-01'},{now:f.now,fetchImpl:f.fetchImpl});}});await ready;
 const before=f.calls.length,leased=await f.step();assert.equal(leased.scan.pages_read,1);assert.equal(f.calls.length,before);f.advance(46);release();await pending;const result=await f.read();assert.equal(result.scan.pages_read,1);assert.equal(result.report,null);assert.equal(f.db.db.prepare('SELECT COUNT(*) count FROM finance_pending_income_pages').get().count,1);
});

test('an expired scan waits before restarting and retention keeps only active and published scans',async t=>{
 const f=await fixture(t),old=await f.step();f.advance(901);f.state.handler=()=>body([providerRow(2)],'PRIVATE_NEXT');const active=await f.step();f.advance(3600);const expired=await f.step();assert.equal(expired.scan.state,'ERROR');assert.equal(expired.scan.error,'SCAN_EXPIRED');assert.deepEqual(expired.report,old.report);const before=f.calls.length;await f.step();assert.equal(f.calls.length,before);
 f.advance(901);const next=await f.step();assert.notEqual(next.scan.scan_id,active.scan.scan_id);assert.deepEqual(next.report,old.report);assert.equal(f.db.db.prepare('SELECT COUNT(*) count FROM finance_pending_income_scans').get().count,2);assert.equal(f.db.db.prepare('SELECT COUNT(DISTINCT scan_id) count FROM finance_pending_income_rows').get().count,2);
});

test('row and page bounds expose LIMIT_REACHED without truncating or replacing a good publication',async t=>{
 const f=await fixture(t),old=await f.step();f.advance(901);f.state.handler=url=>{const cursor=url.searchParams.get('cursor'),index=cursor===''?0:Number(cursor.split('_').at(-1));return body(Array.from({length:100},(_,i)=>providerRow(index*100+i)),'PRIVATE_PAGE_'+(index+1));};
 let result;for(let i=0;i<11;i++){result=await f.step();f.advance(61);}assert.equal(result.scan.state,'LIMIT_REACHED');assert.equal(result.scan.error,'LIMIT_REACHED');assert.equal(result.scan.pages_read,10);assert.equal(result.scan.unique_entries,1000);assert.deepEqual(result.report,old.report);assert.equal(f.calls.length,12);
 const g=await fixture(t);g.state.handler=url=>{const cursor=url.searchParams.get('cursor'),index=cursor===''?0:Number(cursor.split('_').at(-1));return body([providerRow(index)],'PRIVATE_PAGE_'+(index+1));};
 for(let i=0;i<20;i++){result=await g.step();g.advance(61);}assert.equal(result.scan.state,'LIMIT_REACHED');assert.equal(result.scan.pages_read,20);assert.equal(result.report,null);const calls=g.calls.length;await g.step();assert.equal(g.calls.length,calls);
});

test('corrupt stored rows or cursor chains fail closed rather than showing a plausible total',async t=>{
 for(const change of [db=>db.db.prepare("UPDATE finance_pending_income_rows SET payload='{}'").run(),db=>db.db.prepare("UPDATE finance_pending_income_pages SET request_cursor_hash=?").run('a'.repeat(64)),db=>db.db.prepare("UPDATE finance_pending_income_scans SET next_cursor='PRIVATE_CHANGED'").run()]){const f=await fixture(t);f.state.handler=()=>body([providerRow(1)],'PRIVATE_NEXT');await f.step();change(f.db);await assert.rejects(f.read(),error=>error.code==='FINANCE_PENDING_INCOME_SCAN_STORAGE_INVALID');}
});

test('multibyte provider text cannot exceed the one-MiB transport budget or replace a previous publication',async t=>{
 const f=await fixture(t),old=await f.step();f.advance(901);const wide='💡'.repeat(80);
 f.state.handler=url=>{const cursor=url.searchParams.get('cursor'),index=cursor===''?0:Number(cursor.split('_').at(-1));return body(Array.from({length:100},(_,i)=>({...providerRow(index*100+i),status:wide,description:wide,payment_method:wide})),'PRIVATE_PAGE_'+(index+1));};
 let result;for(let i=0;i<11;i++){result=await f.step();if(result.scan.state==='LIMIT_REACHED')break;f.advance(61);}
 assert.equal(result.scan.state,'LIMIT_REACHED');assert.ok(result.scan.unique_entries<1000);assert.deepEqual(result.report,old.report);assert.ok(Buffer.byteLength(JSON.stringify(result))<=1048576);assert.ok(projectPendingIncomeScanFrame(result));
});

test('publication and progress invariants reject changed counts, duplicate rows, unsafe money and fictitious completion',async t=>{
 const f=await fixture(t);const complete=await f.step();
 for(const alter of [
  value=>value.scan.unique_entries++,
  value=>value.report.rows.push(structuredClone(value.report.rows[0])),
  value=>value.report.known_amount_cents++,
  value=>value.report.unknown_amount_count++,
  value=>value.report.conflicting_orders++,
  value=>value.report.source_oldest_at=value.report.started_at-1,
  value=>value.report.basis='BANK_RECEIPT',
  value=>value.scan.next_cursor='PRIVATE_CURSOR',
  value=>value.scan.error='PRIVATE_PROVIDER_MESSAGE',
  value=>value.checked_at=value.scan.updated_at-1,
 ]){const altered=structuredClone(complete);alter(altered);assert.equal(projectPendingIncomeScanFrame(altered),null);}
 const row=providerRow(2,1000000000000);f.advance(901);f.state.handler=()=>body(Array.from({length:100},(_,i)=>({...row,order_sn:'SYNTHETIC_PROVIDER_ORDER_BIG_'+i})));const unsafe=await f.step();assert.equal(unsafe.scan.state,'COMPLETE');assert.equal(unsafe.report.unknown_amount_count,0);assert.equal(unsafe.report.known_amount_cents,null);assert.equal(unsafe.report.amount_complete,false);assert.ok(projectPendingIncomeScanFrame(unsafe));
});


test('a backward provider clock never corrupts scan timestamps and the next valid invocation resumes',async t=>{
 const f=await fixture(t);f.state.handler=()=>{f.clock.time-=1000;return body([providerRow(1)]);};
 await assert.rejects(f.step(),error=>error.code==='FINANCE_PENDING_INCOME_SCAN_CLOCK_INVALID');
 const stored=f.db.db.prepare('SELECT state,started_at,updated_at,pages_read,lease_owner,lease_until FROM finance_pending_income_scans').get();assert.deepEqual({...stored},{state:'RUNNING',started_at:stamp,updated_at:stamp,pages_read:0,lease_owner:null,lease_until:null});assert.equal(f.db.db.prepare('SELECT COUNT(*) count FROM finance_pending_income_publication').get().count,0);
 f.clock.time=base;f.state.handler=()=>body([providerRow(1)]);const resumed=await f.step();assert.equal(resumed.scan.state,'COMPLETE');assert.equal(resumed.report.rows.length,1);assert.ok(projectPendingIncomeScanFrame(resumed));
});

test('the RPC frame cannot claim more entries than one hundred per observed page',async t=>{
 const f=await fixture(t);f.state.handler=url=>url.searchParams.get('cursor')===''?body(Array.from({length:100},(_,i)=>providerRow(i)),'PRIVATE_NEXT'):body(Array.from({length:17},(_,i)=>providerRow(100+i)));
 const active=await f.step(),zeroPages=structuredClone(active);zeroPages.scan.pages_read=0;assert.equal(projectPendingIncomeScanFrame(zeroPages),null);
 f.advance(61);const complete=await f.step(),onePage=structuredClone(complete);onePage.scan.pages_read=1;onePage.report.pages_read=1;assert.equal(projectPendingIncomeScanFrame(onePage),null);
 const impossibleDuplicates=structuredClone(complete);impossibleDuplicates.scan.duplicate_entries=84;impossibleDuplicates.report.duplicate_entries=84;assert.equal(projectPendingIncomeScanFrame(impossibleDuplicates),null);assert.ok(projectPendingIncomeScanFrame(complete));
});

test('the observed short terminal page without next_page completes 182 entries and stores private terminal evidence',async t=>{
 const f=await fixture(t);f.state.handler=url=>url.searchParams.get('cursor')===''?body(Array.from({length:100},(_,i)=>providerRow(i)),'PRIVATE_PAGE_100'):{error:'',response:{list:Array.from({length:82},(_,i)=>providerRow(100+i))}};
 const first=await f.step();assert.equal(first.scan.state,'RUNNING');assert.equal(first.report,null);f.advance(61);const complete=await f.step();assert.equal(complete.scan.state,'COMPLETE');assert.equal(complete.report.rows.length,182);assert.equal(complete.report.pages_read,2);assert.equal(complete.report.known_amount_cents,182*4751);assert.equal(f.calls.length,2);assert.ok(projectPendingIncomeScanFrame(complete));
 const evidence=f.db.db.prepare('SELECT scan_id,checked_at,kind FROM finance_pending_income_terminal_evidence').all();assert.deepEqual(evidence.map(row=>({...row})),[{scan_id:complete.scan.scan_id,checked_at:complete.report.source_latest_at,kind:'SHORT_PAGE_WITHOUT_NEXT'}]);assert.doesNotMatch(JSON.stringify(complete),/terminal_evidence|SHORT_PAGE_WITHOUT_NEXT|PRIVATE_PAGE_100/);
 const result=await f.read();assert.deepEqual(result.report,complete.report);assert.equal(f.calls.length,2);
});

test('only absent next_page on a short private page permits the observed terminal normalization',async t=>{
 const f=await fixture(t),page={cursor:'PRIVATE_NEXT',date_from:'2026-10-31',date_to:'2026-11-01'},options={now:f.now,fetchImpl:f.fetchImpl};
 f.state.handler=()=>({error:'',response:{list:Array.from({length:82},(_,i)=>providerRow(i))}});
 const short=await readFinancePendingIncomePage(f.env,page,options);assert.equal(short.next_cursor,'');assert.equal(short.terminal_evidence,'SHORT_PAGE_WITHOUT_NEXT');assert.equal(short.frame.returned_count,82);
 await assert.rejects(readFinanceIncomeDetail(f.env,options),error=>error.upstream_diagnostic==='PAGE_CURSOR_INVALID','legacy first-page contract remains strict');
 for(const next of [null,{},[],{cursor:null},{cursor:123},'PRIVATE_MALFORMED']){f.state.handler=()=>({error:'',response:{list:[providerRow(1)],next_page:next}});await assert.rejects(readFinancePendingIncomePage(f.env,page,options),error=>error.upstream_diagnostic==='PAGE_CURSOR_INVALID');}
 f.state.handler=()=>({error:'',response:{list:Array.from({length:100},(_,i)=>providerRow(i))}});await assert.rejects(readFinancePendingIncomePage(f.env,page,options),error=>error.upstream_diagnostic==='PAGE_CURSOR_INVALID','a full page without a cursor cannot prove completion');
 f.state.handler=()=>body([providerRow(1)],'PRIVATE_STILL_MORE',1);const ongoing=await readFinancePendingIncomePage(f.env,page,options);assert.equal(ongoing.next_cursor,'PRIVATE_STILL_MORE');assert.equal(ongoing.terminal_evidence,null);assert.equal(ongoing.frame.has_more,true);
 f.state.handler=()=>body([providerRow(1)],'',1);const explicit=await readFinancePendingIncomePage(f.env,page,options);assert.equal(explicit.terminal_evidence,'EMPTY_CURSOR');
});

test('an absent next_page on an empty private page records the same narrow terminal evidence',async t=>{
 const f=await fixture(t);f.state.handler=()=>({error:'',response:{list:[]}});const complete=await f.step();assert.equal(complete.scan.state,'COMPLETE');assert.equal(complete.report.rows.length,0);assert.equal(complete.report.known_amount_cents,0);assert.equal(complete.report.amount_complete,true);assert.equal(f.db.db.prepare('SELECT kind FROM finance_pending_income_terminal_evidence').get().kind,'SHORT_PAGE_WITHOUT_NEXT');
});

test('terminal evidence, final rows and publication are atomic and evidence retention follows scan retention',async t=>{
 const f=await fixture(t),old=await f.step();assert.equal(f.db.db.prepare('SELECT kind FROM finance_pending_income_terminal_evidence').get().kind,'EMPTY_CURSOR');f.advance(901);
 f.state.handler=url=>url.searchParams.get('cursor')===''?body(Array.from({length:100},(_,i)=>providerRow(100+i)),'PRIVATE_PAGE_100'):{error:'',response:{list:Array.from({length:82},(_,i)=>providerRow(200+i))}};
 const active=await f.step();f.advance(61);const original=f.db.prepare.bind(f.db);f.db.prepare=sql=>{const statement=original(sql);if(sql.startsWith('INSERT INTO finance_pending_income_publication'))statement.run=async()=>{throw Error('PRIVATE_PUBLICATION_FAILURE');};return statement;};
 const failure=await f.step();assert.equal(failure.scan.state,'RETRY_WAIT');assert.equal(failure.scan.pages_read,1);assert.equal(failure.scan.unique_entries,100);assert.deepEqual(failure.report,old.report);
 assert.equal(f.db.db.prepare('SELECT COUNT(*) count FROM finance_pending_income_terminal_evidence WHERE scan_id=?').get(active.scan.scan_id).count,0);
 f.db.prepare=original;f.advance(301);const complete=await f.step();assert.equal(complete.scan.state,'COMPLETE');assert.equal(complete.report.rows.length,182);assert.equal(f.db.db.prepare('SELECT COUNT(*) count FROM finance_pending_income_terminal_evidence').get().count,2);
 f.advance(901);f.state.handler=()=>body([providerRow(999)],'PRIVATE_NEW_SCAN');await f.step();assert.equal(f.db.db.prepare('SELECT COUNT(*) count FROM finance_pending_income_scans').get().count,2);assert.equal(f.db.db.prepare('SELECT COUNT(*) count FROM finance_pending_income_terminal_evidence').get().count,1);assert.equal(f.db.db.prepare('SELECT scan_id FROM finance_pending_income_terminal_evidence').get().scan_id,complete.scan.scan_id);
});
