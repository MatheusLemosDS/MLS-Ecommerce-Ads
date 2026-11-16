import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerDtfBatchesFixture} from './owner-dtf-batches-fixture.mjs';
import {readProductionDtf,readProductionDtfBatches,readProductionDtfBatch,actProductionDtfBatch} from '../src/production-dtf-store.mjs';

test('all 125 reserved batches, including31st and beyond100, are reachable without provider reads or duplicate reservations',async t=>{
 const f=await ownerDtfBatchesFixture();t.after(f.close);const calls=f.calls.length,initial=await readProductionDtf(f.env);assert.equal(initial.batches.length,100);assert.equal(initial.batches_limited,true);const seen=[];let cursor=null,pages=0;
 do{const page=await readProductionDtfBatches(f.env,{status:'OPEN',cursor});assert.equal(page.totals.all,125);assert.equal(page.totals.open,125);assert.equal(page.pagination.matched_total,125);assert.ok(page.items.length<=20);seen.push(...page.items.map(b=>b.id));cursor=page.pagination.next_cursor;pages++;}while(cursor);
 assert.equal(pages,7);assert.equal(new Set(seen).size,125);assert.deepEqual(new Set(seen),new Set(f.ids));assert.equal(f.calls.length,calls);assert.equal(f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM production_dtf_reservations').get().n,125);
 const oldest=await readProductionDtfBatch(f.env,f.ids[0]);assert.equal(oldest.batch.layout.print_count,1);assert.equal(oldest.batch.status,'PREPARED');const result=await actProductionDtfBatch(f.env,{id:f.ids[0],action:'export'},f.source,'synthetic-owner',{now:f.now});assert.equal(result.batch.status,'EXPORTED');assert.equal(f.env.ADMIN_DB.db.prepare('SELECT COUNT(*) n FROM production_dtf_reservations').get().n,125);
 const exported=await readProductionDtfBatches(f.env,{status:'EXPORTED',search:f.ids[0]});assert.equal(exported.items.length,1);assert.equal(exported.totals.by_status.EXPORTED,1);assert.equal(exported.totals.by_status.PREPARED,124);
});
test('changing a batch invalidates a cursor instead of silently skipping work; filter and namespace cannot be swapped',async t=>{
 const f=await ownerDtfBatchesFixture(31);t.after(f.close);const page=await readProductionDtfBatches(f.env),cursor=page.pagination.next_cursor;assert.ok(cursor);
 await assert.rejects(readProductionDtfBatches(f.env,{status:'ALL',cursor}),/DTF_BATCH_PAGE_INVALID/);await assert.rejects(readProductionDtfBatches({...f.env,COMMERCIAL_CONTEXT:{namespace:'another-scope'}},{cursor}),/DTF_BATCH_PAGE_INVALID/);
 await actProductionDtfBatch(f.env,{id:f.ids[0],action:'void'},f.source,'synthetic-owner',{now:f.now});await assert.rejects(readProductionDtfBatches(f.env,{cursor}),/DTF_BATCH_PAGE_CHANGED/);const fresh=await readProductionDtfBatches(f.env,{status:'VOID'});assert.equal(fresh.items[0].id,f.ids[0]);assert.equal(fresh.pagination.matched_total,1);assert.equal(fresh.totals.open,30);
});
test('invalid queries are bounded and an absent batch is not fabricated',async t=>{
 const f=await ownerDtfBatchesFixture(0);t.after(f.close);const empty=await readProductionDtfBatches(f.env);assert.equal(empty.pagination.has_more,false);assert.equal(empty.totals.all,0);for(const query of [{limit:999},{status:'EVERYTHING'},{search:'%'},{search:'abc'},{cursor:'a'.repeat(1201)},{cursor:'!!!!!'}])await assert.rejects(readProductionDtfBatches(f.env,query),/DTF_BATCH_PAGE_INVALID/);await assert.rejects(readProductionDtfBatch(f.env,'00000000-0000-4000-8000-999999999999'),/DTF_BATCH_NOT_FOUND/);
});
