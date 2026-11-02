import test from 'node:test';
import assert from 'node:assert/strict';
import {physicalReturnsBody,PHYSICAL_RETURNS_CLIENT,PHYSICAL_RETURNS_CSS} from '../src/physical-returns-view.mjs';
import {RETURNS_ORIGINAL_ITEMS_CSS} from '../src/returns-original-items-view.mjs';
import {ownerReportBrowser} from './owner-report-browser-fixture.mjs';
import {returnsOriginalItemsUIFixture} from './returns-original-items-ui-fixture.mjs';

const clone=value=>JSON.parse(JSON.stringify(value)),base=value=>value.report??value;
function mount(initial=returnsOriginalItemsUIFixture()){
 const b=ownerReportBrowser(physicalReturnsBody()+'<script>'+PHYSICAL_RETURNS_CLIENT+'</script>',{scriptIncludes:'globalThis.brazaPhysicalReturns='}),calls=[];let transport=null,current=clone(initial);
 b.context.source=async(path,body)=>{assert.equal(body,undefined,'read-only item evidence never writes a physical or provider fact');calls.push(path);return JSON.stringify(transport?await transport(path):current);};
 b.run("class EvidenceClock extends Date{constructor(...args){super(...(args.length?args:['2026-11-02T15:00:00Z']));}static now(){return Date.parse('2026-11-02T15:00:00Z');}}globalThis.Date=EvidenceClock;globalThis.brazaMonthDashboard={getSnapshot:()=>({month:'2026-10'})};const evidenceApi=async(path,body)=>JSON.parse(await source(path,body));brazaPhysicalReturns.bootstrapState({phase:'READY'});brazaPhysicalReturns.start({api:evidenceApi});");
 return {b,calls,set:data=>{current=clone(data);},setTransport:fn=>{transport=fn;},async open(){b.run('brazaPhysicalReturns.open();');await b.flush();},async reload(){await b.nodes.get('physicalReturnsReload').onclick();await b.flush();},text:()=>b.nodes.get('physicalReturnsOriginalItemsStatus').textContent+' '+b.nodes.get('physicalReturnsOriginalItemsSources').textContent,sourcesText:()=>b.nodes.get('physicalReturnsOriginalItemsSources').textContent,field:name=>b.nodes.get('physicalReturnsReceiveForm').querySelector('[name="'+name+'"]'),snapshot:()=>JSON.parse(b.run('JSON.stringify(brazaPhysicalReturns.getSnapshot())')),stop:()=>b.run('brazaPhysicalReturns.stop()')};
}

test('original item UI reuses the physical month and source selector without adding duplicate inputs or write actions',()=>{
 const html=physicalReturnsBody(),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(row=>row[1]);assert.equal(ids.length,new Set(ids).size);assert.equal(ids.filter(id=>id==='physicalReturnsSourceCase').length,1);assert.equal(ids.filter(id=>id==='physicalReturnsMonthSelect').length,1);
 assert.ok(html.indexOf('id="physicalReturnsSourceFacts"')<html.indexOf('id="physicalReturnsOriginalItems"'));assert.ok(html.indexOf('id="physicalReturnsOriginalItems"')<html.indexOf('id="physicalReturnsRegister"'));assert.match(html,/unidades comerciais/);assert.match(html,/kit vendido não confirma/);assert.doesNotMatch(RETURNS_ORIGINAL_ITEMS_CSS,/min-width:\s*\d{3,}px/);assert.ok(PHYSICAL_RETURNS_CSS.includes(RETURNS_ORIGINAL_ITEMS_CSS));
});

test('the negotiated lazy read shows order quantity and requested quantity independently without physical autofill',async t=>{
 const initial=returnsOriginalItemsUIFixture(),before=JSON.stringify(initial),ui=mount(initial);t.after(ui.stop);assert.equal(ui.calls.length,0);await ui.open();assert.deepEqual(ui.calls,['returns/physical?month=2026-10&evidence=original-items-v1']);
 assert.match(ui.sourcesText(),/Itens observados no pedido.*2 unidade\(s\) comercial/is);assert.match(ui.sourcesText(),/Itens observados na solicitação de devolução.*1 unidade\(s\) comercial/is);assert.match(ui.text(),/Ainda não|ainda|não comprova/);assert.equal(ui.b.nodes.get('physicalReturnsOriginalItems').dataset.state,'AVAILABLE');
 assert.deepEqual(ui.snapshot(),base(initial));assert.equal(ui.field('quantity').value,'');assert.equal(ui.snapshot().physical.summary.active_quantity,1);assert.equal(ui.snapshot().physical.valuation.amount_cents,null);assert.equal(JSON.stringify(initial),before);
});

test('selecting a different source case changes only observed items and retains receive/inspection drafts',async t=>{
 const ui=mount();t.after(ui.stop);await ui.open();ui.field('receipt_ref').value='Meu pacote incompleto';ui.field('receipt_ref').oninput();ui.field('quantity').value='7';ui.field('quantity').oninput();const before=ui.calls.length,source=base(returnsOriginalItemsUIFixture()).source.cases[1];
 ui.b.nodes.get('physicalReturnsSourceCase').value=source.case_hash;ui.b.nodes.get('physicalReturnsSourceCase').onchange();assert.equal(ui.calls.length,before);assert.match(ui.sourcesText(),/Produto #1001/);assert.match(ui.sourcesText(),/3 unidade\(s\) comercial/);assert.equal(ui.field('receipt_ref').value,'Meu pacote incompleto');assert.equal(ui.field('quantity').value,'7');assert.equal(ui.snapshot().physical.summary.active_quantity,1);
});

test('legacy and missing saved item evidence degrade only this panel and never display an inferred zero quantity',async t=>{
 for(const frame of [returnsOriginalItemsUIFixture({legacy:true}),returnsOriginalItemsUIFixture({missingCase:true}),returnsOriginalItemsUIFixture({missingAll:true}),{...returnsOriginalItemsUIFixture(),original_items:null}]){
  const ui=mount(frame);t.after(ui.stop);await ui.open();assert.deepEqual(ui.snapshot(),base(frame));assert.match(ui.text(),/desconhecid|não.*preservad|antiga/);assert.doesNotMatch(ui.sourcesText(),/0 unidade/);assert.equal(ui.field('quantity').value,'');assert.equal(ui.snapshot().physical.summary.active_quantity,1);
 }
});

test('a malformed or wrong-publication v2 response cannot downgrade or replace the last verified item/physical evidence',async t=>{
 const valid=returnsOriginalItemsUIFixture(),ui=mount(valid);t.after(ui.stop);await ui.open();const old=ui.text(),snapshot=ui.snapshot();
 for(const mutate of [value=>value.original_items.original_items[0].orders[0].items[0].quantity=0,value=>value.original_items.report.source_revision++,value=>value.original_items.original_items[0].cases[0].order_hash='f'.repeat(64),value=>value.original_items.extra='PRIVATE',value=>value.report.source.cases[0].publication_revision++]){
  const next=clone(valid);mutate(next);ui.set(next);await ui.reload();assert.equal(ui.text(),old);assert.deepEqual(ui.snapshot(),snapshot);assert.match(ui.b.nodes.get('physicalReturnsStatus').textContent,/Não foi possível/);assert.doesNotMatch(ui.text(),/PRIVATE/);
 }
});

test('a late old-month response cannot repopulate the selected source panel and pinned month preserves physical drafts',async t=>{
 const ui=mount();t.after(ui.stop);await ui.open();ui.field('receipt_ref').value='Rascunho preservado';ui.field('receipt_ref').oninput();let finish;
 ui.setTransport(()=>new Promise(resolve=>{finish=resolve;}));const old=ui.b.nodes.get('physicalReturnsReload').onclick();await ui.b.flush();ui.setTransport(()=>returnsOriginalItemsUIFixture({month:'2026-11',legacy:true}));ui.b.nodes.get('physicalReturnsMonthSelect').value='2026-11';await ui.b.nodes.get('physicalReturnsMonthSelect').onchange();await ui.b.flush();assert.equal(ui.snapshot().month,'2026-11');assert.equal(ui.sourcesText(),'');finish(returnsOriginalItemsUIFixture());await old;await ui.b.flush();assert.equal(ui.snapshot().month,'2026-11');assert.equal(ui.sourcesText(),'');assert.equal(ui.field('receipt_ref').value,'Rascunho preservado');assert.equal(ui.b.run('brazaMonthDashboard.getSnapshot().month'),'2026-10');
});

test('logging out clears original items and a delayed response cannot restore them',async()=>{
 const ui=mount();await ui.open();let finish;ui.setTransport(()=>new Promise(resolve=>{finish=resolve;}));const pending=ui.b.nodes.get('physicalReturnsReload').onclick();await ui.b.flush();ui.stop();finish(returnsOriginalItemsUIFixture());await pending;await ui.b.flush();assert.equal(ui.sourcesText(),'');assert.equal(ui.b.nodes.get('physicalReturnsOriginalItems').dataset.state,'UNAVAILABLE');assert.equal(ui.snapshot(),null);
});
