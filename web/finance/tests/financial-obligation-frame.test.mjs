import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {FINANCIAL_OBLIGATION_PATH,FINANCIAL_OBLIGATION_FRESHNESS_SECONDS,projectFinancialObligationSnapshot,financialObligationSnapshotHash,projectFinancialObligationRequest,projectFinancialObligationResponse,financialObligationResponseMatches} from '../src/financial-obligation-frame.mjs';

const scope={organization_id:'synthetic-org',store_id:'synthetic-store',currency:'BRL'},month='2026-11',captured='2026-11-13T18:00:00.000Z',hash='a'.repeat(64);
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
const expense=(index=0,extra={})=>({expense_id:ids[index],amount_cents:10000,status:'OPEN',competence_month:month,due_date:'2026-11-20',paid_date:null,updated_at:'2026-11-12T15:00:00.000Z',...extra});
const snapshot=(extra={})=>({schema:'app_expense_observation_v1',scope,month,ledger_revision:7,mode:'DRAFT',captured_at:captured,source_hash:hash,items:[expense()],...extra});
const read=(extra={})=>({schema:'financial_obligation_source_request_v1',operation:'read',month,...extra});
const register=(extra={})=>({schema:'financial_obligation_source_request_v1',operation:'register',request_id:'synthetic-register',expected_revision:3,snapshot:snapshot(),...extra});
const until=new Date(Date.parse(captured)+FINANCIAL_OBLIGATION_FRESHNESS_SECONDS*1000).toISOString();
const item=(extra={})=>({record_id:'obligation:'+ids[0],expense_id:ids[0],revision:7,amount_cents:10000,status:'OPEN',competence_month:month,due_date:'2026-11-20',paid_date:null,source_updated_at:'2026-11-12T15:00:00.000Z',evidence_id:'expense-evidence:'+'b'.repeat(64),source_hash:hash,snapshot_id:'b'.repeat(64),quality:'REVIEW',account_id:'app-expense-ledger',...extra});
const workspace=(extra={})=>({schema:'financial_obligation_workspace_v1',scope,revision:4,month,source_revision:7,source_hash:hash,snapshot_id:'b'.repeat(64),captured_at:captured,fresh_until:until,state:'AVAILABLE',items:[item()],next_cursor:null,...extra});
const receipt=(extra={})=>({schema:'financial_obligation_registration_v1',scope,request_id:'synthetic-register',revision:4,snapshot_id:'b'.repeat(64),source_hash:hash,source_revision:7,captured_at:captured,fresh_until:until,replayed:false,quality:'REVIEW',...extra});

test('the private obligation contract accepts only minimized declared expenses and date-consistent statuses',()=>{
  assert.equal(FINANCIAL_OBLIGATION_PATH,'/internal/finance/financial-obligations-v1');
  assert.ok(projectFinancialObligationSnapshot(snapshot()));
  assert.ok(projectFinancialObligationSnapshot(snapshot({items:[expense(0,{status:'PAID',paid_date:'2026-11-12'})]})));
  assert.ok(projectFinancialObligationSnapshot(snapshot({items:[expense(0,{status:'CANCELLED',paid_date:'2026-11-12'})]})));
  for(const value of [snapshot({items:[expense(0,{status:'PAID'})]}),snapshot({items:[expense(0,{paid_date:'2026-11-12'})]}),snapshot({items:[expense(0,{description:'SYNTHETIC_PRIVATE'})]}),snapshot({items:[expense(0,{amount_cents:-1})]}),snapshot({items:[expense(0,{amount_cents:1.5})]}),snapshot({items:[expense(0,{amount_cents:Number.MAX_SAFE_INTEGER+1})]}),snapshot({items:[expense(0,{due_date:'2026-02-30'})]}),snapshot({items:[expense(0,{competence_month:'2026-12'})]}),snapshot({items:[expense(0,{updated_at:'2026-11-14T00:00:00.000Z'})]}),snapshot({items:[expense(),expense()]}),snapshot({scope:{...scope,account_id:'untrusted'}})])assert.equal(projectFinancialObligationSnapshot(value),null);
  assert.equal(projectFinancialObligationSnapshot(snapshot({captured_at:'2026-11-13T02:00:00.000Z',items:[expense(0,{status:'PAID',paid_date:'2026-11-13'})]})),null,'São Paulo still has the previous civil date');
});

test('manual totals do not become invented item obligations and ledger revision bounds remain explicit',()=>{
  for(const ledger_revision of [0,7])assert.ok(projectFinancialObligationSnapshot(snapshot({mode:'MANUAL',ledger_revision,items:[]})));
  assert.equal(projectFinancialObligationSnapshot(snapshot({mode:'MANUAL'})),null);
  assert.equal(projectFinancialObligationSnapshot(snapshot({ledger_revision:0})),null);
  assert.equal(projectFinancialObligationSnapshot(snapshot({ledger_revision:2147483646})),null);
});

test('snapshot content identity is stable across refresh times, object order and item order, but changes with material facts',async()=>{
  const a=snapshot({items:[expense(0),expense(1,{status:'PAID',paid_date:'2026-11-11'})]}),b={items:[{...a.items[1]},{...a.items[0]}],source_hash:'f'.repeat(64),captured_at:'2026-11-13T19:00:00.000Z',mode:a.mode,ledger_revision:a.ledger_revision,month:a.month,scope:{currency:'BRL',store_id:scope.store_id,organization_id:scope.organization_id},schema:a.schema};
  assert.equal(await financialObligationSnapshotHash(a),await financialObligationSnapshotHash(b));
  for(const value of [snapshot({items:[expense(0,{amount_cents:10001}),a.items[1]]}),snapshot({ledger_revision:8,items:a.items}),snapshot({items:[expense(0,{status:'CANCELLED'}),a.items[1]]})])assert.notEqual(await financialObligationSnapshotHash(a),await financialObligationSnapshotHash(value));
  await assert.rejects(()=>financialObligationSnapshotHash({...a,private:'SYNTHETIC_PRIVATE'}),/SNAPSHOT_INVALID/);
  assert.deepEqual(a.items.map(row=>row.expense_id),ids,'hashing does not reorder caller-owned arrays');
});

test('closed requests reject caller facts, getters, sparse arrays and malformed pagination before evaluation',()=>{
  assert.deepEqual(projectFinancialObligationRequest(read()),{...read(),limit:100,cursor:null});assert.ok(projectFinancialObligationRequest(register()));
  for(const value of [read({source:'browser'}),read({month:'2026-13'}),read({limit:101}),read({cursor:'04:'+ids[0]}),read({cursor:'9007199254740992:'+ids[0]}),register({expected_revision:-0}),register({expected_revision:Number.MAX_SAFE_INTEGER}),register({actor:'OWNER'}),{...register(),operation:'withdraw'}])assert.equal(projectFinancialObligationRequest(value),null);
  let invoked=false;const getter={...snapshot()};Object.defineProperty(getter,'items',{get(){invoked=true;return [];},enumerable:true});assert.equal(projectFinancialObligationSnapshot(getter),null);assert.equal(invoked,false);
  const sparse=new Array(1);assert.equal(projectFinancialObligationSnapshot(snapshot({items:sparse})),null);
  const extras=[expense()];extras.private='SYNTHETIC_PRIVATE';assert.equal(projectFinancialObligationSnapshot(snapshot({items:extras})),null);
  const symbol={...read(),[Symbol('private')]:true};assert.equal(projectFinancialObligationRequest(symbol),null);
});

test('workspaces and receipts keep source versions, IDs, evidence, freshness and REVIEW status coherent',()=>{
  assert.ok(projectFinancialObligationResponse(workspace()));assert.ok(projectFinancialObligationResponse(receipt()));
  assert.ok(projectFinancialObligationResponse(workspace({state:'STALE'})));
  assert.ok(projectFinancialObligationResponse(workspace({state:'NOT_CAPTURED',source_revision:null,source_hash:null,snapshot_id:null,captured_at:null,fresh_until:null,items:[]})));
  for(const value of [workspace({items:[item({record_id:'obligation:'+ids[1]})]}),workspace({items:[item({evidence_id:'other-evidence'})]}),workspace({items:[item({quality:'CONFIRMED'})]}),workspace({items:[item({source_hash:'b'.repeat(64)})]}),workspace({items:[item({revision:6})]}),workspace({items:[item({account_id:'bank-account'})]}),workspace({items:[item(),item()]}),workspace({next_cursor:'3:'+ids[0]}),workspace({fresh_until:'2026-11-13T18:05:01.000Z'}),workspace({state:'NOT_CAPTURED'}),receipt({quality:'CONFIRMED'}),receipt({source_revision:-1}),receipt({private:'SYNTHETIC_PRIVATE'})])assert.equal(projectFinancialObligationResponse(value),null);
});

test('response matching binds the precise month, scope, revision and as-of snapshot without treating a replay as a new write',()=>{
  assert.equal(financialObligationResponseMatches(read(),workspace()),true);assert.equal(financialObligationResponseMatches(register(),receipt()),true);assert.equal(financialObligationResponseMatches(register(),receipt({replayed:true})),true);
  for(const frame of [workspace({month:'2026-10',items:[]}),receipt({scope:{...scope,store_id:'other-store'}}),receipt({request_id:'other-request'}),receipt({revision:5}),receipt({source_hash:'c'.repeat(64)}),receipt({captured_at:'2026-11-13T18:01:00.000Z',fresh_until:'2026-11-13T18:06:00.000Z'})])assert.equal(financialObligationResponseMatches(frame.schema==='financial_obligation_workspace_v1'?read():register(),frame),false);
});

for(const minify of [false,true])test('bounded obligation projectors survive the real ESM bundle, minify='+minify,async()=>{
  const result=await build({entryPoints:[fileURLToPath(new URL('../src/financial-obligation-frame.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
  const frame=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  assert.equal(frame.financialObligationResponseMatches(register(),receipt()),true);assert.equal(frame.projectFinancialObligationResponse(workspace({items:[item({quality:'CONFIRMED'})]})),null);assert.equal(await frame.financialObligationSnapshotHash(snapshot()),await financialObligationSnapshotHash(snapshot()));
});
