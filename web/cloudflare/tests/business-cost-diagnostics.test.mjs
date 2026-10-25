import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {COST_DEFAULTS} from '../src/production-costs.mjs';
import {businessMonth} from '../src/business-month.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {readCostRules,saveCostRules,assignCostRules,costRuleSnapshotQueries,costRuleReferenceFromSnapshot,mergeCatalogCostReference} from '../src/cost-rules.mjs';
import {storeCatalogClassificationFrame,refreshKnownCatalogClassifications,enqueueCatalogClassifications,runCatalogClassifications,catalogClassificationQueries,catalogClassificationsFromSnapshot} from '../src/catalog-classification.mjs';
import {readBusinessCostDiagnostics,buildBusinessCostDiagnostics,projectBusinessCostDiagnostics} from '../src/business-cost-diagnostics.mjs';

const clock=Date.UTC(2026,10,2,12),stamp=clock/1000,now=()=>clock;
const coverage=paid=>({orders:paid,paid,completed:paid,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:paid,payment_missing:0,returns:0,returns_unknown:0});
function financeFrame(selection,slot,items){
 const count=items.length,money=String(count*100),payout=String(count*60),tax=String(count*2),products=new Map();
 for(const item of items){let row=products.get(item.item_id);if(!row){row={item_id:item.item_id,quantity:0,orders:0,exclusive_orders:0,mixed_orders:0,exclusive_payment_covered:0,exclusive_payment_missing:0,exclusive_returns:0,exclusive_returns_unknown:0,items:[]};products.set(item.item_id,row);}row.quantity+=item.quantity;row.orders++;row.exclusive_orders++;row.exclusive_payment_covered++;row.items.push({model_id:item.model_id,exclusive_quantity:item.quantity,mixed_quantity:0});}
 for(const row of products.values())Object.assign(row,{known_exclusive_sales_base_raw:String(row.orders*100),exclusive_sales_base_raw:String(row.orders*100),known_exclusive_expected_repass_raw:String(row.orders*60),exclusive_expected_repass_raw:String(row.orders*60),known_exclusive_ads_adjustment_raw:'0',exclusive_ads_adjustment_raw:'0',known_exclusive_invoice_tax_raw:String(row.orders*2),exclusive_invoice_tax_raw:String(row.orders*2)});
 const result={schema:'finance_business_period_v1',run_id:'11111111-1111-4111-8111-'+String(slot).padStart(12,'0'),revision:2,status:'COMPLETE',start_date:selection.start_date,end_date:selection.end_date,cutoff_at:stamp-2,checked_at:stamp,currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:Math.max(1,Math.ceil(count/20)),page_capacity:20,duplicate_orders:0,coverage:coverage(count),known_sales_base_raw:money,sales_base_raw:money,known_expected_repass_raw:payout,expected_repass_raw:payout,known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:count,unavailable_orders:0,known_base_raw:money,known_tax_raw:tax},items,product_breakdown:{schema:'business_product_breakdown_v1',mixed_orders:0,mixed_payment_covered:0,mixed_payment_missing:0,known_mixed_sales_base_raw:'0',known_mixed_expected_repass_raw:'0',known_mixed_ads_adjustment_raw:'0',known_mixed_invoice_tax_raw:'0',products:[...products.values()]},diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
 assert.ok(projectBusinessPeriodFrame(result),'the stored source fixture must satisfy the real Finance contract');return result;
}
async function fixture(t,{items=[{item_id:'201',model_id:'0',quantity:1}],bindings=[],review=false,perSlot=null}={}){
 const ADMIN_DB=new D1();t.after(()=>ADMIN_DB.db.close());
 ADMIN_DB.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT)');
 ADMIN_DB.db.prepare('INSERT INTO variant_bindings_state VALUES(1,3,?,?)').run(JSON.stringify(bindings),new Date(clock).toISOString());
 ADMIN_DB.db.prepare('INSERT INTO production_costs_state VALUES(1,7,?,?)').run(JSON.stringify({...COST_DEFAULTS,inclusive_plus_cents:2140,components:[]}),new Date(clock).toISOString());
 const env={ADMIN_DB};let calls=0;
 const services={getFinanceBusinessPeriod:async(_,selection)=>{const value=financeFrame(selection,++calls,perSlot?perSlot[calls-1]:items);if(review&&calls===1){value.coverage.orders+=2;value.coverage.cancel_pending=1;value.coverage.other=1;assert.ok(projectBusinessPeriodFrame(value));}return value;}};
 let frame=await businessMonth(env,{operation:'start',month:'2026-10'},services,{now});while(frame.status==='RUNNING')frame=await businessMonth(env,{operation:'step',month:'2026-10'},services,{now});
 return {env,frame,calls:()=>calls,read:()=>readBusinessCostDiagnostics(env,{month:'2026-10'},{now})};
}
async function catalog(env,{item='201',models=['0'],size='M',name='Camiseta adulta',reason=null,matched=true,attributes=null}={}){
 const variants=models.map(model_id=>({model_id,attributes:attributes||[{name:'Tamanho',value:size}]})),bindings=matched?models.map(model_id=>({item_id:item,model_id,size})):[];
 const product={item_id:item,catalog_fingerprint:'a'.repeat(64),selling_unit:'SINGLE_GARMENT',bindings,unresolved_count:models.length-bindings.length,cost_catalog:{schema:'product_cost_catalog_v1',product_name:name,variants}};
 if(reason)product.diagnostic={axes:[{name:'Tamanho',options:[size],option_count:1}],model_count:models.length,reasons:[{code:reason,count:models.length}]};
 await storeCatalogClassificationFrame(env,{schema:'variant_catalog_v1',checked_at:stamp,products:[product]},{now});
}
const variant=(value,item='201',model='0')=>value.products.find(row=>row.item_id===item)?.variants.find(row=>row.model_id===model);

test('the local diagnostic preserves missing money and distinguishes the order-review categories without provider calls or private identifiers',async t=>{
 const f=await fixture(t,{review:true}),originalFetch=globalThis.fetch;let network=0;globalThis.fetch=()=>{network++;throw Error('PRIVATE_PROVIDER_TOKEN');};
 try{
  const value=await f.read();assert.equal(value.schema,'business_cost_diagnostics_v1');assert.equal(value.month,'2026-10');assert.equal(value.consistent,true);assert.equal(value.status,'COMPLETE');
  assert.deepEqual(value.review_counts,{IN_CANCEL:1,TO_RETURN:1,UNKNOWN_STATUS:0});assert.ok(value.pending.includes('STATUS_REVIEW_REQUIRED'));assert.equal(value.coverage.paid,3);
  assert.equal(variant(value).reason,'NO_CATALOG');assert.equal(variant(value).quantity,3);assert.equal(variant(value).unit_cost_cents,null);assert.equal(variant(value).production_cost_cents,null);assert.equal(variant(value).recoverable,true);
  assert.equal(value.summary.production_coverage.pending_units,3);assert.equal(value.summary.production_coverage.pending_variants,1);assert.equal(value.summary.production_coverage.pending_products,1);assert.equal(value.summary.balance_cents,null);
  assert.equal(value.settings.inclusive_regular_cents,1590);assert.equal(value.settings.inclusive_plus_cents,2140);assert.equal(value.settings.rules.find(row=>row.id==='camiseta-infantil').unit_cost_cents,1250);
  assert.equal(network,0);assert.equal(f.calls(),3);assert.doesNotMatch(JSON.stringify(value),/PRIVATE|order_sn|order_hash|buyer|customer|access_token|refresh_token|source_hash|catalog_fingerprint/);
  assert.ok(projectBusinessCostDiagnostics(value));assert.ok(Buffer.byteLength(JSON.stringify(value))<=65536);
 }finally{globalThis.fetch=originalFetch;}
});

test('a MATCHED product cannot hide a sold model missing from its saved catalogue',async t=>{
 const f=await fixture(t,{items:[{item_id:'201',model_id:'99',quantity:2}]});await catalog(f.env,{models:['0']});
 const value=await f.read(),product=value.products[0],row=variant(value,'201','99');
 assert.equal(product.classification.status,'MATCHED');assert.equal(product.product_name,'Camiseta adulta');assert.equal(row.reason,'MODEL_NOT_IN_CATALOG');assert.equal(row.quantity,6);assert.equal(row.unit_cost_cents,null);assert.deepEqual(row.attributes,[]);assert.equal(row.recoverable,true,'a normal catalogue verification date is not a provider retry backoff');
 assert.equal(value.summary.production_complete,false);assert.equal(value.summary.production_coverage.pending_units,6);
});

test('a queued provider failure is reported safely without clearing its retry backoff',async t=>{
 const f=await fixture(t);await enqueueCatalogClassifications(f.env,['201'],{now,returnState:false});
 f.env.ADMIN_DB.db.prepare("UPDATE catalog_classification_jobs SET status='RETRY_WAIT',reason='CATALOG_UNAVAILABLE',last_attempt_at=?,next_attempt_at=?,failure_count=3 WHERE item_id='201'").run(stamp-10,stamp+1200);
 const value=await f.read();assert.equal(variant(value).reason,'NO_CATALOG');assert.equal(variant(value).recoverable,false);assert.equal(variant(value).next_attempt_at,stamp+1200);assert.deepEqual(value.products[0].classification,{status:'RETRY_WAIT',reason:'CATALOG_UNAVAILABLE',checked_at:null,next_attempt_at:stamp+1200,failure_count:3});
 assert.equal(f.env.ADMIN_DB.db.prepare("SELECT next_attempt_at FROM catalog_classification_jobs WHERE item_id='201'").get().next_attempt_at,stamp+1200);
 f.env.ADMIN_DB.db.prepare("UPDATE catalog_classification_jobs SET status='RUNNING',lease_token=?,lease_until=? WHERE item_id='201'").run('11111111-1111-4111-8111-111111111111',stamp+180);
 assert.equal(variant(await f.read()).recoverable,false,'an active worker owns recovery until its lease is released');
});

test('a current failed source retains its bounded phase and HTTP evidence in the compact diagnostic',async t=>{
 const f=await fixture(t);await f.read();
 await runCatalogClassifications(f.env,async()=>({schema:'variant_catalog_v1',status:'UNAVAILABLE',diagnostic:{stage:'BASE_INFO',code:'FINANCE_CATALOG_UPSTREAM_HTTP',http:403}}),{now,maxProducts:1});
 const value=await f.read(),job=value.products[0].classification;
 assert.equal(job.reason,'CATALOG_BASE_HTTP_ERROR');assert.deepEqual(job.source_diagnostic,{stage:'BASE_INFO',code:'FINANCE_CATALOG_UPSTREAM_HTTP',http:403,checked_at:stamp});assert.equal(variant(value).reason,'NO_CATALOG');assert.equal(variant(value).recoverable,false);assert.ok(projectBusinessCostDiagnostics(value));
 const stale=structuredClone(value);stale.products[0].classification.source_diagnostic.message='PRIVATE';assert.equal(projectBusinessCostDiagnostics(stale),null);
 f.env.ADMIN_DB.db.prepare('UPDATE catalog_classification_source_diagnostics SET failure_count=0').run();assert.equal((await f.read()).products[0].classification.source_diagnostic,undefined,'a previous failure is not attributed to the current attempt');
});

test('explicit rule evidence distinguishes disabled assignments, invalid assigned options and conflicting rules',async t=>{
 for(const mode of ['disabled','assignment','conflict']){
  const f=await fixture(t);await catalog(f.env,{name:'Camiseta infantil',size:'4',matched:false,reason:'OPTION_NOT_RECOGNIZED'});
  if(mode!=='conflict')await assignCostRules(f.env,{revision:1,assignments:[{item_id:'201',model_id:'0',rule_id:'camiseta-infantil',size:'4'}]},'fixture-owner');
  const rules=await readCostRules(f.env),values=structuredClone(rules.values);
  if(mode==='disabled')values.rules[0].enabled=false;
  else if(mode==='assignment')values.rules[0].options=values.rules[0].options.filter(option=>option!=='4');
  else values.rules.push({...structuredClone(values.rules[0]),id:'child-other',label:'Outra camiseta infantil'});
  await saveCostRules(f.env,{revision:rules.revision,values},'fixture-owner');
  const value=await f.read(),row=variant(value);assert.equal(row.reason,{disabled:'RULE_DISABLED',assignment:'ASSIGNMENT_PENDING',conflict:'CONFLICT'}[mode],mode);assert.equal(row.unit_cost_cents,null);assert.equal(row.recoverable,false);assert.equal(value.summary.balance_cents,null);
  if(mode!=='conflict')assert.deepEqual(row.assignment,{rule_id:'camiseta-infantil',size:'4',scope:'VARIANT'});
 }
});

test('validated catalogue option failures and observed metadata changes remain precise instead of assumed costs',async t=>{
 const option=await fixture(t);await catalog(option.env,{size:'XXS',matched:false,reason:'OPTION_NOT_RECOGNIZED'});
 let value=await option.read();assert.equal(variant(value).reason,'OPTION_NOT_RECOGNIZED');assert.deepEqual(variant(value).attributes,[{name:'Tamanho',value:'XXS'}]);assert.equal(variant(value).unit_cost_cents,null);assert.equal(variant(value).recoverable,false);
 const changed=await fixture(t);await catalog(changed.env);await refreshKnownCatalogClassifications(changed.env,['201'],{now});
 value=await changed.read();assert.equal(variant(value).reason,'METADATA_CHANGED');assert.equal(value.products[0].classification.reason,'CATALOG_METADATA_CHANGED');assert.equal(variant(value).production_cost_cents,null);assert.equal(variant(value).recoverable,true);
});

test('saved manual costs stay authoritative and only unresolved variants appear in the diagnostic',async t=>{
 const f=await fixture(t,{bindings:[{item_id:'201',model_id:'0',size:'G1',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}]});
 await catalog(f.env,{size:'XXS',matched:false,reason:'OPTION_NOT_RECOGNIZED'});
 const value=await f.read();assert.deepEqual(value.products,[]);assert.equal(value.summary.production_complete,true);assert.equal(value.summary.known_production_cents,6420);assert.equal(value.settings.inclusive_plus_cents,2140);assert.equal(value.truncation.products_total,0);
 assert.equal(f.env.ADMIN_DB.db.prepare('SELECT payload FROM variant_bindings_state').get().payload,JSON.stringify([{item_id:'201',model_id:'0',size:'G1',selling_unit:'SINGLE_GARMENT',operator_confirmed:true}]));
});

test('an intervening local revision is identified without attributing stale missing costs to a guessed rule',async t=>{
 const f=await fixture(t),db=f.env.ADMIN_DB,ids=['201'],ruleQueries=costRuleSnapshotQueries(db,ids),classQueries=catalogClassificationQueries(db,ids,f.frame.unmapped_variants),rows=await db.batch([...ruleQueries,...classQueries]);
 const rules=await readCostRules(f.env),classifications=catalogClassificationsFromSnapshot(rows.slice(ruleQueries.length)),reference=mergeCatalogCostReference(costRuleReferenceFromSnapshot(rows.slice(0,ruleQueries.length),{now}),classifications);
 const result=buildBusinessCostDiagnostics(f.frame,{bindings:{revision:4,bindings:[]},costs:{revision:7,values:{...COST_DEFAULTS,inclusive_plus_cents:2140,components:[]}},rules,classifications,catalogs:rows.slice(1,ruleQueries.length).flatMap(row=>row.results),reference},{now});
 assert.equal(result.consistent,false);assert.equal(result.versions.monthly.bindings,3);assert.equal(result.versions.current.bindings,4);assert.equal(result.summary.balance_cents,null);assert.equal(variant(result).reason,'NO_CATALOG');assert.equal(variant(result).recoverable,false);assert.ok(projectBusinessCostDiagnostics(result));
});

test('product and UTF-8 limits are explicit while aggregate coverage remains complete',async t=>{
 const productItems=Array.from({length:91},(_,index)=>({item_id:String(100+index),model_id:'0',quantity:1})),f=await fixture(t,{items:productItems}),value=await f.read();
 assert.equal(value.truncation.products_total,91);assert.equal(value.truncation.products_included,90);assert.equal(value.products.length,90);assert.equal(value.truncation.truncated,true);assert.ok(['PRODUCT_LIMIT','PRODUCT_AND_BYTE_LIMIT'].includes(value.truncation.reason));assert.equal(value.summary.production_coverage.pending_products,91);
 const perSlot=Array.from({length:3},(_,slot)=>Array.from({length:1000},(_,index)=>({item_id:'201',model_id:String(slot*1000+index),quantity:1}))),many=await fixture(t,{perSlot}),bounded=await many.read();
 assert.equal(bounded.summary.production_coverage.pending_variants,3000);assert.equal(bounded.truncation.variants_total,3000);assert.equal(bounded.truncation.truncated,true);assert.ok(['BYTE_LIMIT','PRODUCT_AND_BYTE_LIMIT'].includes(bounded.truncation.reason));assert.ok(bounded.truncation.variants_included<3000);assert.ok(Buffer.byteLength(JSON.stringify(bounded))<=65536);assert.ok(projectBusinessCostDiagnostics(bounded));
});

test('the diagnostic projector is standalone, rejects private extras and remains detached from browser consumers',async t=>{
 const f=await fixture(t),value=await f.read(),copy=projectBusinessCostDiagnostics(value);assert.ok(copy);copy.products[0].variants[0].reason='CONFLICT';assert.equal(variant(value).reason,'NO_CATALOG');
 assert.equal(projectBusinessCostDiagnostics({...value,access_token:'PRIVATE'}),null);const altered=structuredClone(value);altered.products[0].variants[0].reason='ARBITRARY_PROVIDER_TEXT';assert.equal(projectBusinessCostDiagnostics(altered),null);
 let getters=0;const poisoned={...value};Object.defineProperty(poisoned,'products',{get(){getters++;return [];},enumerable:true});assert.equal(projectBusinessCostDiagnostics(poisoned),null);assert.equal(getters,0);
 const monthObject={...value,month:{toString(){getters++;return '2026-10';}}};assert.equal(projectBusinessCostDiagnostics(monthObject),null);assert.equal(getters,0);
 const modelGetter=structuredClone(value);Object.defineProperty(modelGetter.products[0].variants[0],'model_id',{get(){getters++;return '0';},enumerable:true});assert.equal(projectBusinessCostDiagnostics(modelGetter),null);assert.equal(getters,0);
 const collectionCode=structuredClone(value);collectionCode.collection={schema:'business_month_collection_v1',state:'RETRY_WAIT',code:{toString(){getters++;return 'BUSINESS_PERIOD_TIMEOUT';}},retry_after_seconds:5};assert.equal(projectBusinessCostDiagnostics(collectionCode),null);assert.equal(getters,0);
 const context=vm.createContext({TextEncoder,serialized:JSON.stringify(value)});new vm.Script(projectBusinessCostDiagnostics.toString()+'\nglobalThis.actual=projectBusinessCostDiagnostics(JSON.parse(serialized));').runInContext(context);assert.deepEqual(JSON.parse(JSON.stringify(context.actual)),value);
});

test('maximum Unicode cost settings retain an explicit byte bound when they leave little room for product evidence',async t=>{
 const items=Array.from({length:100},(_,index)=>({item_id:'201',model_id:String(index),quantity:1})),f=await fixture(t,{items}),db=f.env.ADMIN_DB;
 const rulesState=await readCostRules(f.env),ruleTemplate=rulesState.values.rules[0],ruleValues={rules:Array.from({length:100},(_,index)=>({...structuredClone(ruleTemplate),id:'rule-'+String(index).padStart(43,'0'),label:'🧵'.repeat(22)+'x',enabled:false}))};
 await saveCostRules(f.env,{revision:rulesState.revision,values:ruleValues},'fixture-owner');
 const costs={...COST_DEFAULTS,inclusive_plus_cents:2140,components:Array.from({length:20},(_,index)=>({id:'component-'+String(index).padStart(54,'0'),label:'🧵'.repeat(30),basis:'per_piece',amount_cents:1})),custom_profiles:Array.from({length:100},(_,index)=>({id:'profile-'+String(index).padStart(56,'0'),label:'🧵'.repeat(30),unit_cost_cents:1000+index}))};
 costs.custom_assignments=items.map((row,index)=>({item_id:row.item_id,model_id:row.model_id,profile_id:costs.custom_profiles[index].id}));
 db.db.prepare('UPDATE production_costs_state SET revision=8,payload=? WHERE id=1').run(JSON.stringify(costs));
 const ruleQueries=costRuleSnapshotQueries(db,['201']),classQueries=catalogClassificationQueries(db,['201'],f.frame.unmapped_variants),rows=await db.batch([...ruleQueries,...classQueries]),rules=await readCostRules(f.env),classifications=catalogClassificationsFromSnapshot(rows.slice(ruleQueries.length)),reference=mergeCatalogCostReference(costRuleReferenceFromSnapshot(rows.slice(0,ruleQueries.length),{now}),classifications);
 const value=buildBusinessCostDiagnostics(f.frame,{bindings:{revision:3,bindings:[]},costs:{revision:8,values:costs},rules,classifications,catalogs:rows.slice(1,ruleQueries.length).flatMap(row=>row.results),reference},{now});
 assert.equal(value.consistent,false);assert.equal(value.settings.rules.length,100);assert.equal(value.settings.custom_profiles.length,100);assert.equal(value.settings.components.length,20);assert.ok('🧵'.repeat(30).startsWith(value.settings.custom_profiles[0].label));assert.ok(Buffer.byteLength(value.settings.custom_profiles[0].label)<=96);assert.equal(value.truncation.text_truncated,true);assert.equal(value.truncation.truncated,true);assert.equal(value.truncation.variants_total,100);assert.ok(Buffer.byteLength(JSON.stringify(value))<=65536);assert.ok(projectBusinessCostDiagnostics(value));
});

test('a legal itemized kit can exceed the single-component price bound while production totals stay nonnegative',async t=>{
 const f=await fixture(t),db=f.env.ADMIN_DB,ruleQueries=costRuleSnapshotQueries(db,['201']),classQueries=catalogClassificationQueries(db,['201'],f.frame.unmapped_variants),rows=await db.batch([...ruleQueries,...classQueries]),rules=await readCostRules(f.env),classifications=catalogClassificationsFromSnapshot(rows.slice(ruleQueries.length)),reference=mergeCatalogCostReference(costRuleReferenceFromSnapshot(rows.slice(0,ruleQueries.length),{now}),classifications);
 const costs={...COST_DEFAULTS,mode:'itemized',base_regular_cents:1000000,base_plus_cents:1000000,components:Array.from({length:20},(_,index)=>({id:'component-'+index,label:'Componente '+index,basis:'per_piece',amount_cents:1000000}))};
 const value=buildBusinessCostDiagnostics(f.frame,{bindings:{revision:4,bindings:[{item_id:'201',model_id:'0',male_size:'G1',female_size:'G1',selling_unit:'ONE_MALE_ONE_FEMALE_KIT',operator_confirmed:true}]},costs:{revision:8,values:costs},rules,classifications,catalogs:rows.slice(1,ruleQueries.length).flatMap(row=>row.results),reference},{now});
 assert.equal(variant(value).reason,'COST_AVAILABLE');assert.equal(variant(value).unit_cost_cents,42000000);assert.equal(variant(value).production_cost_cents,126000000);assert.equal(value.consistent,false);assert.ok(projectBusinessCostDiagnostics(value));
 for(const field of ['production_cost_cents','known_production_cost_cents']){const poisoned=structuredClone(value);poisoned.totals[field]=-1;assert.equal(projectBusinessCostDiagnostics(poisoned),null,field);}
});

