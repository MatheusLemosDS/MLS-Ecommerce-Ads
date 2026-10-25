// Historical names are evidence from exact order item/model identities. This
// contract deliberately contains no price, inferred composition or order ID.
export function projectHistoricalVariantEvidenceRequest(value){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const array=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,i)=>Object.getOwnPropertyDescriptor(rows,String(i))).every(field=>field&&Object.hasOwn(field,'value'));
 const day=row=>typeof row==='string'&&/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(row)&&Number.isFinite(Date.parse(row+'T00:00:00Z'))&&new Date(row+'T00:00:00Z').toISOString().slice(0,10)===row;
 const cursor=row=>row===null||typeof row==='string'&&row.length>0&&row.length<=1024&&!/[^\x21-\x7e]/.test(row);
 try{
  if(!exact(value,['start_date','end_date','item_ids','cursor'])||!day(value.start_date)||!day(value.end_date)||Date.parse(value.end_date)<Date.parse(value.start_date)||Date.parse(value.end_date)-Date.parse(value.start_date)>=15*86400000||!array(value.item_ids,5)||!value.item_ids.length||!value.item_ids.every(row=>typeof row==='string'&&/^[1-9][0-9]{0,19}$/.test(row))||new Set(value.item_ids).size!==value.item_ids.length||!cursor(value.cursor))return null;
  return {start_date:value.start_date,end_date:value.end_date,item_ids:[...value.item_ids],cursor:value.cursor};
 }catch{return null;}
}

// Standalone so each private boundary and compiled client can re-project it.
// evidence_complete covers THIS page only; has_more controls the window scan.
export function projectHistoricalVariantEvidenceFrame(value){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const array=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,i)=>Object.getOwnPropertyDescriptor(rows,String(i))).every(field=>field&&Object.hasOwn(field,'value'));
 const int=(row,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
 const id=(row,zero=false)=>typeof row==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(row);
 const text=(row,max)=>typeof row==='string'&&row.trim().length>0&&new TextEncoder().encode(row).byteLength<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(row);
 const cursor=row=>row===null||typeof row==='string'&&row.length>0&&row.length<=1024&&!/[^\x21-\x7e]/.test(row);
 const day=row=>typeof row==='string'&&/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(row)&&Number.isFinite(Date.parse(row+'T00:00:00Z'))&&new Date(row+'T00:00:00Z').toISOString().slice(0,10)===row;
 const statuses=['UNPAID','READY_TO_SHIP','PROCESSED','RETRY_SHIP','SHIPPED','TO_CONFIRM_RECEIVE','COMPLETED','IN_CANCEL','CANCELLED','INVOICE_PENDING','TO_RETURN','UNKNOWN'];
 try{
  if(!exact(value,['schema','shop_id','checked_at','start_date','end_date','item_ids','cursor','has_more','next_cursor','coverage','evidence_complete','products','omitted'])||value.schema!=='historical_variant_evidence_v1'||value.shop_id!==1178167501||!int(value.checked_at,1,9999999999)||!day(value.start_date)||!day(value.end_date)||Date.parse(value.end_date)<Date.parse(value.start_date)||Date.parse(value.end_date)-Date.parse(value.start_date)>=15*86400000||!array(value.item_ids,5)||!value.item_ids.length||!value.item_ids.every(row=>id(row))||new Set(value.item_ids).size!==value.item_ids.length||!cursor(value.cursor)||typeof value.has_more!=='boolean'||!cursor(value.next_cursor))return null;
  if(value.end_date>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(value.checked_at*1000)))return null;
  // Keep this condition separate: cursor completion must not depend on boolean
  // operator precedence or a truthy opaque string from the upstream API.
  if(value.has_more?(value.next_cursor===null||value.next_cursor===value.cursor):value.next_cursor!==null)return null;
  if(typeof value.evidence_complete!=='boolean'||!exact(value.coverage,['orders_seen','target_orders','target_lines','target_units'])||!int(value.coverage.orders_seen,0,50)||!int(value.coverage.target_orders,0,value.coverage.orders_seen)||!int(value.coverage.target_lines,0,10000)||!int(value.coverage.target_units,0,100000000)||!exact(value.omitted,['target_lines','target_units'])||!int(value.omitted.target_lines,0,value.coverage.target_lines)||!int(value.omitted.target_units,0,value.coverage.target_units)||value.evidence_complete!==(value.omitted.target_lines===0&&value.omitted.target_units===0)||!array(value.products,5)||value.products.length!==value.item_ids.length)return null;
  if(value.has_more&&value.coverage.orders_seen===0||value.coverage.target_orders===0&&(value.coverage.target_lines!==0||value.coverage.target_units!==0)||value.coverage.target_lines<value.coverage.target_orders||value.coverage.target_units<value.coverage.target_lines)return null;
  let lines=0,units=0,variantCount=0;const seenProducts=new Set();
  for(const product of value.products){
   if(!exact(product,['item_id','variants'])||!id(product.item_id)||!value.item_ids.includes(product.item_id)||seenProducts.has(product.item_id)||!array(product.variants,1000))return null;seenProducts.add(product.item_id);const seenModels=new Set();
   for(const variant of product.variants){
    if(++variantCount>1000||!exact(variant,['model_id','line_count','quantity','item_names','model_names','missing_item_name_lines','missing_model_name_lines','status_counts','conflict'])||!id(variant.model_id,true)||seenModels.has(variant.model_id)||!int(variant.line_count,1,10000)||!int(variant.quantity,variant.line_count,100000000)||!int(variant.missing_item_name_lines,0,variant.line_count)||!int(variant.missing_model_name_lines,0,variant.line_count)||!array(variant.item_names,5)||!variant.item_names.every(row=>text(row,1024))||new Set(variant.item_names).size!==variant.item_names.length||!array(variant.model_names,5)||!variant.model_names.every(row=>text(row,512))||new Set(variant.model_names).size!==variant.model_names.length||!array(variant.status_counts,statuses.length)||!variant.status_counts.length||typeof variant.conflict!=='boolean'||variant.conflict!==(variant.item_names.length>1||variant.model_names.length>1))return null;
    if((variant.item_names.length===0)!==(variant.missing_item_name_lines===variant.line_count)||(variant.model_names.length===0)!==(variant.missing_model_name_lines===variant.line_count)||variant.item_names.length>variant.line_count-variant.missing_item_name_lines||variant.model_names.length>variant.line_count-variant.missing_model_name_lines)return null;
    seenModels.add(variant.model_id);let statusLines=0,statusUnits=0;const seenStatuses=new Set();
    for(const row of variant.status_counts){if(!exact(row,['status','line_count','quantity'])||!statuses.includes(row.status)||seenStatuses.has(row.status)||!int(row.line_count,1,variant.line_count)||!int(row.quantity,row.line_count,variant.quantity))return null;seenStatuses.add(row.status);statusLines+=row.line_count;statusUnits+=row.quantity;}
    if(statusLines!==variant.line_count||statusUnits!==variant.quantity)return null;lines+=variant.line_count;units+=variant.quantity;
   }
  }
  if(lines+value.omitted.target_lines!==value.coverage.target_lines||units+value.omitted.target_units!==value.coverage.target_units)return null;
  const payload=JSON.stringify(value);if(new TextEncoder().encode(payload).byteLength>65536)return null;return JSON.parse(payload);
 }catch{return null;}
}

export function historicalVariantEvidenceRequestMatches(input,frame){
 return !!input&&!!frame&&input.start_date===frame.start_date&&input.end_date===frame.end_date&&input.cursor===frame.cursor&&Array.isArray(input.item_ids)&&Array.isArray(frame.item_ids)&&input.item_ids.length===frame.item_ids.length&&input.item_ids.every((id,index)=>id===frame.item_ids[index]);
}

export function historicalVariantEvidenceDiagnostic(error){
 const code=Object.getOwnPropertyDescriptor(error||{},'code')?.value,prefix='FINANCE_HISTORICAL_EVIDENCE_',suffix=typeof code==='string'&&code.startsWith(prefix)?code.slice(prefix.length):null;
 const suffixes=['REQUEST_INVALID','CONFIGURATION','CLOCK_CONFIGURATION','SIGNING_KEY_CONFIGURATION','AUTHORIZATION_EXPIRED','AUTH_REQUIRED','PERMISSION_REQUIRED','RATE_LIMIT','API_REJECTED','RESPONSE_INVALID','IDENTITY_MISMATCH','CURSOR_INVALID','LIST_INVALID','DETAIL_INVALID','METADATA_INVALID','EVIDENCE_LIMIT','READ_BUDGET','BUSY','UNAVAILABLE','TRANSPORT_CONFIGURATION','TRANSPORT_UNAVAILABLE','REQUEST_STALE','TIMEOUT','UPSTREAM_FAILED','UPSTREAM_HTTP','UPSTREAM_BODY_TOO_LARGE','UPSTREAM_INVALID_JSON','UPSTREAM_CONTENT_TYPE'];
 const safeCode=suffix!==null&&(suffixes.includes(suffix)||['LIST','DETAIL'].some(phase=>suffix.startsWith(phase+'_')&&suffixes.includes(suffix.slice(phase.length+1))))?code:['FINANCE_AUTHORIZATION_REQUIRED','FINANCE_TOKEN_DECRYPT_FAILED','FINANCE_ENCRYPTION_KEY_MISMATCH'].includes(code)?'FINANCE_HISTORICAL_EVIDENCE_AUTH_REQUIRED':['FINANCE_REFRESH_IN_PROGRESS','FINANCE_AUTHORIZATION_IN_PROGRESS','FINANCE_REFRESH_CONFLICT','FINANCE_REVISION_CONFLICT'].includes(code)?'FINANCE_HISTORICAL_EVIDENCE_BUSY':'FINANCE_HISTORICAL_EVIDENCE_UNAVAILABLE';
 const http=Object.getOwnPropertyDescriptor(error||{},'upstream_status')?.value;
 return {code:safeCode,http:Number.isInteger(http)&&http>=100&&http<=599?http:null};
}
