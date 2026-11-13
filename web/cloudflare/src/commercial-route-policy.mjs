import {roleAllowedCapabilities} from './account-policy.mjs';

// This is an allowlist of the existing operational router, not a prefix grant.
// Account/company/store APIs have their own policy and do not enter this router.
// Existing closed DTOs with several domains require every listed permission;
// they are withheld until an explicitly versioned restricted DTO is available.
const entries=[
 ['workspace/prepare','POST','store.read'],
 ['release-info','GET','store.read'],['diagnostics','GET','store.read'],['bootstrap','GET','store.read'],
 ['reports/weekly','GET','reports.read','finance.read','bank.read','costs.read'],
 ['agents/learning','GET','finance.read'],
 // The saved creative workspace is a closed composite: product unit costs,
 // affiliate contribution and imported sales/ad performance are retained in it.
 ['ai-sales/workspace','GET','catalog.read','finance.read','costs.read','ads.read'],['ai-sales/workspace','POST','catalog.write','finance.read','costs.read','ads.read'],
 ['order-operations','GET','orders.read'],['order-operations','POST','orders.write'],
 ['production','GET','dtf.read'],
 ['production/settings','POST','dtf.write'],['production/sync','POST','dtf.write'],['production/batches','POST','dtf.write'],['production/batches/action','POST','dtf.write'],
 ['production/coverage','GET','production.read','costs.read'],['production/coverage','POST','production.write','costs.read'],
 ['production/weekly-closing','GET','production.read','costs.read'],['production/weekly-closing','POST','production.write','costs.read'],
 ['production/proposal','GET','production.read','costs.read'],
 ['production/incurred','GET','production.read','costs.read'],['production/incurred','POST','production.write','costs.read'],
 ['returns/manufacturing-links','GET','returns.read','production.read','costs.read'],['returns/manufacturing-links','POST','returns.write','production.read','costs.read'],
 ['returns/receipts','GET','returns.read','finance.read','costs.read'],['returns/receipts','POST','returns.write','finance.read','costs.read'],
 ['returns/physical','GET','returns.read'],['returns/physical','POST','returns.write'],
 ['production-costs','GET','costs.read'],['production-costs','POST','costs.write'],
 ['production-costs/audit','GET','costs.read'],
 // Despite its legacy GET method this applies operator cost corrections.
 ['production-costs/confirmed-references','GET','costs.write'],
 ['cost-rules','GET','costs.read'],['cost-rules','POST','costs.write'],['cost-rules/sync','POST','costs.write'],['cost-rules/assignments','POST','costs.write'],
 ['variant-bindings','GET','costs.read'],['variant-bindings','POST','costs.write'],['variant-bindings/audit','GET','costs.read'],['variant-bindings/sync','POST','costs.write'],['variant-bindings/automate','POST','costs.write'],
 ['tax-policy','GET','finance.read'],['tax-policy','POST','finance.write'],['tax-policy/audit','GET','finance.read'],
 ['product-registry','GET','catalog.read'],['product-registry/sync','POST','catalog.write'],
 ['catalog-classification','GET','catalog.read','costs.read'],['catalog-classification/sync','POST','catalog.write','costs.read'],['catalog-classification/enqueue','POST','catalog.write','costs.read'],
 ['order-items','GET','orders.read','costs.read'],
 ['order-observations','GET','orders.read','costs.read'],['order-observations','POST','orders.write','costs.read'],
 // The daily shop summary includes monetary sales; the operational board above
 // has a distinct orders-only DTO and permission.
 ['shop-orders','GET','orders.read','finance.read'],['ads-today','GET','ads.read'],
 ['live','GET','finance.read'],['state','GET','finance.read'],['settings','POST','finance.write'],
 ['jobs','GET','finance.read'],['jobs','POST','finance.write'],['jobs/cost','POST','finance.write'],['audit','GET','audit.read','finance.read'],
 ['finance/expense-ledger','GET','finance.read'],['finance/expense-ledger','POST','finance.write'],
 ['finance/business-month-ads-state','GET','finance.read'],['finance/cost-diagnostics','GET','finance.read','costs.read'],['finance/cost-recovery','POST','costs.write','finance.read'],
 ['finance/escrow-release-coverage','GET','finance.read'],['finance/escrow-releases','GET','finance.read'],['finance/income-overview','GET','finance.read'],['finance/income-detail','GET','finance.read'],
 ['finance/closeout','GET','finance.read'],['finance/reconciliation','GET','finance.read'],
 ['finance/business-month-view','GET','finance.read'],['finance/business-month','GET','finance.read'],['finance/business-month-request','POST','finance.write'],
 ['finance/checkpoints','GET','finance.read'],['finance/sync-state','GET','finance.read'],['finance/sync-policy','POST','finance.write'],
 ['finance/payment-preview','POST','finance.read'],['finance/payment-sample','POST','finance.read'],
 ['finance/store-adjustments','POST','finance.write'],['finance/ads-period','POST','finance.write'],
 ['finance/external-cash','GET','bank.read'],
];
const routes=new Map(entries.map(([suffix,method,...capabilities])=>[method+' /api/admin/'+suffix,Object.freeze(capabilities)]));
const operationRoutes=Object.freeze({
 '/api/admin/finance/business-month':{field:'operation',read:['read'],write:['start','step','ads','expenses'],readCapability:'finance.read',writeCapability:'finance.write',maximum:512},
 '/api/admin/finance/store-period':{field:'operation',read:['read'],write:['start','step'],readCapability:'finance.read',writeCapability:'finance.write',maximum:16384},
 '/api/admin/production-costs/periods':{field:'operation',read:['read'],write:['start','step'],readCapability:'costs.read',writeCapability:'costs.write',maximum:256},
 '/api/admin/finance/external-cash':{field:'operation',read:['preview'],write:['import','match','unlink'],readCapability:'bank.read',writeCapability:'bank.write',maximum:1048576},
});
export const COMMERCIAL_OPERATIONAL_ROUTES=Object.freeze([...new Set([...entries.map(([path])=>'/api/admin/'+path),...Object.keys(operationRoutes),'/api/admin/production-costs/periods'])].sort());
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';

async function selector(request,definition){
 // Read a bounded clone: authorization cannot consume or replace the body
 // subsequently validated by the domain router. No capability comes from it.
 let reader;
 try{
  if(!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(request.headers.get('content-type')??''))return null;
  const length=request.headers.get('content-length');if(length!==null&&(!/^(0|[1-9][0-9]*)$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)>definition.maximum))return null;
  const clone=request.clone();if(!clone.body)return null;reader=clone.body.getReader();const chunks=[];let total=0;
  for(;;){const row=await reader.read();if(row.done)break;if(!(row.value instanceof Uint8Array))return null;total+=row.value.byteLength;if(total>definition.maximum)return null;chunks.push(row.value);}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(body===null||typeof body!=='object'||Array.isArray(body))return null;
  const value=Object.getOwnPropertyDescriptor(body,definition.field)?.value;
  if(definition.read.includes(value))return {capability:definition.readCapability,mutating:false};
  if(definition.write.includes(value))return {capability:definition.writeCapability,mutating:true};return null;
 }catch{return null;}finally{try{void reader?.cancel()?.catch(()=>{});reader?.releaseLock();}catch{}}
}

export async function commercialRoutePolicy(request,path){
 try{
  if(!(request instanceof Request))return null;const url=new URL(request.url);if(path===undefined)path=url.pathname;
  if(typeof path!=='string'||path!==url.pathname||!path.startsWith('/api/admin/')||!['GET','POST'].includes(request.method))return null;
  let required=routes.get(request.method+' '+path),mutating=request.method==='POST';
  if(request.method==='POST'&&Object.hasOwn(operationRoutes,path)){const selected=await selector(request,operationRoutes[path]);if(!selected)return null;required=[selected.capability];mutating=selected.mutating;}
  if(path==='/api/admin/production-costs/periods'&&request.method==='GET')required=['costs.read'];
  if(request.method==='GET'&&/^\/api\/admin\/order-observations\/[a-f0-9]{64}$/.test(path))required=['orders.read','costs.read'];
  if(request.method==='GET'&&new RegExp('^/api/admin/jobs/'+uuid+'/financial-context$').test(path))required=['finance.read'];
  if(!required)return null;
  if(path==='/api/admin/returns/physical'&&request.method==='GET'&&url.searchParams.has('evidence'))required=[...required,'finance.read'];
  if(path==='/api/admin/product-registry'&&request.method==='GET'&&url.searchParams.has('item_id'))required=[...required,'costs.read'];
  if(path==='/api/admin/production-costs/confirmed-references')mutating=true;
  const capabilities=Object.freeze([...new Set(required)]);return Object.freeze({capability:capabilities[0],capabilities,mutating});
 }catch{return null;}
}
export async function commercialRouteCapabilities(request,path){return (await commercialRoutePolicy(request,path))?.capabilities??null;}
export async function commercialRouteCapability(request,path){return (await commercialRoutePolicy(request,path))?.capability??null;}

function resolvedCapabilities(principal){
 try{
  if(principal?.kind!=='account'||principal.active===false||principal.status&&principal.status!=='ACTIVE'||!Array.isArray(principal.capabilities))return null;
  const allowed=roleAllowedCapabilities(principal.role);if(!allowed.length||principal.capabilities.some(value=>typeof value!=='string'||!allowed.includes(value)))return null;
  return new Set(principal.capabilities);
 }catch{return null;}
}
export function commercialCapabilitiesAllowed(principal,required){
 const grants=resolvedCapabilities(principal);return grants!==null&&Array.isArray(required)&&required.length>0&&required.every(value=>typeof value==='string'&&grants.has(value));
}
export async function commercialRouteAllowed(principal,request,path){const required=await commercialRouteCapabilities(request,path);return required!==null&&commercialCapabilitiesAllowed(principal,required);}

const tabs=Object.freeze({
 // The shell is available to every store member. Its financial widgets still
 // use their individual API permissions and must not fetch without them.
 overview:['store.read'],agents:['store.read'],hermes:['finance.read'],'agent-hermes':['finance.read'],
 'weekly-report':['reports.read','finance.read','bank.read','costs.read'],reports:['reports.read','finance.read','bank.read','costs.read'],
 'order-operations':['orders.read'],orders:['orders.read'],
 production:['dtf.read'],'agent-production':['production.read','dtf.read','costs.read'],
 products:['catalog.read','costs.read'],'agent-products':['catalog.read','costs.read','finance.read'],
 margins:['costs.read'],costs:['costs.read'],
 'agent-finance':['finance.read','bank.read'],finance:['finance.read','bank.read'],
 'agent-ads':['ads.read'],ads:['ads.read'],
 'agent-returns':['returns.read','finance.read','costs.read'],returns:['returns.read','finance.read','costs.read'],
 'agent-auditor':['audit.read','finance.read'],history:['audit.read','finance.read','costs.read'],'ai-sales':['catalog.read','finance.read','costs.read','ads.read'],
 roadmap:['store.read'],
});
export function commercialTabAllowed(principal,tab){
 // This exemption does not authorize a legacy request: its existing owner /
 // review router remains responsible. A commercial role never takes it.
 if(principal?.kind!=='account')return principal!==null&&typeof principal==='object'&&(!principal.kind||principal.kind==='legacy')&&['owner','review'].includes(principal.role);
 return typeof tab==='string'&&Object.hasOwn(tabs,tab)&&commercialCapabilitiesAllowed(principal,tabs[tab]);
}
export function commercialAllowedTabs(principal){return Object.freeze(Object.keys(tabs).filter(tab=>commercialTabAllowed(principal,tab)));}
