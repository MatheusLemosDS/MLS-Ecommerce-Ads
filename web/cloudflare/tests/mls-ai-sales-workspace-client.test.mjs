import test from 'node:test';
import assert from 'node:assert/strict';
import {MLS_AI_SALES_CLIENT,mlsAiSalesBody} from '../src/mls-ai-sales-view.mjs';
import * as contracts from '../src/mls-ai-sales-contracts.mjs';
import * as planner from '../src/mls-ai-sales-campaign-planner.mjs';
import * as catalog from '../src/mls-ai-sales-catalog.mjs';
import * as affiliates from '../src/mls-ai-sales-affiliates.mjs';
import * as performance from '../src/mls-ai-sales-performance.mjs';
import {salesAt,salesProduct} from './mls-ai-sales-domain-fixture.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const core={...contracts,...planner,...catalog,...affiliates,...performance};
const block=MLS_AI_SALES_CLIENT.split('/*__MLS_AI_SALES_PERSISTENCE_START__*/')[1].split('/*__MLS_AI_SALES_PERSISTENCE_END__*/')[0];
const create=Function(block+'\nreturn createWorkspacePersistence;')();
const declarations=['fail','safe','copy','exact'].map(name=>MLS_AI_SALES_CLIENT.match(new RegExp('^ const '+name+'=.*$','m'))?.[0]).join('\n');
const validators=MLS_AI_SALES_CLIENT.split('/*__MLS_AI_SALES_UI_VALIDATORS_START__*/')[1].split('/*__MLS_AI_SALES_UI_VALIDATORS_END__*/')[0];
const validateWorkspace=Function('core',declarations+'\n'+validators+'\nreturn validateWorkspace;')(core);
const empty=()=>({schema:'mls_ai_sales_workspace_v1',revision:0,products:[],assets:[],campaigns:[],jobs:[],video_reviews:[],affiliates:affiliates.createAiSalesAffiliateWorkspace(),performance:performance.createAiSalesPerformanceLedger(),audit:[],commercial_writes:false});
const envelope=(workspace=null,revision=workspace?1:0)=>({schema:'mls_ai_sales_saved_workspace_v1',revision,updated_at:revision?salesAt+100:null,workspace,commercial_writes:false});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function fixture({offline=false}={}){
 let local=empty(),token=0,media=0,source=async()=>envelope();
 const calls=[],statuses=[],restores=[];
 const client=create({
  request:async body=>{calls.push(body===undefined?null:clone(body));return source(body);},
  getSnapshot:()=>local,getChangeToken:()=>token,
  hasLocalWork:()=>local.products.length>0||media>0,
  restore:value=>{restores.push(clone(value));local=value;token++;media=0;},
  validateWorkspace,now:()=>salesAt+100,isOffline:()=>offline,onStatus:value=>statuses.push(clone(value))
 });
 client.start();
 return {client,calls,statuses,restores,setSource(value){source=value;},setMedia(value){media=value;},get media(){return media;},get local(){return local;},edit(){local.products=[salesProduct({media_refs:[]})];local.revision++;token++;client.changed();},interact(){token++;}};
}

test('saved-workspace controls use real explicit actions, never start polling or persist media bytes',()=>{
 const body=mlsAiSalesBody();
 for(const id of ['LoadSaved','SaveSaved','SavedStatus','ReplaceLocal','ReplaceRemote'])assert.ok(body.includes('id="aiSales'+id+'"'));
 assert.match(MLS_AI_SALES_CLIENT,/api\('ai-sales\/workspace',body,\{timeoutMs:body===undefined\?15000:30000\}\)/);
 assert.doesNotMatch(block,/\bfetch\s*\(|setInterval|setTimeout|localStorage|sessionStorage|console\./);
 const f=fixture();assert.deepEqual(f.calls,[]);assert.equal(f.client.getSnapshot().revision,null);
});

test('an initial empty read keeps the open draft and first save keeps attached files and current approvals in memory',async()=>{
 const f=fixture();f.edit();f.setMedia(2);
 assert.equal(await f.client.load({replaceLocal:true}),true);assert.equal(f.client.getSnapshot().revision,0);assert.equal(f.local.products.length,1);assert.equal(f.media,2);assert.equal(f.restores.length,0);
 f.setSource(async body=>{assert.equal(body.revision,0);return envelope(await validateWorkspace(body.workspace,salesAt+100));});
 assert.equal(await f.client.save(),true);assert.equal(f.calls.length,2);assert.equal(f.calls[1].workspace.products.length,1);assert.equal(f.media,2);assert.equal(f.restores.length,0);assert.equal(f.client.getSnapshot().revision,1);assert.equal(f.client.getSnapshot().dirty,false);
 assert.doesNotMatch(JSON.stringify(f.calls),/blob:|data:|access_token|cookie/);
});

test('first save discovers an existing server draft without overwriting until explicitly selected',async()=>{
 const f=fixture(),remote=empty();f.edit();remote.products=[salesProduct({media_refs:[],title:'Saved remote title'})];
 f.setSource(async body=>body===undefined?envelope(remote,4):envelope(await validateWorkspace(body.workspace,salesAt+100),5));
 assert.equal(await f.client.save(),false);assert.equal(f.calls.length,1);assert.equal(f.client.getSnapshot().remote_exists,true);assert.equal(f.client.getSnapshot().loaded,false);assert.notEqual(f.local.products[0].title,'Saved remote title');
 assert.equal(await f.client.save({replaceRemote:true}),true);assert.equal(f.calls.length,2);assert.equal(f.calls[1].revision,4);assert.equal(f.client.getSnapshot().revision,5);
});

test('loading requires explicit local replacement and restores metadata through the existing approval downgrade',async()=>{
 const f=fixture(),remote=empty();remote.products=[salesProduct({media_refs:[],title:'Server product'})];f.edit();f.setMedia(1);f.setSource(async()=>envelope(remote,3));
 assert.equal(await f.client.load(),false);assert.equal(f.calls.length,0);assert.equal(f.media,1);
 assert.equal(await f.client.load({replaceLocal:true}),true);assert.equal(f.restores.length,1);assert.equal(f.media,0);assert.equal(f.local.products[0].title,'Server product');assert.deepEqual(f.local.products[0].verified_product_attributes,[]);assert.ok(f.local.products[0].observations.every(row=>row.evidence.status==='DECLARED'));assert.equal(f.client.getSnapshot().dirty,false);
});

test('local edits or form interactions during a read cannot erase a new draft or its files',async()=>{
 for(const edit of ['state','form']){
  const f=fixture(),wait=deferred(),remote=empty();remote.products=[salesProduct({media_refs:[],title:'Old server product'})];f.setSource(()=>wait.promise);
  const loading=f.client.load();assert.equal(f.client.getSnapshot().pending,true);
  edit==='state'?f.edit():f.interact();f.setMedia(1);wait.resolve(envelope(remote,2));
  assert.equal(await loading,false);assert.equal(f.restores.length,0);assert.equal(f.media,1);assert.equal(f.client.getSnapshot().revision,null);assert.match(f.statuses.at(-1).message,/Nenhum rascunho ou arquivo foi substituído/);
 }
});

test('changing a draft during the initial revision lookup cannot submit an obsolete snapshot',async()=>{
 const f=fixture(),wait=deferred();f.setSource(()=>wait.promise);const saving=f.client.save();f.edit();wait.resolve(envelope());
 assert.equal(await saving,false);assert.equal(f.calls.length,1);assert.equal(f.client.getSnapshot().revision,null);assert.equal(f.client.getSnapshot().dirty,true);
});

test('a successful save never replaces the active draft and marks later edits as unsaved',async()=>{
 const f=fixture();await f.client.load();f.edit();f.setMedia(1);const wait=deferred();f.setSource(()=>wait.promise);
 const saving=f.client.save();f.interact();wait.resolve(envelope(f.local,1));
 assert.equal(await saving,true);assert.equal(f.restores.length,0);assert.equal(f.media,1);assert.equal(f.client.getSnapshot().dirty,true);assert.match(f.statuses.at(-1).message,/alterações posteriores/);
});

test('a revision conflict never retries the write and requires an explicit current read before saving again',async()=>{
 const f=fixture();await f.client.load();f.edit();f.setSource(async()=>{throw Object.assign(Error('PRIVATE_UNTRUSTED_TEXT'),{status:409,apiCode:'AI_SALES_WORKSPACE_CONFLICT'});});
 assert.equal(await f.client.save(),false);assert.equal(f.client.getSnapshot().conflict,true);const calls=f.calls.length;
 assert.equal(await f.client.save({replaceRemote:true}),false);assert.equal(f.calls.length,calls);assert.doesNotMatch(JSON.stringify(f.statuses),/PRIVATE_UNTRUSTED_TEXT/);
 f.setSource(async()=>envelope(f.local,2));assert.equal(await f.client.load({replaceLocal:true}),true);assert.equal(f.client.getSnapshot().conflict,false);assert.equal(f.client.getSnapshot().revision,2);
 f.setSource(async body=>{assert.equal(body.revision,2);return envelope(body.workspace,3);});assert.equal(await f.client.save(),true);
});

test('logout and a new session fence both a late success and a late error without clearing the new pending read',async()=>{
 for(const outcome of ['success','failure']){
  const f=fixture(),old=deferred(),next=deferred();f.setSource(()=>old.promise);const first=f.client.load();f.client.stop();f.client.start();f.setSource(()=>next.promise);const second=f.client.load();
  outcome==='success'?old.resolve(envelope(empty(),8)):old.reject(Object.assign(Error('PRIVATE_OLD_SESSION'),{status:401}));
  assert.equal(await first,false);assert.equal(f.client.getSnapshot().pending,true);assert.equal(f.client.getSnapshot().unavailable,false);assert.equal(f.client.getSnapshot().revision,null);assert.equal(f.restores.length,0);
  next.resolve(envelope());assert.equal(await second,true);assert.equal(f.client.getSnapshot().pending,false);assert.equal(f.client.getSnapshot().revision,0);assert.doesNotMatch(JSON.stringify(f.statuses),/PRIVATE_OLD_SESSION/);
 }
});

test('offline snapshots disable server storage and expired sessions keep all local work',async()=>{
 const offline=fixture({offline:true});assert.equal(await offline.client.load(),false);assert.equal(await offline.client.save(),false);assert.equal(offline.calls.length,0);assert.equal(offline.client.getSnapshot().unavailable,true);
 for(const status of [401,403,404,405]){
  const f=fixture();f.edit();f.setMedia(1);f.setSource(async()=>{throw Object.assign(Error('PRIVATE_AUTH_TEXT'),{status});});
  assert.equal(await f.client.save(),false);assert.equal(f.client.getSnapshot().unavailable,true);assert.equal(f.local.products.length,1);assert.equal(f.media,1);assert.equal(await f.client.save(),false);assert.equal(f.calls.length,1);assert.doesNotMatch(JSON.stringify(f.statuses),/PRIVATE_AUTH_TEXT/);
 }
});

test('malformed or reversed server acknowledgements never report a new saved revision',async()=>{
 for(const mutate of [value=>value.extra='PRIVATE_PAYLOAD',value=>value.commercial_writes=true,value=>value.revision=-1,value=>value.revision=0,value=>value.updated_at=salesAt+1000,value=>value.workspace=null,value=>value.workspace.commercial_writes=true]){
  const f=fixture();await f.client.load();f.edit();const response=envelope(f.local,1);mutate(response);f.setSource(async()=>response);
  assert.equal(await f.client.save(),false);assert.equal(f.client.getSnapshot().revision,0);assert.equal(f.client.getSnapshot().dirty,true);assert.doesNotMatch(JSON.stringify(f.statuses),/PRIVATE_PAYLOAD/);
 }
 const f=fixture();f.setSource(async()=>envelope(empty(),3));await f.client.load();f.setSource(async()=>envelope(empty(),2));assert.equal(await f.client.save(),false);assert.equal(f.client.getSnapshot().revision,3);
});

test('nested accessors, executable JSON hooks and cycles are rejected without invocation or changing the draft',async()=>{
 for(const kind of ['getter','toJSON','cycle','sparse','deep']){
  const f=fixture();let invoked=0;const remote=clone(empty());
  if(kind==='getter')Object.defineProperty(remote.affiliates,'revision',{enumerable:true,get(){invoked++;return 0;}});
  else if(kind==='toJSON')remote.affiliates.toJSON=()=>{invoked++;return {};};
  else if(kind==='cycle')remote.extra=remote;
  else if(kind==='sparse')remote.products=Array(2);
  else{let value=remote;for(let n=0;n<70;n++)value.extra=value={};}
  f.setSource(async()=>envelope(remote,1));
  assert.equal(await f.client.load(),false,kind);assert.equal(invoked,0,kind);assert.equal(f.restores.length,0);assert.equal(f.client.getSnapshot().revision,null);
 }
});
