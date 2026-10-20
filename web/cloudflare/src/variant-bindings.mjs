// Versioned catalog-kit composition. Automatic links retain their own provenance.
export class VariantBindingError extends Error {
 constructor(code,status=400){super(code);this.status=status;}
}
const variantBindingKeys=['item_id','model_id','male_size','female_size','selling_unit','operator_confirmed'];
const variantAutomaticKeys=[...variantBindingKeys,'source','catalog_fingerprint'];
const variantSingleKeys=['item_id','model_id','size','selling_unit','operator_confirmed'];
const variantSingleAutomaticKeys=[...variantSingleKeys,'source','catalog_fingerprint'];
const variantSellingUnits=['ONE_MALE_ONE_FEMALE_KIT','SINGLE_GARMENT'];
const variantExact=(value,keys)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const variantItemId=value=>typeof value==='string'&&(/^[1-9][0-9]{0,19}$/).test(value);
const variantRevision=value=>Number.isSafeInteger(value)&&value>=1&&value<2147483647;
const variantFail=(code,status=400)=>{throw new VariantBindingError(code,status);};
export function validateVariantBindings(bindings){
 const fail=code=>{throw new VariantBindingError(code);};
 if(!Array.isArray(bindings)||bindings.length>1000)fail('VARIANT_BINDINGS_INVALID');
 const seen=new Set(),sizes=['P','M','G','GG','G1','G2','G3'];
 const result=[];
 for(const binding of bindings){
  const automatic=binding?.operator_confirmed===false,single=binding?.selling_unit==='SINGLE_GARMENT';
  const keys=single?(automatic?variantSingleAutomaticKeys:variantSingleKeys):(automatic?variantAutomaticKeys:variantBindingKeys);
  if(!variantExact(binding,keys))fail('VARIANT_BINDING_INVALID');
  if(!variantItemId(binding.item_id)||typeof binding.model_id!=='string'||!(/^(0|[1-9][0-9]{0,19})$/).test(binding.model_id))fail('VARIANT_BINDING_ID_INVALID');
  if(!variantSellingUnits.includes(binding.selling_unit)||(single?!sizes.includes(binding.size):!sizes.includes(binding.male_size)||!sizes.includes(binding.female_size))||(!automatic&&binding.operator_confirmed!==true))fail('VARIANT_BINDING_CONFIRMATION_REQUIRED');
  if(automatic&&(binding.source!==(single?'CATALOG_SIZE_AXIS':'CATALOG_VARIATION_AXES')||typeof binding.catalog_fingerprint!=='string'||!(/^[a-f0-9]{64}$/).test(binding.catalog_fingerprint)))fail('VARIANT_BINDING_PROVENANCE_INVALID');
  const key=binding.item_id+':'+binding.model_id;if(seen.has(key))fail('VARIANT_BINDING_DUPLICATE');seen.add(key);
  result.push(Object.fromEntries(keys.map(key=>[key,binding[key]])));
 }
 return result.sort((a,b)=>a.item_id.length-b.item_id.length||a.item_id.localeCompare(b.item_id)||a.model_id.length-b.model_id.length||a.model_id.localeCompare(b.model_id));
}
export async function readVariantBindings(env){
 const row=await env.ADMIN_DB.prepare('SELECT revision,payload,updated_at FROM variant_bindings_state WHERE id=1').first();
 return {revision:row.revision,bindings:validateVariantBindings(JSON.parse(row.payload)),updated_at:row.updated_at};
}
export async function saveVariantBindings(env,body,actor){
 if(!variantExact(body,['revision','bindings'])||!variantRevision(body.revision))throw new VariantBindingError('VARIANT_BINDINGS_REVISION_REQUIRED');
 const bindings=validateVariantBindings(body.bindings);
 // The browser can retain an existing automatic link, but only the trusted catalog
 // flow below can create or change one. Explicit manual overrides use the old shape.
 if(bindings.some(binding=>binding.operator_confirmed===false)){
  const current=await readVariantBindings(env);
  if(current.revision!==body.revision)variantFail('VARIANT_BINDINGS_CHANGED_RELOAD',409);
  const automatic=new Map(current.bindings.filter(binding=>binding.operator_confirmed===false).map(binding=>[binding.item_id+':'+binding.model_id,JSON.stringify(binding)]));
  for(const binding of bindings)if(binding.operator_confirmed===false&&automatic.get(binding.item_id+':'+binding.model_id)!==JSON.stringify(binding))variantFail('VARIANT_BINDING_AUTOMATIC_SOURCE_REQUIRED');
 }
 return writeVariantBindings(env,body.revision,bindings,actor);
}
async function writeVariantBindings(env,revision,bindings,actor){
 const raw=JSON.stringify(bindings),now=new Date().toISOString();
 const results=await env.ADMIN_DB.batch([
  env.ADMIN_DB.prepare('UPDATE variant_bindings_state SET revision=revision+1,payload=?,updated_at=? WHERE id=1 AND revision=?').bind(raw,now,revision),
  env.ADMIN_DB.prepare('INSERT INTO variant_bindings_audit(revision,payload,actor,created_at) SELECT revision,payload,?,updated_at FROM variant_bindings_state WHERE changes()=1 AND id=1 AND revision=? AND updated_at=? AND payload=?').bind(actor,revision+1,now,raw),
 ]);
 if(results[0].meta.changes!==1)throw new VariantBindingError('VARIANT_BINDINGS_CHANGED_RELOAD',409);
 if(results[1].meta.changes!==1)throw new VariantBindingError('VARIANT_BINDINGS_SAVE_UNAVAILABLE',503);
 return readVariantBindings(env);
}
export async function saveAutomaticVariantBindings(env,body,catalog,actor){
 const hasSellingUnit=!!body&&typeof body==='object'&&Object.hasOwn(body,'selling_unit');
 if(!variantExact(body,['revision','item_ids',...(hasSellingUnit?['selling_unit']:[])])||!variantRevision(body.revision)||!Array.isArray(body.item_ids)||body.item_ids.length<1||body.item_ids.length>3||body.item_ids.some(id=>!variantItemId(id))||new Set(body.item_ids).size!==body.item_ids.length||(hasSellingUnit&&body.selling_unit!=='AUTO'&&!variantSellingUnits.includes(body.selling_unit)))variantFail('VARIANT_CATALOG_REQUEST_INVALID');
 const sellingUnit=hasSellingUnit?body.selling_unit:'ONE_MALE_ONE_FEMALE_KIT',infer=sellingUnit==='AUTO';
 const requested=new Set(body.item_ids);
 if(!variantExact(catalog,['schema','checked_at','products'])||catalog.schema!=='variant_catalog_v1'||!Number.isSafeInteger(catalog.checked_at)||catalog.checked_at<1||!Array.isArray(catalog.products)||catalog.products.length!==requested.size)variantFail('VARIANT_CATALOG_INVALID',503);
 const seen=new Set(),resolved=[],productUnits=new Map();let modelCount=0;
 for(const product of catalog.products){
  const productHasSellingUnit=!!product&&typeof product==='object'&&Object.hasOwn(product,'selling_unit');
  const unit=productHasSellingUnit?product.selling_unit:'ONE_MALE_ONE_FEMALE_KIT',single=unit==='SINGLE_GARMENT';
  if(!variantExact(product,['item_id','catalog_fingerprint','bindings','unresolved_count',...(productHasSellingUnit?['selling_unit']:[])])||!requested.has(product.item_id)||seen.has(product.item_id)||typeof product.catalog_fingerprint!=='string'||!(/^[a-f0-9]{64}$/).test(product.catalog_fingerprint)||!Array.isArray(product.bindings)||product.bindings.length>1000||!Number.isSafeInteger(product.unresolved_count)||product.unresolved_count<0||product.unresolved_count>1000||!variantSellingUnits.includes(unit)||!infer&&unit!==sellingUnit)variantFail('VARIANT_CATALOG_INVALID',503);
  modelCount+=product.bindings.length+product.unresolved_count;
  if(modelCount>1000)variantFail('VARIANT_CATALOG_INVALID',503);
  seen.add(product.item_id);
  if(!infer||product.bindings.length)productUnits.set(product.item_id,unit);
  for(const binding of product.bindings){
   if(!variantExact(binding,['item_id','model_id',...(single?['size']:['male_size','female_size'])])||binding.item_id!==product.item_id)variantFail('VARIANT_CATALOG_INVALID',503);
   resolved.push({...binding,selling_unit:unit,operator_confirmed:false,source:single?'CATALOG_SIZE_AXIS':'CATALOG_VARIATION_AXES',catalog_fingerprint:product.catalog_fingerprint});
  }
 }
 let automatic;
 try{automatic=validateVariantBindings(resolved);}catch{variantFail('VARIANT_CATALOG_INVALID',503);}
 const current=await readVariantBindings(env);
 if(current.revision!==body.revision)variantFail('VARIANT_BINDINGS_CHANGED_RELOAD',409);
 // A product-wide rule cannot silently change a manually confirmed composition.
 if(current.bindings.some(binding=>binding.operator_confirmed&&requested.has(binding.item_id)&&productUnits.has(binding.item_id)&&binding.selling_unit!==productUnits.get(binding.item_id)))variantFail('VARIANT_BINDING_COMPOSITION_CONFLICT',409);
 // Remove prior automatic interpretations of the queried products first. Missing
 // or ambiguous models must stop contributing instead of retaining stale sizes.
 const combined=new Map(current.bindings.filter(binding=>binding.operator_confirmed||!requested.has(binding.item_id)).map(binding=>[binding.item_id+':'+binding.model_id,binding]));
 for(const binding of automatic){const key=binding.item_id+':'+binding.model_id;if(!combined.has(key))combined.set(key,binding);}
 const bindings=validateVariantBindings([...combined.values()]);
 if(JSON.stringify(bindings)===JSON.stringify(current.bindings))return current;
 return writeVariantBindings(env,body.revision,bindings,'catalog-automation'+(typeof actor==='string'&&actor?':'+actor:''));
}
export function variantMarginReference(frame,bindings,state){
 if(frame?.status!=='AVAILABLE')return null;
 const confirmed=new Map(validateVariantBindings(bindings.bindings).map(row=>[row.item_id+':'+row.model_id,row]));
 const grouped=new Map();
 for(const row of frame.rows){const key=row.item_id+':'+row.model_id;const entry=grouped.get(key)||{item_id:row.item_id,model_id:row.model_id,quantity:0};entry.quantity+=row.quantity;grouped.set(key,entry);}
 const plus=['G1','G2','G3'],marginKeys=['regular_cents','mixed_cents','plus_cents'],classes=['REGULAR','MIXED','PLUS'];
 let known=0,mapped=0,unmapped=0,unpriced=0;
 const variants=[];
 for(const [key,row] of grouped){
  const binding=confirmed.get(key),out={...row,margin_class:null,unit_margin_cents:null,contribution_cents:null};
  if(!binding||binding.selling_unit==='SINGLE_GARMENT'){
   unmapped+=row.quantity;
   // Registered margins describe a two-piece kit, never an individual garment.
   if(binding){unpriced+=row.quantity;if(!Number.isSafeInteger(unpriced)||unpriced<0)throw new VariantBindingError('VARIANT_REFERENCE_INVALID',503);}
  }
  else{
   const count=Number(plus.includes(binding.male_size))+Number(plus.includes(binding.female_size)),unit=state.values[marginKeys[count]],value=unit*row.quantity;
   if(!Number.isSafeInteger(unit)||unit<=0||!Number.isSafeInteger(value)||value<0||!Number.isSafeInteger(known+value))throw new VariantBindingError('VARIANT_REFERENCE_INVALID',503);
   out.margin_class=classes[count];out.unit_margin_cents=unit;out.contribution_cents=value;known+=value;mapped+=row.quantity;
  }
  variants.push(out);
 }
 return {settings_revision:state.revision,bindings_revision:bindings.revision,known_subset_cents:known,total_cents:unmapped?null:known,mapped_quantity:mapped,unmapped_quantity:unmapped,status_scope:'ALL_RETURNED_STATUSES_REFERENCE_ONLY',currency:'BRL',margin_stage:'AFTER_FEES_AND_PRODUCT_COST_BEFORE_ADS',economic_status:'UNKNOWN',variants,...(unpriced?{unpriced_quantity:unpriced}:{})};
}
