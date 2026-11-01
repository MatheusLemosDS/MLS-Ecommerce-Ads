import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {PHYSICAL_RETURNS_SCHEMA,PhysicalReturnsError,projectPhysicalReturns,readPhysicalReturns,mutatePhysicalReturns} from '../src/physical-returns.mjs';

const initial=Date.UTC(2026,10,1,15),caseHash='a'.repeat(64),orderHash='b'.repeat(64),clone=value=>JSON.parse(JSON.stringify(value));
class TrackingD1 extends D1{
 constructor(){super();this.statements=[];this.beforeMutation=null;this.failAudit=false;}
 prepare(sql){const statement=super.prepare(sql);statement.sql=sql;this.statements.push(sql);return statement;}
 async batch(statements){
  const mutation=/^(INSERT OR IGNORE INTO|UPDATE) physical_returns_state/.test(statements[0]?.sql??'');
  if(mutation&&this.beforeMutation){const before=this.beforeMutation;this.beforeMutation=null;await before();}
  if(mutation&&this.failAudit){this.failAudit=false;return super.batch([statements[0],statements[1],{async run(){throw Error('PRIVATE_AUDIT_FAILURE');}}]);}
  return super.batch(statements);
 }
}
function fixture(t){const db=new TrackingD1(),time={value:initial},env={ADMIN_DB:db};t.after(()=>db.db.close());return {env,db,time,now:()=>time.value};}
const unknown=()=>({artwork:null,color:null,size:null,garment_type:'UNKNOWN',fit:'UNKNOWN',confirmed:false,item_id:null,model_id:null,sku:null});
const identified=(overrides={})=>({artwork:'Arte original',color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null,...overrides});
const source=(f,overrides={})=>({case_hash:caseHash,order_hash:orderHash,status:'REFUND_PAID',checked_at:Math.floor(f.time.value/1000)-10,month:'2026-10',publication_revision:15,...overrides});
const request=(revision,action,extra={})=>({revision,request_id:crypto.randomUUID(),action,case_hash:caseHash,...extra});
const read=f=>readPhysicalReturns(f.env,{now:f.now});
const mutate=(f,input,sourceCase=null)=>mutatePhysicalReturns(f.env,input,'owner',{now:f.now,sourceCase});
const register=(f,revision=0,overrides={})=>mutate(f,request(revision,'register',{order_hash:orderHash,...overrides}),source(f,{case_hash:overrides.case_hash??caseHash,order_hash:overrides.order_hash??orderHash}));
const receive=(revision,extra={})=>request(revision,'receive',{line_id:crypto.randomUUID(),receipt_ref:'Pacote 1',quantity:3,identity:unknown(),...extra});
const inspect=(revision,line,partition={resellable:1,repair:1,damaged:1,mismatch:0,quarantine:0},extra={})=>request(revision,'inspect',{line_id:line.line_id,identity:identified(),partition,reason:'Conferência física realizada',...extra});
const error=code=>value=>value instanceof PhysicalReturnsError&&value.message==='PHYSICAL_RETURNS_'+code;
const changes=f=>f.db.db.prepare('SELECT total_changes() n').get().n;
const records=f=>Object.fromEntries(['physical_returns_state','physical_returns_cases','physical_returns_audit','physical_returns_guard'].map(table=>[table,f.db.db.prepare('SELECT * FROM '+table+' ORDER BY 1').all()]));

test('an uninitialized GET is an honest empty local ledger and performs no DDL, provider access or writes',async t=>{
 const f=fixture(t),before=changes(f);for(let i=0;i<3;i++){const value=await read(f);assert.ok(projectPhysicalReturns(value));assert.equal(value.revision,0);assert.deepEqual(value.cases,[]);assert.equal(value.summary.received_quantity,0);assert.deepEqual(value.valuation,{state:'UNKNOWN',amount_cents:null});assert.equal(value.external_stock_write_allowed,false);}
 assert.equal(changes(f),before);assert.ok(f.db.statements.every(sql=>sql.startsWith('SELECT name FROM sqlite_master')));assert.deepEqual(f.db.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(),[]);
});

test('registering provider-finalized cases never receives a piece and preserves global case identity across months',async t=>{
 const f=fixture(t);let frame=await register(f);assert.equal(frame.revision,1);assert.equal(frame.cases[0].source.status,'REFUND_PAID');assert.deepEqual(frame.cases[0].lines,[]);assert.equal(frame.summary.physically_available_quantity,0);
 const before=records(f);f.time.value+=60000;const repeat=await mutate(f,request(frame.revision,'register',{order_hash:orderHash}),source(f,{month:'2026-11',publication_revision:99}));assert.deepEqual(records(f),before);assert.equal(repeat.cases[0].source.month,'2026-10');assert.equal(repeat.cases[0].source.publication_revision,15);
 await assert.rejects(mutate(f,request(frame.revision,'register',{order_hash:'c'.repeat(64)}),source(f,{order_hash:'c'.repeat(64)})),error('IDENTITY_CONFLICT'));assert.deepEqual(records(f),before);
});

test('registration accepts only an exact server-supplied saved case proof, while malformed owner inputs never create tables',async t=>{
 const f=fixture(t),input=request(0,'register',{order_hash:orderHash});await assert.rejects(mutate(f,{...input,private_token:'PRIVATE'}),error('REQUEST_INVALID'));assert.deepEqual(f.db.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(),[]);
 for(const proof of [null,source(f,{case_hash:'c'.repeat(64)}),source(f,{order_hash:'c'.repeat(64)}),{...source(f),private_token:'PRIVATE'},source(f,{checked_at:Math.floor(initial/1000)+1}),source(f,{status:'UNRECOGNIZED'})])await assert.rejects(mutate(f,input,proof),error('SOURCE_REQUIRED'));
 const value=await read(f);assert.equal(value.revision,0);assert.equal(value.cases.length,0);assert.equal(records(f).physical_returns_audit.length,0);
});

test('multiple partial receipts stay in quarantine until inspected and quantities partition exactly without inventing a value',async t=>{
 const f=fixture(t);let frame=await register(f);frame=await mutate(f,receive(frame.revision));f.time.value+=1000;frame=await mutate(f,receive(frame.revision,{receipt_ref:'Pacote 2',quantity:2,identity:identified({fit:'FEMALE'})}));assert.equal(frame.summary.received_quantity,5);assert.equal(frame.summary.quarantine_quantity,5);assert.equal(frame.summary.physically_available_quantity,0);
 const first=frame.cases[0].lines[0];f.time.value+=1000;frame=await mutate(f,inspect(frame.revision,first));assert.equal(frame.summary.resellable_quantity,1);assert.equal(frame.summary.repair_quantity,1);assert.equal(frame.summary.damaged_quantity,1);assert.equal(frame.summary.quarantine_quantity,2);assert.equal(frame.summary.physically_available_quantity,1);assert.equal(frame.summary.active_quantity,5);
 for(const line of frame.cases[0].lines){assert.equal(line.valuation_state,'UNKNOWN');assert.equal(line.carrying_value_cents,null);}assert.deepEqual(frame.valuation,{state:'UNKNOWN',amount_cents:null});assert.equal(frame.external_stock_write_allowed,false);
});

test('resellable pieces require explicit complete identity, while mismatched or damaged partial-kit pieces cannot become availability',async t=>{
 const f=fixture(t);let frame=await register(f);frame=await mutate(f,receive(frame.revision,{quantity:2}));const line=frame.cases[0].lines[0],partition={resellable:1,repair:0,damaged:0,mismatch:1,quarantine:0},before=records(f);
 for(const identity of [unknown(),identified({confirmed:false}),identified({fit:'UNKNOWN'}),identified({artwork:null}),identified({color:null}),identified({size:null}),identified({garment_type:'CHILD',size:'M'})])await assert.rejects(mutate(f,inspect(frame.revision,line,partition,{identity})),error('REQUEST_INVALID'));
 assert.deepEqual(records(f),before);frame=await mutate(f,inspect(frame.revision,line,partition,{identity:identified({garment_type:'CHILD',size:'2'})}));assert.equal(frame.summary.physically_available_quantity,1);assert.equal(frame.summary.mismatch_quantity,1);
 await assert.rejects(mutate(f,inspect(frame.revision,line,{resellable:3,repair:0,damaged:0,mismatch:0,quarantine:0})),error('QUANTITY_MISMATCH'));
});

test('inspection corrections and receipt voids keep prior facts auditable and never erase or duplicate quantities',async t=>{
 const f=fixture(t);let frame=await register(f);f.time.value+=1000;frame=await mutate(f,receive(frame.revision));const line=clone(frame.cases[0].lines[0]),receivedAt=line.received_at;f.time.value+=1000;frame=await mutate(f,inspect(frame.revision,line));let audit=JSON.parse(records(f).physical_returns_audit.at(-1).payload);assert.equal(audit.previous_updated_at,receivedAt);assert.deepEqual(audit.previous_line,line);
 const previous=clone(frame.cases[0].lines[0]);f.time.value+=1000;frame=await mutate(f,inspect(frame.revision,line,{resellable:0,repair:0,damaged:3,mismatch:0,quarantine:0},{reason:'Dano confirmado na segunda inspeção'}));audit=JSON.parse(records(f).physical_returns_audit.at(-1).payload);assert.deepEqual(audit.previous_line,previous);assert.equal(audit.request.reason,'Dano confirmado na segunda inspeção');assert.equal(frame.summary.physically_available_quantity,0);
 f.time.value+=1000;frame=await mutate(f,request(frame.revision,'void',{line_id:line.line_id,reason:'Recebimento lançado no caso errado'}));assert.equal(frame.summary.received_quantity,3);assert.equal(frame.summary.active_quantity,0);assert.equal(frame.summary.voided_quantity,3);assert.equal(frame.summary.damaged_quantity,0);assert.equal(frame.cases[0].lines[0].received_at,receivedAt);assert.equal(frame.cases[0].lines[0].status,'VOID');
 await assert.rejects(mutate(f,inspect(frame.revision,line)),error('LINE_VOID'));assert.equal(records(f).physical_returns_audit.length,5);
});

test('receipt references prevent duplicate declarations under new UUIDs, and explicit void permits a replacement',async t=>{
 const f=fixture(t);let frame=await register(f);frame=await mutate(f,receive(frame.revision,{receipt_ref:'Pacote 1 / Feminina M'}));const before=records(f);
 for(const ref of ['PACOTE 1 / FEMININA M','Pacote  1 / Feminina M','Ｐacote 1 / Feminina M'])await assert.rejects(mutate(f,receive(frame.revision,{receipt_ref:ref})),error('RECEIPT_REFERENCE_CONFLICT'));
 assert.deepEqual(records(f),before);frame=await mutate(f,request(frame.revision,'void',{line_id:frame.cases[0].lines[0].line_id,reason:'Referência recebida registrada incorretamente'}));frame=await mutate(f,receive(frame.revision,{receipt_ref:'PACOTE 1 / FEMININA M',quantity:1}));assert.equal(frame.summary.lines,2);assert.equal(frame.summary.active_quantity,1);assert.equal(frame.summary.voided_quantity,3);
});

test('stable request identity survives a lost response and later changes without duplicate receipts, including key-order permutations',async t=>{
 const f=fixture(t);let frame=await register(f);const input=receive(frame.revision);frame=await mutate(f,input);let before=records(f);assert.deepEqual(await mutate(f,input),frame);assert.deepEqual(records(f),before);
 const permuted=Object.fromEntries(Object.entries({...input,identity:Object.fromEntries(Object.entries(input.identity).reverse())}).reverse());assert.deepEqual(await mutate(f,permuted),frame);assert.deepEqual(records(f),before);
 frame=await mutate(f,receive(frame.revision,{receipt_ref:'Pacote 2',quantity:1}));before=records(f);const retried=await mutate(f,input);assert.equal(retried.summary.active_quantity,4);assert.deepEqual(records(f),before);
 await assert.rejects(mutate(f,{...input,quantity:4}),error('CONFLICT'));assert.deepEqual(records(f),before);
});

test('simultaneous identical requests share one winning receipt and different stale revisions cannot partially commit',async t=>{
 const f=fixture(t);let frame=await register(f);const input=receive(frame.revision);let winner;f.db.beforeMutation=async()=>{winner=await mutate(f,input);};frame=await mutate(f,input);assert.deepEqual(frame,winner);assert.equal(frame.summary.lines,1);assert.equal(records(f).physical_returns_audit.length,2);
 const stale=receive(frame.revision,{receipt_ref:'Pacote A'});f.db.beforeMutation=async()=>{winner=await mutate(f,receive(frame.revision,{receipt_ref:'Pacote B',quantity:1}));};await assert.rejects(mutate(f,stale),error('CONFLICT'));assert.deepEqual(await read(f),winner);assert.equal(winner.summary.active_quantity,4);assert.equal(records(f).physical_returns_audit.length,3);
});

test('an audit failure rolls back the revision and receipt atomically, and a guard rejects a conflicting case row',async t=>{
 const f=fixture(t);let frame=await register(f);const before=records(f);f.db.failAudit=true;await assert.rejects(mutate(f,receive(frame.revision)),error('UNAVAILABLE'));assert.deepEqual(records(f),before);
 f.db.beforeMutation=async()=>{f.db.db.prepare('UPDATE physical_returns_cases SET order_hash=? WHERE case_hash=?').run('c'.repeat(64),caseHash);};await assert.rejects(mutate(f,receive(frame.revision)),error('UNAVAILABLE'));assert.equal(records(f).physical_returns_state[0].revision,1);assert.equal(records(f).physical_returns_audit.length,1);assert.deepEqual(JSON.parse(records(f).physical_returns_cases[0].payload).lines,[]);
});

test('capacity, payload bounds and malformed arrays or fields fail closed before any partial receipt',async t=>{
 const f=fixture(t);let frame=await register(f);for(let i=0;i<50;i++)frame=await mutate(f,receive(frame.revision,{receipt_ref:'Parcela '+i,quantity:1}));const before=records(f);await assert.rejects(mutate(f,receive(frame.revision,{receipt_ref:'Parcela extra'})),error('LIMIT'));assert.deepEqual(records(f),before);
 for(const invalid of [0,-0,-1,1.1,10001,Infinity,Number.MAX_SAFE_INTEGER,'3',null])await assert.rejects(mutate(f,receive(frame.revision,{quantity:invalid})),error('REQUEST_INVALID'));
 for(const change of [{receipt_ref:''},{receipt_ref:' x '},{receipt_ref:'x'.repeat(121)},{identity:{...unknown(),private_note:'PRIVATE'}},{line_id:'not-uuid'}])await assert.rejects(mutate(f,receive(frame.revision,change)),error('REQUEST_INVALID'));
 assert.deepEqual(records(f),before);
});

test('global case and receipt capacity reject the next write without dropping existing rows',async t=>{
 const f=fixture(t);let frame=await register(f);frame=await mutate(f,receive(frame.revision,{quantity:1}));const baseRecord=clone(frame.cases[0]),baseLine=clone(baseRecord.lines[0]),stamp=Math.floor(initial/1000);
 const seed=rows=>{f.db.db.prepare('DELETE FROM physical_returns_cases').run();for(const row of rows)f.db.db.prepare('INSERT INTO physical_returns_cases(case_hash,order_hash,payload) VALUES(?,?,?)').run(row.case_hash,row.order_hash,JSON.stringify(row));f.db.db.prepare('UPDATE physical_returns_state SET revision=1000,updated_at=? WHERE id=1').run(stamp);};
 const counts=[...Array(19).fill(50),49,1],rows=counts.map((count,index)=>({...clone(baseRecord),case_hash:index.toString(16).padStart(64,'0'),lines:Array.from({length:count},(_,i)=>({...clone(baseLine),line_id:crypto.randomUUID(),receipt_ref:'Parcela '+i}))}));
 seed(rows);frame=await read(f);assert.equal(frame.summary.lines,1000);assert.equal(frame.cases.length,21);let before=records(f);await assert.rejects(mutate(f,receive(frame.revision,{case_hash:rows.at(-1).case_hash,receipt_ref:'Parcela adicional',quantity:1})),error('LIMIT'));assert.deepEqual(records(f),before);
 seed(Array.from({length:100},(_,index)=>({...clone(baseRecord),case_hash:index.toString(16).padStart(64,'0'),lines:[]})));frame=await read(f);assert.equal(frame.summary.cases,100);before=records(f);await assert.rejects(mutate(f,request(frame.revision,'register',{case_hash:'d'.repeat(64),order_hash:orderHash}),source(f,{case_hash:'d'.repeat(64)})),error('LIMIT'));assert.deepEqual(records(f),before);
});

test('the browser contract enforces UTF-8 payload bounds independently of valid counts',async t=>{
 const f=fixture(t);let frame=await register(f);frame=await mutate(f,receive(frame.revision,{quantity:1}));const baseRecord=clone(frame.cases[0]),baseLine=clone(baseRecord.lines[0]);
 const oversized=clone(frame);oversized.revision=1000;oversized.cases=Array.from({length:20},(_,index)=>({...clone(baseRecord),case_hash:index.toString(16).padStart(64,'0'),lines:Array.from({length:50},(_,i)=>({...clone(baseLine),line_id:crypto.randomUUID(),receipt_ref:'Parcela '+i,identity:identified({artwork:'字'.repeat(120),color:'字'.repeat(80),sku:'字'.repeat(128)})}))}));
 Object.assign(oversized.summary,{cases:20,lines:1000,received_quantity:1000,active_quantity:1000,quarantine_quantity:1000});assert.ok(new TextEncoder().encode(JSON.stringify(oversized)).byteLength>524288);assert.equal(projectPhysicalReturns(oversized),null);
});

test('partial or corrupt storage and regressed clocks are unavailable instead of being silently reset',async t=>{
 const f=fixture(t);f.db.db.exec(PHYSICAL_RETURNS_SCHEMA[0]);await assert.rejects(read(f),error('STORAGE_INVALID'));let frame=await register(f);f.time.value-=1000;await assert.rejects(read(f),error('STORAGE_INVALID'));f.time.value=initial;
 f.db.db.prepare('UPDATE physical_returns_cases SET payload=? WHERE case_hash=?').run('{"private_note":"PRIVATE"}',caseHash);await assert.rejects(read(f),error('STORAGE_INVALID'));assert.equal(records(f).physical_returns_state[0].revision,frame.revision);
});

test('the detached browser projector rejects forged totals, value grants, duplicates, malformed identities and accessors',async t=>{
 const f=fixture(t);let frame=await register(f);frame=await mutate(f,receive(frame.revision));assert.ok(projectPhysicalReturns(frame));
 for(const change of [v=>v.summary.quarantine_quantity++,v=>v.summary.physically_available_quantity=1,v=>v.valuation.amount_cents=0,v=>v.external_stock_write_allowed=true,v=>v.cases[0].lines[0].quantity++,v=>v.cases[0].lines[0].carrying_value_cents=0,v=>v.cases[0].lines.push(clone(v.cases[0].lines[0])),v=>v.cases[0].source.status='PRIVATE_STATUS',v=>v.cases[0].lines[0].identity.confirmed=true,v=>v.private_token='PRIVATE']){const value=clone(frame);change(value);assert.equal(projectPhysicalReturns(value),null,change.toString());}
 let calls=0;const accessor=clone(frame);Object.defineProperty(accessor.cases[0].lines[0],'quantity',{get(){calls++;throw Error('PRIVATE_GETTER');}});assert.equal(projectPhysicalReturns(accessor),null);assert.equal(calls,0);
 const projected=projectPhysicalReturns(frame);projected.cases[0].lines[0].identity.artwork='Other';assert.equal(frame.cases[0].lines[0].identity.artwork,null);
 const context=vm.createContext({serialized:JSON.stringify(frame),TextEncoder});vm.runInContext(projectPhysicalReturns.toString()+'\nglobalThis.result=projectPhysicalReturns(JSON.parse(serialized));',context);assert.deepEqual(JSON.parse(JSON.stringify(context.result)),frame);
});
