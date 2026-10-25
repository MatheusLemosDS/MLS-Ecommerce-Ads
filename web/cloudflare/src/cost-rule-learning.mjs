import {projectProductCostCatalog} from '../../finance/src/variant-catalog-frame.mjs';

// Corrections identify a product family; they never invent a price, change a
// stored rule or infer a size from its position, SKU or numeric value alone.
const learningPlain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const learningExact=(value,keys)=>learningPlain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const learningId=(value,zero=false)=>typeof value==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(value);
const learningRuleId=value=>typeof value==='string'&&/^[a-z0-9-]{1,48}$/.test(value);
const learningText=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=64&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);
const learningNormalize=value=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).map(word=>({camisetas:'camiseta',camisas:'camisa',blusas:'blusa',infantis:'infantil',criancas:'crianca',calcas:'calca',shorts:'short',bermudas:'bermuda',kits:'kit',combos:'combo',conjuntos:'conjunto',casais:'casal',moletons:'moletom',vestidos:'vestido',saias:'saia',leggings:'legging',adultos:'adulto',adultas:'adulta',bonecas:'boneca',pets:'pet'})[word]||word).join(' ');
const learningOption=value=>learningNormalize(value).replace(/^(\d+) (anos?|years?)$/,'$1');
const learningWords=value=>new Set(learningNormalize(value).split(' '));
const learningContains=(words,pattern)=>learningNormalize(pattern).split(' ').every(word=>words.has(word));
const learningSort=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
const learningResult=(rule_id=null,status='NONE',reason=null,evidence_models=[],managed=false)=>({rule_id,status,reason,evidence_models:[...evidence_models].sort(learningSort),managed});
const learningChildConflicts=['kit','combo','conjunto','casal','calca','baggy','short','bermuda','moletom','body','vestido','saia','legging','adulto','adulta','boneca','pet'];

// Read only own data descriptors before consuming any value. This also detaches
// evidence from caller-owned arrays and prevents accessors in malformed input.
function learningSnapshot(value){
 let nodes=0;
 const copy=(input,depth)=>{
  if(++nodes>40000||depth>8)throw Error('invalid');
  if(input===null||typeof input==='boolean'||typeof input==='string'||Number.isSafeInteger(input))return input;
  const array=Array.isArray(input);
  if(array?Object.getPrototypeOf(input)!==Array.prototype||input.length>1000:!learningPlain(input))throw Error('invalid');
  const keys=Reflect.ownKeys(input),out=array?[]:{};
  if(array&&keys.length!==input.length+1)throw Error('invalid');
  for(const key of keys){
   if(array&&key==='length')continue;
   const descriptor=Object.getOwnPropertyDescriptor(input,key);
   if(typeof key!=='string'||!descriptor||!Object.hasOwn(descriptor,'value')||array&&!/^(0|[1-9][0-9]*)$/.test(key))throw Error('invalid');
   Object.defineProperty(out,key,{value:copy(descriptor.value,depth+1),enumerable:true,writable:true,configurable:true});
  }
  return out;
 };
 const result=copy(value,0),assigned=Object.hasOwn(result,'assignments');
 if(!learningExact(result,['rules',...(assigned?['assignments']:[])])||!Array.isArray(result.rules)||result.rules.length>100)throw Error('invalid');
 const ids=new Set();
 for(const rule of result.rules){
  if(!learningExact(rule,['id','label','enabled','unit_cost_cents','name_patterns','exclude_terms','axis_names','options'])||!learningRuleId(rule.id)||ids.has(rule.id)||!learningText(rule.label)||rule.label.length>45||typeof rule.enabled!=='boolean'||!Number.isSafeInteger(rule.unit_cost_cents)||rule.unit_cost_cents<1||rule.unit_cost_cents>1000000)throw Error('invalid');
  ids.add(rule.id);
  for(const [key,max] of [['name_patterns',10],['exclude_terms',20],['axis_names',10],['options',100]])if(!Array.isArray(rule[key])||rule[key].length>max||!rule[key].every(text=>learningText(text)&&learningNormalize(text)))throw Error('invalid');
  if(!rule.name_patterns.length||rule.options.length&&!rule.axis_names.length)throw Error('invalid');
 }
 if(assigned){
  if(!Array.isArray(result.assignments)||result.assignments.length>1000)throw Error('invalid');
  const scopes=new Set();
  for(const row of result.assignments){
   const key=row?.item_id+':'+(row?.model_id===null?'*':row?.model_id);
   if(!learningExact(row,['item_id','model_id','rule_id','size'])||!learningId(row.item_id)||row.model_id!==null&&!learningId(row.model_id,true)||!learningRuleId(row.rule_id)||row.size!==null&&!learningText(row.size)||row.model_id===null&&row.size!==null||scopes.has(key))throw Error('invalid');
   scopes.add(key);
  }
 }
 return result;
}

function learningSizeAxes(rule,variant){return variant.attributes.filter(row=>rule.axis_names.some(name=>learningNormalize(name)===learningNormalize(row.name)));}

export function costRuleProductLearning(values,itemId,catalog,options={}){
 try{
  if(!learningId(itemId)||!learningPlain(options)||Reflect.ownKeys(options).some(key=>key!=='stale'))return learningResult();
  const staleDescriptor=Object.getOwnPropertyDescriptor(options,'stale');
  if(staleDescriptor&&(!Object.hasOwn(staleDescriptor,'value')||typeof staleDescriptor.value!=='boolean'))return learningResult();
  const stale=staleDescriptor?.value===true,snapshot=learningSnapshot(values),assignments=(snapshot.assignments||[]).filter(row=>row.item_id===itemId),parent=assignments.find(row=>row.model_id===null),rules=new Map(snapshot.rules.map(row=>[row.id,row]));
  if(parent){const enabled=rules.get(parent.rule_id)?.enabled===true;return learningResult(parent.rule_id,enabled&&!stale?'EXPLICIT':'PENDING',!enabled?'RULE_UNAVAILABLE':stale?'CATALOG_STALE':'EXPLICIT_PRODUCT_RULE',[],true);}
  const rawVariants=Object.getOwnPropertyDescriptor(catalog||{},'variants')?.value,source=projectProductCostCatalog(catalog,Array.isArray(rawVariants)?rawVariants.length:-1);
  const leaves=assignments.filter(row=>row.model_id!==null),confirmedIds=new Set(leaves.map(row=>row.rule_id));
  if(confirmedIds.size>1)return learningResult(null,'CONFLICT','MULTIPLE_CONFIRMED_RULES',leaves.map(row=>row.model_id),false);
  if(leaves.length){
   const ruleId=leaves[0].rule_id,rule=rules.get(ruleId);
   if(!source)return learningResult(ruleId,'PENDING','CATALOG_UNAVAILABLE',[],false);
   if(!rule)return learningResult(ruleId,'PENDING','RULE_UNAVAILABLE',[],false);
   const words=learningWords(source.product_name);
   if(rule.exclude_terms.some(pattern=>learningContains(words,pattern))||rule.id==='camiseta-infantil'&&learningChildConflicts.some(word=>words.has(word)))return learningResult(ruleId,'CONFLICT','PRODUCT_TYPE_CONFLICT',[],false);
   const anchors=leaves.filter(row=>source.variants.some(variant=>variant.model_id===row.model_id));
   if(!anchors.length)return learningResult(ruleId,'PENDING','CORRECTED_MODEL_NOT_FOUND',[],false);
   const evidence=anchors.map(row=>row.model_id);
   if(!rule.options.length){
    if(anchors.some(row=>row.size!==null))return learningResult(ruleId,'CONFLICT','CORRECTION_SIZE_MISMATCH',evidence,false);
    if(!rule.name_patterns.some(pattern=>learningContains(words,pattern)))return learningResult(ruleId,'PENDING','PRODUCT_TYPE_NOT_CONFIRMED',evidence,false);
   }else{
    for(const assignment of anchors){
     const variant=source.variants.find(row=>row.model_id===assignment.model_id),axes=learningSizeAxes(rule,variant);
     if(axes.length!==1)return learningResult(ruleId,'CONFLICT',axes.length?'SIZE_AXIS_AMBIGUOUS':'SIZE_AXIS_NOT_RECOGNIZED',evidence,false);
     if(assignment.size===null||!rule.options.some(size=>learningOption(size)===learningOption(assignment.size))||learningOption(axes[0].value)!==learningOption(assignment.size))return learningResult(ruleId,'CONFLICT','CORRECTION_SIZE_MISMATCH',evidence,false);
    }
   }
   if(!rule.enabled)return learningResult(ruleId,'PENDING','RULE_UNAVAILABLE',evidence,true);
   return learningResult(ruleId,stale?'PENDING':'LEARNED',stale?'CATALOG_STALE':'CONFIRMED_VARIATION_SIZE',evidence,true);
  }

  // This bounded fallback uses an operator-confirmed domain rule. It does not
  // learn arbitrary words or prices from a corrected title or a numeric size.
  const child=rules.get('camiseta-infantil'),childSizes=new Set(['2','4','6','8','10','12','14','16']);
  if(!source||!source.variants.length||!child?.enabled||!child.options.length||!child.options.every(size=>childSizes.has(learningOption(size))))return learningResult();
  const shirtWords=['camiseta','camisa','blusa'],childWords=['infantil','kids','crianca'];
  if(!child.name_patterns.some(pattern=>{const words=learningWords(pattern);return shirtWords.some(word=>words.has(word))&&childWords.some(word=>words.has(word));}))return learningResult();
  const words=learningWords(source.product_name);
  if(!shirtWords.some(word=>words.has(word))||learningChildConflicts.some(word=>words.has(word))||child.exclude_terms.some(pattern=>learningContains(words,pattern)))return learningResult();
  const allowed=new Set(child.options.map(learningOption)),extraAxes=new Set(['cor','estampa','color','print']);
  for(const variant of source.variants){
   const axes=learningSizeAxes(child,variant);
   if(axes.length!==1||!allowed.has(learningOption(axes[0].value))||variant.attributes.some(axis=>axis!==axes[0]&&!extraAxes.has(learningNormalize(axis.name))))return learningResult();
  }
  return learningResult(child.id,stale?'PENDING':'RECOGNIZED',stale?'CATALOG_STALE':'CONFIRMED_CHILD_TYPE_AND_SIZES',[],true);
 }catch{return learningResult();}
}
