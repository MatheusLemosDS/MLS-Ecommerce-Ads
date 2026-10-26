import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {D1} from './sqlite-d1.mjs';
import {BUSINESS_MONTH_SCHEMA} from '../src/business-month.mjs';
import {EXPENSE_LEDGER_SCHEMA,readExpenseLedger,mutateExpenseLedger} from '../src/expense-ledger.mjs';
import {expenseLedgerBody,EXPENSE_LEDGER_CLIENT} from '../src/expense-ledger-view.mjs';

const clock=Date.UTC(2026,9,26,15),now=()=>clock,clone=value=>JSON.parse(JSON.stringify(value));
function fixture(t,{manual=null,script=EXPENSE_LEDGER_CLIENT,onChangedResult=undefined}={}){
 const env={ADMIN_DB:new D1()};t.after(()=>env.ADMIN_DB.db.close());for(const sql of [...BUSINESS_MONTH_SCHEMA,...EXPENSE_LEDGER_SCHEMA])env.ADMIN_DB.db.exec(sql);
 if(manual!==null)env.ADMIN_DB.db.prepare('INSERT INTO business_month_expenses(month,revision,external_expenses_cents,recharge_treatment,updated_at) VALUES(?,1,?,?,?)').run('2026-10',manual,'ADS_RECHARGE',new Date(clock).toISOString());
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.ownText='';this.value='';this.checked=false;this.hidden=false;this.disabled=false;this.open=false;this.dataset={};this.attributes={};}
  append(...values){this.children.push(...values);}
  replaceChildren(...values){this.ownText='';this.children=[...values];}
  set textContent(value){this.ownText=String(value);this.children=[];}
  get textContent(){return this.ownText+this.children.map(value=>value.textContent).join(' ');}
  setAttribute(key,value){this.attributes[key]=String(value);}
  focus(){this.focused=true;}
  set innerHTML(_){throw Error('Unsafe HTML insertion');}
 }
 const html=expenseLedgerBody(),elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>[match[1],new Element()]));for(const id of ['businessMonthExpensesDetails','businessMonthExpensesForm'])elements.set(id,new Element());
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 const document={hidden:false,getElementById:id=>elements.get(id)||null,createElement:tag=>new Element(tag)};
 const context=vm.createContext({document,Date:ClockDate,Intl,crypto:webcrypto,encodeURIComponent});vm.runInContext(script,context);
 const calls=[],changed=[];let override=null;
 const actual=async(path,body)=>body===undefined?readExpenseLedger(env,{month:new URL('https://test/'+path).searchParams.get('month')},{now}):mutateExpenseLedger(env,clone(body),'owner',{now});
 const api=async(path,body)=>{calls.push({path,body:body===undefined?undefined:clone(body)});const value=await(override?override(path,body,actual):actual(path,body));context.serialized=JSON.stringify(value);return vm.runInContext('JSON.parse(serialized)',context);};
 const el=name=>elements.get('businessMonthExpenseLedger'+name),workspace=context.brazaExpenseLedger;
 const input=(name,value)=>{el(name).value=value;return (el(name).oninput||el(name).onchange)?.();};
 const buttons=(root=el('List'))=>{const result=[];const walk=item=>{if(item.tagName==='BUTTON')result.push(item);item.children.forEach(walk);};walk(root);return result;};
 const button=(name,root)=>buttons(root).find(item=>item.textContent===name);
 const submit=()=>el('Form').onsubmit({preventDefault(){}});
 const start=()=>{assert.equal(workspace.start({api,onChanged:async(month,value)=>{changed.push({month,value:clone(value)});return onChangedResult;}}),true);assert.equal(workspace.observe('2026-10'),true);};
 const open=()=>{elements.get('businessMonthExpensesDetails').open=true;return elements.get('businessMonthExpensesDetails').ontoggle();};
 const create=(description='Aluguel do barracão',amount='1.200,00')=>{input('Description',description);input('Amount',amount);input('Due','2026-10-31');};
 return {env,workspace,context,calls,changed,el,input,button,buttons,submit,start,open,create,elements,setApi:callback=>override=callback,actual,read:month=>readExpenseLedger(env,{month},{now})};
}

test('the expense editor reads only on opening and preserves the existing declared total and recharge classification',async t=>{
 const b=fixture(t,{manual:300000});b.start();assert.equal(b.calls.length,0);for(let i=0;i<10;i++)b.workspace.observe('2026-10');assert.equal(b.calls.length,0);
 assert.equal(await b.open(),true);assert.deepEqual(b.calls,[{path:'finance/expense-ledger?month=2026-10',body:undefined}]);assert.equal(b.el('Remainder').value,'3000,00');assert.equal(b.el('Recharge').value,'ADS_RECHARGE');assert.match(b.el('Legacy').textContent,/Total anterior preservado.*3\.000,00.*reduza/);assert.equal(b.elements.get('businessMonthExpensesForm').hidden,false);
 await b.open();assert.equal(b.calls.length,1,'opening an already loaded section does not repeat reads');assert.equal(b.env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS count FROM business_expense_ledger_months').get().count,0);b.workspace.stop();
});

test('rent is saved as a draft and the owner explicitly replaces the old aggregate without counting it twice',async t=>{
 const b=fixture(t,{manual:300000});b.start();await b.open();b.create('Aluguel do barracão','1200,00');assert.equal(await b.submit(),true);
 const draft=await b.read('2026-10');assert.equal(draft.mode,'DRAFT');assert.equal(draft.items_total_cents,120000);assert.equal(draft.current_external_expenses_cents,300000);assert.equal(draft.unallocated_cents,300000);assert.equal(b.elements.get('businessMonthExpensesForm').hidden,true);assert.match(b.el('Coverage').textContent,/em conferência/);assert.equal(b.el('Confirm').disabled,true);
 b.input('Remainder','1800,00');b.el('Confirmed').checked=true;b.el('Confirmed').onchange();assert.equal(await b.el('Confirm').onclick(),true);
 const saved=await b.read('2026-10');assert.equal(saved.mode,'CONFIRMED');assert.equal(saved.total_cents,300000);assert.equal(saved.current_external_expenses_cents,300000);assert.equal(saved.recharge_treatment,'ADS_RECHARGE');assert.match(b.el('Coverage').textContent,/3\.000,00.*1\.800,00/);assert.equal(b.changed.length,2);assert.deepEqual(b.calls.filter(call=>call.body).map(call=>call.body.action),['save','confirm']);
});

test('monthly installments show the per-installment amount, future competencies, and only the first informed payment',async t=>{
 const b=fixture(t);b.start();await b.open();b.create('Boleto da máquina','250,75');b.input('Category','BILL');b.input('Installments','3');b.input('Payment','PAID');b.input('PaidDate','2026-10-26');assert.equal(b.el('AmountLabel').textContent,'Valor de cada parcela');assert.match(b.el('InstallmentHelp').textContent,/3 parcelas.*752,25.*primeira.*demais ficarão em aberto/);
 assert.equal(await b.submit(),true);const first=await b.read('2026-10'),next=await b.read('2026-11'),last=await b.read('2026-12');assert.equal(first.items[0].status,'PAID');assert.equal(first.items[0].paid_date,'2026-10-26');assert.equal(next.items[0].status,'OPEN');assert.equal(next.items[0].due_date,'2026-11-30');assert.equal(last.items[0].due_date,'2026-12-31');assert.equal(next.mode,'DRAFT');
 b.el('Month').value='2026-11';assert.equal(await b.el('Month').onchange(),true);assert.match(b.el('List').textContent,/parcela 2\/3.*11\/2026.*30\/11\/2026/);assert.match(b.el('Open').textContent,/250,75/);assert.match(b.el('Paid').textContent,/0,00/);
 assert.equal(b.button('Editar').onclick(),true);assert.equal(b.el('InstallmentsField').hidden,true);b.input('Amount','275,00');assert.equal(await b.submit(),true);assert.equal((await b.read('2026-11')).items[0].amount_cents,27500);assert.equal((await b.read('2026-12')).items[0].amount_cents,25075);assert.equal(b.calls.filter(call=>call.body).at(-1).body.installments,1);
});

test('an existing salary can be marked paid and then cancelled without removing its history or repeating its cost',async t=>{
 const b=fixture(t);b.start();await b.open();b.create('Salário de outubro','2200,00');b.input('Category','EMPLOYEES');await b.submit();b.input('Remainder','0');b.el('Confirmed').checked=true;b.el('Confirmed').onchange();await b.el('Confirm').onclick();
 b.button('Informar pagamento').onclick();assert.equal(b.el('Payment').value,'PAID');b.input('PaidDate','2026-10-26');assert.equal(await b.submit(),true);assert.equal((await b.read('2026-10')).total_cents,220000);assert.match(b.el('Paid').textContent,/2\.200,00/);assert.match(b.el('Open').textContent,/0,00/);
 b.button('Cancelar lançamento').onclick();assert.match(b.el('List').textContent,/Cancelar esta despesa.*2\.200,00/);assert.equal(await b.button('Confirmar cancelamento').onclick(),true);const value=await b.read('2026-10');assert.equal(value.items.length,1);assert.equal(value.items[0].status,'CANCELLED');assert.equal(value.items[0].paid_date,'2026-10-26');assert.equal(value.total_cents,0);assert.match(b.el('List').textContent,/preservada no histórico, fora do total/);assert.equal(b.button('Editar'),undefined);
});

test('invalid amounts, installment counts, dates and future payment dates never issue a mutation',async t=>{
 const b=fixture(t);b.start();await b.open();b.create('Boleto','-10');assert.equal(await b.submit(),false);assert.match(b.el('FormStatus').textContent,/valor em reais/);
 b.input('Amount','10,123');assert.equal(await b.submit(),false);b.input('Amount','0');assert.equal(await b.submit(),false);b.input('Amount','12,30');b.input('Installments','1.5');assert.equal(await b.submit(),false);b.input('Installments','121');assert.equal(await b.submit(),false);b.input('Installments','1');b.input('Due','2026-02-30');assert.equal(await b.submit(),false);b.input('Due','2026-10-31');b.input('Payment','PAID');b.input('PaidDate','2026-10-27');assert.equal(await b.submit(),false);assert.equal(b.calls.filter(call=>call.body).length,0);assert.equal(b.el('Amount').value,'12,30');
});

test('a committed save whose response is lost keeps the draft and reuses its idempotency key on retry',async t=>{
 const b=fixture(t);b.start();await b.open();b.create('Aluguel','1200,00');let lost=true;b.setApi(async(path,body,actual)=>{const result=await actual(path,body);if(body&&lost){lost=false;throw Object.assign(Error('PRIVATE_UPSTREAM'),{status:503});}return result;});
 assert.equal(await b.submit(),false);assert.equal(b.el('Description').value,'Aluguel');assert.equal(b.el('Amount').value,'1200,00');assert.match(b.el('Status').textContent,/rascunho.*repetir o mesmo envio/);assert.doesNotMatch(b.el('Status').textContent,/PRIVATE/);assert.equal((await b.read('2026-10')).items.length,1);
 assert.equal(await b.submit(),true);const mutations=b.calls.filter(call=>call.body);assert.equal(mutations.length,2);assert.equal(mutations[0].body.request_id,mutations[1].body.request_id);assert.equal((await b.read('2026-10')).items.length,1);assert.equal(b.el('Description').value,'');
});

test('a concurrent edit preserves typed values, reveals the saved version and requires an explicit reload before overwriting',async t=>{
 const b=fixture(t);b.start();await b.open();b.create('Aluguel','1200,00');await b.submit();b.button('Editar').onclick();b.input('Amount','1300,00');const current=await b.read('2026-10'),entry=current.items[0];await mutateExpenseLedger(b.env,{action:'save',month:'2026-10',revision:current.revision,request_id:webcrypto.randomUUID(),entry:{id:entry.id,category:entry.category,description:entry.description,amount_cents:125000,competence_month:entry.competence_month,due_date:entry.due_date,status:entry.status,paid_date:entry.paid_date},installments:1},'another-session',{now});
 assert.equal(await b.submit(),false);assert.equal(b.el('Amount').value,'1300,00');assert.match(b.el('List').textContent,/1\.250,00/);assert.equal(b.el('Save').disabled,true);assert.equal(b.el('ReloadDraft').hidden,false);assert.match(b.el('FormStatus').textContent,/edição foi preservada/);
 b.el('ReloadDraft').onclick();assert.equal(b.el('Amount').value,'1250,00');assert.equal(b.el('Save').disabled,false);assert.equal((await b.read('2026-10')).items[0].amount_cents,125000);
});

test('failed or malformed reads retain safe rows and unsaved text, and late responses cannot replace another month',async t=>{
 const b=fixture(t);b.start();await b.open();b.create('<img src=x onerror=PRIVATE()>','10,00');await b.submit();const old=b.el('List').textContent;b.input('Description','Rascunho preservado');b.input('Amount','77,50');b.setApi(async()=>({...await b.read('2026-10'),token:'PRIVATE_TOKEN'}));assert.equal(await b.workspace.refresh(),false);assert.equal(b.el('List').textContent,old);assert.equal(b.el('Amount').value,'77,50');assert.doesNotMatch(b.el('Status').textContent,/PRIVATE_TOKEN/);assert.equal(b.context.PRIVATE,undefined);
 let release;b.setApi((path,body,actual)=>path.endsWith('2026-10')?new Promise(resolve=>release=resolve):actual(path,body));const pending=b.workspace.refresh();b.el('Month').value='2026-11';assert.equal(await b.el('Month').onchange(),true);release(await b.read('2026-10'));assert.equal(await pending,false);assert.match(b.el('List').textContent,/Nenhuma despesa/);assert.equal(b.el('Month').value,'2026-11');b.setApi(null);b.el('Month').value='2026-10';await b.el('Month').onchange();assert.equal(b.el('Description').value,'Rascunho preservado');assert.equal(b.el('Amount').value,'77,50');
});

test('stopping the workspace discards a late read and never starts a background expense poll',async t=>{
 const b=fixture(t);b.start();let release;b.setApi(()=>new Promise(resolve=>release=resolve));const pending=b.open();b.workspace.stop();release(await b.read('2026-10'));assert.equal(await pending,false);assert.equal(b.el('Form').hidden,true);assert.equal(b.calls.length,1);assert.equal(await b.workspace.refresh(),false);assert.equal(b.calls.length,1);
});

test('a legacy aggregate changed in another tab cannot be overwritten by a confirmation based on its previous revision',async t=>{
 const b=fixture(t,{manual:10000});b.start();await b.open();b.input('Remainder','200,00');b.el('Confirmed').checked=true;b.el('Confirmed').onchange();
 b.env.ADMIN_DB.db.prepare("UPDATE business_month_expenses SET revision=revision+1,external_expenses_cents=30000,recharge_treatment='TECH_SUPPORT' WHERE month='2026-10'").run();
 assert.equal(await b.el('Confirm').onclick(),false);assert.equal(b.el('Remainder').value,'200,00');assert.equal(b.el('Confirm').disabled,true);assert.equal(b.el('ReloadDraft').hidden,false);assert.match(b.el('FormStatus').textContent,/edição foi preservada/);assert.equal((await b.read('2026-10')).current_external_expenses_cents,30000);
 b.el('ReloadDraft').onclick();assert.equal(b.el('Remainder').value,'300,00');assert.equal(b.el('Recharge').value,'TECH_SUPPORT');assert.equal(b.el('Confirmed').checked,false);assert.equal(b.el('Confirm').disabled,true);
});

test('confirming the current list preserves an unsaved new expense without claiming a concurrent-session conflict',async t=>{
 const b=fixture(t);b.start();await b.open();b.create('Aluguel','1200,00');await b.submit();b.create('Próximo boleto em edição','75,50');b.input('Remainder','0');b.el('Confirmed').checked=true;b.el('Confirmed').onchange();assert.equal(await b.el('Confirm').onclick(),true);
 assert.equal(b.el('Description').value,'Próximo boleto em edição');assert.equal(b.el('Amount').value,'75,50');assert.equal(b.el('Save').disabled,false);assert.equal(b.el('ReloadDraft').hidden,true);assert.doesNotMatch(b.el('FormStatus').textContent,/outra sessão/);assert.equal((await b.read('2026-10')).items.length,1);
});

test('saving remains acknowledged when refreshing the dashboard returns false, with an explicit pending-recalculation message',async t=>{
 const b=fixture(t,{onChangedResult:false});b.start();await b.open();b.create('Boleto','50,00');assert.equal(await b.submit(),true);assert.equal((await b.read('2026-10')).items.length,1);assert.match(b.el('Status').textContent,/Despesa salva.*Recalcule o resumo para atualizar os valores exibidos/);
});

test('a later concurrent edit included in a cancellation response cannot silently rebase an unrelated local draft',async t=>{
 const b=fixture(t);b.start();await b.open();b.create('Aluguel','1200,00');await b.submit();b.create('Boleto internet','99,00');await b.submit();b.button('Editar',b.el('List').children[0]).onclick();b.input('Amount','1300,00');
 b.setApi(async(path,body,actual)=>{const result=await actual(path,body);if(body?.action!=='cancel')return result;const entry=result.items.find(row=>row.description==='Aluguel');await mutateExpenseLedger(b.env,{action:'save',month:'2026-10',revision:result.revision,request_id:webcrypto.randomUUID(),entry:{id:entry.id,category:entry.category,description:entry.description,amount_cents:125000,competence_month:entry.competence_month,due_date:entry.due_date,status:entry.status,paid_date:entry.paid_date},installments:1},'other-session',{now});return b.read('2026-10');});
 b.button('Cancelar lançamento',b.el('List').children[1]).onclick();assert.equal(await b.button('Confirmar cancelamento',b.el('List').children[1]).onclick(),true);assert.equal(b.el('Amount').value,'1300,00');assert.match(b.el('List').textContent,/1\.250,00/);assert.equal(b.el('Save').disabled,true);assert.equal(b.el('ReloadDraft').hidden,false);assert.match(b.el('Status').textContent,/Outra sessão alterou/);assert.match(b.el('FormStatus').textContent,/edição foi preservada/);
});

test('changing the dashboard month during a save is applied after the response and normal renders preserve a separate future ledger selection',async t=>{
 const b=fixture(t);b.start();await b.open();b.create('Aluguel','1200,00');let release;b.setApi((path,body,actual)=>body?new Promise(resolve=>release=async()=>resolve(await actual(path,body))):actual(path,body));const saving=b.submit();assert.equal(b.workspace.observe('2026-11'),true);assert.equal(b.el('Month').value,'2026-10','the approved save remains scoped to October');await release();assert.equal(await saving,true);await b.workspace.refresh();assert.equal(b.el('Month').value,'2026-11');assert.equal(b.el('Competence').value,'2026-11');assert.match(b.el('List').textContent,/Nenhuma despesa/);assert.equal((await b.read('2026-10')).items.length,1);assert.equal((await b.read('2026-11')).items.length,0);
 b.el('Month').value='2026-12';await b.el('Month').onchange();b.workspace.observe('2026-11');assert.equal(b.el('Month').value,'2026-12','the independent expense month is retained until the dashboard selection actually changes');
});

test('editing or informing payment preserves a new draft and unsaved changes to the same or another expense',async t=>{
 const b=fixture(t);b.start();await b.open();b.create('Aluguel','50,00');await b.submit();b.create('Internet','20,00');await b.submit();
 const fields=['Description','Category','Amount','Competence','Due','Payment','PaidDate','Installments'],snapshot=()=>Object.fromEntries(fields.map(name=>[name,b.el(name).value]));
 b.create('Boleto ainda não salvo','77,50');const fresh=snapshot(),calls=b.calls.length;
 for(const label of ['Editar','Informar pagamento']){assert.equal(b.button(label).onclick(),false);assert.deepEqual(snapshot(),fresh);assert.equal(b.calls.length,calls);assert.match(b.el('FormStatus').textContent,/Salve ou descarte a edição atual/);}
 b.el('CancelEdit').onclick();assert.equal(b.button('Editar').onclick(),true);b.input('Amount','51,25');const edited=snapshot();
 for(const row of b.el('List').children)for(const label of ['Editar','Informar pagamento']){assert.equal(b.button(label,row).onclick(),false);assert.deepEqual(snapshot(),edited);}
 assert.equal(await b.submit(),true);const current=await b.read('2026-10');assert.equal(current.items[0].amount_cents,5125);assert.equal(current.items[0].status,'OPEN');assert.equal(current.items[1].amount_cents,2000);
 b.button('Editar').onclick();b.input('Amount','99,00');b.el('CancelEdit').onclick();assert.equal(b.button('Informar pagamento').onclick(),true);assert.equal(b.el('Amount').value,'51,25');assert.equal(b.el('Payment').value,'PAID');
});

test('a protected draft retains the idempotency key after an ambiguous save and an attempted editor switch',async t=>{
 const b=fixture(t);b.start();await b.open();b.create('Despesa existente','50,00');await b.submit();b.create('Boleto novo','77,50');let lose=true;
 b.setApi(async(path,body,actual)=>{const result=await actual(path,body);if(body&&lose){lose=false;throw Error('LOST_RESPONSE');}return result;});assert.equal(await b.submit(),false);
 const before=b.calls.filter(call=>call.body).at(-1).body;assert.equal(b.button('Informar pagamento').onclick(),false);assert.equal(b.el('Description').value,'Boleto novo');assert.equal(b.el('Amount').value,'77,50');
 assert.equal(await b.submit(),true);const after=b.calls.filter(call=>call.body).at(-1).body;assert.deepEqual(after,before);assert.equal((await b.read('2026-10')).items.length,2);
});

test('the live confirmation preview shows saved items plus the remaining amount, the old declaration and a signed difference without writing',async t=>{
 const b=fixture(t,{manual:10000});b.start();await b.open();b.create('Aluguel detalhado','50,00');await b.submit();const before=b.calls.length;
 assert.equal(b.el('ConfirmationEquation').textContent,'R$\u00a050,00 + R$\u00a0100,00 = R$\u00a0150,00');assert.match(b.el('ConfirmationPrevious').textContent,/100,00/);assert.match(b.el('ConfirmationDifference').textContent,/\+ R\$\s*50,00.*aumenta/);
 b.input('Remainder','0');assert.equal(b.el('ConfirmationEquation').textContent,'R$\u00a050,00 + R$\u00a00,00 = R$\u00a050,00');assert.match(b.el('ConfirmationDifference').textContent,/− R\$\s*50,00.*diminui/);assert.equal(b.el('Confirm').disabled,true);assert.equal(b.calls.length,before);assert.equal((await b.read('2026-10')).current_external_expenses_cents,10000);
 b.create('Ainda não cadastrado','9,99');assert.match(b.el('ConfirmationPreviewStatus').textContent,/lançamentos já salvos/);assert.match(b.el('ConfirmationEquation').textContent,/= R\$\s*50,00$/,'unsaved editor values are excluded from the proposed composition');
 b.el('Confirmed').checked=true;b.el('Confirmed').onchange();assert.equal(b.el('Confirm').disabled,false);assert.equal(await b.el('Confirm').onclick(),true);assert.equal((await b.read('2026-10')).current_external_expenses_cents,5000);assert.equal(b.el('Description').value,'Ainda não cadastrado');assert.equal(b.el('Amount').value,'9,99');assert.match(b.el('ConfirmationDifference').textContent,/0,00.*permanece igual/);
});

test('an unknown previous declaration is not presented as a zero difference and confirming zero remains explicit',async t=>{
 const b=fixture(t);b.start();await b.open();assert.match(b.el('ConfirmationPrevious').textContent,/ainda não informado/);assert.match(b.el('ConfirmationDifference').textContent,/não disponível sem um total anterior/);assert.equal(b.el('ConfirmationEquation').textContent,'R$\u00a00,00 + R$\u00a00,00 = R$\u00a00,00');
 assert.equal(b.el('Confirm').disabled,true);assert.equal((await b.read('2026-10')).current_external_expenses_cents,null);const before=b.calls.length;
 assert.equal(await b.el('Confirm').onclick(),false);assert.equal(b.calls.length,before);b.el('Confirmed').checked=true;b.el('Confirmed').onchange();assert.equal(await b.el('Confirm').onclick(),true);assert.equal((await b.read('2026-10')).current_external_expenses_cents,0);
});

test('invalid remaining amounts and a safe-integer sum overflow hide the confirmable total and cannot submit',async t=>{
 const b=fixture(t,{manual:0});b.start();await b.open();b.create('Centavo detalhado','0,01');await b.submit();const before=b.calls.length;
 for(const remaining of ['', '-1','10,123','90071992547409,91']){
  b.input('Remainder',remaining);b.el('Confirmed').checked=true;b.el('Confirmed').onchange();assert.equal(b.el('ConfirmationPreview').dataset.valid,'false');assert.equal(b.el('ConfirmationEquation').textContent,'Total a conferir');assert.equal(b.el('Confirm').disabled,true);assert.equal(await b.el('Confirm').onclick(),false);assert.equal(b.calls.length,before);
 }
 assert.match(b.el('ConfirmationPreviewStatus').textContent,/soma.*excede o limite seguro/);b.input('Remainder','0');assert.equal(b.el('ConfirmationPreview').dataset.valid,'true');assert.equal(b.el('Confirmed').checked,false);assert.equal(b.el('Confirm').disabled,true);
});

test('confirmation preview and differences preserve every cent at safe-integer boundaries',async t=>{
 for(const previous of [0,Number.MAX_SAFE_INTEGER]){
  const b=fixture(t,{manual:previous});b.start();await b.open();b.input('Remainder',previous===0?'90071992547409,91':'0');assert.equal(b.el('ConfirmationPreview').dataset.valid,'true');
  assert.match(b.el('ConfirmationDifference').textContent,/90\.071\.992\.547\.409,91/);assert.ok(b.el('ConfirmationDifference').textContent.startsWith(previous===0?'Diferença: + ':'Diferença: − '));
  if(previous===0)assert.match(b.el('ConfirmationEquation').textContent,/= R\$\s*90\.071\.992\.547\.409,91$/);else assert.match(b.el('ConfirmationPrevious').textContent,/90\.071\.992\.547\.409,91/);
  assert.equal(b.calls.length,1);assert.equal(b.el('Confirm').disabled,true);
 }
});

test('explicit opening selects the dashboard competence while preserving a separate future editor and confirmation draft',async t=>{
 const b=fixture(t);b.start();await b.open();b.el('Month').value='2026-11';await b.el('Month').onchange();b.create('Aluguel de novembro em edição','85,50');b.input('Due','2026-11-10');b.input('Remainder','25,50');b.input('Recharge','TECH_SUPPORT');
 assert.equal(b.workspace.observe('2026-10'),true);assert.equal(b.el('Month').value,'2026-11','ordinary overview renders preserve the independent selection');
 const before=b.calls.length;assert.equal(await b.workspace.open('2026-10'),true);assert.equal(b.el('Month').value,'2026-10');assert.equal(b.calls.length,before+1);await b.elements.get('businessMonthExpensesDetails').ontoggle();assert.equal(b.calls.length,before+1);
 assert.equal(await b.workspace.open('2026-11'),true);assert.equal(b.el('Description').value,'Aluguel de novembro em edição');assert.equal(b.el('Amount').value,'85,50');assert.equal(b.el('Due').value,'2026-11-10');assert.equal(b.el('Remainder').value,'25,50');assert.equal(b.el('Recharge').value,'TECH_SUPPORT');assert.equal(b.el('Confirmed').checked,false);assert.match(b.el('ConfirmationPreviewStatus').textContent,/11\/2026/);assert.equal(b.calls.filter(call=>call.body).length,0);
});

test('explicit opening coalesces pending reads, ignores stale months and does not read twice after an opening failure',async t=>{
 const b=fixture(t);b.start();let release;b.setApi((path,body,actual)=>path.endsWith('2026-10')?new Promise(resolve=>release=resolve):actual(path,body));
 const first=b.workspace.open('2026-10'),second=b.workspace.open('2026-10');assert.equal(first,second);await b.elements.get('businessMonthExpensesDetails').ontoggle();assert.equal(b.calls.length,1);
 assert.equal(await b.workspace.open('2026-11'),true);release(await b.read('2026-10'));assert.equal(await first,false);assert.equal(b.el('Month').value,'2026-11');assert.equal(b.calls.length,2);
 b.setApi(async()=>{throw Error('PRIVATE_FAILURE');});assert.equal(await b.workspace.open('2026-12'),false);const failedCalls=b.calls.length;await b.elements.get('businessMonthExpensesDetails').ontoggle();assert.equal(b.calls.length,failedCalls);assert.doesNotMatch(b.el('Status').textContent,/PRIVATE_FAILURE/);
 b.elements.get('businessMonthExpensesDetails').open=false;await b.elements.get('businessMonthExpensesDetails').ontoggle();b.setApi(null);assert.equal(await b.open(),true);assert.equal(b.calls.length,failedCalls+1);
});

test('explicit opening cannot redirect an in-flight mutation or restore data after stop',async t=>{
 const b=fixture(t);b.start();await b.open();b.create('Aluguel','50,00');let release;b.setApi((path,body,actual)=>body?new Promise(resolve=>release=async()=>resolve(await actual(path,body))):actual(path,body));const saving=b.submit(),before=b.calls.length;
 assert.equal(await b.workspace.open('2026-11'),false);assert.equal(b.el('Month').value,'2026-10');assert.equal(b.el('Description').value,'Aluguel');assert.equal(b.calls.length,before);await release();assert.equal(await saving,true);assert.equal((await b.read('2026-10')).items.length,1);assert.equal((await b.read('2026-11')).items.length,0);
 b.workspace.stop();assert.equal(await b.workspace.open('2026-11'),false);assert.equal(b.calls.length,before);
});

for(const minify of [false,true])test(`the bundled browser expense editor saves and confirms real ledger responses (minify=${minify})`,async t=>{
 const result=await build({entryPoints:[fileURLToPath(new URL('../src/expense-ledger-view.mjs',import.meta.url))],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',minify});const module=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
 const b=fixture(t,{script:module.EXPENSE_LEDGER_CLIENT});b.start();await b.workspace.open('2026-10');b.create('Boleto internet','149,90');b.input('Category','BILL');assert.equal(await b.submit(),true);b.input('Remainder','0');assert.equal(b.el('ConfirmationEquation').textContent,'R$\u00a0149,90 + R$\u00a00,00 = R$\u00a0149,90');b.create('Rascunho preservado','7,50');assert.equal(b.button('Informar pagamento').onclick(),false);assert.equal(b.el('Amount').value,'7,50');b.el('Confirmed').checked=true;b.el('Confirmed').onchange();assert.equal(await b.el('Confirm').onclick(),true);assert.equal((await b.read('2026-10')).current_external_expenses_cents,14990);assert.match(b.el('Coverage').textContent,/149,90/);assert.equal(b.el('Description').value,'Rascunho preservado');
});
