import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {saveCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {projectEscrowReleaseCoverageFrame} from '../../finance/src/escrow-release-frame.mjs';

export const trackerMonth='2026-10',trackerThrough='2026-11',trackerTime=Date.UTC(2026,10,10,15),trackerStamp=trackerTime/1000;
export const trackerUuid=index=>'33333333-3333-4333-8333-'+String(index).padStart(12,'0');
export class TrackerD1 extends D1{
 constructor(){super();this.writes=[];this.rpc=0;this.executors=new WeakMap();this.beforeStatement=null;}
 prepare(sql){
  if(!/^\s*SELECT\b/i.test(sql))this.writes.push(sql);
  const statement=super.prepare(sql),original=statement.run.bind(statement);
  const execute=async()=>{this.beforeStatement?.(sql);return original();};this.executors.set(statement,execute);
  statement.run=()=>{this.rpc++;return execute();};
  for(const name of ['first','all']){const fn=statement[name].bind(statement);statement[name]=(...args)=>{this.rpc++;return fn(...args);};}
  return statement;
 }
 async batch(statements){this.rpc++;return super.batch(statements.map(statement=>({run:this.executors.get(statement)})));}
}
export function trackerSourceFrame(index,{offset=0,checked=trackerStamp-900}={}){
 const start_date=trackerMonth+'-'+String(index*15+1).padStart(2,'0'),end_date=trackerMonth+'-'+String(Math.min(31,index*15+15)).padStart(2,'0');
 const frame={schema:'finance_business_period_v1',run_id:trackerUuid(offset+index+1),revision:2,status:'COMPLETE',start_date,end_date,cutoff_at:checked-100,checked_at:checked,source_checked_at:{oldest_at:checked-50,latest_at:checked-50},currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:1,duplicate_orders:0,coverage:{orders:1,paid:1,completed:1,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:1,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'100',sales_base_raw:'100',known_expected_repass_raw:'80',expected_repass_raw:'80',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:1,unavailable_orders:0,known_base_raw:'100',known_tax_raw:'2'},items:[{item_id:String(index+1),model_id:'0',quantity:1}],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};
 assert.ok(projectBusinessPeriodFrame(frame));return frame;
}
export async function publishTrackerMonth(env,now,{revision=7,offset=0}={}){
 const checked=Math.floor(now()/1000)-900,frames=[0,1,2].map(index=>trackerSourceFrame(index,{offset,checked})),payload={start_date:trackerMonth+'-01',end_date:trackerMonth+'-31',slots:frames.map(frame=>({start_date:frame.start_date,end_date:frame.end_date,frame}))},row={revision,payload:JSON.stringify(payload),created_at:checked-300,updated_at:checked};
 env.ADMIN_DB.db.prepare('INSERT OR REPLACE INTO business_month_runs(month,revision,payload,created_at,updated_at) VALUES(?,?,?,?,?)').run(trackerMonth,row.revision,row.payload,row.created_at,row.updated_at);
 assert.ok(await saveCompletedBusinessMonth(env,trackerMonth,{row,payload,complete:true},{now}));return frames;
}
export function trackerCoverage(frames,{checked=trackerStamp,through=trackerThrough,identity=false}={}){
 const months=[];for(let value=trackerMonth;;){months.push(value);if(value===through)break;const date=new Date(value+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);value=date.toISOString().slice(0,7);assert.ok(months.length<6);}
 const located=identity?3:2,calendars=months.map((month,index)=>{const complete=index===0||identity;return {month,status:complete?'COMPLETE':'MISSING',scan_id:complete?trackerUuid(80+index):null,cutoff_at:complete?checked-100:null,source_oldest_at:complete?checked-800:null,source_latest_at:complete?checked-790:null,observations:complete?(index===0?2:index===1?1:0):0,cohort_observations:complete?(index===0?2:index===1?1:0):0,unique_cohort_orders:complete?(index===0?2:index===1?1:0):0,ambiguous_cohort_orders:0};});
 const value={schema:'finance_escrow_release_coverage_v1',cohort_month:trackerMonth,through_month:through,checked_at:checked,status:identity?'IDENTITY_COMPLETE':'COLLECTING',sources:frames.map(frame=>({run_id:frame.run_id,source_revision:frame.revision,start_date:frame.start_date,end_date:frame.end_date,status:'AVAILABLE',orders:1,paid_orders:1,finance_oldest_at:frame.source_checked_at.oldest_at,finance_latest_at:frame.source_checked_at.latest_at,expected_repass_cents:8000})),calendars,coverage:{paid_orders:3,located_orders:located,not_located_orders:3-located,ambiguous_orders:0,single_orders:located,calendars_total:calendars.length,calendars_complete:calendars.filter(row=>row.status==='COMPLETE').length,identity_complete_at_cutoff:identity},pending:[...(identity?[]:['CALENDAR_MISSING','ORDER_NOT_LOCATED']),'BANK_RECEIPT_NOT_VERIFIED','RELEASE_CYCLE_SEMANTICS_UNVERIFIED'],basis:'SAVED_RELEASE_CALENDARS_AGAINST_PAID_ORDER_COHORT_NOT_BANK_RECEIPT'};
 assert.ok(projectEscrowReleaseCoverageFrame(value));return value;
}
export function forceTrackerHistory(db,{next='COVERAGE'}={}){
 db.db.prepare("UPDATE business_sync_state SET enabled=1,status='IDLE',month=?,summary=NULL,next_run_at=?,lease_token=NULL,lease_expires_at=NULL WHERE id=1").run(trackerThrough,trackerStamp+3600);
 db.db.exec("UPDATE background_collection_lane_state SET next_lane='AUXILIARY',auxiliary_index=0,lease_token=NULL,lease_until=NULL;UPDATE background_history_fairness_state SET next_history_work='AUDIT',returns_retry_at=0,reserved_returns_streak=0");
 setTrackerAuditTurn(db,{next});
}
export function setTrackerAuditTurn(db,{next='RELEASES'}={}){
 db.db.prepare("INSERT INTO financial_audit_turns(month,revision,next_work,lease_token,lease_until) VALUES(?,1,?,NULL,NULL) ON CONFLICT(month) DO UPDATE SET next_work=excluded.next_work,lease_token=NULL,lease_until=NULL").run(trackerThrough,next==='COVERAGE'?'RELEASES':next);
 db.db.prepare('INSERT INTO financial_audit_coverage_turns(month,pending) VALUES(?,?) ON CONFLICT(month) DO UPDATE SET pending=excluded.pending').run(trackerThrough,Number(next==='COVERAGE'));
}
