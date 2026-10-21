// Only named variation axes determine sizes. Product titles, model labels and
// SKU strings cannot establish which garment a size belongs to.
export class VariantCatalogFrameError extends Error {
  constructor() {super('VARIANT_CATALOG_INVALID');}
}
const catalogSizes = new Set(['P','M','G','GG','G1','G2','G3']);
const catalogSellingUnits = new Set(['SINGLE_GARMENT','ONE_MALE_ONE_FEMALE_KIT']);
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
const catalogText = value => typeof value==='string' && value.length<=128 && !/[\u0000-\u001f\u007f]/.test(value);
const catalogReasons = new Set(['AXES_NOT_RECOGNIZED','OPTION_NOT_RECOGNIZED','INDEX_NOT_VALID','NO_MODELS']);

function projectCatalogDiagnostic(value, modelCount, unresolvedCount) {
  if (!catalogKeys(value,['axes','model_count','reasons']) || !catalogArray(value.axes,10)
    || !catalogCount(value.model_count) || value.model_count!==modelCount || !catalogArray(value.reasons,4)) return null;
  const axes=[],reasons=[],seen=new Set(); let unresolved=0;
  for (const axis of value.axes) {
    if (!catalogKeys(axis,['name','options','option_count']) || !catalogText(axis.name)
      || !catalogArray(axis.options,7) || !axis.options.every(catalogText)
      || !catalogCount(axis.option_count) || axis.options.length>axis.option_count) return null;
    axes.push({name:axis.name,options:[...axis.options],option_count:axis.option_count});
  }
  for (const reason of value.reasons) {
    if (!catalogKeys(reason,['code','count']) || !catalogReasons.has(reason.code) || seen.has(reason.code)
      || !catalogCount(reason.count)) return null;
    if (reason.code==='NO_MODELS' ? modelCount!==0||reason.count!==0 : reason.count===0||modelCount===0) return null;
    seen.add(reason.code); unresolved+=reason.count;
    reasons.push({code:reason.code,count:reason.count});
  }
  if (unresolved!==unresolvedCount || (modelCount===0&&!seen.has('NO_MODELS'))) return null;
  return {axes,model_count:modelCount,reasons};
}

export function projectVariantCatalogRequest(value) {
  try {
    const hasUnit=catalogObject(value)&&Object.hasOwn(value,'selling_unit');
    if (!catalogKeys(value,['item_ids',...(hasUnit?['selling_unit']:[])]) || !catalogArray(value.item_ids,3) || !value.item_ids.length
      || (hasUnit&&value.selling_unit!=='AUTO'&&!catalogSellingUnits.has(value.selling_unit))
      || !value.item_ids.every(id=>catalogId(id)) || new Set(value.item_ids).size!==value.item_ids.length) return null;
    return {item_ids:[...value.item_ids],...(hasUnit?{selling_unit:value.selling_unit}:{})};
  } catch {return null;}
}

export function projectVariantCatalog(value) {
  try {
    if (!catalogKeys(value,['schema','checked_at','products']) || value.schema!=='variant_catalog_v1'
      || !Number.isSafeInteger(value.checked_at) || value.checked_at<1 || value.checked_at>9999999999
      || !catalogArray(value.products,3) || !value.products.length) return null;
    const products=[],seen=new Set(); let total=0;
    for (const product of value.products) {
      const hasDiagnostic=catalogObject(product)&&Object.hasOwn(product,'diagnostic');
      const hasUnit=catalogObject(product)&&Object.hasOwn(product,'selling_unit');
      const keys=['item_id','catalog_fingerprint','bindings','unresolved_count',...(hasUnit?['selling_unit']:[]),...(hasDiagnostic?['diagnostic']:[])];
      if (!catalogKeys(product,keys)
        || (hasUnit&&!catalogSellingUnits.has(product.selling_unit))
        || !catalogId(product.item_id) || seen.has(product.item_id)
        || typeof product.catalog_fingerprint!=='string' || !/^[a-f0-9]{64}$/.test(product.catalog_fingerprint)
        || !catalogArray(product.bindings,1000) || !catalogCount(product.unresolved_count)
        || product.bindings.length+product.unresolved_count>1000) return null;
      seen.add(product.item_id); const models=new Set(),bindings=[];
      const single=hasUnit&&product.selling_unit==='SINGLE_GARMENT';
      for (const row of product.bindings) {
        if (!catalogKeys(row,['item_id','model_id',...(single?['size']:['male_size','female_size'])])
          || row.item_id!==product.item_id || !catalogId(row.model_id,true) || models.has(row.model_id)
          || (single?!catalogSizes.has(row.size):!catalogSizes.has(row.male_size)||!catalogSizes.has(row.female_size))) return null;
        models.add(row.model_id);
        bindings.push({item_id:row.item_id,model_id:row.model_id,...(single?{size:row.size}:{male_size:row.male_size,female_size:row.female_size})});
      }
      total+=bindings.length+product.unresolved_count; if(total>1000)return null;
      bindings.sort((a,b)=>catalogSort(a.model_id,b.model_id));
      const projected={item_id:product.item_id,catalog_fingerprint:product.catalog_fingerprint,bindings,unresolved_count:product.unresolved_count};
      if(hasUnit)projected.selling_unit=product.selling_unit;
      if (hasDiagnostic) {
        const diagnostic=projectCatalogDiagnostic(product.diagnostic,bindings.length+product.unresolved_count,product.unresolved_count);
        if (!diagnostic) return null;
        projected.diagnostic=diagnostic;
      }
      products.push(projected);
    }
    products.sort((a,b)=>catalogSort(a.item_id,b.item_id));
    return {schema:'variant_catalog_v1',checked_at:value.checked_at,products};
  } catch {return null;}
}

const catalogLabel = value => {
  if(!catalogText(value))throw new VariantCatalogFrameError();
  return value.normalize('NFKD').replace(/\p{M}/gu,'').trim().toLowerCase().replace(/[.]/g,'').replace(/\s+/g,' ');
};
const catalogGender = value => {
  const label=catalogLabel(value);
  if(['masculino','masculina','tamanho masculino','tamanho masculina','tam masculino','tam masculina','tam masc','tamanho masc','masc','male','men','mens','male size','men size',"men's size"].includes(label))return 'male_size';
  if(['feminino','feminina','tamanho feminino','tamanho feminina','tam feminino','tam feminina','tam fem','tamanho fem','fem','female','women','womens','female size','women size',"women's size"].includes(label))return 'female_size';
  return null;
};
const catalogSingleSizeAxis = label => ['tamanho','tamanhos','tam','size','sizes','shirt size','garment size'].includes(label);
// The observed single-garment catalogue varies the print independently of its
// generic size. Print options never supply a size or select a kit composition.
const catalogSingleAttributeAxis = label => ['cor','color','colour','estampa'].includes(label);
const catalogKitOptionSize = (option, gender) => {
  if(catalogSizes.has(option))return option;
  // The observed catalogue labels each kit option with its garment. Accept only
  // the matching prefix on an already identified gender axis, never strip an
  // arbitrary word or infer a gender from the option itself.
  const match=/^(MULHER|HOMEM) +(P|M|G|GG|G1|G2|G3)$/.exec(option);
  if(!match||match[1]!==({female_size:'MULHER',male_size:'HOMEM'})[gender])return null;
  return match[2];
};

export async function deriveCatalogProduct(item_id,response,{selling_unit='ONE_MALE_ONE_FEMALE_KIT'}={}) {
  if(!catalogId(item_id)||!catalogObject(response)||(selling_unit!=='AUTO'&&!catalogSellingUnits.has(selling_unit)))throw new VariantCatalogFrameError();
  const rawModels=catalogOwn(response,'model'),rawAxes=catalogOwn(response,'tier_variation');
  if(!catalogArray(rawModels,1000)||!catalogArray(rawAxes,10))throw new VariantCatalogFrameError();
  const diagnosticAxes=[];
  const axes=rawAxes.map(axis=>{
    if(!catalogObject(axis))throw new VariantCatalogFrameError();
    const rawName=catalogOwn(axis,'name'),name=catalogLabel(rawName),options=catalogOwn(axis,'option_list');
    if(!catalogArray(options,1000))throw new VariantCatalogFrameError();
    const rawOptions=options.map(option=>{
      if(!catalogObject(option))throw new VariantCatalogFrameError();
      const value=catalogOwn(option,'option');
      if(!catalogText(value))throw new VariantCatalogFrameError();
      return value;
    });
    diagnosticAxes.push({name:rawName,options:rawOptions.slice(0,7),option_count:rawOptions.length});
    return {name,options:rawOptions.map(value=>value.trim().toUpperCase())};
  });
  const genders=axes.map(axis=>catalogGender(axis.name));
  const sizeAxes=axes.map((axis,index)=>catalogSingleSizeAxis(axis.name)?index:-1).filter(index=>index!==-1);
  const singleAxes=axes.length>=1&&axes.length<=2&&sizeAxes.length===1&&axes.every((axis,index)=>index===sizeAxes[0]||catalogSingleAttributeAxis(axis.name));
  const kitAxes=axes.length===2&&genders.includes('male_size')&&genders.includes('female_size');
  // The administrator enabled automatic composition for these two catalogue
  // structures. A title, price, SKU or an extra axis never chooses a unit.
  const inferred=selling_unit==='AUTO'?(kitAxes?'ONE_MALE_ONE_FEMALE_KIT':singleAxes?'SINGLE_GARMENT':null):selling_unit;
  const single=inferred==='SINGLE_GARMENT';
  const explicit=single?singleAxes:inferred==='ONE_MALE_ONE_FEMALE_KIT'&&kitAxes;
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
  const bindings=[],reasonCounts=new Map();
  const unresolved=code=>reasonCounts.set(code,(reasonCounts.get(code)||0)+1);
  for(const model of models){
    if(!explicit){unresolved('AXES_NOT_RECOGNIZED');continue;}
    if(model.tier_index?.length!==axes.length||model.tier_index.some((index,axis)=>index>=axes[axis].options.length)){
      unresolved('INDEX_NOT_VALID');continue;
    }
    if(single){
      const size=axes[sizeAxes[0]].options[model.tier_index[sizeAxes[0]]];
      if(!catalogSizes.has(size)){unresolved('OPTION_NOT_RECOGNIZED');continue;}
      bindings.push({item_id,model_id:model.model_id,size});
      continue;
    }
    const sizes=axes.map((axis,index)=>catalogKitOptionSize(axis.options[model.tier_index[index]],genders[index]));
    if(!sizes.every(size=>catalogSizes.has(size))){unresolved('OPTION_NOT_RECOGNIZED');continue;}
    bindings.push({item_id,model_id:model.model_id,
      male_size:sizes[genders.indexOf('male_size')],female_size:sizes[genders.indexOf('female_size')]});
  }
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({item_id,axes,models,...(single?{selling_unit:inferred}:{})}))));
  return {item_id,catalog_fingerprint:Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join(''),
    bindings,unresolved_count:models.length-bindings.length,...(single?{selling_unit:inferred}:{}),diagnostic:{axes:diagnosticAxes,model_count:models.length,
      reasons:models.length?[...reasonCounts].map(([code,count])=>({code,count})):[{code:'NO_MODELS',count:0}]}};
}
