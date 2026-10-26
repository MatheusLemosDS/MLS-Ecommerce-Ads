import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';
import {ownerReportBrowser} from './owner-report-browser-fixture.mjs';

// pretest builds this artifact through web/cloudflare/build.py. Testing the
// deployed output catches missing concatenation modules and helper renaming
// which importing admin.mjs or the UI source alone cannot detect.
for(const minify of [false,true])test(`the deployable Worker serves and persists itemized expenses and embeds its safe browser projector (minify=${minify})`,async()=>{
 const compiled=await build({entryPoints:[fileURLToPath(new URL('../../../dist/app-worker.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});
 const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
 const origin='https://app.expenses.test',month='2027-01',env={ADMIN_DB:new D1(),ADMIN_SESSION_SECRET:'compiled-expense-session-12345678901234567890',ADMIN_USERNAME:'expense-fixture-owner',ADMIN_PASSWORD:'expense-fixture-password-123456'};
 const previousFetch=globalThis.fetch;let sourceCalls=0,browser=null;globalThis.fetch=async()=>{sourceCalls++;throw Error('Expense bookkeeping must not call a remote service');};
 try{
  const anonymous=await worker.fetch(new Request(origin+'/api/admin/finance/expense-ledger?month='+month),env);assert.equal(anonymous.status,401);
  const login=await worker.fetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
  const get=async path=>{const response=await worker.fetch(new Request(origin+'/api/admin/'+path,{headers:{cookie}}),env);assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get('cache-control'),'no-store');return response.json();};
  const state=await get('state'),post=body=>worker.fetch(new Request(origin+'/api/admin/finance/expense-ledger',{method:'POST',headers:{origin,cookie,'content-type':'application/json','x-csrf-token':state.csrf},body:JSON.stringify(body)}),env);
  const initial=await get('finance/expense-ledger?month='+month);assert.equal(initial.schema,'expense_ledger_v1');assert.equal(initial.mode,'MANUAL');assert.equal(initial.current_external_expenses_cents,null);
  const htmlResponse=await worker.fetch(new Request(origin+'/admin',{headers:{cookie}}),env);assert.equal(htmlResponse.status,200);const html=await htmlResponse.text();
  for(const id of ['businessMonthExpenseLedger','businessMonthExpenseLedgerForm','businessMonthExpenseLedgerSave','businessMonthExpenseLedgerConfirm','businessMonthExpenseLedgerInstallments','businessMonthExpenseLedgerPaidDate','businessMonthExpenseLedgerConfirmationPreview','businessMonthExpenseLedgerConfirmationEquation','businessMonthExpenseLedgerConfirmationPrevious','businessMonthExpenseLedgerConfirmationDifference','businessMonthExpenseLedgerConfirmationPreviewStatus'])assert.ok(html.includes('id="'+id+'"'),id+' must exist in the shipped owner page');
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);assert.ok(scripts.length>0);for(const script of scripts)new vm.Script(script);
  const browserScript=scripts.find(script=>script.includes('const projectExpenseLedger='));assert.ok(browserScript,'the deployed page must contain the ledger client');assert.match(browserScript,/finance\/expense-ledger/);
  const marker='const projectExpenseLedger=',start=browserScript.indexOf(marker)+marker.length,end=browserScript.indexOf(";\n const el=name=>document.getElementById('businessMonthExpenseLedger'+name);",start);assert.ok(end>start,'the frozen projector must be embedded before the ledger UI helpers');
  const context=vm.createContext({serialized:JSON.stringify(initial)});vm.runInContext('const projectExpenseLedger='+browserScript.slice(start,end)+';',context);assert.equal(vm.runInContext('projectExpenseLedger(JSON.parse(serialized)).mode',context),'MANUAL');
  const requestId=crypto.randomUUID(),create={action:'save',month,revision:initial.revision,request_id:requestId,entry:{id:null,category:'RENT',description:'Aluguel do barracão',amount_cents:150000,competence_month:month,due_date:month+'-31',status:'OPEN',paid_date:null},installments:3};
  let response=await post(create);assert.equal(response.status,200,await response.clone().text());let value=await response.json();assert.equal(value.mode,'DRAFT');assert.equal(value.total_cents,150000);assert.equal(value.current_external_expenses_cents,null);assert.equal(value.items[0].installments,3);
  response=await post(create);assert.equal(response.status,200);assert.equal((await response.json()).items[0].id,value.items[0].id,'a replay retains the published series identity');
  response=await post({...create,request_id:crypto.randomUUID()});assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:'EXPENSE_LEDGER_CONFLICT'});
  response=await post({action:'confirm',month,revision:value.revision,request_id:crypto.randomUUID(),unallocated_cents:25000,expenses_revision:value.expenses_revision,recharge_treatment:'ADS_RECHARGE'});assert.equal(response.status,200,await response.clone().text());value=await response.json();assert.equal(value.mode,'CONFIRMED');assert.equal(value.total_cents,175000);assert.equal(value.current_external_expenses_cents,175000);assert.equal(value.recharge_treatment,'ADS_RECHARGE');
  assert.deepEqual(await get('finance/expense-ledger?month='+month),value);const stored=env.ADMIN_DB.db.prepare('SELECT revision,external_expenses_cents,recharge_treatment FROM business_month_expenses WHERE month=?').get(month);assert.equal(stored.external_expenses_cents,175000);assert.equal(stored.recharge_treatment,'ADS_RECHARGE');
  const next=await get('finance/expense-ledger?month=2027-02');assert.equal(next.mode,'DRAFT');assert.equal(next.current_external_expenses_cents,null);assert.equal(next.items[0].amount_cents,150000);assert.equal(next.items[0].due_date,'2027-02-28');
  const item=value.items[0],paidDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
  response=await post({action:'save',month,revision:value.revision,request_id:crypto.randomUUID(),entry:{id:item.id,category:item.category,description:item.description,amount_cents:item.amount_cents,competence_month:month,due_date:item.due_date,status:'PAID',paid_date:paidDate},installments:1});assert.equal(response.status,200);value=await response.json();assert.equal(value.paid_cents,150000);assert.equal(value.current_external_expenses_cents,175000);assert.equal(value.expenses_revision,stored.revision,'recording payment must not subtract the same expense again');
  context.serialized=JSON.stringify(value);assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(projectExpenseLedger(JSON.parse(serialized)))',context)),value,'the shipped normal/minified browser helper validates the real server response');
  context.serialized=JSON.stringify({...value,private_token:'DO_NOT_EXPOSE'});assert.equal(vm.runInContext('projectExpenseLedger(JSON.parse(serialized))',context),null);
  context.serialized=JSON.stringify({...value,total_cents:value.total_cents+1});assert.equal(vm.runInContext('projectExpenseLedger(JSON.parse(serialized))',context),null);

  // Exercise the real emitted UI as well as the embedded defensive projector.
  // Preview and editor navigation only read existing ledger responses here;
  // their arithmetic and draft handling must never cause a mutation or source job.
  browser=ownerReportBrowser(html,{scriptIncludes:'globalThis.brazaMonthDashboard='});const reads=[];
  browser.context.readExpense=async(path,body)=>{reads.push({path,body});assert.equal(body,undefined);assert.match(path,/^finance\/expense-ledger\?month=2027-(?:01|02)$/);return JSON.stringify(await get(path));};
  browser.run('const expenseApi=async(path,body)=>JSON.parse(await readExpense(path,body));brazaExpenseLedger.start({api:expenseApi});brazaExpenseLedger.observe("2027-01");');
  assert.equal(await browser.run('brazaExpenseLedger.open("2027-01")'),true);const el=name=>browser.nodes.get('businessMonthExpenseLedger'+name);
  assert.equal(el('ConfirmationEquation').textContent,'R$\u00a01.500,00 + R$\u00a0250,00 = R$\u00a01.750,00');assert.match(el('ConfirmationDifference').textContent,/0,00.*permanece igual/);
  el('Remainder').value='0';el('Remainder').oninput();assert.equal(el('ConfirmationEquation').textContent,'R$\u00a01.500,00 + R$\u00a00,00 = R$\u00a01.500,00');assert.match(el('ConfirmationDifference').textContent,/− R\$\s*250,00.*diminui/);assert.equal(el('Confirm').disabled,true);
  el('Description').value='Rascunho em janeiro';el('Description').oninput();el('Amount').value='7,50';el('Amount').oninput();const edit=el('List').querySelectorAll('button').find(button=>button.textContent==='Editar');assert.ok(edit);assert.equal(edit.onclick(),false);assert.equal(el('Description').value,'Rascunho em janeiro');assert.equal(el('Amount').value,'7,50');assert.match(el('FormStatus').textContent,/Salve ou descarte a edição atual/);
  assert.equal(reads.length,1);await browser.nodes.get('businessMonthExpensesDetails').ontoggle();assert.equal(reads.length,1);
  assert.equal(await browser.run('brazaExpenseLedger.open("2027-02")'),true);assert.equal(await browser.run('brazaExpenseLedger.open("2027-01")'),true);assert.equal(el('Description').value,'Rascunho em janeiro');assert.equal(el('Amount').value,'7,50');assert.equal(el('Remainder').value,'0');assert.equal(reads.length,3);assert.ok(reads.every(read=>read.body===undefined));
  assert.equal((await get('finance/expense-ledger?month='+month)).current_external_expenses_cents,175000,'preview and editor navigation preserve the saved monthly total');
  assert.equal(sourceCalls,0);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS count FROM hermes_jobs').get().count,0);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS count FROM business_expense_ledger_months').get().count,3);
 }finally{if(browser){browser.run('brazaExpenseLedger.stop();');browser.timers.clear();}globalThis.fetch=previousFetch;env.ADMIN_DB.db.close();}
});
