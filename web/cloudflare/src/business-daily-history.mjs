import {readHistoricalCostSchedule} from './business-cost-history.mjs';
import {readApprovedDatedCostIdentitySnapshot} from './dated-cost-evidence.mjs';

// The current-cost report remains a distinct reference. This projector binds
// an audited cost schedule to that exact immutable publication and recomputes
// only its production-dependent amounts. Missing evidence has no price fallback.
// Keep self-contained: the owner client embeds this function with .toString().
export function projectHistoricalDailyBusinessSummary(value,legacySummary,{materialize=false}={}){
 try{
  const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
  const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
  const array=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value'));
  const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
  const safe=v=>v>=BigInt(Number.MIN_SAFE_INTEGER)&&v<=BigInt(Number.MAX_SAFE_INTEGER)?Number(v):null;
  const data=(v,depth=0)=>{if(depth>12)return false;if(v===null||typeof v==='boolean')return true;if(typeof v==='number')return integer(v,Number.MIN_SAFE_INTEGER);if(typeof v==='string')return v.length<=131072;if(Array.isArray(v))return array(v,3000)&&v.every(x=>data(x,depth+1));if(!plain(v)||Reflect.ownKeys(v).length>64)return false;return Reflect.ownKeys(v).every(k=>typeof k==='string'&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value')&&data(Object.getOwnPropertyDescriptor(v,k).value,depth+1));};
  const same=(a,b)=>{if(a===b)return true;if(Array.isArray(a))return Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i]));if(!plain(a)||!plain(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));};
  const baseKeys=['schema','month','start_date','end_date','timezone','basis','ads_basis','ads_timezone','state','publication_revision','sources','bindings_revision','costs_revision','cost_rules_revision','classification_revision','expenses_revision','tax_policy_revision','source_checked_at','allocation','days','remaining_receivable_cents','realized_net_cents'];
  const basis='HISTORICAL_AUDITED_COSTS_PAID_CREATE_DATE';
  if(!exact(legacySummary,baseKeys)||!data(legacySummary)||legacySummary.schema!=='business_daily_summary_v1'||!array(legacySummary.days,31)||!legacySummary.days.length||!exact(value,[...baseKeys,'cost_history'])||!data(value)||value.schema!=='business_daily_historical_summary_v1'||value.basis!==basis)return null;
  const changed=new Set(['schema','basis','state','days']);
  if(baseKeys.some(key=>!changed.has(key)&&!same(value[key],legacySummary[key])))return null;
  const history=value.cost_history,costKeys=['date','total_units','known_units','pending_units','known_production_cost_cents','production_cost_cents'],auditKeys=['date','costs_revision','cost_rules_revision','bindings_revision','pending'];
  const reasons=['REQUEST_INVALID','AUDIT_UNAVAILABLE','AUDIT_INVALID','SOURCE_INVALID','ARITHMETIC_UNSAFE','DATED_EVIDENCE_INVALID','STORAGE_UNAVAILABLE','SOURCE_CHANGED'];
  const auditCodes=['AUDIT_DAY_AMBIGUOUS','AUDIT_PRIOR_MISSING','AUDIT_PAYLOAD_INVALID','IDENTITY_OR_COST_UNPROVEN'];
  if(!exact(history,['state','reason','days','day_evidence'])||!['AVAILABLE','UNAVAILABLE'].includes(history.state)||!array(history.days,31)||!array(history.day_evidence,31))return null;
  if(history.state==='UNAVAILABLE'?( !reasons.includes(history.reason)||history.days.length!==0||history.day_evidence.length!==0):(history.reason!==null||history.days.length!==legacySummary.days.length||history.day_evidence.length!==legacySummary.days.length))return null;
  const days=[];
  for(let i=0;i<legacySummary.days.length;i++){
   const original=legacySummary.days[i],cost=history.days[i],audit=history.day_evidence[i];
   if(!plain(original)||!array(original.pending,30)||!plain(original.production_coverage)||typeof original.date!=='string')return null;
   if(history.state==='AVAILABLE'){
    if(!exact(cost,costKeys)||cost.date!==original.date||!['total_units','known_units','pending_units','known_production_cost_cents'].every(k=>integer(cost[k]))||BigInt(cost.known_units)+BigInt(cost.pending_units)!==BigInt(cost.total_units)||cost.total_units!==original.production_coverage.total_units||cost.known_units===0&&cost.known_production_cost_cents!==0||cost.known_units>0&&cost.known_production_cost_cents<cost.known_units||BigInt(cost.known_production_cost_cents)>BigInt(cost.known_units)*420000000n||cost.production_cost_cents!==(cost.pending_units?null:cost.known_production_cost_cents))return null;
    if(!exact(audit,auditKeys)||audit.date!==cost.date||!array(audit.pending,auditCodes.length)||new Set(audit.pending).size!==audit.pending.length||audit.pending.some(code=>!auditCodes.includes(code))||(cost.pending_units>0)!==(audit.pending.length>0))return null;
    for(const key of ['costs_revision','cost_rules_revision','bindings_revision']){
     if(audit[key]!==null&&!integer(audit[key],1,legacySummary[key]??0)||cost.known_units>0&&audit[key]===null)return null;
     const earlier=history.day_evidence.slice(0,i).filter(row=>row[key]!==null).at(-1)?.[key];
     if(audit[key]!==null&&earlier!==undefined&&audit[key]<earlier)return null;
    }
   }
   const row={...original,coverage:original.coverage===null?null:{...original.coverage},source_checked_at:{...original.source_checked_at},production_coverage:{...original.production_coverage},pending:original.pending.filter(code=>code!=='PRODUCTION_COST_INCOMPLETE')};
   row.production_cost_cents=null;row.known_production_cost_cents=null;row.operating_balance_cents=null;row.estimate_cents=null;row.known_estimate_cents=null;row.state='UNAVAILABLE';
   if(original.reason===null){
    row.production_coverage=history.state==='AVAILABLE'?{total_units:cost.total_units,known_units:cost.known_units,pending_units:cost.pending_units}:{total_units:original.production_coverage.total_units,known_units:null,pending_units:null};
    if(history.state==='AVAILABLE'){
     row.production_cost_cents=cost.production_cost_cents;row.known_production_cost_cents=cost.known_production_cost_cents;
     if(cost.pending_units)row.pending.push('PRODUCTION_COST_INCOMPLETE');
     if(row.payout_cents!==null&&row.ads_spend_cents!==null&&row.recharge_addback_cents!==null){
      const operating=BigInt(row.payout_cents)+BigInt(row.recharge_addback_cents)-BigInt(cost.known_production_cost_cents)-BigInt(row.ads_spend_cents);if(safe(operating)===null)return null;
      if(cost.production_cost_cents!==null)row.operating_balance_cents=Number(operating);
      if(row.allocated_das_cents!==null&&row.allocated_expenses_cents!==null){
       const net=safe(operating-BigInt(row.allocated_das_cents)-BigInt(row.allocated_expenses_cents));if(net===null)return null;
       row.known_estimate_cents=net;if(cost.production_cost_cents!==null){row.estimate_cents=net;row.state='PROVISIONAL';}else row.state='PARTIAL_COSTS';
      }
     }
    }else row.pending.push('PRODUCTION_COST_INCOMPLETE');
   }
   days.push(row);
  }
  const state=days.every(row=>row.estimate_cents!==null)?'AVAILABLE':days.some(row=>row.known_estimate_cents!==null)?'PARTIAL':'UNAVAILABLE';
  if(!materialize&&(!same(value.days,days)||value.state!==state))return null;
  const output={...legacySummary,schema:'business_daily_historical_summary_v1',basis,state,sources:legacySummary.sources.map(row=>({...row})),source_checked_at:{...legacySummary.source_checked_at},allocation:{...legacySummary.allocation},days,cost_history:{state:history.state,reason:history.reason,days:history.days.map(row=>({...row})),day_evidence:history.day_evidence.map(row=>({...row,pending:[...row.pending]}))}};
  return JSON.stringify(output).length<=262144?output:null;
 }catch{return null;}
}

// Materialization is internal to the trusted reader or deterministic fixtures;
// browser validation always uses the default strict comparison of all amounts.
export function buildHistoricalDailyBusinessSummary(legacySummary,costHistory){
 return projectHistoricalDailyBusinessSummary({...legacySummary,schema:'business_daily_historical_summary_v1',basis:'HISTORICAL_AUDITED_COSTS_PAID_CREATE_DATE',cost_history:costHistory},legacySummary,{materialize:true});
}

export async function readHistoricalDailyBusinessSummary(env,observed,legacySummary,{now=()=>Date.now()}={}){
 if(!legacySummary)return null;
 const unavailable=reason=>buildHistoricalDailyBusinessSummary(legacySummary,{state:'UNAVAILABLE',reason,days:[],day_evidence:[]});
 const db=env?.ADMIN_DB;let stamp;
 try{const at=now();if(!Number.isSafeInteger(at)||at<1||at>9999999999999)return unavailable('REQUEST_INVALID');stamp=Math.floor(at/1000);}catch{return unavailable('REQUEST_INVALID');}
 if(typeof db?.prepare!=='function'||typeof db?.batch!=='function')return unavailable('STORAGE_UNAVAILABLE');
 const display=observed?.display,scope=observed?.audit_scope,frames=observed?.source_frames;
 if(observed?.display_source!=='PUBLISHED'||!display||display.status!=='COMPLETE'||display.month!==legacySummary.month||display.start_date!==legacySummary.start_date||display.end_date!==legacySummary.end_date||scope?.publication_revision!==legacySummary.publication_revision||scope.start_date!==legacySummary.start_date||scope.end_date!==legacySummary.end_date||JSON.stringify(scope.sources)!==JSON.stringify(legacySummary.sources)||JSON.stringify(display.source_checked_at)!==JSON.stringify(legacySummary.source_checked_at)||display.expenses?.revision!==legacySummary.expenses_revision||(display.tax?.policy_revision??null)!==legacySummary.tax_policy_revision||(display.classification_revision??null)!==legacySummary.classification_revision||!Array.isArray(frames))return unavailable('SOURCE_CHANGED');
 let snapshots;
 try{snapshots=await db.batch(['production_costs_state','production_cost_rules_state','variant_bindings_state'].map(table=>db.prepare('SELECT revision,payload,updated_at FROM '+table+' WHERE id=1')));}catch{return unavailable('AUDIT_UNAVAILABLE');}
 if(!Array.isArray(snapshots)||snapshots.length!==3||snapshots.some(row=>!Array.isArray(row?.results)||row.results.length!==1))return unavailable('AUDIT_UNAVAILABLE');
 const current={costs:snapshots[0].results[0],rules:snapshots[1].results[0],bindings:snapshots[2].results[0]};
 for(const [key,name] of [['costs_revision','costs'],['cost_rules_revision','rules'],['bindings_revision','bindings']])if(current[name].revision!==legacySummary[key]||display[key]!==legacySummary[key])return unavailable('SOURCE_CHANGED');
 const quantities=new Map();
 try{
  for(let index=0;index<frames.length;index++){
   const frame=frames[index],source=legacySummary.sources[index];if(!source||frame.run_id!==source.run_id||frame.revision!==source.source_revision||frame.start_date!==source.start_date||frame.end_date!==source.end_date)return unavailable('SOURCE_CHANGED');
   for(const item of frame.items){const key=item.item_id+':'+item.model_id,quantity=BigInt(quantities.get(key)?.quantity??0)+BigInt(item.quantity);if(quantity>BigInt(Number.MAX_SAFE_INTEGER))return unavailable('ARITHMETIC_UNSAFE');quantities.set(key,{item_id:item.item_id,model_id:item.model_id,quantity:Number(quantity)});}
  }
  if(frames.length!==legacySummary.sources.length)return unavailable('SOURCE_CHANGED');
  const items=[...quantities.values()],identity=await readApprovedDatedCostIdentitySnapshot(db,{month:legacySummary.month,end_date:legacySummary.end_date,items,stamp,shop_id:env?.COMMERCIAL_CONTEXT?.profile?.shop_id??1178167501});
  const history=await readHistoricalCostSchedule(db,{month:legacySummary.month,stamp,frames,items,current,datedIdentity:identity});
  if(history?.state!=='AVAILABLE')return unavailable(['REQUEST_INVALID','AUDIT_UNAVAILABLE','AUDIT_INVALID','SOURCE_INVALID','ARITHMETIC_UNSAFE','DATED_EVIDENCE_INVALID'].includes(history?.reason)?history.reason:'AUDIT_INVALID');
  if(history.audit_scope.costs_revision!==legacySummary.costs_revision||history.audit_scope.cost_rules_revision!==legacySummary.cost_rules_revision||history.audit_scope.bindings_revision!==legacySummary.bindings_revision)return unavailable('SOURCE_CHANGED');
  return buildHistoricalDailyBusinessSummary(legacySummary,{state:'AVAILABLE',reason:null,days:history.days,day_evidence:history.day_evidence});
 }catch{return unavailable('DATED_EVIDENCE_INVALID');}
}
