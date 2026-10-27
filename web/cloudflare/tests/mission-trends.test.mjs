import test from 'node:test';
import assert from 'node:assert/strict';
import {projectMissionDailyTrend,BUSINESS_DAY_CLIENT} from '../src/business-day-view.mjs';
import {buildMissionTrendComparison,missionTrendPanelBody,MISSION_TRENDS_CLIENT,MISSION_TRENDS_CSS} from '../src/mission-control.mjs';
import {commandCenterBody,AGENT_REGISTRY_CLIENT} from '../src/agent-registry-view.mjs';
import {missionWorkspacesBody} from '../src/mission-control.mjs';
import {adminBody} from '../src/admin-view.mjs';

function row(day,{state='OPERATIONAL',partial=false,net=8000,sales=17000,ads=2500,paid=8,pending=[]}={}){
 return {date:'2026-10-'+String(day).padStart(2,'0'),state,day_partial:partial,estimate_cents:state==='OPERATIONAL'?net:null,
  known_estimate_cents:state==='PARTIAL_COSTS'?net:null,sales_cents:sales,ads_spend_cents:ads,coverage:{paid},pending};
}
const summary=(rows)=>({schema:'business_daily_summary_v1',month:'2026-10',days:rows});
const snapshot=(rows,selected)=>projectMissionDailyTrend(summary(rows),selected);

test('only validated cached daily summaries are exposed and old/future months cannot silently mix',()=>{
 assert.equal(projectMissionDailyTrend(null,'2026-10-27'),null);
 assert.equal(projectMissionDailyTrend({schema:'wrong',month:'2026-10',days:[row(1)]},'2026-10-01'),null);
 assert.equal(projectMissionDailyTrend(summary([row(1)]),'2026-09-30'),null);
 assert.equal(projectMissionDailyTrend(summary([row(1)]),'2026-11-01'),null);
 const t=snapshot(Array.from({length:27},(_,i)=>row(i+1,{net:(i+1)*1000})), '2026-10-27');
 assert.equal(t.schema,'mls_mission_daily_trend_v1');
 assert.equal(t.points.length,14,'14-point window cannot manufacture any older rows');
 assert.equal(t.points[0].date,'2026-10-14');assert.equal(t.points.at(-1).date,'2026-10-27');
 assert.equal(t.points[0].net_cents,14000);assert.equal(t.points.at(-1).net_cents,27000);
 assert.equal(t.basis,'PAID_CREATE_DAY_AND_CALENDAR_ADS_OPERATIONAL_ESTIMATE');
 assert.equal(Object.isFrozen(t),true);assert.equal(Object.isFrozen(t.points),true);assert.equal(Object.isFrozen(t.points[0]),true);
 assert.ok(!JSON.stringify(t).includes('order_sn'));
});

test('cached projection preserves unknown vs zero and marks partial daily profits as incomplete',()=>{
 const t=snapshot([row(1,{net:0,paid:0}),row(2,{state:'UNAVAILABLE',net:null,sales:0,ads:0}),
  row(3,{state:'PARTIAL_COSTS',net:11500,partial:false,sales:20000}),
  row(4,{state:'OPERATIONAL',net:-12500,partial:true,pending:['FINANCIAL_SOURCE_STALE']})],'2026-10-04');
 assert.equal(t.points[0].net_cents,0);assert.equal(t.points[0].paid_orders,0);
 assert.equal(t.points[1].net_cents,null);assert.equal(t.points[1].sales_cents,null);assert.equal(t.points[1].paid_orders,null);
 assert.equal(t.points[2].net_cents,11500);assert.equal(t.points[2].net_basis,'KNOWN_COSTS');assert.equal(t.points[2].comparable,false);
 assert.equal(t.points[3].net_cents,-12500);assert.equal(t.points[3].partial,true);assert.equal(t.points[3].comparable,false);
 assert.equal(buildMissionTrendComparison(t,'net'),null);
});

test('consecutive completed days show signed changes and percentages; a partial today never compares to a full prior day',()=>{
 const t=snapshot([row(23,{net:10000,sales:25000,ads:8000,paid:10}),
  row(24,{net:12000,sales:27000,ads:8500,paid:11}),
  row(25,{net:9000,sales:23000,ads:6500,paid:9}),
  row(26,{net:-1500,sales:20000,ads:9200,paid:8}),
  row(27,{net:40000,sales:42000,ads:10000,paid:20,partial:true})],'2026-10-27');
 const net=buildMissionTrendComparison(t,'net');
 assert.equal(net.current_date,'2026-10-26');assert.equal(net.previous_date,'2026-10-25');
 assert.equal(net.delta,-10500);assert.equal(net.percent_bps,-11666);assert.equal(net.direction,'DOWN');
 const ads=buildMissionTrendComparison(t,'ads');
 assert.equal(ads.delta,2700);assert.equal(ads.direction,'UP');assert.equal(ads.current_date,'2026-10-26');
 const paid=buildMissionTrendComparison(t,'paid');
 assert.equal(paid.delta,-1);assert.equal(paid.percent_bps,-1111);
 assert.equal(buildMissionTrendComparison(t,'margin').direction,'DOWN');
 assert.equal(buildMissionTrendComparison(t,'inventory'),null);
});

test('comparison never skips over missing days or returns fictitious percentages on zero baseline',()=>{
 const t=snapshot([row(2,{net:0}),row(3,{net:12500}),row(4,{state:'UNAVAILABLE'}),
  row(5,{net:20000}),row(6,{net:18000,partial:true})],'2026-10-06');
 const a=buildMissionTrendComparison(t,'net');
 assert.equal(a.previous_date,'2026-10-02');assert.equal(a.current_date,'2026-10-03');
 assert.equal(a.delta,12500);assert.equal(a.percent_bps,null);
 const absent=snapshot([row(2,{net:0}),row(3,{state:'UNAVAILABLE'}),row(4,{net:2000})],'2026-10-04');
 assert.equal(buildMissionTrendComparison(absent,'net'),null);
 const stale=snapshot([row(2),row(3,{pending:['PAYMENT_INCOMPLETE']})],'2026-10-03');
 assert.equal(buildMissionTrendComparison(stale,'net'),null);
 const negative=snapshot([row(2,{net:-15000}),row(3,{net:-5000})],'2026-10-03');
 assert.equal(buildMissionTrendComparison(negative,'net').delta,10000);
 assert.equal(buildMissionTrendComparison(negative,'net').direction,'UP','less negative is an improvement');
});

test('the three chart panels reuse identical cached evidence and preserve all current financial forms',()=>{
 const overview=commandCenterBody(),hub=missionWorkspacesBody();
 const html=adminBody();
 assert.match(overview,/id="missionTrendsOverview"/);
 assert.match(overview,/id="missionTrendGraphOverview"/);
 assert.match(hub,/id="missionTrendsFinance"/);
 assert.match(hub,/id="missionTrendsAds"/);
 assert.ok(html.indexOf('id="missionTrendsOverview"')<html.indexOf('id="agent-finance"'));
 assert.equal([...html.matchAll(/id="missionTrendGraph(?:Overview|Finance|Ads)"/g)].length,3);
 for(const id of ['businessDay','businessMonth','businessDayDate','businessMonthExpensesForm','businessReconciliationDetails','businessEscrowReleasesDetails']){
  assert.equal([...html.matchAll(new RegExp('id="'+id+'"','g'))].length,1,id+' must not be cloned');
 }
 for(const id of ['Net','Sales','Ads','Paid','Margin'])assert.match(overview,new RegExp('id="missionKpiDelta'+id+'"'));
 assert.match(overview,/id="missionProfitState"/);
 assert.match(AGENT_REGISTRY_CLIENT,/mlsMissionTrends\?\.refresh/);
 assert.match(BUSINESS_DAY_CLIENT,/getTrend/);
 for(const panel of ['overview','finance','ads'])for(const series of ['net','sales','ads'])
  assert.ok(missionTrendPanelBody(panel).includes('data-mission-chart="'+panel+'" data-mission-series="'+series+'"'));
 assert.equal(missionTrendPanelBody('unsafe'), '');
 assert.doesNotMatch(MISSION_TRENDS_CLIENT,/\bfetch\s*\(|setInterval\s*\(|postMessage\s*\(|\/api\//);
 assert.doesNotMatch(MISSION_TRENDS_CLIENT,/innerHTML\s*=/);
 assert.match(MISSION_TRENDS_CLIENT,/createElementNS/);
 assert.match(MISSION_TRENDS_CSS,/mission-kpi-delta/);
 assert.match(MISSION_TRENDS_CSS,/result-tone=loss/);
});
