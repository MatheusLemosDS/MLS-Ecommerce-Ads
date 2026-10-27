// Current Shopee seller-income snapshot. This is provider payout state,
// not a bank statement, not a historical month total and not realized profit.
export function projectIncomeOverviewFrame(value){
 try{
  const plain=item=>item!==null&&typeof item==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(item));
  const exact=(item,keys)=>plain(item)&&Reflect.ownKeys(item).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(item,key)||{},'value'));
  const int=(item,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(item)&&!Object.is(item,-0)&&item>=min&&item<=max;
  const cents=item=>item===null||int(item,Number.MIN_SAFE_INTEGER);
  const raw=item=>item===null||typeof item==='string'&&/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,12})?$/.test(item)&&item.length<=48;
  if(!exact(value,['schema','checked_at','region','shop_type','currency_basis','pending','released','to_release','basis'])||
    value.schema!=='finance_income_overview_v1'||!int(value.checked_at,1,9999999999)||value.region!=='BRAZIL'||value.shop_type!=='LOCAL'||
    value.currency_basis!=='FIXED_BRAZIL_SHOP_PROFILE'||value.basis!=='CURRENT_PROVIDER_INCOME_STATUS_NOT_BANK_RECEIPT_OR_HISTORICAL_MONTH')return null;
  const project=(row,status)=>{
   if(!exact(row,['status','raw','cents'])||row.status!==status||!raw(row.raw)||!cents(row.cents))return null;
   if(row.raw===null&&row.cents!==null)return null;
   if(row.raw!==null){
    const match=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]{1,12}))?$/.exec(row.raw);if(!match)return null;
    const fraction=match[3]??'';if(fraction.length<=2){
     const value=(BigInt(match[2])*100n+BigInt(fraction.padEnd(2,'0')))*(match[1]?-1n:1n);
     if(value<BigInt(Number.MIN_SAFE_INTEGER)||value>BigInt(Number.MAX_SAFE_INTEGER)||row.cents!==Number(value))return null;
    }else if(row.cents!==null)return null;
   }
   return {...row};
  };
  const pending=project(value.pending,'PENDING'),released=project(value.released,'RELEASED'),toRelease=project(value.to_release,'TO_RELEASE_NOT_APPLICABLE_LOCAL');
  if(!pending||!released||!toRelease)return null;
  return {schema:value.schema,checked_at:value.checked_at,region:value.region,shop_type:value.shop_type,currency_basis:value.currency_basis,pending,released,to_release:toRelease,basis:value.basis};
 }catch{return null;}
}
