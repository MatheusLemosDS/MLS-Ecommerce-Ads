import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {CLIENT} from '../src/admin-client.mjs';
import {createAdminStartup} from '../src/admin-startup.mjs';

const apiBegin=CLIENT.indexOf('async function api('),apiEnd=CLIENT.indexOf('\nfunction notice(',apiBegin);
const feedbackBegin=CLIENT.indexOf('function startupFeedback('),feedbackEnd=CLIENT.indexOf('\nfunction secondaryFailure(',feedbackBegin);
assert.ok(apiBegin>=0&&apiEnd>apiBegin&&feedbackBegin>=0&&feedbackEnd>feedbackBegin);

function fixture(failure){
 const nodes=new Map(['message','startupRetry','startupLogin'].map(id=>[id,{dataset:{},textContent:'',hidden:true,disabled:false}])),phases=[],events=[],waits=[];
 const context=vm.createContext({failure,nodes,phases,events,waits});
 vm.runInContext(createAdminStartup.toString()+`
 const el=id=>nodes.get(id);function notice(value){el('message').textContent=value;}
 globalThis.brazaMonthDashboard={bootstrapState:value=>phases.push(value)};
 let blocked=true,reads=0;
 const adminRequest=async()=>{reads++;if(blocked)throw failure;return {csrf:'fixture-only'};};
 `+CLIENT.slice(apiBegin,apiEnd)+'\n'+CLIENT.slice(feedbackBegin,feedbackEnd)+`
 const controller=createAdminStartup({loadSession:()=>api('bootstrap'),acceptSession:()=>events.push('accepted'),startPrimary:()=>events.push('primary'),startSecondary:()=>events.push('secondary'),onState:startupFeedback,onPrimaryFailure:()=>{},wait:async ms=>waits.push(ms),canRetry:()=>true});
 `,context);
 return {nodes,phases,events,waits,run:source=>vm.runInContext(source,context),start:()=>vm.runInContext('controller.start()',context)};
}
const http=(status,apiCode)=>Object.assign(new Error('PRIVATE_SQL_DETAIL'),{code:'ADMIN_API_HTTP_ERROR',status,apiCode});

test('quota bootstrap shows the daily reset time, starts no panels and preserves a successful manual retry',async()=>{
 const f=fixture(http(503,'ADMIN_DB_DAILY_LIMIT_EXCEEDED'));assert.equal((await f.start()).phase,'FAILED');
 assert.equal(f.run('reads'),1);assert.deepEqual(f.waits,[]);assert.deepEqual(f.events,[]);
 const message=f.nodes.get('message').textContent;assert.match(message,/limite diário do banco de dados/);assert.match(message,/21h \(horário de Brasília\)/);assert.doesNotMatch(message,/Verifique sua conexão|PRIVATE|SQL|D1_ERROR/);
 assert.equal(f.nodes.get('startupRetry').hidden,false);assert.equal(f.nodes.get('startupRetry').disabled,false);assert.equal(f.nodes.get('startupLogin').hidden,true);assert.equal(f.phases.at(-1).failureKind,'QUOTA');assert.equal(Object.hasOwn(f.phases.at(-1),'message'),false);
 f.run('blocked=false');assert.equal((await f.start()).phase,'READY');assert.equal(f.run('reads'),2);assert.deepEqual(f.events,['accepted','primary','secondary']);assert.equal(f.nodes.get('message').textContent,'');assert.equal(f.nodes.get('startupRetry').hidden,true);
});

test('other service failures remain distinct from quota and internet failures',async()=>{
 for(const code of ['ADMIN_UNAVAILABLE','OPERATOR_COST_CORRECTION_STORAGE_UNAVAILABLE',null]){
  const f=fixture(http(503,code));await f.start();assert.equal(f.run('reads'),1);assert.deepEqual(f.waits,[]);assert.match(f.nodes.get('message').textContent,/temporariamente indisponível/);assert.doesNotMatch(f.nodes.get('message').textContent,/limite diário|21h|Verifique sua conexão|PRIVATE/);assert.equal(f.nodes.get('startupRetry').hidden,false);assert.equal(f.phases.at(-1).failureKind,'UNAVAILABLE');
 }
 const wrongStatus=fixture(http(500,'ADMIN_DB_DAILY_LIMIT_EXCEEDED'));await wrongStatus.start();assert.doesNotMatch(wrongStatus.nodes.get('message').textContent,/limite diário|21h/);
});

test('network retry and expired-session login retain their existing behavior',async()=>{
 const network=fixture(Object.assign(new Error('PRIVATE_NETWORK_DETAIL'),{code:'ADMIN_API_NETWORK_ERROR',status:null,apiCode:null}));await network.start();assert.equal(network.run('reads'),2);assert.deepEqual(network.waits,[750]);assert.match(network.nodes.get('message').textContent,/Não foi possível conectar ao painel\. Verifique sua conexão/);assert.equal(network.nodes.get('startupRetry').hidden,false);assert.equal(network.phases.at(-1).failureKind,'NETWORK');
 const unauthorized=fixture(http(401,'UNAUTHORIZED'));await unauthorized.start();assert.equal(unauthorized.run('reads'),1);assert.deepEqual(unauthorized.waits,[]);assert.equal(unauthorized.nodes.get('message').textContent,'Sua sessão expirou. Entre novamente.');assert.equal(unauthorized.nodes.get('startupRetry').hidden,true);assert.equal(unauthorized.nodes.get('startupLogin').hidden,false);assert.equal(unauthorized.phases.at(-1).failureKind,'SESSION');
});


test('a bootstrap timeout passes only its safe failure category to the monthly workspace',async()=>{
 const f=fixture(Object.assign(new Error('PRIVATE_TIMEOUT_DETAIL'),{code:'ADMIN_API_TIMEOUT',status:null,apiCode:null}));
 await f.start();assert.equal(f.run('reads'),2);assert.match(f.nodes.get('message').textContent,/A consulta demorou mais que o esperado/);assert.equal(f.phases.at(-1).failureKind,'TIMEOUT');assert.equal(Object.hasOwn(f.phases.at(-1),'message'),false);assert.doesNotMatch(JSON.stringify(f.phases),/PRIVATE/);
});
