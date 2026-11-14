// Read-only connector contract. No implicit Nubank API, credentials or consent.
import {FinancialCashAllocationError,financialAllocationScope} from './financial-cash-allocation.mjs';
const fail=(code,status)=>{throw new FinancialCashAllocationError(code,status);};
const own=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>Object.hasOwn(d,'value'));
const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
const instant=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))return false;const d=Date.parse(value.slice(0,10)+'T00:00:00Z');return Number.isFinite(d)&&new Date(d).toISOString().slice(0,10)===value.slice(0,10);};
const safe=value=>{if(value>BigInt(Number.MAX_SAFE_INTEGER)||value<BigInt(Number.MIN_SAFE_INTEGER))fail('AMOUNT_OVERFLOW');return Number(value);};
const same=(a,b)=>a.organization_id===b.organization_id&&a.store_id===b.store_id&&a.currency===b.currency&&a.account_id===b.account_id;
function scopeFor(value){const scope=financialAllocationScope(value);if(!id(value.account_id))fail('BANK_ACCOUNT_REQUIRED');return Object.freeze({...scope,account_id:value.account_id});}
function balance(value,scope){
  if(value===null||value===undefined)return null;
  if(!own(value)||!same(value,scope)||!Number.isSafeInteger(value.amount_cents)||!instant(value.at)||!id(value.evidence_id)||value.confirmed!==true)fail('BALANCE_EVIDENCE_INVALID');
  return {amount_cents:value.amount_cents,at:value.at,evidence_id:value.evidence_id};
}
export function projectFinancialBankBalance(input){
  if(!own(input)||!Array.isArray(input.transactions)||input.transactions.length>100000)fail('BANK_INPUT_INVALID');
  const scope=scopeFor(input.scope),opening=balance(input.opening,scope),closing=balance(input.closing,scope),coverage=input.coverage;
  if(!own(coverage)||!['UNKNOWN','PARTIAL','COMPLETE'].includes(coverage.state)||coverage.state==='COMPLETE'&&(!id(coverage.evidence_id)||coverage.confirmed!==true))fail('BANK_COVERAGE_INVALID');
  const pending=[],ids=new Set();let credits=0n,debits=0n,earliest=null,latest=null;
  for(const t of input.transactions){
    if(!own(t)||!same(t,scope)||!id(t.record_id)||ids.has(t.record_id)||!Number.isSafeInteger(t.amount_cents)||!instant(t.at)||t.status!=='POSTED'||!id(t.evidence_id))fail('BANK_TRANSACTION_INVALID');
    ids.add(t.record_id);const amount=BigInt(t.amount_cents);if(amount>=0n)credits+=amount;else debits-=amount;
    const stamp=Date.parse(t.at);earliest=earliest===null?stamp:Math.min(earliest,stamp);latest=latest===null?stamp:Math.max(latest,stamp);
    if(opening&&stamp<Date.parse(opening.at)||closing&&stamp>=Date.parse(closing.at))fail('BANK_TRANSACTION_OUTSIDE_INTERVAL');
  }
  if(opening&&closing&&Date.parse(opening.at)>=Date.parse(closing.at))fail('BANK_INTERVAL_INVALID');
  if(!opening)pending.push('OPENING_BALANCE_UNCONFIRMED');if(!closing)pending.push('CLOSING_BALANCE_UNCONFIRMED');if(coverage.state!=='COMPLETE')pending.push('BANK_COVERAGE_UNCONFIRMED');
  if(coverage.state==='COMPLETE'&&(!instant(coverage.start_at)||!instant(coverage.end_at)||!opening||!closing||Date.parse(coverage.start_at)!==Date.parse(opening.at)||Date.parse(coverage.end_at)!==Date.parse(closing.at)))pending.push('BANK_COVERAGE_INTERVAL_MISMATCH');
  const movement=safe(credits-debits),computed=opening?safe(BigInt(opening.amount_cents)+credits-debits):null;
  const difference=computed!==null&&closing?safe(BigInt(closing.amount_cents)-BigInt(computed)):null;
  if(difference!==null&&difference!==0)pending.push('BANK_BALANCE_DIFFERENCE');
  return Object.freeze({schema:'financial_bank_balance_v1',scope,state:pending.length?(difference!==null&&difference!==0?'DIVERGENT':input.transactions.length||opening||closing?'PARTIAL':'UNKNOWN'):'RECONCILED',
    opening_balance_cents:opening?.amount_cents??null,closing_balance_cents:closing?.amount_cents??null,observed_credit_cents:safe(credits),observed_debit_cents:safe(debits),observed_movement_cents:movement,
    computed_closing_cents:computed,difference_cents:difference,transaction_count:input.transactions.length,coverage_state:coverage.state,pending:Object.freeze(pending),
    interval:{start_at:opening?.at??null,end_at:closing?.at??null,end_exclusive:true},basis:'CONFIRMED_SINGLE_ACCOUNT_BANK_STATEMENT',realized_profit_cents:null});
}

/** The adapter and consent are supplied by the trusted server registry only. */
export function createAuthorizedFinancialBankConnector({adapter=null,consent=null,authorize,now=()=>Date.now()}={}){
  if(typeof authorize!=='function'||typeof now!=='function')fail('CONNECTOR_AUTHORIZATION_REQUIRED',503);
  async function allowed(scope,phase){if(await authorize({scope,phase,capability:'bank.read'})!==true)fail('AUTHORIZATION_REVOKED',403);}
  const activeConsent=scope=>own(consent)&&consent.active===true&&same(consent,scope)&&instant(consent.expires_at)&&Date.parse(consent.expires_at)>now()&&id(consent.evidence_id);
  return Object.freeze({
    async capability(input){const scope=scopeFor(input);await allowed(scope,'before-capability');const available=!!adapter&&typeof adapter.readStatement==='function'&&id(adapter.id)&&activeConsent(scope);await allowed(scope,'after-capability');return {schema:'financial_bank_connector_capability_v1',scope,state:available?'AVAILABLE':'UNAVAILABLE',reason:!adapter?'NO_AUTHORIZED_CONNECTOR':!available?'CONSENT_MISSING_EXPIRED_OR_SCOPE_MISMATCH':null,read_only:true,fallback:'CSV_OFX_REVIEWED_IMPORT'};},
    async readStatement(input){
      if(!own(input)||!instant(input.start_at)||!instant(input.end_at)||Date.parse(input.start_at)>=Date.parse(input.end_at))fail('CONNECTOR_INTERVAL_INVALID');
      const scope=scopeFor(input.scope);await allowed(scope,'before-read');
      const c=await this.capability(scope);if(c.state!=='AVAILABLE')return {schema:'financial_bank_connector_result_v1',scope,state:'UNAVAILABLE',reason:c.reason,statement:null};
      const statement=await adapter.readStatement({scope,start_at:input.start_at,end_at:input.end_at,read_only:true});await allowed(scope,'after-provider-read');
      if(!activeConsent(scope))fail('CONNECTOR_CONSENT_REVOKED',403);
      if(!own(statement)||!own(statement.scope)||!same(statement.scope,scope)||statement.coverage?.start_at!==input.start_at||statement.coverage?.end_at!==input.end_at)fail('CONNECTOR_STATEMENT_SCOPE_MISMATCH',403);
      const projection=projectFinancialBankBalance(statement);
      const snapshotBalance=b=>b===null||b===undefined?null:{...scope,amount_cents:b.amount_cents,at:b.at,evidence_id:b.evidence_id,confirmed:true};
      const sanitized={scope,opening:snapshotBalance(statement.opening),closing:snapshotBalance(statement.closing),coverage:{state:statement.coverage.state,start_at:statement.coverage.start_at,end_at:statement.coverage.end_at,evidence_id:statement.coverage.evidence_id??null,confirmed:statement.coverage.confirmed===true},transactions:statement.transactions.map(t=>({...scope,record_id:t.record_id,amount_cents:t.amount_cents,at:t.at,status:'POSTED',evidence_id:t.evidence_id}))};
      await allowed(scope,'before-response');return {schema:'financial_bank_connector_result_v1',scope,state:'AVAILABLE',reason:null,statement:sanitized,projection};
    },
  });
}
