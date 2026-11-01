import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {D1} from './sqlite-d1.mjs';
import {readPhysicalReturns,mutatePhysicalReturns,projectPhysicalReturns} from '../src/physical-returns.mjs';
import {readIncurredProduction,mutateIncurredProduction,projectIncurredProduction} from '../src/incurred-production.mjs';
import {RETURN_MANUFACTURING_LINKS_SCHEMA,RETURN_MANUFACTURING_LINKS_TRIGGERS,ReturnManufacturingLinksError,projectReturnManufacturingLinks,readReturnManufacturingLinks,mutateReturnManufacturingLinks,returnManufacturingLinkHandles,deriveReturnManufacturingLinkContext,assessReturnManufacturingLink} from '../src/return-manufacturing-links.mjs';

const initial=Date.UTC(2026,10,1,18),caseHash='a'.repeat(64),orderHash='b'.repeat(64),clone=v=>JSON.parse(JSON.stringify(v)),actor='synthetic-owner';
const identity=(extra={})=>({artwork:'Arte original',color:'Preto',size:'M',garment_type:'ADULT',fit:'MALE',confirmed:true,item_id:null,model_id:null,sku:null,...extra});
class TrackingD1 extends D1{
 constructor(){super();this.sql=[];this.beforeLink=null;this.failAudit=false;}
 prepare(sql){const value=super.prepare(sql);value.sql=sql;this.sql.push(sql);return value;}
 async batch(statements){
  const mutation=statements.some(row=>/^(INSERT OR IGNORE INTO|UPDATE) return_manufacturing_links_state/.test(row.sql??''));
  if(mutation&&this.beforeLink){const before=this.beforeLink;this.beforeLink=null;await before();}
  if(mutation&&this.failAudit){this.failAudit=false;return super.batch(statements.map(row=>row.sql?.startsWith('INSERT INTO return_manufacturing_links_audit')?{async run(){throw Error('PRIVATE_SYNTHETIC_AUDIT_FAILURE');}}:row));}
  return super.batch(statements);
 }
}
function bare(t){const db=new TrackingD1(),time={value:initial};t.after(()=>db.db.close());return {db,env:{ADMIN_DB:db},time,now:()=>time.value};}
const physicalMutation=(f,body,sourceCase=null)=>mutatePhysicalReturns(f.env,body,actor,{now:f.now,sourceCase});
const productionMutation=(f,body)=>mutateIncurredProduction(f.env,body,actor,{now:f.now});
async function parents(f){return {physical:await readPhysicalReturns(f.env,{now:f.now}),production:await readIncurredProduction(f.env,{now:f.now})};}
async function fixture(t){
 const f=bare(t),lineId=crypto.randomUUID(),recordId=crypto.randomUUID();
 await physicalMutation(f,{revision:0,request_id:crypto.randomUUID(),action:'register',case_hash:caseHash,order_hash:orderHash},{case_hash:caseHash,order_hash:orderHash,status:'REFUND_PAID',checked_at:initial/1000-30,month:'2026-10',publication_revision:15});
 await physicalMutation(f,{revision:1,request_id:crypto.randomUUID(),action:'receive',case_hash:caseHash,line_id:lineId,receipt_ref:'Pacote sintético 1',quantity:3,identity:identity()});
 await productionMutation(f,{revision:0,request_id:crypto.randomUUID(),action:'record',record_id:recordId,production_ref:'Lote sintético 1',replaces_record_id:null,produced_date:'2026-10-30',quantity:3,identity:identity(),source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:null,reference:null},evidence:'Confecção física declarada, custo desconhecido',confirmed:true});
 f.db.sql=[];return {...f,lineId,recordId};
}
const read=f=>readReturnManufacturingLinks(f.env,{now:f.now});
const mutate=(f,body,p={physical:null,production:null})=>mutateReturnManufacturingLinks(f.env,body,actor,{now:f.now,...p});
async function linkBody(f,revision=0,extra={}){const p=await parents(f),handles=await returnManufacturingLinkHandles(p.physical,p.production);return {revision,request_id:crypto.randomUUID(),action:'link',link_id:crypto.randomUUID(),case_hash:caseHash,physical_line_id:f.lineId,production_record_id:f.recordId,quantity:2,physical_fingerprint:handles.physical.find(row=>row.line_id===f.lineId).fingerprint,production_fingerprint:handles.production.find(row=>row.record_id===f.recordId).fingerprint,evidence:'Origem das peças conferida pelo operador',confirmed:true,...extra};}
const unlink=(revision,link_id,extra={})=>({revision,request_id:crypto.randomUUID(),action:'unlink',link_id,reason:'Vínculo declarado incorretamente',...extra});
const error=code=>value=>value instanceof ReturnManufacturingLinksError&&value.message==='RETURN_MANUFACTURING_LINKS_'+code;
const ownObjects=f=>f.db.db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name LIKE 'return_manufacturing_links_%' ORDER BY name").all();
const ownRows=f=>JSON.stringify(['return_manufacturing_links_state','return_manufacturing_links_records','return_manufacturing_links_audit','return_manufacturing_links_guard'].map(table=>[table,f.db.db.prepare('SELECT * FROM '+table+' ORDER BY 1').all()]));
const parentRows=f=>JSON.stringify(['physical_returns_state','physical_returns_cases','physical_returns_audit','physical_returns_guard','incurred_production_state','incurred_production_records','incurred_production_audit','incurred_production_guard'].map(table=>[table,f.db.db.prepare('SELECT * FROM '+table+' ORDER BY 1').all()]));
const inspect=(f,p,extra={})=>({revision:p.physical.revision,request_id:crypto.randomUUID(),action:'inspect',case_hash:caseHash,line_id:f.lineId,identity:identity(),partition:{resellable:1,repair:1,damaged:1,mismatch:0,quarantine:0},reason:'Inspeção física do pacote',...extra});

test('a cold association GET is passive and unknown original quantities never become zero or inventory value',async t=>{
 const f=bare(t);for(let i=0;i<3;i++){const frame=await read(f);assert.ok(projectReturnManufacturingLinks(frame));assert.equal(frame.protection.state,'NOT_INITIALIZED');assert.deepEqual(frame.links,[]);assert.equal(frame.summary.linked_quantity,0);assert.deepEqual(frame.original_quantities,{state:'UNAVAILABLE',expected_quantity:null,verified_quantity:null});assert.equal(frame.allocated_inventory_value_cents,null);assert.equal(frame.financial_integration_allowed,false);assert.equal(frame.external_stock_write_allowed,false);}
 assert.deepEqual(ownObjects(f),[]);assert.ok(f.db.sql.every(sql=>/^SELECT /.test(sql)));
 const invalid={revision:0,request_id:crypto.randomUUID(),action:'link',link_id:crypto.randomUUID(),case_hash:caseHash,physical_line_id:crypto.randomUUID(),production_record_id:crypto.randomUUID(),quantity:1,physical_fingerprint:'c'.repeat(64),production_fingerprint:'d'.repeat(64),evidence:'Declaração explícita',confirmed:true};
 await assert.rejects(mutate(f,{...invalid,confirmed:false}),error('REQUEST_INVALID'));await assert.rejects(mutate(f,invalid),error('PARENTS_UNAVAILABLE'));assert.deepEqual(ownObjects(f),[]);
});

test('first valid link initializes its guards and links only declared quantities without changing either parent ledger',async t=>{
 const f=await fixture(t),body=await linkBody(f),p=await parents(f),before=parentRows(f),frame=await mutate(f,body,p);assert.ok(projectReturnManufacturingLinks(frame));assert.equal(frame.protection.state,'READY');assert.deepEqual(frame.protection.missing,[]);assert.equal(ownObjects(f).length,11);assert.equal(frame.revision,1);assert.equal(frame.summary.linked_quantity,2);assert.equal(frame.links[0].quantity,2);assert.equal(frame.links[0].match_basis,'DECLARED_WITH_UNKNOWN_PRODUCTION_ORDER');assert.equal(frame.links[0].physical_snapshot.quantity,3);assert.equal(frame.links[0].production_snapshot.quantity,3);assert.ok(!JSON.stringify(frame.links[0]).includes('unit_cost_cents'));assert.equal(parentRows(f),before);
 const handles=await returnManufacturingLinkHandles(p.physical,p.production),context=deriveReturnManufacturingLinkContext(frame,p.physical,p.production,handles);assert.equal(context.state,'READY');assert.equal(context.summary.valid_quantity,2);assert.equal(context.summary.held_quantity,2);assert.equal(context.physical[0].remaining_quantity,1);assert.equal(context.production[0].remaining_quantity,1);assert.equal(context.links[0].state,'VALID');
 const audit=JSON.parse(f.db.db.prepare('SELECT payload FROM return_manufacturing_links_audit').get().payload);assert.equal(audit.previous_link,null);assert.deepEqual(audit.new_link,frame.links[0]);assert.deepEqual(audit.request,body);
});

test('a failed first audit rolls back all link tables, indices and parent triggers with the association',async t=>{
 const f=await fixture(t),body=await linkBody(f),p=await parents(f),before=parentRows(f);f.db.failAudit=true;await assert.rejects(mutate(f,body,p),error('UNAVAILABLE'));assert.deepEqual(ownObjects(f),[]);assert.equal(parentRows(f),before);assert.equal((await read(f)).protection.state,'NOT_INITIALIZED');
});

test('a parent winning before the first association aborts the entire schema and stale handles cannot be reinterpreted',async t=>{
 const f=await fixture(t),body=await linkBody(f),p=await parents(f);f.db.beforeLink=async()=>{await physicalMutation(f,inspect(f,p,{identity:identity({color:'Verde'})}));};await assert.rejects(mutate(f,body,p),error('CONFLICT'));assert.deepEqual(ownObjects(f),[]);const newer=await parents(f);await assert.rejects(mutate(f,body,newer),error('PARENT_CHANGED'));assert.deepEqual(ownObjects(f),[]);assert.equal(newer.physical.cases[0].lines[0].identity.color,'Verde');
});

test('linked quality-only inspection stays allowed and stable while origin, quantity, date and void changes are blocked atomically',async t=>{
 const f=await fixture(t),body=await linkBody(f);let p=await parents(f);await mutate(f,body,p);const originalHandle=body.physical_fingerprint;
 f.time.value+=1000;await physicalMutation(f,inspect(f,p));p=await parents(f);let handles=await returnManufacturingLinkHandles(p.physical,p.production);assert.equal(handles.physical[0].fingerprint,originalHandle);assert.equal(deriveReturnManufacturingLinkContext(await read(f),p.physical,p.production,handles).links[0].state,'VALID');
 const before=parentRows(f);await assert.rejects(physicalMutation(f,inspect(f,p,{identity:identity({fit:'FEMALE'})})),e=>e.status===409&&e.message==='PHYSICAL_RETURNS_MANUFACTURING_LINK_ACTIVE');await assert.rejects(physicalMutation(f,{revision:p.physical.revision,request_id:crypto.randomUUID(),action:'void',case_hash:caseHash,line_id:f.lineId,reason:'Pacote lançado incorretamente'}),e=>e.status===409&&e.message==='PHYSICAL_RETURNS_MANUFACTURING_LINK_ACTIVE');await assert.rejects(productionMutation(f,{revision:p.production.revision,request_id:crypto.randomUUID(),action:'void',record_id:f.recordId,reason:'Fabricação lançada incorretamente'}),e=>e.status===409&&e.message==='INCURRED_PRODUCTION_RETURN_LINK_ACTIVE');assert.equal(parentRows(f),before);
 const row=f.db.db.prepare('SELECT payload FROM physical_returns_cases WHERE case_hash=?').get(caseHash),saved=JSON.parse(row.payload);
 for(const change of [value=>value.lines[0].quantity++,value=>value.lines[0].received_at--,value=>value.lines.splice(0,1),value=>value.order_hash='c'.repeat(64)]){const altered=clone(saved);change(altered);assert.throws(()=>f.db.db.prepare('UPDATE physical_returns_cases SET payload=? WHERE case_hash=?').run(JSON.stringify(altered),caseHash),/MLS_RETURN_MANUFACTURING_LINK_ACTIVE/);}
 for(const [sql,id] of [['DELETE FROM physical_returns_cases WHERE case_hash=?',caseHash],['DELETE FROM incurred_production_records WHERE record_id=?',f.recordId]])assert.throws(()=>f.db.db.prepare(sql).run(id),/MLS_RETURN_MANUFACTURING_LINK_ACTIVE/);assert.equal(parentRows(f),before);
});

test('semantic identity key order and unrelated receipts in the same case remain mutable without invalidating the selected origin',async t=>{
 const f=await fixture(t),body=await linkBody(f);await mutate(f,body,await parents(f));let p=await parents(f);const other=crypto.randomUUID();await physicalMutation(f,{revision:p.physical.revision,request_id:crypto.randomUUID(),action:'receive',case_hash:caseHash,line_id:other,receipt_ref:'Outro recebimento',quantity:1,identity:identity({fit:'FEMALE'})});p=await parents(f);await physicalMutation(f,inspect(f,p,{line_id:other,identity:identity({fit:'FEMALE'}),partition:{resellable:0,repair:0,damaged:1,mismatch:0,quarantine:0}}));
 const saved=JSON.parse(f.db.db.prepare('SELECT payload FROM physical_returns_cases WHERE case_hash=?').get(caseHash).payload),selected=saved.lines.find(line=>line.line_id===f.lineId);selected.identity=Object.fromEntries(Object.entries(selected.identity).reverse());selected.partition={resellable:0,repair:0,damaged:3,mismatch:0,quarantine:0};selected.status='INSPECTED';selected.reason='Condição avariada, origem igual';f.db.db.prepare('UPDATE physical_returns_cases SET payload=? WHERE case_hash=?').run(JSON.stringify(saved),caseHash);
 p=await parents(f);const handles=await returnManufacturingLinkHandles(p.physical,p.production);assert.equal(handles.physical.find(row=>row.line_id===f.lineId).fingerprint,body.physical_fingerprint);assert.equal(deriveReturnManufacturingLinkContext(await read(f),p.physical,p.production,handles).links[0].state,'VALID');assert.equal(p.physical.cases[0].lines.length,2);
});

test('unlink preserves association snapshots and releases guards before parent corrections, with no implicit transfer',async t=>{
 const f=await fixture(t),body=await linkBody(f),frame=await mutate(f,body,await parents(f)),old=clone(frame.links[0]);f.time.value+=1000;const removed=await mutate(f,unlink(1,body.link_id));assert.equal(removed.summary.linked_quantity,0);assert.equal(removed.links[0].status,'VOID');assert.deepEqual(removed.links[0].physical_snapshot,old.physical_snapshot);assert.deepEqual(removed.links[0].production_snapshot,old.production_snapshot);assert.equal(removed.links[0].quantity,old.quantity);const audit=JSON.parse(f.db.db.prepare('SELECT payload FROM return_manufacturing_links_audit WHERE revision=2').get().payload);assert.deepEqual(audit.previous_link,old);
 const p=await parents(f);await physicalMutation(f,inspect(f,p,{identity:identity({color:'Verde'})}));await productionMutation(f,{revision:p.production.revision,request_id:crypto.randomUUID(),action:'void',record_id:f.recordId,reason:'Corrigir o registro histórico'});const newer=await parents(f),context=deriveReturnManufacturingLinkContext(await read(f),newer.physical,newer.production,await returnManufacturingLinkHandles(newer.physical,newer.production));assert.equal(context.links[0].state,'HISTORICAL');assert.equal(context.summary.held_quantity,0);assert.equal(context.summary.valid_quantity,0);
 await assert.rejects(mutate(f,unlink(2,body.link_id)),error('LINK_VOID'));
});

test('missing protection retains history and allows unlink without parent reads or implicit schema repair',async t=>{
 const f=await fixture(t),body=await linkBody(f);await mutate(f,body,await parents(f));f.db.db.exec('DROP TRIGGER return_manufacturing_links_physical_update; DROP INDEX return_manufacturing_links_physical_active;');const guarded=await read(f);assert.equal(guarded.protection.state,'INCOMPLETE');assert.deepEqual(new Set(guarded.protection.missing),new Set(['return_manufacturing_links_physical_update','return_manufacturing_links_physical_active']));assert.equal(guarded.links.length,1);
 await assert.rejects(mutate(f,await linkBody(f,1,{link_id:crypto.randomUUID()}),await parents(f)),error('PROTECTION_INCOMPLETE'));const beforeObjects=ownObjects(f);f.db.sql=[];const removed=await mutate(f,unlink(1,body.link_id));assert.equal(removed.protection.state,'INCOMPLETE');assert.equal(removed.links[0].status,'VOID');assert.deepEqual(ownObjects(f),beforeObjects);assert.ok(f.db.sql.every(sql=>!/^CREATE|^ALTER/.test(sql)));
});

test('an incorrectly defined named protection object cannot masquerade as complete or be healed by a read',async t=>{
 const f=await fixture(t),body=await linkBody(f);await mutate(f,body,await parents(f));f.db.db.exec("DROP TRIGGER return_manufacturing_links_production_update; CREATE TRIGGER return_manufacturing_links_production_update BEFORE UPDATE ON incurred_production_records WHEN 0 BEGIN SELECT RAISE(ABORT,'MLS_RETURN_MANUFACTURING_LINK_ACTIVE'); END;");const before=ownObjects(f),frame=await read(f);assert.equal(frame.protection.state,'INCOMPLETE');assert.ok(frame.protection.missing.includes('return_manufacturing_links_production_update'));assert.deepEqual(ownObjects(f),before);await mutate(f,unlink(1,body.link_id));
});

test('identical request replay is stable across later unlink, unavailable parents and missing protection without reinstating claims',async t=>{
 const f=await fixture(t),body=await linkBody(f);let frame=await mutate(f,body,await parents(f));let before=ownRows(f);assert.deepEqual(await mutate(f,Object.fromEntries(Object.entries(body).reverse())),frame);assert.equal(ownRows(f),before);f.time.value+=1000;frame=await mutate(f,unlink(1,body.link_id));f.db.db.exec('DROP TRIGGER return_manufacturing_links_physical_delete');before=ownRows(f);const replay=await mutate(f,body);assert.equal(replay.links.length,1);assert.equal(replay.links[0].status,'VOID');assert.equal(replay.summary.linked_quantity,0);assert.equal(replay.protection.state,'INCOMPLETE');assert.equal(ownRows(f),before);await assert.rejects(mutate(f,{...body,quantity:1}),error('CONFLICT'));assert.equal(ownRows(f),before);
});

test('simultaneous identical first requests commit one protected association',async t=>{
 const f=await fixture(t),body=await linkBody(f),p=await parents(f);let winner;f.db.beforeLink=async()=>{winner=await mutate(f,body,p);};const frame=await mutate(f,body,p);assert.deepEqual(frame,winner);assert.equal(frame.links.length,1);assert.equal(frame.revision,1);assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM return_manufacturing_links_audit').get().n,1);assert.equal(ownObjects(f).length,11);
});

test('closed projections and pure helpers reject forged money, original proof, totals, handles and stale selections',async t=>{
 const f=await fixture(t),body=await linkBody(f),p=await parents(f),empty=await read(f),handles=await returnManufacturingLinkHandles(p.physical,p.production),context=deriveReturnManufacturingLinkContext(empty,p.physical,p.production,handles),selection=Object.fromEntries(['case_hash','physical_line_id','production_record_id','quantity','physical_fingerprint','production_fingerprint'].map(key=>[key,body[key]]));assert.equal(assessReturnManufacturingLink(context,selection).state,'READY');assert.equal(assessReturnManufacturingLink(context,{...selection,physical_fingerprint:'f'.repeat(64)}).reason,'PARENT_CHANGED');assert.equal(deriveReturnManufacturingLinkContext(empty,p.physical,p.production,{...handles,physical:[]}),null);
 const frame=await mutate(f,body,p);for(const change of [v=>v.summary.linked_quantity++,v=>v.original_quantities.expected_quantity=0,v=>v.original_quantities.state='VERIFIED',v=>v.allocated_inventory_value_cents=0,v=>v.financial_integration_allowed=true,v=>v.external_stock_write_allowed=true,v=>v.links[0].quantity=4,v=>v.links[0].production_snapshot.order_hash='c'.repeat(64),v=>v.links[0].production_snapshot.identity.fit='FEMALE',v=>v.links.push(clone(v.links[0])),v=>v.protection.state='READY'&&v.protection.missing.push('return_manufacturing_links_physical_update'),v=>v.private_field='PRIVATE']){const bad=clone(frame);change(bad);assert.equal(projectReturnManufacturingLinks(bad),null,change.toString());}
 let calls=0;const accessor=clone(frame);Object.defineProperty(accessor.links[0].physical_snapshot,'quantity',{get(){calls++;throw Error('PRIVATE_GETTER');}});assert.equal(projectReturnManufacturingLinks(accessor),null);assert.equal(calls,0);
 const sandbox=vm.createContext({TextEncoder,raw:JSON.stringify({frame,physical:p.physical,production:p.production,handles})});vm.runInContext([projectPhysicalReturns,projectIncurredProduction,projectReturnManufacturingLinks,deriveReturnManufacturingLinkContext,assessReturnManufacturingLink].map(fn=>fn.toString()).join('\n')+'\nconst data=JSON.parse(raw);globalThis.frame=projectReturnManufacturingLinks(data.frame);globalThis.context=deriveReturnManufacturingLinkContext(frame,data.physical,data.production,data.handles);',sandbox);assert.deepEqual(JSON.parse(JSON.stringify(sandbox.frame)),frame);assert.equal(sandbox.context.summary.valid_quantity,2);
});

test('partial schema, corrupt row columns or audit history and regressed clocks fail closed',async t=>{
 const f=await fixture(t);f.db.db.exec(RETURN_MANUFACTURING_LINKS_SCHEMA[0]);await assert.rejects(read(f),error('STORAGE_INVALID'));assert.equal(ownObjects(f).length,1);f.db.db.exec('DROP TABLE return_manufacturing_links_state');const body=await linkBody(f);await mutate(f,body,await parents(f));f.time.value-=1000;await assert.rejects(read(f),error('STORAGE_INVALID'));f.time.value=initial;
 f.db.db.prepare('UPDATE return_manufacturing_links_records SET quantity=1 WHERE link_id=?').run(body.link_id);await assert.rejects(read(f),error('STORAGE_INVALID'));f.db.db.prepare('UPDATE return_manufacturing_links_records SET quantity=2 WHERE link_id=?').run(body.link_id);f.db.db.prepare('DELETE FROM return_manufacturing_links_audit').run();await assert.rejects(read(f),error('STORAGE_INVALID'));
});

test('the detached ledger enforces global count and UTF-8 byte capacity independently of valid parent quantities',async t=>{
 const f=await fixture(t),body=await linkBody(f),base=await mutate(f,body,await parents(f)),template=base.links[0],wide=identity({artwork:'字'.repeat(120),color:'字'.repeat(80),sku:'字'.repeat(128)});
 const shape=(count,utf8)=>{
  const value=clone(base);value.revision=count;value.links=Array.from({length:count},(_,i)=>{const row=clone(template);row.link_id=crypto.randomUUID();row.case_hash=i.toString(16).padStart(64,'0');row.physical_line_id=crypto.randomUUID();row.production_record_id=crypto.randomUUID();row.quantity=1;row.physical_snapshot.quantity=1;row.production_snapshot.quantity=1;if(utf8){row.physical_snapshot.identity=clone(wide);row.production_snapshot.identity=clone(wide);row.evidence='字'.repeat(240);}return row;});value.summary={active_links:count,voided_links:0,linked_quantity:count};return value;
 };
 const small=shape(10,true);assert.ok(projectReturnManufacturingLinks(small),'wide UTF-8 fields are otherwise valid');const oversized=shape(400,true);assert.ok(oversized.links.length<=1000);assert.ok(oversized.links.every(row=>new TextEncoder().encode(JSON.stringify(row)).byteLength<16384));assert.ok(new TextEncoder().encode(JSON.stringify(oversized)).byteLength>1048576);assert.equal(projectReturnManufacturingLinks(oversized),null);
 const tooMany=shape(1001,false);assert.equal(tooMany.links.length,1001);assert.equal(projectReturnManufacturingLinks(tooMany),null);
});
