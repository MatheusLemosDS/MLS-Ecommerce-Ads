// Closed diagnostic vocabulary only. Provider bodies, messages, request IDs and
// order identifiers must never leave the private Finance boundary as errors.
const detailCodes=new Set(['CONFIGURATION','SIGNING_CONFIGURATION','UNAVAILABLE','PERMISSION_DENIED','RATE_LIMIT','INVALID_RESPONSE','RESULT_INVALID','TRANSPORT_CONFIGURATION','TRANSPORT_UNAVAILABLE','REQUEST_STALE','TIMEOUT','UPSTREAM_FAILED','UPSTREAM_HTTP','UPSTREAM_BODY_TOO_LARGE','UPSTREAM_INVALID_JSON','UPSTREAM_CONTENT_TYPE'].map(code=>'FINANCE_INCOME_DETAIL_'+code));
const refreshCodes=new Set(['TRANSPORT_CONFIGURATION','TRANSPORT_UNAVAILABLE','REQUEST_STALE','TIMEOUT','UPSTREAM_FAILED','UPSTREAM_HTTP','UPSTREAM_BODY_TOO_LARGE','UPSTREAM_INVALID_JSON','UPSTREAM_CONTENT_TYPE','REQUEST_INVALID','TOKEN_INVALID','SIGNING_INPUT_INVALID','SIGNING_KEY_CONFIGURATION','SIGNATURE_UNAVAILABLE','API_ERROR','IDENTITY_MISMATCH','RESPONSE_CONTEXT_INVALID','RESPONSE_EXPIRED','RESPONSE_INVALID','TOKEN_NOT_ROTATED'].map(code=>'FINANCE_REFRESH_'+code));
const authorizationCodes=new Set(['FINANCE_AUTHORIZATION_REQUIRED','FINANCE_AUTHORIZATION_IN_PROGRESS','FINANCE_AUTHORIZATION_CONFLICT','FINANCE_REFRESH_CONFLICT','FINANCE_REFRESH_IN_PROGRESS','FINANCE_REFRESH_FAILED','FINANCE_REFRESH_COORDINATOR_CONFIGURATION','FINANCE_CLOCK_CONFIGURATION','FINANCE_DATABASE_CONFIGURATION','FINANCE_ENCRYPTION_CONFIGURATION','FINANCE_ENCRYPTION_FAILED','FINANCE_ENCRYPTION_KEY_MISMATCH','FINANCE_INVALID_ENCODING','FINANCE_INVALID_LEASE','FINANCE_INVALID_REVISION','FINANCE_INVALID_TOKENS','FINANCE_REVISION_CONFLICT','FINANCE_STORAGE_UNAVAILABLE','FINANCE_TOKEN_DECRYPT_FAILED']);
const providerCodes=new Set(['error_param','error_auth','error_sign','error_api_permission','error_partner_id','error_ip','error_limit','error_rate_limit','invalid_access_token','error_not_support','error_shop','error_server','error_system']);
const responseKinds=new Set(['JSON_SIGNATURE_REJECTED','JSON_CODE_REJECTED','JSON_PARAMETER_REJECTED','JSON_AUTHORIZATION_REJECTED','JSON_PERMISSION_REJECTED','JSON_PARTNER_REJECTED','JSON_IP_REJECTED','JSON_UNRECOGNIZED','JSON_INVALID','JSON_BODY_TOO_LARGE','HTML_CONTENT_TYPE','OTHER_CONTENT_TYPE','ROOT_INVALID','IDENTITY_MISMATCH','PROVIDER_ERROR','INCOME_CONTAINER_MISSING','INCOME_LIST_INVALID','PAGE_CURSOR_INVALID','PAGE_SIZE_INVALID','ROW_IDENTITY_INVALID','ROW_CURRENCY_INVALID','ROW_AMOUNT_INVALID','ROW_STATUS_INVALID','ROW_TEXT_INVALID']);
const own=(value,key)=>Object.getOwnPropertyDescriptor(value??{},key)?.value;
const stageFor=code=>refreshCodes.has(code)||authorizationCodes.has(code)?'AUTHORIZATION':code==='FINANCE_INCOME_DETAIL_SIGNING_CONFIGURATION'?'SIGNING':code==='FINANCE_INCOME_DETAIL_CONFIGURATION'?'CONFIGURATION':code==='FINANCE_INCOME_DETAIL_UPSTREAM_HTTP'?'PROVIDER_HTTP':['FINANCE_INCOME_DETAIL_INVALID_RESPONSE','FINANCE_INCOME_DETAIL_PERMISSION_DENIED','FINANCE_INCOME_DETAIL_RATE_LIMIT'].includes(code)?'PROVIDER_RESPONSE':code==='FINANCE_INCOME_DETAIL_RESULT_INVALID'?'PROJECTOR':code==='FINANCE_INCOME_DETAIL_UNAVAILABLE'?'UNKNOWN':'TRANSPORT';
const knownCode=code=>detailCodes.has(code)||refreshCodes.has(code)||authorizationCodes.has(code);

export function projectIncomeDetailDiagnostic(value){
 try{
  if(!value||typeof value!=='object'||Array.isArray(value)||Reflect.ownKeys(value).length!==7||value.schema!=='finance_income_detail_diagnostic_v1'||!knownCode(value.code)||value.stage!==stageFor(value.code))return null;
  if(value.http!==null&&(!Number.isInteger(value.http)||value.http<100||value.http>599))return null;
  if(value.provider_code!==null&&!providerCodes.has(value.provider_code)||value.response_kind!==null&&!responseKinds.has(value.response_kind))return null;
  if(value.source!=='SHOPEE_FINANCE_INCOME_DETAIL')return null;
  return {schema:value.schema,source:value.source,stage:value.stage,code:value.code,http:value.http,provider_code:value.provider_code,response_kind:value.response_kind};
 }catch{return null;}
}

export function incomeDetailFailureDiagnostic(error){
 try{
  const raw=own(error,'code'),code=knownCode(raw)?raw:'FINANCE_INCOME_DETAIL_UNAVAILABLE',http=own(error,'upstream_status'),provider=own(error,'provider_code'),kind=own(error,'upstream_diagnostic');
  return {schema:'finance_income_detail_diagnostic_v1',source:'SHOPEE_FINANCE_INCOME_DETAIL',stage:stageFor(code),code,http:Number.isInteger(http)&&http>=100&&http<=599?http:null,provider_code:providerCodes.has(provider)?provider:null,response_kind:responseKinds.has(kind)?kind:null};
 }catch{return {schema:'finance_income_detail_diagnostic_v1',source:'SHOPEE_FINANCE_INCOME_DETAIL',stage:'UNKNOWN',code:'FINANCE_INCOME_DETAIL_UNAVAILABLE',http:null,provider_code:null,response_kind:null};}
}
