import test from 'node:test';
import assert from 'node:assert/strict';
import {createFinancialAutomationServices} from '../src/financial-automation-sources.mjs';
import {financialAutomationScope} from '../src/financial-automation-service.mjs';
import {readFinancialSourceOriginalItems} from '../../finance/src/financial-source-worker.mjs';

const at=Date.parse('2026-11-13T18:00:00Z'),now=()=>at,stamp=at/1000;
const scope=financialAutomationScope({}, {role:'owner'}),month='2026-10';
const ids=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
function snapshot(run_id,count,revision=1){return {schema:'financial_order_evidence_snapshot_v1',run:{run_id,revision,status:'COMPLETE',start_date:'2026-10-01',end_date:'2026-10-31',cutoff_at:stamp-60,checked_at:stamp},missing_orders:0,invalid_orders:0,orders:[{order_hash:'a'.repeat(64),source_hash:'b'.repeat(64),bucket:'completed',checked_at:stamp,items:Array.from({length:count},(_,i)=>({item_id:String(1000+i),model_id:'0',quantity:2}))}]};}
function fixture(counts=[101]){
 let revision=1;const seen=[];
 const adapter=createFinancialAutomationServices({}, {readFinancialSavedMonth:async()=>({audit_scope:{sources:counts.map((_,index)=>({run_id:ids[index],source_revision:revision}))}}),readFinancialPrivate:async command=>{seen.push(command);return {status:200,body:await readFinancialSourceOriginalItems({},command,{now,readEvidence:async()=>snapshot(command.run_id,counts[ids.indexOf(command.run_id)],revision)})};}});
 return {adapter,seen,change:()=>revision++,read:cursor=>adapter.listFinancialOriginalItemsPage({scope,month,cursor,now})};
}
test('explicit original-item pages expose the101st sold variant with exactly one private read per page',async()=>{
 const f=fixture(),first=await f.read(null);assert.equal(first.schema,'financial_original_items_page_v1');assert.equal(first.items.length,100);assert.equal(first.has_more,true);assert.equal(f.seen.length,1);assert.ok(first.next_cursor.length<=2048);
 const second=await f.read(first.next_cursor);assert.equal(f.seen.length,2);assert.equal(second.items.length,1);assert.equal(second.items[0].item_id,'1100');assert.equal(second.items[0].quantity,2);assert.equal(second.has_more,false);assert.equal(second.next_cursor,null);
 assert.equal(new Set([...first.items,...second.items].map(row=>[row.order_hash,row.item_id,row.model_id].join(':'))).size,101);assert.deepEqual(f.seen[1].cursor,{order_hash:'a'.repeat(64),item_id:'1099',model_id:'0'});assert.equal(f.seen[1].expected_revision,1);
 const legacy=await f.adapter.listFinancialOriginalItems({scope,month,now});assert.equal(legacy.length,100,'legacy bounded array contract remains unchanged');
});
test('cross-run pagination never performs a hidden second read in one action',async()=>{
 const f=fixture([1,101]),first=await f.read(null);assert.equal(f.seen.length,1);assert.equal(first.items.length,1);assert.equal(first.has_more,true);
 const second=await f.read(first.next_cursor);assert.equal(f.seen.length,2);assert.equal(f.seen[1].run_id,ids[1]);assert.equal(f.seen[1].cursor,null);assert.equal(second.items.length,100);
 const third=await f.read(second.next_cursor);assert.equal(f.seen.length,3);assert.equal(third.items.length,1);assert.equal(third.has_more,false);
});
test('page cursors reject scope/month/revision changes before reading private facts',async()=>{
 const f=fixture(),first=await f.read(null),calls=f.seen.length;
 for(const patch of [{scope:{...scope,store_id:'other-store'}},{month:'2026-09'}])await assert.rejects(f.adapter.listFinancialOriginalItemsPage({scope,month,cursor:first.next_cursor,now,...patch}),error=>error.code==='FINANCIAL_AUTOMATION_ORIGINAL_ITEM_CURSOR_STALE'&&error.status===409);
 f.change();await assert.rejects(f.read(first.next_cursor),error=>error.code==='FINANCIAL_AUTOMATION_ORIGINAL_ITEM_CURSOR_STALE'&&error.status===409);assert.equal(f.seen.length,calls);
});
test('malformed/foreign cursor fields cannot choose an arbitrary Finance run or add a source query',async()=>{
 const f=fixture(),first=await f.read(null),decoded=JSON.parse(atob(first.next_cursor.replaceAll('-','+').replaceAll('_','/'))),encode=value=>btoa(JSON.stringify(value)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 for(const cursor of ['', 'x'.repeat(2049), '{}',encode({...decoded,run_id:ids[1]}),encode({...decoded,run_index:3}),encode({...decoded,source_cursor:{order_hash:'x',item_id:'123',model_id:'0'}})])await assert.rejects(f.read(cursor),error=>error.code==='FINANCIAL_AUTOMATION_ORIGINAL_ITEM_CURSOR_INVALID'&&error.status===400);
 assert.equal(f.seen.length,1);
});
test('an absent saved publication yields an empty page without inventing choices or reading a provider',async()=>{
 let reads=0;const adapter=createFinancialAutomationServices({}, {readFinancialSavedMonth:async()=>({audit_scope:null}),readFinancialPrivate:async()=>{reads++;throw Error('must not read');}}),page=await adapter.listFinancialOriginalItemsPage({scope,month,now});assert.equal(page.has_more,false);assert.deepEqual(page.items,[]);assert.equal(reads,0);
});
