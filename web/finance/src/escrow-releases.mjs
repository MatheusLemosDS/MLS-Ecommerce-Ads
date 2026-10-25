import {FINANCE_PROFILE,FinanceConnectionError} from './connection-store.mjs';
import {readFinancialOrderEvidence} from './financial-order-evidence.mjs';
import {runEscrowReleaseLedger,ESCROW_RELEASE_LEDGER_SCHEMA} from './escrow-release-ledger.mjs';
import {projectEscrowReleaseRequest,projectEscrowReleaseFrame} from './escrow-release-frame.mjs';

// Release observations and order-creation cohorts have different clocks. This
// audit keeps both, and never turns either into bank receipts or realized net.
export const ESCROW_RELEASES_SCHEMA=[
 ...ESCROW_RELEASE_LEDGER_SCHEMA,
 `CREATE TABLE IF NOT EXISTS finance_escrow_release_cohorts(cohort_key TEXT PRIMARY KEY,partner_id INTEGER NOT NULL,shop_id INTEGER NOT NULL,month TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=8192),payload_hash TEXT NOT NULL,created_at INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS finance_escrow_release_cohort_sources(cohort_key TEXT NOT NULL,slot_index INTEGER NOT NULL CHECK(slot_index BETWEEN 0 AND 2),payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=1048576),payload_hash TEXT NOT NULL,PRIMARY KEY(cohort_key,slot_index))`,
];
const encoder=new TextEncoder(),ready=new WeakSet(),identity=[FINANCE_PROFILE.partner_id,FINANCE_PROFILE.shop_id];
const fail=(suffix,status=503)=>{throw new FinanceConnectionError('FINANCE_ESCROW_RELEASE_'+suffix,status);};
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const safe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
function cents(value){
 if(typeof value!=='string'||value.length>40)return null;const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/.exec(value);if(!match)return null;
 const amount=(BigInt(match[2])*100n+BigInt((match[3]||'').padEnd(2,'0')))*(match[1]?-1n:1n);
 const abs=amount<0n?-amount:amount,fraction=(abs%100n).toString().padStart(2,'0').replace(/0+$/,'');
 return (amount<0n?'-':'')+(abs/100n).toString()+(fraction?'.'+fraction:'')===value?amount:null;
}
const paid=row=>['completed','ongoing'].includes(row.bucket);
const nextDay=day=>new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);
function epoch(now){let value;try{value=now();}catch{fail('CLOCK_INVALID');}if(!integer(value,1,9999999999999))fail('CLOCK_INVALID');return Math.floor(value/1000);}
function missingSource(source){return {...source,start_date:null,end_date:null,status:'MISSING',orders:null,paid_orders:null,expected_repass_cents:null,finance_oldest_at:null,finance_latest_at:null};}
function member(row){
 const evidence=row.evidence;
 return {order_hash:row.order_hash,source_hash:row.source_hash,checked_at:row.checked_at,bucket:row.bucket,payment_covered:row.payment_covered,escrow_raw:row.escrow_raw,currency:evidence?.currency??null,diagnostic:evidence?evidence.diagnostic:'MISSING',amounts:{escrow_amount_raw:evidence?.amounts.escrow_amount_raw??null,escrow_amount_after_adjustment_raw:evidence?.amounts.escrow_amount_after_adjustment_raw??null,total_adjustment_amount_raw:evidence?.amounts.total_adjustment_amount_raw??null}};
}
function sourceFromSnapshot(snapshot){
 const rows=snapshot.orders,selected=rows.filter(paid);let amount=0n,complete=true;
 for(const row of selected){const value=cents(row.escrow_raw);if(row.payment_covered!==1||value===null)complete=false;else amount+=value;}
 const expected=complete?safe(amount):null;if(complete&&expected===null)fail('ARITHMETIC_UNSAFE');
 return {run_id:snapshot.run.run_id,source_revision:snapshot.run.revision,start_date:snapshot.run.start_date,end_date:snapshot.run.end_date,status:'AVAILABLE',orders:rows.length,paid_orders:selected.length,expected_repass_cents:expected,finance_oldest_at:snapshot.run.source_checked_at.oldest_at,finance_latest_at:snapshot.run.source_checked_at.latest_at};
}
function validateBlock(value,selection,month,stamp){
 if(!exact(value,['source','members'])||!Array.isArray(value.members)||value.members.length>1000)fail('COHORT_STORAGE_INVALID');
 const source=value.source;
 if(!exact(source,['run_id','source_revision','start_date','end_date','status','orders','paid_orders','expected_repass_cents','finance_oldest_at','finance_latest_at'])||source.run_id!==selection.run_id||source.source_revision!==selection.source_revision||source.status!=='AVAILABLE'||!date(source.start_date)||!date(source.end_date)||source.start_date.slice(0,7)!==month||source.end_date.slice(0,7)!==month||source.end_date<source.start_date||(Date.parse(source.end_date)-Date.parse(source.start_date))/86400000>14||!integer(source.orders,0,1000)||source.orders!==value.members.length||!integer(source.paid_orders,0,source.orders)||source.expected_repass_cents!==null&&!integer(source.expected_repass_cents,Number.MIN_SAFE_INTEGER)||!integer(source.finance_oldest_at,1,stamp+60)||!integer(source.finance_latest_at,source.finance_oldest_at,stamp+60))fail('COHORT_STORAGE_INVALID');
 const seen=new Set();let amount=0n,complete=true,paidCount=0;
 for(const row of value.members){
  if(!exact(row,['order_hash','source_hash','checked_at','bucket','payment_covered','escrow_raw','currency','diagnostic','amounts'])||!digest(row.order_hash)||seen.has(row.order_hash)||!digest(row.source_hash)||!integer(row.checked_at,source.finance_oldest_at,source.finance_latest_at)||!['completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown'].includes(row.bucket)||![0,1].includes(row.payment_covered)||row.escrow_raw!==null&&cents(row.escrow_raw)===null||row.currency!==null&&(typeof row.currency!=='string'||!/^[A-Z]{3}$/.test(row.currency))||![null,'MISSING','PAYMENT_NOT_OBSERVED','INVALID','ADJUSTMENT_MISMATCH'].includes(row.diagnostic)||!exact(row.amounts,['escrow_amount_raw','escrow_amount_after_adjustment_raw','total_adjustment_amount_raw'])||!Object.values(row.amounts).every(value=>value===null||cents(value)!==null))fail('COHORT_STORAGE_INVALID');
  seen.add(row.order_hash);
  if(!paid(row)&&(row.payment_covered!==0||row.escrow_raw!==null)||row.payment_covered===0&&row.escrow_raw!==null||row.payment_covered===1&&row.escrow_raw===null)fail('COHORT_STORAGE_INVALID');
  if(paid(row)){paidCount++;const money=cents(row.escrow_raw);if(money===null||row.payment_covered!==1)complete=false;else amount+=money;}
 }
 if(paidCount!==source.paid_orders||source.expected_repass_cents!==(complete?safe(amount):null)||complete&&safe(amount)===null)fail('COHORT_STORAGE_INVALID');
 if(value.members.length&&(Math.min(...value.members.map(row=>row.checked_at))!==source.finance_oldest_at||Math.max(...value.members.map(row=>row.checked_at))!==source.finance_latest_at))fail('COHORT_STORAGE_INVALID');
 return {source:{...source},members:value.members.map(row=>({...row,amounts:{...row.amounts}}))};
}
function validateScope(blocks,month,{complete=true}={}){
 const ordered=[...blocks].sort((a,b)=>a.source.start_date.localeCompare(b.source.start_date)),seen=new Set();let expected=month+'-01',previousEnd=null;
 for(const block of ordered){if(complete&&block.source.start_date!==expected||previousEnd!==null&&block.source.start_date<=previousEnd)fail('COHORT_SCOPE_INVALID');expected=nextDay(block.source.end_date);previousEnd=block.source.end_date;for(const row of block.members){if(seen.has(row.order_hash))fail('COHORT_SCOPE_INVALID');seen.add(row.order_hash);}}
 return ordered;
}
async function savedCohort(db,key,selections,month,stamp){
 const rows=await db.batch([db.prepare('SELECT partner_id,shop_id,month,payload,payload_hash,created_at FROM finance_escrow_release_cohorts WHERE cohort_key=?').bind(key),db.prepare('SELECT slot_index,payload,payload_hash FROM finance_escrow_release_cohort_sources WHERE cohort_key=? ORDER BY slot_index').bind(key)]),header=rows[0]?.results?.[0],stored=rows[1]?.results??[];
 if(!header){if(stored.length)fail('COHORT_STORAGE_INVALID');return null;}
 if(header.partner_id!==identity[0]||header.shop_id!==identity[1]||header.month!==month||!integer(header.created_at,1,stamp+60)||typeof header.payload!=='string'||encoder.encode(header.payload).byteLength>8192||!digest(header.payload_hash)||await hash(header.payload)!==header.payload_hash)fail('COHORT_STORAGE_INVALID');
 let metadata;try{metadata=JSON.parse(header.payload);}catch{fail('COHORT_STORAGE_INVALID');}
 if(!exact(metadata,['schema','month','sources','blocks','created_at'])||metadata.schema!=='escrow_release_cohort_v1'||metadata.month!==month||metadata.created_at!==header.created_at||JSON.stringify(metadata.sources)!==JSON.stringify(selections)||!Array.isArray(metadata.blocks)||metadata.blocks.length!==selections.length||stored.length!==selections.length)fail('COHORT_STORAGE_INVALID');
 const blocks=[];
 for(let index=0;index<stored.length;index++){
  const row=stored[index],reference=metadata.blocks[index];if(!exact(reference,['slot_index','run_id','source_revision','payload_hash'])||reference.slot_index!==index||row.slot_index!==index||!digest(row.payload_hash)||row.payload_hash!==reference.payload_hash||typeof row.payload!=='string'||encoder.encode(row.payload).byteLength>1048576||await hash(row.payload)!==row.payload_hash)fail('COHORT_STORAGE_INVALID');
  const selected=selections.find(item=>item.run_id===reference.run_id&&item.source_revision===reference.source_revision);if(!selected)fail('COHORT_STORAGE_INVALID');let block;try{block=JSON.parse(row.payload);}catch{fail('COHORT_STORAGE_INVALID');}blocks.push(validateBlock(block,selected,month,stamp));
 }
 return validateScope(blocks,month);
}
async function cohort(env,db,selections,month,stamp,now){
 if(!selections.length)return {sources:[],members:[],complete:false};
 const key=await hash(JSON.stringify({identity,month,sources:selections})),cached=await savedCohort(db,key,selections,month,stamp);if(cached)return {sources:cached.map(row=>row.source),members:cached.flatMap(row=>row.members),complete:true};
 const blocks=[],sources=[];
 for(const selected of selections){
  let observed;try{observed=await readFinancialOrderEvidence(env,{run_id:selected.run_id},{now});}catch{sources.push(missingSource(selected));continue;}
  if(observed.run.revision!==selected.source_revision||observed.run.status!=='COMPLETE'||observed.run.start_date.slice(0,7)!==month||observed.run.end_date.slice(0,7)!==month){sources.push(missingSource(selected));continue;}
  const block=validateBlock({source:sourceFromSnapshot(observed),members:observed.orders.map(member)},selected,month,stamp);blocks.push(block);sources.push(block.source);
 }
 // An unavailable third window does not make conflicting known membership
 // safe. Validate identities and overlaps before returning any partial union;
 // only the contiguous-coverage requirement waits for all sources to exist.
 let ordered;try{ordered=validateScope(blocks,month,{complete:blocks.length===selections.length});}catch(error){if(error instanceof FinanceConnectionError&&error.code==='FINANCE_ESCROW_RELEASE_COHORT_SCOPE_INVALID')return {sources:selections.map(missingSource),members:[],complete:false};throw error;}
 if(blocks.length!==selections.length)return {sources,members:ordered.flatMap(row=>row.members),complete:false};
 const references=[],writes=[];
 for(let index=0;index<ordered.length;index++){
  const raw=JSON.stringify(ordered[index]);if(encoder.encode(raw).byteLength>1048576)fail('COHORT_LIMIT');const payloadHash=await hash(raw);references.push({slot_index:index,run_id:ordered[index].source.run_id,source_revision:ordered[index].source.source_revision,payload_hash:payloadHash});writes.push({raw,payloadHash,index});
 }
 const raw=JSON.stringify({schema:'escrow_release_cohort_v1',month,sources:selections,blocks:references,created_at:stamp}),payloadHash=await hash(raw);
 const obsolete='SELECT cohort_key FROM finance_escrow_release_cohorts WHERE partner_id=? AND shop_id=? AND month=? AND cohort_key<>? ORDER BY created_at DESC,cohort_key DESC LIMIT -1 OFFSET 7',obsoleteArgs=[...identity,month,key],guard='EXISTS(SELECT 1 FROM finance_escrow_release_cohorts WHERE cohort_key=? AND payload_hash=?)';
 // This is a bounded capture cache, separate from the release ledger. Keep
 // the current exact cohort even when multiple captures share a clock second.
 await db.batch([db.prepare('INSERT OR IGNORE INTO finance_escrow_release_cohorts(cohort_key,partner_id,shop_id,month,payload,payload_hash,created_at) VALUES(?,?,?,?,?,?,?)').bind(key,...identity,month,raw,payloadHash,stamp),...writes.map(row=>db.prepare('INSERT OR IGNORE INTO finance_escrow_release_cohort_sources(cohort_key,slot_index,payload,payload_hash) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM finance_escrow_release_cohorts WHERE cohort_key=? AND payload_hash=?)').bind(key,row.index,row.raw,row.payloadHash,key,payloadHash)),db.prepare('DELETE FROM finance_escrow_release_cohort_sources WHERE cohort_key IN('+obsolete+') AND '+guard).bind(...obsoleteArgs,key,payloadHash),db.prepare('DELETE FROM finance_escrow_release_cohorts WHERE cohort_key IN('+obsolete+') AND '+guard).bind(...obsoleteArgs,key,payloadHash)]);
 const stored=await savedCohort(db,key,selections,month,stamp);if(!stored)fail('COHORT_STORAGE_INVALID');return {sources:stored.map(row=>row.source),members:stored.flatMap(row=>row.members),complete:true};
}
function verifiedValue(row,observation){
 if(row.currency!=='BRL'||row.payment_covered!==1||row.diagnostic!==null)return null;
 const original=cents(row.escrow_raw),before=cents(row.amounts.escrow_amount_raw),after=cents(row.amounts.escrow_amount_after_adjustment_raw),delta=cents(row.amounts.total_adjustment_amount_raw),release=cents(observation.payout_raw);
 if(original===null||before!==original||release===null)return null;
 if(release===original||after!==null&&delta!==null&&before+delta===after&&release===after)return safe(release);
 return null;
}
function construct(month,stamp,source,ledger){
 const calendarSource=ledger.published??ledger.active??null,active=ledger.active??ledger.published??null,rows=calendarSource?.rows??ledger.rows??[],byOrder=new Map(),members=new Map(source.members.map(row=>[row.order_hash,row])),paidMembers=source.members.filter(paid);
 for(const row of rows){if(!digest(row.order_hash))fail('LEDGER_INVALID');const group=byOrder.get(row.order_hash)??[];group.push(row);byOrder.set(row.order_hash,group);}
 let ambiguous=0,located=0,ambiguousPaid=0,verified=0,expectedKnown=0n,expectedComplete=true,verifiedMoney=0n,financialMissing=false;
 for(const [orderHash,observations] of byOrder){
  const selected=members.get(orderHash);if(observations.length>1){ambiguous++;if(selected&&paid(selected))ambiguousPaid++;continue;}
  if(!selected||!paid(selected))continue;located++;const expected=cents(selected.escrow_raw);if(expected===null||selected.payment_covered!==1)expectedComplete=false;else expectedKnown+=expected;
  const amount=verifiedValue(selected,observations[0]);if(amount===null)financialMissing=true;else{verified++;verifiedMoney+=BigInt(amount);}
 }
 const knownExpected=safe(expectedKnown),knownVerified=safe(verifiedMoney);if(knownExpected===null||knownVerified===null)fail('ARITHMETIC_UNSAFE');
 const calendar={scan_id:calendarSource?.scan_id??null,status:calendarSource?.status??'MISSING',from_at:calendarSource?.time_from??null,end_before_at:calendarSource?.time_to??null,cutoff_at:calendarSource?.cutoff_at??null,source_oldest_at:calendarSource?.source_checked_at?.oldest_at??null,source_latest_at:calendarSource?.source_checked_at?.latest_at??null,observations:rows.length,unique_orders:byOrder.size,ambiguous_orders:ambiguous,verified_orders:verified,unverified_orders:byOrder.size-verified,known_verified_release_cents:knownVerified,total_release_cents:calendarSource?.status==='COMPLETE'&&ambiguous===0&&verified===byOrder.size?knownVerified:null};
 const complete=source.complete&&source.sources.length>0,expected=complete&&expectedComplete?knownExpected:null,released=calendarSource?.status==='COMPLETE'&&complete&&verified===located?knownVerified:null,difference=expected!==null&&released!==null?safe(BigInt(released)-BigInt(expected)):null;if(expected!==null&&released!==null&&difference===null)fail('ARITHMETIC_UNSAFE');
 const matching={status:complete?'AVAILABLE':'SOURCE_MISSING',paid_orders:complete?paidMembers.length:null,located_paid_orders:located,unlocated_paid_orders:complete?paidMembers.length-located-ambiguousPaid:null,ambiguous_paid_orders:ambiguousPaid,verified_paid_orders:verified,known_expected_located_cents:knownExpected,expected_located_cents:expected,known_verified_release_cents:knownVerified,verified_release_cents:released,comparison_difference_cents:difference,outside_cohort_orders:complete?byOrder.size-located-ambiguousPaid:null};
 const state=ledger.collection?.state??'IDLE',status=state==='IDLE'?(active?.status??'MISSING'):state==='RETRY_WAIT'?'RETRY_WAIT':state==='BLOCKED'?'BLOCKED':state==='LIMIT_REACHED'?'LIMIT_REACHED':'RUNNING';
 const collection={scan_id:active?.scan_id??null,status,cutoff_at:active?.cutoff_at??null,windows_total:active?.progress?.windows_total??0,windows_complete:active?.progress?.windows_complete??0,pages_read:active?.progress?.pages_read??0,observations:active?.progress?.rows_read??active?.rows?.length??0,next_attempt_at:ledger.collection?.next_attempt_at??0,diagnostic:ledger.collection?.code??null};
 const pending=['BANK_RECEIPT_NOT_VERIFIED'];if(!complete)pending.push('SOURCE_MISSING','MATCHING_INCOMPLETE');if(calendar.status!=='COMPLETE')pending.push('RELEASES_COLLECTING');if(ambiguous)pending.push('RELEASE_IDENTITY_AMBIGUOUS');if(calendar.unverified_orders)pending.push('RELEASE_AMOUNT_UNVERIFIED');if(collection.diagnostic!==null)pending.push('RELEASE_SOURCE_UNAVAILABLE');if(matching.status==='AVAILABLE'&&(matching.unlocated_paid_orders>0||ambiguousPaid>0||verified!==located))pending.push('MATCHING_INCOMPLETE');if(financialMissing||source.sources.some(row=>row.status==='AVAILABLE'&&row.expected_repass_cents===null))pending.push('FINANCIAL_EVIDENCE_MISSING');
 const finalStatus=collection.status==='BLOCKED'&&calendar.status!=='COMPLETE'?'BLOCKED':collection.status==='LIMIT_REACHED'&&calendar.status!=='COMPLETE'?'LIMIT_REACHED':calendar.status==='MISSING'||calendar.status==='RUNNING'?'COLLECTING':pending.length===1?'CHECKED':'PARTIAL';
 const value={schema:'finance_escrow_releases_v1',month,checked_at:stamp,status:finalStatus,sources:source.sources,calendar,collection,matching,pending,basis:'RELEASE_CALENDAR_AND_ORDER_CREATE_COHORT_NOT_BANK_RECEIPT'};
 const frame=projectEscrowReleaseFrame(value);if(!frame)fail('RESULT_INVALID');return frame;
}

export async function runFinanceEscrowReleases(env,options={}){
 if(!plain(options)||Reflect.ownKeys(options).some(key=>!['operation','month','sources','fetchImpl','now','timeoutMs'].includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(options,key)||{},'value')))fail('REQUEST_INVALID',400);
 const selection=projectEscrowReleaseRequest({operation:options.operation,month:options.month,sources:options.sources});if(!selection)fail('REQUEST_INVALID',400);
 const {now=()=>Date.now(),fetchImpl,timeoutMs=5000}=options,stamp=epoch(now),db=env?.FINANCE_DB;
 if(selection.month>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000)).slice(0,7))fail('REQUEST_INVALID',400);
 if(env?.FINANCE_CONNECTION_ENABLED!=='true'||typeof db?.prepare!=='function'||typeof db?.batch!=='function'||db===env.ADMIN_DB)fail('CONFIGURATION');
 if(!ready.has(db)){await db.batch(ESCROW_RELEASES_SCHEMA.map(sql=>db.prepare(sql)));ready.add(db);}
 const selections=[...selection.sources].sort((a,b)=>a.run_id.localeCompare(b.run_id)),source=await cohort(env,db,selections,selection.month,stamp,now);
 const ledger=await runEscrowReleaseLedger(env,{operation:selection.operation,month:selection.month,fetchImpl,now,timeoutMs});
 const checkedAt=Math.max(stamp,ledger.checked_at??stamp,...source.sources.filter(row=>row.status==='AVAILABLE').map(row=>row.finance_latest_at));
 return construct(selection.month,checkedAt,source,ledger);
}
