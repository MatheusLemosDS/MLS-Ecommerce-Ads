import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {commercialContextFromPrincipal} from '../../cloudflare/src/commercial-context.mjs';
import {createTenantDatabase} from '../../cloudflare/src/tenant-storage.mjs';
import {FINANCIAL_OBLIGATION_SCHEMA,createFinancialObligationRegistry,createFinancialObligationWorker} from '../src/financial-obligation-worker.mjs';
import {FINANCIAL_OBLIGATION_PATH,FINANCIAL_OBLIGATION_REQUEST_MAXIMUM,financialObligationSnapshotHash,projectFinancialObligationResponse,financialObligationResponseMatches} from '../src/financial-obligation-frame.mjs';

const secret='synthetic-obligation-router-secret-'.repeat(2),fixed=Date.parse('2026-11-13T18:00:00Z'),now=()=>fixed;
const scope={organization_id:'legacy-brazacommerce',store_id:'legacy-shopee',currency:'BRL'},month='2026-11';
const expenseId='00000000-0000-4000-8000-000000000001';
const read=(extra={})=>({schema:'financial_obligation_source_request_v1',operation:'read',month,...extra});
async function snapshot(extra={}){
  const source={schema:'app_expense_observation_v1',scope,month,ledger_revision:1,mode:'DRAFT',captured_at:new Date(fixed).toISOString(),source_hash:'0'.repeat(64),items:[{expense_id:expenseId,amount_cents:5000,status:'OPEN',competence_month:month,due_date:'2026-11-20',paid_date:null,updated_at:new Date(fixed-600000).toISOString()}],...extra};
  return {...source,source_hash:await financialObligationSnapshotHash(source)};
}
async function command(extra={},sourceExtra={}){return {schema:'financial_obligation_source_request_v1',operation:'register',request_id:crypto.randomUUID(),expected_revision:0,snapshot:await snapshot(sourceExtra),...extra};}
const req=(body,{origin='https://auth.brazacommerce.com.br',path=FINANCIAL_OBLIGATION_PATH,method='POST',key=secret,headers={},raw=false}={})=>new Request(origin+path,{method,headers:{'content-type':'application/json','x-braza-finance-router':key,...headers},...(method==='GET'?{}:{body:raw?body:JSON.stringify(body)})});
class ObservedD1 extends D1{
  sql=[];executed=[];beforeBatch=null;afterBatch=null;
  prepare(sql){this.sql.push(sql);const statement=super.prepare(sql);statement.sql=sql;for(const operation of ['run','all','first']){const execute=statement[operation];statement[operation]=async(...args)=>{this.executed.push(sql);return execute(...args);};}return statement;}
  async batch(statements){if(this.beforeBatch)await this.beforeBatch(statements);const result=await super.batch(statements);if(this.afterBatch)await this.afterBatch(statements);return result;}
}
function fixture({authorized=async()=>true}={}){
  const db=new ObservedD1(),env={FINANCE_ROUTER_SECRET:secret,FINANCE_DB:db,ADMIN_DB:new D1()},registry=createFinancialObligationRegistry(db,{scope,actor_id:'synthetic-owner',authorize:authorized,now});
  return {db,env,registry,worker:createFinancialObligationWorker({now}),close(){db.db.close();env.ADMIN_DB.db.close();}};
}
const count=(db,table)=>db.db.prepare('SELECT COUNT(*) n FROM finance_financial_obligation_'+table).get().n;
const suffix=(code,status)=>error=>error.code==='FINANCIAL_CASH_OBLIGATION_'+code&&(status===undefined||error.status===status);

test('cold registry and private worker READ remain SELECT-only with no fabricated obligations or balances',async()=>{
  const f=fixture();try{
    const direct=await f.registry.read(read()),response=await f.worker.fetch(req(read()),f.env),frame=await response.json();assert.equal(response.status,200);assert.ok(projectFinancialObligationResponse(direct));assert.deepEqual(frame,direct);assert.equal(frame.state,'NOT_CAPTURED');assert.equal(frame.revision,0);assert.deepEqual(frame.items,[]);assert.equal(frame.snapshot_id,null);assert.equal(Object.hasOwn(frame,'bank_balance_cents'),false);
    assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);assert.ok(f.db.executed.length>0&&f.db.executed.every(sql=>/^SELECT\b/.test(sql)));
  }finally{f.close();}
});

test('register, paginated read and exact retry preserve immutable as-of capture identity',async()=>{
  const f=fixture();try{
    const source=await snapshot({items:[0,1].map(index=>({expense_id:'00000000-0000-4000-8000-00000000000'+(index+1),amount_cents:5000+index,status:'OPEN',competence_month:month,due_date:'2026-11-20',paid_date:null,updated_at:new Date(fixed-600000).toISOString()}))}),input=await command({snapshot:source});
    const saved=await f.registry.register(input),retry=await f.registry.register(input);assert.equal(saved.revision,1);assert.equal(retry.replayed,true);assert.equal(retry.snapshot_id,saved.snapshot_id);assert.ok(financialObligationResponseMatches(input,retry));
    const first=await f.registry.read(read({limit:1})),second=await f.registry.read(read({limit:1,cursor:first.next_cursor}));assert.ok(projectFinancialObligationResponse(first));assert.ok(projectFinancialObligationResponse(second));assert.notEqual(first.items[0].record_id,second.items[0].record_id);assert.equal(second.next_cursor,null);assert.equal(first.items[0].evidence_id,'expense-evidence:'+saved.snapshot_id);assert.equal(first.items[0].quality,'REVIEW');assert.equal(first.captured_at,source.captured_at);
    assert.equal(count(f.db,'snapshots'),1);assert.equal(count(f.db,'requests'),1);assert.equal(count(f.db,'heads'),1);
    await assert.rejects(async()=>f.registry.register({...input,snapshot:await snapshot({items:[{...source.items[0],amount_cents:9}]})}),suffix('REQUEST_ID_REUSED',409));
  }finally{f.close();}
});

test('same source revision with changed content, backwards revisions and backwards captures cannot replace the current head',async()=>{
  const f=fixture();try{
    const saved=await f.registry.register(await command({}, {ledger_revision:2}));
    const changed=await snapshot({ledger_revision:2,items:[{expense_id:expenseId,amount_cents:9000,status:'OPEN',competence_month:month,due_date:'2026-11-20',paid_date:null,updated_at:new Date(fixed-600000).toISOString()}]});
    await assert.rejects(()=>f.registry.register(commandValue(changed,1)),suffix('SOURCE_REVISION_CONFLICT',409));
    await assert.rejects(()=>f.registry.register(commandValue({...changed,ledger_revision:1},1)),suffix('SOURCE_HASH_INVALID',400));
    await assert.rejects(async()=>f.registry.register(commandValue(await snapshot({ledger_revision:1}),1)),suffix('SOURCE_STALE',409));
    await assert.rejects(async()=>f.registry.register(commandValue(await snapshot({ledger_revision:3,captured_at:new Date(fixed-1000).toISOString()}),1)),suffix('SOURCE_STALE',409));
    const current=await f.registry.read(read());assert.equal(current.snapshot_id,saved.snapshot_id);assert.equal(current.source_revision,2);assert.equal(current.revision,1);assert.equal(count(f.db,'snapshots'),1);
  }finally{f.close();}
});
const commandValue=(source,expected_revision=0)=>({schema:'financial_obligation_source_request_v1',operation:'register',request_id:crypto.randomUUID(),expected_revision,snapshot:source});

test('expired, future and hash-corrupt captures are rejected before schema creation',async()=>{
  for(const [source,code,status] of [[await snapshot({captured_at:new Date(fixed-301000).toISOString()}),'SOURCE_STALE',409],[await snapshot({captured_at:new Date(fixed+1000).toISOString()}),'SOURCE_STALE',409],[{...await snapshot(),source_hash:'f'.repeat(64)},'SOURCE_HASH_INVALID',400]]){
    const f=fixture();try{await assert.rejects(()=>f.registry.register(commandValue(source)),suffix(code,status));assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);}finally{f.close();}
  }
});

test('freshness expiration is explicit and a newer as-of capture retains prior history and invalidates old cursors',async()=>{
  const f=fixture();try{
    const first=await f.registry.register(await command()),late=createFinancialObligationRegistry(f.db,{scope,actor_id:'synthetic-owner',authorize:async()=>true,now:()=>fixed+301000});
    const old=await late.read(read());assert.equal(old.state,'STALE');assert.equal(old.items[0].quality,'REVIEW');assert.equal(old.snapshot_id,first.snapshot_id);
    const updated=await late.register(commandValue(await snapshot({captured_at:new Date(fixed+301000).toISOString()}),1));assert.equal(updated.revision,2);assert.notEqual(updated.snapshot_id,first.snapshot_id);assert.equal(updated.source_hash,first.source_hash);assert.equal(count(f.db,'snapshots'),2);
    await assert.rejects(()=>late.read(read({cursor:'1:'+expenseId})),suffix('CURSOR_STALE',409));
    await assert.rejects(()=>f.db.prepare('UPDATE finance_financial_obligation_snapshots SET source_hash=?').bind('0'.repeat(64)).run(),/financial_obligation_immutable/);
    await assert.rejects(()=>f.db.prepare('DELETE FROM finance_financial_obligation_requests').run(),/financial_obligation_immutable/);assert.equal(count(f.db,'requests'),2);
  }finally{f.close();}
});

test('lost acknowledgement after a committed batch returns its original receipt and never repeats a capture',async()=>{
  const f=fixture();try{
    let lost=false;f.db.afterBatch=async statements=>{if(!statements.some(statement=>/^UPDATE finance_financial_obligation_state/.test(statement.sql)))return;f.db.afterBatch=null;lost=true;throw Error('SYNTHETIC_LOST_ACK');};
    const input=await command(),receipt=await f.registry.register(input);assert.equal(lost,true);assert.equal(receipt.replayed,true);assert.equal(receipt.revision,1);const retry=await f.registry.register(input);assert.equal(retry.snapshot_id,receipt.snapshot_id);assert.equal(count(f.db,'snapshots'),1);assert.equal(count(f.db,'requests'),1);
  }finally{f.close();}
});

test('two concurrent registrations race on the same revision and only the winning complete snapshot becomes visible',async()=>{
  const f=fixture();try{
    const a=await command(),b=await command({}, {ledger_revision:2});let raced=false,winner;
    f.db.beforeBatch=async statements=>{if(!statements.some(statement=>/^UPDATE finance_financial_obligation_state/.test(statement.sql)))return;f.db.beforeBatch=null;raced=true;winner=await f.registry.register(b);};
    await assert.rejects(()=>f.registry.register(a),suffix('REVISION_CONFLICT',409));assert.equal(raced,true);assert.equal(winner.revision,1);
    const readback=await f.registry.read(read());assert.equal(readback.source_revision,2);assert.equal(readback.snapshot_id,winner.snapshot_id);assert.equal(count(f.db,'snapshots'),1);assert.equal(count(f.db,'requests'),1);
  }finally{f.close();}
});

test('authorization revocation and partial storage fail closed without writing a source fact',async()=>{
  const f=fixture({authorized:async({phase})=>phase!=='before-transaction'});try{
    await assert.rejects(async()=>f.registry.register(await command()),suffix('AUTHORIZATION_REVOKED',403));assert.equal(count(f.db,'snapshots'),0);assert.equal(count(f.db,'requests'),0);assert.equal(count(f.db,'state'),0);
  }finally{f.close();}
  const partial=fixture();try{await partial.db.prepare(FINANCIAL_OBLIGATION_SCHEMA[0]).run();await assert.rejects(()=>partial.registry.read(read()),suffix('STORAGE_INVALID',503));}finally{partial.close();}
});

test('actual private worker rejects foreign origin, key, methods, scope injection and oversized bodies before source writes',async()=>{
  const f=fixture();try{
    const accepted=await command();
    for(const [request,status,unused] of [[req(accepted,{origin:'https://synthetic.invalid'}),404,true],[req(accepted,{key:'untrusted'}),403,true],[req(accepted,{method:'GET'}),405,true],[req(accepted,{path:FINANCIAL_OBLIGATION_PATH+'?scope=other'}),400,true],[req(accepted,{headers:{'content-length':String(FINANCIAL_OBLIGATION_REQUEST_MAXIMUM+1)}}),400,true],[req(' '.repeat(FINANCIAL_OBLIGATION_REQUEST_MAXIMUM+1),{raw:true}),400,false],[req({...read(),scope}),400,false],[req({...accepted,actor:'OWNER'}),400,false],[req({...accepted,snapshot:{...accepted.snapshot,items:[{...accepted.snapshot.items[0],description:'SYNTHETIC_PRIVATE'}]}}),400,false]]){
      const response=await f.worker.fetch(request,f.env);assert.equal(response.status,status);const error=await response.json();assert.equal(error.schema,'financial_obligation_error_v1');assert.doesNotMatch(JSON.stringify(error),/SYNTHETIC_PRIVATE|description|amount_cents/);if(unused)assert.equal(request.bodyUsed,false);
    }
    assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);assert.equal(f.db.executed.length,0);
  }finally{f.close();}
});

test('two real commercial namespaces isolate the same original expense ID and reject another tenant database handle',async()=>{
  const raw=new ObservedD1(),contexts=[],environments=[];
  try{
    for(const suffix of ['a','b']){
      const context=await commercialContextFromPrincipal({kind:'account',userId:'synthetic-user-'+suffix,organizationId:'synthetic-org-'+suffix,storeId:'synthetic-store-'+suffix,sessionId:'synthetic-session-'+suffix,membershipId:'synthetic-membership-'+suffix,role:'FINANCE',authorizationRevision:1,capabilities:['finance.read','finance.write','bank.read','bank.write']},{requiredCapability:'bank.write'});contexts.push(context);environments.push({FINANCE_ROUTER_SECRET:secret,COMMERCIAL_CONTEXT:context,FINANCE_DB:createTenantDatabase(raw,context,{domain:'finance'}),ADMIN_DB:new D1()});
    }
    const worker=createFinancialObligationWorker({now}),sourceFor=index=>({...scope,organization_id:contexts[index].organizationId,store_id:contexts[index].storeId}),one=await command({}, {scope:sourceFor(0)});
    assert.equal((await worker.fetch(req(one),environments[0])).status,200);assert.equal((await worker.fetch(req(one),environments[1])).status,400);
    const b=await command({}, {scope:sourceFor(1),items:[{...one.snapshot.items[0],amount_cents:9000}]});assert.equal((await worker.fetch(req(b),environments[1])).status,200);
    const aFrame=await(await worker.fetch(req(read()),environments[0])).json(),bFrame=await(await worker.fetch(req(read()),environments[1])).json();assert.equal(aFrame.items[0].expense_id,bFrame.items[0].expense_id);assert.equal(aFrame.items[0].amount_cents,5000);assert.equal(bFrame.items[0].amount_cents,9000);assert.notEqual(aFrame.snapshot_id,bFrame.snapshot_id);assert.equal(aFrame.revision,1);assert.equal(bFrame.revision,1);
    const swapped=await worker.fetch(req(read()),{...environments[1],FINANCE_DB:environments[0].FINANCE_DB});assert.equal(swapped.status,403);assert.doesNotMatch(await swapped.text(),/5000|9000|obligation:/);
  }finally{raw.db.close();for(const env of environments)env.ADMIN_DB.db.close();}
});

for(const minify of [false,true])test('actual obligation worker survives Finance ESM bundling with its fixed guards, minify='+minify,async()=>{
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../src/financial-obligation-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
  const worker=(await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'))).createFinancialObligationWorker({now});
  const f=fixture();try{assert.equal((await worker.fetch(req(read(),{key:'untrusted'}),f.env)).status,403);const input=await command(),response=await worker.fetch(req(input),f.env);assert.equal(response.status,200);assert.ok(financialObligationResponseMatches(input,await response.json()));assert.equal(count(f.db,'snapshots'),1);}finally{f.close();}
});
