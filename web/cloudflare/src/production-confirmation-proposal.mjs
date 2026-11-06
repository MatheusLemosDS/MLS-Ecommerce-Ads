import {readSavedProductionSourceCandidate} from './incurred-production-workspace.mjs';
import {validateVariantBindings} from './variant-bindings.mjs';
import {validateProductionCosts,productionCostReference} from './production-costs.mjs';
import {catalogClassificationQueries,catalogClassificationsFromSnapshot} from './catalog-classification.mjs';
import {validateCostRules,costRuleSnapshotQueries,costRuleReferenceFromSnapshot,mergeCatalogCostReference} from './cost-rules.mjs';

// Suggestions from saved evidence only. Selecting one never declares physical
// pieces, a manufacturing date, print artwork or a historical production cost.
export class ProductionConfirmationProposalError extends Error{constructor(code,status=503){super(code);this.status=status;}}
const fail=(code,status=503)=>{throw new ProductionConfirmationProposalError('PRODUCTION_CONFIRMATION_PROPOSAL_'+code,status);};

// Self-contained so the browser can validate the same closed DTO.
export function projectProductionConfirmationProposal(value){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
 const list=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(row=>row&&Object.hasOwn(row,'value'));
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 const id=(v,zero=false)=>typeof v==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(v);
 const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(v);
 const nullable=(v,max)=>v===null||text(v,max),adult=['P','M','G','GG','G1','G2','G3'],child=['2','4','6','8','10','12','14','16'];
 try{
  if(!exact(value,['schema','checked_at','state','reason','source','catalog','composition','cost','versions','basis'])||value.schema!=='production_confirmation_proposal_v1'||!int(value.checked_at,1,9999999999)||!['AVAILABLE','UNAVAILABLE'].includes(value.state)||value.basis!=='SAVED_CONTEXT_NOT_MANUFACTURING_CONFIRMATION')return null;
  const s=value.source,c=value.catalog,p=value.composition,k=value.cost,v=value.versions;
  if(value.state==='UNAVAILABLE'?(value.reason!=='SAVED_SOURCE_UNAVAILABLE'||s!==null):(value.reason!==null||!exact(s,['key','hash','checked_at','order_hash','order_status','selling_quantity','item_id','model_id','sku','model_name','quantity_basis'])||!hash(s.key)||!hash(s.hash)||!hash(s.order_hash)||!int(s.checked_at,1,value.checked_at)||!text(s.order_status,40)||!/^[A-Z][A-Z0-9_]{0,39}$/.test(s.order_status)||!int(s.selling_quantity,1,10000)||!id(s.item_id)||!id(s.model_id,true)||!nullable(s.sku,128)||!nullable(s.model_name,160)||s.quantity_basis!=='SAVED_SELLING_UNITS_NOT_PRODUCED_PIECES'))return null;
  if(!exact(c,['state','product_name','model_name','attributes','catalog_fingerprint','checked_at','classification_status','reason'])||!['AVAILABLE','UNKNOWN','CHANGED'].includes(c.state)||!nullable(c.product_name,1024)||!nullable(c.model_name,512)||!list(c.attributes,2)||c.catalog_fingerprint!==null&&!hash(c.catalog_fingerprint)||c.checked_at!==null&&!int(c.checked_at,1,value.checked_at)||c.classification_status!==null&&!['QUEUED','RUNNING','MATCHED','PARTIAL','REVIEW','RETRY_WAIT'].includes(c.classification_status)||!nullable(c.reason,80))return null;
  const names=new Set();for(const a of c.attributes){if(!exact(a,['name','value'])||!text(a.name,64)||!text(a.value,64)||names.has(a.name))return null;names.add(a.name);}
  if(c.state==='AVAILABLE'?(s===null||c.product_name===null||c.model_name===null||c.catalog_fingerprint===null||c.checked_at===null||c.classification_status===null||c.reason!==null):(c.attributes.length>0||c.model_name!==null||c.reason===null))return null;
  if(!exact(p,['state','basis','components','reason'])||!['SUGGESTED','UNKNOWN','AMBIGUOUS'].includes(p.state)||!['MANUAL_BINDING','CATALOG_BINDING','EXPLICIT_RECIPE','EXPLICIT_CHILD_RULE','SIZE_AXIS','UNKNOWN'].includes(p.basis)||!list(p.components,4)||!nullable(p.reason,80))return null;
  if(p.state==='SUGGESTED'?(!p.components.length||p.basis==='UNKNOWN'||p.reason!==null):(p.components.length!==0||p.basis!=='UNKNOWN'||p.reason===null))return null;
  const keys=new Set();for(const row of p.components){
   if(!exact(row,['key','quantity_per_commercial_unit','identity'])||!/^component-[1-4]$/.test(row.key)||keys.has(row.key)||row.quantity_per_commercial_unit!==null&&!int(row.quantity_per_commercial_unit,1,20))return null;keys.add(row.key);
   const i=row.identity;if(!exact(i,['artwork','color','size','garment_type','fit','item_id','model_id','sku'])||i.artwork!==null||!nullable(i.color,80)||i.size!==null&&![...adult,...child].includes(i.size)||!['ADULT','CHILD','UNKNOWN'].includes(i.garment_type)||!['MALE','FEMALE','UNKNOWN'].includes(i.fit)||s===null||i.item_id!==s.item_id||i.model_id!==s.model_id||i.sku!==s.sku||i.garment_type==='ADULT'&&!adult.includes(i.size)||i.garment_type==='CHILD'&&!child.includes(i.size)||p.basis==='SIZE_AXIS'&&(i.garment_type!=='UNKNOWN'||i.fit!=='UNKNOWN'||row.quantity_per_commercial_unit!==null))return null;
  }
  if(!exact(k,['state','currency','scope','unit_cost_cents','basis','reason'])||!['AVAILABLE','UNKNOWN'].includes(k.state)||k.currency!=='BRL'||k.scope!=='COMMERCIAL_UNIT'||k.basis!=='CURRENT_REGISTERED_COST_NOT_HISTORICAL_MANUFACTURING'||!nullable(k.reason,80)||(k.state==='AVAILABLE'?s===null||!int(k.unit_cost_cents,0)||k.reason!==null:k.unit_cost_cents!==null||k.reason===null))return null;
  if(!exact(v,['bindings','costs','cost_rules','classifications','historical'])||Object.values(v).some(row=>row!==null&&!int(row,1,2147483647))||k.state==='AVAILABLE'&&Object.values(v).some(row=>row===null))return null;
  if(s===null&&(c.state!=='UNKNOWN'||p.state!=='UNKNOWN'||k.state!=='UNKNOWN'||Object.values(v).some(row=>row!==null)))return null;
  return {schema:value.schema,checked_at:value.checked_at,state:value.state,reason:value.reason,source:s?{...s}:null,catalog:{...c,attributes:c.attributes.map(row=>({...row}))},composition:{...p,components:p.components.map(row=>({...row,identity:{...row.identity}}))},cost:{...k},versions:{...v},basis:value.basis};
 }catch{return null;}
}

const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const adult=['P','M','G','GG','G1','G2','G3'],child=['2','4','6','8','10','12','14','16'];
const norm=v=>v.normalize('NFKD').replace(/\p{M}/gu,'').trim().toLowerCase().replace(/[.]/g,'').replace(/\s+/g,' ');
const stampOf=now=>{let value;try{value=now();}catch{}if(!int(value,1,9999999999999))fail('CLOCK_INVALID');return Math.floor(value/1000);};
const all=(names,values)=>values.every(value=>names.has(value));
const classesTables=['catalog_classification_state','catalog_classification_jobs','catalog_classification_variants','catalog_classification_changes'];
const rulesTables=['production_cost_rules_state','production_cost_catalog','historical_cost_evidence_state','historical_cost_evidence_names'];
const empty=stamp=>({schema:'production_confirmation_proposal_v1',checked_at:stamp,state:'UNAVAILABLE',reason:'SAVED_SOURCE_UNAVAILABLE',source:null,catalog:{state:'UNKNOWN',product_name:null,model_name:null,attributes:[],catalog_fingerprint:null,checked_at:null,classification_status:null,reason:'CATALOG_UNAVAILABLE'},composition:{state:'UNKNOWN',basis:'UNKNOWN',components:[],reason:'COMPOSITION_UNAVAILABLE'},cost:{state:'UNKNOWN',currency:'BRL',scope:'COMMERCIAL_UNIT',unit_cost_cents:null,basis:'CURRENT_REGISTERED_COST_NOT_HISTORICAL_MANUFACTURING',reason:'COST_REFERENCE_UNAVAILABLE'},versions:{bindings:null,costs:null,cost_rules:null,classifications:null,historical:null},basis:'SAVED_CONTEXT_NOT_MANUFACTURING_CONFIRMATION'});
const validState=(row,stamp,validate)=>{if(!row||!int(row.revision,1,2147483647)||typeof row.payload!=='string'||new TextEncoder().encode(row.payload).byteLength>1048576||typeof row.updated_at!=='string'||!Number.isFinite(Date.parse(row.updated_at))||Date.parse(row.updated_at)>stamp*1000)throw Error();return {revision:row.revision,values:validate(JSON.parse(row.payload))};};
function component(source,index,size,garment_type,fit,color,quantity){return {key:'component-'+(index+1),quantity_per_commercial_unit:quantity,identity:{artwork:null,color,size,garment_type,fit,item_id:source.item_id,model_id:source.model_id,sku:source.sku}};}
function axes(catalog){
 if(catalog.state!=='AVAILABLE')return {color:null,size:null};
 const attrs=catalog.attributes,colors=attrs.filter(row=>['cor','color','colour'].includes(norm(row.name))),sizes=attrs.filter(row=>['tamanho','tamanhos','tam','size','sizes','shirt size','garment size','tamanho infantil','tamanho da crianca'].includes(norm(row.name)));
 const color=colors.length===1&&colors[0].value.length<=80?colors[0].value.trim().normalize('NFC'):null,size=sizes.length===1?sizes[0].value.trim().toUpperCase():null;
 return {color,size:[...adult,...child].includes(size)?size:null};
}
function suggest(value,bindings,costs,classes,rules){
 const s=value.source,{color,size}=axes(value.catalog),key=s.item_id+':'+s.model_id,manual=bindings?.values.find(row=>row.item_id===s.item_id&&row.model_id===s.model_id&&row.operator_confirmed),automatic=classes?.bindings.find(row=>row.item_id===s.item_id&&row.model_id===s.model_id),binding=manual||automatic;
 const recipeAssignment=costs?.values.composition_assignments?.find(row=>row.item_id===s.item_id&&row.model_id===s.model_id),recipe=costs?.values.composition_recipes?.find(row=>row.id===recipeAssignment?.recipe_id);
 let parts=[],basis='UNKNOWN';
 if(binding){basis=manual?'MANUAL_BINDING':'CATALOG_BINDING';parts=binding.selling_unit==='SINGLE_GARMENT'?[component(s,0,binding.size,'ADULT','UNKNOWN',color,1)]:[component(s,0,binding.male_size,'ADULT','MALE',color,1),component(s,1,binding.female_size,'ADULT','FEMALE',color,1)];}
 if(recipe){
  const grouped=new Map();for(const row of recipe.components)grouped.set(row.size,(grouped.get(row.size)||0)+row.quantity);
  if(grouped.size>4){value.composition={state:'AMBIGUOUS',basis:'UNKNOWN',components:[],reason:'COMPOSITION_LIMIT'};return;}
  if(binding){const bound=new Map();for(const row of parts)bound.set(row.identity.size,(bound.get(row.identity.size)||0)+row.quantity_per_commercial_unit);if(JSON.stringify([...bound].sort())!==JSON.stringify([...grouped].sort())){value.composition={state:'AMBIGUOUS',basis:'UNKNOWN',components:[],reason:'COMPOSITION_CONFLICT'};return;}}
  else{basis='EXPLICIT_RECIPE';parts=[...grouped].map(([size,quantity],i)=>component(s,i,size,'ADULT','UNKNOWN',color,quantity));}
 }
 if(!parts.length){
  const assignments=rules?.assignments||[],assignment=assignments.find(row=>row.item_id===s.item_id&&row.model_id===s.model_id)||assignments.find(row=>row.item_id===s.item_id&&row.model_id===null),rule=rules?.rules.find(row=>row.id===assignment?.rule_id&&row.enabled),childSize=assignment?.model_id!==null&&assignment?.size!==null?assignment?.size:size;
  if(rule?.id==='camiseta-infantil'&&child.includes(childSize)&&rule.options.includes(childSize)){basis='EXPLICIT_CHILD_RULE';parts=[component(s,0,childSize,'CHILD','UNKNOWN',color,1)];}
  else if(size){basis='SIZE_AXIS';parts=[component(s,0,size,'UNKNOWN','UNKNOWN',color,null)];}
 }
 if(parts.length)value.composition={state:'SUGGESTED',basis,components:parts,reason:null};
}
async function metadata(env,value,stamp){
 const db=env?.ADMIN_DB;if(!db?.prepare||!db?.batch)return;
 const names=new Set((await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('variant_bindings_state','production_costs_state','catalog_classification_state','catalog_classification_jobs','catalog_classification_variants','catalog_classification_changes','production_cost_rules_state','production_cost_catalog','historical_cost_evidence_state','historical_cost_evidence_names')").all())?.results?.map(row=>row.name)||[]),s=value.source,ids=[s.item_id],items=[{item_id:s.item_id,model_id:s.model_id}],queries=[],sections={};
 const add=(name,statements)=>{sections[name]={start:queries.length,length:statements.length};queries.push(...statements);};
 if(names.has('variant_bindings_state'))add('bindings',[db.prepare('SELECT revision,payload,updated_at FROM variant_bindings_state WHERE id=1')]);
 if(names.has('production_costs_state'))add('costs',[db.prepare('SELECT revision,payload,updated_at FROM production_costs_state WHERE id=1')]);
 if(all(names,classesTables))add('classes',catalogClassificationQueries(db,ids,items));
 if(all(names,rulesTables))add('rules',costRuleSnapshotQueries(db,ids));
 if(!queries.length)return;
 const snapshot=await db.batch(queries),part=name=>{const section=sections[name];return section?snapshot.slice(section.start,section.start+section.length):null;};let bindings=null,costs=null,classes=null,rules=null,reference=null;
 try{if(part('bindings')){bindings=validState(part('bindings')[0]?.results?.[0],stamp,validateVariantBindings);value.versions.bindings=bindings.revision;}}catch{}
 try{if(part('costs')){costs=validState(part('costs')[0]?.results?.[0],stamp,validateProductionCosts);value.versions.costs=costs.revision;}}catch{}
 try{if(part('classes')){
  classes=catalogClassificationsFromSnapshot(part('classes'));if(classes.products.some(row=>row.checked_at!==null&&row.checked_at>stamp))throw Error();value.versions.classifications=classes.revision;
  const product=classes.products.find(row=>row.item_id===s.item_id),variant=classes.variants.find(row=>row.item_id===s.item_id&&row.model_id===s.model_id);
  if(product){const changed=product.reason==='CATALOG_METADATA_CHANGED';value.catalog={state:changed?'CHANGED':variant?'AVAILABLE':'UNKNOWN',product_name:product.product_name,model_name:changed?null:variant?.model_name??null,attributes:changed?[]:variant?.attributes??[],catalog_fingerprint:product.catalog_fingerprint,checked_at:product.checked_at,classification_status:product.status,reason:changed?'CATALOG_METADATA_CHANGED':variant?null:'MODEL_NOT_IN_CATALOG'};}
 }}catch{classes=null;value.versions.classifications=null;value.catalog=empty(stamp).catalog;}
 try{if(part('rules')){
  const saved=part('rules'),raw=saved[0]?.results?.[0];
  for(const row of saved.slice(1).flatMap(result=>result.results||[]))if(Object.hasOwn(row,'catalog_fingerprint')){const product=classes?.products.find(product=>product.item_id===row.item_id);if(!int(row.checked_at,1,stamp)||product&&(product.catalog_fingerprint!==row.catalog_fingerprint||product.checked_at!==row.checked_at))throw Error();}
  rules=validState(raw,stamp,validateCostRules).values;reference=costRuleReferenceFromSnapshot(saved,{now:()=>stamp*1000});value.versions.cost_rules=reference.revision;value.versions.historical=reference.historical_revision;
 }}catch{rules=null;reference=null;}
 if(value.catalog.state==='CHANGED'){value.composition={state:'UNKNOWN',basis:'UNKNOWN',components:[],reason:'CATALOG_METADATA_CHANGED'};value.cost.reason='CATALOG_METADATA_CHANGED';return;}
 suggest(value,bindings,costs,classes,rules);
 if(bindings&&costs&&classes&&reference)try{
  const automatic=mergeCatalogCostReference(reference,classes),price=productionCostReference({status:'AVAILABLE',rows:[{...items[0],quantity:1}]},{revision:bindings.revision,bindings:bindings.values},{revision:costs.revision,values:costs.values},automatic),variant=price.variants.find(row=>row.item_id===s.item_id&&row.model_id===s.model_id);
  if(variant?.unit_cost_cents!==null&&int(variant?.unit_cost_cents,0))value.cost={...value.cost,state:'AVAILABLE',unit_cost_cents:variant.unit_cost_cents,reason:null};
 }catch{}
}
export async function readProductionConfirmationProposal(env,input,{now=()=>Date.now()}={}){
 const stamp=stampOf(now);if(!exact(input,['source_key','source_hash'])||!hash(input.source_key)||!hash(input.source_hash))fail('REQUEST_INVALID',400);
 let source;try{source=await readSavedProductionSourceCandidate(env,input,{now:()=>stamp*1000});}catch(error){if(error?.status===409)fail('SOURCE_CHANGED',409);fail('SOURCE_UNAVAILABLE');}
 const value=empty(stamp);if(source){value.state='AVAILABLE';value.reason=null;value.source=source;try{await metadata(env,value,stamp);}catch{/* Optional saved metadata never declares a fact or prevents manual entry. */}
  let current;try{current=await readSavedProductionSourceCandidate(env,input,{now:()=>stamp*1000});}catch(error){if(error?.status===409)fail('SOURCE_CHANGED',409);fail('SOURCE_UNAVAILABLE');}if(!current||current.hash!==source.hash)fail('SOURCE_CHANGED',409);
 }
 const projected=projectProductionConfirmationProposal(value);if(!projected)fail('RESULT_INVALID');return projected;
}
