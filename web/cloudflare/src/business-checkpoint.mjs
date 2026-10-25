import {businessMonth,projectBusinessMonth} from './business-month.mjs';
import {enqueueCatalogClassifications} from './catalog-classification.mjs';

// Compact explanations, not a cash ledger. No order/customer identifiers or
// provider credentials are copied into this history.
export const BUSINESS_CHECKPOINT_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_checkpoint_state (month TEXT PRIMARY KEY NOT NULL,revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 2147483647),fingerprint TEXT NOT NULL,observed_at INTEGER NOT NULL,source_watermarks TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=16384))`,
 `CREATE TABLE IF NOT EXISTS business_checkpoint_history (month TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision BETWEEN 1 AND 2147483647),fingerprint TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=16384),PRIMARY KEY(month,revision))`,
];

export class BusinessCheckpointError extends Error {
 constructor(code,status=503){super(code);this.status=status;}
}

// Both interactive reads and the background collector use this entry point.
// A running page import is not a period checkpoint; completed/limited reads
// are kept even when expenses, returns or another input are still pending.
export async function businessMonthWithCheckpoint(env,input,services,options={}){
 const frame=await businessMonth(env,input,services,options);
 const items=[...new Set([...(frame.product_summary?.products||[]),...frame.unmapped_variants].map(row=>row.item_id))];
 if(items.length)await enqueueCatalogClassifications(env,items,{now:options.now||(()=>Date.now())});
 if(frame.status!=='RUNNING')await recordBusinessCheckpoint(env,frame);
 return frame;
}

// This function is also embedded in the browser after projectBusinessMonth.
// Keep every helper local so Wrangler cannot capture a server-only closure.
export function buildBusinessCheckpoint(frame){
 try{
  const value=projectBusinessMonth(frame);if(!value)return null;
  const adjustment=value.ads_adjustment_cents;
  const restore=adjustment===null||adjustment<0?null:adjustment===0||value.expenses.recharge_treatment==='TECH_SUPPORT'?0:value.expenses.recharge_treatment==='ADS_RECHARGE'?adjustment:null;
  return {
   schema:'business_checkpoint_v1',month:value.month,start_date:value.start_date,end_date:value.end_date,checked_at:value.checked_at,
   status:value.result.net_estimate_cents===null?'PENDING':'EXPECTED_READY',coverage:{...value.coverage},pending:[...value.result.pending],
   result:{expected_net_cents:value.result.net_estimate_cents,realized_net_cents:null,realization:'UNVERIFIED'},
   lines:[
    {code:'EXPECTED_PAYOUT',sign:1,amount_cents:value.expected_repass_cents},
    {code:'PRODUCTION',sign:-1,amount_cents:value.production_cost_cents},
    {code:'TAX',sign:-1,amount_cents:value.invoice_tax_cents},
    {code:'ADS_CONSUMPTION',sign:-1,amount_cents:value.ads?.status==='AVAILABLE'?value.ads.expense_cents:null},
    {code:'OTHER_EXPENSES',sign:-1,amount_cents:value.expenses.external_expenses_cents},
    {code:'ADS_RECHARGE_RESTORE',sign:1,amount_cents:restore},
   ],
   sales_cents:value.sales_cents,
   versions:{bindings:value.bindings_revision,costs:value.costs_revision,cost_rules:value.cost_rules_revision??null,tax_policy:value.tax?.policy_revision??null,expenses:value.expenses.revision,...(value.classification_revision===undefined?{}:{classifications:value.classification_revision})},
   source_checked_at:value.source_checked_at?{...value.source_checked_at}:{finance_oldest_at:null,finance_latest_at:null,ads_at:value.ads?.fetched_at??null},
   tax_regime:value.tax?.regime==='MEI'?'MEI':'LEGACY_ESTIMATE',recharge_treatment:value.expenses.recharge_treatment,
  };
 }catch{return null;}
}

const checkpointFail=(code,status=503)=>{throw new BusinessCheckpointError(code,status);};
const checkpointPlain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const checkpointExact=(value,keys)=>checkpointPlain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const checkpointArray=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'));
const checkpointInt=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
const checkpointCent=(value,signed=false)=>value===null||checkpointInt(value,signed?Number.MIN_SAFE_INTEGER:0);
const checkpointDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const checkpointMonth=value=>typeof value==='string'&&/^(?:[2-9][0-9]{3})-(?:0[1-9]|1[0-2])$/.test(value);
const checkpointCoverage=['orders','paid','completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown','payment_covered','payment_missing','returns','returns_unknown'];
const checkpointPending=['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','TAX_POLICY_REQUIRED','FINANCIAL_SOURCE_STALE'];
const checkpointLineCodes=['EXPECTED_PAYOUT','PRODUCTION','TAX','ADS_CONSUMPTION','OTHER_EXPENSES','ADS_RECHARGE_RESTORE'];
const checkpointRetention=128;
const checkpointReady=new WeakMap();

function checkpointProject(value){
 try{
  if(!checkpointExact(value,['schema','month','start_date','end_date','checked_at','status','coverage','pending','result','lines','sales_cents','versions','source_checked_at','tax_regime','recharge_treatment'])||value.schema!=='business_checkpoint_v1'||!checkpointMonth(value.month)||!checkpointDay(value.start_date)||value.start_date!==value.month+'-01'||!checkpointDay(value.end_date)||value.end_date.slice(0,7)!==value.month||!checkpointInt(value.checked_at,1,9999999999)||!['EXPECTED_READY','PENDING'].includes(value.status))return null;
  const currentDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000));if(value.end_date>currentDay)return null;
  const c=value.coverage;
  if(!checkpointExact(c,checkpointCoverage)||!checkpointCoverage.every(key=>checkpointInt(c[key],0,3000))||c.orders!==c.paid+c.cancelled+c.cancel_pending+c.unpaid+c.other+c.unknown||c.paid!==c.completed+c.ongoing||c.payment_covered+c.payment_missing!==c.paid||c.returns+c.returns_unknown>c.paid)return null;
  if(!checkpointArray(value.pending,checkpointPending.length)||new Set(value.pending).size!==value.pending.length||!value.pending.every(code=>checkpointPending.includes(code))||!checkpointExact(value.result,['expected_net_cents','realized_net_cents','realization'])||!checkpointCent(value.result.expected_net_cents,true)||value.result.realized_net_cents!==null||value.result.realization!=='UNVERIFIED')return null;
  if(!checkpointArray(value.lines,6)||value.lines.length!==6)return null;
  for(let index=0;index<6;index++){const line=value.lines[index];if(!checkpointExact(line,['code','sign','amount_cents'])||line.code!==checkpointLineCodes[index]||line.sign!==(index===0||index===5?1:-1)||!checkpointCent(line.amount_cents,index===0))return null;}
  const classified=Object.getOwnPropertyDescriptor(value.versions||{},'classifications');
  if(classified&&(!Object.hasOwn(classified,'value')||!checkpointInt(classified.value,1,2147483646)))return null;
  if(!checkpointCent(value.sales_cents)||!checkpointExact(value.versions,['bindings','costs','cost_rules','tax_policy','expenses',...(classified?['classifications']:[])])||!checkpointInt(value.versions.bindings,1,2147483647)||!checkpointInt(value.versions.costs,1,2147483647)||value.versions.cost_rules!==null&&!checkpointInt(value.versions.cost_rules,1,2147483646)||value.versions.tax_policy!==null&&!checkpointInt(value.versions.tax_policy,0,2147483647)||!checkpointInt(value.versions.expenses,0,2147483646))return null;
  const sources=value.source_checked_at;
  if(!checkpointExact(sources,['finance_oldest_at','finance_latest_at','ads_at'])||!Object.values(sources).every(at=>at===null||checkpointInt(at,1,value.checked_at))||(sources.finance_oldest_at===null)!==(sources.finance_latest_at===null)||sources.finance_oldest_at!==null&&sources.finance_oldest_at>sources.finance_latest_at)return null;
  if(!['MEI','LEGACY_ESTIMATE'].includes(value.tax_regime)||!['UNCONFIRMED','ADS_RECHARGE','TECH_SUPPORT'].includes(value.recharge_treatment)||value.tax_regime==='MEI'&&value.versions.tax_policy===null||value.tax_regime==='LEGACY_ESTIMATE'&&value.versions.tax_policy!==null||value.recharge_treatment==='TECH_SUPPORT'&&value.lines[5].amount_cents!==null&&value.lines[5].amount_cents!==0||value.recharge_treatment==='UNCONFIRMED'&&value.lines[5].amount_cents!==null&&value.lines[5].amount_cents!==0)return null;
  const has=code=>value.pending.includes(code);
  if(c.cancel_pending+c.other+c.unknown>0&&!has('STATUS_REVIEW_REQUIRED')||c.payment_missing>0&&!has('PAYMENT_INCOMPLETE')||c.returns+c.returns_unknown>0&&!has('RETURNS_NOT_RECONCILED')||value.lines[1].amount_cents===null&&!has('PRODUCTION_COST_INCOMPLETE')||value.lines[2].amount_cents===null&&!has('INVOICE_TAX_UNAVAILABLE')||value.lines[3].amount_cents===null&&!has('ADS_UNAVAILABLE')||value.lines[4].amount_cents===null&&!has('EXTERNAL_EXPENSES_REQUIRED')||value.lines[5].amount_cents===null&&!has('ADJUSTMENT_UNAVAILABLE')&&!has('RECHARGE_TREATMENT_REQUIRED')||value.tax_regime==='MEI'&&value.versions.tax_policy===0&&!has('TAX_POLICY_REQUIRED'))return null;
  const stale=value.month===currentDay.slice(0,7)&&sources.finance_oldest_at!==null&&value.checked_at-sources.finance_oldest_at>900;
  if(stale!==has('FINANCIAL_SOURCE_STALE'))return null;
  const expected=value.result.expected_net_cents,ready=expected!==null;
  if((value.status==='EXPECTED_READY')!==ready||ready&&(value.pending.length||value.sales_cents===null||value.lines.some(line=>line.amount_cents===null))||!ready&&!value.pending.length)return null;
  if(ready){const sum=value.lines.reduce((total,line)=>total+BigInt(line.sign)*BigInt(line.amount_cents),0n);if(sum!==BigInt(expected))return null;}
  return {schema:value.schema,month:value.month,start_date:value.start_date,end_date:value.end_date,checked_at:value.checked_at,status:value.status,coverage:{...c},pending:[...value.pending],result:{...value.result},lines:value.lines.map(line=>({...line})),sales_cents:value.sales_cents,versions:{...value.versions},source_checked_at:{...sources},tax_regime:value.tax_regime,recharge_treatment:value.recharge_treatment};
 }catch{return null;}
}

async function checkpointFingerprint(checkpoint){
 const {checked_at,source_checked_at,...semantic}=checkpoint;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(semantic)));
 return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function checkpointSetup(env){
 const db=env?.ADMIN_DB;if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function')checkpointFail('BUSINESS_CHECKPOINT_CONFIGURATION');
 if(!checkpointReady.has(db)){const ready=db.batch(BUSINESS_CHECKPOINT_SCHEMA.map(sql=>db.prepare(sql)));checkpointReady.set(db,ready);try{await ready;}catch{checkpointReady.delete(db);checkpointFail('BUSINESS_CHECKPOINT_UNAVAILABLE');}}
 else await checkpointReady.get(db);
 return db;
}

async function checkpointStored(row,month){
 if(!row||!checkpointInt(row.revision,1,2147483647)||typeof row.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(row.fingerprint)||typeof row.payload!=='string'||new TextEncoder().encode(row.payload).length>16384)checkpointFail('BUSINESS_CHECKPOINT_STORAGE_INVALID');
 let checkpoint;try{checkpoint=checkpointProject(JSON.parse(row.payload));}catch{}
 if(!checkpoint||checkpoint.month!==month||await checkpointFingerprint(checkpoint)!==row.fingerprint)checkpointFail('BUSINESS_CHECKPOINT_STORAGE_INVALID');
 return {revision:row.revision,fingerprint:row.fingerprint,checkpoint};
}

function checkpointWatermarks(raw,observedAt,checkpoint){
 let value;try{if(typeof raw!=='string'||raw.length>512)throw Error();value=JSON.parse(raw);}catch{checkpointFail('BUSINESS_CHECKPOINT_STORAGE_INVALID');}
 if(!checkpointExact(value,['finance_oldest_at','finance_latest_at','ads_at'])||!Object.values(value).every(at=>at===null||checkpointInt(at,1,observedAt))||(value.finance_oldest_at===null)!==(value.finance_latest_at===null)||value.finance_oldest_at!==null&&value.finance_oldest_at>value.finance_latest_at||Object.keys(value).some(key=>checkpoint.source_checked_at[key]!==null&&(value[key]===null||value[key]<checkpoint.source_checked_at[key])))checkpointFail('BUSINESS_CHECKPOINT_STORAGE_INVALID');
 return value;
}

async function checkpointHead(db,month){
 const rows=await db.batch([
  db.prepare('SELECT revision,fingerprint,observed_at,source_watermarks,payload FROM business_checkpoint_state WHERE month=?').bind(month),
  db.prepare('SELECT revision,fingerprint,payload FROM business_checkpoint_history WHERE month=? ORDER BY revision DESC LIMIT 1').bind(month),
 ]);
 const state=rows[0]?.results?.[0]??null,history=rows[1]?.results?.[0]??null;
 if(!state){if(history)checkpointFail('BUSINESS_CHECKPOINT_STORAGE_INVALID');return null;}
 const record=await checkpointStored(state,month);
 if(!history||history.revision!==state.revision||history.fingerprint!==state.fingerprint||history.payload!==state.payload||!checkpointInt(state.observed_at,record.checkpoint.checked_at,9999999999))checkpointFail('BUSINESS_CHECKPOINT_STORAGE_INVALID');
 return {...record,observed_at:state.observed_at,payload:state.payload,source_watermarks:checkpointWatermarks(state.source_watermarks,state.observed_at,record.checkpoint),source_watermarks_raw:state.source_watermarks};
}

export async function recordBusinessCheckpoint(env,frame){
 const checkpoint=checkpointProject(buildBusinessCheckpoint(frame));if(!checkpoint)checkpointFail('BUSINESS_CHECKPOINT_INVALID',400);
 const raw=JSON.stringify(checkpoint);if(new TextEncoder().encode(raw).length>16384)checkpointFail('BUSINESS_CHECKPOINT_INVALID',400);
 try{
  const db=await checkpointSetup(env),fingerprint=await checkpointFingerprint(checkpoint);
  for(let attempt=0;attempt<4;attempt++){
   const current=await checkpointHead(db,checkpoint.month);
   // Two requests may finish in the same second, or a newer server read may
   // still contain an older configuration snapshot. Never let either revert
   // a version already observed. Incomparable vectors wait for a combined
   // snapshot instead of combining values from different reads here.
   const regressed=current&&[...new Set([...Object.keys(checkpoint.versions),...Object.keys(current.checkpoint.versions)])].some(key=>(checkpoint.versions[key]??0)<(current.checkpoint.versions[key]??0));
   const olderSource=current&&Object.keys(checkpoint.source_checked_at).some(key=>checkpoint.source_checked_at[key]!==null&&current.source_watermarks[key]!==null&&checkpoint.source_checked_at[key]<current.source_watermarks[key]);
   if(current&&(checkpoint.checked_at<current.observed_at||regressed||olderSource))return {revision:current.revision,fingerprint:current.fingerprint,checkpoint:current.checkpoint};
   const watermarks=Object.fromEntries(Object.keys(checkpoint.source_checked_at).map(key=>[key,checkpoint.source_checked_at[key]===null?current?.source_watermarks[key]??null:current?.source_watermarks[key]===null||!current?checkpoint.source_checked_at[key]:Math.max(checkpoint.source_checked_at[key],current.source_watermarks[key])])),watermarksRaw=JSON.stringify(watermarks);
   if(current?.fingerprint===fingerprint){
    if(checkpoint.checked_at===current.observed_at&&watermarksRaw===current.source_watermarks_raw)return {revision:current.revision,fingerprint:current.fingerprint,checkpoint:current.checkpoint};
    const updated=await db.prepare('UPDATE business_checkpoint_state SET observed_at=?,source_watermarks=? WHERE month=? AND revision=? AND fingerprint=? AND observed_at=? AND source_watermarks=?').bind(checkpoint.checked_at,watermarksRaw,checkpoint.month,current.revision,current.fingerprint,current.observed_at,current.source_watermarks_raw).run();
    if(updated?.meta?.changes===1)return {revision:current.revision,fingerprint:current.fingerprint,checkpoint:current.checkpoint};
    continue;
   }
   const revision=(current?.revision??0)+1;if(!checkpointInt(revision,1,2147483647))checkpointFail('BUSINESS_CHECKPOINT_REVISION_LIMIT');
   const mutation=current?
    db.prepare('UPDATE business_checkpoint_state SET revision=?,fingerprint=?,observed_at=?,source_watermarks=?,payload=? WHERE month=? AND revision=? AND fingerprint=? AND observed_at=? AND source_watermarks=?').bind(revision,fingerprint,checkpoint.checked_at,watermarksRaw,raw,checkpoint.month,current.revision,current.fingerprint,current.observed_at,current.source_watermarks_raw):
    db.prepare('INSERT OR IGNORE INTO business_checkpoint_state(month,revision,fingerprint,observed_at,source_watermarks,payload) VALUES(?,1,?,?,?,?)').bind(checkpoint.month,fingerprint,checkpoint.checked_at,watermarksRaw,raw);
   const results=await db.batch([
    mutation,
    db.prepare('INSERT INTO business_checkpoint_history(month,revision,fingerprint,payload) SELECT month,revision,fingerprint,payload FROM business_checkpoint_state WHERE changes()=1 AND month=? AND revision=? AND fingerprint=? AND observed_at=? AND source_watermarks=? AND payload=?').bind(checkpoint.month,revision,fingerprint,checkpoint.checked_at,watermarksRaw,raw),
    db.prepare('DELETE FROM business_checkpoint_history WHERE month=? AND revision<=(SELECT revision-? FROM business_checkpoint_state WHERE month=?)').bind(checkpoint.month,checkpointRetention,checkpoint.month),
   ]);
   if(results[0]?.meta?.changes!==1)continue;
   if(results[1]?.meta?.changes!==1)checkpointFail('BUSINESS_CHECKPOINT_STORAGE_INVALID');
   return {revision,fingerprint,checkpoint};
  }
  checkpointFail('BUSINESS_CHECKPOINT_CHANGED_RETRY',409);
 }catch(error){if(error instanceof BusinessCheckpointError)throw error;checkpointFail('BUSINESS_CHECKPOINT_UNAVAILABLE');}
}

export async function readBusinessCheckpoints(env,input){
 if(!checkpointPlain(input))checkpointFail('BUSINESS_CHECKPOINT_REQUEST_INVALID',400);
 const hasLimit=Object.hasOwn(input,'limit');
 if(!checkpointExact(input,hasLimit?['month','limit']:['month'])||!checkpointMonth(input.month)||input.month>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7)||hasLimit&&!checkpointInt(input.limit,1,20))checkpointFail('BUSINESS_CHECKPOINT_REQUEST_INVALID',400);
 try{
  const db=await checkpointSetup(env),limit=hasLimit?input.limit:10;
  // The head and visible history are read in the same D1 snapshot.
  const rows=await db.batch([
   db.prepare('SELECT revision,fingerprint,observed_at,source_watermarks,payload FROM business_checkpoint_state WHERE month=?').bind(input.month),
   db.prepare('SELECT revision,fingerprint,payload FROM business_checkpoint_history WHERE month=? ORDER BY revision DESC LIMIT ?').bind(input.month,limit),
  ]);
  const state=rows[0]?.results?.[0]??null,history=rows[1]?.results;
  if(!Array.isArray(history)||history.length>limit)checkpointFail('BUSINESS_CHECKPOINT_STORAGE_INVALID');
  if(!state){if(history.length)checkpointFail('BUSINESS_CHECKPOINT_STORAGE_INVALID');return {schema:'business_checkpoint_history_v1',month:input.month,retention_limit:checkpointRetention,checkpoints:[]};}
  const head=await checkpointStored(state,input.month);
  if(!checkpointInt(state.observed_at,head.checkpoint.checked_at,9999999999)||history.length!==Math.min(limit,state.revision,checkpointRetention)||history[0].revision!==state.revision||history[0].fingerprint!==state.fingerprint||history[0].payload!==state.payload)checkpointFail('BUSINESS_CHECKPOINT_STORAGE_INVALID');
  checkpointWatermarks(state.source_watermarks,state.observed_at,head.checkpoint);
  const checkpoints=[];let previousAt=Number.MAX_SAFE_INTEGER;
  for(let index=0;index<history.length;index++){
   const record=await checkpointStored(history[index],input.month);
   if(record.revision!==state.revision-index||record.checkpoint.checked_at>previousAt)checkpointFail('BUSINESS_CHECKPOINT_STORAGE_INVALID');
   previousAt=record.checkpoint.checked_at;checkpoints.push(record);
  }
  return {schema:'business_checkpoint_history_v1',month:input.month,retention_limit:checkpointRetention,checkpoints};
 }catch(error){if(error instanceof BusinessCheckpointError)throw error;checkpointFail('BUSINESS_CHECKPOINT_UNAVAILABLE');}
}
