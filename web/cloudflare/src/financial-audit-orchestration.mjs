import {runBusinessReconciliation} from './business-reconciliation.mjs';
import {runBusinessEscrowReleases} from './business-escrow-releases.mjs';
import {runBusinessIncomeOverview} from './business-income-overview.mjs';

// One HISTORY opportunity can read one private Finance source. A durable
// three-way turn keeps returns, release scans and the current income snapshot
// bounded to the same single-source-read budget.
export const FINANCIAL_AUDIT_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS financial_audit_turns(month TEXT PRIMARY KEY NOT NULL,revision INTEGER NOT NULL,next_work TEXT NOT NULL,lease_token TEXT,lease_until INTEGER)`,
];
export class FinancialAuditOrchestrationError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const ready=new WeakSet(),fail=(code,status=503)=>{throw new FinancialAuditOrchestrationError(code,status);};
const integer=value=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=0&&value<=9999999999;

export async function runBusinessFinancialAudits(env,services,input,{now=()=>Date.now(),canRun=async()=>true,runReturns=runBusinessReconciliation,runReleases=runBusinessEscrowReleases,runIncome=runBusinessIncomeOverview}={}){
 const clock=()=>{let raw;try{raw=now();}catch{fail('FINANCIAL_AUDIT_CLOCK_INVALID');}if(!Number.isSafeInteger(raw)||raw<=0||!integer(Math.floor(raw/1000)))fail('FINANCIAL_AUDIT_CLOCK_INVALID');return Math.floor(raw/1000);};
 const stamp=clock(),month=input&&Object.getOwnPropertyDescriptor(input,'month')?.value,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
 if(!input||![Object.prototype,null].includes(Object.getPrototypeOf(input))||Reflect.ownKeys(input).length!==1||!Object.hasOwn(Object.getOwnPropertyDescriptor(input,'month')||{},'value')||typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2000-01'||month>today.slice(0,7))fail('FINANCIAL_AUDIT_REQUEST_INVALID',400);
 if(typeof canRun!=='function'||typeof runReturns!=='function'||typeof runReleases!=='function'||typeof runIncome!=='function')fail('FINANCIAL_AUDIT_CONFIGURATION');
 let sourceReads=0,selected=null,repeat=false,status='IDLE',returnsStatus='DEFERRED',releasesStatus='DEFERRED',incomeStatus='DEFERRED';
 const result=()=>({schema:'business_financial_audit_work_v2',month,selected,status,source_reads:sourceReads,repeat,returns_status:returnsStatus,releases_status:releasesStatus,income_status:incomeStatus});
 if(!await canRun()){status='PAUSED';return result();}
 const db=env?.ADMIN_DB;if(typeof db?.batch!=='function'||typeof db?.prepare!=='function')fail('FINANCIAL_AUDIT_CONFIGURATION');
 if(!ready.has(db)){await db.batch(FINANCIAL_AUDIT_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}
 await db.prepare("INSERT OR IGNORE INTO financial_audit_turns(month,revision,next_work,lease_token,lease_until) VALUES(?,1,'RELEASES',NULL,NULL)").bind(month).run();
 const token=crypto.randomUUID(),claim=(await db.prepare('UPDATE financial_audit_turns SET revision=revision+1,lease_token=?,lease_until=? WHERE month=? AND revision<2147483646 AND (lease_token IS NULL OR lease_until<=?) RETURNING revision,next_work').bind(token,stamp+90,month,stamp).all()).results?.[0];
 if(!claim){status='LEASED';return result();}
 if(!['RETURNS','RELEASES','INCOME'].includes(claim.next_work)||!Number.isSafeInteger(claim.revision)||claim.revision<2)fail('FINANCIAL_AUDIT_STORAGE_INVALID');
 const order=['RELEASES','RETURNS','INCOME'],next=kind=>order[(order.indexOf(kind)+1)%order.length];let nextWork=claim.next_work;
 try{
  for(const kind of [claim.next_work,next(claim.next_work),next(next(claim.next_work))]){
   if(clock()>=stamp+90){status='LEASED';repeat=false;break;}
   if(!await canRun()){status='PAUSED';repeat=false;break;}
   const source=kind==='RETURNS'?services?.getFinanceReconciliation:kind==='RELEASES'?services?.getFinanceEscrowReleases:services?.getFinanceIncomeOverview;
   selected=kind;
   if(typeof source!=='function'){status='NO_SOURCE';if(kind==='RETURNS')returnsStatus=status;else if(kind==='RELEASES')releasesStatus=status;else incomeStatus=status;continue;}
   const boundedSource=async(...args)=>{
    if(sourceReads>=1)fail('FINANCIAL_AUDIT_READ_BUDGET');
    if(clock()>=stamp+90)fail('FINANCIAL_AUDIT_LEASE_EXPIRED');
    if(!await canRun())fail('FINANCIAL_AUDIT_PAUSED');
    if(clock()>=stamp+90)fail('FINANCIAL_AUDIT_LEASE_EXPIRED');
    sourceReads++;return source(...args);
   };
   try{
    const work=kind==='RETURNS'?await runReturns(env,boundedSource,{month},{now,canRun}):kind==='RELEASES'?await runReleases(env,boundedSource,{month},{now,canRun}):await runIncome(env,boundedSource,{now,canRun});
    status=typeof work?.status==='string'&&/^[A-Z_]{1,40}$/.test(work.status)?work.status:'ERROR';
    repeat=sourceReads===1&&work?.repeat===true&&!['ERROR','UNAVAILABLE','PAUSED','BLOCKED','RETRY_WAIT','LEASED','NO_SOURCE'].includes(status);
   }catch{status='ERROR';repeat=false;}
   if(kind==='RETURNS')returnsStatus=status;else if(kind==='RELEASES')releasesStatus=status;else incomeStatus=status;
   if(sourceReads){nextWork=next(kind);break;}
   if(status==='PAUSED'){repeat=false;break;}
   nextWork=next(kind);
  }
  if(!await canRun()){status='PAUSED';repeat=false;}
  return result();
 }finally{
  await db.prepare('UPDATE financial_audit_turns SET revision=revision+1,next_work=?,lease_token=NULL,lease_until=NULL WHERE month=? AND revision=? AND lease_token=?').bind(nextWork,month,claim.revision,token).run();
 }
}
