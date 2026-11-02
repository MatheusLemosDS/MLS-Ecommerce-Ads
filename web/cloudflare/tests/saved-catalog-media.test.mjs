import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {storeCatalogClassificationFrame,enqueueCatalogClassifications,runCatalogClassifications} from '../src/catalog-classification.mjs';
import {readSavedCatalogMedia,projectSavedCatalogMedia,enqueueMissingCatalogMedia} from '../src/saved-catalog-media.mjs';
import {CATALOG_MEDIA_FIXTURE_TIME as start,CATALOG_MEDIA_FIXTURE_PHOTO as photo,catalogMediaFixture,catalogMediaLegacyFixture} from '../../finance/tests/catalog-media-fixture.mjs';

class ObservedD1 extends D1{
 constructor(){super();this.sql=[];this.rpc=0;this.failPhoto=null;this.injected=false;}
 prepare(sql){this.sql.push(sql);const statement=super.prepare(sql),run=statement.run.bind(statement);statement.sql=sql;statement.run=async()=>{if(!this.injected&&this.failPhoto&&sql.startsWith(this.failPhoto)){this.injected=true;throw Error('SYNTHETIC_OPTIONAL_PHOTO_FAILURE');}return run();};return statement;}
 async batch(rows){this.rpc++;return super.batch(rows);}
}
const coreSnapshot=db=>({catalog:db.db.prepare('SELECT item_id,catalog_fingerprint,payload,checked_at FROM production_cost_catalog ORDER BY item_id').all().map(row=>({...row})),variants:db.db.prepare('SELECT * FROM catalog_classification_variants ORDER BY item_id,model_id').all().map(row=>({...row})),job:db.db.prepare('SELECT item_id,status,product_name,reason,checked_at,catalog_fingerprint,source_hash,model_count,resolved_count,next_attempt_at,failure_count FROM catalog_classification_jobs ORDER BY item_id').all().map(row=>({...row})),revision:db.db.prepare('SELECT revision FROM catalog_classification_state').get().revision});

test('cold photo reader uses SELECT only and never treats absent media as an invented image',async t=>{
 const db=new ObservedD1();t.after(()=>db.db.close());const value=await readSavedCatalogMedia({ADMIN_DB:db},['101'],{now:()=>start*1000});
 assert.ok(projectSavedCatalogMedia(value));assert.equal(value.products[0].state,'NOT_CAPTURED');assert.equal(value.products[0].image_url,null);assert.equal(value.products[0].source_checked_at,null);assert.ok(db.sql.every(sql=>/^SELECT\b/.test(sql)));assert.equal(db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);
});

test('captured current photo is separate from exact legacy catalogue and classification bytes',async t=>{
 const db=new ObservedD1(),legacyDb=new ObservedD1();t.after(()=>{db.db.close();legacyDb.db.close();});const now=()=>start*1000;
 await storeCatalogClassificationFrame({ADMIN_DB:db},catalogMediaFixture(),{now});await storeCatalogClassificationFrame({ADMIN_DB:legacyDb},catalogMediaLegacyFixture(),{now});assert.deepEqual(coreSnapshot(db),coreSnapshot(legacyDb));
 db.sql.length=0;const value=await readSavedCatalogMedia({ADMIN_DB:db},['101','999'],{now});assert.ok(projectSavedCatalogMedia(value));assert.equal(value.products[0].image_url,photo);assert.equal(value.products[0].state,'AVAILABLE');assert.equal(value.products[0].basis,'CURRENT_PRODUCT_PHOTO_NOT_PRINT_ARTWORK');assert.equal(value.products[1].state,'NOT_CAPTURED');assert.ok(db.sql.every(sql=>/^SELECT\b/.test(sql)));
});

test('new missing media and newer legacy observations cannot retain an old current photo silently',async t=>{
 for(const mode of ['missing','invalid','legacy']){
  const db=new ObservedD1();t.after(()=>db.db.close());let stamp=start;const now=()=>stamp*1000;await storeCatalogClassificationFrame({ADMIN_DB:db},catalogMediaFixture(),{now});stamp++;
  await storeCatalogClassificationFrame({ADMIN_DB:db},mode==='legacy'?catalogMediaLegacyFixture({at:stamp}):catalogMediaFixture({at:stamp,state:mode==='missing'?'NOT_CAPTURED':'INVALID'}),{now});
  const value=await readSavedCatalogMedia({ADMIN_DB:db},['101'],{now});assert.equal(value.products[0].state,mode==='invalid'?'INVALID':'NOT_CAPTURED',mode);assert.equal(value.products[0].image_url,null);
 }
});

test('tampered payload, source fingerprint and source clock never display a saved photo',async t=>{
 const db=new ObservedD1();t.after(()=>db.db.close());const env={ADMIN_DB:db},now=()=>start*1000;
 for(const change of ["UPDATE catalog_product_media SET payload=replace(payload,'SYNTHETIC-product-photo','SYNTHETIC-other-photo')","UPDATE catalog_product_media SET catalog_fingerprint='"+'b'.repeat(64)+"'","UPDATE catalog_product_media SET checked_at=checked_at+1"]){
  await storeCatalogClassificationFrame(env,catalogMediaFixture(),{now});db.db.exec(change);const value=await readSavedCatalogMedia(env,['101'],{now});assert.notEqual(value.products[0].state,'AVAILABLE');assert.equal(value.products[0].image_url,null);
 }
});

test('optional photo CREATE and INSERT failures preserve the legacy catalogue transaction and do not retry the provider',async t=>{
 for(const prefix of ['CREATE TABLE IF NOT EXISTS catalog_product_media','INSERT INTO catalog_product_media']){
  const db=new ObservedD1();t.after(()=>db.db.close());const env={ADMIN_DB:db},now=()=>start*1000;await enqueueCatalogClassifications(env,['101'],{now,returnState:false});db.failPhoto=prefix;let calls=0;
  const result=await runCatalogClassifications(env,async(_,body,options)=>{calls++;assert.equal(options.includeMedia,true);assert.deepEqual(body,{item_ids:['101'],selling_unit:'AUTO',include_cost_catalog:true});return catalogMediaFixture();},{now,maxProducts:1});
  assert.deepEqual(result.processed,['101']);assert.deepEqual(result.failed,[]);assert.equal(calls,1);assert.equal(db.injected,true);assert.equal(db.db.prepare("SELECT payload FROM production_cost_catalog WHERE item_id='101'").get().payload,JSON.stringify(catalogMediaLegacyFixture().products[0].cost_catalog));const value=await readSavedCatalogMedia(env,['101'],{now});assert.equal(value.products[0].state,'NOT_CAPTURED');assert.equal(value.products[0].image_url,null);
 }
});

test('successful media capture adds no D1 batch calls to the scheduled legacy catalogue path',async t=>{
 const db=new ObservedD1(),old=new ObservedD1();t.after(()=>{db.db.close();old.db.close();});const now=()=>start*1000;
 for(const target of [db,old])await enqueueCatalogClassifications({ADMIN_DB:target},['101'],{now,returnState:false});const before=[db.rpc,old.rpc];let photoCalls=0,oldCalls=0;
 await runCatalogClassifications({ADMIN_DB:db},async()=>{photoCalls++;return catalogMediaFixture();},{now,maxProducts:1});await runCatalogClassifications({ADMIN_DB:old},async()=>{oldCalls++;return catalogMediaLegacyFixture();},{now,maxProducts:1});
 assert.equal(db.rpc-before[0],old.rpc-before[1]);assert.equal(photoCalls,oldCalls);assert.deepEqual(coreSnapshot(db),coreSnapshot(old));
});

test('media priority schedules at most three existing jobs once per fingerprint without a source call',async t=>{
 const db=new ObservedD1();t.after(()=>db.db.close());let stamp=start;const now=()=>stamp*1000,env={ADMIN_DB:db};
 for(const item of ['101','102','103','104','105'])await storeCatalogClassificationFrame(env,catalogMediaLegacyFixture({item}),{now});
 const before=coreSnapshot(db),rpc=db.rpc;const result=await enqueueMissingCatalogMedia(env,{limit:3,now});assert.deepEqual(result.scheduled_item_ids,['101','102','103']);assert.equal(db.rpc-rpc,2,'one schema batch and one guarded queue batch; candidate read is a SELECT');
 assert.equal(db.db.prepare('SELECT COUNT(*) n FROM catalog_media_priorities').get().n,3);
 const after=coreSnapshot(db);assert.deepEqual({...after,job:after.job.map((row,i)=>({...row,next_attempt_at:before.job[i].next_attempt_at}))},before,'only existing eligibility times change');
 assert.deepEqual((await enqueueMissingCatalogMedia(env,{itemIds:['101','102','103'],now})).scheduled_item_ids,[]);
 let reads=0;await runCatalogClassifications(env,async(_,selection)=>{reads++;return catalogMediaLegacyFixture({item:selection.item_ids[0],at:stamp});},{now,maxProducts:3});assert.equal(reads,3);
 stamp++;assert.deepEqual((await enqueueMissingCatalogMedia(env,{itemIds:['101','102','103'],now})).scheduled_item_ids,[],'a mixed old worker without photos cannot trigger another early read');
 await storeCatalogClassificationFrame(env,catalogMediaLegacyFixture({item:'101',at:stamp,fingerprint:'b'.repeat(64)}),{now});assert.deepEqual((await enqueueMissingCatalogMedia(env,{itemIds:['101'],now})).scheduled_item_ids,['101'],'new source identity permits one new priority');
});

test('any valid current photo observation is an attempt, while live leases, backoffs and metadata changes are preserved',async t=>{
 const db=new ObservedD1();t.after(()=>db.db.close());const now=()=>start*1000,env={ADMIN_DB:db};
 for(const [index,state] of ['AVAILABLE','NOT_CAPTURED','INVALID'].entries())await storeCatalogClassificationFrame(env,catalogMediaFixture({item:String(101+index),state}),{now});
 for(const item of ['104','105','106'])await storeCatalogClassificationFrame(env,catalogMediaLegacyFixture({item}),{now});
 db.db.prepare("UPDATE catalog_classification_jobs SET lease_token=?,lease_until=? WHERE item_id='104'").run(crypto.randomUUID(),start+180);
 db.db.prepare("UPDATE catalog_classification_jobs SET status='RETRY_WAIT',failure_count=2,reason='CATALOG_UNAVAILABLE',next_attempt_at=? WHERE item_id='105'").run(start+900);
 db.db.prepare("INSERT INTO catalog_classification_changes(item_id,change_token,changed_at) VALUES('106',?,?)").run(crypto.randomUUID(),start);
 const before=coreSnapshot(db);assert.deepEqual((await enqueueMissingCatalogMedia(env,{now})).scheduled_item_ids,[]);assert.deepEqual(coreSnapshot(db),before);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM catalog_media_priorities').get().n,0);
});

test('optional priority failures cannot consume a marker, clear a backoff or advance a job partially',async t=>{
 for(const prefix of ['CREATE TABLE IF NOT EXISTS catalog_media_priorities','INSERT OR IGNORE INTO catalog_media_priorities','UPDATE catalog_classification_jobs SET next_attempt_at']){
  const db=new ObservedD1();t.after(()=>db.db.close());const now=()=>start*1000,env={ADMIN_DB:db};await storeCatalogClassificationFrame(env,catalogMediaLegacyFixture(),{now});const before=coreSnapshot(db);db.failPhoto=prefix;
  const value=await enqueueMissingCatalogMedia(env,{now});assert.equal(value.status,'UNAVAILABLE');assert.deepEqual(value.scheduled_item_ids,[]);assert.deepEqual(coreSnapshot(db),before);assert.equal(db.injected,true);
  const table=db.db.prepare("SELECT name FROM sqlite_master WHERE name='catalog_media_priorities'").get();if(table)assert.equal(db.db.prepare('SELECT COUNT(*) n FROM catalog_media_priorities').get().n,0);
 }
});

test('priority selection loses safely to a changed catalogue and rejects invalid scope before storage',async t=>{
 const db=new ObservedD1();t.after(()=>db.db.close());const now=()=>start*1000,env={ADMIN_DB:db};await storeCatalogClassificationFrame(env,catalogMediaLegacyFixture(),{now});
 const batch=db.batch.bind(db);let changed=false;db.batch=async rows=>{if(!changed&&rows.some(row=>row.sql.startsWith('INSERT OR IGNORE INTO catalog_media_priorities'))){changed=true;db.db.prepare("UPDATE catalog_classification_jobs SET write_token=? WHERE item_id='101'").run(crypto.randomUUID());}return batch(rows);};
 assert.deepEqual((await enqueueMissingCatalogMedia(env,{now})).scheduled_item_ids,[]);assert.equal(changed,true);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM catalog_media_priorities').get().n,0);assert.equal(db.db.prepare("SELECT next_attempt_at n FROM catalog_classification_jobs WHERE item_id='101'").get().n,start+86400);
 db.sql.length=0;for(const options of [{limit:0},{limit:4},{itemIds:['101','101']},{itemIds:['0']},{itemIds:[101]}])await assert.rejects(enqueueMissingCatalogMedia(env,{...options,now}),e=>e.message==='CATALOG_MEDIA_PRIORITY_INVALID');assert.equal(db.sql.length,0);
});

test('invalid stored queue tokens and dates never create a photo priority marker',async t=>{
 for(const mutation of ["UPDATE catalog_classification_jobs SET write_token='not-a-token'","UPDATE catalog_classification_jobs SET next_attempt_at=next_attempt_at+0.5","UPDATE catalog_classification_jobs SET lease_until=1 WHERE lease_token IS NULL"]){
  const db=new ObservedD1();t.after(()=>db.db.close());const now=()=>start*1000,env={ADMIN_DB:db};await storeCatalogClassificationFrame(env,catalogMediaLegacyFixture(),{now});db.db.exec(mutation);const before=coreSnapshot(db);
  assert.deepEqual((await enqueueMissingCatalogMedia(env,{now})).scheduled_item_ids,[],mutation);assert.deepEqual(coreSnapshot(db),before);assert.equal(db.db.prepare('SELECT COUNT(*) n FROM catalog_media_priorities').get().n,0);
 }
});

test('bounded enrichment stays within the cold invocation budget and reuses the existing three-read queue',async t=>{
 class BudgetD1 extends ObservedD1{
  constructor(database){super();this.db.close();this.db=database;this.invocations=0;this.statements=0;this.inBatch=0;}
  prepare(sql){const statement=super.prepare(sql);for(const key of ['first','all','run']){const original=statement[key].bind(statement);statement[key]=async(...args)=>{this.statements++;if(!this.inBatch)this.invocations++;return original(...args);};}return statement;}
  async batch(rows){this.invocations++;this.inBatch++;try{return await super.batch(rows);}finally{this.inBatch--;}}
 }
 const seeded=new D1(),now=()=>start*1000;for(const item of ['101','102','103','104'])await storeCatalogClassificationFrame({ADMIN_DB:seeded},catalogMediaLegacyFixture({item}),{now});
 // A new D1 binding object misses the module's setup WeakMap, matching a cold
 // Worker invocation against an existing database rather than a warm helper.
 const db=new BudgetD1(seeded.db);t.after(()=>db.db.close());const env={ADMIN_DB:db};
 let sourceReads=0;const queued=await enqueueMissingCatalogMedia(env,{now});assert.equal(queued.scheduled_item_ids.length,3);
 const result=await runCatalogClassifications(env,async(_,selection)=>{sourceReads++;return catalogMediaFixture({item:selection.item_ids[0]});},{now,maxProducts:3});assert.equal(sourceReads,3);assert.equal(result.processed.length,3);t.diagnostic('cold enrichment and three catalog reads: '+db.invocations+' D1 RPCs, '+db.statements+' SQL statements, '+sourceReads+' existing source reads');assert.ok(db.invocations+sourceReads<=50,'bounded priority plus existing catalogue turn used '+db.invocations+' D1 invocations and '+sourceReads+' source reads');
 assert.deepEqual((await enqueueMissingCatalogMedia(env,{itemIds:queued.scheduled_item_ids,now})).scheduled_item_ids,[],'captured or marked sources do not repeat an early source read');
});
