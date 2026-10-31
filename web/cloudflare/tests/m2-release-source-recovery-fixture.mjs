import assert from 'node:assert/strict';
import {collectionFixture} from './business-collection-fixture.mjs';
import {SCHEMA} from '../src/admin.mjs';
import {runBusinessSync} from '../src/business-sync.mjs';
import {runBusinessHistorySync} from '../src/business-history-sync.mjs';
import {readCompletedBusinessMonth} from '../src/business-month-publication.mjs';
import {createFinanceStore} from '../../finance/src/connection-store.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {projectEscrowReleaseCoverageFrame} from '../../finance/src/escrow-release-frame.mjs';

export const sourceRecoveryMonth='2026-10',sourceRecoveryCurrent='2026-11';
export const currentRecoveryRow=f=>f.env.ADMIN_DB.db.prepare('SELECT * FROM business_sync_state WHERE id=1').get();
export const historyRecoveryRow=f=>f.env.ADMIN_DB.db.prepare('SELECT * FROM business_history_sync_state WHERE month=?').get(sourceRecoveryMonth)||null;
export const runSourceRecovery=f=>runBusinessHistorySync(f.env,f.services,{now:f.now,currentStatus:'NOT_DUE'});
export const readRecoveryPublication=f=>readCompletedBusinessMonth(f.env,sourceRecoveryMonth,{now:f.now});

async function tokens(f){
 const store=await createFinanceStore(f.financeEnv,{now:f.now});
 const row=f.financeEnv.FINANCE_DB.db.prepare('SELECT revision FROM finance_connections').get();
 await store.saveTokens({access_token:'PRIVATE_SOURCE_RECOVERY_FIXTURE_ACCESS',refresh_token:'PRIVATE_SOURCE_RECOVERY_FIXTURE_REFRESH',expires_at:Math.floor(f.now()/1000)+14400},{expectedRevision:row.revision});
}
function ads(selection,stamp){
 const children=[],end=Number(selection.end_date.slice(8)),month=selection.start_date.slice(0,7);
 for(let first=1;first<=end;first+=15){
  const last=Math.min(first+14,end),range={start_date:month+'-'+String(first).padStart(2,'0'),end_date:month+'-'+String(last).padStart(2,'0')};
  const daily=Array.from({length:last-first+1},(_,i)=>({date:month+'-'+String(first+i).padStart(2,'0'),expense:1.25,broad_gmv:12.5,broad_order:1,broad_roas:10,direct_gmv:0,direct_order:0,direct_roas:0}));
  children.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:range,balance:30,daily},range,stamp));
 }
 return buildAdsCalendar(children,selection,stamp);
}

export function sourceRecoveryGap(f){
 const stamp=Math.floor(f.now()/1000),sources=f.original.payload.slots.map(({frame})=>({run_id:frame.run_id,source_revision:frame.revision,start_date:null,end_date:null,status:'MISSING',orders:null,paid_orders:null,finance_oldest_at:null,finance_latest_at:null,expected_repass_cents:null}));
 const calendars=[sourceRecoveryMonth,sourceRecoveryCurrent].map(month=>({month,status:'MISSING',scan_id:null,cutoff_at:null,source_oldest_at:null,source_latest_at:null,observations:0,cohort_observations:0,unique_cohort_orders:0,ambiguous_cohort_orders:0}));
 const frame={schema:'finance_escrow_release_coverage_v1',cohort_month:sourceRecoveryMonth,through_month:sourceRecoveryCurrent,checked_at:stamp,status:'COLLECTING',sources,calendars,coverage:{paid_orders:null,located_orders:0,not_located_orders:null,ambiguous_orders:0,single_orders:0,calendars_total:2,calendars_complete:0,identity_complete_at_cutoff:false},pending:['SOURCE_MISSING','CALENDAR_MISSING','BANK_RECEIPT_NOT_VERIFIED','RELEASE_CYCLE_SEMANTICS_UNVERIFIED'],basis:'SAVED_RELEASE_CALENDARS_AGAINST_PAID_ORDER_COHORT_NOT_BANK_RECEIPT'};
 assert.ok(projectEscrowReleaseCoverageFrame(frame));return frame;
}
export function saveSourceRecoveryGap(f,{frame=sourceRecoveryGap(f),scopeRevision=f.original.publication.source_revision,through=sourceRecoveryCurrent,status='SUCCESS',code=null,at=Math.floor(f.now()/1000),payloadAt=frame.checked_at,attemptAt=at}={}){
 const db=f.env.ADMIN_DB.db;
 db.prepare('INSERT OR REPLACE INTO business_escrow_release_coverage(cohort_month,payload,payload_checked_at,last_attempt_at,status,code,next_attempt_at) VALUES(?,?,?,?,?,?,?)').run(sourceRecoveryMonth,JSON.stringify(frame),payloadAt,at,status,code,at+900);
 db.prepare('INSERT OR REPLACE INTO business_escrow_release_coverage_attempt_scopes(cohort_month,through_month,publication_revision,checked_at) VALUES(?,?,?,?)').run(sourceRecoveryMonth,through,scopeRevision,attemptAt);
}
export async function sourceRecoveryFixture(t){
 const f=await collectionFixture({daily:true,allPaid:true,windowCounts:[12,12],paymentDelayMs:0});
 t.after(()=>{f.env.ADMIN_DB.db.close();f.financeEnv.FINANCE_DB.db.close();});
 await f.env.ADMIN_DB.batch(SCHEMA.map(sql=>f.env.ADMIN_DB.prepare(sql)));
 // The new metadata is additive. Keep the fixture independent from whether
 // another source test initialized the scheduled coverage store first.
 f.env.ADMIN_DB.db.exec('CREATE TABLE IF NOT EXISTS business_escrow_release_coverage_attempt_scopes(cohort_month TEXT PRIMARY KEY NOT NULL,through_month TEXT NOT NULL,publication_revision INTEGER NOT NULL,checked_at INTEGER NOT NULL)');
 f.state.detailHook=({ids})=>f.provider({order_list:ids.map(index=>({order_sn:f.serial(index),order_status:'COMPLETED',currency:'BRL',create_time:Date.UTC(2026,9,index<60?10:20,12)/1000,item_list:[{item_id:f.item(index),model_id:0,model_quantity_purchased:1}]}))});
 f.state.listHook=({request})=>Number(new URL(request.url).searchParams.get('time_from'))>=Date.UTC(2026,9,31,3)/1000?f.provider({order_list:[],more:false,next_cursor:''}):undefined;
 f.services.getAdsCalendar=async(_,selection)=>{f.calls.ads.push(selection);return ads(selection,Math.floor(f.now()/1000));};
 f.clock.time=Date.UTC(2026,9,31,12);await tokens(f);
 let frame=await f.invoke('start');for(let n=0;frame.status==='RUNNING'&&n<30;n++)frame=await f.invoke('step');assert.equal(frame.status,'COMPLETE');await f.invoke('ads');
 f.original=await readRecoveryPublication(f);assert.equal(f.original.payload.slots.reduce((n,slot)=>n+slot.frame.coverage.paid,0),24);
 const oldIds=f.original.payload.slots.map(slot=>slot.frame.run_id),placeholders=oldIds.map(()=>'?').join(',');
 // Simulate genuine source retention loss. The immutable App copies remain.
 for(const table of ['finance_business_order_evidence','finance_business_period_orders','finance_business_period_cursors','finance_business_period_payment_cache','finance_business_period_runs'])f.financeEnv.FINANCE_DB.db.prepare('DELETE FROM '+table+' WHERE run_id IN('+placeholders+')').run(...oldIds);
 f.clock.time=Date.UTC(2026,10,10,12);await tokens(f);
 const current=await runBusinessSync(f.env,f.services,{now:f.now});assert.equal(current.status,'COMPLETE');
 f.sourceOptions=[];const provider=f.services.getFinanceBusinessPeriod;
 f.services.getFinanceBusinessPeriod=async(...args)=>{f.sourceOptions.push(args[2]);return provider(...args);};
 return f;
}
export async function sourceRecoveryOpportunity(f,seconds=61){
 f.clock.time+=seconds*1000;
 f.env.ADMIN_DB.db.prepare('UPDATE business_sync_state SET next_run_at=? WHERE id=1').run(Math.floor(f.now()/1000)+300);
 const before=currentRecoveryRow(f),calls=f.calls.finance.length,ads=f.calls.ads.length,value=await runSourceRecovery(f);
 assert.deepEqual(currentRecoveryRow(f),before,'maintenance preserves current Finance state');
 assert.ok(f.calls.finance.length-calls<=1,'one existing private Finance source per opportunity');assert.equal(f.calls.ads.length,ads,'repair does not refresh Ads');return value;
}
