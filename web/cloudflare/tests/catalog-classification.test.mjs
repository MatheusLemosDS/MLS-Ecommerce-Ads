import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {projectVariantCatalog} from '../../finance/src/variant-catalog-frame.mjs';
import {enqueueCatalogClassifications,enqueueSoldCatalogGaps,runCatalogClassifications,readCatalogClassificationState,readCatalogClassificationFence,storeCatalogClassificationFrame,catalogClassificationQueries,catalogClassificationsFromSnapshot,CatalogClassificationError} from '../src/catalog-classification.mjs';
import {runProductRegistry} from '../src/product-registry.mjs';
import {productionCostReference,COST_DEFAULTS} from '../src/production-costs.mjs';

const initial=Date.UTC(2026,9,25,12)/1000;
const environment=()=>({ADMIN_DB:new D1()});
function providerFrame({item='101',at=initial,count=1,kit=false,unresolved=false,first=1,name='Camiseta adulta',fingerprint='a'.repeat(64)}={}){
 const variants=Array.from({length:count},(_,index)=>({model_id:String(index+first),attributes:kit?[{name:'Tamanho Feminino',value:'MULHER M'},{name:'Tamanho Masculino',value:'HOMEM G'}]:[{name:'Tamanho',value:unresolved?'4':'M'}]}));
 const bindings=unresolved?[]:variants.map(variant=>({item_id:item,model_id:variant.model_id,...(kit?{male_size:'G',female_size:'M'}:{size:'M'})}));
 const frame={schema:'variant_catalog_v1',checked_at:at,products:[{item_id:item,catalog_fingerprint:fingerprint,bindings,unresolved_count:unresolved?count:0,...(kit?{}:{selling_unit:'SINGLE_GARMENT'}),cost_catalog:{schema:'product_cost_catalog_v1',product_name:name,variants}}]};
 assert.ok(projectVariantCatalog(frame));return frame;
}
const failure=code=>error=>error instanceof CatalogClassificationError&&error.message===code;
const snapshot=async(env,ids,sourceItems=null)=>catalogClassificationsFromSnapshot(await env.ADMIN_DB.batch(catalogClassificationQueries(env.ADMIN_DB,ids,sourceItems)));
const state=(env,options={},at=initial)=>readCatalogClassificationState(env,options,{now:()=>at*1000});

test('a newly sold missing model gets one targeted check despite a MATCHED catalogue and an unchanged daily index',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());let stamp=initial,now=()=>stamp*1000;
 await storeCatalogClassificationFrame(env,providerFrame(),{now});
 const read=()=>env.ADMIN_DB.db.prepare("SELECT * FROM catalog_classification_jobs WHERE item_id='101'").get();assert.equal(read().next_attempt_at,initial+86400);
 const gaps=[{item_id:'101',model_id:'2',quantity:2},{item_id:'101',model_id:'1',quantity:1}];
 const first=await enqueueSoldCatalogGaps(env,gaps,{now});assert.deepEqual(first.products,[{item_id:'101',reason:'CATALOG_MODEL_MISSING',model_ids:['2'],scheduled:true}]);assert.deepEqual(first.scheduled_item_ids,['101']);assert.equal(read().reason,'CATALOG_SOLD_MODEL_MISSING');assert.equal(read().next_attempt_at,0);
 const saved=await snapshot(env,['101']),price=productionCostReference({status:'AVAILABLE',rows:[{item_id:'101',model_id:'1',quantity:1}]},{revision:1,bindings:[]},{revision:1,values:COST_DEFAULTS},{catalog_bindings:saved.bindings,classified_item_ids:['101']});assert.equal(price.total_cents,1590);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM catalog_classification_changes').get().n,0);
 await runProductRegistry(env,async(_,selection)=>({schema:'product_index_v1',status:'AVAILABLE',shop_id:1178167501,checked_at:stamp,...selection,total_count:1,has_more:false,next_offset:null,items:[{item_id:'101',item_status:selection.item_status,source_update_time:initial-100}]}),{now});assert.equal(read().next_attempt_at,0,'an unchanged index cannot postpone the specific missing-model check');
 stamp++;const calls=[],result=await runCatalogClassifications(env,async(_,input)=>{calls.push(input.item_ids[0]);return providerFrame({at:stamp,count:2,fingerprint:'b'.repeat(64)});},{now,maxProducts:1,itemIds:['101']});assert.deepEqual(result.processed,['101']);assert.deepEqual(calls,['101']);assert.deepEqual((await enqueueSoldCatalogGaps(env,gaps,{now})).products,[]);assert.equal((await snapshot(env,['101'])).variants.length,2);
});

test('a removed historical model does not loop on reads or quantity changes while new pairs and a real catalogue change permit one new check',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());let stamp=initial,now=()=>stamp*1000;await storeCatalogClassificationFrame(env,providerFrame(),{now});const gaps=[{item_id:'101',model_id:'2',quantity:1}],read=()=>env.ADMIN_DB.db.prepare("SELECT * FROM catalog_classification_jobs WHERE item_id='101'").get();let calls=0;
 assert.deepEqual((await enqueueSoldCatalogGaps(env,gaps,{now})).scheduled_item_ids,['101']);stamp++;
 await runCatalogClassifications(env,async()=>{calls++;return providerFrame({at:stamp});},{now,maxProducts:1,itemIds:['101']});const next=read().next_attempt_at;
 for(const quantity of [1,2,7]){assert.deepEqual((await enqueueSoldCatalogGaps(env,[{...gaps[0],quantity}],{now})).scheduled_item_ids,[]);await runCatalogClassifications(env,async()=>{calls++;throw Error('must not retry');},{now,maxProducts:1,itemIds:['101']});}assert.equal(calls,1);assert.equal(read().next_attempt_at,next);
 const freshPair=[...gaps,{item_id:'101',model_id:'3',quantity:1}];assert.deepEqual((await enqueueSoldCatalogGaps(env,freshPair,{now})).scheduled_item_ids,['101']);stamp++;await runCatalogClassifications(env,async()=>{calls++;return providerFrame({at:stamp});},{now,maxProducts:1,itemIds:['101']});assert.deepEqual((await enqueueSoldCatalogGaps(env,gaps,{now})).scheduled_item_ids,[],'returning to an older missing subset does not bypass its durable attempt');
 stamp++;await storeCatalogClassificationFrame(env,providerFrame({at:stamp,fingerprint:'c'.repeat(64)}),{now});assert.deepEqual((await enqueueSoldCatalogGaps(env,gaps,{now})).scheduled_item_ids,['101']);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM catalog_classification_sold_gaps').get().n,3);
});

test('gap recovery leaves leased jobs and provider backoffs intact and the scoped runner never consumes unrelated global work',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());let stamp=initial,now=()=>stamp*1000;await storeCatalogClassificationFrame(env,providerFrame(),{now});const lease=crypto.randomUUID(),gaps=[{item_id:'101',model_id:'2',quantity:1}];
 env.ADMIN_DB.db.prepare("UPDATE catalog_classification_jobs SET status='RUNNING',lease_token=?,lease_until=? WHERE item_id='101'").run(lease,stamp+180);const before=env.ADMIN_DB.db.prepare("SELECT * FROM catalog_classification_jobs WHERE item_id='101'").get();assert.deepEqual((await enqueueSoldCatalogGaps(env,gaps,{now})).scheduled_item_ids,[]);assert.deepEqual(env.ADMIN_DB.db.prepare("SELECT * FROM catalog_classification_jobs WHERE item_id='101'").get(),before);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM catalog_classification_sold_gaps').get().n,0);
 env.ADMIN_DB.db.prepare("UPDATE catalog_classification_jobs SET status='RETRY_WAIT',reason='CATALOG_UNAVAILABLE',failure_count=2,next_attempt_at=?,lease_token=NULL,lease_until=NULL WHERE item_id='101'").run(stamp+600);assert.deepEqual((await enqueueSoldCatalogGaps(env,gaps,{now})).scheduled_item_ids,[]);assert.equal(env.ADMIN_DB.db.prepare("SELECT next_attempt_at FROM catalog_classification_jobs WHERE item_id='101'").get().next_attempt_at,stamp+600);
 stamp+=600;assert.deepEqual((await enqueueSoldCatalogGaps(env,gaps,{now})).scheduled_item_ids,['101']);await enqueueCatalogClassifications(env,['1','2'],{now,returnState:false});const calls=[];const result=await runCatalogClassifications(env,async(_,input)=>{calls.push(input.item_ids[0]);throw Error('temporary');},{now,maxProducts:1,itemIds:['101']});assert.deepEqual(result.failed,['101']);assert.deepEqual(calls,['101']);const failed=env.ADMIN_DB.db.prepare("SELECT * FROM catalog_classification_jobs WHERE item_id='101'").get();assert.equal(failed.failure_count,3);assert.equal(failed.next_attempt_at,stamp+1200);assert.deepEqual((await enqueueSoldCatalogGaps(env,gaps,{now})).scheduled_item_ids,[]);assert.equal(env.ADMIN_DB.db.prepare("SELECT next_attempt_at FROM catalog_classification_jobs WHERE item_id='101'").get().next_attempt_at,failed.next_attempt_at);
 const none=await runCatalogClassifications(env,async()=>{throw Error('unrelated work');},{now,maxProducts:1,itemIds:[]});assert.equal(none.status,'IDLE');
 for(const itemIds of [['bad'],Array.from({length:91},(_,index)=>String(index+1)),['101','101']])await assert.rejects(runCatalogClassifications(env,async()=>{}, {now,itemIds}),failure('CATALOG_CLASSIFICATION_OPTIONS_INVALID'));
});

test('invalid gap requests never invoke accessors or mutate the persistent queue',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());await state(env);let called=0;const row={item_id:'101',model_id:'0',quantity:1};Object.defineProperty(row,'quantity',{enumerable:true,get(){called++;return 1;}});
 for(const variants of [[row],[{item_id:'101',model_id:'0',quantity:0}],[{item_id:'101',model_id:'0',quantity:1,extra:'private'}],[{item_id:'101',model_id:'0',quantity:1},{item_id:'101',model_id:'0',quantity:2}]])await assert.rejects(enqueueSoldCatalogGaps(env,variants),failure('CATALOG_CLASSIFICATION_REQUEST_INVALID'));assert.equal(called,0);assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM catalog_classification_jobs').get().n,0);
});

test('background discovery queues a large catalogue in one D1 request without reading a presentation snapshot',async t=>{
 class CountedD1 extends D1 {
  requests=0;insideBatch=0;
  prepare(sql){const statement=super.prepare(sql);for(const method of ['run','first','all']){const original=statement[method];statement[method]=async(...args)=>{if(!this.insideBatch)this.requests++;return original.apply(statement,args);};}return statement;}
  async batch(statements){this.requests++;this.insideBatch++;try{return await super.batch(statements);}finally{this.insideBatch--;}}
 }
 const env={ADMIN_DB:new CountedD1()};t.after(()=>env.ADMIN_DB.db.close());await state(env);
 const ids=Array.from({length:181},(_,index)=>String(index+100));env.ADMIN_DB.requests=0;
 assert.equal(await enqueueCatalogClassifications(env,ids,{now:()=>initial*1000,returnState:false}),null);
 assert.equal(env.ADMIN_DB.requests,1,'all insertion chunks share one D1 batch and no unused preview is queried');
 assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM catalog_classification_jobs').get().n,181);
 env.ADMIN_DB.requests=0;
 const publicState=await enqueueCatalogClassifications(env,ids,{now:()=>initial*1000});
 assert.equal(env.ADMIN_DB.requests,2);assert.equal(publicState.schema,'catalog_classification_state_v1');assert.equal(publicState.counts.total,181);assert.equal(publicState.counts.queued,181);assert.equal(publicState.products.length,20);
 await assert.rejects(enqueueCatalogClassifications(env,ids,{returnState:'false'}),failure('CATALOG_CLASSIFICATION_REQUEST_INVALID'));
});

test('repeated priority discovery performs no writes while a new priority still advances the queue',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());const ids=['101','102'];
 await enqueueCatalogClassifications(env,ids,{now:()=>initial*1000,returnState:false,priorityItemIds:['101']});
 const changes=()=>env.ADMIN_DB.db.prepare('SELECT total_changes() AS n').get().n,rows=()=>env.ADMIN_DB.db.prepare('SELECT * FROM catalog_classification_jobs ORDER BY item_id').all().map(row=>({...row})),before=rows();
 for(const seconds of [0,60,300]){
  const previous=changes();await enqueueCatalogClassifications(env,ids,{now:()=>(initial+seconds)*1000,returnState:false,priorityItemIds:['101']});
  assert.equal(changes()-previous,0,'unchanged discoveries must not consume row writes');assert.deepEqual(rows(),before);
 }
 const previous=changes();await enqueueCatalogClassifications(env,ids,{now:()=>(initial+360)*1000,returnState:false,priorityItemIds:ids});
 assert.equal(changes()-previous,1,'only the newly prioritized job is updated');assert.deepEqual(rows(),[before[0],{...before[1],next_attempt_at:0}]);
});

test('a sold product missing its cost moves ahead of one hundred untouched jobs without resetting a failed request backoff',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());const known=Array.from({length:100},(_,index)=>String(index+100)),ids=[...known,'1001'];
 await enqueueCatalogClassifications(env,ids,{now:()=>initial*1000,returnState:false});
 await enqueueCatalogClassifications(env,ids,{now:()=>initial*1000,returnState:false,priorityItemIds:['1001']});
 const read=()=>env.ADMIN_DB.db.prepare('SELECT * FROM catalog_classification_jobs WHERE item_id=?').get('1001');
 assert.equal(read().next_attempt_at,0);assert.equal(env.ADMIN_DB.db.prepare('SELECT next_attempt_at FROM catalog_classification_jobs WHERE item_id=?').get('100').next_attempt_at,initial);
 const calls=[],source=async(_,input)=>{const item=input.item_ids[0];calls.push(item);if(item==='1001')throw Error('PRIVATE_RATE_FAILURE');return providerFrame({item});};
 const first=await runCatalogClassifications(env,source,{now:()=>initial*1000,maxProducts:1});assert.deepEqual(first.failed,['1001']);assert.deepEqual(calls,['1001']);
 const failed={...read()};assert.equal(failed.status,'RETRY_WAIT');assert.equal(failed.next_attempt_at,initial+300);assert.equal(failed.failure_count,1);
 await enqueueCatalogClassifications(env,ids,{now:()=>initial*1000,returnState:false,priorityItemIds:['1001']});assert.deepEqual({...read()},failed);
 await runCatalogClassifications(env,source,{now:()=>initial*1000,maxProducts:1});assert.deepEqual(calls,['1001','100']);
 await assert.rejects(enqueueCatalogClassifications(env,known,{priorityItemIds:['1001']}),failure('CATALOG_CLASSIFICATION_REQUEST_INVALID'));
});

test('priority discovery cannot reclaim a queued lease or clear previous attempt and failure guards',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());const ids=['101','102','103'];await enqueueCatalogClassifications(env,ids,{now:()=>initial*1000,returnState:false});
 env.ADMIN_DB.db.prepare('UPDATE catalog_classification_jobs SET lease_token=?,lease_until=? WHERE item_id=?').run('11111111-1111-4111-8111-111111111111',initial+180,'101');
 env.ADMIN_DB.db.prepare('UPDATE catalog_classification_jobs SET failure_count=1 WHERE item_id=?').run('102');env.ADMIN_DB.db.prepare('UPDATE catalog_classification_jobs SET last_attempt_at=? WHERE item_id=?').run(initial,'103');
 const rows=()=>env.ADMIN_DB.db.prepare('SELECT * FROM catalog_classification_jobs ORDER BY item_id').all(),before=rows();
 await enqueueCatalogClassifications(env,ids,{now:()=>initial*1000,returnState:false,priorityItemIds:ids});assert.deepEqual(rows(),before);
});

test('one unattended queue stores adult and kit compositions while preserving unresolved child metadata and existing manual bindings',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());
 env.ADMIN_DB.db.exec("CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,payload TEXT);INSERT INTO variant_bindings_state VALUES(1,'MANUAL_UNCHANGED')");
 await enqueueCatalogClassifications(env,['101','102','103'],{now:()=>initial*1000});
 const calls=[];
 const result=await runCatalogClassifications(env,async(binding,input)=>{calls.push(input);return providerFrame({item:input.item_ids[0],kit:input.item_ids[0]==='102',unresolved:input.item_ids[0]==='103',name:input.item_ids[0]==='103'?'Camiseta infantil':'Camiseta'});},{now:()=>initial*1000});
 assert.equal(result.status,'PROGRESSED');assert.deepEqual(result.processed,['101','102','103']);assert.deepEqual(result.failed,[]);
 assert.ok(calls.every(row=>row.item_ids.length===1&&row.selling_unit==='AUTO'&&row.include_cost_catalog===true));
 const values=await snapshot(env,['101','102','103']);assert.equal(values.bindings.length,2);assert.equal(values.bindings[0].selling_unit,'SINGLE_GARMENT');assert.equal(values.bindings[1].selling_unit,'ONE_MALE_ONE_FEMALE_KIT');assert.equal(values.bindings[1].male_size,'G');assert.equal(values.bindings[1].female_size,'M');
 assert.equal(values.variants.find(row=>row.item_id==='103').model_name,'4');assert.equal(values.products.find(row=>row.item_id==='103').status,'REVIEW');
 assert.equal(env.ADMIN_DB.db.prepare('SELECT payload FROM variant_bindings_state').get().payload,'MANUAL_UNCHANGED');
 assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM production_cost_catalog').get().n,3);
});

test('a failed first product backs off independently and never prevents later products from being classified',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());await enqueueCatalogClassifications(env,['101','102','103','104'],{now:()=>initial*1000});
 const calls=[],source=async(binding,input)=>{const item=input.item_ids[0];calls.push(item);if(item==='101')throw Error('PRIVATE_PROVIDER_ACCESS_TOKEN');return providerFrame({item});};
 const first=await runCatalogClassifications(env,source,{now:()=>initial*1000});assert.deepEqual(first.failed,['101']);assert.deepEqual(first.processed,['102','103']);
 const second=await runCatalogClassifications(env,source,{now:()=>initial*1000});assert.deepEqual(second.processed,['104']);assert.equal(calls.filter(item=>item==='101').length,1);
 const report=await state(env);assert.equal(report.products[0].status,'RETRY_WAIT');assert.equal(report.products[0].next_attempt_at,initial+300);assert.ok(!JSON.stringify(report).includes('PRIVATE_PROVIDER_ACCESS_TOKEN'));
 for(const [seconds,delay] of [[300,600],[900,1200],[2100,1800]]){const result=await runCatalogClassifications(env,source,{now:()=>1000*(initial+seconds),maxProducts:1});assert.deepEqual(result.failed,['101']);assert.equal(result.state.products[0].next_attempt_at,initial+seconds+delay);}
});

test('three thousand queued products remain bounded and thirty classified products retain their costs beyond fifteen minutes',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());const ids=Array.from({length:3000},(_,index)=>String(index+100));
 await enqueueCatalogClassifications(env,ids,{now:()=>initial*1000});
 for(let tick=0;tick<10;tick++)await runCatalogClassifications(env,async(binding,input)=>providerFrame({item:input.item_ids[0]}),{now:()=>initial*1000});
 const report=await state(env,{limit:100},initial+901);assert.equal(report.counts.total,3000);assert.equal(report.counts.matched,30);assert.equal(report.counts.queued,2970);
 const values=await snapshot(env,ids.slice(0,30));assert.equal(values.bindings.length,30);assert.equal(values.bindings.every(row=>row.operator_confirmed===false),true);
 const due=await state(env,{item_ids:ids.slice(0,30)},initial+86399);assert.equal(due.counts.due,0);assert.equal((await state(env,{item_ids:ids.slice(0,30)},initial+86400)).counts.due,30);
});

test('normalized compositions exceed the old global thousand-link cap while public previews and financial pair queries stay bounded',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());
 await storeCatalogClassificationFrame(env,providerFrame({item:'101',count:1000}),{now:()=>initial*1000});await storeCatalogClassificationFrame(env,providerFrame({item:'102',count:1000}),{now:()=>initial*1000});
 const values=await snapshot(env,['101','102']);assert.equal(values.bindings.length,2000);
 const selected=await snapshot(env,['101','102'],[{item_id:'101',model_id:'999',quantity:1},{item_id:'102',model_id:'1000',quantity:2}]);assert.deepEqual(selected.bindings.map(row=>[row.item_id,row.model_id]),[['101','999'],['102','1000']]);
 const publicState=await state(env);assert.equal(publicState.variants_limit_reached,true);assert.equal(publicState.products.reduce((sum,row)=>sum+row.variants.length,0),1000);assert.equal(publicState.products[1].variants_complete,false);
});

test('fresh revalidation keeps the semantic revision stable and a confirmed catalogue change replaces removed models atomically',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());
 await storeCatalogClassificationFrame(env,providerFrame({count:2}),{now:()=>initial*1000});const first=await state(env);
 await storeCatalogClassificationFrame(env,providerFrame({count:2,at:initial+1}),{now:()=>(initial+1)*1000});assert.equal((await state(env)).revision,first.revision);
 const fence=await readCatalogClassificationFence(env,['101']);
 await storeCatalogClassificationFrame(env,providerFrame({count:1,first:3,at:initial+1,fingerprint:'b'.repeat(64)}),{now:()=>(initial+1)*1000,fence});
 const changed=await snapshot(env,['101']);assert.equal(changed.revision,first.revision+1);assert.deepEqual(changed.bindings.map(row=>row.model_id),['3']);
 await assert.rejects(storeCatalogClassificationFrame(env,providerFrame({count:2,at:initial+1}),{now:()=>(initial+1)*1000,fence}),failure('CATALOG_CLASSIFICATION_CHANGED_RETRY'));
 await assert.rejects(storeCatalogClassificationFrame(env,providerFrame({count:2,at:initial+1}),{now:()=>(initial+1)*1000}),failure('CATALOG_CLASSIFICATION_CONFLICT'));
 assert.deepEqual((await snapshot(env,['101'])).bindings.map(row=>row.model_id),['3']);
});

test('an older provider response cannot resurrect an obsolete interpretation or replace a newer cost catalogue',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());await storeCatalogClassificationFrame(env,providerFrame({at:initial+2,first:3}),{now:()=>(initial+2)*1000});
 const result=await storeCatalogClassificationFrame(env,providerFrame(),{now:()=>(initial+2)*1000});assert.deepEqual(result.processed,[]);assert.deepEqual((await snapshot(env,['101'])).bindings.map(row=>row.model_id),['3']);
 const cache=JSON.parse(env.ADMIN_DB.db.prepare('SELECT payload FROM production_cost_catalog').get().payload);assert.equal(cache.variants[0].model_id,'3');
});

test('one active lease excludes another runner and an external legacy feed until the in-flight product finishes',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());await enqueueCatalogClassifications(env,['101','102'],{now:()=>initial*1000});
 let release,started;const began=new Promise(resolve=>{started=resolve;});
 const first=runCatalogClassifications(env,async()=>{started();return new Promise(resolve=>{release=resolve;});},{now:()=>initial*1000,maxProducts:1});await began;
 const second=await runCatalogClassifications(env,async()=>{throw Error('DUPLICATE_PROVIDER_READ');},{now:()=>initial*1000});assert.equal(second.status,'LEASED');
 await assert.rejects(storeCatalogClassificationFrame(env,providerFrame(),{now:()=>initial*1000}),failure('CATALOG_CLASSIFICATION_LEASED'));
 release(providerFrame());assert.equal((await first).status,'PROGRESSED');assert.equal((await state(env)).counts.matched,1);
});

test('pause prevents provider reads and a policy change during one read stops the following product without discarding its response',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());await enqueueCatalogClassifications(env,['101','102'],{now:()=>initial*1000});let enabled=false,calls=0;
 const source=async(binding,input)=>{calls++;enabled=false;return providerFrame({item:input.item_ids[0]});};
 assert.equal((await runCatalogClassifications(env,source,{now:()=>initial*1000,canRun:async()=>enabled})).status,'PAUSED');assert.equal(calls,0);
 enabled=true;const run=await runCatalogClassifications(env,source,{now:()=>initial*1000,canRun:async()=>enabled});assert.equal(run.status,'PAUSED');assert.deepEqual(run.processed,['101']);assert.equal(calls,1);assert.equal((await state(env)).counts.queued,1);
});

test('failed normalized persistence rolls back catalogue, classifications and revision while returning only a safe error',async t=>{
 class FailingD1 extends D1{prepare(sql){const statement=super.prepare(sql);if(this.fail&&sql.startsWith('INSERT INTO catalog_classification_variants'))statement.run=async()=>{throw Error('PRIVATE_PROVIDER_SECRET');};return statement;}}
 const env={ADMIN_DB:new FailingD1()};t.after(()=>env.ADMIN_DB.db.close());await storeCatalogClassificationFrame(env,providerFrame(),{now:()=>initial*1000});const before=await state(env),cache=env.ADMIN_DB.db.prepare('SELECT payload FROM production_cost_catalog').get().payload;
 env.ADMIN_DB.fail=true;await assert.rejects(storeCatalogClassificationFrame(env,providerFrame({at:initial+1,first:3}),{now:()=>(initial+1)*1000}),failure('CATALOG_CLASSIFICATION_UNAVAILABLE'));env.ADMIN_DB.fail=false;
 assert.deepEqual(await state(env),before);assert.equal(env.ADMIN_DB.db.prepare('SELECT payload FROM production_cost_catalog').get().payload,cache);
});

test('malformed selectors, accessors, provider private extras and corrupt stored classifications fail closed',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());let getters=0;const ids=['101'];Object.defineProperty(ids,'0',{get(){getters++;return '101';}});
 await assert.rejects(enqueueCatalogClassifications(env,ids,{now:()=>initial*1000}),failure('CATALOG_CLASSIFICATION_REQUEST_INVALID'));assert.equal(getters,0);
 for(const input of [{limit:101},{offset:-1},{item_ids:['bad']},{shop_id:'OTHER'}])await assert.rejects(state(env,input),failure('CATALOG_CLASSIFICATION_REQUEST_INVALID'));
 await assert.rejects(storeCatalogClassificationFrame(env,{...providerFrame(),access_token:'PRIVATE_PROVIDER_TOKEN'},{now:()=>initial*1000}),failure('CATALOG_CLASSIFICATION_INVALID'));
 await storeCatalogClassificationFrame(env,providerFrame(),{now:()=>initial*1000});env.ADMIN_DB.db.exec("UPDATE catalog_classification_variants SET payload='{}'");
 await assert.rejects(state(env),failure('CATALOG_CLASSIFICATION_STORAGE_INVALID'));await assert.rejects(snapshot(env,['101']),failure('CATALOG_CLASSIFICATION_STORAGE_INVALID'));
});

test('a deleted semantic revision cannot be recreated over existing classifications or audit on a reopened database',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());await storeCatalogClassificationFrame(env,providerFrame(),{now:()=>initial*1000});
 env.ADMIN_DB.db.exec('DELETE FROM catalog_classification_state');
 const reopened={ADMIN_DB:{prepare:sql=>env.ADMIN_DB.prepare(sql),batch:statements=>env.ADMIN_DB.batch(statements)}};
 await assert.rejects(state(reopened),failure('CATALOG_CLASSIFICATION_STORAGE_INVALID'));
 assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM catalog_classification_state').get().n,0);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) AS n FROM catalog_classification_variants').get().n,1);
});

test('the one validated catalogue diagnostic is preserved for product and variation explanations without copying provider payloads',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());const frame=providerFrame({unresolved:true,name:'Camiseta infantil'});
 frame.products[0].diagnostic={axes:[{name:'Tamanho',options:['4'],option_count:1}],model_count:1,reasons:[{code:'OPTION_NOT_RECOGNIZED',count:1}]};assert.ok(projectVariantCatalog(frame));
 await storeCatalogClassificationFrame(env,frame,{now:()=>initial*1000});const report=await state(env);assert.equal(report.products[0].reason,'OPTION_NOT_RECOGNIZED');assert.equal(report.products[0].variants[0].reason,'OPTION_NOT_RECOGNIZED');
});

test('a valid response shape cannot claim a garment size contradicting its named catalogue option',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());const frame=providerFrame();frame.products[0].bindings[0].size='G';assert.ok(projectVariantCatalog(frame));
 await assert.rejects(storeCatalogClassificationFrame(env,frame,{now:()=>initial*1000}),failure('CATALOG_CLASSIFICATION_INVALID'));
 assert.equal((await state(env)).counts.total,0);
});

test('a later lease owner cannot be overwritten by the delayed response of an expired worker',async t=>{
 const env=environment();t.after(()=>env.ADMIN_DB.db.close());let at=initial,release,started;const began=new Promise(resolve=>{started=resolve;});await enqueueCatalogClassifications(env,['101'],{now:()=>at*1000});
 const first=runCatalogClassifications(env,async()=>{started();return new Promise(resolve=>{release=resolve;});},{now:()=>at*1000,maxProducts:1});await began;
 at+=181;const newer=await runCatalogClassifications(env,async()=>providerFrame({at,first:3}),{now:()=>at*1000,maxProducts:1});assert.deepEqual(newer.processed,['101']);
 release(providerFrame());await first;assert.deepEqual((await snapshot(env,['101'])).bindings.map(row=>row.model_id),['3']);assert.equal((await state(env,{},at)).products[0].checked_at,at);
});
