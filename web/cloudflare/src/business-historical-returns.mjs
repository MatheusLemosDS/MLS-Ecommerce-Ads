import {readCompletedBusinessMonth} from './business-month-publication.mjs';
import {runBusinessReconciliation} from './business-reconciliation.mjs';

// The legacy monthly audit cursor remains unchanged. This additive turn is
// scoped to the scheduler's current Brasília month, not the selected cohort.
export const BUSINESS_HISTORICAL_RETURNS_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_historical_returns_turns(calendar_month TEXT PRIMARY KEY,revision INTEGER NOT NULL,next_target TEXT NOT NULL CHECK(next_target IN('CURRENT','PREVIOUS')),lease_token TEXT,lease_until INTEGER)`,
];
export class BusinessHistoricalReturnsError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const ready=new WeakSet(),fail=(suffix,status=503)=>{throw new BusinessHistoricalReturnsError('BUSINESS_HISTORICAL_RETURNS_'+suffix,status);};
const integer=(value,min=0,max=9999999999)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const localMonth=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000)).slice(0,7);
const previousMonth=month=>{const value=new Date(month+'-01T12:00:00Z');value.setUTCMonth(value.getUTCMonth()-1);return value.toISOString().slice(0,7);};
const nextDay=day=>new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
const lastDay=month=>{const date=new Date(month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);date.setUTCDate(0);return date.toISOString().slice(0,10);};
function midnight(day){
 const target=Date.parse(day+'T00:00:00Z')/1000,formatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'});let low=target-18*3600,high=target+18*3600;
 while(low<high){const middle=Math.floor((low+high)/2);if(formatter.format(new Date(middle*1000))<day)low=middle+1;else high=middle;}
 return formatter.format(new Date(low*1000))===day?low:null;
}
function clock(now){let value;try{value=now();}catch{return null;}return integer(value,1,9999999999999)?Math.floor(value/1000):null;}
function context(env,input,options){
 const started=clock(options.now),month=input?.month,background=options.backgroundLease,audit=options.auditLease??null,db=env?.ADMIN_DB;
 if(started===null||!input||![Object.prototype,null].includes(Object.getPrototypeOf(input))||Reflect.ownKeys(input).length!==1||!Object.hasOwn(Object.getOwnPropertyDescriptor(input,'month')||{},'value')||typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month<'2000-01'||month!==localMonth(started)||typeof options.canRun!=='function'||typeof db?.prepare!=='function'||typeof db?.batch!=='function')return null;
 if(!integer(background?.revision,1,2147483646)||!uuid(background?.token)||audit!==null&&(!integer(audit.revision,1,2147483646)||!uuid(audit.token)))return null;
 let latest=started;
 const fresh=()=>{const stamp=clock(options.now);if(stamp===null||stamp<latest||stamp>=started+90||localMonth(stamp)!==month)return null;latest=stamp;return stamp;};
 const allowed=async()=>{try{return fresh()!==null&&await options.canRun()===true&&fresh()!==null;}catch{return false;}};
 return {db,month,previous:month==='2000-01'?null:previousMonth(month),started,background,audit,fresh,allowed};
}
function gate(ctx,stamp,publicationGuard=null){
 let sql='EXISTS(SELECT 1 FROM business_sync_state WHERE id=1 AND enabled=1) AND EXISTS(SELECT 1 FROM background_collection_lane_state WHERE id=1 AND revision=? AND lease_token=? AND lease_until>?)',args=[ctx.background.revision,ctx.background.token,stamp];
 if(ctx.audit){sql+=' AND EXISTS(SELECT 1 FROM financial_audit_turns WHERE month=? AND revision=? AND lease_token=? AND lease_until>?)';args.push(ctx.month,ctx.audit.revision,ctx.audit.token,stamp);}
 if(publicationGuard){sql+=' AND EXISTS(SELECT 1 FROM business_month_publications WHERE month=? AND source_revision=? AND write_token=? AND payload=?)';args.push(publicationGuard.calendar_month,publicationGuard.publication_revision,publicationGuard.publication_write_token,publicationGuard.publication_payload);}
 return {sql,args};
}
async function load(ctx,{now}){
 const empty=reason=>({month:ctx.month,previous:ctx.previous,turn:'PREVIOUS',targets:[{month:ctx.month,kind:'CURRENT',due:false,reason},...(ctx.previous?[{month:ctx.previous,kind:'PREVIOUS',due:false,reason}]:[])]});
 if(!await ctx.allowed())return empty('PAUSED');
 const tables=(await ctx.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN('business_month_publications','business_month_publication_frames','business_reconciliation_attempts','business_reconciliation_leases','business_sync_state','background_collection_lane_state','financial_audit_turns','business_historical_returns_turns')").all()).results??[];
 if(!['business_month_publications','business_month_publication_frames','business_reconciliation_attempts','business_reconciliation_leases','business_sync_state','background_collection_lane_state',...(ctx.audit?['financial_audit_turns']:[])].every(name=>tables.some(row=>row.name===name)))return empty('NO_TABLES');
 const publications=new Map();
 for(const target of [ctx.month,ctx.previous].filter(Boolean)){try{const value=await readCompletedBusinessMonth({ADMIN_DB:ctx.db},target,{now});if(value)publications.set(target,value);}catch{/* A corrupt or absent target cannot substitute another source cohort. */}if(ctx.fresh()===null)return empty('PAUSED');}
 const stamp=ctx.fresh();if(stamp===null||!await ctx.allowed())return empty('PAUSED');const gates=gate(ctx,stamp),hasTurn=tables.some(row=>row.name==='business_historical_returns_turns');
 const rows=await ctx.db.batch([
  ctx.db.prepare('SELECT month,source_revision,write_token,payload FROM business_month_publications WHERE month IN(?,?)').bind(ctx.month,ctx.previous),
  ctx.db.prepare('SELECT run_id,source_revision,checked_at,status,code,next_attempt_at FROM business_reconciliation_attempts WHERE run_id IN(SELECT run_id FROM business_month_publication_frames WHERE month IN(?,?))').bind(ctx.month,ctx.previous),
  ctx.db.prepare('SELECT month,lease_token,lease_until FROM business_reconciliation_leases WHERE month IN(?,?)').bind(ctx.month,ctx.previous),
  ctx.db.prepare('SELECT CASE WHEN '+gates.sql+' THEN 1 ELSE 0 END AS allowed').bind(...gates.args),
  ctx.db.prepare(hasTurn?'SELECT revision,next_target,lease_token,lease_until FROM business_historical_returns_turns WHERE calendar_month=?':"SELECT NULL AS revision,NULL AS next_target,NULL AS lease_token,NULL AS lease_until WHERE ? IS NULL").bind(ctx.month),
 ]);
 if(ctx.fresh()===null||!await ctx.allowed()||rows[3]?.results?.[0]?.allowed!==1)return empty('PAUSED');
 const cursor=rows[4]?.results?.[0];if(cursor&&(!integer(cursor.revision,1,2147483646)||!['CURRENT','PREVIOUS'].includes(cursor.next_target)||(cursor.lease_token===null)!==(cursor.lease_until===null)||cursor.lease_token!==null&&(!uuid(cursor.lease_token)||!integer(cursor.lease_until,1))))return empty('INVALID_TURN');
 const targets=[];
 for(const target of [ctx.month,ctx.previous].filter(Boolean)){
  const kind=target===ctx.month?'CURRENT':'PREVIOUS',result={month:target,kind,due:false,reason:'NO_PUBLICATION'},published=publications.get(target),header=(rows[0]?.results??[]).find(row=>row.month===target);targets.push(result);
  if(!published)continue;
  if(!header||header.source_revision!==published.publication.source_revision||header.payload!==published.row.payload||!uuid(header.write_token)){result.reason='PUBLICATION_CHANGED';continue;}
  if(kind==='PREVIOUS'&&(published.payload.end_date!==lastDay(target)||!published.payload.slots.every(slot=>{const end=midnight(nextDay(slot.end_date));return end!==null&&integer(slot.frame.cutoff_at,end-1);}))){result.reason='INCOMPLETE_PERIOD';continue;}
  const lease=(rows[2]?.results??[]).find(row=>row.month===target);
  if(lease&&(!uuid(lease.lease_token)||!integer(lease.lease_until,1))){result.reason='INVALID_LEASE';continue;}
  if(lease?.lease_until>stamp){result.reason='LEASED';continue;}
  let invalid=false,due=false;
  for(const slot of published.payload.slots){const attempt=(rows[1]?.results??[]).find(row=>row.run_id===slot.frame.run_id&&row.source_revision===slot.frame.revision);if(!attempt){due=true;continue;}if(!integer(attempt.checked_at,1,stamp+60)||!integer(attempt.next_attempt_at,attempt.checked_at)||!['SUCCESS','UNAVAILABLE'].includes(attempt.status)||attempt.status==='SUCCESS'&&attempt.code!==null||attempt.status==='UNAVAILABLE'&&(typeof attempt.code!=='string'||!/^FINANCE_RECONCILIATION_[A-Z_]{1,40}$/.test(attempt.code))){invalid=true;break;}if(attempt.next_attempt_at<=stamp)due=true;}
  if(invalid){result.reason='INVALID_ATTEMPT';continue;}if(!due){result.reason='RETRY_WAIT';continue;}
  result.due=true;result.reason='DUE';result.publicationGuard={calendar_month:target,through_month:ctx.month,publication_revision:header.source_revision,publication_write_token:header.write_token,publication_payload:header.payload,audit_revision:ctx.audit?.revision??null,audit_token:ctx.audit?.token??null,background_revision:ctx.background.revision,background_token:ctx.background.token};
 }
 return {month:ctx.month,previous:ctx.previous,turn:cursor?.next_target??'PREVIOUS',targets};
}

// Read-only eligibility and selection: no schema creation, cursor mutation,
// provider request or substitution of the active partial collector publication.
export async function readBusinessHistoricalReturnsEligibility(env,input,{now=()=>Date.now(),canRun=async()=>true,auditLease,backgroundLease}={}){
 const ctx=context(env,input,{now,canRun,auditLease,backgroundLease});if(!ctx)return null;const observed=await load(ctx,{now});return {schema:'business_historical_returns_eligibility_v1',month:ctx.month,next_target:observed.turn,targets:observed.targets.map(({month,kind,due,reason})=>({month,kind,due,reason}))};
}
export async function selectBusinessHistoricalReturns(env,input,{now=()=>Date.now(),canRun=async()=>true,auditLease,backgroundLease}={}){
 const ctx=context(env,input,{now,canRun,auditLease,backgroundLease});if(!ctx)return null;const observed=await load(ctx,{now}),ordered=observed.targets.filter(target=>target.due).sort((a,b)=>Number(b.kind===observed.turn)-Number(a.kind===observed.turn));if(!ordered.length||!await ctx.allowed())return null;return {month:ordered[0].month,publicationGuard:ordered[0].publicationGuard,alternatives:ordered.slice(1).map(({month,publicationGuard})=>({month,publicationGuard}))};
}

export async function runBusinessHistoricalReturns(env,source,input,{now=()=>Date.now(),canRun=async()=>true,auditLease,backgroundLease,runReturns=runBusinessReconciliation}={}){
 const month=input?.month,result=(status,source_reads=0,selected=month,repeat=false)=>({schema:'business_reconciliation_work_v1',month:selected,status,source_reads,repeat}),ctx=context(env,input,{now,canRun,auditLease,backgroundLease});
 if(!ctx||typeof runReturns!=='function')fail('REQUEST_INVALID',400);if(typeof source!=='function')return result('NO_SOURCE');if(!await ctx.allowed())return result('PAUSED');
 if(!ready.has(ctx.db)){await ctx.db.batch(BUSINESS_HISTORICAL_RETURNS_SCHEMA.map(sql=>ctx.db.prepare(sql)));ready.add(ctx.db);}
 const token=crypto.randomUUID(),stamp=ctx.fresh();if(stamp===null||!await ctx.allowed())return result('PAUSED');const claimGate=gate(ctx,stamp),claimed=await ctx.db.batch([
  ctx.db.prepare("INSERT OR IGNORE INTO business_historical_returns_turns(calendar_month,revision,next_target,lease_token,lease_until) SELECT ?,1,'PREVIOUS',NULL,NULL WHERE "+claimGate.sql).bind(month,...claimGate.args),
  ctx.db.prepare('UPDATE business_historical_returns_turns SET revision=revision+1,lease_token=?,lease_until=? WHERE calendar_month=? AND revision>=1 AND revision<2147483646 AND (lease_token IS NULL OR lease_until<=?) AND '+claimGate.sql).bind(token,stamp+90,month,stamp,...claimGate.args),
  ctx.db.prepare('SELECT revision,next_target FROM business_historical_returns_turns WHERE calendar_month=? AND lease_token=?').bind(month,token),
 ]),claim=claimed[2]?.results?.[0];
 if(!claim)return result('LEASED');let reads=0,selected=null,lastStatus='RETRY_WAIT',repeat=false,leaseCleared=false;
 try{
  const choice=await selectBusinessHistoricalReturns(env,input,{now,canRun:ctx.allowed,auditLease,backgroundLease});if(!choice)return result(await ctx.allowed()?'RETRY_WAIT':'PAUSED');
  for(const target of [choice,...choice.alternatives]){
   if(!await ctx.allowed())return result('PAUSED',reads,selected?.month??month);selected=target;
   const bounded=async(...args)=>{if(reads>=1)fail('READ_BUDGET');if(!await ctx.allowed())fail('PAUSED');const checked=ctx.fresh(),safe=gate(ctx,checked,target.publicationGuard),allowed=await ctx.db.prepare('SELECT CASE WHEN '+safe.sql+' AND EXISTS(SELECT 1 FROM business_historical_returns_turns WHERE calendar_month=? AND revision=? AND lease_token=? AND lease_until>?) THEN 1 ELSE 0 END AS allowed').bind(...safe.args,month,claim.revision,token,checked).first();if(allowed?.allowed!==1||!await ctx.allowed())fail('LEASE_EXPIRED');reads++;return source(...args);};
   try{const work=await runReturns(env,bounded,{month:target.month},{now,canRun:ctx.allowed,publicationGuard:target.publicationGuard});lastStatus=typeof work?.status==='string'&&/^[A-Z_]{1,40}$/.test(work.status)?work.status:'ERROR';repeat=work?.repeat===true;}
   catch{lastStatus='ERROR';repeat=false;}
   if(reads||lastStatus==='PAUSED'&&!await ctx.allowed())break;
  }
  if(!await ctx.allowed())return result('PAUSED',reads,selected?.month??month);
  if(reads&&selected){const finished=ctx.fresh(),guard=gate(ctx,finished,selected.publicationGuard),saved=await ctx.db.prepare('UPDATE business_historical_returns_turns SET revision=revision+1,next_target=?,lease_token=NULL,lease_until=NULL WHERE calendar_month=? AND revision=? AND lease_token=? AND lease_until>? AND '+guard.sql).bind(selected.month===month?'PREVIOUS':'CURRENT',month,claim.revision,token,finished,...guard.args).run();if(saved?.meta?.changes!==1)return result('LEASED',reads,selected.month);leaseCleared=true;}
  return result(lastStatus,reads,selected?.month??month,reads===1&&repeat);
 }finally{if(!leaseCleared)await ctx.db.prepare('UPDATE business_historical_returns_turns SET lease_token=NULL,lease_until=NULL WHERE calendar_month=? AND revision=? AND lease_token=?').bind(month,claim.revision,token).run();}
}
