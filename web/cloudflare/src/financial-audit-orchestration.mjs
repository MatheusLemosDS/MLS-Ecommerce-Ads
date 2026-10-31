import {runBusinessReconciliation} from './business-reconciliation.mjs';
import {runBusinessEscrowReleases} from './business-escrow-releases.mjs';
import {runBusinessIncomeOverview} from './business-income-overview.mjs';
import {runBusinessIncomeDetail} from './business-income-detail.mjs';
import {runBusinessEscrowReleaseCoverage} from './business-escrow-release-coverage.mjs';

// One HISTORY opportunity can read one private Finance source. A durable
// five-way turn keeps returns, release scans, the current income snapshot, Pending detail
// and later-calendar coverage
// bounded to the same single-source-read budget.
export const FINANCIAL_AUDIT_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS financial_audit_turns(month TEXT PRIMARY KEY NOT NULL,revision INTEGER NOT NULL,next_work TEXT NOT NULL,lease_token TEXT,lease_until INTEGER)`,
 `CREATE TABLE IF NOT EXISTS financial_audit_coverage_turns(month TEXT PRIMARY KEY NOT NULL,pending INTEGER NOT NULL CHECK(pending IN (0,1)))`,
];
export class FinancialAuditOrchestrationError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const ready=new WeakSet(),fail=(code,status=503)=>{throw new FinancialAuditOrchestrationError(code,status);};
const integer=value=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=0&&value<=9999999999;

export async function runBusinessFinancialAudits(env,services,input,{now=()=>Date.now(),canRun=async()=>true,runReturns=runBusinessReconciliation,runReleases=runBusinessEscrowReleases,runIncome=runBusinessIncomeOverview,runIncomeDetail=runBusinessIncomeDetail,runCoverage=runBusinessEscrowReleaseCoverage}={}){
 const clock=()=>{let raw;try{raw=now();}catch{fail('FINANCIAL_AUDIT_CLOCK_INVALID');}if(!Number.isSafeInteger(raw)||raw<=0||!integer(Math.floor(raw/1000)))fail('FINANCIAL_AUDIT_CLOCK_INVALID');return Math.floor(raw/1000);};
 const stamp=clock(),month=input&&Object.getOwnPropertyDescriptor(input,'month')?.value,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
 if(!input||![Object.prototype,null].includes(Object.getPrototypeOf(input))||Reflect.ownKeys(input).length!==1||!Object.hasOwn(Object.getOwnPropertyDescriptor(input,'month')||{},'value')||typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2000-01'||month>today.slice(0,7))fail('FINANCIAL_AUDIT_REQUEST_INVALID',400);
 if(typeof canRun!=='function'||typeof runReturns!=='function'||typeof runReleases!=='function'||typeof runIncome!=='function'||typeof runIncomeDetail!=='function'||typeof runCoverage!=='function')fail('FINANCIAL_AUDIT_CONFIGURATION');
 let sourceReads=0,selected=null,repeat=false,status='IDLE',returnsStatus='DEFERRED',releasesStatus='DEFERRED',incomeStatus='DEFERRED',incomeDetailStatus='DEFERRED',coverageStatus='DEFERRED';
 const result=()=>({schema:'business_financial_audit_work_v3',month,selected,status,source_reads:sourceReads,repeat,returns_status:returnsStatus,releases_status:releasesStatus,income_status:incomeStatus,income_detail_status:incomeDetailStatus,coverage_status:coverageStatus});
 if(!await canRun()){status='PAUSED';return result();}
 const db=env?.ADMIN_DB;if(typeof db?.batch!=='function'||typeof db?.prepare!=='function')fail('FINANCIAL_AUDIT_CONFIGURATION');
 if(!ready.has(db)){await db.batch(FINANCIAL_AUDIT_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}
 await db.batch([db.prepare("INSERT OR IGNORE INTO financial_audit_turns(month,revision,next_work,lease_token,lease_until) VALUES(?,1,'RELEASES',NULL,NULL)").bind(month),db.prepare('INSERT OR IGNORE INTO financial_audit_coverage_turns(month,pending) VALUES(?,1)').bind(month)]);
 const token=crypto.randomUUID(),claim=(await db.prepare('UPDATE financial_audit_turns SET revision=revision+1,lease_token=?,lease_until=? WHERE month=? AND revision<2147483646 AND (lease_token IS NULL OR lease_until<=?) RETURNING revision,next_work,(SELECT pending FROM financial_audit_coverage_turns WHERE month=?) AS coverage_pending').bind(token,stamp+90,month,stamp,month).all()).results?.[0];
 if(!claim){status='LEASED';return result();}
 const order=['RELEASES','RETURNS','INCOME','INCOME_DETAIL'];
 if(!order.includes(claim.next_work)||!Number.isSafeInteger(claim.revision)||claim.revision<2||![0,1].includes(claim.coverage_pending))fail('FINANCIAL_AUDIT_STORAGE_INVALID');
 // Keep the persisted legacy cursor readable by the rollback Worker. The
 // additive pending flag offers coverage one turn without consuming a legacy
 // task; the previous Worker simply ignores this table.
 const next=kind=>order[(order.indexOf(kind)+1)%order.length];let nextWork=claim.next_work,coveragePending=claim.coverage_pending;
 const opportunities=[...(coveragePending?['COVERAGE']:[]),...Array.from({length:order.length},(_,index)=>order[(order.indexOf(claim.next_work)+index)%order.length])];
 try{
  for(const kind of opportunities){
   if(clock()>=stamp+90){status='LEASED';repeat=false;break;}
   if(!await canRun()){status='PAUSED';repeat=false;break;}
   const source=kind==='RETURNS'?services?.getFinanceReconciliation:kind==='RELEASES'?services?.getFinanceEscrowReleases:kind==='INCOME'?services?.getFinanceIncomeOverview:kind==='INCOME_DETAIL'?services?.getFinanceIncomeDetail:services?.getFinanceEscrowReleaseCoverage;
   selected=kind;
   if(kind==='COVERAGE')coveragePending=0;
   else{nextWork=next(kind);if(kind==='INCOME_DETAIL')coveragePending=1;}
   if(typeof source!=='function'){status='NO_SOURCE';if(kind==='RETURNS')returnsStatus=status;else if(kind==='RELEASES')releasesStatus=status;else if(kind==='INCOME')incomeStatus=status;else if(kind==='INCOME_DETAIL')incomeDetailStatus=status;else coverageStatus=status;continue;}
   const boundedSource=async(...args)=>{
    if(sourceReads>=1)fail('FINANCIAL_AUDIT_READ_BUDGET');
    if(clock()>=stamp+90)fail('FINANCIAL_AUDIT_LEASE_EXPIRED');
    if(!await canRun())fail('FINANCIAL_AUDIT_PAUSED');
    if(clock()>=stamp+90)fail('FINANCIAL_AUDIT_LEASE_EXPIRED');
    sourceReads++;return source(...args);
   };
   try{
    const work=kind==='RETURNS'?await runReturns(env,boundedSource,{month},{now,canRun}):kind==='RELEASES'?await runReleases(env,boundedSource,{month},{now,canRun}):kind==='INCOME'?await runIncome(env,boundedSource,{now,canRun}):kind==='INCOME_DETAIL'?await runIncomeDetail(env,boundedSource,{now,canRun}):await runCoverage(env,boundedSource,{through_month:today.slice(0,7)},{now,canRun});
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
  await db.batch([db.prepare('UPDATE financial_audit_turns SET revision=revision+1,next_work=?,lease_token=NULL,lease_until=NULL WHERE month=? AND revision=? AND lease_token=?').bind(nextWork,month,claim.revision,token),db.prepare('INSERT INTO financial_audit_coverage_turns(month,pending) SELECT ?,? WHERE changes()=1 ON CONFLICT(month) DO UPDATE SET pending=excluded.pending').bind(month,coveragePending)]);
 }
}
