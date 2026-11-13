import {isCommercialContext,assertCommercialCapability} from './commercial-context.mjs';
import {tenantDatabaseHasContext} from './tenant-storage.mjs';
import {readExpenseLedger,projectExpenseLedger} from './expense-ledger.mjs';
import {getFinanceFinancialAutomation} from './app-financial-automation.mjs';
import {FinancialLedgerError} from './financial-event-ledger.mjs';
import {projectFinancialObligationSnapshot,financialObligationSnapshotHash,projectFinancialObligationRequest,projectFinancialObligationResponse,financialObligationResponseMatches} from '../../finance/src/financial-obligation-frame.mjs';

const fail=(code,status=400)=>{throw new FinancialLedgerError('FINANCIAL_OBLIGATION_APP_'+code,status);};
const own=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const exact=(value,required,optional=[])=>own(value)&&required.every(key=>Object.hasOwn(value,key))&&Reflect.ownKeys(value).every(key=>required.includes(key)||optional.includes(key));
const token=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
const integer=value=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=0&&value<Number.MAX_SAFE_INTEGER;
function select(env,input,refresh=false){
  if(!exact(input,refresh?['scope','month','expected_revision','request_id']:['scope','month'])||!exact(input.scope,['organization_id','store_id','currency'])||!token(input.scope.organization_id)||!token(input.scope.store_id)||input.scope.currency!=='BRL'||typeof input.month!=='string'||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(input.month)||refresh&&(!integer(input.expected_revision)||!token(input.request_id)))fail('REQUEST_INVALID');
  const context=env?.COMMERCIAL_CONTEXT;
  if(context!==undefined&&context!==null){
    if(!isCommercialContext(context)||!tenantDatabaseHasContext(env.ADMIN_DB,context))fail('SCOPE_MISMATCH',403);
    assertCommercialCapability(context,'finance.read');
    if(refresh)assertCommercialCapability(context,'bank.write');
  }
  const organization=context?.organizationId??'legacy-brazacommerce',store=context?.storeId??'legacy-shopee';
  if(input.scope.organization_id!==organization||input.scope.store_id!==store)fail('SCOPE_MISMATCH',403);
  return {...input,scope:{...input.scope}};
}
function configuration(options,refresh=false){
  if(!exact(options,[],refresh?['now','readLedger','register']:['now','readLedger'])||Reflect.ownKeys(options).some(key=>options[key]!==undefined&&typeof options[key]!=='function'))fail('CONFIGURATION',503);
  return {now:options.now??Date.now,readLedger:options.readLedger};
}
function capturedTime(now){
  let millis;try{millis=now();}catch{fail('CLOCK_INVALID',503);}
  if(!Number.isSafeInteger(millis)||millis<1)fail('CLOCK_INVALID',503);
  let value;try{value=new Date(millis).toISOString();}catch{fail('CLOCK_INVALID',503);}
  if(!/^20\d{2}-/.test(value))fail('CLOCK_INVALID',503);return value;
}

// Server-only producer. It accepts identifiers, reads the saved ledger itself
// and sends no expense text or inferred bank/payment facts to the sidecar.
export async function captureFinancialExpenseObligationSnapshot(env,input,options={}){
  const selected=select(env,input),{now,readLedger}=configuration(options);
  const read=readLedger??(month=>readExpenseLedger(env,{month},{now}));
  let raw;try{raw=await read(selected.month);}catch{fail('SOURCE_UNAVAILABLE',503);}
  const ledger=projectExpenseLedger(raw);
  if(!ledger||ledger.month!==selected.month)fail('SOURCE_INVALID',503);
  // Recheck the server context after an asynchronous source read as well.
  select(env,input);
  const snapshot=projectFinancialObligationSnapshot({schema:'app_expense_observation_v1',scope:selected.scope,month:selected.month,ledger_revision:ledger.revision,mode:ledger.mode,captured_at:capturedTime(now),source_hash:'0'.repeat(64),items:ledger.items.map(row=>({expense_id:row.id,amount_cents:row.amount_cents,status:row.status,competence_month:row.competence_month,due_date:row.due_date,paid_date:row.paid_date,updated_at:row.updated_at}))});
  if(!snapshot)fail('SOURCE_INVALID',503);
  return {...snapshot,source_hash:await financialObligationSnapshotHash(snapshot)};
}

// A receipt captures an as-of observation, not a distributed transaction.
// Re-reading the material source after registration detects an intervening App
// edit and prevents treating the old receipt as a fresh allocation authority.
export async function refreshFinancialExpenseObligations(env,input,options={}){
  const selected=select(env,input,true),configured=configuration(options,true);
  const sourceOptions={now:configured.now,...(configured.readLedger?{readLedger:configured.readLedger}:{})};
  const snapshot=await captureFinancialExpenseObligationSnapshot(env,{scope:selected.scope,month:selected.month},sourceOptions);
  const command=projectFinancialObligationRequest({schema:'financial_obligation_source_request_v1',operation:'register',request_id:selected.request_id,expected_revision:selected.expected_revision,snapshot});
  if(!command)fail('SOURCE_INVALID',503);
  const register=options.register??(value=>getFinanceFinancialAutomation(env,'obligations',value));
  let result;try{result=await register(command);}catch{fail('REGISTRATION_UNAVAILABLE',503);}
  select(env,input,true);
  if(result?.status!==200){
    const code=result?.body?.error;
    if(![400,401,403,404,409,413,429,502,503,504].includes(result?.status)||typeof code!=='string'||!/^(?:FINANCIAL|FINANCE|COMMERCIAL|TENANT)_[A-Z_]{1,100}$/.test(code))fail('REGISTRATION_UNAVAILABLE',503);
    return {status:result.status,body:{schema:'financial_private_error_v1',error:code}};
  }
  const frame=projectFinancialObligationResponse(result.body);
  if(!frame||!financialObligationResponseMatches(command,frame))fail('RESPONSE_INVALID',502);
  const after=await captureFinancialExpenseObligationSnapshot(env,{scope:selected.scope,month:selected.month},sourceOptions);
  if(after.source_hash!==snapshot.source_hash)fail('SOURCE_CHANGED',409);
  return {status:200,body:frame};
}
