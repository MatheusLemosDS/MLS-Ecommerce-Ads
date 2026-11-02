import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
import {ReceiptD1,receiptFixture,receiptBody,physicalSnapshot,financialSnapshot,source,clone,month,stamp,now} from './returns-receipt-test-fixture.mjs';
import {readReturnReceiptContext,readReturnsReceiptWorkspace,projectReturnsReceiptWorkspace} from '../src/returns-receipt-proposal.mjs';
import {confirmReturnsReceipt,projectReturnReceiptConfirmation} from '../src/returns-receipt-confirmation.mjs';
import {projectPhysicalReturns,mutatePhysicalReturns,commitPhysicalReturnReceipt,PHYSICAL_RETURNS_SCHEMA} from '../src/physical-returns.mjs';
import {CATALOG_MEDIA_SCHEMA,prepareCatalogMediaRows} from '../src/saved-catalog-media.mjs';
import {projectPhysicalReturnsWorkspace} from '../src/physical-returns-view.mjs';
import {projectPhysicalReturnsOriginalItemsWorkspace,projectBusinessOriginalItems} from '../src/business-original-items.mjs';
import {projectBusinessReconciliation} from '../src/business-reconciliation.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';
import {projectOriginalItemsFrame} from '../../finance/src/original-items-frame.mjs';

const deps=[projectPhysicalReturnsOriginalItemsWorkspace,projectPhysicalReturnsWorkspace,projectBusinessOriginalItems,projectBusinessReconciliation,projectReconciliationFrame,projectOriginalItemsFrame],project=value=>projectReturnsReceiptWorkspace(value,...deps),read=env=>readReturnsReceiptWorkspace(env,{month},{now});
const conflict=error=>error.status===409;
const sha=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),byte=>byte.toString(16).padStart(2,'0')).join('');

test('cold receipt GET is SELECT-only and keeps uncaptured quantities unknown',async t=>{
 const db=new ReceiptD1();t.after(()=>db.db.close());const empty=await read({ADMIN_DB:db});assert.ok(project(empty));assert.deepEqual(empty.cards,[]);assert.ok(db.sql.every(sql=>/^SELECT\b/.test(sql)));assert.equal(db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);
 const f=await receiptFixture(t,{captured:false}),before=financialSnapshot(f.db);const value=await read(f.env);assert.ok(project(value));assert.equal(value.cards[0].can_confirm,false);assert.equal(value.cards[0].data_state,'NOT_CAPTURED');assert.deepEqual(value.cards[0].items,[]);assert.ok(value.cards[0].pending.includes('REQUEST_ITEMS_NOT_CAPTURED'));assert.equal(financialSnapshot(f.db),before);assert.ok(f.db.sql.every(sql=>/^SELECT\b/.test(sql)));
});

test('saved single garment fills exact size and current cost without writing or calling a provider',async t=>{
 const f=await receiptFixture(t),before=financialSnapshot(f.db),value=await read(f.env);assert.ok(project(value));assert.equal(value.cards[0].data_state,'READY');assert.equal(value.cards[0].can_confirm,true);assert.deepEqual(value.cards[0].items[0].components.map(row=>[row.size,row.color,row.fit,row.quantity]),[['M','Verde','UNISEX',1]]);assert.equal(value.cards[0].items[0].unit_cost_cents,1590);assert.equal(value.cards[0].items[0].image_url,null);assert.equal(financialSnapshot(f.db),before);assert.ok(f.db.sql.every(sql=>/^SELECT\b/.test(sql)));
});

test('owner confirmation receives and inspects atomically, values stay UNKNOWN, and replay is idempotent after metadata changes',async t=>{
 const f=await receiptFixture(t),value=await read(f.env),body=receiptBody(value),before=financialSnapshot(f.db);
 const result=await confirmReturnsReceipt(f.env,{month},body,'owner',{now});assert.ok(project(result));assert.equal(result.physical_revision,1);assert.equal(result.cards[0].receipt_state,'RECEIVED');const physical=result.workspace.report.physical;assert.equal(physical.summary.resellable_quantity,1);assert.equal(physical.valuation.amount_cents,null);assert.equal(physical.external_stock_write_allowed,false);assert.equal(f.db.receiptBatches,1);assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM physical_returns_audit').get().n,1);assert.equal(financialSnapshot(f.db),before);
 const snapshot=physicalSnapshot(f.db);f.db.db.prepare('DELETE FROM catalog_classification_variants').run();f.db.db.prepare('DELETE FROM business_reconciliation_original_items').run();const replay=await confirmReturnsReceipt(f.env,{month},body,'owner',{now});assert.ok(project(replay));assert.equal(replay.physical_revision,1);assert.equal(physicalSnapshot(f.db),snapshot);assert.equal(f.db.receiptBatches,1);
 await assert.rejects(confirmReturnsReceipt(f.env,{month},{...body,proposal_hash:'f'.repeat(64)},'owner',{now}),conflict);assert.equal(physicalSnapshot(f.db),snapshot);
});

test('missing metadata can only record an explicit problem and never presume resellable pieces or cost zero',async t=>{
 const f=await receiptFixture(t,{captured:false,catalogue:false,costs:false}),value=await read(f.env),body={...receiptBody(value),decision:'PROBLEM',quantity:3,condition:'QUARANTINE',reason:'Recebi três peças e preciso conferir a identidade.'};
 await assert.rejects(confirmReturnsReceipt(f.env,{month},receiptBody(value),'owner',{now}),conflict);const result=await confirmReturnsReceipt(f.env,{month},body,'owner',{now});assert.ok(project(result));assert.equal(result.cards[0].receipt_state,'PROBLEM');assert.equal(result.workspace.report.physical.summary.quarantine_quantity,3);assert.equal(result.workspace.report.physical.summary.resellable_quantity,0);assert.equal(result.workspace.report.physical.cases[0].lines[0].identity.confirmed,false);assert.equal(result.workspace.report.physical.cases[0].lines[0].identity.item_id,null);
});

test('a kit request alone does not prove that both physical pieces were returned',async t=>{
 const f=await receiptFixture(t,{catalogOptions:{kit:true}}),value=await read(f.env);assert.ok(project(value));assert.equal(value.cards[0].items[0].requested_quantity,1);assert.deepEqual(value.cards[0].items[0].components.map(row=>[row.fit,row.size]),[['MALE','G'],['FEMALE','M']]);
 const result=await confirmReturnsReceipt(f.env,{month},receiptBody(value),'owner',{now});assert.equal(result.workspace.report.physical.summary.received_quantity,2,'the explicit owner received-as-shown command confirms both shown components');assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM physical_returns_audit').get().n,1);
});

test('audit failure rolls back state, physical pieces and case registration in the same transaction',async t=>{
 const f=await receiptFixture(t),value=await read(f.env),body=receiptBody(value),before=physicalSnapshot(f.db);f.db.failAudit=true;await assert.rejects(confirmReturnsReceipt(f.env,{month},body,'owner',{now}),error=>error.status===503);assert.equal(physicalSnapshot(f.db),before);const result=await confirmReturnsReceipt(f.env,{month},body,'owner',{now});assert.equal(result.physical_revision,1);assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM physical_returns_audit').get().n,1);
});

test('CAS rejects a stale tab, duplicate receipt or changing source bytes without a partial audit',async t=>{
 for(const change of [db=>db.prepare("UPDATE business_month_publications SET write_token='changed'").run(),db=>db.prepare("UPDATE business_reconciliation_reports SET checked_at=checked_at+1").run(),db=>db.prepare("UPDATE business_reconciliation_original_items SET payload_hash=?").run('0'.repeat(64)),db=>db.prepare("UPDATE catalog_classification_jobs SET product_name='Outro produto' WHERE item_id='1000'").run(),db=>db.prepare("UPDATE catalog_classification_variants SET payload=replace(payload,'Verde','Azul')").run(),db=>db.prepare("UPDATE production_costs_state SET payload=replace(payload,'1590','1700')").run(),db=>db.prepare("UPDATE production_cost_catalog SET checked_at=checked_at+1").run()]){
  const f=await receiptFixture(t),value=await read(f.env),body=receiptBody(value),before=physicalSnapshot(f.db);f.db.beforeReceipt=change;await assert.rejects(confirmReturnsReceipt(f.env,{month},body,'owner',{now}),conflict);assert.equal(physicalSnapshot(f.db),before);
 }
 const f=await receiptFixture(t),value=await read(f.env),body=receiptBody(value);await confirmReturnsReceipt(f.env,{month},body,'owner',{now});await assert.rejects(confirmReturnsReceipt(f.env,{month},{...body,request_id:crypto.randomUUID()},'owner',{now}),conflict);const updated=await read(f.env);await assert.rejects(confirmReturnsReceipt(f.env,{month},receiptBody(updated),'owner',{now}),conflict);assert.equal(f.db.db.prepare('SELECT COUNT(*) n FROM physical_returns_audit').get().n,1);
});

test('unknown order quantity and missing or changed composition never become automatically confirmed identity',async t=>{
 const unknown=clone(source);unknown.original_items.orders[0].state='NOT_CAPTURED';unknown.original_items.orders[0].items=[];const f=await receiptFixture(t,{evidence:unknown}),value=await read(f.env);assert.ok(project(value));assert.equal(value.cards[0].items[0].ordered_quantity,null);assert.equal(value.cards[0].can_confirm,false);assert.ok(value.cards[0].pending.includes('QUANTITY_CONFLICT'));
 const missing=await receiptFixture(t,{catalogue:false});const empty=await read(missing.env);assert.equal(empty.cards[0].items[0].unit_cost_cents,null);assert.equal(empty.cards[0].items[0].current_cost_cents,null);assert.deepEqual(empty.cards[0].items[0].components,[]);assert.equal(empty.cards[0].can_confirm,false);
});

test('unreadable cost source is an explicit review state instead of an actionable proposal that cannot commit',async t=>{
 const f=await receiptFixture(t);f.db.db.prepare("UPDATE production_costs_state SET payload='{}'").run();const value=await read(f.env);assert.ok(project(value));assert.equal(value.cards[0].can_confirm,false);assert.equal(value.cards[0].data_state,'REVIEW_REQUIRED');assert.ok(value.cards[0].pending.includes('SOURCE_UNAVAILABLE'));assert.equal(value.cards[0].items[0].unit_cost_cents,null);
});

test('global previous receipts, including unidentified problems, prevent duplicate order quantities across cases',async t=>{
 for(const unknown of [false,true]){
  const f=await receiptFixture(t),value=await read(f.env),selected=value.workspace.report.source.cases[0],other='d'.repeat(64),sourceCase={...selected,case_hash:other,month},request_id=crypto.randomUUID();
  await mutatePhysicalReturns(f.env,{revision:0,request_id,action:'register',case_hash:other,order_hash:selected.order_hash},'owner',{now,sourceCase});
  const identity={artwork:'Produto #1000',color:'Verde',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:!unknown,item_id:unknown?null:'1000',model_id:unknown?null:'0',sku:null};
  await mutatePhysicalReturns(f.env,{revision:1,request_id:crypto.randomUUID(),action:'receive',case_hash:other,line_id:crypto.randomUUID(),receipt_ref:'Outra entrega',quantity:2,identity},'owner',{now});
  const current=await read(f.env);assert.ok(project(current));assert.equal(current.cards[0].can_confirm,false);assert.ok(current.cards[0].pending.includes('QUANTITY_CONFLICT'));const before=physicalSnapshot(f.db);await assert.rejects(confirmReturnsReceipt(f.env,{month},receiptBody(current),'owner',{now}),conflict);assert.equal(physicalSnapshot(f.db),before);
 }
});

test('a pre-registered case preserves its frozen source after a current receipt is confirmed',async t=>{
 const f=await receiptFixture(t),value=await read(f.env),selected=value.workspace.report.source.cases[0],older={...selected,publication_revision:1,status:'REQUESTED',checked_at:stamp-100,month:'2026-09'};
 await mutatePhysicalReturns(f.env,{revision:0,request_id:crypto.randomUUID(),action:'register',case_hash:selected.case_hash,order_hash:selected.order_hash},'owner',{now,sourceCase:older});
 const next=await read(f.env),result=await confirmReturnsReceipt(f.env,{month},receiptBody(next),'owner',{now});assert.deepEqual(result.workspace.report.physical.cases[0].source,{month:'2026-09',publication_revision:1,status:'REQUESTED',checked_at:stamp-100});assert.equal(result.workspace.report.physical.cases[0].lines.length,1);
});

test('a collector change between the parsed workspace and later raw source proof cannot fence a different quantity',async t=>{
 const f=await receiptFixture(t),value=await read(f.env),body=receiptBody(value),row=f.db.db.prepare('SELECT * FROM business_reconciliation_original_items').get(),payload=JSON.parse(row.payload);payload.cases[0].items[0].quantity=2;const raw=JSON.stringify(payload),checksum=await sha(raw),prepare=f.db.prepare.bind(f.db);let changed=false;
 f.db.prepare=sql=>{if(!changed&&sql.startsWith('SELECT source_revision,write_token,payload FROM business_month_publications')){changed=true;f.db.db.prepare('UPDATE business_reconciliation_original_items SET payload=?,payload_hash=?').run(raw,checksum);}return prepare(sql);};
 await assert.rejects(confirmReturnsReceipt(f.env,{month},body,'owner',{now}),conflict);assert.equal(changed,true);assert.equal(f.db.db.prepare('SELECT payload FROM business_reconciliation_original_items').get().payload,raw);assert.equal(f.db.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='physical_returns_state'").get().n,0);assert.equal(f.db.receiptBatches,0);
});

test('current photo and exact DTF art are read from saved sources, never expose the private serial, and are fenced at commit',async t=>{
 for(const mutate of ['PHOTO','DTF']){
  const privateSerial='SYNTHETIC-PRIVATE-ORDER-SERIAL',orderHash=await sha(privateSerial),evidence=JSON.parse(JSON.stringify(source).replaceAll('b'.repeat(64),orderHash)),f=await receiptFixture(t,{evidence});
  const payload=JSON.stringify({item_id:'1000',model_id:'0',sku:'neon-28',quantity:2,model_name:'Verde / M',requires_pair:false});
  f.db.db.exec('CREATE TABLE production_dtf_lines(unit_key TEXT PRIMARY KEY,order_id TEXT NOT NULL,payload TEXT NOT NULL,source_hash TEXT NOT NULL,produced_batch_id TEXT,missing INTEGER NOT NULL)');f.db.db.prepare('INSERT INTO production_dtf_lines VALUES(?,?,?,?,NULL,0)').run('u1',privateSerial,payload,await sha(payload));
  await f.db.batch(CATALOG_MEDIA_SCHEMA.map(sql=>f.db.prepare(sql)));const photo={item_id:'1000',catalog_fingerprint:'c'.repeat(64),checked_at:stamp,state:'AVAILABLE',image_url:'https://down-br.img.susercontent.com/file/synthetic-photo',basis:'CURRENT_PRODUCT_PHOTO_NOT_PRINT_ARTWORK'},[media]=await prepareCatalogMediaRows([photo]);f.db.db.prepare('INSERT INTO catalog_product_media VALUES(?,?,?,?,?)').run(photo.item_id,photo.catalog_fingerprint,stamp,media.payload,media.payload_hash);
  f.db.sql=[];const value=await read(f.env);assert.ok(project(value));assert.equal(value.cards[0].items[0].image_url,photo.image_url);assert.deepEqual(value.cards[0].items[0].artwork,{art_key:'neon',sha256:null});assert.equal(JSON.stringify(value).includes(privateSerial),false);assert.ok(f.db.sql.every(sql=>/^SELECT\b/.test(sql)));
  const before=physicalSnapshot(f.db);f.db.beforeReceipt=db=>mutate==='PHOTO'?db.prepare("UPDATE catalog_product_media SET payload_hash=?").run('0'.repeat(64)):db.prepare("UPDATE production_dtf_lines SET payload=replace(payload,'neon','different')").run();await assert.rejects(confirmReturnsReceipt(f.env,{month},receiptBody(value),'owner',{now}),conflict);assert.equal(physicalSnapshot(f.db),before);
 }
});

test('an unpriced child size remains identifiable while its monetary value stays unknown',async t=>{
 const f=await receiptFixture(t,{catalogOptions:{child:true},costs:false}),value=await read(f.env);assert.ok(project(value));assert.equal(value.cards[0].items[0].components[0].size,'2');assert.equal(value.cards[0].items[0].components[0].garment_type,'CHILD');assert.equal(value.cards[0].items[0].unit_cost_cents,null);assert.equal(value.cards[0].items[0].current_cost_cents,null);assert.equal(value.cards[0].can_confirm,true);
});

test('DTF selection ignores unrelated rows, reports its own overflow, and rejects artwork too long for physical identity',async t=>{
 const f=await receiptFixture(t);f.db.db.exec('CREATE TABLE production_dtf_lines(unit_key TEXT PRIMARY KEY,order_id TEXT NOT NULL,payload TEXT NOT NULL,source_hash TEXT NOT NULL,produced_batch_id TEXT,missing INTEGER NOT NULL)');
 const insert=f.db.db.prepare('INSERT INTO production_dtf_lines VALUES(?,?,?,?,NULL,0)'),other=JSON.stringify({item_id:'9999',model_id:'0',sku:'other-28'});for(let i=0;i<1001;i++)insert.run('other'+i,'SYNTHETIC-OTHER',other,'0'.repeat(64));
 const value=await read(f.env);assert.ok(project(value));assert.equal(value.cards[0].can_confirm,true);f.db.beforeReceipt=db=>db.prepare("UPDATE production_dtf_lines SET source_hash=? WHERE unit_key='other0'").run('1'.repeat(64));assert.equal((await confirmReturnsReceipt(f.env,{month},receiptBody(value),'owner',{now})).physical_revision,1,'unrelated DTF writes do not invalidate a receipt');
 const overflow=await receiptFixture(t);overflow.db.db.exec('CREATE TABLE production_dtf_lines(unit_key TEXT PRIMARY KEY,order_id TEXT NOT NULL,payload TEXT NOT NULL,source_hash TEXT NOT NULL,produced_batch_id TEXT,missing INTEGER NOT NULL)');const add=overflow.db.db.prepare('INSERT INTO production_dtf_lines VALUES(?,?,?,?,NULL,0)'),selected=JSON.stringify({item_id:'1000',model_id:'0',sku:'selected-28'});for(let i=0;i<1001;i++)add.run('selected'+i,'SYNTHETIC-SELECTED',selected,'0'.repeat(64));const blocked=await read(overflow.env);assert.ok(project(blocked));assert.equal(blocked.cards[0].can_confirm,false);assert.ok(blocked.cards[0].pending.includes('DTF_CONFLICT'));
 const serial='SYNTHETIC-ART-ORDER',orderHash=await sha(serial),evidence=JSON.parse(JSON.stringify(source).replaceAll('b'.repeat(64),orderHash)),long=await receiptFixture(t,{evidence});long.db.db.exec('CREATE TABLE production_dtf_lines(unit_key TEXT PRIMARY KEY,order_id TEXT NOT NULL,payload TEXT NOT NULL,source_hash TEXT NOT NULL,produced_batch_id TEXT,missing INTEGER NOT NULL)');const payload=JSON.stringify({item_id:'1000',model_id:'0',sku:'a'.repeat(121)+'-28'});long.db.db.prepare('INSERT INTO production_dtf_lines VALUES(?,?,?,?,NULL,0)').run('long',serial,payload,await sha(payload));const tooLong=await read(long.env);assert.ok(project(tooLong));assert.equal(tooLong.cards[0].can_confirm,false);assert.ok(tooLong.cards[0].pending.includes('DTF_CONFLICT'));assert.equal(tooLong.cards[0].items[0].artwork,null);
});

test('new atomic entry rejects a clock that moved backwards or expired while source validation was running',async t=>{
 for(const elapsed of [-1,61]){
  const f=await receiptFixture(t),context=await readReturnReceiptContext(f.env,{month},{now}),body=receiptBody(context.workspace),plan=context.plans.get(body.case_hash),component=plan.card.items[0].components[0],{quantity,...identity}=component;
  await f.db.batch(PHYSICAL_RETURNS_SCHEMA.map(sql=>f.db.prepare(sql)));const before=physicalSnapshot(f.db);let calls=0;
  await assert.rejects(commitPhysicalReturnReceipt(f.env,body,'owner',{now:()=>((calls++?stamp+elapsed:stamp)*1000),sourceCase:plan.sourceCase,sourceGuard:plan.sourceGuard,lines:[{line_id:crypto.randomUUID(),receipt_ref:'Recebimento simulado',quantity,identity:{...identity,confirmed:true},partition:{resellable:1,repair:0,damaged:0,mismatch:0,quarantine:0},reason:'Conferido no cenário local.'}]}),error=>error.status===503);assert.equal(physicalSnapshot(f.db),before);assert.equal(f.db.receiptBatches,0);
 }
});

test('closed request and response projectors reject accessors, extra fields, unsafe numbers, sparse arrays and leaked private fields',async t=>{
 const f=await receiptFixture(t),value=await read(f.env),body=receiptBody(value);assert.ok(projectReturnReceiptConfirmation(body));let accessed=0;const accessor={...body};Object.defineProperty(accessor,'decision',{enumerable:true,get(){accessed++;throw Error('PRIVATE');}});assert.equal(projectReturnReceiptConfirmation(accessor),null);assert.equal(accessed,0);
 for(const change of [row=>row.private_serial='PRIVATE',row=>row.revision=-0,row=>row.quantity=1,row=>row.decision='AUTO',row=>row.request_id='no']){const input=clone(body);change(input);assert.equal(projectReturnReceiptConfirmation(input),null);}
 for(const change of [row=>row.secret='PRIVATE',row=>row.cards[0].items[0].private_serial='PRIVATE',row=>row.cards[0].items[0].components[0].size='UNKNOWN',row=>row.cards[0].items[0].current_cost_cents=0,row=>row.cards[0].items=new Array(1),row=>row.cards[0].items[0].image_url='https://example.com/file/private']){const input=clone(value);change(input);assert.equal(project(input),null);}
});

for(const minify of [false,true])test('receipt projector is self-contained when frozen in the browser (minify='+minify+')',async t=>{
 const f=await receiptFixture(t),value=await read(f.env),functions=[projectReconciliationFrame,projectBusinessReconciliation,projectOriginalItemsFrame,projectBusinessOriginalItems,projectPhysicalReturns,projectPhysicalReturnsWorkspace,projectPhysicalReturnsOriginalItemsWorkspace,projectReturnsReceiptWorkspace],source=functions.map(fn=>fn.toString()).join('\n')+'\nconst input=JSON.parse(serialized);globalThis.result=projectReturnsReceiptWorkspace(input,'+deps.map(fn=>fn.name).join(',')+');';
 const output=await build({stdin:{contents:source},write:false,format:'iife',platform:'browser',target:'es2022',minify}),context=vm.createContext({serialized:JSON.stringify(value),TextEncoder,URL});vm.runInContext(output.outputFiles[0].text,context);assert.deepEqual(clone(context.result),value);
});
