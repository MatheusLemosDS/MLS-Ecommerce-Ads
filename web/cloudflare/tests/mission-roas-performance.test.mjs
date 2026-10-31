import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {projectMissionAdsSnapshot,projectMissionRoasChart,compareMissionRoas} from '../src/mls-ads-performance.mjs';
import {createMlsVerifiedCharts} from '../src/mls-verified-charts.mjs';
import {buildMissionTrendComparison,missionTrendPanelBody,missionWorkspacesBody} from '../src/mission-control.mjs';
import {commandCenterBody} from '../src/agent-registry-view.mjs';

const ratio=(gmv,expense)=>{if(gmv===null||expense===null||expense===0)return null;const n=BigInt(gmv)*1000000n,d=BigInt(expense),value=n/d+(n%d*2n>=d?1n:0n);return String(value/1000000n)+'.'+String(value%1000000n).padStart(6,'0');};
function frame({spend=[100,200,100],gmv=[200,1000,20000],partial=true}={}){
 const month='2026-10',end_date=month+'-'+String(spend.length).padStart(2,'0'),checked_at=Date.parse((partial?end_date:'2026-10-31')+'T13:00:00Z')/1000;
 const expense=spend.includes(null)?null:spend.reduce((n,x)=>n+x,0),sales=gmv.includes(null)?null:gmv.reduce((n,x)=>n+x,0);
 return {schema:'business_month_v1',month,start_date:month+'-01',end_date,checked_at,sales_cents:900000,ads:{schema:'ads_calendar_v1',status:spend.includes(null)?'PARTIAL':'AVAILABLE',start_date:month+'-01',end_date,fetched_at:checked_at,covered_days:spend.filter(x=>x!==null).length,total_days:spend.length,day_partial:partial,unit_confirmation:'OPERATOR_CONFIRMED_BRL_2026_10_20',source_timezone:'UNCONFIRMED',basis:'CALENDAR_PERIOD_NOT_ORDER_ATTRIBUTION',expense_cents:expense,totals:{broad:{gmv_cents:sales,calculated_roas_raw:ratio(sales,expense)}},days:spend.map((expense,index)=>({date:month+'-'+String(index+1).padStart(2,'0'),expense_cents:expense,broad:{gmv_cents:gmv[index],calculated_roas_raw:ratio(gmv[index],expense)},order_sn:'PRIVATE_MUST_NOT_LEAK'}))}};
}

test('ROAS uses broad attributed Ads sales and the weighted period total, never store sales or daily average',()=>{
 const snapshot=projectMissionAdsSnapshot(frame());
 assert.equal(snapshot.attributed_sales_cents,21200);
 assert.equal(snapshot.expense_cents,400);
 assert.equal(snapshot.calculated_roas_raw,'53.000000');
 assert.notEqual(snapshot.calculated_roas_raw,ratio(900000,400));
 assert.notEqual(snapshot.calculated_roas_raw,'69.000000','not mean(2x,5x,200x)');
 assert.equal(snapshot.attribution,'BROAD');assert.equal(snapshot.source_timezone,'UNCONFIRMED');
 assert.ok(!JSON.stringify(snapshot).includes('PRIVATE_MUST_NOT_LEAK'));
 assert.ok(Object.isFrozen(snapshot)&&Object.isFrozen(snapshot.days)&&Object.isFrozen(snapshot.days[0]));
});

test('ROAS daily curve preserves current partial day but excludes it from arrows',()=>{
 const snapshot=projectMissionAdsSnapshot(frame()),model=projectMissionRoasChart(snapshot);
 assert.equal(model.unit,'RATIO_MICROS');assert.equal(model.status,'PARTIAL');
 assert.deepEqual(model.points.map(p=>p.value),[2000000,5000000,200000000]);
 assert.deepEqual(model.points.map(p=>p.partial),[false,false,true]);
 assert.deepEqual(compareMissionRoas(snapshot),{current_date:'2026-10-02',previous_date:'2026-10-01',current_micros:5000000,previous_micros:2000000,delta_micros:3000000,direction:'UP',basis:'TWO_COMPLETE_ADS_CALENDAR_DAYS_BROAD_ATTRIBUTION_NOT_PROFIT'});
});

test('zero spend and missing attributed sales remain real gaps, while zero attributed sales with spend yields 0x',()=>{
 const snapshot=projectMissionAdsSnapshot(frame({spend:[100,0,100,100,100],gmv:[200,200,0,null,1000]})),model=projectMissionRoasChart(snapshot);
 assert.deepEqual(model.points.map(p=>p.value),[2000000,null,0,null,10000000]);
 assert.equal(model.missing,2);assert.equal(snapshot.calculated_roas_raw,null);
 assert.equal(compareMissionRoas(snapshot),null,'never skip a missing/zero-spend day to infer a comparative pair');
 const html=createMlsVerifiedCharts().renderMlsVerifiedChart(model,{palette:'roas'});
 assert.match(html,/0,00x/);assert.doesNotMatch(html,/Infinity|NaN|R\$/);
 assert.doesNotMatch(html,/data-mls-chart-date="2026-10-02"/);
});

test('partial source coverage does not replace missing spend with zero or claim a monthly ROAS total',()=>{
 const snapshot=projectMissionAdsSnapshot(frame({spend:[100,null,100],gmv:[200,null,400]}));
 assert.equal(snapshot.status,'PARTIAL');assert.equal(snapshot.expense_cents,null);assert.equal(snapshot.calculated_roas_raw,null);
 assert.deepEqual(projectMissionRoasChart(snapshot).points.map(p=>p.value),[2000000,null,4000000]);
 assert.equal(projectMissionRoasChart(snapshot).status,'PARTIAL');
});

test('a first-day value or no-spend report can be valid evidence without manufacturing a two-point curve',()=>{
 const one=projectMissionAdsSnapshot(frame({spend:[100],gmv:[200]}));
 assert.equal(one.calculated_roas_raw,'2.000000');
 assert.equal(projectMissionRoasChart(one).status,'UNAVAILABLE');assert.equal(projectMissionRoasChart(one).evidence_valid,true);
 const none=projectMissionAdsSnapshot(frame({spend:[0,0],gmv:[0,0]}));
 assert.equal(none.calculated_roas_raw,null);assert.equal(projectMissionRoasChart(none).evidence_valid,true);assert.equal(compareMissionRoas(none),null);
});

test('scope, timestamps, corrupted monthly ratios, coverage and duplicate dates fail closed',()=>{
 for(const mutate of [
  f=>{f.ads.start_date='2026-09-01';},f=>{f.ads.fetched_at=f.checked_at+6;},
  f=>{f.ads.total_days=4;},f=>{f.ads.covered_days=2;},f=>{f.ads.days[1].date='2026-10-01';},
  f=>{f.ads.totals.broad.calculated_roas_raw='99.000000';},f=>{f.ads.day_partial=false;},
  f=>{f.ads.days[0].broad.calculated_roas_raw='2.000001';},f=>{f.ads.source_timezone='America/Sao_Paulo';},
 ]){const value=frame();mutate(value);assert.equal(projectMissionAdsSnapshot(value),null);}
 const source=structuredClone(projectMissionAdsSnapshot(frame()));source.calculated_roas_raw='1000.000000';
 assert.equal(projectMissionRoasChart(source).status,'UNAVAILABLE','normalized DTO totals are rechecked before any value/curve is shown');
});

test('safe-integer limits preserve exact arithmetic without plotting overflowing ratio micros',()=>{
 const source=frame({spend:[1,1,1],gmv:[Number.MAX_SAFE_INTEGER-2,1,1]});
 const snapshot=projectMissionAdsSnapshot(source);assert.ok(snapshot);
 const model=projectMissionRoasChart(snapshot);assert.equal(model.points[0].value,null);assert.equal(model.points[1].value,1000000);
 const tampered=structuredClone(snapshot);tampered.days[0].calculated_roas_raw='999999999999999999.000000';
 assert.equal(projectMissionRoasChart(tampered).status,'UNAVAILABLE');
});

test('source projectors retain their dependencies when embedded into normal and minified worker clients',()=>{
 const context=vm.createContext({input:frame()});
 vm.runInContext('globalThis.snapshot=('+projectMissionAdsSnapshot.toString()+')(input);globalThis.chart=('+projectMissionRoasChart.toString()+')(snapshot);globalThis.comparison=('+compareMissionRoas.toString()+')(snapshot);',context);
 assert.equal(context.snapshot.calculated_roas_raw,'53.000000');assert.equal(context.chart.unit,'RATIO_MICROS');assert.equal(context.comparison.direction,'UP');
});

test('ratio rendering uses x labels and source-specific inspection without claiming profitability',()=>{
 const model=projectMissionRoasChart(projectMissionAdsSnapshot(frame()));
 const html=createMlsVerifiedCharts().renderMlsVerifiedChart(model,{palette:'roas',title:'ROAS diário'});
 assert.match(html,/data-mls-chart-value="5,00x"/);assert.match(html,/calendário Ads · não é lucro/);
 assert.match(html,/#b780ff/);assert.doesNotMatch(html,/R\$/);
});

test('six-card cockpit keeps source-labelled monthly ROAS and priorities remain available',()=>{
 const html=commandCenterBody(),cockpit=html.slice(html.indexOf('<div class="command-center-metrics"'),html.indexOf('<details class="mls-kpi-context"'));
 assert.equal((cockpit.match(/<article /g)||[]).length,6);
 for(const id of ['commandCenterRoas','missionRoasScope','missionKpiDeltaRoas','missionSparkRoas'])assert.match(cockpit,new RegExp('id="'+id+'"'));
 assert.match(html,/id="commandCenterAlerts"/);assert.match(html,/id="missionRoasValueHelp"/);
 for(const panel of ['overview','finance','ads'])assert.match(missionTrendPanelBody(panel),/data-mission-series="roas"/);
 assert.equal((missionWorkspacesBody().match(/id="mlsAgentLearning"/g)||[]).length,1);
});

test('financial comparison refuses a forged comparable flag on a partial day or known-cost-only subtotal',()=>{
 const a={date:'2026-10-01',partial:false,comparable:true,net_cents:100,net_basis:'ESTIMATE'},b={...a,date:'2026-10-02',net_cents:200};
 const snapshot={schema:'mls_mission_daily_trend_v1',points:[a,b]};
 assert.equal(buildMissionTrendComparison(snapshot,'net').delta,100);
 b.partial=true;assert.equal(buildMissionTrendComparison(snapshot,'net'),null);
 b.partial=false;b.net_basis='KNOWN_COSTS';assert.equal(buildMissionTrendComparison(snapshot,'net'),null);
});
