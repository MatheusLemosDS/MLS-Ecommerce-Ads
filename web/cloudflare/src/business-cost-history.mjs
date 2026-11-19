import {checkedCostAudit,costAuditBeforeDay,historicalDayCosts} from './historical-cost-timeline.mjs';
import {productionCostReference,validateProductionCosts} from './production-costs.mjs';
import {validateVariantBindings} from './variant-bindings.mjs';
import {costRuleReferenceFromSnapshot,mergeCatalogCostReference} from './cost-rules.mjs';

// Read-only, fail-closed pricing for a month whose rules were edited after the
// first sale. The D1 audit is the sole source of effective dates. This produces
// daily totals, not a fictitious monthly "average unit cost".
export async function readHistoricalCostSchedule(db,{month,stamp,frames,items,current,ruleSnapshot,classification}){
 if(!Array.isArray(frames)||!Array.isArray(items)||!Array.isArray(ruleSnapshot)||!current||(month!==null&&typeof month!=='string'))return null;
 const auditTables=['production_costs_audit','production_cost_rules_audit','variant_bindings_audit'];
 let rows;
 try{rows=await db.batch(auditTables.map(table=>db.prepare('SELECT revision,payload,created_at FROM '+table+' ORDER BY revision ASC LIMIT 513')));}
 catch{return current.costs?.revision>1||current.rules?.revision>1||current.bindings?.revision>1?{state:'UNAVAILABLE'}:null;}
 if(rows.length!==3||rows.some(row=>!Array.isArray(row.results)))return {state:'UNAVAILABLE'};
 const costHistory=checkedCostAudit(rows[0].results,current.costs),ruleHistory=checkedCostAudit(rows[1].results,current.rules),bindingHistory=checkedCostAudit(rows[2].results,current.bindings);
 if(!costHistory||!ruleHistory||!bindingHistory)return {state:'UNAVAILABLE'};
 if(![costHistory,ruleHistory,bindingHistory].some(history=>history.length>1))return null;
 const sources=new Map();
 for(const frame of frames){
  if(!frame?.daily_breakdown?.days||frame.daily_breakdown.undated?.coverage?.orders>0)return {state:'UNAVAILABLE'};
  for(const group of frame.daily_breakdown.days){if(sources.has(group.date))return {state:'UNAVAILABLE'};sources.set(group.date,group);}
 }
 const end=frames.at(-1)?.end_date;
 if(!end||month&&end.slice(0,7)!==month)return {state:'UNAVAILABLE'};
 const dates=month?Array.from({length:Number(end.slice(8))},(_,index)=>month+'-'+String(index+1).padStart(2,'0')):[...sources.keys()].sort();
 const days=[],unmapped=new Map(),knownByVariant=new Map();let totalKnown=0n,complete=true;
 for(const date of dates){
  const group=sources.get(date);
  if(!group||!Array.isArray(group.items))return {state:'UNAVAILABLE'};
  const costAudit=costAuditBeforeDay(costHistory,date),ruleAudit=costAuditBeforeDay(ruleHistory,date),bindingAudit=costAuditBeforeDay(bindingHistory,date);
  let unitMap=null;
  if(costAudit&&ruleAudit&&bindingAudit){
   try{
    const b={revision:bindingAudit.revision,bindings:validateVariantBindings(JSON.parse(bindingAudit.payload))};
    const c={revision:costAudit.revision,values:validateProductionCosts(JSON.parse(costAudit.payload))};
    const ruleRows=[{results:[{revision:ruleAudit.revision,payload:ruleAudit.payload,updated_at:ruleAudit.updated_at}]},...ruleSnapshot.slice(1)];
    const rules=mergeCatalogCostReference(costRuleReferenceFromSnapshot(ruleRows,{now:()=>stamp*1000}),classification);
    unitMap=new Map();
    for(let start=0;start<group.items.length;start+=1000){
     const part=group.items.slice(start,start+1000);
     const ref=productionCostReference({status:'AVAILABLE',rows:part},b,c,rules);
     for(const item of ref.variants){const key=item.item_id+':'+item.model_id;if(unitMap.has(key))throw Error('DUPLICATE');unitMap.set(key,item.unit_cost_cents);}
    }
   }catch{unitMap=null;}
  }
  const row=historicalDayCosts(group.items,(itemId,modelId)=>unitMap?.get(itemId+':'+modelId)??null);
  if(!row)return {state:'UNAVAILABLE'};
  for(const item of group.items){
   const key=item.item_id+':'+item.model_id,unit=unitMap?.get(key)??null;
   if(unit===null){unmapped.set(key,(unmapped.get(key)||0)+item.quantity);continue;}
   if(!knownByVariant.has(key))knownByVariant.set(key,new Set());knownByVariant.get(key).add(unit);
  }
  if(row.pending_units)complete=false;
  totalKnown+=BigInt(row.known_production_cost_cents);
  days.push({date,...row});
 }
 if(totalKnown>BigInt(Number.MAX_SAFE_INTEGER))return {state:'UNAVAILABLE'};
 const byVariant=new Map(items.map(row=>[row.item_id+':'+row.model_id,row]));
 const pending=[...unmapped].map(([key,quantity])=>{const row=byVariant.get(key);return row?{item_id:row.item_id,model_id:row.model_id,quantity}:null;}).filter(Boolean);
 return {state:'AVAILABLE',days,known_production_cost_cents:Number(totalKnown),production_cost_cents:complete?Number(totalKnown):null,unmapped_variants:pending,mixed_variants:[...knownByVariant.values()].filter(set=>set.size>1).length};
}
