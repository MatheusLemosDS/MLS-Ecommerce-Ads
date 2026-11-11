import assert from 'node:assert/strict';
import {collectionFixture} from './business-collection-fixture.mjs';
import {businessMonth,readBusinessMonthDisplay} from '../src/business-month.mjs';
import {buildAdsCalendar} from '../src/ads-calendar.mjs';
import {buildAdsMeasurement} from '../src/ads-measurement.mjs';
import {readIncurredProduction,mutateIncurredProduction} from '../src/incurred-production.mjs';
import {readProductionWeeklyClosingWorkspace,mutateProductionWeeklyClosingWorkspace,runProductionWeeklyClosing} from '../src/production-weekly-store.mjs';
import {readProductionCoverageWorkspace,mutateProductionCoverageWorkspace} from '../src/production-coverage.mjs';
import {readExternalCashPeriodSummary} from '../../finance/src/external-cash-period.mjs';
import {D1} from './sqlite-d1.mjs';
import {createFinanceStore} from '../../finance/src/connection-store.mjs';

// Disposable synthetic fixture. Existing collector/publication, explicit
// manufacture commands and owner coverage attestations produce every source.
export async function weeklyOperatingFixture({manufacturing=true}={}){
 const f=await collectionFixture({allPaid:true,daily:true,windowCounts:[1,1],paymentDelayMs:0}),db=f.env.ADMIN_DB.db,cashDb=new D1();
 f.clock.time=Date.parse('2026-10-31T20:00:00Z');
 const financeStore=await createFinanceStore(f.financeEnv,{now:f.now});await financeStore.saveTokens({access_token:'PRIVATE_INTEGRATION_ACCESS',refresh_token:'PRIVATE_INTEGRATION_REFRESH',expires_at:f.now()/1000+14400},{expectedRevision:1});
 f.state.detailHook=({ids})=>f.provider({order_list:ids.map(index=>({order_sn:f.serial(index),order_status:'COMPLETED',currency:'BRL',create_time:Date.UTC(2026,9,index<60?1:30,12)/1000,item_list:[{item_id:f.item(index),model_id:0,model_quantity_purchased:1}]}))});
 // The October31 third window contains no new orders; reuse the authentic
 // list transport while preventing the fixture's default second-page replay.
 f.state.listHook=({request})=>Number(new URL(request.url).searchParams.get('time_from'))>=Date.UTC(2026,9,31,3)/1000?f.provider({order_list:[],more:false,next_cursor:''}):null;
 let monthly=await f.invoke('start');for(let i=0;monthly.status==='RUNNING'&&i<20;i++)monthly=await f.invoke('step');assert.equal(monthly.status,'COMPLETE');await f.invoke('ads');await readBusinessMonthDisplay(f.env,{month:'2026-10'},{now:f.now});
 // A second immutable synthetic publication uses the exact same validated
 // frame shape, with September's two15day windows and its own Ads calendar.
 const header=db.prepare('SELECT * FROM business_month_publications WHERE month=?').get('2026-10'),octoberFrames=db.prepare('SELECT * FROM business_month_publication_frames WHERE month=? ORDER BY slot_index').all('2026-10');
 const shift=value=>JSON.parse(JSON.stringify(value).replaceAll('2026-10-','2026-09-'));
 const payload=shift(JSON.parse(header.payload));payload.end_date='2026-09-30';payload.slots=payload.slots.slice(0,2);
 db.prepare('INSERT INTO business_month_publications VALUES(?,?,?,?,?,?,?)').run('2026-09',header.source_revision,header.source_created_at,header.source_updated_at,header.published_at,header.write_token,JSON.stringify(payload));
 for(const row of octoberFrames.slice(0,2)){const frame=shift(JSON.parse(row.payload));db.prepare('INSERT INTO business_month_publication_frames VALUES(?,?,?,?,?,?)').run('2026-09',row.slot_index,row.write_token,row.run_id,row.revision,JSON.stringify(frame));}
 await businessMonth(f.env,{operation:'expenses',month:'2026-09',revision:0,external_expenses_cents:0,recharge_treatment:'UNCONFIRMED'},f.services,{now:f.now,actor:'synthetic-weekly-owner'});
 const children=[];for(const begin of [1,16]){const range={start_date:'2026-09-'+String(begin).padStart(2,'0'),end_date:'2026-09-'+String(begin+14).padStart(2,'0')};children.push(buildAdsMeasurement({status:'ok',connected:true,shop:{id:1178167501},period:range,balance:30,daily:Array.from({length:15},(_,i)=>({date:'2026-09-'+String(begin+i).padStart(2,'0'),expense:1.25,broad_gmv:12.5,broad_order:1,broad_roas:10,direct_gmv:0,direct_order:0,direct_roas:0}))},range,f.now()/1000));}
 const ads=buildAdsCalendar(children,{start_date:'2026-09-01',end_date:'2026-09-30'},f.now()/1000);db.prepare('INSERT INTO business_month_ads(month,payload,updated_at) VALUES(?,?,?)').run('2026-09',JSON.stringify(ads),f.now()/1000);
 const ids={};
 if(manufacturing){
  const identity={artwork:'Arte semanal sintética',color:'Preto',size:'M',garment_type:'ADULT',fit:'UNISEX',confirmed:true,item_id:null,model_id:null,sku:null};
  async function record(date,quantity,cost){const ledger=await readIncurredProduction(f.env,{now:f.now}),id=crypto.randomUUID();await mutateIncurredProduction(f.env,{revision:ledger.revision,request_id:crypto.randomUUID(),action:'record',record_id:id,production_ref:'Fabricação semanal sintética '+date,replaces_record_id:null,produced_date:date,quantity,identity:{...identity},source:{kind:'MANUAL_LOT',key:null,hash:null},cost:{unit_cost_cents:cost,reference:null},evidence:'Fixture sintética da fabricação efetivamente declarada',confirmed:true},'synthetic-weekly-owner',{now:f.now});return id;}
  ids.first=await record('2026-09-25',2,1000);ids.weekend=await record('2026-09-26',3,2000);ids.last=await record('2026-10-02',4,500);
  for(const [id,before,after,month] of [[ids.first,1,1,'2026-09'],[ids.last,2,2,'2026-10']]){const workspace=await readProductionWeeklyClosingWorkspace(f.env,{month},{now:f.now}),row=workspace.boundary_records.find(v=>v.record_id===id);await mutateProductionWeeklyClosingWorkspace(f.env,{action:'assign_boundary',month,request_id:crypto.randomUUID(),revision:workspace.revision,ledger_revision:workspace.source.ledger_revision,record_id:id,record_hash:row.record_hash,before13_quantity:before,at_or_after13_quantity:after,confirmed:true,reason:'Corte de sexta conferido em fixture sintética'},'synthetic-weekly-owner',{now:f.now});}
  for(let n=0;n<7;n++)await runProductionWeeklyClosing(f.env,{now:f.now});
  for(let n=0;n<8;n++){const c=await readProductionCoverageWorkspace(f.env,{week_end:'2026-10-02'},{now:f.now}),row=c.intervals[n];await mutateProductionCoverageWorkspace(f.env,{action:'confirm',week_end:c.week_end,interval_key:row.key,source_hash:row.source_hash,revision:c.revision,ledger_revision:c.source.ledger_revision,timing_revision:c.source.timing_revision,request_id:crypto.randomUUID(),mode:row.recorded.quantity?'ALL_RECORDED':'NO_MANUFACTURING',reason:'Todos os registros sintéticos deste intervalo foram conferidos',confirmed:true},'synthetic-weekly-owner',{now:f.now});}
 }
 const services={cashPeriod:selection=>readExternalCashPeriodSummary({FINANCE_DB:cashDb},{schema:'external_cash_period_request_v1',...selection},{now:f.now})};
 const snapshot=()=>JSON.stringify(db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({name})=>[name,db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()]));
 return {...f,ids,services,snapshot,close(){db.close();f.financeEnv.FINANCE_DB.db.close();cashDb.db.close();}};
}
