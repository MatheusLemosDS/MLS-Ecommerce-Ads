import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {renderAdsMeasurementScope,renderAdsMeasurementDailyTable} from '../src/ads-measurement-view.mjs';

const selection={start_date:'2026-10-21',end_date:'2026-10-21'},stamp=Date.UTC(2026,9,22,1)/1000;
const source=()=>({status:'ok',connected:true,shop:{id:1178167501},period:{...selection},balance:31.07,daily:[{date:'2026-10-21',expense:52.61,broad_gmv:1011.37,broad_order:15,broad_roas:19.28,direct_gmv:500,direct_order:7,direct_roas:'9.50'}]});
const frame=raw=>buildAdsMeasurement(raw??source(),selection,stamp);
const cleanText=html=>html.replace(/<style>[\s\S]*?<\/style>/g,'').replace(/<[^>]*>/g,' ');

test('the screenshot retains source ROAS and calculated ROAS independently, with exact spend and balance credit',()=>{
 const value=frame(),html=renderAdsMeasurementScope({measurement:value},'/dashboard'),text=cleanText(html),table=renderAdsMeasurementDailyTable(value.days);
 for(const expected of ['R$ 52,61','R$ 1.011,37','19,28x','19,223912x','R$ 31,07','21/10/2026','22:00:00','Brasília','horário de corte e o fuso do relatório não são informados','não é o gasto do período','atribuição ampla','difere da divisão'])assert.ok(text.includes(expected),expected);
 assert.ok(table.includes('19,28x'));assert.ok(table.includes('19,223912x'));assert.ok(table.includes('R$ 52,61'));
 assert.ok(html.includes('action="/dashboard"'));assert.ok(html.includes('method="get"'));assert.ok(html.includes('name="start_date" value="2026-10-21" required'));assert.ok(html.includes('name="end_date" value="2026-10-21" required'));
 assert.ok(text.includes('Não somar às vendas de atribuição ampla.'));assert.ok(text.includes('R$ 500,00'));assert.ok(text.includes('9,5x'));
});

test('a new spend reading recalculates its own ratio without altering the reported ratio',()=>{
 const raw=source();raw.daily[0].expense=52.77;
 const html=renderAdsMeasurementScope({measurement:frame(raw)},'/advertising');
 assert.ok(html.includes('R$ 52,77'));assert.ok(html.includes('19,165624x'));assert.ok(html.includes('19,28x'));assert.ok(!html.includes('R$ 52,61'));
});

test('a multi-day period displays ratio of summed amounts and no invented provider total',()=>{
 const input={start_date:'2026-10-20',end_date:'2026-10-21'},raw=source();raw.period=input;
 raw.daily=[{date:'2026-10-20',expense:10,broad_gmv:100,broad_order:1,broad_roas:10},{date:'2026-10-21',expense:90,broad_gmv:450,broad_order:2,broad_roas:5}];
 const value=buildAdsMeasurement(raw,input,stamp),html=renderAdsMeasurementScope({measurement:value},'/performance');
 assert.ok(html.includes('R$ 100,00'));assert.ok(html.includes('R$ 550,00'));assert.ok(html.includes('5,5x'));assert.ok(!html.includes('7,5x'));
 assert.ok(html.includes('O total de ROAS não foi informado; não usamos a média dos dias.'));assert.ok(html.includes('20/10/2026 a 21/10/2026'));
});

test('partial expense coverage never displays a confirmed total or calculated period ROAS',()=>{
 const input={start_date:'2026-10-20',end_date:'2026-10-21'},raw=source();raw.period=input;
 const value=buildAdsMeasurement(raw,input,stamp),html=renderAdsMeasurementScope({measurement:value},'/dashboard');
 assert.equal(value.status,'PARTIAL');assert.ok(html.includes('Gasto conhecido: R$ 52,61'));assert.ok(html.includes('Dias sem gasto informado: 20/10/2026'));assert.ok(html.includes('não são tratados como gasto zero'));
 assert.ok(/Investimento no período<\/span><strong>—<\/strong>/.test(html));assert.ok(/ROAS calculado · amplo<\/span><strong>—<\/strong>/.test(html));
 const table=renderAdsMeasurementDailyTable(value.days);assert.ok(/20\/10\/2026<\/td><td>—<\/td><td>—<\/td>/.test(table));
});

test('a zero-spend day has zero currency, no division ROAS, and no direct-to-broad substitution',()=>{
 const raw=source();raw.daily[0]={date:'2026-10-21',expense:0,direct_gmv:500,direct_order:7,direct_roas:20};
 const value=frame(raw),html=renderAdsMeasurementScope({measurement:value},'/dashboard'),table=renderAdsMeasurementDailyTable(value.days);
 assert.ok(html.includes('R$ 0,00'));assert.ok(/Vendas atribuídas · amplas<\/span><strong>—<\/strong>/.test(html));assert.ok(/ROAS calculado · amplo<\/span><strong>—<\/strong>/.test(html));
 assert.ok(table.includes('R$ 0,00'));assert.ok(!table.includes('R$ 500,00'));assert.ok(!table.includes('20x'));assert.ok(!table.includes('0x'));
});

test('invalid or unavailable measurements keep date controls without exposing raw/private data or unsafe route',()=>{
 const malicious='/dashboard\" onsubmit=\"alert(1)',value={...frame(),private_token:'PRIVATE_TOKEN<script>alert(1)</script>'};
 let html=renderAdsMeasurementScope({measurement:value,private_token:'OTHER_PRIVATE'},malicious);
 assert.ok(html.includes('action="/dashboard"'));assert.ok(html.includes('indisponíveis'));for(const secret of ['PRIVATE_TOKEN','OTHER_PRIVATE','alert(1)','onsubmit='])assert.ok(!html.includes(secret));
 const raw=source();raw.shop.id='OTHER';html=renderAdsMeasurementScope({measurement:frame(raw)},'/integrations');assert.ok(html.includes('action="/integrations"'));assert.ok(html.includes('gasto e o ROAS permanecem indisponíveis'));assert.ok(!html.includes('R$ 0,00'));
});

test('daily table rejects malformed or duplicate dates and only renders allowlisted numbers',()=>{
 for(const rows of [null,[],Array(16).fill(frame().days[0])])assert.ok(renderAdsMeasurementDailyTable(rows).includes('Nenhum dado diário'));
 assert.ok(renderAdsMeasurementDailyTable([frame().days[0],frame().days[0]]).includes('não puderam ser conferidos'));
 const row={...frame().days[0],date:'<img src=x onerror=alert(1)>'};assert.ok(!renderAdsMeasurementDailyTable([row]).includes('<img'));
 const unsafe={...frame().days[0],expense_cents:'<script>PRIVATE</script>',broad:{gmv_cents:'<img>',orders:'<svg>',reported_roas_raw:'<script>',calculated_roas_raw:'<svg>'}};
 const html=renderAdsMeasurementDailyTable([unsafe]);assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img>'));assert.ok(!html.includes('<svg>'));assert.equal((html.match(/<td>—<\/td>/g)||[]).length,5);
});

test('mobile layout contains overflow inside the daily table and uses inherited theme tokens',()=>{
 const html=renderAdsMeasurementScope({measurement:frame()},'/dashboard');
 for(const expected of ['@media(max-width:550px)','grid-template-columns:minmax(0,1fr)','overflow-x:auto','var(--surface,','var(--text,','var(--accent,','aria-label="Período e fonte dos anúncios"'])assert.ok(html.includes(expected),expected);
 const table=renderAdsMeasurementDailyTable(frame().days);assert.ok(table.includes('role="region" tabindex="0"'));assert.ok(table.includes('scope="col"'));
});
