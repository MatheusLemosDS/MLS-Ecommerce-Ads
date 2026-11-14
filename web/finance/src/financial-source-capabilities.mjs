// Capability observations are server evidence, not browser grants or SDK claims.
export class FinancialSourceError extends Error{constructor(code,status=400){super(code);this.name='FinancialSourceError';this.code=code;this.status=status;}}
const fail=(code,status=400)=>{throw new FinancialSourceError('FINANCIAL_SOURCE_'+code,status);};
const plain=v=>v!==null&&typeof v==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const token=(v,max=128)=>typeof v==='string'&&v.length<=max&&/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(v);
export function financialSourceScope(v){if(!plain(v)||Object.keys(v).sort().join(',')!=='account_id,currency,organization_id,store_id'||![v.organization_id,v.store_id,v.account_id].every(x=>token(x))||!/^[A-Z]{3}$/.test(v.currency))fail('SCOPE_INVALID');return {organization_id:v.organization_id,store_id:v.store_id,account_id:v.account_id,currency:v.currency};}
export function financialSourceSameScope(a,b){try{return JSON.stringify(financialSourceScope(a))===JSON.stringify(financialSourceScope(b));}catch{return false;}}
export function financialSourceTimestamp(value,{nullable=false}={}){if(value===null&&nullable)return null;if(typeof value!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value))fail('TIMESTAMP_INVALID');const n=Date.parse(value);if(!Number.isSafeInteger(n)||new Date(n).toISOString().slice(0,19)!==value.slice(0,19))fail('TIMESTAMP_INVALID');return new Date(n).toISOString();}
const definitions=[
 ['ORDERS','/api/v2/order/get_order_list','GET'],['ESCROW','/api/v2/payment/get_escrow_detail','GET'],
 ['INCOME_OVERVIEW','/api/v2/payment/get_income_overview','GET'],['PENDING','/api/v2/payment/get_income_detail','GET'],
 ['RELEASES','/api/v2/payment/get_escrow_list','GET'],['RETURNS','/api/v2/returns/get_return_detail','GET'],
 ['RETURN_DISCOVERY','/api/v2/returns/get_return_list',null],['WALLET','/api/v2/payment/get_wallet_transaction_list',null],
 ['PAYOUTS','/api/v2/payment/get_payout_detail',null],
];
export const FINANCIAL_SOURCE_IDS=Object.freeze(definitions.map(r=>r[0]));
export const FINANCIAL_SOURCE_CANDIDATES=Object.freeze(definitions.map(([source,candidate_path,existing_method])=>Object.freeze({source,candidate_path,existing_method})));
function clock(now){const v=typeof now==='function'?now():now??Date.now();if(!Number.isSafeInteger(v)||v<1)fail('CLOCK_INVALID',503);return new Date(v).toISOString();}
function officialReference(value){if(typeof value!=='string'||value.length>1024)return null;try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='open.shopee.com'&&!u.username&&!u.password&&u.pathname.startsWith('/documents/')?u.origin+u.pathname+u.search:null;}catch{return null;}}
function documentation(v,definition,stamp){
 if(v===undefined||v===null)return {state:'UNKNOWN',reference:null,checked_at:null,method:null,path:null,parameters:[],pagination:null};
 if(!plain(v)||!['CONFIRMED','UNKNOWN','UNAVAILABLE'].includes(v.state))fail('DOCUMENTATION_INVALID');
 const checked_at=v.checked_at===null?null:financialSourceTimestamp(v.checked_at);if(checked_at!==null&&checked_at>stamp)fail('OBSERVATION_IN_FUTURE');
 const reference=officialReference(v.reference),confirmed=v.state==='CONFIRMED';
 if(confirmed&&(!reference||checked_at===null||!['GET','POST'].includes(v.method)||v.path!==definition.candidate_path||!Array.isArray(v.parameters)||v.parameters.length>64||!v.parameters.every(p=>token(p,80))))fail('DOCUMENTATION_UNCONFIRMED');
 let pagination=null;
 if(confirmed&&v.pagination!==null&&v.pagination!==undefined){const p=v.pagination;if(!plain(p)||!['CURSOR','PAGE','SINGLE'].includes(p.kind)||!Number.isSafeInteger(p.maximum_page_size)||p.maximum_page_size<1||p.maximum_page_size>1000||!token(p.terminal_signal,80))fail('PAGINATION_CONTRACT_INVALID');pagination={kind:p.kind,maximum_page_size:p.maximum_page_size,terminal_signal:p.terminal_signal};}
 return {state:v.state,reference,checked_at,method:confirmed?v.method:null,path:confirmed?v.path:null,parameters:confirmed?[...new Set(v.parameters)]:[],pagination};
}
function grant(v,stamp){
 if(v===undefined||v===null)return {state:'UNKNOWN',origin:null,evidence_ref:null,checked_at:null};
 if(!plain(v)||!['CONFIRMED','DENIED','UNSUPPORTED','UNKNOWN'].includes(v.state))fail('GRANT_INVALID');
 const checked_at=v.checked_at===null?null:financialSourceTimestamp(v.checked_at);if(checked_at!==null&&checked_at>stamp)fail('OBSERVATION_IN_FUTURE');
 if(v.state!=='UNKNOWN'&&(v.origin!=='PROVIDER'||!token(v.evidence_ref,128)||checked_at===null))fail('GRANT_EVIDENCE_REQUIRED');
 return {state:v.state,origin:v.state==='UNKNOWN'?null:'PROVIDER',evidence_ref:v.state==='UNKNOWN'?null:v.evidence_ref,checked_at};
}
function coverage(v){
 if(v===undefined||v===null)return {state:'UNKNOWN',start_at:null,end_at:null,complete:false,timezone_confirmed:false};
 if(!plain(v)||!['COMPLETE','PARTIAL','UNKNOWN','UNAVAILABLE','FORBIDDEN'].includes(v.state)||typeof v.complete!=='boolean'||typeof v.timezone_confirmed!=='boolean')fail('COVERAGE_INVALID');
 const start_at=financialSourceTimestamp(v.start_at,{nullable:true}),end_at=financialSourceTimestamp(v.end_at,{nullable:true});
 if(start_at!==null&&end_at!==null&&start_at>=end_at||v.complete&&(v.state!=='COMPLETE'||start_at===null||end_at===null))fail('COVERAGE_INVALID');
 return {state:v.state,start_at,end_at,complete:v.complete,timezone_confirmed:v.timezone_confirmed};
}
export function buildFinancialSourceCapabilities({scope,observations=[],application_ref=null,region=null,now=Date.now}={}){
 const selected=financialSourceScope(scope),stamp=clock(now);
 if(application_ref!==null&&!token(application_ref)||region!==null&&!/^[A-Z]{2}$/.test(region)||!Array.isArray(observations)||observations.length>FINANCIAL_SOURCE_IDS.length)fail('CAPABILITIES_INVALID');
 const seen=new Set(),map=new Map();for(const observation of observations){if(!plain(observation)||!FINANCIAL_SOURCE_IDS.includes(observation.source)||seen.has(observation.source)||!financialSourceSameScope(observation.scope,selected))fail('OBSERVATION_SCOPE_INVALID',403);seen.add(observation.source);map.set(observation.source,observation);}
 const sources=FINANCIAL_SOURCE_CANDIDATES.map(definition=>{
  const o=map.get(definition.source),doc=documentation(o?.documentation,definition,stamp),g=grant(o?.grant,stamp),c=coverage(o?.coverage);
  if(o?.checked_at&&financialSourceTimestamp(o.checked_at)>stamp)fail('OBSERVATION_IN_FUTURE');
  if(o&&(o.currency!==selected.currency||o.application_ref!==application_ref||o.region!==region))fail('OBSERVATION_SCOPE_INVALID',403);
  const contract=doc.state==='CONFIRMED'&&doc.pagination!==null,identity=application_ref!==null&&region!==null;
  const allowed=contract&&identity&&g.state==='CONFIRMED';
  let state='UNKNOWN',reason='CAPABILITY_NOT_VERIFIED';
  if(g.state==='UNSUPPORTED'){state='UNSUPPORTED';reason='PROVIDER_UNSUPPORTED';}
  else if(g.state==='DENIED'){state='NO_PERMISSION';reason='PROVIDER_PERMISSION_DENIED';}
  else if(allowed){state=c.complete&&c.timezone_confirmed?'AVAILABLE':'PARTIAL';reason=c.complete&&c.timezone_confirmed?null:'SOURCE_COVERAGE_NOT_COMPLETE';}
  else if(g.state==='CONFIRMED'||doc.state==='CONFIRMED'){state='PARTIAL';reason=!identity?'APPLICATION_REGION_UNCONFIRMED':!contract?'DOCUMENTATION_CONTRACT_UNCONFIRMED':'PROVIDER_GRANT_UNCONFIRMED';}
  else if(doc.state==='UNAVAILABLE')reason='OFFICIAL_DOCUMENTATION_UNAVAILABLE';
  return {source:definition.source,scope:{...selected},application_ref,region,currency:selected.currency,state,reason,method:doc.method,path:doc.path,candidate_path:definition.candidate_path,existing_transport_method:definition.existing_method,documentation:doc,grant:g,collection_allowed:allowed,coverage:c,checked_at:o?.checked_at?financialSourceTimestamp(o.checked_at):null};
 });
 return {schema:'financial_source_capabilities_v1',scope:selected,application_ref,region,checked_at:stamp,sources};
}
export function assertFinancialSourceCollectionCapability(capability,{scope,source,now=Date.now}={}){
 if(!plain(capability)||!FINANCIAL_SOURCE_IDS.includes(source)||capability.source!==source||!financialSourceSameScope(capability.scope,scope))fail('CAPABILITY_SCOPE_INVALID',403);
 const {sources}=buildFinancialSourceCapabilities({scope,application_ref:capability.application_ref,region:capability.region,observations:[{source,scope,currency:capability.currency,application_ref:capability.application_ref,region:capability.region,documentation:capability.documentation,grant:capability.grant,coverage:capability.coverage,checked_at:capability.checked_at}],now});
 const result=sources.find(r=>r.source===source);if(!result.collection_allowed)fail('CAPABILITY_UNCONFIRMED',409);return result;
}
