import {getFinanceProfile,FinanceConnectionError} from './connection-store.mjs';
import {projectBusinessPeriodRequest} from './business-period-frame.mjs';

// Retention follows explicit private publication/cohort references, never GET
// traffic or refresh frequency. A durable prepared candidate cannot displace
// the confirmed publication before the App acknowledges its own atomic swap.
export const BUSINESS_PERIOD_RETENTION_GRACE_SECONDS=3600;
export const BUSINESS_PERIOD_COHORT_LEASE_SECONDS=900;
export const BUSINESS_PERIOD_MAX_ACTIVE_COHORT_LEASES=64;
export const BUSINESS_PERIOD_MAX_PENDING_PUBLICATIONS=64;
export const BUSINESS_PERIOD_RETENTION_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS finance_business_period_retentions(partner_id INTEGER NOT NULL,shop_id INTEGER NOT NULL,month TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('PUBLICATION','PENDING','GRACE','COHORT')),reference_key TEXT NOT NULL,publication_revision INTEGER NOT NULL CHECK(publication_revision BETWEEN 1 AND 2147483647),payload TEXT NOT NULL CHECK(json_valid(payload) AND length(CAST(payload AS BLOB))<=4096),write_token TEXT NOT NULL,lease_id TEXT,expires_at INTEGER,retained_at INTEGER NOT NULL,CHECK((kind='PUBLICATION' AND reference_key='PUBLICATION' AND lease_id IS NULL AND expires_at IS NULL) OR (kind='PENDING' AND reference_key='PENDING:'||publication_revision AND lease_id IS NULL AND expires_at IS NULL) OR (kind='GRACE' AND reference_key='GRACE' AND lease_id IS NULL AND expires_at IS NOT NULL) OR (kind='COHORT' AND reference_key=lease_id AND lease_id IS NOT NULL AND expires_at IS NOT NULL)),PRIMARY KEY(partner_id,shop_id,month,reference_key))`,
];
const fail=(suffix,status=400)=>{throw new FinanceConnectionError('FINANCE_BUSINESS_RETENTION_'+suffix,status);};
const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const integer=(value,min=1,max=2147483647)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const month=value=>typeof value==='string'&&/^20\d\d-(0[1-9]|1[0-2])$/.test(value);
const dense=value=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length>=1&&value.length<=3&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,i)=>Object.getOwnPropertyDescriptor(value,String(i))).every(d=>d&&Object.hasOwn(d,'value'));

export function projectFinanceBusinessPeriodRetentionRequest(value){
 try{
  if(!plain(value)||!['PUBLICATION','COHORT'].includes(value.kind)||!exact(value,['kind','month','publication_revision','slots',...(value.kind==='COHORT'?['lease_id']:[])])||!month(value.month)||!integer(value.publication_revision)||!dense(value.slots)||value.kind==='COHORT'&&!uuid(value.lease_id))return null;
  const seen=new Set(),slots=[];
  for(let index=0;index<value.slots.length;index++){
   const slot=value.slots[index];if(!exact(slot,['slot_index','run_id','revision','start_date','end_date'])||slot.slot_index!==index||!uuid(slot.run_id)||seen.has(slot.run_id)||!integer(slot.revision)||!projectBusinessPeriodRequest({operation:'start',start_date:slot.start_date,end_date:slot.end_date})||slot.start_date!==value.month+'-'+String(index*15+1).padStart(2,'0')||slot.end_date.slice(0,7)!==value.month||index<value.slots.length-1&&Number(slot.end_date.slice(8))!==index*15+15)return null;
   seen.add(slot.run_id);slots.push({slot_index:index,run_id:slot.run_id,revision:slot.revision,start_date:slot.start_date,end_date:slot.end_date});
  }
  return {kind:value.kind,month:value.month,publication_revision:value.publication_revision,slots,...(value.kind==='COHORT'?{lease_id:value.lease_id}:{})};
 }catch{return null;}
}

export function projectFinanceBusinessPeriodCohortReleaseRequest(value){
 try{return exact(value,['month','lease_id'])&&month(value.month)&&uuid(value.lease_id)?{month:value.month,lease_id:value.lease_id}:null;}catch{return null;}
}

export function projectFinanceBusinessPeriodRetentionFrame(value){
 try{
  if(value?.state==='RELEASED')return exact(value,['schema','state','kind','month','lease_id','released','released_at'])&&value.schema==='finance_business_period_retention_v1'&&value.kind==='COHORT'&&month(value.month)&&uuid(value.lease_id)&&typeof value.released==='boolean'&&integer(value.released_at,1,9999999999)?{...value}:null;
  if(!exact(value,['schema','state','kind','month','publication_revision','retained_slots','retained_at','lease_id','expires_at'])||value.schema!=='finance_business_period_retention_v1'||!['PREPARED','RETAINED'].includes(value.state)||!['PUBLICATION','COHORT'].includes(value.kind)||value.state==='PREPARED'&&value.kind!=='PUBLICATION'||!month(value.month)||!integer(value.publication_revision)||!integer(value.retained_slots,1,3)||!integer(value.retained_at,1,9999999999))return null;
  if(value.kind==='PUBLICATION'?(value.lease_id!==null||value.expires_at!==null):(!uuid(value.lease_id)||!integer(value.expires_at,value.retained_at+1,9999999999)))return null;
  return {...value};
 }catch{return null;}
}

// The alias is internal SQL, never supplied by a browser or private caller.
export function businessPeriodUnpinnedRun(alias,stamp){
 if(!/^[a-z][a-z0-9_]*$/.test(alias)||!integer(stamp,1,9999999999))fail('CONFIGURATION',503);
 return {sql:'NOT EXISTS(SELECT 1 FROM finance_business_period_retentions p,json_each(p.payload) slot WHERE p.partner_id='+alias+'.partner_id AND p.shop_id='+alias+'.shop_id AND (p.kind IN (\'PUBLICATION\',\'PENDING\') OR p.expires_at>?) AND json_extract(slot.value,\'$.run_id\')='+alias+'.run_id)',values:[stamp]};
}

function context(env,now){
 const db=env?.FINANCE_DB;if(env?.FINANCE_CONNECTION_ENABLED!=='true'||typeof db?.prepare!=='function'||typeof db?.batch!=='function'||env.ADMIN_DB===db||typeof now!=='function')fail('CONFIGURATION',503);
 let milliseconds;try{milliseconds=now();}catch{fail('CLOCK_CONFIGURATION',503);}
 if(!integer(milliseconds,1,9999999999999))fail('CLOCK_CONFIGURATION',503);
 const stamp=Math.floor(milliseconds/1000);if(!integer(stamp,1,9999999999))fail('CLOCK_CONFIGURATION',503);
 const profile=getFinanceProfile(env),identity=[profile.partner_id,profile.shop_id];
 return {db,stamp,identity,prepare:(sql,args=[])=>db.prepare(sql).bind(...args)};
}
const protectedWork=async work=>{try{return await work();}catch(error){if(error instanceof FinanceConnectionError)throw error;fail('STORAGE_UNAVAILABLE',503);}};
const ack=(input,row,prepared=false)=>({schema:'finance_business_period_retention_v1',state:prepared?'PREPARED':'RETAINED',kind:input.kind,month:input.month,publication_revision:row.publication_revision,retained_slots:input.slots.length,retained_at:row.retained_at,lease_id:row.lease_id,expires_at:row.expires_at});

async function retainBusinessPeriod(env,value,{now=()=>Date.now()}={},publicationPhase='PREPARE'){
 const input=projectFinanceBusinessPeriodRetentionRequest(value);if(!input)fail('REQUEST_INVALID');
 const {db,stamp,identity,prepare}=context(env,now),payload=JSON.stringify(input.slots),pendingKey='PENDING:'+input.publication_revision,referenceKey=input.kind==='COHORT'?input.lease_id:publicationPhase==='PREPARE'?pendingKey:'PUBLICATION',today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(stamp*1000));
 if(input.slots.at(-1).end_date>today)fail('REQUEST_INVALID');
 return protectedWork(async()=>{
  await db.batch([...BUSINESS_PERIOD_RETENTION_SCHEMA.map(sql=>db.prepare(sql)),prepare("DELETE FROM finance_business_period_retentions WHERE partner_id=? AND shop_id=? AND month=? AND kind='COHORT' AND expires_at<=? AND reference_key<>?",[...identity,input.month,stamp,referenceKey])]);
  const manifests=await prepare('SELECT * FROM finance_business_period_retentions WHERE partner_id=? AND shop_id=? AND month=?',[...identity,input.month]).all();
  if(!Array.isArray(manifests.results)||manifests.results.length>BUSINESS_PERIOD_MAX_ACTIVE_COHORT_LEASES+BUSINESS_PERIOD_MAX_PENDING_PUBLICATIONS+3)fail('STORAGE_INVALID',503);
  const rows=new Map();
  for(const row of manifests.results){
   let slots;try{slots=JSON.parse(row.payload);}catch{fail('STORAGE_INVALID',503);}
   const kind=['GRACE','PENDING'].includes(row.kind)?'PUBLICATION':row.kind,expectedKey=row.kind==='COHORT'?row.lease_id:row.kind==='PENDING'?'PENDING:'+row.publication_revision:row.kind;
   if(rows.has(row.reference_key)||!['PUBLICATION','PENDING','GRACE','COHORT'].includes(row.kind)||row.reference_key!==expectedKey||!uuid(row.write_token)||!integer(row.retained_at,1,stamp+60)||!projectFinanceBusinessPeriodRetentionRequest({kind,month:row.month,publication_revision:row.publication_revision,slots,...(kind==='COHORT'?{lease_id:row.lease_id}:{})}))fail('STORAGE_INVALID',503);
   if(['PUBLICATION','PENDING'].includes(row.kind)?row.lease_id!==null||row.expires_at!==null:!integer(row.expires_at,row.retained_at+1,9999999999)||row.kind==='GRACE'&&row.lease_id!==null)fail('STORAGE_INVALID',503);
   rows.set(row.reference_key,row);
  }
  const previous=rows.get(referenceKey),confirmed=rows.get('PUBLICATION'),pending=rows.get(pendingKey),grace=rows.get('GRACE');
  if(input.kind==='PUBLICATION'){
   if(confirmed&&(confirmed.publication_revision>input.publication_revision||confirmed.publication_revision===input.publication_revision&&confirmed.payload!==payload)||pending&&pending.payload!==payload)fail('CONFLICT',409);
   if(confirmed&&JSON.parse(confirmed.payload).at(-1).end_date>input.slots.at(-1).end_date)fail('SOURCE_MISMATCH',409);
   if(publicationPhase==='CONFIRM'&&confirmed?.publication_revision!==input.publication_revision&&!pending)fail('NOT_PREPARED',409);
   if(publicationPhase==='CONFIRM'&&confirmed&&confirmed.payload!==payload&&grace?.expires_at>stamp&&grace.payload!==confirmed.payload)fail('GRACE_BUSY',409);
   if(publicationPhase==='PREPARE'&&!pending&&confirmed?.publication_revision!==input.publication_revision&&[...rows.values()].filter(row=>row.kind==='PENDING').length>=BUSINESS_PERIOD_MAX_PENDING_PUBLICATIONS)fail('PENDING_LIMIT',409);
  }
  if(input.kind==='COHORT'&&previous){
   if(previous.publication_revision!==input.publication_revision||previous.payload!==payload)fail('LEASE_CONFLICT',409);
  }
  const activeCohorts=[...rows.values()].filter(row=>row.kind==='COHORT'&&row.expires_at>stamp).length;
  if(input.kind==='COHORT'&&!(previous?.expires_at>stamp)&&activeCohorts>=BUSINESS_PERIOD_MAX_ACTIVE_COHORT_LEASES)fail('LEASE_LIMIT',409);
  const runSql='SELECT run_id,revision,status,start_date,end_date FROM finance_business_period_runs WHERE partner_id=? AND shop_id=? AND run_id IN ('+input.slots.map(()=>'?').join(',')+')';
  const runs=await prepare(runSql,[...identity,...input.slots.map(slot=>slot.run_id)]).all();
  for(const slot of input.slots){const row=runs.results?.find(row=>row.run_id===slot.run_id);if(!row)fail('RUN_NOT_FOUND',404);if(row.status!=='COMPLETE'||row.revision!==slot.revision||row.start_date!==slot.start_date||row.end_date!==slot.end_date)fail('SOURCE_MISMATCH',409);}
  if(input.kind==='PUBLICATION'&&confirmed?.publication_revision===input.publication_revision)return ack(input,confirmed,publicationPhase==='PREPARE');
  if(input.kind==='PUBLICATION'&&publicationPhase==='PREPARE'&&pending)return ack(input,pending,true);
  // Revalidate every source inside the same transaction as the manifest CAS.
  const sourceGuard=input.slots.map(()=>"EXISTS(SELECT 1 FROM finance_business_period_runs WHERE partner_id=? AND shop_id=? AND run_id=? AND revision=? AND status='COMPLETE' AND start_date=? AND end_date=?)").join(' AND '),sourceArgs=input.slots.flatMap(slot=>[...identity,slot.run_id,slot.revision,slot.start_date,slot.end_date]);
  const casFor=(kind,key,row)=>({sql:(row?'EXISTS':'NOT EXISTS')+'(SELECT 1 FROM finance_business_period_retentions WHERE partner_id=? AND shop_id=? AND month=? AND kind=? AND reference_key=?'+(row?' AND write_token=?':'')+')',values:[...identity,input.month,kind,key,...(row?[row.write_token]:[])]});
  const storedKind=input.kind==='COHORT'?'COHORT':publicationPhase==='PREPARE'?'PENDING':'PUBLICATION',claim=casFor(storedKind,referenceKey,previous),confirmedClaim=casFor('PUBLICATION','PUBLICATION',confirmed);
  let cas=claim.sql,casArgs=claim.values;
  if(input.kind==='PUBLICATION'){const other=publicationPhase==='PREPARE'?confirmedClaim:casFor('PENDING',pendingKey,pending);cas+=' AND '+other.sql;casArgs=[...casArgs,...other.values];}
  const writeToken=crypto.randomUUID(),writes=[],columns='partner_id,shop_id,month,kind,reference_key,publication_revision,payload,write_token,lease_id,expires_at,retained_at';
  const upsert=' ON CONFLICT(partner_id,shop_id,month,reference_key) DO UPDATE SET publication_revision=excluded.publication_revision,payload=excluded.payload,write_token=excluded.write_token,lease_id=excluded.lease_id,expires_at=excluded.expires_at,retained_at=excluded.retained_at';
  let graceGuard='',graceArgs=[];
  if(input.kind==='PUBLICATION'&&publicationPhase==='CONFIRM'&&confirmed&&confirmed.payload!==payload){
   writes.push(prepare('INSERT INTO finance_business_period_retentions('+columns+') SELECT ?,?,?,?,?,?,?,?,NULL,?,? WHERE '+cas+' AND '+sourceGuard+" AND NOT EXISTS(SELECT 1 FROM finance_business_period_retentions WHERE partner_id=? AND shop_id=? AND month=? AND kind='GRACE' AND expires_at>? AND payload<>?)"+upsert,[...identity,input.month,'GRACE','GRACE',confirmed.publication_revision,confirmed.payload,writeToken,stamp+BUSINESS_PERIOD_RETENTION_GRACE_SECONDS,stamp,...casArgs,...sourceArgs,...identity,input.month,stamp,confirmed.payload]));
   graceGuard=" AND EXISTS(SELECT 1 FROM finance_business_period_retentions WHERE partner_id=? AND shop_id=? AND month=? AND kind='GRACE' AND write_token=?)";graceArgs=[...identity,input.month,writeToken];
  }
  const leaseId=input.kind==='COHORT'?input.lease_id:null,expiresAt=input.kind==='COHORT'?stamp+BUSINESS_PERIOD_COHORT_LEASE_SECONDS:null;
  const capacityGuard=input.kind==='COHORT'?" AND ((SELECT COUNT(*) FROM finance_business_period_retentions WHERE partner_id=? AND shop_id=? AND month=? AND kind='COHORT' AND expires_at>?)<? OR EXISTS(SELECT 1 FROM finance_business_period_retentions WHERE partner_id=? AND shop_id=? AND month=? AND kind='COHORT' AND reference_key=? AND expires_at>?))":storedKind==='PENDING'?" AND (SELECT COUNT(*) FROM finance_business_period_retentions WHERE partner_id=? AND shop_id=? AND month=? AND kind='PENDING')<?":'',capacityArgs=input.kind==='COHORT'?[...identity,input.month,stamp,BUSINESS_PERIOD_MAX_ACTIVE_COHORT_LEASES,...identity,input.month,referenceKey,stamp]:storedKind==='PENDING'?[...identity,input.month,BUSINESS_PERIOD_MAX_PENDING_PUBLICATIONS]:[];
  const commitIndex=writes.length;
  writes.push(prepare('INSERT INTO finance_business_period_retentions('+columns+') SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE '+cas+' AND '+sourceGuard+graceGuard+capacityGuard+upsert,[...identity,input.month,storedKind,referenceKey,input.publication_revision,payload,writeToken,leaseId,expiresAt,stamp,...casArgs,...sourceArgs,...graceArgs,...capacityArgs]));
  if(input.kind==='PUBLICATION'&&publicationPhase==='CONFIRM')writes.push(prepare("DELETE FROM finance_business_period_retentions WHERE partner_id=? AND shop_id=? AND month=? AND kind='PENDING' AND publication_revision<=? AND EXISTS(SELECT 1 FROM finance_business_period_retentions WHERE partner_id=? AND shop_id=? AND month=? AND kind='PUBLICATION' AND write_token=?)",[...identity,input.month,input.publication_revision,...identity,input.month,writeToken]));
  const written=await db.batch(writes);if(written[commitIndex]?.meta?.changes!==1)fail('CONFLICT',409);
  return ack(input,{publication_revision:input.publication_revision,retained_at:stamp,lease_id:leaseId,expires_at:expiresAt},storedKind==='PENDING');
 });
}

/** Compatibility name: PUBLICATION only prepares; it never commits App state. */
export async function retainFinanceBusinessPeriodPublication(env,input,options){return retainBusinessPeriod(env,input,options);}
export async function prepareFinanceBusinessPeriodPublication(env,input,options){if(input?.kind!=='PUBLICATION')fail('REQUEST_INVALID');return retainBusinessPeriod(env,input,options);}
/** Call only after App CAS success or reading its durable publication outbox. */
export async function confirmFinanceBusinessPeriodPublication(env,input,options){if(input?.kind!=='PUBLICATION')fail('REQUEST_INVALID');return retainBusinessPeriod(env,input,options,'CONFIRM');}

/** A completed/stopped cohort may release only its own lease token. */
export async function releaseFinanceBusinessPeriodCohort(env,value,{now=()=>Date.now()}={}){
 const input=projectFinanceBusinessPeriodCohortReleaseRequest(value);if(!input)fail('REQUEST_INVALID');
 const {db,stamp,identity,prepare}=context(env,now);
 return protectedWork(async()=>{
  await db.batch(BUSINESS_PERIOD_RETENTION_SCHEMA.map(sql=>db.prepare(sql)));
  const result=await prepare("DELETE FROM finance_business_period_retentions WHERE partner_id=? AND shop_id=? AND month=? AND kind='COHORT' AND lease_id=?",[...identity,input.month,input.lease_id]).run();
  return {schema:'finance_business_period_retention_v1',state:'RELEASED',kind:'COHORT',month:input.month,lease_id:input.lease_id,released:result.meta.changes===1,released_at:stamp};
 });
}
