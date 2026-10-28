// Offline capability matrix. Capability evidence is NOT a live token probe.
export const MLS_SHOPEE_FEATURES = Object.freeze([
 {key:'PRODUCT_READ',method:'v2.product.get_item_list',intent:'READ'},
 {key:'ORDER_READ',method:'v2.order.get_order_list',intent:'READ'},
 {key:'PAYMENT_ESCROW_BATCH',method:'v2.payment.get_escrow_detail_batch',intent:'READ'},
 {key:'RETURNS_READ',method:'v2.returns.get_return_list',intent:'READ'},
 {key:'PUSH_LOST_MESSAGES',method:'v2.push.get_lost_push_message',intent:'READ'},
 {key:'MEDIA_UPLOAD',method:'v2.media_space.upload_image',intent:'WRITE'},
 {key:'PRODUCT_BATCH_CREATE',method:'v2.product.batch_add_item',intent:'WRITE'},
 {key:'ADS_PERFORMANCE',method:'v2.ads.get_product_campaign_daily_performance',intent:'READ'}
].map(row=>Object.freeze(row)));

export function auditMlsShopeeCapabilities(input=null){
 const plain=v=>v!==null&&typeof v==='object'&&
  [Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&
  keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
 const validTimestamp=v=>Number.isSafeInteger(v)&&v>=1&&v<=9999999999;
 try{
  if(input!==null&&(!exact(input,['schema','marketplace','checked_at','evidence'])||
    input.schema!=='mls_shopee_capability_evidence_v1'||input.marketplace!=='SHOPEE_BR'||
    !validTimestamp(input.checked_at)||!Array.isArray(input.evidence)||
    input.evidence.length>MLS_SHOPEE_FEATURES.length))return null;
  const map=new Map();
  for(const row of input?.evidence||[]){
   if(!exact(row,['feature','status','source','checked_at'])||
    !MLS_SHOPEE_FEATURES.some(x=>x.key===row.feature)||
    !['GRANTED','DENIED','UNKNOWN'].includes(row.status)||
    !['OPERATOR_CONFIRMED','OFFICIAL_RESPONSE'].includes(row.source)||
    !validTimestamp(row.checked_at)||row.checked_at>input.checked_at||
    map.has(row.feature))return null;
   map.set(row.feature,{...row});
  }
  const features=MLS_SHOPEE_FEATURES.map(spec=>{
   const observed=map.get(spec.key);
   const status=observed?.status||'UNKNOWN';
   return {feature:spec.key,endpoint_candidate:spec.method,intent:spec.intent,status,
    evidence_source:observed?.source||null,checked_at:observed?.checked_at||null,
    read_integration_ready:false,write_allowed:false,
    next_action:status==='DENIED'?'CONFIRM_APP_CATEGORY_AND_SCOPES':
     status==='UNKNOWN'?'VERIFY_SHOPEE_OPEN_PLATFORM_PERMISSION':
     spec.intent==='WRITE'?'REQUIRE_M6_APPROVAL_IDEMPOTENCY_AND_OFFICIAL_CONTRACT':
     'VALIDATE_ENDPOINT_REGION_SIGNATURE_AND_LIVE_RESPONSE'};
  });
  return {schema:'mls_shopee_capability_audit_v1',marketplace:'SHOPEE_BR',
   state:'EVIDENCE_ONLY_NO_LIVE_PROBE',shop_connection_verified:false,
   ads_promo_locked:true,write_allowed:false,features};
 }catch{return null;}
}
