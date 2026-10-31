import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {MISSION_AGENTS,MISSION_CSS,MISSION_CLIENT,missionWorkspacesBody} from '../src/mission-control.mjs';
import {buildMlsAgentRegistry} from '../src/agent-registry.mjs';

const IDs=MISSION_AGENTS.map(item=>item.id);
function fixture(){
 return buildMlsAgentRegistry({
  day:{schema:'mls_day_snapshot_v1',date:'2026-10-27',state:'READY',net_cents:13784,sales_cents:76276,ads_spend_cents:3777,paid_orders:11,net_basis:'ESTIMATE'},
  month:{schema:'mls_month_snapshot_v1',month:'2026-10',status:'COMPLETE',balance_cents:258761,checked_at:1793070100,
   coverage:{returns:2,returns_unknown:0,cancel_pending:0,other:0,unknown:0},
   production_coverage:{total_units:294,known_units:294},pending:['RETURNS_NOT_RECONCILED']},
  now:1793070150
 });
}
function mount(snapshot){
 const html=missionWorkspacesBody();
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(row=>row[1]);
 const listeners=new Map();
 const element=(tag='div')=>{
  let own='';
  const obj={tagName:tag.toUpperCase(),tag,hidden:false,disabled:false,dataset:{},style:{},children:[],href:'',id:'',attributes:{},className:'',
   get textContent(){return own+this.children.map(child=>child.textContent||'').join('');},
   set textContent(value){own=String(value);this.children=[];},
   append(...items){this.children.push(...items);},
   replaceChildren(...items){own='';this.children=[...items];},
   getAttribute(key){if(key==='data-mission-agent')return this.dataset.missionAgent;if(key==='id')return this.id;return this.attributes[key]??null;},
   setAttribute(key,value){this.attributes[key]=String(value);},
   addEventListener(name,handler){listeners.set(this.id||this.dataset.missionHubFilter||name,handler);}
  };
  return obj;
 };
 const nodes=new Map(ids.map(id=>{const e=element();e.id=id;return [id,e];}));
 const cards=MISSION_AGENTS.map(item=>{
  const e=element('a');e.dataset.missionAgent=item.id;e.textContent=item.name+' '+item.area+' '+item.summary;return e;
 });
 const filters=['all','ATTENTION','WORKING','HEALTHY'].map(value=>{
  const e=element('button');e.dataset.missionHubFilter=value;return e;
 });
 const statusNodes=new Map(IDs.map(id=>[id,[element()]]));
 const document={getElementById:id=>nodes.get(id)||null,
  querySelectorAll(selector){
   if(selector==='.mission-hub-card')return cards;
   if(selector==='[data-mission-hub-filter]')return filters;
   const match=/^\[data-mission-status="([^"]+)"\]$/.exec(selector);
   return match?statusNodes.get(match[1])||[]:[];
  },createElement:element};
 const context=vm.createContext({document,Intl,Date,Number,BigInt,Math});
 if(snapshot)context.mlsAgentRegistry={getSnapshot:()=>snapshot};
 vm.runInContext(MISSION_CLIENT,context);
 return {html,nodes,cards,filters,listeners,context};
}

test('Agentes workspace clearly distinguishes observer operations, source state and priorities',()=>{
 const html=missionWorkspacesBody('<div id="protectedFinanceControl">Preserved</div>');
 assert.equal(MISSION_AGENTS.length,7);
 for(const id of IDs){
  assert.match(html,new RegExp('href="/admin\\?tab=agent-'+id+'"'));
  assert.match(html,new RegExp('id="missionHubTask-'+id+'"'));
  assert.match(html,new RegExp('data-mission-agent="'+id+'"'));
 }
 for(const id of ['missionFleetStatus','missionHubAttentionCount','missionHubWorkingCount','missionHubPriorityCount','missionHubPriorityList','missionHubSnapshot','missionAgentSearch','missionHubFilterEmpty']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 for(const filter of ['all','ATTENTION','WORKING','HEALTHY'])
  assert.match(html,new RegExp('data-mission-hub-filter="'+filter+'"'));
 assert.match(html,/Modo Observador/);
 assert.match(html,/Ads e PROMO · bloqueados/);
 assert.match(html,/Estado técnico não é lucro/);
 assert.match(html,/MLS Pricing · M3/);
 assert.equal((html.match(/class="mission-hub-card /g)||[]).length,7);
 assert.equal((html.match(/id="protectedFinanceControl"/g)||[]).length,1);
 assert.match(MISSION_CSS,/Agent hub V3\.7 visual-only cockpit/);
 assert.match(MISSION_CSS,/@media\(max-width:680px\)/);
 assert.equal(MISSION_CLIENT.includes('fetch('),false);
 assert.equal(MISSION_CLIENT.includes('setInterval('),false);
 assert.equal(MISSION_CLIENT.includes('localStorage'),false);
});

test('Agent Registry is the sole source of team counts, priorities and audit-safe destinations',()=>{
 const snapshot=fixture(),view=mount(snapshot);
 const statusById=new Map([...snapshot.agents,snapshot.hermes].map(a=>[a.id,a.status]));
 const attention=[...statusById.values()].filter(v=>v==='ATTENTION'||v==='BLOCKED').length;
 const working=[...statusById.values()].filter(v=>v==='WORKING').length;
 assert.equal(view.nodes.get('missionHubAttentionCount').textContent,String(attention));
 assert.equal(view.nodes.get('missionHubWorkingCount').textContent,String(working));
 assert.equal(view.nodes.get('missionHubPriorityCount').textContent,String(snapshot.priorities.length));
 const list=view.nodes.get('missionHubPriorityList');
 assert.ok(list.children.length>=1);
 if(snapshot.priorities.length){
  const first=list.children[0];
  assert.equal(first.href,'/admin?tab=agent-'+snapshot.priorities[0].agent_id);
  assert.equal(first.children[1].children[0].textContent,snapshot.priorities[0].title);
  assert.equal(first.children[1].children[1].textContent,snapshot.priorities[0].detail);
 }
 for(const card of view.cards)assert.equal(card.dataset.missionHubState,statusById.get(card.dataset.missionAgent));
 assert.match(view.nodes.get('missionHubSnapshot').textContent,/não comprova atualização de cada fonte/);
});

test('unverified statuses and unknown priority contracts remain visibly unknown',()=>{
 const snapshot=fixture(),view=mount(snapshot);
 const broken={...snapshot,agents:[],hermes:null,priorities:null,generated_at:null};
 view.context.mlsMission.refresh(broken);
 for(const id of ['missionHubAttentionCount','missionHubWorkingCount','missionHubPriorityCount'])
  assert.equal(view.nodes.get(id).textContent,'—');
 assert.match(view.nodes.get('missionHubPriorityList').children[0].textContent,/Aguardando a leitura validada/);
 assert.equal(view.nodes.get('missionHubSnapshot').textContent,'Horário da projeção indisponível');
 for(const card of view.cards)assert.equal(card.dataset.missionHubState,'UNKNOWN');
});

test('status filters and text search work together without network requests or hidden selections',()=>{
 const snapshot=fixture(),view=mount(snapshot);
 const click=key=>view.listeners.get(key)?.();
 click('ATTENTION');
 const expected=new Set([...snapshot.agents,snapshot.hermes].filter(x=>['ATTENTION','BLOCKED'].includes(x.status)).map(x=>x.id));
 for(const card of view.cards)assert.equal(!card.hidden,expected.has(card.dataset.missionAgent));
 assert.equal(view.filters[1].attributes['aria-pressed'],'true');
 click('all');
 const search=view.nodes.get('missionAgentSearch');
 search.value='finance';view.listeners.get('missionAgentSearch')?.();
 const visible=view.cards.filter(card=>!card.hidden);
 assert.equal(visible.length,1);
 assert.equal(visible[0].dataset.missionAgent,'finance');
 search.value='não-existe';view.listeners.get('missionAgentSearch')?.();
 assert.equal(view.nodes.get('missionHubFilterEmpty').hidden,false);
 assert.match(view.nodes.get('missionAgentSearchCount').textContent,/0 especialista/);
});

test('priority title and detail are text, never HTML or arbitrary destinations',()=>{
 const view=mount(fixture());
 const base=fixture();
 view.context.mlsMission.refresh({...base,priorities:[
  {agent_id:'finance',severity:'ATTENTION',title:'<img src=x onerror=alert(1)>',detail:'<script>inert</script>',href:'https://evil.invalid/'},
  {agent_id:'unknown',severity:'BLOCKED',title:'Invalid',detail:'Do not render',href:'javascript:alert(1)'}
 ]});
 const rows=view.nodes.get('missionHubPriorityList').children;
 assert.equal(rows.length,1);
 assert.equal(rows[0].href,'/admin?tab=agent-finance');
 assert.equal(rows[0].children[1].children[0].textContent,'<img src=x onerror=alert(1)>');
 assert.equal(rows[0].children[1].children[1].textContent,'<script>inert</script>');
});
