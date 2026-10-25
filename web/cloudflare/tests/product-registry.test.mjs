import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {COST_SCHEMA,COST_DEFAULTS,readProductionCosts,productionCostReference} from '../src/production-costs.mjs';
import {deriveCatalogProduct,deriveProductCostCatalog} from '../../finance/src/variant-catalog-frame.mjs';
import {PRODUCT_INDEX_STATUSES} from '../../finance/src/product-index-frame.mjs';
import {storeCatalogClassificationFrame,enqueueCatalogClassifications,runCatalogClassifications,readCatalogClassificationState,refreshKnownCatalogClassifications} from '../src/catalog-classification.mjs';
import {readCostRules,readCostRuleReference,assignCostRules,saveCostRules} from '../src/cost-rules.mjs';
import {readProductRegistry,runProductRegistry,projectProductRegistryFrame,ProductRegistryError} from '../src/product-registry.mjs';

const start=Date.UTC(2026,9,25,12),stamp=start/1000;
async function fixture(){
 const db=new D1(),clock={time:start},now=()=>clock.time,env={ADMIN_DB:db};await db.batch(COST_SCHEMA.map(sql=>db.prepare(sql)));
 db.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)');
 db.db.prepare('INSERT INTO variant_bindings_state VALUES(1,1,?,?)').run('[]',new Date(start).toISOString());
 db.db.prepare('INSERT INTO production_costs_state VALUES(1,7,?,?)').run(JSON.stringify({...COST_DEFAULTS,inclusive_plus_cents:2140}),new Date(start).toISOString());
 const calls=[],pages=new Map();let sourceHook=null;
 const source=async(_,input)=>{calls.push({...input});if(sourceHook)return sourceHook(input);const items=pages.get(input.item_status+':'+input.offset)||[];return {schema:'product_index_v1',status:'AVAILABLE',shop_id:1178167501,checked_at:Math.floor(now()/1000),...input,total_count:items.length,has_more:false,next_offset:null,items:items.map(item=>typeof item==='string'?{item_id:item,item_status:input.item_status,source_update_time:stamp-100}:item)};};
 return {db,env,clock,now,calls,pages,source,setHook:value=>sourceHook=value};
}
async function catalog(f,itemId,{child=false,kit=false,manual=false}={}){
 const axes=kit?[{name:'Tamanho Masculino',option_list:[{option:'P'},{option:'G1'}]},{name:'Tamanho Feminino',option_list:[{option:'GG'},{option:'G3'}]}]:[{name:'Cor',option_list:[{option:'Verde'},{option:'Preto'}]},{name:'Tamanho',option_list:(child?['4','6','8','10','12','14','16']:['P','GG','G3']).map(option=>({option}))}];
 // Different colours have different real size ranges; there is deliberately
 // no Verde G3, Preto GG, or fabricated Cartesian product of the two axes.
 const indices=kit?[[0,0],[0,1],[1,1]]:child?[[0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[0,6]]:[[0,0],[0,1],[1,0],[1,2]],response={tier_variation:axes,model:indices.map((tier_index,index)=>({model_id:Number(itemId)*100+index,tier_index}))};
 const product=await deriveCatalogProduct(itemId,response,{selling_unit:'AUTO'});product.cost_catalog=deriveProductCostCatalog(response,child?'Camiseta infantil Estrela':kit?'Kit casal Camisetas Estrela':'Camiseta Estrela');
 await storeCatalogClassificationFrame(f.env,{schema:'variant_catalog_v1',checked_at:Math.floor(f.now()/1000),products:[product]},{now:f.now});return product;
}
const fail=code=>error=>error instanceof ProductRegistryError&&error.message===code;

test('all previously stored products remain locally readable before discovery and current prices never revert to seed defaults',async()=>{
 const f=await fixture();await catalog(f,'101');await catalog(f,'102',{child:true});await catalog(f,'103',{kit:true});
 f.db.db.prepare('UPDATE variant_bindings_state SET payload=?').run(JSON.stringify([{item_id:'999',model_id:'1',size:'G1',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}]));
 const list=await readProductRegistry(f.env,{}, {now:f.now});assert.equal(list.counts.total,4);assert.equal(f.calls.length,0);assert.ok(list.products.some(row=>row.item_id==='999'));
 const adult=await readProductRegistry(f.env,{item_id:'101'},{now:f.now});assert.equal(adult.pagination.total,4);assert.equal(adult.variants.length,4);assert.deepEqual(adult.variants.map(row=>row.unit_cost_cents),[1590,1590,1590,2140]);assert.deepEqual(adult.variants.map(row=>row.attributes.map(attr=>attr.value)),[['Verde','P'],['Verde','GG'],['Preto','P'],['Preto','G3']]);
 const child=await readProductRegistry(f.env,{item_id:'102'},{now:f.now});assert.equal(child.variants.length,7);assert.ok(child.variants.every(row=>row.unit_cost_cents===1250&&row.selling_unit==='CUSTOM_PRODUCT'));
 const kit=await readProductRegistry(f.env,{item_id:'103'},{now:f.now});assert.deepEqual(kit.variants.map(row=>row.unit_cost_cents),[3180,3730,4280]);
 const manual=await readProductRegistry(f.env,{item_id:'999'},{now:f.now});assert.equal(manual.variants[0].unit_cost_cents,2140);assert.equal((await readProductionCosts(f.env)).values.inclusive_plus_cents,2140);assert.equal(f.calls.length,0);
 const realm=vm.createContext({TextEncoder,raw:JSON.stringify(adult)});new vm.Script(projectProductRegistryFrame.toString()).runInContext(realm);assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(projectProductRegistryFrame(JSON.parse(raw)))',realm)),adult);
});

test('one call reads one bounded index page and only six completed status cursors mark discovery complete',async()=>{
 const f=await fixture();f.pages.set('NORMAL:0',['101','102']);f.pages.set('UNLIST:0',['103']);f.pages.set('SELLER_DELETE:0',['104']);
 for(let index=0;index<6;index++){const result=await runProductRegistry(f.env,f.source,{now:f.now});assert.equal(result.status,'PROGRESSED');assert.equal(f.calls.length,index+1);assert.equal(result.state.complete,index===5);}
 assert.deepEqual(f.calls.map(row=>row.item_status),PRODUCT_INDEX_STATUSES);assert.ok(f.calls.every(row=>row.page_size===50&&row.offset===0));
 const active=await readProductRegistry(f.env,{}, {now:f.now}),all=await readProductRegistry(f.env,{item_status:'ALL'},{now:f.now});assert.equal(active.products.length,3);assert.equal(all.products.length,4);assert.equal(all.discovery.last_success_at,stamp);assert.equal(all.products.find(row=>row.item_id==='104').item_status,'SELLER_DELETE');assert.equal((await runProductRegistry(f.env,f.source,{now:f.now})).status,'IDLE');assert.equal(f.calls.length,6);
});

test('multi-page cursors resume across calls while failure and stale owners cannot publish partial discovery',async()=>{
 const f=await fixture();let failOnce=true;f.setHook(input=>{if(input.offset===50&&failOnce){failOnce=false;throw new Error('PRIVATE_PROVIDER');}return {schema:'product_index_v1',status:'AVAILABLE',shop_id:1178167501,checked_at:Math.floor(f.now()/1000),...input,total_count:51,has_more:input.offset===0,next_offset:input.offset===0?50:null,items:(input.offset===0?Array.from({length:50},(_,i)=>String(i+1)):['51']).map(item_id=>({item_id,item_status:input.item_status,source_update_time:stamp-100}))};});
 const first=await runProductRegistry(f.env,f.source,{now:f.now});assert.equal(first.state.offset,50);const failed=await runProductRegistry(f.env,f.source,{now:f.now});assert.equal(failed.status,'ERROR');assert.equal(failed.state.offset,50);assert.equal((await readProductRegistry(f.env,{}, {now:f.now})).counts.total,50);await runProductRegistry(f.env,f.source,{now:f.now});assert.equal(f.calls.length,2);f.clock.time+=30000;await runProductRegistry(f.env,f.source,{now:f.now});assert.equal(f.calls.length,3);assert.equal((await readProductRegistry(f.env,{}, {now:f.now})).counts.total,51);
 const g=await fixture();g.setHook(input=>{g.db.db.prepare('UPDATE product_registry_state SET revision=revision+1,lease_owner=NULL,lease_until=NULL').run();return {schema:'product_index_v1',status:'AVAILABLE',shop_id:1178167501,checked_at:stamp,...input,total_count:1,has_more:false,next_offset:null,items:[{item_id:'55',item_status:input.item_status,source_update_time:stamp-1}]};});assert.equal((await runProductRegistry(g.env,g.source,{now:g.now})).status,'LEASED');assert.equal((await readProductRegistry(g.env,{}, {now:g.now})).counts.total,0);
});

test('reads search and paginate saved metadata without provider calls and malformed source identities cannot overwrite it',async()=>{
 const f=await fixture();await catalog(f,'101');await catalog(f,'102',{child:true});const list=await readProductRegistry(f.env,{search:'infantil',limit:1,offset:0},{now:f.now});assert.equal(list.products[0].item_id,'102');assert.equal(list.pagination.total,1);assert.equal(f.calls.length,0);
 f.setHook(input=>({schema:'product_index_v1',status:'AVAILABLE',shop_id:2,checked_at:stamp,...input,total_count:0,has_more:false,next_offset:null,items:[]}));const rejected=await runProductRegistry(f.env,f.source,{now:f.now});assert.equal(rejected.status,'ERROR');assert.equal(rejected.state.last_error,'PRODUCT_REGISTRY_SOURCE_INVALID');assert.equal((await readProductRegistry(f.env,{}, {now:f.now})).counts.total,2);
 let invoked=0;const value=structuredClone(list);Object.defineProperty(value,'schema',{enumerable:true,get(){invoked++;return 'product_registry_v1';}});assert.equal(projectProductRegistryFrame(value),null);assert.equal(invoked,0);await assert.rejects(readProductRegistry(f.env,{item_id:'bad'},{now:f.now}),fail('PRODUCT_REGISTRY_REQUEST_INVALID'));
});

test('only confirmed metadata changes requeue a saved classification; daily age and repeated discovery keep the local price',async()=>{
 const f=await fixture();const product=await catalog(f,'101');f.pages.set('NORMAL:0',[{item_id:'101',item_status:'NORMAL',source_update_time:stamp-100}]);await runProductRegistry(f.env,f.source,{now:f.now});assert.equal((await readProductRegistry(f.env,{item_id:'101'},{now:f.now})).variants[3].unit_cost_cents,2140);
 f.db.db.prepare("UPDATE product_registry_state SET status='IDLE',status_index=0,offset=0,scan_id=NULL,scan_started_at=NULL,next_run_at=0").run();f.clock.time+=1000;f.pages.set('NORMAL:0',[{item_id:'101',item_status:'NORMAL',source_update_time:stamp+1}]);await runProductRegistry(f.env,f.source,{now:f.now});const changed=await readProductRegistry(f.env,{item_id:'101'},{now:f.now});assert.equal(changed.product.metadata_changed,true);assert.ok(changed.variants.every(row=>row.unit_cost_cents===null&&row.reason==='CATALOG_METADATA_CHANGED'));assert.equal(changed.variants.length,4);
 const result=await runCatalogClassifications(f.env,async()=>({schema:'variant_catalog_v1',checked_at:Math.floor(f.now()/1000),products:[product]}),{now:f.now,maxProducts:1});assert.deepEqual(result.processed,['101']);const refreshed=await readProductRegistry(f.env,{item_id:'101'},{now:f.now});assert.equal(refreshed.product.metadata_changed,false);assert.equal(refreshed.variants[3].unit_cost_cents,2140);
});

test('a confirmed metadata change blocks automatic prices while preserving explicit bindings, profiles and supported manual rule scopes',async()=>{
 const f=await fixture();await catalog(f,'101');await catalog(f,'102',{child:true});await catalog(f,'104');await catalog(f,'105',{child:true});
 f.db.db.prepare('UPDATE variant_bindings_state SET payload=?').run(JSON.stringify([{item_id:'101',model_id:'10100',size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}]));
 const cost=await readProductionCosts(f.env);cost.values.custom_profiles=[{id:'manual-child',label:'Custo confirmado',unit_cost_cents:1350}];cost.values.custom_assignments=[{item_id:'102',model_id:'10201',profile_id:'manual-child'}];f.db.db.prepare('UPDATE production_costs_state SET payload=?').run(JSON.stringify(cost.values));
 let rules=await readCostRules(f.env);rules=await saveCostRules(f.env,{revision:rules.revision,values:{...rules.values,rules:[...rules.values.rules,{id:'short-constante',label:'Short por peça',enabled:true,unit_cost_cents:2300,name_patterns:['short'],exclude_terms:[],axis_names:[],options:[]}] }},'fixture');
 rules=await assignCostRules(f.env,{revision:rules.revision,assignments:[{item_id:'102',model_id:'10200',rule_id:'camiseta-infantil',size:'4'},{item_id:'104',model_id:null,rule_id:'short-constante',size:null},{item_id:'105',model_id:null,rule_id:'camiseta-infantil',size:null}]},'fixture');
 const bindingBefore=f.db.db.prepare('SELECT payload FROM variant_bindings_state').get().payload,costBefore=f.db.db.prepare('SELECT payload FROM production_costs_state').get().payload,ruleBefore=f.db.db.prepare('SELECT payload FROM production_cost_rules_state').get().payload;
 await refreshKnownCatalogClassifications(f.env,['101','102','104','105'],{now:f.now});
 const adult=await readProductRegistry(f.env,{item_id:'101'},{now:f.now});assert.equal(adult.variants[0].unit_cost_cents,1590);assert.ok(adult.variants.slice(1).every(row=>row.unit_cost_cents===null));
 const child=await readProductRegistry(f.env,{item_id:'102'},{now:f.now});assert.equal(child.variants[0].unit_cost_cents,1250);assert.equal(child.variants[1].unit_cost_cents,1350);assert.ok(child.variants.slice(2).every(row=>row.unit_cost_cents===null));
 const constant=await readProductRegistry(f.env,{item_id:'104'},{now:f.now});assert.ok(constant.variants.every(row=>row.unit_cost_cents===2300));
 const sizeDependent=await readProductRegistry(f.env,{item_id:'105'},{now:f.now});assert.ok(sizeDependent.variants.every(row=>row.unit_cost_cents===null));
 const reference=await readCostRuleReference(f.env,['102','104','105'],{now:f.now});assert.ok(!JSON.stringify(reference).includes('manual_variant_keys'));assert.equal(f.db.db.prepare('SELECT payload FROM variant_bindings_state').get().payload,bindingBefore);assert.equal(f.db.db.prepare('SELECT payload FROM production_costs_state').get().payload,costBefore);assert.equal(f.db.db.prepare('SELECT payload FROM production_cost_rules_state').get().payload,ruleBefore);
});

test('an index proof postpones only periodic checks while missing timestamps, leases and provider retries retain their guards',async()=>{
 const f=await fixture();for(const itemId of ['101','102','103','104','105'])await catalog(f,itemId);
 f.db.db.prepare('UPDATE catalog_classification_jobs SET next_attempt_at=?').run(stamp);
 f.db.db.prepare("UPDATE catalog_classification_jobs SET status='RETRY_WAIT',reason='CATALOG_UNAVAILABLE',failure_count=1,next_attempt_at=? WHERE item_id='102'").run(stamp+300);
 const lease=crypto.randomUUID();f.db.db.prepare("UPDATE catalog_classification_jobs SET status='RUNNING',lease_token=?,lease_until=? WHERE item_id='103'").run(lease,stamp+180);
 f.pages.set('NORMAL:0',['101','102','103','104','105'].map(item_id=>({item_id,item_status:'NORMAL',source_update_time:item_id==='104'?null:item_id==='105'?0:stamp-100})));
 await runProductRegistry(f.env,f.source,{now:f.now});const jobs=f.db.db.prepare('SELECT * FROM catalog_classification_jobs ORDER BY item_id').all();
 assert.equal(jobs[0].next_attempt_at,stamp+86400);assert.equal(jobs[1].next_attempt_at,stamp+300);assert.equal(jobs[1].failure_count,1);assert.equal(jobs[1].reason,'CATALOG_UNAVAILABLE');assert.equal(jobs[2].next_attempt_at,stamp);assert.equal(jobs[2].lease_token,lease);assert.equal(jobs[3].next_attempt_at,stamp);assert.equal(jobs[4].next_attempt_at,stamp);
 const zero=await readProductRegistry(f.env,{item_id:'105'},{now:f.now});assert.equal(zero.product.source_update_time,0);assert.equal(zero.variants[3].unit_cost_cents,2140);
});

test('a changed-index marker survives an older in-flight catalogue response and a failed retry until its matching fetch succeeds',async()=>{
 const f=await fixture(),product=await catalog(f,'101');await readProductRegistry(f.env,{}, {now:f.now});f.db.db.prepare("UPDATE catalog_classification_jobs SET next_attempt_at=0 WHERE item_id='101'").run();
 const first=await runCatalogClassifications(f.env,async()=>{f.clock.time+=1000;f.pages.set('NORMAL:0',[{item_id:'101',item_status:'NORMAL',source_update_time:stamp+1}]);await runProductRegistry(f.env,f.source,{now:f.now});return {schema:'variant_catalog_v1',checked_at:Math.floor(f.now()/1000),products:[product]};},{now:f.now,maxProducts:1});assert.deepEqual(first.processed,['101']);
 let detail=await readProductRegistry(f.env,{item_id:'101'},{now:f.now});assert.equal(detail.product.metadata_changed,true);assert.ok(detail.variants.every(row=>row.unit_cost_cents===null));assert.equal(f.db.db.prepare('SELECT COUNT(*) AS count FROM catalog_classification_changes').get().count,1);
 await runProductRegistry(f.env,f.source,{now:f.now});const failed=await runCatalogClassifications(f.env,async()=>{throw new Error('PRIVATE_PROVIDER');},{now:f.now,maxProducts:1});assert.deepEqual(failed.failed,['101']);detail=await readProductRegistry(f.env,{item_id:'101'},{now:f.now});assert.equal(detail.product.metadata_changed,true);assert.ok(detail.variants.every(row=>row.reason==='CATALOG_METADATA_CHANGED'&&row.unit_cost_cents===null));
 f.clock.time+=300000;const final=await runCatalogClassifications(f.env,async()=>({schema:'variant_catalog_v1',checked_at:Math.floor(f.now()/1000),products:[product]}),{now:f.now,maxProducts:1});assert.deepEqual(final.processed,['101']);detail=await readProductRegistry(f.env,{item_id:'101'},{now:f.now});assert.equal(detail.product.metadata_changed,false);assert.equal(detail.variants[3].unit_cost_cents,2140);assert.equal(f.db.db.prepare('SELECT COUNT(*) AS count FROM catalog_classification_changes').get().count,0);
});

test('detail prices and binding revisions share one snapshot and legal itemized kit maxima remain readable',async()=>{
 const f=await fixture();await catalog(f,'103',{kit:true});await readProductRegistry(f.env,{}, {now:f.now});
 const values={...COST_DEFAULTS,mode:'itemized',base_regular_cents:1000000,base_plus_cents:1000000,components:Array.from({length:20},(_,index)=>({id:'part-'+index,label:'Parte '+index,basis:'per_piece',amount_cents:1000000}))};
 f.db.db.prepare('UPDATE production_costs_state SET revision=8,payload=?').run(JSON.stringify(values));
 const originalPrepare=f.db.prepare.bind(f.db),originalBatch=f.db.batch.bind(f.db);f.db.prepare=sql=>Object.assign(originalPrepare(sql),{testSql:sql});let pricingBatches=0;f.db.batch=async statements=>{if(statements.some(statement=>statement.testSql==='SELECT revision,payload FROM variant_bindings_state WHERE id=1')){pricingBatches++;assert.ok(statements.some(statement=>statement.testSql==='SELECT revision,payload FROM production_costs_state WHERE id=1'));assert.ok(statements.some(statement=>statement.testSql?.includes('classification_revision')));}return originalBatch(statements);};
 const detail=await readProductRegistry(f.env,{item_id:'103'},{now:f.now});assert.equal(pricingBatches,1);assert.equal(detail.revisions.costs,8);assert.ok(detail.variants.every(row=>row.unit_cost_cents===42000000));assert.ok(projectProductRegistryFrame(detail));const corrupt=structuredClone(detail);corrupt.variants[0].unit_cost_cents=420000001;assert.equal(projectProductRegistryFrame(corrupt),null);
});


test('an explicit cost rule that becomes unavailable reports its pricing reason instead of an unrelated catalogue parsing error',async()=>{
 const f=await fixture();await catalog(f,'102',{child:true});let rules=await readCostRules(f.env);rules=await assignCostRules(f.env,{revision:rules.revision,assignments:[{item_id:'102',model_id:'10200',rule_id:'camiseta-infantil',size:'4'}]},'fixture');await saveCostRules(f.env,{revision:rules.revision,values:{...rules.values,rules:rules.values.rules.map(rule=>({...rule,enabled:false}))}},'fixture');
 const detail=await readProductRegistry(f.env,{item_id:'102'},{now:f.now}),variant=detail.variants.find(row=>row.model_id==='10200');assert.equal(variant.unit_cost_cents,null);assert.equal(variant.reason,'RULE_ASSIGNMENT_PENDING');assert.equal(f.calls.length,0);
});
