import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {COST_DEFAULTS,COST_SCHEMA,ProductionCostError,validateProductionCosts,readProductionCosts,saveProductionCosts,readProductionCostAudit,productionCostReference} from '../src/production-costs.mjs';

const base=changes=>({...COST_DEFAULTS,components:[],...changes});
const profile=(id='pants',unit_cost_cents=5000,label='Calça moletom')=>({id,label,unit_cost_cents});
const assignment=(item_id='101',model_id=null,profile_id='pants')=>({item_id,model_id,profile_id});
const custom=changes=>base({custom_profiles:[profile()],custom_assignments:[assignment()],...changes});
const reference=(rows,values=custom(),bindings=[])=>productionCostReference({status:'AVAILABLE',rows},{revision:3,bindings},{revision:7,values});
const row=(item_id='101',model_id='0',quantity=1)=>({item_id,model_id,quantity});
const single=(item_id='201',model_id='0')=>({item_id,model_id,size:'P',selling_unit:'SINGLE_GARMENT',operator_confirmed:true});
const kit=(item_id='101',model_id='0')=>({item_id,model_id,male_size:'G1',female_size:'G2',selling_unit:'ONE_MALE_ONE_FEMALE_KIT',operator_confirmed:true});
const error=(code,status=400)=>value=>value instanceof ProductionCostError&&value.message===code&&value.status===status;
async function database(values=COST_DEFAULTS){
 const env={ADMIN_DB:new D1()};await env.ADMIN_DB.batch(COST_SCHEMA.map(sql=>env.ADMIN_DB.prepare(sql)));
 const time='2026-10-23T12:00:00Z',raw=JSON.stringify(validateProductionCosts(values));
 env.ADMIN_DB.db.prepare('INSERT INTO production_costs_state VALUES(1,1,?,?)').run(raw,time);
 env.ADMIN_DB.db.prepare('INSERT INTO production_costs_audit(revision,payload,actor,created_at) VALUES(1,?,?,?)').run(raw,'initial',time);return env;
}
const snapshot=env=>({state:env.ADMIN_DB.db.prepare('SELECT * FROM production_costs_state').all(),audit:env.ADMIN_DB.db.prepare('SELECT * FROM production_costs_audit ORDER BY revision').all()});

test('optional custom fields preserve legacy shape and normalize detached profiles and product/model assignments',()=>{
 assert.deepEqual(validateProductionCosts(base()),base());
 const input=custom({custom_profiles:[profile('z',7000,'  Moletom  '),profile('a',5000,'<Calça>')],custom_assignments:[assignment('201','10','z'),assignment('101','0','a'),assignment('201',null,'a'),assignment('201','2','z')]});
 const output=validateProductionCosts(input);
 assert.deepEqual(output.custom_profiles,[profile('a',5000,'<Calça>'),profile('z',7000,'Moletom')]);
 assert.deepEqual(output.custom_assignments,[assignment('101','0','a'),assignment('201',null,'a'),assignment('201','2','z'),assignment('201','10','z')]);
 output.custom_profiles[0].unit_cost_cents=1;output.custom_assignments[0].profile_id='z';
 assert.equal(input.custom_profiles[1].unit_cost_cents,5000);assert.equal(input.custom_assignments[1].profile_id,'a');
 assert.deepEqual(validateProductionCosts(custom({custom_profiles:[],custom_assignments:[]})),custom({custom_profiles:[],custom_assignments:[]}));
});

test('custom profiles require exact positive cent amounts, unique bounded identifiers and valid labels',()=>{
 for(const input of [base({custom_profiles:[]}),base({custom_assignments:[]}),custom({custom_profiles:null}),custom({custom_assignments:null})])assert.throws(()=>validateProductionCosts(input),ProductionCostError);
 for(const invalid of [null,[],{...profile(),extra:1},profile('',1),profile('UPPER',1),profile('bad id',1),profile('a'.repeat(65),1),profile('pants',0),profile('pants',-0),profile('pants',-1),profile('pants',0.1),profile('pants','100'),profile('pants',1000001),profile('pants',Number.MAX_SAFE_INTEGER),profile('pants',Infinity),profile('pants',NaN),profile('pants',1,''),profile('pants',1,'x'.repeat(61)),profile('pants',1,'x\ny'),profile('pants',1,'x\u0085y')])assert.throws(()=>validateProductionCosts(custom({custom_profiles:[invalid]})),ProductionCostError);
 assert.throws(()=>validateProductionCosts(custom({custom_profiles:[profile(),profile()]})),error('COSTS_CUSTOM_PROFILE_INVALID'));
 const profiles=Array.from({length:100},(_,index)=>profile('p'+index,1,'Peça '+index));
 assert.equal(validateProductionCosts(custom({custom_profiles:profiles,custom_assignments:[]})).custom_profiles.length,100);
 assert.throws(()=>validateProductionCosts(custom({custom_profiles:[...profiles,profile('one-too-many')],custom_assignments:[]})),error('COSTS_CUSTOM_PROFILES_INVALID'));
});

test('custom assignments validate scope identity, profile membership, duplicates and maximum count',()=>{
 for(const invalid of [null,[],{...assignment(),extra:1},assignment(101),assignment('01'),assignment('0'),assignment('1'.repeat(21)),assignment('101',0),assignment('101','01'),assignment('101','-1'),assignment('101','1'.repeat(21)),{...assignment(),model_id:undefined},assignment('101',null,'missing')])assert.throws(()=>validateProductionCosts(custom({custom_assignments:[invalid]})),ProductionCostError);
 for(const duplicate of [[assignment(),assignment()],[assignment('101','0'),assignment('101','0')]])assert.throws(()=>validateProductionCosts(custom({custom_assignments:duplicate})),error('COSTS_CUSTOM_ASSIGNMENT_DUPLICATE'));
 assert.equal(validateProductionCosts(custom({custom_assignments:[assignment(),assignment('101','0')]})).custom_assignments.length,2);
 const assignments=Array.from({length:1000},(_,index)=>assignment(String(index+1)));
 assert.equal(validateProductionCosts(custom({custom_assignments:assignments})).custom_assignments.length,1000);
 assert.throws(()=>validateProductionCosts(custom({custom_assignments:[...assignments,assignment('1001')]})),error('COSTS_CUSTOM_ASSIGNMENTS_INVALID'));
});

test('accessors, sparse or augmented arrays and inherited custom objects are rejected without evaluating getters',()=>{
 let calls=0;const accessor=()=>{calls++;return 'pants';};
 const profileGetter=profile();Object.defineProperty(profileGetter,'label',{get:accessor,enumerable:true});
 const assignmentGetter=assignment();Object.defineProperty(assignmentGetter,'item_id',{get:accessor,enumerable:true});
 const arrayGetter=[profile()];Object.defineProperty(arrayGetter,'0',{get:accessor,enumerable:true,configurable:true});
 const valuesGetter=custom();Object.defineProperty(valuesGetter,'custom_profiles',{get:accessor,enumerable:true});
 const augmented=[profile()];augmented.private='extra';const symbolProfile=profile();symbolProfile[Symbol('extra')]=1;
 for(const input of [custom({custom_profiles:[profileGetter]}),custom({custom_assignments:[assignmentGetter]}),custom({custom_profiles:arrayGetter}),valuesGetter,custom({custom_profiles:new Array(1)}),custom({custom_profiles:augmented}),custom({custom_profiles:[symbolProfile]}),custom({custom_profiles:[Object.assign(Object.create({}),profile())]})])assert.throws(()=>validateProductionCosts(input),ProductionCostError);
 assert.equal(calls,0);
});

test('one product assignment costs all current and future variations with no catalog binding or garment assumptions',()=>{
 const output=reference([row('101','0',2),row('101','9',3),row('101','99999999999999999999',1)]);
 assert.equal(output.total_cents,30000);assert.equal(output.known_subset_cents,30000);assert.equal(output.mapped_quantity,6);assert.equal(output.unmapped_quantity,0);
 for(const variant of output.variants){assert.equal(variant.unit_cost_cents,5000);assert.equal(variant.cost_source,'CUSTOM_PROFILE');assert.equal(variant.cost_profile_id,'pants');assert.equal(variant.cost_profile_label,'Calça moletom');}
 assert.equal(output.gross_profit_cents,null);assert.equal(output.financial_status,'FINANCIAL_DATA_UNAVAILABLE');
});

test('variant assignment wins over product assignment and full custom unit cost never gains kit multipliers or components',()=>{
 const values=custom({mode:'itemized',base_regular_cents:1000,base_plus_cents:1400,components:[{id:'pack',label:'Embalagem',basis:'per_kit',amount_cents:999}],custom_profiles:[profile(),profile('hoodie',7500,'Moletom'),profile('couple-kit',4200,'Kit casal')],custom_assignments:[assignment('101',null,'pants'),assignment('101','0','hoodie'),assignment('301',null,'couple-kit')]});
 const output=reference([row('101','0',2),row('101','1',1),row('301','0',3)],values,[kit('101','0'),kit('101','1'),kit('301','0')]);
 assert.deepEqual(output.variants.map(variant=>variant.unit_cost_cents),[7500,5000,4200]);assert.equal(output.total_cents,32600);
 assert.equal(output.variants[2].production_cost_cents,12600);
});

test('custom and legacy costs can coexist while truly unpriced products remain pending',()=>{
 const output=reference([row('101','0',2),row('201','0',3),row('401','0',1)],custom(),[single()]);
 assert.deepEqual(output.variants.map(variant=>variant.unit_cost_cents),[5000,1590,null]);assert.equal(output.total_cents,null);assert.equal(output.known_subset_cents,14770);assert.equal(output.mapped_quantity,5);assert.equal(output.unmapped_quantity,1);
 assert.deepEqual(Object.keys(output.variants[1]).sort(),['item_id','model_id','quantity','unit_cost_cents','production_cost_cents'].sort());
 assert.equal(reference([row('401','0',1)],custom(),[kit('401','0')]).total_cents,3780);
});

test('unsafe custom quantity multiplication and grouping fail closed instead of releasing a subtotal',()=>{
 for(const rows of [[row('101','0',Number.MAX_SAFE_INTEGER)],[row('101','0',Number.MAX_SAFE_INTEGER),row('101','0',1)]])assert.throws(()=>reference(rows),error('PRODUCTION_COST_REFERENCE_INVALID',503));
});

test('custom cost saves are versioned and audited; an edited shared profile updates every assignment without altering prior history',async()=>{
 const env=await database();const first=await saveProductionCosts(env,{revision:1,values:custom({custom_assignments:[assignment(),assignment('201')]})},'admin');
 assert.equal(first.revision,2);assert.deepEqual(first.values.custom_profiles,[profile()]);
 const changed=custom({custom_profiles:[profile('pants',5500)],custom_assignments:[assignment(),assignment('201')]});
 const next=await saveProductionCosts(env,{revision:2,values:changed},'admin');assert.equal(next.revision,3);assert.equal(reference([row(),row('201')],next.values).total_cents,11000);
 const audit=await readProductionCostAudit(env);assert.equal(audit.rows.length,3);assert.equal(JSON.parse(audit.rows[0].payload).custom_profiles[0].unit_cost_cents,5500);assert.equal(JSON.parse(audit.rows[1].payload).custom_profiles[0].unit_cost_cents,5000);assert.deepEqual(JSON.parse(audit.rows[2].payload),base());
 const before=snapshot(env);await assert.rejects(saveProductionCosts(env,{revision:2,values:changed},'stale'),error('PRODUCTION_COSTS_CHANGED_RELOAD',409));assert.deepEqual(snapshot(env),before);
});

test('an old six-field client cannot erase saved custom data; clearing both custom lists remains explicit and audited',async()=>{
 const env=await database(custom());const before=snapshot(env);
 await assert.rejects(saveProductionCosts(env,{revision:1,values:base({inclusive_regular_cents:1800})},'old-client'),error('COSTS_CUSTOM_FIELDS_REQUIRED',409));assert.deepEqual(snapshot(env),before);
 await assert.rejects(saveProductionCosts(env,{revision:1,values:custom({custom_profiles:[]})},'dangling'),ProductionCostError);assert.deepEqual(snapshot(env),before);
 const cleared=await saveProductionCosts(env,{revision:1,values:custom({custom_profiles:[],custom_assignments:[]})},'admin');assert.equal(cleared.revision,2);assert.deepEqual(cleared.values.custom_profiles,[]);
 const legacy=await saveProductionCosts(env,{revision:2,values:base()},'compatible-client');assert.equal(legacy.revision,3);assert.deepEqual(legacy.values,base());
});

test('payload CAS also rejects a changed snapshot at the same revision and preserves the competing custom data',async()=>{
 const env=await database(custom()),actualBatch=env.ADMIN_DB.batch.bind(env.ADMIN_DB),competing=validateProductionCosts(custom({custom_profiles:[profile('pants',6000)]}));
 let injected=false;env.ADMIN_DB.batch=async statements=>{if(!injected){injected=true;env.ADMIN_DB.db.prepare('UPDATE production_costs_state SET payload=? WHERE id=1').run(JSON.stringify(competing));}return actualBatch(statements);};
 await assert.rejects(saveProductionCosts(env,{revision:1,values:custom({custom_profiles:[profile('pants',7000)]})},'stale'),error('PRODUCTION_COSTS_CHANGED_RELOAD',409));
 assert.deepEqual((await readProductionCosts(env)).values,competing);assert.equal((await readProductionCostAudit(env)).rows.length,1);
});

test('concurrent custom writers have one winner and audit conflicts roll back profile changes atomically',async()=>{
 const env=await database(custom());let pending=Promise.resolve();const actualBatch=env.ADMIN_DB.batch.bind(env.ADMIN_DB);env.ADMIN_DB.batch=statements=>{const run=pending.then(()=>actualBatch(statements));pending=run.catch(()=>{});return run;};
 const results=await Promise.allSettled([5001,5002].map(amount=>saveProductionCosts(env,{revision:1,values:custom({custom_profiles:[profile('pants',amount)]})},'admin')));
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.find(result=>result.status==='rejected').reason.status,409);
 const current=await readProductionCosts(env),audit=await readProductionCostAudit(env);assert.equal(current.revision,2);assert.equal(audit.rows.length,2);assert.deepEqual(JSON.parse(audit.rows[0].payload),current.values);
 env.ADMIN_DB.db.prepare('INSERT INTO production_costs_audit(revision,payload,actor,created_at) VALUES(3,?,?,?)').run(JSON.stringify(custom()),'existing',current.updated_at);
 const before=snapshot(env);await assert.rejects(saveProductionCosts(env,{revision:2,values:custom({custom_profiles:[profile('pants',9999)]})},'admin'));assert.deepEqual(snapshot(env),before);
});
