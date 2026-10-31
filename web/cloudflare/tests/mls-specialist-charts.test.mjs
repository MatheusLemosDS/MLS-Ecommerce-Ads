import test from 'node:test';
import assert from 'node:assert/strict';
import {projectMlsSpecialistChart,missionSpecialistPanelsBody,missionWorkspacesBody,MISSION_TRENDS_CLIENT} from '../src/mission-control.mjs';
import {renderMlsVerifiedChart} from '../src/mls-verified-charts.mjs';

const queue=()=>({schema:'mls_agent_dtf_queue_v1',basis:'SAVED_DTF_LINES_NOT_PAID_ORDERS_OR_UNIT_COUNTS',
 line_count:10,pending_lines:4,reserved_lines:2,produced_lines:3,blocked_lines:1,batch_count:2});
const keys=['finance-payouts','finance-reconciliation','ads-distribution','products-margin','products-ranking',
 'returns-reasons','returns-status','production-hourly','production-states'];

test('specialist graph slots explain absent sources and link to existing tools, without invented data',()=>{
 const html=missionWorkspacesBody();
 assert.equal((html.match(/data-mission-specialist-chart=/g)||[]).length,9);
 for(const key of keys){
  const model=projectMlsSpecialistChart(key);
  assert.equal(model.status,'UNAVAILABLE');assert.ok(model.reason.length>45);
  assert.match(model.href,/^\/(?:admin\?tab=|dashboard)/);
  assert.ok(html.includes('id="missionChart-'+key+'"'));
  assert.ok(html.includes(model.reason));assert.ok(html.includes('href="'+model.href+'"'));
  assert.doesNotMatch(renderMlsVerifiedChart(model),/<svg\b/);
 }
 assert.equal(projectMlsSpecialistChart('__proto__'),null);
 assert.equal(missionSpecialistPanelsBody('auditor'),'');
 assert.equal(missionSpecialistPanelsBody('hermes'),'');
 assert.doesNotMatch(MISSION_TRENDS_CLIENT,/\bfetch\s*\(|\bsetInterval\s*\(/);
});

test('complete saved DTF lines are the only supported distribution source',()=>{
 const model=projectMlsSpecialistChart('production-states',queue());
 assert.equal(model.status,'READY');assert.equal(model.total,10);
 assert.equal(model.source,'SAVED_DTF_LINES_NOT_PAID_ORDERS_OR_UNIT_COUNTS');
 assert.deepEqual(model.segments.map(s=>s.value),[4,2,3,1]);
 assert.equal(model.verified_at,null);assert.equal(model.period,null);
 const svg=renderMlsVerifiedChart(model);
 assert.match(svg,/<svg\b/);assert.match(svg,/40,0%/);
 assert.equal(model.title,'Linhas da fila por estado');
 for(const key of keys.filter(key=>key!=='production-states')){
  assert.equal(projectMlsSpecialistChart(key,queue()).status,'UNAVAILABLE','DTF counts do not authorize '+key);
 }
});

test('missing, unsafe, mismatched and empty DTF counts never become a donut',()=>{
 for(const change of [
  q=>{delete q.schema;},q=>{delete q.basis;},q=>{q.basis='PAID_ORDERS';},
  q=>{q.pending_lines=null;},q=>{q.pending_lines=-0;},q=>{q.pending_lines=-1;},
  q=>{q.line_count=undefined;},q=>{q.line_count=11;},q=>{q.line_count=9;},
  q=>{q.pending_lines=Number.MAX_SAFE_INTEGER;q.reserved_lines=1;},
  q=>{q.pending_lines=NaN;}
 ]){
  const input=queue();change(input);
  const model=projectMlsSpecialistChart('production-states',input);
  assert.equal(model.status,'UNAVAILABLE');assert.doesNotMatch(renderMlsVerifiedChart(model),/<svg\b/);
 }
 const empty=queue();for(const field of ['line_count','pending_lines','reserved_lines','produced_lines','blocked_lines'])empty[field]=0;
 assert.match(projectMlsSpecialistChart('production-states',empty).reason,/vazia/);
});

test('overlapping financial/return counters are never interpreted as an exclusive partition',()=>{
 const fake={...queue(),returns:4,status_reviews:2,verified:12,unverified:5,evidence_conflicts:3};
 for(const key of ['finance-reconciliation','returns-status','returns-reasons','products-margin']){
  const result=projectMlsSpecialistChart(key,fake);
  assert.equal(result.status,'UNAVAILABLE');assert.equal(result.total,undefined);assert.equal(result.segments,undefined);
 }
});
