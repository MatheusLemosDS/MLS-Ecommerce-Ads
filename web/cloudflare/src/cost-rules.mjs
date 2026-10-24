import {projectVariantCatalog,projectProductCostCatalog} from '../../finance/src/variant-catalog-frame.mjs';

export class CostRuleError extends Error {constructor(code,status=400){super(code);this.status=status;}}
const ruleFail=(code,status=400)=>{throw new CostRuleError(code,status);};
const rulePlain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const ruleExact=(value,keys)=>rulePlain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const ruleArray=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,i)=>Object.getOwnPropertyDescriptor(value,String(i))).every(row=>row&&Object.hasOwn(row,'value'));
const ruleId=value=>typeof value==='string'&&/^[a-z0-9-]{1,48}$/.test(value);
const ruleItem=value=>typeof value==='string'&&/^[1-9][0-9]{0,19}$/.test(value);
const ruleRevision=value=>Number.isSafeInteger(value)&&value>=1&&value<2147483647;
const ruleText=(value,max=64)=>typeof value==='string'&&value===value.trim()&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);
export const COST_RULE_DEFAULTS={rules:[{id:'camiseta-infantil',label:'Camiseta infantil',enabled:true,unit_cost_cents:1250,name_patterns:['camiseta infantil','camisa infantil','blusa infantil','camiseta kids','camiseta crianca'],exclude_terms:['kit','combo','conjunto','calca','baggy','short','bermuda','moletom','body','vestido'],axis_names:['Tamanho','Tamanho infantil','Tamanho da criança','Tam','Size'],options:['4','6','8','10','12','14','16']}]};
const ruleSeed=JSON.stringify(COST_RULE_DEFAULTS).replaceAll("'","''");
export const COST_RULE_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS production_cost_rules_state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS production_cost_rules_audit(revision INTEGER PRIMARY KEY,payload TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS production_cost_catalog(item_id TEXT PRIMARY KEY,catalog_fingerprint TEXT NOT NULL,payload TEXT NOT NULL CHECK(length(CAST(payload AS BLOB))<=1048576),checked_at INTEGER NOT NULL)`,
 `INSERT OR IGNORE INTO production_cost_rules_state(id,revision,payload,updated_at) SELECT 1,1,'${ruleSeed}',strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE NOT EXISTS(SELECT 1 FROM production_cost_rules_audit)`,
 `INSERT INTO production_cost_rules_audit(revision,payload,actor,created_at) SELECT revision,payload,'operator-confirmed-children-1250',updated_at FROM production_cost_rules_state WHERE changes()=1 AND id=1 AND revision=1`,
];
const ruleReady=new WeakMap();
function ruleClock(now){let value;try{value=now();}catch{ruleFail('COST_RULE_CLOCK_INVALID',503);}if(!Number.isSafeInteger(value)||value<1||value>9999999999999)ruleFail('COST_RULE_CLOCK_INVALID',503);return Math.floor(value/1000);}
async function ruleSetup(env){if(!env?.ADMIN_DB?.batch)ruleFail('COST_RULES_CONFIGURATION',503);const db=env.ADMIN_DB;if(!ruleReady.has(db))ruleReady.set(db,db.batch(COST_RULE_SCHEMA.map(sql=>db.prepare(sql))).catch(()=>{ruleReady.delete(db);ruleFail('COST_RULES_STORAGE_INVALID',503);}));await ruleReady.get(db);return db;}
const ruleNormalize=value=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).map(word=>({camisetas:'camiseta',camisas:'camisa',blusas:'blusa',infantis:'infantil',criancas:'crianca',calcas:'calca',shorts:'short',bermudas:'bermuda'})[word]||word).join(' ');
const ruleOption=value=>ruleNormalize(value).replace(/^(\d+) (anos?|years?)$/,'$1');
const ruleContains=(text,pattern)=>ruleNormalize(pattern).split(' ').every(word=>text.has(word));
function ruleProductScope(rules,name){
 const words=new Set(ruleNormalize(name).split(' ')),candidates=rules.filter(row=>row.enabled&&row.name_patterns.some(pattern=>ruleContains(words,pattern))&&!row.exclude_terms.some(pattern=>ruleContains(words,pattern)));
 const nonShirt=!['camiseta','camisa','blusa'].some(word=>words.has(word))||['calca','baggy','short','bermuda','moletom','vestido','body','saia','legging','infantil','kids','crianca'].some(word=>words.has(word));
 return {candidates,managed:candidates.length>0||nonShirt};
}

export function validateCostRules(values){
 if(!ruleExact(values,['rules'])||!ruleArray(values.rules,100))ruleFail('COST_RULES_INVALID');
 const ids=new Set(),rules=[];
 for(const row of values.rules){
  if(!ruleExact(row,['id','label','enabled','unit_cost_cents','name_patterns','exclude_terms','axis_names','options'])||!ruleId(row.id)||ids.has(row.id)||!ruleText(row.label,45)||typeof row.enabled!=='boolean'||!Number.isSafeInteger(row.unit_cost_cents)||row.unit_cost_cents<1||row.unit_cost_cents>1000000)ruleFail('COST_RULE_INVALID');
  for(const [key,max] of [['name_patterns',10],['exclude_terms',20],['axis_names',10],['options',100]])if(!ruleArray(row[key],max)||!row[key].every(value=>ruleText(value)&&ruleNormalize(value))||new Set(row[key].map(key==='options'?ruleOption:ruleNormalize)).size!==row[key].length)ruleFail('COST_RULE_CONDITION_INVALID');
  if(!row.name_patterns.length||row.options.length&&!row.axis_names.length)ruleFail('COST_RULE_CONDITION_INVALID');
  ids.add(row.id);rules.push({...row,name_patterns:[...row.name_patterns],exclude_terms:[...row.exclude_terms],axis_names:[...row.axis_names],options:[...row.options]});
 }
 if(new TextEncoder().encode(JSON.stringify({rules})).byteLength>120000)ruleFail('COST_RULES_TOO_LARGE');
 return {rules};
}
function ruleState(row){try{if(!row||!ruleRevision(row.revision)||typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at)))throw Error();return {revision:row.revision,values:validateCostRules(JSON.parse(row.payload)),updated_at:row.updated_at};}catch{ruleFail('COST_RULES_STORAGE_INVALID',503);}}
export async function readCostRules(env){const db=await ruleSetup(env);return ruleState(await db.prepare('SELECT revision,payload,updated_at FROM production_cost_rules_state WHERE id=1').first());}
export async function saveCostRules(env,body,actor){
 if(!ruleExact(body,['revision','values'])||!ruleRevision(body.revision)||body.revision>=2147483646)ruleFail('COST_RULES_REVISION_REQUIRED');
 if(typeof actor!=='string'||!actor.trim()||actor.length>256||/[\u0000-\u001f\u007f-\u009f]/.test(actor))ruleFail('COST_RULES_ACTOR_INVALID');
 const values=validateCostRules(body.values),db=await ruleSetup(env),current=await db.prepare('SELECT revision,payload,updated_at FROM production_cost_rules_state WHERE id=1').first();ruleState(current);
 if(current.revision!==body.revision)ruleFail('COST_RULES_CHANGED_RELOAD',409);
 const raw=JSON.stringify(values),now=new Date().toISOString();
 const saved=await db.batch([db.prepare('UPDATE production_cost_rules_state SET revision=revision+1,payload=?,updated_at=? WHERE id=1 AND revision=? AND payload=?').bind(raw,now,body.revision,current.payload),db.prepare('INSERT INTO production_cost_rules_audit(revision,payload,actor,created_at) SELECT revision,payload,?,updated_at FROM production_cost_rules_state WHERE changes()=1 AND id=1 AND revision=? AND payload=?').bind(actor,body.revision+1,raw)]);
 if(saved[0].meta.changes!==1)ruleFail('COST_RULES_CHANGED_RELOAD',409);if(saved[1].meta.changes!==1)ruleFail('COST_RULES_STORAGE_INVALID',503);return readCostRules(env);
}

export function evaluateCostRules(values,itemId,catalog,{stale=false}={}){
 const variants=Object.getOwnPropertyDescriptor(catalog||{},'variants')?.value,rules=validateCostRules(values).rules.filter(row=>row.enabled),source=projectProductCostCatalog(catalog,Array.isArray(variants)?variants.length:-1);
 if(!ruleItem(itemId)||!source)ruleFail('COST_RULE_CATALOG_INVALID',503);
 const {candidates,managed}=ruleProductScope(rules,source.product_name);
 // Numeric sizes never select a product type. Clothing outside the legacy
 // T-shirt/kit convention must have its own configured rule or manual cost.
 return source.variants.flatMap(variant=>{
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
 const state=ruleState(snapshot[0].results[0]),variants=[],restricted=new Set();const stamp=ruleClock(now);
 for(const row of snapshot.slice(1).flatMap(value=>value.results)){
  if(!Number.isSafeInteger(row.checked_at)||row.checked_at<1||row.checked_at>stamp+60||!(/^[a-f0-9]{64}$/).test(row.catalog_fingerprint))ruleFail('COST_RULES_STORAGE_INVALID',503);
  let catalog;try{catalog=JSON.parse(row.payload);}catch{ruleFail('COST_RULES_STORAGE_INVALID',503);}
  variants.push(...evaluateCostRules(state.values,row.item_id,catalog,{stale:stamp-row.checked_at>900}));
  if(ruleProductScope(state.values.rules,catalog.product_name).managed)restricted.add(row.item_id);
 }
 return {revision:state.revision,variants,restricted_item_ids:[...restricted]};
}
export async function readCostRuleReference(env,itemIds,options={}){const db=await ruleSetup(env);return costRuleReferenceFromSnapshot(await db.batch(costRuleSnapshotQueries(db,itemIds)),options);}

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
 const result=async processed=>{const reference=await readCostRuleReference(env,itemIds,{now});return {processed,cached:itemIds.filter(id=>!processed.includes(id)),revision:reference.revision,matched_variants:reference.variants.filter(row=>row.unit_cost_cents!==null).map(row=>({item_id:row.item_id,model_id:row.model_id}))};};
 if(!selected.length)return result([]);
 let raw;try{raw=await getCatalog(env,{item_ids:selected,selling_unit:'AUTO',include_cost_catalog:true});}catch{ruleFail('COST_RULE_CATALOG_UNAVAILABLE',503);}
 const frame=projectVariantCatalog(raw);
 if(!frame||frame.checked_at>stamp+60||stamp-frame.checked_at>60||frame.products.length!==selected.length||frame.products.some(row=>!selected.includes(row.item_id)||!row.cost_catalog))ruleFail('COST_RULE_CATALOG_UNAVAILABLE',503);
 await db.batch(frame.products.map(row=>db.prepare('INSERT INTO production_cost_catalog(item_id,catalog_fingerprint,payload,checked_at) VALUES(?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET catalog_fingerprint=excluded.catalog_fingerprint,payload=excluded.payload,checked_at=excluded.checked_at WHERE production_cost_catalog.checked_at<=excluded.checked_at').bind(row.item_id,row.catalog_fingerprint,JSON.stringify(row.cost_catalog),frame.checked_at)));
 return result(selected);
}
