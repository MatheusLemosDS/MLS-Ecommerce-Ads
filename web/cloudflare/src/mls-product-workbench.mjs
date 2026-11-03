// M3 Observer: enrich a validated shadow report with current catalogue labels.
// Cost references remain listing-unit references, not a factory/inventory ledger.
export function buildMlsProductWorkbench(report,catalog=[]){
 const plain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
 const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
 const list=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(descriptor=>descriptor&&Object.hasOwn(descriptor,'value'));
 const integer=(value,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
 const signed=value=>integer(value,Number.MIN_SAFE_INTEGER);
 const id=(value,zero=false)=>typeof value==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(value);
 const safe=value=>value>=BigInt(Number.MIN_SAFE_INTEGER)&&value<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value):null;
 const order=(a,b)=>a.length-b.length||(a<b?-1:a>b?1:0);
 const codes=(value,max)=>list(value,max)&&new Set(value).size===value.length&&value.every(code=>typeof code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(code));
 const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
 const label=value=>typeof value==='string'&&value.length<=1024&&!/[\u0000-\u001f\u007f-\u009f]/.test(value)&&value.trim()?value.trim().normalize('NFC'):null;
 const metadata=()=>{
  const products=new Map(),seen=new Set(),ambiguous=new Set();let variants=0,characters=0;
  try{
   if(!list(catalog,3000))return products;
   for(const item of catalog){
    if(!exact(item,['item_id','product_name','variants'])||!id(item.item_id))continue;
    if(ambiguous.has(item.item_id))continue;
    if(seen.has(item.item_id)){products.delete(item.item_id);ambiguous.add(item.item_id);continue;}
    seen.add(item.item_id);
    if(item.product_name!==null&&label(item.product_name)===null||!list(item.variants,3000))continue;
    variants+=item.variants.length;if(variants>3000)return new Map();
    const name=item.product_name===null?null:label(item.product_name),models=new Map(),modelSeen=new Set(),duplicates=new Set();
    characters+=name?.length||0;if(characters>1048576)return new Map();
    for(const variant of item.variants){
     if(!exact(variant,['model_id','model_name','attributes'])||!id(variant.model_id,true))continue;
     if(duplicates.has(variant.model_id))continue;
     if(modelSeen.has(variant.model_id)){models.delete(variant.model_id);duplicates.add(variant.model_id);continue;}
     modelSeen.add(variant.model_id);
     const modelName=variant.model_name===null?null:label(variant.model_name);
     if(variant.model_name!==null&&modelName===null||!list(variant.attributes,10))continue;
     const attributes=[],axes=new Set();let valid=true;
     for(const attribute of variant.attributes){
      if(!exact(attribute,['name','value'])){valid=false;break;}
      const axis=label(attribute.name),value=label(attribute.value);
      if(axis===null||value===null||axes.has(axis.toLowerCase())){valid=false;break;}
      axes.add(axis.toLowerCase());attributes.push({name:axis,value});characters+=axis.length+value.length;if(characters>1048576)return new Map();
     }
     if(!valid)continue;
     characters+=modelName?.length||0;if(characters>1048576)return new Map();models.set(variant.model_id,{model_name:modelName,attributes});
    }
    if(characters>1048576)return new Map();
    products.set(item.item_id,{product_name:name,variants:models});
   }
  }catch{return new Map();}
  return products;
 };
 try{
  const reportKeys=['schema','mode','month','source','units_abc_basis','total_products','total_units','exclusive_balance_covered_products','exclusive_balance_unverified_products','covered_exclusive_balance_cents','exclusive_balance_basis','revenue_abc_status','revenue_abc_basis','safe_sku_net_profit_cents','safe_price_cents','inventory_verified','execution_allowed','blockers','products','variants'];
  const productKeys=['item_id','quantity','orders','exclusive_orders','mixed_orders','exclusive_sales_cents','exclusive_after_costs_cents','exclusive_margin_bps','pending','abc_units','abc_revenue'];
  if(!exact(report,reportKeys)||report.schema!=='mls_product_intelligence_shadow_v1'||report.mode!=='OBSERVER'||typeof report.month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(report.month)||report.source!=='VALIDATED_MONTH_PRODUCT_SUMMARY'||report.units_abc_basis!=='SOLD_UNITS_NOT_INVENTORY'||report.exclusive_balance_basis!=='EXCLUSIVE_ORDERS_BEFORE_ADS_OTHER_EXPENSES_AND_POSSIBLE_MEI_DAS'||report.safe_sku_net_profit_cents!==null||report.safe_price_cents!==null||report.inventory_verified!==false||report.execution_allowed!==false||!integer(report.total_products,0,3000)||!integer(report.total_units)||!integer(report.exclusive_balance_covered_products,0,3000)||!integer(report.exclusive_balance_unverified_products,0,3000)||!signed(report.covered_exclusive_balance_cents)||!codes(report.blockers,30)||!list(report.products,3000)||!list(report.variants,3000)||report.products.length!==report.total_products)return null;
  const requiredBlockers=['M2_RECONCILIATION_NOT_VERIFIED','OFFICIAL_FEE_CONTRACT_NOT_VERIFIED','ADS_ATTRIBUTION_NOT_VERIFIED','INVENTORY_NOT_VERIFIED'];
  if(!requiredBlockers.every(code=>report.blockers.includes(code))||!['AVAILABLE','BLOCKED_INCOMPLETE_OR_MIXED_ORDERS'].includes(report.revenue_abc_status)||report.revenue_abc_basis!==(report.revenue_abc_status==='AVAILABLE'?'PAID_EXCLUSIVE_ORDER_PRODUCT_SALES_ONLY':null))return null;
  const products=new Map();let totalUnits=0n,covered=0,coveredBalance=0n;
  for(const row of report.products){
   if(!exact(row,productKeys)||!id(row.item_id)||products.has(row.item_id)||!integer(row.quantity,1)||!integer(row.orders,1,3000)||!integer(row.exclusive_orders,0,3000)||!integer(row.mixed_orders,0,3000)||row.orders!==row.exclusive_orders+row.mixed_orders||row.quantity<row.orders||row.exclusive_sales_cents!==null&&!integer(row.exclusive_sales_cents)||row.exclusive_after_costs_cents!==null&&!signed(row.exclusive_after_costs_cents)||row.exclusive_margin_bps!==null&&!signed(row.exclusive_margin_bps)||!codes(row.pending,12)||!['A','B','C'].includes(row.abc_units)||![null,'A','B','C'].includes(row.abc_revenue))return null;
   if(row.exclusive_after_costs_cents!==null){
    if(!integer(row.exclusive_sales_cents,1)||!row.exclusive_orders||row.pending.length)return null;
    const margin=safe(BigInt(row.exclusive_after_costs_cents)*10000n/BigInt(row.exclusive_sales_cents));if(margin===null||row.exclusive_margin_bps!==margin)return null;
    covered++;coveredBalance+=BigInt(row.exclusive_after_costs_cents);
   }else if(row.exclusive_margin_bps!==null)return null;
   const copy=Object.fromEntries(productKeys.map(key=>[key,row[key]]));copy.pending=[...row.pending];copy.variants=[];
   products.set(row.item_id,copy);totalUnits+=BigInt(row.quantity);
  }
  if(safe(totalUnits)!==report.total_units||safe(coveredBalance)!==report.covered_exclusive_balance_cents||covered!==report.exclusive_balance_covered_products||products.size-covered!==report.exclusive_balance_unverified_products)return null;
  const pairs=new Set();
  for(const variant of report.variants){
   if(!exact(variant,['item_id','model_id','quantity','unit_cost_cents'])||!id(variant.item_id)||!id(variant.model_id,true)||!products.has(variant.item_id)||pairs.has(variant.item_id+':'+variant.model_id)||!integer(variant.quantity,1)||variant.unit_cost_cents!==null&&!integer(variant.unit_cost_cents,0,100000000))return null;
   pairs.add(variant.item_id+':'+variant.model_id);products.get(variant.item_id).variants.push({item_id:variant.item_id,model_id:variant.model_id,quantity:variant.quantity,unit_cost_cents:variant.unit_cost_cents});
  }
  const ranked=[...products.values()].sort((a,b)=>b.quantity-a.quantity||order(a.item_id,b.item_id));
  const band=(before,total)=>before*100n<total*80n?'A':before*100n<total*95n?'B':'C';
  if(report.revenue_abc_status==='AVAILABLE'){
   if(!ranked.length||ranked.some(row=>row.pending.length||!row.exclusive_orders||row.mixed_orders||!integer(row.exclusive_sales_cents)))return null;
   const total=ranked.reduce((sum,row)=>sum+BigInt(row.exclusive_sales_cents),0n);if(total<=0n||safe(total)===null)return null;
   let before=0n;for(const row of [...ranked].sort((a,b)=>b.exclusive_sales_cents-a.exclusive_sales_cents||order(a.item_id,b.item_id))){if(row.abc_revenue!==band(before,total))return null;before+=BigInt(row.exclusive_sales_cents);}
  }else if(ranked.some(row=>row.abc_revenue!==null))return null;
  const names=metadata(),coverage={total_units:report.total_units,total_variants:report.variants.length,known_units:0,pending_units:0,known_variants:0,pending_variants:0,known_production_cost_cents:0,production_complete:true};
  const ranking={basis:'SOLD_UNITS',abc_a_products:0,abc_b_products:0,abc_c_products:0,revenue_abc_status:report.revenue_abc_status,revenue_abc_basis:report.revenue_abc_basis};
  let running=0n,allKnownCost=0n;
  for(const row of ranked){
   if(!row.variants.length||row.abc_units!==band(running,totalUnits))return null;
   running+=BigInt(row.quantity);
   const reference=names.get(row.item_id),costs={total_units:row.quantity,total_variants:row.variants.length,known_units:0,pending_units:0,known_variants:0,pending_variants:0,known_production_cost_cents:0,production_complete:true};
   let quantity=0n,knownCost=0n;
   row.variants.sort((a,b)=>order(a.model_id,b.model_id));
   row.variants=row.variants.map(variant=>{
    quantity+=BigInt(variant.quantity);const known=variant.unit_cost_cents!==null;
    const amount=known?safe(BigInt(variant.quantity)*BigInt(variant.unit_cost_cents)):null;
    if(known&&amount===null)throw Error('UNSAFE_REFERENCE_COST');
    costs[known?'known_units':'pending_units']+=variant.quantity;costs[known?'known_variants':'pending_variants']++;
    if(known)knownCost+=BigInt(amount);
    const model=reference?.variants.get(variant.model_id);
    return {...variant,model_name:model?.model_name??null,attributes:model?.attributes.map(attribute=>({...attribute}))??[],production_cost_cents:amount,margin_bps:null,net_profit_cents:null,safe_price_cents:null};
   });
   if(quantity!==BigInt(row.quantity)||!integer(costs.known_units)||!integer(costs.pending_units)||safe(knownCost)===null)return null;
   costs.known_production_cost_cents=Number(knownCost);costs.production_complete=costs.pending_variants===0;
   row.product_name=reference?.product_name??null;row.quantity_share_bps=totalUnits?safe(BigInt(row.quantity)*10000n/totalUnits):null;row.cumulative_quantity_bps=totalUnits?safe(running*10000n/totalUnits):null;
   row.pending_reasons=[...row.pending];if(!costs.production_complete&&!row.pending_reasons.includes('PRODUCTION_COST_INCOMPLETE'))row.pending_reasons.push('PRODUCTION_COST_INCOMPLETE');
   row.known_production_cost_cents=costs.known_production_cost_cents;row.production_cost_cents=costs.production_complete?costs.known_production_cost_cents:null;row.cost_coverage=costs;
   coverage.known_units+=costs.known_units;coverage.pending_units+=costs.pending_units;coverage.known_variants+=costs.known_variants;coverage.pending_variants+=costs.pending_variants;allKnownCost+=knownCost;
   ranking['abc_'+row.abc_units.toLowerCase()+'_products']++;
  }
  if(safe(allKnownCost)===null||!integer(coverage.known_units)||!integer(coverage.pending_units)||BigInt(coverage.known_units)+BigInt(coverage.pending_units)!==totalUnits)return null;
  coverage.known_production_cost_cents=Number(allKnownCost);coverage.production_complete=coverage.pending_variants===0;
  return freeze({schema:'mls_product_workbench_v1',mode:'OBSERVER',month:report.month,source:report.source,units_abc_basis:report.units_abc_basis,cost_basis:'SAVED_CURRENT_REFERENCE_NOT_MANUFACTURING_LEDGER',metadata_basis:'CURRENT_CATALOG_LABELS_NOT_HISTORICAL_PROOF',total_products:report.total_products,total_variants:report.variants.length,total_units:report.total_units,exclusive_balance_covered_products:report.exclusive_balance_covered_products,exclusive_balance_unverified_products:report.exclusive_balance_unverified_products,covered_exclusive_balance_cents:report.covered_exclusive_balance_cents,exclusive_balance_basis:report.exclusive_balance_basis,ranking,coverage,inventory_verified:false,execution_allowed:false,safe_price_cents:null,safe_sku_net_profit_cents:null,blockers:[...report.blockers],products:ranked});
 }catch{return null;}
}

// Two explicit mathematical scenarios through the existing reviewed simulator.
// Neither result is a verified marketplace price, inventory or financial fact.
export function simulateMlsPricingWorkbench(input,simulate){
 const integer=(value,min,max)=>Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=min&&value<=max;
 const exact=(value,keys)=>value!==null&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
 const keys=['unit_cost_cents','extra_cost_cents','fee_bps','ads_bps','target_margin_bps'];
 try{
  if(typeof simulate!=='function'||!exact(input,keys)||!integer(input.unit_cost_cents,1,100000000)||!integer(input.extra_cost_cents,0,100000000)||!['fee_bps','ads_bps','target_margin_bps'].every(key=>integer(input[key],0,9000))||input.fee_bps+input.ads_bps+input.target_margin_bps>=10000)return null;
  const base=BigInt(input.unit_cost_cents)+BigInt(input.extra_cost_cents),warnings=['PERCENTAGES_ARE_ASSUMPTIONS','NO_PROOF_OF_TAX_FREIGHT_OR_FIXED_EXPENSE_COVERAGE','NO_VALIDATED_ADS_SKU_ATTRIBUTION','INVENTORY_NOT_VERIFIED','M2_NOT_CLOSED'];
  const assumptions={fee_bps:input.fee_bps,ads_bps:input.ads_bps,target_margin_bps:input.target_margin_bps,extra_cost_cents:input.extra_cost_cents};
  const call=margin=>{
   const supplied={unit_cost_cents:input.unit_cost_cents,extra_cost_cents:input.extra_cost_cents,fee_bps:input.fee_bps,ads_bps:input.ads_bps,target_margin_bps:margin};
   const value=simulate(Object.freeze(supplied));
   if(!exact(value,['schema','status','mode','calculated_scenario_price_cents','supplied_cost_base_cents','operator_assumptions','not_a_safe_price','may_publish','may_modify_ads','warnings'])||value.schema!=='mls_pricing_simulation_v1'||value.status!=='SIMULATION_ONLY'||value.mode!=='OBSERVER'||value.not_a_safe_price!==true||value.may_publish!==false||value.may_modify_ads!==false||value.supplied_cost_base_cents!==Number(base)||!integer(value.calculated_scenario_price_cents,1,Number.MAX_SAFE_INTEGER)||!exact(value.operator_assumptions,['fee_bps','ads_bps','target_margin_bps','extra_cost_cents'])||value.operator_assumptions.fee_bps!==input.fee_bps||value.operator_assumptions.ads_bps!==input.ads_bps||value.operator_assumptions.target_margin_bps!==margin||value.operator_assumptions.extra_cost_cents!==input.extra_cost_cents||!Array.isArray(value.warnings)||Object.getPrototypeOf(value.warnings)!==Array.prototype||Reflect.ownKeys(value.warnings).length!==warnings.length+1||value.warnings.length!==warnings.length||!warnings.every((warning,index)=>Object.hasOwn(Object.getOwnPropertyDescriptor(value.warnings,String(index))||{},'value')&&value.warnings[index]===warning))return null;
   const denominator=BigInt(10000-input.fee_bps-input.ads_bps-margin),expected=(base*10000n+denominator-1n)/denominator;
   return BigInt(value.calculated_scenario_price_cents)===expected?value.calculated_scenario_price_cents:null;
  };
  const equilibrium=call(0),target=call(input.target_margin_bps);if(equilibrium===null||target===null||target<equilibrium)return null;
  return Object.freeze({schema:'mls_pricing_workbench_simulation_v1',status:'SIMULATION_ONLY',mode:'OBSERVER',equilibrium_price_cents:equilibrium,target_price_cents:target,supplied_cost_base_cents:Number(base),unit_cost_cents:input.unit_cost_cents,operator_assumptions:Object.freeze(assumptions),not_a_safe_price:true,safe_price_cents:null,may_publish:false,may_modify_ads:false,warnings:Object.freeze([...warnings])});
 }catch{return null;}
}
