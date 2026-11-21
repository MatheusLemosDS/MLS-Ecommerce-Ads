import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch,SCHEMA} from '../src/admin.mjs';
import {D1} from './sqlite-d1.mjs';
import {createHash} from 'node:crypto';

const origin='https://operating-increment.test';
const uuid=()=>crypto.randomUUID();
const expected_scope={organization_id:'legacy-brazacommerce',store_id:'legacy-shopee'};
async function owner(t){
 const db=new D1();t.after(()=>db.db.close());
 const env={ADMIN_DB:db,ADMIN_SESSION_SECRET:'synthetic-operating-session-'+'s'.repeat(32),ADMIN_USERNAME:'synthetic-owner',ADMIN_PASSWORD:'synthetic-password-never-real-123'};
 const login=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
 const state=await (await adminFetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();
 const call=(path,body,headers={})=>adminFetch(new Request(origin+'/api/admin/'+path,{method:body===undefined?'GET':'POST',headers:{cookie,origin,'content-type':'application/json','x-csrf-token':state.csrf,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
 return {db,env,call};
}
const stockQuery='production/shirt-stock?variant_id=&cursor=&history_cursor=';
const paymentsQuery=provider=>'production/weekly-payments?provider_id='+provider+'&cursor=&history_cursor=';
test('the global setup retains all114 reviewed SQL statements; operational journals are lazy and separate',()=>{
 assert.equal(SCHEMA.length,114);
 assert.equal(createHash('sha256').update(JSON.stringify(SCHEMA)).digest('hex'),'8731b21c0b4b7d0650b245bcbe2ae0c1d2898822fc8ff6e4e0051e769c3ea066');
 assert.equal(SCHEMA.some(sql=>sql.includes('operational_entity_')),false);
});
test('owner operational routes require session, exact query, same origin and CSRF before any mutation',async t=>{
 const f=await owner(t),before=f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'operational_entity_%'").get().n;
 for(const path of [stockQuery,paymentsQuery('')]){
  assert.equal((await adminFetch(new Request(origin+'/api/admin/'+path),f.env)).status,401);
  const read=await f.call(path);assert.equal(read.status,200);
 }
 assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'operational_entity_%'").get().n,before);
 assert.equal((await f.call(stockQuery+'&extra=1')).status,400);
 assert.equal((await f.call('production/weekly-payments?provider_id=&cursor=')).status,400);
 for(const path of ['production/weekly-payments','production/shirt-stock']){
  assert.equal((await f.call(path,{}, {'x-csrf-token':'invalid'})).status,403);
  assert.equal((await f.call(path,{}, {origin:'https://foreign.test'})).status,403);
 }
 assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE 'operational_entity_%'").get().n,before);
});
test('the authenticated shirt workflow persists counts and reservations through the real route without money facts',async t=>{
 const f=await owner(t),post=async body=>{const r=await f.call('production/shirt-stock',body);assert.equal(r.status,200,JSON.stringify(await r.clone().json()));return r.json();};
 const command=(operation,variant_id,revision,selection)=>({operation,variant_id,expected_revision:revision,request_id:uuid(),confirmed:true,selection,expected_scope});
 let result=await post(command('register',null,0,{garment_type:'ADULT',fit:'UNISEX',size:'M',color:'Preto',material:null}));
 const id=result.variant.variant_id;assert.equal(result.variant.free_quantity,null);
 result=await post(command('initial_count',id,1,{quantity:12,effective_date:'2026-11-20',evidence:'Contagem física sintética',reference:'synthetic-initial'}));
 assert.equal(result.variant.free_quantity,12);
 const reserve=command('reserve',id,2,{quantity:3,demand_ref:'synthetic-demand'});
 result=await post(reserve);assert.equal(result.variant.free_quantity,9);assert.equal(result.variant.reserved_quantity,3);
 assert.equal((await post(reserve)).replayed,true);
 const read=await(await f.call(stockQuery.replace('variant_id=','variant_id='+id))).json();
 assert.equal(read.selected.physical_usable_quantity,12);assert.equal(read.selected.free_quantity,9);assert.equal(read.valuation.amount_cents,null);
 assert.equal(read.external_stock_write_allowed,false);assert.equal(read.financial_integration_allowed,false);
 const stale=await f.call('production/shirt-stock',command('reserve',id,2,{quantity:10,demand_ref:'synthetic-other'}));assert.equal(stale.status,409);
});
test('the authenticated weekly payment workflow previews FIFO and commits exactly once, without transfer authority',async t=>{
 const f=await owner(t),provider=uuid();
 const post=async body=>{const r=await f.call('production/weekly-payments',body);assert.equal(r.status,200,JSON.stringify(await r.clone().json()));return r.json();};
 const command=(revision,action,extra={})=>({action,provider_id:provider,expected_revision:revision,request_id:uuid(),expected_scope,...extra});
 let result=await post(command(0,'save_provider',{name:'Prestador sintético'}));
 result=await post(command(result.selected.revision,'add_obligation',{obligation_id:uuid(),week_end:'2026-11-06',amount_cents:100000,reference:'synthetic-contract-week1'}));
 result=await post(command(result.selected.revision,'add_obligation',{obligation_id:uuid(),week_end:'2026-11-13',amount_cents:80000,reference:'synthetic-contract-week2'}));
 const selection={payment_id:uuid(),amount_cents:120000,paid_on:'2026-11-20',reference:'synthetic-paid-receipt'};
 const preview=await post(command(result.selected.revision,'preview_payment',selection));
 assert.deepEqual(preview.allocations.map(row=>row.amount_cents),[100000,20000]);
 const payment=command(result.selected.revision,'apply_payment',{...selection,preview_hash:preview.preview_hash});
 result=await post(payment);assert.equal(result.selected.outstanding_cents,60000);
 assert.equal((await post(payment)).mutation.replayed,true);
 const read=await(await f.call(paymentsQuery(provider))).json();assert.equal(read.selected.payments.length,1);assert.equal(read.selected.outstanding_cents,60000);
 assert.equal(read.money_transfer_allowed,false);assert.equal(read.bank_reconciliation_confirmed,false);
});
