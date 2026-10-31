import {readCompletedBusinessMonth} from './business-month-publication.mjs';
import {projectEscrowReleaseCoverageFrame,projectEscrowReleaseFrame,projectEscrowReleaseEvidenceFrame} from '../../finance/src/escrow-release-frame.mjs';

const integer=(value,min=0,max=9999999999)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const localMonth=stamp=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000)).slice(0,7);
function clock(now){let value;try{value=now();}catch{return null;}return integer(value,1,9999999999999)?Math.floor(value/1000):null;}
function previousMonth(month){const value=new Date(month+'-01T12:00:00Z');value.setUTCMonth(value.getUTCMonth()-1);return value.toISOString().slice(0,7);}
function cents(raw){if(typeof raw!=='string'||raw.length>40)return null;const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(raw);if(!match)return null;const value=(BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0')))*(match[1]?-1n:1n);return value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;}
function midnight(day){const target=Date.parse(day+'T00:00:00Z'),formatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',timeZoneName:'longOffset'});let result=target;for(let index=0;index<2;index++){const label=formatter.formatToParts(new Date(result)).find(part=>part.type==='timeZoneName')?.value,match=/^GMT([+-])(\d{2}):(\d{2})$/.exec(label||'');if(!match)return null;result=target-(Number(match[2])*3600+Number(match[3])*60)*(match[1]==='+'?1:-1)*1000;}return result/1000;}

// Selection only: no schema initialization, provider call or persistent write.
// The existing monthly release runner owns retry/lease/ledger semantics.
export async function selectBusinessHistoricalReleaseCalendar(env,{month},{now=()=>Date.now(),canRun=async()=>true,auditLease,backgroundLease}={}){
 const started=clock(now);if(started===null||typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month!==localMonth(started)||month<='2000-01'||typeof canRun!=='function'||!integer(auditLease?.revision,1,2147483646)||!uuid(auditLease?.token)||!integer(backgroundLease?.revision,1,2147483646)||!uuid(backgroundLease?.token))return null;
 const db=env?.ADMIN_DB;if(typeof db?.prepare!=='function'||typeof db?.batch!=='function'||!await canRun())return null;
 const target=previousMonth(month),fresh=()=>{const value=clock(now);return value!==null&&value>=started&&value<started+90&&localMonth(value)===month?value:null;};
 try{
  const required=['business_month_publications','business_month_publication_frames','business_escrow_release_coverage','business_escrow_release_coverage_attempt_scopes','business_escrow_release_reports'];
  const tables=(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN('business_month_publications','business_month_publication_frames','business_escrow_release_coverage','business_escrow_release_coverage_attempt_scopes','business_escrow_release_reports')").all()).results;
  if(!Array.isArray(tables)||!required.every(name=>tables.some(row=>row.name===name))||fresh()===null)return null;
  const published=await readCompletedBusinessMonth(env,target,{now});if(!published||fresh()===null)return null;
  const snapshot=await db.batch([
   db.prepare('SELECT c.payload,c.payload_checked_at,c.last_attempt_at,c.next_attempt_at,c.status,c.code,a.through_month,a.publication_revision,a.checked_at AS attempt_checked_at FROM business_escrow_release_coverage c JOIN business_escrow_release_coverage_attempt_scopes a ON a.cohort_month=c.cohort_month WHERE c.cohort_month=?').bind(target),
   db.prepare('SELECT source_revision,write_token,payload FROM business_month_publications WHERE month=?').bind(target),
   db.prepare('SELECT payload,checked_at FROM business_escrow_release_reports WHERE month=? ORDER BY checked_at DESC LIMIT 8').bind(target),
  ]),stamp=fresh(),row=snapshot[0]?.results?.[0],header=snapshot[1]?.results?.[0];
  if(stamp===null||!row||row.status!=='SUCCESS'||row.code!==null||row.through_month!==month||row.publication_revision!==published.publication.source_revision||row.attempt_checked_at!==row.last_attempt_at||!integer(row.last_attempt_at,1,stamp)||!integer(row.next_attempt_at,row.last_attempt_at)||typeof row.payload!=='string'||new TextEncoder().encode(row.payload).byteLength>65536||header?.source_revision!==published.publication.source_revision||header.payload!==published.row.payload||!uuid(header.write_token))return null;
  const report=projectEscrowReleaseCoverageFrame(JSON.parse(row.payload));
  if(!report||report.cohort_month!==target||report.through_month!==month||report.checked_at!==row.payload_checked_at||report.checked_at<published.publication.published_at||report.checked_at>row.last_attempt_at||stamp-report.checked_at>21600||report.sources.length!==published.payload.slots.length)return null;
  const calendar=report.calendars.find(value=>value.month===target);if(!calendar||!(calendar.status==='MISSING'&&report.pending.includes('CALENDAR_MISSING')||calendar.status==='PARTIAL'&&report.pending.includes('CALENDAR_PARTIAL')))return null;
  if(!published.payload.slots.every(({frame})=>{const source=report.sources.find(value=>value.run_id===frame.run_id&&value.source_revision===frame.revision);return !!source&&(source.status==='MISSING'||source.start_date===frame.start_date&&source.end_date===frame.end_date&&source.orders===frame.coverage.orders&&source.paid_orders===frame.coverage.paid&&source.expected_repass_cents===cents(frame.expected_repass_raw)&&(frame.coverage.orders===0||source.finance_oldest_at===(frame.source_checked_at?.oldest_at??frame.cutoff_at)&&source.finance_latest_at===(frame.source_checked_at?.latest_at??frame.checked_at)));}))return null;
  const end=midnight(month+'-01');
  // A calendar is independent of a creation-cohort signature. Reuse only a
  // validated full-month completion newer than the missing-calendar cue.
  for(const stored of snapshot[2]?.results??[]){
   if(typeof stored.payload!=='string'||new TextEncoder().encode(stored.payload).byteLength>65536)continue;
   let raw;try{raw=JSON.parse(stored.payload);}catch{continue;}
   const frame=projectEscrowReleaseEvidenceFrame(raw,projectEscrowReleaseFrame)?.report??projectEscrowReleaseFrame(raw);
   if(frame&&frame.month===target&&frame.checked_at===stored.checked_at&&frame.checked_at>=report.checked_at&&frame.checked_at<=stamp+60&&frame.calendar.status==='COMPLETE'&&frame.calendar.cutoff_at===end&&frame.calendar.end_before_at===end)return null;
  }
  if(!await canRun()||fresh()===null)return null;
  return {month:target,calendarGuard:{through_month:month,publication_revision:header.source_revision,publication_write_token:header.write_token,publication_payload:header.payload,audit_revision:auditLease.revision,audit_token:auditLease.token,background_revision:backgroundLease.revision,background_token:backgroundLease.token}};
 }catch{return null;}
}
