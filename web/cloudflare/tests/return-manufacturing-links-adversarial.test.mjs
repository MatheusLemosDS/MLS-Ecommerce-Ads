import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {readPhysicalReturns,mutatePhysicalReturns} from '../src/physical-returns.mjs';
import {readIncurredProduction,mutateIncurredProduction} from '../src/incurred-production.mjs';
import {projectReturnManufacturingLinks,readReturnManufacturingLinks,mutateReturnManufacturingLinks,returnManufacturingLinkHandles,deriveReturnManufacturingLinkContext,assessReturnManufacturingLink} from '../src/return-manufacturing-links.mjs';

const base=Date.UTC(2026,10,1,15),clone=value=>structuredClone(value);
const identity=(extra={})=>({artwork:'Retrô 80',color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null,...extra});
const hash=value=>value.toString(16).padStart(64,'0');
const error=code=>value=>value.message==='RETURN_MANUFACTURING_LINKS_'+code&&value.status===409;
function fixture(t){
 const db=new D1(),env={ADMIN_DB:db},time={value:base},now=()=>time.value;let sequence=1;t.after(()=>db.db.close());
 const uuid=()=>('00000000-0000-4000-8000-'+String(sequence++).padStart(12,'0'));
 const readPhysical=()=>readPhysicalReturns(env,{now}),readProduction=()=>readIncurredProduction(env,{now}),read=()=>readReturnManufacturingLinks(env,{now});
 const parents=async()=>({physical:await readPhysical(),production:await readProduction()});
 const context=async(ledger=null,p=null,m=null)=>{const frames=await parents(),physical=p??frames.physical,production=m??frames.production;return deriveReturnManufacturingLinkContext(ledger??await read(),physical,production,await returnManufacturingLinkHandles(physical,production));};
 async function receive(caseNumber,{quantity=3,order_hash=hash(caseNumber+100),...extra}={}){
  const case_hash=hash(caseNumber);let physical=await readPhysical();
  if(!physical.cases.some(row=>row.case_hash===case_hash))physical=await mutatePhysicalReturns(env,{revision:physical.revision,request_id:uuid(),action:'register',case_hash,order_hash},'synthetic-owner',{now,sourceCase:{case_hash,order_hash,status:'REFUND_PAID',checked_at:Math.floor(now()/1000)-10,month:'2026-10',publication_revision:15}});
  const line_id=uuid();physical=await mutatePhysicalReturns(env,{revision:physical.revision,request_id:uuid(),action:'receive',case_hash,line_id,receipt_ref:'SIMULADO pacote '+sequence,quantity,identity:identity(),...extra},'synthetic-owner',{now});
  return {case_hash,line_id,physical};
 }
 async function manufacture(extra={},options={}){
  const request={revision:(await readProduction()).revision,request_id:uuid(),action:'record',record_id:uuid(),production_ref:'SIMULADO lote '+sequence,replaces_record_id:null,produced_date:'2026-10-31',quantity:3,identity:identity(),source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:1590,reference:null},evidence:'SIMULADO: quantidade física declarada pelo operador',confirmed:true,...extra};
  return {request,production:await mutateIncurredProduction(env,request,'synthetic-owner',{now,...options})};
 }
 async function selection(receipt,record,quantity=1,p=null,m=null){
  const frames=await parents(),physical=p??frames.physical,production=m??frames.production,handles=await returnManufacturingLinkHandles(physical,production);
  return {case_hash:receipt.case_hash,physical_line_id:receipt.line_id,production_record_id:record.request?.record_id??record,quantity,physical_fingerprint:handles.physical.find(row=>row.case_hash===receipt.case_hash&&row.line_id===receipt.line_id).fingerprint,production_fingerprint:handles.production.find(row=>row.record_id===(record.request?.record_id??record)).fingerprint};
 }
 async function link(receipt,record,quantity=1,extra={}){
  const frames=await parents(),request={revision:(await read()).revision,request_id:uuid(),action:'link',link_id:uuid(),...await selection(receipt,record,quantity,frames.physical,frames.production),evidence:'SIMULADO: associação manual declarada, sem prova de peça serializada',confirmed:true,...extra};
  return {request,ledger:await mutateReturnManufacturingLinks(env,request,'synthetic-owner',{now,...frames})};
 }
 const unlink=async(link_id,options={})=>mutateReturnManufacturingLinks(env,{revision:(await read()).revision,request_id:uuid(),action:'unlink',link_id,reason:'SIMULADO: desfazer associação mantendo o histórico'},'synthetic-owner',{now,...options});
 const voidManufacture=async record_id=>mutateIncurredProduction(env,{revision:(await readProduction()).revision,request_id:uuid(),action:'void',record_id,reason:'SIMULADO: correção de produção com substituição explícita'},'synthetic-owner',{now});
 return {db,env,time,now,uuid,readPhysical,readProduction,read,parents,context,receive,manufacture,selection,link,unlink,voidManufacture,advance:seconds=>time.value+=seconds*1000};
}

test('manufacturing capacity is shared globally across separate returns and remains held until unlink',async t=>{
 const f=fixture(t),first=await f.receive(1),second=await f.receive(2),lot=await f.manufacture({quantity:3});
 const a=await f.link(first,lot,2);f.advance(1);const b=await f.link(second,lot,1),before=await f.read();
 assert.equal(b.ledger.summary.linked_quantity,3);const context=await f.context();assert.equal(context.production.find(row=>row.record_id===lot.request.record_id).remaining_quantity,0);
 await assert.rejects(f.link(first,lot,1),error('PAIR_EXISTS'));const third=await f.receive(3);await assert.rejects(f.link(third,lot,1),error('QUANTITY_EXCEEDED'));assert.deepEqual((await f.read()).links,before.links);
 f.advance(1);await f.unlink(a.request.link_id);const reused=await f.link(third,lot,2);assert.equal(reused.ledger.summary.active_links,2);assert.equal(reused.ledger.summary.voided_links,1);assert.equal(reused.ledger.summary.linked_quantity,3);
});

test('one physical receipt cannot be allocated again through a different production record or a fresh pair UUID',async t=>{
 const f=fixture(t),receipt=await f.receive(1,{quantity:3}),a=await f.manufacture({quantity:5}),b=await f.manufacture({quantity:5});
 const first=await f.link(receipt,a,2);await assert.rejects(f.link(receipt,a,1),error('PAIR_EXISTS'));const second=await f.link(receipt,b,1),context=await f.context();
 assert.equal(context.physical[0].linked_quantity,3);assert.equal(context.physical[0].remaining_quantity,0);const c=await f.manufacture({quantity:5});await assert.rejects(f.link(receipt,c,1),error('QUANTITY_EXCEEDED'));
 f.advance(1);await f.unlink(first.request.link_id);const replacement=await f.link(receipt,a,2);assert.notEqual(replacement.request.link_id,first.request.link_id);assert.equal(replacement.ledger.links.find(row=>row.link_id===first.request.link_id).status,'VOID');assert.equal(replacement.ledger.links.find(row=>row.link_id===second.request.link_id).status,'ACTIVE');assert.equal(replacement.ledger.summary.linked_quantity,3);
});

test('changed or unavailable parents never release active claims, and unlink needs neither parent ledger',async t=>{
 const f=fixture(t),receipt=await f.receive(1),lot=await f.manufacture(),saved=await f.link(receipt,lot,2),frames=await f.parents();
 const changed=clone(frames.physical);changed.cases[0].lines[0].identity.color='Azul';const handles=await returnManufacturingLinkHandles(changed,frames.production),context=deriveReturnManufacturingLinkContext(saved.ledger,changed,frames.production,handles);
 assert.equal(context.state,'BLOCKED');assert.deepEqual(context.pending,['ACTIVE_LINK_CONFLICT']);assert.equal(context.links[0].state,'CONFLICT');assert.equal(context.links[0].reason,'PARENT_CHANGED');assert.equal(context.summary.held_quantity,2);assert.equal(context.summary.valid_quantity,0);assert.equal(context.physical[0].remaining_quantity,1);assert.equal(context.production[0].remaining_quantity,1);
 assert.equal(assessReturnManufacturingLink(context,await f.selection(receipt,lot,1,changed,frames.production)).reason,'CONTEXT_BLOCKED');
 const unknown=deriveReturnManufacturingLinkContext(saved.ledger,null,frames.production,await returnManufacturingLinkHandles(null,frames.production));assert.equal(unknown.state,'BLOCKED');assert.deepEqual(unknown.pending,['PARENTS_UNAVAILABLE']);assert.equal(unknown.links[0].state,'UNAVAILABLE');assert.equal(unknown.summary.held_quantity,2);assert.equal(unknown.production[0].linked_quantity,2);assert.equal(unknown.production[0].remaining_quantity,1);
 const reduced=clone(frames.production);reduced.records[0].quantity=1;Object.assign(reduced.summary,{produced_quantity:1,known_cost_quantity:1,known_cost_cents:1590,total_cost_cents:1590});const excessive=deriveReturnManufacturingLinkContext(saved.ledger,frames.physical,reduced,await returnManufacturingLinkHandles(frames.physical,reduced));assert.equal(excessive.links[0].reason,'CAPACITY_EXCEEDED');assert.equal(excessive.summary.held_quantity,2);assert.equal(excessive.production[0].remaining_quantity,0);
 const missing=clone(frames.physical);missing.cases[0].lines=[];Object.assign(missing.summary,{lines:0,received_quantity:0,active_quantity:0,quarantine_quantity:0});const orphan=deriveReturnManufacturingLinkContext(saved.ledger,missing,frames.production,await returnManufacturingLinkHandles(missing,frames.production));assert.equal(orphan.links[0].reason,'PARENT_MISSING');assert.equal(orphan.summary.held_quantity,2);assert.equal(orphan.production[0].remaining_quantity,1);
 const unlinked=await f.unlink(saved.request.link_id,{physical:null,production:null}),history=deriveReturnManufacturingLinkContext(unlinked,null,null,{physical:[],production:[]});assert.equal(history.links[0].state,'HISTORICAL');assert.equal(history.summary.held_quantity,0);assert.equal(unlinked.summary.voided_links,1);assert.ok(projectReturnManufacturingLinks(unlinked));
});

test('production chronology uses the actual Brasília manufacture day, including a UTC next-day receipt boundary',async t=>{
 const f=fixture(t);f.time.value=Date.UTC(2026,10,1,2,30);const receipt=await f.receive(1),received=(await f.readPhysical()).cases[0].lines[0].received_at;assert.equal(new Date(received*1000).toISOString().slice(0,10),'2026-11-01');
 f.time.value=Date.UTC(2026,10,2,15);const tooLate=await f.manufacture({produced_date:'2026-11-01'});await assert.rejects(f.link(receipt,tooLate),error('DATE_MISMATCH'));
 const historical=await f.manufacture({produced_date:'2026-10-31'}),linked=await f.link(receipt,historical);assert.equal(linked.ledger.links[0].production_snapshot.produced_date,'2026-10-31');assert.ok(historical.production.records.find(row=>row.record_id===historical.request.record_id).recorded_at>received,'recording a valid historical fact after the return does not change its manufacture day');assert.equal((await f.context()).links[0].state,'VALID');
});

test('unknown production order and unknown cost allow only an explicit quantity association without valuation',async t=>{
 const f=fixture(t),receipt=await f.receive(1),unknown=await f.manufacture({cost:{unit_cost_cents:null,reference:null}}),linked=await f.link(receipt,unknown),context=await f.context();
 assert.equal(linked.ledger.links[0].match_basis,'DECLARED_WITH_UNKNOWN_PRODUCTION_ORDER');assert.equal(unknown.production.records[0].cost.state,'UNKNOWN');assert.deepEqual(context.original_quantities,{state:'UNAVAILABLE',expected_quantity:null,verified_quantity:null});assert.equal(context.allocated_inventory_value_cents,null);assert.equal(context.financial_integration_allowed,false);assert.equal(context.external_stock_write_allowed,false);
 assert.ok(!JSON.stringify(context).includes('unit_cost_cents'));assert.ok(!JSON.stringify(linked.ledger.links).includes('unit_cost_cents'));
 const source={kind:'SAVED_DTF_ORDER_LINE',key:hash(401),hash:hash(402),checked_at:Math.floor(f.now()/1000)-10,order_hash:hash(999),order_status:'CANCELLED',selling_quantity:1},saved=await f.manufacture({quantity:3,source:{kind:source.kind,key:source.key,hash:source.hash}},{trustedSource:source});
 await assert.rejects(f.link(receipt,saved),error('ORDER_MISMATCH'));source.key=hash(403);source.hash=hash(404);source.order_hash=hash(101);const same=await f.manufacture({quantity:3,source:{kind:source.kind,key:source.key,hash:source.hash}},{trustedSource:source}),sameOrder=await f.link(receipt,same,2);assert.equal(sameOrder.ledger.links.find(row=>row.production_record_id===same.request.record_id).match_basis,'DECLARED_SAME_SAVED_ORDER');assert.equal((await f.context()).summary.valid_quantity,3,'declared physical capacities do not become a verified original selling quantity');
 for(const forged of [value=>value.original_quantities.expected_quantity=0,value=>value.original_quantities.verified_quantity=3,value=>value.allocated_inventory_value_cents=1590,value=>value.financial_integration_allowed=true]){const frame=clone(sameOrder.ledger);forged(frame);assert.equal(projectReturnManufacturingLinks(frame),null);}
});

test('void and replacement require unlink and never move an older association to a new manufacture record',async t=>{
 const f=fixture(t),receipt=await f.receive(1),original=await f.manufacture({production_ref:'SIMULADO lote de substituição'}),linked=await f.link(receipt,original,2),before=await f.readProduction(),auditBefore=f.db.db.prepare('SELECT * FROM incurred_production_audit ORDER BY revision').all();
 await assert.rejects(f.voidManufacture(original.request.record_id),value=>value.message==='INCURRED_PRODUCTION_RETURN_LINK_ACTIVE'&&value.status===409);assert.deepEqual(await f.readProduction(),before);assert.deepEqual(f.db.db.prepare('SELECT * FROM incurred_production_audit ORDER BY revision').all(),auditBefore);
 f.advance(1);await f.unlink(linked.request.link_id);f.advance(1);await f.voidManufacture(original.request.record_id);f.advance(1);const replacement=await f.manufacture({production_ref:'SIMULADO lote de substituição',replaces_record_id:original.request.record_id,quantity:2,cost:{unit_cost_cents:null,reference:null}}),context=await f.context();
 assert.equal(context.links.length,1);assert.equal(context.links[0].state,'HISTORICAL');assert.equal(context.links[0].production_record_id,original.request.record_id);assert.equal(context.summary.held_quantity,0);assert.equal(context.production.find(row=>row.record_id===replacement.request.record_id).linked_quantity,0);assert.equal(context.production.find(row=>row.record_id===replacement.request.record_id).remaining_quantity,2);
 const relinked=await f.link(receipt,replacement,2);assert.equal(relinked.ledger.summary.active_links,1);assert.equal(relinked.ledger.summary.voided_links,1);assert.notEqual(relinked.request.link_id,linked.request.link_id);assert.equal(relinked.ledger.links.find(row=>row.link_id===linked.request.link_id).production_record_id,original.request.record_id);
});

test('unrelated parent revisions and quality-only inspection preserve origin fingerprints and historical links',async t=>{
 const f=fixture(t),receipt=await f.receive(1),lot=await f.manufacture(),linked=await f.link(receipt,lot,2),before=await f.parents(),oldHandles=await returnManufacturingLinkHandles(before.physical,before.production),permuted=clone(before.physical);
 permuted.cases[0].lines[0].identity=Object.fromEntries(Object.entries(permuted.cases[0].lines[0].identity).reverse());assert.deepEqual(await returnManufacturingLinkHandles(permuted,before.production),oldHandles);
 f.advance(1);const physical=await f.readPhysical();await mutatePhysicalReturns(f.env,{revision:physical.revision,request_id:f.uuid(),action:'inspect',case_hash:receipt.case_hash,line_id:receipt.line_id,identity:identity(),partition:{resellable:0,repair:1,damaged:1,mismatch:0,quarantine:1},reason:'SIMULADO: reavaliação de condição, sem alterar origem'},'synthetic-owner',{now:f.now});
 await f.receive(2,{quantity:1});await f.manufacture({quantity:1});const after=await f.parents(),newHandles=await returnManufacturingLinkHandles(after.physical,after.production),context=await f.context();assert.equal(context.links[0].state,'VALID');assert.equal(context.summary.valid_quantity,2);assert.equal(newHandles.physical.find(row=>row.line_id===receipt.line_id).fingerprint,oldHandles.physical[0].fingerprint);assert.equal(newHandles.production.find(row=>row.record_id===lot.request.record_id).fingerprint,oldHandles.production[0].fingerprint);assert.deepEqual((await f.read()).links,linked.ledger.links);
});

test('semantically reordered physical identity remains the same origin when allocating a second manufacture lot',async t=>{
 const f=fixture(t),receipt=await f.receive(1),first=await f.manufacture(),second=await f.manufacture();await f.link(receipt,first);const before=await f.parents(),handles=await returnManufacturingLinkHandles(before.physical,before.production),stored=clone(before.physical.cases[0]),line=stored.lines[0];
 line.identity=Object.fromEntries(Object.entries(line.identity).reverse());line.status='INSPECTED';line.partition={resellable:0,repair:1,damaged:1,mismatch:0,quarantine:1};line.reason='SIMULADO: condição revista preservando os campos de origem';
 f.db.db.prepare('UPDATE physical_returns_cases SET payload=? WHERE case_hash=?').run(JSON.stringify(stored),receipt.case_hash);
 const reordered=await f.parents(),newHandles=await returnManufacturingLinkHandles(reordered.physical,reordered.production);assert.deepEqual(newHandles,handles);assert.equal((await f.context()).links[0].state,'VALID');
 const linked=await f.link(receipt,second);assert.equal(linked.ledger.summary.active_links,2);assert.ok(projectReturnManufacturingLinks(linked.ledger));assert.deepEqual((await f.context()).links.map(row=>row.state),['VALID','VALID']);
});
