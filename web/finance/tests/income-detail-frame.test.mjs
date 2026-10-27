import test from 'node:test';
import assert from 'node:assert/strict';
import {projectIncomeDetailFrame} from '../src/income-detail-frame.mjs';
const stamp=Date.UTC(2026,9,27,15)/1000;
const row=(overrides={})=>({entry_hash:'a'.repeat(64),order_hash:'b'.repeat(64),currency:'BRL',status:'Pendente',description:'Order Income',payment_method:'PIX',estimated_escrow_raw:'47.51',estimated_escrow_cents:4751,estimated_payout_time:stamp+3600,creation_time:stamp-3600,...overrides});
const frame=(overrides={})=>({schema:'finance_income_detail_v1',checked_at:stamp,region:'BRAZIL',shop_type:'LOCAL',income_status:'PENDING',page_size:100,returned_count:1,has_more:false,next_cursor_present:false,rows:[row()],basis:'CURRENT_PENDING_PROVIDER_INCOME_DETAIL_NOT_MONTH_OR_BANK_RECEIPT',...overrides});
test('Pending detail projector accepts exact current evidence and returns detached rows',()=>{const value=frame(),projected=projectIncomeDetailFrame(value);assert.deepEqual(projected,value);assert.notEqual(projected,value);assert.notEqual(projected.rows,value.rows);});
test('projector rejects duplicate entries, foreign currency, fabricated cents and private fields',()=>{for(const mutate of [v=>v.rows.push({...v.rows[0]}),v=>v.rows[0].currency='USD',v=>v.rows[0].estimated_escrow_cents=4750,v=>v.rows[0].order_sn='PRIVATE',v=>v.has_more=true,v=>v.returned_count=2]){const value=frame();mutate(value);assert.equal(projectIncomeDetailFrame(value),null);}});
test('sub-cent raw amount remains explicitly unconverted',()=>{const value=frame();value.rows[0].estimated_escrow_raw='10.123';value.rows[0].estimated_escrow_cents=null;assert.ok(projectIncomeDetailFrame(value));});
