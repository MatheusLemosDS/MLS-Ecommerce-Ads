// Only fixed support codes may cross the private Workers and reach the admin UI.
export function safeOrdersDiagnostic(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const stages=['APP_TO_AUTH','AUTH_TO_GATEWAY','AUTH_VALIDATION','APP_VALIDATION','APP_CONFIG','AUTH_CONFIG'];
 const codes=['HTTP_STATUS','TIMEOUT','NETWORK_ERROR','INVALID_JSON','BODY_LIMIT','RUNTIME_UNSUPPORTED','INVALID_RESPONSE','STALE_DATE','MISSING_BINDING','INTERNAL_ERROR'];
 if(!stages.includes(value.stage)||!codes.includes(value.code)||(value.http!==null&&(!Number.isSafeInteger(value.http)||value.http<100||value.http>599)))return null;
 const result={stage:value.stage,code:value.code,http:value.http};
 if(value.validation!==undefined){if(!['INVALID_RESPONSE','STALE_DATE'].includes(value.validation))return null;result.validation=value.validation;}
 return result;
}

export function ordersReadDiagnostic(result,stage){
 const supplied=safeOrdersDiagnostic(result?.diagnostic)||safeOrdersDiagnostic(result?.upstream_diagnostic);
 if(supplied)return supplied;
 const codes=['HTTP_STATUS','TIMEOUT','NETWORK_ERROR','INVALID_JSON','BODY_LIMIT','RUNTIME_UNSUPPORTED'];
 const http=Number.isSafeInteger(result?.status)&&result.status>=100&&result.status<=599?result.status:null;
 return {stage,code:codes.includes(result?.failure_code)?result.failure_code:http!==null?'HTTP_STATUS':'INTERNAL_ERROR',http:result?.http===null?null:http};
}
