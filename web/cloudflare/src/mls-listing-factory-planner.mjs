// MLS Listing Factory — deterministic staging only; never calls a marketplace.
// These are internal operator-review rules, NOT asserted Shopee API requirements.
export const MLS_LISTING_FACTORY_SCHEMA = 'mls_listing_factory_plan_v1';

const isPlain=value=>value!==null&&typeof value==='object'&&
 [Object.prototype,null].includes(Object.getPrototypeOf(value));
const isExact=(value,keys)=>isPlain(value)&&Reflect.ownKeys(value).length===keys.length&&
 keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const safeInt=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&
 !Object.is(value,-0)&&value>=min&&value<=max;
const validFile=name=>typeof name==='string'&&name.length>4&&name.length<=160&&
 !/[/\\\u0000-\u001f\u007f]/.test(name)&&!name.startsWith('.')&&
 /\.(png|jpe?g)$/i.test(name);
const validRef=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
const validSku=value=>typeof value==='string'&&/^[\w][\w.\/+\-]{0,79}$/.test(value);
const validSize=value=>typeof value==='string'&&value.length<=40&&
 /^[\p{L}\p{N} .\/+_-]{1,40}$/u.test(value)&&value.trim().length>0;
const variantSizeKey=value=>value.normalize('NFC').trim().toUpperCase();

// Stable editor identities are independent of a size label: two colours may
// both be M, and existing SKUs are not derivable from a shared prefix.
export function planMlsListingVariantRows(sizes,originals=[]){
 try{
  const dense=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&
   rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&
   Array.from({length:rows.length},(_,i)=>Object.getOwnPropertyDescriptor(rows,String(i)))
    .every(row=>row&&Object.hasOwn(row,'value'));
  if(!dense(sizes,32)||!dense(originals,50)||!sizes.every(validSize)||
   !originals.every(row=>isExact(row,['size','sku'])&&validSize(row.size)&&validSku(row.sku)))return null;
  const keys=sizes.map(variantSizeKey),selected=new Set(keys),skus=new Set();
  if(selected.size!==sizes.length)return null;
  for(const row of originals){if(skus.has(row.sku))return null;skus.add(row.sku);}
  const retained=new Set(),rows=[];
  for(let index=0;index<originals.length;index++){
   const row=originals[index],key=variantSizeKey(row.size);
   if(!selected.has(key))continue;
   retained.add(key);rows.push({key:'saved-'+index,size:row.size,sku:row.sku,original:true});
  }
  for(let index=0;index<sizes.length;index++)if(!retained.has(keys[index]))
   rows.push({key:'new-'+keys[index],size:sizes[index],sku:null,original:false});
  return rows.length<=50?rows:null;
 }catch{return null;}
}

// Used only for a new row or an explicit prefix replacement, never to recover
// an imported SKU. This is an internal naming aid, not a marketplace rule.
export function generateMlsListingSku(prefix,size){
 if(typeof prefix!=='string'||!/^[\w][\w.\/+\-]{0,59}$/.test(prefix)||!validSize(size))return null;
 const suffix=size.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
  .replace(/[^A-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'');
 const value=prefix.toUpperCase()+'-'+suffix;
 return suffix&&validSku(value)?value:null;
}

function projectMedia(name,media){
 if(!isExact(media,['name','mime','width','height','size_bytes','sha256','inspection'])||
  media.name!==name||!['image/png','image/jpeg'].includes(media.mime)||
  media.mime!==(name.toLowerCase().endsWith('.png')?'image/png':'image/jpeg')||
  !safeInt(media.width,1,50000)||!safeInt(media.height,1,50000)||
  !safeInt(media.size_bytes,1,2097152)||typeof media.sha256!=='string'||
  !/^[a-f0-9]{64}$/.test(media.sha256)||media.inspection!=='HEADER_ONLY_SHA256')
  return null;
 return {name,mime:media.mime,width:media.width,height:media.height,
  size_bytes:media.size_bytes,sha256:media.sha256,inspection:'HEADER_ONLY_SHA256'};
}

export function planMlsListingFactory(input,mediaIndex){
 try{
  if(!isExact(input,['schema','marketplace','items'])||
   input.schema!=='mls_listing_factory_input_v1'||input.marketplace!=='SHOPEE_BR'||
   !Array.isArray(input.items)||input.items.length<1||input.items.length>500||
   !isPlain(mediaIndex))return null;
  const ids=new Set(),skus=new Set(),products=[],chunks=[];
  for(const item of input.items){
   if(!isExact(item,['client_ref','title','description','images','variants'])||
    !validRef(item.client_ref)||ids.has(item.client_ref)||
    typeof item.title!=='string'||typeof item.description!=='string'||
    !Array.isArray(item.images)||item.images.length>30||
    !Array.isArray(item.variants)||item.variants.length>50)return null;
   ids.add(item.client_ref);
   const errors=[],warnings=[],imageRows=[],variants=[],imageNames=new Set();
   const title=item.title.normalize('NFC').trim(),description=item.description.normalize('NFC').trim();
   if(title.length<5||title.length>120||/[\u0000-\u001f\u007f]/.test(title))
    errors.push('TITLE_INVALID_INTERNAL_RULE');
   if(description.length<15||description.length>5000||
    /[\u0000-\u0008\u000b-\u001f\u007f]/.test(description))
    errors.push('DESCRIPTION_INVALID_INTERNAL_RULE');
   if(title.length<35)warnings.push('TITLE_KEYWORD_COVERAGE_REVIEW');
   if(item.images.length<5||item.images.length>9)errors.push('IMAGE_COUNT_5_TO_9_INTERNAL_RULE');
   for(const name of item.images){
    if(!validFile(name)||imageNames.has(name)){
     errors.push('IMAGE_NAME_OR_DUPLICATE_INVALID');continue;
    }
    imageNames.add(name);
    const descriptor=Object.getOwnPropertyDescriptor(mediaIndex,name);
    const frame=descriptor&&Object.hasOwn(descriptor,'value')?projectMedia(name,descriptor.value):null;
    if(!frame){errors.push('IMAGE_NOT_VERIFIED_OR_UNAVAILABLE');continue;}
    if(frame.width<500||frame.height<500)errors.push('IMAGE_BELOW_500_PX_INTERNAL_RULE');
    if(Math.abs(frame.width-frame.height)/Math.max(frame.width,frame.height)>.01)
     errors.push('IMAGE_NOT_SQUARE_INTERNAL_RULE');
    if(frame.width<1024||frame.height<1024)warnings.push('IMAGE_BELOW_1024_PX_RECOMMENDATION');
    imageRows.push(frame);
   }
   if(item.variants.length<1||item.variants.length>32)errors.push('VARIANT_COUNT_INVALID');
   const localSkus=new Set();
   for(const variant of item.variants){
    if(!isExact(variant,['sku','size','price_cents','stock_quantity'])||
     !validSku(variant.sku)||localSkus.has(variant.sku)||skus.has(variant.sku)||
     !validSize(variant.size)||
     !safeInt(variant.price_cents,1,100000000)||
     !(variant.stock_quantity===null||safeInt(variant.stock_quantity,0,1000000))){
      errors.push('VARIANT_DATA_INVALID');continue;
    }
    localSkus.add(variant.sku);skus.add(variant.sku);
    if(variant.stock_quantity===null)warnings.push('STOCK_UNVERIFIED');
    variants.push({...variant});
   }
   const uniqueErrors=[...new Set(errors)],uniqueWarnings=[...new Set(warnings)];
   products.push({client_ref:item.client_ref,title,description,
    images:imageRows,variants,status:uniqueErrors.length?'NEEDS_CORRECTION':'READY_FOR_OPERATOR_REVIEW',
    errors:uniqueErrors,warnings:uniqueWarnings,
    seller_publication_allowed:false,provider_task_id:null,
    data_source:'OPERATOR_LOCAL_FILES_AND_DECLARED_FIELDS_NOT_SHOPEE'});
  }
  for(let i=0;i<products.length;i+=100){
   const part=products.slice(i,i+100);
   chunks.push({batch_number:chunks.length+1,client_refs:part.map(p=>p.client_ref),
    ready_for_review:part.filter(p=>p.status==='READY_FOR_OPERATOR_REVIEW').length,
    submit_allowed:false,provider_task_id:null});
  }
  return {schema:MLS_LISTING_FACTORY_SCHEMA,marketplace:'SHOPEE_BR',mode:'DRAFT_ONLY',
   published:false,execution_allowed:false,api_permission_verified:false,
   sku_inventory_verified:false,
   assumptions:['TITLE_IMAGE_AND_SIZE_RULES_ARE_INTERNAL_NOT_OFFICIAL_SHOPEE_REQUIREMENTS',
    'IMAGE_INSPECTION_IS_HEADER_ONLY_NOT_FULL_PIXEL_DECODE',
    'NO_MEDIA_UPLOAD_OR_MARKETPLACE_WRITE',
    'M2_PRICING_AND_M6_APPROVAL_GATES_STILL_REQUIRED'],
   summary:{items:products.length,ready_for_review:products.filter(p=>p.status==='READY_FOR_OPERATOR_REVIEW').length,
    needs_correction:products.filter(p=>p.status!=='READY_FOR_OPERATOR_REVIEW').length,
    batches:chunks.length},batches:chunks,products};
 }catch{return null;}
}


// Pure filename-to-draft matcher for locally decoded media. Never performs I/O.
// A repeated filename in a selection is ambiguous even when bytes appear equal.
export function planMlsDraftBatchMedia(manifest,observed){
 try{
  const staged=planMlsListingFactory(manifest,Object.create(null));
  if(!staged||!Array.isArray(observed)||observed.length<1||observed.length>200||
   Object.getPrototypeOf(observed)!==Array.prototype)return null;
  const requested=new Set();
  for(const row of manifest.items){
   if(!Array.isArray(row.images)||row.images.length>30)return null;
   const local=new Set();
   for(const name of row.images){
    if(!validFile(name)||local.has(name))return null;
    local.add(name);requested.add(name);
   }
  }
  const media=new Map();let bytes=0;
  for(const raw of observed){
   if(!isPlain(raw)||!validFile(raw.name)||media.has(raw.name))return null;
   const checked=projectMedia(raw.name,raw);
   if(!checked)return null;
   bytes+=checked.size_bytes;
   if(bytes>64*1024*1024)return null;
   media.set(checked.name,checked);
  }
  const matched_names=[...media.keys()].filter(name=>requested.has(name));
  if(!matched_names.length)return null;
  const per_item=manifest.items.map(item=>({
   client_ref:item.client_ref,
   expected_count:item.images.length,
   matched_names:item.images.filter(name=>media.has(name)),
   not_in_selection:item.images.filter(name=>!media.has(name))
  }));
  return {
   schema:'mls_listing_batch_media_relink_v1',mode:'LOCAL_ONLY',
   published:false,execution_allowed:false,
   selected_count:observed.length,matched_unique_files:matched_names.length,
   matched_item_count:per_item.filter(x=>x.matched_names.length>0).length,
   reused_across_items:per_item.reduce((total,x)=>total+x.matched_names.length,0)-matched_names.length,
   unused_names:[...media.keys()].filter(name=>!requested.has(name)),
   per_item,match_basis:'EXACT_FILENAME_AND_DECODED_LOCAL_METADATA_NOT_ORIGINAL_HASH_ATTESTATION',
   owner_review_required:true
  };
 }catch{return null;}
}
