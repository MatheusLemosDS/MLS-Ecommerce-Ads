// The operator confirmed MEI and a normal 2026 DAS of R$ 86,05. This is a
// declared monthly expense, not a percentage inferred from Shopee orders.
export const TAX_POLICY_DEFAULTS=Object.freeze({regime:'MEI',year:2026,monthly_das_cents:8605});
const businessTaxInitialPayload=JSON.stringify(TAX_POLICY_DEFAULTS);
export const TAX_POLICY_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS business_tax_policy_state (year INTEGER PRIMARY KEY CHECK(year BETWEEN 2000 AND 9999),revision INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS business_tax_policy_audit (year INTEGER NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(year,revision))`,
 `INSERT OR IGNORE INTO business_tax_policy_state(year,revision,payload,updated_at) SELECT 2026,1,'${businessTaxInitialPayload}',strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE NOT EXISTS(SELECT 1 FROM business_tax_policy_audit WHERE year=2026)`,
 `INSERT INTO business_tax_policy_audit(year,revision,payload,actor,created_at) SELECT year,revision,payload,'operator_declared_2026_10_24',updated_at FROM business_tax_policy_state WHERE changes()=1 AND year=2026 AND revision=1 AND payload='${businessTaxInitialPayload}'`,
];

export class BusinessTaxPolicyError extends Error {
 constructor(code,status=400){super(code);this.status=status;}
}
const businessTaxFail=(code,status=400)=>{throw new BusinessTaxPolicyError(code,status);};
const businessTaxPlain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const businessTaxExact=(value,keys)=>businessTaxPlain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const businessTaxYear=value=>Number.isSafeInteger(value)&&value>=2000&&value<=9999;
const businessTaxRevision=(value,zero=false)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=(zero?0:1)&&value<=2147483647;
const businessTaxAmount=value=>value===null||Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=1&&value<=1000000;
const businessTaxDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));

export function validateBusinessTaxPolicy(values){
 if(!businessTaxExact(values,['regime','year','monthly_das_cents'])||values.regime!=='MEI'||!businessTaxYear(values.year)||!businessTaxAmount(values.monthly_das_cents))businessTaxFail('BUSINESS_TAX_POLICY_INVALID');
 return {regime:'MEI',year:values.year,monthly_das_cents:values.monthly_das_cents};
}

function businessTaxStored(row,year){
 try{
  if(!row||!businessTaxRevision(row.revision)||!businessTaxDate(row.updated_at)||typeof row.payload!=='string')throw Error();
  const values=validateBusinessTaxPolicy(JSON.parse(row.payload));if(values.year!==year)throw Error();
  return {revision:row.revision,values,updated_at:row.updated_at};
 }catch{businessTaxFail('BUSINESS_TAX_POLICY_STATE_INVALID',503);}
}

// A caller collecting several financial references can validate this policy
// from the same D1 batch without giving up deleted-state/audit protection.
export function businessTaxPolicyFromSnapshot(row,historical,year=2026){
 if(!businessTaxYear(year))businessTaxFail('BUSINESS_TAX_POLICY_YEAR_INVALID');
 if(row)return businessTaxStored(row,year);
 if(historical)businessTaxFail('BUSINESS_TAX_POLICY_STATE_INVALID',503);
 return {revision:0,values:{regime:'MEI',year,monthly_das_cents:null},updated_at:null};
}

export async function readBusinessTaxPolicy(env,year=2026){
 if(!businessTaxYear(year))businessTaxFail('BUSINESS_TAX_POLICY_YEAR_INVALID');
 const row=await env.ADMIN_DB.prepare('SELECT revision,payload,updated_at FROM business_tax_policy_state WHERE year=?').bind(year).first();
 if(row)return businessTaxPolicyFromSnapshot(row,null,year);
 // An absent year is unconfigured. A deleted state with existing history is
 // corrupt and must never be recreated as an unaudited first version.
 const historical=await env.ADMIN_DB.prepare('SELECT revision FROM business_tax_policy_audit WHERE year=? LIMIT 1').bind(year).first();
 return businessTaxPolicyFromSnapshot(null,historical,year);
}

export async function saveBusinessTaxPolicy(env,body,actor,options={}){
 if(!businessTaxExact(body,['revision','values'])||!businessTaxRevision(body.revision,true)||body.revision>=2147483647)businessTaxFail('BUSINESS_TAX_POLICY_REVISION_REQUIRED');
 const values=validateBusinessTaxPolicy(body.values);
 if(typeof actor!=='string'||!actor.trim()||actor.length>256||/[\u0000-\u001f\u007f-\u009f]/.test(actor))businessTaxFail('BUSINESS_TAX_POLICY_ACTOR_INVALID');
 const current=await env.ADMIN_DB.prepare('SELECT revision,payload,updated_at FROM business_tax_policy_state WHERE year=?').bind(values.year).first();
 if(current)businessTaxStored(current,values.year);
 else if(await env.ADMIN_DB.prepare('SELECT revision FROM business_tax_policy_audit WHERE year=? LIMIT 1').bind(values.year).first())businessTaxFail('BUSINESS_TAX_POLICY_STATE_INVALID',503);
 if((current?.revision||0)!==body.revision)businessTaxFail('BUSINESS_TAX_POLICY_CHANGED_RELOAD',409);
 let now;try{now=new Date(typeof options.now==='function'?options.now():Date.now()).toISOString();}catch{businessTaxFail('BUSINESS_TAX_POLICY_CLOCK_INVALID',503);}
 const raw=JSON.stringify(values),revision=body.revision+1;
 const mutation=current?
  env.ADMIN_DB.prepare('UPDATE business_tax_policy_state SET revision=revision+1,payload=?,updated_at=? WHERE year=? AND revision=? AND payload=?').bind(raw,now,values.year,body.revision,current.payload):
  env.ADMIN_DB.prepare('INSERT OR IGNORE INTO business_tax_policy_state(year,revision,payload,updated_at) VALUES(?,1,?,?)').bind(values.year,raw,now);
 let results;
 try{
  results=await env.ADMIN_DB.batch([
   mutation,
   env.ADMIN_DB.prepare('INSERT INTO business_tax_policy_audit(year,revision,payload,actor,created_at) SELECT year,revision,payload,?,updated_at FROM business_tax_policy_state WHERE changes()=1 AND year=? AND revision=? AND payload=? AND updated_at=?').bind(actor,values.year,revision,raw,now),
  ]);
 }catch{businessTaxFail('BUSINESS_TAX_POLICY_SAVE_UNAVAILABLE',503);}
 if(results[0]?.meta?.changes!==1)businessTaxFail('BUSINESS_TAX_POLICY_CHANGED_RELOAD',409);
 if(results[1]?.meta?.changes!==1)businessTaxFail('BUSINESS_TAX_POLICY_SAVE_UNAVAILABLE',503);
 return readBusinessTaxPolicy(env,values.year);
}

export async function readBusinessTaxPolicyAudit(env,year=2026){
 if(!businessTaxYear(year))businessTaxFail('BUSINESS_TAX_POLICY_YEAR_INVALID');
 const rows=(await env.ADMIN_DB.prepare('SELECT year,revision,payload,actor,created_at FROM business_tax_policy_audit WHERE year=? ORDER BY revision DESC LIMIT 30').bind(year).all()).results;
 for(const row of rows){
  if(row.year!==year)businessTaxFail('BUSINESS_TAX_POLICY_STATE_INVALID',503);
  businessTaxStored({revision:row.revision,payload:row.payload,updated_at:row.created_at},year);
 }
 return {rows};
}

export function businessMonthTax(policy,month){
 if(typeof month!=='string'||!/^(?:[2-9][0-9]{3})-(?:0[1-9]|1[0-2])$/.test(month))businessTaxFail('BUSINESS_TAX_POLICY_MONTH_INVALID');
 if(!businessTaxExact(policy,['revision','values','updated_at'])||!businessTaxRevision(policy.revision,true))businessTaxFail('BUSINESS_TAX_POLICY_STATE_INVALID',503);
 let values;try{values=validateBusinessTaxPolicy(policy.values);}catch{businessTaxFail('BUSINESS_TAX_POLICY_STATE_INVALID',503);}
 if(policy.revision===0?(values.monthly_das_cents!==null||policy.updated_at!==null):!businessTaxDate(policy.updated_at))businessTaxFail('BUSINESS_TAX_POLICY_STATE_INVALID',503);
 const year=Number(month.slice(0,4)),matches=year===values.year,amount=matches?values.monthly_das_cents:null,declared=amount!==null;
 return {schema:'business_month_tax_v1',regime:'MEI',year,policy_revision:matches?policy.revision:0,monthly_das_cents:amount,tax_cents:amount,status:declared?'DECLARED':'PENDING',source:declared?'OPERATOR_DECLARED_DAS':'DAS_REQUIRED',basis:'MONTHLY_COMPETENCE_NO_PRORATION'};
}
