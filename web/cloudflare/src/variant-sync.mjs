import {VariantBindingError,readVariantBindings,saveAutomaticVariantBindings} from './variant-bindings.mjs';
import {projectVariantCatalog} from '../../finance/src/variant-catalog-frame.mjs';

// Product-level saved/confirmed rules take priority. Other products use the
// administrator-enabled AUTO rules for the two recognized catalogue structures.
const syncKnownUnits=Object.freeze({
 '22199878767':'SINGLE_GARMENT',
 '58269212782':'ONE_MALE_ONE_FEMALE_KIT',
});
const syncExact=(value,keys)=>value!==null&&typeof value==='object'
 &&[Object.prototype,null].includes(Object.getPrototypeOf(value))
 &&Reflect.ownKeys(value).length===keys.length
 &&keys.every(key=>Object.hasOwn(value,key)&&Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'));
const syncArray=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype
 &&value.length<=max&&Reflect.ownKeys(value).length===value.length+1
 &&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index)))
 .every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'));
const syncId=(value,zero=false)=>typeof value==='string'
 &&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(value);
const syncSort=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
const syncFail=(code,status=400)=>{throw new VariantBindingError(code,status);};

function syncCandidates(body){
 try{
  if(!syncExact(body,['revision','candidates'])||!Number.isSafeInteger(body.revision)
   ||body.revision<1||body.revision>=2147483647||!syncArray(body.candidates,1000))syncFail('VARIANT_SYNC_REQUEST_INVALID');
  const seen=new Set(),rows=[];
  for(const candidate of body.candidates){
   if(!syncExact(candidate,['item_id','model_id'])||!syncId(candidate.item_id)||!syncId(candidate.model_id,true))syncFail('VARIANT_SYNC_REQUEST_INVALID');
   const key=candidate.item_id+':'+candidate.model_id;
   if(seen.has(key))syncFail('VARIANT_SYNC_REQUEST_INVALID');
   seen.add(key);rows.push({item_id:candidate.item_id,model_id:candidate.model_id});
  }
  return rows;
 }catch(error){if(error instanceof VariantBindingError)throw error;syncFail('VARIANT_SYNC_REQUEST_INVALID');}
}

function syncPending(candidates,state){
 const saved=new Set(state.bindings.map(row=>row.item_id+':'+row.model_id)),units=new Map(),missing=new Set();
 for(const binding of state.bindings){
  if(!units.has(binding.item_id))units.set(binding.item_id,new Set());
  units.get(binding.item_id).add(binding.selling_unit);
 }
 for(const row of candidates)if(!saved.has(row.item_id+':'+row.model_id))missing.add(row.item_id);
 const known=[],pending_type=[];
 for(const item_id of [...missing].sort(syncSort)){
  const savedUnits=units.get(item_id);
  const selling_unit=savedUnits?.size===1?[...savedUnits][0]:savedUnits?.size>1?null:syncKnownUnits[item_id]||'AUTO';
  if(selling_unit)known.push({item_id,selling_unit});else pending_type.push(item_id);
 }
 known.sort((a,b)=>Number(a.selling_unit==='AUTO')-Number(b.selling_unit==='AUTO')||syncSort(a.item_id,b.item_id));
 return {known,pending_type};
}

// Each authenticated action performs at most one bounded catalogue request.
// The client removes `processed` IDs before continuing, including ambiguous
// products, so one unresolved option cannot create a retry loop.
export async function syncVariantBindings(env,body,actor,getCatalog){
 const candidates=syncCandidates(body),current=await readVariantBindings(env);
 if(current.revision!==body.revision)syncFail('VARIANT_BINDINGS_CHANGED_RELOAD',409);
 const pending=syncPending(candidates,current);
 if(!pending.known.length)return {state:current,remaining_known:0,pending_type:pending.pending_type,processed:[]};
 const unit=pending.known[0].selling_unit;
 const processed=pending.known.filter(row=>row.selling_unit===unit).slice(0,3).map(row=>row.item_id);
 if(typeof getCatalog!=='function')syncFail('VARIANT_CATALOG_UNAVAILABLE',503);
 const selection={item_ids:processed,...(unit!=='ONE_MALE_ONE_FEMALE_KIT'?{selling_unit:unit}:{})};
 let raw;try{raw=await getCatalog(env,selection);}catch{syncFail('VARIANT_CATALOG_UNAVAILABLE',503);}
 const frame=projectVariantCatalog(raw);
 if(!frame||frame.products.length!==processed.length
  ||frame.products.some(product=>!processed.includes(product.item_id)||unit!=='AUTO'&&(product.selling_unit||'ONE_MALE_ONE_FEMALE_KIT')!==unit))syncFail('VARIANT_CATALOG_UNAVAILABLE',503);
 const stripped={...frame,products:frame.products.map(({diagnostic,...product})=>product)};
 const state=await saveAutomaticVariantBindings(env,{revision:body.revision,...selection},stripped,actor);
 const after=syncPending(candidates,state),done=new Set(processed);
 // Review only the requested products still missing a binding. The entire
 // provider frame was projected before saving; diagnostics never enter state.
 const pendingIds=new Set([...after.pending_type,...after.known.map(row=>row.item_id)]);
 const reviewProducts=frame.products.filter(product=>pendingIds.has(product.item_id)&&Object.hasOwn(product,'diagnostic'));
 return {state,remaining_known:after.known.filter(row=>!done.has(row.item_id)).length,
  pending_type:[...new Set([...after.pending_type,...after.known.filter(row=>done.has(row.item_id)).map(row=>row.item_id)])].sort(syncSort),processed,
  ...(reviewProducts.length?{catalog_review:{...frame,products:reviewProducts}}:{})};
}
