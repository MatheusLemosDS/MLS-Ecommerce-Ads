import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {saveCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {projectReconciliationFrame} from '../../finance/src/reconciliation-frame.mjs';

export const month='2026-10',base=Date.UTC(2026,9,25,15),stamp=base/1000;
export const uuid=index=>'11111111-1111-4111-8111-'+String(index).padStart(12,'0');
export class MeteredHistoryD1 extends D1{
 constructor(){super();this.rpc=0;this.executors=new WeakMap();}
 prepare(sql){const statement=super.prepare(sql);this.executors.set(statement,statement.run.bind(statement));for(const name of ['run','first','all']){const call=statement[name].bind(statement);statement[name]=(...args)=>{this.rpc++;return call(...args);};}return statement;}
 async batch(rows){this.rpc++;return super.batch(rows.map(row=>({run:this.executors.get(row)})));}
}
export function historySourceFrame(index,offset=0){
 const start_date=month+'-'+String(index*15+1).padStart(2,'0'),end_date=month+'-'+String(Math.min(25,index*15+15)).padStart(2,'0');
 const frame={schema:'finance_business_period_v1',run_id:uuid(index+offset+1),revision:2,status:'COMPLETE',start_date,end_date,cutoff_at:stamp-3,checked_at:stamp,source_checked_at:{oldest_at:stamp-1,latest_at:stamp-1},currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:1,paid:1,completed:1,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1,payment_missing:0,returns:1,returns_unknown:0},known_sales_base_raw:'100',sales_base_raw:'100',known_expected_repass_raw:'80',expected_repass_raw:'80',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:0,known_base_raw:'100',known_tax_raw:'2'},items:[{item_id:'100',model_id:'0',quantity:1}],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
 assert.ok(projectBusinessPeriodFrame(frame));return frame;
}
export function historyReturnsReport(source,checked=stamp){
 const report={schema:'finance_reconciliation_v1',run_id:source.run_id,source_revision:source.revision,start_date:source.start_date,end_date:source.end_date,checked_at:checked,status:'CHECKED',source_checked_at:{finance_oldest_at:source.source_checked_at.oldest_at,finance_latest_at:source.source_checked_at.latest_at,returns_oldest_at:checked,returns_latest_at:checked},coverage:{orders:1,evidence_orders:1,missing_evidence_orders:0,paid_orders:1,review_orders:0,return_orders:1,return_unknown_orders:0},adjustments:{reported_orders:1,missing_orders:0,conflicting_orders:0,known_adjustment_cents:100,base_repass_cents:8000,after_adjustment_repass_cents:8100},returns:{reference_count:1,checked_count:1,pending_count:0,known_requested_refund_cents:1000,requested_amount_complete:true,permission:'AVAILABLE'},cases:[{case_hash:'a'.repeat(64),order_hash:'b'.repeat(64),status:'ACCEPTED',requested_refund_cents:1000,checked_at:checked,diagnostic:null}],truncation:{truncated:false,cases_total:1,cases_included:1},pending:['RETURN_VALUES_UNVERIFIED','SETTLEMENT_NOT_RECONCILED'],basis:'SOURCE_EVIDENCE_AUDIT_NOT_SETTLEMENT_OR_REALIZED_PROFIT'};
 assert.ok(projectReconciliationFrame(report));return report;
}
export async function publishHistoryMonth(env,now,{revision=10,offset=0}={}){
 const frames=[historySourceFrame(0,offset),historySourceFrame(1,offset)],payload={start_date:month+'-01',end_date:month+'-25',slots:frames.map(frame=>({start_date:frame.start_date,end_date:frame.end_date,frame}))},row={revision,payload:JSON.stringify(payload),created_at:stamp-60,updated_at:stamp};
 env.ADMIN_DB.db.prepare('INSERT OR REPLACE INTO business_month_runs VALUES(?,?,?,?,?)').run(month,row.revision,row.payload,row.created_at,row.updated_at);
 assert.ok(await saveCompletedBusinessMonth(env,month,{row,payload,complete:true},{now}));return frames;
}
export function fairnessSnapshot(db){return {...db.db.prepare('SELECT * FROM background_history_fairness_state').get()};}
