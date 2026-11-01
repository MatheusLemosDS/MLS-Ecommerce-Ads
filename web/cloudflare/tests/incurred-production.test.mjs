import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {INCURRED_PRODUCTION_SCHEMA,IncurredProductionError,projectIncurredProduction,readIncurredProduction,mutateIncurredProduction,incurredProductionPeriods} from '../src/incurred-production.mjs';

const initial=Date.UTC(2026,10,1,15),clone=value=>JSON.parse(JSON.stringify(value));
class TrackingD1 extends D1{
 constructor(){super();this.statements=[];this.beforeMutation=null;this.failAudit=false;}
 prepare(sql){const value=super.prepare(sql);value.sql=sql;this.statements.push(sql);return value;}
 async batch(statements){
  const mutation=/^(INSERT OR IGNORE INTO|UPDATE) incurred_production_state/.test(statements[0]?.sql??'');
  if(mutation&&this.beforeMutation){const before=this.beforeMutation;this.beforeMutation=null;await before();}
  if(mutation&&this.failAudit){this.failAudit=false;return super.batch([statements[0],statements[1],{async run(){throw Error('PRIVATE_SYNTHETIC_AUDIT_FAILURE');}}]);}
  return super.batch(statements);
 }
}
function fixture(t){const db=new TrackingD1(),time={value:initial},env={ADMIN_DB:db};t.after(()=>db.db.close());return {env,db,time,now:()=>time.value};}
const unknown=()=>({artwork:null,color:null,size:null,garment_type:'UNKNOWN',fit:'UNKNOWN',confirmed:false,item_id:null,model_id:null,sku:null});
const identified=(overrides={})=>({artwork:'Arte original',color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null,...overrides});
const record=(revision,extra={})=>({revision,request_id:crypto.randomUUID(),action:'record',record_id:crypto.randomUUID(),production_ref:'Lote original 1',replaces_record_id:null,produced_date:'2026-10-31',quantity:3,identity:identified(),source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:1590,reference:null},evidence:'Confecção conferida pelo operador',confirmed:true,...extra});
const voidRecord=(revision,record_id,extra={})=>({revision,request_id:crypto.randomUUID(),action:'void',record_id,reason:'Quantidade lançada incorretamente',...extra});
const read=f=>readIncurredProduction(f.env,{now:f.now});
const mutate=(f,body,extra={})=>mutateIncurredProduction(f.env,body,'synthetic-owner',{now:f.now,...extra});
const error=code=>value=>value instanceof IncurredProductionError&&value.message==='INCURRED_PRODUCTION_'+code;
const tables=['incurred_production_state','incurred_production_records','incurred_production_audit','incurred_production_guard'];
const records=f=>Object.fromEntries(tables.map(table=>[table,f.db.db.prepare('SELECT * FROM '+table+' ORDER BY 1').all()]));
const changes=f=>f.db.db.prepare('SELECT total_changes() n').get().n;
const reference=(extra={})=>({kind:'ADULT_REGULAR',revision:5,mode:'all_inclusive',unit_cost_cents:1590,...extra});
const source=(extra={})=>({kind:'SAVED_DTF_ORDER_LINE',key:'a'.repeat(64),hash:'b'.repeat(64),checked_at:Math.floor(initial/1000)-20,order_hash:'c'.repeat(64),order_status:'CANCELLED',selling_quantity:1,...extra});

test('cold incurred reads are passive, empty is unknown rather than zero manufacture, and invalid inputs create no schema',async t=>{
 const f=fixture(t),before=changes(f);
 for(let i=0;i<3;i++){const frame=await read(f);assert.ok(projectIncurredProduction(frame));assert.equal(frame.revision,0);assert.deepEqual(frame.records,[]);assert.deepEqual(frame.summary,{active_records:0,voided_records:0,produced_quantity:0,known_cost_quantity:0,unknown_cost_quantity:0,known_cost_cents:0,total_cost_cents:null,state:'NO_RECORDS'});assert.deepEqual(frame.inventory_valuation,{state:'UNKNOWN',amount_cents:null});assert.equal(frame.financial_integration_allowed,false);assert.equal(frame.external_stock_write_allowed,false);}
 assert.equal(changes(f),before);assert.ok(f.db.statements.every(sql=>sql.startsWith('SELECT name FROM sqlite_master')));
 for(const body of [record(0,{confirmed:false}),record(0,{quantity:0}),record(0,{cost:{unit_cost_cents:'',reference:null}}),{...record(0),private_field:'PRIVATE'},record(0,{produced_date:'2026-02-30'}),record(0,{produced_date:'2026-11-02'})])await assert.rejects(mutate(f,body),error('REQUEST_INVALID'));
 assert.deepEqual(f.db.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(),[]);
});

test('a declared three-piece manufacture costs 4770 cents and never manufactures inventory value or financial authority',async t=>{
 const f=fixture(t),body=record(0),frame=await mutate(f,body);assert.ok(projectIncurredProduction(frame));assert.equal(frame.revision,1);assert.equal(frame.summary.produced_quantity,3);assert.equal(frame.summary.known_cost_cents,4770);assert.equal(frame.summary.total_cost_cents,4770);assert.equal(frame.records[0].cost.state,'DECLARED');assert.equal(frame.records[0].cost.unit_cost_cents,1590);assert.equal(frame.records[0].cost.inventory_value_cents,null);assert.equal(frame.records[0].cost.reference,null);assert.deepEqual(frame.records[0].source,{kind:'MANUAL_LOT',key:null,hash:null,checked_at:null,order_hash:null,order_status:null,selling_quantity:null});assert.equal(frame.records[0].produced_date,'2026-10-31');assert.equal(frame.financial_integration_allowed,false);assert.equal(frame.external_stock_write_allowed,false);
 const audit=JSON.parse(records(f).incurred_production_audit[0].payload);assert.equal(audit.previous_record,null);assert.deepEqual(audit.new_record,frame.records[0]);assert.deepEqual(audit.request,body);assert.equal(records(f).incurred_production_audit[0].actor,'synthetic-owner');
});

test('UNKNOWN, explicitly declared zero, and empty periods remain different even after later reads',async t=>{
 const f=fixture(t);let frame=await mutate(f,record(0,{quantity:2,cost:{unit_cost_cents:null,reference:null}}));assert.equal(frame.summary.state,'PARTIAL_COSTS');assert.equal(frame.summary.known_cost_cents,0);assert.equal(frame.summary.total_cost_cents,null);assert.equal(frame.summary.unknown_cost_quantity,2);assert.equal(frame.records[0].cost.state,'UNKNOWN');
 frame=await mutate(f,record(1,{production_ref:'Lote sem desembolso declarado',quantity:1,cost:{unit_cost_cents:0,reference:null}}));assert.equal(frame.summary.total_cost_cents,null);assert.equal(frame.summary.known_cost_quantity,1);assert.equal(frame.summary.unknown_cost_quantity,2);
 const periods=incurredProductionPeriods(frame,{month:'2026-09',week_of:'2026-11-01'});assert.equal(periods.monthly.summary.state,'NO_RECORDS');assert.equal(periods.monthly.summary.total_cost_cents,null);assert.equal(periods.weekly.summary.state,'PARTIAL_COSTS');
 const unknownId=frame.records.find(row=>row.cost.state==='UNKNOWN').record_id;frame=await mutate(f,voidRecord(2,unknownId));assert.equal(frame.summary.state,'DECLARED_COSTS');assert.equal(frame.summary.total_cost_cents,0);assert.equal(frame.summary.produced_quantity,1);assert.equal(frame.summary.voided_records,1);assert.equal((await read(f)).records.find(row=>row.record_id===unknownId).cost.unit_cost_cents,null);
});

test('saved DTF context is server-verified, permits cancellation context, and never supplies produced piece quantity',async t=>{
 const f=fixture(t),proof=source(),body=record(0,{source:{kind:proof.kind,key:proof.key,hash:proof.hash}});
 for(const trustedSource of [null,source({key:'d'.repeat(64)}),source({hash:'d'.repeat(64)}),source({checked_at:Math.floor(initial/1000)+1}),source({order_hash:'PRIVATE_SERIAL'}),{...proof,private_serial:'PRIVATE'}])await assert.rejects(mutate(f,body,{trustedSource}),error('SOURCE_CHANGED'));
 let frame=await mutate(f,body,{trustedSource:proof});assert.equal(frame.records[0].source.order_status,'CANCELLED');assert.equal(frame.records[0].source.selling_quantity,1);assert.equal(frame.records[0].quantity,3);assert.equal(frame.summary.known_cost_cents,4770);
 const before=records(f);f.time.value+=1000;frame=await mutate(f,body,{trustedSource:source({order_status:'TO_RETURN',selling_quantity:10})});assert.deepEqual(records(f),before);assert.equal(frame.records[0].source.order_status,'CANCELLED');assert.equal(frame.records[0].quantity,3);assert.equal(frame.records[0].cost.unit_cost_cents,1590);
});

test('optional adult reference requires exact server revision/price/size family and then remains a historical snapshot',async t=>{
 const f=fixture(t),saved=reference(),body=record(0,{cost:{unit_cost_cents:1590,reference:saved}});
 for(const trustedReference of [null,reference({revision:6}),reference({unit_cost_cents:2140}),{...saved,private_field:'PRIVATE'}])await assert.rejects(mutate(f,body,{trustedReference}),error('REFERENCE_CHANGED'));
 for(const extra of [{identity:identified({size:'G1'})},{identity:identified({garment_type:'CHILD',size:'2'})},{cost:{unit_cost_cents:1500,reference:saved}},{cost:{unit_cost_cents:null,reference:saved}}])await assert.rejects(mutate(f,{...body,...extra},{trustedReference:saved}),error('REQUEST_INVALID'));
 let frame=await mutate(f,body,{trustedReference:Object.fromEntries(Object.entries(saved).reverse())});assert.deepEqual(frame.records[0].cost.reference,saved);assert.equal(frame.records[0].cost.inventory_value_cents,null);const before=records(f);
 f.time.value+=1000;frame=await mutate(f,body,{trustedReference:reference({revision:99,unit_cost_cents:9990})});assert.deepEqual(records(f),before);assert.deepEqual(frame.records[0].cost.reference,saved);assert.equal(frame.summary.total_cost_cents,4770);
 frame=await mutate(f,record(1,{production_ref:'Adulto G1',identity:identified({size:'G1'}),cost:{unit_cost_cents:2140,reference:reference({kind:'ADULT_PLUS',unit_cost_cents:2140})}}),{trustedReference:reference({kind:'ADULT_PLUS',unit_cost_cents:2140})});assert.equal(frame.records.find(row=>row.production_ref==='Adulto G1').cost.unit_cost_cents,2140);
});

test('stable request replay survives later mutations, source disappearance and reference changes without duplication',async t=>{
 const f=fixture(t),proof=source(),ref=reference(),body=record(0,{source:{kind:proof.kind,key:proof.key,hash:proof.hash},cost:{unit_cost_cents:1590,reference:ref}});let frame=await mutate(f,body,{trustedSource:proof,trustedReference:ref});let before=records(f);
 const permuted=Object.fromEntries(Object.entries({...body,identity:Object.fromEntries(Object.entries(body.identity).reverse()),source:Object.fromEntries(Object.entries(body.source).reverse()),cost:{reference:Object.fromEntries(Object.entries(ref).reverse()),unit_cost_cents:1590}}).reverse());assert.deepEqual(await mutate(f,permuted),frame);assert.deepEqual(records(f),before);
 frame=await mutate(f,record(1,{production_ref:'Outro lote',quantity:1}));before=records(f);const replay=await mutate(f,body);assert.equal(replay.summary.produced_quantity,4);assert.deepEqual(records(f),before);
 for(const changed of [{...body,quantity:4},{...body,evidence:'Outra confirmação'},{...body,record_id:crypto.randomUUID()}])await assert.rejects(mutate(f,changed),error('CONFLICT'));assert.deepEqual(records(f),before);
});

test('normalized references prevent another declaration and a void preserves complete history before explicit replacement',async t=>{
 const f=fixture(t);let frame=await mutate(f,record(0,{production_ref:'Lote 1 / Feminina M',identity:identified({fit:'FEMALE'})}));const first=clone(frame.records[0]),before=records(f);
 for(const production_ref of ['LOTE 1 / FEMININA M','Lote  1 / Feminina M','Ｌote 1 / Feminina M'])await assert.rejects(mutate(f,record(1,{production_ref})),error('REFERENCE_CONFLICT'));assert.deepEqual(records(f),before);
 f.time.value+=1000;frame=await mutate(f,voidRecord(1,first.record_id));assert.equal(frame.summary.state,'NO_RECORDS');assert.equal(frame.summary.total_cost_cents,null);assert.equal(frame.summary.voided_records,1);const old=frame.records[0];assert.equal(old.status,'VOID');assert.deepEqual(old.identity,first.identity);assert.deepEqual(old.cost,first.cost);assert.equal(old.quantity,first.quantity);assert.equal(old.produced_date,first.produced_date);
 const audit=JSON.parse(records(f).incurred_production_audit.at(-1).payload);assert.deepEqual(audit.previous_record,first);assert.deepEqual(audit.new_record,old);
 await assert.rejects(mutate(f,record(2,{production_ref:'Lote 1 / Feminina M'})),error('REPLACEMENT_REQUIRED'));await assert.rejects(mutate(f,voidRecord(2,first.record_id)),error('RECORD_VOID'));
 frame=await mutate(f,record(2,{production_ref:'LOTE 1 / FEMININA M',replaces_record_id:first.record_id,quantity:1,identity:identified({fit:'FEMALE'})}));assert.equal(frame.records.length,2);assert.equal(frame.summary.produced_quantity,1);assert.equal(frame.summary.total_cost_cents,1590);assert.equal(frame.records.find(row=>row.status==='ACTIVE').replaces_record_id,first.record_id);
});

test('concurrent identical requests share the winning fact and a stale distinct writer cannot partially commit',async t=>{
 const f=fixture(t),body=record(0);let winner;f.db.beforeMutation=async()=>{winner=await mutate(f,body);};let frame=await mutate(f,body);assert.deepEqual(frame,winner);assert.equal(frame.records.length,1);assert.equal(records(f).incurred_production_audit.length,1);
 const stale=record(1,{production_ref:'Lote sessão A'});f.db.beforeMutation=async()=>{winner=await mutate(f,record(1,{production_ref:'Lote sessão B',quantity:1}));};await assert.rejects(mutate(f,stale),error('CONFLICT'));assert.deepEqual(await read(f),winner);assert.equal(winner.summary.produced_quantity,4);assert.equal(records(f).incurred_production_audit.length,2);
});

test('an audit failure and a conflicting record write roll back state and complete mutation atomically',async t=>{
 const f=fixture(t);let frame=await mutate(f,record(0));const before=records(f);f.db.failAudit=true;await assert.rejects(mutate(f,record(1,{production_ref:'Lote que falha'})),error('UNAVAILABLE'));assert.deepEqual(records(f),before);
 const original=frame.records[0],foreign={...clone(original),evidence:'Mudança externa sintética'};f.db.beforeMutation=async()=>{f.db.db.prepare('UPDATE incurred_production_records SET payload=? WHERE record_id=?').run(JSON.stringify(foreign),original.record_id);};await assert.rejects(mutate(f,voidRecord(1,original.record_id)),error('UNAVAILABLE'));const after=records(f);assert.equal(after.incurred_production_state[0].revision,1);assert.equal(after.incurred_production_audit.length,1);assert.equal(JSON.parse(after.incurred_production_records[0].payload).status,'ACTIVE');assert.equal(JSON.parse(after.incurred_production_records[0].payload).evidence,foreign.evidence);
});

test('month and independent Monday week use the declared manufacture day across month/year and BRT boundaries',async t=>{
 const f=fixture(t);f.time.value=Date.UTC(2027,0,5,2,59,59);let frame=await mutate(f,record(0,{produced_date:'2026-12-31',quantity:2}));frame=await mutate(f,record(1,{production_ref:'Virada de ano',produced_date:'2027-01-01',quantity:1,cost:{unit_cost_cents:1250,reference:null},identity:identified({garment_type:'CHILD',size:'2'})}));frame=await mutate(f,record(2,{production_ref:'Semana seguinte',produced_date:'2027-01-04',quantity:1}));
 let periods=incurredProductionPeriods(frame,{month:'2026-12',week_of:'2027-01-01'});assert.equal(periods.monthly.start_date,'2026-12-01');assert.equal(periods.monthly.end_date,'2026-12-31');assert.equal(periods.monthly.summary.produced_quantity,2);assert.equal(periods.monthly.summary.total_cost_cents,3180);assert.equal(periods.weekly.start_date,'2026-12-28');assert.equal(periods.weekly.end_date,'2027-01-03');assert.equal(periods.weekly.summary.produced_quantity,3);assert.equal(periods.weekly.summary.total_cost_cents,4430);
 periods=incurredProductionPeriods(frame,{month:'2027-01',week_of:'2027-01-04'});assert.equal(periods.monthly.end_date,'2027-01-04','02:59:59 UTC is still the previous BRT day');assert.equal(periods.monthly.summary.produced_quantity,2);assert.equal(periods.weekly.end_date,'2027-01-04');assert.equal(periods.weekly.summary.total_cost_cents,1590);
 for(const selection of [{month:'2027-02',week_of:'2027-01-04'},{month:'2027-01',week_of:'2027-01-05'},{month:'2027-01',week_of:'2027-02-30'},{month:'2027-1',week_of:'2027-01-04'},{month:'2027-01',week_of:'2027-01-04',private_field:1}])assert.equal(incurredProductionPeriods(frame,selection),null);
 f.time.value=Date.UTC(2027,0,5,3);frame=await read(f);periods=incurredProductionPeriods(frame,{month:'2027-01',week_of:'2027-01-05'});assert.equal(periods.monthly.end_date,'2027-01-05');assert.equal(periods.weekly.end_date,'2027-01-05');
});

test('malformed values, exotic accessors, fractional money and immutable-field edits fail closed before writes',async t=>{
 const f=fixture(t);await mutate(f,record(0));const before=records(f);
 for(const quantity of [0,-0,-1,1.1,10001,Infinity,Number.MAX_SAFE_INTEGER,'3',null])await assert.rejects(mutate(f,record(1,{quantity})),error('REQUEST_INVALID'));
 for(const unit_cost_cents of [-0,-1,0.5,1000001,Infinity,'',undefined])await assert.rejects(mutate(f,record(1,{cost:{unit_cost_cents,reference:null}})),error('REQUEST_INVALID'));
 for(const extra of [{production_ref:''},{production_ref:' x '},{production_ref:'x'.repeat(121)},{evidence:'\u0000private'},{identity:{...unknown(),private_field:'PRIVATE'}},{produced_date:'2024-02-30'},{record_id:'not-uuid'},{source:{kind:'MANUAL_LOT',key:null,hash:null,order_hash:'a'.repeat(64)}},{confirmed:false}])await assert.rejects(mutate(f,record(1,extra)),error('REQUEST_INVALID'));
 let calls=0;const accessor=record(1);Object.defineProperty(accessor.identity,'size',{get(){calls++;throw Error('PRIVATE_GETTER');}});await assert.rejects(mutate(f,accessor),error('REQUEST_INVALID'));assert.equal(calls,0);await assert.rejects(mutate(f,{...voidRecord(1,JSON.parse(before.incurred_production_records[0].payload).record_id),quantity:0}),error('REQUEST_INVALID'));assert.deepEqual(records(f),before);
});

test('partial schema, deleted audit facts, corrupt payloads and regressed clocks are unavailable rather than reset',async t=>{
 const f=fixture(t);f.db.db.exec(INCURRED_PRODUCTION_SCHEMA[0]);await assert.rejects(read(f),error('STORAGE_INVALID'));await assert.rejects(mutate(f,record(0)),error('STORAGE_INVALID'));assert.equal(f.db.db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table'").get().n,1);
 f.db.db.exec('DROP TABLE incurred_production_state');let frame=await mutate(f,record(0));f.time.value-=1000;await assert.rejects(read(f),error('STORAGE_INVALID'));f.time.value=initial;
 const savedAudit=records(f).incurred_production_audit[0];f.db.db.prepare('DELETE FROM incurred_production_audit').run();await assert.rejects(read(f),error('STORAGE_INVALID'));f.db.db.prepare('INSERT INTO incurred_production_audit(revision,request_id,request_hash,record_id,action,payload,actor,created_at) VALUES(?,?,?,?,?,?,?,?)').run(...['revision','request_id','request_hash','record_id','action','payload','actor','created_at'].map(key=>savedAudit[key]));
 f.db.db.prepare('UPDATE incurred_production_records SET payload=? WHERE record_id=?').run('{"private_field":"PRIVATE"}',frame.records[0].record_id);await assert.rejects(read(f),error('STORAGE_INVALID'));assert.equal(records(f).incurred_production_state[0].revision,frame.revision);
});

test('the detached projector rejects forged totals, monetary grants, duplicate facts and malformed object shapes',async t=>{
 const f=fixture(t),frame=await mutate(f,record(0));assert.ok(projectIncurredProduction(frame));
 for(const change of [v=>v.summary.total_cost_cents++,v=>v.summary.known_cost_cents++,v=>v.summary.produced_quantity++,v=>v.inventory_valuation.amount_cents=0,v=>v.financial_integration_allowed=true,v=>v.external_stock_write_allowed=true,v=>v.records[0].cost.inventory_value_cents=0,v=>v.records[0].cost.state='PAID',v=>v.records[0].identity.fit='UNDEFINED',v=>v.records.push(clone(v.records[0])),v=>v.records[0].produced_date='2026-11-02',v=>v.private_field='PRIVATE']){const value=clone(frame);change(value);assert.equal(projectIncurredProduction(value),null,change.toString());}
 let calls=0;const accessor=clone(frame);Object.defineProperty(accessor.records[0].cost,'unit_cost_cents',{get(){calls++;throw Error('PRIVATE_GETTER');}});assert.equal(projectIncurredProduction(accessor),null);assert.equal(calls,0);
 const projected=projectIncurredProduction(frame);projected.records[0].identity.artwork='Outra';assert.notEqual(frame.records[0].identity.artwork,projected.records[0].identity.artwork);
 const context=vm.createContext({serialized:JSON.stringify(frame),TextEncoder});vm.runInContext(projectIncurredProduction.toString()+'\n'+incurredProductionPeriods.toString()+'\nglobalThis.result=projectIncurredProduction(JSON.parse(serialized));globalThis.periods=incurredProductionPeriods(result,{month:"2026-10",week_of:"2026-11-01"});',context);assert.deepEqual(JSON.parse(JSON.stringify(context.result)),frame);assert.deepEqual(JSON.parse(JSON.stringify(context.periods)),incurredProductionPeriods(frame,{month:'2026-10',week_of:'2026-11-01'}));
});

test('global capacity and UTF-8 size bounds reject another mutation without silently truncating retained history',async t=>{
 const f=fixture(t),frame=await mutate(f,record(0)),base=frame.records[0],stamp=Math.floor(initial/1000);f.db.db.prepare('DELETE FROM incurred_production_records').run();f.db.db.prepare('DELETE FROM incurred_production_audit').run();
 const insertRow=f.db.db.prepare('INSERT INTO incurred_production_records(record_id,payload) VALUES(?,?)'),insertAudit=f.db.db.prepare('INSERT INTO incurred_production_audit(revision,request_id,request_hash,record_id,action,payload,actor,created_at) VALUES(?,?,?,?,?,?,?,?)');
 for(let i=0;i<1000;i++){const row={...clone(base),record_id:crypto.randomUUID(),production_ref:'Synthetic lot '+i};insertRow.run(row.record_id,JSON.stringify(row));insertAudit.run(i+1,crypto.randomUUID(),'d'.repeat(64),row.record_id,'record','{}','synthetic-owner',stamp);}
 f.db.db.prepare('UPDATE incurred_production_state SET revision=1000,mutation_id=?,updated_at=? WHERE id=1').run(crypto.randomUUID(),stamp);const full=await read(f);assert.equal(full.records.length,1000);const before=records(f);await assert.rejects(mutate(f,record(1000,{production_ref:'Overflow'})),error('LIMIT'));assert.deepEqual(records(f),before);
 const tooLarge=clone(full);for(const row of tooLarge.records){row.identity=identified({artwork:'字'.repeat(120),color:'字'.repeat(80),sku:'字'.repeat(128)});row.evidence='字'.repeat(240);}assert.ok(new TextEncoder().encode(JSON.stringify(tooLarge)).byteLength>1048576);assert.equal(projectIncurredProduction(tooLarge),null);
});
