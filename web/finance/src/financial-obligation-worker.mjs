import {isCommercialContext,assertCommercialCapability} from '../../cloudflare/src/commercial-context.mjs';
import {tenantDatabaseHasContext} from '../../cloudflare/src/tenant-storage.mjs';
import {financialCanonicalJSON,financialDigest} from '../../cloudflare/src/financial-event-ledger.mjs';
import {FinancialCashAllocationError,financialAllocationScope} from './financial-cash-allocation.mjs';
import {FINANCIAL_OBLIGATION_PATH,FINANCIAL_OBLIGATION_REQUEST_MAXIMUM,FINANCIAL_OBLIGATION_RESPONSE_MAXIMUM,FINANCIAL_OBLIGATION_FRESHNESS_SECONDS,projectFinancialObligationSnapshot,projectFinancialObligationRequest,projectFinancialObligationResponse,financialObligationSnapshotHash,financialObligationResponseMatches} from './financial-obligation-frame.mjs';

export {FINANCIAL_OBLIGATION_PATH};
export const FINANCIAL_OBLIGATION_SCHEMA=Object.freeze([
  'CREATE TABLE IF NOT EXISTS finance_financial_obligation_state(tenant TEXT PRIMARY KEY,revision INTEGER NOT NULL CHECK(revision>=0))',
  'CREATE TABLE IF NOT EXISTS finance_financial_obligation_snapshots(tenant TEXT NOT NULL,snapshot_id TEXT NOT NULL,month TEXT NOT NULL,source_revision INTEGER NOT NULL,source_hash TEXT NOT NULL,captured_at TEXT NOT NULL,registered_at TEXT NOT NULL,payload_json TEXT NOT NULL CHECK(length(CAST(payload_json AS BLOB))<=131072),actor_id TEXT NOT NULL,PRIMARY KEY(tenant,snapshot_id))',
  'CREATE INDEX IF NOT EXISTS finance_financial_obligation_snapshot_month ON finance_financial_obligation_snapshots(tenant,month,source_revision)',
  'CREATE TABLE IF NOT EXISTS finance_financial_obligation_heads(tenant TEXT NOT NULL,month TEXT NOT NULL,revision INTEGER NOT NULL,snapshot_id TEXT NOT NULL,source_revision INTEGER NOT NULL,source_hash TEXT NOT NULL,captured_at TEXT NOT NULL,PRIMARY KEY(tenant,month))',
  'CREATE TABLE IF NOT EXISTS finance_financial_obligation_requests(tenant TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,response_json TEXT NOT NULL,PRIMARY KEY(tenant,request_id))',
  'CREATE TABLE IF NOT EXISTS finance_financial_obligation_guard(tenant TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))',
  ...['snapshots','requests'].flatMap(name=>['UPDATE','DELETE'].map(operation=>`CREATE TRIGGER IF NOT EXISTS finance_financial_obligation_${name}_no_${operation.toLowerCase()} BEFORE ${operation} ON finance_financial_obligation_${name} BEGIN SELECT RAISE(ABORT,'financial_obligation_immutable'); END`)),
]);
const fail=(code,status=503)=>{throw new FinancialCashAllocationError('OBLIGATION_'+code,status);};
const canonicalSql=sql=>sql.replace(/\bIF NOT EXISTS\s+/i,'').replace(/\s+/g,' ').trim().replace(/;$/,'');
const objects=new Map(FINANCIAL_OBLIGATION_SCHEMA.map(sql=>{const[,type,name]=/^CREATE (TABLE|INDEX|TRIGGER) IF NOT EXISTS ([a-z_]+)/.exec(sql);return[name,{type:type.toLowerCase(),sql:canonicalSql(sql)}];}));
const headers={'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; frame-ancestors 'none'"};
const token=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const sameScope=(a,b)=>a.organization_id===b.organization_id&&a.store_id===b.store_id&&a.currency===b.currency;
const tenantFor=scope=>JSON.stringify(Object.values(financialAllocationScope(scope)));
const recordPattern=/^obligation:([a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/;
export const isFinancialObligationRecordId=value=>typeof value==='string'&&recordPattern.test(value);
function clock(now){let value;try{value=now();}catch{fail('CLOCK_INVALID');}if(!Number.isSafeInteger(value)||value<1)fail('CLOCK_INVALID');let iso;try{iso=new Date(value).toISOString();}catch{fail('CLOCK_INVALID');}return iso;}
const freshness=captured=>new Date(Date.parse(captured)+FINANCIAL_OBLIGATION_FRESHNESS_SECONDS*1000).toISOString();
const fresh=(captured,at)=>captured<=at&&freshness(captured)>=at;
async function present(db){
  const names=[...objects.keys()],result=await db.prepare(`SELECT type,name,sql FROM sqlite_master WHERE name IN(${names.map(()=>'?').join(',')})`).bind(...names).all();
  if(!Array.isArray(result?.results))fail('STORAGE_INVALID');const rows=result.results;if(!rows.length)return false;
  if(rows.length!==objects.size||rows.some(row=>{const expected=objects.get(row.name);return !expected||row.type!==expected.type||typeof row.sql!=='string'||canonicalSql(row.sql)!==expected.sql;}))fail('STORAGE_INVALID');return true;
}
function database(env){const db=env?.FINANCE_DB;if(!db?.prepare||!db?.batch||db===env.ADMIN_DB)fail('CONFIGURATION');const context=env.COMMERCIAL_CONTEXT;if(context!==undefined&&context!==null&&(!isCommercialContext(context)||!tenantDatabaseHasContext(db,context,{domain:'finance'})))fail('FORBIDDEN',403);return db;}
function trustedScope(env){const c=env?.COMMERCIAL_CONTEXT;if(c!==undefined&&c!==null&&!isCommercialContext(c))fail('FORBIDDEN',403);return financialAllocationScope(c?{organization_id:c.organizationId,store_id:c.storeId,currency:'BRL'}:{organization_id:'legacy-brazacommerce',store_id:'legacy-shopee',currency:'BRL'});}
async function loadedSnapshot(row,scope){
  if(!row||!hash(row.snapshot_id)||!hash(row.source_hash))fail('STORAGE_INVALID');let raw;try{raw=JSON.parse(row.payload_json);}catch{fail('STORAGE_INVALID');}
  const value=projectFinancialObligationSnapshot(raw);
  if(!value||!sameScope(value.scope,scope)||value.month!==row.month||value.ledger_revision!==row.source_revision||value.source_hash!==row.source_hash||value.captured_at!==row.captured_at||await financialObligationSnapshotHash(value)!==value.source_hash||await financialDigest(value)!==row.snapshot_id)fail('STORAGE_INVALID');return value;
}
function itemFrame(item,snapshot,snapshotId){return {record_id:'obligation:'+item.expense_id,expense_id:item.expense_id,revision:snapshot.ledger_revision,amount_cents:item.amount_cents,status:item.status,competence_month:item.competence_month,due_date:item.due_date,paid_date:item.paid_date,source_updated_at:item.updated_at,evidence_id:'expense-evidence:'+snapshotId,source_hash:snapshot.source_hash,snapshot_id:snapshotId,quality:'REVIEW',account_id:'app-expense-ledger'};}

/** Immutable App-origin observations, never a bank settlement or payment instruction. */
export function createFinancialObligationRegistry(db,{scope,actor_id,authorize,now=Date.now}={}){
  scope=financialAllocationScope(scope);const tenant=tenantFor(scope);if(!db?.prepare||!db?.batch||!token(actor_id)||typeof authorize!=='function'||typeof now!=='function')fail('CONFIGURATION');
  const allowed=async(operation,phase)=>{if(await authorize({scope,operation,phase})!==true)fail('AUTHORIZATION_REVOKED',403);};
  const revision=async exists=>{if(!exists)return 0;const r=await db.prepare('SELECT revision FROM finance_financial_obligation_state WHERE tenant=?').bind(tenant).first();const n=r?.revision??0;if(!Number.isSafeInteger(n)||n<0||n>=Number.MAX_SAFE_INTEGER)fail('STORAGE_INVALID');return n;};
  const guard=(condition,...bindings)=>db.prepare(`INSERT INTO finance_financial_obligation_guard(tenant,ok) VALUES(?,CASE WHEN (${condition}) THEN 1 ELSE 0 END) ON CONFLICT(tenant) DO UPDATE SET ok=excluded.ok`).bind(tenant,...bindings);
  const replay=async(requestId,requestHash,exists)=>{if(!exists)return null;const r=await db.prepare('SELECT request_hash,response_json FROM finance_financial_obligation_requests WHERE tenant=? AND request_id=?').bind(tenant,requestId).first();if(!r)return null;if(r.request_hash!==requestHash)fail('REQUEST_ID_REUSED',409);let value;try{value=projectFinancialObligationResponse(JSON.parse(r.response_json));}catch{}if(!value||value.schema!=='financial_obligation_registration_v1'||!sameScope(value.scope,scope))fail('STORAGE_INVALID');return {...value,replayed:true};};
  return Object.freeze({
    async read(value){
      await allowed('read','before');const command=projectFinancialObligationRequest(value);if(!command||command.operation!=='read')fail('REQUEST_INVALID',400);
      const exists=await present(db),rev=await revision(exists);let snapshot=null,snapshotId=null;
      if(exists){const row=await db.prepare('SELECT s.* FROM finance_financial_obligation_heads h JOIN finance_financial_obligation_snapshots s ON s.tenant=h.tenant AND s.snapshot_id=h.snapshot_id WHERE h.tenant=? AND h.month=?').bind(tenant,command.month).first();if(row){snapshot=await loadedSnapshot(row,scope);snapshotId=row.snapshot_id;}}
      const colon=command.cursor?.indexOf(':'),expected=command.cursor===null?null:Number(command.cursor.slice(0,colon)),after=command.cursor===null?'':command.cursor.slice(colon+1);
      if(expected!==null&&expected!==rev)fail('CURSOR_STALE',409);
      const rows=(snapshot?.items??[]).filter(item=>item.expense_id>after).sort((a,b)=>a.expense_id.localeCompare(b.expense_id)),page=rows.slice(0,command.limit),at=clock(now);
      if(await revision(exists)!==rev)fail('REVISION_CONFLICT',409);await allowed('read','before-response');
      return {schema:'financial_obligation_workspace_v1',scope,revision:rev,month:command.month,source_revision:snapshot?.ledger_revision??null,source_hash:snapshot?.source_hash??null,snapshot_id:snapshotId,captured_at:snapshot?.captured_at??null,fresh_until:snapshot?freshness(snapshot.captured_at):null,state:snapshot?(fresh(snapshot.captured_at,at)?'AVAILABLE':'STALE'):'NOT_CAPTURED',items:page.map(item=>itemFrame(item,snapshot,snapshotId)),next_cursor:rows.length>page.length?rev+':'+page.at(-1).expense_id:null};
    },
    async register(value){
      await allowed('register','before');const command=projectFinancialObligationRequest(value);if(!command||command.operation!=='register'||!sameScope(command.snapshot.scope,scope))fail('REQUEST_INVALID',400);
      const requestHash=await financialDigest(command),exists=await present(db),previous=await replay(command.request_id,requestHash,exists);if(previous){await allowed('register','before-response');return previous;}
      const snapshot=command.snapshot,at=clock(now);if(!fresh(snapshot.captured_at,at))fail('SOURCE_STALE',409);if(await financialObligationSnapshotHash(snapshot)!==snapshot.source_hash)fail('SOURCE_HASH_INVALID',400);
      if(await revision(exists)!==command.expected_revision)fail('REVISION_CONFLICT',409);
      if(exists){const old=await db.prepare('SELECT source_revision,source_hash,captured_at FROM finance_financial_obligation_heads WHERE tenant=? AND month=?').bind(tenant,snapshot.month).first();if(old&&(old.source_revision>snapshot.ledger_revision||old.captured_at>snapshot.captured_at))fail('SOURCE_STALE',409);if(old&&old.source_revision===snapshot.ledger_revision&&old.source_hash!==snapshot.source_hash)fail('SOURCE_REVISION_CONFLICT',409);}
      if(!exists){await allowed('register','before-initialize');await db.batch(FINANCIAL_OBLIGATION_SCHEMA.map(sql=>db.prepare(sql)));}
      const snapshotId=await financialDigest(snapshot),next=command.expected_revision+1,response={schema:'financial_obligation_registration_v1',scope,request_id:command.request_id,revision:next,snapshot_id:snapshotId,source_hash:snapshot.source_hash,source_revision:snapshot.ledger_revision,captured_at:snapshot.captured_at,fresh_until:freshness(snapshot.captured_at),replayed:false,quality:'REVIEW'};
      const statements=[db.prepare('INSERT OR IGNORE INTO finance_financial_obligation_state(tenant,revision) VALUES(?,0)').bind(tenant),db.prepare('UPDATE finance_financial_obligation_state SET revision=revision+1 WHERE tenant=? AND revision=?').bind(tenant,command.expected_revision),guard('changes()=1'),db.prepare('INSERT OR IGNORE INTO finance_financial_obligation_snapshots(tenant,snapshot_id,month,source_revision,source_hash,captured_at,registered_at,payload_json,actor_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(tenant,snapshotId,snapshot.month,snapshot.ledger_revision,snapshot.source_hash,snapshot.captured_at,at,financialCanonicalJSON(snapshot),actor_id),db.prepare('INSERT INTO finance_financial_obligation_heads(tenant,month,revision,snapshot_id,source_revision,source_hash,captured_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(tenant,month) DO UPDATE SET revision=excluded.revision,snapshot_id=excluded.snapshot_id,source_revision=excluded.source_revision,source_hash=excluded.source_hash,captured_at=excluded.captured_at').bind(tenant,snapshot.month,next,snapshotId,snapshot.ledger_revision,snapshot.source_hash,snapshot.captured_at),db.prepare('INSERT INTO finance_financial_obligation_requests(tenant,request_id,request_hash,response_json) VALUES(?,?,?,?)').bind(tenant,command.request_id,requestHash,JSON.stringify(response))];
      await allowed('register','before-transaction');if(!fresh(snapshot.captured_at,clock(now)))fail('SOURCE_STALE',409);
      try{await db.batch(statements);}catch(error){const saved=await replay(command.request_id,requestHash,true);if(saved){await allowed('register','before-response');return saved;}if(await revision(true)!==command.expected_revision)fail('REVISION_CONFLICT',409);fail('RETRY_SAME_REQUEST_REQUIRED');}
      await allowed('register','before-response');return response;
    },
  });
}

/** Only same-scope persisted observations can resolve an obligation ID. */
export async function resolveFinancialObligationRecords(env,ids,{scope,now=Date.now}={}){
  const db=database(env),selected=financialAllocationScope(scope);if(!sameScope(selected,trustedScope(env)))fail('FORBIDDEN',403);
  if(!Array.isArray(ids)||ids.length>220||ids.some(id=>!isFinancialObligationRecordId(id)))fail('REQUEST_INVALID',400);if(!ids.length||!await present(db))return [];
  const tenant=tenantFor(selected),at=clock(now),result=await db.prepare("SELECT h.month,h.revision head_revision,s.snapshot_id,s.source_revision,s.source_hash,s.captured_at,json_extract(s.payload_json,'$.mode') mode,j.value item_json FROM finance_financial_obligation_heads h JOIN finance_financial_obligation_snapshots s ON s.tenant=h.tenant AND s.snapshot_id=h.snapshot_id JOIN json_each(s.payload_json,'$.items') j WHERE h.tenant=? AND ('obligation:'||json_extract(j.value,'$.expense_id')) IN(SELECT value FROM json_each(?)) ORDER BY h.month LIMIT 221").bind(tenant,JSON.stringify(ids)).all();
  if(!Array.isArray(result?.results)||result.results.length>220)fail('STORAGE_INVALID');const seen=new Set();
  return result.results.map(row=>{
    if(!fresh(row.captured_at,at))fail('SOURCE_STALE',409);let item;try{item=JSON.parse(row.item_json);}catch{fail('STORAGE_INVALID');}
    const snapshot=projectFinancialObligationSnapshot({schema:'app_expense_observation_v1',scope:selected,month:row.month,ledger_revision:row.source_revision,mode:row.mode,captured_at:row.captured_at,source_hash:row.source_hash,items:[item]});
    if(!snapshot||!hash(row.snapshot_id)||!Number.isSafeInteger(row.head_revision)||row.head_revision<1)fail('STORAGE_INVALID');const recordId='obligation:'+item.expense_id;if(seen.has(recordId))fail('RECORD_ID_AMBIGUOUS',409);seen.add(recordId);
    return {...selected,record_id:recordId,revision:row.source_revision,legacy_record_id:null,account_id:'app-expense-ledger',kind:'OBLIGATION',amount_cents:item.amount_cents,status:item.status,date:item.paid_date??item.due_date,evidence_id:'expense-evidence:'+row.snapshot_id,native_reference:null,identity_unique:false,source_guard:{schema:'financial_obligation_source_guard_v1',month:row.month,head_revision:row.head_revision,snapshot_id:row.snapshot_id,source_hash:row.source_hash,source_revision:row.source_revision,captured_at:row.captured_at,expense_id:item.expense_id,status:item.status,amount_cents:item.amount_cents}};
  });
}

/** This predicate is appended to the allocation's SAME D1 batch. */
export function financialObligationRecordGuards(db,records,{scope,now=Date.now}={}){
  const selected=financialAllocationScope(scope),tenant=tenantFor(selected),at=clock(now),guards=[];
  for(const record of records.filter(row=>row.kind==='OBLIGATION')){
    const g=record.source_guard;if(!g||g.schema!=='financial_obligation_source_guard_v1'||!isFinancialObligationRecordId(record.record_id)||record.record_id!=='obligation:'+g.expense_id||!sameScope(record,selected)||!hash(g.snapshot_id)||!hash(g.source_hash)||!fresh(g.captured_at,at)||g.amount_cents!==record.amount_cents||g.status!==record.status||g.source_revision!==record.revision)fail('SOURCE_STALE',409);guards.push(g);
  }
  if(!guards.length)return [];
  const condition="NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(SELECT 1 FROM finance_financial_obligation_heads h JOIN finance_financial_obligation_snapshots s ON s.tenant=h.tenant AND s.snapshot_id=h.snapshot_id JOIN json_each(s.payload_json,'$.items') j WHERE h.tenant=? AND h.month=json_extract(e.value,'$.month') AND h.revision=json_extract(e.value,'$.head_revision') AND s.snapshot_id=json_extract(e.value,'$.snapshot_id') AND s.source_hash=json_extract(e.value,'$.source_hash') AND s.source_revision=json_extract(e.value,'$.source_revision') AND s.captured_at=json_extract(e.value,'$.captured_at') AND json_extract(j.value,'$.expense_id')=json_extract(e.value,'$.expense_id') AND json_extract(j.value,'$.amount_cents')=json_extract(e.value,'$.amount_cents') AND json_extract(j.value,'$.status')=json_extract(e.value,'$.status') AND json_extract(j.value,'$.status') IN('OPEN','PAID')))";
  return [db.prepare(`INSERT INTO finance_financial_obligation_guard(tenant,ok) VALUES(?,CASE WHEN (${condition}) THEN 1 ELSE 0 END) ON CONFLICT(tenant) DO UPDATE SET ok=excluded.ok`).bind(tenant,JSON.stringify(guards),tenant)];
}

async function routerAuthorized(request,env){const expected=env?.FINANCE_ROUTER_SECRET,provided=request.headers.get('x-braza-finance-router');if(typeof expected!=='string'||! /^[\x21-\x7e]{32,256}$/.test(expected))fail('CONFIGURATION');if(typeof provided!=='string'||provided.length>256)fail('FORBIDDEN',403);const values=await Promise.all([expected,provided].map(financialDigest));let diff=0;for(let i=0;i<64;i++)diff|=values[0].charCodeAt(i)^values[1].charCodeAt(i);if(diff)fail('FORBIDDEN',403);}
async function body(request){
  if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(request.headers.get('content-type')??'')||!request.body)fail('REQUEST_INVALID',400);
  const size=request.headers.get('content-length');if(size!==null&&(!/^(0|[1-9][0-9]*)$/.test(size)||Number(size)>FINANCIAL_OBLIGATION_REQUEST_MAXIMUM))fail('REQUEST_INVALID',400);
  const reader=request.body.getReader();let timer;try{return await Promise.race([(async()=>{let total=0;const parts=[];for(;;){const next=await reader.read();if(next.done)break;if(!(next.value instanceof Uint8Array)||parts.length>=2048||(total+=next.value.byteLength)>FINANCIAL_OBLIGATION_REQUEST_MAXIMUM)fail('REQUEST_INVALID',400);parts.push(next.value);}const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}let value;try{value=projectFinancialObligationRequest(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}catch{}if(!value)fail('REQUEST_INVALID',400);return value;})(),new Promise((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new FinancialCashAllocationError('OBLIGATION_REQUEST_TIMEOUT',400));},5000);})]);}finally{clearTimeout(timer);try{void reader.cancel().catch(()=>{});reader.releaseLock();}catch{}}
}
export function createFinancialObligationWorker({authorize=null,now=Date.now}={}){return {async fetch(request,env){try{
  const url=new URL(request.url);if(url.origin!=='https://auth.brazacommerce.com.br'||url.username||url.password||url.pathname!==FINANCIAL_OBLIGATION_PATH||url.hash)fail('NOT_FOUND',404);if(request.method!=='POST')fail('METHOD_NOT_ALLOWED',405);if(url.search)fail('REQUEST_INVALID',400);await routerAuthorized(request,env);
  const command=await body(request),scope=trustedScope(env),db=database(env),context=env.COMMERCIAL_CONTEXT,required=command.operation==='register'?'bank.write':'bank.read';
  const allowed=async value=>{if(context){assertCommercialCapability(context,required);assertCommercialCapability(context,'finance.read');if(command.operation==='register')assertCommercialCapability(context,'finance.write');}return authorize===null||await authorize({...value,env,context,required})===true;};
  const registry=createFinancialObligationRegistry(db,{scope,actor_id:context?'account:'+context.userId:'legacy-owner',authorize:allowed,now}),value=await registry[command.operation](command),frame=projectFinancialObligationResponse(value);if(!frame||!financialObligationResponseMatches(command,frame))fail('RESPONSE_INVALID',502);const serialized=JSON.stringify(frame);if(new TextEncoder().encode(serialized).byteLength>FINANCIAL_OBLIGATION_RESPONSE_MAXIMUM)fail('RESPONSE_INVALID',502);return new Response(serialized,{headers});
 }catch(error){const code=error instanceof FinancialCashAllocationError&&/^FINANCIAL_CASH_OBLIGATION_[A-Z_]+$/.test(error.code)?error.code:'FINANCIAL_CASH_OBLIGATION_UNAVAILABLE',status=[400,403,404,405,409,502,503].includes(error?.status)?error.status:503;return new Response(JSON.stringify({schema:'financial_obligation_error_v1',error:code}),{status,headers});}}};}
export default createFinancialObligationWorker();
