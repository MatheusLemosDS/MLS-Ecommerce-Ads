// Product photos are current catalogue references, never print artwork or proof
// of the item originally shipped. Only URLs returned by the existing read pass.
export function deriveCatalogMediaImage(value){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const own=(row,key)=>plain(row)?Object.getOwnPropertyDescriptor(row,key):null;
 const missing={state:'NOT_CAPTURED',image_url:null},invalid={state:'INVALID',image_url:null};
 try{
  const image=own(value,'image');if(!image||Object.hasOwn(image,'value')&&image.value===null)return missing;
  if(!Object.hasOwn(image,'value')||!plain(image.value))return invalid;
  const list=own(image.value,'image_url_list');if(!list||Object.hasOwn(list,'value')&&list.value===null)return missing;
  if(!Object.hasOwn(list,'value')||!Array.isArray(list.value)||Object.getPrototypeOf(list.value)!==Array.prototype||list.value.length>20||Reflect.ownKeys(list.value).length!==list.value.length+1)return invalid;
  if(!list.value.length)return missing;
  const descriptor=Object.getOwnPropertyDescriptor(list.value,'0');if(!descriptor||!Object.hasOwn(descriptor,'value'))return invalid;
  const text=descriptor.value;if(typeof text!=='string'||text.length>2048||/[\u0000-\u0020\u007f-\u009f]/.test(text))return invalid;
  const url=new URL(text),cdn=/^down(?:-[a-z0-9]+)*\.img\.susercontent\.com$/.test(url.hostname)||['cf.shopee.com.br','cf.shopee.com'].includes(url.hostname);
  if(!cdn||url.protocol!=='https:'||url.username||url.password||url.port||url.search||url.hash||url.href!==text||!url.pathname.startsWith('/file/')||url.pathname.length<=6)return invalid;
  return {state:'AVAILABLE',image_url:url.href};
 }catch{return invalid;}
}

// Dependencies are explicit for the reviewed offline Worker bundles.
export function projectCatalogMediaFrame(value,projectCatalog){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const list=(rows,max)=>Array.isArray(rows)&&Object.getPrototypeOf(rows)===Array.prototype&&rows.length<=max&&Reflect.ownKeys(rows).length===rows.length+1&&Array.from({length:rows.length},(_,i)=>Object.getOwnPropertyDescriptor(rows,String(i))).every(row=>row&&Object.hasOwn(row,'value'));
 const safePhoto=text=>{
  if(typeof text!=='string'||text.length>2048||/[\u0000-\u0020\u007f-\u009f]/.test(text))return false;
  try{const url=new URL(text);return (/^down(?:-[a-z0-9]+)*\.img\.susercontent\.com$/.test(url.hostname)||['cf.shopee.com.br','cf.shopee.com'].includes(url.hostname))&&url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!url.search&&!url.hash&&url.href===text&&url.pathname.startsWith('/file/')&&url.pathname.length>6;}catch{return false;}
 };
 try{
  if(typeof projectCatalog!=='function'||!exact(value,['schema','catalog','media'])||value.schema!=='variant_catalog_media_v1'||!list(value.media,3))return null;
  const catalog=projectCatalog(value.catalog);if(!catalog||value.media.length!==catalog.products.length||!catalog.products.every(product=>Object.hasOwn(product,'cost_catalog')))return null;
  const media=[];
  for(let i=0;i<value.media.length;i++){
   const row=value.media[i],product=catalog.products[i];
   if(!exact(row,['item_id','catalog_fingerprint','checked_at','state','image_url','basis'])||row.item_id!==product.item_id||row.catalog_fingerprint!==product.catalog_fingerprint||row.checked_at!==catalog.checked_at||!['AVAILABLE','NOT_CAPTURED','INVALID'].includes(row.state)||row.basis!=='CURRENT_PRODUCT_PHOTO_NOT_PRINT_ARTWORK'||(row.state==='AVAILABLE'?!safePhoto(row.image_url):row.image_url!==null))return null;
   media.push({...row});
  }
  const result={schema:'variant_catalog_media_v1',catalog,media};return new TextEncoder().encode(JSON.stringify(result)).byteLength<=1048576?result:null;
 }catch{return null;}
}
