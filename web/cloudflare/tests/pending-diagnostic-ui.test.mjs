import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {INCOME_OVERVIEW_CLIENT} from '../src/income-overview-client.mjs';
import {AGENT_REGISTRY_CLIENT,commandCenterBody} from '../src/agent-registry-view.mjs';

const stamp=Date.UTC(2026,9,27,18)/1000,hash='a'.repeat(64);
const overview={schema:'business_income_overview_v1',checked_at:stamp,status:'AVAILABLE',report:{schema:'finance_income_overview_v1',checked_at:stamp,region:'BRAZIL',shop_type:'LOCAL',currency_basis:'FIXED_BRAZIL_SHOP_PROFILE',pending:{status:'PENDING',raw:'100.00',cents:10000},released:{status:'RELEASED',raw:'200.00',cents:20000},to_release:{status:'TO_RELEASE_NOT_APPLICABLE_LOCAL',raw:null,cents:null},basis:'CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH'},attempt:{checked_at:stamp,status:'SUCCESS',code:null,next_attempt_at:stamp+900}};
const detail={schema:'business_income_detail_v1',checked_at:stamp,status:'AVAILABLE',report:{schema:'finance_income_detail_v1',checked_at:stamp,region:'BRAZIL',shop_type:'LOCAL',income_status:'PENDING',page_size:100,returned_count:1,has_more:false,next_cursor_present:false,rows:[{entry_hash:'b'.repeat(64),order_hash:hash,currency:'BRL',status:'Pendente',description:'Order Income',payment_method:'PIX',estimated_escrow_raw:'47.51',estimated_escrow_cents:4751,estimated_payout_time:stamp+3600,creation_time:stamp-3600}],basis:'CURRENT_PENDING_PROVIDER_INCOME_DETAIL_NOT_MONTH_OR_BANK_RECEIPT'},attempt:{checked_at:stamp,status:'SUCCESS',code:null,next_attempt_at:stamp+900}};

function browser(){
 const context=vm.createContext({TextEncoder,Intl,Date,Promise,JSON,Math,Number,BigInt,globalThis:null});
 context.globalThis=context;context.document={hidden:false};context.calls=[];
 context.api=async path=>{context.calls.push(path);return structuredClone(path==='finance/income-detail'?detail:overview);};
 vm.runInContext(INCOME_OVERVIEW_CLIENT,context);
 return context;
}

test('Pending diagnostic contains only hashed order evidence and explicit non-settlement semantics',async()=>{
 const b=browser();assert.equal(b.brazaIncomeOverview.start({api:b.api}),true);assert.equal(await b.brazaIncomeOverview.observe(),true);assert.equal(await b.brazaIncomeOverview.observeDetail(),true);
 const value=b.brazaIncomeOverview.getDiagnostic();assert.equal(value.schema,'mls_pending_diagnostic_v1');assert.deepEqual(JSON.parse(JSON.stringify(value.semantics)),{scope:'CURRENT_SHOPEE_PENDING_NOT_MONTHLY_COMPETENCE',bank_receipt:false,realized_profit:false,remaining_receivable:false});
 assert.equal(value.overview.pending_cents,10000);assert.equal(value.detail.returned_count,1);assert.equal(value.detail.known_amount_rows,1);assert.equal(value.detail.known_estimated_escrow_cents,4751);assert.equal(value.detail.rows[0].order_hash,hash);
 const raw=JSON.stringify(value);assert.doesNotMatch(raw,/order_sn|access_token|refresh_token|PRIVATE_/i);assert.equal(b.calls.filter(x=>x==='finance/income-detail').length,1);
});

test('diagnostic preserves partial coverage and unknown cents instead of inventing a total',async()=>{
 const b=browser(),partial=structuredClone(detail);partial.report.has_more=true;partial.report.next_cursor_present=true;partial.report.rows[0].estimated_escrow_raw='10.123';partial.report.rows[0].estimated_escrow_cents=null;b.api=async path=>path==='finance/income-detail'?partial:overview;b.brazaIncomeOverview.stop();b.brazaIncomeOverview.start({api:b.api});await b.brazaIncomeOverview.observe();await b.brazaIncomeOverview.observeDetail();
 const value=b.brazaIncomeOverview.getDiagnostic();assert.equal(value.detail.has_more,true);assert.equal(value.detail.known_amount_rows,0);assert.equal(value.detail.known_estimated_escrow_cents,0);assert.equal(value.detail.rows[0].estimated_escrow_cents,null);assert.equal(value.semantics.remaining_receivable,false);
});

test('copy UI is local-only and never introduces provider fetch or polling',()=>{
 const html=commandCenterBody();assert.match(html,/Copiar diagnóstico Pending/);assert.match(html,/Não consulta a Shopee ao abrir/);assert.doesNotMatch(AGENT_REGISTRY_CLIENT,/\bfetch\s*\(|setInterval\s*\(/);assert.match(AGENT_REGISTRY_CLIENT,/getDiagnostic/);assert.match(AGENT_REGISTRY_CLIENT,/navigator\.clipboard\.writeText/);
});
