// Offline lost-push recovery planning. Never acknowledges or calls Shopee.
export function planMlsLostPushRecovery(input){
 const plain=v=>v!==null&&typeof v==='object'&&
  [Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,k)=>plain(v)&&Reflect.ownKeys(v).length===k.length&&
  k.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v);
 const time=v=>Number.isSafeInteger(v)&&v>=1&&v<=9999999999;
 try{
  if(!exact(input,['schema','source','last_message_id','has_next_page','messages','persisted_ids'])||
   input.schema!=='mls_lost_push_observation_v1'||
   input.source!=='PROVIDER_LOST_PUSH_PAGINATED_READ'||
   !id(input.last_message_id)||typeof input.has_next_page!=='boolean'||
   !Array.isArray(input.messages)||input.messages.length>100||
   !Array.isArray(input.persisted_ids)||input.persisted_ids.length>10000||
   !input.persisted_ids.every(id)||new Set(input.persisted_ids).size!==input.persisted_ids.length)return null;
  const unique=new Set(),stored=new Set(input.persisted_ids),todo=[],duplicates=[];
  for(const item of input.messages){
   if(!exact(item,['message_id','event_code','observed_at'])||
    !id(item.message_id)||!Number.isSafeInteger(item.event_code)||
    item.event_code<0||item.event_code>99||!time(item.observed_at))return null;
   if(unique.has(item.message_id)){duplicates.push(item.message_id);continue;}
   unique.add(item.message_id);
   if(!stored.has(item.message_id))todo.push({...item});
  }
  return {schema:'mls_lost_push_recovery_plan_v1',mode:'OBSERVER',
   cursor:input.last_message_id,has_next_page:input.has_next_page,
   received_count:input.messages.length,already_persisted_count:
    [...unique].filter(v=>stored.has(v)).length,
   duplicate_count:duplicates.length,pending_count:todo.length,
   pending:todo,confirm_consumed_allowed:false,provider_request_allowed:false,
   reason:'CONFIRM_ONLY_AFTER_ALL_MESSAGES_IN_PAGE_VALIDATED_APPLIED_AND_PERSISTED',
   confidentiality:'METADATA_ONLY_NO_RAW_WEBHOOK_PAYLOAD'};
 }catch{return null;}
}
