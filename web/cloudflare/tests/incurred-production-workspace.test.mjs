import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {D1} from './sqlite-d1.mjs';
import {readIncurredProductionWorkspace,mutateIncurredProductionWorkspace} from '../src/incurred-production-workspace.mjs';
import {COST_DEFAULTS,productionCostReference} from '../src/production-costs.mjs';

const at=Date.UTC(2026,10,1,18),selection={month:'2026-10',week_of:'2026-11-01'};
const uuid=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0');
const identity={artwork:'Arte sintética',color:'Preta',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:'100',model_id:'0',sku:'SYNTHETIC-M'};
const sha=async value=>Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value)))).toString('hex');
class ObservedD1 extends D1{constructor(){super();this.sql=[];}prepare(sql){this.sql.push(sql);return super.prepare(sql);}}
function bare(t){const db=new ObservedD1(),clock={time:at};t.after(()=>db.db.close());return {db,env:{ADMIN_DB:db},clock,now:()=>clock.time};}
async function fixture(t){
 const f=bare(t),stamp=at/1000-30,serial='SYNTHETIC-PRIVATE-ORDER',lineKey='100:0';
 f.db.db.exec('CREATE TABLE production_dtf_orders(order_id TEXT PRIMARY KEY,status TEXT,checked_at INTEGER,source_hash TEXT); CREATE TABLE production_dtf_lines(unit_key TEXT PRIMARY KEY,order_id TEXT,line_key TEXT,payload TEXT,source_hash TEXT,checked_at INTEGER,missing INTEGER); CREATE TABLE production_costs_state(id INTEGER PRIMARY KEY,revision INTEGER,payload TEXT,updated_at TEXT);');
 const payload=JSON.stringify({item_id:'100',model_id:'0',sku:'SYNTHETIC-M',quantity:1,model_name:'Combo de três camisetas',requires_pair:false}),key=await sha([serial,lineKey]);
 f.db.db.prepare('INSERT INTO production_dtf_orders VALUES(?,?,?,?)').run(serial,'CANCELLED',stamp,'a'.repeat(64));
 f.db.db.prepare('INSERT INTO production_dtf_lines VALUES(?,?,?,?,?,?,?)').run(key,serial,lineKey,payload,await sha(payload),stamp,0);
 f.costValues={...COST_DEFAULTS,inclusive_regular_cents:1590,inclusive_plus_cents:2140,components:[]};
 f.db.db.prepare('INSERT INTO production_costs_state VALUES(1,7,?,?)').run(JSON.stringify(f.costValues),new Date(at-30000).toISOString());
 f.db.sql=[];return {...f,serial,key};
}
function record(n,extra={}){return {revision:0,request_id:uuid(n),action:'record',record_id:uuid(n+100),production_ref:'LOTE-SINTETICO-'+n,replaces_record_id:null,produced_date:'2026-10-30',quantity:3,identity:{...identity},source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:1590,reference:null},evidence:'Confecção e custo declarados pelo operador sintético',confirmed:true,...extra};}
const existing=f=>JSON.stringify(['production_dtf_orders','production_dtf_lines','production_costs_state'].map(name=>[name,f.db.db.prepare('SELECT * FROM '+name+' ORDER BY 1').all()]));

test('cold incurred workspace is SELECT-only and no records means unknown operational cost',async t=>{
 const f=bare(t),value=await readIncurredProductionWorkspace(f.env,selection,{now:f.now});
 assert.equal(value.schema,'incurred_production_workspace_v1');assert.equal(value.ledger.revision,0);assert.equal(value.source.status,'UNAVAILABLE');assert.equal(value.references.status,'UNAVAILABLE');
 for(const period of [value.periods.monthly,value.periods.weekly]){assert.equal(period.summary.state,'NO_RECORDS');assert.equal(period.summary.total_cost_cents,null);assert.equal(period.summary.known_cost_cents,0);}
 assert.equal(value.ledger.inventory_valuation.amount_cents,null);assert.equal(value.ledger.financial_integration_allowed,false);assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);assert.ok(f.db.sql.every(sql=>/^SELECT\b/.test(sql)));
});

test('saved cancelled kit context cannot manufacture pieces or turn selling quantity into physical quantity',async t=>{
 const f=await fixture(t),before=existing(f),value=await readIncurredProductionWorkspace(f.env,selection,{now:f.now}),source=value.source.candidates[0];
 assert.equal(source.order_status,'CANCELLED');assert.equal(source.selling_quantity,1);assert.equal(source.quantity_basis,'SAVED_SELLING_UNITS_NOT_PRODUCED_PIECES');assert.equal(source.order_hash,await sha(f.serial));assert.equal(value.ledger.summary.produced_quantity,0);assert.equal(value.references.adult_regular_cents,1590);assert.equal(value.references.revision,7);
 assert.ok(!JSON.stringify(value).includes(f.serial));assert.ok(!JSON.stringify(value).includes('requires_pair'));assert.equal(existing(f),before);assert.ok(f.db.sql.every(sql=>/^SELECT\b/.test(sql)));
 const body=record(1,{source:{kind:'SAVED_DTF_ORDER_LINE',key:source.key,hash:source.hash},cost:{unit_cost_cents:1590,reference:{kind:'ADULT_REGULAR',revision:7,mode:'all_inclusive',unit_cost_cents:1590}}});
 const saved=await mutateIncurredProductionWorkspace(f.env,selection,body,'synthetic-owner',{now:f.now});
 assert.equal(saved.ledger.summary.produced_quantity,3);assert.equal(saved.ledger.summary.total_cost_cents,4770);assert.equal(saved.ledger.records[0].source.selling_quantity,1);assert.equal(saved.ledger.records[0].quantity,3);assert.equal(saved.periods.monthly.summary.total_cost_cents,4770);assert.equal(existing(f),before);assert.equal(saved.ledger.inventory_valuation.amount_cents,null);
 const reference=productionCostReference({status:'AVAILABLE',rows:[{item_id:'100',model_id:'0',quantity:1}]},{revision:1,bindings:[{item_id:'100',model_id:'0',selling_unit:'SINGLE_GARMENT',size:'M',operator_confirmed:true}]},{revision:7,values:f.costValues});
 assert.equal(reference.total_cents,1590,'eligible/reference formula never adds the independent 4770 incurred declaration');
});

test('historical cost and provenance survive source cancellation changes, cost revisions, deletion and timeout replay',async t=>{
 const f=await fixture(t),initial=await readIncurredProductionWorkspace(f.env,selection,{now:f.now}),source=initial.source.candidates[0];
 const body=record(2,{source:{kind:'SAVED_DTF_ORDER_LINE',key:source.key,hash:source.hash},cost:{unit_cost_cents:1590,reference:{kind:'ADULT_REGULAR',revision:7,mode:'all_inclusive',unit_cost_cents:1590}}});
 const first=await mutateIncurredProductionWorkspace(f.env,selection,body,'synthetic-owner',{now:f.now}),fact=structuredClone(first.ledger.records[0]);
 f.clock.time+=1000;f.db.db.prepare('UPDATE production_dtf_orders SET status=?,checked_at=?,source_hash=?').run('TO_RETURN',f.clock.time/1000,'c'.repeat(64));f.db.db.prepare('UPDATE production_costs_state SET revision=8,payload=?').run(JSON.stringify({...f.costValues,inclusive_regular_cents:1790}));
 let current=await readIncurredProductionWorkspace(f.env,selection,{now:f.now});assert.deepEqual(current.ledger.records[0],fact);assert.equal(current.source.candidates[0].order_status,'TO_RETURN');assert.equal(current.references.adult_regular_cents,1790);assert.equal(current.ledger.summary.total_cost_cents,4770);
 await assert.rejects(mutateIncurredProductionWorkspace(f.env,selection,record(3,{revision:1,source:body.source}),'synthetic-owner',{now:f.now}),e=>e.status===409&&e.message==='INCURRED_PRODUCTION_SOURCE_CHANGED');
 f.db.db.exec('DELETE FROM production_dtf_orders; DELETE FROM production_dtf_lines; DROP TABLE production_costs_state;');
 current=await mutateIncurredProductionWorkspace(f.env,selection,body,'synthetic-owner',{now:f.now});assert.equal(current.ledger.records.length,1);assert.deepEqual(current.ledger.records[0],fact);assert.equal(current.references.status,'UNAVAILABLE');
});

test('explicit zero, unknown cost and dates independent of financial month remain distinct',async t=>{
 const f=bare(t),body=record(10,{quantity:2,produced_date:'2026-11-01',cost:{unit_cost_cents:null,reference:null}});let value=await mutateIncurredProductionWorkspace(f.env,selection,body,'synthetic-owner',{now:f.now});
 assert.equal(value.periods.monthly.summary.state,'NO_RECORDS');assert.equal(value.periods.weekly.summary.unknown_cost_quantity,2);assert.equal(value.periods.weekly.summary.total_cost_cents,null);
 value=await mutateIncurredProductionWorkspace(f.env,selection,record(11,{revision:1,quantity:1,produced_date:'2026-11-01',cost:{unit_cost_cents:0,reference:null}}),'synthetic-owner',{now:f.now});assert.equal(value.ledger.summary.state,'PARTIAL_COSTS');assert.equal(value.ledger.summary.known_cost_cents,0);assert.equal(value.ledger.summary.total_cost_cents,null);
 value=await mutateIncurredProductionWorkspace(f.env,selection,{revision:2,request_id:uuid(12),action:'void',record_id:body.record_id,reason:'Declaração sintética incorreta'},'synthetic-owner',{now:f.now});assert.equal(value.ledger.summary.state,'DECLARED_COSTS');assert.equal(value.ledger.summary.total_cost_cents,0);assert.equal(value.ledger.records[0].cost.unit_cost_cents,null);
 const next=await readIncurredProductionWorkspace(f.env,{month:'2026-11',week_of:'2026-11-01'},{now:f.now});assert.equal(next.periods.monthly.summary.total_cost_cents,0);assert.equal(next.periods.weekly.start_date,'2026-10-26');assert.equal(next.periods.weekly.end_date,'2026-11-01');assert.equal(next.ledger.records.length,2);
});

test('unavailable, itemized and stale references cannot silently choose a historical cost',async t=>{
 const f=await fixture(t);const request=record(20,{cost:{unit_cost_cents:1590,reference:{kind:'ADULT_REGULAR',revision:6,mode:'all_inclusive',unit_cost_cents:1590}}});
 await assert.rejects(mutateIncurredProductionWorkspace(f.env,selection,request,'synthetic-owner',{now:f.now}),e=>e.status===409&&e.message==='INCURRED_PRODUCTION_REFERENCE_CHANGED');
 f.db.db.prepare('UPDATE production_costs_state SET payload=?').run(JSON.stringify({...f.costValues,mode:'itemized',base_regular_cents:1100,base_plus_cents:1500}));
 const read=await readIncurredProductionWorkspace(f.env,selection,{now:f.now});assert.equal(read.references.mode,'itemized');assert.equal(read.references.adult_regular_cents,null);assert.equal(read.references.adult_plus_cents,null);
 const unknown=await mutateIncurredProductionWorkspace(f.env,selection,record(21,{cost:{unit_cost_cents:null,reference:null}}),'synthetic-owner',{now:f.now});assert.equal(unknown.ledger.records[0].cost.unit_cost_cents,null);assert.equal(unknown.ledger.summary.total_cost_cents,null);
});

test('selection validation precedes storage and bounded saved-board coverage stays explicit',async t=>{
 const f=await fixture(t);f.db.sql=[];
 for(const bad of [{...selection,extra:1},{month:'2026-12',week_of:'2026-11-01'},{month:'2026-10',week_of:'2026-02-30'},{month:'2026-10',week_of:'2026-11-02'}])await assert.rejects(readIncurredProductionWorkspace(f.env,bad,{now:f.now}),e=>e.status===400);
 assert.equal(f.db.sql.length,0);const row=f.db.db.prepare('SELECT * FROM production_dtf_lines').get();
 for(let i=0;i<51;i++){const serial='SYNTHETIC-ORDER-'+i,key=await sha([serial,row.line_key]);f.db.db.prepare('INSERT INTO production_dtf_orders VALUES(?,?,?,?)').run(serial,'COMPLETED',at/1000-20,'d'.repeat(64));f.db.db.prepare('INSERT INTO production_dtf_lines VALUES(?,?,?,?,?,?,?)').run(key,serial,row.line_key,row.payload,row.source_hash,at/1000-20,0);}
 const result=await readIncurredProductionWorkspace(f.env,selection,{now:f.now});assert.equal(result.source.status,'PARTIAL');assert.equal(result.source.has_more,true);assert.equal(result.source.included,50);assert.equal(result.ledger.summary.produced_quantity,0);
});

test('incurred API enforces owner/method/query/Origin/CSRF before any initialization or provider capability',async t=>{
 const {adminFetch,SCHEMA}=await import('../src/admin.mjs');
 const f=bare(t),env={...f.env,ADMIN_USERNAME:'synthetic-owner',ADMIN_PASSWORD:'synthetic-secret-safe-password',ADMIN_SESSION_SECRET:'s'.repeat(64)},origin='https://incurred.test';
 const login=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.ok([302,303].includes(login.status));const cookie=login.headers.get('set-cookie').split(';')[0];
 const forbidden=new Proxy({},{get(){throw Error('PROVIDER_MUST_NOT_BE_READ');}}),query='?month=2026-10&week_of=2026-11-01',base=origin+'/api/admin/production/incurred';
 const call=(suffix=query,options={})=>adminFetch(new Request(base+suffix,{...options,headers:{cookie,...options.headers}}),env,forbidden);
 assert.equal((await adminFetch(new Request(base+query),env,forbidden)).status,401);assert.equal((await call()).status,200);assert.equal((await call(query+'&month=2026-10')).status,400);assert.equal((await call('?month=2026-10&extra=1')).status,400);assert.equal((await call(query,{method:'HEAD'})).status,405);assert.equal((await call(query,{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'})).status,403);assert.equal((await call(query,{method:'POST',headers:{origin:'https://elsewhere.invalid','content-type':'application/json'},body:'{}'})).status,403);
 assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);assert.ok(!SCHEMA.some(sql=>/incurred_production_/.test(sql)),'collector schema and cold request budget remain untouched');
});
