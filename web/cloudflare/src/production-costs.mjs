import {validateVariantBindings} from './variant-bindings.mjs';
import {COST_RULE_SCHEMA} from './cost-rules.mjs';

// Operator-confirmed production costs. These do not come from Shopee finances.
export const COST_DEFAULTS=Object.freeze({mode:'all_inclusive',inclusive_regular_cents:1590,inclusive_plus_cents:1890,base_regular_cents:null,base_plus_cents:null,components:Object.freeze([])});
export const COST_SCHEMA=[
 ...COST_RULE_SCHEMA,
 `CREATE TABLE IF NOT EXISTS production_costs_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS production_costs_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, revision INTEGER UNIQUE NOT NULL, payload TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL)`,
];
export class ProductionCostError extends Error {
 constructor(code,status=400){super(code);this.status=status;}
}
const costFail=(code,status=400)=>{throw new ProductionCostError(code,status);};
const costPlain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const costExact=(value,keys)=>costPlain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const costArray=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'));
const costMoney=(value,positive=false)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=(positive?1:0)&&value<=1000000;
const costRevisionValid=value=>Number.isSafeInteger(value)&&value>=1&&value<=2147483647;
const costId=value=>typeof value==='string'&&/^[a-z0-9-]{1,64}$/.test(value);
const costItemId=value=>typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value);
const costModelId=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(value);
const costAssignmentKey=value=>value.item_id+':'+(value.model_id===null?'*':value.model_id);
const costNumericOrder=(left,right)=>left.length-right.length||left.localeCompare(right);

function validateCustomProductionCosts(values){
 if(!costArray(values.custom_profiles,100))costFail('COSTS_CUSTOM_PROFILES_INVALID');
 if(!costArray(values.custom_assignments,1000))costFail('COSTS_CUSTOM_ASSIGNMENTS_INVALID');
 const profiles=[],ids=new Set();
 for(const profile of values.custom_profiles){
  if(!costExact(profile,['id','label','unit_cost_cents'])||!costId(profile.id)||ids.has(profile.id)||typeof profile.label!=='string'||/[\u0000-\u001f\u007f-\u009f]/.test(profile.label)||!costMoney(profile.unit_cost_cents,true))costFail('COSTS_CUSTOM_PROFILE_INVALID');
  const label=profile.label.trim();if(!label||label.length>60)costFail('COSTS_CUSTOM_PROFILE_INVALID');
  ids.add(profile.id);profiles.push({id:profile.id,label,unit_cost_cents:profile.unit_cost_cents});
 }
 const assignments=[],seen=new Set();
 for(const assignment of values.custom_assignments){
  if(!costExact(assignment,['item_id','model_id','profile_id'])||!costItemId(assignment.item_id)||(assignment.model_id!==null&&!costModelId(assignment.model_id))||!costId(assignment.profile_id)||!ids.has(assignment.profile_id))costFail('COSTS_CUSTOM_ASSIGNMENT_INVALID');
  const key=costAssignmentKey(assignment);if(seen.has(key))costFail('COSTS_CUSTOM_ASSIGNMENT_DUPLICATE');seen.add(key);
  assignments.push({item_id:assignment.item_id,model_id:assignment.model_id,profile_id:assignment.profile_id});
 }
 profiles.sort((a,b)=>a.id.localeCompare(b.id));
 assignments.sort((a,b)=>costNumericOrder(a.item_id,b.item_id)||(a.model_id===null?(b.model_id===null?0:-1):b.model_id===null?1:costNumericOrder(a.model_id,b.model_id)));
 return {custom_profiles:profiles,custom_assignments:assignments};
}

export function validateProductionCosts(values){
 const keys=['mode','inclusive_regular_cents','inclusive_plus_cents','base_regular_cents','base_plus_cents','components'];
 const custom=costPlain(values)&&(Object.hasOwn(values,'custom_profiles')||Object.hasOwn(values,'custom_assignments'));
 if(custom)keys.push('custom_profiles','custom_assignments');
 if(!costExact(values,keys)||!['all_inclusive','itemized'].includes(values.mode))costFail('PRODUCTION_COSTS_INVALID');
 if(!costMoney(values.inclusive_regular_cents,true)||!costMoney(values.inclusive_plus_cents,true))costFail('PRODUCTION_COST_AMOUNT_INVALID');
 for(const key of ['base_regular_cents','base_plus_cents']){
  if(values[key]!==null&&!costMoney(values[key],true))costFail('PRODUCTION_COST_AMOUNT_INVALID');
  if(values.mode==='itemized'&&values[key]===null)costFail('PRODUCTION_COST_ITEMIZED_BASE_REQUIRED');
 }
 if(!costArray(values.components,20))costFail('PRODUCTION_COST_COMPONENTS_INVALID');
 const seen=new Set(),components=[];
 for(const component of values.components){
  if(!costExact(component,['id','label','basis','amount_cents'])||typeof component.id!=='string'||!(/^[a-z0-9-]{1,64}$/).test(component.id)||seen.has(component.id))costFail('PRODUCTION_COST_COMPONENT_INVALID');
  if(typeof component.label!=='string'||(/[\u0000-\u001f\u007f-\u009f]/).test(component.label))costFail('PRODUCTION_COST_COMPONENT_INVALID');
  const label=component.label.trim();
  if(label.length<1||label.length>60||!['per_piece','per_kit'].includes(component.basis)||!costMoney(component.amount_cents))costFail('PRODUCTION_COST_COMPONENT_INVALID');
  seen.add(component.id);components.push({id:component.id,label,basis:component.basis,amount_cents:component.amount_cents});
 }
 return {mode:values.mode,inclusive_regular_cents:values.inclusive_regular_cents,inclusive_plus_cents:values.inclusive_plus_cents,base_regular_cents:values.base_regular_cents,base_plus_cents:values.base_plus_cents,components,...(custom?validateCustomProductionCosts(values):{})};
}

function costStoredValues(payload){
 try{return validateProductionCosts(JSON.parse(payload));}catch{costFail('PRODUCTION_COST_STATE_INVALID',503);}
}
export async function readProductionCosts(env){
 const row=await env.ADMIN_DB.prepare('SELECT revision,payload,updated_at FROM production_costs_state WHERE id=1').first();
 if(!row||!costRevisionValid(row.revision)||typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at)))costFail('PRODUCTION_COST_STATE_INVALID',503);
 return {revision:row.revision,values:costStoredValues(row.payload),updated_at:row.updated_at};
}
export async function saveProductionCosts(env,body,actor){
 if(!costExact(body,['revision','values'])||!costRevisionValid(body.revision)||body.revision>=2147483647)costFail('PRODUCTION_COSTS_REVISION_REQUIRED');
 const values=validateProductionCosts(body.values),current=await env.ADMIN_DB.prepare('SELECT revision,payload,updated_at FROM production_costs_state WHERE id=1').first();
 if(!current||!costRevisionValid(current.revision)||typeof current.updated_at!=='string'||!Number.isFinite(Date.parse(current.updated_at)))costFail('PRODUCTION_COST_STATE_INVALID',503);
 const previous=costStoredValues(current.payload);
 if(current.revision!==body.revision)costFail('PRODUCTION_COSTS_CHANGED_RELOAD',409);
 // An older browser knows only the six original fields. It must not erase
 // profiles or assignments saved by a newer session with the same revision.
 if(!Object.hasOwn(values,'custom_profiles')&&(previous.custom_profiles?.length||previous.custom_assignments?.length))costFail('COSTS_CUSTOM_FIELDS_REQUIRED',409);
 const raw=JSON.stringify(values),now=new Date().toISOString();
 const results=await env.ADMIN_DB.batch([
  env.ADMIN_DB.prepare('UPDATE production_costs_state SET revision=revision+1,payload=?,updated_at=? WHERE id=1 AND revision=? AND payload=?').bind(raw,now,body.revision,current.payload),
  env.ADMIN_DB.prepare('INSERT INTO production_costs_audit(revision,payload,actor,created_at) SELECT revision,payload,?,updated_at FROM production_costs_state WHERE changes()=1 AND id=1 AND revision=? AND updated_at=? AND payload=?').bind(actor,body.revision+1,now,raw),
 ]);
 if(results[0].meta.changes!==1)costFail('PRODUCTION_COSTS_CHANGED_RELOAD',409);
 if(results[1].meta.changes!==1)costFail('PRODUCTION_COST_SAVE_UNAVAILABLE',503);
 return readProductionCosts(env);
}
export async function readProductionCostAudit(env){
 const rows=(await env.ADMIN_DB.prepare('SELECT revision,payload,actor,created_at FROM production_costs_audit ORDER BY revision DESC LIMIT 30').all()).results;
 for(const row of rows){if(!costRevisionValid(row.revision))costFail('PRODUCTION_COST_STATE_INVALID',503);costStoredValues(row.payload);}
 return {rows};
}

const costReferenceFailure=()=>costFail('PRODUCTION_COST_REFERENCE_INVALID',503);
function costSafeSum(a,b){const result=a+b;if(!Number.isSafeInteger(result)||result<0)costReferenceFailure();return result;}
function costSafeProduct(a,b){const result=a*b;if(!Number.isSafeInteger(result)||result<0)costReferenceFailure();return result;}
export function productionCostReference(frame,bindings,costState,automaticReference=null){
 if(frame?.status!=='AVAILABLE')return null;
 if(!Array.isArray(frame.rows)||frame.rows.length>1000||!costRevisionValid(bindings?.revision)||!costRevisionValid(costState?.revision))costReferenceFailure();
 let values,confirmed;
 try{values=validateProductionCosts(costState.values);confirmed=new Map(validateVariantBindings(bindings.bindings).map(row=>[row.item_id+':'+row.model_id,row]));}catch{costReferenceFailure();}
 const grouped=new Map();
 for(const row of frame.rows){
  if(!row||typeof row.item_id!=='string'||!(/^[1-9][0-9]{0,19}$/).test(row.item_id)||typeof row.model_id!=='string'||!(/^(0|[1-9][0-9]{0,19})$/).test(row.model_id)||!Number.isSafeInteger(row.quantity)||row.quantity<1)costReferenceFailure();
  const key=row.item_id+':'+row.model_id,entry=grouped.get(key)||{item_id:row.item_id,model_id:row.model_id,quantity:0};entry.quantity=costSafeSum(entry.quantity,row.quantity);grouped.set(key,entry);
 }
 const plus=new Set(['G1','G2','G3']),variants=[];
 const profiles=new Map((values.custom_profiles||[]).map(profile=>[profile.id,profile]));
 const assignments=new Map((values.custom_assignments||[]).map(assignment=>[costAssignmentKey(assignment),profiles.get(assignment.profile_id)]));
 const automated=new Map((automaticReference?.variants||[]).map(row=>[row.item_id+':'+row.model_id,row]));
 const metadataChanged=new Set(automaticReference?.metadata_changed_item_ids||[]),manualRuleKeys=new Set(automaticReference?.manual_variant_keys||[]),manualRuleProducts=new Map((automaticReference?.manual_product_costs||[]).map(row=>[row.item_id,row]));
 const ruleManaged=new Set(automaticReference?.restricted_item_ids||[]),classifiedItems=new Set(automaticReference?.classified_item_ids||[]),catalogBindings=new Map();
 // Validate one bounded product/model record at a time. The durable table is
 // intentionally not constrained by the legacy global 1,000-binding array.
 const requested=new Set(grouped.keys());
 for(const row of automaticReference?.catalog_bindings||[]){
  const key=row?.item_id+':'+row?.model_id;if(!requested.has(key))continue;
  let binding;try{[binding]=validateVariantBindings([row]);}catch{costReferenceFailure();}
  if(binding.operator_confirmed!==false||catalogBindings.has(key))costReferenceFailure();
  catalogBindings.set(key,binding);
 }
 let known=0,mapped=0,unmapped=0;
 for(const [key,row] of grouped){
  const legacy=confirmed.get(key),catalogBinding=catalogBindings.get(key),binding=legacy?.operator_confirmed===true?legacy:classifiedItems.has(row.item_id)?catalogBinding:catalogBinding||legacy,manual=assignments.get(key)||assignments.get(row.item_id+':*'),automatic=automated.get(key),changed=metadataChanged.has(row.item_id),manualRule=manualRuleKeys.has(key)?null:manualRuleProducts.get(row.item_id),allowedAutomatic=!changed||manualRuleKeys.has(key),custom=manual||manualRule||(allowedAutomatic&&automatic?.unit_cost_cents!==null&&automatic?{id:automatic.profile_id,label:automatic.profile_label,unit_cost_cents:automatic.unit_cost_cents}:null),out={...row,unit_cost_cents:null,production_cost_cents:null};
  if(custom){
   const subtotal=costSafeProduct(custom.unit_cost_cents,row.quantity);known=costSafeSum(known,subtotal);mapped=costSafeSum(mapped,row.quantity);
   out.unit_cost_cents=custom.unit_cost_cents;out.production_cost_cents=subtotal;
   out.cost_source='CUSTOM_PROFILE';out.cost_profile_id=custom.id;out.cost_profile_label=custom.label;
  }
  else if(changed&&legacy?.operator_confirmed!==true||(!changed||legacy?.operator_confirmed!==true)&&(automatic||ruleManaged.has(row.item_id))||!binding)unmapped=costSafeSum(unmapped,row.quantity);
  else{
   const garmentCost=size=>values[values.mode==='all_inclusive'?(plus.has(size)?'inclusive_plus_cents':'inclusive_regular_cents'):(plus.has(size)?'base_plus_cents':'base_regular_cents')];
   const single=binding.selling_unit==='SINGLE_GARMENT',pieceCount=single?1:2;
   let unit=single?garmentCost(binding.size):costSafeSum(garmentCost(binding.male_size),garmentCost(binding.female_size));
   // Retained components are inactive while all-inclusive mode is selected.
   // A per_kit component applies only to kits; an individual garment is not a kit.
   if(values.mode==='itemized')for(const component of values.components)if(component.basis==='per_piece'||!single)unit=costSafeSum(unit,costSafeProduct(component.amount_cents,component.basis==='per_piece'?pieceCount:1));
   const subtotal=costSafeProduct(unit,row.quantity);known=costSafeSum(known,subtotal);mapped=costSafeSum(mapped,row.quantity);
   out.unit_cost_cents=unit;out.production_cost_cents=subtotal;
   if(binding===catalogBinding)out.catalog_binding={...catalogBinding};
  }
  variants.push(out);
 }
 costSafeSum(mapped,unmapped);
 return {costs_revision:costState.revision,bindings_revision:bindings.revision,mode:values.mode,currency:'BRL',cost_stage:'PRODUCTION_COST_REFERENCE',status_scope:'ALL_RETURNED_STATUSES_REFERENCE_ONLY',known_subset_cents:known,total_cents:unmapped?null:known,mapped_quantity:mapped,unmapped_quantity:unmapped,variants,gross_profit_cents:null,financial_status:'FINANCIAL_DATA_UNAVAILABLE'};
}
