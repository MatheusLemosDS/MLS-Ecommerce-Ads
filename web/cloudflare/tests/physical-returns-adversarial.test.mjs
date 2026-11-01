import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {mutatePhysicalReturns,readPhysicalReturns,projectPhysicalReturns} from '../src/physical-returns.mjs';

// Independent tests of the physical ledger boundary. These fixtures describe
// operator-counted pieces; no provider status proves receipt or original qty.
const caseHash='a'.repeat(64),orderHash='b'.repeat(64);
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const identity=(fit='UNISEX',overrides={})=>({artwork:'Arte conferida',color:'Preto',size:'G',garment_type:'ADULT',fit,confirmed:true,item_id:'1001',model_id:'2001',sku:null,...overrides});
const partition=values=>({resellable:0,repair:0,damaged:0,mismatch:0,quarantine:0,...values});
async function fixture(t){
 const db=new D1(),env={ADMIN_DB:db};t.after(()=>db.db.close());
 let sequence=0,time=Date.UTC(2026,10,1,12);const now=()=>time;
 const sourceCase={case_hash:caseHash,order_hash:orderHash,status:'REFUND_PAID',checked_at:Math.floor(time/1000)-1,month:'2026-11',publication_revision:1};
 const read=()=>readPhysicalReturns(env,{now});
 const mutate=async(action,fields={},options={})=>{
  const current=await read(),input={revision:current.revision,request_id:uuid(++sequence),action,case_hash:caseHash,...fields};
  return mutatePhysicalReturns(env,input,'independent-owner',{now,sourceCase,...options});
 };
 await mutate('register',{order_hash:orderHash});
 return {db,env,now,read,mutate,sourceCase,tick(){time+=1000;},nextId:()=>uuid(++sequence)};
}
const rejects=(promise,suffix,status=409)=>assert.rejects(promise,error=>error.status===status&&error.message==='PHYSICAL_RETURNS_'+suffix);

test('a second request UUID cannot recount an active receipt reference after Unicode, case or spacing changes',async t=>{
 const f=await fixture(t);
 const received=await f.mutate('receive',{line_id:uuid(101),receipt_ref:'ENTREGA   １２',quantity:1,identity:identity()});
 assert.equal(received.summary.received_quantity,1);assert.equal(received.summary.physically_available_quantity,0);
 const before=await f.read(),audit=f.db.db.prepare('SELECT count(*) AS n FROM physical_returns_audit').get().n;
 await rejects(f.mutate('receive',{line_id:uuid(102),receipt_ref:'entrega 12',quantity:1,identity:identity()}),'RECEIPT_REFERENCE_CONFLICT');
 assert.deepEqual(await f.read(),before);assert.equal(f.db.db.prepare('SELECT count(*) AS n FROM physical_returns_audit').get().n,audit);
});

test('different fits remain distinct physical lines and unknown fit cannot become resellable',async t=>{
 const f=await fixture(t);
 await f.mutate('receive',{line_id:uuid(201),receipt_ref:'PECA-MASCULINA',quantity:1,identity:identity('MALE')});
 await f.mutate('receive',{line_id:uuid(202),receipt_ref:'PECA-FEMININA',quantity:1,identity:identity('FEMALE')});
 await f.mutate('receive',{line_id:uuid(203),receipt_ref:'PECA-SEM-MODELAGEM',quantity:1,identity:identity('UNKNOWN',{confirmed:false})});
 for(const [line_id,fit] of [[uuid(201),'MALE'],[uuid(202),'FEMALE']])await f.mutate('inspect',{line_id,partition:partition({resellable:1}),identity:identity(fit),reason:'Peça individual conferida'});
 const before=await f.read();
 assert.deepEqual(before.cases[0].lines.slice(0,2).map(line=>line.identity.fit),['MALE','FEMALE']);assert.equal(before.summary.physically_available_quantity,2);
 await rejects(f.mutate('inspect',{line_id:uuid(203),partition:partition({resellable:1}),identity:identity('UNKNOWN',{confirmed:false}),reason:'Modelagem ainda desconhecida'}),'REQUEST_INVALID',400);
 assert.deepEqual(await f.read(),before);assert.equal(before.summary.quarantine_quantity,1);assert.equal(before.valuation.amount_cents,null);
});

test('partial inspection conserves counted pieces through reinspection and a voided receipt can be explicitly replaced once',async t=>{
 const f=await fixture(t);
 await f.mutate('receive',{line_id:uuid(301),receipt_ref:'PARCIAL-1',quantity:3,identity:identity()});
 let value=await f.mutate('inspect',{line_id:uuid(301),partition:partition({resellable:1,damaged:1,quarantine:1}),identity:identity(),reason:'Apenas uma das três peças pode voltar à venda'});
 assert.equal(value.summary.physically_available_quantity,1);assert.equal(value.summary.active_quantity,3);
 await rejects(f.mutate('inspect',{line_id:uuid(301),partition:partition({resellable:4}),identity:identity(),reason:'Contagem incompatível'}),'QUANTITY_MISMATCH');
 value=await f.mutate('inspect',{line_id:uuid(301),partition:partition({resellable:2,damaged:1}),identity:identity(),reason:'Segunda peça liberada após inspeção'});
 assert.equal(value.summary.received_quantity,3);assert.equal(value.summary.physically_available_quantity,2);
 value=await f.mutate('void',{line_id:uuid(301),reason:'Recebimento registrado com referência incorreta'});
 assert.equal(value.summary.active_quantity,0);assert.equal(value.summary.voided_quantity,3);assert.equal(value.summary.physically_available_quantity,0);
 value=await f.mutate('receive',{line_id:uuid(302),receipt_ref:'parcial-1',quantity:3,identity:identity()});
 assert.equal(value.summary.received_quantity,6,'the voided declaration remains in historical received counts');assert.equal(value.summary.active_quantity,3);assert.equal(value.summary.physically_available_quantity,0);
 await rejects(f.mutate('receive',{line_id:uuid(303),receipt_ref:'PARCIAL-1',quantity:3,identity:identity()}),'RECEIPT_REFERENCE_CONFLICT');
});

test('case identity survives a new publication without creating received pieces from REFUND_PAID or CLOSED',async t=>{
 const f=await fixture(t),registered=await f.read();
 assert.equal(registered.summary.received_quantity,0);assert.equal(registered.summary.physically_available_quantity,0);
 const second=await f.mutate('register',{order_hash:orderHash},{sourceCase:{...f.sourceCase,status:'CLOSED',publication_revision:999}});
 assert.deepEqual(second,registered);assert.equal(second.summary.cases,1);
 await rejects(f.mutate('register',{order_hash:'c'.repeat(64)},{sourceCase:{...f.sourceCase,order_hash:'c'.repeat(64)}}),'IDENTITY_CONFLICT');
 assert.deepEqual(await f.read(),registered);assert.equal(projectPhysicalReturns(second).valuation.state,'UNKNOWN');
});

test('audit insertion failure and silent case-write rejection roll back state, case and audit together',async t=>{
 const f=await fixture(t),before=await f.read(),audit=f.db.db.prepare('SELECT count(*) AS n FROM physical_returns_audit').get().n;
 f.db.db.exec("CREATE TRIGGER fail_independent_audit BEFORE INSERT ON physical_returns_audit BEGIN SELECT RAISE(ABORT,'SYNTHETIC_AUDIT_FAILURE'); END");
 await assert.rejects(f.mutate('receive',{line_id:uuid(501),receipt_ref:'AUDIT-FAIL',quantity:1,identity:identity()}));
 assert.deepEqual(await f.read(),before);assert.equal(f.db.db.prepare('SELECT count(*) AS n FROM physical_returns_audit').get().n,audit);
 f.db.db.exec('DROP TRIGGER fail_independent_audit');
 f.db.db.exec('CREATE TRIGGER ignore_independent_case BEFORE UPDATE ON physical_returns_cases BEGIN SELECT RAISE(IGNORE); END');
 await assert.rejects(f.mutate('receive',{line_id:uuid(502),receipt_ref:'GUARD-FAIL',quantity:1,identity:identity()}));
 assert.deepEqual(await f.read(),before);assert.equal(f.db.db.prepare('SELECT count(*) AS n FROM physical_returns_audit').get().n,audit);
});

test('each audit records the timestamp preceding the mutation, not the already-updated case timestamp',async t=>{
 const f=await fixture(t),before=await f.read();f.tick();
 await f.mutate('receive',{line_id:uuid(601),receipt_ref:'TIMESTAMP-CHAIN',quantity:1,identity:identity()});
 const audit=JSON.parse(f.db.db.prepare('SELECT payload FROM physical_returns_audit ORDER BY revision DESC LIMIT 1').get().payload);
 assert.equal(audit.previous_updated_at,before.cases[0].updated_at);assert.notEqual(audit.previous_updated_at,(await f.read()).cases[0].updated_at);
});

test('reinspection and void audits preserve the complete prior line instead of the mutated object',async t=>{
 const f=await fixture(t);
 await f.mutate('receive',{line_id:uuid(701),receipt_ref:'AUDIT-PARTITIONS',quantity:2,identity:identity('UNKNOWN',{confirmed:false})});
 const received=(await f.read()).cases[0].lines[0];f.tick();
 await f.mutate('inspect',{line_id:uuid(701),partition:partition({resellable:1,damaged:1}),identity:identity('FEMALE'),reason:'Inspeção com identificação física confirmada'});
 let event=JSON.parse(f.db.db.prepare('SELECT payload FROM physical_returns_audit ORDER BY revision DESC LIMIT 1').get().payload);
 assert.deepEqual(event.previous_line,received);assert.equal(event.previous_line.status,'QUARANTINE');assert.equal(event.previous_line.partition.quarantine,2);assert.equal(event.previous_line.identity.fit,'UNKNOWN');
 const inspected=(await f.read()).cases[0].lines[0];f.tick();
 await f.mutate('void',{line_id:uuid(701),reason:'Declaração anulada mantendo a trilha anterior'});
 event=JSON.parse(f.db.db.prepare('SELECT payload FROM physical_returns_audit ORDER BY revision DESC LIMIT 1').get().payload);
 assert.deepEqual(event.previous_line,inspected);assert.equal(event.previous_line.status,'INSPECTED');assert.equal(event.previous_line.partition.resellable,1);assert.equal((await f.read()).summary.physically_available_quantity,0);
});
