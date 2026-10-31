// Descriptive memory only. Cumulative monthly cutoffs are not independent
// experiments and never promote a recommendation or a commercial permission.
export function createMlsAgentLearningReport(){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
 const array=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(i))||{},'value')).every(Boolean);
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const month=v=>typeof v==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(v);
 const codes=['COLLECTING','PERIOD_LIMIT_REACHED','SOURCE_UNAVAILABLE','STATUS_REVIEW_REQUIRED','PAYMENT_INCOMPLETE','RETURNS_NOT_RECONCILED','PRODUCTION_COST_INCOMPLETE','INVOICE_TAX_UNAVAILABLE','ADS_UNAVAILABLE','EXTERNAL_EXPENSES_REQUIRED','RECHARGE_TREATMENT_REQUIRED','ADJUSTMENT_UNAVAILABLE','ARITHMETIC_UNSAFE','TAX_POLICY_REQUIRED','FINANCIAL_SOURCE_STALE'];
 const basis='PAID_ORDER_CREATE_MONTH_AND_CALENDAR_ADS_ESTIMATE';
 const observationsKeys=['schema','month','start_date','end_date','publication_revision','checked_at','source_checked_at','revisions','coverage','production_coverage','metrics','pending','basis'];
 const moneyKeys=['sales_cents','payout_cents','production_cents','known_production_cents','ads_spend_cents','net_estimate_cents','actual_profit_cents'];
 function projectObservation(value){
  try{
   if(!exact(value,observationsKeys)||value.schema!=='mls_agent_learning_observation_v1'||!month(value.month)||value.start_date!==value.month+'-01'||!day(value.end_date)||value.end_date.slice(0,7)!==value.month||!int(value.publication_revision,1,2147483647)||!int(value.checked_at,1,9999999999)||value.end_date>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000))||value.basis!==basis)return null;
   const source=value.source_checked_at,revisions=value.revisions,coverage=value.coverage,production=value.production_coverage,metrics=value.metrics;
   if(!exact(source,['finance_oldest_at','finance_latest_at','ads_at'])||!Object.values(source).every(v=>v===null||int(v,1,value.checked_at))||(source.finance_oldest_at===null)!==(source.finance_latest_at===null)||source.finance_oldest_at!==null&&source.finance_oldest_at>source.finance_latest_at)return null;
   if(!exact(revisions,['bindings','costs','cost_rules','classifications','expenses','tax_policy'])||!['bindings','costs'].every(k=>int(revisions[k],1,2147483647))||!['cost_rules','classifications','tax_policy'].every(k=>revisions[k]===null||int(revisions[k],0,2147483647))||!int(revisions.expenses,0,2147483647))return null;
   if(!exact(coverage,['orders','paid','cancelled','review_orders','returns_orders','payment_missing'])||!Object.values(coverage).every(v=>int(v,0,3000))||coverage.paid+coverage.cancelled+coverage.review_orders>coverage.orders||coverage.returns_orders>coverage.paid||coverage.payment_missing>coverage.paid)return null;
   if(!exact(production,['total_units','known_units','pending_units'])||!Object.values(production).every(v=>v===null||int(v))||Object.values(production).some(v=>v===null)&&!Object.values(production).every(v=>v===null)||production.total_units!==null&&BigInt(production.total_units)!==BigInt(production.known_units)+BigInt(production.pending_units))return null;
   if(!exact(metrics,moneyKeys)||!moneyKeys.every(k=>metrics[k]===null||int(metrics[k],['payout_cents','net_estimate_cents'].includes(k)?Number.MIN_SAFE_INTEGER:0))||metrics.actual_profit_cents!==null||!array(value.pending,codes.length)||new Set(value.pending).size!==value.pending.length||!value.pending.every(v=>codes.includes(v))||value.pending.length&&metrics.net_estimate_cents!==null)return null;
   if(metrics.production_cents!==null&&metrics.production_cents!==metrics.known_production_cents||production.pending_units>0&&metrics.production_cents!==null)return null;
   return {...value,source_checked_at:{...source},revisions:{...revisions},coverage:{...coverage},production_coverage:{...production},metrics:{...metrics},pending:[...value.pending]};
  }catch{return null;}
 }
 const automatic=['COLLECT_SAVED_EVIDENCE','CHECK_DATA_QUALITY','CLASSIFY_USING_SAVED_RULES','PREPARE_REPORTS'];
 function evaluateActionPolicy(input){
  try{
   if(!exact(input,['schema','action','known_action','capability','evidence','new_risk','commercial_write','paid_provider','policy_change'])||input.schema!=='mls_agent_action_request_v1'||typeof input.action!=='string'||!/^[A-Z][A-Z0-9_]{0,63}$/.test(input.action)||!['known_action','new_risk','commercial_write','paid_provider','policy_change'].every(k=>typeof input[k]==='boolean')||!['AVAILABLE','UNKNOWN','UNAVAILABLE'].includes(input.capability)||!['CURRENT','STALE','MISSING'].includes(input.evidence))return null;
   const reasons=[];if(!input.known_action||!automatic.includes(input.action))reasons.push('NEW_ACTION');if(input.new_risk)reasons.push('NEW_RISK');if(input.commercial_write)reasons.push('COMMERCIAL_WRITE');if(input.paid_provider)reasons.push('PAID_PROVIDER');if(input.policy_change)reasons.push('POLICY_CHANGE');
   const decision=reasons.length?'REQUIRE_CONFIRMATION':input.capability!=='AVAILABLE'?'BLOCKED_CAPABILITY':input.evidence!=='CURRENT'?'WAITING_EVIDENCE':'AUTOMATIC_WITH_EXISTING_POLICY';
   if(input.capability!=='AVAILABLE')reasons.push('CAPABILITY_NOT_CONFIRMED');if(input.evidence!=='CURRENT')reasons.push('CURRENT_EVIDENCE_REQUIRED');
   return {schema:'mls_agent_action_policy_v1',action:input.action,decision,reasons,grants_new_permissions:false,commercial_write_allowed:false};
  }catch{return null;}
 }
 const autonomy=()=>({mode:'OBSERVER',automatic:automatic.filter(action=>evaluateActionPolicy({schema:'mls_agent_action_request_v1',action,known_action:true,capability:'AVAILABLE',evidence:'CURRENT',new_risk:false,commercial_write:false,paid_provider:false,policy_change:false}).decision==='AUTOMATIC_WITH_EXISTING_POLICY'),confirmation_required:['NEW_ACTION','COMMERCIAL_WRITE','PAID_PROVIDER','POLICY_CHANGE'],commercial_write_allowed:false,model_training:false});
 function projectReport(input){
  try{
   if(!exact(input,['month','checked_at','observations'])||!month(input.month)||!int(input.checked_at,1,9999999999)||!array(input.observations,400))return null;
   const records=[],seen=new Set();
   for(const raw of input.observations){
    if(!exact(raw,['observation','first_observed_at','last_observed_at','correction_count']))return null;
    const observation=projectObservation(raw.observation),key=observation&&observation.month+':'+observation.end_date;
    if(!observation||seen.has(key)||!int(raw.first_observed_at,1,input.checked_at+60)||!int(raw.last_observed_at,raw.first_observed_at,input.checked_at+60)||observation.checked_at>raw.last_observed_at+60||!int(raw.correction_count,0,1000000))return null;
    seen.add(key);records.push({...raw,observation});
   }
   records.sort((a,b)=>a.observation.end_date.localeCompare(b.observation.end_date)||a.last_observed_at-b.last_observed_at);
   const selected=records.filter(row=>row.observation.month===input.month),latest=selected.at(-1)??null;
   const currentMonth=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(input.checked_at*1000)).slice(0,7);
   const closed=records.filter(row=>row.observation.month<currentMonth&&row.observation.end_date===new Date(Date.UTC(Number(row.observation.month.slice(0,4)),Number(row.observation.month.slice(5,7)),0)).toISOString().slice(0,10));
   const lessons=[];
   function add(code,agent,title,detail,predicate){
    if(!latest||!predicate(latest.observation))return;
    const matching=selected.filter(row=>predicate(row.observation));
    lessons.push({code,agent,title,detail,confidence:matching.length>1?'REPEATED':'OBSERVED',evidence_count:matching.length,first_observed_at:Math.min(...matching.map(row=>row.first_observed_at)),last_observed_at:latest.last_observed_at});
   }
   add('PRODUCTION_REFERENCE_INCOMPLETE','production','Completar as referências de custo','Há custo de produção pendente. A memória preserva a pendência e não substitui o valor por uma estimativa.',v=>v.pending.includes('PRODUCTION_COST_INCOMPLETE'));
   add('ARITHMETIC_REVIEW_REQUIRED','auditor','Conferir a consistência dos valores','O cálculo não está seguro. Os agentes devem conferir a fonte antes de recomendar qualquer ação.',v=>v.pending.includes('ARITHMETIC_UNSAFE'));
   add('RETURNS_REQUIRE_RECONCILIATION','returns','Conferir devoluções antes de concluir o resultado','Devoluções observadas precisam de conciliação. Status de solicitação não comprova débito ou recebimento bancário.',v=>v.pending.includes('RETURNS_NOT_RECONCILED'));
   add('ORDER_STATUS_REQUIRES_REVIEW','finance','Conferir situações dos pedidos','Os pedidos com situação em revisão continuam separados dos pedidos pagos; ausência de confirmação não é lucro nem perda.',v=>v.pending.includes('STATUS_REVIEW_REQUIRED'));
   add('SOURCE_REFRESH_REQUIRED','auditor','Atualizar a evidência financeira','A fonte está ausente ou antiga. O registro pode orientar a conferência, mas não libera uma ação comercial.',v=>v.pending.some(code=>['SOURCE_UNAVAILABLE','ADS_UNAVAILABLE','FINANCIAL_SOURCE_STALE'].includes(code)));
   add('PAYMENT_COVERAGE_REQUIRED','finance','Completar a cobertura dos repasses','Há pedidos pagos sem valor de repasse confirmado. O total não é preenchido com zero.',v=>v.pending.includes('PAYMENT_INCOMPLETE'));
   add('COST_REFERENCE_OBSERVED','production','Referências de custo completas neste recorte','Todas as unidades deste recorte têm custo identificado. Isso registra cobertura, sem provar lucro realizado.',v=>v.metrics.production_cents!==null&&!v.pending.includes('PRODUCTION_COST_INCOMPLETE'));
   add('MONTH_ESTIMATE_OBSERVED','finance','Estimativa disponível para conferência','O período possui uma estimativa com os custos registrados. Comparações entre períodos não demonstram efeito de uma recomendação.',v=>v.metrics.net_estimate_cents!==null&&!v.pending.length);
   if(latest?.correction_count>0)lessons.push({code:'REFERENCE_CORRECTION_RECORDED',agent:'auditor',title:'Referências corrigidas no mesmo recorte',detail:'A referência mais recente substitui os valores anteriores deste recorte. As correções ficam contadas separadamente e não são resultados independentes de uma recomendação.',confidence:'OBSERVED',evidence_count:1,first_observed_at:latest.first_observed_at,last_observed_at:latest.last_observed_at});
   if(latest&&selected.some(row=>row.observation.end_date<latest.observation.end_date&&row.observation.pending.some(code=>!latest.observation.pending.includes(code))))lessons.push({code:'CONDITION_NOT_IN_LATEST_CUTOFF',agent:'auditor',title:'Pendência anterior ausente no recorte mais recente',detail:'Uma condição registrada em um recorte anterior não consta na leitura atual. O registro descreve a mudança; não comprova o efeito de uma ação ou a liquidação bancária.',confidence:'OBSERVED',evidence_count:1,first_observed_at:latest.first_observed_at,last_observed_at:latest.last_observed_at});
   const severity={ARITHMETIC_REVIEW_REQUIRED:0,SOURCE_REFRESH_REQUIRED:1,PAYMENT_COVERAGE_REQUIRED:2,ORDER_STATUS_REQUIRES_REVIEW:2,RETURNS_REQUIRE_RECONCILIATION:2,PRODUCTION_REFERENCE_INCOMPLETE:3,REFERENCE_CORRECTION_RECORDED:4,CONDITION_NOT_IN_LATEST_CUTOFF:4,COST_REFERENCE_OBSERVED:5,MONTH_ESTIMATE_OBSERVED:5};
   lessons.sort((a,b)=>severity[a.code]-severity[b.code]||b.evidence_count-a.evidence_count||a.code.localeCompare(b.code));
   const currentDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(input.checked_at*1000));
   const stale=latest!==null&&latest.observation.month===currentMonth&&(latest.observation.end_date<currentDay||input.checked_at-latest.observation.checked_at>900||latest.observation.source_checked_at.finance_oldest_at!==null&&input.checked_at-latest.observation.source_checked_at.finance_oldest_at>900||latest.observation.source_checked_at.ads_at!==null&&input.checked_at-latest.observation.source_checked_at.ads_at>900||latest.observation.pending.includes('FINANCIAL_SOURCE_STALE'));
   return {schema:'mls_agent_learning_report_v1',month:input.month,checked_at:input.checked_at,status:!latest?'EMPTY':stale?'STALE':selected.length<2?'OBSERVING':'EVIDENCE_AVAILABLE',evidence:{cutoffs_observed:selected.length,closed_months_observed:closed.length,latest_observed_at:latest?.last_observed_at??null,latest_end_date:latest?.observation.end_date??null,revisions_observed:selected.reduce((n,row)=>n+row.correction_count,0),independent_financial_comparisons:0},latest:latest?.observation??null,lessons,autonomy:autonomy(),basis:'DESCRIPTIVE_TRUSTED_OBSERVATIONS_NOT_CAUSAL_MODEL_TRAINING'};
  }catch{return null;}
 }
 return Object.freeze({projectObservation,projectReport,evaluateActionPolicy});
}

// An advisory contract for a future executor. This never creates a grant or
// bypasses the existing backend authorization, capability and spending checks.
export function evaluateMlsAgentActionPolicy(input){return createMlsAgentLearningReport().evaluateActionPolicy(input);}
