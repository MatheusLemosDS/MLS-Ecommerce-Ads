import test from 'node:test';
import assert from 'node:assert/strict';
import {COST_DEFAULTS,COST_SCHEMA,ProductionCostError,validateProductionCosts,readProductionCosts,saveProductionCosts,readProductionCostAudit,productionCostReference} from '../src/production-costs.mjs';
import {D1} from './sqlite-d1.mjs';

const values=changes=>({...COST_DEFAULTS,components:[],...changes});
const component=(id='print',basis='per_piece',amount_cents=150)=>({id,label:'Estampa',basis,amount_cents});
const binding=(item_id='101',model_id='1',male_size='M',female_size='G')=>({item_id,model_id,male_size,female_size,selling_unit:'ONE_MALE_ONE_FEMALE_KIT',operator_confirmed:true});
const single=(item_id='201',model_id='0',size='M',automatic=false)=>({item_id,model_id,size,selling_unit:'SINGLE_GARMENT',operator_confirmed:!automatic,...(automatic?{source:'CATALOG_SIZE_AXIS',catalog_fingerprint:'a'.repeat(64)}:{})});
const frame=rows=>({status:'AVAILABLE',rows});
const row=(quantity=1,item_id='101',model_id='1',order_status='READY_TO_SHIP')=>({item_id,model_id,quantity,order_status,line_count:1});
const reference=(rows,bindings=[binding()],cfg=values(),revision=2)=>productionCostReference(frame(rows),{revision:3,bindings},{revision,values:cfg});
async function database(){
 const env={ADMIN_DB:new D1()};await env.ADMIN_DB.batch(COST_SCHEMA.map(sql=>env.ADMIN_DB.prepare(sql)));
 const now=new Date().toISOString();await env.ADMIN_DB.prepare('INSERT INTO production_costs_state(id,revision,payload,updated_at) VALUES(1,1,?,?)').bind(JSON.stringify(COST_DEFAULTS),now).run();
 await env.ADMIN_DB.prepare('INSERT INTO production_costs_audit(revision,payload,actor,created_at) VALUES(1,?,?,?)').bind(JSON.stringify(COST_DEFAULTS),'initial_client_confirmed',now).run();return env;
}
const error=(code,status=400)=>value=>value instanceof ProductionCostError&&value.message===code&&value.status===status;

test('confirmed defaults are integer cents and explicit all-inclusive; validation returns independent copies',()=>{
 assert.deepEqual(validateProductionCosts(COST_DEFAULTS),{mode:'all_inclusive',inclusive_regular_cents:1590,inclusive_plus_cents:1890,base_regular_cents:null,base_plus_cents:null,components:[]});
 const input=values({components:[component()]});const actual=validateProductionCosts(input);actual.components[0].amount_cents=10;assert.equal(input.components[0].amount_cents,150);
 assert.equal(validateProductionCosts(values({components:[{...component(),label:' Etiqueta '}]})).components[0].label,'Etiqueta');
});
test('strict values reject missing/extra keys, unsupported mode, non-cent and unsafe money',()=>{
 for(const bad of [null,[],{},values({extra:'PRIVATE'}),values({mode:'unknown'}),values({inclusive_regular_cents:0}),values({inclusive_plus_cents:-1}),values({inclusive_regular_cents:'1590'}),values({inclusive_regular_cents:15.9}),values({inclusive_regular_cents:1000001}),values({inclusive_plus_cents:Number.MAX_SAFE_INTEGER}),values({base_regular_cents:0}),values({base_plus_cents:NaN})])assert.throws(()=>validateProductionCosts(bad),ProductionCostError);
 assert.equal(validateProductionCosts(values({inclusive_regular_cents:1000000,inclusive_plus_cents:1})).inclusive_regular_cents,1000000);
});
test('separate mode requires explicit bare garment bases; inactive nullable bases never inferred',()=>{
 for(const change of [{},{base_regular_cents:1000},{base_plus_cents:1300}])assert.throws(()=>validateProductionCosts(values({mode:'itemized',...change})),error('PRODUCTION_COST_ITEMIZED_BASE_REQUIRED'));
 assert.equal(validateProductionCosts(values({mode:'itemized',base_regular_cents:1000,base_plus_cents:1300})).base_regular_cents,1000);
 assert.equal(validateProductionCosts(values({base_regular_cents:1000})).base_plus_cents,null);
});
test('components have exact bounded IDs, literal labels, bases and amounts; duplicate IDs fail',()=>{
 for(const bad of [null,[],{...component(),extra:1},{...component(),id:'BAD ID'},{...component(),id:''},{...component(),id:'a'.repeat(65)},{...component(),label:''},{...component(),label:'x'.repeat(61)},{...component(),label:'x\ny'},{...component(),label:'x\u0085y'},{...component(),basis:'per_order'},{...component(),amount_cents:-1},{...component(),amount_cents:0.5}])assert.throws(()=>validateProductionCosts(values({components:[bad]})),error('PRODUCTION_COST_COMPONENT_INVALID'));
 assert.throws(()=>validateProductionCosts(values({components:[component(),component()]})),ProductionCostError);
 assert.throws(()=>validateProductionCosts(values({components:Array.from({length:21},(_,n)=>component('c-'+n))})),ProductionCostError);
 assert.equal(validateProductionCosts(values({components:[{...component(),label:'<b>Texto literal</b>',amount_cents:0}]})).components[0].label,'<b>Texto literal</b>');
});
test('all-inclusive kits use 31.80, 34.80 and 37.80 for all 49 explicit size pairs',()=>{
 const sizes=['P','M','G','GG','G1','G2','G3'],plus=new Set(['G1','G2','G3']);
 for(const male of sizes)for(const female of sizes){const result=reference([row(2)],[binding('101','1',male,female)]);const expected=3180+300*(Number(plus.has(male))+Number(plus.has(female)));assert.equal(result.variants[0].unit_cost_cents,expected);assert.equal(result.total_cents,expected*2);assert.equal(result.mapped_quantity,2);assert.equal(result.gross_profit_cents,null);}
});
test('single garments charge one size-specific complete cost for all seven sizes and both provenance types',()=>{
 for(const size of ['P','M','G','GG','G1','G2','G3'])for(const automatic of [false,true]){
  const result=reference([row(3,'201','0')],[single('201','0',size,automatic)]),unit=['G1','G2','G3'].includes(size)?1890:1590;
  assert.equal(result.variants[0].unit_cost_cents,unit);assert.equal(result.total_cents,3*unit);assert.equal(result.mapped_quantity,3);assert.equal(result.unmapped_quantity,0);assert.equal(result.gross_profit_cents,null);
 }
});
test('mixed product references keep one-piece garments, two-piece kits and unknown quantities distinct',()=>{
 const result=reference([row(2),row(3,'201','0'),row(1,'301','1'),row(4,'401','0')],[binding(),single(),single('301','1','G2',true)]);
 assert.deepEqual(result.variants.map(value=>value.unit_cost_cents),[3180,1590,1890,null]);assert.equal(result.known_subset_cents,13020);assert.equal(result.total_cents,null);assert.equal(result.mapped_quantity,6);assert.equal(result.unmapped_quantity,4);
});
test('itemized individual garments use one bare garment and one per-piece component while kit-only charges are excluded',()=>{
 const cfg=values({mode:'itemized',base_regular_cents:1000,base_plus_cents:1400,components:[component('print','per_piece',150),component('label','per_piece',25),component('pack','per_kit',100)]});
 const result=reference([row(2,'201','0'),row(3,'301','0'),row(1)],[single(),single('301','0','G2',true),binding()],cfg);
 assert.deepEqual(result.variants.map(value=>value.unit_cost_cents),[1175,1575,2450]);assert.equal(result.total_cents,9525);assert.equal(result.gross_profit_cents,null);
 const inclusive=reference([row(1,'201','0')],[single()],{...cfg,mode:'all_inclusive'});assert.equal(inclusive.total_cents,1590);
 const kitOnly=reference([row(1,'201','0')],[single()],{...cfg,components:[component('pack','per_kit',9999)]});assert.equal(kitOnly.total_cents,1000);
});
test('unsafe individual garment quantities and contribution multiplication fail closed',()=>{
 for(const quantity of [0,-1,0.5,Number.MAX_SAFE_INTEGER])assert.throws(()=>reference([row(quantity,'201','0')],[single()]),error('PRODUCTION_COST_REFERENCE_INVALID',503));
});
test('retained separate bases and components are ignored while all-inclusive; no double charge',()=>{
 const result=reference([row()],undefined,values({base_regular_cents:1000,base_plus_cents:1300,components:[component(),component('packing','per_kit',300)]}));
 assert.equal(result.total_cents,3180);assert.equal(result.mode,'all_inclusive');assert.equal(result.financial_status,'FINANCIAL_DATA_UNAVAILABLE');
});
test('itemized sums both bare garments, two per-piece components and one per-kit component per catalog unit',()=>{
 const cfg=values({mode:'itemized',base_regular_cents:1000,base_plus_cents:1400,components:[component('print','per_piece',150),component('label','per_piece',25),component('pack','per_kit',100)]});
 const result=reference([row(3)],[binding('101','1','GG','G2')],cfg);assert.equal(result.variants[0].unit_cost_cents,2850);assert.equal(result.total_cents,8550);
 assert.equal(result.cost_stage,'PRODUCTION_COST_REFERENCE');assert.equal(result.currency,'BRL');assert.equal(result.costs_revision,2);assert.equal(result.bindings_revision,3);
});
test('exact IDs/model0 and grouping across statuses preserve catalog quantities without financial eligibility assumptions',()=>{
 const result=reference([row(2,'101','0','CANCELLED'),row(3,'101','0','UNPAID'),row(1,'101','2')],[binding('101','0'),binding('101','2','G1','G3')]);
 assert.equal(result.variants.length,2);assert.equal(result.variants[0].quantity,5);assert.equal(result.variants[0].production_cost_cents,15900);assert.equal(result.variants[1].unit_cost_cents,3780);assert.equal(result.total_cents,19680);assert.equal(result.status_scope,'ALL_RETURNED_STATUSES_REFERENCE_ONLY');assert.equal(result.gross_profit_cents,null);
 assert.deepEqual(Object.keys(result.variants[0]).sort(),['item_id','model_id','quantity','unit_cost_cents','production_cost_cents'].sort());
});
test('unmapped bindings keep total unknown, known subtotal separate; empty valid frame is zero and unavailable is null',()=>{
 const partial=reference([row(2),row(3,'101','9')]);assert.equal(partial.total_cents,null);assert.equal(partial.known_subset_cents,6360);assert.equal(partial.mapped_quantity,2);assert.equal(partial.unmapped_quantity,3);assert.equal(partial.variants[1].unit_cost_cents,null);assert.equal(partial.variants[1].production_cost_cents,null);
 const unknown=reference([row()],[]);assert.equal(unknown.total_cents,null);assert.equal(unknown.known_subset_cents,0);
 const empty=reference([],[]);assert.equal(empty.total_cents,0);assert.equal(empty.gross_profit_cents,null);
 for(const invalid of [null,{status:'UNAVAILABLE'},{status:'INVALID_RESPONSE'}])assert.equal(productionCostReference(invalid,null,null),null);
});
test('unsafe quantities, sums, duplicate mappings, invalid states and malformed available frames fail closed',()=>{
 for(const rows of [[row(0)],[row(1.5)],[row(Number.MAX_SAFE_INTEGER+1)],[row(Number.MAX_SAFE_INTEGER),row(1)],[row(Number.MAX_SAFE_INTEGER)],[row(1,'01')],[{...row(),item_id:101}]])assert.throws(()=>reference(rows),error('PRODUCTION_COST_REFERENCE_INVALID',503));
 assert.throws(()=>reference([row()],[binding(),binding()]),error('PRODUCTION_COST_REFERENCE_INVALID',503));
 assert.throws(()=>reference([row()],undefined,values({inclusive_regular_cents:-1})),error('PRODUCTION_COST_REFERENCE_INVALID',503));
 assert.throws(()=>productionCostReference({status:'AVAILABLE'},{revision:3,bindings:[]},{revision:2,values:COST_DEFAULTS}),error('PRODUCTION_COST_REFERENCE_INVALID',503));
 assert.throws(()=>productionCostReference(frame([row()]),{revision:0,bindings:[binding()]},{revision:2,values:COST_DEFAULTS}),error('PRODUCTION_COST_REFERENCE_INVALID',503));
});
test('versioned state reads are strict and missing or corrupt storage never silently resets defaults',async()=>{
 const env=await database();const first=await readProductionCosts(env);assert.equal(first.revision,1);assert.deepEqual(first.values,validateProductionCosts(COST_DEFAULTS));
 for(const payload of ['broken',JSON.stringify(values({unexpected:'PRIVATE'}))]){env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET payload=? WHERE id=1').run(payload);await assert.rejects(readProductionCosts(env),error('PRODUCTION_COST_STATE_INVALID',503));}
 env.ADMIN_DB.db.prepare('DELETE FROM production_costs_state').run();await assert.rejects(readProductionCosts(env),error('PRODUCTION_COST_STATE_INVALID',503));
});
test('save CAS versions values and audits, stale same-payload retries never duplicate audit; no other writes',async()=>{
 const env=await database();env.ADMIN_DB.db.exec('CREATE TABLE hermes_jobs (id TEXT); CREATE TABLE admin_settings (revision INTEGER); INSERT INTO admin_settings VALUES(7); CREATE TABLE variant_bindings_state (revision INTEGER); INSERT INTO variant_bindings_state VALUES(8)');
 const next=values({inclusive_regular_cents:1600,components:[component()]});const saved=await saveProductionCosts(env,{revision:1,values:next},'admin');assert.equal(saved.revision,2);assert.deepEqual(saved.values,next);
 const before=env.ADMIN_DB.db.prepare('SELECT * FROM production_costs_audit ORDER BY revision').all();await assert.rejects(saveProductionCosts(env,{revision:1,values:next},'other'),error('PRODUCTION_COSTS_CHANGED_RELOAD',409));assert.deepEqual(env.ADMIN_DB.db.prepare('SELECT * FROM production_costs_audit ORDER BY revision').all(),before);
 const audit=await readProductionCostAudit(env);assert.equal(audit.rows.length,2);assert.equal(audit.rows[0].revision,2);assert.equal(audit.rows[0].actor,'admin');assert.deepEqual(JSON.parse(audit.rows[1].payload),COST_DEFAULTS);
 assert.equal(env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM hermes_jobs').get().n,0);assert.equal(env.ADMIN_DB.db.prepare('SELECT revision FROM admin_settings').get().revision,7);assert.equal(env.ADMIN_DB.db.prepare('SELECT revision FROM variant_bindings_state').get().revision,8);
});
test('concurrent writers at one revision have one winner and exactly one matching audit',async()=>{
 const env=await database();let pending=Promise.resolve();const actualBatch=env.ADMIN_DB.batch.bind(env.ADMIN_DB);env.ADMIN_DB.batch=statements=>{const run=pending.then(()=>actualBatch(statements));pending=run.catch(()=>{});return run;};
 const outcomes=await Promise.allSettled([saveProductionCosts(env,{revision:1,values:values({inclusive_regular_cents:1600})},'one'),saveProductionCosts(env,{revision:1,values:values({inclusive_regular_cents:1700})},'two')]);assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);assert.equal(outcomes.find(result=>result.status==='rejected').reason.status,409);
 const state=await readProductionCosts(env),audit=await readProductionCostAudit(env);assert.equal(state.revision,2);assert.equal(audit.rows.length,2);assert.deepEqual(JSON.parse(audit.rows[0].payload),state.values);
});
test('conflicting future audit rolls back the entire update and preserves financial history',async()=>{
 const env=await database();const prior=await readProductionCosts(env),existing=values({inclusive_regular_cents:1800});
 env.ADMIN_DB.db.prepare('INSERT INTO production_costs_audit(revision,payload,actor,created_at) VALUES(2,?,?,?)').run(JSON.stringify(existing),'prior-audit',prior.updated_at);
 const before=await readProductionCostAudit(env);await assert.rejects(saveProductionCosts(env,{revision:1,values:values({inclusive_regular_cents:1600})},'new-admin'));
 assert.deepEqual(await readProductionCosts(env),prior);assert.deepEqual(await readProductionCostAudit(env),before);
});
test('invalid revisions and invalid bodies never write state or audit; maximal saved revision remains readable',async()=>{
 const env=await database();for(const body of [null,[],{}, {revision:1,values:COST_DEFAULTS,extra:1},...['1',0,-1,1.5,2147483647,Number.MAX_SAFE_INTEGER].map(revision=>({revision,values:COST_DEFAULTS})),{revision:1,values:values({mode:'itemized'})}])await assert.rejects(saveProductionCosts(env,body,'admin'),ProductionCostError);
 assert.equal((await readProductionCosts(env)).revision,1);assert.equal((await readProductionCostAudit(env)).rows.length,1);
 env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET revision=2147483646 WHERE id=1').run();const last=await saveProductionCosts(env,{revision:2147483646,values:COST_DEFAULTS},'admin');assert.equal(last.revision,2147483647);
});
test('audit is capped at 30 and private source fields are never projected as costs or inferred profit',async()=>{
 const env=await database();for(let revision=1;revision<=32;revision++)await saveProductionCosts(env,{revision,values:COST_DEFAULTS},'admin');const audit=await readProductionCostAudit(env);assert.equal(audit.rows.length,30);assert.equal(audit.rows[0].revision,33);
 const result=reference([{...row(),buyer_name:'PRIVATE',order_sn:'PRIVATE',model_discounted_price:999999,currency:'USD',fee:0,net_payout:0}]);assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.equal(result.total_cents,3180);assert.equal(result.gross_profit_cents,null);
});
