import assert from 'node:assert/strict';
import {returnsInsightsFixture} from './m2-returns-insights-fixture.mjs';
import {projectPhysicalReturns} from '../src/physical-returns.mjs';
import {projectPhysicalReturnsWorkspace} from '../src/physical-returns-view.mjs';
import {projectBusinessOriginalItems,projectPhysicalReturnsOriginalItemsWorkspace} from '../src/business-original-items.mjs';
import {projectBusinessReconciliation} from '../src/business-reconciliation.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';
import {projectOriginalItemsFrame} from '../../finance/src/original-items-frame.mjs';

// Explicit synthetic source evidence. No owner mutation prepares this fixture.
export function returnsOriginalItemsUIFixture({month='2026-10',legacy=false,missingCase=false,missingAll=false}={}){
 const f=returnsInsightsFixture(),contextReport=f.envelope.report,report=contextReport.reports[0],at=contextReport.checked_at;
 const identity={artwork:null,color:null,size:null,garment_type:'UNKNOWN',fit:'UNKNOWN',confirmed:false,item_id:null,model_id:null,sku:null};
 const physical={schema:'physical_returns_v1',checked_at:at,revision:2,cases:[{case_hash:report.cases[0].case_hash,order_hash:report.cases[0].order_hash,source:{month:f.month,publication_revision:contextReport.source_revision,status:report.cases[0].status,checked_at:report.cases[0].checked_at},registered_at:at-90,updated_at:at-10,lines:[{line_id:'22222222-2222-4222-8222-222222222222',receipt_ref:'Pacote sintético 1',quantity:1,status:'QUARANTINE',identity,partition:{resellable:0,repair:0,damaged:0,mismatch:0,quarantine:1},received_at:at-50,updated_at:at-10,reason:null,valuation_state:'UNKNOWN',carrying_value_cents:null}]}],summary:{cases:1,lines:1,received_quantity:1,active_quantity:1,voided_quantity:0,resellable_quantity:0,repair_quantity:0,damaged_quantity:0,mismatch_quantity:0,quarantine_quantity:1,physically_available_quantity:0},valuation:{state:'UNKNOWN',amount_cents:null},external_stock_write_allowed:false,basis:'OPERATOR_CONFIRMED_PHYSICAL_RETURNS_NOT_PROVIDER_RESTOCK_OR_FINANCIAL_PROFIT'};
 assert.ok(projectPhysicalReturns(physical));
 const cases=month===f.month?report.cases.map(row=>({case_hash:row.case_hash,order_hash:row.order_hash,status:row.status,checked_at:row.checked_at,publication_revision:contextReport.source_revision})):[];
 const workspace={schema:'physical_returns_workspace_v1',month,checked_at:at,source:{status:'AVAILABLE',checked_at:contextReport.checked_at,cases_total:cases.length,cases_included:cases.length,truncated:false,reason:null,cases},physical};assert.ok(projectPhysicalReturnsWorkspace(workspace));
 if(legacy||month!==f.month)return workspace;
 const orders=[...new Set(report.cases.map(row=>row.order_hash))].sort().map((order_hash,index)=>({order_hash,source_checked_at:report.source_checked_at.finance_latest_at,state:missingAll||index===2?'NOT_CAPTURED':'AVAILABLE',items:missingAll||index===2?[]:[{item_id:String(1000+index),model_id:String(index),quantity:index+2}]}));
 const returned=report.cases.map((row,index)=>({case_hash:row.case_hash,order_hash:row.order_hash,source_checked_at:row.checked_at,state:missingAll||missingCase||index===2?'NOT_CAPTURED':'AVAILABLE',items:missingAll||missingCase||index===2?[]:[{item_id:String(1000+index),model_id:String(index),quantity:index+1}]}));
 const original={schema:'finance_original_items_v1',run_id:report.run_id,source_revision:report.source_revision,start_date:report.start_date,end_date:report.end_date,checked_at:report.checked_at,orders,cases:returned,truncation:{orders_total:3,orders_included:3,cases_total:3,cases_included:3,truncated:false},basis:'SAVED_PROVIDER_SELLING_UNIT_COUNTS_NOT_PHYSICAL_PIECES'};
 assert.ok(projectOriginalItemsFrame(original,report));
 const original_items={schema:'business_original_items_v1',report:contextReport,original_items:[original],pending:['ORIGINAL_ITEMS_NOT_CAPTURED']};assert.ok(projectBusinessOriginalItems(original_items,projectBusinessReconciliation,projectReconciliationFrame,projectOriginalItemsFrame));
 const envelope={schema:'physical_returns_workspace_v2',report:workspace,original_items};assert.ok(projectPhysicalReturnsOriginalItemsWorkspace(envelope,projectPhysicalReturnsWorkspace,projectBusinessOriginalItems,projectBusinessReconciliation,projectReconciliationFrame,projectOriginalItemsFrame));return envelope;
}
