// Shopee Product > v2.product.get_item_list (GET): offset, page_size and one
// item_status filter. The internal page limit is deliberately lower than the
// documented provider maximum of 100. Deleted statuses are historical records,
// never a claim that a listing is available for sale.
export const PRODUCT_INDEX_STATUSES=Object.freeze(['NORMAL','BANNED','UNLIST','REVIEWING','SELLER_DELETE','SHOPEE_DELETE']);

export function projectProductIndexRequest(value){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const integer=(row,min,max)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
 try{
  const keys=['offset','page_size','item_status'];if(!plain(value)||Reflect.ownKeys(value).length!==keys.length||!keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'))||!integer(value.offset,0,1000000)||!integer(value.page_size,1,50)||!['NORMAL','BANNED','UNLIST','REVIEWING','SELLER_DELETE','SHOPEE_DELETE'].includes(value.item_status))return null;
  return {offset:value.offset,page_size:value.page_size,item_status:value.item_status};
 }catch{return null;}
}

export function projectProductIndexFrame(value){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const integer=(row,min,max)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
 const array=rows=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=50&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,index)=>Object.getOwnPropertyDescriptor(rows,String(index))).every(field=>field&&Object.hasOwn(field,'value'));
 try{
  if(!exact(value,['schema','status','shop_id','checked_at','offset','page_size','item_status','total_count','has_more','next_offset','items'])||value.schema!=='product_index_v1'||value.status!=='AVAILABLE'||value.shop_id!==1178167501||!integer(value.checked_at,1,9999999999)||!integer(value.offset,0,1000000)||!integer(value.page_size,1,50)||!['NORMAL','BANNED','UNLIST','REVIEWING','SELLER_DELETE','SHOPEE_DELETE'].includes(value.item_status)||!integer(value.total_count,0,1000000)||typeof value.has_more!=='boolean'||!array(value.items)||value.items.length>value.page_size||value.items.length>value.total_count)return null;
  if(value.has_more?(value.items.length===0||!integer(value.next_offset,value.offset+1,Math.min(1000000,value.offset+value.page_size))):value.next_offset!==null)return null;
  const seen=new Set(),items=[];
  for(const row of value.items){
   if(!exact(row,['item_id','item_status','source_update_time'])||typeof row.item_id!=='string'||!/^[1-9][0-9]{0,19}$/.test(row.item_id)||seen.has(row.item_id)||row.item_status!==value.item_status||row.source_update_time!==null&&!integer(row.source_update_time,0,value.checked_at+60))return null;
   seen.add(row.item_id);items.push({...row});
  }
  return {schema:value.schema,status:value.status,shop_id:value.shop_id,checked_at:value.checked_at,offset:value.offset,page_size:value.page_size,item_status:value.item_status,total_count:value.total_count,has_more:value.has_more,next_offset:value.next_offset,items};
 }catch{return null;}
}

export function productIndexRequestMatches(input,frame){return !!input&&!!frame&&input.offset===frame.offset&&input.page_size===frame.page_size&&input.item_status===frame.item_status;}

export function financeProductIndexDiagnostic(error){
 const code=Object.getOwnPropertyDescriptor(error||{},'code')?.value,suffixes=['REQUEST_INVALID','CONFIGURATION','CLOCK_CONFIGURATION','SIGNING_KEY_CONFIGURATION','AUTHORIZATION_EXPIRED','AUTH_REQUIRED','PERMISSION_REQUIRED','RATE_LIMIT','API_ERROR','RESPONSE_INVALID','IDENTITY_MISMATCH','TRANSPORT_CONFIGURATION','TRANSPORT_UNAVAILABLE','REQUEST_STALE','TIMEOUT','UPSTREAM_FAILED','UPSTREAM_HTTP','UPSTREAM_BODY_TOO_LARGE','UPSTREAM_INVALID_JSON','UPSTREAM_CONTENT_TYPE'];
 const safeCode=suffixes.some(suffix=>code==='FINANCE_PRODUCT_INDEX_'+suffix)?code:['FINANCE_AUTHORIZATION_REQUIRED','FINANCE_TOKEN_DECRYPT_FAILED','FINANCE_ENCRYPTION_KEY_MISMATCH'].includes(code)?'FINANCE_PRODUCT_INDEX_AUTH_REQUIRED':['FINANCE_REFRESH_IN_PROGRESS','FINANCE_AUTHORIZATION_IN_PROGRESS','FINANCE_REFRESH_CONFLICT','FINANCE_REVISION_CONFLICT'].includes(code)?'FINANCE_PRODUCT_INDEX_BUSY':'FINANCE_PRODUCT_INDEX_UNAVAILABLE';
 const upstream=Object.getOwnPropertyDescriptor(error||{},'upstream_status')?.value;
 return {code:safeCode,http:Number.isInteger(upstream)&&upstream>=100&&upstream<=599?upstream:null};
}
