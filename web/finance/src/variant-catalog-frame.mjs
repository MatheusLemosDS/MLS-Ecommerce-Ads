// Only named variation axes determine sizes. Product titles, model labels and
// SKU strings cannot establish which garment a size belongs to.
export class VariantCatalogFrameError extends Error {
  constructor() {super('VARIANT_CATALOG_INVALID');}
}
const catalogSizes = new Set(['P','M','G','GG','G1','G2','G3']);
const catalogObject = value => value !== null && typeof value === 'object'
  && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const catalogOwn = (value, key) => Object.getOwnPropertyDescriptor(value, key)?.value;
const catalogKeys = (value, keys) => catalogObject(value) && Reflect.ownKeys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value,key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const catalogArray = (value, max) => Array.isArray(value) && Object.getPrototypeOf(value)===Array.prototype && value.length <= max
  && Reflect.ownKeys(value).length === value.length + 1
  && Array.from({length:value.length},(_,index) => Object.getOwnPropertyDescriptor(value,String(index)))
    .every(descriptor => descriptor && Object.hasOwn(descriptor,'value'));
const catalogId = (value, zero = false) => typeof value === 'string'
  && (zero ? /^(0|[1-9][0-9]{0,19})$/ : /^[1-9][0-9]{0,19}$/).test(value);
const catalogCount = value => Number.isSafeInteger(value) && value >= 0 && value <= 1000;
const catalogSort = (a,b) => a.length-b.length || (a<b?-1:a>b?1:0);

export function projectVariantCatalogRequest(value) {
  try {
    if (!catalogKeys(value,['item_ids']) || !catalogArray(value.item_ids,3) || !value.item_ids.length
      || !value.item_ids.every(id=>catalogId(id)) || new Set(value.item_ids).size!==value.item_ids.length) return null;
    return {item_ids:[...value.item_ids]};
  } catch {return null;}
}

export function projectVariantCatalog(value) {
  try {
    if (!catalogKeys(value,['schema','checked_at','products']) || value.schema!=='variant_catalog_v1'
      || !Number.isSafeInteger(value.checked_at) || value.checked_at<1 || value.checked_at>9999999999
      || !catalogArray(value.products,3) || !value.products.length) return null;
    const products=[],seen=new Set(); let total=0;
    for (const product of value.products) {
      if (!catalogKeys(product,['item_id','catalog_fingerprint','bindings','unresolved_count'])
        || !catalogId(product.item_id) || seen.has(product.item_id)
        || typeof product.catalog_fingerprint!=='string' || !/^[a-f0-9]{64}$/.test(product.catalog_fingerprint)
        || !catalogArray(product.bindings,1000) || !catalogCount(product.unresolved_count)
        || product.bindings.length+product.unresolved_count>1000) return null;
      seen.add(product.item_id); const models=new Set(),bindings=[];
      for (const row of product.bindings) {
        if (!catalogKeys(row,['item_id','model_id','male_size','female_size'])
          || row.item_id!==product.item_id || !catalogId(row.model_id,true) || models.has(row.model_id)
          || !catalogSizes.has(row.male_size) || !catalogSizes.has(row.female_size)) return null;
        models.add(row.model_id);
        bindings.push({item_id:row.item_id,model_id:row.model_id,male_size:row.male_size,female_size:row.female_size});
      }
      total+=bindings.length+product.unresolved_count; if(total>1000)return null;
      bindings.sort((a,b)=>catalogSort(a.model_id,b.model_id));
      products.push({item_id:product.item_id,catalog_fingerprint:product.catalog_fingerprint,bindings,unresolved_count:product.unresolved_count});
    }
    products.sort((a,b)=>catalogSort(a.item_id,b.item_id));
    return {schema:'variant_catalog_v1',checked_at:value.checked_at,products};
  } catch {return null;}
}

const catalogLabel = value => {
  if(typeof value!=='string'||value.length>128||/[\u0000-\u001f\u007f]/.test(value))throw new VariantCatalogFrameError();
  return value.normalize('NFKD').replace(/\p{M}/gu,'').trim().toLowerCase().replace(/[.]/g,'').replace(/\s+/g,' ');
};
const catalogGender = value => {
  const label=catalogLabel(value);
  if(['masculino','masculina','tamanho masculino','tamanho masculina','tam masculino','tam masculina','tam masc','tamanho masc','masc','male','men','mens','male size','men size',"men's size"].includes(label))return 'male_size';
  if(['feminino','feminina','tamanho feminino','tamanho feminina','tam feminino','tam feminina','tam fem','tamanho fem','fem','female','women','womens','female size','women size',"women's size"].includes(label))return 'female_size';
  return null;
};

export async function deriveCatalogProduct(item_id,response) {
  if(!catalogId(item_id)||!catalogObject(response))throw new VariantCatalogFrameError();
  const rawModels=catalogOwn(response,'model'),rawAxes=catalogOwn(response,'tier_variation');
  if(!catalogArray(rawModels,1000)||!catalogArray(rawAxes,10))throw new VariantCatalogFrameError();
  const axes=rawAxes.map(axis=>{
    if(!catalogObject(axis))throw new VariantCatalogFrameError();
    const name=catalogLabel(catalogOwn(axis,'name')),options=catalogOwn(axis,'option_list');
    if(!catalogArray(options,1000))throw new VariantCatalogFrameError();
    return {name,options:options.map(option=>{
      if(!catalogObject(option))throw new VariantCatalogFrameError();
      const value=catalogOwn(option,'option');
      if(typeof value!=='string'||value.length>128||/[\u0000-\u001f\u007f]/.test(value))throw new VariantCatalogFrameError();
      return value.trim().toUpperCase();
    })};
  });
  const genders=axes.map(axis=>catalogGender(axis.name));
  const explicit=axes.length===2&&genders.includes('male_size')&&genders.includes('female_size');
  const models=[],seen=new Set();
  for(const raw of rawModels){
    if(!catalogObject(raw))throw new VariantCatalogFrameError();
    const id=catalogOwn(raw,'model_id'),model_id=typeof id==='number'&&Number.isSafeInteger(id)&&id>=0?String(id):id;
    if(!catalogId(model_id,true)||seen.has(model_id))throw new VariantCatalogFrameError();
    seen.add(model_id);
    const tier=catalogOwn(raw,'tier_index');
    const indices=catalogArray(tier,10)&&tier.every(index=>Number.isSafeInteger(index)&&index>=0&&index<=1000)?[...tier]:null;
    models.push({model_id,tier_index:indices});
  }
  models.sort((a,b)=>catalogSort(a.model_id,b.model_id));
  const bindings=[];
  for(const model of models){
    if(!explicit||model.tier_index?.length!==2)continue;
    const sizes=axes.map((axis,index)=>axis.options[model.tier_index[index]]);
    if(!sizes.every(size=>catalogSizes.has(size)))continue;
    bindings.push({item_id,model_id:model.model_id,
      male_size:sizes[genders.indexOf('male_size')],female_size:sizes[genders.indexOf('female_size')]});
  }
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({item_id,axes,models}))));
  return {item_id,catalog_fingerprint:Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join(''),
    bindings,unresolved_count:models.length-bindings.length};
}
