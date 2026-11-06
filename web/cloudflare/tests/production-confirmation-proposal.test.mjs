import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {D1} from './sqlite-d1.mjs';
import {readProductionConfirmationProposal,projectProductionConfirmationProposal} from '../src/production-confirmation-proposal.mjs';
import {readSavedProductionSourceCandidate} from '../src/incurred-production-workspace.mjs';
import {COST_SCHEMA,COST_DEFAULTS} from '../src/production-costs.mjs';
import {storeCatalogClassificationFrame} from '../src/catalog-classification.mjs';

const at=Date.UTC(2026,10,6,16,30),stamp=at/1000,now=()=>at,privateOrder='SYNTHETIC-PRIVATE-NOT-PUBLIC';
const sha=async value=>Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)))).toString('hex');
class ObservedD1 extends D1{sql=[];prepare(sql){this.sql.push(sql);return super.prepare(sql);}}
function bare(t){const db=new ObservedD1();t.after(()=>db.db.close());return {db,env:{ADMIN_DB:db}};}
async function source(t,{status='PROCESSED',model_name='SYNTHETIC saved model',quantity=7}={}){
 const f=bare(t),lineKey='101:1',payload=JSON.stringify({item_id:'101',model_id:'1',sku:'SYNTHETIC-SKU',quantity,model_name,requires_pair:false}),key=await sha([privateOrder,lineKey]),line=await sha(payload),order='a'.repeat(64);
 f.db.db.exec('CREATE TABLE production_dtf_orders(order_id TEXT PRIMARY KEY,status TEXT,checked_at INTEGER,source_hash TEXT); CREATE TABLE production_dtf_lines(unit_key TEXT PRIMARY KEY,order_id TEXT,line_key TEXT,payload TEXT,source_hash TEXT,checked_at INTEGER,missing INTEGER);');
 f.db.db.prepare('INSERT INTO production_dtf_orders VALUES(?,?,?,?)').run(privateOrder,status,stamp-30,order);
 f.db.db.prepare('INSERT INTO production_dtf_lines VALUES(?,?,?,?,?,?,?)').run(key,privateOrder,lineKey,payload,line,stamp-30,0);
 f.input={source_key:key,source_hash:await sha({key,line,order,status,missing:0})};f.db.sql=[];return f;
}
async function full(t,options={}){
 const f=await source(t,options);await f.db.batch(COST_SCHEMA.map(sql=>f.db.prepare(sql)));
 f.db.db.exec('CREATE TABLE variant_bindings_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);');
 f.costs={...COST_DEFAULTS,inclusive_regular_cents:1590,inclusive_plus_cents:2140,components:[]};
 f.db.db.prepare('INSERT INTO production_costs_state VALUES(1,7,?,?)').run(JSON.stringify(f.costs),new Date(at-30000).toISOString());
 f.db.db.prepare('INSERT INTO variant_bindings_state VALUES(1,3,?,?)').run('[]',new Date(at-30000).toISOString());
 f.db.db.prepare('UPDATE production_cost_rules_state SET revision=4,updated_at=?').run(new Date(at-30000).toISOString());
 f.db.sql=[];return f;
}
async function catalog(f,{attributes=[{name:'Cor',value:'Preta'},{name:'Tamanho',value:'M'}],bindings=[{item_id:'101',model_id:'1',size:'M'}],name='Camiseta sintética',kit=false,model='1'}={}){
 const frame={schema:'variant_catalog_v1',checked_at:stamp-20,products:[{item_id:'101',catalog_fingerprint:'b'.repeat(64),bindings,unresolved_count:bindings.length?0:1,...(kit?{}:{selling_unit:'SINGLE_GARMENT'}),cost_catalog:{schema:'product_cost_catalog_v1',product_name:name,variants:[{model_id:model,attributes}]}}]};
 await storeCatalogClassificationFrame(f.env,frame,{now});f.db.sql=[];
}
function setBindings(f,rows){f.db.db.prepare('UPDATE variant_bindings_state SET payload=?').run(JSON.stringify(rows));}
const binding=extra=>({item_id:'101',model_id:'1',selling_unit:'SINGLE_GARMENT',size:'M',operator_confirmed:true,...extra});
const read=f=>readProductionConfirmationProposal(f.env,f.input,{now});
const assertReadOnly=f=>assert.ok(f.db.sql.every(sql=>/^SELECT\b/.test(sql)),f.db.sql.find(sql=>!/^SELECT\b/.test(sql)));
const tableSnapshot=f=>JSON.stringify(f.db.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name,sql})=>({name,sql,rows:f.db.db.prepare('SELECT * FROM '+name+' ORDER BY 1').all()})));

test('cold proposal is closed, unavailable and SELECT-only without initializing tables',async t=>{
 const f=bare(t),value=await readProductionConfirmationProposal(f.env,{source_key:'a'.repeat(64),source_hash:'b'.repeat(64)},{now});
 assert.equal(value.state,'UNAVAILABLE');assert.equal(value.source,null);assert.equal(value.cost.unit_cost_cents,null);assert.equal(value.composition.components.length,0);assert.deepEqual(projectProductionConfirmationProposal(value),value);
 assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);assertReadOnly(f);
});

test('request bounds and descriptors are checked before storage or accessors',async t=>{
 const f=bare(t);let called=0;const accessor={source_key:'a'.repeat(64)};Object.defineProperty(accessor,'source_hash',{enumerable:true,get(){called++;return 'b'.repeat(64);}});
 for(const input of [null,{},accessor,{source_key:'A'.repeat(64),source_hash:'b'.repeat(64)},{source_key:'a'.repeat(65),source_hash:'b'.repeat(64)},{source_key:'a'.repeat(64),source_hash:'b'.repeat(64),extra:1}])await assert.rejects(readProductionConfirmationProposal(f.env,input,{now}),error=>error.status===400);
 assert.equal(called,0);assert.equal(f.db.sql.length,0);
 await assert.rejects(readProductionConfirmationProposal(f.env,{source_key:'a'.repeat(64),source_hash:'b'.repeat(64)},{now:()=>NaN}),error=>error.status===503);
});

test('shared source validator hides private order identity and rejects stale hashes',async t=>{
 const f=await source(t,{status:'CANCELLED'}),candidate=await readSavedProductionSourceCandidate(f.env,f.input,{now}),value=await read(f);
 assert.equal(candidate.order_status,'CANCELLED');assert.equal(value.source.selling_quantity,7);assert.equal(value.source.quantity_basis,'SAVED_SELLING_UNITS_NOT_PRODUCED_PIECES');assert.ok(!JSON.stringify(value).includes(privateOrder));assertReadOnly(f);
 await assert.rejects(readProductionConfirmationProposal(f.env,{...f.input,source_hash:'c'.repeat(64)},{now}),error=>error.status===409&&error.message==='PRODUCTION_CONFIRMATION_PROPOSAL_SOURCE_CHANGED');
 f.db.db.prepare('UPDATE production_dtf_lines SET payload=?').run('{}');const corrupt=await read(f);assert.equal(corrupt.state,'UNAVAILABLE');assert.equal(corrupt.source,null);
});

test('saved line labels never infer type, manufacturing, artwork or current unit cost',async t=>{
 const f=await source(t,{model_name:'Camiseta infantil 2 + M + G 3 peças UNISSEX',quantity:9}),before=tableSnapshot(f),value=await read(f);
 assert.equal(value.state,'AVAILABLE');assert.equal(value.catalog.state,'UNKNOWN');assert.equal(value.composition.state,'UNKNOWN');assert.equal(value.cost.state,'UNKNOWN');assert.equal(value.source.selling_quantity,9);assert.equal(tableSnapshot(f),before);assertReadOnly(f);
 for(const key of ['quantity','produced_date','evidence','confirmed','inventory_value_cents'])assert.ok(!Object.hasOwn(value,key));
});

test('manual adult binding suggests exact saved size and unique color while cost stays commercial information',async t=>{
 const f=await full(t);await catalog(f);setBindings(f,[binding({size:'G1'})]);f.db.sql=[];const before=tableSnapshot(f),value=await read(f),part=value.composition.components[0];
 assert.equal(value.catalog.state,'AVAILABLE');assert.equal(value.catalog.product_name,'Camiseta sintética');assert.equal(value.composition.basis,'MANUAL_BINDING');assert.equal(part.identity.size,'G1');assert.equal(part.identity.color,'Preta');assert.equal(part.identity.fit,'UNKNOWN');assert.equal(part.identity.artwork,null);assert.equal(part.quantity_per_commercial_unit,1);
 assert.equal(value.cost.state,'AVAILABLE');assert.equal(value.cost.unit_cost_cents,2140);assert.equal(value.cost.scope,'COMMERCIAL_UNIT');assert.equal(value.source.selling_quantity,7);assert.deepEqual(value.versions,{bindings:3,costs:7,cost_rules:4,classifications:2,historical:1});assert.equal(tableSnapshot(f),before);assertReadOnly(f);
});

test('automatic binding is accepted only from the saved validated catalog fingerprint',async t=>{
 const f=await full(t);await catalog(f);const value=await read(f);
 assert.equal(value.composition.basis,'CATALOG_BINDING');assert.equal(value.composition.components[0].identity.size,'M');assert.equal(value.catalog.catalog_fingerprint,'b'.repeat(64));assert.equal(value.cost.unit_cost_cents,1590);assertReadOnly(f);
 f.db.db.prepare('UPDATE catalog_classification_jobs SET catalog_fingerprint=?').run('c'.repeat(64));const changed=await read(f);assert.equal(changed.catalog.state,'UNKNOWN');assert.equal(changed.composition.state,'UNKNOWN');assert.equal(changed.cost.state,'UNKNOWN');
});

test('explicit male/female kit keeps whole-kit cost separate from component identities and sold count',async t=>{
 const f=await full(t);await catalog(f,{kit:true,attributes:[{name:'Tamanho Masculino',value:'M'},{name:'Tamanho Feminino',value:'G1'}],bindings:[{item_id:'101',model_id:'1',male_size:'M',female_size:'G1'}]});const before=tableSnapshot(f),value=await read(f);
 assert.equal(value.cost.unit_cost_cents,3730);assert.equal(value.cost.scope,'COMMERCIAL_UNIT');assert.equal(value.composition.components.length,2);assert.deepEqual(value.composition.components.map(row=>[row.identity.fit,row.identity.size,row.quantity_per_commercial_unit]),[['MALE','M',1],['FEMALE','G1',1]]);
 for(const row of value.composition.components){assert.equal(row.identity.color,null);assert.equal(row.identity.artwork,null);assert.ok(!Object.hasOwn(row,'unit_cost_cents'));assert.ok(!Object.hasOwn(row,'quantity'));}
 assert.equal(tableSnapshot(f),before);assertReadOnly(f);
});

test('explicit combo recipe supplies sizes and multiplicity without inventing fit or allocating its price',async t=>{
 const f=await full(t);await catalog(f,{name:'Combo sintético',attributes:[{name:'Cor',value:'Preto'},{name:'Tamanho Pai Mae Filho',value:'P + M + G'}],bindings:[]});
 const costs={...f.costs,composition_recipes:[{id:'three',label:'Combo confirmado',components:['P','M','G'].map(size=>({kind:'ADULT_GARMENT',size,quantity:1}))}],composition_assignments:[{item_id:'101',model_id:'1',recipe_id:'three'}]};f.db.db.prepare('UPDATE production_costs_state SET payload=?').run(JSON.stringify(costs));f.db.sql=[];const value=await read(f);
 assert.equal(value.composition.basis,'EXPLICIT_RECIPE');assert.equal(value.cost.unit_cost_cents,4770);assert.deepEqual(value.composition.components.map(row=>row.identity.size),['P','M','G']);assert.ok(value.composition.components.every(row=>row.identity.fit==='UNKNOWN'&&row.identity.color==='Preto'));assertReadOnly(f);
});

test('explicit child assignment supplies its exact child size but remains a current selling-unit cost',async t=>{
 const f=await full(t);await catalog(f,{name:'Produto sintético',attributes:[{name:'Cor',value:'Amarela'},{name:'Tamanho',value:'2'}],bindings:[]});
 const row=f.db.db.prepare('SELECT payload FROM production_cost_rules_state').get(),values=JSON.parse(row.payload);values.rules[0].options.push('2');values.assignments=[{item_id:'101',model_id:'1',rule_id:'camiseta-infantil',size:'2'}];f.db.db.prepare('UPDATE production_cost_rules_state SET payload=?').run(JSON.stringify(values));f.db.sql=[];const value=await read(f),part=value.composition.components[0];
 assert.equal(value.composition.basis,'EXPLICIT_CHILD_RULE');assert.equal(part.identity.garment_type,'CHILD');assert.equal(part.identity.size,'2');assert.equal(part.identity.fit,'UNKNOWN');assert.equal(value.cost.unit_cost_cents,1250);assertReadOnly(f);
});

test('a size axis alone cannot prove a single physical piece or select a garment family',async t=>{
 const f=await full(t);await catalog(f,{name:'Infantil unissex no título não prova modelagem',attributes:[{name:'Cor',value:'Verde'},{name:'Tamanho',value:'2'}],bindings:[]});const value=await read(f),part=value.composition.components[0];
 assert.equal(value.composition.basis,'SIZE_AXIS');assert.equal(part.quantity_per_commercial_unit,null);assert.equal(part.identity.size,'2');assert.equal(part.identity.garment_type,'UNKNOWN');assert.equal(part.identity.fit,'UNKNOWN');assert.equal(part.identity.artwork,null);
});

test('catalog metadata changes suppress component suggestions and costs, including saved manual bindings',async t=>{
 const f=await full(t);await catalog(f);setBindings(f,[binding()]);f.db.db.prepare('INSERT INTO catalog_classification_changes VALUES(?,?,?)').run('101','11111111-1111-4111-8111-111111111111',stamp-5);f.db.sql=[];const value=await read(f);
 assert.equal(value.catalog.state,'CHANGED');assert.equal(value.catalog.model_name,null);assert.deepEqual(value.catalog.attributes,[]);assert.equal(value.composition.state,'UNKNOWN');assert.equal(value.composition.reason,'CATALOG_METADATA_CHANGED');assert.equal(value.cost.unit_cost_cents,null);assertReadOnly(f);
});

test('missing models, corrupt metadata and future cost revisions stay unknown without rereading providers',async t=>{
 const f=await full(t);await catalog(f,{model:'2',bindings:[{item_id:'101',model_id:'2',size:'M'}]});let value=await read(f);assert.equal(value.catalog.state,'UNKNOWN');assert.equal(value.catalog.reason,'MODEL_NOT_IN_CATALOG');assert.equal(value.composition.state,'UNKNOWN');assert.equal(value.cost.state,'UNKNOWN');
 setBindings(f,[binding()]);f.db.db.prepare('UPDATE production_costs_state SET updated_at=?').run(new Date(at+1000).toISOString());value=await read(f);assert.equal(value.cost.state,'UNKNOWN');assert.equal(value.versions.costs,null);assertReadOnly(f);
 f.db.db.prepare('UPDATE catalog_classification_variants SET payload=?').run('{bad');value=await read(f);assert.equal(value.catalog.state,'UNKNOWN');assert.equal(value.cost.state,'UNKNOWN');assert.equal(value.composition.basis,'MANUAL_BINDING');
});

test('conflicting explicit compositions do not produce guessed component identities',async t=>{
 const f=await full(t);await catalog(f);setBindings(f,[binding()]);const costs={...f.costs,composition_recipes:[{id:'pair',label:'Duas peças',components:[{kind:'ADULT_GARMENT',size:'G',quantity:2}]}],composition_assignments:[{item_id:'101',model_id:'1',recipe_id:'pair'}]};f.db.db.prepare('UPDATE production_costs_state SET payload=?').run(JSON.stringify(costs));const value=await read(f);
 assert.equal(value.composition.state,'AMBIGUOUS');assert.equal(value.composition.reason,'COMPOSITION_CONFLICT');assert.equal(value.composition.components.length,0);assert.equal(value.cost.unit_cost_cents,3180);
});

test('rule catalog metadata must match the current classification snapshot and cannot be future-dated',async t=>{
 const f=await full(t);await catalog(f);f.db.db.prepare('UPDATE production_cost_catalog SET catalog_fingerprint=?').run('e'.repeat(64));let value=await read(f);assert.equal(value.cost.state,'UNKNOWN');assert.equal(value.versions.cost_rules,null);assert.equal(value.composition.basis,'CATALOG_BINDING');
 f.db.db.prepare('UPDATE production_cost_catalog SET catalog_fingerprint=?,checked_at=?').run('b'.repeat(64),stamp+1);value=await read(f);assert.equal(value.cost.state,'UNKNOWN');assert.equal(value.versions.historical,null);assertReadOnly(f);
});

test('catalog source changes during a read invalidate the selected source before returning a suggestion',async t=>{
 const f=await full(t);await catalog(f);const batch=f.db.batch.bind(f.db);f.db.batch=async statements=>{const result=await batch(statements);f.db.db.prepare('UPDATE production_dtf_orders SET status=?,source_hash=?').run('CANCELLED','d'.repeat(64));return result;};
 await assert.rejects(read(f),error=>error.status===409&&error.message==='PRODUCTION_CONFIRMATION_PROPOSAL_SOURCE_CHANGED');assertReadOnly(f);
});

test('closed browser projector rejects facts, accessors, sparse components and incompatible suggested fields',async t=>{
 const f=await full(t);await catalog(f);const value=await read(f),clone=()=>structuredClone(value),bad=[];
 let row=clone();row.produced_date='2026-11-06';bad.push(row);row=clone();row.composition.components[0].identity.confirmed=true;bad.push(row);row=clone();row.composition.components[0].identity.artwork='Title-derived artwork';bad.push(row);row=clone();row.composition.components[0].identity.garment_type='CHILD';bad.push(row);row=clone();row.cost.scope='PHYSICAL_PIECE';bad.push(row);row=clone();row.versions.costs=null;bad.push(row);row=clone();row.composition.components.length=2;bad.push(row);row=clone();row.composition.components.push(...Array.from({length:4},()=>row.composition.components[0]));bad.push(row);row=clone();row.source.checked_at=value.checked_at+1;bad.push(row);row=clone();row.source.order_id=privateOrder;bad.push(row);row=clone();row.catalog.attributes[0].name='Tamanho';bad.push(row);
 for(const candidate of bad)assert.equal(projectProductionConfirmationProposal(candidate),null);
 let called=0;row=clone();Object.defineProperty(row.cost,'unit_cost_cents',{enumerable:true,get(){called++;return 1590;}});assert.equal(projectProductionConfirmationProposal(row),null);assert.equal(called,0);
 const browserProjector=Function('return ('+projectProductionConfirmationProposal.toString()+')')();assert.deepEqual(browserProjector(value),value);
});
