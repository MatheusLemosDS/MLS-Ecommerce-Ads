import test from 'node:test';
import assert from 'node:assert/strict';
import {createExternalCashProtocol,projectExternalCashRequest,projectExternalCashResponse,externalCashResponseMatches,isExternalCashCompletedStatus,projectExternalCashError,externalCashErrorStatus} from '../src/external-cash-frame.mjs';
import {cashRequestId,cashRecordId,cashTransferId,cashImportId,cashRead,cashPreview,cashImport,cashWorkspace,cashPreviewFrame,cashImportFrame} from './external-cash-fixture.mjs';

test('file contract projects closed operation variants and fills read/preview pagination defaults',()=>{
 const read={schema:'external_cash_request_v1',operation:'read',month:'2026-11'};assert.deepEqual(projectExternalCashRequest(read),cashRead());
 for(const input of [cashRead(),cashPreview(),cashImport(),{schema:'external_cash_request_v1',operation:'match',request_id:cashRequestId,expected_revision:1,confirmed:true,pairs:[{bank_record_id:cashRecordId,transfer_record_id:cashTransferId}],reason:'Owner checked file evidence'},{schema:'external_cash_request_v1',operation:'unlink',request_id:cashRequestId,expected_revision:1,confirmed:true,match_id:cashRecordId,reason:'Correct mistaken link'}])assert.deepEqual(projectExternalCashRequest(input),input);
 const zero=cashPreview();zero.rows[0].amount_cents=0;assert.equal(projectExternalCashRequest(zero).rows[0].amount_cents,0);
 const negative=cashPreview();negative.rows[0].amount_cents=-120;assert.equal(projectExternalCashRequest(negative).rows[0].amount_cents,-120);
});

test('caller tenant, actor, raw file, new versions and unconfirmed actions never enter the contract',()=>{
 for(const input of [{...cashRead(),shop_id:1178167501},{...cashPreview(),actor:'OWNER'},{...cashPreview(),raw_file:'synthetic'},{...cashImport(),confirmed:false},{...cashImport(),expected_revision:Number.MAX_SAFE_INTEGER},{...cashPreview(),bank_account_declared:false},{...cashPreview(),completed_transfers_declared:true},{...cashRead(),schema:'external_cash_request_v2'},{...cashRead(),limit:null},{...cashRead(),cursor:undefined}])assert.equal(projectExternalCashRequest(input),null);
 const shopee=cashPreview();shopee.source='SHOPEE';shopee.selection.format='shopee_csv';shopee.completed_transfers_declared=true;shopee.rows[0].reported_status='Concluído';assert.ok(projectExternalCashRequest(shopee));
 shopee.completed_transfers_declared=false;assert.equal(projectExternalCashRequest(shopee),null);
});

test('normalization rejects unsafe money, dates, getters, sparse rows and unbounded text',()=>{
 const values=[];for(const update of [{amount_cents:-0},{amount_cents:1.5},{amount_cents:Number.MAX_SAFE_INTEGER+1},{date:'2026-02-30'},{external_id:'x'.repeat(129)},{description:'newline\ntext'},{reported_status:'Conclui\u0301do'},{currency:'BRL'}]){const input=cashPreview();Object.assign(input.rows[0],update);values.push(input);}
 const sparse=cashPreview();sparse.rows.length=2;values.push(sparse);
 const tooMany=cashPreview();tooMany.rows=Array.from({length:1001},(_,line)=>({...tooMany.rows[0],line:line+1}));values.push(tooMany);
 const duplicated=cashPreview();duplicated.rows.push({...duplicated.rows[0]});values.push(duplicated);
 let getters=0;values.push(Object.defineProperty({},'schema',{get(){getters++;throw Error('private');}}));
 for(const input of values)assert.equal(projectExternalCashRequest(input),null);assert.equal(getters,0);
});

test('manual pair request rejects repeated sides and requires an audit reason',()=>{
 const base={schema:'external_cash_request_v1',operation:'match',request_id:cashRequestId,expected_revision:1,confirmed:true,pairs:[{bank_record_id:cashRecordId,transfer_record_id:cashTransferId}],reason:'Owner checked both documents'};
 for(const input of [{...base,reason:''},{...base,reason:'  '},{...base,pairs:[...base.pairs,...base.pairs]},{...base,pairs:[{bank_record_id:cashRecordId,transfer_record_id:cashRecordId}]},{...base,pairs:Array(51).fill(base.pairs[0])}])assert.equal(projectExternalCashRequest(input),null);
});

test('responses reject legacy DTOs, extra fields and responses outside their request scope',()=>{
 for(const frame of [cashWorkspace(),cashPreviewFrame(),cashImportFrame()])assert.deepEqual(projectExternalCashResponse(frame),frame);
 assert.equal(externalCashResponseMatches(cashRead(),cashWorkspace()),true);assert.equal(externalCashResponseMatches(cashPreview(),cashPreviewFrame()),true);assert.equal(externalCashResponseMatches(cashImport(),cashImportFrame()),true);
 for(const frame of [{...cashWorkspace(),bank_settlement:'VERIFIED'},{...cashPreviewFrame(),counts:{total:1,new:0,duplicates:0,review:0}},{...cashImportFrame(),request_id:'invalid'},{schema:'finance_reconciliation_v1',revision:0}])assert.equal(projectExternalCashResponse(frame),null);
 const outside=cashWorkspace();outside.records=[{record_id:cashRecordId,source:'NUBANK',date:'2026-10-31',amount_cents:0,currency:'BRL',external_id:null,reference:null,description:null,import_id:cashImportId,review:false}];outside.summary.record_count=1;assert.ok(projectExternalCashResponse(outside));assert.equal(externalCashResponseMatches(cashRead(),outside),false);
 const crossMonth=cashWorkspace();crossMonth.summary.record_count=1;crossMonth.summary.match_count=1;assert.ok(projectExternalCashResponse(crossMonth));
 const unrelated=cashWorkspace();unrelated.suggestions=[{bank_record_id:cashRecordId,transfer_record_id:cashTransferId,confidence:'AMOUNT_DATE'}];assert.ok(projectExternalCashResponse(unrelated));assert.equal(externalCashResponseMatches(cashRead(),unrelated),false);
 assert.equal(externalCashResponseMatches(cashImport(),{...cashImportFrame(),revision:2}),false);
 assert.equal(externalCashResponseMatches(cashImport(),{...cashImportFrame(),revision:2,replayed:true}),true);
});

test('finite errors and shared completed status helper expose no provider vocabulary',()=>{
 assert.deepEqual(projectExternalCashError({schema:'external_cash_error_v1',error:'FINANCE_EXTERNAL_CASH_REVISION_CONFLICT'}),{schema:'external_cash_error_v1',error:'FINANCE_EXTERNAL_CASH_REVISION_CONFLICT'});assert.equal(externalCashErrorStatus('FINANCE_EXTERNAL_CASH_REVISION_CONFLICT'),409);
 for(const value of [{schema:'external_cash_error_v1',error:'PRIVATE_TOKEN'},{schema:'external_cash_error_v1',error:'FINANCE_EXTERNAL_CASH_UNAVAILABLE',body:'PRIVATE'}])assert.equal(projectExternalCashError(value),null);
 for(const suffix of ['constructor','toString','__proto__']){assert.equal(externalCashErrorStatus('FINANCE_EXTERNAL_CASH_'+suffix),null);assert.equal(projectExternalCashError({schema:'external_cash_error_v1',error:'FINANCE_EXTERNAL_CASH_'+suffix}),null);}
 for(const value of [null,'COMPLETED','Concluído','Transferência concluída',' successful '])assert.equal(isExternalCashCompletedStatus(value),true);
 for(const value of ['PENDING','FAILED','PAID','unknown',false])assert.equal(isExternalCashCompletedStatus(value),false);
 const browserProtocol=Function('return ('+createExternalCashProtocol.toString()+')()')();assert.deepEqual(browserProtocol.projectExternalCashRequest(cashRead()),cashRead());assert.equal(browserProtocol.isExternalCashCompletedStatus('Concluído'),true);
});
