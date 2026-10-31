import test from 'node:test';
import assert from 'node:assert/strict';
import {
 projectMlsDailyChart,projectMlsDistribution,projectMlsDtfStateChart,projectMlsCategoricalChart,renderMlsVerifiedChart
} from '../src/mls-verified-charts.mjs';

const daily = (points)=>({schema:'mls_mission_daily_trend_v1',points});
test('daily area retains real values and never interpolates a missing day',()=>{
 const m=projectMlsDailyChart(daily([
  {date:'2026-10-25',net_cents:1500,partial:false},
  {date:'2026-10-26',net_cents:null,partial:false},
  {date:'2026-10-27',net_cents:3200,partial:true},
  {date:'2026-10-28',net_cents:-100,partial:false}
 ]),'net');
 assert.equal(m.status,'READY');
 assert.equal(m.missing,1);
 assert.equal(m.points[1].value,null);
 const html=renderMlsVerifiedChart(m,{palette:'net'});
 assert.match(html,/<svg\b/);
 assert.match(html,/2026-10-27: R\$ 32,00 \(parcial\)/);
 assert.match(html,/2026-10-28: -R\$ 1,00/);
 assert.match(html,/2 observações reais|3 observações reais/);
 // Only the 27th->28th segment exists, split at zero to retain the loss color.
 // The missing 26th must never become a fabricated 25th->27th segment.
 assert.equal((html.match(/stroke-width="2\.8"/g)||[]).length,2);
});
test('missing, malformed, duplicated, or unordered dates never become a chart',()=>{
 for(const input of [
  null,daily([]),daily([{date:'2026-10-25',sales_cents:0}]),
  daily([{date:'2026-10-25',sales_cents:0},{date:'2026-10-25',sales_cents:100}]),
  daily([{date:'2026-10-26',sales_cents:0},{date:'2026-10-25',sales_cents:100}]),
  daily([{date:'2026-13-99',sales_cents:0},{date:'2026-10-25',sales_cents:100}])
 ]){
  const result=projectMlsDailyChart(input,'sales');
  assert.equal(result.status,'UNAVAILABLE');
  assert.doesNotMatch(renderMlsVerifiedChart(result),/<svg\b/);
 }
});
test('negative net observed and zero ads are numbers, not missing',()=>{
 const net=projectMlsDailyChart(daily([
  {date:'2026-10-27',net_cents:-200},{date:'2026-10-28',net_cents:0}
 ]),'net');
 assert.equal(net.status,'READY');
 const ads=projectMlsDailyChart(daily([
  {date:'2026-10-27',ads_spend_cents:0},{date:'2026-10-28',ads_spend_cents:0}
 ]),'ads');
 assert.equal(ads.status,'READY');
 assert.match(renderMlsVerifiedChart(net),/<svg\b/);
 assert.match(renderMlsVerifiedChart(ads),/<svg\b/);
});
test('donut requires exclusive reconciled groups, never overlapping counters',()=>{
 for(const input of [
  {total:10,complete:false,segments:[{label:'A',value:10}]},
  {total:10,complete:true,segments:[{label:'A',value:5},{label:'B',value:4}]},
  {total:10,complete:true,segments:[{label:'A',value:11}]},
  {total:null,complete:true,segments:[{label:'A',value:10}]},
  {total:10,complete:true,segments:[{label:'A',value:null}]}
 ]){
  const result=projectMlsDistribution(input);
  assert.equal(result.status,'UNAVAILABLE');
  assert.doesNotMatch(renderMlsVerifiedChart(result),/<svg\b/);
 }
 const model=projectMlsDistribution({source:'VERIFIED',total:10,complete:true,segments:[
  {label:'Pago',value:7},{label:'Pendente',value:3}
 ]});
 assert.equal(model.status,'READY');
 const html=renderMlsVerifiedChart(model,{palette:'finance'});
 assert.match(html,/<svg\b/);
 assert.match(html,/70,0%/);
 assert.match(html,/30,0%/);
 assert.match(html,/10 registros exclusivos verificados/);
});
test('valid fully single-state DTF queue renders 100%, incomplete queue remains honest',()=>{
 const good=projectMlsDtfStateChart({
  line_count:10,pending_lines:0,reserved_lines:0,produced_lines:10,blocked_lines:0
 });
 assert.equal(good.status,'READY');
 assert.match(renderMlsVerifiedChart(good),/100,0%/);
 const incomplete=projectMlsDtfStateChart({
  line_count:10,pending_lines:3,reserved_lines:1,produced_lines:2,blocked_lines:1
 });
 assert.equal(incomplete.status,'READY');
 assert.equal(incomplete.segments.at(-1).label,'Estado não classificado');
 assert.equal(incomplete.total,10);
 const inconsistent=projectMlsDtfStateChart({
  line_count:10,pending_lines:7,reserved_lines:6,produced_lines:0,blocked_lines:0
 });
 assert.equal(inconsistent.status,'UNAVAILABLE');
});
test('chart labels are escaped; no untrusted markup or remote resources',()=>{
 const result=projectMlsDistribution({total:2,complete:true,segments:[
  {label:'<script>alert(1)</script>',value:1},{label:'A & B',value:1}
 ]});
 const html=renderMlsVerifiedChart(result,{title:'<img src=x onerror=alert(1)>'});
 assert.doesNotMatch(html,/<(?:script|img|foreignObject)\b|xlink:href=/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/A &amp; B/);
});

test('vertical bars use only complete real input, no inferred hourly buckets',()=>{
 const missing=projectMlsCategoricalChart({complete:false,segments:[{label:'08h',value:3}]});
 assert.equal(missing.status,'UNAVAILABLE');
 assert.doesNotMatch(renderMlsVerifiedChart(missing),/<svg\b/);
 const bars=projectMlsCategoricalChart({source:'VERIFIED_HOURLY_DTF',complete:true,unit:'COUNT',
  segments:[{label:'08h',value:0},{label:'09h',value:4},{label:'10h',value:1}]});
 assert.equal(bars.status,'READY');
 const svg=renderMlsVerifiedChart(bars,{palette:'production'});
 assert.match(svg,/<svg\b/);
 assert.match(svg,/09h: 4/);
 assert.match(svg,/>08h</);
 assert.doesNotMatch(svg,/<script\b|<foreignObject\b|xlink:href=/);
});
test('horizontal category bars preserve zero and reject duplicates or unsafe amounts',()=>{
 const horizontal=projectMlsCategoricalChart({complete:true,orientation:'horizontal',
  segments:[{label:'Logística',value:6},{label:'Defeito',value:0}]});
 assert.equal(horizontal.status,'READY');
 assert.match(renderMlsVerifiedChart(horizontal,{palette:'returns'}),/Logística: 6/);
 const dup=projectMlsCategoricalChart({complete:true,segments:[
  {label:'X',value:1},{label:'X',value:2}
 ]});
 assert.equal(dup.status,'UNAVAILABLE');
 const unsafe=projectMlsCategoricalChart({complete:true,segments:[
  {label:'X',value:Number.MAX_SAFE_INTEGER+2}
 ]});
 assert.equal(unsafe.status,'UNAVAILABLE');
});

test('SVG labels, grids and tracks inherit theme tokens while semantic series retain their colors',()=>{
 const models=[
  projectMlsDailyChart(daily([{date:'2026-10-27',net_cents:-200},{date:'2026-10-28',net_cents:100}])),
  projectMlsCategoricalChart({complete:true,segments:[{label:'A',value:2}]}),
  projectMlsCategoricalChart({complete:true,orientation:'horizontal',segments:[{label:'A',value:2}]}),
  projectMlsDistribution({complete:true,total:2,segments:[{label:'A',value:2}]})
 ];
 for(const model of models){
  const svg=renderMlsVerifiedChart(model);
  const texts=[...svg.matchAll(/<text\b[^>]*>/g)].map(match=>match[0]);
  assert.ok(texts.length>0);
  for(const text of texts)assert.match(text,/fill="var\(--(?:text|muted),#[0-9a-f]{6}\)"/);
  for(const line of svg.matchAll(/<line\b[^>]*>/g))assert.match(line[0],/stroke="var\(--line,#[0-9a-f]{6}\)"/);
 }
 const horizontal=renderMlsVerifiedChart(models[2]);
 assert.match(horizontal,/fill="var\(--surface-raised,#16314c\)"/);
 const mixed=renderMlsVerifiedChart(models[0]);
 assert.match(mixed,/stroke="#ff7899"/,'negative values retain their loss color');
 assert.match(mixed,/stroke="#35e6ae"/,'positive values retain their series color');
});

test('daily inspection exposes only real observations with exact BRL values, basis and an honest scale',()=>{
 const model=projectMlsDailyChart(daily([
  {date:'2026-10-24',net_cents:-125099,net_basis:'ESTIMATE'},
  {date:'2026-10-25',net_cents:null},
  {date:'2026-10-26',net_cents:0,partial:true,net_basis:'KNOWN_COSTS'},
  {date:'2026-10-27',net_cents:125099,net_basis:'ESTIMATE'}
 ]));
 assert.equal(model.points[2].basis,'KNOWN_COSTS');
 const svg=renderMlsVerifiedChart(model);
 assert.equal((svg.match(/data-mls-chart-mark=/g)||[]).length,3,'a missing day has no interactive observation');
 assert.match(svg,/data-mls-chart-value="-R\$ 1\.250,99"/);
 assert.match(svg,/data-mls-chart-value="R\$ 0,00"/);
 assert.match(svg,/data-mls-chart-label="26\/10\/2026"/);
 assert.match(svg,/data-mls-chart-basis="KNOWN_COSTS"/);
 assert.match(svg,/Subtotal com custos conhecidos · Dia parcial/);
 assert.equal((svg.match(/class="mls-chart-axis"/g)||[]).length,5);
 assert.match(svg,/class="mls-chart-zero"/);
 assert.match(svg,/class="mls-chart-halo"/);
 assert.doesNotMatch(svg,/\bid=|url\(#/,'multiple inline charts cannot collide through SVG IDs');
 assert.equal((svg.match(/<circle\b/g)||[]).length,3,'halos never add artificial points');
});

test('categorical and donut inspection keeps zero categories reachable without inventing a visible magnitude',()=>{
 for(const orientation of ['vertical','horizontal']){
  const svg=renderMlsVerifiedChart(projectMlsCategoricalChart({complete:true,orientation,unit:'BRL_CENTS',
   segments:[{label:'Zero <observado>',value:0},{label:'Custo',value:125099}]}));
  assert.equal((svg.match(/data-mls-chart-mark=/g)||[]).length,2);
  assert.equal((svg.match(/tabindex="0"/g)||[]).length,2);
  assert.match(svg,/data-mls-chart-value="R\$ 0,00"/);
  assert.match(svg,/data-mls-chart-label="Zero &lt;observado&gt;"/);
  assert.match(svg,/data-mls-chart-value="R\$ 1\.250,99"/);
 }
 const svg=renderMlsVerifiedChart(projectMlsDistribution({complete:true,total:5,
  segments:[{label:'Com linhas',value:5},{label:'Sem linhas',value:0}]}));
 assert.equal((svg.match(/data-mls-chart-mark=/g)||[]).length,2);
 assert.equal((svg.match(/tabindex="0"/g)||[]).length,2);
 assert.equal((svg.match(/<circle\b/g)||[]).length,1,'zero has a legend target and no invented arc');
 assert.match(svg,/data-mls-chart-context="0,0% do total observado"/);
});

test('locale formatting remains exact at safe-integer bounds',()=>{
 const svg=renderMlsVerifiedChart(projectMlsDailyChart(daily([
  {date:'2026-10-27',net_cents:-Number.MAX_SAFE_INTEGER},
  {date:'2026-10-28',net_cents:Number.MAX_SAFE_INTEGER}
 ])));
 assert.match(svg,/data-mls-chart-value="-R\$ 90\.071\.992\.547\.409,91"/);
 assert.match(svg,/data-mls-chart-value="R\$ 90\.071\.992\.547\.409,91"/);
 assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
});
