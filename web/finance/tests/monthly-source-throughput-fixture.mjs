import assert from 'node:assert/strict';
import {D1} from '../../cloudflare/tests/sqlite-d1.mjs';
import {createFinanceStore} from '../src/connection-store.mjs';
import {runFinanceBusinessPeriod} from '../src/business-period.mjs';

// Offline throughput model. All credentials and order serials are synthetic;
// only the repository's real Finance collector and in-memory SQLite execute.
export const MONTHLY_THROUGHPUT_WINDOWS=Object.freeze([
 Object.freeze({start_date:'2026-10-01',end_date:'2026-10-15',orders:113}),
 Object.freeze({start_date:'2026-10-16',end_date:'2026-10-30',orders:308}),
 // An empty final day is an explicit synthetic case, not a statement about Live.
 Object.freeze({start_date:'2026-10-31',end_date:'2026-10-31',orders:0}),
]);
const base=Date.parse('2026-11-17T12:00:00Z'),minute=60000;
const midnight=date=>Date.parse(date+'T03:00:00Z')/1000;
const controls=[{start_date:'2026-11-01',end_date:'2026-11-15'},{start_date:'2026-11-16',end_date:'2026-11-17'}];
const serial=(slot,index)=>'SYNTHETIC_THROUGHPUT_'+slot+'_'+index;
const sourceResponse=response=>Response.json({error:'',response});

export async function monthlySourceThroughputFixture(t,{controlIntervalMinutes=13}={}){
 const db=new D1(),clock={time:base},now=()=>clock.time,env={FINANCE_DB:db,FINANCE_CONNECTION_ENABLED:'true',FINANCE_TOKEN_ENCRYPTION_KEY:Buffer.alloc(32,23).toString('base64'),SHOPEE_FINANCE_PARTNER_KEY:'SYNTHETIC_OFFLINE_THROUGHPUT_KEY'};
 t?.after(()=>db.db.close());
 const store=await createFinanceStore(env,{now});await store.setup();await store.saveTokens({access_token:'SYNTHETIC_OFFLINE_THROUGHPUT_ACCESS',refresh_token:'SYNTHETIC_OFFLINE_THROUGHPUT_REFRESH',expires_at:base/1000+86400});
 const calls={list:0,detail:0,payment:0,external:0},metrics={control_runs_created:0,max_run_count:0};let nextControl=controlIntervalMinutes,controlIndex=0;
 const fetchImpl=async request=>{
  const url=new URL(request.url);assert.equal(url.origin,'https://partner.shopeemobile.com');assert.equal(request.method,'GET');
  if(url.pathname==='/api/v2/order/get_order_list'){
   calls.list++;const slot=MONTHLY_THROUGHPUT_WINDOWS.findIndex(window=>midnight(window.start_date)===Number(url.searchParams.get('time_from')));assert.ok(slot>=0,'only the selected synthetic October windows are collected');
   const count=MONTHLY_THROUGHPUT_WINDOWS[slot].orders,offset=Number(url.searchParams.get('cursor')||0),size=Number(url.searchParams.get('page_size'));assert.ok(size<=20);const total=Math.min(size,count-offset),more=offset+total<count;
   return sourceResponse({order_list:Array.from({length:total},(_,index)=>({order_sn:serial(slot,offset+index)})),more,next_cursor:more?String(offset+total):''});
  }
  if(url.pathname==='/api/v2/order/get_order_detail'){
   calls.detail++;const values=url.searchParams.get('order_sn_list').split(',');assert.ok(values.length<=20);
   return sourceResponse({order_list:values.map(order_sn=>{const match=/^SYNTHETIC_THROUGHPUT_([0-2])_([0-9]+)$/.exec(order_sn);assert.ok(match);const window=MONTHLY_THROUGHPUT_WINDOWS[Number(match[1])];return {order_sn,order_status:'CANCELLED',currency:'BRL',create_time:midnight(window.start_date)+3600,item_list:[]};})});
  }
  calls.payment++;throw Error('SYNTHETIC_THROUGHPUT_UNEXPECTED_PAYMENT_OR_OTHER_PATH');
 };
 const run=async input=>{const frame=await runFinanceBusinessPeriod(env,{...input,fetchImpl,now});const count=db.db.prepare('SELECT COUNT(*) n FROM finance_business_period_runs').get().n;metrics.max_run_count=Math.max(metrics.max_run_count,count);assert.ok(count<=60,'the existing source cap is never enlarged');return frame;};
 const advanceTo=async elapsedMinutes=>{
  assert.ok(Number.isFinite(elapsedMinutes)&&base+elapsedMinutes*minute>=clock.time);
  while(nextControl<=elapsedMinutes){
   clock.time=base+nextControl*minute;const selected=controls[controlIndex++%controls.length],before=db.db.prepare('SELECT COUNT(*) n FROM finance_business_period_runs WHERE start_date=? AND cutoff_at=?').get(selected.start_date,Math.floor(now()/1000)).n;
   await run({operation:'start',...selected});const after=db.db.prepare('SELECT COUNT(*) n FROM finance_business_period_runs WHERE start_date=? AND cutoff_at=?').get(selected.start_date,Math.floor(now()/1000)).n;assert.equal(after-before,1,'alternating windows are 26min apart, outside the unchanged 900s RUNNING reuse window');metrics.control_runs_created++;nextControl+=controlIntervalMinutes;
  }
  clock.time=base+elapsedMinutes*minute;
 };
 const at=async(elapsedMinutes,input)=>{await advanceTo(elapsedMinutes);return run(input);};
 const exists=run_id=>db.db.prepare('SELECT COUNT(*) n FROM finance_business_period_runs WHERE run_id=?').get(run_id).n===1;
 return {db,env,clock,now,calls,metrics,fetchImpl,run,at,advanceTo,exists,base};
}
