import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {readPhysicalReturns,mutatePhysicalReturns} from '../src/physical-returns.mjs';
import {readIncurredProduction,mutateIncurredProduction} from '../src/incurred-production.mjs';
import {readReturnManufacturingLinksWorkspace,mutateReturnManufacturingLinksWorkspace} from '../src/return-manufacturing-links-workspace.mjs';

const at=Date.UTC(2026,10,1,18),uuid=n=>'11111111-1111-4111-8111-'+String(n).padStart(12,'0'),caseHash='a'.repeat(64),orderHash='b'.repeat(64);
const identity={artwork:'Arte sintética',color:'Preta',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:'100',model_id:'0',sku:'SYNTHETIC-M'};
class ObservedD1 extends D1{constructor(){super();this.sql=[];}prepare(sql){this.sql.push(sql);return super.prepare(sql);}}
function bare(t){const db=new ObservedD1(),clock={time:at};t.after(()=>db.db.close());return {db,env:{ADMIN_DB:db},clock,now:()=>clock.time};}
async function fixture(t){
 const f=bare(t),sourceCase={case_hash:caseHash,order_hash:orderHash,month:'2026-10',publication_revision:7,status:'PROCESSING',checked_at:at/1000-1};
 await mutatePhysicalReturns(f.env,{revision:0,request_id:uuid(1),action:'register',case_hash:caseHash,order_hash:orderHash},'synthetic-owner',{now:f.now,sourceCase});
 await mutatePhysicalReturns(f.env,{revision:1,request_id:uuid(2),action:'receive',case_hash:caseHash,line_id:uuid(10),receipt_ref:'SIMULATED-PACOTE-M',quantity:3,identity},'synthetic-owner',{now:f.now});
 const trustedSource={kind:'SAVED_DTF_ORDER_LINE',key:'c'.repeat(64),hash:'d'.repeat(64),checked_at:at/1000-1,order_hash:orderHash,order_status:'TO_RETURN',selling_quantity:1};
 await mutateIncurredProduction(f.env,{revision:0,request_id:uuid(3),action:'record',record_id:uuid(20),production_ref:'SIMULATED-FABRICACAO-M',replaces_record_id:null,produced_date:'2026-10-31',quantity:3,identity,source:{kind:trustedSource.kind,key:trustedSource.key,hash:trustedSource.hash},cost:{unit_cost_cents:1590,reference:null},evidence:'Fabricação e custo declarados para teste sintético',confirmed:true},'synthetic-owner',{now:f.now,trustedSource});
 f.db.sql=[];return f;
}
function request(frame,n,quantity=2){
 const p=frame.handles.physical[0],m=frame.handles.production[0];
 return {revision:frame.ledger.revision,request_id:uuid(n),action:'link',link_id:uuid(n+100),case_hash:p.case_hash,physical_line_id:p.line_id,production_record_id:m.record_id,quantity,physical_fingerprint:p.fingerprint,production_fingerprint:m.fingerprint,evidence:'Confirmei a origem declarada destas peças no lote sintético',confirmed:true};
}
function parentStorage(f){return JSON.stringify(['physical_returns_state','physical_returns_cases','physical_returns_audit','incurred_production_state','incurred_production_records','incurred_production_audit'].map(name=>[name,f.db.db.prepare('SELECT * FROM '+name+' ORDER BY 1').all()]));}

test('cold association workspace has no DDL, no facts and no verified original quantities',async t=>{
 const f=bare(t),value=await readReturnManufacturingLinksWorkspace(f.env,{now:f.now});
 assert.equal(value.schema,'return_manufacturing_links_workspace_v1');assert.equal(value.ledger.revision,0);assert.equal(value.ledger.protection.state,'NOT_INITIALIZED');assert.equal(value.ledger.allocated_inventory_value_cents,null);assert.equal(value.context.original_quantities.state,'UNAVAILABLE');assert.equal(value.context.original_quantities.expected_quantity,null);assert.equal(value.context.original_quantities.verified_quantity,null);
 assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);assert.ok(f.db.sql.every(sql=>/^SELECT\b/.test(sql)));
});

test('a link consumes declared capacities without modifying either parent, cost, valuation or source selling quantity',async t=>{
 const f=await fixture(t),initial=await readReturnManufacturingLinksWorkspace(f.env,{now:f.now}),before=parentStorage(f),body=request(initial,30);
 assert.equal(initial.production.records[0].source.selling_quantity,1);assert.equal(initial.physical.cases[0].lines[0].quantity,3);
 const saved=await mutateReturnManufacturingLinksWorkspace(f.env,body,'synthetic-owner',{now:f.now});
 assert.equal(saved.ledger.protection.state,'READY');assert.equal(saved.ledger.summary.linked_quantity,2);assert.equal(saved.context.summary.valid_quantity,2);assert.equal(saved.context.physical[0].remaining_quantity,1);assert.equal(saved.context.production[0].remaining_quantity,1);assert.equal(saved.ledger.links[0].match_basis,'DECLARED_SAME_SAVED_ORDER');assert.equal(parentStorage(f),before);
 assert.equal(saved.ledger.financial_integration_allowed,false);assert.equal(saved.ledger.external_stock_write_allowed,false);assert.equal(saved.ledger.allocated_inventory_value_cents,null);assert.ok(!JSON.stringify(saved.ledger).includes('unit_cost_cents'),'association snapshots do not allocate a historical total as inventory value');
 const replay=await mutateReturnManufacturingLinksWorkspace(f.env,body,'synthetic-owner',{now:f.now});assert.equal(replay.ledger.links.length,1);assert.equal(replay.ledger.revision,1);
});

test('quality-only inspections keep the origin association valid while parent identity/void mutations are safely rolled back',async t=>{
 const f=await fixture(t),first=await readReturnManufacturingLinksWorkspace(f.env,{now:f.now}),saved=await mutateReturnManufacturingLinksWorkspace(f.env,request(first,40),'synthetic-owner',{now:f.now});
 f.clock.time+=1000;let physical=await readPhysicalReturns(f.env,{now:f.now});
 await mutatePhysicalReturns(f.env,{revision:physical.revision,request_id:uuid(41),action:'inspect',case_hash:caseHash,line_id:uuid(10),identity,partition:{resellable:1,repair:1,damaged:1,mismatch:0,quarantine:0},reason:'Condição inspecionada sem alterar a origem declarada'},'synthetic-owner',{now:f.now});
 let current=await readReturnManufacturingLinksWorkspace(f.env,{now:f.now});assert.equal(current.context.summary.valid_quantity,2);assert.equal(current.handles.physical[0].fingerprint,first.handles.physical[0].fingerprint);assert.equal(current.ledger.revision,saved.ledger.revision);
 const before=parentStorage(f);physical=await readPhysicalReturns(f.env,{now:f.now});
 await assert.rejects(mutatePhysicalReturns(f.env,{revision:physical.revision,request_id:uuid(42),action:'inspect',case_hash:caseHash,line_id:uuid(10),identity:{...identity,color:'Azul'},partition:{resellable:1,repair:1,damaged:1,mismatch:0,quarantine:0},reason:'Identidade incorreta para um vínculo ativo'},'synthetic-owner',{now:f.now}),e=>e.status===409&&e.message==='PHYSICAL_RETURNS_MANUFACTURING_LINK_ACTIVE');
 await assert.rejects(mutatePhysicalReturns(f.env,{revision:physical.revision,request_id:uuid(43),action:'void',case_hash:caseHash,line_id:uuid(10),reason:'Tentativa de anulação com vínculo ativo'},'synthetic-owner',{now:f.now}),e=>e.status===409&&e.message==='PHYSICAL_RETURNS_MANUFACTURING_LINK_ACTIVE');
 const production=await readIncurredProduction(f.env,{now:f.now});await assert.rejects(mutateIncurredProduction(f.env,{revision:production.revision,request_id:uuid(44),action:'void',record_id:uuid(20),reason:'Tentativa de anulação com vínculo ativo'},'synthetic-owner',{now:f.now}),e=>e.status===409&&e.message==='INCURRED_PRODUCTION_RETURN_LINK_ACTIVE');assert.equal(parentStorage(f),before);
 current=await mutateReturnManufacturingLinksWorkspace(f.env,{revision:current.ledger.revision,request_id:uuid(45),action:'unlink',link_id:saved.ledger.links[0].link_id,reason:'Desfazer vínculo antes da correção explícita'},'synthetic-owner',{now:f.now});assert.equal(current.context.summary.held_quantity,0);
 physical=await readPhysicalReturns(f.env,{now:f.now});await mutatePhysicalReturns(f.env,{revision:physical.revision,request_id:uuid(46),action:'void',case_hash:caseHash,line_id:uuid(10),reason:'Anulação após desvincular a origem'},'synthetic-owner',{now:f.now});
 assert.equal((await readReturnManufacturingLinksWorkspace(f.env,{now:f.now})).ledger.links[0].status,'VOID');
});

test('missing parent protection keeps history visible, blocks creation and permits explicit unlink without repairing schema',async t=>{
 const f=await fixture(t),first=await readReturnManufacturingLinksWorkspace(f.env,{now:f.now}),saved=await mutateReturnManufacturingLinksWorkspace(f.env,request(first,50),'synthetic-owner',{now:f.now});
 f.db.db.exec('DROP TABLE physical_returns_cases');f.db.sql=[];
 const current=await readReturnManufacturingLinksWorkspace(f.env,{now:f.now});assert.equal(current.physical,null);assert.equal(current.context.state,'BLOCKED');assert.equal(current.context.summary.held_quantity,2);assert.equal(current.ledger.protection.state,'INCOMPLETE');assert.equal(current.ledger.links.length,1);assert.ok(f.db.sql.every(sql=>/^SELECT\b/.test(sql)));
 const unlinked=await mutateReturnManufacturingLinksWorkspace(f.env,{revision:1,request_id:uuid(51),action:'unlink',link_id:saved.ledger.links[0].link_id,reason:'Correção explícita após fonte indisponível'},'synthetic-owner',{now:f.now});assert.equal(unlinked.ledger.links[0].status,'VOID');assert.equal(unlinked.context.summary.held_quantity,0);assert.equal(unlinked.physical,null);assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='physical_returns_cases'").get().n,0);
});

test('association API authenticates and guards method/query/Origin/CSRF before initialization or provider capabilities',async t=>{
 const {adminFetch,SCHEMA}=await import('../src/admin.mjs'),f=bare(t),env={...f.env,ADMIN_USERNAME:'synthetic-owner',ADMIN_PASSWORD:'synthetic-secret-safe-password',ADMIN_SESSION_SECRET:'s'.repeat(64)},origin='https://links.test';
 const login=await adminFetch(new Request(origin+'/login',{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USERNAME,password:env.ADMIN_PASSWORD})}),env);assert.ok([302,303].includes(login.status));const cookie=login.headers.get('set-cookie').split(';')[0];
 const services=new Proxy({},{get(){throw Error('PROVIDER_MUST_NOT_BE_READ');}}),base=origin+'/api/admin/returns/manufacturing-links',call=(suffix='',options={})=>adminFetch(new Request(base+suffix,{...options,headers:{cookie,...options.headers}}),env,services);
 assert.equal((await adminFetch(new Request(base),env,services)).status,401);assert.equal((await call()).status,200);assert.equal((await call('?month=2026-10')).status,400);assert.equal((await call('',{method:'HEAD'})).status,405);assert.equal((await call('',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'})).status,403);assert.equal((await call('',{method:'POST',headers:{origin:'https://other.invalid','content-type':'application/json'},body:'{}'})).status,403);assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);assert.ok(!SCHEMA.some(sql=>/return_manufacturing_links_/.test(sql)));
});
