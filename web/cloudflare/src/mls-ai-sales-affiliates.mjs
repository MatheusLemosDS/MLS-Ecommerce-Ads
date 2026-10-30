import {validateAiSalesCreator,validateAiSalesCollaboration,validateAiSalesProductSnapshot,validateAiSalesEvidence,validateAiSalesActionAudit,readAiSalesRecord,readAiSalesList,canonicalAiSalesJson,hashAiSalesValue} from './mls-ai-sales-contracts.mjs';
import {evaluateAiSalesProfitability} from './mls-ai-sales-profitability-gate.mjs';
import {parseAiSalesCsv,exportAiSalesCsv,parseAiSalesJson,parseAiSalesInteger} from './mls-ai-sales-imports.mjs';

/** Local assisted CRM. No provider, storage, messages or commercial writes. */
export class AiSalesAffiliateError extends Error{constructor(code){super(code);this.code=code;}}
const aiAffiliateFail=code=>{throw new AiSalesAffiliateError(code);};
const aiAffiliateClone=value=>JSON.parse(JSON.stringify(value));
const aiAffiliateFreeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(aiAffiliateFreeze);Object.freeze(value);}return value;};
const aiAffiliateTime=at=>{if(!Number.isSafeInteger(at)||at<=0||at>4102444800)aiAffiliateFail('AI_SALES_AFFILIATE_TIME_INVALID');return at;};
const aiAffiliateRef=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value);
const aiAffiliateCreatorKey=creator=>canonicalAiSalesJson([creator.provider,creator.shop_ref,creator.internal_creator_id]);
const aiAffiliateEvidence=raw=>raw===null?null:validateAiSalesEvidence(raw);
const aiAffiliateDeclared=raw=>raw===null?null:{...aiAffiliateClone(raw),source:'OPERATOR_IMPORTED',status:raw.status==='UNKNOWN'?'UNKNOWN':'DECLARED'};
const aiAffiliateCreatorKeys=['schema','internal_creator_id','provider','shop_ref','approved_handle','consent_evidence','seller_creator_access_grant_status','channel_fit','last_contact_at','status'];
export const AI_SALES_AFFILIATE_CREATOR_CSV_HEADERS=Object.freeze([...aiAffiliateCreatorKeys]);

export function createAiSalesAffiliateWorkspace(){return aiAffiliateFreeze({schema:'mls_ai_sales_affiliate_workspace_v1',revision:0,creators:[],plans:[],audit:[],last_updated_at:null,commercial_writes:false});}
export function validateAiSalesAffiliateWorkspace(raw){
 readAiSalesRecord(raw,['schema','revision','creators','plans','audit','last_updated_at','commercial_writes'],'AI_SALES_AFFILIATE_WORKSPACE_INVALID');
 if(raw.schema!=='mls_ai_sales_affiliate_workspace_v1'||!Number.isSafeInteger(raw.revision)||raw.revision<0||raw.revision>2147483647||raw.commercial_writes!==false)aiAffiliateFail('AI_SALES_AFFILIATE_WORKSPACE_INVALID');
 if(raw.last_updated_at!==null)aiAffiliateTime(raw.last_updated_at);
 const creators=readAiSalesList(raw.creators,500).map(validateAiSalesCreator),plans=readAiSalesList(raw.plans,500).map(entry=>{
  readAiSalesRecord(entry,['collaboration','gate','proposal','draft_hash','created_at','updated_at'],'AI_SALES_AFFILIATE_PLAN_INVALID');
  const collaboration=validateAiSalesCollaboration(entry.collaboration);aiAffiliateTime(entry.created_at);aiAffiliateTime(entry.updated_at);
  if(entry.updated_at<entry.created_at||typeof entry.draft_hash!=='string'||!/^[a-f0-9]{64}$/.test(entry.draft_hash))aiAffiliateFail('AI_SALES_AFFILIATE_PLAN_INVALID');
  readAiSalesRecord(entry.gate,['status','blocked_reasons','contribution_cents','commercial_writes'],'AI_SALES_AFFILIATE_GATE_INVALID');
  const reasons=readAiSalesList(entry.gate.blocked_reasons,40);
  if(!['READY','BLOCKED'].includes(entry.gate.status)||entry.gate.commercial_writes!==false||reasons.some(v=>typeof v!=='string'||!/^[A-Z][A-Z0-9_]{0,99}$/.test(v))||entry.gate.contribution_cents!==null&&!Number.isSafeInteger(entry.gate.contribution_cents)||entry.gate.status==='READY'&&reasons.length)aiAffiliateFail('AI_SALES_AFFILIATE_GATE_INVALID');
  readAiSalesRecord(entry.proposal,['product','commission_evidence','extra_cost_cents','extra_cost_evidence','returns_evidence'],'AI_SALES_AFFILIATE_PROPOSAL_INVALID');
  const product=validateAiSalesProductSnapshot(entry.proposal.product);
  if(product.product_key!==collaboration.product_ref||product.marketplace!==collaboration.provider||product.shop_ref!==collaboration.shop_ref)aiAffiliateFail('AI_SALES_AFFILIATE_SCOPE_MISMATCH');
  if(entry.proposal.extra_cost_cents!==null&&(!Number.isSafeInteger(entry.proposal.extra_cost_cents)||entry.proposal.extra_cost_cents<0))aiAffiliateFail('AI_SALES_AFFILIATE_PROPOSAL_INVALID');
  for(const key of ['commission_evidence','extra_cost_evidence','returns_evidence'])aiAffiliateEvidence(entry.proposal[key]);
  return {...aiAffiliateClone(entry),collaboration,proposal:{...aiAffiliateClone(entry.proposal),product}};
 });
 const audit=readAiSalesList(raw.audit,1000).map(validateAiSalesActionAudit);
 if(new Set(creators.map(aiAffiliateCreatorKey)).size!==creators.length||new Set(plans.map(p=>p.collaboration.plan_id)).size!==plans.length)aiAffiliateFail('AI_SALES_AFFILIATE_DUPLICATE_ID');
 if(new Set(creators.map(c=>canonicalAiSalesJson([c.provider,c.shop_ref,c.approved_handle.replace(/^@/,'').toLowerCase()]))).size!==creators.length)aiAffiliateFail('AI_SALES_AFFILIATE_HANDLE_DUPLICATE');
 for(const entry of plans)if(!creators.some(c=>c.provider===entry.collaboration.provider&&c.shop_ref===entry.collaboration.shop_ref&&c.internal_creator_id===entry.collaboration.creator_ref))aiAffiliateFail('AI_SALES_AFFILIATE_CREATOR_MISSING');
 return aiAffiliateFreeze({...aiAffiliateClone(raw),creators,plans,audit});
}
function aiAffiliateNext(state,patch,at){
 aiAffiliateTime(at);if(state.last_updated_at!==null&&at<state.last_updated_at)aiAffiliateFail('AI_SALES_AFFILIATE_CLOCK_REVERSED');
 return validateAiSalesAffiliateWorkspace({...aiAffiliateClone(state),...patch,revision:state.revision+1,last_updated_at:at});
}
function aiAffiliateRevoke(entry,code,at){return {...aiAffiliateClone(entry),collaboration:{...aiAffiliateClone(entry.collaboration),status:'BLOCKED',owner_approval_id:null,margin_evidence:null},gate:{status:'BLOCKED',blocked_reasons:[code],contribution_cents:null,commercial_writes:false},updated_at:at};}
export function upsertAiSalesAffiliateCreator(current,raw,{at}={}){
 const state=validateAiSalesAffiliateWorkspace(current),creator=validateAiSalesCreator(raw);aiAffiliateTime(at);
 if(creator.last_contact_at!==null&&creator.last_contact_at>at||creator.consent_evidence!==null&&creator.consent_evidence.observed_at>at)aiAffiliateFail('AI_SALES_AFFILIATE_FUTURE_EVIDENCE');
 const key=aiAffiliateCreatorKey(creator),existing=state.creators.find(c=>aiAffiliateCreatorKey(c)===key);
 if(existing&&canonicalAiSalesJson(existing)===canonicalAiSalesJson(creator))return state;
 const duplicate=state.creators.find(c=>c.provider===creator.provider&&c.shop_ref===creator.shop_ref&&c.approved_handle.replace(/^@/,'').toLowerCase()===creator.approved_handle.replace(/^@/,'').toLowerCase()&&aiAffiliateCreatorKey(c)!==key);
 if(duplicate)aiAffiliateFail('AI_SALES_AFFILIATE_HANDLE_DUPLICATE');
 const creators=existing?state.creators.map(c=>aiAffiliateCreatorKey(c)===key?creator:c):[...state.creators,creator];
 const plans=state.plans.map(entry=>entry.collaboration.creator_ref===creator.internal_creator_id&&entry.collaboration.provider===creator.provider&&entry.collaboration.shop_ref===creator.shop_ref?aiAffiliateRevoke(entry,'CREATOR_CHANGED_RECHECK_REQUIRED',at):entry);
 return aiAffiliateNext(state,{creators,plans},at);
}
export function removeAiSalesAffiliateCreator(current,selection,{at}={}){
 const state=validateAiSalesAffiliateWorkspace(current);readAiSalesRecord(selection,['provider','shop_ref','internal_creator_id']);
 if(!['SHOPEE_BR','TIKTOK_SHOP_BR'].includes(selection.provider)||!aiAffiliateRef(selection.shop_ref)||!aiAffiliateRef(selection.internal_creator_id))aiAffiliateFail('AI_SALES_AFFILIATE_SELECTION_INVALID');
 const key=aiAffiliateCreatorKey(selection),creator=state.creators.find(c=>aiAffiliateCreatorKey(c)===key);if(!creator)return state;
 return aiAffiliateNext(state,{creators:state.creators.filter(c=>aiAffiliateCreatorKey(c)!==key),plans:state.plans.filter(entry=>!(entry.collaboration.provider===creator.provider&&entry.collaboration.shop_ref===creator.shop_ref&&entry.collaboration.creator_ref===creator.internal_creator_id))},at);
}
function aiAffiliateGate(product,creator,input,at){
 const economic=evaluateAiSalesProfitability({product,commission_rate_bps:input.commission_rate_bps,commission_evidence:input.commission_evidence,extra_cost_cents:input.extra_cost_cents,extra_cost_evidence:input.extra_cost_evidence,at});
 const reasons=[...economic.blocked_reasons];
 if(!creator.consent_evidence||creator.consent_evidence.status==='UNKNOWN'||!['ELIGIBLE','CONTACTED','RESPONDED'].includes(creator.status))reasons.push('CREATOR_CONSENT_OR_ELIGIBILITY_MISSING');
 const returns=aiAffiliateEvidence(input.returns_evidence);
 if(!returns||returns.status!=='VERIFIED')reasons.push('RETURNS_EXPOSURE_UNVERIFIED');
 else{if(returns.marketplace!==product.marketplace||returns.shop_ref!==product.shop_ref||returns.currency!==product.currency)reasons.push('RETURNS_EVIDENCE_SCOPE_MISMATCH');if(returns.basis!=='RECONCILED_ZERO_RETURN_EXPOSURE')reasons.push('RETURNS_EXPOSURE_NOT_RECONCILED');if(returns.observed_at>at||at-returns.observed_at>86400)reasons.push('RETURNS_EVIDENCE_STALE');}
 return aiAffiliateFreeze({status:reasons.length?'BLOCKED':'READY',blocked_reasons:[...new Set(reasons)].sort(),contribution_cents:economic.contribution_cents,commercial_writes:false});
}
export async function draftAiSalesAffiliateProposal(current,request){
 const state=validateAiSalesAffiliateWorkspace(current);readAiSalesRecord(request,['plan_id','creator_ref','product','commission_rate_bps','commission_evidence','extra_cost_cents','extra_cost_evidence','returns_evidence','at']);
 const product=validateAiSalesProductSnapshot(request.product),at=aiAffiliateTime(request.at);
 if(!aiAffiliateRef(request.plan_id)||!aiAffiliateRef(request.creator_ref))aiAffiliateFail('AI_SALES_AFFILIATE_PROPOSAL_INVALID');
 const creator=state.creators.find(c=>c.provider===product.marketplace&&c.shop_ref===product.shop_ref&&c.internal_creator_id===request.creator_ref);if(!creator)aiAffiliateFail('AI_SALES_AFFILIATE_CREATOR_MISSING');
 const gate=aiAffiliateGate(product,creator,request,at),proposal={product,commission_evidence:aiAffiliateEvidence(request.commission_evidence),extra_cost_cents:request.extra_cost_cents,extra_cost_evidence:aiAffiliateEvidence(request.extra_cost_evidence),returns_evidence:aiAffiliateEvidence(request.returns_evidence)};
 const draft_hash=await hashAiSalesValue({plan_id:request.plan_id,creator,proposal,commission_rate_bps:request.commission_rate_bps});
 const prior=state.plans.find(entry=>entry.collaboration.plan_id===request.plan_id);
 if(prior&&prior.draft_hash===draft_hash)return state;
 // Exposure includes production, provider fees, proposed commission and extra
 // costs. A partial production subtotal must not masquerade as total exposure.
 const exposure=product.price_cents===null||gate.contribution_cents===null?null:BigInt(product.price_cents)-BigInt(gate.contribution_cents);
 const collaboration=validateAiSalesCollaboration({schema:'mls_ai_sales_collaboration_v1',plan_id:request.plan_id,provider:product.marketplace,shop_ref:product.shop_ref,creator_ref:creator.internal_creator_id,product_ref:product.product_key,commission_rate_bps:request.commission_rate_bps,money_exposure_cents:exposure!==null&&exposure>=0n&&exposure<=BigInt(Number.MAX_SAFE_INTEGER)?Number(exposure):null,margin_evidence:null,status:gate.status==='READY'?'DRAFT':'BLOCKED',provider_id:null,owner_approval_id:null,idempotency_key:draft_hash,commercial_writes:false});
 const entry={collaboration,gate,proposal,draft_hash,created_at:prior?.created_at??at,updated_at:at};
 const audit=validateAiSalesActionAudit({schema:'mls_ai_sales_action_audit_v1',actor:'OWNER',verb:'DRAFT_AFFILIATE_PROPOSAL',target:request.plan_id,draft_hash,decision:gate.status==='READY'?'DRAFT':'BLOCKED',gate_result:gate.blocked_reasons,approved_at:null,executed_at:null,provider_result_status:'NOT_EXECUTED',redacted_evidence_ids:[]});
 return aiAffiliateNext(state,{plans:prior?state.plans.map(p=>p.collaboration.plan_id===request.plan_id?entry:p):[...state.plans,entry],audit:[...state.audit,audit].slice(-1000)},at);
}
export async function approveAiSalesAffiliateProposal(current,request){
 const state=validateAiSalesAffiliateWorkspace(current);readAiSalesRecord(request,['plan_id','product','approval_id','at']);const at=aiAffiliateTime(request.at);
 if(!aiAffiliateRef(request.approval_id))aiAffiliateFail('AI_SALES_AFFILIATE_APPROVAL_INVALID');
 const entry=state.plans.find(p=>p.collaboration.plan_id===request.plan_id);if(!entry)aiAffiliateFail('AI_SALES_AFFILIATE_PROPOSAL_MISSING');
 const product=validateAiSalesProductSnapshot(request.product),creator=state.creators.find(c=>c.provider===entry.collaboration.provider&&c.shop_ref===entry.collaboration.shop_ref&&c.internal_creator_id===entry.collaboration.creator_ref);
 if(canonicalAiSalesJson(product)!==canonicalAiSalesJson(entry.proposal.product))aiAffiliateFail('AI_SALES_AFFILIATE_PRODUCT_CHANGED');
 const hash=await hashAiSalesValue({plan_id:request.plan_id,creator,proposal:entry.proposal,commission_rate_bps:entry.collaboration.commission_rate_bps});
 if(hash!==entry.draft_hash)aiAffiliateFail('AI_SALES_AFFILIATE_DRAFT_CHANGED');
 const gate=aiAffiliateGate(product,creator,{...entry.proposal,commission_rate_bps:entry.collaboration.commission_rate_bps},at);
 if(gate.status!=='READY')return aiAffiliateNext(state,{plans:state.plans.map(p=>p===entry?aiAffiliateRevoke({...entry,gate},'APPROVAL_RECHECK_BLOCKED',at):p)},at);
 if(entry.collaboration.status==='APPROVED'&&entry.collaboration.owner_approval_id===request.approval_id)return state;
 const evidence={...entry.proposal.commission_evidence,source:'LOCAL_VERIFIED_MARGIN',reference:'proposal-'+entry.collaboration.plan_id,observed_at:at,status:'VERIFIED'};
 const collaboration=validateAiSalesCollaboration({...aiAffiliateClone(entry.collaboration),status:'APPROVED',owner_approval_id:request.approval_id,margin_evidence:evidence});
 const audit=validateAiSalesActionAudit({schema:'mls_ai_sales_action_audit_v1',actor:'OWNER',verb:'APPROVE_LOCAL_AFFILIATE_PROPOSAL',target:request.plan_id,draft_hash:entry.draft_hash,decision:'APPROVED',gate_result:[],approved_at:at,executed_at:null,provider_result_status:'NOT_EXECUTED',redacted_evidence_ids:[]});
 return aiAffiliateNext(state,{plans:state.plans.map(p=>p===entry?{...entry,collaboration,gate,updated_at:at}:p),audit:[...state.audit,audit].slice(-1000)},at);
}
export function exportAiSalesAffiliateWorkspace(current){return JSON.stringify(validateAiSalesAffiliateWorkspace(current),null,2)+'\n';}
function aiAffiliateImportCreator(raw,at){
 const creator=validateAiSalesCreator(raw);if(creator.last_contact_at!==null&&creator.last_contact_at>at||creator.consent_evidence!==null&&creator.consent_evidence.observed_at>at)aiAffiliateFail('AI_SALES_AFFILIATE_FUTURE_EVIDENCE');
 return validateAiSalesCreator({...aiAffiliateClone(creator),consent_evidence:aiAffiliateDeclared(creator.consent_evidence),seller_creator_access_grant_status:'UNKNOWN'});
}
export function importAiSalesAffiliateWorkspace(text,{imported_at}={}){
 aiAffiliateTime(imported_at);const state=validateAiSalesAffiliateWorkspace(parseAiSalesJson(text));if(state.last_updated_at!==null&&state.last_updated_at>imported_at)aiAffiliateFail('AI_SALES_AFFILIATE_FUTURE_EVIDENCE');
 const creators=state.creators.map(c=>aiAffiliateImportCreator(c,imported_at));
 const plans=state.plans.map(entry=>{
  const product={...aiAffiliateClone(entry.proposal.product),verified_product_attributes:[],observations:entry.proposal.product.observations.map(row=>({...aiAffiliateClone(row),evidence:aiAffiliateDeclared(row.evidence)}))};
  const proposal={...aiAffiliateClone(entry.proposal),product,commission_evidence:aiAffiliateDeclared(entry.proposal.commission_evidence),extra_cost_evidence:aiAffiliateDeclared(entry.proposal.extra_cost_evidence),returns_evidence:aiAffiliateDeclared(entry.proposal.returns_evidence)};
  return {...aiAffiliateRevoke(entry,'IMPORTED_PROPOSAL_RECHECK_REQUIRED',imported_at),proposal};
 });
 return validateAiSalesAffiliateWorkspace({...aiAffiliateClone(state),creators,plans,audit:[],revision:state.revision+1,last_updated_at:imported_at});
}
export function exportAiSalesAffiliateCreators(current,{format='csv'}={}){
 const state=validateAiSalesAffiliateWorkspace(current);if(format==='json')return JSON.stringify({schema:'mls_ai_sales_affiliate_creators_v1',creators:state.creators},null,2)+'\n';
 if(format!=='csv')aiAffiliateFail('AI_SALES_AFFILIATE_FORMAT_INVALID');
 return exportAiSalesCsv(state.creators.map(c=>({...aiAffiliateClone(c),consent_evidence:c.consent_evidence===null?'':JSON.stringify(c.consent_evidence),channel_fit:JSON.stringify(c.channel_fit)})),AI_SALES_AFFILIATE_CREATOR_CSV_HEADERS);
}
export function importAiSalesAffiliateCreators(current,text,{format='csv',imported_at}={}){
 let state=validateAiSalesAffiliateWorkspace(current);aiAffiliateTime(imported_at);let raw;
 if(format==='csv')raw=parseAiSalesCsv(text,AI_SALES_AFFILIATE_CREATOR_CSV_HEADERS).map(row=>{let fit,evidence;try{fit=JSON.parse(row.channel_fit);evidence=row.consent_evidence===''?null:JSON.parse(row.consent_evidence);}catch{aiAffiliateFail('AI_SALES_AFFILIATE_CSV_JSON_INVALID');}return {...row,channel_fit:fit,consent_evidence:evidence,last_contact_at:parseAiSalesInteger(row.last_contact_at)};});
 else if(format==='json'){const input=parseAiSalesJson(text);if(input.schema==='mls_ai_sales_affiliate_workspace_v1')raw=validateAiSalesAffiliateWorkspace(input).creators;else{readAiSalesRecord(input,['schema','creators']);if(input.schema!=='mls_ai_sales_affiliate_creators_v1')aiAffiliateFail('AI_SALES_AFFILIATE_IMPORT_INVALID');raw=input.creators;}}
 else aiAffiliateFail('AI_SALES_AFFILIATE_FORMAT_INVALID');
 const creators=readAiSalesList(raw,500).map(c=>aiAffiliateImportCreator(c,imported_at));
 if(new Set(creators.map(aiAffiliateCreatorKey)).size!==creators.length)aiAffiliateFail('AI_SALES_AFFILIATE_DUPLICATE_ID');
 for(const creator of creators)state=upsertAiSalesAffiliateCreator(state,creator,{at:imported_at});return state;
}
