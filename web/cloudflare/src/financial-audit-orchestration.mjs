import {runBusinessReconciliation} from './business-reconciliation.mjs';
import {runBusinessHistoricalReturns} from './business-historical-returns.mjs';
import {runBusinessEscrowReleases} from './business-escrow-releases.mjs';
import {runBusinessIncomeOverview} from './business-income-overview.mjs';
import {runBusinessIncomeDetail} from './business-income-detail.mjs';
import {runBusinessPendingIncomeScan} from './business-pending-income-scan.mjs';
import {runBusinessEscrowReleaseCoverage} from './business-escrow-release-coverage.mjs';
import {selectBusinessHistoricalReleaseCalendar} from './business-historical-release-calendars.mjs';

// One HISTORY opportunity can read one private Finance source. A durable
// five-way turn keeps returns, release scans, the current income snapshot, Pending detail
// and later-calendar coverage
// bounded to the same single-source-read budget.
export const FINANCIAL_AUDIT_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS financial_audit_turns(month TEXT PRIMARY KEY NOT NULL,revision INTEGER NOT NULL,next_work TEXT NOT NULL,lease_token TEXT,lease_until INTEGER)`,
 `CREATE TABLE IF NOT EXISTS financial_audit_coverage_turns(month TEXT PRIMARY KEY NOT NULL,pending INTEGER NOT NULL CHECK(pending IN (0,1)))`,
 `CREATE TABLE IF NOT EXISTS financial_audit_release_calendar_turns(month TEXT PRIMARY KEY NOT NULL,next_target TEXT NOT NULL CHECK(next_target IN('CURRENT','HISTORICAL')),bootstrap_pending INTEGER NOT NULL CHECK(bootstrap_pending IN(0,1)))`,
 `CREATE TABLE IF NOT EXISTS financial_audit_historical_calendar_targets(month TEXT PRIMARY KEY NOT NULL,last_selected_month TEXT NOT NULL,selected_at INTEGER NOT NULL)`,
];
export class FinancialAuditOrchestrationError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const ready=new WeakSet(),fail=(code,status=503)=>{throw new FinancialAuditOrchestrationError(code,status);};
const integer=value=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=0&&value<=9999999999;

export async function runBusinessFinancialAudits(env,services,input,{now=()=>Date.now(),canRun=async()=>true,runReturns=runBusinessReconciliation,runReleases=runBusinessEscrowReleases,runIncome=runBusinessIncomeOverview,runIncomeDetail=runBusinessIncomeDetail,runPendingIncomeScan=runBusinessPendingIncomeScan,runCoverage=runBusinessEscrowReleaseCoverage,historicalCalendars=false,previousMonthReturns=false,runHistoricalReturns=runBusinessHistoricalReturns,backgroundLease=null}={}){
 const clock=()=>{let raw;try{raw=now();}catch{fail('FINANCIAL_AUDIT_CLOCK_INVALID');}if(!Number.isSafeInteger(raw)||raw<=0||!integer(Math.floor(raw/1000)))fail('FINANCIAL_AUDIT_CLOCK_INVALID');return Math.floor(raw/1000);};
 const stamp=clock(),month=input&&Object.getOwnPropertyDescriptor(input,'month')?.value,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
 if(!input||![Object.prototype,null].includes(Object.getPrototypeOf(input))||Reflect.ownKeys(input).length!==1||!Object.hasOwn(Object.getOwnPropertyDescriptor(input,'month')||{},'value')||typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2000-01'||month>today.slice(0,7))fail('FINANCIAL_AUDIT_REQUEST_INVALID',400);
 const historicalEnabled=historicalCalendars===true&&month===today.slice(0,7)&&Number.isSafeInteger(backgroundLease?.revision)&&backgroundLease.revision>=1&&backgroundLease.revision<2147483647&&typeof backgroundLease?.token==='string'&&/^[a-f0-9-]{36}$/.test(backgroundLease.token);
 if(typeof historicalCalendars!=='boolean'||typeof previousMonthReturns!=='boolean')fail('FINANCIAL_AUDIT_CONFIGURATION');
 const returnsEnabled=previousMonthReturns===true;
 if(returnsEnabled&&(month!==today.slice(0,7)||!Number.isSafeInteger(backgroundLease?.revision)||backgroundLease.revision<1||backgroundLease.revision>=2147483647||typeof backgroundLease?.token!=='string'||!/^[a-f0-9-]{36}$/.test(backgroundLease.token)))fail('FINANCIAL_AUDIT_CONFIGURATION');
 if(typeof canRun!=='function'||typeof runReturns!=='function'||typeof runHistoricalReturns!=='function'||typeof runReleases!=='function'||typeof runIncome!=='function'||typeof runIncomeDetail!=='function'||typeof runPendingIncomeScan!=='function'||typeof runCoverage!=='function')fail('FINANCIAL_AUDIT_CONFIGURATION');
 let sourceReads=0,selected=null,repeat=false,status='IDLE',returnsStatus='DEFERRED',releasesStatus='DEFERRED',incomeStatus='DEFERRED',incomeDetailStatus='DEFERRED',coverageStatus='DEFERRED';
 const result=()=>({schema:'business_financial_audit_work_v3',month,selected,status,source_reads:sourceReads,repeat,returns_status:returnsStatus,releases_status:releasesStatus,income_status:incomeStatus,income_detail_status:incomeDetailStatus,coverage_status:coverageStatus});
 if(!await canRun()){status='PAUSED';return result();}
 const db=env?.ADMIN_DB;if(typeof db?.batch!=='function'||typeof db?.prepare!=='function')fail('FINANCIAL_AUDIT_CONFIGURATION');
 if(!ready.has(db)){await db.batch(FINANCIAL_AUDIT_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}
 const initialize=[db.prepare("INSERT OR IGNORE INTO financial_audit_turns(month,revision,next_work,lease_token,lease_until) VALUES(?,1,'RELEASES',NULL,NULL)").bind(month),db.prepare('INSERT OR IGNORE INTO financial_audit_coverage_turns(month,pending) VALUES(?,1)').bind(month)];if(historicalEnabled)initialize.push(db.prepare("INSERT OR IGNORE INTO financial_audit_release_calendar_turns(month,next_target,bootstrap_pending) VALUES(?,'HISTORICAL',1)").bind(month));await db.batch(initialize);
 const token=crypto.randomUUID(),claim=(await db.prepare('UPDATE financial_audit_turns SET revision=revision+1,lease_token=?,lease_until=? WHERE month=? AND revision<2147483646 AND (lease_token IS NULL OR lease_until<=?) RETURNING revision,next_work,(SELECT pending FROM financial_audit_coverage_turns WHERE month=?) AS coverage_pending,'+(historicalEnabled?"(SELECT next_target FROM financial_audit_release_calendar_turns WHERE month=?)":"'HISTORICAL'")+' AS release_target,'+(historicalEnabled?'(SELECT bootstrap_pending FROM financial_audit_release_calendar_turns WHERE month=?)':'0')+' AS release_bootstrap').bind(token,stamp+90,month,stamp,month,...(historicalEnabled?[month,month]:[])).all()).results?.[0];
 if(!claim){status='LEASED';return result();}
 const order=['RELEASES','RETURNS','INCOME','INCOME_DETAIL'];
 if(historicalEnabled&&(!['CURRENT','HISTORICAL'].includes(claim.release_target)||![0,1].includes(claim.release_bootstrap)))fail('FINANCIAL_AUDIT_STORAGE_INVALID');
 if(!order.includes(claim.next_work)||!Number.isSafeInteger(claim.revision)||claim.revision<2||![0,1].includes(claim.coverage_pending))fail('FINANCIAL_AUDIT_STORAGE_INVALID');
 // Keep the persisted legacy cursor readable by the rollback Worker. The
 // additive pending flag offers coverage one turn without consuming a legacy
 // task; the previous Worker simply ignores this table.
 const next=kind=>order[(order.indexOf(kind)+1)%order.length];let nextWork=claim.next_work,coveragePending=claim.coverage_pending,releaseTarget=historicalEnabled?claim.release_target:'HISTORICAL',releaseNextTarget=releaseTarget,releaseCommitGuard=null,returnsCommitGuard=null,releaseHistoricalSelection=null,releaseBootstrap=historicalEnabled?claim.release_bootstrap:0;
 const calendarClockValid=()=>{const value=clock();return value>=stamp&&value<stamp+90&&new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value*1000)).slice(0,7)===month;};
 const injectedBootstrap=releaseBootstrap===1&&claim.next_work!=='RELEASES';
 const opportunities=[...(coveragePending?['COVERAGE']:[]),...(injectedBootstrap?['RELEASES']:[]),...Array.from({length:order.length},(_,index)=>order[(order.indexOf(claim.next_work)+index)%order.length]).filter(kind=>!injectedBootstrap||kind!=='RELEASES')];let bootstrapVisited=false;
 try{
  for(const kind of opportunities){
   if(clock()>=stamp+90){status='LEASED';repeat=false;break;}
   if(!await canRun()){status='PAUSED';repeat=false;break;}
   const source=kind==='RETURNS'?services?.getFinanceReconciliation:kind==='RELEASES'?services?.getFinanceEscrowReleases:kind==='INCOME'?services?.getFinanceIncomeOverview:kind==='INCOME_DETAIL'?(typeof services?.getFinancePendingIncomeScan==='function'?services.getFinancePendingIncomeScan:services?.getFinanceIncomeDetail):services?.getFinanceEscrowReleaseCoverage;
   if(kind!=='RETURNS'&&sourceReads===0)returnsCommitGuard=null;
   selected=kind;
   const bootstrap=kind==='RELEASES'&&releaseBootstrap===1&&!bootstrapVisited;if(bootstrap){bootstrapVisited=true;releaseBootstrap=0;}
   if(kind==='COVERAGE')coveragePending=0;
   else if(!(bootstrap&&injectedBootstrap)){nextWork=next(kind);if(kind==='INCOME_DETAIL')coveragePending=1;}
   if(typeof source!=='function'){status='NO_SOURCE';if(kind==='RETURNS')returnsStatus=status;else if(kind==='RELEASES')releasesStatus=status;else if(kind==='INCOME')incomeStatus=status;else if(kind==='INCOME_DETAIL')incomeDetailStatus=status;else coverageStatus=status;continue;}
   const boundedSource=async(...args)=>{
    if(sourceReads>=1)fail('FINANCIAL_AUDIT_READ_BUDGET');
    if((historicalEnabled||returnsEnabled)&&!calendarClockValid())fail('FINANCIAL_AUDIT_LEASE_EXPIRED');
    if(clock()>=stamp+90)fail('FINANCIAL_AUDIT_LEASE_EXPIRED');
    if(!await canRun())fail('FINANCIAL_AUDIT_PAUSED');
    if((historicalEnabled||returnsEnabled)&&!calendarClockValid())fail('FINANCIAL_AUDIT_LEASE_EXPIRED');
    if(clock()>=stamp+90)fail('FINANCIAL_AUDIT_LEASE_EXPIRED');
    sourceReads++;return source(...args);
   };
   try{
    const releaseWork=async()=>{
     if(historicalEnabled&&releaseTarget==='HISTORICAL'){
      const selection=await selectBusinessHistoricalReleaseCalendar(env,{month},{now,canRun,auditLease:{revision:claim.revision,token},backgroundLease});
      for(const target of selection?[selection,...selection.alternatives]:[]){
       releaseCommitGuard=target.calendarGuard;const before=sourceReads;let work;
       try{work=await runReleases(env,boundedSource,{month:target.month},{now,canRun,calendarGuard:target.calendarGuard});}
       catch(error){
        if(sourceReads>before)throw error;
        // A corrupt historical presentation cache must not suppress current
        // releases forever. Yield only while the caller's real leases remain
        // valid; a policy/lease/clock interruption is never a fallback cue.
        if(!calendarClockValid()||!await canRun())return {status:'PAUSED'};
        const checked=clock(),gate=await db.prepare('SELECT CASE WHEN EXISTS(SELECT 1 FROM business_sync_state WHERE id=1 AND enabled=1) AND EXISTS(SELECT 1 FROM financial_audit_turns WHERE month=? AND revision=? AND lease_token=? AND lease_until>?) AND EXISTS(SELECT 1 FROM background_collection_lane_state WHERE id=1 AND revision=? AND lease_token=? AND lease_until>?) THEN 1 ELSE 0 END AS allowed').bind(month,claim.revision,token,checked,backgroundLease.revision,backgroundLease.token,checked).first();
        if(gate?.allowed!==1||!calendarClockValid()||!await canRun()||!calendarClockValid())return {status:'PAUSED'};
       }finally{if(sourceReads>before){releaseNextTarget='CURRENT';releaseHistoricalSelection=target;}}
       if(sourceReads>before)return work;
       if(work?.status==='PAUSED'||!calendarClockValid())return work;
       releaseCommitGuard=null;
      }
     }
     try{return await runReleases(env,boundedSource,{month},{now,canRun});}finally{if(historicalEnabled)releaseNextTarget='HISTORICAL';}
    };
    const work=kind==='RETURNS'?(returnsEnabled?await runHistoricalReturns(env,boundedSource,{month},{now,canRun,auditLease:{revision:claim.revision,token},backgroundLease,runReturns:async(...args)=>{returnsCommitGuard=args[3]?.publicationGuard??null;return runReturns(...args);}}):await runReturns(env,boundedSource,{month},{now,canRun})):kind==='RELEASES'?await releaseWork():kind==='INCOME'?await runIncome(env,boundedSource,{now,canRun}):kind==='INCOME_DETAIL'?await (typeof services?.getFinancePendingIncomeScan==='function'?runPendingIncomeScan:runIncomeDetail)(env,boundedSource,{now,canRun}):await runCoverage(env,boundedSource,{through_month:today.slice(0,7)},{now,canRun});
    status=typeof work?.status==='string'&&/^[A-Z_]{1,40}$/.test(work.status)?work.status:'ERROR';
    repeat=kind!=='COVERAGE'&&sourceReads===1&&work?.repeat===true&&!['ERROR','UNAVAILABLE','PAUSED','BLOCKED','RETRY_WAIT','LEASED','NO_SOURCE'].includes(status);
   }catch{status='ERROR';repeat=false;}
   if(kind==='RETURNS')returnsStatus=status;else if(kind==='RELEASES')releasesStatus=status;else if(kind==='INCOME')incomeStatus=status;else if(kind==='INCOME_DETAIL')incomeDetailStatus=status;else coverageStatus=status;
   if(sourceReads)break;
   if(status==='PAUSED'){repeat=false;break;}
  }
  if(!await canRun()){status='PAUSED';repeat=false;}
  return result();
 }finally{
  let guard='',args=[],finished=null;
  if(historicalEnabled||returnsEnabled){
   finished=clock();
   guard=' AND lease_until>? AND EXISTS(SELECT 1 FROM business_sync_state WHERE id=1 AND enabled=1) AND EXISTS(SELECT 1 FROM background_collection_lane_state WHERE id=1 AND revision=? AND lease_token=? AND lease_until>?)';args=[finished,backgroundLease.revision,backgroundLease.token,finished];
   if(!calendarClockValid())guard+=' AND 0';
   if(releaseCommitGuard){guard+=' AND EXISTS(SELECT 1 FROM business_month_publications WHERE month=? AND source_revision=? AND write_token=? AND payload=?)';args.push(releaseCommitGuard.calendar_month,releaseCommitGuard.publication_revision,releaseCommitGuard.publication_write_token,releaseCommitGuard.publication_payload);}
   if(returnsCommitGuard){guard+=' AND EXISTS(SELECT 1 FROM business_month_publications WHERE month=? AND source_revision=? AND write_token=? AND payload=?)';args.push(returnsCommitGuard.calendar_month,returnsCommitGuard.publication_revision,returnsCommitGuard.publication_write_token,returnsCommitGuard.publication_payload);}
  }
  const writes=[db.prepare('UPDATE financial_audit_turns SET revision=revision+1,next_work=?,lease_token=NULL,lease_until=NULL WHERE month=? AND revision=? AND lease_token=?'+guard).bind(nextWork,month,claim.revision,token,...args),db.prepare('INSERT INTO financial_audit_coverage_turns(month,pending) SELECT ?,? WHERE changes()=1 ON CONFLICT(month) DO UPDATE SET pending=excluded.pending').bind(month,coveragePending)];
  if(historicalEnabled)writes.push(db.prepare('INSERT INTO financial_audit_release_calendar_turns(month,next_target,bootstrap_pending) SELECT ?,?,? WHERE changes()=1 ON CONFLICT(month) DO UPDATE SET next_target=excluded.next_target,bootstrap_pending=excluded.bootstrap_pending').bind(month,releaseNextTarget,releaseBootstrap));
  if(historicalEnabled&&releaseHistoricalSelection){const target=releaseHistoricalSelection.calendarGuard;writes.push(db.prepare('INSERT INTO financial_audit_historical_calendar_targets(month,last_selected_month,selected_at) SELECT ?,?,? WHERE changes()=1 AND EXISTS(SELECT 1 FROM business_month_publications WHERE month=? AND source_revision=? AND write_token=? AND payload=?) AND EXISTS(SELECT 1 FROM business_sync_state WHERE id=1 AND enabled=1) AND EXISTS(SELECT 1 FROM background_collection_lane_state WHERE id=1 AND revision=? AND lease_token=? AND lease_until>?) ON CONFLICT(month) DO UPDATE SET last_selected_month=excluded.last_selected_month,selected_at=excluded.selected_at').bind(month,releaseHistoricalSelection.month,finished,target.calendar_month,target.publication_revision,target.publication_write_token,target.publication_payload,backgroundLease.revision,backgroundLease.token,finished));}
  await db.batch(writes);
 }
}
