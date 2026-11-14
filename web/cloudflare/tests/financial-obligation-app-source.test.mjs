import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';
import {BUSINESS_MONTH_SCHEMA} from '../src/business-month.mjs';
import {readExpenseLedger,mutateExpenseLedger} from '../src/expense-ledger.mjs';
import {captureFinancialExpenseObligationSnapshot,refreshFinancialExpenseObligations} from '../src/financial-obligation-app-source.mjs';
import {commercialContextFromPrincipal} from '../src/commercial-context.mjs';
import {createFinancialObligationWorker,createFinancialObligationRegistry} from '../../finance/src/financial-obligation-worker.mjs';
import {FINANCIAL_OBLIGATION_PATH,financialObligationSnapshotHash,projectFinancialObligationSnapshot,projectFinancialObligationResponse} from '../../finance/src/financial-obligation-frame.mjs';

const scope={organization_id:'legacy-brazacommerce',store_id:'legacy-shopee',currency:'BRL'},month='2026-11',fixed=Date.parse('2026-11-13T18:00:00Z'),now=()=>fixed;
const captureInput=(extra={})=>({scope,month,...extra});
const refreshInput=(extra={})=>({...captureInput(),expected_revision:0,request_id:crypto.randomUUID(),...extra});
async function fixture({seed=true}={}){
  const env={ADMIN_DB:new D1(),FINANCE_DB:new D1(),FINANCE_ROUTER_SECRET:'synthetic-obligation-router-secret-'.repeat(2)};
  await env.ADMIN_DB.batch(BUSINESS_MONTH_SCHEMA.map(sql=>env.ADMIN_DB.prepare(sql)));
  const save=async(amount=1590,extra={})=>{
    const old=await readExpenseLedger(env,{month},{now});
    return mutateExpenseLedger(env,{action:'save',month,revision:old.revision,request_id:crypto.randomUUID(),entry:{id:old.items[0]?.id??null,category:'BILL',description:'SYNTHETIC_PRIVATE_EXPENSE_DESCRIPTION',amount_cents:amount,competence_month:month,due_date:'2026-11-20',status:'OPEN',paid_date:null,...extra},installments:1},'synthetic-owner',{now:()=>fixed-60000});
  };
  if(seed)await save();
  const worker=createFinancialObligationWorker({now});
  const register=async command=>{
    const response=await worker.fetch(new Request('https://auth.brazacommerce.com.br'+FINANCIAL_OBLIGATION_PATH,{method:'POST',headers:{'content-type':'application/json','x-braza-finance-router':env.FINANCE_ROUTER_SECRET},body:JSON.stringify(command)}),env);
    return {status:response.status,body:await response.json()};
  };
  const registry=createFinancialObligationRegistry(env.FINANCE_DB,{scope,actor_id:'synthetic-owner',authorize:async()=>true,now});
  return {env,save,register,registry,close(){env.ADMIN_DB.db.close();env.FINANCE_DB.db.close();}};
}

test('App producer reads and minimizes actual expense entries, preserving declarations without claiming bank settlement',async()=>{
  const f=await fixture();try{
    const before=await readExpenseLedger(f.env,{month},{now}),snapshot=await captureFinancialExpenseObligationSnapshot(f.env,captureInput(),{now});
    assert.ok(projectFinancialObligationSnapshot(snapshot));assert.equal(snapshot.source_hash,await financialObligationSnapshotHash(snapshot));assert.equal(snapshot.ledger_revision,before.revision);assert.equal(snapshot.items[0].expense_id,before.items[0].id);assert.equal(snapshot.items[0].amount_cents,1590);assert.equal(snapshot.items[0].status,'OPEN');assert.equal(snapshot.mode,'DRAFT');assert.doesNotMatch(JSON.stringify(snapshot),/SYNTHETIC_PRIVATE|description|bank|POSTED|CONFIRMED/);
    assert.deepEqual(await readExpenseLedger(f.env,{month},{now}),before,'capture never modifies a declared expense');
    assert.equal(f.env.FINANCE_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0,'capture alone sends and persists nothing');
    await f.save(1590,{status:'PAID',paid_date:'2026-11-12'});const paid=await captureFinancialExpenseObligationSnapshot(f.env,captureInput(),{now});assert.equal(paid.items[0].status,'PAID');assert.equal(paid.items[0].paid_date,'2026-11-12');assert.notEqual(paid.source_hash,snapshot.source_hash);assert.equal(Object.hasOwn(paid.items[0],'bank_record_id'),false);
  }finally{f.close();}
});

test('unallocated manual totals produce an empty obligation capture rather than fabricated installment records',async()=>{
  const f=await fixture({seed:false});try{
    await f.env.ADMIN_DB.prepare("INSERT INTO business_month_expenses(month,revision,external_expenses_cents,recharge_treatment,updated_at) VALUES(?,1,90000,'UNCONFIRMED',?)").bind(month,new Date(fixed-60000).toISOString()).run();
    const snapshot=await captureFinancialExpenseObligationSnapshot(f.env,captureInput(),{now});assert.equal(snapshot.mode,'MANUAL');assert.equal(snapshot.ledger_revision,0);assert.deepEqual(snapshot.items,[]);assert.doesNotMatch(JSON.stringify(snapshot),/90000|unallocated|bank/);
  }finally{f.close();}
});

test('refresh registers real minimized App source through the Finance worker and validates the exact as-of receipt',async()=>{
  const f=await fixture();try{
    let sourceReads=0,registrationCount=0;const response=await refreshFinancialExpenseObligations(f.env,refreshInput(),{now,readLedger:async selected=>{sourceReads++;return readExpenseLedger(f.env,{month:selected},{now});},register:async command=>{registrationCount++;assert.doesNotMatch(JSON.stringify(command),/SYNTHETIC_PRIVATE|description/);return f.register(command);}});
    assert.equal(response.status,200);assert.ok(projectFinancialObligationResponse(response.body));assert.equal(response.body.quality,'REVIEW');assert.equal(sourceReads,2);assert.equal(registrationCount,1);
    const workspace=await f.registry.read({schema:'financial_obligation_source_request_v1',operation:'read',month,limit:100,cursor:null});assert.ok(projectFinancialObligationResponse(workspace));assert.equal(workspace.items.length,1);assert.equal(workspace.items[0].snapshot_id,response.body.snapshot_id);assert.equal(workspace.items[0].evidence_id,'expense-evidence:'+response.body.snapshot_id);assert.equal(workspace.items[0].quality,'REVIEW');
  }finally{f.close();}
});

test('a source edit while registration is in flight is reported after receipt and the immutable prior capture remains auditable',async()=>{
  const f=await fixture();try{
    await assert.rejects(()=>refreshFinancialExpenseObligations(f.env,refreshInput(),{now,register:async command=>{const response=await f.register(command);assert.equal(response.status,200);await f.save(2500);return response;}}),error=>error.code==='FINANCIAL_OBLIGATION_APP_SOURCE_CHANGED'&&error.status===409);
    const captured=await f.registry.read({schema:'financial_obligation_source_request_v1',operation:'read',month,limit:100,cursor:null}),live=await readExpenseLedger(f.env,{month},{now});assert.equal(captured.items[0].amount_cents,1590);assert.equal(live.items[0].amount_cents,2500);assert.equal(f.env.FINANCE_DB.db.prepare('SELECT COUNT(*) n FROM finance_financial_obligation_snapshots').get().n,1);
  }finally{f.close();}
});

test('capture-time-only refresh does not look like a material source edit',async()=>{
  const f=await fixture();try{
    let clockReads=0;const response=await refreshFinancialExpenseObligations(f.env,refreshInput(),{now:()=>fixed+(clockReads++<2?0:1000),register:f.register});assert.equal(response.status,200);assert.ok(clockReads>=2);
  }finally{f.close();}
});

test('browser facts, forged contexts and unscoped commercial databases are refused before source callbacks',async()=>{
  let calls=0;const options={now,readLedger:async()=>{calls++;throw Error();}};
  for(const input of [captureInput({records:[]}),captureInput({snapshot:{}}),captureInput({month:'2026-13'}),captureInput({scope:{...scope,store_id:'other-store'}}),captureInput({scope:{...scope,currency:'USD'}})])await assert.rejects(()=>captureFinancialExpenseObligationSnapshot({},input,options));
  await assert.rejects(()=>captureFinancialExpenseObligationSnapshot({COMMERCIAL_CONTEXT:{organizationId:scope.organization_id}},captureInput(),options),error=>error.status===403);
  const context=await commercialContextFromPrincipal({kind:'account',userId:'synthetic-user',organizationId:'synthetic-org',storeId:'synthetic-store',sessionId:'synthetic-session',membershipId:'synthetic-member',role:'FINANCE',authorizationRevision:1,capabilities:['finance.read','bank.write']},{requiredCapability:'finance.read'}),raw=new D1();
  try{await assert.rejects(()=>captureFinancialExpenseObligationSnapshot({COMMERCIAL_CONTEXT:context,ADMIN_DB:raw},captureInput({scope:{organization_id:'synthetic-org',store_id:'synthetic-store',currency:'BRL'}}),options),error=>error.status===403);}finally{raw.db.close();}
  assert.equal(calls,0);
});

test('invalid source/receipt and transport exceptions expose only finite financial diagnostics',async()=>{
  const f=await fixture();try{
    await assert.rejects(()=>captureFinancialExpenseObligationSnapshot(f.env,captureInput(),{now,readLedger:async()=>{throw Error('SYNTHETIC_PRIVATE');}}),error=>error.code==='FINANCIAL_OBLIGATION_APP_SOURCE_UNAVAILABLE'&&!error.message.includes('PRIVATE'));
    await assert.rejects(()=>captureFinancialExpenseObligationSnapshot(f.env,captureInput(),{now,readLedger:async()=>({schema:'expense_ledger_v1',private:'SYNTHETIC_PRIVATE'})}),error=>error.code==='FINANCIAL_OBLIGATION_APP_SOURCE_INVALID');
    await assert.rejects(()=>refreshFinancialExpenseObligations(f.env,refreshInput(),{now,register:async command=>{const response=await f.register(command);return {...response,body:{...response.body,request_id:'another-request'}};}}),error=>error.code==='FINANCIAL_OBLIGATION_APP_RESPONSE_INVALID');
    const failed=await refreshFinancialExpenseObligations(f.env,refreshInput({expected_revision:1}),{now,register:async()=>({status:403,body:{error:'COMMERCIAL_FORBIDDEN',private:'SYNTHETIC_PRIVATE'}})});assert.deepEqual(failed,{status:403,body:{schema:'financial_private_error_v1',error:'COMMERCIAL_FORBIDDEN'}});
    await assert.rejects(()=>refreshFinancialExpenseObligations(f.env,refreshInput(),{now,register:async()=>({status:503,body:{error:'SYNTHETIC_PRIVATE'}})}),error=>error.code==='FINANCIAL_OBLIGATION_APP_REGISTRATION_UNAVAILABLE');
  }finally{f.close();}
});

for(const minify of [false,true])test('App source helper preserves private projection in compiled ESM, minify='+minify,async()=>{
  const result=await build({entryPoints:[fileURLToPath(new URL('../src/financial-obligation-app-source.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
  const helper=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  const f=await fixture();try{const response=await helper.refreshFinancialExpenseObligations(f.env,refreshInput(),{now,register:f.register});assert.equal(response.status,200);assert.equal(response.body.quality,'REVIEW');assert.doesNotMatch(JSON.stringify(response),/SYNTHETIC_PRIVATE|description/);}finally{f.close();}
});
