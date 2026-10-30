import test from 'node:test';
import assert from 'node:assert/strict';
import {projectMlsMissionChart} from '../src/mls-chart-adapters.mjs';
import {renderMlsVerifiedChart,projectMlsDistribution,projectMlsDailyChart} from '../src/mls-verified-charts.mjs';

const row=(day,net=day*100)=>({date:'2026-10-'+String(day).padStart(2,'0'),state:'OPERATIONAL',partial:false,
 net_basis:'ESTIMATE',net_cents:net,sales_cents:day*200,ads_spend_cents:0,comparable:true,paid_orders:2});
const trend=points=>({schema:'mls_mission_daily_trend_v1',month:'2026-10',selected_date:'2026-10-28',
 basis:'PAID_CREATE_DAY_AND_CALENDAR_ADS_OPERATIONAL_ESTIMATE',points});

test('source adapter selects real calendar window, preserving gaps, zero and loss',()=>{
 const source=trend([row(15),row(21),row(22,0),row(24,-100),row(28,3200)]);
 const model=projectMlsMissionChart(source,'net',7);
 assert.equal(model.status,'PARTIAL');
 assert.deepEqual(model.period,{start_date:'2026-10-22',end_date:'2026-10-28',selected_date:'2026-10-28',window_days:7});
 assert.deepEqual(model.points.map(p=>p.value),[0,null,-100,null,null,null,3200]);
 assert.deepEqual(model.coverage,{observed:3,total:7,missing:4,partial:false});
 const svg=renderMlsVerifiedChart(model);
 assert.equal((svg.match(/<circle/g)||[]).length,3);
 assert.equal((svg.match(/stroke-width="2.8"/g)||[]).length,0,'disconnected points never create a path');
 assert.match(svg,/tabindex="0"/);
 assert.match(svg,/#ff7899/,'a real loss retains its warning color');
 assert.equal(source.points.length,5,'adapter does not mutate the source');
});

test('source adapter refuses cross-period, invalid, unordered and guessed states',()=>{
 for(const modify of [
  t=>{t.month='2026-09';},t=>{t.selected_date='2026-02-30';},t=>{t.basis='BANK_CASH';},
  t=>{t.points[0].date='2026-02-30';},t=>{t.points[0].date='2026-11-01';},
  t=>{t.points[0].partial='false';},t=>{t.points[0].net_cents=undefined;},
  t=>{t.points[0].net_cents=-0;},t=>{t.points[0].state='UNAVAILABLE';},
  t=>{t.points.reverse();},t=>{t.points.push({...t.points[1]});}
 ]){
  const input=trend([row(27),row(28)]);modify(input);
  assert.equal(projectMlsMissionChart(input).status,'UNAVAILABLE');
 }
 const negative=trend([row(27),row(28)]);negative.points[0].ads_spend_cents=-1;
 assert.equal(projectMlsMissionChart(negative,'ads').status,'UNAVAILABLE');
 assert.equal(projectMlsMissionChart(trend([row(27),row(28)]),'roas').status,'UNAVAILABLE');
 assert.equal(projectMlsMissionChart(trend([row(27),row(28)]),'net',30).status,'UNAVAILABLE');
});

test('partial dates and partial-cost subtotals remain separate from complete observations',()=>{
 const a=row(27);a.state='PARTIAL_COSTS';a.net_basis='KNOWN_COSTS';
 const b=row(28);b.partial=true;
 const model=projectMlsMissionChart(trend([a,b]),'net');
 assert.equal(model.status,'PARTIAL');assert.equal(model.coverage.partial,true);
 assert.match(renderMlsVerifiedChart(model),/subtotal com custos conhecidos/);
 assert.match(renderMlsVerifiedChart(model),/\(parcial\)/);
 const ready=projectMlsMissionChart(trend([row(27),row(28)]),'ads');
 assert.equal(ready.status,'READY');assert.equal(ready.points[0].value,0);
 assert.equal(ready.source,'mls_mission_daily_trend_v1');
 assert.equal(ready.verified_at,null,'a source with no timestamp never receives a fabricated one');
});

test('basis and net coverage cannot mislabel a known-cost subtotal as a complete forecast',()=>{
 for(const [state,basis] of [
  ['OPERATIONAL','KNOWN_COSTS'],['OPERATIONAL',null],['OPERATIONAL',undefined],
  ['PARTIAL_COSTS','ESTIMATE'],['PARTIAL_COSTS',null],['PARTIAL_COSTS',undefined],
  ['UNAVAILABLE','ESTIMATE'],['UNAVAILABLE','KNOWN_COSTS'],['UNAVAILABLE',undefined]
 ]){
  const a=row(27);a.state=state;a.net_basis=basis;if(state==='UNAVAILABLE')a.net_cents=null;
  assert.equal(projectMlsMissionChart(trend([a,row(28)]),'net').status,'UNAVAILABLE');
 }
 for(const net of [undefined,-0,NaN,Number.MAX_SAFE_INTEGER+1]){
  const a=row(27);a.net_cents=net;
  assert.equal(projectMlsMissionChart(trend([a,row(28)]),'sales').status,'UNAVAILABLE');
 }
 const unavailable=row(27);unavailable.state='UNAVAILABLE';unavailable.net_basis=null;
 assert.equal(projectMlsMissionChart(trend([unavailable,row(28)]),'ads').status,'UNAVAILABLE');
 const unknownNet=row(27);unknownNet.net_cents=null;
 const sales=projectMlsMissionChart(trend([unknownNet,row(28)]),'sales');
 assert.equal(sales.status,'READY','explicitly unavailable net does not erase genuine sales observations');
 const subtotal=row(27);subtotal.state='PARTIAL_COSTS';subtotal.net_basis='KNOWN_COSTS';
 assert.equal(projectMlsMissionChart(trend([subtotal,row(28)]),'net').status,'PARTIAL');
 assert.equal(projectMlsMissionChart(trend([subtotal,row(28)]),'ads').status,'READY','partial cost does not falsify a verified Ads amount');
});

test('renderer rejects impossible dates and duplicate donut labels, and never bridges omitted dates',()=>{
 assert.equal(projectMlsDailyChart({schema:'mls_mission_daily_trend_v1',points:[
  {date:'2026-02-30',net_cents:1},{date:'2026-03-03',net_cents:2}]}).status,'UNAVAILABLE');
 assert.equal(projectMlsDistribution({complete:true,total:2,segments:[{label:'A',value:1},{label:'A',value:1}]}).status,'UNAVAILABLE');
 const model=projectMlsDailyChart({schema:'mls_mission_daily_trend_v1',points:[
  {date:'2026-10-25',net_cents:1},{date:'2026-10-27',net_cents:2}]});
 assert.doesNotMatch(renderMlsVerifiedChart(model),/stroke-width="2.8"/);
});

test('net area retains red losses and splits a real mixed segment at zero',()=>{
 const negative=projectMlsMissionChart(trend([row(27,-200),row(28,-100)]));
 const loss=renderMlsVerifiedChart(negative);
 assert.match(loss,/stroke="#ff7899" stroke-width="2.8"/);
 assert.doesNotMatch(loss,/stroke="#35e6ae" stroke-width="2.8"/);
 const mixed=renderMlsVerifiedChart(projectMlsMissionChart(trend([row(27,-200),row(28,100)])));
 assert.match(mixed,/stroke="#ff7899" stroke-width="2.8"/);
 assert.match(mixed,/stroke="#35e6ae" stroke-width="2.8"/);
 assert.equal((mixed.match(/<circle/g)||[]).length,2,'visual crossing adds no synthetic point');
});
