import {checkedCostAudit,costAuditBeforeDay,historicalDayCosts} from './historical-cost-timeline.mjs';
import {productionCostReference,validateProductionCosts} from './production-costs.mjs';
import {validateVariantBindings} from './variant-bindings.mjs';
import {costRuleReferenceFromSnapshot} from './cost-rules.mjs';
import {datedCostIdentityForSchedule} from './dated-cost-evidence.mjs';

const brDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'});
const day=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const array=(value,max)=>Array.isArray(value)&&value.length<=max&&Array.from({length:value.length},(_,index)=>Object.hasOwn(value,index)).every(Boolean);
const key=row=>row.item_id+':'+row.model_id;
const safe=value=>value>=0n&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
const unavailable=reason=>({state:'UNAVAILABLE',reason});
function quantities(items){
 if(!array(items,3000))return null;
 const result=new Map();
 for(const item of items){
  if(!item||typeof item.item_id!=='string'||!/^[1-9][0-9]{0,19}$/.test(item.item_id)||typeof item.model_id!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(item.model_id)||!Number.isSafeInteger(item.quantity)||item.quantity<1||result.has(key(item)))return null;
  result.set(key(item),BigInt(item.quantity));
 }
 return result;
}

// Explicit, read-only sale-creation-day estimate, never physical production or
// COGS. Only append-only audited prices and manual identity/assignments prove
// a prior cost. Today's catalogue/classifications are deliberately not inputs.
// A single audited revision is useful evidence after its recorded day; missing
// history never selects the legacy current-cost estimate as a fallback.
export async function readHistoricalCostSchedule(db,input){
 const {month,stamp,frames,items,current}=input||{};
 if(!array(frames,3)||!frames.length||!Number.isSafeInteger(stamp)||stamp<1||stamp>9999999999||!current||(month!==null&&(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))))return unavailable('REQUEST_INVALID');
 const expected=quantities(items);if(!expected)return unavailable('SOURCE_INVALID');
 const auditTables=['production_costs_audit','production_cost_rules_audit','variant_bindings_audit'];
 let rows;
 try{rows=await db.batch(auditTables.map(table=>db.prepare('SELECT revision,payload,created_at FROM '+table+' ORDER BY revision ASC LIMIT 129')));}
 catch{return unavailable('AUDIT_UNAVAILABLE');}
 if(!array(rows,3)||rows.length!==3||rows.some(row=>!Array.isArray(row?.results)))return unavailable('AUDIT_INVALID');
 const histories=[checkedCostAudit(rows[0].results,current.costs,{stamp}),checkedCostAudit(rows[1].results,current.rules,{stamp}),checkedCostAudit(rows[2].results,current.bindings,{stamp})];
 if(histories.some(value=>!value))return unavailable('AUDIT_INVALID');
 const sources=new Map(),actual=new Map();
 const today=brDay.format(new Date(stamp*1000));
 for(const frame of frames){
  const breakdown=frame?.daily_breakdown;
  if(!array(breakdown?.days,31)||!Number.isSafeInteger(breakdown.undated?.coverage?.orders)||breakdown.undated.coverage.orders!==0)return unavailable('SOURCE_INVALID');
  for(const group of breakdown.days){
   const amounts=quantities(group?.items);
   if(!day(group?.date)||group.date>today||month!==null&&group.date.slice(0,7)!==month||sources.has(group.date)||!amounts)return unavailable('SOURCE_INVALID');
   sources.set(group.date,group);
   for(const [id,count] of amounts)actual.set(id,(actual.get(id)||0n)+count);
  }
 }
 if(actual.size!==expected.size||[...expected].some(([id,count])=>actual.get(id)!==count))return unavailable('SOURCE_INVALID');
 const end=frames.at(-1)?.end_date;
 if(!day(end)||end>today||month!==null&&end.slice(0,7)!==month||[...sources.keys()].some(date=>date>end))return unavailable('SOURCE_INVALID');
 const dated=input.datedIdentity===undefined?null:datedCostIdentityForSchedule(input.datedIdentity,{month,end_date:end,items,stamp});
 if(input.datedIdentity!==undefined&&!dated)return unavailable('DATED_EVIDENCE_INVALID');
 const dates=month===null?[...sources.keys()].sort():Array.from({length:Number(end.slice(8))},(_,index)=>month+'-'+String(index+1).padStart(2,'0'));
 if(dates.length!==sources.size)return unavailable('SOURCE_INVALID');
 const days=[],day_evidence=[],unmapped=new Map(),knownByVariant=new Map();let totalKnown=0n,complete=true;
 for(const date of dates){
  const group=sources.get(date);if(!group)return unavailable('SOURCE_INVALID');
  const audits=histories.map(history=>costAuditBeforeDay(history,date)),[costAudit,ruleAudit,bindingAudit]=audits,pending=[];
  if(audits.some(value=>!value)){
   if(histories.some(history=>history.some(row=>row.day===date)))pending.push('AUDIT_DAY_AMBIGUOUS');
   if(histories.some((history,index)=>!audits[index]&&!history.some(row=>row.day===date)))pending.push('AUDIT_PRIOR_MISSING');
  }
  let unitMap=null;
  if(costAudit&&ruleAudit&&bindingAudit){
   try{
    const b={revision:bindingAudit.revision,bindings:validateVariantBindings(JSON.parse(bindingAudit.payload)).filter(row=>row.operator_confirmed===true)};
    const c={revision:costAudit.revision,values:validateProductionCosts(JSON.parse(costAudit.payload))};
    // A rule's explicit audited assignments are self-contained. Automatic
    // name/axis matching needs a dated catalogue that these audits do not hold.
    const rules=costRuleReferenceFromSnapshot([{results:[{revision:ruleAudit.revision,payload:ruleAudit.payload,updated_at:ruleAudit.updated_at}]},...(dated??[])],{now:()=>stamp*1000});
    unitMap=new Map();
    for(let start=0;start<group.items.length;start+=1000){
     const ref=productionCostReference({status:'AVAILABLE',rows:group.items.slice(start,start+1000)},b,c,rules);
     for(const item of ref.variants)unitMap.set(key(item),item.unit_cost_cents);
    }
   }catch{unitMap=null;pending.push('AUDIT_PAYLOAD_INVALID');}
  }
  const row=historicalDayCosts(group.items,(itemId,modelId)=>unitMap?.get(itemId+':'+modelId)??null);
  if(!row)return unavailable('ARITHMETIC_UNSAFE');
  for(const item of group.items){
   const id=key(item),unit=unitMap?.get(id)??null;
   if(unit===null){unmapped.set(id,(unmapped.get(id)||0n)+BigInt(item.quantity));continue;}
   if(!knownByVariant.has(id))knownByVariant.set(id,new Set());knownByVariant.get(id).add(unit);
  }
  if(row.pending_units){complete=false;if(!pending.length)pending.push('IDENTITY_OR_COST_UNPROVEN');}
  totalKnown+=BigInt(row.known_production_cost_cents);days.push({date,...row});
  day_evidence.push({date,costs_revision:costAudit?.revision??null,cost_rules_revision:ruleAudit?.revision??null,bindings_revision:bindingAudit?.revision??null,pending:row.pending_units?pending:[]});
 }
 if(safe(totalKnown)===null)return unavailable('ARITHMETIC_UNSAFE');
 const byVariant=new Map(items.map(row=>[key(row),row])),unmapped_variants=[];
 for(const [id,count]of unmapped){const quantity=safe(count);if(quantity===null)return unavailable('ARITHMETIC_UNSAFE');const row=byVariant.get(id);unmapped_variants.push({item_id:row.item_id,model_id:row.model_id,quantity});}
 return {state:'AVAILABLE',days,known_production_cost_cents:Number(totalKnown),production_cost_cents:complete?Number(totalKnown):null,unmapped_variants,mixed_variants:[...knownByVariant.values()].filter(set=>set.size>1).length,audit_scope:{costs_revision:current.costs.revision,cost_rules_revision:current.rules.revision,bindings_revision:current.bindings.revision},day_evidence};
}
