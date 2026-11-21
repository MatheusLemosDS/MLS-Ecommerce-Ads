// Shared, read-only interpretation of the server's physical-material workspace.
// This function is deliberately self-contained: its exact source also runs in
// the generated browser assets. It does not reserve, print or value any stock.
export function projectProductionMaterialAvailability(value,options={}){
 const safe=(v,min=0)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min;
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const own=(v,k)=>plain(v)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value');
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>own(v,k));
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(v);
 const date=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const scope=v=>exact(v,['organization_id','store_id'])&&id(v.organization_id)&&id(v.store_id);
 const expected=options.expected_scope??{organization_id:'legacy-brazacommerce',store_id:'legacy-shopee'};
 const now=options.now??Date.now();
 const unavailable=reason=>Object.freeze({schema:'mls_material_availability_v1',state:'UNKNOWN',source_valid:false,reason,planning_date:null,checked_at:null,fence_hash:null,source_vector:null,scope:null,local_records_complete:null,provider_completeness:'NOT_PROVEN',orders_count:null,reserved_orders:null,available_to_reserve_orders:null,shortage_orders:null,unknown_orders:null,consumed_orders:null,review_orders:null,ineligible_orders:null,required_pieces:null,known_shortage_pieces:null,rows:Object.freeze([])});
 try{
  if(!safe(now,1)||!scope(expected))return unavailable('CONTEXT_UNAVAILABLE');
  if(!plain(value)||!['schema','scope','planning_date','checked_at','fence_hash','source_vector','coverage','orders'].every(k=>own(value,k))||value.schema!=='production_material_workspace_v1')return unavailable('NOT_LOADED');
  if(!scope(value.scope)||value.scope.organization_id!==expected.organization_id||value.scope.store_id!==expected.store_id)return unavailable('SCOPE_MISMATCH');
  if(!date(value.planning_date)||options.planning_date!==undefined&&value.planning_date!==options.planning_date)return unavailable('PLANNING_DATE_MISMATCH');
  const checked=typeof value.checked_at==='string'?Date.parse(value.checked_at):NaN;
  if(!Number.isFinite(checked)||new Date(checked).toISOString()!==value.checked_at||checked>now+5000||now-checked>300000)return unavailable('SOURCE_STALE');
  const vector=value.source_vector;
  if(!hash(value.fence_hash)||!exact(vector,['schema','orders_hash','operational_heads_hash','manufacturing_hash'])||vector.schema!=='production_material_source_vector_v1'||![vector.orders_hash,vector.operational_heads_hash,vector.manufacturing_hash].every(hash))return unavailable('SOURCE_VECTOR_INVALID');
  const coverage=value.coverage,coverageKeys=['orders_complete','stock_complete','suppliers_complete','purchases_complete','manufacturing_complete'];
  if(!plain(coverage)||!coverageKeys.every(k=>own(coverage,k)&&typeof coverage[k]==='boolean')||coverage.source_integrity_verified!==true||coverage.provider_completeness!=='NOT_PROVEN'||coverage.basis!=='SAVED_LOCAL_SOURCES_ONLY')return unavailable('SOURCE_INTEGRITY_UNPROVEN');
  if(!Array.isArray(value.orders)||value.orders.length>1000)return unavailable('ROWS_INVALID');
  const counts={RESERVED:0,AVAILABLE_TO_RESERVE:0,SHORTAGE:0,UNKNOWN:0,CONSUMED:0,REVIEW:0,INELIGIBLE:0},seen=new Set(),rows=[];
  let required=0n,requiredKnown=true,shortage=0n;
  for(const row of value.orders){
   if(!plain(row)||!['source_key','source_hash','line_source_hash','material_state','commercial_quantity','group_revision','components'].every(k=>own(row,k))||!hash(row.source_key)||!hash(row.source_hash)||!hash(row.line_source_hash)||seen.has(row.source_key)||!Object.hasOwn(counts,row.material_state)||!safe(row.commercial_quantity,1)||!safe(row.group_revision)||!Array.isArray(row.components)||row.components.length>100)return unavailable('ROWS_INVALID');
   seen.add(row.source_key);counts[row.material_state]++;
   const components=[],variants=new Set();let fullyReserved=row.components.length>0&&row.group_revision>0;
   if(!row.components.length)requiredKnown=false;
   for(const component of row.components){
    if(!plain(component)||!['variant_id','quantity_per_unit','required_quantity','reserved_quantity','consumed_quantity','shortage_quantity'].every(k=>own(component,k))||!id(component.variant_id)||variants.has(component.variant_id)||!safe(component.quantity_per_unit,1))return unavailable('COMPONENT_INVALID');
    variants.add(component.variant_id);
    for(const key of ['required_quantity','reserved_quantity','consumed_quantity','shortage_quantity'])if(component[key]!==null&&!safe(component[key]))return unavailable('COMPONENT_INVALID');
    const needed=component.required_quantity,reserved=component.reserved_quantity,consumed=component.consumed_quantity;
    if(needed!==null&&BigInt(needed)!==BigInt(row.commercial_quantity)*BigInt(component.quantity_per_unit))return unavailable('COMPONENT_QUANTITY_MISMATCH');
    if(needed===null)requiredKnown=false;else required+=BigInt(needed);
    if(component.shortage_quantity!==null)shortage+=BigInt(component.shortage_quantity);
    if(needed===null||reserved===null||consumed===null||needed<1||reserved!==needed||consumed!==0)fullyReserved=false;
    components.push(Object.freeze({variant_id:component.variant_id,required_quantity:needed,reserved_quantity:reserved,consumed_quantity:consumed,shortage_quantity:component.shortage_quantity}));
   }
   if(required>BigInt(Number.MAX_SAFE_INTEGER)||shortage>BigInt(Number.MAX_SAFE_INTEGER))return unavailable('ARITHMETIC_UNSAFE');
   rows.push(Object.freeze({source_key:row.source_key,source_hash:row.source_hash,line_source_hash:row.line_source_hash,commercial_quantity:row.commercial_quantity,group_revision:row.group_revision,material_state:row.material_state,fully_reserved:row.material_state==='RESERVED'&&fullyReserved,components:Object.freeze(components)}));
  }
  const complete=coverageKeys.every(k=>coverage[k]);
  return Object.freeze({schema:'mls_material_availability_v1',state:complete?'OBSERVED':'PARTIAL',source_valid:true,reason:null,planning_date:value.planning_date,checked_at:value.checked_at,fence_hash:value.fence_hash,source_vector:Object.freeze({...vector}),scope:Object.freeze({...value.scope}),local_records_complete:complete,provider_completeness:'NOT_PROVEN',orders_count:rows.length,reserved_orders:counts.RESERVED,available_to_reserve_orders:counts.AVAILABLE_TO_RESERVE,shortage_orders:counts.SHORTAGE,unknown_orders:counts.UNKNOWN,consumed_orders:counts.CONSUMED,review_orders:counts.REVIEW,ineligible_orders:counts.INELIGIBLE,required_pieces:requiredKnown?Number(required):null,known_shortage_pieces:Number(shortage),rows:Object.freeze(rows)});
 }catch{return unavailable('SOURCE_INVALID');}
}
