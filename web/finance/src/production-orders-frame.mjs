// Private production view: no buyer, address, financial values or credentials.
const productionPlain=value=>value!==null&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const productionExact=(value,keys)=>productionPlain(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)||{},'value'));
const productionArray=(value,max)=>Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype&&value.length<=max&&Reflect.ownKeys(value).length===value.length+1&&Array.from({length:value.length},(_,index)=>Object.getOwnPropertyDescriptor(value,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
const productionEpoch=value=>Number.isSafeInteger(value)&&value>=1&&value<=9999999999;
const productionId=(value,zero=false)=>typeof value==='string'&&(zero?/^(0|[1-9][0-9]{0,19})$/:/^[1-9][0-9]{0,19}$/).test(value);
const productionSerial=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const productionText=(value,max)=>typeof value==='string'&&new TextEncoder().encode(value).byteLength<=max&&!/[\u0000-\u001f\u007f-\u009f]/.test(value);
const productionDate=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const productionStatuses=new Set(['UNPAID','READY_TO_SHIP','PROCESSED','RETRY_SHIP','SHIPPED','TO_CONFIRM_RECEIVE','COMPLETED','IN_CANCEL','CANCELLED','INVOICE_PENDING','TO_RETURN','UNKNOWN']);

export function projectProductionOrdersRequest(value){
 try{
  if(Object.getOwnPropertyDescriptor(value||{},'operation')?.value==='scan'){
   if(!productionExact(value,['operation','start_date','end_date'])||!productionDate(value.start_date)||!productionDate(value.end_date))return null;
   const days=(Date.parse(value.end_date)-Date.parse(value.start_date))/86400000;
   return days>=0&&days<15?{operation:'scan',start_date:value.start_date,end_date:value.end_date}:null;
  }
  if(!productionExact(value,['operation','order_ids'])||value.operation!=='verify'||!productionArray(value.order_ids,50)||!value.order_ids.length||!value.order_ids.every(productionSerial)||new Set(value.order_ids).size!==value.order_ids.length)return null;
  return {operation:'verify',order_ids:[...value.order_ids]};
 }catch{return null;}
}

export function projectProductionOrdersFrame(value){
 try{
  if(!productionExact(value,['schema','shop_id','checked_at','start_date','end_date','complete','orders'])||value.schema!=='production_orders_v1'||value.shop_id!==1178167501||!productionEpoch(value.checked_at)||value.complete!==true||!productionArray(value.orders,1000))return null;
  const ranged=value.start_date!==null||value.end_date!==null;
  if(ranged&&!projectProductionOrdersRequest({operation:'scan',start_date:value.start_date,end_date:value.end_date}))return null;
  const orders=[],seen=new Set();let lineCount=0;
  for(const row of value.orders){
   if(!productionExact(row,['order_id','status','create_time','update_time','lines'])||!productionSerial(row.order_id)||seen.has(row.order_id)||!productionStatuses.has(row.status)||!productionEpoch(row.create_time)||!productionEpoch(row.update_time)||row.create_time>row.update_time||row.update_time>value.checked_at+60||!productionArray(row.lines,200))return null;
   if(ranged&&(row.create_time<Date.parse(value.start_date+'T00:00:00-03:00')/1000||row.create_time>=Date.parse(value.end_date+'T00:00:00-03:00')/1000+86400))return null;
   seen.add(row.order_id);const lines=[],keys=new Set();
   for(const line of row.lines){
    if(++lineCount>5000||!productionExact(line,['line_key','item_id','model_id','sku','quantity','model_name'])||!productionId(line.item_id)||!productionId(line.model_id,true)||line.line_key!==line.item_id+':'+line.model_id||keys.has(line.line_key)||!productionText(line.sku,128)||!productionText(line.model_name,256)||!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>10000)return null;
    keys.add(line.line_key);lines.push({...line});
   }
   orders.push({...row,lines});
  }
  const projected={schema:'production_orders_v1',shop_id:1178167501,checked_at:value.checked_at,start_date:value.start_date,end_date:value.end_date,complete:true,orders};
  return new TextEncoder().encode(JSON.stringify(projected)).byteLength<=1048576?projected:null;
 }catch{return null;}
}

export function productionOrdersRequestMatches(input,frame){
 if(input.operation==='scan')return frame.start_date===input.start_date&&frame.end_date===input.end_date;
 return frame.start_date===null&&frame.end_date===null&&frame.orders.length===input.order_ids.length&&frame.orders.every(row=>input.order_ids.includes(row.order_id));
}
