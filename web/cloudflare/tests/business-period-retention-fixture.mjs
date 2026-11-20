import assert from 'node:assert/strict';
import {projectBusinessPeriodRetentionRequest,projectBusinessPeriodRetentionResponse,businessPeriodRetentionResponseMatches} from '../../finance/src/business-period-retention-frame.mjs';
import {retainFinanceBusinessPeriodPublication,prepareFinanceBusinessPeriodPublication,confirmFinanceBusinessPeriodPublication,releaseFinanceBusinessPeriodCohort} from '../../finance/src/business-period-retention.mjs';

// Pure App tests explicitly model the fixed private service's exact ACK. Real
// collector fixtures supply financeEnv and exercise the actual D1 pin helper.
// This fixture never changes source money, coverage, source identities or GETs.
export function createBusinessPeriodRetentionFixture({now=Date.now,financeEnv=null,calls=[]}={}){
 return async(_env,value)=>{
  const command=projectBusinessPeriodRetentionRequest(value);assert.ok(command,'fixture requires an exact private retention command');calls.push(structuredClone(command));
  let body;
  if(financeEnv){
   const input=command.operation==='release'?{month:command.month,lease_id:command.lease_id}:{kind:command.kind,month:command.month,publication_revision:command.publication_revision,slots:command.slots,...(command.kind==='COHORT'?{lease_id:command.lease_id}:{})};
   const action=command.operation==='release'?releaseFinanceBusinessPeriodCohort:command.operation==='confirm'?confirmFinanceBusinessPeriodPublication:command.operation==='prepare'?prepareFinanceBusinessPeriodPublication:retainFinanceBusinessPeriodPublication;
   try{body=await action(financeEnv,input,{now});}catch(error){return {status:error.status??503,body:{schema:'finance_business_period_retention_error_v1',error:error.code??'FINANCE_BUSINESS_RETENTION_STORAGE_UNAVAILABLE'}};}
  }else{
   const stamp=Math.floor(now()/1000);
   body=command.operation==='release'?{schema:'finance_business_period_retention_v1',state:'RELEASED',kind:'COHORT',month:command.month,lease_id:command.lease_id,released:true,released_at:stamp}:{schema:'finance_business_period_retention_v1',state:command.kind==='PUBLICATION'&&command.operation!=='confirm'?'PREPARED':'RETAINED',kind:command.kind,month:command.month,publication_revision:command.publication_revision,retained_slots:command.slots.length,retained_at:stamp,lease_id:command.kind==='COHORT'?command.lease_id:null,expires_at:command.kind==='COHORT'?stamp+900:null};
  }
  assert.ok(projectBusinessPeriodRetentionResponse(body),'fixture returns an exact private retention ACK');assert.ok(businessPeriodRetentionResponseMatches(command,body),'fixture ACK must match the requested manifest');
  return {status:200,body};
 };
}
