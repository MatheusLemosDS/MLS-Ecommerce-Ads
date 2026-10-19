// This is a schema observation, never an order, financial balance or profit.
const SAMPLE_INCOME_FIELDS = new Set(['escrow_amount','original_cost_of_goods_sold','buyer_total_amount','commission_fee','service_fee','seller_transaction_fee','actual_shipping_fee','ads_escrow_top_up_fee_or_technical_support_fee','items']);
const SAMPLE_ITEM_FIELDS = new Set(['item_id','model_id','line_item_id','quantity_purchased','original_price','selling_price','order_discounted_price','is_kit','kit_items']);
const SAMPLE_FIELD_TYPES = new Set(['number','string','boolean','object','array','null','mixed']);
const SAMPLE_FAILURE_SUFFIXES = new Set(['RESPONSE_INVALID','IDENTITY_MISMATCH','STATUS_MISMATCH','CURRENCY_MISMATCH','API_ERROR','API_PERMISSION_REJECTED','API_AUTHORIZATION_REJECTED','API_SIGNATURE_REJECTED','API_PARAMETER_REJECTED','API_PARTNER_REJECTED','API_ORDER_NOT_FOUND','API_TOKEN_REJECTED','TRANSPORT_CONFIGURATION','TRANSPORT_UNAVAILABLE','REQUEST_STALE','TIMEOUT','UPSTREAM_FAILED','UPSTREAM_HTTP','UPSTREAM_CONTENT_TYPE','UPSTREAM_INVALID_JSON','UPSTREAM_BODY_TOO_LARGE']);
const SAMPLE_FIXED_FAILURES = new Set(['FINANCE_SAMPLE_UNAVAILABLE','FINANCE_SAMPLE_REQUEST_INVALID','FINANCE_CONFIGURATION_PENDING','FINANCE_CONNECTION_DISABLED','FINANCE_AUTHORIZATION_REQUIRED','FINANCE_AUTHORIZATION_IN_PROGRESS','FINANCE_AUTHORIZATION_CONFLICT','FINANCE_REFRESH_IN_PROGRESS','FINANCE_REFRESH_CONFLICT','FINANCE_REVISION_CONFLICT','FINANCE_REFRESH_FAILED','FINANCE_REFRESH_TRANSPORT_UNAVAILABLE','FINANCE_REFRESH_COORDINATOR_CONFIGURATION','FINANCE_DATABASE_CONFIGURATION','FINANCE_STORAGE_UNAVAILABLE','FINANCE_ENCRYPTION_CONFIGURATION','FINANCE_ENCRYPTION_KEY_MISMATCH','FINANCE_TOKEN_DECRYPT_FAILED','FINANCE_CLOCK_CONFIGURATION','FINANCE_SAMPLE_PARTNER_KEY_INVALID','FINANCE_SAMPLE_TRANSPORT_UNAVAILABLE','FINANCE_SAMPLE_TRANSPORT_CONFIGURATION','FINANCE_SAMPLE_APP_CONFIGURATION','FINANCE_SAMPLE_APP_TIMEOUT','FINANCE_SAMPLE_APP_UPSTREAM_FAILED','FINANCE_SAMPLE_APP_RESPONSE_INVALID']);

export function financeSampleDiagnostic(value){
 const code=value?.code;
 const stage=typeof code==='string'?code.match(/^FINANCE_SAMPLE_(LIST|DETAIL|PAYMENT)_(.+)$/):null;
 const refresh=typeof code==='string'?code.match(/^FINANCE_REFRESH_(.+)$/):null;
 const safe=SAMPLE_FIXED_FAILURES.has(code)||['FINANCE_SAMPLE_CONFIGURATION','FINANCE_SAMPLE_SIGNING_KEY_CONFIGURATION','FINANCE_SAMPLE_SIGNATURE_UNAVAILABLE','FINANCE_SAMPLE_CLOCK_CONFIGURATION','FINANCE_SAMPLE_AUTHORIZATION_EXPIRED'].includes(code)||(stage&&SAMPLE_FAILURE_SUFFIXES.has(stage[2]))||(refresh&&new Set([...SAMPLE_FAILURE_SUFFIXES,'REQUEST_INVALID','TOKEN_INVALID','RESPONSE_CONTEXT_INVALID','RESPONSE_EXPIRED','TOKEN_NOT_ROTATED']).has(refresh[1]));
 return {code:safe?code:'FINANCE_SAMPLE_UNAVAILABLE',http:Number.isInteger(value?.http)&&value.http>=100&&value.http<=599?value.http:null};
}

export function projectFinanceSample(value){
 const unavailable=()=>({schema_version:1,status:'UNAVAILABLE',diagnostic:financeSampleDiagnostic(value?.diagnostic)});
 if(value?.status==='UNAVAILABLE')return unavailable();
 if(!value||value.schema_version!==1||!['EMPTY','VALIDATED'].includes(value.status)||!Number.isSafeInteger(value.checked_at)||value.checked_at<=0||value.checked_at>9999999999||!Number.isSafeInteger(value.token_revision)||value.token_revision<1||!Number.isSafeInteger(value.item_count)||value.item_count<0||value.item_count>1000)return unavailable();
 const fields=(rows,names)=>{
  if(!Array.isArray(rows)||rows.length>names.size)return null;
  const seen=new Set(),result=[];
  for(const row of rows){if(!row||!names.has(row.name)||seen.has(row.name)||!SAMPLE_FIELD_TYPES.has(row.type))return null;seen.add(row.name);result.push({name:row.name,type:row.type});}
  return result;
 };
 const income=fields(value.fields,SAMPLE_INCOME_FIELDS),items=fields(value.item_fields,SAMPLE_ITEM_FIELDS);
 if(!income||!items)return unavailable();
 if(value.status==='EMPTY'&&(income.length||items.length||value.item_count!==0))return unavailable();
 if(value.status==='VALIDATED'&&value.identity_match!==true)return unavailable();
 return {schema_version:1,status:value.status,checked_at:value.checked_at,token_revision:value.token_revision,fields:income,item_fields:items,item_count:value.item_count,...(value.status==='VALIDATED'?{identity_match:true}:{})};
}
