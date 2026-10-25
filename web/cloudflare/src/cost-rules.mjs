import {projectVariantCatalog,projectProductCostCatalog} from '../../finance/src/variant-catalog-frame.mjs';
import {costRuleProductLearning} from './cost-rule-learning.mjs';
import {CATALOG_CLASSIFICATION_SCHEMA,catalogClassificationQueries,catalogClassificationsFromSnapshot,storeCatalogClassificationFrame,readCatalogClassificationFence} from './catalog-classification.mjs';

export class CostRuleError extends Error {constructor(code,status=400){super(code);this.status=status;}}
const ruleFail=(code,status=400)=>{throw new CostRuleError(code,status);};
const rulePlain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const ruleExact=(value,keys)=>rulePlain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const ruleArray=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,i)=>Object.getOwnPropertyDescriptor(value,String(i))).every(row=>row&&Object.hasOwn(row,'value'));
const ruleId=value=>typeof value==='string'&&/^[a-z0-9-]{1,48}$/.test(value);
const ruleItem=value=>typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value);
const ruleModel=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(value);
const ruleAssignmentKey=value=>value.item_id+':'+(value.model_id===null?'*':value.model_id);
const ruleRevision=value=>Number.isSafeInteger(value)&&value>=1&&value<2147483647;
const ruleText=(value,max=64)=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);
export const COST_RULE_DEFAULTS={rules:[{id:'camiseta-infantil',label:'Camiseta infantil',enabled:true,unit_cost_cents:1250,name_patterns:['camiseta infantil','camisa infantil','blusa infantil','camiseta kids','camiseta crianca'],exclude_terms:['kit','combo','conjunto','calca','baggy','short','bermuda','moletom','body','vestido'],axis_names:['Tamanho','Tamanho infantil','Tamanho da criança','Tam','Size'],options:['4','6','8','10','12','14','16']}]};
const ruleSeed=JSON.stringify(COST_RULE_DEFAULTS).replaceAll("'","''");
export const COST_RULE_SCHEMA=[
 ...CATALOG_CLASSIFICATION_SCHEMA,
 `CREATE TABLE IF NOT EXISTS production_cost_rules_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS production_cost_rules_audit(revision INTEGER PRIMARY KEY,payload TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS production_cost_catalog(item_id TEXT PRIMARY KEY,catalog_fingerprint TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=1048576),checked_at INTEGER NOT NULL)`,
 `INSERT OR IGNORE INTO production_cost_rules_state(id,revision,payload,updated_at) SELECT 1,1,'${ruleSeed}',strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE NOT EXISTS(SELECT 1 FROM production_cost_rules_audit)`,
 `INSERT INTO production_cost_rules_audit(revision,payload,actor,created_at) SELECT revision,payload,'operator-confirmed-children-1250',updated_at FROM production_cost_rules_state WHERE changes()=1 AND id=1 AND revision=1`,
];
const ruleReady=new WeakMap();
function ruleClock(now){let value;try{value=now();}catch{ruleFail('COST_RULE_CLOCK_INVALID',503);}if(!Number.isSafeInteger(value)||value<1||value>9999999999999)ruleFail('COST_RULE_CLOCK_INVALID',503);return Math.floor(value/1000);}
async function ruleSetup(env){if(!env?.ADMIN_DB?.batch)ruleFail('COST_RULES_CONFIGURATION',503);const db=env.ADMIN_DB;if(!ruleReady.has(db))ruleReady.set(db,db.batch(COST_RULE_SCHEMA.map(sql=>db.prepare(sql))).catch(()=>{ruleReady.delete(db);ruleFail('COST_RULES_STORAGE_INVALID',503);}));await ruleReady.get(db);return db;}
const ruleNormalize=value=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).map(word=>({camisetas:'camiseta',camisas:'camisa',blusas:'blusa',infantis:'infantil',criancas:'crianca',calcas:'calca',shorts:'short',bermudas:'bermuda',kits:'kit',combos:'combo',conjuntos:'conjunto',casais:'casal',moletons:'moletom',vestidos:'vestido',saias:'saia',leggings:'legging',adultos:'adulto',adultas:'adulta',bonecas:'boneca',pets:'pet'})[word]||word).join(' ');
const ruleOption=value=>ruleNormalize(value).replace(/^(\d+) (anos?|years?)$/,'$1');
const ruleContains=(text,pattern)=>ruleNormalize(pattern).split(' ').every(word=>text.has(word));
function ruleProductScope(rules,name){
 const words=new Set(ruleNormalize(name).split(' ')),candidates=rules.filter(row=>row.enabled&&row.name_patterns.some(pattern=>ruleContains(words,pattern))&&!row.exclude_terms.some(pattern=>ruleContains(words,pattern))&&!(row.id==='camiseta-infantil'&&['casal','adulto','adulta','boneca','pet'].some(word=>words.has(word))));
 const nonShirt=!['camiseta','camisa','blusa'].some(word=>words.has(word))||['calca','baggy','short','bermuda','moletom','vestido','body','saia','legging','infantil','kids','crianca'].some(word=>words.has(word));
 return {candidates,managed:candidates.length>0||nonShirt};
}

export function validateCostRules(values){
 const hasAssignments=rulePlain(values)&&Object.hasOwn(values,'assignments');
 if(!ruleExact(values,['rules',...(hasAssignments?['assignments']:[])])||!ruleArray(values.rules,100))ruleFail('COST_RULES_INVALID');
 const ids=new Set(),rules=[];
 for(const row of values.rules){
  if(!ruleExact(row,['id','label','enabled','unit_cost_cents','name_patterns','exclude_terms','axis_names','options'])||!ruleId(row.id)||ids.has(row.id)||!ruleText(row.label,45)||typeof row.enabled!=='boolean'||!Number.isSafeInteger(row.unit_cost_cents)||row.unit_cost_cents<1||row.unit_cost_cents>1000000)ruleFail('COST_RULE_INVALID');
  for(const [key,max] of [['name_patterns',10],['exclude_terms',20],['axis_names',10],['options',100]])if(!ruleArray(row[key],max)||!row[key].every(value=>ruleText(value)&&ruleNormalize(value))||new Set(row[key].map(key==='options'?ruleOption:ruleNormalize)).size!==row[key].length)ruleFail('COST_RULE_CONDITION_INVALID');
  if(!row.name_patterns.length||row.options.length&&!row.axis_names.length)ruleFail('COST_RULE_CONDITION_INVALID');
  ids.add(row.id);rules.push({...row,name_patterns:[...row.name_patterns],exclude_terms:[...row.exclude_terms],axis_names:[...row.axis_names],options:[...row.options]});
 }
 const assignments=[],scopes=new Set();
 if(hasAssignments){
  if(!ruleArray(values.assignments,1000))ruleFail('COST_RULE_ASSIGNMENTS_INVALID');
  for(const row of values.assignments){
   if(!ruleExact(row,['item_id','model_id','rule_id','size'])||!ruleItem(row.item_id)||row.model_id!==null&&!ruleModel(row.model_id)||!ruleId(row.rule_id)||row.size!==null&&!ruleText(row.size)||row.model_id===null&&row.size!==null||scopes.has(ruleAssignmentKey(row)))ruleFail('COST_RULE_ASSIGNMENTS_INVALID');
   scopes.add(ruleAssignmentKey(row));assignments.push({...row});
  }
 }
 const result={rules,...(hasAssignments?{assignments}:{})};
 if(new TextEncoder().encode(JSON.stringify(result)).byteLength>120000)ruleFail('COST_RULES_TOO_LARGE');
 return result;
}
function ruleState(row){try{if(!row||!ruleRevision(row.revision)||typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at)))throw Error();return {revision:row.revision,values:validateCostRules(JSON.parse(row.payload)),updated_at:row.updated_at};}catch{ruleFail('COST_RULES_STORAGE_INVALID',503);}}
export async function readCostRules(env){const db=await ruleSetup(env);return ruleState(await db.prepare('SELECT revision,payload,updated_at FROM production_cost_rules_state WHERE id=1').first());}
export async function saveCostRules(env,body,actor){
 if(!ruleExact(body,['revision','values'])||!ruleRevision(body.revision)||body.revision>=2147483646)ruleFail('COST_RULES_REVISION_REQUIRED');
 if(typeof actor!=='string'||!actor.trim()||actor.length>256||/[\u0000-\u001f\u007f-\u009f]/.test(actor))ruleFail('COST_RULES_ACTOR_INVALID');
 const values=validateCostRules(body.values),db=await ruleSetup(env),current=await db.prepare('SELECT revision,payload,updated_at FROM production_cost_rules_state WHERE id=1').first(),previous=ruleState(current);
 if(current.revision!==body.revision)ruleFail('COST_RULES_CHANGED_RELOAD',409);
 if(previous.values.assignments?.length&&!Object.hasOwn(values,'assignments'))ruleFail('COST_RULE_ASSIGNMENTS_CHANGED_RELOAD',409);
 const raw=JSON.stringify(values),now=new Date().toISOString();
 const saved=await db.batch([db.prepare('UPDATE production_cost_rules_state SET revision=revision+1,payload=?,updated_at=? WHERE id=1 AND revision=? AND payload=?').bind(raw,now,body.revision,current.payload),db.prepare('INSERT INTO production_cost_rules_audit(revision,payload,actor,created_at) SELECT revision,payload,?,updated_at FROM production_cost_rules_state WHERE changes()=1 AND id=1 AND revision=? AND payload=?').bind(actor,body.revision+1,raw)]);
 if(saved[0].meta.changes!==1)ruleFail('COST_RULES_CHANGED_RELOAD',409);if(saved[1].meta.changes!==1)ruleFail('COST_RULES_STORAGE_INVALID',503);return readCostRules(env);
}

export async function assignCostRules(env,body,actor){
 if(!ruleExact(body,['revision','assignments'])||!ruleRevision(body.revision)||!ruleArray(body.assignments,1000)||!body.assignments.length)ruleFail('COST_RULE_ASSIGNMENTS_INVALID');
 const current=await readCostRules(env);if(current.revision!==body.revision)ruleFail('COST_RULES_CHANGED_RELOAD',409);
 const rules=new Map(current.values.rules.map(row=>[row.id,row])),assignments=new Map((current.values.assignments||[]).map(row=>[ruleAssignmentKey(row),row])),seen=new Set();
 for(const row of body.assignments){
  if(!ruleExact(row,['item_id','model_id','rule_id','size'])||!ruleItem(row.item_id)||row.model_id!==null&&!ruleModel(row.model_id)||row.rule_id!==null&&!ruleId(row.rule_id)||row.size!==null&&!ruleText(row.size)||seen.has(ruleAssignmentKey(row)))ruleFail('COST_RULE_ASSIGNMENTS_INVALID');
  const key=ruleAssignmentKey(row);seen.add(key);
  if(row.rule_id===null){if(row.size!==null)ruleFail('COST_RULE_ASSIGNMENTS_INVALID');assignments.delete(key);continue;}
  const rule=rules.get(row.rule_id);if(!rule?.enabled)ruleFail('COST_RULE_ASSIGNMENT_RULE_UNAVAILABLE',409);
  if(row.model_id===null?row.size!==null:rule.options.length?!rule.options.includes(row.size):row.size!==null)ruleFail('COST_RULE_ASSIGNMENT_SIZE_INVALID');
  assignments.set(key,{...row});
 }
 const values={...current.values,assignments:[...assignments.values()].sort((a,b)=>a.item_id.length-b.item_id.length||a.item_id.localeCompare(b.item_id)||(a.model_id===null?-1:b.model_id===null?1:a.model_id.length-b.model_id.length||a.model_id.localeCompare(b.model_id)))};
 return saveCostRules(env,{revision:body.revision,values},actor);
}

function ruleAssignedVariant(values,itemId,assignment){
 const rule=values.rules.find(row=>row.enabled&&row.id===assignment.rule_id),valid=rule&&(rule.options.length?rule.options.includes(assignment.size):assignment.size===null);
 return {item_id:itemId,model_id:assignment.model_id,unit_cost_cents:valid?rule.unit_cost_cents:null,profile_id:valid?'auto-'+rule.id:null,profile_label:valid?rule.label+(assignment.size?' · '+assignment.size.slice(0,12):''):null,reason:valid?null:'RULE_ASSIGNMENT_PENDING'};
}

export function evaluateCostRules(values,itemId,catalog,{stale=false}={}){
 const variants=Object.getOwnPropertyDescriptor(catalog||{},'variants')?.value,validated=validateCostRules(values),rules=validated.rules.filter(row=>row.enabled),source=projectProductCostCatalog(catalog,Array.isArray(variants)?variants.length:-1);
 if(!ruleItem(itemId)||!source)ruleFail('COST_RULE_CATALOG_INVALID',503);
 const assignments=(validated.assignments||[]).filter(row=>row.item_id===itemId),manualProduct=assignments.find(row=>row.model_id===null),manualVariants=new Map(assignments.filter(row=>row.model_id!==null).map(row=>[row.model_id,row]));
 const normalScope=ruleProductScope(rules,source.product_name),learning=costRuleProductLearning({rules:validated.rules,...(assignments.length?{assignments}:{})},itemId,source,{stale});
 const inferred=rules.find(row=>row.id===learning.rule_id),conflicting=learning.status==='CONFLICT'&&assignments.length>0;
 const candidates=manualProduct?rules.filter(row=>row.id===manualProduct.rule_id):learning.status==='LEARNED'?[inferred].filter(Boolean):conflicting?[]:learning.status==='RECOGNIZED'?[...new Map([...normalScope.candidates,...(inferred?[inferred]:[])].map(row=>[row.id,row])).values()]:normalScope.candidates;
 const managed=!!manualProduct||normalScope.managed||learning.managed||conflicting;
 // Numeric sizes never select a product type. Clothing outside the legacy
 // T-shirt/kit convention must have its own configured rule or manual cost.
 return source.variants.flatMap(variant=>{
  if(manualVariants.has(variant.model_id))return [ruleAssignedVariant(validated,itemId,manualVariants.get(variant.model_id))];
  const matches=[];
  if(!stale)for(const row of candidates){
   if(!row.options.length){matches.push({row,size:''});continue;}
   const axes=variant.attributes.filter(attribute=>row.axis_names.some(name=>ruleNormalize(name)===ruleNormalize(attribute.name)));
   if(axes.length===1&&row.options.some(option=>ruleOption(option)===ruleOption(axes[0].value)))matches.push({row,size:axes[0].value});
  }
  if(matches.length===1){const {row,size}=matches[0];return [{item_id:itemId,model_id:variant.model_id,unit_cost_cents:row.unit_cost_cents,profile_id:'auto-'+row.id,profile_label:row.label+(size?' · '+size.slice(0,12):''),reason:null}];}
  if(managed)return [{item_id:itemId,model_id:variant.model_id,unit_cost_cents:null,profile_id:null,profile_label:null,reason:stale?'CATALOG_STALE':matches.length>1?'RULE_CONFLICT':'RULE_NOT_MATCHED'}];
  return [];
 });
}

export function costRuleSnapshotQueries(db,itemIds){
 if(!ruleArray(itemIds,3000)||!itemIds.every(ruleItem))ruleFail('COST_RULE_CATALOG_REQUEST_INVALID');
 const ids=[...new Set(itemIds)];if(ids.length>3000||!ids.every(ruleItem))ruleFail('COST_RULE_CATALOG_REQUEST_INVALID');
 const queries=[db.prepare('SELECT revision,payload,updated_at FROM production_cost_rules_state WHERE id=1')];
 for(let i=0;i<ids.length;i+=90){const chunk=ids.slice(i,i+90);queries.push(db.prepare('SELECT item_id,catalog_fingerprint,payload,checked_at FROM production_cost_catalog WHERE item_id IN ('+chunk.map(()=>'?').join(',')+')').bind(...chunk));}
 return queries;
}
export function costRuleReferenceFromSnapshot(snapshot,{now=()=>Date.now()}={}){
 const state=ruleState(snapshot[0].results[0]),variants=[],restricted=new Set(),learning=[],catalogued=new Set();const stamp=ruleClock(now);
 for(const row of snapshot.slice(1).flatMap(value=>value.results)){
  if(!Number.isSafeInteger(row.checked_at)||row.checked_at<1||row.checked_at>stamp+60||!(/^[a-f0-9]{64}$/).test(row.catalog_fingerprint))ruleFail('COST_RULES_STORAGE_INVALID',503);
  let catalog;try{catalog=JSON.parse(row.payload);}catch{ruleFail('COST_RULES_STORAGE_INVALID',503);}
  // Classification is saved evidence. Its age schedules verification; age alone
  // must not erase a recognized production cost while the queue catches up.
  const stale=false,recognition=costRuleProductLearning({rules:state.values.rules,assignments:(state.values.assignments||[]).filter(assignment=>assignment.item_id===row.item_id)},row.item_id,catalog,{stale}),productVariants=evaluateCostRules(state.values,row.item_id,catalog,{stale});
  variants.push(...productVariants);catalogued.add(row.item_id);
  const rule=state.values.rules.find(rule=>rule.id===recognition.rule_id),conflicting=recognition.status==='CONFLICT'&&(state.values.assignments||[]).some(assignment=>assignment.item_id===row.item_id);
  if(ruleProductScope(state.values.rules,catalog.product_name).managed||recognition.managed||conflicting)restricted.add(row.item_id);
  const ambiguity=recognition.status==='RECOGNIZED'&&productVariants.some(variant=>variant.reason==='RULE_CONFLICT');
  learning.push({item_id:row.item_id,rule_id:recognition.rule_id,rule_label:rule?.label??null,status:ambiguity?'CONFLICT':recognition.status,reason:ambiguity?'RULE_CONFLICT':recognition.reason,evidence_count:recognition.evidence_models.length,matched_variants:productVariants.filter(variant=>variant.unit_cost_cents!==null).length,pending_variants:productVariants.filter(variant=>variant.unit_cost_cents===null).length,checked_at:row.checked_at});
 }
 const seen=new Set(variants.map(row=>row.item_id+':'+row.model_id));
 for(const assignment of state.values.assignments||[]){
  if(assignment.model_id===null){restricted.add(assignment.item_id);continue;}
  const key=assignment.item_id+':'+assignment.model_id;if(!seen.has(key)){variants.push(ruleAssignedVariant(state.values,assignment.item_id,assignment));seen.add(key);}
 }
 for(const itemId of new Set((state.values.assignments||[]).map(row=>row.item_id)))if(!catalogued.has(itemId)){
  const recognition=costRuleProductLearning({rules:state.values.rules,assignments:(state.values.assignments||[]).filter(assignment=>assignment.item_id===itemId)},itemId,null),rule=state.values.rules.find(rule=>rule.id===recognition.rule_id);
  learning.push({item_id:itemId,rule_id:recognition.rule_id,rule_label:rule?.label??null,status:recognition.status,reason:recognition.reason,evidence_count:recognition.evidence_models.length,matched_variants:variants.filter(row=>row.item_id===itemId&&row.unit_cost_cents!==null).length,pending_variants:variants.filter(row=>row.item_id===itemId&&row.unit_cost_cents===null).length,checked_at:stamp});
 }
 const reference={revision:state.revision,variants,restricted_item_ids:[...restricted],learning},rules=new Map(state.values.rules.filter(rule=>rule.enabled).map(rule=>[rule.id,rule])),manualKeys=[],manualProducts=[];
 for(const assignment of state.values.assignments||[]){if(assignment.model_id!==null){manualKeys.push(assignment.item_id+':'+assignment.model_id);continue;}const rule=rules.get(assignment.rule_id);if(rule?.options.length===0)manualProducts.push({item_id:assignment.item_id,id:'auto-'+rule.id,label:rule.label,unit_cost_cents:rule.unit_cost_cents});}
 Object.defineProperties(reference,{manual_variant_keys:{value:manualKeys},manual_product_costs:{value:manualProducts}});return reference;
}
export function mergeCatalogCostReference(reference,classifications){
 if(!classifications||!ruleRevision(classifications.revision)||!Array.isArray(classifications.bindings)||!Array.isArray(classifications.products)||!Array.isArray(classifications.variants))ruleFail('COST_RULES_STORAGE_INVALID',503);
 const changed=new Set(classifications.products.filter(row=>row.reason==='CATALOG_METADATA_CHANGED').map(row=>row.item_id)),manual=new Set(reference.manual_variant_keys||[]),products=new Set((reference.manual_product_costs||[]).map(row=>row.item_id));
 const merged={...reference,variants:reference.variants.map(row=>changed.has(row.item_id)&&!manual.has(row.item_id+':'+row.model_id)&&!products.has(row.item_id)?{...row,unit_cost_cents:null,profile_id:null,profile_label:null,reason:'CATALOG_METADATA_CHANGED'}:row),classification_revision:classifications.revision,catalog_bindings:classifications.bindings,catalog_products:classifications.products,catalog_variants:classifications.variants,classified_item_ids:classifications.products.filter(row=>typeof row.catalog_fingerprint==='string'&&/^[a-f0-9]{64}$/.test(row.catalog_fingerprint)&&Number.isSafeInteger(row.checked_at)&&row.checked_at>0).map(row=>row.item_id)};
 Object.defineProperties(merged,{manual_variant_keys:{value:reference.manual_variant_keys||[]},manual_product_costs:{value:reference.manual_product_costs||[]},metadata_changed_item_ids:{value:[...changed]}});return merged;
}
export async function readCostRuleReference(env,itemIds,options={}){
 const db=await ruleSetup(env),rules=costRuleSnapshotQueries(db,itemIds),classes=catalogClassificationQueries(db,itemIds),rows=await db.batch([...rules,...classes]);
 return mergeCatalogCostReference(costRuleReferenceFromSnapshot(rows.slice(0,rules.length),options),catalogClassificationsFromSnapshot(rows.slice(rules.length)));
}

export async function selectCostRuleCandidates(env,itemIds,{now=()=>Date.now()}={}){
 if(!ruleArray(itemIds,3000)||!itemIds.every(ruleItem))ruleFail('COST_RULE_CATALOG_REQUEST_INVALID');
 const ids=[...new Set(itemIds)],db=await ruleSetup(env),queries=[],stamp=ruleClock(now);
 for(let i=0;i<ids.length;i+=90){const chunk=ids.slice(i,i+90);queries.push(db.prepare('SELECT item_id,checked_at FROM production_cost_catalog WHERE item_id IN ('+chunk.map(()=>'?').join(',')+')').bind(...chunk));}
 const rows=queries.length?(await db.batch(queries)).flatMap(value=>value.results):[],times=new Map(rows.map(row=>[row.item_id,row.checked_at]));
 return ids.filter(id=>!times.has(id)||stamp-times.get(id)>600).sort((a,b)=>(times.get(a)||0)-(times.get(b)||0)).slice(0,3);
}

export async function syncCostRuleCatalog(env,itemIds,getCatalog,{force=false,now=()=>Date.now()}={}){
 if(!ruleArray(itemIds,3)||!itemIds.length||!itemIds.every(ruleItem)||new Set(itemIds).size!==itemIds.length||typeof getCatalog!=='function'||typeof force!=='boolean')ruleFail('COST_RULE_CATALOG_REQUEST_INVALID');
 const db=await ruleSetup(env),stamp=ruleClock(now),cached=(await db.prepare('SELECT item_id,checked_at FROM production_cost_catalog WHERE item_id IN ('+itemIds.map(()=>'?').join(',')+')').bind(...itemIds).all()).results;
 const fresh=new Set(cached.filter(row=>Number.isSafeInteger(row.checked_at)&&row.checked_at<=stamp+60&&stamp-row.checked_at<=600).map(row=>row.item_id)),selected=itemIds.filter(id=>force||!fresh.has(id));
 const result=async processed=>{const reference=await readCostRuleReference(env,itemIds,{now});return {processed,cached:itemIds.filter(id=>!processed.includes(id)),revision:reference.revision,matched_variants:reference.variants.filter(row=>row.unit_cost_cents!==null&&itemIds.includes(row.item_id)).map(row=>({item_id:row.item_id,model_id:row.model_id})),learning:reference.learning.filter(row=>itemIds.includes(row.item_id))};};
 if(!selected.length)return result([]);
 const fence=await readCatalogClassificationFence(env,selected);
 let raw;try{raw=await getCatalog(env,{item_ids:selected,selling_unit:'AUTO',include_cost_catalog:true});}catch{ruleFail('COST_RULE_CATALOG_UNAVAILABLE',503);}
 const frame=projectVariantCatalog(raw);
 if(!frame||frame.checked_at>stamp+60||stamp-frame.checked_at>60||frame.products.length!==selected.length||frame.products.some(row=>!selected.includes(row.item_id)||!row.cost_catalog))ruleFail('COST_RULE_CATALOG_UNAVAILABLE',503);
 // Reuse this exact validated response for garment composition and cost rules.
 // The durable store writes the catalogue and normalized classes atomically.
 await storeCatalogClassificationFrame(env,frame,{now,fence});
 return result(selected);
}
