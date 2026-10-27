// Current Shopee Pending income details. This is a live provider snapshot,
// not a monthly receivable ledger, not a bank receipt and not realized profit.
export function projectIncomeDetailFrame(value){
 try{
  const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
  const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
  const array=(item,max)=>Array.isArray(item)&&Object.getPrototypeOf(item)===Array.prototype&&item.length<=max&&Reflect.ownKeys(item).length===item.length+1&&Array.from({length:item.length},(_,index)=>Object.getOwnPropertyDescriptor(item,String(index))).every(row=>row&&Object.hasOwn(row,'value'));
  const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
  const cent=item=>item===null||int(item,Number.MIN_SAFE_INTEGER);
  const raw=item=>item===null||typeof item==='string'&&/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,12})?$/.test(item)&&item.length<=48;
  const hash=item=>typeof item==='string'&&/^[a-f0-9]{64}$/.test(item);
  const bounded=item=>item===null||typeof item==='string'&&item.length<=160&&!/[\u0000-\u001f\u007f]/.test(item);
  if(!exact(value,['schema','checked_at','region','shop_type','income_status','page_size','returned_count','has_more','next_cursor_present','rows','basis'])||
    value.schema!=='finance_income_detail_v1'||!int(value.checked_at,1,9999999999)||value.region!=='BRAZIL'||value.shop_type!=='LOCAL'||value.income_status!=='PENDING'||
    value.page_size!==100||!int(value.returned_count,0,100)||typeof value.has_more!=='boolean'||typeof value.next_cursor_present!=='boolean'||value.has_more!==value.next_cursor_present||
    value.basis!=='CURRENT_PENDING_PROVIDER_INCOME_DETAIL_NOT_MONTH_OR_BANK_RECEIPT'||!array(value.rows,100)||value.rows.length!==value.returned_count)return null;
  const rows=[],seen=new Set();
  for(const row of value.rows){
   if(!exact(row,['entry_hash','order_hash','currency','status','description','payment_method','estimated_escrow_raw','estimated_escrow_cents','estimated_payout_time','creation_time'])||
    !hash(row.entry_hash)||!hash(row.order_hash)||seen.has(row.entry_hash)||row.currency!=='BRL'||!bounded(row.status)||row.status===null||!bounded(row.description)||!bounded(row.payment_method)||
    !raw(row.estimated_escrow_raw)||!cent(row.estimated_escrow_cents)||row.estimated_payout_time!==null&&!int(row.estimated_payout_time,1,9999999999)||row.creation_time!==null&&!int(row.creation_time,1,9999999999))return null;
   if(row.estimated_escrow_raw===null&&row.estimated_escrow_cents!==null)return null;
   if(row.estimated_escrow_raw!==null){
    const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,12}))?$/.exec(row.estimated_escrow_raw);if(!match)return null;const fraction=match[3]??'';
    if(fraction.length<=2){const amount=(BigInt(match[2])*100n+BigInt(fraction.padEnd(2,'0')))*(match[1]?-1n:1n);if(amount<BigInt(Number.MIN_SAFE_INTEGER)||amount>BigInt(Number.MAX_SAFE_INTEGER)||row.estimated_escrow_cents!==Number(amount))return null;}
    else if(row.estimated_escrow_cents!==null)return null;
   }
   seen.add(row.entry_hash);rows.push({...row});
  }
  return {schema:value.schema,checked_at:value.checked_at,region:value.region,shop_type:value.shop_type,income_status:value.income_status,page_size:value.page_size,returned_count:value.returned_count,has_more:value.has_more,next_cursor_present:value.next_cursor_present,rows,basis:value.basis};
 }catch{return null;}
}
