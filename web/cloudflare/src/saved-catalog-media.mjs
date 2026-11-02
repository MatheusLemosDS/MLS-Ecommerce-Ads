// Optional current product photos. This sidecar never changes catalogue,
// classifications, cost references, orders or the owner's print-art files.
export const CATALOG_MEDIA_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS catalog_product_media(item_id TEXT PRIMARY KEY,catalog_fingerprint TEXT NOT NULL,checked_at INTEGER NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=4096),payload_hash TEXT NOT NULL)`,
];
export const CATALOG_MEDIA_PRIORITY_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS catalog_media_priorities(item_id TEXT NOT NULL,catalog_fingerprint TEXT NOT NULL,requested_at INTEGER NOT NULL,request_token TEXT NOT NULL,PRIMARY KEY(item_id,catalog_fingerprint))`,
];

export function projectSavedCatalogMedia(value){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const list=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,i)=>Object.getOwnPropertyDescriptor(rows,String(i))).every(row=>row&&Object.hasOwn(row,'value'));
 const int=(row,min=0,max=9999999999)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
 const hash=row=>typeof row==='string'&&/^[a-f0-9]{64}$/.test(row);
 const safePhoto=text=>{
  if(typeof text!=='string'||text.length>2048||/[\u0000-\u0020\u007f-\u009f]/.test(text))return false;
  try{const url=new URL(text);return (/^down(?:-[a-z0-9]+)*\.img\.susercontent\.com$/.test(url.hostname)||['cf.shopee.com.br','cf.shopee.com'].includes(url.hostname))&&url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&url.href===text&&url.pathname.startsWith('/file/')&&url.pathname.length>6;}catch{return false;}
 };
 try{
  if(!exact(value,['schema','checked_at','products','basis'])||value.schema!=='saved_catalog_media_v1'||!int(value.checked_at,1)||value.basis!=='CURRENT_PRODUCT_PHOTOS_NOT_PRINT_ARTWORK'||!list(value.products,90))return null;
  const seen=new Set(),products=[];
  for(const row of value.products){
   if(!exact(row,['item_id','catalog_fingerprint','source_checked_at','state','image_url','basis'])||typeof row.item_id!=='string'||!(/^[1-9][0-9]{0,19}$/).test(row.item_id)||seen.has(row.item_id)||row.catalog_fingerprint!==null&&!hash(row.catalog_fingerprint)||row.source_checked_at!==null&&!int(row.source_checked_at,1,value.checked_at)||!['AVAILABLE','NOT_CAPTURED','INVALID'].includes(row.state)||row.basis!=='CURRENT_PRODUCT_PHOTO_NOT_PRINT_ARTWORK'||(row.state==='AVAILABLE'?!hash(row.catalog_fingerprint)||row.source_checked_at===null||!safePhoto(row.image_url):row.image_url!==null))return null;
   seen.add(row.item_id);products.push({...row});
  }
  return {schema:value.schema,checked_at:value.checked_at,products,basis:value.basis};
 }catch{return null;}
}

const encoder=new TextEncoder();
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('');
export async function prepareCatalogMediaRows(rows){
 return Promise.all(rows.map(async descriptor=>{const payload=JSON.stringify(descriptor);return {descriptor,payload,payload_hash:await sha(payload)};}));
}
export function catalogMediaWriteStatement(db,prepared,proof,args){
 const row=prepared.descriptor;
 return db.prepare('INSERT INTO catalog_product_media(item_id,catalog_fingerprint,checked_at,payload,payload_hash) SELECT ?,?,?,?,? WHERE '+proof+' ON CONFLICT(item_id) DO UPDATE SET catalog_fingerprint=excluded.catalog_fingerprint,checked_at=excluded.checked_at,payload=excluded.payload,payload_hash=excluded.payload_hash WHERE catalog_product_media.checked_at<=excluded.checked_at').bind(row.item_id,row.catalog_fingerprint,row.checked_at,prepared.payload,prepared.payload_hash,...args);
}

// SELECT-only even on an uninitialized database. No setup, queue or provider
// capability is reachable by viewing a saved photo.
export async function readSavedCatalogMedia(env,itemIds,{now=()=>Date.now()}={}){
 if(!Array.isArray(itemIds)||itemIds.length>90||itemIds.some(id=>typeof id!=='string'||!(/^[1-9][0-9]{0,19}$/).test(id))||new Set(itemIds).size!==itemIds.length)throw Object.assign(Error('CATALOG_MEDIA_REQUEST_INVALID'),{status:400});
 const clock=now();if(!Number.isSafeInteger(clock)||clock<1||clock>9999999999999)throw Object.assign(Error('CATALOG_MEDIA_CLOCK_INVALID'),{status:503});
 const stamp=Math.floor(clock/1000),products=itemIds.map(item_id=>({item_id,catalog_fingerprint:null,source_checked_at:null,state:'NOT_CAPTURED',image_url:null,basis:'CURRENT_PRODUCT_PHOTO_NOT_PRINT_ARTWORK'}));
 try{
  const db=env?.ADMIN_DB;if(!db?.prepare)throw Error();
  const tables=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('catalog_product_media','catalog_classification_jobs')").all(),names=new Set((tables?.results??[]).map(row=>row.name));
  if(names.has('catalog_product_media')&&names.has('catalog_classification_jobs')&&products.length){
   const found=await db.prepare('SELECT j.item_id,j.catalog_fingerprint AS current_fingerprint,j.checked_at AS current_checked_at,m.catalog_fingerprint AS media_fingerprint,m.checked_at AS media_checked_at,m.payload,m.payload_hash FROM catalog_classification_jobs j LEFT JOIN catalog_product_media m ON m.item_id=j.item_id WHERE j.item_id IN(SELECT value FROM json_each(?))').bind(JSON.stringify(itemIds)).all(),byId=new Map((found?.results??[]).map(row=>[row.item_id,row]));
   for(let i=0;i<products.length;i++){
    const source=byId.get(products[i].item_id);if(!source)continue;
    if(typeof source.current_fingerprint==='string'&&/^[a-f0-9]{64}$/.test(source.current_fingerprint))products[i].catalog_fingerprint=source.current_fingerprint;
    if(source.media_fingerprint!==source.current_fingerprint||source.media_checked_at!==source.current_checked_at||typeof source.payload!=='string')continue;
    try{
     if(encoder.encode(source.payload).byteLength>4096||typeof source.payload_hash!=='string'||await sha(source.payload)!==source.payload_hash)throw Error();
     const row=JSON.parse(source.payload),entry={item_id:row.item_id,catalog_fingerprint:row.catalog_fingerprint,source_checked_at:row.checked_at,state:row.state,image_url:row.image_url,basis:row.basis};
     if(Reflect.ownKeys(row).length!==6||row.item_id!==products[i].item_id||row.catalog_fingerprint!==source.current_fingerprint||row.checked_at!==source.current_checked_at||!projectSavedCatalogMedia({schema:'saved_catalog_media_v1',checked_at:stamp,products:[entry],basis:'CURRENT_PRODUCT_PHOTOS_NOT_PRINT_ARTWORK'}))throw Error();
     products[i]=entry;
    }catch{products[i].state='INVALID';}
   }
  }
 }catch{/* Optional photo storage never prevents the ordinary catalogue read. */}
 const result=projectSavedCatalogMedia({schema:'saved_catalog_media_v1',checked_at:stamp,products,basis:'CURRENT_PRODUCT_PHOTOS_NOT_PRINT_ARTWORK'});
 if(!result)throw Object.assign(Error('CATALOG_MEDIA_RESULT_INVALID'),{status:503});return result;
}

// Scheduler-only, bounded acceleration of the existing catalogue queue. The
// durable pair marker permits at most one early observation per fingerprint.
// It never performs a source read, clears a backoff, changes classification
// content or consumes a live lease. Owner GET paths must not call this helper.
export async function enqueueMissingCatalogMedia(env,{limit=3,itemIds=null,now=()=>Date.now()}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>3||itemIds!==null&&(!Array.isArray(itemIds)||itemIds.length>90||itemIds.some(id=>typeof id!=='string'||!(/^[1-9][0-9]{0,19}$/).test(id))||new Set(itemIds).size!==itemIds.length))throw Object.assign(Error('CATALOG_MEDIA_PRIORITY_INVALID'),{status:400});
 const value=now();if(!Number.isSafeInteger(value)||value<1||value>9999999999999)throw Object.assign(Error('CATALOG_MEDIA_CLOCK_INVALID'),{status:503});
 const stamp=Math.floor(value/1000),result={schema:'catalog_media_priority_v1',status:'IDLE',scheduled_item_ids:[]};if(itemIds?.length===0)return result;
 try{
  const db=env?.ADMIN_DB;if(!db?.prepare||!db?.batch)return {...result,status:'UNAVAILABLE'};
  await db.batch([...CATALOG_MEDIA_SCHEMA,...CATALOG_MEDIA_PRIORITY_SCHEMA].map(sql=>db.prepare(sql)));
  const candidates=await db.prepare("SELECT j.item_id,j.catalog_fingerprint,j.source_hash,j.checked_at,j.write_token,j.lease_token,j.lease_until,j.next_attempt_at,m.payload AS media_payload,m.payload_hash AS media_payload_hash,m.catalog_fingerprint AS media_fingerprint,m.checked_at AS media_checked_at FROM catalog_classification_jobs j LEFT JOIN catalog_product_media m ON m.item_id=j.item_id WHERE j.status IN('MATCHED','REVIEW') AND j.failure_count=0 AND j.checked_at IS NOT NULL AND j.catalog_fingerprint IS NOT NULL AND j.source_hash IS NOT NULL AND j.next_attempt_at>? AND (j.lease_token IS NULL OR j.lease_until<=?) AND NOT EXISTS(SELECT 1 FROM catalog_classification_changes c WHERE c.item_id=j.item_id) AND NOT EXISTS(SELECT 1 FROM catalog_media_priorities p WHERE p.item_id=j.item_id AND p.catalog_fingerprint=j.catalog_fingerprint)"+(itemIds===null?'':' AND j.item_id IN(SELECT value FROM json_each(?))')+' ORDER BY j.next_attempt_at,length(j.item_id),j.item_id LIMIT 90').bind(stamp,stamp,...(itemIds===null?[]:[JSON.stringify(itemIds)])).all();
  const selected=[];
  for(const row of candidates?.results??[]){
   if(typeof row.item_id!=='string'||!(/^[1-9][0-9]{0,19}$/).test(row.item_id)||typeof row.catalog_fingerprint!=='string'||!(/^[a-f0-9]{64}$/).test(row.catalog_fingerprint)||typeof row.source_hash!=='string'||!(/^[a-f0-9]{64}$/).test(row.source_hash)||!Number.isSafeInteger(row.checked_at)||row.checked_at<1||row.checked_at>stamp)continue;
   if(!Number.isSafeInteger(row.next_attempt_at)||row.next_attempt_at<=stamp||row.next_attempt_at>9999999999||row.write_token!==null&&(typeof row.write_token!=='string'||!/^[a-f0-9-]{36}$/.test(row.write_token))||(row.lease_token===null)!==(row.lease_until===null)||row.lease_token!==null&&(typeof row.lease_token!=='string'||!/^[a-f0-9-]{36}$/.test(row.lease_token)||!Number.isSafeInteger(row.lease_until)||row.lease_until<1||row.lease_until>stamp))continue;
   let observed=false;
   if(row.media_fingerprint===row.catalog_fingerprint&&typeof row.media_payload==='string'&&encoder.encode(row.media_payload).byteLength<=4096&&typeof row.media_payload_hash==='string'&&await sha(row.media_payload)===row.media_payload_hash){
    try{const media=JSON.parse(row.media_payload);observed=Reflect.ownKeys(media).length===6&&media.item_id===row.item_id&&media.catalog_fingerprint===row.catalog_fingerprint&&media.checked_at===row.media_checked_at&&!!projectSavedCatalogMedia({schema:'saved_catalog_media_v1',checked_at:stamp,products:[{item_id:media.item_id,catalog_fingerprint:media.catalog_fingerprint,source_checked_at:media.checked_at,state:media.state,image_url:media.image_url,basis:media.basis}],basis:'CURRENT_PRODUCT_PHOTOS_NOT_PRINT_ARTWORK'});}catch{}
   }
   if(!observed)selected.push(row);if(selected.length===limit)break;
  }
  if(!selected.length)return result;
  const finished=now();if(!Number.isSafeInteger(finished)||finished<value||finished>value+30000)return {...result,status:'DEFERRED'};
  const writeAt=Math.floor(finished/1000);
  const statements=[],tokens=[];
  for(const row of selected){
   const requestToken=crypto.randomUUID(),guard="EXISTS(SELECT 1 FROM catalog_classification_jobs j WHERE j.item_id=? AND j.catalog_fingerprint=? AND j.source_hash=? AND j.checked_at=? AND j.write_token IS ? AND j.status IN('MATCHED','REVIEW') AND j.failure_count=0 AND j.next_attempt_at=? AND j.next_attempt_at>? AND (j.lease_token IS NULL OR j.lease_until<=?) AND NOT EXISTS(SELECT 1 FROM catalog_classification_changes c WHERE c.item_id=j.item_id))",args=[row.item_id,row.catalog_fingerprint,row.source_hash,row.checked_at,row.write_token,row.next_attempt_at,writeAt,writeAt];
   statements.push(db.prepare('INSERT OR IGNORE INTO catalog_media_priorities(item_id,catalog_fingerprint,requested_at,request_token) SELECT ?,?,?,? WHERE '+guard).bind(row.item_id,row.catalog_fingerprint,writeAt,requestToken,...args));
   statements.push(db.prepare('UPDATE catalog_classification_jobs SET next_attempt_at=? WHERE item_id=? AND '+guard+' AND EXISTS(SELECT 1 FROM catalog_media_priorities p WHERE p.item_id=? AND p.catalog_fingerprint=? AND p.request_token=?)').bind(writeAt,row.item_id,...args,row.item_id,row.catalog_fingerprint,requestToken));tokens.push(row.item_id);
  }
  const writes=await db.batch(statements),scheduled=tokens.filter((_,index)=>writes[index*2+1]?.meta?.changes===1);
  return {...result,status:scheduled.length?'QUEUED':'DEFERRED',scheduled_item_ids:scheduled};
 }catch{return {...result,status:'UNAVAILABLE'};}
}
