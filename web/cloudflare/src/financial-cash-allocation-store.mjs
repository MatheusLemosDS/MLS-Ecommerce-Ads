// This store belongs on FINANCE_DB, beside the legacy 1:1 cash matcher.
import {FinancialCashAllocationError,financialAllocationScope,projectFinancialAllocation} from '../../finance/src/financial-cash-allocation.mjs';
const fail=(code,status=503)=>{throw new FinancialCashAllocationError(code,status);};
const encoder=new TextEncoder(),id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v);
const own=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value'));
const hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(v)))),b=>b.toString(16).padStart(2,'0')).join('');
const canonical=v=>Array.isArray(v)?v.map(canonical):own(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const exactNumber=v=>{if(typeof v!=='string'||!/^\d+$/.test(v)||BigInt(v)>BigInt(Number.MAX_SAFE_INTEGER))fail('STORAGE_INVALID');return Number(v);};
export const FINANCIAL_CASH_ALLOCATION_SCHEMA=Object.freeze([
  'CREATE TABLE IF NOT EXISTS finance_financial_cash_state(tenant TEXT PRIMARY KEY,revision INTEGER NOT NULL CHECK(revision>=0 AND revision<=9007199254740991))',
  'CREATE TABLE IF NOT EXISTS finance_financial_cash_groups(tenant TEXT NOT NULL,group_id TEXT NOT NULL,revision INTEGER NOT NULL,relation TEXT NOT NULL,payload_json TEXT NOT NULL,actor_id TEXT NOT NULL,confirmed_at INTEGER NOT NULL,PRIMARY KEY(tenant,group_id))',
  'CREATE INDEX IF NOT EXISTS finance_financial_cash_groups_revision ON finance_financial_cash_groups(tenant,revision,group_id)',
  "CREATE TABLE IF NOT EXISTS finance_financial_cash_items(tenant TEXT NOT NULL,group_id TEXT NOT NULL,record_id TEXT NOT NULL,record_revision INTEGER NOT NULL,side TEXT NOT NULL CHECK(side IN('LEFT','RIGHT')),amount_cents INTEGER NOT NULL CHECK(amount_cents>0 AND amount_cents<=9007199254740991),capacity_cents INTEGER NOT NULL CHECK(capacity_cents>=amount_cents AND capacity_cents<=9007199254740991),legacy_cash_tenant TEXT,legacy_record_id TEXT,PRIMARY KEY(tenant,group_id,record_id))",
  'CREATE INDEX IF NOT EXISTS finance_financial_cash_items_record ON finance_financial_cash_items(tenant,record_id,group_id)',
  'CREATE INDEX IF NOT EXISTS finance_financial_cash_items_legacy ON finance_financial_cash_items(legacy_cash_tenant,legacy_record_id,group_id)',
  'CREATE TABLE IF NOT EXISTS finance_financial_cash_reversals(tenant TEXT NOT NULL,group_id TEXT NOT NULL,revision INTEGER NOT NULL,request_id TEXT NOT NULL,actor_id TEXT NOT NULL,reason_code TEXT NOT NULL,reversed_at INTEGER NOT NULL,PRIMARY KEY(tenant,group_id))',
  'CREATE TABLE IF NOT EXISTS finance_financial_cash_requests(tenant TEXT NOT NULL,request_id TEXT NOT NULL,request_hash TEXT NOT NULL,response_json TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(tenant,request_id))',
  'CREATE TABLE IF NOT EXISTS finance_financial_cash_audit(tenant TEXT NOT NULL,revision INTEGER NOT NULL,operation TEXT NOT NULL,group_id TEXT NOT NULL,request_id TEXT NOT NULL,actor_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(tenant,revision))',
  'CREATE TABLE IF NOT EXISTS finance_financial_cash_guard(tenant TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))',
  ...['groups','items','reversals','requests','audit'].flatMap(name=>['UPDATE','DELETE'].map(operation=>`CREATE TRIGGER IF NOT EXISTS finance_financial_cash_${name}_no_${operation.toLowerCase()} BEFORE ${operation} ON finance_financial_cash_${name} BEGIN SELECT RAISE(ABORT,'financial_cash_immutable'); END`)),
]);
export const FINANCIAL_CASH_ALLOCATION_TABLES=Object.freeze(['state','groups','items','reversals','requests','audit','guard'].map(s=>'finance_financial_cash_'+s));
export const financialCashAllocationTenant=scope=>JSON.stringify(Object.values(financialAllocationScope(scope)));
const active=alias=>`NOT EXISTS(SELECT 1 FROM finance_financial_cash_reversals fcr WHERE fcr.tenant=${alias}.tenant AND fcr.group_id=${alias}.group_id)`;
const expression=v=>{if(typeof v!=='string'||!/^(?:[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?|\?)$/.test(v))fail('SQL_EXPRESSION_INVALID');return v;};
/** Trusted SQL expression for the legacy matcher's atomic reservation fence. */
export function financialCashLegacyUsageSql(recordExpression,tenantExpression){
  const record=expression(recordExpression),tenant=expression(tenantExpression);
  return `COALESCE((SELECT SUM(fci.amount_cents) FROM finance_financial_cash_items fci WHERE fci.legacy_cash_tenant=${tenant} AND fci.legacy_record_id=${record} AND ${active('fci')}),0)`;
}
export function financialCashActiveUsageSql(recordExpression,tenantExpression){
  const record=expression(recordExpression),tenant=expression(tenantExpression);
  return `COALESCE((SELECT SUM(fci.amount_cents) FROM finance_financial_cash_items fci WHERE fci.tenant=${tenant} AND fci.record_id=${record} AND ${active('fci')}),0)`;
}
function parse(value){try{const v=JSON.parse(value);if(!own(v))fail('STORAGE_INVALID');return v;}catch{fail('STORAGE_INVALID');}}
const legacyActive=alias=>`NOT EXISTS(SELECT 1 FROM finance_external_cash_unlinks lu WHERE lu.tenant=${alias}.tenant AND lu.match_id=${alias}.match_id)`;
function legacyUsed(recordExpression){
  return `COALESCE((SELECT ABS(lr.amount_cents) FROM finance_external_cash_records lr WHERE lr.tenant=? AND lr.record_id=${recordExpression} AND EXISTS(SELECT 1 FROM finance_external_cash_matches lm WHERE lm.tenant=lr.tenant AND (lm.bank_record_id=lr.record_id OR lm.transfer_record_id=lr.record_id) AND ${legacyActive('lm')})),0)`;
}

/** authorize is checked around all operations; a commercial DB wrapper supplies its atomic SQL guard. */
export function createFinancialCashAllocationStore(db,{scope,actor_id,authorize,resolveRecords,resolveAutomaticRule=null,guardRecords=null,legacy_cash_tenant=null,now=()=>Date.now()}={}){
  const business=financialAllocationScope(scope),tenant=financialCashAllocationTenant(business);
  if(!db?.prepare||!db?.batch||!id(actor_id)||typeof authorize!=='function'||typeof resolveRecords!=='function'||typeof now!=='function'||guardRecords!==null&&typeof guardRecords!=='function'||legacy_cash_tenant!==null&&(typeof legacy_cash_tenant!=='string'||!legacy_cash_tenant.length||legacy_cash_tenant.length>400))fail('CONFIGURATION');
  const allowed=async(operation,phase)=>{if(await authorize({scope:business,operation,phase})!==true)fail('AUTHORIZATION_REVOKED',403);};
  const stamp=()=>{const t=now();if(!Number.isSafeInteger(t)||t<1000||t>9999999999999)fail('CLOCK_INVALID');return Math.floor(t/1000);};
  async function presence(){
    const r=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN('finance_financial_cash_state','finance_external_cash_records','finance_external_cash_matches','finance_external_cash_unlinks')").all();
    if(!Array.isArray(r?.results))fail('STORAGE_INVALID');const names=new Set(r.results.map(x=>x.name));
    const legacy=['finance_external_cash_records','finance_external_cash_matches','finance_external_cash_unlinks'].filter(n=>names.has(n)).length;
    if(legacy!==0&&legacy!==3)fail('LEGACY_SCHEMA_INCOMPLETE');if(legacy===3&&legacy_cash_tenant===null)fail('LEGACY_SCOPE_REQUIRED');
    return {present:names.has('finance_financial_cash_state'),legacy:legacy===3};
  }
  async function revision(present){if(!present)return 0;const r=await db.prepare('SELECT revision FROM finance_financial_cash_state WHERE tenant=?').bind(tenant).first();if(!r)return 0;if(!Number.isSafeInteger(r.revision)||r.revision<0||r.revision>Number.MAX_SAFE_INTEGER)fail('STORAGE_INVALID');return r.revision;}
  async function setup(){await allowed('initialize','before-write');await db.batch([...FINANCIAL_CASH_ALLOCATION_SCHEMA.map(sql=>db.prepare(sql)),db.prepare('INSERT OR IGNORE INTO finance_financial_cash_state(tenant,revision) VALUES(?,0)').bind(tenant)]);await allowed('initialize','after-write');}
  function request(input){if(!own(input)||!id(input.request_id)||!Number.isSafeInteger(input.expected_revision)||input.expected_revision<0||input.expected_revision>=Number.MAX_SAFE_INTEGER)fail('REQUEST_INVALID',400);return input;}
  async function replay(present,requestId,requestHash){if(!present)return null;const r=await db.prepare('SELECT request_hash,response_json FROM finance_financial_cash_requests WHERE tenant=? AND request_id=?').bind(tenant,requestId).first();if(!r)return null;if(r.request_hash!==requestHash)fail('REQUEST_ID_REUSED',409);return {...parse(r.response_json),replayed:true};}
  const guard=(condition,...args)=>db.prepare(`INSERT INTO finance_financial_cash_guard(tenant,ok) VALUES(?,CASE WHEN (${condition}) THEN 1 ELSE 0 END) ON CONFLICT(tenant) DO UPDATE SET ok=excluded.ok`).bind(tenant,...args);
  async function used(ids,p){
    const result=new Map(ids.map(v=>[v,0]));if(p.present){const r=await db.prepare(`SELECT record_id,CAST(SUM(amount_cents) AS TEXT) used FROM finance_financial_cash_items i WHERE tenant=? AND record_id IN(SELECT value FROM json_each(?)) AND ${active('i')} GROUP BY record_id`).bind(tenant,JSON.stringify(ids)).all();if(!Array.isArray(r?.results))fail('STORAGE_INVALID');for(const row of r.results)result.set(row.record_id,exactNumber(row.used));}return result;
  }
  async function prepare(input,p){
    if(Object.hasOwn(input,'automatic_rule'))fail('AUTOMATIC_RULE_NOT_AUTHORIZED',403);
    const ids=[...new Set([...(input.left??[]),...(input.right??[]),...(input.adjustments??[])].map(x=>x?.record_id))];if(!ids.length||ids.length>220||ids.some(x=>!id(x)))fail('REQUEST_INVALID',400);
    const resolved=await resolveRecords(ids,{scope:business});await allowed('read','after-source-read');
    if(!Array.isArray(resolved))fail('SOURCE_RECORDS_UNAVAILABLE');
    const reservations=await used(ids,p);
    if(p.legacy){const selected=resolved.filter(row=>row.legacy_record_id).map(row=>({record_id:row.record_id,legacy_record_id:row.legacy_record_id}));if(selected.length){
      // An explicitly shared legacy source is one pool of money, even when
      // reached through two authorized business namespaces. Count its active
      // allocations globally by the trusted legacy key, not twice per book.
      const rows=await db.prepare(`WITH wanted AS(SELECT json_extract(value,'$.record_id') record_id,json_extract(value,'$.legacy_record_id') legacy_record_id FROM json_each(?)) SELECT wanted.record_id,CAST(${p.present?financialCashLegacyUsageSql('wanted.legacy_record_id','?'):'0'} AS TEXT) new_used,CAST(${legacyUsed('wanted.legacy_record_id')} AS TEXT) old_used FROM wanted`).bind(JSON.stringify(selected),...(p.present?[legacy_cash_tenant]:[]),legacy_cash_tenant).all();
      if(!Array.isArray(rows?.results)||rows.results.length!==selected.length)fail('STORAGE_INVALID');
      for(const row of rows.results){const total=BigInt(exactNumber(row.new_used))+BigInt(exactNumber(row.old_used));if(total>BigInt(Number.MAX_SAFE_INTEGER))fail('AMOUNT_OVERFLOW',400);reservations.set(row.record_id,Number(total));}
    }}
    let automatic;
    if(input.rule_id!==undefined){if(!id(input.rule_id)||typeof resolveAutomaticRule!=='function')fail('AUTOMATIC_RULE_NOT_AUTHORIZED',403);automatic=await resolveAutomaticRule(input.rule_id,{scope:business});}
    return {group:projectFinancialAllocation({...input,scope:business,...(automatic===undefined?{}:{automatic_rule:automatic})},{records:resolved,used_cents:reservations}),records:resolved};
  }
  async function persist(input,operation,response,statements,requestHash){
    const t=stamp();statements.push(db.prepare('INSERT INTO finance_financial_cash_audit(tenant,revision,operation,group_id,request_id,actor_id,created_at) VALUES(?,?,?,?,?,?,?)').bind(tenant,response.revision,operation,response.group_id,input.request_id,actor_id,t));
    statements.push(db.prepare('INSERT INTO finance_financial_cash_requests(tenant,request_id,request_hash,response_json,created_at) VALUES(?,?,?,?,?)').bind(tenant,input.request_id,requestHash,JSON.stringify(response),t));
    await allowed(operation,'before-transaction');
    try{await db.batch(statements);}catch(error){const previous=await replay(true,input.request_id,requestHash);if(previous){await allowed(operation,'before-response');return previous;}const current=await revision(true);if(current!==input.expected_revision)fail('REVISION_CONFLICT',409);if(/constraint|financial_cash_immutable/i.test(String(error?.message)))fail('ALLOCATION_CONFLICT',409);fail('RETRY_SAME_REQUEST_REQUIRED');}
    await allowed(operation,'before-response');return response;
  }
  const stateStatements=expected=>[db.prepare('UPDATE finance_financial_cash_state SET revision=revision+1 WHERE tenant=? AND revision=?').bind(tenant,expected),guard('changes()=1')];
  return Object.freeze({
    async initialize(){await allowed('initialize','before');await setup();return {schema:'financial_cash_allocation_storage_v1',scope:business,revision:await revision(true)};},
    async preview(input){await allowed('read','before');if(!own(input))fail('REQUEST_INVALID',400);const p=await presence(),rev=await revision(p.present),{group}=await prepare(input,p);const after=await revision(p.present);if(after!==rev)fail('REVISION_CONFLICT',409);await allowed('read','before-response');return {schema:'financial_cash_allocation_preview_v1',scope:business,revision:rev,group};},
    async read({limit=50,cursor=null}={}){
      await allowed('read','before');if(!Number.isSafeInteger(limit)||limit<1||limit>100||cursor!==null&&!/^\d+:[A-Za-z0-9_.:-]{1,160}$/.test(cursor))fail('REQUEST_INVALID',400);
      const p=await presence(),rev=await revision(p.present);if(!p.present){await allowed('read','before-response');return {schema:'financial_cash_allocation_workspace_v1',scope:business,revision:0,groups:[],next_cursor:null};}
      const cut=cursor?.indexOf(':'),expected=cursor===null?null:Number(cursor.slice(0,cut)),after=cursor===null?'':cursor.slice(cut+1);if(expected!==null&&expected!==rev)fail('CURSOR_STALE',409);
      const r=await db.prepare('SELECT g.group_id,g.payload_json,r.reversed_at,r.reason_code FROM finance_financial_cash_groups g LEFT JOIN finance_financial_cash_reversals r ON r.tenant=g.tenant AND r.group_id=g.group_id WHERE g.tenant=? AND g.group_id>? ORDER BY g.group_id LIMIT ?').bind(tenant,after,limit+1).all();if(!Array.isArray(r?.results))fail('STORAGE_INVALID');
      const rows=r.results.slice(0,limit),groups=rows.map(row=>({...parse(row.payload_json),...(row.reversed_at===null?{}:{state:'REVERSED',reversed_at:row.reversed_at,reversal_reason_code:row.reason_code})}));if(await revision(true)!==rev)fail('REVISION_CONFLICT',409);await allowed('read','before-response');return {schema:'financial_cash_allocation_workspace_v1',scope:business,revision:rev,groups,next_cursor:r.results.length>limit?rev+':'+rows.at(-1).group_id:null};
    },
    async confirm(value){
      await allowed('confirm','before');const input=request(value),requestHash=await hash(canonical({operation:'confirm',...input})),p=await presence(),previous=await replay(p.present,input.request_id,requestHash);if(previous){await allowed('confirm','before-response');return previous;}
      if(await revision(p.present)!==input.expected_revision)fail('REVISION_CONFLICT',409);const {group,records}=await prepare(input,p);if(group.state!=='CONFIRMED')fail('CONFIRMATION_REQUIRED',400);await allowed('confirm','after-source-read');
      if(!p.present)await setup();else await db.prepare('INSERT OR IGNORE INTO finance_financial_cash_state(tenant,revision) VALUES(?,0)').bind(tenant).run();
      const groupId=crypto.randomUUID(),t=stamp(),payload={...group,group_id:groupId,revision:input.expected_revision+1,confirmed_at:t,actor_id};
      const response={schema:'financial_cash_allocation_mutation_v1',operation:'confirm',scope:business,request_id:input.request_id,group_id:groupId,revision:payload.revision,replayed:false,group:payload};
      const caps=JSON.stringify(group.usage),statements=stateStatements(input.expected_revision);
      if(guardRecords!==null){const guards=await guardRecords(records,{scope:business});if(!Array.isArray(guards)||guards.length>220||guards.some(statement=>typeof statement?.run!=='function'))fail('SOURCE_GUARD_INVALID');statements.push(...guards);}
      const currentUsage=`COALESCE((SELECT SUM(i.amount_cents) FROM finance_financial_cash_items i WHERE i.tenant=? AND i.record_id=json_extract(j.value,'$.record_id') AND ${active('i')}),0)`;
      const legacyUsage=`COALESCE((SELECT SUM(i.amount_cents) FROM finance_financial_cash_items i WHERE i.legacy_cash_tenant=? AND i.legacy_record_id=json_extract(j.value,'$.legacy_record_id') AND ${active('i')}),0)`;
      const legacy=p.legacy?`CASE WHEN json_extract(j.value,'$.legacy_record_id') IS NOT NULL THEN ${legacyUsage} ELSE ${currentUsage} END+${legacyUsed("json_extract(j.value,'$.legacy_record_id')")}`:currentUsage;
      // Keep the cap expression explicit: both independent matchers reserve inside this transaction.
      statements.push(guard(`NOT EXISTS(SELECT 1 FROM json_each(?) j WHERE (${legacy})+json_extract(j.value,'$.new_cents')>json_extract(j.value,'$.capacity_cents'))`,caps,...(p.legacy?[legacy_cash_tenant,tenant,legacy_cash_tenant]:[tenant])));
      statements.push(db.prepare('INSERT INTO finance_financial_cash_groups(tenant,group_id,revision,relation,payload_json,actor_id,confirmed_at) VALUES(?,?,?,?,?,?,?)').bind(tenant,groupId,payload.revision,group.relation,JSON.stringify(payload),actor_id,t));
      const savedItems=[...group.left.map(i=>({...i,side:'LEFT'})),...group.right.map(i=>({...i,side:'RIGHT'})),...group.adjustments].map(item=>{const cap=group.usage.find(i=>i.record_id===item.record_id);return {...item,capacity_cents:cap.capacity_cents,legacy_record_id:cap.legacy_record_id};});
      statements.push(db.prepare("INSERT INTO finance_financial_cash_items(tenant,group_id,record_id,record_revision,side,amount_cents,capacity_cents,legacy_cash_tenant,legacy_record_id) SELECT ?,?,json_extract(value,'$.record_id'),json_extract(value,'$.record_revision'),json_extract(value,'$.side'),json_extract(value,'$.amount_cents'),json_extract(value,'$.capacity_cents'),?,json_extract(value,'$.legacy_record_id') FROM json_each(?)").bind(tenant,groupId,legacy_cash_tenant,JSON.stringify(savedItems)));
      return persist(input,'confirm',response,statements,requestHash);
    },
    async reverse(value){
      await allowed('reverse','before');const input=request(value);if(!id(input.group_id)||input.reason_code!=='OPERATOR_VERIFIED')fail('REQUEST_INVALID',400);
      const requestHash=await hash(canonical({operation:'reverse',...input})),p=await presence(),previous=await replay(p.present,input.request_id,requestHash);if(previous){await allowed('reverse','before-response');return previous;}
      if(!p.present)fail('GROUP_NOT_FOUND',404);if(await revision(true)!==input.expected_revision)fail('REVISION_CONFLICT',409);
      const found=await db.prepare(`SELECT group_id FROM finance_financial_cash_groups g WHERE tenant=? AND group_id=? AND ${active('g')}`).bind(tenant,input.group_id).first();if(!found)fail('GROUP_NOT_FOUND',404);
      const response={schema:'financial_cash_allocation_mutation_v1',operation:'reverse',scope:business,request_id:input.request_id,group_id:input.group_id,revision:input.expected_revision+1,replayed:false};
      const statements=stateStatements(input.expected_revision);statements.push(guard(`EXISTS(SELECT 1 FROM finance_financial_cash_groups g WHERE g.tenant=? AND g.group_id=? AND ${active('g')})`,tenant,input.group_id));
      statements.push(db.prepare('INSERT INTO finance_financial_cash_reversals(tenant,group_id,revision,request_id,actor_id,reason_code,reversed_at) VALUES(?,?,?,?,?,?,?)').bind(tenant,input.group_id,response.revision,input.request_id,actor_id,input.reason_code,stamp()));
      return persist(input,'reverse',response,statements,requestHash);
    },
  });
}
