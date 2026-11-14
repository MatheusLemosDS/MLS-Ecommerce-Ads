export const FINANCIAL_SOURCE_PATH='/internal/finance/financial-sources-v1';
export const FINANCIAL_SOURCE_REQUEST_MAXIMUM=4096;
export const FINANCIAL_SOURCE_RESPONSE_MAXIMUM=1048576;
export function createFinancialSourceProtocol(){
 const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
 const exact=(v,keys)=>plain(v)&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,k)||{},'value'));
 const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&!Object.is(v,-0)&&v>=min&&v<=max;
 const token=(v,max=128)=>typeof v==='string'&&v.length<=max&&/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(v);
 const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
 const arr=(v,max)=>Array.isArray(v)&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&v.every((_,i)=>Object.hasOwn(Object.getOwnPropertyDescriptor(v,String(i))||{},'value'));
 const date=v=>typeof v==='string'&&/^20\d\d-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const iso=v=>typeof v==='string'&&/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,19)===v.slice(0,19);
 const nullable=(v,fn)=>v===null||fn(v),scope=v=>exact(v,['organization_id','store_id','account_id','currency'])&&[v.organization_id,v.store_id,v.account_id].every(x=>token(x))&&typeof v.currency==='string'&&/^[A-Z]{3}$/.test(v.currency);
 const sameScope=(a,b)=>scope(a)&&scope(b)&&['organization_id','store_id','account_id','currency'].every(k=>a[k]===b[k]);
 const itemId=v=>typeof v==='string'&&/^[1-9][0-9]{0,19}$/.test(v),modelId=v=>v==='0'||itemId(v);
 const itemCursor=v=>exact(v,['order_hash','item_id','model_id'])&&hash(v.order_hash)&&itemId(v.item_id)&&modelId(v.model_id),itemKey=v=>v.order_hash+':'+v.item_id+':'+v.model_id;
 const sourceIds=['ORDERS','ESCROW','INCOME_OVERVIEW','PENDING','RELEASES','RETURNS','RETURN_DISCOVERY','WALLET','PAYOUTS'];
 function capabilities(v){
  if(!exact(v,['schema','scope','application_ref','region','checked_at','sources'])||v.schema!=='financial_source_capabilities_v1'||!scope(v.scope)||!nullable(v.application_ref,x=>token(x))||!nullable(v.region,x=>typeof x==='string'&&/^[A-Z]{2}$/.test(x))||!iso(v.checked_at)||!arr(v.sources,sourceIds.length)||v.sources.length!==sourceIds.length)return null;
  const seen=new Set();
  for(const s of v.sources){
   if(!exact(s,['source','scope','application_ref','region','currency','state','reason','method','path','candidate_path','existing_transport_method','documentation','grant','collection_allowed','coverage','checked_at'])||!sourceIds.includes(s.source)||seen.has(s.source)||!sameScope(s.scope,v.scope)||s.application_ref!==v.application_ref||s.region!==v.region||s.currency!==v.scope.currency||!['AVAILABLE','NO_PERMISSION','UNSUPPORTED','PARTIAL','UNKNOWN'].includes(s.state)||!nullable(s.reason,x=>token(x,100))||!nullable(s.method,x=>['GET','POST'].includes(x))||!nullable(s.path,x=>typeof x==='string'&&/^\/api\/v2\/[a-z_]+\/[a-z_]+$/.test(x))||typeof s.candidate_path!=='string'||!/^\/api\/v2\/[a-z_]+\/[a-z_]+$/.test(s.candidate_path)||!nullable(s.existing_transport_method,x=>['GET','POST'].includes(x))||typeof s.collection_allowed!=='boolean'||!nullable(s.checked_at,iso))return null;seen.add(s.source);
   const d=s.documentation,g=s.grant,c=s.coverage;
   if(!exact(d,['state','reference','checked_at','method','path','parameters','pagination'])||!['CONFIRMED','UNKNOWN','UNAVAILABLE'].includes(d.state)||!nullable(d.reference,x=>typeof x==='string'&&x.length<=1024&&x.startsWith('https://open.shopee.com/documents/'))||!nullable(d.checked_at,iso)||!nullable(d.method,x=>['GET','POST'].includes(x))||!nullable(d.path,x=>x===s.candidate_path)||!arr(d.parameters,64)||!d.parameters.every(x=>token(x,80))||d.pagination!==null&&(!exact(d.pagination,['kind','maximum_page_size','terminal_signal'])||!['CURSOR','PAGE','SINGLE'].includes(d.pagination.kind)||!int(d.pagination.maximum_page_size,1,1000)||!token(d.pagination.terminal_signal,80)))return null;
   if(!exact(g,['state','origin','evidence_ref','checked_at'])||!['CONFIRMED','DENIED','UNSUPPORTED','UNKNOWN'].includes(g.state)||!nullable(g.origin,x=>x==='PROVIDER')||!nullable(g.evidence_ref,x=>token(x))||!nullable(g.checked_at,iso)||!exact(c,['state','start_at','end_at','complete','timezone_confirmed'])||!['COMPLETE','PARTIAL','UNKNOWN','UNAVAILABLE','FORBIDDEN'].includes(c.state)||!nullable(c.start_at,iso)||!nullable(c.end_at,iso)||typeof c.complete!=='boolean'||typeof c.timezone_confirmed!=='boolean'||c.complete&&(c.state!=='COMPLETE'||c.start_at===null||c.end_at===null||c.start_at>=c.end_at))return null;
   if([s.checked_at,d.checked_at,g.checked_at].some(t=>t!==null&&Date.parse(t)>Date.parse(v.checked_at))||g.state!=='UNKNOWN'&&(g.origin!=='PROVIDER'||g.evidence_ref===null||g.checked_at===null)||g.state==='UNKNOWN'&&(g.origin!==null||g.evidence_ref!==null))return null;
   if(d.state==='CONFIRMED'&&(d.reference===null||d.checked_at===null||d.method===null||d.path===null)||d.state!=='CONFIRMED'&&(d.method!==null||d.path!==null||d.parameters.length!==0||d.pagination!==null)||s.method!==d.method||s.path!==d.path)return null;
   const contract=d.state==='CONFIRMED'&&d.pagination!==null,identity=s.application_ref!==null&&s.region!==null,allowed=contract&&identity&&g.state==='CONFIRMED';
   let state='UNKNOWN',reason='CAPABILITY_NOT_VERIFIED';
   if(g.state==='UNSUPPORTED'){state='UNSUPPORTED';reason='PROVIDER_UNSUPPORTED';}
   else if(g.state==='DENIED'){state='NO_PERMISSION';reason='PROVIDER_PERMISSION_DENIED';}
   else if(allowed){state=c.complete&&c.timezone_confirmed?'AVAILABLE':'PARTIAL';reason=c.complete&&c.timezone_confirmed?null:'SOURCE_COVERAGE_NOT_COMPLETE';}
   else if(g.state==='CONFIRMED'||d.state==='CONFIRMED'){state='PARTIAL';reason=!identity?'APPLICATION_REGION_UNCONFIRMED':!contract?'DOCUMENTATION_CONTRACT_UNCONFIRMED':'PROVIDER_GRANT_UNCONFIRMED';}
   else if(d.state==='UNAVAILABLE')reason='OFFICIAL_DOCUMENTATION_UNAVAILABLE';
   if(s.collection_allowed!==allowed||s.state!==state||s.reason!==reason)return null;
  }
  return JSON.parse(JSON.stringify(v));
 }
 function component(v,f){
  const fields=['escrow_amount','escrow_amount_after_adjustment','total_adjustment_amount','original_cost_of_goods_sold','buyer_total_amount','commission_fee','service_fee','seller_transaction_fee','actual_shipping_fee','ads_escrow_top_up_fee_or_technical_support_fee'],dates=['created_at','updated_at','paid_at','completed_at'],observations=[...fields,...dates.map(k=>'dates.'+k),'currency','source_status'];
  if(!exact(v,['schema','order_hash','source_hash','checked_at','currency','source_status','status','dates','amounts','missing_fields','invalid_fields','basis'])||v.schema!=='financial_order_components_v1'||v.order_hash!==f.event_key||v.source_hash!==f.source_hash||v.checked_at!==f.checked_at||!nullable(v.currency,x=>x==='BRL')||!nullable(v.source_status,x=>typeof x==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(x))||!['AVAILABLE','PARTIAL','INVALID','NOT_CAPTURED'].includes(v.status)||v.basis!=='OBSERVED_ORDER_INCOME_FIELDS_NO_INFERRED_RECONCILIATION'||!exact(v.dates,dates)||!exact(v.amounts,fields.map(k=>k+'_cents'))||!arr(v.missing_fields,observations.length)||!arr(v.invalid_fields,observations.length)||![...v.missing_fields,...v.invalid_fields].every(k=>observations.includes(k))||new Set(v.missing_fields).size!==v.missing_fields.length||new Set(v.invalid_fields).size!==v.invalid_fields.length)return false;
  if(!Object.values(v.amounts).every(n=>nullable(n,x=>int(x,Number.MIN_SAFE_INTEGER)))||!Object.values(v.dates).every(d=>nullable(d,x=>iso(x)&&Date.parse(x)/1000<=f.checked_at)))return false;
  for(const k of fields)if(v.amounts[k+'_cents']===null&&!v.missing_fields.includes(k)&&!v.invalid_fields.includes(k))return false;
  for(const k of dates)if(v.dates[k]===null&&!v.missing_fields.includes('dates.'+k)&&!v.invalid_fields.includes('dates.'+k))return false;
  for(const k of ['currency','source_status'])if(v[k]===null&&!v.missing_fields.includes(k)&&!v.invalid_fields.includes(k))return false;
  return !(v.status==='AVAILABLE'&&(v.missing_fields.length||v.invalid_fields.length)||v.status==='INVALID'&&v.invalid_fields.length===0||v.invalid_fields.length&&v.status!=='INVALID');
 }
 function request(v){try{
  if(v?.schema==='financial_source_request_v3'){
   if(!exact(v,['schema','operation','run_id','cursor','limit','expected_revision','order_hash','item_id','model_id'])||v.operation!=='original-items'||!uuid(v.run_id)||!nullable(v.cursor,itemCursor)||!int(v.limit,1,100)||!nullable(v.expected_revision,n=>int(n,1,2147483647))||v.cursor!==null&&v.expected_revision===null)return null;
   const list=v.order_hash===null&&v.item_id===null&&v.model_id===null,lookup=hash(v.order_hash)&&itemId(v.item_id)&&modelId(v.model_id)&&v.cursor===null&&v.limit===1;
   if(!list&&!lookup)return null;return JSON.parse(JSON.stringify(v));
  }
  if(!plain(v)||!['financial_source_request_v1','financial_source_request_v2'].includes(v.schema))return null;
  if(v.operation==='capabilities')return exact(v,['schema','operation'])?{schema:v.schema,operation:v.operation}:null;
  if(v.operation!=='evidence'||!exact(v,['schema','operation','run_id','cursor','limit','expected_revision'])||!uuid(v.run_id)||!nullable(v.cursor,hash)||!int(v.limit,1,100)||!nullable(v.expected_revision,x=>int(x,1,2147483647))||v.cursor!==null&&v.expected_revision===null)return null;
  return {schema:v.schema,operation:v.operation,run_id:v.run_id,cursor:v.cursor,limit:v.limit,expected_revision:v.expected_revision};
 }catch{return null;}}
 function originalItems(v){
  if(!exact(v,['schema','scope','run','items','selection','coverage','cursor','next_cursor','has_more'])||v.schema!=='financial_source_original_items_v3'||!scope(v.scope)||!arr(v.items,100)||!nullable(v.cursor,itemCursor)||!nullable(v.next_cursor,itemCursor)||typeof v.has_more!=='boolean'||v.has_more!==(v.next_cursor!==null))return null;
  const r=v.run,c=v.coverage,s=v.selection;
  if(!exact(r,['run_id','revision','status','start_date','end_date','cutoff_at','checked_at'])||!uuid(r.run_id)||!int(r.revision,1,2147483647)||!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(r.status)||!date(r.start_date)||!date(r.end_date)||r.start_date>r.end_date||!int(r.cutoff_at,946684800,4102444799)||!int(r.checked_at,r.cutoff_at,4102444799))return null;
  if(!exact(s,['order_hash','item_id','model_id']))return null;
  const list=s.order_hash===null&&s.item_id===null&&s.model_id===null,lookup=hash(s.order_hash)&&itemId(s.item_id)&&modelId(s.model_id);if(!list&&!lookup||lookup&&(v.items.length!==1||v.cursor!==null||v.has_more))return null;
  if(!exact(c,['state','complete','orders_total','eligible_orders','missing_orders','invalid_orders','items_total','window_complete','page_complete'])||!['COMPLETE','PARTIAL'].includes(c.state)||typeof c.complete!=='boolean'||!int(c.orders_total,0,1000)||!int(c.eligible_orders,0,c.orders_total)||!int(c.missing_orders,0,c.eligible_orders)||!int(c.invalid_orders,0,c.eligible_orders)||!int(c.items_total,0,1000000)||c.items_total<v.items.length||typeof c.window_complete!=='boolean'||c.window_complete!==(r.status==='COMPLETE')||typeof c.page_complete!=='boolean'||c.page_complete!==!v.has_more||c.complete!==(c.window_complete&&c.missing_orders===0&&c.invalid_orders===0)||c.complete!==(c.state==='COMPLETE'))return null;
  let previous=v.cursor===null?null:itemKey(v.cursor);
  for(const row of v.items){if(!exact(row,['scope','run_id','order_hash','item_id','model_id','quantity','source_hash','run_revision','checked_at'])||!sameScope(row.scope,v.scope)||row.run_id!==r.run_id||!hash(row.order_hash)||!itemId(row.item_id)||!modelId(row.model_id)||!int(row.quantity,1,1000000000000)||!hash(row.source_hash)||row.run_revision!==r.revision||!iso(row.checked_at)||new Date(row.checked_at).toISOString()!==row.checked_at||Date.parse(row.checked_at)/1000<r.cutoff_at||Date.parse(row.checked_at)/1000>r.checked_at||previous!==null&&itemKey(row)<=previous||lookup&&['order_hash','item_id','model_id'].some(k=>row[k]!==s[k]))return null;previous=itemKey(row);}
  if(v.next_cursor!==null&&(v.items.length===0||itemKey(v.next_cursor)!==itemKey(v.items.at(-1))))return null;
  return JSON.parse(JSON.stringify(v));
 }
 function response(v){try{
  if(v?.schema==='financial_source_original_items_v3')return originalItems(v);
  if(v?.schema==='financial_source_capabilities_v1')return capabilities(v);
  if(!exact(v,['schema','scope','run','facts','coverage','capabilities','cursor','next_cursor','has_more'])||!['financial_source_evidence_v1','financial_source_evidence_v2'].includes(v.schema)||!scope(v.scope)||!arr(v.facts,100)||!nullable(v.cursor,hash)||!nullable(v.next_cursor,hash)||typeof v.has_more!=='boolean'||v.has_more!==(v.next_cursor!==null))return null;
  const r=v.run,c=v.coverage,k=capabilities(v.capabilities),v2=v.schema==='financial_source_evidence_v2';
  if(!k||!sameScope(k.scope,v.scope)||!exact(r,['run_id','revision','status','start_date','end_date','cutoff_at','checked_at'])||!uuid(r.run_id)||!int(r.revision,1,2147483647)||!['RUNNING','COMPLETE','LIMIT_REACHED'].includes(r.status)||!date(r.start_date)||!date(r.end_date)||r.start_date>r.end_date||!int(r.cutoff_at,1,9999999999)||!int(r.checked_at,r.cutoff_at,9999999999))return null;
  if(!exact(c,['state','complete','orders_total','missing_orders','invalid_orders','window_complete','page_complete',...(v2?['base_complete','components_state','components_missing_orders','components_invalid_orders']:[])])||!['COMPLETE','PARTIAL'].includes(c.state)||typeof c.complete!=='boolean'||typeof c.window_complete!=='boolean'||typeof c.page_complete!=='boolean'||!int(c.orders_total,0,1000)||!int(c.missing_orders,0,c.orders_total)||!int(c.invalid_orders,0,c.orders_total)||c.complete!==(c.state==='COMPLETE')||c.window_complete!==(r.status==='COMPLETE')||c.complete&&(!c.window_complete||c.missing_orders!==0||c.invalid_orders!==0)||c.page_complete!==!v.has_more)return null;
  const baseComplete=c.window_complete&&c.missing_orders===0&&c.invalid_orders===0;
  if(v2&&(typeof c.base_complete!=='boolean'||c.base_complete!==baseComplete||!['AVAILABLE','PARTIAL','NOT_CAPTURED'].includes(c.components_state)||!int(c.components_missing_orders,0,c.orders_total)||!int(c.components_invalid_orders,0,c.orders_total)||c.components_state==='AVAILABLE'&&(c.components_missing_orders!==0||c.components_invalid_orders!==0)||c.complete!==(c.base_complete&&c.components_state==='AVAILABLE'))||!v2&&c.complete!==baseComplete)return null;
  let previous=v.cursor;
  for(const f of v.facts){const itemsHash=v2&&plain(f)&&Object.hasOwn(f,'order_items_hash');if(!exact(f,['event_key','source_hash','bucket','create_time','checked_at','currency','escrow_amount_cents','after_adjustment_cents','total_adjustment_cents','return_count','diagnostic','payment_covered',...(v2?['components']:[]),...(itemsHash?['order_items_hash']:[])])||!hash(f.event_key)||previous!==null&&f.event_key<=previous||!hash(f.source_hash)||!['completed','ongoing','cancelled','cancel_pending','unpaid','other','unknown'].includes(f.bucket)||!nullable(f.create_time,x=>int(x,946684800,r.checked_at))||!int(f.checked_at,r.cutoff_at,r.checked_at)||!nullable(f.currency,x=>typeof x==='string'&&/^[A-Z]{3}$/.test(x))||!['escrow_amount_cents','after_adjustment_cents','total_adjustment_cents'].every(x=>nullable(f[x],n=>int(n,Number.MIN_SAFE_INTEGER)))||!nullable(f.return_count,x=>int(x,0,100))||!nullable(f.diagnostic,x=>token(x,100))||typeof f.payment_covered!=='boolean'||itemsHash&&!nullable(f.order_items_hash,hash))return null;if(v2&&f.components!==null&&!component(f.components,f))return null;previous=f.event_key;}
  if(v.next_cursor!==null&&(v.facts.length===0||v.next_cursor!==v.facts.at(-1).event_key)||v.facts.length>c.orders_total)return null;
  return JSON.parse(JSON.stringify(v));
 }catch{return null;}}
 function matches(command,frame){const q=request(command),r=response(frame);if(q===null||r===null)return false;if(q.schema==='financial_source_request_v3')return r.schema==='financial_source_original_items_v3'&&r.run.run_id===q.run_id&&(q.cursor===null?r.cursor===null:r.cursor!==null&&['order_hash','item_id','model_id'].every(k=>r.cursor[k]===q.cursor[k]))&&r.items.length<=q.limit&&(q.expected_revision===null||q.expected_revision===r.run.revision)&&['order_hash','item_id','model_id'].every(k=>r.selection[k]===q[k]);return q.operation==='capabilities'?r.schema==='financial_source_capabilities_v1':r.schema===(q.schema==='financial_source_request_v2'?'financial_source_evidence_v2':'financial_source_evidence_v1')&&r.run.run_id===q.run_id&&r.cursor===q.cursor&&r.facts.length<=q.limit&&(q.expected_revision===null||q.expected_revision===r.run.revision);}
 return Object.freeze({projectRequest:request,projectResponse:response,responseMatches:matches});
}
export const projectFinancialSourceRequest=v=>createFinancialSourceProtocol().projectRequest(v);
export const projectFinancialSourceResponse=v=>createFinancialSourceProtocol().projectResponse(v);
export const financialSourceResponseMatches=(q,r)=>createFinancialSourceProtocol().responseMatches(q,r);
