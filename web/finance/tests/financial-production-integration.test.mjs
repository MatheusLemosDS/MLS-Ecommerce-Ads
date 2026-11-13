import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {FINANCIAL_SOURCE_PATH,projectFinancialSourceResponse} from '../src/financial-source-frame.mjs';
import {FINANCIAL_ALLOCATION_PATH,projectFinancialAllocationResponse} from '../src/financial-allocation-frame.mjs';
import {EXTERNAL_CASH_PATH,projectExternalCashResponse} from '../src/external-cash-frame.mjs';
import {FINANCIAL_OBLIGATION_PATH,projectFinancialObligationResponse} from '../src/financial-obligation-frame.mjs';

const origin='https://auth.brazacommerce.com.br',secret='synthetic-router-secret-'.repeat(3);
const source={schema:'financial_source_request_v1',operation:'capabilities'};
const allocation={schema:'financial_cash_allocation_request_v1',operation:'read'};
const legacy={schema:'external_cash_request_v1',operation:'read',month:'2026-11'};
const obligations={schema:'financial_obligation_source_request_v1',operation:'read',month:'2026-11'};
const request=(path,body,changes={})=>new Request((changes.origin??origin)+path,{method:changes.method??'POST',headers:{'content-type':'application/json','x-braza-finance-router':changes.secret??secret},...(changes.method==='GET'?{}:{body:JSON.stringify(body)})});
async function verifyProduction(worker){
  let providers=0;const previous=globalThis.fetch;globalThis.fetch=async()=>{providers++;throw new Error('Synthetic unexpected provider call');};
  const env={FINANCE_DB:new D1(),ADMIN_DB:new D1(),FINANCE_ROUTER_SECRET:secret,FINANCE_CONNECTION_ENABLED:'false'};
  try{
    for(const [path,body,schema,project] of [[FINANCIAL_SOURCE_PATH,source,'financial_source_capabilities_v1',projectFinancialSourceResponse],[FINANCIAL_ALLOCATION_PATH,allocation,'financial_cash_allocation_workspace_v1',projectFinancialAllocationResponse],[EXTERNAL_CASH_PATH,legacy,'external_cash_workspace_v1',projectExternalCashResponse],[FINANCIAL_OBLIGATION_PATH,obligations,'financial_obligation_workspace_v1',projectFinancialObligationResponse]]){
      const response=await worker.fetch(request(path,body),env,{});assert.equal(response.status,200,path);assert.match(response.headers.get('cache-control'),/no-store/);
      const frame=await response.json();assert.equal(frame.schema,schema);assert.ok(project(frame));
      if(path===FINANCIAL_SOURCE_PATH)assert.equal(frame.sources.every(s=>s.collection_allowed===false),true);
      const untrusted=request(path,body,{secret:'untrusted'});assert.equal((await worker.fetch(untrusted,env,{})).status,403);assert.equal(untrusted.bodyUsed,false);
    }
    for(const [path,body] of [[FINANCIAL_SOURCE_PATH,source],[FINANCIAL_ALLOCATION_PATH,allocation],[FINANCIAL_OBLIGATION_PATH,obligations]]){
      for(const [target,changes,status] of [[path+'?organization_id=other',{},400],[path,{origin:'https://synthetic.invalid'},404],[path,{method:'GET'},405],[path+'/',{},404]])assert.equal((await worker.fetch(request(target,body,changes),env,{})).status,status);
    }
    assert.equal((await worker.fetch(request('/internal/finance/not-an-endpoint',{}),env,{})).status,404);
    assert.equal(env.FINANCE_DB.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0,'cold read routes must not fabricate schema or records');
    assert.equal(providers,0,'private local capabilities and imports do not require an enabled Shopee connection');
  }finally{globalThis.fetch=previous;env.FINANCE_DB.db.close();env.ADMIN_DB.db.close();}
}

test('actual Finance deployment entry dispatches both financial routes and preserves legacy cash routing',async()=>{
  const worker=(await import('../src/production-worker.mjs')).default;await verifyProduction(worker);
});
for(const minify of [false,true])test('actual Finance deployment entry retains bounded private routes when bundled, minify='+minify,async()=>{
  const result=await build({entryPoints:[fileURLToPath(new URL('../src/production-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
  const worker=(await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))).default;await verifyProduction(worker);
});
