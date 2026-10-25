import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {CLIENT} from '../src/admin-client.mjs';

const part=(start,end)=>{const a=CLIENT.indexOf(start),b=CLIENT.indexOf(end,a);assert.ok(a>=0&&b>a);return CLIENT.slice(a,b);};

test('the product controller delegates three thousand candidates to the durable queue without consuming manual drafts or the legacy twenty-step path',async()=>{
 const context=vm.createContext({});
 new vm.Script(`
 let variantSyncPromise=null;const statuses={};const el=id=>statuses[id]||(statuses[id]={textContent:''});let bindingUpdates=0;const updateBindingSaveState=()=>bindingUpdates++;
 const variantGroups=new Map(Array.from({length:3000},(_,index)=>[String(index),{item_id:String(100+index),model_id:'0'}]));const bindingDrafts=new Map([['100:0',{size:'M',confirmed:true}]]);let submissions=0,received=null,releaseQueue;
 globalThis.brazaMonthDashboard={supportsCatalogQueue:()=>true,syncCatalogCandidates:rows=>{submissions++;received=rows;return new Promise(resolve=>releaseQueue=resolve);}};
 `+part('async function syncKnownVariants(','async function syncOnProductsOpen(')).runInContext(context);
 const run=code=>new vm.Script(code).runInContext(context);
 const first=run('syncKnownVariants()'),second=run('syncKnownVariants()');
 assert.equal(run('submissions'),1);assert.equal(run('received.length'),3000);assert.equal(run('bindingDrafts.size'),1);assert.equal(run("bindingDrafts.get('100:0').size"),'M');
 run('releaseQueue(true)');assert.equal(await first,true);assert.equal(await second,true);assert.equal(run('bindingUpdates'),1);assert.match(run("statuses.variantsSyncStatus.textContent"),/fila automática/);
});

test('normalized catalogue bindings support product rendering without replacing manual composition or trusting unsupported provenance',()=>{
 const context=vm.createContext({});
 new vm.Script(`
 const variantKey=row=>row.item_id+':'+row.model_id;
 let bindingState={bindings:[{item_id:'100',model_id:'1',size:'M',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}]};
 let itemsData={production_cost_reference:{variants:[]}};
 const normalized=(item_id,model_id,size='P')=>({item_id,model_id,size,selling_unit:'SINGLE_GARMENT',operator_confirmed:false,source:'CATALOG_SIZE_AXIS',catalog_fingerprint:'a'.repeat(64)});
 `+part('function currentBindingMap(','function validBindingState(')).runInContext(context);
 const run=code=>new vm.Script(code).runInContext(context);
 run("itemsData.production_cost_reference.variants=[{item_id:'100',model_id:'1',catalog_binding:normalized('100','1','G')},{item_id:'200',model_id:'2',catalog_binding:normalized('200','2','GG')},{item_id:'300',model_id:'3',catalog_binding:{...normalized('300','3'),source:'UNVERIFIED'}}];");
 assert.equal(run("currentBindingMap().get('100:1').size"),'M');assert.equal(run("currentBindingMap().get('200:2').size"),'GG');assert.equal(run("currentBindingMap().has('300:3')"),false);assert.equal(run('bindingState.bindings.length'),1);
});
