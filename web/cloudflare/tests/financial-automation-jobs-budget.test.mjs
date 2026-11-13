import test from 'node:test';
import assert from 'node:assert/strict';
import {D1} from './sqlite-d1.mjs';
import {BUSINESS_MONTH_PUBLICATION_SCHEMA} from '../src/business-month-publication.mjs';
import {EXPENSE_LEDGER_SCHEMA} from '../src/expense-ledger.mjs';
import {projectBusinessPeriodFrame} from '../../finance/src/business-period-frame.mjs';
import {financialAutomationScope} from '../src/financial-automation-service.mjs';
import {createFinancialAutomationServices} from '../src/financial-automation-sources.mjs';
import {runFinancialAutomationJobs} from '../src/financial-automation-jobs.mjs';
class MeterD1 extends D1{
 constructor(){super();this.reset();this.inBatch=false;}
 reset(){this.calls=0;this.sql=0;this.ddl=0;}
 prepare(sql){const stmt=super.prepare(sql),meter=this;for(const name of ['run','all','first']){const original=stmt[name];stmt[name]=async function(...args){meter.sql++;if(/^\s*CREATE\b/i.test(sql))meter.ddl++;if(!meter.inBatch)meter.calls++;return original.apply(this,args);};}return stmt;}
 async batch(statements){this.calls++;this.inBatch=true;try{return await super.batch(statements);}finally{this.inBatch=false;}}
}
const fixed=Date.parse('2026-11-13T18:00:00Z'),stamp=fixed/1000,run_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function publishedFrame(){const count=100,value={schema:'finance_business_period_v1',run_id,revision:1,status:'COMPLETE',start_date:'2026-11-01',end_date:'2026-11-13',cutoff_at:stamp-2,checked_at:stamp,source_checked_at:{oldest_at:stamp-1,latest_at:stamp-1},currency:'BRL',monetary_unit:'UNCONFIRMED',pages_read:20,duplicate_orders:0,coverage:{orders:count,paid:count,completed:count,ongoing:0,cancelled:0,cancel_pending:0,unpaid:0,other:0,unknown:0,payment_covered:count,payment_missing:0,returns:0,returns_unknown:0},known_sales_base_raw:'10000',sales_base_raw:'10000',known_expected_repass_raw:'8000',expected_repass_raw:'8000',known_ads_adjustment_raw:'0',ads_adjustment_raw:'0',invoice_tax:{schema:'store_invoice_tax_v1',rate_bps:200,basis:'PAYMENT_GOODS_VALUE_PER_ORDER_ESTIMATE',rounding:'HALF_UP_PER_ORDER',covered_orders:count,unavailable_orders:0,known_base_raw:'10000',known_tax_raw:'200'},items:[{item_id:'100',model_id:'200',quantity:count}],diagnostic:null,basis:'CREATE_TIME_PAID_ORDER_ESTIMATE_NOT_SETTLED'};assert.ok(projectBusinessPeriodFrame(value));return value;}
async function fixture(t){const db=new MeterD1(),env={ADMIN_DB:db},scope=financialAutomationScope(env,{role:'owner'});t.after(()=>db.db.close());await db.batch([...BUSINESS_MONTH_PUBLICATION_SCHEMA,...EXPENSE_LEDGER_SCHEMA,'CREATE TABLE business_month_expenses(month TEXT PRIMARY KEY,revision INTEGER,external_expenses_cents INTEGER,recharge_treatment TEXT,updated_at TEXT)'].map(sql=>db.prepare(sql)));
 const frame=publishedFrame(),slot={start_date:frame.start_date,end_date:frame.end_date,frame:{schema:'business_month_publication_frame_ref_v1',run_id,revision:1}},token='11111111-1111-4111-8111-111111111111';db.db.prepare('INSERT INTO business_month_publications VALUES(?,?,?,?,?,?,?)').run('2026-11',1,stamp-10,stamp-1,stamp,token,JSON.stringify({start_date:frame.start_date,end_date:frame.end_date,slots:[slot]}));db.db.prepare('INSERT INTO business_month_publication_frames VALUES(?,?,?,?,?,?)').run('2026-11',0,token,run_id,1,JSON.stringify(frame));db.db.prepare('INSERT INTO business_month_expenses VALUES(?,?,?,?,?)').run('2026-11',1,0,'UNCONFIRMED',new Date(fixed).toISOString());
 const facts=Array.from({length:100},(_,i)=>({event_key:(i+1).toString(16).padStart(64,'0'),source_hash:'b'.repeat(64),bucket:'completed',create_time:Date.parse('2026-11-10T12:00Z')/1000,checked_at:stamp,currency:'BRL',escrow_amount_cents:10000,after_adjustment_cents:9000,total_adjustment_cents:-1000,return_count:0,diagnostic:null,payment_covered:true,components:null}));let privateCalls=0;
 const services=createFinancialAutomationServices(env,{readFinancialPrivate:async input=>{privateCalls++;return {status:200,body:{schema:'financial_source_evidence_v2',scope,run:{run_id,revision:1,checked_at:stamp},facts,coverage:{complete:false,base_complete:true,window_complete:true},capabilities:{sources:[]},cursor:input.cursor,next_cursor:null,has_more:false}};}});
 return {env,db,scope,services,privateCalls:()=>privateCalls};
}
test('cron phases stay below50D1calls and100SQL with100actual normalized source facts and no policy',async t=>{
 const f=await fixture(t),counts=[];
 for(let run=0;run<72;run++){const now=()=>fixed+run*600000;f.db.reset();const result=await runFinancialAutomationJobs(f.env,{scope:f.scope,services:f.services,assertAuthorized:async()=>true,now});const sample={run,status:result.results[0]?.status,phase:result.results[0]?.phase??null,calls:f.db.calls,sql:f.db.sql,ddl:f.db.ddl};counts.push(sample);assert.ok(f.db.calls<50,JSON.stringify(sample));assert.ok(f.db.sql<=100,JSON.stringify(sample));assert.notEqual(sample.status,'RETRY_WAIT',JSON.stringify(result));}
 assert.ok(f.privateCalls()>0);assert.ok(counts.some(x=>x.phase==='PREPARE_BANK_CASH'));assert.ok(counts.some(x=>x.status==='PROVISIONAL'));
 t.diagnostic('Actual App-D1 counts (includes publication/expenditure/Ads-cache reads; excludes separate Auth/Finance worker requests): '+JSON.stringify({cold:counts[0],max_calls:Math.max(...counts.map(x=>x.calls)),max_sql:Math.max(...counts.map(x=>x.sql)),max_prepare:counts.filter(x=>x.status==='PREPARING').sort((a,b)=>b.sql-a.sql)[0]}));
});
