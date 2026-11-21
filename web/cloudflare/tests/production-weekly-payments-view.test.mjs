import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {transform} from 'esbuild';
import {ownerReportBrowser} from './owner-report-browser-fixture.mjs';
import {D1} from './sqlite-d1.mjs';
import {readProductionWeeklyPaymentsWorkspace,mutateProductionWeeklyPaymentsWorkspace} from '../src/production-weekly-payments.mjs';
import {productionWeeklyPaymentsBody,PRODUCTION_WEEKLY_PAYMENTS_CSS,PRODUCTION_WEEKLY_PAYMENTS_CLIENT,projectProductionWeeklyPaymentsWorkspace,projectProductionWeeklyPaymentPreview,parseProductionWeeklyPaymentAmount} from '../src/production-weekly-payments-view.mjs';

const clone=value=>JSON.parse(JSON.stringify(value)),clock=Date.UTC(2026,10,20,20),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),provider=id(1),secondProvider=id(2),firstObligation=id(101),secondObligation=id(102),actor='synthetic-weekly-owner';
const query=provider_id=>({provider_id,cursor:null,history_cursor:null});
async function fixture(t){
 const env={ADMIN_DB:new D1()},now=()=>clock; t.after(()=>env.ADMIN_DB.db.close());
 const mutate=body=>mutateProductionWeeklyPaymentsWorkspace(env,body,actor,{now});
 const read=selected=>readProductionWeeklyPaymentsWorkspace(env,selected,{now});
 const command=(action,provider_id,expected_revision,fields)=>({action,provider_id,expected_scope:{organization_id:'legacy-brazacommerce',store_id:'legacy-shopee'},expected_revision,request_id:webcrypto.randomUUID(),...fields});
 await mutate(command('save_provider',provider,0,{name:'Prestador sintético'}));
 await mutate(command('save_provider',secondProvider,0,{name:'Outro prestador sintético'}));
 await mutate(command('add_obligation',provider,1,{obligation_id:firstObligation,week_end:'2026-11-13',amount_cents:100000,reference:'Semana sintética A'}));
 await mutate(command('add_obligation',provider,2,{obligation_id:secondObligation,week_end:'2026-11-20',amount_cents:80000,reference:'Semana sintética B'}));
 return {env,read,mutate,command};
}
async function mount(t,f,{minify=false,panel='agent-production'}={}){
 const code=minify?(await transform(PRODUCTION_WEEKLY_PAYMENTS_CLIENT,{minify:true,target:'es2022',format:'iife'})).code:PRODUCTION_WEEKLY_PAYMENTS_CLIENT;
 const b=ownerReportBrowser(productionWeeklyPaymentsBody()+'<script>'+code+'</script>',{scriptIncludes:'globalThis.brazaProductionWeeklyPayments='}),calls=[];
 b.context.crypto=webcrypto;b.context.syntheticClock=clock;b.context.syntheticPanel=panel;
 let transport=async(path,body)=>{
  if(body!==undefined)return f.mutate(body);
  const params=new URL('https://synthetic.test/'+path).searchParams;
  assert.deepEqual([...params.keys()].sort(),['cursor','history_cursor','provider_id']);
  return f.read({provider_id:params.get('provider_id')||null,cursor:params.get('cursor')||null,history_cursor:params.get('history_cursor')||null});
 };
 b.context.transport=async(path,body)=>{calls.push({path,body:body===undefined?null:clone(body),frozen:body!==undefined&&Object.isFrozen(body)});return JSON.stringify(await transport(path,body===undefined?undefined:clone(body)));};
 b.run('class PaymentDate extends Date{constructor(...args){super(...(args.length?args:[syntheticClock]));}static now(){return syntheticClock;}}globalThis.Date=PaymentDate;document.documentElement.dataset.activePanel=syntheticPanel;const paymentApi=async(path,body)=>JSON.parse(await transport(path,body));brazaProductionWeeklyPayments.start({api:paymentApi});');
 const el=name=>b.nodes.get('productionWeeklyPayments'+name);
 const ui={b,calls,el,setTransport:fn=>{transport=fn;},snapshot:()=>clone(b.run('brazaProductionWeeklyPayments.getSnapshot()')),async open(){const result=b.run('brazaProductionWeeklyPayments.open()');await b.flush();return result;},async refresh(){const result=b.run('brazaProductionWeeklyPayments.refresh()');await b.flush();return result;},async select(value){el('Provider').value=value;const result=el('Provider').onchange();await b.flush();return result;},fill(values){for(const [name,value]of Object.entries(values)){const field=el(name);assert.ok(field,'field exists '+name);if(typeof value==='boolean'){field.checked=value;field.onchange?.();}else{field.value=value;field.oninput?.();}}},async submit(form){const result=el(form).onsubmit({preventDefault(){}});await b.flush();return result;},async click(name){const result=el(name).onclick();await b.flush();return result;},stop(){b.run('brazaProductionWeeklyPayments.stop()');b.timers.clear();}};
 t.after(()=>ui.stop());return ui;
}
const paymentDraft={PaymentAmount:'1.200,00',PaidOn:'2026-11-20',PaymentReference:'Comprovante sintético 1200'};

test('payment currency parsing uses integer cents and rejects fractional cents and unsafe values',()=>{
 for(const [raw,expected]of [['1.200,00',120000],['1200,00',120000],['1200.00',120000],['1.200',120000],['0,01',1],['15,9',1590],['90071992547409,91',Number.MAX_SAFE_INTEGER]])assert.equal(parseProductionWeeklyPaymentAmount(raw),expected,raw);
 for(const raw of ['','0','0,00','-1','1,001','1.20,00','1e3','90071992547409,92','Infinity',' 1,2,3 ',null,1200])assert.equal(parseProductionWeeklyPaymentAmount(raw),null,String(raw));
});

test('workspace projection accepts actual saved sources and rejects forged amounts, coverage, timing and accessors',async t=>{
 const f=await fixture(t),frame=await f.read(query(provider));assert.ok(projectProductionWeeklyPaymentsWorkspace(frame));
 for(const alter of [v=>v.money_transfer_allowed=true,v=>v.bank_reconciliation_confirmed=true,v=>v.selected.outstanding_cents--,v=>v.providers[0].declared_amount_cents++,v=>v.selected.obligations[0].settled_cents=10,v=>v.selected.obligations[0].period_start_at++,v=>v.selected.obligations[0].reference='a'.repeat(121),v=>v.selected.unreviewed=true,v=>v.history.rows[0].entity_id=secondProvider]){const changed=clone(frame);alter(changed);assert.equal(projectProductionWeeklyPaymentsWorkspace(changed),null);}
 let getters=0;const changed=clone(frame);Object.defineProperty(changed.history.rows[0].command,'action',{enumerable:true,get(){getters++;return 'apply_payment';}});assert.equal(projectProductionWeeklyPaymentsWorkspace(changed),null);assert.equal(getters,0);
 const detached=projectProductionWeeklyPaymentsWorkspace(frame);detached.selected.outstanding_cents=1;assert.equal(frame.selected.outstanding_cents,180000);
});

test('preview projector independently checks FIFO cents and rejects reordered or stale allocations',async t=>{
 const f=await fixture(t),frame=await f.read(query(provider)),selected=frame.selected;
 const body=f.command('preview_payment',provider,selected.revision,{payment_id:id(500),amount_cents:120000,paid_on:'2026-11-20',reference:'Prévia sintética'}),preview=await f.mutate(body);
 assert.ok(projectProductionWeeklyPaymentPreview(preview,selected,frame.scope));
 for(const alter of [v=>v.allocations.reverse(),v=>v.allocations[0].amount_cents--,v=>v.allocations[1].remaining_cents++,v=>v.source_revision++,v=>v.outstanding_after_cents=0,v=>v.money_transfer_allowed=true,v=>v.preview_hash='?',v=>v.paid_on='2026-02-30']){const changed=clone(preview);alter(changed);assert.equal(projectProductionWeeklyPaymentPreview(changed,selected,frame.scope),null);}
 let getters=0;const changed=clone(preview);Object.defineProperty(changed.allocations,'0',{enumerable:true,get(){getters++;return preview.allocations[0];}});assert.equal(projectProductionWeeklyPaymentPreview(changed,selected,frame.scope),null);assert.equal(getters,0);
});

for(const minify of [false,true])test('actual weekly payment workspace renders read-only discovery, FIFO preview and explicit commit '+(minify?'minified':'normal'),async t=>{
 const f=await fixture(t),ui=await mount(t,f,{minify});assert.equal(ui.calls.length,0);await ui.open();assert.equal(ui.calls.length,1);assert.equal(ui.snapshot().selected,null);await ui.select(provider);
 assert.equal(ui.snapshot().selected.outstanding_cents,180000);assert.match(ui.el('Summary').textContent,/1\.800,00/);assert.equal(ui.calls.filter(row=>row.body).length,0);
 ui.fill(paymentDraft);assert.equal(await ui.submit('PaymentForm'),true);assert.equal(ui.calls.filter(row=>row.body?.action==='preview_payment').length,1);assert.equal(ui.el('ApplyPayment').disabled,true);assert.match(ui.el('Preview').textContent,/1\.000,00/);assert.match(ui.el('Preview').textContent,/600,00/);
 assert.equal((await f.read(query(provider))).selected.outstanding_cents,180000,'preview never records payment');assert.equal(await ui.click('ApplyPayment'),false);
 ui.fill({PaymentConfirmed:true});assert.equal(ui.el('ApplyPayment').disabled,false);assert.equal(await ui.click('ApplyPayment'),true);
 const saved=(await f.read(query(provider))).selected;assert.deepEqual(saved.obligations.map(row=>row.remaining_cents),[0,60000]);assert.equal(saved.payments.length,1);assert.equal(saved.payments[0].amount_cents,120000);assert.deepEqual(ui.snapshot().selected,saved);assert.equal(ui.el('PaymentAmount').value,'');
 const preview=ui.calls.find(row=>row.body?.action==='preview_payment').body,applied=ui.calls.find(row=>row.body?.action==='apply_payment');assert.equal(applied.frozen,true);for(const key of ['provider_id','expected_revision','request_id','payment_id','amount_cents','paid_on','reference'])assert.equal(applied.body[key],preview[key]);assert.deepEqual(applied.body.expected_scope,preview.expected_scope);assert.deepEqual(applied.body.expected_scope,{organization_id:'legacy-brazacommerce',store_id:'legacy-shopee'});assert.match(applied.body.preview_hash,/^[a-f0-9]{64}$/);
 assert.match(productionWeeklyPaymentsBody(),/Registrar pagamento já realizado/);assert.match(productionWeeklyPaymentsBody(),/não envia dinheiro/);assert.match(PRODUCTION_WEEKLY_PAYMENTS_CSS,/min-height:44px/);assert.match(PRODUCTION_WEEKLY_PAYMENTS_CSS,/var\(--surface\)/);
});

test('lost committed response retries the identical frozen command and never applies the payment twice',async t=>{
 const f=await fixture(t),ui=await mount(t,f);await ui.open();await ui.select(provider);ui.fill(paymentDraft);await ui.submit('PaymentForm');ui.fill({PaymentConfirmed:true});let lost=true;
 ui.setTransport(async(path,body)=>{if(body){const result=await f.mutate(body);if(body.action==='apply_payment'&&lost){lost=false;throw Object.assign(Error('SYNTHETIC_LOST_RESPONSE'),{status:503});}return result;}const p=new URL('https://synthetic.test/'+path).searchParams;return f.read({provider_id:p.get('provider_id')||null,cursor:p.get('cursor')||null,history_cursor:p.get('history_cursor')||null});});
 assert.equal(await ui.click('ApplyPayment'),false);assert.equal(ui.el('Retry').hidden,false);assert.equal(ui.el('Provider').disabled,true);assert.equal(ui.el('PaymentAmount').value,paymentDraft.PaymentAmount);const first=clone(ui.calls.find(row=>row.body?.action==='apply_payment').body);
 assert.equal(await ui.click('ApplyPayment'),false);assert.equal(await ui.click('Retry'),true);assert.deepEqual(ui.calls.filter(row=>row.body?.action==='apply_payment').map(row=>row.body),[first,first]);assert.equal((await f.read(query(provider))).selected.payments.length,1);assert.equal(ui.snapshot().selected.outstanding_cents,60000);assert.equal(ui.el('Retry').hidden,true);
});

test('a concurrent obligation invalidates the old preview, reloads the source and preserves the unaccepted draft',async t=>{
 const f=await fixture(t),ui=await mount(t,f);await ui.open();await ui.select(provider);ui.fill(paymentDraft);await ui.submit('PaymentForm');ui.fill({PaymentConfirmed:true});
 await f.mutate(f.command('add_obligation',provider,3,{obligation_id:id(103),week_end:'2026-11-06',amount_cents:1000,reference:'Outra sessão sintética'}));
 assert.equal(await ui.click('ApplyPayment'),false);assert.equal(ui.snapshot().selected.revision,4);assert.equal(ui.el('PaymentAmount').value,paymentDraft.PaymentAmount);assert.equal(ui.el('PaymentReference').value,paymentDraft.PaymentReference);assert.equal(ui.el('ApplyPayment').disabled,true);assert.equal(ui.el('Retry').hidden,true);assert.match(ui.el('Status').textContent,/registros mudaram/i);assert.equal((await f.read(query(provider))).selected.payments.length,0);
});

test('editing a preview invalidates confirmation and payment inputs cannot bypass explicit date and amount checks',async t=>{
 const f=await fixture(t),ui=await mount(t,f);await ui.open();await ui.select(provider);ui.fill(paymentDraft);await ui.submit('PaymentForm');ui.fill({PaymentConfirmed:true});ui.fill({PaymentAmount:'1.100,00'});assert.equal(ui.el('ApplyPayment').disabled,true);assert.equal(await ui.click('ApplyPayment'),false);
 const before=ui.calls.length;for(const draft of [{PaymentAmount:'0,00'},{PaymentAmount:'1.800,01'},{PaymentAmount:'1,00',PaidOn:'2026-11-21'},{PaidOn:'2026-11-20',PaymentReference:''}]){ui.fill(draft);assert.equal(await ui.submit('PaymentForm'),false);}assert.equal(ui.calls.length,before);assert.equal((await f.read(query(provider))).selected.payments.length,0);
});

test('provider navigation preserves isolated drafts and returning cannot reuse another provider preview',async t=>{
 const f=await fixture(t),ui=await mount(t,f);await ui.open();await ui.select(provider);ui.fill({...paymentDraft,ObligationReference:'Rascunho do primeiro'});await ui.submit('PaymentForm');await ui.select(secondProvider);
 assert.equal(ui.el('PaymentAmount').value,'');assert.equal(ui.el('ObligationReference').value,'');assert.equal(ui.el('ApplyPayment').disabled,true);ui.fill({ObligationReference:'Rascunho do segundo'});await ui.select(provider);assert.equal(ui.el('PaymentAmount').value,paymentDraft.PaymentAmount);assert.equal(ui.el('ObligationReference').value,'Rascunho do primeiro');assert.equal(ui.el('ApplyPayment').disabled,true);await ui.select(secondProvider);assert.equal(ui.el('ObligationReference').value,'Rascunho do segundo');
});

test('saving a provider and explicit obligation uses declarations, then permits audited reversal without transferring funds',async t=>{
 const f=await fixture(t),ui=await mount(t,f);await ui.open();ui.fill({ProviderName:'Novo prestador sintético'});assert.equal(await ui.submit('ProviderForm'),true);const selected=ui.snapshot().selected;assert.equal(selected.name,'Novo prestador sintético');assert.equal(selected.outstanding_cents,0);
 ui.fill({WeekEnd:'2026-11-13',ObligationAmount:'50,25',ObligationReference:'Contrato sintético novo'});assert.equal(await ui.submit('ObligationForm'),false);ui.fill({ObligationConfirmed:true});assert.equal(await ui.submit('ObligationForm'),true);assert.equal(ui.snapshot().selected.outstanding_cents,5025);
 ui.fill({PaymentAmount:'10,00',PaidOn:'2026-11-20',PaymentReference:'Comprovante novo sintético'});await ui.submit('PaymentForm');ui.fill({PaymentConfirmed:true});await ui.click('ApplyPayment');const payment=ui.snapshot().selected.payments[0];ui.fill({ReversePayment:payment.payment_id,ReverseReason:'Correção sintética do registro'});assert.equal(await ui.submit('ReverseForm'),false);ui.fill({ReverseConfirmed:true});assert.equal(await ui.submit('ReverseForm'),true);assert.equal(ui.snapshot().selected.outstanding_cents,5025);assert.equal(ui.snapshot().selected.payments[0].status,'REVERSED');assert.equal(ui.snapshot().money_transfer_allowed,false);assert.equal(ui.snapshot().bank_reconciliation_confirmed,false);
 const obligation=ui.snapshot().selected.obligations[0];ui.fill({CancelObligation:obligation.obligation_id,CancelReason:'Acordo sintético anulado',CancelConfirmed:true});assert.equal(await ui.submit('CancelForm'),true);assert.equal(ui.snapshot().selected.obligations[0].status,'CANCELLED');assert.equal(ui.snapshot().selected.outstanding_cents,0);
});

test('forbidden reads clear facts and drafts, while responses from a stopped session are ignored',async t=>{
 const f=await fixture(t),ui=await mount(t,f);await ui.open();await ui.select(provider);ui.fill(paymentDraft);ui.setTransport(async()=>{throw Object.assign(Error('SYNTHETIC_FORBIDDEN'),{status:403});});assert.equal(await ui.refresh(),false);assert.equal(ui.snapshot(),null);assert.equal(ui.el('PaymentAmount').value,'');assert.equal(ui.el('ProviderName').value,'');assert.equal(ui.el('Provider').disabled,true);
 const second=await mount(t,f);await second.open();await second.select(provider);const ready=Promise.withResolvers();let release;second.setTransport(async()=>{const frame=await f.read(query(provider));ready.resolve();return new Promise(resolve=>{release=()=>resolve(frame);});});const pending=second.refresh();await ready.promise;second.stop();release();assert.equal(await pending,false);assert.equal(second.snapshot(),null);assert.equal(second.el('Provider').disabled,true);
});

test('provider and audit pagination keep the selected provider and draft while moving bounded pages',async t=>{
 const f=await fixture(t),ui=await mount(t,f);await ui.open();await ui.select(provider);ui.fill({ObligationReference:'Continuar este rascunho'});const base=await f.read(query(provider));
 ui.setTransport(async(path)=>{const params=new URL('https://synthetic.test/'+path).searchParams;const result=clone(base);result.next_cursor=params.get('cursor')?null:'synthetic-provider-page';result.history.next_cursor=params.get('history_cursor')?null:'synthetic-history-page';return result;});await ui.refresh();assert.equal(await ui.click('ProvidersNext'),true);assert.equal(new URL('https://synthetic.test/'+ui.calls.at(-1).path).searchParams.get('cursor'),'synthetic-provider-page');assert.equal(ui.el('Provider').value,provider);assert.equal(ui.el('ObligationReference').value,'Continuar este rascunho');assert.equal(await ui.click('ProvidersPrevious'),true);
 assert.equal(await ui.click('HistoryNext'),true);assert.equal(new URL('https://synthetic.test/'+ui.calls.at(-1).path).searchParams.get('history_cursor'),'synthetic-history-page');assert.equal(ui.el('ObligationReference').value,'Continuar este rascunho');assert.equal(await ui.click('HistoryPrevious'),true);
});

test('normal startup and hidden panels cannot trigger any provider or payment operation',async t=>{
 const f=await fixture(t),ui=await mount(t,f,{panel:'overview'});await ui.open();assert.equal(ui.calls.length,0);ui.b.run('document.documentElement.dataset.activePanel="agent-production"');await ui.open();assert.equal(ui.calls.length,1);assert.equal(ui.calls[0].body,null);assert.equal(ui.snapshot().selected,null);
});

test('retry after a later independent revision preserves the original receipt and accepts the current scoped workspace',async t=>{
 const f=await fixture(t),ui=await mount(t,f);await ui.open();await ui.select(provider);ui.fill(paymentDraft);await ui.submit('PaymentForm');ui.fill({PaymentConfirmed:true});let lost=true;
 ui.setTransport(async(path,body)=>{if(body){const result=await f.mutate(body);if(body.action==='apply_payment'&&lost){lost=false;throw Object.assign(Error('SYNTHETIC_LOST_RESPONSE'),{status:503});}return result;}const p=new URL('https://synthetic.test/'+path).searchParams;return f.read({provider_id:p.get('provider_id')||null,cursor:p.get('cursor')||null,history_cursor:p.get('history_cursor')||null});});
 assert.equal(await ui.click('ApplyPayment'),false);const first=clone(ui.calls.filter(row=>row.body?.action==='apply_payment').at(-1).body);
 await f.mutate(f.command('add_obligation',provider,4,{obligation_id:id(103),week_end:'2026-11-06',amount_cents:1000,reference:'Obrigação sintética posterior'}));
 assert.equal(await ui.click('Retry'),true);assert.equal(ui.snapshot().selected.revision,5);assert.equal(ui.snapshot().selected.outstanding_cents,61000);assert.equal(ui.snapshot().selected.payments.length,1);assert.deepEqual(ui.calls.filter(row=>row.body?.action==='apply_payment').at(-1).body,first);
});

test('a response from another store clears facts, all drafts and payment authority before another action',async t=>{
 const f=await fixture(t),ui=await mount(t,f);await ui.open();await ui.select(provider);ui.fill(paymentDraft);await ui.submit('PaymentForm');ui.fill({PaymentConfirmed:true});const changed=await f.read(query(provider));changed.scope={...changed.scope,store_id:'another-synthetic-store'};for(const row of changed.history.rows)row.scope={...changed.scope};assert.ok(projectProductionWeeklyPaymentsWorkspace(changed));
 ui.setTransport(async()=>changed);assert.equal(await ui.refresh(),false);assert.equal(ui.snapshot(),null);assert.equal(ui.el('PaymentAmount').value,'');assert.equal(ui.el('PaymentReference').value,'');assert.equal(ui.el('ApplyPayment').disabled,true);assert.equal(ui.el('Provider').disabled,true);assert.equal(await ui.click('ApplyPayment'),false);assert.match(ui.el('Status').textContent,/empresa ou loja mudou/);
});

test('preview scope is mandatory and must match the source workspace',async t=>{
 const f=await fixture(t),frame=await f.read(query(provider)),body=f.command('preview_payment',provider,3,{payment_id:id(700),amount_cents:1,paid_on:'2026-11-20',reference:'Prévia de escopo sintético'}),preview=await f.mutate(body);
 assert.ok(projectProductionWeeklyPaymentPreview(preview,frame.selected,frame.scope));assert.equal(projectProductionWeeklyPaymentPreview(preview,frame.selected),null);assert.equal(projectProductionWeeklyPaymentPreview({...preview,scope:{...frame.scope,store_id:'different-store'}},frame.selected,frame.scope),null);
});
