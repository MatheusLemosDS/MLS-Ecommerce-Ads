import {validateVariantBindings} from './variant-bindings.mjs';

// Operator-confirmed production costs. These do not come from Shopee finances.
export const COST_DEFAULTS=Object.freeze({mode:'all_inclusive',inclusive_regular_cents:1590,inclusive_plus_cents:1890,base_regular_cents:null,base_plus_cents:null,components:Object.freeze([])});
export const COST_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS production_costs_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS production_costs_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, revision INTEGER UNIQUE NOT NULL, payload TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL)`,
];
export class ProductionCostError extends Error {
 constructor(code,status=400){super(code);this.status=status;}
}
const costFail=(code,status=400)=>{throw new ProductionCostError(code,status);};
const costExact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const costMoney=(value,positive=false)=>Number.isInteger(value)&&value>=(positive?1:0)&&value<=1000000;
const costRevisionValid=value=>Number.isSafeInteger(value)&&value>=1&&value<=2147483647;

export function validateProductionCosts(values){
 const keys=['mode','inclusive_regular_cents','inclusive_plus_cents','base_regular_cents','base_plus_cents','components'];
 if(!costExact(values,keys)||!['all_inclusive','itemized'].includes(values.mode))costFail('PRODUCTION_COSTS_INVALID');
 if(!costMoney(values.inclusive_regular_cents,true)||!costMoney(values.inclusive_plus_cents,true))costFail('PRODUCTION_COST_AMOUNT_INVALID');
 for(const key of ['base_regular_cents','base_plus_cents']){
  if(values[key]!==null&&!costMoney(values[key],true))costFail('PRODUCTION_COST_AMOUNT_INVALID');
  if(values.mode==='itemized'&&values[key]===null)costFail('PRODUCTION_COST_ITEMIZED_BASE_REQUIRED');
 }
 if(!Array.isArray(values.components)||values.components.length>20)costFail('PRODUCTION_COST_COMPONENTS_INVALID');
 const seen=new Set(),components=[];
 for(const component of values.components){
  if(!costExact(component,['id','label','basis','amount_cents'])||typeof component.id!=='string'||!(/^[a-z0-9-]{1,64}$/).test(component.id)||seen.has(component.id))costFail('PRODUCTION_COST_COMPONENT_INVALID');
  if(typeof component.label!=='string'||(/[\u0000-\u001f\u007f-\u009f]/).test(component.label))costFail('PRODUCTION_COST_COMPONENT_INVALID');
  const label=component.label.trim();
  if(label.length<1||label.length>60||!['per_piece','per_kit'].includes(component.basis)||!costMoney(component.amount_cents))costFail('PRODUCTION_COST_COMPONENT_INVALID');
  seen.add(component.id);components.push({id:component.id,label,basis:component.basis,amount_cents:component.amount_cents});
 }
 return {mode:values.mode,inclusive_regular_cents:values.inclusive_regular_cents,inclusive_plus_cents:values.inclusive_plus_cents,base_regular_cents:values.base_regular_cents,base_plus_cents:values.base_plus_cents,components};
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
 const raw=JSON.stringify(validateProductionCosts(body.values)),now=new Date().toISOString();
 const results=await env.ADMIN_DB.batch([
  env.ADMIN_DB.prepare('UPDATE production_costs_state SET revision=revision+1,payload=?,updated_at=? WHERE id=1 AND revision=?').bind(raw,now,body.revision),
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
export function productionCostReference(frame,bindings,costState){
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
 let known=0,mapped=0,unmapped=0;
 for(const [key,row] of grouped){
  const binding=confirmed.get(key),out={...row,unit_cost_cents:null,production_cost_cents:null};
  if(!binding)unmapped=costSafeSum(unmapped,row.quantity);
  else{
   const garmentCost=size=>values[values.mode==='all_inclusive'?(plus.has(size)?'inclusive_plus_cents':'inclusive_regular_cents'):(plus.has(size)?'base_plus_cents':'base_regular_cents')];
   const single=binding.selling_unit==='SINGLE_GARMENT',pieceCount=single?1:2;
   let unit=single?garmentCost(binding.size):costSafeSum(garmentCost(binding.male_size),garmentCost(binding.female_size));
   // Retained components are inactive while all-inclusive mode is selected.
   // A per_kit component applies only to kits; an individual garment is not a kit.
   if(values.mode==='itemized')for(const component of values.components)if(component.basis==='per_piece'||!single)unit=costSafeSum(unit,costSafeProduct(component.amount_cents,component.basis==='per_piece'?pieceCount:1));
   const subtotal=costSafeProduct(unit,row.quantity);known=costSafeSum(known,subtotal);mapped=costSafeSum(mapped,row.quantity);
   out.unit_cost_cents=unit;out.production_cost_cents=subtotal;
  }
  variants.push(out);
 }
 costSafeSum(mapped,unmapped);
 return {costs_revision:costState.revision,bindings_revision:bindings.revision,mode:values.mode,currency:'BRL',cost_stage:'PRODUCTION_COST_REFERENCE',status_scope:'ALL_RETURNED_STATUSES_REFERENCE_ONLY',known_subset_cents:known,total_cents:unmapped?null:known,mapped_quantity:mapped,unmapped_quantity:unmapped,variants,gross_profit_cents:null,financial_status:'FINANCIAL_DATA_UNAVAILABLE'};
}
