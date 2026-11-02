// An opt-in observation of selling-unit counts. This does not amend the paid
// cohort, identify physical garments inside a kit, or authorize a ledger write.
export function projectOriginalItemsFrame(value,report){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const read=(row,key)=>plain(row)?Object.getOwnPropertyDescriptor(row,key)?.value:undefined;
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 const list=(row,max)=>Array.isArray(row)&&Object.getPrototypeOf(row)===Array.prototype&&row.length<=max&&Reflect.ownKeys(row).length===row.length+1&&Array.from({length:row.length},(_,index)=>Object.getOwnPropertyDescriptor(row,String(index))).every(field=>field&&Object.hasOwn(field,'value'));
 const int=(row,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(row)&&!Object.is(row,-0)&&row>=min&&row<=max;
 const hash=row=>typeof row==='string'&&/^[a-f0-9]{64}$/.test(row);
 const day=row=>typeof row==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(row)&&Number.isFinite(Date.parse(row+'T00:00:00Z'))&&new Date(row+'T00:00:00Z').toISOString().slice(0,10)===row;
 const id=(row,zero=false)=>typeof row==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(row);
 const states=['AVAILABLE','NOT_CAPTURED','INVALID','LIMIT_REACHED'];
 const compareId=(a,b)=>a.length-b.length||a.localeCompare(b);
 function items(rows,state){
  if(!list(rows,1000)||(state==='AVAILABLE'?rows.length===0:rows.length!==0))return null;
  const out=[];let previous=null;
  for(const row of rows){
   if(!exact(row,['item_id','model_id','quantity'])||!id(row.item_id)||!id(row.model_id,true)||!int(row.quantity,1,1000000000000))return null;
   if(previous&&(compareId(previous.item_id,row.item_id)>0||previous.item_id===row.item_id&&compareId(previous.model_id,row.model_id)>=0))return null;
   out.push({item_id:row.item_id,model_id:row.model_id,quantity:row.quantity});previous=row;
  }
  return out;
 }
 try{
  if(read(report,'schema')!=='finance_reconciliation_v1'||!list(read(report,'cases'),40)||!exact(value,['schema','run_id','source_revision','start_date','end_date','checked_at','orders','cases','truncation','basis'])||value.schema!=='finance_original_items_v1'||value.basis!=='SAVED_PROVIDER_SELLING_UNIT_COUNTS_NOT_PHYSICAL_PIECES'||typeof value.run_id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.run_id)||!int(value.source_revision,1,2147483647)||!day(value.start_date)||!day(value.end_date)||value.start_date<'2000-01-01'||value.end_date<value.start_date||(Date.parse(value.end_date)-Date.parse(value.start_date))/86400000>14||value.run_id!==read(report,'run_id')||value.source_revision!==read(report,'source_revision')||value.start_date!==read(report,'start_date')||value.end_date!==read(report,'end_date')||value.checked_at!==read(report,'checked_at')||!int(value.checked_at,1,9999999999)||!list(value.orders,40)||!list(value.cases,40))return null;
  const context=report.cases,expectedOrders=[...new Set(context.map(row=>read(row,'order_hash')))].sort(),t=value.truncation,base=read(report,'truncation');
  if(!expectedOrders.every(hash)||!exact(t,['orders_total','orders_included','cases_total','cases_included','truncated'])||typeof read(base,'truncated')!=='boolean'||t.truncated!==base.truncated||t.orders_total!==(base.truncated?null:expectedOrders.length)||t.orders_included!==expectedOrders.length||t.orders_included!==value.orders.length||t.cases_total!==read(base,'cases_total')||t.cases_included!==context.length||t.cases_included!==value.cases.length)return null;
  const times=read(report,'source_checked_at'),oldest=read(times,'finance_oldest_at'),latest=read(times,'finance_latest_at'),orders=[],cases=[];
  for(const [index,row]of value.orders.entries()){
   if(!exact(row,['order_hash','source_checked_at','state','items'])||row.order_hash!==expectedOrders[index]||!states.includes(row.state)||!int(row.source_checked_at,oldest??1,latest??0))return null;
   const projected=items(row.items,row.state);if(!projected)return null;orders.push({order_hash:row.order_hash,source_checked_at:row.source_checked_at,state:row.state,items:projected});
  }
  const seen=new Set();
  for(const [index,row]of value.cases.entries()){
   const original=context[index],checked=read(original,'checked_at');
   if(!exact(row,['case_hash','order_hash','source_checked_at','state','items'])||!hash(row.case_hash)||seen.has(row.case_hash)||row.case_hash!==read(original,'case_hash')||row.order_hash!==read(original,'order_hash')||row.source_checked_at!==checked||checked!==null&&!int(checked,1,value.checked_at)||!states.includes(row.state)||checked===null&&row.state!=='NOT_CAPTURED')return null;
   seen.add(row.case_hash);const projected=items(row.items,row.state);if(!projected)return null;cases.push({case_hash:row.case_hash,order_hash:row.order_hash,source_checked_at:row.source_checked_at,state:row.state,items:projected});
  }
  const result={schema:value.schema,run_id:value.run_id,source_revision:value.source_revision,start_date:value.start_date,end_date:value.end_date,checked_at:value.checked_at,orders,cases,truncation:{...t},basis:value.basis};
  return new TextEncoder().encode(JSON.stringify(result)).byteLength<=65536?result:null;
 }catch{return null;}
}

// Dependencies are explicit for the frozen browser copy. A malformed new
// envelope never silently becomes a valid legacy financial response.
export function projectReconciliationOriginalItemsFrame(value,projectLegacy,projectReview,projectMoney,projectOriginal){
 const plain=row=>row!==null&&typeof row==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(row));
 const exact=(row,keys)=>plain(row)&&Reflect.ownKeys(row).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(row,key)||{},'value'));
 try{
  if(![projectLegacy,projectReview,projectMoney,projectOriginal].every(fn=>typeof fn==='function')||!exact(value,['schema','report','review','money','original_items'])||value.schema!=='finance_reconciliation_v4')return null;
  const legacy=projectMoney({schema:'finance_reconciliation_v3',report:value.report,review:value.review,money:value.money},projectLegacy,projectReview);if(!legacy)return null;
  const original=projectOriginal(value.original_items,legacy.report);if(!original)return null;
  for(const order of original.orders){const payout=legacy.money.payouts.find(row=>row.order_hash===order.order_hash);if(!payout||payout.source_checked_at!==order.source_checked_at||order.state==='AVAILABLE'&&(payout.cohort!=='PAID'||payout.base_repass_cents===null))return null;}
  const result={schema:'finance_reconciliation_v4',report:legacy.report,review:legacy.review,money:legacy.money,original_items:original};
  return new TextEncoder().encode(JSON.stringify(result)).byteLength<=262144?result:null;
 }catch{return null;}
}
