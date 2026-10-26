import test from 'node:test';
import assert from 'node:assert/strict';
import {adminFetch} from '../src/admin.mjs';
import {D1} from './sqlite-d1.mjs';

const origin='https://app.example.test',month='2027-01';
async function login(){
 const env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'fixture-ledger-session-'+ 's'.repeat(32),ADMIN_USERNAME:'ledger-admin',ADMIN_PASSWORD:'fixture-ledger-password-1234567890'};
 const response=await adminFetch(new Request(origin+'/admin/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);
 assert.equal(response.status,303);const cookie=response.headers.get('set-cookie').split(';')[0],state=await(await adminFetch(new Request(origin+'/api/admin/state',{headers:{cookie}}),env)).json();return {env,cookie,csrf:state.csrf};
}
const request=(auth,body,options={})=>new Request(origin+'/api/admin/finance/expense-ledger'+(options.search??''),{method:options.method??'POST',headers:{cookie:options.cookie??auth.cookie,origin:options.origin??origin,'x-csrf-token':options.csrf??auth.csrf,'content-type':'application/json'},body:['GET','HEAD'].includes(options.method)?undefined:options.raw??JSON.stringify(body)});
const save=()=>({action:'save',month,revision:0,request_id:crypto.randomUUID(),entry:{id:null,category:'RENT',description:'Aluguel do barracão',amount_cents:150000,competence_month:month,due_date:month+'-10',status:'OPEN',paid_date:null},installments:3});
const snapshot=auth=>Object.fromEntries(['business_expense_ledger_state','business_expense_ledger_months','business_expense_ledger_audit','business_month_expenses','business_month_expenses_audit','hermes_jobs'].map(name=>[name,auth.env.ADMIN_DB.db.prepare('SELECT * FROM '+name).all()]));

test('expense ledger is private, exact-origin and CSRF protected and rejects malformed input before any expense mutation',async()=>{
 const auth=await login(),before=snapshot(auth),input=save();
 for(const [options,status,code] of [[{cookie:''},401,'UNAUTHORIZED'],[{origin:'https://attacker.invalid'},403,'ORIGIN_REJECTED'],[{csrf:''},403,'CSRF_REJECTED'],[{method:'HEAD'},405,'METHOD_NOT_ALLOWED']]){
  const response=await adminFetch(request(auth,input,options),auth.env);assert.equal(response.status,status);const data=await response.json();if(code!=='ORIGIN_REJECTED')assert.equal(data.error,code);
 }
 for(const body of [{...input,private_token:'PRIVATE'}, {...input,entry:{...input.entry,amount_cents:12.34}}, {...input,entry:{...input.entry,status:'CANCELLED'}}, {...input,revision:-1}, {}, []]){
  const response=await adminFetch(request(auth,body),auth.env);assert.equal(response.status,400);assert.equal((await response.json()).error,Array.isArray(body)?'BODY_INVALID':'EXPENSE_LEDGER_REQUEST_INVALID');
 }
 assert.equal((await adminFetch(request(auth,input,{raw:' '.repeat(4097)+JSON.stringify(input)}),auth.env)).status,413);
 assert.equal((await adminFetch(request(auth,input,{search:'?month='+month}),auth.env)).status,400);assert.deepEqual(snapshot(auth),before);
});

test('GET has an exact query and accepts a future month without contacting sources, starting jobs, or creating declarations',async()=>{
 const auth=await login(),before=snapshot(auth);let calls=0;const services={getFinanceBusinessPeriod:async()=>{calls++;throw Error('not expected');},getAdsCalendar:async()=>{calls++;throw Error('not expected');}};
 for(const search of ['', '?month=2026-13', '?month=2026-1', '?month='+month+'&month='+month, '?month='+month+'&operation=start']){
  const response=await adminFetch(request(auth,null,{method:'GET',search}),auth.env,services);assert.equal(response.status,400);assert.equal((await response.json()).error,'EXPENSE_LEDGER_REQUEST_INVALID');
 }
 const beforeChanges=auth.env.ADMIN_DB.db.prepare('SELECT total_changes() AS count').get().count;
 for(let index=0;index<3;index++){
  const response=await adminFetch(request(auth,null,{method:'GET',search:'?month='+month,csrf:''}),auth.env,services);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('access-control-allow-origin'),null);const frame=await response.json();assert.equal(frame.mode,'MANUAL');assert.equal(frame.current_external_expenses_cents,null);assert.equal(frame.items.length,0);
 }
 assert.equal(auth.env.ADMIN_DB.db.prepare('SELECT total_changes() AS count').get().count,beforeChanges);assert.equal(calls,0);assert.deepEqual(snapshot(auth),before);
});

test('create, replay, conflict, confirm and cancel expose useful typed responses and never send a payment or create an assistant job',async()=>{
 const auth=await login(),input=save(),invoke=body=>adminFetch(request(auth,body),auth.env);let response=await invoke(input);assert.equal(response.status,200);let frame=await response.json();assert.equal(frame.mode,'DRAFT');assert.equal(frame.items[0].category,'RENT');assert.equal(frame.items[0].installments,3);
 const first=snapshot(auth);response=await invoke(input);assert.equal(response.status,200);assert.deepEqual(await response.json(),frame);assert.deepEqual(snapshot(auth),first);
 response=await invoke({...input,request_id:crypto.randomUUID()});assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:'EXPENSE_LEDGER_CONFLICT'});assert.deepEqual(snapshot(auth),first);
 response=await invoke({action:'confirm',month,revision:frame.revision,request_id:crypto.randomUUID(),unallocated_cents:20000,expenses_revision:0,recharge_treatment:'TECH_SUPPORT'});assert.equal(response.status,200);frame=await response.json();assert.equal(frame.mode,'CONFIRMED');assert.equal(frame.current_external_expenses_cents,170000);assert.equal(frame.recharge_treatment,'TECH_SUPPORT');
 const confirmed=snapshot(auth);response=await invoke({action:'cancel',month,revision:frame.revision,request_id:crypto.randomUUID(),id:crypto.randomUUID()});assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:'EXPENSE_LEDGER_ITEM_NOT_FOUND'});assert.deepEqual(snapshot(auth),confirmed);
 response=await invoke({action:'cancel',month,revision:frame.revision,request_id:crypto.randomUUID(),id:frame.items[0].id});assert.equal(response.status,200);frame=await response.json();assert.equal(frame.current_external_expenses_cents,20000);assert.equal(frame.items[0].status,'CANCELLED');assert.equal(snapshot(auth).hermes_jobs.length,0);
 const future=await(await adminFetch(request(auth,null,{method:'GET',search:'?month=2027-02'}),auth.env)).json();assert.equal(future.mode,'DRAFT');assert.equal(future.current_external_expenses_cents,null);assert.equal(future.items[0].status,'OPEN');
});
