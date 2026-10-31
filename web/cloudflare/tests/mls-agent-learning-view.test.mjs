import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {projectMlsAgentLearningView,mlsAgentLearningBody,MLS_AGENT_LEARNING_CLIENT,MLS_AGENT_LEARNING_CSS} from '../src/mls-agent-learning-view.mjs';
import {createMlsAgentLearningReport} from '../src/mls-agent-learning-report.mjs';

const now=1793448000;
const empty=(month='2026-10')=>createMlsAgentLearningReport().projectReport({month,checked_at:now,observations:[]});
function observed(){
 const r=empty();r.status='EVIDENCE_AVAILABLE';r.evidence={cutoffs_observed:2,closed_months_observed:1,latest_observed_at:now-20,latest_end_date:'2026-10-30',revisions_observed:3,independent_financial_comparisons:0};
 r.latest={schema:'mls_agent_learning_observation_v1',month:'2026-10',end_date:'2026-10-30',checked_at:now-30};
 r.lessons=[{code:'RETURNS_REQUIRE_RECONCILIATION',agent:'returns',title:'Conferir devoluções',detail:'A solicitação não comprova recebimento bancário.',confidence:'REPEATED',evidence_count:2,first_observed_at:now-200,last_observed_at:now-20}];return r;
}
class Node{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.listeners={};this.hidden=false;this.disabled=false;this.open=false;this.textContent='';}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 addEventListener(event,fn){(this.listeners[event]??=[]).push(fn);}
 emit(event){for(const fn of this.listeners[event]??[])fn({target:this});}
}
function fixture(api){
 const ids=['mlsAgentLearning','mlsLearningStatus','mlsLearningMetrics','mlsLearningLessons','mlsLearningReload','mlsLearningLogin','businessMonthSelect'];
 const nodes=new Map(ids.map(id=>[id,new Node()]));nodes.get('businessMonthSelect').value='2026-10';
 let context={month:'2026-10',checked_at:now-10};
 const sandbox={Object,Array,Number,String,Date,Intl,Set,encodeURIComponent,document:{getElementById:id=>nodes.get(id)??null,createElement:tag=>new Node(tag)},brazaMonthDashboard:{getSnapshot:()=>context}};
 vm.runInNewContext(MLS_AGENT_LEARNING_CLIENT,sandbox);
 sandbox.mlsAgentLearning.start({api});
 return {nodes,view:sandbox.mlsAgentLearning,setContext:v=>{context=v;},open(){nodes.get('mlsAgentLearning').open=true;nodes.get('mlsAgentLearning').emit('toggle');},close(){nodes.get('mlsAgentLearning').open=false;nodes.get('mlsAgentLearning').emit('toggle');}};
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const allText=node=>[node.textContent,...node.children.map(allText)].join(' ');

test('learning view accepts the real empty report and retains no financial payload',()=>{
 const value=projectMlsAgentLearningView(empty(),'2026-10');assert.equal(value.status,'EMPTY');assert.equal(value.evidence.cutoffs_observed,0);assert.equal(value.latest,null);assert.equal(Object.isFrozen(value),true);
 const report=observed();report.latest.private_order='PRIVATE';const projected=projectMlsAgentLearningView(report,'2026-10');assert.equal(projected.lessons[0].confidence,'REPEATED');assert.doesNotMatch(JSON.stringify(projected),/PRIVATE|private_order/);
});
test('learning view rejects altered permissions, wrong periods and unsupported confidence claims',()=>{
 for(const change of [r=>r.autonomy.commercial_write_allowed=true,r=>r.autonomy.model_training=true,r=>r.month='2026-09',r=>r.evidence.independent_financial_comparisons=4,r=>r.lessons[0].confidence='PROVEN',r=>r.lessons[0].agent='ads',r=>r.evidence.latest_end_date='2026-02-30',r=>r.lessons[0].evidence_count=3]){
  const r=observed();change(r);assert.equal(projectMlsAgentLearningView(r,'2026-10'),null);
 }
 const report=empty();report.latest={};assert.equal(projectMlsAgentLearningView(report,'2026-10'),null);
});
test('corrections and changed conditions remain descriptive observations with a fixed saved-rule policy',()=>{
 const report=observed(),base=report.lessons[0];
 for(const code of ['ARITHMETIC_REVIEW_REQUIRED','REFERENCE_CORRECTION_RECORDED','CONDITION_NOT_IN_LATEST_CUTOFF'])report.lessons.push({...base,code,agent:'auditor',confidence:'OBSERVED',evidence_count:1});
 assert.equal(projectMlsAgentLearningView(report,'2026-10').lessons.length,4);
 assert.deepEqual(report.autonomy.automatic,['COLLECT_SAVED_EVIDENCE','CHECK_DATA_QUALITY','CLASSIFY_USING_SAVED_RULES','PREPARE_REPORTS']);
 report.evidence.independent_financial_comparisons=1;report.evidence.closed_months_observed=3;assert.equal(projectMlsAgentLearningView(report,'2026-10'),null,'closed periods alone cannot establish independently evaluated action outcomes');
 report.evidence.independent_financial_comparisons=0;report.autonomy.automatic.push('CHANGE_CAMPAIGN_BUDGET');assert.equal(projectMlsAgentLearningView(report,'2026-10'),null);
});
test('learning panel states descriptive limits and provides accessible explicit controls',()=>{
 const body=mlsAgentLearningBody();assert.match(body,/<details/);assert.doesNotMatch(body,/<details[^>]+\bopen/);assert.match(body,/aria-live="polite"/);assert.match(body,/não treina o modelo/);assert.match(body,/Recortes acumulados/);assert.match(body,/ações novas/);assert.match(MLS_AGENT_LEARNING_CSS,/prefers-reduced-motion/);assert.doesNotMatch(MLS_AGENT_LEARNING_CLIENT,/innerHTML|setInterval|\bfetch\s*\(/);
});
test('learning API is read only and requested on explicit open; repeated cumulative records do not become independent wins',async()=>{
 const calls=[],f=fixture(async(...args)=>{calls.push(args);return observed();});
 assert.equal(calls.length,0);f.open();await flush();assert.deepEqual(calls,[['agents/learning?month=2026-10']]);assert.equal(f.view.getSnapshot().evidence.independent_financial_comparisons,0);
 assert.match(allText(f.nodes.get('mlsLearningMetrics')),/Recortes acumulados/);assert.match(allText(f.nodes.get('mlsLearningLessons')),/Padrão repetido em recortes/);assert.match(f.nodes.get('mlsLearningStatus').textContent,/30\/10/);
 f.close();assert.equal(calls.length,1);f.open();await flush();assert.equal(calls.length,2);f.view.stop();assert.equal(f.view.getSnapshot(),null);
});
test('changing month or publication during an outstanding read prevents stale memory from painting',async()=>{
 const pending=[],f=fixture(()=>new Promise(resolve=>pending.push(resolve)));f.open();await flush();assert.equal(pending.length,1);
 f.setContext({month:'2026-09',checked_at:now-20});f.view.refreshContext();pending[0](observed());await flush();assert.equal(f.view.getSnapshot(),null);assert.equal(f.nodes.get('mlsLearningMetrics').children.length,0);
 f.nodes.get('mlsLearningReload').emit('click');await flush();assert.equal(pending.length,2);pending[1](empty('2026-09'));await flush();assert.equal(f.view.getSnapshot().month,'2026-09');
 f.nodes.get('mlsLearningReload').emit('click');await flush();f.setContext({month:'2026-09',checked_at:now});f.view.refreshContext();pending[2](empty('2026-09'));await flush();assert.equal(f.view.getSnapshot(),null);assert.equal(f.nodes.get('mlsLearningStatus').dataset.state,'stale');
});
test('closed panels ignore late responses; denied owner sessions show reauthentication instead of retry polling',async()=>{
 let resolve;const f=fixture(()=>new Promise(r=>{resolve=r;}));f.open();f.close();resolve(observed());await flush();assert.equal(f.view.getSnapshot(),null);
 let calls=0;const denied=fixture(async()=>{calls++;throw Object.assign(Error('session'),{status:401});});denied.open();await flush();assert.equal(calls,1);assert.equal(denied.nodes.get('mlsLearningLogin').hidden,false);assert.equal(denied.nodes.get('mlsLearningStatus').dataset.state,'error');assert.match(denied.nodes.get('mlsLearningStatus').textContent,/sessão/);
});
test('lesson content uses literal text nodes and cannot become executable HTML',async()=>{
 const r=observed();r.lessons[0].title='<img src=x onerror=alert(1)>';r.lessons[0].detail='<script>steal()</script>';
 const f=fixture(async()=>r);f.open();await flush();const list=f.nodes.get('mlsLearningLessons');assert.match(allText(list),/<img src=x/);assert.equal(list.children[0].children[0].tagName,'h4');assert.equal(list.children[0].children[2].tagName,'p');
});
