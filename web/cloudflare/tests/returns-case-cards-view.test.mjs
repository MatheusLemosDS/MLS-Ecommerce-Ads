import test from 'node:test';
import assert from 'node:assert/strict';
import {returnsCaseCardsBody,RETURNS_CASE_CARDS_CSS,createReturnCaseCardsView} from '../src/returns-case-cards-view.mjs';
import {ownerReportBrowser} from './owner-report-browser-fixture.mjs';

const hash=letter=>letter.repeat(64);
function card(letter='a',overrides={}){return {case_hash:hash(letter),order_hash:hash('f'),source_status:'ACCEPTED',source_checked_at:1793628000,receipt_state:'WAITING',data_state:'READY',pending:[],proposal_hash:hash('d'),can_confirm:true,requested_refund_cents:4837,confirmed_at:null,items:[{item_id:'1234',model_id:'67',requested_quantity:3,ordered_quantity:4,product_name:'Camiseta Universo',model_name:'Verde, M',selling_unit:'SINGLE_GARMENT',components:[{quantity:3,artwork:'Universo',color:'Verde',size:'M',garment_type:'ADULT',fit:'UNISEX'}],unit_cost_cents:1475,current_cost_cents:4425,image_url:null,artwork:null}],...overrides};}
function mount({artworkLoader}={}){
 const b=ownerReportBrowser(returnsCaseCardsBody()+'<script>globalThis.createCards='+createReturnCaseCardsView.toString()+';</script>',{scriptIncludes:'globalThis.createCards='}),calls=[];
 const ui=b.context.createCards({documentImpl:b.context.document,artworkLoader,onConfirm:value=>calls.push(['correct',value.case_hash]),onProblem:(value,problem)=>calls.push(['problem',value.case_hash,problem]),onAdvanced:value=>calls.push(['advanced',value.case_hash])});
 const render=cards=>ui.render({schema:'returns_receipt_workspace_v1',month:'2026-11',cards,truncated:false});
 const list=b.nodes.get('physicalReturnsQueueList');
 const buttons=()=>list.querySelectorAll('button');
 const click=label=>{const button=buttons().find(row=>row.textContent===label);assert.ok(button,label);return button.onclick();};
 return {b,ui,calls,render,list,click};
}

test('cards keep one visible queue, real names, total physical components and current costs separate from refunds',()=>{
 const html=returnsCaseCardsBody(),ids=[...html.matchAll(/id="([^"]+)"/g)].map(value=>value[1]);assert.equal(new Set(ids).size,ids.length);assert.match(RETURNS_CASE_CARDS_CSS,/min-height:44px/);
 const t=mount();t.render([card()]);assert.match(t.list.textContent,/Camiseta Universo/);assert.match(t.list.textContent,/3 peça\(s\).*Verde.*M/);assert.match(t.list.textContent,/Quantidade solicitada: 3 unidade/);assert.match(t.list.textContent,/Custo cadastrado atual: R\$\s*44,25/);assert.match(t.list.textContent,/Valor solicitado nesta devolução: R\$\s*48,37/);assert.doesNotMatch(t.list.textContent,/reembolso pago:\s*R\$/);assert.equal(t.calls.length,0,'rendering a queue never receives merchandise');
 t.click('Recebi corretamente');assert.deepEqual(t.calls,[['correct',hash('a')]]);
});

test('missing photo, print and cost never gate a valid confirmed proposal or become zero',()=>{
 const t=mount(),value=card();value.items[0].current_cost_cents=null;t.render([value]);assert.match(t.list.textContent,/Foto não disponível/);assert.match(t.list.textContent,/Custo cadastrado atual: Não identificado/);assert.ok(t.list.querySelectorAll('button').some(row=>row.textContent==='Recebi corretamente'&&!row.disabled));assert.doesNotMatch(t.list.textContent,/R\$\s*0,00/);
});

test('unknown and kit review require actual physical count and keep the short problem draft across render',()=>{
 const t=mount(),value=card('a',{data_state:'NOT_CAPTURED',can_confirm:false,items:[]});t.render([value]);assert.equal(t.list.querySelectorAll('button').some(row=>row.textContent==='Recebi corretamente'),false);t.click('Conferir recebimento');let form=t.list.querySelector('form'),quantity=form.querySelectorAll('input').find(row=>row.name==='quantity'),reason=form.querySelectorAll('textarea')[0];assert.equal(quantity.value,'');quantity.value='2';quantity.oninput();reason.value='Pacote parcial';reason.oninput();t.render([value]);form=t.list.querySelector('form');quantity=form.querySelectorAll('input').find(row=>row.name==='quantity');assert.equal(quantity.value,'2');assert.match(form.textContent,/Kits e peças sem identificação/);form.onsubmit({preventDefault(){}});assert.deepEqual(JSON.parse(JSON.stringify(t.calls)),[['problem',hash('a'),{quantity:2,condition:'QUARANTINE',reason:'Pacote parcial'}]]);
});

test('filters and search use saved data locally and received/problem cards expose only history',()=>{
 const t=mount();t.render([card(),card('b',{receipt_state:'RECEIVED',confirmed_at:1793628000,can_confirm:false}),card('c',{receipt_state:'PROBLEM',can_confirm:false})]);const filter=t.b.nodes.get('physicalReturnsQueueFilters').children.find(row=>row.dataset.receiptFilter==='RECEIVED');filter.onclick();assert.equal(t.list.children.length,1);assert.match(t.list.textContent,/Recebimento conferido/);assert.equal(t.list.querySelectorAll('button').length,1);assert.match(t.list.textContent,/Ver recebimento e histórico/);t.b.nodes.get('physicalReturnsQueueSearch').value='ausente';t.b.nodes.get('physicalReturnsQueueSearch').oninput();assert.match(t.list.textContent,/Nenhuma solicitação/);assert.equal(t.calls.length,0);
});

test('all asynchronous artwork results are released when stale, replaced or stopped',async()=>{
 let resolve,cleaned=0,disposed=0;const t=mount({artworkLoader:{load:()=>new Promise(done=>{resolve=done;}),dispose:()=>disposed++}}),value=card();value.items[0].artwork={art_key:'universo',sha256:hash('e')};t.render([value]);t.ui.clear();resolve({state:'AVAILABLE',basis:'VERIFIED_HISTORICAL',url:'blob:local-synthetic',cleanup:()=>cleaned++});await t.b.flush();assert.equal(cleaned,1);assert.doesNotMatch(t.list.textContent,/confere com/);t.ui.dispose();assert.equal(disposed,1);
});

test('supplier text stays plain and busy controls cannot create confirmations',()=>{
 const t=mount(),value=card();value.items[0].product_name='<img src=x onerror=unsafe()>';t.ui.render({month:'2026-11',cards:[value],truncated:false},{busy:true});assert.match(t.list.textContent,/<img src=x/);assert.equal(t.list.querySelectorAll('img').length,0);t.click('Recebi corretamente');assert.equal(t.calls.length,0);assert.equal(t.b.nodes.get('physicalReturnsQueueSearch').disabled,true);
});
