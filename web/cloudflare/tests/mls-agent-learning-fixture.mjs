import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {projectBusinessMonth} from '../src/business-month.mjs';
import {BUSINESS_MONTH_PUBLICATION_SCHEMA} from '../src/business-month-publication.mjs';
import {BUSINESS_SYNC_SCHEMA} from '../src/business-sync.mjs';

export const learningClock=Date.UTC(2026,10,2,12),learningNow=()=>learningClock;
export function learningFrame({end_date='2026-10-15',at=Math.floor(learningClock/1000),...changes}={}){
 const month=end_date.slice(0,7),windows=Math.ceil(Number(end_date.slice(8))/15);
 const value={schema:'business_month_v1',month,start_date:month+'-01',end_date,status:'COMPLETE',checked_at:at,progress:{windows_total:windows,windows_complete:windows,pages_read:windows},coverage:{orders:0,paid:0,completed:0,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:0,payment_missing:0,returns:0,returns_unknown:0},sales_cents:0,known_sales_cents:0,expected_repass_cents:0,known_expected_repass_cents:0,production_cost_cents:0,known_production_cost_cents:0,invoice_tax_cents:0,known_invoice_tax_cents:0,ads_adjustment_cents:0,ads:null,expenses:{revision:1,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED',updated_at:new Date(at*1000).toISOString()},result:{net_estimate_cents:null,net_profit_cents:null,net_margin_bps:null,pending:['ADS_UNAVAILABLE'],basis:'PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE'},unmapped_variants:[],bindings_revision:1,costs_revision:1,cost_rules_revision:1,classification_revision:1,source_checked_at:{finance_oldest_at:at-2,finance_latest_at:at-1,ads_at:null},...changes};
 assert.ok(projectBusinessMonth(value));return value;
}
export async function learningEnv(t){const ADMIN_DB=new D1();t?.after(()=>ADMIN_DB.db.close());await ADMIN_DB.batch([...BUSINESS_MONTH_PUBLICATION_SCHEMA,...BUSINESS_SYNC_SCHEMA].map(sql=>ADMIN_DB.prepare(sql)));return {ADMIN_DB};}
export function learningPublication(env,frame,revision=1){
 const db=env.ADMIN_DB.db,token='11111111-1111-4111-8111-111111111111',payload={start_date:frame.start_date,end_date:frame.end_date,slots:[]},source={cutoff_at:frame.source_checked_at?.finance_oldest_at??frame.checked_at-2,checked_at:frame.source_checked_at?.finance_latest_at??frame.checked_at-1,source_checked_at:{oldest_at:frame.source_checked_at?.finance_oldest_at??frame.checked_at-2,latest_at:frame.source_checked_at?.finance_latest_at??frame.checked_at-1}};
 db.prepare('INSERT OR REPLACE INTO business_month_publications VALUES(?,?,?,?,?,?,?)').run(frame.month,revision,frame.checked_at,frame.checked_at,frame.checked_at,token,JSON.stringify(payload));
 db.prepare('INSERT OR REPLACE INTO business_month_publication_frames VALUES(?,?,?,?,?,?)').run(frame.month,0,token,token,revision,JSON.stringify(source));
}
