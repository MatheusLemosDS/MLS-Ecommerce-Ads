import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {AUTOMATION_WORKSPACE_CSS,automationWorkspaceBody,AUTOMATION_WORKSPACE_CLIENT} from '../src/automation-workspace.mjs';

const stamp=1792843200;
const state=(changes={})=>({schema:'business_sync_state_v1',enabled:true,mode:'READ_ONLY',revision:1,status:'IDLE',month:null,next_run_at:0,lease_expires_at:null,failure_count:0,last_attempt_at:null,last_success_at:null,last_error:null,summary:null,...changes});
function browser(responder=async()=>state()){
 const elements=new Map(),listeners=new Map(),timers=new Map(),calls=[];let timerId=0;
 class Element{
  constructor(tag='div'){this.tag=tag;this.textContent='';this.children=[];this.dataset={};this.disabled=false;this.onclick=null;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];this.textContent='';}
 }
 for(const match of automationWorkspaceBody().matchAll(/id="([^"]+)"/g))elements.set(match[1],new Element());
 const document={hidden:false,getElementById:id=>elements.get(id)||null,createElement:tag=>new Element(tag),addEventListener:(name,handler)=>listeners.set(name,handler)};
 const context=vm.createContext({document,Intl,Date,setTimeout:(callback,delay)=>{const id=++timerId;timers.set(id,{callback,delay});return id;},clearTimeout:id=>timers.delete(id)});
 new vm.Script(AUTOMATION_WORKSPACE_CLIENT).runInContext(context);
 const workspace=context.brazaAutomationWorkspace;
 const api=async(path,body)=>{calls.push({path,...(body?{body:JSON.parse(JSON.stringify(body))}:{})});return responder(path,body);};
 const el=name=>elements.get('automation'+name),text=name=>{const read=node=>node.textContent+node.children.map(read).join(' ');return read(el(name));};
 return {workspace,api,document,elements,timers,calls,el,text,visibility:()=>listeners.get('visibilitychange')()};
}
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

test('workspace starts collapsed with responsive theme styling and clear financial limits',()=>{
 const body=automationWorkspaceBody();
 assert.match(body,/<details class="automation-workspace" id="automationWorkspace">/);
 assert.doesNotMatch(body,/<details[^>]+\bopen\b/);
 for(const label of ['Coleta e diagnóstico automático','TACOS','Saldo disponível antes de Ads','Cobertura dos custos','recebimentos liquidados','reembolsos efetivos'])assert.ok(body.toLowerCase().includes(label.toLowerCase()),label);
 assert.match(body,/aria-live="polite"/);assert.match(AUTOMATION_WORKSPACE_CSS,/var\(--surface\)/);assert.match(AUTOMATION_WORKSPACE_CSS,/@media\(max-width:640px\)/);
 assert.doesNotMatch(AUTOMATION_WORKSPACE_CLIENT,/innerHTML|buildAccountDiagnosis|business-month'/);
});

test('polls only cheap state once per visible minute, reports first run honestly, and stops cleanly',async()=>{
 const b=browser();await b.workspace.start({api:b.api});
 assert.match(b.text('Status'),/primeira coleta/);assert.match(b.text('LastSuccess'),/ainda não confirmada/);assert.match(b.text('NextRun'),/primeira execução/);assert.doesNotMatch(b.text('NextRun'),/1970/);
 assert.equal(b.timers.size,1);assert.equal([...b.timers.values()][0].delay,60000);
 await b.workspace.start({api:b.api});assert.equal(b.timers.size,1);
 b.document.hidden=true;b.visibility();assert.equal(b.timers.size,0);
 const count=b.calls.length;await b.workspace.start({api:b.api});assert.equal(b.calls.length,count);
 b.document.hidden=false;b.visibility();await flush();assert.equal(b.calls.length,count+1);assert.equal(b.timers.size,1);
 assert.ok(b.calls.every(call=>call.path==='finance/sync-state'&&!call.body));
 b.workspace.stop();assert.equal(b.timers.size,0);assert.equal(b.el('Toggle').disabled,true);b.visibility();await flush();assert.equal(b.calls.length,count+1);
});

test('pause uses current revision, prevents duplicate writes, and retains real completion timestamps',async()=>{
 let complete;const b=browser(async(path,body)=>path.endsWith('sync-state')?state({status:'COMPLETE',last_success_at:stamp,next_run_at:stamp+300}):new Promise(resolve=>{complete=()=>resolve(state({enabled:body.enabled,revision:2,status:'PAUSED',last_success_at:stamp,next_run_at:null}));}));
 await b.workspace.start({api:b.api});assert.match(b.text('LastSuccess'),/Brasília/);assert.match(b.text('NextRun'),/prevista:/);
 const saving=b.el('Toggle').onclick();await b.el('Toggle').onclick();assert.equal(b.calls.filter(call=>call.body).length,1);assert.equal(b.el('Toggle').disabled,true);
 assert.deepEqual(b.calls.at(-1),{path:'finance/sync-policy',body:{revision:1,enabled:false}});
 complete();await saving;assert.match(b.text('Status'),/pausada/);assert.match(b.text('LastSuccess'),/Brasília/);assert.match(b.text('NextRun'),/pausada/);assert.equal(b.el('Toggle').textContent,'Ativar coleta');assert.equal(b.timers.size,1);
});

test('409 reload preserves the chosen pause and requires explicit retry with the new revision',async()=>{
 let reads=0,writes=0;const b=browser(async(path,body)=>{
  if(path.endsWith('sync-state'))return state({revision:++reads===1?1:4});
  if(++writes===1)throw Object.assign(Error('conflict'),{status:409});
  return state({revision:5,enabled:body.enabled,status:'PAUSED',next_run_at:null});
 });
 await b.workspace.start({api:b.api});await b.el('Toggle').onclick();
 assert.equal(writes,1);assert.equal(reads,2);assert.match(b.text('Message'),/escolha foi preservada/);assert.equal(b.el('Toggle').textContent,'Confirmar pausa');assert.equal(b.el('Toggle').disabled,false);
 await b.el('Toggle').onclick();assert.equal(writes,2);assert.deepEqual(b.calls.at(-1).body,{revision:4,enabled:false});assert.equal(b.el('Toggle').textContent,'Ativar coleta');
});

test('failed conflict reload blocks writes until successful manual refresh without discarding the choice',async()=>{
 let reads=0;const b=browser(async(path)=>{
  if(path.endsWith('sync-policy'))throw Object.assign(Error('conflict'),{status:409});
  if(++reads===2)throw Error('unavailable');
  return state({revision:reads===1?1:6});
 });
 await b.workspace.start({api:b.api});await b.el('Toggle').onclick();assert.equal(b.el('Toggle').disabled,true);assert.match(b.text('Message'),/escolha foi preservada/);assert.match(b.text('NextRun'),/não confirmado/);
 await b.el('Toggle').onclick();assert.equal(b.calls.filter(call=>call.body).length,1);
 await b.el('Refresh').onclick();assert.equal(b.el('Toggle').disabled,false);assert.equal(b.el('Toggle').textContent,'Confirmar pausa');
});

test('renders validated account metrics and plain task text, then clears stale diagnosis',()=>{
 const b=browser();b.workspace.render({month:'2026-10',status:'BLOCKED',metrics:{tacos_bps:2134,available_before_ads_cents:-100,cost_coverage_bps:7500,costed_quantity:3,total_quantity:4},tasks:[{priority:'HIGH',label:'Conferir <script>valor</script>',detail:'Reembolso <img src=x> ainda pendente.'}]});
 assert.equal(b.text('Tacos'),'21,34%');assert.match(b.text('BeforeAds'),/-.*1,00/);assert.equal(b.text('CostCoverage'),'75%');assert.match(b.text('CostQuantity'),/3 de 4/);assert.match(b.text('Tasks'),/<script>valor<\/script>/);assert.match(b.text('Tasks'),/Prioridade alta/);assert.equal(b.el('Tasks').children[0].children[0].tag,'strong');
 b.workspace.render({month:'2026-10',status:'READY_FOR_REVIEW',metrics:{tacos_bps:0,available_before_ads_cents:0,cost_coverage_bps:null,costed_quantity:null,total_quantity:null},tasks:[]});
 assert.equal(b.text('Tacos'),'0%');assert.match(b.text('BeforeAds'),/0,00/);assert.equal(b.text('CostCoverage'),'Pendente');
 b.workspace.render(null);assert.equal(b.text('Tacos'),'Pendente');assert.equal(b.text('BeforeAds'),'Pendente');assert.match(b.text('Tasks'),/Aguardando/);assert.doesNotMatch(b.text('Tasks'),/script/);
});

test('invalid states fail closed and stopping an in-flight poll cannot recreate its timer',async()=>{
 let release;const b=browser(async()=>new Promise(resolve=>{release=resolve;}));const starting=b.workspace.start({api:b.api});await flush();b.workspace.stop();release(state({last_success_at:stamp}));await starting;assert.equal(b.timers.size,0);assert.equal(b.el('Toggle').disabled,true);
 const invalid=browser(async()=>state({next_run_at:'PRIVATE',summary:{private_token:'SECRET'},last_error:'SECRET'}));await invalid.workspace.start({api:invalid.api});assert.equal(invalid.el('Toggle').disabled,true);assert.match(invalid.text('Status'),/Não foi possível confirmar/);assert.doesNotMatch(invalid.text('Status')+invalid.text('Message'),/SECRET|PRIVATE/);
});
