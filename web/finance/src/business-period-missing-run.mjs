import {projectBusinessPeriodRequest} from './business-period-frame.mjs';

// A missing run is actionable only on this fixed private contract and for the
// exact read/step selector already authenticated by the surrounding route.
export const BUSINESS_PERIOD_MISSING_RUN_MAXIMUM=512;
export function projectBusinessPeriodMissingRun(value,selection){
 try{
  const input=projectBusinessPeriodRequest(selection),keys=['schema','code','run_id'];
  if(!input||input.operation==='start'||value===null||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value')))return null;
  if(value.schema!=='finance_business_period_missing_run_v1'||value.code!=='FINANCE_BUSINESS_RUN_NOT_FOUND'||value.run_id!==input.run_id)return null;
  return {schema:value.schema,code:value.code,run_id:input.run_id};
 }catch{return null;}
}
