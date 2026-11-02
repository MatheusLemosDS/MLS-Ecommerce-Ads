import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {AGENT_PERIOD_CSS,agentPeriodBody,createAgentPeriodController} from '../src/agent-period-view.mjs';
import {adminBody} from '../src/admin-view.mjs';
import {CLIENT} from '../src/admin-client.mjs';
import {completeWorkspaceFrame,workspaceView,workspaceBrowser} from './monthly-workspace-browser-fixture.mjs';

function fixture({month='2026-11',status='COMPLETE',blocked=false,url='https://app.example.test/admin?tab=agent-finance&month=2026-11#businessMonth',deferred=false,dailyReplace=false}={}){
 const names=['','Title','Selected','Form','Month','Previous','Apply','Next','Current','Scope','Status'],nodes=new Map(names.map(name=>[name,{value:'',hidden:false,disabled:false,textContent:'',dataset:{},attrs:{},setAttribute(name,value){this.attrs[name]=value;}}]));
 let location=new URL(url),snapshot={schema:'mls_month_snapshot_v1',month,status,period_loading:false,period_change_blocked:blocked},callback=null,waiting=[],unsubscribed=0;
 const reads=[],historyCalls=[],foreignDraft={value:'29,50'};
 const documentImpl={getElementById(id){if(id==='customUnrelatedCost')return foreignDraft;return nodes.get(id.replace(/^mlsAgentPeriod/,''))??null;}};
 const historyImpl={state:{tab:'agent-finance'},pushState(state,title,path){historyCalls.push({kind:'push',state,path});location=new URL(path,location);},replaceState(state,title,path){historyCalls.push({kind:'replace',state,path});location=new URL(path,location);}};
 const emit=()=>callback?.(snapshot);
 const dashboard={getSnapshot:()=>snapshot,subscribe(listener){callback=listener;listener(snapshot);return ()=>{unsubscribed++;callback=null;};},async selectMonth(selected){
  reads.push(selected);if(snapshot.period_change_blocked&&selected!==snapshot.month)return false;
  if(dailyReplace){const target=new URL(location.href);target.searchParams.set('month',selected);target.searchParams.set('date',selected+(selected==='2026-10'?'-31':'-02'));historyImpl.replaceState({tab:'agent-finance',date:target.searchParams.get('date')},'',target.pathname+target.search+target.hash);}
  snapshot={...snapshot,month:selected,status:null,period_loading:true};emit();
  if(deferred)return new Promise(resolve=>waiting.push(result=>{if(snapshot.month===selected){snapshot={...snapshot,status:result?'COMPLETE':null,period_loading:false};emit();}resolve(result);}));
  snapshot={...snapshot,status:'COMPLETE',period_loading:false};emit();return true;
 }};
 const controller=createAgentPeriodController({documentImpl,getDashboard:()=>dashboard,getLocation:()=>location,historyImpl,now:()=>new Date('2026-11-03T01:00:00Z')});
 return {controller,nodes,reads,historyCalls,foreignDraft,getLocation:()=>location,getSnapshot:()=>snapshot,setSnapshot(value){snapshot={...snapshot,...value};emit();},setLocation(url){location=new URL(url,location);},release(result=true){waiting.shift()?.(result);},getUnsubscribed:()=>unsubscribed};
}

test('the shared bar is unique, precedes all workspace panels and has accessible mobile controls',()=>{
 const html=adminBody(),body=agentPeriodBody();
 assert.equal([...html.matchAll(/id="mlsAgentPeriod"/g)].length,1);
 assert.ok(html.indexOf('id="mlsAgentPeriod"')<html.indexOf('<section id="overview">'));
 assert.ok(html.indexOf('id="mlsAgentPeriod"')<html.indexOf('id="agent-finance"'));
 assert.match(body,/id="mlsAgentPeriod"[^>]*hidden/);
 assert.match(body,/for="mlsAgentPeriodMonth"/);
 assert.match(body,/type="month" min="2000-01" required/);
 assert.match(body,/aria-describedby="mlsAgentPeriodScope mlsAgentPeriodStatus"/);
 assert.match(body,/role="status" aria-live="polite"/);
 assert.match(body,/aria-label="Ver mês anterior"/);
 assert.match(body,/aria-label="Ver mês seguinte"/);
 assert.match(AGENT_PERIOD_CSS,/\[hidden\]\{display:none!important\}/);
 assert.match(AGENT_PERIOD_CSS,/@media\(max-width:720px\)/);
 assert.match(AGENT_PERIOD_CSS,/minmax\(0,1fr\)/);
 assert.match(AGENT_PERIOD_CSS,/min-height:44px/);
 assert.match(CLIENT,/function createAgentPeriodController/);
});

test('one saved month follows every agent panel while current operational sources remain explicit',async()=>{
 const f=fixture();
 for(const tab of ['agents','agent-finance','agent-ads','agent-products','agent-production','agent-returns','agent-auditor','agent-hermes']){
  assert.equal(f.controller.setPanel(tab),true,tab);assert.equal(f.nodes.get('').hidden,false);
  assert.equal(f.nodes.get('Month').value,'2026-11');assert.match(f.nodes.get('Selected').textContent,/novembro de 2026/);
 }
 f.controller.setPanel('agent-products');assert.match(f.nodes.get('Scope').textContent,/fontes atuais/);assert.match(f.nodes.get('Scope').textContent,/não representam o catálogo ou estoque daquele mês/);
 f.controller.setPanel('agent-production');assert.match(f.nodes.get('Scope').textContent,/fila DTF é atual/);assert.match(f.nodes.get('Scope').textContent,/próprio mês e semana/);
 f.controller.setPanel('agent-returns');assert.match(f.nodes.get('Scope').textContent,/próprio mês quando fixado/);
 for(const tab of ['overview','products','production','margins','hermes','history','roadmap','ai-sales','__proto__']){assert.equal(f.controller.setPanel(tab),false);assert.equal(f.nodes.get('').hidden,true);}
 assert.deepEqual(f.reads,[],'switching panels must not start another source query');
 assert.equal(f.foreignDraft.value,'29,50');
});

test('a previous month is a single saved-view selection and preserves the panel and fragment in the URL',async()=>{
 const f=fixture();f.controller.setPanel('agent-finance');
 await f.nodes.get('Previous').onclick();
 assert.deepEqual(f.reads,['2026-10']);assert.equal(f.nodes.get('Month').value,'2026-10');assert.match(f.nodes.get('Selected').textContent,/outubro de 2026/);
 assert.equal(f.getLocation().searchParams.get('month'),'2026-10');assert.equal(f.getLocation().searchParams.get('tab'),'agent-finance');assert.equal(f.getLocation().hash,'#businessMonth');
 assert.equal(f.historyCalls.length,1);assert.equal(f.historyCalls[0].kind,'push');
 await f.nodes.get('Next').onclick();assert.equal(f.nodes.get('Month').value,'2026-11');assert.equal(f.nodes.get('Next').disabled,true);assert.equal(f.nodes.get('Current').disabled,true);
 assert.equal(f.foreignDraft.value,'29,50');
});

test('a daily controller replace does not consume the shared period history entry',async()=>{
 const f=fixture({dailyReplace:true,url:'https://app.example.test/admin?tab=agent-finance&month=2026-11&date=2026-11-02#businessMonth'});
 await f.controller.selectMonth('2026-10');
 assert.equal(f.historyCalls.filter(row=>row.kind==='push').length,1);assert.equal(f.historyCalls.length,3);
 assert.equal(f.historyCalls[1].kind,'replace');assert.match(f.historyCalls[1].path,/month=2026-11&date=2026-11-02/);
 assert.equal(f.historyCalls[2].kind,'push');assert.match(f.historyCalls[2].path,/month=2026-10&date=2026-10-31/);assert.equal(f.getLocation().hash,'#businessMonth');assert.equal(f.getLocation().searchParams.get('tab'),'agent-finance');assert.deepEqual(f.reads,['2026-10']);
});

test('the form validates future, malformed and external inputs without querying or changing selection',async()=>{
 const f=fixture();
 for(const month of ['2026-12','2026-00','2026-13','1999-12','2026-1','2026-10-01','https://example.test','<script>','2026-10&token=private',null])assert.equal(await f.controller.selectMonth(month),false);
 assert.deepEqual(f.reads,[]);assert.equal(f.nodes.get('Month').value,'2026-11');assert.equal(f.getLocation().searchParams.get('month'),'2026-11');
 assert.match(f.nodes.get('Status').textContent,/mês válido/);assert.doesNotMatch(f.nodes.get('Status').textContent,/script|private|example/);
 const min=fixture({month:'2000-01'});assert.equal(min.nodes.get('Previous').disabled,true);
});

test('unknown historical coverage is unavailable, never represented as zero or complete',()=>{
 const f=fixture({month:'2026-09',status:null,url:'https://app.example.test/admin?tab=agent-finance&month=2026-09'});
 f.controller.setPanel('agent-finance');
 assert.equal(f.nodes.get('Month').value,'2026-09');assert.match(f.nodes.get('Status').textContent,/Sem resumo validado/);assert.match(f.nodes.get('Status').textContent,/não representam zero/);
 assert.doesNotMatch(f.nodes.get('Status').textContent,/R\$|concluído|100%/);
 assert.deepEqual(f.reads,[]);
});

test('background snapshots and pane switches preserve an unsubmitted month input and unrelated drafts',()=>{
 const f=fixture();f.nodes.get('Month').value='2026-09';f.nodes.get('Month').oninput();
 f.setSnapshot({checked_at:1793660000});f.controller.setPanel('agent-ads');f.controller.setPanel('agent-products');
 assert.equal(f.nodes.get('Month').value,'2026-09');assert.equal(f.getLocation().searchParams.get('month'),'2026-11');assert.equal(f.foreignDraft.value,'29,50');assert.deepEqual(f.reads,[]);
 f.setSnapshot({month:'2026-10'});assert.equal(f.nodes.get('Month').value,'2026-10');assert.equal(f.getLocation().searchParams.get('month'),'2026-10');
});

test('unsaved financial drafts refuse period changes and restore the visible selection without a read',async()=>{
 const f=fixture({blocked:true});f.nodes.get('Month').value='2026-10';f.nodes.get('Month').oninput();
 let prevented=false;assert.equal(await f.nodes.get('Form').onsubmit({preventDefault(){prevented=true;}}),false);
 assert.equal(prevented,true);assert.deepEqual(f.reads,[]);assert.equal(f.nodes.get('Month').value,'2026-11');assert.equal(f.getLocation().searchParams.get('month'),'2026-11');assert.match(f.nodes.get('Status').textContent,/rascunhos/);assert.equal(f.foreignDraft.value,'29,50');
});

test('pending month reads disable controls and repeated actions do not create parallel work',async()=>{
 const f=fixture({deferred:true});const first=f.controller.selectMonth('2026-10');
 assert.equal(f.nodes.get('Apply').disabled,true);assert.equal(f.nodes.get('Month').disabled,true);assert.equal(f.nodes.get('').attrs['aria-busy'],'true');
 assert.equal(await f.controller.selectMonth('2026-09'),false);assert.deepEqual(f.reads,['2026-10']);
 assert.equal(f.getLocation().searchParams.get('month'),'2026-11','URL commits only after the selected snapshot is returned');
 f.release();assert.equal(await first,true);assert.equal(f.getLocation().searchParams.get('month'),'2026-10');assert.equal(f.nodes.get('Apply').disabled,false);
});

test('browser history restores the saved month without resetting panel or hash and without adding entries',async()=>{
 const f=fixture();f.setLocation('https://app.example.test/admin?tab=agent-auditor&month=2026-08#evidence');
 f.controller.setPanel('agent-auditor');assert.equal(f.getLocation().searchParams.get('month'),'2026-08','switching the pane must not clobber the incoming history URL');
 assert.equal(await f.controller.syncLocation(),true);assert.deepEqual(f.reads,['2026-08']);assert.equal(f.nodes.get('Month').value,'2026-08');
 assert.equal(f.getLocation().searchParams.get('tab'),'agent-auditor');assert.equal(f.getLocation().hash,'#evidence');assert.equal(f.historyCalls.some(row=>row.kind==='push'),false);
});

for(const id of ['finance','ads','products','production','returns','auditor','hermes'])test('historical selection stays coherent in the '+id+' agent URL across November, October and browser history',async()=>{
 const panel='agent-'+id,f=fixture({url:'https://app.example.test/admin?tab='+panel+'&month=2026-11#agent-details'});
 f.controller.setPanel(panel);await f.controller.selectMonth('2026-10');
 assert.equal(f.nodes.get('Month').value,'2026-10');assert.equal(f.getLocation().searchParams.get('month'),'2026-10');assert.equal(f.getLocation().searchParams.get('tab'),panel);assert.equal(f.getLocation().hash,'#agent-details');
 for(const peer of ['finance','ads','products','production','returns','auditor','hermes'])f.controller.setPanel('agent-'+peer);
 assert.deepEqual(f.reads,['2026-10'],'switching among the seven agents must reuse the selected saved month');
 f.controller.setPanel(panel);await f.controller.selectMonth('2026-11');assert.equal(f.nodes.get('Month').value,'2026-11');assert.deepEqual(f.reads,['2026-10','2026-11']);
 const pushes=f.historyCalls.filter(row=>row.kind==='push').length;
 f.setLocation('https://app.example.test/admin?tab='+panel+'&month=2026-10#history-detail');await f.controller.syncLocation();
 assert.equal(f.nodes.get('Month').value,'2026-10');assert.equal(f.getLocation().searchParams.get('month'),'2026-10');assert.equal(f.getLocation().searchParams.get('tab'),panel);assert.equal(f.getLocation().hash,'#history-detail');
 assert.equal(f.historyCalls.filter(row=>row.kind==='push').length,pushes);assert.deepEqual(f.reads,['2026-10','2026-11','2026-10']);
});

test('browser back cannot discard an edited financial month and the URL is restored to its accepted selection',async()=>{
 const f=fixture({blocked:true});f.setLocation('https://app.example.test/admin?tab=agent-returns&month=2026-10#physical');f.controller.setPanel('agent-returns');
 assert.equal(await f.controller.syncLocation(),false);assert.deepEqual(f.reads,[]);assert.equal(f.nodes.get('Month').value,'2026-11');assert.equal(f.getLocation().searchParams.get('month'),'2026-11');
 assert.equal(f.getLocation().searchParams.get('tab'),'agent-returns');assert.equal(f.getLocation().hash,'#physical');assert.match(f.nodes.get('Status').textContent,/rascunhos/);
});

test('browser back supersedes an in-flight historical selection and a late answer cannot take over the URL',async()=>{
 const f=fixture({deferred:true}),first=f.controller.selectMonth('2026-10');
 f.setLocation('https://app.example.test/admin?tab=agent-ads&month=2026-11#back');const back=f.controller.syncLocation();
 assert.deepEqual(f.reads,['2026-10','2026-11']);f.release();assert.equal(await first,false);assert.equal(f.nodes.get('Apply').disabled,true);
 f.release();assert.equal(await back,true);assert.equal(f.nodes.get('Month').value,'2026-11');assert.equal(f.getLocation().searchParams.get('month'),'2026-11');assert.equal(f.getLocation().searchParams.get('tab'),'agent-ads');assert.equal(f.getLocation().hash,'#back');
 assert.equal(f.historyCalls.some(row=>row.kind==='push'),false);
});

test('the controller observes changes once and drops late results after shutdown',async()=>{
 const f=fixture({deferred:true});f.controller.sync();f.controller.sync();const promise=f.controller.selectMonth('2026-10');f.controller.stop();f.release();
 assert.equal(await promise,false);assert.equal(f.getUnsubscribed(),1);assert.equal(f.getLocation().searchParams.get('month'),'2026-11');
});

test('the controller is standalone browser source with no external module closure',()=>{
 const context=vm.createContext({Intl,URL,Date,console});
 const factory=vm.runInContext('('+createAgentPeriodController.toString()+')',context);
 const controller=factory({documentImpl:{getElementById(){return null;}}});
 assert.equal(controller.setPanel('agent-finance'),false);assert.equal(typeof controller.selectMonth,'function');
});

test('the shared control follows the real monthly controller with saved GET views and protects its financial drafts',async()=>{
 const b=workspaceBrowser(workspaceView(),'?tab=agent-finance&month=2026-10');b.context.URL=URL;
 b.context.periodIds=[...agentPeriodBody().matchAll(/id="(mlsAgentPeriod[^"]*)"/g)].map(match=>match[1]);
 b.run(`for(const id of periodIds)controls.set(id,item());location.href='https://app.example.test/admin?tab=agent-finance&month=2026-10#businessMonth';const periodHistory=[];const periodHistoryImpl={replaceState(state,title,path){periodHistory.push(['replace',path]);location.href=new URL(path,location.href).href;location.search=new URL(location.href).search;},pushState(state,title,path){periodHistory.push(['push',path]);location.href=new URL(path,location.href).href;location.search=new URL(location.href).search;}};${createAgentPeriodController.toString()};const periodController=createAgentPeriodController({documentImpl:document,historyImpl:periodHistoryImpl});periodController.setPanel('agent-finance');`);
 assert.equal(await b.run('brazaMonthDashboard.start({api})'),true);
 assert.equal(b.run('controls.get("mlsAgentPeriodMonth").value'),'2026-10');assert.equal(b.run('brazaMonthDashboard.getSnapshot().period_loading'),false);
 b.load(workspaceView(completeWorkspaceFrame({month:'2026-09'})));assert.equal(await b.run('periodController.selectMonth("2026-09")'),true);
 assert.equal(b.run('controls.get("mlsAgentPeriodMonth").value'),'2026-09');assert.equal(b.run('brazaMonthDashboard.getSnapshot().month'),'2026-09');assert.equal(b.run('new URL(location.href).searchParams.get("month")'),'2026-09');
 b.run('control("ExpensesValue").value="12,50";control("ExpensesValue").oninput();');const before=b.calls().length;
 assert.equal(await b.run('periodController.selectMonth("2026-10")'),false);assert.equal(b.calls().length,before);assert.equal(b.run('control("ExpensesValue").value'),'12,50');assert.equal(b.run('control("Select").value'),'2026-09');assert.equal(b.run('controls.get("mlsAgentPeriodMonth").value'),'2026-09');
 for(const row of b.calls()){assert.ok(row.path.startsWith('finance/business-month-view?month='),row.path);assert.equal(row.body,undefined,'historical browsing does not trigger a collector or a write');}
 b.run('periodController.stop();brazaMonthDashboard.stop();');
});
