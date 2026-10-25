import {readCostRules,validateCostRules} from './cost-rules.mjs';
import {validateProductionCosts} from './production-costs.mjs';

// These three corrections record explicit confirmations for this single shop.
// They are not defaults for other shops or later operator configurations.
const shopId=1178167501,actor='operator-confirmed-cost-correction';
const corrections=['adult-22199878767-remove-child-rule-v1','child-size-2-1250-v1','adult-triple-58271140523-149796059126-v1'];
export const OPERATOR_COST_CORRECTIONS_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS operator_cost_corrections(shop_id INTEGER NOT NULL,correction_id TEXT NOT NULL,status TEXT NOT NULL,reason TEXT NOT NULL,previous_revision INTEGER,revision INTEGER,checked_at INTEGER NOT NULL,PRIMARY KEY(shop_id,correction_id))`,
];
export class OperatorCostCorrectionError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const fail=code=>{throw new OperatorCostCorrectionError(code);};
const revision=value=>Number.isSafeInteger(value)&&value>=1&&value<=2147483647;
const project=row=>{if(!row||row.shop_id!==shopId||!corrections.includes(row.correction_id)||!['APPLIED','SKIPPED','CONFLICT'].includes(row.status)||typeof row.reason!=='string'||!/^[A-Z][A-Z0-9_]{0,95}$/.test(row.reason)||!['previous_revision','revision'].every(key=>row[key]===null||revision(row[key]))||!Number.isSafeInteger(row.checked_at)||row.checked_at<1||row.checked_at>9999999999)fail('OPERATOR_COST_CORRECTION_STATE_INVALID');return {id:row.correction_id,status:row.status,reason:row.reason,previous_revision:row.previous_revision,revision:row.revision,checked_at:row.checked_at};};
const current=async(db,id)=>{const row=await db.prepare('SELECT * FROM operator_cost_corrections WHERE shop_id=? AND correction_id=?').bind(shopId,id).first();return row?project(row):null;};
async function record(db,id,status,reason,previous,stamp){
 await db.prepare('INSERT OR IGNORE INTO operator_cost_corrections(shop_id,correction_id,status,reason,previous_revision,revision,checked_at) VALUES(?,?,?,?,?,?,?)').bind(shopId,id,status,reason,previous,previous,stamp).run();return current(db,id);
}
function stored(row,kind){
 if(!row||!revision(row.revision)||typeof row.payload!=='string'||typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at)))fail('OPERATOR_COST_CORRECTION_STATE_INVALID');
 let values;try{values=(kind==='rules'?validateCostRules:validateProductionCosts)(JSON.parse(row.payload));}catch{fail('OPERATOR_COST_CORRECTION_STATE_INVALID');}return {...row,values};
}
async function apply(db,id,kind,before,values,stamp,guardRules=null){
 if(before.revision>=2147483646)return record(db,id,'CONFLICT','REVISION_LIMIT',before.revision,stamp);
 const state=kind==='rules'?'production_cost_rules_state':'production_costs_state',audit=kind==='rules'?'production_cost_rules_audit':'production_costs_audit',payload=JSON.stringify((kind==='rules'?validateCostRules:validateProductionCosts)(values)),updatedAt=new Date(stamp*1000).toISOString();
 const guard=guardRules?' AND EXISTS(SELECT 1 FROM production_cost_rules_state WHERE id=1 AND revision=? AND payload=?)':'',args=guardRules?[guardRules.revision,guardRules.payload]:[];
 const results=await db.batch([
  db.prepare('UPDATE '+state+' SET revision=revision+1,payload=?,updated_at=? WHERE id=1 AND revision=? AND payload=? AND NOT EXISTS(SELECT 1 FROM operator_cost_corrections WHERE shop_id=? AND correction_id=?)'+guard).bind(payload,updatedAt,before.revision,before.payload,shopId,id,...args),
  db.prepare('INSERT INTO '+audit+'(revision,payload,actor,created_at) SELECT revision,payload,?,updated_at FROM '+state+' WHERE changes()=1 AND id=1 AND revision=? AND payload=? AND updated_at=?').bind(actor,before.revision+1,payload,updatedAt),
  db.prepare("INSERT INTO operator_cost_corrections(shop_id,correction_id,status,reason,previous_revision,revision,checked_at) SELECT ?,?,'APPLIED','OPERATOR_CONFIRMED',?,?,? WHERE changes()=1").bind(shopId,id,before.revision,before.revision+1,stamp),
 ]);
 if(results[0]?.meta?.changes===1&&results[1]?.meta?.changes===1&&results[2]?.meta?.changes===1)return current(db,id);
 const applied=await current(db,id);return applied||record(db,id,'CONFLICT','STATE_CHANGED',before.revision,stamp);
}

export async function applyConfirmedOperatorCostCorrections(env,{now=()=>Date.now()}={}){
 const db=env?.ADMIN_DB;if(!db||typeof db.prepare!=='function'||typeof db.batch!=='function')fail('OPERATOR_COST_CORRECTION_CONFIGURATION');let millis;try{millis=now();}catch{fail('OPERATOR_COST_CORRECTION_CLOCK_INVALID');}if(!Number.isSafeInteger(millis)||millis<1||millis>9999999999999)fail('OPERATOR_COST_CORRECTION_CLOCK_INVALID');const stamp=Math.floor(millis/1000);
 try{
  const initial=await db.batch([...OPERATOR_COST_CORRECTIONS_SCHEMA.map(sql=>db.prepare(sql)),db.prepare('SELECT * FROM operator_cost_corrections WHERE shop_id=? AND correction_id IN (?,?,?)').bind(shopId,...corrections)]),known=new Map(initial.at(-1).results.map(row=>[row.correction_id,project(row)]));
  if(corrections.every(id=>known.has(id)))return {schema:'operator_cost_corrections_v1',shop_id:shopId,corrections:corrections.map(id=>known.get(id))};
  await readCostRules(env);const results=[];
  for(const id of corrections){
   const saved=await current(db,id);if(saved){results.push(saved);continue;}
   if(id===corrections[0]){
    const before=stored(await db.prepare('SELECT revision,payload,updated_at FROM production_cost_rules_state WHERE id=1').first(),'rules'),assignment=before.values.assignments?.find(row=>row.item_id==='22199878767'&&row.model_id===null);
    if(!assignment){results.push(await record(db,id,'SKIPPED','ASSIGNMENT_ALREADY_CLEAR',before.revision,stamp));continue;}
    if(assignment.rule_id!=='camiseta-infantil'||assignment.size!==null){results.push(await record(db,id,'CONFLICT','NEWER_OPERATOR_ASSIGNMENT',before.revision,stamp));continue;}
    results.push(await apply(db,id,'rules',before,{...before.values,assignments:before.values.assignments.filter(row=>row!==assignment)},stamp));continue;
   }
   if(id===corrections[1]){
    const before=stored(await db.prepare('SELECT revision,payload,updated_at FROM production_cost_rules_state WHERE id=1').first(),'rules'),rule=before.values.rules.find(row=>row.id==='camiseta-infantil'),normalize=value=>value.normalize('NFKD').replace(/\p{M}/gu,'').trim().toLowerCase().replace(/\s+(anos?|years?)$/,'');
    if(!rule||!rule.enabled||rule.unit_cost_cents!==1250){results.push(await record(db,id,'CONFLICT',!rule?'CHILD_RULE_MISSING':!rule.enabled?'CHILD_RULE_DISABLED':'CHILD_RULE_PRICE_CHANGED',before.revision,stamp));continue;}
    if(rule.options.some(option=>normalize(option)==='2')){results.push(await record(db,id,'SKIPPED','SIZE_ALREADY_REGISTERED',before.revision,stamp));continue;}
    if(!['4','6','8','10','12','14','16'].every(size=>rule.options.some(option=>normalize(option)===size))){results.push(await record(db,id,'CONFLICT','CHILD_RULE_OPTIONS_CHANGED',before.revision,stamp));continue;}
    results.push(await apply(db,id,'rules',before,{...before.values,rules:before.values.rules.map(row=>row===rule?{...row,options:['2',...row.options]}:row)},stamp));continue;
   }
   const snapshot=await db.batch([db.prepare('SELECT revision,payload,updated_at FROM production_costs_state WHERE id=1'),db.prepare('SELECT revision,payload,updated_at FROM production_cost_rules_state WHERE id=1')]),before=stored(snapshot[0].results[0],'costs'),rules=stored(snapshot[1].results[0],'rules');
   const itemId='58271140523',modelId='149796059126',recipe={id:'adult-triple-pmg-confirmed',label:'Combo de 3 camisetas adultas P/M/G',components:['P','M','G'].map(size=>({kind:'ADULT_GARMENT',size,quantity:1}))},recipes=before.values.composition_recipes||[],assignments=before.values.composition_assignments||[],existingRecipe=recipes.find(row=>row.id===recipe.id),existing=assignments.find(row=>row.item_id===itemId&&row.model_id===modelId),custom=(before.values.custom_assignments||[]).some(row=>row.item_id===itemId&&(row.model_id===null||row.model_id===modelId)),ruleAssignment=(rules.values.assignments||[]).some(row=>row.item_id===itemId&&(row.model_id===null||row.model_id===modelId));
   if(custom||ruleAssignment||existing&&existing.recipe_id!==recipe.id||existingRecipe&&JSON.stringify(existingRecipe.components)!==JSON.stringify(recipe.components)){results.push(await record(db,id,'CONFLICT','NEWER_OPERATOR_COST',before.revision,stamp));continue;}
   if(existing&&existingRecipe){results.push(await record(db,id,'SKIPPED','COMPOSITION_ALREADY_REGISTERED',before.revision,stamp));continue;}
   results.push(await apply(db,id,'costs',before,{...before.values,composition_recipes:existingRecipe?recipes:[...recipes,recipe],composition_assignments:[...assignments,{item_id:itemId,model_id:modelId,recipe_id:recipe.id}]},stamp,rules));
  }
  return {schema:'operator_cost_corrections_v1',shop_id:shopId,corrections:results};
 }catch(error){if(error instanceof OperatorCostCorrectionError)throw error;fail('OPERATOR_COST_CORRECTION_STORAGE_UNAVAILABLE');}
}
