import {projectIncomeDetailFrame} from './income-detail-frame.mjs';

// A completed cursor traversal is still an observation of a mutable provider,
// never an atomic account balance, monthly profit or bank receipt.
export function projectPendingIncomeScanRequest(value){
 try{if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Reflect.ownKeys(value).length!==1||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,'operation')||{},'value')||!['read','step'].includes(value.operation))return null;return {operation:value.operation};}catch{return null;}
}

export function projectPendingIncomeScanFrame(value,projectDetail=projectIncomeDetailFrame){
 try{
  const basis='CURRENT_PENDING_PAGINATED_MUTABLE_SOURCE_NOT_MONTH_OR_BANK_RECEIPT';
  const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
  const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(key=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)||{},'value'));
  const array=(v,max)=>Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,index)=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(index))||{},'value')).every(Boolean);
  const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
  const stamp=(v,min=1,max=9999999999)=>int(v,min,max);
  const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
  const day=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])$/.test(v)&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
  const errors=['PERMISSION_DENIED','RATE_LIMIT','TIMEOUT','UNAVAILABLE','INVALID_RESPONSE','REPEATED_CURSOR','REPEATED_PAGE','EMPTY_CONTINUATION','LIMIT_REACHED','SCAN_EXPIRED'];
  if(typeof projectDetail!=='function'||!exact(value,['schema','checked_at','scan','report','basis'])||value.schema!=='finance_pending_income_scan_v1'||!stamp(value.checked_at)||value.basis!==basis)return null;
  let scan=null,report=null;
  if(value.scan!==null){
   const s=value.scan;
   if(!exact(s,['scan_id','state','started_at','updated_at','completed_at','date_from','date_to','pages_read','unique_entries','unique_orders','duplicate_entries','conflicting_orders','next_attempt_at','error'])||!uuid(s.scan_id)||!['RUNNING','COMPLETE','RETRY_WAIT','ERROR','LIMIT_REACHED'].includes(s.state)||!stamp(s.started_at,1,value.checked_at)||!stamp(s.updated_at,s.started_at,value.checked_at)||!day(s.date_from)||!day(s.date_to)||Date.parse(s.date_to+'T12:00:00Z')-Date.parse(s.date_from+'T12:00:00Z')!==86400000||!int(s.pages_read,0,20)||!int(s.unique_entries,0,1000)||!int(s.unique_orders,0,s.unique_entries)||!int(s.duplicate_entries,0,2000)||!int(s.conflicting_orders,0,s.unique_orders)||!stamp(s.next_attempt_at,0)||s.error!==null&&!errors.includes(s.error))return null;
   if(s.unique_entries+s.duplicate_entries>s.pages_read*100||(s.state!=='RUNNING'||s.pages_read>0)&&s.next_attempt_at<s.updated_at||s.date_to!==new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date(s.started_at*1000)))return null;
   if(s.state==='COMPLETE'?(s.pages_read<1||!stamp(s.completed_at,s.started_at,s.updated_at)||s.error!==null):s.completed_at!==null)return null;
   if(s.state==='RUNNING'&&s.error!==null||s.state==='RETRY_WAIT'&&s.error===null||s.state==='ERROR'&&s.error===null||s.state==='LIMIT_REACHED'&&s.error!=='LIMIT_REACHED')return null;
   scan={...s};
  }
  if(value.report!==null){
   const r=value.report;
   if(!exact(r,['scan_id','started_at','completed_at','source_oldest_at','source_latest_at','pages_read','rows','unique_orders','duplicate_entries','conflicting_orders','known_amount_cents','unknown_amount_count','amount_complete','basis'])||!uuid(r.scan_id)||!stamp(r.started_at,1,value.checked_at)||!stamp(r.completed_at,r.started_at,value.checked_at)||!stamp(r.source_oldest_at,r.started_at,r.completed_at)||!stamp(r.source_latest_at,r.source_oldest_at,r.completed_at)||!int(r.pages_read,1,20)||!array(r.rows,1000)||!int(r.unique_orders,0,r.rows.length)||!int(r.duplicate_entries,0,2000)||!int(r.conflicting_orders,0,r.unique_orders)||!int(r.unknown_amount_count,0,r.rows.length)||typeof r.amount_complete!=='boolean'||r.basis!==basis)return null;
   if(r.rows.length+r.duplicate_entries>r.pages_read*100)return null;
   const rows=[],entries=new Set(),orders=new Map();let unknown=0,sum=0n;
   for(let offset=0;offset<r.rows.length;offset+=100){
    const chunk=r.rows.slice(offset,offset+100),frame=projectDetail({schema:'finance_income_detail_v1',checked_at:r.source_latest_at,region:'BRAZIL',shop_type:'LOCAL',income_status:'PENDING',page_size:100,returned_count:chunk.length,has_more:false,next_cursor_present:false,rows:chunk,basis:'CURRENT_PENDING_PROVIDER_INCOME_DETAIL_NOT_MONTH_OR_BANK_RECEIPT'});
    if(!frame)return null;
    for(const row of frame.rows){if(entries.has(row.entry_hash))return null;entries.add(row.entry_hash);orders.set(row.order_hash,(orders.get(row.order_hash)||0)+1);if(row.estimated_escrow_cents===null)unknown++;else sum+=BigInt(row.estimated_escrow_cents);rows.push(row);}
   }
   const conflicts=[...orders.values()].filter(count=>count>1).length,safe=sum>=BigInt(Number.MIN_SAFE_INTEGER)&&sum<=BigInt(Number.MAX_SAFE_INTEGER),complete=unknown===0&&conflicts===0&&safe,amount=complete?Number(sum):null;
   if(r.unique_orders!==orders.size||r.conflicting_orders!==conflicts||r.unknown_amount_count!==unknown||r.amount_complete!==complete||r.known_amount_cents!==amount)return null;
   report={...r,rows};
  }
  if(scan?.state==='COMPLETE'&&(!report||report.scan_id!==scan.scan_id||report.started_at!==scan.started_at||report.completed_at!==scan.completed_at||report.pages_read!==scan.pages_read||report.rows.length!==scan.unique_entries||report.unique_orders!==scan.unique_orders||report.duplicate_entries!==scan.duplicate_entries||report.conflicting_orders!==scan.conflicting_orders))return null;
  if(report&&scan&&report.scan_id!==scan.scan_id&&report.completed_at>scan.started_at)return null;
  const frame={schema:value.schema,checked_at:value.checked_at,scan,report,basis};
  if(new TextEncoder().encode(JSON.stringify(frame)).byteLength>1048576)return null;
  return frame;
 }catch{return null;}
}
