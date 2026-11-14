import {normalizeFinancialScope,sameFinancialScope,financialCanonicalJSON} from './financial-event-ledger.mjs';

export class FinancialAccountingPolicyError extends Error{
 constructor(code,status=400){super(code);this.name='FinancialAccountingPolicyError';this.code=code;this.status=status;}
}
const faPolicyFail=code=>{throw new FinancialAccountingPolicyError('FINANCIAL_POLICY_'+code);};
const faPolicyPlain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const faPolicyExact=(v,keys)=>faPolicyPlain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
const faPolicyToken=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v);
const faPolicyInt=(v,min=0)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min;
const faPolicyDay=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const faPolicyISO=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;

// Approval is a server-authored fact. Passing this projector does not grant a
// browser permission to approve a policy, choose another company, or set tax.
export function validateFinancialAccountingPolicy(value,{scope=null}={}){
 const keys=['schema','policy_id','revision','scope','effective_from','effective_to','recognition','revenue_base','cost_basis','financial_week','timezone','late_event_policy','tax','approval'];
 if(!faPolicyExact(value,keys)||value.schema!=='financial_accounting_policy_v1'||!faPolicyToken(value.policy_id)||!faPolicyInt(value.revision,1)||!faPolicyDay(value.effective_from)||value.effective_to!==null&&(!faPolicyDay(value.effective_to)||value.effective_to<value.effective_from)||!['EXPLICIT_EVENT_COMPETENCE','COMPLETED_ORDER','DELIVERED_ORDER','PAID_ORDER_CREATE_ESTIMATE'].includes(value.recognition)||!['NET_PAYOUT','GROSS_COMPONENTS'].includes(value.revenue_base)||!['HISTORICAL_ALLOCATED_PIECES','REFERENCE_ESTIMATE'].includes(value.cost_basis)||!['CIVIL_FRIDAY_THURSDAY','CIVIL_MONDAY_SUNDAY'].includes(value.financial_week)||value.timezone!=='America/Sao_Paulo'||!['RESTATEMENT_REQUIRED','CURRENT_PERIOD_ADJUSTMENT_WITH_EVIDENCE'].includes(value.late_event_policy))faPolicyFail('INVALID');
 let checkedScope;try{checkedScope=normalizeFinancialScope(value.scope);if(scope&&!sameFinancialScope(checkedScope,scope))faPolicyFail('SCOPE_MISMATCH');financialCanonicalJSON(value);}catch(error){if(error instanceof FinancialAccountingPolicyError)throw error;faPolicyFail('INVALID');}
 const tax=value.tax;if(!faPolicyExact(tax,['regime','mode','monthly_cents','recognition','source_ref','revision']))faPolicyFail('TAX_INVALID');
 if(tax.mode==='UNCONFIGURED'){
  if(tax.regime!==null||tax.monthly_cents!==null||tax.recognition!==null||tax.source_ref!==null||tax.revision!==0)faPolicyFail('TAX_INVALID');
 }else{
  if(typeof tax.regime!=='string'||tax.regime.trim()!==tax.regime||!tax.regime||tax.regime.length>40||/[\u0000-\u001f\u007f]/.test(tax.regime)||!faPolicyToken(tax.source_ref)||!faPolicyInt(tax.revision,1))faPolicyFail('TAX_INVALID');
  if(tax.mode==='FIXED_MONTHLY'){if(!faPolicyInt(tax.monthly_cents)||tax.recognition!=='MONTH_END')faPolicyFail('TAX_INVALID');}
  else if(tax.mode!=='EXPLICIT_EVENTS'||tax.monthly_cents!==null||tax.recognition!=='SOURCE_COMPETENCE')faPolicyFail('TAX_INVALID');
 }
 const approval=value.approval;if(!faPolicyExact(approval,['state','actor_ref','at','evidence_ref'])||!['DRAFT','APPROVED'].includes(approval.state))faPolicyFail('APPROVAL_INVALID');
 if(approval.state==='APPROVED'){
  if(!faPolicyToken(approval.actor_ref)||!faPolicyISO(approval.at)||!faPolicyToken(approval.evidence_ref))faPolicyFail('APPROVAL_INVALID');
 }else if(approval.actor_ref!==null||approval.at!==null||approval.evidence_ref!==null)faPolicyFail('APPROVAL_INVALID');
 return JSON.parse(financialCanonicalJSON({...value,scope:checkedScope}));
}
export function projectFinancialAccountingPolicy(value,options={}){try{return validateFinancialAccountingPolicy(value,options);}catch{return null;}}

export function financialAccountingPolicyForPeriod(value,period,{scope=null}={}){
 const policy=projectFinancialAccountingPolicy(value,{scope}),pending=[];
 if(!policy)return {state:'UNCONFIGURED',policy_id:null,revision:null,pending:['ACCOUNTING_POLICY_REQUIRED']};
 if(policy.approval.state!=='APPROVED')pending.push('ACCOUNTING_POLICY_APPROVAL_REQUIRED');
 if(!period||!faPolicyISO(period.start_at)||!faPolicyISO(period.end_at)||period.start_at>=period.end_at)faPolicyFail('PERIOD_INVALID');
 const dateAt=v=>new Intl.DateTimeFormat('sv-SE',{timeZone:policy.timezone}).format(new Date(v));
 const first=dateAt(period.start_at),last=dateAt(new Date(Date.parse(period.end_at)-1).toISOString());
 if(first<policy.effective_from||policy.effective_to!==null&&last>policy.effective_to)pending.push('ACCOUNTING_POLICY_OUTSIDE_EFFECTIVE_PERIOD');
 if(period.kind==='MANUFACTURE_WEEK'||period.basis!=='EVENT_COMPETENCE')pending.push('FINANCIAL_COMPETENCE_PERIOD_REQUIRED');
 if(period.kind==='CIVIL_WEEK'&&period.calendar!==policy.financial_week)pending.push('ACCOUNTING_CALENDAR_POLICY_MISMATCH');
 if(policy.tax.mode==='UNCONFIGURED')pending.push('TAX_POLICY_REQUIRED');
 const estimate=policy.recognition==='PAID_ORDER_CREATE_ESTIMATE'||policy.cost_basis==='REFERENCE_ESTIMATE';
 if(estimate)pending.push('ESTIMATE_POLICY_NOT_FINAL_RESULT');
 return {state:pending.length?(estimate?'ESTIMATE':'PENDING'):'APPROVED',policy_id:policy.policy_id,revision:policy.revision,pending};
}

// A fixed declared monthly tax is recognized once at the approved month end.
// No day/hour split is implied; payments settle TAX_PAYABLE in another event.
export function financialAccountingTaxRecognitions(value,period,{scope=null}={}){
 const policy=validateFinancialAccountingPolicy(value,{scope}),status=financialAccountingPolicyForPeriod(policy,period,{scope});
 if(status.state!=='APPROVED'||policy.tax.mode!=='FIXED_MONTHLY')return {state:'PENDING',events:[],pending:[...status.pending,...(policy.tax.mode==='EXPLICIT_EVENTS'?['TAX_SOURCE_EVENTS_REQUIRED']:[])]};
 const dateAt=v=>new Intl.DateTimeFormat('sv-SE',{timeZone:policy.timezone}).format(new Date(v));
 const start=dateAt(period.start_at),end=dateAt(new Date(Date.parse(period.end_at)-1).toISOString());
 let month=start.slice(0,7),events=[];
 while(month<=end.slice(0,7)){
  const year=Number(month.slice(0,4)),m=Number(month.slice(5,7)),last=new Date(Date.UTC(year,m,0,12)).toISOString().slice(0,10);
  if(last>=start&&last<=end&&last>=policy.effective_from&&(policy.effective_to===null||last<=policy.effective_to))events.push({month,competence_date:last,amount_cents:policy.tax.monthly_cents,policy_id:policy.policy_id,policy_revision:policy.revision,tax_revision:policy.tax.revision,source_ref:policy.tax.source_ref,basis:'APPROVED_FIXED_MONTHLY_TAX_AT_MONTH_END'});
  month=new Date(Date.UTC(year,m,1,12)).toISOString().slice(0,7);
 }
 return {state:'READY',events,pending:[]};
}
