// Versioned, explicit catalog-kit composition. No Shopee write or title inference.
export class VariantBindingError extends Error {
 constructor(code,status=400){super(code);this.status=status;}
}
export function validateVariantBindings(bindings){
 const fail=code=>{throw new VariantBindingError(code);};
 if(!Array.isArray(bindings)||bindings.length>1000)fail('VARIANT_BINDINGS_INVALID');
 const seen=new Set(),sizes=['P','M','G','GG','G1','G2','G3'];
 const result=[];
 for(const binding of bindings){
  const keys=['item_id','model_id','male_size','female_size','selling_unit','operator_confirmed'];
  if(!binding||typeof binding!=='object'||Array.isArray(binding)||Object.keys(binding).length!==keys.length||!keys.every(key=>Object.hasOwn(binding,key)))fail('VARIANT_BINDING_INVALID');
  if(typeof binding.item_id!=='string'||!(/^[1-9][0-9]{0,19}$/).test(binding.item_id)||typeof binding.model_id!=='string'||!(/^(0|[1-9][0-9]{0,19})$/).test(binding.model_id))fail('VARIANT_BINDING_ID_INVALID');
  if(!sizes.includes(binding.male_size)||!sizes.includes(binding.female_size)||binding.selling_unit!=='ONE_MALE_ONE_FEMALE_KIT'||binding.operator_confirmed!==true)fail('VARIANT_BINDING_CONFIRMATION_REQUIRED');
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
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==2||!Object.hasOwn(body,'bindings')||!Number.isSafeInteger(body.revision)||body.revision<1||body.revision>=2147483647)throw new VariantBindingError('VARIANT_BINDINGS_REVISION_REQUIRED');
 const raw=JSON.stringify(validateVariantBindings(body.bindings)),now=new Date().toISOString();
 const results=await env.ADMIN_DB.batch([
  env.ADMIN_DB.prepare('UPDATE variant_bindings_state SET revision=revision+1,payload=?,updated_at=? WHERE id=1 AND revision=?').bind(raw,now,body.revision),
  env.ADMIN_DB.prepare('INSERT INTO variant_bindings_audit(revision,payload,actor,created_at) SELECT revision,payload,?,updated_at FROM variant_bindings_state WHERE changes()=1 AND id=1 AND revision=? AND updated_at=? AND payload=? AND NOT EXISTS(SELECT 1 FROM variant_bindings_audit WHERE revision=?)').bind(actor,body.revision+1,now,raw,body.revision+1),
 ]);
 if(results[0].meta.changes!==1)throw new VariantBindingError('VARIANT_BINDINGS_CHANGED_RELOAD',409);
 return readVariantBindings(env);
}
export function variantMarginReference(frame,bindings,state){
 if(frame?.status!=='AVAILABLE')return null;
 const confirmed=new Map(validateVariantBindings(bindings.bindings).map(row=>[row.item_id+':'+row.model_id,row]));
 const grouped=new Map();
 for(const row of frame.rows){const key=row.item_id+':'+row.model_id;const entry=grouped.get(key)||{item_id:row.item_id,model_id:row.model_id,quantity:0};entry.quantity+=row.quantity;grouped.set(key,entry);}
 const plus=['G1','G2','G3'],marginKeys=['regular_cents','mixed_cents','plus_cents'],classes=['REGULAR','MIXED','PLUS'];
 let known=0,mapped=0,unmapped=0;
 const variants=[];
 for(const [key,row] of grouped){
  const binding=confirmed.get(key),out={...row,margin_class:null,unit_margin_cents:null,contribution_cents:null};
  if(!binding)unmapped+=row.quantity;
  else{
   const count=Number(plus.includes(binding.male_size))+Number(plus.includes(binding.female_size)),unit=state.values[marginKeys[count]],value=unit*row.quantity;
   if(!Number.isSafeInteger(unit)||unit<=0||!Number.isSafeInteger(value)||value<0||!Number.isSafeInteger(known+value))throw new VariantBindingError('VARIANT_REFERENCE_INVALID',503);
   out.margin_class=classes[count];out.unit_margin_cents=unit;out.contribution_cents=value;known+=value;mapped+=row.quantity;
  }
  variants.push(out);
 }
 return {settings_revision:state.revision,bindings_revision:bindings.revision,known_subset_cents:known,total_cents:unmapped?null:known,mapped_quantity:mapped,unmapped_quantity:unmapped,status_scope:'ALL_RETURNED_STATUSES_REFERENCE_ONLY',currency:'BRL',margin_stage:'AFTER_FEES_AND_PRODUCT_COST_BEFORE_ADS',economic_status:'UNKNOWN',variants};
}
